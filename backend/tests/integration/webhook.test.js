import crypto from 'node:crypto';
import request from 'supertest';
import app from '../../src/app.js';
import { pool } from '../../src/database/pool.js';
import { env } from '../../src/config/env.js';
import { prepararSchema, limparDados } from '../helpers/banco.js';
import { gerarToken } from '../../src/utils/token.js';
import * as gatewayFake from '../../src/services/gateways/gatewayFake.js';

/*
 * Webhooks de pagamento e estorno (FASE 13).
 *
 * A PERGUNTA CENTRAL DESTA FASE
 *
 * A rota de webhook e publica - ela PRECISA ser, quem chama e o gateway.
 * Entao qualquer pessoa que descubra a URL pode tentar marcar um pedido
 * como pago. Estes testes existem para provar que isso nao funciona.
 *
 * Quatro frentes:
 *
 * 1) ASSINATURA. Sem assinatura valida, nada acontece. Testamos ausente,
 *    errada, truncada, com prefixo certo e hex errado, e o caso perigoso:
 *    assinatura valida de um corpo DIFERENTE.
 *
 * 2) RECONCILIACAO. Mesmo com assinatura valida, o status do corpo e
 *    ignorado. Testamos pedindo "APROVADO" num pagamento ja estornado.
 *
 * 3) IDEMPOTENCIA. O mesmo evento chegando varias vezes nao pode
 *    reaplicar efeito - gateways reenviam webhooks por design.
 *
 * 4) ESTORNO NO CANCELAMENTO. Cancelar um pedido pago tem que devolver o
 *    dinheiro, e uma falha no estorno NAO pode desfazer o cancelamento.
 */

const WEBHOOK = '/api/v1/webhooks/pagamento';
const CHECKOUT = '/api/v1/checkout';
const CARRINHO = '/api/v1/carrinho';
const ENDERECOS = '/api/v1/enderecos';
const PEDIDOS = '/api/v1/pedidos';

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const ENDERECO = {
  nome_destinatario: 'Maria Souza',
  cep: '13010100',
  rua: 'Rua das Flores',
  numero: '123',
  bairro: 'Centro',
  cidade: 'Campinas',
  estado: 'SP',
};

/*
 * Assina um corpo como o gateway assinaria.
 *
 * O `raw` e uma STRING, e nao um objeto: a assinatura e feita sobre os
 * bytes que trafegam. Assinar `JSON.stringify(objeto)` e mandar
 * `JSON.stringify(objeto)` de novo funciona nos testes, mas assinar o
 * objeto e mandar a string seria testar a coisa errada - e foi assim que
 * a dependencia de `rawBody` apareceu.
 */
function assinar(raw, segredo = env.PAYMENT_WEBHOOK_SECRET) {
  return `sha256=${crypto.createHmac('sha256', segredo).update(raw).digest('hex')}`;
}

/*
 * Envia um webhook assinado corretamente.
 *
 * NAO e `async`: devolve o proprio objeto do supertest, que e "thenable"
 * e aceita `.expect()`. Marcar como `async` faria a funcao resolver a
 * resposta antes de o teste encadear `.expect(403)`, e a chamada
 * falharia com "expect is not a function".
 */
function enviarWebhook(corpo, { assinatura, url = WEBHOOK } = {}) {
  const raw = JSON.stringify(corpo);

  return request(app)
    .post(url)
    .set('Content-Type', 'application/json')
    .set('x-agrohero-signature', assinatura ?? assinar(raw))
    .send(raw);
}

let tokenCliente;
let tokenOutroCliente;
let tokenAgricultor;
let idProduto;
let idEndereco;

