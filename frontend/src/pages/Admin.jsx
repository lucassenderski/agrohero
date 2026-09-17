import { useCallback, useEffect, useState } from 'react';
import {
  listarCategoriasAdmin,
  criarCategoria,
  atualizarCategoria,
  desativarCategoria,
  reativarCategoria,
} from '../services/painel.js';
import { listarTodosOsPedidos, alterarStatusDoPedido } from '../services/pedidos.js';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import { useFormulario } from '../hooks/useMutacao.js';
import { Carregando, MensagemErro, EstadoVazio, Modal, Paginacao, Selo } from '../components/ui.jsx';
import { formatarMoeda, formatarDataHora, rotularStatusPedido, classeStatusPedido } from '../utils/formato.js';
import '../components/pedido.css';

const CATEGORIA_VAZIA = { nome: '', descricao: '' };

const STATUS_PEDIDO = ['PENDENTE', 'PROCESSANDO', 'ENVIADO', 'ENTREGUE', 'CANCELADO'];

/*
 * Painel administrativo.
 *
 * Duas frentes: catalogo (categorias) e pedidos. A gestao de usuarios
 * ainda NAO aparece aqui - o backend nao expoe endpoint de listagem ou
 * bloqueio, e inventar uma tela que chama uma rota inexistente seria
 * pior do que nao ter a tela. Fica registrado como pendencia.
 *
 * Toda rota desta pagina exige papel administrador tambem no servidor;
 * esconder o menu nao e o que protege.
 */
