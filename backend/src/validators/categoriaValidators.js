import { z } from 'zod';
import { idParametro, nome, textoOpcional } from '../utils/validacao.js';

/*
 * Schemas do modulo de categorias.
 *
 * Categoria e dado de referencia: poucos campos, todos simples. O que
 * exige cuidado aqui e o SLUG, que vai para a URL.
 */

/*
 * Identificador da categoria na rota.
 *
 * Aceita id numerico OU slug. Os dois convivem de proposito:
 *   - /categorias/3      -> uso interno, pelo id;
 *   - /categorias/frutas -> URL amigavel, pelo slug.
 *
 * O slug e validado com o MESMO formato do CHECK do banco
 * (^[a-z0-9]+(-[a-z0-9]+)*$). Isso importa: sem a checagem de formato,
 * um valor como "slug com espaco" chegaria ao SELECT, nao encontraria
 * nada e a API devolveria 404 - afirmando que a categoria nao existe,
 * quando o problema real e que o identificador e malformado. A resposta
 * correta e 400.
 *
 * A checagem e feita com regex e nao com um `enum`, porque o conjunto de
 * slugs validos cresce com o catalogo e nao pode ser fixado no codigo.
 */
const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FORMATO_ID = /^\d+$/;

export const categoriaIdOuSlugParamSchema = z.object({
  id: z
    .string({ required_error: 'O identificador da categoria e obrigatorio.' })
    .trim()
    .min(1, 'O identificador da categoria e obrigatorio.')
    .max(80, 'O identificador da categoria e longo demais.')
    .refine((valor) => FORMATO_ID.test(valor) || FORMATO_SLUG.test(valor), {
      message:
        'Identificador invalido. Use o id numerico ou um slug no formato letras-minusculas-com-hifen.',
    }),
});

/* Identificador numerico, para rotas administrativas. */
export const categoriaIdParamSchema = z.object({
  id: idParametro,
});

const categoriaBaseSchema = {
  nome: nome.max(80, 'O nome da categoria deve ter no maximo 80 caracteres.'),
  descricao: textoOpcional(1000, 'A descricao'),
  ativo: z.boolean({ invalid_type_error: 'O campo ativo deve ser booleano.' }).optional(),
};

/*
 * Criacao.
 *
 * Nao aceitamos `slug` do cliente. Ele e derivado do nome no service, e
 * isso e deliberado: deixar o cliente escolher o slug permitiria criar
 * /categorias/admin ou /categorias/login, que confundiriam as rotas, e
 * abriria espaco para conteudo enganoso na URL.
 */
export const criarCategoriaSchema = z.object(categoriaBaseSchema);

/* Atualizacao: todos os campos opcionais, mas ao menos um exigido. */
export const atualizarCategoriaSchema = z
  .object({
    ...categoriaBaseSchema,
    nome: categoriaBaseSchema.nome.optional(),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

/*
 * Query da listagem publica.
 *
 * O visitante NUNCA pode pedir categorias inativas: `incluirInativas` nao
 * existe neste schema, entao o Zod remove o campo mesmo que seja enviado.
 * O admin usa uma rota separada, onde o parametro e aceito. Essa
 * separacao e o que garante que o filtro do marketplace so mostre
 * categoria utilizavel.
 */
export const listarCategoriasQuerySchema = z.object({
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
});

/* Query da listagem administrativa, que pode incluir inativas. */
export const listarCategoriasAdminQuerySchema = z.object({
  /*
   * O padrao e `true`, e nao `false`.
   *
   * O admin abre esta rota para gerenciar o catalogo, e a categoria que
   * ele mais precisa enxergar e justamente a desativada - a ativa ele ja
   * ve no marketplace. Um padrao `false` faria o admin concluir que a
   * categoria sumiu, quando na verdade ela so esta desativada.
   *
   * Sem o `.default('true')` o transform recebia `undefined` e devolvia
   * `false` (undefined === 'true'), o que anulava o parametro: o filtro
   * ficava sempre ligado e as inativas nunca apareciam.
   */
  incluir_inativas: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((valor) => valor === 'true'),
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
});

/*
 * Query do detalhe na area administrativa.
 *
 * Diferente da variante publica, aqui `incluir_inativa` e aceito E o
 * padrao e `true`. Faz sentido por contexto: quem chega em
 * /admin/categorias/:id e o administrador, e o motivo mais comum de ele
 * abrir essa rota e justamente reativar uma categoria desativada. Exigir
 * o parametro explicito toda vez seria atrito sem ganho de seguranca - a
 * protecao real e o requireRole na rota, nao a ausencia do parametro.
 */
export const obterCategoriaAdminQuerySchema = z.object({
  incluir_inativa: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((valor) => valor === 'true'),
});

export default {
  categoriaIdOuSlugParamSchema,
  categoriaIdParamSchema,
  criarCategoriaSchema,
  atualizarCategoriaSchema,
  listarCategoriasQuerySchema,
  listarCategoriasAdminQuerySchema,
  obterCategoriaAdminQuerySchema,
};
