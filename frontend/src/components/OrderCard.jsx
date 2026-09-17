import { Link } from 'react-router-dom';
import {
  formatarMoeda,
  formatarDataHora,
  rotularStatusPedido,
  classeStatusPedido,
} from '../utils/formato.js';
import './pedido.css';

/*
 * Card de pedido na lista "meus pedidos".
 *
 * O status do pedido e derivado dos itens pelo backend (o pedido so
 * vira ENTREGUE quando todos os itens foram entregues). Mostramos
 * tambem o resumo por item quando o pedido tem mais de um produtor -
 * nesse caso um status unico esconde que uma parte ja chegou e outra
 * nao.
 */
export default function OrderCard({ pedido, aoCancelar, cancelando }) {
  const podeCancelar = pedido.status === 'PENDENTE' || pedido.status === 'PROCESSANDO';
  const multiProdutor =
    pedido.itens && new Set(pedido.itens.map((item) => item.agricultor_id)).size > 1;

  return (
    <article className="pedido-card">
      <header className="pedido-card__cabecalho">
        <div>
          <h3 className="pedido-card__numero">Pedido #{pedido.id}</h3>
          <p className="pedido-card__data">{formatarDataHora(pedido.criado_em)}</p>
        </div>
        <span className={classeStatusPedido(pedido.status)}>
          {rotularStatusPedido(pedido.status)}
        </span>
      </header>

      {pedido.itens && pedido.itens.length > 0 && (
        <ul className="pedido-card__itens">
          {pedido.itens.map((item) => (
            <li key={item.id} className="pedido-card__item">
              <span className="pedido-card__item-nome">
                {item.quantidade}x {item.produto_nome || `Produto ${item.produto_id}`}
              </span>
              {multiProdutor && (
                <span className={classeStatusPedido(item.status)}>
                  {rotularStatusPedido(item.status)}
                </span>
              )}
              <span className="pedido-card__item-valor">{formatarMoeda(item.subtotal)}</span>
            </li>
          ))}
        </ul>
      )}

      <dl className="pedido-card__valores">
        <div>
          <dt>Produtos</dt>
          <dd>{formatarMoeda(pedido.valor_produtos)}</dd>
        </div>
        <div>
          <dt>Frete</dt>
          <dd>{formatarMoeda(pedido.valor_frete)}</dd>
        </div>
        <div className="pedido-card__valores-total">
          <dt>Total</dt>
          <dd>{formatarMoeda(pedido.valor_total)}</dd>
        </div>
      </dl>

      <footer className="pedido-card__acoes">
        <Link to={`/pedidos/${pedido.id}`} className="botao botao--secundario">
          Ver detalhes
        </Link>

        {aoCancelar && podeCancelar && (
          <button
            type="button"
            className="botao botao--perigo"
            disabled={cancelando}
            onClick={() => aoCancelar(pedido)}
          >
            {cancelando ? 'Cancelando...' : 'Cancelar pedido'}
          </button>
        )}
      </footer>
    </article>
  );
}