export default function Admin() {
  const { sucesso, erro: notificarErro } = useNotificacao();

  const [aba, setAba] = useState('categorias');

  const [categorias, setCategorias] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [paginacaoPedidos, setPaginacaoPedidos] = useState(null);
  const [paginaPedidos, setPaginaPedidos] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [modalAberta, setModalAberta] = useState(false);
  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const { valores, alterar, reiniciar } = useFormulario(CATEGORIA_VAZIA);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [respostaCategorias, respostaPedidos] = await Promise.all([
        listarCategoriasAdmin({ limite: 100 }),
        listarTodosOsPedidos({ pagina: paginaPedidos, limite: 20 }),
      ]);
      setCategorias(respostaCategorias.categorias || []);
      setPedidos(respostaPedidos.pedidos || []);
      setPaginacaoPedidos(respostaPedidos.paginacao || null);
    } catch (falha) {
      setErro(falha);
    } finally {
      setCarregando(false);
    }
  }, [paginaPedidos]);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaPedidos]);

  function abrirNova() {
    setEditando(null);
    reiniciar(CATEGORIA_VAZIA);
    setModalAberta(true);
  }

  function abrirEdicao(categoria) {
    setEditando(categoria);
    reiniciar({ nome: categoria.nome || '', descricao: categoria.descricao || '' });
    setModalAberta(true);
  }

  async function salvarCategoria(evento) {
    evento.preventDefault();
    if (!valores.nome.trim()) {
      notificarErro('Informe o nome da categoria.');
      return;
    }

    const corpo = {
      nome: valores.nome.trim(),
      descricao: valores.descricao.trim() || undefined,
    };

    setSalvando(true);
    try {
      if (editando) {
        await atualizarCategoria(editando.id, corpo);
        sucesso('Categoria atualizada.');
      } else {
        await criarCategoria(corpo);
        sucesso('Categoria criada.');
      }
      setModalAberta(false);
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel salvar a categoria.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarCategoria(categoria) {
    try {
      if (categoria.ativo) {
        await desativarCategoria(categoria.id);
        sucesso('Categoria desativada.');
      } else {
        await reativarCategoria(categoria.id);
        sucesso('Categoria reativada.');
      }
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel alterar a categoria.');
    }
  }

  async function mudarStatus(pedido, status) {
    try {
      await alterarStatusDoPedido(pedido.id, status);
      sucesso('Status do pedido atualizado.');
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel alterar o status.');
    }
  }

  if (carregando && categorias.length === 0 && pedidos.length === 0) {
    return <Carregando texto="Carregando o painel administrativo..." />;
  }

  return (
    <div className="container painel">
      <header className="painel__cabecalho">
        <h1>Administracao</h1>
        <button type="button" className="botao botao--primario" onClick={abrirNova}>
          Nova categoria
        </button>
      </header>

      <nav className="painel__abas" aria-label="Secoes">
        <button
          type="button"
          className={`painel__aba ${aba === 'categorias' ? 'painel__aba--ativa' : ''}`}
          onClick={() => setAba('categorias')}
        >
          Categorias
        </button>
        <button
          type="button"
          className={`painel__aba ${aba === 'pedidos' ? 'painel__aba--ativa' : ''}`}
          onClick={() => setAba('pedidos')}
        >
          Pedidos
        </button>
      </nav>

      {erro && <MensagemErro erro={erro} aoTentarNovamente={carregar} />}

      {aba === 'categorias' && !erro && (
        <>
          {categorias.length === 0 ? (
            <EstadoVazio titulo="Nenhuma categoria" descricao="Crie a primeira categoria." />
          ) : (
            <section className="painel-secao">
              <table className="painel-secao__tabela">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Descricao</th>
                    <th>Situacao</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((categoria) => (
                    <tr key={categoria.id}>
                      <td>{categoria.nome}</td>
                      <td>{categoria.descricao || '-'}</td>
                      <td>
                        <Selo variante={categoria.ativo ? 'entregue' : 'cancelado'}>
                          {categoria.ativo ? 'Ativa' : 'Inativa'}
                        </Selo>
                      </td>
                      <td>
                        <div className="item-acoes">
                          <button
                            type="button"
                            className="botao botao--texto"
                            onClick={() => abrirEdicao(categoria)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="botao botao--texto"
                            onClick={() => alternarCategoria(categoria)}
                          >
                            {categoria.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {aba === 'pedidos' && !erro && (
        <>
          {pedidos.length === 0 ? (
            <EstadoVazio titulo="Nenhum pedido" descricao="Ainda nao ha pedidos no sistema." />
          ) : (
            <section className="painel-secao">
              <table className="painel-secao__tabela">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Consumidor</th>
                    <th>Data</th>
                    <th>Total</th>
                    <th>Situacao</th>
                    <th>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((pedido) => (
                    <tr key={pedido.id}>
                      <td>#{pedido.id}</td>
                      <td>{pedido.consumidor_nome || pedido.consumidor_id}</td>
                      <td>{formatarDataHora(pedido.criado_em)}</td>
                      <td>{formatarMoeda(pedido.valor_total)}</td>
                      <td>
                        <Selo variante={classeStatusPedido(pedido.status).replace('selo--', '')}>
                          {rotularStatusPedido(pedido.status)}
                        </Selo>
                      </td>
                      <td>
                        <label className="sr-only" htmlFor={`status-${pedido.id}`}>
                          Alterar status do pedido {pedido.id}
                        </label>
                        <select
                          id={`status-${pedido.id}`}
                          className="item-acoes__selecao"
                          value={pedido.status}
                          onChange={(evento) => mudarStatus(pedido, evento.target.value)}
                        >
                          {STATUS_PEDIDO.map((status) => (
                            <option key={status} value={status}>
                              {rotularStatusPedido(status)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <Paginacao paginacao={paginacaoPedidos} aoMudarPagina={setPaginaPedidos} />
        </>
      )}

      <Modal
        titulo={editando ? 'Editar categoria' : 'Nova categoria'}
        aberto={modalAberta}
        aoFechar={() => setModalAberta(false)}
        acoes={
          <>
            <button
              type="button"
              className="botao botao--texto"
              onClick={() => setModalAberta(false)}
            >
              Cancelar
            </button>
            <button type="submit" form="form-categoria" className="botao botao--primario" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <form id="form-categoria" onSubmit={salvarCategoria} noValidate>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="nome_categoria">
              Nome <span className="campo__obrigatorio">*</span>
            </label>
            <input
              id="nome_categoria"
              className="campo__entrada"
              value={valores.nome}
              onChange={(evento) => alterar('nome', evento.target.value)}
            />
          </div>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="descricao_categoria">
              Descricao
            </label>
            <textarea
              id="descricao_categoria"
              className="campo__area"
              value={valores.descricao}
              onChange={(evento) => alterar('descricao', evento.target.value)}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}