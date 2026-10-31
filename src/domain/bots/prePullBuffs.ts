// Pre-pull party buffs: companions cast their raid buffs on each other and mage/warlock companions
// hand over provisions. A shareable buff is recognised from the baked `applyTo`, not a name list.

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellBook } from '../character/spellbook.ts';
import type { SpellDef, BuffMod } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { isAutoConsumableCandidate } from './autoConsumables.ts';
import { PALADIN_AURA_GROUP, PALADIN_BLESSING_GROUP } from '../rotation/paladinBuffs.ts';
import { dropWeakerMultirankSiblings } from '../../engine/spells/auraStacking.ts';

// Buff mods that take effect from an ALREADY-ACTIVE aura — the ones the shared character
// derivation folds in. `resist` is handled separately and haste is combat-live.
const BENEFICIAL_MODS: ReadonlySet<BuffMod> = new Set<BuffMod>([
  'strength', 'agility', 'stamina', 'intellect', 'spirit', 'all_stats', 'all_stats_pct',
  'strength_pct', 'agility_pct', 'stamina_pct', 'intellect_pct', 'spirit_pct',
  'armor', 'attack_power', 'attack_power_pct', 'mp5', 'spell_power',
  // Single-school +damage (Elixir of Greater Firepower) is as beneficial as generic spell power.
  'spell_damage_holy', 'spell_damage_fire', 'spell_damage_nature',
  'spell_damage_frost', 'spell_damage_shadow', 'spell_damage_arcane',
]);

// Provisions handed to the player: always ONE stack of food and one of water, never a multi-stack
// dump. Count is the item's stack size, and an existing food or drink skips the handout.
export const HANDOUT_STACKS = 1;

/** A party member acting as a buff/conjure provider. */
export interface PartyCaster {
  name: string;
  spellbook: SpellBook;
}

/** One group buff selected for the party (best rank of its family across all providers). */
export interface PlannedBuff {
  spellId: number;
  /** Buff family display name (e.g. "Power Word: Fortitude"). */
  name: string;
  durationMs: number;
  /** Provider that supplied the best rank (feedback provenance). */
  from: string;
}

/** One conjured provision handed to the player. */
export interface PlannedHandout {
  item: number;
  count: number;
  from: string;
}

export interface PrePullPlan {
  buffs: PlannedBuff[];
  handouts: PlannedHandout[];
}

/** Rank-free family key for a spell name (ranks live in SpellDef.rank, not the name). */
function familyKey(name: string): string {
  return name.trim().toLowerCase();
}

// Total beneficial magnitude of a spell's pre-applicable buff/resist effects, or null when the spell
// carries no such effect (used both to gate and to rank candidates within a family).
function beneficialMagnitude(spell: SpellDef): number | null {
  let total = 0;
  let has = false;
  for (const e of spell.effects) {
    if (e.kind === 'buff' && BENEFICIAL_MODS.has(e.mod) && (e.amount ?? 0) > 0 && e.hostile !== true) {
      total += e.amount;
      has = true;
    } else if (e.kind === 'resist' && (e.amount ?? 0) > 0) {
      total += e.amount;
      has = true;
    }
  }
  return has ? total : null;
}

/** Longest buff-effect duration on a spell (0 = permanent-until-cancelled). */
function buffDurationMs(spell: SpellDef): number {
  let d = 0;
  for (const e of spell.effects) if (e.kind === 'buff' && e.durationMs > d) d = e.durationMs;
  return d;
}

// A paladin Blessing (spell_group 7) or Aura (8) is NOT planned here: which one lands on which
// body is a per-target, per-paladin decision that planPartyPaladinBuffs owns. Left in, the generic
// plan handed one Blessing of Might to the whole party and overwrote that decision.
const PALADIN_OWNED_GROUPS: ReadonlySet<number> = new Set([
  PALADIN_BLESSING_GROUP, PALADIN_AURA_GROUP,
]);

// True when a spell is a shareable party/raid buff: a pre-applicable beneficial mod whose baked
// `applyTo` lands it on someone else. Self-only and pet-only buffs and hostile debuffs are out.
export function isGroupBuffSpell(spell: SpellDef): boolean {
  const group = spell.exclusionGroup ?? spell.spellGroupId ?? 0;
  if (PALADIN_OWNED_GROUPS.has(group)) return false;
  return spell.effects.some(
    (e) =>
      e.kind === 'buff' &&
      (e.applyTo === 'friendly' || e.applyTo === 'party') &&
      BENEFICIAL_MODS.has(e.mod) &&
      (e.amount ?? 0) > 0 &&
      e.hostile !== true,
  );
}

