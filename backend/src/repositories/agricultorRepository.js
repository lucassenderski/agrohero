import { RepositorioBase } from './RepositorioBase.js';

/*
 * Acesso a tabela `agricultores` (perfil publico do produtor).
 *
 * O perfil fica separado do login: `usuarios` guarda a identidade e
 * `agricultores` guarda a propriedade. Por isso toda consulta publica
 * precisa do JOIN com usuarios para trazer o nome do responsavel.
 *
 * DECISAO SOBRE DADOS DE CONTATO
 *
 * A projecao publica NAO devolve e-mail, telefone nem o endereco
 * completo do produtor. O requisito 13 define o que o perfil publico
 * mostra: nome, propriedade, cidade, estado, historia, descricao,
 * certificacoes, foto, produtos e avaliacoes. Contato nao esta na lista.
 *
 * Expor `responsavel_email` numa rota publica teria duas consequencias
 * ruins: o e-mail do produtor seria colhido por bots de spam, e a rota
 * viraria um oraculo para confirmar quais e-mails existem no sistema.
 *
 * `imagem_public_id` tambem fica fora: e o identificador interno do
 * arquivo no servico de armazenamento, util apenas para apagar a imagem.
 * O cliente so precisa da URL.
 *
 * Se o contato for necessario no futuro (negociacao direta, por
 * exemplo), entra como campo proprio do perfil, com opt-in do produtor -
 * nunca por padrao.
 */

const COLUNAS_PERFIL = `
  a.id, a.usuario_id, a.nome_fazenda, a.descricao, a.historia,
  a.cidade, a.estado, a.certificacoes,
  a.imagem_url, a.ativo,
  a.criado_em, a.atualizado_em
`;

/*
 * Reputacao agregada por produtor, calculada de forma correlacionada
 * (LATERAL) e nao em uma subquery que agrupa a tabela inteira.
 *
 * A diferenca importa com a tabela grande: uma subquery agregada
 * calcularia a media de TODOS os produtores antes do LIMIT. Com LATERAL,
 * o banco usa o indice `avaliacoes_agricultor_idx` e calcula apenas para
 * as linhas que a pagina realmente vai mostrar.
 */
const LATERAL_REPUTACAO = `
  LEFT JOIN LATERAL (
    SELECT round(coalesce(avg(av.nota), 0), 2)::float AS media_avaliacoes,
           count(av.id)::int                          AS total_avaliacoes
      FROM avaliacoes av
     WHERE av.agricultor_id = a.id
  ) r ON TRUE
`;

/* Perfil publico do produtor, com nome do responsavel e reputacao. */
const SELECT_PUBLICO = `
  SELECT ${COLUNAS_PERFIL},
         u.nome AS responsavel_nome,
         u.ativo AS usuario_ativo,
         r.media_avaliacoes,
         r.total_avaliacoes
    FROM agricultores a
    JOIN usuarios u ON u.id = a.usuario_id
    ${LATERAL_REPUTACAO}
`;

/* Visivel no marketplace: perfil ativo e usuario ativo. */
const VISIVEL_PUBLICO = 'a.ativo = TRUE AND u.ativo = TRUE';

/*
 * Escapa os curingas do LIKE no termo de busca.
 *
 * Sem isso, procurar por "100%" casaria com qualquer nome, porque o `%`
 * digitado pelo usuario seria interpretado como curinga do proprio LIKE.
 * A barra invertida precisa vir primeiro, senao ela mesma seria escapada
 * duas vezes.
 */
