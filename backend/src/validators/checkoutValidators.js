import { z } from 'zod';
import { idParametro } from '../utils/validacao.js';

/*
 * Schemas do checkout.
 *
 * O QUE NAO EXISTE AQUI E O PONTO PRINCIPAL.
 *
 * O corpo do checkout aceita exatamente dois campos: `endereco_id` e
 * `metodo_pagamento`. Nao existe preco, subtotal, frete nem total.
 *
 * Um checkout que aceitasse `valor_total` do cliente seria o bug mais
 * caro possivel: o cliente enviaria 0.01, a API gravaria o pedido por
 * 0.01 e o produtor entregaria de graca. Como o schema nao declara esses
 * campos, o Zod os descarta e o checkout recalcula tudo a partir de
 * `produtos.preco` - a manipulacao nao tem por onde entrar.
 */

export const METODOS_PAGAMENTO = ['PIX', 'CARTAO', 'BOLETO'];

export const metodoPagamento = z.enum(METODOS_PAGAMENTO, {
  errorMap: () => ({
    message: `O metodo de pagamento deve ser um destes: ${METODOS_PAGAMENTO.join(', ')}.`,
  }),
});

/*
 * Finalizacao da compra.
 *
 * `endereco_id` e obrigatorio: sem endereco nao ha entrega, e usar o
 * principal silenciosamente faria o cliente enviar para um lugar que ele
 * nao escolheu nesta compra.
 */
export const finalizarCheckoutSchema = z.object({
  endereco_id: idParametro,
  metodo_pagamento: metodoPagamento,
});

/*
 * Previa do checkout.
 *
 * `endereco_id` e OPCIONAL: a previa serve justamente para o cliente
 * comparar o total entre enderecos, e para mostrar o resumo antes de ele
 * escolher. Sem endereco, o service usa o principal (ou estima o frete
 * base, sinalizando `endereco_definido: false`).
 */
export const previaCheckoutSchema = z.object({
  endereco_id: idParametro.optional(),
});

export default {
  finalizarCheckoutSchema,
  previaCheckoutSchema,
  METODOS_PAGAMENTO,
};
