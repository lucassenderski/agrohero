import { pool, encerrarPool } from '../../src/database/pool.js';
import {
  prepararSchema,
  limparDados,
  criarCenarioMultiAgricultor,
} from '../helpers/banco.js';

/*
 * Testes da regra multi-agricultor (requisito 18).
 *
 * O cenario e sempre o mesmo: um pedido com um produto do produtor A e
 * um produto do produtor B. O que se verifica aqui e que o status do
 * pedido e derivado corretamente dos itens e que um agricultor consegue
 * avancar APENAS os proprios itens.
 *
 * O WHERE agricultor_id = ... nao esta sendo testado como texto: os
 * testes confirmam que, mesmo avancando so um lado, o pedido reflete o
 * estado real do conjunto.
 */

beforeAll(async () => {
  await prepararSchema();
});

afterAll(async () => {
  await encerrarPool();
});

beforeEach(async () => {
  await limparDados();
});

async function statusDoPedido(idPedido) {
  const { rows } = await pool.query('SELECT status FROM pedidos WHERE id = $1', [idPedido]);
  return rows[0].status;
}

/* Avanca apenas os itens que pertencem a um agricultor. E exatamente a
 * query que a FASE 12 vai usar na rota do painel do produtor. */
async function avancarStatusDoAgricultor(idPedido, idAgricultor, novoStatus) {
  const { rowCount } = await pool.query(
    `UPDATE pedido_itens
        SET status = $1
      WHERE pedido_id = $2 AND agricultor_id = $3`,
    [novoStatus, idPedido, idAgricultor],
  );
  return rowCount;
}

describe('Status do pedido derivado dos itens', () => {
  let cenario;

  beforeEach(async () => {
    cenario = await criarCenarioMultiAgricultor();
  });

  it('comeca em PENDENTE com todos os itens pendentes', async () => {
    expect(await statusDoPedido(cenario.idPedido)).toBe('PENDENTE');
  });

  it('produtor A avanca so os itens dele e o pedido fica PROCESSANDO', async () => {
    const afetados = await avancarStatusDoAgricultor(
      cenario.idPedido,
      cenario.idAgricultorA,
      'PROCESSANDO',
    );

    // Apenas 1 item foi tocado: o do produtor A. O item do B ficou intacto.
    expect(afetados).toBe(1);
    expect(await statusDoPedido(cenario.idPedido)).toBe('PROCESSANDO');

    const { rows } = await pool.query(
      'SELECT status FROM pedido_itens WHERE id = $1',
      [cenario.itemB.id],
    );
    expect(rows[0].status).toBe('PENDENTE');
  });

  it('nao marca ENTREGUE enquanto o outro produtor nao entregar', async () => {
    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorA, 'ENVIADO');
    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorA, 'ENTREGUE');

    // A entregou, mas B ainda esta PENDENTE: o pedido NAO pode ser
    // considerado entregue.
    expect(await statusDoPedido(cenario.idPedido)).toBe('PROCESSANDO');
  });

  it('marca ENTREGUE quando os dois produtores entregam', async () => {
    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorA, 'ENTREGUE');
    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorB, 'ENTREGUE');

    expect(await statusDoPedido(cenario.idPedido)).toBe('ENTREGUE');
  });

  it('marca ENVIADO quando todos os itens foram enviados', async () => {
    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorA, 'ENVIADO');
    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorB, 'ENVIADO');

    expect(await statusDoPedido(cenario.idPedido)).toBe('ENVIADO');
  });

  it('marca CANCELADO quando todos os itens foram cancelados', async () => {
    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorA, 'CANCELADO');
    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorB, 'CANCELADO');

    expect(await statusDoPedido(cenario.idPedido)).toBe('CANCELADO');
  });

  it('cancelamento parcial NAO cancela o pedido inteiro', async () => {
    // Um produtor desiste, o outro segue. O pedido continua ativo.
    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorA, 'CANCELADO');

    expect(await statusDoPedido(cenario.idPedido)).toBe('PROCESSANDO');
  });

  it('volta para PENDENTE se o item for revertido', async () => {
    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorA, 'PROCESSANDO');
    expect(await statusDoPedido(cenario.idPedido)).toBe('PROCESSANDO');

    await avancarStatusDoAgricultor(cenario.idPedido, cenario.idAgricultorA, 'PENDENTE');
    expect(await statusDoPedido(cenario.idPedido)).toBe('PENDENTE');
  });
});

describe('Posse dos itens do pedido', () => {
  let cenario;

  beforeEach(async () => {
    cenario = await criarCenarioMultiAgricultor();
  });

  it('cada item guarda o agricultor dono do produto', async () => {
    const { rows } = await pool.query(
      `SELECT pi.agricultor_id, p.agricultor_id AS dono_do_produto
         FROM pedido_itens pi
         JOIN produtos p ON p.id = pi.produto_id
        WHERE pi.pedido_id = $1`,
      [cenario.idPedido],
    );

    // A denormalizacao so e confiavel se os dois valores baterem sempre.
    rows.forEach((linha) => {
      expect(linha.agricultor_id).toBe(linha.dono_do_produto);
    });
  });

  it('a consulta de um agricultor nao ve itens do outro', async () => {
    const { rows: itensDoA } = await pool.query(
      'SELECT produto_id FROM pedido_itens WHERE pedido_id = $1 AND agricultor_id = $2',
      [cenario.idPedido, cenario.idAgricultorA],
    );

    expect(itensDoA).toHaveLength(1);
    expect(itensDoA[0].produto_id).toBe(cenario.produtoTomate.id);
    expect(itensDoA[0].produto_id).not.toBe(cenario.produtoMorango.id);
  });

  it('tentativa de alterar item de outro produtor nao afeta nenhuma linha', async () => {
    // Simula o IDOR: o produtor A tenta avancar o item do produtor B
    // passando o id do pedido, mas informando a si mesmo na query. O
    // WHERE por agricultor_id e o que barra - zero linhas afetadas.
    const { rowCount } = await pool.query(
      `UPDATE pedido_itens SET status = 'ENTREGUE'
        WHERE pedido_id = $1 AND agricultor_id = $2 AND id = $3`,
      [cenario.idPedido, cenario.idAgricultorA, cenario.itemB.id],
    );

    expect(rowCount).toBe(0);

    const { rows } = await pool.query(
      'SELECT status FROM pedido_itens WHERE id = $1',
      [cenario.itemB.id],
    );
    expect(rows[0].status).toBe('PENDENTE');
  });
});