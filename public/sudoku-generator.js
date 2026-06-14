/* sudoku-generator.js — Geração e resolução de puzzles de Sudoku */
const SudokuGenerator = (() => {

  const DIFFICULTY = {
    facil:        { removeMin: 36, removeMax: 45, multiplier: 1   },
    medio:        { removeMin: 46, removeMax: 49, multiplier: 1.5 },
    dificil:      { removeMin: 50, removeMax: 53, multiplier: 2   },
    especialista: { removeMin: 54, removeMax: 57, multiplier: 3   },
    mestre:       { removeMin: 58, removeMax: 61, multiplier: 4   },
    extremo:      { removeMin: 62, removeMax: 64, multiplier: 6   },
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
    function bt() {
      if (count >= limit) return;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] === 0) {
            for (let n = 1; n <= 9; n++) {
              if (isValid(board, r, c, n)) {
                board[r][c] = n;
                bt();
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
    bt();
    return count;
  }

  /* ── remoção de células mantendo unicidade ── */

  function removeCells(solved, targetCount) {
    const puzzle = solved.map(r => [...r]);
    let removed = 0;
    let progress = true;
    while (progress && removed < targetCount) {
      progress = false;
      const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));
      for (const pos of positions) {
        if (removed >= targetCount) break;
        const r = Math.floor(pos / 9), c = pos % 9;
        if (puzzle[r][c] === 0) continue;
        const backup = puzzle[r][c];
        puzzle[r][c] = 0;
        if (countSolutions(puzzle.map(row => [...row]), 2) === 1) {
          removed++; progress = true;
        } else {
          puzzle[r][c] = backup;
        }
      }
    }
    return puzzle;
  }

  /* ── API pública ── */

  function generate(difficulty) {
    const cfg = DIFFICULTY[difficulty] || DIFFICULTY.facil;
    const remove = cfg.removeMin + Math.floor(Math.random() * (cfg.removeMax - cfg.removeMin + 1));
    const attempts = remove >= 58 ? 3 : 1;
    let bestPuzzle = null, bestSolution = null, bestRemoved = -1;
    for (let att = 0; att < attempts; att++) {
      const solution = createEmpty();
      solveRandom(solution);
      const puzzle = removeCells(solution.map(r => [...r]), remove);
      const removed = puzzle.flat().filter(x => x === 0).length;
      if (removed > bestRemoved) {
        bestRemoved = removed; bestPuzzle = puzzle; bestSolution = solution;
      }
      if (bestRemoved >= remove) break;
    }
    return {
      puzzle:   bestPuzzle.map(r => [...r]),
      solution: bestSolution.map(r => [...r]),
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
