import { Link } from 'react-router-dom';
import { listarProdutores } from '../services/catalogo.js';
import { useRequisicao } from '../hooks/useRequisicao.js';
import { Carregando, MensagemErro, EstadoVazio, Estrelas } from '../components/ui.jsx';

/*
 * Lista de produtores.
 *
 * E a porta de entrada para quem quer comprar por produtor, e nao por
 * produto - um dos diferenciais do marketplace.
 */
export default function Agricultores() {
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => listarProdutores({ limite: 24 }),
    [],
  );

  if (carregando) return <Carregando texto="Carregando produtores..." />;

  const produtores = dados?.produtores || [];

  return (
    <div className="container vitrine">
      <header className="vitrine__cabecalho">
        <h1>Produtores</h1>
        <p className="vitrine__resultado">
          Conheca quem cultiva os produtos organicos do AgroHero.
        </p>
      </header>

      {erro && <MensagemErro erro={erro} aoTentarNovamente={recarregar} />}

      {!erro && produtores.length === 0 && (
        <EstadoVazio
          titulo="Nenhum produtor cadastrado"
          descricao="Assim que houver produtores ativos, eles aparecem aqui."
        />
      )}

      {produtores.length > 0 && (
        <div className="produtor-grade">
          {produtores.map((produtor) => (
            <Link
              key={produtor.id}
              to={`/agricultores/${produtor.id}`}
              className="produtor-card"
            >
              {produtor.imagem_url ? (
                <img
                  className="produtor-card__imagem"
                  src={produtor.imagem_url}
                  alt={produtor.nome_fazenda}
                  loading="lazy"
                />
              ) : (
                <div className="produtor-card__sem-imagem" aria-hidden="true">
                  🚜
                </div>
              )}

              <div className="produtor-card__corpo">
                <h2 className="produtor-card__nome">{produtor.nome_fazenda}</h2>
                {produtor.cidade && (
                  <p className="produtor-card__local">
                    {produtor.cidade}/{produtor.estado}
                  </p>
                )}
                <Estrelas
                  nota={produtor.media_avaliacoes}
                  total={produtor.total_avaliacoes}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}