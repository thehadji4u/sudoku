/**
 * Técnicas lógicas de resolução de Sudoku (estilo humano).
 *
 * Cada técnica opera sobre um estado {board, candidates} e retorna `true` se
 * fez algum progresso (preencheu célula ou eliminou candidato). São usadas
 * pelo `grader` para classificar a dificuldade real de um puzzle pela técnica
 * mais difícil necessária para resolvê-lo — não apenas pela contagem de pistas.
 */
import type { Board, CellValue } from './types';
import { isValidPlacement } from './board';

/** Conjunto de candidatos por célula (vazio se a célula já está preenchida). */
export type Candidates = Set<number>[][];

export type UnitCell = readonly [number, number];

/** Constrói as 27 unidades (9 linhas, 9 colunas, 9 blocos). */
function buildUnits(): UnitCell[][] {
  const units: UnitCell[][] = [];
  for (let r = 0; r < 9; r++) {
    units.push(Array.from({ length: 9 }, (_, c) => [r, c] as UnitCell));
  }
  for (let c = 0; c < 9; c++) {
    units.push(Array.from({ length: 9 }, (_, r) => [r, c] as UnitCell));
  }
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const block: UnitCell[] = [];
      for (let r = br; r < br + 3; r++) {
        for (let c = bc; c < bc + 3; c++) block.push([r, c]);
      }
      units.push(block);
    }
  }
  return units;
}

export const UNITS: readonly UnitCell[][] = buildUnits();

/** Calcula os candidatos de todas as células de um tabuleiro. */
export function computeCandidates(board: Board): Candidates {
  const cands: Candidates = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set<number>()),
  );
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r]![c] !== 0) continue;
      for (let n = 1; n <= 9; n++) {
        if (isValidPlacement(board, r, c, n)) cands[r]![c]!.add(n);
      }
    }
  }
  return cands;
}

export interface SolveState {
  board: Board;
  cands: Candidates;
}

/** Preenche uma célula e remove o dígito dos candidatos das células pares (peers). */
function fillCell(state: SolveState, r: number, c: number, n: number): void {
  state.board[r]![c] = n as CellValue;
  state.cands[r]![c]!.clear();
  // peers: mesma linha, coluna e bloco
  for (let i = 0; i < 9; i++) {
    state.cands[r]![i]!.delete(n);
    state.cands[i]![c]!.delete(n);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) state.cands[rr]![cc]!.delete(n);
  }
}

/* ── Técnicas ── */

/** Naked single: célula com exatamente um candidato. */
export function nakedSingle(state: SolveState): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (state.board[r]![c] === 0 && state.cands[r]![c]!.size === 1) {
        const [n] = state.cands[r]![c]!;
        fillCell(state, r, c, n!);
        return true;
      }
    }
  }
  return false;
}

/** Hidden single: dígito que só pode ir em uma célula de uma unidade. */
export function hiddenSingle(state: SolveState): boolean {
  for (const unit of UNITS) {
    for (let n = 1; n <= 9; n++) {
      let spot: UnitCell | null = null;
      let count = 0;
      for (const [r, c] of unit) {
        if (state.board[r]![c] === 0 && state.cands[r]![c]!.has(n)) {
          count++;
          spot = [r, c];
          if (count > 1) break;
        }
      }
      if (count === 1 && spot) {
        fillCell(state, spot[0], spot[1], n);
        return true;
      }
    }
  }
  return false;
}

/**
 * Locked candidates (pointing + claiming): se um dígito numa unidade só aparece
 * na interseção com outra unidade, elimina-o do restante da segunda unidade.
 */
