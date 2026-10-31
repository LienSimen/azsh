// Character stat selectors: base/effective stats, health/power, armor, AP, resists, weapon profiles.
// Extracted from character.ts (Wave 1 S3 barrel split). Pure move — no behavior change.

import type { DataStore } from '../../data/dataStore.ts';
import type {
  PrimaryStats, SpellDef, PowerType, EquipSlot, ItemDef, EnchantDef, School, Stat, RandomPropertyDef,
  SpellEffect, ShapeshiftFormId,
} from '../../data/schema.ts';
import { RACE, CREATURE_TYPE } from '../../data/schema.ts';
import type { WeaponProfile } from '../../engine/combat.ts';
import type { Character, ActiveAura, EquippedValue } from './character.ts';
import { equippedEntry, equippedInstance } from '../items/itemInstance.ts';
import {
  staminaToHealth,
  intellectToMana,
  meleeAttackPowerFromStats,
  rangedAttackPowerFromStats,
  shieldBlockValue,
  unitModValue,
  totalAttackPower,
  armorFromAgiAndGear,
  formHasAgiAttackBonus,
} from '../../engine/combat/formulas.ts';
import { RAGE_MAX, ENERGY_MAX, classPowerType } from '../core/ids.ts';
import {
  formPowerType, isFormSpell, isNeedCastSpellAtFormApply, isStealthShapeshift, passiveAppliesInForm,
  formCombatPackage, formArmorDelta,
} from './forms.ts';
import { racialSpells } from './races.ts';
import { spellLearnDependents } from './combatSkills.ts';
import { isBroken } from '../items/durability.ts';
import { gearEnchantGrant, type GearEnchantGrant } from '../professions/gearEnchant.ts';
import { talentStatFlat, talentStatPct, talentResistMods, SCHOOL_MASK_BIT } from './characterTalents.ts';
import { tempEnchantAttackPower } from '../professions/characterEnchants.ts';
import { spellExclusionGroup, exclusionIsPerCaster } from '../professions/characterEnchants.ts';
import { hasShieldEquipped } from './characterRatings.ts';
import type { SpellBook } from './spellbook.ts';
/** SpellAuraDefines.h:247 SPELL_AURA_OVERRIDE_CLASS_SCRIPTS. */
const SPELL_AURA_OVERRIDE_CLASS_SCRIPTS = 112;
import {
  resolveCombatSpell,
  resolveEquipBuffMods,
} from '../../engine/spells/interpreter/item-triggers.ts';
import {
  auraHolderCharges, auraStackIdentity, existingStackIsStronger, stackIdentitiesExclude,
} from '../../engine/spells/auraStacking.ts';

const ZERO: PrimaryStats = { str: 0, agi: 0, sta: 0, int: 0, spi: 0 };

// The item defs currently equipped, in no particular order. Broken gear (0 durability) is skipped
// too, so it contributes no stats, armor or damage until repaired.
export function equippedItems(char: Character, ds: DataStore): ItemDef[] {
  const out: ItemDef[] = [];
  for (const [slot, v] of Object.entries(char.equipped) as [EquipSlot, EquippedValue | undefined][]) {
    const entry = equippedEntry(v);
    if (entry == null) continue;
    const it = ds.item(entry);
    if (it && !isBroken(char, slot, it)) out.push(it);
  }
  return out;
}

// Count non-broken equipped pieces per setId (same source as combat set bonuses). Shared by
// activeSetBonusSpells and item tooltips so piece progress never diverges.
export function setPieceCounts(char: Character, ds: DataStore): Map<number, number> {
  const counts = new Map<number, number>();
  for (const it of equippedItems(char, ds)) {
    if (it.setId != null) {
      counts.set(it.setId, (counts.get(it.setId) ?? 0) + 1);
    }
  }
  return counts;
}

/** Returns the set-bonus spell ids that are active given current equipped counts (per ItemSetDef). */
export function activeSetBonusSpells(char: Character, ds: DataStore): number[] {
  const counts = setPieceCounts(char, ds);
  const out: number[] = [];
  for (const [sid, cnt] of counts.entries()) {
    const set = ds.itemSet ? ds.itemSet(sid) : undefined;
    if (!set || !set.bonuses) continue;
    for (const b of set.bonuses) {
      if (cnt >= b.pieces && b.spell && !out.includes(b.spell)) out.push(b.spell);
    }
  }
  return out;
}

// Active spend resource for the character. Form-aware for Druid (cat→energy, bear→rage); other classes stay
// class-static (warrior rage, rogue energy, casters mana).
export function powerType(char: Character): PowerType {
  const form = (char.form ?? 0) | 0;
  // FORM_STEALTH is a stance bit only — class power type (rogue energy) stays active.
  if (form && !isStealthShapeshift(form)) return formPowerType(form);
  return classPowerType(char.cls);
}

/** Base (create) mana for percentage form costs — player_classlevelstats.basemana. */
export function createMana(char: Character, ds: DataStore): number {
  return ds.classLevel(char.cls, char.level)?.baseMana ?? 0;
}

// Base (create) health for POWER_HEALTH percentage costs — player_classlevelstats.basehp.
// Cite: Player.cpp SetCreateHealth; Spell.cpp CalculatePowerCost POWER_HEALTH (Bloodrage 20%).
export function createHealth(char: Character, ds: DataStore): number {
  return ds.classLevel(char.cls, char.level)?.baseHp ?? 0;
}

// Current mana for display / form costs. When active power is mana, that's `power`; when shifted onto
// rage/energy, the parallel `mana` field holds it.
export function currentMana(char: Character): number {
  if (powerType(char) === 'mana') return char.power;
  return char.mana ?? 0;
}

// Max mana from intellect + flat max_mana aura buffs (SPELL_AURA_MOD_INCREASE_ENERGY / Flask of Distilled
// Wisdom). Cite: SpellAuras.cpp HandleAuraModIncreaseEnergy TOTAL_VALUE on UNIT_MOD_MANA.
export function maxMana(char: Character, ds: DataStore): number {
  const cl = ds.classLevel(char.cls, char.level);
  const base = cl?.baseMana ?? 0;
  // Cite: StatSystem.cpp:193 — ignore classes without mana (create_power > 0).
  if (base <= 0) return 0;
  let mana = intellectToMana(base, effectiveStats(char, ds).int);
  // SIE equip_spell kind mana (Enchant Chest - Minor Mana +5, …). Cite: aura 35; KI-551.
  mana += equippedEnchantGrantAmount(char, ds, 'mana');
  const now = Date.now();
  for (const id of getActiveBuffIds(char, now, ds)) {
    for (const eff of ds.spell(id)?.effects ?? []) {
      if (eff.kind === 'buff' && eff.mod === 'max_mana') mana += eff.amount || 0;
    }
  }
  return mana;
}

export function baseStats(char: Character, ds: DataStore): PrimaryStats {
  return ds.levelStats(char.race, char.cls, char.level) ?? ZERO;
}

// Equipped, non-broken items paired with their profession enchant and random property. The one
// place gear stats are gathered, so both bonuses ride alongside the base item everywhere.
function equippedWithEnchant(char: Character, ds: DataStore): {
  item: ItemDef;
  enchant?: EnchantDef;
  // The enchant resolved through BOTH tables, profession formula or SpellItemEnchantment.
  // `enchant` above resolves only the profession side, so an armor kit or arcanum was invisible.
  grant?: GearEnchantGrant;
  randomProp?: RandomPropertyDef;
}[] {
  const out: {
    item: ItemDef;
    enchant?: EnchantDef;
    grant?: GearEnchantGrant;
    randomProp?: RandomPropertyDef;
  }[] = [];
  for (const [slot, v] of Object.entries(char.equipped ?? {}) as [EquipSlot, EquippedValue | undefined][]) {
    const entry = equippedEntry(v);
    if (entry == null) continue;
    const item = ds.item(entry);
    if (!item || isBroken(char, slot, item)) continue; // broken gear (enchant + random prop) is inert
    // Resolve random property from the equipped instance only (bare entry has no roll).
    let randomProp: RandomPropertyDef | undefined;
    const inst = equippedInstance(v);
    const rpId = inst?.randomPropertyId;
    if (rpId != null && rpId > 0) {
      randomProp = ds.itemRandomProperty(rpId);
    }
    // Instance first (LOCK 2), then legacy slot map for bare entries.
    const eid = inst?.permEnchantId ?? char.enchants?.[slot];
    out.push({
      item,
      enchant: eid != null ? ds.enchant(eid) : undefined,
      grant: eid != null ? gearEnchantGrant(eid, ds) : undefined,
      randomProp,
    });
  }
  return out;
}

/** Fold pre-resolved RandomPropertyDef.stats into a Stat map (MVP path — §7 / §5 P3). */
function addRandomPropStats(
  out: Partial<Record<Stat, number>>,
  prop: RandomPropertyDef | undefined,
): void {
  if (!prop?.stats) return;
  for (const [k, v] of Object.entries(prop.stats)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const stat = k as Stat;
    out[stat] = (out[stat] ?? 0) + v;
  }
}

/** Primary MOD_STAT buff keys — bake already folds these into prop.stats for animal suffixes. */
const PRIMARY_BUFF_MODS = new Set([
  'strength', 'agility', 'stamina', 'intellect', 'spirit',
  'str', 'agi', 'sta', 'int', 'spi',
]);

/** Effects for a random-prop equip spell; SI-resolve when bake left effects[] hollow. */
function randomPropEquipSpellEffects(
  ds: DataStore,
  spellId: number,
  casterLevel?: number,
): SpellEffect[] {
  return resolvedEffectsForSpell(ds.spell(spellId), casterLevel);
}

