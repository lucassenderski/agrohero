import carrinhoRepository from '../repositories/carrinhoRepository.js';
import { erros } from '../utils/AppError.js';
import logger from '../config/logger.js';

/*
 * Regras de negocio do carrinho.
 *
 * PRINCIPIO DESTE MODULO: o servidor calcula, o cliente apenas escolhe
 * produto e quantidade. O corpo da requisicao carrega `produto_id` e
 * `quantidade` - nunca preco. Todo valor em dinheiro sai de
 * `produtos.preco`, lido no momento da consulta.
 *
 * Consequencia: "manipular preco no frontend" nao e uma validacao a
 * fazer, e uma impossibilidade do modelo. O preco nao tem por onde
 * entrar.
 *
 * O carrinho so existe para usuario autenticado (um carrinho por
 * consumidor). A rota exige `cliente`: um agricultor ou admin que queira
 * comprar precisaria de uma conta de cliente, o que mantem a separacao
 * de papeis do requisito 9.
 */

/*
 * Carrega o produto validando que ele pode ser comprado.
 *
 * Um produto so entra no carrinho se estiver visivel no marketplace
 * (ativo, com produtor ativo, categoria ativa) e com estoque. Bloquear
 * aqui, e nao so no checkout, evita o pior tipo de frustracao: montar o
 * carrinho inteiro e so descobrir no fim que um item nao pode ser
 * comprado.
 */
async function carregarProdutoCompravel(produtoId) {
  const produto = await carrinhoRepository.buscarProdutoVisivel(produtoId);

  if (!produto) {
    /*
     * Nao distinguimos "nao existe" de "existe mas esta fora do ar". Para
     * o cliente o resultado pratico e o mesmo (nao da para comprar), e a
     * mensagem generica evita expor a existencia de produto desativado.
     */
    throw erros.naoEncontrado('Produto');
  }

  if (produto.estoque <= 0) {
    throw erros.estoqueInsuficiente(produto.nome);
  }

  return produto;
}

/*
 * Valida a quantidade pedida contra o estoque.
 *
 * A checagem aqui e uma cortesia, nao uma garantia: entre esta leitura e
 * a gravacao, outro cliente pode comprar o ultimo item. A garantia real
 * e a transacao do checkout (FASE 11), que reserva o estoque de forma
 * atomica. Este aviso serve para o cliente nao montar um carrinho que
 * ja nasce invalido.
 */
function validarEstoque(produto, quantidade) {
  if (quantidade > produto.estoque) {
    throw erros.estoqueInsuficiente(produto.nome);
  }
}

/*
 * Monta o carrinho completo com os totais calculados no servidor.
 *
 * A projecao junta item + produto, mas o preco unitario e o subtotal sao
 * derivados AQUI, a partir do preco atual do banco. O frontend nao
 * recebe um subtotal pronto para confiar - ele recebe o calculo para
 * exibir, e o checkout refaz a conta.
 */
function montarCarrinho(carrinho, itens) {
  const itensMontados = itens.map((item) => {
    const preco = Number(item.preco);
    const subtotal = Number((preco * item.quantidade).toFixed(2));

    /*
     * Sinaliza o item que precisa de atencao do cliente: estoque caiu
     * abaixo do que esta no carrinho (alguem comprou enquanto ele
     * navegava), ou o produto saiu do ar. Sem isso, o cliente so
     * descobriria no checkout.
     */
    const disponivel = item.ativo && item.estoque >= item.quantidade;

    return {
      item_id: item.item_id,
      quantidade: item.quantidade,
      preco_unitario: preco,
      subtotal,
      disponivel,
      estoque_disponivel: item.estoque,
      produto: {
        id: item.id,
        nome: item.nome,
        descricao: item.descricao,
        preco,
        estoque: item.estoque,
        unidade: item.unidade,
        imagem_url: item.imagem_url,
        ativo: item.ativo,
        categoria_id: item.categoria_id,
        categoria_nome: item.categoria_nome,
        categoria_slug: item.categoria_slug,
        agricultor_id: item.agricultor_id,
        nome_fazenda: item.nome_fazenda,
        agricultor_cidade: item.agricultor_cidade,
        agricultor_estado: item.agricultor_estado,
        media_avaliacoes: item.media_avaliacoes,
        total_avaliacoes: item.total_avaliacoes,
      },
    };
  });

  const valorProdutos = Number(
    itensMontados.reduce((soma, item) => soma + item.subtotal, 0).toFixed(2),
  );

  const totalUnidades = itensMontados.reduce((soma, item) => soma + item.quantidade, 0);

  /*
   * Agricultores distintos no carrinho. O frontend usa isso para avisar
   * que o pedido sera dividido entre varios produtores (requisito 18) -
   * e um dado que o cliente precisa saber ANTES de fechar, porque afeta
   * o frete e a entrega.
   */
  const agricultores = new Set(itensMontados.map((item) => item.produto.agricultor_id));

  return {
    id: carrinho.id,
    itens: itensMontados,
    total_itens: itensMontados.length,
    total_unidades: totalUnidades,
    total_agricultores: agricultores.size,
    valor_produtos: valorProdutos,
    /*
     * Frete nao entra no carrinho: ele depende do endereco de entrega,
     * que so e escolhido no checkout. Devolver um frete aqui seria um
     * numero inventado.
     */
    frete_calculado: false,
    atualizado_em: carrinho.atualizado_em,
  };
}

