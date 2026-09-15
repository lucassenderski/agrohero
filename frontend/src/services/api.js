/*
 * Cliente HTTP unico da aplicacao.
 *
 * Por que ter uma camada so: toda requisicao precisa das mesmas coisas
 * (URL base, cabecalho de autenticacao, tratamento do envelope de erro,
 * deslogar quando o token expira). Escrever isso em cada tela levaria a
 * inconsistencias - e a maioria dos bugs de autenticacao vem exatamente
 * de uma chamada que "esqueceu" o header.
 */

const URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

/* Nome da chave no localStorage onde o token JWT e guardado. */
export const CHAVE_TOKEN = 'agrohero:token';

export function obterToken() {
  return localStorage.getItem(CHAVE_TOKEN);
}

export function salvarToken(token) {
  localStorage.setItem(CHAVE_TOKEN, token);
}

export function removerToken() {
  localStorage.removeItem(CHAVE_TOKEN);
}

/*
 * Erro de API com informacao util para a interface.
 * `codigo` permite tratar casos especificos (ESTOQUE_INSUFICIENTE) sem
 * comparar strings de mensagem.
 */
export class ErroApi extends Error {
  constructor(mensagem, { codigo = 'ERRO', status = 0, detalhes = null } = {}) {
    super(mensagem);
    this.name = 'ErroApi';
    this.codigo = codigo;
    this.status = status;
    this.detalhes = detalhes;
  }
}

/* Callback chamado quando a API responde 401 (token invalido/expirado). */
let aoPerderSessao = null;
export function configurarPerdaDeSessao(callback) {
  aoPerderSessao = callback;
}

function montarQueryString(params) {
  if (!params) return '';
  const query = new URLSearchParams();
  Object.entries(params).forEach(([chave, valor]) => {
    // Ignoramos valores vazios para nao enviar ?categoria_id= vazio,
    // que seria interpretado como filtro invalido no backend.
    if (valor !== undefined && valor !== null && valor !== '') {
      query.append(chave, valor);
    }
  });
  const texto = query.toString();
  return texto ? `?${texto}` : '';
}

/*
 * Requisicao base.
 *
 * `caminho` e relativo a URL_BASE, por exemplo: '/produtos'.
 */
export async function requisicao(caminho, { metodo = 'GET', corpo, params } = {}) {
  const token = obterToken();

  const cabecalhos = { Accept: 'application/json' };
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  const url = `${URL_BASE}${caminho}${montarQueryString(params)}`;

  let resposta;
  try {
    resposta = await fetch(url, {
      method: metodo,
      headers: cabecalhos,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    // Falha de rede (servidor fora do ar, sem internet, CORS bloqueado).
    throw new ErroApi(
      'Nao foi possivel falar com o servidor. Verifique sua conexao e tente novamente.',
      { codigo: 'FALHA_DE_REDE', status: 0 },
    );
  }

  // 204 nao tem corpo.
  if (resposta.status === 204) return null;

  let payload = null;
  try {
    payload = await resposta.json();
  } catch {
    payload = null;
  }

  if (!resposta.ok) {
    // Token invalido ou expirado: encerra a sessao local.
    if (resposta.status === 401 && aoPerderSessao) {
      aoPerderSessao();
    }

    throw new ErroApi(
      payload?.erro?.mensagem || 'Ocorreu um erro inesperado.',
      {
        codigo: payload?.erro?.codigo || 'ERRO',
        status: resposta.status,
        detalhes: payload?.erro?.detalhes || null,
      },
    );
  }

  return payload;
}

export const api = {
  get: (caminho, params) => requisicao(caminho, { metodo: 'GET', params }),
  post: (caminho, corpo) => requisicao(caminho, { metodo: 'POST', corpo }),
  put: (caminho, corpo) => requisicao(caminho, { metodo: 'PUT', corpo }),
  patch: (caminho, corpo) => requisicao(caminho, { metodo: 'PATCH', corpo }),
  delete: (caminho) => requisicao(caminho, { metodo: 'DELETE' }),
};

export default api;