beforeAll(async () => {
  await prepararSchema();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparDados();

  /*
   * O ledger do gateway fake vive em memoria e sobrevive entre testes.
   * Limpar evita que uma transacao de um teste anterior (mesmo id, se o
   * relogio coincidir) interfira no cenario seguinte.
   */
  gatewayFake._limparTudo();

  const { rows: usuarios } = await pool.query(`
    INSERT INTO usuarios (nome, email, senha_hash, tipo) VALUES
      ('Cliente', 'cli@teste.local', '$2b$12$hash', 'cliente'),
      ('Outro',   'out@teste.local', '$2b$12$hash', 'cliente'),
      ('Produtor','pa@teste.local',  '$2b$12$hash', 'agricultor')
    RETURNING id, email, tipo
  `);

  const porEmail = (email) => usuarios.find((u) => u.email === email);
  tokenCliente = gerarToken(porEmail('cli@teste.local'));
  tokenOutroCliente = gerarToken(porEmail('out@teste.local'));
  tokenAgricultor = gerarToken(porEmail('pa@teste.local'));

  const { rows: agri } = await pool.query(
    `INSERT INTO agricultores (usuario_id, nome_fazenda, cidade, estado)
     VALUES ($1, 'Fazenda A', 'Campinas', 'SP') RETURNING id`,
    [porEmail('pa@teste.local').id],
  );

  const { rows: cat } = await pool.query(
    `INSERT INTO categorias (nome, slug) VALUES ('Legumes', 'legumes') RETURNING id`,
  );

  const { rows: produtos } = await pool.query(
    `INSERT INTO produtos (agricultor_id, categoria_id, nome, preco, estoque)
     VALUES ($1, $2, 'Tomate', 8.50, 100) RETURNING id`,
    [agri[0].id, cat[0].id],
  );

  idProduto = produtos[0].id;

  const endereco = await request(app)
    .post(ENDERECOS)
    .set(auth(tokenCliente))
    .send(ENDERECO)
    .expect(201);

  idEndereco = endereco.body.dados.id;
});

/*
 * Cria um pedido pelo checkout real.
 *
 * `valor` importa: o gateway fake decide o resultado pelo centavos do
 * valor (13 = recusado, 99 = pendente, resto = aprovado). Passando a
 * quantidade, controlamos o preco unitario para cair no caso desejado.
 */
async function criarPedido({ quantidade = 1, valorUnitario = null } = {}) {
  if (valorUnitario !== null) {
    await pool.query('UPDATE produtos SET preco = $1 WHERE id = $2', [valorUnitario, idProduto]);
  }

  await request(app)
    .post(`${CARRINHO}/itens`)
    .set(auth(tokenCliente))
    .send({ produto_id: idProduto, quantidade })
    .expect(201);

  const resposta = await request(app)
    .post(CHECKOUT)
    .set(auth(tokenCliente))
    .send({ endereco_id: idEndereco, metodo_pagamento: 'PIX' })
    .expect(201);

  return resposta.body.dados.pedido;
}

/* Pagamento mais recente de um pedido, direto do banco. */
async function pagamentoDoPedido(pedidoId) {
  const { rows } = await pool.query(
    `SELECT id, pedido_id, status, valor, identificador_externo
       FROM pagamentos WHERE pedido_id = $1 ORDER BY id DESC LIMIT 1`,
    [pedidoId],
  );
  return rows[0] ?? null;
}

/* Forca um status no pagamento, para montar cenarios de partida. */
async function forcarStatusPagamento(pedidoId, status) {
  await pool.query(
    `UPDATE pagamentos SET status = $2 WHERE pedido_id = $1`,
    [pedidoId, status],
  );
}

/* ---------------------------------------------------------------- */
/* Assinatura - a defesa principal                                   */
/* ---------------------------------------------------------------- */

