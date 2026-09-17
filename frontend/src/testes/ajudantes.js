import { salvarToken, removerToken } from '../services/api.js';

/*
 * Apoio para os testes de interface.
 *
 * Os testes NAO mockam a API: eles registram uma conta nova no backend
 * de verdade e usam o token devolvido por ele. Isso cobre o que um mock
 * esconde - formato do envelope, nomes de campo, codigos de erro e
 * regras de autorizacao. Cada execucao cria seus proprios dados, entao
 * um teste nao depende do que outro deixou no banco.
 */

const URL_API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

/* Sufixo unico por execucao, para nao colidir com o e-mail de outro teste. */
function sufixoUnico() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export const SENHA_PADRAO = 'Senha1234';

async function chamar(caminho, { metodo = 'POST', corpo, token } = {}) {
  const cabecalhos = { Accept: 'application/json' };
  if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
  if (token) cabecalhos.Authorization = `Bearer ${token}`;

  const resposta = await fetch(`${URL_API}${caminho}`, {
    method: metodo,
    headers: cabecalhos,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });

  const payload = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = new Error(payload?.erro?.mensagem || `Falha em ${caminho}`);
    erro.status = resposta.status;
    erro.codigo = payload?.erro?.codigo;
    throw erro;
  }
  return payload;
}

/* Cria uma conta de cliente e devolve o token ja salvo no localStorage. */
export async function criarClienteLogado() {
  const sufixo = sufixoUnico();
  const email = `cliente.teste.${sufixo}@agrohero.test`;

  /*
   * O cadastro ja devolve o token, entao nao chamamos /auth/login aqui.
   * Isso nao e so economia: o login tem limitador estrito (10 por
   * janela), e uma suite com varios testes estouraria o limite e
   * falharia por motivo errado.
   */
  const { dados } = await chamar('/auth/register', {
    corpo: {
      nome: 'Cliente Teste',
      email,
      senha: SENHA_PADRAO,
      tipo: 'cliente',
      cidade: 'Campinas',
      estado: 'SP',
    },
  });

  salvarToken(dados.token);
  return { id: dados.usuario.id, email, token: dados.token };
}

/* Cria um produtor com o perfil de agricultor completo. */
export async function criarProdutorLogado() {
  const sufixo = sufixoUnico();
  const email = `produtor.teste.${sufixo}@agrohero.test`;

  const { dados } = await chamar('/auth/register', {
    corpo: {
      nome: 'Produtor Teste',
      email,
      senha: SENHA_PADRAO,
      tipo: 'agricultor',
      cidade: 'Campinas',
      estado: 'SP',
      agricultor: {
        nome_fazenda: `Sitio Teste ${sufixo}`,
        descricao: 'Producao organica para testes de integracao.',
        cidade: 'Campinas',
        estado: 'SP',
        endereco: 'Estrada do Sitio, 100',
      },
    },
  });

  salvarToken(dados.token);
  return { id: dados.usuario.id, email, token: dados.token };
}

/*
 * Cria um endereco para o usuario logado e devolve o id.
 * O token vem do localStorage porque e assim que a aplicacao le.
 */
export async function criarEnderecoDoUsuario(token, { cidade = 'Campinas', estado = 'SP' } = {}) {
  const { dados } = await chamar('/enderecos', {
    token,
    corpo: {
      nome_destinatario: 'Cliente Teste',
      cep: '13010100',
      rua: 'Rua de Teste',
      numero: '42',
      complemento: null,
      bairro: 'Centro',
      cidade,
      estado,
    },
  });
  return dados.id;
}

/* Publica um produto do produtor logado e devolve o registro criado. */
export async function criarProduto(token, { nome = 'Produto Teste', preco = 10, estoque = 50 } = {}) {
  const { dados: categorias } = await chamar('/categorias', { metodo: 'GET' });
  const { dados } = await chamar('/produtos', {
    token,
    corpo: {
      nome,
      descricao: 'Produto criado por teste de integracao.',
      preco,
      estoque,
      unidade: 'kg',
      categoria_id: categorias[0].id,
    },
  });
  return dados;
}

/*
 * Monta um pedido entregue e avaliavel.
 *
 * Repete o caminho da aplicacao - carrinho, checkout, produtor avanca o
 * status - em vez de inserir direto no banco. E mais lento, mas testa
 * exatamente as regras que autorizam a avaliacao (item ENTREGUE, do
 * consumidor, daquele pedido).
 */
export async function criarPedidoEntregue({ produtorToken, clienteToken, produto }) {
  await chamar('/carrinho/itens', {
    token: clienteToken,
    corpo: { produto_id: produto.id, quantidade: 1 },
  });

  const enderecoId = await criarEnderecoDoUsuario(clienteToken);

  const { dados: resultado } = await chamar('/checkout', {
    token: clienteToken,
    corpo: { endereco_id: enderecoId, metodo_pagamento: 'PIX' },
  });

  const pedidoId = resultado.pedido.id;

  // O checkout devolve o pedido, mas o status por ITEM so aparece na
  // consulta do pedido - e e o status do item que autoriza a avaliacao.
  const { dados: pedido } = await chamar(`/pedidos/${pedidoId}`, {
    metodo: 'GET',
    token: clienteToken,
  });

  const item = pedido.itens[0];

  for (const status of ['PROCESSANDO', 'ENVIADO', 'ENTREGUE']) {
    await chamar(`/pedidos/${pedidoId}/itens/${item.id}/status`, {
      token: produtorToken,
      metodo: 'PATCH',
      corpo: { status },
    });
  }

  return pedido;
}

export { chamar, removerToken };