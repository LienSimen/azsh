// Offline full kits for the temporary weapon imbues. A live bake row is often thin — enchant id,
// duration and family — so combat needs the equip and combat payloads filled in at resolve time.

import type { SpellEffect } from '../../../data/schema.ts';
import { FLAMETONGUE_ATTACK_SPELL_ID } from './registry/packs/shaman.ts';

export type WeaponImbueEffect = Extract<SpellEffect, { kind: 'weapon_imbue' }>;

/** Partial kit fields merged onto a thin weapon_imbue effect. */
export type WeaponImbueKitFields = Pick<
  WeaponImbueEffect,
  | 'attackPower'
  | 'equipSpellId'
  | 'combatSpellId'
  | 'combatChancePct'
  | 'combatPpm'
  | 'damageFlat'
  | 'rockbiterAmount'
  | 'combat'
>;

// Rockbiter's equip passive attack power by enchant id, with the amounts from the baked passive. The
// cached amount is for a mid-fight apply; the sheet's attack power comes from the equip aura alone.
const ROCKBITER_BY_ENCHANT: ReadonlyMap<number, WeaponImbueKitFields> = new Map([
  [29, { attackPower: 29, equipSpellId: 10400 }],
  [6, { attackPower: 58, equipSpellId: 15567 }],
  [1, { attackPower: 88, equipSpellId: 15568 }],
  [503, { attackPower: 129, equipSpellId: 15569 }],
  [1663, { attackPower: 211, equipSpellId: 16311 }],
  [683, { attackPower: 393, equipSpellId: 16312 }],
  [1664, { attackPower: 554, equipSpellId: 16313 }],
]);

// Flametongue's combat spell, whose stored value is the formula COEFFICIENT and not flat damage:
// combat multiplies it by weapon speed. Using it flat was a ~326-per-swing bug.
function flametongueKit(procSpellId: number, damageCoeff: number): WeaponImbueKitFields {
  return {
    combatSpellId: procSpellId,
    combatChancePct: 100,
    combat: {
      spellId: FLAMETONGUE_ATTACK_SPELL_ID,
      name: 'Flametongue Attack',
      direct: { school: 'fire', min: damageCoeff, max: damageCoeff },
    },
  };
}

/** Enchant id → Flametongue kit. Proc bp from classicmangos spell_template + pack comments. */
const FLAMETONGUE_BY_ENCHANT: ReadonlyMap<number, WeaponImbueKitFields> = new Map([
  [5, flametongueKit(8026, 326)], // r1 bp 325 + dice 1
  [4, flametongueKit(8028, 479)], // r2 bp 478 + dice 1
  [3, flametongueKit(8029, 716)], // r3 bp 715 + dice 1
  [523, flametongueKit(10445, 1144)], // r4 bp 1143 + dice 1
  [1665, flametongueKit(16343, 1876)], // r5 bp 1875 + dice 1
  [1666, flametongueKit(16344, 2498)], // r6 bp 2497 + dice 1
]);

// Frostbrand's combat spell is flat frost damage, not speed-scaled like Flametongue, and its chance is
// a PPM. Every rank also applies a -25% chill for eight seconds, which the thin bake omits.
const FROSTBRAND_CHILL = {
  aura: 33,
  pct: -25,
  durationMs: 8000,
  hostile: true as const,
  mechanic: 'snare',
};

function frostbrandKit(
  attackSpellId: number,
  frostDamage: number,
  ppm?: number,
): WeaponImbueKitFields {
  return {
    combatSpellId: attackSpellId,
    ...(ppm != null && ppm > 0 ? { combatPpm: ppm } : {}),
    combat: {
      spellId: attackSpellId,
      name: 'Frostbrand Attack',
      direct: { school: 'frost', min: frostDamage, max: frostDamage },
      speed: { ...FROSTBRAND_CHILL },
    },
  };
}

/** Enchant id → Frostbrand kit. Damage from lock9a / enrich-weapon-imbues combatPayload. */
const FROSTBRAND_BY_ENCHANT: ReadonlyMap<number, WeaponImbueKitFields> = new Map([
  [2, frostbrandKit(8034, 35, 9)], // r1 PPM 9
  [12, frostbrandKit(8037, 53)], // r2
  [524, frostbrandKit(10458, 84)], // r3
  [1667, frostbrandKit(16352, 134)], // r4
  [1668, frostbrandKit(16353, 175)], // r5
]);

