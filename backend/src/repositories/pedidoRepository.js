import { RepositorioBase } from './RepositorioBase.js';

/*
 * Acesso a `pedidos`, `pedido_itens` e `pagamentos`.
 *
 * O metodo mais importante deste arquivo e `criarPedidoCompleto`, que
 * cria pedido + itens + baixa de estoque + pagamento numa UNICA
 * transacao. Ele recebe o `cliente` da transacao de fora (do service),
 * em vez de abrir a sua propria - assim o service controla onde a
 * transacao comeca e termina, e nada aqui escapa dela.
 *
 * REGRA DE OURO DO CHECKOUT: dentro da transacao, TODA query passa pelo
 * mesmo `cliente`. Usar `this.executar` (que pega conexao do pool)
 * pegaria OUTRA conexao, fora da transacao - a query nao veria as
 * alteracoes nao commitadas e nao seria desfeita pelo ROLLBACK.
 */

const COLUNAS_PEDIDO = `
  id, consumidor_id, status, valor_produtos, valor_frete, valor_total,
  endereco_entrega, criado_em, atualizado_em
`;

/*
 * Mesmas colunas, porem qualificadas pelo alias `p` e com o nome do
 * consumidor. A versao administrativa faz JOIN com `usuarios`, e sem o
 * prefixo o banco recusaria `id`, `status` e `criado_em` por ambiguidade
 * (as duas tabelas tem essas colunas).
 */
const COLUNAS_PEDIDO_ADMIN = `
  p.id, p.consumidor_id, p.status, p.valor_produtos, p.valor_frete,
  p.valor_total, p.endereco_entrega, p.criado_em, p.atualizado_em,
  u.nome AS consumidor_nome
`;

export class PedidoRepository extends RepositorioBase {
  constructor() {
    super('pedidos');
  }

  /*
   * Baixa o estoque de um produto de forma CONDICIONAL.
   *
   * O `AND estoque >= $2` e a parte critica. Ele faz do banco o arbitro
   * da concorrencia: se dois clientes comprarem o ultimo item ao mesmo
   * tempo, o UPDATE do segundo nao encontra linha para atualizar (porque
   * o estoque ja caiu), devolve zero linhas e o service aborta a
   * transacao.
   *
   * A alternativa ingenua - SELECT estoque, comparar na aplicacao,
   * depois UPDATE - tem condicao de corrida: os dois SELECTs leem o
   * mesmo estoque antes de qualquer UPDATE, e os dois pedidos passam.
   * Seria venda de estoque inexistente, o bug mais caro possivel num
   * marketplace.
   *
   * Devolve a linha atualizada, ou undefined quando nao havia estoque.
   */
  async baixarEstoque(cliente, produtoId, quantidade) {
    const linhas = await this.executarCom(
      cliente,
      `UPDATE produtos
          SET estoque = estoque - $2
        WHERE id = $1 AND estoque >= $2
      RETURNING id, nome, estoque`,
      [produtoId, quantidade],
    );

    return linhas[0] ?? null;
  }

  /*
   * Cria o pedido.
   *
   * O endereco vai como snapshot JSONB: o cliente pode editar ou apagar
   * o endereco depois, e o pedido precisa continuar mostrando para onde
   * o produto foi enviado.
   */
  async criar(cliente, { consumidorId, valorProdutos, valorFrete, valorTotal, enderecoEntrega }) {
    const linhas = await this.executarCom(
      cliente,
      `INSERT INTO pedidos
         (consumidor_id, valor_produtos, valor_frete, valor_total, endereco_entrega)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUNAS_PEDIDO}`,
      [consumidorId, valorProdutos, valorFrete, valorTotal, JSON.stringify(enderecoEntrega)],
    );

    return linhas[0];
  }

