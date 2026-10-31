// Shared AI target selectors for EventAI TARGET_T_*, creature_spell_list TargetId and ScriptDev
// cast rules. Pure domain. Cite: CreatureEventAI.cpp GetTargetByType; UnitAI.cpp ChooseTarget.

import { unitClassIs } from '../scriptdev/classFilter.ts';

// EventAI TARGET_T_* — CreatureEventAI.h Target

/** EventAI action target selectors. Cite: CreatureEventAI.h ~160–196. */
export const TARGET_T = {
  SELF: 0,
  HOSTILE: 1,
  HOSTILE_SECOND_AGGRO: 2,
  HOSTILE_LAST_AGGRO: 3,
  HOSTILE_RANDOM: 4,
  HOSTILE_RANDOM_NOT_TOP: 5,
  ACTION_INVOKER: 6,
  ACTION_INVOKER_OWNER: 7,
  HOSTILE_RANDOM_PLAYER: 8,
  HOSTILE_RANDOM_NOT_TOP_PLAYER: 9,
  EVENT_SENDER: 10,
  SPAWNER: 11,
  EVENT_SPECIFIC: 12,
  PLAYER_INVOKER: 13,
  PLAYER_TAPPED: 14,
  NONE: 15,
  HOSTILE_RANDOM_MANA: 16,
  NEAREST_AOE_TARGET: 17,
  HOSTILE_FARTHEST_AWAY: 18,
} as const;

export type TargetT = (typeof TARGET_T)[keyof typeof TARGET_T];

// creature_spell_list hardcoded targets — CreatureSpellList.h

/** Hardcoded spell-list targets (Id < 100). Cite: CreatureSpellList.h ~34–44. */
export const SPELL_LIST_TARGET = {
  NONE: 0,
  CURRENT: 1,
  SELF: 2,
  DISPELLABLE_FRIENDLY: 3,
  DISPELLABLE_FRIENDLY_NO_SELF: 4,
  FRIENDLY_MISSING_BUFF: 5,
  FRIENDLY_MISSING_BUFF_NO_SELF: 6,
  CURRENT_NOT_ALONE: 7,
} as const;

/** SpellListTargetingType. Cite: CreatureSpellList.h ~26–31. */
export const SPELL_LIST_TARGETING_TYPE = {
  HARDCODED: 0,
  ATTACK: 1,
  SUPPORT: 2,
} as const;

/** AttackingTarget for Type=ATTACK spell-list rows (Param1). Cite: Unit.h AttackingTarget ~1017–1025. */
export const ATTACKING_TARGET = {
  RANDOM: 0,
  TOPAGGRO: 1,
  BOTTOMAGGRO: 2,
  NEAREST_BY: 3,
  FARTHEST_AWAY: 4,
  ALL_SUITABLE: 5,
} as const;

/** SelectFlags bits used by creature_spell_targeting.Param3. Cite: Unit.h SelectFlags ~1028–1047. */
export const SELECT_FLAG = {
  IN_LOS: 0x0001,
  PLAYER: 0x0002,
  POWER_MANA: 0x0004,
  POWER_RAGE: 0x0008,
  POWER_ENERGY: 0x0010,
  IN_MELEE_RANGE: 0x0040,
  NOT_IN_MELEE_RANGE: 0x0080,
  HAS_AURA: 0x0100,
  NOT_AURA: 0x0200,
  RANGE_RANGE: 0x0400,
  RANGE_AOE_RANGE: 0x0800,
  POWER_NOT_MANA: 0x1000,
  USE_EFFECT_RADIUS: 0x2000,
  SKIP_TANK: 0x4000,
  CASTING: 0x8000,
  SKIP_CUSTOM: 0x10000,
  NOT_IMMUNE: 0x20000,
  USE_EFFECT_RADIUS_OF_TRIGGERED_SPELL: 0x40000,
} as const;

