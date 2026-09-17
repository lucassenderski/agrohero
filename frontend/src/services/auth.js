import { api, salvarToken } from './api.js';

/*
 * Autenticacao e perfil.
 *
 * O token e gravado AQUI, e nao pelo api.post, porque `api.post` e um
 * transporte generico que nao sabe se a resposta contem sessao. Sem
 * este `salvarToken`, o login responde 200 e mesmo assim a proxima
 * requisicao sai sem cabecalho Authorization - o carrinho viraria 401
 * e o usuario veria "logado" na tela com um token que nunca existiu.
 */

export async function registrar(dados) {
  const resposta = await api.post('/auth/register', dados);
  salvarToken(resposta.dados.token);
  return resposta.dados;
}

export async function entrar(credenciais) {
  const resposta = await api.post('/auth/login', credenciais);
  salvarToken(resposta.dados.token);
  return resposta.dados;
}

export async function buscarPerfil() {
  const resposta = await api.get('/usuarios/profile');
  return resposta.dados;
}

export async function atualizarPerfil(dados) {
  const resposta = await api.put('/usuarios/profile', dados);
  return resposta.dados;
}

export async function trocarSenha(dados) {
  const resposta = await api.put('/usuarios/senha', dados);
  return resposta.dados;
}