export function lockedCandidates(state: SolveState): boolean {
  let progress = false;
  // Pointing: dentro de cada bloco, se um dígito está confinado a uma linha/coluna.
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      for (let n = 1; n <= 9; n++) {
        const cells: UnitCell[] = [];
        for (let r = br; r < br + 3; r++) {
          for (let c = bc; c < bc + 3; c++) {
            if (state.board[r]![c] === 0 && state.cands[r]![c]!.has(n)) cells.push([r, c]);
          }
        }
        if (cells.length < 2) continue;
        const rows = new Set(cells.map(([r]) => r));
        const cols = new Set(cells.map(([, c]) => c));
        if (rows.size === 1) {
          const r = cells[0]![0];
          for (let c = 0; c < 9; c++) {
            if (c >= bc && c < bc + 3) continue;
            if (state.cands[r]![c]!.delete(n)) progress = true;
          }
        }
        if (cols.size === 1) {
          const c = cells[0]![1];
          for (let r = 0; r < 9; r++) {
            if (r >= br && r < br + 3) continue;
            if (state.cands[r]![c]!.delete(n)) progress = true;
          }
        }
      }
    }
  }
  // Claiming: dentro de cada linha/coluna, se um dígito está confinado a um bloco.
  for (let line = 0; line < 9; line++) {
    for (let n = 1; n <= 9; n++) {
      // linha
      const rowCols: number[] = [];
      const colRows: number[] = [];
      for (let i = 0; i < 9; i++) {
        if (state.board[line]![i] === 0 && state.cands[line]![i]!.has(n)) rowCols.push(i);
        if (state.board[i]![line] === 0 && state.cands[i]![line]!.has(n)) colRows.push(i);
      }
      if (
        rowCols.length >= 2 &&
        rowCols.every((c) => Math.floor(c / 3) === Math.floor(rowCols[0]! / 3))
      ) {
        const bc = Math.floor(rowCols[0]! / 3) * 3;
        const br = Math.floor(line / 3) * 3;
        for (let r = br; r < br + 3; r++) {
          if (r === line) continue;
          for (let c = bc; c < bc + 3; c++) if (state.cands[r]![c]!.delete(n)) progress = true;
        }
      }
      if (
        colRows.length >= 2 &&
        colRows.every((r) => Math.floor(r / 3) === Math.floor(colRows[0]! / 3))
      ) {
        const br = Math.floor(colRows[0]! / 3) * 3;
        const bc = Math.floor(line / 3) * 3;
        for (let c = bc; c < bc + 3; c++) {
          if (c === line) continue;
          for (let r = br; r < br + 3; r++) if (state.cands[r]![c]!.delete(n)) progress = true;
        }
      }
    }
  }
  return progress;
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** Naked pair: duas células numa unidade com os mesmos 2 candidatos. */
export function nakedPair(state: SolveState): boolean {
  let progress = false;
  for (const unit of UNITS) {
    const pairCells = unit.filter(([r, c]) => state.cands[r]![c]!.size === 2);
    for (let i = 0; i < pairCells.length; i++) {
      for (let j = i + 1; j < pairCells.length; j++) {
        const a = state.cands[pairCells[i]![0]]![pairCells[i]![1]]!;
        const b = state.cands[pairCells[j]![0]]![pairCells[j]![1]]!;
        if (!sameSet(a, b)) continue;
        const digits = [...a];
        for (const [r, c] of unit) {
          if (
            (r === pairCells[i]![0] && c === pairCells[i]![1]) ||
            (r === pairCells[j]![0] && c === pairCells[j]![1])
          )
            continue;
          for (const d of digits) if (state.cands[r]![c]!.delete(d)) progress = true;
        }
      }
    }
  }
  return progress;
}

/** Hidden pair: dois dígitos confinados às mesmas duas células de uma unidade. */
export function hiddenPair(state: SolveState): boolean {
  let progress = false;
  for (const unit of UNITS) {
    const spots: Record<number, UnitCell[]> = {};
    for (let n = 1; n <= 9; n++) {
      spots[n] = unit.filter(([r, c]) => state.cands[r]![c]!.has(n));
    }
    for (let n1 = 1; n1 <= 9; n1++) {
      for (let n2 = n1 + 1; n2 <= 9; n2++) {
        const s1 = spots[n1]!;
        const s2 = spots[n2]!;
        if (s1.length !== 2 || s2.length !== 2) continue;
        const key = (s: UnitCell[]) =>
          s
            .map(([r, c]) => `${r},${c}`)
            .sort()
            .join('|');
        if (key(s1) !== key(s2)) continue;
        for (const [r, c] of s1) {
          for (let d = 1; d <= 9; d++) {
            if (d === n1 || d === n2) continue;
            if (state.cands[r]![c]!.delete(d)) progress = true;
          }
        }
      }
    }
  }
  return progress;
}

