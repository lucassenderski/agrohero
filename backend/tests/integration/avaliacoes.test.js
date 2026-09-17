import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { prepararSchema, limparDados } from '../helpers/banco.js';
import { gerarToken } from '../../src/utils/token.js';

/*
 * Avaliacoes (FASE 14).
 *
 * A PERGUNTA CENTRAL DESTA FASE
 *
 * Quem pode avaliar? A resposta tem tres condicoes simultaneas:
 *   1. o consumidor comprou o produto;
 *   2. o item foi ENTREGUE;
 *   3. ainda nao avaliou aquele item naquele pedido.
 *
 * Cada uma dessas condicoes e um teste negativo aqui. Se qualquer uma
 * cair, a reputacao do marketplace deixa de valer - qualquer conta
 * poderia dar nota a qualquer produto, repetidamente.
 *
 * Ha ainda uma quarta frente, especifica deste sistema: a regra
 * multi-agricultor. Um pedido com produtos de dois produtores precisa
 * gerar avaliacoes ligadas ao produtor CERTO de cada item. Testar isso
 * importa porque `agricultor_id` vem do item, e nao do corpo: se viesse
 * do corpo, daria para dar nota 1 a um concorrente.
 */

const AVALIACOES = '/api/v1/avaliacoes';
const PEDIDOS = '/api/v1/pedidos';
const CARRINHO = '/api/v1/carrinho';
const CHECKOUT = '/api/v1/checkout';
const ENDERECOS = '/api/v1/enderecos';
const PRODUTOS = '/api/v1/produtos';

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

