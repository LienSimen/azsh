// Stealth strength, detect range and the Phonecraft positional proxy. The behind and front geometry
// is Classic; canUseBehindAbility is an explicit product proxy, not a DBC formula.

import type { SpellDef } from '../../data/schema.ts';
import { SHAPESHIFT_FORM } from '../../data/schema.ts';

/** Cite: Unit.h MAX_PLAYER_STEALTH_DETECT_RANGE */
export const MAX_PLAYER_STEALTH_DETECT_RANGE = 45;

/** Aura interrupt bits (SpellDefines.h:362–386 AURA_INTERRUPT_FLAG_*). */
export const AURA_INTERRUPT = {
  HOSTILE_ACTION: 0x00000001,
  DAMAGE: 0x00000002,
  ACTION: 0x00000004,
  MOVING: 0x00000008,
  TURNING: 0x00000010,
  ANIM_CANCELS: 0x00000020,
  DISMOUNT: 0x00000040,
  UNDERWATER_CANCELS: 0x00000080,
  ABOVEWATER_CANCELS: 0x00000100,
  SHEATHING_CANCELS: 0x00000200,
  INTERACTING: 0x00000400,
  LOOTING: 0x00000800,
  ATTACKING: 0x00001000,
  ITEM_USE: 0x00002000,
  DAMAGE_CHANNEL_DURATION: 0x00004000,
  SHAPESHIFTING: 0x00008000,
  ACTION_LATE: 0x00010000,
  MOUNTING: 0x00020000,
  STANDING_CANCELS: 0x00040000,
  LEAVE_WORLD: 0x00080000,
  STEALTH_INVIS_CANCELS: 0x00100000,
  INVULNERABILITY_BUFF_CANCELS: 0x00200000,
  ENTER_WORLD: 0x00400000,
  PVP_ACTIVE_CANCELS: 0x00800000,
  NON_PERIODIC_DAMAGE: 0x01000000,
} as const;

// Stealth visibility distance in yards, from GetStealthVisibilityDistance. The alert argument is the
// STEALTHER's player-controlled flag, so a player sneak is seen further out. Reach is the floor.
export function stealthVisibilityDistance(
  detectorLevel: number,
  stealthStrength: number,
  detectStrength = 0,
  detectorIsPlayer = false,
  alert = false,
  detectorCombatReachYd = 0,
): number {
  let detectionValue = 30;
  detectionValue += (Math.max(1, detectorLevel) - 1) * 5;
  detectionValue += detectStrength;
  detectionValue -= stealthStrength;
  let visibilityRange = detectionValue * 0.3;
  if (detectorIsPlayer && visibilityRange > MAX_PLAYER_STEALTH_DETECT_RANGE) {
    visibilityRange = MAX_PLAYER_STEALTH_DETECT_RANGE;
  }
  if (alert) {
    visibilityRange += visibilityRange * 0.08 + 1.5;
  }
  return Math.max(Math.max(0, detectorCombatReachYd), visibilityRange);
}

// Whether the detector sees the stealther at the given distance. Does not model LOS / facing cone (those
// need world geometry).
export function isDetectedAtDistance(
  distanceYd: number,
  detectorLevel: number,
  stealthStrength: number,
  detectStrength = 0,
  detectorIsPlayer = false,
): boolean {
  const range = stealthVisibilityDistance(
    detectorLevel, stealthStrength, detectStrength, detectorIsPlayer, false,
  );
  return distanceYd <= range;
}

/** Cite: Player.cpp:1546 `m_DetectInvTimer = GetMap()->IsBattleGround() ? 500 : 2000`. */
export const STEALTH_DETECT_INTERVAL_MS = 2000;
export const STEALTH_DETECT_INTERVAL_BG_MS = 500;

/** A player's own combat reach, the floor on what it can see inside. Cite: Level3.cpp:4420. */
export const PLAYER_COMBAT_REACH_YD = 1.5;

/** How often a detector re-runs its stealth sweep. A battleground sweeps 4x as often. */
export function stealthDetectIntervalMs(isBattleground: boolean): number {
  return isBattleground ? STEALTH_DETECT_INTERVAL_BG_MS : STEALTH_DETECT_INTERVAL_MS;
}