export interface SpellListTargetingDef {
  id: number;
  type: number;
  param1: number;
  param2: number;
  param3: number;
  unitCondition: number;
  comment: string;
}

// Used creature_spell_targeting rows referenced by docs/aifid/creature-spell-list.json, valued
// from classic-db Full_DB plus Updates 4496/4503/4660/4699. No invented ids.
export const SPELL_LIST_TARGETING_TABLE: Readonly<Record<number, SpellListTargetingDef>> = {
  0: { id: 0, type: 0, param1: 0, param2: 0, param3: 0, unitCondition: -1, comment: 'Hardcoded - none' },
  1: { id: 1, type: 0, param1: 0, param2: 0, param3: 0, unitCondition: -1, comment: 'Hardcoded - current' },
  2: { id: 2, type: 0, param1: 0, param2: 0, param3: 0, unitCondition: -1, comment: 'Hardcoded - self' },
  3: { id: 3, type: 0, param1: 0, param2: 0, param3: 0, unitCondition: -1, comment: 'Hardcoded - eligible friendly dispel' },
  4: { id: 4, type: 0, param1: 0, param2: 0, param3: 0, unitCondition: -1, comment: 'Hardcoded - eligible friendly dispel - skip self' },
  5: { id: 5, type: 0, param1: 0, param2: 0, param3: 0, unitCondition: -1, comment: 'Hardcoded - eligible friendly missing buff' },
  6: { id: 6, type: 0, param1: 0, param2: 0, param3: 0, unitCondition: -1, comment: 'Hardcoded - eligible friendly missing buff - skip self' },
  7: { id: 7, type: 0, param1: 0, param2: 0, param3: 0, unitCondition: -1, comment: 'Hardcoded - current not alone' },
  // Type=ATTACK (Param1=AttackingTarget, Param2=position skip, Param3=SelectFlags)
  100: { id: 100, type: 1, param1: 0, param2: 0, param3: 2, unitCondition: -1, comment: 'Attack - random player' },
  101: { id: 101, type: 1, param1: 0, param2: 1, param3: 2, unitCondition: -1, comment: 'Attack - random player non tank' },
  // Param3 = PLAYER|CASTING|SKIP_TANK (2|0x8000|0x4000=32770). Cite: update 4503 comments.
  102: { id: 102, type: 1, param1: 0, param2: 1, param3: 32770, unitCondition: -1, comment: 'Attack - random player non tank casting' },
  103: { id: 103, type: 1, param1: 0, param2: 0, param3: 8192, unitCondition: -1, comment: 'Attack - AOE eligible target exists - not passed to cast' },
  104: { id: 104, type: 1, param1: 0, param2: 0, param3: 262144, unitCondition: -1, comment: 'Attack - AOE eligible target for triggered spell exists - not passed to cast' },
  // Param3 = PLAYER|POWER_MANA (2|4=6). Cite: Updates/4496.
  105: { id: 105, type: 1, param1: 0, param2: 0, param3: 6, unitCondition: -1, comment: 'Attack - random player mana user' },
  106: { id: 106, type: 1, param1: 0, param2: 1, param3: 6, unitCondition: -1, comment: 'Attack - random player non tank mana user' },
  // Param3 = PLAYER|NOT_AURA (2|0x200=514). Cite: Full_DB base.
  121: { id: 121, type: 1, param1: 0, param2: 0, param3: 514, unitCondition: -1, comment: 'Attack - random player aura not present' },
  // Param3 = PLAYER|CASTING (2|0x8000=32770). Cite: Updates/4503.
  122: { id: 122, type: 1, param1: 0, param2: 0, param3: 32770, unitCondition: -1, comment: 'Attack - random player casting' },
  // Param1=TOPAGGRO, Param3=NOT_AURA (0x200=512). Cite: Updates/4660.
  130: { id: 130, type: 1, param1: 1, param2: 0, param3: 512, unitCondition: -1, comment: 'Attack - top aggro aura not present' },
  // Param1=TOPAGGRO, Param3=NOT_IN_MELEE (0x80=128). Cite: Updates/4699.
  132: { id: 132, type: 1, param1: 1, param2: 0, param3: 128, unitCondition: -1, comment: 'Attack - top aggro not in melee range' },
  // Type=SUPPORT (Param1=missing HP%, Param2=unused here, Param3=includeSelf). Cite: Full_DB + 4496.
  200: { id: 200, type: 2, param1: 10, param2: 1, param3: 1, unitCondition: -1, comment: 'Support - Missing 10% including self' },
  201: { id: 201, type: 2, param1: 50, param2: 1, param3: 1, unitCondition: -1, comment: 'Support - Missing 50% including self' },
  207: { id: 207, type: 2, param1: 25, param2: 1, param3: 0, unitCondition: -1, comment: 'Support - Missing 25% excluding self' },
  208: { id: 208, type: 2, param1: 75, param2: 1, param3: 1, unitCondition: -1, comment: 'Support - missing 75% including self' },
};

