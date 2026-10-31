// Pure spell predicates (Wave 4 S25) — extracted from engine/combat.ts module head.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import { PROC_FLAG } from '../spells/procs.ts';
import { SPELL_DAMAGE_CLASS } from './mitigation.ts';
import { CAST_FLAG } from '../../domain/creature/creatureAi.ts';
import {
  passesTargetCreatureType,
  isAbilityIneffectiveOnTarget,
  type ImmunityState,
} from '../spells/immunity.ts';
import { roleOf, isSelfTargetedSpell, spellHeals } from './roles.ts';
import { isHostileSpeedEffect } from './speedAura.ts';
import { isNefarianClassCallSpell } from '../../domain/scriptdev/classFilter.ts';
import { hasAttr, hasAttrEx2, SPELL_ATTR, SPELL_ATTR_EX2, spellPiercesSchoolImmunity } from '../spells/spellAttributes.ts';

export { isSelfTargetedSpell } from './roles.ts';

function memoSpellFlag(fn: (s: SpellDef) => boolean): (s: SpellDef) => boolean {
  const m = new WeakMap<SpellDef, boolean>();
  return (s: SpellDef): boolean => {
    const hit = m.get(s);
    if (hit !== undefined) return hit;
    const v = fn(s);
    m.set(s, v);
    return v;
  };
}

// Divine Intervention: the parent cast is sanctuary plus a trigger and a self instakill, and the
// protect aura targets a PARTY member. Combat applies it to the friendly, never the foe.
export const DIVINE_INTERVENTION_IDS = new Set([19752, 19753, 19754]);
/** Cast shells that trigger the protect aura + self-sacrifice. */
export const DIVINE_INTERVENTION_CAST_IDS = new Set([19752, 19754]);
/** Protect aura applied to the party member (cannot act, full school immunity, ~3 min). */
export const DIVINE_INTERVENTION_PROTECT_ID = 19753;
/** Tooltip "3 min" → DurationIndex for the DI protect aura. */
export const DIVINE_INTERVENTION_MS = 180_000;

export function isDivineInterventionSpell(s: SpellDef): boolean {
  if (DIVINE_INTERVENTION_IDS.has(s.id | 0)) return true;
  return /^divine intervention$/i.test(s.name ?? '');
}

export function isDivineInterventionCast(s: SpellDef): boolean {
  return DIVINE_INTERVENTION_CAST_IDS.has(s.id | 0) || (isDivineInterventionSpell(s) && (s.id | 0) !== DIVINE_INTERVENTION_PROTECT_ID);
}

// Keep Divine Intervention a friendly buff role. Do not rewrite the parent cast when the raw row
// already carries its trigger and instakill — only a hostile stun-only shell is rewritten.
export function normalizeDivineIntervention(spell: SpellDef): SpellDef {
  if (!isDivineInterventionSpell(spell)) return spell;
  const id = spell.id | 0;
  // Protect aura: role buff; combat routes MOD_STUN to the protect target (not the foe).
  if (id === DIVINE_INTERVENTION_PROTECT_ID) {
    if (spell.role === 'buff') return spell;
    return { ...spell, role: 'buff' };
  }
  // Parent cast: preserve trigger_spell / sanctuary / instakill when present.
  const hasTrigger = spell.effects.some(
    (e) => e.kind === 'trigger_spell' && ((e.spellId | 0) === DIVINE_INTERVENTION_PROTECT_ID),
  );
  const hasInstakill = spell.effects.some((e) => e.kind === 'instakill');
  const hasImmunity = spell.effects.some((e) => e.kind === 'school_immunity' || e.kind === 'damage_immunity');
  if (hasTrigger || hasInstakill || hasImmunity) {
    if (spell.role === 'buff') return spell;
    return { ...spell, role: 'buff' };
  }
  // Hostile stun-only shell (legacy wrong mapping) → self immunity + pacify stand-in.
  const onlyHostileStun = spell.effects.length > 0
    && spell.effects.every((e) => e.kind === 'cc' && e.control === 'stun');
  if (!onlyHostileStun && spell.effects.length > 0) {
    if (spell.role === 'buff') return spell;
    return { ...spell, role: 'buff' };
  }
  return {
    ...spell,
    role: 'buff',
    effects: [
      { kind: 'school_immunity', schoolMask: 1, durationMs: DIVINE_INTERVENTION_MS, positive: true },
      { kind: 'school_immunity', schoolMask: 126, durationMs: DIVINE_INTERVENTION_MS, positive: true },
      { kind: 'pacify', durationMs: DIVINE_INTERVENTION_MS },
    ],
  };
}

