import crypto from 'node:crypto';
import { env } from '../config/env.js';
import logger from '../config/logger.js';
import { erros } from '../utils/AppError.js';
import pedidoRepository from '../repositories/pedidoRepository.js';
import paymentService from './paymentService.js';

/*
 * Recebimento de webhooks de pagamento (FASE 13).
 *
 * O QUE E UM WEBHOOK E POR QUE ELE E DIFICIL
 *
 * O gateway nao nos pergunta se pode cobrar: ele cobra e nos AVISA
 * depois. Esse aviso chega numa requisicao HTTP que qualquer um pode
 * enviar ao nosso servidor. Entao a rota de webhook e, literalmente, um
 * endpoint publico que muda o status de pagamento de um pedido. Toda a
 * seguranca dela depende de provar que a requisicao veio do gateway.
 *
 * TRES DEFESAS, E POR QUE AS TRES
 *
 * 1. ASSINATURA (HMAC-SHA256 sobre o corpo bruto). Sem isso, qualquer
 *    pessoa que descobrisse a URL marcaria pedidos como pagos. A
 *    assinatura prova que o emissor conhece o segredo compartilhado.
 *
 * 2. COMPARACAO EM TEMPO CONSTANTE. Comparar strings com `===` vaza
 *    informacao pelo tempo de resposta: o comparador para no primeiro
 *    byte diferente, entao um atacante mede quanto tempo levou e
 *    descobre a assinatura byte a byte. `timingSafeEqual` compara sempre
 *    o tempo todo.
 *
 * 3. RECONCILIACAO COM A FONTE. Mesmo com assinatura valida, NUNCA
 *    confiamos no status que vem no corpo. O corpo diz "pago"; nos
 *    perguntamos ao gateway `consultar()` e usamos a resposta DELE. Isso
 *    protege contra replay de um webhook antigo (assinatura valida, mas
 *    de um evento ja superado) e contra um bug do proprio gateway.
 *
 * O ponto 3 e o que muita implementacao esquece: validar assinatura nao
 * e o mesmo que confiar no conteudo.
 */

/*
 * Corpo bruto da requisicao.
 *
 * A assinatura e calculada sobre os BYTES que chegaram, e nao sobre o
 * objeto JSON re-serializado. Re-serializar muda espacos, ordem de
 * chaves e formato de numero, e a assinatura deixaria de bater mesmo
 * para um corpo legitimo. Por isso o app guarda o corpo bruto em
 * `req.rawBody` (ver a configuracao do express.json em app.js).
 */
function corpoBruto(req) {
  if (!req.rawBody) {
    throw erros.dadosInvalidos('Corpo da requisicao ausente.', [
      { campo: 'body', mensagem: 'O webhook precisa enviar um corpo JSON.' },
    ]);
  }

  return req.rawBody;
}

/*
 * Compara duas assinaturas em tempo constante.
 *
 * Devolve false (e nao lanca) quando os tamanhos diferem:
 * `timingSafeEqual` lanca se os buffers tiverem tamanhos diferentes, e
 * um erro de execucao aqui viraria 500. A diferenca de tamanho em si nao
 * vaza nada util - o atacante ja sabe o tamanho do proprio texto.
 */
function assinaturasIguais(recebida, esperada) {
  const a = Buffer.from(String(recebida ?? ''), 'utf8');
  const b = Buffer.from(String(esperada ?? ''), 'utf8');

  if (a.length !== b.length) return false;
  if (a.length === 0) return false;

  return crypto.timingSafeEqual(a, b);
}

/*
 * Verifica a assinatura HMAC do webhook.
 *
 * Formato esperado no header `x-agrohero-signature`:
 *
 *     sha256=<hex>
 *
 * E o mesmo formato que o GitHub usa para os webhooks dele, e por isso
 * foi escolhido: quem ja integrou um webhook antes reconhece de imediato.
 *
 * O QUE E ASSINADO
 *
 * O corpo bruto, e nada mais. Nao incluir timestamp nem URL na mensagem
 * assinada deixa a implementacao simples; a protecao contra replay vem
 * da reconciliacao com o gateway, e nao do esquema de assinatura.
 */