describe('assinatura do webhook', () => {
  test('sem header de assinatura devolve 403 e nao muda nada', async () => {
    const pedido = await criarPedido();
    const pagamento = await pagamentoDoPedido(pedido.id);

    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    const raw = JSON.stringify({ pedido_id: pedido.id });
    const resposta = await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(403);

    expect(resposta.body.erro.mensagem).toMatch(/assinatura/i);

    const depois = await pagamentoDoPedido(pedido.id);
    expect(depois.status).toBe('PENDENTE');
    expect(pagamento).toBeDefined();
  });

  test('assinatura errada devolve 403 e nao muda nada', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    const raw = JSON.stringify({ pedido_id: pedido.id });

    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('x-agrohero-signature', 'sha256=' + '0'.repeat(64))
      .send(raw)
      .expect(403);

    expect((await pagamentoDoPedido(pedido.id)).status).toBe('PENDENTE');
  });

  /*
   * Assinatura CALCULADA COM OUTRO SEGREDO. E o caso do atacante que
   * conhece o formato (sabe que e sha256 do corpo) mas nao conhece a
   * chave. Sem isso, o formato sozinho seria a "protecao" - e nao seria
   * protecao nenhuma.
   */
  test('assinatura de outro segredo devolve 403', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    const raw = JSON.stringify({ pedido_id: pedido.id });
    const assinaturaForjada = assinar(raw, 'segredo-do-atacante-nao-e-este-1234');

    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('x-agrohero-signature', assinaturaForjada)
      .send(raw)
      .expect(403);

    expect((await pagamentoDoPedido(pedido.id)).status).toBe('PENDENTE');
  });

  /*
   * ASSINATURA VALIDA DE OUTRO CORPO.
   *
   * Este e o ataque mais interessante: o atacante captura um webhook
   * legitimo (assinatura e corpo), e reenvia a MESMA assinatura com um
   * corpo alterado - trocando o pedido_id, por exemplo. Se a assinatura
   * nao cobrisse o corpo, passaria.
   *
   * A primeira requisicao e legitima e assina o corpo original. A segunda
   * reaproveita a assinatura com corpo diferente e tem que ser recusada.
   */
  test('assinatura de um corpo nao vale para outro', async () => {
    const pedidoA = await criarPedido();
    const pedidoB = await criarPedido();
    await forcarStatusPagamento(pedidoA.id, 'PENDENTE');
    await forcarStatusPagamento(pedidoB.id, 'PENDENTE');

    const rawOriginal = JSON.stringify({ pedido_id: pedidoA.id });
    const assinaturaDoOriginal = assinar(rawOriginal);

    /* Assinatura do corpo de A, aplicada ao corpo de B. */
    const rawAlterado = JSON.stringify({ pedido_id: pedidoB.id });

    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('x-agrohero-signature', assinaturaDoOriginal)
      .send(rawAlterado)
      .expect(403);

    expect((await pagamentoDoPedido(pedidoB.id)).status).toBe('PENDENTE');
  });

  test('assinatura truncada devolve 403', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    const raw = JSON.stringify({ pedido_id: pedido.id });
    const completa = assinar(raw);

    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('x-agrohero-signature', completa.slice(0, 40))
      .send(raw)
      .expect(403);

    expect((await pagamentoDoPedido(pedido.id)).status).toBe('PENDENTE');
  });

  test('assinatura com prefixo certo e hex errado devolve 403', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    const raw = JSON.stringify({ pedido_id: pedido.id });

    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('x-agrohero-signature', 'sha256=' + 'a'.repeat(64))
      .send(raw)
      .expect(403);
  });

  /*
   * A ASSINATURA COBRE OS BYTES, E NAO O SIGNIFICADO.
   *
   * Duas strings com o MESMO JSON sao corpos diferentes se os espacos
   * mudarem. A assinatura da versao formatada nao vale para a versao
   * compacta - e e por isso que o servidor precisa guardar o corpo bruto
   * em vez de re-serializar o objeto parseado.
   */
  test('assinatura vale para os bytes exatos, nao para o JSON equivalente', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    const formatado = JSON.stringify({ pedido_id: pedido.id }, null, 2);
    const compacto = JSON.stringify({ pedido_id: pedido.id });

    expect(formatado).not.toBe(compacto);

    /* Assinatura dos bytes formatados, envio dos bytes compactos. */
    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('x-agrohero-signature', assinar(formatado))
      .send(compacto)
      .expect(403);

    /* E o inverso: assinatura do compacto, envio do formatado. */
    await request(app)
      .post(WEBHOOK)
      .set('Content-Type', 'application/json')
      .set('x-agrohero-signature', assinar(compacto))
      .send(formatado)
      .expect(403);

    expect((await pagamentoDoPedido(pedido.id)).status).toBe('PENDENTE');
  });

  test('a rota do webhook nao exige login', async () => {
    /*
     * Contraprova: sem token nenhum, mas com assinatura valida, a rota
     * RESPONDE (e nao 401). Se ela exigisse JWT, o gateway nao conseguiria
     * notificar nada.
     */
    const resposta = await enviarWebhook({ pedido_id: 999999 });
    expect(resposta.status).toBe(200);
  });
});