// Windfury — the family MISSING from this table entirely, which is why the weapon granted no extra
// attacks: the proc carries both the attack-power aura and TWO extra attacks, and neither was produced.
function windfuryKit(procSpellId: number, apBonus: number): WeaponImbueKitFields {
  return {
    combatSpellId: procSpellId,
    combatChancePct: 20,
    combat: {
      spellId: procSpellId,
      name: 'Windfury Weapon',
      extraAttacks: WINDFURY_WEAPON_EXTRA_ATTACKS,
      apBonus,
    },
  };
}

/** spell_template 8233/8236/10484/16361: EffectBasePoints 1 + EffectBaseDice 1 = 2. */
const WINDFURY_WEAPON_EXTRA_ATTACKS = 2;

/** Enchant id → Windfury kit. AP = aura-99 (bp + baseDice) on the enchant's proc spell. */
const WINDFURY_BY_ENCHANT: ReadonlyMap<number, WeaponImbueKitFields> = new Map([
  [283, windfuryKit(8233, 46)], // r1  bp 45  + dice 1
  [284, windfuryKit(8236, 119)], // r2  bp 118 + dice 1
  [525, windfuryKit(10484, 249)], // r3  bp 248 + dice 1
  [1669, windfuryKit(16361, 333)], // r4  bp 332 + dice 1
]);

// The full kit fields for an enchant id, or undefined for a poison, oil or unknown enchant, which stay
// thin. Coverage is per-family and hand-maintained, so a missing family is a silently dead ability.
export function weaponImbueKitForEnchant(enchantId: number): WeaponImbueKitFields | undefined {
  return (
    ROCKBITER_BY_ENCHANT.get(enchantId)
    ?? FLAMETONGUE_BY_ENCHANT.get(enchantId)
    ?? FROSTBRAND_BY_ENCHANT.get(enchantId)
    ?? WINDFURY_BY_ENCHANT.get(enchantId)
  );
}

/** Every enchant id the offline shaman table covers, for the coverage gate. */
function weaponImbueKitEnchantIds(): number[] {
  return [
    ...ROCKBITER_BY_ENCHANT.keys(),
    ...FLAMETONGUE_BY_ENCHANT.keys(),
    ...FROSTBRAND_BY_ENCHANT.keys(),
    ...WINDFURY_BY_ENCHANT.keys(),
  ];
}

// True when the imbue already carries a combat or equip payload. The chance and PPM fields MUST be
// here: a poison bake carrying only a proc chance was silently rejected at the merge and never procced.
export function weaponImbueHasCombatKit(imbue: WeaponImbueEffect): boolean {
  return !!(
    imbue.attackPower
    || imbue.rockbiterAmount
    || imbue.combat
    || imbue.combatSpellId
    || imbue.damageFlat
    || (imbue.combatChancePct != null && imbue.combatChancePct > 0)
    || (imbue.combatPpm != null && imbue.combatPpm > 0)
    || imbue.equipSpellId
  );
}

