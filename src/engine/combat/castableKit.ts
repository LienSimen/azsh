import type { CombatantSpec, Fighter } from './types.ts';
import { isEnemySide } from '../core/events.ts';
import type { SpellDef } from '../../data/schema.ts';

// WHICH OF A CREATURE'S KIT SPELLS IT CAN ACTUALLY REACH. Reachable means SCHEDULED, or a triggered
// payload of something scheduled — Magmadar's cone is fired by his Frenzy tick, not a cast row.
const CASTABLE_BY_KIT = new WeakMap<readonly SpellDef[], ReadonlySet<number>>();

/** aura 23 PERIODIC_TRIGGER_SPELL, aura 42 PROC_TRIGGER_SPELL, effect 64 TRIGGER_SPELL. */
function triggeredBy(id: number, spellOf: (n: number) => SpellDef | undefined): number[] {
  const raw = spellOf(id);
  if (!raw?.rawEffects?.length) return [];
  const out: number[] = [];
  for (const re of raw.rawEffects) {
    const an = re.auraName | 0;
    if (an !== 23 && an !== 42 && (re.effect | 0) !== 64) continue;
    const t = re.triggerSpell | 0;
    if (t > 0) out.push(t);
  }
  return out;
}

// The spec-level entry point, for a caller with no Fighter yet: combatSeed classifies the pack before
// any seat exists. Its specs are enemies by construction, which the call site tests.
export function castableKitIdsOfSpec(
  spec: CombatantSpec,
  spellOf: ((id: number) => SpellDef | undefined) | undefined,
): ReadonlySet<number> | null {
  return build(spec, spellOf);
}

export function castableKitIds(
  f: Fighter,
  spellOf: ((id: number) => SpellDef | undefined) | undefined,
): ReadonlySet<number> | null {
  // ONLY AN ENEMY SEAT. A creature schedule is the plan for a mob; for a player, companion, pet or
  // totem the KIT is the plan, so filtering on a schedule they do not carry would blank their cones.
  if (!isEnemySide(f.side)) return null;
  return build(f.spec, spellOf);
}

function build(
  spec: CombatantSpec,
  spellOf: ((id: number) => SpellDef | undefined) | undefined,
): ReadonlySet<number> | null {
  // A PLAYER-CLASS BODY IS NEVER FILTERED, even on an enemy side: a character is driven by a rotation
  // and carries no creature schedule, so the set would come back empty and blank its whole kit.
  if (spec.classId != null) return null;
  const spells = spec.spells;
  if (!spells?.length) return null;
  // NO STORE means a hand-built fixture, and only that — an EMPTY SCHEDULE does not. Answered BEFORE
  // the memo and never cached, since the answer depends on a lookup that is not part of the key.
  if (!spellOf) return null;
  const hit = CASTABLE_BY_KIT.get(spells);
  if (hit) return hit;
  const scheduled: number[] = [];
  for (const c of spec.creatureCasts ?? []) scheduled.push(c.spellId | 0);
  for (const r of spec.spellList ?? []) scheduled.push(r.spellId | 0);
  const reach = new Set<number>(scheduled);
  const queue = [...reach];
  for (let i = 0; i < queue.length; i++) {
    for (const t of triggeredBy(queue[i]!, spellOf)) {
      if (!reach.has(t)) { reach.add(t); queue.push(t); }
    }
  }
  CASTABLE_BY_KIT.set(spells, reach);
  return reach;
}