// Ice Block: the bake historically read its stun as hostile CC and could omit the two school-immunity
// slots. In 1.12 all three auras target the CASTER — immunity plus a self lockout, not enemy CC.
export const ICE_BLOCK_IDS = new Set([11958]);
/** DurationIndex 1 → 10_000ms (same as Divine Shield rank-1 duration). */
export const ICE_BLOCK_MS = 10_000;

export function isIceBlockSpell(s: SpellDef): boolean {
  if (ICE_BLOCK_IDS.has(s.id)) return true;
  return /^ice block$/i.test(s.name ?? '');
}

// Ensure Ice Block is a beneficial self buff: the school immunities plus a cannot-act lockout. The
// lockout is silence and pacify, not an enemy stun with its own DR and debuff bar.
export function normalizeIceBlock(spell: SpellDef): SpellDef {
  if (!isIceBlockSpell(spell)) return spell;
  let dur = ICE_BLOCK_MS;
  for (const e of spell.effects) {
    if (
      (e.kind === 'cc' || e.kind === 'school_immunity' || e.kind === 'pacify')
      && (e.durationMs | 0) > 0
    ) {
      dur = e.durationMs | 0;
      break;
    }
  }
  const hasPhys = spell.effects.some((e) => e.kind === 'school_immunity' && e.schoolMask === 1);
  const hasMagic = spell.effects.some((e) => e.kind === 'school_immunity' && e.schoolMask === 126);
  const hasAllSchools = spell.effects.some(
    (e) => e.kind === 'school_immunity' && ((e.schoolMask | 0) & 127) === 127,
  );
  const hasPacify = spell.effects.some((e) => e.kind === 'pacify');
  const hasSilence = spell.effects.some(
    (e) => e.kind === 'cc' && e.control === 'silence',
  );
  const hasStunCc = spell.effects.some((e) => e.kind === 'cc' && e.control === 'stun');
  if (((hasPhys && hasMagic) || hasAllSchools) && hasPacify && hasSilence && !hasStunCc) {
    if (spell.role === 'buff') return spell;
    return { ...spell, role: 'buff' };
  }
  const effects: SpellDef['effects'] = [
    { kind: 'school_immunity', schoolMask: 1, durationMs: dur, positive: true },
    { kind: 'school_immunity', schoolMask: 126, durationMs: dur, positive: true },
    { kind: 'pacify', durationMs: dur },
    { kind: 'cc', control: 'silence', mechanic: 'silence', durationMs: dur, school: 'frost' },
  ];
  return { ...spell, role: 'buff', effects };
}

/** Take-side ProcFlags bits for aura-42 on-hit-taken (Lightning Shield uses damage_shield). */
export const PROC_FLAGS_TAKE_MELEE =
  PROC_FLAG.TAKE_MELEE_SWING
  | PROC_FLAG.TAKE_MELEE_ABILITY
  | PROC_FLAG.TAKE_ANY_DAMAGE;

