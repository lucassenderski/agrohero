import categoriaRepository from '../repositories/categoriaRepository.js';
import { erros } from '../utils/AppError.js';
import { lerPaginacao, montarPaginacao, validarPaginaExiste } from '../utils/paginacao.js';
import logger from '../config/logger.js';

/*
 * Regras de negocio das categorias.
 *
 * Categorias sao dados de referencia administrados pelo admin. Quem
 * consulta e o publico; quem altera e o administrador. Nao ha regra de
 * "dono" aqui, porque categoria nao pertence a ninguem.
 */

/*
 * Gera o slug a partir do nome.
 *
 * O slug e o identificador legivel usado nas URLs (/categorias/frutas).
 * A normalizacao NFD separa a letra do acento, e o range \u0300-\u036f
 * remove os acentos resultantes - sem isso, "Grãos" viraria "gr-aos".
 *
 * O slug precisa satisfazer o CHECK do banco:
 *   ^[a-z0-9]+(-[a-z0-9]+)*$
 *
 * Por isso removemos tudo que nao for letra, numero ou hifen, e colapsamos
 * hifens repetidos. O `.replace(/^-|-$/g, '')` final evita slug comecando
 * ou terminando em hifen, que o CHECK tambem recusaria.
 */
export function gerarSlug(nome) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/*
 * Garante que o slug e unico, acrescentando um sufixo numerico se preciso.
 *
 * Precisa acontecer ANTES do INSERT: o banco tem indice unico no slug e
 * recusaria a segunda categoria. Deixar o erro do banco estourar daria
 * uma mensagem tecnica ("duplicate key value violates unique constraint
 * categorias_slug_unico"), quando o que interessa ao admin e "ja existe
 * uma categoria com esse nome".
 *
 * O sufixo e derivado do nome original + contador, entao "Frutas" e
 * "Frutas 2" geram slugs distintos sem colidir entre si.
 */
async function reservarSlug(nome, ignorarId = null) {
  const base = gerarSlug(nome);

  if (!base) {
    throw erros.dadosInvalidos(
      'Nao foi possivel gerar um identificador a partir do nome informado.',
    );
  }

  let candidato = base;
  let contador = 1;

  // Limite de seguranca: 50 tentativas cobrem qualquer uso real e evitam
  // laco infinito se a tabela tiver um estado inesperado.
  while (await categoriaRepository.slugEmUso(candidato, ignorarId)) {
    contador += 1;
    candidato = `${base}-${contador}`;

    if (contador > 50) {
      throw erros.conflito(
        'Nao foi possivel gerar um identificador unico para esta categoria.',
      );
    }
  }

  return candidato;
}

/* Lista paginada. `incluirInativas` e controlado pela rota (admin). */
export async function listar({ incluirInativas = false } = {}, filtros = {}) {
  const { pagina, limite, offset } = lerPaginacao(filtros);

  const { itens, total } = await categoriaRepository.listar({
    incluirInativas,
    limite,
    offset,
  });

  const paginacao = montarPaginacao({ pagina, limite, total });
  validarPaginaExiste(paginacao, 'Categoria');

  return { itens, paginacao };
}

/*
 * Detalhe de uma categoria.
 *
 * `incluirInativa` existe porque a rota publica e a administrativa
 * consultam a mesma estrutura: o visitante so ve categoria ativa (senao
 * o filtro do marketplace mostraria categoria que nao pode ser usada),
 * enquanto o admin precisa abrir uma desativada para reativa-la.
 */
export async function obter(idOuSlug, { incluirInativa = false } = {}) {
  /*
   * Aceita id numerico ou slug na mesma rota.
   *
   * `/categorias/frutas` e mais amigavel e melhor para SEO do que
   * `/categorias/3`. Quem decide qual dos dois veio e o formato do
   * parametro, e nao uma rota separada - evita duplicar o controller.
   */
  const buscaPorId = /^\d+$/.test(String(idOuSlug));

  const categoria = buscaPorId
    ? await categoriaRepository.buscarPorId(Number(idOuSlug))
    : await categoriaRepository.buscarPorSlug(String(idOuSlug));

  if (!categoria) {
    throw erros.naoEncontrado('Categoria');
  }

  if (!categoria.ativo && !incluirInativa) {
    // Mesma decisao das rotas de produtor: nao diferenciamos "nao existe"
    // de "existe mas esta desativada" para quem nao e admin.
    throw erros.naoEncontrado('Categoria');
  }

  return categoria;
}

