import categoriaService from '../services/categoriaService.js';
import {
  respostaSucesso,
  respostaCriada,
  respostaSemConteudo,
} from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller de categorias.
 *
 * Le a entrada validada, chama o service e monta a resposta HTTP. Nenhuma
 * regra de negocio mora aqui.
 */

/* GET /categorias - listagem publica (somente ativas). */
export const listar = asyncHandler(async (req, res) => {
  const filtros = req.dadosValidados.query;

  const { itens, paginacao } = await categoriaService.listar({}, filtros);

  return respostaSucesso(res, itens, 200, paginacao);
});

/*
 * GET /categorias/:id - detalhe publico.
 *
 * O parametro aceita id numerico ou slug, e o service decide qual dos
 * dois veio. A validacao de formato ja garante que nenhum valor estranho
 * chega ao banco.
 */
export const obter = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const incluirInativa = req.dadosValidados.query?.incluir_inativa ?? false;

  const categoria = await categoriaService.obter(id, { incluirInativa });

  return respostaSucesso(res, categoria);
});

/*
 * --- Rotas administrativas -------------------------------------------
 *
 * Todas exigem administrador, garantido pelo requireRole nas rotas. O
 * controller confia em `req.usuario`, que foi carregado do banco pelo
 * checkJwt - nunca em um id vindo do corpo ou da URL.
 */

/* GET /admin/categorias - listagem que pode incluir inativas. */
export const listarAdmin = asyncHandler(async (req, res) => {
  const { incluir_inativas: incluirInativas, ...filtros } = req.dadosValidados.query;

  const { itens, paginacao } = await categoriaService.listar({ incluirInativas }, filtros);

  return respostaSucesso(res, itens, 200, paginacao);
});

/* POST /admin/categorias */
export const criar = asyncHandler(async (req, res) => {
  const dados = req.dadosValidados.body;

  const categoria = await categoriaService.criar(dados, req.usuario.id);

  return respostaCriada(res, categoria);
});

/* PUT /admin/categorias/:id */
export const atualizar = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const dados = req.dadosValidados.body;

  const categoria = await categoriaService.atualizar(id, dados, req.usuario.id);

  return respostaSucesso(res, categoria);
});

/*
 * DELETE /admin/categorias/:id - desativacao logica.
 *
 * A resposta traz `produtos_afetados` para o admin confirmar o efeito.
 * Devolvemos 200 e nao 204 porque ha informacao util no corpo: quantos
 * produtos sairam do marketplace junto com a categoria.
 */
export const desativar = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const resultado = await categoriaService.desativar(id, req.usuario.id);

  return respostaSucesso(res, resultado);
});

/* PATCH /admin/categorias/:id/ativar */
export const ativar = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const resultado = await categoriaService.ativar(id, req.usuario.id);

  return respostaSucesso(res, resultado);
});

export default { listar, obter, listarAdmin, criar, atualizar, desativar, ativar };
