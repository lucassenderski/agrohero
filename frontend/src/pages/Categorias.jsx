import { Link } from 'react-router-dom';
import { listarCategorias } from '../services/catalogo.js';
import { useRequisicao } from '../hooks/useRequisicao.js';
import { Carregando, MensagemErro, EstadoVazio } from '../components/ui.jsx';

/*
 * Lista de categorias.
 *
 * Cada categoria leva para a vitrine ja filtrada (`?categoria_id=`),
 * que e o que o usuario quer ao clicar - e nao uma pagina propria de
 * categoria sem os produtos.
 */
export default function Categorias() {
  const { dados, carregando, erro, recarregar } = useRequisicao(() => listarCategorias(), []);

  if (carregando) return <Carregando texto="Carregando categorias..." />;

  const categorias = (dados || []).filter((categoria) => categoria.ativo !== false);

  return (
    <div className="container vitrine">
      <header className="vitrine__cabecalho">
        <h1>Categorias</h1>
        <p className="vitrine__resultado">
          Navegue pelos tipos de produto oferecidos pelos produtores.
        </p>
      </header>

      {erro && <MensagemErro erro={erro} aoTentarNovamente={recarregar} />}

      {!erro && categorias.length === 0 && (
        <EstadoVazio
          titulo="Nenhuma categoria cadastrada"
          descricao="Assim que houver categorias ativas, elas aparecem aqui."
        />
      )}

      {categorias.length > 0 && (
        <div className="categoria-grade">
          {categorias.map((categoria) => (
            <Link
              key={categoria.id}
              to={`/produtos?categoria_id=${categoria.id}`}
              className="categoria-card"
            >
              <h2 className="categoria-card__nome">{categoria.nome}</h2>
              {categoria.descricao && (
                <p className="categoria-card__descricao">{categoria.descricao}</p>
              )}
              <span className="categoria-card__contagem">
                {categoria.total_produtos ?? 0} produto(s)
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}