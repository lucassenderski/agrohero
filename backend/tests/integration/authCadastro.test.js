import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import env from '../../src/config/env.js';
import { pool } from '../../src/database/pool.js';
import { limparDados, prepararSchema } from '../helpers/banco.js';

/*
 * Testes de cadastro.
 *
 * Cobrem o caminho feliz, os erros de validacao e - o mais importante -
 * a tentativa de escalacao de privilegio.
 */

const CLIENTE = {
  nome: 'Joao da Silva',
  email: 'joao@teste.com',
  senha: 'SenhaSegura1',
  tipo: 'cliente',
};

const AGRICULTOR = {
  nome: 'Maria Produtora',
  email: 'maria@teste.com',
  senha: 'SenhaSegura1',
  tipo: 'agricultor',
  agricultor: {
    nome_fazenda: 'Sitio Boa Vista',
    descricao: 'Cultivo orgânico familiar',
    // A LOCALIZACAO DA PROPRIEDADE e propria e independente da do usuario.
    // O usuario aqui nao informa cidade/estado de proposito, para que o
    // teste falhe se o schema descartar estes campos do objeto aninhado.
    cidade: 'Campinas',
    estado: 'SP',
    certificacoes: ['Orgânico IBD'],
  },
};

beforeAll(async () => {
  // Como as suites rodam em serie (--runInBand), recriar o schema aqui e
  // seguro e garante que este arquivo roda contra a versao mais recente
  // das migrations, sem depender de o desenvolvedor ter rodado `migrate`.
  await prepararSchema();
});

