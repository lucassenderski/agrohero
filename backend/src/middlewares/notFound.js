import { respostaErro } from '../utils/resposta.js';

/* Rota nao encontrada: responde 404 no envelope padrao da API. */
export function notFound(req, res) {
  return respostaErro(
    res,
    {
      codigo: 'ROTA_NAO_ENCONTRADA',
      mensagem: `A rota ${req.method} ${req.originalUrl} nao existe nesta API.`,
    },
    404,
  );
}

export default notFound;