export function verificarAssinatura(corpo, assinaturaRecebida) {
  const segredo = env.PAYMENT_WEBHOOK_SECRET;

  /*
   * Sem segredo configurado, o webhook e RECUSADO - nunca aceito.
   *
   * A alternativa (aceitar sem verificar) transformaria um erro de
   * configuracao numa porta aberta para marcar pedidos como pagos.
   * Falhar fechado e a unica opcao segura aqui.
   */
  if (!segredo) {
    logger.error('PAYMENT_WEBHOOK_SECRET nao configurado; webhook recusado.');
    throw erros.interno('O recebimento de webhooks nao esta configurado.');
  }

  const esperada = `sha256=${crypto.createHmac('sha256', segredo).update(corpo).digest('hex')}`;

  if (!assinaturasIguais(assinaturaRecebida, esperada)) {
    /*
     * Registramos o evento, mas NUNCA a assinatura recebida nem o corpo:
     * ambos poderiam ajudar quem esta sondando a descobrir o segredo.
     */
    logger.warn(
      { assinaturaPresente: Boolean(assinaturaRecebida) },
      'Webhook de pagamento com assinatura invalida',
    );

    throw erros.semPermissao('Assinatura do webhook invalida.');
  }

  return true;
}

/*
 * Extrai a referencia do pedido e o identificador do evento do corpo.
 *
 * O formato do corpo varia por gateway, entao a extracao fica isolada
 * aqui. Aceita as formas mais comuns:
 *   { pedido_id } / { external_reference } / { data: { id } }
 */
export function extrairReferencias(corpoJson) {
  const pedidoId =
    corpoJson?.pedido_id ?? corpoJson?.external_reference ?? corpoJson?.data?.external_reference;

  const identificadorExterno = corpoJson?.identificador ?? corpoJson?.data?.id ?? corpoJson?.id;

  return {
    pedidoId: pedidoId != null ? String(pedidoId) : null,
    identificadorExterno: identificadorExterno != null ? String(identificadorExterno) : null,
  };
}

/*
 * Transicoes validas de status de pagamento.
 *
 * Esta maquina e MENOR que a de pedidos, e serve para uma coisa so:
 * impedir que evento atrasado sobrescreva estado final.
 *
 *   PENDENTE   -> APROVADO | RECUSADO | CANCELADO
 *   APROVADO   -> REEMBOLSADO | CANCELADO
 *   RECUSADO   -> APROVADO (nova tentativa) | CANCELADO
 *   REEMBOLSADO -> (final)
 *   CANCELADO   -> (final)
 *
 * O caso mais importante: REEMBOLSADO e CANCELADO sao finais. Um webhook
 * de aprovacao que chegue depois de um estorno tem que ser ignorado -
 * sem isso, o dinheiro ja devolvido apareceria como recebido.
 */
const TRANSICOES_PAGAMENTO = {
  PENDENTE: ['APROVADO', 'RECUSADO', 'CANCELADO'],
  APROVADO: ['REEMBOLSADO', 'CANCELADO'],
  RECUSADO: ['APROVADO', 'CANCELADO'],
  REEMBOLSADO: [],
  CANCELADO: [],
};

export function transicaoDePagamentoPermitida(de, para) {
  return (TRANSICOES_PAGAMENTO[de] ?? []).includes(para);
}

/*
 * Processa a notificacao de pagamento.
 *
 * PASSOS
 *   1. localiza o pagamento (pelo identificador do gateway, ou pelo
 *      pedido, ou pelo proprio identificador vindo no header)
 *   2. se nao existe: aceita e ignora (200), para nao entrar num loop de
 *      retentativa com um webhook que nunca vai casar
 *   3. RECONCILIA: pergunta ao gateway o status real
 *   4. aplica o status, se for uma transicao com sentido
 *
 * IDEMPOTENCIA
 *
 * Gateways reenviam webhooks quando nao recebem 200, e reenviam tambem
 * por garantia. O mesmo evento pode chegar tres vezes. Aplicar o status
 * de novo precisa ser inofensivo.
 *
 * Duas guardas: `status ja aplicado` (nada muda, devolve 200) e a
 * maquina de transicoes (um evento atrasado nao volta de REEMBOLSADO
 * para APROVADO). Sem a segunda, um webhook antigo reenviado depois do
 * estorno marcaria como pago um dinheiro que ja foi devolvido.
 */
