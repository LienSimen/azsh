// Stage s18 special-case spell ids from the CMaNGOS Spells sources: pure rule helpers and
// dispositions, with the combat wiring in the owning layer. Cite: census-spell-opcodes.mjs.

import type { SpellDef } from '../../data/schema.ts';
import { durMs } from './interpreter/duration.ts';
import { SPELL_AURA_PERIODIC_HEALTH_FUNNEL } from './interpreter/opcodes.ts';

// ── Stage s18 spell ids ─────────────────────────────────────────────────────

// Bloodthirst rank-4 self-heal aura (payload of damage rank 23894). Already wired via
// bloodthirstSelfAuraSpellId in cmangos-special-cases.ts. Cite: Spell.cpp:1308 case 23894: BTAura = 23888.
export const BLOODTHIRST_AURA_RANK4_SPELL_ID = 23888;
/** Damage rank that applies aura 23888. Cite: Spell.cpp:1308. */
export const BLOODTHIRST_RANK4_SPELL_ID = 23894;
/** Heal payload for aura 23888. Cite: ClassicDB 23891 (EffectTriggerSpell on 23888). */
export const BLOODTHIRST_HEAL_RANK4_SPELL_ID = 23891;

// Axe Flurry (Gurubashi Axe Thrower dummy) → 24020 if LOS. Cite: SpellEffects.cpp:1080–1085 case 24019
// CastSpell(…, 24020).
export const AXE_FLURRY_SPELL_ID = 24019;
export const AXE_FLURRY_DAMAGE_SPELL_ID = 24020;

// Stinger Charge Primer (AQ40): aura 25187 → 25191 else 25190. Cite: SpellEffects.cpp:1087–1094 case 24150.
export const STINGER_CHARGE_PRIMER_SPELL_ID = 24150;
/** Hive'Zara Stinger Charge mark aura. Cite: SpellEffects.cpp:1089 HasAura(25187). */
export const STINGER_CHARGE_MARK_AURA_SPELL_ID = 25187;
export const STINGER_CHARGE_PROTECT_SPELL_ID = 25191;
export const STINGER_CHARGE_NORMAL_SPELL_ID = 25190;

// Uther's Tribute / Grom's Tribute — race → holiday buff. Cite: SpellEffects.cpp:3768–3801 cases
// 24194/24195.
export const UTHERS_TRIBUTE_SPELL_ID = 24194;
export const GROMS_TRIBUTE_SPELL_ID = 24195;
/** Classic race ids. Cite: SharedDefines.h RACE_*. */
export const RACE_HUMAN = 1;
export const RACE_ORC = 2;
export const RACE_DWARF = 3;
export const RACE_NIGHTELF = 4;
export const RACE_UNDEAD = 5;
export const RACE_TAUREN = 6;
export const RACE_GNOME = 7;
export const RACE_TROLL = 8;
/** Uther race → spell. Cite: SpellEffects.cpp:3779–3785. */
export const UTHERS_TRIBUTE_BY_RACE: Readonly<Record<number, number>> = Object.freeze({
  [RACE_HUMAN]: 24105,
  [RACE_DWARF]: 24107,
  [RACE_NIGHTELF]: 24108,
  [RACE_GNOME]: 24106,
});
/** Grom race → spell. Cite: SpellEffects.cpp:3788–3794. */
export const GROMS_TRIBUTE_BY_RACE: Readonly<Record<number, number>> = Object.freeze({
  [RACE_ORC]: 24104,
  [RACE_UNDEAD]: 24103,
  [RACE_TAUREN]: 24102,
  [RACE_TROLL]: 24101,
});

/** Poisonous Blood → CastSpell(24321) on unitTarget. Cite: SpellEffects.cpp:3804–3807 case 24320. */
export const POISONOUS_BLOOD_SPELL_ID = 24320;
export const POISONOUS_BLOOD_CLOUD_SPELL_ID = 24321;
/** boss_hakkar.cpp:35 SPELL_BLOOD_SIPHON; spell.sql spell_hakkar_blood_siphon. */
export const HAKKAR_BLOOD_SIPHON_SPELL_ID = 24324;
/** BloodSiphon without 24321. Cite: boss_hakkar.cpp:126. */
export const HAKKAR_BLOOD_SIPHON_FUNNEL_SPELL_ID = 24322;
/** BloodSiphon with Poisonous Blood 24321. Cite: boss_hakkar.cpp:126. */
export const HAKKAR_BLOOD_SIPHON_POISON_SPELL_ID = 24323;

