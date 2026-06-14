import { describe, it, expect } from 'vitest';
import { computeRankingUpdate, type RankingEntry } from '../ranking';

function entry(p: Partial<RankingEntry>): RankingEntry {
  return {
    difficulty: 'facil',
    score: 0,
    timeSeconds: 0,
    errors: 0,
    date: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}

describe('computeRankingUpdate', () => {
  it('insere a primeira entrada na posição 1', () => {
    const r = computeRankingUpdate([], entry({ score: 100 }), 20);
    expect(r.merged).toHaveLength(1);
    expect(r.position).toBe(1);
  });

  it('ordena por score desc e calcula a posição correta', () => {
    const existing = [entry({ score: 300 }), entry({ score: 100 })];
    const r = computeRankingUpdate(existing, entry({ score: 200 }), 20);
    expect(r.merged.map((e) => e.score)).toEqual([300, 200, 100]);
    expect(r.position).toBe(2);
  });

  it('mantém apenas o top-N por dificuldade', () => {
    const existing = Array.from({ length: 20 }, (_, i) => entry({ score: 1000 + i }));
    const r = computeRankingUpdate(existing, entry({ score: 1 }), 20);
    const facil = r.merged.filter((e) => e.difficulty === 'facil');
    expect(facil).toHaveLength(20);
    // a entrada fraca (score 1) não entra no top-20
    expect(facil.some((e) => e.score === 1)).toBe(false);
    expect(r.position).toBeNull();
  });

  it('mantém rankings de níveis diferentes separados', () => {
    const existing = [entry({ difficulty: 'mestre', score: 999 })];
    const r = computeRankingUpdate(existing, entry({ difficulty: 'facil', score: 50 }), 20);
    expect(r.merged).toHaveLength(2);
    expect(r.merged.filter((e) => e.difficulty === 'mestre')).toHaveLength(1);
    expect(r.merged.filter((e) => e.difficulty === 'facil')).toHaveLength(1);
    expect(r.position).toBe(1); // posição dentro do nível facil
  });
});