/* ---------------------------------------------------------------- */
/* Reconciliacao - nao confiar no corpo                              */
/* ---------------------------------------------------------------- */

describe('reconciliacao com o gateway', () => {
  /*
   * O GATEWAY MANDA, NAO O CORPO.
   *
   * O pagamento nasce PENDENTE (o PIX aguardando). Simulamos o pagador
   * concluir no banco (`_simularPagamentoConfirmado`, que muda o LEDGER do
   * gateway) e enviamos o webhook.
   *
   * O corpo do webhook nem menciona status - e a consulta ao gateway que
   * revela o APROVADO. Isso prova que o status aplicado vem da
   * reconciliacao, e nao do payload.
   */
  test('aplica o status que o gateway informa, nao o do corpo', async () => {
    const pedido = await criarPedido({ valorUnitario: 10 });
    const pagamento = await pagamentoDoPedido(pedido.id);

    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    /* O pagador concluiu o PIX: o gateway agora diz APROVADO. */
    gatewayFake._simularPagamentoConfirmado(pagamento.identificador_externo);

    const resposta = await enviarWebhook({
      pedido_id: pedido.id,
      identificador: pagamento.identificador_externo,
    }).expect(200);

    expect(resposta.body.dados.processado).toBe(true);
    expect(resposta.body.dados.status).toBe('APROVADO');
    expect((await pagamentoDoPedido(pedido.id)).status).toBe('APROVADO');
  });

  /*
   * CORPO MENTINDO, GATEWAY DIZENDO OUTRA COISA.
   *
   * O corpo afirma "APROVADO"; o ledger do gateway diz PENDENTE. Se o
   * servidor acreditasse no corpo, o pagamento seria confirmado sem o
   * dinheiro ter entrado. Como ele reconcilia, nada muda.
   */
  test('corpo dizendo APROVADO nao vale se o gateway diz PENDENTE', async () => {
    const pedido = await criarPedido({ valorUnitario: 10 });
    const pagamento = await pagamentoDoPedido(pedido.id);

    gatewayFake._simularPagamentoConfirmado(pagamento.identificador_externo);
    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    /* Agora o gateway "volta atras": o ledger diz PENDENTE de novo. */
    gatewayFake._limparLedger(pagamento.identificador_externo);

    const resposta = await enviarWebhook({
      pedido_id: pedido.id,
      identificador: pagamento.identificador_externo,
      status: 'APROVADO',
    }).expect(200);

    expect(resposta.body.dados.status).toBe('PENDENTE');
    expect((await pagamentoDoPedido(pedido.id)).status).toBe('PENDENTE');
  });

  /*
   * O CORPO NAO MANDA NO STATUS.
   *
   * Mandamos um webhook dizendo "APROVADO" para um pagamento que o
   * gateway (e o banco) dizem estar REEMBOLSADO. Se o servidor
   * acreditasse no corpo, o dinheiro ja devolvido apareceria como
   * recebido. Como ele reconcilia, o status fica como esta.
   */
  test('corpo dizendo APROVADO nao reverte um REEMBOLSADO', async () => {
    const pedido = await criarPedido({ valorUnitario: 10 });
    const pagamento = await pagamentoDoPedido(pedido.id);

    await forcarStatusPagamento(pedido.id, 'REEMBOLSADO');
    gatewayFake._registrarStatus(pagamento.identificador_externo, 'REEMBOLSADO');

    const resposta = await enviarWebhook({
      pedido_id: pedido.id,
      identificador: pagamento.identificador_externo,
      status: 'APROVADO',
    }).expect(200);

    expect(resposta.body.dados.processado).toBe(false);
    expect((await pagamentoDoPedido(pedido.id)).status).toBe('REEMBOLSADO');
  });

  test('REEMBOLSADO e estado final do pagamento', async () => {
    const pedido = await criarPedido({ valorUnitario: 10 });
    const pagamento = await pagamentoDoPedido(pedido.id);

    await forcarStatusPagamento(pedido.id, 'REEMBOLSADO');
    gatewayFake._registrarStatus(pagamento.identificador_externo, 'REEMBOLSADO');

    /* Nenhum evento reativa um reembolso, mesmo com o gateway dizendo APROVADO. */
    gatewayFake._simularPagamentoConfirmado(pagamento.identificador_externo);

    const resposta = await enviarWebhook({
      pedido_id: pedido.id,
      identificador: pagamento.identificador_externo,
    }).expect(200);

    expect(resposta.body.dados.processado).toBe(false);
    expect((await pagamentoDoPedido(pedido.id)).status).toBe('REEMBOLSADO');
  });

  test('CANCELADO tambem e estado final', async () => {
    const pedido = await criarPedido({ valorUnitario: 10 });
    const pagamento = await pagamentoDoPedido(pedido.id);

    await forcarStatusPagamento(pedido.id, 'CANCELADO');
    gatewayFake._simularPagamentoConfirmado(pagamento.identificador_externo);

    await enviarWebhook({
      pedido_id: pedido.id,
      identificador: pagamento.identificador_externo,
    }).expect(200);

    expect((await pagamentoDoPedido(pedido.id)).status).toBe('CANCELADO');
  });

  /*
   * Pagamento desconhecido: 200, e nao 404.
   *
   * Um 404 faria o gateway reenviar para sempre um evento de outro
   * ambiente ou de um pagamento antigo. Aceitamos e ignoramos.
   */
  test('pagamento desconhecido devolve 200 e ignora', async () => {
    const resposta = await enviarWebhook({
      pedido_id: 999999,
      identificador: 'NAO-EXISTE-123',
    }).expect(200);

    expect(resposta.body.dados.processado).toBe(false);
    expect(resposta.body.dados.motivo).toBe('PAGAMENTO_NAO_ENCONTRADO');
  });
});

