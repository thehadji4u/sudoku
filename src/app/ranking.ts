/**
 * Cálculo do ranking (lógica pura, sem DOM nem localStorage).
 *
 * Slice 2 da decomposição do monólito. Mantém exatamente a semântica original
 * de `saveToRanking` em `public/app.js`: mantém o top-N por dificuldade e
 * devolve a posição da nova entrada dentro do seu nível.
 */

export interface RankingEntry {
  difficulty: string;
  score: number;
  timeSeconds: number;
  errors: number;
  date: string;
}

export interface RankingUpdate {
  /** Ranking resultante (a ser persistido). */
  merged: RankingEntry[];
  /** Posição (1-based) da nova entrada no seu nível, ou null se não rankeou. */
  position: number | null;
}

/**
 * Insere `entry` no ranking, mantendo no máximo `topNPerDifficulty` entradas
 * por nível (ordenadas por score desc), e calcula a posição da nova entrada.
 */
export function computeRankingUpdate(
  existing: readonly RankingEntry[],
  entry: RankingEntry,
  topNPerDifficulty: number,
): RankingUpdate {
  const ranking = [...existing, entry];

  const filtered = ranking
    .filter((e) => e.difficulty === entry.difficulty)
    .sort((a, b) => b.score - a.score)
    .slice(0, topNPerDifficulty);
  const others = ranking.filter((e) => e.difficulty !== entry.difficulty);
  const merged = [...others, ...filtered].sort((a, b) => b.score - a.score);

  const pos =
    filtered.findIndex(
      (e) => e === entry || (e.score === entry.score && e.timeSeconds === entry.timeSeconds),
    ) + 1;

  return { merged, position: pos || null };
}
