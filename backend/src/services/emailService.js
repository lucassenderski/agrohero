import logger from '../config/logger.js';
import env from '../config/env.js';

/*
 * Envio de e-mail do AgroHero.
 *
 * Um unico ponto de saida (`enviarEmail`) concentra o provedor e o
 * tratamento de falha. Duas regras valem para TODOS os e-mails deste
 * arquivo:
 *
 * 1) FALHA DE E-MAIL NAO DERRUBA A OPERACAO. Quando estas funcoes sao
 *    chamadas, o fato de negocio ja esta gravado (pedido criado, token
 *    emitido). Um provedor fora do ar nao pode desfazer uma compra nem
 *    apagar um token. A falha e logada, e o fluxo segue.
 *
 * 2) O CONTEUDO NAO EXPOE O QUE NAO E DO DESTINATARIO. O produtor
 *    recebe apenas os itens dele e o valor dele - nunca o total do
 *    pedido nem a parte de outro produtor.
 */

const REMETENTE_PADRAO = 'AgroHero <onboarding@resend.dev>';

/*
 * Envia um e-mail pelo Resend.
 *
 * `EMAIL_PROVIDER=log` apenas registra no log (desenvolvimento e testes
 * nao falam com a API externa). Fora disso, exige RESEND_API_KEY.
 *
 * Devolve `true` quando entregue ao provedor e `false` quando falhou -
 * nunca lanca. Quem chama decide se a ausencia importa.
 */
async function enviarEmail({ para, assunto, texto, html }) {
  if (env.EMAIL_PROVIDER === 'log') {
    logger.info({ para, assunto }, 'E-mail enfileirado (provider=log)');
    return true;
  }

  if (!env.RESEND_API_KEY) {
    logger.error({ para, assunto }, 'RESEND_API_KEY ausente; e-mail nao enviado');
    return false;
  }

  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || REMETENTE_PADRAO,
        to: [para],
        subject: assunto,
        text: texto,
        html,
      }),
    });

    if (!resposta.ok) {
      const detalhes = await resposta.text();
      logger.error({ para, assunto, status: resposta.status, detalhes }, 'Resend recusou o e-mail');
      return false;
    }

    logger.info({ para, assunto }, 'E-mail enviado');
    return true;
  } catch (erro) {
    logger.error({ para, assunto, erro: erro.message }, 'Falha de rede ao enviar e-mail');
    return false;
  }
}

function formatarValor(valor) {
  return `R$ ${Number(valor).toFixed(2).replace('.', ',')}`;
}

export async function enviarEmailRedefinicao({ email, token }) {
  const url = new URL('/redefinir-senha', env.FRONTEND_URL);
  url.searchParams.set('token', token);

  await enviarEmail({
    para: email,
    assunto: 'Redefinicao de senha - AgroHero',
    texto: [
      'Voce solicitou a redefinicao da sua senha no AgroHero.',
      '',
      `Crie uma nova senha: ${url.toString()}`,
      '',
      'Este link expira em 1 hora e pode ser usado uma unica vez.',
    ].join('\n'),
    html: `
      <p>Voce solicitou a redefinicao da sua senha no AgroHero.</p>
      <p><a href="${url.toString()}">Criar nova senha</a></p>
      <p>Este link expira em 1 hora e pode ser usado uma unica vez.</p>
    `,
  });
}

/*
 * E-mail de confirmacao do pedido para o CONSUMIDOR.
 *
 * Sem cobranca online, este e o unico comprovante que o cliente recebe
 * no ato. Ele deixa explicito que o pagamento NAO foi feito agora, e
 * sim que sera feito na retirada/entrega - a duvida mais provavel de
 * quem acaba de "finalizar" uma compra sem tela de pagamento.
 */
export async function enviarEmailPedidoConfirmado({ email, pedido, pagamentos }) {
  const listar = (pagamento) =>
    `${pagamento.nome_fazenda || 'Produtor'}: ${formatarValor(pagamento.valor)} (${pagamento.metodo})`;

  await enviarEmail({
    para: email,
    assunto: `Pedido #${pedido.id} confirmado - AgroHero`,
    texto: [
      `Pedido #${pedido.id} confirmado.`,
      '',
      `Total: ${formatarValor(pedido.valor_total)}`,
      `Produtos: ${formatarValor(pedido.valor_produtos)}`,
      `Frete: ${formatarValor(pedido.valor_frete)}`,
      '',
      'PAGAMENTO NA RETIRADA/ENTREGA',
      'O pagamento NAO foi cobrado agora, nem por este site. Pague',
      'diretamente ao produtor quando receber os produtos.',
      '',
      ...pagamentos.map((pagamento) => `- ${listar(pagamento)}`),
      '',
      'Acompanhe seu pedido no AgroHero.',
    ].join('\n'),
    html: `
      <p>Pedido <strong>#${pedido.id}</strong> confirmado.</p>
      <p>
        Total: <strong>${formatarValor(pedido.valor_total)}</strong><br />
        Produtos: ${formatarValor(pedido.valor_produtos)}<br />
        Frete: ${formatarValor(pedido.valor_frete)}
      </p>
      <p><strong>Pagamento na retirada/entrega.</strong> O pagamento nao foi cobrado agora,
      nem por este site. Pague diretamente ao produtor quando receber os produtos.</p>
      <ul>${pagamentos.map((pagamento) => `<li>${listar(pagamento)}</li>`).join('')}</ul>
      <p>Acompanhe seu pedido no AgroHero.</p>
    `,
  });
}

/*
 * Aviso para o PRODUTOR de que ha um item novo a entregar e um
 * pagamento a receber na retirada.
 *
 * Um e-mail por produtor, com o valor DELE - nunca o total do pedido
 * nem a parte dos outros. O produtor nao deve descobrir quanto o
 * concorrente vendeu no mesmo pedido (mesma regra da resposta da API).
 */
export async function enviarEmailNovoPedidoProdutor({ email, pedido, pagamento, itens }) {
  const listar = (item) => `${item.quantidade}x ${item.nome} (${formatarValor(item.subtotal)})`;

  await enviarEmail({
    para: email,
    assunto: `Novo pedido #${pedido.id} - AgroHero`,
    texto: [
      `Voce recebeu um novo pedido (#${pedido.id}).`,
      '',
      'Itens seus neste pedido:',
      ...itens.map((item) => `- ${listar(item)}`),
      '',
      `Voce recebe na retirada/entrega: ${formatarValor(pagamento.valor)}`,
      `Forma declarada pelo cliente: ${pagamento.metodo}`,
      '',
      'Confirme o recebimento no painel quando o cliente pagar.',
    ].join('\n'),
    html: `
      <p>Voce recebeu um novo <strong>pedido #${pedido.id}</strong>.</p>
      <p>Itens seus neste pedido:</p>
      <ul>${itens.map((item) => `<li>${listar(item)}</li>`).join('')}</ul>
      <p>Voce recebe na retirada/entrega: <strong>${formatarValor(pagamento.valor)}</strong><br />
      Forma declarada pelo cliente: ${pagamento.metodo}</p>
      <p>Confirme o recebimento no painel quando o cliente pagar.</p>
    `,
  });
}

export default {
  enviarEmailRedefinicao,
  enviarEmailPedidoConfirmado,
  enviarEmailNovoPedidoProdutor,
};
