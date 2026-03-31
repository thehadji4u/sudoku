# Sudoku PWA — Documentação Técnica Completa

> **Versão atual:** v1.85 | **Branch de desenvolvimento:** `claude/fix-error-penalty-system-gtM3d`
> **Repositório:** `thehadji4u/sudoku` (GitHub, rodando como GitHub Pages)

---

## 1. Estrutura de Arquivos

```
/home/user/sudoku/
├── index.html          — shell HTML, configurações (tri-toggles), versão do app
├── app.js              — toda a lógica do jogo (~3100 linhas)
├── style.css           — estilos (tema claro por default)
├── sw.js               — Service Worker (cache-first / network-first)
├── sudoku-generator.js — gerador de puzzles
├── manifest.json       — PWA manifest
└── icons/icon.svg
```

---

## 2. Regras de Deploy — CRÍTICO

O app roda via **GitHub Pages**. O Service Worker faz cache de todos os assets.
**Toda vez que mudar qualquer arquivo, é OBRIGATÓRIO:**

1. **Incrementar o número de cache no `sw.js`:**
   ```js
   // sw.js linha 1-2
   /* ... build:20250331-04 */    // incrementar o sufixo (01, 02, 03...)
   const CACHE = 'sudoku-v85';   // incrementar o número da versão
   ```

2. **Incrementar a versão no `index.html`:**
   ```html
   <!-- linha ~81 -->
   <span class="app-version">v1.85</span>
   ```

3. **Commitar todos os arquivos modificados** (incluindo `sw.js` e `index.html`) no branch correto.

4. **Push com:**
   ```bash
   git push -u origin claude/fix-error-penalty-system-gtM3d
   ```

> Sem o bump do SW, usuários com o app instalado (PWA) continuam rodando a versão antiga em cache, mesmo após o push.

---

## 3. Fluxo Git

- **Branch de desenvolvimento:** `claude/fix-error-penalty-system-gtM3d`
- Main tem o histórico de versões anteriores (v76, v83, v84...)
- Sempre desenvolver e commitar nesse branch, nunca em `main`
- Se houver conflito ao trocar de branch, usar stash + checkout + stash pop

---

## 4. Estado Global (`STATE`)

```js
STATE = {
  puzzle:      null,      // number[9][9] — 0 = vazio
  solution:    null,      // number[9][9]
  givens:      null,      // Set<"r,c"> — células imutáveis
  notes:       null,      // Set[9][9]  — rascunhos por célula

  selectedRow: -1,
  selectedCol: -1,
  notesMode:   false,
  pinnedNum:   0,         // número fixado via long-press no dial

  difficulty:  '',
  errors:      0,
  score:       0,
  energyPoints: 0,        // persistido em localStorage
  streakCount:  0,
  comboMultiplier: 1,
  gameOver:    false,

  undoStack: [],
  simulator: { active, placements, ... },

  settings: {
    // Opções de UI
    autoRemoveNotes:     false,  // opção 4 — remove notas conflitantes ao preencher
    showSelZone:         true,   // opção 1 — verde nas células com mesmo número
    showNoteMatch:       true,   // opção 2 — destaca dígitos de rascunho
    enhancedHighlight:   true,   // opção 1.1 — azul na zona da seleção
    enableDialPin:       true,   // long-press no dial para fixar número

    // Poderes (tri-toggle: 0=off, 1=highlight, 2=auto)
    p0Mode:          0,   // P0 — eliminar notas proibidas (requer autoRemoveNotes)
    nakedSingleMode: 0,   // P1 — naked single fill
    nakedPairMode:   0,   // P2 — naked pair elimination
    p3Mode:          0,   // P3 — naked triple elimination
    p4Mode:          0,   // P4 — naked quad elimination
    p5Mode:          0,   // P5 — hidden single fill
  }
}
```

---

## 5. Sistema de Poderes (Pn)

### Visão geral

Cada poder tem **2 níveis** via tri-toggle:
- **Nível 1 (highlight):** marca visualmente as células relevantes no tabuleiro
- **Nível 2 (auto):** executa a ação automaticamente com animação

### Prioridade de execução

`triggerPowerFunctions(num, sourceEl)` — dispatcher com prioridade:

```
P0 > P1 > P2 > P3 > P4 > P5
```

Só executa o poder de **menor índice com trabalho a fazer**. Se P1 tem trabalho, P2-P5 não executam.

