import { RepositorioBase } from './RepositorioBase.js';

/*
 * Acesso a tabela `produtos`.
 *
 * Nesta fase (6) entram apenas as LEITURAS publicas, que alimentam a
 * vitrine do produtor. O CRUD do agricultor entra na FASE 8, no mesmo
 * arquivo - nao criamos um repositorio paralelo para nao ter duas fontes
 * de verdade sobre como um produto e consultado.
 */

/* Colunas publicas do produto, com a media de avaliacoes da view. */
const COLUNAS_PRODUTO = `
  p.id, p.nome, p.descricao, p.preco, p.estoque, p.unidade,
  p.imagem_url, p.ativo, p.criado_em, p.atualizado_em,
  p.agricultor_id, p.categoria_id
`;

/*
 * Projecao publica: produto + nome da categoria + nome da fazenda +
 * media de avaliacoes.
 *
 * A media vem da view `produtos_com_avaliacao`, criada na migration 005.
 * Usar a view em vez de um AVG por consulta evita recalcular a media de
 * cada produto a cada requisicao de listagem.
 */
const SELECT_PUBLICO = `
  SELECT ${COLUNAS_PRODUTO},
         c.nome  AS categoria_nome,
         c.slug  AS categoria_slug,
         a.nome_fazenda,
         a.cidade AS agricultor_cidade,
         a.estado AS agricultor_estado,
         v.media_avaliacoes,
         v.total_avaliacoes
    FROM produtos p
    JOIN categorias c  ON c.id = p.categoria_id
    JOIN agricultores a ON a.id = p.agricultor_id
    JOIN usuarios u     ON u.id = a.usuario_id
    LEFT JOIN produtos_com_avaliacao v ON v.id = p.id
`;

/*
 * Condicao de visibilidade publica.
 *
 * QUATRO condicoes, e todas importam:
 *   - produto ativo: desativado nao aparece no marketplace;
 *   - produtor ativo: desativar um produtor esconde a vitrine dele;
 *   - usuario ativo: bloquear o login do produtor tambem esconde;
 *   - categoria ativa: desativar uma categoria e a forma de tirar do ar
 *     tudo que pertence a ela (ex.: retirar "Laticinios" do marketplace).
 *
 * Sem as tres ultimas, a suspensao correspondente nao teria efeito
 * pratico: um produtor bloqueado continuaria vendendo, e uma categoria
 * desativada continuaria mostrando produtos.
 *
 * Esta constante e o ponto unico da decisao. Toda leitura publica de
 * produto usa exatamente esta string, para que a regra nao possa
 * divergir entre a listagem e o detalhe.
 */
const VISIVEL_PUBLICO =
  'p.ativo = TRUE AND a.ativo = TRUE AND u.ativo = TRUE AND c.ativo = TRUE';

export class ProdutoRepository extends RepositorioBase {
  constructor() {
    super('produtos');
  }

  /* Busca um produto publico pelo id. Devolve null se nao for visivel. */
  async buscarPublicoPorId(id) {
    return this.buscarUm(`${SELECT_PUBLICO} WHERE p.id = $1 AND ${VISIVEL_PUBLICO}`, [id]);
  }

  /*
   * Produtos publicos de um produtor, paginados.
   *
   * A ordenacao vem por lista branca: `query.ordenar` escolhe uma chave
   * deste mapa, e o valor do mapa e a unica coisa que entra no SQL.
   */
  async listarPublicosDoAgricultor(agricultorId, { categoriaId, ordenar, limite, offset }) {
    const ordenacao = this.resolverOrdenacao(
      ordenar,
      {
        recentes: 'p.criado_em DESC',
        baratos: 'p.preco ASC',
        caros: 'p.preco DESC',
        nome: 'p.nome ASC',
      },
      'recentes',
    );

    const filtros = [VISIVEL_PUBLICO, 'p.agricultor_id = $1'];
    const parametros = [agricultorId];

    if (categoriaId) {
      parametros.push(categoriaId);
      filtros.push(`p.categoria_id = $${parametros.length}`);
    }

    const onde = `WHERE ${filtros.join(' AND ')}`;

    const itens = await this.executar(
      `${SELECT_PUBLICO} ${onde} ORDER BY ${ordenacao}${this.montarLimiteOffset(limite, offset)}`,
      parametros,
    );

    const total = await this.contar(
      `SELECT count(*)::int AS total
         FROM produtos p
         JOIN agricultores a ON a.id = p.agricultor_id
         JOIN usuarios u     ON u.id = a.usuario_id
         JOIN categorias c   ON c.id = p.categoria_id
         ${onde}`,
      parametros,
    );

    return { itens, total };
  }

  /*
   * Contagem de produtos publicos de um produtor, por situacao.
   *
   * Uma unica consulta com count FILTER em vez de quatro SELECTs: o
   * banco varre a tabela uma vez so. Alimenta os cartoes do topo do
   * perfil publico e, mais adiante, o painel do agricultor (FASE 18).
   */
  async resumoDoAgricultor(agricultorId) {
    const linha = await this.buscarUm(
      `SELECT
         count(*)::int                                        AS total,
         count(*) FILTER (WHERE p.ativo)::int                 AS ativos,
         count(*) FILTER (WHERE NOT p.ativo)::int             AS inativos,
         count(*) FILTER (WHERE p.ativo AND p.estoque = 0)::int AS esgotados
       FROM produtos p
       WHERE p.agricultor_id = $1`,
      [agricultorId],
    );

    return (
      linha ?? { total: 0, ativos: 0, inativos: 0, esgotados: 0 }
    );
  }
}

export default new ProdutoRepository();
