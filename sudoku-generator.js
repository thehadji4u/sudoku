/* sudoku-generator.js — Geração e resolução de puzzles de Sudoku */
const SudokuGenerator = (() => {

  const DIFFICULTY = {
    facil:        { remove: 36, multiplier: 1   },
    medio:        { remove: 42, multiplier: 1.5 },
    dificil:      { remove: 47, multiplier: 2   },
    especialista: { remove: 51, multiplier: 3   },
    mestre:       { remove: 55, multiplier: 4   },
    extremo:      { remove: 58, multiplier: 6   },
  };

  /* ── helpers ── */

  function createEmpty() {
    return Array.from({ length: 9 }, () => new Array(9).fill(0));
  }

  function isValid(board, row, col, num) {
    for (let i = 0; i < 9; i++) {
      if (board[row][i] === num) return false;
      if (board[i][col] === num) return false;
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++)
      for (let c = bc; c < bc + 3; c++)
        if (board[r][c] === num) return false;
    return true;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ── solver (aleatório — para geração) ── */

  function solveRandom(board) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (const n of digits) {
            if (isValid(board, r, c, n)) {
              board[r][c] = n;
              if (solveRandom(board)) return true;
              board[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  /* ── contador de soluções (determinístico — para unicidade) ── */

  function countSolutions(board, limit) {
    let count = 0;
    function bt(depth) {
      if (count >= limit) return;
      // Limite de profundidade para puzzles extremos (performance)
      if (depth > 60) { count = limit; return; }
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] === 0) {
            for (let n = 1; n <= 9; n++) {
              if (isValid(board, r, c, n)) {
                board[r][c] = n;
                bt(depth + 1);
                board[r][c] = 0;
                if (count >= limit) return;
              }
            }
            return;
          }
        }
      }
      count++;
    }
    bt(0);
    return count;
  }

  /* ── remoção de células mantendo unicidade ── */

  function removeCells(solved, targetCount) {
    const puzzle = solved.map(r => [...r]);
    const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));
    let removed = 0;

    for (const pos of positions) {
      if (removed >= targetCount) break;
      const r = Math.floor(pos / 9);
      const c = pos % 9;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;

      const copy = puzzle.map(row => [...row]);
      if (countSolutions(copy, 2) === 1) {
        removed++;
      } else {
        puzzle[r][c] = backup;
      }
    }
    return puzzle;
  }

  /* ── API pública ── */

  function generate(difficulty) {
    const cfg = DIFFICULTY[difficulty] || DIFFICULTY.facil;
    const solution = createEmpty();
    solveRandom(solution);
    const puzzle = removeCells(solution.map(r => [...r]), cfg.remove);
    return {
      puzzle:   puzzle.map(r => [...r]),
      solution: solution.map(r => [...r]),
    };
  }

  /* Resolve um tabuleiro parcial e retorna a solução (ou null) */
  function solve(board) {
    const copy = board.map(r => [...r]);
    function bt() {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (copy[r][c] === 0) {
            for (let n = 1; n <= 9; n++) {
              if (isValid(copy, r, c, n)) {
                copy[r][c] = n;
                if (bt()) return true;
                copy[r][c] = 0;
              }
            }
            return false;
          }
        }
      }
      return true;
    }
    return bt() ? copy : null;
  }

  function getMultiplier(difficulty) {
    return (DIFFICULTY[difficulty] || DIFFICULTY.facil).multiplier;
  }

  function getDifficultyList() {
    return Object.keys(DIFFICULTY);
  }

  return { generate, solve, getMultiplier, getDifficultyList };
})();
