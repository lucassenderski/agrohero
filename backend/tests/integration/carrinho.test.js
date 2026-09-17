import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { prepararSchema, limparDados } from '../helpers/banco.js';
import { gerarToken } from '../../src/utils/token.js';

/*
 * Testes do carrinho (FASE 10).
 *
 * O foco aqui nao e "adicionar item funciona". E provar que o carrinho
 * NAO ACEITA PRECO do cliente, e que o total exibido e o total
 * calculado pelo servidor a partir do banco.
 *
 * O teste central e 'preco do corpo da requisicao e ignorado': ele envia
 * preco, subtotal e total absurdos e confere que o valor devolvido
 * continua sendo o do banco. Se esse teste passar por acidente (por o
 * campo nao existir no schema) ou falhar, a defesa contra manipulacao de
 * preco esta quebrada.
 *
 * O segundo bloco cobre o cenario de dois consumidores: o carrinho de um
 * nao pode ser lido nem alterado pelo outro. Como nao existe
 * `carrinho_id` em rota nenhuma, esse acesso indevido nao tem por onde
 * acontecer - os testes confirmam que a ausencia do parametro e real, e
 * nao apenas nao testada.
 */

const ROTA = '/api/v1/carrinho';

let tokenCliente;
let tokenOutroCliente;
let tokenAgricultor;
let idProduto;
let idProdutoEsgotado;
let idProdutoInativo;
let idProdutoCaro;

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
      ('Cliente',     'cliente@teste.local', '$2b$12$hash', 'cliente'),
      ('Outro',       'outro@teste.local',   '$2b$12$hash', 'cliente'),
      ('Produtor',    'prod@teste.local',    '$2b$12$hash', 'agricultor')
    RETURNING id, email, tipo
  `);

  const porEmail = (email) => usuarios.find((u) => u.email === email);
  tokenCliente = gerarToken(porEmail('cliente@teste.local'));
  tokenOutroCliente = gerarToken(porEmail('outro@teste.local'));
  tokenAgricultor = gerarToken(porEmail('prod@teste.local'));

  const { rows: agricultores } = await pool.query(
    `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado)
     VALUES ($1, 'Fazenda A', 'Campinas', 'SP') RETURNING id`,
    [porEmail('prod@teste.local').id],
  );
  const idAgricultor = agricultores[0].id;

  const { rows: categorias } = await pool.query(
    `INSERT INTO categorias (nome, slug) VALUES ('Legumes', 'legumes') RETURNING id`,
  );

  const { rows: produtos } = await pool.query(
    `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque, ativo) VALUES
       ($1, $2, 'Tomate',    8.50, 10, TRUE),
       ($1, $2, 'Esgotado',  5.00,  0, TRUE),
       ($1, $2, 'Inativo',   3.00, 50, FALSE),
       ($1, $2, 'Morango',  20.00,  5, TRUE)
     RETURNING id, nome`,
    [idAgricultor, categorias[0].id],
  );

  idProduto = produtos.find((p) => p.nome === 'Tomate').id;
  idProdutoEsgotado = produtos.find((p) => p.nome === 'Esgotado').id;
  idProdutoInativo = produtos.find((p) => p.nome === 'Inativo').id;
  idProdutoCaro = produtos.find((p) => p.nome === 'Morango').id;
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

/* ---------------------------------------------------------------- */
/* Acesso                                                            */
/* ---------------------------------------------------------------- */

describe('acesso ao carrinho', () => {
  test('sem token devolve 401', async () => {
    await request(app).get(ROTA).expect(401);
  });

  test('agricultor nao acessa o carrinho de cliente', async () => {
    await request(app).get(ROTA).set(auth(tokenAgricultor)).expect(403);
  });

  test('cliente recebe carrinho vazio na primeira consulta', async () => {
    const resposta = await request(app).get(ROTA).set(auth(tokenCliente)).expect(200);

    expect(resposta.body.dados.itens).toEqual([]);
    expect(resposta.body.dados.valor_produtos).toBe(0);
  });

  test('consultar duas vezes nao cria dois carrinhos', async () => {
    await request(app).get(ROTA).set(auth(tokenCliente)).expect(200);
    await request(app).get(ROTA).set(auth(tokenCliente)).expect(200);

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM carrinhos');
    expect(rows[0].n).toBe(1);
  });
});

/* ---------------------------------------------------------------- */
/* Manipulacao de preco (o teste central)                            */
/* ---------------------------------------------------------------- */

describe('o carrinho nao aceita preco do cliente', () => {
  /*
   * Envia preco, subtotal e total junto com o item. Nenhum dos tres
   * existe no schema, entao o Zod os remove antes do controller. O
   * valor devolvido tem de ser o do banco.
   */
  test('preco do corpo da requisicao e ignorado', async () => {
    const resposta = await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({
        produto_id: idProduto,
        quantidade: 2,
        preco: 0.01,
        subtotal: 0.02,
        valor_produtos: 0.02,
        valor_total: 0.02,
        preco_unitario: 0.01,
      })
      .expect(201);

    const item = resposta.body.dados.itens[0];

    // 8.50 x 2 = 17.00, e nao os 0.02 enviados.
    expect(item.preco_unitario).toBe(8.5);
    expect(item.subtotal).toBe(17);
    expect(resposta.body.dados.valor_produtos).toBe(17);
  });

  test('preco enviado na alteracao de quantidade tambem e ignorado', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(201);

    const resposta = await request(app)
      .patch(`${ROTA}/itens/${idProduto}`)
      .set(auth(tokenCliente))
      .send({ quantidade: 3, preco: 0.01 })
      .expect(200);

    expect(resposta.body.dados.itens[0].preco_unitario).toBe(8.5);
    expect(resposta.body.dados.itens[0].subtotal).toBe(25.5);
  });

  /*
   * Se o agricultor mudar o preco, o carrinho do cliente passa a mostrar
   * o preco novo. Isso e intencional: o carrinho nao guarda preco, entao
   * nao ha copia antiga para divergir do banco.
   */
  test('o total acompanha a mudanca de preco feita pelo agricultor', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 2 })
      .expect(201);

    await pool.query('UPDATE produtos SET preco = 10.00 WHERE id = $1', [idProduto]);

    const resposta = await request(app).get(ROTA).set(auth(tokenCliente)).expect(200);

    expect(resposta.body.dados.itens[0].preco_unitario).toBe(10);
    expect(resposta.body.dados.valor_produtos).toBe(20);
  });

  test('nao existe coluna de preco na tabela carrinho_itens', async () => {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'carrinho_itens'
    `);

    const colunas = rows.map((r) => r.column_name);
    expect(colunas).not.toContain('preco');
    expect(colunas).not.toContain('subtotal');
    expect(colunas).toContain('quantidade');
  });
});

