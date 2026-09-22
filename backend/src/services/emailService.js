import logger from '../config/logger.js';
import env from '../config/env.js';

export async function enviarEmailRedefinicao({ email, token }) {
  if (env.EMAIL_PROVIDER === 'log') {
    logger.info({ email }, 'E-mail de redefinicao de senha enfileirado');
    return;
  }

  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY nao foi configurada para o provedor Resend.');
  }

  const url = new URL('/redefinir-senha', env.FRONTEND_URL);
  url.searchParams.set('token', token);

  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: 'Redefinicao de senha - AgroHero',
      text: [
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
    }),
  });

  if (!resposta.ok) {
    const detalhes = await resposta.text();
    logger.error(
      { email, status: resposta.status, detalhes },
      'Resend recusou o e-mail de redefinicao',
    );
    throw new Error('Nao foi possivel enviar o e-mail de redefinicao.');
  }

  logger.info({ email }, 'E-mail de redefinicao enviado');
}

export default { enviarEmailRedefinicao };
