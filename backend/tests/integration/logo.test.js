import request from 'supertest';
import sharp from 'sharp';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { limparDados, prepararSchema } from '../helpers/banco.js';
import { gerarHashSenha } from '../../src/utils/senha.js';
import { gerarToken } from '../../src/utils/token.js';

/*
 * Testes da logo da propriedade.
 *
 * O fluxo tem duas metades que precisam concordar:
 *
 *   PUT /usuarios/logo   -> o produtor grava a imagem (bytes no banco)
 *   GET /agricultores/:id/logo -> o navegador le a imagem
 *
 * O valor destes testes esta em exercitar a INTEGRACAO: o arquivo entra
 * como multipart, e processado pelo sharp, vai para uma coluna BYTEA e
 * volta pelo endpoint publico como imagem. Um mock em qualquer ponto
 * desses esconderia exatamente o que pode quebrar (formato do multipart,
 * serializacao do bytea, cabecalho de resposta).
 */

const SENHA = 'SenhaSegura1';

async function criarUsuario({ email, tipo = 'cliente' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, tipo)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nome, email, tipo`,
    ['Usuario Teste', email, await gerarHashSenha(SENHA), tipo],
  );
  return rows[0];
}

async function criarAgricultor(usuario) {
  const { rows } = await pool.query(
    `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado)
     VALUES ($1, 'Sitio Verde', 'Campinas', 'SP')
     RETURNING id, nome_fazenda`,
    [usuario.id],
  );
  return rows[0];
}

/* Imagem real, gerada com o mesmo sharp do service. */
async function imagemPng(largura = 600, altura = 600) {
  return sharp({
    create: {
      width: largura,
      height: altura,
      channels: 3,
      background: { r: 7, g: 156, b: 104 },
    },
  })
    .png()
    .toBuffer();
}

async function imagemRuido(largura, altura) {
  const raw = Buffer.alloc(largura * altura * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) % 256;

  return sharp(raw, { raw: { width: largura, height: altura, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

beforeAll(async () => {
  await prepararSchema();
});

beforeEach(async () => {
  await limparDados();
});

afterAll(async () => {
  await pool.end();
});

describe('PUT /api/v1/usuarios/logo', () => {
  test('o produtor envia uma imagem e a logo fica gravada', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    const resposta = await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', await imagemPng(), 'minha-fazenda.png');

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.logo_url).toBe(`/agricultores/${agricultor.id}/logo`);
    expect(resposta.body.dados.mime).toBe('image/webp');

    // Confirma no banco: os bytes existem e sao WebP de verdade.
    const { rows } = await pool.query(
      'SELECT logo_bytes, logo_mime FROM agricultores WHERE id = $1',
      [agricultor.id],
    );
    expect(rows[0].logo_mime).toBe('image/webp');
    expect(rows[0].logo_bytes.length).toBeGreaterThan(0);

    const meta = await sharp(rows[0].logo_bytes).metadata();
    expect(meta.format).toBe('webp');
  });

  test('a imagem e reduzida antes de ir para o banco', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    const original = await imagemRuido(2000, 1500);

    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', original, 'foto.jpg')
      .expect(200);

    const { rows } = await pool.query(
      'SELECT length(logo_bytes)::int AS tamanho FROM agricultores WHERE id = $1',
      [agricultor.id],
    );

    // O ponto da feature: o banco nao recebe a foto original.
    expect(rows[0].tamanho).toBeLessThan(original.length / 4);
    expect(rows[0].tamanho).toBeLessThanOrEqual(512 * 1024);
  });

  test('recusa arquivo acima de 5 MB com mensagem acionavel', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    await criarAgricultor(usuario);

    const gigante = Buffer.alloc(6 * 1024 * 1024, 7);

    const resposta = await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', gigante, 'enorme.jpg');

    // 422 e nao 500: e um erro do arquivo enviado, nao do servidor.
    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('LOGO_MUITO_GRANDE');
    expect(resposta.body.erro.mensagem).toMatch(/5 MB/);
  });

  test('recusa arquivo que nao e imagem', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    await criarAgricultor(usuario);

    const resposta = await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', Buffer.from('apenas texto, nada de imagem'), 'falso.jpg');

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('LOGO_FORMATO_INVALIDO');
  });

  test('recusa requisicao sem arquivo', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    await criarAgricultor(usuario);

    const resposta = await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.mensagem).toMatch(/logo/);
  });

  test('imagem invalida NAO apaga a logo que ja existia', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    // Primeiro uma logo valida.
    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', await imagemPng(), 'boa.png')
      .expect(200);

    // Depois uma tentativa invalida.
    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', Buffer.from('nao e imagem'), 'ruim.jpg')
      .expect(422);

    // A logo anterior continua la: o processamento vem antes da escrita.
    const { rows } = await pool.query(
      'SELECT logo_mime FROM agricultores WHERE id = $1',
      [agricultor.id],
    );
    expect(rows[0].logo_mime).toBe('image/webp');
  });

  test('cliente recebe 403 (nao tem propriedade)', async () => {
    const cliente = await criarUsuario({ email: 'cliente@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(cliente)}`)
      .attach('logo', await imagemPng(), 'logo.png');

    // 403 e nao 404: o problema e permissao, nao recurso inexistente.
    expect(resposta.status).toBe(403);
  });

  test('sem token recebe 401', async () => {
    const resposta = await request(app)
      .put('/api/v1/usuarios/logo')
      .attach('logo', await imagemPng(), 'logo.png');

    expect(resposta.status).toBe(401);
  });

  test('o produtor nao consegue gravar logo em nome de outro', async () => {
    /*
     * Nao existe id no corpo nem na rota: a identidade vem do token. Este
     * teste documenta a garantia - mesmo enviando um `agricultor_id` no
     * corpo multipart, ele e ignorado.
     */
    const alvo = await criarUsuario({ email: 'alvo@teste.com', tipo: 'agricultor' });
    const alvoPerfil = await criarAgricultor(alvo);

    const atacante = await criarUsuario({ email: 'atacante@teste.com', tipo: 'agricultor' });
    const atacantePerfil = await criarAgricultor(atacante);

    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(atacante)}`)
      .field('agricultor_id', String(alvoPerfil.id))
      .attach('logo', await imagemPng(), 'logo.png')
      .expect(200);

    const { rows } = await pool.query(
      `SELECT
         (SELECT logo_bytes IS NOT NULL FROM agricultores WHERE id = $1) AS tem_no_alvo,
         (SELECT logo_bytes IS NOT NULL FROM agricultores WHERE id = $2) AS tem_no_atacante`,
      [alvoPerfil.id, atacantePerfil.id],
    );

    expect(rows[0].tem_no_alvo).toBe(false);
    expect(rows[0].tem_no_atacante).toBe(true);
  });
});

describe('GET /api/v1/agricultores/:id/logo', () => {
  test('devolve os bytes da imagem com o Content-Type correto', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', await imagemPng(), 'logo.png')
      .expect(200);

    const resposta = await request(app).get(`/api/v1/agricultores/${agricultor.id}/logo`);

    expect(resposta.status).toBe(200);
    expect(resposta.headers['content-type']).toMatch(/image\/webp/);
    // Nao e JSON: o corpo sao os bytes. `resposta.body` viria vazio.
    expect(Buffer.isBuffer(resposta.body)).toBe(true);

    const meta = await sharp(resposta.body).metadata();
    expect(meta.format).toBe('webp');
  });

  test('e publico: funciona sem token', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', await imagemPng(), 'logo.png')
      .expect(200);

    // Sem cabecalho Authorization: e a vitrine publica.
    await request(app).get(`/api/v1/agricultores/${agricultor.id}/logo`).expect(200);
  });

  test('404 quando o produtor nao tem logo (frontend usa a padrao)', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    const resposta = await request(app).get(`/api/v1/agricultores/${agricultor.id}/logo`);

    expect(resposta.status).toBe(404);
  });

  test('404 para produtor inexistente', async () => {
    await request(app).get('/api/v1/agricultores/999999/logo').expect(404);
  });

  test('400 para id nao numerico (nao 500)', async () => {
    // Sem validacao, a string chegaria ao Postgres numa comparacao com
    // bigint e viraria erro 500 por culpa da entrada do cliente.
    await request(app).get('/api/v1/agricultores/abc/logo').expect(400);
  });

  test('devolve ETag e Cache-Control', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', await imagemPng(), 'logo.png')
      .expect(200);

    const resposta = await request(app).get(`/api/v1/agricultores/${agricultor.id}/logo`);

    expect(resposta.headers.etag).toBeDefined();
    expect(resposta.headers['cache-control']).toMatch(/max-age/);
  });

  test('If-None-Match devolve 304 sem corpo', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', await imagemPng(), 'logo.png')
      .expect(200);

    const primeira = await request(app).get(`/api/v1/agricultores/${agricultor.id}/logo`);

    const segunda = await request(app)
      .get(`/api/v1/agricultores/${agricultor.id}/logo`)
      .set('If-None-Match', primeira.headers.etag);

    // O navegador reaproveita a copia: economia de banda e de banco.
    expect(segunda.status).toBe(304);
  });
});

describe('DELETE /api/v1/usuarios/logo', () => {
  test('remove a logo e volta para a imagem padrao', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', await imagemPng(), 'logo.png')
      .expect(200);

    const remocao = await request(app)
      .delete('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(remocao.status).toBe(200);
    expect(remocao.body.dados.logo_url).toBeNull();

    // Os bytes saem do banco: o espaco e devolvido.
    const { rows } = await pool.query(
      'SELECT logo_bytes, logo_mime FROM agricultores WHERE id = $1',
      [agricultor.id],
    );
    expect(rows[0].logo_bytes).toBeNull();
    expect(rows[0].logo_mime).toBeNull();

    // E o endpoint publico passa a responder 404.
    await request(app).get(`/api/v1/agricultores/${agricultor.id}/logo`).expect(404);
  });

  test('cliente recebe 403', async () => {
    const cliente = await criarUsuario({ email: 'cliente@teste.com' });

    await request(app)
      .delete('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(cliente)}`)
      .expect(403);
  });
});

