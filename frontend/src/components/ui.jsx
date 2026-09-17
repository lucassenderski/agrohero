import './ui.css';

/*
 * Componentes visuais basicos.
 *
 * Ficam juntos em um arquivo porque sao pequenos e sempre usados em
 * conjunto; separar cada um em pasta propria daria 8 arquivos de 20
 * linhas e nenhum ganho de leitura.
 */

export function Carregando({ texto = 'Carregando...' }) {
  return (
    <div className="carregando" role="status" aria-live="polite">
      <span className="carregando__roda" aria-hidden="true" />
      <span className="carregando__texto">{texto}</span>
    </div>
  );
}

/*
 * Mensagem de erro.
 *
 * `ErroApi.detalhes` traz a lista de campos invalidos do backend
 * ({ campo, mensagem }); mostramos junto porque "Dados invalidos" nao
 * diz ao usuario o que corrigir.
 */
export function MensagemErro({ erro, aoTentarNovamente }) {
  if (!erro) return null;

  const detalhes = erro.detalhes || [];

  return (
    <div className="mensagem-erro" role="alert">
      <p className="mensagem-erro__titulo">{erro.mensagem || 'Ocorreu um erro.'}</p>

      {detalhes.length > 0 && (
        <ul className="mensagem-erro__lista">
          {detalhes.map((item, indice) => (
            <li key={`${item.campo || 'campo'}-${indice}`}>
              {item.campo ? `${item.campo}: ${item.mensagem}` : item.mensagem}
            </li>
          ))}
        </ul>
      )}

      {aoTentarNovamente && (
        <button type="button" className="botao botao--secundario" onClick={aoTentarNovamente}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function EstadoVazio({ titulo, descricao, acao }) {
  return (
    <div className="estado-vazio">
      <h3 className="estado-vazio__titulo">{titulo}</h3>
      {descricao && <p className="estado-vazio__descricao">{descricao}</p>}
      {acao}
    </div>
  );
}

/*
 * Selo de status do pedido.
 *
 * A cor vem do status para o produtor bater o olho e saber o que esta
 * pendente. O texto sempre acompanha: cor sozinha nao serve para quem
 * nao distingue cores.
 */
export function Selo({ children, variante = 'neutro' }) {
  return <span className={`selo selo--${variante}`}>{children}</span>;
}

export function Paginacao({ paginacao, aoMudarPagina }) {
  if (!paginacao || paginacao.paginas <= 1) return null;

  const { pagina, paginas, temAnterior, temProxima } = paginacao;

  return (
    <nav className="paginacao" aria-label="Paginacao">
      <button
        type="button"
        className="botao botao--secundario"
        disabled={!temAnterior}
        onClick={() => aoMudarPagina(pagina - 1)}
      >
        Anterior
      </button>

      <span className="paginacao__posicao">
        Pagina {pagina} de {paginas}
      </span>

      <button
        type="button"
        className="botao botao--secundario"
        disabled={!temProxima}
        onClick={() => aoMudarPagina(pagina + 1)}
      >
        Proxima
      </button>
    </nav>
  );
}

export function Estrelas({ nota, total }) {
  const valor = Number(nota) || 0;
  const cheias = Math.round(valor);

  /*
   * `total === undefined` significa "nota isolada" (a avaliacao de uma
   * pessoa), e nao "produto sem avaliacoes". Sem essa distincao, uma
   * avaliacao de 5 estrelas apareceria com o texto "Sem avaliacoes" ao
   * lado, o que se contradiz.
   */
  const temResumo = total !== undefined && total !== null;

  return (
    <span
      className="estrelas"
      title={temResumo ? `Media ${valor.toFixed(1)} de ${total} avaliacoes` : undefined}
    >
      <span aria-hidden="true">
        {'★'.repeat(cheias)}
        {'☆'.repeat(5 - cheias)}
      </span>
      {temResumo && (
        <span className="estrelas__valor">
          {total > 0 ? `${valor.toFixed(1)} (${total})` : 'Sem avaliacoes'}
        </span>
      )}
      <span className="sr-only">
        {temResumo
          ? `Nota ${valor.toFixed(1)} de 5, ${total} avaliacoes.`
          : `Nota ${valor.toFixed(1)} de 5.`}
      </span>
    </span>
  );
}

export function Modal({ titulo, aberto, aoFechar, children, acoes }) {
  if (!aberto) return null;

  return (
    <div className="modal-fundo" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="modal">
        <div className="modal__cabecalho">
          <h2 className="modal__titulo">{titulo}</h2>
          <button
            type="button"
            className="modal__fechar"
            onClick={aoFechar}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="modal__corpo">{children}</div>
        {acoes && <div className="modal__acoes">{acoes}</div>}
      </div>
    </div>
  );
}
