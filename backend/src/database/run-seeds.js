import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, encerrarPool } from './pool.js';
import { gerarHashSenha, gerarSenhaAleatoria } from '../utils/senha.js';
import logger from '../config/logger.js';

/*
 * Executor de seeds.
 *
 * COMO USAR (dentro da pasta backend):
 *   npm run seed
 *
 * Ao contrario das migrations, os seeds NAO tem tabela de controle: eles
 * sao escritos para serem idempotentes (ON CONFLICT DO NOTHING, checagem
 * antes de inserir). Assim podem rodar em todo deploy sem duplicar dado.
 */

const pastaSeeds = join(dirname(fileURLToPath(import.meta.url)), 'seeds');

async function rodarArquivosSql() {
  const arquivos = (await readdir(pastaSeeds))
    .filter((nome) => nome.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  for (const nome of arquivos) {
    const sql = await readFile(join(pastaSeeds, nome), 'utf8');
    await pool.query(sql);
    logger.info({ seed: nome }, 'Seed aplicado');
  }
}

/*
 * Cria o administrador inicial.
 *
 * A senha e ALEATORIA e aparece UMA VEZ no terminal. Isso resolve o
 * conflito entre duas regras: nao versionar senha (exigencia de seguranca)
 * e ter um admin funcional no primeiro acesso.
 *
 * Em producao, troque esta senha no primeiro login - a troca de senha e
 * implementada na FASE 5.
 */
async function criarAdministrador() {
  const email = 'admin@agrohero.local';

  const { rows } = await pool.query(
    'SELECT id FROM usuarios WHERE email = $1',
    [email],
  );

  if (rows.length > 0) {
    logger.info({ email }, 'Administrador ja existe. Nada a fazer.');
    return null;
  }

  const senhaTemporaria = gerarSenhaAleatoria(20);
  const senhaHash = await gerarHashSenha(senhaTemporaria);

  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, tipo, ativo)
     VALUES ($1, $2, $3, 'administrador', TRUE)`,
    ['Administrador AgroHero', email, senhaHash],
  );

  return { email, senhaTemporaria };
}

async function rodar() {
  logger.info('Iniciando seeds');

  await rodarArquivosSql();
  const admin = await criarAdministrador();

  if (admin) {
    // Nao usamos o logger aqui de proposito: a senha nao pode ir para
    // arquivo de log. Ela aparece apenas no terminal do operador.
    console.log('\n' + '='.repeat(60));
    console.log('  ADMINISTRADOR CRIADO');
    console.log('='.repeat(60));
    console.log(`  E-mail: ${admin.email}`);
    console.log(`  Senha : ${admin.senhaTemporaria}`);
    console.log('='.repeat(60));
    console.log('  Anote a senha agora. Ela nao e exibida novamente.');
    console.log('  Troque a senha no primeiro login.\n');
  }

  logger.info('Seeds concluidos');
}

rodar()
  .then(async () => {
    await encerrarPool();
    process.exit(0);
  })
  .catch(async (erro) => {
    await encerrarPool().catch(() => {});
    logger.error({ err: erro }, 'Seeds interrompidos');
    process.exit(1);
  });