// Any foe-directed effect, so the spell resolves against the hostile target and the target-side gates
// apply. Ice Block's self stun is not foe-directed and must not qualify.
const computeHostileSpellDef = (spell: SpellDef): boolean => {
  if (isIceBlockSpell(spell)) return false;
  // Empty-effects 100yd PBAoE (targetA 22 / targetB 15). Cite: Spell.cpp:8003-8040;
  // boss_nefarian.cpp:63-71; SpellTargetDefines.h:36,46 TARGET_LOCATION_CASTER_SRC + ENEMY_AOE.
  if (isNefarianClassCallSpell(spell.id | 0)) return true;
  // All EffectImplicitTargetA = TARGET_UNIT_CASTER — not foe-directed (Spread 17772/17774).
  // Cite: SpellTargetDefines.h TARGET_UNIT_CASTER=1; boss_jandice_barov.cpp:52-55,91; KI-1017.
  if (isSelfTargetedSpell(spell)) return false;
  // SPELL_ATTR_AURA_IS_DEBUFF (0x04000000) forces an apply-aura spell to be treated as negative/debuff
  // for positivity / school-immunity pierce checks (Unit.cpp IsImmuneToSpell / IsPositiveEffectMask path).
  if (hasAttr(spell, SPELL_ATTR.AURA_IS_DEBUFF)) return true;
  // Feign Death is a self CombatStop, not a foe-directed threat pulse.
  // Cite: Unit.cpp SetFeignDeath :10103 CombatStop; aura 66.
  if (spell.effects.some((e) => e.kind === 'feign_death')) return false;
  // A ranged channel holder bakes only a proc trigger on the parent, with no direct damage row, so it
  // used to miss this gate and companions cast it into their own face while standing down.
  if (
    (spell.rangeMax ?? 0) > 0
    && spell.effects.some((e) => e.kind === 'proc_trigger_spell')
    && !spell.effects.some((e) => e.kind === 'damage_shield' || e.kind === 'buff')
  ) {
    return true;
  }
  return spell.effects.some(
    (e) => e.kind === 'direct_damage' || e.kind === 'dot' || e.kind === 'persistent_area'
      || e.kind === 'cc' || e.kind === 'root'
      || e.kind === 'interrupt_cast' || e.kind === 'trigger_spell'
      // POWER_HAPPINESS (powerType 4) is pet mood (Dismiss Pet), not foe-directed mana drain.
      // Cite: SpellEffects.cpp:1750–1791; SharedDefines.h POWER_HAPPINESS=4.
      || (e.kind === 'power_drain' && (e.powerType | 0) !== 4)
      || e.kind === 'power_burn' || e.kind === 'health_leech'
      || e.kind === 'weapon_percent_damage'
      // SPELL_EFFECT_KNOCK_BACK (98) — foe push (Knock Away, Blast Wave, Geyser). Pure knock rows must stay
      // foe-directed for range / magnet / immunity gates. Cite: SpellEffects.cpp:5113–5121 EffectKnockBack.
      || e.kind === 'knock_back'
      // Threat pulses / taunt / threat-drop (Distracting Shot, Growl, Feint, Disengage).
      // mod_taunt = SPELL_AURA_MOD_TAUNT hold (Mocking Blow / Challenging Shout aura-only).
      || e.kind === 'threat' || e.kind === 'taunt' || e.kind === 'mod_taunt'
      || e.kind === 'modify_threat_pct'
      // A periodic mana leech bakes as restore_power with a negative per-tick amount. An explicit
      // hostile:false is a self maintain cost and is not foe-directed.
      || (e.kind === 'restore_power' && e.amountPerTick < 0 && e.hostile !== false)
      // A decrease-speed snare's ONLY effect is the speed aura, so without this it was not
      // foe-directed and the engine applied it to the CASTER — a hunter snared himself.
      || (e.kind === 'speed' && isHostileSpeedEffect(e))
      // SPELL_AURA_MOD_DETECT_RANGE (91) Mind Soothe / Soothe Animal — negative yards on enemy.
      // Cite: SpellAuras.cpp:152; Unit.cpp:11772; KI-796.
      || (e.kind === 'mod_detect_range' && (e.amount ?? 0) < 0)
      // 529 rows whose ONLY foe-directed effect is the enemy aura: Faerie Fire, Hunter's Mark,
      // every curse, Sunder/Expose Armor. Same test applySpell picks the hostile target with.
      || (e.kind === 'buff' && isHostileBuffEffect(e, e.amount)),
  );
};
export const isHostileSpellDef = memoSpellFlag(computeHostileSpellDef);

