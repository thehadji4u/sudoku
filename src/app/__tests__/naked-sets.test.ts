import { describe, it, expect } from 'vitest';
import { getNakedPairs, getNakedTriples, getNakedQuads } from '../naked-sets';

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

/* ── Referências: porte literal do app.js original ── */
function refPairs(puzzle: number[][], notes: Set<number>[][], n: number) {
  const results: { pair: number[][]; targets: number[][] }[] = [];
  for (const cells of UNITS) {
    const bi = cells.filter(([r, c]) => puzzle[r]![c] === 0 && notes[r]![c]!.size === 2);
    for (let i = 0; i < bi.length; i++) {
      for (let j = i + 1; j < bi.length; j++) {
        const [r1, c1] = bi[i]!;
        const [r2, c2] = bi[j]!;
        const ns1 = notes[r1]![c1]!;
        const ns2 = notes[r2]![c2]!;
        if (ns1.size === 2 && [...ns1].every((x) => ns2.has(x)) && ns1.has(n)) {
          const targets = cells.filter(
            ([r, c]) =>
              (r !== r1 || c !== c1) &&
              (r !== r2 || c !== c2) &&
              puzzle[r]![c] === 0 &&
              notes[r]![c]!.has(n),
          );
          if (targets.length)
            results.push({
              pair: [
                [r1, c1],
                [r2, c2],
              ],
              targets,
            });
        }
      }
    }
  }
  return dedup(results, (x) => x.pair);
}

function refSetK(puzzle: number[][], notes: Set<number>[][], n: number, k: number) {
  const results: { sourceCells: number[][]; nums: number[]; targets: number[][] }[] = [];
  for (const cells of UNITS) {
    const bi = cells.filter(
      ([r, c]) => puzzle[r]![c] === 0 && notes[r]![c]!.size >= 2 && notes[r]![c]!.size <= k,
    );
    const combos: Cell[][] = [];
    const rec = (start: number, acc: Cell[]) => {
      if (acc.length === k) {
        combos.push([...acc]);
        return;
      }
      for (let i = start; i < bi.length; i++) rec(i + 1, [...acc, bi[i]!]);
    };
    rec(0, []);
    for (const combo of combos) {
      const union = new Set<number>(combo.flatMap(([r, c]) => [...notes[r]![c]!]));
      if (union.size !== k || !union.has(n)) continue;
      const targets = cells.filter(
        ([r, c]) =>
          !combo.some(([sr, sc]) => sr === r && sc === c) &&
          puzzle[r]![c] === 0 &&
          notes[r]![c]!.has(n),
      );
      if (targets.length) results.push({ sourceCells: combo, nums: [...union], targets });
    }
  }
  return results;
}

function dedup<T extends { targets: number[][] }>(rs: T[], group: (x: T) => number[][]): T[] {
  const seen = new Set<string>();
  return rs.filter((res) => {
    const key =
      group(res)
        .map(([r, c]) => r + ',' + c)
        .sort()
        .join('|') +
      '>' +
      res.targets
        .map(([r, c]) => r + ',' + c)
        .sort()
        .join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const refTriples = (p: number[][], no: Set<number>[][], n: number) =>
  dedup(refSetK(p, no, n, 3), (x) => x.sourceCells);
const refQuads = (p: number[][], no: Set<number>[][], n: number) =>
  dedup(refSetK(p, no, n, 4), (x) => x.sourceCells);

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
        const count = Math.floor(rng() * 5);
        for (let i = 0; i < count; i++) s.add(1 + Math.floor(rng() * 9));
      }
      notes[r]![c] = s;
    }
  }
  return { puzzle, notes };
}

describe('naked-sets: equivalência diferencial com o original', () => {
  it('pair/triple/quad produzem resultados idênticos ao original', () => {
    const rng = seeded(98765);
    for (let t = 0; t < 250; t++) {
      const { puzzle, notes } = randomBoard(rng);
      for (let n = 1; n <= 9; n++) {
        expect(getNakedPairs(puzzle, notes, n)).toEqual(refPairs(puzzle, notes, n));
        expect(getNakedTriples(puzzle, notes, n)).toEqual(refTriples(puzzle, notes, n));
        expect(getNakedQuads(puzzle, notes, n)).toEqual(refQuads(puzzle, notes, n));
      }
    }
  });
});
