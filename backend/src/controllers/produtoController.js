import produtoService from '../services/produtoService.js';
import { respostaSucesso, respostaCriada, respostaSemConteudo } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller de produtos.
 *
 * Le a entrada validada, chama o service e monta a resposta HTTP.
 * Nenhuma regra de negocio mora aqui - em especial, a checagem de
 * propriedade fica no service, que consulta o banco. O controller nunca
 * decide se o usuario pode agir sobre um produto com base no que veio da
 * requisicao.
 */

/* GET /produtos - catalogo publico com busca e filtros. */
export const listar = asyncHandler(async (req, res) => {
  const filtros = req.dadosValidados.query;

  const { itens, paginacao } = await produtoService.listarPublicos(filtros);

  return respostaSucesso(res, itens, 200, paginacao);
});

/* GET /produtos/:id - detalhe publico. */
export const obter = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const produto = await produtoService.obterPublico(id);

  return respostaSucesso(res, produto);
});

/* GET /produtos/meus - lista do proprio agricultor, incluindo inativos. */
export const listarMeus = asyncHandler(async (req, res) => {
  const filtros = req.dadosValidados.query;

  const { itens, paginacao } = await produtoService.listarMeus(req.usuario, filtros);

  return respostaSucesso(res, itens, 200, paginacao);
});

/* POST /produtos - cria produto para o agricultor autenticado. */
export const criar = asyncHandler(async (req, res) => {
  const dados = req.dadosValidados.body;

  const produto = await produtoService.criar(req.usuario, dados);

  return respostaCriada(res, produto);
});

/*
 * PUT e PATCH usam o mesmo handler.
 *
 * O schema de atualizacao ja aceita campos opcionais, entao um PUT com o
 * corpo completo e um PATCH parcial passam pelo mesmo caminho. Nao ha
 * diferenca de comportamento entre os dois aqui - a distincao existe
 * para o frontend expressar a intencao, e nao para a API ter duas
 * implementacoes da mesma regra.
 */
export const atualizar = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const dados = req.dadosValidados.body;

  const produto = await produtoService.atualizar(req.usuario, id, dados);

  return respostaSucesso(res, produto);
});

/* PATCH /produtos/:id/disponibilidade - tira do ar ou recoloca. */
export const alterarDisponibilidade = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const { ativo } = req.dadosValidados.body;

  const produto = await produtoService.alterarDisponibilidade(req.usuario, id, ativo);

  return respostaSucesso(res, produto);
});

/*
 * DELETE /produtos/:id - desativacao logica.
 *
 * Nao apagamos o registro: `pedido_itens.produto_id` referencia o
 * produto, e apagar perderia o historico de pedidos. Um DELETE aqui e
 * um atalho para a desativacao, com a mesma regra de propriedade.
 *
 * Devolvemos 200 com o produto, e nao 204, para o frontend confirmar o
 * estado resultante sem uma segunda requisicao.
 */
export const desativar = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const produto = await produtoService.alterarDisponibilidade(req.usuario, id, false);

  return respostaSucesso(res, produto);
});

/* PATCH /produtos/:id/estoque - repoe estoque (soma). */
export const reporEstoque = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const { quantidade } = req.dadosValidados.body;

  const produto = await produtoService.reporEstoque(req.usuario, id, quantidade);

  return respostaSucesso(res, produto);
});

export default {
  listar,
  obter,
  listarMeus,
  criar,
  atualizar,
  alterarDisponibilidade,
  desativar,
  reporEstoque,
};