/* ---------------------------------------------------------------- */
/* Idempotencia                                                      */
/* ---------------------------------------------------------------- */

describe('idempotencia', () => {
  /*
   * O MESMO EVENTO ENVIADO TRES VEZES.
   *
   * Gateways reenviam webhooks quando nao recebem 200, e reenviam por
   * garantia. A primeira aplicacao muda o status; as seguintes nao podem
   * fazer nada alem de responder 200.
   */
  test('o mesmo evento tres vezes aplica o efeito uma vez', async () => {
    const pedido = await criarPedido();
    const pagamento = await pagamentoDoPedido(pedido.id);

    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    const corpo = {
      pedido_id: pedido.id,
      identificador: pagamento.identificador_externo,
      status: 'APROVADO',
    };

    const primeira = await enviarWebhook(corpo).expect(200);
    const segunda = await enviarWebhook(corpo).expect(200);
    const terceira = await enviarWebhook(corpo).expect(200);

    expect(primeira.body.dados.processado).toBe(true);
    expect(segunda.body.dados.motivo).toBe('STATUS_JA_APLICADO');
    expect(terceira.body.dados.motivo).toBe('STATUS_JA_APLICADO');
  });

  test('reenvio nao altera o status final', async () => {
    const pedido = await criarPedido();
    const pagamento = await pagamentoDoPedido(pedido.id);

    await forcarStatusPagamento(pedido.id, 'REEMBOLSADO');

    for (let i = 0; i < 3; i += 1) {
      await enviarWebhook({
        pedido_id: pedido.id,
        identificador: pagamento.identificador_externo,
        status: 'APROVADO',
      }).expect(200);
    }

    expect((await pagamentoDoPedido(pedido.id)).status).toBe('REEMBOLSADO');
  });
});

