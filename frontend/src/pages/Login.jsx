import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useFormulario } from '../hooks/useMutacao.js';
import { validarEmail } from '../utils/validacao.js';
import { MensagemErro } from '../components/ui.jsx';
import './auth.css';

/*
 * Login.
 *
 * Depois de entrar, o usuario volta para onde tentou ir (o guard grava
 * o destino em `state.de`). Sem isso, quem clica em "Carrinho" sem
 * estar logado cairia sempre na home depois do login.
 */
export default function Login() {
  const { entrar } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();

  const { valores, alterar } = useFormulario({ email: '', senha: '' });
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const destino = local.state?.de || '/';

  async function enviar(evento) {
    evento.preventDefault();

    /* Validacao local so para nao ir a rede com dado vazio. */
    const novosErros = {};
    if (validarEmail(valores.email)) novosErros.email = validarEmail(valores.email);
    if (!valores.senha) novosErros.senha = 'Informe a senha.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;

    setEnviando(true);
    setErro(null);
    try {
      await entrar({ email: valores.email.trim(), senha: valores.senha });
      navegar(destino, { replace: true });
    } catch (falha) {
      /*
       * A API devolve a mesma mensagem para e-mail inexistente e senha
       * errada, de proposito: dizer qual dos dois falhou permitiria
       * descobrir quais e-mails tem conta. Repassamos como veio.
       */
      setErro(falha);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="container auth">
      <div className="auth__cartao">
        <h1 className="auth__titulo">Entrar</h1>
        <p className="auth__subtitulo">Acesse sua conta para comprar ou vender.</p>

        {erro && <MensagemErro erro={erro} />}

        <form onSubmit={enviar} noValidate>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="email">
              E-mail <span className="campo__obrigatorio">*</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={`campo__entrada ${erros.email ? 'campo__entrada--erro' : ''}`}
              value={valores.email}
              onChange={(evento) => alterar('email', evento.target.value)}
              aria-invalid={Boolean(erros.email)}
            />
            {erros.email && <span className="campo__erro">{erros.email}</span>}
          </div>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="senha">
              Senha <span className="campo__obrigatorio">*</span>
            </label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              className={`campo__entrada ${erros.senha ? 'campo__entrada--erro' : ''}`}
              value={valores.senha}
              onChange={(evento) => alterar('senha', evento.target.value)}
              aria-invalid={Boolean(erros.senha)}
            />
            {erros.senha && <span className="campo__erro">{erros.senha}</span>}
          </div>

          <button
            type="submit"
            className="botao botao--primario botao--bloco"
            disabled={enviando}
          >
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="auth__rodape">
          Ainda nao tem conta? <Link to="/cadastro">Cadastre-se</Link>
        </p>
      </div>
    </div>
  );
}