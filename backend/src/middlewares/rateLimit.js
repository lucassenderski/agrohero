import rateLimit from 'express-rate-limit';
import env from '../config/env.js';

/*
 * Limitador de requisicoes.
 *
 * Primeira linha de defesa contra forca bruta e abuso de API.
 * O limitador de login e propositalmente muito mais restrito que o geral:
 * e na porta de entrada que um ataque de senha acontece.
 */

const mensagemPadrao = {
  sucesso: false,
  erro: {
    codigo: 'MUITAS_REQUISICOES',
    mensagem: 'Muitas requisicoes. Tente novamente mais tarde.',
  },
};

/* Limite geral aplicado a toda a API. */
export const limiteGeral = rateLimit({
  windowMs: env.RATE_LIMIT_JANELA_MINUTOS * 60 * 1000,
  max: env.RATE_LIMIT_MAX_REQUISICOES,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensagemPadrao,
  // Em testes, desligamos o limite para nao gerar falso negativo.
  skip: (req) => env.ehTeste || ehRotaDeImagem(req),
});

/*
 * Rotas cujo corpo e uma IMAGEM, nao JSON de negocio.
 *
 * Por que ficam fora do limite geral: uma pagina da lista de produtores
 * dispara uma requisicao por logo (o <img> aponta para o endpoint). Vinte
 * produtores seriam 20 requisicoes - e o produtor que abrisse a vitrine
 * algumas vezes esgotaria a cota de 300/15min, recebendo 429 ao navegar,
 * sem ter feito nada de errado. O mesmo motivo que ja tirou a
 * documentacao (Swagger) de tras do limitador: imagem nao e trafego de
 * negocio.
 *
 * A protecao nao desaparece - ela vira um limite proprio, bem mais
 * generoso (ver `limiteImagens`).
 *
 * ATENCAO ao caminho comparado: este middleware e montado em `/api`
 * (app.use('/api', limiteGeral)), e `req.path` ja vem SEM esse prefixo -
 * a requisicao /api/v1/agricultores/12/logo chega aqui como
 * `/v1/agricultores/12/logo`. Comparar com `/api/...` aqui nunca casaria,
 * e a imagem voltaria a consumir a cota da API sem nenhum aviso. Por isso
 * o regex comeca em `/v1`.
 */
function ehRotaDeImagem(req) {
  return /^\/v1\/agricultores\/\d+\/logo\/?$/.test(req.path);
}

/*
 * Limite dedicado das imagens.
 *
 * Alto o bastante para uma pagina cheia de cards e para o cache do
 * navegador trabalhar (apos o primeiro carregamento, o ETag faz o
 * navegador nem chegar aqui), e baixo o bastante para ainda conter um
 * script que varra ids em sequencia. Sem limite nenhum, o endpoint seria
 * uma porta aberta para enumerar o banco.
 */
export const limiteImagens = rateLimit({
  windowMs: env.RATE_LIMIT_JANELA_MINUTOS * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensagemPadrao,
  skip: () => env.ehTeste,
});

/* Limite estrito para login/cadastro (defesa contra forca bruta). */
export const limiteLogin = rateLimit({
  windowMs: env.RATE_LIMIT_JANELA_MINUTOS * 60 * 1000,
  max: env.RATE_LIMIT_MAX_LOGIN,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    sucesso: false,
    erro: {
      codigo: 'MUITAS_TENTATIVAS',
      mensagem: 'Muitas tentativas de login. Aguarde alguns minutos.',
    },
  },
  skip: () => env.ehTeste,
});

export default { limiteGeral, limiteLogin };