/** Best-rank group buff a caster knows, one entry per buff family. */
export function groupBuffsKnown(
  sb: SpellBook,
  ds: DataStore,
): { spellId: number; family: string; amount: number }[] {
  const best = new Map<string, { spellId: number; amount: number }>();
  for (const id of sb.known) {
    const s = ds.spell(id);
    if (!s || !isGroupBuffSpell(s)) continue;
    const fam = familyKey(s.name);
    const amount = beneficialMagnitude(s)!;
    const cur = best.get(fam);
    if (!cur || amount > cur.amount) best.set(fam, { spellId: id, amount });
  }
  return [...best.entries()].map(([family, v]) => ({ family, spellId: v.spellId, amount: v.amount }));
}

/** One conjurable provision: the item a conjure effect makes and what it restores. */
export interface ConjurableProvision {
  item: number;
  effect: 'food' | 'drink';
  /** Restore per tick — what ranks the ranks. */
  quality: number;
}

// EVERY conjured food and drink these spell ids can make, best rank first within each effect. Data-driven
// off the `conjure` effect's output item — no spell-name matching.
export function conjurableProvisions(
  knownSpellIds: readonly number[],
  ds: DataStore,
): ConjurableProvision[] {
  const out: ConjurableProvision[] = [];
  const seen = new Set<number>();
  for (const id of knownSpellIds) {
    const s = ds.spell(id);
    if (!s) continue;
    for (const e of s.effects) {
      if (e.kind !== 'conjure' || seen.has(e.item)) continue;
      const item = ds.item(e.item);
      const eff = item?.consumable?.effect;
      if (eff !== 'food' && eff !== 'drink') continue;
      seen.add(e.item);
      out.push({ item: e.item, effect: eff, quality: item?.consumable?.amountPerTick ?? 0 });
    }
  }
  return out.sort((a, b) => b.quality - a.quality);
}

// Best conjured food and drink `char` can actually USE from `pool`. The two dead-weight cases are
// a rage or energy class handed water, and a rank above the owner's level.
export function usableProvisionsFor(
  pool: readonly ConjurableProvision[],
  char: Character,
  ds: DataStore,
): { food?: number; drink?: number } {
  const out: { food?: number; drink?: number } = {};
  for (const p of pool) {
    if (out[p.effect] != null) continue;
    const it = ds.item(p.item);
    if (!it || !isAutoConsumableCandidate(it, char)) continue;
    out[p.effect] = p.item;
  }
  return out;
}

// Best conjured food and drink a caster knows, keyed by the OUTPUT item's consumable kind rather
// than a spell name, and ranked by restore-per-tick. At most one food and one drink.
export function conjuredProvisionsKnown(
  sb: SpellBook,
  ds: DataStore,
): { item: number; effect: 'food' | 'drink'; quality: number }[] {
  const best = new Map<'food' | 'drink', ConjurableProvision>();
  for (const p of conjurableProvisions(sb.known, ds)) {
    if (!best.has(p.effect)) best.set(p.effect, p);
  }
  return [...best.values()];
}

// Merge every party member's raid buffs and conjured provisions into a single apply-once plan.
// Deterministic: providers are considered in order and a tie keeps the earlier one.
export function planPrePull(casters: readonly PartyCaster[], ds: DataStore): PrePullPlan {
  const bestBuff = new Map<string, { buff: PlannedBuff; amount: number }>();
  for (const c of casters) {
    for (const b of groupBuffsKnown(c.spellbook, ds)) {
      const cur = bestBuff.get(b.family);
      if (cur && b.amount <= cur.amount) continue;
      const s = ds.spell(b.spellId)!;
      bestBuff.set(b.family, {
        amount: b.amount,
        buff: { spellId: b.spellId, name: s.name, durationMs: buffDurationMs(s), from: c.name },
      });
    }
  }
  // familyKey is the spell NAME, so the AoE half and the single-target half of one class buff
  // (Prayer of Spirit / Divine Spirit) plan as two. Cite: SpellMgr.h:1558-1563 IsSimilarAuraEffect.
  const buffs = [...dropWeakerMultirankSiblings(
    [...bestBuff.values()].map((v) => v.buff).sort((a, b) => a.name.localeCompare(b.name)),
    (id) => ds.spell(id),
  )];

  const handouts: PlannedHandout[] = [];
  const seenEffect = new Set<'food' | 'drink'>();
  for (const c of casters) {
    for (const p of conjuredProvisionsKnown(c.spellbook, ds)) {
      if (seenEffect.has(p.effect)) continue;
      seenEffect.add(p.effect);
      // One full stack of the best food + one of the best water — not HANDOUT_COUNT pieces
      // repeated across re-buffs (that was flooding inventory).
      const maxStack = Math.max(1, ds.item(p.item)?.stackable ?? 1);
      handouts.push({ item: p.item, count: maxStack * HANDOUT_STACKS, from: c.name });
    }
  }
  return { buffs, handouts };
}
