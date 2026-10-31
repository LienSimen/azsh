// Spec-weighted item scoring for random-bot gear — a port of the playerbots weightscales and
// CalculateStatWeight. Ranking is weight × value, with the equip cache built lazily in-process.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, ItemDef, ItemSlot, SpellDef, Stat } from '../../data/schema.ts';
import type { BotSpecDef } from '../../data/schema/talent.ts';
import { CLASS } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { spentInTree } from '../character/talents.ts';
import weightscaleJson from '../../data/tables/playerbot-weightscales.json' with { type: 'json' };

export interface WeightScaleInfo {
  id: number;
  name: string;
  classId: number;
  /** field → weight multiplier (ai_playerbot_weightscale_data.val) */
  stats: Map<string, number>;
}

const SCALES: Map<number, WeightScaleInfo> = (() => {
  const byId = new Map<number, WeightScaleInfo>();
  const file = weightscaleJson as {
    scales: { id: number; name: string; classId: number }[];
    stats: { id: number; field: string; val: number }[];
  };
  for (const s of file.scales) {
    byId.set(s.id, { id: s.id, name: s.name, classId: s.classId, stats: new Map() });
  }
  for (const row of file.stats) {
    byId.get(row.id)?.stats.set(row.field, row.val);
  }
  return byId;
})();

/** All loaded weightscale ids (classic playable classes only). */
export function playerbotWeightScaleIds(): number[] {
  return [...SCALES.keys()].sort((a, b) => a - b);
}

export function playerbotWeightScale(id: number): WeightScaleInfo | undefined {
  return SCALES.get(id);
}

// Map class + talent-tab / premade name / role → weightscale id. Cite: RandomItemMgr::GetPlayerSpecName
// (tab → name) + GetPlayerSpecId.
export function resolvePlayerbotSpecId(
  cls: number,
  opts: { botSpec?: BotSpecDef | null; role?: string; talentTab?: number } = {},
): number {
  const name = pickSpecName(cls, opts);
  if (name) {
    for (const s of SCALES.values()) {
      if (s.classId === cls && s.name === name) return s.id;
    }
  }
  // Role fallback when name missing or not on a classic scale (e.g. role:'dps' alone).
  const roleFallback: Record<number, Partial<Record<string, string>>> = {
    [CLASS.WARRIOR]: { tank: 'prot', dps: 'arms', healer: 'arms' },
    [CLASS.PALADIN]: { tank: 'prot', healer: 'holy', dps: 'retrib' },
    [CLASS.HUNTER]: { dps: 'marks', tank: 'marks', healer: 'marks' },
    [CLASS.ROGUE]: { dps: 'combat', tank: 'combat', healer: 'combat' },
    [CLASS.PRIEST]: { healer: 'holy', dps: 'shadow', tank: 'holy' },
    [CLASS.SHAMAN]: { healer: 'resto', dps: 'enhance', tank: 'enhance' },
    [CLASS.MAGE]: { dps: 'frost', tank: 'frost', healer: 'frost' },
    [CLASS.WARLOCK]: { dps: 'afflic', tank: 'afflic', healer: 'afflic' },
    [CLASS.DRUID]: { tank: 'feraltank', healer: 'resto', dps: 'feraldps' },
  };
  const fb = roleFallback[cls]?.[opts.role ?? 'dps'] ?? roleFallback[cls]?.dps;
  if (fb) {
    for (const s of SCALES.values()) {
      if (s.classId === cls && s.name === fb) return s.id;
    }
  }
  // First scale for class — never leave random bots at specId 0 (empty equip cache).
  for (const s of SCALES.values()) {
    if (s.classId === cls) return s.id;
  }
  return 0;
}

