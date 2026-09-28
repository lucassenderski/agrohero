import carrinhoRepository from '../repositories/carrinhoRepository.js';
import enderecoRepository from '../repositories/enderecoRepository.js';
import pedidoRepository from '../repositories/pedidoRepository.js';
import { calcularFrete, quantoFaltaParaFreteGratis } from './freteService.js';
import { enviarEmailPedidoConfirmado, enviarEmailNovoPedidoProdutor } from './emailService.js';
import { erros } from '../utils/AppError.js';
import logger from '../config/logger.js';

/*
 * Checkout - a operacao mais critica do sistema.
 *
 * O QUE ESTA EM JOGO: dinheiro do cliente, estoque do produtor e a
 * confianca nos numeros do pedido. Um checkout com bug pode vender
 * estoque inexistente, cobrar valor errado ou deixar o carrinho cheio
 * depois de um pedido criado.
 *
 * AS TRES GARANTIAS DESTE ARQUIVO:
 *
 * 1) O SERVIDOR RECALCULA TUDO. Nenhum valor vem do cliente. O preco
 *    sai de `produtos.preco`, o frete da regra do freteService e os
 *    totais de uma soma feita aqui. O corpo da requisicao carrega
 *    apenas `endereco_id` e `metodo_pagamento` - nenhum numero.
 *
 * 2) O ESTOQUE E RESERVADO NO BANCO, DE FORMA CONDICIONAL. A baixa usa
 *    `UPDATE ... WHERE estoque >= $2`. Quem decide se ha estoque e o
 *    banco, nao uma leitura previa na aplicacao. Dois clientes comprando
 *    o ultimo item ao mesmo tempo: o segundo nao encontra linha para
 *    atualizar e a transacao aborta.
 *
 * 3) TUDO OU NADA. Pedido, itens, baixa de estoque, pagamentos e
 *    limpeza do carrinho rodam numa transacao unica. Qualquer falha
 *    dispara ROLLBACK e o estado fica exatamente como estava.
 *
 * PAGAMENTO NA RETIRADA
 *
 * Nao ha cobranca online. Nenhum gateway e chamado: o pagamento acontece
 * no local da retirada/entrega, em PIX, cartao ou dinheiro, e quem
 * confirma o recebimento e o produtor (rota propria no painel dele).
 *
 * O checkout apenas REGISTRA quanto cada produtor tem a receber, com
 * status PENDENTE. O valor por produtor e o que permite a confirmacao
 * individual: num pedido com itens de dois produtores, cada um confirma
 * (e recebe) so a sua parte - sem isso, um produtor confirmaria o
 * recebimento do produto do outro.
 */

/* Motivo de recusa legivel, para a mensagem nao ser generica. */
function descreverItem(item) {
  return `${item.produto_nome ?? item.nome ?? `produto ${item.produto_id}`}`;
}

/*
 * Revalida o carrinho DENTRO da transacao e devolve os itens com preco
 * atual.
 *
 * Por que revalidar de novo, se o carrinho ja foi validado na FASE 10:
 * entre a validacao e o checkout pode passar tempo (o cliente pensando,
 * outra aba aberta). O preco pode ter mudado e o estoque pode ter ido a
 * zero. Esta e a leitura que vale, porque acontece na mesma transacao
 * que faz a baixa.
 *
 * Usa o `cliente` da transacao de proposito: ler pelo pool pegaria
 * outra conexao, que nao enxerga o estado nao commitado.
 */
