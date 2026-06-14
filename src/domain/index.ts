/**
 * Camada de domínio do Sudoku — lógica pura, sem DOM.
 * Ponto de entrada público dos módulos do domínio.
 */
export type {
  Board,
  CellValue,
  Digit,
  Difficulty,
  DifficultyConfig,
  GeneratedPuzzle,
} from './types';

export {
  createEmptyBoard,
  cloneBoard,
  isValidPlacement,
  isBoardConsistent,
  isComplete,
} from './board';

export { shuffle, solveRandom, solve, countSolutions, hasUniqueSolution } from './solver';

export { DIFFICULTY, generate, getMultiplier, getDifficultyList } from './generator';
