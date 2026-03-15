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

  difficulty: '',
  errors:     0,
  score:      0,

  timerSeconds:  0,
  timerInterval: null,
  timerRunning:  false,

  undoStack: [],       // max 50 snapshots

  settings: {
    markErrors:        true,
    failOnErrors:      false,
    maxErrors:         3,
    autoRemoveNotes:   true,
    enhancedHighlight: true,
    autoAnnotations:   false,
  },
};

/* Cache dos elementos DOM do tabuleiro */
let cellElements = [];  // [9][9]

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
});

function buildNumpad() {
  const pad = document.getElementById('numpad');
  pad.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement('button');
    btn.className = 'num-btn';
    btn.dataset.num = n;
    btn.innerHTML = `${n}<span class="num-count"></span>`;
    pad.appendChild(btn);
  }
  const erase = document.createElement('button');
  erase.className = 'num-btn erase';
  erase.dataset.num = '0';
  erase.innerHTML = '⌫';
  pad.appendChild(erase);
}

/* ═══════════════════════════════════════
   EVENTOS
═══════════════════════════════════════ */
function attachEvents() {
  /* Dificuldade */
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => startGame(btn.dataset.diff));
  });

  /* Voltar */
  document.getElementById('btn-back').addEventListener('click', () => {
    if (STATE.timerRunning) stopTimer();
    showDifficultyScreen();
  });

  /* Ranking (home) */
  document.getElementById('btn-ranking-home').addEventListener('click', () => {
    openRanking();
  });

  /* Configurações (home e jogo) */
  document.getElementById('btn-settings-home').addEventListener('click', openSettings);
  document.getElementById('btn-settings-game').addEventListener('click', openSettings);

  /* Controles do jogo */
  document.getElementById('btn-undo').addEventListener('click', handleUndo);
  document.getElementById('btn-notes').addEventListener('click', toggleNotesMode);
  document.getElementById('btn-auto-notes').addEventListener('click', applyAutoAnnotations);

  /* Tabuleiro (delegação) */
  document.getElementById('board').addEventListener('click', e => {
    const cell = e.target.closest('[data-row]');
    if (!cell) return;
    handleCellClick(+cell.dataset.row, +cell.dataset.col);
  });

  /* Numpad (delegação) */
  document.getElementById('numpad').addEventListener('click', e => {
    const btn = e.target.closest('[data-num]');
    if (!btn) return;
    handleNumberInput(+btn.dataset.num);
  });

  /* Fechar modal ao clicar no overlay (mas não no sheet) */
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeAllModals();
  });

  /* Configurações */
  setupSettingsEvents();

  /* Modais de resultado */
  document.getElementById('btn-new-game-victory').addEventListener('click', showDifficultyScreen);
  document.getElementById('btn-retry-victory').addEventListener('click', restartGame);
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

  /* Teclado */
  document.addEventListener('keydown', handleKeyboard);
}

function setupSettingsEvents() {
  const keys = ['markErrors', 'failOnErrors', 'autoRemoveNotes', 'enhancedHighlight', 'autoAnnotations'];
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
    STATE.selectedRow = -1;
    STATE.selectedCol = -1;
    STATE.notesMode  = false;

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

    document.getElementById('difficulty-badge').textContent = DIFF_NAMES[difficulty];

    if (STATE.settings.autoAnnotations) applyAutoAnnotations();

    showLoading(false);
    showGameScreen();
  }, 30);
}

function restartGame() {
  closeAllModals();
  startGame(STATE.difficulty);
}

function endGame(won) {
  stopTimer();
  STATE.score = calculateScore();
  updateScoreDisplay();

  if (won) {
    const rankPos = saveToRanking();
    document.getElementById('v-score').textContent  = STATE.score;
    document.getElementById('v-time').textContent   = formatTime(STATE.timerSeconds);
    document.getElementById('v-errors').textContent = STATE.errors;
    document.getElementById('victory-diff-label').textContent =
      `Puzzle ${DIFF_NAMES[STATE.difficulty]} concluído`;
    document.getElementById('v-rank-info').textContent =
      rankPos ? `Você ficou em ${rankPos}º lugar no ranking!` : 'Pontuação salva no ranking!';
    openModal('modal-victory');
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
}

function updateCellContent(r, c) {
  const el = cellElements[r][c];
  const val = STATE.puzzle[r][c];
  const isGiven = STATE.givens.has(`${r},${c}`);
  const noteSet = STATE.notes[r][c];

  /* Classes base */
  el.className = 'cell';
  if (isGiven) {
    el.classList.add('given');
  } else if (val !== 0) {
    if (STATE.settings.markErrors && val !== STATE.solution[r][c]) {
      el.classList.add('error');
    }
  }

  /* Conteúdo */
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
    html += `<span class="note-digit${active ? ' active' : ''}">${active ? n : ''}</span>`;
  }
  html += '</div>';
  return html;
}