// Context + result

/** Minimal hostile snapshot for selection filters. */
export interface SelectTargetHostile {
  id: string;
  /** Player or player-controlled (pet/ally). Cite: SELECT_FLAG_PLAYER. */
  isPlayer: boolean;
  // Unit::getClass() — enum Classes. Cite: SharedDefines.h:65-79. Absent / 0 fails a required classId
  // filter closed.
  classId?: number;
  powerType?: 'mana' | 'rage' | 'energy' | 'focus' | string;
  casting?: boolean;
  /** True when in melee reach of the selector. */
  inMelee?: boolean;
  /** HP fraction 0..1. */
  hpPct?: number;
  /** Distance yards from selector (for nearest/farthest). */
  distanceYd?: number;
  hasAura?: (spellId: number) => boolean;
}

/** Friendly snapshot for support / dispel / missing-buff selectors. */
export interface SelectTargetFriendly {
  id: string;
  isSelf: boolean;
  /** HP fraction 0..1. */
  hpPct: number;
  hasAura?: (spellId: number) => boolean;
  // FriendlyEligibleDispelInRangeCheck with empty masks: in combat AND immobilized, slowed, frozen
  // or crowd-controlled. It is NOT "carries any debuff". Cite: GridNotifiers.h:915-930.
  hasDispellable?: boolean;
  /** Yards from the selector — the searcher's range gate. Cite: UnitAI.cpp:764-771. */
  distanceYd?: number;
}

export interface SelectTargetRng {
  /** Uniform [0,1). Only drawn when a multi-candidate random pick is required. */
  next(): number;
}

// Live combat snapshot the selector needs. Threat list is most-hated first (ThreatManager.getThreatList
// order). Cite: GetTargetByType / SelectAttackingTarget.
export interface SelectTargetCtx {
  selfId: string;
  /** Current victim (GetVictim) — top threat when threat list non-empty. */
  victimId: string | null;
  /** Threat list ids, most hated first. Empty → fall back to hostiles order. */
  threatList: readonly string[];
  hostiles: readonly SelectTargetHostile[];
  friendlies: readonly SelectTargetFriendly[];
  actionInvokerId?: string | null;
  actionInvokerOwnerId?: string | null;
  eventSenderId?: string | null;
  eventSpecificId?: string | null;
  spawnerId?: string | null;
  playerInvokerId?: string | null;
  playerTappedId?: string | null;
  /** Spell id for HAS_AURA / NOT_AURA checks. */
  spellId?: number;
  // Required Unit::getClass() (enum Classes). Not a SelectFlags bit. Cite: SharedDefines.h:65-79;
  // boss_nefarian.cpp:270-280.
  selectClass?: number;
  // Range gate for the friendly searchers — the spell's own max range, or the literal the script
  // passed. Cite: UnitAI.cpp:722-734 CalculateSpellRange; boss_bug_trio.cpp:371 the 50.0f call.
  friendlyMaxRangeYd?: number;
  // SELECT_FLAG_IN_MELEE_RANGE, out of band because the TARGET_T_* callers pass a fixed flag word.
  // Cite: Unit.h SelectFlags 0x0040; boss_twinemperors.cpp:256.
  requireInMelee?: boolean;
  rng?: SelectTargetRng;
}

