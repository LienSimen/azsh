// World-bot trade skills — the playerbots profession half, with exactly two complementary
// primaries, one secondary, and an enchanting rod tier that matches skill. Pure and deterministic.

import type { DataStore } from '../../data/dataStore.ts';
import type { SkillLine } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import type { Inventory } from '../items/inventory.ts';
import { addItem, countItem } from '../items/inventory.ts';
import { rankUpReqSkill } from '../professions/professions.ts';
import type { Rng } from '../../engine/core/rng.ts';
import { mulberry32, hashSeed } from '../../engine/core/rng.ts';

/** Seed salt for profession RNG stream — ASCII "prof". */
export const PROFESSION_SEED_SALT = 0x70726f66;

// ---- Complementary primary pairs (product list; must include classic matches) ----

/** Two distinct primary skill lines that complement each other. */
export type PrimaryPair = readonly [SkillLine, SkillLine];

// Allowed complementary pairs for a Random Character, picked uniformly: mining+BS, mining+eng,
// herbalism+alchemy, skinning+LW, tailoring+enchanting, plus two double-gather variants.
export const COMPLEMENTARY_PRIMARY_PAIRS: readonly PrimaryPair[] = [
  ['mining', 'blacksmithing'],
  ['mining', 'engineering'],
  ['herbalism', 'alchemy'],
  ['skinning', 'leatherworking'],
  ['tailoring', 'enchanting'],
  ['herbalism', 'enchanting'],
  ['mining', 'herbalism'],
];

/** Secondaries — pick exactly one (product: not all three like playerbots). */
export const SECONDARY_SKILLS: readonly SkillLine[] = ['cooking', 'firstaid', 'fishing'];

// ---- Tool item entries (PlayerbotFactory::InitInventorySkill) ----------------

/** Mining Pick. */
export const TOOL_MINING_PICK = 2901;
/** Blacksmith Hammer — BS or engineering. */
export const TOOL_BLACKSMITH_HAMMER = 5956;
/** Arclight Spanner — engineering. */
export const TOOL_ARCLIGHT_SPANNER = 6219;
/** Skinning Knife. */
export const TOOL_SKINNING_KNIFE = 7005;
/** Fishing Pole (product: bags only; not auto-equip ranged). */
export const TOOL_FISHING_POLE = 6256;

// Enchanting rods by min skill, an improvement over always-Arcanite: the highest tier whose
// minSkill ≤ current enchanting wins. Cite: profession-data.json enchantRods.
export const ENCHANTING_ROD_TIERS: readonly { minSkill: number; entry: number }[] = [
  { minSkill: 290, entry: 16207 }, // Runed Arcanite Rod
  { minSkill: 200, entry: 11145 }, // Runed Truesilver Rod
  { minSkill: 150, entry: 11130 }, // Runed Golden Rod
  { minSkill: 100, entry: 6339 },  // Runed Silver Rod
  { minSkill: 0, entry: 6218 },    // Runed Copper Rod
];

// ---- SetRandomSkill classic profession caps ---------------------------------

// Profession skill max at character level — PlayerbotFactory::SetRandomSkill classic / MANGOSBOT_ZERO
// branch (level gates 35 / 20 / 10).
export function professionSkillCap(level: number): number {
  const lvl = Math.max(1, Math.min(60, level | 0));
  if (lvl >= 35) return 300;
  if (lvl >= 20) return 225;
  if (lvl >= 10) return 150;
  return 75;
}

// ---- Trainer rank ladder (what a profession trainer teaches a companion) ----

/** A rung a companion trains at a profession trainer: it is the cap, not a recipe. */
export interface CompanionRank {
  rank: number;
  name: string;
  cap: number;
  /** Character level the trainer demands (secondaries open Apprentice at 1). */
  reqLevel: number;
  secondaryReqLevel: number;
}

// The four rungs every 1.12 profession shares, from profession-data.json `ranks` (all 12 lines carry
// the same caps and reqLevels). src/dev/capabilities/companionTrainerRanks.mjs holds it to the bake.
export const PROFESSION_RANK_LADDER: readonly CompanionRank[] = [
  { rank: 1, name: 'Apprentice', cap: 75, reqLevel: 5, secondaryReqLevel: 1 },
  { rank: 2, name: 'Journeyman', cap: 150, reqLevel: 10, secondaryReqLevel: 10 },
  { rank: 3, name: 'Expert', cap: 225, reqLevel: 20, secondaryReqLevel: 20 },
  { rank: 4, name: 'Artisan', cap: 300, reqLevel: 35, secondaryReqLevel: 35 },
];

/** Lines whose Apprentice rank opens at level 1 (cooking, first aid, fishing). */
function isSecondaryLine(line: SkillLine): boolean {
  return SECONDARY_SKILLS.includes(line);
}

