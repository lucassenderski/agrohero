/*
 * Testes do envio de e-mail (emailService).
 *
 * O que precisa ser provado aqui nao e "o Resend funciona" - e a ISOLACAO
 * DO CONTEUDO. Cada e-mail carrega numeros de um pedido, e um pedido
 * multi-produtor tem varios valores diferentes. Se o aviso do produtor A
 * levasse o total do pedido (ou a parte do produtor B), o sistema
 * revelaria a venda de um concorrente - o mesmo vazamento que a API
 * evita nas visoes por dono.
 *
 * A fronteira de rede (`fetch`) e substituida, mas o codigo REAL roda:
 * montagem de assunto, corpo, destinatario e o tratamento de falha sao os
 * de producao. Nenhuma funcao interna e mockada.
 */

const PROVIDER_ORIGINAL = process.env.EMAIL_PROVIDER;
const CHAVE_ORIGINAL = process.env.RESEND_API_KEY;

process.env.EMAIL_PROVIDER = 'resend';
process.env.RESEND_API_KEY = 'chave-de-teste';

const {
  enviarEmailPedidoConfirmado,
  enviarEmailNovoPedidoProdutor,
} = await import('../../src/services/emailService.js');

/** Captura as chamadas a API do provedor, sem sair para a rede. */
function interceptarFetch({ ok = true, status = 200 } = {}) {
  const chamadas = [];

  global.fetch = async (url, opcoes) => {
    chamadas.push({ url, corpo: JSON.parse(opcoes.body) });
    return {
      ok,
      status,
      text: async () => 'erro simulado',
    };
  };

  return chamadas;
}

const PEDIDO = {
  id: 42,
  valor_produtos: 100,
  valor_frete: 10,
  valor_total: 110,
};

afterEach(() => {
  delete global.fetch;
});

afterAll(() => {
  /* Nao vazar as variaveis para outras suites na mesma execucao. */
  if (PROVIDER_ORIGINAL === undefined) delete process.env.EMAIL_PROVIDER;
  else process.env.EMAIL_PROVIDER = PROVIDER_ORIGINAL;

  if (CHAVE_ORIGINAL === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = CHAVE_ORIGINAL;
});

describe('enviarEmailPedidoConfirmado', () => {
  test('vai para o consumidor e deixa claro que nada foi cobrado agora', async () => {
    const chamadas = interceptarFetch();

    await enviarEmailPedidoConfirmado({
      email: 'cliente@teste.local',
      pedido: PEDIDO,
      pagamentos: [
        { nome_fazenda: 'Fazenda A', valor: 55, metodo: 'PIX' },
        { nome_fazenda: 'Fazenda B', valor: 55, metodo: 'PIX' },
      ],
    });

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].corpo.to).toEqual(['cliente@teste.local']);

    const conteudo = `${chamadas[0].corpo.text} ${chamadas[0].corpo.html}`;
    expect(conteudo).toMatch(/nao foi cobrado agora/i);
    expect(conteudo).toMatch(/na retirada/i);
    expect(conteudo).toContain('Fazenda A');
    expect(conteudo).toContain('Fazenda B');
  });
});

describe('enviarEmailNovoPedidoProdutor', () => {
  /*
   * O teste central: o produtor so ve os itens DELE e o valor DELE. O
   * total do pedido e a parte do outro produtor nao podem aparecer no
   * corpo.
   */
  test('o aviso do produtor nao vaza o total nem a parte do outro', async () => {
    const chamadas = interceptarFetch();

    await enviarEmailNovoPedidoProdutor({
      email: 'produtorA@teste.local',
      pedido: PEDIDO,
      pagamento: { valor: 55, metodo: 'CARTAO' },
      itens: [{ nome: 'Tomate', quantidade: 2, subtotal: 55 }],
    });

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].corpo.to).toEqual(['produtorA@teste.local']);

    const conteudo = `${chamadas[0].corpo.text} ${chamadas[0].corpo.html}`;

    /* O que e dele aparece. */
    expect(conteudo).toContain('Tomate');
    expect(conteudo).toMatch(/R\$ 55,00/);
    expect(conteudo).toContain('CARTAO');

    /* O que nao e dele NAO aparece. */
    expect(conteudo).not.toMatch(/R\$ 110,00/);
    expect(conteudo).not.toContain('Morango');
    expect(conteudo).not.toMatch(/Fazenda B/);
  });

  test('falha do provedor nao lanca (o pedido ja existe)', async () => {
    interceptarFetch({ ok: false, status: 500 });

    await expect(
      enviarEmailNovoPedidoProdutor({
        email: 'produtorA@teste.local',
        pedido: PEDIDO,
        pagamento: { valor: 55, metodo: 'PIX' },
        itens: [{ nome: 'Tomate', quantidade: 1, subtotal: 55 }],
      }),
    ).resolves.toBeUndefined();
  });
});
