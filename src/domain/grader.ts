/**
 * Classificação de dificuldade por técnica.
 *
 * Resolve o puzzle aplicando sempre a técnica mais simples disponível e
 * registra a técnica mais difícil que foi necessária. A dificuldade resultante
 * reflete o esforço lógico real — não apenas a contagem de pistas (ver
 * AUDITORIA.md §2).
 */
import type { Board, Difficulty } from './types';
import { cloneBoard, isComplete } from './board';
import {
  computeCandidates,
  hiddenPair,
  hiddenSingle,
  hiddenTriple,
  lockedCandidates,
  nakedPair,
  nakedSingle,
  nakedTriple,
  xWing,
  type SolveState,
} from './techniques';

export type TechniqueName =
  | 'nakedSingle'
  | 'hiddenSingle'
  | 'lockedCandidates'
  | 'nakedPair'
  | 'hiddenPair'
  | 'nakedTriple'
  | 'hiddenTriple'
  | 'xWing';

interface TechniqueEntry {
  name: TechniqueName;
  rank: number;
  apply: (state: SolveState) => boolean;
}

// Ordem de tentativa (do mais simples ao mais difícil). O `rank` define o peso
// usado na classificação por dificuldade.
const TECHNIQUES: readonly TechniqueEntry[] = [
  { name: 'nakedSingle', rank: 1, apply: nakedSingle },
  { name: 'hiddenSingle', rank: 2, apply: hiddenSingle },
  { name: 'lockedCandidates', rank: 3, apply: lockedCandidates },
  { name: 'nakedPair', rank: 4, apply: nakedPair },
  { name: 'hiddenPair', rank: 4, apply: hiddenPair },
  { name: 'nakedTriple', rank: 5, apply: nakedTriple },
  { name: 'hiddenTriple', rank: 5, apply: hiddenTriple },
  { name: 'xWing', rank: 6, apply: xWing },
];

export interface GradeResult {
  /** True se foi resolvido apenas com as técnicas implementadas. */
  solved: boolean;
  /** Maior rank de técnica necessário (0 se já estava resolvido). */
  hardestRank: number;
  /** Dificuldade classificada. */
  difficulty: Difficulty;
  /** Técnicas efetivamente usadas. */
  used: Set<TechniqueName>;
  /** Tabuleiro após a resolução lógica (pode estar incompleto se não resolvido). */
  solvedBoard: Board;
}

/** Mapeia o rank da técnica mais difícil → nível de dificuldade. */
function rankToDifficulty(solved: boolean, rank: number): Difficulty {
  if (!solved) return 'extremo'; // exige busca/técnicas além das implementadas
  if (rank <= 2) return 'facil'; // apenas singles
  if (rank === 3) return 'medio'; // locked candidates
  if (rank === 4) return 'dificil'; // pares
  if (rank === 5) return 'especialista'; // trios
  return 'mestre'; // X-Wing e além
}

/**
 * Resolve logicamente (sem adivinhação) e classifica a dificuldade.
 * Não muta o tabuleiro recebido.
 */
export function grade(board: Board): GradeResult {
  const state: SolveState = {
    board: cloneBoard(board),
    cands: computeCandidates(board),
  };
  const used = new Set<TechniqueName>();
  let hardestRank = 0;

  for (;;) {
    let advanced = false;
    for (const technique of TECHNIQUES) {
      if (technique.apply(state)) {
        used.add(technique.name);
        hardestRank = Math.max(hardestRank, technique.rank);
        advanced = true;
        break; // reinicia da técnica mais simples
      }
    }
    if (!advanced) break;
  }

  const solved = isComplete(state.board);
  return {
    solved,
    hardestRank,
    difficulty: rankToDifficulty(solved, hardestRank),
    used,
    solvedBoard: state.board,
  };
}

/**
 * True se o puzzle é totalmente resolvível usando apenas técnicas de rank
 * menor ou igual a `maxRank` (sem adivinhação). Usado para limitar a
 * dificuldade de um puzzle durante a geração.
 */
export function solveWithinRank(board: Board, maxRank: number): boolean {
  const state: SolveState = {
    board: cloneBoard(board),
    cands: computeCandidates(board),
  };
  for (;;) {
    let advanced = false;
    for (const technique of TECHNIQUES) {
      if (technique.rank > maxRank) break; // TECHNIQUES está em ordem crescente de rank
      if (technique.apply(state)) {
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }
  return isComplete(state.board);
}