async function revalidarItens(cliente, carrinhoId) {
  const linhas = await pedidoRepository.executarCom(
    cliente,
    `SELECT
       ci.produto_id,
       ci.quantidade,
       p.nome,
       p.preco,
       p.estoque,
       p.ativo,
       p.agricultor_id,
       a.nome_fazenda,
       a.cidade  AS agricultor_cidade,
       a.estado  AS agricultor_estado,
       a.ativo   AS agricultor_ativo,
       u.ativo   AS usuario_ativo,
       c.ativo   AS categoria_ativa
     FROM carrinho_itens ci
     JOIN produtos p     ON p.id = ci.produto_id
     JOIN categorias c   ON c.id = p.categoria_id
     JOIN agricultores a ON a.id = p.agricultor_id
     JOIN usuarios u     ON u.id = a.usuario_id
     WHERE ci.carrinho_id = $1
     ORDER BY ci.id`,
    [carrinhoId],
  );

  return linhas;
}

/*
 * Valida os itens revalidados e monta a lista para insercao.
 *
 * Falha com mensagem ESPECIFICA por item - "o produto X esgotou" e
 * muito mais util que "erro no checkout". O cliente precisa saber o que
 * ajustar no carrinho.
 */
function validarEMontarItens(itens) {
  const problemas = [];

  const itensValidos = itens.map((item) => {
    const preco = Number(item.preco);
    const subtotal = Number((preco * item.quantidade).toFixed(2));

    if (!item.ativo) {
      problemas.push(`"${descreverItem(item)}" nao esta mais disponivel para venda.`);
    } else if (!item.agricultor_ativo || !item.usuario_ativo) {
      problemas.push(`"${descreverItem(item)}" e de um produtor que nao esta mais ativo.`);
    } else if (!item.categoria_ativa) {
      problemas.push(`"${descreverItem(item)}" pertence a uma categoria desativada.`);
    } else if (item.estoque < item.quantidade) {
      problemas.push(
        `Estoque insuficiente para "${descreverItem(item)}": voce pediu ${item.quantidade}, ha ${item.estoque}.`,
      );
    }

    return {
      produtoId: item.produto_id,
      agricultorId: item.agricultor_id,
      precoUnitario: preco,
      quantidade: item.quantidade,
      subtotal,
    };
  });

  if (problemas.length > 0) {
    throw erros.regraNegocio(
      'Alguns itens do seu carrinho precisam de atencao.',
      'ITENS_INDISPONIVEIS',
      problemas.map((mensagem) => ({ campo: 'itens', mensagem })),
    );
  }

  return itensValidos;
}

/*
 * Monta o snapshot do endereco de entrega.
 *
 * Guardamos uma COPIA, e nao uma referencia. O cliente pode editar ou
 * apagar o endereco depois, e o pedido de hoje precisa continuar
 * mostrando para onde o produto foi enviado. Um pedido e um documento
 * historico, nao uma view do cadastro atual.
 */
function montarSnapshotEndereco(endereco) {
  return {
    endereco_id: endereco.id,
    nome_destinatario: endereco.nome_destinatario,
    cep: endereco.cep,
    rua: endereco.rua,
    numero: endereco.numero,
    complemento: endereco.complemento,
    bairro: endereco.bairro,
    cidade: endereco.cidade,
    estado: endereco.estado,
  };
}

/*
 * PREVIA DO CHECKOUT - calcula tudo sem gravar nada.
 *
 * Existe para o frontend mostrar "Produtos: R$ X / Frete: R$ Y /
 * Total: R$ Z" antes de o cliente confirmar (requisito 19). Como nao
 * grava, pode ser chamada a cada troca de endereco sem efeito colateral.
 *
 * Usa o MESMO calculo do checkout real (`montarResumo`), entao a previa
 * nao pode divergir do valor cobrado - se divergisse, o cliente veria
 * um numero e pagaria outro.
 */
