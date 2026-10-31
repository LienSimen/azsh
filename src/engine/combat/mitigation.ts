// Classic 1.12 armor mitigation plus magic resistance and partial resists, ported from Unit.cpp. Pure
// helpers: every roll takes an injected Rng or a pre-rolled int, and nothing draws Math.random.

import type { School } from '../../data/schema.ts';
import type { Rng } from '../core/rng.ts';

// ---- Skill cap ----------------------------------------------------------------

/** Unit.h GetSkillMaxForLevel: level * 5. */
export function skillMaxForLevel(level: number): number {
  return Math.max(1, Math.floor(level)) * 5;
}

// ---- Armor (physical) ---------------------------------------------------------

// The fraction of physical damage armor removes, closed form as armor over armor plus 400 plus 85 per
// level. Classic has NO armor-penetration item rating, so pass 0 until the aura is wired.
export function armorMitigation(armor: number, attackerLevel: number, armorPenetration = 0): number {
  let a = armor - armorPenetration;
  if (a < 0) a = 0;
  const levelModifier = attackerLevel;
  // Prefer the CMaNGOS float path order for parity; closed form is algebraically identical.
  let tmp = (0.1 * a) / (8.5 * levelModifier + 40);
  tmp = tmp / (1.0 + tmp);
  if (tmp < 0) tmp = 0;
  if (tmp > 0.75) tmp = 0.75;
  return tmp;
}

// ---- Partial resist distribution table ----------------------------------------
// The 101 precalculated 1% rows, inflated to 0.01% steps by linear interpolation and rounding.

export const NUM_SPELL_PARTIAL_RESISTS = 5;
export const SPELL_PARTIAL_RESIST_NONE = 0;
export const SPELL_PARTIAL_RESIST_PCT_25 = 1;
export const SPELL_PARTIAL_RESIST_PCT_50 = 2;
export const SPELL_PARTIAL_RESIST_PCT_75 = 3;
export const SPELL_PARTIAL_RESIST_PCT_100 = 4;

/** One row: weights for portions NONE, 25, 50, 75, 100 (sum = 10000). */
export type SpellPartialResistChanceEntry = readonly [number, number, number, number, number];

