import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { prepararSchema, limparDados } from '../helpers/banco.js';

/*
 * Testes do perfil publico do produtor (FASE 6).
 *
 * Estes testes usam a API real (supertest + Express + PostgreSQL), nao
 * mocks. O objetivo e cobrir duas coisas diferentes:
 *
 *   1. o comportamento funcional (lista, busca, filtros, paginacao,
 *      perfil agregado, produtos, avaliacoes);
 *   2. a superficie de exposicao de dados - o que o marketplace NAO
 *      devolve em rota publica. Um vazamento nao aparece em teste de
 *      comportamento, entao ele precisa de teste proprio.
 */

const ROTA = '/api/v1/agricultores';

beforeAll(async () => {
  await prepararSchema();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparDados();
});

/*
 * Cria um produtor completo, ja com usuario, produtos e avaliacoes.
 * Devolve os ids para os testes referenciarem sem consultar de novo.
 */
async function criarProdutor({
  nome = 'Produtor Teste',
  email = 'produtor@teste.local',
  fazenda = 'Sitio Boa Vista',
  cidade = 'Campinas',
  estado = 'SP',
  ativo = true,
  usuarioAtivo = true,
  certificacoes = [],
} = {}) {
  const { rows: usuarios } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, tipo, telefone, ativo)
     VALUES ($1, $2, '$2b$12$hash', 'agricultor', '11999998888', $3)
     RETURNING id`,
    [nome, email, usuarioAtivo],
  );
  const usuarioId = usuarios[0].id;

  const { rows: agricultores } = await pool.query(
    `INSERT INTO agricultores
       (usuario_id, nome_fazenda, descricao, historia, cidade, estado, endereco, certificacoes, ativo)
     VALUES ($1, $2, 'Descricao da propriedade.', 'Historia da familia.', $3, $4,
             'Rua Interna 100, Bairro Rural', $5, $6)
     RETURNING id`,
    [usuarioId, fazenda, cidade, estado, certificacoes, ativo],
  );

  return { usuarioId, agricultorId: agricultores[0].id };
}

/* Cria uma categoria e devolve o id. */
async function criarCategoria(nome = 'Frutas') {
  const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
  const { rows } = await pool.query(
    'INSERT INTO categorias (nome, slug) VALUES ($1, $2) RETURNING id',
    [nome, slug],
  );
  return rows[0].id;
}

/* Cria um produto para o produtor. */
async function criarProduto(agricultorId, categoriaId, { nome = 'Tomate', preco = 8.5, estoque = 100, ativo = true } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque, ativo)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [agricultorId, categoriaId, nome, preco, estoque, ativo],
  );
  return rows[0].id;
}

/* Cria um consumidor, um pedido e uma avaliacao. */
async function criarAvaliacao(agricultorId, produtoId, { nota = 5, comentario = 'Excelente!', nomeConsumidor = 'Maria Souza' } = {}) {
  const { rows: consumidores } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, tipo)
     VALUES ($1, $2, '$2b$12$hash', 'cliente') RETURNING id`,
    [nomeConsumidor, `cliente-${Date.now()}-${Math.random()}@teste.local`],
  );
  const consumidorId = consumidores[0].id;

  const { rows: pedidos } = await pool.query(
    `INSERT INTO pedidos
       (consumidor_id, status, valor_produtos, valor_frete, valor_total, endereco_entrega)
     VALUES ($1, 'ENTREGUE', 8.50, 0, 8.50, $2) RETURNING id`,
    [consumidorId, JSON.stringify({ cidade: 'Campinas', estado: 'SP' })],
  );

  await pool.query(
    `INSERT INTO avaliacoes (pedido_id, produto_id, consumidor_id, agricultor_id, nota, comentario)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [pedidos[0].id, produtoId, consumidorId, agricultorId, nota, comentario],
  );

  return consumidorId;
}

describe('GET /agricultores - listagem publica', () => {
  test('lista produtores com paginacao', async () => {
    await criarProdutor({ fazenda: 'Sitio A', email: 'a@teste.local' });
    await criarProdutor({ fazenda: 'Sitio B', email: 'b@teste.local' });

    const resposta = await request(app).get(ROTA).expect(200);

    expect(resposta.body.sucesso).toBe(true);
    expect(resposta.body.dados).toHaveLength(2);
    expect(resposta.body.paginacao).toMatchObject({ pagina: 1, total: 2 });
  });

  test('nao exige autenticacao (rota publica)', async () => {
    await criarProdutor();

    await request(app).get(ROTA).expect(200);
  });

  test('ordena por nome da fazenda por padrao', async () => {
    await criarProdutor({ fazenda: 'Zona Rural', email: 'z@teste.local' });
    await criarProdutor({ fazenda: 'Aurora', email: 'a@teste.local' });

    const resposta = await request(app).get(ROTA).expect(200);

    expect(resposta.body.dados.map((p) => p.nome_fazenda)).toEqual(['Aurora', 'Zona Rural']);
  });

  test('filtra por cidade', async () => {
    await criarProdutor({ fazenda: 'Sitio SP', cidade: 'Campinas', estado: 'SP', email: 'sp@teste.local' });
    await criarProdutor({ fazenda: 'Sitio PE', cidade: 'Recife', estado: 'PE', email: 'pe@teste.local' });

    const resposta = await request(app).get(`${ROTA}?cidade=Recife`).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome_fazenda).toBe('Sitio PE');
  });

  test('filtra por estado', async () => {
    await criarProdutor({ cidade: 'Campinas', estado: 'SP', email: 'sp@teste.local' });
    await criarProdutor({ cidade: 'Recife', estado: 'PE', email: 'pe@teste.local' });

    const resposta = await request(app).get(`${ROTA}?estado=SP`).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].estado).toBe('SP');
  });

  test('busca por parte do nome da fazenda', async () => {
    await criarProdutor({ fazenda: 'Sitio Boa Vista', email: 'boa@teste.local' });
    await criarProdutor({ fazenda: 'Fazenda Aurora', email: 'aurora@teste.local' });

    const resposta = await request(app).get(`${ROTA}?busca=boa vis`).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome_fazenda).toBe('Sitio Boa Vista');
  });

  /*
   * Teste de seguranca de entrada, nao de comportamento.
   *
   * O `%` e curinga do LIKE. Sem escapar, a busca por "100%" viraria o
   * padrao "%100%%", que casa com qualquer nome contendo "100" - ou seja,
   * um filtro especifico devolveria resultados que nao tem nada a ver com
   * o que foi pedido, e o usuario nao teria como perceber.
   *
   * O cenario tem que DISCRIMINAR os dois comportamentos: existe uma
   * fazenda com o caractere `%` literal no nome e outra que so comeca
   * igual ("1000"). Se o escape sumir, "1000 Hectares" aparece no
   * resultado e o teste falha.
   */
  test('escapa curinga do LIKE na busca', async () => {
    await criarProdutor({ fazenda: 'Fazenda 100% Natural', email: 'cem@teste.local' });
    await criarProdutor({ fazenda: 'Fazenda 1000 Hectares', email: 'mil@teste.local' });

    const resposta = await request(app).get(`${ROTA}?busca=100%`).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome_fazenda).toBe('Fazenda 100% Natural');
  });

  test('escapa curinga de um caractere na busca', async () => {
    await criarProdutor({ fazenda: 'Sitio A_B', email: 'ab@teste.local' });
    await criarProdutor({ fazenda: 'Sitio AXB', email: 'axb@teste.local' });

    const resposta = await request(app).get(`${ROTA}?busca=A_B`).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome_fazenda).toBe('Sitio A_B');
  });

  test('nao expoe produtor suspenso na listagem', async () => {
    await criarProdutor({ fazenda: 'Ativo', email: 'ativo@teste.local' });
    await criarProdutor({ fazenda: 'Suspenso', email: 'suspenso@teste.local', ativo: false });

    const resposta = await request(app).get(ROTA).expect(200);

    expect(resposta.body.dados).toHaveLength(1);
    expect(resposta.body.dados[0].nome_fazenda).toBe('Ativo');
  });

  /*
   * Bloquear o login do produtor (usuarios.ativo = false) tambem precisa
   * esconder a vitrine. Sem esta regra, suspender um produtor nao teria
   * efeito pratico: ele pararia de entrar, mas continuaria vendendo.
   */
  test('nao expoe produtor cujo usuario esta bloqueado', async () => {
    await criarProdutor({ fazenda: 'Bloqueado', email: 'bloq@teste.local', usuarioAtivo: false });

    const resposta = await request(app).get(ROTA).expect(200);

    expect(resposta.body.dados).toHaveLength(0);
  });

  test('valida que o estado tem duas letras', async () => {
    await request(app).get(`${ROTA}?estado=SaoPaulo`).expect(400);
  });

  test('rejeita limite acima do maximo permitido', async () => {
    await request(app).get(`${ROTA}?limite=5000`).expect(400);
  });

  test('explica pagina inexistente em vez de devolver lista vazia', async () => {
    await criarProdutor();

    const resposta = await request(app).get(`${ROTA}?pagina=99`).expect(404);

    expect(resposta.body.erro.codigo).toBe('PAGINA_INEXISTENTE');
    expect(resposta.body.erro.mensagem).toContain('99');
  });

  test('ordena por avaliacao com desempate', async () => {
    const categoriaId = await criarCategoria();
    const { agricultorId: aId } = await criarProdutor({ fazenda: 'Sem Nota', email: 'sem@teste.local' });
    const { agricultorId: bId } = await criarProdutor({ fazenda: 'Cinco Estrelas', email: 'cinco@teste.local' });

    const produto = await criarProduto(bId, categoriaId);
    await criarAvaliacao(bId, produto, { nota: 5 });

    const resposta = await request(app).get(`${ROTA}?ordenar=avaliacao`).expect(200);

    // Quem tem avaliacao vem primeiro; quem nao tem fica no fim.
    expect(resposta.body.dados[0].nome_fazenda).toBe('Cinco Estrelas');
    expect(resposta.body.dados[0].media_avaliacoes).toBe(5);
    expect(resposta.body.dados[1].nome_fazenda).toBe('Sem Nota');

    // Referencia usada para evitar aviso de variavel nao utilizada.
    expect(aId).toBeTruthy();
  });
});

/*
 * Bloco dedicado a superficie de exposicao.
 *
 * Estes testes nao verificam comportamento de negocio; verificam o que
 * NAO pode sair numa rota publica. E a defesa contra vazamento por
 * descuido: alguem adicionar um campo a projecao do repository sem
 * pensar que a rota e publica.
 */
describe('GET /agricultores - superficie de dados expostos', () => {
  test('nao devolve e-mail, telefone nem endereco do produtor', async () => {
    const { agricultorId } = await criarProdutor();

    const lista = await request(app).get(ROTA).expect(200);
    const detalhe = await request(app).get(`${ROTA}/${agricultorId}`).expect(200);

    for (const corpo of [lista.body.dados[0], detalhe.body.dados]) {
      expect(corpo).not.toHaveProperty('responsavel_email');
      expect(corpo).not.toHaveProperty('responsavel_telefone');
      expect(corpo).not.toHaveProperty('endereco');
      expect(corpo).not.toHaveProperty('usuario_id');
      expect(corpo).not.toHaveProperty('imagem_public_id');
    }

    // O e-mail real do produtor nao pode aparecer em lugar nenhum do JSON.
    expect(JSON.stringify(detalhe.body)).not.toContain('produtor@teste.local');
  });

  test('nao devolve o e-mail do consumidor nas avaliacoes', async () => {
    const categoriaId = await criarCategoria();
    const { agricultorId } = await criarProdutor();
    const produto = await criarProduto(agricultorId, categoriaId);
    await criarAvaliacao(agricultorId, produto, { nomeConsumidor: 'Joana Silva' });

    const resposta = await request(app).get(`${ROTA}/${agricultorId}/avaliacoes`).expect(200);

    const avaliacao = resposta.body.dados.avaliacoes[0];
    expect(avaliacao).not.toHaveProperty('email');
    expect(avaliacao).not.toHaveProperty('consumidor_id');
    // Apenas o primeiro nome, nunca o nome completo.
    expect(avaliacao.consumidor_primeiro_nome).toBe('Joana');
    expect(JSON.stringify(resposta.body)).not.toContain('Silva');
  });
});

describe('GET /agricultores/:id - perfil publico', () => {
  test('devolve perfil com reputacao, resumo e vitrine', async () => {
    const categoriaId = await criarCategoria();
    const { agricultorId } = await criarProdutor({ certificacoes: ['Organico IBD'] });
    const produto = await criarProduto(agricultorId, categoriaId);
    await criarAvaliacao(agricultorId, produto, { nota: 4 });

    const resposta = await request(app).get(`${ROTA}/${agricultorId}`).expect(200);
    const perfil = resposta.body.dados;

    expect(perfil.nome_fazenda).toBe('Sitio Boa Vista');
    expect(perfil.responsavel_nome).toBe('Produtor Teste');
    expect(perfil.certificacoes).toEqual(['Organico IBD']);

    expect(perfil.reputacao).toMatchObject({ total: 1, media: 4 });
    expect(perfil.reputacao.distribuicao['4']).toBe(1);

    expect(perfil.resumo).toMatchObject({ produtos_total: 1, produtos_ativos: 1 });
    expect(perfil.produtos).toHaveLength(1);
    expect(perfil.produtos[0].nome).toBe('Tomate');
    expect(perfil.produtos_paginacao.total).toBe(1);
  });

  test('devolve 404 para produtor inexistente', async () => {
    const resposta = await request(app).get(`${ROTA}/999999`).expect(404);

    expect(resposta.body.erro.codigo).toBe('NAO_ENCONTRADO');
  });

  /*
   * Produtor suspenso deve devolver 404, nao 403 nem 200. Motivo: uma
   * resposta 403 confirmaria que o perfil existe, permitindo ao visitante
   * sondar ids e descobrir quais produtores foram suspensos.
   */
  test('devolve 404 para produtor suspenso', async () => {
    const { agricultorId } = await criarProdutor({ ativo: false });

    await request(app).get(`${ROTA}/${agricultorId}`).expect(404);
  });

  test('devolve 404 quando o usuario do produtor esta bloqueado', async () => {
    const { agricultorId } = await criarProdutor({ usuarioAtivo: false });

    await request(app).get(`${ROTA}/${agricultorId}`).expect(404);
  });

  test('rejeita id nao numerico com 400 antes de consultar o banco', async () => {
    const resposta = await request(app).get(`${ROTA}/abc`).expect(400);

    expect(resposta.body.erro.codigo).toBe('DADOS_INVALIDOS');
  });

  test('nao inclui produtos inativos na vitrine', async () => {
    const categoriaId = await criarCategoria();
    const { agricultorId } = await criarProdutor();
    await criarProduto(agricultorId, categoriaId, { nome: 'Ativo' });
    await criarProduto(agricultorId, categoriaId, { nome: 'Inativo', ativo: false });

    const resposta = await request(app).get(`${ROTA}/${agricultorId}`).expect(200);

    expect(resposta.body.dados.produtos).toHaveLength(1);
    expect(resposta.body.dados.produtos[0].nome).toBe('Ativo');
    // O resumo conta os dois, mas so um aparece na vitrine.
    expect(resposta.body.dados.resumo.produtos_total).toBe(2);
    expect(resposta.body.dados.resumo.produtos_ativos).toBe(1);
  });

  test('filtra a vitrine por categoria', async () => {
    const frutas = await criarCategoria('Frutas');
    const legumes = await criarCategoria('Legumes');
    const { agricultorId } = await criarProdutor();
    await criarProduto(agricultorId, frutas, { nome: 'Morango' });
    await criarProduto(agricultorId, legumes, { nome: 'Cenoura' });

    const resposta = await request(app).get(`${ROTA}/${agricultorId}?categoria_id=${legumes}`).expect(200);

    expect(resposta.body.dados.produtos).toHaveLength(1);
    expect(resposta.body.dados.produtos[0].nome).toBe('Cenoura');
  });

  test('inclui media de avaliacoes em cada produto da vitrine', async () => {
    const categoriaId = await criarCategoria();
    const { agricultorId } = await criarProdutor();
    const produto = await criarProduto(agricultorId, categoriaId);
    await criarAvaliacao(agricultorId, produto, { nota: 3 });

    const resposta = await request(app).get(`${ROTA}/${agricultorId}`).expect(200);

    expect(Number(resposta.body.dados.produtos[0].media_avaliacoes)).toBe(3);
    expect(resposta.body.dados.produtos[0].total_avaliacoes).toBe(1);
  });

  test('produto sem avaliacao tem media zero, nao nulo', async () => {
    const categoriaId = await criarCategoria();
    const { agricultorId } = await criarProdutor();
    await criarProduto(agricultorId, categoriaId);

    const resposta = await request(app).get(`${ROTA}/${agricultorId}`).expect(200);

    expect(Number(resposta.body.dados.produtos[0].media_avaliacoes)).toBe(0);
    expect(resposta.body.dados.produtos[0].total_avaliacoes).toBe(0);
  });
});

describe('GET /agricultores/:id/produtos', () => {
  test('lista a vitrine com paginacao', async () => {
    const categoriaId = await criarCategoria();
    const { agricultorId } = await criarProdutor();
    await criarProduto(agricultorId, categoriaId, { nome: 'Tomate' });
    await criarProduto(agricultorId, categoriaId, { nome: 'Alface' });

    const resposta = await request(app).get(`${ROTA}/${agricultorId}/produtos`).expect(200);

    expect(resposta.body.dados).toHaveLength(2);
    expect(resposta.body.paginacao.total).toBe(2);
  });

  test('ordena por preco quando pedido', async () => {
    const categoriaId = await criarCategoria();
    const { agricultorId } = await criarProdutor();
    await criarProduto(agricultorId, categoriaId, { nome: 'Caro', preco: 50 });
    await criarProduto(agricultorId, categoriaId, { nome: 'Barato', preco: 5 });

    const resposta = await request(app).get(`${ROTA}/${agricultorId}/produtos?ordenar=baratos`).expect(200);

    expect(resposta.body.dados.map((p) => p.nome)).toEqual(['Barato', 'Caro']);
  });

  test('ignora tentativa de injecao na ordenacao e usa o padrao', async () => {
    const categoriaId = await criarCategoria();
    const { agricultorId } = await criarProdutor();
    await criarProduto(agricultorId, categoriaId);

    // A ordenacao e validada na borda como enum; um valor fora da lista
    // deve ser recusado com 400, e nunca chegar ao SQL.
    await request(app)
      .get(`${ROTA}/${agricultorId}/produtos?ordenar=preco;DROP TABLE produtos`)
      .expect(400);

    // Confirma que a tabela continua la.
    const { rows } = await pool.query('SELECT count(*)::int AS total FROM produtos');
    expect(rows[0].total).toBe(1);
  });

  test('devolve 404 para produtor inexistente', async () => {
    await request(app).get(`${ROTA}/999999/produtos`).expect(404);
  });
});

describe('GET /agricultores/:id/avaliacoes', () => {
  test('lista avaliacoes com reputacao', async () => {
    const categoriaId = await criarCategoria();
    const { agricultorId } = await criarProdutor();
    const produto = await criarProduto(agricultorId, categoriaId);
    await criarAvaliacao(agricultorId, produto, { nota: 5, comentario: 'Otimo' });
    await criarAvaliacao(agricultorId, produto, { nota: 3, comentario: 'Razoavel' });

    const resposta = await request(app).get(`${ROTA}/${agricultorId}/avaliacoes`).expect(200);

    expect(resposta.body.dados.avaliacoes).toHaveLength(2);
    expect(resposta.body.dados.reputacao.total).toBe(2);
    expect(resposta.body.dados.reputacao.media).toBe(4);
    expect(resposta.body.paginacao.total).toBe(2);
  });

  test('reputacao de produtor sem avaliacoes tem distribuicao zerada', async () => {
    const { agricultorId } = await criarProdutor();

    const resposta = await request(app).get(`${ROTA}/${agricultorId}/avaliacoes`).expect(200);

    expect(resposta.body.dados.avaliacoes).toHaveLength(0);
    expect(resposta.body.dados.reputacao).toEqual({
      total: 0,
      media: 0,
      distribuicao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  test('devolve 404 para produtor inexistente', async () => {
    await request(app).get(`${ROTA}/999999/avaliacoes`).expect(404);
  });
});
