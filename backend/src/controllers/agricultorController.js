import agricultorService from '../services/agricultorService.js';
import { respostaSucesso } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller do perfil publico do produtor.
 *
 * Rotas publicas: nao ha checkJwt, logo nao ha req.usuario. Isso e
 * proposital e nao um esquecimento - o requisito 13 diz que o consumidor
 * acessa o perfil do produtor, e a vitrine precisa ser visivel para quem
 * ainda nao tem conta (e a principal porta de entrada do marketplace).
 *
 * O controller nao tem regra de negocio: le a entrada validada, chama o
 * service e monta a resposta.
 */

/* GET /agricultores */
export const listar = asyncHandler(async (req, res) => {
  const filtros = req.dadosValidados.query;

  const { itens, paginacao } = await agricultorService.listar(filtros);

  return respostaSucesso(res, itens, 200, paginacao);
});

/* GET /agricultores/:id */
export const obter = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const { categoria_id: categoriaId, ordenar } = req.dadosValidados.query ?? {};

  const perfil = await agricultorService.obterPerfilPublico(id, {
    categoriaId,
    ordenarProdutos: ordenar,
  });

  return respostaSucesso(res, perfil);
});

/* GET /agricultores/:id/produtos */
export const listarProdutos = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const filtros = req.dadosValidados.query;

  const { itens, paginacao } = await agricultorService.listarProdutos(id, filtros);

  return respostaSucesso(res, itens, 200, paginacao);
});

/* GET /agricultores/:id/avaliacoes */
export const listarAvaliacoes = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;
  const filtros = req.dadosValidados.query;

  const { itens, paginacao, reputacao } = await agricultorService.listarAvaliacoes(id, filtros);

  return respostaSucesso(res, { avaliacoes: itens, reputacao }, 200, paginacao);
});

/*
 * GET /agricultores/:id/logo
 *
 * Unica rota do projeto que NAO responde no envelope JSON: o corpo sao os
 * bytes da imagem. Isso e proposital - o `<img src>` do navegador aponta
 * direto para esta URL, e envolver a imagem em JSON exigiria converter
 * base64 no frontend, o que inflaria o payload em ~33% e impediria o
 * cache nativo do navegador.
 *
 * A resposta e publica e cacheavel: `Cache-Control` + `ETag` significam
 * que o navegador reaproveita a imagem sem tocar a API de novo. Sem isso,
 * uma lista com 20 produtores faria 20 requisicoes ao banco a cada
 * carregamento de pagina.
 */
export const obterLogo = asyncHandler(async (req, res) => {
  const { id } = req.dadosValidados.params;

  const logo = await agricultorService.obterLogo(id);

  /*
   * ETag derivado do id + momento da atualizacao.
   *
   * Nao usamos hash dos bytes: o `atualizado_em` muda exatamente quando a
   * logo muda, entao ja e um identificador de versao suficiente, e evita
   * ler/hashear a imagem so para montar o cabecalho.
   */
  const etag = `"logo-${id}-${new Date(logo.atualizadoEm).getTime()}"`;

  if (req.headers['if-none-match'] === etag) {
    // 304 sem corpo: o navegador usa a copia que ja tem.
    return res.status(304).end();
  }

  res.set({
    'Content-Type': logo.mime,
    'Content-Length': logo.bytes.length,
    ETag: etag,
    // `public` porque a imagem e publica; `max-age` de 1 dia equilibra
    // frescor e economia. `immutable` seria mentira aqui: a logo pode ser
    // trocada a qualquer momento.
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });

  return res.send(logo.bytes);
});

export default { listar, obter, listarProdutos, listarAvaliacoes, obterLogo };