/** Precalculated 0%..100% (inclusive) rows — Unit.cpp InitSpellPartialResistDistribution source. */
export const SPELL_PARTIAL_RESIST_PRECALC: readonly SpellPartialResistChanceEntry[] = [
  [10000, 0, 0, 0, 0],
  [9700, 200, 100, 0, 0],
  [9400, 400, 200, 0, 0],
  [9000, 800, 200, 0, 0],
  [8700, 1000, 300, 0, 0],
  [8400, 1200, 400, 0, 0],
  [8200, 1300, 400, 100, 0],
  [7900, 1500, 500, 100, 0],
  [7600, 1700, 600, 100, 0],
  [7300, 1900, 700, 100, 0],
  [6900, 2300, 700, 100, 0],
  [6600, 2500, 800, 100, 0],
  [6300, 2700, 900, 100, 0],
  [6000, 2900, 1000, 100, 0],
  [5800, 3000, 1000, 200, 0],
  [5400, 3300, 1100, 200, 0],
  [5100, 3600, 1100, 200, 0],
  [4800, 3800, 1200, 200, 0],
  [4400, 4200, 1200, 200, 0],
  [4100, 4400, 1300, 200, 0],
  [3700, 4800, 1300, 200, 0],
  [3400, 5000, 1400, 200, 0],
  [3100, 5200, 1500, 200, 0],
  [3000, 5200, 1500, 200, 100],
  [2800, 5300, 1500, 300, 100],
  [2500, 5500, 1600, 300, 100],
  [2400, 5400, 1700, 400, 100],
  [2300, 5300, 1800, 500, 100],
  [2200, 5100, 2100, 500, 100],
  [2100, 5000, 2200, 600, 100],
  [2000, 4900, 2400, 600, 100],
  [1900, 4700, 2600, 700, 100],
  [1800, 4600, 2700, 800, 100],
  [1700, 4400, 3000, 800, 100],
  [1600, 4300, 3100, 900, 100],
  [1500, 4200, 3200, 1000, 100],
  [1400, 4100, 3300, 1100, 100],
  [1300, 3900, 3600, 1100, 100],
  [1300, 3600, 3800, 1200, 100],
  [1200, 3500, 3900, 1300, 100],
  [1100, 3400, 4000, 1400, 100],
  [1000, 3300, 4100, 1500, 100],
  [900, 3100, 4400, 1500, 100],
  [800, 3000, 4500, 1600, 100],
  [800, 2700, 4700, 1700, 100],
  [700, 2600, 4800, 1800, 100],
  [600, 2500, 4900, 1900, 100],
  [600, 2300, 5000, 1900, 200],
  [500, 2200, 5100, 2000, 200],
  [300, 2200, 5300, 2000, 200],
  [200, 2100, 5400, 2100, 200],
  [200, 2000, 5300, 2200, 300],
  [200, 2000, 5100, 2200, 500],
  [200, 1900, 5000, 2300, 600],
  [100, 1900, 4900, 2500, 600],
  [100, 1800, 4800, 2600, 700],
  [100, 1700, 4700, 2700, 800],
  [100, 1600, 4500, 3000, 800],
  [100, 1500, 4400, 3100, 900],
  [100, 1500, 4100, 3300, 1000],
  [100, 1400, 4000, 3400, 1100],
  [100, 1300, 3900, 3500, 1200],
  [100, 1200, 3800, 3600, 1300],
  [100, 1100, 3600, 3900, 1300],
  [100, 1100, 3300, 4100, 1400],
  [100, 1000, 3200, 4200, 1500],
  [100, 900, 3100, 4300, 1600],
  [100, 800, 3000, 4400, 1700],
  [100, 800, 2700, 4600, 1800],
  [100, 700, 2600, 4700, 1900],
  [100, 600, 2400, 4900, 2000],
  [100, 600, 2200, 5000, 2100],
  [100, 500, 2100, 5100, 2200],
  [100, 500, 1800, 5300, 2300],
  [100, 400, 1700, 5400, 2400],
  [100, 300, 1600, 5500, 2500],
  [100, 300, 1500, 5300, 2800],
  [100, 200, 1500, 5200, 3000],
  [0, 200, 1500, 5200, 3100],
  [0, 200, 1400, 5000, 3400],
  [0, 200, 1300, 4800, 3700],
  [0, 200, 1300, 4400, 4100],
  [0, 200, 1200, 4200, 4400],
  [0, 200, 1200, 3800, 4800],
  [0, 200, 1100, 3600, 5100],
  [0, 200, 1100, 3300, 5400],
  [0, 200, 1000, 3000, 5800],
  [0, 100, 1000, 2900, 6000],
  [0, 100, 900, 2700, 6300],
  [0, 100, 800, 2500, 6600],
  [0, 100, 700, 2300, 6900],
  [0, 100, 700, 1900, 7300],
  [0, 100, 600, 1700, 7600],
  [0, 100, 500, 1500, 7900],
  [0, 100, 400, 1300, 8200],
  [0, 0, 400, 1200, 8400],
  [0, 0, 300, 1000, 8700],
  [0, 0, 200, 800, 9000],
  [0, 0, 200, 400, 9400],
  [0, 0, 100, 200, 9700],
  [0, 0, 0, 0, 10000],
];

