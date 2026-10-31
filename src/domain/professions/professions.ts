// Professions: gathering and crafting. Pure and deterministic — every random outcome comes from an
// injected Rng. The gold, skill and bag math is here; what is reachable or stocked is the caller's.

import type { Character } from '../character/character.ts';
import type { Inventory } from '../items/inventory.ts';
import { addItem, addInstance, removeItem, countItem, canFit } from '../items/inventory.ts';
import { equippedEntry } from '../items/itemInstance.ts';
import { equipItem } from '../items/equipment.ts';
import type { LootDrop } from '../items/loot.ts';
import type { Rng } from '../../engine/core/rng.ts';
import type {
  RecipeDef, GatherNodeDef, ProfessionDef, ProfessionRank, SkillLine, SkillCurve,
} from '../../data/schema.ts';
import { SKILL_LINE_BY_ID } from '../../data/schema/profession.ts';
import type { DataStore } from '../../data/dataStore.ts';
import type { SpellBook } from '../character/spellbook.ts';
import { skillBonusFor } from '../character/characterRatings.ts';
import { createItemInstance, type CreateItemData, type CreateItemOpts } from '../items/createItem.ts';
import { INSTANT_POISON_R1, isPoisonsProfession } from './poisons.ts';
import { recipeCooldownRemainingMs, type CraftCooldownMaps } from './craftCooldown.ts';

export interface Check {
  ok: boolean;
  reason?: string;
}
export interface CharResult extends Check {
  char: Character;
}
export interface CraftResult extends Check {
  char: Character;
  inventory: Inventory;
  produced?: LootDrop; // what was made (on success)
  skillUp?: number;    // new skill value if a point was gained
}

// ---- The orange/yellow/green/gray skill-up curve --------------------------

/** WoW difficulty colour of an action at a given skill. 'locked' = below requirement. */
export type SkillColor = 'locked' | 'orange' | 'yellow' | 'green' | 'gray';

export function actionColor(skill: number, c: SkillCurve): SkillColor {
  if (skill < c.orange) return 'locked';
  if (skill < c.yellow) return 'orange';
  if (skill < c.green) return 'yellow';
  if (skill < c.gray) return 'green';
  return 'gray';
}

/** Chance (0..1) that an action of the given colour grants a skill point. */
export function skillUpChance(color: SkillColor): number {
  switch (color) {
    case 'orange': return 1;
    case 'yellow': return 0.66;
    case 'green': return 0.33;
    default: return 0; // gray / locked
  }
}

// How the skill-up chance is read off `curve`. 'auto' routes the way {@link gainSkill} does:
// mining/skinning take the gather shift, everything else the orange/yellow/green/gray colours.
export type SkillGainMode = 'auto' | 'craft' | 'gather';

// The chance in tenths of a percent a skill-up roll would use — the SAME number the grant then
// rolls against. 0 means no roll at all, and fishing is an accumulator, so 0 there is not a no.
export function skillGainTenths(
  line: SkillLine,
  cur: { current: number; max: number },
  curve: SkillCurve,
  mode: SkillGainMode = 'auto',
): number {
  if (cur.current >= cur.max) return 0;
  const how = mode !== 'auto'
    ? mode
    : (line === 'mining' || line === 'skinning')
      ? 'gather'
      : line === 'fishing'
        ? 'fishing'
        : 'craft';
  if (how === 'fishing') return 0;
  if (how === 'gather') {
    // SkillGainChance * Multiplicator(1), then >> (SkillValue / 75). Cite Player.cpp:5117, 5123.
    const base = gatherSkillGainChanceTenths(cur.current, curve.orange);
    return base >> Math.floor(cur.current / GATHER_SKILL_CHANCE_STEPS);
  }
  return Math.round(skillUpChance(actionColor(cur.current, curve)) * 1000);
}

