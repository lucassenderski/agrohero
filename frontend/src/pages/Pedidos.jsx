import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listarMeusPedidos, cancelarPedido } from '../services/pedidos.js';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import OrderCard from '../components/OrderCard.jsx';
import { Carregando, MensagemErro, EstadoVazio, Paginacao } from '../components/ui.jsx';
import '../components/pedido.css';

const POR_PAGINA = 10;

/*
 * Meus pedidos (consumidor).
 *
 * A pagina filtra por status na propria tela. Quando o volume crescer,
 * isso vira um parametro da API - a lista do consumidor tende a ser
 * curta no inicio, e paginar antes de precisar complicaria a tela sem
 * ganho.
 */
export default function Pedidos() {
  const { sucesso, erro: notificarErro } = useNotificacao();
  const [pedidos, setPedidos] = useState([]);
  const [paginacao, setPaginacao] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [cancelandoId, setCancelandoId] = useState(null);

  async function carregar(paginaAlvo = pagina) {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await listarMeusPedidos({ pagina: paginaAlvo, limite: POR_PAGINA });
      setPedidos(resposta.pedidos || []);
      setPaginacao(resposta.paginacao || null);
    } catch (falha) {
      setErro(falha);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(pagina);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina]);

  async function cancelar(pedido) {
    if (!window.confirm(`Cancelar o pedido #${pedido.id}? Esta acao nao pode ser desfeita.`)) {
      return;
    }

    setCancelandoId(pedido.id);
    try {
      await cancelarPedido(pedido.id);
      sucesso('Pedido cancelado.');
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel cancelar o pedido.');
    } finally {
      setCancelandoId(null);
    }
  }

  if (carregando && pedidos.length === 0) {
    return <Carregando texto="Carregando seus pedidos..." />;
  }

  return (
    <div className="container pedidos">
      <h1>Meus pedidos</h1>

      {erro && <MensagemErro erro={erro} aoTentarNovamente={() => carregar()} />}

      {!erro && pedidos.length === 0 && (
        <EstadoVazio
          titulo="Voce ainda nao fez pedidos"
          descricao="Quando comprar, seus pedidos aparecem aqui com o status atualizado."
          acao={
            <Link to="/produtos" className="botao botao--primario">
              Ver produtos
            </Link>
          }
        />
      )}

      {pedidos.length > 0 && (
        <>
          <ul className="pedidos__lista">
            {pedidos.map((pedido) => (
              <OrderCard
                key={pedido.id}
                pedido={pedido}
                aoCancelar={cancelar}
                cancelando={cancelandoId === pedido.id}
              />
            ))}
          </ul>

          <Paginacao paginacao={paginacao} aoMudarPagina={setPagina} />
        </>
      )}
    </div>
  );
}