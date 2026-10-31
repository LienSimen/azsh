// The six spell attribute words as named bits, plus the predicates that read them. One table, so no
// package re-guesses a bit. Absent means 0, since the bake omits a zero.

/** SpellDefines.h:30-61 `enum SpellAttributes` — SpellEntry.Attributes. */
export const SPELL_ATTR = {
  PROC_FAILURE_BURNS_CHARGE: 0x00000001,
  USES_RANGED_SLOT: 0x00000002,
  ON_NEXT_SWING_NO_DAMAGE: 0x00000004,
  IS_ABILITY: 0x00000010,
  ON_NEXT_SWING: 0x00000400,
  NOT_SHAPESHIFT: 0x00010000,
  CANCELS_AUTO_ATTACK_COMBAT: 0x00100000,
  IS_TRADESKILL: 0x00000020,
  PASSIVE: 0x00000040,
  /** SpellDefines.h:37 — hidden from spellbook/aura icon. Form-gated halves ride this, not PASSIVE. */
  DO_NOT_DISPLAY: 0x00000080,
  ONLY_INDOORS: 0x00004000,
  ONLY_OUTDOORS: 0x00008000,
  SCALES_WITH_CREATURE_LEVEL: 0x00080000,
  NO_ACTIVE_DEFENSE: 0x00200000,
  ALLOW_WHILE_MOUNTED: 0x01000000,
  ALLOW_WHILE_SITTING: 0x08000000,
  ALLOW_CAST_WHILE_DEAD: 0x00800000,
  NOT_IN_COMBAT_ONLY_PEACEFUL: 0x10000000,
  NO_IMMUNITIES: 0x20000000,
  HELD_ITEM_ONLY: 0x00000200,
  HEARTBEAT_RESIST: 0x40000000,
  /** Cooldown starts when the aura fades or the summon dies, not at cast. */
  COOLDOWN_ON_EVENT: 0x02000000,
  AURA_IS_DEBUFF: 0x04000000,
  NO_AURA_CANCEL: 0x80000000,
} as const;

/** SpellDefines.h:64-95 `enum SpellAttributesEx` — SpellEntry.AttributesEx. */
export const SPELL_ATTR_EX = {
  DISMISS_PET_FIRST: 0x00000001,
  IS_CHANNELED: 0x00000004,
  IS_SELF_CHANNELED: 0x00000040,
  TOGGLE_FARSIGHT: 0x00002000,
  /** SpellDefines.h:80 */
  TRACK_TARGET_IN_CHANNEL: 0x00004000,
  USE_ALL_MANA: 0x00000002,
  NO_REDIRECTION: 0x00000008,
  ALLOW_WHILE_STEALTHED: 0x00000020,
  /** Cyclone/Banish family: pierces school immunity unless the aura's mechanic is shield/invuln/banish. */
  IMMUNITY_TO_HOSTILE_AND_FRIENDLY_EFFECTS: 0x00010000,
  NO_REFLECTION: 0x00000080,
  ONLY_PEACEFUL_TARGETS: 0x00000100,
  NO_THREAT: 0x00000400,
  /** SpellDefines.h:86 */
  FINISHING_MOVE_DAMAGE: 0x00100000,
  THREAT_ONLY_ON_MISS: 0x00200000,
  AURA_UNIQUE: 0x00000800,
  FAILURE_BREAKS_STEALTH: 0x00001000,
  NO_AUTOCAST_AI: 0x00020000,
  REQUIRE_ALL_TARGETS: 0x04000000,
  IMMUNITY_PURGES_EFFECT: 0x00008000,
  EXCLUDE_CASTER: 0x00080000,
  DISCOUNT_POWER_ON_MISS: 0x08000000,
  /** Word 1 bit 28. HandleCancelAuraOpcode returns before the holder lookup. */
  NO_AURA_ICON: 0x10000000,
  /** SpellDefines.h:97 */
  CAST_WHEN_LEARNED: 0x80000000,
} as const;

/** SpellDefines.h:98-132 `enum SpellAttributesEx2` — SpellEntry.AttributesEx2. */
export const SPELL_ATTR_EX2 = {
  ALLOW_DEAD_TARGET: 0x00000001,
  /** SpellDefines.h:103 */
  NO_SHAPESHIFT_UI: 0x00000002,
  IGNORE_LINE_OF_SIGHT: 0x00000004,
  USE_SHAPESHIFT_BAR: 0x00000010,
  AUTO_REPEAT: 0x00000020,
  ALLOW_WHILE_INVISIBLE: 0x00004000,
  CANNOT_CAST_ON_TAPPED: 0x00000040,
  DO_NOT_REPORT_SPELL_FAILURE: 0x00000080,
  SPECIAL_TAMING_FLAG: 0x00000400,
  NO_TARGET_PER_SECOND_COSTS: 0x00000800,
  CHAIN_FROM_CASTER: 0x00001000,
  ENCHANT_OWN_ITEM_ONLY: 0x00002000,
  NO_ACTIVE_PETS: 0x00010000,
  DO_NOT_RESET_COMBAT_TIMERS: 0x00020000,
  ALLOW_WHILE_NOT_SHAPESHIFTED: 0x00080000,
  NO_INITIAL_THREAT: 0x00400000,
  PROC_COOLDOWN_ON_FAILURE: 0x00800000,
  DONT_BLOCK_MANA_REGEN: 0x02000000,
  NO_SCHOOL_IMMUNITIES: 0x04000000,
  NOT_AN_ACTION: 0x10000000,
  CANT_CRIT: 0x20000000,
} as const;

