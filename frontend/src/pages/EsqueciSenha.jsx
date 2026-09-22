import { useState } from 'react';
import { Link } from 'react-router-dom';
import { solicitarRedefinicaoSenha } from '../services/auth.js';
import { MensagemErro } from '../components/ui.jsx';
import { validarEmail } from '../utils/validacao.js';
import './auth.css';

export default function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState(null);
  const [erroCampo, setErroCampo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    const mensagem = validarEmail(email);
    setErroCampo(mensagem);
    if (mensagem) return;

    setEnviando(true);
    setErro(null);
    try {
      await solicitarRedefinicaoSenha(email.trim());
      setEnviado(true);
    } catch (falha) {
      setErro(falha);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="container auth">
      <div className="auth__cartao">
        <h1 className="auth__titulo">Esqueci minha senha</h1>
        <p className="auth__subtitulo">
          Informe seu e-mail e enviaremos as instruções para criar uma nova senha.
        </p>

        {erro && <MensagemErro erro={erro} />}

        {enviado ? (
          <div className="auth__sucesso" role="status">
            <p>
              Se existir uma conta com este e-mail, você receberá as instruções de
              redefinição em breve.
            </p>
            <Link to="/login" className="botao botao--primario botao--bloco">
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={enviar} noValidate>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="email-recuperacao">
                E-mail <span className="campo__obrigatorio">*</span>
              </label>
              <input
                id="email-recuperacao"
                type="email"
                autoComplete="email"
                className={`campo__entrada ${erroCampo ? 'campo__entrada--erro' : ''}`}
                value={email}
                onChange={(evento) => {
                  setEmail(evento.target.value);
                  setErroCampo('');
                }}
                aria-invalid={Boolean(erroCampo)}
              />
              {erroCampo && <span className="campo__erro">{erroCampo}</span>}
            </div>
            <button type="submit" className="botao botao--primario botao--bloco" disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar instruções'}
            </button>
          </form>
        )}

        <p className="auth__rodape">
          <Link to="/login">Voltar para o login</Link>
        </p>
      </div>
    </div>
  );
}
