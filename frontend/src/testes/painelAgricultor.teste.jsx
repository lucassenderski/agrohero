import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PainelAgricultor from '../pages/PainelAgricultor.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import Notificacoes from '../components/Notificacoes.jsx';
import { removerToken, salvarToken } from '../services/api.js';
import {
  criarProdutorLogado,
  criarClienteLogado,
  criarProduto,
  criarPedidoEntregue,
  chamar,
} from './ajudantes.js';

/*
 * Testes de integracao do painel do produtor.
 *
 * As metricas do painel sao calculadas no FRONTEND a partir de duas
 * listas reais (produtos do produtor e itens de pedido que contem esses
 * produtos). Um mock de fetch esconderia justamente o que interessa:
 * que os filtros da API trazem apenas os itens DESTE produtor.
 *
 * ATENCAO ao token: os ajudantes gravam o token de quem acabou de ser
 * criado no localStorage. Como o painel le o token de la, um teste que
 * cria um cliente DEPOIS do produtor precisa regravar o token do
 * produtor antes de renderizar - senao o painel monta como cliente e
 * nao acha nada.
 */

function renderizarComoTipo(token) {
  removerToken();
  salvarToken(token);

  return render(
    <MemoryRouter initialEntries={['/agricultor']}>
      <AuthProvider>
        <NotificacaoProvider>
          <Notificacoes />
          <Routes>
            <Route path="/agricultor" element={<PainelAgricultor />} />
          </Routes>
        </NotificacaoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/* Localiza a metrica pelo rotulo, dentro da secao de indicadores. */
function metrica(rotulo) {
  return within(screen.getByRole('region', { name: 'Indicadores' }))
    .getByText(rotulo)
    .closest('article');
}

function nomeUnico(prefixo) {
  return `${prefixo} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

describe('Painel do produtor', () => {
  let produtor;

  beforeEach(async () => {
    produtor = await criarProdutorLogado();
  });

  it('comeca zerado para um produtor novo', async () => {
    renderizarComoTipo(produtor.token);

    // O cabecalho confirma quem esta logado antes das metricas.
    expect(await screen.findByText(/Ola, Produtor Teste\./)).toBeInTheDocument();

    expect(screen.getByText('Produtos')).toBeInTheDocument();
    expect(screen.getByText('Nenhum pedido ainda')).toBeInTheDocument();
    expect(screen.getByText('Nenhum produto com estoque critico.')).toBeInTheDocument();
  });

  it('conta os produtos e separa os ativos', async () => {
    const ativo = await criarProduto(produtor.token, { nome: nomeUnico('Ativo'), estoque: 50 });
    const inativo = await criarProduto(produtor.token, { nome: nomeUnico('Inativo'), estoque: 50 });

    /*
     * Desativar tem rota propria (`/disponibilidade`), nao o PATCH geral:
     * a regra e outra (so o dono, efeito direto no marketplace). Usar o
     * PATCH aqui daria 400 e o teste mediria a coisa errada.
     */
    await chamar(`/produtos/${inativo.id}/disponibilidade`, {
      token: produtor.token,
      metodo: 'PATCH',
      corpo: { ativo: false },
    });

    renderizarComoTipo(produtor.token);

    await screen.findByText(/Ola, Produtor Teste\./);

    // A metrica "Produtos" mostra o total; a nota abaixo, quantos ativos.
    await waitFor(() => {
      const rotuloProdutos = metrica('Produtos');
      expect(rotuloProdutos).toHaveTextContent('2');
      expect(rotuloProdutos).toHaveTextContent('1 ativos');
    });

    expect(ativo.ativo).not.toBe(false);
  });

  it('destaca produto com estoque baixo', async () => {
    const critico = await criarProduto(produtor.token, {
      nome: nomeUnico('Critico'),
      estoque: 2,
    });

    renderizarComoTipo(produtor.token);

    await waitFor(() => {
      expect(screen.getByText(critico.nome)).toBeInTheDocument();
    });

    const metricaEstoque = metrica('Estoque baixo');
    expect(metricaEstoque).toHaveTextContent('1');
  });

  it('mostra o pedido entregue e soma o valor vendido', async () => {
    /*
     * O caminho completo: cliente compra, produtor avanca o status ate
     * ENTREGUE. So entao o item conta para "Valor vendido" - e por isso
     * a metrica diz "somente itens entregues".
     */
    const cliente = await criarClienteLogado();
    const produto = await criarProduto(produtor.token, {
      nome: nomeUnico('Vendido'),
      preco: 25,
      estoque: 10,
    });

    const pedido = await criarPedidoEntregue({
      produtorToken: produtor.token,
      clienteToken: cliente.token,
      produto,
    });

    renderizarComoTipo(produtor.token);

    await waitFor(
      () => {
        // O numero do pedido aparece na lista de recentes.
        expect(screen.getByText(new RegExp(`#${pedido.id}`))).toBeInTheDocument();
      },
      { timeout: 6000 },
    );

    const metricaVendido = metrica('Valor vendido');
    expect(metricaVendido).toHaveTextContent('R$');
    expect(metricaVendido).toHaveTextContent('25,00');

    const metricaPedidos = metrica('Pedidos');
    expect(metricaPedidos).toHaveTextContent('1');
  });

  it('nao mostra itens de pedido de OUTRO produtor', async () => {
    /*
     * Esta e a regra multi-agricultor vista pelo painel: o produtor so
     * enxerga o que e dele. Um pedido do vizinho nao pode inflar as
     * metricas nem aparecer na lista.
     */
    const outroProdutor = await criarProdutorLogado();
    const cliente = await criarClienteLogado();

    const produtoDoOutro = await criarProduto(outroProdutor.token, {
      nome: nomeUnico('DoVizinho'),
      preco: 99,
      estoque: 10,
    });

    await criarPedidoEntregue({
      produtorToken: outroProdutor.token,
      clienteToken: cliente.token,
      produto: produtoDoOutro,
    });

    renderizarComoTipo(produtor.token);

    await screen.findByText(/Ola, Produtor Teste\./);

    // Ainda que o pedido exista no marketplace, este painel fica zerado.
    await waitFor(() => {
      expect(screen.getByText('Nenhum pedido ainda')).toBeInTheDocument();
    });

    const metricaVendido = metrica('Valor vendido');
    expect(metricaVendido).toHaveTextContent('R$ 0,00');

    const metricaPedidos = metrica('Pedidos');
    expect(metricaPedidos).toHaveTextContent('0');
  });
});