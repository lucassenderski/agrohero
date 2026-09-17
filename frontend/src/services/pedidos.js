import { api } from './api.js';

/*
 * Pedidos: visao do consumidor, do produtor e do administrador.
 *
 * Os tres recortes batem em rotas diferentes de proposito. O produtor
 * NAO usa `/pedidos/:id` com um filtro - ele usa `/pedidos/agricultor`,
 * porque a API devolve apenas os itens dele e omite os valores do
 * pedido inteiro (que incluiriam a venda dos outros produtores).
 */

export async function listarMeusPedidos(filtros = {}) {
  const resposta = await api.get('/pedidos', filtros);
  return { pedidos: resposta.dados, paginacao: resposta.paginacao };
}

export async function buscarPedido(id) {
  const resposta = await api.get(`/pedidos/${id}`);
  return resposta.dados;
}

export async function cancelarPedido(id) {
  const resposta = await api.patch(`/pedidos/${id}/cancelar`);
  return resposta.dados;
}

export async function listarItensDoProdutor(filtros = {}) {
  const resposta = await api.get('/pedidos/agricultor', filtros);
  return { itens: resposta.dados, paginacao: resposta.paginacao };
}

/*
 * Avanca o status de UM item. O produtor so consegue alterar itens que
 * sao dele: o backend confere a propriedade e devolve 404 caso contrario.
 */
export async function alterarStatusDoItem(pedidoId, itemId, status) {
  const resposta = await api.patch(`/pedidos/${pedidoId}/itens/${itemId}/status`, {
    status,
  });
  return resposta.dados;
}

export async function cancelarItemDoProdutor(pedidoId, itemId) {
  const resposta = await api.delete(`/pedidos/${pedidoId}/itens/${itemId}`);
  return resposta.dados;
}

/* --- Administracao --- */

export async function listarTodosOsPedidos(filtros = {}) {
  const resposta = await api.get('/admin/pedidos', filtros);
  return { pedidos: resposta.dados, paginacao: resposta.paginacao };
}

export async function alterarStatusDoPedido(id, status) {
  const resposta = await api.patch(`/admin/pedidos/${id}/status`, { status });
  return resposta.dados;
}
