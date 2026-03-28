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
  energyPoints: parseInt(localStorage.getItem('sudoku-energy') || '0', 10),
  streakCount:        0,       // acertos consecutivos
  comboMultiplier:    1,       // multiplicador por streak (1x, 2x, 3x…)
  timeMultiplier:     1,       // multiplicador por tempo (5x→4x→3x→2x→1x)
  multiplierDisabled: false,   // true se btn-fill foi usado no puzzle
  puzzleStartTime:    0,       // Date.now() ao iniciar puzzle
  fillUsedThisPuzzle: false,
  gameOver: false,

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
    singlesBatch:       false,     // true = mostra todos de uma vez

    /* Ocultas (Hidden Singles) — compartilha singlesBatch */
    hiddenActive:       false,
    hiddens:            [],        // [{r, c, val, unitType, unitIdx}]
    hiddensIndex:       0,

    /* Pares Nus (Naked Pairs) — auto-detect cycling */
    nakedPairsActive:   false,
    nakedPairs:         [],        // [{pairNums, pairCells:[{r,c}], affected:[{r,c,nums:Set}]}]
    nakedPairsIndex:    0,
    nakedPairsBatch:    false,

    /* Par Apontador (Pointing Pairs) — auto-detect cycling */
    pointingActive:     false,
    pointings:          [],        // [{num, cells:[{r,c}], targets:[{r,c}]}]
    pointingIndex:      0,
    pointingBatch:      false,

    /* X-Wing */
    xwingActive:        false,
    xwings:             [],
    xwingIndex:         0,
    xwingBatch:         false,

    /* Y-Wing */
    ywingActive:        false,
    ywings:             [],
    ywingIndex:         0,
    ywingBatch:         false,

    /* W-Wing */
    wwingActive:        false,
    wwings:             [],
    wwingIndex:         0,
    wwingBatch:         false,

    /* Hidden Pairs */
    hiddenpairsActive: false, hiddenpairs: [], hiddenpairsIndex: 0, hiddenpairsBatch: false,
    /* Naked Triples */
    nakedtriplesActive: false, nakedtriples: [], nakedtriplesIndex: 0, nakedtriplesBatch: false,
    /* Hidden Triples */
    hiddentriplesActive: false, hiddentriples: [], hiddentriplesIndex: 0, hiddentriplesBatch: false,
    /* Swordfish */
    swordfishActive: false, swordfishes: [], swordfishIndex: 0, swordfishBatch: false,
    /* XY-Chain */
    xychainActive: false, xychains: [], xychainIndex: 0, xychainBatch: false,
    /* Coloring */
    coloringActive: false, colorings: [], coloringIndex: 0, coloringBatch: false,
    /* Forcing Chains */
    forcingchainsActive: false, forcingchains: [], forcingchainsIndex: 0, forcingchainsBatch: false,
    /* AIC */
    aicActive: false, aics: [], aicIndex: 0, aicBatch: false,
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
    enableWWing:         true,
    mentorMode:          false,
    filterByDifficulty:  false,
    language:            'pt',
    enableHiddenPairs:   true,
    enableNakedTriples:  true,
    enableHiddenTriples: true,
    enableSwordfish:     true,
    enableXYChain:       true,
    enableColoring:      true,
    enableForcingChains: true,
    enableAIC:           true,
    helpLevel2:          true,
    enableLongPressBatch:true,
    showSelZone:         true,
    showNoteMatch:       true,
    enableDialPin:       true,
    nakedSingleMode:     0,
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

const ENERGY_TABLE = {
  facil:        { cell: 1, unit: 1, finish: 2 },
  medio:        { cell: 2, unit: 2, finish: 4 },
  dificil:      { cell: 3, unit: 3, finish: 6 },
  especialista: { cell: 4, unit: 4, finish: 8 },
  mestre:       { cell: 5, unit: 5, finish: 10 },
  extremo:      { cell: 6, unit: 6, finish: 12 },
  diabolico:    { cell: 6, unit: 6, finish: 12 },
};

const ERROR_PENALTY = {
  facil:        10,
  medio:        20,
  dificil:      30,
  especialista: 40,
  mestre:       50,
  extremo:      60,
  diabolico:    60,
};

const TOOL_ENERGY_COST = {
  singles:    20,   // Únicas             → nível Fácil
  hiddens:    20,   // Ocultas            → nível Fácil
  nakedpairs: 40,   // Pares Nus          → nível Médio
  pointing:   60,   // Apontador          → nível Difícil
  xwing:      80,   // X-Wing             → nível Especialista
  ywing:     100,   // Y-Wing             → nível Mestre
  wwing:     120,   // W-Wing             → nível Extremo
};

/* ── Unlock system ── */
const DIFF_UNLOCK_REQUIRED = {
  facil:        0,
  medio:        3,
  dificil:      5,
  especialista: 7,
  mestre:       10,
  extremo:      15,
};
const DIFF_ORDER = ['facil','medio','dificil','especialista','mestre','extremo'];
let _logoClickCount = 0, _logoClickTimer = null, _allUnlocked = false;

function getCompletions() {
  try { return JSON.parse(localStorage.getItem('sudoku-completions') || '{}'); } catch { return {}; }
}
function addCompletion(diff) {
  const c = getCompletions();
  c[diff] = (c[diff] || 0) + 1;
  localStorage.setItem('sudoku-completions', JSON.stringify(c));
}
function isDiffUnlocked(diff) {
  if (_allUnlocked) return true;
  const req = DIFF_UNLOCK_REQUIRED[diff];
  if (req === 0) return true;
  const idx = DIFF_ORDER.indexOf(diff);
  if (idx <= 0) return true;
  const prevDiff = DIFF_ORDER[idx - 1];
  return (getCompletions()[prevDiff] || 0) >= req;
}
function updateDiffButtons() {
  const completions = getCompletions();
  // Find the first locked difficulty and show info for it
  let nextLockText = '';
  DIFF_ORDER.forEach(diff => {
    const btn = document.querySelector(`.diff-btn[data-diff="${diff}"]`);
    if (!btn) return;
    const unlocked = isDiffUnlocked(diff);
    btn.classList.toggle('locked', !unlocked);
  });
  // Find first locked
  for (const diff of DIFF_ORDER) {
    if (!isDiffUnlocked(diff)) {
      const idx = DIFF_ORDER.indexOf(diff);
      const prevDiff = DIFF_ORDER[idx - 1];
      const req = DIFF_UNLOCK_REQUIRED[diff];
      const have = completions[prevDiff] || 0;
      const remaining = req - have;
      const diffLabel = DIFF_NAMES[diff] || diff;
      const prevLabel = DIFF_NAMES[prevDiff] || prevDiff;
      nextLockText = `🔒 Faltam ${remaining} partida(s) de ${prevLabel} para desbloquear ${diffLabel}`;
      break;
    }
  }
  const infoEl = document.getElementById('next-unlock-info');
  const textEl = document.getElementById('next-unlock-text');
  if (infoEl && textEl) {
    infoEl.classList.toggle('hidden', !nextLockText);
    textEl.textContent = nextLockText;
  }
}
function _attachLogoUnlock() {
  const logo = document.querySelector('.diff-logo');
  if (!logo) return;
  logo.addEventListener('click', () => {
    _logoClickCount++;
    clearTimeout(_logoClickTimer);
    _logoClickTimer = setTimeout(() => { _logoClickCount = 0; }, 2000);
    if (_logoClickCount >= 15) {
      _logoClickCount = 0;
      _allUnlocked = !_allUnlocked;
      updateDiffButtons();
      logo.style.transform = 'scale(1.1)';
      setTimeout(() => logo.style.transform = '', 300);
    }
  });
}

/* ═══════════════════════════════════════
   INICIALIZAÇÃO
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  if (STATE.settings.helpLevel2 === undefined) STATE.settings.helpLevel2 = true;
  if (STATE.settings.enableLongPressBatch === undefined) STATE.settings.enableLongPressBatch = true;
  document.body.classList.toggle('help-lvl1', !STATE.settings.helpLevel2);
  applyLanguage(STATE.settings.language || 'pt');
  buildNumpad();
  attachEvents();
  syncSettingsUI();
  checkIOSBanner();
  checkSavedSession();
  updateDiffButtons();
  _attachLogoUnlock();
  updateEnergyBar();   // exibe XP salvo ao carregar a página
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
    btn.addEventListener('click', () => {
      if (!isDiffUnlocked(btn.dataset.diff)) return;
      requestNewGame(btn.dataset.diff);
    });
  });
  updateDiffButtons();

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
  attachToolBtn('btn-sim',
    /* tap  — descarta modificações */
    () => { if (STATE.simulator.active) deactivateSimulator(); else activateSimulator(); },
    /* long-press — efetiva modificações */
    () => { if (STATE.simulator.active) commitSimulator(); else activateSimulator(); }
  );

  attachToolBtn('btn-singles',       toggleSingles,       longPressSingles);
  attachToolBtn('btn-hiddens',       toggleHiddens,       longPressHiddens);
  attachToolBtn('btn-nakedpairs',    toggleNakedPairs,    longPressNakedPairs);
  attachToolBtn('btn-hiddenpairs',   toggleHiddenPairs,   longPressHiddenPairs);
  attachToolBtn('btn-pointing',      togglePointing,      longPressPointing);
  attachToolBtn('btn-xwing',         toggleXWing,         longPressXWing);
  attachToolBtn('btn-nakedtriples',  toggleNakedTriples,  longPressNakedTriples);
  attachToolBtn('btn-hiddentriples', toggleHiddenTriples, longPressHiddenTriples);
  attachToolBtn('btn-swordfish',     toggleSwordfish,     longPressSwordfish);
  attachToolBtn('btn-ywing',         toggleYWing,         longPressYWing);
  attachToolBtn('btn-wwing',         toggleWWing,         longPressWWing);
  attachToolBtn('btn-xychain',       toggleXYChain,       longPressXYChain);
  attachToolBtn('btn-coloring',      toggleColoring,      longPressColoring);
  attachToolBtn('btn-forcingchains', toggleForcingChains, longPressForcingChains);
  attachToolBtn('btn-aic',           toggleAIC,           longPressAIC);

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

  /* Gênio da Lâmpada — 3 cliques rápidos no placar */
  _attachGenioTrigger();

  /* Settings close button */
  const scBtn = document.getElementById('btn-settings-close');
  if (scBtn) scBtn.addEventListener('click', closeAllModals);

  /* Mentor buttons */
  const mentorInfoBtn = document.getElementById('btn-mentor-info');
  if (mentorInfoBtn) mentorInfoBtn.addEventListener('click', showMentorForActiveAnalysis);
  const mentorCloseBtn = document.getElementById('btn-mentor-close');
  if (mentorCloseBtn) mentorCloseBtn.addEventListener('click', hideMentorPanel);

  /* Language buttons */
  const langPt = document.getElementById('lang-pt');
  const langEn = document.getElementById('lang-en');
  if (langPt) langPt.addEventListener('click', () => applyLanguage('pt'));
  if (langEn) langEn.addEventListener('click', () => applyLanguage('en'));

  /* Teclado */
  document.addEventListener('keydown', handleKeyboard);
}

function setupSettingsEvents() {
  const keys = ['markErrors', 'failOnErrors', 'autoRemoveNotes', 'enhancedHighlight', 'autoAnnotations', 'simulatorMode', 'enableNakedSingles', 'enableHiddenSingles', 'enableNakedPairs', 'enablePointingPairs', 'enableXWing', 'enableYWing', 'enableWWing', 'mentorMode', 'filterByDifficulty', 'enableHiddenPairs', 'enableNakedTriples', 'enableHiddenTriples', 'enableSwordfish', 'enableXYChain', 'enableColoring', 'enableForcingChains', 'enableAIC', 'helpLevel2', 'enableLongPressBatch', 'showSelZone', 'showNoteMatch', 'enableDialPin'];
  keys.forEach(key => {
    const el = document.getElementById('cfg-' + key);
    if (!el) return;
    el.addEventListener('change', () => {
      STATE.settings[key] = el.checked;
      saveSettings();
      if (key === 'failOnErrors') {
        document.getElementById('max-errors-row').classList.toggle('hidden', !el.checked);
      }
      if (key === 'enableNakedSingles') {
        const row = document.getElementById('setting-row-hidden-singles');
        if (row) row.classList.toggle('hidden', !el.checked);
        /* Se desativou Únicas, desativa Ocultas também */
        if (!el.checked) {
          STATE.settings.enableHiddenSingles = false;
          const hEl = document.getElementById('cfg-enableHiddenSingles');
          if (hEl) hEl.checked = false;
          saveSettings();
          updateAnalysisToolsVisibility();
        }
      }
      if (key === 'markErrors' || key === 'enhancedHighlight') {
        if (STATE.puzzle) renderBoard();
      }
      if (key === 'showSelZone' || key === 'showNoteMatch') {
        if (STATE.puzzle) renderHighlights();
      }
      if (key === 'enableDialPin' && !el.checked) {
        STATE.pinnedNum = 0;
        if (STATE.puzzle) { renderNumpad(); renderHighlights(); }
      }
      if (key === 'autoAnnotations' && el.checked && STATE.puzzle) {
        applyAutoAnnotations();
      }
      if (key === 'simulatorMode') {
        updateControlsForSimMode();
      }
      if (key === 'helpLevel2') {
        document.body.classList.toggle('help-lvl1', !STATE.settings.helpLevel2);
        updateEnergyBar();
        updateActionBar();
      }
      if (key === 'autoAnnotations') {
        updateFillBtnVisibility();
      }
      if (key === 'mentorMode') {
        updateMentorButton();
      }
      if (key === 'filterByDifficulty') {
        updateAnalysisToolsVisibility();
      }
      if (['enableNakedSingles', 'enableHiddenSingles', 'enableNakedPairs', 'enablePointingPairs', 'enableXWing', 'enableYWing', 'enableWWing', 'enableHiddenPairs', 'enableNakedTriples', 'enableHiddenTriples', 'enableSwordfish', 'enableXYChain', 'enableColoring', 'enableForcingChains', 'enableAIC'].includes(key)) {
        updateAnalysisToolsVisibility();
      }
    });
  });

  /* Tri-toggle for Naked Single mode */
  const nsToggleEl = document.getElementById('cfg-nakedSingleMode');
  if (nsToggleEl) {
    nsToggleEl.querySelectorAll('.tri-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val);
        STATE.settings.nakedSingleMode = val;
        saveSettings();
        nsToggleEl.querySelectorAll('.tri-btn').forEach(b =>
          b.classList.toggle('active', +b.dataset.val === val));
        _nsGen++;
        if (STATE.puzzle) renderHighlights();
      });
    });
  }

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
      if (STATE.settings.enableLongPressBatch) {
        longPressFn();
      } else {
        tapFn();
      }
    }, 600);
  };

  const cancelTimer = () => {
    if (_toolLongPressTimer) { clearTimeout(_toolLongPressTimer); _toolLongPressTimer = null; }
  };

  /* TOUCH: sem preventDefault — o browser gera o evento 'click' normalmente.
     touchstart/touchend só gerenciam o timer de long-press.
     O tap real é tratado apenas no 'click', que dispara UMA VEZ por interação. */
  btn.addEventListener('touchstart', startPress, { passive: true });
  btn.addEventListener('touchend',   cancelTimer);
  btn.addEventListener('touchcancel', cancelTimer);

  /* MOUSE/DESKTOP: mousedown inicia o timer; mouseup/leave cancelam. */
  btn.addEventListener('mousedown',  startPress);
  btn.addEventListener('mouseup',    cancelTimer);
  btn.addEventListener('mouseleave', cancelTimer);

  /* Único ponto de execução do tap — dispara para touch e mouse. */
  btn.addEventListener('click', () => {
    if (_toolLongPressTriggered) { _toolLongPressTriggered = false; return; }
    if (!STATE.puzzle || STATE.paused) return;
    tapFn();
  });
}

/* Long-press — ativa modo lote (batch): mostra TODOS os achados de uma vez.
   Se já estiver ativo: entra em lote. Se não estiver ativo: detecta e entra em lote. */
function longPressSingles() {
  const an = STATE.analysis;
  if (!an.singlesActive) toggleSingles();
  if (an.singlesActive && an.singles.length > 0 && !an.singlesBatch) {
    const remain = an.singles.slice(an.singlesIndex);
    if (remain.length > 1) {
      an.singles = an.singles.slice(0, an.singlesIndex).concat(_applyBatchEnergy('singles', remain));
    }
    an.singlesBatch = true; STATE.pinnedNum = 0;
    updateSinglesBtn(); updateActionBar(); renderHighlights(); renderNumpad();
  }
}
function longPressHiddens() {
  const an = STATE.analysis;
  if (!an.hiddenActive) toggleHiddens();
  if (an.hiddenActive && an.hiddens.length > 0 && !an.hiddensBatch) {
    const remain = an.hiddens.slice(an.hiddensIndex);
    if (remain.length > 1) {
      an.hiddens = an.hiddens.slice(0, an.hiddensIndex).concat(_applyBatchEnergy('hiddens', remain));
    }
    an.hiddensBatch = true; STATE.pinnedNum = 0;
    updateHiddensBtn(); updateActionBar(); renderHighlights(); renderNumpad();
  }
}
function longPressNakedPairs() {
  const an = STATE.analysis;
  if (!an.nakedPairsActive) toggleNakedPairs();
  if (an.nakedPairsActive && an.nakedPairs.length > 0 && !an.nakedPairsBatch) {
    an.nakedPairs = _applyBatchEnergy('nakedpairs', an.nakedPairs);
    an.nakedPairsBatch = true;
    updateNakedPairsBtn(); updateActionBar(); renderHighlights();
  }
}
function longPressPointing() {
  const an = STATE.analysis;
  if (!an.pointingActive) togglePointing();
  if (an.pointingActive && an.pointings.length > 0 && !an.pointingBatch) {
    an.pointings = _applyBatchEnergy('pointing', an.pointings);
    an.pointingBatch = true;
    updatePointingBtn(); updateActionBar(); renderHighlights();
  }
}
function longPressXWing() {
  const an = STATE.analysis;
  if (!an.xwingActive) toggleXWing();
  if (an.xwingActive && an.xwings.length > 0 && !an.xwingBatch) {
    an.xwings = _applyBatchEnergy('xwing', an.xwings);
    an.xwingBatch = true;
    updateXWingBtn(); updateActionBar(); renderHighlights();
  }
}
function longPressYWing() {
  const an = STATE.analysis;
  if (!an.ywingActive) toggleYWing();
  if (an.ywingActive && an.ywings.length > 0 && !an.ywingBatch) {
    an.ywings = _applyBatchEnergy('ywing', an.ywings);
    an.ywingBatch = true;
    updateYWingBtn(); updateActionBar(); renderHighlights();
  }
}

