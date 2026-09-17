import { env } from '../config/env.js';
import { erros } from '../utils/AppError.js';

/*
 * Calculo de frete.
 *
 * ESTRATEGIA: regra simples agora, atras de uma interface estavel.
 *
 * O requisito 19 pede uma regra inicial (cidade, distancia, valor fixo,
 * faixa de preco) e depois integracao com servico externo. Por isso o
 * calculo esta isolado neste arquivo, atras de uma funcao com contrato
 * fixo: recebe itens + endereco, devolve `{ valor, motivo, gratis }`.
 *
 * Quando entrar um servico externo (Correios, Melhor Envio), este e o
 * unico arquivo que muda. O checkout nao sabe como o frete e calculado -
 * ele so consome o resultado. Sem essa separacao, a regra de frete
 * ficaria espalhada pelo checkout e a troca viraria uma cirurgia.
 *
 * REGRA ATUAL (por pedido, nao por item):
 *   1. acima de FRETE_GRATIS_ACIMA_DE (valor dos produtos) -> gratis
 *   2. mesma cidade do produtor -> valor base reduzido
 *   3. demais casos -> valor base
 *
 * DECISAO: o frete e cobrado UMA VEZ por pedido, mesmo com produtos de
 * varios produtores. Um pedido multi-agricultor entregue em endereco
 * unico tem um deslocamento so. Se no futuro cada produtor enviar
 * separado (o que e comum em marketplace), a regra passa a ser por
 * produtor e so esta funcao muda.
 */

/* Constantes de regra, nomeadas para o codigo ficar legivel. */
const FATOR_MESMA_CIDADE = 0.5;

/*
 * O frete gratis e decidido pelo valor dos PRODUTOS, e nao pelo total.
 * Usar o total criaria circularidade: o total inclui o frete, e o frete
 * dependeria do total. O banco tambem exige valor_total = valor_produtos
 * + valor_frete, entao a ordem de calculo tem de ser esta.
 */
function deveSerGratis(valorProdutos) {
  const limite = env.FRETE_GRATIS_ACIMA_DE;
  return limite > 0 && valorProdutos >= limite;
}

/* Compara cidade/estado do produtor com o endereco de entrega. */
function ehMesmaLocalidade(cidadeProdutor, estadoProdutor, endereco) {
  if (!cidadeProdutor || !endereco?.cidade) return false;

  const mesmaCidade =
    cidadeProdutor.trim().toLowerCase() === endereco.cidade.trim().toLowerCase();

  const mesmoEstado =
    (estadoProdutor ?? '').trim().toUpperCase() === (endereco.estado ?? '').trim().toUpperCase();

  return mesmaCidade && mesmoEstado;
}

/*
 * Calcula o frete de um pedido.
 *
 * `itens` precisa trazer `agricultor_cidade` e `agricultor_estado` (a
 * projecao do carrinho traz). `endereco` e o snapshot ja validado.
 *
 * Devolve sempre um objeto com a mesma forma, inclusive no frete gratis
 * (valor 0 com motivo explicito) - o frontend exibe o motivo, e o
 * checkout grava o valor. Nunca devolve null nem lanca erro por falta de
 * dado de frete: frete e regra de negocio, nao validacao de entrada.
 */
export function calcularFrete(itens, endereco, valorProdutos) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw erros.regraNegocio('Nao ha itens para calcular o frete.', 'FRETE_SEM_ITENS');
  }

  if (deveSerGratis(valorProdutos)) {
    return {
      valor: 0,
      gratis: true,
      motivo: `Frete gratis para compras acima de R$ ${env.FRETE_GRATIS_ACIMA_DE.toFixed(2)}.`,
    };
  }

  const valorBase = env.FRETE_VALOR_BASE;

  /*
   * A localidade e decidida pelo PRIMEIRO item. Em pedido multi-produtor
   * de cidades diferentes, a regra simples atual usa um deles - e uma
   * limitacao consciente da versao inicial, e o motivo de existir o
   * campo `motivo` na resposta: quando o calculo passar a ser por
   * produtor, o texto explica o novo criterio.
   */
  const primeiro = itens[0];
  const mesmaCidade = ehMesmaLocalidade(
    primeiro.agricultor_cidade ?? primeiro.produto?.agricultor_cidade,
    primeiro.agricultor_estado ?? primeiro.produto?.agricultor_estado,
    endereco,
  );

  if (mesmaCidade) {
    const valor = Number((valorBase * FATOR_MESMA_CIDADE).toFixed(2));

    return {
      valor,
      gratis: false,
      motivo: `Entrega na mesma cidade do produtor (${endereco.cidade}/${endereco.estado}).`,
    };
  }

  return {
    valor: Number(valorBase.toFixed(2)),
    gratis: false,
    motivo: 'Entrega fora da cidade do produtor.',
  };
}

/*
 * Quanto falta para o frete gratis.
 *
 * Usado no carrinho e no checkout para incentivar o cliente a completar
 * o valor. Devolve 0 quando ja atingiu.
 */
export function quantoFaltaParaFreteGratis(valorProdutos) {
  const limite = env.FRETE_GRATIS_ACIMA_DE;

  if (limite <= 0 || valorProdutos >= limite) return 0;

  return Number((limite - valorProdutos).toFixed(2));
}

export default { calcularFrete, quantoFaltaParaFreteGratis };