### Quando `triggerPowerFunctions` é chamado:
- Ao selecionar célula preenchida
- Ao fixar número no dial (long-press)
- Após preencher célula (P1 preenche, depois dispara P0 em cascata)

### Regra de seleção durante animação Pn:
- **NÃO resetar `selectedRow/Col/pinnedNum` no início** de trigger functions P2/P3/P4
- Resetar **apenas ao final** da fila de animações (no `onDone` do último item)
- Isso preserva a célula selecionada (azul + componentes) durante a animação

---

## 6. Descrição de Cada Poder

### P0 — Eliminar notas proibidas
- **Trigger:** célula selecionada com número preenchido; notas na mesma linha/coluna/caixa
- **Requer:** `autoRemoveNotes` (opção 4) ativo para executar ação (nível 2)
- **Sem opção 4:** nível 1 apenas marca com `p0-target` (ciano claro)
- **Cor de animação:** ciano `#22D3EE`, partículas rápidas (18ms por célula)
- **Geração:** `_p0Gen`
- **Funções:** `getP0Targets(r,c)`, `triggerP0Elim(r,c,fallbackEl)`, `_processP0Wave(gen,num,srcEl,targets)`
- **Extra:** ao iniciar partida com opção 4 + P0 nível 2, executa onda automática em todos os givens (efeito "show dopaminic")

### P1 — Naked Single Fill
- **Trigger:** célula com único candidato possível (board logic ou por notas)
- **Cor:** amber `#F59E0B` (partícula), `naked-single` (amarelo claro), `naked-single-note` (laranja claro)
- **Velocidade de devolução de notas:** lenta (460ms), igual a P2+
- **Geração:** `_nsGen`
- **Funções:** `getNakedSinglesForNum(n)`, `getNoteNakedsForNum(n)`, `triggerNakedSingleFill(num,srcEl)`, `_processNsQueue(...)`
- **Cascata:** após preencher célula, dispara P0 se ativo

### P2 — Naked Pair Elimination
- **Lógica:** duas células na mesma unidade com exatamente as mesmas 2 notas → eliminam o número em outras células da unidade
- **Cor source:** `#EDE9FE` (violeta claro), glow `#A78BFA`
- **Cor target:** `#FEF2F2` (vermelho bem claro)
- **Cor partícula:** `#A78BFA` (violeta)
- **Geração:** `_npGen`
- **Funções:** `getNakedPairsForNum(n)`, `triggerNakedPairElim(num,fallbackEl)`, `_processNpQueue(...)`
- **ATENÇÃO:** `getNakedPairsForNum` só inclui pares com `targets.length > 0` (guard adicionado em v1.85)

### P3 — Naked Triple Elimination
- **Lógica:** três células na mesma unidade cujas notas formam um conjunto de 3 → eliminam em outras células
- **Cor source:** `#DDD6FE` (violeta médio), glow `#8B5CF6`
- **Cor partícula:** `#8B5CF6`
- **Geração:** `_ntGen`
- **Funções:** `getNakedTriplesForNum(n)`, `triggerNakedTripleElim(num,fallbackEl)`, `_processNtQueue(...)`

### P4 — Naked Quad Elimination
- **Lógica:** quatro células com notas formando conjunto de 4
- **Cor source:** `#C4B5FD` (violeta forte), glow `#7C3AED`
- **Cor partícula:** `#7C3AED`
- **Geração:** `_nqGen`
- **Funções:** `getNakedQuadsForNum(n)`, `triggerNakedQuadElim(num,fallbackEl)`, `_processNqQueue(...)`

### P5 — Hidden Single Fill
- **Lógica:** célula que é o único candidato de um número em uma unidade
- **Cor:** violeta `#C084FC`, cell class `p5-single`
- **Geração:** `_nhGen`
- **Funções:** `getHiddenSinglesForNum(n)`, `triggerHiddenSingleFill(num,srcEl)`, `_processNhQueue(...)`
- **Cascata:** após preencher, dispara P0 se ativo

---

## 7. Sistema Visual de Highlights

### Classes CSS aplicadas em `renderHighlights()`

