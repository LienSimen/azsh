// Combat weapon and defense skill state at CMaNGOS parity (Item.cpp GetSkill; Player.cpp
// LearnDefaultSkills, UpdateWeaponSkill; Skill* DBCs). Professions stay on Character.skills.

import type { ItemDef } from '../../data/schema.ts';
import { skillMaxForLevel } from '../../engine/combat/mitigation.ts';
import { detLog } from '../../engine/core/detMath.ts';

/** One skill's trained value + cap. Same shape as profession CharacterSkill. */
export interface CombatSkillProgress {
  current: number;
  max: number;
}

/** Sparse map: CMaNGOS skill id → progress. Only trained lines present. */
export type CombatSkillMap = Partial<Record<number, CombatSkillProgress>>;

/** Create-kit skill row (from playercreateinfo_skills, expanded per race/class). */
export interface CreateSkillRow {
  skill: number;
  step: number;
}

// Optional DBC-backed meta (SkillLine / SkillTiers / SkillRaceClassInfo + spell↔skill links). Baked by
// enrich-combat-skills.mjs / extract.mjs; fixtures may omit (hardcoded fallbacks apply).
export interface CombatSkillMeta {
  /** SkillLine.categoryId by skill id */
  categories?: Record<number, number>;
  /** SkillLine display name by skill id (for Character Skills UI) */
  skillNames?: Record<number, string>;
  /** SkillTiers.maxSkillValue[0..15] by skillTiersId */
  tiers?: Record<number, number[]>;
  /** SkillRaceClassInfo rows used for mono/rank create + SetSkillStep + train flags */
  raceClass?: Array<{
    skillId: number;
    raceMask: number;
    classMask: number;
    flags: number;
    skillTierId: number;
    /** SkillRaceClassInfo.reqLevel (m_minLevel) — train gate when > 0 */
    reqLevel?: number;
  }>;
  // Spell → skill for SkillLineAbility with learnOnGetSkill = ABILITY_LEARNED_ON_GET_RACE_OR_CLASS_SKILL
  // (2). Cite: Player.cpp UpdateSpellTrainedSkills ~5722
  spellGrants?: Record<number, number>;
  // Spell → { skill, step } from SPELL_EFFECT_SKILL (118) / SKILL_STEP (44). Cite:
  // SpellMgr::LoadSpellLearnSkills; SetSkillStep
  spellLearnSkills?: Record<number, { skill: number; step: number }>;
  // SkillLineAbility rows keyed by spell id (raceMask, classMask, skillId), read by
  // IsSpellFitByClassAndRace for trainer lists and train gates. Cite: Player.cpp ~18369.
  spellAbilities?: Record<number, Array<{ skillId: number; raceMask: number; classMask: number }>>;
  // spell_learn_spell: learning `entry` auto-teaches the listed SpellIDs, e.g. Poisons 2842 →
  // Instant Poison craft 8681. Cite: Player.cpp addSpell ~3412 SpellLearnSpellMapBounds.
  spellLearnSpells?: Record<number, number[]>;
}

/** SharedDefines.h SKILL_POISONS / SKILL_LOCKPICKING — special-cased in UpdateSpellTrainedSkills. */
export const SKILL_POISONS = 40;
export const SKILL_LOCKPICKING = 633;

// ---- Skill ids (SharedDefines.h) used in combat / create kits --------------

export const COMBAT_SKILL = {
  SWORDS: 43,
  AXES: 44,
  BOWS: 45,
  GUNS: 46,
  MACES: 54,
  SWORDS_2H: 55,
  DEFENSE: 95,
  FERAL: 134,
  STAVES: 136,
  MACES_2H: 160,
  UNARMED: 162,
  AXES_2H: 172,
  DAGGERS: 173,
  THROWN: 176,
  CROSSBOWS: 226,
  WANDS: 228,
  POLEARMS: 229,
  /** Armor material skills — Item.cpp item_armor_skills */
  PLATE: 293,
  MAIL: 413,
  LEATHER: 414,
  CLOTH: 415,
  SHIELD: 433,
  FIST: 473,
} as const;

/** SharedDefines.h SkillCategory */
export const SKILL_CATEGORY = {
  WEAPON: 6,
  CLASS: 7,
  ARMOR: 8,
  SECONDARY: 9,
  LANGUAGES: 10,
  PROFESSION: 11,
  GENERIC: 12,
} as const;

/** SkillRaceClassInfo flags — DBCEnums.h SkillRaceClassInfoFlags */
export const SKILL_FLAG_MAXIMIZED = 0x010;
/** SKILL_FLAG_NOT_TRAINABLE — cannot learn via trainer when race/class row matches */
export const SKILL_FLAG_NOT_TRAINABLE = 0x100;

/** SkillLineAbility learnOnGetSkill */
export const ABILITY_LEARNED_ON_GET_RACE_OR_CLASS_SKILL = 2;

export type SkillRangeType = 'language' | 'level' | 'mono' | 'rank' | 'none';

