/* app.js — Sudoku PWA  |  Lógica principal */
'use strict';

/* ═══════════════════════════════════════
   ESTADO GLOBAL
═══════════════════════════════════════ */
const STATE = {
  puzzle:      null,   // number[9][9]  — tabuleiro atual (0 = vazio)
  solution:    null,   // number[9][9]  — resposta completa
  givens:      null,   // Set<string>   — "r,c" das células imutáveis
  notes:       null,   // Set[9][9]     — rascunhos por célula

  selectedRow: -1,
  selectedCol: -1,
  notesMode:   false,
  fillNotes:   false,
  pinnedNum:   0,

  difficulty: '',
  errors:     0,
  score:      0,

  timerSeconds:  0,
  timerInterval: null,
  timerRunning:  false,
  paused:        false,

  undoStack: [],
  undoCount: 0,

  simulator: {
    active:      false,
    undoStart:   0,
    placements:  new Map(),
    nextSeq:     0,
    savedPuzzle: null,
    savedNotes:  null,
    savedErrors: 0,
    savedScore:  0,
  },

  analysis: {
    /* Únicas (Naked Singles) */
    singlesActive:  false,
    singles:        [],        // [{r, c, val}]

    /* Pares Nus (Naked Pairs/Triples) */
    pairsPhase:     'idle',    // 'idle' | 'selecting' | 'ready'
    pairCells:      [],        // [{r, c}]
    pairTarget:     null,      // Set — anotações da 1ª célula
    pairTargetCount: 0,        // N células necessárias
    pairAffected:   [],        // [{r, c, nums: Set}]

    /* Par Apontador (Pointing Pairs) */
    pointingPhase:     'idle',
    pointingCells:     [],
    pointingAffected:  [],
    pointingCondition: true,

    /* X-Wing */
    xwingActive:   false,
    xwings:        [],   // [{num, cells:[{r,c}×4], targets:[{r,c}]}]

    /* Y-Wing */
    ywingActive:   false,
    ywings:        [],   // [{pivot:{r,c}, pincers:[{r,c}×2], targets:[{r,c}], elimVal}]
  },

  settings: {
    markErrors:          true,
    failOnErrors:        false,
    maxErrors:           3,
    autoRemoveNotes:     true,
    enhancedHighlight:   true,
    autoAnnotations:     false,
    simulatorMode:       false,
    enableNakedSingles:  true,
    enableNakedPairs:    true,
    enablePointingPairs: true,
    enableXWing:         true,
    enableYWing:         true,
  },
};

/* Cache dos elementos DOM do tabuleiro */
let cellElements = [];  // [9][9]
let _numpadPressTimer  = null;
let _numpadLongPressed = false;

/* ═══════════════════════════════════════
   CONSTANTES
═══════════════════════════════════════ */
const DIFF_NAMES = {
  facil:        'Fácil',
  medio:        'Médio',
  dificil:      'Difícil',
  especialista: 'Especialista',
  mestre:       'Mestre',
  extremo:      'Extremo',
};

/* ═══════════════════════════════════════
   INICIALIZAÇÃO
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  buildNumpad();
  attachEvents();
  syncSettingsUI();
  checkIOSBanner();
  checkSavedSession();
});

/* Salva sessão em múltiplos eventos para garantir persistência */
window.addEventListener('beforeunload', () => {
  if (STATE.puzzle) saveSession();
});
window.addEventListener('pagehide', () => {
  if (STATE.puzzle) saveSession();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && STATE.puzzle) saveSession();
});

function buildNumpad() {
  const pad = document.getElementById('numpad');
  pad.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement('button');
    btn.className = 'num-btn';
    btn.dataset.num = n;
    btn.textContent = n;
    pad.appendChild(btn);
  }
}

/* ═══════════════════════════════════════
   EVENTOS
═══════════════════════════════════════ */
function attachEvents() {
  /* Dificuldade */
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => requestNewGame(btn.dataset.diff));
  });

  /* Aviso novo jogo */
  document.getElementById('btn-warn-confirm').addEventListener('click', () => {
    const diff = STATE._pendingDiff;
    closeAllModals();
    if (diff) startGame(diff);
    STATE._pendingDiff = null;
  });
  document.getElementById('btn-warn-cancel').addEventListener('click', () => {
    closeAllModals();
    STATE._pendingDiff = null;
  });

  /* Voltar */
  document.getElementById('btn-back').addEventListener('click', () => {
    if (STATE.puzzle && STATE.timerRunning) saveSession();
    stopTimer();
    showDifficultyScreen();
  });

  /* Sessão salva */
  document.getElementById('btn-resume').addEventListener('click', resumeSession);
  document.getElementById('btn-discard').addEventListener('click', () => {
    clearSession();
    document.getElementById('session-resume').classList.add('hidden');
  });

  /* Ranking (home) */
  document.getElementById('btn-ranking-home').addEventListener('click', () => {
    openRanking();
  });

  /* Configurações (home e jogo) */
  document.getElementById('btn-settings-home').addEventListener('click', openSettings);
  document.getElementById('btn-settings-game').addEventListener('click', openSettings);

  /* Controles do jogo */
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-undo').addEventListener('click', handleUndo);
  document.getElementById('btn-erase').addEventListener('click', handleErase);
  document.getElementById('btn-notes').addEventListener('click', toggleNotesMode);
  document.getElementById('btn-fill').addEventListener('click', handleFill);
  document.getElementById('btn-sim').addEventListener('click', () => {
    if (!STATE.puzzle || STATE.paused) return;
    if (STATE.simulator.active) deactivateSimulator();
    else activateSimulator();
  });

  document.getElementById('btn-singles').addEventListener('click', () => {
    if (!STATE.puzzle || STATE.paused) return;
    toggleSingles();
  });

  document.getElementById('btn-xwing').addEventListener('click', () => {
    if (!STATE.puzzle || STATE.paused) return;
    toggleXWing();
  });

  document.getElementById('btn-ywing').addEventListener('click', () => {
    if (!STATE.puzzle || STATE.paused) return;
    toggleYWing();
  });

  document.getElementById('btn-action-confirm').addEventListener('click', handleActionConfirm);
  document.getElementById('btn-action-cancel').addEventListener('click', handleActionCancel);

  /* Tabuleiro — clique e long-press */
  attachBoardLongPress();
  document.getElementById('board').addEventListener('click', e => {
    const cell = e.target.closest('[data-row]');
    if (!cell) return;
    if (_cellLongPressed) { _cellLongPressed = false; return; }
    handleCellClick(+cell.dataset.row, +cell.dataset.col);
  });

  /* Numpad (delegação) — clique normal; long-press é tratado em attachNumpadLongPress */
  document.getElementById('numpad').addEventListener('click', e => {
    const btn = e.target.closest('[data-num]');
    if (!btn) return;
    if (_numpadLongPressed) { _numpadLongPressed = false; return; }
    handleNumberInput(+btn.dataset.num);
  });
  attachNumpadLongPress();

  /* Fechar modal ao clicar no overlay (mas não no sheet) */
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeAllModals();
  });

  /* Configurações */
  setupSettingsEvents();

  /* Modais de resultado */
  document.getElementById('btn-new-game-victory').addEventListener('click', restartGame);
  document.getElementById('btn-retry-victory').addEventListener('click', showDifficultyScreen);
  document.getElementById('btn-retry-gameover').addEventListener('click', restartGame);
  document.getElementById('btn-new-game-gameover').addEventListener('click', showDifficultyScreen);

  /* Tabs do ranking */
  document.getElementById('rank-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.rank-tab');
    if (!tab) return;
    document.querySelectorAll('.rank-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    renderRankingTable(tab.dataset.diff);
  });

  /* iOS banner */
  document.getElementById('ios-banner-close').addEventListener('click', () => {
    document.getElementById('ios-banner').classList.add('hidden');
    localStorage.setItem('ios-banner-dismissed', '1');
  });

  /* Botão de atualização: salva sessão e recarrega */
  document.getElementById('btn-update').addEventListener('click', () => {
    if (STATE.puzzle && STATE.timerRunning) saveSession();
    window.location.reload();
  });

  /* Teclado */
  document.addEventListener('keydown', handleKeyboard);
}

