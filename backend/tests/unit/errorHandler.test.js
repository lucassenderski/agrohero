import { errorHandler } from '../../src/middlewares/errorHandler.js';
import { AppError } from '../../src/utils/AppError.js';
import env from '../../src/config/env.js';

/*
 * Testes de unidade do tratamento de erros.
 *
 * O mapeamento de codigos do PostgreSQL para respostas HTTP e a supressao
 * de detalhe em producao nao tinham cobertura: so eram exercitados por
 * acidente, quando algum teste de integracao violava uma constraint. Sao
 * exatamente os caminhos que nao aparecem no fluxo feliz.
 *
 * Chamamos o errorHandler direto, com req/res falsos, porque o que
 * interessa aqui e a RESPOSTA montada - nao a rota que levou ate ela.
 */

/** Resposta falsa que guarda o que o handler escreveu. */
function respostaFalsa() {
  return {
    statusCode: null,
    corpo: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(payload) {
      this.corpo = payload;
      return this;
    },
  };
}

function requisicaoFalsa(extras = {}) {
  return { method: 'GET', originalUrl: '/teste', usuario: null, ...extras };
}

/** Executa o handler e devolve a resposta montada. */
function tratar(erro, req = requisicaoFalsa()) {
  const res = respostaFalsa();
  errorHandler(erro, req, res, () => {});
  return res;
}

describe('mapeamento de erros do PostgreSQL', () => {
  /*
   * Cada caso amarra o codigo do PostgreSQL a uma resposta HTTP. Sao
   * traducoes que evitam vazar "duplicate key value violates unique
   * constraint" para o cliente.
   */
  test.each([
    ['23505', 409, 'CONFLITO'],
    ['23503', 409, 'REFERENCIA_INVALIDA'],
    ['23514', 422, 'VALOR_INVALIDO'],
    ['22P02', 400, 'ID_INVALIDO'],
    ['23502', 400, 'CAMPO_OBRIGATORIO'],
  ])('codigo %s vira status %i com codigo %s', (code, status, codigo) => {
    const res = tratar({ code, detail: 'detalhe tecnico', column: 'coluna' });

    expect(res.statusCode).toBe(status);
    expect(res.corpo.erro.codigo).toBe(codigo);
  });

  test('codigo desconhecido vira 500 generico', () => {
    const res = tratar({ code: 'XX999', message: 'falha obscura' });

    expect(res.statusCode).toBe(500);
    expect(res.corpo.erro.codigo).toBe('ERRO_INTERNO');
  });

  test('23503 (violacao de FK) nao vira 400 nem 500', () => {
    // Referencia invalida e conflito de estado, nao dado malformado.
    const res = tratar({ code: '23503', detail: 'ainda em uso' });
    expect(res.statusCode).toBe(409);
  });
});

describe('erros do body-parser', () => {
  test('JSON malformado vira 400', () => {
    const res = tratar({ type: 'entity.parse.failed' });

    expect(res.statusCode).toBe(400);
    expect(res.corpo.erro.codigo).toBe('JSON_INVALIDO');
  });

  test('corpo grande demais vira 413', () => {
    const res = tratar({ type: 'entity.too.large' });

    expect(res.statusCode).toBe(413);
    expect(res.corpo.erro.codigo).toBe('PAYLOAD_MUITO_GRANDE');
  });
});

describe('supressao de detalhe em producao', () => {
  /*
   * A mensagem original de um erro 500 pode conter nome de tabela, de
   * coluna e ate o valor que falhou. O teste alterna env.ehProducao e
   * restaura no finally - o objeto env e mutavel de proposito.
   */
  const original = env.ehProducao;

  afterEach(() => {
    env.ehProducao = original;
  });

  test('em producao, o erro 500 nao devolve o detalhe tecnico', () => {
    env.ehProducao = true;

    const erro = new AppError('Erro interno do servidor.', 500, 'ERRO_INTERNO', [
      { campo: 'senha_hash', problema: 'relation "usuarios" does not exist' },
    ]);

    const res = tratar(erro);

    expect(res.statusCode).toBe(500);
    expect(res.corpo.erro.detalhes).toBeUndefined();
    expect(JSON.stringify(res.corpo)).not.toContain('senha_hash');
    expect(JSON.stringify(res.corpo)).not.toContain('usuarios');
  });

  test('fora de producao, a lista de detalhes aparece para ajudar a depurar', () => {
    env.ehProducao = false;

    const erro = new AppError('Erro interno do servidor.', 500, 'ERRO_INTERNO', [
      { campo: 'tabela', problema: 'relation "usuarios" does not exist' },
    ]);

    const res = tratar(erro);

    expect(res.corpo.erro.detalhes).toEqual([
      { campo: 'tabela', problema: 'relation "usuarios" does not exist' },
    ]);
  });

  test('detalhe que nao e lista e descartado em qualquer ambiente', () => {
    /*
     * O envelope so aceita `detalhes` quando e uma lista nao vazia. Isso
     * e uma segunda barreira: se um service devolver um objeto solto
     * (ex.: { tabela: 'usuarios' }), ele nao chega ao cliente nem em
     * desenvolvimento - um objeto costuma ser dado interno vazado, nao
     * mensagem de validacao.
     */
    env.ehProducao = false;

    const erro = new AppError('Erro.', 500, 'ERRO_INTERNO', { tabela: 'usuarios' });
    const res = tratar(erro);

    expect(res.corpo.erro).not.toHaveProperty('detalhes');
  });

  test('erro 400 mantem a mensagem em producao (o cliente e que corrige)', () => {
    env.ehProducao = true;

    const erro = new AppError('O preco deve ser maior que zero.', 400, 'DADOS_INVALIDOS');
    const res = tratar(erro);

    expect(res.corpo.erro.mensagem).toBe('O preco deve ser maior que zero.');
  });

  test('a resposta nunca inclui stack trace', () => {
    env.ehProducao = false;

    const res = tratar(new Error('falha com stack'));
    const serializado = JSON.stringify(res.corpo);

    expect(serializado).not.toContain('at ');
    expect(serializado).not.toContain('.js:');
    expect(res.corpo.erro).not.toHaveProperty('stack');
  });
});