function pickSpecName(
  cls: number,
  opts: { botSpec?: BotSpecDef | null; role?: string; talentTab?: number },
): string | null {
  const raw = (opts.botSpec?.name ?? '').toLowerCase();
  // Keyword map → weightscale name (classic table)
  const rules: { re: RegExp; name: string }[] = [];
  switch (cls) {
    case CLASS.WARRIOR:
      rules.push(
        { re: /\bprot\b|protect|tank/, name: 'prot' },
        { re: /\bfury\b/, name: 'fury' },
        { re: /\barms\b/, name: 'arms' },
      );
      break;
    case CLASS.PALADIN:
      rules.push(
        { re: /\bholy\b|heal/, name: 'holy' },
        { re: /\bprot|tank/, name: 'prot' },
        { re: /\bret\b|retrib/, name: 'retrib' },
      );
      break;
    case CLASS.HUNTER:
      rules.push(
        { re: /\bbm\b|beast/, name: 'beast' },
        { re: /\bsurv\b|survival/, name: 'surv' },
        { re: /\bmm\b|marks/, name: 'marks' },
      );
      break;
    case CLASS.ROGUE:
      rules.push(
        { re: /\bassas|assassination/, name: 'assas' },
        { re: /\bsubtle/, name: 'subtle' },
        { re: /\bcombat\b/, name: 'combat' },
      );
      break;
    case CLASS.PRIEST:
      rules.push(
        { re: /\bshadow\b/, name: 'shadow' },
        { re: /\bdisc\b|discipline/, name: 'disc' },
        { re: /\bholy\b|heal/, name: 'holy' },
      );
      break;
    case CLASS.SHAMAN:
      // A trailing word boundary after 'resto'/'enhance' never matched the real tree names, so
      // every non-elemental shaman fell to the role fallback and a resto shaman valued its staff 0.
      rules.push(
        { re: /\bresto|heal/, name: 'resto' },
        { re: /\benh/, name: 'enhance' },
        { re: /\belem/, name: 'elem' },
      );
      break;
    case CLASS.MAGE:
      rules.push(
        { re: /\barcane\b/, name: 'arcane' },
        { re: /\bfire\b/, name: 'fire' },
        { re: /\bfrost\b/, name: 'frost' },
      );
      break;
    case CLASS.WARLOCK:
      rules.push(
        { re: /\bafflic|affliction/, name: 'afflic' },
        { re: /\bdemo\b|demonology/, name: 'demo' },
        { re: /\bdestro|destruction/, name: 'destro' },
      );
      break;
    case CLASS.DRUID:
      rules.push(
        { re: /\bbalance\b|boom|moonkin/, name: 'balance' },
        { re: /\bferaltank|bear|guardian|tank/, name: 'feraltank' },
        { re: /\bferaldps|cat|feral\b/, name: 'feraldps' },
        { re: /\bresto|heal/, name: 'resto' },
      );
      break;
    default:
      break;
  }
  for (const r of rules) {
    if (r.re.test(raw)) return r.name;
  }
  // Talent tab (0/1/2) — GetPlayerSpecName
  if (opts.talentTab != null) {
    const tab = opts.talentTab;
    const byTab: Record<number, string[]> = {
      [CLASS.WARRIOR]: ['arms', 'fury', 'prot'],
      [CLASS.PALADIN]: ['holy', 'prot', 'retrib'],
      [CLASS.HUNTER]: ['beast', 'marks', 'surv'],
      [CLASS.ROGUE]: ['assas', 'combat', 'subtle'],
      [CLASS.PRIEST]: ['disc', 'holy', 'shadow'],
      [CLASS.SHAMAN]: ['elem', 'enhance', 'resto'],
      [CLASS.MAGE]: ['arcane', 'fire', 'frost'],
      [CLASS.WARLOCK]: ['afflic', 'demo', 'destro'],
      [CLASS.DRUID]: ['balance', 'feraltank', 'resto'],
    };
    const names = byTab[cls];
    if (names && tab >= 0 && tab < names.length) return names[tab]!;
  }
  // Role from botSpec.role
  const role = opts.role ?? opts.botSpec?.role;
  if (role === 'tank' && (cls === CLASS.WARRIOR || cls === CLASS.PALADIN || cls === CLASS.DRUID)) {
    return cls === CLASS.DRUID ? 'feraltank' : 'prot';
  }
  if (role === 'healer') {
    if (cls === CLASS.PRIEST) return 'holy';
    if (cls === CLASS.PALADIN) return 'holy';
    if (cls === CLASS.SHAMAN) return 'resto';
    if (cls === CLASS.DRUID) return 'resto';
  }
  return null;
}

/** CalculateSingleStatWeight: weight × value for one field on the scale. */
export function calculateSingleStatWeight(specId: number, field: string, value: number): number {
  if (!value) return 0;
  const w = SCALES.get(specId)?.stats.get(field) ?? 0;
  return w * value;
}

// Item and equip keys that feed weightscales — a superset of schema `Stat`, since playerbots also
// scores attackPower, spellCrit, spellHit, healingPower and feralAp from equipMods.
type WeightStat =
  | Stat
  | 'spellCrit'
  | 'spellHit'
  | 'attackPower'
  | 'healingPower'
  | 'feralAp';

/** Map Phonecraft Stat / equip key → playerbots weightscale field name. */
const STAT_TO_FIELD: Partial<Record<WeightStat, string>> = {
  str: 'str',
  agi: 'agi',
  sta: 'sta',
  int: 'int',
  spi: 'spi',
  // Ratings (rare on classic gear; present on some endgame / baked equipMods)
  crit: 'critstrkrtng',
  hit: 'hitrtng',
  spellCrit: 'spellcritstrkrtng',
  spellHit: 'spellhitrtng',
  dodge: 'dodgertng',
  parry: 'parryrtng',
  defense: 'defrtng',
  block: 'blockrtng',
  attackPower: 'atkpwr',
  spellPower: 'splpwr',
  healingPower: 'splheal',
  mp5: 'manargn',
  feralAp: 'feratkpwr',
};

