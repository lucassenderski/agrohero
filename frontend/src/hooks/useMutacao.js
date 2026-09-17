import { useCallback, useEffect, useState } from 'react';

/*
 * Hook para operacoes de escrita (criar, editar, remover).
 *
 * Separado do useRequisicao porque o ciclo de vida e outro: aqui nao ha
 * "carregar ao abrir a tela", ha "executar quando o usuario clicar".
 * Mantem `enviando` para desabilitar o botao e evitar o duplo clique -
 * que, em endpoints de acao, significa criar o pedido duas vezes.
 */

export function useMutacao(funcao, { aoConcluir, aoFalhar } = {}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  const aoConcluirRef = useCallback((r) => aoConcluir?.(r), [aoConcluir]);
  const aoFalharRef = useCallback((e) => aoFalhar?.(e), [aoFalhar]);

  const executar = useCallback(
    async (...argumentos) => {
      setEnviando(true);
      setErro(null);
      try {
        const resultado = await funcao(...argumentos);
        await aoConcluirRef(resultado);
        return { ok: true, dados: resultado };
      } catch (falha) {
        setErro(falha);
        await aoFalharRef(falha);
        return { ok: false, erro: falha };
      } finally {
        setEnviando(false);
      }
    },
    [funcao, aoConcluirRef, aoFalharRef],
  );

  return { executar, enviando, erro, limparErro: () => setErro(null) };
}

/*
 * Hook de campo de formulario com erro por campo.
 *
 * Devolve os valores, os erros e um `alterar` que ja limpa o erro do
 * campo ao digitar: manter o erro antigo enquanto o usuario corrige faz
 * a mensagem parecer que nao muda.
 */
export function useFormulario(valoresIniciais) {
  const [valores, setValores] = useState(valoresIniciais);
  const [erros, setErros] = useState({});

  const alterar = useCallback((campo, valor) => {
    setValores((atual) => ({ ...atual, [campo]: valor }));
    setErros((atual) => {
      if (!atual[campo]) return atual;
      const novo = { ...atual };
      delete novo[campo];
      return novo;
    });
  }, []);

  const alterarVarios = useCallback((novos) => {
    setValores((atual) => ({ ...atual, ...novos }));
  }, []);

  const reiniciar = useCallback(
    (novos = valoresIniciais) => {
      setValores(novos);
      setErros({});
    },
    [valoresIniciais],
  );

  return { valores, erros, setErros, alterar, alterarVarios, reiniciar };
}

/* Detecta a media query, para a interface decidir o que renderizar. */
export function useMediaQuery(consulta) {
  const [combina, setCombina] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(consulta).matches : false,
  );

  useEffect(() => {
    const lista = window.matchMedia(consulta);
    const ouvir = (evento) => setCombina(evento.matches);
    setCombina(lista.matches);
    lista.addEventListener('change', ouvir);
    return () => lista.removeEventListener('change', ouvir);
  }, [consulta]);

  return combina;
}
