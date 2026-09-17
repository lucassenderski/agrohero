import { useCallback, useEffect, useState } from 'react';
import {
  listarMeusProdutos,
  criarProduto,
  atualizarProduto,
  alterarDisponibilidade,
  reporEstoque,
} from '../services/painel.js';
import { listarCategorias } from '../services/catalogo.js';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import { useFormulario } from '../hooks/useMutacao.js';
import { Carregando, MensagemErro, EstadoVazio, Modal, Paginacao, Selo } from '../components/ui.jsx';
import { formatarMoeda, formatarQuantidade } from '../utils/formato.js';
import { validarPreco, validarEstoque, validarNome } from '../utils/validacao.js';
import '../components/pedido.css';

const PRODUTO_VAZIO = {
  nome: '',
  descricao: '',
  preco: '',
  estoque: '',
  unidade: 'kg',
  categoria_id: '',
  imagem_url: '',
};

/*
 * Gestao de produtos do produtor.
 *
 * O produtor so mexe nos proprios produtos - o backend confere a
 * propriedade em toda escrita e devolve 404 se o produto for de outro.
 * A tela nao envia agricultor_id: ele vem do token.
 */
export default function AgricultorProdutos() {
  const { sucesso, erro: notificarErro } = useNotificacao();

  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [paginacao, setPaginacao] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [editando, setEditando] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [errosCampo, setErrosCampo] = useState({});

  const [repondo, setRepondo] = useState(null);
  const [quantidadeRepor, setQuantidadeRepor] = useState('');

  const { valores, alterar, reiniciar } = useFormulario(PRODUTO_VAZIO);

  const carregar = useCallback(async (paginaAlvo = pagina) => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await listarMeusProdutos({ pagina: paginaAlvo, limite: 20 });
      setProdutos(resposta.produtos || []);
      setPaginacao(resposta.paginacao || null);
    } catch (falha) {
      setErro(falha);
    } finally {
      setCarregando(false);
    }
  }, [pagina]);

  useEffect(() => {
    carregar(pagina);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina]);

  useEffect(() => {
    (async () => {
      try {
        setCategorias((await listarCategorias()) || []);
      } catch {
        /* Categoria nao impede o cadastro; o campo fica vazio. */
      }
    })();
  }, []);

  function abrirNovo() {
    setEditando(null);
    reiniciar(PRODUTO_VAZIO);
    setErrosCampo({});
    setModalAberto(true);
  }

  function abrirEdicao(produto) {
    setEditando(produto);
    reiniciar({
      nome: produto.nome || '',
      descricao: produto.descricao || '',
      preco: String(produto.preco ?? ''),
      estoque: String(produto.estoque ?? ''),
      unidade: produto.unidade || 'kg',
      categoria_id: String(produto.categoria_id ?? ''),
      imagem_url: produto.imagem_url || '',
    });
    setErrosCampo({});
    setModalAberto(true);
  }

  /* Valida no cliente antes de gastar uma ida ao servidor. */
  function validar() {
    const problemas = {};
    const problemaNome = validarNome(valores.nome);
    if (problemaNome) problemas.nome = problemaNome;

    const problemaPreco = validarPreco(valores.preco);
    if (problemaPreco) problemas.preco = problemaPreco;

    const problemaEstoque = validarEstoque(valores.estoque);
    if (problemaEstoque) problemas.estoque = problemaEstoque;

    if (!valores.categoria_id) problemas.categoria_id = 'Escolha uma categoria.';

    setErrosCampo(problemas);
    return Object.keys(problemas).length === 0;
  }

  async function salvar(evento) {
    evento.preventDefault();
    if (!validar()) return;

    const corpo = {
      nome: valores.nome.trim(),
      descricao: valores.descricao.trim() || undefined,
      preco: Number(valores.preco),
      estoque: Number(valores.estoque),
      unidade: valores.unidade,
      categoria_id: Number(valores.categoria_id),
      imagem_url: valores.imagem_url.trim() || undefined,
    };

    setSalvando(true);
    try {
      if (editando) {
        await atualizarProduto(editando.id, corpo);
        sucesso('Produto atualizado.');
      } else {
        await criarProduto(corpo);
        sucesso('Produto cadastrado.');
      }
      setModalAberto(false);
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel salvar o produto.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarDisponibilidade(produto) {
    try {
      await alterarDisponibilidade(produto.id, !produto.ativo);
      sucesso(produto.ativo ? 'Produto desativado.' : 'Produto ativado.');
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel alterar a disponibilidade.');
    }
  }

  async function confirmarReposicao(evento) {
    evento.preventDefault();
    const problema = validarEstoque(quantidadeRepor);
    if (problema) {
      notificarErro(problema);
      return;
    }
    if (Number(quantidadeRepor) <= 0) {
      notificarErro('Informe uma quantidade maior que zero.');
      return;
    }

    try {
      await reporEstoque(repondo.id, Number(quantidadeRepor));
      sucesso('Estoque reposto.');
      setRepondo(null);
      setQuantidadeRepor('');
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel repor o estoque.');
    }
  }

  if (carregando && produtos.length === 0) {
    return <Carregando texto="Carregando seus produtos..." />;
  }

  return (
    <div className="container painel">
      <header className="painel__cabecalho">
        <h1>Meus produtos</h1>
        <button type="button" className="botao botao--primario" onClick={abrirNovo}>
          Novo produto
        </button>
      </header>

      {erro && <MensagemErro erro={erro} aoTentarNovamente={() => carregar()} />}

      {!erro && produtos.length === 0 && (
        <EstadoVazio
          titulo="Voce ainda nao cadastrou produtos"
          descricao="Cadastre o primeiro produto para ele aparecer no marketplace."
          acao={
            <button type="button" className="botao botao--primario" onClick={abrirNovo}>
              Cadastrar produto
            </button>
          }
        />
      )}

      {produtos.length > 0 && (
        <>
          <section className="painel-secao">
            <table className="painel-secao__tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Preco</th>
                  <th>Estoque</th>
                  <th>Situacao</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((produto) => (
                  <tr key={produto.id}>
                    <td>{produto.nome}</td>
                    <td>{produto.categoria_nome || '-'}</td>
                    <td>{formatarMoeda(produto.preco)}</td>
                    <td>{formatarQuantidade(produto.estoque, produto.unidade)}</td>
                    <td>
                      <Selo variante={produto.ativo ? 'entregue' : 'cancelado'}>
                        {produto.ativo ? 'Ativo' : 'Inativo'}
                      </Selo>
                    </td>
                    <td>
                      <div className="item-acoes">
                        <button
                          type="button"
                          className="botao botao--texto"
                          onClick={() => abrirEdicao(produto)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="botao botao--texto"
                          onClick={() => {
                            setRepondo(produto);
                            setQuantidadeRepor('');
                          }}
                        >
                          Repor
                        </button>
                        <button
                          type="button"
                          className="botao botao--texto"
                          onClick={() => alternarDisponibilidade(produto)}
                        >
                          {produto.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <Paginacao paginacao={paginacao} aoMudarPagina={setPagina} />
        </>
      )}

      <Modal
        titulo={editando ? 'Editar produto' : 'Novo produto'}
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        acoes={
          <>
            <button
              type="button"
              className="botao botao--texto"
              onClick={() => setModalAberto(false)}
            >
              Cancelar
            </button>
            <button type="submit" form="form-produto" className="botao botao--primario" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <form id="form-produto" onSubmit={salvar} noValidate>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="nome">
              Nome <span className="campo__obrigatorio">*</span>
            </label>
            <input
              id="nome"
              className={`campo__entrada ${errosCampo.nome ? 'campo__entrada--erro' : ''}`}
              value={valores.nome}
              onChange={(evento) => alterar('nome', evento.target.value)}
            />
            {errosCampo.nome && <span className="campo__erro">{errosCampo.nome}</span>}
          </div>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="descricao">
              Descricao
            </label>
            <textarea
              id="descricao"
              className="campo__area"
              value={valores.descricao}
              onChange={(evento) => alterar('descricao', evento.target.value)}
            />
          </div>

          <div className="campo campo__linha campo__linha--2">
            <div className="campo">
              <label className="campo__rotulo" htmlFor="preco">
                Preco (R$) <span className="campo__obrigatorio">*</span>
              </label>
              <input
                id="preco"
                type="number"
                step="0.01"
                min="0"
                className={`campo__entrada ${errosCampo.preco ? 'campo__entrada--erro' : ''}`}
                value={valores.preco}
                onChange={(evento) => alterar('preco', evento.target.value)}
              />
              {errosCampo.preco && <span className="campo__erro">{errosCampo.preco}</span>}
            </div>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="estoque">
                Estoque <span className="campo__obrigatorio">*</span>
              </label>
              <input
                id="estoque"
                type="number"
                min="0"
                className={`campo__entrada ${errosCampo.estoque ? 'campo__entrada--erro' : ''}`}
                value={valores.estoque}
                onChange={(evento) => alterar('estoque', evento.target.value)}
              />
              {errosCampo.estoque && <span className="campo__erro">{errosCampo.estoque}</span>}
            </div>
          </div>

          <div className="campo campo__linha campo__linha--2">
            <div className="campo">
              <label className="campo__rotulo" htmlFor="unidade">
                Unidade
              </label>
              <select
                id="unidade"
                className="campo__selecao"
                value={valores.unidade}
                onChange={(evento) => alterar('unidade', evento.target.value)}
              >
                <option value="kg">kg</option>
                <option value="unidade">unidade</option>
                <option value="duzia">duzia</option>
                <option value="litro">litro</option>
                <option value="maco">maco</option>
              </select>
            </div>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="categoria_id">
                Categoria <span className="campo__obrigatorio">*</span>
              </label>
              <select
                id="categoria_id"
                className={`campo__selecao ${errosCampo.categoria_id ? 'campo__entrada--erro' : ''}`}
                value={valores.categoria_id}
                onChange={(evento) => alterar('categoria_id', evento.target.value)}
              >
                <option value="">--</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
              {errosCampo.categoria_id && (
                <span className="campo__erro">{errosCampo.categoria_id}</span>
              )}
            </div>
          </div>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="imagem_url">
              URL da imagem
            </label>
            <input
              id="imagem_url"
              className="campo__entrada"
              placeholder="https://..."
              value={valores.imagem_url}
              onChange={(evento) => alterar('imagem_url', evento.target.value)}
            />
            <span className="campo__dica">
              Por enquanto aceitamos um link externo; o upload sera integrado depois.
            </span>
          </div>
        </form>
      </Modal>

      <Modal
        titulo={`Repor estoque - ${repondo?.nome || ''}`}
        aberto={Boolean(repondo)}
        aoFechar={() => setRepondo(null)}
        acoes={
          <>
            <button type="button" className="botao botao--texto" onClick={() => setRepondo(null)}>
              Cancelar
            </button>
            <button type="submit" form="form-repor" className="botao botao--primario">
              Repor
            </button>
          </>
        }
      >
        <form id="form-repor" onSubmit={confirmarReposicao} noValidate>
          <p className="campo__dica">
            Estoque atual: {formatarQuantidade(repondo?.estoque, repondo?.unidade)}. A quantidade
            informada e somada ao estoque.
          </p>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="quantidade_repor">
              Quantidade a adicionar
            </label>
            <input
              id="quantidade_repor"
              type="number"
              min="1"
              className="campo__entrada"
              value={quantidadeRepor}
              onChange={(evento) => setQuantidadeRepor(evento.target.value)}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}