function setupSettingsEvents() {
  const keys = ['markErrors', 'failOnErrors', 'autoRemoveNotes', 'enhancedHighlight', 'autoAnnotations', 'simulatorMode', 'enableNakedSingles', 'enableNakedPairs', 'enablePointingPairs', 'enableXWing', 'enableYWing'];
  keys.forEach(key => {
    const el = document.getElementById('cfg-' + key);
    if (!el) return;
    el.addEventListener('change', () => {
      STATE.settings[key] = el.checked;
      saveSettings();
      if (key === 'failOnErrors') {
        document.getElementById('max-errors-row').classList.toggle('hidden', !el.checked);
      }
      if (key === 'markErrors' || key === 'enhancedHighlight') {
        if (STATE.puzzle) renderBoard();
      }
      if (key === 'autoAnnotations' && el.checked && STATE.puzzle) {
        applyAutoAnnotations();
      }
      if (key === 'simulatorMode') {
        updateControlsForSimMode();
      }
      if (['enableNakedSingles', 'enableXWing', 'enableYWing'].includes(key)) {
        updateAnalysisToolsVisibility();
      }
    });
  });

  document.getElementById('btn-err-dec').addEventListener('click', () => {
    STATE.settings.maxErrors = Math.max(1, STATE.settings.maxErrors - 1);
    document.getElementById('max-errors-val').textContent = STATE.settings.maxErrors;
    saveSettings();
  });
  document.getElementById('btn-err-inc').addEventListener('click', () => {
    STATE.settings.maxErrors = Math.min(10, STATE.settings.maxErrors + 1);
    document.getElementById('max-errors-val').textContent = STATE.settings.maxErrors;
    saveSettings();
  });
}

/* ═══════════════════════════════════════
   CICLO DO JOGO
═══════════════════════════════════════ */
function startGame(difficulty) {
  STATE.difficulty = difficulty;
  showLoading(true);

  /* Geração em macrotask para não travar a UI */
  setTimeout(() => {
    const { puzzle, solution } = SudokuGenerator.generate(difficulty);

    STATE.puzzle    = puzzle;
    STATE.solution  = solution;
    STATE.givens    = new Set();
    STATE.notes     = Array.from({ length: 9 }, () =>
                        Array.from({ length: 9 }, () => new Set())
                      );
    STATE.errors     = 0;
    STATE.score      = 0;
    STATE.undoStack  = [];
    STATE.undoCount  = 0;
    STATE.paused     = false;
    STATE.selectedRow = -1;
    STATE.selectedCol = -1;
    STATE.notesMode  = false;
    STATE.fillNotes  = false;
    STATE.pinnedNum  = 0;
    STATE.simulator  = {
      active: false, undoStart: 0, placements: new Map(), nextSeq: 0,
      savedPuzzle: null, savedNotes: null, savedErrors: 0, savedScore: 0,
    };
    resetAnalysis();

    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (puzzle[r][c] !== 0) STATE.givens.add(`${r},${c}`);

    STATE.timerSeconds = 0;
    updateTimerDisplay();
    stopTimer();
    startTimer();

    renderBoard();
    renderNumpad();
    updateNotesBtn();
    updateScoreDisplay();
    updateErrorDisplay();
    updateBestScore();
    updateProgressBar();

    document.getElementById('difficulty-badge').textContent = DIFF_NAMES[difficulty];

    updateFillBtn();
    updateSimBtn();
    updateControlsForSimMode();
    updateAnalysisToolsVisibility();
    if (STATE.settings.autoAnnotations) applyAutoAnnotations();

    showLoading(false);
    showGameScreen();
  }, 30);
}

function restartGame() {
  closeAllModals();
  startGame(STATE.difficulty);
}

function requestNewGame(diff) {
  if (STATE.puzzle && STATE.timerRunning) {
    STATE._pendingDiff = diff;
    openModal('modal-newgame-warn');
  } else {
    startGame(diff);
  }
}

function endGame(won) {
  stopTimer();
  clearSession();
  STATE.score = calculateScore();
  updateScoreDisplay();

  if (won) {
    celebrateVictory();
    const rankPos = saveToRanking();
    document.getElementById('v-score').textContent  = STATE.score.toLocaleString('pt-BR');
    document.getElementById('v-time').textContent   = formatTime(STATE.timerSeconds);
    document.getElementById('v-errors').textContent = STATE.errors;
    document.getElementById('victory-diff-label').textContent =
      `Puzzle ${DIFF_NAMES[STATE.difficulty]} concluído`;
    document.getElementById('v-rank-info').textContent =
      rankPos ? `Você ficou em ${rankPos}º lugar no ranking!` : 'Pontuação salva no ranking!';
    setTimeout(() => openModal('modal-victory'), 1500);
  } else {
    document.getElementById('go-time').textContent   = formatTime(STATE.timerSeconds);
    document.getElementById('go-errors').textContent = STATE.errors;
    document.getElementById('gameover-reason').textContent =
      `Atingiu ${STATE.settings.maxErrors} erros — ${DIFF_NAMES[STATE.difficulty]}`;
    openModal('modal-gameover');
  }
}

/* ═══════════════════════════════════════
   RENDERIZAÇÃO DO TABULEIRO
═══════════════════════════════════════ */
function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  cellElements = [];

  for (let r = 0; r < 9; r++) {
    cellElements[r] = [];
    for (let c = 0; c < 9; c++) {
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.row = r;
      el.dataset.col = c;
      board.appendChild(el);
      cellElements[r][c] = el;
      updateCellContent(r, c);
    }
  }

  renderHighlights();
  updateProgressBar();
}

function updateCellContent(r, c) {
  const el      = cellElements[r][c];
  const val     = STATE.puzzle[r][c];
  const isGiven = STATE.givens.has(`${r},${c}`);
  const noteSet = STATE.notes[r][c];
  const key     = `${r},${c}`;

  el.className = 'cell';

  if (isGiven) {
    el.classList.add('given');
  } else if (STATE.simulator.active && STATE.simulator.placements.has(key)) {
    /* Célula colocada no simulador */
    const seq = STATE.simulator.placements.get(key);
    el.classList.add('sim-placed');
    el.classList.add(seq % 2 === 1 ? 'sim-blue' : 'sim-red');
  } else if (val !== 0) {
    if (STATE.settings.markErrors && val !== STATE.solution[r][c]) {
      el.classList.add('error');
    }
  }

  if (val !== 0) {
    el.textContent = val;
  } else if (noteSet.size > 0) {
    el.innerHTML = buildNotesHTML(noteSet);
  } else {
    el.textContent = '';
  }
}

function buildNotesHTML(noteSet) {
  let html = '<div class="notes-grid">';
  for (let n = 1; n <= 9; n++) {
    const active = noteSet.has(n);
    html += `<span class="note-digit${active ? ' active' : ''}" data-note="${n}">${active ? n : ''}</span>`;
  }
  html += '</div>';
  return html;
}

function renderHighlights() {
  /* Guard: tabuleiro não renderizado ou puzzle não iniciado */
  if (!cellElements.length || !cellElements[0] || !STATE.puzzle) return;

  const { selectedRow: sr, selectedCol: sc, puzzle, settings } = STATE;

  /* Limpa todos os destaques (células e notas) */
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      cellElements[r][c].classList.remove(
        'selected', 'same-num', 'highlight-sel', 'highlight-match', 'sim-conflict'
      );
  document.querySelectorAll('.note-digit.note-match').forEach(s => s.classList.remove('note-match'));

  /* Aplica destaques do número fixado por long-press (sempre, mesmo sem seleção) */
  if (STATE.pinnedNum > 0) {
    const pn = STATE.pinnedNum;
    const pinRows = new Set(), pinCols = new Set(), pinBoxes = new Set();
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (puzzle[r][c] === pn) {
          cellElements[r][c].classList.add('same-num');
          pinRows.add(r); pinCols.add(c);
          pinBoxes.add(Math.floor(r / 3) * 3 + Math.floor(c / 3));
        }
    /* Zona da seleção aprimorada para número fixado */
    if (settings.enhancedHighlight && (pinRows.size || pinCols.size || pinBoxes.size)) {
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++) {
          if (puzzle[r][c] === pn) continue;
          const el = cellElements[r][c];
          if (el.classList.contains('same-num') || el.classList.contains('selected')) continue;
          const boxIdx = Math.floor(r / 3) * 3 + Math.floor(c / 3);
          if (pinRows.has(r) || pinCols.has(c) || pinBoxes.has(boxIdx))
            el.classList.add('highlight-match');
        }
    }
    document.querySelectorAll(`.note-digit[data-note="${pn}"].active`)
      .forEach(s => s.classList.add('note-match'));
  }

  /* Se nenhuma célula selecionada, só o pinned importa */
  if (sr < 0) {
    if (STATE.simulator.active) renderSimConflicts();
    return;
  }

  const selVal  = puzzle[sr][sc];
  const selBox  = Math.floor(sr / 3) * 3 + Math.floor(sc / 3);

  if (settings.enhancedHighlight && selVal > 0) {
    /* ── Seleção Aprimorada ──
       Célula selecionada → azul médio
       Outras ocorrências do número → verde médio
       Zona da selecionada (linha/col/quad) → azul claro
       Zonas das ocorrências → verde claro
       Prioridade: azul sempre sobrepõe verde */

    const matchRows  = new Set();
    const matchCols  = new Set();
    const matchBoxes = new Set();

    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (puzzle[r][c] === selVal && !(r === sr && c === sc)) {
          matchRows.add(r);
          matchCols.add(c);
          matchBoxes.add(Math.floor(r / 3) * 3 + Math.floor(c / 3));
        }

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const el     = cellElements[r][c];
        const boxIdx = Math.floor(r / 3) * 3 + Math.floor(c / 3);

        if (r === sr && c === sc) {
          el.classList.add('selected');
        } else if (puzzle[r][c] === selVal) {
          el.classList.add('same-num');
        } else {
          const inSelZone   = r === sr || c === sc || boxIdx === selBox;
          const inMatchZone = matchRows.has(r) || matchCols.has(c) || matchBoxes.has(boxIdx);
          /* Azul tem prioridade sobre verde */
          if (inSelZone)        el.classList.add('highlight-sel');
          else if (inMatchZone) el.classList.add('highlight-match');
        }
      }
    }
  } else {
    /* ── Seleção padrão: linha, coluna e quadrante da célula selecionada ── */
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const el     = cellElements[r][c];
        const boxIdx = Math.floor(r / 3) * 3 + Math.floor(c / 3);

        if (r === sr && c === sc) {
          el.classList.add('selected');
        } else if (selVal > 0 && puzzle[r][c] === selVal) {
          el.classList.add('same-num');
        } else if (r === sr || c === sc || boxIdx === selBox) {
          el.classList.add('highlight-sel');
        }
      }
    }
  }

  /* ── Destaca dígitos de anotação que coincidem com o número selecionado ── */
  if (selVal > 0) {
    document.querySelectorAll(`.note-digit[data-note="${selVal}"].active`)
      .forEach(s => s.classList.add('note-match'));
  }

  /* ── Conflitos no modo simulador ── */
  if (STATE.simulator.active) renderSimConflicts();

  /* ── Destaques de análise ── */
  renderAnalysisHighlights();
}

