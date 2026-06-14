/**
 * Detecção de conjuntos nus (naked pair/triple/quad) para o sistema de poderes
 * — lógica PURA extraída de `public/app.js`.
 *
 * Porte fiel (ordem + deduplicação idênticas às originais). O par usa formulação
 * própria; triplo e quádruplo compartilham um núcleo parametrizado por `k`.
 * Verificado por testes diferenciais contra as implementações originais.
 */

export type Cell = [number, number];
export type Notes = ReadonlyArray<ReadonlyArray<ReadonlySet<number>>>;
export type Grid = ReadonlyArray<ReadonlyArray<number>>;

export interface NakedPairResult {
  pair: number[][];
  targets: number[][];
}
export interface NakedSetResult {
  sourceCells: number[][];
  nums: number[];
  targets: number[][];
}

/** Itera as 27 unidades: linha i, coluna i, bloco i (ordem original). */
function forEachUnit(fn: (cells: Cell[]) => void): void {
  for (let i = 0; i < 9; i++) {
    fn(Array.from({ length: 9 }, (_, j) => [i, j] as Cell));
    fn(Array.from({ length: 9 }, (_, j) => [j, i] as Cell));
    const br = Math.floor(i / 3) * 3;
    const bc = (i % 3) * 3;
    fn(Array.from({ length: 9 }, (_, k) => [br + Math.floor(k / 3), bc + (k % 3)] as Cell));
  }
}

/** Naked pair: duas células de uma unidade com exatamente os mesmos 2 candidatos. */
export function getNakedPairs(puzzle: Grid, notes: Notes, n: number): NakedPairResult[] {
  if (!puzzle || !notes) return [];
  const results: NakedPairResult[] = [];
  forEachUnit((cells) => {
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
              targets: targets.map(([r, c]) => [r, c]),
            });
        }
      }
    }
  });
  return dedup(results, (x) => x.pair);
}

/** Núcleo de triplo/quádruplo nu (k = 3 ou 4). */
function getNakedSetK(puzzle: Grid, notes: Notes, n: number, k: number): NakedSetResult[] {
  if (!puzzle || !notes) return [];
  const results: NakedSetResult[] = [];
  forEachUnit((cells) => {
    const bi = cells.filter(
      ([r, c]) => puzzle[r]![c] === 0 && notes[r]![c]!.size >= 2 && notes[r]![c]!.size <= k,
    );
    combinations(bi, k).forEach((combo) => {
      const union = new Set<number>(combo.flatMap(([r, c]) => [...notes[r]![c]!]));
      if (union.size !== k || !union.has(n)) return;
      const targets = cells.filter(
        ([r, c]) =>
          !combo.some(([sr, sc]) => sr === r && sc === c) &&
          puzzle[r]![c] === 0 &&
          notes[r]![c]!.has(n),
      );
      if (targets.length)
        results.push({
          sourceCells: combo.map(([r, c]) => [r, c]),
          nums: [...union],
          targets: targets.map(([r, c]) => [r, c]),
        });
    });
  });
  return results;
}

export function getNakedTriples(puzzle: Grid, notes: Notes, n: number): NakedSetResult[] {
  return dedup(getNakedSetK(puzzle, notes, n, 3), (x) => x.sourceCells);
}

export function getNakedQuads(puzzle: Grid, notes: Notes, n: number): NakedSetResult[] {
  return dedup(getNakedSetK(puzzle, notes, n, 4), (x) => x.sourceCells);
}

/** Combinações de tamanho k em ordem lexicográfica de índice (= loops aninhados originais). */
function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  if (arr.length < k) return out;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    out.push(idx.map((i) => arr[i]!));
    let p = k - 1;
    while (p >= 0 && idx[p]! === arr.length - k + p) p--;
    if (p < 0) break;
    idx[p]!++;
    for (let q = p + 1; q < k; q++) idx[q] = idx[q - 1]! + 1;
  }
  return out;
}

/** Deduplicação idêntica ao original: chave = grupo-fonte '>' alvos (ambos ordenados). */
function dedup<T extends { targets: number[][] }>(results: T[], group: (x: T) => number[][]): T[] {
  const seen = new Set<string>();
  return results.filter((res) => {
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
