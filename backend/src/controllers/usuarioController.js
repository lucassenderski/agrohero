import usuarioService from '../services/usuarioService.js';
import { respostaSemConteudo, respostaSucesso } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller do usuario autenticado.
 *
 * Ponto critico de seguranca: todas as funcoes usam req.usuario.id, que
 * vem do token validado e do banco. NENHUMA delas aceita id de usuario
 * pela rota ou pelo corpo da requisicao - e por isso que nao existe
 * endpoint para "ler o perfil do usuario X". Essa ausencia e a protecao:
 * nao ha o que autorizar se o alvo e sempre o proprio chamador.
 */

/* GET /usuarios/profile */
export const obterPerfil = asyncHandler(async (req, res) => {
  const perfil = await usuarioService.obterPerfil(req.usuario.id);

  return respostaSucesso(res, perfil);
});

/* PUT /usuarios/profile */
export const atualizarPerfil = asyncHandler(async (req, res) => {
  const dados = req.dadosValidados.body;

  const atualizado = await usuarioService.atualizarPerfil(req.usuario.id, dados);

  return respostaSucesso(res, atualizado);
});

/* PUT /usuarios/senha */
export const trocarSenha = asyncHandler(async (req, res) => {
  const { senha_atual, nova_senha } = req.dadosValidados.body;

  await usuarioService.trocarSenha(req.usuario.id, {
    senhaAtual: senha_atual,
    novaSenha: nova_senha,
  });

  /*
   * 204 No Content: a senha mudou, nao ha representacao nova para
   * devolver. O frontend deve redirecionar para o login (os tokens
   * antigos continuam validos ate expirar; veja a nota no service).
   */
  return respostaSemConteudo(res);
});

/*
 * PUT /usuarios/logo
 *
 * Recebe multipart/form-data com o campo `logo`. O multer ja rodou antes
 * deste handler e deixou o arquivo em `req.file`.
 */
export const enviarLogo = asyncHandler(async (req, res) => {
  const resultado = await usuarioService.salvarLogo(req.usuario.id, req.file);

  return respostaSucesso(res, resultado);
});

/* DELETE /usuarios/logo - volta para a imagem padrao. */
export const removerLogo = asyncHandler(async (req, res) => {
  const resultado = await usuarioService.removerLogo(req.usuario.id);

  return respostaSucesso(res, resultado);
});

export default { obterPerfil, atualizarPerfil, trocarSenha, enviarLogo, removerLogo };
