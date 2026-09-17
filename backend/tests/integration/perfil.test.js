import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { limparDados, prepararSchema } from '../helpers/banco.js';
import { gerarHashSenha, conferirSenha } from '../../src/utils/senha.js';
import { gerarToken } from '../../src/utils/token.js';

/*
 * Testes do perfil do usuario autenticado.
 *
 * Foco: garantir que a identidade vem SEMPRE do token, e que dados
 * privados de um usuario nao sao alcancaveis por outro.
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

describe('GET /api/v1/usuarios/profile', () => {
  test('devolve o perfil do usuario do token', async () => {
    const usuario = await criarUsuario({ email: 'eu@teste.com' });

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.id).toBe(usuario.id);
    expect(resposta.body.dados.email).toBe('eu@teste.com');
    expect(resposta.body.dados.senha_hash).toBeUndefined();
  });

  test('inclui o perfil da propriedade quando e agricultor', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    await pool.query(
      `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado, certificacoes)
       VALUES ($1, 'Sitio Verde', 'Campinas', 'SP', ARRAY['Organico IBD'])`,
      [usuario.id],
    );

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.body.dados.agricultor).not.toBeNull();
    expect(resposta.body.dados.agricultor.nome_fazenda).toBe('Sitio Verde');
    expect(resposta.body.dados.agricultor.certificacoes).toEqual(['Organico IBD']);
  });

  test('agricultor sem perfil criado devolve agricultor: null', async () => {
    // Estado possivel se o perfil for removido por um administrador.
    // A API precisa responder sem quebrar, nao cair em 500.
    const usuario = await criarUsuario({ email: 'orfa@teste.com', tipo: 'agricultor' });

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.agricultor).toBeNull();
  });

  test('cliente devolve agricultor: null', async () => {
    const usuario = await criarUsuario({ email: 'cli@teste.com' });

    const resposta = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(resposta.body.dados.agricultor).toBeNull();
  });

  test('nao existe rota para ler o perfil de OUTRO usuario (sem IDOR)', async () => {
    /*
     * Teste da AUSENCIA da rota.
     *
     * O requisito 8 diz que um consumidor nao pode ver dados privados de
     * outro. A defesa aqui e arquitetural: nao existe /usuarios/:id.
     * Testamos que essa rota realmente nao responde dados de terceiros.
     */
    const vitima = await criarUsuario({ email: 'vitima@teste.com' });
    const atacante = await criarUsuario({ email: 'atacante@teste.com' });

    const resposta = await request(app)
      .get(`/api/v1/usuarios/${vitima.id}`)
      .set('Authorization', `Bearer ${gerarToken(atacante)}`);

    // A rota nao existe: 404, e nao os dados da vitima.
    expect(resposta.status).toBe(404);
    expect(JSON.stringify(resposta.body)).not.toContain('vitima@teste.com');
  });
});

