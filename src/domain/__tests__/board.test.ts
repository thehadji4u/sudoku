import { describe, it, expect } from 'vitest';
import {
  createEmptyBoard,
  cloneBoard,
  isValidPlacement,
  isBoardConsistent,
  isComplete,
} from '../board';
import type { Board } from '../types';

describe('createEmptyBoard', () => {
  it('cria uma matriz 9x9 zerada', () => {
    const b = createEmptyBoard();
    expect(b).toHaveLength(9);
    expect(b.every((row) => row.length === 9)).toBe(true);
    expect(b.flat().every((v) => v === 0)).toBe(true);
  });
});

describe('cloneBoard', () => {
  it('produz cópia independente', () => {
    const b = createEmptyBoard();
    const c = cloneBoard(b);
    c[0]![0] = 5;
    expect(b[0]![0]).toBe(0);
  });
});

describe('isValidPlacement', () => {
  const b = createEmptyBoard();
  b[0]![0] = 5;

  it('rejeita repetição na linha', () => {
    expect(isValidPlacement(b, 0, 8, 5)).toBe(false);
  });
  it('rejeita repetição na coluna', () => {
    expect(isValidPlacement(b, 8, 0, 5)).toBe(false);
  });
  it('rejeita repetição no bloco', () => {
    expect(isValidPlacement(b, 1, 1, 5)).toBe(false);
  });
  it('aceita jogada sem conflito', () => {
    expect(isValidPlacement(b, 8, 8, 5)).toBe(true);
  });
});

describe('isBoardConsistent', () => {
  it('aceita tabuleiro vazio', () => {
    expect(isBoardConsistent(createEmptyBoard())).toBe(true);
  });
  it('detecta conflito de linha', () => {
    const b = createEmptyBoard();
    b[0]![0] = 3;
    b[0]![5] = 3;
    expect(isBoardConsistent(b)).toBe(false);
  });
  it('detecta conflito de bloco', () => {
    const b = createEmptyBoard();
    b[0]![0] = 7;
    b[2]![2] = 7;
    expect(isBoardConsistent(b)).toBe(false);
  });
});

describe('isComplete', () => {
  it('false quando há lacunas', () => {
    expect(isComplete(createEmptyBoard())).toBe(false);
  });
  it('true quando totalmente preenchido', () => {
    const full: Board = Array.from({ length: 9 }, () => new Array(9).fill(1));
    expect(isComplete(full)).toBe(true);
  });
});
