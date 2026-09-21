import { useCallback, useEffect, useState } from 'react';
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
  const [estado, setEstado] = useState({ status: 'carregando' });
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

  useEffect(() => {
    let cancelado = false;

    // O /health fica fora do /api/v1, entao montamos a URL sem o sufixo.
    const urlBase = (import.meta.env.VITE_API_URL ).replace(
      /\/api\/v1\/?$/,
      '',
    );

    fetch(`${urlBase}/health`)
      .then(async (resposta) => {
        const corpo = await resposta.json();
        if (cancelado) return;
        if (resposta.ok && corpo?.dados?.banco === 'ok') {
          setEstado({ status: 'ok', dados: corpo.dados });
        } else {
          setEstado({
            status: 'erro',
            mensagem:
              corpo?.erro?.mensagem || 'A API respondeu, mas o banco esta indisponivel.',
          });
        }
      })
      .catch(() => {
        if (cancelado) return;
        setEstado({
          status: 'erro',
          mensagem:
            'Nao foi possivel falar com a API. Confira se o backend esta rodando na porta 3001.',
        });
      });

    return () => {
      cancelado = true;
    };
  }, []);

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

      <section className="home__diagnostico" aria-live="polite">
        <div>
          <p className="home__eyebrow">Tudo que sua mesa precisa</p>
          <h2 className="home__diagnostico-titulo">Escolha por categoria</h2>
        </div>
        <div className="home__categorias">
          <Link to="/produtos" className="home__categoria home__categoria--ativa">
            Todos os alimentos
          </Link>
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
              key={categoria.id}
            >
              {categoria.nome}
            </Link>
          ))}
        </div>

        {estado.status === 'carregando' && (
          <p className="home__mensagem">Verificando a conexão com a API...</p>
        )}

        {estado.status === 'ok' && (
          <ul className="home__lista">
            <li>
              <strong>API:</strong> {estado.dados.api}
            </li>
            <li>
              <strong>PostgreSQL:</strong> {estado.dados.banco}
            </li>
            <li>
              <strong>Ambiente:</strong> {estado.dados.ambiente}
            </li>
            <li>
              <strong>Latencia do banco:</strong> {estado.dados.latenciaBancoMs} ms
            </li>
          </ul>
        )}

        {estado.status === 'erro' && (
          <p className="home__mensagem home__mensagem--erro">{estado.mensagem}</p>
        )}
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