function asWeightStat(s: string): WeightStat | null {
  return s in STAT_TO_FIELD ? (s as WeightStat) : null;
}

// Baked `equipMods[].mod` names → weightscale field. The bake emits snake_case while STAT_TO_FIELD
// is keyed camelCase, so every one of those missed the lookup and priced at 0.
const EQUIP_MOD_TO_FIELD: Record<string, string> = {
  spell_power: 'splpwr',
  healing_done: 'splheal',
  attack_power: 'atkpwr',
  spell_crit: 'spellcritstrkrtng',
  spell_hit: 'spellhitrtng',
  block_value: 'block',
  armor: 'armor',
  spirit: 'spi',
  // target_resistance IS spell penetration (reduces the target's resist).
  target_resistance: 'spellpenrtng',
  // Spelled-out primaries: a resolved proc payload grants `strength`, never the `str` stat key.
  strength: 'str',
  agility: 'agi',
  stamina: 'sta',
  intellect: 'int',
  // Single-school MOD_DAMAGE_DONE. The weightscales carry these fields already, so a fire
  // mage now outranks a +frost item of the same size instead of reading them as identical.
  spell_damage_fire: 'firsplpwr',
  spell_damage_frost: 'frosplpwr',
  spell_damage_shadow: 'shasplpwr',
  spell_damage_arcane: 'arcsplpwr',
  spell_damage_nature: 'natsplpwr',
  // No holy field on any scale; price it as generic spell power rather than at zero.
  spell_damage_holy: 'splpwr',
};

// Mods that only apply against one creature type or school, priced at a fraction of the
// unconditional field. The factor is a ranking choice, not a sourced coefficient.
const CONDITIONAL_MOD_TO_FIELD: Record<string, string> = {
  attack_power_versus: 'atkpwr',
  ranged_attack_power_versus: 'atkpwr',
  spell_damage_versus: 'splpwr',
};
const CONDITIONAL_MOD_FACTOR = 0.25;

// Resistances and haste are priced only by equipmentHelper's fallbackGearScore: no weightscale
// in ai_playerbot_weightscales carries a resist or haste field, and inventing one is synthesis.

// ITEM_SPELLTRIGGER coverage constants. 2.43 s is the vanilla average item swing and both
// magic numbers are upstream's. Cite: RandomItemMgr.cpp:1897-1926.
const AVERAGE_ITEM_DELAY_S = 2.43;
const PROC_COVERAGE_CAP = 0.9;
const ON_USE_COVERAGE_NO_CD = 0.17;
const INVTYPE_HOLDABLE = 23;
const AURA_PROC_TRIGGER_SPELL = 42;

/** Buff grants of one spell plus its trigger payloads, and the longest duration among them. */
function chainGrants(
  sid: number,
  resolve: (id: number) => SpellDef | undefined,
  depth = 0,
): { mods: Array<{ mod: string; amount: number }>; durationMs: number } {
  const mods: Array<{ mod: string; amount: number }> = [];
  let durationMs = 0;
  if (depth > 2) return { mods, durationMs };
  const sp = resolve(sid);
  if (!sp) return { mods, durationMs };
  for (const e of sp.effects ?? []) {
    if (e.kind !== 'buff' || e.hostile === true || !e.mod || !e.amount) continue;
    mods.push({ mod: e.mod, amount: e.amount });
    durationMs = Math.max(durationMs, e.durationMs ?? 0);
  }
  for (const r of sp.rawEffects ?? []) {
    if (!r.triggerSpell) continue;
    const nested = chainGrants(r.triggerSpell, resolve, depth + 1);
    mods.push(...nested.mods);
    durationMs = Math.max(durationMs, nested.durationMs);
  }
  return { mods, durationMs };
}

/** Grants of a holder's trigger payloads ONLY — its own auras are already folded into equipMods. */
function triggeredGrants(
  holder: SpellDef,
  resolve: (id: number) => SpellDef | undefined,
): { mods: Array<{ mod: string; amount: number }>; durationMs: number } {
  const mods: Array<{ mod: string; amount: number }> = [];
  let durationMs = 0;
  for (const r of holder.rawEffects ?? []) {
    if (!r.triggerSpell) continue;
    const nested = chainGrants(r.triggerSpell, resolve, 1);
    mods.push(...nested.mods);
    durationMs = Math.max(durationMs, nested.durationMs);
  }
  return { mods, durationMs };
}

// Uptime of a timed grant, so a 20 s proc is not priced as a permanent stat. Cite:
// RandomItemMgr.cpp:1897-1926 — 0.17 and the 0.9 cap are upstream's, the ms/s mismatch is not.
function triggerCoverage(
  kind: 'use' | 'proc',
  durationMs: number,
  cooldownMs: number,
  chancePct: number,
): number {
  if (kind === 'use') {
    if (cooldownMs <= 0) return ON_USE_COVERAGE_NO_CD;
    return Math.min(1, durationMs / cooldownMs);
  }
  if (durationMs <= 0 || chancePct <= 0) return 0;
  return Math.min(PROC_COVERAGE_CAP, (chancePct / 100) * (durationMs / 1000 / AVERAGE_ITEM_DELAY_S));
}

