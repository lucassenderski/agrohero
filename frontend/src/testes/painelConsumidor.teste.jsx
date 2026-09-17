import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MeusEnderecos from '../components/MeusEnderecos.jsx';
import Notificacoes from '../components/Notificacoes.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import {
  criarClienteLogado,
  criarProdutorLogado,
  criarProduto,
  criarPedidoEntregue,
  chamar,
} from './ajudantes.js';

/*
 * Testes de integracao do painel do consumidor.
 *
 * O componente fala com a API de verdade (nenhum mock): cada teste cria
 * sua propria conta, produto e pedido. Isso verifica o que mais importa
 * aqui - que o componente le o formato certo do backend e que as regras
 * de autorizacao (item entregue, sem avaliacao repetida) valem de ponta
 * a ponta.
 */

function renderizar(ui) {
  return render(
    <MemoryRouter>
      <NotificacaoProvider>
        <Notificacoes />
        {ui}
      </NotificacaoProvider>
    </MemoryRouter>,
  );
}

describe('MeusEnderecos', () => {
  let cliente;

  beforeEach(async () => {
    cliente = await criarClienteLogado();
  });

  it('mostra estado vazio quando o cliente nao tem endereco', async () => {
    renderizar(<MeusEnderecos />);

    expect(await screen.findByText('Nenhum endereco cadastrado')).toBeInTheDocument();
  });

  it('cadastra um endereco e o exibe na lista', async () => {
    const usuario = userEvent.setup();
    renderizar(<MeusEnderecos />);

    await screen.findByText('Nenhum endereco cadastrado');

    await usuario.click(screen.getByRole('button', { name: 'Novo endereco' }));

    await usuario.type(screen.getByLabelText(/Quem recebe/), 'Maria Souza');
    await usuario.type(screen.getByLabelText(/^CEP/), '13010200');
    await usuario.type(screen.getByLabelText(/Bairro/), 'Vila Industrial');
    await usuario.type(screen.getByLabelText(/^Rua/), 'Avenida Brasil');
    await usuario.type(screen.getByLabelText(/Numero/), '450');
    await usuario.type(screen.getByLabelText(/Cidade/), 'Campinas');
    await usuario.selectOptions(screen.getByLabelText(/Estado/), 'SP');

    await usuario.click(screen.getByRole('button', { name: 'Salvar endereco' }));

    // O nome aparece na lista, e o primeiro endereco vira o principal.
    expect(await screen.findByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('Principal')).toBeInTheDocument();

    // Confirma no servidor que o CEP foi gravado sem mascara.
    const { dados } = await chamar('/enderecos', { metodo: 'GET', token: cliente.token });
    expect(dados).toHaveLength(1);
    expect(dados[0].cep).toBe('13010200');
    expect(dados[0].cidade).toBe('Campinas');
    expect(dados[0].estado).toBe('SP');
  });

  it('nao envia o formulario com campos obrigatorios vazios', async () => {
    const usuario = userEvent.setup();
    renderizar(<MeusEnderecos />);

    await screen.findByText('Nenhum endereco cadastrado');
    await usuario.click(screen.getByRole('button', { name: 'Novo endereco' }));
    await usuario.click(screen.getByRole('button', { name: 'Salvar endereco' }));

    expect(
      await screen.findByText('Preencha todos os campos obrigatorios do endereco.'),
    ).toBeInTheDocument();

    const { dados } = await chamar('/enderecos', { metodo: 'GET', token: cliente.token });
    expect(dados).toHaveLength(0);
  });

  it('troca o endereco principal e mantem apenas um', async () => {
    const usuario = userEvent.setup();

    await chamar('/enderecos', {
      token: cliente.token,
      corpo: {
        nome_destinatario: 'Primeiro',
        cep: '13010100',
        rua: 'Rua Um',
        numero: '1',
        complemento: null,
        bairro: 'Centro',
        cidade: 'Campinas',
        estado: 'SP',
      },
    });
    await chamar('/enderecos', {
      token: cliente.token,
      corpo: {
        nome_destinatario: 'Segundo',
        cep: '13010200',
        rua: 'Rua Dois',
        numero: '2',
        complemento: null,
        bairro: 'Centro',
        cidade: 'Campinas',
        estado: 'SP',
      },
    });

    renderizar(<MeusEnderecos />);
    await screen.findByText('Segundo');

    await usuario.click(screen.getByRole('button', { name: 'Tornar principal' }));

    await waitFor(async () => {
      const { dados } = await chamar('/enderecos', { metodo: 'GET', token: cliente.token });
      const principais = dados.filter((endereco) => endereco.principal);
      expect(principais).toHaveLength(1);
      expect(principais[0].nome_destinatario).toBe('Segundo');
    });
  });

  it('remove um endereco nao principal e recusa remover o principal', async () => {
    const usuario = userEvent.setup();

    /*
     * Duas regras do backend aparecem aqui:
     *   - o usuario precisa manter ao menos um endereco (422 ULTIMO_ENDERECO);
     *   - o endereco PRINCIPAL nao pode ser removido enquanto houver outro
     *     (422 ENDERECO_PRINCIPAL): e preciso promover outro antes.
     * O primeiro cadastrado vira principal automaticamente.
     */
    const endereco = {
      cep: '13010100',
      complemento: null,
      bairro: 'Centro',
      cidade: 'Campinas',
      estado: 'SP',
    };

    await chamar('/enderecos', {
      token: cliente.token,
      corpo: { ...endereco, nome_destinatario: 'Endereco Antigo', rua: 'Rua Um', numero: '1' },
    });
    await chamar('/enderecos', {
      token: cliente.token,
      corpo: { ...endereco, nome_destinatario: 'Endereco Novo', rua: 'Rua Dois', numero: '2' },
    });

    // `window.confirm` e bloqueante no jsdom; autorizamos a remocao.
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderizar(<MeusEnderecos />);
    await screen.findByText('Endereco Novo');

    // Remover o principal e recusado, com o motivo real vindo da API.
    const itemPrincipal = screen.getByText('Endereco Antigo').closest('li');
    await usuario.click(within(itemPrincipal).getByRole('button', { name: 'Remover' }));

    expect(
      await screen.findByText('Defina outro endereco como principal antes de remover este.'),
    ).toBeInTheDocument();

    // Promover o secundario e remover o antigo principal funciona.
    await usuario.click(
      within(screen.getByText('Endereco Novo').closest('li')).getByRole('button', {
        name: 'Tornar principal',
      }),
    );

    await waitFor(async () => {
      const { dados } = await chamar('/enderecos', { metodo: 'GET', token: cliente.token });
      expect(dados.find((e) => e.nome_destinatario === 'Endereco Novo').principal).toBe(true);
    });

    const itemAntigo = screen.getByText('Endereco Antigo').closest('li');
    await usuario.click(within(itemAntigo).getByRole('button', { name: 'Remover' }));

    await waitFor(() => {
      expect(screen.queryAllByText('Endereco Antigo')).toHaveLength(0);
    });

    const { dados } = await chamar('/enderecos', { metodo: 'GET', token: cliente.token });
    expect(dados).toHaveLength(1);
    expect(dados[0].nome_destinatario).toBe('Endereco Novo');

    confirmar.mockRestore();
  });

  it('recusa remover o unico endereco do cliente', async () => {
    const usuario = userEvent.setup();

    await chamar('/enderecos', {
      token: cliente.token,
      corpo: {
        nome_destinatario: 'Unico',
        cep: '13010100',
        rua: 'Rua Um',
        numero: '1',
        complemento: null,
        bairro: 'Centro',
        cidade: 'Campinas',
        estado: 'SP',
      },
    });

    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderizar(<MeusEnderecos />);
    await screen.findByText('Unico');

    await usuario.click(screen.getByRole('button', { name: 'Remover' }));

    // A API recusa e a interface mostra o motivo, sem sumir com o endereco.
    expect(
      await screen.findByText('Voce precisa manter ao menos um endereco de entrega para poder comprar.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Unico')).toBeInTheDocument();

    const { dados } = await chamar('/enderecos', { metodo: 'GET', token: cliente.token });
    expect(dados).toHaveLength(1);

    confirmar.mockRestore();
  });
});

