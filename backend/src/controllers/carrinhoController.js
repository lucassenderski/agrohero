import carrinhoService from '../services/carrinhoService.js';
import { respostaSucesso } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller do carrinho.
 *
 * Camada fina de proposito: le a entrada ja validada, chama o service e
 * devolve o carrinho inteiro recalculado.
 *
 * Por que devolver o carrinho COMPLETO em toda operacao (adicionar,
 * alterar, remover) em vez de so o item alterado: o total depende de
 * todos os itens, e o preco de cada um vem do banco. Se a resposta
 * trouxesse apenas o item mexido, o frontend teria que recalcular o
 * total por conta propria - exatamente a conta que nao deve ser feita
 * no cliente. Devolver o carrinho pronto garante que o numero exibido e
 * o numero do servidor.
 */

/* GET /carrinho - carrinho do consumidor autenticado. */
export const obter = asyncHandler(async (req, res) => {
  const carrinho = await carrinhoService.obter(req.usuario);

  return respostaSucesso(res, carrinho);
});

/* POST /carrinho/itens - adiciona produto (soma quantidade). */
export const adicionarItem = asyncHandler(async (req, res) => {
  const { produto_id: produtoId, quantidade } = req.dadosValidados.body;

  const carrinho = await carrinhoService.adicionarItem(req.usuario, produtoId, quantidade);

  return respostaSucesso(res, carrinho, 201);
});

/* PATCH /carrinho/itens/:produtoId - define a quantidade exata. */
export const alterarQuantidade = asyncHandler(async (req, res) => {
  const { produtoId } = req.dadosValidados.params;
  const { quantidade } = req.dadosValidados.body;

  const carrinho = await carrinhoService.definirQuantidade(req.usuario, produtoId, quantidade);

  return respostaSucesso(res, carrinho);
});

/* DELETE /carrinho/itens/:produtoId - remove o item. */
export const removerItem = asyncHandler(async (req, res) => {
  const { produtoId } = req.dadosValidados.params;

  const carrinho = await carrinhoService.removerItem(req.usuario, produtoId);

  return respostaSucesso(res, carrinho);
});

/* DELETE /carrinho - esvazia o carrinho. */
export const limpar = asyncHandler(async (req, res) => {
  const carrinho = await carrinhoService.limpar(req.usuario);

  return respostaSucesso(res, carrinho);
});

/*
 * GET /carrinho/validacao - checa o carrinho antes do checkout.
 *
 * Existe como rota separada para o frontend poder chamar antes de
 * mostrar o botao de fechar pedido, e informar o cliente do que
 * mudou (preco, estoque) sem tentar criar um pedido invalido.
 */
export const validar = asyncHandler(async (req, res) => {
  const resultado = await carrinhoService.validarParaCheckout(req.usuario);

  return respostaSucesso(res, resultado);
});

export default {
  obter,
  adicionarItem,
  alterarQuantidade,
  removerItem,
  limpar,
  validar,
};
