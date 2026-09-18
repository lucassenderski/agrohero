/*
 * Verificacoes de seguranca da configuracao de PRODUCAO.
 *
 * Este modulo e separado de `env.js` por uma razao pratica: `env.js` chama
 * `process.exit(1)` quando a configuracao esta errada, o que impediria um
 * teste de importa-lo sob NODE_ENV=production. Aqui a verificacao e uma
 * funcao pura que DEVOLVE a lista de problemas, e `env.js` decide encerrar
 * o processo. Assim a regra fica testavel sem derrubar a suite.
 *
 * Por que isto existe: o schema de ambiente exige JWT_SECRET com 32+
 * caracteres, mas os valores de modelo do .env.example TEM esse tamanho
 * (o placeholder de JWT tem 46). Sem esta guarda, copiar o .env.example
 * para producao sem trocar nada passaria na validacao, e a API subiria
 * assinando tokens com um segredo versionado no repositorio - qualquer
 * pessoa poderia forjar um token de administrador.
 *
 * A regra e falhar FECHADO: derrubar o processo na subida e melhor do que
 * rodar inseguro e so descobrir depois.
 */

/*
 * Trechos que denunciam um valor de exemplo. A comparacao e feita em
 * minusculas e por inclusao, entao "TROQUE_ISSO" tambem e pego.
 */
const PLACEHOLDERS = ['troque', 'placeholder', 'changeme', 'sua_chave', 'example'];

/** Diz se o valor se identifica como placeholder. */
export function parecePlaceholder(valor) {
  const normalizado = String(valor ?? '').toLowerCase();
  return PLACEHOLDERS.some((marcador) => normalizado.includes(marcador));
}

/**
 * Verifica a configuracao de producao e devolve a lista de problemas.
 * Lista vazia significa configuracao segura. Nao lanca nem encerra.
 */
export function verificarConfiguracaoProducao(dados) {
  const problemas = [];

  if (parecePlaceholder(dados.JWT_SECRET)) {
    problemas.push(
      'JWT_SECRET: valor de exemplo detectado. Gere um segredo real com ' +
        "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }

  // Sem segredo de webhook, um evento de pagamento nao pode ser verificado.
  if (!dados.PAYMENT_WEBHOOK_SECRET) {
    problemas.push('PAYMENT_WEBHOOK_SECRET: obrigatorio em producao.');
  } else if (parecePlaceholder(dados.PAYMENT_WEBHOOK_SECRET)) {
    problemas.push('PAYMENT_WEBHOOK_SECRET: valor de exemplo detectado.');
  }

  const origens = String(dados.CORS_ORIGINS ?? '');

  // CORS com "*" e credenciais anula a lista branca.
  if (origens.includes('*')) {
    problemas.push('CORS_ORIGINS: nao use "*" em producao.');
  }

  if (origens.split(',').some((origem) => origem.trim().startsWith('http://'))) {
    problemas.push('CORS_ORIGINS: use https:// em producao.');
  }

  return problemas;
}

export default { parecePlaceholder, verificarConfiguracaoProducao };