  /*
   * Insere os itens do pedido em UMA query.
   *
   * `agricultor_id` e copiado de cada item (denormalizacao proposital da
   * migration 004): e o que permite checar propriedade no painel do
   * agricultor com `WHERE agricultor_id = $1`, sem JOIN, e o que faz o
   * IDOR entre produtores ser impossivel por esquecimento.
   *
   * `preco_unitario` tambem e snapshot: o pedido de hoje mantem o valor
   * combinado mesmo que o produtor reajuste amanha.
   *
   * Os valores sao achatados em um unico array de parametros
   * ($1,$2,$3... por item) para a query ser uma so, e nao N INSERTs.
   */
  async inserirItens(cliente, pedidoId, itens) {
    const valores = [];
    const parametros = [];

    itens.forEach((item, indice) => {
      const base = indice * 6;
      valores.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
      );
      parametros.push(
        pedidoId,
        item.produtoId,
        item.agricultorId,
        item.precoUnitario,
        item.quantidade,
        item.subtotal,
      );
    });

    const linhas = await this.executarCom(
      cliente,
      `INSERT INTO pedido_itens
         (pedido_id, produto_id, agricultor_id, preco_unitario, quantidade, subtotal)
       VALUES ${valores.join(', ')}
       RETURNING id, produto_id, agricultor_id, preco_unitario, quantidade, subtotal, status`,
      parametros,
    );