/* Le o carrinho do consumidor autenticado, criando se necessario. */
export async function obter(usuario) {
  const carrinho = await carrinhoRepository.obterOuCriar(usuario.id);
  const itens = await carrinhoRepository.listarItens(carrinho.id);

  return montarCarrinho(carrinho, itens);
}

/*
 * Adiciona um produto ao carrinho.
 *
 * A quantidade e SOMADA a que ja existe (semantica de "adicionar ao
 * carrinho"). O estoque e conferido contra o total resultante, e nao
 * apenas contra a quantidade enviada: adicionar 5 quando ja havia 8 com
 * estoque 10 precisa ser recusado, e validar so os 5 passaria.
 */
export async function adicionarItem(usuario, produtoId, quantidade) {
  const produto = await carregarProdutoCompravel(produtoId);
  const carrinho = await carrinhoRepository.obterOuCriar(usuario.id);

  const itemExistente = await carrinhoRepository.buscarItem(carrinho.id, produtoId);
  const quantidadeFinal = (itemExistente?.quantidade ?? 0) + quantidade;

  validarEstoque(produto, quantidadeFinal);

  await carrinhoRepository.adicionarItem(carrinho.id, produtoId, quantidade);

  logger.info(
    { usuarioId: usuario.id, produtoId, quantidade, quantidadeFinal },
    'Item adicionado ao carrinho',
  );

  return obter(usuario);
}

/*
 * Define a quantidade exata de um item.
 *
 * Semantica diferente de adicionar: aqui o cliente digitou o numero no
 * campo do item, entao a quantidade e substituida.
 */
export async function definirQuantidade(usuario, produtoId, quantidade) {
  const produto = await carregarProdutoCompravel(produtoId);
  const carrinho = await carrinhoRepository.obterOuCriar(usuario.id);

  validarEstoque(produto, quantidade);

  const atualizado = await carrinhoRepository.definirQuantidade(carrinho.id, produtoId, quantidade);

  /*
   * Item inexistente no carrinho: 404, e nao criacao implicita. Criar
   * aqui faria um PATCH silenciosamente adicionar produto - e o cliente
   * que digitou a quantidade no lugar errado nunca saberia.
   */
  if (!atualizado) {
    throw erros.naoEncontrado('Item do carrinho');
  }

  logger.info({ usuarioId: usuario.id, produtoId, quantidade }, 'Quantidade alterada no carrinho');

  return obter(usuario);
}

/* Remove um item do carrinho. */
export async function removerItem(usuario, produtoId) {
  const carrinho = await carrinhoRepository.obterOuCriar(usuario.id);

  const removido = await carrinhoRepository.removerItem(carrinho.id, produtoId);

  if (!removido) {
    throw erros.naoEncontrado('Item do carrinho');
  }

  logger.info({ usuarioId: usuario.id, produtoId }, 'Item removido do carrinho');

  return obter(usuario);
}

/* Esvazia o carrinho. */
export async function limpar(usuario) {
  const carrinho = await carrinhoRepository.obterOuCriar(usuario.id);

  const removidos = await carrinhoRepository.limpar(carrinho.id);

  logger.info({ usuarioId: usuario.id, itensRemovidos: removidos }, 'Carrinho esvaziado');

  return obter(usuario);
}

/*
 * Revalida o carrinho antes do checkout.
 *
 * O carrinho pode ter sido montado minutos antes: precos mudaram, itens
 * esgotaram, produtos sairam do ar. Devolve a lista de problemas em vez
 * de simplesmente falhar, para o frontend poder mostrar ao cliente
 * exatamente o que ajustar.
 */
export async function validarParaCheckout(usuario) {
  const carrinho = await obter(usuario);

  if (carrinho.itens.length === 0) {
    throw erros.regraNegocio('Seu carrinho esta vazio.', 'CARRINHO_VAZIO');
  }

  const problemas = carrinho.itens
    .filter((item) => !item.disponivel)
    .map((item) => ({
      produto_id: item.produto.id,
      nome: item.produto.nome,
      motivo: item.produto.ativo
        ? `Estoque insuficiente: voce pediu ${item.quantidade}, ha ${item.estoque_disponivel}.`
        : 'O produto nao esta mais disponivel.',
    }));

  return { carrinho, problemas, pode_avancar: problemas.length === 0 };
}

export default {
  obter,
  adicionarItem,
  definirQuantidade,
  removerItem,
  limpar,
  validarParaCheckout,
};
