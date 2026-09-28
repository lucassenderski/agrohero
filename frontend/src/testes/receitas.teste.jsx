import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Receitas from '../pages/Receitas.jsx';
import Notificacoes from '../components/Notificacoes.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { CarrinhoProvider } from '../contexts/CarrinhoContext.jsx';
import { criarClienteLogado, criarProdutorLogado, criarProduto, removerToken } from './ajudantes.js';
import { casarIngredientes } from '../dados/receitas.js';

/*
 * Testes de integracao da pagina de receitas.
 *
 * Sem mocks, como o resto da suite: a pagina fala com a API de verdade.
 * O que isso cobre e o que um mock esconderia - o casamento entre o
 * nome do ingrediente da receita e o produto real da vitrine, o formato
 * do envelope de produtos e a regra de que visitante nao compra.
 *
 * Um produto e criado com nome que casa com um termo da receita
 * ("Abóbora"), porque o banco de teste comeca sem produtos e sem eles a
 * pagina nao teria o que casar.
 */

function renderizar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NotificacaoProvider>
          <CarrinhoProvider>
            <Notificacoes />
            <Receitas />
          </CarrinhoProvider>
        </NotificacaoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/*
 * Publica um produto cujo nome casa com o termo "abobora" da receita
 * de sopa. A criacao exige produtor logado.
 */
async function publicarProdutoCompravel() {
  const produtor = await criarProdutorLogado();
  return criarProduto(produtor.token, {
    nome: 'Abóbora Cabotiá Orgânica',
    preco: 12.5,
    estoque: 20,
  });
}

describe('Pagina de receitas', () => {
  beforeEach(() => {
    removerToken();
  });

  it('mostra o banner e a lista de receitas para um visitante', async () => {
    renderizar();

    expect(
      screen.getByRole('heading', { name: /Receitas da Terra/i }),
    ).toBeInTheDocument();

    /* A primeira receita vem selecionada, entao o detalhe ja aparece. */
    await waitFor(() => {
      expect(screen.getAllByText(/Cardápio de receitas/i).length).toBeGreaterThan(0);
    });

    expect(
      screen.getByRole('button', { name: /Sopa Creme Rústica/i }),
    ).toBeInTheDocument();
  });

  it('filtra a lista pela busca por ingrediente', async () => {
    const usuario = userEvent.setup();
    renderizar();

    const campo = screen.getByLabelText(/Buscar receita ou ingrediente/i);
    await usuario.type(campo, 'mandioca');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Escondidinho Caipira/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Suco Vitalidade Verde/i })).not.toBeInTheDocument();
  });

  it('filtra a lista por categoria', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole('button', { name: 'Sobremesas' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Bolo Integral Fofinho/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Salada Crocante/i })).not.toBeInTheDocument();
  });

  it('mostra o modo de preparo e a dica do chef da receita ativa', async () => {
    renderizar();

    /*
     * Escopar pelo papel de titulo: o texto "Ver modo de preparo" tambem
     * aparece nos itens da lista, e um getByText solto encontraria varios
     * elementos (foi o que a primeira versao deste teste fez).
     */
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Modo de preparo/i }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('heading', { name: /Ingredientes da receita/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Dica do chef e produtor/i)).toBeInTheDocument();
  });

  it('convida o visitante a entrar em vez de oferecer compra', async () => {
    await publicarProdutoCompravel();
    renderizar();

    await waitFor(() => {
      expect(screen.getByText(/Entre como consumidor/i)).toBeInTheDocument();
    });
  });

  it('casa o ingrediente da receita com o produto real da vitrine', async () => {
    await publicarProdutoCompravel();
    await criarClienteLogado();

    renderizar();

    /*
     * O produto publicado casa com o ingrediente "Abóbora Cabotiá
     * Orgânica" da primeira receita. Com o cliente logado, o botao de
     * compra do ingrediente precisa aparecer com o preco do produto.
     */
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Adicionar · R\$\s*12,50/i }),
      ).toBeInTheDocument();
    });
  });

  it('adiciona ao carrinho todos os ingredientes disponiveis de uma vez', async () => {
    const produto = await publicarProdutoCompravel();
    await criarClienteLogado();

    const usuario = userEvent.setup();
    renderizar();

    const botaoComprar = await screen.findByRole('button', { name: /Comprar os \d+ orgânicos/i });
    await usuario.click(botaoComprar);

    await waitFor(() => {
      expect(screen.getByText(/ingredientes foram adicionados ao carrinho/i)).toBeInTheDocument();
    });

    /* Confere no servidor, nao na tela: a API e a fonte da verdade. */
    const resposta = await fetch(`${import.meta.env.VITE_API_URL}/carrinho`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('agrohero:token')}`,
      },
    });
    const carrinho = await resposta.json();

    const idsNoCarrinho = carrinho.dados.itens.map((item) => item.produto.id);
    expect(idsNoCarrinho).toContain(produto.id);
  });

  it('avisa quando a busca nao encontra nenhuma receita', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(
      screen.getByLabelText(/Buscar receita ou ingrediente/i),
      'jabuticaba marciana',
    );

    await waitFor(() => {
      expect(screen.getByText(/Nenhuma receita encontrada/i)).toBeInTheDocument();
    });
  });

  it('troca a receita ativa ao clicar em outro item da lista', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.click(screen.getByRole('button', { name: /Suco Vitalidade Verde/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Suco Vitalidade Verde/i }),
      ).toBeInTheDocument();
    });
  });
});

/*
 * Testes de regressao do casamento ingrediente x produto.
 *
 * O defeito que originou o primeiro teste esta na comparacao de strings,
 * nao no banco, entao este bloco nao precisa da API. O termo "mel" era
 * comparado com `includes` e casava dentro de "Frutas VerMELhas" - a
 * receita de sopa oferecia uma geleia no lugar do mel.
 */
describe('Casamento ingrediente x produto', () => {
  it('nao casa o termo dentro de outra palavra', () => {
    const produtos = [
      { id: 1, nome: 'Geleia Artesanal de Frutas Vermelhas', preco: 24 },
      { id: 2, nome: 'Mel Silvestre de Florada Nativa', preco: 38 },
    ];

    const [ingrediente] = casarIngredientes(
      { ingredientes: [{ nome: 'Mel', termos: ['mel'] }] },
      produtos,
    );

    expect(ingrediente.produto.nome).toBe('Mel Silvestre de Florada Nativa');
  });

  it('casa ignorando acento e caixa', () => {
    const produtos = [{ id: 1, nome: 'Abóbora Cabotiá Orgânica', preco: 7.5 }];

    const [ingrediente] = casarIngredientes(
      { ingredientes: [{ nome: 'Abóbora', termos: ['abobora'] }] },
      produtos,
    );

    expect(ingrediente.produto).not.toBeNull();
  });

  it('trata termo com hifen como texto, nao como padrao', () => {
    const produtos = [{ id: 1, nome: 'Batata-Doce Roxa', preco: 8.5 }];

    const [ingrediente] = casarIngredientes(
      { ingredientes: [{ nome: 'Batata-Doce', termos: ['batata-doce'] }] },
      produtos,
    );

    expect(ingrediente.produto).not.toBeNull();
  });

  it('devolve produto nulo quando nao ha correspondencia', () => {
    const [ingrediente] = casarIngredientes(
      { ingredientes: [{ nome: 'Jabuticaba', termos: ['jabuticaba'] }] },
      [{ id: 1, nome: 'Alface Crespa', preco: 5 }],
    );

    expect(ingrediente.produto).toBeNull();
  });
});
