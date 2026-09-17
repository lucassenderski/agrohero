/*
 * Validacao no cliente.
 *
 * Isto NAO substitui a validacao do servidor - e conveniencia de
 * interface, para dar retorno imediato sem ida a rede. O backend
 * revalida tudo: se estas regras divergirem das dele, quem manda e ele.
 */

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarEmail(email) {
  if (!email || !email.trim()) return 'Informe o e-mail.';
  if (!REGEX_EMAIL.test(email.trim())) return 'Informe um e-mail valido.';
  return null;
}

/*
 * Mesma regra do backend: minimo 8 caracteres, com letra e numero.
 * Manter em sincronia evita o usuario ver "senha forte" no cadastro e
 * receber 400 do servidor.
 */
export function validarSenha(senha) {
  if (!senha) return 'Informe a senha.';
  if (senha.length < 8) return 'A senha deve ter ao menos 8 caracteres.';
  if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
    return 'A senha deve conter letras e numeros.';
  }
  return null;
}

export function validarNome(nome) {
  if (!nome || !nome.trim()) return 'Informe o nome.';
  if (nome.trim().length < 3) return 'O nome deve ter ao menos 3 caracteres.';
  return null;
}

export function validarPreco(valor) {
  const numero = Number(valor);
  if (valor === '' || valor === null || valor === undefined) return 'Informe o preco.';
  if (!Number.isFinite(numero)) return 'O preco deve ser um numero.';
  if (numero <= 0) return 'O preco deve ser maior que zero.';
  return null;
}

export function validarEstoque(valor) {
  const numero = Number(valor);
  if (valor === '' || valor === null || valor === undefined) return 'Informe o estoque.';
  if (!Number.isInteger(numero)) return 'O estoque deve ser um numero inteiro.';
  if (numero < 0) return 'O estoque nao pode ser negativo.';
  return null;
}

/*
 * Valida um objeto de campos e devolve { campo: mensagem }.
 * Retorna objeto vazio quando nao ha erro - assim o chamador usa
 * `Object.keys(erros).length === 0`.
 */
export function validarCampos(valores, regras) {
  const erros = {};
  Object.entries(regras).forEach(([campo, regra]) => {
    const mensagem = regra(valores[campo], valores);
    if (mensagem) erros[campo] = mensagem;
  });
  return erros;
}
