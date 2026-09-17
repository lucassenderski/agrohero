import { z } from 'zod';
import { idParametro, cep, estado } from '../utils/validacao.js';

/*
 * Schemas de endereco de entrega.
 *
 * Os campos espelham exatamente as constraints do banco:
 *   - CEP com 8 digitos, sem hifen (o frontend formata na exibicao)
 *   - estado como sigla de 2 letras maiusculas
 *
 * Validar aqui E no banco nao e redundancia inutil: aqui a mensagem e
 * boa e aponta o campo ("O CEP deve conter exatamente 8 digitos"), no
 * banco e a garantia final contra qualquer caminho que pule a validacao.
 */

const nomeDestinatario = z
  .string({ required_error: 'O nome do destinatario e obrigatorio.' })
  .trim()
  .min(3, 'O nome do destinatario deve ter ao menos 3 caracteres.')
  .max(120, 'O nome do destinatario deve ter no maximo 120 caracteres.');

const rua = z
  .string({ required_error: 'A rua e obrigatoria.' })
  .trim()
  .min(3, 'A rua deve ter ao menos 3 caracteres.')
  .max(160, 'A rua deve ter no maximo 160 caracteres.');

const numero = z
  .string({ required_error: 'O numero e obrigatorio.' })
  .trim()
  .min(1, 'O numero e obrigatorio.')
  .max(20, 'O numero deve ter no maximo 20 caracteres.');

/*
 * Complemento e opcional. Aceita string vazia e normaliza para null -
 * um campo em branco no formulario nao deve virar string vazia no banco.
 */
const complemento = z
  .string()
  .trim()
  .max(80, 'O complemento deve ter no maximo 80 caracteres.')
  .optional()
  .nullable()
  .transform((valor) => (valor === '' || valor === undefined ? null : valor));

const bairro = z
  .string({ required_error: 'O bairro e obrigatorio.' })
  .trim()
  .min(2, 'O bairro deve ter ao menos 2 caracteres.')
  .max(80, 'O bairro deve ter no maximo 80 caracteres.');

const cidade = z
  .string({ required_error: 'A cidade e obrigatoria.' })
  .trim()
  .min(2, 'A cidade deve ter ao menos 2 caracteres.')
  .max(80, 'A cidade deve ter no maximo 80 caracteres.');

export const criarEnderecoSchema = z.object({
  nome_destinatario: nomeDestinatario,
  cep,
  rua,
  numero,
  complemento,
  bairro,
  cidade,
  estado,
});

/*
 * Atualizacao: todos os campos obrigatorios.
 *
 * Diferente do PATCH de produto, aqui a atualizacao e uma SUBSTITUICAO
 * completa. Um endereco com rua nova e numero antigo e um endereco
 * errado, e um PATCH parcial convidaria a esse estado inconsistente.
 * O cliente reenvia o formulario inteiro.
 */
export const atualizarEnderecoSchema = criarEnderecoSchema;

export const enderecoIdParamSchema = z.object({
  id: idParametro,
});

export default {
  criarEnderecoSchema,
  atualizarEnderecoSchema,
  enderecoIdParamSchema,
};
