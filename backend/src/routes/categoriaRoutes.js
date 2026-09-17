import { Router } from 'express';
import categoriaController from '../controllers/categoriaController.js';
import { validar } from '../middlewares/validar.js';
import {
  categoriaIdOuSlugParamSchema,
  listarCategoriasQuerySchema,
  obterCategoriaAdminQuerySchema,
} from '../validators/categoriaValidators.js';

/*
 * Rotas PUBLICAS de categorias, montadas em /api/v1/categorias.
 *
 * Categoria e dado de referencia do catalogo: o visitante precisa dela
 * para montar o filtro do marketplace, antes mesmo de ter conta. Por isso
 * a leitura e publica e a escrita nao.
 *
 * A escrita (criar, editar, desativar) fica em /admin/categorias, com
 * requireRole('administrador'). Manter as duas em arquivos separados
 * deixa explicito, na leitura do codigo, quais rotas sao publicas - em
 * vez de depender de reparar em quais delas falta o checkJwt.
 */

const router = Router();

/* GET /api/v1/categorias - listagem publica (somente ativas). */
router.get(
  '/',
  validar({ query: listarCategoriasQuerySchema }),
  categoriaController.listar,
);

/*
 * GET /api/v1/categorias/:id - detalhe por id OU slug.
 *
 * O schema do parametro aceita as duas formas; o service decide qual e.
 *
 * SEGURANCA: a query validada aqui e `listarCategoriasQuerySchema`, que
 * NAO declara `incluir_inativa`. Como o Zod remove campos nao
 * declarados, um visitante que envie ?incluir_inativa=true nao tem
 * efeito nenhum - o campo e descartado antes de chegar ao controller.
 * A variante administrativa e aceita apenas em /admin/categorias/:id.
 */
router.get(
  '/:id',
  validar({ params: categoriaIdOuSlugParamSchema, query: listarCategoriasQuerySchema }),
  categoriaController.obter,
);

export default router;