function initSpellPartialResistDistribution(): SpellPartialResistChanceEntry[] {
  const inflated: SpellPartialResistChanceEntry[] = new Array(10001);
  for (let row = 0; row < SPELL_PARTIAL_RESIST_PRECALC.length; row++) {
    const next = row + 1;
    const shift = row * 100;
    const source = SPELL_PARTIAL_RESIST_PRECALC[row]!;
    if (next === SPELL_PARTIAL_RESIST_PRECALC.length) {
      inflated[shift] = source;
      break;
    }
    const ahead = SPELL_PARTIAL_RESIST_PRECALC[next]!;
    for (let intermediate = 0; intermediate < 100; intermediate++) {
      const index = shift + intermediate;
      const values: [number, number, number, number, number] = [0, 0, 0, 0, 0];
      for (let column = 0; column < NUM_SPELL_PARTIAL_RESISTS; column++) {
        const base = source[column]!;
        const upcoming = ahead[column]!;
        const diff = upcoming - base;
        // C++: uint32(std::max(0.0, (base + ::round(diff * (intermediate / 100.0)))))
        values[column] = Math.max(0, Math.round(base + diff * (intermediate / 100.0))) | 0;
      }
      inflated[index] = values;
    }
  }
  return inflated;
}

/** Full distribution: index = floor(percent * 100), length 10001. */
export const SPELL_PARTIAL_RESIST_DISTRIBUTION: readonly SpellPartialResistChanceEntry[] =
  initSpellPartialResistDistribution();

/** Lookup weights at a resistance percent (0..75 typical). Index = floor(percent * 100). */
function partialResistWeightsAt(percent: number): SpellPartialResistChanceEntry {
  const index = Math.min(10000, Math.max(0, Math.floor(percent * 100)));
  return SPELL_PARTIAL_RESIST_DISTRIBUTION[index]!;
}

// ---- Effective magic resistance % ---------------------------------------------

export interface EffectiveMagicResistanceArgs {
  school: School;
  /** Victim resistance for this school (raw). Multi-school not modeled — pass the school in use. */
  resistance: number;
  /** Attacker penetration (default 0). */
  penetration?: number;
  attackerLevel: number;
  victimLevel: number;
  binary?: boolean;
  /** TYPEID_UNIT && !PLAYER_CONTROLLED — NPC non-binary skill bonus. */
  victimIsNpc?: boolean;
}

// Unit.cpp CalculateEffectiveMagicResistancePercent ~3897. Returns a **percentage** (0..75 typical;
// negative if vulnerability). Holy and physical → 0.
export function effectiveMagicResistancePercent(args: EffectiveMagicResistanceArgs): number {
  const school = args.school;
  // Non-magical / physical component ignores resistances completely.
  if (school === 'physical') return 0;
  // Completely ignore holy resistance value (since beta stages).
  if (school === 'holy') return 0;

  const amount = args.resistance;
  const penetration = args.penetration ?? 0;
  // Modify by penetration, but can't go negative with it (C++):
  // result = amount - pen; if result < 0 → min(amount, 0)
  let resistance = amount - penetration;
  if (resistance < 0) resistance = Math.min(amount, 0);

  let percent = 0;

  if (resistance >= 0) {
    // Attacker's level-based skill, floor 100 for low levels.
    const skill = Math.max(skillMaxForLevel(args.attackerLevel), 100);
    percent += (resistance / skill) * 100;
    // Pre-3.0: multiplied by 0.75
    percent *= 0.75;
    // Bonus for NPC victims on non-binary spells when victim skill max > attacker skill.
    if (!args.binary && args.victimIsNpc) {
      const victimSkillMax = skillMaxForLevel(args.victimLevel);
      percent += 0.4 * Math.max(victimSkillMax - skill, 0);
    }
    percent = Math.min(percent, 75.0);
  } else {
    // Magic vulnerability: victim skill floor 100.
    const skill = Math.max(skillMaxForLevel(args.victimLevel), 100);
    percent += (resistance / skill) * 100;
  }
  return percent;
}

// ---- Partial resist roll ------------------------------------------------------