export async function processarNotificacao({ corpoJson, identificadorExterno: idDaRota }) {
  const { pedidoId, identificadorExterno } = extrairReferencias(corpoJson);

  const idFinal = idDaRota ?? identificadorExterno ?? null;

  /*
   * Preferimos o identificador do gateway: e unico e imutavel. O pedido
   * pode ter mais de uma tentativa de pagamento (a primeira recusada, a
   * segunda aprovada), entao buscar por pedido devolveria a mais recente
   * e nao necessariamente a do evento.
   */
  let pagamento = null;

  if (idFinal) {
    pagamento = await pedidoRepository.buscarPagamentoPorIdentificador(idFinal);
  }

  if (!pagamento && pedidoId) {
    pagamento = await pedidoRepository.buscarPagamentoPorPedido(pedidoId);
  }

  /*
   * Pagamento desconhecido: 200 e nao 404.
   *
   * Devolver erro faria o gateway reenviar indefinidamente um evento que
   * nunca vai casar (pode ser de outro ambiente, ou de um pagamento
   * criado fora do nosso fluxo). Aceitamos e registramos para investigar
   * depois.
   */
  if (!pagamento) {
    logger.warn(
      { pedidoId, identificadorExterno: idFinal },
      'Webhook recebido para pagamento desconhecido; ignorado',
    );

    return { processado: false, motivo: 'PAGAMENTO_NAO_ENCONTRADO' };
  }

  /*
   * RECONCILIACAO: o corpo do webhook NAO define o status.
   *
   * Perguntamos ao gateway qual e o status real daquela transacao e
   * usamos a resposta dele. Isso neutraliza replay de evento antigo: um
   * webhook de "pago" reenviado depois do estorno encontraria status
   * REEMBOLSADO no gateway, e nao APROVADO.
   *
   * Se a consulta falhar, nao aplicamos nada - e melhor deixar o
   * pagamento como esta e tentar de novo quando o gateway reenviar.
   */
  let statusReal;

  try {
    const consulta = await paymentService.consultar({
      identificadorExterno: pagamento.identificador_externo,
      statusAtual: pagamento.status,
    });

    statusReal = consulta.status;
  } catch (erro) {
    logger.error(
      { pagamentoId: pagamento.id, erro: erro.message },
      'Falha ao reconciliar webhook com o gateway',
    );

    throw erros.regraNegocio(
      'Nao foi possivel confirmar o pagamento agora.',
      'RECONCILIACAO_FALHOU',
    );
  }

  /* Nada mudou: evento duplicado ou sem efeito. */
  if (pagamento.status === statusReal) {
    logger.info(
      { pagamentoId: pagamento.id, status: statusReal },
      'Webhook idempotente: status ja aplicado',
    );

    return { processado: false, motivo: 'STATUS_JA_APLICADO', status: statusReal };
  }

  if (!transicaoDePagamentoPermitida(pagamento.status, statusReal)) {
    logger.warn(
      { pagamentoId: pagamento.id, de: pagamento.status, para: statusReal },
      'Webhook com transicao de pagamento recusada',
    );

    return { processado: false, motivo: 'TRANSICAO_RECUSADA', status: pagamento.status };
  }

  const atualizado = await pedidoRepository.atualizarPagamento(pagamento.id, {
    status: statusReal,
    resumo: { gateway: paymentService.gatewayAtivo(), reconciliado: true, status: statusReal },
  });

  logger.info(
    { pagamentoId: pagamento.id, de: pagamento.status, para: statusReal },
    'Status de pagamento atualizado por webhook',
  );

  /*
   * O webhook NAO altera o status do pedido. Pagamento e entrega sao
   * coisas diferentes: um pedido pode estar pago e ainda nao enviado.
   * Quem move o pedido e o agricultor, na maquina de estados da FASE 12.
   */
  return { processado: true, status: statusReal, pagamento: atualizado };
}

export default {
  verificarAssinatura,
  extrairReferencias,
  processarNotificacao,
  transicaoDePagamentoPermitida,
};