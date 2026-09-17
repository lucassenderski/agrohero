import { api } from './api.js';

/*
 * Servicos de catalogo: categorias, produtos, produtores e avaliacoes
 * publicas.
 *
 * Cada funcao devolve `dados` (e `paginacao` quando existe) em vez do
 * envelope cru. As telas nao deveriam precisar saber que a resposta vem
 * embrulhada em { sucesso, dados } - isso e detalhe do transporte.
 */

export async function listarCategorias() {
  const resposta = await api.get('/categorias');
  return resposta.dados;
}

export async function buscarCategoria(idOuSlug) {
  const resposta = await api.get(`/categorias/${idOuSlug}`);
  return resposta.dados;
}

/*
 * Lista de produtos com filtros.
 *
 * O objeto `filtros` usa os mesmos nomes da API (busca, categoria_id,
 * preco_min...). O montador de query do api.js ja descarta valores
 * vazios, entao a tela pode passar tudo e deixar em branco o que nao
 * interessa.
 */
export async function listarProdutos(filtros = {}) {
  const resposta = await api.get('/produtos', filtros);
  return { produtos: resposta.dados, paginacao: resposta.paginacao };
}

export async function buscarProduto(id) {
  const resposta = await api.get(`/produtos/${id}`);
  return resposta.dados;
}

export async function listarProdutosDoProdutor(agricultorId, filtros = {}) {
  const resposta = await api.get(`/agricultores/${agricultorId}/produtos`, filtros);
  return { produtos: resposta.dados, paginacao: resposta.paginacao };
}

export async function listarProdutores(filtros = {}) {
  const resposta = await api.get('/agricultores', filtros);
  return { produtores: resposta.dados, paginacao: resposta.paginacao };
}

export async function buscarProdutor(id) {
  const resposta = await api.get(`/agricultores/${id}`);
  return resposta.dados;
}

export async function listarAvaliacoesDoProduto(produtoId, filtros = {}) {
  const resposta = await api.get(`/avaliacoes/produto/${produtoId}`, filtros);
  return { ...resposta.dados, paginacao: resposta.paginacao };
}

export async function listarAvaliacoesDoProdutor(agricultorId, filtros = {}) {
  const resposta = await api.get(`/avaliacoes/agricultor/${agricultorId}`, filtros);
  return { ...resposta.dados, paginacao: resposta.paginacao };
}