let tokenCliente;
let tokenOutroCliente;
let tokenAgricultorA;
let tokenAgricultorB;
let idCliente;
let idOutroCliente;
let idAgricultorA;
let idAgricultorB;
let idProdutoA;
let idProdutoB;
let idEndereco;
let idEnderecoOutro;

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
      ('Maria Souza',   'cli@teste.local', '$2b$12$hash', 'cliente'),
      ('Joao Pereira',  'out@teste.local', '$2b$12$hash', 'cliente'),
      ('Ana Produtora', 'pa@teste.local',  '$2b$12$hash', 'agricultor'),
      ('Bruno Produtor','pb@teste.local',  '$2b$12$hash', 'agricultor')
    RETURNING id, email, nome, tipo
  `);

  const porEmail = (email) => usuarios.find((u) => u.email === email);

  idCliente = porEmail('cli@teste.local').id;
  idOutroCliente = porEmail('out@teste.local').id;

  tokenCliente = gerarToken(porEmail('cli@teste.local'));
  tokenOutroCliente = gerarToken(porEmail('out@teste.local'));
  tokenAgricultorA = gerarToken(porEmail('pa@teste.local'));
  tokenAgricultorB = gerarToken(porEmail('pb@teste.local'));

  const { rows: agri } = await pool.query(
    `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado) VALUES
       ($1, 'Fazenda A', 'Campinas', 'SP'),
       ($2, 'Fazenda B', 'Valinhos', 'SP')
     RETURNING id, usuario_id`,
    [porEmail('pa@teste.local').id, porEmail('pb@teste.local').id],
  );

  idAgricultorA = agri[0].id;
  idAgricultorB = agri[1].id;

  const { rows: cat } = await pool.query(
    `INSERT INTO categorias (nome, slug) VALUES ('Legumes', 'legumes') RETURNING id`,
  );

  const { rows: produtos } = await pool.query(
    `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque) VALUES
       ($1, $3, 'Tomate', 10.00, 100),
       ($2, $3, 'Morango', 20.00, 100)
     RETURNING id`,
    [idAgricultorA, idAgricultorB, cat[0].id],
  );

  idProdutoA = produtos[0].id;
  idProdutoB = produtos[1].id;

  const endereco = await request(app)
    .post(ENDERECOS)
    .set(auth(tokenCliente))
    .send(ENDERECO)
    .expect(201);

  idEndereco = endereco.body.dados.id;

  /*
   * O outro consumidor precisa de um endereco PROPRIO: o checkout
   * recusa entregar em endereco de terceiro (autorizacao da FASE 11).
   * Reaproveitar o endereco da Maria faria o pedido do Joao falhar com
   * 404, e o teste mediria a coisa errada.
   */
  const enderecoOutro = await request(app)
    .post(ENDERECOS)
    .set(auth(tokenOutroCliente))
    .send({ ...ENDERECO, nome_destinatario: 'Joao Pereira', numero: '456' })
    .expect(201);

  idEnderecoOutro = enderecoOutro.body.dados.id;
});

/*
 * Cria um pedido pelo checkout real, com os produtos informados.
 *
 * Usar o fluxo real (carrinho -> checkout) e deliberado: assim o pedido
 * nasce com as mesmas garantias de producao (estoque baixado, itens com
 * agricultor_id correto), e o teste nao depende de INSERT manual que
 * poderia divergir do que o checkout faz.
 */
async function criarPedido(itens, token = tokenCliente, enderecoId = idEndereco) {
  for (const item of itens) {
    await request(app)
      .post(`${CARRINHO}/itens`)
      .set(auth(token))
      .send({ produto_id: item.produto_id, quantidade: item.quantidade ?? 1 })
      .expect(201);
  }

  const resposta = await request(app)
    .post(CHECKOUT)
    .set(auth(token))
    .send({ endereco_id: enderecoId, metodo_pagamento: 'PIX' })
    .expect(201);

  return resposta.body.dados.pedido;
}

/*
 * Avanca um item ate ENTREGUE, pelo fluxo real do agricultor.
 *
 * Nao forcamos o status no banco porque isso pularia justamente a
 * maquina de transicoes que garante que so um pedido enviado pode ser
 * entregue.
 */
async function entregarItem(pedidoId, itemId, token) {
  for (const status of ['PROCESSANDO', 'ENVIADO', 'ENTREGUE']) {
    await request(app)
      .patch(`${PEDIDOS}/${pedidoId}/itens/${itemId}/status`)
      .set(auth(token))
      .send({ status })
      .expect(200);
  }
}

/* Busca os itens do pedido com o agricultor de cada um. */
async function itensDoPedido(pedidoId) {
  const { rows } = await pool.query(
    `SELECT id, produto_id, agricultor_id, status
       FROM pedido_itens WHERE pedido_id = $1 ORDER BY id`,
    [pedidoId],
  );
  return rows;
}

/* ---------------------------------------------------------------- */
/* Autorizacao - as tres condicoes                                   */
/* ---------------------------------------------------------------- */

describe('autorizacao para avaliar', () => {
  /*
   * CAMINHO FELIZ: comprou, recebeu, ainda nao avaliou.
   */
  test('consumidor avalia produto que comprou e recebeu', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);
    const [item] = await itensDoPedido(pedido.id);

    await entregarItem(pedido.id, item.id, tokenAgricultorA);

    const resposta = await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({
        pedido_id: pedido.id,
        produto_id: idProdutoA,
        nota: 5,
        comentario: 'Tomate excelente, chegou fresquinho.',
      })
      .expect(201);

    expect(resposta.body.dados.nota).toBe(5);
    expect(resposta.body.dados.agricultor_id).toBe(Number(idAgricultorA));
  });

  /*
   * CONDICAO 1: SEM COMPRA, NAO HA AVALIACAO.
   *
   * O cliente tenta avaliar um produto que nunca comprou. Sem essa
   * regra, qualquer conta avaliaria qualquer produto do marketplace -
   * a reputacao inteira seria opiniao sem lastro.
   */
  test('nao avalia produto que nunca comprou', async () => {
    await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: 999999, produto_id: idProdutoA, nota: 1 })
      .expect(404);
  });

  /*
   * Condicao 1, variante perversa: o pedido existe, mas e de OUTRO
   * consumidor. O atacante conhece o id do pedido alheio.
   */
  test('nao avalia produto de pedido que pertence a outro consumidor', async () => {
    const pedido = await criarPedido(
      [{ produto_id: idProdutoA }],
      tokenOutroCliente,
      idEnderecoOutro,
    );
    const [item] = await itensDoPedido(pedido.id);

    await entregarItem(pedido.id, item.id, tokenAgricultorA);

    /* O cliente dono do token de teste nao fez essa compra. */
    await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 1 })
      .expect(404);
  });

  /*
   * Condicao 1, segunda variante: o produto existe no marketplace, mas
   * NAO esta naquele pedido do consumidor.
   */
  test('nao avalia produto que nao esta no pedido', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);
    const [item] = await itensDoPedido(pedido.id);

    await entregarItem(pedido.id, item.id, tokenAgricultorA);

    await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoB, nota: 5 })
      .expect(404);
  });

  /*
   * CONDICAO 2: SO AVALIA O QUE FOI RECEBIDO.
   *
   * O item esta PENDENTE. Avaliar aqui seria julgar sem ter visto o
   * produto - e um pedido extraviado ganharia nota 5.
   */
  test('nao avalia item que ainda nao foi entregue', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);

    const resposta = await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 5 })
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('ITEM_NAO_ENTREGUE');
  });

  /*
   * A mesma trava vale para ENVIADO: chegou a sair, mas ainda nao
   * chegou ao cliente.
   */
  test('nao avalia item apenas ENVIADO', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);
    const [item] = await itensDoPedido(pedido.id);

    for (const status of ['PROCESSANDO', 'ENVIADO']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.id}/itens/${item.id}/status`)
        .set(auth(tokenAgricultorA))
        .send({ status })
        .expect(200);
    }

    await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 5 })
      .expect(422);
  });

  /*
   * CONDICAO 3: UMA AVALIACAO POR PRODUTO POR PEDIDO.
   *
   * Sem isso, bastava reenviar 100 vezes para inflar a media - a unica
   * defesa seria o cliente ter boa vontade.
   */
  test('nao avalia o mesmo produto duas vezes no mesmo pedido', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);
    const [item] = await itensDoPedido(pedido.id);

    await entregarItem(pedido.id, item.id, tokenAgricultorA);

    const corpo = { pedido_id: pedido.id, produto_id: idProdutoA, nota: 5 };

    await request(app).post(AVALIACOES).set(auth(tokenCliente)).send(corpo).expect(201);

    const resposta = await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ ...corpo, nota: 1 })
      .expect(409);

    expect(resposta.body.erro.mensagem).toMatch(/ja avaliou/i);
  });

  /*
   * A MESMA CONSTRAINT PERMITE AVALIAR DE NOVO EM OUTRA COMPRA.
   *
   * A unicidade e (pedido, produto, consumidor). Comprar o mesmo produto
   * duas vezes e comprar duas vezes: seria errado recusar a segunda
   * avaliacao, e a media deve refletir as duas compras.
   */
  test('avalia o mesmo produto em pedidos diferentes', async () => {
    for (const _ of [1, 2]) {
      const pedido = await criarPedido([{ produto_id: idProdutoA }]);
      const [item] = await itensDoPedido(pedido.id);

      await entregarItem(pedido.id, item.id, tokenAgricultorA);

      await request(app)
        .post(AVALIACOES)
        .set(auth(tokenCliente))
        .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 4 })
        .expect(201);
    }

    const { rows } = await pool.query(
      'SELECT count(*)::int AS total FROM avaliacoes WHERE consumidor_id = $1',
      [idCliente],
    );
    expect(rows[0].total).toBe(2);
  });

  /*
   * QUEM NAO E CLIENTE NAO AVALIA.
   *
   * Um produtor avaliando o proprio produto inflaria a propria media.
   * O `requireRole('cliente')` na rota barra antes do service.
   */
  test('agricultor nao pode criar avaliacao', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);

    const resposta = await request(app)
      .post(AVALIACOES)
      .set(auth(tokenAgricultorA))
      .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 5 })
      .expect(403);

    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });

  test('usuario sem token nao cria avaliacao', async () => {
    await request(app)
      .post(AVALIACOES)
      .send({ pedido_id: 1, produto_id: idProdutoA, nota: 5 })
      .expect(401);
  });
});