    return linhas;
  }

  /*
   * Registra o pagamento de UM PRODUTOR no pedido.
   *
   * O pagamento e por (pedido, agricultor), e nao do pedido inteiro: um
   * pedido pode ter itens de varios produtores, e cada um recebe o seu
   * na retirada. Sem essa granularidade, "quem confirma o recebimento?"
   * nao teria resposta.
   *
   * Nasce PENDENTE - a receber no local - e so muda por acao do proprio
   * produtor (rota de confirmacao).
   */
  async criarPagamento(cliente, { pedidoId, agricultorId, metodo, valor, status = 'PENDENTE' }) {
    const linhas = await this.executarCom(
      cliente,
      `INSERT INTO pagamentos (pedido_id, agricultor_id, metodo, status, valor)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, pedido_id, agricultor_id, metodo, status, valor, criado_em`,
      [pedidoId, agricultorId, metodo, status, valor],
    );

    return linhas[0];
  }

  /*
   * Atualiza o status de um pagamento.
   *
   * Só o status: o valor e o metodo foram decididos no checkout a partir
   * do banco e nao mudam depois. Aceitar um valor novo aqui abriria a
   * porta para um pagamento divergir do pedido.
   */
  async atualizarPagamento(pagamentoId, { status }) {
    const linhas = await this.executar(
      `UPDATE pagamentos SET status = $2
        WHERE id = $1
      RETURNING id, pedido_id, agricultor_id, metodo, status, valor`,
      [pagamentoId, status],
    );

    return linhas[0] ?? null;
  }

  /*
   * Busca o pagamento de um produtor num pedido.
   *
   * E a consulta da confirmacao de recebimento. O par (pedido_id,
   * agricultor_id) e unico no banco, entao a busca sempre devolve no
   * maximo uma linha - e o produtor nunca alcanca o pagamento de outro,
   * porque o agricultor_id vem do token dele, nao da URL.
   */
  async buscarPagamentoDoAgricultor(pedidoId, agricultorId) {
    return this.buscarUm(
      `SELECT id, pedido_id, agricultor_id, metodo, status, valor, criado_em, atualizado_em
         FROM pagamentos
        WHERE pedido_id = $1 AND agricultor_id = $2`,
      [pedidoId, agricultorId],
    );
  }

  /*
   * Marca como CANCELADO todo pagamento ainda PENDENTE do pedido.
   *
   * Usado quando o pedido e cancelado. `WHERE status = 'PENDENTE'` e
   * deliberado: um pagamento ja PAGO nao vira CANCELADO por um UPDATE
   * silencioso. Dinheiro que ja trocou de mao e um fato, e apaga-lo no
   * banco nao o devolve - a rota de cancelamento trata esse caso.
   */
  async cancelarPagamentosPendentes(cliente, pedidoId) {
    const linhas = await this.executarCom(
      cliente,
      `UPDATE pagamentos SET status = 'CANCELADO'
        WHERE pedido_id = $1 AND status = 'PENDENTE'
      RETURNING id, agricultor_id`,
      [pedidoId],
    );

    return linhas;
  }

  /*
   * Marca um pagamento PENDENTE como PAGO.
   *
   * O `AND status = 'PENDENTE'` no WHERE e o que torna a confirmacao
   * idempotente e segura sob concorrencia: dois toques no botao, ou duas
   * abas abertas, chegam como dois UPDATEs, e apenas o primeiro encontra
   * a linha PENDENTE. O segundo nao altera nada e o service responde
   * "ja estava pago" em vez de dar baixa duas vezes.
   *
   * Devolve null quando nada foi atualizado - e essa ausencia de linha,
   * e nao um erro, que informa o estado ao chamador.
   */
  async marcarPagamentoComoPago(pagamentoId) {
    const linhas = await this.executar(
      `UPDATE pagamentos SET status = 'PAGO'
        WHERE id = $1 AND status = 'PENDENTE'
      RETURNING id, pedido_id, agricultor_id, metodo, status, valor, atualizado_em`,
      [pagamentoId],
    );

    return linhas[0] ?? null;
  }

  /*
   * Ajusta o valor do pagamento PENDENTE de um produtor (delta em reais).
   *
   * Usado quando o produtor cancela um item proprio: o que ele tem a
   * receber cai pelo subtotal do item que nao sera entregue.
   *
   * TRES GUARDAS, cada uma contra um erro concreto:
   *   - `status = 'PENDENTE'`: se ja foi recebido, nao se mexe. O acerto
   *     de um valor ja pago e presencial.
   *   - `valor + $3 > 0`: o banco tem CHECK(valor > 0). Sem esta guarda,
   *     cancelar o unico item deixaria o pagamento em zero e o UPDATE
   *     estouraria o CHECK - virando erro 500 num fluxo legitimo. Com
   *     ela, o UPDATE simplesmente nao casa e a linha fica como esta.
   *   - GREATEST evita passar por zero por um arredondamento de centavo.
   */
  async ajustarPagamentoDoAgricultor(cliente, pedidoId, agricultorId, delta) {
    const linhas = await this.executarCom(
      cliente,
      `UPDATE pagamentos
          SET valor = GREATEST(valor + $3, 0.01)
        WHERE pedido_id = $1
          AND agricultor_id = $2
          AND status = 'PENDENTE'
          AND valor + $3 > 0
      RETURNING id, valor`,
      [pedidoId, agricultorId, delta],
    );

    return linhas[0] ?? null;
  }

  /* Pagamentos ja recebidos de um pedido (para o cancelamento avisar). */
  async contarPagamentosPagos(pedidoId) {
    const linha = await this.buscarUm(
      `SELECT count(*)::int AS total FROM pagamentos
        WHERE pedido_id = $1 AND status = 'PAGO'`,
      [pedidoId],
    );

    return linha?.total ?? 0;
  }

  /*
   * Esvazia o carrinho do consumidor, dentro da transacao do checkout.
   *
   * Fica aqui, e nao no carrinhoRepository, porque precisa rodar no
   * MESMO cliente da transacao - e a criacao do pedido so e valida se o
   * carrinho for consumido no mesmo commit.
   */
  async limparCarrinhoDoConsumidor(cliente, consumidorId) {
    const linhas = await this.executarCom(
      cliente,
      `DELETE FROM carrinho_itens
        WHERE carrinho_id IN (SELECT id FROM carrinhos WHERE consumidor_id = $1)
      RETURNING id`,
      [consumidorId],
    );

    return linhas.length;
  }

  /*
   * E-mails dos produtores que venderam neste pedido, com os itens de
   * cada um.
   *
   * Roda FORA da transacao do checkout, de proposito: o e-mail e efeito
   * colateral posterior ao commit, e segurar o lock do estoque durante
   * uma chamada de rede (Resend) seria caro. Se o processo cair entre o
   * commit e o envio, o pedido existe e o produtor ve o item no painel -
   * perder o aviso e ruim, perder o pedido seria pior.
   */
  async listarProdutoresParaNotificar(pedidoId) {
    const linhas = await this.executar(
      `SELECT
         a.id            AS agricultor_id,
         a.nome_fazenda,
         u.email         AS email,
         pi.produto_id,
         p.nome,
         pi.quantidade,
         pi.subtotal
       FROM pedido_itens pi
       JOIN agricultores a ON a.id = pi.agricultor_id
       JOIN usuarios u     ON u.id = a.usuario_id
       JOIN produtos p     ON p.id = pi.produto_id
       WHERE pi.pedido_id = $1
       ORDER BY pi.id`,
      [pedidoId],
    );

    const porAgricultor = new Map();

    for (const linha of linhas) {
      if (!porAgricultor.has(linha.agricultor_id)) {
        porAgricultor.set(linha.agricultor_id, {
          agricultor_id: linha.agricultor_id,
          nome_fazenda: linha.nome_fazenda,
          email: linha.email,
          itens: [],
        });
      }

      porAgricultor.get(linha.agricultor_id).itens.push({
        produto_id: linha.produto_id,
        nome: linha.nome,
        quantidade: linha.quantidade,
        subtotal: Number(linha.subtotal),
      });
    }

    return [...porAgricultor.values()];
  }

  /* Busca um pedido pelo id (sem checagem de dono - o service faz isso). */
  async buscarPorId(id) {
    return this.buscarUm(`SELECT ${COLUNAS_PEDIDO} FROM pedidos WHERE id = $1`, [id]);
  }

  /*
   * Itens de um pedido com o nome do produto e da fazenda.
   *
   * LEFT JOIN em produtos porque o produto pode ter sido desativado - e
   * o item do pedido precisa continuar aparecendo. (O ON DELETE RESTRICT
   * impede que ele seja apagado, mas a projecao precisa tolerar `ativo`
   * falso.)
   */
  async listarItens(pedidoId) {
    return this.executar(
      `SELECT
         pi.id, pi.produto_id, pi.agricultor_id, pi.preco_unitario,
         pi.quantidade, pi.subtotal, pi.status,
         p.nome AS produto_nome,
         p.unidade,
         p.imagem_url,
         a.nome_fazenda,
         u.nome AS agricultor_nome
       FROM pedido_itens pi
       JOIN produtos p     ON p.id = pi.produto_id
       JOIN agricultores a ON a.id = pi.agricultor_id
       JOIN usuarios u     ON u.id = a.usuario_id
      WHERE pi.pedido_id = $1
      ORDER BY pi.id`,
      [pedidoId],
    );
  }

  /*
   * Pagamentos de um pedido, um por produtor.
   *
   * O JOIN com agricultores traz o nome da fazenda: com varios
   * produtores no mesmo pedido, so o metodo e o valor nao dizem a quem
   * cada linha se refere - nem para o cliente, nem para o admin.
   */
  async listarPagamentos(pedidoId) {
    return this.executar(
      `SELECT pg.id, pg.pedido_id, pg.agricultor_id, pg.metodo, pg.status,
              pg.valor, pg.criado_em, pg.atualizado_em,
              a.nome_fazenda
         FROM pagamentos pg
         JOIN agricultores a ON a.id = pg.agricultor_id
        WHERE pg.pedido_id = $1
        ORDER BY pg.id`,
      [pedidoId],
    );
  }

  /*
   * Agregado dos pagamentos de um pedido, por status.
   *
   * Serve para responder "este pedido ja foi todo pago?" sem trazer as
   * linhas. Contar no banco evita que a resposta dependa de o chamador
   * somar certo.
   */
  async resumoPagamentosDoPedido(pedidoId) {
    return this.buscarUm(
      `SELECT
         count(*)::int                                      AS total,
         count(*) FILTER (WHERE status = 'PAGO')::int       AS pagos,
         count(*) FILTER (WHERE status = 'PENDENTE')::int   AS pendentes,
         coalesce(sum(valor) FILTER (WHERE status = 'PAGO'), 0)::numeric(10,2) AS valor_pago,
         coalesce(sum(valor), 0)::numeric(10,2)             AS valor_total
       FROM pagamentos WHERE pedido_id = $1`,
      [pedidoId],
    );
  }

  /* Pedidos do consumidor, paginados. */
  async listarDoConsumidor(consumidorId, { status, limite, offset }) {
    const filtros = ['consumidor_id = $1'];
    const parametros = [consumidorId];

    if (status) {
      parametros.push(status);
      filtros.push(`status = $${parametros.length}`);
    }

    const onde = `WHERE ${filtros.join(' AND ')}`;

    const itens = await this.executar(
      `SELECT ${COLUNAS_PEDIDO} FROM pedidos ${onde}
        ORDER BY criado_em DESC
        LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
      [...parametros, limite, offset],
    );

    const total = await this.contar(`SELECT count(*)::int AS total FROM pedidos ${onde}`, parametros);

    return { itens, total };
  }

  /*
   * Itens de pedido que pertencem a UM agricultor, com o pedido.
   *
   * Esta e a consulta do painel do agricultor, e o `pi.agricultor_id = $1`
   * e o que garante o requisito 18: o produtor A so enxerga os itens
   * dele, mesmo em pedido que tambem tem produtos do produtor B.
   */
  async listarItensDoAgricultor(agricultorId, { status, limite, offset }) {
    const filtros = ['pi.agricultor_id = $1'];
    const parametros = [agricultorId];

    if (status) {
      parametros.push(status);
      filtros.push(`pi.status = $${parametros.length}`);
    }

    const onde = `WHERE ${filtros.join(' AND ')}`;

    const itens = await this.executar(
      `SELECT
         pi.id, pi.pedido_id, pi.produto_id, pi.agricultor_id, pi.preco_unitario,
         pi.quantidade, pi.subtotal, pi.status, pi.criado_em,
         p.nome AS produto_nome, p.unidade, p.imagem_url,
         pe.status AS pedido_status,
         pe.criado_em AS pedido_criado_em,
         pe.endereco_entrega,
         pg.id     AS pagamento_id,
         pg.status AS pagamento_status,
         pg.metodo AS pagamento_metodo,
         pg.valor  AS pagamento_valor
       FROM pedido_itens pi
       JOIN pedidos pe  ON pe.id = pi.pedido_id
       JOIN produtos p  ON p.id = pi.produto_id
       LEFT JOIN pagamentos pg
              ON pg.pedido_id = pi.pedido_id
             AND pg.agricultor_id = pi.agricultor_id
       ${onde}
      ORDER BY pi.criado_em DESC
      LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
      [...parametros, limite, offset],
    );

    const total = await this.contar(
      `SELECT count(*)::int AS total FROM pedido_itens pi ${onde}`,
      parametros,
    );

    return { itens, total };
  }

  /* Busca um item de pedido restrito ao agricultor dono. */
  async buscarItemDoAgricultor(agricultorId, itemId) {
    return this.buscarUm(
      `SELECT id, pedido_id, produto_id, agricultor_id, preco_unitario,
              quantidade, subtotal, status
         FROM pedido_itens
        WHERE id = $1 AND agricultor_id = $2`,
      [itemId, agricultorId],
    );
  }

  /*
   * Altera o status de um item de pedido, restrito ao agricultor dono.
   *
   * O `AND agricultor_id = $3` no WHERE e a defesa contra o IDOR entre
   * produtores: mesmo que o agricultor A envie o id de um item do
   * agricultor B, nenhuma linha e atualizada.
   *
   * A sincronizacao de `pedidos.status` acontece por TRIGGER no banco
   * (migration 004), nao aqui. Fazer isso na aplicacao criaria dois
   * lugares decidindo o mesmo estado.
   */
  async alterarStatusItem(agricultorId, itemId, novoStatus) {
    const linhas = await this.executar(
      `UPDATE pedido_itens
          SET status = $3
        WHERE id = $1 AND agricultor_id = $2
      RETURNING id, pedido_id, produto_id, agricultor_id, quantidade, subtotal, status`,
      [itemId, agricultorId, novoStatus],
    );

    return linhas[0] ?? null;
  }

  /*
   * Cancela todos os itens de um pedido do consumidor.
   *
   * Usado no cancelamento pelo cliente. Roda em transacao porque precisa
   * devolver o estoque dos itens que ainda nao foram enviados.
   */
  async cancelarItensDoPedido(cliente, pedidoId) {
    const linhas = await this.executarCom(
      cliente,
      `UPDATE pedido_itens
          SET status = 'CANCELADO'
        WHERE pedido_id = $1
          AND status IN ('PENDENTE', 'PROCESSANDO')
      RETURNING id, produto_id, quantidade, status`,
      [pedidoId],
    );

    return linhas;
  }

  /* Devolve estoque de um produto, dentro de uma transacao. */
  async devolverEstoque(cliente, produtoId, quantidade) {
    const linhas = await this.executarCom(
      cliente,
      `UPDATE produtos SET estoque = estoque + $2 WHERE id = $1
      RETURNING id, nome, estoque`,
      [produtoId, quantidade],
    );

    return linhas[0] ?? null;
  }

  /*
   * Marca os itens de um pedido como ENVIADO ou ENTREGUE em bloco.
   *
   * Usado pelo administrador. Diferente do agricultor (que altera item
   * a item, so os dele), o admin age sobre o pedido inteiro.
   */
  async alterarStatusTodosItens(cliente, pedidoId, deStatus, paraStatus) {
    const linhas = await this.executarCom(
      cliente,
      `UPDATE pedido_itens SET status = $3
        WHERE pedido_id = $1 AND status = ANY($2::varchar[])
      RETURNING id, produto_id, quantidade, status`,
      [pedidoId, deStatus, paraStatus],
    );

    return linhas;
  }

  /* Todos os pedidos (visao administrativa), paginados. */
  async listarTodos({ status, consumidorId, limite, offset }) {
    const filtros = [];
    const parametros = [];

    if (status) {
      parametros.push(status);
      filtros.push(`p.status = $${parametros.length}`);
    }

    if (consumidorId) {
      parametros.push(consumidorId);
      filtros.push(`p.consumidor_id = $${parametros.length}`);
    }

    const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

    const itens = await this.executar(
      `SELECT ${COLUNAS_PEDIDO_ADMIN}
         FROM pedidos p
         JOIN usuarios u ON u.id = p.consumidor_id
         ${onde}
        ORDER BY p.criado_em DESC
        LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
      [...parametros, limite, offset],
    );

    const total = await this.contar(
      `SELECT count(*)::int AS total FROM pedidos p ${onde}`,
      parametros,
    );

    return { itens, total };
  }

  /*
   * Metricas agregadas para os paineis.
   *
   * Uma consulta por painel, em vez de varias idas ao banco. O filtro
   * por agricultor entra por `pedido_itens.agricultor_id`, para o painel
   * do produtor contar so o que e dele.
   */
  async metricasDoConsumidor(consumidorId) {
    const linha = await this.buscarUm(
      `SELECT
         count(*)::int                                              AS total_pedidos,
         count(*) FILTER (WHERE status = 'PENDENTE')::int           AS pendentes,
         count(*) FILTER (WHERE status = 'ENTREGUE')::int           AS entregues,
         count(*) FILTER (WHERE status = 'CANCELADO')::int          AS cancelados,
         COALESCE(sum(valor_total) FILTER (WHERE status <> 'CANCELADO'), 0) AS valor_total_gasto
       FROM pedidos WHERE consumidor_id = $1`,
      [consumidorId],
    );

    return linha;
  }

  async metricasDoAgricultor(agricultorId) {
    const linha = await this.buscarUm(
      `SELECT
         count(DISTINCT pi.pedido_id)::int                            AS total_pedidos,
         count(*)::int                                                AS total_itens,
         count(*) FILTER (WHERE pi.status = 'PENDENTE')::int          AS pendentes,
         count(*) FILTER (WHERE pi.status = 'PROCESSANDO')::int       AS processando,
         count(*) FILTER (WHERE pi.status = 'ENTREGUE')::int          AS entregues,
         COALESCE(sum(pi.subtotal) FILTER (WHERE pi.status <> 'CANCELADO'), 0) AS valor_vendido
       FROM pedido_itens pi
      WHERE pi.agricultor_id = $1`,
      [agricultorId],
    );

    return linha;
  }
}

export default new PedidoRepository();