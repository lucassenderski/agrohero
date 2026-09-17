import { Router } from 'express';
import usuarioController from '../controllers/usuarioController.js';
import { checkJwt } from '../middlewares/checkJwt.js';
import { validar } from '../middlewares/validar.js';
import {
  atualizarPerfilSchema,
  trocarSenhaSchema,
} from '../validators/usuarioValidators.js';

/*
 * Rotas do usuario autenticado, montadas em /api/v1/usuarios.
 *
 * Todas protegidas por checkJwt. Nao existe rota /usuarios/:id de
 * proposito: o requisito 8 do projeto diz que um consumidor nao pode
 * ver dados privados de outro consumidor. A forma mais segura de
 * garantir isso e nao oferecer a rota - a identidade vem sempre do
 * token.
 */

const router = Router();

/*
 * checkJwt aplicado ao router inteiro.
 *
 * Vantagem sobre repetir em cada rota: uma rota nova adicionada aqui no
 * futuro ja nasce protegida. Se a protecao fosse por rota, esquecer de
 * escrever checkJwt em uma delas criaria um endpoint aberto - e esse
 * tipo de falha passa despercebido na revisao.
 */
router.use(checkJwt);

router.get('/profile', usuarioController.obterPerfil);

router.put(
  '/profile',
  validar({ body: atualizarPerfilSchema }),
  usuarioController.atualizarPerfil,
);

router.put(
  '/senha',
  validar({ body: trocarSenhaSchema }),
  usuarioController.trocarSenha,
);

export default router;