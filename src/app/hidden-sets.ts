/**
 * Detecção de conjuntos ocultos (hidden pair/triple/quad) para o sistema de
 * poderes — lógica PURA extraída de `public/app.js`.
 *
 * Porte fiel: a ordem dos resultados e a deduplicação são idênticas às funções
 * originais (a UI indexa os resultados por posição). O triplo e o quádruplo
 * compartilham o mesmo algoritmo (parametrizado por `k`); o par usa a sua
 * formulação própria, mais estrita. Verificado por testes diferenciais contra
 * as implementações originais.
 */

export type Cell = [number, number];
export type Notes = ReadonlyArray<ReadonlyArray<ReadonlySet<number>>>;
export type Grid = ReadonlyArray<ReadonlyArray<number>>;

export interface HiddenPairResult {
  cells: number[][];
  pairNums: number[];
  targets: number[][];
}
export interface HiddenTripleResult {
  cells: number[][];
  tripleNums: number[];
  targets: number[][];
}
export interface HiddenQuadResult {
  cells: number[][];
  quadNums: number[];
  targets: number[][];
}

/** Itera as 27 unidades na mesma ordem do original: linha i, coluna i, bloco i. */
function forEachUnit(fn: (cells: Cell[]) => void): void {
  for (let i = 0; i < 9; i++) {
    fn(Array.from({ length: 9 }, (_, j) => [i, j] as Cell));
    fn(Array.from({ length: 9 }, (_, j) => [j, i] as Cell));
    const br = Math.floor(i / 3) * 3;
    const bc = (i % 3) * 3;
    fn(Array.from({ length: 9 }, (_, k) => [br + Math.floor(k / 3), bc + (k % 3)] as Cell));
  }
}

/** Hidden pair (formulação estrita original). */
export function getHiddenPairs(puzzle: Grid, notes: Notes, n: number): HiddenPairResult[] {
  if (!puzzle || !notes) return [];
  const results: HiddenPairResult[] = [];
  forEachUnit((cells) => {
    const emptyCells = cells.filter(([r, c]) => puzzle[r]![c] === 0);
    for (let a = 1; a <= 8; a++) {
      if (a === n) continue;
      const aCells = emptyCells.filter(([r, c]) => notes[r]![c]!.has(a));
      if (aCells.length !== 2) continue;
      for (let b = a + 1; b <= 9; b++) {
        if (b === n) continue;
        const bCells = emptyCells.filter(([r, c]) => notes[r]![c]!.has(b));
        if (bCells.length !== 2) continue;
        if (
          aCells[0]![0] !== bCells[0]![0] ||
          aCells[0]![1] !== bCells[0]![1] ||
          aCells[1]![0] !== bCells[1]![0] ||
          aCells[1]![1] !== bCells[1]![1]
        )
          continue;
        const targets = aCells.filter(([r, c]) => notes[r]![c]!.has(n)).map(([r, c]) => [r, c, n]);
        if (targets.length > 0)
          results.push({ cells: aCells.map(([r, c]) => [r, c]), pairNums: [a, b], targets });
      }
    }
  });
  return dedup(results, (x) => x.pairNums);
}

/** Núcleo compartilhado de triplo/quádruplo oculto (k = 3 ou 4). */
function getHiddenSetK(
  puzzle: Grid,
  notes: Notes,
  n: number,
  k: number,
): { cells: number[][]; nums: number[]; targets: number[][] }[] {
  if (!puzzle || !notes) return [];
  const results: { cells: number[][]; nums: number[]; targets: number[][] }[] = [];
  forEachUnit((cells) => {
    const emptyCells = cells.filter(([r, c]) => puzzle[r]![c] === 0);
    const digitMap = new Map<number, Cell[]>();
    for (let d = 1; d <= 9; d++) {
      if (d === n) continue;
      const dc = emptyCells.filter(([r, c]) => notes[r]![c]!.has(d));
      if (dc.length >= 2 && dc.length <= k) digitMap.set(d, dc);
    }
    const digits = [...digitMap.keys()];
    combinations(digits, k).forEach((combo) => {
      const cellSet = new Set<string>();
      combo.forEach((d) => digitMap.get(d)!.forEach(([r, c]) => cellSet.add(r + ',' + c)));
      if (cellSet.size !== k) return;
      const setCells = [...cellSet].map((s) => s.split(',').map(Number));
      const targets = setCells
        .filter(([r, c]) => notes[r!]![c!]!.has(n))
        .map(([r, c]) => [r!, c!, n]);
      if (targets.length > 0) results.push({ cells: setCells, nums: combo, targets });
    });
  });
  return results;
}

export function getHiddenTriples(puzzle: Grid, notes: Notes, n: number): HiddenTripleResult[] {
  const raw = getHiddenSetK(puzzle, notes, n, 3);
  const mapped = raw.map((x) => ({ cells: x.cells, tripleNums: x.nums, targets: x.targets }));
  return dedup(mapped, (x) => x.tripleNums);
}

export function getHiddenQuads(puzzle: Grid, notes: Notes, n: number): HiddenQuadResult[] {
  const raw = getHiddenSetK(puzzle, notes, n, 4);
  const mapped = raw.map((x) => ({ cells: x.cells, quadNums: x.nums, targets: x.targets }));
  return dedup(mapped, (x) => x.quadNums);
}

/** Combinações de tamanho k em ordem lexicográfica de índice (= loops aninhados originais). */
function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const idx = Array.from({ length: k }, (_, i) => i);
  if (arr.length < k) return out;
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

/** Deduplicação idêntica ao original: chave = células ordenadas + 'x' + nums ordenados. */
function dedup<T extends { cells: number[][] }>(results: T[], nums: (x: T) => number[]): T[] {
  const seen = new Set<string>();
  return results.filter((res) => {
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