// The damage type for the partial-resist roll: a weapon swing takes the high-percentage full-hit
// bump, a player spell does not, and a binary DoT still rolls partials.
export type MagicDamageType = 'weapon' | 'spell' | 'dot';

export interface RollMagicResistanceArgs {
  /** Effective resistance percent from effectiveMagicResistancePercent. */
  percent: number;
  binary?: boolean;
  damageType?: MagicDamageType;
  // When true, attacker is player-controlled (player/pet). Used for the high-% portion bump (C++:
  // DIRECT_DAMAGE || !attacker player-controlled).
  attackerPlayerControlled?: boolean;
  // Injected RNG. **Gated**: no draw when index==0 or vulnerability path. Uses rng.int(1, 10000) to match
  // urand(1, 10000).
  rng?: Rng;
  /** Optional pre-rolled 1..10000 for pure tests (skips rng). */
  roll1to10000?: number;
}

// RollMagicResistanceMultiplierOutcomeAgainst, returning the RESISTED fraction in fifths — the enum
// names say quarters and the math says fifths, which is ported as-is. Binary direct damage skips it.
export function rollMagicResistanceMultiplier(args: RollMagicResistanceArgs): number {
  let percentage = args.percent;

  // Magic vulnerability: negative percent → damage *amp* (negative resisted fraction).
  if (percentage < 0) return percentage * 0.01;

  // Pre-TBC: reduced mitigation (10% of normal) against DoTs from binary spells.
  if (args.damageType === 'dot' && args.binary) percentage *= 0.1;

  // uint32(percentage * 100) — truncate toward zero for positive floats.
  const index = (percentage * 100) | 0;
  if (!index) return 0.0; // **no RNG** — preserve zero-res determinism

  const chances = SPELL_PARTIAL_RESIST_DISTRIBUTION[Math.min(index, 10000)]!;
  const random = args.roll1to10000 ?? args.rng!.int(1, 10000);

  // Die roll over cumulative weights (Util.h Die::roll).
  let rolling = 0;
  let portion = SPELL_PARTIAL_RESIST_NONE;
  let hit = false;
  for (let outcome = 0; outcome < NUM_SPELL_PARTIAL_RESISTS; outcome++) {
    const w = chances[outcome]!;
    if (w) {
      rolling += w;
      if (random <= rolling) {
        portion = outcome;
        hit = true;
        break;
      }
    }
  }
  if (!hit) portion = SPELL_PARTIAL_RESIST_NONE;

  // C++ clamps to NUM_SPELL_PARTIAL_RESISTS - 1 (still allows 100% bucket / portion 4).
  portion = Math.min(portion, NUM_SPELL_PARTIAL_RESISTS - 1);

  // The pre-3.0 rounding-error simulation for the high-resistance full-hit cutoff: NPC non-binary
  // spells, environmental damage and elemental attacks. A player's direct spell does NOT get it.
  if (portion === SPELL_PARTIAL_RESIST_NONE && percentage > 54.0) {
    const binary = !!args.binary;
    const weaponOrEnv = (args.damageType ?? 'spell') === 'weapon';
    const attackerNpcOrEnv = args.attackerPlayerControlled === false;
    if (!binary && (weaponOrEnv || attackerNpcOrEnv)) {
      portion += 1;
    }
  }

  return portion / NUM_SPELL_PARTIAL_RESISTS;
}

// ---- Spell miss / full resist -------------------------------------------------

