import request from 'supertest';
import app from '../../src/app.js';
import env from '../../src/config/env.js';
import { pool } from '../../src/database/pool.js';
import { limparDados, prepararSchema, criarCenarioMultiAgricultor } from '../helpers/banco.js';
import { gerarToken } from '../../src/utils/token.js';

/*
 * Testes de seguranca (requisito 30 do prompt).
 *
 * Este arquivo nao testa funcionalidade: testa o que o sistema RECUSA.
 * Cada caso corresponde a uma classe de falha do checklist de seguranca,
 * e todos sao testes negativos - o que importa e o status de erro e a
 * operacao nao ter efeito colateral.
 *
 * Diferente dos outros arquivos, aqui o cenario e criado por SQL direto
 * (criarCenarioMultiAgricultor), porque o objetivo e controlar o estado
 * do banco com precisao para provar que ele NAO mudou.
 */

let cenario;

/** Token de um usuario do cenario, pelo id. */
async function tokenDe(usuarioId) {
  const { rows } = await pool.query(
    'SELECT id, tipo FROM usuarios WHERE id = $1',
    [usuarioId],
  );
  return gerarToken(rows[0]);
}

/** Le o estoque atual de um produto. */
async function estoqueDe(produtoId) {
  const { rows } = await pool.query('SELECT estoque FROM produtos WHERE id = $1', [produtoId]);
  return rows[0].estoque;
}

beforeAll(async () => {
  await prepararSchema();
});

beforeEach(async () => {
  await limparDados();
  cenario = await criarCenarioMultiAgricultor();
});

afterAll(async () => {
  await pool.end();
});

describe('SQL injection', () => {
  /*
   * O repositorio sempre usa queries parametrizadas ($1, $2). Estes testes
   * provam que o valor do usuario NUNCA e interpretado como SQL: se fosse
   * concatenado, o DROP TABLE abaixo derrubaria o schema e o teste
   * seguinte falharia ao consultar qualquer coisa.
   */
  test('nome de busca com aspas e comentario nao quebra a query', async () => {
    const resposta = await request(app)
      .get('/api/v1/produtos')
      .query({ busca: "'; DROP TABLE produtos; --" });

    expect(resposta.status).toBe(200);
    expect(resposta.body.sucesso).toBe(true);
    expect(resposta.body.dados).toHaveLength(0);
  });

  test('a tabela de produtos continua existindo apos a tentativa', async () => {
    await request(app)
      .get('/api/v1/produtos')
      .query({ busca: "'; DROP TABLE produtos; --" });

    const { rows } = await pool.query(
      "SELECT to_regclass('public.produtos') AS tabela",
    );
    expect(rows[0].tabela).toBe('produtos');
    expect(await estoqueDe(cenario.produtoTomate.id)).toBe(100);
  });

  test('id nao numerico na rota responde 400, nao erro de banco', async () => {
    const resposta = await request(app).get('/api/v1/produtos/1 OR 1=1');

    expect(resposta.status).toBe(400);
    // A validacao da rota barra antes do banco: o codigo e de dados
    // invalidos, e nao o ID_INVALIDO que o PostgreSQL produziria.
    expect(['ID_INVALIDO', 'DADOS_INVALIDOS']).toContain(resposta.body.erro.codigo);
  });

  test('tentativa de UNION no filtro de cidade nao vaza de outra tabela', async () => {
    const resposta = await request(app)
      .get('/api/v1/produtos')
      .query({ cidade: "Campinas' UNION SELECT senha_hash FROM usuarios --" });

    expect(resposta.status).toBe(200);
    // Se o UNION tivesse passado, viriam linhas com senha_hash.
    expect(JSON.stringify(resposta.body)).not.toContain('$2b$');
  });
});