// Foe-landing effects applySpell dispatches through the late path. They are riders on the cast's one
// hit result, so a resisted cast must land none — the late branches carry no land roll of their own.
export const isFoeLandingLateEffect = (eff: SpellEffect): boolean => {
  if (eff.kind === 'speed') return isHostileSpeedEffect(eff);
  if (eff.kind === 'mod_detect_range') return (eff.amount ?? 0) < 0;
  return eff.kind === 'mod_stalked' || eff.kind === 'knock_back' || eff.kind === 'pull_towards';
};

// The range gate: foe-directed casts with a positive rangeMax. It includes weapon strikes, which are
// not hostile by effect kind but still resolve against the combat target.
export const spellNeedsRangeGate = (spell: SpellDef): boolean => {
  if (!((spell.rangeMax ?? 0) > 0)) return false;
  if (isHostileSpellDef(spell)) return true;
  if (spell.strikeBonus || spell.onNextSwing) return true;
  const r = spell.role;
  return r === 'strike' || r === 'shoot' || r === 'charge';
};

// Spell.cpp:6162 GetMinMaxRange(strict) returns {0, 100} for a next-melee-swing spell, so the ARM
// carries no range bound — the reach test belongs to the swing that later carries it.
export const NEXT_SWING_ARM_RANGE_YD = 100;
export const spellGateRangeMaxYd = (spell: SpellDef): number | undefined => (
  spell.onNextSwing ? NEXT_SWING_ARM_RANGE_YD : spell.rangeMax
);
export const spellGateRangeMinYd = (spell: SpellDef): number | undefined => (
  spell.onNextSwing ? 0 : spell.rangeMin
);

// SpellMgr.h:1418-1420 IsIgnoreLosSpellCast = rangeIndex==13 || IsIgnoreLosSpell
// SpellMgr.h:1415 IsIgnoreLosSpell returns HasAttribute(SPELL_ATTR_EX2_IGNORE_LINE_OF_SIGHT)
export const isIgnoreLosSpellCast = (spell: SpellDef): boolean => {
  return spell.rangeIndex === 13 || hasAttrEx2(spell, SPELL_ATTR_EX2.IGNORE_LINE_OF_SIGHT);
};

// CheckCast unit-target LOS. Shoot/Auto Shot/Throw bake empty effects so isHostileSpellDef is
// false; spellFoeDirectedGeometry still matches them (opaque + role shoot). Cite: Spell.cpp:4742.
export const spellNeedsLosGate = (spell: SpellDef): boolean => {
  if (isIgnoreLosSpellCast(spell)) return false;
  return (isHostileSpellDef(spell) && spellNeedsRangeGate(spell)) || spellFoeDirectedGeometry(spell);
};

// The same CheckCast gate for a cast aimed at ONE chosen ally. A party FAN is excluded, since its
// audience is enumerated per body rather than chosen. Cite: Spell.cpp:4742 (no friendly exemption).
/**
 * The spell must be delivered to a FRIENDLY body: not self-only, not hostile, not a fan, and it
 * has a range, so it names another unit. In 1.12 a positive spell whose target the caster cannot
 * assist is refused outright, never landed for nothing. Cite: Spell.cpp:5947-5951 IsPositiveSpell
 * -> CanAssistSpell -> SPELL_FAILED_BAD_TARGETS.
 */
