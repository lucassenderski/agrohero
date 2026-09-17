import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { atualizarPerfil, trocarSenha } from '../services/auth.js';
import { useFormulario } from '../hooks/useMutacao.js';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import { validarSenha } from '../utils/validacao.js';
import { ESTADOS } from '../utils/estados.js';
import { MensagemErro, Selo } from '../components/ui.jsx';
import MeusEnderecos from '../components/MeusEnderecos.jsx';
import MinhasAvaliacoes from '../components/MinhasAvaliacoes.jsx';
import '../components/pedido.css';

const ROTULO_TIPO = {
  cliente: 'Consumidor',
  agricultor: 'Produtor',
  administrador: 'Administrador',
};

/*
 * Perfil do usuario logado.
 *
 * A senha fica em um formulario separado, e nao junto dos outros
 * campos: misturar faria um "salvar" enviar a senha em branco sem
 * querer, e a API trata senha nova como alteracao de credencial.
 *
 * `tipo` e `email` sao somente leitura. O e-mail identifica a conta e
 * troca-lo exigiria revalidacao; o tipo muda o que a conta pode fazer
 * no sistema.
 */
export default function Perfil() {
  const { usuario, recarregarPerfil } = useAuth();
  const { sucesso } = useNotificacao();

  const { valores, alterar } = useFormulario({
    nome: usuario.nome || '',
    telefone: usuario.telefone || '',
    cidade: usuario.cidade || '',
    estado: usuario.estado || '',
  });

  const [erroPerfil, setErroPerfil] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const senhas = useFormulario({ senha_atual: '', senha_nova: '', confirmacao: '' });
  const [erroSenha, setErroSenha] = useState(null);
  const [trocando, setTrocando] = useState(false);

  async function salvarPerfil(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErroPerfil(null);
    try {
      await atualizarPerfil({
        nome: valores.nome.trim(),
        telefone: valores.telefone || undefined,
        cidade: valores.cidade || undefined,
        estado: valores.estado || undefined,
      });
      /*
       * Recarrega do servidor em vez de aplicar a resposta localmente: e
       * o backend que normaliza os campos (trim, maiusculas do estado),
       * entao o que vale e o que ele devolve.
       */
      await recarregarPerfil();
      sucesso('Dados atualizados.');
    } catch (falha) {
      setErroPerfil(falha);
    } finally {
      setSalvando(false);
    }
  }

  async function trocarSenha(evento) {
    evento.preventDefault();
    setErroSenha(null);

    const problema = validarSenha(senhas.valores.senha_nova);
    if (problema) {
      setErroSenha({ mensagem: problema });
      return;
    }
    if (senhas.valores.senha_nova !== senhas.valores.confirmacao) {
      setErroSenha({ mensagem: 'A confirmacao nao confere com a nova senha.' });
      return;
    }

    setTrocando(true);
    try {
      await trocarSenha({
        senha_atual: senhas.valores.senha_atual,
        nova_senha: senhas.valores.senha_nova,
        confirma_nova_senha: senhas.valores.confirmacao,
      });
      senhas.reiniciar();
      sucesso('Senha alterada.');
    } catch (falha) {
      setErroSenha(falha);
    } finally {
      setTrocando(false);
    }
  }

  return (
    <div className="container painel">
      <header className="painel__cabecalho">
        <div>
          <h1>Meu perfil</h1>
          <p className="campo__dica">{usuario.email}</p>
        </div>
        <Selo variante="entregue">{ROTULO_TIPO[usuario.tipo] || usuario.tipo}</Selo>
      </header>

      <div className="painel__grade">
        <section className="painel-secao">
          <h2 className="painel-secao__titulo">Dados pessoais</h2>

          {erroPerfil && <MensagemErro erro={erroPerfil} />}

          <form onSubmit={salvarPerfil} noValidate>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="nome">
                Nome
              </label>
              <input
                id="nome"
                className="campo__entrada"
                value={valores.nome}
                onChange={(evento) => alterar('nome', evento.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo__rotulo" htmlFor="telefone">
                Telefone
              </label>
              <input
                id="telefone"
                className="campo__entrada"
                value={valores.telefone}
                onChange={(evento) => alterar('telefone', evento.target.value)}
              />
            </div>

            <div className="campo campo__linha campo__linha--2">
              <div className="campo">
                <label className="campo__rotulo" htmlFor="cidade">
                  Cidade
                </label>
                <input
                  id="cidade"
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

            <button
              type="submit"
              className="botao botao--primario botao--bloco"
              disabled={salvando}
            >
              {salvando ? 'Salvando...' : 'Salvar dados'}
            </button>
          </form>
        </section>

        <div className="checkout__coluna">
          <section className="painel-secao">
            <h2 className="painel-secao__titulo">Alterar senha</h2>

            {erroSenha && <MensagemErro erro={erroSenha} />}

            <form onSubmit={trocarSenha} noValidate>
              <div className="campo">
                <label className="campo__rotulo" htmlFor="senha_atual">
                  Senha atual
                </label>
                <input
                  id="senha_atual"
                  type="password"
                  autoComplete="current-password"
                  className="campo__entrada"
                  value={senhas.valores.senha_atual}
                  onChange={(evento) => senhas.alterar('senha_atual', evento.target.value)}
                />
              </div>

              <div className="campo">
                <label className="campo__rotulo" htmlFor="senha_nova">
                  Nova senha
                </label>
                <input
                  id="senha_nova"
                  type="password"
                  autoComplete="new-password"
                  className="campo__entrada"
                  value={senhas.valores.senha_nova}
                  onChange={(evento) => senhas.alterar('senha_nova', evento.target.value)}
                />
                <span className="campo__dica">
                  Minimo de 8 caracteres, com letras e numeros.
                </span>
              </div>

              <div className="campo">
                <label className="campo__rotulo" htmlFor="confirmacao">
                  Confirmar nova senha
                </label>
                <input
                  id="confirmacao"
                  type="password"
                  autoComplete="new-password"
                  className="campo__entrada"
                  value={senhas.valores.confirmacao}
                  onChange={(evento) => senhas.alterar('confirmacao', evento.target.value)}
                />
              </div>

              <button
                type="submit"
                className="botao botao--secundario botao--bloco"
                disabled={trocando}
              >
                {trocando ? 'Alterando...' : 'Alterar senha'}
              </button>
            </form>
          </section>

          {usuario.tipo === 'agricultor' && (
            <section className="painel-secao">
              <h2 className="painel-secao__titulo">Minha propriedade</h2>
              <p className="campo__dica">
                Descricao, historia e certificacoes aparecem no seu perfil publico.
              </p>
              <Link to="/agricultor" className="botao botao--secundario botao--bloco">
                Ir para o painel
              </Link>
            </section>
          )}

          {usuario.tipo === 'cliente' && (
            <>
              <section className="painel-secao">
                <h2 className="painel-secao__titulo">Meus pedidos</h2>
                <p className="campo__dica">Acompanhe o status das suas compras.</p>
                <Link to="/pedidos" className="botao botao--secundario botao--bloco">
                  Ver pedidos
                </Link>
              </section>

              <MinhasAvaliacoes />
            </>
          )}
        </div>

        {usuario.tipo === 'cliente' && (
          <div className="checkout__coluna">
            <MeusEnderecos />
          </div>
        )}
      </div>
    </div>
  );
}