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
 * LEDGER DE TRANSACOES.
 *
 * O gateway guarda o status de cada transacao que ele mesmo processou, e
 * `consultar()` responde a partir DAQUI - nunca a partir do que o banco
 * local diz.
 *
 * Por que isso importa: se `consultar` devolvesse o status local, a
 * reconciliacao viraria um espelho e nunca discordaria de nada. Um fake
 * que sempre concorda esconde exatamente o bug que a reconciliacao
 * existe para pegar. Com um ledger proprio, o gateway tem opiniao, e o
 * sistema pode discordar dele de verdade.
 *
 * Em memoria porque o fake e de desenvolvimento. Um reinicio limpa o
 * ledger, o que e aceitavel: transacao simulada nao vale entre sessoes.
 */
const ledger = new Map();

/*
 * CONTROLE DE SIMULACAO (somente o gateway fake tem isto).
 *
 * Representa um evento EXTERNO: o pagador concluiu o PIX no banco dele.
 * Nao e algo que o nosso sistema decide - e justamente por isso que ele
 * nao aparece na API: quem marca o pagamento como aprovado de verdade e
 * o gateway, e o nosso lado so descobre por webhook.
 *
 * O nome com underscore sinaliza que e controle de teste, e nao parte do
 * contrato de adaptador.
 */
export function _simularPagamentoConfirmado(identificadorExterno) {
  ledger.set(String(identificadorExterno), 'APROVADO');
}

/* Registra um status arbitrario no ledger (monta cenarios de teste). */
export function _registrarStatus(identificadorExterno, status) {
  ledger.set(String(identificadorExterno), status);
}

/* Remove uma transacao do ledger, simulando um gateway sem esse registro. */
export function _limparLedger(identificadorExterno) {
  ledger.delete(String(identificadorExterno));
}

/* Limpa o ledger inteiro. Usado entre testes para evitar contaminacao. */
export function _limparTudo() {
  ledger.clear();
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

  /* O gateway registra a transacao no proprio ledger. */
  ledger.set(identificadorExterno, status);

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

  ledger.set(String(identificadorExterno), 'REEMBOLSADO');

  return {
    status: 'REEMBOLSADO',
    identificadorExterno,
    mensagem: 'Estorno simulado concluido.',
    resumo: { gateway: 'fake', status: 'REEMBOLSADO', valor: Number(valor), motivo: motivo ?? null },
  };
}

/*
 * Consulta o status de um pagamento NO GATEWAY.
 *
 * Responde a partir do ledger - o estado que o GATEWAY conhece -, e nao
 * do `statusAtual` que o nosso banco informou. `statusAtual` fica na
 * assinatura apenas por compatibilidade de contrato com adaptadores
 * reais e NAO e usado na resposta.
 *
 * E essa independencia que torna a reconciliacao um teste de verdade: se
 * o nosso banco divergir do gateway, a consulta revela a divergencia em
 * vez de confirmar o que ja acreditavamos.
 *
 * Transacao desconhecida (nao passou por este processo, ou o ledger foi
 * limpo por um reinicio) devolve PENDENTE: nunca inventamos APROVADO
 * para algo que nao vimos processar.
 */
export async function consultar({ identificadorExterno }) {
  const status = ledger.get(String(identificadorExterno)) ?? 'PENDENTE';

  return {
    status,
    identificadorExterno,
    resumo: { gateway: 'fake', consulta: true, status },
  };
}

/* Indica se o adaptador esta configurado e pronto para uso. */
export function estaConfigurado() {
  return !env.ehProducao;
}

export default { processar, estornar, consultar, estaConfigurado };