// Weapon subclass → skill id. Fist maps to UNARMED for the combat skill value while the equip
// gate uses FIST (skillIdForEquip). Cite: Item.cpp item_weapon_skills.
const WEAPON_SUBCLASS_SKILL: readonly number[] = [
  COMBAT_SKILL.AXES,       // 0
  COMBAT_SKILL.AXES_2H,    // 1
  COMBAT_SKILL.BOWS,       // 2
  COMBAT_SKILL.GUNS,       // 3
  COMBAT_SKILL.MACES,      // 4
  COMBAT_SKILL.MACES_2H,   // 5
  COMBAT_SKILL.POLEARMS,   // 6
  COMBAT_SKILL.SWORDS,     // 7
  COMBAT_SKILL.SWORDS_2H,  // 8
  0,                       // 9 obsolete
  COMBAT_SKILL.STAVES,     // 10
  0,                       // 11
  0,                       // 12
  COMBAT_SKILL.UNARMED,    // 13 fist → unarmed for combat
  0,                       // 14 misc
  COMBAT_SKILL.DAGGERS,    // 15
  COMBAT_SKILL.THROWN,     // 16
  253,                     // 17 spear / assassination (SKILL_ASSASSINATION)
  COMBAT_SKILL.CROSSBOWS,  // 18
  COMBAT_SKILL.WANDS,      // 19
  356,                     // 20 fishing pole (SKILL_FISHING) — excluded from weapon gain
];

/** Armor subclass → skill (Item.cpp item_armor_skills). Index = item_template.subclass. */
const ARMOR_SUBCLASS_SKILL: readonly number[] = [
  0,                       // 0 misc
  COMBAT_SKILL.CLOTH,      // 1
  COMBAT_SKILL.LEATHER,    // 2
  COMBAT_SKILL.MAIL,       // 3
  COMBAT_SKILL.PLATE,      // 4
  0,                       // 5 buckler (unused classic)
  COMBAT_SKILL.SHIELD,     // 6
  0, 0, 0,                 // libram/idol/totem
];

/** typeName labels from extract.mjs → skill (fixtures / pre-subclass bakes). */
const TYPE_NAME_SKILL: Record<string, number> = {
  Axe: COMBAT_SKILL.AXES,
  'Two-Handed Axe': COMBAT_SKILL.AXES_2H,
  Bow: COMBAT_SKILL.BOWS,
  Gun: COMBAT_SKILL.GUNS,
  Mace: COMBAT_SKILL.MACES,
  'Two-Handed Mace': COMBAT_SKILL.MACES_2H,
  Polearm: COMBAT_SKILL.POLEARMS,
  Sword: COMBAT_SKILL.SWORDS,
  'Two-Handed Sword': COMBAT_SKILL.SWORDS_2H,
  Staff: COMBAT_SKILL.STAVES,
  'Fist Weapon': COMBAT_SKILL.UNARMED,
  Dagger: COMBAT_SKILL.DAGGERS,
  Thrown: COMBAT_SKILL.THROWN,
  Crossbow: COMBAT_SKILL.CROSSBOWS,
  Wand: COMBAT_SKILL.WANDS,
  'Fishing Pole': 356,
  Cloth: COMBAT_SKILL.CLOTH,
  Leather: COMBAT_SKILL.LEATHER,
  Mail: COMBAT_SKILL.MAIL,
  Plate: COMBAT_SKILL.PLATE,
  Shield: COMBAT_SKILL.SHIELD,
};

// Fallback LEVEL-range skills when SkillLine DBC meta is absent. Cite: GetSkillRangeType — WEAPON except
// fist; defense/unarmed; poisons/lockpicking LEVEL.
const LEVEL_RANGE_SKILLS = new Set<number>([
  COMBAT_SKILL.SWORDS,
  COMBAT_SKILL.AXES,
  COMBAT_SKILL.BOWS,
  COMBAT_SKILL.GUNS,
  COMBAT_SKILL.MACES,
  COMBAT_SKILL.SWORDS_2H,
  COMBAT_SKILL.DEFENSE,
  COMBAT_SKILL.FERAL,
  COMBAT_SKILL.STAVES,
  COMBAT_SKILL.MACES_2H,
  COMBAT_SKILL.UNARMED,
  COMBAT_SKILL.AXES_2H,
  COMBAT_SKILL.DAGGERS,
  COMBAT_SKILL.THROWN,
  COMBAT_SKILL.CROSSBOWS,
  COMBAT_SKILL.WANDS,
  COMBAT_SKILL.POLEARMS,
  253, // spear
]);

/** Language skill ids in create kits — grant 300/300, no combat use. */
const LANGUAGE_SKILLS = new Set<number>([
  98, 109, 111, 113, 115, 137, 138, 139, 140, 141, 313, 315, 673,
]);

/** Fishing pole skill — UpdateWeaponSkill excludes fishing poles. */
const SKILL_FISHING = 356;

/** ITEM_SUBCLASS_WEAPON_FIST */
const WEAPON_SUBCLASS_FIST = 13;

// ---- Lookups ----------------------------------------------------------------

// Skill line for an item (weapon combat skill or armor material). 0 if none. Cite: Item.cpp GetSkill — fist
// weapons return UNARMED here.
export function skillIdForItem(item: ItemDef | undefined | null): number {
  if (!item) return 0;
  if (item.weaponSubclass != null && item.weaponSubclass >= 0) {
    const id = WEAPON_SUBCLASS_SKILL[item.weaponSubclass] ?? 0;
    return id | 0;
  }
  if (item.armorSubclass != null && item.armorSubclass >= 0) {
    const id = ARMOR_SUBCLASS_SKILL[item.armorSubclass] ?? 0;
    return id | 0;
  }
  if (item.typeName && TYPE_NAME_SKILL[item.typeName] != null) {
    return TYPE_NAME_SKILL[item.typeName]!;
  }
  return 0;
}

