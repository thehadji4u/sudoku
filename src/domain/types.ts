/**
 * Tipos do domínio de Sudoku.
 *
 * Um tabuleiro é uma matriz 9x9 de células. Uma célula vazia é representada
 * por 0; uma célula preenchida por um dígito de 1 a 9.
 */

/** Dígito válido de uma célula preenchida (1–9). */
export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Valor de uma célula: 0 (vazia) ou um dígito 1–9. */
export type CellValue = 0 | Digit;

/** Tabuleiro 9x9. */
export type Board = CellValue[][];

/** Níveis de dificuldade suportados (chaves estáveis usadas na persistência). */
export type Difficulty = 'facil' | 'medio' | 'dificil' | 'especialista' | 'mestre' | 'extremo';

/** Configuração de geração por nível. */
export interface DifficultyConfig {
  /** Mínimo de células removidas (alvo). */
  readonly removeMin: number;
  /** Máximo de células removidas (alvo). */
  readonly removeMax: number;
  /** Multiplicador de pontuação do nível. */
  readonly multiplier: number;
}

/** Resultado da geração de um puzzle. */
export interface GeneratedPuzzle {
  /** Tabuleiro com lacunas (0 = vazio). */
  readonly puzzle: Board;
  /** Solução completa correspondente. */
  readonly solution: Board;
}