// Roll a skill-up for `line` against `curve`, returning the advanced char and the new value. A cap
// or gray action is a no-op that consumes no randomness, so gray grinding cannot perturb the seed.
export function gainSkill(
  char: Character,
  line: SkillLine,
  curve: SkillCurve,
  rng: Rng,
): { char: Character; up?: number } {
  // Gather skill-ups for mining/skinning: Player.cpp UpdateGatherSkill (RedLevel = node orange).
  if (line === 'mining' || line === 'skinning') {
    return gainGatherSkill(char, line, curve.orange, rng);
  }
  // Fishing: Player.cpp UpdateFishingSkill — not a color curve.
  if (line === 'fishing') {
    const r = gainFishingSkill(char);
    return { char: r.char, up: r.up };
  }
  return gainCraftSkill(char, line, curve, rng);
}

// Craft or enchant skill-up on the color curve, with NO gather shift. Crafts must call this
// directly: a smelting recipe carries skill 'mining' and gainSkill would halve its ups.
export function gainCraftSkill(
  char: Character,
  line: SkillLine,
  curve: SkillCurve,
  rng: Rng,
): { char: Character; up?: number } {
  const cur = char.skills[line];
  if (!cur) return { char };
  const tenths = skillGainTenths(line, cur, curve, 'craft');
  if (tenths <= 0 || !rng.chance(tenths / 1000)) return { char };
  const value = cur.current + 1;
  return { char: { ...char, skills: { ...char.skills, [line]: { ...cur, current: value } } }, up: value };
}

// ---- Gather skill-up (CMaNGOS UpdateGatherSkill) ---------------------------
// Mining and skinning shift chance >> (SkillValue / 75). Cite: Player.cpp:5098–5126; World.cpp:631.

/** Classic SkillChance.MiningSteps / SkillChance.SkinningSteps default (World.cpp:631–632). */
export const GATHER_SKILL_CHANCE_STEPS = 75;

// CMaNGOS SkillGainChance in tenths of a percent for a 1..1000 roll, with gray = red+100,
// green = red+50, yellow = red+25. RedLevel 1 is rewritten to 5 so low nodes gray at 105.
export function gatherSkillGainChanceTenths(skillValue: number, redLevel: number): number {
  let red = redLevel;
  if (red === 1) red = 5; // Player.cpp:5104–5105
  const grayLevel = red + 100;
  const greenLevel = red + 50;
  const yellowLevel = red + 25;
  if (skillValue >= grayLevel) return 0;       // grey * 10
  if (skillValue >= greenLevel) return 25 * 10;
  if (skillValue >= yellowLevel) return 75 * 10;
  return 100 * 10; // orange
}

// Mining and skinning skill-up: the color chance from RedLevel, then chance >> (skill / 75).
// `redLevel` is the node's orange requirement. Pure — it uses the injected rng only.
export function gainGatherSkill(
  char: Character,
  line: SkillLine,
  redLevel: number,
  rng: Rng,
): { char: Character; up?: number } {
  const cur = char.skills[line];
  if (!cur) return { char };
  const chance = skillGainTenths(line, cur, { orange: redLevel, yellow: 0, green: 0, gray: 0 }, 'gather');
  // UpdateSkillPro: Chance <= 0 → miss without roll (Player.cpp:5170–5173).
  // irand(1,1000) <= Chance  ≡  uniform success probability Chance/1000.
  if (chance <= 0 || !rng.chance(chance / 1000)) return { char };
  const value = cur.current + 1;
  return { char: { ...char, skills: { ...char.skills, [line]: { ...cur, current: value } } }, up: value };
}

// ---- Fishing skill-up (CMaNGOS UpdateFishingSkill) -------------------------
// Cite: Player.cpp:5131–5163. m_fishingSteps is Character.fishingSteps, not a CharacterSkill.

/** Player.cpp:5131–5141 GetFishingStepsNeededToLevelUp. */
export function fishingStepsNeededToLevelUp(skillValue: number): number {
  if (skillValue < 75) return 1;
  if (skillValue <= 300) return Math.floor(skillValue / 44);
  return Math.floor(skillValue / 31);
}

