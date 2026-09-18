import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

/*
 * Valida e normaliza todas as variaveis de ambiente em um unico lugar.
 *
 * Por que isso importa: sem validacao, um JWT_SECRET ausente em producao
 * viraria `undefined` e o jsonwebtoken lancaria um erro obscuro no primeiro
 * login. Aqui o processo falha imediatamente, na subida, com mensagem clara.
 */

const ambienteSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  /*
   * Libera a documentacao Swagger em producao. O padrao e desligada,
   * porque expor a superficie completa da API facilita a vida de quem
   * procura endpoint sem protecao. Em desenvolvimento ela fica sempre
   * disponivel.
   */
  ENABLE_API_DOCS: z
    .string()
    .optional()
    .transform((valor) => valor === 'true'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL e obrigatoria'),
  DATABASE_URL_TEST: z.string().optional(),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET deve ter no minimo 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  RATE_LIMIT_JANELA_MINUTOS: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_MAX_REQUISICOES: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_MAX_LOGIN: z.coerce.number().int().positive().default(10),

  PAYMENT_GATEWAY: z.enum(['fake', 'mercadopago']).default('fake'),
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional().default(''),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().optional().default(''),

  /*
   * Segredo usado para verificar a assinatura HMAC dos webhooks de
   * pagamento (`x-agrohero-signature`). Sem ele, o webhook e RECUSADO.
   *
   * Curto de proposito (16) para o ambiente de desenvolvimento aceitar um
   * valor simples, mas diferente de JWT_SECRET: rotacionar o segredo do
   * webhook nao precisa invalidar as sessoes dos usuarios.
   */
  PAYMENT_WEBHOOK_SECRET: z
    .string()
    .min(16, 'PAYMENT_WEBHOOK_SECRET deve ter no minimo 16 caracteres')
    .optional()
    .default(''),

  STORAGE_DRIVER: z.enum(['local', 'cloudinary']).default('local'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),

  FRETE_VALOR_BASE: z.coerce.number().nonnegative().default(9.9),
  FRETE_GRATIS_ACIMA_DE: z.coerce.number().nonnegative().default(200),
});

const resultado = ambienteSchema.safeParse(process.env);

if (!resultado.success) {
  // Nao usamos o logger aqui de proposito: o logger depende desta configuracao.
  const problemas = resultado.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(
    `\n[AgroHero] Configuracao de ambiente invalida:\n${problemas}\n\n` +
      'Confira o arquivo backend/.env (use .env.example como modelo).\n',
  );
  process.exit(1);
}

const dados = resultado.data;

/*
 * Guarda de producao contra segredos de exemplo.
 *
 * O schema acima exige JWT_SECRET com 32+ caracteres, mas os valores de
 * modelo do .env.example TEM esse tamanho - "troque_por_uma_chave_..."
 * tem 46. Ou seja: copiar o .env.example para producao e nao trocar nada
 * passaria na validacao, e a API subiria assinando tokens com um segredo
 * publico (esta versionado no repositorio). Qualquer pessoa poderia forjar
 * um token de administrador.
 *
 * Por isso o comprimento nao basta: recusamos valores que se identificam
 * como placeholder. E uma falha FECHADA - derruba o processo na subida,
 * em vez de rodar inseguro e descobrir depois.
 */
const PLACEHOLDERS = ['troque', 'placeholder', 'changeme', 'sua_chave', 'example'];

function parecePlaceholder(valor) {
  const normalizado = String(valor).toLowerCase();
  return PLACEHOLDERS.some((marcador) => normalizado.includes(marcador));
}

if (dados.NODE_ENV === 'production') {
  const problemas = [];

  if (parecePlaceholder(dados.JWT_SECRET)) {
    problemas.push(
      '  - JWT_SECRET: valor de exemplo detectado. Gere um segredo real com ' +
        'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }

  // Sem segredo de webhook, um evento de pagamento nao pode ser verificado.
  if (!dados.PAYMENT_WEBHOOK_SECRET) {
    problemas.push('  - PAYMENT_WEBHOOK_SECRET: obrigatorio em producao.');
  } else if (parecePlaceholder(dados.PAYMENT_WEBHOOK_SECRET)) {
    problemas.push('  - PAYMENT_WEBHOOK_SECRET: valor de exemplo detectado.');
  }

  // CORS com "*" e credenciais anula a lista branca.
  if (dados.CORS_ORIGINS.includes('*')) {
    problemas.push('  - CORS_ORIGINS: nao use "*" em producao.');
  }

  if (dados.CORS_ORIGINS.split(',').some((origem) => origem.trim().startsWith('http://'))) {
    problemas.push('  - CORS_ORIGINS: use https:// em producao.');
  }

  if (problemas.length > 0) {
    console.error(
      `\n[AgroHero] Configuracao INSEGURA para producao:\n${problemas.join('\n')}\n`,
    );
    process.exit(1);
  }
}

export const env = {
  ...dados,
  // Em testes o banco e descartavel e separado do banco de desenvolvimento.
  ehProducao: dados.NODE_ENV === 'production',
  ehTeste: dados.NODE_ENV === 'test',
  ehDesenvolvimento: dados.NODE_ENV === 'development',

  // DATABASE_URL efetiva conforme o ambiente.
  databaseUrl:
    dados.NODE_ENV === 'test' && dados.DATABASE_URL_TEST
      ? dados.DATABASE_URL_TEST
      : dados.DATABASE_URL,

  // Lista de origens permitidas no CORS, ja limpa e sem espacos.
  corsOrigens: dados.CORS_ORIGINS.split(',')
    .map((origem) => origem.trim())
    .filter(Boolean),
};

export default env;