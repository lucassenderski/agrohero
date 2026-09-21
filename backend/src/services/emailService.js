import logger from '../config/logger.js';

/*
 * Ponto unico de integracao com o provedor de e-mail. O projeto nao
 * acopla um provedor externo: em desenvolvimento o envio fica registrado
 * apenas como evento (nunca o token), e a aplicacao pode substituir esta
 * funcao pelo adaptador SMTP/transactional usado pelo ambiente.
 */
export async function enviarEmailRedefinicao({ email, token }) {
  void token;
  logger.info({ email }, 'E-mail de redefinicao de senha enfileirado');
}

export default { enviarEmailRedefinicao };
