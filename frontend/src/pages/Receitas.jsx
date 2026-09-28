import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listarProdutos } from '../services/catalogo.js';
import { useRequisicao } from '../hooks/useRequisicao.js';
import { useCarrinho } from '../contexts/CarrinhoContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import { Carregando, MensagemErro } from '../components/ui.jsx';
import { formatarMoeda } from '../utils/formato.js';
import {
  CATEGORIAS_RECEITA,
  RECEITAS,
  casarIngredientes,
  totalDosIngredientes,
} from '../dados/receitas.js';
import './Receitas.css';

/*
 * Receitas da terra.
 *
 * Pagina de conteudo: o modo de preparo e editorial (vive no frontend),
 * mas os ingredientes sao ligados ao catalogo real pela API. A receita
 * nao guarda id de produto - casa por nome, porque os ids do banco mudam
 * a cada ambiente.
 *
 * Sobre a lista de produtos: buscamos com `disponivel: 'true'` e o teto
 * de limite aceito pelo servidor. A correspondencia dos ingredientes
 * precisa da vitrine inteira, nao so da primeira pagina, senao a receita
 * mostraria "ingrediente fora do marketplace" para um produto que existe
 * na pagina 3.
 */
export default function Receitas() {
  const [categoria, setCategoria] = useState('Todas');
  const [busca, setBusca] = useState('');
  const [receitaAtivaId, setReceitaAtivaId] = useState(RECEITAS[0]?.id || null);
  const [adicionando, setAdicionando] = useState(false);
  const [loteAdicionado, setLoteAdicionado] = useState(false);

  const { autenticado, ehCliente } = useAuth();
  const { adicionar } = useCarrinho();
  const { sucesso, erro: notificarErro } = useNotificacao();

  const {
    dados: dadosProdutos,
    carregando: produtosCarregando,
    erro: produtosErro,
    recarregar: recarregarProdutos,
  } = useRequisicao(() => listarProdutos({ disponivel: 'true', limite: 100 }), []);

  /*
   * `dadosProdutos?.produtos || []` cria um array novo a cada render, o
   * que invalidaria os useMemo abaixo sem necessidade. Fixar a
   * referencia enquanto a resposta nao muda evita recalculo a cada
   * tecla digitada na busca.
   */
  const produtos = useMemo(() => dadosProdutos?.produtos || [], [dadosProdutos]);

  const receitasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return RECEITAS.filter((receita) => {
      const casaCategoria = categoria === 'Todas' || receita.categoria === categoria;
      if (!casaCategoria) return false;
      if (!termo) return true;

      const noTitulo = receita.titulo.toLowerCase().includes(termo);
      const noSubtitulo = receita.subtitulo.toLowerCase().includes(termo);
      const nosIngredientes = [...receita.ingredientes, ...receita.itensDespensa].some((item) => {
        const nome = typeof item === 'string' ? item : item.nome;
        return nome.toLowerCase().includes(termo);
      });

      return noTitulo || noSubtitulo || nosIngredientes;
    });
  }, [categoria, busca]);

  /*
   * A receita ativa pode sair da lista filtrada. Nesse caso o painel
   * passa a mostrar a primeira que sobrou, em vez de esconder o
   * conteudo e deixar o usuario com uma tela vazia a direita.
   */
  const receitaAtiva =
    receitasFiltradas.find((receita) => receita.id === receitaAtivaId) ||
    receitasFiltradas[0] ||
    null;

  const ingredientesCasados = useMemo(
    () => (receitaAtiva ? casarIngredientes(receitaAtiva, produtos) : []),
    [receitaAtiva, produtos],
  );

  const itensCompraveis = ingredientesCasados.filter((item) => item.produto);
  const totalEstimado = totalDosIngredientes(ingredientesCasados);

  const adicionarUm = useCallback(
    async (produto) => {
      try {
        await adicionar(produto.id, 1);
        sucesso(`${produto.nome} foi adicionado ao carrinho.`);
      } catch (falha) {
        notificarErro(falha.mensagem || 'Nao foi possivel adicionar ao carrinho.');
      }
    },
    [adicionar, sucesso, notificarErro],
  );

  /*
   * Adiciona todos os ingredientes disponiveis de uma vez.
   *
   * Em serie, e nao em paralelo: cada chamada substitui o estado do
   * carrinho pela resposta do servidor, e disparar tudo junto faria a
   * ultima resposta sobrescrever as anteriores, perdendo itens que
   * chegaram bem. O servidor e a fonte da verdade.
   */
  const adicionarTodos = useCallback(async () => {
    if (itensCompraveis.length === 0) return;

    setAdicionando(true);
    try {
      for (const item of itensCompraveis) {
        await adicionar(item.produto.id, 1);
      }
      sucesso(`${itensCompraveis.length} ingredientes foram adicionados ao carrinho.`);
      setLoteAdicionado(true);
      setTimeout(() => setLoteAdicionado(false), 2500);
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel adicionar os ingredientes.');
    } finally {
      setAdicionando(false);
    }
  }, [itensCompraveis, adicionar, sucesso, notificarErro]);

  const podeComprar = autenticado && ehCliente;

  return (
    <div className="receitas container">
      <section className="receitas__banner">
        <span className="receitas__selo">Culinária sustentável com produtos de Toledo</span>
        <h1 className="receitas__titulo">Receitas da Terra: da roça para a sua cozinha</h1>
        <p className="receitas__subtitulo">
          Aprenda a preparar pratos nutritivos aproveitando os alimentos orgânicos da nossa
          região. Com um clique, adicione os ingredientes frescos disponíveis ao seu carrinho.
        </p>
      </section>

      <div className="receitas__filtros">
        <div className="receitas__categorias" role="group" aria-label="Filtrar por categoria">
          {CATEGORIAS_RECEITA.map((item) => (
            <button
              key={item}
              type="button"
              className={`receitas__categoria ${
                categoria === item ? 'receitas__categoria--ativa' : ''
              }`}
              aria-pressed={categoria === item}
              onClick={() => setCategoria(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="campo receitas__busca">
          <label className="campo__rotulo sr-only" htmlFor="busca-receita">
            Buscar receita ou ingrediente
          </label>
          <input
            id="busca-receita"
            className="campo__entrada"
            type="search"
            placeholder="Buscar receita ou ingrediente..."
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
          />
        </div>
      </div>

      <div className="receitas__leiaute">
        <div className="receitas__lista-coluna">
          <h2 className="receitas__lista-titulo">
            Cardápio de receitas ({receitasFiltradas.length})
          </h2>

          {receitasFiltradas.length === 0 ? (
            <p className="receitas__vazio">
              Nenhuma receita encontrada. Tente outra busca ou categoria.
            </p>
          ) : (
            <ul className="receitas__lista">
              {receitasFiltradas.map((receita) => {
                const ativa = receitaAtiva?.id === receita.id;
                const disponiveis = casarIngredientes(receita, produtos).filter(
                  (item) => item.produto,
                ).length;

                return (
                  <li key={receita.id}>
                    <button
                      type="button"
                      className={`receitas__item ${ativa ? 'receitas__item--ativa' : ''}`}
                      aria-current={ativa ? 'true' : undefined}
                      onClick={() => setReceitaAtivaId(receita.id)}
                    >
                      {receita.imagem ? (
                        <img
                          className="receitas__item-imagem"
                          src={receita.imagem}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="receitas__item-imagem receitas__item-imagem--vazia" aria-hidden="true">
                          🌿
                        </span>
                      )}

                      <span className="receitas__item-corpo">
                        <span className="receitas__item-topo">
                          <span className="receitas__item-categoria">{receita.categoria}</span>
                          <span className="receitas__item-tempo">
                            {receita.tempoPreparoMinutos} min
                          </span>
                        </span>
                        <span className="receitas__item-titulo">{receita.titulo}</span>
                        <span className="receitas__item-nota">
                          {disponiveis > 0
                            ? `${disponiveis} ${disponiveis === 1 ? 'item' : 'itens'} no marketplace`
                            : 'Ver modo de preparo'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="receitas__detalhe-coluna">
          {produtosErro && (
            <MensagemErro
              erro={produtosErro}
              aoTentarNovamente={recarregarProdutos}
            />
          )}

          {!receitaAtiva ? (
            <p className="receitas__vazio">
              Selecione uma receita ao lado para ver os detalhes e o modo de preparo.
            </p>
          ) : (
            <article className="receitas__detalhe">
              <div className="receitas__detalhe-capa">
                {receitaAtiva.imagem ? (
                  <img
                    className="receitas__detalhe-imagem"
                    src={receitaAtiva.imagem}
                    alt={receitaAtiva.titulo}
                  />
                ) : (
                  <div className="receitas__detalhe-sem-imagem" aria-hidden="true">
                    🌿
                  </div>
                )}

                <div className="receitas__detalhe-selos">
                  <span className="receitas__detalhe-selo">{receitaAtiva.categoria}</span>
                  <span className="receitas__detalhe-selo">
                    Dificuldade: {receitaAtiva.dificuldade}
                  </span>
                </div>

                <div className="receitas__detalhe-cabecalho">
                  <h2 className="receitas__detalhe-titulo">{receitaAtiva.titulo}</h2>
                  <p className="receitas__detalhe-subtitulo">{receitaAtiva.subtitulo}</p>
                </div>
              </div>

              <div className="receitas__detalhe-corpo">
                <dl className="receitas__meta">
                  <div className="receitas__meta-item">
                    <dt>Preparo</dt>
                    <dd>{receitaAtiva.tempoPreparoMinutos} minutos</dd>
                  </div>
                  <div className="receitas__meta-item">
                    <dt>Rendimento</dt>
                    <dd>{receitaAtiva.porcoes} porções</dd>
                  </div>
                  <div className="receitas__meta-item">
                    <dt>Dificuldade</dt>
                    <dd>{receitaAtiva.dificuldade}</dd>
                  </div>
                </dl>

                <p className="receitas__origem">
                  <strong>Origem da receita em Toledo:</strong> {receitaAtiva.notaOrigem}
                </p>

                <section className="receitas__secao">
                  <div className="receitas__secao-topo">
                    <div>
                      <h3 className="receitas__secao-titulo">Ingredientes da receita</h3>
                      <p className="receitas__secao-descricao">
                        Produtos marcados em verde estão fresquinhos na vitrine de Toledo.
                      </p>
                    </div>

                    {podeComprar && itensCompraveis.length > 0 && (
                      <button
                        type="button"
                        className="botao botao--primario"
                        onClick={adicionarTodos}
                        disabled={adicionando}
                      >
                        {loteAdicionado
                          ? 'Ingredientes adicionados!'
                          : `Comprar os ${itensCompraveis.length} orgânicos · ${formatarMoeda(
                              totalEstimado,
                            )}`}
                      </button>
                    )}
                  </div>

                  {produtosCarregando ? (
                    <Carregando texto="Buscando os produtos da vitrine..." />
                  ) : (
                    <ul className="receitas__ingredientes">
                      {ingredientesCasados.map((item, indice) => (
                        <li className="receitas__ingrediente" key={`${item.nome}-${indice}`}>
                          <span
                            className={`receitas__ingrediente-marca ${
                              item.produto ? 'receitas__ingrediente-marca--disponivel' : ''
                            }`}
                            title={
                              item.produto
                                ? 'Disponível no marketplace'
                                : 'Item de despensa, não vendido na plataforma'
                            }
                            aria-hidden="true"
                          />

                          <div className="receitas__ingrediente-info">
                            <span className="receitas__ingrediente-nome">
                              {item.nome}
                              <span className="receitas__ingrediente-quantidade">
                                {' '}
                                ({item.quantidade})
                              </span>
                            </span>

                            {item.produto ? (
                              <Link
                                to={`/produtos/${item.produto.id}`}
                                className="receitas__ingrediente-produtor"
                              >
                                {item.produto.nome_fazenda || 'Produtor'}
                                {item.produto.agricultor_cidade
                                  ? ` · ${item.produto.agricultor_cidade}`
                                  : ''}
                              </Link>
                            ) : (
                              /*
                               * Ingrediente da receita sem produto na
                               * vitrine hoje nao e "item de despensa": ele
                               * se compra, so nao esta anunciado agora.
                               * Chamar de despensa mandaria o usuario
                               * procurar no lugar errado.
                               */
                              <span className="receitas__ingrediente-despensa">
                                Sem oferta na vitrine no momento
                              </span>
                            )}
                          </div>

                          {item.produto && podeComprar && (
                            <button
                              type="button"
                              className="botao botao--secundario receitas__ingrediente-botao"
                              onClick={() => adicionarUm(item.produto)}
                            >
                              Adicionar · {formatarMoeda(item.produto.preco)}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {receitaAtiva.itensDespensa.length > 0 && (
                    <ul className="receitas__despensa">
                      {receitaAtiva.itensDespensa.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}

                  {!produtosCarregando && !podeComprar && (
                    <p className="receitas__aviso">
                      <Link to="/login">Entre como consumidor</Link> para adicionar os
                      ingredientes ao carrinho.
                    </p>
                  )}
                </section>

                <section className="receitas__secao">
                  <h3 className="receitas__secao-titulo">Modo de preparo</h3>
                  <ol className="receitas__passos">
                    {receitaAtiva.modoPreparo.map((passo, indice) => (
                      <li className="receitas__passo" key={passo}>
                        <span className="receitas__passo-numero" aria-hidden="true">
                          {indice + 1}
                        </span>
                        <span>{passo}</span>
                      </li>
                    ))}
                  </ol>
                </section>

                <p className="receitas__dica">
                  <strong>Dica do chef e produtor:</strong> {receitaAtiva.dicaDoChef}
                </p>
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
