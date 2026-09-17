import { RepositorioBase } from './RepositorioBase.js';

/*
 * Acesso a tabela `agricultores` (perfil publico do produtor).
 *
 * O perfil fica separado do login: `usuarios` guarda a identidade e
 * `agricultores` guarda a propriedade. Por isso toda consulta publica
 * precisa do JOIN com usuarios para trazer nome e contato.
 */

const COLUNAS_PERFIL = `
  a.id, a.usuario_id, a.nome_fazenda, a.descricao, a.historia,
  a.cidade, a.estado, a.endereco, a.certificacoes,
  a.imagem_url, a.imagem_public_id, a.ativo,
  a.criado_em, a.atualizado_em
`;

/* Dados publicos do produtor, ja com o nome do responsavel. */
const SELECT_PUBLICO = `
  SELECT ${COLUNAS_PERFIL},
         u.nome  AS responsavel_nome,
         u.email AS responsavel_email,
         u.telefone AS responsavel_telefone
    FROM agricultores a
    JOIN usuarios u ON u.id = a.usuario_id
`;

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

  /* Listagem paginada de produtores ativos, com filtro por localizacao. */
  async listar({ cidade, estado, limite, offset }) {
    const filtros = ['a.ativo = TRUE', 'u.ativo = TRUE'];
    const parametros = [];

    if (cidade) {
      parametros.push(`%${cidade}%`);
      filtros.push(`a.cidade ILIKE $${parametros.length}`);
    }
    if (estado) {
      parametros.push(estado);
      filtros.push(`a.estado = $${parametros.length}`);
    }

    const onde = `WHERE ${filtros.join(' AND ')}`;

    const itens = await this.executar(
      `${SELECT_PUBLICO} ${onde} ORDER BY a.nome_fazenda ASC${this.montarLimiteOffset(limite, offset)}`,
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
