import { z } from 'zod';
import { idParametro, estado } from '../utils/validacao.js';

/*
 * Schemas do modulo de agricultores (perfil publico do produtor).
 *
 * Estas rotas sao PUBLICAS: qualquer visitante, autenticado ou nao, pode
 * consultar a lista de produtores e o perfil de cada um. Por isso a
 * validacao aqui e sobre FORMATO e LIMITES, nunca sobre identidade.
 *
 * O parametro :id e validado como inteiro positivo antes de virar query.
 * Sem isso, um GET /agricultores/abc chegaria ao PostgreSQL e devolveria
 * o erro 22P02 (invalid_text_representation) - que nao e um dado
 * sensivel, mas gera log de erro e trabalho desnecessario no banco.
 */
export const agricultorIdParamSchema = z.object({
  id: idParametro,
});

/* Filtros da listagem publica de produtores. */
export const listarAgricultoresQuerySchema = z.object({
  /*
   * Busca textual pela propriedade.
   *
   * O limite de 100 caracteres nao e estetico: o termo vira um LIKE com
   * wildcards, e um termo gigante faria o PostgreSQL varrer a tabela
   * inteira sem chance de usar indice.
   */
  busca: z.string().trim().min(2, 'A busca deve ter no minimo 2 caracteres.').max(100).optional(),

  cidade: z.string().trim().min(2).max(80).optional(),
  estado: estado.optional(),

  /*
   * Ordenacao por lista branca.
   *
   * O valor NUNCA vai para o SQL: ele e usado como chave de um mapa de
   * ordenacoes seguras dentro do repository. Um valor fora da lista cai
   * no padrao, em vez de virar clausula ORDER BY.
   */
  ordenar: z.enum(['nome', 'recentes', 'avaliacao']).optional(),

  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
});

/*
 * Query da listagem de produtos de um produtor.
 *
 * Reaproveita a paginacao e acrescenta o filtro por categoria, que e o
 * recorte mais util dentro da vitrine de um produtor ("só as frutas do
 * Sitio Boa Vista").
 */
export const listarProdutosDoAgricultorQuerySchema = z.object({
  categoria_id: z.coerce.number().int().positive().optional(),
  ordenar: z.enum(['recentes', 'baratos', 'caros', 'nome']).optional(),
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
});

/* Query da lista de avaliacoes recebidas por um produtor. */
export const listarAvaliacoesQuerySchema = z.object({
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
});

export default {
  agricultorIdParamSchema,
  listarAgricultoresQuerySchema,
  listarProdutosDoAgricultorQuerySchema,
  listarAvaliacoesQuerySchema,
};
