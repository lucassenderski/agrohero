import checkoutService from '../services/checkoutService.js';
import { respostaSucesso, respostaCriada } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller do checkout.
 *
 * Nenhuma regra mora aqui. O controller so repassa a entrada validada e
 * o usuario autenticado. Em especial, ele NAO monta valores: todo
 * calculo (produtos, frete, total) acontece no service, a partir do
 * banco.
 */

/*
 * POST /checkout/preview - resumo com valores calculados, sem gravar.
 *
 * Chamado pelo frontend a cada troca de endereco, para exibir
 * "Produtos / Frete / Total" antes de confirmar. Nao tem efeito
 * colateral, entao pode ser chamado a vontade.
 */
export const previa = asyncHandler(async (req, res) => {
  const { endereco_id: enderecoId } = req.dadosValidados.body ?? {};

  const resumo = await checkoutService.previa(req.usuario, enderecoId ?? null);

  return respostaSucesso(res, resumo);
});

/*
 * POST /checkout - finaliza a compra.
 *
 * Devolve 201 porque um recurso novo (o pedido) foi criado. O corpo
 * inclui o status do pagamento: o pedido existe independente de o
 * pagamento ter sido aprovado, recusado ou estar pendente.
 */
export const finalizar = asyncHandler(async (req, res) => {
  const { endereco_id: enderecoId, metodo_pagamento: metodoPagamento } = req.dadosValidados.body;

  const resultado = await checkoutService.finalizar(req.usuario, {
    enderecoId,
    metodoPagamento,
  });

  return respostaCriada(res, resultado);
});

export default { previa, finalizar };
