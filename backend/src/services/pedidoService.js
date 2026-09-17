import pedidoRepository from '../repositories/pedidoRepository.js';
import agricultorRepository from '../repositories/agricultorRepository.js';
import { erros } from '../utils/AppError.js';
import logger from '../config/logger.js';
import { lerPaginacao, montarPaginacao } from '../utils/paginacao.js';

/*
 * Regras de negocio dos pedidos (FASE 12).
 *
 * O TEMA CENTRAL AQUI E PROPRIEDADE. Um pedido e um recurso com tres
 * tipos de interessado, e cada um enxerga uma parte diferente:
 *
 *   consumidor   -> o pedido inteiro (e dele), com todos os itens
 *   agricultor   -> APENAS os itens dos produtos dele (requisito 18)
 *   administrador-> tudo
 *
 * A regra multi-agricultor e o ponto mais delicado. Um pedido com
 * tomate do produtor A e morango do produtor B tem UM consumidor, DOIS
 * agricultores e nenhum dono unico. Por isso o status e controlado por
 * ITEM (`pedido_itens.status`), e `pedidos.status` e derivado disso por
 * trigger no banco.
 *
 * O produtor A altera o status dos itens dele e nao toca nos do B. O
 * repositorio garante isso com `WHERE id = $1 AND agricultor_id = $2`:
 * mesmo que A envie o id de um item do B, nenhuma linha e atualizada.
 */

/*
 * TRANSICOES VALIDAS DE STATUS.
 *
 * Fluxo normal:  PENDENTE -> PROCESSANDO -> ENVIADO -> ENTREGUE
 *
 * Cancelamento tem regra propria: so e possivel cancelar item que ainda
 * nao saiu para entrega (PENDENTE ou PROCESSANDO). Cancelar um item ja
 * ENVIADO exigiria logistica reversa, que nao existe nesta versao.
 *
 * Transicoes proibidas de proposito:
 *   - pular etapas (PENDENTE -> ENTREGUE): nao haveria registro de
 *     quando o produto foi despachado;
 *   - voltar atras (ENVIADO -> PROCESSANDO): um pedido que ja saiu nao
 *     "des-sai";
 *   - sair de ENTREGUE: pedido entregue e estado final;
 *   - sair de CANCELADO: cancelado e estado final (para reabrir, o
 *     cliente faz outro pedido).
 */
const TRANSICOES = {
  PENDENTE: ['PROCESSANDO', 'CANCELADO'],
  PROCESSANDO: ['ENVIADO', 'CANCELADO'],
  ENVIADO: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADO: [],
};

/* Status que o agricultor pode aplicar nos proprios itens. */
export const STATUS_DO_AGRICULTOR = ['PROCESSANDO', 'ENVIADO', 'ENTREGUE'];

/*
 * Verifica se a transicao e permitida.
 *
 * A validacao e por PAR (de, para), e nao por uma lista de destinos
 * validos. A diferenca importa: "ENVIADO e um status valido" nao
 * significa "qualquer item pode ir para ENVIADO". O que precisa ser
 * checado e o movimento, e nao o destino.
 */
export function transicaoPermitida(de, para) {
  return (TRANSICOES[de] ?? []).includes(para);
}

/* Mensagem que explica POR QUE a transicao foi recusada. */
function explicarTransicao(de, para) {
  const permitidos = TRANSICOES[de] ?? [];

  if (permitidos.length === 0) {
    return `Um item com status ${de} nao pode mais mudar de status.`;
  }

  return `Nao e possivel mudar de ${de} para ${para}. A partir de ${de}, o status so pode ir para: ${permitidos.join(' ou ')}.`;
}

/* Resolve o agricultor do usuario autenticado. */
async function obterAgricultorDoUsuario(usuario) {
  const agricultor = await agricultorRepository.buscarPorUsuarioId(usuario.id);

  if (!agricultor) {
    throw erros.naoEncontrado('Perfil de agricultor');
  }

  return agricultor;
}

