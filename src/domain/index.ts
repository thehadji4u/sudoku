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

export {
  DIFFICULTY,
  DIFFICULTY_ORDER,
  generate,
  generateGraded,
  getMultiplier,
  getDifficultyList,
} from './generator';
export type { GradedPuzzle, GradedOptions } from './generator';

export { grade } from './grader';
export type { GradeResult, TechniqueName } from './grader';
