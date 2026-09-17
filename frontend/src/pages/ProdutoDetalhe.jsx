import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { buscarProduto, listarAvaliacoesDoProduto } from '../services/catalogo.js';
import { useRequisicao } from '../hooks/useRequisicao.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCarrinho } from '../contexts/CarrinhoContext.jsx';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import { Carregando, MensagemErro, Estrelas, Selo } from '../components/ui.jsx';
import { formatarMoeda, formatarQuantidade, formatarData } from '../utils/formato.js';

/*
 * Detalhe do produto.
 *
 * A quantidade e validada contra o estoque ANTES de chamar a API: pedir
 * mais do que existe so traria um 409 que o usuario ja podia evitar. O
 * servidor continua checando de novo - entre a validacao daqui e a
 * chamada, outra pessoa pode ter comprado o ultimo item.
 */
export default function ProdutoDetalhe() {
  const { id } = useParams();
  const { autenticado, ehCliente } = useAuth();
  const { adicionar } = useCarrinho();
  const { sucesso, erro: notificarErro } = useNotificacao();

  const [quantidade, setQuantidade] = useState(1);
  const [adicionando, setAdicionando] = useState(false);

  const produto = useRequisicao(() => buscarProduto(id), [id]);
  const avaliacoes = useRequisicao(() => listarAvaliacoesDoProduto(id, { limite: 10 }), [id]);

  if (produto.carregando) return <Carregando texto="Carregando produto..." />;
  if (produto.erro) {
    return (
      <div className="container produto-detalhe">
        <MensagemErro erro={produto.erro} aoTentarNovamente={produto.recarregar} />
      </div>
    );
  }
  if (!produto.dados) return null;

  const item = produto.dados;
  const esgotado = item.estoque <= 0;

  async function adicionarAoCarrinho() {
    setAdicionando(true);
    try {
      await adicionar(item.id, Number(quantidade));
      sucesso(`"${item.nome}" adicionado ao carrinho.`);
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel adicionar ao carrinho.');
    } finally {
      setAdicionando(false);
    }
  }

  const listaAvaliacoes = avaliacoes.dados?.avaliacoes || [];

  return (
    <div className="container produto-detalhe">
      <nav className="produto-detalhe__migalhas" aria-label="Voce esta aqui">
        <Link to="/produtos">Produtos</Link>
        {item.categoria_nome && (
          <>
            {' / '}
            <Link to={`/produtos?categoria_id=${item.categoria_id}`}>{item.categoria_nome}</Link>
          </>
        )}
        {' / '}
        <span>{item.nome}</span>
      </nav>

      <div className="produto-detalhe__principal">
        {item.imagem_url ? (
          <img className="produto-detalhe__imagem" src={item.imagem_url} alt={item.nome} />
        ) : (
          <div className="produto-detalhe__sem-imagem" aria-hidden="true">
            🌿
          </div>
        )}

        <div className="produto-detalhe__info">
          <h1>{item.nome}</h1>

          <Estrelas nota={item.media_avaliacoes} total={item.total_avaliacoes} />

          <p className="produto-detalhe__preco">
            {formatarMoeda(item.preco)}
            <span className="produto-card__unidade"> / {item.unidade}</span>
          </p>

          <p className="produto-detalhe__estoque">
            {esgotado ? (
              <Selo variante="cancelado">Esgotado</Selo>
            ) : (
              <>Disponivel: {formatarQuantidade(item.estoque, item.unidade)}</>
            )}
          </p>

          {item.descricao && <p>{item.descricao}</p>}

          {autenticado && ehCliente && !esgotado && (
            <div className="produto-detalhe__compra">
              <div className="produto-detalhe__quantidade">
                <label className="campo__rotulo" htmlFor="quantidade">
                  Quantidade
                </label>
                <input
                  id="quantidade"
                  type="number"
                  min="1"
                  max={item.estoque}
                  className="campo__entrada"
                  value={quantidade}
                  onChange={(evento) => {
                    const bruto = Number(evento.target.value);
                    /* Trava no intervalo em vez de aceitar e falhar depois. */
                    const limitado = Math.min(Math.max(bruto || 1, 1), item.estoque);
                    setQuantidade(limitado);
                  }}
                />
              </div>

              <button
                type="button"
                className="botao botao--primario"
                disabled={adicionando}
                onClick={adicionarAoCarrinho}
              >
                {adicionando ? 'Adicionando...' : 'Adicionar ao carrinho'}
              </button>
            </div>
          )}

          {!autenticado && (
            <p className="campo__dica">
              <Link to="/login">Entre</Link> como consumidor para comprar.
            </p>
          )}

          {item.agricultor_id && (
            <div className="produto-detalhe__produtor">
              <span className="produto-card__categoria">Produtor</span>
              <h2>
                <Link to={`/agricultores/${item.agricultor_id}`}>
                  {item.nome_fazenda || 'Ver produtor'}
                </Link>
              </h2>
              {item.agricultor_cidade && (
                <p className="campo__dica">
                  {item.agricultor_cidade}/{item.agricultor_estado}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <section className="produto-detalhe__secoes" aria-label="Avaliacoes">
        <div className="painel-secao">
          <h2 className="painel-secao__titulo">
            Avaliacoes {item.total_avaliacoes ? `(${item.total_avaliacoes})` : ''}
          </h2>

          {avaliacoes.carregando && <Carregando texto="Carregando avaliacoes..." />}

          {!avaliacoes.carregando && listaAvaliacoes.length === 0 && (
            <p className="campo__dica">Este produto ainda nao foi avaliado.</p>
          )}

          {listaAvaliacoes.length > 0 && (
            <div className="avaliacoes">
              {listaAvaliacoes.map((avaliacao) => (
                <article key={avaliacao.id} className="avaliacao">
                  <div className="avaliacao__cabecalho">
                    <span className="avaliacao__autor">
                      {avaliacao.consumidor_primeiro_nome || 'Consumidor'}
                    </span>
                    <Estrelas nota={avaliacao.nota} />
                    <span className="avaliacao__data">
                      {formatarData(avaliacao.criado_em)}
                    </span>
                  </div>
                  {avaliacao.comentario && (
                    <p className="avaliacao__comentario">{avaliacao.comentario}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}