// Exact fishing step accumulator: increment steps, and at stepsNeeded grant +1 and reset to 0.
// No RNG — the C++ UpdateSkillPro at 100*10 after the threshold always succeeds.
export function advanceFishingSkill(
  char: Character,
  steps: number,
): { char: Character; up?: number; steps: number } {
  const cur = char.skills.fishing;
  if (!cur || cur.current >= cur.max) return { char, steps: 0 };
  const needed = fishingStepsNeededToLevelUp(cur.current);
  const next = steps + 1;
  if (next < needed) return { char, steps: next };
  const value = cur.current + 1;
  return {
    char: { ...char, skills: { ...char.skills, fishing: { ...cur, current: value } } },
    up: value,
    steps: 0,
  };
}

// Live fishing skill-up: persist `m_fishingSteps` on the character. Cite: Player.cpp:5143–5163
// UpdateFishingSkill; UpdateSkillPro 100*10 always succeeds.
export function gainFishingSkill(char: Character): { char: Character; up?: number } {
  const r = advanceFishingSkill(char, char.fishingSteps ?? 0);
  return { char: { ...r.char, fishingSteps: r.steps }, up: r.up };
}

// ---- Gathering ------------------------------------------------------------

/** CMaNGOS skill-line id for a SkillLine key (mining=186, …). */
export function skillIdForLine(line: SkillLine): number | undefined {
  for (const [id, l] of Object.entries(SKILL_LINE_BY_ID)) {
    if (l === line) return Number(id);
  }
  return undefined;
}

// GetSkillValue for a profession line: pure trained + MOD_SKILL (SIE gloves / auras). Cite: Player.h
// GetSkillValue; SpellAuras HandleAuraModSkill; KI-935.
export function professionSkillValue(
  char: Character,
  line: SkillLine,
  ds?: DataStore | null,
  sb?: SpellBook | null,
): number | undefined {
  const pure = char.skills[line]?.current;
  if (pure == null) return undefined;
  if (!ds) return pure;
  const sid = skillIdForLine(line);
  return sid ? pure + skillBonusFor(char, ds, sid, sb) : pure;
}

/** @param skillValue optional GetSkillValue; defaults to trained current. Cite: KI-935. */
export function canGather(char: Character, node: GatherNodeDef, skillValue?: number): Check {
  const skill = char.skills[node.skill];
  if (!skill) return { ok: false, reason: `Requires ${node.skill}` };
  const value = skillValue ?? skill.current;
  if (value < node.orange) return { ok: false, reason: `Requires ${node.skill} skill ${node.orange}` };
  return { ok: true };
}

/** Roll a node's yields — each entry an independent chance, like ungrouped loot. */
export function rollGather(node: GatherNodeDef, rng: Rng): LootDrop[] {
  const out: LootDrop[] = [];
  for (const y of node.yield) {
    if (y.chance > 0 && rng.chance(y.chance / 100)) {
      out.push({ item: y.item, count: rng.int(y.minCount, y.maxCount) });
    }
  }
  return out;
}

// ---- Node charges & respawn (depletion) -----------------------------------
// Real counts are baked per node; these per-skill defaults only cover data predating that field.

/** Fallback respawn delay when a node doesn't bake its own `cooldownMs`. */
export const DEFAULT_GATHER_COOLDOWN_MS = 120_000; // 2 minutes
const DEFAULT_CHARGES: Partial<Record<SkillLine, [number, number]>> = {
  mining: [2, 4], herbalism: [1, 1], fishing: [3, 3], skinning: [1, 1],
};

/** Runtime state of a placed node: charges left on this spawn + when it respawns. */
export interface NodeState {
  charges: number; // harvests remaining before it depletes (0 => spent)
  readyAt: number; // ms timestamp the depleted node respawns (0 => already up)
}

/** The [min,max] harvests a fresh spawn of this node holds. */
export function nodeChargeRange(node: GatherNodeDef): [number, number] {
  return node.charges ?? DEFAULT_CHARGES[node.skill] ?? [1, 1];
}
/** Respawn delay for a depleted node. */
export function nodeCooldownMs(node: GatherNodeDef): number {
  return node.cooldownMs ?? DEFAULT_GATHER_COOLDOWN_MS;
}
/** Roll the charge count for a fresh spawn (random within the node's range). */
export function rollCharges(node: GatherNodeDef, rng: Rng): number {
  const [lo, hi] = nodeChargeRange(node);
  return rng.int(lo, hi);
}

