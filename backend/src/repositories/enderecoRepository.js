import { RepositorioBase } from './RepositorioBase.js';

/*
 * Acesso a tabela `enderecos`.
 *
 * O endereco pertence ao consumidor. TODA consulta e toda escrita filtra
 * por `consumidor_id`, e nao apenas por `id`. Essa e a defesa contra
 * IDOR: mesmo que um cliente descubra o id de um endereco alheio, a
 * consulta nao o encontra, porque o filtro de dono vai junto.
 */
export class EnderecoRepository extends RepositorioBase {
  constructor() {
    super('enderecos');
  }

  /* Lista os enderecos do consumidor, com o principal primeiro. */
  async listarDoConsumidor(consumidorId) {
    return this.executar(
      `SELECT id, nome_destinatario, cep, rua, numero, complemento,
              bairro, cidade, estado, principal, criado_em, atualizado_em
         FROM enderecos
        WHERE consumidor_id = $1
        ORDER BY principal DESC, criado_em DESC`,
      [consumidorId],
    );
  }

  /*
   * Busca um endereco pelo id RESTRITO ao dono.
   *
   * O `AND consumidor_id = $2` nao e redundante com o id: e o que impede
   * um cliente de ler (ou pior, usar no checkout) o endereco de outro.
   */
  async buscarDoConsumidor(consumidorId, enderecoId) {
    return this.buscarUm(
      `SELECT id, nome_destinatario, cep, rua, numero, complemento,
              bairro, cidade, estado, principal, criado_em, atualizado_em
         FROM enderecos
        WHERE id = $1 AND consumidor_id = $2`,
      [enderecoId, consumidorId],
    );
  }

  /* Endereco principal do consumidor, se houver. */
  async buscarPrincipal(consumidorId) {
    return this.buscarUm(
      `SELECT id, nome_destinatario, cep, rua, numero, complemento,
              bairro, cidade, estado, principal
         FROM enderecos
        WHERE consumidor_id = $1 AND principal = TRUE`,
      [consumidorId],
    );
  }

  /*
   * Cria um endereco.
   *
   * O primeiro endereco do consumidor vira principal automaticamente:
   * um cliente com um unico endereco que nao fosse principal nao teria
   * como ser escolhido por padrao no checkout, o que nao faz sentido.
   *
   * O `NOT EXISTS` consulta a mesma tabela dentro do INSERT, entao a
   * decisao e atomica - nao ha janela entre "conto quantos existem" e
   * "insiro o novo".
   */
  async criar(consumidorId, dados) {
    const { nomeDestinatario, cep, rua, numero, complemento, bairro, cidade, estado } = dados;

    const linhas = await this.executar(
      `INSERT INTO enderecos
         (consumidor_id, nome_destinatario, cep, rua, numero, complemento,
          bairro, cidade, estado, principal)
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         NOT EXISTS (SELECT 1 FROM enderecos WHERE consumidor_id = $1)
       )
       RETURNING id, nome_destinatario, cep, rua, numero, complemento,
                 bairro, cidade, estado, principal`,
      [consumidorId, nomeDestinatario, cep, rua, numero, complemento, bairro, cidade, estado],
    );

    return linhas[0];
  }

  /* Atualiza os dados do endereco, restrito ao dono. */
  async atualizar(consumidorId, enderecoId, dados) {
    const { nomeDestinatario, cep, rua, numero, complemento, bairro, cidade, estado } = dados;

    const linhas = await this.executar(
      `UPDATE enderecos
          SET nome_destinatario = $3,
              cep = $4,
              rua = $5,
              numero = $6,
              complemento = $7,
              bairro = $8,
              cidade = $9,
              estado = $10
        WHERE id = $1 AND consumidor_id = $2
      RETURNING id, nome_destinatario, cep, rua, numero, complemento,
                bairro, cidade, estado, principal`,
      [enderecoId, consumidorId, nomeDestinatario, cep, rua, numero, complemento, bairro, cidade, estado],
    );

    return linhas[0] ?? null;
  }

  /*
   * Define o endereco como principal.
   *
   * As duas operacoes vao na MESMA transacao. O indice parcial unico
   * `enderecos_um_principal_por_consumidor` impede dois principais, entao
   * desmarcar o antigo e marcar o novo precisam ser atomicos - senao a
   * ordem das duas queries decidiria entre sucesso e violacao de
   * constraint. Aqui a ordem e segura: desmarca antes de marcar.
   */
  async definirPrincipal(consumidorId, enderecoId) {
    return this.emTransacao(async (cliente) => {
      const alvo = await this.executarCom(
        cliente,
        'SELECT id FROM enderecos WHERE id = $1 AND consumidor_id = $2',
        [enderecoId, consumidorId],
      );

      if (!alvo[0]) return null;

      await this.executarCom(
        cliente,
        'UPDATE enderecos SET principal = FALSE WHERE consumidor_id = $1 AND principal = TRUE',
        [consumidorId],
      );

      const linhas = await this.executarCom(
        cliente,
        `UPDATE enderecos SET principal = TRUE WHERE id = $1
         RETURNING id, nome_destinatario, cep, rua, numero, complemento,
                   bairro, cidade, estado, principal`,
        [enderecoId],
      );

      return linhas[0];
    });
  }

  /* Remove o endereco, restrito ao dono. */
  async remover(consumidorId, enderecoId) {
    const linhas = await this.executar(
      'DELETE FROM enderecos WHERE id = $1 AND consumidor_id = $2 RETURNING id',
      [enderecoId, consumidorId],
    );

    return linhas.length > 0;
  }

  /* Quantidade de enderecos do consumidor. */
  async contarDoConsumidor(consumidorId) {
    const linha = await this.buscarUm(
      'SELECT count(*)::int AS total FROM enderecos WHERE consumidor_id = $1',
      [consumidorId],
    );

    return linha?.total ?? 0;
  }
}

export default new EnderecoRepository();