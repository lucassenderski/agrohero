import app from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';
import { verificarConexao, encerrarPool } from './database/pool.js';

/*
 * Ponto de entrada do processo.
 *
 * Responsabilidade unica: subir o servidor e desligar com elegancia.
 */

const servidor = app.listen(env.PORT, () => {
  logger.info(
    { porta: env.PORT, ambiente: env.NODE_ENV },
    `AgroHero API no ar em http://localhost:${env.PORT}`,
  );
});

/*
 * Testamos o banco na subida apenas para avisar cedo no log. A aplicacao
 * NAO morre se o banco estiver fora: o /health responde 503 e assim que o
 * banco voltar tudo funciona, sem precisar reiniciar o processo.
 */
verificarConexao()
  .then(({ latenciaMs }) => {
    logger.info({ latenciaMs }, 'Conexao com PostgreSQL verificada');
  })
  .catch((erro) => {
    logger.error(
      { err: erro },
      'Nao foi possivel conectar ao PostgreSQL na subida. A API continua no ar; confira DATABASE_URL e o docker compose.',
    );
  });

/*
 * Desligamento gracioso.
 *
 * Fechar o pool libera as conexoes do banco antes do processo morrer.
 * Sem isso, um deploy pode deixar conexoes penduradas no PostgreSQL.
 */
async function desligar(sinal) {
  logger.info({ sinal }, 'Encerrando a aplicacao...');

  servidor.close(async () => {
    try {
      await encerrarPool();
      logger.info('Pool do PostgreSQL encerrado. Tchau!');
      process.exit(0);
    } catch (erro) {
      logger.error({ err: erro }, 'Erro ao encerrar o pool');
      process.exit(1);
    }
  });

  // Se algo travar, nao ficamos presos para sempre.
  setTimeout(() => {
    logger.error('Desligamento forcado apos 10s');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => desligar('SIGTERM'));
process.on('SIGINT', () => desligar('SIGINT'));

process.on('unhandledRejection', (motivo) => {
  logger.error({ err: motivo }, 'Promise rejeitada sem tratamento');
});

process.on('uncaughtException', (erro) => {
  logger.fatal({ err: erro }, 'Excecao nao capturada. Encerrando.');
  process.exit(1);
});