// Whether a node can be harvested right now. A node never touched, or one still holding charges,
// is ready; a depleted one waits for readyAt and then respawns with re-rolled charges.
export function nodeReady(state: NodeState | undefined, nowMs: number): boolean {
  if (!state) return true;
  if (state.charges > 0) return true;
  return state.readyAt <= nowMs;
}
/** Ms until a depleted node respawns (0 if it's already available). */
export function respawnRemainingMs(state: NodeState | undefined, nowMs: number): number {
  if (nodeReady(state, nowMs)) return 0;
  return Math.max(0, state!.readyAt - nowMs);
}

/** ItemPrototype.h ITEM_SUBCLASS_WEAPON_FISHING_POLE. */
export const ITEM_SUBCLASS_WEAPON_FISHING_POLE = 20;

/** A fishing-pole item — typeName or weapon subclass 20, not a name regex (guns/grenades match that). */
export function isFishingPole(item: {
  typeName?: string;
  itemClass?: number;
  itemSubclass?: number;
  weaponSubclass?: number;
} | undefined): boolean {
  if (!item) return false;
  if (item.typeName === 'Fishing Pole') return true;
  if (item.weaponSubclass === ITEM_SUBCLASS_WEAPON_FISHING_POLE) return true;
  return item.itemClass === 2 && item.itemSubclass === ITEM_SUBCLASS_WEAPON_FISHING_POLE;
}

export function fishingPoleEquipped(char: Character, ds: DataStore): boolean {
  return Object.values(char.equipped).some((v) => {
    const e = equippedEntry(v);
    return e != null && isFishingPole(ds.item(e));
  });
}

export function fishingPoleBagEntry(inv: Inventory, ds: DataStore): number | undefined {
  for (const s of inv.stacks) {
    if (isFishingPole(ds.item(s.item))) return s.item;
  }
  return undefined;
}

// Equip a bagged pole when none is worn. Fishing spells require EquippedItem subclass 20. Cite: Spell.cpp
// TotemCategory / EquippedItem*; ItemPrototype.h subclass 20.
export function ensureFishingPoleEquipped(
  char: Character,
  inv: Inventory,
  ds: DataStore,
): { ok: true; char: Character; inventory: Inventory } | { ok: false } {
  if (fishingPoleEquipped(char, ds)) return { ok: true, char, inventory: inv };
  const entry = fishingPoleBagEntry(inv, ds);
  if (entry == null) return { ok: false };
  const res = equipItem(char, inv, ds, entry);
  if (!res.ok) return { ok: false };
  return { ok: true, char: res.char, inventory: res.inventory };
}

// Mining Pick (item 2901). Vanilla 1.12 requires one in bags or equipped to mine, and only one
// pick exists in Classic. Cite: item 2901 "Miners need a mining pick for digging."
export const MINING_PICK_ENTRY = 2901;

/** A Mining Pick item — entry 2901 or name match (bags or equipped both count). */
export function isMiningPick(item: { entry?: number; name?: string } | undefined): boolean {
  if (!item) return false;
  if (item.entry === MINING_PICK_ENTRY) return true;
  return /mining pick/i.test(item.name ?? '');
}

// Skinning Knife (item 7005), required in bags or equipped to skin — the same tool gate as the
// pick and the pole. Cite: SharedDefines.h TC_SKINNING_KNIFE=1; Spell.cpp TotemCategory.
export const SKINNING_KNIFE_ENTRY = 7005;

/** A Skinning Knife — entry 7005 or name match (bags or equipped both count). */
export function isSkinningKnife(item: { entry?: number; name?: string } | undefined): boolean {
  if (!item) return false;
  if (item.entry === SKINNING_KNIFE_ENTRY) return true;
  return /skinning knife/i.test(item.name ?? '');
}

// ---- Crafting -------------------------------------------------------------

// SpellFocusObject.dbc names for the refusal line. Only the ids recipes actually use. Cite:
// SpellFocusObject.dbc; measured on the 438 focus-requiring recipes.
const SPELL_FOCUS_NAME: Readonly<Record<number, string>> = {
  1: 'an anvil',
  3: 'a forge',
  4: 'a cooking fire',
  543: 'an alchemy lab',
  623: 'a gnomish toolbox',
  663: 'a goblin toolbox',
  883: 'an inscription table',
  1362: 'a moonwell',
};

