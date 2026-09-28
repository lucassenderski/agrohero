import { useEffect, useState } from 'react';
import { obterSaude } from '../services/saude.js';

/*
 * Status da API no rodape, bem discreto.
 *
 * Sem polling: e informacao de infraestrutura, nao um painel de
 * monitoramento. Uma consulta por montagem do layout basta, e uma falha
 * de rede aqui nunca pode virar erro visivel - o rodape apenas some com
 * a linha de status.
 */
export default function SaudeRodape() {
  const [saude, setSaude] = useState(null);

  useEffect(() => {
    let ativo = true;
    obterSaude()
      .then((dados) => {
        if (ativo) setSaude(dados);
      })
      .catch(() => {
        /* Silencioso de proposito: status indisponivel nao e erro do usuario. */
      });
    return () => {
      ativo = false;
    };
  }, []);

  if (!saude) return null;

  const banco = saude.banco === 'ok' ? 'PostgreSQL: ok' : 'PostgreSQL: indisponivel';

  return (
    <div className="footer__status">
      <span>API: {saude.api}</span>
      <span>{banco}</span>
      <span>Ambiente: {saude.ambiente}</span>
      <span>Latência do banco: {saude.latenciaBancoMs} ms</span>
    </div>
  );
}
