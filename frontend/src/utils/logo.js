/*
 * Logo da propriedade.
 *
 * Dois problemas resolvidos aqui, os dois de "detalhe" que quebram a tela
 * inteira se ficarem espalhados por cada componente:
 *
 *   1. A API devolve `logo_url` como caminho RELATIVO
 *      ("/agricultores/12/logo"). Um `<img src>` com esse valor aponta
 *      para o frontend, nao para a API - e o servidor do frontend
 *      responde 404 (ou, pior, o index.html em uma SPA com fallback, e o
 *      navegador tenta decodificar HTML como imagem). Entao toda URL de
 *      logo passa por `urlLogo`, que prefixa a base da API.
 *
 *   2. Produtor sem logo tem `logo_url: null`. Em vez de repetir
 *      `logo_url ? ... : <div>🚜</div>` em cada card, o componente usa
 *      `urlLogo` e sempre recebe algo renderizavel.
 */

const URL_BASE = import.meta.env.VITE_API_URL || '';

/* Imagem padrao, servida pelo proprio frontend (public/logo-padrao.svg). */
export const LOGO_PADRAO = '/logo-padrao.svg';

/*
 * Converte o `logo_url` da API em uma URL utilizavel no `<img>`.
 *
 * Devolve a imagem padrao quando nao ha logo. Assim o chamador nunca
 * precisa testar o caso nulo - e a decisao de qual padrao usar fica em um
 * lugar so.
 */
export function urlLogo(logoUrl) {
  if (!logoUrl) return LOGO_PADRAO;

  /*
   * Ja e absoluta (http/https) ou um data URI: devolve como veio. Isso
   * mantem a funcao correta caso a API passe a devolver URLs completas
   * (um CDN, por exemplo) - sem alterar os componentes.
   */
  if (/^(https?:)?\/\//.test(logoUrl) || logoUrl.startsWith('data:')) {
    return logoUrl;
  }

  const base = URL_BASE.replace(/\/$/, '');
  const caminho = logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`;

  return `${base}${caminho}`;
}

/* Ha uma logo enviada pelo produtor? (O padrao nao conta.) */
export function temLogoPropria(logoUrl) {
  return Boolean(logoUrl);
}
