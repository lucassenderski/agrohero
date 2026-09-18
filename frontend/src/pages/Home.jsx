import { useEffect, useState } from 'react';
import './Home.css';

/*
 * Home da FASE 1.
 *
 * O objetivo aqui NAO e a interface final: e provar, no navegador, que
 * o frontend fala com o backend e que o backend fala com o PostgreSQL.
 * Se este cartao mostrar "API: ok / Banco: ok", a FASE 1 esta validada
 * ponta a ponta.
 */
export default function Home() {
  const [estado, setEstado] = useState({ status: 'carregando' });

  useEffect(() => {
    let cancelado = false;

    // O /health fica fora do /api/v1, entao montamos a URL sem o sufixo.
    const urlBase = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1').replace(
      /\/api\/v1\/?$/,
      '',
    );

    fetch(`${urlBase}/health`)
      .then(async (resposta) => {
        const corpo = await resposta.json();
        if (cancelado) return;
        if (resposta.ok && corpo?.dados?.banco === 'ok') {
          setEstado({ status: 'ok', dados: corpo.dados });
        } else {
          setEstado({
            status: 'erro',
            mensagem:
              corpo?.erro?.mensagem || 'A API respondeu, mas o banco esta indisponivel.',
          });
        }
      })
      .catch(() => {
        if (cancelado) return;
        setEstado({
          status: 'erro',
          mensagem:
            'Nao foi possivel falar com a API. Confira se o backend esta rodando na porta 3001.',
        });
      });

    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="container home">
      <section className="home__hero">
        <p className="home__selo">Projeto em desenvolvimento</p>
        <h1 className="home__titulo">AgroHero</h1>
        <p className="home__subtitulo">
          Marketplace que conecta produtores rurais a consumidores de produtos organicos.
        </p>
      </section>

      <section className="home__diagnostico" aria-live="polite">
        <h2 className="home__diagnostico-titulo">Diagnostico do ambiente</h2>

        {estado.status === 'carregando' && (
          <p className="home__mensagem">Verificando a conexao com a API...</p>
        )}

        {estado.status === 'ok' && (
          <ul className="home__lista">
            <li>
              <strong>API:</strong> {estado.dados.api}
            </li>
            <li>
              <strong>PostgreSQL:</strong> {estado.dados.banco}
            </li>
            <li>
              <strong>Ambiente:</strong> {estado.dados.ambiente}
            </li>
            <li>
              <strong>Latencia do banco:</strong> {estado.dados.latenciaBancoMs} ms
            </li>
          </ul>
        )}

        {estado.status === 'erro' && (
          <p className="home__mensagem home__mensagem--erro">{estado.mensagem}</p>
        )}
      </section>

      <section className="home__proximas">
        <h2>O que vem a seguir</h2>
        <p>
          FASE 2: banco de dados (migrations e seeds). Depois usuarios, autenticacao JWT,
          produtos, carrinho, checkout e pedidos.
        </p>
      </section>
    </div>
  );
}