/* ---------------------------------------------------------------- */
/* Manipulacao de campos nao aceitos                                 */
/* ---------------------------------------------------------------- */

describe('campos que o cliente nao controla', () => {
  /*
   * O ATAQUE DO PRODUTOR CONCORRENTE.
   *
   * O cliente comprou do produtor A, recebeu, e envia a avaliacao
   * informando `agricultor_id` do produtor B. Como o Zod descarta o
   * campo, a nota vai para quem de fato vendeu.
   */
  test('agricultor_id do corpo e ignorado', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);
    const [item] = await itensDoPedido(pedido.id);

    await entregarItem(pedido.id, item.id, tokenAgricultorA);

    const resposta = await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({
        pedido_id: pedido.id,
        produto_id: idProdutoA,
        nota: 1,
        agricultor_id: idAgricultorB,
      })
      .expect(201);

    expect(resposta.body.dados.agricultor_id).toBe(Number(idAgricultorA));

    /* E a media do produtor B nao foi afetada. */
    const { rows } = await pool.query(
      'SELECT count(*)::int AS total FROM avaliacoes WHERE agricultor_id = $1',
      [idAgricultorB],
    );
    expect(rows[0].total).toBe(0);
  });

  /* `consumidor_id` do corpo e ignorado: a autoria vem do token. */
  test('consumidor_id do corpo e ignorado', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);
    const [item] = await itensDoPedido(pedido.id);

    await entregarItem(pedido.id, item.id, tokenAgricultorA);

    await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({
        pedido_id: pedido.id,
        produto_id: idProdutoA,
        nota: 5,
        consumidor_id: idOutroCliente,
      })
      .expect(201);

    const { rows } = await pool.query(
      'SELECT consumidor_id FROM avaliacoes WHERE pedido_id = $1',
      [pedido.id],
    );
    expect(Number(rows[0].consumidor_id)).toBe(Number(idCliente));
  });

  /* Nota fora da faixa: 400 pela validacao, e nao 500 pela constraint. */
  test('nota fora de 1 a 5 devolve 400', async () => {
    for (const nota of [0, 6, -1, 4.5]) {
      await request(app)
        .post(AVALIACOES)
        .set(auth(tokenCliente))
        .send({ pedido_id: 1, produto_id: idProdutoA, nota })
        .expect(400);
    }
  });

  test('comentario acima de 2000 caracteres devolve 400', async () => {
    await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({
        pedido_id: 1,
        produto_id: idProdutoA,
        nota: 5,
        comentario: 'a'.repeat(2001),
      })
      .expect(400);
  });

  test('body nao pode injetar SQL no comentario', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);
    const [item] = await itensDoPedido(pedido.id);

    await entregarItem(pedido.id, item.id, tokenAgricultorA);

    const malicioso = "'); DROP TABLE avaliacoes; --";

    const resposta = await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 5, comentario: malicioso })
      .expect(201);

    /* O texto foi gravado como TEXTO, e a tabela continua existindo. */
    expect(resposta.body.dados.comentario).toBe(malicioso);

    const { rows } = await pool.query('SELECT count(*)::int AS total FROM avaliacoes');
    expect(rows[0].total).toBe(1);
  });
});