/** Merge kit fields onto an imbue (only fills missing keys). */
export function mergeWeaponImbueKit(
  imbue: WeaponImbueEffect,
  kit: WeaponImbueKitFields,
): WeaponImbueEffect {
  if (kit.attackPower != null && imbue.attackPower == null) imbue.attackPower = kit.attackPower;
  if (kit.equipSpellId != null && imbue.equipSpellId == null) imbue.equipSpellId = kit.equipSpellId;
  if (kit.combatSpellId != null && imbue.combatSpellId == null) imbue.combatSpellId = kit.combatSpellId;
  if (kit.combatChancePct != null && imbue.combatChancePct == null) imbue.combatChancePct = kit.combatChancePct;
  if (kit.combatPpm != null && imbue.combatPpm == null) imbue.combatPpm = kit.combatPpm;
  if (kit.damageFlat != null && imbue.damageFlat == null) imbue.damageFlat = kit.damageFlat;
  if (kit.rockbiterAmount != null && imbue.rockbiterAmount == null) imbue.rockbiterAmount = kit.rockbiterAmount;
  if (kit.combat) {
    if (!imbue.combat) {
      imbue.combat = {
        ...kit.combat,
        ...(kit.combat.direct ? { direct: { ...kit.combat.direct } } : {}),
        ...(kit.combat.dot ? { dot: { ...kit.combat.dot } } : {}),
        ...(kit.combat.speed ? { speed: { ...kit.combat.speed } } : {}),
        ...(kit.combat.buffs ? { buffs: kit.combat.buffs.map((b) => ({ ...b })) } : {}),
      };
    } else {
      // Deep-fill missing combat subfields (bake often has direct-only; kit adds chill).
      if (kit.combat.direct && !imbue.combat.direct) {
        imbue.combat.direct = { ...kit.combat.direct };
      }
      if (kit.combat.dot && !imbue.combat.dot) {
        imbue.combat.dot = { ...kit.combat.dot };
      }
      if (kit.combat.speed && !imbue.combat.speed) {
        imbue.combat.speed = { ...kit.combat.speed };
      }
      if (kit.combat.buffs?.length && !imbue.combat.buffs?.length) {
        imbue.combat.buffs = kit.combat.buffs.map((b) => ({ ...b }));
      }
      if (kit.combat.extraAttacks != null && imbue.combat.extraAttacks == null) {
        imbue.combat.extraAttacks = kit.combat.extraAttacks;
      }
      if (kit.combat.apBonus != null && imbue.combat.apBonus == null) {
        imbue.combat.apBonus = kit.combat.apBonus;
      }
    }
  }
  return imbue;
}

// Map a baked enchantment row onto the imbue kit fields. An optional spell lookup fills the combat
// damage from the combat spell's own bake; without it the id and chance still land.
export function kitFromItemEnchant(
  ench: {
    effects: ReadonlyArray<{
      type: string;
      spellId?: number;
      chancePct?: number;
      ppm?: number;
      amount?: number;
      amountPerSecOfSpeed?: number;
      grants?: ReadonlyArray<{ kind: string; amount?: number }>;
    }>;
  },
  spellLookup?: (spellId: number) => {
    id: number;
    name: string;
    effects?: ReadonlyArray<{
      kind: string;
      school?: string;
      min?: number;
      max?: number;
      durationMs?: number;
      tickMs?: number;
    }>;
  } | undefined,
): WeaponImbueKitFields | undefined {
  const kit: WeaponImbueKitFields = {};
  for (const e of ench.effects) {
    if (e.type === 'weapon_damage' && e.amount != null && e.amount > 0) {
      kit.damageFlat = e.amount;
    } else if (e.type === 'combat_spell' && e.spellId) {
      kit.combatSpellId = e.spellId;
      if (e.chancePct != null && e.chancePct > 0) kit.combatChancePct = e.chancePct;
      if (e.ppm != null && e.ppm > 0) kit.combatPpm = e.ppm;
      if (spellLookup) {
        const sp = spellLookup(e.spellId);
        if (sp) {
          const combat = combatPayloadFromSpell(sp);
          if (combat) kit.combat = combat;
        }
      }
    } else if (e.type === 'equip_spell' && e.spellId) {
      kit.equipSpellId = e.spellId;
      for (const g of e.grants ?? []) {
        if (g.kind === 'attack_power' && g.amount != null) kit.attackPower = g.amount;
      }
    } else if (e.type === 'totem' && e.amountPerSecOfSpeed != null && e.amountPerSecOfSpeed > 0) {
      kit.rockbiterAmount = e.amountPerSecOfSpeed;
    }
  }
  return (
    kit.attackPower != null
    || kit.equipSpellId != null
    || kit.combatSpellId != null
    || kit.damageFlat != null
    || kit.rockbiterAmount != null
    || kit.combat != null
    || kit.combatChancePct != null
    || kit.combatPpm != null
  )
    ? kit
    : undefined;
}

