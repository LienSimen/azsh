// Handing consumables out to the party or the raid: who gets a stack and how it splits. Pure domain.
// The "auto" verdict is the same weightscale Gear the roster prices gear with (playerbotStatWeight).

import type { DataStore } from '../../data/dataStore.ts';
import { CLASS, type BuffMod, type ItemDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import type { Inventory } from '../items/inventory.ts';
import { countItem } from '../items/inventory.ts';
import { className, classPowerType } from '../core/ids.ts';
import { powerTypeName } from '../../engine/spells/effects.ts';
import { resolveCombatSpell } from '../../engine/spells/interpreter/index.ts';
import { wellFedPendingFromItem } from '../../progression/rest.ts';
import { checkAmmoCompatibility } from '../items/ammo.ts';
import { equippedEntry } from '../items/itemInstance.ts';
import { itemUseGates } from '../items/itemRestrictions.ts';
import { consumableFamilyKey, consumableFamilyLabel, consumableRoleOf, restoredPowerTypeIndex } from '../items/consumableFamily.ts';
import { isCraftSpell, reagentDemand, reagentSpellFor, spellTeachBook, spendsAsReagent } from '../items/spellReagentIndex.ts';
import { scanTempWeaponImbueHands } from '../professions/weaponImbueHand.ts';
import { companionCharacter, companionLevel, companionSpellbook, type Companion } from './squad.ts';
import {
  calculateSingleStatWeight,
  characterPlayerbotSpecId,
  companionPlayerbotSpecId,
  playerbotWeightScale,
} from './playerbotStatWeight.ts';

/** The four groups the operator asked for: role for tanks and healers, weightscale for the rest. */
export type ShareGroup = 'tank' | 'healer' | 'caster' | 'melee';
export const SHARE_GROUPS: readonly ShareGroup[] = ['tank', 'healer', 'caster', 'melee'];

export type ShareRule =
  | { kind: 'auto' }
  | { kind: 'even' }
  | { kind: 'group'; group: ShareGroup }
  | { kind: 'class'; cls: number }
  | { kind: 'one'; companionId: string }
  | { kind: 'keep' };

export type ShareScope = 'party' | 'raid';

export interface ConsumableShareState {
  /** Rule per share key (a rank ladder or `e:<entry>`). Absent key = auto. */
  rules: Record<string, ShareRule>;
  /** Party is the four seats; raid is the lineup picked on the 10/20/40 tab. */
  scope?: ShareScope;
  /** You count as one recipient of an even split. Default true. */
  includeYou?: boolean;
  /** Kits left out of the panel and of Share all. Absent = every kit. */
  off?: ShareCategory[];
}

export function emptyConsumableShare(): ConsumableShareState {
  return { rules: {} };
}

function isShareRule(v: unknown): v is ShareRule {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  switch (r.kind) {
    case 'auto': case 'even': case 'keep': return true;
    case 'group': return (SHARE_GROUPS as readonly string[]).includes(String(r.group));
    case 'class': return typeof r.cls === 'number' && r.cls > 0;
    case 'one': return typeof r.companionId === 'string' && r.companionId.length > 0;
    default: return false;
  }
}

export function normalizeConsumableShare(raw: unknown): ConsumableShareState {
  const out = emptyConsumableShare();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (r.rules && typeof r.rules === 'object') {
    for (const [k, v] of Object.entries(r.rules as Record<string, unknown>)) {
      if (isShareRule(v)) out.rules[k] = v;
    }
  }
  if (r.scope === 'party' || r.scope === 'raid') out.scope = r.scope;
  if (typeof r.includeYou === 'boolean') out.includeYou = r.includeYou;
  if (Array.isArray(r.off)) {
    const off = r.off.filter((c): c is ShareCategory =>
      (SHARE_CATEGORIES as readonly string[]).includes(String(c)));
    if (off.length) out.off = off;
  }
  return out;
}

/** A rule as one <select> value ("group:tank", "class:8", "one:c3f"), and back. */
export function shareRuleValue(rule: ShareRule): string {
  switch (rule.kind) {
    case 'group': return `group:${rule.group}`;
    case 'class': return `class:${rule.cls}`;
    case 'one': return `one:${rule.companionId}`;
    default: return rule.kind;
  }
}

export function parseShareRule(v: string): ShareRule | null {
  if (v === 'auto' || v === 'even' || v === 'keep') return { kind: v };
  const [head, ...rest] = v.split(':');
  const tail = rest.join(':');
  if (head === 'group' && (SHARE_GROUPS as readonly string[]).includes(tail)) return { kind: 'group', group: tail as ShareGroup };
  if (head === 'class' && Number(tail) > 0) return { kind: 'class', cls: Number(tail) };
  if (head === 'one' && tail) return { kind: 'one', companionId: tail };
  return null;
}

/** Rank ladder when the item has one, so a rule set on Minor Healing Potion covers every rung. */
export function shareKeyOf(it: ItemDef, ds: DataStore): string {
  return consumableFamilyKey(it, ds) ?? `e:${it.entry}`;
}

export function shareKeyLabel(key: string, ds: DataStore): string {
  if (key.startsWith('e:')) return ds.item(Number(key.slice(2)))?.name ?? key;
  return consumableFamilyLabel(key);
}

/** What KIND of kit a stack belongs to — the sections the panel groups by. */
export type ShareCategory = 'restore' | 'buff' | 'food' | 'coat' | 'device' | 'bandage' | 'ammo' | 'reagent';

export const SHARE_CATEGORIES: readonly ShareCategory[] =
  ['restore', 'buff', 'food', 'coat', 'device', 'bandage', 'ammo', 'reagent'];

export const SHARE_CATEGORY_LABEL: Record<ShareCategory, string> = {
  restore: 'Potions, runes and healthstones',
  buff: 'Elixirs, flasks and scrolls',
  food: 'Food buffs',
  coat: 'Weapon coats',
  device: 'Bombs and engineering devices',
  bandage: 'Bandages',
  ammo: 'Ammo',
  reagent: 'Spell reagents',
};

/** Short labels for the kit filter checkboxes. */
export const SHARE_CATEGORY_FILTER_LABEL: Record<ShareCategory, string> = {
  restore: 'Potions',
  buff: 'Elixirs',
  food: 'Food buffs',
  coat: 'Coats',
  device: 'Bombs',
  bandage: 'Bandages',
  ammo: 'Ammo',
  reagent: 'Reagents',
};

/** Cite: ItemPrototype.h ItemClass — CONSUMABLE 0, REAGENT 5, PROJECTILE 6, TRADE_GOODS 7, QUEST 12, MISC 15. */
const ITEM_CLASS_CONSUMABLE = 0;
const ITEM_CLASS_REAGENT = 5;
const ITEM_CLASS_PROJECTILE = 6;
const ITEM_CLASS_TRADE_GOODS = 7;
const ITEM_CLASS_QUEST = 12;
const ITEM_CLASS_MISC = 15;
/** item_template.class 9 — a Recipe teaches, it is never consumed. Cite: ItemPrototype.h ITEM_CLASS_RECIPE. */
const ITEM_CLASS_RECIPE = 9;
/** item_template.bonding 4 — bound to a quest. Cite: ItemPrototype.h ItemBondingType. */
const BIND_QUEST_ITEM = 4;
/** Trade-goods subclasses engineering builds, and nothing else does. Cite: ItemPrototype.h ItemSubclassTradeGoods. */
const SUBCLASS_EXPLOSIVES = 2;
const SUBCLASS_DEVICES = 3;
/** SkillLine 202. An item_template row carrying it is an engineering device. Cite: SkillLine.dbc. */
const ENGINEERING_SKILL = 202;

/** The on-use spell an item casts, whichever field carries it. */
function useSpellIdOf(it: ItemDef): number | null {
  const id = it.useSpell ?? it.useInCombat?.spellId;
  return id != null && id > 0 ? id : null;
}

/** Effects of an item's on-use spell, resolved when the bake stored only rawEffects. */
function useSpellEffects(it: ItemDef, ds: DataStore): ReturnType<typeof resolveCombatSpell>['effects'] {
  const id = useSpellIdOf(it);
  const raw = id != null ? ds.spell(id) : undefined;
  if (!raw) return [];
  return (raw.effects?.length ? raw.effects : resolveCombatSpell(raw).effects) ?? [];
}

/** A sit-and-eat meal runs 20-30s; anything a food row leaves past a minute is a carried buff. */
const MEAL_MS = 60_000;

// A meal that leaves something behind — Well Fed, a triggered aura, or a regen aura outlasting the sit.
function buffsOnUse(it: ItemDef, ds: DataStore): boolean {
  if (it.useBuff) return true;
  return useSpellEffects(it, ds).some((e) => e.kind === 'buff'
    || e.kind === 'trigger_spell' || e.kind === 'proc_trigger_spell'
    || (('durationMs' in e ? e.durationMs ?? 0 : 0) > MEAL_MS));
}

/** A short sit-eat or sit-drink. Mageblood's 1h drink stamp is a potion, not a meal. */
function isSitEat(it: ItemDef): boolean {
  const cons = it.consumable?.effect;
  if (cons !== 'food' && cons !== 'drink') return false;
  return (it.consumable?.durationMs ?? 0) <= MEAL_MS;
}

/** SPELL_MECHANIC_BANDAGE on the use spell — the same read consumables.ts:59 makes. */
function isBandageItem(it: ItemDef, ds: DataStore): boolean {
  const id = useSpellIdOf(it);
  return id != null && ds.spell(id)?.mechanic === 'bandage';
}

// A scope, an armor kit, a rod enchant: it applies a PERMANENT enchant and belongs to enchantItem,
// not to a split. Only the temporary applicators (poisons, stones, oils) are a weapon coat.
function isPermanentEnchantItem(it: ItemDef, ds: DataStore): boolean {
  const id = it.useSpell;
  return id != null && ds.enchantApplicator(id)?.permanent === true;
}

/** 1 << ITEM_SUBCLASS_FISHING_POLE. Cite: ItemPrototype.h ITEM_SUBCLASS_FISHING_POLE 20. */
const FISHING_POLE_MASK = 1 << 20;

// Nightcrawlers coat a fishing pole, not a weapon anyone pulls with; the party does not share bait.
function isFishingLure(it: ItemDef, ds: DataStore): boolean {
  const app = it.useSpell != null ? ds.enchantApplicator(it.useSpell) : undefined;
  return app?.target?.subClassMask === FISHING_POLE_MASK;
}

// A shard belongs to the warlock who drained it — each one banks their own, so it is never split.
// Cite: 9c8cfccf6; SpellEffects.cpp Drain Soul EffectItemType 6265.
const SOUL_SHARD_ENTRY = 6265;

// Cooking's product is a meal. HP-only fish is not a food buff; Sagefish Delight's Well Fed is.
const cookingMemo = new WeakMap<DataStore, ReadonlySet<number>>();
function cookingProducts(ds: DataStore): ReadonlySet<number> {
  let set = cookingMemo.get(ds);
  if (set) return set;
  const out = new Set<number>();
  for (const r of ds.recipes()) {
    if (r.skill !== 'cooking') continue;
    const e = r.product?.item ?? 0;
    if (e > 0) out.add(e);
  }
  set = out;
  cookingMemo.set(ds, set);
  return set;
}

// Which kit a bag stack belongs to, or null when it is not shareable at all. The reagent read is
// the bake's spender index, so the kit no longer depends on who is standing here.
export function shareCategoryOf(
  it: ItemDef | undefined,
  ds: DataStore,
): ShareCategory | null {
  if (!it || it.slot != null || it.notObtainable || it.entry === SOUL_SHARD_ENTRY) return null;
  if (it.itemClass === ITEM_CLASS_RECIPE) return null;
  // A quest item handed away is a quest you can no longer finish. Cite: ItemPrototype.h
  // ItemBondingType BIND_QUEST_ITEM 4; item_template.startquest.
  if ((it.bonding ?? it.binding ?? 0) === BIND_QUEST_ITEM || (it.startQuest ?? 0) > 0) return null;
  const role = consumableRoleOf(it, ds);
  if (role === 'weapon_imbue') return isFishingLure(it, ds) ? null : 'coat';
  if (isPermanentEnchantItem(it, ds)) return null;
  if (it.itemClass === ITEM_CLASS_PROJECTILE) return it.ammoDps != null ? 'ammo' : null;
  if (spendsAsReagent(ds, it.entry)) return 'reagent';
  if (it.itemClass === ITEM_CLASS_REAGENT) return null;
  if (isBandageItem(it, ds)) return 'bandage';
  if (it.itemClass === ITEM_CLASS_TRADE_GOODS
    && (it.itemSubclass === SUBCLASS_EXPLOSIVES || it.itemSubclass === SUBCLASS_DEVICES)) return 'device';
  if (role === 'restore_health' || role === 'restore_power') return 'restore';
  if (useSpellIdOf(it) == null) return null;
  // Sit-eat with no leftover aura (an apple, water, HP-only fish) is not a split. Well Fed is.
  const meal = isSitEat(it) || cookingProducts(ds).has(it.entry);
  if (wellFedPendingFromItem(it, ds) || (meal && buffsOnUse(it, ds))) return 'food';
  if (meal) return null;
  if ((it.requiredSkill ?? 0) === ENGINEERING_SKILL) return 'device';
  // A rune energizes with no item_template useInCombat stamp on it, so read the spell instead.
  if (restoredPowerTypeIndex(it, ds) != null) return 'restore';
  // Class 0 only: trade goods with a use spell are mats, not a split (dust, cloth, ore).
  if (it.itemClass === ITEM_CLASS_CONSUMABLE) return 'buff';
  return null;
}

/** A consumable a companion can use on their own. */
export function isShareableConsumable(it: ItemDef | undefined, ds: DataStore): boolean {
  return shareCategoryOf(it, ds) != null;
}

// BuffMod → weightscale field, the same STAT_TO_FIELD Gear the roster prices gear with. A mod with no
// field here (haste, damage taken) is a generic good and scores for everyone.
const BUFF_MOD_FIELD: Partial<Record<BuffMod, string[]>> = {
  strength: ['str'], agility: ['agi'], stamina: ['sta'], intellect: ['int'], spirit: ['spi'],
  all_stats: ['str', 'agi', 'sta', 'int', 'spi'],
  crit: ['critstrkrtng'], hit: ['hitrtng'],
  // Only two tank scales carry `armor`; the avoidance ratings mark the other tank scales.
  attack_power: ['atkpwr'], ranged_attack_power: ['rgddps'], armor: ['armor', 'defrtng', 'dodgertng', 'parryrtng'],
  spell_power: ['splpwr', 'splheal'], mp5: ['manargn'], healing_done: ['splheal'],
  spell_damage_holy: ['splpwr'], spell_damage_fire: ['firsplpwr', 'splpwr'], spell_damage_nature: ['natsplpwr', 'splpwr'],
  spell_damage_frost: ['frosplpwr', 'splpwr'], spell_damage_shadow: ['shasplpwr', 'splpwr'], spell_damage_arcane: ['arcsplpwr', 'splpwr'],
};

const SCHOOL_OF_MOD: Partial<Record<BuffMod, string>> = {
  spell_damage_holy: 'holy', spell_damage_fire: 'fire', spell_damage_nature: 'nature',
  spell_damage_frost: 'frost', spell_damage_shadow: 'shadow', spell_damage_arcane: 'arcane',
};

export interface ShareMember {
  id: string;
  name: string;
  cls: number;
  level: number;
  role: 'tank' | 'healer' | 'dps';
  specId: number;
  group: ShareGroup;
  /** Damage schools this member casts, for a school-bound elixir. */
  schools: ReadonlySet<string>;
  /** Item entries their own spellbook spends as reagents. Cite: spell_template.Reagent1..8. */
  reagents: ReadonlySet<number>;
  bags: Inventory;
  /** The wearer the item use-gates read: level, class, skill, race, rep. */
  char: Character;
  /** Coats an open hand right now, keyed by the imbue's applicator spell. */
  openHandsFor: (imbue: ItemDef) => boolean;
  /** Carries a bow, gun or crossbow this ammo loads. */
  firesAmmo: (ammo: ItemDef) => boolean;
}

/** Caster or melee off the spec's own weightscale: a scale that pays for spell power casts. */
export function shareGroupOf(role: 'tank' | 'healer' | 'dps', specId: number): ShareGroup {
  if (role === 'tank' || role === 'healer') return role;
  const st = playerbotWeightScale(specId)?.stats;
  const caster = (st?.get('splpwr') ?? 0) > 0 || (st?.get('splheal') ?? 0) > 0;
  return caster ? 'caster' : 'melee';
}

/** Schools cast and reagents spent, off one spellbook. One walk feeds both gates. */
function spellbookFacts(known: readonly number[], ds: DataStore): { schools: Set<string>; reagents: Set<number> } {
  const schools = new Set<string>();
  const reagents = new Set<number>();
  for (const id of known) {
    const sp = ds.spell(id);
    if (!sp) continue;
    const dmg = (sp.effects ?? []).some((e) => e.kind === 'direct_damage' || e.kind === 'dot');
    if (dmg && sp.school !== 'physical') schools.add(sp.school);
    if (isCraftSpell(sp)) continue;
    for (const r of sp.reagents ?? []) if (r.item > 0) reagents.add(r.item);
  }
  return { schools, reagents };
}

function equipmentGates(char: Character, ds: DataStore): Pick<ShareMember, 'openHandsFor' | 'firesAmmo'> {
  return {
    openHandsFor: (imbue) => {
      const app = imbue.useSpell != null ? ds.enchantApplicator(imbue.useSpell) : undefined;
      return scanTempWeaponImbueHands(char.equipped, ds, app).eligible.length > 0;
    },
    firesAmmo: (ammo) => {
      const ranged = equippedEntry(char.equipped.ranged);
      return checkAmmoCompatibility(ranged != null ? ds.item(ranged) : undefined, ammo);
    },
  };
}

export function shareMemberOf(comp: Companion, playerLevel: number, ds: DataStore): ShareMember {
  const level = companionLevel(comp, playerLevel);
  const specId = companionPlayerbotSpecId(comp.cls, comp.specIdx, comp.role, ds);
  const char = companionCharacter(comp, level, ds);
  const { schools, reagents } = spellbookFacts(companionSpellbook(comp, level, ds).known, ds);
  return {
    id: comp.id, name: comp.name, cls: comp.cls, level, role: comp.role, specId,
    group: shareGroupOf(comp.role, specId),
    schools, reagents, char,
    bags: comp.bags ?? { stacks: [] },
    ...equipmentGates(char, ds),
  };
}

/** You, as one head of the split. `bags` stays empty: your carried count IS the pool being split. */
export function shareMemberOfYou(char: Character, known: readonly number[], ds: DataStore): ShareMember {
  const { schools, reagents } = spellbookFacts(known, ds);
  const specId = characterPlayerbotSpecId(char, ds);
  return {
    id: 'you', name: 'You', cls: char.cls, level: char.level, role: 'dps', specId,
    group: shareGroupOf('dps', specId),
    schools, reagents, char,
    bags: { stacks: [] },
    ...equipmentGates(char, ds),
  };
}

/** Sum of a buff spell's stat mods priced on this spec. null when it grants nothing priceable. */
function buffSpellWeight(
  spellId: number,
  m: ShareMember,
  ds: DataStore,
  seen?: Set<number>,
): number | null {
  const walked = seen ?? new Set<number>();
  if (walked.has(spellId)) return null;
  walked.add(spellId);
  const raw = ds.spell(spellId);
  if (!raw) return null;
  const effs = (raw.effects?.length ? raw.effects : resolveCombatSpell(raw).effects) ?? [];
  let total = 0;
  let priced = false;
  for (const e of effs) {
    if (e.kind === 'buff') {
      const w = buffModWeight(e.mod, e.amount, m);
      if (w == null) continue;
      priced = true;
      total += w;
      continue;
    }
    // Nightfin Soup's +8 mp5 is restore_power 18194 for 10 min, not a `buff` mod.
    if (e.kind === 'restore_power' && (e.durationMs ?? 0) > MEAL_MS) {
      const amt = Number(e.amountPerTick) || Number(e.amount) || 0;
      priced = true;
      total += calculateSingleStatWeight(m.specId, 'manargn', amt);
      continue;
    }
    const trig = e.kind === 'proc_trigger_spell'
      ? Number(e.triggerSpellId) || 0
      : e.kind === 'trigger_spell' ? Number(e.spellId) || 0 : 0;
    if (!trig) continue;
    const w = buffSpellWeight(trig, m, ds, walked);
    if (w == null) continue;
    priced = true;
    total += w;
  }
  return priced ? total : null;
}

// A flat pool buff is priced as the stat that grants it: 10 health per stamina (TUNING.hpPerStamina)
// and 15 mana per intellect past 20. Cite: formulas.ts:343; StatSystem.cpp UpdateMaxPower.
const HP_PER_STAMINA = 10;
const MANA_PER_INTELLECT = 15;

function buffModWeight(mod: BuffMod, amount: number, m: ShareMember): number | null {
  if (mod === 'max_health') return calculateSingleStatWeight(m.specId, 'sta', amount / HP_PER_STAMINA);
  if (mod === 'max_mana') return calculateSingleStatWeight(m.specId, 'int', amount / MANA_PER_INTELLECT);
  const school = SCHOOL_OF_MOD[mod];
  if (school && !m.schools.has(school)) return 0;
  const fields = BUFF_MOD_FIELD[mod];
  if (!fields) return null;
  let best = 0;
  for (const f of fields) best = Math.max(best, calculateSingleStatWeight(m.specId, f, amount));
  return best;
}

const ENCHANT_GRANT_FIELD: Record<string, string> = {
  spell_power: 'splpwr', healing_power: 'splheal', mp5: 'manargn',
  attack_power: 'atkpwr', ranged_attack_power: 'rgddps',
  spell_crit_pct: 'spellcritstrkrtng', crit_pct: 'critstrkrtng',
  hit_pct: 'hitrtng', armor: 'armor', health: 'sta', mana: 'int',
  str: 'str', agi: 'agi', sta: 'sta', int: 'int', spi: 'spi',
};

function coatWeight(it: ItemDef, m: ShareMember, ds: DataStore): number {
  const app = it.useSpell != null ? ds.enchantApplicator(it.useSpell) : undefined;
  const ench = app ? ds.itemEnchant(app.enchantId) : undefined;
  if (!ench) return 1;
  let total = 0;
  for (const eff of ench.effects) {
    if (eff.type === 'weapon_damage') {
      total += calculateSingleStatWeight(m.specId, 'mledps', eff.amount);
      continue;
    }
    if (eff.type === 'stat') {
      total += calculateSingleStatWeight(m.specId, ENCHANT_GRANT_FIELD[eff.stat] ?? eff.stat, eff.amount);
      continue;
    }
    if (eff.type !== 'equip_spell') continue;
    for (const g of eff.grants) {
      if (g.kind === 'stat') {
        total += calculateSingleStatWeight(m.specId, ENCHANT_GRANT_FIELD[g.stat] ?? g.stat, g.amount);
        continue;
      }
      const field = ENCHANT_GRANT_FIELD[g.kind];
      if (field && 'amount' in g) total += calculateSingleStatWeight(m.specId, field, g.amount);
    }
  }
  return total;
}

/** What a coat is FOR, off the enchant it writes. Cite: SpellItemEnchantment grants. */
export type CoatKind = 'wizard' | 'mana' | 'melee' | 'other';

function grantKindOf(kind: string): CoatKind | 'skip' {
  if (kind === 'mp5' || kind === 'mana') return 'mana';
  if (kind === 'spell_power' || kind === 'spell_crit_pct' || kind === 'spell_hit_pct' || kind === 'spell_damage_vs') {
    return 'wizard';
  }
  if (kind === 'weapon_damage' || kind === 'attack_power' || kind === 'ranged_attack_power'
    || kind === 'crit_pct' || kind === 'hit_pct' || kind === 'attack_power_vs') {
    return 'melee';
  }
  return 'skip';
}

/** Wizard oil, mana oil, or a melee stone — poisons and unknown coats stay `other`. */
export function coatKindOf(it: ItemDef, ds: DataStore): CoatKind {
  const app = it.useSpell != null ? ds.enchantApplicator(it.useSpell) : undefined;
  const ench = app ? ds.itemEnchant(app.enchantId) : undefined;
  if (!ench) return 'other';
  let mana = false;
  let wizard = false;
  let melee = false;
  const mark = (kind: string): void => {
    const g = grantKindOf(kind);
    if (g === 'mana') mana = true;
    else if (g === 'wizard') wizard = true;
    else if (g === 'melee') melee = true;
  };
  for (const eff of ench.effects) {
    if (eff.type === 'weapon_damage') melee = true;
    else if (eff.type === 'stat') mark(eff.stat);
    else if (eff.type === 'equip_spell') {
      for (const g of eff.grants) mark(g.kind === 'stat' ? g.stat : g.kind);
    }
  }
  // Mana oil stamps mp5; wizard oil stamps equal spell_power and healing_power, so mp5 wins.
  if (mana) return 'mana';
  if (wizard) return 'wizard';
  if (melee) return 'melee';
  return 'other';
}

function coatRoleBlocked(kind: CoatKind, m: ShareMember): string | null {
  if (kind === 'melee' && m.group !== 'melee' && m.group !== 'tank') return 'Not melee';
  if (kind === 'wizard' && m.group !== 'caster' && !(m.cls === CLASS.PALADIN && m.role === 'tank')) {
    return 'Not a caster';
  }
  if (kind === 'mana' && m.group !== 'healer') return 'Not a healer';
  return null;
}

/** Usable and what it pays, or the reason this member cannot take it. */
/** `permanent`: a gate this seat never clears (AllowableClass), so it is not a candidate at all. */
export type ShareVerdict = { benefit: number } | { blocked: string; permanent?: true };

/** "Requires Rogue" from the party's side, the same line the item tooltip prints. */
function classGateLabel(it: ItemDef): string {
  return `Requires ${(it.allowClass ?? []).map(className).join(', ')}`;
}

// Names the spell, so a blocked row says whether the party lacks the CLASS or only the rank.
// Wrong class is permanent: a rogue never spends a Sacred Candle, so no rule should offer one.
function reagentVerdict(it: ItemDef, m: ShareMember, ds: DataStore): ShareVerdict {
  if (m.reagents.has(it.entry)) return { benefit: 1 };
  const demand = reagentDemand(ds, it.entry);
  if (!demand?.classes.length) return { blocked: 'Knows no spell that spends it' };
  if (!demand.classes.includes(m.cls)) {
    return { blocked: `Only a ${demand.classes.map(className).join(' or ')} spends this`, permanent: true };
  }
  // Their class, unlearned. The book is the action when one teaches it (Codex: Prayer of Fortitude).
  const id = reagentSpellFor(ds, it.entry, m.cls);
  const sp = id != null ? ds.spell(id) : undefined;
  if (!sp) return { blocked: 'Knows no spell that spends it' };
  const book = spellTeachBook(ds, sp.id);
  return { blocked: book ? `Needs ${sp.name} - read ${book.name}` : `Has not learned ${sp.name}` };
}

// Level, AllowableClass, RequiredSkill, race and rep all come from the product's own CanUseItem.
// Cite: itemRestrictions.ts:295 itemUseGates, the call consumeItem makes for your own bag use.
export function shareVerdict(it: ItemDef, m: ShareMember, ds: DataStore): ShareVerdict {
  if (it.allowClass && !it.allowClass.includes(m.cls)) return { blocked: classGateLabel(it), permanent: true };
  const gate = itemUseGates(m.char, it, ds);
  if (!gate.ok) return { blocked: gate.reason };
  const cat = shareCategoryOf(it, ds);
  if (cat === 'ammo') return m.firesAmmo(it) ? { benefit: 1 } : { blocked: 'Carries nothing that fires it' };
  if (cat === 'coat') {
    if (!m.openHandsFor(it)) return { blocked: 'No weapon hand it can coat' };
    const why = coatRoleBlocked(coatKindOf(it, ds), m);
    if (why) return { blocked: why };
    return { benefit: Math.max(1, coatWeight(it, m, ds)) };
  }
  if (cat === 'reagent') return reagentVerdict(it, m, ds);
  if (cat === 'bandage') return { benefit: 1 };
  if (cat === 'food') {
    if (it.consumable?.effect === 'drink' && classPowerType(m.cls) !== 'mana') {
      return { blocked: 'Does not use mana' };
    }
    const fed = wellFedPendingFromItem(it, ds);
    const spellId = fed ? fed.triggerSpellId : useSpellIdOf(it);
    return { benefit: (spellId != null ? buffSpellWeight(spellId, m, ds) : null) ?? 1 };
  }
  const role = consumableRoleOf(it, ds);
  if (role === 'restore_health') return { benefit: 1 };
  if (cat === 'restore') {
    const idx = restoredPowerTypeIndex(it, ds);
    const want = idx == null ? null : powerTypeName(idx);
    if (want != null && want !== classPowerType(m.cls)) return { blocked: `Does not use ${want}` };
    return { benefit: 1 };
  }
  if (role === 'apply_buff' && it.useBuff) {
    const w = buffModWeight(it.useBuff.mod, it.useBuff.amount, m);
    if (w != null) return { benefit: w };
  }
  const fed = wellFedPendingFromItem(it, ds);
  const spellId = fed ? fed.triggerSpellId : useSpellIdOf(it);
  return { benefit: (spellId != null ? buffSpellWeight(spellId, m, ds) : null) ?? 1 };
}

/** Auto verdict as a number: null = cannot use it, 0 = usable but pays nothing on their spec. */
export function shareBenefit(it: ItemDef, m: ShareMember, ds: DataStore): number | null {
  const v = shareVerdict(it, m, ds);
  return 'blocked' in v ? null : v.benefit;
}

export interface ShareRow {
  companionId: string;
  companionName: string;
  entry: number;
  count: number;
  key: string;
  /** Why they were picked: the rule, or the weighted gain under auto. */
  why: string;
}

/** One bag stack, planned: who takes how many, what you keep, and why the rest cannot. */
export interface SharePlanEntry {
  entry: number;
  key: string;
  category: ShareCategory;
  have: number;
  rows: ShareRow[];
  /** What stays in your bags once the split is paid. */
  kept: number;
  /** Reasons nobody could take it, deduped, in member order. */
  blocked: string[];
  /** Member ids the item can never reach (class-locked), so no rule should offer them. */
  excluded: string[];
  /** Extra stacks to pull off a companion so the rest of the party can take their share. */
  takes: ShareRow[];
}

export interface SharePlanInput {
  ds: DataStore;
  inventory: Inventory;
  members: readonly ShareMember[];
  rules: Readonly<Record<string, ShareRule>>;
  includeYou: boolean;
  /** You, when you are keeping a share. Omitted = the whole stack goes out. */
  you?: ShareMember;
  /** Kits to plan. Omitted = every shareable kit. */
  cats?: readonly ShareCategory[];
}

/** Members the rule names, in the order a short stack should reach them. */
export function shareRecipients(
  it: ItemDef,
  rule: ShareRule,
  members: readonly ShareMember[],
  ds: DataStore,
): { picked: Array<{ m: ShareMember; why: string }>; blocked: string[]; excluded: string[] } {
  const blocked: string[] = [];
  const excluded: string[] = [];
  const usable: Array<{ m: ShareMember; benefit: number }> = [];
  for (const m of members) {
    const v = shareVerdict(it, m, ds);
    if ('blocked' in v) {
      if (v.permanent) excluded.push(m.id);
      if (!blocked.includes(v.blocked)) blocked.push(v.blocked);
      continue;
    }
    usable.push({ m, benefit: v.benefit });
  }
  if (rule.kind === 'keep') return { picked: [], blocked, excluded };
  if (rule.kind === 'auto') {
    const paid = usable.filter((x) => x.benefit > 0);
    // Nobody's spec pays for it (a Rage Potion in a mage party): it is still usable, so split it.
    const pool = paid.length ? paid : usable;
    const picked = pool
      .sort((a, b) => b.benefit - a.benefit || a.m.name.localeCompare(b.m.name))
      .map((x) => ({ m: x.m, why: paid.length ? `+${Math.round(x.benefit)} on their spec` : 'usable' }));
    return { picked, blocked, excluded };
  }
  if (rule.kind === 'one') {
    const hit = usable.find((x) => x.m.id === rule.companionId);
    return { picked: hit ? [{ m: hit.m, why: 'picked by hand' }] : [], blocked, excluded };
  }
  const pick = rule.kind === 'even'
    ? usable
    : rule.kind === 'group'
      ? usable.filter((x) => x.m.group === rule.group)
      : usable.filter((x) => x.m.cls === rule.cls);
  const why = rule.kind === 'even' ? 'even split' : rule.kind === 'group' ? `${rule.group}s` : 'class rule';
  const picked = pick
    .sort((a, b) => b.benefit - a.benefit || a.m.name.localeCompare(b.m.name))
    .map((x) => ({ m: x.m, why }));
  return { picked, blocked, excluded };
}

// You are a head of the split under auto and an even split, and under a class rule naming your class.
// A group or one-companion rule hands the stack out whole — it names somebody else.
function youAreAHead(it: ItemDef, rule: ShareRule, you: ShareMember | undefined, ds: DataStore): boolean {
  if (!you) return false;
  const v = shareVerdict(it, you, ds);
  if ('blocked' in v) return false;
  if (rule.kind === 'auto') return v.benefit > 0;
  if (rule.kind === 'even') return true;
  if (rule.kind === 'class') return rule.cls === you.cls;
  return false;
}

// Party split: player bags + bank + every member's bags are one pool. A holder who is not a
// recipient is emptied into the split; a recipient over the share is taken from.
export function splitStack(
  entry: number,
  playerHave: number,
  recipients: ReadonlyArray<{ m: ShareMember; why: string }>,
  includeYou: boolean,
  others: readonly ShareMember[] = [],
  maxPer: number = Number.POSITIVE_INFINITY,
): {
  rows: Array<{ m: ShareMember; why: string; count: number }>;
  takes: Array<{ m: ShareMember; why: string; count: number }>;
  kept: number;
} {
  const carried = recipients.map((r) => countItem(r.m.bags, entry));
  const extra = others
    .map((m) => ({ m, n: countItem(m.bags, entry) }))
    .filter((x) => x.n > 0);
  const total = playerHave + extra.reduce((a, x) => a + x.n, 0) + carried.reduce((a, b) => a + b, 0);
  if (total <= 0 || !recipients.length) return { rows: [], takes: [], kept: playerHave };
  const heads = recipients.length + (includeYou ? 1 : 0);
  const cap = maxPer > 0 ? maxPer : Number.POSITIVE_INFINITY;
  const share = Math.min(Math.floor(total / heads), cap);
  let left = total - share * heads;
  const target = recipients.map(() => share);
  for (let i = 0; i < recipients.length && left > 0; i++) {
    if (target[i]! < cap) { target[i]!++; left--; }
  }
  const rows: Array<{ m: ShareMember; why: string; count: number }> = [];
  const takes: Array<{ m: ShareMember; why: string; count: number }> = extra.map((x) => (
    { m: x.m, why: 'party share', count: x.n }
  ));
  recipients.forEach((r, i) => {
    const want = target[i]!;
    const have = carried[i]!;
    if (want > have) rows.push({ ...r, count: want - have });
    else if (have > want) takes.push({ ...r, why: 'party share', count: have - want });
  });
  return { rows, takes, kept: (includeYou ? share : 0) + left };
}

function asShareRows(
  entry: number,
  key: string,
  rows: ReadonlyArray<{ m: ShareMember; why: string; count: number }>,
): ShareRow[] {
  return rows.map((s) => ({
    companionId: s.m.id, companionName: s.m.name, entry, count: s.count, key, why: s.why,
  }));
}

function splitToOne(
  entry: number,
  playerHave: number,
  hit: { m: ShareMember; why: string },
  members: readonly ShareMember[],
): ReturnType<typeof splitStack> {
  const takes: Array<{ m: ShareMember; why: string; count: number }> = [];
  let incoming = playerHave;
  for (const m of members) {
    if (m.id === hit.m.id) continue;
    const n = countItem(m.bags, entry);
    if (n > 0) { takes.push({ m, why: 'picked by hand', count: n }); incoming += n; }
  }
  return { rows: incoming > 0 ? [{ ...hit, count: incoming }] : [], takes, kept: 0 };
}

/** Every shareable stack the party holds, planned. Player bags, bank, and companion bags are one pool. */
export function planConsumableShare(input: SharePlanInput): SharePlanEntry[] {
  const { ds, inventory, members, rules, includeYou } = input;
  const you = includeYou ? input.you : undefined;
  const wantCats = input.cats ? new Set(input.cats) : null;
  const out: SharePlanEntry[] = [];
  const seen = new Set<number>();
  const stacks = [
    ...inventory.stacks,
    ...members.flatMap((m) => m.bags.stacks),
  ];
  for (const stk of stacks) {
    if (seen.has(stk.item)) continue;
    seen.add(stk.item);
    const it = ds.item(stk.item);
    const category = shareCategoryOf(it, ds);
    if (!it || !category) continue;
    if (wantCats && !wantCats.has(category)) continue;
    const key = shareKeyOf(it, ds);
    const rule = rules[key] ?? { kind: 'auto' as const };
    const { picked, blocked, excluded } = shareRecipients(it, rule, members, ds);
    // Requires Rogue in a party with no rogue: not a question of who, so not a row.
    if (members.length && excluded.length === members.length) continue;
    const playerHave = countItem(inventory, stk.item);
    const have = playerHave + members.reduce((n, m) => n + countItem(m.bags, stk.item), 0);
    const pickedIds = new Set(picked.map((p) => p.m.id));
    const others = members.filter((m) => !pickedIds.has(m.id));
    const maxPer = (it.maxCount ?? 0) > 0 ? it.maxCount! : Number.POSITIVE_INFINITY;
    const split = rule.kind === 'keep' || !picked.length
      ? { rows: [], takes: [], kept: playerHave }
      : rule.kind === 'one'
        ? splitToOne(stk.item, playerHave, picked[0]!, members)
        : splitStack(stk.item, playerHave, picked, youAreAHead(it, rule, you, ds), others, maxPer);
    out.push({
      entry: stk.item,
      key,
      category,
      have,
      rows: asShareRows(stk.item, key, split.rows),
      takes: asShareRows(stk.item, key, split.takes),
      kept: split.kept,
      blocked,
      excluded,
    });
  }
  return out;
}

/** The give rows of a plan, flattened — what applySquadConsumablePlan moves. */
export function shareRowsOf(entries: readonly SharePlanEntry[]): ShareRow[] {
  return entries.flatMap((e) => e.rows);
}
