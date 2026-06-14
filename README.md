# Sudoku PWA

PWA de Sudoku em construção/refatoração. Veja **[AUDITORIA.md](./AUDITORIA.md)** para o
diagnóstico técnico completo e o plano de refatoração por fases.

## Stack

- **Build/dev:** [Vite](https://vitejs.dev/) 8
- **Linguagem:** TypeScript (novo código em `src/`) — código legado em migração (`public/`)
- **Testes:** [Vitest](https://vitest.dev/)
- **Qualidade:** ESLint (flat config) + Prettier
- **Deploy:** GitHub Pages via GitHub Actions

## Scripts

```bash
npm install        # instala dependências
npm run dev        # servidor de desenvolvimento (HMR)
npm run build      # build de produção em dist/
npm run preview    # serve o build de produção localmente
npm test           # roda os testes (Vitest)
npm run typecheck  # checagem de tipos (tsc --noEmit)
npm run lint       # ESLint
npm run format     # Prettier (escreve)
```

## Estrutura

```
sudoku/
├── index.html            # entry do Vite
├── src/
│   └── domain/           # ✅ DOMÍNIO TIPADO (puro, sem DOM) — com testes
│       ├── types.ts      #    tipos (Board, Difficulty, …)
│       ├── board.ts      #    criação/validação de tabuleiro
│       ├── solver.ts     #    solver, contagem de soluções
│       ├── generator.ts  #    geração de puzzles (unicidade garantida)
│       └── __tests__/    #    testes unitários
├── public/               # ⚠️ LEGADO (servido verbatim) — em migração p/ src/
│   ├── app.js            #    monólito de ~6600 linhas (a ser modularizado)
│   ├── style.css
│   ├── sudoku-generator.js
│   ├── sw.js
│   ├── manifest.json
│   └── icons/
├── AUDITORIA.md          # auditoria + plano de refatoração
└── PROJETO.md            # notas históricas (legado)
```

## Estado da migração (refatoração incremental)

A refatoração segue o padrão _strangler fig_: a base nova (tipada, testada) é construída em
`src/` ao lado do app legado em `public/`, que continua rodando sem alterações de comportamento.

- [x] **Fase 1–3:** auditoria, documentação de estado e plano (ver `AUDITORIA.md`)
- [x] **Tooling:** Vite + TypeScript + ESLint + Prettier + Vitest + CI (0 vulnerabilidades)
- [x] **Domínio extraído:** engine de Sudoku tipado e coberto por testes em `src/domain/`
- [ ] **Próximo:** integrar o domínio ao app (gerador em Web Worker + dificuldade graduada por técnica)
- [ ] Quebrar `public/app.js` em módulos (`state/`, `render/`, `input/`, `powers/`, `analysis/`)
- [ ] Acessibilidade (focus-visible, role=dialog, prefers-reduced-motion) + dark mode
- [ ] Ícones PWA maskable (PNG 192/512)

## Deploy

O deploy é automático via **GitHub Actions** (`.github/workflows/deploy.yml`) ao dar push em `main`.

> ⚠️ **Ação manual necessária uma única vez:** em _Settings → Pages → Build and deployment_,
> definir **Source = "GitHub Actions"** (antes era "Deploy from a branch"). Como agora há um passo
> de build (Vite gera `dist/`), o Pages não pode mais servir a raiz do repositório diretamente.
> Isso também elimina o bump manual de versão/cache do Service Worker descrito no `PROJETO.md`.