/** Build the on-hit combat payload combat/weapon.ts consumes from a combat-spell SpellDef. */
export function combatPayloadFromSpell(sp: {
  id: number;
  name: string;
  effects?: ReadonlyArray<{
    kind: string;
    school?: string;
    min?: number;
    max?: number;
    durationMs?: number;
    tickMs?: number;
    aura?: number;
    pct?: number;
    hostile?: boolean;
    /** string name (speed/cc) or numeric mechanic id (mechanic_immunity) */
    mechanic?: string | number;
    mod?: string;
    amount?: number;
  }>;
}): NonNullable<WeaponImbueKitFields['combat']> | undefined {
  let direct: { school: import('../../../data/schema.ts').School; min: number; max: number } | undefined;
  let dot: {
    school: import('../../../data/schema.ts').School;
    min: number;
    max: number;
    durationMs: number;
    tickMs: number;
  } | undefined;
  let speed: {
    aura: number;
    pct: number;
    durationMs: number;
    hostile?: boolean;
    mechanic?: string;
  } | undefined;
  const buffs: Array<{
    mod: string;
    amount: number;
    durationMs: number;
    hostile?: boolean;
  }> = [];
  for (const e of sp.effects ?? []) {
    if (e.kind === 'direct_damage' && e.school && e.min != null) {
      direct = {
        school: e.school as import('../../../data/schema.ts').School,
        min: e.min,
        max: e.max ?? e.min,
      };
    } else if (e.kind === 'dot' && e.school && e.min != null) {
      dot = {
        school: e.school as import('../../../data/schema.ts').School,
        min: e.min,
        max: e.max ?? e.min,
        durationMs: e.durationMs ?? 12_000,
        tickMs: e.tickMs ?? 3_000,
      };
    } else if (e.kind === 'speed' && e.pct != null) {
      // Frostbrand chill / Crippling Poison snare. Cite: aura 33; KI-581 / KI-717.
      const mech = typeof e.mechanic === 'string' ? e.mechanic : 'snare';
      speed = {
        aura: e.aura ?? 33,
        pct: e.pct,
        durationMs: e.durationMs ?? 12_000,
        ...(e.hostile != null ? { hostile: e.hostile } : { hostile: true }),
        mechanic: mech,
      };
    } else if (e.kind === 'buff' && e.mod && e.amount != null) {
      buffs.push({
        mod: e.mod,
        amount: e.amount,
        durationMs: e.durationMs ?? 10_000,
        ...(e.hostile != null ? { hostile: e.hostile } : { hostile: true }),
      });
    }
  }
  if (!direct && !dot && !speed && buffs.length === 0) return undefined;
  return {
    spellId: sp.id,
    name: sp.name,
    ...(direct ? { direct } : {}),
    ...(dot ? { dot } : {}),
    ...(speed ? { speed } : {}),
    ...(buffs.length ? { buffs } : {}),
  };
}

// Merge the offline kit onto a thin imbue, a no-op when it is already full or the enchant is unknown.
// Callers with enchantment data should follow with the item-enchant merge for poisons and oils.
export function applyWeaponImbueKit(imbue: WeaponImbueEffect): WeaponImbueEffect {
  // Always merge — fills missing combat.speed / direct on partial bake kits (Frostbrand
  // direct-only rows). mergeWeaponImbueKit only writes absent keys. Cite: KI-581.
  const kit = weaponImbueKitForEnchant(imbue.enchantId);
  if (!kit) return imbue;
  return mergeWeaponImbueKit(imbue, kit);
}

// Fill a thin (or chance-only) weapon_imbue from a SpellItemEnchantment row. Prefer this over the offline
// shaman table when the enchant is a poison / oil / stone. Mutates and returns the same object.
export function applyWeaponImbueKitFromItemEnchant(
  imbue: WeaponImbueEffect,
  ench: Parameters<typeof kitFromItemEnchant>[0] | null | undefined,
  spellLookup?: Parameters<typeof kitFromItemEnchant>[1],
): WeaponImbueEffect {
  if (!ench) return imbue;
  // Always try to fill missing fields — even when hasCombatKit is true for chance-only rows
  // we still want combatSpellId + combat.direct from the enchant / combat spell.
  const kit = kitFromItemEnchant(ench, spellLookup);
  if (!kit) return imbue;
  return mergeWeaponImbueKit(imbue, kit);
}

// Flametongue's on-hit fire damage from the stored coefficient and weapon speed. The spell-power term
// is omitted on the swing path, where there is no such context. Cite: SpellEffects.cpp:1484.
export function flametongueSwingDamage(damageCoeff: number, weaponSpeedSec: number): number {
  if (!(damageCoeff > 0) || !(weaponSpeedSec > 0)) return 0;
  const n = damageCoeff * 0.01 * weaponSpeedSec;
  return n < 0 ? Math.ceil(n) : Math.floor(n);
}
