import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { prepararSchema, limparDados } from '../helpers/banco.js';
import { gerarSlug } from '../../src/services/categoriaService.js';
import { gerarToken } from '../../src/utils/token.js';

/*
 * Testes do modulo de categorias (FASE 7).
 *
 * Duas frentes:
 *   1. o CRUD administrativo e as regras de negocio (slug, unicidade,
 *      desativacao logica);
 *   2. a autorizacao - quem pode escrever, e o que um visitante ou um
 *      cliente conseguem fazer.
 *
 * Como categoria e dado de referencia, o teste de autorizacao aqui e tao
 * importante quanto o funcional: uma falha permitiria a qualquer usuario
 * reescrever o catalogo inteiro.
 */

const ROTA_PUBLICA = '/api/v1/categorias';
const ROTA_ADMIN = '/api/v1/admin/categorias';

let tokenAdmin;
let tokenCliente;
let tokenAgricultor;
let idAdmin;

beforeAll(async () => {
  await prepararSchema();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparDados();

  // Cria um usuario de cada tipo e gera o token real (assinado com o
  // segredo da aplicacao), para exercitar o checkJwt de verdade.
  const { rows } = await pool.query(`
    INSERT INTO usuarios (nome, email, senha_hash, tipo) VALUES
      ('Admin',    'admin@teste.local',    '$2b$12$hash', 'administrador'),
      ('Cliente',  'cliente@teste.local',  '$2b$12$hash', 'cliente'),
      ('Produtor', 'produtor@teste.local', '$2b$12$hash', 'agricultor')
    RETURNING id, tipo, email
  `);

  const porEmail = (email) => rows.find((u) => u.email === email);
  idAdmin = porEmail('admin@teste.local').id;

  tokenAdmin = gerarToken(porEmail('admin@teste.local'));
  tokenCliente = gerarToken(porEmail('cliente@teste.local'));
  tokenAgricultor = gerarToken(porEmail('produtor@teste.local'));
});

