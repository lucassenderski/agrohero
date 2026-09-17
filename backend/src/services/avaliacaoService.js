import avaliacaoRepository from '../repositories/avaliacaoRepository.js';
import produtoRepository from '../repositories/produtoRepository.js';
import agricultorRepository from '../repositories/agricultorRepository.js';
import pedidoRepository from '../repositories/pedidoRepository.js';
import { erros } from '../utils/AppError.js';
import logger from '../config/logger.js';
import { lerPaginacao, montarPaginacao } from '../utils/paginacao.js';

/*
 * Regras de negocio das avaliacoes (FASE 14).
 *
 * O TEMA CENTRAL E "QUEM PODE AVALIAR", e a resposta tem tres condicoes
 * simultaneas:
 *
 *   1. O consumidor comprou o produto   -> existe item no pedido dele
 *   2. O produto ja foi RECEBIDO        -> o item esta ENTREGUE
 *   3. Ainda nao avaliou aquele item    -> UNIQUE (pedido, produto, consumidor)
 *
 * AS TRES IMPORTAM, E CADA UMA TEM UM MOTIVO
 *
 * Sem a (1), qualquer conta poderia avaliar qualquer produto do
 * marketplace - bastava adivinhar um id. Avaliacao e a unica prova
 * social do sistema; se ela nao custa uma compra, ela nao vale nada.
 *
 * Sem a (2), o cliente avaliaria antes de receber. Ele julgaria o
 * produto sem ter visto, e um pedido extraviado ganharia nota 5.
 *
 * Sem a (3), um unico cliente inflaria a media: bastava reenviar a
 * avaliacao 100 vezes. A constraint do banco e a garantia real; a
 * checagem no service existe para dar mensagem clara.
 *
 * O STATUS DO ITEM, E NAO O DO PEDIDO
 *
 * A checagem e `pi.status = 'ENTREGUE'`, e nao `pedidos.status`. Em um
 * pedido multi-agricultor, o produtor A pode ter entregue enquanto o B
 * ainda esta enviando. Usar o status do pedido travaria a avaliacao do
 * tomate que ja chegou por causa do morango que nao chegou.
 */

/* ----------------------------------------------------------------
 * Escrita (consumidor)
 * ---------------------------------------------------------------- */

/*
 * Cria uma avaliacao para um produto recebido.
 *
 * O corpo carrega `pedido_id`, `produto_id`, `nota` e `comentario`.
 * NAO carrega `consumidor_id` (vem do token) nem `agricultor_id` (vem
 * do item do pedido). Aceitar qualquer um dos dois do cliente abriria
 * duas fraudes distintas: avaliar em nome de outro usuario, e atribuir
 * a nota a um produtor diferente do que vendeu.
 */