/* ---------------------------------------------------------------- */
/* Estorno no cancelamento                                           */
/* ---------------------------------------------------------------- */

describe('estorno ao cancelar', () => {
  test('pedido pago e cancelado tem o pagamento reembolsado', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'APROVADO');

    const pagamentoAntes = await pagamentoDoPedido(pedido.id);

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(resposta.body.dados.estornado).toBe(true);
    /*
     * O valor estornado e o VALOR DO PAGAMENTO, que inclui o frete. O
     * estorno devolve o que o cliente pagou, e nao o subtotal dos
     * produtos - devolver menos deixaria o frete com nos.
     */
    expect(resposta.body.dados.valor_estornado).toBe(Number(pagamentoAntes.valor));
    expect((await pagamentoDoPedido(pedido.id)).status).toBe('REEMBOLSADO');
  });

  /*
   * Pedido nunca pago: nao ha o que estornar, e a resposta nao inventa um
   * estorno. `estornado` fica ausente.
   */
  test('pedido nao pago nao gera estorno nem erro', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(resposta.body.dados.estornado).toBeUndefined();
    expect(resposta.body.dados.estorno_pendente).toBeUndefined();

    /* O cancelamento aconteceu normalmente. */
    expect(resposta.body.dados.pedido.status).toBe('CANCELADO');
  });

  test('pagamento recusado tambem nao gera estorno', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'RECUSADO');

    const resposta = await request(app)
      .patch(`${PEDIDOS}/${pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(resposta.body.dados.estornado).toBeUndefined();
    expect((await pagamentoDoPedido(pedido.id)).status).toBe('RECUSADO');
  });

  /*
   * O ESTORNO NAO DESFAZ O CANCELAMENTO.
   *
   * Forcamos uma falha de estorno (gateway desconhecido faz
   * `selecionarAdaptador` lancar) e conferimos que:
   *   - o cancelamento continua valendo;
   *   - o estoque voltou;
   *   - a resposta sinaliza `estorno_pendente`.
   *
   * Este e o teste que prova a escolha de projeto: devolver o dinheiro e
   * obrigacao nossa, mas nao e condicao para o cliente cancelar.
   */
  test('falha no estorno nao desfaz o cancelamento', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'APROVADO');

    const estoqueAntes = (await pool.query('SELECT estoque FROM produtos WHERE id = $1', [idProduto]))
      .rows[0].estoque;

    /* Gateway invalido: `processar`/`estornar` passam a lancar. */
    const gatewayOriginal = env.PAYMENT_GATEWAY;
    env.PAYMENT_GATEWAY = 'gateway-inexistente';

    try {
      const resposta = await request(app)
        .patch(`${PEDIDOS}/${pedido.id}/cancelar`)
        .set(auth(tokenCliente))
        .expect(200);

      expect(resposta.body.dados.estorno_pendente).toBe(true);
      expect(resposta.body.dados.motivo).toBe('FALHA_ESTORNO');
      expect(resposta.body.dados.pedido.status).toBe('CANCELADO');
    } finally {
      env.PAYMENT_GATEWAY = gatewayOriginal;
    }

    /* Estoque devolvido apesar da falha de estorno. */
    const estoqueDepois = (await pool.query('SELECT estoque FROM produtos WHERE id = $1', [idProduto]))
      .rows[0].estoque;
    expect(estoqueDepois).toBe(estoqueAntes + 1);

    /* O pagamento ficou APROVADO: o dinheiro ainda NAO voltou, e o
       registro precisa refletir isso para a operacao cobrar o reembolso. */
    expect((await pagamentoDoPedido(pedido.id)).status).toBe('APROVADO');
  });

  test('estorno nao roda em pedido de outro consumidor', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'APROVADO');

    await request(app)
      .patch(`${PEDIDOS}/${pedido.id}/cancelar`)
      .set(auth(tokenOutroCliente))
      .expect(404);

    /* Nem cancelou, nem estornou. */
    const pagamento = await pagamentoDoPedido(pedido.id);
    expect(pagamento.status).toBe('APROVADO');
  });

  test('estorno nao roda quando o cancelamento e recusado', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'APROVADO');

    /* Avanca o item ate ENVIADO, tornando o pedido nao cancelavel. */
    const { rows: itens } = await pool.query(
      'SELECT id FROM pedido_itens WHERE pedido_id = $1',
      [pedido.id],
    );

    for (const status of ['PROCESSANDO', 'ENVIADO']) {
      await request(app)
        .patch(`${PEDIDOS}/${pedido.id}/itens/${itens[0].id}/status`)
        .set(auth(tokenAgricultor))
        .send({ status })
        .expect(200);
    }

    await request(app)
      .patch(`${PEDIDOS}/${pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(422);

    /* O dinheiro continua com nos: nao houve cancelamento, nao houve estorno. */
    expect((await pagamentoDoPedido(pedido.id)).status).toBe('APROVADO');
  });

  test('cancelar duas vezes nao estorna duas vezes', async () => {
    const pedido = await criarPedido();
    await forcarStatusPagamento(pedido.id, 'APROVADO');

    const primeira = await request(app)
      .patch(`${PEDIDOS}/${pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    expect(primeira.body.dados.estornado).toBe(true);

    await request(app)
      .patch(`${PEDIDOS}/${pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(422);

    /* Uma unica marcacao de reembolso. */
    expect((await pagamentoDoPedido(pedido.id)).status).toBe('REEMBOLSADO');
  });
});

