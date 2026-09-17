import agricultorRepository from '../repositories/agricultorRepository.js';
import produtoRepository from '../repositories/produtoRepository.js';
import avaliacaoRepository from '../repositories/avaliacaoRepository.js';
import { erros } from '../utils/AppError.js';
import { lerPaginacao, montarPaginacao, validarPaginaExiste } from '../utils/paginacao.js';

/*
 * Regras de negocio do perfil publico do produtor.
 *
 * Este service e SOMENTE LEITURA e SOMENTE PUBLICO. Nao ha nada aqui que
 * receba o id do usuario logado, porque nada aqui depende de quem esta
 * chamando: qualquer visitante ve o mesmo perfil.
 *
 * A escrita (editar o proprio perfil) continua em usuarioService, que
 * resolve o produtor a partir do token. Manter as duas coisas separadas
 * evita que uma rota publica e uma autenticada compartilhem codigo que
 * assume identidade - que e como IDOR costuma nascer.
 */

/*
 * Remove campos internos antes de devolver o perfil.
 *
 * O repository ja seleciona apenas colunas publicas, entao isto e uma
 * segunda barreira. Existe porque a lista de colunas pode crescer: se
 * alguem adicionar `a.endereco` ao SELECT por engano, o campo chegaria
 * ao cliente sem que ninguem percebesse. Com a lista de campos proibidos
 * explicita, o pior caso e um campo publico faltando - nunca um dado
 * privado vazando.
 *
 * A distincao importa: campo publico faltando e um bug visivel e trivial
 * de corrigir; dado privado vazando e um incidente.
 */
const CAMPOS_PRIVADOS = [
  'usuario_id',
  'endereco',
  'imagem_public_id',
  'usuario_ativo',
  'responsavel_email',
  'responsavel_telefone',
];

function apenasCamposPublicos(perfil) {
  if (!perfil) return null;

  const publico = { ...perfil };
  for (const campo of CAMPOS_PRIVADOS) {
    delete publico[campo];
  }

  /*
   * `usuario_id` sai porque e a chave do usuario dono. Expor esse numero
   * nao da acesso a nada por si so, mas permite correlacionar o produtor
   * com o id de usuario - informacao que nao serve ao visitante.
   */
  return publico;
}

/*
 * Um produtor esta visivel publicamente quando o perfil E o usuario
 * dono estao ativos.
 *
 * As DUAS condicoes, e nao so o perfil: bloquear o login de um produtor
 * (usuarios.ativo = false) precisa tirar a vitrine do ar. Se a checagem
 * olhasse apenas `agricultores.ativo`, suspender um produtor nao teria
 * efeito pratico - ele pararia de entrar no sistema, mas continuaria
 * vendendo pelo marketplace.
 *
 * Esta funcao existe como ponto unico para as tres leituras publicas.
 * Antes dela, a listagem filtrava as duas condicoes no SQL mas o
 * detalhe do perfil verificava apenas `perfil.ativo` - e um produtor
 * suspenso ficava acessivel por URL direta enquanto sumia da lista.
 */
function estaVisivelPublicamente(perfil) {
  return Boolean(perfil) && perfil.ativo === true && perfil.usuario_ativo === true;
}

/* Lista paginada de produtores visiveis. */
export async function listar(filtros) {
  const { pagina, limite, offset } = lerPaginacao(filtros);

  const { itens, total } = await agricultorRepository.listar({
    busca: filtros.busca,
    cidade: filtros.cidade,
    estado: filtros.estado,
    ordenar: filtros.ordenar,
    limite,
    offset,
  });

  const paginacao = montarPaginacao({ pagina, limite, total });

  /*
   * Pagina fora do intervalo devolve 404 com a contagem real, em vez de
   * uma lista vazia. Isso evita a leitura errada de "nenhum produtor
   * cadastrado" quando o marketplace na verdade tem produtores e a
   * pagina pedida nao existe.
   */
  validarPaginaExiste(paginacao, 'Produtor');

  return {
    itens: itens.map(apenasCamposPublicos),
    paginacao,
  };
}

