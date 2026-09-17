import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { prepararSchema, limparDados } from '../helpers/banco.js';
import { gerarToken } from '../../src/utils/token.js';
import pedidoRepository from '../../src/repositories/pedidoRepository.js';

/*
 * Testes do checkout (FASE 11) - a operacao mais critica do sistema.
 *
 * O que estes testes precisam provar, em ordem de importancia:
 *
 * 1) O cliente NAO consegue escolher o preco. Enviar valor_total,
 *    valor_frete ou preco no corpo nao muda nada: o checkout recalcula
 *    tudo do banco. E o teste mais importante do arquivo.
 *
 * 2) Nao vende estoque inexistente. Duas compras do ultimo item: uma
 *    passa, a outra falha. E a garantia do `WHERE estoque >= quantidade`.
 *
 * 3) Tudo ou nada. Quando um item falha no meio, NADA e gravado: nem
 *    pedido, nem itens, nem baixa de estoque dos itens anteriores, nem
 *    carrinho esvaziado. Verificado contando linhas no banco.
 *
 * 4) Endereco de outro consumidor nao pode ser usado (IDOR).
 *
 * Os testes 2 e 3 sao os que pegariam os bugs caros: um checkout que
 * vende o que nao tem, ou que deixa o banco pela metade.
 */

const CHECKOUT = '/api/v1/checkout';
const CARRINHO = '/api/v1/carrinho';
const ENDERECOS = '/api/v1/enderecos';

let tokenCliente;
let tokenOutro;
let tokenAgricultor;
let idUsuarioCliente;
let idUsuarioOutro;
let idProduto;
let idProdutoCaro;
let idEndereco;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

/* Endereco valido reutilizavel. */
const ENDERECO_VALIDO = {
  nome_destinatario: 'Maria Souza',
  cep: '13010100',
  rua: 'Rua das Flores',
  numero: '123',
  bairro: 'Centro',
  cidade: 'Campinas',
  estado: 'SP',
};

/* Endereco fora da cidade do produtor, para o frete ser o valor base. */
const ENDERECO_LONGE = {
  nome_destinatario: 'Joao Lima',
  cep: '50010000',
  rua: 'Av. Boa Vista',
  numero: '500',
  bairro: 'Boa Vista',
  cidade: 'Recife',
  estado: 'PE',
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
      ('Produtor',  'prod@teste.local', '$2b$12$hash', 'agricultor')
    RETURNING id, email, tipo
  `);

  const porEmail = (email) => usuarios.find((u) => u.email === email);
  idUsuarioCliente = porEmail('cli@teste.local').id;
  idUsuarioOutro = porEmail('out@teste.local').id;
  tokenCliente = gerarToken(porEmail('cli@teste.local'));
  tokenOutro = gerarToken(porEmail('out@teste.local'));
  tokenAgricultor = gerarToken(porEmail('prod@teste.local'));

  const { rows: agri } = await pool.query(
    `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado)
     VALUES ($1, 'Fazenda A', 'Campinas', 'SP') RETURNING id`,
    [porEmail('prod@teste.local').id],
  );

  const { rows: cat } = await pool.query(
    `INSERT INTO categorias (nome, slug) VALUES ('Legumes', 'legumes') RETURNING id`,
  );

  const { rows: produtos } = await pool.query(
    `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque) VALUES
       ($1, $2, 'Tomate',  8.50, 100),
       ($1, $2, 'Morango', 20.00, 50)
     RETURNING id, nome`,
    [agri[0].id, cat[0].id],
  );

  idProduto = produtos.find((p) => p.nome === 'Tomate').id;
  idProdutoCaro = produtos.find((p) => p.nome === 'Morango').id;

  /* Endereco do cliente, criado pela API (primeiro vira principal). */
  const respostaEndereco = await request(app)
    .post(ENDERECOS)
    .set(auth(tokenCliente))
    .send(ENDERECO_VALIDO)
    .expect(201);

  idEndereco = respostaEndereco.body.dados.id;
});

/* Atalho: poe itens no carrinho do cliente. */
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
 * Cria um endereco e devolve o id.
 *
 * O segundo consumidor precisa do proprio endereco nos cenarios de
 * disputa de estoque: sem ele, o checkout falharia por falta de endereco
 * e o teste nao chegaria a exercitar a concorrencia.
 */
async function criarEndereco(token, dados = ENDERECO_VALIDO) {
  const resposta = await request(app).post(ENDERECOS).set(auth(token)).send(dados).expect(201);
  return resposta.body.dados.id;
}

/*
 * Ajusta o estoque DEPOIS de o carrinho estar montado.
 *
 * A ordem importa: adicionar ao carrinho valida o estoque (FASE 10).
 * Baixar o estoque antes faria a propria adicao falhar, e o teste
 * testaria a fase errada. O cenario que queremos e "o carrinho foi
 * montado quando havia estoque, e o estoque caiu depois".
 */
async function ajustarEstoque(produtoId, estoque) {
  await pool.query('UPDATE produtos SET estoque = $2 WHERE id = $1', [produtoId, estoque]);
}

/* Atalho: finaliza o checkout. */
function finalizar(corpo, token = tokenCliente) {
  return request(app).post(CHECKOUT).set(auth(token)).send(corpo);
}

/* Contagem de linhas, para provar que nada foi gravado. */
async function contar(tabela) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${tabela}`);
  return rows[0].n;
}