/* ---------------------------------------------------------------- */
/* Regra multi-agricultor                                            */
/* ---------------------------------------------------------------- */

describe('pedido com produtos de dois produtores', () => {
  test('cada avaliacao e atribuida ao produtor do seu item', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA },
      { produto_id: idProdutoB },
    ]);

    const itens = await itensDoPedido(pedido.id);
    const itemA = itens.find((i) => Number(i.produto_id) === Number(idProdutoA));
    const itemB = itens.find((i) => Number(i.produto_id) === Number(idProdutoB));

    /* Cada produtor entrega o seu item. */
    await entregarItem(pedido.id, itemA.id, tokenAgricultorA);
    await entregarItem(pedido.id, itemB.id, tokenAgricultorB);

    const respA = await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 5, comentario: 'Tomate otimo' })
      .expect(201);

    const respB = await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoB, nota: 2, comentario: 'Morango ruim' })
      .expect(201);

    expect(respA.body.dados.agricultor_id).toBe(Number(idAgricultorA));
    expect(respB.body.dados.agricultor_id).toBe(Number(idAgricultorB));

    /* As medias ficam separadas por produtor. */
    const medias = await pool.query(
      `SELECT agricultor_id, round(avg(nota), 2)::float AS media
         FROM avaliacoes GROUP BY agricultor_id ORDER BY agricultor_id`,
    );

    expect(medias.rows).toHaveLength(2);
    expect(Number(medias.rows[0].agricultor_id)).toBe(Number(idAgricultorA));
    expect(medias.rows[0].media).toBe(5);
    expect(Number(medias.rows[1].agricultor_id)).toBe(Number(idAgricultorB));
    expect(medias.rows[1].media).toBe(2);
  });

  /*
   * UM PRODUTOR ENTREGOU E O OUTRO NAO.
   *
   * A checagem e por ITEM (`pi.status`), e nao por pedido. Se fosse o
   * status do pedido inteiro, o tomate que chegou ficaria travado
   * esperando o morango que nao chegou.
   */
  test('produtor que entregou libera avaliacao mesmo sem o outro', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA },
      { produto_id: idProdutoB },
    ]);

    const itens = await itensDoPedido(pedido.id);
    const itemA = itens.find((i) => Number(i.produto_id) === Number(idProdutoA));

    /* Apenas o produtor A entrega. */
    await entregarItem(pedido.id, itemA.id, tokenAgricultorA);

    /* A avaliacao do item de A passa... */
    await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 5 })
      .expect(201);

    /* ...e a do item de B, ainda nao entregue, nao. */
    await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoB, nota: 5 })
      .expect(422);
  });

  /*
   * Um produtor nao entrega o item do outro: a autorizacao por
   * propriedade ja existente (FASE 12) continua valendo.
   */
  test('produtor A nao entrega item do produtor B', async () => {
    const pedido = await criarPedido([
      { produto_id: idProdutoA },
      { produto_id: idProdutoB },
    ]);

    const itens = await itensDoPedido(pedido.id);
    const itemB = itens.find((i) => Number(i.produto_id) === Number(idProdutoB));

    await request(app)
      .patch(`${PEDIDOS}/${pedido.id}/itens/${itemB.id}/status`)
      .set(auth(tokenAgricultorA))
      .send({ status: 'PROCESSANDO' })
      .expect(404);
  });
});

