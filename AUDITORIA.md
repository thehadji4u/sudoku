# Auditoria Técnica Completa — Sudoku PWA

> **Data:** 2026-06-14 · **Versão auditada:** v1.131 · **Branch:** `claude/sudoku-complete-audit-cvqldw`
> **Escopo:** arquitetura, engine, performance, UX/UI, acessibilidade, segurança, manutenibilidade.
> Este documento cobre as **Fases 1–3** do pedido (auditoria, documentação de estado e plano de refatoração).
> A **Fase 4** (refatoração profunda) depende de uma decisão de direção arquitetural — ver §8.

---

## 0. Sumário Executivo

O projeto é uma PWA de Sudoku em **vanilla JS sem build**, muito rica em funcionalidades
(6 dificuldades, sistema de "poderes" P0–P8, 15 ferramentas de análise, energia/combo,
simulador, modo pintura, ranking, sessão persistida). Está **funcional e no ar** via GitHub Pages.

Porém, foi construída ao longo de muitas sessões sem arquitetura, e isso cobra preço:

| #   | Severidade  | Problema                                                           | Evidência                                                               |
| --- | ----------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1   | **CRÍTICO** | `mestre` e `extremo` são **a mesma dificuldade na prática**        | medido: ambos ~57 buracos; alvos 58-61 e 62-64 nunca são atingidos      |
| 2   | **CRÍTICO** | Geração **trava a UI por ~3–4 s** nos níveis altos                 | medido: 3814 ms (mestre), 3116 ms (extremo) por puzzle, no main thread  |
| 3   | **CRÍTICO** | Dificuldade medida **só por nº de pistas**, não por técnica lógica | `DIFFICULTY` em `sudoku-generator.js` só define `removeMin/Max`         |
| 4   | **ALTO**    | Monólito de **6631 linhas** (`app.js`), sem módulos                | 1 arquivo, ~84 `addEventListener`, funções de 300+ linhas               |
| 5   | **ALTO**    | **~1000 linhas duplicadas** nos handlers P3–P8                     | triplets `get/trigger/_processQueue` com ~85% de sobreposição           |
| 6   | **ALTO**    | Ícones PWA **quebrados**                                           | `manifest.json` aponta `icon-192.png`/`icon-512.png` inexistentes       |
| 7   | **MÉDIO**   | **Acessibilidade** ausente                                         | sem `role="dialog"`, sem `:focus-visible`, sem `prefers-reduced-motion` |
| 8   | **MÉDIO**   | **Sem testes, sem lint, sem CI, sem `package.json`**               | projeto estático puro                                                   |
| 9   | **MÉDIO**   | **Sem dark mode** apesar de tokens CSS                             | só tema claro; 52 `!important`                                          |
| 10  | **BAIXO**   | Documentação (`PROJETO.md`) **desatualizada**                      | documenta v1.85/P0-P5; código é v1.131/P0-P8                            |
| 11  | **BAIXO**   | Risco de segurança                                                 | XSS: **baixo** (nenhum texto livre do usuário entra em HTML)            |

**Conclusão:** o motor de jogo precisa de correção **antes** de qualquer cosmética — hoje dois
níveis anunciados são indistinguíveis e o jogo congela ao iniciar partidas difíceis. A base de
código merece modularização, mas **não recomendo reescrita total**: a lógica de domínio (poderes,
análises) é valiosa e correta o suficiente para ser **extraída e organizada**, não jogada fora.

---

## 1. Arquitetura Atual

```
sudoku/
├── index.html            912 linhas — shell, 2 telas, ~7 modais, 60+ toggles de config
├── app.js               6631 linhas — TODA a lógica (estado, render, input, poderes, análises, i18n)
├── style.css            1946 linhas — tema claro, 14 custom props, 52 !important, 1 media query
├── sudoku-generator.js   168 linhas — engine: gerar/resolver/contar soluções
├── sw.js                  38 linhas — Service Worker (network-first em tudo)
├── manifest.json          30 linhas — PWA manifest (ícones PNG quebrados)
├── icons/icon.svg
└── PROJETO.md            documentação (desatualizada)
```

**Características:**

- **Sem sistema de módulos** — tudo no escopo de `app.js` via IIFE implícita / globais.
- **Estado** centralizado em um objeto `STATE` (bom!) + ~15 globais soltas (`_p0Gen`, `_nsGen`,
  timers de long-press, `PAINT_STATE`...).
- **Render** em camadas: `renderBoard()` → `renderNumpad()` → `renderHighlights()` (362 linhas).
- **Sem separação domínio/UI** — regras de Sudoku (técnicas lógicas) misturadas com manipulação de DOM e animações.

### Anti-patterns e code smells identificados

- **God file / God function:** `renderHighlights` (362), `renderAnalysisHighlights` (316),
  `updateActionBar` (282), `setupSettingsEvents` (236), `attachEvents` (169), `doPlaceNumber` (118).
