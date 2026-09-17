import { Router } from 'express';
import categoriaController from '../controllers/categoriaController.js';
import { checkJwt } from '../middlewares/checkJwt.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validar } from '../middlewares/validar.js';
import {
  categoriaIdParamSchema,
  criarCategoriaSchema,
  atualizarCategoriaSchema,
  listarCategoriasAdminQuerySchema,
  obterCategoriaAdminQuerySchema,
} from '../validators/categoriaValidators.js';

/*
 * Rotas ADMINISTRATIVAS de categorias.
 *
 * Montadas em /api/v1/admin/categorias (veja adminRoutes.js), entao os
 * caminhos aqui sao relativos ao prefixo: '/' vira /admin/categorias e
 * '/:id' vira /admin/categorias/:id.
 *
 * Ordem dos middlewares, sempre a mesma:
 *   checkJwt -> requireRole('administrador') -> validacao -> controller
 *
 * Por que a autorizacao vem ANTES da validacao: um cliente tentando criar
 * categoria nao deve nem ter o corpo analisado. Se a validacao viesse
 * primeiro, ele receberia 400 (dados invalidos) em vez de 403 (sem
 * permissao), e a mensagem sugeriria que basta corrigir o payload para
 * conseguir - o que nao e verdade.
 *
 * O checkJwt e aplicado no router inteiro, e nao rota a rota: uma rota
 * nova adicionada aqui ja nasce autenticada. Esquecer checkJwt em uma
 * rota e o tipo de falha que passa despercebida na revisao e vira um
 * endpoint administrativo aberto.
 */

const router = Router();

router.use(checkJwt, requireRole('administrador'));

/* GET /api/v1/admin/categorias - inclui desativadas quando pedido. */
router.get(
  '/',
  validar({ query: listarCategoriasAdminQuerySchema }),
  categoriaController.listarAdmin,
);

/* POST /api/v1/admin/categorias */
router.post(
  '/',
  validar({ body: criarCategoriaSchema }),
  categoriaController.criar,
);

/*
 * GET /api/v1/admin/categorias/:id - detalhe incluindo desativada.
 *
 * Aqui `incluir_inativa` e aceito, diferente da rota publica: e o unico
 * jeito de o admin abrir uma categoria desativada para reativa-la. O
 * schema da query tem o valor padrao `true`, entao o admin nao precisa
 * passar o parametro explicitamente.
 */
router.get(
  '/:id',
  validar({
    params: categoriaIdParamSchema,
    query: obterCategoriaAdminQuerySchema,
  }),
  categoriaController.obter,
);

/* PUT /api/v1/admin/categorias/:id */
router.put(
  '/:id',
  validar({ params: categoriaIdParamSchema, body: atualizarCategoriaSchema }),
  categoriaController.atualizar,
);

/*
 * DELETE /api/v1/admin/categorias/:id - desativacao logica.
 *
 * Nao e um DELETE fisico. `produtos.categoria_id` tem ON DELETE RESTRICT,
 * entao apagar uma categoria em uso falharia; e mesmo sem produto, apagar
 * perderia a referencia historica dos pedidos.
 */
router.delete(
  '/:id',
  validar({ params: categoriaIdParamSchema }),
  categoriaController.desativar,
);

/* PATCH /api/v1/admin/categorias/:id/ativar - reativacao. */
router.patch(
  '/:id/ativar',
  validar({ params: categoriaIdParamSchema }),
  categoriaController.ativar,
);

export default router;