/** SpellDefines.h:135-167 `enum SpellAttributesEx3` — SpellEntry.AttributesEx3. */
export const SPELL_ATTR_EX3 = {
  PVP_ENABLING: 0x00000001,
  TREAT_AS_PERIODIC: 0x02000000,
  COMPLETELY_BLOCKED: 0x00000008,
  NO_AVOIDANCE: 0x00000040,
  DOT_STACKING_RULE: 0x00000080,
  ONLY_ON_PLAYER: 0x00000100,
  NOT_A_PROC: 0x00000200,
  REQUIRES_MAIN_HAND_WEAPON: 0x00000400,
  ONLY_BATTLEGROUNDS: 0x00000800,
  ONLY_PROC_ON_CASTER: 0x08000000,
  ONLY_PROC_OUTDOORS: 0x00200000,
  NORMAL_RANGED_ATTACK: 0x00008000,
  SUPPRESS_CASTER_PROCS: 0x00010000,
  SUPPRESS_TARGET_PROCS: 0x00020000,
  ALWAYS_HIT: 0x00040000,
  ALLOW_AURA_WHILE_DEAD: 0x00100000,
  CASTING_CANCELS_AUTOREPEAT: 0x00400000,
  IGNORE_CASTER_AND_TARGET_RESTRICTIONS: 0x10000000,
  CAN_PROC_FROM_PROCS: 0x04000000,
  IGNORE_CASTER_MODIFIERS: 0x20000000,
} as const;

/** SpellDefines.h:169-182 `enum SpellAttributesEx4` — SpellEntry.AttributesEx4. */
export const SPELL_ATTR_EX4 = {
  CLASS_TRIGGER_ONLY_ON_TARGET: 0x00000002,
  AURA_EXPIRES_OFFLINE: 0x00000004,
  NO_HELPFUL_THREAT: 0x00000008,
  NO_HARMFUL_THREAT: 0x00000010,
  IGNORE_DAMAGE_TAKEN_MODIFIERS: 0x00000100,
  COMBAT_FEEDBACK_WHEN_USABLE: 0x00000200,
  NO_PARTIAL_IMMUNITY: 0x00000800,
  ALLOW_CAST_WHILE_CASTING: 0x00000080,
} as const;

// The serverside attribute word: CMaNGOS's own, altered onto the table and filled from its fixes file,
// so no DBC carries it. 72 rows — ignore-evade on 56 and facing-back on 16.
export const SPELL_ATTR_SS = {
  PREVENT_INVIS: 0x00000001,
  AOE_CAP: 0x00000002,
  IGNORE_EVADE: 0x00000004,
  /** Second, independent behind clause — `requiresBehind` folds it in at bake. */
  FACING_BACK: 0x00000008,
} as const;

/** The word a flag lives in, so a caller cannot read a bit out of the wrong column. */
type AttrWord =
  | 'attributes'
  | 'attributesEx'
  | 'attributesEx2'
  | 'attributesEx3'
  | 'attributesEx4'
  | 'attributesServerside';

/** Any spell-shaped object carrying the raw words. Absent word = 0. */
export interface SpellAttrFields {
  attributes?: number;
  attributesEx?: number;
  attributesEx2?: number;
  attributesEx3?: number;
  attributesEx4?: number;
  attributesServerside?: number;
}

function hasBit(spell: SpellAttrFields | null | undefined, word: AttrWord, bit: number): boolean {
  if (!spell) return false;
  return ((spell[word] ?? 0) & bit) !== 0;
}

export const hasAttr = (s: SpellAttrFields | null | undefined, bit: number): boolean =>
  hasBit(s, 'attributes', bit);
export const hasAttrEx = (s: SpellAttrFields | null | undefined, bit: number): boolean =>
  hasBit(s, 'attributesEx', bit);
export const hasAttrEx2 = (s: SpellAttrFields | null | undefined, bit: number): boolean =>
  hasBit(s, 'attributesEx2', bit);
export const hasAttrEx3 = (s: SpellAttrFields | null | undefined, bit: number): boolean =>
  hasBit(s, 'attributesEx3', bit);
