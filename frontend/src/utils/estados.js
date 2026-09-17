/* Unidades federativas, para os selects de estado. */

export const ESTADOS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/*
 * Unidade de venda. Lista fechada, espelhando UNIDADES em
 * backend/src/validators/produtoValidators.js.
 *
 * "maço" leva cedilha: o backend aceita exatamente esta grafia, e
 * enviar "maco" devolve 400. O select usa o valor cru, entao a
 * constante precisa bater com o enum do servidor caractere a caractere.
 */
export const UNIDADES_PRODUTO = [
  'unidade', 'kg', 'g', 'litro', 'ml', 'duzia', 'bandeja', 'maço', 'caixa', 'pacote',
];

export const METODOS_PAGAMENTO = [
  { valor: 'PIX', rotulo: 'PIX' },
  { valor: 'CARTAO', rotulo: 'Cartao de credito' },
  { valor: 'BOLETO', rotulo: 'Boleto' },
];

/* `situacao` no backend tem default 'todos' - nao string vazia. */
export const SITUACOES_PRODUTO = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'ativos', rotulo: 'Ativos' },
  { valor: 'inativos', rotulo: 'Inativos' },
  { valor: 'esgotados', rotulo: 'Esgotados' },
];
