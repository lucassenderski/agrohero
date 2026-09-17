import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useCarrinho } from '../contexts/CarrinhoContext.jsx';
import './Header.css';

const NOME_APP = import.meta.env.VITE_APP_NOME || 'AgroHero';

/*
 * Cabecalho da aplicacao.
 *
 * Os links mudam com o tipo de usuario: o produtor nao tem carrinho
 * (quem compra e o consumidor) e o consumidor nao tem painel de
 * produtos. Mostrar as duas coisas para todos so geraria cliques em
 * telas que devolvem erro.
 *
 * Em telas pequenas o menu vira um painel que abre pelo botao, porque
 * 8 links em linha nao cabem na largura de um celular.
 */
export default function Header() {
  const { usuario, autenticado, ehCliente, ehAgricultor, ehAdmin, sair } = useAuth();
  const { quantidade } = useCarrinho();
  const navegar = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);

  function aoSair() {
    sair();
    setMenuAberto(false);
    navegar('/');
  }

  function fecharMenu() {
    setMenuAberto(false);
  }

  return (
    <header className="header">
      <div className="container header__interno">
        <Link to="/" className="header__marca" onClick={fecharMenu}>
          <span className="header__logo" aria-hidden="true">
            🌱
          </span>
          <span className="header__nome">{NOME_APP}</span>
        </Link>

        <button
          type="button"
          className="header__menu-botao"
          aria-expanded={menuAberto}
          aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setMenuAberto((aberto) => !aberto)}
        >
          <span aria-hidden="true">{menuAberto ? '✕' : '☰'}</span>
        </button>

        <nav
          className={`header__navegacao ${menuAberto ? 'header__navegacao--aberta' : ''}`}
          aria-label="Navegacao principal"
        >
          <Link to="/produtos" className="header__link" onClick={fecharMenu}>
            Produtos
          </Link>
          <Link to="/categorias" className="header__link" onClick={fecharMenu}>
            Categorias
          </Link>
          <Link to="/agricultores" className="header__link" onClick={fecharMenu}>
            Produtores
          </Link>

          {ehAdmin && (
            <Link to="/admin" className="header__link" onClick={fecharMenu}>
              Admin
            </Link>
          )}

          {ehAgricultor && (
            <>
              <Link to="/agricultor" className="header__link" onClick={fecharMenu}>
                Painel
              </Link>
              <Link to="/agricultor/produtos" className="header__link" onClick={fecharMenu}>
                Meus produtos
              </Link>
              <Link to="/agricultor/pedidos" className="header__link" onClick={fecharMenu}>
                Pedidos
              </Link>
            </>
          )}

          {ehCliente && (
            <>
              <Link to="/pedidos" className="header__link" onClick={fecharMenu}>
                Meus pedidos
              </Link>
              <Link
                to="/carrinho"
                className="header__link header__link--carrinho"
                onClick={fecharMenu}
              >
                Carrinho
                {quantidade > 0 && (
                  <span className="header__contador" aria-label={`${quantidade} itens no carrinho`}>
                    {quantidade}
                  </span>
                )}
              </Link>
            </>
          )}

          {autenticado ? (
            <div className="header__usuario">
              <Link to="/perfil" className="header__link" onClick={fecharMenu}>
                {usuario.nome?.split(' ')[0] || 'Perfil'}
              </Link>
              <button type="button" className="botao botao--texto" onClick={aoSair}>
                Sair
              </button>
            </div>
          ) : (
            <div className="header__usuario">
              <Link to="/login" className="header__link" onClick={fecharMenu}>
                Entrar
              </Link>
              <Link to="/cadastro" className="botao botao--primario" onClick={fecharMenu}>
                Criar conta
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
