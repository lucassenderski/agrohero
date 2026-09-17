import { Router } from 'express';
import enderecoController from '../controllers/enderecoController.js';
import { checkJwt } from '../middlewares/checkJwt.js';
import { requireRole } from '../middlewares/requireRole.js';
import { validar } from '../middlewares/validar.js';
import {
  criarEnderecoSchema,
  atualizarEnderecoSchema,
  enderecoIdParamSchema,
} from '../validators/enderecoValidators.js';

/*
 * Rotas de enderecos de entrega, montadas em /api/v1/enderecos.
 *
 * Endereco e dado PESSOAL: nome completo do destinatario, CEP e rua.
 * Todas as rotas exigem `cliente` e operam apenas sobre os enderecos do
 * token. Nao existe `consumidor_id` em rota nenhuma, entao nao ha
 * parametro para forjar - e o service ainda filtra por dono em toda
 * consulta, porque "nao ter o parametro" nao protege contra um id de
 * endereco alheio chutado na URL.
 */

const router = Router();

router.use(checkJwt, requireRole('cliente'));

/* GET /api/v1/enderecos - lista (principal primeiro). */
router.get('/', enderecoController.listar);

/* POST /api/v1/enderecos - cria (o primeiro vira principal). */
router.post('/', validar({ body: criarEnderecoSchema }), enderecoController.criar);

/*
 * Cuidado com a ordem: a rota literal `/:id/principal` poderia ser
 * capturada por `/:id` se declarada depois. Como os metodos sao
 * diferentes (PATCH vs. GET/PUT/DELETE), na pratica nao ha conflito,
 * mas manter a rota mais especifica primeiro e a regra que evita o
 * problema quando alguem adicionar um metodo novo.
 */
router.patch(
  '/:id/principal',
  validar({ params: enderecoIdParamSchema }),
  enderecoController.definirPrincipal,
);

router.get('/:id', validar({ params: enderecoIdParamSchema }), enderecoController.obter);

router.put(
  '/:id',
  validar({ params: enderecoIdParamSchema, body: atualizarEnderecoSchema }),
  enderecoController.atualizar,
);

router.delete('/:id', validar({ params: enderecoIdParamSchema }), enderecoController.remover);

export default router;
