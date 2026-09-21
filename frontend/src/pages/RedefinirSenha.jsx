import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { redefinirSenha } from '../services/auth.js';
import { MensagemErro } from '../components/ui.jsx';
import './auth.css';

const SENHA_MINIMA = 8;

export default function RedefinirSenha() {
  const [parametros] = useSearchParams();
  const token = parametros.get('token') || '';
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  const erroLocal = useMemo(() => {
    if (!token) return 'O link de redefinição está incompleto.';
    if (senha.length > 0 && senha.length < SENHA_MINIMA) {
      return `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`;
    }
    if (confirmacao && senha !== confirmacao) return 'As senhas não conferem.';
    return '';
  }, [confirmacao, senha, token]);

  async function enviar(evento) {
    evento.preventDefault();
    if (erroLocal || !senha || !confirmacao) return;

    setEnviando(true);
    setErro(null);
    try {
      await redefinirSenha({ token, senha });
      setConcluido(true);
    } catch (falha) {
      setErro(falha);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="container auth">
      <div className="auth__cartao">
        <h1 className="auth__titulo">Criar nova senha</h1>
        <p className="auth__subtitulo">Escolha uma senha forte para proteger sua conta.</p>

        {erro && <MensagemErro erro={erro} />}

        {concluido ? (
          <div className="auth__sucesso" role="status">
            <p>Sua senha foi alterada com sucesso.</p>
            <Link to="/login" className="botao botao--primario botao--bloco">
              Entrar com a nova senha
            </Link>
          </div>
        ) : (
          <form onSubmit={enviar} noValidate>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="nova-senha">Nova senha</label>
              <input
                id="nova-senha"
                type="password"
                autoComplete="new-password"
                className={`campo__entrada ${erroLocal ? 'campo__entrada--erro' : ''}`}
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
              />
            </div>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="confirmacao-senha">Confirmar nova senha</label>
              <input
                id="confirmacao-senha"
                type="password"
                autoComplete="new-password"
                className={`campo__entrada ${erroLocal ? 'campo__entrada--erro' : ''}`}
                value={confirmacao}
                onChange={(evento) => setConfirmacao(evento.target.value)}
              />
              {erroLocal && <span className="campo__erro">{erroLocal}</span>}
            </div>
            <button type="submit" className="botao botao--primario botao--bloco" disabled={enviando || Boolean(erroLocal)}>
              {enviando ? 'Salvando...' : 'Redefinir senha'}
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
