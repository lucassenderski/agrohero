import pino from 'pino';
import env from './env.js';

/*
 * Logger da aplicacao.
 *
 * A opcao `redact` e uma protecao de seguranca, nao um detalhe estetico:
 * ela garante que, mesmo que alguem logue o objeto inteiro de uma requisicao,
 * senha, hash e token sao substituidos por [REDACTED] antes de chegarem ao
 * arquivo de log. Log vazando senha e um dos incidentes mais comuns.
 */

const caminhosRedigidos = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.senha',
  'req.body.senha_atual',
  'req.body.nova_senha',
  'req.body.password',
  'req.body.cvv',
  'req.body.numero_cartao',
  'senha',
  'senha_hash',
  'senhaAtual',
  'novaSenha',
  'token',
  'jwt',
  'access_token',
  'identificador_externo',
];

export const logger = pino({
  // Em testes o logger fica silencioso: a saida do Jest deve mostrar o
  // resultado dos testes, nao o log de cada requisicao simulada.
  level: env.ehTeste ? 'silent' : env.ehProducao ? 'info' : 'debug',
  redact: {
    paths: caminhosRedigidos,
    censor: '[REDACTED]',
  },
  // Em desenvolvimento, um formato legivel vale mais que JSON puro.
  transport: env.ehProducao
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
});

export default logger;