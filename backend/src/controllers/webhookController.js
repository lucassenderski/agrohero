import webhookService from '../services/webhookService.js';
import { respostaSucesso } from '../utils/resposta.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/*
 * Controller de webhooks de pagamento.
 *
 * Esta e a UNICA rota do sistema que nao passa por `checkJwt`. Ela nao
 * pode: quem chama e o gateway, que nao tem conta de usuario aqui. A
 * autenticacao dela e outra - a assinatura HMAC do corpo, verificada no
 * service.
 *
 * Por que a verificacao fica no service e nao num middleware: a
 * assinatura precisa do CORPO BRUTO (`req.rawBody`), e um middleware
 * generico de rota teria que conhecer esse detalhe. Manter a verificacao
 * junto da regra que ela protege deixa a dependencia explicita.
 */

/*
 * POST /webhooks/pagamento
 *
 * Responde SEMPRE 200 quando a requisicao e autenticada, mesmo que o
 * pagamento nao tenha sido encontrado ou que nada tenha mudado.
 *
 * Por que 200 e nao 404/409: gateways tratam status fora da faixa 2xx
 * como falha e REENVIAM o evento. Um evento que nunca vai casar (de
 * outro ambiente, por exemplo) ficaria sendo reenviado para sempre,
 * consumindo recurso dos dois lados. Aceitamos e registramos.
 *
 * A excecao sao os erros de verdade - assinatura invalida (403) e falha
 * de reconciliacao (422) -, onde QUEREMOS que o gateway tente de novo
 * mais tarde, porque a situacao pode se resolver.
 */
export const receberPagamento = asyncHandler(async (req, res) => {
  const assinatura = req.headers['x-agrohero-signature'];

  /*
   * Verifica a assinatura sobre os bytes originais ANTES de qualquer
   * processamento. Nada e lido do corpo enquanto a origem nao for
   * provada.
   */
  webhookService.verificarAssinatura(req.rawBody, assinatura);

  const resultado = await webhookService.processarNotificacao({
    corpoJson: req.body,
    identificadorExterno: req.params.identificador ?? null,
  });

  return respostaSucesso(res, resultado, 200);
});

export default { receberPagamento };