// Totem1/2 item names. All 9 entries recipes use. Cite: item_template.name.
const TOOL_NAME: Readonly<Record<number, string>> = {
  5956: 'Blacksmith Hammer',
  6219: 'Arclight Spanner',
  10498: 'Gyromatic Micro-Adjustor',
  9149: "Philosopher's Stone",
  11145: 'Runed Truesilver Rod',
  6218: 'Runed Copper Rod',
  11130: 'Runed Golden Rod',
  16207: 'Runed Arcanite Rod',
  6339: 'Runed Silver Rod',
};

export function canCraft(
  char: Character,
  inv: Inventory,
  recipe: RecipeDef,
  // SpellFocusObject ids the crafter can reach right now, from the zone's craftingFocus. ABSENT
  // means no gate, so a caller that does not know where the player stands never refuses a craft.
  focusAvailable?: ReadonlySet<number> | null,
  // The world cooldown maps plus the clock to read them against. ABSENT means no cooldown gate, so
  // a caller that has no world state never refuses a craft.
  cooldowns?: (CraftCooldownMaps & { now: number }) | null,
  // Held tools the party can reach outside `inv` (partyHeldTools). A tool is never spent, so one
  // hammer or rod in any party bag serves every crafter.
  sharedTools?: ReadonlySet<number> | null,
): Check {
  if (!char.knownRecipes.includes(recipe.id)) return { ok: false, reason: 'Recipe not known' };
  const skill = char.skills[recipe.skill];
  if (!skill) return { ok: false, reason: `Requires ${recipe.skill}` };
  if (skill.current < recipe.orange) return { ok: false, reason: `Requires ${recipe.skill} skill ${recipe.orange}` };
  // Transmutes and Mooncloth sit on a real-time cooldown, the category one shared across all 12
  // transmutes. Cite: Spell.cpp:4571-4578 CheckCast IsSpellReady, ahead of CheckItems.
  if (cooldowns && recipeCooldownRemainingMs(recipe, cooldowns, cooldowns.now) > 0) {
    return { ok: false, reason: 'Not ready yet' };
  }
  for (const rg of recipe.reagents) {
    if (countItem(inv, rg.item) < rg.count) return { ok: false, reason: 'Missing reagents' };
  }
  // Tools are HELD, not spent: one of each Totem1/2 entry must be in the bags.
  // Cite: Spell.cpp:6599-6615 CheckItems → SPELL_FAILED_TOTEMS.
  for (const tool of recipe.requiredTools ?? []) {
    if (countItem(inv, tool) < 1 && !sharedTools?.has(tool)) {
      return { ok: false, reason: `Requires ${TOOL_NAME[tool] ?? `item ${tool}`}` };
    }
  }
  // A focus-requiring craft needs the object in reach, at zone granularity: 36 of 46 zones have an
  // anvil, so the refusal is "go to a town", not "this recipe is dead". Cite: Spell.cpp:5019.
  const focus = recipe.requiresSpellFocus ?? 0;
  if (focus > 0 && focusAvailable && !focusAvailable.has(focus)) {
    return { ok: false, reason: `Requires ${SPELL_FOCUS_NAME[focus] ?? `spell focus ${focus}`}` };
  }
  return { ok: true };
}

