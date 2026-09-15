/*
 * Erro controlado da aplicacao.
 *
 * Regra: o erro carrega DUAS mensagens.
 *   - `message`  -> o que o cliente pode ver (segura, sem detalhe interno).
 *   - `detalhes` -> o que fica apenas no log (contexto tecnico).
 *
 * Assim nunca vaza stack trace nem nome de tabela para o usuario final.
 */
export class AppError extends Error {
  constructor(mensagem, statusCode = 400, codigo = 'ERRO', detalhes = null) {
    super(mensagem);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.codigo = codigo;
    this.detalhes = detalhes;
    this.ehOperacional = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/* Atalhos para os casos mais frequentes. Isso padroniza as respostas de erro
 * e evita que cada service invente seu proprio statusCode. */

export const erros = {
  dadosInvalidos: (mensagem = 'Dados invalidos.', detalhes = null) =>
    new AppError(mensagem, 400, 'DADOS_INVALIDOS', detalhes),

  naoAutenticado: (mensagem = 'Nao autenticado.') =>
    new AppError(mensagem, 401, 'NAO_AUTENTICADO'),

  credenciaisInvalidas: (mensagem = 'E-mail ou senha incorretos.') =>
    new AppError(mensagem, 401, 'CREDENCIAIS_INVALIDAS'),

  semPermissao: (mensagem = 'Voce nao tem permissao para esta acao.') =>
    new AppError(mensagem, 403, 'SEM_PERMISSAO'),

  naoEncontrado: (recurso = 'Recurso', detalhes = null) =>
    new AppError(`${recurso} nao encontrado.`, 404, 'NAO_ENCONTRADO', detalhes),

  conflito: (mensagem = 'Registro ja existente.', detalhes = null) =>
    new AppError(mensagem, 409, 'CONFLITO', detalhes),

  regraNegocio: (mensagem, codigo = 'REGRA_NEGOCIO', detalhes = null) =>
    new AppError(mensagem, 422, codigo, detalhes),

  estoqueInsuficiente: (nomeProduto) =>
    new AppError(
      `Estoque insuficiente para "${nomeProduto}".`,
      409,
      'ESTOQUE_INSUFICIENTE',
    ),

  interno: (mensagem = 'Erro interno do servidor.', detalhes = null) =>
    new AppError(mensagem, 500, 'ERRO_INTERNO', detalhes),
};

export default AppError;