// Skill required to *equip* the item (CanUseItem proficiency gate). Fist weapons require SKILL_FIST_WEAPONS
// (473), not unarmed. Cite: Player.cpp CanUseItem ~9756–9762
export function skillIdForEquip(item: ItemDef | undefined | null): number {
  if (!item) return 0;
  if (item.weaponSubclass === WEAPON_SUBCLASS_FIST || item.typeName === 'Fist Weapon') {
    return COMBAT_SKILL.FIST;
  }
  return skillIdForItem(item);
}

/** GetSkillRangeType port. Cite: ObjectMgr.cpp GetSkillRangeType ~8569 */
export function skillRangeType(skillId: number, meta?: CombatSkillMeta | null, racial = false): SkillRangeType {
  const id = skillId | 0;
  if (!id) return 'none';
  if (isLanguageSkill(id)) return 'language';

  const cat = meta?.categories?.[id];
  if (cat != null) {
    switch (cat) {
      case SKILL_CATEGORY.LANGUAGES:
        return 'language';
      case SKILL_CATEGORY.WEAPON:
        // Fist is mono; all other weapons level-range.
        return id === COMBAT_SKILL.FIST ? 'mono' : 'level';
      case SKILL_CATEGORY.ARMOR:
      case SKILL_CATEGORY.CLASS:
        // Poisons (40) / lockpicking (633) are LEVEL; others MONO.
        if (id === 40 || id === 633) return 'level';
        return 'mono';
      case SKILL_CATEGORY.SECONDARY:
      case SKILL_CATEGORY.PROFESSION:
        // Profession/riding → RANK (handled on Character.skills); other secondary → mono/none.
        if (racial) return 'none';
        return 'mono';
      default:
        return 'none';
    }
  }

  // Fallback without DBC: hardcoded LEVEL set + known mono armor/fist.
  if (LEVEL_RANGE_SKILLS.has(id)) return 'level';
  if (
    id === COMBAT_SKILL.FIST
    || id === COMBAT_SKILL.CLOTH
    || id === COMBAT_SKILL.LEATHER
    || id === COMBAT_SKILL.MAIL
    || id === COMBAT_SKILL.PLATE
    || id === COMBAT_SKILL.SHIELD
  ) {
    return 'mono';
  }
  // Unknown create-kit lines (class skills, etc.) → mono proficiency presence.
  return 'mono';
}

export function isLevelRangeCombatSkill(skillId: number, meta?: CombatSkillMeta | null): boolean {
  return skillRangeType(skillId, meta) === 'level';
}

export function isLanguageSkill(skillId: number): boolean {
  return LANGUAGE_SKILLS.has(skillId | 0);
}

// Race/class mask check for playercreateinfo_skills / SkillRaceClassInfo. mask 0 = all; else bit (1 << (id
// - 1)).
export function raceClassMaskMatches(mask: number, id: number): boolean {
  if (!mask) return true;
  if (id < 1) return false;
  return (mask & (1 << (id - 1))) !== 0;
}

/** Player getRaceMask / getClassMask: `1 << (id - 1)`. */
export function unitRaceOrClassMask(id: number): number {
  if (id < 1) return 0;
  return 1 << (id - 1);
}

// True when SkillLineAbility has a nonzero classMask. No row / classMask 0 fail-opens in C++. Cite:
// Player.cpp:18369 IsSpellFitByClassAndRace.
export function spellHasClassRestrictingAbility(
  spellId: number,
  meta?: CombatSkillMeta | null,
): boolean {
  const abilities = meta?.spellAbilities?.[spellId | 0];
  if (!abilities?.length) return false;
  return abilities.some((a) => (a.classMask | 0) !== 0);
}

// Whether a spell can be trained for this race and class, a port of IsSpellFitByClassAndRace plus
// the SkillRaceClassInfo line gate — without which a Rogue learns Evocation from a Mage (KI-083).
export function isSpellFitByClassAndRace(
  spellId: number,
  race: number,
  cls: number,
  meta?: CombatSkillMeta | null,
  level?: number,
): boolean {
  const sid = spellId | 0;
  if (!sid) return false;
  const abilities = meta?.spellAbilities?.[sid];
  // C++: bounds.first == bounds.second → true (no SLA restriction).
  if (!abilities?.length) return true;

  const raceMask = unitRaceOrClassMask(race);
  const classMask = unitRaceOrClassMask(cls);

  for (const ability of abilities) {
    // skip wrong race skills
    if (ability.raceMask && (ability.raceMask & raceMask) === 0) continue;
    // skip wrong class skills
    if (ability.classMask && (ability.classMask & classMask) === 0) continue;

    const skillId = ability.skillId | 0;
    // SLA classMask 0 = unrestricted on the class axis, but the skill line may still
    // be class-restricted. Cite: SkillRaceClassInfo; KI-083 Evocation 12051 / skill 237.
    if (!(ability.classMask | 0) && skillId && meta?.raceClass?.length) {
      if (!raceClassCanLearnSkill(meta, skillId, race, cls, level)) continue;
    }

    // Matching SLA — SkillRaceClassInfo may still block (NOT_TRAINABLE / reqLevel).
    const rows = meta?.raceClass;
    if (rows?.length && skillId) {
      for (const skillRC of rows) {
        if ((skillRC.skillId | 0) !== skillId) continue;
        // C++ uses raw & (does not treat 0 as "all") on SkillRaceClassInfo masks.
        if ((skillRC.raceMask & raceMask) === 0) continue;
        if ((skillRC.classMask & classMask) === 0) continue;
        if ((skillRC.flags & SKILL_FLAG_NOT_TRAINABLE) !== 0) return false;
        const req = (skillRC.reqLevel ?? 0) | 0;
        if (level != null && req > 0 && level < req) return false;
      }
    }
    return true;
  }
  return false;
}

