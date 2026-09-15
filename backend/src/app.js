import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import env from './config/env.js';
import logger from './config/logger.js';
import rotas from './routes/index.js';
import healthRoutes from './routes/healthRoutes.js';
import { AppError } from './utils/AppError.js';
import { limiteGeral } from './middlewares/rateLimit.js';
import { notFound } from './middlewares/notFound.js';
import { errorHandler } from './middlewares/errorHandler.js';

/*
 * Monta a aplicacao Express.
 *
 * Separar app.js de server.js tem uma razao pratica: os testes importam
 * `app` e passam o supertest direto, sem abrir uma porta de rede. Se
 * `listen()` estivesse aqui, cada teste abriria uma porta e a suite
 * ficaria lenta e instavel.
 */

const app = express();

// Necessario para o express-rate-limit identificar o IP real do cliente
// quando a aplicacao roda atras de um proxy (Render, Vercel, Nginx).
app.set('trust proxy', 1);
app.disable('x-powered-by');

/*
 * Helmet: adiciona cabecalhos de seguranca (X-Content-Type-Options,
 * X-Frame-Options, HSTS, etc.) que bloqueiam classes inteiras de ataque.
 * O CSP fica desligado porque a API so devolve JSON; nao servimos HTML.
 */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

/*
 * CORS com lista branca explicita.
 *
 * Nunca usamos "*" aqui: a origem e validada contra CORS_ORIGINS. Uma
 * origem desconhecida e rejeitada com 403 (erro de permissao), nao com
 * 500: recusar uma origem nao e uma falha do servidor, e uma decisao
 * consciente de autorizacao.
 */
app.use(
  cors({
    origin(origem, callback) {
      // Requisicoes sem Origin (curl, Postman, apps nativos) sao permitidas.
      if (!origem) return callback(null, true);

      if (env.corsOrigens.includes(origem)) {
        return callback(null, true);
      }

      logger.warn({ origem }, 'Origem bloqueada pelo CORS');
      return callback(
        new AppError('Origem nao permitida pelo CORS.', 403, 'CORS_BLOQUEADO', { origem }),
      );
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

/*
 * Limite de tamanho do corpo: 1mb e suficiente para JSON de negocio.
 * Um limite generoso vira vetor de negacao de servico (envio de um
 * payload gigante consome memoria do processo).
 */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/* Log de requisicoes, com senha e token censurados (ver config/logger.js). */
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      // Em testes o log de cada requisicao so polui a saida.
      ignore: (req) => env.ehTeste || req.url === '/health',
    },
    customLogLevel: (req, res, erro) => {
      if (erro || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }),
);

/* Limite geral de requisicoes em toda a API. */
app.use('/api', limiteGeral);

/* Raiz, util para conferir no navegador que a API esta no ar. */
app.get('/', (req, res) => {
  res.json({
    sucesso: true,
    dados: {
      aplicacao: 'AgroHero API',
      versao: '1.0.0',
      documentacao: '/api/v1/docs',
      saude: '/health',
    },
  });
});

/* Rotas de infraestrutura: fora do /api/v1 de proposito. */
app.use(healthRoutes);

/*
 * Rotas de negocio. As de cada modulo entram em src/routes/index.js,
 * que e montado sob /api/v1.
 */
app.use('/api/v1', rotas);

/* 404 e tratamento de erro por ultimo, sempre nessa ordem. */
app.use(notFound);
app.use(errorHandler);

export default app;