// Consume the reagents, produce the item, then roll a skill-up; a failure returns the inventory
// untouched. With createDs the product mints via createItemInstance and may roll a suffix first.
export function craft(
  char: Character,
  inv: Inventory,
  recipe: RecipeDef,
  productMaxStack: number,
  rng: Rng,
  cap?: number,
  createDs?: CreateItemData,
  lookupProp?: CreateItemOpts['lookupProp'],
  /** Reachable SpellFocusObject ids (the zone's `craftingFocus`). Absent = no focus gate. */
  focusAvailable?: ReadonlySet<number> | null,
  /** World cooldown maps + clock. Absent = no cooldown gate. The caller stamps them on success. */
  cooldowns?: (CraftCooldownMaps & { now: number }) | null,
  /** Held tools the party can reach outside `inv` (partyHeldTools). */
  sharedTools?: ReadonlySet<number> | null,
): CraftResult {
  const chk = canCraft(char, inv, recipe, focusAvailable, cooldowns, sharedTools);
  if (!chk.ok) return { ok: false, reason: chk.reason, char, inventory: inv };
  // Work on a copy so a bag-space failure after removing reagents can't corrupt the bags.
  let working = inv;
  for (const rg of recipe.reagents) working = removeItem(working, rg.item, rg.count)[0];
  // num_to_add = irand(baseDice, dieSides) + bp, clamped to the item's stack: Iron Grenade makes
  // 2-4, not a flat 2. Cite: SpellEffects.cpp:1971-1978; Object.cpp:2949.
  const pLo = Math.max(1, recipe.product.count | 0);
  const pHi = Math.max(pLo, (recipe.product.countMax ?? pLo) | 0);
  const produced = Math.min(productMaxStack, pHi > pLo ? rng.int(pLo, pHi) : pLo);
  if (!canFit(working, recipe.product.item, produced, productMaxStack, cap)) {
    return { ok: false, reason: 'Not enough bag space', char, inventory: inv };
  }
  if (createDs) {
    const inst = createItemInstance(
      recipe.product.item,
      produced,
      createDs,
      rng,
      { lookupProp },
    );
    working = addInstance(working, inst, productMaxStack);
  } else {
    working = addItem(working, recipe.product.item, produced, productMaxStack);
  }
  // Crafts stay on the color curve even when recipe.skill is a gather line (e.g. smelting
  // is skill:'mining'): use gainCraftSkill directly so the gather >>(skill/75) shift never applies.
  const gain = gainCraftSkill(char, recipe.skill, recipe, rng);
  return {
    ok: true, char: gain.char, inventory: working,
    produced: { item: recipe.product.item, count: produced }, skillUp: gain.up,
  };
}

// ---- Trainers: learning professions and recipes ---------------------------

/** The rank the character currently holds in a profession (undefined if untrained). */
export function currentRank(char: Character, prof: ProfessionDef): ProfessionRank | undefined {
  const cur = char.skills[prof.id];
  if (!cur) return undefined;
  let best: ProfessionRank | undefined;
  for (const r of prof.ranks) if (r.cap <= cur.max) best = r;
  return best ?? prof.ranks[0];
}

/** The next rank the character could train (undefined if untrained → the first rank). */
export function nextRank(char: Character, prof: ProfessionDef): ProfessionRank | undefined {
  if (isPoisonsProfession(prof.id)) return undefined;
  const cur = char.skills[prof.id];
  return cur ? prof.ranks.find((r) => r.cap > cur.max) : prof.ranks[0];
}

// ---- Secondary book-only ranks (vanilla 1.12) --------------------------------
// Cooking, First Aid and Fishing trainers teach ranks 1–2 only; Expert and Artisan come from books.

/** Journeyman skill cap — highest secondary rank taught by profession trainers. */
export const SECONDARY_TRAINER_MAX_CAP = 150;

/** True when this secondary rank is only obtainable from a tier book, not a trainer. */
export function isSecondaryBookOnlyRank(prof: ProfessionDef, rank: ProfessionRank): boolean {
  return prof.kind === 'secondary' && rank.cap > SECONDARY_TRAINER_MAX_CAP;
}

/** Next rank a profession *trainer* can teach (secondaries stop at Journeyman). */
export function nextTrainerRank(char: Character, prof: ProfessionDef): ProfessionRank | undefined {
  const next = nextRank(char, prof);
  if (!next || isSecondaryBookOnlyRank(prof, next)) return undefined;
  return next;
}

// ---- Rank-up skill gates (classic npc_trainer.reqskillvalue) ----------------
// Journeyman, Expert and Artisan need 50 / 125 / 200 — 25 under the current cap. Apprentice needs 0.

/** Points below the current rank's skill cap required to train the next rank. */
export const RANK_UP_SKILL_MARGIN = 25;

