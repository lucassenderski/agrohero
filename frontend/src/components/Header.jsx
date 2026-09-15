import { Link } from 'react-router-dom';
import './Header.css';

const NOME_APP = import.meta.env.VITE_APP_NOME || 'AgroHero';

/*
 * Cabecalho da aplicacao.
 *
 * Na FASE 1 tem apenas a marca. Os links de navegacao dependem do
 * AuthContext, que entra na FASE 15 (frontend).
 */
export default function Header() {
  return (
    <header className="header">
      <div className="container header__interno">
        <Link to="/" className="header__marca" aria-label={`${NOME_APP} - pagina inicial`}>
          <span className="header__logo" aria-hidden="true">
            🌱
          </span>
          <span className="header__nome">{NOME_APP}</span>
        </Link>

        <nav className="header__navegacao" aria-label="Navegacao principal">
          <span className="header__aviso">Em construcao</span>
        </nav>
      </div>
    </header>
  );
}