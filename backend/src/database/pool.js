import pg from 'pg';
import env from '../config/env.js';
import logger from '../config/logger.js';

const { Pool } = pg;

/*
 * Pool unico de conexoes PostgreSQL, reutilizado por toda a aplicacao.
 *
 * Abrir uma conexao nova a cada requisicao seria caro. O Pool mantem um
 * conjunto de conexoes abertas e as reaproveita.
 *
 * Importante: o driver `pg` recebe os valores separados da string SQL
 * (SELECT ... WHERE email = $1). Isso e o que impede SQL Injection: o
 * valor e enviado como parametro, nunca concatenado no texto da query.
 */

// O PostgreSQL devolve NUMERIC como string por padrao para nao perder
// precisao. Como preco e dinheiro, convertemos para Number somente aqui,
// de forma explicita e consciente.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (valor) => {
  return valor === null ? null : Number(valor);
});

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.ehTeste ? 5 : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  // Nao deixe o processo morrer por erro de socket ocioso.
  allowExitOnIdle: env.ehTeste,
});

pool.on('error', (erro) => {
  logger.error({ err: erro }, 'Erro inesperado em conexao ociosa do pool');
});

/* Executa uma query parametrizada usando o pool. */
export function query(texto, parametros = []) {
  return pool.query(texto, parametros);
}

/*
 * Executa uma funcao dentro de uma transacao.
 *
 * Uso:
 *   const resultado = await comTransacao(async (cliente) => { ... });
 *
 * O ROLLBACK no catch e o que garante o requisito do checkout: se
 * qualquer passo falhar, NADA fica gravado no banco.
 */
export async function comTransacao(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    try {
      await cliente.query('ROLLBACK');
    } catch (erroRollback) {
      logger.error({ err: erroRollback }, 'Falha ao executar ROLLBACK');
    }
    throw erro;
  } finally {
    // Sempre devolve a conexao ao pool, mesmo em caso de erro.
    cliente.release();
  }
}

/* Verifica se o banco esta acessivel. Usado pelo endpoint /health. */
export async function verificarConexao() {
  const inicio = Date.now();
  const resultado = await pool.query('SELECT 1 AS ok');
  return {
    ok: resultado.rows[0].ok === 1,
    latenciaMs: Date.now() - inicio,
  };
}

export async function encerrarPool() {
  await pool.end();
}

export default { pool, query, comTransacao, verificarConexao, encerrarPool };