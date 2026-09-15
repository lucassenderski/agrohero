/*
 * Formato unico de resposta da API.
 *
 * Sucesso:
 *   { "sucesso": true, "dados": {...}, "paginacao": {...} }
 * Erro:
 *   { "sucesso": false, "erro": { "codigo": "...", "mensagem": "...", "detalhes": [...] } }
 *
 * Ter um envelope unico no frontend significa escrever o tratamento de
 * erro UMA vez, em services/api.js, em vez de adivinhar o formato em
 * cada tela.
 */

export function respostaSucesso(res, dados = null, statusCode = 200, paginacao = null) {
  const corpo = { sucesso: true, dados };
  if (paginacao) corpo.paginacao = paginacao;
  return res.status(statusCode).json(corpo);
}

export function respostaCriada(res, dados = null) {
  return respostaSucesso(res, dados, 201);
}

export function respostaSemConteudo(res) {
  return res.status(204).send();
}

export function respostaErro(res, { codigo = 'ERRO', mensagem, detalhes = null }, statusCode = 400) {
  const erro = { codigo, mensagem };
  // `detalhes` so aparece quando existe e e uma lista de validacao
  // (nunca stack trace).
  if (detalhes && Array.isArray(detalhes) && detalhes.length > 0) {
    erro.detalhes = detalhes;
  }
  return res.status(statusCode).json({ sucesso: false, erro });
}

export default { respostaSucesso, respostaCriada, respostaSemConteudo, respostaErro };