/* ---------------------------------------------------------------- */
/* Acesso                                                            */
/* ---------------------------------------------------------------- */

describe('acesso ao checkout', () => {
  test('sem token devolve 401', async () => {
    await request(app).post(CHECKOUT).send({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(401);
  });

  test('agricultor nao pode finalizar compra', async () => {
    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }, tokenAgricultor).expect(403);
  });

  test('carrinho vazio nao finaliza', async () => {
    const resposta = await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(422);

    expect(resposta.body.erro.codigo).toBe('CARRINHO_VAZIO');
  });

  test('metodo de pagamento invalido e recusado', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'BITCOIN' }).expect(400);
  });

  test('endereco inexistente devolve 404', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await finalizar({ endereco_id: 999999, metodo_pagamento: 'PIX' }).expect(404);
  });

  test('endereco obrigatorio', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await finalizar({ metodo_pagamento: 'PIX' }).expect(400);
  });
});

/* ---------------------------------------------------------------- */
/* Manipulacao de valores - o teste central                          */
/* ---------------------------------------------------------------- */

describe('o checkout nao aceita valores do cliente', () => {
  /*
   * Envia todos os valores que um atacante tentaria: valor_total 0.01,
   * frete zero, preco unitario 0.01. Nenhum existe no schema, entao o
   * Zod os remove e o checkout recalcula.
   *
   * Com 2 tomates a 8.50 e entrega na MESMA cidade do produtor (o
   * endereco padrao e Campinas/SP, igual a fazenda), o frete e metade do
   * valor base: 4.95. Total 17 + 4.95 = 21.95.
   */
  test('valor_total, frete e preco do corpo sao ignorados', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 2 }]);

    const resposta = await finalizar({
      endereco_id: idEndereco,
      metodo_pagamento: 'PIX',
      valor_total: 0.01,
      valor_produtos: 0.01,
      valor_frete: 0,
      preco_unitario: 0.01,
      subtotal: 0.02,
    }).expect(201);

    expect(resposta.body.dados.pedido.valor_produtos).toBe(17);
    expect(resposta.body.dados.pedido.valor_frete).toBe(4.95);
    expect(resposta.body.dados.pedido.valor_total).toBe(21.95);
  });

  test('os valores gravados no banco sao os do servidor', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 2 }]);

    await finalizar({
      endereco_id: idEndereco,
      metodo_pagamento: 'PIX',
      valor_total: 0.01,
    }).expect(201);

    const { rows } = await pool.query(
      'SELECT valor_produtos, valor_frete, valor_total FROM pedidos',
    );

    expect(Number(rows[0].valor_produtos)).toBe(17);
    expect(Number(rows[0].valor_frete)).toBe(4.95);
    expect(Number(rows[0].valor_total)).toBe(21.95);
  });

  test('o preco do item e o snapshot do banco no momento da compra', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 3 }]);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    const { rows } = await pool.query(
      'SELECT preco_unitario, quantidade, subtotal FROM pedido_itens',
    );

    expect(Number(rows[0].preco_unitario)).toBe(8.5);
    expect(rows[0].quantidade).toBe(3);
    expect(Number(rows[0].subtotal)).toBe(25.5);
  });

  /*
   * O carrinho nao guarda preco; o checkout le o preco ATUAL. Se o
   * produtor reajustou depois que o cliente encheu o carrinho, vale o
   * preco novo - e o cliente paga o que esta na vitrine agora.
   */
  test('usa o preco atual do produto, nao um preco antigo', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 2 }]);

    await pool.query('UPDATE produtos SET preco = 10.00 WHERE id = $1', [idProduto]);

    const resposta = await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    expect(resposta.body.dados.pedido.valor_produtos).toBe(20);
  });
});

