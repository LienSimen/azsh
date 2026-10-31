import type { EnchantDef, ItemDef, RecipeDef, SpellDef } from '../../data/schema.ts';
import {
  SPELL_EFFECT_CREATE_ITEM,
  SPELL_EFFECT_ENCHANT_ITEM,
  SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY,
  SPELL_EFFECT_LEARN_SPELL,
  SPELL_EFFECT_SKILL,
} from '../../engine/spells/interpreter/opcodes.ts';

// What reading an item teaches. `unavailable` is an honest refusal, not a failed classification:
// the row it needs is not in this bake, so the item must be kept rather than consumed.
export type ItemTeach =
  | { kind: 'recipe'; id: number }
  | { kind: 'enchant'; id: number }
  | { kind: 'petSpell'; id: number }
  | { kind: 'spell'; id: number }
  /** A profession tier book (Expert Cookbook → Cooking step 3). `rank` is 1-based. */
  | { kind: 'profRank'; id: number; rank: number }
  | { kind: 'unavailable'; id: number; what: 'recipe' | 'enchant' | 'skill' };

/** The DataStore slice needed to resolve a teach intent. */
export type TeachLookup = {
  spell(id: number): SpellDef | undefined;
  recipe(id: number): RecipeDef | undefined;
  enchant(id: number): EnchantDef | undefined;
};

// The teach fields the ETL bakes onto an item — 817 of them. Cheap and lookup-free, but it sees
// only what the bake stamped, so prefer itemTeachIntent where a wrong answer destroys the item.
export function itemTeaches(it: ItemDef | undefined | null): ItemTeach | undefined {
  if (!it) return undefined;
  if (it.teachPetSpell != null) return { kind: 'petSpell', id: it.teachPetSpell };
  if (it.teachRecipe != null) return { kind: 'recipe', id: it.teachRecipe };
  if (it.teachEnchant != null) return { kind: 'enchant', id: it.teachEnchant };
  return undefined;
}

// Everything an on-use item can teach, ALWAYS resolved before any generic on-use path: a recipe is
// an ordinary ON_USE item, so a dispatch testing useSpell first ate the book and taught nothing.
export function itemTeachIntent(
  it: ItemDef | undefined | null,
  ds: TeachLookup,
): ItemTeach | undefined {
  if (!it) return undefined;
  const baked = itemTeaches(it);
  if (baked) return baked;
  if (it.useSpell == null) return undefined;
  const stub = ds.spell(it.useSpell);
  const learn = (stub?.rawEffects ?? []).find(
    (e) => e.effect === SPELL_EFFECT_LEARN_SPELL && e.triggerSpell > 0,
  );
  if (!learn) return undefined;
  const taught = learn.triggerSpell;
  if (ds.recipe(taught)) return { kind: 'recipe', id: taught };
  if (ds.enchant(taught)) return { kind: 'enchant', id: taught };
  // The taught spell's own effect says which catalog the missing row belongs to, so the refusal can
  // name it. ENCHANT_ITEM 53 is unmapped and CREATE_ITEM 24 bakes as conjure — neither is a spell.
  const taughtRaw = ds.spell(taught)?.rawEffects ?? [];
  const skill = taughtRaw.find((e) => e.effect === SPELL_EFFECT_SKILL);
  if (skill) {
    // EffectBasePoints + 1 = the skill step this book grants (Expert Cookbook 3413 → step 3).
    // Cite: Player.cpp:5664 training->step; SpellMgr.cpp:1108 IsProfessionSpell.
    return { kind: 'profRank', id: taught, rank: (skill.basePoints | 0) + 1 };
  }
  if (taughtRaw.some((e) => e.effect === SPELL_EFFECT_ENCHANT_ITEM || e.effect === SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY)) {
    return { kind: 'unavailable', id: taught, what: 'enchant' };
  }
  if (ds.spell(taught)) return { kind: 'spell', id: taught };
  if (taughtRaw.some((e) => e.effect === SPELL_EFFECT_CREATE_ITEM)) {
    return { kind: 'unavailable', id: taught, what: 'recipe' };
  }
  return { kind: 'unavailable', id: taught, what: 'skill' };
}

/** Human-readable refusal for a teach target this bake has no row for. */
export function unavailableTeachReason(what: 'recipe' | 'enchant' | 'skill'): string {
  return what === 'enchant'
    ? 'That formula is not in the game yet'
    : what === 'recipe'
      ? 'That recipe is not in the game yet'
      : 'That skill is not in the game yet';
}
