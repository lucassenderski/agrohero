import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { listarCategorias, listarProdutos } from '../services/catalogo.js';
import { useRequisicao } from '../hooks/useRequisicao.js';
import { useCarrinho } from '../contexts/CarrinhoContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import ProductGrid from '../components/ProductGrid.jsx';
import { MensagemErro } from '../components/ui.jsx';
import './Home.css';
export default function Home() {
  const { autenticado, ehCliente } = useAuth();
  const { adicionar } = useCarrinho();
  const { sucesso, erro: notificarErro } = useNotificacao();
  const [adicionandoId, setAdicionandoId] = useState(null);
  const {
    dados: produtosDados,
    carregando: produtosCarregando,
    erro: produtosErro,
    recarregar: recarregarProdutos,
  } = useRequisicao(
    () => listarProdutos({ limite: 8, ordenar: 'recentes', disponivel: 'true' }),
    [],
  );
  const { dados: categoriasDados } = useRequisicao(() => listarCategorias(), []);
  const categorias = categoriasDados || [];

  const adicionarAoCarrinho = useCallback(
    async (produto) => {
      setAdicionandoId(produto.id);
      try {
        await adicionar(produto.id, 1);
        sucesso(`"${produto.nome}" adicionado ao carrinho.`);
      } catch (falha) {
        notificarErro(falha.mensagem || 'Nao foi possivel adicionar ao carrinho.');
      } finally {
        setAdicionandoId(null);
      }
    },
    [adicionar, notificarErro, sucesso],
  );

  return (
    <div className="container home">
      <section className="home__hero">
        <p className="home__selo">⌖ Agro Hero Toledo · Agricultura familiar & orgânicos</p>
        <h1 className="home__titulo">Alimentos orgânicos <mark>frescos</mark> direto de quem planta em Toledo.</h1>
        <p className="home__subtitulo">
          Conectamos você aos produtores familiares de Novo Sarandi, Concórdia do Oeste,
          Dez de Maio e Vila Nova. Colheita fresca, preço justo para o agricultor e saúde
          pura para a sua mesa.
        </p>
        <div className="home__acoes">
          <Link className="botao botao--destaque" to="/produtos">
            Ver produtos locais <span>→</span>
          </Link>
          <Link className="botao botao--contorno" to="/agricultores">
            Conheça os produtores
          </Link>
        </div>
        <div className="home__beneficios">
          <span>♧ Zero agrotóxicos</span>
          <span>↗ Renda 100% ao agricultor</span>
          <span>▣ Entregas em Toledo</span>
          <span>⌖ Ponto Lago Municipal</span>
        </div>
      </section>

      <section className="home__categorias-secao">
        <div>
          <p className="home__eyebrow">Tudo que sua mesa precisa</p>
          <h2 className="home__categorias-titulo">Escolha por categoria</h2>
        </div>
        <div className="home__categorias">
          <Link to="/produtos" className="home__categoria home__categoria--ativa">
            Todos os alimentos
          </Link>
          {/* Os placeholders abaixo nao tem id (id: null). Como chave, o id
              daria tres chaves iguais e o React avisa "same key" e deixa o
              comportamento dos itens indefinido. O nome e unico na lista e
              serve nos dois casos. */}
          {(categorias.length > 0
            ? categorias.filter((categoria) => categoria.ativo !== false).slice(0, 3)
            : ['Verduras & folhas', 'Legumes & raízes', 'Frutas da estação'].map((nome) => ({
                id: null,
                nome,
              }))
          ).map((categoria) => (
            <Link
              to={
                categoria.id
                  ? `/produtos?categoria_id=${categoria.id}`
                  : '/categorias'
              }
              className="home__categoria"
              key={categoria.id ?? categoria.nome}
            >
              {categoria.nome}
            </Link>
          ))}
        </div>
      </section>

      <section className="home__proximas">
        <p className="home__eyebrow">Feito perto, feito com cuidado</p>
        <h2>Da nossa terra para a sua cozinha</h2>
        <p>
          Explore alimentos cultivados por quem conhece cada canto da nossa região.
          Compre direto, apoie a agricultura familiar e receba produtos de verdade.
        </p>
      </section>

      <section className="home__produtos" aria-labelledby="produtos-destaque">
        <div className="home__secao-cabecalho">
          <div>
            <p className="home__eyebrow">Colhidos para você</p>
            <h2 id="produtos-destaque">Produtos em destaque</h2>
          </div>
          <Link className="home__ver-todos" to="/produtos">
            Ver todos →
          </Link>
        </div>
        {produtosErro ? (
          <MensagemErro erro={produtosErro} aoTentarNovamente={recarregarProdutos} />
        ) : (
          <ProductGrid
            produtos={produtosDados?.produtos || []}
            carregando={produtosCarregando}
            aoAdicionar={autenticado && ehCliente ? adicionarAoCarrinho : undefined}
            produtoAdicionando={adicionandoId}
            descricaoVazio="Ainda nao ha produtos disponiveis no marketplace."
          />
        )}
      </section>
    </div>
  );
}