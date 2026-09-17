import authService from '../services/authService.js';
import { respostaCriada, respostaSucesso } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller de autenticacao.
 *
 * Regra do projeto: o controller NAO tem regra de negocio e NAO acessa o
 * banco. Ele apenas le a entrada validada, chama o service e monta a
 * resposta HTTP. Isso mantem a regra testavel sem HTTP e sem SQL.
 */

/* POST /auth/register */
export const cadastrar = asyncHandler(async (req, res) => {
  /*
   * Le de req.dadosValidados, nunca de req.body.
   *
   * req.body contem o que o cliente enviou, sem garantia de nada. O
   * objeto em dadosValidados passou pela normalizacao (trim, e-mail em
   * minusculas) e teve os campos nao declarados removidos.
   */
  const dados = req.dadosValidados.body;

  const { usuario, token } = await authService.cadastrar(dados);

  return respostaCriada(res, { usuario, token });
});

/* POST /auth/login */
export const entrar = asyncHandler(async (req, res) => {
  const { email, senha } = req.dadosValidados.body;

  const { usuario, token } = await authService.login({ email, senha });

  return respostaSucesso(res, { usuario, token });
});

export default { cadastrar, entrar };
