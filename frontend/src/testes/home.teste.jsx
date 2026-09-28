import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../pages/Home.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { CarrinhoProvider } from '../contexts/CarrinhoContext.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';

/*
 * Regressao da lista de categorias da home.
 *
 * Enquanto a API de categorias nao responde, a home mostra tres
 * placeholders (`{ id: null, nome }`). A versao anterior usava
 * `key={categoria.id}`, e como os tres tem `id: null` as chaves saiam
 * iguais - o React avisava "Encountered two children with the same key"
 * e o comportamento dos itens ficava indefinido (podia omitir ou
 * duplicar).
 *
 * O cenario nao depende de mock: os placeholders entram no PRIMEIRO
 * render, antes de qualquer resposta. E por isso que o aviso aparecia
 * mesmo com o banco cheio de categorias.
 *
 * A assercao olha o aviso do React, e nao so a quantidade de links: com
 * chave repetida o React ainda renderiza os itens, entao contar links
 * nao provaria nada.
 */

function renderizar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NotificacaoProvider>
          <CarrinhoProvider>
            <Home />
          </CarrinhoProvider>
        </NotificacaoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const PLACEHOLDERS = ['Verduras & folhas', 'Legumes & raízes', 'Frutas da estação'];

let espiaoConsole;

afterEach(() => {
  espiaoConsole?.mockRestore();
});

describe('Home > categorias', () => {
  it('mostra os placeholders sem repetir chave', async () => {
    const erros = [];
    espiaoConsole = vi.spyOn(console, 'error').mockImplementation((...args) => {
      erros.push(args.map(String).join(' '));
    });

    renderizar();

    /*
     * Assercao SINCRONA de proposito. Os placeholders entram no primeiro
     * render, antes de qualquer resposta da API. Se usarmos `findBy*`,
     * ele espera e - se a API responder rapido - encontra as categorias
     * reais no lugar dos placeholders, falhando por corrida e nao por
     * defeito. `getBy*` le exatamente o que foi renderizado agora.
     */
    for (const nome of PLACEHOLDERS) {
      expect(screen.getByRole('link', { name: nome })).toBeInTheDocument();
    }

    const chavesRepetidas = erros.filter((texto) => texto.includes('same key'));
    expect(chavesRepetidas).toEqual([]);
  });

  /*
   * Os dados de infraestrutura (API, PostgreSQL, ambiente, latencia) sao
   * para o rodape, nao para a front page: ao visitante nao interessam.
   * A home ja os exibiu no bloco "Escolha por categoria", e este teste
   * existe para que nao voltem. O rodape tem o proprio teste.
   */
  it('nao mostra os dados de infraestrutura na front page', async () => {
    renderizar();

    /*
     * Espera a API responder antes de assertar: no primeiro render a home
     * mostra placeholders, e um bloco reintroduzido so apareceria depois
     * da resposta. Esperamos os placeholders serem substituidos pelas
     * categorias reais - e o sinal de que a home terminou de carregar.
     */
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Verduras & folhas' })).not.toBeInTheDocument(),
    );

    expect(screen.queryByText(/^API:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/PostgreSQL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Ambiente:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Latência do banco/)).not.toBeInTheDocument();
  });
});
