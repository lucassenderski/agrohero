import { Router } from 'express';
import authController from '../controllers/authController.js';
import { validar } from '../middlewares/validar.js';
import { limiteLogin } from '../middlewares/rateLimit.js';
import { cadastroSchema, loginSchema } from '../validators/authValidators.js';

/*
 * Rotas publicas de autenticacao, montadas em /api/v1/auth.
 *
 * Ordem dos middlewares, sempre a mesma:
 *   rate limit -> validacao -> controller
 *
 * O rate limit vem ANTES da validacao de proposito: se a validacao
 * viesse primeiro, um atacante poderia disparar milhares de requisicoes
 * com corpo invalido e cada uma custaria um parse de Zod. Limitando
 * antes, o trabalho pesado nem acontece.
 */

const router = Router();

/*
 * POST /api/v1/auth/register
 *
 * Cadastro publico. O rate limit de login tambem se aplica aqui porque
 * cadastro e igualmente abusavel: sem limite, da para criar milhares de
 * contas e inflar o banco.
 */
router.post(
  '/register',
  limiteLogin,
  validar({ body: cadastroSchema }),
  authController.cadastrar,
);

/*
 * POST /api/v1/auth/login
 *
 * O limite estrito aqui e a defesa principal contra forca bruta de senha.
 */
router.post(
  '/login',
  limiteLogin,
  validar({ body: loginSchema }),
  authController.entrar,
);

export default router;
