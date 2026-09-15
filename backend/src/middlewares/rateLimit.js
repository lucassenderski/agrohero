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