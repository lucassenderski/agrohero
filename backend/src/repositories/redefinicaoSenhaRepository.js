import { RepositorioBase } from './RepositorioBase.js';

export class RedefinicaoSenhaRepository extends RepositorioBase {
  constructor() {
    super('tokens_redefinicao_senha');
  }

  async buscarUsuarioPorEmail(email) {
    return this.buscarUm(
      'SELECT id, email, ativo FROM usuarios WHERE lower(email) = lower($1)',
      [email],
    );
  }

  async invalidarAtivos(usuarioId, cliente = null) {
    const sql = `
      UPDATE tokens_redefinicao_senha
         SET usado_em = COALESCE(usado_em, now())
       WHERE usuario_id = $1 AND usado_em IS NULL AND expira_em > now()
    `;
    if (cliente) return this.executarCom(cliente, sql, [usuarioId]);
    return this.executar(sql, [usuarioId]);
  }

  async criar({ usuarioId, tokenHash, expiraEm }, cliente = null) {
    const sql = `
      INSERT INTO tokens_redefinicao_senha (usuario_id, token_hash, expira_em)
      VALUES ($1, $2, $3)
      RETURNING id, usuario_id, expira_em
    `;
    const linhas = cliente
      ? await this.executarCom(cliente, sql, [usuarioId, tokenHash, expiraEm])
      : await this.executar(sql, [usuarioId, tokenHash, expiraEm]);
    return linhas[0];
  }

  async buscarValido(tokenHash, cliente = null) {
    const sql = `
      SELECT id, usuario_id
        FROM tokens_redefinicao_senha
       WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()
       FOR UPDATE
    `;
    return cliente
      ? (await cliente.query(sql, [tokenHash])).rows[0] ?? null
      : this.buscarUm(sql, [tokenHash]);
  }

  async marcarUsado(id, cliente) {
    const linhas = await this.executarCom(
      cliente,
      `UPDATE tokens_redefinicao_senha
          SET usado_em = now()
        WHERE id = $1 AND usado_em IS NULL
      RETURNING id`,
      [id],
    );
    return linhas[0] ?? null;
  }
}

export default new RedefinicaoSenhaRepository();
