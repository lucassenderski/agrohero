import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listarEnderecos,
  criarEndereco,
  previaCheckout,
  finalizarCheckout,
} from '../services/compras.js';
import { useCarrinho } from '../contexts/CarrinhoContext.jsx';
import { useNotificacao } from '../contexts/NotificacaoContext.jsx';
import { useFormulario } from '../hooks/useMutacao.js';
import { Carregando, MensagemErro, EstadoVazio, Modal } from '../components/ui.jsx';
import EnderecoFormulario, {
  CAMPOS_OBRIGATORIOS_ENDERECO,
  ENDERECO_VAZIO as ENDERECO_VAZIO_BASE,
} from '../components/EnderecoFormulario.jsx';
import { formatarMoeda, resumirEndereco } from '../utils/formato.js';
import '../components/pedido.css';

const METODOS = [
  { valor: 'PIX', rotulo: 'PIX', descricao: 'Aprovacao imediata no sandbox.' },
  { valor: 'CARTAO', rotulo: 'Cartao de credito', descricao: 'Processado pelo gateway.' },
  { valor: 'BOLETO', rotulo: 'Boleto', descricao: 'Compensa em ate 2 dias uteis.' },
];

const ENDERECO_VAZIO = { ...ENDERECO_VAZIO_BASE };

/*
 * Checkout em duas etapas: revisao e finalizacao.
 *
 * O valor mostrado vem SEMPRE de POST /checkout/preview, que recalcula
 * no servidor. A tela nunca soma o carrinho por conta propria: entre
 * abrir a pagina e confirmar, o preco ou o frete podem mudar, e o
 * cliente precisa ver exatamente o valor que sera cobrado.
 *
 * O pagamento recusado NAO desfaz o pedido - o backend cria o pedido e
 * registra o pagamento separadamente. Por isso, apos finalizar, o
 * usuario e levado ao pedido mesmo quando o status do pagamento nao e
 * APROVADO: o pedido existe e pode ser pago depois.
 */
