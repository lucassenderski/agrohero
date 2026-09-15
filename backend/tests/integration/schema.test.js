import { pool, encerrarPool } from '../../src/database/pool.js';
import {
  prepararSchema,
  limparDados,
  criarCenarioMultiAgricultor,
} from '../helpers/banco.js';

/*
 * Testes das restricoes do schema.
 *
 * A ideia central: o banco e a ULTIMA linha de defesa. Mesmo que um bug
 * no service deixe passar um preco negativo ou um subtotal manipulado,
 * a constraint precisa recusar. Testar isso aqui e testar a rede de
 * seguranca do sistema.
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

/* Roda um INSERT e espera que ele falhe, devolvendo o erro do PostgreSQL.
 * Se NAO falhar, o teste deve quebrar - e o que detecta constraint ausente. */
async function esperaViolacao(sql, parametros = []) {
  try {
    await pool.query(sql, parametros);
  } catch (erro) {
    return erro;
  }
  throw new Error(`Esperava violacao de constraint, mas o INSERT passou: ${sql}`);
}

describe('Estrutura criada pelas migrations', () => {
  it('cria as 11 tabelas de negocio', async () => {
    const { rows } = await pool.query(`
      SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> 'migrations'
       ORDER BY tablename
    `);
    expect(rows.map((r) => r.tablename)).toEqual([
      'agricultores',
      'avaliacoes',
      'carrinho_itens',
      'carrinhos',
      'categorias',
      'enderecos',
      'pagamentos',
      'pedido_itens',
      'pedidos',
      'produtos',
      'usuarios',
    ]);
  });

  it('cria a view de produtos com avaliacao', async () => {
    const { rows } = await pool.query(
      `SELECT 1 FROM pg_views WHERE viewname = 'produtos_com_avaliacao'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('cria os triggers de atualizado_em e de sincronizacao de status', async () => {
    const { rows } = await pool.query(`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname
    `);
    const nomes = rows.map((r) => r.tgname);
    expect(nomes).toContain('usuarios_atualizado_em');
    expect(nomes).toContain('produtos_atualizado_em');
    expect(nomes).toContain('pedido_itens_sincroniza_status');
  });
});

describe('Constraint: usuarios', () => {
  it('recusa email com letra maiuscula', async () => {
    const erro = await esperaViolacao(
      `INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Ana', 'Ana@teste.com', 'h')`,
    );
    expect(erro.constraint).toBe('usuarios_email_minusculo');
  });

  it('recusa email duplicado', async () => {
    await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Ana', 'a@teste.com', 'h')`,
    );
    const erro = await esperaViolacao(
      `INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Bia', 'a@teste.com', 'h')`,
    );
    expect(erro.code).toBe('23505'); // unique_violation
  });

  it('a unicidade do email e garantida mesmo com variacao de caixa', async () => {
    // Este teste documenta uma defesa em profundidade. A variacao de
    // caixa nunca chega ao indice unico, porque o CHECK
    // usuarios_email_minusculo a barra antes. As duas constraints
    // trabalham juntas: uma normaliza, a outra garante a unicidade.
    await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Ana', 'a@teste.com', 'h')`,
    );

    const erro = await esperaViolacao(
      `INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Bia', 'A@teste.com', 'h')`,
    );

    // 23514 = check_violation (barrado pelo formato de minusculas).
    expect(erro.code).toBe('23514');
    expect(erro.constraint).toBe('usuarios_email_minusculo');
  });

  it('recusa tipo de usuario fora da lista permitida', async () => {
    const erro = await esperaViolacao(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo)
       VALUES ('Ana', 'x@t.com', 'h', 'hacker')`,
    );
    expect(erro.constraint).toBe('usuarios_tipo_valido');
  });

  it('recusa nome com menos de 2 caracteres', async () => {
    const erro = await esperaViolacao(
      `INSERT INTO usuarios (nome, email, senha_hash) VALUES ('A', 'x@t.com', 'h')`,
    );
    expect(erro.constraint).toBe('usuarios_nome_nao_vazio');
  });
});

describe('Constraint: produtos', () => {
  let cenario;

  beforeEach(async () => {
    cenario = await criarCenarioMultiAgricultor();
  });

  it('recusa preco zero ou negativo', async () => {
    for (const preco of [0, -1, -99.99]) {
      const erro = await esperaViolacao(
        `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque)
         VALUES ($1, $2, 'Abacaxi', $3, 10)`,
        [cenario.idAgricultorA, cenario.idCategoria, preco],
      );
      expect(erro.constraint).toBe('produtos_preco_positivo');
    }
  });

  it('recusa estoque negativo', async () => {
    const erro = await esperaViolacao(
      `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque)
       VALUES ($1, $2, 'Abacaxi', 10, -5)`,
      [cenario.idAgricultorA, cenario.idCategoria],
    );
    expect(erro.constraint).toBe('produtos_estoque_nao_neg');
  });

  it('recusa preco acima do teto de seguranca', async () => {
    const erro = await esperaViolacao(
      `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque)
       VALUES ($1, $2, 'Abacaxi', 1000000, 1)`,
      [cenario.idAgricultorA, cenario.idCategoria],
    );
    expect(erro.constraint).toBe('produtos_preco_maximo');
  });

  it('recusa excluir agricultor que ainda tem produto', async () => {
    const erro = await esperaViolacao(`DELETE FROM agricultores WHERE id = $1`, [
      cenario.idAgricultorA,
    ]);
    expect(erro.code).toBe('23503'); // foreign_key_violation
  });

  it('recusa excluir produto que ja esta em um pedido', async () => {
    const erro = await esperaViolacao(`DELETE FROM produtos WHERE id = $1`, [
      cenario.produtoTomate.id,
    ]);
    expect(erro.code).toBe('23503');
  });
});

describe('Constraint: pedidos', () => {
  let cenario;

  beforeEach(async () => {
    cenario = await criarCenarioMultiAgricultor();
  });

  it('recusa status de pedido inventado', async () => {
    const erro = await esperaViolacao(
      `INSERT INTO pedidos
         (consumidor_id, status, valor_produtos, valor_frete, valor_total, endereco_entrega)
       VALUES ($1, 'INVENTADO', 10, 0, 10, '{}')`,
      [cenario.idCliente],
    );
    expect(erro.constraint).toBe('pedidos_status_valido');
  });

  it('recusa total que nao e a soma de produtos mais frete', async () => {
    const erro = await esperaViolacao(
      `INSERT INTO pedidos
         (consumidor_id, status, valor_produtos, valor_frete, valor_total, endereco_entrega)
       VALUES ($1, 'PENDENTE', 10, 5, 999, '{}')`,
      [cenario.idCliente],
    );
    expect(erro.constraint).toBe('pedidos_total_coerente');
  });
});

describe('Constraint: pedido_itens (manipulacao de valores)', () => {
  let cenario;

  beforeEach(async () => {
    cenario = await criarCenarioMultiAgricultor();
  });

  it('recusa subtotal que nao e quantidade x preco', async () => {
    // Este e o cenario de "preco manipulado no frontend": o atacante
    // manda 2 unidades de R$ 8,50 esperando pagar R$ 1,00.
    const erro = await esperaViolacao(
      `INSERT INTO pedido_itens
         (pedido_id, produto_id, agricultor_id, preco_unitario, quantidade, subtotal)
       VALUES ($1, $2, $3, 8.50, 2, 1.00)`,
      [cenario.idPedido, cenario.produtoTomate.id, cenario.idAgricultorA],
    );
    expect(erro.constraint).toBe('pedido_itens_subtotal_coerente');
  });

  it('recusa quantidade zero ou negativa', async () => {
    // Precisamos de um produto que ainda NAO esteja no pedido. Se
    // usassemos um dos produtos do cenario, o UNIQUE (pedido_id,
    // produto_id) dispararia antes e testariamos a constraint errada.
    const { rows } = await pool.query(
      `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque)
       VALUES ($1, $2, 'Cenoura', 4.00, 30) RETURNING id`,
      [cenario.idAgricultorA, cenario.idCategoria],
    );

    for (const quantidade of [0, -1]) {
      const erro = await esperaViolacao(
        `INSERT INTO pedido_itens
           (pedido_id, produto_id, agricultor_id, preco_unitario, quantidade, subtotal)
         VALUES ($1, $2, $3, 4.00, $4, 0)`,
        [cenario.idPedido, rows[0].id, cenario.idAgricultorA, quantidade],
      );
      expect(erro.constraint).toBe('pedido_itens_quantidade_positiva');
    }
  });

  it('recusa preco unitario zero ou negativo', async () => {
    const { rows } = await pool.query(
      `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque)
       VALUES ($1, $2, 'Cenoura', 4.00, 30) RETURNING id`,
      [cenario.idAgricultorA, cenario.idCategoria],
    );

    const erro = await esperaViolacao(
      `INSERT INTO pedido_itens
         (pedido_id, produto_id, agricultor_id, preco_unitario, quantidade, subtotal)
       VALUES ($1, $2, $3, 0, 3, 0)`,
      [cenario.idPedido, rows[0].id, cenario.idAgricultorA],
    );
    expect(erro.constraint).toBe('pedido_itens_preco_positivo');
  });

  it('recusa o mesmo produto duas vezes no mesmo pedido', async () => {
    const erro = await esperaViolacao(
      `INSERT INTO pedido_itens
         (pedido_id, produto_id, agricultor_id, preco_unitario, quantidade, subtotal)
       VALUES ($1, $2, $3, 8.50, 1, 8.50)`,
      [cenario.idPedido, cenario.produtoTomate.id, cenario.idAgricultorA],
    );
    expect(erro.code).toBe('23505');
  });
});

describe('Constraint: carrinho, enderecos e avaliacoes', () => {
  let cenario;

  beforeEach(async () => {
    cenario = await criarCenarioMultiAgricultor();
  });

  it('recusa quantidade zero no carrinho', async () => {
    const { rows } = await pool.query(
      `INSERT INTO carrinhos (consumidor_id) VALUES ($1) RETURNING id`,
      [cenario.idCliente],
    );
    const erro = await esperaViolacao(
      `INSERT INTO carrinho_itens (carrinho_id, produto_id, quantidade)
       VALUES ($1, $2, 0)`,
      [rows[0].id, cenario.produtoTomate.id],
    );
    expect(erro.constraint).toBe('carrinho_itens_quantidade_positiva');
  });

  it('recusa dois enderecos principais para o mesmo consumidor', async () => {
    await pool.query(
      `INSERT INTO enderecos
         (consumidor_id, nome_destinatario, cep, rua, numero, bairro, cidade, estado, principal)
       VALUES ($1, 'A', '13010000', 'Rua 1', '10', 'Centro', 'Campinas', 'SP', TRUE)`,
      [cenario.idCliente],
    );
    const erro = await esperaViolacao(
      `INSERT INTO enderecos
         (consumidor_id, nome_destinatario, cep, rua, numero, bairro, cidade, estado, principal)
       VALUES ($1, 'B', '50010000', 'Rua 2', '20', 'Boa Vista', 'Recife', 'PE', TRUE)`,
      [cenario.idCliente],
    );
    expect(erro.constraint).toBe('enderecos_um_principal_por_consumidor');
  });

  it('recusa CEP com 8 caracteres que nao sao digitos', async () => {
    // O CHECK so avalia o formato quando o valor cabe na coluna. Com
    // char(8), um valor maior nem chega a ser validado: o proprio
    // PostgreSQL recusa por tamanho.
    const erro = await esperaViolacao(
      `INSERT INTO enderecos
         (consumidor_id, nome_destinatario, cep, rua, numero, bairro, cidade, estado)
       VALUES ($1, 'Ana', '1301000A', 'Rua 1', '10', 'Centro', 'Campinas', 'SP')`,
      [cenario.idCliente],
    );
    expect(erro.constraint).toBe('enderecos_cep_valido');
  });

  it('recusa CEP maior que 8 caracteres por limite da coluna', async () => {
    const erro = await esperaViolacao(
      `INSERT INTO enderecos
         (consumidor_id, nome_destinatario, cep, rua, numero, bairro, cidade, estado)
       VALUES ($1, 'Ana', '13010-000', 'Rua 1', '10', 'Centro', 'Campinas', 'SP')`,
      [cenario.idCliente],
    );
    // 22001 = string_data_right_truncation. O hifen nao passa: o CEP
    // e guardado apenas com digitos.
    expect(erro.code).toBe('22001');
  });

  it('aceita CEP valido com 8 digitos', async () => {
    await pool.query(
      `INSERT INTO enderecos
         (consumidor_id, nome_destinatario, cep, rua, numero, bairro, cidade, estado)
       VALUES ($1, 'Ana', '13010000', 'Rua 1', '10', 'Centro', 'Campinas', 'SP')`,
      [cenario.idCliente],
    );

    const { rows } = await pool.query(
      'SELECT cep FROM enderecos WHERE consumidor_id = $1',
      [cenario.idCliente],
    );
    expect(rows[0].cep).toBe('13010000');
  });

  it('recusa nota de avaliacao fora de 1 a 5', async () => {
    for (const nota of [0, 6, -1]) {
      const erro = await esperaViolacao(
        `INSERT INTO avaliacoes
           (pedido_id, produto_id, consumidor_id, agricultor_id, nota)
         VALUES ($1, $2, $3, $4, $5)`,
        [cenario.idPedido, cenario.produtoTomate.id, cenario.idCliente, cenario.idAgricultorA, nota],
      );
      expect(erro.constraint).toBe('avaliacoes_nota_valida');
    }
  });

  it('recusa avaliar o mesmo produto duas vezes no mesmo pedido', async () => {
    await pool.query(
      `INSERT INTO avaliacoes
         (pedido_id, produto_id, consumidor_id, agricultor_id, nota)
       VALUES ($1, $2, $3, $4, 5)`,
      [cenario.idPedido, cenario.produtoTomate.id, cenario.idCliente, cenario.idAgricultorA],
    );
    const erro = await esperaViolacao(
      `INSERT INTO avaliacoes
         (pedido_id, produto_id, consumidor_id, agricultor_id, nota)
       VALUES ($1, $2, $3, $4, 4)`,
      [cenario.idPedido, cenario.produtoTomate.id, cenario.idCliente, cenario.idAgricultorA],
    );
    expect(erro.code).toBe('23505');
  });
});

describe('Seguranca: pagamentos nunca guardam dados de cartao', () => {
  it('a tabela pagamentos nao tem coluna de cartao ou cvv', async () => {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'pagamentos'
    `);
    const colunas = rows.map((r) => r.column_name);

    // Se algum dia alguem adicionar essas colunas, este teste falha de
    // proposito: guardar dado de cartao e responsabilidade do gateway.
    expect(colunas).not.toContain('numero_cartao');
    expect(colunas).not.toContain('cvv');
    expect(colunas).not.toContain('cartao');
    expect(colunas).toContain('identificador_externo');
  });
});