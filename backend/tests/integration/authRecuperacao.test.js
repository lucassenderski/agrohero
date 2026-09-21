import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { limparDados, prepararSchema } from '../helpers/banco.js';
import { gerarHashSenha } from '../../src/utils/senha.js';

const senhaAntiga = 'SenhaAntiga1';
const senhaNova = 'SenhaNovaSegura1';

beforeAll(async () => prepararSchema());
beforeEach(async () => limparDados());
afterAll(async () => pool.end());

async function criarUsuario() {
  const hash = await gerarHashSenha(senhaAntiga);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash)
     VALUES ('Usuario Reset', 'reset@teste.local', $1) RETURNING id`,
    [hash],
  );
  return rows[0].id;
}

describe('recuperacao de senha', () => {
  test('nao revela se o e-mail existe', async () => {
    const existente = await request(app)
      .post('/api/v1/auth/solicitar-redefinicao')
      .send({ email: 'reset@teste.local' });
    const inexistente = await request(app)
      .post('/api/v1/auth/solicitar-redefinicao')
      .send({ email: 'naoexiste@teste.local' });

    expect(existente.status).toBe(202);
    expect(inexistente.status).toBe(202);
    expect(existente.body).toEqual(inexistente.body);
  });

  test('redefine a senha uma unica vez e rejeita token reutilizado', async () => {
    const usuarioId = await criarUsuario();
    const token = randomBytes(32).toString('hex');
    const hashToken = createHash('sha256').update(token).digest('hex');
    await pool.query(
      `INSERT INTO tokens_redefinicao_senha (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [usuarioId, hashToken],
    );

    const primeira = await request(app)
      .post('/api/v1/auth/redefinir-senha')
      .send({ token, senha: senhaNova });
    const segunda = await request(app)
      .post('/api/v1/auth/redefinir-senha')
      .send({ token, senha: 'OutraSenha1' });

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(422);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset@teste.local', senha: senhaNova });
    expect(login.status).toBe(200);
  });
});
