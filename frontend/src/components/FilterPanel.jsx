import { ESTADOS } from '../utils/estados.js';

/*
 * Painel de filtros da vitrine.
 *
 * Componente controlado: o estado dos filtros vive na pagina, nao aqui.
 * Isso permite que a pagina leia os filtros da URL (compartilhar um
 * link filtrado) e recarregue a lista sem depender deste componente.
 */
export default function FilterPanel({ filtros, categorias, aoAlterar, aoLimpar, aoAplicar }) {
  const temFiltro =
    filtros.busca ||
    filtros.categoria_id ||
    filtros.cidade ||
    filtros.estado ||
    filtros.preco_min ||
    filtros.preco_max ||
    filtros.disponivel === 'false';

  return (
    <aside className="filtros" aria-label="Filtros de produtos">
      <div className="filtros__titulo">
        <h2>Filtros</h2>
        {temFiltro && (
          <button type="button" className="filtros__limpar" onClick={aoLimpar}>
            Limpar
          </button>
        )}
      </div>

      <div className="filtros__grupo">
        <label className="filtros__rotulo" htmlFor="filtro-categoria">
          Categoria
        </label>
        <select
          id="filtro-categoria"
          className="campo__selecao"
          value={filtros.categoria_id || ''}
          onChange={(evento) => aoAlterar('categoria_id', evento.target.value)}
        >
          <option value="">Todas</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="filtros__grupo">
        <label className="filtros__rotulo" htmlFor="filtro-cidade">
          Cidade
        </label>
        <input
          id="filtro-cidade"
          type="text"
          className="campo__entrada"
          placeholder="Ex.: Campinas"
          value={filtros.cidade || ''}
          onChange={(evento) => aoAlterar('cidade', evento.target.value)}
        />
      </div>

      <div className="filtros__grupo">
        <label className="filtros__rotulo" htmlFor="filtro-estado">
          Estado
        </label>
        <select
          id="filtro-estado"
          className="campo__selecao"
          value={filtros.estado || ''}
          onChange={(evento) => aoAlterar('estado', evento.target.value)}
        >
          <option value="">Todos</option>
          {ESTADOS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </div>

      <div className="filtros__grupo">
        <span className="filtros__rotulo">Faixa de preco</span>
        <div className="filtros__faixa">
          <input
            type="number"
            min="0"
            step="0.01"
            className="campo__entrada"
            placeholder="Minimo"
            aria-label="Preco minimo"
            value={filtros.preco_min || ''}
            onChange={(evento) => aoAlterar('preco_min', evento.target.value)}
          />
          <span aria-hidden="true">ate</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className="campo__entrada"
            placeholder="Maximo"
            aria-label="Preco maximo"
            value={filtros.preco_max || ''}
            onChange={(evento) => aoAlterar('preco_max', evento.target.value)}
          />
        </div>
      </div>

      <div className="filtros__grupo">
        <label className="filtros__rotulo" htmlFor="filtro-ordenar">
          Ordenar por
        </label>
        <select
          id="filtro-ordenar"
          className="campo__selecao"
          value={filtros.ordenar || 'recentes'}
          onChange={(evento) => aoAlterar('ordenar', evento.target.value)}
        >
          <option value="recentes">Mais recentes</option>
          <option value="baratos">Menor preco</option>
          <option value="caros">Maior preco</option>
          <option value="nome">Nome (A-Z)</option>
          <option value="avaliacao">Melhor avaliados</option>
        </select>
      </div>

      <div className="filtros__grupo">
        <label className="campo__linha" htmlFor="filtro-disponivel">
          <input
            id="filtro-disponivel"
            type="checkbox"
            checked={filtros.disponivel === 'false'}
            onChange={(evento) =>
              aoAlterar('disponivel', evento.target.checked ? 'false' : 'true')
            }
          />{' '}
          <span className="filtros__rotulo">Incluir produtos esgotados</span>
        </label>
      </div>

      <div className="filtros__acoes">
        <button type="button" className="botao botao--primario botao--bloco" onClick={aoAplicar}>
          Aplicar filtros
        </button>
      </div>
    </aside>
  );
}