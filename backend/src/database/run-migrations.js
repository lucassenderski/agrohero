import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, encerrarPool } from './pool.js';
import logger from '../config/logger.js';

/*
 * Executor de migrations.
 *
 * COMO USAR (dentro da pasta backend):
 *   npm run migrate
 *
 * Como funciona:
 *   1. cria a tabela de controle `migrations` (se nao existir);
 *   2. le os arquivos .sql da pasta migrations em ordem alfabetica;
 *   3. executa cada um que ainda nao foi aplicado, DENTRO DE UMA TRANSACAO;
 *   4. registra o nome e a data de quem rodou.
 *
 * Por que cada arquivo em sua propria transacao: o PostgreSQL faz DDL
 * transacional, entao se um arquivo falhar no meio, ele e revertido por
 * inteiro. Sem isso, um erro no comando 3 de 10 deixaria o schema pela
 * metade, e as migrations seguintes falhariam em cascata.
 *
 * Nomes seguem NNN_descricao.sql. A ordenacao alfabetica funciona porque
 * o numero tem sempre 3 digitos (001, 002, ..., 010, ...).
 */

const pastaMigrations = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function garantirTabelaControle() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id             SERIAL PRIMARY KEY,
      nome           VARCHAR(255) NOT NULL UNIQUE,
      aplicada_em    TIMESTAMPTZ  NOT NULL DEFAULT now()
    )
  `);
}

async function migrationsAplicadas() {
  const { rows } = await pool.query('SELECT nome FROM migrations ORDER BY nome');
  return new Set(rows.map((linha) => linha.nome));
}

async function listarArquivos() {
  const arquivos = await readdir(pastaMigrations);
  return arquivos
    .filter((nome) => nome.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

/*
 * Executa um arquivo SQL dentro de uma transacao propria.
 *
 * Aprendizado importante: nao usamos o pool.query() aqui, e sim uma
 * conexao dedicada (pool.connect()), porque o BEGIN/COMMIT precisa
 * acontecer sempre na MESMA conexao. Com o pool, cada query poderia
 * cair em uma conexao diferente e a transacao nao existiria de fato.
 */
async function executarMigration(nome) {
  const caminho = join(pastaMigrations, nome);
  const sql = await readFile(caminho, 'utf8');

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(sql);
    await cliente.query('INSERT INTO migrations (nome) VALUES ($1)', [nome]);
    await cliente.query('COMMIT');
    logger.info({ migration: nome }, 'Migration aplicada');
    return true;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    logger.error({ err: erro, migration: nome }, 'Falha na migration (revertida)');
    throw erro;
  } finally {
    cliente.release();
  }
}

async function rodar() {
  logger.info({ pasta: pastaMigrations }, 'Iniciando migrations');

  await garantirTabelaControle();
  const aplicadas = await migrationsAplicadas();
  const arquivos = await listarArquivos();

  const pendentes = arquivos.filter((nome) => !aplicadas.has(nome));

  if (pendentes.length === 0) {
    logger.info('Nenhuma migration pendente. Banco ja esta atualizado.');
    return;
  }

  logger.info({ pendentes }, `${pendentes.length} migration(oes) pendente(s)`);

  let contador = 0;
  for (const nome of pendentes) {
    await executarMigration(nome);
    contador += 1;
  }

  logger.info(`${contador} migration(oes) aplicada(s) com sucesso.`);
}

rodar()
  .then(async () => {
    await encerrarPool();
    process.exit(0);
  })
  .catch(async (erro) => {
    await encerrarPool().catch(() => {});
    logger.error({ err: erro }, 'Migrations interrompidas');
    process.exit(1);
  });