export async function criar(usuario, dados) {
  const { pedido_id: pedidoId, produto_id: produtoId, nota, comentario } = dados;

  /*
   * Passo 1: o item existe, e do consumidor, e foi entregue?
   *
   * Uma unica consulta responde as tres perguntas, e todas as condicoes
   * vao na clausula WHERE. Se qualquer uma falhar, o resultado e `null` -
   * e nao distinguimos qual falhou na resposta, para nao revelar a
   * existencia de pedidos de outros consumidores.
   */
  const item = await avaliacaoRepository.buscarItemEntregue(
    usuario.id,
    pedidoId,
    produtoId,
  );

  if (!item) {
    /*
     * A mensagem cobre os tres casos sem revelar qual ocorreu:
     * pedido inexistente, pedido de outro consumidor, ou produto que nao
     * esta nesse pedido. Dizer "esse pedido e de outro usuario" ja
     * confirmaria que o pedido existe.
     */
    throw erros.naoEncontrado('Pedido com este produto para avaliacao');
  }

  /*
   * Passo 2: o item foi entregue?
   *
   * Checagem separada (e nao junto no WHERE) para dar mensagem
   * ESPECIFICA. Aqui o consumidor ja provou que o pedido e dele, entao
   * informar o motivo real nao vaza nada de terceiros - e ajuda: "seu
   * pedido ainda nao chegou" e melhor que "nao encontrado".
   */
  if (item.status !== 'ENTREGUE') {
    throw erros.regraNegocio(
      `So e possivel avaliar produtos ja recebidos. Este item esta em "${item.status}".`,
      'ITEM_NAO_ENTREGUE',
    );
  }

  /*
   * Passo 3: ja avaliou?
   *
   * A constraint do banco e a garantia; esta consulta e a mensagem
   * amigavel. Entre a consulta e o INSERT cabe outra requisicao, e o
   * `23505` tratado abaixo cobre esse caso.
   */
  const existente = await avaliacaoRepository.buscarDoConsumidorNoPedido(
    usuario.id,
    pedidoId,
    produtoId,
  );

  if (existente) {
    throw erros.conflito('Voce ja avaliou este produto neste pedido.', {
      avaliacao_id: existente.id,
    });
  }

  let avaliacao;

  try {
    avaliacao = await avaliacaoRepository.criar({
      pedidoId,
      produtoId,
      consumidorId: usuario.id,
      /* Do ITEM, e nunca do corpo: e o produtor que de fato vendeu. */
      agricultorId: item.agricultor_id,
      nota,
      comentario,
    });
  } catch (erro) {
    /*
     * 23505 = unique_violation. Acontece quando duas requisicoes
     * identicas passam juntas pelo passo 3. Traduzimos para o mesmo 409,
     * e nao deixamos o erro do banco vazar como 500.
     */
    if (erro.codigo === '23505') {
      throw erros.conflito('Voce ja avaliou este produto neste pedido.');
    }
    throw erro;
  }

  logger.info(
    { avaliacaoId: avaliacao.id, pedidoId, produtoId, consumidorId: usuario.id, nota },
    'Avaliacao criada',
  );

  return montarResposta(avaliacao, item.agricultor_id);
}

/*
 * Atualiza a propria avaliacao.
 *
 * Editar e permitido porque a primeira impressao pode ser injusta (o
 * produto amadureceu depois, o produtor resolveu um problema). Apagar
 * tambem e permitido, e a media se ajusta - nao ha nota travada.
 *
 * A propriedade e verificada no repositorio (`AND consumidor_id = $`),
 * e nao aqui: assim nao existe caminho de codigo que atualize a
 * avaliacao de outra pessoa.
 */
export async function atualizar(usuario, avaliacaoId, dados) {
  const atual = await avaliacaoRepository.buscarPorId(avaliacaoId);

  if (!atual) {
    throw erros.naoEncontrado('Avaliacao');
  }

  /*
   * 404, e nao 403, para quem nao e dono.
   *
   * Um 403 confirmaria que a avaliacao existe, permitindo enumerar ids e
   * descobrir quem avaliou o que. O 404 nao distingue "nao existe" de
   * "nao e sua", que e o comportamento correto para recurso privado.
   */
  if (String(atual.consumidor_id) !== String(usuario.id)) {
    throw erros.naoEncontrado('Avaliacao');
  }

  /*
   * `comentarioEnviado` separa "nao enviado" de "apagar".
   *
   * `Object.hasOwn` (e nao `dados.comentario !== undefined`) porque o
   * cliente pode enviar `null` de proposito para apagar o comentario:
   * `null !== undefined` seria verdadeiro, mas o Zod tambem remove a
   * chave quando o campo nao vem. HasOwn responde exatamente "o campo
   * estava no corpo?", que e a pergunta certa aqui.
   */
  const atualizada = await avaliacaoRepository.atualizar(avaliacaoId, usuario.id, {
    nota: dados.nota,
    comentario: dados.comentario,
    comentarioEnviado: Object.hasOwn(dados, 'comentario'),
  });

  if (!atualizada) {
    throw erros.naoEncontrado('Avaliacao');
  }

  logger.info({ avaliacaoId, consumidorId: usuario.id }, 'Avaliacao atualizada');

  return montarResposta(atualizada, atual.agricultor_id);
}

/* Remove a propria avaliacao. */
export async function remover(usuario, avaliacaoId) {
  const atual = await avaliacaoRepository.buscarPorId(avaliacaoId);

  if (!atual || String(atual.consumidor_id) !== String(usuario.id)) {
    throw erros.naoEncontrado('Avaliacao');
  }

  await avaliacaoRepository.remover(avaliacaoId, usuario.id);

  logger.info({ avaliacaoId, consumidorId: usuario.id }, 'Avaliacao removida');

  return { id: Number(avaliacaoId) };
}