describe('PUT /api/v1/usuarios/profile', () => {
  test('atualiza os campos permitidos', async () => {
    const usuario = await criarUsuario({ email: 'eu@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({ nome: 'Nome Novo', telefone: '(19) 99999-8888', cidade: 'Recife', estado: 'PE' });

    expect(resposta.status).toBe(200);
    expect(resposta.body.dados.nome).toBe('Nome Novo');
    // O telefone e gravado apenas com digitos.
    expect(resposta.body.dados.telefone).toBe('19999998888');
    expect(resposta.body.dados.cidade).toBe('Recife');
  });

  test('NAO permite alterar o proprio tipo (escalacao de privilegio)', async () => {
    const usuario = await criarUsuario({ email: 'eu@teste.com', tipo: 'cliente' });

    await request(app)
      .put('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({ nome: 'Nome Novo', tipo: 'administrador' });

    const { rows } = await pool.query('SELECT tipo FROM usuarios WHERE id = $1', [usuario.id]);
    expect(rows[0].tipo).toBe('cliente');
  });

  test('NAO permite alterar o proprio e-mail por esta rota', async () => {
    const usuario = await criarUsuario({ email: 'eu@teste.com' });

    await request(app)
      .put('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({ email: 'outro@teste.com' });

    const { rows } = await pool.query('SELECT email FROM usuarios WHERE id = $1', [usuario.id]);
    expect(rows[0].email).toBe('eu@teste.com');
  });

  test('NAO permite desbloquear a propria conta', async () => {
    const usuario = await criarUsuario({ email: 'eu@teste.com' });

    await request(app)
      .put('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({ ativo: false });

    // `ativo` e campo de administrador; enviar false nao tem efeito.
    const { rows } = await pool.query('SELECT ativo FROM usuarios WHERE id = $1', [usuario.id]);
    expect(rows[0].ativo).toBe(true);
  });

  test('atualiza o perfil da propriedade do agricultor na mesma chamada', async () => {
    const usuario = await criarUsuario({ email: 'agri@teste.com', tipo: 'agricultor' });
    await pool.query(
      `INSERT INTO agricultores (usuario_id, nome_fazenda) VALUES ($1, 'Nome Antigo')`,
      [usuario.id],
    );

    const resposta = await request(app)
      .put('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({ agricultor: { nome_fazenda: 'Nome Novo', descricao: 'Agricultura familiar' } });

    expect(resposta.status).toBe(200);

    const { rows } = await pool.query(
      'SELECT nome_fazenda, descricao FROM agricultores WHERE usuario_id = $1',
      [usuario.id],
    );
    expect(rows[0].nome_fazenda).toBe('Nome Novo');
    expect(rows[0].descricao).toBe('Agricultura familiar');
  });

  test('recusa telefone invalido', async () => {
    const usuario = await criarUsuario({ email: 'eu@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({ telefone: '123' });

    expect(resposta.status).toBe(400);
  });

  test('exige autenticacao', async () => {
    const resposta = await request(app)
      .put('/api/v1/usuarios/profile')
      .send({ nome: 'Invasor' });

    expect(resposta.status).toBe(401);
  });
});

describe('PUT /api/v1/usuarios/senha', () => {
  test('troca a senha e a nova passa a valer no login', async () => {
    await request(app).post('/api/v1/auth/register').send({
      nome: 'Joao',
      email: 'joao@teste.com',
      senha: SENHA,
      tipo: 'cliente',
    });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'joao@teste.com', senha: SENHA });

    const token = login.body.dados.token;

    const troca = await request(app)
      .put('/api/v1/usuarios/senha')
      .set('Authorization', `Bearer ${token}`)
      .send({
        senha_atual: SENHA,
        nova_senha: 'OutraSenha2',
        confirma_nova_senha: 'OutraSenha2',
      });

    expect(troca.status).toBe(204);

    // Senha antiga nao funciona mais.
    const comAntiga = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'joao@teste.com', senha: SENHA });
    expect(comAntiga.status).toBe(401);

    // Senha nova funciona.
    const comNova = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'joao@teste.com', senha: 'OutraSenha2' });
    expect(comNova.status).toBe(200);
  });

  test('exige a senha ATUAL correta', async () => {
    const usuario = await criarUsuario({ email: 'eu@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/senha')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({
        senha_atual: 'SenhaErrada9',
        nova_senha: 'OutraSenha2',
        confirma_nova_senha: 'OutraSenha2',
      });

    expect(resposta.status).toBe(401);

    // A senha original continua valendo.
    const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [usuario.id]);
    expect(await conferirSenha(SENHA, rows[0].senha_hash)).toBe(true);
  });

  test('recusa quando a confirmacao nao confere', async () => {
    const usuario = await criarUsuario({ email: 'eu@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/senha')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({
        senha_atual: SENHA,
        nova_senha: 'OutraSenha2',
        confirma_nova_senha: 'Diferente3',
      });

    expect(resposta.status).toBe(400);
  });

  test('recusa nova senha igual a atual', async () => {
    const usuario = await criarUsuario({ email: 'eu@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/senha')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({ senha_atual: SENHA, nova_senha: SENHA, confirma_nova_senha: SENHA });

    expect(resposta.status).toBe(422);
  });

  test('recusa nova senha fraca', async () => {
    const usuario = await criarUsuario({ email: 'eu@teste.com' });

    const resposta = await request(app)
      .put('/api/v1/usuarios/senha')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({ senha_atual: SENHA, nova_senha: '123', confirma_nova_senha: '123' });

    expect(resposta.status).toBe(400);
  });

  test('exige autenticacao', async () => {
    const resposta = await request(app)
      .put('/api/v1/usuarios/senha')
      .send({ senha_atual: SENHA, nova_senha: 'OutraSenha2', confirma_nova_senha: 'OutraSenha2' });

    expect(resposta.status).toBe(401);
  });
});