import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { prepararSchema, limparDados } from '../helpers/banco.js';
import { gerarToken } from '../../src/utils/token.js';

/*
 * Testes de pedidos e transicao de status (FASE 12).
 *
 * O QUE ESTA EM JOGO AQUI
 *
 * Um pedido no marketplace tem UM consumidor e N produtores. O status e
 * controlado por ITEM, e `pedidos.status` e derivado por trigger. Isso
 * cria duas classes de erro que estes testes precisam pegar:
 *
 * 1) PROPRIEDADE. O produtor A nao pode ver nem alterar o item do
 *    produtor B, mesmo no mesmo pedido. E o requisito 18, a regra
 *    multi-agricultor. Testes com dois produtores no mesmo pedido.
 *
 * 2) MAQUINA DE ESTADOS. Nao se pula etapa, nao se volta atras, nao se
 *    sai de ENTREGUE ou CANCELADO. Testes por par (de, para).
 *
 * Alem disso, cancelamento precisa DEVOLVER ESTOQUE. Sem isso, um
 * produto cancelado sumiria da vitrine para sempre - o estoque foi
 * baixado no checkout e ninguem devolve.
 */

const PEDIDOS = '/api/v1/pedidos';
const ADMIN_PEDIDOS = '/api/v1/admin/pedidos';
const CHECKOUT = '/api/v1/checkout';
const CARRINHO = '/api/v1/carrinho';
const ENDERECOS = '/api/v1/enderecos';