/*
 * Perfil publico completo: dados do produtor + produtos + reputacao.
 *
 * Tudo em uma resposta so, e nao em tres requisicoes, porque o frontend
 * precisa das tres coisas para desenhar a pagina: o cabecalho (perfil),
 * a vitrine (produtos) e a prova social (avaliacoes). Tres round-trips
 * para uma tela so pioraria a experiencia sem ganho nenhum.
 */
export async function obterPerfilPublico(agricultorId, { categoriaId, ordenarProdutos } = {}) {
  const perfil = await agricultorRepository.buscarPorId(agricultorId);

  /*
   * Uma checagem, uma resposta.
   *
   * Se o perfil nao existe, esta suspenso, OU o usuario dono esta
   * bloqueado, o visitante recebe o mesmo 404. Diferenciar os casos
   * ("produtor suspenso") confirmaria a existencia de um perfil que a
   * plataforma decidiu esconder. A distincao existe para o log, nao para
   * a resposta.
   */
  if (!estaVisivelPublicamente(perfil)) {
    throw erros.naoEncontrado('Produtor');
  }

  /*
   * Produtos: primeira pagina, limite enxuto.
   *
   * A vitrine do perfil mostra um recorte; a lista completa fica em
   * /agricultores/:id/produtos, que e paginada de verdade. Carregar todos
   * os produtos de um produtor grande aqui estouraria a resposta.
   */
  const { itens: produtos, total: totalProdutos } = await produtoRepository.listarPublicosDoAgricultor(
    agricultorId,
    { categoriaId, ordenar: ordenarProdutos, limite: 12, offset: 0 },
  );

  /*
   * Reputacao e contagem vem em paralelo.
   *
   * As duas consultas sao independentes, entao nao ha motivo para
   * serializar: com Promise.all o tempo de resposta e o da mais lenta,
   * nao a soma das duas.
   */
  const [reputacao, resumoProdutos] = await Promise.all([
    avaliacaoRepository.resumoDoAgricultor(agricultorId),
    produtoRepository.resumoDoAgricultor(agricultorId),
  ]);

  return {
    ...apenasCamposPublicos(perfil),
    reputacao,
    resumo: {
      produtos_total: resumoProdutos.total,
      produtos_ativos: resumoProdutos.ativos,
      produtos_esgotados: resumoProdutos.esgotados,
    },
    produtos,
    produtos_paginacao: montarPaginacao({ pagina: 1, limite: 12, total: totalProdutos }),
  };
}

/* Produtos publicos de um produtor, paginados. */
export async function listarProdutos(agricultorId, filtros) {
  // Confirma que o produtor existe e esta visivel antes de listar.
  // Sem isso, /agricultores/999/produtos devolveria uma lista vazia com
  // 200, sugerindo que o produtor existe e nao tem produtos.
  const perfil = await agricultorRepository.buscarPorId(agricultorId);

  if (!estaVisivelPublicamente(perfil)) {
    throw erros.naoEncontrado('Produtor');
  }

  const { pagina, limite, offset } = lerPaginacao(filtros);

  const { itens, total } = await produtoRepository.listarPublicosDoAgricultor(agricultorId, {
    categoriaId: filtros.categoria_id,
    ordenar: filtros.ordenar,
    limite,
    offset,
  });

  const paginacao = montarPaginacao({ pagina, limite, total });
  validarPaginaExiste(paginacao, 'Produto');

  return { itens, paginacao };
}

/* Avaliacoes recebidas por um produtor, paginadas. */
export async function listarAvaliacoes(agricultorId, filtros) {
  const perfil = await agricultorRepository.buscarPorId(agricultorId);

  if (!estaVisivelPublicamente(perfil)) {
    throw erros.naoEncontrado('Produtor');
  }

  const { pagina, limite, offset } = lerPaginacao(filtros);

  const { itens, total } = await avaliacaoRepository.listarDoAgricultor(agricultorId, {
    limite,
    offset,
  });

  const paginacao = montarPaginacao({ pagina, limite, total });
  validarPaginaExiste(paginacao, 'Avaliacao');

  const reputacao = await avaliacaoRepository.resumoDoAgricultor(agricultorId);

  return { itens, paginacao, reputacao };
}

export default { listar, obterPerfilPublico, listarProdutos, listarAvaliacoes };