export interface SelectTargetResult {
  /** Resolved unit id, or null when none / existence-only AOE / NONE. */
  id: string | null;
  // false when selection failed (no matching unit). Callers treat like C++ isError. Cite:
  // CreatureEventAI.cpp GetTargetByType isError.
  ok: boolean;
  // True for USE_EFFECT_RADIUS / triggered-radius existence checks: the target exists for
  // eligibility but is not passed to the cast (returns a null id). Cite: UnitAI.cpp ~1346.
  existenceOnly?: boolean;
}

export type SelectTargetSource = 'eventai' | 'spell_list';

// Internals

function hostileById(ctx: SelectTargetCtx, id: string | null | undefined): SelectTargetHostile | undefined {
  if (!id) return undefined;
  return ctx.hostiles.find((h) => h.id === id);
}

function threatOrderedHostiles(ctx: SelectTargetCtx): SelectTargetHostile[] {
  const notSelf = (h: SelectTargetHostile) => h.id !== ctx.selfId;
  if (ctx.threatList.length > 0) {
    const out: SelectTargetHostile[] = [];
    for (const id of ctx.threatList) {
      const h = hostileById(ctx, id);
      if (h && notSelf(h)) out.push(h);
    }
    if (out.length > 0) return out;
  }
  return ctx.hostiles.filter(notSelf);
}

// Filter hostiles by SelectFlags. Cite: Unit.cpp MeetsSelectAttackingRequirement ~12065–12118 (subset of
// flags we model without map/LOS).
export function meetsSelectFlags(
  h: SelectTargetHostile,
  flags: number,
  spellId: number | undefined,
  victimId: string | null,
  selectClass?: number,
): boolean {
  if (selectClass != null && selectClass > 0 && !unitClassIs(h.classId, selectClass)) return false;
  if (!flags) return true;
  if ((flags & SELECT_FLAG.PLAYER) !== 0 && !h.isPlayer) return false;
  if ((flags & SELECT_FLAG.POWER_MANA) !== 0 && h.powerType !== 'mana') return false;
  if ((flags & SELECT_FLAG.POWER_RAGE) !== 0 && h.powerType !== 'rage') return false;
  if ((flags & SELECT_FLAG.POWER_ENERGY) !== 0 && h.powerType !== 'energy') return false;
  if ((flags & SELECT_FLAG.POWER_NOT_MANA) !== 0 && h.powerType === 'mana') return false;
  if ((flags & SELECT_FLAG.IN_MELEE_RANGE) !== 0 && h.inMelee !== true) return false;
  if ((flags & SELECT_FLAG.NOT_IN_MELEE_RANGE) !== 0 && h.inMelee === true) return false;
  if ((flags & SELECT_FLAG.SKIP_TANK) !== 0 && victimId != null && h.id === victimId) return false;
  if ((flags & SELECT_FLAG.CASTING) !== 0 && !h.casting) return false;
  if (spellId != null && spellId > 0) {
    if ((flags & SELECT_FLAG.HAS_AURA) !== 0) {
      if (!h.hasAura?.(spellId)) return false;
    }
    if ((flags & SELECT_FLAG.NOT_AURA) !== 0) {
      if (h.hasAura?.(spellId)) return false;
    }
  }
  return true;
}