/* ---------------------------------------------------------------- */
/* Edicao e remocao                                                  */
/* ---------------------------------------------------------------- */

describe('editar e remover a propria avaliacao', () => {
  /*
   * Avaliacao recebida e entregue, pronta para ser editada.
   */
  async function avaliacaoCriada(token = tokenCliente) {
    const pedido = await criarPedido([{ produto_id: idProdutoA }], token);
    const [item] = await itensDoPedido(pedido.id);

    await entregarItem(pedido.id, item.id, tokenAgricultorA);

    const resposta = await request(app)
      .post(AVALIACOES)
      .set(auth(token))
      .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 3, comentario: 'Razoavel' })
      .expect(201);

    return resposta.body.dados.id;
  }

  test('dono atualiza a nota e o comentario', async () => {
    const id = await avaliacaoCriada();

    const resposta = await request(app)
      .put(`${AVALIACOES}/${id}`)
      .set(auth(tokenCliente))
      .send({ nota: 5, comentario: 'Melhorou muito depois de amadurecer.' })
      .expect(200);

    expect(resposta.body.dados.nota).toBe(5);
    expect(resposta.body.dados.comentario).toMatch(/Melhorou/);
  });

  test('atualiza apenas o comentario, mantendo a nota', async () => {
    const id = await avaliacaoCriada();

    const resposta = await request(app)
      .put(`${AVALIACOES}/${id}`)
      .set(auth(tokenCliente))
      .send({ comentario: 'So corrigindo o texto.' })
      .expect(200);

    expect(resposta.body.dados.nota).toBe(3);
  });

  /*
   * APAGAR O COMENTARIO, MANTENDO A NOTA.
   *
   * `null` explicito significa "apagar"; campo ausente significa "nao
   * mexer". Se os dois fossem tratados igual, nao haveria como remover
   * um comentario depois de publicado.
   */
  test('comentario null apaga o texto e preserva a nota', async () => {
    const id = await avaliacaoCriada();

    const resposta = await request(app)
      .put(`${AVALIACOES}/${id}`)
      .set(auth(tokenCliente))
      .send({ comentario: null })
      .expect(200);

    expect(resposta.body.dados.comentario).toBeNull();
    expect(resposta.body.dados.nota).toBe(3);
  });

  test('corpo vazio nao e uma atualizacao', async () => {
    const id = await avaliacaoCriada();

    await request(app)
      .put(`${AVALIACOES}/${id}`)
      .set(auth(tokenCliente))
      .send({})
      .expect(400);
  });

  /*
   * OUTRO CONSUMIDOR NAO EDITA.
   *
   * O 404 (e nao 403) e proposital: um 403 confirmaria que a avaliacao
   * existe, permitindo enumerar ids para descobrir quem avaliou o que.
   */
  test('outro consumidor nao edita, e recebe 404', async () => {
    const id = await avaliacaoCriada();

    await request(app)
      .put(`${AVALIACOES}/${id}`)
      .set(auth(tokenOutroCliente))
      .send({ nota: 1 })
      .expect(404);

    /* A avaliacao original permanece intacta. */
    const { rows } = await pool.query('SELECT nota FROM avaliacoes WHERE id = $1', [id]);
    expect(rows[0].nota).toBe(3);
  });

  test('dono remove a propria avaliacao', async () => {
    const id = await avaliacaoCriada();

    await request(app)
      .delete(`${AVALIACOES}/${id}`)
      .set(auth(tokenCliente))
      .expect(200);

    const { rows } = await pool.query('SELECT count(*)::int AS total FROM avaliacoes');
    expect(rows[0].total).toBe(0);
  });

  test('outro consumidor nao remove, e a avaliacao continua', async () => {
    const id = await avaliacaoCriada();

    await request(app)
      .delete(`${AVALIACOES}/${id}`)
      .set(auth(tokenOutroCliente))
      .expect(404);

    const { rows } = await pool.query('SELECT count(*)::int AS total FROM avaliacoes');
    expect(rows[0].total).toBe(1);
  });

  test('agricultor nao remove avaliacao que recebeu', async () => {
    const id = await avaliacaoCriada();

    /* O avaliado nao apaga a nota que recebeu. */
    await request(app)
      .delete(`${AVALIACOES}/${id}`)
      .set(auth(tokenAgricultorA))
      .expect(403);

    const { rows } = await pool.query('SELECT count(*)::int AS total FROM avaliacoes');
    expect(rows[0].total).toBe(1);
  });

  test('id inexistente devolve 404', async () => {
    await request(app)
      .put(`${AVALIACOES}/999999`)
      .set(auth(tokenCliente))
      .send({ nota: 5 })
      .expect(404);

    await request(app)
      .delete(`${AVALIACOES}/999999`)
      .set(auth(tokenCliente))
      .expect(404);
  });
});

