import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import './ui.css';

/*
 * Regiao de notificacoes.
 *
 * `aria-live="polite"` faz o leitor de tela anunciar a mensagem sem
 * interromper o que estiver sendo lido. Sem isso, "Pedido realizado com
 * sucesso" ficaria invisivel para quem nao ve a tela.
 */
export default function Notificacoes() {
  const { notificacoes, remover } = useNotificacao();

  if (notificacoes.length === 0) return null;

  return (
    <div className="notificacoes" role="region" aria-live="polite" aria-label="Notificacoes">
      {notificacoes.map((notificacao) => (
        <div key={notificacao.id} className={`notificacao notificacao--${notificacao.tipo}`}>
          <span>{notificacao.mensagem}</span>
          <button
            type="button"
            className="notificacao__fechar"
            onClick={() => remover(notificacao.id)}
            aria-label="Fechar notificacao"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
