import { ErroApi } from './api.js';

/*
 * Estado da API, exibido discretamente no rodape.
 *
 * O /health e endpoint de infraestrutura e fica FORA do versionamento
 * (responde em /health, nao em /api/v1/health), entao nao da para chama-lo
 * pelo cliente `api.js` - a URL_BASE ja inclui o prefixo. Derivamos a raiz
 * removendo o sufixo de versao.
 */
const URL_BASE = import.meta.env.VITE_API_URL;
const URL_SAUDE = `${URL_BASE.replace(/\/api\/v\d+\/?$/, '')}/health`;

export async function obterSaude() {
  let resposta;
  try {
    resposta = await fetch(URL_SAUDE, { headers: { Accept: 'application/json' } });
  } catch {
    throw new ErroApi('Sem resposta do servidor.', { codigo: 'FALHA_DE_REDE', status: 0 });
  }

  /*
   * O 503 do /health ainda traz `dados` uteis (api no ar, banco
   * indisponivel), entao lemos o corpo antes de decidir pelo status.
   */
  const payload = await resposta.json().catch(() => null);
  if (!payload?.dados) {
    throw new ErroApi('Resposta inesperada do /health.', {
      codigo: 'ERRO',
      status: resposta.status,
    });
  }

  return payload.dados;
}
