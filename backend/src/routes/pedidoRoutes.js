import { Router } from 'express';
import pedidoController from '../controllers/pedidoController.js';
import { checkJwt } from '../middlewares/checkJwt.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validar } from '../middlewares/validar.js';
import {
  pedidoIdParamSchema,
  statusItemParamSchema,
  alterarStatusItemSchema,
  listarPedidosQuerySchema,
} from '../validators/pedidoValidators.js';

/*
 * Rotas de pedidos, montadas em /api/v1/pedidos.
 *
 * AUTORIZACAO EM DUAS CAMADAS, E POR QUE AS DUAS SAO NECESSARIAS:
 *
 * 1. `requireRole` aqui na rota define QUEM TEM ACESSO ao endpoint
 *    (cliente, agricultor ou admin). E uma regra sobre o TIPO de conta.
 *
 * 2. O service verifica QUAIS recursos aquele usuario pode ver ou
 *    alterar. E uma regra sobre a POSSE do recurso, e depende do
 *    conteudo (quais itens sao de quem).
 *
 * A primeira sem a segunda seria insuficiente: ser agricultor nao
 * significa poder mexer no item de outro agricultor. A segunda sem a
 * primeira tambem: um cliente autenticado nao deve alcancar rotas de
 * agricultor, mesmo que nao haja nada para ele alterar.
 *
 * ORDEM DAS ROTAS - PONTO DELICADO
 *
 * `/agricultor` precisa vir ANTES de `/:id`, senao a requisicao
 * GET /pedidos/agricultor casaria com `/:id` tendo "agricultor" como
 * parametro e devolveria 400 na validacao - um erro confuso, que parece
 * bug de validacao quando e ordem de declaracao.
 */

const router = Router();

router.use(checkJwt);

/*
 * ATENCAO - ORDEM IMPORTA: todas as rotas literais vem primeiro.
 *
 * Abaixo vem `router.use('/:id', ...)`? Nao. Todas as rotas com
 * parametro sao declaradas explicitamente, e a rota de cliente
 * (a listagem geral) e a ULTIMA. Assim nao ha como um caminho literal
 * ser capturado por um `:id`.
 */

/* --- Rotas do agricultor (literais, precisam vir primeiro) ---------- */

/* GET /api/v1/pedidos/agricultor - itens do produtor, com o pedido. */
router.get(
  '/agricultor',
  requireRole('agricultor'),
  validar({ query: listarPedidosQuerySchema }),
  pedidoController.listar,
);

/* PATCH /api/v1/pedidos/:id/itens/:itemId/status - avanca um item. */
router.patch(
  '/:id/itens/:itemId/status',
  requireRole('agricultor'),
  validar({ params: statusItemParamSchema, body: alterarStatusItemSchema }),
  pedidoController.alterarStatusItem,
);

/* DELETE /api/v1/pedidos/:id/itens/:itemId - cancela o proprio item. */
router.delete(
  '/:id/itens/:itemId',
  requireRole('agricultor'),
  validar({ params: statusItemParamSchema }),
  pedidoController.cancelarItem,
);

/* --- Rotas do consumidor -------------------------------------------- */

/*
 * GET /api/v1/pedidos
 *
 * Cliente ve os pedidos dele; agricultor ve apenas a mensagem de rota
 * incorreta - por isso a listagem geral aceita apenas `cliente`. O
 * agricultor usa /pedidos/agricultor, que devolve itens e nao pedidos.
 */
router.get(
  '/',
  requireRole('cliente'),
  validar({ query: listarPedidosQuerySchema }),
  pedidoController.listar,
);

/*
 * PATCH e DELETE com dois roles: o mesmo endpoint serve cliente e admin.
 * O service decide o que cada um pode fazer (o cliente so cancela o
 * proprio pedido; o admin cancela qualquer um).
 */
router.patch(
  '/:id/cancelar',
  requireRole('cliente', 'administrador'),
  validar({ params: pedidoIdParamSchema }),
  pedidoController.cancelar,
);

/*
 * GET /api/v1/pedidos/:id
 *
 * Os TRES perfis acessam, porque os tres tem interesse legitimo no
 * pedido - mas cada um recebe uma visao diferente, decidida no service:
 *   consumidor dono -> pedido inteiro
 *   agricultor      -> apenas os itens dele (e 404 se nao tiver nenhum)
 *   administrador   -> tudo, com pagamentos
 */
router.get(
  '/:id',
  requireRole('cliente', 'agricultor', 'administrador'),
  validar({ params: pedidoIdParamSchema }),
  pedidoController.obter,
);

export default router;