/* ---------------------------------------------------------------- */
/* Estoque                                                           */
/* ---------------------------------------------------------------- */

describe('controle de estoque no checkout', () => {
  test('baixa o estoque na quantidade comprada', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 4 }]);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    const { rows } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [idProduto]);
    expect(rows[0].estoque).toBe(96);
  });

  /*
   * O TESTE MAIS IMPORTANTE DESTA FASE.
   *
   * Cenario: estoque 5. Cliente A poe 5 no carrinho, cliente B tambem.
   * A finaliza primeiro e leva tudo. B, ao finalizar, precisa ser
   * recusado - e nao vender estoque que nao existe.
   *
   * A recusa vem como 422 ITENS_INDISPONIVEIS, e nao 409: a
   * revalidacao dentro da transacao le o estoque ja zerado e aponta o
   * item como indisponivel antes de tentar a baixa. O 409
   * ESTOQUE_INSUFICIENTE fica reservado para o caso em que a baixa
   * condicional falha mesmo com a revalidacao passando (disputa entre a
   * leitura e o UPDATE). Os dois caminhos protegem; este teste cobre o
   * primeiro, e o teste de concorrencia cobre o segundo.
   */
  test('nao vende estoque que ja acabou', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 5 }]);
    await encherCarrinho([{ produto_id: idProduto, quantidade: 5 }], tokenOutro);
    await ajustarEstoque(idProduto, 5);

    const idEnderecoOutro = await criarEndereco(tokenOutro);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    const resposta = await finalizar(
      { endereco_id: idEnderecoOutro, metodo_pagamento: 'PIX' },
      tokenOutro,
    ).expect(422);

    expect(resposta.body.erro.codigo).toBe('ITENS_INDISPONIVEIS');
    expect(JSON.stringify(resposta.body.erro.detalhes)).toMatch(/Estoque insuficiente/i);

    const { rows } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [idProduto]);
    expect(rows[0].estoque).toBe(0);
  });

  /*
   * Duas compras do ULTIMO item, disparadas juntas. O banco decide: uma
   * passa, a outra nao. O estoque nunca fica negativo.
   */
  test('duas compras simultaneas do ultimo item: so uma passa', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }], tokenOutro);
    await ajustarEstoque(idProduto, 1);

    const idEnderecoOutro = await criarEndereco(tokenOutro);

    const [a, b] = await Promise.all([
      finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }),
      finalizar({ endereco_id: idEnderecoOutro, metodo_pagamento: 'PIX' }, tokenOutro),
    ]);

    const codigos = [a.status, b.status].sort((x, y) => x - y);
    expect(codigos).toEqual([201, 409]);

    const { rows } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [idProduto]);
    expect(rows[0].estoque).toBe(0);
    expect(rows[0].estoque).toBeGreaterThanOrEqual(0);

    expect(await contar('pedidos')).toBe(1);
  });

  test('estoque nunca fica negativo, mesmo com varias tentativas', async () => {
    await pool.query('UPDATE produtos SET estoque = 2 WHERE id = $1', [idProduto]);

    await encherCarrinho([{ produto_id: idProduto, quantidade: 2 }]);

    await Promise.all([
      finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }),
      finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }),
      finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }),
    ]);

    const { rows } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [idProduto]);
    expect(rows[0].estoque).toBeGreaterThanOrEqual(0);
  });

  test('recusa quando o estoque caiu entre montar o carrinho e finalizar', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 10 }]);

    await pool.query('UPDATE produtos SET estoque = 3 WHERE id = $1', [idProduto]);

    const resposta = await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(422);

    expect(resposta.body.erro.codigo).toBe('ITENS_INDISPONIVEIS');
    expect(JSON.stringify(resposta.body.erro.detalhes)).toMatch(/Estoque insuficiente/i);
  });

  test('recusa item que saiu do ar antes de finalizar', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await pool.query('UPDATE produtos SET ativo = FALSE WHERE id = $1', [idProduto]);

    const resposta = await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(422);

    expect(resposta.body.erro.codigo).toBe('ITENS_INDISPONIVEIS');
  });

  test('recusa item de produtor desativado', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await pool.query('UPDATE agricultores SET ativo = FALSE');

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(422);
  });
});