describe('integracao com as leituras publicas', () => {
  test('o perfil publico expoe logo_url quando ha logo', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', await imagemPng(), 'logo.png')
      .expect(200);

    const resposta = await request(app).get(`/api/v1/agricultores/${agricultor.id}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.logo_url).toBe(`/agricultores/${agricultor.id}/logo`);
    // O booleano cru nao vaza: o frontend recebe a URL, nao um flag.
    expect(resposta.body.dados.tem_logo).toBeUndefined();
    // E os bytes NUNCA entram no JSON.
    expect(resposta.body.dados.logo_bytes).toBeUndefined();
  });

  test('sem logo, logo_url e null', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    const resposta = await request(app).get(`/api/v1/agricultores/${agricultor.id}`);

    expect(resposta.body.dados.logo_url).toBeNull();
  });

  test('a lista de produtores tambem traz logo_url', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', await imagemPng(), 'logo.png')
      .expect(200);

    const resposta = await request(app).get('/api/v1/agricultores');

    const encontrado = resposta.body.dados.find((p) => p.id === agricultor.id);
    expect(encontrado.logo_url).toBe(`/agricultores/${agricultor.id}/logo`);
  });

  test('o proprio produtor ve logo_url no seu perfil autenticado', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    const agricultor = await criarAgricultor(usuario);

    await request(app)
      .put('/api/v1/usuarios/logo')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('logo', await imagemPng(), 'logo.png')
      .expect(200);

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.body.dados.agricultor.logo_url).toBe(`/agricultores/${agricultor.id}/logo`);
  });
});