// Weight of an item's on-use spell and its procs, each at its own uptime. Cite:
// RandomItemMgr.cpp:1608-1936; on-equip flat auras are already baked into equipMods.
function itemSpellWeight(
  specId: number,
  it: ItemDef,
  opts: StatWeightOpts,
): { weight: number; caster: boolean; attack: boolean } {
  const resolve = opts.spell;
  let weight = 0;
  let caster = false;
  let attack = false;
  if (!resolve) return { weight, caster, attack };

  const price = (mods: Array<{ mod: string; amount: number }>, coverage: number): void => {
    if (coverage <= 0) return;
    for (const m of mods) {
      let amount = m.amount;
      let field = EQUIP_MOD_TO_FIELD[m.mod]
        ?? STAT_TO_FIELD[asWeightStat(m.mod) ?? (m.mod as WeightStat)]
        ?? '';
      if (m.mod === 'mana_regen_interrupt') {
        // The aura is a percent of the wearer's spirit regen, which is what `manargn` prices.
        // Cite: formulas.ts:216 modManaRegenInterrupt = power_regen * pct / 100.
        if (!opts.spiritRegenPer5) continue;
        field = 'manargn';
        amount = opts.spiritRegenPer5 * amount / 100;
      }
      if (!field) continue;
      weight += calculateSingleStatWeight(specId, field, amount) * coverage;
      if (field === 'atkpwr' || field === 'feratkpwr' || field === 'str' || field === 'agi') {
        attack = true;
      }
      if (field === 'splpwr' || field === 'splheal' || field === 'manargn'
        || field === 'spellcritstrkrtng' || field.endsWith('splpwr')) {
        caster = true;
      }
    }
  };

  const isWeapon = !!it.weapon || it.itemClass === 2;
  const armorSide = !isWeapon && it.inventoryType !== INVTYPE_HOLDABLE;

  // On-use and chance-on-hit are priced for armor and jewellery only; a weapon's own spells ride
  // its DPS. Cite: RandomItemMgr.cpp:1624.
  if (armorSide && it.useSpell) {
    const g = chainGrants(it.useSpell, resolve);
    price(g.mods, triggerCoverage('use', g.durationMs, it.useCooldownMs ?? 0, 100));
  }
  if (armorSide) {
    for (const p of it.procs ?? []) {
      const g = chainGrants(p.spell, resolve);
      // PPM to per-swing chance the way the engine does it. Cite: weapon.ts:447.
      const chance = p.chancePct ?? (p.ppm ? p.ppm * AVERAGE_ITEM_DELAY_S / 60 * 100 : 0);
      price(g.mods, triggerCoverage('proc', g.durationMs, 0, chance));
    }
  }

  // An on-equip aura-42 IS a proc: 1.12 hangs most trinket procs there instead of on spelltrigger
  // 2, so the equipMods fold reads an empty payload and every one of them priced at zero.
  for (const sid of it.equipSpells ?? []) {
    const holder = resolve(sid);
    if (!holder) continue;
    const isProcHolder = (holder.rawEffects ?? []).some(
      (r) => (r.effect | 0) === 6 && (r.auraName | 0) === AURA_PROC_TRIGGER_SPELL,
    );
    if (!isProcHolder) continue;
    const g = triggeredGrants(holder, resolve);
    const chance = holder.spellProcEvent?.customChance ?? holder.procChance ?? 0;
    price(g.mods, triggerCoverage('proc', g.durationMs, 0, chance));
  }
  return { weight, caster, attack };
}

// Classic-oriented CalculateStatWeight for a baked ItemDef. Primary stats + armor/block + weapon DPS +
// equipMods; equip-spell AP/SP when present. Cite: RandomItemMgr::CalculateStatWeight (MANGOSBOT_ZERO).
export interface StatWeightOpts {
  // Score this as a piece the wearer already has ON, skipping the three preference gates that
  // return 0 — used on the worn side they made any gray with positive DPS read as an upgrade.
  asWorn?: boolean;
  // Resolver for on-use and proc payload spells. Absent => the item-spell branch is skipped, which
  // is the state that left all 157 proc/on-use trinkets at weight 0.
  spell?: (id: number) => SpellDef | undefined;
  // The wearer's spirit-only mana regen per 5s. MOD_MANA_REGEN_INTERRUPT grants a PERCENT of it,
  // so without the wearer's own number there is nothing to price (Darkmoon Card: Blue Dragon).
  spiritRegenPer5?: number;
  // Melee DPS this weapon reaches through the wearer's weapon-damage spender, added to the listed
  // DPS the scale prices. Main hand only — the spender swings that hand. Cite: weaponSpender.ts.
  abilityDps?: number;
}

