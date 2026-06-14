/**
 * Sistema de progressão / desbloqueio de níveis (lógica pura, sem DOM).
 *
 * Extraído de `public/app.js` como primeira fatia da decomposição do monólito.
 * As tabelas de configuração (ordem dos níveis, requisitos) continuam vivendo
 * no app legado e são passadas como parâmetro — sem duplicação de constantes.
 */

/** Mapa nível → nº de partidas concluídas. */
export type Completions = Record<string, number>;

/** Requisito de desbloqueio: nível → nº de partidas do nível anterior. */
export type UnlockRequirements = Record<string, number>;

/**
 * True se `diff` está desbloqueado. Um nível é desbloqueado quando o jogador
 * concluiu pelo menos `required[diff]` partidas do nível imediatamente anterior.
 */
export function isUnlocked(
  order: readonly string[],
  required: UnlockRequirements,
  completions: Completions,
  diff: string,
  allUnlocked: boolean,
): boolean {
  if (allUnlocked) return true;
  const req = required[diff] ?? 0;
  if (req === 0) return true;
  const idx = order.indexOf(diff);
  if (idx <= 0) return true;
  const prevDiff = order[idx - 1]!;
  return (completions[prevDiff] ?? 0) >= req;
}

export interface NextUnlock {
  /** Próximo nível bloqueado. */
  diff: string;
  /** Nível anterior cujas partidas desbloqueiam `diff`. */
  prevDiff: string;
  /** Quantas partidas ainda faltam. */
  remaining: number;
}

/**
 * Retorna o primeiro nível ainda bloqueado e quantas partidas faltam para
 * desbloqueá-lo, ou `null` se tudo já está desbloqueado.
 */
export function nextUnlock(
  order: readonly string[],
  required: UnlockRequirements,
  completions: Completions,
  allUnlocked: boolean,
): NextUnlock | null {
  if (allUnlocked) return null;
  for (const diff of order) {
    if (isUnlocked(order, required, completions, diff, allUnlocked)) continue;
    const idx = order.indexOf(diff);
    const prevDiff = order[idx - 1]!;
    const req = required[diff] ?? 0;
    const have = completions[prevDiff] ?? 0;
    return { diff, prevDiff, remaining: Math.max(0, req - have) };
  }
  return null;
}