/* ---------------------------------------------------------------- */
/* Atomicidade - tudo ou nada                                        */
/* ---------------------------------------------------------------- */

describe('atomicidade da transacao', () => {
  /*
   * Cenario montado de proposito: dois itens, o primeiro com estoque de
   * sobra e o segundo com estoque insuficiente. O primeiro item e
   * processado (baixa de estoque feita) antes de o segundo falhar.
   *
   * Se nao houvesse transacao, o estoque do primeiro item ficaria
   * baixado sem nenhum pedido existir - estoque perdido para sempre.
   * O teste confere que o estoque voltou ao valor original.
   */
  test('falha no meio nao deixa estoque baixado pela metade', async () => {
    await encherCarrinho([
      { produto_id: idProduto, quantidade: 5 },
      { produto_id: idProdutoCaro, quantidade: 50 },
    ]);

    await ajustarEstoque(idProdutoCaro, 2);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(422);

    const { rows } = await pool.query(
      'SELECT id, estoque FROM produtos WHERE id = ANY($1) ORDER BY id',
      [[idProduto, idProdutoCaro]],
    );

    const tomate = rows.find((r) => String(r.id) === String(idProduto));
    expect(tomate.estoque).toBe(100);
  });

  test('falha nao cria pedido, item nem pagamento', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await ajustarEstoque(idProduto, 0);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(422);

    expect(await contar('pedidos')).toBe(0);
    expect(await contar('pedido_itens')).toBe(0);
    expect(await contar('pagamentos')).toBe(0);
  });

  test('falha nao esvazia o carrinho', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await ajustarEstoque(idProduto, 0);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(422);

    const carrinho = await request(app).get(CARRINHO).set(auth(tokenCliente)).expect(200);
    expect(carrinho.body.dados.itens).toHaveLength(1);
  });

  test('sucesso cria pedido, itens, pagamento e esvazia o carrinho', async () => {
    await encherCarrinho([
      { produto_id: idProduto, quantidade: 2 },
      { produto_id: idProdutoCaro, quantidade: 1 },
    ]);

    const resposta = await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    expect(await contar('pedidos')).toBe(1);
    expect(await contar('pedido_itens')).toBe(2);
    expect(await contar('pagamentos')).toBe(1);

    const carrinho = await request(app).get(CARRINHO).set(auth(tokenCliente)).expect(200);
    expect(carrinho.body.dados.itens).toEqual([]);

    expect(resposta.body.dados.pedido.valor_produtos).toBe(37);
  });

  /*
   * O ROLLBACK PRECISA SER TESTADO DIRETAMENTE.
   *
   * Os testes acima cobrem a garantia "checkout que falha nao altera
   * nada", mas eles nao exercitam o ROLLBACK: como a revalidacao roda
   * antes de qualquer escrita, todos eles falham antes de o primeiro
   * estoque ser baixado. Verificado por reversao - desligar o BEGIN e o
   * ROLLBACK nao faz esses testes falharem.
   *
   * Este teste fecha essa lacuna: baixa o estoque (escrita de verdade) e
   * lanca um erro depois. Sem ROLLBACK, a baixa ficaria gravada. Com
   * ROLLBACK, o estoque volta ao original.
   *
   * A transacao e aberta pelo mesmo metodo que o checkout usa
   * (`emTransacao`), entao o caminho exercitado e o de producao.
   */
  test('ROLLBACK desfaz uma baixa de estoque ja executada', async () => {
    const { rows: antes } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [
      idProduto,
    ]);

    await expect(
      pedidoRepository.emTransacao(async (cliente) => {
        const baixou = await pedidoRepository.baixarEstoque(cliente, idProduto, 7);
        expect(baixou.estoque).toBe(antes[0].estoque - 7);

        /* Falha DEPOIS da escrita, como aconteceria num erro no meio do
           checkout real. */
        throw new Error('falha simulada no meio do checkout');
      }),
    ).rejects.toThrow('falha simulada no meio do checkout');

    const { rows: depois } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [
      idProduto,
    ]);

    expect(depois[0].estoque).toBe(antes[0].estoque);
  });

  /* COMMIT preserva a escrita, para o teste acima nao passar por acidente. */
  test('COMMIT preserva a baixa de estoque', async () => {
    const { rows: antes } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [
      idProduto,
    ]);

    await pedidoRepository.emTransacao(async (cliente) => {
      await pedidoRepository.baixarEstoque(cliente, idProduto, 7);
    });

    const { rows: depois } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [
      idProduto,
    ]);

    expect(depois[0].estoque).toBe(antes[0].estoque - 7);
  });
});

