import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sobre from '../pages/Sobre.jsx';

/*
 * Pagina "Sobre a iniciativa".
 *
 * Conteudo editorial: nao bate na API, entao o teste e puro render e
 * dispensa o backend no ar. As assercoes olham o texto que o visitante
 * le - titulo, missao e os distritos - e os dois caminhos de saida para
 * o marketplace, que sao o proposito da pagina.
 */

function renderizar() {
  return render(
    <MemoryRouter>
      <Sobre />
    </MemoryRouter>,
  );
}

describe('Sobre > apresentacao da iniciativa', () => {
  it('mostra o titulo e a localizacao', () => {
    renderizar();

    expect(
      screen.getByRole('heading', { level: 1, name: /Agro Hero Toledo/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Toledo, Paraná • Oeste Paranaense')).toBeInTheDocument();
  });

  it('mostra a missao e o compromisso de 100% do valor ao produtor', () => {
    renderizar();

    expect(
      screen.getByRole('heading', { level: 2, name: /Nossa Missão em Toledo/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/100% do valor/)).toBeInTheDocument();
  });

  it('lista os quatro distritos atendidos', () => {
    renderizar();

    for (const distrito of ['Novo Sarandi', 'Concórdia do Oeste', 'Dez de Maio', 'Vila Nova']) {
      expect(screen.getByText(distrito)).toBeInTheDocument();
    }
  });

  it('leva ao marketplace e aos produtores', () => {
    renderizar();

    expect(screen.getByRole('link', { name: /Ver produtos locais/ })).toHaveAttribute(
      'href',
      '/produtos',
    );
    expect(screen.getByRole('link', { name: /Conheça os produtores/ })).toHaveAttribute(
      'href',
      '/agricultores',
    );
  });
});