- **Copy-paste em escala:** cada poder/análise (par, trio, quad, escondido…) repete a mesma
  estrutura `getXForNum` / `triggerX` / `_processXQueue` / `updateXBtn`. ~1000 linhas redutíveis a
  uma família de funções parametrizadas.
- **Números mágicos** espalhados (delays 80/180/320/430 ms, thresholds de long-press 450/600 ms).
- **Acoplamento via CSS `!important`** (52) para vencer a cascata de highlights — sintoma de
  estilo dirigido por estado sem camada de tokens/estados consistente.

---

## 2. Engine de Sudoku — Análise Profunda (a parte mais importante)

Arquivo `sudoku-generator.js`. Validei **empiricamente** (script de teste, 8 puzzles por nível,
contador de soluções independente):

```
nível         buracos[min max avg]   unicidade   tempo/puzzle
facil         38  45  40.9            100% único   6 ms
medio         47  49  48.1            100% único   14 ms
dificil       50  53  51.4            100% único   44 ms
especialista  54  57  54.9            100% único   168 ms
mestre        57  58  57.4            100% único   3814 ms   ← alvo 58-61 NÃO atingido
extremo       56  58  57.1            100% único   3116 ms   ← alvo 62-64 NÃO atingido
```

### O que está **correto**

- `isValid`, `solveRandom` (backtracking com embaralhamento) e `countSolutions` (com `limit`)
  estão corretos. **100% dos puzzles gerados têm solução única** — a garantia de unicidade funciona.

### O que está **errado** (CRÍTICO)

1. **Alvos impossíveis.** Sudokus de solução única praticamente nunca passam de ~58 buracos
   (o mínimo conhecido de pistas é 17 = 64 buracos, mas é raríssimo e exige busca dedicada).
   `removeCells` é guloso e simplesmente **para quando não consegue remover mais** mantendo
   unicidade. Resultado: `mestre` (alvo 58-61) e `extremo` (alvo 62-64) **colapsam ambos em ~57
   buracos** → são **a mesma dificuldade**, embora paguem multiplicadores diferentes (4× vs 6×).
2. **Performance inaceitável.** Para tentar atingir os alvos altos, `generate` faz `attempts=3` e
   cada `removeCells` chama `countSolutions` após cada remoção. Isso custa **3–4 segundos** rodando
   **no main thread** (só há um `setTimeout(…, 30)` antes). Em celular, a tela **congela** ao
   começar uma partida difícil.
3. **Dificuldade ≠ técnica.** A dificuldade é definida **apenas pela contagem de buracos**. Não há
   nenhuma avaliação de _quais técnicas_ o puzzle exige. Um puzzle "fácil" com 40 buracos pode, por
   azar, exigir técnicas avançadas; um "difícil" pode ser resolvível só com naked singles. O rótulo
   **não corresponde** à dificuldade real percebida.

### Recomendação para o engine (Fase 4)

- Implementar um **solver lógico graduado** (naked/hidden singles → pairs/triples → pointing →
  X-wing…). A lógica das técnicas **já existe** dentro de `app.js` (sistema de análises) — deve ser
  **extraída para um módulo de domínio reutilizável** e usada tanto pelo jogo quanto pelo gerador.
- Definir dificuldade pela **técnica mais difícil necessária** (+ nº de buracos como desempate),
  não só pela contagem.
- Mover a geração para um **Web Worker** → zero congelamento de UI; mostrar spinner sem travar.
- Redefinir alvos realistas e distintos por nível (ex.: graduar por técnica, com faixas de buracos
  plausíveis: ~40 / ~48 / ~52 / ~55 / ~56 / ~57).

---

## 3. Performance

- **Bloqueio principal:** geração de puzzle no main thread (§2). Maior gargalo de UX do app.
- `renderHighlights()` reconstrói/limpa classes das 81 células a cada interação. Não é o gargalo
  hoje, mas é candidato a _dirty-flag_ / atualização incremental.
- `updateCellContent` faz `el.innerHTML = …` por célula — recriação de DOM por digitação. Aceitável,
  porém poderia atualizar apenas o necessário.
- Sem `requestAnimationFrame` para coordenar animações (uso intenso de `setTimeout` encadeado).

---

## 4. UX/UI

- Funcionalmente rica e visualmente coerente, mobile-first (`clamp()` para tamanho de célula).
- **Sem dark mode** (apesar de já haver custom properties que facilitariam).
- Apenas **1 media query** (desktop ≥500px) — tablet/desktop pouco aproveitados.
- Feedback de carregamento existe (overlay), mas **trava junto com a UI** durante a geração (§2).
- Microinterações abundantes (partículas, pulsos), porém **sem `prefers-reduced-motion`**.

---

## 5. Acessibilidade (vários itens a corrigir)

