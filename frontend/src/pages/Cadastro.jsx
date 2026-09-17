import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useFormulario } from '../hooks/useMutacao.js';
import { validarEmail, validarSenha, validarNome } from '../utils/validacao.js';
import { ESTADOS } from '../utils/estados.js';
import { MensagemErro } from '../components/ui.jsx';
import './auth.css';

const VALORES_INICIAIS = {
  tipo: 'cliente',
  nome: '',
  email: '',
  senha: '',
  telefone: '',
  cidade: '',
  estado: '',
  nome_fazenda: '',
  descricao: '',
};

/*
 * Cadastro de cliente ou produtor.
 *
 * Os dois formularios compartilham os dados de usuario; o produtor
 * acrescenta o bloco `agricultor`. O `tipo` enviado e SEMPRE cliente ou
 * agricultor - "administrador" nao existe aqui de proposito, e o
 * backend recusa esse valor.
 *
 * O backend cria usuario e perfil do produtor na mesma transacao, entao
 * um erro no perfil nao deixa usuario orfao.
 */
export default function Cadastro() {
  const { registrar } = useAuth();
  const navegar = useNavigate();

  const { valores, alterar } = useFormulario(VALORES_INICIAIS);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const ehProdutor = valores.tipo === 'agricultor';

  function validar() {
    const novos = {};
    const erroEmail = validarEmail(valores.email);
    const erroSenha = validarSenha(valores.senha);
    const erroNome = validarNome(valores.nome);

    if (erroNome) novos.nome = erroNome;
    if (erroEmail) novos.email = erroEmail;
    if (erroSenha) novos.senha = erroSenha;

    if (valores.telefone && !/^\d{10,11}$/.test(valores.telefone.replace(/\D/g, ''))) {
      novos.telefone = 'Informe DDD + numero (10 ou 11 digitos).';
    }

    if (ehProdutor && !valores.nome_fazenda.trim()) {
      novos.nome_fazenda = 'Informe o nome da propriedade.';
    }

    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (!validar()) return;

    const corpo = {
      tipo: valores.tipo,
      nome: valores.nome.trim(),
      email: valores.email.trim(),
      senha: valores.senha,
    };

    if (valores.telefone) corpo.telefone = valores.telefone.replace(/\D/g, '');
    if (valores.cidade.trim()) corpo.cidade = valores.cidade.trim();
    if (valores.estado) corpo.estado = valores.estado;

    if (ehProdutor) {
      corpo.agricultor = { nome_fazenda: valores.nome_fazenda.trim() };
      if (valores.descricao.trim()) corpo.agricultor.descricao = valores.descricao.trim();
      if (valores.cidade.trim()) corpo.agricultor.cidade = valores.cidade.trim();
      if (valores.estado) corpo.agricultor.estado = valores.estado;
    }

    setEnviando(true);
    setErro(null);
    try {
      const usuario = await registrar(corpo);
      /* Produtor vai para o painel; cliente, para a vitrine. */
      navegar(usuario.tipo === 'agricultor' ? '/agricultor' : '/produtos', { replace: true });
    } catch (falha) {
      setErro(falha);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="container auth">
      <div className="auth__cartao auth__cartao--largo">
        <h1 className="auth__titulo">Criar conta</h1>
        <p className="auth__subtitulo">Compre direto do produtor ou venda seus produtos.</p>

        {erro && <MensagemErro erro={erro} />}

        <form onSubmit={enviar} noValidate>
          <fieldset className="auth__tipos">
            <legend className="campo__rotulo">Eu quero</legend>

            <label className={`auth__tipo ${!ehProdutor ? 'auth__tipo--ativo' : ''}`}>
              <input
                type="radio"
                name="tipo"
                value="cliente"
                checked={!ehProdutor}
                onChange={() => alterar('tipo', 'cliente')}
              />
              <span>
                <strong>Comprar</strong>
                <span className="auth__tipo-descricao">Sou consumidor</span>
              </span>
            </label>

            <label className={`auth__tipo ${ehProdutor ? 'auth__tipo--ativo' : ''}`}>
              <input
                type="radio"
                name="tipo"
                value="agricultor"
                checked={ehProdutor}
                onChange={() => alterar('tipo', 'agricultor')}
              />
              <span>
                <strong>Vender</strong>
                <span className="auth__tipo-descricao">Sou produtor rural</span>
              </span>
            </label>
          </fieldset>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="nome">
              Nome completo <span className="campo__obrigatorio">*</span>
            </label>
            <input
              id="nome"
              type="text"
              autoComplete="name"
              className={`campo__entrada ${erros.nome ? 'campo__entrada--erro' : ''}`}
              value={valores.nome}
              onChange={(evento) => alterar('nome', evento.target.value)}
            />
            {erros.nome && <span className="campo__erro">{erros.nome}</span>}
          </div>

          {ehProdutor && (
            <div className="campo">
              <label className="campo__rotulo" htmlFor="nome_fazenda">
                Nome da propriedade <span className="campo__obrigatorio">*</span>
              </label>
              <input
                id="nome_fazenda"
                type="text"
                className={`campo__entrada ${erros.nome_fazenda ? 'campo__entrada--erro' : ''}`}
                placeholder="Ex.: Sitio Boa Vista"
                value={valores.nome_fazenda}
                onChange={(evento) => alterar('nome_fazenda', evento.target.value)}
              />
              {erros.nome_fazenda && (
                <span className="campo__erro">{erros.nome_fazenda}</span>
              )}
            </div>
          )}

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
              autoComplete="new-password"
              className={`campo__entrada ${erros.senha ? 'campo__entrada--erro' : ''}`}
              value={valores.senha}
              onChange={(evento) => alterar('senha', evento.target.value)}
            />
            <span className="campo__dica">Minimo de 8 caracteres, com letras e numeros.</span>
            {erros.senha && <span className="campo__erro">{erros.senha}</span>}
          </div>

          <div className="campo campo__linha campo__linha--3">
            <div className="campo">
              <label className="campo__rotulo" htmlFor="telefone">
                Telefone
              </label>
              <input
                id="telefone"
                type="tel"
                autoComplete="tel"
                placeholder="19999998888"
                className={`campo__entrada ${erros.telefone ? 'campo__entrada--erro' : ''}`}
                value={valores.telefone}
                onChange={(evento) => alterar('telefone', evento.target.value)}
              />
              {erros.telefone && <span className="campo__erro">{erros.telefone}</span>}
            </div>

            <div className="campo">
              <label className="campo__rotulo" htmlFor="cidade">
                Cidade
              </label>
              <input
                id="cidade"
                type="text"
                className="campo__entrada"
                value={valores.cidade}
                onChange={(evento) => alterar('cidade', evento.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo__rotulo" htmlFor="estado">
                Estado
              </label>
              <select
                id="estado"
                className="campo__selecao"
                value={valores.estado}
                onChange={(evento) => alterar('estado', evento.target.value)}
              >
                <option value="">--</option>
                {ESTADOS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {ehProdutor && (
            <div className="campo">
              <label className="campo__rotulo" htmlFor="descricao">
                Descricao da propriedade
              </label>
              <textarea
                id="descricao"
                className="campo__area"
                placeholder="Conte o que voce cultiva e como produz."
                value={valores.descricao}
                onChange={(evento) => alterar('descricao', evento.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            className="botao botao--primario botao--bloco"
            disabled={enviando}
          >
            {enviando ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="auth__rodape">
          Ja tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}