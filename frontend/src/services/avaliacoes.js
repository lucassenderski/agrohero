import { api } from './api.js';

/*
 * Avaliacoes escritas pelo consumidor.
 *
 * O corpo NAO leva `consumidor_id` nem `agricultor_id`: o primeiro vem
 * do token e o segundo e copiado do item do pedido pelo servidor.
 * Enviar esses campos nao teria efeito - a validacao os descarta.
 */

export async function avaliarProduto({ pedidoId, produtoId, nota, comentario }) {
  const corpo = { pedido_id: pedidoId, produto_id: produtoId, nota };
  // Comentario vazio vira ausencia do campo, e nao string vazia: o
  // backend guarda NULL e a interface mostra "sem comentario".
  if (comentario && comentario.trim()) corpo.comentario = comentario.trim();

  const resposta = await api.post('/avaliacoes', corpo);
  return resposta.dados;
}

/*
 * Atualizacao parcial. `comentario: null` APAGA o texto; omitir o
 * campo preserva o atual. A distincao e do backend, entao repassamos
 * exatamente o que a tela decidir.
 */
export async function editarAvaliacao(id, dados) {
  const resposta = await api.put(`/avaliacoes/${id}`, dados);
  return resposta.dados;
}

export async function removerAvaliacao(id) {
  const resposta = await api.delete(`/avaliacoes/${id}`);
  return resposta.dados;
}

export async function listarMinhasAvaliacoes(filtros = {}) {
  const resposta = await api.get('/avaliacoes/minhas', filtros);
  return { avaliacoes: resposta.dados, paginacao: resposta.paginacao };
}

/*
 * Itens de um pedido ja entregues e ainda nao avaliados. Evita a tela
 * ter que cruzar "meus pedidos" com "minhas avaliacoes".
 */
export async function listarPendentesDeAvaliacao(pedidoId) {
  const resposta = await api.get(`/avaliacoes/pendentes/${pedidoId}`);
  return resposta.dados;
}