export interface SpellMissChanceArgs {
  atkLevel: number;
  defLevel: number;
  /** Victim is player-controlled (player/pet) → smaller +3 level miss factor (7 vs 11). */
  victimPlayerControlled?: boolean;
  /** Caster spell hit bonus in percentage points (gear). Default 0. */
  spellHitBonusPercent?: number;
  // SPELL_AURA_MOD_AOE_AVOIDANCE on the victim, added when the incoming spell is area. Cite:
  // Unit.cpp:3713–3715.
  aoeAvoidancePercent?: number;
  // ALWAYS_HIT — the miss component is 0 before the 1% floor, on 47 playable rows. It does NOT clear
  // the resistance term, which the C++ keeps adding. Cite: Unit.cpp:3843-3845, :3995-3997.
  alwaysHit?: boolean;
  // A totem victim has a flat 0 miss chance, and the early return means the level difference never
  // applies either. Miss only — a totem's zero resistances still go through the resist term.
  victimIsTotem?: boolean;
  // The attacker-spell-hit aura on the victim for THIS school, signed and subtracted from miss, so a
  // negative amount raises it. Cite: Unit.cpp:3873-3874.
  attackerSpellHitPercent?: number;
}

// Unit.cpp CalculateSpellMissChance ~3841 (magic path). Returns miss **percentage** (0..100), min 1%
// pre-WotLK.
export function spellMissChancePercent(args: SpellMissChanceArgs): number {
  // Both early returns land before the 1% floor, so these really are 0 and not 1.
  if (args.alwaysHit || args.victimIsTotem) return 0;
  // GetMissChance(schoolMask) base 4%.
  let chance = 4.0;
  const difference = args.defLevel - args.atkLevel;
  let factor = 1;
  if (difference > 2) {
    chance += 2 * factor;
    factor = args.victimPlayerControlled ? 7 : 11;
    chance += (difference - 2) * factor;
  } else {
    chance += difference * factor;
  }
  chance -= args.spellHitBonusPercent ?? 0;
  // Victim aura 186. Cite: Unit.cpp:3874 chance -= GetTotalAuraModifierByMiscMask(186, mask).
  chance -= args.attackerSpellHitPercent ?? 0;
  if ((args.aoeAvoidancePercent ?? 0) !== 0) chance += args.aoeAvoidancePercent ?? 0;
  // Pre-WotLK: unavoidable spell miss is at least 1%.
  if (chance < 1.0) chance = 1.0;
  if (chance > 100.0) chance = 100.0;
  return chance;
}

export interface SpellResistChanceArgs extends SpellMissChanceArgs {
  school: School;
  resistance: number;
  penetration?: number;
  binary?: boolean;
  /** Attacker is player/pet — non-binary full resist uses 100% bucket. NPCs skip that add. */
  attackerPlayerControlled?: boolean;
  victimIsNpc?: boolean;
  /** When false, skip resistance full-resist contribution (non-resistable). Default true for magic schools. */
  resistable?: boolean;
  // MOD_MECHANIC_RESISTANCE — the max over the spell's mechanic and its effect mechanics, added onto
  // the same die as miss and school resist. Cite: Unit.cpp:4015–4031.
  mechanicResistPercent?: number;
}

// Unit.cpp CalculateSpellResistChance ~3988 (magic + resistance full resist). Returns combined
// miss+full-resist **percentage** for the land roll.
export function spellResistChancePercent(args: SpellResistChanceArgs): number {
  // Pre-WotLK: magic resist and miss/hit share one die side.
  let chance = spellMissChancePercent(args);

  const school = args.school;
  const resistable = args.resistable ?? (school !== 'physical');
  // IsResistableSpell && DmgClass magic — we treat non-physical schools as magic dmg class.
  if (resistable && school !== 'physical') {
    const percent = effectiveMagicResistancePercent({
      school,
      resistance: args.resistance,
      penetration: args.penetration,
      attackerLevel: args.atkLevel,
      victimLevel: args.defLevel,
      binary: args.binary,
      victimIsNpc: args.victimIsNpc,
    });
    if (percent > 0) {
      if (args.binary) {
        chance += percent;
      } else if (args.attackerPlayerControlled) {
        // 100% bucket weight * 0.01 → percentage points (Unit.cpp ~4008).
        const index = (percent * 100) | 0;
        if (index > 0) {
          const row = SPELL_PARTIAL_RESIST_DISTRIBUTION[Math.min(index, 10000)]!;
          chance += row[SPELL_PARTIAL_RESIST_PCT_100]! * 0.01;
        }
      }
    }
  }

  // Mechanic resist is on the same die, not a second roll after SpellHitResult.
  // Cite: Unit.cpp:4015–4031 (spell.Mechanic + max EffectMechanic).
  if (args.mechanicResistPercent) chance += args.mechanicResistPercent;

  if (chance < 0) chance = 0;
  if (chance > 100) chance = 100;
  return chance;
}

