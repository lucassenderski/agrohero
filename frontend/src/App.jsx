import { Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout.jsx';
import { RotaPrivada, RotaPorTipo } from './routes/Guards.jsx';

import Home from './pages/Home.jsx';
import Produtos from './pages/Produtos.jsx';
import ProdutoDetalhe from './pages/ProdutoDetalhe.jsx';
import Categorias from './pages/Categorias.jsx';
import Agricultores from './pages/Agricultores.jsx';
import AgricultorDetalhe from './pages/AgricultorDetalhe.jsx';
import Login from './pages/Login.jsx';
import Cadastro from './pages/Cadastro.jsx';
import Carrinho from './pages/Carrinho.jsx';
import Checkout from './pages/Checkout.jsx';
import Pedidos from './pages/Pedidos.jsx';
import PedidoDetalhe from './pages/PedidoDetalhe.jsx';
import Perfil from './pages/Perfil.jsx';
import PainelAgricultor from './pages/PainelAgricultor.jsx';
import AgricultorProdutos from './pages/AgricultorProdutos.jsx';
import AgricultorPedidos from './pages/AgricultorPedidos.jsx';
import Admin from './pages/Admin.jsx';
import NaoEncontrada from './pages/NaoEncontrada.jsx';

/*
 * Mapa de rotas.
 *
 * As rotas publicas (vitrine, produtores, login) ficam soltas. As
 * privadas entram sob <RotaPrivada>, e as de papel especifico sob
 * <RotaPorTipo>. Repetir a verificacao em cada pagina seria a receita
 * para esquecer uma.
 *
 * Lembrando: isto e navegacao, nao seguranca. Quem barra de verdade e
 * o backend - cada endpoint protegido valida o token e o papel de novo.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/produtos/:id" element={<ProdutoDetalhe />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/agricultores" element={<Agricultores />} />
        <Route path="/agricultores/:id" element={<AgricultorDetalhe />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />

        {/* Qualquer usuario autenticado. */}
        <Route element={<RotaPrivada />}>
          <Route path="/perfil" element={<Perfil />} />

          {/* Consumidor: carrinho, checkout e pedidos. */}
          <Route element={<RotaPorTipo tipos={['cliente']} />}>
            <Route path="/carrinho" element={<Carrinho />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
          </Route>

          {/* Produtor: painel e gestao. */}
          <Route element={<RotaPorTipo tipos={['agricultor']} />}>
            <Route path="/agricultor" element={<PainelAgricultor />} />
            <Route path="/agricultor/produtos" element={<AgricultorProdutos />} />
            <Route path="/agricultor/pedidos" element={<AgricultorPedidos />} />
          </Route>

          {/* Administrador. */}
          <Route element={<RotaPorTipo tipos={['administrador']} />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>

        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}