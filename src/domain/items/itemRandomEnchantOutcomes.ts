// Catalog random-property outcomes. Cite: item_template.RandomProperty → item_enchantment_template;
// ItemRandomProperties.dbc nameSuffix; SpellItemEnchantment grants via DataStore.itemEnchant.

import type {
  EnchantGrant,
  ItemEnchantDef,
  ItemEnchantEffect,
  RandomPropertyDef,
} from '../../data/schema.ts';
import type { RandomEnchRow } from './itemRandomProps.ts';

export interface RandomEnchantLookup {
  itemEnchantmentTemplate(entry: number): readonly RandomEnchRow[] | undefined;
  itemRandomProperty(id: number): RandomPropertyDef | undefined;
  itemEnchant?(id: number): ItemEnchantDef | undefined;
}

export interface RandomEnchantBonusRange {
  key: string;
  min: number;
  max: number;
}

export interface RandomEnchantOutcome {
  suffix: string;
  chancePct: number;
  bonuses: RandomEnchantBonusRange[];
}

const PRIMARY = ['str', 'agi', 'sta', 'int', 'spi'] as const;

const BONUS_LABEL: Readonly<Record<string, string>> = {
  str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intellect', spi: 'Spirit',
  armor: 'Armor', weaponDamage: 'Weapon Damage', ap: 'Attack Power', rap: 'Ranged Attack Power',
  spellPower: 'Spell Damage', spellHoly: 'Holy Spell Damage', spellFire: 'Fire Spell Damage',
  spellNature: 'Nature Spell Damage', spellFrost: 'Frost Spell Damage',
  spellShadow: 'Shadow Spell Damage', spellArcane: 'Arcane Spell Damage',
  heal: 'Healing', mp5: 'Mana per 5 sec.', hp5: 'Health per 5 sec.',
  mana: 'Mana', health: 'Health',
  resHoly: 'Holy Resistance', resFire: 'Fire Resistance', resNature: 'Nature Resistance',
  resFrost: 'Frost Resistance', resShadow: 'Shadow Resistance', resArcane: 'Arcane Resistance',
  crit_pct: 'Critical Hit', hit_pct: 'Hit', dodge_pct: 'Dodge', block_pct: 'Block',
  spellCrit: 'Spell Crit', spellHit: 'Spell Hit', blockValue: 'Block Value',
  proc_damage: 'Damage on hit',
};

const PCT_KEYS: ReadonlySet<string> = new Set([
  'crit_pct', 'hit_pct', 'dodge_pct', 'block_pct', 'spellCrit', 'spellHit',
]);

const CREATURE_LABEL: Readonly<Record<number, string>> = {
  1: 'Beast Slaying',
  2: 'Dragonkin Slaying',
  4: 'Demon Slaying',
  8: 'Elemental Slaying',
  16: 'Giant Slaying',
  32: 'Undead Slaying',
  64: 'Humanoid Slaying',
  256: 'Mechanical Slaying',
};

function add(out: Record<string, number>, key: string, amount: number): void {
  if (!key || !Number.isFinite(amount) || amount === 0) return;
  out[key] = (out[key] ?? 0) + amount;
}

function schoolBonusKey(kind: 'res' | 'spell', school: string): string {
  if (!school || school === 'armor' || school === 'physical') {
    return kind === 'res' ? 'armor' : 'spellPower';
  }
  return `${kind}${school.charAt(0).toUpperCase()}${school.slice(1)}`;
}

function foldGrant(out: Record<string, number>, g: EnchantGrant): void {
  switch (g.kind) {
    case 'stat':
      add(out, g.stat, g.amount);
      break;
    case 'all_stats':
      for (const s of PRIMARY) add(out, s, g.amount);
      break;
    case 'armor':
      add(out, 'armor', g.amount);
      break;
    case 'resist':
      add(out, schoolBonusKey('res', g.school), g.amount);
      break;
    case 'health':
      add(out, 'health', g.amount);
      break;
    case 'mana':
      add(out, 'mana', g.amount);
      break;
    case 'attack_power':
      add(out, 'ap', g.amount);
      break;
    case 'ranged_attack_power':
      add(out, 'rap', g.amount);
      break;
    case 'spell_power':
      add(out, g.school ? schoolBonusKey('spell', g.school) : 'spellPower', g.amount);
      break;
    case 'healing_power':
      add(out, 'heal', g.amount);
      break;
    case 'mp5':
      add(out, 'mp5', g.amount);
      break;
    case 'hp5':
    case 'hp5_combat':
      add(out, 'hp5', g.amount);
      break;
    case 'crit_pct':
      add(out, 'crit_pct', g.amount);
      break;
    case 'hit_pct':
      add(out, 'hit_pct', g.amount);
      break;
    case 'dodge_pct':
      add(out, 'dodge_pct', g.amount);
      break;
    case 'block_pct':
      add(out, 'block_pct', g.amount);
      break;
    case 'spell_crit_pct':
      add(out, 'spellCrit', g.amount);
      break;
    case 'spell_hit_pct':
      add(out, 'spellHit', g.amount);
      break;
    case 'block_value':
      add(out, 'blockValue', g.amount);
      break;
    case 'skill':
      add(out, `skill:${g.skillLine}`, g.amount);
      break;
    case 'damage_done_creature':
      add(out, `creature:${g.creatureTypeMask}`, g.amount);
      break;
    case 'attack_power_vs':
      add(out, `apvs:${g.creatureTypeMask}`, g.amount);
      break;
    case 'spell_damage_vs':
      add(out, `spvs:${g.creatureTypeMask}`, g.amount);
      break;
    case 'proc_damage':
      add(out, 'proc_damage', g.amount);
      break;
    default:
      break;
  }
}