/*
 * LISTA OS PEDIDOS DO CONSUMIDOR.
 *
 * O consumidor enxerga o pedido inteiro, com todos os itens - inclusive
 * os de outros produtores. Isso e correto: o pedido e dele, e ele
 * precisa saber o que comprou. O que ele NAO ve e a gestao interna de
 * cada produtor.
 */
export async function listarDoConsumidor(usuario, filtros) {
  const { pagina, limite, offset } = lerPaginacao(filtros);

  const { itens, total } = await pedidoRepository.listarDoConsumidor(usuario.id, {
    status: filtros.status,
    limite,
    offset,
  });

  /*
   * Carrega os itens de cada pedido. N+1 consultas de proposito: a
   * pagina tem no maximo `limite` pedidos (20 por padrao), e uma query
   * agregada com JSON seria bem menos legivel para um ganho que nao
   * importa nessa escala. Se a pagina crescer, este e o ponto a otimizar.
   */
  const pedidos = await Promise.all(
    itens.map(async (pedido) => ({
      ...pedido,
      itens: await pedidoRepository.listarItens(pedido.id),
    })),
  );

  return { itens: pedidos, paginacao: montarPaginacao({ pagina, limite, total }) };
}

/*
 * DETALHE DE UM PEDIDO, com autorizacao por tipo de usuario.
 *
 * Este e o metodo que impede o acesso indevido a pedido alheio. A regra
 * nao esta no controller nem na rota: esta aqui, porque depende do
 * CONTEUDO do pedido (quais itens sao de quem), e nao so do id.
 *
 *   - consumidor dono: ve tudo
 *   - administrador: ve tudo
 *   - agricultor: ve o pedido, mas apenas os itens dele
 *   - qualquer outro: 404
 */
export async function obter(usuario, pedidoId) {
  const pedido = await pedidoRepository.buscarPorId(pedidoId);

  if (!pedido) {
    throw erros.naoEncontrado('Pedido');
  }

  const itens = await pedidoRepository.listarItens(pedidoId);

  if (usuario.tipo === 'administrador') {
    return {
      ...pedido,
      itens,
      pagamentos: await pedidoRepository.listarPagamentos(pedidoId),
      visao: 'administrador',
    };
  }

  if (usuario.tipo === 'cliente') {
    /*
     * 404, e nao 403, quando o pedido e de outro consumidor. Um 403
     * confirmaria que aquele id existe e e de alguem - informacao que
     * nao precisa sair daqui. Do ponto de vista do cliente que errou o
     * id, "nao encontrado" tambem e a resposta mais precisa.
     */
    if (String(pedido.consumidor_id) !== String(usuario.id)) {
      throw erros.naoEncontrado('Pedido');
    }

    return {
      ...pedido,
      itens,
      pagamentos: await pedidoRepository.listarPagamentos(pedidoId),
      visao: 'consumidor',
    };
  }

  if (usuario.tipo === 'agricultor') {
    const agricultor = await obterAgricultorDoUsuario(usuario);

    const meusItens = itens.filter(
      (item) => String(item.agricultor_id) === String(agricultor.id),
    );

    /*
     * Agricultor que nao tem nenhum item neste pedido recebe 404. Ele
     * nao e parte interessada, e mostrar "voce nao tem permissao"
     * revelaria que o pedido existe.
     */
    if (meusItens.length === 0) {
      throw erros.naoEncontrado('Pedido');
    }

    /*
     * Os valores do pedido (`valor_produtos`, `valor_frete`,
     * `valor_total`) sao o total de TODOS os produtores. Devolve-los ao
     * produtor A daria a ele informacao sobre as vendas do produtor B -
     * quanto o concorrente vendeu no mesmo pedido.
     *
     * Por isso esses campos sao REMOVIDOS, e nao apenas acompanhados de
     * um valor proprio. Enviar os dois seria pior: o frontend teria o
     * numero errado disponivel e bastaria uma tela usar o campo errado
     * para vazar. O que nao deve ser visto nao deve ser enviado.
     *
     * No lugar, `valor_dos_meus_itens` - calculado apenas dos itens
     * dele, que sao os unicos que ele recebe.
     */
    const { valor_produtos, valor_frete, valor_total, ...pedidoVisivel } = pedido;

    return {
      ...pedidoVisivel,
      itens: meusItens,
      valor_dos_meus_itens: Number(
        meusItens.reduce((soma, item) => soma + Number(item.subtotal), 0).toFixed(2),
      ),
      visao: 'agricultor',
    };
  }

  throw erros.naoEncontrado('Pedido');
}