/* ---------------------------------------------------------------- */
/* Leituras publicas e medias                                        */
/* ---------------------------------------------------------------- */

describe('leitura publica de reputacao', () => {
  /* Cria N avaliacoes de nota 5 para o produto A. */
  async function avaliarProdutoA(notas) {
    let pedido;
    for (const nota of notas) {
      pedido = await criarPedido([{ produto_id: idProdutoA }]);
      const [item] = await itensDoPedido(pedido.id);
      await entregarItem(pedido.id, item.id, tokenAgricultorA);

      await request(app)
        .post(AVALIACOES)
        .set(auth(tokenCliente))
        .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota })
        .expect(201);
    }
    return pedido;
  }

  test('lista avaliações do produto sem exigir login', async () => {
    await avaliarProdutoA([5, 4]);

    const resposta = await request(app)
      .get(`${AVALIACOES}/produto/${idProdutoA}`)
      .expect(200);

    expect(resposta.body.dados.resumo.media).toBe(4.5);
    expect(resposta.body.dados.resumo.total).toBe(2);
    expect(resposta.body.dados.avaliacoes).toHaveLength(2);
  });

  test('produto sem avaliacao devolve media 0 e lista vazia', async () => {
    const resposta = await request(app)
      .get(`${AVALIACOES}/produto/${idProdutoB}`)
      .expect(200);

    expect(resposta.body.dados.resumo.media).toBe(0);
    expect(resposta.body.dados.resumo.total).toBe(0);
    expect(resposta.body.dados.avaliacoes).toEqual([]);
  });

  test('lista avaliações recebidas pelo produtor com distribuicao', async () => {
    await avaliarProdutoA([5, 3]);

    const resposta = await request(app)
      .get(`${AVALIACOES}/agricultor/${idAgricultorA}`)
      .expect(200);

    expect(resposta.body.dados.resumo.media).toBe(4);
    expect(resposta.body.dados.resumo.distribuicao['5']).toBe(1);
    expect(resposta.body.dados.resumo.distribuicao['3']).toBe(1);
    expect(resposta.body.dados.resumo.distribuicao['1']).toBe(0);
  });

  /* A media exposta pelo produto (view) espelha as avaliacoes gravadas. */
  test('a media do produto aparece na vitrine', async () => {
    await avaliarProdutoA([5]);

    const resposta = await request(app).get(`${PRODUTOS}/${idProdutoA}`).expect(200);

    expect(Number(resposta.body.dados.media_avaliacoes)).toBe(5);
    expect(Number(resposta.body.dados.total_avaliacoes)).toBe(1);
  });

  test('remover a avaliacao ajusta a media do produto', async () => {
    await avaliarProdutoA([5, 4]);

    const { rows } = await pool.query(
      'SELECT id FROM avaliacoes WHERE produto_id = $1 ORDER BY id LIMIT 1',
      [idProdutoA],
    );

    await request(app)
      .delete(`${AVALIACOES}/${rows[0].id}`)
      .set(auth(tokenCliente))
      .expect(200);

    const resposta = await request(app).get(`${PRODUTOS}/${idProdutoA}`).expect(200);

    /* Sobrou a nota 4. Se a media ainda fosse 4.5, a view nao refletiria. */
    expect(Number(resposta.body.dados.media_avaliacoes)).toBe(4);
    expect(Number(resposta.body.dados.total_avaliacoes)).toBe(1);
  });

  test('produto inexistente devolve 404', async () => {
    await request(app).get(`${AVALIACOES}/produto/999999`).expect(404);
  });

  test('agricultor inexistente devolve 404', async () => {
    await request(app).get(`${AVALIACOES}/agricultor/999999`).expect(404);
  });

  test('id invalido devolve 400 antes de consultar o banco', async () => {
    await request(app).get(`${AVALIACOES}/produto/abc`).expect(400);
  });
});

