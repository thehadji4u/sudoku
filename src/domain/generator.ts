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
import { grade, solveWithinRank } from './grader';

/**
 * Teto de técnica (rank) permitido por nível. Durante a geração, só removemos
 * uma célula se o puzzle continuar resolvível dentro deste teto — o que produz
 * puzzles cuja dificuldade real corresponde ao nível. `extremo` não tem teto
 * lógico (pode exigir busca/adivinhação).
 */
const RANK_CEILING: Record<Difficulty, number> = {
  facil: 2, // apenas singles
  medio: 3, // + locked candidates
  dificil: 4, // + pares
  especialista: 5, // + trios
  mestre: 6, // + X-Wing
  extremo: Number.POSITIVE_INFINITY,
};

/** Ordem crescente de dificuldade (para comparar proximidade na graduação). */
export const DIFFICULTY_ORDER: readonly Difficulty[] = [
  'facil',
  'medio',
  'dificil',
  'especialista',
  'mestre',
  'extremo',
];

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

export interface GradedPuzzle extends GeneratedPuzzle {
  /** Dificuldade solicitada. */
  requested: Difficulty;
  /** Dificuldade real classificada por técnica (pode diferir da solicitada). */
  difficulty: Difficulty;
  /** Número de lacunas do puzzle. */
  holes: number;
}

export interface GradedOptions {
  /** Orçamento de tempo total (ms). Padrão 3000. */
  timeBudgetMs?: number;
  rng?: () => number;
}

/**
 * Cava buracos numa solução mantendo (a) solução única e (b) resolubilidade
 * dentro do teto de técnica `maxRank`. Faz passes aleatórios até nenhum buraco
 * novo poder ser cavado ou o orçamento de tempo esgotar.
 */
function digWithCeiling(
  solution: Board,
  maxRank: number,
  rng: () => number,
  budgetMs: number,
): Board {
  const puzzle = cloneBoard(solution);
  const start = Date.now();
  let removedThisPass = true;
  while (removedThisPass) {
    removedThisPass = false;
    const positions = shuffle(
      Array.from({ length: 81 }, (_, i) => i),
      rng,
    );
    for (const pos of positions) {
      if (Date.now() - start > budgetMs) return puzzle;
      const r = Math.floor(pos / 9);
      const c = pos % 9;
      if (puzzle[r]![c] === 0) continue;
      const backup = puzzle[r]![c]!;
      puzzle[r]![c] = 0;
      const stillUnique = countSolutions(puzzle, 2) === 1;
      const withinCeiling =
        maxRank === Number.POSITIVE_INFINITY || solveWithinRank(puzzle, maxRank);
      if (stillUnique && withinCeiling) {
        removedThisPass = true;
      } else {
        puzzle[r]![c] = backup;
      }
    }
  }
  return puzzle;
}

/**
 * Gera um puzzle cuja dificuldade **real** (por técnica) corresponde à
 * solicitada. Diferentemente de `generate`, não confia apenas na contagem de
 * lacunas: cava buracos respeitando o teto de técnica do nível, de modo que o
 * puzzle exija (aproximadamente) a técnica característica do nível e nada mais
 * difícil. A dificuldade real é confirmada pelo `grader`.
 */
export function generateGraded(difficulty: Difficulty, opts: GradedOptions = {}): GradedPuzzle {
  const { timeBudgetMs = 3000, rng = Math.random } = opts;
  const maxRank = RANK_CEILING[difficulty] ?? RANK_CEILING.facil;
  const target = DIFFICULTY_ORDER.indexOf(difficulty);
  const start = Date.now();
  // O teto de técnica garante que o puzzle nunca fique MAIS difícil que o nível.
  // Como a dificuldade do Sudoku é descontínua, fazemos múltiplas tentativas e
  // ficamos com a que melhor aproxima o nível pedido.
  const perAttemptMs = Math.max(600, Math.floor(timeBudgetMs / 3));

  let best: GradedPuzzle | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  do {
    const solution = createEmptyBoard();
    solveRandom(solution, rng);
    const puzzle = digWithCeiling(solution, maxRank, rng, perAttemptMs);
    const g = grade(puzzle);
    const dist = Math.abs(DIFFICULTY_ORDER.indexOf(g.difficulty) - target);

    if (dist < bestDist) {
      bestDist = dist;
      best = {
        puzzle: cloneBoard(puzzle),
        solution: cloneBoard(solution),
        requested: difficulty,
        difficulty: g.difficulty,
        holes: countHoles(puzzle),
      };
    }
    if (dist === 0) break;
  } while (Date.now() - start < timeBudgetMs);

  return best!;
}

/** Multiplicador de pontuação do nível. */
export function getMultiplier(difficulty: Difficulty): number {
  return (DIFFICULTY[difficulty] ?? DIFFICULTY.facil).multiplier;
}

/** Lista de níveis disponíveis (ordem crescente de dificuldade). */
export function getDifficultyList(): Difficulty[] {
  return Object.keys(DIFFICULTY) as Difficulty[];
}
