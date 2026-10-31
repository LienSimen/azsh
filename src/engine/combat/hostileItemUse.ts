// Throwing an offensive item — grenades, bombs, Tidal Charm, Magic Dust. A thrown item is REPLAYED AS
// A CAST, so the fan-out, the hit table, immunities and threat are the real ones.

import type { CombatEvent, Side } from '../core/events.ts';
import type { CombatantId } from './threat.ts';
import type { CombatItem, Fighter } from './types.ts';
import type { SpellDef } from '../../data/schema.ts';
import { spendKitItem } from './types.ts';

/** Everything the throw needs from the enclosing session. */
export interface HostileItemUseDeps {
  /** Current session clock (ms). */
  t: number;
  /** The unit throwing it. */
  caster: Fighter;
  /** Side label for the log row. */
  actor: Side;
  /** Explicit target from the action, or undefined for "pick one for me". */
  targetId: CombatantId | undefined;
  /** Resolve an explicit CombatantId to a Fighter (null when that side is absent). */
  resolveItemTarget: (id: CombatantId) => Fighter | null;
  /** Living hostile units for `caster`, nearest/first-priority first. */
  livingHostilesFor: (f: Fighter) => Fighter[];
  /** Is this side hostile to the ACTOR? (An enemy bot's grenade lands on player-faction sides.) */
  hostileToActor: (s: Side) => boolean;
  dead: (f: Fighter) => boolean;
  /** The shared cast seam (applySpell + AoE fan-out + ScriptDev hooks). */
  castOnTargets: (src: Fighter, primary: Fighter, spell: SpellDef) => void;
  push: (e: CombatEvent) => void;
  cdMap: Map<number, number>;
  spentMap: Map<number, number>;
}

// Throw `it` at a hostile unit, returning whether it fired. An offensive item may ONLY land on a
// living enemy: with no explicit target, 43 of 43 of them used to detonate on the user.
export function useHostileItem(
  it: CombatItem,
  effect: Extract<CombatItem['effect'], { kind: 'hostile_cast' }>,
  d: HostileItemUseDeps,
): boolean {
  const foe = d.targetId == null
    ? (d.livingHostilesFor(d.caster)[0] ?? null)
    : d.resolveItemTarget(d.targetId);
  if (!foe || !d.hostileToActor(foe.side) || d.dead(foe)) {
    return false;
  }

  // Shared category CD (bombs = spellcategory 24 / 60000 ms) — refuse while category is hot.
  // Cite: item_template.spellcategory_1; docs/profid/C2-engineering.md Q3.
  if (
    it.category != null
    && it.categoryCooldownMs != null
    && it.categoryCooldownMs > 0
    && (d.caster.categoryCooldowns.get(it.category) ?? 0) > d.t
  ) {
    return false;
  }

  // Replayed as a real cast so the fan uses the spell's own radius and shape. Damage and CC rows for
  // every unit in radius come from that path — do not reimplement the fan here.
  d.castOnTargets(d.caster, foe, effect.spell);

  spendKitItem(it, d.spentMap);
  if (it.cooldownMs > 0) d.cdMap.set(it.entry, d.t + it.cooldownMs);
  if (it.category != null && it.categoryCooldownMs != null && it.categoryCooldownMs > 0) {
    d.caster.categoryCooldowns.set(it.category, d.t + it.categoryCooldownMs);
  }
  // The damage and cc rows come from the cast path above; this is the "you threw it" beat.
  // Primary only on item_use — secondaries appear as their own spell_hit / control rows.
  d.push({
    t: d.t, kind: 'item_use', actor: d.actor, entry: it.entry, name: it.name,
    effect: 'hostile_cast', amount: 0, target: foe.side,
  });
  return true;
}
