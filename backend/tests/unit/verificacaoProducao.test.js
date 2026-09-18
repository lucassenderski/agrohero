import {
  parecePlaceholder,
  verificarConfiguracaoProducao,
} from '../../src/config/verificacaoProducao.js';

/*
 * Testes da guarda de configuracao de producao.
 *
 * A regra fica numa funcao pura justamente para poder ser testada aqui:
 * `env.js` chama `process.exit(1)`, o que derrubaria a suite se a
 * verificacao fosse testada pelo modulo de ambiente.
 *
 * Cada caso representa uma forma de subir em producao com configuracao
 * insegura. Todos precisam ser recusados.
 */

/** Configuracao segura, usada como base e sabotada por cada teste. */
function configuracaoSegura(alteracoes = {}) {
  return {
    JWT_SECRET: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
    PAYMENT_WEBHOOK_SECRET: 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3',
    CORS_ORIGINS: 'https://agrohero.app',
    ...alteracoes,
  };
}

describe('parecePlaceholder', () => {
  test.each(['troque_por_uma_chave', 'CHANGEME', 'sua_chave_aqui', 'exemplo_example'])(
    'reconhece "%s" como placeholder',
    (valor) => {
      expect(parecePlaceholder(valor)).toBe(true);
    },
  );

  test('nao confunde um segredo real com placeholder', () => {
    expect(parecePlaceholder('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(false);
  });

  test('valor vazio nao e tratado como placeholder (e checado a parte)', () => {
    expect(parecePlaceholder('')).toBe(false);
    expect(parecePlaceholder(undefined)).toBe(false);
  });
});

describe('verificarConfiguracaoProducao', () => {
  test('configuracao segura nao gera problemas', () => {
    expect(verificarConfiguracaoProducao(configuracaoSegura())).toEqual([]);
  });

  test('JWT_SECRET de exemplo e recusado', () => {
    /*
     * Este e o caso que motivou a guarda: o placeholder do .env.example
     * tem 46 caracteres, entao passava na validacao de comprimento.
     */
    const problemas = verificarConfiguracaoProducao(
      configuracaoSegura({
        JWT_SECRET: 'troque_por_uma_chave_aleatoria_longa_e_secreta',
      }),
    );

    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/JWT_SECRET/);
  });

  test('PAYMENT_WEBHOOK_SECRET ausente e recusado', () => {
    const problemas = verificarConfiguracaoProducao(
      configuracaoSegura({ PAYMENT_WEBHOOK_SECRET: '' }),
    );

    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/obrigatorio/i);
  });

  test('PAYMENT_WEBHOOK_SECRET de exemplo e recusado', () => {
    const problemas = verificarConfiguracaoProducao(
      configuracaoSegura({ PAYMENT_WEBHOOK_SECRET: 'troque-por-um-segredo-aleatorio' }),
    );

    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/PAYMENT_WEBHOOK_SECRET/);
  });

  test('CORS com wildcard e recusado', () => {
    const problemas = verificarConfiguracaoProducao(
      configuracaoSegura({ CORS_ORIGINS: '*' }),
    );

    expect(problemas.some((p) => /CORS_ORIGINS.*\*/.test(p))).toBe(true);
  });

  test('CORS com http:// em producao e recusado', () => {
    // Sem TLS, o token de acesso trafega em texto claro.
    const problemas = verificarConfiguracaoProducao(
      configuracaoSegura({ CORS_ORIGINS: 'http://agrohero.app' }),
    );

    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/https/);
  });

  test('CORS com uma origem http entre varias https e recusado', () => {
    const problemas = verificarConfiguracaoProducao(
      configuracaoSegura({
        CORS_ORIGINS: 'https://agrohero.app,http://localhost:5173',
      }),
    );

    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatch(/https/);
  });

  test('varios problemas sao todos reportados, nao so o primeiro', () => {
    // Reportar um por vez obrigaria a varios ciclos de deploy para achar
    // todos os erros de configuracao.
    const problemas = verificarConfiguracaoProducao({
      JWT_SECRET: 'troque_isto',
      PAYMENT_WEBHOOK_SECRET: '',
      CORS_ORIGINS: '*',
    });

    expect(problemas).toHaveLength(3);
  });

  test('aceita multiplas origens https legitimas', () => {
    const problemas = verificarConfiguracaoProducao(
      configuracaoSegura({
        CORS_ORIGINS: 'https://agrohero.app,https://www.agrohero.app',
      }),
    );

    expect(problemas).toEqual([]);
  });
});