// SelectAttackingTarget parity. RANDOM/TOP/BOTTOM advance `position` on the raw threat list then
// filter; NEAREST/FARTHEST filter all, sort by distance, then take `position`.
function selectAttacking(
  ctx: SelectTargetCtx,
  method: number,
  position: number,
  flagsIn: number,
): SelectTargetHostile | null {
  // The callers below pass a fixed flag word, so IN_MELEE_RANGE rides the ctx and is ORed here.
  // Cite: Unit.h SelectFlags 0x0040; boss_twinemperors.cpp:256 SPELL_UPPERCUT.
  const flags = flagsIn | (ctx.requireInMelee === true ? SELECT_FLAG.IN_MELEE_RANGE : 0);
  const ordered = threatOrderedHostiles(ctx);
  if (ordered.length === 0) return null;
  // RANDOM/TOP/BOTTOM require position < threat size before advance.
  // Cite: Unit.cpp ~12193–12194.
  if (
    (method === ATTACKING_TARGET.RANDOM
      || method === ATTACKING_TARGET.TOPAGGRO
      || method === ATTACKING_TARGET.BOTTOMAGGRO)
    && position >= ordered.length
  ) {
    return null;
  }

  if (method === ATTACKING_TARGET.TOPAGGRO) {
    for (let i = position; i < ordered.length; i++) {
      const h = ordered[i]!;
      if (meetsSelectFlags(h, flags, ctx.spellId, ctx.victimId, ctx.selectClass)) return h;
    }
    return null;
  }
  if (method === ATTACKING_TARGET.BOTTOMAGGRO) {
    const rev = [...ordered].reverse();
    for (let i = position; i < rev.length; i++) {
      const h = rev[i]!;
      if (meetsSelectFlags(h, flags, ctx.spellId, ctx.victimId, ctx.selectClass)) return h;
    }
    return null;
  }
  if (method === ATTACKING_TARGET.NEAREST_BY || method === ATTACKING_TARGET.FARTHEST_AWAY) {
    // Filter all, sort, then advance position. Cite: Unit.cpp ~12256–12284.
    const suitable = ordered.filter((h) =>
      meetsSelectFlags(h, flags, ctx.spellId, ctx.victimId, ctx.selectClass),
    );
    if (suitable.length === 0 || position >= suitable.length) return null;
    if (method === ATTACKING_TARGET.NEAREST_BY) {
      suitable.sort((a, b) => (a.distanceYd ?? 1e9) - (b.distanceYd ?? 1e9));
    } else {
      suitable.sort((a, b) => (b.distanceYd ?? -1) - (a.distanceYd ?? -1));
    }
    return suitable[position] ?? null;
  }
  // RANDOM — advance threat iterator by position, then filter, then urand.
  // Cite: Unit.cpp ~12200–12219; HOSTILE_RANDOM_NOT_TOP position=1.
  const pool = ordered
    .slice(position)
    .filter((h) => meetsSelectFlags(h, flags, ctx.spellId, ctx.victimId, ctx.selectClass));
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0]!;
  // Only draw RNG when multi-candidate — preserves draw order when N=1.
  if (!ctx.rng) return pool[0]!;
  const idx = Math.floor(ctx.rng.next() * pool.length);
  return pool[Math.min(pool.length - 1, Math.max(0, idx))] ?? null;
}

// SCHEME_HIGHEST_HP among the first `topN` threat entries, optionally melee-only.
// Cite: boss_patchwerk.cpp:114 SetFilteringScheme; :117-127 OnCheckTarget.
export function selectHighestHpAmongTopThreat(
  ctx: SelectTargetCtx,
  topN: number,
  meleeOnly: boolean,
): SelectTargetResult {
  const n = topN | 0;
  if (n <= 0) return { id: null, ok: false };
  const byId = new Map(ctx.hostiles.map((h) => [h.id, h]));
  let best: SelectTargetHostile | null = null;
  for (const id of ctx.threatList.slice(0, n)) {
    const h = byId.get(id);
    if (!h) continue;
    if (meleeOnly && h.inMelee !== true) continue;
    if (!best || (h.hpPct ?? 0) > (best.hpPct ?? 0)) best = h;
  }
  return best ? { id: best.id, ok: true } : { id: null, ok: false };
}

