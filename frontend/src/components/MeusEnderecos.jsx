import { useCallback, useEffect, useState } from 'react';
import {
  listarEnderecos,
  criarEndereco,
  atualizarEndereco,
  removerEndereco,
  definirEnderecoPrincipal,
} from '../services/compras.js';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import { useFormulario } from '../hooks/useMutacao.js';
import { Carregando, MensagemErro, EstadoVazio, Modal } from './ui.jsx';
import EnderecoFormulario, {
  CAMPOS_OBRIGATORIOS_ENDERECO,
  ENDERECO_VAZIO,
} from './EnderecoFormulario.jsx';
import { resumirEndereco } from '../utils/formato.js';

/*
 * Gestao dos enderecos de entrega do consumidor.
 *
 * Fica no perfil porque endereco e dado de conta, e nao etapa de
 * compra: o cliente costuma cadastrar o endereco uma vez e reusar. O
 * checkout continua permitindo criar um endereco novo, mas editar e
 * remover ficam aqui - assim o fluxo de compra nao carrega botoes de
 * manutencao.
 *
 * Toda escrita recarrega a lista do servidor em vez de remendar o
 * estado local: o backend decide quem e o principal (o primeiro
 * cadastrado, e o promovido depois), e essa regra mudaria de lugar se o
 * frontend tentasse adivinhar.
 */
export default function MeusEnderecos() {
  const { sucesso, erro: notificarErro } = useNotificacao();

  const [enderecos, setEnderecos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [editando, setEditando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const formulario = useFormulario(ENDERECO_VAZIO);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setEnderecos((await listarEnderecos()) || []);
    } catch (falha) {
      setErro(falha);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    formulario.reiniciar(ENDERECO_VAZIO);
    setEditando({});
  }

  function abrirEdicao(endereco) {
    formulario.reiniciar({
      nome_destinatario: endereco.nome_destinatario || '',
      cep: endereco.cep || '',
      rua: endereco.rua || '',
      numero: endereco.numero || '',
      complemento: endereco.complemento || '',
      bairro: endereco.bairro || '',
      cidade: endereco.cidade || '',
      estado: endereco.estado || '',
    });
    setEditando(endereco);
  }

  async function salvar(evento) {
    evento.preventDefault();

    const faltando = CAMPOS_OBRIGATORIOS_ENDERECO.filter(
      (campo) => !String(formulario.valores[campo] || '').trim(),
    );
    if (faltando.length > 0) {
      notificarErro('Preencha todos os campos obrigatorios do endereco.');
      return;
    }

    // A API guarda o CEP so com digitos; a mascara e de exibicao.
    const dados = {
      ...formulario.valores,
      cep: formulario.valores.cep.replace(/\D/g, ''),
      complemento: formulario.valores.complemento || null,
    };

    setSalvando(true);
    try {
      if (editando?.id) {
        await atualizarEndereco(editando.id, dados);
        sucesso('Endereco atualizado.');
      } else {
        await criarEndereco(dados);
        sucesso('Endereco cadastrado.');
      }
      setEditando(null);
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel salvar o endereco.');
    } finally {
      setSalvando(false);
    }
  }

  async function tornarPrincipal(endereco) {
    try {
      await definirEnderecoPrincipal(endereco.id);
      sucesso('Endereco principal atualizado.');
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel definir o endereco principal.');
    }
  }

  async function remover(endereco) {
    if (!window.confirm(`Remover o endereco de ${endereco.nome_destinatario}?`)) return;
    try {
      await removerEndereco(endereco.id);
      sucesso('Endereco removido.');
      await carregar();
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel remover o endereco.');
    }
  }

  return (
    <section className="painel-secao">
      <div className="painel-secao__cabecalho">
        <h2 className="painel-secao__titulo">Enderecos de entrega</h2>
        <button type="button" className="botao botao--secundario" onClick={abrirNovo}>
          Novo endereco
        </button>
      </div>

      {carregando && <Carregando texto="Carregando enderecos..." />}

      {!carregando && erro && <MensagemErro erro={erro} aoTentarNovamente={carregar} />}

      {!carregando && !erro && enderecos.length === 0 && (
        <EstadoVazio
          titulo="Nenhum endereco cadastrado"
          descricao="Cadastre um endereco para agilizar suas proximas compras."
        />
      )}

      {!carregando && !erro && enderecos.length > 0 && (
        <ul className="lista-enderecos">
          {enderecos.map((endereco) => (
            <li key={endereco.id} className="lista-enderecos__item">
              <div>
                <strong>{endereco.nome_destinatario}</strong>
                {endereco.principal && (
                  <span className="checkout__endereco-principal">Principal</span>
                )}
                <p className="campo__dica">{resumirEndereco(endereco)}</p>
              </div>
              <div className="item-acoes">
                {!endereco.principal && (
                  <button
                    type="button"
                    className="botao botao--texto"
                    onClick={() => tornarPrincipal(endereco)}
                  >
                    Tornar principal
                  </button>
                )}
                <button
                  type="button"
                  className="botao botao--texto"
                  onClick={() => abrirEdicao(endereco)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="botao botao--texto"
                  onClick={() => remover(endereco)}
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        titulo={editando?.id ? 'Editar endereco' : 'Novo endereco'}
        aberto={Boolean(editando)}
        aoFechar={() => setEditando(null)}
        acoes={
          <>
            <button
              type="button"
              className="botao botao--texto"
              onClick={() => setEditando(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="form-endereco-perfil"
              className="botao botao--primario"
              disabled={salvando}
            >
              {salvando ? 'Salvando...' : 'Salvar endereco'}
            </button>
          </>
        }
      >
        <form id="form-endereco-perfil" onSubmit={salvar} noValidate>
          <EnderecoFormulario
            valores={formulario.valores}
            alterar={formulario.alterar}
            idPrefixo="perfil-endereco"
          />
        </form>
      </Modal>
    </section>
  );
}