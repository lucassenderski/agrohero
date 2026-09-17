import { Router } from 'express';
import adminCategoriaRoutes from './adminCategoriaRoutes.js';
import adminPedidoRoutes from './adminPedidoRoutes.js';

/*
 * Agregador da area administrativa, montado em /api/v1/admin.
 *
 * Cada modulo administrativo tem seu proprio arquivo e e montado por
 * assunto. Isso evita que adminRoutes.js vire um arquivo gigante com as
 * rotas de categorias, usuarios, produtos e pedidos misturadas.
 *
 * A autenticacao NAO fica aqui, e sim no arquivo de cada modulo. Motivo:
 * `router.use(checkJwt)` neste agregador protegeria tudo que for montado
 * depois dele, mas o arquivo de modulo continua sendo a unidade que
 * alguem vai ler quando abrir "como funciona a autorizacao das rotas de
 * categoria". Manter o checkJwt junto das rotas evita que a protecao
 * pareca implicita e seja removida sem querer numa refatoracao.
 */

const router = Router();

router.use('/categorias', adminCategoriaRoutes);
router.use('/pedidos', adminPedidoRoutes);

export default router;