/*
 * LISTA OS ITENS DE PEDIDO DO AGRICULTOR.
 *
 * Consulta propria, e nao filtro da listagem do consumidor: o produtor
 * quer "o que eu preciso enviar", e nao "os pedidos que tem algo meu".
 * O `WHERE pi.agricultor_id = $1` no repositorio e o que garante que
 * ele nunca veja item alheio.
 */
export async function listarDoAgricultor(usuario, filtros) {
  const agricultor = await obterAgricultorDoUsuario(usuario);
  const { pagina, limite, offset } = lerPaginacao(filtros);

  const { itens, total } = await pedidoRepository.listarItensDoAgricultor(agricultor.id, {
    status: filtros.status,
    limite,
    offset,
  });

  return { itens, paginacao: montarPaginacao({ pagina, limite, total }) };
}

/*
 * ALTERA O STATUS DE UM ITEM DE PEDIDO (agricultor).
 *
 * Tres checagens, nesta ordem:
 *   1. o item existe E pertence a este agricultor (WHERE com agricultor_id)
 *   2. o novo status e um dos que o agricultor pode aplicar
 *   3. a transicao a partir do status atual e valida
 *
 * A ordem importa: a checagem de propriedade vem primeiro. Se fosse
 * depois, um agricultor tentando alterar item alheio receberia
 * "transicao invalida" em vez de "nao encontrado", o que revelaria
 * informacao sobre o item do outro.
 *
 * A sincronizacao de `pedidos.status` NAO acontece aqui: um trigger no
 * banco (migration 004) recalcula o status do pedido a cada mudanca de
 * item. Fazer na aplicacao criaria dois lugares decidindo o mesmo
 * estado, e um deles esqueceria.
 */
export async function alterarStatusItem(usuario, itemId, novoStatus) {
  const agricultor = await obterAgricultorDoUsuario(usuario);

  const item = await pedidoRepository.buscarItemDoAgricultor(agricultor.id, itemId);

  if (!item) {
    throw erros.naoEncontrado('Item do pedido');
  }

  if (!STATUS_DO_AGRICULTOR.includes(novoStatus)) {
    throw erros.dadosInvalidos(`O agricultor nao pode aplicar o status ${novoStatus}.`, [
      {
        campo: 'status',
        mensagem: `Use um destes: ${STATUS_DO_AGRICULTOR.join(', ')}.`,
      },
    ]);
  }

  if (!transicaoPermitida(item.status, novoStatus)) {
    throw erros.regraNegocio(
      explicarTransicao(item.status, novoStatus),
      'TRANSICAO_INVALIDA',
    );
  }

  const atualizado = await pedidoRepository.alterarStatusItem(
    agricultor.id,
    itemId,
    novoStatus,
  );

  /*
   * Se o UPDATE nao afetou linha, o item deixou de pertencer ao
   * agricultor entre a leitura e a escrita (corrida improvavel, mas o
   * caso precisa ser tratado - devolver sucesso aqui seria mentira).
   */
  if (!atualizado) {
    throw erros.naoEncontrado('Item do pedido');
  }

  logger.info(
    { agricultorId: agricultor.id, itemId, de: item.status, para: novoStatus },
    'Status de item de pedido alterado',
  );

  const pedido = await pedidoRepository.buscarPorId(atualizado.pedido_id);

  return { item: atualizado, pedido_status: pedido?.status ?? null };
}

/*
 * CANCELA UM PEDIDO (consumidor).
 *
 * Regras:
 *   - so o dono cancela o proprio pedido;
 *   - so itens PENDENTE ou PROCESSANDO podem ser cancelados;
 *   - se ja houver item ENVIADO ou ENTREGUE, o pedido nao pode ser
 *     cancelado inteiro (o produto ja saiu);
 *   - o estoque dos itens cancelados VOLTA.
 *
 * A devolucao de estoque roda na mesma transacao do cancelamento. Se o
 * UPDATE de estoque falhasse depois de marcar CANCELADO, o produto
 * ficaria indisponivel para sempre.
 */
