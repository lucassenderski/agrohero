import { Router } from 'express';
import authRoutes from './authRoutes.js';
import usuarioRoutes from './usuarioRoutes.js';
import agricultorRoutes from './agricultorRoutes.js';
import categoriaRoutes from './categoriaRoutes.js';
import carrinhoRoutes from './carrinhoRoutes.js';
import checkoutRoutes from './checkoutRoutes.js';
import webhookRoutes from './webhookRoutes.js';
import enderecoRoutes from './enderecoRoutes.js';
import pedidoRoutes from './pedidoRoutes.js';
import produtoRoutes from './produtoRoutes.js';
import adminRoutes from './adminRoutes.js';
import avaliacaoRoutes from './avaliacaoRoutes.js';

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

/* Enderecos de entrega: dado pessoal do consumidor autenticado. */
router.use('/enderecos', enderecoRoutes);

/*
 * Checkout: consome o carrinho do token e cria o pedido numa transacao.
 * Nenhum valor vem do cliente - tudo e recalculado no servidor.
 */
router.use('/checkout', checkoutRoutes);

/* Pedidos: consumidor, agricultor e admin, com visao por tipo. */
router.use('/pedidos', pedidoRoutes);

/*
 * Webhooks de pagamento. Unica rota de negocio SEM checkJwt: quem chama
 * e o gateway, que nao tem usuario aqui. A autenticacao e a assinatura
 * HMAC do corpo, verificada no controller.
 */
router.use('/webhooks', webhookRoutes);

/*
 * Area administrativa. Todas as rotas daqui exigem administrador
 * (checkJwt + requireRole aplicados no proprio arquivo).
 */
router.use('/admin', adminRoutes);

/*
 * Avaliacoes: leitura publica da reputacao (produto e produtor) e
 * escrita pelo consumidor que recebeu o produto. O checkJwt vai rota a
 * rota, porque as leituras sao publicas.
 */
router.use('/avaliacoes', avaliacaoRoutes);

export default router;
