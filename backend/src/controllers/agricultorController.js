import agricultorService from '../services/agricultorService.js';
import { respostaSucesso } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller do perfil publico do produtor.
 *
 * Rotas publicas: nao ha checkJwt, logo nao ha req.usuario. Isso e
 * proposital e nao um esquecimento - o requisito 13 diz que o consumidor
 * acessa o perfil do produtor, e a vitrine precisa ser visivel para quem
 * ainda nao tem conta (e a principal porta de entrada do marketplace).
 *
 * O controller nao tem regra de negocio: le a entrada validada, chama o
 * service e monta a resposta.
 */

/* GET /agricultores */
export const listar = asyncHandler(async (req, res) => {
  const filtros = req.dadosValidados.query;

  const { itens, paginacao } = await agricultorService.listar(filtros);

  return respostaSucesso(res, itens, 200, paginacao);
});

/* GET /agricultores/:id */
export const obter = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const { categoria_id: categoriaId, ordenar } = req.dadosValidados.query ?? {};

  const perfil = await agricultorService.obterPerfilPublico(id, {
    categoriaId,
    ordenarProdutos: ordenar,
  });

  return respostaSucesso(res, perfil);
});

/* GET /agricultores/:id/produtos */
export const listarProdutos = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const filtros = req.dadosValidados.query;

  const { itens, paginacao } = await agricultorService.listarProdutos(id, filtros);

  return respostaSucesso(res, itens, 200, paginacao);
});

/* GET /agricultores/:id/avaliacoes */
export const listarAvaliacoes = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const filtros = req.dadosValidados.query;

  const { itens, paginacao, reputacao } = await agricultorService.listarAvaliacoes(id, filtros);

  return respostaSucesso(res, { avaliacoes: itens, reputacao }, 200, paginacao);
});

export default { listar, obter, listarProdutos, listarAvaliacoes };
