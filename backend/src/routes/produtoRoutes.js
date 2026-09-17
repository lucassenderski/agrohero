import { Router } from 'express';
import produtoController from '../controllers/produtoController.js';
import { checkJwt } from '../middlewares/checkJwt.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validar } from '../middlewares/validar.js';
import {
  criarProdutoSchema,
  atualizarProdutoSchema,
  alterarDisponibilidadeSchema,
  reporEstoqueSchema,
  produtoIdParamSchema,
  listarProdutosQuerySchema,
  listarMeusProdutosQuerySchema,
} from '../validators/produtoValidators.js';

/*
 * Rotas de produtos, montadas em /api/v1/produtos.
 *
 * Aqui convivem leitura PUBLICA e escrita do AGRICULTOR no mesmo
 * arquivo. Isso e deliberado: as duas operam sobre o mesmo recurso, e
 * separar em /produtos e /agricultor/produtos faria o frontend manter
 * duas bases de URL para a mesma coisa. O que separa e o middleware de
 * cada rota, nao o prefixo.
 *
 * ORDEM DAS ROTAS - PONTO DELICADO
 *
 * Express casa rotas na ordem de declaracao. `/meus` precisa vir ANTES
 * de `/:id`, senao a requisicao GET /produtos/meus casaria com `/:id`
 * tendo "meus" como parametro, falharia na validacao (nao e numero) e
 * devolveria 400 - um erro confuso, que parece bug de validacao quando
 * na verdade e ordem de declaracao.
 */

const router = Router();

const apenasAgricultor = [checkJwt, requireRole('agricultor')];

/* --- Rotas publicas ------------------------------------------------- */

/* GET /api/v1/produtos - catalogo com busca, filtros e paginacao. */
router.get('/', validar({ query: listarProdutosQuerySchema }), produtoController.listar);

/* --- Rotas do agricultor (precisam vir antes de /:id) --------------- */

/* GET /api/v1/produtos/meus - inclui produtos inativos e esgotados. */
router.get(
  '/meus',
  ...apenasAgricultor,
  validar({ query: listarMeusProdutosQuerySchema }),
  produtoController.listarMeus,
);

/* POST /api/v1/produtos - cria. O dono vem do token, nunca do corpo. */
router.post(
  '/',
  ...apenasAgricultor,
  validar({ body: criarProdutoSchema }),
  produtoController.criar,
);

/* --- Rotas de produto especifico ------------------------------------ */

/* GET /api/v1/produtos/:id - detalhe publico. */
router.get(
  '/:id',
  validar({ params: produtoIdParamSchema }),
  produtoController.obter,
);

/*
 * PUT e PATCH /api/v1/produtos/:id
 *
 * Ambos exigem agricultor e verificam a propriedade no service. O
 * middleware requireRole garante que e um agricultor; o service garante
 * que e O agricultor dono deste produto. As duas checagens sao
 * necessarias e diferentes - a primeira e sobre o tipo de conta, a
 * segunda sobre a posse do recurso.
 */
router.put(
  '/:id',
  ...apenasAgricultor,
  validar({ params: produtoIdParamSchema, body: atualizarProdutoSchema }),
  produtoController.atualizar,
);

router.patch(
  '/:id',
  ...apenasAgricultor,
  validar({ params: produtoIdParamSchema, body: atualizarProdutoSchema }),
  produtoController.atualizar,
);

/*
 * PATCH /api/v1/produtos/:id/disponibilidade
 *
 * Rota dedicada para tirar do ar / recolocar. Separada do PATCH geral
 * porque tem regra propria (idempotencia explicita: tentar desativar o
 * que ja esta desativado devolve 422, e nao sucesso silencioso).
 */
router.patch(
  '/:id/disponibilidade',
  ...apenasAgricultor,
  validar({ params: produtoIdParamSchema, body: alterarDisponibilidadeSchema }),
  produtoController.alterarDisponibilidade,
);

/* PATCH /api/v1/produtos/:id/estoque - repoe estoque (soma atomica). */
router.patch(
  '/:id/estoque',
  ...apenasAgricultor,
  validar({ params: produtoIdParamSchema, body: reporEstoqueSchema }),
  produtoController.reporEstoque,
);

/*
 * DELETE /api/v1/produtos/:id
 *
 * Desativacao logica. `pedido_itens.produto_id` referencia o produto,
 * entao apagar o registro perderia o historico dos pedidos.
 */
router.delete(
  '/:id',
  ...apenasAgricultor,
  validar({ params: produtoIdParamSchema }),
  produtoController.desativar,
);

export default router;
