import { RepositorioBase } from './RepositorioBase.js';

/*
 * Acesso a tabela `avaliacoes`.
 *
 * Nesta fase (6) entram as LEITURAS publicas usadas no perfil do
 * produtor. A escrita (avaliar um produto recebido) entra na FASE 14.
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
}

export default new AvaliacaoRepository();