/* Cria uma categoria direto no banco e devolve o registro. */
async function criarCategoriaDireto(nome, slug, { ativo = true, descricao = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO categorias (nome, slug, descricao, ativo)
     VALUES ($1, $2, $3, $4) RETURNING id, nome, slug, ativo`,
    [nome, slug, descricao, ativo],
  );
  return rows[0];
}

describe('gerarSlug', () => {
  /*
   * Testes unitarios de uma funcao pura. O slug precisa satisfazer o
   * CHECK do banco (^[a-z0-9]+(-[a-z0-9]+)*$), entao cada caso aqui
   * verifica um formato que o banco recusaria se a funcao errasse.
   */
  test.each([
    ['Frutas', 'frutas'],
    ['Graos', 'graos'],
    ['Grãos', 'graos'],
    ['Verduras e Legumes', 'verduras-e-legumes'],
    ['Ovos  Caipiras', 'ovos-caipiras'],
    ['  Espacos  ', 'espacos'],
    ['Café & Cia', 'cafe-cia'],
    ['Açaí', 'acai'],
    ['123', '123'],
  ])('converte "%s" em "%s"', (entrada, esperado) => {
    expect(gerarSlug(entrada)).toBe(esperado);
  });

  test('nao produz hifen no inicio nem no fim', () => {
    expect(gerarSlug('  -Frutas-  ')).toBe('frutas');
  });

  test('nao produz hifens repetidos', () => {
    expect(gerarSlug('Frutas---Legumes')).toBe('frutas-legumes');
  });

  test('o slug gerado satisfaz o CHECK do banco', () => {
    const formatoValido = /^[a-z0-9]+(-[a-z0-9]+)*$/;

    for (const entrada of ['Frutas', 'Grãos & Cereais', 'Açaí 100%', 'Café']) {
      expect(gerarSlug(entrada)).toMatch(formatoValido);
    }
  });
});

describe('GET /categorias - listagem publica', () => {
  test('lista categorias ativas sem exigir autenticacao', async () => {
    await criarCategoriaDireto('Frutas', 'frutas');
    await criarCategoriaDireto('Legumes', 'legumes');

    const resposta = await request(app).get(ROTA_PUBLICA).expect(200);

    expect(resposta.body.dados).toHaveLength(2);
    expect(resposta.body.paginacao.total).toBe(2);
  });

  test('nao expoe categoria desativada', async () => {
    await criarCategoriaDireto('Frutas', 'frutas');
    await criarCategoriaDireto('Antiga', 'antiga', { ativo: false });

    const resposta = await request(app).get(ROTA_PUBLICA).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome).toBe('Frutas');
  });

  /*
   * Teste de seguranca: o schema da rota publica nao declara
   * `incluir_inativas`, entao o Zod descarta o parametro. Sem essa
   * garantia, um visitante poderia listar categorias desativadas e
   * descobrir o que a plataforma retirou do ar.
   */
  test('visitante nao consegue incluir inativas pela rota publica', async () => {
    await criarCategoriaDireto('Ativa', 'ativa');
    await criarCategoriaDireto('Desativada', 'desativada', { ativo: false });

    const resposta = await request(app)
      .get(`${ROTA_PUBLICA}?incluir_inativas=true`)
      .expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome).toBe('Ativa');
  });

  test('ordena por nome', async () => {
    await criarCategoriaDireto('Verduras', 'verduras');
    await criarCategoriaDireto('Frutas', 'frutas');

    const resposta = await request(app).get(ROTA_PUBLICA).expect(200);

    expect(resposta.body.dados.map((c) => c.nome)).toEqual(['Frutas', 'Verduras']);
  });

  test('inclui a contagem de produtos ativos por categoria', async () => {
    const { id: categoriaId } = await criarCategoriaDireto('Frutas', 'frutas');

    const { rows: usuarios } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo)
       VALUES ('Prod', 'p@teste.local', '$2b$12$hash', 'agricultor') RETURNING id`,
    );
    const { rows: agricultores } = await pool.query(
      `INSERT INTO agricultores (usuario_id, nome_fazenda)
       VALUES ($1, 'Fazenda') RETURNING id`,
      [usuarios[0].id],
    );

    await pool.query(
      `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque, ativo)
       VALUES ($1, $2, 'Ativo', 10, 5, TRUE), ($1, $2, 'Inativo', 10, 5, FALSE)`,
      [agricultores[0].id, categoriaId],
    );

    const resposta = await request(app).get(ROTA_PUBLICA).expect(200);

    // So o produto ativo conta: o filtro do marketplace nao deve sugerir
    // que ha produto disponivel quando todos estao desativados.
    expect(resposta.body.dados[0].total_produtos).toBe(1);
  });

  test('categoria sem produto aparece com contagem zero', async () => {
    await criarCategoriaDireto('Frutas', 'frutas');

    const resposta = await request(app).get(ROTA_PUBLICA).expect(200);

    expect(resposta.body.dados[0].total_produtos).toBe(0);
  });
});

describe('GET /categorias/:id - detalhe publico', () => {
  test('busca por id numerico', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    const resposta = await request(app).get(`${ROTA_PUBLICA}/${categoria.id}`).expect(200);

    expect(resposta.body.dados.nome).toBe('Frutas');
  });

  test('busca por slug', async () => {
    await criarCategoriaDireto('Verduras e Legumes', 'verduras-e-legumes');

    const resposta = await request(app).get(`${ROTA_PUBLICA}/verduras-e-legumes`).expect(200);

    expect(resposta.body.dados.nome).toBe('Verduras e Legumes');
  });

  test('devolve 404 para categoria inexistente', async () => {
    await request(app).get(`${ROTA_PUBLICA}/999999`).expect(404);
  });

  test('devolve 404 para slug inexistente', async () => {
    await request(app).get(`${ROTA_PUBLICA}/nao-existe`).expect(404);
  });

  test('devolve 404 para categoria desativada', async () => {
    const categoria = await criarCategoriaDireto('Antiga', 'antiga', { ativo: false });

    await request(app).get(`${ROTA_PUBLICA}/${categoria.id}`).expect(404);
  });

  test('visitante nao ve desativada nem com o parametro na query', async () => {
    const categoria = await criarCategoriaDireto('Antiga', 'antiga', { ativo: false });

    // O schema publico descarta `incluir_inativa`; a rota devolve 404.
    await request(app)
      .get(`${ROTA_PUBLICA}/${categoria.id}?incluir_inativa=true`)
      .expect(404);
  });

  test('rejeita slug com formato invalido', async () => {
    // O parametro e validado na borda, e nao consultado no banco.
    await request(app).get(`${ROTA_PUBLICA}/slug%20com%20espaco`).expect(400);
  });
});