/** Land chance 0..1 for a magic damage spell (1 − resist%/100). */
export function spellDamageLandChance(args: SpellResistChanceArgs): number {
  return Math.max(0, Math.min(1, 1 - spellResistChancePercent(args) / 100));
}

// ---- Binary / resistable classification ---------------------------------------
// The full port reads the raw effect slots, which the ETL bakes; the effect-kind proxy is a fallback.

/** SharedDefines.h SPELL_DAMAGE_CLASS_* */
export const SPELL_DAMAGE_CLASS = {
  NONE: 0,
  MAGIC: 1,
  MELEE: 2,
  RANGED: 3,
} as const;

// SpellEffectDefines.h / SpellAuraDefines.h constants used by IsSpellEffectDamage.
const SE_SCHOOL_DAMAGE = 2;
const SE_DUMMY = 3;
const SE_ENVIRONMENTAL_DAMAGE = 7;
const SE_HEALTH_LEECH = 9;
const SE_WEAPON_DAMAGE_NOSCHOOL = 17;
const SE_WEAPON_PERCENT_DAMAGE = 31;
const SE_TRIGGER_MISSILE = 32;
const SE_WEAPON_DAMAGE = 58;
const SE_TRIGGER_SPELL = 64;
const SE_NORMALIZED_WEAPON_DMG = 121;

const SA_PERIODIC_DAMAGE = 3;
const SA_DUMMY = 4;
const SA_PERIODIC_LEECH = 53;
const SA_PERIODIC_MANA_LEECH = 64;
const SA_PERIODIC_DAMAGE_PERCENT = 89;

/** Minimal SpellEntry slice for IsBinarySpell / IsResistableSpell. */
export interface SpellBinaryEntry {
  effects: readonly number[];           // Effect[3]
  applyAura: readonly number[];         // EffectApplyAuraName[3]
  implicitTargetA?: readonly number[];  // EffectImplicitTargetA[3]
  implicitTargetB?: readonly number[];  // EffectImplicitTargetB[3]
}

function isSpellEffectDummyEntry(entry: SpellBinaryEntry, i: number): boolean {
  const aura = entry.applyAura[i] | 0;
  const eff = entry.effects[i] | 0;
  if (!aura) return eff === SE_DUMMY;
  return aura === SA_DUMMY;
}

function isSpellEffectTriggerEntry(entry: SpellBinaryEntry, i: number): boolean {
  const eff = entry.effects[i] | 0;
  return eff === SE_TRIGGER_MISSILE || eff === SE_TRIGGER_SPELL;
}

/** SpellMgr.h IsSpellEffectDamage ~633 */
export function isSpellEffectDamageEntry(entry: SpellBinaryEntry, i: number): boolean {
  const aura = entry.applyAura[i] | 0;
  const eff = entry.effects[i] | 0;
  if (!aura) {
    switch (eff) {
      case SE_SCHOOL_DAMAGE:
      case SE_ENVIRONMENTAL_DAMAGE:
      case SE_HEALTH_LEECH:
      case SE_WEAPON_DAMAGE_NOSCHOOL:
      case SE_WEAPON_PERCENT_DAMAGE:
      case SE_WEAPON_DAMAGE:
      case SE_NORMALIZED_WEAPON_DMG:
        return true;
      default:
        return false;
    }
  }
  switch (aura) {
    case SA_PERIODIC_DAMAGE:
    case SA_PERIODIC_LEECH:
    case SA_PERIODIC_MANA_LEECH:
    case SA_PERIODIC_DAMAGE_PERCENT:
      return true;
    default:
      return false;
  }
}

