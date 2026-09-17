import { RepositorioBase } from './RepositorioBase.js';

/*
 * Acesso a tabela `categorias`.
 *
 * Categorias sao dados de referencia: poucas linhas (dezenas, nao
 * milhares), estaveis e lidas em quase toda tela do marketplace. Por isso
 * o repositorio tem as duas formas de leitura:
 *
 *   - listar/listarTodas: para os filtros e para o admin;
 *   - buscarPorId/buscarPorSlug: para a pagina da categoria.
 */

/* Colunas publicas da categoria, com a contagem de produtos ativos. */
const COLUNAS = `
  c.id, c.nome, c.slug, c.descricao, c.ativo, c.criado_em, c.atualizado_em
`;

/*
 * Contagem de produtos ativos por categoria, via LATERAL.
 *
 * Por que LATERAL e nao um JOIN com GROUP BY: com GROUP BY, a consulta
 * agregaria a tabela `produtos` inteira antes de aplicar o LIMIT, e o
 * banco nao conseguiria usar o indice `produtos_disponiveis_idx`. Com
 * LATERAL, o count roda apenas para as categorias da pagina.
 *
 * O LEFT JOIN garante que categoria sem produto apareca com 0 e nao suma
 * da lista - o que seria confuso no filtro do marketplace.
 */
const LATERAL_PRODUTOS = `
  LEFT JOIN LATERAL (
    SELECT count(p.id)::int AS total_produtos
      FROM produtos p
     WHERE p.categoria_id = c.id AND p.ativo = TRUE
  ) pc ON TRUE
`;

const SELECT_PUBLICO = `
  SELECT ${COLUNAS}, pc.total_produtos
    FROM categorias c
    ${LATERAL_PRODUTOS}
`;

export class CategoriaRepository extends RepositorioBase {
  constructor() {
    super('categorias');
  }

  /* Busca por id, incluindo inativas (o service decide o que fazer). */
  async buscarPorId(id) {
    return this.buscarUm(`${SELECT_PUBLICO} WHERE c.id = $1`, [id]);
  }

  /* Busca pelo slug, que e o identificador usado nas URLs amigaveis. */
  async buscarPorSlug(slug) {
    return this.buscarUm(`${SELECT_PUBLICO} WHERE c.slug = $1`, [slug]);
  }

  /* Verifica se ja existe categoria com o mesmo nome (case-insensitive). */
  async nomeEmUso(nome, ignorarId = null) {
    const linha = await this.buscarUm(
      `SELECT id FROM categorias
        WHERE lower(nome) = lower($1)
          AND ($2::bigint IS NULL OR id <> $2)`,
      [nome, ignorarId],
    );
    return Boolean(linha);
  }

  /* Verifica se ja existe categoria com o mesmo slug. */
  async slugEmUso(slug, ignorarId = null) {
    const linha = await this.buscarUm(
      `SELECT id FROM categorias
        WHERE slug = $1
          AND ($2::bigint IS NULL OR id <> $2)`,
      [slug, ignorarId],
    );
    return Boolean(linha);
  }

  /*
   * Listagem paginada para o admin, com opcao de incluir inativas.
   *
   * O admin precisa ver as categorias desativadas (para reativar), mas o
   * marketplace nao. Um parametro booleano resolve os dois casos, e o
   * filtro de visibilidade nao fica duplicado em duas consultas.
   */
  async listar({ incluirInativas = false, limite, offset }) {
    const filtros = [];
    if (!incluirInativas) filtros.push('c.ativo = TRUE');

    const onde = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';

    const itens = await this.executar(
      `${SELECT_PUBLICO} ${onde} ORDER BY c.nome ASC${this.montarLimiteOffset(limite, offset)}`,
      [],
    );

    const total = await this.contar(
      `SELECT count(*)::int AS total FROM categorias c ${onde}`,
      [],
    );

    return { itens, total };
  }

  /*
   * Cria a categoria.
   *
   * O slug NAO vem do cliente: e derivado do nome no service. Gerar aqui
   * seria tentador, mas o service e quem tem a regra de negocio e quem
   * consegue reportar o erro certo ("ja existe uma categoria com esse
   * nome") antes de tentar o INSERT.
   */
  async criar({ nome, slug, descricao, ativo }) {
    const linhas = await this.executar(
      `INSERT INTO categorias (nome, slug, descricao, ativo)
       VALUES ($1, $2, $3, COALESCE($4, TRUE))
       RETURNING id`,
      [nome, slug, descricao ?? null, ativo ?? null],
    );
    return this.buscarPorId(linhas[0].id);
  }

  /* Atualiza a categoria e devolve o registro atualizado. */
  async atualizar(id, { nome, slug, descricao, ativo }) {
    const linhas = await this.executar(
      `UPDATE categorias
          SET nome      = COALESCE($2, nome),
              slug      = COALESCE($3, slug),
              descricao = COALESCE($4, descricao),
              ativo     = COALESCE($5, ativo)
        WHERE id = $1
      RETURNING id`,
      [id, nome ?? null, slug ?? null, descricao ?? null, ativo ?? null],
    );

    return linhas[0] ? this.buscarPorId(id) : null;
  }

  /*
   * Desativa a categoria (exclusao logica).
   *
   * Nao existe DELETE fisico nesta fase: `produtos.categoria_id` tem
   * ON DELETE RESTRICT, entao apagar uma categoria em uso falharia com
   * erro de chave estrangeira. Alem disso, apagar perderia o historico
   * dos pedidos, que guardam referencia a produtos dessa categoria.
   */
  async desativar(id) {
    const linhas = await this.executar(
      'UPDATE categorias SET ativo = FALSE WHERE id = $1 RETURNING id',
      [id],
    );
    return linhas[0] ?? null;
  }

  /* Reativa a categoria. */
  async ativar(id) {
    const linhas = await this.executar(
      'UPDATE categorias SET ativo = TRUE WHERE id = $1 RETURNING id',
      [id],
    );
    return linhas[0] ?? null;
  }

  /*
   * Resumo de produtos que referenciam a categoria.
   *
   * Usado antes de desativar, para informar ao admin quantos produtos
   * serao afetados: desativar a categoria esconde esses produtos do
   * marketplace (a listagem publica so mostra produto de categoria
   * ativa), e o admin precisa saber o tamanho do efeito antes de
   * confirmar.
   */
  async resumoProdutos(categoriaId) {
    const linha = await this.buscarUm(
      `SELECT count(*)::int                         AS total,
              count(*) FILTER (WHERE ativo)::int     AS ativos,
              count(*) FILTER (WHERE NOT ativo)::int AS inativos
         FROM produtos WHERE categoria_id = $1`,
      [categoriaId],
    );

    return linha ?? { total: 0, ativos: 0, inativos: 0 };
  }
}

export default new CategoriaRepository();