/* ---------------------------------------------------------------- */
/* Minhas avaliacoes e pendentes                                     */
/* ---------------------------------------------------------------- */

describe('minhas avaliacoes e o que falta avaliar', () => {
  test('minhas avaliacoes lista apenas as do consumidor do token', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);
    const [item] = await itensDoPedido(pedido.id);
    await entregarItem(pedido.id, item.id, tokenAgricultorA);

    await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 5 })
      .expect(201);

    const minhas = await request(app)
      .get(`${AVALIACOES}/minhas`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(minhas.body.dados).toHaveLength(1);

    /* O outro consumidor nao ve nada. */
    const vazio = await request(app)
      .get(`${AVALIACOES}/minhas`)
      .set(auth(tokenOutroCliente))
      .expect(200);

    expect(vazio.body.dados).toHaveLength(0);
  });

  test('pendentes lista o que foi entregue e ainda nao avaliado', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);
    const [item] = await itensDoPedido(pedido.id);
    await entregarItem(pedido.id, item.id, tokenAgricultorA);

    const antes = await request(app)
      .get(`${AVALIACOES}/pendentes/${pedido.id}`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(antes.body.dados.total).toBe(1);
    expect(Number(antes.body.dados.itens[0].produto_id)).toBe(Number(idProdutoA));

    await request(app)
      .post(AVALIACOES)
      .set(auth(tokenCliente))
      .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota: 5 })
      .expect(201);

    /* Depois de avaliar, sai da lista. */
    const depois = await request(app)
      .get(`${AVALIACOES}/pendentes/${pedido.id}`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(depois.body.dados.total).toBe(0);
  });

  test('pendentes ignora item ainda nao entregue', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);

    const resposta = await request(app)
      .get(`${AVALIACOES}/pendentes/${pedido.id}`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(resposta.body.dados.total).toBe(0);
  });

  test('pendentes de pedido de outro consumidor devolve 404', async () => {
    const pedido = await criarPedido([{ produto_id: idProdutoA }]);

    await request(app)
      .get(`${AVALIACOES}/pendentes/${pedido.id}`)
      .set(auth(tokenOutroCliente))
      .expect(404);
  });

  test('pendentes exige autenticacao', async () => {
    await request(app).get(`${AVALIACOES}/pendentes/1`).expect(401);
  });
});

