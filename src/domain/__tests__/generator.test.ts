import { describe, it, expect } from 'vitest';
import { generate, getMultiplier, getDifficultyList, DIFFICULTY } from '../generator';
import { hasUniqueSolution } from '../solver';
import { isBoardConsistent, isComplete } from '../board';
import type { Difficulty } from '../types';

function holes(board: number[][]): number {
  return board.reduce((acc, row) => acc + row.filter((v) => v === 0).length, 0);
}

describe('metadados de dificuldade', () => {
  it('lista os 6 níveis em ordem crescente de multiplicador', () => {
    const list = getDifficultyList();
    expect(list).toEqual(['facil', 'medio', 'dificil', 'especialista', 'mestre', 'extremo']);
    const mults = list.map(getMultiplier);
    for (let i = 1; i < mults.length; i++) {
      expect(mults[i]!).toBeGreaterThanOrEqual(mults[i - 1]!);
    }
  });
});

// Apenas níveis rápidos no teste padrão (mestre/extremo levam segundos —
// ver AUDITORIA.md §2). Cobrem o invariante essencial: validade + unicidade.
const FAST_LEVELS: Difficulty[] = ['facil', 'medio', 'dificil'];

describe('generate (níveis rápidos)', () => {
  for (const level of FAST_LEVELS) {
    it(`${level}: gera puzzle válido, resolvível e de solução única`, () => {
      const { puzzle, solution } = generate(level);

      // Solução é uma grade completa e consistente.
      expect(isComplete(solution)).toBe(true);
      expect(isBoardConsistent(solution)).toBe(true);

      // Puzzle é consistente (sem conflitos) e tem solução única.
      expect(isBoardConsistent(puzzle)).toBe(true);
      expect(hasUniqueSolution(puzzle)).toBe(true);

      // Lacunas dentro de uma faixa plausível (não excede o teto real ~58).
      const cfg = DIFFICULTY[level];
      expect(holes(puzzle)).toBeGreaterThanOrEqual(cfg.removeMin - 4);
      expect(holes(puzzle)).toBeLessThanOrEqual(60);

      // O puzzle é um subconjunto da solução nas células reveladas.
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (puzzle[r]![c] !== 0) {
            expect(puzzle[r]![c]).toBe(solution[r]![c]);
          }
        }
      }
    });
  }
});