/* ---------------------------------------------------------------- */
/* IDOR de endereco                                                  */
/* ---------------------------------------------------------------- */

describe('endereco de outro consumidor', () => {
  /*
   * O cliente A tenta usar o endereco do cliente B. O repositorio
   * filtra por `consumidor_id`, entao o endereco simplesmente nao
   * existe para A: 404, e nao 403. Nao distinguir os dois casos evita
   * confirmar que aquele id existe.
   */
  test('nao pode finalizar com endereco de outro consumidor', async () => {
    const enderecoDoOutro = await request(app)
      .post(ENDERECOS)
      .set(auth(tokenOutro))
      .send(ENDERECO_LONGE)
      .expect(201);

    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await finalizar({
      endereco_id: enderecoDoOutro.body.dados.id,
      metodo_pagamento: 'PIX',
    }).expect(404);

    expect(await contar('pedidos')).toBe(0);
  });

  test('nao pode ler o endereco de outro consumidor', async () => {
    const enderecoDoOutro = await request(app)
      .post(ENDERECOS)
      .set(auth(tokenOutro))
      .send(ENDERECO_LONGE)
      .expect(201);

    await request(app)
      .get(`${ENDERECOS}/${enderecoDoOutro.body.dados.id}`)
      .set(auth(tokenCliente))
      .expect(404);
  });

  test('nao pode alterar o endereco de outro consumidor', async () => {
    const enderecoDoOutro = await request(app)
      .post(ENDERECOS)
      .set(auth(tokenOutro))
      .send(ENDERECO_LONGE)
      .expect(201);

    await request(app)
      .put(`${ENDERECOS}/${enderecoDoOutro.body.dados.id}`)
      .set(auth(tokenCliente))
      .send({ ...ENDERECO_LONGE, rua: 'Rua Invadida' })
      .expect(404);

    const { rows } = await pool.query('SELECT rua FROM enderecos WHERE id = $1', [
      enderecoDoOutro.body.dados.id,
    ]);
    expect(rows[0].rua).toBe('Avenida Boa Vista'.replace('Avenida', 'Av.'));
  });

  test('nao pode remover o endereco de outro consumidor', async () => {
    const enderecoDoOutro = await request(app)
      .post(ENDERECOS)
      .set(auth(tokenOutro))
      .send(ENDERECO_LONGE)
      .expect(201);

    await request(app)
      .delete(`${ENDERECOS}/${enderecoDoOutro.body.dados.id}`)
      .set(auth(tokenCliente))
      .expect(404);

    expect(await contar('enderecos')).toBe(2);
  });

  test('o snapshot do pedido usa o endereco do proprio consumidor', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    const { rows } = await pool.query('SELECT endereco_entrega FROM pedidos');
    expect(rows[0].endereco_entrega.cidade).toBe('Campinas');
    expect(rows[0].endereco_entrega.nome_destinatario).toBe('Maria Souza');
  });
});

/* ---------------------------------------------------------------- */
/* Frete                                                             */
/* ---------------------------------------------------------------- */

