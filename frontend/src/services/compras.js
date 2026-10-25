import { api } from './api.js';

/*
 * Carrinho, enderecos e checkout.
 *
 * Nenhuma funcao envia preco: o servidor calcula a partir do preco
 * atual do produto. O carrinho guarda so a quantidade.
 */

export async function buscarCarrinho() {
  const resposta = await api.get('/carrinho');
  return resposta.dados;
}

export async function adicionarAoCarrinho(produtoId, quantidade = 1) {
  const resposta = await api.post('/carrinho/itens', {
    produto_id: produtoId,
    quantidade,
  });
  return resposta.dados;
}

export async function definirQuantidade(produtoId, quantidade) {
  const resposta = await api.patch(`/carrinho/itens/${produtoId}`, { quantidade });
  return resposta.dados;
}

export async function removerDoCarrinho(produtoId) {
  const resposta = await api.delete(`/carrinho/itens/${produtoId}`);
  return resposta.dados;
}

export async function esvaziarCarrinho() {
  const resposta = await api.delete('/carrinho');
  return resposta.dados;
}

/* Revalida precos e estoque antes do checkout. */
export async function validarCarrinho() {
  const resposta = await api.get('/carrinho/validacao');
  return resposta.dados;
}

export async function listarEnderecos() {
  const resposta = await api.get('/enderecos');
  return resposta.dados;
}

export async function criarEndereco(dados) {
  const resposta = await api.post('/enderecos', dados);
  return resposta.dados;
}

export async function atualizarEndereco(id, dados) {
  const resposta = await api.put(`/enderecos/${id}`, dados);
  return resposta.dados;
}

export async function removerEndereco(id) {
  const resposta = await api.delete(`/enderecos/${id}`);
  return resposta.dados;
}

export async function definirEnderecoPrincipal(id) {
  const resposta = await api.patch(`/enderecos/${id}/principal`);
  return resposta.dados;
}

/* Resumo do checkout sem gravar pedido - usado na tela de revisao. */
export async function previaCheckout(enderecoId) {
  const resposta = await api.post('/checkout/preview', { endereco_id: enderecoId });
  return resposta.dados;
}

/*
 * Finaliza a compra.
 *
 * `telefone_contato` e o numero que o cliente confirmou para esta
 * entrega. Vai como `undefined` quando vazio: o schema do servidor
 * recusa string vazia (o campo ou esta ausente, ou e um numero valido),
 * e nesse caso o backend cai no telefone do perfil.
 */
export async function finalizarCheckout(enderecoId, metodoPagamento, telefoneContato) {
  const resposta = await api.post('/checkout', {
    endereco_id: enderecoId,
    metodo_pagamento: metodoPagamento,
    telefone_contato: telefoneContato || undefined,
  });
  return resposta.dados;
}