import { Router } from 'express';
import webhookController from '../controllers/webhookController.js';

/*
 * Rotas de webhook, montadas em /api/v1/webhooks.
 *
 * SEM `checkJwt` E SEM `requireRole` - de proposito.
 *
 * Quem chama esta rota e o gateway de pagamento, que nao tem usuario no
 * sistema. Colocar autenticacao de usuario aqui tornaria a rota
 * inutilizavel. A autenticacao e a assinatura HMAC do corpo, verificada
 * no controller antes de qualquer leitura.
 *
 * A rota aceita o identificador em dois formatos, porque gateways
 * divergem nisso:
 *
 *   POST /webhooks/pagamento                (id vem no corpo)
 *   POST /webhooks/pagamento/:identificador (id vem na URL)
 *
 * O Mercado Pago, por exemplo, manda a URL `?data.id=` e um corpo com
 * `data: { id }`. Aceitar as duas formas evita um adaptador so para
 * traduzir caminho.
 *
 * ATENCAO AO RATE LIMIT: esta rota consome a cota do limitador geral
 * (300 req/15min por IP). Um gateway que reenvie muitas notificacoes
 * pode esbarrar nisso. Em producao com volume alto, vale um limitador
 * proprio, mais generoso, aplicado so aqui. Fica anotado para a FASE 20.
 */

const router = Router();

router.post('/pagamento', webhookController.receberPagamento);
router.post('/pagamento/:identificador', webhookController.receberPagamento);

export default router;