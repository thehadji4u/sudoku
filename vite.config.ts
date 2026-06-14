/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// base relativo ('./') funciona tanto na raiz de um domínio quanto em
// GitHub Pages de projeto (ex.: usuario.github.io/sudoku/).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts'],
    },
  },
});
