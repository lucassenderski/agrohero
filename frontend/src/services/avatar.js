import { api, obterToken } from './api.js';

/*
 * Avatar do usuario logado (foto de perfil).
 *
 * Nenhuma chamada leva id: o backend grava e le sempre a conta de quem
 * esta no token. E o que impede alguem de trocar ou ver a foto de outra
 * pessoa - a rota nao aceita id nenhum.
 */

/* Envia o arquivo escolhido. O FormData e reconhecido pela camada de API. */
export async function enviarAvatar(arquivo) {
  const formulario = new FormData();
  formulario.append('avatar', arquivo);

  const resposta = await api.put('/usuarios/avatar', formulario);
  return resposta.dados;
}

export async function removerAvatar() {
  const resposta = await api.delete('/usuarios/avatar');
  return resposta.dados;
}

/*
 * Busca os bytes do avatar autenticado e devolve um object URL (ou null).
 *
 * POR QUE NAO UM <img src="/usuarios/avatar"> DIRETO
 *
 * A rota exige o cabecalho `Authorization`, e um `<img>` NAO envia
 * cabecalhos customizados - ele faz a requisicao simples do navegador.
 * Apontar o `src` para a API faria a requisicao chegar sem token, e o
 * backend responderia 401: o usuario veria o icone de imagem quebrada no
 * lugar da propria foto.
 *
 * As alternativas foram descartadas de proposito:
 *
 *   - token na query string: vaza credencial no historico do navegador,
 *     no log do servidor e no cabecalho Referer;
 *   - rota publica por id: exporia a foto de qualquer pessoa, que e
 *     exatamente o que a ausencia de rota publica evita (ver a nota de
 *     privacidade em `usuarioService.obterAvatar`).
 *
 * Entao buscamos os bytes com o cabecalho correto e montamos um object URL
 * local. Aqui usamos `fetch` direto, e nao o cliente compartilhado
 * (`api.js`), porque aquele existe para o envelope JSON: esta resposta e
 * uma imagem, e `resposta.json()` a destruiria.
 *
 * Quem chama e responsavel por revogar o object URL com
 * `URL.revokeObjectURL` (ver `useAvatar`), senao o blob fica na memoria
 * da aba ate o reload.
 */
export async function buscarAvatarBlob() {
  const base = import.meta.env.VITE_API_URL;
  const token = obterToken();

  const resposta = await fetch(`${base}/usuarios/avatar`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  // 404 e o estado NORMAL de quem nunca enviou foto, nao um erro: a
  // interface usa as iniciais nesse caso.
  if (resposta.status === 404) return null;

  if (!resposta.ok) {
    throw new Error(`Falha ao carregar o avatar (${resposta.status}).`);
  }

  return resposta.blob();
}

export default { enviarAvatar, removerAvatar, buscarAvatarBlob };
