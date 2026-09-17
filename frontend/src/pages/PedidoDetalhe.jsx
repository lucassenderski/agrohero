import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { buscarPedido, cancelarPedido } from '../services/pedidos.js';
import { avaliarProduto, listarPendentesDeAvaliacao } from '../services/avaliacoes.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import {
  Carregando,
  MensagemErro,
  Modal,
  Selo,
  Estrelas,
} from '../components/ui.jsx';
import {
  formatarMoeda,
  formatarDataHora,
  rotularStatusPedido,
  rotularStatusPagamento,
  classeStatusPedido,
  resumirEndereco,
} from '../utils/formato.js';
import '../components/pedido.css';

/*
 * Detalhe do pedido (consumidor).
 *
 * A avaliacao so aparece para itens de pedido ENTREGUE. A regra real e
 * do backend ("so avalia quem recebeu"), mas mostrar o botao em pedido
 * pendente so levaria o usuario a um 403 - aqui o botao reflete a mesma
 * regra.
 */
export default function PedidoDetalhe() {
  const { id } = useParams();
  const { ehCliente } = useAuth();
  const { sucesso, erro: notificarErro } = useNotificacao();

  const [pedido, setPedido] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [cancelando, setCancelando] = useState(false);

  const [itemAvaliado, setItemAvaliado] = useState(null);
  const [nota, setNota] = useState(5);
  const [comentario, setComentario] = useState('');
  const [enviandoAvaliacao, setEnviandoAvaliacao] = useState(false);
  // Itens entregues que ainda nao receberam nota. O backend e quem decide
  // (cruza itens ENTREGUES com avaliacoes ja escritas); sem isso a tela
  // ofereceria "Avaliar" de novo e o envio terminaria em 409.
  const [itensAvaliaveis, setItensAvaliaveis] = useState([]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPedido(await buscarPedido(id));
    } catch (falha) {
      setErro(falha);
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /*
   * So consulta os pendentes quando ha o que avaliar: usuario cliente e
   * ao menos um item ENTREGUE. Para produtor/admin o endpoint devolveria
   * 404 (a checagem e do dono do pedido), entao a chamada nem sai.
   */
  useEffect(() => {
    const temEntregue = (pedido?.itens || []).some((item) => item.status === 'ENTREGUE');

    if (!ehCliente || !pedido || !temEntregue) {
      setItensAvaliaveis([]);
      return;
    }

    let ativo = true;

    listarPendentesDeAvaliacao(pedido.id)
      .then((dados) => {
        if (ativo) setItensAvaliaveis(dados.itens || []);
      })
      .catch(() => {
        // Falha aqui nao derruba a pagina: sem a lista, o bloco de
        // avaliacao simplesmente nao aparece.
        if (ativo) setItensAvaliaveis([]);
      });

    return () => {
      ativo = false;
    };
  }, [ehCliente, pedido]);

  async function cancelar() {
    if (!window.confirm('Cancelar este pedido? Esta acao nao pode ser desfeita.')) return;
    setCancelando(true);
    try {
      await cancelarPedido(id);
      sucesso('Pedido cancelado.');
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel cancelar o pedido.');
    } finally {
      setCancelando(false);
    }
  }

  function abrirAvaliacao(item) {
    setItemAvaliado(item);
    setNota(5);
    setComentario('');
  }

  async function enviarAvaliacao() {
    setEnviandoAvaliacao(true);
    try {
      await avaliarProduto({
        pedidoId: Number(id),
        produtoId: itemAvaliado.produto_id,
        nota: Number(nota),
        comentario: comentario.trim() || undefined,
      });
      sucesso('Avaliacao enviada. Obrigado!');
      setItemAvaliado(null);
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel enviar a avaliacao.');
    } finally {
      setEnviandoAvaliacao(false);
    }
  }

  if (carregando && !pedido) return <Carregando texto="Carregando pedido..." />;

  if (erro) {
    return (
      <div className="container pedido-detalhe">
        <h1>Pedido</h1>
        <MensagemErro erro={erro} aoTentarNovamente={carregar} />
      </div>
    );
  }

  const itens = pedido.itens || [];
  const podeCancelar = pedido.status === 'PENDENTE' || pedido.status === 'PROCESSANDO';

  return (
    <div className="container pedido-detalhe">
      <nav className="produto-detalhe__migalhas" aria-label="Voce esta aqui">
        <Link to="/pedidos">Meus pedidos</Link> / <span>Pedido #{pedido.id}</span>
      </nav>

      <header className="pedido-detalhe__cabecalho">
        <div>
          <h1>Pedido #{pedido.id}</h1>
          <p className="pedido-card__data">{formatarDataHora(pedido.criado_em)}</p>
        </div>
        <span className={classeStatusPedido(pedido.status)}>
          {rotularStatusPedido(pedido.status)}
        </span>
      </header>

      <div className="pedido-detalhe__secoes">
        <div className="checkout__coluna">
          <section className="painel-secao">
            <h2 className="painel-secao__titulo">Itens</h2>
            <table className="painel-secao__tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Subtotal</th>
                  <th>Situacao</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/produtos/${item.produto_id}`}>
                        {item.produto_nome || `Produto ${item.produto_id}`}
                      </Link>
                      <br />
                      <Link
                        to={`/agricultores/${item.agricultor_id}`}
                        className="campo__dica"
                      >
                        Ver produtor
                      </Link>
                    </td>
                    <td>{item.quantidade}</td>
                    <td>{formatarMoeda(item.subtotal)}</td>
                    <td>
                      <Selo variante={classeStatusPedido(item.status).replace('selo--', '')}>
                        {rotularStatusPedido(item.status)}
                      </Selo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="painel-secao">
            <h2 className="painel-secao__titulo">Entrega</h2>
            <p className="campo__dica">
              {resumirEndereco(pedido.endereco_entrega) || 'Endereco nao informado.'}
            </p>
          </section>

          {itensAvaliaveis.length > 0 && (
            <section className="painel-secao">
              <h2 className="painel-secao__titulo">Avaliar produtos</h2>
              <p className="campo__dica">
                Voce pode avaliar os itens que ja recebeu.
              </p>
              <div className="item-acoes">
                {itensAvaliaveis.map((item) => (
                  <button
                    key={item.item_id}
                    type="button"
                    className="botao botao--secundario"
                    onClick={() => abrirAvaliacao(item)}
                  >
                    Avaliar {item.produto_nome || `produto ${item.produto_id}`}
                  </button>
                ))}
              </div>
            </section>
          )}

          {(pedido.pagamentos || []).length > 0 && (
            <section className="painel-secao">
              <h2 className="painel-secao__titulo">Pagamentos</h2>
              <table className="painel-secao__tabela">
                <thead>
                  <tr>
                    <th>Metodo</th>
                    <th>Status</th>
                    <th>Valor</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {pedido.pagamentos.map((pagamento) => (
                    <tr key={pagamento.id}>
                      <td>{pagamento.metodo}</td>
                      <td>
                        <Selo variante={classeStatusPedido(pagamento.status).replace('selo--', '')}>
                          {rotularStatusPagamento(pagamento.status)}
                        </Selo>
                      </td>
                      <td>{formatarMoeda(pagamento.valor)}</td>
                      <td>{formatarDataHora(pagamento.criado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <aside className="resumo" aria-label="Resumo do pedido">
          <h2 className="resumo__titulo">Resumo</h2>
          <div className="resumo__linhas">
            <div className="resumo__linha">
              <span>Produtos</span>
              <span>{formatarMoeda(pedido.valor_produtos)}</span>
            </div>
            <div className="resumo__linha">
              <span>Frete</span>
              <span>{formatarMoeda(pedido.valor_frete)}</span>
            </div>
            <div className="resumo__linha resumo__linha--total">
              <span>Total</span>
              <span>{formatarMoeda(pedido.valor_total)}</span>
            </div>
          </div>

          {podeCancelar && (
            <button
              type="button"
              className="botao botao--perigo botao--bloco"
              disabled={cancelando}
              onClick={cancelar}
            >
              {cancelando ? 'Cancelando...' : 'Cancelar pedido'}
            </button>
          )}

          <Link to="/produtos" className="botao botao--texto botao--bloco">
            Comprar novamente
          </Link>
        </aside>
      </div>

      <Modal
        titulo={`Avaliar ${itemAvaliado?.produto_nome || 'produto'}`}
        aberto={Boolean(itemAvaliado)}
        aoFechar={() => setItemAvaliado(null)}
        acoes={
          <>
            <button
              type="button"
              className="botao botao--texto"
              onClick={() => setItemAvaliado(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="botao botao--primario"
              disabled={enviandoAvaliacao}
              onClick={enviarAvaliacao}
            >
              {enviandoAvaliacao ? 'Enviando...' : 'Enviar avaliacao'}
            </button>
          </>
        }
      >
        <div className="campo">
          <span className="campo__rotulo">Nota</span>
          <div className="avaliacao__estrelas-escolha">
            {[1, 2, 3, 4, 5].map((valor) => (
              <button
                key={valor}
                type="button"
                className={`avaliacao__estrela ${valor <= nota ? 'avaliacao__estrela--ativa' : ''}`}
                onClick={() => setNota(valor)}
                aria-label={`${valor} estrela${valor > 1 ? 's' : ''}`}
                aria-pressed={valor <= nota}
              >
                ★
              </button>
            ))}
          </div>
          <Estrelas nota={nota} />
        </div>

        <div className="campo">
          <label className="campo__rotulo" htmlFor="comentario">
            Comentario (opcional)
          </label>
          <textarea
            id="comentario"
            className="campo__area"
            placeholder="Conte como foi a qualidade do produto."
            value={comentario}
            onChange={(evento) => setComentario(evento.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}