/* ---------------------------------------------------------------- */
/* Adicionar item                                                    */
/* ---------------------------------------------------------------- */

describe('POST /carrinho/itens - adicionar', () => {
  test('adiciona produto e devolve o item com dados da fazenda', async () => {
    const resposta = await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 3 })
      .expect(201);

    const item = resposta.body.dados.itens[0];
    expect(item.quantidade).toBe(3);
    expect(item.produto.nome).toBe('Tomate');
    expect(item.produto.nome_fazenda).toBe('Fazenda A');
    expect(item.produto.unidade).toBe('unidade');
  });

  test('adicionar o mesmo produto SOMA a quantidade', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 2 })
      .expect(201);

    const resposta = await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 3 })
      .expect(201);

    expect(resposta.body.dados.itens).toHaveLength(1);
    expect(resposta.body.dados.itens[0].quantidade).toBe(5);
  });

  /*
   * A soma precisa ser conferida contra o estoque. Aqui ja existem 8 no
   * carrinho e o estoque e 10: adicionar 5 levara a 13, que nao cabe.
   * Validar apenas os 5 enviados passaria, e o carrinho ficaria invalido.
   */
  test('recusa soma que ultrapassa o estoque', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 8 })
      .expect(201);

    const resposta = await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 5 })
      .expect(409);

    expect(resposta.body.erro.codigo).toBe('ESTOQUE_INSUFICIENTE');
  });

  test('recusa quantidade acima do estoque', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 11 })
      .expect(409);
  });

  test('aceita exatamente o estoque disponivel', async () => {
    const resposta = await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 10 })
      .expect(201);

    expect(resposta.body.dados.itens[0].quantidade).toBe(10);
    expect(resposta.body.dados.itens[0].disponivel).toBe(true);
  });

  test('recusa quantidade zero ou negativa', async () => {
    for (const quantidade of [0, -1]) {
      await request(app)
        .post(`${ROTA}/itens`)
        .set(auth(tokenCliente))
        .send({ produto_id: idProduto, quantidade })
        .expect(400);
    }
  });

  test('recusa quantidade fracionada', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1.5 })
      .expect(400);
  });

  test('recusa produto esgotado', async () => {
    const resposta = await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProdutoEsgotado, quantidade: 1 })
      .expect(409);

    expect(resposta.body.erro.codigo).toBe('ESTOQUE_INSUFICIENTE');
  });

  test('recusa produto inativo', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProdutoInativo, quantidade: 1 })
      .expect(404);
  });

  test('recusa produto inexistente', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: 999999, quantidade: 1 })
      .expect(404);
  });

  test('recusa produto de produtor suspenso', async () => {
    await pool.query('UPDATE agricultores SET ativo = FALSE');

    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(404);
  });

  test('recusa produto de categoria desativada', async () => {
    await pool.query('UPDATE categorias SET ativo = FALSE');

    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(404);
  });

  test('recusa id de produto nao numerico', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: 'abc', quantidade: 1 })
      .expect(400);
  });
});