/* ═══════════════════════════════════════
   CICLO DO JOGO
═══════════════════════════════════════ */
function startGame(difficulty) {
  STATE.gameOver   = false;
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

    STATE.streakCount        = 0;
    STATE.comboMultiplier    = 1;
    STATE.timeMultiplier     = 1;
    STATE.multiplierDisabled = false;
    STATE.fillUsedThisPuzzle = false;
    STATE.puzzleStartTime    = Date.now();
    document.getElementById('fill-cost-badge')?.classList.remove('paid');
    updateFillCostDisplay();

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
    updateEnergyBar();
    updateErrorDisplay();
    updateBestScore();
    updateProgressBar();

    document.getElementById('difficulty-badge').textContent = DIFF_NAMES[difficulty];

    updateFillBtn();
    updateFillBtnVisibility();
    updateSimBtn();
    updateControlsForSimMode();
    updateAnalysisToolsVisibility();
    /* autoAnnotations: only controls btn-fill visibility — no auto-fill on start */

    showLoading(false);
    showGameScreen();
  }, 30);
}

function restartGame() {
  closeAllModals();
  startGame(STATE.difficulty);
}

function requestNewGame(diff) {
  if (!isDiffUnlocked(diff)) return; // silently ignore locked levels
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
  STATE.gameOver = true;
  _nsGen++;
  stopTimer();
  clearSession();
  STATE.score = calculateScore();
  updateScoreDisplay();

  STATE.streakCount = 0;
  STATE.comboMultiplier = 1;

  if (won) {
    addCompletion(STATE.difficulty);
    updateDiffButtons();
    celebrateVictory();
    const energyTable = ENERGY_TABLE[STATE.difficulty] || ENERGY_TABLE.facil;
    awardEnergy(energyTable.finish);
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
    el.classList.add(seq % 2 === 1 ? 'sim-blue' : 'sim-yellow');
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
        'selected', 'same-num', 'highlight-sel', 'highlight-match', 'sim-conflict', 'naked-single'
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
    /* Função 4 destaca rascunhos apenas se Função 2 (showNoteMatch) estiver ativa */
    if (settings.showNoteMatch) {
      document.querySelectorAll(`.note-digit[data-note="${pn}"].active`)
        .forEach(s => s.classList.add('note-match'));
    }
  }

  /* Se nenhuma célula selecionada, encerra após pinned e análise */
  if (sr < 0) {
    if (STATE.simulator.active) renderSimConflicts();
    renderAnalysisHighlights();   /* garante que análises ativas continuam visíveis */
    return;
  }

  const selVal  = puzzle[sr][sc];
  const selBox  = Math.floor(sr / 3) * 3 + Math.floor(sc / 3);

  /* ── Seleção de célula ──
     Função 1 (showSelZone):    verde nas células com o mesmo número
     Função 1.1 (enhancedHighlight): azul na zona (linha/coluna/quadrante) — prioridade sobre verde */
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const el     = cellElements[r][c];
      const boxIdx = Math.floor(r / 3) * 3 + Math.floor(c / 3);

      if (r === sr && c === sc) {
        el.classList.add('selected');
      } else if (settings.enhancedHighlight && (r === sr || c === sc || boxIdx === selBox)) {
        el.classList.remove('highlight-match');
        el.classList.remove('same-num');
        el.classList.add('highlight-sel');
      } else if (settings.showSelZone && selVal > 0 && puzzle[r][c] === selVal) {
        el.classList.add('same-num');
      }
    }
  }

  /* ── Feature 2: Destaca dígitos de anotação que coincidem com o número selecionado ── */
  if (settings.showNoteMatch && selVal > 0) {
    document.querySelectorAll(`.note-digit[data-note="${selVal}"].active`)
      .forEach(s => s.classList.add('note-match'));
  }

  /* ── Conflitos no modo simulador ── */
  if (STATE.simulator.active) renderSimConflicts();

  /* ── Destaques de análise ── */
  renderAnalysisHighlights();

  /* ── Feature 5: Naked Single highlights ── */
  const nsMode = settings.nakedSingleMode || 0;
  if (nsMode >= 1 && STATE.puzzle) {
    const nsNum = STATE.pinnedNum > 0 ? STATE.pinnedNum
                : (sr >= 0 && puzzle[sr][sc] > 0 ? puzzle[sr][sc] : 0);
    if (nsNum > 0) {
      getNakedSinglesForNum(nsNum).forEach(([r, c]) => {
        const el = cellElements[r][c];
        if (!el.classList.contains('selected') && !el.classList.contains('highlight-sel'))
          el.classList.add('naked-single');
      });
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
    /* Simulator pin-click: auto-fill if cell has pinned number as note */
    if (STATE.simulator.active && STATE.pinnedNum > 0 &&
        STATE.puzzle[r][c] === 0 && STATE.notes[r][c].has(STATE.pinnedNum)) {
      handleNumberInput(STATE.pinnedNum);
      return;
    }
  }
  renderHighlights();
  renderNumpad();
  /* Naked Single level 2 auto-fill */
  if (STATE.settings.nakedSingleMode === 2 && STATE.selectedRow === r && STATE.selectedCol === c) {
    const num = STATE.puzzle[r][c];
    if (num > 0) triggerNakedSingleFill(num, cellElements[r][c]);
  }
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
  const isMistake    = num !== 0 && num !== STATE.solution[r][c];
  /* Só penaliza se markErrors estiver ativo; caso contrário trata como acerto */
  const isError      = isMistake && STATE.settings.markErrors;
  if (isError) {
    STATE.errors++;
    updateErrorDisplay();
    const penalty = ERROR_PENALTY[STATE.difficulty] || 10;
    STATE.energyPoints = Math.max(0, STATE.energyPoints - penalty);
    localStorage.setItem('sudoku-energy', STATE.energyPoints);
    updateEnergyBar();
    _flashEnergyLoss();

    STATE.streakCount = 0;
    STATE.comboMultiplier = 1;
    updateEnergyBar();
  } else if (num !== 0) {
    STATE.score += calculateCellPoints();
    updateScoreDisplay();

    STATE.streakCount++;
    const prevCombo = STATE.comboMultiplier;
    STATE.comboMultiplier = Math.floor(STATE.streakCount / 10) + 1;
    if (STATE.comboMultiplier > prevCombo) {
      const fill = document.getElementById('energy-bar-fill');
      if (fill) {
        fill.classList.add('streak-leveling');
        setTimeout(() => { 
          fill.classList.remove('streak-leveling'); 
          updateEnergyBar(); 
        }, 350);
      }
      _showMultiplierPopup(STATE.comboMultiplier);
    } else {
      updateEnergyBar();
    }

    const energyTable = ENERGY_TABLE[STATE.difficulty] || ENERGY_TABLE.facil;
    awardEnergy(energyTable.cell);
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
    setTimeout(() => _checkCompletedUnits(r, c), 80);
    let count = 0;
    for (let rr = 0; rr < 9; rr++)
      for (let cc = 0; cc < 9; cc++)
        if (STATE.puzzle[rr][cc] === num) count++;
    if (count === 9) setTimeout(() => celebrateDigit(num), 80);
    /* Naked Single level 2: continue filling after correct placement */
    if (STATE.settings.nakedSingleMode === 2)
      setTimeout(() => triggerNakedSingleFill(num, cellElements[r][c]), 200);
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

  /* Penalidade de energia pelo undo (apenas fora do simulador) */
  if (!STATE.simulator.active) {
    const base     = (ENERGY_TABLE[STATE.difficulty] || ENERGY_TABLE.facil).cell;
    const undoCost = (base + STATE.undoCount) * 2;
    STATE.energyPoints = Math.max(0, STATE.energyPoints - undoCost);
    localStorage.setItem('sudoku-energy', STATE.energyPoints);
    _flashEnergyLoss();
    updateEnergyBar();

    /* Desfazer zera o multiplicador */
    STATE.streakCount     = 0;
    STATE.comboMultiplier = 1;
  }

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

/* Verifica e recompensa linhas/colunas/quadrantes completados */
function _checkCompletedUnits(r, c) {
  const puz   = STATE.puzzle;
  const table = ENERGY_TABLE[STATE.difficulty] || ENERGY_TABLE.facil;
  const filled = (row, col) => puz[row][col] !== 0;

  // Linha
  if ([0,1,2,3,4,5,6,7,8].every(cc => filled(r, cc)))
    awardEnergy(table.unit);
  // Coluna
  if ([0,1,2,3,4,5,6,7,8].every(rr => filled(rr, c)))
    awardEnergy(table.unit);
  // Quadrante
  const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
  let boxComplete = true;
  outer: for (let rr = br; rr < br+3; rr++)
    for (let cc = bc; cc < bc+3; cc++)
      if (!filled(rr, cc)) { boxComplete = false; break outer; }
  if (boxComplete) awardEnergy(table.unit);
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
  if (!STATE.puzzle || STATE.gameOver) return;
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
  updateEnergyBar();
  updateErrorDisplay();
  updateBestScore();
  updateProgressBar();
  updateFillBtn();
  updateFillBtnVisibility();
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

function getTimeMultiplier() {
  if (STATE.multiplierDisabled) return 1;
  const elapsed = (Date.now() - STATE.puzzleStartTime) / 1000;
  if (elapsed <= 5)  return 5;
  if (elapsed <= 9)  return 4;
  if (elapsed <= 12) return 3;
  if (elapsed <= 15) return 2;
  return 1;
}

function getFinalMultiplier() {
  if (STATE.multiplierDisabled) return 1;
  return STATE.comboMultiplier * getTimeMultiplier();
}

let _multiplierPopupTimer = null;

function _showMultiplierPopup(level) {
  const el = document.getElementById('multiplier-popup');
  if (!el || level <= 1) return;
  el.textContent = `×${level}`;
  el.classList.remove('hidden');
  el.style.background = _getMultiplierBg(level);
  if (_multiplierPopupTimer) clearTimeout(_multiplierPopupTimer);
  _multiplierPopupTimer = setTimeout(() => el.classList.add('hidden'), 2500);
}

function _getMultiplierBg(level) {
  const map = { 2: '#059669', 3: '#D97706', 4: '#DC2626', 5: '#7C3AED' };
  return map[Math.min(level, 5)] || '#1E293B';
}

function _showEnergyGain(points) {
  const container = document.getElementById('energy-top-row');
  if (!container || points <= 0) return;

  const el = document.createElement('span');
  el.className = 'energy-gain-pop';
  el.textContent = '+' + points;

  if (points >= 20) el.classList.add('gain-large');
  else if (points >= 10) el.classList.add('gain-medium');

  container.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function awardEnergy(points) {
  const finalPoints = points * getFinalMultiplier();
  _showEnergyGain(finalPoints);
  STATE.energyPoints += finalPoints;
  localStorage.setItem('sudoku-energy', STATE.energyPoints);
  updateEnergyBar();
}

function updateEnergyBar() {
  const fill  = document.getElementById('energy-bar-fill');
  const label = document.getElementById('energy-value');
  if (!fill || !label) return;

  label.textContent = STATE.energyPoints.toLocaleString('pt-BR');

  const STREAK_COLORS = {
    1: 'linear-gradient(90deg, #3B82F6, #06B6D4)',
    2: 'linear-gradient(90deg, #10B981, #34D399)',
    3: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
    4: 'linear-gradient(90deg, #EF4444, #F97316)',
    5: 'linear-gradient(90deg, #A855F7, #EC4899)',
  };

  const streak = STATE.streakCount % 10;
  const pct    = (streak / 10) * 100;
  fill.style.width      = pct + '%';
  fill.style.background = STREAK_COLORS[Math.min(STATE.comboMultiplier, 5)] || STREAK_COLORS[1];

  updateToolsAffordability();
}

function getToolCost(key) {
  const base = TOOL_ENERGY_COST[key] || 0;
  return STATE.settings.helpLevel2 ? base : Math.floor(base / 2);
}

function canAffordTool(key) {
  return STATE.energyPoints >= getToolCost(key);
}

function spendEnergy(key) {
  const cost = getToolCost(key);
  STATE.energyPoints = Math.max(0, STATE.energyPoints - cost);
  localStorage.setItem('sudoku-energy', STATE.energyPoints);
  updateEnergyBar();
  _flashEnergyDrain();

  STATE.streakCount = 0;
  STATE.comboMultiplier = 1;
  updateEnergyBar();
}

function _flashEnergyDrain() {
  const fill = document.getElementById('energy-bar-fill');
  if (!fill) return;
  fill.style.transition = 'none';
  fill.style.background = 'linear-gradient(90deg, #F59E0B, #DC2626)';
  setTimeout(() => { fill.style.background = ''; fill.style.transition = ''; }, 500);
}

function _flashEnergyLoss() {
  const container = document.getElementById('energy-container');
  if (!container) return;
  container.classList.add('energy-shake');
  setTimeout(() => container.classList.remove('energy-shake'), 600);
  _flashEnergyDrain();
}

function _showNoEnergyFeedback(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.add('energy-blocked');
  setTimeout(() => btn.classList.remove('energy-blocked'), 700);
}

function _applyBatchEnergy(key, items) {
  if (!items || items.length <= 1) return items;
  const cost = getToolCost(key);
  if (cost === 0) return items;
  
  const affordableExtra = Math.floor(STATE.energyPoints / cost);
  const requestedExtra = items.length - 1;
  const toBuy = Math.min(requestedExtra, affordableExtra);
  
  if (toBuy > 0) {
    STATE.energyPoints -= (toBuy * cost);
    localStorage.setItem('sudoku-energy', STATE.energyPoints);
    updateEnergyBar();
    _flashEnergyDrain();
  }
  
  return items.slice(0, 1 + toBuy);
}

function updateToolsAffordability() {
  Object.entries(TOOL_ENERGY_COST).forEach(([key]) => {
    const cost = getToolCost(key);
    const id = 'btn-' + (key === 'nakedpairs' ? 'nakedpairs' : key);
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('energy-insufficient', STATE.energyPoints < cost);
  });
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

function commitSimulator() {
  /* Efetiva: conta erros das células colocadas no simulador */
  for (const [key] of STATE.simulator.placements) {
    const [r, c] = key.split(',').map(Number);
    const val = STATE.puzzle[r][c];
    if (val !== 0 && val !== STATE.solution[r][c]) {
      STATE.errors++;
    }
  }
  STATE.simulator.active      = false;
  STATE.simulator.placements  = new Map();
  STATE.simulator.nextSeq     = 0;
  STATE.simulator.savedPuzzle = null;
  STATE.simulator.savedNotes  = null;
  updateSimBtn();
  renderBoard();
  renderNumpad();
  updateErrorDisplay();
  updateProgressBar();
  if (STATE.settings.failOnErrors && STATE.errors >= STATE.settings.maxErrors) {
    setTimeout(() => endGame(false), 400);
    return;
  }
  checkWin();
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
    eraseBtn.classList.add('hidden');  // also hidden when simulator disabled
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
  if (!STATE.settings.enableDialPin) return;
  if (STATE.pinnedNum !== num) {
    if (STATE.energyPoints < 1) {
      _flashEnergyLoss();
      return;
    }
    STATE.energyPoints -= 1;
    localStorage.setItem('sudoku-energy', STATE.energyPoints);
    updateEnergyBar();
    _flashEnergyDrain();
  }
  STATE.pinnedNum = (STATE.pinnedNum === num) ? 0 : num;
  /* Ao fixar um número no dial, limpa a seleção de célula no tabuleiro */
  STATE.selectedRow = -1;
  STATE.selectedCol = -1;
  renderNumpad();
  renderHighlights();
  /* Naked Single level 2 auto-fill */
  if (STATE.settings.nakedSingleMode === 2 && STATE.pinnedNum > 0) {
    const pinBtn = document.querySelector(`#numpad [data-num="${STATE.pinnedNum}"]`);
    if (pinBtn) triggerNakedSingleFill(STATE.pinnedNum, pinBtn);
  }
}

/* ═══════════════════════════════════════
   NAKED SINGLE — Função 5
═══════════════════════════════════════ */
let _nsGen = 0;

function getNakedSinglesForNum(n) {
  if (!STATE.puzzle) return [];
  const res = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (STATE.puzzle[r][c] === 0 && _isOnlyNSCandidate(r, c, n))
        res.push([r, c]);
  return res;
}

function _isNSCandidate(r, c, n) {
  for (let i = 0; i < 9; i++) {
    if (i !== c && STATE.puzzle[r][i] === n) return false;
    if (i !== r && STATE.puzzle[i][c] === n) return false;
  }
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++)
    for (let cc = bc; cc < bc + 3; cc++)
      if ((rr !== r || cc !== c) && STATE.puzzle[rr][cc] === n) return false;
  return true;
}

function _isOnlyNSCandidate(r, c, n) {
  if (!_isNSCandidate(r, c, n)) return false;
  for (let k = 1; k <= 9; k++)
    if (k !== n && _isNSCandidate(r, c, k)) return false;
  return true;
}

function triggerNakedSingleFill(num, sourceEl) {
  _nsGen++;
  const gen = _nsGen;
  const cells = getNakedSinglesForNum(num);
  if (!cells.length) return;
  setTimeout(() => _processNsQueue(gen, num, sourceEl, cells), 320);
}

function _processNsQueue(gen, num, sourceEl, queue) {
  if (gen !== _nsGen || STATE.settings.nakedSingleMode < 2 || !queue.length || STATE.gameOver) return;

  const idx = queue.findIndex(([r, c]) =>
    STATE.puzzle[r][c] === 0 && _isOnlyNSCandidate(r, c, num));
  if (idx === -1) return;

  const [tr, tc] = queue[idx];
  const rest = queue.filter((_, i) => i !== idx);
  const toEl = cellElements[tr][tc];

  const fromRect = sourceEl.getBoundingClientRect();
  const toRect   = toEl.getBoundingClientRect();
  const fromX = fromRect.left + fromRect.width  / 2;
  const fromY = fromRect.top  + fromRect.height / 2;
  const dx = (toRect.left + toRect.width  / 2) - fromX;
  const dy = (toRect.top  + toRect.height / 2) - fromY;

  /* Partícula viajante */
  const particle = document.createElement('div');
  particle.className = 'ns-particle';
  particle.style.left = fromX + 'px';
  particle.style.top  = fromY + 'px';
  document.body.appendChild(particle);

  particle.animate([
    { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`, opacity: 0.8 },
  ], { duration: 500, easing: 'cubic-bezier(0.4,0,0.6,1)', fill: 'forwards' }).onfinish = () => {
    particle.remove();
    if (gen !== _nsGen || STATE.settings.nakedSingleMode < 2 || STATE.gameOver) return;

    /* Preenche célula — mesma lógica de pontuação de acerto manual */
    pushUndo();
    STATE.puzzle[tr][tc] = num;
    STATE.score += calculateCellPoints();
    updateScoreDisplay();
    STATE.streakCount++;
    const prevCombo = STATE.comboMultiplier;
    STATE.comboMultiplier = Math.floor(STATE.streakCount / 10) + 1;
    if (STATE.comboMultiplier > prevCombo) {
      const fill = document.getElementById('energy-bar-fill');
      if (fill) {
        fill.classList.add('streak-leveling');
        setTimeout(() => { fill.classList.remove('streak-leveling'); updateEnergyBar(); }, 350);
      }
      _showMultiplierPopup(STATE.comboMultiplier);
    } else {
      updateEnergyBar();
    }
    const energyTable = ENERGY_TABLE[STATE.difficulty] || ENERGY_TABLE.facil;
    awardEnergy(energyTable.cell);
    if (STATE.settings.autoRemoveNotes) removeRelatedNotes(tr, tc, num);

    /* Animação de preenchimento */
    toEl.classList.add('ns-fill-anim');
    updateCellContent(tr, tc);
    renderNumpad();
    updateProgressBar();
    renderHighlights();

    setTimeout(() => {
      toEl.classList.remove('ns-fill-anim');
      setTimeout(() => checkCompletions(tr, tc), 80);
      setTimeout(() => _checkCompletedUnits(tr, tc), 80);
      let count = 0;
      for (let rr = 0; rr < 9; rr++)
        for (let cc = 0; cc < 9; cc++)
          if (STATE.puzzle[rr][cc] === num) count++;
      if (count === 9) setTimeout(() => celebrateDigit(num), 80);
      checkWin();
      /* Próxima célula — parte da última célula preenchida */
      if (rest.length) setTimeout(() => _processNsQueue(gen, num, toEl, rest), 280);
    }, 430);
  };
}

function handleFill() {
  if (STATE.paused || !STATE.puzzle) return;

  if (!STATE.fillUsedThisPuzzle) {
    const costs = { facil: 50, medio: 100, dificil: 200, especialista: 400, mestre: 800, extremo: 1600, diabolico: 1600 };
    const cost = costs[STATE.difficulty] || 50;
    
    if (STATE.energyPoints < cost) {
      _showNoEnergyFeedback('btn-fill');
      _flashEnergyLoss();
      return;
    }

    STATE.fillUsedThisPuzzle = true;
    STATE.energyPoints = Math.max(0, STATE.energyPoints - cost);
    localStorage.setItem('sudoku-energy', STATE.energyPoints);
    updateEnergyBar();
    _flashEnergyDrain();
    document.getElementById('fill-cost-badge')?.classList.add('paid');
  }

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

function updateFillCostDisplay() {
  const badge = document.getElementById('fill-cost-badge');
  if (!badge) return;
  const costs = { facil: 50, medio: 100, dificil: 200, especialista: 400, mestre: 800, extremo: 1600, diabolico: 1600 };
  const cost = costs[STATE.difficulty] || 50;
  badge.textContent = '-' + cost + '⚡';
}

function updateFillBtnVisibility() {
  const btn = document.getElementById('btn-fill');
  if (btn) btn.classList.toggle('hidden', !STATE.settings.autoAnnotations);
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
    _cancelOtherAnalysis('nakedpairs');
    an.nakedPairs = detectNakedPairs();
    if (an.nakedPairs.length > 0) {
      if (!canAffordTool('nakedpairs')) { _showNoEnergyFeedback('btn-nakedpairs'); return; }
      spendEnergy('nakedpairs');
    }
    an.nakedPairsIndex = 0;
    an.nakedPairsActive = true;
  } else {
    if (an.nakedPairsBatch) { deactivateNakedPairs(); return; }
    if (an.nakedPairsIndex + 1 >= an.nakedPairs.length) {
      deactivateNakedPairs(); return;
    }
    if (!canAffordTool('nakedpairs')) { _showNoEnergyFeedback('btn-nakedpairs'); return; }
    spendEnergy('nakedpairs');
    an.nakedPairsIndex++;
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateNakedPairsBtn(); updateActionBar(); renderHighlights();
}

function deactivateNakedPairs() {
  const an = STATE.analysis;
  an.nakedPairsActive = false; an.nakedPairs = []; an.nakedPairsIndex = 0; an.nakedPairsBatch = false;
  updateNakedPairsBtn(); updateActionBar(); renderHighlights();
}

function executeNakedPairs() {
  const an = STATE.analysis;
  const pairs = an.nakedPairsBatch ? an.nakedPairs : [an.nakedPairs[an.nakedPairsIndex]].filter(Boolean);
  if (!pairs.length) { deactivateNakedPairs(); return; }
  pushUndo();
  pairs.forEach(np => np.affected.forEach(({ r, c, nums }) => {
    nums.forEach(n => STATE.notes[r][c].delete(n));
    updateCellContent(r, c);
  }));
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
    _cancelOtherAnalysis('pointing');
    an.pointings = detectPointingPairs();
    if (an.pointings.length > 0) {
      if (!canAffordTool('pointing')) { _showNoEnergyFeedback('btn-pointing'); return; }
      spendEnergy('pointing');
    }
    an.pointingIndex  = 0;
    an.pointingActive = true;
  } else {
    if (an.pointingBatch) { deactivatePointing(); return; }
    if (an.pointingIndex + 1 >= an.pointings.length) {
      deactivatePointing(); return;
    }
    if (!canAffordTool('pointing')) { _showNoEnergyFeedback('btn-pointing'); return; }
    spendEnergy('pointing');
    an.pointingIndex++;
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updatePointingBtn(); updateActionBar(); renderHighlights();
}

function deactivatePointing() {
  const an = STATE.analysis;
  an.pointingActive = false; an.pointings = []; an.pointingIndex = 0; an.pointingBatch = false;
  updatePointingBtn(); updateActionBar(); renderHighlights();
}

function executePointing() {
  const an = STATE.analysis;
  const pts = an.pointingBatch ? an.pointings : [an.pointings[an.pointingIndex]].filter(Boolean);
  if (!pts.length) { deactivatePointing(); return; }
  pushUndo();
  pts.forEach(pt => pt.targets.forEach(({ r, c }) => {
    STATE.notes[r][c].delete(pt.num);
    updateCellContent(r, c);
  }));
  deactivatePointing();
  renderHighlights();
}

function updatePointingBtn() {
  const btn = document.getElementById('btn-pointing');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.pointingActive);
}

/* ─── Cancelar outras análises ao activar uma ─── */
function _cancelOtherAnalysis(except) {
  const an = STATE.analysis;
  if (except !== 'singles') {
    an.singlesActive = false; an.singles = []; an.singlesIndex = 0; an.singlesBatch = false;
    if (except !== 'hiddens') STATE.pinnedNum = 0;
    updateSinglesBtn();
  }
  if (except !== 'hiddens') {
    an.hiddenActive = false; an.hiddens = []; an.hiddensIndex = 0; an.hiddensBatch = false;
    if (except !== 'singles') STATE.pinnedNum = 0;
    updateHiddensBtn();
  }
  if (except !== 'nakedpairs')    { an.nakedPairsActive = false; an.nakedPairs = []; an.nakedPairsIndex = 0; an.nakedPairsBatch = false; updateNakedPairsBtn(); }
  if (except !== 'hiddenpairs')   { an.hiddenpairsActive = false; an.hiddenpairs = []; an.hiddenpairsIndex = 0; an.hiddenpairsBatch = false; updateHiddenPairsBtn(); }
  if (except !== 'pointing')      { an.pointingActive = false; an.pointings = []; an.pointingIndex = 0; an.pointingBatch = false; updatePointingBtn(); }
  if (except !== 'xwing')         { an.xwingActive = false; an.xwings = []; an.xwingIndex = 0; an.xwingBatch = false; updateXWingBtn(); }
  if (except !== 'nakedtriples')  { an.nakedtriplesActive = false; an.nakedtriples = []; an.nakedtriplesIndex = 0; an.nakedtriplesBatch = false; updateNakedTriplesBtn(); }
  if (except !== 'hiddentriples') { an.hiddentriplesActive = false; an.hiddentriples = []; an.hiddentriplesIndex = 0; an.hiddentriplesBatch = false; updateHiddenTriplesBtn(); }
  if (except !== 'swordfish')     { an.swordfishActive = false; an.swordfishes = []; an.swordfishIndex = 0; an.swordfishBatch = false; updateSwordfishBtn(); }
  if (except !== 'ywing')         { an.ywingActive = false; an.ywings = []; an.ywingIndex = 0; an.ywingBatch = false; updateYWingBtn(); }
  if (except !== 'wwing')         { an.wwingActive = false; an.wwings = []; an.wwingIndex = 0; an.wwingBatch = false; updateWWingBtn(); }
  if (except !== 'xychain')       { an.xychainActive = false; an.xychains = []; an.xychainIndex = 0; an.xychainBatch = false; updateXYChainBtn(); }
  if (except !== 'coloring')      { an.coloringActive = false; an.colorings = []; an.coloringIndex = 0; an.coloringBatch = false; updateColoringBtn(); }
  if (except !== 'forcingchains') { an.forcingchainsActive = false; an.forcingchains = []; an.forcingchainsIndex = 0; an.forcingchainsBatch = false; updateForcingChainsBtn(); }
  if (except !== 'aic')           { an.aicActive = false; an.aics = []; an.aicIndex = 0; an.aicBatch = false; updateAICBtn(); }
  /* Limpa visualmente os destaques da análise cancelada */
  renderHighlights(); renderNumpad();
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
    if (an.singlesBatch) { deactivateSingles(); return; }
    if (an.singlesIndex + 1 >= an.singles.length) { deactivateSingles(); return; }
    if (!canAffordTool('singles')) { _showNoEnergyFeedback('btn-singles'); return; }
    spendEnergy('singles');
    an.singlesIndex++;
    _pinSingle(an.singles[an.singlesIndex]);
    updateSinglesBtn(); updateActionBar(); renderHighlights();
    return;
  }

  /* Cycling Hidden Singles */
  if (an.hiddenActive) {
    if (an.singlesBatch) { deactivateHiddenSingles(); return; }
    if (an.hiddensIndex + 1 >= an.hiddens.length) { deactivateHiddenSingles(); return; }
    if (!canAffordTool('singles')) { _showNoEnergyFeedback('btn-singles'); return; }
    spendEnergy('singles');
    an.hiddensIndex++;
    _pinSingle(an.hiddens[an.hiddensIndex]);
    updateSinglesBtn(); updateActionBar(); renderHighlights();
    return;
  }

  /* Idle — detecta Naked Singles primeiro */
  _cancelOtherAnalysis('singles');
  if (s.enableNakedSingles) {
    const singles = [];
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (STATE.puzzle[r][c] === 0 && STATE.notes[r][c].size === 1)
          singles.push({ r, c, val: [...STATE.notes[r][c]][0] });
    if (singles.length > 0) {
      if (!canAffordTool('singles')) { _showNoEnergyFeedback('btn-singles'); return; }
      spendEnergy('singles');
      an.singlesActive = true; an.singles = singles; an.singlesIndex = 0;
      STATE.selectedRow = -1; STATE.selectedCol = -1;
      _pinSingle(singles[0]);
      updateSinglesBtn(); updateActionBar(); renderHighlights();
      return;
    }
  }

  /* Nada encontrado — exibe mensagem "não encontrado" na action bar */
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  an.singlesActive = true; an.singles = []; an.singlesIndex = 0;
  updateSinglesBtn(); updateActionBar(); renderHighlights();
}

function toggleHiddens() {
  const an = STATE.analysis;
  const s  = STATE.settings;

  /* Cycling Hidden Singles */
  if (an.hiddenActive) {
    if (an.hiddensBatch) { deactivateHiddens(); return; }
    if (an.hiddensIndex + 1 >= an.hiddens.length) { deactivateHiddens(); return; }
    if (!canAffordTool('hiddens')) { _showNoEnergyFeedback('btn-hiddens'); return; }
    spendEnergy('hiddens');
    an.hiddensIndex++;
    _pinSingle(an.hiddens[an.hiddensIndex]);
    updateHiddensBtn(); updateActionBar(); renderHighlights();
    return;
  }

  /* Idle — tenta Hidden Singles */
  _cancelOtherAnalysis('hiddens');
  if (s.enableHiddenSingles) {
    const hiddens = _computeHiddenSingles();
    if (hiddens.length > 0) {
      if (!canAffordTool('hiddens')) { _showNoEnergyFeedback('btn-hiddens'); return; }
      spendEnergy('hiddens');
      an.hiddenActive = true; an.hiddens = hiddens; an.hiddensIndex = 0;
      STATE.selectedRow = -1; STATE.selectedCol = -1;
      _pinSingle(hiddens[0]);
      updateHiddensBtn(); updateActionBar(); renderHighlights();
      return;
    }
  }

  /* Nada encontrado — exibe mensagem "não encontrado" na action bar */
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  an.hiddenActive = true; an.hiddens = []; an.hiddensIndex = 0;
  updateHiddensBtn(); updateActionBar(); renderHighlights();
}

/* Pina o número de um single no dial (igual ao long-press do numpad) */
function _pinSingle({ val }) {
  STATE.pinnedNum = val;
  renderNumpad();
}

/* Computa Hidden Singles sem efeitos colaterais.
   Cada item inclui unitType ('row'|'col'|'box') e unitIdx para o destaque âmbar. */
function _computeHiddenSingles() {
  const puz = STATE.puzzle, notes = STATE.notes;
  const found = new Map();
  function checkGroup(cells, unitType, unitIdx) {
    for (let num = 1; num <= 9; num++) {
      const cands = cells.filter(({ r, c }) => puz[r][c] === 0 && notes[r][c].has(num));
      if (cands.length === 1) {
        const { r, c } = cands[0];
        if (notes[r][c].size > 1 && !found.has(`${r},${c}`))
          found.set(`${r},${c}`, { r, c, val: num, unitType, unitIdx });
      }
    }
  }
  for (let r = 0; r < 9; r++)
    checkGroup(Array.from({ length: 9 }, (_, c) => ({ r, c })), 'row', r);
  for (let c = 0; c < 9; c++)
    checkGroup(Array.from({ length: 9 }, (_, r) => ({ r, c })), 'col', c);
  for (let br = 0; br < 9; br += 3)
    for (let bc = 0; bc < 9; bc += 3) {
      const cells = [];
      for (let rr = br; rr < br + 3; rr++)
        for (let cc = bc; cc < bc + 3; cc++)
          cells.push({ r: rr, c: cc });
      const boxIdx = (br / 3) * 3 + bc / 3;
      checkGroup(cells, 'box', boxIdx);
    }
  return [...found.values()];
}

function deactivateSingles() {
  const an = STATE.analysis;
  an.singlesActive = false; an.singles = []; an.singlesIndex = 0; an.singlesBatch = false;
  if (!an.hiddenActive) STATE.pinnedNum = 0;
  updateSinglesBtn(); updateActionBar(); renderHighlights(); renderNumpad();
}

function deactivateHiddens() {
  const an = STATE.analysis;
  an.hiddenActive = false; an.hiddens = []; an.hiddensIndex = 0; an.hiddensBatch = false;
  if (!an.singlesActive) STATE.pinnedNum = 0;
  updateHiddensBtn(); updateActionBar(); renderHighlights(); renderNumpad();
}

/* Preenche o single atual (ou todos em batch) e desativa */
function executeFillSingles() {
  const an = STATE.analysis;
  if (!an.singlesActive || !an.singles.length) return;
  pushUndo();
  const items = an.singlesBatch ? an.singles : [an.singles[an.singlesIndex]];
  for (const { r, c, val } of items) {
    if (STATE.puzzle[r][c] === 0) {
      STATE.puzzle[r][c] = val;
      STATE.score += calculateCellPoints();
      if (STATE.settings.autoRemoveNotes) removeRelatedNotes(r, c, val);
      updateCellContent(r, c);
    }
  }
  updateScoreDisplay(); renderNumpad(); updateProgressBar();
  checkWin();
  deactivateSingles();
  renderHighlights();
}

/* Preenche a oculta atual (ou todas em batch) e desativa */
function executeFillHiddenSingles() {
  const an = STATE.analysis;
  if (!an.hiddenActive || !an.hiddens.length) return;
  pushUndo();
  const items = an.hiddensBatch ? an.hiddens : [an.hiddens[an.hiddensIndex]];
  for (const { r, c, val } of items) {
    if (STATE.puzzle[r][c] === 0) {
      STATE.puzzle[r][c] = val;
      STATE.score += calculateCellPoints();
      if (STATE.settings.autoRemoveNotes) removeRelatedNotes(r, c, val);
      updateCellContent(r, c);
    }
  }
  updateScoreDisplay(); renderNumpad(); updateProgressBar();
  checkWin();
  deactivateHiddens();
  renderHighlights();
}

function updateSinglesBtn() {
  const btn = document.getElementById('btn-singles');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.singlesActive);
}
function updateHiddensBtn() {
  const btn = document.getElementById('btn-hiddens');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.hiddenActive);
}

/* ─── Botão de ação (action bar) ─── */
function handleActionConfirm() {
  STATE.multiplierDisabled = true;
  const an = STATE.analysis;
  if (an.singlesActive           && an.singles.length)        { executeFillSingles();       return; }
  if (an.hiddenActive            && an.hiddens.length)        { executeFillHiddenSingles(); return; }
  if (an.nakedPairsActive        && an.nakedPairs.length)     { executeNakedPairs();        return; }
  if (an.hiddenpairsActive       && an.hiddenpairs.length)    { executeHiddenPairs();       return; }
  if (an.pointingActive          && an.pointings.length)      { executePointing();          return; }
  if (an.xwingActive             && an.xwings.length)         { executeXWing();             return; }
  if (an.nakedtriplesActive      && an.nakedtriples.length)   { executeNakedTriples();      return; }
  if (an.hiddentriplesActive     && an.hiddentriples.length)  { executeHiddenTriples();     return; }
  if (an.swordfishActive         && an.swordfishes.length)    { executeSwordfish();         return; }
  if (an.ywingActive             && an.ywings.length)         { executeYWing();             return; }
  if (an.wwingActive             && an.wwings.length)         { executeWWing();             return; }
  if (an.xychainActive           && an.xychains.length)       { executeXYChain();           return; }
  if (an.coloringActive          && an.colorings.length)      { executeColoring();          return; }
  if (an.forcingchainsActive     && an.forcingchains.length)  { executeForcingChains();     return; }
  if (an.aicActive               && an.aics.length)           { executeAIC();               return; }
}

function handleActionCancel() {
  const an = STATE.analysis;
  if (an.singlesActive)        { deactivateSingles();        return; }
  if (an.hiddenActive)         { deactivateHiddens();        return; }
  if (an.nakedPairsActive)     { deactivateNakedPairs();     return; }
  if (an.hiddenpairsActive)    { deactivateHiddenPairs();    return; }
  if (an.pointingActive)       { deactivatePointing();       return; }
  if (an.xwingActive)          { deactivateXWing();          return; }
  if (an.nakedtriplesActive)   { deactivateNakedTriples();   return; }
  if (an.hiddentriplesActive)  { deactivateHiddenTriples();  return; }
  if (an.swordfishActive)      { deactivateSwordfish();      return; }
  if (an.ywingActive)          { deactivateYWing();          return; }
  if (an.wwingActive)          { deactivateWWing();          return; }
  if (an.xychainActive)        { deactivateXYChain();        return; }
  if (an.coloringActive)       { deactivateColoring();       return; }
  if (an.forcingchainsActive)  { deactivateForcingChains();  return; }
  if (an.aicActive)            { deactivateAIC();            return; }
}

function updateActionBar() {
  const bar     = document.getElementById('action-bar');
  const label   = document.getElementById('action-bar-label');
  const confirm = document.getElementById('btn-action-confirm');
  if (!bar) return;
  
  if (!STATE.settings.helpLevel2) {
    confirm.classList.add('hidden');
  } else {
    confirm.classList.remove('hidden');
  }

  const an = STATE.analysis;

  /* Únicas — cycling ou batch */
  if (an.singlesActive) {
    bar.classList.remove('hidden');
    if (an.singles.length) {
      if (an.singlesBatch) {
        label.textContent   = `Únicas: ${an.singles.length} célula(s) — Preencher todas`;
        confirm.textContent = '① Preencher todas';
      } else {
        const s = an.singles[an.singlesIndex];
        label.textContent   = `Única ${an.singlesIndex + 1}/${an.singles.length} · nº${s.val}`;
        confirm.textContent = '① Preencher';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhuma única encontrada';
      confirm.textContent = '① Preencher';
      confirm.disabled    = true;
    }
    return;
  }

  /* Ocultas — cycling ou batch */
  if (an.hiddenActive) {
    bar.classList.remove('hidden');
    if (an.hiddens.length) {
      if (an.hiddensBatch) {
        label.textContent   = `Ocultas: ${an.hiddens.length} célula(s) — Preencher todas`;
        confirm.textContent = '① Preencher todas';
      } else {
        const h = an.hiddens[an.hiddensIndex];
        label.textContent   = `Oculta ${an.hiddensIndex + 1}/${an.hiddens.length} · nº${h.val}`;
        confirm.textContent = '① Preencher';
      }
      confirm.disabled = false;
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
      if (an.nakedPairsBatch) {
        const total = an.nakedPairs.reduce((s, np) => s + np.affected.length, 0);
        label.textContent   = `Pares Nus: ${an.nakedPairs.length} par(es) · ${total} eliminação(ões)`;
        confirm.textContent = '✓ Eliminar todos';
      } else {
        const np = an.nakedPairs[an.nakedPairsIndex];
        label.textContent   = `Par Nu ${an.nakedPairsIndex + 1}/${an.nakedPairs.length} · [${np.pairNums.join(',')}] · ${np.affected.length} eliminação(ões)`;
        confirm.textContent = '✓ Eliminar';
      }
      confirm.disabled = false;
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
      if (an.pointingBatch) {
        const total = an.pointings.reduce((s, pt) => s + pt.targets.length, 0);
        label.textContent   = `Apontador: ${an.pointings.length} padrão(ões) · ${total} eliminação(ões)`;
        confirm.textContent = '↗ Atirar todos';
      } else {
        const pt = an.pointings[an.pointingIndex];
        label.textContent   = `Apontador ${an.pointingIndex + 1}/${an.pointings.length} · nº${pt.num} · ${pt.targets.length} eliminação(ões)`;
        confirm.textContent = '↗ Atirar';
      }
      confirm.disabled = false;
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
      if (an.xwingBatch) {
        const total = an.xwings.reduce((s, xw) => s + xw.targets.length, 0);
        label.textContent   = `X-Wing: ${an.xwings.length} padrão(ões) · ${total} eliminação(ões)`;
        confirm.textContent = '♟ Eliminar todos';
      } else {
        const xw = an.xwings[an.xwingIndex];
        label.textContent   = `X-Wing ${an.xwingIndex + 1}/${an.xwings.length} · nº${xw.num} · ${xw.targets.length} eliminação(ões)`;
        confirm.textContent = '♟ Eliminar';
      }
      confirm.disabled = false;
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
      if (an.ywingBatch) {
        const total = an.ywings.reduce((s, yw) => s + yw.targets.length, 0);
        label.textContent   = `Y-Wing: ${an.ywings.length} padrão(ões) · ${total} eliminação(ões)`;
        confirm.textContent = '♟ Eliminar todos';
      } else {
        const yw = an.ywings[an.ywingIndex];
        label.textContent   = `Y-Wing ${an.ywingIndex + 1}/${an.ywings.length} · elimina ${yw.elimVal} · ${yw.targets.length} célula(s)`;
        confirm.textContent = '♟ Eliminar';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhum Y-Wing encontrado';
      confirm.textContent = '♟ Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  /* W-Wing */
  if (an.wwingActive) {
    bar.classList.remove('hidden');
    if (an.wwings.length) {
      if (an.wwingBatch) {
        const total = an.wwings.reduce((s, ww) => s + ww.targets.length, 0);
        label.textContent   = `W-Wing: ${an.wwings.length} padrão(ões) · ${total} eliminação(ões)`;
        confirm.textContent = '𝕎 Eliminar todos';
      } else {
        const ww = an.wwings[an.wwingIndex];
        label.textContent   = `W-Wing ${an.wwingIndex + 1}/${an.wwings.length} · elimina ${ww.elimVal} · ${ww.targets.length} célula(s)`;
        confirm.textContent = '𝕎 Eliminar';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhum W-Wing encontrado';
      confirm.textContent = '𝕎 Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  /* Hidden Pairs */
  if (an.hiddenpairsActive) {
    bar.classList.remove('hidden');
    if (an.hiddenpairs.length) {
      if (an.hiddenpairsBatch) {
        const total = an.hiddenpairs.reduce((s, hp) => s + hp.affected.length, 0);
        label.textContent   = `Pares Ocultos: ${an.hiddenpairs.length} par(es) · ${total} eliminação(ões)`;
        confirm.textContent = '✓ Eliminar todos';
      } else {
        const hp = an.hiddenpairs[an.hiddenpairsIndex];
        label.textContent   = `Par Oculto ${an.hiddenpairsIndex + 1}/${an.hiddenpairs.length} · [${hp.pairNums.join(',')}] · ${hp.affected.length} eliminação(ões)`;
        confirm.textContent = '✓ Eliminar';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhum Par Oculto encontrado';
      confirm.textContent = '✓ Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  /* Naked Triples */
  if (an.nakedtriplesActive) {
    bar.classList.remove('hidden');
    if (an.nakedtriples.length) {
      if (an.nakedtriplesBatch) {
        const total = an.nakedtriples.reduce((s, nt) => s + nt.affected.length, 0);
        label.textContent   = `Triplos Nus: ${an.nakedtriples.length} triplo(s) · ${total} eliminação(ões)`;
        confirm.textContent = '✓ Eliminar todos';
      } else {
        const nt = an.nakedtriples[an.nakedtriplesIndex];
        label.textContent   = `Triplo Nu ${an.nakedtriplesIndex + 1}/${an.nakedtriples.length} · [${nt.tripleNums.join(',')}] · ${nt.affected.length} eliminação(ões)`;
        confirm.textContent = '✓ Eliminar';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhum Triplo Nu encontrado';
      confirm.textContent = '✓ Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  /* Hidden Triples */
  if (an.hiddentriplesActive) {
    bar.classList.remove('hidden');
    if (an.hiddentriples.length) {
      if (an.hiddentriplesBatch) {
        const total = an.hiddentriples.reduce((s, ht) => s + ht.affected.length, 0);
        label.textContent   = `Triplos Ocultos: ${an.hiddentriples.length} triplo(s) · ${total} eliminação(ões)`;
        confirm.textContent = '✓ Eliminar todos';
      } else {
        const ht = an.hiddentriples[an.hiddentriplesIndex];
        label.textContent   = `Triplo Oculto ${an.hiddentriplesIndex + 1}/${an.hiddentriples.length} · [${ht.tripleNums.join(',')}] · ${ht.affected.length} eliminação(ões)`;
        confirm.textContent = '✓ Eliminar';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhum Triplo Oculto encontrado';
      confirm.textContent = '✓ Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  /* Swordfish */
  if (an.swordfishActive) {
    bar.classList.remove('hidden');
    if (an.swordfishes.length) {
      if (an.swordfishBatch) {
        const total = an.swordfishes.reduce((s, sf) => s + sf.targets.length, 0);
        label.textContent   = `Swordfish: ${an.swordfishes.length} padrão(ões) · ${total} eliminação(ões)`;
        confirm.textContent = '🐟 Eliminar todos';
      } else {
        const sf = an.swordfishes[an.swordfishIndex];
        label.textContent   = `Swordfish ${an.swordfishIndex + 1}/${an.swordfishes.length} · nº${sf.num} · ${sf.targets.length} eliminação(ões)`;
        confirm.textContent = '🐟 Eliminar';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhum Swordfish encontrado';
      confirm.textContent = '🐟 Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  /* XY-Chain */
  if (an.xychainActive) {
    bar.classList.remove('hidden');
    if (an.xychains.length) {
      if (an.xychainBatch) {
        const total = an.xychains.reduce((s, xy) => s + xy.targets.length, 0);
        label.textContent   = `XY-Chain: ${an.xychains.length} cadeia(s) · ${total} eliminação(ões)`;
        confirm.textContent = '⛓ Eliminar todos';
      } else {
        const xy = an.xychains[an.xychainIndex];
        label.textContent   = `XY-Chain ${an.xychainIndex + 1}/${an.xychains.length} · elimina ${xy.elimVal} · ${xy.targets.length} célula(s)`;
        confirm.textContent = '⛓ Eliminar';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhuma XY-Chain encontrada';
      confirm.textContent = '⛓ Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  /* Coloring */
  if (an.coloringActive) {
    bar.classList.remove('hidden');
    if (an.colorings.length) {
      if (an.coloringBatch) {
        const total = an.colorings.reduce((s, co) => s + co.targets.length, 0);
        label.textContent   = `Coloring: ${an.colorings.length} padrão(ões) · ${total} eliminação(ões)`;
        confirm.textContent = '🎨 Eliminar todos';
      } else {
        const co = an.colorings[an.coloringIndex];
        label.textContent   = `Coloring ${an.coloringIndex + 1}/${an.colorings.length} · nº${co.num} · ${co.targets.length} eliminação(ões)`;
        confirm.textContent = '🎨 Eliminar';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhum Coloring encontrado';
      confirm.textContent = '🎨 Eliminar';
      confirm.disabled    = true;
    }
    return;
  }

  /* Forcing Chains */
  if (an.forcingchainsActive) {
    bar.classList.remove('hidden');
    if (an.forcingchains.length) {
      if (an.forcingchainsBatch) {
        label.textContent   = `Forcing Chains: ${an.forcingchains.length} dedução(ões)`;
        confirm.textContent = '⚡ Preencher todos';
      } else {
        const fc = an.forcingchains[an.forcingchainsIndex];
        label.textContent   = `Forcing ${an.forcingchainsIndex + 1}/${an.forcingchains.length} · L${fc.r+1}·C${fc.c+1} → ${fc.val}`;
        confirm.textContent = '⚡ Preencher';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhuma Forcing Chain encontrada';
      confirm.textContent = '⚡ Preencher';
      confirm.disabled    = true;
    }
    return;
  }

  /* AIC */
  if (an.aicActive) {
    bar.classList.remove('hidden');
    if (an.aics.length) {
      if (an.aicBatch) {
        const total = an.aics.reduce((s, ai) => s + ai.targets.length, 0);
        label.textContent   = `AIC: ${an.aics.length} cadeia(s) · ${total} eliminação(ões)`;
        confirm.textContent = '∞ Eliminar todos';
      } else {
        const ai = an.aics[an.aicIndex];
        label.textContent   = `AIC ${an.aicIndex + 1}/${an.aics.length} · elimina ${ai.elimVal} · ${ai.targets.length} célula(s)`;
        confirm.textContent = '∞ Eliminar';
      }
      confirm.disabled = false;
    } else {
      label.textContent   = 'Nenhuma AIC encontrada';
      confirm.textContent = '∞ Eliminar';
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
function updateHiddensBtn() {
  const btn = document.getElementById('btn-hiddens');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.hiddenActive);
}

function updateAnalysisToolsVisibility() {
  const s = STATE.settings;
  const TIER_ORDER = ['facil','medio','dificil','especialista','mestre','extremo'];
  const currentTierIdx = STATE.difficulty ? TIER_ORDER.indexOf(STATE.difficulty) : TIER_ORDER.length - 1;

  const map = [
    ['btn-singles',       s.enableNakedSingles,     'facil'],
    ['btn-hiddens',       s.enableHiddenSingles,    'facil'],
    ['btn-nakedpairs',    s.enableNakedPairs,       'medio'],
    ['btn-hiddenpairs',   s.enableHiddenPairs,      'medio'],
    ['btn-pointing',      s.enablePointingPairs,    'medio'],
    ['btn-xwing',         s.enableXWing,            'dificil'],
    ['btn-nakedtriples',  s.enableNakedTriples,     'dificil'],
    ['btn-hiddentriples', s.enableHiddenTriples,    'dificil'],
    ['btn-swordfish',     s.enableSwordfish,        'especialista'],
    ['btn-ywing',         s.enableYWing,            'especialista'],
    ['btn-wwing',         s.enableWWing,            'mestre'],
    ['btn-xychain',       s.enableXYChain,          'mestre'],
    ['btn-coloring',      s.enableColoring,         'mestre'],
    ['btn-forcingchains', s.enableForcingChains,    'extremo'],
    ['btn-aic',           s.enableAIC,              'extremo'],
  ];

  map.forEach(([id, settingOn, tier]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const tierOk = !s.filterByDifficulty || !STATE.difficulty ||
                   TIER_ORDER.indexOf(tier) <= currentTierIdx;
    btn.classList.toggle('hidden', !settingOn || !tierOk);
  });

  const anyVisible = map.some(([id]) => {
    const btn = document.getElementById(id);
    return btn && !btn.classList.contains('hidden');
  });
  const bar     = document.getElementById('analysis-tools');
  const section = document.getElementById('analysis-section');
  if (bar)     bar.classList.toggle('hidden', !anyVisible);
  if (section) section.classList.toggle('hidden', !anyVisible);

  // Hide tool rows that have no visible buttons
  ['tool-row-1','tool-row-2','tool-row-3'].forEach(rowId => {
    const row = document.getElementById(rowId);
    if (!row) return;
    const anyBtn = [...row.querySelectorAll('.tool-btn')].some(b => !b.classList.contains('hidden'));
    row.classList.toggle('hidden', !anyBtn);
  });
}

function resetAnalysis() {
  STATE.analysis = {
    singlesActive: false, singles: [], singlesIndex: 0, singlesBatch: false,
    hiddenActive: false, hiddens: [], hiddensIndex: 0, hiddensBatch: false,
    nakedPairsActive: false, nakedPairs: [], nakedPairsIndex: 0, nakedPairsBatch: false,
    hiddenpairsActive: false, hiddenpairs: [], hiddenpairsIndex: 0, hiddenpairsBatch: false,
    pointingActive: false, pointings: [], pointingIndex: 0, pointingBatch: false,
    xwingActive: false, xwings: [], xwingIndex: 0, xwingBatch: false,
    nakedtriplesActive: false, nakedtriples: [], nakedtriplesIndex: 0, nakedtriplesBatch: false,
    hiddentriplesActive: false, hiddentriples: [], hiddentriplesIndex: 0, hiddentriplesBatch: false,
    swordfishActive: false, swordfishes: [], swordfishIndex: 0, swordfishBatch: false,
    ywingActive: false, ywings: [], ywingIndex: 0, ywingBatch: false,
    wwingActive: false, wwings: [], wwingIndex: 0, wwingBatch: false,
    xychainActive: false, xychains: [], xychainIndex: 0, xychainBatch: false,
    coloringActive: false, colorings: [], coloringIndex: 0, coloringBatch: false,
    forcingchainsActive: false, forcingchains: [], forcingchainsIndex: 0, forcingchainsBatch: false,
    aicActive: false, aics: [], aicIndex: 0, aicBatch: false,
  };
  const bar = document.getElementById('action-bar');
  if (bar) bar.classList.add('hidden');
  updateSinglesBtn();
  updateHiddensBtn();
  updateNakedPairsBtn();
  updateHiddenPairsBtn();
  updatePointingBtn();
  updateNakedTriplesBtn();
  updateHiddenTriplesBtn();
  updateSwordfishBtn();
  updateWWingBtn();
  updateXYChainBtn();
  updateColoringBtn();
  updateForcingChainsBtn();
  updateAICBtn();
  updateMentorButton();
}

/* ─── X-Wing ─── */
function toggleXWing() {
  const an = STATE.analysis;
  if (!an.xwingActive) {
    _cancelOtherAnalysis('xwing');
    an.xwings = detectXWings();
    if (an.xwings.length > 0) {
      if (!canAffordTool('xwing')) { _showNoEnergyFeedback('btn-xwing'); return; }
      spendEnergy('xwing');
    }
    an.xwingIndex = 0;
    an.xwingActive = true;
  } else {
    if (an.xwingBatch) { deactivateXWing(); return; }
    if (an.xwingIndex + 1 >= an.xwings.length) {
      deactivateXWing(); return;
    }
    if (!canAffordTool('xwing')) { _showNoEnergyFeedback('btn-xwing'); return; }
    spendEnergy('xwing');
    an.xwingIndex++;
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateXWingBtn(); updateActionBar(); renderHighlights();
}

function deactivateXWing() {
  const an = STATE.analysis;
  an.xwingActive = false; an.xwings = []; an.xwingIndex = 0; an.xwingBatch = false;
  updateXWingBtn(); updateActionBar(); renderHighlights();
}

function executeXWing() {
  const an = STATE.analysis;
  const wings = an.xwingBatch ? an.xwings : [an.xwings[an.xwingIndex]].filter(Boolean);
  if (!wings.length) { deactivateXWing(); return; }
  pushUndo();
  wings.forEach(xw => xw.targets.forEach(({ r, c }) => {
    STATE.notes[r][c].delete(xw.num);
    updateCellContent(r, c);
  }));
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
    _cancelOtherAnalysis('ywing');
    an.ywings = detectYWings();
    if (an.ywings.length > 0) {
      if (!canAffordTool('ywing')) { _showNoEnergyFeedback('btn-ywing'); return; }
      spendEnergy('ywing');
    }
    an.ywingIndex = 0;
    an.ywingActive = true;
  } else {
    if (an.ywingBatch) { deactivateYWing(); return; }
    if (an.ywingIndex + 1 >= an.ywings.length) {
      deactivateYWing(); return;
    }
    if (!canAffordTool('ywing')) { _showNoEnergyFeedback('btn-ywing'); return; }
    spendEnergy('ywing');
    an.ywingIndex++;
  }
  STATE.selectedRow = -1;
  STATE.selectedCol = -1;
  updateYWingBtn(); updateActionBar(); renderHighlights();
}

function deactivateYWing() {
  const an = STATE.analysis;
  an.ywingActive = false; an.ywings = []; an.ywingIndex = 0; an.ywingBatch = false;
  updateYWingBtn(); updateActionBar(); renderHighlights();
}

function executeYWing() {
  const an = STATE.analysis;
  const wings = an.ywingBatch ? an.ywings : [an.ywings[an.ywingIndex]].filter(Boolean);
  if (!wings.length) { deactivateYWing(); return; }
  pushUndo();
  wings.forEach(yw => yw.targets.forEach(({ r, c }) => {
    STATE.notes[r][c].delete(yw.elimVal);
    updateCellContent(r, c);
  }));
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

/* ─── W-Wing ─── */
function detectWWings() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;
  const seen = new Set();
  // Find bivalue cells
  const bivalue = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (puz[r][c] === 0 && notes[r][c].size === 2)
        bivalue.push({ r, c });
  // For each pair of bivalue cells with same candidates
  for (let i = 0; i < bivalue.length; i++) {
    for (let j = i + 1; j < bivalue.length; j++) {
      const w1 = bivalue[i], w2 = bivalue[j];
      if (!setsEqual(notes[w1.r][w1.c], notes[w2.r][w2.c])) continue;
      const [A, B] = [...notes[w1.r][w1.c]];
      // Try each candidate as bridge value
      for (const bridgeVal of [A, B]) {
        const elimVal = bridgeVal === A ? B : A;
        // Find units with exactly 2 occurrences of bridgeVal
        const unitGroups = [];
        for (let r = 0; r < 9; r++) {
          const cs = [];
          for (let c = 0; c < 9; c++) if (puz[r][c] === 0 && notes[r][c].has(bridgeVal)) cs.push({r, c});
          if (cs.length === 2) unitGroups.push(cs);
        }
        for (let c = 0; c < 9; c++) {
          const rs = [];
          for (let r = 0; r < 9; r++) if (puz[r][c] === 0 && notes[r][c].has(bridgeVal)) rs.push({r, c});
          if (rs.length === 2) unitGroups.push(rs);
        }
        for (let br = 0; br < 9; br += 3) for (let bc = 0; bc < 9; bc += 3) {
          const cs = [];
          for (let rr = br; rr < br + 3; rr++) for (let cc = bc; cc < bc + 3; cc++)
            if (puz[rr][cc] === 0 && notes[rr][cc].has(bridgeVal)) cs.push({r: rr, c: cc});
          if (cs.length === 2) unitGroups.push(cs);
        }
        for (const [p1, p2] of unitGroups) {
          for (const [pa, pb] of [[p1, p2], [p2, p1]]) {
            if (pa.r === w1.r && pa.c === w1.c) continue;
            if (pb.r === w2.r && pb.c === w2.c) continue;
            if (!cellSees(pa.r, pa.c, w1.r, w1.c)) continue;
            if (!cellSees(pb.r, pb.c, w2.r, w2.c)) continue;
            const targets = [];
            for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
              if (puz[r][c] !== 0 || !notes[r][c].has(elimVal)) continue;
              if (r === w1.r && c === w1.c) continue;
              if (r === w2.r && c === w2.c) continue;
              if (cellSees(r, c, w1.r, w1.c) && cellSees(r, c, w2.r, w2.c)) targets.push({r, c});
            }
            if (!targets.length) continue;
            const key = [w1.r, w1.c, w2.r, w2.c, pa.r, pa.c, pb.r, pb.c, elimVal].join(',');
            if (seen.has(key)) continue;
            seen.add(key);
            found.push({cells: [w1, w2], bridge: [pa, pb], bridgeVal, elimVal, targets});
          }
        }
      }
    }
  }
  return found;
}

function toggleWWing() {
  const an = STATE.analysis;
  if (!an.wwingActive) {
    _cancelOtherAnalysis('wwing');
    an.wwings = detectWWings();
    if (an.wwings.length > 0) {
      if (!canAffordTool('wwing')) { _showNoEnergyFeedback('btn-wwing'); return; }
      spendEnergy('wwing');
    }
    an.wwingIndex = 0;
    an.wwingActive = true;
  } else {
    if (an.wwingBatch) { deactivateWWing(); return; }
    if (an.wwingIndex + 1 >= an.wwings.length) {
      deactivateWWing(); return;
    }
    if (!canAffordTool('wwing')) { _showNoEnergyFeedback('btn-wwing'); return; }
    spendEnergy('wwing');
    an.wwingIndex++;
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateWWingBtn(); updateActionBar(); renderHighlights();
}

function deactivateWWing() {
  const an = STATE.analysis;
  an.wwingActive = false; an.wwings = []; an.wwingIndex = 0; an.wwingBatch = false;
  updateWWingBtn(); updateActionBar(); renderHighlights();
}

function executeWWing() {
  const an = STATE.analysis;
  const wings = an.wwingBatch ? an.wwings : [an.wwings[an.wwingIndex]].filter(Boolean);
  if (!wings.length) { deactivateWWing(); return; }
  pushUndo();
  wings.forEach(ww => ww.targets.forEach(({r, c}) => {
    STATE.notes[r][c].delete(ww.elimVal); updateCellContent(r, c);
  }));
  deactivateWWing(); renderHighlights();
}

function longPressWWing() {
  const an = STATE.analysis;
  if (!an.wwingActive) toggleWWing();
  if (an.wwingActive && an.wwings.length > 0 && !an.wwingBatch) {
    an.wwings = _applyBatchEnergy('wwing', an.wwings);
    an.wwingBatch = true; updateWWingBtn(); updateActionBar(); renderHighlights();
  }
}

function updateWWingBtn() {
  const btn = document.getElementById('btn-wwing');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.wwingActive);
}

/* ─── Hidden Pairs ─── */
function detectHiddenPairs() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;
  const seen = new Set();
  function checkGroup(cells) {
    const empties = cells.filter(({r,c}) => puz[r][c] === 0);
    for (let n1 = 1; n1 <= 8; n1++) {
      for (let n2 = n1+1; n2 <= 9; n2++) {
        const cands = empties.filter(({r,c}) => notes[r][c].has(n1) || notes[r][c].has(n2));
        const both  = empties.filter(({r,c}) => notes[r][c].has(n1) && notes[r][c].has(n2));
        if (cands.length !== 2 || both.length !== 2) continue;
        const [{r:r1,c:c1},{r:r2,c:c2}] = both;
        const key = [r1,c1,r2,c2,n1,n2].join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const affected = [];
        for (const {r,c} of both) {
          const toRemove = new Set([...notes[r][c]].filter(n => n !== n1 && n !== n2));
          if (toRemove.size > 0) affected.push({r, c, nums: toRemove});
        }
        if (affected.length > 0)
          found.push({pairNums:[n1,n2], pairCells:[{r:r1,c:c1},{r:r2,c:c2}], affected});
      }
    }
  }
  for (let r=0;r<9;r++) checkGroup(Array.from({length:9},(_,c)=>({r,c})));
  for (let c=0;c<9;c++) checkGroup(Array.from({length:9},(_,r)=>({r,c})));
  for (let br=0;br<9;br+=3) for (let bc=0;bc<9;bc+=3) {
    const cells=[];
    for (let rr=br;rr<br+3;rr++) for (let cc=bc;cc<bc+3;cc++) cells.push({r:rr,c:cc});
    checkGroup(cells);
  }
  return found;
}

function toggleHiddenPairs() {
  const an = STATE.analysis;
  if (!an.hiddenpairsActive) {
    _cancelOtherAnalysis('hiddenpairs');
    an.hiddenpairs = detectHiddenPairs(); an.hiddenpairsIndex = 0; an.hiddenpairsActive = true;
  } else {
    an.hiddenpairsIndex++;
    if (an.hiddenpairsIndex >= an.hiddenpairs.length) { deactivateHiddenPairs(); return; }
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateHiddenPairsBtn(); updateActionBar(); renderHighlights();
}
function deactivateHiddenPairs() {
  const an = STATE.analysis;
  an.hiddenpairsActive = false; an.hiddenpairs = []; an.hiddenpairsIndex = 0; an.hiddenpairsBatch = false;
  updateHiddenPairsBtn(); updateActionBar(); renderHighlights();
}
function executeHiddenPairs() {
  const an = STATE.analysis;
  const pairs = an.hiddenpairsBatch ? an.hiddenpairs : [an.hiddenpairs[an.hiddenpairsIndex]].filter(Boolean);
  if (!pairs.length) { deactivateHiddenPairs(); return; }
  pushUndo();
  pairs.forEach(hp => hp.affected.forEach(({ r, c, nums }) => {
    nums.forEach(n => STATE.notes[r][c].delete(n));
    updateCellContent(r, c);
  }));
  deactivateHiddenPairs(); renderHighlights();
}
function updateHiddenPairsBtn() {
  const btn = document.getElementById('btn-hiddenpairs');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.hiddenpairsActive);
}
function longPressHiddenPairs() {
  const an = STATE.analysis;
  if (!an.hiddenpairsActive) toggleHiddenPairs();
  if (an.hiddenpairsActive && an.hiddenpairs.length > 0) {
    an.hiddenpairsBatch = true; updateHiddenPairsBtn(); updateActionBar(); renderHighlights();
  }
}

/* ─── Naked Triples ─── */
function detectNakedTriples() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;
  const seen = new Set();
  function checkGroup(cells) {
    const empties = cells.filter(({r,c}) => puz[r][c] === 0 && notes[r][c].size >= 2 && notes[r][c].size <= 3);
    for (let i=0;i<empties.length-2;i++)
    for (let j=i+1;j<empties.length-1;j++)
    for (let k=j+1;k<empties.length;k++) {
      const trio = [empties[i],empties[j],empties[k]];
      const union = new Set([...notes[trio[0].r][trio[0].c],...notes[trio[1].r][trio[1].c],...notes[trio[2].r][trio[2].c]]);
      if (union.size !== 3) continue;
      const key = trio.map(t=>`${t.r},${t.c}`).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const tripleNums = [...union];
      const affected = [];
      for (const {r,c} of cells) {
        if (trio.some(t=>t.r===r&&t.c===c)) continue;
        if (puz[r][c] !== 0) continue;
        const toRemove = tripleNums.filter(n => notes[r][c].has(n));
        if (toRemove.length > 0) affected.push({r,c,nums:new Set(toRemove)});
      }
      if (affected.length > 0) found.push({tripleNums, tripleCells: trio, affected});
    }
  }
  for (let r=0;r<9;r++) checkGroup(Array.from({length:9},(_,c)=>({r,c})));
  for (let c=0;c<9;c++) checkGroup(Array.from({length:9},(_,r)=>({r,c})));
  for (let br=0;br<9;br+=3) for (let bc=0;bc<9;bc+=3) {
    const cells=[];
    for (let rr=br;rr<br+3;rr++) for (let cc=bc;cc<bc+3;cc++) cells.push({r:rr,c:cc});
    checkGroup(cells);
  }
  return found;
}

function toggleNakedTriples() {
  const an = STATE.analysis;
  if (!an.nakedtriplesActive) {
    _cancelOtherAnalysis('nakedtriples');
    an.nakedtriples = detectNakedTriples(); an.nakedtriplesIndex = 0; an.nakedtriplesActive = true;
  } else {
    an.nakedtriplesIndex++;
    if (an.nakedtriplesIndex >= an.nakedtriples.length) { deactivateNakedTriples(); return; }
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateNakedTriplesBtn(); updateActionBar(); renderHighlights();
}
function deactivateNakedTriples() {
  const an = STATE.analysis;
  an.nakedtriplesActive = false; an.nakedtriples = []; an.nakedtriplesIndex = 0; an.nakedtriplesBatch = false;
  updateNakedTriplesBtn(); updateActionBar(); renderHighlights();
}
function executeNakedTriples() {
  const an = STATE.analysis;
  const triples = an.nakedtriplesBatch ? an.nakedtriples : [an.nakedtriples[an.nakedtriplesIndex]].filter(Boolean);
  if (!triples.length) { deactivateNakedTriples(); return; }
  pushUndo();
  triples.forEach(nt => nt.affected.forEach(({ r, c, nums }) => {
    nums.forEach(n => STATE.notes[r][c].delete(n));
    updateCellContent(r, c);
  }));
  deactivateNakedTriples(); renderHighlights();
}
function updateNakedTriplesBtn() {
  const btn = document.getElementById('btn-nakedtriples');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.nakedtriplesActive);
}
function longPressNakedTriples() {
  const an = STATE.analysis;
  if (!an.nakedtriplesActive) toggleNakedTriples();
  if (an.nakedtriplesActive && an.nakedtriples.length > 0) {
    an.nakedtriplesBatch = true; updateNakedTriplesBtn(); updateActionBar(); renderHighlights();
  }
}

/* ─── Hidden Triples ─── */
function detectHiddenTriples() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;
  const seen = new Set();
  function checkGroup(cells) {
    const empties = cells.filter(({r,c}) => puz[r][c] === 0);
    for (let n1=1;n1<=7;n1++) for (let n2=n1+1;n2<=8;n2++) for (let n3=n2+1;n3<=9;n3++) {
      const cands = empties.filter(({r,c}) => notes[r][c].has(n1)||notes[r][c].has(n2)||notes[r][c].has(n3));
      if (cands.length !== 3) continue;
      if (!cands.some(({r,c})=>notes[r][c].has(n1))) continue;
      if (!cands.some(({r,c})=>notes[r][c].has(n2))) continue;
      if (!cands.some(({r,c})=>notes[r][c].has(n3))) continue;
      const key = cands.map(t=>`${t.r},${t.c}`).sort().join('|')+'|'+[n1,n2,n3].join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const tripleNums = [n1,n2,n3];
      const affected = [];
      for (const {r,c} of cands) {
        const toRemove = new Set([...notes[r][c]].filter(n => !tripleNums.includes(n)));
        if (toRemove.size > 0) affected.push({r,c,nums:toRemove});
      }
      if (affected.length > 0) found.push({tripleNums, tripleCells: cands, affected});
    }
  }
  for (let r=0;r<9;r++) checkGroup(Array.from({length:9},(_,c)=>({r,c})));
  for (let c=0;c<9;c++) checkGroup(Array.from({length:9},(_,r)=>({r,c})));
  for (let br=0;br<9;br+=3) for (let bc=0;bc<9;bc+=3) {
    const cells=[];
    for (let rr=br;rr<br+3;rr++) for (let cc=bc;cc<bc+3;cc++) cells.push({r:rr,c:cc});
    checkGroup(cells);
  }
  return found;
}

function toggleHiddenTriples() {
  const an = STATE.analysis;
  if (!an.hiddentriplesActive) {
    _cancelOtherAnalysis('hiddentriples');
    an.hiddentriples = detectHiddenTriples(); an.hiddentriplesIndex = 0; an.hiddentriplesActive = true;
  } else {
    an.hiddentriplesIndex++;
    if (an.hiddentriplesIndex >= an.hiddentriples.length) { deactivateHiddenTriples(); return; }
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateHiddenTriplesBtn(); updateActionBar(); renderHighlights();
}
function deactivateHiddenTriples() {
  const an = STATE.analysis;
  an.hiddentriplesActive = false; an.hiddentriples = []; an.hiddentriplesIndex = 0; an.hiddentriplesBatch = false;
  updateHiddenTriplesBtn(); updateActionBar(); renderHighlights();
}
function executeHiddenTriples() {
  const an = STATE.analysis;
  const triples = an.hiddentriplesBatch ? an.hiddentriples : [an.hiddentriples[an.hiddentriplesIndex]].filter(Boolean);
  if (!triples.length) { deactivateHiddenTriples(); return; }
  pushUndo();
  triples.forEach(ht => ht.affected.forEach(({ r, c, nums }) => {
    nums.forEach(n => STATE.notes[r][c].delete(n));
    updateCellContent(r, c);
  }));
  deactivateHiddenTriples(); renderHighlights();
}
function updateHiddenTriplesBtn() {
  const btn = document.getElementById('btn-hiddentriples');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.hiddentriplesActive);
}
function longPressHiddenTriples() {
  const an = STATE.analysis;
  if (!an.hiddentriplesActive) toggleHiddenTriples();
  if (an.hiddentriplesActive && an.hiddentriples.length > 0) {
    an.hiddentriplesBatch = true; updateHiddenTriplesBtn(); updateActionBar(); renderHighlights();
  }
}

/* ─── Swordfish ─── */
function detectSwordfish() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;
  for (let num=1;num<=9;num++) {
    const rowMap = {};
    for (let r=0;r<9;r++) {
      const cols=[];
      for (let c=0;c<9;c++) if (puz[r][c]===0 && notes[r][c].has(num)) cols.push(c);
      if (cols.length>=2 && cols.length<=3) rowMap[r]=cols;
    }
    const rowKeys = Object.keys(rowMap).map(Number);
    for (let i=0;i<rowKeys.length-2;i++) for (let j=i+1;j<rowKeys.length-1;j++) for (let k=j+1;k<rowKeys.length;k++) {
      const r1=rowKeys[i],r2=rowKeys[j],r3=rowKeys[k];
      const colSet = new Set([...rowMap[r1],...rowMap[r2],...rowMap[r3]]);
      if (colSet.size !== 3) continue;
      const cols=[...colSet];
      const targets=[];
      for (let r=0;r<9;r++) {
        if (r===r1||r===r2||r===r3) continue;
        for (const c of cols) if (puz[r][c]===0&&notes[r][c].has(num)) targets.push({r,c});
      }
      if (!targets.length) continue;
      const cells=[];
      for (const r of [r1,r2,r3]) for (const c of rowMap[r]) cells.push({r,c});
      found.push({num, cells, targets, type:'row'});
    }
    const colMap = {};
    for (let c=0;c<9;c++) {
      const rows=[];
      for (let r=0;r<9;r++) if (puz[r][c]===0 && notes[r][c].has(num)) rows.push(r);
      if (rows.length>=2&&rows.length<=3) colMap[c]=rows;
    }
    const colKeys = Object.keys(colMap).map(Number);
    for (let i=0;i<colKeys.length-2;i++) for (let j=i+1;j<colKeys.length-1;j++) for (let k=j+1;k<colKeys.length;k++) {
      const c1=colKeys[i],c2=colKeys[j],c3=colKeys[k];
      const rowSet=new Set([...colMap[c1],...colMap[c2],...colMap[c3]]);
      if (rowSet.size!==3) continue;
      const rows=[...rowSet];
      const targets=[];
      for (let c=0;c<9;c++) {
        if (c===c1||c===c2||c===c3) continue;
        for (const r of rows) if (puz[r][c]===0&&notes[r][c].has(num)) targets.push({r,c});
      }
      if (!targets.length) continue;
      const cells=[];
      for (const c of [c1,c2,c3]) for (const r of colMap[c]) cells.push({r,c});
      found.push({num, cells, targets, type:'col'});
    }
  }
  return found;
}

function toggleSwordfish() {
  const an = STATE.analysis;
  if (!an.swordfishActive) {
    _cancelOtherAnalysis('swordfish');
    an.swordfishes = detectSwordfish(); an.swordfishIndex = 0; an.swordfishActive = true;
  } else {
    an.swordfishIndex++;
    if (an.swordfishIndex >= an.swordfishes.length) { deactivateSwordfish(); return; }
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateSwordfishBtn(); updateActionBar(); renderHighlights();
}
function deactivateSwordfish() {
  const an = STATE.analysis;
  an.swordfishActive = false; an.swordfishes = []; an.swordfishIndex = 0; an.swordfishBatch = false;
  updateSwordfishBtn(); updateActionBar(); renderHighlights();
}
function executeSwordfish() {
  const an = STATE.analysis;
  const fishes = an.swordfishBatch ? an.swordfishes : [an.swordfishes[an.swordfishIndex]].filter(Boolean);
  if (!fishes.length) { deactivateSwordfish(); return; }
  pushUndo();
  fishes.forEach(sf => sf.targets.forEach(({ r, c }) => {
    STATE.notes[r][c].delete(sf.num); updateCellContent(r, c);
  }));
  deactivateSwordfish(); renderHighlights();
}
function updateSwordfishBtn() {
  const btn = document.getElementById('btn-swordfish');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.swordfishActive);
}
function longPressSwordfish() {
  const an = STATE.analysis;
  if (!an.swordfishActive) toggleSwordfish();
  if (an.swordfishActive && an.swordfishes.length > 0) {
    an.swordfishBatch = true; updateSwordfishBtn(); updateActionBar(); renderHighlights();
  }
}

/* ─── XY-Chain ─── */
function detectXYChains() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;
  const bivalue = [];
  for (let r=0;r<9;r++) for (let c=0;c<9;c++)
    if (puz[r][c]===0 && notes[r][c].size===2) bivalue.push({r,c});

  function dfs(chain, startVal, seen) {
    const last = chain[chain.length-1];
    const lastNotes = notes[last.r][last.c];
    const linkVal = chain.length===1 ? [...lastNotes].find(n=>n!==startVal) :
      [...lastNotes].find(n => n !== chain._prevLink);
    if (!linkVal) return;
    for (const next of bivalue) {
      if (seen.has(`${next.r},${next.c}`)) continue;
      if (!cellSees(last.r,last.c,next.r,next.c)) continue;
      if (!notes[next.r][next.c].has(linkVal)) continue;
      const nextElim = [...notes[next.r][next.c]].find(n=>n!==linkVal);
      if (!nextElim) continue;
      if (chain.length >= 3 && nextElim === startVal) {
        const start = chain[0];
        const elimVal = startVal;
        const targets = [];
        for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
          if (puz[r][c]!==0||!notes[r][c].has(elimVal)) continue;
          if (seen.has(`${r},${c}`)||(r===next.r&&c===next.c)) continue;
          if (cellSees(r,c,start.r,start.c)&&cellSees(r,c,next.r,next.c))
            targets.push({r,c});
        }
        if (targets.length) {
          found.push({chain:[...chain,next], elimVal, targets});
          if (found.length > 20) return;
        }
      }
      if (chain.length < 8) {
        const prevLink = chain._prevLink;
        chain._prevLink = linkVal;
        seen.add(`${next.r},${next.c}`);
        chain.push(next);
        dfs(chain, startVal, seen);
        chain.pop();
        seen.delete(`${next.r},${next.c}`);
        chain._prevLink = prevLink;
      }
    }
  }

  for (const cell of bivalue) {
    if (found.length > 30) break;
    for (const startVal of [...notes[cell.r][cell.c]]) {
      const chain = [cell];
      chain._prevLink = startVal;
      const seen = new Set([`${cell.r},${cell.c}`]);
      dfs(chain, startVal, seen);
      if (found.length > 30) break;
    }
  }
  return found;
}

function toggleXYChain() {
  const an = STATE.analysis;
  if (!an.xychainActive) {
    _cancelOtherAnalysis('xychain');
    an.xychains = detectXYChains(); an.xychainIndex = 0; an.xychainActive = true;
  } else {
    an.xychainIndex++;
    if (an.xychainIndex >= an.xychains.length) { deactivateXYChain(); return; }
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateXYChainBtn(); updateActionBar(); renderHighlights();
}
function deactivateXYChain() {
  const an = STATE.analysis;
  an.xychainActive = false; an.xychains = []; an.xychainIndex = 0; an.xychainBatch = false;
  updateXYChainBtn(); updateActionBar(); renderHighlights();
}
function executeXYChain() {
  const an = STATE.analysis;
  const chains = an.xychainBatch ? an.xychains : [an.xychains[an.xychainIndex]].filter(Boolean);
  if (!chains.length) { deactivateXYChain(); return; }
  pushUndo();
  chains.forEach(xy => xy.targets.forEach(({ r, c }) => {
    STATE.notes[r][c].delete(xy.elimVal); updateCellContent(r, c);
  }));
  deactivateXYChain(); renderHighlights();
}
function updateXYChainBtn() {
  const btn = document.getElementById('btn-xychain');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.xychainActive);
}
function longPressXYChain() {
  const an = STATE.analysis;
  if (!an.xychainActive) toggleXYChain();
  if (an.xychainActive && an.xychains.length > 0) {
    an.xychainBatch = true; updateXYChainBtn(); updateActionBar(); renderHighlights();
  }
}

/* ─── Simple Coloring ─── */
function detectColoring() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;

  for (let num = 1; num <= 9; num++) {
    // Build conjugate pairs (units where num appears in exactly 2 empty cells)
    const pairs = [];
    const pairSet = new Set();
    const addPair = (a, b) => {
      const key = [a.r,a.c,b.r,b.c].join(',');
      const key2 = [b.r,b.c,a.r,a.c].join(',');
      if (pairSet.has(key) || pairSet.has(key2)) return;
      pairSet.add(key); pairs.push([a, b]);
    };
    for (let r = 0; r < 9; r++) {
      const cs = [];
      for (let c = 0; c < 9; c++) if (puz[r][c] === 0 && notes[r][c].has(num)) cs.push({r,c});
      if (cs.length === 2) addPair(cs[0], cs[1]);
    }
    for (let c = 0; c < 9; c++) {
      const rs = [];
      for (let r = 0; r < 9; r++) if (puz[r][c] === 0 && notes[r][c].has(num)) rs.push({r,c});
      if (rs.length === 2) addPair(rs[0], rs[1]);
    }
    for (let br = 0; br < 9; br += 3) for (let bc = 0; bc < 9; bc += 3) {
      const cs = [];
      for (let rr = br; rr < br+3; rr++) for (let cc = bc; cc < bc+3; cc++)
        if (puz[rr][cc] === 0 && notes[rr][cc].has(num)) cs.push({r:rr,c:cc});
      if (cs.length === 2) addPair(cs[0], cs[1]);
    }
    if (pairs.length < 2) continue;

    // Build adjacency graph from conjugate pairs
    const adj = {}; // "r,c" -> [{r,c}]
    for (const [a, b] of pairs) {
      const ka = `${a.r},${a.c}`, kb = `${b.r},${b.c}`;
      (adj[ka] = adj[ka] || []).push(b);
      (adj[kb] = adj[kb] || []).push(a);
    }

    // Find connected components and color each separately
    const visitedGlobal = new Set();

    for (const startKey of Object.keys(adj)) {
      if (visitedGlobal.has(startKey)) continue;

      // BFS this component
      const compColor = {}; // "r,c" -> 0 or 1
      const queue = [{ key: startKey, color: 0 }];
      compColor[startKey] = 0;
      visitedGlobal.add(startKey);

      while (queue.length) {
        const { key, color } = queue.shift();
        for (const nb of (adj[key] || [])) {
          const nk = `${nb.r},${nb.c}`;
          if (compColor[nk] !== undefined) continue;
          compColor[nk] = 1 - color;
          visitedGlobal.add(nk);
          queue.push({ key: nk, color: 1 - color });
        }
      }

      const comp0 = Object.entries(compColor).filter(([,v]) => v === 0).map(([k]) => ({ r: +k.split(',')[0], c: +k.split(',')[1] }));
      const comp1 = Object.entries(compColor).filter(([,v]) => v === 1).map(([k]) => ({ r: +k.split(',')[0], c: +k.split(',')[1] }));
      if (comp0.length === 0 || comp1.length === 0) continue;

      // Rule 1: Two same-color cells see each other → that color is invalid
      let rule1Applied = false;
      for (const [colorCells] of [[comp0, comp1], [comp1, comp0]]) {
        let contradiction = false;
        outer: for (let i = 0; i < colorCells.length - 1; i++) {
          for (let j = i + 1; j < colorCells.length; j++) {
            if (cellSees(colorCells[i].r, colorCells[i].c, colorCells[j].r, colorCells[j].c)) {
              contradiction = true; break outer;
            }
          }
        }
        if (contradiction) {
          const targets = colorCells.filter(cell => notes[cell.r][cell.c].has(num));
          if (targets.length > 0) {
            found.push({ num, type: 'contradiction', targets, comp0, comp1, compColor });
            rule1Applied = true; break;
          }
        }
      }
      if (rule1Applied) continue;

      // Rule 2: External cell sees cells of BOTH colors (from this component only) → eliminate
      const external = [];
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        if (puz[r][c] !== 0 || !notes[r][c].has(num)) continue;
        if (compColor[`${r},${c}`] !== undefined) continue; // in chain
        const sees0 = comp0.some(cell => cellSees(r, c, cell.r, cell.c));
        const sees1 = comp1.some(cell => cellSees(r, c, cell.r, cell.c));
        if (sees0 && sees1) external.push({ r, c });
      }
      if (external.length > 0) {
        found.push({ num, type: 'external', targets: external, comp0, comp1, compColor });
      }
    }
  }
  return found;
}

function toggleColoring() {
  const an = STATE.analysis;
  if (!an.coloringActive) {
    _cancelOtherAnalysis('coloring');
    an.colorings = detectColoring(); an.coloringIndex = 0; an.coloringActive = true;
  } else {
    an.coloringIndex++;
    if (an.coloringIndex >= an.colorings.length) { deactivateColoring(); return; }
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateColoringBtn(); updateActionBar(); renderHighlights();
}
function deactivateColoring() {
  const an = STATE.analysis;
  an.coloringActive = false; an.colorings = []; an.coloringIndex = 0; an.coloringBatch = false;
  updateColoringBtn(); updateActionBar(); renderHighlights();
}
function executeColoring() {
  const an = STATE.analysis;
  const colorings = an.coloringBatch ? an.colorings : [an.colorings[an.coloringIndex]].filter(Boolean);
  if (!colorings.length) { deactivateColoring(); return; }
  pushUndo();
  colorings.forEach(co => co.targets.forEach(({ r, c }) => {
    STATE.notes[r][c].delete(co.num); updateCellContent(r, c);
  }));
  deactivateColoring(); renderHighlights();
}
function updateColoringBtn() {
  const btn = document.getElementById('btn-coloring');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.coloringActive);
}
function longPressColoring() {
  const an = STATE.analysis;
  if (!an.coloringActive) toggleColoring();
  if (an.coloringActive && an.colorings.length > 0) {
    an.coloringBatch = true; updateColoringBtn(); updateActionBar(); renderHighlights();
  }
}

/* ─── Forcing Chains (simplified) ─── */
function detectForcingChains() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;
  for (let r=0;r<9&&found.length<5;r++) for (let c=0;c<9&&found.length<5;c++) {
    if (puz[r][c]!==0||notes[r][c].size!==2) continue;
    const [A,B] = [...notes[r][c]];
    const resA = _propagateAssumption(r,c,A);
    const resB = _propagateAssumption(r,c,B);
    if (!resA||!resB) continue;
    for (const key of Object.keys(resA)) {
      if (resB[key]!==undefined && resA[key]===resB[key] && puz[+key.split(',')[0]][+key.split(',')[1]]===0) {
        const [tr,tc] = key.split(',').map(Number);
        found.push({r:tr, c:tc, val:resA[key], sourceR:r, sourceC:c, type:'fill'});
      }
    }
  }
  return found;
}

function _propagateAssumption(r, c, val) {
  const puz2 = STATE.puzzle.map(row=>[...row]);
  const notes2 = STATE.notes.map(row=>row.map(s=>new Set(s)));
  const result = {};
  function place(pr, pc, pv) {
    if (puz2[pr][pc]!==0) return true;
    if (!notes2[pr][pc].has(pv)) return false;
    puz2[pr][pc]=pv; result[`${pr},${pc}`]=pv;
    const peers=[];
    for (let i=0;i<9;i++) { peers.push({r:pr,c:i}); peers.push({r:i,c:pc}); }
    const br=Math.floor(pr/3)*3,bc=Math.floor(pc/3)*3;
    for (let rr=br;rr<br+3;rr++) for (let cc=bc;cc<bc+3;cc++) peers.push({r:rr,c:cc});
    for (const {r:nr,c:nc} of peers) {
      if (puz2[nr][nc]!==0) continue;
      notes2[nr][nc].delete(pv);
      if (notes2[nr][nc].size===0) return false;
    }
    return true;
  }
  if (!place(r,c,val)) return null;
  let changed=true;
  while (changed) {
    changed=false;
    for (let rr=0;rr<9;rr++) for (let cc=0;cc<9;cc++) {
      if (puz2[rr][cc]!==0) continue;
      if (notes2[rr][cc].size===1) {
        const v=[...notes2[rr][cc]][0];
        if (!place(rr,cc,v)) return null;
        changed=true;
      }
    }
  }
  return result;
}

function toggleForcingChains() {
  const an = STATE.analysis;
  if (!an.forcingchainsActive) {
    _cancelOtherAnalysis('forcingchains');
    an.forcingchains = detectForcingChains(); an.forcingchainsIndex = 0; an.forcingchainsActive = true;
  } else {
    an.forcingchainsIndex++;
    if (an.forcingchainsIndex >= an.forcingchains.length) { deactivateForcingChains(); return; }
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateForcingChainsBtn(); updateActionBar(); renderHighlights();
}
function deactivateForcingChains() {
  const an = STATE.analysis;
  an.forcingchainsActive = false; an.forcingchains = []; an.forcingchainsIndex = 0; an.forcingchainsBatch = false;
  updateForcingChainsBtn(); updateActionBar(); renderHighlights();
}
function executeForcingChains() {
  const an = STATE.analysis;
  const fcs = an.forcingchainsBatch ? an.forcingchains : [an.forcingchains[an.forcingchainsIndex]].filter(Boolean);
  if (!fcs.length) { deactivateForcingChains(); return; }
  pushUndo();
  fcs.forEach(fc => {
    STATE.selectedRow = fc.r; STATE.selectedCol = fc.c;
    doPlaceNumber(fc.r, fc.c, fc.val);
  });
  deactivateForcingChains();
}
function updateForcingChainsBtn() {
  const btn = document.getElementById('btn-forcingchains');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.forcingchainsActive);
}
function longPressForcingChains() {
  const an = STATE.analysis;
  if (!an.forcingchainsActive) toggleForcingChains();
  if (an.forcingchainsActive && an.forcingchains.length > 0) {
    an.forcingchainsBatch = true; updateForcingChainsBtn(); updateActionBar(); renderHighlights();
  }
}

/* ─── AIC (Alternating Inference Chain) ─── */
function detectAIC() {
  const found = [];
  const puz = STATE.puzzle, notes = STATE.notes;
  const strongLinks = [];
  for (let num=1;num<=9;num++) {
    for (let r=0;r<9;r++) {
      const cs=[]; for (let c=0;c<9;c++) if (puz[r][c]===0&&notes[r][c].has(num)) cs.push(c);
      if (cs.length===2) strongLinks.push({r1:r,c1:cs[0],r2:r,c2:cs[1],num});
    }
    for (let c=0;c<9;c++) {
      const rs=[]; for (let r=0;r<9;r++) if (puz[r][c]===0&&notes[r][c].has(num)) rs.push(r);
      if (rs.length===2) strongLinks.push({r1:rs[0],c1:c,r2:rs[1],c2:c,num});
    }
    for (let br=0;br<9;br+=3) for (let bc=0;bc<9;bc+=3) {
      const cs=[];
      for (let rr=br;rr<br+3;rr++) for (let cc=bc;cc<bc+3;cc++)
        if (puz[rr][cc]===0&&notes[rr][cc].has(num)) cs.push({r:rr,c:cc});
      if (cs.length===2) strongLinks.push({r1:cs[0].r,c1:cs[0].c,r2:cs[1].r,c2:cs[1].c,num});
    }
  }
  for (let i=0;i<strongLinks.length&&found.length<10;i++) {
    const sl1=strongLinks[i];
    for (let j=i+1;j<strongLinks.length&&found.length<10;j++) {
      const sl2=strongLinks[j];
      if (sl1.num===sl2.num) continue;
      for (const [end1r,end1c,end2r,end2c] of [
        [sl1.r1,sl1.c1,sl1.r2,sl1.c2],[sl1.r2,sl1.c2,sl1.r1,sl1.c1]]) {
        if (notes[end1r]?.[end1c]?.size !== 2) continue;
        if (!notes[end1r][end1c].has(sl1.num)||!notes[end1r][end1c].has(sl2.num)) continue;
        for (const [s2r,s2c,s2er,s2ec] of [
          [sl2.r1,sl2.c1,sl2.r2,sl2.c2],[sl2.r2,sl2.c2,sl2.r1,sl2.c1]]) {
          if (s2r!==end1r||s2c!==end1c) continue;
          const targets=[];
          for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
            if (puz[r][c]!==0||!notes[r][c].has(sl1.num)) continue;
            if ((r===end2r&&c===end2c)||(r===s2er&&c===s2ec)) continue;
            if (cellSees(r,c,end2r,end2c)&&cellSees(r,c,s2er,s2ec)) targets.push({r,c});
          }
          if (targets.length) {
            found.push({
              chain:[{r:end2r,c:end2c,num:sl1.num},{r:end1r,c:end1c,num:sl1.num},{r:s2r,c:s2c,num:sl2.num},{r:s2er,c:s2ec,num:sl2.num}],
              elimVal:sl1.num, targets
            });
          }
        }
      }
    }
  }
  return found;
}

function toggleAIC() {
  const an = STATE.analysis;
  if (!an.aicActive) {
    _cancelOtherAnalysis('aic');
    an.aics = detectAIC(); an.aicIndex = 0; an.aicActive = true;
  } else {
    an.aicIndex++;
    if (an.aicIndex >= an.aics.length) { deactivateAIC(); return; }
  }
  STATE.selectedRow = -1; STATE.selectedCol = -1;
  updateAICBtn(); updateActionBar(); renderHighlights();
}
function deactivateAIC() {
  const an = STATE.analysis;
  an.aicActive = false; an.aics = []; an.aicIndex = 0; an.aicBatch = false;
  updateAICBtn(); updateActionBar(); renderHighlights();
}
function executeAIC() {
  const an = STATE.analysis;
  const aics = an.aicBatch ? an.aics : [an.aics[an.aicIndex]].filter(Boolean);
  if (!aics.length) { deactivateAIC(); return; }
  pushUndo();
  aics.forEach(ai => ai.targets.forEach(({ r, c }) => {
    STATE.notes[r][c].delete(ai.elimVal); updateCellContent(r, c);
  }));
  deactivateAIC(); renderHighlights();
}
function updateAICBtn() {
  const btn = document.getElementById('btn-aic');
  if (btn) btn.classList.toggle('active-mode', STATE.analysis.aicActive);
}
function longPressAIC() {
  const an = STATE.analysis;
  if (!an.aicActive) toggleAIC();
  if (an.aicActive && an.aics.length > 0) {
    an.aicBatch = true; updateAICBtn(); updateActionBar(); renderHighlights();
  }
}

/* ═══════════════════════════════════════
   MENTOR MODE
═══════════════════════════════════════ */
const MENTOR_TEXTS = {
  singles: {
    title: 'Única Nua (Naked Single)',
    steps: [
      'Encontre uma célula vazia com apenas 1 candidato nas anotações.',
      'Esse valor é o único possível — todos os outros foram eliminados pela linha, coluna e quadrante.',
      'Coloque o número na célula.',
    ]
  },
  hiddens: {
    title: 'Única Oculta (Hidden Single)',
    steps: [
      'Escolha uma unidade (linha, coluna ou quadrante).',
      'Procure um número que só aparece nas anotações de UMA única célula nessa unidade.',
      'Embora a célula tenha outros candidatos, esse número só pode ir ali.',
      'Coloque o número na célula.',
    ]
  },
  nakedpairs: {
    title: 'Par Nu (Naked Pair)',
    steps: [
      'Encontre 2 células na mesma unidade com os mesmos 2 candidatos.',
      'Esses dois números estão confinados a esse par — eles irão para essas células, em alguma ordem.',
      'Elimine esses 2 números das OUTRAS células da mesma unidade.',
    ]
  },
  hiddenpairs: {
    title: 'Par Oculto (Hidden Pair)',
    steps: [
      'Em uma unidade, encontre 2 números que só aparecem em exatamente 2 células.',
      'Essas 2 células contêm esse par "escondido" — os outros candidatos são irrelevantes.',
      'Elimine todos os OUTROS candidatos dessas 2 células, mantendo apenas o par.',
    ]
  },
  pointing: {
    title: 'Par/Triplo Apontador (Pointing)',
    steps: [
      'Dentro de um quadrante, encontre um número cujas posições possíveis estejam todas em UMA linha ou coluna.',
      'Se o número vai para o quadrante, ele VAI para essa linha/coluna.',
      'Elimine esse número das demais células dessa linha/coluna, fora do quadrante.',
    ]
  },
  xwing: {
    title: 'X-Wing',
    steps: [
      'Encontre um número que aparece em exatamente 2 posições em cada uma de 2 linhas.',
      'Se essas posições estiverem nas mesmas 2 colunas, forme um retângulo.',
      'O número vai para uma diagonal do retângulo — elimine-o das demais células dessas 2 colunas.',
    ]
  },
  nakedtriples: {
    title: 'Triplo Nu (Naked Triple)',
    steps: [
      'Encontre 3 células na mesma unidade cujos candidatos juntos somam no máximo 3 números distintos.',
      'Esses 3 números estão confinados ao trio — qualquer ordem é possível, mas só entre essas 3 células.',
      'Elimine esses 3 números das OUTRAS células da mesma unidade.',
    ]
  },
  hiddentriples: {
    title: 'Triplo Oculto (Hidden Triple)',
    steps: [
      'Em uma unidade, encontre 3 números que só aparecem em exatamente 3 células.',
      'Essas 3 células têm o trio "escondido" entre os candidatos.',
      'Elimine todos os OUTROS candidatos dessas 3 células.',
    ]
  },
  swordfish: {
    title: 'Swordfish',
    steps: [
      'Encontre um número com posições em ≤3 colunas em cada uma de 3 linhas.',
      'Se essas colunas formarem um conjunto de exatamente 3, você tem um Swordfish.',
      'O número vai para alguma combinação nessas 9 posições — elimine-o das demais células das 3 colunas.',
    ]
  },
  ywing: {
    title: 'Y-Wing (XY-Wing)',
    steps: [
      'Encontre uma célula "pivô" com 2 candidatos (A e B).',
      'Encontre 2 "pincers" que vejam o pivô: um tem (A,C) e o outro tem (B,C).',
      'Em qualquer solução, um dos pincers terá C — qualquer célula que veja AMBOS os pincers não pode ter C.',
      'Elimine C das células que veem os dois pincers.',
    ]
  },
  wwing: {
    title: 'W-Wing',
    steps: [
      'Encontre 2 células bivalor idênticas (AB) que NÃO se veem diretamente.',
      'Encontre uma "ponte": um número forte que conecta as duas células via uma unidade.',
      'A ponte garante que B seja eliminável de células que vejam ambas as células AB.',
    ]
  },
  xychain: {
    title: 'XY-Chain',
    steps: [
      'Construa uma cadeia de células bivalor onde cada célula compartilha um candidato com a próxima.',
      'O primeiro candidato da cadeia = o último candidato da cadeia (formando um "loop lógico").',
      'Qualquer célula que veja AMBOS os extremos da cadeia não pode ter esse candidato.',
    ]
  },
  coloring: {
    title: 'Coloração Simples (Simple Coloring)',
    steps: [
      'Para um número, encontre pares conjugados (unidades com exatamente 2 posições) e forme uma cadeia.',
      'Pinte alternadamente as células de 2 cores.',
      'Regra 1: se 2 células da mesma cor se veem, essa cor é inválida — elimine o número de todas elas.',
      'Regra 2: se uma célula vê células de AMBAS as cores, elimine o número dela.',
    ]
  },
  forcingchains: {
    title: 'Forcing Chains',
    steps: [
      'Tome uma célula com 2 candidatos (A e B).',
      'Suponha A: propague todos os naked singles resultantes.',
      'Suponha B: propague todos os naked singles resultantes.',
      'Se ambas as suposições levam ao mesmo valor em outra célula, esse valor É certo.',
    ]
  },
  aic: {
    title: 'AIC (Alternating Inference Chain)',
    steps: [
      'Construa uma cadeia alternando inferências FORTES (o número vai aqui) e FRACAS (se não aqui, então ali).',
      'Uma ligação forte: num aparece em exatamente 2 lugares em uma unidade.',
      'Uma ligação fraca: mesmo número em 2 candidatos da mesma célula (bivalor).',
      'Se a cadeia começa e termina com o mesmo número (link forte), células que vejam ambos os extremos podem ter esse número eliminado.',
    ]
  },
};

function _getActiveStrategyKey() {
  const an = STATE.analysis;
  if (an.singlesActive) return 'singles';
  if (an.hiddenActive) return 'hiddens';
  if (an.nakedPairsActive) return 'nakedpairs';
  if (an.hiddenpairsActive) return 'hiddenpairs';
  if (an.pointingActive) return 'pointing';
  if (an.xwingActive) return 'xwing';
  if (an.nakedtriplesActive) return 'nakedtriples';
  if (an.hiddentriplesActive) return 'hiddentriples';
  if (an.swordfishActive) return 'swordfish';
  if (an.ywingActive) return 'ywing';
  if (an.wwingActive) return 'wwing';
  if (an.xychainActive) return 'xychain';
  if (an.coloringActive) return 'coloring';
  if (an.forcingchainsActive) return 'forcingchains';
  if (an.aicActive) return 'aic';
  return null;
}

function updateMentorButton() {
  const btn = document.getElementById('btn-mentor-info');
  if (!btn) return;
  const key = _getActiveStrategyKey();
  btn.classList.toggle('hidden', !STATE.settings.mentorMode || !key);
}

function showMentorForActiveAnalysis() {
  const key = _getActiveStrategyKey();
  if (!key) return;
  const data = MENTOR_TEXTS[key];
  if (!data) return;
  document.getElementById('mentor-strategy-badge').textContent = data.title;
  const content = document.getElementById('mentor-content');
  content.innerHTML = data.steps.map((s, i) =>
    `<div class="mentor-step"><span class="mentor-step-num">${i+1}</span><span>${s}</span></div>`
  ).join('');
  document.getElementById('mentor-panel').classList.add('mentor-visible');
}

function hideMentorPanel() {
  document.getElementById('mentor-panel').classList.remove('mentor-visible');
}

/* ═══════════════════════════════════════
   i18n — Language
═══════════════════════════════════════ */
const I18N = {
  pt: {
    facil:'Fácil', medio:'Médio', dificil:'Difícil', especialista:'Especialista', mestre:'Mestre', extremo:'Extremo',
    chooseLevel:'Escolha a dificuldade',
    settings:'Ajustes', ranking:'🏆 Ranking',
    notes:'Anotações', undo:'Desfazer', erase:'Apagar', fill:'Preencher', simulator:'Simulador',
    best:'Sempre 🏆', difficulty:'Dificuldade', errors:'Erros', time:'Tempo',
    resume:'Retomar', discard:'Descartar',
    confirm:'Confirmar', cancel:'✕',
  },
  en: {
    facil:'Easy', medio:'Medium', dificil:'Hard', especialista:'Expert', mestre:'Master', extremo:'Extreme',
    chooseLevel:'Choose difficulty',
    settings:'Settings', ranking:'🏆 Ranking',
    notes:'Notes', undo:'Undo', erase:'Erase', fill:'Fill', simulator:'Simulator',
    best:'Best 🏆', difficulty:'Difficulty', errors:'Errors', time:'Time',
    resume:'Resume', discard:'Discard',
    confirm:'Confirm', cancel:'✕',
  }
};

function applyLanguage(lang) {
  STATE.settings.language = lang || 'pt';
  saveSettings();
  const t = I18N[lang] || I18N.pt;
  // Diff buttons
  document.querySelectorAll('.diff-btn').forEach(btn => {
    const diff = btn.dataset.diff;
    const nameEl = btn.querySelector('.diff-name');
    if (nameEl && t[diff]) nameEl.textContent = t[diff];
  });
  // DIFF_NAMES
  ['facil','medio','dificil','especialista','mestre','extremo'].forEach(d => {
    if (t[d]) DIFF_NAMES[d] = t[d];
  });
  // Subtitle
  const sub = document.querySelector('.diff-logo p');
  if (sub) sub.textContent = t.chooseLevel;
  // Footer buttons
  const rankBtn = document.getElementById('btn-ranking-home');
  if (rankBtn) rankBtn.textContent = t.ranking;
  const settBtn = document.querySelector('#btn-settings-home');
  if (settBtn) { const svg = settBtn.querySelector('svg'); settBtn.textContent = ' ' + t.settings; if(svg) settBtn.prepend(svg); }
  // Game controls
  const ctrl = (id, key) => { const el = document.getElementById(id); if (el) { const sp = el.querySelector('span:last-child'); if(sp) sp.textContent = t[key]; } };
  ctrl('btn-notes', 'notes'); ctrl('btn-undo', 'undo'); ctrl('btn-erase', 'erase');
  ctrl('btn-fill', 'fill'); ctrl('btn-sim', 'simulator');
  // Lang buttons
  ['pt','en'].forEach(l => {
    const b = document.getElementById('lang-'+l);
    if (b) b.classList.toggle('active', l === lang);
  });
  // Update unlock info
  updateDiffButtons();
  // Update badge if in game
  if (STATE.puzzle) {
    const badge = document.getElementById('difficulty-badge');
    if (badge) badge.textContent = DIFF_NAMES[STATE.difficulty] || STATE.difficulty;
  }
}

function renderAnalysisHighlights() {
  if (!cellElements.length || !cellElements[0]) return;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      cellElements[r][c].classList.remove(
        'singles-match', 'hidden-unit',
        'pair-select', 'pair-affected',
        'triple-select', 'triple-affected',
        'pointing-select', 'pointing-affected',
        'xwing-cell', 'xwing-target', 'ywing-pivot', 'ywing-pincer', 'ywing-target',
        'wwing-cell', 'wwing-bridge', 'wwing-target',
        'xychain-cell', 'coloring-c0', 'coloring-c1', 'chain-step',
        'genio-fill', 'genio-key', 'genio-pivot', 'genio-elim', 'genio-unit'
      );
  document.querySelectorAll('.note-digit.note-eliminate').forEach(s => s.classList.remove('note-eliminate'));
  document.querySelectorAll('.note-digit.note-hidden-single').forEach(s => s.classList.remove('note-hidden-single'));
  document.querySelectorAll('.note-digit.note-xwing').forEach(s => s.classList.remove('note-xwing'));
  document.querySelectorAll('.note-digit.note-ywing-pivot').forEach(s => s.classList.remove('note-ywing-pivot'));
  document.querySelectorAll('.note-digit.note-ywing-pincer').forEach(s => s.classList.remove('note-ywing-pincer'));
  document.querySelectorAll('.note-digit.note-wwing').forEach(s => s.classList.remove('note-wwing'));
  document.querySelectorAll('.note-digit.note-triple-key').forEach(s => s.classList.remove('note-triple-key'));
  document.querySelectorAll('.note-digit.note-chain').forEach(s => s.classList.remove('note-chain'));

  const an = STATE.analysis;

  /* Únicas — célula alvo em verde + linha/coluna/quadrante em âmbar (single) ou todas as células (batch) */
  if (an.singlesActive && an.singles.length > 0) {
    if (an.singlesBatch) {
      /* Batch: todos os alvos em verde, sem âmbar */
      for (const sg of an.singles) cellElements[sg.r][sg.c].classList.add('singles-match');
    } else {
      /* Single: célula atual + unidades em âmbar */
      const sg = an.singles[an.singlesIndex];
      if (sg) {
        const boxR = Math.floor(sg.r / 3) * 3, boxC = Math.floor(sg.c / 3) * 3;
        for (let r = 0; r < 9; r++)
          for (let c = 0; c < 9; c++) {
            if (r === sg.r && c === sg.c) continue;
            if (r === sg.r || c === sg.c || (r >= boxR && r < boxR + 3 && c >= boxC && c < boxC + 3))
              cellElements[r][c].classList.add('hidden-unit');
          }
        cellElements[sg.r][sg.c].classList.add('singles-match');
      }
    }
  }

  /* Ocultas — hidden single: verde + nota em verde; unidade responsável em âmbar (ou batch: todos) */
  if (an.hiddenActive && an.hiddens.length > 0) {
    if (an.singlesBatch) {
      /* Batch: todos os alvos em verde + suas notas destacadas */
      for (const hd of an.hiddens) {
        cellElements[hd.r][hd.c].classList.add('singles-match');
        const span = cellElements[hd.r][hd.c].querySelector(`.note-digit[data-note="${hd.val}"]`);
        if (span) span.classList.add('note-hidden-single');
      }
    } else {
      const hd = an.hiddens[an.hiddensIndex];
      if (hd) {
        /* Âmbar na unidade que "força" o número */
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (r === hd.r && c === hd.c) continue;
            let inUnit = false;
            if (hd.unitType === 'row' && r === hd.unitIdx) inUnit = true;
            if (hd.unitType === 'col' && c === hd.unitIdx) inUnit = true;
            if (hd.unitType === 'box') {
              const br = Math.floor(hd.unitIdx / 3) * 3;
              const bc = (hd.unitIdx % 3) * 3;
              if (r >= br && r < br + 3 && c >= bc && c < bc + 3) inUnit = true;
            }
            if (inUnit) cellElements[r][c].classList.add('hidden-unit');
          }
        }
        cellElements[hd.r][hd.c].classList.add('singles-match');
        const span = cellElements[hd.r][hd.c].querySelector(`.note-digit[data-note="${hd.val}"]`);
        if (span) span.classList.add('note-hidden-single');
      }
    }
  }

  /* Pares Nus — padrão atual ou todos (batch) */
  if (an.nakedPairsActive && an.nakedPairs.length > 0) {
    const pairs = an.nakedPairsBatch ? an.nakedPairs : [an.nakedPairs[an.nakedPairsIndex]].filter(Boolean);
    pairs.forEach(np => {
      np.pairCells.forEach(({ r, c }) => cellElements[r][c].classList.add('pair-select'));
      np.affected.forEach(({ r, c, nums }) => {
        cellElements[r][c].classList.add('pair-affected');
        nums.forEach(n => {
          const span = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (span) span.classList.add('note-eliminate');
        });
      });
    });
  }

  /* Par Apontador — padrão atual ou todos (batch) */
  if (an.pointingActive && an.pointings.length > 0) {
    const pts = an.pointingBatch ? an.pointings : [an.pointings[an.pointingIndex]].filter(Boolean);
    pts.forEach(pt => {
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
    });
  }

  /* X-Wing — padrão atual ou todos (batch) */
  if (an.xwingActive && an.xwings.length > 0) {
    const wings = an.xwingBatch ? an.xwings : [an.xwings[an.xwingIndex]].filter(Boolean);
    wings.forEach(xw => {
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
    });
  }

  /* Y-Wing — padrão atual ou todos (batch) */
  if (an.ywingActive && an.ywings.length > 0) {
    const wings = an.ywingBatch ? an.ywings : [an.ywings[an.ywingIndex]].filter(Boolean);
    wings.forEach(yw => {
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
    });
  }

  /* W-Wing — padrão atual ou todos (batch) */
  if (an.wwingActive && an.wwings.length > 0) {
    const wings = an.wwingBatch ? an.wwings : [an.wwings[an.wwingIndex]].filter(Boolean);
    wings.forEach(ww => {
      ww.cells.forEach(({r, c}) => {
        cellElements[r][c].classList.add('wwing-cell');
        STATE.notes[r][c].forEach(n => {
          const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (sp) sp.classList.add('note-wwing');
        });
      });
      ww.bridge.forEach(({r, c}) => cellElements[r][c].classList.add('wwing-bridge'));
      ww.targets.forEach(({r, c}) => {
        cellElements[r][c].classList.add('wwing-target');
        const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${ww.elimVal}"]`);
        if (sp) sp.classList.add('note-eliminate');
      });
    });
  }

  /* Hidden Pairs — same visual as Naked Pairs */
  if (an.hiddenpairsActive && an.hiddenpairs.length > 0) {
    const pairs = an.hiddenpairsBatch ? an.hiddenpairs : [an.hiddenpairs[an.hiddenpairsIndex]].filter(Boolean);
    pairs.forEach(hp => {
      hp.pairCells.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('pair-select');
        hp.pairNums.forEach(n => {
          const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (sp) sp.classList.add('note-xwing'); // green — these are the key nums
        });
      });
      hp.affected.forEach(({ r, c, nums }) => {
        cellElements[r][c].classList.add('pair-affected');
        nums.forEach(n => {
          const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (sp) sp.classList.add('note-eliminate');
        });
      });
    });
  }

  /* Naked Triples */
  if (an.nakedtriplesActive && an.nakedtriples.length > 0) {
    const trips = an.nakedtriplesBatch ? an.nakedtriples : [an.nakedtriples[an.nakedtriplesIndex]].filter(Boolean);
    trips.forEach(nt => {
      nt.tripleCells.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('triple-select');
        nt.tripleNums.forEach(n => {
          const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (sp) sp.classList.add('note-xwing');
        });
      });
      nt.affected.forEach(({ r, c, nums }) => {
        cellElements[r][c].classList.add('triple-affected');
        nums.forEach(n => {
          const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (sp) sp.classList.add('note-eliminate');
        });
      });
    });
  }

  /* Hidden Triples */
  if (an.hiddentriplesActive && an.hiddentriples.length > 0) {
    const trips = an.hiddentriplesBatch ? an.hiddentriples : [an.hiddentriples[an.hiddentriplesIndex]].filter(Boolean);
    trips.forEach(ht => {
      ht.tripleCells.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('triple-select');
        ht.tripleNums.forEach(n => {
          const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (sp) sp.classList.add('note-xwing');
        });
      });
      ht.affected.forEach(({ r, c, nums }) => {
        cellElements[r][c].classList.add('pair-affected');
        nums.forEach(n => {
          const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (sp) sp.classList.add('note-eliminate');
        });
      });
    });
  }

  /* Swordfish */
  if (an.swordfishActive && an.swordfishes.length > 0) {
    const fishes = an.swordfishBatch ? an.swordfishes : [an.swordfishes[an.swordfishIndex]].filter(Boolean);
    fishes.forEach(sf => {
      sf.cells.forEach(({r, c}) => {
        cellElements[r][c].classList.add('xwing-cell');
        const span = cellElements[r][c].querySelector(`.note-digit[data-note="${sf.num}"]`);
        if (span) span.classList.add('note-xwing');
      });
      sf.targets.forEach(({r, c}) => {
        cellElements[r][c].classList.add('xwing-target');
        const span = cellElements[r][c].querySelector(`.note-digit[data-note="${sf.num}"]`);
        if (span) span.classList.add('note-eliminate');
      });
    });
  }

  /* XY-Chain — animate chain steps */
  if (an.xychainActive && an.xychains.length > 0) {
    const chains = an.xychainBatch ? an.xychains : [an.xychains[an.xychainIndex]].filter(Boolean);
    chains.forEach(xy => {
      xy.chain.forEach(({ r, c }, idx) => {
        const el = cellElements[r][c];
        el.classList.add('xychain-cell');
        el.style.setProperty('--chain-delay', `${idx * 200}ms`);
        const chainNotes = STATE.notes[r][c];
        chainNotes.forEach(n => {
          const sp = el.querySelector(`.note-digit[data-note="${n}"]`);
          if (sp) sp.classList.add('note-chain');
        });
      });
      xy.targets.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('xwing-target');
        const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${xy.elimVal}"]`);
        if (sp) sp.classList.add('note-eliminate');
      });
    });
  }

  /* Coloring */
  if (an.coloringActive && an.colorings.length > 0) {
    const colorings = an.coloringBatch ? an.colorings : [an.colorings[an.coloringIndex]].filter(Boolean);
    colorings.forEach(co => {
      (co.comp0 || []).forEach(({ r, c }) => {
        cellElements[r][c].classList.add('coloring-c0');
        const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${co.num}"]`);
        if (sp) sp.classList.add('note-xwing');
      });
      (co.comp1 || []).forEach(({ r, c }) => {
        cellElements[r][c].classList.add('coloring-c1');
        const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${co.num}"]`);
        if (sp) sp.classList.add('note-hidden-single');
      });
      co.targets.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('xwing-target');
        const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${co.num}"]`);
        if (sp) sp.classList.add('note-eliminate');
      });
    });
  }

  /* Forcing Chains */
  if (an.forcingchainsActive && an.forcingchains.length > 0) {
    const fcs = an.forcingchainsBatch ? an.forcingchains : [an.forcingchains[an.forcingchainsIndex]].filter(Boolean);
    fcs.forEach(fc => {
      if (fc.sourceR !== undefined) cellElements[fc.sourceR][fc.sourceC].classList.add('genio-key');
      cellElements[fc.r][fc.c].classList.add('singles-match');
    });
  }

  /* AIC */
  if (an.aicActive && an.aics.length > 0) {
    const aics = an.aicBatch ? an.aics : [an.aics[an.aicIndex]].filter(Boolean);
    aics.forEach(aic => {
      aic.chain.forEach(({ r, c, num }, idx) => {
        const el = cellElements[r][c];
        el.classList.add('xychain-cell');
        el.style.setProperty('--chain-delay', `${idx * 150}ms`);
        const sp = el.querySelector(`.note-digit[data-note="${num || aic.elimVal}"]`);
        if (sp) sp.classList.add('note-chain');
      });
      aic.targets.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('xwing-target');
        const sp = cellElements[r][c].querySelector(`.note-digit[data-note="${aic.elimVal}"]`);
        if (sp) sp.classList.add('note-eliminate');
      });
    });
  }

  updateMentorButton();
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
  toggle('cfg-showSelZone',       s.showSelZone);
  toggle('cfg-showNoteMatch',     s.showNoteMatch);
  toggle('cfg-enableDialPin',     s.enableDialPin);
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

  toggle('cfg-enableWWing',          s.enableWWing);
  toggle('cfg-mentorMode',           s.mentorMode);
  toggle('cfg-filterByDifficulty',   s.filterByDifficulty);
  toggle('cfg-enableHiddenPairs',    s.enableHiddenPairs);
  toggle('cfg-enableNakedTriples',   s.enableNakedTriples);
  toggle('cfg-enableHiddenTriples',  s.enableHiddenTriples);
  toggle('cfg-enableSwordfish',      s.enableSwordfish);
  toggle('cfg-enableXYChain',        s.enableXYChain);
  toggle('cfg-enableColoring',       s.enableColoring);
  toggle('cfg-enableForcingChains',  s.enableForcingChains);
  toggle('cfg-enableAIC',            s.enableAIC);

  /* Naked Single tri-toggle */
  const nsToggle = document.getElementById('cfg-nakedSingleMode');
  if (nsToggle) {
    const v = s.nakedSingleMode || 0;
    nsToggle.querySelectorAll('.tri-btn').forEach(b =>
      b.classList.toggle('active', +b.dataset.val === v));
  }

  /* Language buttons */
  ['pt','en'].forEach(l => {
    const b = document.getElementById('lang-'+l);
    if (b) b.classList.toggle('active', l === s.language);
  });

  document.getElementById('max-errors-val').textContent = s.maxErrors;
  document.getElementById('max-errors-row').classList.toggle('hidden', !s.failOnErrors);
  const hiddenRow = document.getElementById('setting-row-hidden-singles');
  if (hiddenRow) hiddenRow.classList.toggle('hidden', !s.enableNakedSingles);
  updateControlsForSimMode();
  updateFillBtnVisibility();
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

