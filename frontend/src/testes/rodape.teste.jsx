import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from '../components/Footer.jsx';

/*
 * Rodape: status da API e credito do autor.
 *
 * Sem mock, como o resto da suite - o `SaudeRodape` chama o /health de
 * verdade. O cenario exige o backend no ar; e o mesmo contrato das
 * outras suites de integracao.
 */

function renderizar() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

describe('Rodape > status da API e credito', () => {
  it('mostra o credito do autor com o RU', () => {
    renderizar();
    expect(screen.getByText('Criado por Lucas Senderski · RU: 4758862')).toBeInTheDocument();
  });

  it('mostra o status real da API depois da consulta ao /health', async () => {
    renderizar();

    /*
     * O status entra depois da resposta do /health, entao a assercao e
     * assincrona. O valor vem do backend real - o que se prova aqui e
     * que a linha e montada a partir do envelope do /health, nao um
     * texto fixo.
     */
    expect(await screen.findByText(/^API: ok$/)).toBeInTheDocument();
    expect(screen.getByText(/^PostgreSQL: ok$/)).toBeInTheDocument();
    expect(screen.getByText(/^Ambiente: /)).toBeInTheDocument();
    expect(screen.getByText(/^Latência do banco: \d+ ms$/)).toBeInTheDocument();
  });
});
