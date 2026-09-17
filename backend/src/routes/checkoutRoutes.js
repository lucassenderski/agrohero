import { Router } from 'express';
import checkoutController from '../controllers/checkoutController.js';
import { checkJwt } from '../middlewares/checkJwt.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validar } from '../middlewares/validar.js';
import {
  finalizarCheckoutSchema,
  previaCheckoutSchema,
} from '../validators/checkoutValidators.js';

/*
 * Rotas de checkout, montadas em /api/v1/checkout.
 *
 * Exige perfil `cliente`: o checkout consome o carrinho do usuario
 * autenticado, e o carrinho e de cliente.
 *
 * Nao ha `carrinho_id` nem valor em nenhuma rota: o checkout trabalha
 * sobre o carrinho do token e recalcula todos os numeros a partir do
 * banco. O corpo carrega so `endereco_id` e `metodo_pagamento`.
 */

const router = Router();

router.use(checkJwt, requireRole('cliente'));

/*
 * POST /api/v1/checkout/preview - resumo calculado, sem gravar.
 *
 * Declarada antes de `/` apenas por clareza: sao caminhos distintos, sem
 * conflito de parametro.
 */
router.post('/preview', validar({ body: previaCheckoutSchema }), checkoutController.previa);

/* POST /api/v1/checkout - finaliza a compra (transacao). */
router.post('/', validar({ body: finalizarCheckoutSchema }), checkoutController.finalizar);

export default router;
