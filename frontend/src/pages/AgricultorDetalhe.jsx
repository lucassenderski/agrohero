import { Link, useParams } from 'react-router-dom';
import {
  buscarProdutor,
  listarProdutosDoProdutor,
  listarAvaliacoesDoProdutor,
} from '../services/catalogo.js';
import { useRequisicao } from '../hooks/useRequisicao.js';
import ProductGrid from '../components/ProductGrid.jsx';
import { Carregando, MensagemErro, Estrelas } from '../components/ui.jsx';
import { formatarData } from '../utils/formato.js';

/*
 * Perfil publico do produtor.
 *
 * O que a API devolve aqui e o recorte publico: nome da fazenda,
 * historia, certificacoes, cidade e estado. Nao vem e-mail, telefone
 * nem endereco completo - sao dados privados, e a rota e aberta.
 */
export default function AgricultorDetalhe() {
  const { id } = useParams();

  const produtor = useRequisicao(() => buscarProdutor(id), [id]);
  const produtos = useRequisicao(() => listarProdutosDoProdutor(id, { limite: 12 }), [id]);
  const avaliacoes = useRequisicao(() => listarAvaliacoesDoProdutor(id, { limite: 10 }), [id]);

  if (produtor.carregando) return <Carregando texto="Carregando produtor..." />;
  if (produtor.erro) {
    return (
      <div className="container produto-detalhe">
        <MensagemErro erro={produtor.erro} aoTentarNovamente={produtor.recarregar} />
      </div>
    );
  }
  if (!produtor.dados) return null;

  const dados = produtor.dados;
  const listaProdutos = produtos.dados?.produtos || [];
  const listaAvaliacoes = avaliacoes.dados?.avaliacoes || [];

  return (
    <div className="container produto-detalhe">
      <nav className="produto-detalhe__migalhas" aria-label="Voce esta aqui">
        <Link to="/agricultores">Produtores</Link> / <span>{dados.nome_fazenda}</span>
      </nav>

      <header className="produtor-perfil">
        {dados.imagem_url ? (
          <img
            className="produtor-perfil__imagem"
            src={dados.imagem_url}
            alt={dados.nome_fazenda}
          />
        ) : (
          <div className="produtor-perfil__sem-imagem" aria-hidden="true">
            🚜
          </div>
        )}

        <div className="produtor-perfil__dados">
          <h1>{dados.nome_fazenda}</h1>

          {dados.responsavel_nome && (
            <p className="produtor-perfil__responsavel">
              Responsavel: {dados.responsavel_nome}
            </p>
          )}

          {dados.cidade && (
            <p className="produtor-perfil__local">
              📍 {dados.cidade}/{dados.estado}
            </p>
          )}

          <Estrelas nota={dados.media_avaliacoes} total={dados.total_avaliacoes} />

          {dados.descricao && <p>{dados.descricao}</p>}

          {dados.certificacoes && dados.certificacoes.length > 0 && (
            <div className="produtor-perfil__certificacoes">
              <h2 className="campo__rotulo">Certificacoes</h2>
              <ul className="produtor-perfil__lista-certificacoes">
                {dados.certificacoes.map((certificacao) => (
                  <li key={certificacao} className="selo selo--entregue">
                    {certificacao}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>

      {dados.historia && (
        <section className="painel-secao">
          <h2 className="painel-secao__titulo">Nossa historia</h2>
          <p>{dados.historia}</p>
        </section>
      )}

      <section aria-label="Produtos do produtor">
        <h2 className="painel-secao__titulo">Produtos</h2>
        <ProductGrid
          produtos={listaProdutos}
          carregando={produtos.carregando}
          tituloVazio="Nenhum produto disponivel"
          descricaoVazio="Este produtor ainda nao publicou produtos ativos."
        />
      </section>

      <section className="painel-secao" aria-label="Avaliacoes do produtor">
        <h2 className="painel-secao__titulo">
          Avaliacoes {dados.total_avaliacoes ? `(${dados.total_avaliacoes})` : ''}
        </h2>

        {avaliacoes.carregando && <Carregando texto="Carregando avaliacoes..." />}

        {!avaliacoes.carregando && listaAvaliacoes.length === 0 && (
          <p className="campo__dica">Este produtor ainda nao recebeu avaliacoes.</p>
        )}

        {listaAvaliacoes.length > 0 && (
          <div className="avaliacoes">
            {listaAvaliacoes.map((avaliacao) => (
              <article key={avaliacao.id} className="avaliacao">
                <div className="avaliacao__cabecalho">
                  <span className="avaliacao__autor">
                    {avaliacao.consumidor_primeiro_nome || 'Consumidor'}
                  </span>
                  <Estrelas nota={avaliacao.nota} />
                  <span className="avaliacao__data">{formatarData(avaliacao.criado_em)}</span>
                </div>
                {avaliacao.produto_nome && (
                  <p className="campo__dica">Produto: {avaliacao.produto_nome}</p>
                )}
                {avaliacao.comentario && (
                  <p className="avaliacao__comentario">{avaliacao.comentario}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}