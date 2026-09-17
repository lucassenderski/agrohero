import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { prepararSchema, limparDados } from '../helpers/banco.js';
import { gerarToken } from '../../src/utils/token.js';

/*
 * Testes do modulo de produtos (FASE 8).
 *
 * A prioridade aqui NAO e "o CRUD funciona" - e a PROPRIEDADE. Um
 * marketplace onde um agricultor edita o produto de outro esta
 * fundamentalmente quebrado, mesmo que todos os endpoints respondam 200.
 * Por isso boa parte dos testes e negativa: agricultor A tentando mexer
 * no produto do agricultor B, cliente tentando cadastrar, visitante
 * tentando escrever.
 *
 * O cenario usa DOIS agricultores de proposito. Com um so, um bug de
 * propriedade passaria despercebido, porque qualquer id pertenceria ao
 * unico dono existente.
 */

const ROTA = '/api/v1/produtos';

let tokenAgricultorA;
let tokenAgricultorB;
let tokenCliente;
let tokenAdmin;
let idAgricultorA;
let idAgricultorB;
let idCategoria;
let idProdutoA;
let idProdutoB;

beforeAll(async () => {
  await prepararSchema();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparDados();

  const { rows: usuarios } = await pool.query(`
    INSERT INTO usuarios (nome, email, senha_hash, tipo) VALUES
      ('Produtor A', 'a@teste.local', '$2b$12$hash', 'agricultor'),
      ('Produtor B', 'b@teste.local', '$2b$12$hash', 'agricultor'),
      ('Cliente',    'c@teste.local', '$2b$12$hash', 'cliente'),
      ('Admin',      'd@teste.local', '$2b$12$hash', 'administrador')
    RETURNING id, email, tipo
  `);

  const porEmail = (email) => usuarios.find((u) => u.email === email);
  tokenAgricultorA = gerarToken(porEmail('a@teste.local'));
  tokenAgricultorB = gerarToken(porEmail('b@teste.local'));
  tokenCliente = gerarToken(porEmail('c@teste.local'));
  tokenAdmin = gerarToken(porEmail('d@teste.local'));

  const { rows: agricultores } = await pool.query(
    `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado) VALUES
       ($1, 'Fazenda A', 'Campinas', 'SP'),
       ($2, 'Fazenda B', 'Recife',   'PE')
     RETURNING id, nome_fazenda`,
    [porEmail('a@teste.local').id, porEmail('b@teste.local').id],
  );
  idAgricultorA = agricultores.find((a) => a.nome_fazenda === 'Fazenda A').id;
  idAgricultorB = agricultores.find((a) => a.nome_fazenda === 'Fazenda B').id;

  const { rows: categorias } = await pool.query(
    `INSERT INTO categorias (nome, slug) VALUES ('Legumes', 'legumes'), ('Frutas', 'frutas')
     RETURNING id, slug`,
  );
  idCategoria = categorias.find((c) => c.slug === 'legumes').id;

  const { rows: produtos } = await pool.query(
    `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque) VALUES
       ($1, $3, 'Tomate',  8.50, 100),
       ($2, $3, 'Morango', 20.00, 50)
     RETURNING id, nome`,
    [idAgricultorA, idAgricultorB, idCategoria],
  );
  idProdutoA = produtos.find((p) => p.nome === 'Tomate').id;
  idProdutoB = produtos.find((p) => p.nome === 'Morango').id;
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

/* ---------------------------------------------------------------- */
/* Criacao                                                           */
/* ---------------------------------------------------------------- */

describe('POST /produtos - criacao pelo agricultor', () => {
  test('agricultor cria produto e o dono vem do token', async () => {
    const resposta = await request(app)
      .post(ROTA)
      .set(auth(tokenAgricultorA))
      .send({
        nome: 'Alface Crespa',
        descricao: 'Alface organica, colhida no dia.',
        preco: 4.5,
        estoque: 30,
        unidade: 'unidade',
        categoria_id: idCategoria,
      })
      .expect(201);

    expect(resposta.body.dados.nome).toBe('Alface Crespa');
    expect(resposta.body.dados.preco).toBe(4.5);
    expect(resposta.body.dados.ativo).toBe(true);

    // O dono e o agricultor A, que enviou a requisicao.
    expect(Number(resposta.body.dados.agricultor_id)).toBe(Number(idAgricultorA));
  });

  /*
   * O teste mais importante desta secao: o corpo tenta forjar o dono.
   * Se o service usasse `agricultor_id` do body, o produto apareceria
   * na vitrine do produtor B - um agricultor publicando em nome de
   * outro. O id do corpo precisa ser simplesmente ignorado.
   */
  test('ignora agricultor_id enviado no corpo (nao permite forjar o dono)', async () => {
    const resposta = await request(app)
      .post(ROTA)
      .set(auth(tokenAgricultorA))
      .send({
        nome: 'Produto Forjado',
        preco: 10,
        estoque: 5,
        unidade: 'kg',
        categoria_id: idCategoria,
        agricultor_id: idAgricultorB,
      })
      .expect(201);

    expect(Number(resposta.body.dados.agricultor_id)).toBe(Number(idAgricultorA));
    expect(Number(resposta.body.dados.agricultor_id)).not.toBe(Number(idAgricultorB));
  });

  test('cliente nao pode criar produto', async () => {
    await request(app)
      .post(ROTA)
      .set(auth(tokenCliente))
      .send({ nome: 'Invasao', preco: 10, estoque: 1, unidade: 'kg', categoria_id: idCategoria })
      .expect(403);
  });

  test('administrador nao cria produto (nao e agricultor)', async () => {
    await request(app)
      .post(ROTA)
      .set(auth(tokenAdmin))
      .send({ nome: 'Admin Produto', preco: 10, estoque: 1, unidade: 'kg', categoria_id: idCategoria })
      .expect(403);
  });

  test('sem token devolve 401', async () => {
    await request(app)
      .post(ROTA)
      .send({ nome: 'Anonimo', preco: 10, estoque: 1, unidade: 'kg', categoria_id: idCategoria })
      .expect(401);
  });

  test('recusa preco zero ou negativo', async () => {
    for (const preco of [0, -5]) {
      await request(app)
        .post(ROTA)
        .set(auth(tokenAgricultorA))
        .send({ nome: 'Preco Ruim', preco, estoque: 1, unidade: 'kg', categoria_id: idCategoria })
        .expect(400);
    }
  });

  test('recusa estoque negativo', async () => {
    await request(app)
      .post(ROTA)
      .set(auth(tokenAgricultorA))
      .send({ nome: 'Estoque Ruim', preco: 10, estoque: -1, unidade: 'kg', categoria_id: idCategoria })
      .expect(400);
  });

  test('aceita estoque zero (produto cadastrado e esgotado)', async () => {
    const resposta = await request(app)
      .post(ROTA)
      .set(auth(tokenAgricultorA))
      .send({ nome: 'Sem Estoque', preco: 10, estoque: 0, unidade: 'kg', categoria_id: idCategoria })
      .expect(201);

    expect(resposta.body.dados.estoque).toBe(0);
  });

  test('recusa unidade fora da lista permitida', async () => {
    await request(app)
      .post(ROTA)
      .set(auth(tokenAgricultorA))
      .send({ nome: 'Unidade Ruim', preco: 10, estoque: 1, unidade: 'quilos', categoria_id: idCategoria })
      .expect(400);
  });

  test('recusa categoria inexistente', async () => {
    await request(app)
      .post(ROTA)
      .set(auth(tokenAgricultorA))
      .send({ nome: 'Categoria Fantasma', preco: 10, estoque: 1, unidade: 'kg', categoria_id: 999999 })
      .expect(400);
  });

  /*
   * Categoria desativada nao aceita produto novo: o admin a tirou do ar,
   * e um produto criado ali nasceria invisivel - o agricultor veria o
   * cadastro "funcionar" e nunca encontraria o item no marketplace.
   */
  test('recusa categoria desativada', async () => {
    const { rows } = await pool.query(
      `INSERT INTO categorias (nome, slug, ativo) VALUES ('Desativada', 'desativada', FALSE)
       RETURNING id`,
    );

    const resposta = await request(app)
      .post(ROTA)
      .set(auth(tokenAgricultorA))
      .send({ nome: 'Produto Orfao', preco: 10, estoque: 1, unidade: 'kg', categoria_id: rows[0].id })
      .expect(400);

    expect(resposta.body.erro.mensagem).toMatch(/desativada/i);
  });

  test('recusa nome curto demais', async () => {
    await request(app)
      .post(ROTA)
      .set(auth(tokenAgricultorA))
      .send({ nome: 'X', preco: 10, estoque: 1, unidade: 'kg', categoria_id: idCategoria })
      .expect(400);
  });

  test('recusa preco com mais de duas casas decimais', async () => {
    await request(app)
      .post(ROTA)
      .set(auth(tokenAgricultorA))
      .send({ nome: 'Preco Quebrado', preco: 8.999, estoque: 1, unidade: 'kg', categoria_id: idCategoria })
      .expect(400);
  });
});

/* ---------------------------------------------------------------- */
/* Propriedade (IDOR)                                               */
/* ---------------------------------------------------------------- */

describe('propriedade do produto - agricultor nao mexe no produto alheio', () => {
  test('agricultor A nao edita produto do agricultor B', async () => {
    const resposta = await request(app)
      .patch(`${ROTA}/${idProdutoB}`)
      .set(auth(tokenAgricultorA))
      .send({ preco: 1.0 })
      .expect(403);

    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');

    // Confirma que o preco do produto B nao mudou.
    const { rows } = await pool.query('SELECT preco FROM produtos WHERE id = $1', [idProdutoB]);
    expect(rows[0].preco).toBe(20);
  });

  test('agricultor A nao desativa produto do agricultor B', async () => {
    await request(app)
      .delete(`${ROTA}/${idProdutoB}`)
      .set(auth(tokenAgricultorA))
      .expect(403);

    const { rows } = await pool.query('SELECT ativo FROM produtos WHERE id = $1', [idProdutoB]);
    expect(rows[0].ativo).toBe(true);
  });

  test('agricultor A nao repoe estoque de produto do agricultor B', async () => {
    await request(app)
      .patch(`${ROTA}/${idProdutoB}/estoque`)
      .set(auth(tokenAgricultorA))
      .send({ quantidade: 1000 })
      .expect(403);

    const { rows } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [idProdutoB]);
    expect(rows[0].estoque).toBe(50);
  });

  test('agricultor A nao altera disponibilidade de produto do agricultor B', async () => {
    await request(app)
      .patch(`${ROTA}/${idProdutoB}/disponibilidade`)
      .set(auth(tokenAgricultorA))
      .send({ ativo: false })
      .expect(403);
  });

  test('cliente nao edita produto', async () => {
    await request(app)
      .patch(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenCliente))
      .send({ preco: 1.0 })
      .expect(403);
  });

  test('produto inexistente devolve 404', async () => {
    await request(app)
      .patch(`${ROTA}/999999`)
      .set(auth(tokenAgricultorA))
      .send({ preco: 1.0 })
      .expect(404);
  });

  test('o dono edita o proprio produto', async () => {
    const resposta = await request(app)
      .patch(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .send({ preco: 9.75 })
      .expect(200);

    expect(resposta.body.dados.preco).toBe(9.75);
  });
});

/* ---------------------------------------------------------------- */
/* Atualizacao parcial                                              */
/* ---------------------------------------------------------------- */

describe('PATCH /produtos/:id - atualizacao parcial', () => {
  test('atualiza apenas o campo enviado e preserva o resto', async () => {
    const antes = (await pool.query('SELECT * FROM produtos WHERE id = $1', [idProdutoA])).rows[0];

    await request(app)
      .patch(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .send({ estoque: 7 })
      .expect(200);

    const depois = (await pool.query('SELECT * FROM produtos WHERE id = $1', [idProdutoA])).rows[0];

    expect(depois.estoque).toBe(7);
    // Nome, preco e descricao intactos: um PATCH de estoque nao pode
    // zerar os outros campos.
    expect(depois.nome).toBe(antes.nome);
    expect(depois.preco).toBe(antes.preco);
    expect(depois.descricao).toBe(antes.descricao);
  });

  test('recusa PATCH sem nenhum campo', async () => {
    await request(app)
      .patch(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .send({})
      .expect(400);
  });

  test('recusa troca para categoria desativada', async () => {
    const { rows } = await pool.query(
      `INSERT INTO categorias (nome, slug, ativo) VALUES ('Morta', 'morta', FALSE) RETURNING id`,
    );

    await request(app)
      .patch(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .send({ categoria_id: rows[0].id })
      .expect(400);
  });

  test('o dono pode trocar de categoria ativa', async () => {
    const { rows } = await pool.query(`SELECT id FROM categorias WHERE slug = 'frutas'`);

    const resposta = await request(app)
      .patch(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .send({ categoria_id: rows[0].id })
      .expect(200);

    expect(Number(resposta.body.dados.categoria_id)).toBe(Number(rows[0].id));
  });
});

/* ---------------------------------------------------------------- */
/* Disponibilidade e estoque                                        */
/* ---------------------------------------------------------------- */

describe('disponibilidade e estoque', () => {
  test('o dono desativa e reativa o produto', async () => {
    await request(app)
      .patch(`${ROTA}/${idProdutoA}/disponibilidade`)
      .set(auth(tokenAgricultorA))
      .send({ ativo: false })
      .expect(200);

    let { rows } = await pool.query('SELECT ativo FROM produtos WHERE id = $1', [idProdutoA]);
    expect(rows[0].ativo).toBe(false);

    await request(app)
      .patch(`${ROTA}/${idProdutoA}/disponibilidade`)
      .set(auth(tokenAgricultorA))
      .send({ ativo: true })
      .expect(200);

    ({ rows } = await pool.query('SELECT ativo FROM produtos WHERE id = $1', [idProdutoA]));
    expect(rows[0].ativo).toBe(true);
  });

  test('desativar o que ja esta desativado devolve 422', async () => {
    await request(app)
      .delete(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    // Segunda tentativa: o estado ja e o pedido, e a API avisa em vez de
    // responder sucesso silencioso.
    const resposta = await request(app)
      .delete(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('PRODUTO_JA_INATIVO');
  });

  test('repor estoque SOMA ao valor atual', async () => {
    const resposta = await request(app)
      .patch(`${ROTA}/${idProdutoA}/estoque`)
      .set(auth(tokenAgricultorA))
      .send({ quantidade: 15 })
      .expect(200);

    expect(resposta.body.dados.estoque).toBe(115);
  });

  test('repor estoque recusa quantidade zero ou negativa', async () => {
    for (const quantidade of [0, -10]) {
      await request(app)
        .patch(`${ROTA}/${idProdutoA}/estoque`)
        .set(auth(tokenAgricultorA))
        .send({ quantidade })
        .expect(400);
    }
  });

  test('nao repoe estoque de produto desativado', async () => {
    await request(app)
      .delete(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    const resposta = await request(app)
      .patch(`${ROTA}/${idProdutoA}/estoque`)
      .set(auth(tokenAgricultorA))
      .send({ quantidade: 10 })
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('PRODUTO_INATIVO');
  });

  test('DELETE nao apaga o registro, apenas desativa', async () => {
    await request(app)
      .delete(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    const { rows } = await pool.query('SELECT ativo FROM produtos WHERE id = $1', [idProdutoA]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ativo).toBe(false);
  });
});

/* ---------------------------------------------------------------- */
/* Leitura publica                                                  */
/* ---------------------------------------------------------------- */

describe('GET /produtos - catalogo publico', () => {
  test('visitante lista os produtos ativos', async () => {
    const resposta = await request(app).get(ROTA).expect(200);

    expect(resposta.body.dados).toHaveLength(2);
    expect(resposta.body.paginacao.total).toBe(2);
  });

  test('nao expoe produto desativado', async () => {
    await request(app)
      .delete(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    const resposta = await request(app).get(ROTA).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome).toBe('Morango');
  });

  test('detalhe publico de produto desativado devolve 404', async () => {
    await request(app)
      .delete(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    await request(app).get(`${ROTA}/${idProdutoA}`).expect(404);
  });

  test('nao expoe produto de categoria desativada', async () => {
    await pool.query('UPDATE categorias SET ativo = FALSE WHERE id = $1', [idCategoria]);

    const resposta = await request(app).get(ROTA).expect(200);
    expect(resposta.body.dados).toHaveLength(0);
  });

  test('nao expoe produto de produtor suspenso', async () => {
    await pool.query('UPDATE agricultores SET ativo = FALSE WHERE id = $1', [idAgricultorA]);

    const resposta = await request(app).get(ROTA).expect(200);
    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome).toBe('Morango');
  });

  test('detalhe publico devolve 404 para id inexistente', async () => {
    await request(app).get(`${ROTA}/999999`).expect(404);
  });

  test('detalhe publico devolve 400 para id nao numerico', async () => {
    await request(app).get(`${ROTA}/abc`).expect(400);
  });

  test('produto esgotado nao aparece por padrao', async () => {
    await pool.query('UPDATE produtos SET estoque = 0 WHERE id = $1', [idProdutoA]);

    const resposta = await request(app).get(ROTA).expect(200);
    expect(resposta.body.dados).toHaveLength(1);
  });

  test('produto esgotado aparece com disponivel=false', async () => {
    await pool.query('UPDATE produtos SET estoque = 0 WHERE id = $1', [idProdutoA]);

    const resposta = await request(app).get(`${ROTA}?disponivel=false`).expect(200);
    expect(resposta.body.dados).toHaveLength(2);
  });
});

/* ---------------------------------------------------------------- */
/* Busca e filtros                                                  */
/* ---------------------------------------------------------------- */

describe('GET /produtos - busca e filtros', () => {
  test('busca por nome', async () => {
    const resposta = await request(app).get(`${ROTA}?busca=morang`).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome).toBe('Morango');
  });

  test('busca ignora maiuscula', async () => {
    const resposta = await request(app).get(`${ROTA}?busca=TOMATE`).expect(200);
    expect(resposta.body.dados).toHaveLength(1);
  });

  /*
   * O `%` digitado pelo usuario precisa ser tratado como texto, nao como
   * curinga do LIKE. Sem o escape, `busca=%` casaria com TODOS os
   * produtos e o filtro pareceria nao funcionar.
   */
  test('busca com % nao funciona como curinga', async () => {
    const resposta = await request(app).get(`${ROTA}?busca=%25`).expect(400);
    expect(resposta.body.erro).toBeDefined();
  });

  test('busca literal por % nao retorna tudo', async () => {
    const resposta = await request(app).get(`${ROTA}?busca=${encodeURIComponent('100%')}`).expect(200);
    expect(resposta.body.dados).toHaveLength(0);
  });

  test('filtra por categoria', async () => {
    const { rows } = await pool.query(`SELECT id FROM categorias WHERE slug = 'frutas'`);

    const resposta = await request(app).get(`${ROTA}?categoria_id=${rows[0].id}`).expect(200);
    expect(resposta.body.dados).toHaveLength(0);

    const comLegumes = await request(app).get(`${ROTA}?categoria_id=${idCategoria}`).expect(200);
    expect(comLegumes.body.dados).toHaveLength(2);
  });

  test('filtra por agricultor', async () => {
    const resposta = await request(app).get(`${ROTA}?agricultor_id=${idAgricultorB}`).expect(200);
    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome).toBe('Morango');
  });

  test('filtra por cidade', async () => {
    const resposta = await request(app).get(`${ROTA}?cidade=Recife`).expect(200);
    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome).toBe('Morango');
  });

  test('filtra por estado', async () => {
    const resposta = await request(app).get(`${ROTA}?estado=SP`).expect(200);
    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome).toBe('Tomate');
  });

  test('estado aceita minuscula e normaliza', async () => {
    const resposta = await request(app).get(`${ROTA}?estado=sp`).expect(200);
    expect(resposta.body.dados).toHaveLength(1);
  });

  test('filtra por faixa de preco', async () => {
    const baratos = await request(app).get(`${ROTA}?preco_max=10`).expect(200);
    expect(baratos.body.dados).toHaveLength(1);
    expect(baratos.body.dados[0].nome).toBe('Tomate');

    const caros = await request(app).get(`${ROTA}?preco_min=10`).expect(200);
    expect(caros.body.dados).toHaveLength(1);
    expect(caros.body.dados[0].nome).toBe('Morango');
  });

  test('ordena por preco crescente e decrescente', async () => {
    const baratos = await request(app).get(`${ROTA}?ordenar=baratos`).expect(200);
    expect(baratos.body.dados[0].nome).toBe('Tomate');

    const caros = await request(app).get(`${ROTA}?ordenar=caros`).expect(200);
    expect(caros.body.dados[0].nome).toBe('Morango');
  });

  test('recusa ordenacao fora da lista', async () => {
    await request(app).get(`${ROTA}?ordenar=preco;DROP TABLE produtos`).expect(400);
  });

  test('pagina os resultados', async () => {
    const resposta = await request(app).get(`${ROTA}?limite=1&pagina=1`).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.paginacao.total).toBe(2);
    expect(resposta.body.paginacao.paginas).toBe(2);
  });

  test('pagina alem do fim devolve 404', async () => {
    await request(app).get(`${ROTA}?pagina=99`).expect(404);
  });

  test('recusa limite acima do maximo', async () => {
    await request(app).get(`${ROTA}?limite=5000`).expect(400);
  });
});

/* ---------------------------------------------------------------- */
/* Listagem do dono                                                 */
/* ---------------------------------------------------------------- */

describe('GET /produtos/meus - listagem do agricultor', () => {
  test('agricultor ve apenas os proprios produtos', async () => {
    const resposta = await request(app)
      .get(`${ROTA}/meus`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome).toBe('Tomate');
  });

  test('agricultor ve os proprios produtos inativos', async () => {
    await request(app)
      .delete(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    const resposta = await request(app)
      .get(`${ROTA}/meus`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].ativo).toBe(false);
  });

  test('filtra por situacao inativos', async () => {
    await request(app)
      .delete(`${ROTA}/${idProdutoA}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    const inativos = await request(app)
      .get(`${ROTA}/meus?situacao=inativos`)
      .set(auth(tokenAgricultorA))
      .expect(200);
    expect(inativos.body.dados).toHaveLength(1);

    const ativos = await request(app)
      .get(`${ROTA}/meus?situacao=ativos`)
      .set(auth(tokenAgricultorA))
      .expect(200);
    expect(ativos.body.dados).toHaveLength(0);
  });

  test('cliente nao acessa a listagem do agricultor', async () => {
    await request(app)
      .get(`${ROTA}/meus`)
      .set(auth(tokenCliente))
      .expect(403);
  });

  test('sem token devolve 401', async () => {
    await request(app).get(`${ROTA}/meus`).expect(401);
  });

  /*
   * A rota /meus precisa ser declarada antes de /:id. Se a ordem
   * inverter, "meus" e interpretado como id e a resposta e 400 - erro
   * confuso, que parece falha de validacao.
   */
  test('/meus nao e interpretado como id de produto', async () => {
    const resposta = await request(app)
      .get(`${ROTA}/meus`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    expect(Array.isArray(resposta.body.dados)).toBe(true);
  });
});

/* ---------------------------------------------------------------- */
/* Conta de produtor incompleta                                     */
/* ---------------------------------------------------------------- */

describe('conta de produtor sem perfil de propriedade', () => {
  test('agricultor sem perfil recebe 422 explicativo', async () => {
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo)
       VALUES ('Sem Perfil', 'semperfil@teste.local', '$2b$12$hash', 'agricultor')
       RETURNING id, email, tipo`,
    );
    const token = gerarToken(rows[0]);

    const resposta = await request(app)
      .post(ROTA)
      .set(auth(token))
      .send({ nome: 'Produto Solto', preco: 10, estoque: 1, unidade: 'kg', categoria_id: idCategoria })
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('PERFIL_AGRICULTOR_AUSENTE');
  });

  test('agricultor suspenso nao cria produto', async () => {
    await pool.query('UPDATE agricultores SET ativo = FALSE WHERE id = $1', [idAgricultorA]);

    const resposta = await request(app)
      .post(ROTA)
      .set(auth(tokenAgricultorA))
      .send({ nome: 'Produto Suspenso', preco: 10, estoque: 1, unidade: 'kg', categoria_id: idCategoria })
      .expect(403);

    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });
});