export const hasAttrEx4 = (s: SpellAttrFields | null | undefined, bit: number): boolean =>
  hasBit(s, 'attributesEx4', bit);
export const hasAttrSs = (s: SpellAttrFields | null | undefined, bit: number): boolean =>
  hasBit(s, 'attributesServerside', bit);

// SpellMgr.h:1304 CanPierceImmuneAura ORs both bits into one branch, so callers ask one question.
// 156 of 22374 rows carry either: Banish, Faerie Fire, Taunt, Challenging Shout, Death Touch.
export const spellPiercesSchoolImmunity = (s: SpellAttrFields | null | undefined): boolean =>
  hasAttrEx(s, SPELL_ATTR_EX.IMMUNITY_TO_HOSTILE_AND_FRIENDLY_EFFECTS)
  || hasAttrEx2(s, SPELL_ATTR_EX2.NO_SCHOOL_IMMUNITIES);

// The outdoors and indoors cast gates. The core asks about the CASTER's own position, so this is a
// per-pull question: 159 spells are outdoors-only and none are indoors-only. Unknown counts as outdoors.
export function spellAllowedAtLocation(
  spell: SpellAttrFields | null | undefined,
  outdoors: boolean,
  battlegroundMap: boolean = false,
): boolean {
  if (!outdoors && hasAttr(spell, SPELL_ATTR.ONLY_OUTDOORS)) return false;
  if (outdoors && hasAttr(spell, SPELL_ATTR.ONLY_INDOORS)) return false;

  // SpellMgr.cpp:2306 at de8f72993b9e1faa1bf92dd5505f3daec5cea3ce
  // if (spellInfo->HasAttribute(SPELL_ATTR_EX3_ONLY_BATTLEGROUNDS))
  //     if (!player || !player->InBattleGround())
  //         return SPELL_FAILED_ONLY_BATTLEGROUNDS;
  if (hasAttrEx3(spell, SPELL_ATTR_EX3.ONLY_BATTLEGROUNDS) && !battlegroundMap) return false;

  return true;
}

// DISCOUNT_POWER_ON_MISS: a miss, dodge, parry or deflect hands back 80% of the cost, while a block,
// resist or immune hands back nothing. Truncated as the C++ does. Cite: Spell.cpp:3647-3663.
export function powerRefundOnMiss(
  spell: SpellAttrFields | null | undefined,
  powerCost: number,
  outcome: string,
): number {
  if (!hasAttrEx(spell, SPELL_ATTR_EX.DISCOUNT_POWER_ON_MISS)) return 0;
  if (outcome !== 'miss' && outcome !== 'dodge' && outcome !== 'parry' && outcome !== 'deflect') return 0;
  if (!(powerCost > 0)) return 0;
  return Math.trunc(powerCost * 0.8);
}

// The effect ids whose amount can crit: school damage, heal, the three weapon forms and the normalized
// one. Cite: SpellMgr.h:307-325 IsSpellEffectAbleToCrit.
const CRITTABLE_EFFECTS = new Set([2, 10, 17, 31, 58, 121]);
/** SPELL_EFFECT_ENERGIZE — crits only for POWER_MANA with a family AND a dmgClass. */
const EFFECT_ENERGIZE = 30;
const POWER_MANA = 0;

/** Bake row or `{ rawEffects }` — JoR 20187 / Holy Shock 25912 are often not in the spellbook. */
export type SpellCritFields = SpellAttrFields & {
  rawEffects?: { effect?: number; miscValue?: number }[];
  effects?: { kind: string }[];
  spellFamilyName?: number;
  dmgClass?: number;
};

// IsSpellAbleToCrit: the cannot-crit attribute kills it outright, otherwise at least one effect must be
// a crittable kind. This replaces a name-based guess on the damage paths.
export function spellCanCrit(spell: SpellCritFields | null | undefined): boolean {
  if (!spell) return false;
  if (hasAttrEx2(spell, SPELL_ATTR_EX2.CANT_CRIT)) return false;
  const raw = spell.rawEffects;
  if (!raw || raw.length === 0) {
    // No rawEffects (a synthesised fixture): fall back to the mapped kinds the bake carries.
    const kinds = spell.effects ?? [];
    return kinds.some((e) => e.kind === 'direct_damage' || e.kind === 'heal' || e.kind === 'weapon_damage');
  }
  for (const e of raw) {
    const id = e?.effect ?? 0;
    if (!id) continue;
    if (CRITTABLE_EFFECTS.has(id)) return true;
    if (id === EFFECT_ENERGIZE
      && (e.miscValue ?? -1) === POWER_MANA
      && (spell.spellFamilyName ?? 0) !== 0
      && (spell.dmgClass ?? 0) !== 0) return true;
  }
  return false;
}
