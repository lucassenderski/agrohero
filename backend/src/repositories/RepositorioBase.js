import { pool } from '../database/pool.js';

/*
 * Repositorio base.
 *
 * Todo repository concreto estende esta classe. O objetivo nao e
 * "abstrair o banco", e sim concentrar tres protecoes em um lugar so,
 * para que nenhum repository precise lembrar delas:
 *
 *   1. SQL sempre parametrizado ($1, $2...). Nenhum valor de usuario e
 *      concatenado no texto da query. E esta regra que impede SQL
 *      Injection; se ela ficasse espalhada por 10 arquivos, um unico
 *      template literal distraido abriria a brecha.
 *
 *   2. Ordenacao por lista branca. ORDER BY nao aceita parametro ($1):
 *      o nome da coluna e estrutura da query, nao valor. Concatenar
 *      direto seria SQL Injection. A solucao e um mapa de opcoes
 *      permitidas -> expressao SQL, escolhido no servidor.
 *
 *   3. Paginacao consistente, com LIMIT/OFFSET numericos validados.
 */

export class RepositorioBase {
  /*
   * `tabela` e usado apenas para mensagens de log, nunca para montar SQL.
   * Isso e proposital: se a tabela viesse de entrada do usuario, seria
   * uma brecha. Cada repository escreve o nome da sua tabela no SQL.
   */
  constructor(tabela) {
    this.tabela = tabela;
  }

  /* Executa uma query parametrizada usando o pool. */
  async executar(texto, parametros = []) {
    const { rows } = await pool.query(texto, parametros);
    return rows;
  }

  /* Busca uma linha. Devolve `null` quando nao existe, e nunca `undefined`. */
  async buscarUm(texto, parametros = []) {
    const { rows } = await pool.query(texto, parametros);
    return rows[0] ?? null;
  }

  /* Conta linhas (usado pela paginacao). */
  async contar(texto, parametros = []) {
    const linha = await this.buscarUm(texto, parametros);
    return linha ? Number(linha.total) : 0;
  }

  /*
   * Executa uma operacao dentro de uma transacao.
   *
   * Delegamos ao pool, que faz BEGIN/COMMIT/ROLLBACK na mesma conexao.
   * O repository concreto passa uma funcao que recebe o `cliente` e usa
   * cliente.query. O checkout (FASE 11) depende disso: baixa de estoque,
   * criacao de pedido e de pagamento precisam ser atomicos.
   */
  async emTransacao(fn) {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      const resultado = await fn(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (erro) {
      try {
        await cliente.query('ROLLBACK');
      } catch {
        // Se o rollback falhar, o erro original e mais relevante.
      }
      throw erro;
    } finally {
      cliente.release();
    }
  }

  /*
   * Traduz a opcao de ordenacao pedida pelo cliente em SQL seguro.
   *
   * COMO USAR:
   *   const ordenacao = this.resolverOrdenacao(query.ordenar, {
   *     recentes: 'criado_em DESC',
   *     baratos:  'preco ASC',
   *   }, 'recentes');
   *
   * Se o cliente mandar `ordenar=; DROP TABLE usuarios`, o mapa nao tem
   * essa chave, cai no padrao e o SQL malicioso nunca chega ao banco.
   * Sempre fornecemos uma ordenacao padrao para nao depender de ordem
   * arbitraria do PostgreSQL (que seria imprevisivel na paginacao).
   */
  resolverOrdenacao(opcaoPedida, mapaOrdenacoes, padrao) {
    if (opcaoPedida && Object.hasOwn(mapaOrdenacoes, opcaoPedida)) {
      return mapaOrdenacoes[opcaoPedida];
    }

    if (!Object.hasOwn(mapaOrdenacoes, padrao)) {
      throw new Error(
        `Ordenacao padrao "${padrao}" nao existe no mapa do repositorio ${this.tabela}.`,
      );
    }

    return mapaOrdenacoes[padrao];
  }

  /*
   * Monta o trecho LIMIT/OFFSET.
   *
   * Restricao real do PostgreSQL: parametros ($n) nao podem ser usados em
   * LIMIT/OFFSET de qualquer forma? Podem, e usamos. O que NAO pode e
   * concatenar string. Como `limite` e `offset` ja sao numeros validados
   * por lerPaginacao(), interpolar aqui e seguro - e mantemos a
   * verificacao abaixo como rede de seguranca.
   */
  montarLimiteOffset(limite, offset) {
    const limiteSeguro = Number.parseInt(limite, 10);
    const offsetSeguro = Number.parseInt(offset, 10);

    if (!Number.isInteger(limiteSeguro) || limiteSeguro <= 0) {
      throw new Error('Limite invalido ao montar a paginacao.');
    }
    if (!Number.isInteger(offsetSeguro) || offsetSeguro < 0) {
      throw new Error('Offset invalido ao montar a paginacao.');
    }

    return ` LIMIT ${limiteSeguro} OFFSET ${offsetSeguro}`;
  }
}

export default RepositorioBase;