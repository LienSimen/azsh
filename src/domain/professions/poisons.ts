// Rogue Poisons as a quest-unlocked secondary profession (craft vials, then coat weapons).
// Cite: SkillLine 40; Player.cpp UpdateSpellTrainedSkills SKILL_POISONS; quest 2359 RewSpellCast 2995→2842.

import type { ProfessionDef, RecipeDef, SkillLine, SpellDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { SKILL_LOCKPICKING, SKILL_POISONS } from '../character/combatSkills.ts';
import { skillMaxForLevel } from '../../engine/combat/mitigation.ts';

/** Spell 2842 "Poisons" — TRADE_SKILL. Alliance 2359 RewSpell; LEARN stub 2995 teaches it. */
export const POISONS_SKILL_SPELL = 2842;
/** LEARN stub Alliance 2359 RewSpellCast. Cite: src_spell_template 2995 EffectTriggerSpell1=2842. */
export const POISONS_LEARN_STUB = 2995;
/** Instant Poison r1 craft. spell_learn_spell 2842→8681; SLA learnOnGetSkill=1. */
export const INSTANT_POISON_R1 = 8681;
/** Instant Poison item the r1 craft produces. */
export const INSTANT_POISON_ITEM = 6947;
/** Alliance terminal poison quest. Cite: src_quest_template 2359 RewSpell=2842 RewSpellCast=2995. */
export const ALLIANCE_POISON_QUEST = 2359;
/** Horde terminal poison quest. ClassicDB RewSpell=0; twin of 2359. */
export const HORDE_POISON_QUEST = 2478;
/** Blind 2094 reagent. Cite: src_spell_template 2094 Reagent1=5530. */
export const BLINDING_POWDER_ITEM = 5530;
export const BLIND_SPELL = 2094;

export const POISONS_LINE: SkillLine = 'poisons';

export const POISONS_PROFESSION: ProfessionDef = {
  id: 'poisons',
  name: 'Poisons',
  kind: 'secondary',
  icon: 'ability_poisons',
  ranks: [{ rank: 1, name: '', cap: 300, reqLevel: 20, cost: 0 }],
};

/** SkillLineAbility skill 40 + npc_trainer.reqskillvalue + EffectItemType1. */
const POISON_CRAFT_SLA: Readonly<Record<number, {
  orange: number; yellow: number; gray: number; product: number; count?: number;
}>> = {
  8681: { orange: 1, yellow: 125, gray: 175, product: 6947 },
  8687: { orange: 120, yellow: 165, gray: 215, product: 6949 },
  8691: { orange: 160, yellow: 205, gray: 255, product: 6950 },
  11341: { orange: 200, yellow: 245, gray: 295, product: 8926 },
  11342: { orange: 240, yellow: 285, gray: 335, product: 8927 },
  11343: { orange: 280, yellow: 325, gray: 375, product: 8928 },
  2835: { orange: 130, yellow: 175, gray: 225, product: 2892 },
  2837: { orange: 170, yellow: 215, gray: 265, product: 2893 },
  11357: { orange: 210, yellow: 255, gray: 305, product: 8984 },
  11358: { orange: 250, yellow: 295, gray: 345, product: 8985 },
  25347: { orange: 275, yellow: 300, gray: 350, product: 20844 },
  3420: { orange: 1, yellow: 125, gray: 175, product: 3775 },
  3421: { orange: 230, yellow: 275, gray: 325, product: 3776 },
  5763: { orange: 100, yellow: 150, gray: 200, product: 5237 },
  8694: { orange: 170, yellow: 215, gray: 265, product: 6951 },
  11400: { orange: 240, yellow: 285, gray: 335, product: 9186 },
  13220: { orange: 140, yellow: 185, gray: 235, product: 10918 },
  13228: { orange: 180, yellow: 225, gray: 275, product: 10920 },
  13229: { orange: 220, yellow: 265, gray: 315, product: 10921 },
  13230: { orange: 260, yellow: 305, gray: 355, product: 10922 },
  6510: { orange: 150, yellow: 170, gray: 220, product: 5530, count: 3 },
};

const POISON_REAGENT_FALLBACK: Readonly<Record<number, { item: number; count: number }[]>> = {
  8681: [{ item: 2928, count: 1 }, { item: 3371, count: 1 }],
  8687: [{ item: 2928, count: 3 }, { item: 3372, count: 1 }],
  6510: [{ item: 3818, count: 1 }],
};

const POISON_TRAINER_COST: Readonly<Record<number, number>> = {
  8687: 8000, 8691: 16000, 11341: 29000, 11342: 46000, 11343: 54000,
  2835: 10000, 2837: 18000, 11357: 31000, 11358: 48000,
  3420: 3000, 3421: 35000,
  5763: 5000, 8694: 18000, 11400: 46000,
  13220: 12000, 13228: 20000, 13229: 33000, 13230: 50000,
  6510: 14000,
};

// npc_trainer.reqlevel per poison rank (tables/trainers.json rows on rogue trainers, same values as
// each vial's item_template.RequiredLevel). Skill alone let a level-20 rogue buy the level-24 rank.
const POISON_TRAINER_REQLEVEL: Readonly<Record<number, number>> = {
  8687: 28, 8691: 36, 11341: 44, 11342: 52, 11343: 60,
  2835: 30, 2837: 38, 11357: 46, 11358: 54,
  3420: 20, 3421: 50,
  5763: 24, 8694: 38, 11400: 52,
  13220: 32, 13228: 40, 13229: 48, 13230: 56,
  6510: 34,
};

export function poisonsSkillCap(level: number): number {
  return skillMaxForLevel(level);
}

export function isPoisonsProfession(line: SkillLine | string): boolean {
  return line === 'poisons';
}

export function isPoisonQuest(entry: number): boolean {
  return entry === ALLIANCE_POISON_QUEST || entry === HORDE_POISON_QUEST;
}

export function isPoisonsSkillSpell(spellId: number): boolean {
  return spellId === POISONS_SKILL_SPELL || spellId === POISONS_LEARN_STUB;
}

export function isPoisonCraftRecipe(recipe: { skill: SkillLine } | undefined): boolean {
  return recipe?.skill === 'poisons';
}

export function isPoisonConjureName(name: string | undefined): boolean {
  return /\b(instant|deadly|crippling|mind-numbing|wound)\s+poison\b/i.test(name ?? '')
    || /^blinding powder$/i.test(name ?? '');
}

/** Player lockpicking for lock GATES: the trained line, or undefined if they never learned it. */
export function playerLockpickingForLocks(char: {
  cls: number;
  level: number;
  combatSkills?: { [id: number]: { current: number } | undefined };
}): number | undefined {
  const v = char.combatSkills?.[SKILL_LOCKPICKING]?.current;
  return v && v > 0 ? v : undefined;
}

export function raisePoisonsCapForLevel(char: Character): Character {
  const cur = char.skills.poisons;
  if (!cur) return char;
  const max = poisonsSkillCap(char.level);
  if (cur.max === max && cur.current <= max) return char;
  return {
    ...char,
    skills: { ...char.skills, poisons: { current: Math.min(cur.current, max), max } },
  };
}

function dropCombatPoisons(char: Character): Character {
  if (!char.combatSkills?.[SKILL_POISONS]) return char;
  const combatSkills = { ...char.combatSkills };
  delete combatSkills[SKILL_POISONS];
  return { ...char, combatSkills };
}

export function grantPoisonsProfession(
  char: Character,
  recipes: readonly RecipeDef[],
): Character {
  let next = dropCombatPoisons(char);
  if (!next.skills.poisons) {
    next = {
      ...next,
      skills: { ...next.skills, poisons: { current: 1, max: poisonsSkillCap(next.level) } },
    };
  } else {
    next = raisePoisonsCapForLevel(next);
  }
  if (
    recipes.some((r) => r.id === INSTANT_POISON_R1)
    && !next.knownRecipes.includes(INSTANT_POISON_R1)
  ) {
    next = { ...next, knownRecipes: [...next.knownRecipes, INSTANT_POISON_R1] };
  }
  return next;
}

export function patchPoisonQuestReward(q: { entry: number; rewSpells?: number[]; rewSpellCast?: number }): {
  entry: number;
  rewSpells?: number[];
  rewSpellCast?: number;
} {
  if (q.entry !== HORDE_POISON_QUEST) return q;
  if ((q.rewSpells?.length ?? 0) > 0 || ((q.rewSpellCast ?? 0) | 0) > 0) return q;
  return { ...q, rewSpells: [POISONS_SKILL_SPELL] };
}

function conjureProduct(sp: SpellDef): { item: number; count: number; countMax?: number } | null {
  const e = (sp.effects ?? []).find((x) => x.kind === 'conjure');
  if (!e || e.kind !== 'conjure' || !(e.item | 0)) return null;
  const out: { item: number; count: number; countMax?: number } = {
    item: e.item | 0,
    count: Math.max(1, e.count | 0),
  };
  if ((e.countMax ?? 0) > out.count) out.countMax = e.countMax;
  return out;
}

export function poisonRecipeFromSpell(sp: SpellDef): RecipeDef | null {
  const sla = POISON_CRAFT_SLA[sp.id];
  if (!sla) return null;
  const product = conjureProduct(sp) ?? {
    item: sla.product,
    count: Math.max(1, sla.count ?? 1),
  };
  const reagents = (sp.reagents ?? []).filter((r) => (r.item | 0) > 0 && (r.count | 0) > 0);
  const mats = reagents.length ? reagents : (POISON_REAGENT_FALLBACK[sp.id] ?? []);
  if (!product.item || !mats.length) return null;
  const cost = POISON_TRAINER_COST[sp.id] ?? 0;
  const y = sla.yellow;
  const g = sla.gray;
  return {
    id: sp.id,
    skill: 'poisons',
    name: sp.name,
    product,
    reagents: mats,
    orange: sla.orange,
    yellow: y,
    green: Math.floor((y + g) / 2),
    gray: g,
    source: cost > 0 || sla.orange <= 1 ? 'trainer' : 'drop',
    cost,
    ...(POISON_TRAINER_REQLEVEL[sp.id] ? { reqLevel: POISON_TRAINER_REQLEVEL[sp.id] } : {}),
    ...(sp.id === 25347 ? { recipeItem: 21302 } : {}),
  };
}

export function collectPoisonRecipes(spellOf: (id: number) => SpellDef | undefined): RecipeDef[] {
  const out: RecipeDef[] = [];
  for (const id of Object.keys(POISON_CRAFT_SLA)) {
    const sp = spellOf(Number(id));
    if (!sp) continue;
    const rec = poisonRecipeFromSpell(sp);
    if (rec) out.push(rec);
  }
  return out;
}

export function ensurePoisonsProfessionSlice(opts: {
  professions: ProfessionDef[];
  recipes: RecipeDef[];
  spellOf: (id: number) => SpellDef | undefined;
}): { professions: ProfessionDef[]; recipes: RecipeDef[] } {
  let professions = opts.professions;
  if (!professions.some((p) => p.id === 'poisons')) {
    professions = [...professions, POISONS_PROFESSION];
  }
  let recipes = opts.recipes;
  if (!recipes.some((r) => r.skill === 'poisons')) {
    const extra = collectPoisonRecipes(opts.spellOf);
    if (extra.length) recipes = [...recipes, ...extra];
  }
  return { professions, recipes };
}
