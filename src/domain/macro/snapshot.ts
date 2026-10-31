// What a macro is allowed to know when it runs. A host fills this in from the live session or the
// character, and the evaluator reads nothing else — which is what lets it run in both places.

import type { MacroUnitRef } from './units.ts';

// One aura row. Note "my" in `mybuff:` / `mydebuff:` means "on ME", not "cast by me" — Roid reads the
// player's own aura bar (Conditionals.lua:459-473), so no caster attribution is needed.
export interface MacroAura {
  spellId: number;
  name: string;
  stacks?: number;
}

/** A unit that EXISTS. A missing unit is `null` from `MacroSnapshot.unit()`. */
export interface MacroUnitSnap {
  /** The reference that resolved to this unit (`@party1target` → base party, index 1, hops 1). */
  ref: MacroUnitRef;
  /** Canonical text of that reference, for keys and display. */
  token: string;
  name: string;
  dead: boolean;
  isPlayer: boolean;
  /** UnitCanAssist — a friendly you may heal/buff. Cite: Conditionals.lua:13 CheckHelp. */
  canAssist: boolean;
  /** UnitCanAttack — a hostile you may strike. */
  canAttack: boolean;
  creatureType?: number;
  /** CREATURE_TYPE label ("Undead", "Beast") for `[type:…]`. */
  creatureTypeName?: string;
  hp: number;
  maxHp: number;
  power: number;
  maxPower: number;
  buffs: readonly MacroAura[];
  debuffs: readonly MacroAura[];
  inParty: boolean;
  inRaid: boolean;
}

/** Auto-attack / autorepeat state for `!spell`. Cite: Conditionals.lua:193 CheckChanneled. */
export interface MacroChannelState {
  /** Name of the spell being cast or channelled right now, '' when idle. */
  spellName: string;
  channeled: boolean;
  autoAttack: boolean;
  autoShot: boolean;
  wand: boolean;
}

export interface MacroSnapshot {
  /** Null when the unit does not exist (no target, no pet, nothing under the cursor). */
  unit(ref: MacroUnitRef): MacroUnitSnap | null;
  /** UnitIsUnit — two references resolving to the same body (drives `attacks:` / `noattacks:`). */
  unitIs(a: MacroUnitRef, b: MacroUnitRef): boolean;
  /** autoSelfCast CVar: with no target, a clause falls back to the player. Cite: Core.lua:131-141. */
  autoSelfCast: boolean;
  combat: boolean;
  stealthed: boolean;
  /** 1-based index on the stance/shapeshift bar, 0 = no form. Cite: Conditionals.lua:45. */
  stanceIndex: number;
  mods: { shift: boolean; ctrl: boolean; alt: boolean };
  group: { party: number; raid: number };
  /** `[equipped:Shields]` — a weapon-type name from Conditionals.lua:118 WeaponTypeNames. */
  hasWeaponType(name: string): boolean;
  /** Remaining cooldown for a spell / equipped item / bag item by NAME; null = no such thing. */
  cooldownRemainingMs(name: string): number | null;
  channel: MacroChannelState;
  // Only spells this character KNOWS resolve — the anti-tamper gate for /cast. `rank` is the
  // (Rank 3) form; any other parenthesised `subtext` must be MATCHED by the host, not ignored.
  // `gcdMs` is SpellEntry.StartRecoveryTime, the same field spellIncursGcd reads (recovery.ts:70).
  // 0 = off the global cooldown, so a press may fire it alongside another cast. Absent = assume on.
  resolveSpell(
    name: string,
    rank?: number,
    subtext?: string,
  ): { id: number; name: string; icon?: string; gcdMs?: number } | null;
  /** Only items the character CARRIES or wears resolve — the anti-tamper gate for /use, /equip. */
  resolveItem(name: string): { entry: number; name: string; icon?: string; equipped: boolean } | null;
}

/** hp as 0..100 (Roid: 100 / UnitHealthMax * UnitHealth). */
export function hpPct(u: MacroUnitSnap): number {
  return u.maxHp > 0 ? (100 / u.maxHp) * u.hp : 0;
}

export function powerPct(u: MacroUnitSnap): number {
  return u.maxPower > 0 ? (100 / u.maxPower) * u.power : 0;
}

// Aura name match. Roid does a case-SENSITIVE find on the tooltip line; we match
// case-insensitively so [nomybuff:aspect_of_the_hawk] behaves as players expect. Substring still.
export function auraNameMatches(auraName: string, query: string): boolean {
  if (!query) return false;
  return auraName.toLowerCase().includes(query.toLowerCase());
}

/** True when any aura in the list matches the query name. */
export function hasAuraNamed(list: readonly MacroAura[], query: string): boolean {
  for (const a of list) if (auraNameMatches(a.name, query)) return true;
  return false;
}

// Split Name(subtext), the form the client documents for /cast. "Rank 3" and a bare 3 both read
// as rank 3; any other subtext comes back for the host to match, so an unknown one refuses.
export function splitSpellRank(arg: string): { name: string; rank?: number; subtext?: string } {
  const m = /^(.*?)\s*\(\s*([^)]*?)\s*\)\s*$/.exec(arg);
  if (!m) return { name: arg.trim() };
  const name = (m[1] ?? '').trim();
  const inner = (m[2] ?? '').trim();
  if (!inner) return { name };
  const rank = /^rank\s+(\d+)$/i.exec(inner) ?? /^(\d+)$/.exec(inner);
  if (rank) return { name, rank: Number(rank[1]) };
  return { name, subtext: inner };
}
