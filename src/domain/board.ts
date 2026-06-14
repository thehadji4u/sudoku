/**
 * Operações puras de tabuleiro: criação, cópia e validação de jogadas.
 * Sem dependência de DOM — testável isoladamente.
 */
import type { Board, CellValue } from './types';

/** Cria um tabuleiro 9x9 vazio (todas as células = 0). */
export function createEmptyBoard(): Board {
  return Array.from({ length: 9 }, () => new Array<CellValue>(9).fill(0));
}

/** Cópia profunda de um tabuleiro. */
export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

/**
 * Verifica se `num` pode ser colocado em (row, col) sem violar as regras
 * de Sudoku (linha, coluna e bloco 3x3). Assume que a célula está vazia
 * ou que seu valor atual não deve ser considerado.
 */
export function isValidPlacement(board: Board, row: number, col: number, num: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (board[row]![i] === num) return false;
    if (board[i]![col] === num) return false;
  }
  const blockRow = Math.floor(row / 3) * 3;
  const blockCol = Math.floor(col / 3) * 3;
  for (let r = blockRow; r < blockRow + 3; r++) {
    for (let c = blockCol; c < blockCol + 3; c++) {
      if (board[r]![c] === num) return false;
    }
  }
  return true;
}

/**
 * Valida um tabuleiro completo ou parcial: nenhum dígito repetido em
 * qualquer linha, coluna ou bloco. Células vazias (0) são ignoradas.
 */
export function isBoardConsistent(board: Board): boolean {
  for (let r = 0; r < 9; r++) {
    const rowSeen = new Set<number>();
    const colSeen = new Set<number>();
    for (let c = 0; c < 9; c++) {
      const rv = board[r]![c]!;
      if (rv !== 0) {
        if (rowSeen.has(rv)) return false;
        rowSeen.add(rv);
      }
      const cv = board[c]![r]!;
      if (cv !== 0) {
        if (colSeen.has(cv)) return false;
        colSeen.add(cv);
      }
    }
  }
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const seen = new Set<number>();
      for (let r = br; r < br + 3; r++) {
        for (let c = bc; c < bc + 3; c++) {
          const v = board[r]![c]!;
          if (v !== 0) {
            if (seen.has(v)) return false;
            seen.add(v);
          }
        }
      }
    }
  }
  return true;
}

/** True se todas as células estão preenchidas (sem 0). */
export function isComplete(board: Board): boolean {
  return board.every((row) => row.every((v) => v !== 0));
}
