import request from 'supertest';
import sharp from 'sharp';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { limparDados, prepararSchema } from '../helpers/banco.js';
import { gerarHashSenha } from '../../src/utils/senha.js';
import { gerarToken } from '../../src/utils/token.js';

/*
 * Testes do avatar do usuario (foto de perfil).
 *
 * O fluxo tem duas metades que precisam concordar:
 *
 *   PUT /usuarios/avatar -> a pessoa grava a foto (bytes no banco)
 *   GET /usuarios/avatar -> a mesma pessoa le a imagem
 *
 * Como no teste da logo, nada e mockado: o arquivo entra como multipart,
 * e processado pelo sharp, vai para uma coluna BYTEA e volta pelo
 * endpoint autenticado como imagem. Um mock em qualquer ponto esconderia
 * justamente o que pode quebrar.
 *
 * A DIFERENCA EM RELACAO A LOGO, E POR QUE ELA TEM TESTE PROPRIO
 *
 * A logo e do PRODUTOR e publica; o avatar e de QUALQUER conta e privado.
 * Isso muda tres coisas que so um teste de integracao cobre:
 *
 *   1. cliente tambem pode ter avatar (nao ha requireRole);
 *   2. nao existe rota publica - so o dono le a imagem;
 *   3. o perfil devolve `avatar_url`, e nao os bytes.
 */

const SENHA = 'SenhaSegura1';

async function criarUsuario({ email, tipo = 'cliente', nome = 'Usuario Teste' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, tipo)
     VALUES ($1, $2, $3, $4)
     RETURNING id, nome, email, tipo`,
    [nome, email, await gerarHashSenha(SENHA), tipo],
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

/* Ruido puro: incompressivel, para exercitar a escada de qualidade. */
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

describe('PUT /api/v1/usuarios/avatar', () => {
  test('o cliente envia a foto e o avatar fica gravado', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('avatar', await imagemPng(), 'eu.png');

    /*
     * 200 para um CLIENTE e o que distingue esta rota da logo: la, um
     * cliente recebe 403 porque nao tem propriedade. Aqui toda conta tem
     * foto de perfil.
     */
    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.avatar_url).toBe('/usuarios/avatar');
    expect(resposta.body.dados.mime).toBe('image/webp');

    // Confirma no banco: os bytes existem e sao WebP de verdade.
    const { rows } = await pool.query(
      'SELECT avatar_bytes, avatar_mime FROM usuarios WHERE id = $1',
      [usuario.id],
    );
    expect(rows[0].avatar_mime).toBe('image/webp');
    expect(rows[0].avatar_bytes.length).toBeGreaterThan(0);

    const meta = await sharp(rows[0].avatar_bytes).metadata();
    expect(meta.format).toBe('webp');
  });

  test('o produtor tambem pode ter avatar', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('avatar', await imagemPng(), 'eu.png')
      .expect(200);

    const { rows } = await pool.query(
      'SELECT avatar_mime FROM usuarios WHERE id = $1',
      [usuario.id],
    );
    expect(rows[0].avatar_mime).toBe('image/webp');
  });

  test('a imagem e reduzida para o perfil de avatar (512 px)', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });

    const original = await imagemRuido(2000, 1500);

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('avatar', original, 'foto.jpg')
      .expect(200);

    const { rows } = await pool.query(
      'SELECT avatar_bytes FROM usuarios WHERE id = $1',
      [usuario.id],
    );

    // O avatar e menor que a logo: 512 px e 128 KB, contra 800 px e 512 KB.
    const meta = await sharp(rows[0].avatar_bytes).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(512);
    expect(rows[0].avatar_bytes.length).toBeLessThanOrEqual(128 * 1024);

    // O ponto da feature: o banco nao recebe a foto original.
    expect(rows[0].avatar_bytes.length).toBeLessThan(original.length / 4);
  });

  test('recusa arquivo acima de 5 MB com mensagem acionavel', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('avatar', Buffer.alloc(6 * 1024 * 1024, 7), 'enorme.jpg');

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('AVATAR_MUITO_GRANDE');
    expect(resposta.body.erro.mensagem).toMatch(/5 MB/);
  });

  test('recusa arquivo que nao e imagem', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('avatar', Buffer.from('apenas texto, nada de imagem'), 'falso.jpg');

    expect(resposta.status).toBe(422);
    expect(resposta.body.erro.codigo).toBe('AVATAR_FORMATO_INVALIDO');
  });

  test('recusa requisicao sem arquivo', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.status).toBe(400);
    // A mensagem nomeia o campo `avatar`, nao `logo` - e o que diz ao
    // frontend qual dos dois uploads chegou sem arquivo.
    expect(resposta.body.erro.mensagem).toMatch(/avatar/);
  });

  test('exige autenticacao', async () => {
    await request(app)
      .put('/api/v1/usuarios/avatar')
      .attach('avatar', await imagemPng(), 'eu.png')
      .expect(401);
  });

  test('imagem invalida NAO apaga o avatar que ja existia', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('avatar', await imagemPng(), 'boa.png')
      .expect(200);

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .attach('avatar', Buffer.from('nao e imagem'), 'ruim.jpg')
      .expect(422);

    // O avatar anterior continua la: o processamento vem antes da escrita.
    const { rows } = await pool.query(
      'SELECT avatar_mime FROM usuarios WHERE id = $1',
      [usuario.id],
    );
    expect(rows[0].avatar_mime).toBe('image/webp');
  });
});

describe('GET /api/v1/usuarios/avatar', () => {
  test('serve a imagem para o dono, com ETag e cache privado', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });
    const token = gerarToken(usuario);

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', await imagemPng(), 'eu.png')
      .expect(200);

    const resposta = await request(app)
      .get('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.headers['content-type']).toMatch(/^image\/webp/);
    expect(resposta.headers.etag).toBeTruthy();

    /*
     * `private` e o que impede um cache intermediario de guardar a foto
     * de uma pessoa indexada por id - o motivo de nao haver rota publica.
     */
    expect(resposta.headers['cache-control']).toMatch(/private/);
    expect(resposta.headers['cache-control']).not.toMatch(/public/);

    const meta = await sharp(resposta.body).metadata();
    expect(meta.format).toBe('webp');
  });

  test('devolve 304 quando o ETag confere', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });
    const token = gerarToken(usuario);

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', await imagemPng(), 'eu.png')
      .expect(200);

    const primeira = await request(app)
      .get('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const segunda = await request(app)
      .get('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${token}`)
      .set('If-None-Match', primeira.headers.etag);

    expect(segunda.status).toBe(304);
    expect(segunda.body).toEqual({});
  });

  test('responde 404 para quem nunca enviou foto', async () => {
    const usuario = await criarUsuario({ email: 'semfoto@teste.com' });

    await request(app)
      .get('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .expect(404);
  });

  test('exige autenticacao - nao existe leitura publica', async () => {
    /*
     * A ausencia de rota publica e a decisao, nao um esquecimento: uma
     * foto de rosto indexada por id de usuario (sequencial, enumeravel)
     * e um identificador mais forte que o primeiro nome que as avaliacoes
     * expoem de proposito.
     */
    await request(app).get('/api/v1/usuarios/avatar').expect(401);
  });

  test('um usuario NAO le o avatar de outro', async () => {
    const dono = await criarUsuario({ email: 'dono@teste.com', nome: 'Dona Foto' });
    const curioso = await criarUsuario({ email: 'curioso@teste.com' });

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(dono)}`)
      .attach('avatar', await imagemPng(), 'dono.png')
      .expect(200);

    /*
     * A rota nao aceita id: a identidade vem do token. Entao o curioso
     * nao recebe a foto do dono - recebe 404, porque ELE nao tem avatar.
     * Este e o teste que prova a privacidade na pratica: se a rota
     * aceitasse um id, esta requisicao devolveria a imagem alheia.
     */
    const resposta = await request(app)
      .get('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(curioso)}`);

    expect(resposta.status).toBe(404);
  });
});

