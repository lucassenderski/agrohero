import { Outlet } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';

/*
 * Layout principal: cabecalho fixo, conteudo da rota e rodape.
 * O <Outlet /> e onde o React Router injeta a pagina atual.
 */
export default function MainLayout() {
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
    </>
  );
}