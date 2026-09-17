import pedidoService from '../services/pedidoService.js';
import { respostaSucesso } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller de pedidos.
 *
 * Repare que `listar` e `obter` NAO ramificam por tipo de usuario aqui.
 * A decisao de o que cada tipo pode ver fica no service, porque depende
 * do conteudo do pedido (quais itens sao de quem) e nao apenas do tipo
 * de conta. Ramificar no controller espalharia a regra de autorizacao
 * por varios pontos, e um deles acabaria esquecendo um caso.
 */

/*
 * GET /pedidos - lista os pedidos do usuario autenticado.
 *
 * O mesmo endpoint serve consumidor e agricultor, e a resposta e
 * diferente para cada um:
 *   - consumidor: pedidos dele, com todos os itens
 *   - agricultor: os ITENS dele, com o pedido a que pertencem
 *
 * Um endpoint por tipo seria mais explicito, mas faria o frontend ter
 * duas telas quase iguais. A distincao fica no conteudo, nao na rota.
 */
export const listar = asyncHandler(async (req, res) => {
  const filtros = req.dadosValidados.query ?? {};

  if (req.usuario.tipo === 'agricultor') {
    const { itens, paginacao } = await pedidoService.listarDoAgricultor(req.usuario, filtros);
    return respostaSucesso(res, itens, 200, paginacao);
  }

  const { itens, paginacao } = await pedidoService.listarDoConsumidor(req.usuario, filtros);
  return respostaSucesso(res, itens, 200, paginacao);
});

/* GET /pedidos/:id - detalhe com autorizacao por tipo de usuario. */
export const obter = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const pedido = await pedidoService.obter(req.usuario, id);

  return respostaSucesso(res, pedido);
});

/*
 * PATCH /pedidos/:id/cancelar - consumidor cancela o proprio pedido.
 *
 * Rota dedicada, e nao `PATCH /pedidos/:id { status: 'CANCELADO' }`:
 * cancelar devolve estoque e tem regras proprias (nao cancela o que ja
 * saiu). Um endpoint generico de status convidaria a usar a mesma rota
 * para transicoes que nao devolvem estoque.
 */
export const cancelar = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const resultado = await pedidoService.cancelar(req.usuario, id);

  return respostaSucesso(res, resultado);
});

/*
 * PATCH /pedidos/:id/itens/:itemId/status - agricultor avanca o item.
 *
 * O item e identificado pelo par (itemId, agricultor do token). O
 * pedido na URL e informativo: a autorizacao vem da propriedade do item.
 */
export const alterarStatusItem = asyncHandler(async (req, res) => {
  const { itemId } = req.dadosValidados.params;
  const { status } = req.dadosValidados.body;

  const resultado = await pedidoService.alterarStatusItem(req.usuario, itemId, status);

  return respostaSucesso(res, resultado);
});

/*
 * DELETE /pedidos/:id/itens/:itemId - agricultor cancela o proprio item.
 *
 * Verbo DELETE porque o efeito e "este item nao vai mais ser entregue".
 * O item nao e apagado do banco (o historico do pedido precisa dele) -
 * o status vai para CANCELADO e o estoque volta.
 */
export const cancelarItem = asyncHandler(async (req, res) => {
  const { itemId } = req.dadosValidados.params;

  const resultado = await pedidoService.cancelarItemDoAgricultor(req.usuario, itemId);

  return respostaSucesso(res, resultado);
});

export default { listar, obter, cancelar, alterarStatusItem, cancelarItem };
