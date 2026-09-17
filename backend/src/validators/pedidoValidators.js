import { z } from 'zod';
import { idParametro } from '../utils/validacao.js';

/*
 * Schemas de pedidos.
 *
 * O status NUNCA e escolhido livremente pelo cliente. O cliente so
 * cancela (rota dedicada) e o agricultor so aplica os status do fluxo
 * dele. Por isso nao existe `status` no corpo de nenhum schema daqui: a
 * transicao vem do codigo de cada rota, e nao de um campo aceito.
 *
 * Se houvesse um `status` livre, um agricultor poderia marcar o pedido
 * como ENTREGUE sem ter enviado nada.
 */

export const STATUS_PEDIDO = ['PENDENTE', 'PROCESSANDO', 'ENVIADO', 'ENTREGUE', 'CANCELADO'];

/*
 * Status que o AGRICULTOR pode aplicar nos proprios itens.
 *
 * CANCELADO nao entra aqui: cancelar item tem regra propria e devolve
 * estoque, entao mora numa rota separada. Deixar CANCELADO passar por
 * esta rota faria o estoque nao voltar.
 */
export const STATUS_ITEM_AGRICULTOR = ['PROCESSANDO', 'ENVIADO', 'ENTREGUE'];

export const pedidoIdParamSchema = z.object({
  id: idParametro,
});

export const itemIdParamSchema = z.object({
  itemId: idParametro,
});

/*
 * Parametros da rota de status de item:
 *   PATCH /pedidos/:id/itens/:itemId/status
 *
 * O `pedidoId` vem na URL por clareza da hierarquia, mas a autorizacao
 * NAO depende dele - depende do item pertencer ao agricultor. Manter o
 * pedido na URL nao cria risco, porque o service nunca busca o item
 * "dentro do pedido informado": ele busca por (itemId, agricultorId).
 * Se o pedido informado nao for o do item, nada muda de comportamento -
 * o que protege e a propriedade, nao o caminho.
 */
export const statusItemParamSchema = z.object({
  id: idParametro,
  itemId: idParametro,
});

export const alterarStatusItemSchema = z.object({
  status: z.enum(STATUS_ITEM_AGRICULTOR, {
    errorMap: () => ({
      message: `O status deve ser um destes: ${STATUS_ITEM_AGRICULTOR.join(', ')}.`,
    }),
  }),
});

/* Filtro de status na listagem (opcional). */
export const listarPedidosQuerySchema = z.object({
  status: z.enum(STATUS_PEDIDO).optional(),
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
});

/* Filtro administrativo: permite tambem filtrar por consumidor. */
export const listarTodosQuerySchema = listarPedidosQuerySchema.extend({
  consumidorId: idParametro.optional(),
});

/*
 * Status aplicado pelo ADMINISTRADOR no pedido inteiro.
 *
 * Aqui CANCELADO entra: e o caminho do admin para destravar um pedido
 * preso, e o service devolve o estoque dos itens cancelados.
 */
export const alterarStatusPedidoAdminSchema = z.object({
  status: z.enum(STATUS_PEDIDO, {
    errorMap: () => ({ message: `O status deve ser um destes: ${STATUS_PEDIDO.join(', ')}.` }),
  }),
});

export default {
  pedidoIdParamSchema,
  itemIdParamSchema,
  statusItemParamSchema,
  alterarStatusItemSchema,
  alterarStatusPedidoAdminSchema,
  listarPedidosQuerySchema,
  listarTodosQuerySchema,
  STATUS_PEDIDO,
  STATUS_ITEM_AGRICULTOR,
};