describe('Autorizacao das rotas administrativas', () => {
  test('sem token devolve 401', async () => {
    await request(app).get(ROTA_ADMIN).expect(401);
  });

  test('cliente nao pode listar como admin', async () => {
    await request(app)
      .get(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenCliente}`)
      .expect(403);
  });

  test('agricultor nao pode listar como admin', async () => {
    await request(app)
      .get(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenAgricultor}`)
      .expect(403);
  });

  /*
   * O teste negativo mais importante do modulo: um cliente tentando criar
   * categoria. Se isso passasse, qualquer conta poderia reescrever o
   * catalogo do marketplace inteiro.
   */
  test('cliente nao pode criar categoria', async () => {
    await request(app)
      .post(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send({ nome: 'Invasao' })
      .expect(403);

    const { rows } = await pool.query('SELECT count(*)::int AS total FROM categorias');
    expect(rows[0].total).toBe(0);
  });

  test('agricultor nao pode criar categoria', async () => {
    await request(app)
      .post(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenAgricultor}`)
      .send({ nome: 'Invasao' })
      .expect(403);
  });

  test('cliente nao pode editar categoria', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    await request(app)
      .put(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send({ nome: 'Alterada' })
      .expect(403);

    const { rows } = await pool.query('SELECT nome FROM categorias WHERE id = $1', [categoria.id]);
    expect(rows[0].nome).toBe('Frutas');
  });

  test('cliente nao pode desativar categoria', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    await request(app)
      .delete(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenCliente}`)
      .expect(403);

    const { rows } = await pool.query('SELECT ativo FROM categorias WHERE id = $1', [categoria.id]);
    expect(rows[0].ativo).toBe(true);
  });

  test('autorizacao e checada antes da validacao do corpo', async () => {
    // Corpo invalido de um cliente deve dar 403, nao 400: a mensagem de
    // validacao sugeriria que basta corrigir o payload para conseguir.
    const resposta = await request(app)
      .post(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenCliente}`)
      .send({})
      .expect(403);

    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });
});

describe('POST /admin/categorias - criacao', () => {
  test('admin cria categoria e o slug e gerado do nome', async () => {
    const resposta = await request(app)
      .post(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'Grãos e Cereais', descricao: 'Arroz, feijão e milho.' })
      .expect(201);

    expect(resposta.body.dados.nome).toBe('Grãos e Cereais');
    expect(resposta.body.dados.slug).toBe('graos-e-cereais');
    expect(resposta.body.dados.ativo).toBe(true);
  });

  /*
   * Quando o nome difere mas o slug derivado colide, o sufixo numerico
   * entra. E o caso de "Graos" e "Grãos": sao nomes diferentes (entao a
   * checagem de nome duplicado nao pega) mas o slug dos dois e "graos".
   *
   * Sem o sufixo, o INSERT violaria o indice unico do slug e o admin
   * receberia um erro de banco incompreensivel no lugar de uma categoria
   * criada.
   */
  test('gera slug com sufixo numerico quando o slug colide', async () => {
    await criarCategoriaDireto('Graos', 'graos');

    const resposta = await request(app)
      .post(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'Grãos' })
      .expect(201);

    expect(resposta.body.dados.nome).toBe('Grãos');
    expect(resposta.body.dados.slug).toBe('graos-2');
  });

  test('recusa nome duplicado ignorando maiuscula', async () => {
    await criarCategoriaDireto('Frutas', 'frutas');

    const resposta = await request(app)
      .post(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'FRUTAS' })
      .expect(409);

    expect(resposta.body.erro.codigo).toBe('CONFLITO');
  });

  test('recusa nome curto demais', async () => {
    await request(app)
      .post(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'A' })
      .expect(400);
  });

  test('ignora slug enviado pelo cliente', async () => {
    const resposta = await request(app)
      .post(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'Frutas', slug: 'admin' })
      .expect(201);

    // O slug vem do nome, nunca do cliente: aceitar o slug permitiria
    // criar /categorias/admin, confundindo as rotas.
    expect(resposta.body.dados.slug).toBe('frutas');
  });

  test('admin pode criar categoria ja desativada', async () => {
    const resposta = await request(app)
      .post(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'Sazonal', ativo: false })
      .expect(201);

    expect(resposta.body.dados.ativo).toBe(false);
  });
});

describe('PUT /admin/categorias/:id - atualizacao', () => {
  test('admin atualiza nome e o slug acompanha', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    const resposta = await request(app)
      .put(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'Frutas Frescas' })
      .expect(200);

    expect(resposta.body.dados.nome).toBe('Frutas Frescas');
    expect(resposta.body.dados.slug).toBe('frutas-frescas');
  });

  /*
   * Regra de negocio: o slug so muda quando o nome muda. Se fosse
   * regerado a cada edicao, corrigir a descricao quebraria as URLs
   * /categorias/frutas que os clientes ja salvaram.
   */
  test('slug permanece quando so a descricao muda', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    const resposta = await request(app)
      .put(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ descricao: 'Nova descricao.' })
      .expect(200);

    expect(resposta.body.dados.slug).toBe('frutas');
    expect(resposta.body.dados.descricao).toBe('Nova descricao.');
  });

  test('recusa renomear para um nome ja existente', async () => {
    await criarCategoriaDireto('Frutas', 'frutas');
    const legumes = await criarCategoriaDireto('Legumes', 'legumes');

    await request(app)
      .put(`${ROTA_ADMIN}/${legumes.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'Frutas' })
      .expect(409);
  });

  test('permite manter o proprio nome', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    await request(app)
      .put(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'Frutas', descricao: 'Atualizada.' })
      .expect(200);
  });

  test('recusa corpo vazio', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    await request(app)
      .put(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({})
      .expect(400);
  });

  test('devolve 404 para categoria inexistente', async () => {
    await request(app)
      .put(`${ROTA_ADMIN}/999999`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nome: 'Qualquer' })
      .expect(404);
  });
});