describe('senhas', () => {
  test('o cadastro nunca devolve a senha nem o hash', async () => {
    const resposta = await request(app).post('/api/v1/auth/register').send({
      nome: 'Novo Cliente',
      email: 'novo@teste.local',
      senha: 'SenhaSegura1',
      tipo: 'cliente',
    });

    expect(resposta.status).toBe(201);
    const corpo = JSON.stringify(resposta.body);
    expect(corpo).not.toContain('SenhaSegura1');
    expect(corpo).not.toContain('senha_hash');
    expect(resposta.body.dados.usuario).not.toHaveProperty('senha_hash');
  });

  test('o banco guarda hash bcrypt, nunca a senha em texto puro', async () => {
    await request(app).post('/api/v1/auth/register').send({
      nome: 'Novo Cliente',
      email: 'novo@teste.local',
      senha: 'SenhaSegura1',
      tipo: 'cliente',
    });

    const { rows } = await pool.query(
      'SELECT senha_hash FROM usuarios WHERE email = $1',
      ['novo@teste.local'],
    );

    expect(rows[0].senha_hash).not.toBe('SenhaSegura1');
    expect(rows[0].senha_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  test('o login nao revela se o e-mail existe', async () => {
    const resposta = await request(app).post('/api/v1/auth/login').send({
      email: 'naoexiste@teste.local',
      senha: 'SenhaSegura1',
    });

    expect(resposta.status).toBe(401);
    // Mensagem unica para "e-mail nao existe" e "senha errada": distinguir
    // as duas permitiria enumerar contas cadastradas.
    expect(resposta.body.erro.mensagem).toBe('E-mail ou senha incorretos.');
  });

  test('o JWT nao carrega senha, hash nem dados pessoais', async () => {
    const resposta = await request(app).post('/api/v1/auth/register').send({
      nome: 'Novo Cliente',
      email: 'novo@teste.local',
      senha: 'SenhaSegura1',
      tipo: 'cliente',
      telefone: '19999998888',
    });

    // O payload e a parte do meio do token; o JWT e assinado, nao cifrado.
    const payload = JSON.parse(
      Buffer.from(resposta.body.dados.token.split('.')[1], 'base64url').toString('utf8'),
    );

    expect(Object.keys(payload).sort()).toEqual(
      expect.arrayContaining(['sub', 'tipo']),
    );
    expect(payload).not.toHaveProperty('senha');
    expect(payload).not.toHaveProperty('senha_hash');
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('telefone');
  });
});

describe('exposicao de informacoes', () => {
  test('erro de validacao nao devolve stack trace', async () => {
    const resposta = await request(app)
      .post('/api/v1/auth/register')
      .send({ nome: 'x' });

    const corpo = JSON.stringify(resposta.body);
    expect(corpo).not.toContain('at ');
    expect(corpo).not.toContain('.js:');
    expect(resposta.body.erro).not.toHaveProperty('stack');
  });

  test('rota inexistente responde 404 sem detalhe interno', async () => {
    const resposta = await request(app).get('/api/v1/nao-existe');

    expect(resposta.status).toBe(404);
    expect(JSON.stringify(resposta.body)).not.toContain('.js:');
  });

  test('a listagem publica de produtos nao vaza dados do produtor logado', async () => {
    const resposta = await request(app).get('/api/v1/produtos');

    const corpo = JSON.stringify(resposta.body);
    expect(corpo).not.toContain('senha_hash');
    expect(corpo).not.toContain('$2b$');
  });
});

describe('IDOR - acesso a recurso de outro usuario', () => {
  test('cliente A nao acessa o pedido do cliente B', async () => {
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo)
       VALUES ('Intruso', 'intruso@teste.local', '$2b$12$hash', 'cliente')
       RETURNING id`,
    );
    const tokenIntruso = await tokenDe(rows[0].id);

    const resposta = await request(app)
      .get(`/api/v1/pedidos/${cenario.idPedido}`)
      .set('Authorization', `Bearer ${tokenIntruso}`);

    // 404 e nao 403: um 403 confirmaria que o pedido existe.
    expect(resposta.status).toBe(404);
  });

  test('agricultor A nao altera produto do agricultor B', async () => {
    const tokenA = await tokenDe(cenario.idUsuarioA);

    const resposta = await request(app)
      .put(`/api/v1/produtos/${cenario.produtoMorango.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nome: 'Morango Roubado', preco: 0.01 });

    expect([403, 404]).toContain(resposta.status);

    const { rows } = await pool.query(
      'SELECT nome, preco FROM produtos WHERE id = $1',
      [cenario.produtoMorango.id],
    );
    expect(rows[0].nome).toBe('Morango');
    expect(rows[0].preco).toBe(20);
  });

  test('agricultor A nao altera o item do pedido que e do agricultor B', async () => {
    const tokenA = await tokenDe(cenario.idUsuarioA);

    /*
     * O item e localizado por (itemId, agricultorId do token). Como o item
     * B nao pertence a A, o WHERE nao encontra linha e a resposta e 404 -
     * um 403 confirmaria que aquele item existe.
     */
    const resposta = await request(app)
      .patch(`/api/v1/pedidos/${cenario.idPedido}/itens/${cenario.itemB.id}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'PROCESSANDO' });

    expect(resposta.status).toBe(404);

    const { rows } = await pool.query(
      'SELECT status FROM pedido_itens WHERE id = $1',
      [cenario.itemB.id],
    );
    expect(rows[0].status).toBe('PENDENTE');
  });

  test('cliente nao acessa o endereco de outro cliente', async () => {
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo)
       VALUES ('Dono', 'dono@teste.local', '$2b$12$hash', 'cliente')
       RETURNING id`,
    );
    const { rows: enderecos } = await pool.query(
      `INSERT INTO enderecos
         (consumidor_id, nome_destinatario, cep, rua, numero, bairro, cidade, estado)
       VALUES ($1, 'Dono', '13010100', 'Rua Um', '1', 'Centro', 'Campinas', 'SP')
       RETURNING id`,
      [rows[0].id],
    );

    const tokenIntruso = await tokenDe(cenario.idCliente);

    // Corpo COMPLETO: o PUT usa o mesmo schema do cadastro, entao um corpo
    // parcial pararia na validacao (400) e nunca chegaria na checagem de
    // propriedade - que e justamente o que este teste quer exercitar.
    const resposta = await request(app)
      .put(`/api/v1/enderecos/${enderecos[0].id}`)
      .set('Authorization', `Bearer ${tokenIntruso}`)
      .send({
        nome_destinatario: 'Invadido',
        cep: '13010100',
        rua: 'Rua Um',
        numero: '1',
        bairro: 'Centro',
        cidade: 'Campinas',
        estado: 'SP',
      });

    expect([403, 404]).toContain(resposta.status);

    const { rows: depois } = await pool.query(
      'SELECT nome_destinatario FROM enderecos WHERE id = $1',
      [enderecos[0].id],
    );
    expect(depois[0].nome_destinatario).toBe('Dono');
  });
});

describe('autorizacao por papel (acesso vertical)', () => {
  test('cliente nao cadastra produto', async () => {
    const token = await tokenDe(cenario.idCliente);

    const resposta = await request(app)
      .post('/api/v1/produtos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'Produto Pirata',
        preco: 10,
        estoque: 1,
        categoria_id: cenario.idCategoria,
      });

    expect(resposta.status).toBe(403);

    const { rows } = await pool.query(
      "SELECT count(*)::int AS total FROM produtos WHERE nome = 'Produto Pirata'",
    );
    expect(rows[0].total).toBe(0);
  });

  test('cliente nao gerencia categorias', async () => {
    const token = await tokenDe(cenario.idCliente);

    // A criacao de categoria vive na area administrativa, nao em
    // /categorias (que e somente leitura).
    const resposta = await request(app)
      .post('/api/v1/admin/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Categoria Pirata' });

    expect(resposta.status).toBe(403);

    const { rows } = await pool.query(
      "SELECT count(*)::int AS total FROM categorias WHERE nome = 'Categoria Pirata'",
    );
    expect(rows[0].total).toBe(0);
  });

  test('agricultor nao acessa area administrativa', async () => {
    const token = await tokenDe(cenario.idUsuarioA);

    const resposta = await request(app)
      .get('/api/v1/admin/categorias')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(403);
  });

  test('cliente nao altera o status de um item do proprio pedido', async () => {
    const token = await tokenDe(cenario.idCliente);

    const resposta = await request(app)
      .patch(`/api/v1/pedidos/${cenario.idPedido}/itens/${cenario.itemA.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ENTREGUE' });

    expect(resposta.status).toBe(403);
  });
});

describe('manipulacao de preco e quantidade', () => {
  test('o preco do corpo do checkout e ignorado', async () => {
    const token = await tokenDe(cenario.idCliente);

    // Endereco valido para o cliente do cenario.
    const { rows: enderecos } = await pool.query(
      `INSERT INTO enderecos
         (consumidor_id, nome_destinatario, cep, rua, numero, bairro, cidade, estado)
       VALUES ($1, 'Cliente', '13010100', 'Rua Um', '1', 'Centro', 'Campinas', 'SP')
       RETURNING id`,
      [cenario.idCliente],
    );

    await request(app)
      .post('/api/v1/carrinho/itens')
      .set('Authorization', `Bearer ${token}`)
      .send({ produto_id: cenario.produtoTomate.id, quantidade: 2 });

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        endereco_id: enderecos[0].id,
        metodo_pagamento: 'PIX',
        // Campos inventados: o schema os descarta.
        valor_produtos: 0.01,
        valor_total: 0.01,
        valor_frete: 0,
      });

    expect(resposta.status).toBe(201);

    // 2 x 8.50 = 17.00, valor oficial do banco.
    expect(resposta.body.dados.pedido.valor_produtos).toBe(17);
  });

  test('nao aceita quantidade acima do estoque', async () => {
    const token = await tokenDe(cenario.idCliente);

    const resposta = await request(app)
      .post('/api/v1/carrinho/itens')
      .set('Authorization', `Bearer ${token}`)
      .send({ produto_id: cenario.produtoTomate.id, quantidade: 100000 });

    expect([400, 422]).toContain(resposta.status);
    expect(await estoqueDe(cenario.produtoTomate.id)).toBe(100);
  });

  test('nao aceita quantidade zero ou negativa', async () => {
    const token = await tokenDe(cenario.idCliente);

    for (const quantidade of [0, -5]) {
      const resposta = await request(app)
        .post('/api/v1/carrinho/itens')
        .set('Authorization', `Bearer ${token}`)
        .send({ produto_id: cenario.produtoTomate.id, quantidade });

      expect(resposta.status).toBe(400);
    }
  });

  test('nao aceita preco negativo ou zero na criacao de produto', async () => {
    const token = await tokenDe(cenario.idUsuarioA);

    for (const preco of [0, -10]) {
      const resposta = await request(app)
        .post('/api/v1/produtos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          nome: 'Produto Invalido',
          preco,
          estoque: 5,
          categoria_id: cenario.idCategoria,
        });

      expect(resposta.status).toBe(400);
    }
  });
});

describe('estoque', () => {
  test('checkout nao deixa estoque negativo', async () => {
    const token = await tokenDe(cenario.idCliente);

    const { rows: enderecos } = await pool.query(
      `INSERT INTO enderecos
         (consumidor_id, nome_destinatario, cep, rua, numero, bairro, cidade, estado)
       VALUES ($1, 'Cliente', '13010100', 'Rua Um', '1', 'Centro', 'Campinas', 'SP')
       RETURNING id`,
      [cenario.idCliente],
    );

    await request(app)
      .post('/api/v1/carrinho/itens')
      .set('Authorization', `Bearer ${token}`)
      .send({ produto_id: cenario.produtoTomate.id, quantidade: 100 });

    // Outro consumidor compra tudo antes do checkout.
    await pool.query('UPDATE produtos SET estoque = 0 WHERE id = $1', [
      cenario.produtoTomate.id,
    ]);

    const { rows: antes } = await pool.query(
      'SELECT count(*)::int AS total FROM pedidos WHERE consumidor_id = $1',
      [cenario.idCliente],
    );

    const resposta = await request(app)
      .post('/api/v1/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ endereco_id: enderecos[0].id, metodo_pagamento: 'PIX' });

    expect(resposta.status).toBe(422);
    expect(await estoqueDe(cenario.produtoTomate.id)).toBe(0);

    /*
     * O cenario do teste JA tem um pedido para este cliente, entao nao
     * basta contar pedidos: o que prova a atomicidade e a contagem nao ter
     * mudado. Se a transacao tivesse gravado o pedido e so depois falhado
     * no estoque, o numero teria subido.
     */
    const { rows: depois } = await pool.query(
      'SELECT count(*)::int AS total FROM pedidos WHERE consumidor_id = $1',
      [cenario.idCliente],
    );
    expect(depois[0].total).toBe(antes[0].total);
  });

  test('add ao carrinho de produto inativo e recusado', async () => {
    const token = await tokenDe(cenario.idCliente);

    await pool.query('UPDATE produtos SET ativo = false WHERE id = $1', [
      cenario.produtoTomate.id,
    ]);

    const resposta = await request(app)
      .post('/api/v1/carrinho/itens')
      .set('Authorization', `Bearer ${token}`)
      .send({ produto_id: cenario.produtoTomate.id, quantidade: 1 });

    expect([404, 422]).toContain(resposta.status);
  });
});

describe('ID inexistente e status invalido', () => {
  test('produto inexistente responde 404', async () => {
    const resposta = await request(app).get('/api/v1/produtos/999999');
    expect(resposta.status).toBe(404);
  });

  test('pedido inexistente responde 404 para o dono do token', async () => {
    const token = await tokenDe(cenario.idCliente);

    const resposta = await request(app)
      .get('/api/v1/pedidos/999999')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(404);
  });

  test('status invalido de item e recusado com 400', async () => {
    const token = await tokenDe(cenario.idUsuarioA);

    const resposta = await request(app)
      .patch(`/api/v1/pedidos/${cenario.idPedido}/itens/${cenario.itemA.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'STATUS_INVENTADO' });

    expect(resposta.status).toBe(400);

    const { rows } = await pool.query(
      'SELECT status FROM pedido_itens WHERE id = $1',
      [cenario.itemA.id],
    );
    expect(rows[0].status).toBe('PENDENTE');
  });

  test('transicao de status fora da regra e recusada', async () => {
    const token = await tokenDe(cenario.idUsuarioA);

    // PENDENTE -> ENTREGUE sem passar por PROCESSANDO/ENVIADO.
    const resposta = await request(app)
      .patch(`/api/v1/pedidos/${cenario.idPedido}/itens/${cenario.itemA.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ENTREGUE' });

    expect([400, 422]).toContain(resposta.status);
  });
});

describe('CORS e cabecalhos de seguranca', () => {
  test('origem nao autorizada e bloqueada com 403', async () => {
    const resposta = await request(app)
      .get('/api/v1/produtos')
      .set('Origin', 'https://site-malicioso.example');

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('CORS_BLOQUEADO');
  });

  test('origem autorizada nao recebe o cabecalho de bloqueio', async () => {
    const origem = env.corsOrigens[0];

    const resposta = await request(app)
      .get('/api/v1/produtos')
      .set('Origin', origem);

    expect(resposta.status).toBe(200);
    expect(resposta.headers['access-control-allow-origin']).toBe(origem);
  });

  test('a API nao devolve o cabecalho x-powered-by', async () => {
    const resposta = await request(app).get('/health');
    expect(resposta.headers).not.toHaveProperty('x-powered-by');
  });

  test('respostas trazem os cabecalhos do Helmet', async () => {
    const resposta = await request(app).get('/health');

    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers).toHaveProperty('x-frame-options');
  });
});

describe('escalacao de privilegio', () => {
  test('cadastro publico nao aceita tipo administrador', async () => {
    const resposta = await request(app).post('/api/v1/auth/register').send({
      nome: 'Quer Ser Admin',
      email: 'esperto@teste.local',
      senha: 'SenhaSegura1',
      tipo: 'administrador',
    });

    expect(resposta.status).toBe(400);

    const { rows } = await pool.query(
      "SELECT count(*)::int AS total FROM usuarios WHERE email = 'esperto@teste.local'",
    );
    expect(rows[0].total).toBe(0);
  });

  test('atualizar o proprio perfil nao muda o tipo', async () => {
    const token = await tokenDe(cenario.idCliente);

    await request(app)
      .put('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Cliente Promovido', tipo: 'administrador' });

    // O campo `tipo` nao esta no schema, entao o Zod o descarta: a
    // requisicao pode ate ser aceita, mas o papel no banco nao muda.
    const { rows } = await pool.query('SELECT tipo FROM usuarios WHERE id = $1', [
      cenario.idCliente,
    ]);
    expect(rows[0].tipo).toBe('cliente');
  });

  test('agricultor nao cria produto em nome de outro agricultor', async () => {
    const tokenA = await tokenDe(cenario.idUsuarioA);

    const resposta = await request(app)
      .post('/api/v1/produtos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        nome: 'Produto Plantado',
        preco: 10,
        estoque: 5,
        unidade: 'kg',
        categoria_id: cenario.idCategoria,
        // Tentativa de atribuir o produto ao produtor B.
        agricultor_id: cenario.idAgricultorB,
      });

    expect(resposta.status).toBe(201);

    // O dono e quem esta no token, nunca o id do corpo.
    const { rows } = await pool.query(
      "SELECT agricultor_id FROM produtos WHERE nome = 'Produto Plantado'",
    );
    expect(rows[0].agricultor_id).toBe(cenario.idAgricultorA);
  });
});

describe('autenticacao', () => {
  test('token ausente e recusado nas rotas protegidas', async () => {
    const rotas = [
      ['get', '/api/v1/usuarios/profile'],
      ['get', '/api/v1/carrinho'],
      ['get', '/api/v1/pedidos'],
      ['get', '/api/v1/produtos/meus'],
    ];

    for (const [metodo, rota] of rotas) {
      const resposta = await request(app)[metodo](rota);
      expect(resposta.status).toBe(401);
    }
  });

  test('token com assinatura invalida e recusado', async () => {
    const token = await tokenDe(cenario.idCliente);
    const adulterado = `${token.slice(0, -4)}aaaa`;

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${adulterado}`);

    expect(resposta.status).toBe(401);
  });

  test('usuario bloqueado perde o acesso mesmo com token valido', async () => {
    const token = await tokenDe(cenario.idCliente);

    // O token continua valido; a decisao vem do banco.
    await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [
      cenario.idCliente,
    ]);

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(403);
  });

  test('token de usuario removido e recusado', async () => {
    const token = await tokenDe(cenario.idCliente);

    await pool.query('DELETE FROM pedido_itens WHERE pedido_id = $1', [cenario.idPedido]);
    await pool.query('DELETE FROM pedidos WHERE id = $1', [cenario.idPedido]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [cenario.idCliente]);

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(401);
  });
});