// Type-3 EQUIP_SPELL bonuses a random prop left on equipSpellIds only (of Power, of Healing,
// resists). Primaries stay on prop.stats so "of the Boar" is not double-counted.
function addRandomPropEquipSpellStats(
  out: Partial<Record<Stat, number>>,
  prop: RandomPropertyDef | undefined,
  ds: DataStore,
  casterLevel?: number,
): void {
  if (!prop?.equipSpellIds?.length) return;
  for (const sid of prop.equipSpellIds) {
    for (const e of randomPropEquipSpellEffects(ds, sid, casterLevel)) {
      if (e.kind === 'buff' && e.mod) {
        if (PRIMARY_BUFF_MODS.has(e.mod)) continue;
        const amount = Number(e.amount);
        if (!Number.isFinite(amount) || amount === 0) continue;
        const stat = EQUIP_MOD_TO_STAT[e.mod];
        if (stat) out[stat] = (out[stat] ?? 0) + amount;
      } else if (e.kind === 'resist') {
        const amount = Number(e.amount);
        if (!Number.isFinite(amount) || amount === 0) continue;
        const stat = RESIST_SCHOOL_TO_STAT[e.school];
        if (stat) out[stat] = (out[stat] ?? 0) + amount;
      }
    }
  }
}

// Sum one buff mod from random-prop type-3 equip spells on worn gear. Per spell take the max
// amount for `mod`: Attack Power 02 maps auras 99 and 124 to attack_power and summing doubles.
function randomPropEquipSpellModAmount(
  char: Character,
  ds: DataStore,
  mod: string,
): number {
  let total = 0;
  for (const { randomProp } of equippedWithEnchant(char, ds)) {
    if (!randomProp?.equipSpellIds?.length) continue;
    for (const sid of randomProp.equipSpellIds) {
      let best = 0;
      for (const e of randomPropEquipSpellEffects(ds, sid, char.level)) {
        if (e.kind !== 'buff' || e.mod !== mod) continue;
        const amount = Number(e.amount);
        if (Number.isFinite(amount) && amount !== 0) best = Math.max(best, amount);
      }
      total += best;
    }
  }
  return total;
}

// FI3 equipMods keys → paperdoll Stat. equipMods are BuffMod strings from mapSpellEffects.
// attack_power and armor are not Stat — they fold in via attackPower / effectiveArmor.
const EQUIP_MOD_TO_STAT: Readonly<Record<string, Stat>> = {
  spell_power: 'spellPower',
  mp5: 'mp5',
  haste: 'haste',
  dodge: 'dodge',
  parry: 'parry',
  // SPELL_AURA_MOD_BLOCK/CRIT/HIT_PERCENT + MOD_SKILL defense — equip passives.
  // Cite: map-spell-effects auras 51/52/54/30; characterRatings critChance/hitChance/blockChance/defenseSkill.
  block: 'block',
  crit: 'crit',
  hit: 'hit',
  defense: 'defense',
  // Aura 55 / 57 — distinct from melee hit/crit. Hollow Equip: census → spell_hit on 7 items.
  spell_hit: 'spellHit',
  spell_crit: 'spellCrit',
  // MOD_STAT primaries (rare on equip auras; BuffMod full names)
  strength: 'str',
  agility: 'agi',
  stamina: 'sta',
  intellect: 'int',
  spirit: 'spi',
  // One-school MOD_DAMAGE_DONE — own Stat, not folded into spellPower.
  // Cite: Unit.cpp SpellBaseDamageBonusDone ~7129 (mask ∩ school).
  spell_damage_holy: 'spellHoly',
  spell_damage_fire: 'spellFire',
  spell_damage_nature: 'spellNature',
  spell_damage_frost: 'spellFrost',
  spell_damage_shadow: 'spellShadow',
  spell_damage_arcane: 'spellArcane',
};

/** Non-Stat equip buff mods folded by attackPower / effectiveArmor / healingPower / blockValue. */
const EQUIP_MOD_NON_STAT = new Set([
  'attack_power',
  'armor',
  'healing_done',
  'block_value',
]);

// Resistance school → the Stat key the paperdoll reads. `armor` is deliberately absent: an armor grant is
// added to the armor total, not to a Stat (see equippedStatBonuses).
const RESIST_SCHOOL_TO_STAT: Readonly<Record<string, Stat | undefined>> = {
  holy: 'resHoly',
  fire: 'resFire',
  nature: 'resNature',
  frost: 'resFrost',
  shadow: 'resShadow',
  arcane: 'resArcane',
};

/** One-school +spell damage → paperdoll Stat. Physical is attack_power, not a Stat. */
export const SPELL_SCHOOL_TO_STAT: Readonly<Record<string, Stat | undefined>> = {
  holy: 'spellHoly',
  fire: 'spellFire',
  nature: 'spellNature',
  frost: 'spellFrost',
  shadow: 'spellShadow',
  arcane: 'spellArcane',
};