export const spellWantsFriendlyTarget = (spell: SpellDef): boolean => {
  if (isSelfTargetedSpell(spell) || isHostileSpellDef(spell) || spell.aoe) return false;
  // A DISPEL is legal on either faction - Tranquilizing Shot, Purge and an offensive Dispel Magic
  // strip an enemy. `EffectDispel` takes whatever `unitTarget` the caster aimed at and checks no
  // faction; only `IsDispellableByMask(dispelMask, m_caster, m_spellInfo)` inside it does.
  // Cite: SpellEffects.cpp:2467 EffectDispel.
  if ((spell.effects ?? []).some((e) => e.kind === 'dispel')) return false;
  return (spell.rangeMax ?? 0) > 0;
};

export const spellNeedsFriendlyLosGate = (spell: SpellDef): boolean => {
  if (isIgnoreLosSpellCast(spell)) return false;
  return spellWantsFriendlyTarget(spell) && spellHeals(spell);
};

// Self-centred or dest-at-caster AoE — Frost Nova, Arcane Explosion, War Stomp, Psychic Scream. These
// need no living focus, since they fan the hostiles around the caster.
export const isSelfCenteredAoe = (spell: SpellDef): boolean =>
  !!spell.aoe && !((spell.rangeMax ?? 0) > 0);

// Caster-origin hostile AoE (rangeMax 0 disc, or cone). Tail Sweep 15847 is a cone with rangeMax 30 so
// isSelfCenteredAoe is false; C++ DoCast(nullptr). Cite: boss_onyxia.cpp:162-163.
export const isCasterOriginAoe = (spell: SpellDef): boolean =>
  isSelfCenteredAoe(spell) || (!!spell.aoe && spell.aoeShape === 'cone');

// Offensive kit aimed at the current foe. A weapon strike with empty effects is not hostile by effect
// kind but still resolves against the target, which is how a Heroic Strike meets a protection blessing.
export const isFoeDirectedOffense = memoSpellFlag((spell: SpellDef): boolean => {
  if (isSelfCenteredAoe(spell)) return false;
  if (isHostileSpellDef(spell)) return true;
  if (spell.strikeBonus || spell.onNextSwing) return true;
  const r = roleOf(spell);
  return r === 'strike' || r === 'nuke' || r === 'instant_nuke' || r === 'dot'
    || r === 'shoot' || r === 'charge' || r === 'judgement';
});

// The auto-rotation skip: the focus will be immune to this ability. Unit-targeted offense always, and
// a self-AoE only in 1v1 — a pack nova can still hit somebody else.
export const focusImmunityBlocksSpell = (
  spell: SpellDef,
  focus: {
    immunity: ImmunityState;
    spec: { schoolImmuneMask?: number; mechanicImmuneMask?: number; creatureType?: number };
    creatureType?: number;
  },
  livingHostiles: number,
): boolean => {
  const template = {
    schoolImmuneMask: focus.spec.schoolImmuneMask,
    mechanicImmuneMask: focus.spec.mechanicImmuneMask,
    creatureType: focus.spec.creatureType ?? focus.creatureType,
  };
  // CheckCast is the gate the 156 pierce carriers actually meet first: without this a warded
  // target refuses the cast outright and applySpell never runs. Cite: SpellMgr.h:1304.
  if (!isAbilityIneffectiveOnTarget(
    focus.immunity, spell, template, spellPiercesSchoolImmunity(spell),
  )) return false;
  if (isFoeDirectedOffense(spell)) return true;
  return isSelfCenteredAoe(spell) && isHostileSpellDef(spell) && livingHostiles <= 1;
};

// Foe-directed casts the effect-based test cannot see: engine-scripted specials with empty resolved
// effects, and the scripted kinds. A raw shape test only, so friendly opaque rows match it too.
export const spellFoeDirectedOpaque = (spell: SpellDef): boolean => {
  if (!((spell.rangeMax ?? 0) > 0)) return false;
  if ((spell.effects?.length ?? 0) === 0) return true;
  return spell.effects.some((e) => e.kind === 'judgement' || e.kind === 'holy_shock');
};