/* ---------------------------------------------------------------- */
/* Alterar quantidade                                                */
/* ---------------------------------------------------------------- */

describe('PATCH /carrinho/itens/:produtoId - alterar quantidade', () => {
  test('substitui a quantidade (nao soma)', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 5 })
      .expect(201);

    const resposta = await request(app)
      .patch(`${ROTA}/itens/${idProduto}`)
      .set(auth(tokenCliente))
      .send({ quantidade: 2 })
      .expect(200);

    expect(resposta.body.dados.itens[0].quantidade).toBe(2);
  });

  test('recusa quantidade acima do estoque', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(201);

    await request(app)
      .patch(`${ROTA}/itens/${idProduto}`)
      .set(auth(tokenCliente))
      .send({ quantidade: 99 })
      .expect(409);
  });

  /*
   * Item que nao esta no carrinho devolve 404, e nao cria o item. Um
   * PATCH que cria silenciosamente faria o cliente que digitou a
   * quantidade no lugar errado adicionar produto sem perceber.
   */
  test('nao cria item inexistente (404, e nao criacao implicita)', async () => {
    await request(app)
      .patch(`${ROTA}/itens/${idProduto}`)
      .set(auth(tokenCliente))
      .send({ quantidade: 2 })
      .expect(404);
  });

  test('recusa quantidade zero (use DELETE para remover)', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 2 })
      .expect(201);

    await request(app)
      .patch(`${ROTA}/itens/${idProduto}`)
      .set(auth(tokenCliente))
      .send({ quantidade: 0 })
      .expect(400);
  });
});

/* ---------------------------------------------------------------- */
/* Remover                                                           */
/* ---------------------------------------------------------------- */

describe('DELETE - remover item e esvaziar', () => {
  test('remove um item e recalcula o total', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 2 })
      .expect(201);

    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProdutoCaro, quantidade: 1 })
      .expect(201);

    const resposta = await request(app)
      .delete(`${ROTA}/itens/${idProduto}`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(resposta.body.dados.itens).toHaveLength(1);
    expect(resposta.body.dados.valor_produtos).toBe(20);
  });

  test('remover item que nao esta no carrinho devolve 404', async () => {
    await request(app)
      .delete(`${ROTA}/itens/${idProduto}`)
      .set(auth(tokenCliente))
      .expect(404);
  });

  test('esvazia o carrinho', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(201);

    const resposta = await request(app).delete(ROTA).set(auth(tokenCliente)).expect(200);

    expect(resposta.body.dados.itens).toEqual([]);
    expect(resposta.body.dados.valor_produtos).toBe(0);
  });

  test('esvaziar carrinho vazio nao falha', async () => {
    const resposta = await request(app).delete(ROTA).set(auth(tokenCliente)).expect(200);
    expect(resposta.body.dados.itens).toEqual([]);
  });
});

