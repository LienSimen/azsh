// The remembered Start-the-run food and water prefs. Import-free so ui/core/settings.ts can hold it.

/** Units of each kind every member walks in with. Operator, 2026-09-10: "at least 40+ water". */
export const RUN_SUPPLY_TARGET = 40;
export const RUN_SUPPLY_TARGET_MIN = 5;
export const RUN_SUPPLY_TARGET_MAX = 100;

export interface RunSupplyPrefs {
  target: number;
  food: boolean;
  drink: boolean;
}

export const DEFAULT_RUN_SUPPLY_PREFS: RunSupplyPrefs = { target: RUN_SUPPLY_TARGET, food: true, drink: true };

export function clampTarget(n: number): number {
  return Math.max(RUN_SUPPLY_TARGET_MIN, Math.min(RUN_SUPPLY_TARGET_MAX, Math.round(n)));
}

export function normalizeRunSupplyPrefs(raw: unknown): RunSupplyPrefs {
  const out = { ...DEFAULT_RUN_SUPPLY_PREFS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.target === 'number' && Number.isFinite(r.target)) out.target = clampTarget(r.target);
  if (typeof r.food === 'boolean') out.food = r.food;
  if (typeof r.drink === 'boolean') out.drink = r.drink;
  return out;
}
