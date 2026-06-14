/**
 * Web Worker de geração de puzzles.
 *
 * Roda a geração graduada (que é cara: backtracking + classificação por técnica)
 * fora da main thread, eliminando o congelamento da UI ao iniciar partidas
 * difíceis (ver AUDITORIA.md §2/§3).
 */
import { generateGraded } from '../domain/generator';
import type { Difficulty } from '../domain/types';

interface GenerateRequest {
  id: number;
  difficulty: Difficulty;
}

interface GenerateResponse {
  id: number;
  ok: boolean;
  puzzle?: number[][];
  solution?: number[][];
  difficulty?: Difficulty;
  holes?: number;
  error?: string;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { id, difficulty } = e.data;
  try {
    const g = generateGraded(difficulty);
    const response: GenerateResponse = {
      id,
      ok: true,
      puzzle: g.puzzle,
      solution: g.solution,
      difficulty: g.difficulty,
      holes: g.holes,
    };
    ctx.postMessage(response);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: String(err) } satisfies GenerateResponse);
  }
};