beforeEach(async () => {
  await limparDados();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /api/v1/auth/register', () => {
  describe('caminho feliz', () => {
    test('cadastra cliente e devolve token utilizavel', async () => {
      const resposta = await request(app).post('/api/v1/auth/register').send(CLIENTE);

      expect(resposta.status).toBe(201);
      expect(resposta.body.sucesso).toBe(true);
      expect(resposta.body.dados.usuario.email).toBe('joao@teste.com');
      expect(resposta.body.dados.usuario.tipo).toBe('cliente');
      expect(typeof resposta.body.dados.token).toBe('string');

      // O token devolvido precisa funcionar de verdade em uma rota protegida.
      const perfil = await request(app)
        .get('/api/v1/usuarios/profile')
        .set('Authorization', `Bearer ${resposta.body.dados.token}`);

      expect(perfil.status).toBe(200);
      expect(perfil.body.dados.email).toBe('joao@teste.com');
    });

    test('nunca devolve a senha nem o hash na resposta', async () => {
      const resposta = await request(app).post('/api/v1/auth/register').send(CLIENTE);

      const corpo = JSON.stringify(resposta.body);
      expect(corpo).not.toContain('SenhaSegura1');
      expect(corpo).not.toContain('senha_hash');
      expect(resposta.body.dados.usuario.senha_hash).toBeUndefined();
      expect(resposta.body.dados.usuario.senha).toBeUndefined();
    });

    test('grava a senha como hash bcrypt, nunca em texto puro', async () => {
      await request(app).post('/api/v1/auth/register').send(CLIENTE);

      const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE email = $1', [
        'joao@teste.com',
      ]);

      expect(rows[0].senha_hash).not.toBe('SenhaSegura1');
      // Assinatura de um hash bcrypt: $2a$/$2b$ seguido do custo.
      expect(rows[0].senha_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    test('normaliza o e-mail para minusculas', async () => {
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, email: 'JOAO@TESTE.COM' });

      expect(resposta.status).toBe(201);
      expect(resposta.body.dados.usuario.email).toBe('joao@teste.com');
    });

    test('cadastra agricultor e cria o perfil da propriedade', async () => {
      const resposta = await request(app).post('/api/v1/auth/register').send(AGRICULTOR);

      expect(resposta.status).toBe(201);
      expect(resposta.body.dados.usuario.tipo).toBe('agricultor');

      const perfil = await request(app)
        .get('/api/v1/usuarios/profile')
        .set('Authorization', `Bearer ${resposta.body.dados.token}`);

      expect(perfil.status).toBe(200);
      expect(perfil.body.dados.agricultor).not.toBeNull();
      expect(perfil.body.dados.agricultor.nome_fazenda).toBe('Sitio Boa Vista');

      /*
       * A localizacao da PROPRIEDADE precisa vir do objeto `agricultor`.
       *
       * O usuario deste payload nao informa cidade/estado no nivel de
       * cima, entao nao ha fallback que mascare o resultado: se o schema
       * descartasse esses campos do objeto aninhado, o valor viria null
       * e este teste falharia. Foi exatamente o que aconteceu quando
       * `cidade` e `estado` faltavam no perfilAgricultorSchema.
       */
      expect(perfil.body.dados.agricultor.cidade).toBe('Campinas');
      expect(perfil.body.dados.agricultor.estado).toBe('SP');
    });

    test('a localizacao da propriedade tem prioridade sobre a do usuario', async () => {
      // Produtor mora em Recife, mas a propriedade fica em Campinas.
      // O filtro "produtores da minha regiao" usa a localizacao da
      // PROPRIEDADE, entao e ela que precisa prevalecer.
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: 'Produtor Viajante',
          email: 'viajante@teste.com',
          senha: 'SenhaSegura1',
          tipo: 'agricultor',
          cidade: 'Recife',
          estado: 'PE',
          agricultor: { nome_fazenda: 'Fazenda Interior', cidade: 'Campinas', estado: 'SP' },
        });

      expect(resposta.status).toBe(201);

      const perfil = await request(app)
        .get('/api/v1/usuarios/profile')
        .set('Authorization', `Bearer ${resposta.body.dados.token}`);

      expect(perfil.body.dados.cidade).toBe('Recife');
      expect(perfil.body.dados.agricultor.cidade).toBe('Campinas');
    });
  });

  describe('escalacao de privilegio', () => {
    test('RECUSA cadastro com tipo=administrador', async () => {
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, tipo: 'administrador' });

      expect(resposta.status).toBe(400);
      expect(resposta.body.erro.codigo).toBe('DADOS_INVALIDOS');

      // E o mais importante: nenhum administrador foi criado.
      const { rows } = await pool.query(
        "SELECT count(*)::int AS total FROM usuarios WHERE tipo = 'administrador'",
      );
      expect(rows[0].total).toBe(0);
    });

    test('o service forca tipo cliente mesmo se a validacao for contornada', async () => {
      /*
       * Teste da DEFESA EM PROFUNDIDADE.
       *
       * Chamamos o service direto, pulando o schema Zod, simulando o
       * cenario em que alguem afrouxe o enum no futuro. O service tem que
       * continuar barrando por conta propria.
       */
      const authService = (await import('../../src/services/authService.js')).default;

      const { usuario } = await authService.cadastrar({
        nome: 'Invasor',
        email: 'invasor@teste.com',
        senha: 'SenhaSegura1',
        tipo: 'administrador',
      });

      expect(usuario.tipo).toBe('cliente');

      const { rows } = await pool.query(
        "SELECT count(*)::int AS total FROM usuarios WHERE tipo = 'administrador'",
      );
      expect(rows[0].total).toBe(0);
    });

    test('RECUSA perfil de propriedade quando o tipo e cliente', async () => {
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, agricultor: { nome_fazenda: 'Fazenda Fantasma' } });

      expect(resposta.status).toBe(400);
    });

    test('EXIGE dados da propriedade quando o tipo e agricultor', async () => {
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, email: 'semfazenda@teste.com', tipo: 'agricultor' });

      expect(resposta.status).toBe(400);
    });
  });

  describe('validacao de entrada', () => {
    test('recusa e-mail duplicado com 409', async () => {
      await request(app).post('/api/v1/auth/register').send(CLIENTE);
      const resposta = await request(app).post('/api/v1/auth/register').send(CLIENTE);

      expect(resposta.status).toBe(409);
      expect(resposta.body.erro.codigo).toBe('CONFLITO');
    });

    test('recusa e-mail duplicado ignorando maiusculas', async () => {
      await request(app).post('/api/v1/auth/register').send(CLIENTE);
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, email: 'JOAO@teste.com' });

      expect(resposta.status).toBe(409);
    });

    test('recusa senha fraca e informa o campo', async () => {
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, senha: '123' });

      expect(resposta.status).toBe(400);
      const campos = resposta.body.erro.detalhes.map((d) => d.campo);
      expect(campos).toContain('senha');
    });

    test('recusa senha sem numero', async () => {
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, senha: 'apenasLetras' });

      expect(resposta.status).toBe(400);
    });

    test('recusa senha acima de 72 bytes mesmo com 72 caracteres', async () => {
      // 70 caracteres + '1' + 2 acentos = 73 caracteres, 75 bytes.
      // Sem a checagem de bytes, o bcrypt truncaria em silencio.
      const senhaAcimaDoLimite = 'A'.repeat(69) + '1' + 'çç';

      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, senha: senhaAcimaDoLimite });

      expect(resposta.status).toBe(400);
    });

    test('recusa e-mail com formato invalido', async () => {
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, email: 'nao-e-email' });

      expect(resposta.status).toBe(400);
    });

    test('recusa nome curto demais', async () => {
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, nome: 'J' });

      expect(resposta.status).toBe(400);
    });

    test('descarta campos nao declarados (mass assignment)', async () => {
      const resposta = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...CLIENTE, ativo: false, id: 9999, senha_hash: 'injetado' });

      expect(resposta.status).toBe(201);
      // `ativo` e `id` enviados pelo cliente nao tem efeito nenhum.
      expect(resposta.body.dados.usuario.ativo).toBe(true);
      expect(resposta.body.dados.usuario.id).not.toBe(9999);
    });
  });

  test('nao deixa usuario orfao quando o perfil de agricultor falha', async () => {
    /*
     * Teste da TRANSACAO.
     *
     * Forcamos a falha do segundo INSERT enviando o mesmo nome de fazenda
     * com um payload que passa na validacao mas quebra no banco. O que
     * importa: o usuario NAO pode ficar gravado.
     */
    const authService = (await import('../../src/services/authService.js')).default;

    await expect(
      authService.cadastrar({
        nome: 'Falha Transacao',
        email: 'falha@teste.com',
        senha: 'SenhaSegura1',
        tipo: 'agricultor',
        // certificacoes como string em vez de array explode no driver do pg.
        agricultor: { nome_fazenda: 'Fazenda X', certificacoes: 'nao-e-array' },
      }),
    ).rejects.toThrow();

    const { rows } = await pool.query(
      "SELECT count(*)::int AS total FROM usuarios WHERE email = 'falha@teste.com'",
    );
    expect(rows[0].total).toBe(0);
  });
});