import { RepositorioBase } from './RepositorioBase.js';

/*
 * Acesso a tabela `usuarios`.
 *
 * Todas as queries sao parametrizadas. A selecao de colunas e sempre
 * explicita: nunca usamos `SELECT *`, porque um `*` futuro traria
 * senha_hash para o controller sem que ninguem percebesse.
 */

/*
 * Colunas seguras para qualquer resposta da API.
 *
 * senha_hash fica FORA desta lista de proposito. Um erro de programacao
 * que devolvesse o objeto inteiro do repositorio vazaria o hash; com a
 * lista explicita, o pior caso vaza apenas dados ja publicos.
 */
const COLUNAS_PUBLICAS = `
  id, nome, email, telefone, cidade, estado, tipo, ativo,
  criado_em, atualizado_em
`;

export class UsuarioRepository extends RepositorioBase {
  constructor() {
    super('usuarios');
  }

  /* Busca por id, devolvendo apenas dados publicos. */
  async buscarPorId(id) {
    return this.buscarUm(
      `SELECT ${COLUNAS_PUBLICAS} FROM usuarios WHERE id = $1`,
      [id],
    );
  }

  /*
   * Busca por e-mail INCLUINDO o hash da senha.
   *
   * Metodo separado, e nao um parametro booleano em buscarPorId, para
   * que o hash so apareca em quem realmente precisa dele: a verificacao
   * de login. O nome do metodo deixa isso explicito na revisao de codigo.
   */
  async buscarPorEmailComSenha(email) {
    return this.buscarUm(
      `SELECT ${COLUNAS_PUBLICAS}, senha_hash
         FROM usuarios
        WHERE lower(email) = lower($1)`,
      [email],
    );
  }

  /*
   * Busca por id INCLUINDO o hash da senha.
   *
   * Usado pela troca de senha, que precisa comparar a senha atual
   * informada com o hash guardado. Antes esse fluxo buscava o usuario
   * duas vezes (uma por id, so para descobrir o e-mail, e outra por
   * e-mail, para obter o hash) - dois round-trips para um dado que esta
   * na mesma linha da tabela.
   */
  async buscarPorIdComSenha(id) {
    return this.buscarUm(
      `SELECT ${COLUNAS_PUBLICAS}, senha_hash FROM usuarios WHERE id = $1`,
      [id],
    );
  }

  /* Verifica se um e-mail ja esta cadastrado. */
  async emailEmUso(email, ignorarId = null) {
    const linha = await this.buscarUm(
      `SELECT id FROM usuarios
        WHERE lower(email) = lower($1)
          AND ($2::bigint IS NULL OR id <> $2::bigint)`,
      [email, ignorarId],
    );
    return linha !== null;
  }

  /*
   * Cria o usuario.
   *
   * `cliente` e opcional: quando o cadastro de agricultor precisa criar
   * usuario e perfil na mesma transacao, o service passa o cliente. Sem
   * ele, usamos o pool (caso de um cadastro isolado).
   */
  async criar({ nome, email, senhaHash, telefone, cidade, estado, tipo }, cliente = null) {
    const sql = `
      INSERT INTO usuarios (nome, email, senha_hash, telefone, cidade, estado, tipo)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${COLUNAS_PUBLICAS}
    `;
    const parametros = [
      nome,
      email,
      senhaHash,
      telefone ?? null,
      cidade ?? null,
      estado ?? null,
      tipo,
    ];

    const linhas = cliente
      ? await this.executarCom(cliente, sql, parametros)
      : await this.executar(sql, parametros);

    return linhas[0];
  }

  /* Atualiza os campos de perfil que o proprio usuario pode alterar. */
  async atualizar(id, { nome, telefone, cidade, estado }) {
    const linhas = await this.executar(
      `UPDATE usuarios
          SET nome     = COALESCE($2, nome),
              telefone = COALESCE($3, telefone),
              cidade   = COALESCE($4, cidade),
              estado   = COALESCE($5, estado)
        WHERE id = $1
      RETURNING ${COLUNAS_PUBLICAS}`,
      [id, nome ?? null, telefone ?? null, cidade ?? null, estado ?? null],
    );

    return linhas[0] ?? null;
  }

  /* Troca a senha. Recebe o hash ja gerado - nunca a senha em texto puro. */
  async atualizarSenha(id, senhaHash) {
    const linhas = await this.executar(
      `UPDATE usuarios SET senha_hash = $2 WHERE id = $1 RETURNING id`,
      [id, senhaHash],
    );
    return linhas[0] ?? null;
  }

  /* Usado pelo painel administrativo (FASE 19). */
  async definirAtivo(id, ativo) {
    const linhas = await this.executar(
      `UPDATE usuarios SET ativo = $2 WHERE id = $1 RETURNING ${COLUNAS_PUBLICAS}`,
      [id, ativo],
    );
    return linhas[0] ?? null;
  }
}

export default new UsuarioRepository();
