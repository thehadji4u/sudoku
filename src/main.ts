/**
 * Ponto de entrada de módulos (Vite).
 *
 * Expõe `window.SudokuGeneratorAsync.generate(difficulty)` — uma geração
 * assíncrona baseada em Web Worker e graduada por técnica. O app legado
 * (`public/app.js`) consome essa API em `startGame`, com fallback para o
 * gerador síncrono legado caso o worker não esteja disponível.
 */
import GeneratorWorker from './worker/generator.worker?worker';
import type { Difficulty } from './domain/types';
import * as progression from './app/progression';

export interface AsyncGenerateResult {
  puzzle: number[][];
  solution: number[][];
  difficulty: Difficulty;
  holes?: number;
}

interface WorkerResponse extends AsyncGenerateResult {
  id: number;
  ok: boolean;
  error?: string;
}

interface Pending {
  resolve: (value: AsyncGenerateResult) => void;
  reject: (reason: Error) => void;
}

declare global {
  interface Window {
    SudokuGeneratorAsync?: {
      generate: (difficulty: Difficulty) => Promise<AsyncGenerateResult>;
    };
    // Lógica pura extraída do monólito (consumida por public/app.js).
    SudokuApp?: {
      progression: typeof progression;
    };
    // Gerador síncrono legado (public/sudoku-generator.js).
    SudokuGenerator?: {
      generate: (difficulty: string) => { puzzle: number[][]; solution: number[][] };
    };
  }
}

function createWorker(): Worker | null {
  try {
    return new GeneratorWorker();
  } catch {
    return null;
  }
}

function setup(): void {
  const worker = createWorker();
  let nextId = 1;
  const pending = new Map<number, Pending>();

  if (worker) {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id, ok, error, ...rest } = e.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (ok) {
        entry.resolve(rest);
      } else {
        entry.reject(new Error(error ?? 'falha na geração'));
      }
    };
    worker.onerror = () => {
      // Em caso de erro do worker, rejeita tudo pendente para acionar o fallback.
      for (const [, entry] of pending) entry.reject(new Error('worker error'));
      pending.clear();
    };
  }

  function generate(difficulty: Difficulty): Promise<AsyncGenerateResult> {
    if (worker) {
      return new Promise<AsyncGenerateResult>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, difficulty });
      });
    }
    // Fallback: gerador síncrono legado, adiado para não travar a UI imediatamente.
    return new Promise<AsyncGenerateResult>((resolve, reject) => {
      setTimeout(() => {
        const legacy = window.SudokuGenerator;
        if (!legacy) {
          reject(new Error('nenhum gerador disponível'));
          return;
        }
        const g = legacy.generate(difficulty);
        resolve({ puzzle: g.puzzle, solution: g.solution, difficulty });
      }, 0);
    });
  }

  window.SudokuGeneratorAsync = { generate };
  window.SudokuApp = { progression };
}

setup();
