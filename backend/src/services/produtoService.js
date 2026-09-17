import produtoRepository from '../repositories/produtoRepository.js';
import agricultorRepository from '../repositories/agricultorRepository.js';
import categoriaRepository from '../repositories/categoriaRepository.js';
import { erros } from '../utils/AppError.js';
import { lerPaginacao, montarPaginacao, validarPaginaExiste } from '../utils/paginacao.js';
import logger from '../config/logger.js';

/*
 * Regras de negocio dos produtos.
 *
 * O ponto central deste modulo e PROPRIEDADE. Um agricultor so pode
 * criar, editar e desativar os PROPRIOS produtos. O id do agricultor
 * vem SEMPRE do token (via usuario autenticado), nunca do corpo ou da
 * URL - esse e o requisito 8 do projeto ("nunca confie no ID enviado
 * pelo frontend").
 *
 * O padrao usado aqui e: buscar o produto, comparar o dono, so entao
 * agir. Toda operacao de escrita passa pelo mesmo funil
 * (`carregarProdutoDoDono`), entao nao existe caminho que pule a
 * checagem.
 */

/*
 * Descobre o perfil de agricultor do usuario autenticado.
 *
 * Todo agricultor tem um registro em `agricultores` ligado ao usuario
 * (criado no cadastro, FASE 4). Se nao tiver, o token e valido mas a
 * conta esta incompleta - erro de dados, nao do cliente.
 */
async function obterAgricultorDoUsuario(usuario) {
  const agricultor = await agricultorRepository.buscarPorUsuarioId(usuario.id);

  if (!agricultor) {
    throw erros.regraNegocio(
      'Sua conta de produtor ainda nao tem um perfil de propriedade. Complete o cadastro da propriedade para gerenciar produtos.',
      'PERFIL_AGRICULTOR_AUSENTE',
    );
  }

  /*
   * A conta precisa estar ativa para gerenciar produtos. Um produtor
   * suspenso nao deve conseguir cadastrar item novo enquanto o perfil
   * esta fora do ar.
   */
  if (!agricultor.ativo || !agricultor.usuario_ativo) {
    throw erros.semPermissao(
      'Sua conta de produtor esta suspensa. Fale com o suporte.',
    );
  }

  return agricultor;
}

/*
 * Carrega o produto e verifica se pertence ao agricultor.
 *
 * Os dois erros possiveis sao DIFERENTES de proposito:
 *   - produto inexistente -> 404
 *   - produto de outro dono -> 403
 *
 * Aqui, ao contrario das rotas publicas de produtor, diferenciar os
 * casos e correto: quem chama ja e um agricultor autenticado tentando
 * uma operacao de escrita. Devolver 404 para o caso de outro dono
 * esconderia o motivo real e dificultaria o suporte ("meu produto nao
 * abre"), sem ganho de seguranca - o atacante nao descobre nada que ja
 * nao soubesse, pois ele precisa ser um agricultor ativo para chegar
 * aqui.
 */
async function carregarProdutoDoDono(produtoId, agricultor) {
  const produto = await produtoRepository.buscarPorId(produtoId);

  if (!produto) {
    throw erros.naoEncontrado('Produto');
  }

  if (Number(produto.agricultor_id) !== Number(agricultor.id)) {
    logger.warn(
      {
        produtoId,
        donoId: produto.agricultor_id,
        solicitanteId: agricultor.id,
      },
      'Tentativa de acessar produto de outro agricultor',
    );

    throw erros.semPermissao('Este produto pertence a outro produtor.');
  }

  return produto;
}

/*
 * Valida a categoria informada.
 *
 * Exige categoria EXISTENTE e ATIVA. Categoria desativada nao pode
 * receber produto novo: o admin desativou justamente para tirar aquele
 * grupo do marketplace, e aceitar cadastro ali deixaria o produto
 * invisivel desde o nascimento - confuso para o agricultor, que veria o
 * produto criado mas nunca publicado.
 */
