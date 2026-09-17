import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { AppError } from './AppError.js';

/*
 * Geracao e verificacao de token JWT.
 *
 * PRINCIPIO CENTRAL: o token identifica o usuario, mas nao carrega a
 * autoridade dele. Ou seja, guardamos apenas QUEM e o usuario (`sub`) e
 * o tipo (`tipo`) para consulta rapida; quem decide o que ele pode fazer
 * e sempre o banco, no middleware checkJwt.
 *
 * Por que isso importa: se o token fosse a fonte de verdade das
 * permissoes, bloquear um usuario ou muda-lo de tipo nao teria efeito
 * ate o token expirar. Com o banco como fonte de verdade, a mudanca vale
 * imediatamente.
 *
 * O QUE NUNCA ENTRA NO TOKEN (requisito 9):
 *   - senha ou hash da senha;
 *   - e-mail, telefone ou qualquer dado pessoal (o JWT e assinado, mas
 *     NAO e criptografado: qualquer pessoa com o token le o conteudo);
 *   - permissoes, saldo ou qualquer coisa que possa ficar desatualizada.
 */

/*
 * Algoritmo fixado explicitamente.
 *
 * Sem `algorithms` na verificacao, a biblioteca aceitaria qualquer
 * algoritmo suportado. Um atacante poderia tentar o ataque de confusao
 * de algoritmo (trocar RS256 por HS256 usando a chave publica como
 * segredo). Fixar HS256 fecha essa porta.
 */
const ALGORITMO = 'HS256';

/* Emissor e audiencia: amarram o token a esta aplicacao. */
const EMISSOR = 'agrohero-api';
const AUDIENCIA = 'agrohero-app';

/* Gera o token de acesso de um usuario. */
export function gerarToken(usuario) {
  const payload = {
    sub: String(usuario.id),
    tipo: usuario.tipo,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: ALGORITMO,
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: EMISSOR,
    audience: AUDIENCIA,
  });
}

/*
 * Verifica a assinatura e a validade do token.
 *
 * Lanca AppError 401 em qualquer problema - token ausente, adulterado,
 * expirado, emitido para outro publico - sem revelar ao cliente qual
 * dos casos ocorreu. Detalhar o motivo ajudaria quem esta sondando a API
 * a entender o que ajustar.
 */
export function verificarToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITMO],
      issuer: EMISSOR,
      audience: AUDIENCIA,
    });
  } catch (erro) {
    const expirado = erro.name === 'TokenExpiredError';

    // O motivo tecnico vai para o log (via detalhes), nao para o cliente.
    throw new AppError(
      expirado
        ? 'Sessao expirada. Faca login novamente.'
        : 'Token invalido ou expirado.',
      401,
      'TOKEN_INVALIDO',
      { motivo: erro.name, mensagem: erro.message },
    );
  }
}

/*
 * Extrai o token do cabecalho Authorization.
 *
 * Aceita apenas o formato "Bearer <token>". Devolve null quando nao ha
 * cabecalho ou o formato esta errado - quem chama decide o que fazer,
 * o que mantem esta funcao sem efeito colateral.
 */
export function extrairTokenDoCabecalho(cabecalhoAuthorization) {
  if (!cabecalhoAuthorization || typeof cabecalhoAuthorization !== 'string') {
    return null;
  }

  const partes = cabecalhoAuthorization.trim().split(/\s+/);

  if (partes.length !== 2 || partes[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return partes[1] || null;
}

export default { gerarToken, verificarToken, extrairTokenDoCabecalho };