/* Cria uma categoria. Uso exclusivo do administrador. */
export async function criar({ nome, descricao, ativo }, usuarioId) {
  if (await categoriaRepository.nomeEmUso(nome)) {
    throw erros.conflito('Ja existe uma categoria com esse nome.');
  }

  const slug = await reservarSlug(nome);

  const categoria = await categoriaRepository.criar({
    nome,
    slug,
    descricao,
    ativo,
  });

  /*
   * Log de operacao critica. Categoria e dado de referencia: uma
   * alteracao aqui afeta o marketplace inteiro. Registrar quem fez e
   * quando e o minimo para auditoria.
   */
  logger.info(
    { usuarioId, categoriaId: categoria.id, slug },
    'Categoria criada',
  );

  return categoria;
}

/* Atualiza uma categoria. Uso exclusivo do administrador. */
export async function atualizar(id, { nome, descricao, ativo }, usuarioId) {
  const existente = await categoriaRepository.buscarPorId(id);

  if (!existente) {
    throw erros.naoEncontrado('Categoria');
  }

  /*
   * O slug e regerado apenas quando o NOME muda.
   *
   * Se o nome nao mudou, manter o slug atual preserva as URLs ja
   * publicadas e os links que os clientes salvaram. Regerar a cada
   * edicao quebraria /categorias/frutas quando o admin so corrigisse a
   * descricao.
   */
  let slug;
  if (nome && nome !== existente.nome) {
    if (await categoriaRepository.nomeEmUso(nome, id)) {
      throw erros.conflito('Ja existe uma categoria com esse nome.');
    }
    slug = await reservarSlug(nome, id);
  }

  const atualizada = await categoriaRepository.atualizar(id, {
    nome,
    slug,
    descricao,
    ativo,
  });

  logger.info({ usuarioId, categoriaId: id }, 'Categoria atualizada');

  return atualizada;
}

/*
 * Desativa a categoria (exclusao logica).
 *
 * Nao apagamos de verdade por dois motivos:
 *   1. `produtos.categoria_id` tem ON DELETE RESTRICT. Apagar uma
 *      categoria em uso falharia com erro de chave estrangeira.
 *   2. mesmo que nao houvesse produto, apagar perderia a referencia
 *      historica dos pedidos.
 *
 * O retorno informa quantos produtos foram afetados, para o admin
 * confirmar que entendeu o efeito antes de prosseguir.
 */
export async function desativar(id, usuarioId) {
  const existente = await categoriaRepository.buscarPorId(id);

  if (!existente) {
    throw erros.naoEncontrado('Categoria');
  }

  if (!existente.ativo) {
    // Idempotente do ponto de vista do cliente, mas deixamos explicito
    // que nada mudou - em vez de devolver sucesso silencioso.
    throw erros.regraNegocio(
      'Esta categoria ja esta desativada.',
      'CATEGORIA_JA_DESATIVADA',
    );
  }

  const resumo = await categoriaRepository.resumoProdutos(id);

  await categoriaRepository.desativar(id);

  logger.warn(
    { usuarioId, categoriaId: id, produtosAfetados: resumo.ativos },
    'Categoria desativada',
  );

  return {
    id,
    ativo: false,
    produtos_afetados: resumo.ativos,
  };
}

/* Reativa a categoria. */
export async function ativar(id, usuarioId) {
  const existente = await categoriaRepository.buscarPorId(id);

  if (!existente) {
    throw erros.naoEncontrado('Categoria');
  }

  if (existente.ativo) {
    throw erros.regraNegocio(
      'Esta categoria ja esta ativa.',
      'CATEGORIA_JA_ATIVA',
    );
  }

  await categoriaRepository.ativar(id);

  logger.info({ usuarioId, categoriaId: id }, 'Categoria reativada');

  return { id, ativo: true };
}

export default { listar, obter, criar, atualizar, desativar, ativar, gerarSlug };