/* ---------------------------------------------------------------- */
/* Isolamento entre consumidores                                     */
/* ---------------------------------------------------------------- */

describe('isolamento entre consumidores', () => {
  /*
   * Como nenhuma rota aceita `carrinho_id`, nao existe parametro para
   * forjar. Este teste confirma que a ausencia e real: o carrinho de um
   * cliente simplesmente nao aparece para o outro.
   */
  test('cada cliente ve apenas o proprio carrinho', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 2 })
      .expect(201);

    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenOutroCliente))
      .send({ produto_id: idProdutoCaro, quantidade: 1 })
      .expect(201);

    const doPrimeiro = await request(app).get(ROTA).set(auth(tokenCliente)).expect(200);
    const doSegundo = await request(app).get(ROTA).set(auth(tokenOutroCliente)).expect(200);

    expect(doPrimeiro.body.dados.itens).toHaveLength(1);
    expect(doPrimeiro.body.dados.itens[0].produto.nome).toBe('Tomate');

    expect(doSegundo.body.dados.itens).toHaveLength(1);
    expect(doSegundo.body.dados.itens[0].produto.nome).toBe('Morango');
  });

  test('um cliente nao remove o item do carrinho do outro', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 2 })
      .expect(201);

    // O outro cliente tenta remover o mesmo produto: para ele o item nao
    // existe no carrinho, entao recebe 404.
    await request(app)
      .delete(`${ROTA}/itens/${idProduto}`)
      .set(auth(tokenOutroCliente))
      .expect(404);

    // O carrinho do primeiro permanece intacto.
    const resposta = await request(app).get(ROTA).set(auth(tokenCliente)).expect(200);
    expect(resposta.body.dados.itens).toHaveLength(1);
  });

  test('esvaziar o proprio carrinho nao afeta o do outro', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(201);

    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenOutroCliente))
      .send({ produto_id: idProdutoCaro, quantidade: 1 })
      .expect(201);

    await request(app).delete(ROTA).set(auth(tokenCliente)).expect(200);

    const doSegundo = await request(app).get(ROTA).set(auth(tokenOutroCliente)).expect(200);
    expect(doSegundo.body.dados.itens).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------- */
/* Totais                                                            */
/* ---------------------------------------------------------------- */

describe('totais calculados pelo servidor', () => {
  test('soma os subtotais de itens diferentes', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 2 })
      .expect(201);

    const resposta = await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProdutoCaro, quantidade: 1 })
      .expect(201);

    // 8.50 x 2 = 17.00 ; 20.00 x 1 = 20.00 ; total 37.00
    expect(resposta.body.dados.valor_produtos).toBe(37);
    expect(resposta.body.dados.total_itens).toBe(2);
    expect(resposta.body.dados.total_unidades).toBe(3);
  });

  test('informa quantos agricultores o carrinho envolve', async () => {
    const { rows } = await pool.query(`
      INSERT INTO usuarios (nome, email, senha_hash, tipo)
      VALUES ('Produtor B', 'pb@teste.local', '$2b$12$hash', 'agricultor')
      RETURNING id
    `);
    const { rows: agri } = await pool.query(
      `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado)
       VALUES ($1, 'Fazenda B', 'Recife', 'PE') RETURNING id`,
      [rows[0].id],
    );
    const { rows: cat } = await pool.query(`SELECT id FROM categorias LIMIT 1`);

    const { rows: novo } = await pool.query(
      `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque)
       VALUES ($1, $2, 'Ovos', 12.00, 30) RETURNING id`,
      [agri[0].id, cat[0].id],
    );

    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(201);

    const resposta = await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: novo[0].id, quantidade: 1 })
      .expect(201);

    expect(resposta.body.dados.total_agricultores).toBe(2);
  });

  /*
   * Frete depende do endereco, escolhido so no checkout. Devolver um
   * numero no carrinho seria inventar um valor.
   */
  test('nao inventa frete no carrinho', async () => {
    const resposta = await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(201);

    expect(resposta.body.dados.frete_calculado).toBe(false);
    expect(resposta.body.dados.valor_frete).toBeUndefined();
    expect(resposta.body.dados.valor_total).toBeUndefined();
  });

  test('valor com centavos nao acumula erro de ponto flutuante', async () => {
    await pool.query('UPDATE produtos SET preco = 0.10 WHERE id = $1', [idProduto]);

    const resposta = await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 3 })
      .expect(201);

    // 0.10 x 3 = 0.30. Sem arredondar, 0.1*3 da 0.30000000000000004.
    expect(resposta.body.dados.valor_produtos).toBe(0.3);
    expect(resposta.body.dados.itens[0].subtotal).toBe(0.3);
  });
});