/* ═══════════════════════════════════════
   GÊNIO DA LÂMPADA — solucionador secreto
   Ativado com 3 cliques rápidos em #score-val
   Tabuleiro permanece visível com highlights animados
═══════════════════════════════════════ */

let _genioClicks = 0;
let _genioClickTimer = null;

function _attachGenioTrigger() {
  const energyLbl = document.getElementById('energy-label');
  if (energyLbl) {
    energyLbl.addEventListener('click', () => {
      if (!STATE.puzzle || STATE.paused) { _genioClicks = 0; return; }
      _genioClicks++;
      clearTimeout(_genioClickTimer);
      if (_genioClicks >= 3) {
        _genioClicks = 0;
        activateGenio();
      } else {
        _genioClickTimer = setTimeout(() => { _genioClicks = 0; }, 700);
      }
    });
  }
  /* Mantém o listener no score-val (oculto) como fallback */
  const scoreEl = document.getElementById('score-val');
  if (scoreEl) {
    scoreEl.addEventListener('click', () => {
      if (!STATE.puzzle || STATE.paused) { _genioClicks = 0; return; }
      _genioClicks++;
      clearTimeout(_genioClickTimer);
      if (_genioClicks >= 3) {
        _genioClicks = 0;
        activateGenio();
      } else {
        _genioClickTimer = setTimeout(() => { _genioClicks = 0; }, 700);
      }
    });
  }
  document.getElementById('btn-genio-cancel').addEventListener('click', _hideGenioPanel);
}