function renderNumpad() {
  /* Conta quantas vezes cada dígito aparece no puzzle */
  const count = new Array(10).fill(0);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (STATE.puzzle[r][c]) count[STATE.puzzle[r][c]]++;

  const selVal = (STATE.selectedRow >= 0) ? STATE.puzzle[STATE.selectedRow][STATE.selectedCol] : 0;

  document.querySelectorAll('.num-btn').forEach(btn => {
    const n = +btn.dataset.num;
    const done = count[n] >= 9;
    btn.textContent = done ? '✓' : n;
    btn.classList.toggle('done', done);
    btn.classList.toggle('selected-num', n === selVal && selVal > 0 && !done);
    btn.classList.toggle('pinned', n === STATE.pinnedNum && STATE.pinnedNum > 0 && !done);
  });
}

/* ═══════════════════════════════════════
   INPUT DO USUÁRIO
═══════════════════════════════════════ */
function handleCellClick(r, c) {
  if (STATE.paused) return;
  if (STATE.selectedRow === r && STATE.selectedCol === c) {
    /* Clique na mesma célula: deseleciona */
    STATE.selectedRow = -1;
    STATE.selectedCol = -1;
  } else {
    STATE.selectedRow = r;
    STATE.selectedCol = c;
  }
  renderHighlights();
  renderNumpad();
}

function handleNumberInput(num) {
  if (STATE.paused) return;
  const { selectedRow: r, selectedCol: c } = STATE;
  if (r < 0) return;
  if (STATE.givens.has(`${r},${c}`)) return;

  /* Célula já correta não pode ser editada (só desfazer pode reverter) */
  if (!STATE.simulator.active &&
      STATE.puzzle[r][c] !== 0 &&
      STATE.puzzle[r][c] === STATE.solution[r][c]) return;

  if (STATE.notesMode && num !== 0) {
    doToggleNote(r, c, num);
  } else {
    doPlaceNumber(r, c, num);
  }
}

function doPlaceNumber(r, c, num) {
  pushUndo();
  STATE.puzzle[r][c] = num;
  const key = `${r},${c}`;

  /* ── Modo Simulador ── */
  if (STATE.simulator.active) {
    if (num !== 0) {
      /* Mantém o nº de sequência original se a célula já foi colocada */
      if (!STATE.simulator.placements.has(key)) {
        STATE.simulator.placements.set(key, ++STATE.simulator.nextSeq);
      }
    } else {
      STATE.simulator.placements.delete(key);
    }
    if (num !== 0 && STATE.settings.autoRemoveNotes) removeRelatedNotes(r, c, num);
    updateCellContent(r, c);
    renderHighlights();
    renderNumpad();
    updateProgressBar();
    return;   /* sem erros, sem pontos, sem checkWin */
  }

  /* ── Modo Normal ── */
  const isError = num !== 0 && num !== STATE.solution[r][c];
  if (isError) {
    STATE.errors++;
    updateErrorDisplay();
  } else if (num !== 0) {
    STATE.score += calculateCellPoints();
    updateScoreDisplay();
  }
  if (num !== 0 && STATE.settings.autoRemoveNotes) removeRelatedNotes(r, c, num);
  updateCellContent(r, c);
  renderHighlights();
  renderNumpad();
  updateProgressBar();
  if (isError) {
    shakeCell(r, c);
    if (STATE.settings.failOnErrors && STATE.errors >= STATE.settings.maxErrors) {
      setTimeout(() => endGame(false), 400);
      return;
    }
  } else if (num !== 0) {
    correctPop(r, c);
    setTimeout(() => checkCompletions(r, c), 80);
    let count = 0;
    for (let rr = 0; rr < 9; rr++)
      for (let cc = 0; cc < 9; cc++)
        if (STATE.puzzle[rr][cc] === num) count++;
    if (count === 9) setTimeout(() => celebrateDigit(num), 80);
  }
  checkWin();
}

function doToggleNote(r, c, num) {
  if (STATE.puzzle[r][c] !== 0) return;
  pushUndo();
  const notes = STATE.notes[r][c];
  if (notes.has(num)) notes.delete(num); else notes.add(num);
  updateCellContent(r, c);
  renderHighlights(); /* re-aplica classes de seleção/destaque na célula */
}

function handleUndo() {
  if (!STATE.undoStack.length) return;
  /* Em modo simulador: não pode desfazer além do ponto de ativação */
  if (STATE.simulator.active && STATE.undoStack.length <= STATE.simulator.undoStart) return;

  const snap = STATE.undoStack.pop();
  STATE.puzzle = snap.puzzle;
  STATE.notes  = snap.notes;
  /* STATE.errors NÃO é restaurado — erros são permanentes e acumulativos */
  STATE.score  = snap.score;
  STATE.undoCount++;

  /* Restaura placements + nextSeq do simulador — garante alternância de cor correta */
  if (snap.simPlacements !== null) {
    STATE.simulator.placements = snap.simPlacements;
    STATE.simulator.nextSeq    = snap.simNextSeq;
  }

  updateErrorDisplay();
  updateScoreDisplay();
  renderBoard();
  renderNumpad();
  updateProgressBar();
}

function handleKeyboard(e) {
  if (e.target.tagName === 'INPUT') return;
  const { selectedRow: r, selectedCol: c } = STATE;

  if (e.key === 'ArrowUp'    && r > 0) { STATE.selectedRow--; renderHighlights(); renderNumpad(); return; }
  if (e.key === 'ArrowDown'  && r < 8) { STATE.selectedRow++; renderHighlights(); renderNumpad(); return; }
  if (e.key === 'ArrowLeft'  && c > 0) { STATE.selectedCol--; renderHighlights(); renderNumpad(); return; }
  if (e.key === 'ArrowRight' && c < 8) { STATE.selectedCol++; renderHighlights(); renderNumpad(); return; }
  if (e.key >= '1' && e.key <= '9')    { handleNumberInput(+e.key); return; }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { handleNumberInput(0); return; }
  if (e.key.toLowerCase() === 'n') { toggleNotesMode(); return; }
  if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) { handleUndo(); return; }
}

/* ═══════════════════════════════════════
   LÓGICA DO JOGO
═══════════════════════════════════════ */
function checkWin() {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (STATE.puzzle[r][c] !== STATE.solution[r][c]) return;
  setTimeout(() => endGame(true), 600);
}

/* Pontuação acumulativa: cada número correto vale pontos que decrescem com o tempo.
   Não há penalidade por tempo decorrido — pressão vem naturalmente dos pontos menores.
   Erros custam: o jogador perde o tempo gasto (pontos menores) e precisa desfazer. */
function calculateCellPoints() {
  const multiplier = SudokuGenerator.getMultiplier(STATE.difficulty);
  /* 100 pts no início, diminui 1pt a cada 3s, mínimo 5 pts */
  const base = Math.max(5, 100 - Math.floor(STATE.timerSeconds / 3));
  return Math.round(base * multiplier);
}

function calculateScore() {
  return STATE.score; /* score já é acumulativo — sem recálculo */
}