describe('DELETE /api/v1/usuarios/avatar', () => {
  test('remove o avatar e volta para as iniciais', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });
    const token = gerarToken(usuario);

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', await imagemPng(), 'eu.png')
      .expect(200);

    const resposta = await request(app)
      .delete('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.avatar_url).toBeNull();

    const { rows } = await pool.query(
      'SELECT avatar_bytes, avatar_mime FROM usuarios WHERE id = $1',
      [usuario.id],
    );
    expect(rows[0].avatar_bytes).toBeNull();
    expect(rows[0].avatar_mime).toBeNull();

    await request(app)
      .get('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  test('e idempotente: remover sem ter avatar tambem responde 200', async () => {
    const usuario = await criarUsuario({ email: 'semfoto@teste.com' });

    const resposta = await request(app)
      .delete('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.avatar_url).toBeNull();
  });
});

describe('avatar no perfil', () => {
  test('o perfil devolve avatar_url quando ha foto, e null quando nao ha', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });
    const token = gerarToken(usuario);

    const semFoto = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(semFoto.body.dados.avatar_url).toBeNull();

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', await imagemPng(), 'eu.png')
      .expect(200);

    const comFoto = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(comFoto.body.dados.avatar_url).toBe('/usuarios/avatar');
  });

  test('o perfil NAO devolve os bytes do avatar', async () => {
    const usuario = await criarUsuario({ email: 'cliente@teste.com' });
    const token = gerarToken(usuario);

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', await imagemPng(), 'eu.png')
      .expect(200);

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    /*
     * So o booleano e a URL derivada saem daqui. Os bytes ficam na rota
     * da imagem: `checkJwt` le o perfil a cada requisicao autenticada, e
     * trazer a foto junto carregaria dezenas de KB por chamada para
     * jogar fora em seguida.
     */
    expect(resposta.body.dados.avatar_bytes).toBeUndefined();
    expect(JSON.stringify(resposta.body.dados)).not.toMatch(/avatar_bytes/);
  });

  test('o avatar de um usuario nao aparece no perfil de outro', async () => {
    const dono = await criarUsuario({ email: 'dono@teste.com' });
    const outro = await criarUsuario({ email: 'outro@teste.com' });

    await request(app)
      .put('/api/v1/usuarios/avatar')
      .set('Authorization', `Bearer ${gerarToken(dono)}`)
      .attach('avatar', await imagemPng(), 'dono.png')
      .expect(200);

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(outro)}`)
      .expect(200);

    // O perfil e sempre o do token: nao ha como pedir o de outra pessoa.
    expect(resposta.body.dados.avatar_url).toBeNull();
    expect(resposta.body.dados.email).toBe('outro@teste.com');
  });
});
