import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCarrinho } from '../contexts/CarrinhoContext.jsx';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import CartItem from '../components/CartItem.jsx';
import { Carregando, MensagemErro, EstadoVazio } from '../components/ui.jsx';
import { formatarMoeda } from '../utils/formato.js';
import '../components/pedido.css';

/*
 * Carrinho.
 *
 * Todos os valores exibidos vem da resposta da API (subtotal,
 * valor_produtos, frete estimado), e nao de contas feitas aqui. Se o
 * preco mudou no servidor desde que o item foi adicionado, a tela
 * mostra o valor novo - e nao uma conta local que divergiria do
 * checkout.
 */
export default function Carrinho() {
  const { carrinho, carregando, erro, recarregar, definirQuantidade, remover, esvaziar } =
    useCarrinho();
  const { sucesso, erro: notificarErro } = useNotificacao();
  const navegar = useNavigate();

  /* Guarda qual item esta em transito, para desabilitar so aquele. */
  const [ocupado, setOcupado] = useState(null);

  /*
   * O CartItem chama o callback com (produtoId, quantidade). Ignorar o
   * primeiro argumento aqui trocaria os parametros: o id do produto
   * viraria "quantidade" e o carrinho pediria a quantidade errada.
   */
  async function alterar(produtoId, novaQuantidade) {
    if (!Number.isFinite(novaQuantidade) || novaQuantidade < 1) return;
    setOcupado(produtoId);
    try {
      await definirQuantidade(produtoId, novaQuantidade);
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel alterar a quantidade.');
    } finally {
      setOcupado(null);
    }
  }

  async function removerItem(produtoId) {
    setOcupado(produtoId);
    try {
      await remover(produtoId);
      sucesso('Item removido do carrinho.');
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel remover o item.');
    } finally {
      setOcupado(null);
    }
  }

  async function esvaziarTudo() {
    try {
      await esvaziar();
      sucesso('Carrinho esvaziado.');
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel esvaziar o carrinho.');
    }
  }

  if (carregando) return <Carregando texto="Carregando seu carrinho..." />;

  if (erro) {
    return (
      <div className="container carrinho">
        <h1>Meu carrinho</h1>
        <MensagemErro erro={erro} aoTentarNovamente={recarregar} />
      </div>
    );
  }

  const itens = carrinho.itens || [];
  const indisponiveis = itens.filter((item) => item.disponivel === false);

  if (itens.length === 0) {
    return (
      <div className="container carrinho">
        <h1>Meu carrinho</h1>
        <EstadoVazio
          titulo="Seu carrinho esta vazio"
          descricao="Explore os produtos orgânicos e adicione itens para continuar."
          acao={
            <Link to="/produtos" className="botao botao--primario">
              Ver produtos
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container carrinho">
      <header className="carrinho__cabecalho">
        <h1>Meu carrinho</h1>
        <button type="button" className="botao botao--texto" onClick={esvaziarTudo}>
          Esvaziar carrinho
        </button>
      </header>

      <div className="carrinho__corpo">
        <ul className="carrinho__itens">
          {itens.map((item) => (
            <CartItem
              key={item.produto_id}
              item={item}
              atualizando={ocupado === item.produto_id}
              aoAlterarQuantidade={alterar}
              aoRemover={removerItem}
            />
          ))}
        </ul>

        <aside className="resumo" aria-label="Resumo do pedido">
          <h2 className="resumo__titulo">Resumo</h2>

          <div className="resumo__linhas">
            <div className="resumo__linha">
              <span>Produtos</span>
              <span>{formatarMoeda(carrinho.valor_produtos)}</span>
            </div>
            <div className="resumo__linha">
              <span>Unidades</span>
              <span>{carrinho.total_unidades}</span>
            </div>
            <div className="resumo__linha resumo__linha--total">
              <span>Total parcial</span>
              <span>{formatarMoeda(carrinho.valor_total)}</span>
            </div>
          </div>

          <p className="resumo__destaque">
            O frete e calculado no checkout, a partir do endereco escolhido.
          </p>

          {indisponiveis.length > 0 && (
            <p className="carrinho-item__aviso">
              {indisponiveis.length} item(ns) sem estoque suficiente. Ajuste ou remova antes de
              continuar.
            </p>
          )}

          <button
            type="button"
            className="botao botao--primario botao--bloco"
            disabled={indisponiveis.length > 0}
            onClick={() => navegar('/checkout')}
          >
            Ir para o checkout
          </button>

          <Link to="/produtos" className="botao botao--texto botao--bloco">
            Continuar comprando
          </Link>
        </aside>
      </div>
    </div>
  );
}