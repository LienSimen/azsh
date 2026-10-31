// Per-item on-use targetability, derived at runtime from ItemDef and SpellDef — there is no baked
// ItemDef.useTarget yet, so the heuristic fallback below is intentional. Pure.

import type { ItemDef, SpellDef, SpellEffect } from '../../data/schema.ts';
import {
  hasFriendlyPayload,
  hasHostilePayload,
  onUseAimsAtEnemy,
  onUseEffects,
} from './onUsePayload.ts';

// Who the item's on-use effect can legally target. `enemy` = offensive only (grenades, Tidal Charm) — it
// must NOT be usable on yourself.
export type ItemUseTarget = 'self' | 'friendly' | 'any' | 'enemy';

/** Minimal spell lookup surface (DataStore.spell or a test stub). */
export type ItemUseTargetDs = {
  spell(id: number): SpellDef | undefined;
};

const FRIENDLY_APPLY_TO = new Set(['friendly', 'party', 'pet']);

// Who the item's on-use effect can legally target. Spell effect signals win; when the spell is
// missing the name and field heuristics answer, defaulting to 'self'.
export function itemUseTarget(itemDef: ItemDef, ds: ItemUseTargetDs): ItemUseTarget {
  // ITEM_CLASS_RECIPE carries the TAUGHT spell in useSpell, so a Cone of Cold tome read as
  // enemy-target. Reading a book is never an on-use cast. Cite: buildCombatant.ts:238.
  if ((itemDef.itemClass ?? 0) === 9) return 'self';
  if (itemDef.useSpell != null) {
    const spell = ds.spell(itemDef.useSpell);
    if (spell) {
      const fromSpell = targetFromSpellEffects(spell.effects);
      if (fromSpell !== undefined) return fromSpell;
      // The payload can sit a trigger down (Reckless Charge 22641 → 13327), and the implicit
      // target row answers hostility on its own. Cite: SpellTargets.cpp:31.
      const payload = onUseEffects(spell, ds);
      if (!hasFriendlyPayload(payload) && (onUseAimsAtEnemy(spell) || hasHostilePayload(payload))) {
        return 'enemy';
      }
    }
    // Heuristic fallback: useSpell set but spell missing / no applyTo signal.
    // Prefer baking ItemDef.useTarget via ETL when this path is hit often.
    return heuristicFallback(itemDef);
  }

  // Classic potion / healthstone / mana gem — restore on the user only.
  if (itemDef.useInCombat) return 'self';

  // Elixir / flask / stat food buff without a useSpell that says otherwise — self only.
  if (itemDef.useBuff) return 'self';

  return 'self';
}

// Inspect spell effects for friendly vs self targeting. Returns undefined when no usable target signal is
// present (caller may fall back).
function targetFromSpellEffects(effects: readonly SpellEffect[]): ItemUseTarget | undefined {
  let sawSelfSignal = false;

  // HOSTILE FIRST. Skipping every non-buff kind gave a grenade no signal at all, so 'any' was
  // returned by 0 of 3,594 items. A friendly payload anywhere still outranks it.
  if (!hasFriendlyPayload(effects) && hasHostilePayload(effects)) return 'enemy';

  for (const e of effects) {
    if (e.kind !== 'buff') continue;
    const applyTo = e.applyTo;
    if (applyTo && FRIENDLY_APPLY_TO.has(applyTo)) return 'friendly';
    // applyTo 'self' or absent on a beneficial buff → self-only signal
    if (applyTo === 'self' || applyTo === undefined) {
      if (!e.hostile) sawSelfSignal = true;
    }
  }
  if (sawSelfSignal) return 'self';
  return undefined;
}

// When spell target data is missing: name / field heuristics. Scrolls of protection etc. can be cast on
// allies; potions/elixirs stay self.
function heuristicFallback(itemDef: ItemDef): ItemUseTarget {
  const name = itemDef.name ?? '';
  // Scroll-like: classic "Scroll of …" can target friendly units.
  if (/^Scroll of /i.test(name)) return 'friendly';

  // Potion / elixir / flask (field or name hints) → self.
  if (itemDef.useInCombat || itemDef.useBuff) return 'self';
  if (/\b(potion|elixir|flask)\b/i.test(name)) return 'self';

  // Safe default — never invent free targeting on others.
  return 'self';
}