export function calculateStatWeight(
  cls: number,
  specId: number,
  it: ItemDef,
  opts?: StatWeightOpts,
): number {
  const scale = SCALES.get(specId);
  if (!scale || scale.classId !== cls) return 0;

  let basicStatsWeight = 0;
  let hasInt = false;
  let isCasterItem = false;
  let isAttackItem = false;

  for (const s of it.stats ?? []) {
    const key = asWeightStat(s.stat) ?? (s.stat as WeightStat);
    const field = STAT_TO_FIELD[key];
    if (!field) continue;
    basicStatsWeight += calculateSingleStatWeight(specId, field, s.value);
    if (key === 'int') {
      hasInt = true;
      if (!isNoCaster(cls, specId)) isCasterItem = true;
    }
    if (key === 'spellPower') isCasterItem = true;
    if (key === 'str' || key === 'agi' || key === 'attackPower') isAttackItem = true;
  }

  // equipMods (baked rating chips). snake_case bake names first, then the Stat union.
  for (const m of it.equipMods ?? []) {
    const cond = CONDITIONAL_MOD_TO_FIELD[m.mod];
    if (cond) {
      basicStatsWeight
        += calculateSingleStatWeight(specId, cond, m.amount) * CONDITIONAL_MOD_FACTOR;
      if (cond === 'atkpwr') isAttackItem = true;
      continue;
    }
    const key = asWeightStat(m.mod) ?? (m.mod as WeightStat);
    const field = EQUIP_MOD_TO_FIELD[m.mod] ?? STAT_TO_FIELD[key] ?? '';
    if (!field) continue;
    basicStatsWeight += calculateSingleStatWeight(specId, field, m.amount);
    // Caster/attacker classification must see equipMods: no baked item carries
    // stats[].spellPower, so the stats[] loop above never sets isCasterItem.
    if (field === 'splpwr' || field === 'splheal' || field === 'spellcritstrkrtng'
      || field.endsWith('splpwr')) {
      isCasterItem = true;
    }
    if (field === 'atkpwr') isAttackItem = true;
  }

  let defenseStats = 0;
  defenseStats += calculateSingleStatWeight(specId, 'armor', it.armor ?? 0);
  // item_template.block. Both tank scales price `block` (prot warrior 3, prot paladin 1) and
  // the field was unbaked, so the one number that makes a shield a shield never arrived.
  defenseStats += calculateSingleStatWeight(specId, 'block', it.block ?? 0);

  let statWeight = 0;
  if (it.weapon) {
    const dps = (it.weapon.dmgMin + it.weapon.dmgMax) / 2 / ((it.weapon.delayMs || 2000) / 1000);
    const ranged = it.slot === 'ranged'
      || it.weaponSubclass === 2 // bow
      || it.weaponSubclass === 3 // gun
      || it.weaponSubclass === 16 // thrown
      || it.weaponSubclass === 18; // crossbow
    // A weapon-damage spender rolls this weapon at its real speed, so the same listed DPS is worth
    // more on a slow weapon. The caller prices that (weaponSpender.ts); ranged never gets it.
    const effDps = ranged ? dps : dps + Math.max(0, opts?.abilityDps ?? 0);
    if (effDps > 0) {
      statWeight += calculateSingleStatWeight(
        specId,
        ranged ? 'rgddps' : 'mledps',
        Math.floor(effDps),
      );
    }
  }

  // Flat equip auras are already folded into equipMods (src/dev/etl/lib/resolve-equip-spells.mjs).
  // What that fold cannot see is an on-use buff or a proc payload — priced here at its own uptime.
  const spellSide = itemSpellWeight(specId, it, opts ?? {});
  statWeight += spellSide.weight;
  if (spellSide.caster) isCasterItem = true;
  if (spellSide.attack) isAttackItem = true;

  // Spec weapon/armor fit: zero weight when wrong for the scale (cache would omit them)
  if (!opts?.asWorn && !shouldEquipItemForSpec(cls, scale.name, it)) return 0;

  // Caster-item / attacker-item filters (simplified classic ZERO gates)
  const noCaster = isNoCaster(cls, specId);
  const hasMana = cls !== CLASS.WARRIOR && cls !== CLASS.ROGUE;
  if ((isCasterItem || hasInt) && !hasMana && noCaster) {
    // allow feral / enhance edge cases already in isNoCaster exceptions
    if (!(specId === 21 || specId === 30 || specId === 32)) {
      // pure int on no-mana attackers: drop unless whitelist-like low level
      if (!opts?.asWorn && it.requiredLevel > 10 && basicStatsWeight > 0 && !isAttackItem) return 0;
    }
  }

  // Tank weapon speed limits (prot warrior / prot paladin)
  if (it.weapon && !opts?.asWorn && (specId === 3 || specId === 5)) {
    const delay = it.weapon.delayMs || 0;
    if (specId === 3 && delay > 2300) return 0;
    if (specId === 5 && delay > 2400) return 0;
  }

  statWeight += defenseStats;
  if (basicStatsWeight < 0 && Math.abs(basicStatsWeight) >= statWeight) return 0;
  statWeight += basicStatsWeight;

  // RandomItemMgr: quality ≤ normal with no stats can still equip at low level with weight 1
  if (statWeight === 0 && (it.quality ?? 0) <= 1 && (it.requiredLevel || 0) <= 10) return 1;

  // Legendary ×2
  if ((it.quality ?? 0) >= 5 && statWeight > 1) statWeight *= 2;

  return Math.max(0, Math.floor(statWeight));
}

