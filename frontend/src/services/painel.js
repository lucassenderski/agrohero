import { api } from './api.js';

/*
 * Produtos do produtor logado e administracao do catalogo.
 *
 * `listarMeusProdutos` usa /produtos/meus e nao /agricultores/:id/produtos:
 * a segunda e a vitrine PUBLICA e so mostra produtos ativos. O painel
 * precisa ver tambem os inativos (para reativar) e o estoque real.
 */

export async function listarMeusProdutos(filtros = {}) {
  const resposta = await api.get('/produtos/meus', filtros);
  return { produtos: resposta.dados, paginacao: resposta.paginacao };
}

export async function buscarMeuProduto(id) {
  const resposta = await api.get(`/produtos/${id}`);
  return resposta.dados;
}

export async function criarProduto(dados) {
  const resposta = await api.post('/produtos', dados);
  return resposta.dados;
}

export async function atualizarProduto(id, dados) {
  const resposta = await api.put(`/produtos/${id}`, dados);
  return resposta.dados;
}

export async function alterarDisponibilidade(id, ativo) {
  const resposta = await api.patch(`/produtos/${id}/disponibilidade`, { ativo });
  return resposta.dados;
}

/* Soma ao estoque existente (nao substitui). */
export async function reporEstoque(id, quantidade) {
  const resposta = await api.patch(`/produtos/${id}/estoque`, { quantidade });
  return resposta.dados;
}

export async function desativarProduto(id) {
  const resposta = await api.delete(`/produtos/${id}`);
  return resposta.dados;
}

/* --- Administracao de categorias --- */

export async function listarCategoriasAdmin(filtros = {}) {
  const resposta = await api.get('/admin/categorias', filtros);
  return { categorias: resposta.dados, paginacao: resposta.paginacao };
}

export async function criarCategoria(dados) {
  const resposta = await api.post('/admin/categorias', dados);
  return resposta.dados;
}

export async function atualizarCategoria(id, dados) {
  const resposta = await api.put(`/admin/categorias/${id}`, dados);
  return resposta.dados;
}

export async function desativarCategoria(id) {
  const resposta = await api.delete(`/admin/categorias/${id}`);
  return resposta.dados;
}

export async function reativarCategoria(id) {
  const resposta = await api.patch(`/admin/categorias/${id}/ativar`);
  return resposta.dados;
}