describe('Avaliacoes de um pedido entregue', () => {
  it('permite avaliar um item entregue e depois nao oferece avaliar de novo', async () => {
    const produtor = await criarProdutorLogado();
    const produto = await criarProduto(produtor.token, {
      nome: `Alface Teste ${Date.now()}`,
      preco: 8.5,
      estoque: 10,
    });

    const cliente = await criarClienteLogado();
    const pedido = await criarPedidoEntregue({
      produtorToken: produtor.token,
      clienteToken: cliente.token,
      produto,
    });

    // O item esta ENTREGUE e ainda nao avaliado.
    const { dados: pendentes } = await chamar(`/avaliacoes/pendentes/${pedido.id}`, {
      metodo: 'GET',
      token: cliente.token,
    });
    expect(pendentes.total).toBe(1);
    expect(pendentes.itens[0].produto_id).toBe(String(produto.id));

    // Avalia pelo endpoint real.
    await chamar('/avaliacoes', {
      token: cliente.token,
      corpo: { pedido_id: pedido.id, produto_id: produto.id, nota: 5, comentario: 'Otimo.' },
    });

    // A pendencia some.
    const { dados: depois } = await chamar(`/avaliacoes/pendentes/${pedido.id}`, {
      metodo: 'GET',
      token: cliente.token,
    });
    expect(depois.total).toBe(0);

    // E a segunda tentativa e recusada com CONFLITO.
    await expect(
      chamar('/avaliacoes', {
        token: cliente.token,
        corpo: { pedido_id: pedido.id, produto_id: produto.id, nota: 4 },
      }),
    ).rejects.toMatchObject({ status: 409, codigo: 'CONFLITO' });

    // A media do produto passa a refletir a nota.
    const { dados: atualizado } = await chamar(`/produtos/${produto.id}`, { metodo: 'GET' });
    expect(Number(atualizado.media_avaliacoes)).toBe(5);
    expect(Number(atualizado.total_avaliacoes)).toBe(1);
  });

  it('nao deixa um cliente avaliar item de pedido que nao e dele', async () => {
    const produtor = await criarProdutorLogado();
    const produto = await criarProduto(produtor.token, { nome: `Produto Acesso ${Date.now()}` });

    const dono = await criarClienteLogado();
    const pedido = await criarPedidoEntregue({
      produtorToken: produtor.token,
      clienteToken: dono.token,
      produto,
    });

    const intruso = await criarClienteLogado();

    await expect(
      chamar(`/avaliacoes/pendentes/${pedido.id}`, { metodo: 'GET', token: intruso.token }),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      chamar('/avaliacoes', {
        token: intruso.token,
        corpo: { pedido_id: pedido.id, produto_id: produto.id, nota: 1 },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('recusa nota fora de 1 a 5 e permite corrigir depois', async () => {
    const produtor = await criarProdutorLogado();
    const produto = await criarProduto(produtor.token, { nome: `Produto Nota ${Date.now()}` });

    const cliente = await criarClienteLogado();
    const pedido = await criarPedidoEntregue({
      produtorToken: produtor.token,
      clienteToken: cliente.token,
      produto,
    });

    await expect(
      chamar('/avaliacoes', {
        token: cliente.token,
        corpo: { pedido_id: pedido.id, produto_id: produto.id, nota: 9 },
      }),
    ).rejects.toMatchObject({ status: 400 });

    const { dados: criada } = await chamar('/avaliacoes', {
      token: cliente.token,
      corpo: { pedido_id: pedido.id, produto_id: produto.id, nota: 3 },
    });

    await chamar(`/avaliacoes/${criada.id}`, {
      token: cliente.token,
      metodo: 'PUT',
      corpo: { nota: 5, comentario: 'Melhorou.' },
    });

    const { dados: produtoAtualizado } = await chamar(`/produtos/${produto.id}`, { metodo: 'GET' });
    expect(Number(produtoAtualizado.media_avaliacoes)).toBe(5);

    // Remover a avaliacao zera a media.
    await chamar(`/avaliacoes/${criada.id}`, { token: cliente.token, metodo: 'DELETE' });

    const { dados: semAvaliacao } = await chamar(`/produtos/${produto.id}`, { metodo: 'GET' });
    expect(Number(semAvaliacao.total_avaliacoes)).toBe(0);
  });
});