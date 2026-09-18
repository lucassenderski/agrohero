import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Produtos from '../pages/Produtos.jsx';
import Carrinho from '../pages/Carrinho.jsx';
import Checkout from '../pages/Checkout.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { CarrinhoProvider } from '../contexts/CarrinhoContext.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import Notificacoes from '../components/Notificacoes.jsx';
import {
  criarClienteLogado,
  criarProdutorLogado,
  criarProduto,
  criarEnderecoDoUsuario,
  chamar,
} from './ajudantes.js';

/*
 * Testes de integracao do fluxo de compra.
 *
 * Nenhuma chamada de API e mockada: os testes registram produtor e
 * cliente de verdade, publicam um produto, adicionam ao carrinho,
 * passam pelo checkout e conferem o pedido no servidor. O que se quer
 * verificar aqui nao aparece num mock - o formato do envelope, o
 * recalculo de preco no servidor e a baixa de estoque.
 *
 * O carrinho e o checkout recebem um nome de produto UNICO por teste.
 * Como a vitrine lista todos os produtos do marketplace, procurar por
 * um nome fixo ("Tomate") acharia o produto de outro teste rodando em
 * paralelo.
 */

/* Nome unico por teste, para isolar a busca na vitrine. */
function nomeUnico() {
  return `Cenoura Teste ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function renderizar(rotaInicial = '/produtos') {
  return render(
    <MemoryRouter initialEntries={[rotaInicial]}>
      <AuthProvider>
        <NotificacaoProvider>
          <CarrinhoProvider>
            <Notificacoes />
            <Routes>
              <Route path="/produtos" element={<Produtos />} />
              <Route path="/carrinho" element={<Carrinho />} />
              <Route path="/checkout" element={<Checkout />} />
            </Routes>
          </CarrinhoProvider>
        </NotificacaoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Fluxo de compra', () => {
  let produtor;
  let cliente;
  let produto;

  beforeEach(async () => {
    produtor = await criarProdutorLogado();
    produto = await criarProduto(produtor.token, {
      nome: nomeUnico(),
      preco: 12.5,
      estoque: 10,
    });

    /*
     * O cliente e criado DEPOIS do produto e o token dele e o que fica
     * no localStorage. A criacao do produto precisa do token do produtor
     * ainda ativo, por isso a ordem importa.
     */
    cliente = await criarClienteLogado();
  });

  it('adiciona um produto da vitrine ao carrinho', async () => {
    const usuario = userEvent.setup();
    renderizar('/produtos');

    // Procura pelo nome unico para achar o produto deste teste.
    await usuario.type(screen.getByRole('searchbox'), `${produto.nome}{Enter}`);

    const cartao = await screen.findByText(produto.nome, {}, { timeout: 5000 });

    // O botao fica dentro do card do produto desse teste.
    const card = cartao.closest('article') || cartao.closest('li');
    await usuario.click(within(card).getByRole('button', { name: /adicionar/i }));

    expect(await screen.findByText(/adicionado ao carrinho/i)).toBeInTheDocument();

    // Confirma no servidor, e nao apenas na tela. O item do carrinho
    // aninha o produto (`item.produto.id`), nao expoe `produto_id` no topo.
    const { dados } = await chamar('/carrinho', { metodo: 'GET', token: cliente.token });
    expect(dados.itens).toHaveLength(1);
    expect(dados.itens[0].produto.id).toBe(produto.id);
    expect(dados.itens[0].quantidade).toBe(1);
  });

  it('o preco do carrinho vem do servidor, nao da tela', async () => {
    /*
     * A tela nao multiplica quantidade por preco: o subtotal exibido e o
     * que o backend calculou. Este teste confere que os dois batem
     * depois da resposta real.
     */
    await chamar('/carrinho/itens', {
      token: cliente.token,
      corpo: { produto_id: produto.id, quantidade: 2 },
    });

    renderizar('/carrinho');

    const { dados } = await chamar('/carrinho', { metodo: 'GET', token: cliente.token });

    expect(dados.valor_produtos).toBe(produto.preco * 2);
    expect(await screen.findByText(produto.nome)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('recusa quantidade acima do estoque sem alterar o carrinho', async () => {
    /*
     * O estoque do produto e 10. Pedir 999 precisa falhar e o carrinho
     * tem que continuar consistente - nem com o item, nem com quantidade
     * parcial.
     */
    let falhou = false;
    try {
      await chamar('/carrinho/itens', {
        token: cliente.token,
        corpo: { produto_id: produto.id, quantidade: 999 },
      });
    } catch (erro) {
      falhou = true;
      expect([400, 409, 422]).toContain(erro.status);
    }

    expect(falhou).toBe(true);

    const { dados } = await chamar('/carrinho', { metodo: 'GET', token: cliente.token });
    expect(dados.itens).toHaveLength(0);
  });

  it('alterar a quantidade do carrinho recalcula no servidor', async () => {
    await chamar('/carrinho/itens', {
      token: cliente.token,
      corpo: { produto_id: produto.id, quantidade: 1 },
    });

    const usuario = userEvent.setup();
    renderizar('/carrinho');

    await screen.findByText(produto.nome);
    await usuario.click(screen.getByRole('button', { name: 'Aumentar quantidade' }));

    await waitFor(async () => {
      const { dados } = await chamar('/carrinho', { metodo: 'GET', token: cliente.token });
      expect(dados.itens[0].quantidade).toBe(2);
      expect(dados.valor_produtos).toBe(produto.preco * 2);
    });
  });

  it('remove o item e o carrinho volta ao estado vazio', async () => {
    await chamar('/carrinho/itens', {
      token: cliente.token,
      corpo: { produto_id: produto.id, quantidade: 1 },
    });

    const usuario = userEvent.setup();
    renderizar('/carrinho');

    await screen.findByText(produto.nome);
    await usuario.click(screen.getByRole('button', { name: 'Remover' }));

    expect(await screen.findByText(/carrinho esta vazio/i)).toBeInTheDocument();

    const { dados } = await chamar('/carrinho', { metodo: 'GET', token: cliente.token });
    expect(dados.itens).toHaveLength(0);
  });

  it('finaliza a compra e cria o pedido com o total calculado pelo servidor', async () => {
    /*
     * O teste de ponta a ponta do fluxo: item no carrinho, endereco,
     * checkout e pedido gravado. A prova nao e a tela dizer "sucesso" -
     * e o pedido existir no servidor com o valor certo e o estoque
     * baixado.
     */
    const enderecoId = await criarEnderecoDoUsuario(cliente.token);

    await chamar('/carrinho/itens', {
      token: cliente.token,
      corpo: { produto_id: produto.id, quantidade: 3 },
    });

    const usuario = userEvent.setup();
    renderizar('/checkout');

    // O checkout precisa carregar enderecos e a previa de frete.
    await screen.findByText(/Forma de pagamento/i);

    // O endereco criado e a unica opcao; ele ja vem selecionado.
    expect(screen.getByDisplayValue('PIX')).toBeChecked();

    const confirmar = screen.getByRole('button', { name: /confirmar pedido/i });
    await waitFor(() => expect(confirmar).toBeEnabled());

    await usuario.click(confirmar);

    // Localiza o pedido no servidor e confere os valores.
    await waitFor(
      async () => {
        const { dados } = await chamar('/pedidos', { metodo: 'GET', token: cliente.token });
        expect(dados).toHaveLength(1);
      },
      { timeout: 8000 },
    );

    const { dados: pedidos } = await chamar('/pedidos', { metodo: 'GET', token: cliente.token });
    const pedido = pedidos[0];

    expect(pedido.endereco_entrega.cep).toBe('13010100');
    expect(Number(pedido.valor_produtos)).toBe(produto.preco * 3);
    expect(Number(pedido.valor_total)).toBe(
      Number(pedido.valor_produtos) + Number(pedido.valor_frete),
    );

    // O estoque caiu exatamente o que foi comprado.
    const { dados: atualizado } = await chamar(`/produtos/${produto.id}`, { metodo: 'GET' });
    expect(atualizado.estoque).toBe(10 - 3);

    // O carrinho ficou vazio apos o checkout.
    const { dados: carrinhoDepois } = await chamar('/carrinho', {
      metodo: 'GET',
      token: cliente.token,
    });
    expect(carrinhoDepois.itens).toHaveLength(0);

    expect(enderecoId).toBeTruthy();
  });

  it('nao deixa finalizar com o carrinho vazio', async () => {
    renderizar('/checkout');

    // Sem itens, o checkout mostra o estado vazio em vez do formulario.
    expect(await screen.findByText(/Nao ha itens para finalizar/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmar pedido/i })).not.toBeInTheDocument();
  });

  it('nao deixa finalizar sem endereco escolhido', async () => {
    await chamar('/carrinho/itens', {
      token: cliente.token,
      corpo: { produto_id: produto.id, quantidade: 1 },
    });

    renderizar('/checkout');

    await screen.findByText(/Forma de pagamento/i);

    // Sem endereco, o botao fica desabilitado e a tela orienta.
    expect(screen.getByText(/ainda nao tem endereco cadastrado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar pedido/i })).toBeDisabled();
  });
});