let tokenCliente;
let tokenOutroCliente;
let tokenAgricultorA;
let tokenAgricultorB;
let tokenAdmin;
let idAgricultorA;
let idAgricultorB;
let idProdutoA;
let idProdutoB;
let idEnderecoCliente;
let idConsumidorCliente;

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
    INSERT INTO usuarios (nome, email, senha_hash, tipo) VALUES
      ('Cliente',   'cli@teste.local',  '$2b$12$hash', 'cliente'),
      ('Outro',     'out@teste.local',  '$2b$12$hash', 'cliente'),
      ('Produtor A','pa@teste.local',   '$2b$12$hash', 'agricultor'),
      ('Produtor B','pb@teste.local',   '$2b$12$hash', 'agricultor'),
      ('Admin',     'adm@teste.local',  '$2b$12$hash', 'administrador')
    RETURNING id, email, tipo
  `);

  const porEmail = (email) => usuarios.find((u) => u.email === email);
  idConsumidorCliente = porEmail('cli@teste.local').id;
  tokenCliente = gerarToken(porEmail('cli@teste.local'));
  tokenOutroCliente = gerarToken(porEmail('out@teste.local'));
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

  idAgricultorA = agri.find((a) => a.nome_fazenda === 'Fazenda A').id;
  idAgricultorB = agri.find((a) => a.nome_fazenda === 'Fazenda B').id;

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

/* Poe itens no carrinho do cliente. */
async function encherCarrinho(itens, token = tokenCliente) {
  for (const item of itens) {
    await request(app)
      .post(`${CARRINHO}/itens`)
      .set(auth(token))
      .send(item)
      .expect(201);
  }
}

/*
 * Cria um pedido de verdade pelo checkout e devolve o corpo `dados`.
 *
 * Passar pelo fluxo real (carrinho -> checkout) garante que os pedidos
 * dos testes tenham a mesma forma dos de producao, incluindo os
 * pedido_itens com agricultor_id. Montar pedido com INSERT direto
 * criaria uma estrutura que pode nao corresponder a realidade.
 */
async function criarPedido(itens, token = tokenCliente) {
  await encherCarrinho(itens, token);

  const resposta = await request(app)
    .post(CHECKOUT)
    .set(auth(token))
    .send({ endereco_id: idEnderecoCliente, metodo_pagamento: 'PIX' })
    .expect(201);

  return resposta.body.dados;
}

/* Itens de um pedido, direto do banco (para conferir status e dono). */
async function itensDoPedido(pedidoId) {
  const { rows } = await pool.query(
    `SELECT id, produto_id, agricultor_id, quantidade, status
       FROM pedido_itens WHERE pedido_id = $1 ORDER BY id`,
    [pedidoId],
  );
  return rows;
}

async function statusDoPedido(pedidoId) {
  const { rows } = await pool.query('SELECT status FROM pedidos WHERE id = $1', [pedidoId]);
  return rows[0]?.status;
}

async function estoqueDe(produtoId) {
  const { rows } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [produtoId]);
  return rows[0].estoque;
}

/* ---------------------------------------------------------------- */
/* Acesso                                                            */
/* ---------------------------------------------------------------- */

describe('acesso as rotas de pedidos', () => {
  test('sem token devolve 401', async () => {
    await request(app).get(PEDIDOS).expect(401);
    await request(app).get(`${PEDIDOS}/1`).expect(401);
  });

  test('cliente nao acessa a listagem do agricultor', async () => {
    await request(app)
      .get(`${PEDIDOS}/agricultor`)
      .set(auth(tokenCliente))
      .expect(403);
  });

  test('agricultor nao acessa a listagem do consumidor', async () => {
    await request(app)
      .get(PEDIDOS)
      .set(auth(tokenAgricultorA))
      .expect(403);
  });

  test('cliente nao acessa rotas administrativas', async () => {
    await request(app).get(ADMIN_PEDIDOS).set(auth(tokenCliente)).expect(403);
  });

  test('agricultor nao acessa rotas administrativas', async () => {
    await request(app).get(ADMIN_PEDIDOS).set(auth(tokenAgricultorA)).expect(403);
  });

  test('a rota literal /agricultor nao e capturada por /:id', async () => {
    /*
     * Regressao de ordem de declaracao: se `/:id` viesse primeiro,
     * GET /pedidos/agricultor seria interpretado como id="agricultor" e
     * devolveria 400 em vez de funcionar. Como o agricultor nao tem
     * pedidos ainda, a resposta correta e a lista vazia (200).
     */
    const resposta = await request(app)
      .get(`${PEDIDOS}/agricultor`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    expect(resposta.body.dados).toEqual([]);
  });
});

/* ---------------------------------------------------------------- */
/* Visao do consumidor                                               */
/* ---------------------------------------------------------------- */

describe('visao do consumidor', () => {
  test('lista os proprios pedidos', async () => {
    await criarPedido([{ produto_id: idProdutoA, quantidade: 2 }]);

    const resposta = await request(app).get(PEDIDOS).set(auth(tokenCliente)).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].itens).toHaveLength(1);
    expect(resposta.body.dados[0].status).toBe('PENDENTE');
  });

  test('nao lista o pedido de outro consumidor', async () => {
    await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    const resposta = await request(app)
      .get(PEDIDOS)
      .set(auth(tokenOutroCliente))
      .expect(200);

    expect(resposta.body.dados).toEqual([]);
  });

  test('ve um pedido multi-produtor inteiro', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const resposta = await request(app)
      .get(`${PEDIDOS}/${pedido.pedido.id}`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(resposta.body.dados.itens).toHaveLength(2);
    expect(resposta.body.dados.visao).toBe('consumidor');
  });

  test('nao pode ver o pedido de outro consumidor', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    /* 404, e nao 403: nao confirmar que aquele id existe. */
    await request(app)
      .get(`${PEDIDOS}/${pedido.pedido.id}`)
      .set(auth(tokenOutroCliente))
      .expect(404);
  });

  test('pedido inexistente devolve 404', async () => {
    await request(app).get(`${PEDIDOS}/999999`).set(auth(tokenCliente)).expect(404);
  });

  test('id invalido devolve 400', async () => {
    await request(app).get(`${PEDIDOS}/abc`).set(auth(tokenCliente)).expect(400);
  });

  test('filtra por status', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    const itens = await itensDoPedido(pedido.pedido.id);
    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${itens[0].id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'PROCESSANDO' })
      .expect(200);

    const processando = await request(app)
      .get(`${PEDIDOS}?status=PROCESSANDO`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(processando.body.dados).toHaveLength(1);

    const entregue = await request(app)
      .get(`${PEDIDOS}?status=ENTREGUE`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(entregue.body.dados).toEqual([]);
  });

  test('status invalido no filtro devolve 400', async () => {
    await request(app).get(`${PEDIDOS}?status=INVENTADO`).set(auth(tokenCliente)).expect(400);
  });
});

/* ---------------------------------------------------------------- */
/* Visao do agricultor - o nucleo da regra multi-agricultor          */
/* ---------------------------------------------------------------- */

describe('visao do agricultor', () => {
  test('lista apenas os proprios itens de pedido', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 2 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const doA = await request(app)
      .get(`${PEDIDOS}/agricultor`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    expect(doA.body.dados).toHaveLength(1);
    expect(String(doA.body.dados[0].agricultor_id)).toBe(String(idAgricultorA));
    expect(String(doA.body.dados[0].produto_id)).toBe(String(idProdutoA));

    const doB = await request(app)
      .get(`${PEDIDOS}/agricultor`)
      .set(auth(tokenAgricultorB))
      .expect(200);

    expect(doB.body.dados).toHaveLength(1);
    expect(String(doB.body.dados[0].produto_id)).toBe(String(idProdutoB));
    expect(pedido.pedido.id).toBeDefined();
  });

  /*
   * O TESTE CENTRAL DO REQUISITO 18.
   *
   * Pedido com tomate (produtor A) e morango (produtor B). O produtor A
   * abre o detalhe e ve UM item, nao dois. O item do B nao aparece.
   */
  test('no detalhe, ve somente os proprios itens', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const resposta = await request(app)
      .get(`${PEDIDOS}/${pedido.pedido.id}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    expect(resposta.body.dados.itens).toHaveLength(1);
    expect(String(resposta.body.dados.itens[0].produto_id)).toBe(String(idProdutoA));
    expect(resposta.body.dados.visao).toBe('agricultor');

    /* O nome do produto do outro produtor nao aparece em lugar nenhum. */
    expect(JSON.stringify(resposta.body.dados)).not.toMatch(/Morango/i);
  });

  /*
   * O produtor A nao deve ver o total do pedido: esse numero inclui as
   * vendas do produtor B. Ele recebe apenas o valor dos itens DELE.
   */
  test('nao enxerga o valor total do pedido, apenas o dos seus itens', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 2 },
      { produto_id: idProdutoB, quantidade: 3 },
    ]);

    const resposta = await request(app)
      .get(`${PEDIDOS}/${pedido.pedido.id}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    /* 2 x 8.50 = 17.00, e nao o total de 77.00 + frete. */
    expect(resposta.body.dados.valor_dos_meus_itens).toBe(17);
    expect(resposta.body.dados.valor_total).toBeUndefined();
  });

  test('agricultor sem item no pedido recebe 404', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    await request(app)
      .get(`${PEDIDOS}/${pedido.pedido.id}`)
      .set(auth(tokenAgricultorB))
      .expect(404);
  });
});

/* ---------------------------------------------------------------- */
/* Transicao de status pelo agricultor                               */
/* ---------------------------------------------------------------- */

describe('transicao de status pelo agricultor', () => {
  test('avanca o proprio item: PENDENTE -> PROCESSANDO -> ENVIADO -> ENTREGUE', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    for (const status of ['PROCESSANDO', 'ENVIADO', 'ENTREGUE']) {
      const resposta = await request(app)
        .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
        .set(auth(tokenAgricultorA))
        .send({ status })
        .expect(200);

      expect(resposta.body.dados.item.status).toBe(status);
    }

    expect(await statusDoPedido(pedido.pedido.id)).toBe('ENTREGUE');
  });

  /*
   * O produtor A nao altera o item do produtor B. O repositorio filtra
   * por (itemId, agricultorId), entao nenhuma linha muda - e a resposta
   * e 404, nao 403, para nao confirmar que o item existe.
   */
  test('nao altera o item de outro agricultor', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const itens = await itensDoPedido(pedido.pedido.id);
    const itemDoB = itens.find((i) => String(i.agricultor_id) === String(idAgricultorB));

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${itemDoB.id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'PROCESSANDO' })
      .expect(404);

    /* O item do B continua PENDENTE, intocado. */
    const [{ status }] = (
      await pool.query('SELECT status FROM pedido_itens WHERE id = $1', [itemDoB.id])
    ).rows;
    expect(status).toBe('PENDENTE');
  });

  test('nao pode cancelar item pelo endpoint de status', async () => {
    /*
     * CANCELADO tem rota propria porque devolve estoque. Se passasse por
     * aqui, o estoque nunca voltaria.
     */
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'CANCELADO' })
      .expect(400);
  });

  test('status fora do fluxo do agricultor devolve 400', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    for (const status of ['PENDENTE', 'INVENTADO']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
        .set(auth(tokenAgricultorA))
        .send({ status })
        .expect(400);
    }
  });

  test('cliente nao altera status de item', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
      .set(auth(tokenCliente))
      .send({ status: 'ENVIADO' })
      .expect(403);
  });
});

/* ---------------------------------------------------------------- */
/* Maquina de estados - transicoes proibidas                         */
/* ---------------------------------------------------------------- */

describe('transicoes proibidas', () => {
  test('nao pula etapa: PENDENTE -> ENVIADO', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'ENVIADO' })
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('TRANSICAO_INVALIDA');
    expect(resposta.body.erro.mensagem).toMatch(/PROCESSANDO/);
  });

  test('nao pula etapa: PENDENTE -> ENTREGUE', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'ENTREGUE' })
      .expect(422);
  });

  test('nao volta atras: ENVIADO -> PROCESSANDO', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    for (const status of ['PROCESSANDO', 'ENVIADO']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
        .set(auth(tokenAgricultorA))
        .send({ status })
        .expect(200);
    }

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'PROCESSANDO' })
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('TRANSICAO_INVALIDA');
  });

  test('ENTREGUE e estado final', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    for (const status of ['PROCESSANDO', 'ENVIADO', 'ENTREGUE']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
        .set(auth(tokenAgricultorA))
        .send({ status })
        .expect(200);
    }

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'ENVIADO' })
      .expect(422);

    expect(resposta.body.erro.mensagem).toMatch(/nao pode mais mudar/i);
  });

  test('CANCELADO e estado final', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    await request(app)
      .delete(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'PROCESSANDO' })
      .expect(422);
  });
});

/* ---------------------------------------------------------------- */
/* Derivacao do status do pedido                                     */
/* ---------------------------------------------------------------- */

describe('status do pedido derivado dos itens', () => {
  test('um item processando deixa o pedido PROCESSANDO', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const itens = await itensDoPedido(pedido.pedido.id);
    const itemDoA = itens.find((i) => String(i.agricultor_id) === String(idAgricultorA));

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${itemDoA.id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'PROCESSANDO' })
      .expect(200);

    /*
     * Um item andando e outro pendente: o pedido esta em andamento, e
     * nao PENDENTE. E o trigger que decide isso, e nao a aplicacao.
     */
    expect(await statusDoPedido(pedido.pedido.id)).toBe('PROCESSANDO');
  });

  test('so vira ENVIADO quando todos os itens sairam', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const itens = await itensDoPedido(pedido.pedido.id);
    const itemDoA = itens.find((i) => String(i.agricultor_id) === String(idAgricultorA));
    const itemDoB = itens.find((i) => String(i.agricultor_id) === String(idAgricultorB));

    /* O produtor A avanca o item dele ate ENVIADO. */
    for (const status of ['PROCESSANDO', 'ENVIADO']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${itemDoA.id}/status`)
        .set(auth(tokenAgricultorA))
        .send({ status })
        .expect(200);
    }

    /* O item do B ainda esta PENDENTE, entao o pedido nao esta ENVIADO. */
    expect(await statusDoPedido(pedido.pedido.id)).toBe('PROCESSANDO');

    /* Agora o B avanca o dele. Com os dois enviados, o pedido vai junto. */
    for (const status of ['PROCESSANDO', 'ENVIADO']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${itemDoB.id}/status`)
        .set(auth(tokenAgricultorB))
        .send({ status })
        .expect(200);
    }

    expect(await statusDoPedido(pedido.pedido.id)).toBe('ENVIADO');
  });

  test('so vira ENTREGUE quando todos os itens foram entregues', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const itens = await itensDoPedido(pedido.pedido.id);

    for (const item of itens) {
      const token =
        String(item.agricultor_id) === String(idAgricultorA) ? tokenAgricultorA : tokenAgricultorB;

      for (const status of ['PROCESSANDO', 'ENVIADO', 'ENTREGUE']) {
        await request(app)
          .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
          .set(auth(token))
          .send({ status })
          .expect(200);
      }
    }

    expect(await statusDoPedido(pedido.pedido.id)).toBe('ENTREGUE');
  });
});

/* ---------------------------------------------------------------- */
/* Cancelamento pelo consumidor                                      */
/* ---------------------------------------------------------------- */

describe('cancelamento pelo consumidor', () => {
  /*
   * O TESTE MAIS IMPORTANTE DO CANCELAMENTO.
   *
   * O estoque foi baixado no checkout. Se o cancelamento nao devolver,
   * o produto desaparece da vitrine para sempre - ninguem compra, e o
   * cadastro fica mentindo sobre a disponibilidade.
   */
  test('devolve o estoque dos itens cancelados', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 7 }]);

    expect(await estoqueDe(idProdutoA)).toBe(93);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(await estoqueDe(idProdutoA)).toBe(100);
  });

  test('devolve o estoque de todos os produtores do pedido', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 5 },
      { produto_id: idProdutoB, quantidade: 3 },
    ]);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(await estoqueDe(idProdutoA)).toBe(100);
    expect(await estoqueDe(idProdutoB)).toBe(50);
  });

  test('marca o pedido como CANCELADO', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(resposta.body.dados.pedido.status).toBe('CANCELADO');
    expect(resposta.body.dados.itens_cancelados).toBe(1);
    expect(await statusDoPedido(pedido.pedido.id)).toBe('CANCELADO');
  });

  test('nao pode cancelar pedido de outro consumidor', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenOutroCliente))
      .expect(404);

    expect(await statusDoPedido(pedido.pedido.id)).toBe('PENDENTE');
  });

  test('nao pode cancelar duas vezes', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('PEDIDO_JA_CANCELADO');

    /* E o estoque nao foi devolvido duas vezes. */
    expect(await estoqueDe(idProdutoA)).toBe(100);
  });

  test('nao devolve estoque duas vezes no cancelamento repetido', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 4 }]);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(422);

    /* 100 e nao 104: o estoque volta uma vez so. */
    expect(await estoqueDe(idProdutoA)).toBe(100);
  });

  test('pode cancelar pedido em PROCESSANDO', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'PROCESSANDO' })
      .expect(200);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(await estoqueDe(idProdutoA)).toBe(100);
  });

  /*
   * Pedido ja enviado nao pode ser cancelado: o produto esta a caminho.
   * Cancelar aqui deixaria o produtor sem o produto e sem o pagamento.
   */
  test('nao pode cancelar pedido ENVIADO', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    for (const status of ['PROCESSANDO', 'ENVIADO']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
        .set(auth(tokenAgricultorA))
        .send({ status })
        .expect(200);
    }

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('PEDIDO_NAO_CANCELAVEL');

    /* Estoque NAO volta, porque o produto saiu. */
    expect(await estoqueDe(idProdutoA)).toBe(99);
  });

  test('nao pode cancelar pedido ENTREGUE', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    for (const status of ['PROCESSANDO', 'ENVIADO', 'ENTREGUE']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
        .set(auth(tokenAgricultorA))
        .send({ status })
        .expect(200);
    }

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('PEDIDO_ENTREGUE');
  });

  /*
   * Pedido multi-produtor com um item ja enviado: cancelar o resto
   * deixaria o cliente com um pedido pela metade. Recusamos por inteiro.
   */
  test('nao cancela parcialmente quando parte ja saiu', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const itens = await itensDoPedido(pedido.pedido.id);
    const itemDoA = itens.find((i) => String(i.agricultor_id) === String(idAgricultorA));

    for (const status of ['PROCESSANDO', 'ENVIADO']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${itemDoA.id}/status`)
        .set(auth(tokenAgricultorA))
        .send({ status })
        .expect(200);
    }

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('CANCELAMENTO_PARCIAL_NAO_SUPORTADO');

    /* Nada foi cancelado e nenhum estoque voltou. */
    const statuses = (await itensDoPedido(pedido.pedido.id)).map((i) => i.status);
    expect(statuses).not.toContain('CANCELADO');
    expect(await estoqueDe(idProdutoB)).toBe(49);
  });
});