// 24322 bakes `effects: []`. Fill PERIODIC_HEALTH_FUNNEL from rawEffects. Cite: SpellAuras.cpp:3285-3304;
// PeriodicTick :4606-4612; durationIndex 31 = 8s.
export function expandHakkarBloodSiphonFunnel(spell: SpellDef): SpellDef {
  if ((spell.id | 0) !== HAKKAR_BLOOD_SIPHON_FUNNEL_SPELL_ID) return spell;
  if (spell.effects.length > 0) return spell;
  const raw = (spell.rawEffects ?? []).find(
    (r) => (r.auraName | 0) === SPELL_AURA_PERIODIC_HEALTH_FUNNEL,
  );
  if (!raw) return spell;
  const durationMs = durMs(spell.durationIndex);
  if (durationMs == null || durationMs <= 0) return spell;
  const tickMs = (raw.amplitude | 0) > 0 ? (raw.amplitude | 0) : 1000;
  const amount = (raw.basePoints | 0) + ((raw.dieSides | 0) > 0 ? 1 : 0);
  const multiple = Number(raw.multipleValue);
  const leechMultiple = multiple > 0 ? multiple : 1;
  return {
    ...spell,
    effects: [{
      kind: 'dot',
      school: spell.school,
      min: amount,
      max: amount,
      durationMs,
      tickMs,
      leechMultiple,
      healthFunnel: true,
    }],
  };
}

// Brittle Armor SCRIPT_EFFECT: RemoveAuraHolderFromStack(24575). Cite: SpellEffects.cpp:3809–3810 case
// 24590.
export const BRITTLE_ARMOR_PEEL_SPELL_ID = 24590;
export const BRITTLE_ARMOR_STACK_SPELL_ID = 24575;

/** Hallow's End costume SCRIPT parents (gender morph). Cite: SpellEffects.cpp:3838–3915. */
export const PIRATE_COSTUME_SPELL_ID = 24717;
export const NINJA_COSTUME_SPELL_ID = 24718;
export const LEPER_GNOME_COSTUME_SPELL_ID = 24719;
export const RANDOM_COSTUME_SPELL_ID = 24720;
export const SKELETON_COSTUME_SPELL_ID = 24723;
export const BAT_COSTUME_SPELL_ID = 24732;
export const GHOST_COSTUME_SPELL_ID = 24737;
export const WISP_COSTUME_SPELL_ID = 24740;
/** Gender morph outcomes. Cite: SpellEffects.cpp:3844 / 3853 / 3862 / 3914. */
export const PIRATE_COSTUME_MALE_SPELL_ID = 24708;
export const PIRATE_COSTUME_FEMALE_SPELL_ID = 24709;
export const NINJA_COSTUME_MALE_SPELL_ID = 24711;
export const NINJA_COSTUME_FEMALE_SPELL_ID = 24710;
export const LEPER_GNOME_COSTUME_MALE_SPELL_ID = 24712;
export const LEPER_GNOME_COSTUME_FEMALE_SPELL_ID = 24713;
export const GHOST_COSTUME_MALE_SPELL_ID = 24735;
export const GHOST_COSTUME_FEMALE_SPELL_ID = 24736;

/** Dream Fog — creature AI threat retarget only. Cite: SpellEffects.cpp:1153–1163 case 24781. */
export const DREAM_FOG_SPELL_ID = 24781;

// Summon Demented Druid Spirit — cast by 24796 when target is player. Cite: SpellEffects.cpp:1096–1101 case
// 24796 CastSpell(…, 24795).
export const SUMMON_DEMENTED_DRUID_SPIRIT_SPELL_ID = 24795;
export const SUMMON_DEMENTED_DRUID_SPIRIT_PARENT_SPELL_ID = 24796;

// Despawn Shades of Taerar — ForcedDespawn entry 15302. Cite: SpellEffects.cpp:1166–1173 case 24886
// GetEntry()==15302.
export const DESPAWN_SHADES_OF_TAERAR_SPELL_ID = 24886;
export const SHADE_OF_TAERAR_ENTRY = 15302;