function pickRandomFriendly(
  list: readonly SelectTargetFriendly[],
  rng: SelectTargetRng | undefined,
): SelectTargetFriendly | null {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0]!;
  if (!rng) return list[0]!;
  const idx = Math.floor(rng.next() * list.length);
  return list[Math.min(list.length - 1, Math.max(0, idx))] ?? null;
}

function lowestHpFriendly(
  list: readonly SelectTargetFriendly[],
  missingPct: number,
  includeSelf: boolean,
): SelectTargetFriendly | null {
  // DoSelectLowestHpFriendly: units missing at least `missingPct` of max HP (hurt enough).
  // Cite: UnitAI.cpp DoSelectLowestHpFriendly; ChooseTarget SUPPORT Param1.
  const threshold = 1 - missingPct / 100;
  let best: SelectTargetFriendly | null = null;
  let bestPct = Number.POSITIVE_INFINITY;
  for (const f of list) {
    if (!includeSelf && f.isSelf) continue;
    if (f.hpPct > threshold) continue; // not hurt enough
    if (f.hpPct < bestPct) {
      bestPct = f.hpPct;
      best = f;
    }
  }
  return best;
}

// EventAI path

/** EventAI TARGET_T_* selector. Cite: CreatureEventAI.cpp GetTargetByType ~1710–1817. */
export function selectTargetEventAi(mode: number, ctx: SelectTargetCtx): SelectTargetResult {
  switch (mode) {
    case TARGET_T.SELF:
      return { id: ctx.selfId, ok: true };
    case TARGET_T.HOSTILE: {
      const id = ctx.victimId;
      return id ? { id, ok: true } : { id: null, ok: false };
    }
    case TARGET_T.HOSTILE_SECOND_AGGRO: {
      // SelectAttackingTarget(TOPAGGRO, 1). Cite: GetTargetByType ~1722–1726.
      const h = selectAttacking(ctx, ATTACKING_TARGET.TOPAGGRO, 1, 0);
      return h ? { id: h.id, ok: true } : { id: null, ok: false };
    }
    case TARGET_T.HOSTILE_LAST_AGGRO: {
      // SelectAttackingTarget(BOTTOMAGGRO, 0). Cite: ~1727–1731.
      const h = selectAttacking(ctx, ATTACKING_TARGET.BOTTOMAGGRO, 0, 0);
      return h ? { id: h.id, ok: true } : { id: null, ok: false };
    }
    case TARGET_T.HOSTILE_RANDOM: {
      const h = selectAttacking(ctx, ATTACKING_TARGET.RANDOM, 0, 0);
      return h ? { id: h.id, ok: true } : { id: null, ok: false };
    }
    case TARGET_T.HOSTILE_RANDOM_NOT_TOP: {
      const h = selectAttacking(ctx, ATTACKING_TARGET.RANDOM, 1, 0);
      return h ? { id: h.id, ok: true } : { id: null, ok: false };
    }
    case TARGET_T.HOSTILE_RANDOM_PLAYER: {
      const h = selectAttacking(ctx, ATTACKING_TARGET.RANDOM, 0, SELECT_FLAG.PLAYER);
      return h ? { id: h.id, ok: true } : { id: null, ok: false };
    }
    case TARGET_T.HOSTILE_RANDOM_NOT_TOP_PLAYER: {
      const h = selectAttacking(ctx, ATTACKING_TARGET.RANDOM, 1, SELECT_FLAG.PLAYER);
      return h ? { id: h.id, ok: true } : { id: null, ok: false };
    }
    case TARGET_T.HOSTILE_RANDOM_MANA: {
      const h = selectAttacking(ctx, ATTACKING_TARGET.RANDOM, 0, SELECT_FLAG.POWER_MANA);
      return h ? { id: h.id, ok: true } : { id: null, ok: false };
    }
    case TARGET_T.NEAREST_AOE_TARGET: {
      // Existence check only — returns nullptr to cast. Cite: ~1757–1761.
      const h = selectAttacking(
        ctx,
        ATTACKING_TARGET.NEAREST_BY,
        0,
        SELECT_FLAG.USE_EFFECT_RADIUS,
      );
      return h
        ? { id: null, ok: true, existenceOnly: true }
        : { id: null, ok: false, existenceOnly: true };
    }
    case TARGET_T.HOSTILE_FARTHEST_AWAY: {
      const h = selectAttacking(
        ctx,
        ATTACKING_TARGET.FARTHEST_AWAY,
        0,
        SELECT_FLAG.NOT_IN_MELEE_RANGE,
      );
      return h ? { id: h.id, ok: true } : { id: null, ok: false };
    }
    case TARGET_T.ACTION_INVOKER:
      return ctx.actionInvokerId
        ? { id: ctx.actionInvokerId, ok: true }
        : { id: null, ok: false };
    case TARGET_T.ACTION_INVOKER_OWNER:
      return ctx.actionInvokerOwnerId
        ? { id: ctx.actionInvokerOwnerId, ok: true }
        : { id: null, ok: false };
    case TARGET_T.EVENT_SENDER:
      return ctx.eventSenderId
        ? { id: ctx.eventSenderId, ok: true }
        : { id: null, ok: false };
    case TARGET_T.SPAWNER:
      return ctx.spawnerId
        ? { id: ctx.spawnerId, ok: true }
        : { id: null, ok: false };
    case TARGET_T.EVENT_SPECIFIC:
      return ctx.eventSpecificId
        ? { id: ctx.eventSpecificId, ok: true }
        : { id: null, ok: false };
    case TARGET_T.PLAYER_INVOKER:
      return ctx.playerInvokerId
        ? { id: ctx.playerInvokerId, ok: true }
        : { id: null, ok: false };
    case TARGET_T.PLAYER_TAPPED:
      return ctx.playerTappedId
        ? { id: ctx.playerTappedId, ok: true }
        : { id: null, ok: false };
    case TARGET_T.NONE:
      return { id: null, ok: true };
    default:
      return { id: null, ok: false };
  }
}