function escaparTermoBusca(termo) {
  return termo.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export class AgricultorRepository extends RepositorioBase {
  constructor() {
    super('agricultores');
  }

  /*
   * Busca o perfil pelo id do AGRICULTOR.
   *
   * Retorna o perfil mesmo quando inativo ou com usuario bloqueado: a
   * decisao de esconder isso e da camada de servico, que precisa saber a
   * diferenca entre "nao existe" e "existe mas esta suspenso".
   */
  async buscarPorId(id) {
    return this.buscarUm(`${SELECT_PUBLICO} WHERE a.id = $1`, [id]);
  }

  /*
   * Busca pelo id do USUARIO dono do perfil.
   *
   * E o metodo mais importante para autorizacao: o id do usuario vem do
   * token, e com ele resolvemos o agricultor_id correspondente. E assim
   * que um produtor nunca consegue agir em nome de outro.
   */
  async buscarPorUsuarioId(usuarioId) {
    return this.buscarUm(
      `${SELECT_PUBLICO} WHERE a.usuario_id = $1`,
      [usuarioId],
    );
  }

  /* Cria o perfil do produtor. Aceita cliente para uso dentro de transacao. */
  async criar(
    { usuarioId, nomeFazenda, descricao, historia, cidade, estado, endereco, certificacoes },
    cliente = null,
  ) {
    const sql = `
      INSERT INTO agricultores
        (usuario_id, nome_fazenda, descricao, historia, cidade, estado, endereco, certificacoes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    const parametros = [
      usuarioId,
      nomeFazenda,
      descricao ?? null,
      historia ?? null,
      cidade ?? null,
      estado ?? null,
      endereco ?? null,
      certificacoes ?? [],
    ];

    const linhas = cliente
      ? await this.executarCom(cliente, sql, parametros)
      : await this.executar(sql, parametros);

    return linhas[0];
  }

  /* Atualiza o perfil publico do produtor. */
  async atualizar(id, dados) {
    const linhas = await this.executar(
      `UPDATE agricultores
          SET nome_fazenda  = COALESCE($2, nome_fazenda),
              descricao     = COALESCE($3, descricao),
              historia      = COALESCE($4, historia),
              cidade        = COALESCE($5, cidade),
              estado        = COALESCE($6, estado),
              endereco      = COALESCE($7, endereco),
              certificacoes = COALESCE($8, certificacoes)
        WHERE id = $1
      RETURNING id`,
      [
        id,
        dados.nomeFazenda ?? null,
        dados.descricao ?? null,
        dados.historia ?? null,
        dados.cidade ?? null,
        dados.estado ?? null,
        dados.endereco ?? null,
        dados.certificacoes ?? null,
      ],
    );

    return linhas[0] ?? null;
  }

  /* Atualiza apenas a imagem (a URL vem do servico de armazenamento). */
  async atualizarImagem(id, imagemUrl, imagemPublicId = null) {
    const linhas = await this.executar(
      `UPDATE agricultores
          SET imagem_url = $2, imagem_public_id = $3
        WHERE id = $1
      RETURNING id`,
      [id, imagemUrl, imagemPublicId],
    );
    return linhas[0] ?? null;
  }

  /*
   * Listagem paginada de produtores visiveis.
   *
   * Filtros: busca textual pela propriedade, cidade e estado. A busca usa
   * ILIKE e nao o indice GIN de full-text porque, em nome de fazenda, o
   * visitante digita um pedaco do nome ("boa vis", "sitio") - prefixo,
   * nao palavra. O GIN com to_tsvector casaria palavras inteiras, que e
   * o oposto do que se espera aqui.
   */
  async listar({ busca, cidade, estado, ordenar, limite, offset }) {
    const ordenacao = this.resolverOrdenacao(
      ordenar,
      {
        nome: 'a.nome_fazenda ASC',
        recentes: 'a.criado_em DESC',
        // O desempate por nome mantem a paginacao estavel: sem ele, dois
        // produtores com a mesma media poderiam trocar de posicao entre
        // uma pagina e outra, e o visitante veria o mesmo item duas vezes.
        avaliacao: 'r.media_avaliacoes DESC, r.total_avaliacoes DESC, a.nome_fazenda ASC',
      },
      'nome',
    );

    const filtros = [VISIVEL_PUBLICO];
    const parametros = [];

    if (busca) {
      parametros.push(`%${escaparTermoBusca(busca)}%`);
      filtros.push(`a.nome_fazenda ILIKE $${parametros.length}`);
    }
    if (cidade) {
      parametros.push(cidade);
      filtros.push(`a.cidade ILIKE $${parametros.length}`);
    }
    if (estado) {
      parametros.push(estado);
      filtros.push(`a.estado = $${parametros.length}`);
    }

    const onde = `WHERE ${filtros.join(' AND ')}`;

    const itens = await this.executar(
      `${SELECT_PUBLICO} ${onde} ORDER BY ${ordenacao}${this.montarLimiteOffset(limite, offset)}`,
      parametros,
    );

    const total = await this.contar(
      `SELECT count(*)::int AS total
         FROM agricultores a
         JOIN usuarios u ON u.id = a.usuario_id
         ${onde}`,
      parametros,
    );

    return { itens, total };
  }
}

export default new AgricultorRepository();