export async function cancelar(usuario, pedidoId) {
  const pedido = await pedidoRepository.buscarPorId(pedidoId);

  if (!pedido) {
    throw erros.naoEncontrado('Pedido');
  }

  if (usuario.tipo === 'cliente' && String(pedido.consumidor_id) !== String(usuario.id)) {
    throw erros.naoEncontrado('Pedido');
  }

  if (pedido.status === 'CANCELADO') {
    throw erros.regraNegocio('Este pedido ja esta cancelado.', 'PEDIDO_JA_CANCELADO');
  }

  if (pedido.status === 'ENTREGUE') {
    throw erros.regraNegocio(
      'Pedido ja entregue nao pode ser cancelado. Solicite uma devolucao.',
      'PEDIDO_ENTREGUE',
    );
  }

  const itens = await pedidoRepository.listarItens(pedidoId);

  const itensCancelaveis = itens.filter((item) =>
    ['PENDENTE', 'PROCESSANDO'].includes(item.status),
  );

  if (itensCancelaveis.length === 0) {
    throw erros.regraNegocio(
      'Nenhum item deste pedido pode ser cancelado: todos ja sairam para entrega.',
      'PEDIDO_NAO_CANCELAVEL',
    );
  }

  /*
   * Se parte do pedido ja foi enviada, cancelar o resto deixaria o
   * cliente com um pedido pela metade e o produtor com produto
   * despachado sem cobranca clara. Recusamos o cancelamento parcial e
   * orientamos o contato - a versao completa disso e a devolucao por
   * item, que nao existe nesta fase.
   */
  const jaSaiu = itens.filter((item) => ['ENVIADO', 'ENTREGUE'].includes(item.status));

  if (jaSaiu.length > 0) {
    throw erros.regraNegocio(
      'Parte deste pedido ja saiu para entrega, entao o pedido nao pode ser cancelado por completo. Entre em contato com o suporte.',
      'CANCELAMENTO_PARCIAL_NAO_SUPORTADO',
    );
  }

  const resultado = await pedidoRepository.emTransacao(async (cliente) => {
    const cancelados = await pedidoRepository.cancelarItensDoPedido(cliente, pedidoId);

    /*
     * Devolve o estoque de cada item cancelado. O estoque volta para a
     * quantidade que foi baixada no checkout - e por isso o item guarda
     * `quantidade`, e nao uma referencia ao carrinho (que ja foi
     * esvaziado).
     */
    for (const item of cancelados) {
      await pedidoRepository.devolverEstoque(cliente, item.produto_id, item.quantidade);
    }

    return cancelados;
  });

  logger.info(
    { pedidoId, consumidorId: pedido.consumidor_id, itensCancelados: resultado.length },
    'Pedido cancelado',
  );

  const atualizado = await pedidoRepository.buscarPorId(pedidoId);

  return {
    pedido: atualizado,
    itens_cancelados: resultado.length,
    estoque_devolvido: resultado.map((item) => ({
      produto_id: item.produto_id,
      quantidade: item.quantidade,
    })),
  };
}

/*
 * CANCELA UM ITEM ESPECIFICO (agricultor).
 *
 * Usado quando o produtor percebe que nao tem o produto. Diferente do
 * cancelamento do consumidor, aqui e por item: o produtor A cancela o
 * item dele sem afetar os itens do produtor B no mesmo pedido.
 *
 * O estoque tambem volta, porque o item nunca chegou a sair.
 */
