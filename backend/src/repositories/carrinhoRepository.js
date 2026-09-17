import { RepositorioBase } from './RepositorioBase.js';
import { VISIVEL_PUBLICO_PRODUTO, COLUNAS_PRODUTO } from './produtoRepository.js';

/*
 * Acesso as tabelas `carrinhos` e `carrinho_itens`.
 *
 * DECISAO CENTRAL DESTE MODULO: o carrinho NAO guarda preco.
 *
 * A tabela `carrinho_itens` tem apenas quantidade. O preco exibido no
 * carrinho e sempre lido de `produtos` no momento da consulta. Se
 * guardassemos o preco aqui, ele seria um campo que o cliente poderia
 * tentar enviar e a API teria que decidir se confia - e a resposta
 * correta e nunca confiar. Guardando so a quantidade, a manipulacao de
 * preco deixa de ser possivel por construcao, nao por validacao.
 *
 * A consequencia pratica e que o total do carrinho acompanha o preco
 * atual: se o agricultor mudar de 8,50 para 9,00, o cliente ve 9,00 no
 * carrinho. Isso e o comportamento desejado (o preco que vale e o do
 * momento da compra), e o checkout recalcula tudo de novo de qualquer
 * forma.
 *
 * Um carrinho por consumidor (`carrinhos.consumidor_id` e UNIQUE). Nao
 * existe carrinho anonimo: para usar o carrinho e preciso estar
 * autenticado, o que simplifica o modelo e evita o problema de fundir
 * carrinho anonimo com carrinho de usuario no login.
 */

/*
 * Itens do carrinho com o produto ao vivo.
 *
 * O JOIN com categoria, agricultor e usuario traz os dados que o
 * frontend precisa para exibir o item, e o LEFT JOIN com a view de
 * avaliacoes mantem a mesma projecao da vitrine.
 */
const SELECT_ITENS = `
  SELECT
    ci.id             AS item_id,
    ci.quantidade,
    ci.criado_em      AS item_criado_em,
    ${COLUNAS_PRODUTO},
    c.nome            AS categoria_nome,
    c.slug            AS categoria_slug,
    a.nome_fazenda,
    a.cidade          AS agricultor_cidade,
    a.estado          AS agricultor_estado,
    v.media_avaliacoes,
    v.total_avaliacoes
  FROM carrinho_itens ci
  JOIN produtos p     ON p.id = ci.produto_id
  JOIN categorias c   ON c.id = p.categoria_id
  JOIN agricultores a ON a.id = p.agricultor_id
  JOIN usuarios u     ON u.id = a.usuario_id
  LEFT JOIN produtos_com_avaliacao v ON v.id = p.id
`;

export class CarrinhoRepository extends RepositorioBase {
  constructor() {
    super('carrinhos');
  }

  /*
   * Devolve o carrinho do consumidor, criando se nao existir.
   *
   * O `ON CONFLICT DO NOTHING` seguido de SELECT cobre a corrida de duas
   * requisicoes simultaneas do mesmo usuario (ex.: duas abas abrindo o
   * carrinho ao mesmo tempo). Sem ele, a segunda receberia violacao de
   * UNIQUE em `consumidor_id` - um erro que nao corresponde a nenhum
   * problema real do usuario.
   */
  async obterOuCriar(consumidorId) {
    const inseridos = await this.executar(
      `INSERT INTO carrinhos (consumidor_id) VALUES ($1)
       ON CONFLICT (consumidor_id) DO NOTHING
       RETURNING id, consumidor_id, criado_em, atualizado_em`,
      [consumidorId],
    );

    if (inseridos[0]) return inseridos[0];

    return this.buscarUm(
      'SELECT id, consumidor_id, criado_em, atualizado_em FROM carrinhos WHERE consumidor_id = $1',
      [consumidorId],
    );
  }

  /* Itens do carrinho com os dados do produto. */
  async listarItens(carrinhoId) {
    return this.executar(
      `${SELECT_ITENS} WHERE ci.carrinho_id = $1 ORDER BY ci.criado_em ASC`,
      [carrinhoId],
    );
  }

  /* Busca um item pelo par (carrinho, produto). */
  async buscarItem(carrinhoId, produtoId) {
    return this.buscarUm(
      'SELECT id, carrinho_id, produto_id, quantidade FROM carrinho_itens WHERE carrinho_id = $1 AND produto_id = $2',
      [carrinhoId, produtoId],
    );
  }

