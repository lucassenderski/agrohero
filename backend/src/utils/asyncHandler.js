/*
 * Envolve um controller async para que qualquer Promise rejeitada
 * chegue automaticamente ao errorHandler do Express.
 *
 * Sem isso, um `await` que falha em um controller async nao chama o
 * errorHandler: o Express 4 nao captura erros de funcoes async e a
 * requisicao ficaria pendurada ate o timeout.
 */
export function asyncHandler(fn) {
  return function manipulador(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;