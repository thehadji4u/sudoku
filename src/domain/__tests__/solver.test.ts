import { describe, it, expect } from 'vitest';
import { solve, solveRandom, countSolutions, hasUniqueSolution } from '../solver';
import { createEmptyBoard, isBoardConsistent, isComplete } from '../board';
import type { Board } from '../types';

/** RNG determinístico (mulberry32) para testes reprodutíveis. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('solveRandom', () => {
  it('preenche um tabuleiro vazio com solução válida e completa', () => {
    const b = createEmptyBoard();
    expect(solveRandom(b, seeded(1))).toBe(true);
    expect(isComplete(b)).toBe(true);
    expect(isBoardConsistent(b)).toBe(true);
  });
});

describe('solve', () => {
  it('resolve um puzzle parcial sem mutar a entrada', () => {
    const full = createEmptyBoard();
    solveRandom(full, seeded(2));
    const puzzle: Board = full.map((row) => [...row]);
    puzzle[0]![0] = 0;
    puzzle[4]![4] = 0;
    const snapshot = puzzle.map((row) => [...row]);

    const result = solve(puzzle);
    expect(result).not.toBeNull();
    expect(isComplete(result!)).toBe(true);
    expect(isBoardConsistent(result!)).toBe(true);
    expect(puzzle).toEqual(snapshot); // entrada não mutada
  });

  it('retorna null para tabuleiro impossível', () => {
    const b = createEmptyBoard();
    b[0]![0] = 1;
    b[0]![1] = 1; // conflito imediato → sem solução
    expect(solve(b)).toBeNull();
  });
});

describe('countSolutions / hasUniqueSolution', () => {
  it('tabuleiro vazio tem múltiplas soluções (parado no limite)', () => {
    expect(countSolutions(createEmptyBoard(), 2)).toBe(2);
  });
  it('solução completa tem exatamente uma solução', () => {
    const full = createEmptyBoard();
    solveRandom(full, seeded(3));
    expect(hasUniqueSolution(full)).toBe(true);
  });
});