async function montarResumo(usuario, enderecoId) {
  const carrinho = await carrinhoRepository.obterOuCriar(usuario.id);
  const itensCarrinho = await carrinhoRepository.listarItens(carrinho.id);

  if (itensCarrinho.length === 0) {
    throw erros.regraNegocio('Seu carrinho esta vazio.', 'CARRINHO_VAZIO');
  }

  const endereco = await enderecoRepository.buscarDoConsumidor(usuario.id, enderecoId);

  if (!endereco) {
    throw erros.naoEncontrado('Endereco');
  }

  const valorProdutos = Number(
    itensCarrinho
      .reduce((soma, item) => soma + Number(item.preco) * item.quantidade, 0)
      .toFixed(2),
  );

  const frete = calcularFrete(itensCarrinho, endereco, valorProdutos);
  const valorTotal = Number((valorProdutos + frete.valor).toFixed(2));

  const indisponiveis = itensCarrinho.filter(
    (item) => !item.ativo || item.estoque < item.quantidade,
  );

  return {
    itens: itensCarrinho.map((item) => ({
      produto_id: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      preco_unitario: Number(item.preco),
      subtotal: Number((Number(item.preco) * item.quantidade).toFixed(2)),
      disponivel: item.ativo && item.estoque >= item.quantidade,
      estoque_disponivel: item.estoque,
    })),
    endereco: montarSnapshotEndereco(endereco),
    valor_produtos: valorProdutos,
    valor_frete: frete.valor,
    frete_gratis: frete.gratis,
    frete_motivo: frete.motivo,
    valor_total: valorTotal,
    falta_para_frete_gratis: quantoFaltaParaFreteGratis(valorProdutos),
    pode_finalizar: indisponiveis.length === 0,
    itens_indisponiveis: indisponiveis.length,
  };
}

/*
 * PREVIA PUBLICA: calcula sem gravar, para o frontend exibir.
 *
 * `enderecoId` e opcional. Sem ele, usa o endereco principal do cliente;
 * se tambem nao houver principal, devolve a previa dos produtos com
 * frete estimado pela regra generica, para o frontend nao ficar sem
 * numero nenhum enquanto o cliente ainda nao cadastrou endereco.
 */
export async function previa(usuario, enderecoId) {
  let idEndereco = enderecoId;

  if (!idEndereco) {
    const principal = await enderecoRepository.buscarPrincipal(usuario.id);
    idEndereco = principal?.id ?? null;
  }

  if (!idEndereco) {
    const carrinho = await carrinhoRepository.obterOuCriar(usuario.id);
    const itens = await carrinhoRepository.listarItens(carrinho.id);

    if (itens.length === 0) {
      throw erros.regraNegocio('Seu carrinho esta vazio.', 'CARRINHO_VAZIO');
    }

    const valorProdutos = Number(
      itens.reduce((soma, item) => soma + Number(item.preco) * item.quantidade, 0).toFixed(2),
    );

    /*
     * Sem endereco nao da para decidir "mesma cidade", entao o frete e o
     * valor base. Sinalizamos com `endereco_definido: false` para o
     * frontend pedir o endereco em vez de tratar o numero como final.
     */
    const freteBase = calcularFrete(
      itens,
      { cidade: '__indefinida__', estado: '__' },
      valorProdutos,
    );

    return {
      itens: itens.map((item) => ({
        produto_id: item.id,
        nome: item.nome,
        quantidade: item.quantidade,
        preco_unitario: Number(item.preco),
        subtotal: Number((Number(item.preco) * item.quantidade).toFixed(2)),
        disponivel: item.ativo && item.estoque >= item.quantidade,
        estoque_disponivel: item.estoque,
      })),
      endereco: null,
      endereco_definido: false,
      valor_produtos: valorProdutos,
      valor_frete: freteBase.valor,
      frete_gratis: freteBase.gratis,
      frete_motivo: freteBase.motivo,
      valor_total: Number((valorProdutos + freteBase.valor).toFixed(2)),
      falta_para_frete_gratis: quantoFaltaParaFreteGratis(valorProdutos),
      pode_finalizar: false,
      itens_indisponiveis: itens.filter((i) => !i.ativo || i.estoque < i.quantidade).length,
    };
  }

  const resumo = await montarResumo(usuario, idEndereco);

  return { ...resumo, endereco_definido: true };
}