function isNoCaster(cls: number, specId: number): boolean {
  // Cite: CalculateStatWeight MANGOSBOT_ZERO noCaster
  return cls === CLASS.WARRIOR || cls === CLASS.ROGUE || cls === CLASS.HUNTER
    || specId === 30 || specId === 32 || specId === 21 || specId === 6;
}

// Raw stat / equipMod points this scale actually prices (weight > 0). Spirit, intellect, healing on an arms
// warrior stay 0 — the fallback scorer must not treat them as interchangeable with strength.
export function pricedStatAmount(specId: number, it: ItemDef): number {
  const weights = SCALES.get(specId)?.stats;
  if (!weights) return 0;
  let n = 0;
  for (const s of it.stats ?? []) {
    const key = asWeightStat(s.stat) ?? (s.stat as WeightStat);
    const field = STAT_TO_FIELD[key];
    if (field && (weights.get(field) ?? 0) > 0) n += s.value;
  }
  for (const m of it.equipMods ?? []) {
    const cond = CONDITIONAL_MOD_TO_FIELD[m.mod];
    const key = asWeightStat(m.mod) ?? (m.mod as WeightStat);
    const field = cond ?? EQUIP_MOD_TO_FIELD[m.mod] ?? STAT_TO_FIELD[key] ?? '';
    if (field && (weights.get(field) ?? 0) > 0) n += m.amount;
  }
  return n;
}

// Body-armor material is wrong for this scale. Jewelry, cloaks and weapons never reject here:
// arms 1H still needs the empty-slot fallback. Cite: RandomItemMgr.cpp ShouldEquipArmorForSpec.
export function specRejectsArmorMaterial(cls: number, specName: string, it: ItemDef): boolean {
  const slot = it.slot;
  if (!slot || (['bag', 'shirt', 'tabard', 'neck', 'finger', 'trinket', 'back'] as readonly string[]).includes(slot)) {
    return false;
  }
  if (
    !!it.weapon
    || it.itemClass === 2
    || slot === 'mainhand'
    || slot === 'offhand'
    || slot === 'ranged'
    || slot === 'twohand'
  ) {
    return false;
  }
  return !shouldEquipArmorForSpec(cls, specName, it);
}

// ShouldEquipArmorForSpec + ShouldEquipWeaponForSpec (classic names). Returns false when the item type is
// wrong for this weightscale.
export function shouldEquipItemForSpec(
  cls: number,
  specName: string,
  it: ItemDef,
  targetSlot?: EquipSlot,
): boolean {
  // INVTYPE_WEAPON bakes as slot 'mainhand', so without the caller's target slot every one-hander
  // was tested against the MAIN-hand set and the off-hand rules below could never fire.
  const slot = targetSlot === 'offhand' || targetSlot === 'mainhand' ? targetSlot : it.slot;
  // Cosmetic / bag: always equippable. tabard is not on ItemSlot today (schema) but
  // playerbots still skip it when present as a stringy slot from mixed sources.
  if (!slot || (['bag', 'shirt', 'tabard'] as readonly string[]).includes(slot)) return true;

  // Jewelry first: necks, rings and trinkets are ITEM_CLASS_ARMOR subclass 0, so the isArmor route
  // sent them through material rules that reject subclass 0 — zeroing all 291 of them.
  if ((['neck', 'finger', 'trinket'] as readonly string[]).includes(slot)) return true;

  const isWeapon = !!it.weapon || it.itemClass === 2;
  const isArmor = it.itemClass === 4 || (!isWeapon && (it.armor != null || it.armorSubclass != null));

  // Shields keep the weapon route since the spec's off-hand rule owns them; a HOLDABLE does not.
  // The weapon function returns true for anything not a shield, so the holdable rule was dead.
  const isShield = it.armorSubclass === 6 || it.typeName === 'Shield';
  if (isWeapon || isShield || slot === 'mainhand' || slot === 'ranged' || slot === 'twohand') {
    return shouldEquipWeaponForSpec(cls, specName, it, slot);
  }
  if (slot === 'offhand') return shouldEquipArmorForSpec(cls, specName, it, slot);
  if (isArmor || ['head', 'shoulder', 'chest', 'waist', 'legs', 'feet', 'wrist', 'hands', 'back'].includes(slot)) {
    return shouldEquipArmorForSpec(cls, specName, it, slot);
  }
  return true; // rings/trinkets/neck
}

