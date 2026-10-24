import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AgricultorPedidos from '../pages/AgricultorPedidos.jsx';
import PedidoDetalhe from '../pages/PedidoDetalhe.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import { RotaPorTipo } from '../routes/Guards.jsx';
import Notificacoes from '../components/Notificacoes.jsx';
import { removerToken, salvarToken } from '../services/api.js';
import {
  criarProdutorLogado,
  criarClienteLogado,
  criarProduto,
  criarItemPendente,
  pedidoDoProdutor,
} from './ajudantes.js';

/*
 * Testes de integracao da pagina de pedidos do produtor.
 *
 * O que interessa aqui e o CONTATO DE ENTREGA: o produtor precisa do
 * endereco completo e de um telefone para entregar e para avisar quando
 * nao houver ninguem em casa. A API ja devolvia o endereco no snapshot
 * do pedido, mas a tela mostrava apenas `cidade/UF` - sem numero nem
 * telefone, o produtor nao consegue chegar ao cliente.
 *
 * Os testes NAO mockam a API: criam produtor, cliente, produto e pedido
 * de verdade, e conferem o que a tela renderiza com o dado que o
 * servidor devolveu. Um mock esconderia justamente o que interessa - que
 * o telefone chega no snapshot do pedido.
 *
 * ATENCAO ao token: os ajudantes gravam o token de quem acabou de ser
 * criado. Como o cliente e criado DEPOIS do produtor, o token do produtor
 * precisa ser regravado antes do render - senao a pagina monta como
 * cliente e nao acha nada.
 */

function renderizarComoProdutor(token, rota = '/agricultor/pedidos') {
  removerToken();
  salvarToken(token);

  return render(
    <MemoryRouter initialEntries={[rota]}>
      <AuthProvider>
        <NotificacaoProvider>
          <Notificacoes />
          <Routes>
            {/*
             * A rota usa o MESMO <RotaPorTipo> do App: a pagina assume
             * que existe usuario carregado, e e o guard que segura o
             * render ate o perfil chegar. Sem ele, o fetch da pagina
             * pode terminar antes do AuthContext e o componente le de um
             * usuario ainda null.
             */}
            <Route element={<RotaPorTipo tipos={['agricultor']} />}>
              <Route path="/agricultor/pedidos" element={<AgricultorPedidos />} />
              <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
            </Route>
          </Routes>
        </NotificacaoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function nomeUnico(prefixo) {
  return `${prefixo} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

describe('Pedidos do produtor - contato de entrega', () => {
  let produtor;
  let cliente;
  let produto;

  beforeEach(async () => {
    produtor = await criarProdutorLogado();
    produto = await criarProduto(produtor.token, {
      nome: nomeUnico('Abobrinha'),
      preco: 7.5,
      estoque: 20,
    });
    cliente = await criarClienteLogado();
    await criarItemPendente({ clienteToken: cliente.token, produto });
  });

  it('mostra o endereco completo e o telefone do comprador', async () => {
    renderizarComoProdutor(produtor.token);

    await waitFor(() => {
      expect(screen.getByText(/Rua de Teste, 42/)).toBeTruthy();
    });

    /* O bairro e a cidade precisam aparecer: so "Campinas/SP" nao leva a
     * ninguem ate a porta. */
    expect(screen.getByText(/Centro/)).toBeTruthy();
    expect(screen.getByText(/Campinas\/SP/)).toBeTruthy();

    /* O CEP ajuda o produtor a montar a rota. */
    expect(screen.getByText(/13010-100/)).toBeTruthy();
  });

  it('o telefone vira um link clicavel para ligar', async () => {
    renderizarComoProdutor(produtor.token);

    /*
     * O telefone e formatado para leitura, mas o href usa so os digitos -
     * e o formato que o discador do celular espera.
     */
    const link = await screen.findByRole('link', { name: /\(19\) 99999-8888/ });
    expect(link.getAttribute('href')).toBe('tel:19999998888');
  });

  /*
   * O detalhe do pedido e a outra porta de entrada do produtor. O
   * telefone precisa estar la tambem - se ele abrir o pedido pela lista
   * do consumidor ou por um link direto, o contato nao pode depender de
   * passar pela tela de pedidos recebidos.
   */
  it('no detalhe do pedido, o produtor ve o telefone do comprador', async () => {
    const pedidoId = await pedidoDoProdutor(produtor.token);

    renderizarComoProdutor(produtor.token, `/pedidos/${pedidoId}`);

    const link = await screen.findByRole('link', { name: /\(19\) 99999-8888/ });
    expect(link.getAttribute('href')).toBe('tel:19999998888');
  });
});
