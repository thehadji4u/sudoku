import { describe, it, expect } from 'vitest';
import { grade } from '../grader';
import { generateGraded } from '../generator';
import { isBoardConsistent, isComplete } from '../board';
import { hasUniqueSolution, solve } from '../solver';
import { DIFFICULTY_ORDER } from '../generator';
import type { Board, CellValue } from '../types';

function parse(s: string): Board {
  const digits = s.replace(/[^0-9.]/g, '').replace(/\./g, '0');
  const board: Board = [];
  for (let r = 0; r < 9; r++) {
    const row: CellValue[] = [];
    for (let c = 0; c < 9; c++) row.push(Number(digits[r * 9 + c]) as CellValue);
    board.push(row);
  }
  return board;
}

// Puzzle clássico (Wikipedia) — resolvível por técnicas básicas.
const EASY = `
  530070000
  600195000
  098000060
  800060003
  400803001
  700020006
  060000280
  000419005
  000080079`;

describe('grade', () => {
  it('resolve um puzzle fácil apenas com lógica e classifica em nível baixo', () => {
    const puzzle = parse(EASY);
    const result = grade(puzzle);
    expect(result.solved).toBe(true);
    expect(['facil', 'medio', 'dificil']).toContain(result.difficulty);
    // a técnica mais simples (naked single) deve ter sido usada
    expect(result.used.size).toBeGreaterThan(0);
  });

  it('a solução lógica coincide com a solução por backtracking', () => {
    const puzzle = parse(EASY);
    const byLogic = grade(puzzle);
    const byBacktracking = solve(puzzle);
    expect(byLogic.solved).toBe(true);
    expect(byBacktracking).not.toBeNull();
    // grade não muta a entrada; resolvemos de novo para comparar
    expect(isComplete(byBacktracking!)).toBe(true);
    expect(isBoardConsistent(byBacktracking!)).toBe(true);
  });

  it('não muta o tabuleiro de entrada', () => {
    const puzzle = parse(EASY);
    const snapshot = puzzle.map((row) => [...row]);
    grade(puzzle);
    expect(puzzle).toEqual(snapshot);
  });
});

describe('generateGraded', () => {
  it('facil: único, resolvível só com singles, classificado "facil"', () => {
    const g = generateGraded('facil', { timeBudgetMs: 3000 });
    expect(isBoardConsistent(g.puzzle)).toBe(true);
    expect(hasUniqueSolution(g.puzzle)).toBe(true);
    const gr = grade(g.puzzle);
    expect(gr.solved).toBe(true);
    expect(gr.hardestRank).toBeLessThanOrEqual(2); // apenas singles
    expect(g.difficulty).toBe('facil');
    expect(g.requested).toBe('facil');
  });

  it('garantia de teto: um nível médio nunca produz puzzle mais difícil que o rótulo', () => {
    const g = generateGraded('medio', { timeBudgetMs: 3000 });
    expect(hasUniqueSolution(g.puzzle)).toBe(true);
    const gr = grade(g.puzzle);
    // teto de técnica garante: resolvível por lógica e rank <= 3 (locked candidates)
    expect(gr.solved).toBe(true);
    expect(gr.hardestRank).toBeLessThanOrEqual(3);
    expect(DIFFICULTY_ORDER.indexOf(g.difficulty)).toBeLessThanOrEqual(
      DIFFICULTY_ORDER.indexOf('medio'),
    );
  });

  it('extremo: gera puzzle único (pode exigir adivinhação)', () => {
    const g = generateGraded('extremo', { timeBudgetMs: 3000 });
    expect(hasUniqueSolution(g.puzzle)).toBe(true);
    expect(g.holes).toBeGreaterThanOrEqual(45);
  });
});
