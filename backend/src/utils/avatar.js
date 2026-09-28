/*
 * Derivacao do avatar na resposta do usuario.
 *
 * POR QUE UM UTIL, E NAO A LINHA EM CADA SERVICE
 *
 * O objeto `usuario` sai em tres respostas diferentes: login, cadastro e
 * leitura de perfil. Se so o perfil derivasse `avatar_url`, quem acabou de
 * entrar receberia um usuario sem esse campo - e o cabecalho mostraria as
 * iniciais ate a pagina ser recarregada, mesmo para quem tem foto. Com a
 * derivacao em um lugar so, as tres respostas tem exatamente o mesmo
 * formato.
 *
 * `tem_avatar` (booleano, vindo de COLUNAS_PUBLICAS) e a fonte: os BYTES
 * do avatar nunca entram no objeto do usuario, porque `checkJwt` le esse
 * objeto a cada requisicao autenticada e trazer a imagem junto carregaria
 * dezenas de KB por chamada para jogar fora em seguida.
 *
 * A URL e um CAMINHO RELATIVO, e nao um endereco absoluto: gravar o
 * dominio amarraria a resposta ao ambiente atual (localhost, preview,
 * producao) e quebraria ao trocar de host. O frontend monta a URL final
 * com a base que ja usa para toda a API.
 */
export function comAvatarUrl(usuario) {
  if (!usuario) return usuario;

  return {
    ...usuario,
    avatar_url: usuario.tem_avatar ? '/usuarios/avatar' : null,
  };
}

export default { comAvatarUrl };
