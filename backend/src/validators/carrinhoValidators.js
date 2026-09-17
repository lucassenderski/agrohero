import { z } from 'zod';
import { idParametro, quantidade } from '../utils/validacao.js';

/*
 * Schemas do carrinho.
 *
 * O que NAO aparece nestes schemas e tao importante quanto o que
 * aparece: nao existe campo de preco, subtotal ou total em nenhum deles.
 *
 * Nao e esquecimento. Se o schema aceitasse `preco`, o cliente poderia
 * enviar 0.01 e a API teria que decidir se confia. Como o campo nao
 * existe, o Zod o descarta e o preco so pode vir de `produtos.preco`. A
 * manipulacao de preco deixa de ser um caso a tratar e passa a ser
 * impossivel - que e o requisito 14 levado a serio.
 */

/*
 * Adicionar item.
 *
 * `quantidade` e obrigatoria e maior que zero (o helper `quantidade` ja
 * valida inteiro e positivo). Nao ha limite maximo aqui: o teto real e o
 * estoque do produto, conferido no service contra o banco. Colocar um
 * numero fixo no schema (ex.: max 99) seria um limite inventado que nao
 * corresponde a nenhuma regra de negocio.
 */
export const adicionarItemSchema = z.object({
  produto_id: idParametro,
  quantidade: quantidade.max(9999, 'A quantidade informada e muito alta.'),
});

/*
 * Alterar a quantidade de um item ja existente.
 *
 * A quantidade vem no corpo e o produto na URL. Manter o produto na URL
 * (e nao no corpo) deixa a operacao REST coerente: o recurso alterado e
 * o item daquele produto.
 */
export const alterarQuantidadeSchema = z.object({
  quantidade: quantidade.max(9999, 'A quantidade informada e muito alta.'),
});

/* Parametro de rota do produto. */
export const produtoIdParamSchema = z.object({
  produtoId: idParametro,
});

export default {
  adicionarItemSchema,
  alterarQuantidadeSchema,
  produtoIdParamSchema,
};
