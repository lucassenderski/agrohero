import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AgricultorProdutos from '../pages/AgricultorProdutos.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import { RotaPorTipo } from '../routes/Guards.jsx';
import Notificacoes from '../components/Notificacoes.jsx';
import { removerToken, salvarToken } from '../services/api.js';
import { UNIDADES_PRODUTO } from '../utils/estados.js';
import { criarProdutorLogado, chamar } from './ajudantes.js';

/*
 * Testes de integracao do cadastro de produto pelo produtor.
 *
 * O defeito que originou esta suite: o select de unidade declarava as
 * opcoes a mao e trazia `<option value="maco">` SEM cedilha, enquanto o
 * enum do backend exige "maço". Enviar "maco" devolve 400
 * DADOS_INVALIDOS, e como a validacao do cliente nao olha a unidade, o
 * erro so aparecia no servidor - o produtor via apenas "nao consigo
 * cadastrar produto".
 *
 * Por isso o teste NAO mocka o fetch: um mock aceitaria qualquer valor
 * e esconderia exatamente o que interessa. Aqui a submissao sai para o
 * backend de verdade, que e quem rejeita a grafia errada.
 */

function renderizarComoProdutor(token) {
  removerToken();
  salvarToken(token);

  return render(
    <MemoryRouter initialEntries={['/agricultor/produtos']}>
      <AuthProvider>
        <NotificacaoProvider>
          <Notificacoes />
          <Routes>
            {/*
             * A rota usa o MESMO <RotaPorTipo> do App, e nao a pagina
             * solta: a tela assume que existe usuario carregado, e e o
             * guard que segura o render ate o perfil chegar.
             */}
            <Route element={<RotaPorTipo tipos={['agricultor']} />}>
              <Route path="/agricultor/produtos" element={<AgricultorProdutos />} />
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

/* Abre o modal de novo produto e espera os campos aparecerem. */
async function abrirFormulario(usuario) {
  await screen.findByRole('heading', { name: 'Meus produtos' });
  await usuario.click(screen.getByRole('button', { name: 'Novo produto' }));
  return screen.getByLabelText(/^Nome/);
}

/* Preenche o formulario; `unidade` e escolhida no select. */
async function preencher(usuario, { nome, preco, estoque, unidade }) {
  await usuario.type(screen.getByLabelText(/^Nome/), nome);
  await usuario.type(screen.getByLabelText(/Preco/), String(preco));
  await usuario.type(screen.getByLabelText(/^Estoque/), String(estoque));
  await usuario.selectOptions(screen.getByLabelText(/^Unidade/), unidade);

  // A categoria e obrigatoria; qualquer uma serve para o cadastro.
  const categoria = screen.getByLabelText(/Categoria/);
  await usuario.selectOptions(categoria, categoria.options[1].value);
}

describe('Cadastro de produto', () => {
  let produtor;

  beforeEach(async () => {
    produtor = await criarProdutorLogado();
  });

  it('cadastra um produto com unidade "maço"', async () => {
    const usuario = userEvent.setup();
    renderizarComoProdutor(produtor.token);

    await abrirFormulario(usuario);

    const nome = nomeUnico('Couve Manteiga');
    await preencher(usuario, { nome, preco: 4.5, estoque: 30, unidade: 'maço' });

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    // O produtor recebe confirmacao em vez do silencio que ele via antes.
    expect(await screen.findByText('Produto cadastrado.')).toBeInTheDocument();

    // O produto aparece na lista da tela.
    expect(await screen.findByText(nome)).toBeInTheDocument();

    /*
     * E, o que de fato importa, o servidor gravou a grafia com cedilha.
     * Se o formulario voltar a enviar "maco", a gravacao nem acontece:
     * o POST responde 400 e este teste falha antes daqui.
     */
    const { dados } = await chamar('/produtos/meus', { metodo: 'GET', token: produtor.token });
    const salvo = dados.find((produto) => produto.nome === nome);
    expect(salvo).toBeDefined();
    expect(salvo.unidade).toBe('maço');
  });

  it('oferece exatamente as unidades que o backend aceita', async () => {
    const usuario = userEvent.setup();
    renderizarComoProdutor(produtor.token);

    await abrirFormulario(usuario);

    /*
     * Guarda contra a regressao original: a lista de opcoes tem que ser
     * a mesma constante que espelha o enum do servidor. Uma opcao
     * escrita a mao ("maco") reprova aqui, mesmo que ninguem submeta o
     * formulario.
     */
    const valores = Array.from(screen.getByLabelText(/^Unidade/).options).map(
      (opcao) => opcao.value,
    );
    expect(valores).toEqual(UNIDADES_PRODUTO);
    expect(valores).toContain('maço');
    expect(valores).not.toContain('maco');
  });

  it('recusa "maco" sem cedilha no servidor', async () => {
    /*
     * Prova que a diferenca de grafia nao e cosmetica: e o backend que
     * rejeita, com 400 DADOS_INVALIDOS. E a razao de o select ter que
     * mandar "maço" e nao "maco".
     */
    const { dados: categorias } = await chamar('/categorias', { metodo: 'GET' });

    await expect(
      chamar('/produtos', {
        token: produtor.token,
        corpo: {
          nome: nomeUnico('Produto grafia errada'),
          preco: 5,
          estoque: 10,
          unidade: 'maco',
          categoria_id: categorias[0].id,
        },
      }),
    ).rejects.toMatchObject({ status: 400, codigo: 'DADOS_INVALIDOS' });
  });

  it('mantem o produto fora da lista quando a unidade e invalida', async () => {
    /*
     * O caminho negativo pelo formulario: se a unidade enviada nao
     * bater com o enum, nada e gravado e o produtor e avisado. Aqui
     * forcamos o valor invalido direto no estado do select, que e o
     * cenario de uma opcao errada declarada a mao.
     */
    const usuario = userEvent.setup();
    renderizarComoProdutor(produtor.token);

    await abrirFormulario(usuario);

    const nome = nomeUnico('Produto invalido');
    await preencher(usuario, { nome, preco: 7, estoque: 3, unidade: 'maço' });

    /*
     * Injeta uma opcao "maco" no DOM para simular a regressao sem
     * depender do codigo-fonte: e o que o navegador faria se a opcao
     * errada existisse.
     */
    const select = screen.getByLabelText(/^Unidade/);
    const opcaoErrada = document.createElement('option');
    opcaoErrada.value = 'maco';
    opcaoErrada.text = 'maco';
    select.appendChild(opcaoErrada);
    await usuario.selectOptions(select, 'maco');

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    /*
     * A API recusa e a tela mostra o erro, em vez de fingir sucesso. A
     * mensagem exibida e a do envelope (`erro.mensagem`), nao o detalhe
     * por campo: e o que o produtor realmente ve.
     */
    expect(await screen.findByText('Dados invalidos.')).toBeInTheDocument();

    /*
     * E nada foi gravado. A espera acima so termina quando o POST
     * responde, entao a consulta aqui ja enxerga o estado final.
     */
    const { dados } = await chamar('/produtos/meus', { metodo: 'GET', token: produtor.token });
    expect(dados.some((produto) => produto.nome === nome)).toBe(false);
  });
});