// The geometry gate for foe-directed casts the range test misses. Judgement and Holy Shock matched
// NOTHING — no range limit and no line of sight — so they landed across 490 yd and through walls.
export const spellFoeDirectedGeometry = (spell: SpellDef): boolean => {
  if (!spellFoeDirectedOpaque(spell)) return false;
  if (isHostileSpellDef(spell)) return true;
  const r = roleOf(spell);
  return r === 'nuke' || r === 'instant_nuke' || r === 'dot' || r === 'shoot'
    || r === 'strike' || r === 'charge' || r === 'judgement';
};

// The Classic total target cap, including the primary: the baked maxTargets, else the largest chain
// count across the fanned effects. Null is uncapped, and a default is never invented.
export const aoeTotalTargetCap = (spell: SpellDef): number | null => {
  if (spell.maxTargets != null && spell.maxTargets > 0) return spell.maxTargets;
  let chain = 0;
  if (spell.rawEffects) {
    for (const re of spell.rawEffects) {
      if (re.chainTargets > chain) chain = re.chainTargets;
    }
  }
  if (chain > 0) return chain;
  return null;
};

// The on-next-swing fan cap, the Cleave shape: an explicit cap when baked, else 2 for an aoe row with
// none. Null means no fan at all, which is Heroic Strike.
export const nextSwingFanCap = (spell: SpellDef): number | null => {
  if (spell.maxTargets != null && spell.maxTargets > 1) return spell.maxTargets;
  if (spell.aoe) {
    const cap = aoeTotalTargetCap(spell);
    // aoe next-swing without baked cap → Classic Cleave total 2 (primary + 1).
    return cap ?? 2;
  }
  let chain = 0;
  if (spell.rawEffects) {
    for (const re of spell.rawEffects) {
      if (re.chainTargets > chain) chain = re.chainTargets;
    }
  }
  if (chain > 1) return chain;
  return null;
};

// The radius used when fanning an on-next-swing strike. Cleave bakes a chain count but often no
// radius, so without a yard gate a geometry session hit any living secondary on the side.
export const nextSwingFanRadiusYd = (spell: SpellDef, meleeReachYd = 5): number => {
  if (spell.radiusYd != null && spell.radiusYd > 0) return spell.radiusYd;
  if (spell.rangeMax != null && spell.rangeMax > 0) return spell.rangeMax;
  return meleeReachYd;
};

// The minimum yards for a unit's ranged auto, from the highest positive minimum among its shoot-role
// spells. Memoized per kit array: the scan ran from the motion phase and cost 2.6% of a tick.
const shootMinByKit = new WeakMap<readonly SpellDef[], { len: number; min: number }>();
export const rangedAutoMinYards = (f: {
  spec: { spells?: readonly SpellDef[]; ranged?: unknown; rangedWeaponSubclass?: number };
}): number => {
  const spells = f.spec.spells;
  let min = 0;
  if (spells) {
    const hit = shootMinByKit.get(spells);
    if (hit !== undefined && hit.len === spells.length) {
      min = hit.min;
    } else {
      for (const s of spells) {
        if (s.role !== 'shoot') continue;
        const rm = s.rangeMin ?? 0;
        if (rm > min) min = rm;
      }
      shootMinByKit.set(spells, { len: spells.length, min });
    }
  }
  if (min > 0) return min;
  // Wand Shoot has NO min range (SpellRange 5019 min 0) — the invented floor below gave
  // every wand caster a phantom dead zone and a permanent 1v1 backpedal (motion soft-kite).
  if (f.spec.rangedWeaponSubclass === 19) return 0; // ITEM_SUBCLASS_WEAPON_WAND
  // Equipped bow/gun/throw without stamped min — Classic dead zone floor.
  if (f.spec.ranged) return 5;
  return 0;
};

