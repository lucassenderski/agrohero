import { Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout.jsx';
import Home from './pages/Home.jsx';
import NaoEncontrada from './pages/NaoEncontrada.jsx';

/*
 * Definicao das rotas.
 *
 * Na FASE 1 so existem a Home e a pagina 404. As demais rotas (produtos,
 * carrinho, checkout, paineis) entram nas fases do frontend.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}