// Highest rank a companion holds: each rung needs the trainer's level gate and, past Apprentice, the
// skill the player pays too (cap - 25 => 50/125/200). Free, like their trainer/vendor recipe catalog.
export function companionTrainedRank(
  line: SkillLine,
  skill: number,
  level: number,
): CompanionRank | undefined {
  const lvl = Math.max(1, Math.min(60, level | 0));
  const value = Math.max(0, skill | 0);
  const secondary = isSecondaryLine(line);
  let held: CompanionRank | undefined;
  for (const rung of PROFESSION_RANK_LADDER) {
    if (lvl < (secondary ? rung.secondaryReqLevel : rung.reqLevel)) break;
    if (held && value < rankUpReqSkill(held.cap)) break;
    held = rung;
  }
  return held;
}

// Ceiling a companion actually holds: their trained rank, never above the level cap. 0 = not yet
// trainable (a primary before level 5). Poisons is quest-learned and keeps the level cap.
export function companionSkillCap(line: SkillLine, skill: number, level: number): number {
  if (line === 'poisons') return professionSkillCap(level);
  const rank = companionTrainedRank(line, skill, level);
  return rank ? Math.min(professionSkillCap(level), rank.cap) : 0;
}

// Re-cap a skill map against the ranks trained. A line with no rank yet is dropped — an untrained
// profession is not a profession.
export function applyTrainedCaps(
  skills: Character['skills'],
  level: number,
): Character['skills'] {
  const out: Character['skills'] = {};
  for (const [key, cur] of Object.entries(skills) as Array<[SkillLine, { current: number; max: number } | undefined]>) {
    if (!cur) continue;
    const cap = companionSkillCap(key, cur.current, level);
    if (cap <= 0) continue;
    out[key] = { current: Math.max(1, Math.min(cap, cur.current)), max: cap };
  }
  return out;
}

// `urand(maxValue - level, maxValue)` then SetSkill(id, value, maxValue). Lo clamped to ≥ 1 when maxValue -
// level would be ≤ 0.
export function rollProfessionSkill(
  level: number,
  rng: Rng,
): { current: number; max: number } {
  const lvl = Math.max(1, Math.min(60, level | 0));
  const maxValue = professionSkillCap(lvl);
  const lo = Math.max(1, maxValue - lvl);
  const hi = maxValue;
  const current = lo > hi ? hi : rng.int(lo, hi);
  return { current, max: maxValue };
}

export function pickPrimaryPair(rng: Rng): PrimaryPair {
  const i = rng.int(0, COMPLEMENTARY_PRIMARY_PAIRS.length - 1);
  return COMPLEMENTARY_PRIMARY_PAIRS[i]!;
}

export function pickSecondary(rng: Rng): SkillLine {
  const i = rng.int(0, SECONDARY_SKILLS.length - 1);
  return SECONDARY_SKILLS[i]!;
}

/** Highest enchanting rod the skill value qualifies for. */
export function rodForEnchantingSkill(skill: number): number {
  const v = Math.max(0, skill | 0);
  for (const tier of ENCHANTING_ROD_TIERS) {
    if (v >= tier.minSkill) return tier.entry;
  }
  return 6218;
}

// ---- InitInventorySkill tools -----------------------------------------------

function storeOne(inv: Inventory, entry: number, ds: DataStore): Inventory {
  if (countItem(inv, entry) > 0) return inv;
  const it = ds.item(entry);
  if (!it) return inv;
  return addItem(inv, entry, 1, it.stackable ?? 1);
}

// PlayerbotFactory::InitInventorySkill — grant profession tools into bags when char.skills already
// has the matching lines. Idempotent, and the fishing pole stays in bags rather than equipped.
export function initInventorySkill(
  char: Character,
  inv: Inventory,
  ds: DataStore,
): Inventory {
  let out = inv;
  const sk = char.skills;
  if (sk.mining) out = storeOne(out, TOOL_MINING_PICK, ds);
  if (sk.blacksmithing || sk.engineering) out = storeOne(out, TOOL_BLACKSMITH_HAMMER, ds);
  if (sk.engineering) out = storeOne(out, TOOL_ARCLIGHT_SPANNER, ds);
  if (sk.skinning) out = storeOne(out, TOOL_SKINNING_KNIFE, ds);
  if (sk.fishing) out = storeOne(out, TOOL_FISHING_POLE, ds);
  if (sk.enchanting) {
    out = storeOne(out, rodForEnchantingSkill(sk.enchanting.current), ds);
  }
  return out;
}

// ---- Trainer recipes / enchants ---------------------------------------------

