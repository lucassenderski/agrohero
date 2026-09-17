import ProductCard from './ProductCard.jsx';
import { Carregando, EstadoVazio } from './ui.jsx';
import './produto.css';

/*
 * Grade de produtos com os tres estados que a tela precisa tratar:
 * carregando, vazio e com resultado. Deixar isso aqui evita repetir a
 * mesma cadeia de `if` em cada pagina que lista produtos.
 */
export default function ProductGrid({
  produtos,
  carregando,
  aoAdicionar,
  produtoAdicionando,
  tituloVazio = 'Nenhum produto encontrado',
  descricaoVazio = 'Tente ajustar a busca ou os filtros.',
  acaoVazio,
}) {
  if (carregando) return <Carregando texto="Carregando produtos..." />;

  if (!produtos || produtos.length === 0) {
    return (
      <EstadoVazio titulo={tituloVazio} descricao={descricaoVazio} acao={acaoVazio} />
    );
  }

  return (
    <div className="produto-grade">
      {produtos.map((produto) => (
        <ProductCard
          key={produto.id}
          produto={produto}
          aoAdicionar={aoAdicionar}
          adicionando={produtoAdicionando === produto.id}
        />
      ))}
    </div>
  );
}
