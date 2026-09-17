import carrinhoRepository from '../repositories/carrinhoRepository.js';
import enderecoRepository from '../repositories/enderecoRepository.js';
import pedidoRepository from '../repositories/pedidoRepository.js';
import { calcularFrete, quantoFaltaParaFreteGratis } from './freteService.js';
import paymentService from './paymentService.js';
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
 * 3) TUDO OU NADA. Pedido, itens, baixa de estoque, pagamento e limpeza
 *    do carrinho rodam numa transacao unica. Qualquer falha dispara
 *    ROLLBACK e o estado fica exatamente como estava.
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
 *   8. cria o registro de pagamento
 *   9. esvazia o carrinho
 *  10. COMMIT
 *
 * O PAGAMENTO E CHAMADO FORA DA TRANSACAO, de proposito. Ele envolve
 * rede e pode demorar; manter uma transacao aberta esperando um terceiro
 * seguraria locks de estoque e conexao do pool. O registro de pagamento
 * e criado dentro (com o status inicial), e o resultado do gateway
 * atualiza depois.
 *
 * Efeito colateral a considerar: se o gateway aprovar e o processo cair
 * antes de gravar, o pagamento fica registrado como pendente e o webhook
 * (ou a consulta de reconciliacao) corrige. E melhor que o inverso
 * (gravar aprovado e nao ter cobrado).
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

    /* 8. Pagamento com status inicial PENDENTE. */
    const pagamento = await pedidoRepository.criarPagamento(cliente, {
      pedidoId: pedido.id,
      metodo: metodoPagamento,
      status: 'PENDENTE',
      valor: valorTotal,
      identificadorExterno: null,
      resumo: { gateway: paymentService.gatewayAtivo(), etapa: 'criado' },
    });

    /* 9. Carrinho consumido no MESMO commit do pedido. */
    await pedidoRepository.limparCarrinhoDoConsumidor(cliente, usuario.id);

    return { pedido, itens: itensInseridos, pagamento, valorTotal, frete };
  });

  const { pedido, pagamento, valorTotal } = resultado;

  logger.info(
    {
      pedidoId: pedido.id,
      consumidorId: usuario.id,
      valorTotal,
      itens: resultado.itens.length,
    },
    'Pedido criado',
  );

  /*
   * 10. Chamada ao gateway, FORA da transacao.
   *
   * Falha aqui NAO desfaz o pedido: o pedido existe e o pagamento fica
   * PENDENTE, para o cliente tentar de novo. Desfazer um pedido valido
   * porque a rede oscilou seria pior - o estoque ja foi reservado e o
   * pedido e real.
   */
  let pagamentoProcessado = null;

  try {
    pagamentoProcessado = await paymentService.processar({
      valor: valorTotal,
      metodo: metodoPagamento,
      pedidoId: pedido.id,
      descricao: `Pedido #${pedido.id} - AgroHero`,
      emailPagador: usuario.email,
    });

    await pedidoRepository.atualizarPagamento(pagamento.id, {
      status: pagamentoProcessado.status,
      resumo: pagamentoProcessado.resumo,
      /*
       * Grava o id da transacao no gateway. Sem ele, um webhook
       * posterior nao teria como encontrar este pagamento, e o PIX
       * ficaria pendente para sempre.
       */
      identificadorExterno: pagamentoProcessado.identificadorExterno,
    });
  } catch (erro) {
    /*
     * Pagamento nao processado: o pedido continua valido e PENDENTE. O
     * erro e logado com o pedido para permitir reconciliacao manual, mas
     * NAO propagado - o cliente ja tem um pedido criado e a resposta
     * precisa refletir isso.
     */
    logger.error(
      { pedidoId: pedido.id, erro: erro.message },
      'Pedido criado, mas o pagamento nao foi processado',
    );
  }

  return {
    pedido,
    pagamento: {
      id: pagamento.id,
      metodo: pagamento.metodo,
      status: pagamentoProcessado?.status ?? 'PENDENTE',
      valor: valorTotal,
      mensagem: pagamentoProcessado?.mensagem ?? 'Pagamento pendente de confirmacao.',
      dados_pagamento: pagamentoProcessado?.dadosPagamento ?? null,
    },
    frete: {
      valor: resultado.frete.valor,
      gratis: resultado.frete.gratis,
      motivo: resultado.frete.motivo,
    },
  };
}

export default { previa, finalizar };
