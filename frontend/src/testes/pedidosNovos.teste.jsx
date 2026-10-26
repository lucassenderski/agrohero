import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../components/Header.jsx';
import AvisoPedidosNovos from '../components/AvisoPedidosNovos.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { CarrinhoProvider } from '../contexts/CarrinhoContext.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import { PedidosNovosProvider } from '../contexts/PedidosNovosContext.jsx';
import { removerToken, salvarToken } from '../services/api.js';
import {
  criarProdutorLogado,
  criarClienteLogado,
  criarProduto,
  criarItemPendente,
  pedidoDoProdutor,
  chamar,
} from './ajudantes.js';

/*
 * Aviso de pedidos novos do produtor: contador no cabecalho e popup.
 *
 * Os testes NAO mockam a API: criam produtor, produto, cliente e pedido
 * de verdade, e deixam o polling do contexto buscar a contagem real. Um
 * mock esconderia justamente o que interessa - que a contagem vem do
 * banco filtrada por `agricultor_id` e por status PENDENTE.
 *
 * O intervalo do polling e encurtado pela prop `intervaloMs` para o
 * teste nao esperar 30 s. Em producao ninguem passa a prop.
 *
 * ATENCAO ao token: os ajudantes gravam o token de quem acabou de ser
 * criado. Como o cliente e criado DEPOIS do produtor, o token do produtor
 * precisa ser regravado antes do render e de novo depois de criar o
 * cliente - o `fetch` do polling le o token do localStorage na hora da
 * chamada, e nao no momento em que a tela montou.
 */

const INTERVALO_CURTO_MS = 1500;

function renderizar(produtorToken, intervaloMs = INTERVALO_CURTO_MS) {
  removerToken();
  salvarToken(produtorToken);

  return render(
    <MemoryRouter initialEntries={['/agricultor']}>
      <AuthProvider>
        <CarrinhoProvider>
          <NotificacaoProvider>
            <PedidosNovosProvider intervaloMs={intervaloMs}>
              <Header />
              <AvisoPedidosNovos />
            </PedidosNovosProvider>
          </NotificacaoProvider>
        </CarrinhoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function nomeUnico(prefixo) {
  return `${prefixo} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

describe('Aviso de pedidos novos do produtor', () => {
  let produtor;
  let produto;

  beforeEach(async () => {
    produtor = await criarProdutorLogado();
    produto = await criarProduto(produtor.token, {
      nome: nomeUnico('Cenoura'),
      preco: 5,
      estoque: 30,
    });
  });

  it('mostra o contador de itens pendentes no cabecalho', async () => {
    const cliente = await criarClienteLogado();
    await criarItemPendente({ clienteToken: cliente.token, produto });

    renderizar(produtor.token);

    await waitFor(() => {
      expect(screen.getByLabelText('1 pedidos novos')).toBeTruthy();
    });
  });

  it('nao mostra contador quando nao ha pedido pendente', async () => {
    renderizar(produtor.token);

    /*
     * O contexto busca ao montar. Damos tempo para a busca terminar e
     * conferimos a ausencia: sem pedido, nao ha contador para exibir.
     */
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Pedidos/ })).toBeTruthy();
    });
    expect(screen.queryByLabelText(/pedidos novos/)).toBeNull();
  });

  it('abre o popup quando chega um pedido novo', async () => {
    /*
     * A tela monta sem pedido nenhum. Depois um cliente compra, e o
     * polling seguinte precisa perceber o AUMENTO e abrir o aviso - e o
     * caso "pedido chegou enquanto eu estava na tela".
     */
    renderizar(produtor.token);

    await waitFor(() => {
      expect(screen.queryByLabelText(/pedidos novos/)).toBeNull();
    });

    const cliente = await criarClienteLogado();
    await criarItemPendente({ clienteToken: cliente.token, produto });

    /* Devolve o token do produtor: a compra do cliente o sobrescreveu. */
    salvarToken(produtor.token);

    const aviso = await screen.findByRole('dialog', {
      name: 'Voce recebeu um pedido novo',
    });
    expect(aviso).toBeTruthy();
    expect(screen.getByText(/Cenoura/)).toBeTruthy();
  });

  it('NAO abre o popup no login, mesmo com pedido pendente', async () => {
    /*
     * A regra "o primeiro carregamento nao avisa": o popup so aparece
     * para o que CHEGA depois. Ao logar, o contador mostra o pendente,
     * mas a tela nao e interrompida.
     */
    const cliente = await criarClienteLogado();
    await criarItemPendente({ clienteToken: cliente.token, produto });
    salvarToken(produtor.token);

    renderizar(produtor.token);

    await waitFor(() => {
      expect(screen.getByLabelText('1 pedidos novos')).toBeTruthy();
    });

    expect(
      screen.queryByRole('dialog', { name: /Voce recebeu/ }),
    ).toBeNull();
  });

  it('o contador cai quando o produtor avanca o item', async () => {
    /*
     * "Novo" e o item PENDENTE. Quando o produtor marca PROCESSANDO, o
     * numero cai - sem campo "lido" no banco.
     */
    const cliente = await criarClienteLogado();
    const itemId = await criarItemPendente({ clienteToken: cliente.token, produto });

    renderizar(produtor.token);

    await waitFor(() => {
      expect(screen.getByLabelText('1 pedidos novos')).toBeTruthy();
    });

    const pedidoId = await pedidoDoProdutor(produtor.token);
    await chamar(`/pedidos/${pedidoId}/itens/${itemId}/status`, {
      token: produtor.token,
      metodo: 'PATCH',
      corpo: { status: 'PROCESSANDO' },
    });

    await waitFor(() => {
      expect(screen.queryByLabelText(/pedidos novos/)).toBeNull();
    });
  });
});