/*
 * Divide o frete entre os produtores do pedido.
 *
 * POR QUE DIVIDIR: o frete e cobrado uma vez por pedido, mas o pagamento
 * e por produtor, e a soma dos pagamentos TEM de fechar com o total -
 * senao o cliente pagaria um valor na retirada e o pedido mostraria
 * outro. Cada produtor responde pelo frete na proporcao do que vendeu.
 *
 * POR QUE O ULTIMO ABSORVE A SOBRA: dividir valores monetarios em
 * centavos raramente fecha. R$ 10,00 de frete entre tres produtores da
 * R$ 3,3333... cada: arredondar os tres para R$ 3,33 deixa R$ 0,01
 * sobrando. O ultimo produtor recebe o resto (aqui, R$ 3,34), o que
 * garante `soma === frete` sem depender de arredondamento sortudo. A
 * ordem e deterministica (a mesma dos itens), para o mesmo pedido sempre
 * dar a mesma divisao.
 */
function dividirFrete(freteTotal, grupos) {
  const valorProdutos = grupos.reduce((soma, grupo) => soma + grupo.valorProdutos, 0);

  /* Sem frete, ou sem produtos (nao ocorre), nao ha o que dividir. */
  if (valorProdutos <= 0 || freteTotal <= 0) {
    return grupos.map(() => 0);
  }

  const partes = [];
  let acumulado = 0;

  grupos.forEach((grupo, indice) => {
    if (indice === grupos.length - 1) {
      partes.push(Number((freteTotal - acumulado).toFixed(2)));
      return;
    }

    const parte = Number(((freteTotal * grupo.valorProdutos) / valorProdutos).toFixed(2));
    acumulado = Number((acumulado + parte).toFixed(2));
    partes.push(parte);
  });

  return partes;
}

/*
 * Agrupa os itens por produtor, na ordem em que aparecem.
 *
 * A ordem importa: `dividirFrete` usa a posicao do ultimo grupo para
 * absorver a sobra do arredondamento, entao uma ordem instavel daria
 * divisoes diferentes para o mesmo pedido.
 */
function agruparPorAgricultor(itens) {
  const grupos = new Map();

  for (const item of itens) {
    if (!grupos.has(item.agricultorId)) {
      grupos.set(item.agricultorId, { agricultorId: item.agricultorId, valorProdutos: 0 });
    }

    grupos.get(item.agricultorId).valorProdutos = Number(
      (grupos.get(item.agricultorId).valorProdutos + item.subtotal).toFixed(2),
    );
  }

  return [...grupos.values()];
}

/*
 * Envia os avisos de um pedido recem-criado.
 *
 * Duas comunicacoes independentes, cada uma com o SEU publico:
 *
 *   - o consumidor recebe a confirmacao, com o total do pedido dele;
 *   - cada produtor recebe um aviso com APENAS os itens e o valor dele.
 *
 * Roda fora da transacao e nunca lanca (ver emailService). Uma falha de
 * e-mail e registrada e nao impede a resposta de sucesso: o pedido ja
 * existe e o produtor ve o item no painel de qualquer forma.
 *
 * Cada envio e isolado: se o e-mail do consumidor falhar, os produtores
 * ainda sao avisados, e vice-versa.
 */
