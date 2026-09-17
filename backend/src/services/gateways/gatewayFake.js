import { env } from '../../config/env.js';
import logger from '../../config/logger.js';

/*
 * Gateway de pagamento SIMULADO.
 *
 * Existe para o checkout poder ser desenvolvido, testado e demonstrado
 * de ponta a ponta sem depender de credenciais de terceiros. Nao chama
 * nenhuma API externa: decide o resultado por uma regra deterministica.
 *
 * IMPORTANTE - NAO E UM GATEWAY REAL. Ele nunca deve ir para producao
 * processando dinheiro de verdade. A selecao acontece em `paymentService`,
 * que escolhe este adaptador apenas quando PAYMENT_GATEWAY=fake.
 *
 * REGRA DETERMINISTICA (para os testes serem reproduziveis):
 *   - valor terminando em ,13  -> RECUSADO   (simula cartao sem limite)
 *   - valor terminando em ,99  -> PENDENTE   (simula PIX aguardando)
 *   - qualquer outro valor     -> APROVADO
 *
 * Um gateway que devolvesse resultado aleatorio tornaria os testes
 * instaveis - o mesmo teste passaria e falharia sem nenhuma mudanca de
 * codigo. Determinismo aqui vale mais que realismo.
 */

/* Gera um identificador externo previsivel e unico. */
function gerarIdentificador() {
  const aleatorio = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `FAKE-${Date.now()}-${aleatorio}`;
}

/*
 * Processa um pagamento.
 *
 * Contrato que QUALQUER adaptador de gateway precisa cumprir - este e o
 * ponto da camada de abstracao:
 *
 *   entrada: { valor, metodo, pedidoId, descricao }
 *   saida:   { status, identificadorExterno, resumo, mensagem }
 *
 * `status` usa o vocabulario de `pagamentos.status` (PENDENTE, APROVADO,
 * RECUSADO, CANCELADO, REEMBOLSADO), para o resultado entrar no banco
 * sem traducao.
 */
export async function processar({ valor, metodo, pedidoId, descricao }) {
  const centavos = Math.round((Number(valor) % 1) * 100);

  let status = 'APROVADO';
  let mensagem = 'Pagamento aprovado.';

  if (centavos === 13) {
    status = 'RECUSADO';
    mensagem = 'Pagamento recusado pelo emissor (simulado).';
  } else if (centavos === 99) {
    status = 'PENDENTE';
    mensagem = 'Pagamento aguardando confirmacao (simulado).';
  }

  const identificadorExterno = gerarIdentificador();

  logger.info(
    { pedidoId, metodo, valor, status, identificadorExterno, gateway: 'fake' },
    'Pagamento simulado processado',
  );

  return {
    status,
    identificadorExterno,
    mensagem,
    /*
     * `resumo` e o que sera gravado em `pagamentos.resumo_gateway`.
     * Guardamos um resumo minimo e NUNCA o payload completo - um payload
     * de gateway pode conter dado sensivel do pagador. Alem disso, so
     * campos que fazem sentido existir aqui entram.
     */
    resumo: {
      gateway: 'fake',
      metodo,
      status,
      valor: Number(valor),
      descricao: descricao ?? null,
      simulado: true,
    },
  };
}

/*
 * Estorna um pagamento.
 *
 * Usado quando o pedido e cancelado depois de pago. No gateway real isso
 * vira uma chamada de refund; aqui so sinaliza sucesso.
 */
export async function estornar({ identificadorExterno, valor, motivo }) {
  logger.info(
    { identificadorExterno, valor, motivo, gateway: 'fake' },
    'Estorno simulado processado',
  );

  return {
    status: 'REEMBOLSADO',
    identificadorExterno,
    mensagem: 'Estorno simulado concluido.',
    resumo: { gateway: 'fake', status: 'REEMBOLSADO', valor: Number(valor), motivo: motivo ?? null },
  };
}

/*
 * Consulta o status de um pagamento.
 *
 * No gateway real serve para reconciliar quando o webhook se perde. Aqui
 * devolve o status que foi passado, porque o estado autoritativo esta no
 * nosso banco.
 */
export async function consultar({ identificadorExterno, statusAtual }) {
  return {
    status: statusAtual ?? 'PENDENTE',
    identificadorExterno,
    resumo: { gateway: 'fake', consulta: true },
  };
}

/* Indica se o adaptador esta configurado e pronto para uso. */
export function estaConfigurado() {
  return !env.ehProducao;
}

export default { processar, estornar, consultar, estaConfigurado };