export async function cancelarItemDoAgricultor(usuario, itemId) {
  const agricultor = await obterAgricultorDoUsuario(usuario);

  const item = await pedidoRepository.buscarItemDoAgricultor(agricultor.id, itemId);

  if (!item) {
    throw erros.naoEncontrado('Item do pedido');
  }

  if (!transicaoPermitida(item.status, 'CANCELADO')) {
    throw erros.regraNegocio(
      explicarTransicao(item.status, 'CANCELADO'),
      'TRANSICAO_INVALIDA',
    );
  }

  await pedidoRepository.emTransacao(async (cliente) => {
    await pedidoRepository.alterarStatusItem(agricultor.id, itemId, 'CANCELADO');
    await pedidoRepository.devolverEstoque(cliente, item.produto_id, item.quantidade);
  });

  logger.info(
    { agricultorId: agricultor.id, itemId, produtoId: item.produto_id },
    'Item de pedido cancelado pelo agricultor',
  );

  const pedido = await pedidoRepository.buscarPorId(item.pedido_id);

  return { item_id: itemId, pedido_status: pedido?.status ?? null, estoque_devolvido: true };
}

/*
 * LISTA TODOS OS PEDIDOS (administrador).
 *
 * Visao administrativa completa, com paginacao e filtro por status e
 * consumidor. Sem a restricao por dono - e o unico ponto do sistema onde
 * isso acontece, e por isso exige `requireRole('administrador')` na
 * rota.
 */
export async function listarTodos(filtros) {
  const { pagina, limite, offset } = lerPaginacao(filtros);

  const { itens, total } = await pedidoRepository.listarTodos({
    status: filtros.status,
    consumidorId: filtros.consumidorId,
    limite,
    offset,
  });

  return { itens, paginacao: montarPaginacao({ pagina, limite, total }) };
}

/*
 * AVANCA TODOS OS ITENS DE UM PEDIDO (administrador).
 *
 * Serve para destravar um pedido cujo produtor sumiu - sem isso, um
 * pedido com item de produtor inativo ficaria preso em PENDENTE para
 * sempre. O admin age no pedido inteiro, e nao item a item.
 */
export async function avancarPedidoComoAdmin(pedidoId, novoStatus) {
  const pedido = await pedidoRepository.buscarPorId(pedidoId);

  if (!pedido) {
    throw erros.naoEncontrado('Pedido');
  }

  const itens = await pedidoRepository.listarItens(pedidoId);

  /* Somente itens cuja transicao e valida entram no UPDATE. */
  const elegiveis = itens.filter((item) => transicaoPermitida(item.status, novoStatus));

  if (elegiveis.length === 0) {
    throw erros.regraNegocio(
      `Nenhum item deste pedido pode ir para ${novoStatus} no estado atual.`,
      'TRANSICAO_INVALIDA',
    );
  }

  const resultado = await pedidoRepository.emTransacao(async (cliente) => {
    /*
     * Se o destino e CANCELADO, o estoque volta para os itens
     * cancelados. Para os demais destinos nao ha devolucao - o produto
     * continua com o cliente.
     */
    if (novoStatus === 'CANCELADO') {
      const cancelados = await pedidoRepository.alterarStatusTodosItens(
        cliente,
        pedidoId,
        ['PENDENTE', 'PROCESSANDO'],
        'CANCELADO',
      );

      for (const item of cancelados) {
        await pedidoRepository.devolverEstoque(cliente, item.produto_id, item.quantidade);
      }

      return cancelados;
    }

    const deStatus = itens
      .filter((item) => transicaoPermitida(item.status, novoStatus))
      .map((item) => item.status);

    return pedidoRepository.alterarStatusTodosItens(
      cliente,
      pedidoId,
      [...new Set(deStatus)],
      novoStatus,
    );
  });

  logger.info(
    { pedidoId, novoStatus, itensAfetados: resultado.length },
    'Status de pedido alterado pelo administrador',
  );

  const atualizado = await pedidoRepository.buscarPorId(pedidoId);

  return {
    pedido: atualizado,
    itens_afetados: resultado.length,
    itens: await pedidoRepository.listarItens(pedidoId),
  };
}

export default {
  listarDoConsumidor,
  listarDoAgricultor,
  listarTodos,
  obter,
  alterarStatusItem,
  cancelar,
  cancelarItemDoAgricultor,
  avancarPedidoComoAdmin,
  transicaoPermitida,
};
