// Apply SPELL_EFFECT_DURABILITY_DAMAGE / _PCT onto Character.durability. Combat reads effects[]; intents
// cover the 111-only path. Cite: SpellEffects.cpp:5209–5260.
import type { SpellDef } from '../../data/schema.ts';
import type { ItemDef } from '../../data/schema.ts';
import type { Character } from '../../domain/character/character.ts';
import {
  applyDurabilityLoss,
  applyDurabilityLossAll,
  applyPointLossOnSlot,
  EQUIPMENT_SLOTS_BY_INDEX,
} from '../../domain/items/durability.ts';
import type { CombatEvent } from '../core/events.ts';
import { resolveCombatSpell, resolveSpellEffects } from '../spells/interpreter/index.ts';

export interface DurabilityDamagePayload {
  slot: number;
  percent?: number;
  points?: number;
  allItems: boolean;
}

function applyOne(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
  row: DurabilityDamagePayload,
): Character {
  const percent = row.percent ?? 0;
  const points = row.points ?? 0;
  if (row.allItems) {
    if (percent > 0) return applyDurabilityLossAll(char, itemOf, percent);
    if (points > 0) {
      let next = char;
      for (const slot of EQUIPMENT_SLOTS_BY_INDEX) {
        if (slot) next = applyPointLossOnSlot(next, slot, itemOf, points);
      }
      return next;
    }
    return char;
  }
  const equipSlot = EQUIPMENT_SLOTS_BY_INDEX[row.slot];
  if (equipSlot == null) return char;
  if (percent > 0) return applyDurabilityLoss(char, equipSlot, itemOf, percent);
  if (points > 0) return applyPointLossOnSlot(char, equipSlot, itemOf, points);
  return char;
}

function payloadsFromSpell(spell: SpellDef): DurabilityDamagePayload[] {
  const out: DurabilityDamagePayload[] = [];
  for (const e of spell.effects ?? []) {
    if (e.kind !== 'durability_damage') continue;
    out.push({
      slot: e.slot,
      percent: e.percent,
      allItems: e.allItems,
    });
  }
  if (out.length) return out;
  if (!spell.rawEffects?.length) return out;
  for (const intent of resolveSpellEffects(spell, {}).intents ?? []) {
    if (intent.kind !== 'durability_damage') continue;
    out.push({
      slot: intent.slot,
      percent: intent.percent,
      points: intent.points,
      allItems: intent.allItems,
    });
  }
  return out;
}

/** Apply durability_damage effects (or unread 111 intents) from one resolved spell. */
export function applyDurabilityDamageFromSpell(
  char: Character,
  spell: SpellDef | null | undefined,
  itemOf: (entry: number) => ItemDef | undefined,
): Character {
  if (!spell) return char;
  let next = char;
  for (const row of payloadsFromSpell(spell)) next = applyOne(next, itemOf, row);
  return next;
}

function spellHitPlayer(e: CombatEvent): e is Extract<CombatEvent, { kind: 'spell_hit'; spellId: number }> {
  if (e.kind !== 'spell_hit' || !e.spellId) return false;
  if (e.result === 'miss' || e.result === 'dodge' || e.result === 'parry' || e.result === 'immune') {
    return false;
  }
  if (e.target === 'player') return true;
  if (e.target == null && e.actor !== 'player') return true;
  // Self-cast with no recorded target; the target === 'player' case already returned above.
  if (e.actor === 'player' && e.target == null) return true;
  return false;
}

/** Post-fight: each landed spell_hit on the player applies that spell's durability_damage. */
export function applyDurabilityDamageFromLandedSpells(
  char: Character,
  events: readonly CombatEvent[] | undefined,
  spellOf: (id: number) => SpellDef | undefined,
  itemOf: (entry: number) => ItemDef | undefined,
): Character {
  if (!events?.length) return char;
  let next = char;
  const seen = new Set<string>();
  for (const e of events) {
    if (!spellHitPlayer(e)) continue;
    const key = `${e.spellId}:${e.t}:${e.actor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = spellOf(e.spellId);
    if (!raw) continue;
    next = applyDurabilityDamageFromSpell(next, resolveCombatSpell(raw), itemOf);
  }
  return next;
}