// Can this race/class EVER learn `skillId`? Strict — unlike lookupRaceClass it does not fall back
// to other classes' rows. Fail-open when the meta predates the bake.
export function raceClassCanLearnSkill(
  meta: CombatSkillMeta | undefined | null,
  skillId: number,
  race: number,
  cls: number,
  level?: number,
): boolean {
  const rows = meta?.raceClass;
  if (!rows?.length) return true;
  const id = skillId | 0;
  return rows.some((r) =>
    (r.skillId | 0) === id
    && raceClassMaskMatches(r.raceMask | 0, race)
    && raceClassMaskMatches(r.classMask | 0, cls)
    && (level == null || ((r.reqLevel ?? 0) | 0) <= level));
}

function lookupRaceClass(
  meta: CombatSkillMeta | undefined | null,
  skillId: number,
  race?: number,
  cls?: number,
): CombatSkillMeta['raceClass'] extends (infer E)[] | undefined ? E | undefined : never {
  const rows = meta?.raceClass;
  if (!rows?.length) return undefined as never;
  for (const row of rows) {
    if ((row.skillId | 0) !== (skillId | 0)) continue;
    if (race != null && !raceClassMaskMatches(row.raceMask | 0, race)) continue;
    if (cls != null && !raceClassMaskMatches(row.classMask | 0, cls)) continue;
    return row as never;
  }
  // Prefer a universal row if race/class not supplied.
  return rows.find((r) => (r.skillId | 0) === (skillId | 0)) as never;
}

// Initial progress for a create skill: LANGUAGE 300/300, LEVEL-range 1 of L×5, MONO/RANK the
// SkillTiers max at step, MAXIMIZED value = max. Cite: Player.cpp LearnDefaultSkills.
export function initialCreateSkillProgress(
  skillId: number,
  level: number,
  step: number,
  meta?: CombatSkillMeta | null,
  race?: number,
  cls?: number,
): CombatSkillProgress {
  const range = skillRangeType(skillId, meta);
  if (range === 'language') return { current: 300, max: 300 };
  if (range === 'level') {
    const max = skillMaxForLevel(level);
    // Product cheat: Lockpicking sits at cap. The open gate reads this value, never a bypass.
    return { current: skillId === SKILL_LOCKPICKING ? max : 1, max };
  }
  if (range === 'mono' || range === 'rank') {
    const predefined = (step | 0) !== 0;
    const stepN = predefined ? (step | 0) : 1;
    const stepIndex = Math.max(0, stepN - 1);
    const rc = lookupRaceClass(meta, skillId, race, cls);
    if (rc?.skillTierId) {
      const tierMax = meta?.tiers?.[rc.skillTierId]?.[stepIndex];
      if (tierMax != null && tierMax > 0) {
        const maxed = (rc.flags & SKILL_FLAG_MAXIMIZED) !== 0;
        let value = 1;
        if (maxed) value = tierMax;
        else if (predefined) value = Math.max(1, (level - 1) * 5);
        return { current: Math.min(value, tierMax), max: tierMax };
      }
    }
    if (rc && (rc.flags & SKILL_FLAG_MAXIMIZED) !== 0) {
      const max = skillMaxForLevel(level);
      return { current: max, max };
    }
    // No tiers → proficiency 1/1 (classic mono default).
    return { current: 1, max: 1 };
  }
  return { current: 1, max: 1 };
}

/** Expand create-kit skill rows into a combat skill map for a new character. */
export function grantCreateCombatSkills(
  rows: CreateSkillRow[],
  level: number,
  meta?: CombatSkillMeta | null,
  race?: number,
  cls?: number,
): CombatSkillMap {
  const out: CombatSkillMap = {};
  for (const row of rows) {
    const id = row.skill | 0;
    if (!id || out[id] || id === SKILL_POISONS) continue;
    out[id] = initialCreateSkillProgress(id, level, row.step | 0, meta, race, cls);
  }
  // Defense + unarmed are universal in create kits (raceMask=0 classMask=0). Ensure present.
  if (!out[COMBAT_SKILL.DEFENSE]) {
    out[COMBAT_SKILL.DEFENSE] = initialCreateSkillProgress(COMBAT_SKILL.DEFENSE, level, 0, meta, race, cls);
  }
  if (!out[COMBAT_SKILL.UNARMED]) {
    out[COMBAT_SKILL.UNARMED] = initialCreateSkillProgress(COMBAT_SKILL.UNARMED, level, 0, meta, race, cls);
  }
  return out;
}