// Auto-grant trainer + vendor catalog recipes/enchants the skill can already use. Drop recipes are never
// granted (those need the item). Used by playerbots kits and companion profession sync.
export function learnNpcCatalog(
  char: Character,
  lines: SkillLine[],
  ds: DataStore,
): Character {
  const known = new Set(char.knownRecipes);
  const knownEnch = new Set(char.knownEnchants ?? []);
  const skillOf = (line: SkillLine): number => char.skills[line]?.current ?? 0;
  // npc_trainer.reqlevel (poison ranks). Unknown level = no gate, as before.
  const lvl = typeof char.level === 'number' ? char.level : Infinity;

  for (const line of lines) {
    const v = skillOf(line);
    if (v <= 0) continue;
    for (const r of ds.recipes()) {
      if (r.skill !== line) continue;
      // trainer + vendor only — never drop/quest recipe items.
      if (r.source !== 'trainer' && r.source !== 'vendor') continue;
      if (r.orange > v) continue;
      if ((r.reqLevel ?? 0) > lvl) continue;
      known.add(r.id);
    }
    if (line === 'enchanting') {
      for (const e of ds.enchants()) {
        if (e.source !== 'trainer' && e.source !== 'vendor') continue;
        if (e.orange > v) continue;
        knownEnch.add(e.id);
      }
    }
  }

  return {
    ...char,
    knownRecipes: [...known],
    knownEnchants: [...knownEnch],
  };
}

/** @deprecated alias — use learnNpcCatalog (now includes vendor rows). */
function learnTrainerRecipes(
  char: Character,
  lines: SkillLine[],
  ds: DataStore,
): Character {
  return learnNpcCatalog(char, lines, ds);
}

// Sync a companion's knownRecipes / knownEnchants from their skill map. Mutates the companion in place.
// Free catalog only (trainer + vendor).
export function syncCompanionProfessionCatalog(
  comp: { knownRecipes?: number[]; knownEnchants?: number[]; level?: number },
  skills: Character['skills'],
  ds: DataStore,
): void {
  const lines = Object.keys(skills) as SkillLine[];
  if (!lines.length) return;
  // Minimal shell — learnNpcCatalog only reads skills + known* lists.
  const shell = {
    skills,
    level: comp.level,
    knownRecipes: [...(comp.knownRecipes ?? [])],
    knownEnchants: [...(comp.knownEnchants ?? [])],
  } as Character;
  const next = learnNpcCatalog(shell, lines, ds);
  comp.knownRecipes = next.knownRecipes;
  comp.knownEnchants = next.knownEnchants;
}

// ---- Public: apply full profession kit --------------------------------------

export interface BotProfessionResult {
  char: Character;
  inventory: Inventory;
  primaries: [SkillLine, SkillLine];
  secondary: SkillLine;
}

// Just the skill lines a companion trained — no recipes, tools or inventory, because
// companionCharacter runs on every rotation build. `maxed` stamps each line at its level cap.
export function companionProfessionSkills(
  seed: number,
  level: number,
  opts: { maxed?: boolean } = {},
): Character['skills'] {
  const rng = mulberry32(hashSeed(seed, PROFESSION_SEED_SALT));
  const pair = pickPrimaryPair(rng);
  const secondary = pickSecondary(rng);
  const lvl = Math.max(1, Math.min(60, level | 0));
  const cap = professionSkillCap(lvl);
  const skills: Character['skills'] = {};
  for (const line of [pair[0], pair[1], secondary] as const) {
    skills[line] = opts.maxed ? { current: cap, max: cap } : rollProfessionSkill(lvl, rng);
  }
  return skills;
}

export function applyBotProfessions(
  char: Character,
  inv: Inventory,
  seed: number,
  ds: DataStore,
): BotProfessionResult {
  const rng = mulberry32(hashSeed(seed, PROFESSION_SEED_SALT));
  const pair = pickPrimaryPair(rng);
  const secondary = pickSecondary(rng);
  const level = Math.max(1, Math.min(60, char.level | 0));

  // Stamp skills: primary0, primary1, secondary (stable RNG order).
  const skills: Character['skills'] = { ...char.skills };
  for (const line of [pair[0], pair[1], secondary] as const) {
    skills[line] = rollProfessionSkill(level, rng);
  }

  let next: Character = {
    ...char,
    skills,
    knownRecipes: [...(char.knownRecipes ?? [])],
    knownEnchants: [...(char.knownEnchants ?? [])],
  };
  next = learnTrainerRecipes(next, [pair[0], pair[1], secondary], ds);
  const inventory = initInventorySkill(next, inv, ds);

  return {
    char: next,
    inventory,
    primaries: [pair[0], pair[1]],
    secondary,
  };
}
