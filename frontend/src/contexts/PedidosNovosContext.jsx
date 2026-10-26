import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { listarItensNovosDoProdutor } from '../services/pedidos.js';
import { useAuth } from './AuthContext.jsx';

/*
 * Aviso de pedidos novos do produtor.
 *
 * O produtor precisa saber que entrou um pedido sem ficar atualizando a
 * pagina. Este contexto busca periodicamente a contagem de itens ainda
 * em PENDENTE (`/pedidos/agricultor/novos`) e mantem dois estados:
 *
 *   - `total`: quantos itens novos existem agora. Alimenta o contador no
 *     cabecalho, como o numero de itens do carrinho.
 *   - `naoLidos`: quantos apareceram DESDE A ULTIMA VEZ que o produtor
 *     abriu o painel. E o que decide se o popup abre.
 *
 * POR QUE OS DOIS NUMEROS SÃO DIFERENTES
 *
 * O contador pode ficar em "3" (tres itens pendentes), mas o popup so
 * deve abrir quando CHEGA pedido novo - nao a cada ciclo de polling. Se
 * a condicao fosse `total > 0`, o popup reapareceria a cada 30 s, o que
 * e insuportavel. Por isso a comparacao e contra a ultima contagem
 * vista: so um AUMENTO dispara o aviso.
 *
 * O `naoLidos` zera quando o produtor abre a tela de pedidos (ver
 * `marcarComoVisto`). Sem isso, o popup reapareceria toda vez que o
 * componente remontasse.
 *
 * O CONTADOR E O POPUP MEDEM COISAS DIFERENTES
 *
 * O contador do cabecalho mostra `total` - quantos itens PENDENTE ha
 * agora, como o numero do carrinho. Ele cai quando o produtor avanca os
 * itens, e nao quando ele apenas abre a tela: abrir a lista nao resolve
 * pedido nenhum. Ja o popup depende de `naoLidos` e so aparece quando
 * CHEGA pedido novo.
 *
 * POR QUE O POLLING É SÓ PARA O PRODUTOR
 *
 * Cliente e admin nao tem esse aviso. Manter uma requisicao periodica
 * para quem nao usa o recurso seria gastar a cota do limitador da API a
 * toa - e o limitador geral e de 300 requisicoes por 15 min, que uma aba
 * esquecida aberta consumiria sozinha se o intervalo fosse curto.
 *
 * O PRIMEIRO CARREGAMENTO NAO AVISA
 *
 * Ao logar, `naoLidos` comeca em 0 mesmo que ja existam pedidos
 * pendentes. O popup na tela inicial seria um susto a cada login. O que
 * o produtor quer e saber do que CHEGOU enquanto ele estava fora - e
 * para isso o `total` ja aparece no contador, sem interromper.
 */

const PedidosNovosContext = createContext(null);

/*
 * Intervalo do polling.
 *
 * 30 s equilibra "percebo rapido" com "nao gasto a cota": sao 2
 * requisicoes por minuto, 30 em 15 min - bem abaixo do limite geral de
 * 300. Um intervalo de 5 s daria a sensacao de tempo real, mas gastaria
 * 180 requisicoes na mesma janela por aba.
 *
 * O valor e configuravel para o teste conseguir disparar um ciclo sem
 * esperar 30 s de relogio real. Em producao ninguem passa a prop, entao
 * vale o padrao.
 */
const INTERVALO_POLLING_MS = 30000;

export function PedidosNovosProvider({ children, intervaloMs = INTERVALO_POLLING_MS }) {
  const { autenticado, ehAgricultor } = useAuth();
  const [total, setTotal] = useState(0);
  const [itens, setItens] = useState([]);
  const [naoLidos, setNaoLidos] = useState(0);

  /*
   * Ultima contagem conhecida, em ref e nao em estado: ela e comparada
   * DENTRO do proprio ciclo de busca, e usa-la como estado obrigaria a
   * incluir `total` nas dependencias do efeito - o que recriaria o
   * intervalo a cada atualizacao e reiniciaria a contagem do timer.
   */
  const ultimaContagem = useRef(null);

  const podeAcompanhar = autenticado && ehAgricultor;

  const buscar = useCallback(async (avisar = true) => {
    const dados = await listarItensNovosDoProdutor();
    const novoTotal = Number(dados?.total) || 0;

    setTotal(novoTotal);
    setItens(dados?.itens || []);

    /*
     * `ultimaContagem.current === null` e o primeiro ciclo: registra a
     * contagem sem avisar, para o popup nao abrir no login.
     *
     * `avisar = false` e usado quando a propria tela de pedidos recarrega
     * o total: ali o produtor ja esta olhando os pedidos, e abrir o popup
     * por cima seria redundante.
     */
    if (avisar && ultimaContagem.current !== null && novoTotal > ultimaContagem.current) {
      setNaoLidos(novoTotal - ultimaContagem.current);
    }

    ultimaContagem.current = novoTotal;
    return novoTotal;
  }, []);

  /* Recarga manual, sem disparar o popup (ver a tela de pedidos). */
  const recarregar = useCallback(() => buscar(false), [buscar]);

  /*
   * Ao entrar (ou trocar de conta), busca uma vez e zera o aviso. Ao
   * sair, limpa tudo - senao o proximo produtor veria o contador do
   * anterior por um instante.
   */
  useEffect(() => {
    if (!podeAcompanhar) {
      ultimaContagem.current = null;
      setTotal(0);
      setItens([]);
      setNaoLidos(0);
      return undefined;
    }

    let cancelado = false;

    const ciclo = async () => {
      try {
        await buscar();
      } catch {
        /*
         * Falha silenciosa de proposito: o aviso e acessorio. Uma rede
         * instavel nao pode encher a tela de erro nem derrubar a
         * navegacao - o produtor continua vendo os pedidos pela tela
         * normal, que trata o proprio erro.
         */
      }
    };

    if (!cancelado) ciclo();

    const timer = setInterval(() => {
      if (!cancelado) ciclo();
    }, intervaloMs);

    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [podeAcompanhar, buscar, intervaloMs]);

  /* O produtor abriu a tela de pedidos: o aviso cumpriu o papel. */
  const marcarComoVisto = useCallback(() => {
    setNaoLidos(0);
  }, []);

  const valor = useMemo(
    () => ({
      total,
      itens,
      naoLidos,
      temNovos: total > 0,
      mostrarAviso: naoLidos > 0,
      recarregar,
      marcarComoVisto,
    }),
    [total, itens, naoLidos, recarregar, marcarComoVisto],
  );

  return (
    <PedidosNovosContext.Provider value={valor}>{children}</PedidosNovosContext.Provider>
  );
}

export function usePedidosNovos() {
  const contexto = useContext(PedidosNovosContext);
  if (!contexto) {
    throw new Error('usePedidosNovos precisa ser usado dentro de <PedidosNovosProvider>.');
  }
  return contexto;
}
