// `spell_script_target`, the gate that makes a script-targeted cast possible or refuses it. With no
// gate, Corpse Explosion was cast at the party from the first second — 17,895 of 32,513 damage.
import scriptTargetsJson from '../../data/spell-script-targets.json' with { type: 'json' };

/** Cite: SpellMgr.h:1771-1776 `enum SpellScriptTargetType`. */
export const SPELL_TARGET_TYPE_GAMEOBJECT = 0;
export const SPELL_TARGET_TYPE_CREATURE = 1;
export const SPELL_TARGET_TYPE_DEAD = 2;

/** Cite: SpellTargetDefines.h:62,66,70 — the three modes CheckScriptTargeting owns. */
const SCRIPT_TARGET_MODES = new Set([38, 40, 46]);

export type ScriptTargetRow = { t: number; e: number; m?: number };

const ROWS = scriptTargetsJson as Record<string, ScriptTargetRow[]>;

/** `spell_script_target` rows for a spell; empty when the table has none. */
export function scriptTargetRowsFor(spellId: number): readonly ScriptTargetRow[] {
  return ROWS[String(spellId | 0)] ?? [];
}

/** Living creature entries listed as type-1 script targets for this spell. */
export function scriptTargetCreatureEntries(spellId: number): number[] {
  const out: number[] = [];
  for (const row of scriptTargetRowsFor(spellId)) {
    if (row.t !== SPELL_TARGET_TYPE_CREATURE) continue;
    if (!out.includes(row.e | 0)) out.push(row.e | 0);
  }
  return out;
}

// How a self-cast picks its script targets for this spell's raw effects.
// Cite: SpellTargets.cpp:40 the source-location AoE; :71 the near-caster unit.
export function scriptTargetPickMode(
  raw: readonly { targetA?: number; targetB?: number }[] | undefined,
): 'near' | 'aoe' | 'none' {
  if (!raw?.length) return 'none';
  let aoe = false;
  for (const e of raw) {
    const a = e.targetA ?? 0;
    const b = e.targetB ?? 0;
    if (a === 38 || b === 38) return 'near';
    if (a === 7 || b === 7 || a === 8 || b === 8) aoe = true;
  }
  return aoe ? 'aoe' : 'none';
}

/** True when any effect of this spell resolves through CheckScriptTargeting. */
export function spellUsesScriptTarget(
  raw: readonly { targetA?: number; targetB?: number }[] | undefined,
): boolean {
  if (!raw?.length) return false;
  for (const e of raw) {
    if (SCRIPT_TARGET_MODES.has(e.targetA ?? 0)) return true;
    if (SCRIPT_TARGET_MODES.has(e.targetB ?? 0)) return true;
  }
  return false;
}

// Refuse a script-targeted cast whose rows are all corpse-type when no matching corpse is present.
// SCOPED to that type: the living and gameobject rows name world objects a session does not model.
export function refuseForMissingCorpse(
  spellId: number,
  raw: readonly { targetA?: number; targetB?: number }[] | undefined,
  hasCorpse: (creatureEntry: number) => boolean,
): boolean {
  if (!spellUsesScriptTarget(raw)) return false;
  const rows = scriptTargetRowsFor(spellId);
  if (!rows.length) return false;
  const dead = rows.filter((r) => r.t === SPELL_TARGET_TYPE_DEAD);
  if (!dead.length || dead.length !== rows.length) return false;
  return !dead.some((r) => hasCorpse(r.e));
}

// Living-creature entries a BARE use can never satisfy: with no target the C++ finds nothing and fails
// before the item is spent. 32 of 39 such items succeeded on a bag click, destroying 12 quest items.
export function bareUseRefusedCreatureEntries(
  spellId: number,
  raw: readonly { targetA?: number; targetB?: number }[] | undefined,
): number[] {
  if (!raw?.length) return [];
  const nearUnit = raw.some((e) => (e.targetA ?? 0) === 38 || (e.targetB ?? 0) === 38);
  if (!nearUnit) return [];
  return scriptTargetCreatureEntries(spellId);
}
