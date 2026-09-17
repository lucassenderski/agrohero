import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listarProdutos, listarCategorias } from '../services/catalogo.js';
import { useRequisicao } from '../hooks/useRequisicao.js';
import { useCarrinho } from '../contexts/CarrinhoContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import SearchBar from '../components/SearchBar.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import ProductGrid from '../components/ProductGrid.jsx';
import { Paginacao, MensagemErro } from '../components/ui.jsx';

const FILTROS_PADRAO = {
  busca: '',
  categoria_id: '',
  cidade: '',
  estado: '',
  preco_min: '',
  preco_max: '',
  disponivel: 'true',
  ordenar: 'recentes',
  pagina: 1,
};

/*
 * Vitrine de produtos.
 *
 * O estado dos filtros vive na URL (useSearchParams), nao em useState.
 * Assim o link pode ser compartilhado e o botao "voltar" do navegador
 * desfaz o filtro em vez de sair da pagina.
 *
 * Os campos de texto so vao para a URL quando o usuario confirma (Enter
 * ou "Aplicar"), evitando uma requisicao por letra digitada. Os selects
 * aplicam na hora, porque ali a escolha ja e definitiva.
 */
export default function Produtos() {
  const [parametros, setParametros] = useSearchParams();
  const { autenticado, ehCliente } = useAuth();
  const { adicionar } = useCarrinho();
  const { sucesso, erro: notificarErro } = useNotificacao();
  const [adicionandoId, setAdicionandoId] = useState(null);

  /* Filtros "rascunho": o que esta na tela antes de aplicar. */
  const filtrosDaUrl = useMemo(
    () => ({
      ...FILTROS_PADRAO,
      ...Object.fromEntries(parametros.entries()),
    }),
    [parametros],
  );

  const [rascunho, setRascunho] = useState(filtrosDaUrl);

  /*
   * A busca roda de novo quando a QUERY STRING muda - comparamos o
   * texto serializado, e nao o objeto, porque duas renderizacoes
   * produzem objetos diferentes com o mesmo conteudo e disparariam
   * requisicoes repetidas.
   */
  const chave = parametros.toString();

  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => listarProdutos(Object.fromEntries(new URLSearchParams(chave).entries())),
    [chave],
  );

  const categorias = useRequisicao(() => listarCategorias(), []);

  /* Sincroniza o rascunho quando a URL muda por fora (voltar, limpar). */
  useEffect(() => {
    setRascunho(filtrosDaUrl);
  }, [filtrosDaUrl]);

  function aplicar(novosFiltros, { reiniciarPagina = true } = {}) {
    const combinados = { ...filtrosDaUrl, ...novosFiltros };
    if (reiniciarPagina) combinados.pagina = 1;

    /* Remove o que esta no padrao para manter a URL limpa. */
    const limpos = new URLSearchParams();
    Object.entries(combinados).forEach(([campo, valor]) => {
      const padrao = FILTROS_PADRAO[campo];
      if (valor !== '' && valor !== null && String(valor) !== String(padrao)) {
        limpos.set(campo, valor);
      }
    });
    setParametros(limpos);
  }

  /*
   * Selects e checkbox aplicam na hora (a escolha e definitiva); campos
   * de texto so entram quando confirmados, para nao disparar uma
   * requisicao por letra digitada.
   */
  function alterarRascunho(campo, valor) {
    const proximo = { ...rascunho, [campo]: valor };
    setRascunho(proximo);

    if (['categoria_id', 'estado', 'ordenar', 'disponivel'].includes(campo)) {
      aplicar(proximo);
    }
  }

  function limpar() {
    setParametros(new URLSearchParams());
  }

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
    [adicionar, sucesso, notificarErro],
  );

  const produtos = dados?.produtos || [];
  const paginacao = dados?.paginacao;

  return (
    <div className="container vitrine">
      <header className="vitrine__cabecalho">
        <h1>Produtos organicos</h1>
        <SearchBar
          valorInicial={rascunho.busca}
          aoBuscar={(termo) => aplicar({ ...rascunho, busca: termo })}
        />
        {!carregando && paginacao && (
          <p className="vitrine__resultado">
            {paginacao.total === 0
              ? 'Nenhum produto encontrado.'
              : `${paginacao.total} produto(s) encontrado(s).`}
          </p>
        )}
      </header>

      <div className="vitrine__corpo">
        <FilterPanel
          filtros={rascunho}
          categorias={categorias.dados || []}
          aoAlterar={alterarRascunho}
          aoLimpar={limpar}
          aoAplicar={() => aplicar(rascunho)}
        />

        <section aria-label="Resultados">
          {erro ? (
            <MensagemErro erro={erro} aoTentarNovamente={recarregar} />
          ) : (
            <>
              <ProductGrid
                produtos={produtos}
                carregando={carregando}
                aoAdicionar={autenticado && ehCliente ? adicionarAoCarrinho : undefined}
                produtoAdicionando={adicionandoId}
                descricaoVazio="Tente ajustar a busca, a categoria ou a faixa de preco."
              />
              <Paginacao
                paginacao={paginacao}
                aoMudarPagina={(pagina) => aplicar({ pagina }, { reiniciarPagina: false })}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}