/**
 * Gerador de puzzles de Sudoku com garantia de solução única.
 *
 * Estratégia (preservada da implementação original, agora tipada e testável):
 *  1. Gera uma grade-solução completa (`solveRandom`).
 *  2. Remove células enquanto a unicidade da solução for mantida.
 *
 * NOTA CONHECIDA (ver AUDITORIA.md §2): a dificuldade aqui é definida apenas
 * pela quantidade de células removidas, e os alvos altos (mestre/extremo) não
 * são atingíveis mantendo unicidade — ambos convergem para ~57 lacunas. A
 * graduação por técnica lógica é o próximo passo planejado.
 */
import type { Board, Difficulty, DifficultyConfig, GeneratedPuzzle } from './types';
import { cloneBoard, createEmptyBoard } from './board';
import { countSolutions, shuffle, solveRandom } from './solver';

export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  facil: { removeMin: 36, removeMax: 45, multiplier: 1 },
  medio: { removeMin: 46, removeMax: 49, multiplier: 1.5 },
  dificil: { removeMin: 50, removeMax: 53, multiplier: 2 },
  especialista: { removeMin: 54, removeMax: 57, multiplier: 3 },
  mestre: { removeMin: 58, removeMax: 61, multiplier: 4 },
  extremo: { removeMin: 62, removeMax: 64, multiplier: 6 },
};

/**
 * Remove células de uma solução mantendo a unicidade, tentando alcançar
 * `targetCount` remoções. Retorna o puzzle resultante (pode remover menos
 * que o alvo se não for possível manter unicidade).
 */
function removeCells(solved: Board, targetCount: number, rng = Math.random): Board {
  const puzzle = cloneBoard(solved);
  let removed = 0;
  let progress = true;
  while (progress && removed < targetCount) {
    progress = false;
    const positions = shuffle(
      Array.from({ length: 81 }, (_, i) => i),
      rng,
    );
    for (const pos of positions) {
      if (removed >= targetCount) break;
      const r = Math.floor(pos / 9);
      const c = pos % 9;
      if (puzzle[r]![c] === 0) continue;
      const backup = puzzle[r]![c]!;
      puzzle[r]![c] = 0;
      if (countSolutions(puzzle, 2) === 1) {
        removed++;
        progress = true;
      } else {
        puzzle[r]![c] = backup;
      }
    }
  }
  return puzzle;
}

function countHoles(board: Board): number {
  return board.reduce((acc, row) => acc + row.filter((v) => v === 0).length, 0);
}

/** Gera um puzzle do nível indicado, com solução única garantida. */
export function generate(difficulty: Difficulty, rng = Math.random): GeneratedPuzzle {
  const cfg = DIFFICULTY[difficulty] ?? DIFFICULTY.facil;
  const remove = cfg.removeMin + Math.floor(rng() * (cfg.removeMax - cfg.removeMin + 1));
  const attempts = remove >= 58 ? 3 : 1;

  let bestPuzzle: Board | null = null;
  let bestSolution: Board | null = null;
  let bestRemoved = -1;

  for (let att = 0; att < attempts; att++) {
    const solution = createEmptyBoard();
    solveRandom(solution, rng);
    const puzzle = removeCells(solution, remove, rng);
    const removed = countHoles(puzzle);
    if (removed > bestRemoved) {
      bestRemoved = removed;
      bestPuzzle = puzzle;
      bestSolution = solution;
    }
    if (bestRemoved >= remove) break;
  }

  return {
    puzzle: cloneBoard(bestPuzzle!),
    solution: cloneBoard(bestSolution!),
  };
}

/** Multiplicador de pontuação do nível. */
export function getMultiplier(difficulty: Difficulty): number {
  return (DIFFICULTY[difficulty] ?? DIFFICULTY.facil).multiplier;
}

/** Lista de níveis disponíveis (ordem crescente de dificuldade). */
export function getDifficultyList(): Difficulty[] {
  return Object.keys(DIFFICULTY) as Difficulty[];
}