function armorSubclassOk(cls: number, specName: string, sub: number | undefined, invCloak: boolean): boolean {
  if (invCloak) return true;
  // 0 misc, 1 cloth, 2 leather, 3 mail, 4 plate, 6 shield
  if (sub === 6) {
    return cls === CLASS.WARRIOR || cls === CLASS.PALADIN || cls === CLASS.SHAMAN;
  }
  switch (cls) {
    case CLASS.WARRIOR:
      if (specName === 'arms' || specName === 'fury') return sub === 2 || sub === 3 || sub === 4;
      return sub === 3 || sub === 4; // prot
    case CLASS.PALADIN:
      if (specName === 'holy') return sub === 1 || sub === 2 || sub === 3 || sub === 4;
      return sub === 3 || sub === 4;
    case CLASS.HUNTER:
      return sub === 1 || sub === 2 || sub === 3;
    case CLASS.ROGUE:
      return sub === 1 || sub === 2;
    case CLASS.PRIEST:
    case CLASS.MAGE:
    case CLASS.WARLOCK:
      return sub === 1;
    case CLASS.SHAMAN:
      if (specName === 'enhance') return sub === 2 || sub === 3;
      return sub === 1 || sub === 2 || sub === 3;
    case CLASS.DRUID:
      if (specName === 'feraltank' || specName === 'feraldps') return sub === 2;
      return sub === 1 || sub === 2;
    default:
      return true;
  }
}

function shouldEquipArmorForSpec(
  cls: number,
  specName: string,
  it: ItemDef,
  slot: ItemSlot | undefined = it.slot,
): boolean {
  // Cloaks always ok (invCloak); early-return so slot is not re-tested as 'back' below.
  if (slot === 'back') return true;
  if (slot === 'offhand' && (it.typeName === 'Shield' || it.armorSubclass === 6)) {
    return cls === CLASS.WARRIOR || cls === CLASS.PALADIN || cls === CLASS.SHAMAN;
  }
  // Holdable (offhand books) for casters
  if (slot === 'offhand' && !it.weapon && it.armorSubclass !== 6) {
    if (cls === CLASS.WARRIOR || cls === CLASS.HUNTER || cls === CLASS.ROGUE) return false;
    if ((cls === CLASS.PALADIN && specName !== 'holy') || (cls === CLASS.SHAMAN && specName === 'enhance')) {
      return false;
    }
    if ((cls === CLASS.DRUID) && (specName === 'feraltank' || specName === 'feraldps')) return false;
    // Never fall into the material table: holdables bake armorSubclass 0 (Miscellaneous),
    // which every material rule rejects — the trap the neck/finger/trinket early-return names.
    return true;
  }
  const sub = it.armorSubclass;
  if (sub == null && it.armor == null) return true;
  // invCloak already handled above; remaining armor is never a cloak here.
  return armorSubclassOk(cls, specName, sub, false);
}