  /* Busca um item pelo id, restrito ao carrinho informado. */
  async buscarItemPorId(carrinhoId, itemId) {
    return this.buscarUm(
      'SELECT id, carrinho_id, produto_id, quantidade FROM carrinho_itens WHERE id = $1 AND carrinho_id = $2',
      [itemId, carrinhoId],
    );
  }

  /*
   * Adiciona quantidade a um produto do carrinho.
   *
   * `quantidade = carrinho_itens.quantidade + $3` no ON CONFLICT resolve
   * adicionar-e-somar em uma unica ida ao banco. Fazer SELECT + INSERT/UPDATE
   * na aplicacao abriria a janela para dois cliques rapidos somarem
   * apenas uma vez.
   *
   * O `WHERE carrinho_itens.carrinho_id = $1` no DO UPDATE e o que
   * restringe o conflito ao MESMO carrinho: a UNIQUE e
   * (carrinho_id, produto_id), entao o conflito so pode ser desse par.
   */
  async adicionarItem(carrinhoId, produtoId, quantidade) {
    const linhas = await this.executar(
      `INSERT INTO carrinho_itens (carrinho_id, produto_id, quantidade)
       VALUES ($1, $2, $3)
       ON CONFLICT (carrinho_id, produto_id)
       DO UPDATE SET quantidade = carrinho_itens.quantidade + EXCLUDED.quantidade
       RETURNING id, quantidade`,
      [carrinhoId, produtoId, quantidade],
    );

    return linhas[0];
  }

  /*
   * Define a quantidade exata de um item.
   *
   * Diferente de `adicionarItem`, aqui a quantidade e SUBSTITUIDA - e o
   * que o cliente espera ao digitar "3" no campo de quantidade do item.
   */
  async definirQuantidade(carrinhoId, produtoId, quantidade) {
    const linhas = await this.executar(
      `UPDATE carrinho_itens SET quantidade = $3
        WHERE carrinho_id = $1 AND produto_id = $2
      RETURNING id, quantidade`,
      [carrinhoId, produtoId, quantidade],
    );

    return linhas[0] ?? null;
  }

  /* Remove um item do carrinho. */
  async removerItem(carrinhoId, produtoId) {
    const linhas = await this.executar(
      'DELETE FROM carrinho_itens WHERE carrinho_id = $1 AND produto_id = $2 RETURNING id',
      [carrinhoId, produtoId],
    );

    return linhas.length > 0;
  }

  /* Esvazia o carrinho. */
  async limpar(carrinhoId) {
    const linhas = await this.executar(
      'DELETE FROM carrinho_itens WHERE carrinho_id = $1 RETURNING id',
      [carrinhoId],
    );

    return linhas.length;
  }

  /*
   * Busca os produtos do carrinho APLICANDO a visibilidade publica.
   *
   * Usado na validacao de "posso adicionar este produto?". Se o produto
   * esta desativado, esgotado, de produtor suspenso ou de categoria
   * desativada, ele nao entra no carrinho - o cliente nao deve conseguir
   * montar um carrinho com item que nao podera comprar.
   *
   * Reusa `VISIVEL_PUBLICO_PRODUTO` importada do produtoRepository, em
   * vez de reescrever a condicao. Se a regra de visibilidade mudar, o
   * carrinho acompanha automaticamente.
   */
  async buscarProdutoVisivel(produtoId) {
    return this.buscarUm(
      `SELECT p.id, p.nome, p.preco, p.estoque, p.unidade, p.ativo, p.agricultor_id, p.categoria_id
         FROM produtos p
         JOIN categorias c   ON c.id = p.categoria_id
         JOIN agricultores a ON a.id = p.agricultor_id
         JOIN usuarios u     ON u.id = a.usuario_id
        WHERE p.id = $1 AND ${VISIVEL_PUBLICO_PRODUTO}`,
      [produtoId],
    );
  }

  /*
   * Contagem de itens e soma das quantidades, para o cabecalho do
   * carrinho. Uma consulta so, sem trazer as linhas.
   */
  async resumo(carrinhoId) {
    const linha = await this.buscarUm(
      `SELECT
         count(*)::int                    AS total_itens,
         COALESCE(sum(quantidade), 0)::int AS total_unidades
       FROM carrinho_itens
       WHERE carrinho_id = $1`,
      [carrinhoId],
    );

    return linha ?? { total_itens: 0, total_unidades: 0 };
  }
}

export default new CarrinhoRepository();