/* ---------------------------------------------------------------- */
/* Validacao para checkout                                           */
/* ---------------------------------------------------------------- */

describe('GET /carrinho/validacao', () => {
  test('carrinho valido pode avancar', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 2 })
      .expect(201);

    const resposta = await request(app)
      .get(`${ROTA}/validacao`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(resposta.body.dados.pode_avancar).toBe(true);
    expect(resposta.body.dados.problemas).toEqual([]);
  });

  test('carrinho vazio nao pode avancar', async () => {
    const resposta = await request(app)
      .get(`${ROTA}/validacao`)
      .set(auth(tokenCliente))
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('CARRINHO_VAZIO');
  });

  /*
   * Cenario real: o cliente monta o carrinho, outro compra o ultimo item
   * e o estoque cai. A validacao precisa apontar exatamente qual item
   * ficou indisponivel, em vez de so falhar.
   */
  test('aponta o item que ficou sem estoque', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 5 })
      .expect(201);

    await pool.query('UPDATE produtos SET estoque = 2 WHERE id = $1', [idProduto]);

    const resposta = await request(app)
      .get(`${ROTA}/validacao`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(resposta.body.dados.pode_avancar).toBe(false);
    expect(resposta.body.dados.problemas).toHaveLength(1);
    // BIGINT sai do pg como string; a API mantem isso em todo o projeto.
    expect(Number(resposta.body.dados.problemas[0].produto_id)).toBe(Number(idProduto));
    expect(resposta.body.dados.problemas[0].motivo).toMatch(/estoque/i);
  });

  test('aponta o item que saiu do ar', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(201);

    await pool.query('UPDATE produtos SET ativo = FALSE WHERE id = $1', [idProduto]);

    const resposta = await request(app)
      .get(`${ROTA}/validacao`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(resposta.body.dados.pode_avancar).toBe(false);
    expect(resposta.body.dados.problemas[0].motivo).toMatch(/dispon/i);
  });

  test('marca o item indisponivel na propria listagem', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 5 })
      .expect(201);

    await pool.query('UPDATE produtos SET estoque = 1 WHERE id = $1', [idProduto]);

    const resposta = await request(app).get(ROTA).set(auth(tokenCliente)).expect(200);

    expect(resposta.body.dados.itens[0].disponivel).toBe(false);
    expect(resposta.body.dados.itens[0].estoque_disponivel).toBe(1);
  });
});

/* ---------------------------------------------------------------- */
/* Persistencia                                                      */
/* ---------------------------------------------------------------- */

describe('persistencia do carrinho', () => {
  test('o carrinho sobrevive entre requisicoes (esta no banco)', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 4 })
      .expect(201);

    const { rows } = await pool.query(
      `SELECT ci.quantidade FROM carrinho_itens ci
         JOIN carrinhos c ON c.id = ci.carrinho_id
        WHERE c.consumidor_id = (
          SELECT id FROM usuarios WHERE email = 'cliente@teste.local'
        )`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].quantidade).toBe(4);
  });

  test('o mesmo produto nao aparece duas vezes no carrinho', async () => {
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(201);
    await request(app)
      .post(`${ROTA}/itens`)
      .set(auth(tokenCliente))
      .send({ produto_id: idProduto, quantidade: 1 })
      .expect(201);

    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM carrinho_itens WHERE produto_id = $1',
      [idProduto],
    );

    expect(rows[0].n).toBe(1);
  });
});
