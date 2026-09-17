import { RepositorioBase } from './RepositorioBase.js';

/*
 * Acesso a tabela `avaliacoes`.
 *
 * A tabela guarda `consumidor_id` e `agricultor_id` COPIADOS do pedido,
 * alem de `pedido_id` e `produto_id`. A redundancia e proposital: a
 * media do produtor e calculada sem passar por `produtos` (que pode
 * estar inativo) e a regra de propriedade nao precisa de JOIN.
 *
 * A UNICIDADE VEM DO BANCO. `avaliacoes_uma_por_produto_por_pedido`
 * (pedido_id, produto_id, consumidor_id) impede inflar a media avaliando
 * o mesmo item varias vezes. O repository nao repete essa checagem como
 * garantia: ele tenta inserir e traduz o 23505 em erro de negocio, porque
 * uma verificacao previa seria sujeita a corrida - duas requisicoes
 * simultaneas passariam as duas pela checagem e a segunda estouraria no
 * banco de qualquer forma.
 */

/*
 * Avaliacoes recebidas por um produtor, com o contexto que o visitante
 * precisa para julgar a nota: qual produto foi avaliado e o primeiro
 * nome de quem avaliou.
 *
 * Sobre o nome do consumidor: expomos apenas o primeiro nome. Publicar
 * o nome completo de quem comprou, ligado a cidade e ao que a pessoa
 * comprou, e exposicao desnecessaria - o visitante precisa saber que
 * existe uma pessoa real por tras da nota, nao quem ela e.
 *
 * Sobre o e-mail: nao entra. Nao ha motivo para um perfil publico
 * devolver o e-mail de um consumidor.
 */
const SELECT_PUBLICO = `
  SELECT av.id,
         av.nota,
         av.comentario,
         av.criado_em,
         av.produto_id,
         p.nome AS produto_nome,
         split_part(u.nome, ' ', 1) AS consumidor_primeiro_nome
    FROM avaliacoes av
    JOIN produtos p ON p.id = av.produto_id
    JOIN usuarios u ON u.id = av.consumidor_id
`;

export class AvaliacaoRepository extends RepositorioBase {
  constructor() {
    super('avaliacoes');
  }

  /*
   * Avaliacoes de um produtor, da mais recente para a mais antiga.
   *
   * Nao filtramos por produto ativo de proposito: a avaliacao e um fato
   * historico. Se o produto saiu de linha, a nota que ele recebeu
   * continua valendo para a reputacao do produtor.
   */
  async listarDoAgricultor(agricultorId, { limite, offset }) {
    const itens = await this.executar(
      `${SELECT_PUBLICO}
        WHERE av.agricultor_id = $1
        ORDER BY av.criado_em DESC${this.montarLimiteOffset(limite, offset)}`,
      [agricultorId],
    );

    const total = await this.contar(
      'SELECT count(*)::int AS total FROM avaliacoes WHERE agricultor_id = $1',
      [agricultorId],
    );

    return { itens, total };
  }