/** Deterministic side id order: enemy < enemy_1 < …; ally_0 < ally_1; player/pet/others by name. */
export const sideIdSortKey = (side: string): string => {
  if (side === 'enemy') return 'enemy_0';
  if (side === 'player') return '0_player';
  if (side === 'pet') return '0_pet';
  return side;
};

// CheckTargetCreatureType — the whole-spell valid-target gate driven by the baked type mask, so Scare
// Beast wants a beast and Banish a demon. An absent or zero mask is unrestricted.
export const spellTargetTypeAllowed = (spell: SpellDef, creatureType: number): boolean => {
  return passesTargetCreatureType(spell.targetCreatureTypeMask ?? 0, creatureType);
};

// Warlock Drain Soul rank 1, the trainer-taught id, kept for autopilot farm suppression rather than
// shard membership — that reads the baked grant flag. Do not use the reqLevel-1 twin.
export const DRAIN_SOUL_ID = 1120;

// True when a spell grants a Soul Shard on kill (Wave D `grantsSoulShardOnKill`). Prefer the baked flag;
// name fallback only for twin Drain Soul ids that may lack the flag.
export const isDrainSoulSpell = (
  spell: { grantsSoulShardOnKill?: boolean; name?: string } | null | undefined,
): boolean => {
  if (!spell) return false;
  if (spell.grantsSoulShardOnKill === true) return true;
  // Twin bake ids (7662 family) historically lacked EffectItemType → flag; name is last resort.
  return spell.name === 'Drain Soul';
};


// Talent and gear proc payloads that bake as free castables and must never be player-cast: a pure
// combo-point grant and a pure free energize. Real builders cost energy or rage and a GCD.
export function isNonCastableTalentProc(spell: SpellDef): boolean {
  if (spell.passive) return true;
  if ((spell.cost ?? 0) > 0 || spell.costPct) return false;
  if (((spell.cooldownMs ?? 0) | 0) > 0 || spell.requiresStealth) return false;
  if (((spell.gcdMs ?? 0) | 0) > 0 || ((spell.castTimeMs ?? 0) | 0) > 0) return false;
  if (spell.effects.length === 0) return false;
  // Free CP grant (Ruthlessness companion) — not a builder/finisher.
  if (
    (spell.comboPointsGenerated ?? 0) > 0
    && !spell.requiresComboPoints
    && spell.effects.every((e) => e.kind === 'combo_points')
  ) {
    return true;
  }
  // Free pure energize (Relentless Strikes Effect / Unbridled Wrath / set-bonus payloads).
  return spell.effects.every((e) => e.kind === 'energize');
}

// Whether a buff effect applies to the spell's hostile target rather than the caster. Prefer the baked
// hostile flag from the implicit target; a negative amount is the legacy fallback.
export function isHostileBuffEffect(
  eff: { hostile?: boolean; amount?: number },
  amount: number,
): boolean {
  if (eff.hostile === true) return true;
  if (eff.hostile === false) return false;
  return amount < 0;
}

// A periodic damage that sits on the CASTER, like Hellfire's self cost. Prefer the resolved flag, and
// fall back to the raw rows when every periodic slot names the caster.
export function isSelfTargetedDot(
  spell: SpellDef,
  eff: { kind?: string; hostile?: boolean },
): boolean {
  if (eff.kind != null && eff.kind !== 'dot') return false;
  if (eff.hostile === false) return true;
  if (eff.hostile === true) return false;
  const rows = spell.rawEffects?.filter((r) => (r.auraName | 0) === 3) ?? [];
  if (rows.length === 0) return false;
  return rows.every((r) => (r.targetA | 0) === 1);
}

