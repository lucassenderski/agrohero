import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/*
 * Notificacoes (toasts).
 *
 * Um lugar so para "Produto adicionado ao carrinho." e afins. Sem isso
 * cada tela inventa seu proprio alerta, e o resultado e uma mistura de
 * `alert()` bloqueante com mensagens que somem sozinhas.
 *
 * As mensagens tem id proprio porque duas iguais ("Estoque
 * insuficiente.") podem estar na tela ao mesmo tempo: usar a string
 * como chave faria a segunda substituir a primeira.
 */

const NotificacaoContext = createContext(null);

const DURACAO_PADRAO = 4000;

export function NotificacaoProvider({ children }) {
  const [notificacoes, setNotificacoes] = useState([]);
  const proximoId = useRef(1);

  const remover = useCallback((id) => {
    setNotificacoes((atual) => atual.filter((n) => n.id !== id));
  }, []);

  const notificar = useCallback(
    (mensagem, { tipo = 'sucesso', duracao = DURACAO_PADRAO } = {}) => {
      const id = proximoId.current;
      proximoId.current += 1;

      setNotificacoes((atual) => [...atual, { id, mensagem, tipo }]);

      if (duracao > 0) {
        setTimeout(() => remover(id), duracao);
      }
      return id;
    },
    [remover],
  );

  const valor = useMemo(
    () => ({
      notificacoes,
      notificar,
      remover,
      sucesso: (mensagem, opcoes) => notificar(mensagem, { ...opcoes, tipo: 'sucesso' }),
      erro: (mensagem, opcoes) =>
        notificar(mensagem, { ...opcoes, tipo: 'erro', duracao: opcoes?.duracao ?? 6000 }),
      info: (mensagem, opcoes) => notificar(mensagem, { ...opcoes, tipo: 'info' }),
      aviso: (mensagem, opcoes) => notificar(mensagem, { ...opcoes, tipo: 'aviso' }),
    }),
    [notificacoes, notificar, remover],
  );

  return (
    <NotificacaoContext.Provider value={valor}>{children}</NotificacaoContext.Provider>
  );
}

export function useNotificacao() {
  const contexto = useContext(NotificacaoContext);
  if (!contexto) {
    throw new Error('useNotificacao precisa ser usado dentro de <NotificacaoProvider>.');
  }
  return contexto;
}
