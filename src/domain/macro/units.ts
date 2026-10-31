// Unit references — what @… can name. A reference is parsed, not enumerated: a base, an optional
// 1-based index, and a hop count, since any base may be suffixed with `target` repeatedly.

/** The bases a reference can start from. */
export const MACRO_UNIT_BASES = [
  'player', 'pet', 'party', 'partypet', 'raid', 'raidpet', 'target', 'mouseover', 'focus', 'npc',
] as const;
export type MacroUnitBase = typeof MACRO_UNIT_BASES[number];

/** Bases that take a 1-based index, with the highest index the game can offer. */
export const MACRO_UNIT_INDEXED: Readonly<Record<string, number>> = {
  party: 4,
  partypet: 4,
  raid: 40,
  raidpet: 40,
};

/** Ours: `target` suffixes per reference. 3 covers every real macro; the doc warns past that. */
export const MACRO_UNIT_HOPS_MAX = 3;

/** One `@…` reference. `hops` is how many `target` suffixes followed the base. */
export interface MacroUnitRef {
  base: MacroUnitBase;
  /** 1-based, only for party/partypet/raid/raidpet. */
  index?: number;
  hops: number;
}

const BASES: readonly MacroUnitBase[] = MACRO_UNIT_BASES;

// Parse a unit token (without the `@`). Returns null when it is not a unit at all, so a `/target Ragnaros`
// argument is never mistaken for one. Total; never throws.
export function parseMacroUnit(raw: unknown): MacroUnitRef | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('@')) s = s.slice(1);
  // Peel `target` suffixes off the END first, so `target` itself still parses as the base.
  let hops = 0;
  while (s.length > 6 && s.endsWith('target')) {
    s = s.slice(0, -6);
    hops++;
    if (hops > MACRO_UNIT_HOPS_MAX) return null;
  }
  // `targettarget` peels to `target` with hops 1; a bare `target` keeps hops 0.
  const m = /^([a-z]+)([0-9]{1,2})?$/.exec(s);
  if (!m) return null;
  const base = m[1] as MacroUnitBase;
  if (!BASES.includes(base)) return null;
  const max = MACRO_UNIT_INDEXED[base];
  if (max == null) {
    // An index on a base that has none (`@player2`) is not a unit.
    if (m[2] != null) return null;
    return { base, hops };
  }
  const index = m[2] != null ? Number(m[2]) : NaN;
  if (!Number.isInteger(index) || index < 1 || index > max) return null;
  return { base, index, hops };
}

/** Canonical text for a reference (round-trips through parseMacroUnit). */
export function macroUnitToken(ref: MacroUnitRef): string {
  const idx = ref.index != null ? String(ref.index) : '';
  return `${ref.base}${idx}${'target'.repeat(Math.max(0, ref.hops))}`;
}

/** Stable key for caching / comparing two references. */
export function macroUnitKey(ref: MacroUnitRef): string {
  return macroUnitToken(ref);
}

/** Plain-English name, for the builder chips and the editor preview. */
export function describeMacroUnit(ref: MacroUnitRef): string {
  const base = ref.base === 'player' ? 'you'
    : ref.base === 'pet' ? 'your pet'
      : ref.base === 'target' ? 'your target'
        : ref.base === 'mouseover' ? 'the unit under your cursor'
          : ref.base === 'focus' ? 'your focus'
            : ref.base === 'npc' ? 'the NPC you are talking to'
              : ref.base === 'party' ? `party member ${ref.index}`
                : ref.base === 'partypet' ? `party member ${ref.index}'s pet`
                  : ref.base === 'raid' ? `raid member ${ref.index}`
                    : `raid member ${ref.index}'s pet`;
  let out = base;
  for (let i = 0; i < ref.hops; i++) out = `${out}'s target`;
  return out;
}

/** The references the pure layer names directly. */
export const MACRO_UNIT_PLAYER: MacroUnitRef = { base: 'player', hops: 0 };
export const MACRO_UNIT_TARGET: MacroUnitRef = { base: 'target', hops: 0 };
/** `targettarget` — your target's target (what `attacks:` compares against). */
export const MACRO_UNIT_TARGETTARGET: MacroUnitRef = { base: 'target', hops: 1 };