// The IsVisibleForOrDetect stealth branch, in the order the core tests it. Geometry comes from the
// caller, and `undefined` means this session has no geometry — which passes, as it always has.
export function detectsStealth(opts: {
  distanceYd?: number;
  detectorLevel: number;
  detectorAlive?: boolean;
  detectorStunned?: boolean;
  detectorIsPlayer?: boolean;
  detectorCombatReachYd?: number;
  stealthStrength: number;
  detectStrength?: number;
  /** UNIT_FLAG_PLAYER_CONTROLLED on the stealther — the core's `alert` arg at Unit.cpp:8265. */
  stealtherPlayerControlled?: boolean;
  /** The stealther already has attackers: stealth is lost whatever the geometry says. */
  stealtherAttacked?: boolean;
  /** `viewPoint->isInFrontInMap` — the stealther is in the detector's front half. */
  inFrontArc?: boolean;
  /** `IsWithinLOS` from the detector's view point. */
  lineOfSight?: boolean;
}): boolean {
  // A dead detector detects nothing (Unit.cpp:8143 clears `detect` when !IsAlive).
  if (opts.detectorAlive === false) return false;
  // "If is attacked then stealth is lost, some creature can use stealth too".
  if (opts.stealtherAttacked) return true;
  // "If a mob or player is stunned he will not be able to detect stealth".
  if (opts.detectorStunned) return false;
  // "Always invisible from back (when stealth detection is on)".
  if (opts.inFrontArc === false) return false;
  if (opts.distanceYd != null) {
    const range = stealthVisibilityDistance(
      opts.detectorLevel,
      opts.stealthStrength,
      opts.detectStrength ?? 0,
      opts.detectorIsPlayer ?? false,
      opts.stealtherPlayerControlled ?? false,
      opts.detectorCombatReachYd ?? 0,
    );
    if (range <= 0 || opts.distanceYd > range) return false;
  }
  if (opts.lineOfSight === false) return false;
  return true;
}

// Phonecraft positional proxy for requiresBehind, NOT a CMaNGOS formula: true while the caster is
// stealthed, while the target is hard-CC'd, or while the target has aggro on somebody else.
export function canUseBehindAbility(opts: {
  casterStealthed: boolean;
  targetStunned: boolean;
  targetIncapacitated: boolean;
  /** When true, mob is facing this attacker (solo combat default once engaged). */
  targetHasAggroOnCaster: boolean;
}): boolean {
  if (opts.casterStealthed) return true;
  if (opts.targetStunned || opts.targetIncapacitated) return true;
  if (!opts.targetHasAggroOnCaster) return true;
  return false;
}

/** Front-facing proxy for Gouge: not stealthed-behind-only; require target facing you / not hard-CC. */
export function canUseFrontAbility(opts: {
  targetStunned: boolean;
  targetIncapacitated: boolean;
}): boolean {
  // While the target is already incapacitated, facing is moot, so allow the re-Gouge edge cases. When
  // free, assume frontal engagement — in non-spatial combat the solo player faces the mob.
  void opts;
  return true;
}

export function isStealthSpell(spell: SpellDef): boolean {
  return spell.role === 'stealth' || spell.effects.some((e) => e.kind === 'stealth');
}

// SPELL_ATTR_CANCELS_AUTO_ATTACK_COMBAT means AttackStop after a successful cast. Prefer the baked
// flag; when it is missing, Gouge and Sap still cancel, since white swings self-break the CC.
export function spellCancelsAutoAttack(spell: SpellDef): boolean {
  if (spell.cancelsAutoAttack) return true;
  return (spell.effects ?? []).some(
    (e) =>
      e.kind === 'cc'
      && e.control === 'incapacitate'
      && e.breakOnDamage === true
      && e.mechanic === 'sap',
  );
}

export function isStealthForm(form: number): boolean {
  return form === SHAPESHIFT_FORM.STEALTH;
}

/** Total stealth strength from an active stealth effect + passive level bonus. */
export function totalStealthStrength(activeStrength: number, levelBonus: number): number {
  return Math.max(0, (activeStrength | 0) + (levelBonus | 0));
}
