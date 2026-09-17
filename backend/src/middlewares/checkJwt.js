import { extrairTokenDoCabecalho, verificarToken } from '../utils/token.js';
import usuarioRepository from '../repositories/usuarioRepository.js';
import { erros } from '../utils/AppError.js';
import env from '../config/env.js';
import logger from '../config/logger.js';

/*
 * Middleware de autenticacao.
 *
 * DECISAO CENTRAL: este middleware NAO confia no conteudo do token para
 * decidir quem e o usuario. Ele usa o token apenas para descobrir o ID, e
 * entao busca o usuario no banco.
 *
 * Por que nao confiar no token:
 *   - um usuario bloqueado continuaria navegando ate o token expirar;
 *   - se o tipo dele mudasse, o token antigo manteria as permissoes velhas;
 *   - um usuario removido do banco continuaria "existindo" para a API.
 *
 * O custo e uma consulta ao banco por requisicao autenticada. E um preco
 * baixo por autorizacao sempre atualizada - e, se virar gargalo, a saida
 * correta e cache com invalidacao, nao voltar a confiar no token.
 *
 * O que este middleware garante para as rotas seguintes:
 *   - req.usuario existe, veio do banco e esta ativo;
 *   - req.usuario.id e a UNICA fonte de identidade confiavel da requisicao.
 */
export async function checkJwt(req, res, next) {
  try {
    const token = extrairTokenDoCabecalho(req.headers.authorization);

    if (!token) {
      throw erros.naoAutenticado('Token de acesso nao informado.');
    }

    const payload = verificarToken(token);
    const usuario = await usuarioRepository.buscarPorId(payload.sub);

    if (!usuario) {
      // Token valido, mas de um usuario que nao existe mais. Tratamos como
      // nao autenticado: a credencial aponta para algo que sumiu.
      logger.warn({ usuarioId: payload.sub }, 'Token de usuario inexistente');
      throw erros.naoAutenticado('Sessao invalida. Faca login novamente.');
    }

    if (!usuario.ativo) {
      // 403 e nao 401: a credencial e valida, o acesso e que foi revogado.
      // Isso ajuda o frontend a distinguir "faca login" de "conta suspensa".
      logger.warn({ usuarioId: usuario.id }, 'Acesso de conta bloqueada');
      throw erros.semPermissao('Esta conta esta bloqueada.');
    }

    /*
     * Disponibiliza o usuario para o resto da requisicao.
     *
     * A partir daqui, `req.usuario.id` e a fonte de verdade da identidade.
     * Nenhum controller deve usar `req.params.id` ou `req.body.usuario_id`
     * para decidir de quem e um recurso.
     */
    req.usuario = usuario;

    return next();
  } catch (erro) {
    return next(erro);
  }
}

/*
 * Middleware opcional de autenticacao.
 *
 * Mesma logica, mas nao falha quando nao ha token: apenas segue sem
 * req.usuario. Serve para rotas publicas que mudam de comportamento
 * quando o visitante esta logado (ex.: listagem de produtos mostrando
 * os favoritos, ou o proprio produto marcado como "seu").
 *
 * Existe para evitar duplicar a logica de leitura do token em rotas
 * publicas - o que costuma acabar em uma copia que esquece de checar
 * `ativo`.
 */
export async function checkJwtOpcional(req, res, next) {
  const token = extrairTokenDoCabecalho(req.headers.authorization);

  if (!token) {
    req.usuario = null;
    return next();
  }

  // Com token presente, a validacao e a mesma da rota protegida: um token
  // invalido em rota publica tambem deve ser recusado, senao o cliente
  // acharia que esta autenticado quando nao esta.
  return checkJwt(req, res, next);
}

export default { checkJwt, checkJwtOpcional };
