import { describe, it, expect } from 'vitest';
import { getHiddenPairs, getHiddenTriples, getHiddenQuads } from '../hidden-sets';

/* ── RNG determinístico ── */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Cell = [number, number];
function units(): Cell[][] {
  const u: Cell[][] = [];
  for (let i = 0; i < 9; i++) {
    u.push(Array.from({ length: 9 }, (_, j) => [i, j] as Cell));
    u.push(Array.from({ length: 9 }, (_, j) => [j, i] as Cell));
    const br = Math.floor(i / 3) * 3;
    const bc = (i % 3) * 3;
    u.push(Array.from({ length: 9 }, (_, k) => [br + Math.floor(k / 3), bc + (k % 3)] as Cell));
  }
  return u;
}
const UNITS = units();

/* ── Implementações de REFERÊNCIA (porte literal do app.js original) ── */
function refPairs(puzzle: number[][], notes: Set<number>[][], n: number) {
  const results: { cells: number[][]; pairNums: number[]; targets: number[][] }[] = [];
  for (const cells of UNITS) {
    const empty = cells.filter(([r, c]) => puzzle[r]![c] === 0);
    for (let a = 1; a <= 8; a++) {
      if (a === n) continue;
      const aCells = empty.filter(([r, c]) => notes[r]![c]!.has(a));
      if (aCells.length !== 2) continue;
      for (let b = a + 1; b <= 9; b++) {
        if (b === n) continue;
        const bCells = empty.filter(([r, c]) => notes[r]![c]!.has(b));
        if (bCells.length !== 2) continue;
        if (
          aCells[0]![0] !== bCells[0]![0] ||
          aCells[0]![1] !== bCells[0]![1] ||
          aCells[1]![0] !== bCells[1]![0] ||
          aCells[1]![1] !== bCells[1]![1]
        )
          continue;
        const targets = aCells.filter(([r, c]) => notes[r]![c]!.has(n)).map(([r, c]) => [r, c, n]);
        if (targets.length > 0) results.push({ cells: aCells, pairNums: [a, b], targets });
      }
    }
  }
  return dedupRef(results, (x) => x.pairNums);
}

function refSetK(puzzle: number[][], notes: Set<number>[][], n: number, k: number) {
  const results: { cells: number[][]; nums: number[]; targets: number[][] }[] = [];
  for (const cells of UNITS) {
    const empty = cells.filter(([r, c]) => puzzle[r]![c] === 0);
    const digitMap = new Map<number, Cell[]>();
    for (let d = 1; d <= 9; d++) {
      if (d === n) continue;
      const dc = empty.filter(([r, c]) => notes[r]![c]!.has(d));
      if (dc.length >= 2 && dc.length <= k) digitMap.set(d, dc);
    }
    const digits = [...digitMap.keys()];
    const combos = (size: number) => {
      const out: number[][] = [];
      const rec = (start: number, acc: number[]) => {
        if (acc.length === size) {
          out.push([...acc]);
          return;
        }
        for (let i = start; i < digits.length; i++) rec(i + 1, [...acc, digits[i]!]);
      };
      rec(0, []);
      return out;
    };
    for (const combo of combos(k)) {
      const cellSet = new Set<string>();
      combo.forEach((d) => digitMap.get(d)!.forEach(([r, c]) => cellSet.add(r + ',' + c)));
      if (cellSet.size !== k) continue;
      const setCells = [...cellSet].map((s) => s.split(',').map(Number));
      const targets = setCells
        .filter(([r, c]) => notes[r!]![c!]!.has(n))
        .map(([r, c]) => [r!, c!, n]);
      if (targets.length > 0) results.push({ cells: setCells, nums: combo, targets });
    }
  }
  return results;
}

function dedupRef<T extends { cells: number[][] }>(rs: T[], nums: (x: T) => number[]): T[] {
  const seen = new Set<string>();
  return rs.filter((res) => {
    const key =
      res.cells
        .map(([r, c]) => r + ',' + c)
        .sort()
        .join('|') +
      'x' +
      nums(res).slice().sort().join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const refTriples = (p: number[][], no: Set<number>[][], n: number) =>
  dedupRef(
    refSetK(p, no, n, 3).map((x) => ({ cells: x.cells, tripleNums: x.nums, targets: x.targets })),
    (x) => x.tripleNums,
  );
const refQuads = (p: number[][], no: Set<number>[][], n: number) =>
  dedupRef(
    refSetK(p, no, n, 4).map((x) => ({ cells: x.cells, quadNums: x.nums, targets: x.targets })),
    (x) => x.quadNums,
  );

/* ── Gera (puzzle, notes) aleatórios ── */
function randomBoard(rng: () => number): { puzzle: number[][]; notes: Set<number>[][] } {
  const puzzle: number[][] = [];
  const notes: Set<number>[][] = [];
  for (let r = 0; r < 9; r++) {
    puzzle[r] = [];
    notes[r] = [];
    for (let c = 0; c < 9; c++) {
      const filled = rng() < 0.25;
      puzzle[r]![c] = filled ? 1 + Math.floor(rng() * 9) : 0;
      const s = new Set<number>();
      if (!filled) {
        const count = Math.floor(rng() * 5); // 0..4 candidatos
        for (let i = 0; i < count; i++) s.add(1 + Math.floor(rng() * 9));
      }
      notes[r]![c] = s;
    }
  }
  return { puzzle, notes };
}

describe('hidden-sets: equivalência diferencial com o original', () => {
  it('pair/triple/quad produzem resultados idênticos ao original (2000 casos)', () => {
    const rng = seeded(12345);
    let cases = 0;
    for (let t = 0; t < 250; t++) {
      const { puzzle, notes } = randomBoard(rng);
      for (let n = 1; n <= 9; n++) {
        expect(getHiddenPairs(puzzle, notes, n)).toEqual(refPairs(puzzle, notes, n));
        expect(getHiddenTriples(puzzle, notes, n)).toEqual(refTriples(puzzle, notes, n));
        expect(getHiddenQuads(puzzle, notes, n)).toEqual(refQuads(puzzle, notes, n));
        cases += 3;
      }
    }
    expect(cases).toBe(250 * 9 * 3);
  });
});
