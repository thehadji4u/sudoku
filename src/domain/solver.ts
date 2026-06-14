/**
 * Solver de Sudoku por backtracking.
 *
 * - `solve`: encontra uma solução (determinística) ou null.
 * - `solveRandom`: preenche um tabuleiro testando dígitos em ordem aleatória
 *   (usado para gerar uma grade-solução completa).
 * - `countSolutions`: conta soluções até um limite (para garantir unicidade).
 */
import type { Board, CellValue } from './types';
import { cloneBoard, isBoardConsistent, isValidPlacement } from './board';

const DIGITS: CellValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Embaralha um array in-place (Fisher–Yates) e o retorna. */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Preenche `board` in-place com uma solução aleatória válida. */
export function solveRandom(board: Board, rng: () => number = Math.random): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r]![c] === 0) {
        const digits = shuffle([...DIGITS], rng);
        for (const n of digits) {
          if (isValidPlacement(board, r, c, n)) {
            board[r]![c] = n;
            if (solveRandom(board, rng)) return true;
            board[r]![c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

/** Resolve um tabuleiro parcial; retorna a solução (cópia) ou null. */
export function solve(board: Board): Board | null {
  // Um tabuleiro já inconsistente não tem solução — evita busca exaustiva
  // sobre um espaço insatisfatível.
  if (!isBoardConsistent(board)) return null;
  const copy = cloneBoard(board);
  const bt = (): boolean => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (copy[r]![c] === 0) {
          for (let n = 1; n <= 9; n++) {
            if (isValidPlacement(copy, r, c, n)) {
              copy[r]![c] = n as CellValue;
              if (bt()) return true;
              copy[r]![c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  };
  return bt() ? copy : null;
}

/**
 * Conta soluções até `limit` (não conta além disso, por performance).
 * Trabalha sobre uma cópia, sem mutar o tabuleiro recebido.
 */
export function countSolutions(board: Board, limit: number): number {
  if (!isBoardConsistent(board)) return 0;
  const work = cloneBoard(board);
  let count = 0;
  const bt = (): void => {
    if (count >= limit) return;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (work[r]![c] === 0) {
          for (let n = 1; n <= 9; n++) {
            if (isValidPlacement(work, r, c, n)) {
              work[r]![c] = n as CellValue;
              bt();
              work[r]![c] = 0;
              if (count >= limit) return;
            }
          }
          return;
        }
      }
    }
    count++;
  };
  bt();
  return count;
}

/** True se o tabuleiro tem exatamente uma solução. */
export function hasUniqueSolution(board: Board): boolean {
  return countSolutions(board, 2) === 1;
}
