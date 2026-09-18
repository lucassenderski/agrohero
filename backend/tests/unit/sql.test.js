import { escaparTermoBusca } from '../../src/utils/sql.js';

/*
 * Testes de unidade do escape de termo de busca.
 *
 * `%` e `_` sao curingas do LIKE. Se o termo do usuario for interpolado
 * sem escape, procurar "100%" casa com qualquer nome contendo "100" - o
 * usuario pede um filtro especifico e recebe resultados sem relacao,
 * sem entender por que.
 */

describe('escaparTermoBusca', () => {
  test('escapa o curinga de porcentagem', () => {
    expect(escaparTermoBusca('100%')).toBe('100\\%');
  });

  test('escapa o curinga de um caractere', () => {
    expect(escaparTermoBusca('a_b')).toBe('a\\_b');
  });

  test('a barra invertida e escapada PRIMEIRO', () => {
    /*
     * A ordem importa. Se a barra fosse escapada por ultimo, as barras
     * recem-inseridas para escapar `%` e `_` seriam escapadas de novo e
     * virariam `\\%`, que o LIKE le como "barra literal seguida de
     * curinga" - o escape deixaria de funcionar.
     */
    expect(escaparTermoBusca('\\')).toBe('\\\\');
    expect(escaparTermoBusca('\\%')).toBe('\\\\\\%');
  });

  test('texto sem curingas passa inalterado', () => {
    expect(escaparTermoBusca('Tomate Cereja')).toBe('Tomate Cereja');
    expect(escaparTermoBusca('')).toBe('');
  });

  test('escapa todos os curingas da string, nao so o primeiro', () => {
    expect(escaparTermoBusca('%_%')).toBe('\\%\\_\\%');
  });

  test('aspas e ponto-e-virgula NAO sao tratados aqui', () => {
    /*
     * Este helper so cuida do LIKE. Aspas e `;` nao precisam de tratamento
     * porque a consulta e parametrizada ($1) - o driver envia o valor
     * separado do SQL, entao ele nunca e interpretado como comando. O
     * teste fica como documentacao dessa divisao de responsabilidade.
     */
    expect(escaparTermoBusca("'; DROP TABLE produtos; --")).toBe(
      "'; DROP TABLE produtos; --",
    );
  });
});