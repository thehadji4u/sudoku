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
    singlesActive:      false,
    singles:            [],        // [{r, c, val}]
    singlesIndex:       0,

    /* Ocultas (Hidden Singles) */
    hiddenActive:       false,
    hiddens:            [],        // [{r, c, val}]
    hiddensIndex:       0,

    /* Pares Nus (Naked Pairs) — auto-detect cycling */
    nakedPairsActive:   false,
    nakedPairs:         [],        // [{pairNums, pairCells:[{r,c}], affected:[{r,c,nums:Set}]}]
    nakedPairsIndex:    0,

    /* Par Apontador (Pointing Pairs) — auto-detect cycling */
    pointingActive:     false,
    pointings:          [],        // [{num, cells:[{r,c}], targets:[{r,c}]}]
    pointingIndex:      0,

    /* X-Wing */
    xwingActive:        false,
    xwings:             [],
    xwingIndex:         0,

    /* Y-Wing */
    ywingActive:        false,
    ywings:             [],
    ywingIndex:         0,
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
    enableHiddenSingles: true,
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
let _toolLongPressTimer     = null;
let _toolLongPressTriggered = false;

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
    clearSession();   /* descarta sessão salva no localStorage também */
    document.getElementById('session-resume').classList.add('hidden');
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

  attachToolBtn('btn-singles',    toggleSingles,    longPressSingles);
  attachToolBtn('btn-nakedpairs', toggleNakedPairs, longPressNakedPairs);
  attachToolBtn('btn-pointing',   togglePointing,   longPressPointing);
  attachToolBtn('btn-xwing',      toggleXWing,      longPressXWing);
  attachToolBtn('btn-ywing',      toggleYWing,      longPressYWing);

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
  const keys = ['markErrors', 'failOnErrors', 'autoRemoveNotes', 'enhancedHighlight', 'autoAnnotations', 'simulatorMode', 'enableNakedSingles', 'enableHiddenSingles', 'enableNakedPairs', 'enablePointingPairs', 'enableXWing', 'enableYWing'];
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
      if (['enableNakedSingles', 'enableHiddenSingles', 'enableNakedPairs', 'enablePointingPairs', 'enableXWing', 'enableYWing'].includes(key)) {
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

/*
 * attachToolBtn — registra clique (tap) e long-press (500ms) num botão de análise.
 * Long-press executa a ação imediatamente; tap normal chama a função toggle/cycle.
 */
function attachToolBtn(btnId, tapFn, longPressFn) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  const startPress = () => {
    _toolLongPressTimer = setTimeout(() => {
      _toolLongPressTriggered = true;
      _toolLongPressTimer = null;
      if (!STATE.puzzle || STATE.paused) return;
      longPressFn();
    }, 500);
  };
  const cancelPress = () => {
    if (_toolLongPressTimer) { clearTimeout(_toolLongPressTimer); _toolLongPressTimer = null; }
  };

  btn.addEventListener('click', () => {
    if (_toolLongPressTriggered) { _toolLongPressTriggered = false; return; }
    if (!STATE.puzzle || STATE.paused) return;
    tapFn();
  });
  btn.addEventListener('touchstart',  e => { e.preventDefault(); startPress(); }, { passive: false });
  btn.addEventListener('touchend',    cancelPress);
  btn.addEventListener('touchcancel', cancelPress);
  btn.addEventListener('mousedown',   startPress);
  btn.addEventListener('mouseup',     cancelPress);
  btn.addEventListener('mouseleave',  cancelPress);
}

