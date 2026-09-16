import { AppError } from './AppError.js';

/*
 * Paginacao.
 *
 * O requisito 12 e explicito: "nao carregar milhares de produtos de uma
 * vez". Isso significa que toda listagem publica e paginada, e que o
 * LIMITE MAXIMO e imposto pelo servidor - nunca pelo cliente.
 *
 * Por que o teto importa: se o limite viesse livre da query string, um
 * GET /produtos?limite=999999 derrubaria a API. Nao e um detalhe de
 * performance, e disponibilidade.
 */

export const LIMITE_PADRAO = 20;
export const LIMITE_MAXIMO = 100;

/*
 * Le pagina e limite da query string, aplicando os limites seguros.
 * Sempre devolve numeros validos, mesmo se o cliente mandar lixo.
 */
export function lerPaginacao(query = {}, { limitePadrao = LIMITE_PADRAO, limiteMaximo = LIMITE_MAXIMO } = {}) {
  const pagina = Math.max(1, Number.parseInt(query.pagina, 10) || 1);

  const limiteBruto = Number.parseInt(query.limite, 10) || limitePadrao;
  const limite = Math.min(Math.max(1, limiteBruto), limiteMaximo);

  return {
    pagina,
    limite,
    // OFFSET calculado aqui para o repository nao repetir a conta.
    offset: (pagina - 1) * limite,
  };
}

/*
 * Monta o bloco de paginacao do envelope de resposta.
 * E esse objeto que o frontend usa para desenhar os botoes de navegacao.
 */
export function montarPaginacao({ pagina, limite, total }) {
  const totalSeguro = Number(total) || 0;
  const paginas = Math.max(1, Math.ceil(totalSeguro / limite));

  return {
    pagina,
    limite,
    total: totalSeguro,
    paginas,
    temAnterior: pagina > 1,
    temProxima: pagina < paginas,
  };
}

/*
 * Valida a pagina pedida contra o total real.
 *
 * Serve para dar um erro claro em vez de uma lista vazia confusa: se
 * existem 3 paginas e o cliente pede a pagina 99, respondemos 404 em vez
 * de "nenhum produto encontrado", que faria o usuario achar que o
 * marketplace esta vazio.
 */
export function validarPaginaExiste({ pagina, paginas, total }, recurso = 'Recurso') {
  if (total > 0 && pagina > paginas) {
    throw new AppError(
      `${recurso} nao encontrado: existem apenas ${paginas} pagina(s) e foi pedida a pagina ${pagina}.`,
      404,
      'PAGINA_INEXISTENTE',
      { pagina, paginas, total },
    );
  }
}

export default { lerPaginacao, montarPaginacao, validarPaginaExiste, LIMITE_PADRAO, LIMITE_MAXIMO };