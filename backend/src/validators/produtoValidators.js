import { z } from 'zod';
import {
  idParametro,
  nome,
  preco,
  estoque,
  textoOpcional,
  urlImagem,
} from '../utils/validacao.js';

/*
 * Schemas do modulo de produtos.
 *
 * O ciclo de vida do produto tem dois momentos bem diferentes, e os
 * schemas refletem isso:
 *
 *   - CRIACAO: campos essenciais obrigatorios (nome, preco, categoria).
 *     Um produto sem preco ou categoria quebraria o marketplace;
 *   - EDICAO (PATCH): todos opcionais, so o que veio e alterado.
 *
 * Por que PUT e PATCH existem os dois: PUT substitui o recurso inteiro
 * (o cliente manda o produto completo), PATCH altera so os campos
 * enviados. Quem quer mudar apenas o estoque usa PATCH e nao precisa
 * reenviar nome, descricao e foto - o que reduz a chance de o frontend
 * apagar um campo por nao ter carregado ele.
 */

/*
 * Unidade de venda.
 *
 * A lista e fechada de proposito. "unidade" e "kg" convivem no mesmo
 * campo, e um cliente digitando "quilo", "quilos", "Kg" e "kg" criaria
 * quatro formas do mesmo dado - impossivel de agrupar ou exibir de
 * forma consistente. Uma lista fechada resolve na entrada.
 */
export const UNIDADES = [
  'unidade',
  'kg',
  'g',
  'litro',
  'ml',
  'duzia',
  'bandeja',
  'maço',
  'caixa',
  'pacote',
];

export const unidade = z.enum(UNIDADES, {
  errorMap: () => ({
    message: `A unidade deve ser uma destas: ${UNIDADES.join(', ')}.`,
  }),
});

const produtoBase = {
  nome: nome.max(140, 'O nome do produto deve ter no maximo 140 caracteres.'),
  descricao: textoOpcional(2000, 'A descricao'),
  preco,
  estoque,
  unidade,
  categoria_id: idParametro,
  imagem_url: urlImagem.optional().nullable(),
};

/*
 * Criacao.
 *
 * `ativo` nao e aceito: produto novo nasce ativo, e so o agricultor
 * pode desativar depois. Aceitar `ativo: false` aqui permitiria criar
 * um produto invisivel, o que nao tem uso e complicaria a checagem de
 * "produto novo apareceu no marketplace".
 *
 * `agricultor_id` tambem nao e aceito. Ele vem do token, nunca do
 * corpo: aceitar do cliente seria permitir cadastrar produto em nome de
 * outro produtor.
 */
export const criarProdutoSchema = z.object({
  ...produtoBase,
  imagem_url: urlImagem.optional().nullable(),
});

/*
 * Atualizacao parcial (PATCH).
 *
 * Cada campo e opcional, e ao menos um deve ser enviado - um PATCH
 * vazio nao altera nada e so gera carga no banco.
 *
 * `agricultor_id`, `ativo` e os campos de imagem_public_id nao entram:
 * propriedade nao se transfere por edicao de produto, e a coluna de
 * imagem e gerida pelo fluxo de upload, nao pelo corpo da requisicao.
 */
export const atualizarProdutoSchema = z
  .object({
    ...produtoBase,
    nome: produtoBase.nome.optional(),
    descricao: produtoBase.descricao,
    preco: preco.optional(),
    estoque: estoque.optional(),
    unidade: unidade.optional(),
    categoria_id: idParametro.optional(),
    imagem_url: urlImagem.optional().nullable(),
  })
  .refine((dados) => Object.keys(dados).length > 0, {
    message: 'Informe ao menos um campo para atualizar.',
  });

/*
 * Alteracao de disponibilidade (PATCH /produtos/:id/disponibilidade).
 *
 * Separado do PATCH geral porque tem regra propria: so o dono altera, e
 * o efeito (aparecer ou sumir do marketplace) e direto. Deixar `ativo`
 * no PATCH geral seria mais simples, mas misturaria "editar dados do
 * produto" com "tirar do ar" na mesma operacao.
 */
export const alterarDisponibilidadeSchema = z.object({
  ativo: z.boolean({
    required_error: 'O campo ativo e obrigatorio.',
    invalid_type_error: 'O campo ativo deve ser booleano.',
  }),
});

/*
 * Reposicao de estoque.
 *
 * `quantidade` e sempre POSITIVA e some ao estoque atual. Nao aceitamos
 * valor absoluto porque dois cliques simultaneos do agricultor perderiam
 * uma das informacoes; somar e uma operacao que o banco executa de forma
 * atomica (estoque = estoque + $1), sem ler o valor antes.
 */
export const reporEstoqueSchema = z.object({
  quantidade: z.coerce
    .number({ invalid_type_error: 'A quantidade deve ser um numero.' })
    .int('A quantidade deve ser um numero inteiro.')
    .positive('A quantidade deve ser maior que zero.')
    .max(1000000, 'A quantidade informada e alta demais.'),
});

/* Identificador numerico do produto. */
export const produtoIdParamSchema = z.object({
  id: idParametro,
});

/*
 * Query da listagem PUBLICA de produtos (FASE 9 amplia os filtros).
 *
 * A ordenacao e um enum, e isso e o que impede injecao: o valor so pode
 * ser uma das chaves, e o repositorio traduz a chave para a clausula
 * SQL. Nenhum texto do cliente chega ao ORDER BY.
 */
export const listarProdutosQuerySchema = z.object({
  busca: z
    .string()
    .trim()
    .min(2, 'A busca deve ter no minimo 2 caracteres.')
    .max(100, 'A busca e longa demais.')
    .optional(),
  categoria_id: idParametro.optional(),
  agricultor_id: idParametro.optional(),
  cidade: z.string().trim().min(2).max(80).optional(),
  estado: z
    .string()
    .trim()
    .length(2, 'O estado deve ter duas letras (ex.: SP).')
    .transform((valor) => valor.toUpperCase())
    .optional(),
  preco_min: z.coerce.number().min(0).optional(),
  preco_max: z.coerce.number().min(0).optional(),
  disponivel: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((valor) => valor === 'true'),
  ordenar: z
    .enum(['recentes', 'baratos', 'caros', 'nome', 'avaliacao'])
    .optional()
    .default('recentes'),
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
});

/*
 * Query da listagem do PROPRIO agricultor.
 *
 * Diferente da publica em tres pontos, e todos importam:
 *   - inclui os produtos INATIVOS (ele precisa ver o que tirou do ar);
 *   - inclui os ESGOTADOS;
 *   - nao tem filtro de cidade/estado, que nao fazem sentido para quem
 *     so enxerga a propria vitrine.
 */
export const listarMeusProdutosQuerySchema = z.object({
  busca: z.string().trim().min(2).max(100).optional(),
  categoria_id: idParametro.optional(),
  situacao: z.enum(['todos', 'ativos', 'inativos', 'esgotados']).optional().default('todos'),
  ordenar: z
    .enum(['recentes', 'baratos', 'caros', 'nome', 'estoque'])
    .optional()
    .default('recentes'),
  pagina: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(100).optional(),
});

export default {
  UNIDADES,
  criarProdutoSchema,
  atualizarProdutoSchema,
  alterarDisponibilidadeSchema,
  reporEstoqueSchema,
  produtoIdParamSchema,
  listarProdutosQuerySchema,
  listarMeusProdutosQuerySchema,
};