/* Long-press actions — executa imediatamente sem precisar confirmar */
function longPressSingles() {
  const an = STATE.analysis;
  if (!an.singlesActive && !an.hiddenActive) toggleSingles(); // ativa primeiro
  if (an.singlesActive && an.singles.length) { executeFillSingles(); return; }
  if (an.hiddenActive  && an.hiddens.length) { executeFillHiddenSingles(); }
}
function longPressNakedPairs() {
  if (!STATE.analysis.nakedPairsActive) toggleNakedPairs();
  if (STATE.analysis.nakedPairsActive && STATE.analysis.nakedPairs.length) executeNakedPairs();
}
function longPressPointing() {
  if (!STATE.analysis.pointingActive) togglePointing();
  if (STATE.analysis.pointingActive && STATE.analysis.pointings.length) executePointing();
}
function longPressXWing() {
  if (!STATE.analysis.xwingActive) toggleXWing();
  if (STATE.analysis.xwingActive && STATE.analysis.xwings.length) executeXWing();
}
function longPressYWing() {
  if (!STATE.analysis.ywingActive) toggleYWing();
  if (STATE.analysis.ywingActive && STATE.analysis.ywings.length) executeYWing();
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
  /* Avisa se há partida em andamento no STATE ou sessão salva no localStorage */
  const hasActive = (STATE.puzzle && STATE.timerRunning) || loadSession() !== null;
  if (hasActive) {
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

  /* Se nenhuma célula selecionada, encerra após pinned e análise */
  if (sr < 0) {
    if (STATE.simulator.active) renderSimConflicts();
    renderAnalysisHighlights();   /* garante que análises ativas continuam visíveis */
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

  /* Deseleciona o tabuleiro ao colocar um número (apagar com 0 mantém seleção) */
  if (num !== 0) {
    STATE.selectedRow = -1;
    STATE.selectedCol = -1;
  }

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
  /* Ao fixar um número no dial, limpa a seleção de célula no tabuleiro */
  STATE.selectedRow = -1;
  STATE.selectedCol = -1;
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
  /* Long-press on cells is no longer used for manual selection.
     Naked Pairs and Pointing Pairs now use auto-detect buttons. */
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/* ─── Naked Pairs (auto-detect cycling) ─── */

function detectNakedPairs() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;
  const seen = new Set();

  function checkGroup(cells) {
    const empties = cells.filter(({ r, c }) => puz[r][c] === 0 && notes[r][c].size === 2);
    for (let i = 0; i < empties.length; i++) {
      for (let j = i + 1; j < empties.length; j++) {
        const { r: r1, c: c1 } = empties[i];
        const { r: r2, c: c2 } = empties[j];
        if (!setsEqual(notes[r1][c1], notes[r2][c2])) continue;
        const key = `${r1},${c1},${r2},${c2}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const pairNums = [...notes[r1][c1]];
        const pairCells = [{ r: r1, c: c1 }, { r: r2, c: c2 }];
        const affected = [];
        for (const { r, c } of cells) {
          if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
          if (puz[r][c] !== 0) continue;
          const toRemove = pairNums.filter(n => notes[r][c].has(n));
          if (toRemove.length > 0) affected.push({ r, c, nums: new Set(toRemove) });
        }
        if (affected.length > 0) found.push({ pairNums, pairCells, affected });
      }
    }
  }

  for (let r = 0; r < 9; r++)
    checkGroup(Array.from({ length: 9 }, (_, c) => ({ r, c })));
  for (let c = 0; c < 9; c++)
    checkGroup(Array.from({ length: 9 }, (_, r) => ({ r, c })));
  for (let br = 0; br < 9; br += 3)
    for (let bc = 0; bc < 9; bc += 3) {
      const cells = [];
      for (let rr = br; rr < br + 3; rr++)
        for (let cc = bc; cc < bc + 3; cc++)
          cells.push({ r: rr, c: cc });
      checkGroup(cells);
    }

  return found;
}

function toggleNakedPairs() {
  const an = STATE.analysis;
  if (!an.nakedPairsActive) {
    an.nakedPairs      = detectNakedPairs();
    an.nakedPairsIndex = 0;
    an.nakedPairsActive = true;
  } else {
    an.nakedPairsIndex++;
    if (an.nakedPairsIndex >= an.nakedPairs.length) {
      deactivateNakedPairs(); return;
    }
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateNakedPairsBtn(); updateActionBar(); renderHighlights();
}

function deactivateNakedPairs() {
  const an = STATE.analysis;
  an.nakedPairsActive = false; an.nakedPairs = []; an.nakedPairsIndex = 0;
  updateNakedPairsBtn(); updateActionBar(); renderHighlights();
}

function executeNakedPairs() {
  const an = STATE.analysis;
  const np = an.nakedPairs[an.nakedPairsIndex];
  if (!np) { deactivateNakedPairs(); return; }
  pushUndo();
  np.affected.forEach(({ r, c, nums }) => {
    nums.forEach(n => STATE.notes[r][c].delete(n));
    updateCellContent(r, c);
  });
  deactivateNakedPairs();
  renderHighlights();
}

function updateNakedPairsBtn() {
  const btn = document.getElementById('btn-nakedpairs');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.nakedPairsActive);
}

/* ─── Pointing Pairs (auto-detect cycling) ─── */

function detectPointingPairs() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;

  for (let num = 1; num <= 9; num++) {
    for (let br = 0; br < 9; br += 3) {
      for (let bc = 0; bc < 9; bc += 3) {
        const cells = [];
        for (let rr = br; rr < br + 3; rr++)
          for (let cc = bc; cc < bc + 3; cc++)
            if (puz[rr][cc] === 0 && notes[rr][cc].has(num))
              cells.push({ r: rr, c: cc });
        if (cells.length < 2) continue;

        const rows = new Set(cells.map(c => c.r));
        const cols = new Set(cells.map(c => c.c));

        if (rows.size === 1) {
          const row = cells[0].r;
          const targets = [];
          for (let c = 0; c < 9; c++) {
            if (Math.floor(c / 3) * 3 === bc) continue;
            if (puz[row][c] === 0 && notes[row][c].has(num))
              targets.push({ r: row, c });
          }
          if (targets.length > 0)
            found.push({ num, cells, targets });
        }

        if (cols.size === 1) {
          const col = cells[0].c;
          const targets = [];
          for (let r = 0; r < 9; r++) {
            if (Math.floor(r / 3) * 3 === br) continue;
            if (puz[r][col] === 0 && notes[r][col].has(num))
              targets.push({ r, c: col });
          }
          if (targets.length > 0)
            found.push({ num, cells, targets });
        }
      }
    }
  }
  return found;
}

function togglePointing() {
  const an = STATE.analysis;
  if (!an.pointingActive) {
    an.pointings      = detectPointingPairs();
    an.pointingIndex  = 0;
    an.pointingActive = true;
  } else {
    an.pointingIndex++;
    if (an.pointingIndex >= an.pointings.length) {
      deactivatePointing(); return;
    }
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updatePointingBtn(); updateActionBar(); renderHighlights();
}

function deactivatePointing() {
  const an = STATE.analysis;
  an.pointingActive = false; an.pointings = []; an.pointingIndex = 0;
  updatePointingBtn(); updateActionBar(); renderHighlights();
}

function executePointing() {
  const an = STATE.analysis;
  const pt = an.pointings[an.pointingIndex];
  if (!pt) { deactivatePointing(); return; }
  pushUndo();
  pt.targets.forEach(({ r, c }) => {
    STATE.notes[r][c].delete(pt.num);
    updateCellContent(r, c);
  });
  deactivatePointing();
  renderHighlights();
}

function updatePointingBtn() {
  const btn = document.getElementById('btn-pointing');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.pointingActive);
}

/* ─── Únicas / Ocultas — cycling com pin do número no dial ─── */

/*
 * Ciclo do botão "① Únicas":
 *  IDLE  → detecta Naked Singles; se não achar → detecta Hidden Singles
 *  ATIVO → avança para o próximo (cycling); ao passar do último, desativa
 *  Cada single exibido faz "pin" do número no dial (linhas verdes visíveis).
 *  Confirmar preenche apenas o atual; Cancelar / fim do ciclo → desativa + despin.
 */
function toggleSingles() {
  const an = STATE.analysis;
  const s  = STATE.settings;

  /* Cycling Naked Singles */
  if (an.singlesActive) {
    an.singlesIndex++;
    if (an.singlesIndex >= an.singles.length) { deactivateSingles(); return; }
    _pinSingle(an.singles[an.singlesIndex]);
    updateSinglesBtn(); updateActionBar(); renderHighlights();
    return;
  }

  /* Cycling Hidden Singles */
  if (an.hiddenActive) {
    an.hiddensIndex++;
    if (an.hiddensIndex >= an.hiddens.length) { deactivateHiddenSingles(); return; }
    _pinSingle(an.hiddens[an.hiddensIndex]);
    updateSinglesBtn(); updateActionBar(); renderHighlights();
    return;
  }

  /* Idle — detecta Naked Singles primeiro */
  if (s.enableNakedSingles) {
    const singles = [];
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (STATE.puzzle[r][c] === 0 && STATE.notes[r][c].size === 1)
          singles.push({ r, c, val: [...STATE.notes[r][c]][0] });
    if (singles.length > 0) {
      an.singlesActive = true; an.singles = singles; an.singlesIndex = 0;
      STATE.selectedRow = -1; STATE.selectedCol = -1;
      _pinSingle(singles[0]);
      updateSinglesBtn(); updateActionBar(); renderHighlights();
      return;
    }
  }

  /* Sem Naked Singles — tenta Hidden Singles */
  if (s.enableHiddenSingles) {
    const hiddens = _computeHiddenSingles();
    if (hiddens.length > 0) {
      an.hiddenActive = true; an.hiddens = hiddens; an.hiddensIndex = 0;
      STATE.selectedRow = -1; STATE.selectedCol = -1;
      _pinSingle(hiddens[0]);
      updateSinglesBtn(); updateActionBar(); renderHighlights();
    }
  }
}

/* Pina o número de um single no dial (igual ao long-press do numpad) */
function _pinSingle({ val }) {
  STATE.pinnedNum = val;
  renderNumpad();
}

/* Computa Hidden Singles sem efeitos colaterais */
function _computeHiddenSingles() {
  const puz = STATE.puzzle, notes = STATE.notes;
  const found = new Map();
  function checkGroup(cells) {
    for (let num = 1; num <= 9; num++) {
      const cands = cells.filter(({ r, c }) => puz[r][c] === 0 && notes[r][c].has(num));
      if (cands.length === 1) {
        const { r, c } = cands[0];
        if (notes[r][c].size > 1 && !found.has(`${r},${c}`))
          found.set(`${r},${c}`, { r, c, val: num });
      }
    }
  }
  for (let r = 0; r < 9; r++)
    checkGroup(Array.from({ length: 9 }, (_, c) => ({ r, c })));
  for (let c = 0; c < 9; c++)
    checkGroup(Array.from({ length: 9 }, (_, r) => ({ r, c })));
  for (let br = 0; br < 9; br += 3)
    for (let bc = 0; bc < 9; bc += 3) {
      const cells = [];
      for (let rr = br; rr < br + 3; rr++)
        for (let cc = bc; cc < bc + 3; cc++)
          cells.push({ r: rr, c: cc });
      checkGroup(cells);
    }
  return [...found.values()];
}

function deactivateSingles() {
  const an = STATE.analysis;
  an.singlesActive = false; an.singles = []; an.singlesIndex = 0;
  STATE.pinnedNum = 0;
  updateSinglesBtn(); updateActionBar(); renderHighlights();
}

function deactivateHiddenSingles() {
  const an = STATE.analysis;
  an.hiddenActive = false; an.hiddens = []; an.hiddensIndex = 0;
  STATE.pinnedNum = 0;
  updateSinglesBtn(); updateActionBar(); renderHighlights();
}

/* Preenche apenas o single atual e desativa */
function executeFillSingles() {
  const an = STATE.analysis;
  if (!an.singlesActive || !an.singles.length) return;
  const { r, c, val } = an.singles[an.singlesIndex];
  if (STATE.puzzle[r][c] === 0) {
    pushUndo();
    STATE.puzzle[r][c] = val;
    STATE.score += calculateCellPoints();
    if (STATE.settings.autoRemoveNotes) removeRelatedNotes(r, c, val);
    updateCellContent(r, c);
    updateScoreDisplay(); renderNumpad(); updateProgressBar();
    checkWin();
  }
  deactivateSingles();
  renderHighlights();
}

function executeFillHiddenSingles() {
  const an = STATE.analysis;
  if (!an.hiddenActive || !an.hiddens.length) return;
  const { r, c, val } = an.hiddens[an.hiddensIndex];
  if (STATE.puzzle[r][c] === 0) {
    pushUndo();
    STATE.puzzle[r][c] = val;
    STATE.score += calculateCellPoints();
    if (STATE.settings.autoRemoveNotes) removeRelatedNotes(r, c, val);
    updateCellContent(r, c);
    updateScoreDisplay(); renderNumpad(); updateProgressBar();
    checkWin();
  }
  deactivateHiddenSingles();
  renderHighlights();
}

/* Atualiza btn-singles: active-mode + renomeia para "Ocultas" quando hiddenActive */
function updateSinglesBtn() {
  const btn = document.getElementById('btn-singles');
  if (!btn) return;
  const an = STATE.analysis;
  btn.classList.toggle('active-mode', an.singlesActive || an.hiddenActive);
  const lbl = btn.querySelector('span:last-child');
  if (lbl) lbl.textContent = an.hiddenActive ? 'Ocultas' : 'Únicas';
  btn.title = an.hiddenActive ? 'Ocultas (Hidden Singles)' : 'Únicas';
}

/* ─── Botão de ação (action bar) ─── */
function handleActionConfirm() {
  const an = STATE.analysis;
  if (an.singlesActive        && an.singles.length)        { executeFillSingles();       return; }
  if (an.hiddenActive         && an.hiddens.length)        { executeFillHiddenSingles(); return; }
  if (an.nakedPairsActive     && an.nakedPairs.length)     { executeNakedPairs();        return; }
  if (an.pointingActive       && an.pointings.length)      { executePointing();          return; }
  if (an.xwingActive          && an.xwings.length)         { executeXWing();             return; }
  if (an.ywingActive          && an.ywings.length)         { executeYWing();             return; }
}

function handleActionCancel() {
  const an = STATE.analysis;
  if (an.singlesActive)      { deactivateSingles();        return; }
  if (an.hiddenActive)       { deactivateHiddenSingles();  return; }
  if (an.nakedPairsActive)   { deactivateNakedPairs();     return; }
  if (an.pointingActive)     { deactivatePointing();  return; }
  if (an.xwingActive)        { deactivateXWing();     return; }
  if (an.ywingActive)        { deactivateYWing();     return; }
}

function updateActionBar() {
  const bar     = document.getElementById('action-bar');
  const label   = document.getElementById('action-bar-label');
  const confirm = document.getElementById('btn-action-confirm');
  if (!bar) return;

  const an = STATE.analysis;

  /* Únicas — cycling */
  if (an.singlesActive) {
    bar.classList.remove('hidden');
    if (an.singles.length) {
      const s = an.singles[an.singlesIndex];
      label.textContent   = `Única ${an.singlesIndex + 1}/${an.singles.length} · nº${s.val}`;
      confirm.textContent = '① Preencher';
      confirm.disabled    = false;
    } else {
      label.textContent   = 'Nenhuma única encontrada';
      confirm.textContent = '① Preencher';
      confirm.disabled    = true;
    }
    return;
  }

  /* Ocultas — cycling */
  if (an.hiddenActive) {
    bar.classList.remove('hidden');
    if (an.hiddens.length) {
      const h = an.hiddens[an.hiddensIndex];
      label.textContent   = `Oculta ${an.hiddensIndex + 1}/${an.hiddens.length} · nº${h.val}`;
      confirm.textContent = '① Preencher';
      confirm.disabled    = false;
    } else {
      label.textContent   = 'Nenhuma oculta encontrada';
      confirm.textContent = '① Preencher';
      confirm.disabled    = true;
    }
    return;
  }

  /* Pares Nus */
  if (an.nakedPairsActive) {
    bar.classList.remove('hidden');
    if (an.nakedPairs.length) {
      const np = an.nakedPairs[an.nakedPairsIndex];
      label.textContent   = `Par Nu ${an.nakedPairsIndex + 1}/${an.nakedPairs.length} · [${np.pairNums.join(',')}] · ${np.affected.length} eliminação(ões)`;
      confirm.textContent = '✓ Eliminar';
      confirm.disabled    = false;
    } else {
      label.textContent   = 'Nenhum Par Nu encontrado';
      confirm.textContent = '✓ Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  /* Par Apontador */
  if (an.pointingActive) {
    bar.classList.remove('hidden');
    if (an.pointings.length) {
      const pt = an.pointings[an.pointingIndex];
      label.textContent   = `Apontador ${an.pointingIndex + 1}/${an.pointings.length} · nº${pt.num} · ${pt.targets.length} eliminação(ões)`;
      confirm.textContent = '↗ Atirar';
      confirm.disabled    = false;
    } else {
      label.textContent   = 'Nenhum Par Apontador encontrado';
      confirm.textContent = '↗ Atirar';
      confirm.disabled    = true;
    }
    return;
  }

  /* X-Wing */
  if (an.xwingActive) {
    bar.classList.remove('hidden');
    if (an.xwings.length) {
      const xw = an.xwings[an.xwingIndex];
      label.textContent   = `X-Wing ${an.xwingIndex + 1}/${an.xwings.length} · nº${xw.num} · ${xw.targets.length} eliminação(ões)`;
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
    if (an.ywings.length) {
      const yw = an.ywings[an.ywingIndex];
      label.textContent   = `Y-Wing ${an.ywingIndex + 1}/${an.ywings.length} · elimina ${yw.elimVal} · ${yw.targets.length} célula(s)`;
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
  const ids = [
    ['btn-singles',    s.enableNakedSingles || s.enableHiddenSingles],
    ['btn-nakedpairs', s.enableNakedPairs],
    ['btn-pointing',   s.enablePointingPairs],
    ['btn-xwing',      s.enableXWing],
    ['btn-ywing',      s.enableYWing],
  ];
  ids.forEach(([id, visible]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('hidden', !visible);
  });

  const anyVisible = ids.some(([, v]) => v);
  const bar     = document.getElementById('analysis-tools');
  const section = document.getElementById('analysis-section');
  if (bar)     bar.classList.toggle('hidden', !anyVisible);
  if (section) section.classList.toggle('hidden', !anyVisible);
}

function resetAnalysis() {
  STATE.analysis = {
    singlesActive: false, singles: [], singlesIndex: 0,
    hiddenActive: false, hiddens: [], hiddensIndex: 0,
    nakedPairsActive: false, nakedPairs: [], nakedPairsIndex: 0,
    pointingActive: false, pointings: [], pointingIndex: 0,
    xwingActive: false, xwings: [], xwingIndex: 0,
    ywingActive: false, ywings: [], ywingIndex: 0,
  };
  const bar = document.getElementById('action-bar');
  if (bar) bar.classList.add('hidden');
  updateSinglesBtn();
  updateNakedPairsBtn();
  updatePointingBtn();
}

/* ─── X-Wing ─── */
function toggleXWing() {
  const an = STATE.analysis;
  if (!an.xwingActive) {
    /* Primeira ativação */
    an.xwings     = detectXWings();
    an.xwingIndex = 0;
    an.xwingActive = true;
  } else {
    /* Avança para o próximo padrão; se acabou, desativa */
    an.xwingIndex++;
    if (an.xwingIndex >= an.xwings.length) {
      deactivateXWing();
      return;
    }
  }
  /* Deseleciona tabuleiro ao ativar/ciclar */
  STATE.selectedRow = -1;
  STATE.selectedCol = -1;
  updateXWingBtn();
  updateActionBar();
  renderHighlights();
}

function deactivateXWing() {
  const an = STATE.analysis;
  an.xwingActive = false; an.xwings = []; an.xwingIndex = 0;
  updateXWingBtn(); updateActionBar(); renderHighlights();
}

function executeXWing() {
  const an = STATE.analysis;
  const xw = an.xwings[an.xwingIndex];
  if (!xw) { deactivateXWing(); return; }
  pushUndo();
  xw.targets.forEach(({ r, c }) => {
    STATE.notes[r][c].delete(xw.num);
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
  const an = STATE.analysis;
  if (!an.ywingActive) {
    /* Primeira ativação */
    an.ywings     = detectYWings();
    an.ywingIndex = 0;
    an.ywingActive = true;
  } else {
    /* Avança para o próximo padrão; se acabou, desativa */
    an.ywingIndex++;
    if (an.ywingIndex >= an.ywings.length) {
      deactivateYWing();
      return;
    }
  }
  /* Deseleciona tabuleiro ao ativar/ciclar */
  STATE.selectedRow = -1;
  STATE.selectedCol = -1;
  updateYWingBtn();
  updateActionBar();
  renderHighlights();
}

function deactivateYWing() {
  const an = STATE.analysis;
  an.ywingActive = false; an.ywings = []; an.ywingIndex = 0;
  updateYWingBtn(); updateActionBar(); renderHighlights();
}

function executeYWing() {
  const an = STATE.analysis;
  const yw = an.ywings[an.ywingIndex];
  if (!yw) { deactivateYWing(); return; }
  pushUndo();
  yw.targets.forEach(({ r, c }) => {
    STATE.notes[r][c].delete(yw.elimVal);
    updateCellContent(r, c);
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
  document.querySelectorAll('.note-digit.note-eliminate').forEach(s => s.classList.remove('note-eliminate'));
  document.querySelectorAll('.note-digit.note-hidden-single').forEach(s => s.classList.remove('note-hidden-single'));
  document.querySelectorAll('.note-digit.note-xwing').forEach(s => s.classList.remove('note-xwing'));
  document.querySelectorAll('.note-digit.note-ywing-pivot').forEach(s => s.classList.remove('note-ywing-pivot'));
  document.querySelectorAll('.note-digit.note-ywing-pincer').forEach(s => s.classList.remove('note-ywing-pincer'));

  const an = STATE.analysis;

  /* Únicas — apenas o single no índice atual */
  if (an.singlesActive && an.singles.length > 0) {
    const sg = an.singles[an.singlesIndex];
    if (sg) cellElements[sg.r][sg.c].classList.add('singles-match');
  }

  /* Ocultas — apenas o hidden single no índice atual, dígito em verde */
  if (an.hiddenActive && an.hiddens.length > 0) {
    const hd = an.hiddens[an.hiddensIndex];
    if (hd) {
      cellElements[hd.r][hd.c].classList.add('singles-match');
      const span = cellElements[hd.r][hd.c].querySelector(`.note-digit[data-note="${hd.val}"]`);
      if (span) span.classList.add('note-hidden-single');
    }
  }

  /* Pares Nus — apenas padrão atual */
  if (an.nakedPairsActive && an.nakedPairs.length > 0) {
    const np = an.nakedPairs[an.nakedPairsIndex];
    if (np) {
      np.pairCells.forEach(({ r, c }) => cellElements[r][c].classList.add('pair-select'));
      np.affected.forEach(({ r, c, nums }) => {
        cellElements[r][c].classList.add('pair-affected');
        nums.forEach(n => {
          const span = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (span) span.classList.add('note-eliminate');
        });
      });
    }
  }

  /* Par Apontador — apenas padrão atual */
  if (an.pointingActive && an.pointings.length > 0) {
    const pt = an.pointings[an.pointingIndex];
    if (pt) {
      pt.cells.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('pointing-select');
        const span = cellElements[r][c].querySelector(`.note-digit[data-note="${pt.num}"]`);
        if (span) span.classList.add('note-xwing'); /* verde para origem */
      });
      pt.targets.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('pointing-affected');
        const span = cellElements[r][c].querySelector(`.note-digit[data-note="${pt.num}"]`);
        if (span) span.classList.add('note-eliminate');
      });
    }
  }

  /* X-Wing — apenas padrão atual */
  if (an.xwingActive && an.xwings.length > 0) {
    const xw = an.xwings[an.xwingIndex];
    if (xw) {
      xw.cells.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('xwing-cell');
        const span = cellElements[r][c].querySelector(`.note-digit[data-note="${xw.num}"]`);
        if (span) span.classList.add('note-xwing');
      });
      xw.targets.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('xwing-target');
        const span = cellElements[r][c].querySelector(`.note-digit[data-note="${xw.num}"]`);
        if (span) span.classList.add('note-eliminate');
      });
    }
  }

  /* Y-Wing — apenas padrão atual */
  if (an.ywingActive && an.ywings.length > 0) {
    const yw = an.ywings[an.ywingIndex];
    if (yw) {
      const { r: pr, c: pc } = yw.pivot;
      cellElements[pr][pc].classList.add('ywing-pivot');
      STATE.notes[pr][pc].forEach(n => {
        const span = cellElements[pr][pc].querySelector(`.note-digit[data-note="${n}"]`);
        if (span) span.classList.add('note-ywing-pivot');
      });
      yw.pincers.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('ywing-pincer');
        STATE.notes[r][c].forEach(n => {
          const span = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (span) span.classList.add('note-ywing-pincer');
        });
      });
      yw.targets.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('ywing-target');
        const span = cellElements[r][c].querySelector(`.note-digit[data-note="${yw.elimVal}"]`);
        if (span) span.classList.add('note-eliminate');
      });
    }
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
  toggle('cfg-enableHiddenSingles',  s.enableHiddenSingles);
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
