import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { Carregando } from '../components/ui.jsx';

/*
 * Protecao de rotas no cliente.
 *
 * Isto e conveniencia de navegacao, NAO seguranca. Esconder o botao
 * nao protege nada: quem quiser chama a API direto. A autorizacao real
 * esta no backend (checkJwt + requireRole), e e por isso que cada
 * endpoint protegido continua valido mesmo se alguem burlar o
 * redirecionamento aqui.
 *
 * A funcao util e outra: evitar que o usuario logado veja uma tela que
 * so daria erro de permissao.
 */

/* Exige usuario autenticado. Sem login, manda para /login guardando de
 * onde veio, para voltar ao ponto certo depois de entrar. */
export function RotaPrivada() {
  const { autenticado, carregando } = useAuth();
  const local = useLocation();

  if (carregando) return <Carregando texto="Verificando sua sessao..." />;
  if (!autenticado) {
    return <Navigate to="/login" state={{ de: local.pathname }} replace />;
  }
  return <Outlet />;
}

/* Exige um dos tipos informados. */
export function RotaPorTipo({ tipos }) {
  const { usuario, carregando, autenticado } = useAuth();

  if (carregando) return <Carregando texto="Verificando suas permissoes..." />;
  if (!autenticado) return <Navigate to="/login" replace />;

  if (!tipos.includes(usuario.tipo)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
