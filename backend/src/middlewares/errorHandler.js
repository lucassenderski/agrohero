import { AppError } from '../utils/AppError.js';
import { respostaErro } from '../utils/resposta.js';
import logger from '../config/logger.js';
import env from '../config/env.js';

/*
 * Tratamento centralizado de erros.
 *
 * Toda resposta de erro da API sai daqui, o que garante:
 *   - formato unico;
 *   - stack trace apenas no log, NUNCA na resposta HTTP;
 *   - mensagens previsiveis para o frontend.
 */

/* Erros conhecidos do PostgreSQL traduzidos para respostas HTTP claras. */
function traduzirErroPostgres(erro) {
  switch (erro.code) {
    case '23505': // unique_violation
      return new AppError(
        'Este registro ja existe.',
        409,
        'CONFLITO',
        erro.detail,
      );
    case '23503': // foreign_key_violation
      return new AppError(
        'Operacao nao permitida: o registro esta em uso.',
        409,
        'REFERENCIA_INVALIDA',
        erro.detail,
      );
    case '23514': // check_violation
      return new AppError(
        'Um dos valores informados viola uma regra do sistema.',
        422,
        'VALOR_INVALIDO',
        erro.detail,
      );
    case '22P02': // invalid_text_representation (ex.: id que nao e numero)
      return new AppError('Identificador invalido.', 400, 'ID_INVALIDO');
    case '23502': // not_null_violation
      return new AppError(
        'Campo obrigatorio nao informado.',
        400,
        'CAMPO_OBRIGATORIO',
        erro.column,
      );
    default:
      return null;
  }
}

/* Erros do express.json() quando o corpo nao e JSON valido. */
function traduzirErroBodyParser(erro) {
  if (erro.type === 'entity.parse.failed') {
    return new AppError('O corpo da requisicao nao e um JSON valido.', 400, 'JSON_INVALIDO');
  }
  if (erro.type === 'entity.too.large') {
    return new AppError('O corpo da requisicao e grande demais.', 413, 'PAYLOAD_MUITO_GRANDE');
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(erro, req, res, next) {
  let erroTratado = erro;

  if (!(erroTratado instanceof AppError)) {
    erroTratado =
      traduzirErroPostgres(erroTratado) ||
      traduzirErroBodyParser(erroTratado) ||
      new AppError('Erro interno do servidor.', 500, 'ERRO_INTERNO', erro.message);
  }

  // Log sempre com contexto tecnico completo (o cliente nao ve isso).
  const contextoLog = {
    err: erro,
    codigo: erroTratado.codigo,
    statusCode: erroTratado.statusCode,
    metodo: req.method,
    rota: req.originalUrl,
    // Guardamos o id do usuario quando houver, para rastrear o problema.
    usuarioId: req.usuario?.id ?? null,
  };

  if (erroTratado.statusCode >= 500) {
    logger.error(contextoLog, 'Erro nao operacional');
  } else {
    logger.warn(contextoLog, 'Erro tratado');
  }

  // Em producao, nunca devolvemos detalhe de erro 500 para o cliente.
  const enviarDetalhes = !env.ehProducao && erroTratado.detalhes;

  return respostaErro(
    res,
    {
      codigo: erroTratado.codigo,
      mensagem: erroTratado.message,
      detalhes:
        enviarDetalhes && Array.isArray(erroTratado.detalhes)
          ? erroTratado.detalhes
          : null,
    },
    erroTratado.statusCode,
  );
}

export default errorHandler;