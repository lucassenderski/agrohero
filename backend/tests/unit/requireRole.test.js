import { requireRole } from '../../src/middlewares/requireRole.js';

/*
 * Testes de unidade da autorizacao por papel.
 *
 * Os testes de integracao cobrem as rotas que usam requireRole, mas o
 * middleware tem caminhos que nenhuma rota atual exercita - como a
 * recusa de um papel desconhecido. Chamamos o middleware direto, com
 * req/res falsos, para isolar a decisao de autorizacao.
 */

/** Executa o middleware e devolve o erro passado ao next (ou null). */
function executar(middleware, req) {
  let capturado = null;
  middleware(req, {}, (erro) => {
    capturado = erro ?? null;
  });
  return capturado;
}

describe('requireRole', () => {
  test('sem argumentos lanca na criacao (falha na subida, nao na requisicao)', () => {
    // Uma rota com requireRole() sem papeis seria uma rota que ninguem
    // acessa - ou uma checagem que passou batido na revisao.
    expect(() => requireRole()).toThrow(/pelo menos um papel/i);
  });

  test('usuario ausente recebe 401, nao 403', () => {
    // O problema e autenticacao ausente. Um 403 mandaria o frontend
    // mostrar "acesso negado" em vez de pedir login.
    const erro = executar(requireRole('agricultor'), { usuario: null });

    expect(erro).not.toBeNull();
    expect(erro.statusCode).toBe(401);
    expect(erro.codigo).toBe('NAO_AUTENTICADO');
  });

  test('papel permitido passa sem erro', () => {
    const erro = executar(requireRole('agricultor'), {
      usuario: { id: 1, tipo: 'agricultor' },
      method: 'GET',
      originalUrl: '/teste',
    });

    expect(erro).toBeNull();
  });

  test('papel nao permitido recebe 403', () => {
    const erro = executar(requireRole('agricultor'), {
      usuario: { id: 1, tipo: 'cliente' },
      method: 'GET',
      originalUrl: '/teste',
    });

    expect(erro).not.toBeNull();
    expect(erro.statusCode).toBe(403);
    expect(erro.codigo).toBe('SEM_PERMISSAO');
  });

  test('varios papeis: qualquer um deles passa', () => {
    // Rotas compartilhadas, como o PATCH de cancelamento (cliente e admin).
    const middleware = requireRole('cliente', 'administrador');

    for (const tipo of ['cliente', 'administrador']) {
      const erro = executar(middleware, {
        usuario: { id: 1, tipo },
        method: 'PATCH',
        originalUrl: '/teste',
      });
      expect(erro).toBeNull();
    }
  });

  test('varios papeis: papel fora da lista e recusado', () => {
    const erro = executar(requireRole('cliente', 'administrador'), {
      usuario: { id: 1, tipo: 'agricultor' },
      method: 'PATCH',
      originalUrl: '/teste',
    });

    expect(erro.statusCode).toBe(403);
  });

  test('tipo desconhecido nunca passa, mesmo com a lista vazia de papeis', () => {
    /*
     * Defesa contra um tipo invalido no banco (ou um campo ausente):
     * `undefined` nao esta em nenhuma lista, entao a comparacao falha
     * fechada. Um `includes` mal escrito que aceitasse undefined seria
     * uma porta aberta.
     */
    const erro = executar(requireRole('cliente'), {
      usuario: { id: 1, tipo: undefined },
      method: 'GET',
      originalUrl: '/teste',
    });

    expect(erro.statusCode).toBe(403);
  });

  test('administrador NAO passa sozinho por uma rota de agricultor', () => {
    /*
     * Nao ha bypass implicito de admin. Cada rota declara quem entra; se
     * o admin precisar de acesso, ele e listado explicitamente. Um
     * bypass global esconderia da leitura da rota quem realmente tem
     * acesso a ela.
     */
    const erro = executar(requireRole('agricultor'), {
      usuario: { id: 1, tipo: 'administrador' },
      method: 'GET',
      originalUrl: '/teste',
    });

    expect(erro.statusCode).toBe(403);
  });
});