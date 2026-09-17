import { Link } from 'react-router-dom';
import { formatarMoeda } from '../utils/formato.js';
import { Estrelas } from './ui.jsx';
import './produto.css';

/*
 * Card de produto na vitrine.
 *
 * O botao "Adicionar" so aparece para consumidor logado (ver
 * ProductGrid). Produto esgotado continua visivel - o consumidor pode
 * querer ver que existe e voltar depois - mas sem botao de compra, para
 * nao oferecer uma acao que o servidor vai recusar.
 */
export default function ProductCard({ produto, aoAdicionar, adicionando }) {
  const esgotado = produto.estoque <= 0;
  const semImagem = !produto.imagem_url;

  return (
    <article className="produto-card">
      <Link to={`/produtos/${produto.id}`} className="produto-card__link-imagem">
        {semImagem ? (
          <div className="produto-card__sem-imagem" aria-hidden="true">
            🌿
          </div>
        ) : (
          <img
            className="produto-card__imagem"
            src={produto.imagem_url}
            alt={produto.nome}
            loading="lazy"
          />
        )}
        {esgotado && <span className="produto-card__faixa">Esgotado</span>}
      </Link>

      <div className="produto-card__corpo">
        {produto.categoria_nome && (
          <span className="produto-card__categoria">{produto.categoria_nome}</span>
        )}

        <h3 className="produto-card__nome">
          <Link to={`/produtos/${produto.id}`}>{produto.nome}</Link>
        </h3>

        <p className="produto-card__produtor">
          {produto.agricultor_id ? (
            <Link to={`/agricultores/${produto.agricultor_id}`}>
              {produto.nome_fazenda || 'Produtor'}
            </Link>
          ) : (
            produto.nome_fazenda
          )}
          {produto.agricultor_cidade && (
            <span className="produto-card__local">
              {' '}
              · {produto.agricultor_cidade}/{produto.agricultor_estado}
            </span>
          )}
        </p>

        <Estrelas nota={produto.media_avaliacoes} total={produto.total_avaliacoes} />

        <div className="produto-card__rodape">
          <p className="produto-card__preco">
            {formatarMoeda(produto.preco)}
            <span className="produto-card__unidade"> / {produto.unidade}</span>
          </p>

          {aoAdicionar && (
            <button
              type="button"
              className="botao botao--primario"
              disabled={esgotado || adicionando}
              onClick={() => aoAdicionar(produto)}
            >
              {esgotado ? 'Esgotado' : adicionando ? 'Adicionando...' : 'Adicionar'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