describe('DELETE /admin/categorias/:id - desativacao', () => {
  test('admin desativa categoria e informa produtos afetados', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    const { rows: usuarios } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo)
       VALUES ('Prod', 'p@teste.local', '$2b$12$hash', 'agricultor') RETURNING id`,
    );
    const { rows: agricultores } = await pool.query(
      `INSERT INTO agricultores (usuario_id, nome_fazenda) VALUES ($1, 'Fazenda Teste') RETURNING id`,
      [usuarios[0].id],
    );
    await pool.query(
      `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque)
       VALUES ($1, $2, 'Tomate', 10, 5), ($1, $2, 'Alface', 5, 5)`,
      [agricultores[0].id, categoria.id],
    );

    const resposta = await request(app)
      .delete(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(resposta.body.dados.ativo).toBe(false);
    expect(resposta.body.dados.produtos_afetados).toBe(2);

    const { rows } = await pool.query('SELECT ativo FROM categorias WHERE id = $1', [categoria.id]);
    expect(rows[0].ativo).toBe(false);
  });

  /*
   * Regra de negocio: desativar uma categoria esconde do marketplace
   * todos os produtos dela. Isso precisa ser verdade de fato, senao o
   * admin acharia que tirou um grupo de produtos do ar sem ter tirado.
   */
  test('desativar a categoria esconde os produtos da vitrine', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    const { rows: usuarios } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo)
       VALUES ('Prod', 'p@teste.local', '$2b$12$hash', 'agricultor') RETURNING id`,
    );
    const { rows: agricultores } = await pool.query(
      `INSERT INTO agricultores (usuario_id, nome_fazenda) VALUES ($1, 'Fazenda Teste') RETURNING id`,
      [usuarios[0].id],
    );
    await pool.query(
      `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque)
       VALUES ($1, $2, 'Tomate', 10, 5)`,
      [agricultores[0].id, categoria.id],
    );

    // Antes: o produto aparece na vitrine.
    const antes = await request(app)
      .get(`/api/v1/agricultores/${agricultores[0].id}/produtos`)
      .expect(200);
    expect(antes.body.dados).toHaveLength(1);

    await request(app)
      .delete(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    // Depois: o produto sumiu da vitrine, mesmo com p.ativo = true.
    const depois = await request(app)
      .get(`/api/v1/agricultores/${agricultores[0].id}/produtos`)
      .expect(200);
    expect(depois.body.dados).toHaveLength(0);

    // E a categoria nao aparece no filtro publico.
    const categorias = await request(app).get(ROTA_PUBLICA).expect(200);
    expect(categorias.body.dados).toHaveLength(0);
  });

  test('nao apaga o registro do banco (exclusao logica)', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    await request(app)
      .delete(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    const { rows } = await pool.query('SELECT id FROM categorias WHERE id = $1', [categoria.id]);
    expect(rows).toHaveLength(1);
  });

  test('desativar duas vezes devolve 422', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    await request(app)
      .delete(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    const resposta = await request(app)
      .delete(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('CATEGORIA_JA_DESATIVADA');
  });

  test('devolve 404 para categoria inexistente', async () => {
    await request(app)
      .delete(`${ROTA_ADMIN}/999999`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(404);
  });

  test('rejeita id nao numerico', async () => {
    await request(app)
      .delete(`${ROTA_ADMIN}/abc`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(400);
  });
});

describe('PATCH /admin/categorias/:id/ativar', () => {
  test('admin reativa categoria desativada', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas', { ativo: false });

    const resposta = await request(app)
      .patch(`${ROTA_ADMIN}/${categoria.id}/ativar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(resposta.body.dados.ativo).toBe(true);

    // E volta a aparecer na listagem publica.
    const publica = await request(app).get(ROTA_PUBLICA).expect(200);
    expect(publica.body.dados).toHaveLength(1);
  });

  test('ativar categoria ja ativa devolve 422', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas');

    const resposta = await request(app)
      .patch(`${ROTA_ADMIN}/${categoria.id}/ativar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(422);

    expect(resposta.body.erro.codigo).toBe('CATEGORIA_JA_ATIVA');
  });

  test('cliente nao pode reativar', async () => {
    const categoria = await criarCategoriaDireto('Frutas', 'frutas', { ativo: false });

    await request(app)
      .patch(`${ROTA_ADMIN}/${categoria.id}/ativar`)
      .set('Authorization', `Bearer ${tokenCliente}`)
      .expect(403);
  });
});

describe('GET /admin/categorias - listagem administrativa', () => {
  test('admin ve categorias ativas e inativas por padrao', async () => {
    await criarCategoriaDireto('Ativa', 'ativa');
    await criarCategoriaDireto('Inativa', 'inativa', { ativo: false });

    const resposta = await request(app)
      .get(ROTA_ADMIN)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(resposta.body.dados).toHaveLength(2);
  });

  test('admin pode filtrar somente ativas', async () => {
    await criarCategoriaDireto('Ativa', 'ativa');
    await criarCategoriaDireto('Inativa', 'inativa', { ativo: false });

    const resposta = await request(app)
      .get(`${ROTA_ADMIN}?incluir_inativas=false`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome).toBe('Ativa');
  });

  test('admin abre categoria desativada pelo detalhe', async () => {
    const categoria = await criarCategoriaDireto('Antiga', 'antiga', { ativo: false });

    const resposta = await request(app)
      .get(`${ROTA_ADMIN}/${categoria.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(resposta.body.dados.nome).toBe('Antiga');
    expect(resposta.body.dados.ativo).toBe(false);
  });
});

describe('Categorias - superficie de dados expostos', () => {
  test('a listagem publica nao expoe colunas internas', async () => {
    await criarCategoriaDireto('Frutas', 'frutas');

    const resposta = await request(app).get(ROTA_PUBLICA).expect(200);

    expect(resposta.body.dados[0]).not.toHaveProperty('imagem_public_id');
    // As colunas devolvidas sao exatamente as publicas declaradas.
    expect(Object.keys(resposta.body.dados[0]).sort()).toEqual(
      ['ativo', 'criado_em', 'descricao', 'id', 'nome', 'slug', 'total_produtos', 'atualizado_em'].sort(),
    );
  });
});
