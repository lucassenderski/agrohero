import { Link } from 'react-router-dom';
import { formatarMoeda, formatarQuantidade } from '../utils/formato.js';
import './pedido.css';

/*
 * Linha de item no carrinho.
 *
 * O preco exibido vem do SERVIDOR (preco_unitario e subtotal calculados
 * no backend a partir do preco atual). A tela nunca multiplica
 * quantidade por preco para mostrar total: se o preco mudou desde que a
 * pagina carregou, a conta local estaria errada e o usuario veria um
 * valor diferente do que vai pagar.
 */
export default function CartItem({ item, aoAlterarQuantidade, aoRemover, atualizando }) {
  const produto = item.produto || {};
  const indisponivel = item.disponivel === false;

  return (
    <li className={`carrinho-item ${indisponivel ? 'carrinho-item--indisponivel' : ''}`}>
      <div className="carrinho-item__imagem-area">
        {produto.imagem_url ? (
          <img
            className="carrinho-item__imagem"
            src={produto.imagem_url}
            alt={produto.nome || 'Produto'}
            loading="lazy"
          />
        ) : (
          <div className="carrinho-item__sem-imagem" aria-hidden="true">
            🌿
          </div>
        )}
      </div>

      <div className="carrinho-item__dados">
        <h3 className="carrinho-item__nome">
          <Link to={`/produtos/${item.produto_id ?? produto.id}`}>
            {produto.nome || 'Produto'}
          </Link>
        </h3>

        {produto.nome_fazenda && (
          <p className="carrinho-item__produtor">
            {produto.agricultor_id ? (
              <Link to={`/agricultores/${produto.agricultor_id}`}>
                {produto.nome_fazenda}
              </Link>
            ) : (
              produto.nome_fazenda
            )}
          </p>
        )}

        <p className="carrinho-item__preco">
          {formatarMoeda(item.preco_unitario)}
          <span className="carrinho-item__unidade"> / {produto.unidade || 'unidade'}</span>
        </p>

        {indisponivel && (
          <p className="carrinho-item__aviso" role="status">
            {item.estoque_disponivel > 0
              ? `So ha ${formatarQuantidade(item.estoque_disponivel, produto.unidade)} em estoque.`
              : 'Produto esgotado ou fora do ar.'}{' '}
            Ajuste ou remova para continuar.
          </p>
        )}

        <div className="carrinho-item__acoes">
          <div className="carrinho-item__quantidade">
            <label className="sr-only" htmlFor={`qtd-${item.item_id}`}>
              Quantidade
            </label>
            <button
              type="button"
              className="carrinho-item__passo"
              disabled={atualizando || item.quantidade <= 1}
              onClick={() => aoAlterarQuantidade(item.produto_id ?? produto.id, item.quantidade - 1)}
              aria-label="Diminuir quantidade"
            >
              −
            </button>
            <input
              id={`qtd-${item.item_id}`}
              type="number"
              min="1"
              max={item.estoque_disponivel || undefined}
              className="carrinho-item__entrada"
              value={item.quantidade}
              disabled={atualizando}
              onChange={(evento) =>
                aoAlterarQuantidade(
                  item.produto_id ?? produto.id,
                  Number(evento.target.value),
                )
              }
            />
            <button
              type="button"
              className="carrinho-item__passo"
              disabled={atualizando}
              onClick={() => aoAlterarQuantidade(item.produto_id ?? produto.id, item.quantidade + 1)}
              aria-label="Aumentar quantidade"
            >
              +
            </button>
          </div>

          <button
            type="button"
            className="botao botao--texto"
            disabled={atualizando}
            onClick={() => aoRemover(item.produto_id ?? produto.id)}
          >
            Remover
          </button>
        </div>
      </div>

      <div className="carrinho-item__subtotal">
        <span className="carrinho-item__subtotal-rotulo">Subtotal</span>
        <strong>{formatarMoeda(item.subtotal)}</strong>
      </div>
    </li>
  );
}