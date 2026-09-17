import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { limparDados, prepararSchema } from '../helpers/banco.js';
import { gerarHashSenha } from '../../src/utils/senha.js';

/*
 * Testes de login.
 *
 * O foco aqui e SEGURANCA: a resposta nao pode revelar se um e-mail
 * existe, se a senha esta errada ou se a conta esta bloqueada. Todos os
 * casos de falha devem ser indistinguiveis.
 */

const SENHA = 'SenhaSegura1';

const USUARIO = {
  nome: 'Joao da Silva',
  email: 'joao@teste.com',
  senha: SENHA,
  tipo: 'cliente',
};

/* Cria um usuario direto no banco. Mais rapido que passar pela API. */
async function criarUsuario({ email, tipo = 'cliente', ativo = true, senha = SENHA } = {}) {
  const senhaHash = await gerarHashSenha(senha);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, tipo, ativo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nome, email, tipo, ativo`,
    ['Usuario Teste', email, senhaHash, tipo, ativo],
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

describe('POST /api/v1/auth/login', () => {
  test('autentica com credenciais corretas', async () => {
    await criarUsuario({ email: USUARIO.email });

    const resposta = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: USUARIO.email, senha: SENHA });

    expect(resposta.status).toBe(200);
    expect(resposta.body.sucesso).toBe(true);
    expect(resposta.body.dados.usuario.email).toBe(USUARIO.email);
    expect(typeof resposta.body.dados.token).toBe('string');
  });

  test('o token devolvido acessa rota protegida', async () => {
    await criarUsuario({ email: USUARIO.email });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: USUARIO.email, senha: SENHA });

    const perfil = await request(app)
      .get('/api/v1/usuarios/profile')
      .set('Authorization', `Bearer ${login.body.dados.token}`);

    expect(perfil.status).toBe(200);
    expect(perfil.body.dados.email).toBe(USUARIO.email);
  });

  test('aceita e-mail com maiusculas diferentes do cadastro', async () => {
    await criarUsuario({ email: USUARIO.email });

    const resposta = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'JOAO@TESTE.COM', senha: SENHA });

    expect(resposta.status).toBe(200);
  });

  test('nunca devolve o hash da senha', async () => {
    await criarUsuario({ email: USUARIO.email });

    const resposta = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: USUARIO.email, senha: SENHA });

    const corpo = JSON.stringify(resposta.body);
    expect(corpo).not.toContain('senha_hash');
    expect(corpo).not.toContain(SENHA);
    expect(resposta.body.dados.usuario.senha_hash).toBeUndefined();
  });

  describe('respostas indistinguiveis (anti-enumeracao)', () => {
    test('senha errada, e-mail inexistente e conta bloqueada dao a MESMA resposta', async () => {
      await criarUsuario({ email: 'existe@teste.com' });
      await criarUsuario({ email: 'bloqueado@teste.com', ativo: false });

      const senhaErrada = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'existe@teste.com', senha: 'SenhaErrada1' });

      const emailInexistente = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'naoexiste@teste.com', senha: SENHA });

      const bloqueado = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'bloqueado@teste.com', senha: SENHA });

      // Mesmo status nos tres casos.
      expect(senhaErrada.status).toBe(401);
      expect(emailInexistente.status).toBe(401);
      expect(bloqueado.status).toBe(401);

      // Mesmo corpo, byte a byte. Qualquer diferenca aqui seria um oraculo
      // para descobrir quais contas existem.
      expect(emailInexistente.body).toEqual(senhaErrada.body);
      expect(bloqueado.body).toEqual(senhaErrada.body);
      expect(senhaErrada.body.erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
    });

    test('e-mail inexistente gasta tempo compativel com e-mail existente', async () => {
      /*
       * Teste da defesa contra TIMING ATTACK.
       *
       * Sem o hash descartavel, o caso "e-mail inexistente" responderia
       * sem chamar o bcrypt e voltaria em poucos milissegundos, enquanto
       * o caso "senha errada" levaria ~250ms. Essa diferenca absurda
       * denunciaria quais e-mails existem.
       *
       * A assercao e propositalmente FOLGADA (fator 4). Medir tempo em
       * ambiente de CI e ruidoso, e um teste apertado daria falso
       * negativo. O que queremos detectar e a diferenca grosseira de
       * "pulou o bcrypt", que seria de duas ordens de grandeza.
       */
      await criarUsuario({ email: 'existe@teste.com' });

      const medir = async (email) => {
        const inicio = process.hrtime.bigint();
        await request(app).post('/api/v1/auth/login').send({ email, senha: SENHA });
        return Number(process.hrtime.bigint() - inicio) / 1e6;
      };

      // Uma rodada de aquecimento descartada, para JIT e conexao do pool.
      await medir('existe@teste.com');

      const inexistente = await medir('naoexiste@teste.com');
      const existente = await medir('existe@teste.com');

      const maior = Math.max(inexistente, existente);
      const menor = Math.min(inexistente, existente);

      // Se o bcrypt fosse pulado, `menor` seria perto de 0 e a razao
      // explodiria. Guardamos contra divisao por zero.
      expect(menor).toBeGreaterThan(0);
      expect(maior / menor).toBeLessThan(4);
    });
  });

  describe('validacao de entrada', () => {
    test('recusa senha vazia', async () => {
      const resposta = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: USUARIO.email, senha: '' });

      expect(resposta.status).toBe(400);
    });

    test('recusa corpo sem e-mail', async () => {
      const resposta = await request(app).post('/api/v1/auth/login').send({ senha: SENHA });

      expect(resposta.status).toBe(400);
    });

    test('nao revela a politica de senha no login', async () => {
      /*
       * Uma senha curta no login deve dar 401 (credencial invalida), nao
       * 400 (dados invalidos). Se desse 400, a mensagem revelaria a regra
       * de senha minima da aplicacao para quem esta sondando.
       */
      await criarUsuario({ email: USUARIO.email });

      const resposta = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: USUARIO.email, senha: 'curta' });

      expect(resposta.status).toBe(401);
      expect(resposta.body.erro.codigo).toBe('CREDENCIAIS_INVALIDAS');
    });
  });
});