/** Hallow's End Trick dummy — urand of 13 morphs. Cite: SpellEffects.cpp:3812–3836 case 24714. */
export const HALLOWS_END_TRICK_SPELL_ID = 24714;
export const HALLOWS_END_TRICK_OUTCOMES = Object.freeze([
  24753, // cannot cast, random 30sec
  24713, // lepper gnome costume
  24735, // male ghost costume
  24736, // female ghostcostume
  24710, // male ninja costume
  24711, // female ninja costume
  24708, // male pirate costume
  24709, // female pirate costume
  24723, // skeleton costume
  24924, // Hallow's End Candy
  24925, // Hallow's End Candy
  24926, // Hallow's End Candy
  24927, // Hallow's End Candy
] as const);

export function pickHallowsEndTrickOutcome(roll01: number): number {
  return HALLOWS_END_TRICK_OUTCOMES[Math.min(12, Math.floor(roll01 * 13))]!;
}

/** Hallow's End Candy / Treat — urand of 4 morphs. Cite: SpellEffects.cpp:1176–1181 case 24930. */
export const HALLOWS_END_CANDY_SPELL_ID = 24930;
export const HALLOWS_END_CANDY_OUTCOMES = Object.freeze([
  24924, // Larger and Orange
  24925, // Skeleton
  24926, // Pirate
  24927, // Ghost
] as const);

/** Summon RC Tank SCRIPT → CastSpell(24934). Cite: SpellEffects.cpp:3937–3943 case 24935. */
export const SUMMON_RC_TANK_SPELL_ID = 24935;
export const SUMMON_RC_TANK_SUMMON_SPELL_ID = 24934;

// Defensive State 2 (DND) — CMaNGOS case is commented empty. Cite: UnitAuraProcHandler.cpp:1283 // case
// 24949: break;
export const DEFENSIVE_STATE_2_DND_SPELL_ID = 24949;

// Enveloping Winds — Six Demon Bag mid-band stun payload (also standalone). Cite: SpellEffects.cpp:534
// CastSpell(…, 25189); aura 12 stun.
export const ENVELOPING_WINDS_SPELL_ID = 25189;
/** DurationIndex 1 → 10s. Cite: FALLBACK_DURATION_MS[1]. */
export const ENVELOPING_WINDS_DURATION_MS = 10_000;

// Consume (AQ40) PERIODIC_TRIGGER zero: bpDamage = maxHealth * 10 / 100 → 25373. Cite:
// SpellAuras.cpp:1019–1023 case 25371.
export const CONSUME_SPELL_ID = 25371;
export const CONSUME_DAMAGE_SPELL_ID = 25373;
/** Percent of target max health per tick. Cite: SpellAuras.cpp:1021. */
export const CONSUME_MAX_HEALTH_PCT = 10;
/** DurationIndex 8 → 15s; amplitude 1000. Cite: spell_template 25371; FALLBACK_DURATION_MS[8]. */
export const CONSUME_DURATION_MS = 15_000;
export const CONSUME_TICK_MS = 1000;

// Drain Mana (Moam): OnCheckTarget requires POWER_MANA; SCRIPT casts 25671. Cite: Spell.cpp:8041–8046;
// SpellEffects.cpp:3951–3955 case 25676.
export const DRAIN_MANA_MOAM_SPELL_ID = 25676;
export const DRAIN_MANA_MOAM_TRIGGER_SPELL_ID = 25671;
/** Related mana-gate family. Cite: Spell.cpp:8041–8044. */
export const DRAIN_MANA_MANA_GATE_SPELL_IDS = Object.freeze([
  25676, 25754, 26457, 26559,
] as const);

// Reindeer Transformation: if mounted, remove mount + cast 25859 (100%) or 25858 (60%). Cite:
// SpellEffects.cpp:1184–1193 case 25860; speed rate >= 2.0f → 25859.
export const REINDEER_TRANSFORMATION_SPELL_ID = 25860;
export const REINDEER_100_SPELL_ID = 25859;
export const REINDEER_60_SPELL_ID = 25858;
/** Run speed rate gate (epic mount = 2.0). Cite: SpellEffects.cpp:1190. */
export const REINDEER_EPIC_SPEED_RATE = 2.0;

// ── Stage s18 id list (census floor + test gate) ────────────────────────────