async function notificarPedidoCriado(usuario, pedido, pagamentos) {
  try {
    const porAgricultor = await pedidoRepository.listarProdutoresParaNotificar(pedido.id);
    const pagamentoDoProdutor = new Map(
      pagamentos.map((pagamento) => [pagamento.agricultor_id, pagamento]),
    );

    /*
     * allSettled, e nao all: se o e-mail do produtor A falhar, o do B
     * ainda sai. Cada aviso e independente.
     */
    await Promise.allSettled([
      enviarEmailPedidoConfirmado({
        email: usuario.email,
        pedido: {
          id: pedido.id,
          valor_produtos: Number(pedido.valor_produtos),
          valor_frete: Number(pedido.valor_frete),
          valor_total: Number(pedido.valor_total),
        },
        pagamentos: porAgricultor.map((produtor) => {
          const pagamento = pagamentoDoProdutor.get(produtor.agricultor_id);
          return {
            nome_fazenda: produtor.nome_fazenda,
            valor: pagamento ? Number(pagamento.valor) : 0,
            metodo: pagamento?.metodo ?? '',
          };
        }),
      }),
      ...porAgricultor.map((produtor) => {
        const pagamento = pagamentoDoProdutor.get(produtor.agricultor_id);
        return enviarEmailNovoPedidoProdutor({
          email: produtor.email,
          pedido,
          pagamento: {
            valor: pagamento ? Number(pagamento.valor) : 0,
            metodo: pagamento?.metodo ?? '',
          },
          itens: produtor.itens,
        });
      }),
    ]);
  } catch (erro) {
    /*
     * A notificacao e o ULTIMO passo, depois do commit. Um erro aqui
     * (inclusive na consulta acima) nao pode virar 500: o pedido ja
     * existe, o estoque ja baixou e o dinheiro ja foi combinado. Falhar a
     * resposta por causa de um e-mail faria o cliente reenviar a compra -
     * e comprar duas vezes.
     */
    logger.error({ err: erro, pedidoId: pedido.id }, 'Falha ao notificar pedido criado');
  }
}

/*
 * FINALIZA A COMPRA.
 *
 * Sequencia dentro da transacao:
 *   1. carrega o carrinho do consumidor
 *   2. revalida itens e precos contra o banco (na mesma conexao)
 *   3. valida o endereco de entrega (restrito ao dono)
 *   4. calcula valor dos produtos, frete e total
 *   5. cria o pedido
 *   6. insere os itens (com snapshot de preco e de agricultor)
 *   7. BAIXA O ESTOQUE de forma condicional - aborta se faltar
 *   8. registra o pagamento de CADA produtor (status PENDENTE)
 *   9. esvazia o carrinho
 *  10. COMMIT
 *
 * NAO HA PASSO FORA DA TRANSACAO. A versao anterior chamava o gateway
 * depois do commit, porque a chamada de rede nao podia segurar o lock do
 * estoque. Sem gateway, o pagamento inteiro e banco: cabe na mesma
 * transacao e o checkout fica com uma garantia a mais - ou tudo existe,
 * ou nada existe.
 */
