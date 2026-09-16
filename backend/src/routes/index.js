import { Router } from 'express';

/*
 * Agregador das rotas de NEGOCIO, montado em /api/v1 pelo app.js.
 *
 * O /health nao fica aqui de proposito: endpoint de infraestrutura deve
 * responder em /health (fora do versionamento), porque e esse o caminho
 * configurado no health check das plataformas de deploy.
 *
 * A documentacao tambem nao fica aqui: ela e montada direto no app.js,
 * ANTES do rate limit geral, porque o Swagger UI carrega dezenas de
 * assets estaticos e consumiria a cota do limitador.
 */
const router = Router();

/*
 * Nas fases seguintes, cada modulo ganha seu arquivo de rotas e entra
 * aqui, sempre nesta ordem de middleware:
 *   autenticacao -> autorizacao -> validacao -> controller
 *
 *   router.use('/auth', authRoutes);
 *   router.use('/usuarios', usuarioRoutes);
 *   router.use('/agricultores', agricultorRoutes);
 *   router.use('/categorias', categoriaRoutes);
 *   router.use('/produtos', produtoRoutes);
 *   router.use('/carrinho', carrinhoRoutes);
 *   router.use('/checkout', checkoutRoutes);
 *   router.use('/pedidos', pedidoRoutes);
 *   router.use('/avaliacoes', avaliacaoRoutes);
 *   router.use('/admin', adminRoutes);
 */

export default router;