// Whether a gear-proc apply spell should target the hit foe rather than the wielder: damage, DoTs and
// CC, plus a hostile aura. A beneficial self proc stays on the attacker.
export function gearProcIsOffensive(spell: SpellDef): boolean {
  return spell.effects.some((e) => {
    if (e.kind === 'direct_damage' || e.kind === 'dot' || e.kind === 'cc') return true;
    if (e.kind === 'buff') return isHostileBuffEffect(e, e.amount);
    return false;
  });
}

// A ranged auto attack — free, instant and off the GCD. Multi-Shot and Aimed Shot also bake the
// shoot role but cost mana and take a GCD, so they are real casts and not autos.
export function isRangedAutoSpell(spell: SpellDef): boolean {
  if (roleOf(spell) !== 'shoot') return false;
  if ((spell.cost ?? 0) > 0) return false;
  if ((spell.castTimeMs ?? 0) > 0) return false;
  if ((spell.gcdMs ?? 0) > 0) return false;
  return true;
}

// A pure auto-repeat toggle — Auto Shot and Shoot (wands). Throw is a ranged auto but NOT auto-repeat.
export function isRangedAutoRepeatToggle(spell: SpellDef): boolean {
  if (roleOf(spell) !== 'shoot') return false;
  return hasAttr(spell, SPELL_ATTR.USES_RANGED_SLOT) && hasAttrEx2(spell, SPELL_ATTR_EX2.AUTO_REPEAT);
}

// Auto Shot 75 / Shoot 5019 / Throw 2764 — the kit toggle whose SpellEntry.speed the white
// ranged swing uses for missile travel. Cite: Spell.cpp GetSpellSpeed; IsAutoRepeatRangedSpell.
const AUTO_SHOT_ID = 75;
const WAND_SHOOT_ID = 5019;
const THROW_ID = 2764;

export function rangedAutoSpellOf(f: { spec: { spells?: readonly SpellDef[]; rangedWeaponSubclass?: number } }): SpellDef | null {
  const sub = f.spec.rangedWeaponSubclass;
  const prefer = sub === 19 ? WAND_SHOOT_ID : sub === 16 ? THROW_ID : AUTO_SHOT_ID;
  let fallback: SpellDef | null = null;
  for (const s of f.spec.spells ?? []) {
    if (!isRangedAutoSpell(s)) continue;
    if (s.id === prefer) return s;
    if (!fallback) fallback = s;
  }
  return fallback;
}

// A creature's ranged auto: physical direct damage at ranged damage class with no cast time. It must
// not stack with a white melee swing in the same window.
export function isCreatureRangedAuto(spell: SpellDef): boolean {
  if (isRangedAutoSpell(spell)) return true;
  // Paid/cast-time shoot-role shots (Multi/Aimed) are abilities, not creature auto.
  if ((spell.dmgClass ?? -1) === SPELL_DAMAGE_CLASS.RANGED) return true;
  if ((spell.castTimeMs ?? 0) > 0) return false;
  // Instant physical direct damage with 5+ yard range is typically NPC Shoot.
  const hasPhysDirect = spell.effects.some(
    (e) => e.kind === 'direct_damage' && e.school === 'physical',
  );
  return hasPhysDirect && (spell.rangeMax ?? 0) >= 5 && (spell.gcdMs ?? 0) === 0;
}

/** MAIN_SPELL flag or Shoot-like filler — exclusive with white melee that window. */
export function isCreatureRangedMainAttack(spell: SpellDef, castFlags: number): boolean {
  if ((castFlags & CAST_FLAG.MAIN_SPELL) !== 0) return true;
  return isCreatureRangedAuto(spell);
}

// Same-side multi-unit constants + chain fan re-exports (createSession stays under ceiling).
export { applyFriendlyFan, wantsFriendlyFan, isFriendlyFannedEffect, FRIENDLY_MULTI_TARGETS } from './friendlyFan.ts';
export { wantsChainFan, applyChainFan, chainJumpMultiplier } from './chainFan.ts';