- ✅ `lang="pt-BR"` e viewport corretos.
- ❌ **Sem landmarks semânticos** (`<main>`, `<nav>`, `<header>` reais) — tudo `div`.
- ❌ Modais **sem** `role="dialog"`, `aria-modal`, `aria-label`, sem _focus trap_.
- ❌ **Nenhum** estilo `:focus-visible` — navegação por teclado sem indicador visível.
- ❌ Botões só-ícone com `title` mas **sem `aria-label`**.
- ❌ Board é `div#board` sem semântica/`aria` (idealmente `role="grid"`).
- ⚠️ Contrastes marginais (`--text-muted #94A3B8`, estrelas âmbar sobre branco).
- ❌ Sem `prefers-reduced-motion` (15+ animações).

---

## 6. Segurança

- **XSS: risco BAIXO.** Auditados todos os `innerHTML`/`insertAdjacentHTML`: os únicos valores
  interpolados são dígitos 1–9, números armazenados (score/erros) e constantes hardcoded
  (`PAINT_COLORS`). **Nenhum texto livre do usuário** é injetado em HTML. Sem `eval`/`new Function`/
  `document.write`.
- **localStorage:** 6 chaves (`sudoku-energy`, `sudoku-completions`, `sudoku-session`,
  `sudoku-ranking`, `sudoku-settings`, `ios-banner-dismissed`). `JSON.parse` está em `try/catch`,
  mas **sem versionamento/migração** — mudança de schema pode corromper sessão silenciosamente.
- **Recomendações:** adicionar `schemaVersion` ao persistir; validar shape no load; CSP via
  `<meta http-equiv="Content-Security-Policy">` (defensivo, mesmo sendo app estático).

---

## 7. Qualidade / Tooling

- ❌ **Sem `package.json`**, sem ESLint, sem Prettier, sem testes, sem CI.
- ❌ Engine **sem testes** — apesar de ser puro e altamente testável (unicidade, validade,
  graduação de dificuldade são asserções objetivas).
- ⚠️ Processo de deploy manual e frágil: bump de `CACHE` no `sw.js` **e** versão no `index.html`
  precisam ser feitos à mão a cada mudança (documentado em `PROJETO.md`, propenso a erro).
- ⚠️ `manifest.json` referencia **ícones PNG inexistentes** → instalação PWA degradada.

---

## 8. Plano de Refatoração (Fase 4) — proposta

Princípio: **preservar o domínio valioso, eliminar o caos estrutural.** Recomendo refatoração
**incremental e verificável**, não reescrita do zero (a lógica de técnicas de Sudoku já é um ativo).

### Ordem proposta (cada passo deixa o app funcionando)

1. **Engine primeiro (corrige os 3 CRÍTICOS):** extrair domínio Sudoku puro
   (`src/domain/`): validação, solver graduado por técnica, gerador. Geração em **Web Worker**.
   Redefinir dificuldades por técnica. **Cobrir com testes** (unicidade, validade, graduação).
2. **Tooling base:** `package.json` + Vite (dev server/HMR e build) + ESLint + Prettier + Vitest.
   Gera `dist/` para o GitHub Pages; versão/cache do SW passam a ser **automáticos** (fim do bump manual).
3. **Quebrar o monólito** `app.js` em módulos por responsabilidade:
   `state/`, `render/`, `input/`, `powers/`, `analysis/`, `persistence/`, `ui/`. Unificar os
   ~1000 linhas duplicadas dos poderes P3–P8 em **uma família parametrizada**.
4. **Acessibilidade + dark mode:** landmarks, `role="dialog"` + focus trap, `:focus-visible`,
   `prefers-reduced-motion`, `prefers-color-scheme`. Corrigir ícones PWA.
5. **Persistência robusta:** `schemaVersion` + validação + migração.
6. **Premium (Fase 6), só o que agrega:** estatísticas/histórico, conquistas, salvamento já existe,
   offline já existe. Priorizar: dark mode, melhorias mobile/a11y, ícones PWA corretos.

### Decisão necessária do dono do projeto (bloqueia a Fase 4)

A escolha de **tooling/arquitetura** muda todo o trabalho subsequente e afeta o deploy atual
(GitHub Pages sem build). Ver pergunta no chat.

---

## 9. Apêndice — funções/linhas de referência (app.js)

| Região                                 | Linhas (aprox.) |
| -------------------------------------- | --------------- |
| STATE + constantes                     | 1–253           |
| init / lifecycle                       | 324–364         |
| `attachEvents`                         | 369–537         |
| `setupSettingsEvents`                  | 539–774         |
| `startGame`                            | 789–870         |
| render (board/notes)                   | 932–1018        |
| `renderHighlights` (362 l.)            | 1020–1381       |
| input / `doPlaceNumber`                | 1437–1638       |
| persistência (sessão/ranking/settings) | 1911–2061       |
| poderes P0–P8                          | 2700–3802       |
| `animateCellTravel`                    | 2932–2972       |
| ferramentas de análise                 | 4182–6017       |
| i18n                                   | 6025–6086       |
| `renderAnalysisHighlights` (316 l.)    | 6086–6401       |
| `syncSettingsUI`                       | 6487–6619       |
