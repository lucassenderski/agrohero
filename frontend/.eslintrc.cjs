/*
 * Configuracao do ESLint para o frontend.
 *
 * Cobre os arquivos .jsx/.js de src/, incluindo os testes.
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    // Variaveis nao usadas sao erro, mas argumentos prefixados com "_"
    // ficam liberados (convencao para parametros exigidos pela assinatura).
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

    // O projeto nao usa PropTypes: os componentes recebem props direto e a
    // validacao de dados de formulario acontece no backend. Manter a regra
    // ligada produziria 138 erros de "missing in props validation" que nao
    // apontam defeito nenhum, enterrando os erros que importam.
    'react/prop-types': 'off',
  },
  overrides: [
    {
      // Os testes rodam no Vitest, que injeta describe/it/expect como globais.
      files: ['src/testes/**/*.{js,jsx}', 'src/**/*.teste.{js,jsx}'],
      env: { node: true },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
      },
    },
    {
      // vite.config.js roda no Node, nao no navegador.
      files: ['vite.config.js', '*.cjs'],
      env: { node: true },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/'],
};