/* ---------------------------------------------------------------- */
/* Validacao de parametros e ordenacao                               */
/* ---------------------------------------------------------------- */

describe('validacao e paginacao', () => {
  test('id de avaliacao invalido devolve 400', async () => {
    await request(app)
      .delete(`${AVALIACOES}/abc`)
      .set(auth(tokenCliente))
      .expect(400);
  });

  test('paginacao de avaliacoes do produto', async () => {
    for (const nota of [5, 4, 3]) {
      const pedido = await criarPedido([{ produto_id: idProdutoA }]);
      const [item] = await itensDoPedido(pedido.id);
      await entregarItem(pedido.id, item.id, tokenAgricultorA);

      await request(app)
        .post(AVALIACOES)
        .set(auth(tokenCliente))
        .send({ pedido_id: pedido.id, produto_id: idProdutoA, nota })
        .expect(201);
    }

    const pagina1 = await request(app)
      .get(`${AVALIACOES}/produto/${idProdutoA}?pagina=1&limite=2`)
      .expect(200);

    expect(pagina1.body.dados.avaliacoes).toHaveLength(2);
    expect(pagina1.body.paginacao.total).toBe(3);
    expect(pagina1.body.paginacao.paginas).toBe(2);

    const pagina2 = await request(app)
      .get(`${AVALIACOES}/produto/${idProdutoA}?pagina=2&limite=2`)
      .expect(200);

    expect(pagina2.body.dados.avaliacoes).toHaveLength(1);
  });

  /*
   * Convencao do projeto (mesma de /produtos e /agricultores): limite
   * acima do maximo e RECUSADO com 400, e nao reduzido em silencio.
   * Reduzir sem avisar faria o cliente acreditar que recebeu tudo que
   * pediu.
   */
  test('limite acima do maximo e recusado com 400', async () => {
    await request(app)
      .get(`${AVALIACOES}/produto/${idProdutoA}?limite=100000`)
      .expect(400);
  });
});