// Minimum profession skill to train the next rank while holding `currentMax` as the cap: 75 → 50,
// 150 → 125, 225 → 200. Returns 0 on a first learn or a non-positive margin.
export function rankUpReqSkill(currentMax: number): number {
  if (currentMax <= 0) return 0;
  return Math.max(0, (currentMax | 0) - RANK_UP_SKILL_MARGIN);
}

// Effective skill requirement for training `next` while holding `cur`, undefined when untrained.
// Prefers the baked next.reqSkill when it is present and above 0, else the classic margin.
export function nextRankReqSkill(
  next: ProfessionRank,
  cur: { current: number; max: number } | undefined,
): number {
  if (!cur) return 0; // first rank — no prior skill
  const baked = (next.reqSkill ?? 0) | 0;
  if (baked > 0) return baked;
  return rankUpReqSkill(cur.max);
}

// ---- Primary profession cap (CMaNGOS MaxPrimaryTradeSkill) -----------------
// Default 2. Primary is the Profession skill category; cooking, first aid and fishing are exempt.

/** Classic default MaxPrimaryTradeSkill (World.cpp:583). */
export const MAX_PRIMARY_PROFESSIONS = 2;

/** Skill lines that count toward the primary-profession cap (gathering + crafting). */
const PRIMARY_SKILL_LINES: readonly SkillLine[] = [
  'mining', 'herbalism', 'skinning',
  'blacksmithing', 'leatherworking', 'tailoring',
  'alchemy', 'engineering', 'enchanting',
];

/** True when this profession counts as primary (not cooking/firstaid/fishing). */
export function isPrimaryProfession(prof: ProfessionDef): boolean {
  return prof.kind === 'gathering' || prof.kind === 'crafting';
}

/** How many primary profession lines the character has already trained. */
export function countPrimaryProfessions(char: Character): number {
  let n = 0;
  for (const line of PRIMARY_SKILL_LINES) if (char.skills[line]) n++;
  return n;
}

// Learn a profession's first rank or raise its cap, paying the cost. opts.free skips the charge
// for the tier-book path, where the vendor already took the book's price. Cite: Player.cpp:3410.
export function trainProfession(
  char: Character,
  prof: ProfessionDef,
  opts?: { free?: boolean; discountMod?: number },
): CharResult {
  if (isPoisonsProfession(prof.id)) {
    return { ok: false, reason: 'Poisons is learned from a quest', char };
  }
  const cur = char.skills[prof.id];
  const next = nextRank(char, prof);
  if (!next) return { ok: false, reason: 'Nothing more to train here', char };
  // Trainer path: secondary Expert/Artisan are book-only (KI-758). Book path passes free.
  if (isSecondaryBookOnlyRank(prof, next) && !opts?.free) {
    return { ok: false, reason: `${next.name} ${prof.name} is learned from a book`, char };
  }
  if (char.level < next.reqLevel) return { ok: false, reason: `Requires level ${next.reqLevel}`, char };
  const price = opts?.free ? 0 : Math.floor(next.cost * (opts?.discountMod ?? 1.0));
  if (char.gold < price) return { ok: false, reason: 'Not enough money', char };
  // Rank-up skill gate (Player.cpp:3985–3987 GetTrainerSpellState reqSkillValue).
  // Apprentice has no prior skill; Journeyman/Expert/Artisan need 50/125/200.
  const needSkill = nextRankReqSkill(next, cur);
  if (needSkill > 0 && (cur?.current ?? 0) < needSkill) {
    return { ok: false, reason: `Requires ${prof.name} skill ${needSkill}`, char };
  }
  // First rank of a new primary profession only — upgrades and secondaries skip the cap.
  // Cite: Player.cpp IsPrimaryProfessionFirstRankSpell + MaxPrimaryTradeSkill (World.cpp:583).
  if (!cur && isPrimaryProfession(prof) && countPrimaryProfessions(char) >= MAX_PRIMARY_PROFESSIONS) {
    return { ok: false, reason: 'You may only learn 2 primary professions', char };
  }
  // A brand-new profession starts at skill 1; an upgrade keeps the current value.
  const skills = { ...char.skills, [prof.id]: { current: cur?.current ?? 1, max: next.cap } };
  return { ok: true, char: { ...char, gold: char.gold - price, skills } };
}