/** Naked triple: três células cuja união de candidatos tem tamanho 3. */
export function nakedTriple(state: SolveState): boolean {
  let progress = false;
  for (const unit of UNITS) {
    const cells = unit.filter(([r, c]) => {
      const s = state.cands[r]![c]!.size;
      return s >= 2 && s <= 3;
    });
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        for (let k = j + 1; k < cells.length; k++) {
          const union = new Set<number>();
          for (const idx of [i, j, k]) {
            for (const d of state.cands[cells[idx]![0]]![cells[idx]![1]]!) union.add(d);
          }
          if (union.size !== 3) continue;
          const trio = new Set([`${cells[i]}`, `${cells[j]}`, `${cells[k]}`]);
          for (const [r, c] of unit) {
            if (trio.has(`${[r, c]}`)) continue;
            for (const d of union) if (state.cands[r]![c]!.delete(d)) progress = true;
          }
        }
      }
    }
  }
  return progress;
}

/** Hidden triple: três dígitos confinados às mesmas três células de uma unidade. */
export function hiddenTriple(state: SolveState): boolean {
  let progress = false;
  for (const unit of UNITS) {
    const spots: Record<number, string[]> = {};
    for (let n = 1; n <= 9; n++) {
      spots[n] = unit.filter(([r, c]) => state.cands[r]![c]!.has(n)).map(([r, c]) => `${r},${c}`);
    }
    for (let a = 1; a <= 9; a++) {
      for (let b = a + 1; b <= 9; b++) {
        for (let c = b + 1; c <= 9; c++) {
          const union = new Set([...spots[a]!, ...spots[b]!, ...spots[c]!]);
          if (union.size !== 3) continue;
          if (spots[a]!.length === 0 || spots[b]!.length === 0 || spots[c]!.length === 0) continue;
          const keep = new Set([a, b, c]);
          for (const cellKey of union) {
            const [r, col] = cellKey.split(',').map(Number) as [number, number];
            for (let d = 1; d <= 9; d++) {
              if (keep.has(d)) continue;
              if (state.cands[r]![col]!.delete(d)) progress = true;
            }
          }
        }
      }
    }
  }
  return progress;
}

/** X-Wing: padrão de retângulo para um dígito em duas linhas/colunas. */
export function xWing(state: SolveState): boolean {
  let progress = false;
  for (let n = 1; n <= 9; n++) {
    // baseado em linhas
    const rowCols: number[][] = [];
    for (let r = 0; r < 9; r++) {
      const cols: number[] = [];
      for (let c = 0; c < 9; c++) if (state.cands[r]![c]!.has(n)) cols.push(c);
      rowCols[r] = cols;
    }
    for (let r1 = 0; r1 < 9; r1++) {
      if (rowCols[r1]!.length !== 2) continue;
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        if (rowCols[r2]!.length !== 2) continue;
        if (rowCols[r1]![0] === rowCols[r2]![0] && rowCols[r1]![1] === rowCols[r2]![1]) {
          const [ca, cb] = rowCols[r1] as [number, number];
          for (let r = 0; r < 9; r++) {
            if (r === r1 || r === r2) continue;
            if (state.cands[r]![ca]!.delete(n)) progress = true;
            if (state.cands[r]![cb]!.delete(n)) progress = true;
          }
        }
      }
    }
    // baseado em colunas
    const colRows: number[][] = [];
    for (let c = 0; c < 9; c++) {
      const rows: number[] = [];
      for (let r = 0; r < 9; r++) if (state.cands[r]![c]!.has(n)) rows.push(r);
      colRows[c] = rows;
    }
    for (let c1 = 0; c1 < 9; c1++) {
      if (colRows[c1]!.length !== 2) continue;
      for (let c2 = c1 + 1; c2 < 9; c2++) {
        if (colRows[c2]!.length !== 2) continue;
        if (colRows[c1]![0] === colRows[c2]![0] && colRows[c1]![1] === colRows[c2]![1]) {
          const [ra, rb] = colRows[c1] as [number, number];
          for (let c = 0; c < 9; c++) {
            if (c === c1 || c === c2) continue;
            if (state.cands[ra]![c]!.delete(n)) progress = true;
            if (state.cands[rb]![c]!.delete(n)) progress = true;
          }
        }
      }
    }
  }
  return progress;
}
