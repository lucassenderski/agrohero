import { Router } from 'express';
import authRoutes from './authRoutes.js';
import usuarioRoutes from './usuarioRoutes.js';
import agricultorRoutes from './agricultorRoutes.js';
import categoriaRoutes from './categoriaRoutes.js';
import carrinhoRoutes from './carrinhoRoutes.js';
import produtoRoutes from './produtoRoutes.js';
import adminRoutes from './adminRoutes.js';

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
 * Rotas publicas de autenticacao: cadastro e login.
 */
router.use('/auth', authRoutes);

/*
 * Rotas do usuario autenticado (perfil e senha). O checkJwt e aplicado
 * dentro do proprio arquivo de rotas, sobre o router inteiro.
 */
router.use('/usuarios', usuarioRoutes);

/*
 * Rotas publicas do marketplace: vitrine do produtor e catalogo.
 */
router.use('/agricultores', agricultorRoutes);
router.use('/categorias', categoriaRoutes);

/*
 * Produtos: leitura publica e gestao pelo agricultor no mesmo modulo.
 * A ordem de middleware de cada rota fica no proprio arquivo.
 */
router.use('/produtos', produtoRoutes);

/*
 * Carrinho: recurso privado do consumidor autenticado. Nao ha
 * `carrinho_id` em rota nenhuma - o carrinho e sempre o do token.
 */
router.use('/carrinho', carrinhoRoutes);

/*
 * Area administrativa. Todas as rotas daqui exigem administrador
 * (checkJwt + requireRole aplicados no proprio arquivo).
 */
router.use('/admin', adminRoutes);

/*
 * Nas fases seguintes, cada modulo ganha seu arquivo de rotas e entra
 * aqui, sempre nesta ordem de middleware:
 *   autenticacao -> autorizacao -> validacao -> controller
 *
 *   router.use('/checkout', checkoutRoutes);
 *   router.use('/pedidos', pedidoRoutes);
 *   router.use('/avaliacoes', avaliacaoRoutes);
 */

export default router;