import { Router } from 'express';

/*
 * Agregador das rotas de NEGOCIO, montado em /api/v1 pelo app.js.
 *
 * O /health nao fica aqui de proposito: endpoint de infraestrutura deve
 * responder em /health (fora do versionamento), porque e esse o caminho
 * configurado no health check das plataformas de deploy.
 *
 * Nas fases seguintes, cada modulo ganha seu arquivo de rotas e entra aqui:
 *
 *   router.use('/auth', authRoutes);
 *   router.use('/usuarios', usuarioRoutes);
 *   router.use('/agricultores', agricultorRoutes);
 *   ...
 */
const router = Router();

export default router;