// Spell-list path

// creature_spell_list TargetId selector. Cite: UnitAI.cpp ChooseTarget ~1295–1361; CreatureSpellList.h
// hardcoded 0–7; SPELL_LIST_TARGETING_TABLE for Id ≥ 100.
export function selectTargetSpellList(targetId: number, ctx: SelectTargetCtx): SelectTargetResult {
  const def = SPELL_LIST_TARGETING_TABLE[targetId];
  if (!def) {
    // Unknown id — fail closed (do not invent). Cite: ObjectMgr LoadCreatureSpellLists skip.
    return { id: null, ok: false };
  }

  if (def.type === SPELL_LIST_TARGETING_TYPE.HARDCODED) {
    switch (def.id) {
      case SPELL_LIST_TARGET.NONE:
        return { id: null, ok: true };
      case SPELL_LIST_TARGET.CURRENT:
        return ctx.victimId ? { id: ctx.victimId, ok: true } : { id: null, ok: false };
      case SPELL_LIST_TARGET.SELF:
        return { id: ctx.selfId, ok: true };
      case SPELL_LIST_TARGET.DISPELLABLE_FRIENDLY:
      case SPELL_LIST_TARGET.DISPELLABLE_FRIENDLY_NO_SELF: {
        const includeSelf = def.id === SPELL_LIST_TARGET.DISPELLABLE_FRIENDLY;
        const maxYd = ctx.friendlyMaxRangeYd;
        const list = ctx.friendlies.filter((f) => {
          if (!(includeSelf || !f.isSelf)) return false;
          if (f.hasDispellable !== true) return false;
          // IsWithinDistInMap(u, i_range) — omitted distance is "not modeled", so in range.
          return !(maxYd != null && f.distanceYd != null && f.distanceYd > maxYd);
        });
        const pick = pickRandomFriendly(list, ctx.rng);
        return pick ? { id: pick.id, ok: true } : { id: null, ok: false };
      }
      case SPELL_LIST_TARGET.FRIENDLY_MISSING_BUFF:
      case SPELL_LIST_TARGET.FRIENDLY_MISSING_BUFF_NO_SELF: {
        const includeSelf = def.id === SPELL_LIST_TARGET.FRIENDLY_MISSING_BUFF;
        const spellId = ctx.spellId ?? 0;
        const list = ctx.friendlies.filter((f) => {
          if (!includeSelf && f.isSelf) return false;
          if (spellId > 0 && f.hasAura?.(spellId)) return false;
          return true;
        });
        const pick = pickRandomFriendly(list, ctx.rng);
        return pick ? { id: pick.id, ok: true } : { id: null, ok: false };
      }
      case SPELL_LIST_TARGET.CURRENT_NOT_ALONE: {
        // Current target exists and threat list size > 1.
        // Cite: UnitAI.cpp ~1336–1339.
        const ok = ctx.victimId != null && threatOrderedHostiles(ctx).length > 1;
        return ok && ctx.victimId
          ? { id: ctx.victimId, ok: true }
          : { id: ctx.victimId, ok: false };
      }
      default:
        return { id: null, ok: false };
    }
  }

  if (def.type === SPELL_LIST_TARGETING_TYPE.ATTACK) {
    const h = selectAttacking(ctx, def.param1, def.param2, def.param3);
    const existenceOnly =
      (def.param3 & (SELECT_FLAG.USE_EFFECT_RADIUS | SELECT_FLAG.USE_EFFECT_RADIUS_OF_TRIGGERED_SPELL)) !== 0;
    if (existenceOnly) {
      // Cite: UnitAI.cpp ChooseTarget ~1346–1347 — existence check, null cast target.
      return h
        ? { id: null, ok: true, existenceOnly: true }
        : { id: null, ok: false, existenceOnly: true };
    }
    return h ? { id: h.id, ok: true } : { id: null, ok: false };
  }

  if (def.type === SPELL_LIST_TARGETING_TYPE.SUPPORT) {
    // Param1 = missing HP percent; Param3 = include self (1/0). Cite: Full_DB rows 200+.
    const includeSelf = def.param3 !== 0;
    const pick = lowestHpFriendly(ctx.friendlies, def.param1, includeSelf);
    return pick ? { id: pick.id, ok: true } : { id: null, ok: false };
  }

  return { id: null, ok: false };
}

