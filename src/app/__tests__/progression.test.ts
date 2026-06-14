import { describe, it, expect } from 'vitest';
import { isUnlocked, nextUnlock } from '../progression';

const ORDER = ['facil', 'medio', 'dificil', 'especialista', 'mestre', 'extremo'];
const REQUIRED = {
  facil: 0,
  medio: 3,
  dificil: 5,
  especialista: 7,
  mestre: 10,
  extremo: 15,
};

describe('isUnlocked', () => {
  it('o primeiro nível está sempre desbloqueado', () => {
    expect(isUnlocked(ORDER, REQUIRED, {}, 'facil', false)).toBe(true);
  });

  it('um nível bloqueia até atingir o requisito do anterior', () => {
    expect(isUnlocked(ORDER, REQUIRED, { facil: 2 }, 'medio', false)).toBe(false);
    expect(isUnlocked(ORDER, REQUIRED, { facil: 3 }, 'medio', false)).toBe(true);
    expect(isUnlocked(ORDER, REQUIRED, { facil: 99 }, 'medio', false)).toBe(true);
  });

  it('allUnlocked libera tudo', () => {
    expect(isUnlocked(ORDER, REQUIRED, {}, 'extremo', true)).toBe(true);
  });

  it('níveis avançados respeitam o nível imediatamente anterior', () => {
    expect(isUnlocked(ORDER, REQUIRED, { dificil: 6 }, 'especialista', false)).toBe(false);
    expect(isUnlocked(ORDER, REQUIRED, { dificil: 7 }, 'especialista', false)).toBe(true);
  });
});

describe('nextUnlock', () => {
  it('aponta o primeiro nível bloqueado e quantas partidas faltam', () => {
    expect(nextUnlock(ORDER, REQUIRED, { facil: 1 }, false)).toEqual({
      diff: 'medio',
      prevDiff: 'facil',
      remaining: 2,
    });
  });

  it('avança conforme níveis são desbloqueados', () => {
    const completions = { facil: 5, medio: 3 };
    expect(nextUnlock(ORDER, REQUIRED, completions, false)).toEqual({
      diff: 'dificil',
      prevDiff: 'medio',
      remaining: 2,
    });
  });

  it('retorna null quando tudo está desbloqueado', () => {
    expect(nextUnlock(ORDER, REQUIRED, {}, true)).toBeNull();
    const all = { facil: 99, medio: 99, dificil: 99, especialista: 99, mestre: 99 };
    expect(nextUnlock(ORDER, REQUIRED, all, false)).toBeNull();
  });

  it('remaining nunca é negativo', () => {
    const r = nextUnlock(ORDER, REQUIRED, { facil: 100 }, false);
    // facil=100 desbloqueia medio; próximo bloqueado é dificil (medio=0)
    expect(r?.diff).toBe('dificil');
    expect(r?.remaining).toBeGreaterThanOrEqual(0);
  });
});
