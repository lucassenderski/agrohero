import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/*
 * Configuracao comum dos testes de componente.
 *
 * `cleanup` desmonta a arvore React depois de cada teste: sem isso o
 * DOM acumula componentes entre testes e uma consulta por texto passa
 * a encontrar elementos da execucao anterior.
 */
afterEach(() => {
  cleanup();
});