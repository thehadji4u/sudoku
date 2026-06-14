/// <reference types="vitest/config" />
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

// Versão única da aplicação: vem do package.json e é injetada no build.
// Isso elimina o bump manual em vários arquivos (achado da auditoria).
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };
const APP_VERSION = pkg.version;

/** Substitui o placeholder %APP_VERSION% no index.html e no sw.js gerado. */
function appVersionPlugin(): Plugin {
  return {
    name: 'app-version-inject',
    transformIndexHtml(html) {
      return html.replaceAll('%APP_VERSION%', APP_VERSION);
    },
    closeBundle() {
      // sw.js vem de public/ (copiado verbatim) — injeta a versão no cache name.
      const swPath = fileURLToPath(new URL('./dist/sw.js', import.meta.url));
      if (existsSync(swPath)) {
        const src = readFileSync(swPath, 'utf-8');
        writeFileSync(swPath, src.replaceAll('%APP_VERSION%', APP_VERSION));
      }
    },
  };
}

// base relativo ('./') funciona tanto na raiz de um domínio quanto em
// GitHub Pages de projeto (ex.: usuario.github.io/sudoku/).
export default defineConfig({
  base: './',
  plugins: [appVersionPlugin()],
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
