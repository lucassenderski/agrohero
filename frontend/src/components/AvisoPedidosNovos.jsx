import { useNavigate } from 'react-router-dom';
import { Modal } from './ui.jsx';
import { usePedidosNovos } from '../contexts/PedidosNovosContext.jsx';
import { formatarMoeda, formatarQuantidade } from '../utils/formato.js';
import './AvisoPedidosNovos.css';

/*
 * Aviso de pedidos novos.
 *
 * Aparece quando o polling do `PedidosNovosProvider` detecta um AUMENTO
 * na contagem de itens PENDENTE. Nao abre a cada ciclo: quem decide e o
 * `mostrarAviso`, que so fica verdadeiro quando chegou pedido desde a
 * ultima vez que o produtor abriu o painel.
 *
 * Fecha em dois caminhos, e os dois marcam como visto - senao o popup
 * voltaria no proximo ciclo:
 *   - "Ver pedidos" leva para a tela completa;
 *   - "Depois" dispensa sem sair de onde o produtor esta.
 *
 * O botao de fechar do Modal tambem marca como visto, pelo mesmo motivo.
 */
export default function AvisoPedidosNovos() {
  const { itens, total, mostrarAviso, marcarComoVisto } = usePedidosNovos();
  const navegar = useNavigate();

  if (!mostrarAviso) return null;

  const outros = Math.max(0, total - itens.length);

  function verPedidos() {
    marcarComoVisto();
    navegar('/agricultor/pedidos');
  }

  return (
    <Modal
      titulo={total === 1 ? 'Voce recebeu um pedido novo' : `Voce recebeu ${total} pedidos novos`}
      aberto={mostrarAviso}
      aoFechar={marcarComoVisto}
      acoes={
        <>
          <button type="button" className="botao botao--secundario" onClick={marcarComoVisto}>
            Depois
          </button>
          <button type="button" className="botao botao--primario" onClick={verPedidos}>
            Ver pedidos
          </button>
        </>
      }
    >
      <ul className="aviso-pedidos__lista">
        {itens.map((item) => (
          <li key={item.id} className="aviso-pedidos__item">
            <span className="aviso-pedidos__produto">
              {item.produto_nome}
              <span className="campo__dica">
                {formatarQuantidade(item.quantidade, item.unidade)}
                {item.comprador_cidade ? ` · ${item.comprador_cidade}` : ''}
              </span>
            </span>
            <strong>{formatarMoeda(item.subtotal)}</strong>
          </li>
        ))}
      </ul>

      {/*
        Quando ha mais itens do que o resumo traz, dizemos o quanto ficou
        de fora. Mostrar so os primeiros sem avisar faria o produtor achar
        que recebeu menos do que recebeu.
      */}
      {outros > 0 && (
        <p className="campo__dica">E mais {outros} item(ns) aguardando voce.</p>
      )}
    </Modal>
  );
}