/** Weapon subclass sets per class/spec — ShouldEquipWeaponForSpec classic. */
function shouldEquipWeaponForSpec(
  cls: number,
  specName: string,
  it: ItemDef,
  slot: ItemSlot | undefined = it.slot,
): boolean {
  const sub = it.weaponSubclass;
  // Relics / totems / idols / librams on ranged
  if (slot === 'ranged' && !it.weapon) {
    if (cls === CLASS.PALADIN) return it.typeName?.toLowerCase().includes('libram') || it.armorSubclass === 7;
    if (cls === CLASS.DRUID) return it.typeName?.toLowerCase().includes('idol') || it.armorSubclass === 8;
    if (cls === CLASS.SHAMAN) return it.typeName?.toLowerCase().includes('totem') || it.armorSubclass === 9;
    return false;
  }
  if (sub == null) {
    // shield
    if (it.armorSubclass === 6 || it.typeName === 'Shield') {
      return (cls === CLASS.WARRIOR && specName === 'prot')
        || (cls === CLASS.PALADIN && (specName === 'prot' || specName === 'holy'))
        || (cls === CLASS.SHAMAN && (specName === 'resto' || specName === 'elem'));
    }
    return true;
  }
  // subclass: 0 axe, 1 axe2, 2 bow, 3 gun, 4 mace, 5 mace2, 6 polearm, 7 sword, 8 sword2,
  // 10 staff, 13 fist, 15 dagger, 16 thrown, 18 crossbow, 19 wand
  const mh = new Set<number>();
  const oh = new Set<number>();
  const r = new Set<number>();
  switch (cls) {
    case CLASS.WARRIOR:
      if (specName === 'prot') {
        [0, 4, 7, 13, 15].forEach((x) => mh.add(x));
        oh.add(-1); // shield only for OH — handled above
        [2, 3, 18].forEach((x) => r.add(x));
      } else if (specName === 'arms') {
        [1, 5, 6, 8].forEach((x) => mh.add(x));
        [2, 3, 18].forEach((x) => r.add(x));
      } else {
        [0, 4, 7, 13, 15].forEach((x) => mh.add(x));
        [0, 4, 7, 13, 15].forEach((x) => oh.add(x));
        [2, 3, 18].forEach((x) => r.add(x));
      }
      break;
    case CLASS.PALADIN:
      if (specName === 'prot' || specName === 'holy') {
        [0, 4, 7].forEach((x) => mh.add(x));
      } else {
        [1, 5, 6, 8].forEach((x) => mh.add(x));
      }
      break;
    case CLASS.HUNTER:
      [0, 1, 6, 7, 8, 10, 13, 15].forEach((x) => mh.add(x));
      [2, 3, 18].forEach((x) => r.add(x));
      break;
    case CLASS.ROGUE:
      if (specName === 'assas') {
        mh.add(15); oh.add(15);
      } else if (specName === 'combat') {
        [4, 7].forEach((x) => { mh.add(x); oh.add(x); });
      } else {
        [4, 7, 13, 15].forEach((x) => { mh.add(x); oh.add(x); });
      }
      [2, 3, 16, 18].forEach((x) => r.add(x));
      break;
    case CLASS.PRIEST:
      [4, 10, 15].forEach((x) => mh.add(x));
      r.add(19);
      break;
    case CLASS.SHAMAN:
      if (specName === 'enhance') {
        // 2H axe/mace are the classic preference, but staff/1H/dagger/fist are all
        // proficient and routinely worn — zeroing them made every worn weapon score 0.
        [0, 1, 4, 5, 10, 13, 15].forEach((x) => mh.add(x));
        [0, 4, 13, 15].forEach((x) => oh.add(x));
      } else {
        [0, 4, 10, 13, 15].forEach((x) => mh.add(x));
      }
      break;
    case CLASS.MAGE:
    case CLASS.WARLOCK:
      [7, 10, 15].forEach((x) => mh.add(x));
      r.add(19);
      break;
    case CLASS.DRUID:
      [4, 5, 10, 15].forEach((x) => mh.add(x));
      break;
    default:
      return true;
  }
  if (slot === 'ranged') return r.size === 0 || r.has(sub);
  if (slot === 'offhand') {
    if (it.armorSubclass === 6) return oh.has(-1) || cls === CLASS.WARRIOR || cls === CLASS.PALADIN || cls === CLASS.SHAMAN;
    return oh.has(sub) || (oh.size === 0 && mh.has(sub));
  }
  // mainhand / twohand
  return mh.has(sub);
}

// Sort key used in InitEquipment when comparing candidates: GetStatWeight(item, spec) + Quality * ItemLevel
// (tie-break).
export function playerbotEquipScore(cls: number, specId: number, it: ItemDef): number {
  const w = calculateStatWeight(cls, specId, it);
  if (w <= 0) return 0;
  return w + (it.quality ?? 0) * (it.itemLevel ?? 0);
}

/** Resolve spec id from DataStore botSpecs + companion fields. */
export function companionPlayerbotSpecId(
  cls: number,
  specIdx: number | undefined,
  role: string | undefined,
  ds: DataStore,
): number {
  const specs = ds.botSpecs(cls);
  const botSpec = specIdx != null ? specs[specIdx] : undefined;
  return resolvePlayerbotSpecId(cls, { botSpec, role });
}

// Resolve the weightscale id for a live character, in priority order: an explicit specName, the
// dominant talent tree, then the role fallback or class default.
function asBotRole(role: string | undefined): 'tank' | 'healer' | 'dps' {
  if (role === 'tank' || role === 'healer' || role === 'dps') return role;
  return 'dps';
}

export function characterPlayerbotSpecId(
  char: Pick<Character, 'cls' | 'talents' | 'level'>,
  ds: DataStore,
  opts?: { role?: string; specName?: string | null },
): number {
  const role = asBotRole(opts?.role);
  if (opts?.specName && String(opts.specName).trim()) {
    return resolvePlayerbotSpecId(char.cls, {
      botSpec: {
        name: String(opts.specName),
        prob: 100,
        role,
        stages: [],
      },
      role,
    });
  }
  const trees = ds.talentTrees(char.cls);
  if (trees.length && char.talents) {
    // Minimal Character shell for spentInTree (only cls/talents are read).
    const shell = char as Character;
    let bestName: string | undefined;
    let bestPts = 0;
    for (const tree of trees) {
      const pts = spentInTree(shell, tree.tabId, ds);
      if (pts > bestPts) {
        bestPts = pts;
        bestName = tree.name;
      }
    }
    if (bestPts > 0 && bestName) {
      return resolvePlayerbotSpecId(char.cls, {
        botSpec: { name: bestName, prob: 100, role, stages: [] },
        role,
      });
    }
  }
  return resolvePlayerbotSpecId(char.cls, { role });
}