export const STAGE_S18_SPELL_IDS: readonly number[] = Object.freeze([
  BLOODTHIRST_AURA_RANK4_SPELL_ID,
  AXE_FLURRY_SPELL_ID,
  STINGER_CHARGE_PRIMER_SPELL_ID,
  UTHERS_TRIBUTE_SPELL_ID,
  GROMS_TRIBUTE_SPELL_ID,
  POISONOUS_BLOOD_SPELL_ID,
  BRITTLE_ARMOR_PEEL_SPELL_ID,
  PIRATE_COSTUME_SPELL_ID,
  NINJA_COSTUME_SPELL_ID,
  LEPER_GNOME_COSTUME_SPELL_ID,
  RANDOM_COSTUME_SPELL_ID,
  SKELETON_COSTUME_SPELL_ID,
  BAT_COSTUME_SPELL_ID,
  GHOST_COSTUME_SPELL_ID,
  WISP_COSTUME_SPELL_ID,
  DREAM_FOG_SPELL_ID,
  SUMMON_DEMENTED_DRUID_SPIRIT_SPELL_ID,
  DESPAWN_SHADES_OF_TAERAR_SPELL_ID,
  HALLOWS_END_CANDY_SPELL_ID,
  SUMMON_RC_TANK_SPELL_ID,
  DEFENSIVE_STATE_2_DND_SPELL_ID,
  ENVELOPING_WINDS_SPELL_ID,
  CONSUME_SPELL_ID,
  DRAIN_MANA_MOAM_SPELL_ID,
  REINDEER_TRANSFORMATION_SPELL_ID,
]);

