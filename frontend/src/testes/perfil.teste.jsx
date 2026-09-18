import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Perfil from '../pages/Perfil.jsx';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { NotificacaoProvider } from '../contexts/NotificacaoContext.jsx';
import { RotaPrivada } from '../routes/Guards.jsx';
import Notificacoes from '../components/Notificacoes.jsx';
import { criarClienteLogado, chamar, SENHA_PADRAO, removerToken } from './ajudantes.js';

/*
 * Testes da pagina de perfil.
 *
 * O foco aqui e a alteracao de senha, que tem uma armadilha propria:
 * o handler do formulario precisa ter nome diferente do servico
 * importado. Se os dois se chamarem `trocarSenha`, a funcao chama a si
 * mesma e o pedido nunca sai do navegador - sem erro visivel na tela.
 *
 * O teste confere o efeito real: depois de alterar, a senha antiga
 * deixa de funcionar e a nova passa a valer.
 *
 * A rota e montada com o mesmo <RotaPrivada> do App, e nao com o
 * <Perfil> solto: a pagina assume que existe usuario carregado, e o
 * guard e quem garante isso, segurando o render ate o perfil chegar.
 */

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/perfil']}>
      <AuthProvider>
        <NotificacaoProvider>
          <Notificacoes />
          <Routes>
            <Route element={<RotaPrivada />}>
              <Route path="/perfil" element={<Perfil />} />
            </Route>
          </Routes>
        </NotificacaoProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/* Confere se uma credencial e aceita, sem depender do estado da tela. */
async function loginAceito(email, senha) {
  try {
    await chamar('/auth/login', { corpo: { email, senha } });
    return true;
  } catch {
    return false;
  }
}

describe('Perfil', () => {
  let cliente;

  beforeEach(async () => {
    removerToken();
    cliente = await criarClienteLogado();
  });

  it('mostra os dados do usuario logado', async () => {
    renderizar();

    expect(await screen.findByDisplayValue('Cliente Teste')).toBeInTheDocument();
    // O e-mail e somente leitura e aparece como texto, nao como campo.
    expect(screen.getByText(cliente.email)).toBeInTheDocument();
  });

  it('altera a senha e passa a aceitar apenas a nova', async () => {
    const usuario = userEvent.setup();
    renderizar();

    const campoAtual = await screen.findByLabelText('Senha atual');
    const novaSenha = 'NovaSenha456';

    await usuario.type(campoAtual, SENHA_PADRAO);
    await usuario.type(screen.getByLabelText('Nova senha'), novaSenha);
    await usuario.type(screen.getByLabelText('Confirmar nova senha'), novaSenha);
    await usuario.click(screen.getByRole('button', { name: 'Alterar senha' }));

    // A confirmacao na tela prova que a chamada foi feita.
    expect(await screen.findByText('Senha alterada.')).toBeInTheDocument();

    // E a prova no backend: a antiga nao vale mais, a nova vale.
    await waitFor(async () => {
      expect(await loginAceito(cliente.email, novaSenha)).toBe(true);
    });
    expect(await loginAceito(cliente.email, SENHA_PADRAO)).toBe(false);
  });

  it('recusa quando a confirmacao nao confere', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(await screen.findByLabelText('Senha atual'), SENHA_PADRAO);
    await usuario.type(screen.getByLabelText('Nova senha'), 'NovaSenha456');
    await usuario.type(screen.getByLabelText('Confirmar nova senha'), 'Diferente789');
    await usuario.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(
      await screen.findByText('A confirmacao nao confere com a nova senha.'),
    ).toBeInTheDocument();

    // Nada foi enviado: a senha original continua valendo.
    expect(await loginAceito(cliente.email, SENHA_PADRAO)).toBe(true);
  });

  it('recusa senha nova fraca sem chamar a API', async () => {
    const usuario = userEvent.setup();
    renderizar();

    await usuario.type(await screen.findByLabelText('Senha atual'), SENHA_PADRAO);
    await usuario.type(screen.getByLabelText('Nova senha'), 'fraca');
    await usuario.type(screen.getByLabelText('Confirmar nova senha'), 'fraca');
    await usuario.click(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByText(/Minimo de 8 caracteres/i)).toBeInTheDocument();
    expect(await loginAceito(cliente.email, SENHA_PADRAO)).toBe(true);
  });
});