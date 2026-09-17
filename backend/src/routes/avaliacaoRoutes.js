import { Router } from 'express';
import avaliacaoController from '../controllers/avaliacaoController.js';
import { checkJwt } from '../middlewares/checkJwt.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validar } from '../middlewares/validar.js';
import {
  criarAvaliacaoSchema,
  atualizarAvaliacaoSchema,
  avaliacaoIdParamSchema,
  produtoIdParamSchema,
  agricultorIdParamSchema,
  pedidoIdParamSchema,
  listarAvaliacoesQuerySchema,
} from '../validators/avaliacaoValidators.js';

/*
 * Rotas de avaliacoes, montadas em /api/v1/avaliacoes.
 *
 * ORDEM DAS ROTAS - PONTO DELICADO
 *
 * As rotas literais (`/minhas`, `/produto/...`, `/agricultor/...`,
 * `/pendentes/...`) vem ANTES das que usam `/:id`. Se `/:id` viesse
 * primeiro, GET /avaliacoes/minhas casaria com `/:id` tendo "minhas"
 * como identificador e devolveria 400 na validacao - um erro confuso,
 * que parece bug de validacao quando e ordem de declaracao.
 *
 * AUTENTICACAO: CAMADA POR CAMADA, E NAO NO ROUTER INTEIRO
 *
 * Diferente de `/carrinho` e `/pedidos`, aqui NAO se aplica `checkJwt`
 * no router. As leituras de produto e de agricultor sao publicas, porque
 * reputacao e informacao de interesse coletivo. Aplicar `router.use`
 * tornaria publico o que precisa de login e vice-versa: o middleware vai
 * rota por rota, exatamente onde e necessario.
 *
 *   publico   -> GET /produto/:id, GET /agricultor/:id
 *   cliente   -> POST /, PUT /:id, DELETE /:id, /minhas, /pendentes/:id
 */

const router = Router();

/* --- Leitura publica ------------------------------------------------- */

/* GET /api/v1/avaliacoes/produto/:produtoId */
router.get(
  '/produto/:produtoId',
  validar({ params: produtoIdParamSchema, query: listarAvaliacoesQuerySchema }),
  avaliacaoController.listarDoProduto,
);

/* GET /api/v1/avaliacoes/agricultor/:agricultorId */
router.get(
  '/agricultor/:agricultorId',
  validar({ params: agricultorIdParamSchema, query: listarAvaliacoesQuerySchema }),
  avaliacaoController.listarDoAgricultor,
);

/* --- Rotas do consumidor autenticado --------------------------------- */

/* GET /api/v1/avaliacoes/minhas */
router.get(
  '/minhas',
  checkJwt,
  requireRole('cliente'),
  validar({ query: listarAvaliacoesQuerySchema }),
  avaliacaoController.listarMinhas,
);

/* GET /api/v1/avaliacoes/pendentes/:pedidoId */
router.get(
  '/pendentes/:pedidoId',
  checkJwt,
  requireRole('cliente'),
  validar({ params: pedidoIdParamSchema }),
  avaliacaoController.listarPendentes,
);

/*
 * POST /api/v1/avaliacoes
 *
 * So `cliente`: agricultor e admin nao avaliam. Um produtor avaliando o
 * proprio produto inflaria a propria media, e nao ha caso legitimo em
 * que ele avalie a compra de outra pessoa.
 */
router.post(
  '/',
  checkJwt,
  requireRole('cliente'),
  validar({ body: criarAvaliacaoSchema }),
  avaliacaoController.criar,
);

/*
 * PUT e DELETE /api/v1/avaliacoes/:id
 *
 * O service verifica a propriedade e devolve 404 para quem nao e dono
 * (e nao 403, para nao confirmar a existencia do recurso).
 */
router.put(
  '/:id',
  checkJwt,
  requireRole('cliente'),
  validar({ params: avaliacaoIdParamSchema, body: atualizarAvaliacaoSchema }),
  avaliacaoController.atualizar,
);

router.delete(
  '/:id',
  checkJwt,
  requireRole('cliente'),
  validar({ params: avaliacaoIdParamSchema }),
  avaliacaoController.remover,
);

export default router;
