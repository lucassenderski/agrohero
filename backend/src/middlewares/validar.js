import { validarComSchema } from '../utils/validacao.js';

/*
 * Middleware de validacao.
 *
 * COMO USAR (nas rotas):
 *
 *   router.post('/',
 *     checkJwt,
 *     requireRole('agricultor'),
 *     validar({ body: criarProdutoSchema }),
 *     produtoController.criar
 *   );
 *
 * COMO LER O RESULTADO (no controller):
 *
 *   const dados = req.dadosValidados.body;
 *
 * Decisao importante: os dados validados NAO substituem req.body.
 * Eles ficam em `req.dadosValidados`. O motivo e evitar a ilusao de que
 * req.body esta seguro - se sobrescrevessemos, um controller poderia ler
 * req.body.dadosQualquerValor e achar que passou pela validacao. Com um
 * nome diferente, fica explicito na leitura do codigo que aquele valor
 * foi validado.
 *
 * O que este middleware garante para o resto da aplicacao:
 *   - tipos convertidos (preco "8.50" -> 8.50);
 *   - normalizacao aplicada (email em minusculas, trim nos textos);
 *   - campos nao declarados no schema sao REMOVIDOS (nunca chegam ao
 *     controller), o que fecha a porta para mass assignment - alguem
 *     enviar { "tipo": "administrador" } no cadastro nao tem efeito.
 */
export function validar(esquemas = {}) {
  const { body, params, query } = esquemas;

  return function validacaoMiddleware(req, res, next) {
    try {
      const validados = {};

      if (body) validados.body = validarComSchema(body, req.body ?? {});
      if (params) validados.params = validarComSchema(params, req.params ?? {});
      if (query) validados.query = validarComSchema(query, req.query ?? {});

      // Disponibiliza o resultado normalizado para o controller.
      req.dadosValidados = validados;

      return next();
    } catch (erro) {
      // O AppError lancado pela validacao ja tem statusCode 400 e a lista
      // de campos com problema. So repassamos para o errorHandler.
      return next(erro);
    }
  };
}

export default validar;