async function validarCategoria(categoriaId) {
  const categoria = await categoriaRepository.buscarPorId(categoriaId);

  if (!categoria) {
    throw erros.dadosInvalidos('A categoria informada nao existe.', [
      { campo: 'categoria_id', mensagem: 'Categoria inexistente.' },
    ]);
  }

  if (!categoria.ativo) {
    throw erros.dadosInvalidos(
      'A categoria informada esta desativada e nao aceita novos produtos.',
      [{ campo: 'categoria_id', mensagem: 'Categoria desativada.' }],
    );
  }

  return categoria;
}

/* Traduz os nomes da API (snake_case) para o repositorio (camelCase). */
function paraRepositorio(dados) {
  return {
    categoriaId: dados.categoria_id,
    nome: dados.nome,
    descricao: dados.descricao,
    preco: dados.preco,
    estoque: dados.estoque,
    unidade: dados.unidade,
    imagemUrl: dados.imagem_url,
  };
}

/*
 * Traduz os filtros da query (snake_case) para o repositorio (camelCase).
 *
 * Este mapeamento e OBRIGATORIO, nao cosmetico. O repositorio desestrutura
 * os nomes em camelCase (`categoriaId`, `precoMin`...); passar o objeto da
 * query direto entregaria `categoria_id` e `preco_min`, que simplesmente
 * nao existem na desestruturacao - o filtro viraria `undefined`, a condicao
 * SQL nao seria adicionada e a API devolveria a lista inteira como se o
 * filtro nao tivesse sido pedido. Falha silenciosa, sem erro nenhum.
 *
 * O padrao ja e usado no agricultorService; manter o mesmo aqui evita que
 * cada modulo invente sua propria convencao.
 */
function paraFiltrosPublicos(filtros) {
  return {
    busca: filtros.busca,
    categoriaId: filtros.categoria_id,
    agricultorId: filtros.agricultor_id,
    cidade: filtros.cidade,
    estado: filtros.estado,
    precoMin: filtros.preco_min,
    precoMax: filtros.preco_max,
    disponivel: filtros.disponivel,
    ordenar: filtros.ordenar,
  };
}

/* Filtros da listagem do proprio agricultor. */
function paraFiltrosDoDono(filtros) {
  return {
    busca: filtros.busca,
    categoriaId: filtros.categoria_id,
    situacao: filtros.situacao,
    ordenar: filtros.ordenar,
  };
}

/*
 * Listagem PUBLICA de produtos (FASE 9).
 *
 * Nao exige autenticacao e aplica a visibilidade: produto, produtor,
 * usuario e categoria precisam estar ativos. Isso e garantido pelo
 * repositorio, que usa a constante `VISIVEL_PUBLICO`.
 */
export async function listarPublicos(filtros) {
  const { pagina, limite, offset } = lerPaginacao(filtros);

  /*
   * Coerencia de faixa de preco conferida na aplicacao, e nao so no
   * schema: `preco_min` e `preco_max` sao validados independentemente,
   * entao um schema sozinho nao percebe `min=100&max=10`. Sem esta
   * checagem a consulta devolveria lista vazia, e o usuario concluiria
   * que nao ha produto - quando o problema e o filtro invertido.
   */
  if (
    filtros.preco_min !== undefined &&
    filtros.preco_max !== undefined &&
    filtros.preco_min > filtros.preco_max
  ) {
    throw erros.dadosInvalidos(
      'O preco minimo nao pode ser maior que o preco maximo.',
      [{ campo: 'preco_min', mensagem: 'Faixa de preco invertida.' }],
    );
  }

  const { itens, total } = await produtoRepository.listarPublicos({
    ...paraFiltrosPublicos(filtros),
    limite,
    offset,
  });

  const paginacao = montarPaginacao({ pagina, limite, total });
  validarPaginaExiste(paginacao, 'Produto');

  return { itens, paginacao };
}