/* ----------------------------------------------------------------
 * Leitura (publica)
 * ---------------------------------------------------------------- */

/* Avaliacoes de um produto, com o resumo de notas. */
export async function listarDoProduto(produtoId, query) {
  const produto = await produtoRepository.buscarPorId(produtoId);

  if (!produto) {
    throw erros.naoEncontrado('Produto');
  }

  const paginacao = lerPaginacao(query);

  const { itens, total } = await avaliacaoRepository.listarDoProduto(produtoId, paginacao);

  return {
    itens,
    paginacao: montarPaginacao({ ...paginacao, total }),
    resumo: montarResumoDoProduto(produto),
  };
}

/*
 * Avaliacoes recebidas por um produtor.
 *
 * O resumo usa `resumoDoAgricultor`, que calcula media, total e
 * distribuicao em uma varredura - e nao o `media_avaliacoes` da view,
 * que agrega por produto e nao daria a distribuicao de notas.
 */
export async function listarDoAgricultor(agricultorId, query) {
  const agricultor = await agricultorRepository.buscarPorId(agricultorId);

  if (!agricultor) {
    throw erros.naoEncontrado('Agricultor');
  }

  const paginacao = lerPaginacao(query);

  const [{ itens, total }, resumo] = await Promise.all([
    avaliacaoRepository.listarDoAgricultor(agricultorId, paginacao),
    avaliacaoRepository.resumoDoAgricultor(agricultorId),
  ]);

  return { itens, paginacao: montarPaginacao({ ...paginacao, total }), resumo };
}

/* Avaliacoes escritas pelo consumidor autenticado. */
export async function listarDoConsumidor(usuario, query) {
  const paginacao = lerPaginacao(query);

  const { itens, total } = await avaliacaoRepository.listarDoConsumidor(usuario.id, paginacao);

  return { itens, paginacao: montarPaginacao({ ...paginacao, total }) };
}

/*
 * Itens de um pedido que o consumidor ainda pode avaliar.
 *
 * Existe para o frontend nao ter que cruzar "meus pedidos" com "minhas
 * avaliacoes" para descobrir o que falta. O servidor responde direto.
 *
 * Pedido de outro consumidor devolve 404 pela mesma razao dos demais
 * endpoints: nao confirmar a existencia do recurso.
 */
export async function listarPendentesDoPedido(usuario, pedidoId) {
  const pedido = await pedidoRepository.buscarPorId(pedidoId);

  if (!pedido || String(pedido.consumidor_id) !== String(usuario.id)) {
    throw erros.naoEncontrado('Pedido');
  }

  const itens = await avaliacaoRepository.listarPendentesDoPedido(usuario.id, pedidoId);

  return { itens, total: itens.length };
}

/* ----------------------------------------------------------------
 * Auxiliares
 * ---------------------------------------------------------------- */

/*
 * Resumo da reputacao de um PRODUTO.
 *
 * Vem do proprio registro do produto (colunas da view
 * `produtos_com_avaliacao`), e nao de uma nova consulta agregada: o
 * dado ja foi calculado quando o produto foi carregado, e refazer a
 * conta aqui custaria uma varredura a mais.
 */
function montarResumoDoProduto(produto) {
  return {
    media: Number(produto.media_avaliacoes ?? 0),
    total: Number(produto.total_avaliacoes ?? 0),
  };
}

/*
 * Formato de resposta de uma avaliacao escrita.
 *
 * Devolve `agricultor_id` porque quem escreveu a avaliacao precisa saber
 * a quem ela foi atribuida - se um pedido tinha dois produtores, o
 * cliente ve a qual deles a nota se refere.
 */
function montarResposta(avaliacao, agricultorId) {
  return {
    id: Number(avaliacao.id),
    pedido_id: Number(avaliacao.pedido_id),
    produto_id: Number(avaliacao.produto_id),
    agricultor_id: Number(agricultorId ?? avaliacao.agricultor_id),
    nota: Number(avaliacao.nota),
    comentario: avaliacao.comentario ?? null,
    criado_em: avaliacao.criado_em,
    atualizado_em: avaliacao.atualizado_em,
  };
}

export default {
  criar,
  atualizar,
  remover,
  listarDoProduto,
  listarDoAgricultor,
  listarDoConsumidor,
  listarPendentesDoPedido,
};