  /*
   * Resumo da reputacao do produtor: media, total e distribuicao.
   *
   * A distribuicao (quantas notas 1, 2, 3, 4 e 5) e o que permite ao
   * frontend desenhar o grafico de barras do perfil. Uma media de 4,0
   * esconde diferenca importante entre "todo mundo deu 4" e "metade deu
   * 5, metade deu 1" - a distribuicao mostra qual dos dois e.
   *
   * O FILTER faz tudo em uma varredura. O CASE WHEN no final garante
   * que as cinco notas existam no resultado mesmo com zero avaliacoes,
   * para o frontend nao ter que tratar chave ausente.
   */
  async resumoDoAgricultor(agricultorId) {
    const linha = await this.buscarUm(
      `SELECT
         count(*)::int                          AS total,
         round(coalesce(avg(nota), 0), 2)::float AS media,
         count(*) FILTER (WHERE nota = 1)::int  AS nota_1,
         count(*) FILTER (WHERE nota = 2)::int  AS nota_2,
         count(*) FILTER (WHERE nota = 3)::int  AS nota_3,
         count(*) FILTER (WHERE nota = 4)::int  AS nota_4,
         count(*) FILTER (WHERE nota = 5)::int  AS nota_5
       FROM avaliacoes
       WHERE agricultor_id = $1`,
      [agricultorId],
    );

    if (!linha) {
      return {
        total: 0,
        media: 0,
        distribuicao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }

    return {
      total: linha.total,
      media: linha.media,
      distribuicao: {
        1: linha.nota_1,
        2: linha.nota_2,
        3: linha.nota_3,
        4: linha.nota_4,
        5: linha.nota_5,
      },
    };
  }

  /* ----------------------------------------------------------------
   * Escrita e leituras do consumidor (FASE 14)
   * ---------------------------------------------------------------- */

  /*
   * Busca a linha do pedido que autoriza a avaliacao.
   *
   * Esta consulta e a base da autorizacao: responde, de uma vez, as tres
   * perguntas que decidem se o consumidor pode avaliar:
   *   - o pedido e dele?          (pe.consumidor_id)
   *   - o produto esta no pedido? (pi.produto_id)
   *   - o item foi ENTREGUE?      (pi.status)
   *
   * Filtrar por `consumidor_id` NA QUERY (e nao depois, no service) e
   * proposital: o pedido de outro consumidor simplesmente nao e
   * encontrado, e o service nao tem como esquecer a checagem.
   */
  async buscarItemEntregue(consumidorId, pedidoId, produtoId) {
    return this.buscarUm(
      `SELECT
         pi.id AS item_id, pi.produto_id, pi.agricultor_id, pi.status,
         pe.id AS pedido_id, pe.consumidor_id
       FROM pedido_itens pi
       JOIN pedidos pe ON pe.id = pi.pedido_id
      WHERE pe.id = $1
        AND pi.produto_id = $2
        AND pe.consumidor_id = $3`,
      [pedidoId, produtoId, consumidorId],
    );
  }

  /* Ja existe avaliacao deste consumidor para este produto/pedido? */
  async buscarDoConsumidorNoPedido(consumidorId, pedidoId, produtoId) {
    return this.buscarUm(
      `SELECT id FROM avaliacoes
        WHERE consumidor_id = $1 AND pedido_id = $2 AND produto_id = $3`,
      [consumidorId, pedidoId, produtoId],
    );
  }

  /* Busca por id, sem checagem de dono (o service faz isso). */
  async buscarPorId(id) {
    return this.buscarUm(
      `SELECT id, pedido_id, produto_id, consumidor_id, agricultor_id,
              nota, comentario, criado_em, atualizado_em
         FROM avaliacoes WHERE id = $1`,
      [id],
    );
  }

  /*
   * Cria a avaliacao.
   *
   * `agricultor_id` NAO vem do cliente: o service o copia de
   * `pedido_itens`. Aceitar esse campo do corpo permitiria registrar uma
   * nota em nome de outro produtor, derrubando a media de um concorrente
   * com o produto que o cliente realmente comprou de um terceiro.
   */
  async criar({ pedidoId, produtoId, consumidorId, agricultorId, nota, comentario }) {
    return this.buscarUm(
      `INSERT INTO avaliacoes
         (pedido_id, produto_id, consumidor_id, agricultor_id, nota, comentario)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, pedido_id, produto_id, consumidor_id, agricultor_id,
                 nota, comentario, criado_em, atualizado_em`,
      [pedidoId, produtoId, consumidorId, agricultorId, nota, comentario ?? null],
    );
  }

  /*
   * Atualiza os campos enviados, restrito ao dono.
   *
   * COALESCE EM `nota`, CASE EM `comentario` - e a diferenca e
   * proposital.
   *
   * `nota` e NOT NULL e sempre obrigatoria quando enviada: COALESCE($1,
   * nota) preserva a nota quando o campo nao veio no corpo. Sem o
   * COALESCE, um update so de comentario gravaria NULL e o banco
   * recusaria com 23502 - foi exatamente o que os testes pegaram.
   *
   * `comentario` e anulavel, e "nao enviado" precisa ser diferente de
   * "apagar". O flag `comentarioEnviado` diz qual dos dois e:
   *   - flag false  -> mantem o comentario atual
   *   - flag true   -> grava o valor enviado, inclusive NULL
   * Se usassemos COALESCE aqui tambem, apagar um comentario seria
   * impossivel: o cliente enviaria null e o valor antigo voltaria.
   *
   * O `AND consumidor_id = $4` e a autorizacao: mesmo que o service
   * erre, o id de outro consumidor nao altera linha nenhuma. Devolve
   * `null` quando nada mudou, e o service traduz em 404 - e nao 403,
   * para nao confirmar a existencia do recurso a quem nao e dono.
   */
  async atualizar(id, consumidorId, { nota, comentario, comentarioEnviado }) {
    return this.buscarUm(
      `UPDATE avaliacoes
          SET nota = COALESCE($1, nota),
              comentario = CASE WHEN $2 THEN $3 ELSE comentario END
        WHERE id = $4 AND consumidor_id = $5
    RETURNING id, pedido_id, produto_id, consumidor_id, agricultor_id,
              nota, comentario, criado_em, atualizado_em`,
      [
        nota ?? null,
        Boolean(comentarioEnviado),
        comentario ?? null,
        id,
        consumidorId,
      ],
    );
  }

  /*
   * Remove, restrito ao dono. Mesma logica do atualizar.
   *
   * A remocao e fisica (DELETE), e nao logica: avaliacao apagada nao
   * deve continuar contando na media, e nao ha requisito de auditoria
   * sobre avaliacoes.
   */
  async remover(id, consumidorId) {
    return this.buscarUm(
      `DELETE FROM avaliacoes
        WHERE id = $1 AND consumidor_id = $2
    RETURNING id`,
      [id, consumidorId],
    );
  }

  /*
   * Avaliacoes escritas por um consumidor ("minhas avaliacoes").
   *
   * Usa o SELECT_PUBLICO para trazer o nome do produto, e ordena por
   * `id DESC`. Ordenar por `criado_em` seria equivalente, mas dois
   * registros do mesmo milissegundo teriam ordem indefinida e a
   * paginacao poderia repetir ou pular uma linha.
   */
  async listarDoConsumidor(consumidorId, { limite, offset }) {
    const itens = await this.executar(
      `${SELECT_PUBLICO}
        WHERE av.consumidor_id = $1
        ORDER BY av.id DESC${this.montarLimiteOffset(limite, offset)}`,
      [consumidorId],
    );

    const total = await this.contar(
      'SELECT count(*)::int AS total FROM avaliacoes WHERE consumidor_id = $1',
      [consumidorId],
    );

    return { itens, total };
  }

  /*
   * Avaliacoes de um PRODUTO (leitura publica), paginadas.
   *
   * Diferente do `listarDoAgricultor`, que agrega tudo que o produtor
   * recebeu: aqui e a reputacao daquele item especifico, exibida na
   * pagina do produto.
   */
  async listarDoProduto(produtoId, { limite, offset }) {
    const itens = await this.executar(
      `${SELECT_PUBLICO}
        WHERE av.produto_id = $1
        ORDER BY av.id DESC${this.montarLimiteOffset(limite, offset)}`,
      [produtoId],
    );

    const total = await this.contar(
      'SELECT count(*)::int AS total FROM avaliacoes WHERE produto_id = $1',
      [produtoId],
    );

    return { itens, total };
  }

  /*
   * Produtos de um pedido ENTREGUES e ainda nao avaliados por este
   * consumidor.
   *
   * Alimenta a tela "avalie sua compra": depois de receber, o cliente ve
   * exatamente os itens que pode avaliar, sem precisar adivinhar quais
   * sao. O LEFT JOIN com `avaliacoes` exclui o que ja foi avaliado e o
   * status ENTREGUE impede avaliar antes de receber.
   *
   * Cobre tambem a regra multi-agricultor: um pedido com itens de dois
   * produtores devolve os itens dos dois, e cada avaliacao nasce ligada
   * ao produtor do item - nao ao pedido inteiro.
   */
  async listarPendentesDoPedido(consumidorId, pedidoId) {
    return this.executar(
      `SELECT
         pi.id AS item_id, pi.produto_id, pi.agricultor_id,
         p.nome AS produto_nome, p.imagem_url, p.unidade,
         a.nome_fazenda
       FROM pedido_itens pi
       JOIN pedidos pe     ON pe.id = pi.pedido_id
       JOIN produtos p     ON p.id = pi.produto_id
       JOIN agricultores a ON a.id = pi.agricultor_id
       LEFT JOIN avaliacoes av
              ON av.pedido_id = pe.id
             AND av.produto_id = pi.produto_id
             AND av.consumidor_id = pe.consumidor_id
      WHERE pe.id = $1
        AND pe.consumidor_id = $2
        AND pi.status = 'ENTREGUE'
        AND av.id IS NULL
      ORDER BY pi.id`,
      [pedidoId, consumidorId],
    );
  }
}

export default new AvaliacaoRepository();