// SpellMgr.h IsBinarySpell ~698 — full pre-WotLK port including ImplicitTarget overlap. source: SpellMgr.h;
// data from spell_template via enrich-binary-resist.mjs
function isBinarySpellEntry(entry: SpellBinaryEntry, effectMask = 0x7): boolean {
  let validmask = 0;
  let nondmgmask = 0;
  let auramask = 0;

  for (let i = 0; i < 3; i++) {
    const thisMask = 1 << i;
    const eff = entry.effects[i] | 0;
    if (!eff || !(effectMask & thisMask)) continue;
    if (isSpellEffectDummyEntry(entry, i) || isSpellEffectTriggerEntry(entry, i)) continue;

    validmask |= thisMask;
    if (entry.applyAura[i]) auramask |= thisMask;
    if (!isSpellEffectDamageEntry(entry, i)) nondmgmask |= thisMask;
  }

  if (!validmask) return false;
  if (nondmgmask === validmask || auramask === validmask) return true;

  const dmgmask = validmask & ~nondmgmask;
  const dotmask = dmgmask & auramask;
  if (dmgmask === dotmask) return true;

  // Pre-WotLK: non-damage + direct damage sharing ImplicitTargetA/B → binary (Frostbolt).
  if (nondmgmask) {
    let directmask = dmgmask & ~dotmask;
    for (let i = 0; directmask; i++, directmask >>= 1) {
      if (!(directmask & 1)) continue;
      let jmask = nondmgmask;
      for (let j = 0; jmask; j++, jmask >>= 1) {
        if (!(jmask & 1)) continue;
        const aI = entry.implicitTargetA?.[i] ?? 0;
        const aJ = entry.implicitTargetA?.[j] ?? 0;
        const bI = entry.implicitTargetB?.[i] ?? 0;
        const bJ = entry.implicitTargetB?.[j] ?? 0;
        if (aI === aJ && bI === bJ) return true;
      }
    }
  }
  return false;
}

/** SpellMgr.h IsResistableSpell ~628: DmgClass != NONE. */
export function isResistableDmgClass(dmgClass: number): boolean {
  return dmgClass !== SPELL_DAMAGE_CLASS.NONE;
}

/** Prefer baked `binary` from ETL (full IsBinarySpell); else effect-kind proxy. */
export function resolveSpellBinary(spell: {
  binary?: boolean;
  effects?: readonly { kind: string }[];
}): boolean {
  if (typeof spell.binary === 'boolean') return spell.binary;
  return isBinarySpellFromEffects(spell.effects ?? []);
}

// Fallback when ETL binary flag is absent: approximate IsBinarySpell from Phonecraft effect kinds only (no
// ImplicitTarget). Prefer resolveSpellBinary / baked `binary`.
export function isBinarySpellFromEffects(effects: readonly { kind: string }[]): boolean {
  let valid = 0;
  let nondmg = 0;
  let aura = 0;
  let dmg = 0;
  let dot = 0;

  for (const e of effects) {
    const k = e.kind;
    if (k === 'conjure') continue;

    valid++;
    const isDmg = k === 'direct_damage' || k === 'dot';
    const isAura = k === 'dot' || k === 'buff' || k === 'cc' || k === 'root' || k === 'seal'
      || k === 'resist' || k === 'restore_health' || k === 'restore_power';
    if (!isDmg) nondmg++;
    if (isAura) aura++;
    if (isDmg) dmg++;
    if (k === 'dot') dot++;
  }

  if (!valid) return false;
  if (nondmg === valid) return true;
  if (aura === valid) return true;
  if (dmg === dot && dmg > 0 && nondmg === 0) return true;
  if (nondmg > 0 && dmg > dot) return true;
  return false;
}