/* ---------------------------------------------------------------- */
/* Webhook que chega depois do estorno                               */
/* ---------------------------------------------------------------- */

describe('webhook atrasado apos cancelamento', () => {
  /*
   * O CENARIO REAL: PIX confirmado, pedido cancelado (com estorno), e
   * entao chega o webhook de "pago" que estava na fila.
   *
   * Como o pagamento ja esta REEMBOLSADO (estado final), o evento e
   * ignorado. Sem essa regra, o webhook atrasado marcaria como pago um
   * dinheiro que ja voltou para o cliente.
   */
  test('confirmacao de pagamento apos estorno e ignorada', async () => {
    const pedido = await criarPedido();
    const pagamento = await pagamentoDoPedido(pedido.id);

    await forcarStatusPagamento(pedido.id, 'APROVADO');

    await request(app)
      .patch(`${PEDIDOS}/${pedido.id}/cancelar`)
      .set(auth(tokenCliente))
      .expect(200);

    expect((await pagamentoDoPedido(pedido.id)).status).toBe('REEMBOLSADO');

    const resposta = await enviarWebhook({
      pedido_id: pedido.id,
      identificador: pagamento.identificador_externo,
      status: 'APROVADO',
    }).expect(200);

    expect(resposta.body.dados.processado).toBe(false);
    expect((await pagamentoDoPedido(pedido.id)).status).toBe('REEMBOLSADO');
  });
});

/* ---------------------------------------------------------------- */
/* Rota com identificador na URL                                     */
/* ---------------------------------------------------------------- */

describe('identificador na URL', () => {
  test('aceita o identificador como parametro de caminho', async () => {
    const pedido = await criarPedido();
    const pagamento = await pagamentoDoPedido(pedido.id);

    await forcarStatusPagamento(pedido.id, 'PENDENTE');

    const resposta = await enviarWebhook(
      { pedido_id: pedido.id },
      { url: `${WEBHOOK}/${pagamento.identificador_externo}` },
    ).expect(200);

    expect(resposta.body.dados.processado).toBe(true);
  });

  test('identificador da URL inexistente devolve 200 e ignora', async () => {
    const resposta = await enviarWebhook({}, { url: `${WEBHOOK}/NAO-EXISTE` }).expect(200);

    expect(resposta.body.dados.processado).toBe(false);
  });
});