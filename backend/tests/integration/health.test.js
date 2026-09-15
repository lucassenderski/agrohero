import request from 'supertest';
import app from '../../src/app.js';
import { encerrarPool } from '../../src/database/pool.js';

/*
 * Testes de integracao da FASE 1.
 *
 * Sao testes de verdade: sobem o Express e conversam com o PostgreSQL
 * real do Docker. Nada de mock de banco - o objetivo e provar que as
 * pecas se conectam.
 */

afterAll(async () => {
  // Fecha o pool, senao o Jest fica pendurado esperando conexoes abertas.
  await encerrarPool();
});

describe('GET /health', () => {
  it('responde 200 com api e banco em ok quando o PostgreSQL esta acessivel', async () => {
    const resposta = await request(app).get('/health');

    expect(resposta.status).toBe(200);
    expect(resposta.body.sucesso).toBe(true);
    expect(resposta.body.dados.api).toBe('ok');
    expect(resposta.body.dados.banco).toBe('ok');
    expect(resposta.body.dados.ambiente).toBe('test');
    expect(typeof resposta.body.dados.latenciaBancoMs).toBe('number');
  });
});

describe('Envelope de resposta', () => {
  it('responde 404 no formato padronizado para rota inexistente', async () => {
    const resposta = await request(app).get('/api/v1/rota-que-nao-existe');

    expect(resposta.status).toBe(404);
    expect(resposta.body.sucesso).toBe(false);
    expect(resposta.body.erro.codigo).toBe('ROTA_NAO_ENCONTRADA');
    // A mensagem nao pode vazar caminho de arquivo nem stack trace.
    expect(resposta.body.erro.mensagem).not.toMatch(/at |\.js|\/src\//);
  });

  it('responde 400 quando o corpo nao e um JSON valido', async () => {
    const resposta = await request(app)
      .post('/api/v1/qualquer')
      .set('Content-Type', 'application/json')
      .send('{quebrado');

    expect(resposta.status).toBe(400);
    expect(resposta.body.erro.codigo).toBe('JSON_INVALIDO');
  });

  it('responde 404 para metodo nao suportado na raiz', async () => {
    const resposta = await request(app).delete('/');

    expect(resposta.status).toBe(404);
    expect(resposta.body.sucesso).toBe(false);
  });
});

describe('Cabecalhos de seguranca (helmet)', () => {
  it('nao expoe o cabecalho X-Powered-By', async () => {
    const resposta = await request(app).get('/health');
    expect(resposta.headers['x-powered-by']).toBeUndefined();
  });

  it('envia cabecalhos de protecao do helmet', async () => {
    const resposta = await request(app).get('/health');
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['x-frame-options']).toBeDefined();
  });
});

describe('CORS com lista branca', () => {
  it('permite origem cadastrada em CORS_ORIGINS', async () => {
    const resposta = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');

    expect(resposta.status).toBe(200);
    expect(resposta.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('bloqueia origem desconhecida com 403', async () => {
    const resposta = await request(app)
      .get('/health')
      .set('Origin', 'http://site-malicioso.example.com');

    expect(resposta.status).toBe(403);
    expect(resposta.body.erro.codigo).toBe('CORS_BLOQUEADO');
  });
});