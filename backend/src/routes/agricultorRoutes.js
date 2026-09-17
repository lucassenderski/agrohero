import { Router } from 'express';
import agricultorController from '../controllers/agricultorController.js';
import { validar } from '../middlewares/validar.js';
import {
  agricultorIdParamSchema,
  listarAgricultoresQuerySchema,
  listarProdutosDoAgricultorQuerySchema,
  listarAvaliacoesQuerySchema,
} from '../validators/agricultorValidators.js';

/*
 * Rotas PUBLICAS do modulo de agricultores, montadas em /api/v1/agricultores.
 *
 * Nenhuma delas usa checkJwt. O marketplace precisa que a vitrine do
 * produtor seja visivel para quem ainda nao criou conta - e uma das
 * principais portas de entrada do site.
 *
 * Ordem dos middlewares: validacao -> controller.
 *
 * Repare que NAO ha requireRole em nenhuma rota daqui: como nao ha
 * autenticacao, nao ha papel a exigir. A protecao dessas rotas e a
 * projecao de dados do repository, que nao devolve e-mail, telefone nem
 * endereco (ver a nota em agricultorRepository.js).
 */

const router = Router();

/* GET /api/v1/agricultores - lista publica de produtores. */
router.get(
  '/',
  validar({ query: listarAgricultoresQuerySchema }),
  agricultorController.listar,
);

/*
 * GET /api/v1/agricultores/:id - perfil publico (produtor + vitrine +
 * reputacao em uma resposta so).
 *
 * A query e validada aqui tambem porque o perfil aceita recortar a
 * vitrine por categoria e ordenacao. Sem essa validacao, um valor
 * arbitrario de `ordenar` chegaria ao repository - que o descarta por
 * lista branca, mas e mais claro recusar na borda.
 */
router.get(
  '/:id',
  validar({ params: agricultorIdParamSchema, query: listarProdutosDoAgricultorQuerySchema }),
  agricultorController.obter,
);

/* GET /api/v1/agricultores/:id/produtos - vitrine paginada. */
router.get(
  '/:id/produtos',
  validar({ params: agricultorIdParamSchema, query: listarProdutosDoAgricultorQuerySchema }),
  agricultorController.listarProdutos,
);

/* GET /api/v1/agricultores/:id/avaliacoes - avaliacoes recebidas. */
router.get(
  '/:id/avaliacoes',
  validar({ params: agricultorIdParamSchema, query: listarAvaliacoesQuerySchema }),
  agricultorController.listarAvaliacoes,
);

export default router;
