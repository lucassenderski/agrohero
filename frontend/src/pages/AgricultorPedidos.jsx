import { useCallback, useEffect, useState } from 'react';
import { listarItensDoProdutor, alterarStatusDoItem } from '../services/pedidos.js';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import { Carregando, MensagemErro, EstadoVazio, Paginacao, Selo } from '../components/ui.jsx';
import {
  formatarMoeda,
  formatarDataHora,
  formatarQuantidade,
  rotularStatusPedido,
  classeStatusPedido,
} from '../utils/formato.js';
import '../components/pedido.css';

/*
 * Fluxo de status do item, na ordem em que o produtor avanca.
 *
 * CANCELADO fica fora da lista de proximos passos de proposito: e uma
 * saida, nao um estagio, e o backend aplica regras proprias para ele.
 * Oferecer "cancelar" no mesmo seletor de "avancar" convidaria ao erro.
 */
const PROXIMO = {
  PENDENTE: 'PROCESSANDO',
  PROCESSANDO: 'ENVIADO',
  ENVIADO: 'ENTREGUE',
};

const ROTULO_ACAO = {
  PENDENTE: 'Marcar como processando',
  PROCESSANDO: 'Marcar como enviado',
  ENVIADO: 'Marcar como entregue',
};

/*
 * Pedidos do produtor.
 *
 * A API devolve ITENS, nao pedidos inteiros: um pedido pode misturar
 * produtos de varios produtores, e cada um so ve a sua parte - sem os
 * valores totais da venda alheia. Por isso a tela agrupa os itens por
 * pedido, mas cada acao atinge apenas um item.
 */
export default function AgricultorPedidos() {
  const { sucesso, erro: notificarErro } = useNotificacao();

  const [itens, setItens] = useState([]);
  const [paginacao, setPaginacao] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const carregar = useCallback(async (paginaAlvo = pagina, status = filtroStatus) => {
    setCarregando(true);
    setErro(null);
    try {
      const filtros = { pagina: paginaAlvo, limite: 20 };
      if (status) filtros.status = status;
      const resposta = await listarItensDoProdutor(filtros);
      setItens(resposta.itens || []);
      setPaginacao(resposta.paginacao || null);
    } catch (falha) {
      setErro(falha);
    } finally {
      setCarregando(false);
    }
  }, [pagina, filtroStatus]);

  useEffect(() => {
    carregar(pagina, filtroStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, filtroStatus]);

  async function avancar(item) {
    const proximo = PROXIMO[item.status];
    if (!proximo) return;

    setOcupado(item.id);
    try {
      await alterarStatusDoItem(item.pedido_id, item.id, proximo);
      sucesso(`Item atualizado para ${rotularStatusPedido(proximo).toLowerCase()}.`);
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel atualizar o item.');
    } finally {
      setOcupado(null);
    }
  }

  if (carregando && itens.length === 0) {
    return <Carregando texto="Carregando seus pedidos..." />;
  }

  return (
    <div className="container painel">
      <header className="painel__cabecalho">
        <div>
          <h1>Pedidos recebidos</h1>
          <p className="campo__dica">
            Voce ve apenas os itens dos seus produtos, mesmo quando o pedido tem outros produtores.
          </p>
        </div>

        <div className="campo">
          <label className="campo__rotulo" htmlFor="filtro_status">
            Filtrar por situacao
          </label>
          <select
            id="filtro_status"
            className="campo__selecao"
            value={filtroStatus}
            onChange={(evento) => {
              setPagina(1);
              setFiltroStatus(evento.target.value);
            }}
          >
            <option value="">Todas</option>
            <option value="PENDENTE">Pendente</option>
            <option value="PROCESSANDO">Processando</option>
            <option value="ENVIADO">Enviado</option>
            <option value="ENTREGUE">Entregue</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
      </header>

      {erro && <MensagemErro erro={erro} aoTentarNovamente={() => carregar()} />}

      {!erro && itens.length === 0 && (
        <EstadoVazio
          titulo="Nenhum pedido por aqui"
          descricao="Assim que alguem comprar seus produtos, os itens aparecem nesta lista."
        />
      )}

      {itens.length > 0 && (
        <>
          <section className="painel-secao">
            <table className="painel-secao__tabela">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Subtotal</th>
                  <th>Situacao</th>
                  <th>Entrega</th>
                  <th>Acao</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.id}>
                    <td>
                      #{item.pedido_id}
                      <br />
                      <span className="campo__dica">{formatarDataHora(item.criado_em)}</span>
                    </td>
                    <td>{item.produto_nome}</td>
                    <td>{formatarQuantidade(item.quantidade, item.unidade)}</td>
                    <td>{formatarMoeda(item.subtotal)}</td>
                    <td>
                      <Selo variante={classeStatusPedido(item.status).replace('selo--', '')}>
                        {rotularStatusPedido(item.status)}
                      </Selo>
                    </td>
                    <td>
                      {item.endereco_entrega
                        ? `${item.endereco_entrega.cidade}/${item.endereco_entrega.estado}`
                        : '-'}
                    </td>
                    <td>
                      {PROXIMO[item.status] ? (
                        <button
                          type="button"
                          className="botao botao--secundario"
                          disabled={ocupado === item.id}
                          onClick={() => avancar(item)}
                        >
                          {ocupado === item.id ? 'Atualizando...' : ROTULO_ACAO[item.status]}
                        </button>
                      ) : (
                        <span className="campo__dica">Sem acao</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <Paginacao paginacao={paginacao} aoMudarPagina={setPagina} />
        </>
      )}
    </div>
  );
}