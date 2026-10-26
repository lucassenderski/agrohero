import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { prepararSchema, limparDados } from '../helpers/banco.js';
import { gerarToken } from '../../src/utils/token.js';

/*
 * Aviso de pedidos novos do produtor (contador + popup).
 *
 * O que esta em jogo: o produtor precisa saber que entrou pedido sem
 * atualizar a pagina. O aviso e o numero de itens ainda PENDENTE - o
 * status com que o item nasce no checkout. Assim que o produtor marca
 * PROCESSANDO, o item deixa de ser novidade e o numero cai.
 *
 * Os testes cobrem as duas armadilhas do recurso:
 *
 *   1) PROPRIEDADE. O produtor A nao conta nem ve item do produtor B,
 *      mesmo dentro do mesmo pedido. E a mesma regra do painel.
 *   2) JANELA DE STATUS. Item cancelado, processando, enviado ou
 *      entregue nao conta como novo. Se contasse, o aviso nunca apagaria.
 */

const PEDIDOS = '/api/v1/pedidos';
const CHECKOUT = '/api/v1/checkout';
const CARRINHO = '/api/v1/carrinho';
const ENDERECOS = '/api/v1/enderecos';

let tokenCliente;
let tokenAgricultorA;
let tokenAgricultorB;
let tokenAdmin;
let idProdutoA;
let idProdutoB;
let idEnderecoCliente;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const ENDERECO = {
  nome_destinatario: 'Maria Souza',
  cep: '13010100',
  rua: 'Rua das Flores',
  numero: '123',
  bairro: 'Centro',
  cidade: 'Campinas',
  estado: 'SP',
};

beforeAll(async () => {
  await prepararSchema();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparDados();

  const { rows: usuarios } = await pool.query(`
    INSERT INTO usuarios (nome, email, senha_hash, tipo, telefone) VALUES
      ('Cliente',   'cli@teste.local',  '$2b$12$hash', 'cliente',       '19999998888'),
      ('Produtor A','pa@teste.local',   '$2b$12$hash', 'agricultor',    NULL),
      ('Produtor B','pb@teste.local',   '$2b$12$hash', 'agricultor',    NULL),
      ('Admin',     'adm@teste.local',  '$2b$12$hash', 'administrador', NULL)
    RETURNING id, email
  `);

  const porEmail = (email) => usuarios.find((u) => u.email === email);
  tokenCliente = gerarToken(porEmail('cli@teste.local'));
  tokenAgricultorA = gerarToken(porEmail('pa@teste.local'));
  tokenAgricultorB = gerarToken(porEmail('pb@teste.local'));
  tokenAdmin = gerarToken(porEmail('adm@teste.local'));

  const { rows: agri } = await pool.query(
    `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado) VALUES
       ($1, 'Fazenda A', 'Campinas', 'SP'),
       ($2, 'Fazenda B', 'Recife', 'PE')
     RETURNING id, nome_fazenda`,
    [porEmail('pa@teste.local').id, porEmail('pb@teste.local').id],
  );

  const idAgricultorA = agri.find((a) => a.nome_fazenda === 'Fazenda A').id;
  const idAgricultorB = agri.find((a) => a.nome_fazenda === 'Fazenda B').id;

  const { rows: cat } = await pool.query(
    `INSERT INTO categorias (nome, slug) VALUES ('Legumes', 'legumes') RETURNING id`,
  );

  const { rows: produtos } = await pool.query(
    `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque) VALUES
       ($1, $3, 'Tomate',  8.50, 100),
       ($2, $3, 'Morango', 20.00, 50)
     RETURNING id, nome`,
    [idAgricultorA, idAgricultorB, cat[0].id],
  );

  idProdutoA = produtos.find((p) => p.nome === 'Tomate').id;
  idProdutoB = produtos.find((p) => p.nome === 'Morango').id;

  const endereco = await request(app)
    .post(ENDERECOS)
    .set(auth(tokenCliente))
    .send(ENDERECO)
    .expect(201);

  idEnderecoCliente = endereco.body.dados.id;
});

/* Cria um pedido de verdade pelo fluxo carrinho -> checkout. */
async function criarPedido(itens, token = tokenCliente) {
  for (const item of itens) {
    await request(app)
      .post(`${CARRINHO}/itens`)
      .set(auth(token))
      .send(item)
      .expect(201);
  }

  const resposta = await request(app)
    .post(CHECKOUT)
    .set(auth(token))
    .send({ endereco_id: idEnderecoCliente, metodo_pagamento: 'PIX' })
    .expect(201);

  return resposta.body.dados;
}

async function buscarNovos(token) {
  return request(app).get(`${PEDIDOS}/agricultor/novos`).set(auth(token));
}

/*
 * Id do item do produtor A num pedido.
 *
 * O checkout devolve o pedido, mas nao os itens com o status por ITEM -
 * por isso lemos do banco, como o resto da suite faz.
 */
