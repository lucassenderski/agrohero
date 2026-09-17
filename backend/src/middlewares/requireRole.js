import { erros } from '../utils/AppError.js';
import logger from '../config/logger.js';

/*
 * Middleware de autorizacao por papel (role).
 *
 * COMO USAR:
 *   router.post('/',
 *     checkJwt,
 *     requireRole('agricultor'),
 *     validar({ body: criarProdutoSchema }),
 *     produtoController.criar
 *   );
 *
 * SEMPRE use depois de checkJwt. Este middleware depende de req.usuario
 * ja estar preenchido pelo banco; sem checkJwt antes, ele nao tem como
 * saber quem esta chamando.
 */

/*
 * Cria o middleware que exige um dos papeis informados.
 *
 * Recebe uma lista e nao um valor unico porque ha rotas legitimamente
 * compartilhadas, como "ver meus pedidos" (cliente) e "ver pedidos que
 * contem meus produtos" (agricultor).
 */
export function requireRole(...papeisPermitidos) {
  if (papeisPermitidos.length === 0) {
    // Falha cedo, na subida da aplicacao, e nao na primeira requisicao.
    // Uma rota com requireRole() sem argumentos seria uma rota que ninguem
    // acessa, ou pior, uma checagem que passou batido na revisao.
    throw new Error(
      'requireRole precisa de pelo menos um papel. Ex.: requireRole("agricultor").',
    );
  }

  return function autorizacaoMiddleware(req, res, next) {
    // 401 e nao 403 quando nao ha usuario: o problema e autenticacao
    // ausente, nao permissao negada. Isso orienta o frontend a mandar o
    // usuario para o login em vez de mostrar "acesso negado".
    if (!req.usuario) {
      return next(erros.naoAutenticado('Autenticacao necessaria.'));
    }

    if (!papeisPermitidos.includes(req.usuario.tipo)) {
      /*
       * Registramos a tentativa negada. Isso e proposital: uma sequencia
       * de 403 do mesmo usuario em rotas de outro papel e sinal de conta
       * comprometida ou de tentativa de escalacao de privilegio. Sem log,
       * o ataque fica invisivel.
       */
      logger.warn(
        {
          usuarioId: req.usuario.id,
          tipoDoUsuario: req.usuario.tipo,
          papeisExigidos: papeisPermitidos,
          rota: req.originalUrl,
          metodo: req.method,
        },
        'Acesso negado por papel insuficiente',
      );

      return next(erros.semPermissao());
    }

    return next();
  };
}

/*
 * Exige que o usuario seja o DONO do recurso OU administrador.
 *
 * Esta e a protecao central contra IDOR (Insecure Direct Object
 * Reference): o requisito 8 do projeto diz que um agricultor nao pode
 * alterar produto de outro, e um consumidor nao pode ver dados privados
 * de outro consumidor.
 *
 * COMO USAR:
 *   // `fnObterDonoId` recebe req e devolve o usuario_id dono do recurso.
 *   router.put('/:id',
 *     checkJwt,
 *     requireDono(async (req) => (await buscarProduto(req.params.id))?.usuario_id),
 *     produtoController.atualizar
 *   );
 *
 * Regra de ouro: o dono e resolvido no SERVIDOR, a partir do recurso
 * buscado no banco. Nunca comparamos com algo que veio do cliente.
 */
export function requireDono(fnObterUsuarioDonoId) {
  return async function autorizacaoDonoMiddleware(req, res, next) {
    try {
      if (!req.usuario) {
        throw erros.naoAutenticado('Autenticacao necessaria.');
      }

      const donoId = await fnObterUsuarioDonoId(req);

      // Recurso inexistente: 404 antes de qualquer juizo de permissao.
      // Responder 403 aqui confirmaria a existencia do recurso para quem
      // esta sondando IDs - o 404 nao entrega essa informacao.
      if (donoId === null || donoId === undefined) {
        throw erros.naoEncontrado('Recurso');
      }

      const ehDono = String(donoId) === String(req.usuario.id);
      const ehAdmin = req.usuario.tipo === 'administrador';

      if (!ehDono && !ehAdmin) {
        logger.warn(
          {
            usuarioId: req.usuario.id,
            donoDoRecursoId: donoId,
            rota: req.originalUrl,
            metodo: req.method,
          },
          'Tentativa de acesso a recurso de outro usuario',
        );
        throw erros.semPermissao();
      }

      return next();
    } catch (erro) {
      return next(erro);
    }
  };
}

export default { requireRole, requireDono };