// Cited dispositions for Dimension-C ids that are pure world/RP/AI utility here. Combat-visible rules are
// implemented (not listed).
export const STAGE_S18_CPP_DISPOSITIONS = Object.freeze({
  [UTHERS_TRIBUTE_SPELL_ID]: {
    id: UTHERS_TRIBUTE_SPELL_ID,
    name: "Uther's Tribute",
    reason:
      'Holiday SCRIPT_EFFECT: Alliance race → self-buff (24105/24107/24108/24106). ' +
      'World/event reputation tribute, not a combat damage/CC rule. Race map is in helpers.',
    cite: 'SpellEffects.cpp:3768–3801 case 24194 race switch CastSpell(self)',
  },
  [GROMS_TRIBUTE_SPELL_ID]: {
    id: GROMS_TRIBUTE_SPELL_ID,
    name: "Grom's Tribute",
    reason:
      'Holiday SCRIPT_EFFECT: Horde race → self-buff (24104/24103/24102/24101). ' +
      'World/event tribute, not combat payload. Race map is in helpers.',
    cite: 'SpellEffects.cpp:3768–3801 case 24195 race switch CastSpell(self)',
  },
  [PIRATE_COSTUME_SPELL_ID]: {
    id: PIRATE_COSTUME_SPELL_ID,
    name: 'Pirate Costume',
    reason:
      'Hallow\'s End RP morph: gender → 24708/24709. Pure costume transform, no combat',
    cite: 'SpellEffects.cpp:3838–3845 case 24717 getGender male 24708 else 24709',
  },
  [NINJA_COSTUME_SPELL_ID]: {
    id: NINJA_COSTUME_SPELL_ID,
    name: 'Ninja Costume',
    reason:
      'Hallow\'s End RP morph: gender → 24711/24710. Pure costume transform, no combat',
    cite: 'SpellEffects.cpp:3847–3854 case 24718 getGender male 24711 else 24710',
  },
  [LEPER_GNOME_COSTUME_SPELL_ID]: {
    id: LEPER_GNOME_COSTUME_SPELL_ID,
    name: 'Leper Gnome Costume',
    reason:
      'Hallow\'s End RP morph: gender → 24712/24713. Pure costume transform, no combat',
    cite: 'SpellEffects.cpp:3856–3863 case 24719 getGender male 24712 else 24713',
  },
  [RANDOM_COSTUME_SPELL_ID]: {
    id: RANDOM_COSTUME_SPELL_ID,
    name: 'Random Costume',
    reason:
      'Hallow\'s End RP: urand(0,6) costume table (pirate/ninja/leper/skeleton/bat/ghost/wisp). No combat',
    cite: 'SpellEffects.cpp:3865–3898 case 24720 urand(0,6) costume switch',
  },
  [SKELETON_COSTUME_SPELL_ID]: {
    id: SKELETON_COSTUME_SPELL_ID,
    name: 'Skeleton Costume',
    reason:
      'No dedicated Spells/*.cpp case for casting 24723 - id is Random Costume / Trick outcome. ' +
      'Holiday TRANSFORM aura (generic materialize); no extra combat rewrite',
    cite: 'SpellEffects.cpp:3828 case 8 trickspell=24723; :3884 Random Costume case 3',
  },
  [BAT_COSTUME_SPELL_ID]: {
    id: BAT_COSTUME_SPELL_ID,
    name: 'Bat Costume',
    reason:
      'No dedicated Spells/*.cpp cast case - id is Random Costume outcome only. Holiday morph RP',
    cite: 'SpellEffects.cpp:3887 case 4 spellId=24732 Random Costume',
  },
  [GHOST_COSTUME_SPELL_ID]: {
    id: GHOST_COSTUME_SPELL_ID,
    name: 'Ghost Costume',
    reason:
      'Hallow\'s End RP morph: gender → 24735/24736. Pure costume transform, no combat',
    cite: 'SpellEffects.cpp:3908–3915 case 24737 getGender male 24735 else 24736',
  },
  [WISP_COSTUME_SPELL_ID]: {
    id: WISP_COSTUME_SPELL_ID,
    name: 'Wisp Costume',
    reason:
      'No dedicated Spells/*.cpp cast case - id is Random Costume outcome only. Holiday morph RP',
    cite: 'SpellEffects.cpp:3893 case 6 spellId=24740 Random Costume',
  },
  [DREAM_FOG_SPELL_ID]: {
    id: DREAM_FOG_SPELL_ID,
    name: 'Dream Fog',
    reason:
      'Creature-only AI: DeleteThreatList + AttackStop + AI()->AttackStart(unitTarget). ' +
      'No player combat payload; threat retarget is world-AI',
    cite: 'SpellEffects.cpp:1153–1163 case 24781 DeleteThreatList AttackStart',
  },
  [SUMMON_DEMENTED_DRUID_SPIRIT_SPELL_ID]: {
    id: SUMMON_DEMENTED_DRUID_SPIRIT_SPELL_ID,
    name: 'Summon Demented Druid Spirit',
    reason:
      'Boss/world summon payload: parent 24796 EffectDummy casts 24795 only when target is player. ' +
      'SUMMON_GUARDIAN generic; not a player combat rewrite',
    cite: 'SpellEffects.cpp:1096–1101 case 24796 TYPEID_PLAYER CastSpell(…, 24795)',
  },
  [DESPAWN_SHADES_OF_TAERAR_SPELL_ID]: {
    id: DESPAWN_SHADES_OF_TAERAR_SPELL_ID,
    name: 'Despawn Shades of Taerar',
    reason:
      'World/script: ForcedDespawn + RemoveFromWorld when target entry == 15302. Not player combat',
    cite: 'SpellEffects.cpp:1166–1173 case 24886 GetEntry()==15302 ForcedDespawn',
  },
  [SUMMON_RC_TANK_SPELL_ID]: {
    id: SUMMON_RC_TANK_SPELL_ID,
    name: 'Summon RC Tank',
    reason:
      'Darkmoon Faire toy: SCRIPT_EFFECT CastSpell(24934) RC tank summon. RP/toy, not combat',
    cite: 'SpellEffects.cpp:3937–3943 case 24935 CastSpell(…, 24934)',
  },
  [DEFENSIVE_STATE_2_DND_SPELL_ID]: {
    id: DEFENSIVE_STATE_2_DND_SPELL_ID,
    name: 'Defensive State 2 (DND)',
    reason:
      'Creature-internal PROC_TRIGGER_SPELL holder; CMaNGOS HandleProcTriggerSpell case is ' +
      'commented empty (no combat body). Same family as 5301/13358/16092',
    cite: 'UnitAuraProcHandler.cpp:1283 // case 24949: break; // Defensive State 2 (DND)',
  },
  [REINDEER_TRANSFORMATION_SPELL_ID]: {
    id: REINDEER_TRANSFORMATION_SPELL_ID,
    name: 'Reindeer Transformation',
    reason:
      'Holiday mount cosmetic: if SPELL_AURA_MOUNTED present, strip mount and cast 25859/25858 by ' +
      'run speed rate. World/RP mount transform, not combat damage/CC',
    cite: 'SpellEffects.cpp:1184–1193 case 25860 RemoveSpellsCausingAura MOUNTED CastSpell 25859|25858',
  },
} as const);

// ── Pure helpers ────────────────────────────────────────────────────────────

// Stinger Charge Primer payload from whether target has mark aura 25187. Cite: SpellEffects.cpp:1089–1092.
export function stingerChargePrimerSpellId(hasMarkAura25187: boolean): number {
  return hasMarkAura25187
    ? STINGER_CHARGE_PROTECT_SPELL_ID
    : STINGER_CHARGE_NORMAL_SPELL_ID;
}