/* Formata coordenada legível */
function _gCell(r, c) { return `L${r + 1}·C${c + 1}`; }

/* ── Highlights no tabuleiro ── */
function _clearGenioHighlights() {
  if (!cellElements.length || !cellElements[0]) return;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      cellElements[r][c].classList.remove('genio-fill', 'genio-key', 'genio-pivot', 'genio-elim', 'genio-unit');
  document.querySelectorAll('.note-genio-elim, .note-genio-key').forEach(s =>
    s.classList.remove('note-genio-elim', 'note-genio-key'));
}

function _applyGenioHighlights(move) {
  _clearGenioHighlights();
  if (move.type === 'fill') {
    const { r, c, val, strategy } = move;
    cellElements[r][c].classList.add('genio-fill');
    /* Contexto: linha, coluna e quadrante */
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 9; i++) {
      if (i !== c) cellElements[r][i].classList.add('genio-unit');
      if (i !== r) cellElements[i][c].classList.add('genio-unit');
    }
    for (let rr = br; rr < br + 3; rr++)
      for (let cc = bc; cc < bc + 3; cc++)
        if (!(rr === r && cc === c)) cellElements[rr][cc].classList.add('genio-unit');
    /* Para Única Oculta, destaca a nota alvo */
    if (strategy === 'Única Oculta') {
      const span = cellElements[r][c].querySelector(`.note-digit[data-note="${val}"]`);
      if (span) span.classList.add('note-genio-key');
    }
    /* Para Hidden Single: âmbar na unidade forçadora */
    if (strategy === 'Única Oculta' && move.data) {
      const hd = move.data;
      for (let rr = 0; rr < 9; rr++) for (let cc = 0; cc < 9; cc++) {
        if (rr === r && cc === c) continue;
        let inUnit = false;
        if (hd.unitType === 'row' && rr === hd.unitIdx) inUnit = true;
        if (hd.unitType === 'col' && cc === hd.unitIdx) inUnit = true;
        if (hd.unitType === 'box') {
          const ubr = Math.floor(hd.unitIdx / 3) * 3, ubc = (hd.unitIdx % 3) * 3;
          if (rr >= ubr && rr < ubr + 3 && cc >= ubc && cc < ubc + 3) inUnit = true;
        }
        if (inUnit) cellElements[rr][cc].classList.add('genio-unit');
      }
    }
  } else {
    const d = move.data;
    if (move.strategy === 'Par Nu') {
      d.pairCells.forEach(({ r, c }) => cellElements[r][c].classList.add('genio-key'));
      d.affected.forEach(({ r, c, nums }) => {
        cellElements[r][c].classList.add('genio-elim');
        nums.forEach(n => {
          const s = cellElements[r][c].querySelector(`.note-digit[data-note="${n}"]`);
          if (s) s.classList.add('note-genio-elim');
        });
      });
    } else if (move.strategy === 'Par Apontador') {
      d.cells.forEach(({ r, c }) => cellElements[r][c].classList.add('genio-key'));
      d.targets.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('genio-elim');
        const s = cellElements[r][c].querySelector(`.note-digit[data-note="${d.num}"]`);
        if (s) s.classList.add('note-genio-elim');
      });
    } else if (move.strategy === 'X-Wing') {
      d.cells.forEach(({ r, c }) => cellElements[r][c].classList.add('genio-key'));
      d.targets.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('genio-elim');
        const s = cellElements[r][c].querySelector(`.note-digit[data-note="${d.num}"]`);
        if (s) s.classList.add('note-genio-elim');
      });
    } else if (move.strategy === 'Y-Wing') {
      cellElements[d.pivot.r][d.pivot.c].classList.add('genio-pivot');
      d.pincers.forEach(({ r, c }) => cellElements[r][c].classList.add('genio-key'));
      d.targets.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('genio-elim');
        const s = cellElements[r][c].querySelector(`.note-digit[data-note="${d.elimVal}"]`);
        if (s) s.classList.add('note-genio-elim');
      });
    } else if (move.strategy === 'W-Wing') {
      d.cells.forEach(({ r, c }) => cellElements[r][c].classList.add('genio-key'));
      d.bridge.forEach(({ r, c }) => cellElements[r][c].classList.add('genio-unit'));
      d.targets.forEach(({ r, c }) => {
        cellElements[r][c].classList.add('genio-elim');
        const s = cellElements[r][c].querySelector(`.note-digit[data-note="${d.elimVal}"]`);
        if (s) s.classList.add('note-genio-elim');
      });
    }
  }
}