export default function Checkout() {
  const { carrinho, recarregar } = useCarrinho();
  const { sucesso, erro: notificarErro } = useNotificacao();
  const navegar = useNavigate();

  const [enderecos, setEnderecos] = useState([]);
  const [enderecoId, setEnderecoId] = useState(null);
  const [metodo, setMetodo] = useState('PIX');
  const [previa, setPrevia] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [modalEndereco, setModalEndereco] = useState(false);

  const { valores, alterar, reiniciar } = useFormulario(ENDERECO_VAZIO);

  /* Carrega enderecos e escolhe o principal. */
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const lista = await listarEnderecos();
        if (!ativo) return;
        const itens = lista || [];
        setEnderecos(itens);
        const principal = itens.find((item) => item.principal) || itens[0];
        setEnderecoId(principal ? principal.id : null);
      } catch (falha) {
        if (ativo) setErro(falha);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  /* Sempre que o endereco muda, pede o resumo novo ao servidor. */
  useEffect(() => {
    if (!enderecoId) {
      setPrevia(null);
      return;
    }
    let ativo = true;
    setCalculando(true);
    (async () => {
      try {
        const resultado = await previaCheckout(enderecoId);
        if (ativo) setPrevia(resultado);
      } catch (falha) {
        if (ativo) notificarErro(falha.mensagem || 'Nao foi possivel calcular o frete.');
      } finally {
        if (ativo) setCalculando(false);
      }
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enderecoId]);

  async function salvarEndereco(evento) {
    evento.preventDefault();

    const obrigatorios = CAMPOS_OBRIGATORIOS_ENDERECO;
    const faltando = obrigatorios.filter((campo) => !String(valores[campo] || '').trim());
    if (faltando.length > 0) {
      notificarErro('Preencha todos os campos obrigatorios do endereco.');
      return;
    }

    try {
      const criado = await criarEndereco({
        ...valores,
        cep: valores.cep.replace(/\D/g, ''),
        principal: enderecos.length === 0,
      });
      const lista = await listarEnderecos();
      setEnderecos(lista || []);
      setEnderecoId(criado.id);
      reiniciar(ENDERECO_VAZIO);
      setModalEndereco(false);
      sucesso('Endereco cadastrado.');
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel salvar o endereco.');
    }
  }

  async function confirmar() {
    if (!enderecoId) {
      notificarErro('Escolha um endereco de entrega.');
      return;
    }

    setFinalizando(true);
    try {
      const resultado = await finalizarCheckout(enderecoId, metodo);

      /*
       * O pedido existe mesmo com pagamento recusado - o backend grava o
       * pedido e o pagamento em passos separados. A mensagem acompanha o
       * status real do pagamento, e nao um "sucesso" generico.
       */
      if (resultado.pagamento?.status === 'APROVADO') {
        sucesso('Pedido realizado com sucesso.');
      } else {
        notificarErro(
          resultado.pagamento?.mensagem ||
            'Pedido criado, mas o pagamento nao foi aprovado. Voce pode tentar novamente.',
        );
      }

      await recarregar();
      navegar(`/pedidos/${resultado.pedido.id}`, { replace: true });
    } catch (falha) {
      notificarErro(falha.mensagem || 'Nao foi possivel concluir o pedido.');
    } finally {
      setFinalizando(false);
    }
  }

  if (carregando) return <Carregando texto="Preparando o checkout..." />;

  if (erro) {
    return (
      <div className="container carrinho">
        <h1>Checkout</h1>
        <MensagemErro erro={erro} />
      </div>
    );
  }

  if ((carrinho.itens || []).length === 0) {
    return (
      <div className="container carrinho">
        <h1>Checkout</h1>
        <EstadoVazio
          titulo="Nao ha itens para finalizar"
          descricao="Adicione produtos ao carrinho antes de fazer o checkout."
        />
      </div>
    );
  }

  const itens = previa?.itens || carrinho.itens || [];
  const bloqueado = (previa?.itens || []).some((item) => item.disponivel === false);

  return (
    <div className="container carrinho">
      <h1>Checkout</h1>

      <div className="carrinho__corpo">
        <div className="checkout__coluna">
          <section className="painel-secao">
            <div className="painel__cabecalho">
              <h2 className="painel-secao__titulo">Endereco de entrega</h2>
              <button
                type="button"
                className="botao botao--secundario"
                onClick={() => setModalEndereco(true)}
              >
                Novo endereco
              </button>
            </div>

            {enderecos.length === 0 && (
              <p className="campo__dica">
                Voce ainda nao tem endereco cadastrado. Cadastre um para continuar.
              </p>
            )}

            {enderecos.length > 0 && (
              <div className="checkout__enderecos">
                {enderecos.map((endereco) => (
                  <label
                    key={endereco.id}
                    className={`checkout__endereco ${
                      enderecoId === endereco.id ? 'checkout__endereco--ativo' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="endereco"
                      checked={enderecoId === endereco.id}
                      onChange={() => setEnderecoId(endereco.id)}
                    />
                    <span>
                      <strong>{endereco.nome_destinatario}</strong>
                      <span className="checkout__endereco-linha">
                        {resumirEndereco(endereco)}
                      </span>
                      {endereco.principal && (
                        <span className="checkout__endereco-principal">Principal</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="painel-secao">
            <h2 className="painel-secao__titulo">Forma de pagamento</h2>
            <div className="checkout__metodos">
              {METODOS.map((opcao) => (
                <label
                  key={opcao.valor}
                  className={`checkout__metodo ${
                    metodo === opcao.valor ? 'checkout__metodo--ativo' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="metodo"
                    value={opcao.valor}
                    checked={metodo === opcao.valor}
                    onChange={() => setMetodo(opcao.valor)}
                  />
                  <span>
                    <strong>{opcao.rotulo}</strong>
                    <span className="checkout__metodo-descricao">{opcao.descricao}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="campo__dica">
              Nenhum dado de cartao passa por este site: a cobranca e feita pelo gateway.
            </p>
          </section>

          <section className="painel-secao">
            <h2 className="painel-secao__titulo">Itens</h2>
            <table className="painel-secao__tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <tr key={item.produto_id}>
                    <td>{item.nome || item.produto?.nome}</td>
                    <td>{item.quantidade}</td>
                    <td>{formatarMoeda(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="resumo" aria-label="Resumo do pedido">
          <h2 className="resumo__titulo">Resumo</h2>

          {calculando && <p className="campo__dica">Calculando frete...</p>}

          <div className="resumo__linhas">
            <div className="resumo__linha">
              <span>Produtos</span>
              <span>{formatarMoeda(previa?.valor_produtos ?? carrinho.valor_produtos)}</span>
            </div>
            <div className="resumo__linha">
              <span>Frete</span>
              <span>
                {previa?.frete_gratis ? 'Gratis' : formatarMoeda(previa?.valor_frete ?? 0)}
              </span>
            </div>
            <div className="resumo__linha resumo__linha--total">
              <span>Total</span>
              <span>{formatarMoeda(previa?.valor_total ?? carrinho.valor_total)}</span>
            </div>
          </div>

          {previa?.frete_motivo && <p className="resumo__destaque">{previa.frete_motivo}</p>}

          {previa?.falta_para_frete_gratis > 0 && (
            <p className="campo__dica">
              Faltam {formatarMoeda(previa.falta_para_frete_gratis)} para o frete gratis.
            </p>
          )}

          {bloqueado && (
            <p className="carrinho-item__aviso">
              Ha itens sem estoque suficiente. Ajuste o carrinho antes de finalizar.
            </p>
          )}

          <button
            type="button"
            className="botao botao--primario botao--bloco"
            disabled={finalizando || calculando || bloqueado || !enderecoId}
            onClick={confirmar}
          >
            {finalizando ? 'Processando pagamento...' : 'Confirmar pedido'}
          </button>
        </aside>
      </div>

      <Modal
        titulo="Novo endereco"
        aberto={modalEndereco}
        aoFechar={() => setModalEndereco(false)}
        acoes={
          <>
            <button
              type="button"
              className="botao botao--texto"
              onClick={() => setModalEndereco(false)}
            >
              Cancelar
            </button>
            <button type="submit" form="form-endereco" className="botao botao--primario">
              Salvar endereco
            </button>
          </>
        }
      >
        <form id="form-endereco" onSubmit={salvarEndereco} noValidate>
          <EnderecoFormulario valores={valores} alterar={alterar} idPrefixo="checkout" />
        </form>
      </Modal>
    </div>
  );
}