/* ---------------------------------------------------------------- */
/* Cancelamento de item pelo agricultor                              */
/* ---------------------------------------------------------------- */

describe('cancelamento de item pelo agricultor', () => {
  test('cancela o proprio item e devolve o estoque', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 3 },
      { produto_id: idProdutoB, quantidade: 2 },
    ]);

    const itens = await itensDoPedido(pedido.pedido.id);
    const itemDoA = itens.find((i) => String(i.agricultor_id) === String(idAgricultorA));

    await request(app)
      .delete(`${PEDIDOS}/${pedido.pedido.id}/itens/${itemDoA.id}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    /* O estoque do produto do A volta; o do B nao e tocado. */
    expect(await estoqueDe(idProdutoA)).toBe(100);
    expect(await estoqueDe(idProdutoB)).toBe(48);
  });

  test('nao cancela o item de outro agricultor', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const itens = await itensDoPedido(pedido.pedido.id);
    const itemDoB = itens.find((i) => String(i.agricultor_id) === String(idAgricultorB));

    await request(app)
      .delete(`${PEDIDOS}/${pedido.pedido.id}/itens/${itemDoB.id}`)
      .set(auth(tokenAgricultorA))
      .expect(404);

    /* Estoque do B intacto. */
    expect(await estoqueDe(idProdutoB)).toBe(49);
  });

  test('nao cancela item ja enviado', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    for (const status of ['PROCESSANDO', 'ENVIADO']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}/status`)
        .set(auth(tokenAgricultorA))
        .send({ status })
        .expect(200);
    }

    await request(app)
      .delete(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}`)
      .set(auth(tokenAgricultorA))
      .expect(422);

    expect(await estoqueDe(idProdutoA)).toBe(99);
  });

  test('um item cancelado pelo agricultor deixa o pedido CANCELADO se for o unico', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);
    const [item] = await itensDoPedido(pedido.pedido.id);

    await request(app)
      .delete(`${PEDIDOS}/${pedido.pedido.id}/itens/${item.id}`)
      .set(auth(tokenAgricultorA))
      .expect(200);

    expect(await statusDoPedido(pedido.pedido.id)).toBe('CANCELADO');
  });
});

/* ---------------------------------------------------------------- */
/* Administrador                                                     */
/* ---------------------------------------------------------------- */

describe('visao administrativa', () => {
  test('lista todos os pedidos', async () => {
    await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    const resposta = await request(app)
      .get(ADMIN_PEDIDOS)
      .set(auth(tokenAdmin))
      .expect(200);

    expect(resposta.body.dados).toHaveLength(1);
  });

  test('ve o pedido completo, de todos os produtores', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const resposta = await request(app)
      .get(`${PEDIDOS}/${pedido.pedido.id}`)
      .set(auth(tokenAdmin))
      .expect(200);

    expect(resposta.body.dados.itens).toHaveLength(2);
    expect(resposta.body.dados.visao).toBe('administrador');
    expect(resposta.body.dados.pagamentos).toBeDefined();
  });

  test('filtra por consumidor', async () => {
    await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    const doCliente = await request(app)
      .get(`${ADMIN_PEDIDOS}?consumidorId=${idConsumidorCliente}`)
      .set(auth(tokenAdmin))
      .expect(200);

    expect(doCliente.body.dados).toHaveLength(1);
  });

  test('avanca o pedido inteiro', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    const resposta = await request(app)
      .patch(`${ADMIN_PEDIDOS}/${pedido.pedido.id}/status`)
      .set(auth(tokenAdmin))
      .send({ status: 'PROCESSANDO' })
      .expect(200);

    expect(resposta.body.dados.itens_afetados).toBe(2);
    expect(await statusDoPedido(pedido.pedido.id)).toBe('PROCESSANDO');
  });

  test('nao aceita transicao invalida no avanco administrativo', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    const resposta = await request(app)
      .patch(`${ADMIN_PEDIDOS}/${pedido.pedido.id}/status`)
      .set(auth(tokenAdmin))
      .send({ status: 'ENTREGUE' })
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('TRANSICAO_INVALIDA');
  });

  test('cancelamento administrativo devolve o estoque', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 3 }]);

    await request(app)
      .patch(`${ADMIN_PEDIDOS}/${pedido.pedido.id}/status`)
      .set(auth(tokenAdmin))
      .send({ status: 'CANCELADO' })
      .expect(200);

    expect(await estoqueDe(idProdutoA)).toBe(100);
    expect(await statusDoPedido(pedido.pedido.id)).toBe('CANCELADO');
  });

  test('status invalido devolve 400', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA, quantidade: 1 }]);

    await request(app)
      .patch(`${ADMIN_PEDIDOS}/${pedido.pedido.id}/status`)
      .set(auth(tokenAdmin))
      .send({ status: 'INVENTADO' })
      .expect(400);
  });

  test('pedido inexistente devolve 404', async () => {
    await request(app)
      .patch(`${ADMIN_PEDIDOS}/999999/status`)
      .set(auth(tokenAdmin))
      .send({ status: 'PROCESSANDO' })
      .expect(404);
  });
});

