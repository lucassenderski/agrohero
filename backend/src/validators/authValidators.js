import { z } from 'zod';
import {
  email as emailSchema,
  senha as senhaSchema,
  nome as nomeSchema,
  telefone as telefoneSchema,
  estado as estadoSchema,
  textoOpcional,
} from '../utils/validacao.js';

/*
 * Schemas de validacao do cadastro e do login.
 *
 * Este arquivo concentra a validacao mais sensivel do sistema: a criacao
 * de contas.
 */

/*
 * Tipos que o publico pode escolher no cadastro.
 *
 * `administrador` NAO esta na lista, e isso e uma decisao de seguranca,
 * nao um esquecimento. Ver a nota em `cadastroSchema`.
 */
export const TIPOS_AUTOCADASTRO = ['cliente', 'agricultor'];

/*
 * Campos exclusivos do perfil de agricultor.
 *
 * Quando alguem se cadastra como agricultor, o perfil da propriedade e
 * criado na MESMA transacao do usuario. Ou os dois nascem, ou nenhum.
 */
const perfilAgricultorSchema = z.object({
  nome_fazenda: nomeSchema.max(140, 'O nome da fazenda deve ter no maximo 140 caracteres.'),
  descricao: textoOpcional(2000, 'A descricao'),
  historia: textoOpcional(4000, 'A historia'),
  endereco: textoOpcional(200, 'O endereco'),
  /*
   * Cidade e estado da PROPRIEDADE.
   *
   * Sao distintos da localizacao do usuario (usuario pode morar em outra
   * cidade). E a localizacao da propriedade que alimenta o filtro
   * "produtores da minha regiao" no marketplace.
   *
   * Estes campos faltavam aqui e o Zod os descartava em silencio - o
   * perfil do produtor era criado sem cidade e estado. O service tem um
   * fallback para os dados do usuario, mas depender dele nao serve: o
   * produtor pode legitimamente morar em outra cidade.
   */
  cidade: textoOpcional(80, 'A cidade'),
  estado: estadoSchema.optional(),
  certificacoes: z
    .array(z.string().trim().min(2).max(120))
    .max(20, 'Informe no maximo 20 certificacoes.')
    .optional()
    .default([]),
});

export const cadastroSchema = z
  .object({
    nome: nomeSchema,
    email: emailSchema,
    senha: senhaSchema,
    telefone: telefoneSchema,
    cidade: textoOpcional(80, 'A cidade'),
    estado: estadoSchema.optional(),

    /*
     * ATENCAO - o ponto de seguranca mais importante deste arquivo.
     *
     * `tipo` so aceita cliente ou agricultor. Se um atacante enviar
     * { "tipo": "administrador" }, a validacao falha com 400, e o Zod
     * ainda removeria qualquer campo nao declarado.
     *
     * Essa checagem existe DUAS VEZES de proposito:
     *   1. aqui, no enum, que rejeita o valor;
     *   2. no service, que forca o tipo a partir desta lista.
     *
     * A duplicacao e intencional: se alguem no futuro alterar o schema e
     * afrouxar o enum, o service continua barrando. Escalacao de
     * privilegio e grave demais para depender de uma unica linha.
     */
    tipo: z.enum(TIPOS_AUTOCADASTRO, {
      errorMap: () => ({
        message: 'O tipo deve ser cliente ou agricultor.',
      }),
    }).default('cliente'),

    // Obrigatorio apenas quando tipo = agricultor (regra aplicada abaixo).
    agricultor: perfilAgricultorSchema.optional(),
  })
  .superRefine((dados, ctx) => {
    if (dados.tipo === 'agricultor' && !dados.agricultor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['agricultor'],
        message: 'Informe os dados da propriedade para o cadastro de agricultor.',
      });
    }

    // Perfil de produtor enviado junto com tipo = cliente seria sinal de
    // payload montado errado; recusar evita criar dado orfao.
    if (dados.tipo === 'cliente' && dados.agricultor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['agricultor'],
        message: 'Dados de propriedade so se aplicam ao tipo agricultor.',
      });
    }
  });

/*
 * NOTA: a senha permanece no resultado da validacao.
 *
 * A primeira versao deste arquivo terminava com
 *   .transform(({ senha, ...resto }) => resto)
 * na tentativa de "remover a senha". Era um erro: o service precisa da
 * senha validada para gerar o hash, e sem ela o cadastro simplesmente
 * nao funcionaria.
 *
 * A protecao correta e diferente - nao retirar o valor, e sim garantir
 * que ele nunca seja persistido nem logado:
 *   - o repository recebe `senhaHash`, nunca a senha em texto puro;
 *   - o logger redige `dadosValidados.senha` (ver config/logger.js);
 *   - a senha nunca entra no token JWT (ver utils/token.js).
 */

/*
 * Login.
 *
 * Repare que a senha NAO usa o schema `senha` completo (minimo de 8,
 * letra e numero). Se usasse, uma senha curta ou sem numero responderia
 * 400 "dados invalidos" em vez de 401 "credenciais incorretas" - o que
 * revelaria a regra de senha da aplicacao para quem esta sondando, e
 * ainda ajudaria a distinguir contas existentes.
 *
 * Aqui so exigimos que seja texto nao vazio. A resposta e sempre a mesma
 * mensagem generica, exista ou nao a conta.
 */
export const loginSchema = z.object({
  email: emailSchema,
  senha: z.string({ required_error: 'A senha e obrigatoria.' }).min(1, 'A senha e obrigatoria.'),
});

export default { cadastroSchema, loginSchema, TIPOS_AUTOCADASTRO };
