import { z } from 'zod';
import { idParametro, telefone as telefoneSchema } from '../utils/validacao.js';

/*
 * Schemas do checkout.
 *
 * O QUE NAO EXISTE AQUI E O PONTO PRINCIPAL.
 *
 * O corpo do checkout aceita exatamente tres campos: `endereco_id`,
 * `metodo_pagamento` e `telefone_contato`. Nao existe preco, subtotal,
 * frete nem total.
 *
 * Um checkout que aceitasse `valor_total` do cliente seria o bug mais
 * caro possivel: o cliente enviaria 0.01, a API gravaria o pedido por
 * 0.01 e o produtor entregaria de graca. Como o schema nao declara esses
 * campos, o Zod os descarta e o checkout recalcula tudo a partir de
 * `produtos.preco` - a manipulacao nao tem por onde entrar.
 */

/*
 * Metodos aceitos no checkout.
 *
 * Todos sao pagos NO LOCAL da retirada/entrega - nao ha cobranca online.
 * A escolha aqui e um compromisso: o cliente informa como pretende pagar
 * para o produtor se preparar (ter troco, levar a maquininha), e o
 * registro de pagamento nasce PENDENTE. Quem confirma o recebimento e o
 * produtor.
 *
 * BOLETO saiu: nao se compensa um boleto na retirada.
 */
export const METODOS_PAGAMENTO = ['PIX', 'CARTAO', 'DINHEIRO'];

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
 *
 * `telefone_contato` e OPCIONAL no schema. O telefone e o contato que o
 * produtor usa na entrega, e o cadastro pode nao ter um - por isso o
 * checkout oferece o campo. Ele fica opcional aqui, e nao obrigatorio,
 * por duas razoes:
 *
 *   - quem ja tem telefone no perfil nao precisa reenviar: o service
 *     cai no telefone do cadastro quando este campo vem ausente;
 *   - o schema continua aceitando o mesmo corpo de antes, entao a API
 *     nao quebra para nenhum cliente existente.
 *
 * A obrigatoriedade na TELA (pedir o numero a quem nao tem) e decisao de
 * interface, nao da API. Quando o campo vem preenchido, ele VENCE o
 * telefone do perfil: e o numero que o cliente confirmou para ESTA
 * entrega.
 */
export const finalizarCheckoutSchema = z.object({
  endereco_id: idParametro,
  metodo_pagamento: metodoPagamento,
  telefone_contato: telefoneSchema,
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