function removeRelatedNotes(r, c, num) {
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let i = 0; i < 9; i++) {
    if (STATE.notes[r][i].has(num)) { STATE.notes[r][i].delete(num); updateCellContent(r, i); }
    if (STATE.notes[i][c].has(num)) { STATE.notes[i][c].delete(num); updateCellContent(i, c); }
  }
  for (let rr = br; rr < br + 3; rr++)
    for (let cc = bc; cc < bc + 3; cc++)
      if (STATE.notes[rr][cc].has(num)) { STATE.notes[rr][cc].delete(num); updateCellContent(rr, cc); }
}

function applyAutoAnnotations() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (STATE.puzzle[r][c] !== 0) continue;
      const candidates = new Set();
      for (let n = 1; n <= 9; n++) {
        if (isCandidateValid(r, c, n)) candidates.add(n);
      }
      STATE.notes[r][c] = candidates;
    }
  }
  renderBoard();
}

function isCandidateValid(r, c, n) {
  for (let i = 0; i < 9; i++) {
    if (STATE.puzzle[r][i] === n) return false;
    if (STATE.puzzle[i][c] === n) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++)
    for (let cc = bc; cc < bc + 3; cc++)
      if (STATE.puzzle[rr][cc] === n) return false;
  return true;
}

/* ═══════════════════════════════════════
   UNDO
═══════════════════════════════════════ */
function pushUndo() {
  STATE.undoStack.push({
    puzzle:         STATE.puzzle.map(row => [...row]),
    notes:          STATE.notes.map(row => row.map(set => new Set(set))),
    score:          STATE.score,
    simPlacements:  STATE.simulator.active ? new Map(STATE.simulator.placements) : null,
    simNextSeq:     STATE.simulator.active ? STATE.simulator.nextSeq : 0,
  });
  /* Sem limite — máx. 81 ações por puzzle, memória desprezível */
}

/* ═══════════════════════════════════════
   TIMER
═══════════════════════════════════════ */
function togglePause() {
  if (!STATE.puzzle) return;
  STATE.paused = !STATE.paused;
  const overlay = document.getElementById('pause-overlay');
  const btn     = document.getElementById('btn-pause');
  if (STATE.paused) {
    stopTimer();
    overlay.classList.remove('hidden');
    btn.textContent = '▶ Continuar';
    btn.title = 'Continuar';
  } else {
    overlay.classList.add('hidden');
    btn.textContent = '⏸';
    btn.title = 'Pausar';
    startTimer();
  }
}

function startTimer() {
  STATE.timerRunning  = true;
  STATE.timerInterval = setInterval(() => {
    STATE.timerSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  clearInterval(STATE.timerInterval);
  STATE.timerRunning = false;
}

function updateTimerDisplay() {
  document.getElementById('timer-val').textContent = formatTime(STATE.timerSeconds);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/* ═══════════════════════════════════════
   SESSÃO SALVA
═══════════════════════════════════════ */
function saveSession() {
  if (!STATE.puzzle) return;
  const session = {
    puzzle:       STATE.puzzle,
    solution:     STATE.solution,
    givens:       [...STATE.givens],
    notes:        STATE.notes.map(row => row.map(s => [...s])),
    difficulty:   STATE.difficulty,
    errors:       STATE.errors,
    score:        STATE.score,
    timerSeconds: STATE.timerSeconds,
    notesMode:    STATE.notesMode,
    undoCount:    STATE.undoCount,
  };
  localStorage.setItem('sudoku-session', JSON.stringify(session));
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem('sudoku-session') || 'null'); }
  catch { return null; }
}

function clearSession() {
  localStorage.removeItem('sudoku-session');
}

function checkSavedSession() {
  const s = loadSession();
  const card = document.getElementById('session-resume');
  if (!s) { card.classList.add('hidden'); return; }
  document.getElementById('session-info').textContent =
    `${DIFF_NAMES[s.difficulty] || s.difficulty} · ${formatTime(s.timerSeconds)} · ${s.errors} erro(s)`;
  card.classList.remove('hidden');
}

function resumeSession() {
  const s = loadSession();
  if (!s) return;
  clearSession();

  STATE.puzzle       = s.puzzle;
  STATE.solution     = s.solution;
  STATE.givens       = new Set(s.givens);
  STATE.notes        = s.notes.map(row => row.map(arr => new Set(arr)));
  STATE.difficulty   = s.difficulty;
  STATE.errors       = s.errors;
  STATE.score        = s.score;
  STATE.timerSeconds = s.timerSeconds;
  STATE.notesMode    = s.notesMode || false;
  STATE.selectedRow  = -1;
  STATE.selectedCol  = -1;
  STATE.undoStack    = [];
  STATE.undoCount    = s.undoCount || 0;
  STATE.paused       = false;
  STATE.fillNotes    = false;
  STATE.pinnedNum    = 0;
  STATE.simulator    = {
    active: false, undoStart: 0, placements: new Map(), nextSeq: 0,
    savedPuzzle: null, savedNotes: null, savedErrors: 0, savedScore: 0,
  };

  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('btn-pause').textContent = '⏸';
  document.getElementById('btn-pause').title = 'Pausar';
  document.getElementById('session-resume').classList.add('hidden');
  document.getElementById('difficulty-badge').textContent = DIFF_NAMES[s.difficulty];

  updateTimerDisplay();
  stopTimer();
  startTimer();
  renderBoard();
  renderNumpad();
  updateNotesBtn();
  updateScoreDisplay();
  updateErrorDisplay();
  updateBestScore();
  updateProgressBar();
  updateFillBtn();
  updateSimBtn();
  updateControlsForSimMode();
  resetAnalysis();
  updateAnalysisToolsVisibility();
  showGameScreen();
}

/* ═══════════════════════════════════════
   RANKING / PERSISTÊNCIA
═══════════════════════════════════════ */
function loadRanking() {
  try { return JSON.parse(localStorage.getItem('sudoku-ranking') || '[]'); }
  catch { return []; }
}

function saveToRanking() {
  const ranking = loadRanking();
  const entry = {
    difficulty:  STATE.difficulty,
    score:       STATE.score,
    timeSeconds: STATE.timerSeconds,
    errors:      STATE.errors,
    date:        new Date().toISOString(),
  };
  ranking.push(entry);

  /* Top 20 por dificuldade */
  const filtered = ranking
    .filter(e => e.difficulty === STATE.difficulty)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  const others = ranking.filter(e => e.difficulty !== STATE.difficulty);
  const merged = [...others, ...filtered].sort((a, b) => b.score - a.score);
  localStorage.setItem('sudoku-ranking', JSON.stringify(merged));

  const pos = filtered.findIndex(e => e === entry || (
    e.score === entry.score && e.timeSeconds === entry.timeSeconds
  )) + 1;
  return pos || null;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('sudoku-settings') || '{}');
    Object.assign(STATE.settings, saved);
  } catch { /* usa defaults */ }
}

function saveSettings() {
  localStorage.setItem('sudoku-settings', JSON.stringify(STATE.settings));
}

/* ═══════════════════════════════════════
   UI — MODAIS / TELAS
═══════════════════════════════════════ */
function showDifficultyScreen() {
  closeAllModals();
  document.getElementById('screen-game').classList.remove('active');
  document.getElementById('screen-difficulty').classList.add('active');
  checkSavedSession();
}

function showGameScreen() {
  document.getElementById('screen-difficulty').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
}

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

function openModal(id) {
  const overlay = document.getElementById('modal-overlay');
  /* Oculta todos os sheets */
  overlay.querySelectorAll('.modal-sheet').forEach(s => s.classList.add('hidden'));
  /* Mostra o pedido */
  document.getElementById(id).classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function closeAllModals() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-overlay')
    .querySelectorAll('.modal-sheet').forEach(s => s.classList.add('hidden'));
}

function openSettings() {
  syncSettingsUI();
  openModal('modal-settings');
}

function openRanking() {
  buildRankingTabs();
  const first = SudokuGenerator.getDifficultyList()[0];
  renderRankingTable(first);
  openModal('modal-ranking');
}

function buildRankingTabs() {
  const tabs = document.getElementById('rank-tabs');
  tabs.innerHTML = '';
  SudokuGenerator.getDifficultyList().forEach((d, i) => {
    const tab = document.createElement('button');
    tab.className = 'rank-tab' + (i === 0 ? ' active' : '');
    tab.dataset.diff = d;
    tab.textContent = DIFF_NAMES[d];
    tabs.appendChild(tab);
  });
}

