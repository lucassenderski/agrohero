import { env } from '../config/env.js';
import logger from '../config/logger.js';
import { erros } from '../utils/AppError.js';
import gatewayFake from './gateways/gatewayFake.js';
import gatewayMercadoPago from './gateways/gatewayMercadoPago.js';

/*
 * Camada de pagamento.
 *
 * OBJETIVO: o resto do sistema (checkout, pedidos, paineis) nunca
 * importa um gateway diretamente. Todo mundo fala com este modulo, que
 * expoe o mesmo contrato independente de quem esta por baixo.
 *
 * Por que isso importa: trocar de gateway e uma decisao de negocio que
 * muda com o tempo (taxa, disponibilidade de PIX, suporte). Se o
 * checkout chamasse o Mercado Pago direto, trocar de provedor seria
 * mexer no coracao do fluxo de compra. Com esta camada, a troca e
 * escolher outro adaptador aqui.
 *
 * CONTRATO (igual para todo adaptador):
 *   processar({ valor, metodo, pedidoId, descricao, emailPagador })
 *     -> { status, identificadorExterno, mensagem, resumo, dadosPagamento? }
 *   estornar({ identificadorExterno, valor, motivo })
 *     -> { status, identificadorExterno, mensagem, resumo }
 *   consultar({ identificadorExterno, statusAtual })
 *     -> { status, identificadorExterno, resumo }
 *
 * `status` sempre no vocabulario de `pagamentos.status`: PENDENTE,
 * APROVADO, RECUSADO, CANCELADO, REEMBOLSADO.
 */

const adaptadores = {
  fake: gatewayFake,
  mercadopago: gatewayMercadoPago,
};

const METODOS_VALIDOS = ['PIX', 'CARTAO', 'BOLETO'];

/*
 * Escolhe o adaptador.
 *
 * REGRA DE SEGURANCA IMPORTANTE: em producao, o gateway simulado e
 * recusado. Se PAYMENT_GATEWAY apontar para `fake` em producao, a
 * operacao falha em vez de "aprovar" pagamentos que nunca existiram -
 * um erro de configuracao que, silencioso, geraria pedidos entregues sem
 * dinheiro nenhum ter entrado.
 */
function selecionarAdaptador() {
  const nome = env.PAYMENT_GATEWAY;

  if (nome === 'fake') {
    if (env.ehProducao) {
      throw erros.interno(
        'O gateway de pagamento simulado nao pode ser usado em producao.',
        [{ campo: 'PAYMENT_GATEWAY', mensagem: 'Configure um gateway real.' }],
      );
    }

    return { nome: 'fake', adaptador: adaptadores.fake };
  }

  const adaptador = adaptadores[nome];

  if (!adaptador) {
    throw erros.interno(`Gateway de pagamento desconhecido: ${nome}.`);
  }

  if (!adaptador.estaConfigurado()) {
    throw erros.regraNegocio(
      'O gateway de pagamento nao esta configurado. Contate o suporte.',
      'GATEWAY_NAO_CONFIGURADO',
    );
  }

  return { nome, adaptador };
}

/* Valida o metodo antes de chamar o gateway. */
function validarMetodo(metodo) {
  if (!METODOS_VALIDOS.includes(metodo)) {
    throw erros.dadosInvalidos(`Metodo de pagamento invalido: ${metodo}.`, [
      { campo: 'metodo', mensagem: `Use um destes: ${METODOS_VALIDOS.join(', ')}.` },
    ]);
  }
}

/*
 * Processa um pagamento.
 *
 * O valor SEMPRE vem do servidor (calculado no checkout a partir do
 * banco). Este modulo nunca aceita valor do cliente - ele recebe o
 * numero que o checkout calculou.
 */
export async function processar({ valor, metodo, pedidoId, descricao, emailPagador }) {
  validarMetodo(metodo);

  if (!(Number(valor) > 0)) {
    throw erros.dadosInvalidos('O valor do pagamento deve ser maior que zero.', [
      { campo: 'valor', mensagem: 'Valor invalido.' },
    ]);
  }

  const { nome, adaptador } = selecionarAdaptador();

  try {
    const resultado = await adaptador.processar({
      valor: Number(valor),
      metodo,
      pedidoId,
      descricao,
      emailPagador,
    });

    logger.info(
      { pedidoId, gateway: nome, metodo, status: resultado.status },
      'Pagamento processado',
    );

    return resultado;
  } catch (erro) {
    /*
     * Falha de gateway e registrada com detalhe para diagnostico, mas o
     * cliente recebe mensagem generica. Nao repassamos o erro cru: ele
     * pode conter detalhe da conta ou do provedor.
     */
    logger.error(
      { pedidoId, gateway: nome, metodo, erro: erro.message },
      'Falha ao processar pagamento',
    );

    if (erro.statusCode) throw erro;

    throw erros.regraNegocio(
      'Nao foi possivel processar o pagamento agora. Tente novamente.',
      'FALHA_PAGAMENTO',
    );
  }
}

/* Estorna um pagamento. */
export async function estornar({ identificadorExterno, valor, motivo }) {
  const { nome, adaptador } = selecionarAdaptador();

  if (!adaptador.estornar) {
    throw erros.regraNegocio(
      'Este gateway nao suporta estorno automatico.',
      'ESTORNO_NAO_SUPORTADO',
    );
  }

  try {
    const resultado = await adaptador.estornar({ identificadorExterno, valor, motivo });

    logger.info({ gateway: nome, identificadorExterno, valor }, 'Estorno processado');

    return resultado;
  } catch (erro) {
    logger.error(
      { gateway: nome, identificadorExterno, erro: erro.message },
      'Falha ao estornar pagamento',
    );

    if (erro.statusCode) throw erro;

    throw erros.regraNegocio('Nao foi possivel estornar o pagamento.', 'FALHA_ESTORNO');
  }
}

/* Consulta o status no gateway (reconciliacao de webhook perdido). */
export async function consultar({ identificadorExterno, statusAtual }) {
  const { adaptador } = selecionarAdaptador();

  return adaptador.consultar({ identificadorExterno, statusAtual });
}

/* Informa qual gateway esta ativo, para diagnostico e para a API expor. */
export function gatewayAtivo() {
  return env.PAYMENT_GATEWAY;
}

export default { processar, estornar, consultar, gatewayAtivo };