// On level-up: raise max for SKILL_RANGE_LEVEL skills; keep current (unless already at old max). Cite:
// Player.cpp UpdateSkillsForLevel — non-maxed: val stays, max → new L×5; skip max==1 mono.
export function updateCombatSkillsForLevel(
  map: CombatSkillMap | undefined,
  level: number,
  meta?: CombatSkillMeta | null,
): CombatSkillMap | undefined {
  if (!map) return map;
  const maxNew = skillMaxForLevel(level);
  const out: CombatSkillMap = { ...map };
  for (const key of Object.keys(out)) {
    const id = Number(key);
    const s = out[id];
    if (!s) continue;
    if (!isLevelRangeCombatSkill(id, meta)) continue;
    if (s.max === 1) continue; // mono sentinel
    const wasMaxed = s.current >= s.max || id === SKILL_LOCKPICKING;
    out[id] = {
      current: wasMaxed ? maxNew : Math.min(s.current, maxNew),
      max: maxNew,
    };
  }
  return maxLockpickingSkill(out, level);
}

// Armor proficiencies SkillRaceClassInfo unlocks at a level. Nothing else added them, so warriors
// never learned Plate Mail (293) and hunters never Mail (413), both reqLevel 40. Armor only.
export function grantLevelUnlockedArmorSkills(
  map: CombatSkillMap | undefined,
  level: number,
  race: number,
  cls: number,
  meta?: CombatSkillMeta | null,
): CombatSkillMap | undefined {
  if (map == null) return map;
  const rows = meta?.raceClass;
  if (!rows?.length) return map;
  let out = map;
  for (const row of rows) {
    const id = row.skillId | 0;
    if (!id || out[id]) continue;
    if (!ARMOR_SUBCLASS_SKILL.includes(id)) continue;
    const req = (row.reqLevel ?? 0) | 0;
    if (req <= 0 || req > level) continue;
    if (!raceClassMaskMatches(row.raceMask | 0, race)) continue;
    if (!raceClassMaskMatches(row.classMask | 0, cls)) continue;
    if (out === map) out = { ...map };
    out[id] = initialCreateSkillProgress(id, level, 0, meta, race, cls);
  }
  return out;
}

// Snap listed skill lines to L×5 (level-range only), for XP-leveled characters that never swung.
// An absent map stays undefined, meaning legacy fully trained. Cite: Unit.h GetSkillMaxForLevel.
export function raiseCombatSkillsToLevelCap(
  map: CombatSkillMap | undefined,
  level: number,
  skillIds: readonly number[],
  meta?: CombatSkillMeta | null,
): CombatSkillMap | undefined {
  if (map == null) return map;
  const max = skillMaxForLevel(level);
  let out = map;
  let changed = false;
  for (const raw of skillIds) {
    const id = raw | 0;
    if (!id) continue;
    const existing = out[id];
    if (existing) {
      if (existing.max === 1 && !isLevelRangeCombatSkill(id, meta)) continue;
      if (existing.current === max && existing.max === max) continue;
      if (!changed) {
        out = { ...out };
        changed = true;
      }
      out[id] = { current: max, max };
      continue;
    }
    if (!isLevelRangeCombatSkill(id, meta)) continue;
    if (!changed) {
      out = { ...out };
      changed = true;
    }
    out[id] = { current: max, max };
  }
  return out;
}

// Pure skill value from the map. An absent map (legacy save) is fully trained L×5; a present map
// missing the skill is 0. Callers add bonuses. Cite: Player.h GetSkillValuePure.
export function combatSkillValue(
  map: CombatSkillMap | undefined,
  skillId: number,
  level: number,
): number {
  if (map == null) return skillMaxForLevel(level);
  if (!skillId) return 0;
  const s = map[skillId];
  if (!s) return 0;
  return s.current | 0;
}

// GetSkillValue = pure trained + skill bonuses (racial / talent / equip MOD_SKILL). Cite: Player.h
// GetSkillValue; Unit.cpp GetWeaponSkillValue / GetDefenseSkillValue
export function combatSkillValueWithBonus(
  map: CombatSkillMap | undefined,
  skillId: number,
  level: number,
  bonus = 0,
): number {
  if (!skillId && map != null) return 0;
  const pure = combatSkillValue(map, skillId || COMBAT_SKILL.UNARMED, level);
  return Math.max(0, pure + (bonus | 0));
}

/** equipMods key for a skill line (`skill_43` = swords). Defense also uses Stat.defense. */
export function equipModKeyForSkill(skillId: number): string {
  return `skill_${skillId | 0}`;
}

/** Parse equipMods `skill_<id>` → skill id, or 0. */
export function skillIdFromEquipModKey(mod: string): number {
  if (!mod || !mod.startsWith('skill_')) return 0;
  const n = Number(mod.slice(6));
  return Number.isFinite(n) && n > 0 ? n | 0 : 0;
}

/** One build per (meta, level, race, cls). Both writers (tryCombatSkillGain,
 * raiseCombatSkillsToLevelCap) are copy-on-write, so a shared map is safe. */
const maxedByMeta = new WeakMap<CombatSkillMeta, Map<string, CombatSkillMap>>();
const maxedNoMeta = new Map<string, CombatSkillMap>();