/** Fold ItemDef.equipMods into a Stat map (skips attack_power / armor / unknown mods). */
function addEquipModsToStats(
  out: Partial<Record<Stat, number>>,
  item: ItemDef,
): void {
  for (const m of item.equipMods ?? []) {
    if (!m || typeof m.mod !== 'string') continue;
    const amount = Number(m.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const stat = EQUIP_MOD_TO_STAT[m.mod];
    if (!stat) continue;
    out[stat] = (out[stat] ?? 0) + amount;
  }
}

// Hollow Equip: lines — the bake left equipMods empty and interpreter buff mods fill the gap.
// Skip mods already on equipMods so a partial bake does not double with resolve.
function addResolvedEquipBuffModsToStats(
  out: Partial<Record<Stat, number>>,
  item: ItemDef,
  ds: DataStore,
  casterLevel: number,
): void {
  const spells = item.equipSpells;
  if (!spells?.length) return;
  const have = new Set<string>();
  for (const m of item.equipMods ?? []) {
    if (m && typeof m.mod === 'string') have.add(m.mod);
  }
  const mods = resolveEquipBuffMods(spells, (id) => ds.spell(id), {
    casterLevel,
    unitTargetIsPlayer: true,
  });
  for (const m of mods) {
    if (!m?.mod || have.has(m.mod)) continue;
    const amount = Number(m.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const stat = EQUIP_MOD_TO_STAT[m.mod];
    if (!stat) continue;
    out[stat] = (out[stat] ?? 0) + amount;
  }
}

// Sum one equipMods key across equipped non-broken gear, for the non-Stat paperdoll fields.
// Also folds random-prop type-3 equip spells, and resolves hollow items with empty equipMods.
function equippedEquipModAmount(char: Character, ds: DataStore, mod: string): number {
  let total = 0;
  for (const { item } of equippedWithEnchant(char, ds)) {
    const baked = item.equipMods ?? [];
    let fromBake = 0;
    for (const m of baked) {
      if (!m || m.mod !== mod) continue;
      const amount = Number(m.amount);
      if (!Number.isFinite(amount) || amount === 0) continue;
      fromBake += amount;
    }
    total += fromBake;
    // Interpreter fill when bake omitted this mod (hollow Equip: / partial bake).
    if (fromBake === 0 && item.equipSpells?.length && EQUIP_MOD_NON_STAT.has(mod)) {
      const mods = resolveEquipBuffMods(item.equipSpells, (id) => ds.spell(id), {
        casterLevel: char.level,
        unitTargetIsPlayer: true,
      });
      for (const m of mods) {
        if (!m || m.mod !== mod) continue;
        const amount = Number(m.amount);
        if (!Number.isFinite(amount) || amount === 0) continue;
        total += amount;
      }
    }
  }
  total += randomPropEquipSpellModAmount(char, ds, mod);
  return total;
}

// Map non-stat SIE EnchantGrant kinds into paperdoll Stat keys. haste_pct takes the max: one
// enchant often stamps melee and ranged at the same amount, so gloves Minor Haste stays +1.
function addEnchantGrantsToStats(
  out: Partial<Record<Stat, number>>,
  grants: readonly import('../../data/schema.ts').EnchantGrant[] | undefined,
): void {
  if (!grants?.length) return;
  let hastePct = 0;
  for (const g of grants) {
    switch (g.kind) {
      case 'spell_power': {
        // EnchantGrant.school is set only for a single magic bit (physical skipped at port).
        // Cite: item-enchants-port.mjs aura 13; Unit.cpp SpellBaseDamageBonusDone mask ∩ school.
        const schoolStat = g.school ? SPELL_SCHOOL_TO_STAT[g.school] : undefined;
        if (schoolStat) out[schoolStat] = (out[schoolStat] ?? 0) + g.amount;
        else out.spellPower = (out.spellPower ?? 0) + g.amount;
        break;
      }
      case 'mp5':
        out.mp5 = (out.mp5 ?? 0) + g.amount;
        break;
      case 'haste_pct':
        hastePct = Math.max(hastePct, g.amount);
        break;
      case 'dodge_pct':
        out.dodge = (out.dodge ?? 0) + g.amount;
        break;
      case 'crit_pct':
        out.crit = (out.crit ?? 0) + g.amount;
        break;
      case 'spell_crit_pct':
        out.spellCrit = (out.spellCrit ?? 0) + g.amount;
        break;
      case 'hit_pct':
        out.hit = (out.hit ?? 0) + g.amount;
        break;
      case 'spell_hit_pct':
        out.spellHit = (out.spellHit ?? 0) + g.amount;
        break;
      case 'block_pct':
        out.block = (out.block ?? 0) + g.amount;
        break;
      default:
        break;
    }
  }
  if (hastePct) out.haste = (out.haste ?? 0) + hastePct;
}

/** Sum equip_spell grant amounts of one kind across equipped permanent enchants (SIE). */
export function equippedEnchantGrantAmount(
  char: Character,
  ds: DataStore,
  kind: import('../../data/schema.ts').EnchantGrant['kind'],
): number {
  let total = 0;
  for (const { grant } of equippedWithEnchant(char, ds)) {
    if (!grant?.grants?.length) continue;
    for (const g of grant.grants) {
      if (g.kind !== kind) continue;
      if ('amount' in g && typeof g.amount === 'number') total += g.amount;
    }
  }
  return total;
}

// Speed a body carries with no buff running: the boots enchant (SIE 911 Minor Speed, +8 aura 31)
// and every spent talent rank whose aura is a speed one — Pursuit of Justice 26022/26023 (+4/+8
// run AND mounted), Feline Swiftness 17002/24866 (+15/+30, Stances 1 so cat form only).
//
// One row per source, never a sum. UpdateSpeed takes the MAX of aura 31, so adding these together
// would invent a stack the client never had. Cite: Unit.cpp:8352 GetMaxPositiveAuraModifier;
// item-enchants-port.mjs aura 31; Spell.cpp CheckShapeshift for the Stances gate.
export function permanentSpeedAuras(
  char: Character,
  ds: DataStore,
): Array<{ aura: number; pct: number }> {
  const out: Array<{ aura: number; pct: number }> = [];
  for (const { grant } of equippedWithEnchant(char, ds)) {
    for (const g of grant?.grants ?? []) {
      if (g.kind === 'move_speed_pct' && g.amount > 0) out.push({ aura: 31, pct: g.amount });
      if (g.kind === 'mount_speed_pct' && g.amount > 0) out.push({ aura: 130, pct: g.amount });
    }
  }
  const form = ((char.form ?? 0) | 0) as ShapeshiftFormId;
  for (const id of spentTalentRankSpellIds(char, ds)) {
    const raw = ds.spell(id);
    if (!raw) continue;
    // A form-gated rank only counts in that form: Feline Swiftness is Stances 1 (cat).
    if (!passiveAppliesInForm(raw, form)) continue;
    for (const e of resolveCombatSpell(raw, { casterLevel: char.level }).effects ?? []) {
      if (e.kind !== 'speed' || e.hostile === true) continue;
      if ((e.durationMs ?? 0) !== 0 || e.pct <= 0) continue;
      out.push({ aura: e.aura, pct: e.pct });
    }
  }
  return out;
}

// MOD_STEALTH_LEVEL (154) from spent talent ranks — Feral Instinct is Stances 145, cat/bear/dire only.
// Cite: SpellAuras.cpp HandleModStealthLevel; spell_template 16947-16951.
export function talentStealthLevelBonus(char: Character, ds: DataStore): number {
  const form = ((char.form ?? 0) | 0) as ShapeshiftFormId;
  let n = 0;
  for (const id of spentTalentRankSpellIds(char, ds)) {
    const raw = ds.spell(id);
    if (!raw || !passiveAppliesInForm(raw, form)) continue;
    for (const e of resolvedEffectsForSpell(raw, char.level)) {
      if (e.kind === 'stealth_level') n += e.amount | 0;
    }
  }
  return n;
}

/** All stat bonuses (primary + secondary ratings/resists) from items + profession enchants + random props + equipMods. */
export function equippedStatBonuses(char: Character, ds: DataStore): Partial<Record<Stat, number>> {
  const out: Partial<Record<Stat, number>> = {};
  for (const { item, enchant, grant, randomProp } of equippedWithEnchant(char, ds)) {
    for (const s of item.stats ?? []) out[s.stat] = (out[s.stat] ?? 0) + s.value;
    // `grant` already contains the profession formula's own stats[], so prefer it and fall back to
    // `enchant` only when it did not resolve. Adding both would double every profession enchant.
    const enchStats = grant ? grant.stats : (enchant?.stats ?? []);
    for (const s of enchStats) out[s.stat] = (out[s.stat] ?? 0) + s.value;
    // Resistances an item enchant grants (fire/frost/…) — unreachable through EnchantDef.
    for (const [school, amount] of Object.entries(grant?.resists ?? {})) {
      const stat = RESIST_SCHOOL_TO_STAT[school];
      if (stat && amount) out[stat] = (out[stat] ?? 0) + amount;
    }
    // SIE equip_spell non-stat grants (SP / mp5 / haste / dodge / …). KI-590.
    addEnchantGrantsToStats(out, grant?.grants);
    addRandomPropStats(out, randomProp);
    // Type-3 random-prop equip spells left only on equipSpellIds (AP/SP/resists/…).
    addRandomPropEquipSpellStats(out, randomProp, ds, char.level);
    // FI3: equip-spell auras baked as equipMods (spell_power, mp5, dodge, …). KI-192.
    addEquipModsToStats(out, item);
    // OPEN 197: hollow Equip: lines — resolve when bake left equipMods empty / partial.
    addResolvedEquipBuffModsToStats(out, item, ds, char.level);
  }
  return out;
}

/** Primary-stat bonuses (delegates to full aggregator for DRYness). */
export function equippedStatBonus(char: Character, ds: DataStore): PrimaryStats {
  const all = equippedStatBonuses(char, ds);
  return {
    str: all.str ?? 0,
    agi: all.agi ?? 0,
    sta: all.sta ?? 0,
    int: all.int ?? 0,
    spi: all.spi ?? 0,
  };
}

// Pet-repertoire party auras (Blood Pact, Furious Howl) contribute only while a living pet whose
// family kit has the spell is out. Player party buffs are never in petSpells and pass through.
function petPartyAuraContributes(char: Character, spellId: number, sp: SpellDef, ds: DataStore): boolean {
  const isParty = sp.effects.some(
    (e) => e.kind === 'buff' && e.applyTo === 'party' && !e.hostile,
  );
  if (!isParty) return true;
  const rep = char.petSpells ?? [];
  const taught = char.pet?.taughtSpells ?? [];
  const inPetRepertoire =
    rep.includes(spellId)
    || taught.includes(spellId)
    || rep.some((id) => ds.spell(id)?.name === sp.name)
    || taught.some((id) => ds.spell(id)?.name === sp.name);
  // Not a pet ability (Battle Shout etc.) — always contributes while on the sheet.
  if (!inPetRepertoire) return true;
  const pet = char.pet;
  if (!pet || pet.health <= 0) return false;
  const cdef = ds.creature(pet.creature);
  if (!cdef) return false;
  for (const id of cdef.petSpells ?? []) {
    if (id === spellId) return true;
    if (ds.spell(id)?.name === sp.name) return true;
  }
  return false;
}

// Effective primaries via UNIT_MOD layering: create from player_levelstats, TOTAL_VALUE from gear
// and flats, TOTAL_PCT from talents and all_stats_pct. Cite: Unit.cpp GetTotalStatValue.
export function effectiveStats(char: Character, ds: DataStore): PrimaryStats {
  const create = baseStats(char, ds);
  const e = equippedStatBonus(char, ds);
  const now = Date.now();
  const auraBoost: PrimaryStats = { str: 0, agi: 0, sta: 0, int: 0, spi: 0 };
  // SPELL_AURA_MOD_TOTAL_STAT_PERCENTAGE (−1 = all): whole percent points on TOTAL_PCT.
  // Cite: schema BuffMod 'all_stats_pct'; Blessing of Kings +10.
  let auraAllStatsPct = 0;
  // The per-stat twin (misc 0..4) — Demonic Embrace stamina, Spirit Tap spirit, Heart of the Wild
  // intellect. Cite: schema BuffMod '<stat>_pct'; SpellAuras.cpp:3537-3568.
  const auraStatPct: PrimaryStats = { str: 0, agi: 0, sta: 0, int: 0, spi: 0 };
  const foldStatMod = (mod: string, amt: number): void => {
    if (mod === 'strength') auraBoost.str += amt;
    else if (mod === 'agility') auraBoost.agi += amt;
    else if (mod === 'stamina') auraBoost.sta += amt;
    else if (mod === 'intellect') auraBoost.int += amt;
    else if (mod === 'spirit') auraBoost.spi += amt;
    else if (mod === 'all_stats') { auraBoost.str += amt; auraBoost.agi += amt; auraBoost.sta += amt; auraBoost.int += amt; auraBoost.spi += amt; }
    else if (mod === 'all_stats_pct') auraAllStatsPct += amt;
    else if (mod === 'strength_pct') auraStatPct.str += amt;
    else if (mod === 'agility_pct') auraStatPct.agi += amt;
    else if (mod === 'stamina_pct') auraStatPct.sta += amt;
    else if (mod === 'intellect_pct') auraStatPct.int += amt;
    else if (mod === 'spirit_pct') auraStatPct.spi += amt;
  };
  // Racial passives are auras in C++ but never enter activeAuras: Expansive Mind +5% int (20591),
  // The Human Spirit +5% spirit (20598). Cite: SpellAuras.cpp:3537 HandleModTotalPercentStat.
  for (const eff of permanentRacialEffects(char, ds)) {
    if (eff.kind === 'buff') foldStatMod(eff.mod, eff.amount || 0);
  }
  for (const id of getActiveBuffIds(char, now, ds)) {
    const raw = ds.spell(id);
    if (raw && !petPartyAuraContributes(char, id, raw, ds)) continue;
    // Per-level well-fed (24870 0.25/level) is omitted from the bake. Cite: Object.cpp:2926-2934.
    const fx = raw
      ? (resolveCombatSpell(raw, {
          casterLevel: char.level,
          spellLevel: raw.spellLevel ?? 0,
          spellBaseLevel: raw.baseLevel ?? 0,
          spellMaxLevel: raw.maxLevel ?? 0,
        }).effects ?? [])
      : [];
    for (const eff of fx) {
      if (eff.kind === 'buff') foldStatMod(eff.mod, eff.amount || 0);
    }
  }
  const tFlat = talentStatFlat(char, ds);
  const tPct = talentStatPct(char, ds);
  // unitModValue: ((BASE_VALUE + create) * BASE_PCT + TOTAL_VALUE) * TOTAL_PCT
  const total = (key: keyof PrimaryStats): number => {
    const totalValue = e[key] + auraBoost[key] + tFlat[key];
    const totalPct = 1 + (tPct[key] || 0) / 100 + auraAllStatsPct / 100 + (auraStatPct[key] || 0) / 100;
    return Math.round(unitModValue(0, create[key], 1, totalValue, totalPct));
  };
  return {
    str: total('str'),
    agi: total('agi'),
    sta: total('sta'),
    int: total('int'),
    spi: total('spi'),
  };
}

// Max health from stamina plus flat max_health aura buffs (MOD_INCREASE_HEALTH, Flask of the
// Titans). Cite: SpellAuras.cpp HandleAuraModIncreaseHealth TOTAL_VALUE on UNIT_MOD_HEALTH.
export function maxHealth(char: Character, ds: DataStore): number {
  const cl = ds.classLevel(char.cls, char.level);
  let hp = staminaToHealth(cl?.baseHp ?? 1, effectiveStats(char, ds).sta);
  // SIE equip_spell kind health (Enchant Bracer - Minor Health +5, …). Cite: aura 34; KI-551.
  hp += equippedEnchantGrantAmount(char, ds, 'health');
  const now = Date.now();
  for (const id of getActiveBuffIds(char, now, ds)) {
    for (const eff of ds.spell(id)?.effects ?? []) {
      if (eff.kind === 'buff' && eff.mod === 'max_health') hp += eff.amount || 0;
    }
  }
  const form = ((char.form ?? 0) | 0) as ShapeshiftFormId;
  hp += formCombatPackage(form).healthFlat;
  // UNIT_MOD_HEALTH TOTAL_PCT last, one multiply per aura — Tauren Endurance 20550 (aura 133).
  // Cite: SpellAuras.cpp:3740-3745 HandleAuraModIncreaseHealthPercent; StatSystem.cpp:174-183.
  let pctMult = 1;
  for (const eff of permanentRacialEffects(char, ds)) {
    if (eff.kind === 'buff' && eff.mod === 'max_health_pct') pctMult *= (100 + (eff.amount || 0)) / 100;
  }
  return Math.round(hp * pctMult);
}

export function maxPower(char: Character, ds: DataStore): number {
  const pt = powerType(char);
  if (pt === 'rage') return RAGE_MAX;
  // Energy is a fixed pool (POWER_ENERGY_DEFAULT = 100), not derived from intellect/basemana.
  // Rogue player_classlevelstats.basemana is 0 at all levels — do not invent a mana bar.
  if (pt === 'energy') return ENERGY_MAX;
  return maxMana(char, ds);
}

// Is there a real class/level stats row behind maxHealth / maxMana? Without one `baseHp ?? 1`
// makes the max 1 at every level, so a clamp would pin fixture characters to 1 HP.
export function hasResourceBaseline(char: Character, ds: DataStore): boolean {
  return !!ds.classLevel(char.cls, char.level);
}

// After gear or stat changes that lower a max pool, clamp current health, power and form mana.
// Cite: Unit.cpp SetMaxHealth / SetMaxPower — if (val < health) SetHealth(val).
export function clampResourcePools(char: Character, ds: DataStore): Character {
  // No class/level row -> maxHealth degenerates to 1. Leave the pools alone.
  if (!hasResourceBaseline(char, ds)) return char;
  const mh = maxHealth(char, ds);
  const mp = maxPower(char, ds);
  const health = Math.min(char.health, mh);
  const power = Math.min(char.power, mp);
  // Parallel mana while shapeshifted (druid) is still int-derived and must clamp too.
  const maxM = maxMana(char, ds);
  const mana = char.mana != null ? Math.min(char.mana, maxM) : char.mana;
  if (health === char.health && power === char.power && mana === char.mana) return char;
  return { ...char, health, power, ...(mana !== char.mana ? { mana } : {}) };
}

// Currently active buff spell ids. Prefer `activeAuras` — when it is tracked, even empty, do NOT
// re-union legacy `activeBuffs`, or timed buffs come back after expiresAt (KI-145).
export function getActiveBuffIds(char: Character, now: number = Date.now(), ds?: DataStore): number[] {
  // Source of truth: non-expired auras when the aura list is present.
  // `?? []` would treat undefined as empty and drop legitimate legacy-only fixtures.
  const auras = char.activeAuras;
  const ids: number[] = auras !== undefined
    ? auras
        .filter((a) => a.expiresAt == null || a.expiresAt > now)
        .map((a) => a.spellId)
    : (char.activeBuffs ?? []);
  // Dedup while preserving order. If ds, also collapse same-name (rank) dups.
  const seen = new Set<string>();
  const out: number[] = [];
  for (const id of ids) {
    let key = String(id);
    if (ds) {
      const sp = ds.spell(id);
      if (sp?.name) key = sp.name;
    }
    if (!seen.has(key)) { seen.add(key); out.push(id); }
  }
  return out;
}

/** Prune expired auras in place (mutates a copy of the array). Returns cleaned list. */
export function pruneExpiredAuras(
  auras: readonly ActiveAura[] | undefined,
  now: number = Date.now(),
): ActiveAura[] {
  if (!auras) return [];
  return auras.filter((a) => a.expiresAt == null || a.expiresAt > now);
}

// Apply or refresh an aura from a spell, setting expiresAt when durationMs > 0 and filling
// charges from procCharges. Enforces SpellGroup exclusivity and one shapeshift form at a time.
export function applyAura(
  char: Character,
  spellId: number,
  durationMs?: number,
  now: number = Date.now(),
  ds?: DataStore,
  opts?: { charges?: number; fromCaster?: string },
): Character {
  const auras = pruneExpiredAuras(char.activeAuras, now).slice();
  const expiresAt = (durationMs && durationMs > 0) ? (now + durationMs) : undefined;

  // Remove the same spell id (refresh) and any other rank of the SAME spell name, so a new rank of
  // Fortitude or Blessing of Might replaces the old one instead of stacking in the buff bar.
  let filtered = auras.filter((a) => a.spellId !== spellId);
  if (ds) {
    const nw = ds.spell(spellId);
    if (nw && nw.name) {
      filtered = filtered.filter((a) => {
        const old = ds.spell(a.spellId);
        return !old || old.name !== nw.name;
      });
    }
    // SpellGroup EXCLUSIVE: drop other auras in the group (Mage Armors 13, flasks 4). Never add
    // battle/guardian elixir exclusivity — that is TBC+, not 1.12. A UNIQUE_PER_CASTER group (7
    // Blessing, 8 Aura, 10 Aspect, 12 Curse) drops only what THIS caster left, so two paladins
    // leave two Blessings. Cite: Unit.cpp:4973 personal; :5021 RemoveAurasByCasterSpell.
    const group = spellExclusionGroup(nw);
    if (group != null) {
      const perCaster = exclusionIsPerCaster(nw);
      const from = opts?.fromCaster;
      filtered = filtered.filter((a) => {
        if (spellExclusionGroup(ds.spell(a.spellId)) !== group) return true;
        return perCaster && (a.fromCaster ?? undefined) !== from;
      });
    }
    // The pairs no spell_group covers: same class spell family and a shared aura, so the AoE and
    // single-target versions replace each other. Cite: SpellStacking.cpp:135,352.
    const ident = auraStackIdentity(nw);
    if (ident) {
      const siblings = filtered
        .map((a) => auraStackIdentity(ds.spell(a.spellId)))
        .filter((s) => stackIdentitiesExclude(ident, s));
      // A stronger sibling refuses the apply outright, so Gift of the Wild rank 1 cannot downgrade
      // Mark of the Wild rank 7. Cite: Unit.cpp:5013-5015; SpellMgr.h:1566.
      if (siblings.some((s) => existingStackIsStronger(ident, s))) return char;
      filtered = filtered.filter(
        (a) => !stackIdentitiesExclude(ident, auraStackIdentity(ds.spell(a.spellId))),
      );
    }
    // Shapeshift forms/stances: only one form aura (HandleAuraModShapeshift is modal).
    if (nw && isFormSpell(nw)) {
      filtered = filtered.filter((a) => {
        const old = ds.spell(a.spellId);
        return !old || !isFormSpell(old);
      });
    }
  }
  let charges = (opts?.charges != null && opts.charges > 0) ? opts.charges : undefined;
  if (charges == null && ds) {
    const n = auraHolderCharges(ds.spell(spellId));
    if (n > 0) charges = n;
  }
  filtered.push({
    spellId,
    expiresAt,
    ...(charges != null ? { charges } : {}),
    ...(opts?.fromCaster != null ? { fromCaster: opts.fromCaster } : {}),
  });

  return {
    ...char,
    activeAuras: filtered,
    // keep legacy in sync for now
    activeBuffs: getActiveBuffIds({ ...char, activeAuras: filtered }, now, ds),
  };
}

/** Sum a persistent-buff modifier ('armor' | 'attack_power') across active buffs/auras. */
export function buffMod(char: Character, ds: DataStore, mod: 'armor' | 'attack_power' | 'ranged_attack_power' | 'attack_power_pct'): number {
  let total = 0;
  for (const id of getActiveBuffIds(char, undefined, ds)) {
    for (const eff of ds.spell(id)?.effects ?? []) {
      if (eff.kind === 'buff' && eff.mod === mod) total += eff.amount;
    }
  }
  return total;
}

// BASE bucket of UNIT_MOD_ARMOR: item, enchant and equipMod armor times every BASE_PCT aura (142).
// agi×2, the intellect term and flat armor buffs are TOTAL_VALUE and deliberately not here.
export function baseArmorValue(char: Character, ds: DataStore): number {
  let gear = 0;
  for (const { item, enchant, grant, randomProp } of equippedWithEnchant(char, ds)) {
    // `grant` already includes the profession formula's armor, so prefer it over `enchant`
    // rather than adding both — this is where an armor kit's +24 finally lands.
    const enchArmor = grant ? grant.armor : (enchant?.armor ?? 0);
    gear += (item.armor ?? 0) + enchArmor + (randomProp?.armor ?? 0);
  }
  // FI3 equipMods armor + hollow resolveEquipBuffMods — additive with item.armor.
  gear += equippedEquipModAmount(char, ds, 'armor');
  return gear * passiveBaseArmorPctMult(char, ds) * activeBaseArmorPctMult(char, ds);
}

// Effective armor = total AGI × 2 + base armor + armor buffs (no double agi×2). source: StatSystem.cpp
// UpdateArmor; Player.cpp InitStatsForLevel SetArmor(createAgi*2)
export function effectiveArmor(char: Character, ds: DataStore): number {
  const stats = effectiveStats(char, ds);
  // MOD_RESISTANCE_OF_STAT_PERCENT (182): armor also gains a percent of INTELLECT (Arcane
  // Resilience 50%). SetArmor takes an int32, so the fraction truncates. Cite: StatSystem.cpp:125.
  const fromInt = Math.trunc(stats.int * (armorFromIntellectPct(char, ds) / 100));
  const base = baseArmorValue(char, ds);
  const form = ((char.form ?? 0) | 0) as ShapeshiftFormId;
  return armorFromAgiAndGear(stats.agi, base + buffMod(char, ds, 'armor')) + fromInt + formArmorDelta(base, form);
}

// Melee attack power: the class formula as BASE_VALUE plus buff TOTAL_VALUE via totalAttackPower.
// The form AGI bonus comes off SpellShapeshiftForm.dbc flags1, only Cat in 1.12.1.
export function attackPower(char: Character, ds: DataStore): number {
  // Rockbiter TYPE_EQUIP_SPELL AP lands via the equip-spell aura in buffMod; tempEnchantAttackPower
  // only covers cache-only rows (no equipSpellId). Cite: SpellAuras.cpp HandleAuraModAttackPower; KI-1039.
  const st = effectiveStats(char, ds);
  const form = ((char.form ?? 0) | 0) as ShapeshiftFormId;
  const formAgi = formHasAgiAttackBonus(form);
  const base = meleeAttackPowerFromStats(char.cls, char.level, st.str, st.agi, formAgi);
  // Buff taxonomy uses spell effect mod 'attack_power' (Battle Shout etc.).
  // Gear flat AP lives on ItemDef.equipMods (FI3), not Stat — fold here. KI-192.
  const gearAp = equippedEquipModAmount(char, ds, 'attack_power')
    + equippedEnchantGrantAmount(char, ds, 'attack_power');
  const pkg = formCombatPackage(form);
  let formAp = pkg.attackPowerFlat;
  if (pkg.attackPowerFlat > 0) {
    const psRank = (char.talents?.[803] as number) | 0;
    const amt = psRank === 3 ? 150 : psRank === 2 ? 100 : psRank === 1 ? 50 : 0;
    if (amt > 0) formAp += Math.trunc((Math.max(0, char.level | 0) * amt) / 100);
  }
  const apFlat = buffMod(char, ds, 'attack_power') + tempEnchantAttackPower(char) + gearAp + formAp;
  // SPELL_AURA_MOD_ATTACK_POWER_PCT (166) lands on the TOTAL_PCT slot, after the flats.
  // Cite: SpellAuras.cpp:4009 HandleStatModifier(UNIT_MOD_ATTACK_POWER, TOTAL_PCT).
  const apPct = 1 + buffMod(char, ds, 'attack_power_pct') / 100;
  return totalAttackPower(base, apFlat, 1, apPct);
}

// Ranged attack power (hunter/rogue/warrior paths; casters default agi-10). // source:
// StatSystem.cpp:Player::UpdateAttackPowerAndDamage (ranged==true)
export function rangedAttackPower(char: Character, ds: DataStore): number {
  const st = effectiveStats(char, ds);
  const base = rangedAttackPowerFromStats(char.cls, char.level, st.agi, (char.form ?? 0) | 0);
  // Aura 124 is its own mod now (Aspect of the Hawk, Trueshot Aura); it used to bake as the melee
  // `attack_power` and this line summed nothing, so a hunter's own aspect bought 0 ranged ap.
  const apFlat = buffMod(char, ds, 'ranged_attack_power')
    + equippedEquipModAmount(char, ds, 'ranged_attack_power')
    + equippedEnchantGrantAmount(char, ds, 'ranged_attack_power');
  return totalAttackPower(base, apFlat, 1, 1);
}

// Shield block value, the flat absorb amount, separate from block chance. The aura flat is
// equipMods block_value (aura 158) plus item stats. Cite: Player.cpp GetShieldBlockValue.
export function blockValue(char: Character, ds: DataStore): number {
  if (!hasShieldEquipped(char, ds)) return 0;
  // The shield's own item_template.block is FLAT_MOD too, and it is the dominant term at 60
  // (Grand Marshal's Aegis 55 vs str 200 → 9). Cite: Player.cpp:7086-7087 _ApplyItemBonuses.
  const ohEntry = equippedEntry(char.equipped.offhand);
  const shieldBlock = (ohEntry != null ? ds.item(ohEntry)?.block : undefined) ?? 0;
  const auraFlat = shieldBlock
    + equippedEquipModAmount(char, ds, 'block_value')
    + equippedEnchantGrantAmount(char, ds, 'block_value');
  // PCT_MOD from passive aura 150 (Shield Specialization). Cite: Player.cpp:4877.
  return shieldBlockValue(effectiveStats(char, ds).str, auraFlat, passiveBlockValuePctMult(char, ds));
}

// Flat +healing done from equip-spell auras (SPELL_AURA_MOD_HEALING_DONE 135). Classic separates
// this from spell damage. Cite: SpellAuras.cpp:3528 HandleModHealingDone.
export function healingPower(char: Character, ds: DataStore): number {
  // Item equipMods + SIE healing_power grants (Enchant Weapon - Healing Power, …). KI-590.
  return equippedEquipModAmount(char, ds, 'healing_done')
    + equippedEnchantGrantAmount(char, ds, 'healing_power');
}

// ---- Creature-type "versus" + spell penetration (equip / OOC buff consumers) ----
// Cite: Unit.cpp MeleeDamageBonusDone :7471; GetResistancePenetration :3890; Unit.h:1432.

/** One versus-bonus row: amount applies when (mask & targetTypeMask) != 0. */
export type VersusBonus = { creatureTypeMask: number; amount: number };

// Target creature type → CMaNGOS type mask bit. Cite: Unit.h GetCreatureTypeMask: type>=1 ? (1<<(type-1)) :
// 0.
export function creatureTypeToMask(creatureType: number): number {
  return creatureType >= 1 ? (1 << (creatureType - 1)) : 0;
}

// Sum versus amounts whose mask overlaps the target's type mask. Cite: Unit.cpp
// GetTotalAuraModifierByMiscMask :4527–4541 (miscvalue & misc_mask).
export function sumVersusForCreatureType(
  bonuses: readonly VersusBonus[] | undefined,
  creatureType: number,
): number {
  if (!bonuses?.length) return 0;
  const typeMask = creatureTypeToMask(creatureType);
  if (!typeMask) return 0;
  let sum = 0;
  for (const b of bonuses) {
    if (((b.creatureTypeMask ?? 0) | 0) & typeMask) sum += b.amount;
  }
  return sum;
}

/** Resolve equip-spell / OOC buff effects (bake or SI5 interpret). */
function resolvedEffectsForSpell(raw: SpellDef | undefined | null, casterLevel?: number): SpellEffect[] {
  if (!raw) return [];
  if (raw.effects?.length) return raw.effects;
  return resolveCombatSpell(raw, casterLevel != null ? { casterLevel } : {}).effects ?? [];
}

// Permanent buff effects of the race's own passives, for selectors that read no aura list. Timed and
// activated racials (Blood Fury, Berserking) are excluded — same guards as forEachPassiveBuffEffect.
export function permanentRacialEffects(char: Character, ds: DataStore): SpellEffect[] {
  const out: SpellEffect[] = [];
  for (const s of racialSpells(ds, char.race)) {
    if (!s.passive || s.stances) continue;
    for (const eff of resolvedEffectsForSpell(s, char.level)) {
      if (eff.kind !== 'buff' || eff.hostile === true) continue;
      if ((eff.durationMs ?? 0) > 0) continue;
      out.push(eff);
    }
  }
  return out;
}

// Walk equipSpells, racial passives and active OOC buffs, yielding every buff effect matching
// `mod` — for mask-bearing auras that cannot collapse into paperdoll equipMods.
function collectBuffEffectsByMod(
  char: Character,
  ds: DataStore,
  mod: string,
  includeTalents = false,
): SpellEffect[] {
  const out: SpellEffect[] = [];
  const seen = new Set<number>();
  const take = (spellId: number): void => {
    const id = spellId | 0;
    if (!id || seen.has(id)) return;
    seen.add(id);
    const raw = ds.spell(id);
    let found = false;
    for (const e of resolvedEffectsForSpell(raw, char.level)) {
      if (e.kind === 'buff' && e.mod === mod) { out.push(e); found = true; }
    }
    if (found || !raw?.rawEffects?.length) return;
    // A PARTIALLY baked spell is the trap: the ETL mapper and the interpreter are two producers, so
    // a row the ETL never learned reads as no such effect. Ask the interpreter before answering no.
    for (const e of resolveCombatSpell(raw, { casterLevel: char.level }).effects ?? []) {
      if (e.kind === 'buff' && e.mod === mod) out.push(e);
    }
  };
  for (const item of equippedItems(char, ds)) {
    for (const sid of item.equipSpells ?? []) take(sid);
  }
  // Random-prop PROP slots: type-3 equip spells (beast slaying, versus AP, …).
  for (const { randomProp } of equippedWithEnchant(char, ds)) {
    for (const sid of randomProp?.equipSpellIds ?? []) take(sid);
  }
  // Permanent racial passives (Beast Slaying, …) — not equip and not activeAuras.
  for (const s of racialSpells(ds, char.race)) take(s.id);
  for (const id of getActiveBuffIds(char, undefined, ds)) take(id);
  // Spent talent ranks are permanent passives too but are in neither equipSpells nor activeAuras.
  // Opt-in per mod: any mod characterTalents.ts already sums would double-apply here.
  if (includeTalents) for (const id of spentTalentRankSpellIds(char, ds)) take(id);
  return out;
}

// SPELL_AURA_OVERRIDE_CLASS_SCRIPTS (112) misc values the sheet carries. A spent talent is an aura
// in C++ but neither a buff nor a spellbook row here, so `buffActive` alone finds nothing.
export function overrideClassScriptIds(
  char: Character,
  ds: DataStore,
  sb?: SpellBook | null,
): number[] {
  const out = new Set<number>();
  const take = (spellId: number): void => {
    const raw = ds.spell(spellId | 0);
    for (const e of raw?.rawEffects ?? []) {
      if (((e as { auraName?: number }).auraName ?? 0) !== SPELL_AURA_OVERRIDE_CLASS_SCRIPTS) continue;
      const misc = ((e as { miscValue?: number }).miscValue ?? 0) | 0;
      if (misc) out.add(misc);
    }
  };
  for (const id of spentTalentRankSpellIds(char, ds)) take(id);
  for (const id of sb?.known ?? []) if (ds.spell(id)?.passive) take(id);
  return [...out];
}

// Rank spell id per talent point spent, plus its spell_learn_spell dependents (24866 -> 24864, the
// dodge half of Feline Swiftness). Cite: Player.cpp:3412 addSpell SpellLearnSpellMapBounds.
export function spentTalentRankSpellIds(char: Character, ds: DataStore): number[] {
  const out: number[] = [];
  const meta = ds.combatSkillMeta?.();
  for (const [tidStr, rank] of Object.entries(char.talents ?? {})) {
    const tid = Number(tidStr);
    const r = (rank as number) | 0;
    if (!tid || r <= 0) continue;
    const tal = ds.talent(tid);
    if (!tal?.ranks?.length) continue;
    const spellId = tal.ranks[Math.min(r, tal.ranks.length) - 1]?.spellId | 0;
    if (!spellId) continue;
    out.push(spellId);
    for (const dep of spellLearnDependents(spellId, meta)) if (dep && !out.includes(dep)) out.push(dep);
  }
  return out;
}

// Every permanent passive the character owns — racials, known passives, spent talent ranks — as ONE
// list for every GetTotalAuraModifier fold. Per-source scans are how 59 talents shipped dead.
function passiveSpells(
  char: Character,
  ds: DataStore,
  knownSpellIds?: readonly number[],
): SpellDef[] {
  const seen = new Set<number>();
  const out: SpellDef[] = [];
  const take = (id: number): void => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const raw = ds.spell(id);
    // A Stances-gated passive is live only inside its form (Sharpened Claws, Defiance), never dropped.
    // The form-apply half (24864) is DO_NOT_DISPLAY rather than PASSIVE, so ask the form gate too.
    if (!raw) return;
    const form = ((char.form ?? 0) | 0) as ShapeshiftFormId;
    if (!raw.passive && !isNeedCastSpellAtFormApply(raw, form)) return;
    if (!passiveAppliesInForm(raw, form)) return;
    out.push(raw);
  };
  for (const s of racialSpells(ds, char.race)) take(s.id);
  if (knownSpellIds) for (const id of knownSpellIds) take(id | 0);
  for (const id of spentTalentRankSpellIds(char, ds)) take(id);
  return out;
}

/** Permanent (never timed — those seed combat via liveBuffs) buff effects of `mod` across passives. */
function forEachPassiveBuffEffect(
  char: Character,
  ds: DataStore,
  mod: string,
  knownSpellIds: readonly number[] | undefined,
  cb: (amount: number) => void,
): void {
  for (const raw of passiveSpells(char, ds, knownSpellIds)) {
    let found = false;
    const fold = (effs: readonly SpellEffect[] | undefined): void => {
      for (const e of effs ?? []) {
        if (e.kind !== 'buff' || e.mod !== mod || e.hostile === true) continue;
        if ((e.durationMs ?? 0) > 0) continue;
        const amt = Number(e.amount);
        if (!Number.isFinite(amt) || !amt) continue;
        found = true;
        cb(amt);
      }
    };
    fold(raw.effects);
    // Partially baked rows drop effects the ETL never wrote — ask the interpreter too.
    // Cite: collectBuffEffectsByMod trap above (Heightened Senses).
    if (!found && raw.rawEffects?.length) {
      fold(resolveCombatSpell(raw, { casterLevel: char.level, unitTargetIsPlayer: true }).effects);
    }
  }
}

// GetTotalAuraModifier(auraType) over permanent passives, in percentage points. Cite:
// StatSystem.cpp:397/:454/:490 Update{Block,Parry,Dodge}Percentage — talents are auras like any other.
export function passiveBuffModPoints(
  char: Character,
  ds: DataStore,
  mod: string,
  knownSpellIds?: readonly number[],
): number {
  let pts = 0;
  forEachPassiveBuffEffect(char, ds, mod, knownSpellIds, (amt) => { pts += amt; });
  return pts;
}

// SHIELD_BLOCK_VALUE PCT_MOD from passive aura 150 rows, multiplicative per aura.
// Cite: Player.cpp:4877 GetShieldBlockValue; SpellAuras.cpp:4428 HandleShieldBlockValue.
export function passiveBlockValuePctMult(
  char: Character,
  ds: DataStore,
  knownSpellIds?: readonly number[],
): number {
  let mult = 1;
  forEachPassiveBuffEffect(char, ds, 'block_value_pct', knownSpellIds, (amt) => {
    mult *= (100 + amt) / 100;
  });
  return mult;
}

/** SpellAuraDefines.h:277 SPELL_AURA_MOD_BASE_RESISTANCE_PCT (Toughness / Thick Hide). */
const SPELL_AURA_MOD_BASE_RESISTANCE_PCT = 142;

// UNIT_MOD_ARMOR BASE_PCT product over `spells`, off the resolved `armor_base_pct` surface. Aura
// 142 is a PCT_MOD, so the auras multiply rather than sum. Cite: SpellAuras.cpp:3425.
function baseArmorPctMultOf(
  char: Character,
  ds: DataStore,
  spells: Iterable<SpellDef>,
): number {
  let mult = 1;
  for (const raw of spells) {
    // 48 spells in the whole game carry aura 142 — gate on that before resolving anything.
    if (!raw.rawEffects?.some((r) => ((r.auraName ?? 0) | 0) === SPELL_AURA_MOD_BASE_RESISTANCE_PCT)) continue;
    const baked = (raw.effects ?? []).filter((e) => e.kind === 'buff' && e.mod === 'armor_base_pct');
    // Partially baked rows (every talent rank: effects[] empty) — ask the interpreter.
    const effs = baked.length
      ? baked
      : resolveCombatSpell(raw, { casterLevel: char.level, unitTargetIsPlayer: true }).effects;
    for (const e of effs) {
      if (e.kind !== 'buff' || e.mod !== 'armor_base_pct' || e.hostile === true) continue;
      const amt = Number(e.amount);
      if (Number.isFinite(amt) && amt) mult *= (100 + amt) / 100;
    }
  }
  return mult;
}

/** UNIT_MOD_ARMOR BASE_PCT from passive aura 142 rows (Toughness, Thick Hide). */
export function passiveBaseArmorPctMult(
  char: Character,
  ds: DataStore,
  knownSpellIds?: readonly number[],
): number {
  return baseArmorPctMultOf(char, ds, passiveSpells(char, ds, knownSpellIds));
}

// UNIT_MOD_ARMOR BASE_PCT from TIMED aura 142 rows (Lay on Hands 20233, pet armor 27208).
// Passives are excluded — passiveBaseArmorPctMult owns those, and both multiply the same base.
export function activeBaseArmorPctMult(char: Character, ds: DataStore): number {
  const spells: SpellDef[] = [];
  for (const id of getActiveBuffIds(char, undefined, ds)) {
    const raw = ds.spell(id);
    if (raw && !raw.passive) spells.push(raw);
  }
  return baseArmorPctMultOf(char, ds, spells);
}

/** MOD_MELEE_ATTACK_POWER_VERSUS (102) rows from equip + OOC buffs. */
export function attackPowerVersusBonuses(char: Character, ds: DataStore): VersusBonus[] {
  const out: VersusBonus[] = [];
  for (const e of collectBuffEffectsByMod(char, ds, 'attack_power_versus')) {
    if (e.kind !== 'buff') continue;
    const mask = (e.creatureTypeMask ?? 0) | 0;
    const amount = Number(e.amount);
    if (!mask || !Number.isFinite(amount) || !amount) continue;
    out.push({ creatureTypeMask: mask, amount });
  }
  return out;
}

/** MOD_RANGED_ATTACK_POWER_VERSUS (131) rows from equip + OOC buffs. */
export function rangedAttackPowerVersusBonuses(char: Character, ds: DataStore): VersusBonus[] {
  const out: VersusBonus[] = [];
  for (const e of collectBuffEffectsByMod(char, ds, 'ranged_attack_power_versus')) {
    if (e.kind !== 'buff') continue;
    const mask = (e.creatureTypeMask ?? 0) | 0;
    const amount = Number(e.amount);
    if (!mask || !Number.isFinite(amount) || !amount) continue;
    out.push({ creatureTypeMask: mask, amount });
  }
  return out;
}

/** MOD_FLAT_SPELL_DAMAGE_VERSUS (180) rows from equip + OOC buffs. */
export function spellDamageVersusBonuses(char: Character, ds: DataStore): VersusBonus[] {
  const out: VersusBonus[] = [];
  for (const e of collectBuffEffectsByMod(char, ds, 'spell_damage_versus')) {
    if (e.kind !== 'buff') continue;
    const mask = (e.creatureTypeMask ?? 0) | 0;
    const amount = Number(e.amount);
    if (!mask || !Number.isFinite(amount) || !amount) continue;
    out.push({ creatureTypeMask: mask, amount });
  }
  return out;
}

/** MOD_DAMAGE_DONE_VERSUS (168) percent rows from equip + OOC buffs. */
export function damageDoneVersusPctBonuses(char: Character, ds: DataStore): VersusBonus[] {
  const out: VersusBonus[] = [];
  for (const e of collectBuffEffectsByMod(char, ds, 'damage_done_versus_pct', true)) {
    if (e.kind !== 'buff') continue;
    const mask = (e.creatureTypeMask ?? 0) | 0;
    const amount = Number(e.amount);
    if (!mask || !Number.isFinite(amount) || !amount) continue;
    out.push({ creatureTypeMask: mask, amount });
  }
  return out;
}

// MOD_CRIT_PERCENT_VERSUS (169) rows — whole percent added to the CRIT MULTIPLIER when the target
// creature type matches. Monster and Humanoid Slaying are the only vanilla sources, both talents.
export function critDamageVersusPctBonuses(char: Character, ds: DataStore): VersusBonus[] {
  const out: VersusBonus[] = [];
  for (const e of collectBuffEffectsByMod(char, ds, 'crit_damage_versus_pct', true)) {
    if (e.kind !== 'buff') continue;
    const mask = (e.creatureTypeMask ?? 0) | 0;
    const amount = Number(e.amount);
    if (!mask || !Number.isFinite(amount) || !amount) continue;
    out.push({ creatureTypeMask: mask, amount });
  }
  return out;
}

// SPELL_AURA_MOD_OFFHAND_DAMAGE_PCT (122) total, whole percent. Cite: SpellAuras.cpp:4175-4184
// UNIT_MOD_DAMAGE_OFFHAND TOTAL_PCT.
export function offhandDamagePctBonus(char: Character, ds: DataStore): number {
  let sum = 0;
  for (const e of collectBuffEffectsByMod(char, ds, 'offhand_damage_pct', true)) {
    if (e.kind !== 'buff') continue;
    const amount = Number(e.amount);
    if (Number.isFinite(amount)) sum += amount;
  }
  return sum;
}

// SPELL_AURA_MOD_RESISTANCE_OF_STAT_PERCENT (182) total, whole percent of INTELLECT into armor. Cite:
// StatSystem.cpp:125-138 Player::UpdateArmor.
export function armorFromIntellectPct(char: Character, ds: DataStore): number {
  let sum = 0;
  for (const e of collectBuffEffectsByMod(char, ds, 'armor_from_intellect_pct', true)) {
    if (e.kind !== 'buff') continue;
    const amount = Number(e.amount);
    if (Number.isFinite(amount)) sum += amount;
  }
  return sum;
}

// Victim-side attacker-chance auras (185-188), summed as signed percentage points. A defensive
// talent ships a negative amount and the attacker's roll subtracts it. Cite: Unit.cpp:3525.
export function attackerChanceBonus(
  char: Character,
  ds: DataStore,
  mod: 'attacker_melee_crit' | 'attacker_ranged_crit' | 'attacker_ranged_hit',
): number {
  let sum = 0;
  for (const e of collectBuffEffectsByMod(char, ds, mod, true)) {
    if (e.kind !== 'buff') continue;
    const amount = Number(e.amount);
    if (Number.isFinite(amount)) sum += amount;
  }
  return sum;
}

// MOD_ATTACKER_SPELL_HIT_CHANCE (186) per school. The aura is mask-bearing, so a Heightened
// Senses row (mask 126, every magic school) only touches magic spells. Cite: Unit.cpp:3873.
export function attackerSpellHitBySchool(
  char: Character,
  ds: DataStore,
): Partial<Record<School, number>> {
  const out: Partial<Record<School, number>> = {};
  for (const e of collectBuffEffectsByMod(char, ds, 'attacker_spell_hit', true)) {
    if (e.kind !== 'buff') continue;
    const mask = ((e as { schoolMask?: number }).schoolMask ?? 0) | 0;
    const amount = Number(e.amount);
    if (!mask || !Number.isFinite(amount) || !amount) continue;
    for (const [sch, bit] of Object.entries(SCHOOL_MASK_BIT) as [School, number][]) {
      if (mask & bit) out[sch] = (out[sch] ?? 0) + amount;
    }
  }
  return out;
}

// SPELL_AURA_MOD_DAMAGE_DONE_CREATURE (59) flats from permanent enchant grants (Beastslayer / Elemental
// Slayer). Cite: Unit.cpp:7465 MeleeDamageBonusDone DoneFlat; :7061 SpellDamageBonusDone; KI-1043.
export function damageDoneCreatureBonuses(char: Character, ds: DataStore): VersusBonus[] {
  const out: VersusBonus[] = [];
  for (const { grant } of equippedWithEnchant(char, ds)) {
    if (!grant?.grants?.length) continue;
    for (const g of grant.grants) {
      if (g.kind !== 'damage_done_creature') continue;
      const mask = (g.creatureTypeMask ?? 0) | 0;
      const amount = Number(g.amount);
      if (!mask || !Number.isFinite(amount) || !amount) continue;
      out.push({ creatureTypeMask: mask, amount });
    }
  }
  return out;
}

// Permanent SIE TYPE_COMBAT_SPELL → gearProcs (CastItemCombatSpell). PPM/chance from the grant only — never
// invented. Cite: Player.cpp:7403–7447; KI-1044.
export function permanentEnchantCombatProcs(
  char: Character,
  ds: DataStore,
): Array<{ spell: number; trigger: number; chancePct?: number; ppm?: number }> {
  const out: Array<{ spell: number; trigger: number; chancePct?: number; ppm?: number }> = [];
  const seen = new Set<number>();
  for (const { grant } of equippedWithEnchant(char, ds)) {
    const c = grant?.combat;
    if (!c?.spellId || seen.has(c.spellId)) continue;
    seen.add(c.spellId);
    const row: { spell: number; trigger: number; chancePct?: number; ppm?: number } = {
      spell: c.spellId,
      trigger: 2, // ITEM_SPELLTRIGGER_CHANCE_ON_HIT
    };
    if (c.chancePct != null && c.chancePct > 0) row.chancePct = c.chancePct;
    if (c.ppm != null && c.ppm > 0) row.ppm = c.ppm;
    out.push(row);
  }
  return out;
}

// Permanent SIE equip_spell proc_spell (chest Absorption) → startProcTriggers rows. Holder =
// equip_spell.spellId; trigger = grant.spellId. Cite: aura 42; KI-1045.
export function permanentEnchantProcTriggers(
  char: Character,
  ds: DataStore,
): Array<{
  spellId: number;
  name: string;
  triggerSpellId: number;
  remainingMs: number;
  charges?: number;
  cooldownMs?: number;
  procFlags?: number;
  procPpm?: number | null;
  procChance?: number | null;
}> {
  const out: Array<{
    spellId: number;
    name: string;
    triggerSpellId: number;
    remainingMs: number;
    charges?: number;
    cooldownMs?: number;
    procFlags?: number;
    procPpm?: number | null;
    procChance?: number | null;
  }> = [];
  const seen = new Set<number>();
  for (const [slot, v] of Object.entries(char.equipped ?? {}) as [EquipSlot, EquippedValue | undefined][]) {
    const entry = equippedEntry(v);
    if (entry == null) continue;
    const item = ds.item(entry);
    if (!item || isBroken(char, slot, item)) continue;
    const inst = equippedInstance(v);
    const eid = inst?.permEnchantId ?? char.enchants?.[slot];
    if (eid == null) continue;
    const formula = ds.enchant(eid);
    const sieId = formula?.enchantId ?? eid;
    const sie = ds.itemEnchant(sieId);
    if (!sie?.effects?.length) continue;
    for (const eff of sie.effects) {
      if (eff.type !== 'equip_spell' || !eff.spellId) continue;
      for (const g of eff.grants ?? []) {
        if (g.kind !== 'proc_spell' || !g.spellId) continue;
        if (seen.has(eff.spellId)) continue;
        seen.add(eff.spellId);
        const raw = ds.spell(eff.spellId);
        const sp = raw ? resolveCombatSpell(raw, { casterLevel: char.level }) : undefined;
        const pe = sp?.effects?.find((e) => e.kind === 'proc_trigger_spell');
        const triggerSpellId =
          (pe && pe.kind === 'proc_trigger_spell' ? pe.triggerSpellId : 0) || g.spellId;
        if (!triggerSpellId) continue;
        const procFlags = sp?.procFlags ?? sp?.spellProcEvent?.procFlags;
        const procPpm = sp?.spellProcEvent?.ppmRate ?? null;
        let procChance: number | null = null;
        if (g.chancePct != null && g.chancePct > 0) {
          procChance = Math.min(1, g.chancePct / 100);
        } else if (sp?.spellProcEvent?.customChance != null && sp.spellProcEvent.customChance > 0) {
          const c = sp.spellProcEvent.customChance;
          procChance = c > 1 ? Math.min(1, c / 100) : Math.min(1, c);
        } else if (sp?.procChance != null && sp.procChance > 0 && sp.procChance <= 100) {
          procChance = Math.min(1, sp.procChance / 100);
        }
        out.push({
          spellId: eff.spellId,
          name: sp?.name ?? raw?.name ?? `enchant-proc ${eff.spellId}`,
          triggerSpellId,
          // Permanent while equipped — fight clock, not wall clock.
          remainingMs: 24 * 60 * 60 * 1000,
          charges: pe && pe.kind === 'proc_trigger_spell' ? pe.charges : sp?.procCharges,
          cooldownMs:
            (pe && pe.kind === 'proc_trigger_spell' ? pe.cooldownMs : undefined)
            ?? sp?.spellProcEvent?.cooldownMs,
          ...(procFlags != null && procFlags !== 0 ? { procFlags } : {}),
          ...(procPpm != null && procPpm > 0 ? { procPpm } : {}),
          ...(procChance != null ? { procChance } : {}),
        });
      }
    }
  }
  return out;
}

// MOD_TARGET_RESISTANCE (123) from equip + OOC buffs → positive penetration per school. DBC amount is
// typically negative; pen = −amount. Cite: Unit.cpp:3892–3894.
export function equipResistancePenetration(
  char: Character,
  ds: DataStore,
): Partial<Record<School, number>> {
  const pen: Partial<Record<School, number>> = {};
  for (const e of collectBuffEffectsByMod(char, ds, 'target_resistance')) {
    if (e.kind !== 'buff') continue;
    const schoolMask = (e.schoolMask ?? 0) | 0;
    const amount = Number(e.amount);
    if (!schoolMask || !Number.isFinite(amount) || !amount) continue;
    const p = -amount; // sign reverse — aura is "mod target resistance"
    if (!p) continue;
    for (const [sch, bit] of Object.entries(SCHOOL_MASK_BIT) as [School, number][]) {
      if (schoolMask & bit) pen[sch] = (pen[sch] ?? 0) + p;
    }
  }
  return pen;
}

/** Merge two partial school maps (additive). */
export function mergeSchoolAmounts(
  a: Partial<Record<School, number>> | undefined,
  b: Partial<Record<School, number>> | undefined,
): Partial<Record<School, number>> | undefined {
  if (!a && !b) return undefined;
  const out: Partial<Record<School, number>> = { ...(a ?? {}) };
  for (const [sch, amt] of Object.entries(b ?? {}) as [School, number][]) {
    out[sch] = (out[sch] ?? 0) + amt;
  }
  return out;
}

// Per-school magic resistance from racial passives plus active resistance buffs, data-driven off
// `resist` effects. Lowers incoming magic damage and the chance a crowd control lands.
export function resistances(char: Character, ds: DataStore): Partial<Record<School, number>> {
  const out: Partial<Record<School, number>> = {};
  const add = (effs: SpellDef['effects'] | undefined): void => {
    for (const e of effs ?? []) if (e.kind === 'resist') out[e.school] = (out[e.school] ?? 0) + e.amount;
  };
  for (const s of racialSpells(ds, char.race)) add(s.effects);
  for (const id of getActiveBuffIds(char, undefined, ds)) add(ds.spell(id)?.effects);
  // Talent resist mods (e.g. +fire resist talents) — additive with racials/buffs.
  const tRes = talentResistMods(char, ds);
  for (const [sch, amt] of Object.entries(tRes) as [School, number][]) {
    out[sch] = (out[sch] ?? 0) + amt;
  }
  // Gear item/enchant resistances (Item 5 itemization: resFire etc on stats[])
  const gear = equippedStatBonuses(char, ds);
  const resMap: Array<[keyof Partial<Record<Stat, number>>, School]> = [
    ['resHoly', 'holy'], ['resFire', 'fire'], ['resNature', 'nature'],
    ['resFrost', 'frost'], ['resShadow', 'shadow'], ['resArcane', 'arcane'],
  ];
  for (const [k, sch] of resMap) {
    const v = gear[k];
    if (v) out[sch] = (out[sch] ?? 0) + v;
  }
  return out;
}

// SPELL_AURA_MOD_MECHANIC_RESISTANCE totals by mechanic id (Hardiness stun=12 → +25). Racials + active
// buffs; resolveCombatSpell fills hollow racials. Cite: Unit.cpp:4016; KI-823.
export function mechanicResistPct(
  char: Character,
  ds: DataStore,
  knownSpellIds?: readonly number[],
): Partial<Record<number, number>> {
  const out: Partial<Record<number, number>> = {};
  const add = (raw: SpellDef | undefined | null): void => {
    if (!raw) return;
    const sp = resolveCombatSpell(raw, { unitTargetIsPlayer: true });
    for (const e of sp.effects ?? []) {
      if (e.kind !== 'mod_mechanic_resistance') continue;
      const mid = e.mechanic | 0;
      const amt = e.amount | 0;
      if (!mid || !amt) continue;
      out[mid] = (out[mid] ?? 0) + amt;
    }
  };
  for (const s of racialSpells(ds, char.race)) add(s);
  if (knownSpellIds) {
    for (const id of knownSpellIds) add(ds.spell(id));
  }
  // Spent talent ranks (Iron Will, Surefooted) are permanent passives that sit in no spellbook.
  // Passive-gated: a rank that IS the active (Deterrence) applies on cast instead.
  for (const id of spentTalentRankSpellIds(char, ds)) {
    const raw = ds.spell(id);
    if (raw?.passive && passiveAppliesInForm(raw, ((char.form ?? 0) | 0) as ShapeshiftFormId)) add(raw);
  }
  for (const id of getActiveBuffIds(char, undefined, ds)) add(ds.spell(id));
  return out;
}

/** CMaNGOS creature-type for CC immunity checks: an Undead hero counts as Undead, everyone else Humanoid. */
export function combatantCreatureType(char: Character): number {
  return char.race === RACE.UNDEAD ? CREATURE_TYPE.UNDEAD : CREATURE_TYPE.HUMANOID;
}

export function weaponProfile(char: Character, ds: DataStore): WeaponProfile {
  const mh = equippedEntry(char.equipped.mainhand);
  const it = mh != null ? ds.item(mh) : undefined;
  // A broken weapon deals no weapon damage — you fight unarmed until it's repaired.
  if (it?.weapon && !isBroken(char, 'mainhand', it)) {
    return { dmgMin: it.weapon.dmgMin, dmgMax: it.weapon.dmgMax, speedMs: it.weapon.delayMs, school: it.weapon.school, twoHand: it.slot === 'twohand' };
  }
  return { dmgMin: 1, dmgMax: 2, speedMs: 2000, school: 'physical' }; // unarmed (Unit.h BASE_MIN/MAXDAMAGE + 2s)
}

// Off-hand weapon combat profile when the off-hand holds a weapon. Null when empty, a shield,
// broken, or a non-weapon. Cite: Player::hasOffhandWeaponForAttack / GetWeaponForAttack.
export function offhandWeaponProfile(char: Character, ds: DataStore): WeaponProfile | null {
  const oh = equippedEntry(char.equipped.offhand);
  if (oh == null) return null;
  const it = ds.item(oh);
  if (!it?.weapon || isBroken(char, 'offhand', it)) return null;
  // Shields are offhand armor with no weapon; holdables without weapon stay null above.
  return {
    dmgMin: it.weapon.dmgMin,
    dmgMax: it.weapon.dmgMax,
    speedMs: it.weapon.delayMs,
    school: it.weapon.school,
  };
}

// True when dual-wielding: off-hand is a weapon (not a shield). Drives +19% miss and OH autos. source:
// Unit.cpp hasOffhandWeaponForAttack; CalculateEffectiveMissChance dual-wield branch
export function isDualWielding(char: Character, ds: DataStore): boolean {
  return offhandWeaponProfile(char, ds) != null;
}

// The equipped ranged weapon (wand, bow, gun) as a combat profile, or null when empty or broken.
// Powers Shoot and Auto Shot; the main-hand melee auto-attack is unaffected.
export function rangedProfile(char: Character, ds: DataStore): WeaponProfile | null {
  const r = equippedEntry(char.equipped.ranged);
  const it = r != null ? ds.item(r) : undefined;
  if (it?.weapon && !isBroken(char, 'ranged', it)) {
    return { dmgMin: it.weapon.dmgMin, dmgMax: it.weapon.dmgMax, speedMs: it.weapon.delayMs, school: it.weapon.school };
  }
  return null;
}