// Unlearn a profession: drop the skill line and every recipe for it, free, releasing a primary
// slot. Applied gear enchants stay — you only lose the ability to apply new ones.
export function unlearnProfession(
  char: Character,
  prof: ProfessionDef,
  recipes: readonly RecipeDef[],
): CharResult {
  if (!char.skills[prof.id]) {
    return { ok: false, reason: `You don't know ${prof.name}`, char };
  }
  if (isPoisonsProfession(prof.id)) {
    return { ok: false, reason: 'You cannot unlearn Poisons', char };
  }
  const skills = { ...char.skills };
  delete skills[prof.id];
  // Forget every craft recipe for this line (trainer, vendor, drop, quest — all of them).
  const dropRecipe = new Set(recipes.filter((r) => r.skill === prof.id).map((r) => r.id));
  const knownRecipes = char.knownRecipes.filter((id) => !dropRecipe.has(id));
  // Enchant formulas live only on the Enchanting skill; wipe them with the profession.
  const knownEnchants = prof.id === 'enchanting' ? [] : char.knownEnchants;
  return {
    ok: true,
    char: {
      ...char,
      skills,
      knownRecipes,
      ...(knownEnchants !== undefined ? { knownEnchants } : {}),
    },
  };
}

// Trainer-source recipes for a profession line. The bake pins each recipe to one representative
// trainer entry, so matching on entry alone left most capital trainers empty — match on skill.
export function trainerRecipesForSkill(recipes: readonly RecipeDef[], skill: SkillLine): RecipeDef[] {
  return recipes.filter((r) => r.skill === skill && r.source === 'trainer');
}

// Free apprentice starters: orange ≤ 1 trainer recipes not yet known, granted when the line is
// first trained or repaired on an older save. Cite: Player LearnSkillRewardedSpells.
export function grantStarterRecipes(
  char: Character,
  skill: SkillLine,
  recipes: readonly RecipeDef[],
): { char: Character; granted: RecipeDef[] } {
  if (!char.skills[skill]) return { char, granted: [] };
  const granted = trainerRecipesForSkill(recipes, skill).filter((r) => {
    if (char.knownRecipes.includes(r.id)) return false;
    if (skill === 'poisons') return r.id === INSTANT_POISON_R1;
    return (r.orange | 0) <= 1;
  });
  if (!granted.length) return { char, granted: [] };
  return {
    char: { ...char, knownRecipes: [...char.knownRecipes, ...granted.map((r) => r.id)] },
    granted,
  };
}

// Learn a recipe, paying its cost. The trainer path also needs skill ≥ orange; reading a Recipe
// item does not, since craft still gates on orange. See game.learnRecipeFromItem.
export function learnRecipe(
  char: Character,
  recipe: RecipeDef,
  opts?: { fromItem?: boolean; discountMod?: number },
): CharResult {
  if (char.knownRecipes.includes(recipe.id)) return { ok: false, reason: 'Already learned', char };
  const skill = char.skills[recipe.skill];
  if (!skill) return { ok: false, reason: `Requires ${recipe.skill}`, char };
  // Classic trainer gate only — not applied when learning from a world-drop / vendor recipe item.
  if (!opts?.fromItem && skill.current < recipe.orange) {
    return { ok: false, reason: `Requires ${recipe.skill} skill ${recipe.orange}`, char };
  }
  // npc_trainer.reqlevel, the second half of the trainer gate. Poison ranks carry a real one, and
  // skill alone let a level-20 rogue at Poisons 100 buy the level-24 rank.
  // Cite: Player.cpp:3970 GetTrainerSpellState level check.
  const needLevel = recipe.reqLevel ?? 0;
  if (!opts?.fromItem && needLevel > 0 && char.level < needLevel) {
    return { ok: false, reason: `Requires level ${needLevel}`, char };
  }
  const cost = Math.floor((recipe.cost ?? 0) * (opts?.discountMod ?? 1.0));
  if (char.gold < cost) return { ok: false, reason: 'Not enough money', char };
  return { ok: true, char: { ...char, gold: char.gold - cost, knownRecipes: [...char.knownRecipes, recipe.id] } };
}