// Shared entry point

// One shared selector for EventAI, the spell-list scheduler and ScriptDev. `source` disambiguates
// the overlapping 0–7 ranges; RNG is drawn only for multi-candidate random pools.
export function selectTarget(
  mode: number,
  ctx: SelectTargetCtx,
  source?: SelectTargetSource,
): SelectTargetResult {
  const src: SelectTargetSource =
    source ?? (mode >= 100 ? 'spell_list' : 'eventai');
  return src === 'spell_list'
    ? selectTargetSpellList(mode, ctx)
    : selectTargetEventAi(mode, ctx);
}

// Every TARGET_T / spell-list TargetId used by committed aifid artifacts (eventai action param2 for
// target-bearing actions + creature-spell-list TargetId). Tests assert each has a deterministic fixture.
export function usedSelectorModesFromArtifacts(artifacts: {
  eventAiTargetModes: readonly number[];
  spellListTargetIds: readonly number[];
}): { eventai: number[]; spell_list: number[] } {
  const ea = [...new Set(artifacts.eventAiTargetModes.filter((n) => n >= 0 && n <= 18))].sort(
    (a, b) => a - b,
  );
  const sl = [...new Set(artifacts.spellListTargetIds)].sort((a, b) => a - b);
  return { eventai: ea, spell_list: sl };
}
