// What a spell reagent is FOR: the non-craft spells that spend it, the classes that cast those, and
// the book that teaches one. Party-independent, so a shaman reagent reads as one with no shaman here.
// Cite: spell_template.Reagent1..8; SkillLineAbility.classMask (Player.cpp:18369
// IsSpellFitByClassAndRace); SpellEffects.cpp:2445 EffectLearnSpell.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef, SpellDef } from '../../data/schema.ts';
import { itemTeachIntent } from './itemTeaches.ts';

/** SPELL_EFFECT_CREATE_ITEM / ENCHANT_ITEM / ENCHANT_ITEM_TEMPORARY. Cite: SharedDefines.h:24/53/54. */
const EFFECT_CREATE_ITEM = 24;
const EFFECT_ENCHANT_ITEM = 53;
const EFFECT_ENCHANT_ITEM_TEMPORARY = 54;

/** Highest classic class id, so a classMask walk stops at Druid. Cite: SharedDefines.h CLASS_DRUID 11. */
const MAX_CLASS_ID = 11;

// A craft spends reagents to mint or enchant an item and buys vendor rows itself (258922bf5).
// Enchanting is effect 53, not 24 — those dusts are trade goods, never a spell reagent.
export function isCraftSpell(sp: SpellDef): boolean {
  if (!(sp.reagents ?? []).some((r) => r.item > 0)) return false;
  const raw = sp.rawEffects ?? [];
  if (raw.length) {
    return raw.some((e) =>
      e.effect === EFFECT_CREATE_ITEM
      || e.effect === EFFECT_ENCHANT_ITEM
      || e.effect === EFFECT_ENCHANT_ITEM_TEMPORARY);
  }
  return (sp.effects ?? []).some((e) =>
    e.kind === 'conjure' || e.kind === 'enchant_item_perm' || e.kind === 'enchant_held_item');
}

export interface ReagentSpender {
  spell: number;
  /** Classes this spell's SLA classMask lets cast it. Empty = no mask restricts it. */
  classes: readonly number[];
}

export interface ReagentDemand {
  /** Non-craft spells that list this item, lowest spell level first. */
  spenders: readonly ReagentSpender[];
  /** Union of the spenders' classes, so a wrong-class seat can be named and refused. */
  classes: readonly number[];
}

const DEMAND = new WeakMap<DataStore, Map<number, ReagentDemand>>();
const SPENDERS = new WeakMap<DataStore, ReadonlySet<number>>();

function demandIndex(ds: DataStore): Map<number, ReagentDemand> {
  const hit = DEMAND.get(ds);
  if (hit) return hit;
  const meta = ds.combatSkillMeta?.();
  const spellsOf = new Map<number, SpellDef[]>();
  for (const sp of ds.allSpells()) {
    if (isCraftSpell(sp)) continue;
    for (const r of sp.reagents ?? []) {
      if (!(r.item > 0)) continue;
      const arr = spellsOf.get(r.item);
      if (arr) arr.push(sp);
      else spellsOf.set(r.item, [sp]);
    }
  }
  const classesOf = (spellId: number): number[] => {
    let mask = 0;
    for (const ab of meta?.spellAbilities?.[spellId] ?? []) mask |= ab.classMask | 0;
    const out: number[] = [];
    for (let cls = 1; cls <= MAX_CLASS_ID; cls++) if (mask & (1 << (cls - 1))) out.push(cls);
    return out;
  };
  const out = new Map<number, ReagentDemand>();
  for (const [item, sps] of spellsOf) {
    sps.sort((a, b) => (a.spellLevel ?? 0) - (b.spellLevel ?? 0) || a.id - b.id);
    const spenders = sps.map((sp) => ({ spell: sp.id, classes: classesOf(sp.id) }));
    const classes = [...new Set(spenders.flatMap((sp) => sp.classes))].sort((a, b) => a - b);
    // No classMask anywhere is a world spell, not a class reagent: Linen Cloth is spent by
    // Defias Disguise (5169) and belongs in nobody's spellbook kit.
    if (!classes.length) continue;
    out.set(item, { spenders, classes });
  }
  DEMAND.set(ds, out);
  return out;
}

/** Whether any non-craft spell spends this item. One map lookup — called per item per seat. */
export function spendsAsReagent(ds: DataStore, entry: number): boolean {
  return demandIndex(ds).has(entry);
}

/** Every item a non-craft spell spends. */
export function reagentSpenders(ds: DataStore): ReadonlySet<number> {
  let set = SPENDERS.get(ds);
  if (!set) SPENDERS.set(ds, (set = new Set(demandIndex(ds).keys())));
  return set;
}

/** What spends this item, or undefined when no class spell does. */
export function reagentDemand(ds: DataStore, entry: number): ReagentDemand | undefined {
  return demandIndex(ds).get(entry);
}

/** The lowest-rank spell of `cls` that spends this item — the one a blocked row should name. */
export function reagentSpellFor(ds: DataStore, entry: number, cls: number): number | undefined {
  const spenders = demandIndex(ds).get(entry)?.spenders ?? [];
  return spenders.find((sp) => sp.classes.includes(cls))?.spell;
}

type BookIndex = { catalogSize: number; bySpell: Map<number, number> };
const BOOKS = new WeakMap<DataStore, BookIndex>();

// Keyed on the catalogue size, because attachItems merges the lazy chunk in after boot and a memo
// built off the keep set alone would answer "no book" forever. Cite: playerbotEquipCache.ts:44.
function bookIndex(ds: DataStore): Map<number, number> {
  const catalogSize = ds.items().length;
  const hit = BOOKS.get(ds);
  if (hit && hit.catalogSize === catalogSize) return hit.bySpell;
  const bySpell = new Map<number, number>();
  for (const it of ds.items()) {
    if (it.useSpell == null) continue;
    const teach = itemTeachIntent(it, ds);
    if (teach?.kind !== 'spell' || bySpell.has(teach.id)) continue;
    bySpell.set(teach.id, it.entry);
  }
  BOOKS.set(ds, { catalogSize, bySpell });
  return bySpell;
}

/** The book whose on-use teaches `spellId`, when the catalogue holds one. */
export function spellTeachBook(ds: DataStore, spellId: number): ItemDef | undefined {
  const entry = bookIndex(ds).get(spellId | 0);
  return entry != null ? ds.item(entry) : undefined;
}