// Max out every weapon and defense skill this race/class can learn at `level`, so a companion's
// attack table matches a kept-up character. Cached: the raceClass scan cost 53 ms per body.
export function grantMaxedCombatSkillsForRaceClass(
  level: number,
  meta?: CombatSkillMeta | null,
  race?: number,
  cls?: number,
): CombatSkillMap {
  const key = `${level}|${race ?? -1}|${cls ?? -1}`;
  let byKey = maxedNoMeta;
  if (meta) {
    const hit = maxedByMeta.get(meta);
    if (hit) byKey = hit;
    else maxedByMeta.set(meta, (byKey = new Map()));
  }
  const cached = byKey.get(key);
  if (cached) return cached;
  const built = buildMaxedCombatSkillsForRaceClass(level, meta, race, cls);
  byKey.set(key, built);
  return built;
}

function buildMaxedCombatSkillsForRaceClass(
  level: number,
  meta?: CombatSkillMeta | null,
  race?: number,
  cls?: number,
): CombatSkillMap {
  const max = skillMaxForLevel(level);
  const out: CombatSkillMap = {};
  const candidates = new Set<number>([
    ...Object.values(COMBAT_SKILL),
    253, // spear / assassination subclass skill
  ]);
  // Also pick up any SkillRaceClassInfo weapon/armor rows for this race/class.
  for (const row of meta?.raceClass ?? []) {
    const id = row.skillId | 0;
    if (!id) continue;
    if (race != null && !raceClassMaskMatches(row.raceMask | 0, race)) continue;
    if (cls != null && !raceClassMaskMatches(row.classMask | 0, cls)) continue;
    if (level != null && ((row.reqLevel ?? 0) | 0) > level) continue;
    candidates.add(id);
  }
  for (const id of candidates) {
    if (race != null && cls != null && !raceClassCanLearnSkill(meta, id, race, cls, level)) {
      continue;
    }
    if (isLanguageSkill(id)) continue;
    if (id === SKILL_POISONS) continue;
    // Professions live on Character.skills, not combatSkills.
    const cat = meta?.categories?.[id];
    if (cat === SKILL_CATEGORY.PROFESSION || cat === SKILL_CATEGORY.SECONDARY) continue;
    if (isLevelRangeCombatSkill(id, meta)) {
      out[id] = { current: max, max };
    } else {
      // Armor / fist mono proficiency — presence gate, not L×5.
      out[id] = { current: 1, max: 1 };
    }
  }
  // Universal combat baselines.
  out[COMBAT_SKILL.DEFENSE] = { current: max, max };
  out[COMBAT_SKILL.UNARMED] = { current: max, max };
  return out;
}

// Equip proficiency gate: a legacy save with no combatSkills map allows, an item with no skill
// line allows, and a skill value of 0 is missing proficiency. Cite: Player.cpp CanUseItem ~9756.
export function hasRequiredEquipSkill(
  map: CombatSkillMap | undefined,
  item: ItemDef | undefined | null,
  level: number,
): boolean {
  if (map == null) return true;
  const skillId = skillIdForEquip(item);
  if (!skillId || skillId === SKILL_FISHING) return true;
  return combatSkillValue(map, skillId, level) > 0;
}

// Full equip proficiency: the trained skill when tracked AND the SkillRaceClassInfo race/class/
// level fit — the gate that blocks mail and plate before 40, and shields for hunters, even legacy.
export function canEquipItemProficiency(
  char: { combatSkills?: CombatSkillMap; level: number; race: number; cls: number },
  item: ItemDef | undefined | null,
  meta?: CombatSkillMeta | null,
): boolean {
  if (!hasRequiredEquipSkill(char.combatSkills, item, char.level)) return false;
  const skillId = skillIdForEquip(item);
  if (!skillId || skillId === SKILL_FISHING) return true;
  return raceClassCanLearnSkill(meta, skillId, char.race, char.cls, char.level);
}

// Effective weapon skill for an attack. Feral / no-weapon forms use max for level (GetWeaponSkillValue
// IsNoWeaponShapeShift branch). Unarmed when no weapon skill id.
export function effectiveWeaponSkillValue(
  map: CombatSkillMap | undefined,
  skillId: number,
  level: number,
  opts?: { noWeaponForm?: boolean },
): number {
  if (opts?.noWeaponForm) return skillMaxForLevel(level);
  const id = skillId || COMBAT_SKILL.UNARMED;
  return combatSkillValue(map, id, level);
}

// Effective defense skill (pure trained value; gear defense added by callers). Cite: GetDefenseSkillValue
// pure skill; gear is separate ITEM_MOD_DEFENSE.
export function effectiveDefenseSkillValue(
  map: CombatSkillMap | undefined,
  level: number,
): number {
  return combatSkillValue(map, COMBAT_SKILL.DEFENSE, level);
}

