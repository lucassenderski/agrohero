import { env } from '../../config/env.js';
import logger from '../../config/logger.js';
import { erros } from '../../utils/AppError.js';

/*
 * Gateway Mercado Pago.
 *
 * Adaptador REAL, atras da mesma interface do `gatewayFake`. Esta
 * implementado e pronto para uso, mas so e escolhido quando
 * PAYMENT_GATEWAY=mercadopago E as credenciais estao preenchidas - ver
 * `paymentService.js`.
 *
 * POR QUE MERCADO PAGO (pesquisa feita na FASE 0/11):
 *   - cobre PIX, cartao e boleto na mesma API, que e exatamente a lista
 *     do requisito 16;
 *   - tem credenciais de TESTE (sandbox) gratuitas, sem exigir CNPJ para
 *     desenvolver;
 *   - e a opcao mais comum para projetos academicos no Brasil, com
 *     documentacao em portugues.
 *
 * SEGURANCA - O QUE ESTE ARQUIVO NAO FAZ:
 *   - nao recebe numero de cartao, CVV ou validade. No checkout
 *     transparente, esses dados vao do navegador direto para o Mercado
 *     Pago; o nosso servidor so ve o token gerado. No fluxo por
 *     redirecionamento (preferencia + init_point), nem isso: o cliente
 *     paga na pagina deles.
 *   - nao guarda o payload completo da resposta. So o resumo.
 *   - nao coloca o access token em log.
 */

const BASE_URL = 'https://api.mercadopago.com';

/*
 * Mapeia o status do Mercado Pago para o vocabulario de
 * `pagamentos.status`. Sem esse mapa, o status cru do gateway
 * ("in_process", "charged_back") entraria no banco e violaria o CHECK.
 */
const MAPA_STATUS = {
  approved: 'APROVADO',
  authorized: 'APROVADO',
  pending: 'PENDENTE',
  in_process: 'PENDENTE',
  in_mediation: 'PENDENTE',
  rejected: 'RECUSADO',
  cancelled: 'CANCELADO',
  refunded: 'REEMBOLSADO',
  charged_back: 'REEMBOLSADO',
};

/* Traduz o metodo do nosso dominio para o do gateway. */
function metodoParaGateway(metodo) {
  const mapa = { PIX: 'pix', CARTAO: 'credit_card', BOLETO: 'bolbradesco' };
  return mapa[metodo] ?? 'pix';
}

/* Converte o status do gateway, com fallback seguro. */
function traduzirStatus(statusGateway) {
  return MAPA_STATUS[String(statusGateway).toLowerCase()] ?? 'PENDENTE';
}

/* Erro de gateway nunca deve vazar o corpo da resposta para o cliente. */
function erroDeGateway(operacao, resposta, corpo) {
  logger.error(
    { operacao, httpStatus: resposta.status, erroGateway: corpo?.message ?? null },
    'Falha na chamada ao Mercado Pago',
  );

  return erros.regraNegocio(
    'Nao foi possivel processar o pagamento agora. Tente novamente.',
    'GATEWAY_INDISPONIVEL',
  );
}

/*
 * Chama a API do Mercado Pago.
 *
 * O access token vai no header Authorization e NUNCA e logado. Em caso
 * de erro HTTP, a mensagem devolvida ao cliente e generica: o corpo do
 * gateway pode conter detalhe interno que nao deve sair do servidor.
 */
async function chamarApi(caminho, opcoes = {}) {
  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers ?? {}),
    },
  });

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw erroDeGateway(caminho, resposta, corpo);
  }

  return corpo;
}

/*
 * Processa um pagamento criando uma cobranca PIX.
 *
 * O PIX e o metodo mais direto para o cenario do AgroHero: nao precisa
 * de dados de cartao, e a confirmacao chega por webhook.
 */
export async function processar({ valor, metodo, pedidoId, descricao, emailPagador }) {
  const corpo = {
    transaction_amount: Number(valor),
    description: descricao ?? `Pedido #${pedidoId} - AgroHero`,
    payment_method_id: metodoParaGateway(metodo),
    /*
     * `external_reference` e o que amarra o pagamento ao NOSSO pedido.
     * Sem ele, um webhook nao teria como saber qual pedido foi pago.
     */
    external_reference: String(pedidoId),
    payer: { email: emailPagador },
  };

  const dados = await chamarApi('/v1/payments', {
    method: 'POST',
    // Idempotencia: se a requisicao for reenviada (retry de rede), o
    // Mercado Pago nao cria uma segunda cobranca.
    headers: { 'X-Idempotency-Key': `agrohero-pedido-${pedidoId}` },
    body: JSON.stringify(corpo),
  });

  const status = traduzirStatus(dados.status);

  return {
    status,
    identificadorExterno: String(dados.id),
    mensagem: dados.status_detail ?? 'Pagamento registrado.',
    /*
     * Dados que o frontend precisa para concluir o PIX (QR Code) e que
     * nao sao sensiveis - vao para a resposta. O restante da resposta do
     * gateway fica de fora.
     */
    dadosPagamento: {
      qr_code: dados.point_of_interaction?.transaction_data?.qr_code ?? null,
      qr_code_base64: dados.point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
      ticket_url: dados.point_of_interaction?.transaction_data?.ticket_url ?? null,
    },
    resumo: {
      gateway: 'mercadopago',
      metodo,
      status: dados.status,
      status_detail: dados.status_detail ?? null,
      valor: Number(valor),
    },
  };
}

/* Estorna (refund total) um pagamento. */
export async function estornar({ identificadorExterno, valor }) {
  const dados = await chamarApi(`/v1/payments/${identificadorExterno}/refunds`, {
    method: 'POST',
    body: JSON.stringify({ amount: Number(valor) }),
  });

  return {
    status: 'REEMBOLSADO',
    identificadorExterno,
    mensagem: 'Estorno solicitado ao Mercado Pago.',
    resumo: {
      gateway: 'mercadopago',
      status: dados.status ?? 'REEMBOLSADO',
      valor: Number(valor),
    },
  };
}

/* Consulta o status atual, usado para reconciliar webhook perdido. */
export async function consultar({ identificadorExterno }) {
  const dados = await chamarApi(`/v1/payments/${identificadorExterno}`, { method: 'GET' });

  return {
    status: traduzirStatus(dados.status),
    identificadorExterno,
    mensagem: dados.status_detail ?? null,
    resumo: { gateway: 'mercadopago', status: dados.status },
  };
}

/*
 * O adaptador esta pronto quando ha access token configurado E nao
 * estamos em producao sem credencial de producao. Em producao com token
 * ausente, `paymentService` recusa a operacao em vez de cair no fake -
 * processar dinheiro com gateway simulado seria pior que falhar.
 */
export function estaConfigurado() {
  return Boolean(env.MERCADOPAGO_ACCESS_TOKEN);
}

export default { processar, estornar, consultar, estaConfigurado };