export async function finalizar(usuario, { enderecoId, metodoPagamento }) {
  const resultado = await pedidoRepository.emTransacao(async (cliente) => {
    /* 1. Carrinho do consumidor (criado se nao existir). */
    const carrinho = await carrinhoRepository.obterOuCriar(usuario.id);

    /* 2. Revalida na MESMA conexao da transacao. */
    const itensRevalidados = await revalidarItens(cliente, carrinho.id);

    if (itensRevalidados.length === 0) {
      throw erros.regraNegocio('Seu carrinho esta vazio.', 'CARRINHO_VAZIO');
    }

    const itens = validarEMontarItens(itensRevalidados);

    /* 3. Endereco restrito ao dono - id de outro consumidor nao existe. */
    const endereco = await enderecoRepository.buscarDoConsumidor(usuario.id, enderecoId);

    if (!endereco) {
      throw erros.naoEncontrado('Endereco');
    }

    /* 4. Valores calculados AQUI, a partir do banco. */
    const valorProdutos = Number(
      itens.reduce((soma, item) => soma + item.subtotal, 0).toFixed(2),
    );

    const frete = calcularFrete(itensRevalidados, endereco, valorProdutos);
    const valorTotal = Number((valorProdutos + frete.valor).toFixed(2));

    /* 5. Pedido. */
    const pedido = await pedidoRepository.criar(cliente, {
      consumidorId: usuario.id,
      valorProdutos,
      valorFrete: frete.valor,
      valorTotal,
      enderecoEntrega: montarSnapshotEndereco(endereco),
    });

    /* 6. Itens. */
    const itensInseridos = await pedidoRepository.inserirItens(cliente, pedido.id, itens);

    /*
     * 7. Baixa de estoque. O `WHERE estoque >= quantidade` decide no
     * banco. Se qualquer item nao tiver estoque, lancamos - e o
     * ROLLBACK desfaz pedido, itens e as baixas ja feitas.
     */
    for (const item of itens) {
      const atualizado = await pedidoRepository.baixarEstoque(
        cliente,
        item.produtoId,
        item.quantidade,
      );

      if (!atualizado) {
        const nome = itensRevalidados.find((i) => i.produto_id === item.produtoId)?.nome;
        throw erros.estoqueInsuficiente(nome ?? 'produto');
      }
    }

    /*
     * 8. Pagamento de cada produtor, com status PENDENTE (a receber no
     * local). O frete vai junto, dividido na proporcao do que cada um
     * vendeu, para a soma dos pagamentos fechar com o total do pedido.
     */
    const grupos = agruparPorAgricultor(itens);
    const partesDoFrete = dividirFrete(frete.valor, grupos);

    const pagamentos = [];
    for (const [indice, grupo] of grupos.entries()) {
      const valor = Number((grupo.valorProdutos + partesDoFrete[indice]).toFixed(2));

      pagamentos.push(
        await pedidoRepository.criarPagamento(cliente, {
          pedidoId: pedido.id,
          agricultorId: grupo.agricultorId,
          metodo: metodoPagamento,
          valor,
        }),
      );
    }

    /* 9. Carrinho consumido no MESMO commit do pedido. */
    await pedidoRepository.limparCarrinhoDoConsumidor(cliente, usuario.id);

    return { pedido, itens: itensInseridos, pagamentos, valorTotal, frete };
  });

  const { pedido, pagamentos, valorTotal } = resultado;

  logger.info(
    {
      pedidoId: pedido.id,
      consumidorId: usuario.id,
      valorTotal,
      itens: resultado.itens.length,
      produtores: pagamentos.length,
      metodoPagamento,
    },
    'Pedido criado',
  );

  /*
   * Avisos pos-commit, FORA da transacao.
   *
   * Rodam depois que os dados estao gravados, e de proposito nao
   * bloqueiam a resposta nem podem desfaze-la: `enviar*Email` nunca
   * lanca. O cliente leva aviso de pedido confirmado; cada produtor
   * leva o dele, com os proprios itens e o proprio valor.
   */
  await notificarPedidoCriado(usuario, pedido, pagamentos);

  /*
   * O checkout NAO confirma pagamento nenhum: o dinheiro ainda nao
   * mudou de mao. O status PENDENTE e o estado correto de "a receber na
   * retirada", e quem o muda e o produtor, no painel dele.
   */
  return {
    pedido,
    pagamentos: pagamentos.map((pagamento) => ({
      id: pagamento.id,
      agricultor_id: pagamento.agricultor_id,
      metodo: pagamento.metodo,
      status: pagamento.status,
      valor: Number(pagamento.valor),
    })),
    /*
     * Resumo para o frontend exibir sem recalcular: quanto falta pagar e
     * quantos produtores serao pagos na retirada.
     */
    pagamento_resumo: {
      total: Number(valorTotal),
      a_pagar: Number(valorTotal),
      status: pagamentos.every((p) => p.status === 'PAGO') ? 'PAGO' : 'PENDENTE',
      produtores: pagamentos.length,
      instrucao: 'O pagamento e feito na retirada ou entrega, direto ao produtor.',
    },
    frete: {
      valor: resultado.frete.valor,
      gratis: resultado.frete.gratis,
      motivo: resultado.frete.motivo,
    },
  };
}

export default { previa, finalizar };
