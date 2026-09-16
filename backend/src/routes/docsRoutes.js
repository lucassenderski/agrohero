import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapi } from '../docs/openapi.js';
import env from '../config/env.js';

const router = Router();

/*
 * Documentacao interativa da API.
 *
 * Montada em /api/v1/docs (ver app.js).
 *
 * Por que desligar em producao por padrao: a documentacao expoe a
 * superficie inteira da API (todas as rotas, parametros e formatos), o
 * que facilita o trabalho de quem procura endpoint esquecido ou sem
 * protecao. Em desenvolvimento ela e essencial; em producao e uma
 * escolha consciente, liberada por ENABLE_API_DOCS=true.
 */
const documentacaoLiberada = env.ehDesenvolvimento || env.ehTeste || env.ENABLE_API_DOCS;

if (documentacaoLiberada) {
  router.use('/', swaggerUi.serve);
  router.get(
    '/',
    swaggerUi.setup(openapi, {
      customSiteTitle: 'AgroHero API',
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    }),
  );

  // JSON bruto da especificacao, util para gerar clientes ou importar
  // em ferramentas como Insomnia e Postman.
  router.get('/openapi.json', (req, res) => res.json(openapi));
} else {
  router.get('/', (req, res) => {
    res.status(404).json({
      sucesso: false,
      erro: {
        codigo: 'DOCUMENTACAO_DESATIVADA',
        mensagem: 'A documentacao da API esta desativada neste ambiente.',
      },
    });
  });
}

export default router;