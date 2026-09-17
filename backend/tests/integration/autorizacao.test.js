import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import env from '../../src/config/env.js';
import { pool } from '../../src/database/pool.js';
import { limparDados, prepararSchema } from '../helpers/banco.js';
import { gerarHashSenha } from '../../src/utils/senha.js';
import { gerarToken } from '../../src/utils/token.js';
import { requireRole } from '../../src/middlewares/requireRole.js';
import { checkJwt } from '../../src/middlewares/checkJwt.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';

/*
 * Testes de autenticacao e autorizacao.
 *
 * Este arquivo cobre a superficie de ataque das rotas protegidas:
 * token ausente, adulterado, expirado, alg=none, usuario bloqueado e
 * usuario removido. Sao os testes negativos do requisito 29.
 */

const SENHA = 'SenhaSegura1';

async function criarUsuario({ email, tipo = 'cliente', ativo = true } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, tipo, ativo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nome, email, tipo, ativo`,
    ['Usuario Teste', email, await gerarHashSenha(SENHA), tipo, ativo],
  );
  return rows[0];
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

describe('checkJwt - protecao das rotas autenticadas', () => {
  test('SEM token responde 401', async () => {
    const resposta = await request(app).get('/api/v1/usuarios/profile');

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('NAO_AUTENTICADO');
  });

  test('cabecalho sem o prefixo Bearer responde 401', async () => {
    const usuario = await criarUsuario({ email: 'a@teste.com' });
    const token = gerarToken(usuario);

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', token);

    expect(resposta.status).toBe(401);
  });

  test('token adulterado responde 401', async () => {
    const usuario = await criarUsuario({ email: 'a@teste.com' });
    const token = gerarToken(usuario);
    const adulterado = `${token.slice(0, -4)}aaaa`;

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${adulterado}`);

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('TOKEN_INVALIDO');
  });

  test('token com assinatura de OUTRO segredo responde 401', async () => {
    const usuario = await criarUsuario({ email: 'a@teste.com' });

    // Assinado com um segredo diferente, mas com payload valido.
    const falso = jwt.sign({ sub: String(usuario.id), tipo: 'administrador' }, 'segredo-do-atacante-com-mais-de-32-chars', {
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: 'agrohero-api',
      audience: 'agrohero-app',
    });

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${falso}`);

    expect(resposta.status).toBe(401);
  });

  test('token com alg=none e recusado', async () => {
    const usuario = await criarUsuario({ email: 'a@teste.com' });

    // Ataque de confusao de algoritmo: um token sem assinatura nenhuma
    // declarando alg=none. Se a verificacao nao fixasse o algoritmo, este
    // token passaria e daria acesso administrativo.
    const semAssinatura = jwt.sign({ sub: String(usuario.id), tipo: 'administrador' }, '', {
      algorithm: 'none',
    });

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${semAssinatura}`);

    expect(resposta.status).toBe(401);
  });

  test('token expirado responde 401', async () => {
    const usuario = await criarUsuario({ email: 'a@teste.com' });

    const expirado = jwt.sign({ sub: String(usuario.id), tipo: 'cliente' }, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '-1s',
      issuer: 'agrohero-api',
      audience: 'agrohero-app',
    });

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${expirado}`);

    expect(resposta.status).toBe(401);
    expect(resposta.body.erro.codigo).toBe('TOKEN_INVALIDO');
  });

  test('token valido de usuario BLOQUEADO responde 403', async () => {
    const usuario = await criarUsuario({ email: 'bloqueado@teste.com', ativo: false });
    const token = gerarToken(usuario);

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${token}`);

    /*
     * 403 e nao 401 de proposito: a credencial e valida, o acesso e que
     * foi revogado. Isso permite ao frontend diferenciar "faca login" de
     * "sua conta esta suspensa".
     */
    expect(resposta.status).toBe(403);
  });

  test('token valido de usuario REMOVIDO responde 401', async () => {
    const usuario = await criarUsuario({ email: 'some@teste.com' });
    const token = gerarToken(usuario);

    // Assinatura e payload continuam validos, mas o usuario sumiu.
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(401);
  });

  test('bloqueio tem efeito IMEDIATO, sem esperar o token expirar', async () => {
    /*
     * Este e o teste que justifica a decisao de recarregar o usuario do
     * banco a cada requisicao. O token foi emitido ANTES do bloqueio e
     * continua dentro da validade - se a autorizacao viesse do token,
     * o usuario bloqueado seguiria navegando por ate 1 hora.
     */
    const usuario = await criarUsuario({ email: 'vai-bloquear@teste.com' });
    const token = gerarToken(usuario);

    const antes = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(antes.status).toBe(200);

    await pool.query('UPDATE usuarios SET ativo = FALSE WHERE id = $1', [usuario.id]);

    const depois = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(depois.status).toBe(403);
  });

  test('tipo do token NAO da permissao: quem manda e o banco', async () => {
    /*
     * Um token adulterado com tipo=administrador nao passaria na
     * assinatura. Mas aqui testamos o caso em que o tipo no token esta
     * correto e desatualizado: o banco e a fonte de verdade.
     */
    const usuario = await criarUsuario({ email: 'a@teste.com', tipo: 'cliente' });

    // Token diz "agricultor", banco diz "cliente".
    const mentiroso = jwt.sign({ sub: String(usuario.id), tipo: 'agricultor' }, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
      issuer: 'agrohero-api',
      audience: 'agrohero-app',
    });

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${mentiroso}`);

    // A resposta traz o tipo do BANCO (cliente), nao o do token.
    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.tipo).toBe('cliente');
  });
});

describe('requireRole - autorizacao por papel', () => {
  /*
   * requireRole ainda nao esta aplicado em nenhuma rota de negocio (isso
   * acontece nas fases 6+). Testamos o middleware direto, montando uma
   * app Express minima - e a unica forma de cobrir a logica agora sem
   * inventar uma rota de teste no codigo de producao.
   */
  let appTeste;
  let servidor;

  beforeAll(async () => {
    const express = (await import('express')).default;

    appTeste = express();
    appTeste.use(express.json());
    appTeste.get('/so-agricultor', checkJwt, requireRole('agricultor'), (req, res) =>
      res.json({ sucesso: true, dados: { tipo: req.usuario.tipo } }),
    );
    appTeste.get('/cliente-ou-admin', checkJwt, requireRole('cliente', 'administrador'), (req, res) =>
      res.json({ sucesso: true, dados: { tipo: req.usuario.tipo } }),
    );
    appTeste.use(errorHandler);

    servidor = appTeste.listen(0);
  });

  afterAll((done) => {
    servidor.close(done);
  });

  test('agricultor acessa rota de agricultor', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });

    const resposta = await request(servidor)
      .get('/so-agricultor')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.status).toBe(200);
  });

  test('cliente NAO acessa rota de agricultor (403)', async () => {
    const usuario = await criarUsuario({ email: 'cli@teste.com', tipo: 'cliente' });

    const resposta = await request(servidor)
      .get('/so-agricultor')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('SEM_PERMISSAO');
  });

  test('cliente acessa rota compartilhada cliente+admin', async () => {
    const usuario = await criarUsuario({ email: 'cli2@teste.com', tipo: 'cliente' });

    const resposta = await request(servidor)
      .get('/cliente-ou-admin')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.status).toBe(200);
  });

  test('administrador acessa rota compartilhada cliente+admin', async () => {
    const usuario = await criarUsuario({ email: 'adm@teste.com', tipo: 'administrador' });

    const resposta = await request(servidor)
      .get('/cliente-ou-admin')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.status).toBe(200);
  });

  test('sem token responde 401 (nao 403)', async () => {
    // 401 = "quem e voce?"; 403 = "sei quem e, mas nao pode". O frontend
    // usa essa diferenca para decidir entre login e mensagem de acesso.
    const resposta = await request(servidor).get('/so-agricultor');

    expect(resposta.status).toBe(401);
  });

  test('requireRole sem argumentos falha na criacao, nao em runtime', () => {
    // Um requireRole() vazio seria uma checagem que passou batido na
    // revisao. Falhar cedo e melhor que ter uma rota sem protecao.
    expect(() => requireRole()).toThrow(/pelo menos um papel/);
  });
});