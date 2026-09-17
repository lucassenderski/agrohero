import avaliacaoService from '../services/avaliacaoService.js';
import { respostaSucesso } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller de avaliacoes.
 *
 * O controller e fino de proposito: ele so extrai o que veio da
 * requisicao (dados ja validados pelo middleware) e delega. Nenhuma
 * regra de "quem pode avaliar" mora aqui - ela depende do conteudo do
 * pedido e fica no service, onde ha um unico caminho que a aplica.
 */

/* POST /avaliacoes - o consumidor avalia um produto recebido. */
export const criar = asyncHandler(async (req, res) => {
  const avaliacao = await avaliacaoService.criar(req.usuario, req.dadosValidados.body);

  return respostaSucesso(res, avaliacao, 201);
});

/* PUT /avaliacoes/:id - atualiza a propria avaliacao. */
export const atualizar = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const avaliacao = await avaliacaoService.atualizar(req.usuario, id, req.dadosValidados.body);

  return respostaSucesso(res, avaliacao);
});

/* DELETE /avaliacoes/:id - remove a propria avaliacao. */
export const remover = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const resultado = await avaliacaoService.remover(req.usuario, id);

  return respostaSucesso(res, resultado);
});

/*
 * GET /avaliacoes/produto/:produtoId - leitura publica.
 *
 * Publica porque reputacao e informacao de interesse coletivo: exigir
 * login para ver a nota de um produto esconderia justamente o dado que
 * ajuda o consumidor a decidir.
 */
export const listarDoProduto = asyncHandler(async (req, res) => {
  const { produtoId } = req.dadosValidados.params;

  const { itens, paginacao, resumo } = await avaliacaoService.listarDoProduto(
    produtoId,
    req.dadosValidados.query ?? {},
  );

  return respostaSucesso(res, { resumo, avaliacoes: itens }, 200, paginacao);
});

/* GET /avaliacoes/agricultor/:agricultorId - leitura publica. */
export const listarDoAgricultor = asyncHandler(async (req, res) => {
  const { agricultorId } = req.dadosValidados.params;

  const { itens, paginacao, resumo } = await avaliacaoService.listarDoAgricultor(
    agricultorId,
    req.dadosValidados.query ?? {},
  );

  return respostaSucesso(res, { resumo, avaliacoes: itens }, 200, paginacao);
});

/* GET /avaliacoes/minhas - avaliacoes escritas pelo consumidor. */
export const listarMinhas = asyncHandler(async (req, res) => {
  const { itens, paginacao } = await avaliacaoService.listarDoConsumidor(
    req.usuario,
    req.dadosValidados.query ?? {},
  );

  return respostaSucesso(res, itens, 200, paginacao);
});

/*
 * GET /avaliacoes/pendentes/:pedidoId
 *
 * O que este pedido tem a avaliar. O nome no plural ("pendentes") e
 * proposital: a rota devolve uma LISTA de itens, nao uma avaliacao.
 */
export const listarPendentes = asyncHandler(async (req, res) => {
  const { pedidoId } = req.dadosValidados.params;

  const resultado = await avaliacaoService.listarPendentesDoPedido(req.usuario, pedidoId);

  return respostaSucesso(res, resultado);
});

export default {
  criar,
  atualizar,
  remover,
  listarDoProduto,
  listarDoAgricultor,
  listarMinhas,
  listarPendentes,
};