/* ── Painel deslizante ── */
function _showGenioPanel(move) {
  _applyGenioHighlights(move);
  document.getElementById('genio-strategy').textContent = move.strategy;
  const explEl = document.getElementById('genio-explain');
  if (explEl) explEl.textContent = move.shortHint || '';
  document.getElementById('btn-genio-confirm').onclick = () => {
    _hideGenioPanel();
    _execGenioMove(move);
  };
  document.getElementById('genio-panel').classList.add('genio-visible');
}

function _hideGenioPanel() {
  document.getElementById('genio-panel').classList.remove('genio-visible');
  _clearGenioHighlights();
}

function activateGenio() {
  if (!STATE.puzzle) return;

  /* Garante notas populadas */
  let hasNotes = false;
  outer: for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (STATE.puzzle[r][c] === 0 && STATE.notes[r][c].size > 0) { hasNotes = true; break outer; }
  if (!hasNotes) applyAutoAnnotations();

  let move = null;

  /* ── 1. Única Nua ── */
  outer1: for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (STATE.puzzle[r][c] === 0 && STATE.notes[r][c].size === 1) {
        const val = [...STATE.notes[r][c]][0];
        move = {
          type: 'fill', r, c, val, strategy: 'Única Nua', data: null,
          shortHint: `${_gCell(r, c)} → ${val}`
        };
        break outer1;
      }

  /* ── 2. Única Oculta ── */
  if (!move) {
    const hiddens = _computeHiddenSingles();
    if (hiddens.length > 0) {
      const h = hiddens[0];
      move = {
        type: 'fill', r: h.r, c: h.c, val: h.val, strategy: 'Única Oculta', data: h,
        shortHint: `${_gCell(h.r, h.c)} → ${h.val}`
      };
    }
  }

  /* ── 3. Par Nu ── */
  if (!move) {
    const pairs = detectNakedPairs();
    if (pairs.length > 0) {
      const np = pairs[0];
      const totalElim = np.affected.reduce((s, a) => s + a.nums.size, 0);
      move = {
        type: 'elim', strategy: 'Par Nu', data: np,
        shortHint: `Elimina ${totalElim} candidato(s)`,
        exec: () => {
          pushUndo();
          np.affected.forEach(({ r, c, nums }) => { nums.forEach(n => STATE.notes[r][c].delete(n)); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 4. Par Oculto ── */
  if (!move) {
    const hpairs = detectHiddenPairs();
    if (hpairs.length > 0) {
      const hp = hpairs[0];
      const totalElim = hp.affected.reduce((s, a) => s + a.nums.size, 0);
      move = {
        type: 'elim', strategy: 'Par Oculto', data: hp,
        shortHint: `Elimina ${totalElim} candidato(s)`,
        exec: () => {
          pushUndo();
          hp.affected.forEach(({ r, c, nums }) => { nums.forEach(n => STATE.notes[r][c].delete(n)); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 5. Par Apontador ── */
  if (!move) {
    const pts = detectPointingPairs();
    if (pts.length > 0) {
      const pt = pts[0];
      move = {
        type: 'elim', strategy: 'Par Apontador', data: pt,
        shortHint: `Elimina ${pt.targets.length} candidato(s)`,
        exec: () => {
          pushUndo();
          pt.targets.forEach(({ r, c }) => { STATE.notes[r][c].delete(pt.num); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 6. Triplo Nu ── */
  if (!move) {
    const triples = detectNakedTriples();
    if (triples.length > 0) {
      const nt = triples[0];
      const totalElim = nt.affected.reduce((s, a) => s + a.nums.size, 0);
      move = {
        type: 'elim', strategy: 'Triplo Nu', data: nt,
        shortHint: `Elimina ${totalElim} candidato(s)`,
        exec: () => {
          pushUndo();
          nt.affected.forEach(({ r, c, nums }) => { nums.forEach(n => STATE.notes[r][c].delete(n)); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 7. Triplo Oculto ── */
  if (!move) {
    const htriples = detectHiddenTriples();
    if (htriples.length > 0) {
      const ht = htriples[0];
      const totalElim = ht.affected.reduce((s, a) => s + a.nums.size, 0);
      move = {
        type: 'elim', strategy: 'Triplo Oculto', data: ht,
        shortHint: `Elimina ${totalElim} candidato(s)`,
        exec: () => {
          pushUndo();
          ht.affected.forEach(({ r, c, nums }) => { nums.forEach(n => STATE.notes[r][c].delete(n)); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 8. X-Wing ── */
  if (!move) {
    const xwings = detectXWings();
    if (xwings.length > 0) {
      const xw = xwings[0];
      move = {
        type: 'elim', strategy: 'X-Wing', data: xw,
        shortHint: `Elimina ${xw.targets.length} candidato(s)`,
        exec: () => {
          pushUndo();
          xw.targets.forEach(({ r, c }) => { STATE.notes[r][c].delete(xw.num); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 9. Swordfish ── */
  if (!move) {
    const swords = detectSwordfish();
    if (swords.length > 0) {
      const sf = swords[0];
      move = {
        type: 'elim', strategy: 'Swordfish', data: sf,
        shortHint: `Elimina ${sf.targets.length} candidato(s)`,
        exec: () => {
          pushUndo();
          sf.targets.forEach(({ r, c }) => { STATE.notes[r][c].delete(sf.num); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 10. Y-Wing ── */
  if (!move) {
    const ywings = detectYWings();
    if (ywings.length > 0) {
      const yw = ywings[0];
      move = {
        type: 'elim', strategy: 'Y-Wing', data: yw,
        shortHint: `Elimina ${yw.targets.length} candidato(s)`,
        exec: () => {
          pushUndo();
          yw.targets.forEach(({ r, c }) => { STATE.notes[r][c].delete(yw.elimVal); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 11. W-Wing ── */
  if (!move) {
    const wwings = detectWWings();
    if (wwings.length > 0) {
      const ww = wwings[0];
      move = {
        type: 'elim', strategy: 'W-Wing', data: ww,
        shortHint: `Elimina ${ww.targets.length} candidato(s)`,
        exec: () => {
          pushUndo();
          ww.targets.forEach(({ r, c }) => { STATE.notes[r][c].delete(ww.elimVal); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 12. XY-Chain ── */
  if (!move) {
    const xychains = detectXYChains();
    if (xychains.length > 0) {
      const xy = xychains[0];
      move = {
        type: 'elim', strategy: 'XY-Chain', data: xy,
        shortHint: `Elimina ${xy.targets.length} candidato(s)`,
        exec: () => {
          pushUndo();
          xy.targets.forEach(({ r, c }) => { STATE.notes[r][c].delete(xy.elimVal); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 13. Coloring ── */
  if (!move) {
    const colorings = detectColoring();
    if (colorings.length > 0) {
      const co = colorings[0];
      move = {
        type: 'elim', strategy: 'Coloring', data: co,
        shortHint: `Elimina ${co.targets.length} candidato(s)`,
        exec: () => {
          pushUndo();
          co.targets.forEach(({ r, c }) => { STATE.notes[r][c].delete(co.num); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 14. Forcing Chains ── */
  if (!move) {
    const fcs = detectForcingChains();
    if (fcs.length > 0) {
      const fc = fcs[0];
      move = {
        type: 'fill', r: fc.r, c: fc.c, val: fc.val, strategy: 'Forcing Chains', data: fc,
        shortHint: `${_gCell(fc.r, fc.c)} → ${fc.val}`
      };
    }
  }

  /* ── 15. AIC ── */
  if (!move) {
    const aics = detectAIC();
    if (aics.length > 0) {
      const ai = aics[0];
      move = {
        type: 'elim', strategy: 'AIC', data: ai,
        shortHint: `Elimina ${ai.targets.length} candidato(s)`,
        exec: () => {
          pushUndo();
          ai.targets.forEach(({ r, c }) => { STATE.notes[r][c].delete(ai.elimVal); updateCellContent(r, c); });
          renderHighlights();
        },
      };
    }
  }

  /* ── 16. Força Bruta ── */
  if (!move) {
    for (let r = 0; r < 9 && !move; r++)
      for (let c = 0; c < 9 && !move; c++)
        if (STATE.puzzle[r][c] === 0) {
          const val = STATE.solution[r][c];
          move = {
            type: 'fill', r, c, val, strategy: 'Força Bruta', data: null,
            shortHint: `${_gCell(r, c)} → ${val}`
          };
        }
  }

  if (!move) return;
  _showGenioPanel(move);
}

function _execGenioMove(move) {
  if (move.type === 'fill') {
    STATE.selectedRow = move.r;
    STATE.selectedCol = move.c;
    doPlaceNumber(move.r, move.c, move.val);
  } else {
    move.exec();
  }
}
