import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * Hosts autorizados a acessar o dev server.
 *
 * O Vite bloqueia por padrao requisicoes cujo cabecalho Host nao seja
 * localhost - e por um bom motivo: sem essa checagem, um site malicioso
 * pode apontar um DNS para 127.0.0.1 e usar o navegador da vitima para
 * ler o dev server (DNS rebinding).
 *
 * Em vez de `allowedHosts: true` (que desliga a protecao), liberamos
 * apenas os dominios do ambiente de execucao, com override por
 * VITE_ALLOWED_HOSTS separado por virgula.
 */
const hostsDoAmbiente = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const hostsPermitidos = [
  'localhost',
  '127.0.0.1',
  // Sufixo do runtime de desenvolvimento desta maquina.
  '.prod-runtime.all-hands.dev',
  ...hostsDoAmbiente,
];

/*
 * Configuracao do Vite (desenvolvimento e build).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // host true permite acessar o dev server de outro dispositivo na rede
    // (util para testar no celular durante o desenvolvimento).
    host: true,
    strictPort: true,
    allowedHosts: hostsPermitidos,
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: hostsPermitidos,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  /*
   * Ambiente de teste (Vitest).
   *
   * Fica no mesmo arquivo do build para os testes resolverem modulos
   * exatamente como a aplicacao. `jsdom` porque os testes montam
   * componentes React de verdade; `globals` evita importar
   * describe/it/expect em cada arquivo.
   */
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/testes/configuracao.js'],
    include: ['src/**/*.teste.{js,jsx}'],
    /*
     * Os testes de integracao falam com um backend de verdade, nunca com
     * mock. O padrao aponta para o servidor em modo `test` (NODE_ENV=test,
     * porta 3002), que usa um banco descartavel e tem o rate limit
     * desligado - sem isso a suite estoura o limite de cadastros e falha
     * por motivo errado. Sobrescreva com VITE_API_URL para apontar para
     * outro servidor.
     */
    env: {
      VITE_API_URL: process.env.VITE_API_URL || 'http://localhost:3002/api/v1',
    },
  },
});