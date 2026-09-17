import { RepositorioBase } from './RepositorioBase.js';
import { escaparTermoBusca } from '../utils/sql.js';

/*
 * Acesso a tabela `produtos`.
 *
 * O mesmo repositorio serve as leituras publicas (vitrine e busca) e o
 * CRUD do agricultor. Manter os dois aqui e deliberado: a regra de
 * visibilidade (`VISIVEL_PUBLICO`) e a projecao (`SELECT_PUBLICO`) sao
 * as mesmas nos dois casos, e separar em dois arquivos criaria duas
 * fontes de verdade sobre "o que e um produto visivel" - exatamente o
 * tipo de divergencia que causou o bug de categoria desativada.
 *
 * A distincao entre leitura publica e leitura do dono esta nos METODOS,
 * nao no arquivo: `listarPublicos` aplica `VISIVEL_PUBLICO`;
 * `listarDoAgricultor` nao aplica, porque o dono precisa ver o que
 * desativou.
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

/* JOINs usados tanto na projecao quanto na contagem de itens visiveis. */
const JOINS_VISIBILIDADE = `
    FROM produtos p
    JOIN categorias c   ON c.id = p.categoria_id
    JOIN agricultores a ON a.id = p.agricultor_id
    JOIN usuarios u     ON u.id = a.usuario_id
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
   * Listagem publica com busca e filtros (FASE 8/9).
   *
   * Os filtros sao montados como lista de fragmentos e parametros, na
   * mesma ordem. Isso garante que o numero do placeholder ($1, $2...)
   * corresponda sempre ao parametro certo - erro classico e silencioso
   * quando se monta SQL por concatenacao.
   *
   * `montarFiltrosPublicos` e compartilhada com a contagem: sem isso, a
   * query de itens e a de total usariam filtros diferentes e a paginacao
   * mostraria um total que nao corresponde a lista.
   */
  montarFiltrosPublicos({ busca, categoriaId, agricultorId, cidade, estado, precoMin, precoMax, disponivel }) {
    const filtros = [VISIVEL_PUBLICO];
    const parametros = [];

    if (busca) {
      parametros.push(`%${escaparTermoBusca(busca)}%`);
      filtros.push(`p.nome ILIKE $${parametros.length} ESCAPE '\\'`);
    }

    if (categoriaId) {
      parametros.push(categoriaId);
      filtros.push(`p.categoria_id = $${parametros.length}`);
    }

    if (agricultorId) {
      parametros.push(agricultorId);
      filtros.push(`p.agricultor_id = $${parametros.length}`);
    }

    if (cidade) {
      parametros.push(cidade);
      filtros.push(`a.cidade ILIKE $${parametros.length}`);
    }

    if (estado) {
      parametros.push(estado);
      filtros.push(`a.estado = $${parametros.length}`);
    }

    if (precoMin !== undefined && precoMin !== null) {
      parametros.push(precoMin);
      filtros.push(`p.preco >= $${parametros.length}`);
    }

    if (precoMax !== undefined && precoMax !== null) {
      parametros.push(precoMax);
      filtros.push(`p.preco <= $${parametros.length}`);
    }

    /*
     * Disponibilidade: por padrao so produto com estoque. `disponivel=false`
     * serve para o filtro "esgotados" e para o painel do agricultor.
     */
    if (disponivel === true) {
      filtros.push('p.estoque > 0');
    }

    return { filtros, parametros };
  }

  /* Lista publica paginada. */
  async listarPublicos(filtros) {
    const { pagina: _pagina, limite, offset, ordenar, ...resto } = filtros;

    const { filtros: condicoes, parametros } = this.montarFiltrosPublicos(resto);
    const ordenacao = this.resolverOrdenacao(
      ordenar,
      {
        recentes: 'p.criado_em DESC',
        baratos: 'p.preco ASC',
        caros: 'p.preco DESC',
        nome: 'p.nome ASC',
        avaliacao: 'v.media_avaliacoes DESC NULLS LAST, v.total_avaliacoes DESC',
      },
      'recentes',
    );

    const onde = `WHERE ${condicoes.join(' AND ')}`;

    const itens = await this.executar(
      `${SELECT_PUBLICO} ${onde} ORDER BY ${ordenacao}${this.montarLimiteOffset(limite, offset)}`,
      parametros,
    );

    const total = await this.contar(
      `SELECT count(*)::int AS total ${JOINS_VISIBILIDADE} ${onde}`,
      parametros,
    );

    return { itens, total };
  }

  /*
   * Listagem do proprio agricultor.
   *
   * Nao aplica `VISIVEL_PUBLICO`: o dono precisa ver os produtos que
   * desativou e os que estao esgotados. Tambem nao depende de categoria
   * ativa - se o admin desativou a categoria, o agricultor continua
   * vendo o proprio produto e consegue troca-lo de categoria.
   */
  async listarDoAgricultor(agricultorId, { busca, categoriaId, situacao, ordenar, limite, offset }) {
    const filtros = ['p.agricultor_id = $1'];
    const parametros = [agricultorId];

    if (busca) {
      parametros.push(`%${escaparTermoBusca(busca)}%`);
      filtros.push(`p.nome ILIKE $${parametros.length} ESCAPE '\\'`);
    }

    if (categoriaId) {
      parametros.push(categoriaId);
      filtros.push(`p.categoria_id = $${parametros.length}`);
    }

    if (situacao === 'ativos') filtros.push('p.ativo = TRUE');
    if (situacao === 'inativos') filtros.push('p.ativo = FALSE');
    if (situacao === 'esgotados') filtros.push('p.estoque = 0');

    const ordenacao = this.resolverOrdenacao(
      ordenar,
      {
        recentes: 'p.criado_em DESC',
        baratos: 'p.preco ASC',
        caros: 'p.preco DESC',
        nome: 'p.nome ASC',
        estoque: 'p.estoque ASC',
      },
      'recentes',
    );

    const onde = `WHERE ${filtros.join(' AND ')}`;

    /*
     * Aqui a projecao pode usar SELECT_PUBLICO mesmo sem visibilidade:
     * os JOINs sao INNER e o produto sempre tem categoria, agricultor e
     * usuario validos (sao FKs NOT NULL). O filtro `p.agricultor_id = $1`
     * ja restringe ao dono, entao nao ha risco de vazar produto alheio.
     */
    const itens = await this.executar(
      `${SELECT_PUBLICO} ${onde} ORDER BY ${ordenacao}${this.montarLimiteOffset(limite, offset)}`,
      parametros,
    );

    const total = await this.contar(
      `SELECT count(*)::int AS total FROM produtos p ${onde}`,
      parametros,
    );

    return { itens, total };
  }

  /* Busca um produto pelo id sem filtro de visibilidade (uso do dono). */
  async buscarPorId(id) {
    return this.buscarUm(`${SELECT_PUBLICO} WHERE p.id = $1`, [id]);
  }

  /*
   * Cria o produto.
   *
   * `agricultor_id` vem do service (derivado do token), nunca do corpo
   * da requisicao. O CHECK do banco e a validacao garantem preco > 0,
   * estoque >= 0 e nome preenchido.
   */
  async criar({ agricultorId, categoriaId, nome: nomeProduto, descricao, preco: precoProduto, estoque: estoqueProduto, unidade: unidadeProduto, imagemUrl }) {
    const linhas = await this.executar(
      `INSERT INTO produtos
         (agricultor_id, categoria_id, nome, descricao, preco, estoque, unidade, imagem_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        agricultorId,
        categoriaId,
        nomeProduto,
        descricao ?? null,
        precoProduto,
        estoqueProduto ?? 0,
        unidadeProduto ?? 'unidade',
        imagemUrl ?? null,
      ],
    );

    return this.buscarPorId(linhas[0].id);
  }

  /*
   * Atualiza apenas os campos enviados.
   *
   * O COALESCE com NULL preserva o valor atual quando o campo nao veio.
   * Isso permite um UPDATE unico para PATCH parcial, em vez de montar
   * SQL dinamico campo a campo.
   *
   * Limitacao conhecida: com COALESCE nao e possivel gravar NULL
   * explicito (ex.: apagar a descricao). Para estes campos isso nao e
   * um problema real - descricao vazia e string vazia, e imagem_url
   * tem rota propria de remocao. Se algum campo passar a precisar de
   * NULL explicito, ele precisara de tratamento separado.
   */
  async atualizar(id, { categoriaId, nome: nomeProduto, descricao, preco: precoProduto, estoque: estoqueProduto, unidade: unidadeProduto, imagemUrl }) {
    const linhas = await this.executar(
      `UPDATE produtos
          SET categoria_id = COALESCE($2, categoria_id),
              nome         = COALESCE($3, nome),
              descricao    = COALESCE($4, descricao),
              preco        = COALESCE($5, preco),
              estoque      = COALESCE($6, estoque),
              unidade      = COALESCE($7, unidade),
              imagem_url   = COALESCE($8, imagem_url)
        WHERE id = $1
      RETURNING id`,
      [
        id,
        categoriaId ?? null,
        nomeProduto ?? null,
        descricao ?? null,
        precoProduto ?? null,
        estoqueProduto ?? null,
        unidadeProduto ?? null,
        imagemUrl ?? null,
      ],
    );

    return linhas[0] ? this.buscarPorId(id) : null;
  }

  /* Liga ou desliga a disponibilidade do produto. */
  async alterarDisponibilidade(id, ativo) {
    const linhas = await this.executar(
      'UPDATE produtos SET ativo = $2 WHERE id = $1 RETURNING id',
      [id, ativo],
    );
    return linhas[0] ? this.buscarPorId(id) : null;
  }

  /*
   * Soma quantidade ao estoque, de forma atomica.
   *
   * `estoque = estoque + $2` e resolvido pelo banco em uma unica
   * operacao. Se em vez disso fizessemos SELECT + UPDATE, dois pedidos
   * simultaneos leriam o mesmo valor e um sobrescreveria o outro,
   * perdendo a reposicao de um deles.
   */
  async reporEstoque(id, quantidade) {
    const linhas = await this.executar(
      'UPDATE produtos SET estoque = estoque + $2 WHERE id = $1 RETURNING id',
      [id, quantidade],
    );
    return linhas[0] ? this.buscarPorId(id) : null;
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
