import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { CarrinhoProvider } from './contexts/CarrinhoContext.jsx';
import { NotificacaoProvider } from './contexts/NotificacaoContext.jsx';
import { PedidosNovosProvider } from './contexts/PedidosNovosContext.jsx';
import './styles/global.css';

/*
 * Ponto de entrada do frontend.
 *
 * O BrowserRouter fica aqui (e nao dentro do App) para que os testes
 * possam montar o App com um MemoryRouter proprio, sem depender do
 * historico do navegador.
 *
 * A ordem dos provedores importa: o CarrinhoProvider usa o useAuth
 * (para saber se ha consumidor logado), entao precisa estar DENTRO do
 * AuthProvider. Inverter a ordem quebra a aplicacao inteira com um
 * erro de contexto ausente. O PedidosNovosProvider tambem depende do
 * useAuth, e pelo mesmo motivo fica dentro dele.
 */
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <NotificacaoProvider>
        <AuthProvider>
          <CarrinhoProvider>
            <PedidosNovosProvider>
              <App />
            </PedidosNovosProvider>
          </CarrinhoProvider>
        </AuthProvider>
      </NotificacaoProvider>
    </BrowserRouter>
  </React.StrictMode>,
);