describe('calculo de frete', () => {
  test('cobra o valor base para outra cidade', async () => {
    const longe = await request(app).post(ENDERECOS).set(auth(tokenCliente)).send(ENDERECO_LONGE).expect(201);

    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    const resposta = await finalizar({
      endereco_id: longe.body.dados.id,
      metodo_pagamento: 'PIX',
    }).expect(201);

    expect(resposta.body.dados.pedido.valor_frete).toBe(9.9);
    expect(resposta.body.dados.frete.motivo).toMatch(/fora da cidade/i);
  });

  test('cobra metade do valor na mesma cidade do produtor', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    const resposta = await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    expect(resposta.body.dados.pedido.valor_frete).toBe(4.95);
    expect(resposta.body.dados.frete.motivo).toMatch(/mesma cidade/i);
  });

  test('frete gratis acima do limite', async () => {
    await pool.query('UPDATE produtos SET preco = 250.00, estoque = 5 WHERE id = $1', [idProdutoCaro]);

    await encherCarrinho([{ produto_id: idProdutoCaro, quantidade: 1 }]);

    const resposta = await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    expect(resposta.body.dados.pedido.valor_frete).toBe(0);
    expect(resposta.body.dados.frete.gratis).toBe(true);
    expect(resposta.body.dados.pedido.valor_total).toBe(250);
  });

  test('o total gravado e sempre produtos + frete', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 3 }]);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    const { rows } = await pool.query(
      `SELECT valor_produtos, valor_frete, valor_total,
              (valor_produtos + valor_frete = valor_total) AS coerente
         FROM pedidos`,
    );

    expect(rows[0].coerente).toBe(true);
  });
});

/* ---------------------------------------------------------------- */
/* Previa                                                            */
/* ---------------------------------------------------------------- */

describe('POST /checkout/preview', () => {
  test('calcula o resumo sem gravar nada', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 2 }]);

    const resposta = await request(app)
      .post(`${CHECKOUT}/preview`)
      .set(auth(tokenCliente))
      .send({ endereco_id: idEndereco })
      .expect(200);

    expect(resposta.body.dados.valor_produtos).toBe(17);
    expect(resposta.body.dados.valor_frete).toBe(4.95);
    expect(resposta.body.dados.valor_total).toBe(21.95);
    expect(resposta.body.dados.pode_finalizar).toBe(true);

    expect(await contar('pedidos')).toBe(0);
    expect(await contar('pagamentos')).toBe(0);
  });

  test('a previa e o checkout real dao o mesmo total', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 2 }]);

    const previa = await request(app)
      .post(`${CHECKOUT}/preview`)
      .set(auth(tokenCliente))
      .send({ endereco_id: idEndereco })
      .expect(200);

    const real = await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    expect(real.body.dados.pedido.valor_total).toBe(previa.body.dados.valor_total);
  });

  test('usa o endereco principal quando nao informado', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    const resposta = await request(app)
      .post(`${CHECKOUT}/preview`)
      .set(auth(tokenCliente))
      .send({})
      .expect(200);

    expect(resposta.body.dados.endereco_definido).toBe(true);
    expect(resposta.body.dados.endereco.cidade).toBe('Campinas');
  });

  test('sinaliza quando nao ha endereco cadastrado', async () => {
    await request(app).delete(`${ENDERECOS}/${idEndereco}`).set(auth(tokenCliente)).expect(422);

    /* Remove via banco, para simular cliente sem endereco. */
    await pool.query('DELETE FROM enderecos WHERE consumidor_id = $1', [idUsuarioCliente]);

    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    const resposta = await request(app)
      .post(`${CHECKOUT}/preview`)
      .set(auth(tokenCliente))
      .send({})
      .expect(200);

    expect(resposta.body.dados.endereco_definido).toBe(false);
    expect(resposta.body.dados.pode_finalizar).toBe(false);
  });

  test('aponta itens indisponiveis sem falhar', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 10 }]);

    await pool.query('UPDATE produtos SET estoque = 1 WHERE id = $1', [idProduto]);

    const resposta = await request(app)
      .post(`${CHECKOUT}/preview`)
      .set(auth(tokenCliente))
      .send({ endereco_id: idEndereco })
      .expect(200);

    expect(resposta.body.dados.pode_finalizar).toBe(false);
    expect(resposta.body.dados.itens_indisponiveis).toBe(1);
  });

  test('informa quanto falta para o frete gratis', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    const resposta = await request(app)
      .post(`${CHECKOUT}/preview`)
      .set(auth(tokenCliente))
      .send({ endereco_id: idEndereco })
      .expect(200);

    expect(resposta.body.dados.falta_para_frete_gratis).toBe(191.5);
  });

  test('nao aceita endereco de outro consumidor', async () => {
    const enderecoDoOutro = await request(app)
      .post(ENDERECOS)
      .set(auth(tokenOutro))
      .send(ENDERECO_LONGE)
      .expect(201);

    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await request(app)
      .post(`${CHECKOUT}/preview`)
      .set(auth(tokenCliente))
      .send({ endereco_id: enderecoDoOutro.body.dados.id })
      .expect(404);
  });
});

