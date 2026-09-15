import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/global.css';

/*
 * Ponto de entrada do frontend.
 *
 * O BrowserRouter fica aqui (e nao dentro do App) para que os testes
 * possam montar o App com um MemoryRouter proprio, sem depender do
 * historico do navegador.
 */
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);