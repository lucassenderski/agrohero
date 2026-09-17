import enderecoService from '../services/enderecoService.js';
import { respostaSucesso, respostaCriada } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller de enderecos de entrega.
 *
 * Camada fina: o service recebe o usuario autenticado e opera sempre
 * sobre os enderecos dele. Nenhuma rota aceita "de quem e este
 * endereco" - o dono vem do token.
 */

/* GET /enderecos - enderecos do consumidor autenticado. */
export const listar = asyncHandler(async (req, res) => {
  const enderecos = await enderecoService.listar(req.usuario);

  return respostaSucesso(res, enderecos);
});

/* GET /enderecos/:id - detalhe de um endereco do consumidor. */
export const obter = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const endereco = await enderecoService.obter(req.usuario, id);

  return respostaSucesso(res, endereco);
});

/* POST /enderecos - cria endereco (o primeiro vira principal). */
export const criar = asyncHandler(async (req, res) => {
  const dados = req.dadosValidados.body;

  const endereco = await enderecoService.criar(req.usuario, dados);

  return respostaCriada(res, endereco);
});

/* PUT /enderecos/:id - atualiza o endereco inteiro. */
export const atualizar = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const dados = req.dadosValidados.body;

  const endereco = await enderecoService.atualizar(req.usuario, id, dados);

  return respostaSucesso(res, endereco);
});

/* PATCH /enderecos/:id/principal - define como principal. */
export const definirPrincipal = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const endereco = await enderecoService.definirPrincipal(req.usuario, id);

  return respostaSucesso(res, endereco);
});

/* DELETE /enderecos/:id - remove (com regras de ultimo/principal). */
export const remover = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  await enderecoService.remover(req.usuario, id);

  return respostaSucesso(res, { removido: true });
});

export default { listar, obter, criar, atualizar, definirPrincipal, remover };
