import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Notificacoes from '../components/Notificacoes.jsx';

/*
 * Layout principal: cabecalho, conteudo da rota, rodape e a regiao de
 * notificacoes.
 *
 * O Outlet e onde o React Router injeta a pagina atual.
 */
export default function MainLayout() {
  const { pathname } = useLocation();

  /*
   * Rola para o topo ao trocar de rota. Sem isso, navegar de uma lista
   * longa para o detalhe mantem a posicao de rolagem, e o usuario cai
   * no meio da pagina nova sem entender o que aconteceu.
   */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a href="#conteudo" className="pular-para-conteudo">
        Pular para o conteudo
      </a>
      <Header />
      <main id="conteudo">
        <Outlet />
      </main>
      <Footer />
      <Notificacoes />
    </>
  );
}