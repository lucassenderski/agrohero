import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { respostaSucesso } from '../utils/resposta.js';
import { verificarConexao } from '../database/pool.js';
import env from '../config/env.js';

const router = Router();

/*
 * GET /health
 *
 * Endpoint de saude usado por:
 *   - nos mesmos, para saber se a API subiu;
 *   - plataformas de deploy (health check do Render).
 *
 * Devolve 200 quando a API E o banco respondem, e 503 quando o banco falha.
 * Um /health que responde 200 apenas porque o Express subiu nao serve para
 * nada: o que costuma quebrar em producao e a conexao com o banco.
 */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const inicioProcesso = Date.now();
    let banco;

    try {
      banco = await verificarConexao();
    } catch (erro) {
      return res.status(503).json({
        sucesso: false,
        dados: {
          api: 'ok',
          banco: 'indisponivel',
          ambiente: env.NODE_ENV,
          uptimeSegundos: Math.round(process.uptime()),
        },
        erro: {
          codigo: 'BANCO_INDISPONIVEL',
          mensagem: 'A API esta no ar, mas nao conseguiu falar com o PostgreSQL.',
        },
      });
    }

    return respostaSucesso(res, {
      api: 'ok',
      banco: 'ok',
      latenciaBancoMs: banco.latenciaMs,
      ambiente: env.NODE_ENV,
      uptimeSegundos: Math.round(process.uptime()),
      tempoRespostaMs: Date.now() - inicioProcesso,
    });
  }),
);

export default router;