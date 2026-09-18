import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Login from '../pages/Login.jsx';
import Cadastro from '../pages/Cadastro.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import Notificacoes from '../components/Notificacoes.jsx';
import { removerToken, obterToken } from '../services/api.js';
import { SENHA_PADRAO } from './ajudantes.js';

/*
 * Testes de integracao de autenticacao pela interface.
 *
 * O cadastro e o login passam pela API de verdade. Isso cobre o que um
 * mock de `fetch` esconderia: o formato do corpo aceito pelo backend
 * (ex.: campos do perfil do produtor), o envelope da resposta e o
 * tratamento do erro de credenciais.
 */

function renderizar(ui, rotaInicial = '/login') {
  return render(
    <MemoryRouter initialEntries={[rotaInicial]}>
      <AuthProvider>
        <NotificacaoProvider>
          <Notificacoes />
          {ui}
        </NotificacaoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function emailUnico() {
  return `ui.teste.${Date.now()}${Math.floor(Math.random() * 1000)}@agrohero.test`;
}

describe('Cadastro pela interface', () => {
  beforeEach(() => {
    removerToken();
  });

  it('cria uma conta de consumidor e guarda o token', async () => {
    const usuario = userEvent.setup();
    const email = emailUnico();

    renderizar(
      <Routes>
        <Route path="/cadastro" element={<Cadastro />} />
      </Routes>,
      '/cadastro',
    );

    await usuario.type(screen.getByLabelText(/Nome completo/), 'Ana Consumidora');
    await usuario.type(screen.getByLabelText(/^E-mail/), email);
    await usuario.type(screen.getByLabelText(/^Senha/), SENHA_PADRAO);
    await usuario.type(screen.getByLabelText(/Cidade/), 'Campinas');
    await usuario.selectOptions(screen.getByLabelText(/Estado/), 'SP');

    await usuario.click(screen.getByRole('button', { name: /criar conta/i }));

    // O cadastro autentica: o token fica salvo sem passar pelo login.
    await waitFor(() => expect(obterToken()).toBeTruthy(), { timeout: 6000 });
  });

  it('nao envia o formulario com campos obrigatorios vazios', async () => {
    const usuario = userEvent.setup();

    renderizar(
      <Routes>
        <Route path="/cadastro" element={<Cadastro />} />
      </Routes>,
      '/cadastro',
    );

    await usuario.click(screen.getByRole('button', { name: /criar conta/i }));

    // A validacao e local: nada de token e o usuario continua na tela.
    // A tela mostra uma mensagem POR campo (nome, e-mail, senha), entao
    // procuramos uma delas em vez de um texto generico.
    expect(obterToken()).toBeFalsy();
    expect(await screen.findByText('Informe o nome.')).toBeInTheDocument();
    expect(screen.getByText('Informe o e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
  });

  it('exige o nome da propriedade quando o tipo e produtor', async () => {
    /*
     * O campo nasce escondido e aparece ao escolher "Vender". Sem esse
     * campo o backend recusa o cadastro de agricultor (a propriedade e
     * obrigatoria para esse tipo), entao a tela precisa pedi-lo.
     */
    const usuario = userEvent.setup();

    renderizar(
      <Routes>
        <Route path="/cadastro" element={<Cadastro />} />
      </Routes>,
      '/cadastro',
    );

    expect(screen.queryByLabelText(/Nome da propriedade/)).not.toBeInTheDocument();

    await usuario.click(screen.getByLabelText(/Sou produtor rural/));

    expect(await screen.findByLabelText(/Nome da propriedade/)).toBeInTheDocument();
  });

  it('recusa um e-mail ja cadastrado', async () => {
    const usuario = userEvent.setup();
    const email = emailUnico();

    // Primeiro cadastro direto na API, para reservar o e-mail.
    await fetch(`${import.meta.env.VITE_API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Primeira Conta',
        email,
        senha: SENHA_PADRAO,
        tipo: 'cliente',
        cidade: 'Campinas',
        estado: 'SP',
      }),
    });

    removerToken();

    renderizar(
      <Routes>
        <Route path="/cadastro" element={<Cadastro />} />
      </Routes>,
      '/cadastro',
    );

    await usuario.type(screen.getByLabelText(/Nome completo/), 'Segunda Conta');
    await usuario.type(screen.getByLabelText(/^E-mail/), email);
    await usuario.type(screen.getByLabelText(/^Senha/), SENHA_PADRAO);
    await usuario.type(screen.getByLabelText(/Cidade/), 'Campinas');
    await usuario.selectOptions(screen.getByLabelText(/Estado/), 'SP');

    await usuario.click(screen.getByRole('button', { name: /criar conta/i }));

    // 409 do backend vira mensagem na tela, sem derrubar o formulario.
    expect(await screen.findByText(/Este e-mail ja esta cadastrado/i)).toBeInTheDocument();
    expect(obterToken()).toBeFalsy();
  });
});

describe('Login pela interface', () => {
  beforeEach(() => {
    removerToken();
  });

  it('autentica com credenciais validas', async () => {
    const usuario = userEvent.setup();
    const email = emailUnico();

    await fetch(`${import.meta.env.VITE_API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Cliente Login',
        email,
        senha: SENHA_PADRAO,
        tipo: 'cliente',
        cidade: 'Campinas',
        estado: 'SP',
      }),
    });

    removerToken();

    renderizar(
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>,
      '/login',
    );

    await usuario.type(screen.getByLabelText(/E-mail/), email);
    await usuario.type(screen.getByLabelText(/Senha/), SENHA_PADRAO);
    await usuario.click(screen.getByRole('button', { name: /^entrar$/i }));

    await waitFor(() => expect(obterToken()).toBeTruthy(), { timeout: 6000 });
  });

  it('mostra a mensagem do backend na senha incorreta', async () => {
    const usuario = userEvent.setup();
    const email = emailUnico();

    await fetch(`${import.meta.env.VITE_API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Cliente Erro',
        email,
        senha: SENHA_PADRAO,
        tipo: 'cliente',
        cidade: 'Campinas',
        estado: 'SP',
      }),
    });

    removerToken();

    renderizar(
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>,
      '/login',
    );

    await usuario.type(screen.getByLabelText(/E-mail/), email);
    await usuario.type(screen.getByLabelText(/Senha/), 'SenhaErrada999');
    await usuario.click(screen.getByRole('button', { name: /^entrar$/i }));

    /*
     * A mensagem e a do backend, e nao uma inventada na tela: a API
     * responde a mesma coisa para e-mail inexistente e senha errada,
     * para nao revelar quais e-mails existem.
     */
    expect(await screen.findByText(/E-mail ou senha incorretos/i)).toBeInTheDocument();
    expect(obterToken()).toBeFalsy();
  });
});