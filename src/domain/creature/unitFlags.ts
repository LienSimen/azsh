// creature_template.UnitFlags (UNIT_FIELD_FLAGS at spawn) — the column that decides whether a unit
// can be attacked at all, independent of faction. Cite: Unit.h:468-503; Relations.cpp:351-368.

/** Cite: Unit.h:468-503. Only the bits this tree reads are named. */
export const UNIT_FLAG = {
  /** 0x2 "not attackable" — Unit.h:470. */
  SPAWNING: 0x00000002,
  /** 0x80 — Unit.h:499 NOT_ATTACKABLE_1. */
  NOT_ATTACKABLE_1: 0x00000080,
  /** 0x100 — immune to players. Unit.h:476. */
  IMMUNE_TO_PLAYER: 0x00000100,
  /** 0x200 — immune to NPCs. Unit.h:477. */
  IMMUNE_TO_NPC: 0x00000200,
  /** 0x10000 "is not targetable by attack or spell" — Unit.h:482. */
  UNTARGETABLE: 0x00010000,
  /** 0x20000 — the unit cannot attack. Unit.h:483. */
  PACIFIED: 0x00020000,
  /** 0x40000 — stunned: no swing, no cast, no turn. Unit.h:485. */
  STUNNED: 0x00040000,
  /** 0x100000 — Unit.h:486. */
  TAXI_FLIGHT: 0x00100000,
  /** 0x2000000 — Unit.h:490. Every script trigger and channel object carries this. */
  UNINTERACTIBLE: 0x02000000,
} as const;

// The exact mask Unit::CanAttack refuses on: SPAWNING, NOT_ATTACKABLE_1, UNTARGETABLE,
// TAXI_FLIGHT, UNINTERACTIBLE. Cite: Relations.cpp:365.
export const UNIT_FLAG_CANNOT_BE_ATTACKED =
  UNIT_FLAG.SPAWNING
  | UNIT_FLAG.NOT_ATTACKABLE_1
  | UNIT_FLAG.UNTARGETABLE
  | UNIT_FLAG.TAXI_FLIGHT
  | UNIT_FLAG.UNINTERACTIBLE;

/** Minimal shape — anything carrying the baked column (CreatureDef, a bake row, a fixture). */
export type UnitFlagsBearer = { unitFlags?: number } | null | undefined;

const bits = (c: UnitFlagsBearer): number => (c && c.unitFlags != null ? c.unitFlags | 0 : 0);

// No player and no NPC may attack this unit, whatever the faction says. 224 of 10,384 templates.
// Fails OPEN: a template with no unitFlags is attackable content. Cite: Relations.cpp:365.
export function unitCannotBeAttacked(c: UnitFlagsBearer): boolean {
  return (bits(c) & UNIT_FLAG_CANNOT_BE_ATTACKED) !== 0;
}

// A player may not attack this unit whatever its faction says; a script clears the flag when its
// event makes the unit fair game. Cite: Relations.cpp:373-374 UNIT_FLAG_IMMUNE_TO_PLAYER.
export function unitImmuneToPlayer(c: UnitFlagsBearer): boolean {
  return (bits(c) & UNIT_FLAG.IMMUNE_TO_PLAYER) !== 0;
}

// The unit never starts a fight — a script anchor, a channel object, an invisible actor.
// Cite: Unit.cpp:6067 SPAWNING | UNINTERACTIBLE → CanInitiateAttack false.
export function unitCannotInitiateAttack(c: UnitFlagsBearer): boolean {
  return (bits(c) & (UNIT_FLAG.SPAWNING | UNIT_FLAG.UNINTERACTIBLE)) !== 0;
}

// Pacified: the unit cannot swing, so nothing should SEEK it, though the source still lets you
// hit it. Exactly 3 templates: Injured 14484 and Plagued Peasant 14485, Ysida Harmon 16031.
export function unitIsPacified(c: UnitFlagsBearer): boolean {
  return (bits(c) & UNIT_FLAG.PACIFIED) !== 0;
}

// Spawned already stunned — the row stands there and never acts. Exactly 5 templates: the three
// Target Dummy ranks, Thaddius (inert until his polarity phase) and Invisible Man. Cite: Unit.h:485.
export function unitIsStunnedAtSpawn(c: UnitFlagsBearer): boolean {
  return (bits(c) & UNIT_FLAG.STUNNED) !== 0;
}

// Never give this template a floor body: it can neither be attacked nor attack. That is the
// script-trigger and channel-object class — every "* Trigger", Generator and Marker on any map.
export function isScriptAnchorCreature(c: UnitFlagsBearer): boolean {
  return unitCannotBeAttacked(c) && unitCannotInitiateAttack(c);
}