/* ---------------------------------------------------------------- */
/* Pagamento                                                         */
/* ---------------------------------------------------------------- */

describe('pagamento no checkout', () => {
  test('PIX e aprovado pelo gateway simulado', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    const resposta = await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    expect(resposta.body.dados.pagamento.status).toBe('APROVADO');
  });

  /*
   * O gateway simulado recusa valores terminados em ,13. O pedido
   * continua existindo com o pagamento RECUSADO - nao e um erro de
   * checkout, e um pagamento que nao passou.
   */
  test('valor terminado em ,13 e recusado mas o pedido existe', async () => {
    /* Frete mesmo-cidade 4.95 + 13.18 = 18.13 (termina em ,13). */
    await pool.query('UPDATE produtos SET preco = 13.18 WHERE id = $1', [idProduto]);

    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    const resposta = await finalizar({
      endereco_id: idEndereco,
      metodo_pagamento: 'CARTAO',
    }).expect(201);

    expect(resposta.body.dados.pagamento.status).toBe('RECUSADO');

    expect(await contar('pedidos')).toBe(1);

    const { rows } = await pool.query('SELECT status FROM pagamentos');
    expect(rows[0].status).toBe('RECUSADO');
  });

  test('valor terminado em ,99 fica pendente', async () => {
    /* Frete mesmo-cidade 4.95 + 10.04 = 14.99 (termina em ,99). */
    await pool.query('UPDATE produtos SET preco = 10.04 WHERE id = $1', [idProduto]);

    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    const resposta = await finalizar({
      endereco_id: idEndereco,
      metodo_pagamento: 'PIX',
    }).expect(201);

    expect(resposta.body.dados.pagamento.status).toBe('PENDENTE');
  });

  test('o pagamento e gravado com o valor total do pedido', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 2 }]);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    const { rows } = await pool.query('SELECT valor, metodo FROM pagamentos');
    expect(Number(rows[0].valor)).toBe(21.95);
    expect(rows[0].metodo).toBe('PIX');
  });

  /*
   * O identificador do gateway precisa ser GRAVADO, nao apenas devolvido.
   *
   * Sem ele, um webhook posterior (PIX confirmado) nao teria como
   * encontrar o pagamento: `buscarPagamentoPorIdentificador` nao acharia
   * nada e o pedido ficaria pendente para sempre.
   *
   * Este teste nasceu de um bug real encontrado na validacao manual: o
   * checkout devolvia o identificador na resposta, mas o UPDATE so
   * gravava status e resumo.
   */
  test('grava o identificador externo da transacao', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    const { rows } = await pool.query(
      'SELECT identificador_externo FROM pagamentos',
    );

    expect(rows[0].identificador_externo).toBeTruthy();
    expect(rows[0].identificador_externo).toMatch(/^FAKE-/);

    /* E o pagamento precisa ser localizavel por ele. */
    const encontrado = await pedidoRepository.buscarPagamentoPorIdentificador(
      rows[0].identificador_externo,
    );

    expect(encontrado).not.toBeNull();
    expect(encontrado.status).toBe('APROVADO');
  });

  /*
   * Nenhum dado de cartao pode chegar ao banco. A tabela nao tem coluna
   * para isso, e este teste confirma que a ausencia e real.
   */
  test('nao existe coluna de dado de cartao em pagamentos', async () => {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'pagamentos'
    `);

    const colunas = rows.map((r) => r.column_name);

    for (const proibida of ['numero_cartao', 'cvv', 'validade', 'cartao', 'senha']) {
      expect(colunas).not.toContain(proibida);
    }
  });

  test('o resumo do gateway nao guarda payload sensivel', async () => {
    await encherCarrinho([{ produto_id: idProduto, quantidade: 1 }]);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    const { rows } = await pool.query('SELECT resumo_gateway FROM pagamentos');
    const resumo = rows[0].resumo_gateway;

    expect(resumo).toHaveProperty('gateway');
    expect(JSON.stringify(resumo)).not.toMatch(/card|cartao|cvv|senha/i);
  });
});

/* ---------------------------------------------------------------- */
/* Multi-agricultor                                                  */
/* ---------------------------------------------------------------- */

describe('pedido multi-agricultor', () => {
  let idProdutoB;

  beforeEach(async () => {
    const { rows: u } = await pool.query(`
      INSERT INTO usuarios (nome, email, senha_hash, tipo)
      VALUES ('Produtor B', 'pb@teste.local', '$2b$12$hash', 'agricultor')
      RETURNING id
    `);
    const { rows: agri } = await pool.query(
      `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado)
       VALUES ($1, 'Fazenda B', 'Recife', 'PE') RETURNING id`,
      [u[0].id],
    );
    const { rows: cat } = await pool.query('SELECT id FROM categorias LIMIT 1');

    const { rows: p } = await pool.query(
      `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque)
       VALUES ($1, $2, 'Ovos', 12.00, 30) RETURNING id`,
      [agri[0].id, cat[0].id],
    );

    idProdutoB = p[0].id;
  });

  test('um pedido pode conter produtos de produtores diferentes', async () => {
    await encherCarrinho([
      { produto_id: idProduto, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 2 },
    ]);

    const resposta = await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    expect(await contar('pedido_itens')).toBe(2);

    /* 8.50 + 12.00 x 2 = 32.50 */
    expect(resposta.body.dados.pedido.valor_produtos).toBe(32.5);
  });

  /*
   * Cada item guarda o SEU agricultor. E o que permite o produtor A
   * mexer so nos itens dele depois (FASE 12).
   */
  test('cada item guarda o agricultor dono', async () => {
    await encherCarrinho([
      { produto_id: idProduto, quantidade: 1 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    const { rows } = await pool.query(
      `SELECT pi.produto_id, a.nome_fazenda
         FROM pedido_itens pi JOIN agricultores a ON a.id = pi.agricultor_id
        ORDER BY pi.produto_id`,
    );

    const porProduto = Object.fromEntries(
      rows.map((r) => [String(r.produto_id), r.nome_fazenda]),
    );

    expect(porProduto[String(idProduto)]).toBe('Fazenda A');
    expect(porProduto[String(idProdutoB)]).toBe('Fazenda B');
  });

  test('baixa o estoque dos dois produtores', async () => {
    await encherCarrinho([
      { produto_id: idProduto, quantidade: 3 },
      { produto_id: idProdutoB, quantidade: 4 },
    ]);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(201);

    const { rows } = await pool.query(
      'SELECT id, estoque FROM produtos WHERE id = ANY($1)',
      [[idProduto, idProdutoB]],
    );

    expect(rows.find((r) => String(r.id) === String(idProduto)).estoque).toBe(97);
    expect(rows.find((r) => String(r.id) === String(idProdutoB)).estoque).toBe(26);
  });

  /*
   * Se o segundo produtor nao tem estoque, o pedido inteiro e desfeito -
   * inclusive a baixa ja feita no primeiro. Sem transacao, o produtor A
   * perderia estoque por um pedido que nunca existiu.
   */
  test('falha no produto do segundo produtor desfaz a baixa do primeiro', async () => {
    await encherCarrinho([
      { produto_id: idProduto, quantidade: 5 },
      { produto_id: idProdutoB, quantidade: 1 },
    ]);

    await ajustarEstoque(idProdutoB, 0);

    await finalizar({ endereco_id: idEndereco, metodo_pagamento: 'PIX' }).expect(422);

    const { rows } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [idProduto]);
    expect(rows[0].estoque).toBe(100);
    expect(await contar('pedidos')).toBe(0);
  });
});