function renderRankingTable(diff) {
  const all    = loadRanking().filter(e => e.difficulty === diff);
  const sorted = all.sort((a, b) => b.score - a.score).slice(0, 10);
  const tbody  = document.getElementById('rank-tbody');

  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="rank-empty">Sem registros ainda</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map((e, i) => {
    const pos = i + 1;
    const posClass = pos === 1 ? 'gold' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : '';
    const date = new Date(e.date).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
    return `<tr>
      <td class="rank-pos ${posClass}">${pos}</td>
      <td class="rank-score">${e.score}</td>
      <td>${formatTime(e.timeSeconds)}</td>
      <td>${e.errors}</td>
      <td>${date}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════
   UI — CONTROLES
═══════════════════════════════════════ */
function toggleNotesMode() {
  STATE.notesMode = !STATE.notesMode;
  updateNotesBtn();
}

function updateNotesBtn() {
  const btn = document.getElementById('btn-notes');
  btn.classList.toggle('active-mode', STATE.notesMode);
  document.getElementById('notes-mode-tag').textContent = STATE.notesMode ? 'ON' : 'OFF';
}

function updateScoreDisplay() {
  document.getElementById('score-val').textContent =
    STATE.score.toLocaleString('pt-BR');
}

function updateBestScore() {
  const all = loadRanking().filter(e => e.difficulty === STATE.difficulty);
  const best = all.length ? Math.max(...all.map(e => e.score)) : 0;
  document.getElementById('best-score-val').textContent =
    best.toLocaleString('pt-BR');
}

function updateErrorDisplay() {
  const failOn = STATE.settings.failOnErrors;
  /* Contador de erros só aparece quando a opção "Reprovar após X erros" está ativa */
  document.getElementById('ghdr-stat-err').classList.toggle('hidden', !failOn);
  document.getElementById('ghdr-sep-err').classList.toggle('hidden', !failOn);
  const badge = document.getElementById('error-badge');
  badge.textContent = `${STATE.errors}/${STATE.settings.maxErrors}`;
  badge.classList.toggle('has-errors', STATE.errors > 0);
}

/* ═══════════════════════════════════════
   MODO SIMULADOR
═══════════════════════════════════════ */
function activateSimulator() {
  if (STATE.paused || !STATE.puzzle) return;
  STATE.simulator.active      = true;
  STATE.simulator.undoStart   = STATE.undoStack.length;
  STATE.simulator.placements  = new Map();
  STATE.simulator.nextSeq     = 0;
  STATE.simulator.savedPuzzle = STATE.puzzle.map(row => [...row]);
  STATE.simulator.savedNotes  = STATE.notes.map(row => row.map(s => new Set(s)));
  STATE.simulator.savedErrors = STATE.errors;
  STATE.simulator.savedScore  = STATE.score;
  updateSimBtn();
  renderBoard();
  renderHighlights();
}

function deactivateSimulator() {
  /* Restaura exatamente o estado anterior à ativação */
  STATE.puzzle = STATE.simulator.savedPuzzle;
  STATE.notes  = STATE.simulator.savedNotes;
  STATE.errors = STATE.simulator.savedErrors;
  STATE.score  = STATE.simulator.savedScore;
  /* Descarta snapshots de undo criados dentro do simulador */
  STATE.undoStack.length = STATE.simulator.undoStart;

  STATE.simulator.active     = false;
  STATE.simulator.placements = new Map();
  STATE.simulator.nextSeq    = 0;

  updateSimBtn();
  renderBoard();
  renderNumpad();
  updateErrorDisplay();
  updateScoreDisplay();
  updateProgressBar();
}

function updateSimBtn() {
  const btn = document.getElementById('btn-sim');
  if (!btn) return;
  btn.classList.toggle('sim-active', STATE.simulator.active);
  const tag = document.getElementById('sim-mode-tag');
  if (tag) tag.textContent = STATE.simulator.active ? 'ON' : 'OFF';
}

function updateControlsForSimMode() {
  const eraseBtn = document.getElementById('btn-erase');
  const simBtn   = document.getElementById('btn-sim');
  if (!eraseBtn || !simBtn) return;
  if (STATE.settings.simulatorMode) {
    eraseBtn.classList.add('hidden');
    simBtn.classList.remove('hidden');
  } else {
    eraseBtn.classList.remove('hidden');
    simBtn.classList.add('hidden');
    if (STATE.simulator.active) deactivateSimulator();
  }
}

function renderSimConflicts() {
  /* Para cada célula do simulador, verifica se há duplicata em linha/col/quadrante */
  for (const [key] of STATE.simulator.placements) {
    const [r, c] = key.split(',').map(Number);
    const val = STATE.puzzle[r][c];
    if (!val) continue;
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 9; i++) {
      if (i !== c && STATE.puzzle[r][i] === val) {
        cellElements[r][c].classList.add('sim-conflict');
        cellElements[r][i].classList.add('sim-conflict');
      }
      if (i !== r && STATE.puzzle[i][c] === val) {
        cellElements[r][c].classList.add('sim-conflict');
        cellElements[i][c].classList.add('sim-conflict');
      }
    }
    for (let rr = br; rr < br + 3; rr++)
      for (let cc = bc; cc < bc + 3; cc++)
        if ((rr !== r || cc !== c) && STATE.puzzle[rr][cc] === val) {
          cellElements[r][c].classList.add('sim-conflict');
          cellElements[rr][cc].classList.add('sim-conflict');
        }
  }
}

function handleErase() {
  handleNumberInput(0);
}

/* ── Long-press no numpad para fixar número ── */
function attachNumpadLongPress() {
  const pad = document.getElementById('numpad');

  const startPress = (num) => {
    _numpadLongPressed = false;
    clearTimeout(_numpadPressTimer);
    _numpadPressTimer = setTimeout(() => {
      _numpadLongPressed = true;
      handleNumpadPin(num);
    }, 450);
  };
  const cancelPress = () => {
    clearTimeout(_numpadPressTimer);
    _numpadPressTimer = null;
  };

  pad.addEventListener('touchstart',  e => {
    const btn = e.target.closest('[data-num]');
    if (btn && !btn.classList.contains('done')) startPress(+btn.dataset.num);
  }, { passive: true });
  pad.addEventListener('touchend',    cancelPress, { passive: true });
  pad.addEventListener('touchcancel', cancelPress, { passive: true });
  pad.addEventListener('touchmove',   cancelPress, { passive: true });

  pad.addEventListener('mousedown', e => {
    const btn = e.target.closest('[data-num]');
    if (btn && !btn.classList.contains('done')) startPress(+btn.dataset.num);
  });
  pad.addEventListener('mouseup',    cancelPress);
  pad.addEventListener('mouseleave', cancelPress);
}

function handleNumpadPin(num) {
  STATE.pinnedNum = (STATE.pinnedNum === num) ? 0 : num;
  renderNumpad();
  renderHighlights();
}

function handleFill() {
  if (STATE.paused || !STATE.puzzle) return;
  STATE.fillNotes = !STATE.fillNotes;
  if (STATE.fillNotes) {
    applyAutoAnnotations();
  } else {
    /* Limpa todas as anotações do tabuleiro */
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        STATE.notes[r][c] = new Set();
    renderBoard();
  }
  updateFillBtn();
}

function updateFillBtn() {
  const btn = document.getElementById('btn-fill');
  if (!btn) return;
  btn.classList.toggle('active-mode', STATE.fillNotes);
}

function celebrateVictory() {
  /* Onda diagonal: cada célula recebe classe 'victory-wave' com delay por (r+c) */
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const el = cellElements[r] && cellElements[r][c];
      if (!el) continue;
      const delay = (r + c) * 55;
      setTimeout(() => {
        el.classList.remove('victory-wave');
        void el.offsetWidth;
        el.classList.add('victory-wave');
      }, delay);
    }
  }
}

/* ═══════════════════════════════════════
   FERRAMENTAS DE ANÁLISE
═══════════════════════════════════════ */

/* ─── Variáveis de long-press no tabuleiro ─── */
let _cellLongPressTimer  = null;
let _cellLongPressed     = false;

function attachBoardLongPress() {
  const board = document.getElementById('board');

  const startPress = (r, c) => {
    _cellLongPressed = false;
    clearTimeout(_cellLongPressTimer);
    _cellLongPressTimer = setTimeout(() => {
      _cellLongPressed = true;
      handleCellLongPress(r, c);
    }, 450);
  };
  const cancelPress = () => clearTimeout(_cellLongPressTimer);

  board.addEventListener('touchstart', e => {
    const cell = e.target.closest('[data-row]');
    if (cell) startPress(+cell.dataset.row, +cell.dataset.col);
  }, { passive: true });
  board.addEventListener('touchend',   cancelPress, { passive: true });
  board.addEventListener('touchmove',  cancelPress, { passive: true });
  board.addEventListener('mousedown', e => {
    const cell = e.target.closest('[data-row]');
    if (cell) startPress(+cell.dataset.row, +cell.dataset.col);
  });
  board.addEventListener('mouseup', cancelPress);
}

function handleCellLongPress(r, c) {
  if (STATE.paused || !STATE.puzzle) return;
  if (STATE.puzzle[r][c] !== 0) return;  /* só células com anotações */

  /* Com número fixado no numpad → Par Apontador */
  if (STATE.pinnedNum > 0 && STATE.settings.enablePointingPairs) {
    handlePointingSelect(r, c);
    return;
  }
  /* Sem numpad fixado → Pares Nus */
  if (STATE.settings.enableNakedPairs) {
    handleNakedSelect(r, c);
  }
}

/* ─── Pares Nus (Naked Pairs / Triples) ─── */
function handleNakedSelect(r, c) {
  const an = STATE.analysis;
  const notes = STATE.notes[r][c];

  if (an.pairsPhase === 'idle') {
    if (notes.size < 2) return;
    an.pairsPhase    = 'selecting';
    an.pairTarget    = new Set(notes);
    an.pairTargetCount = notes.size;
    an.pairCells     = [{ r, c }];
    updateActionBar();
    renderAnalysisHighlights();
    return;
  }

  if (an.pairsPhase === 'selecting') {
    /* Mesma célula — cancela */
    if (an.pairCells.some(p => p.r === r && p.c === c)) {
      cancelNakedPair(); return;
    }
    if (!setsEqual(STATE.notes[r][c], an.pairTarget)) {
      cancelNakedPair(); return;
    }
    an.pairCells.push({ r, c });
    if (an.pairCells.length >= an.pairTargetCount) {
      analyzeNakedPair();
    } else {
      updateActionBar();
      renderAnalysisHighlights();
    }
    return;
  }

  if (an.pairsPhase === 'ready') {
    cancelNakedPair();
  }
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function analyzeNakedPair() {
  const an = STATE.analysis;
  const cells = an.pairCells;
  const nums  = an.pairTarget;

  const rows  = new Set(cells.map(p => p.r));
  const cols  = new Set(cells.map(p => p.c));
  const boxes = new Set(cells.map(p => Math.floor(p.r / 3) * 3 + Math.floor(p.c / 3)));

  const sharedRow = rows.size  === 1 ? [...rows][0]  : -1;
  const sharedCol = cols.size  === 1 ? [...cols][0]  : -1;
  const sharedBox = boxes.size === 1 ? [...boxes][0] : -1;

  if (sharedRow < 0 && sharedCol < 0 && sharedBox < 0) { cancelNakedPair(); return; }

  const selectedKeys = new Set(cells.map(p => `${p.r},${p.c}`));
  const affected = [];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (selectedKeys.has(`${r},${c}`)) continue;
      if (STATE.puzzle[r][c] !== 0) continue;
      const boxIdx = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const inRegion = r === sharedRow || c === sharedCol || boxIdx === sharedBox;
      if (!inRegion) continue;
      const toRemove = new Set([...nums].filter(n => STATE.notes[r][c].has(n)));
      if (toRemove.size) affected.push({ r, c, nums: toRemove });
    }
  }

  if (!affected.length) { cancelNakedPair(); return; }

  an.pairAffected = affected;
  an.pairsPhase   = 'ready';
  updateActionBar();
  renderAnalysisHighlights();
}

function cancelNakedPair() {
  const an = STATE.analysis;
  an.pairsPhase = 'idle'; an.pairCells = [];
  an.pairTarget = null;   an.pairTargetCount = 0; an.pairAffected = [];
  updateActionBar(); renderAnalysisHighlights();
}

function executeNakedPairRemove() {
  const an = STATE.analysis;
  pushUndo();
  for (const { r, c, nums } of an.pairAffected) {
    for (const n of nums) STATE.notes[r][c].delete(n);
    updateCellContent(r, c);
  }
  cancelNakedPair();
  renderHighlights();
}

/* ─── Par Apontador (Pointing Pairs) ─── */
function handlePointingSelect(r, c) {
  const an = STATE.analysis;

  if (an.pointingPhase === 'idle') {
    an.pointingPhase = 'selecting';
    an.pointingCells = [{ r, c }];
    updateActionBar(); renderAnalysisHighlights(); return;
  }

  if (an.pointingPhase === 'selecting') {
    if (an.pointingCells.some(p => p.r === r && p.c === c)) { cancelPointing(); return; }
    an.pointingCells.push({ r, c });
    if (an.pointingCells.length >= 2) analyzePointing();
    else { updateActionBar(); renderAnalysisHighlights(); }
    return;
  }

  if (an.pointingPhase === 'ready') cancelPointing();
}

function analyzePointing() {
  const an = STATE.analysis;
  const [p1, p2] = an.pointingCells;
  const num = STATE.pinnedNum;

  /* Células devem estar no mesmo quadrante */
  const box1 = Math.floor(p1.r / 3) * 3 + Math.floor(p1.c / 3);
  const box2 = Math.floor(p2.r / 3) * 3 + Math.floor(p2.c / 3);
  if (box1 !== box2) { cancelPointing(); return; }

  /* Células devem estar na mesma linha ou coluna */
  const sameRow = p1.r === p2.r, sameCol = p1.c === p2.c;
  if (!sameRow && !sameCol) { cancelPointing(); return; }

  /* Verifica se só essas 2 células têm o número no quadrante (condição do Par Apontador) */
  const br = Math.floor(p1.r / 3) * 3, bc = Math.floor(p1.c / 3) * 3;
  const selKeys = new Set([`${p1.r},${p1.c}`, `${p2.r},${p2.c}`]);
  let boxConditionMet = true;
  for (let rr = br; rr < br + 3; rr++)
    for (let cc = bc; cc < bc + 3; cc++)
      if (!selKeys.has(`${rr},${cc}`) && STATE.notes[rr][cc].has(num))
        boxConditionMet = false;

  /* Encontra alvos fora do quadrante na mesma linha/coluna */
  const affected = [];
  if (boxConditionMet) {
    if (sameRow)
      for (let c = 0; c < 9; c++) {
        if (Math.floor(p1.r / 3) * 3 + Math.floor(c / 3) === box1) continue;
        if (STATE.notes[p1.r][c].has(num)) affected.push({ r: p1.r, c });
      }
    if (sameCol)
      for (let r = 0; r < 9; r++) {
        if (Math.floor(r / 3) * 3 + Math.floor(p1.c / 3) === box1) continue;
        if (STATE.notes[r][p1.c].has(num)) affected.push({ r, c: p1.c });
      }
  }

  /* Sempre avança para 'ready' — só habilita Atirar se condição e alvos forem válidos */
  an.pointingAffected  = affected;
  an.pointingCondition = boxConditionMet;  /* novo campo para feedback */
  an.pointingPhase     = 'ready';
  updateActionBar(); renderAnalysisHighlights();
}

function cancelPointing() {
  const an = STATE.analysis;
  an.pointingPhase = 'idle'; an.pointingCells = []; an.pointingAffected = [];
  an.pointingCondition = true;
  updateActionBar(); renderAnalysisHighlights();
}

function executePointing() {
  const an = STATE.analysis;
  const num = STATE.pinnedNum;
  pushUndo();
  for (const { r, c } of an.pointingAffected) {
    STATE.notes[r][c].delete(num);
    updateCellContent(r, c);
  }
  cancelPointing();
  renderHighlights();
}

/* ─── Únicas (Naked Singles) ─── */
function toggleSingles() {
  STATE.analysis.singlesActive ? deactivateSingles() : activateSingles();
}

function activateSingles() {
  const an = STATE.analysis;
  an.singlesActive = true;
  an.singles = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (STATE.puzzle[r][c] === 0 && STATE.notes[r][c].size === 1)
        an.singles.push({ r, c, val: [...STATE.notes[r][c]][0] });
  updateSinglesBtn();
  updateActionBar();
  renderAnalysisHighlights();
}

function deactivateSingles() {
  const an = STATE.analysis;
  an.singlesActive = false; an.singles = [];
  updateSinglesBtn(); updateActionBar(); renderAnalysisHighlights();
}

function executeFillSingles() {
  const an = STATE.analysis;
  if (!an.singlesActive || !an.singles.length) return;
  pushUndo();
  for (const { r, c, val } of an.singles) {
    if (STATE.puzzle[r][c] !== 0) continue;
    STATE.puzzle[r][c] = val;
    STATE.score += calculateCellPoints();
    if (STATE.settings.autoRemoveNotes) removeRelatedNotes(r, c, val);
    updateCellContent(r, c);
  }
  deactivateSingles();
  updateScoreDisplay(); renderNumpad(); updateProgressBar(); renderHighlights();
  checkWin();
}

/* ─── Botão de ação (action bar) ─── */
function handleActionConfirm() {
  const an = STATE.analysis;
  if (an.singlesActive && an.singles.length)  { executeFillSingles(); return; }
  if (an.pairsPhase    === 'ready')            { executeNakedPairRemove(); return; }
  if (an.pointingPhase === 'ready')            { executePointing(); return; }
  if (an.xwingActive   && an.xwings.length)   { executeXWing(); return; }
  if (an.ywingActive   && an.ywings.length)   { executeYWing(); return; }
}

function handleActionCancel() {
  const an = STATE.analysis;
  if (an.singlesActive)          { deactivateSingles(); return; }
  if (an.pairsPhase    !== 'idle') { cancelNakedPair(); return; }
  if (an.pointingPhase !== 'idle') { cancelPointing(); return; }
  if (an.xwingActive)            { deactivateXWing(); return; }
  if (an.ywingActive)            { deactivateYWing(); return; }
}

function updateActionBar() {
  const bar     = document.getElementById('action-bar');
  const label   = document.getElementById('action-bar-label');
  const confirm = document.getElementById('btn-action-confirm');
  if (!bar) return;

  const an = STATE.analysis;

  /* Únicas */
  if (an.singlesActive) {
    bar.classList.remove('hidden');
    if (an.singles.length) {
      label.textContent    = `${an.singles.length} única(s) encontrada(s)`;
      confirm.textContent  = '① Preencher todas';
      confirm.disabled     = false;
    } else {
      label.textContent    = 'Nenhuma única encontrada';
      confirm.textContent  = '① Preencher';
      confirm.disabled     = true;
    }
    return;
  }

  /* Par Apontador */
  if (STATE.pinnedNum > 0 && STATE.settings.enablePointingPairs) {
    if (an.pointingPhase === 'selecting') {
      bar.classList.remove('hidden');
      label.textContent   = `Segure ${2 - an.pointingCells.length} célula(s) no mesmo quadrante`;
      confirm.textContent = '🎯 Atirar';
      confirm.disabled    = true;
      return;
    }
    if (an.pointingPhase === 'ready') {
      bar.classList.remove('hidden');
      if (!an.pointingCondition) {
        label.textContent  = 'Há outras ocorrências no quadrante — condição inválida';
        confirm.textContent = '🎯 Atirar';
        confirm.disabled   = true;
      } else if (!an.pointingAffected.length) {
        label.textContent  = 'Nenhum candidato a eliminar fora do quadrante';
        confirm.textContent = '🎯 Atirar';
        confirm.disabled   = true;
      } else {
        label.textContent   = `${an.pointingAffected.length} candidato(s) a eliminar`;
        confirm.textContent = '🎯 Atirar';
        confirm.disabled    = false;
      }
      return;
    }
  }

  /* Pares Nus */
  if (STATE.settings.enableNakedPairs) {
    if (an.pairsPhase === 'selecting') {
      const need = an.pairTargetCount - an.pairCells.length;
      bar.classList.remove('hidden');
      label.textContent   = `Segure mais ${need} célula(s) com ${[...an.pairTarget].join(',')}`;
      confirm.textContent = '✓ Remover';
      confirm.disabled    = true;
      return;
    }
    if (an.pairsPhase === 'ready') {
      bar.classList.remove('hidden');
      label.textContent   = `${an.pairAffected.length} candidato(s) a remover`;
      confirm.textContent = '✓ Remover';
      confirm.disabled    = false;
      return;
    }
  }

  /* X-Wing */
  if (an.xwingActive) {
    bar.classList.remove('hidden');
    const totalTargets = an.xwings.reduce((s, xw) => s + xw.targets.length, 0);
    if (an.xwings.length) {
      label.textContent   = `X-Wing: ${an.xwings.length} padrão(ões) · ${totalTargets} eliminação(ões)`;
      confirm.textContent = '♟ Eliminar';
      confirm.disabled    = false;
    } else {
      label.textContent   = 'Nenhum X-Wing encontrado';
      confirm.textContent = '♟ Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  /* Y-Wing */
  if (an.ywingActive) {
    bar.classList.remove('hidden');
    const totalTargets = an.ywings.reduce((s, yw) => s + yw.targets.length, 0);
    if (an.ywings.length) {
      label.textContent   = `Y-Wing: ${an.ywings.length} padrão(ões) · ${totalTargets} eliminação(ões)`;
      confirm.textContent = '♟ Eliminar';
      confirm.disabled    = false;
    } else {
      label.textContent   = 'Nenhum Y-Wing encontrado';
      confirm.textContent = '♟ Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  bar.classList.add('hidden');
}

function updateSinglesBtn() {
  const btn = document.getElementById('btn-singles');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.singlesActive);
}

function updateAnalysisToolsVisibility() {
  const s = STATE.settings;
  const singlesBtn = document.getElementById('btn-singles');
  const xwingBtn   = document.getElementById('btn-xwing');
  const ywingBtn   = document.getElementById('btn-ywing');
  if (singlesBtn) singlesBtn.classList.toggle('hidden', !s.enableNakedSingles);
  if (xwingBtn)   xwingBtn.classList.toggle('hidden',   !s.enableXWing);
  if (ywingBtn)   ywingBtn.classList.toggle('hidden',   !s.enableYWing);

  /* Mostra a barra só se ao menos um botão estiver visível */
  const bar = document.getElementById('analysis-tools');
  if (bar) bar.classList.toggle('hidden',
    !s.enableNakedSingles && !s.enableXWing && !s.enableYWing);
}

function resetAnalysis() {
  STATE.analysis = {
    singlesActive: false, singles: [],
    pairsPhase: 'idle', pairCells: [], pairTarget: null, pairTargetCount: 0, pairAffected: [],
    pointingPhase: 'idle', pointingCells: [], pointingAffected: [], pointingCondition: true,
    xwingActive: false, xwings: [],
    ywingActive: false, ywings: [],
  };
  const bar = document.getElementById('action-bar');
  if (bar) bar.classList.add('hidden');
  updateSinglesBtn();
}

/* ─── X-Wing ─── */
function toggleXWing() {
  STATE.analysis.xwingActive ? deactivateXWing() : activateXWing();
}

function activateXWing() {
  const an = STATE.analysis;
  an.xwingActive = true;
  an.xwings = detectXWings();
  updateXWingBtn();
  updateActionBar();
  renderAnalysisHighlights();
}

function deactivateXWing() {
  const an = STATE.analysis;
  an.xwingActive = false; an.xwings = [];
  updateXWingBtn(); updateActionBar(); renderAnalysisHighlights();
}

function executeXWing() {
  const an = STATE.analysis;
  pushUndo();
  const targets = new Set();
  an.xwings.forEach(xw => xw.targets.forEach(t => targets.add(`${t.r},${t.c},${xw.num}`)));
  targets.forEach(key => {
    const [r, c, num] = key.split(',').map(Number);
    STATE.notes[r][c].delete(num);
    updateCellContent(r, c);
  });
  deactivateXWing();
  renderHighlights();
}

function detectXWings() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;

  for (let num = 1; num <= 9; num++) {
    /* Row-based X-Wing */
    const rowMap = {};   // row → [col1, col2]
    for (let r = 0; r < 9; r++) {
      const cols = [];
      for (let c = 0; c < 9; c++)
        if (puz[r][c] === 0 && notes[r][c].has(num)) cols.push(c);
      if (cols.length === 2) rowMap[r] = cols;
    }
    const rowKeys = Object.keys(rowMap).map(Number);
    for (let i = 0; i < rowKeys.length - 1; i++) {
      for (let j = i + 1; j < rowKeys.length; j++) {
        const r1 = rowKeys[i], r2 = rowKeys[j];
        if (rowMap[r1][0] === rowMap[r2][0] && rowMap[r1][1] === rowMap[r2][1]) {
          const [c1, c2] = rowMap[r1];
          const targets = [];
          for (let r = 0; r < 9; r++) {
            if (r === r1 || r === r2) continue;
            if (puz[r][c1] === 0 && notes[r][c1].has(num)) targets.push({ r, c: c1 });
            if (puz[r][c2] === 0 && notes[r][c2].has(num)) targets.push({ r, c: c2 });
          }
          if (targets.length)
            found.push({ num, cells: [{r:r1,c:c1},{r:r1,c:c2},{r:r2,c:c1},{r:r2,c:c2}], targets });
        }
      }
    }

    /* Column-based X-Wing */
    const colMap = {};   // col → [row1, row2]
    for (let c = 0; c < 9; c++) {
      const rows = [];
      for (let r = 0; r < 9; r++)
        if (puz[r][c] === 0 && notes[r][c].has(num)) rows.push(r);
      if (rows.length === 2) colMap[c] = rows;
    }
    const colKeys = Object.keys(colMap).map(Number);
    for (let i = 0; i < colKeys.length - 1; i++) {
      for (let j = i + 1; j < colKeys.length; j++) {
        const c1 = colKeys[i], c2 = colKeys[j];
        if (colMap[c1][0] === colMap[c2][0] && colMap[c1][1] === colMap[c2][1]) {
          const [r1, r2] = colMap[c1];
          const targets = [];
          for (let c = 0; c < 9; c++) {
            if (c === c1 || c === c2) continue;
            if (puz[r1][c] === 0 && notes[r1][c].has(num)) targets.push({ r: r1, c });
            if (puz[r2][c] === 0 && notes[r2][c].has(num)) targets.push({ r: r2, c });
          }
          if (targets.length)
            found.push({ num, cells: [{r:r1,c:c1},{r:r1,c:c2},{r:r2,c:c1},{r:r2,c:c2}], targets });
        }
      }
    }
  }
  return found;
}

function updateXWingBtn() {
  const btn = document.getElementById('btn-xwing');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.xwingActive);
}

/* ─── Y-Wing ─── */
function toggleYWing() {
  STATE.analysis.ywingActive ? deactivateYWing() : activateYWing();
}

function activateYWing() {
  const an = STATE.analysis;
  an.ywingActive = true;
  an.ywings = detectYWings();
  updateYWingBtn();
  updateActionBar();
  renderAnalysisHighlights();
}

function deactivateYWing() {
  const an = STATE.analysis;
  an.ywingActive = false; an.ywings = [];
  updateYWingBtn(); updateActionBar(); renderAnalysisHighlights();
}

function executeYWing() {
  const an = STATE.analysis;
  pushUndo();
  an.ywings.forEach(yw => {
    yw.targets.forEach(({ r, c }) => {
      STATE.notes[r][c].delete(yw.elimVal);
      updateCellContent(r, c);
    });
  });
  deactivateYWing();
  renderHighlights();
}

function cellSees(r1, c1, r2, c2) {
  if (r1 === r2 || c1 === c2) return true;
  return Math.floor(r1/3)*3+Math.floor(c1/3) === Math.floor(r2/3)*3+Math.floor(c2/3);
}

function detectYWings() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;
  const seen = new Set();

  for (let pr = 0; pr < 9; pr++) {
    for (let pc = 0; pc < 9; pc++) {
      if (puz[pr][pc] !== 0 || notes[pr][pc].size !== 2) continue;
      const [A, B] = [...notes[pr][pc]];

      /* Pincers que vêem o pivot */
      const pincers1 = [], pincers2 = [];
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (puz[r][c] !== 0 || notes[r][c].size !== 2) continue;
          if (r === pr && c === pc) continue;
          if (!cellSees(pr, pc, r, c)) continue;
          const ns = notes[r][c];
          if (ns.has(A) && !ns.has(B)) pincers1.push({ r, c, other: [...ns].find(x => x !== A) });
          if (ns.has(B) && !ns.has(A)) pincers2.push({ r, c, other: [...ns].find(x => x !== B) });
        }
      }

      for (const p1 of pincers1) {
        for (const p2 of pincers2) {
          if (p1.other !== p2.other) continue;   /* C must match */
          const C = p1.other;
          if (C === A || C === B) continue;

          /* Find cells that see BOTH pincers and have C in notes */
          const targets = [];
          for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
              if (puz[r][c] !== 0 || !notes[r][c].has(C)) continue;
              if (r === p1.r && c === p1.c) continue;
              if (r === p2.r && c === p2.c) continue;
              if (cellSees(r, c, p1.r, p1.c) && cellSees(r, c, p2.r, p2.c))
                targets.push({ r, c });
            }
          }

          if (!targets.length) continue;
          const key = `${pr},${pc}-${p1.r},${p1.c}-${p2.r},${p2.c}-${C}`;
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ pivot: {r:pr,c:pc}, pincers: [{r:p1.r,c:p1.c},{r:p2.r,c:p2.c}], targets, elimVal: C });
        }
      }
    }
  }
  return found;
}

function updateYWingBtn() {
  const btn = document.getElementById('btn-ywing');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.ywingActive);
}

function renderAnalysisHighlights() {
  if (!cellElements.length || !cellElements[0]) return;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      cellElements[r][c].classList.remove(
        'singles-match', 'pair-select', 'pair-affected',
        'pointing-select', 'pointing-affected',
        'xwing-cell', 'xwing-target', 'ywing-pivot', 'ywing-pincer', 'ywing-target'
      );

  const an = STATE.analysis;

  if (an.singlesActive)
    for (const { r, c } of an.singles)
      cellElements[r][c].classList.add('singles-match');

  for (const { r, c } of an.pairCells)
    cellElements[r][c].classList.add('pair-select');
  if (an.pairsPhase === 'ready')
    for (const { r, c } of an.pairAffected)
      cellElements[r][c].classList.add('pair-affected');

  for (const { r, c } of an.pointingCells)
    cellElements[r][c].classList.add('pointing-select');
  if (an.pointingPhase === 'ready')
    for (const { r, c } of an.pointingAffected)
      cellElements[r][c].classList.add('pointing-affected');

  /* X-Wing */
  if (an.xwingActive) {
    an.xwings.forEach(xw => {
      xw.cells.forEach(({ r, c }) => cellElements[r][c].classList.add('xwing-cell'));
      xw.targets.forEach(({ r, c }) => cellElements[r][c].classList.add('xwing-target'));
    });
  }

  /* Y-Wing */
  if (an.ywingActive) {
    an.ywings.forEach(yw => {
      cellElements[yw.pivot.r][yw.pivot.c].classList.add('ywing-pivot');
      yw.pincers.forEach(({ r, c }) => cellElements[r][c].classList.add('ywing-pincer'));
      yw.targets.forEach(({ r, c }) => cellElements[r][c].classList.add('ywing-target'));
    });
  }
}

function checkCompletions(r, c) {
  const solved = (rr, cc) => STATE.puzzle[rr][cc] === STATE.solution[rr][cc];

  /* Linha */
  if (Array.from({length: 9}, (_, cc) => solved(r, cc)).every(Boolean)) {
    flashLine(Array.from({length: 9}, (_, cc) => cellElements[r][cc]));
  }
  /* Coluna */
  if (Array.from({length: 9}, (_, rr) => solved(rr, c)).every(Boolean)) {
    flashLine(Array.from({length: 9}, (_, rr) => cellElements[rr][c]));
  }
  /* Quadrante */
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  const boxCells = [];
  let boxDone = true;
  for (let rr = br; rr < br + 3; rr++)
    for (let cc = bc; cc < bc + 3; cc++) {
      if (!solved(rr, cc)) boxDone = false;
      boxCells.push(cellElements[rr][cc]);
    }
  if (boxDone) flashLine(boxCells);
}

function flashLine(cells) {
  cells.forEach((el, i) => {
    if (!el) return;
    setTimeout(() => {
      el.classList.remove('line-complete');
      void el.offsetWidth;
      el.classList.add('line-complete');
    }, i * 35);
  });
}

function shakeCell(r, c) {
  const el = cellElements[r] && cellElements[r][c];
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function correctPop(r, c) {
  const el = cellElements[r] && cellElements[r][c];
  if (!el) return;
  el.classList.remove('correct-pop');
  void el.offsetWidth;
  el.classList.add('correct-pop');
}

function celebrateDigit(num) {
  /* Auto-despinnar se este número estava fixado */
  if (STATE.pinnedNum === num) {
    STATE.pinnedNum = 0;
    renderNumpad();
    renderHighlights();
  }
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (STATE.puzzle[r][c] === num) {
        const el = cellElements[r][c];
        el.classList.remove('digit-complete');
        void el.offsetWidth;
        el.classList.add('digit-complete');
      }
    }
  }
  const btn = document.querySelector(`.num-btn[data-num="${num}"]`);
  if (btn) {
    btn.classList.remove('num-complete');
    void btn.offsetWidth;
    btn.classList.add('num-complete');
  }
}

function updateProgressBar() {
  let filled = 0;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (STATE.puzzle[r][c] !== 0) filled++;
  const fill = document.getElementById('progress-fill');
  if (fill) fill.style.width = ((filled / 81) * 100) + '%';
}

function syncSettingsUI() {
  const s = STATE.settings;
  const toggle = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  };
  toggle('cfg-markErrors',        s.markErrors);
  toggle('cfg-failOnErrors',      s.failOnErrors);
  toggle('cfg-autoRemoveNotes',   s.autoRemoveNotes);
  toggle('cfg-enhancedHighlight', s.enhancedHighlight);
  toggle('cfg-autoAnnotations',   s.autoAnnotations);
  toggle('cfg-simulatorMode',        s.simulatorMode);
  toggle('cfg-enableNakedSingles',   s.enableNakedSingles);
  toggle('cfg-enableNakedPairs',     s.enableNakedPairs);
  toggle('cfg-enablePointingPairs',  s.enablePointingPairs);
  toggle('cfg-enableXWing',          s.enableXWing);
  toggle('cfg-enableYWing',          s.enableYWing);

  document.getElementById('max-errors-val').textContent = s.maxErrors;
  document.getElementById('max-errors-row').classList.toggle('hidden', !s.failOnErrors);
  updateControlsForSimMode();
  updateAnalysisToolsVisibility();
}

/* ═══════════════════════════════════════
   iOS PWA BANNER
═══════════════════════════════════════ */
function checkIOSBanner() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandalone = ('standalone' in navigator) && navigator.standalone;
  const dismissed = localStorage.getItem('ios-banner-dismissed');
  if (isIOS && !isInStandalone && !dismissed) {
    document.getElementById('ios-banner').classList.remove('hidden');
  }
}