// Uther's / Grom's Tribute race → buff spell id (0 if wrong faction race). Cite:
// SpellEffects.cpp:3777–3795.
function tributeBuffSpellId(tributeSpellId: number, raceId: number): number {
  const id = tributeSpellId | 0;
  const race = raceId | 0;
  if (id === UTHERS_TRIBUTE_SPELL_ID) return UTHERS_TRIBUTE_BY_RACE[race] ?? 0;
  if (id === GROMS_TRIBUTE_SPELL_ID) return GROMS_TRIBUTE_BY_RACE[race] ?? 0;
  return 0;
}

// Costume parent → gender morph spell id (0 if not a gender costume parent). Cite: SpellEffects.cpp:3844 /
// 3853 / 3862 / 3914.
function costumeGenderMorphSpellId(
  costumeSpellId: number,
  isMale: boolean,
): number {
  switch (costumeSpellId | 0) {
    case PIRATE_COSTUME_SPELL_ID:
      return isMale ? PIRATE_COSTUME_MALE_SPELL_ID : PIRATE_COSTUME_FEMALE_SPELL_ID;
    case NINJA_COSTUME_SPELL_ID:
      return isMale ? NINJA_COSTUME_MALE_SPELL_ID : NINJA_COSTUME_FEMALE_SPELL_ID;
    case LEPER_GNOME_COSTUME_SPELL_ID:
      return isMale ? LEPER_GNOME_COSTUME_MALE_SPELL_ID : LEPER_GNOME_COSTUME_FEMALE_SPELL_ID;
    case GHOST_COSTUME_SPELL_ID:
      return isMale ? GHOST_COSTUME_MALE_SPELL_ID : GHOST_COSTUME_FEMALE_SPELL_ID;
    default:
      return 0;
  }
}

/** Random Costume urand(0,6) table. Cite: SpellEffects.cpp:3872–3894. */
function pickRandomCostumeSpellId(roll0to6: number, isMale: boolean): number {
  switch (roll0to6 | 0) {
    case 0:
      return isMale ? PIRATE_COSTUME_MALE_SPELL_ID : PIRATE_COSTUME_FEMALE_SPELL_ID;
    case 1:
      return isMale ? NINJA_COSTUME_MALE_SPELL_ID : NINJA_COSTUME_FEMALE_SPELL_ID;
    case 2:
      return isMale ? LEPER_GNOME_COSTUME_MALE_SPELL_ID : LEPER_GNOME_COSTUME_FEMALE_SPELL_ID;
    case 3:
      return SKELETON_COSTUME_SPELL_ID;
    case 4:
      return BAT_COSTUME_SPELL_ID;
    case 5:
      return isMale ? GHOST_COSTUME_MALE_SPELL_ID : GHOST_COSTUME_FEMALE_SPELL_ID;
    case 6:
      return WISP_COSTUME_SPELL_ID;
    default:
      return 0;
  }
}

// Hallow's End Candy: equal pick of 4 outcomes. Cite: SpellEffects.cpp:1178–1179 spell_list[urand(0, 3)].
export function pickHallowsEndCandyOutcome(roll01: number): number {
  const i = Math.min(3, Math.floor(roll01 * 4));
  return HALLOWS_END_CANDY_OUTCOMES[i]!;
}

// Consume tick damage from target max health (10%). Cite: SpellAuras.cpp:1021 bpDamage =
// triggerTarget->GetMaxHealth() * 10 / 100.
export function consumeTickDamage(maxHealth: number): number {
  return Math.trunc(((maxHealth | 0) * CONSUME_MAX_HEALTH_PCT) / 100);
}

/** True when spell id is in the Drain Mana OnCheckTarget mana-power gate family. */
export function isDrainManaManaGate(spellId: number): boolean {
  return (DRAIN_MANA_MANA_GATE_SPELL_IDS as readonly number[]).includes(spellId | 0);
}

// Reindeer: epic mount rate (≥2.0) → 25859 else 25858. Cite: SpellEffects.cpp:1190 GetSpeedRate(MOVE_RUN)
// >= 2.0f.
export function reindeerTransformSpellId(runSpeedRate: number): number {
  return runSpeedRate >= REINDEER_EPIC_SPEED_RATE
    ? REINDEER_100_SPELL_ID
    : REINDEER_60_SPELL_ID;
}