function renderHighlights() {
  const { selectedRow: sr, selectedCol: sc, puzzle, settings } = STATE;

  /* Limpa todos os destaques */
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      cellElements[r][c].classList.remove('selected', 'highlight', 'highlight-strong', 'same-num');

  if (sr < 0 || !cellElements.length) return;

  const selVal = puzzle[sr][sc];

  if (settings.enhancedHighlight && selVal > 0) {
    /* ── Seleção Aprimorada ──
       Coleta TODOS os rows, cols e quadrantes que contêm selVal.
       Sombreia TUDO que pertença a pelo menos um deles.
       O que sobra (sem sombra) são as células onde selVal poderia ir. */
    const hRows  = new Set();
    const hCols  = new Set();
    const hBoxes = new Set();

    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (puzzle[r][c] === selVal) {
          hRows.add(r);
          hCols.add(c);
          hBoxes.add(Math.floor(r / 3) * 3 + Math.floor(c / 3));
        }

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const el = cellElements[r][c];
        if (r === sr && c === sc) {
          el.classList.add('selected');
        } else if (puzzle[r][c] === selVal) {
          el.classList.add('same-num');
        } else {
          const boxIdx = Math.floor(r / 3) * 3 + Math.floor(c / 3);
          if (hRows.has(r) || hCols.has(c) || hBoxes.has(boxIdx)) {
            el.classList.add('highlight-strong');
          }
          /* células fora de todos os rows/cols/boxes ficam sem sombra */
        }
      }
    }
  } else {
    /* ── Seleção padrão: linha, coluna e quadrante da seleção ── */
    const br = Math.floor(sr / 3) * 3;
    const bc = Math.floor(sc / 3) * 3;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const el = cellElements[r][c];
        if (r === sr && c === sc) {
          el.classList.add('selected');
        } else if (selVal > 0 && puzzle[r][c] === selVal) {
          el.classList.add('same-num');
        } else if (
          r === sr || c === sc ||
          (r >= br && r < br + 3 && c >= bc && c < bc + 3)
        ) {
          el.classList.add('highlight');
        }
      }
    }
  }
}

function renderNumpad() {
  /* Conta quantas vezes cada dígito aparece no puzzle */
  const count = new Array(10).fill(0);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (STATE.puzzle[r][c]) count[STATE.puzzle[r][c]]++;

  const selVal = (STATE.selectedRow >= 0) ? STATE.puzzle[STATE.selectedRow][STATE.selectedCol] : 0;

  document.querySelectorAll('.num-btn:not(.erase)').forEach(btn => {
    const n = +btn.dataset.num;
    const remaining = 9 - count[n];
    btn.classList.toggle('done', remaining <= 0);
    btn.classList.toggle('selected-num', n === selVal && selVal > 0);
    const cntEl = btn.querySelector('.num-count');
    if (cntEl) cntEl.textContent = remaining > 0 ? remaining : '';
  });
}

/* ═══════════════════════════════════════
   INPUT DO USUÁRIO
═══════════════════════════════════════ */
function handleCellClick(r, c) {
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
  const { selectedRow: r, selectedCol: c } = STATE;
  if (r < 0) return;
  if (STATE.givens.has(`${r},${c}`)) return;

  if (STATE.notesMode && num !== 0) {
    doToggleNote(r, c, num);
  } else {
    doPlaceNumber(r, c, num);
  }
}

function doPlaceNumber(r, c, num) {
  pushUndo();
  STATE.puzzle[r][c] = num;

  const isError = num !== 0 && num !== STATE.solution[r][c];
  if (isError) {
    STATE.errors++;
    updateErrorDisplay();
  }

  if (num !== 0 && STATE.settings.autoRemoveNotes) {
    removeRelatedNotes(r, c, num);
  }

  updateCellContent(r, c);
  renderHighlights();
  renderNumpad();

  /* Animação de erro APÓS atualizar o conteúdo */
  if (isError) {
    shakeCell(r, c);
    if (STATE.settings.failOnErrors && STATE.errors >= STATE.settings.maxErrors) {
      setTimeout(() => endGame(false), 400);
      return;
    }
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
  const snap = STATE.undoStack.pop();
  STATE.puzzle = snap.puzzle;
  STATE.notes  = snap.notes;
  STATE.errors = snap.errors;
  updateErrorDisplay();
  renderBoard();
  renderNumpad();
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
  setTimeout(() => endGame(true), 200);
}

function calculateScore() {
  const multiplier  = SudokuGenerator.getMultiplier(STATE.difficulty);
  const timeBonus   = Math.max(0, 3000 - STATE.timerSeconds);
  const errorPenalty = STATE.errors * 50;
  return Math.max(0, Math.floor((timeBonus - errorPenalty) * multiplier));
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
    puzzle: STATE.puzzle.map(row => [...row]),
    notes:  STATE.notes.map(row => row.map(set => new Set(set))),
    errors: STATE.errors,
  });
  if (STATE.undoStack.length > 50) STATE.undoStack.shift();
}

/* ═══════════════════════════════════════
   TIMER
═══════════════════════════════════════ */
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
  document.getElementById('btn-notes').classList.toggle('active-mode', STATE.notesMode);
}

function updateScoreDisplay() {
  document.getElementById('score-val').textContent = STATE.score;
}

function updateErrorDisplay() {
  const el = document.getElementById('error-badge');
  el.textContent = STATE.errors;
  el.classList.toggle('has-errors', STATE.errors > 0);
}

function shakeCell(r, c) {
  const el = cellElements[r] && cellElements[r][c];
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
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

  document.getElementById('max-errors-val').textContent = s.maxErrors;
  document.getElementById('max-errors-row').classList.toggle('hidden', !s.failOnErrors);
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