| Classe | Descrição |
|--------|-----------|
| `selected` | Célula selecionada (azul) |
| `same-num` | Mesma número no board (verde) |
| `highlight-sel` | Zona da célula selecionada (azul claro) |
| `highlight-match` | Zona do pinnedNum (azul claro) |
| `naked-single` | P1 — naked single por lógica |
| `naked-single-note` | P1 — naked single por notas |
| `p2-source` | P2 — células do par (violeta claro) |
| `p3-source` | P3 — células do triplo (violeta médio) |
| `p4-source` | P4 — células do quad (violeta forte) |
| `p-elim-target` | P2/P3/P4 — célula alvo (vermelho bem claro) |
| `p0-target` | P0 — célula alvo (ciano claro) |
| `p5-single` | P5 — hidden single (violeta claro + borda) |
| `notes-drag-selected` | Multi-cell drag de notas |

### Regra de limpeza em `renderHighlights()`
```js
// Início da função — limpa TUDO antes de reaplicar
for (let r = 0; r < 9; r++)
  for (let c = 0; c < 9; c++)
    cellElements[r][c].classList.remove(
      'selected', 'same-num', 'highlight-sel', 'highlight-match',
      'sim-conflict', 'naked-single', 'naked-single-note',
      'p2-source', 'p-elim-target', 'p0-target', 'p3-source',
      'p4-source', 'p5-single', 'notes-drag-selected'
    );
document.querySelectorAll('.note-digit.note-match').forEach(s => s.classList.remove('note-match'));
document.querySelectorAll('.note-digit.p-elim-note').forEach(s => s.classList.remove('p-elim-note'));
```

### Nota de eliminação específica (`p-elim-note`)
Em P2/P3/P4, apenas o dígito do número ativo fica vermelho na célula alvo (não todos os dígitos):
```js
// Em renderHighlights, nas seções P2/P3/P4 target:
el.classList.add('p-elim-target');
const noteEl = el.querySelector(`.note-digit[data-note="${activeNum}"]`);
if (noteEl) noteEl.classList.add('p-elim-note');
```
CSS: `.note-digit.p-elim-note { color: #EF4444 !important; font-weight: 700; }`

O mesmo deve ser feito nos trigger functions ao montar a fila.

### `activeNum` — número ativo para highlights
```js
const activeNum = STATE.pinnedNum > 0 ? STATE.pinnedNum
                : (sr >= 0 && puzzle[sr][sc] > 0 ? puzzle[sr][sc] : 0);
```

### Prioridade de exibição (só mostra o poder mais alto com trabalho):
```
P0 active? → mostra só P0
P1 active? → mostra só P1
P2 active? → mostra só P2
...
```

---

## 8. Animação `animateCellTravel`

Utilitário reutilizável para partículas voando entre dois elementos DOM:

```js
animateCellTravel(sourceEl, targetEl, {
  color:    '#A78BFA',   // cor da partícula e splash
  duration: 500,         // ms do voo (default 500)
  splashMs: 430,         // ms do splash no destino (default 430)
  guard:    () => bool,  // se retornar false, cancela
  onArrive: () => {},    // executado ao chegar (antes do splash)
  onDone:   () => {},    // executado após o splash
});
```

**CSS classes:** `.cell-travel-particle`, `.cell-anim-splash`, `.cell-anim-splash::after`

### Animações de pulse/flash nas células Pn:

```css
/* Source pulse — antes da animação */
.cell.p-source-glow { animation: p-source-pulse 0.55s ease-out forwards; }
/* Usa --p-glow CSS var para a cor: el.style.setProperty('--p-glow', '#A78BFA') */

/* Target flash — enquanto a nota está partindo */
.cell.p-target-flash { animation: p-target-flash 0.45s ease-in-out; }
```

### Velocidades de devolução de notas ao dial:
- **P0:** muito rápido — `duration: 150`, `splashMs: 70`, 18ms entre células
- **P1, P2, P3, P4:** padrão — `animateCellTravel` com defaults (~500ms voo)
- **Intervalo entre itens da fila:** 280ms (`setTimeout(..., 280)`)
- **Pausa antes de iniciar fila:** 450ms (`setTimeout(..., 450)`)

---

## 9. Geração Counter — Padrão de Cancelamento

Cada poder tem um counter global para cancelar chains assíncronas:

```js
let _p0Gen = 0;   // P0
let _nsGen = 0;   // P1 naked single
let _npGen = 0;   // P2 naked pair
let _ntGen = 0;   // P3 naked triple
let _nqGen = 0;   // P4 naked quad
let _nhGen = 0;   // P5 hidden single
```