/** SetSkillStep-style grant from a skill step (SkillTiers). Cite: Player.cpp SetSkillStep ~5486 */
export function setCombatSkillStep(
  map: CombatSkillMap,
  skillId: number,
  step: number,
  level: number,
  meta?: CombatSkillMeta | null,
  race?: number,
  cls?: number,
): CombatSkillMap {
  const id = skillId | 0;
  if (!id) return map;
  if (step <= 0) {
    if (!map[id]) return map;
    const next = { ...map };
    delete next[id];
    return next;
  }
  const stepIndex = Math.max(0, (step | 0) - 1);
  const rc = lookupRaceClass(meta, id, race, cls);
  let max = 0;
  if (rc?.skillTierId) {
    max = meta?.tiers?.[rc.skillTierId]?.[stepIndex] ?? 0;
  }
  if (!max) {
    // No tiers: mono 1/1 or level-range L×5.
    const range = skillRangeType(id, meta);
    if (range === 'level') max = skillMaxForLevel(level);
    else max = 1;
  }
  const maxed = rc != null && (rc.flags & SKILL_FLAG_MAXIMIZED) !== 0;
  const prev = map[id]?.current ?? 0;
  const value = Math.max(1, maxed ? max : (prev > 0 ? prev : 1));
  return { ...map, [id]: { current: Math.min(value, max), max } };
}

// Grant a combat skill if missing (UpdateSpellTrainedSkills LEVEL/MONO branches). Does not overwrite an
// already-known skill. Cite: Player.cpp UpdateSpellTrainedSkills ~5727–5765
export function grantCombatSkillIfMissing(
  map: CombatSkillMap,
  skillId: number,
  level: number,
  meta?: CombatSkillMeta | null,
  race?: number,
  cls?: number,
): CombatSkillMap {
  const id = skillId | 0;
  if (!id || map[id]) return map;
  const range = skillRangeType(id, meta);
  if (range === 'language') {
    return { ...map, [id]: { current: 300, max: 300 } };
  }
  if (range === 'level') {
    const max = skillMaxForLevel(level);
    return { ...map, [id]: { current: id === SKILL_LOCKPICKING ? max : 1, max } };
  }
  if (range === 'mono' || range === 'rank') {
    const rc = lookupRaceClass(meta, id, race, cls);
    if (rc && (rc.flags & SKILL_FLAG_MAXIMIZED) !== 0) {
      const max = skillMaxForLevel(level);
      return { ...map, [id]: { current: max, max } };
    }
    return { ...map, [id]: { current: 1, max: 1 } };
  }
  return map;
}

// When a spell is learned, grant its linked combat skills: SpellLearnSkill → SetSkillStep, SLA
// learnOnGetSkill, and the POISONS / LOCKPICKING special case. Cite: Player.cpp ~5690.
export function applySpellTrainedSkills(
  map: CombatSkillMap | undefined,
  spellId: number,
  level: number,
  meta?: CombatSkillMeta | null,
  race?: number,
  cls?: number,
): CombatSkillMap | undefined {
  if (map == null) return map; // legacy: no skill tracking
  const sid = spellId | 0;
  if (!sid || !meta) {
    // Even without full meta, allow hardcoded proficiency spell grants from spellGrants-only meta.
  }
  let out = map;

  const learn = meta?.spellLearnSkills?.[sid];
  if (learn?.skill) {
    out = setCombatSkillStep(out, learn.skill, learn.step || 1, level, meta, race, cls);
  }

  const grantSkill = meta?.spellGrants?.[sid];
  if (grantSkill) {
    out = grantCombatSkillIfMissing(out, grantSkill, level, meta, race, cls);
  }

  // Lockpicking: learning any SLA-bound spell grants the class skill if missing.
  // Poisons (40) is a secondary profession on Character.skills, not combatSkills.
  const abilities = meta?.spellAbilities?.[sid];
  if (abilities?.length) {
    for (const ab of abilities) {
      const skillId = ab.skillId | 0;
      if (skillId !== SKILL_LOCKPICKING) continue;
      if (race != null && ab.raceMask && !raceClassMaskMatches(ab.raceMask | 0, race)) continue;
      if (cls != null && ab.classMask && !raceClassMaskMatches(ab.classMask | 0, cls)) continue;
      out = grantCombatSkillIfMissing(out, skillId, level, meta, race, cls);
    }
  }

  return maxLockpickingSkill(out, level);
}

// Dependent spell ids from `spell_learn_spell` when learning `spellId`. Cite: Player.cpp addSpell ~3412
// SpellLearnSpellMapBounds
export function spellLearnDependents(
  spellId: number,
  meta?: CombatSkillMeta | null,
): number[] {
  const sid = spellId | 0;
  if (!sid || !meta?.spellLearnSpells) return [];
  const list = meta.spellLearnSpells[sid];
  return list?.length ? [...list] : [];
}

// Re-apply UpdateSpellTrainedSkills for every known spell, fixing characters that learned a
// proficiency spell before the skill grant was wired. Idempotent for already-known skills.
export function syncCombatSkillsFromKnownSpells(
  map: CombatSkillMap | undefined,
  knownSpellIds: readonly number[],
  level: number,
  meta?: CombatSkillMeta | null,
  race?: number,
  cls?: number,
): CombatSkillMap | undefined {
  if (map == null) return map;
  let out = map;
  for (const id of knownSpellIds) {
    const next = applySpellTrainedSkills(out, id, level, meta, race, cls);
    if (next) out = next;
  }
  return out;
}

// Product cheat: a trained Lockpicking line sits at L×5. Callers that open locks read this
// value — they must not invent a skill the character does not have.
export function maxLockpickingSkill(
  map: CombatSkillMap | undefined,
  level: number,
): CombatSkillMap | undefined {
  if (!map) return map;
  const cur = map[SKILL_LOCKPICKING];
  if (!cur || cur.current <= 0) return map;
  const max = skillMaxForLevel(level);
  if (cur.current === max && cur.max === max) return map;
  return { ...map, [SKILL_LOCKPICKING]: { current: max, max } };
}