function foldEffect(out: Record<string, number>, eff: ItemEnchantEffect): void {
  switch (eff.type) {
    case 'weapon_damage':
      add(out, 'weaponDamage', eff.amount);
      break;
    case 'resistance':
      add(out, schoolBonusKey('res', eff.school), eff.amount);
      break;
    case 'stat':
      add(out, eff.stat, eff.amount);
      break;
    case 'equip_spell':
      for (const g of eff.grants) foldGrant(out, g);
      break;
    default:
      break;
  }
}

function bonusesFromProp(
  prop: RandomPropertyDef,
  lookupEnchant: ((id: number) => ItemEnchantDef | undefined) | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  let folded = false;
  if (lookupEnchant) {
    for (const eid of prop.enchantIds) {
      const ench = lookupEnchant(eid);
      if (!ench) continue;
      folded = true;
      for (const eff of ench.effects) foldEffect(out, eff);
    }
  }
  if (!folded) {
    if (prop.stats) {
      for (const key of Object.keys(prop.stats)) {
        const value = prop.stats[key];
        if (typeof value === 'number') add(out, key, value);
      }
    }
    if (prop.armor) add(out, 'armor', prop.armor);
    if (prop.weaponDamageFlat) add(out, 'weaponDamage', prop.weaponDamageFlat);
  }
  if (out.ap != null && out.rap === out.ap) delete out.rap;
  return out;
}

function rangesFromAmounts(amounts: Record<string, number>): RandomEnchantBonusRange[] {
  const out: RandomEnchantBonusRange[] = [];
  for (const key of Object.keys(amounts)) {
    const n = amounts[key];
    if (n == null) continue;
    out.push({ key, min: n, max: n });
  }
  return out;
}

function mergeBonus(into: RandomEnchantBonusRange[], amounts: Record<string, number>): void {
  const have = new Map(into.map((b) => [b.key, b]));
  for (const key of Object.keys(amounts)) {
    const n = amounts[key];
    if (n == null) continue;
    const cur = have.get(key);
    if (cur) {
      if (n < cur.min) cur.min = n;
      if (n > cur.max) cur.max = n;
    } else {
      const row = { key, min: n, max: n };
      into.push(row);
      have.set(key, row);
    }
  }
}

/** Player-facing noun for a bonus key. Skill ids resolve through SkillLine.dbc names when given. */
export function randomEnchantBonusLabel(
  key: string,
  skillNames?: Readonly<Record<number, string>>,
): string {
  const known = BONUS_LABEL[key];
  if (known) return known;
  if (key.startsWith('skill:')) {
    const id = Number(key.slice(6));
    if (Number.isFinite(id)) {
      const named = skillNames?.[id];
      if (named) return named;
      return `Skill ${id}`;
    }
  }
  if (key.startsWith('creature:')) {
    const mask = Number(key.slice(9));
    return CREATURE_LABEL[mask] ?? `Creature slaying ${mask}`;
  }
  if (key.startsWith('apvs:')) {
    const mask = Number(key.slice(5));
    const who = CREATURE_LABEL[mask]?.replace(/ Slaying$/, '') ?? String(mask);
    return `Attack Power vs ${who}`;
  }
  if (key.startsWith('spvs:')) {
    const mask = Number(key.slice(5));
    const who = CREATURE_LABEL[mask]?.replace(/ Slaying$/, '') ?? String(mask);
    return `Spell Damage vs ${who}`;
  }
  return key;
}

export function randomEnchantBonusIsPercent(key: string): boolean {
  return PCT_KEYS.has(key);
}

/** Weighted suffix list for one item_template.RandomProperty pool. Empty when the item does not roll. */
export function itemRandomEnchantOutcomes(
  ds: RandomEnchantLookup,
  randomProperty: number | undefined,
): RandomEnchantOutcome[] {
  const poolKey = randomProperty ?? 0;
  if (poolKey <= 0) return [];
  const rows = ds.itemEnchantmentTemplate(poolKey);
  if (!rows?.length) return [];

  const groups = new Map<string, {
    suffix: string;
    chance: number;
    bonuses: RandomEnchantBonusRange[];
  }>();
  const lookup = ds.itemEnchant;
  let total = 0;

  for (const row of rows) {
    if (!(row.chance > 0) || !(row.ench > 0)) continue;
    const prop = ds.itemRandomProperty(row.ench);
    if (!prop) continue;
    const suffix = (prop.nameSuffix ?? '').trim();
    if (!suffix) continue;
    const amounts = bonusesFromProp(prop, lookup ? (id) => lookup(id) : undefined);
    const groupKey = `${suffix}\0${Object.keys(amounts).sort().join(',')}`;
    const cur = groups.get(groupKey);
    if (cur) {
      cur.chance += row.chance;
      mergeBonus(cur.bonuses, amounts);
    } else {
      groups.set(groupKey, {
        suffix,
        chance: row.chance,
        bonuses: rangesFromAmounts(amounts),
      });
    }
    total += row.chance;
  }

  if (total <= 0) return [];
  const out: RandomEnchantOutcome[] = [];
  for (const g of groups.values()) {
    out.push({
      suffix: g.suffix,
      chancePct: (g.chance / total) * 100,
      bonuses: g.bonuses,
    });
  }
  out.sort((a, b) => b.chancePct - a.chancePct || a.suffix.localeCompare(b.suffix));
  return out;
}
