import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../../src/database/pool.js';

/*
 * Utilitarios para os testes que precisam de um banco de verdade.
 *
 * Os testes usam o banco DATABASE_URL_TEST (agrohero_test), que e
 * descartavel. Por isso podemos recriar o schema do zero a cada execucao:
 * o teste sempre roda contra o schema mais recente, sem depender de o
 * desenvolvedor ter lembrado de rodar `npm run migrate`.
 */

const pastaMigrations = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'database',
  'migrations',
);

/*
 * Recria o schema publico do zero e aplica todas as migrations.
 * Deixamos a tabela `migrations` de fora porque ela e a propria tabela de
 * controle: o schema de teste e construido do zero toda vez.
 */
export async function prepararSchema() {
  const arquivos = (await readdir(pastaMigrations))
    .filter((nome) => nome.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  const cliente = await pool.connect();
  try {
    await cliente.query('DROP SCHEMA public CASCADE');
    await cliente.query('CREATE SCHEMA public');

    for (const nome of arquivos) {
      const sql = await readFile(join(pastaMigrations, nome), 'utf8');
      await cliente.query(sql);
    }

    return arquivos.length;
  } finally {
    cliente.release();
  }
}

/* Apaga os dados, mantendo o schema. Usado entre testes. */
export async function limparDados() {
  await pool.query(`
    TRUNCATE avaliacoes, pagamentos, pedido_itens, pedidos,
             carrinho_itens, carrinhos, produtos, agricultores,
             enderecos, usuarios, categorias
    RESTART IDENTITY CASCADE
  `);
}

/*
 * Cria o cenario minimo usado por varios testes:
 * 1 cliente, 2 agricultores (com fazenda), 2 produtos (um de cada) e
 * 1 pedido com um item de cada agricultor.
 *
 * Retorna os ids para os testes referenciarem sem consultar de novo.
 */
export async function criarCenarioMultiAgricultor() {
  const { rows: usuarios } = await pool.query(`
    INSERT INTO usuarios (nome, email, senha_hash, tipo) VALUES
      ('Cliente Teste',  'cliente@teste.local',  '$2b$12$hash', 'cliente'),
      ('Produtor A',     'produtor.a@teste.local', '$2b$12$hash', 'agricultor'),
      ('Produtor B',     'produtor.b@teste.local', '$2b$12$hash', 'agricultor')
    RETURNING id, email
  `);

  const idCliente = usuarios.find((u) => u.email === 'cliente@teste.local').id;
  const idUsuarioA = usuarios.find((u) => u.email === 'produtor.a@teste.local').id;
  const idUsuarioB = usuarios.find((u) => u.email === 'produtor.b@teste.local').id;

  const { rows: agricultores } = await pool.query(
    `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado) VALUES
       ($1, 'Fazenda A', 'Campinas', 'SP'),
       ($2, 'Fazenda B', 'Recife',   'PE')
     RETURNING id, nome_fazenda`,
    [idUsuarioA, idUsuarioB],
  );

  const idAgricultorA = agricultores.find((a) => a.nome_fazenda === 'Fazenda A').id;
  const idAgricultorB = agricultores.find((a) => a.nome_fazenda === 'Fazenda B').id;

  const { rows: categorias } = await pool.query(
    `INSERT INTO categorias (nome, slug) VALUES ('Legumes', 'legumes')
     RETURNING id`,
  );
  const idCategoria = categorias[0].id;

  const { rows: produtos } = await pool.query(
    `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque) VALUES
       ($1, $3, 'Tomate',  8.50, 100),
       ($2, $3, 'Morango', 20.00, 50)
     RETURNING id, nome, agricultor_id`,
    [idAgricultorA, idAgricultorB, idCategoria],
  );

  const produtoTomate = produtos.find((p) => p.nome === 'Tomate');
  const produtoMorango = produtos.find((p) => p.nome === 'Morango');

  // Pedido com um item de CADA agricultor - e o cenario do requisito 18.
  const { rows: pedidos } = await pool.query(
    `INSERT INTO pedidos
       (consumidor_id, status, valor_produtos, valor_frete, valor_total, endereco_entrega)
     VALUES ($1, 'PENDENTE', 28.50, 9.90, 38.40, $2)
     RETURNING id`,
    [idCliente, JSON.stringify({ cidade: 'Campinas', estado: 'SP' })],
  );
  const idPedido = pedidos[0].id;

  const { rows: itens } = await pool.query(
    `INSERT INTO pedido_itens
       (pedido_id, produto_id, agricultor_id, preco_unitario, quantidade, subtotal)
     VALUES ($1, $2, $3, 8.50, 1, 8.50),
            ($1, $4, $5, 20.00, 1, 20.00)
     RETURNING id, produto_id, agricultor_id`,
    [idPedido, produtoTomate.id, idAgricultorA, produtoMorango.id, idAgricultorB],
  );

  return {
    idCliente,
    idUsuarioA,
    idUsuarioB,
    idAgricultorA,
    idAgricultorB,
    idCategoria,
    produtoTomate,
    produtoMorango,
    idPedido,
    itemA: itens.find((i) => i.agricultor_id === idAgricultorA),
    itemB: itens.find((i) => i.agricultor_id === idAgricultorB),
  };
}

export default { prepararSchema, limparDados, criarCenarioMultiAgricultor };