/** Display name for a combat skill id (SkillLine.Name when baked). */
export function combatSkillDisplayName(skillId: number, meta?: CombatSkillMeta | null): string {
  const id = skillId | 0;
  return meta?.skillNames?.[id] || `Skill ${id}`;
}

// Spells learned when a skill reaches a value (LearnSkillRewardedSpells), from the reverse of
// spellGrants and still unknown. Grants at skill present; req_skill_value needs richer meta.
export function skillRewardedSpellIds(
  skillId: number,
  currVal: number,
  meta?: CombatSkillMeta | null,
): number[] {
  if (!meta?.spellGrants || currVal <= 0) return [];
  const id = skillId | 0;
  const out: number[] = [];
  for (const [spellStr, sk] of Object.entries(meta.spellGrants)) {
    if ((sk | 0) === id) out.push(Number(spellStr));
  }
  return out;
}

// Chance (0..1) to gain a skill point this swing. Cite: Player.cpp UpdateCombatSkills ~5241 (piecewise
// log/quadratic + intellect weapon bonus).
export function combatSkillGainChance(
  skillCurrent: number,
  skillMax: number,
  level: number,
  defence: boolean,
  intellect: number,
): number {
  const room = skillMax - skillCurrent;
  if (skillMax <= 0 || level <= 0 || skillCurrent >= skillMax || room <= 0) return 0;

  const skillGapLogGrowth = 0.22 * (1.0 + 12.0 / level);
  const levelCapScale = 1;
  let baseChance: number;
  if (room >= 7) {
    // detLog, not Math.log: this chance is compared against a seeded roll every swing, so an
    // engine-dependent last bit flips a skill-up and desyncs the peers (W1b).
    baseChance = (7.0 / skillMax) * levelCapScale
      + skillGapLogGrowth * detLog((room + 5.0) / 12.0);
  } else {
    baseChance = (room * room) / (7.0 * skillMax) * levelCapScale;
  }
  baseChance = Math.min(1, Math.max(0, baseChance));

  let intellectBonus = 0;
  if (!defence) {
    const maxIntellectBonus = 0.1;
    const intellectMax = level <= 60 ? 750 : level <= 70 ? 1500 : level <= 80 ? 3000 : 6000;
    const levelBracket = level <= 60 ? 60 : level <= 70 ? 70 : level <= 80 ? 80 : 255;
    intellectBonus = maxIntellectBonus
      * (intellect / intellectMax)
      * (levelBracket / level);
    intellectBonus = Math.min(maxIntellectBonus, Math.max(0, intellectBonus));
  }

  return Math.min(1, Math.max(0, baseChance + intellectBonus));
}

export type SkillGainRoll = () => number; // 0..1 uniform

// Attempt one combat skill gain (weapon or defense). Returns updated map + whether a point was gained. Pure
// except for roll(). Cite: UpdateCombatSkills → UpdateWeaponSkill / UpdateDefense (+1 default gain).
export function tryCombatSkillGain(
  map: CombatSkillMap,
  skillId: number,
  level: number,
  opts: {
    defence: boolean;
    intellect: number;
    /** CONFIG_UINT32_SKILL_GAIN_WEAPON / DEFENSE default 1 */
    gainAmount?: number;
    roll: SkillGainRoll;
  },
): { map: CombatSkillMap; gained: boolean } {
  const id = skillId | 0;
  if (!id || id === SKILL_FISHING) return { map, gained: false };
  const s = map[id];
  if (!s || s.max <= 0 || s.current >= s.max) return { map, gained: false };

  const chance = combatSkillGainChance(s.current, s.max, level, opts.defence, opts.intellect);
  if (chance <= 0 || opts.roll() >= chance) return { map, gained: false };

  const gain = Math.max(1, opts.gainAmount ?? 1);
  const next = Math.min(s.max, s.current + gain);
  return {
    map: { ...map, [id]: { current: next, max: s.max } },
    gained: next > s.current,
  };
}

// Carry a fight's skill gains onto the sheet: current is the higher of the two, the sheet keeps its
// own max (a level-up raised it while the session held the old cap). Cite: Player.cpp UpdateSkillsForLevel.
export function mergeCombatSkillGains(
  sheet: CombatSkillMap | undefined,
  gained: CombatSkillMap | undefined,
): CombatSkillMap | undefined {
  if (!gained) return sheet;
  if (!sheet) return cloneCombatSkills(gained);
  let out = sheet;
  for (const [key, g] of Object.entries(gained)) {
    const id = Number(key);
    if (!g) continue;
    const have = out[id];
    if (!have) {
      if (out === sheet) out = { ...sheet };
      out[id] = { current: g.current, max: g.max };
      continue;
    }
    const current = Math.min(have.max, Math.max(have.current, g.current));
    if (current === have.current) continue;
    if (out === sheet) out = { ...sheet };
    out[id] = { current, max: have.max };
  }
  return out;
}

/** Clone a skill map (shallow values). */
export function cloneCombatSkills(map: CombatSkillMap | undefined): CombatSkillMap | undefined {
  if (!map) return undefined;
  const out: CombatSkillMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (v) out[Number(k)] = { current: v.current, max: v.max };
  }
  return out;
}
