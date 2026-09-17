import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listarMinhasAvaliacoes,
  editarAvaliacao,
  removerAvaliacao,
} from '../services/avaliacoes.js';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import { useFormulario } from '../hooks/useMutacao.js';
import {
  Carregando,
  MensagemErro,
  EstadoVazio,
  Modal,
  Paginacao,
  Estrelas,
} from './ui.jsx';
import { formatarData } from '../utils/formato.js';

/*
 * Avaliacoes escritas pelo consumidor.
 *
 * O consumidor so edita a NOTA e o COMENTARIO. Pedido, produto e
 * produtor ficam travados: a avaliacao e a prova de que ele recebeu
 * aquele item, e reapontar uma avaliacao para outro produto seria
 * transferir reputacao de um produtor para outro.
 */

export default function MinhasAvaliacoes() {
  const { sucesso, erro: notificarErro } = useNotificacao();

  const [avaliacoes, setAvaliacoes] = useState([]);
  const [paginacao, setPaginacao] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const formulario = useFormulario({ nota: 5, comentario: '' });

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const { avaliacoes: lista, paginacao: meta } = await listarMinhasAvaliacoes({ pagina });
      setAvaliacoes(lista || []);
      setPaginacao(meta || null);
    } catch (falha) {
      setErro(falha);
    } finally {
      setCarregando(false);
    }
  }, [pagina]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirEdicao(avaliacao) {
    formulario.reiniciar({
      nota: avaliacao.nota,
      comentario: avaliacao.comentario || '',
    });
    setEditando(avaliacao);
  }

  async function salvar(evento) {
    evento.preventDefault();
    setSalvando(true);
    try {
      await editarAvaliacao(editando.id, {
        nota: Number(formulario.valores.nota),
        // String vazia apaga o comentario (o backend converte para NULL).
        comentario: formulario.valores.comentario.trim(),
      });
      sucesso('Avaliacao atualizada.');
      setEditando(null);
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel atualizar a avaliacao.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(avaliacao) {
    if (!window.confirm('Remover esta avaliacao? A nota sai da media do produtor.')) return;
    try {
      await removerAvaliacao(avaliacao.id);
      sucesso('Avaliacao removida.');
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel remover a avaliacao.');
    }
  }

  return (
    <section className="painel-secao">
      <h2 className="painel-secao__titulo">Minhas avaliacoes</h2>

      {carregando && <Carregando texto="Carregando avaliacoes..." />}

      {!carregando && erro && <MensagemErro erro={erro} aoTentarNovamente={carregar} />}

      {!carregando && !erro && avaliacoes.length === 0 && (
        <EstadoVazio
          titulo="Voce ainda nao avaliou nenhum produto"
          descricao="Depois de receber um pedido, voce podera avaliar os itens entregues."
          acao={
            <Link to="/pedidos" className="botao botao--secundario">
              Ver meus pedidos
            </Link>
          }
        />
      )}

      {!carregando && !erro && avaliacoes.length > 0 && (
        <>
          <ul className="lista-avaliacoes">
            {avaliacoes.map((avaliacao) => (
              <li key={avaliacao.id} className="lista-avaliacoes__item">
                <div className="lista-avaliacoes__cabecalho">
                  <Link to={`/produtos/${avaliacao.produto_id}`} className="lista-avaliacoes__produto">
                    {avaliacao.produto_nome || `Produto ${avaliacao.produto_id}`}
                  </Link>
                  <Estrelas nota={avaliacao.nota} />
                </div>
                {avaliacao.comentario ? (
                  <p className="lista-avaliacoes__comentario">{avaliacao.comentario}</p>
                ) : (
                  <p className="campo__dica">Sem comentario.</p>
                )}
                <div className="lista-avaliacoes__rodape">
                  <span className="campo__dica">{formatarData(avaliacao.criado_em)}</span>
                  <div className="item-acoes">
                    <button
                      type="button"
                      className="botao botao--texto"
                      onClick={() => abrirEdicao(avaliacao)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="botao botao--texto"
                      onClick={() => remover(avaliacao)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Paginacao paginacao={paginacao} aoMudarPagina={setPagina} />
        </>
      )}

      <Modal
        titulo={`Editar avaliacao de ${editando?.produto_nome || 'produto'}`}
        aberto={Boolean(editando)}
        aoFechar={() => setEditando(null)}
        acoes={
          <>
            <button
              type="button"
              className="botao botao--texto"
              onClick={() => setEditando(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-avaliacao-perfil"
              className="botao botao--primario"
              disabled={salvando}
            >
              {salvando ? 'Salvando...' : 'Salvar avaliacao'}
            </button>
          </>
        }
      >
        <form id="form-avaliacao-perfil" onSubmit={salvar} noValidate>
          <div className="campo">
            <span className="campo__rotulo">Nota</span>
            <div className="avaliacao__estrelas-escolha">
              {[1, 2, 3, 4, 5].map((valor) => (
                <button
                  key={valor}
                  type="button"
                  className={`avaliacao__estrela ${
                    valor <= formulario.valores.nota ? 'avaliacao__estrela--ativa' : ''
                  }`}
                  aria-label={`Dar nota ${valor}`}
                  onClick={() => formulario.alterar('nota', valor)}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="avaliacao-comentario">
              Comentario
            </label>
            <textarea
              id="avaliacao-comentario"
              className="campo__entrada"
              rows={4}
              placeholder="Conte como foi a qualidade do produto."
              value={formulario.valores.comentario}
              onChange={(evento) => formulario.alterar('comentario', evento.target.value)}
            />
            <span className="campo__dica">Deixar em branco remove o comentario.</span>
          </div>
        </form>
      </Modal>
    </section>
  );
}