/* Detalhe publico do produto. */
export async function obterPublico(produtoId) {
  const produto = await produtoRepository.buscarPublicoPorId(produtoId);

  if (!produto) {
    // Inexistente, inativo, de produtor suspenso ou de categoria
    // desativada: tudo devolve 404, sem distinguir. A distincao nao
    // serve ao visitante.
    throw erros.naoEncontrado('Produto');
  }

  return produto;
}

/* Lista os produtos do proprio agricultor, incluindo inativos. */
export async function listarMeus(usuario, filtros) {
  const agricultor = await obterAgricultorDoUsuario(usuario);
  const { pagina, limite, offset } = lerPaginacao(filtros);

  const { itens, total } = await produtoRepository.listarDoAgricultor(agricultor.id, {
    ...paraFiltrosDoDono(filtros),
    limite,
    offset,
  });

  const paginacao = montarPaginacao({ pagina, limite, total });
  validarPaginaExiste(paginacao, 'Produto');

  return { itens, paginacao };
}

/* Cria um produto para o agricultor autenticado. */
export async function criar(usuario, dados) {
  const agricultor = await obterAgricultorDoUsuario(usuario);
  await validarCategoria(dados.categoria_id);

  const produto = await produtoRepository.criar({
    agricultorId: agricultor.id,
    ...paraRepositorio(dados),
  });

  logger.info(
    { usuarioId: usuario.id, agricultorId: agricultor.id, produtoId: produto.id },
    'Produto criado',
  );

  return produto;
}

/* Atualiza um produto do agricultor autenticado (PATCH parcial). */
export async function atualizar(usuario, produtoId, dados) {
  const agricultor = await obterAgricultorDoUsuario(usuario);
  await carregarProdutoDoDono(produtoId, agricultor);

  // Se a categoria esta sendo trocada, ela precisa ser valida.
  if (dados.categoria_id !== undefined) {
    await validarCategoria(dados.categoria_id);
  }

  const atualizado = await produtoRepository.atualizar(produtoId, paraRepositorio(dados));

  logger.info({ usuarioId: usuario.id, produtoId }, 'Produto atualizado');

  return atualizado;
}

/* Liga ou desliga a disponibilidade do produto. */
export async function alterarDisponibilidade(usuario, produtoId, ativo) {
  const agricultor = await obterAgricultorDoUsuario(usuario);
  const produto = await carregarProdutoDoDono(produtoId, agricultor);

  if (produto.ativo === ativo) {
    throw erros.regraNegocio(
      ativo
        ? 'Este produto ja esta ativo.'
        : 'Este produto ja esta fora do marketplace.',
      ativo ? 'PRODUTO_JA_ATIVO' : 'PRODUTO_JA_INATIVO',
    );
  }

  const atualizado = await produtoRepository.alterarDisponibilidade(produtoId, ativo);

  logger.info(
    { usuarioId: usuario.id, produtoId, ativo },
    ativo ? 'Produto reativado' : 'Produto desativado',
  );

  return atualizado;
}

/* Soma quantidade ao estoque do produto. */
export async function reporEstoque(usuario, produtoId, quantidade) {
  const agricultor = await obterAgricultorDoUsuario(usuario);
  const produto = await carregarProdutoDoDono(produtoId, agricultor);

  /*
   * Repor estoque de produto desativado nao tem efeito pratico (ele nao
   * esta a venda), e aceitar isso silenciosamente faria o agricultor
   * achar que resolveu a falta de um produto que na verdade esta fora do
   * ar por outro motivo.
   */
  if (!produto.ativo) {
    throw erros.regraNegocio(
      'Ative o produto antes de repor o estoque.',
      'PRODUTO_INATIVO',
    );
  }

  const atualizado = await produtoRepository.reporEstoque(produtoId, quantidade);

  logger.info(
    { usuarioId: usuario.id, produtoId, quantidade, estoqueNovo: atualizado.estoque },
    'Estoque reposto',
  );

  return atualizado;
}

export default {
  listarPublicos,
  obterPublico,
  listarMeus,
  criar,
  atualizar,
  alterarDisponibilidade,
  reporEstoque,
};
