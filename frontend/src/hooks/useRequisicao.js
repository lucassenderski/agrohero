import { useCallback, useEffect, useRef, useState } from 'react';
import { ErroApi } from '../services/api.js';

/*
 * Hook para carregar dados de uma funcao assincrona.
 *
 * Existe para nao repetir em cada tela o mesmo trio: estado de
 * carregando, estado de erro e o cuidado de nao gravar no estado depois
 * que o componente saiu da tela (que gera o aviso de memory leak e, pior,
 * atualiza uma tela que ja nao esta la).
 *
 * `dependencias` funciona como no useEffect: mudar o filtro refaz a
 * busca. `recarregar` permite refazer a busca depois de uma acao.
 */

export function useRequisicao(funcao, dependencias = [], { executarImediatamente = true } = {}) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(executarImediatamente);

  /*
   * Guardamos a funcao em uma ref para que `recarregar` tenha
   * identidade estavel. Se a funcao entrasse nas dependencias do
   * useCallback, cada render criaria uma nova versao (as telas passam
   * arrow functions inline) e o efeito entraria em laco infinito.
   */
  const funcaoRef = useRef(funcao);
  funcaoRef.current = funcao;

  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const executar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await funcaoRef.current();
      if (montado.current) setDados(resultado);
      return resultado;
    } catch (falha) {
      if (montado.current) {
        setErro(
          falha instanceof ErroApi
            ? falha
            : new ErroApi('Nao foi possivel carregar os dados.'),
        );
      }
      return null;
    } finally {
      if (montado.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (executarImediatamente) executar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencias);

  return { dados, erro, carregando, recarregar: executar, definirDados: setDados };
}
