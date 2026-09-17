import { Router } from 'express';
import carrinhoController from '../controllers/carrinhoController.js';
import { checkJwt } from '../middlewares/checkJwt.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validar } from '../middlewares/validar.js';
import {
  adicionarItemSchema,
  alterarQuantidadeSchema,
  produtoIdParamSchema,
} from '../validators/carrinhoValidators.js';

/*
 * Rotas do carrinho, montadas em /api/v1/carrinho.
 *
 * TODAS exigem autenticacao e perfil `cliente`. O carrinho e sempre o do
 * usuario do token - nao existe `carrinho_id` em nenhuma rota, e por
 * isso nao ha como um cliente acessar ou alterar o carrinho de outro.
 * Esse e o motivo de o recurso ser endereçado por "meu carrinho" em vez
 * de `/carrinho/:id`: o id nunca precisa ser enviado, entao nao pode ser
 * forjado (IDOR deixa de existir por construcao).
 *
 * O produto, esse sim, vem na URL - mas ele nao identifica um recurso
 * privado, e sim um item do catalogo publico. Ainda assim, o service
 * confere a visibilidade antes de aceitar.
 */

const router = Router();

const apenasCliente = [checkJwt, requireRole('cliente')];

router.use(...apenasCliente);

/* GET /api/v1/carrinho - carrinho atual, criado se ainda nao existir. */
router.get('/', carrinhoController.obter);

/*
 * GET /api/v1/carrinho/validacao - revalida precos e estoque antes do
 * checkout. Declarada antes de qualquer rota com parametro, pela mesma
 * razao de /produtos/meus.
 */
router.get('/validacao', carrinhoController.validar);

/* POST /api/v1/carrinho/itens - adiciona produto (soma quantidade). */
router.post(
  '/itens',
  validar({ body: adicionarItemSchema }),
  carrinhoController.adicionarItem,
);

/* PATCH /api/v1/carrinho/itens/:produtoId - define a quantidade exata. */
router.patch(
  '/itens/:produtoId',
  validar({ params: produtoIdParamSchema, body: alterarQuantidadeSchema }),
  carrinhoController.alterarQuantidade,
);

/* DELETE /api/v1/carrinho/itens/:produtoId - remove um item. */
router.delete(
  '/itens/:produtoId',
  validar({ params: produtoIdParamSchema }),
  carrinhoController.removerItem,
);

/* DELETE /api/v1/carrinho - esvazia o carrinho. */
router.delete('/', carrinhoController.limpar);

export default router;
