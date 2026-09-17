import { z } from 'zod';
import {
  nome as nomeSchema,
  telefone as telefoneSchema,
  estado as estadoSchema,
  senha as senhaSchema,
  textoOpcional,
} from '../utils/validacao.js';

/*
 * Schemas de validacao do perfil do usuario autenticado.
 *
 * Nenhum destes schemas aceita `email` ou `tipo`. Nao e esquecimento:
 * sao campos que o usuario NAO pode alterar por esta via (trocar o
 * proprio tipo seria escalacao de privilegio, e trocar e-mail exige
 * verificacao do novo endereco). Como o Zod remove campos nao
 * declarados, mesmo que alguem envie {"tipo":"administrador"} no PUT,
 * o valor e descartado antes de chegar ao service.
 */

const perfilAgricultorAtualizacaoSchema = z.object({
  nome_fazenda: nomeSchema.max(140, 'O nome da fazenda deve ter no maximo 140 caracteres.').optional(),
  descricao: textoOpcional(2000, 'A descricao'),
  historia: textoOpcional(4000, 'A historia'),
  endereco: textoOpcional(200, 'O endereco'),
  cidade: textoOpcional(80, 'A cidade'),
  estado: estadoSchema.optional(),
  certificacoes: z
    .array(z.string().trim().min(2).max(120))
    .max(20, 'Informe no maximo 20 certificacoes.')
    .optional(),
});

export const atualizarPerfilSchema = z.object({
  nome: nomeSchema.optional(),
  telefone: telefoneSchema,
  cidade: textoOpcional(80, 'A cidade'),
  estado: estadoSchema.optional(),
  agricultor: perfilAgricultorAtualizacaoSchema.optional(),
});

/*
 * Troca de senha.
 *
 * `senhaAtual` usa apenas "string nao vazia", nao o schema completo de
 * senha: se a politica de senha mudar, uma senha antiga (criada sob a
 * regra anterior) precisa continuar podendo ser informada aqui. Validar
 * a regra nova na senha atual trancaria o usuario fora da propria conta.
 *
 * `novaSenha` usa o schema completo, e o `confirma` garante que o usuario
 * nao digitou errado.
 */
export const trocarSenhaSchema = z
  .object({
    senha_atual: z
      .string({ required_error: 'A senha atual e obrigatoria.' })
      .min(1, 'A senha atual e obrigatoria.'),
    nova_senha: senhaSchema,
    confirma_nova_senha: z.string({ required_error: 'Confirme a nova senha.' }),
  })
  .refine((dados) => dados.nova_senha === dados.confirma_nova_senha, {
    path: ['confirma_nova_senha'],
    message: 'A confirmacao nao confere com a nova senha.',
  });

export default { atualizarPerfilSchema, trocarSenhaSchema };
