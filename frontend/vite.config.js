import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});