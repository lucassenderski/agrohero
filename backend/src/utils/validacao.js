import { z } from 'zod';
import { AppError } from './AppError.js';

/*
 * Utilitarios de validacao.
 *
 * A regra do projeto: toda entrada vinda do cliente (body, params, query)
 * passa por um schema Zod antes de chegar ao controller. "Nunca confie no
 * ID enviado pelo frontend" (requisito 8) comeca aqui.
 *
 * Este arquivo tem tres partes:
 *   1. formatarErrosZod - transforma o erro tecnico do Zod em uma lista
 *      que o frontend consegue usar para marcar campos em vermelho;
 *   2. schemas reutilizaveis - id, email, senha, preco, quantidade...;
 *   3. validar - executa o schema e lanca um AppError 400 padronizado.
 */

/*
 * Converte o erro do Zod em [{ campo, mensagem }].
 *
 * Por que normalizar: o Zod devolve uma estrutura util para programa,
 * nao para tela. O frontend precisa saber QUAL campo falhou para
 * destacar o input, e o erro do Zod aninhado (ex.: itens[2].quantidade)
 * precisa virar um caminho legivel.
 */
export function formatarErrosZod(erroZod) {
  return erroZod.issues.map((issue) => ({
    campo: issue.path.length > 0 ? issue.path.join('.') : 'corpo',
    mensagem: issue.message,
  }));
}

/* ----------------------------------------------------------
 * Schemas reutilizaveis
 * ---------------------------------------------------------- */

/*
 * ID numerico positivo.
 *
 * Sem isso, um GET /produtos/abc chegaria ao banco e o PostgreSQL
 * devolveria o erro 22P02 (invalid_text_representation), que o
 * errorHandler traduziria como 400. Validando antes, a resposta e mais
 * clara e a query nem e executada.
 */
export const idParametro = z.coerce
  .number({ invalid_type_error: 'O identificador deve ser um numero.' })
  .int('O identificador deve ser um numero inteiro.')
  .positive('O identificador deve ser maior que zero.');

/* CEP apenas com digitos, igual a constraint do banco. */
export const cep = z
  .string()
  .trim()
  .regex(/^[0-9]{8}$/, 'O CEP deve conter exatamente 8 digitos, sem hifen.');

/* UF com duas letras maiusculas. */
export const estado = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'O estado deve ser a sigla com 2 letras (ex.: SP).');

/*
 * E-mail.
 *
 * O `.toLowerCase()` e essencial: o banco tem um CHECK que exige e-mail
 * em minusculas e um indice unico sobre lower(email). Normalizando aqui,
 * o usuario pode digitar "Joao@Teste.com" sem receber erro de constraint.
 */
export const email = z
  .string({ required_error: 'O e-mail e obrigatorio.' })
  .trim()
  .toLowerCase()
  .min(5, 'O e-mail e curto demais.')
  .max(160, 'O e-mail deve ter no maximo 160 caracteres.')
  .email('Informe um e-mail valido.');

/*
 * Senha.
 *
 * Minimo de 8 caracteres com letra e numero. Nao exigimos simbolo nem
 * maiuscula de proposito: a regra mais eficaz e comprimento, e regras
 * muito rigidas empurram o usuario para "Senha@123" previsivel.
 */
export const senha = z
  .string({ required_error: 'A senha e obrigatoria.' })
  .min(8, 'A senha deve ter no minimo 8 caracteres.')
  .max(72, 'A senha deve ter no maximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'A senha deve conter pelo menos uma letra.')
  .regex(/[0-9]/, 'A senha deve conter pelo menos um numero.');

/* Nome de pessoa ou de propriedade. */
export const nome = z
  .string({ required_error: 'O nome e obrigatorio.' })
  .trim()
  .min(2, 'O nome deve ter no minimo 2 caracteres.')
  .max(120, 'O nome deve ter no maximo 120 caracteres.');

/*
 * Preco em reais.
 *
 * z.coerce.number aceita "8.50" (string da query string) e 8.5 (numero).
 * O refine garante as duas casas decimais: sem ele, 8.999 seria gravado
 * como 9.00 pelo NUMERIC(10,2) e o total do pedido nao fecharia.
 */
export const preco = z.coerce
  .number({ invalid_type_error: 'O preco deve ser um numero.' })
  .positive('O preco deve ser maior que zero.')
  .max(999999.99, 'O preco informado e alto demais.')
  .refine(
    (valor) => Number.isInteger(Math.round(valor * 100)) && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-9,
    'O preco deve ter no maximo 2 casas decimais.',
  );

/* Quantidade sempre inteira e maior que zero. */
export const quantidade = z.coerce
  .number({ invalid_type_error: 'A quantidade deve ser um numero.' })
  .int('A quantidade deve ser um numero inteiro.')
  .positive('A quantidade deve ser maior que zero.');

/* Estoque aceita zero (produto esgotado), mas nunca negativo. */
export const estoque = z.coerce
  .number({ invalid_type_error: 'O estoque deve ser um numero.' })
  .int('O estoque deve ser um numero inteiro.')
  .min(0, 'O estoque nao pode ser negativo.')
  .max(1000000, 'O estoque informado e alto demais.');

/* Nota de avaliacao: mesma faixa do CHECK do banco. */
export const nota = z.coerce
  .number({ invalid_type_error: 'A nota deve ser um numero.' })
  .int('A nota deve ser um numero inteiro.')
  .min(1, 'A nota deve ser no minimo 1.')
  .max(5, 'A nota deve ser no maximo 5.');

/* Tipo de usuario: mesma lista do CHECK do banco. */
export const tipoUsuario = z.enum(['cliente', 'agricultor', 'administrador'], {
  errorMap: () => ({ message: 'O tipo deve ser cliente, agricultor ou administrador.' }),
});

/* URL de imagem (o arquivo em si fica no servico de armazenamento). */
export const urlImagem = z
  .string()
  .trim()
  .url('Informe uma URL valida.')
  .max(500, 'A URL da imagem e longa demais.');

/* Texto opcional com limite de tamanho. */
export const textoOpcional = (maximo, rotulo = 'O texto') =>
  z
    .string()
    .trim()
    .max(maximo, `${rotulo} deve ter no maximo ${maximo} caracteres.`)
    .optional()
    .transform((valor) => (valor === '' ? undefined : valor));

/* ----------------------------------------------------------
 * Execucao
 * ---------------------------------------------------------- */

/*
 * Executa um schema e devolve os dados validados (e convertidos).
 *
 * Importante: o resultado e o valor SEGURO. Sempre use o retorno desta
 * funcao, e nunca o objeto original da requisicao - e o retorno que
 * passou pela normalizacao (trim, lowercase, conversao de tipo).
 *
 * O erro sai como 400 DADOS_INVALIDOS com a lista de campos, que e o
 * formato que o frontend usa para marcar os inputs.
 */
export function validarComSchema(schema, dados) {
  const resultado = schema.safeParse(dados);

  if (!resultado.success) {
    throw new AppError(
      'Dados invalidos.',
      400,
      'DADOS_INVALIDOS',
      formatarErrosZod(resultado.error),
    );
  }

  return resultado.data;
}

export default {
  formatarErrosZod,
  validarComSchema,
  idParametro,
  cep,
  estado,
  email,
  senha,
  nome,
  preco,
  quantidade,
  estoque,
  nota,
  tipoUsuario,
  urlImagem,
  textoOpcional,
};