async function itemDoA(pedidoId) {
  const { rows } = await pool.query(
    `SELECT pi.id FROM pedido_itens pi
      JOIN agricultores a ON a.id = pi.agricultor_id
      JOIN usuarios u ON u.id = a.usuario_id
     WHERE pi.pedido_id = $1 AND u.email = 'pa@teste.local'`,
    [pedidoId],
  );
  return rows[0].id;
}

/* Muda o status de um item do produtor A pelo fluxo da API. */
async function avancarItemDoA(pedidoId, itemId, status) {
  await request(app)
    .patch(`${PEDIDOS}/${pedidoId}/itens/${itemId}/status`)
    .set(auth(tokenAgricultorA))
    .send({ status })
    .expect(200);
}

/* ---------------------------------------------------------------- */
/* Autorizacao                                                       */
/* ---------------------------------------------------------------- */

describe('GET /pedidos/agricultor/novos - autorizacao', () => {
  it('exige autenticacao', async () => {
    await request(app).get(`${PEDIDOS}/agricultor/novos`).expect(401);
  });

  it('recusa consumidor com 403', async () => {
    const resposta = await buscarNovos(tokenCliente);
    expect(resposta.status).toBe(403);
  });

  it('recusa administrador com 403', async () => {
    /*
     * O aviso e do produtor: o admin nao tem "pedidos recebidos" para
     * acompanhar. A barreira e o requireRole('agricultor') da rota.
     */
    const resposta = await buscarNovos(tokenAdmin);
    expect(resposta.status).toBe(403);
  });

  it('sem pedido nenhum devolve total zero e lista vazia', async () => {
    const resposta = await buscarNovos(tokenAgricultorA);

    expect(resposta.status).toBe(200);
    expect(resposta.body.sucesso).toBe(true);
    expect(resposta.body.dados.total).toBe(0);
    expect(resposta.body.dados.itens).toEqual([]);
  });
});

/* ---------------------------------------------------------------- */
/* Contagem                                                          */
/* ---------------------------------------------------------------- */

describe('GET /pedidos/agricultor/novos - contagem', () => {
  it('conta apenas os itens PENDENTE do proprio produtor', async () => {
    /*
     * Um pedido com um item de cada produtor. Cada um so enxerga o seu -
     * o mesmo `WHERE agricultor_id` que protege o painel.
     */
    await criarPedido([
      { produto_id: idProdutoA, quantidade: 2 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const respostaA = await buscarNovos(tokenAgricultorA);
    const respostaB = await buscarNovos(tokenAgricultorB);

    expect(respostaA.body.dados.total).toBe(1);
    expect(respostaB.body.dados.total).toBe(1);
  });

  it('soma itens de pedidos diferentes', async () => {
    await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    await criarPedido([{ produto_id: idProdutoA, quantidade: 3 }]);

    const resposta = await buscarNovos(tokenAgricultorA);
    expect(resposta.body.dados.total).toBe(2);
  });

  it('item que sai de PENDENTE deixa de contar', async () => {
    /*
     * O teste central do recurso: o numero cai conforme o produtor
     * trabalha, sem precisar de um campo "lido" que ficaria errado se
     * ele abrisse o painel em outro aparelho.
     */
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const itemId = await itemDoA(pedido.pedido.id);

    expect((await buscarNovos(tokenAgricultorA)).body.dados.total).toBe(1);

    await avancarItemDoA(pedido.pedido.id, itemId, 'PROCESSANDO');

    expect((await buscarNovos(tokenAgricultorA)).body.dados.total).toBe(0);
  });

  it('item cancelado nao conta como novo', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const itemId = await itemDoA(pedido.pedido.id);

    await request(app)
      .delete(`${PEDIDOS}/${pedido.pedido.id}/itens/${itemId}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    expect((await buscarNovos(tokenAgricultorA)).body.dados.total).toBe(0);
  });
});

/* ---------------------------------------------------------------- */
/* Conteudo da lista                                                 */
/* ---------------------------------------------------------------- */

describe('GET /pedidos/agricultor/novos - conteudo', () => {
  it('traz o produto, a quantidade, o valor e a cidade do comprador', async () => {
    await criarPedido([{ produto_id: idProdutoA, quantidade: 2 }]);

    const resposta = await buscarNovos(tokenAgricultorA);
    const [item] = resposta.body.dados.itens;

    expect(item.produto_nome).toBe('Tomate');
    expect(item.quantidade).toBe(2);
    /*
     * NUMERIC chega como Number por causa do parser em pool.js (o mesmo
     * motivo pelo qual `preco` nao e string nos outros testes). 2 x 8,50.
     */
    expect(item.subtotal).toBe(17);
    expect(item.comprador_cidade).toBe('Campinas');
    expect(item.comprador_estado).toBe('SP');
  });

  it('nao devolve item do outro produtor', async () => {
    await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const { body } = await buscarNovos(tokenAgricultorA);

    expect(body.dados.itens).toHaveLength(1);
    expect(body.dados.itens[0].produto_nome).toBe('Tomate');
  });
});
