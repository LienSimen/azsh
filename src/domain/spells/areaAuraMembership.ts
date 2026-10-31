// Out-of-combat membership for party AREA AURAS: one exists on you only while its holder is in your
// subgroup. SpellAuras.cpp:591-620 runs that remove arm on every effect-35 aura, timed or not.

import type { SpellDef } from '../../data/schema.ts';
import type { ActiveAura } from '../character/character.ts';

/** SPELL_EFFECT_APPLY_AREA_AURA_PARTY. Cite: SpellEffectDefines.h = 35. */
const EFFECT_APPLY_AREA_AURA_PARTY = 35;
/** DurationIndex 21 = until cancelled. Cite: SpellMgr.cpp negative Duration. */
const DURATION_INDEX_UNTIL_CANCELLED = 21;

function effectApplyTo(e: SpellDef['effects'][number]): string | undefined {
  return 'applyTo' in e ? (e as { applyTo?: string }).applyTo : undefined;
}

function effectDurationMs(e: SpellDef['effects'][number]): number {
  return 'durationMs' in e ? ((e as { durationMs?: number }).durationMs ?? 0) : 0;
}

// True when this spell places a party AREA aura: any effect-35 row, or a baked party buff with no
// clock. Battle Shout is effect 6 with party targets, never an area aura, and stays when its holder leaves.
export function isPartyAreaAura(sp: SpellDef | undefined): boolean {
  if (!sp) return false;
  if (sp.effects.some((e) => effectApplyTo(e) === 'party' && !(effectDurationMs(e) > 0))) {
    return true;
  }
  return (sp.rawEffects ?? []).some((r) => (r.effect | 0) === EFFECT_APPLY_AREA_AURA_PARTY);
}

// The CLASS-A subset: an area aura with no clock at all (DurationIndex 21), so its only end is the
// holder leaving. Trueshot Aura is an area aura with a 30 min clock and is not in this set.
export function isContinuousPartyAura(sp: SpellDef | undefined): boolean {
  if (!isPartyAreaAura(sp)) return false;
  if (sp!.effects.some((e) => effectApplyTo(e) === 'party' && !(effectDurationMs(e) > 0))) {
    return true;
  }
  return (sp!.durationIndex ?? 0) === DURATION_INDEX_UNTIL_CANCELLED;
}

// Every aura id the spell can place on the party: a totem summon contributes its kit ability ids,
// since the aura that lands on you is the kit spell, and a direct party aura contributes its own.
export function auraIdsSuppliedBySpell(sp: SpellDef | undefined): number[] {
  if (!sp) return [];
  const out: number[] = [];
  for (const e of sp.effects) {
    if (e.kind === 'summon_totem') {
      for (const ab of e.abilities ?? []) out.push(ab.id);
      for (const ab of e.triggerAbilities ?? []) out.push(ab.id);
    }
  }
  if (isPartyAreaAura(sp)) out.push(sp.id);
  return out;
}

/** Union of the aura ids every listed party member can currently supply. */
export function partySuppliedAuraIds(
  memberSpellIds: readonly (readonly number[])[],
  spell: (id: number) => SpellDef | undefined,
): Set<number> {
  const out = new Set<number>();
  for (const ids of memberSpellIds) {
    for (const id of ids) {
      for (const auraId of auraIdsSuppliedBySpell(spell(id))) out.add(auraId);
    }
  }
  return out;
}

// Drop area auras nobody in the current subgroup can supply any more, even when the bake stamped
// a fake duration. Same-name ranks count as supplied. Returns the same array when nothing dropped.
export function dropUnsourcedAreaAuras(
  auras: readonly ActiveAura[] | undefined,
  opts: {
    spell: (id: number) => SpellDef | undefined;
    /** Aura ids the current subgroup (self + pet + same-group squad) can still place. */
    supplied: ReadonlySet<number>;
  },
): ActiveAura[] {
  const list = auras ?? [];
  const suppliedNames = new Set<string>();
  for (const id of opts.supplied) {
    const n = opts.spell(id)?.name;
    if (n) suppliedNames.add(n);
  }
  const kept = list.filter((a) => {
    if (opts.supplied.has(a.spellId)) return true;
    const sp = opts.spell(a.spellId);
    if (!isPartyAreaAura(sp)) return true;
    if (sp?.name && suppliedNames.has(sp.name)) return true;
    return false;
  });
  return kept.length === list.length ? (list as ActiveAura[]) : kept;
}