No início de cada trigger: `_npGen++; const gen = _npGen;`
Em cada step da fila: `if (gen !== _npGen || ...) return;`

Isso garante que ao iniciar uma nova animação, a anterior é cancelada.

---

## 10. `updateCellContent(r, c)` — Atenção

```js
// Reseta className da célula E re-renderiza HTML interno
el.className = 'cell' + (isGiven ? ' given' : '');
el.innerHTML = ...;
```

**Wipes:** qualquer classe de animação adicionada dinamicamente (como `p-source-glow`, `p-elim-note`, etc).
Isso é esperado — as classes de animação das células processadas são descartadas assim que o conteúdo é atualizado.

---

## 11. HTML das Notas

```js
function buildNotesHTML(noteSet) {
  let html = '<div class="notes-grid">';
  for (let n = 1; n <= 9; n++) {
    const active = noteSet.has(n);
    html += `<span class="note-digit${active ? ' active' : ''}" data-note="${n}">${active ? n : ''}</span>`;
  }
  html += '</div>';
  return html;
}
```

Cada dígito de nota tem `data-note="N"` → seletor: `.note-digit[data-note="${num}"]`

---

## 12. Configurações no `index.html`

Os tri-toggles de poderes têm IDs no formato `cfg-SETTING`:

```html
<div class="tri-toggle" data-setting="p0Mode"> ... </div>
<div class="tri-toggle" data-setting="nakedSingleMode"> ... </div>
<div class="tri-toggle" data-setting="nakedPairMode"> ... </div>
<div class="tri-toggle" data-setting="p3Mode"> ... </div>
<div class="tri-toggle" data-setting="p4Mode"> ... </div>
<div class="tri-toggle" data-setting="p5Mode"> ... </div>
```

---

## 13. Bugs Já Corrigidos (para não repetir)

| Bug | Fix |
|-----|-----|
| Next power flash após Pn terminar | Resetar `pinnedNum/selectedRow/Col` só no **final** da fila, não no início |
| Seleção azul sumia durante P2/P3/P4 | Não resetar seleção no início de trigger functions |
| Todas as notas da célula alvo ficavam vermelhas | Usar `.note-digit.p-elim-note` (classe no dígito específico), não CSS geral |
| P2 nível 2 não executava | `getNakedPairsForNum` retornava pares com `targets=[]`; adicionado guard `if (targets.length)` |
| Source colors pareciam com target (ambos vermelhos) | Source → família violeta (`#EDE9FE`, `#DDD6FE`, `#C4B5FD`); Target → vermelho claro |
| Células erradas marcadas em P2/P3/P4 | Consequência do CSS de notas incorreto (resolvido com p-elim-note) |

---

## 14. Paleta de Cores dos Poderes

| Poder | Source BG | Glow / Partícula | Target BG | Nota elim |
|-------|-----------|-------------------|-----------|-----------|
| P0 | — | `#22D3EE` (ciano) | `#CFFAFE` | N/A |
| P1 | `#FEF3C7` / `#FED7AA` | `#F59E0B` (amber) | — | N/A (fill) |
| P2 | `#EDE9FE` | `#A78BFA` | `#FEF2F2` | `#EF4444` |
| P3 | `#DDD6FE` | `#8B5CF6` | `#FEF2F2` | `#EF4444` |
| P4 | `#C4B5FD` | `#7C3AED` | `#FEF2F2` | `#EF4444` |
| P5 | `#F5F3FF` + borda `#C084FC` | `#C084FC` | — | N/A (fill) |

---

## 15. Possíveis Próximos Passos / Backlog

- Criar **P6** ou melhorias nos poderes existentes conforme necessidade
- **Penalidade por erro** — sistema ainda pode ser refinado
- **Suporte a temas** (dark mode)
- Internacionalização além de PT
- Performance: `renderHighlights` é chamado muitas vezes; possível otimizar com dirty-flag

---

## 16. Checklist de Deploy

```
[ ] Modificou app.js / style.css / index.html / sudoku-generator.js ?
[ ] Bumped CACHE em sw.js?          (sudoku-vNN → vNN+1)
[ ] Bumped build comment em sw.js?  (build:YYYYMMDD-NN)
[ ] Bumped versão em index.html?    (v1.NN → v1.NN+1)
[ ] git add + git commit com mensagem descritiva
[ ] git push -u origin claude/fix-error-penalty-system-gtM3d
```
