import { Router } from 'express';
import pedidoController from '../controllers/pedidoController.js';
import pedidoService from '../services/pedidoService.js';
import { checkJwt } from '../middlewares/checkJwt.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validar } from '../middlewares/validar.js';
import { respostaSucesso } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  pedidoIdParamSchema,
  alterarStatusPedidoAdminSchema,
  listarTodosQuerySchema,
} from '../validators/pedidoValidators.js';

/*
 * Rotas ADMINISTRATIVAS de pedidos, montadas em /api/v1/admin/pedidos.
 *
 * Visao completa, sem restricao por dono - e o unico lugar do sistema
 * onde isso acontece, e por isso o `requireRole('administrador')` e
 * obrigatorio em todas as rotas daqui.
 *
 * O admin existe para destravar casos que o fluxo normal nao resolve:
 * um pedido cujo produtor sumiu ficaria preso em PENDENTE para sempre
 * sem a rota de avanco manual.
 */

const router = Router();

router.use(checkJwt, requireRole('administrador'));

/* GET /api/v1/admin/pedidos - todos os pedidos, com filtros. */
router.get(
  '/',
  validar({ query: listarTodosQuerySchema }),
  asyncHandler(async (req, res) => {
    const filtros = req.dadosValidados.query ?? {};

    const { itens, paginacao } = await pedidoService.listarTodos(filtros);

    return respostaSucesso(res, itens, 200, paginacao);
  }),
);

/*
 * PATCH /api/v1/admin/pedidos/:id/status - avanca o pedido inteiro.
 *
 * Aqui CANCELADO e um destino valido: o service devolve o estoque dos
 * itens cancelados. E o caminho do admin para desfazer um pedido preso.
 */
router.patch(
  '/:id/status',
  validar({ params: pedidoIdParamSchema, body: alterarStatusPedidoAdminSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.dadosValidados.params;
    const { status } = req.dadosValidados.body;

    const resultado = await pedidoService.avancarPedidoComoAdmin(id, status);

    return respostaSucesso(res, resultado);
  }),
);

export default router;