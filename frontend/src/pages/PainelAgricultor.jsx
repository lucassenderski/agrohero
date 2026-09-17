import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listarMeusProdutos } from '../services/painel.js';
import { listarItensDoProdutor } from '../services/pedidos.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Carregando, MensagemErro, EstadoVazio, Selo } from '../components/ui.jsx';
import { formatarMoeda, formatarQuantidade, rotularStatusPedido, classeStatusPedido } from '../utils/formato.js';
import '../components/pedido.css';

const ESTOQUE_BAIXO = 5;

/*
 * Painel do produtor.
 *
 * As metricas sao calculadas aqui a partir de duas listas reais
 * (/produtos/meus e /pedidos/agricultor), e nao de um endpoint de
 * dashboard - que ainda nao existe. Buscar tudo tem um limite: se o
 * produtor passar de algumas centenas de itens, isso precisa virar
 * agregacao no servidor. Para o volume atual, e o suficiente e nao
 * inventa numeros.
 */
export default function PainelAgricultor() {
  const { usuario } = useAuth();
  const [produtos, setProdutos] = useState([]);
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [listaProdutos, listaItens] = await Promise.all([
          listarMeusProdutos({ limite: 100 }),
          listarItensDoProdutor({ limite: 100 }),
        ]);
        if (!ativo) return;
        setProdutos(listaProdutos.produtos || []);
        setItens(listaItens.itens || []);
      } catch (falha) {
        if (ativo) setErro(falha);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  if (carregando) return <Carregando texto="Carregando o painel..." />;

  if (erro) {
    return (
      <div className="container painel">
        <h1>Painel do produtor</h1>
        <MensagemErro erro={erro} />
      </div>
    );
  }

  const ativos = produtos.filter((produto) => produto.ativo);
  const baixoEstoque = ativos.filter((produto) => produto.estoque <= ESTOQUE_BAIXO);

  const entregues = itens.filter((item) => item.status === 'ENTREGUE');
  const pendentes = itens.filter((item) => item.status === 'PENDENTE');
  const valorVendido = entregues.reduce((soma, item) => soma + Number(item.subtotal), 0);

  const pedidosUnicos = new Set(itens.map((item) => item.pedido_id));

  const recentes = [...itens]
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
    .slice(0, 5);

  return (
    <div className="container painel">
      <header className="painel__cabecalho">
        <div>
          <h1>Painel do produtor</h1>
          <p className="campo__dica">Ola, {usuario.nome}. Aqui esta o resumo da sua producao.</p>
        </div>
        <Link to="/agricultor/produtos" className="botao botao--primario">
          Gerenciar produtos
        </Link>
      </header>

      <section className="metricas" aria-label="Indicadores">
        <article className="metrica">
          <span className="metrica__rotulo">Produtos</span>
          <strong className="metrica__valor">{produtos.length}</strong>
          <span className="metrica__nota">{ativos.length} ativos</span>
        </article>

        <article className="metrica">
          <span className="metrica__rotulo">Pedidos</span>
          <strong className="metrica__valor">{pedidosUnicos.size}</strong>
          <span className="metrica__nota">{pendentes.length} itens pendentes</span>
        </article>

        <article className="metrica">
          <span className="metrica__rotulo">Valor vendido</span>
          <strong className="metrica__valor">{formatarMoeda(valorVendido)}</strong>
          <span className="metrica__nota">somente itens entregues</span>
        </article>

        <article className="metrica">
          <span className="metrica__rotulo">Estoque baixo</span>
          <strong className="metrica__valor">{baixoEstoque.length}</strong>
          <span className="metrica__nota">com {ESTOQUE_BAIXO} ou menos</span>
        </article>
      </section>

      <div className="painel__grade">
        <section className="painel-secao">
          <div className="painel__cabecalho">
            <h2 className="painel-secao__titulo">Pedidos recentes</h2>
            <Link to="/agricultor/pedidos" className="botao botao--texto">
              Ver todos
            </Link>
          </div>

          {recentes.length === 0 ? (
            <EstadoVazio
              titulo="Nenhum pedido ainda"
              descricao="Quando alguem comprar seus produtos, o pedido aparece aqui."
            />
          ) : (
            <ul className="lista-simples">
              {recentes.map((item) => (
                <li key={item.id} className="lista-simples__linha">
                  <span>
                    #{item.pedido_id} - {item.quantidade}x {item.produto_nome}
                  </span>
                  <span className={classeStatusPedido(item.status)}>
                    {rotularStatusPedido(item.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="painel-secao">
          <div className="painel__cabecalho">
            <h2 className="painel-secao__titulo">Estoque baixo</h2>
            <Link to="/agricultor/produtos" className="botao botao--texto">
              Repor
            </Link>
          </div>

          {baixoEstoque.length === 0 ? (
            <p className="campo__dica">Nenhum produto com estoque critico.</p>
          ) : (
            <ul className="lista-simples">
              {baixoEstoque.map((produto) => (
                <li key={produto.id} className="lista-simples__linha">
                  <span>{produto.nome}</span>
                  <Selo variante="pendente">
                    {formatarQuantidade(produto.estoque, produto.unidade)}
                  </Selo>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}