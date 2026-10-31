// Pure ConditionEntry evaluator for cast and use gating: the condition types and recursive AND, OR
// and NOT against an injected snapshot. An unimplemented type reports unsupported, never a verdict.

import type { ConditionDef, ConditionTypeId } from '../../data/schema.ts';
import { checkOp } from '../game/worldState.ts';

/** CMaNGOS ConditionType constants used by the minimum useful set. */
export const CONDITION = {
  NOT: -3,
  OR: -2,
  AND: -1,
  NONE: 0,
  AURA: 1,
  ITEM: 2,
  ITEM_EQUIPPED: 3,
  AREAID: 4,
  /** value1 = faction_id, value2 = min_rank. Cite: Conditions.h CONDITION_REPUTATION_RANK_MIN = 5. */
  REPUTATION_RANK_MIN: 5,
  /** value1 = team id (ALLIANCE=469, HORDE=67). Cite: Conditions.h CONDITION_TEAM = 6. */
  TEAM: 6,
  // value1 = skill_id, value2 = min skill value (base). Cite: Conditions.h CONDITION_SKILL = 7;
  // Conditions.cpp Meets — HasSkill && GetSkillValueBase >= value2.
  SKILL: 7,
  QUESTREWARDED: 8,
  QUESTTAKEN: 9,
  /** True while any AD commission aura is up. Cite: Conditions.h:42; Conditions.cpp:228-234. */
  AD_COMMISSION_AURA: 10,
  /** value1 = minrank, value2 = maxrank. Cite: Conditions.h:44 CONDITION_PVP_RANK = 11. */
  PVP_RANK: 11,
  /** value1 = event_id. Cite: Conditions.h CONDITION_ACTIVE_GAME_EVENT = 12. */
  ACTIVE_GAME_EVENT: 12,
  /** value1 = holiday_id (Holidays.dbc). Cite: Conditions.h CONDITION_ACTIVE_HOLIDAY = 26. */
  ACTIVE_HOLIDAY: 26,
  // value1 = required AreaTable.flags bits, value2 = forbidden bits. Cite: Conditions.h:46
  // CONDITION_AREA_FLAG = 13; Conditions.cpp:249-258.
  AREA_FLAG: 13,
  RACE_CLASS: 14,
  LEVEL: 15,
  SPELL: 17,
  // value1 is the instance condition id, 0 to 6 for the Dire Maul tribute guards alive.
  // Cite: Conditions.h CONDITION_INSTANCE_SCRIPT = 18; instance_dire_maul.cpp:499-521.
  INSTANCE_SCRIPT: 18,
  /** value1 = quest_id. Cite: Conditions.cpp:295-298 CanTakeQuest(template, false). */
  QUESTAVAILABLE: 19,
  QUEST_NONE: 22,
  /** value1 = item_id, value2 = count. Cite: Conditions.cpp:316-318 HasItemCount(..., true). */
  ITEM_WITH_BANK: 23,
  /** value1 = skill_id; value2==1 → !HasSkill, else HasSkill && base < value2. Cite: Conditions.cpp:377-385. */
  SKILL_BELOW: 29,
  /** value1 = faction_id, value2 = max_rank. Cite: Conditions.h CONDITION_REPUTATION_RANK_MAX = 30. */
  REPUTATION_RANK_MAX: 30,
  /** value1 = DungeonEncounter id, value2 = optional OR. Cite: Conditions.h:69; Conditions.cpp:392-411. */
  COMPLETED_ENCOUNTER: 31,
  // value1 is a waypoint id and value2 the comparison — exact, at or past, or before — on the SOURCE
  // creature. Cite: Conditions.h CONDITION_LAST_WAYPOINT = 33; Conditions.cpp:413-423.
  LAST_WAYPOINT: 33,
  /** value1 = gender (0 male, 1 female, 2 none). Cite: Conditions.h CONDITION_GENDER = 35. */
  GENDER: 35,
  // value1 = creature entry, value2 = range yards. Alive only; dist < range. Cite: Conditions.h
  // CONDITION_CREATURE_IN_RANGE = 37; Conditions.cpp:301-309.
  CREATURE_IN_RANGE: 37,
  // value1 = creatureId, value2 = min count. Cite: Conditions.h:78; Conditions.cpp:488 SpawnedCountForEntry
  // >= value2.
  SPAWN_COUNT: 39,
  /** value1 = conditionId, value2 = state. Cite: Conditions.h:79 CONDITION_WORLD_SCRIPT = 40. */
  WORLD_SCRIPT: 40,
  // value1 = worldstateId, value2 = ConditionOperation, value3 = operand. Cite: Conditions.h:84
  // CONDITION_WORLDSTATE = 42; Conditions.cpp:494-497.
  WORLDSTATE: 42,
  /** value1 0=player 1=group 2=instance 3=creature; value2 range. Cite: Conditions.cpp:424-464. */
  DEAD_OR_AWAY: 36,
  IS_IN_COMBAT: 43,
} as const;

export const CONDITION_FLAG_REVERSE_RESULT = 0x1;

/** SpellVisual 3580 + (ABILITY|MOUNTED). Cite: Conditions.cpp:228-234; Spell.dbc field 115 (1.12.1). */
export const AD_COMMISSION_AURA_SPELL_IDS: ReadonlySet<number> = new Set([
  15366, 17670, 23930, 24198, 29112, 29113,
]);

/** Live aura spell ids for a condition snapshot. Omit `nowMs` to include every id on the sheet. */
export function auraIdsForSnapshot(
  auras: ReadonlyArray<{ spellId: number; expiresAt?: number | null }> | undefined,
  nowMs?: number,
): number[] {
  const out: number[] = [];
  for (const a of auras ?? []) {
    if (nowMs != null && a.expiresAt != null && a.expiresAt <= nowMs) continue;
    out.push(a.spellId);
  }
  return out;
}

/** True when snapshot auras include a SpellVisual-3580 commission spell. Cite: Conditions.cpp:228-234. */
export function snapshotHasAdCommissionAura(snapshot: ConditionSnapshot): boolean {
  for (const id of AD_COMMISSION_AURA_SPELL_IDS) {
    if (hasInSet(snapshot.auras, id)) return true;
  }
  return false;
}

/** On-equip spells that satisfy type 10. Cite: Player.cpp ApplyItemEquipSpell. */
export function itemGrantsAdCommissionAura(
  item: { equipSpells?: readonly number[] } | undefined,
): boolean {
  if (!item?.equipSpells) return false;
  for (const sid of item.equipSpells) {
    if (AD_COMMISSION_AURA_SPELL_IDS.has(sid)) return true;
  }
  return false;
}

// Injected world/player snapshot. Callers fill only what they know; missing fields fail the corresponding
// condition types (honest gap).
export interface ConditionSnapshot {
  level?: number;
  /** Spell ids the unit currently has as auras (buffs/debuffs). */
  auras?: ReadonlySet<number> | readonly number[];
  /** Inventory counts by item entry. */
  items?: ReadonlyMap<number, number> | Readonly<Record<number, number>>;
  /** Bank counts by item entry — type 23 adds these to bags. Cite: Player.cpp:8482 inBankAlso. */
  bankItems?: ReadonlyMap<number, number> | Readonly<Record<number, number>>;
  /** Equipped item entries. */
  equipped?: ReadonlySet<number> | readonly number[];
  /** Known spell ids. */
  knownSpells?: ReadonlySet<number> | readonly number[];
  /** Quest states: 'none' | 'taken' | 'complete' | 'rewarded'. */
  quests?: ReadonlyMap<number, 'none' | 'taken' | 'complete' | 'rewarded'> | Readonly<Record<number, string>>;
  raceMask?: number;
  classMask?: number;
  inCombat?: boolean;
  /** Current area / zone id (AREA stub). */
  areaId?: number;
  // Current area AreaTable.flags. Absent → AREA_FLAG unsupported (never invent bits). Cite:
  // Conditions.cpp:254 pAreaEntry->flags; DBCStructure.h AreaTableEntry.flags field 4.
  areaFlags?: number;
  // Player reputation rank (0–7) for a faction id. When absent, REPUTATION_RANK_MIN/MAX report unsupported
  // (never invent true). Cite: Conditions.cpp Meets CONDITION_REPUTATION_RANK_MIN/MAX.
  reputationRank?: (factionId: number) => number;
  // Player team id: ALLIANCE=469 or HORDE=67 (SharedDefines.h Team). Cite: Conditions.cpp CONDITION_TEAM —
  // GetTeam() == value1.
  team?: number;
  /** HonorRankInfo.rank 0..18. Absent → unsupported. Cite: Conditions.cpp:236-243. */
  pvpRank?: number;
  // Base skill value by skill line id; missing skill → 0 / not HasSkill. Cite: Conditions.cpp
  // CONDITION_SKILL — HasSkill && GetSkillValueBase >= value2.
  skillValue?: (skillId: number) => number | undefined;
  // Active game event ids (from GameEventMgr / domain/gameEvents). Cite: Conditions.cpp
  // CONDITION_ACTIVE_GAME_EVENT — IsActiveEvent(value1).
  activeEvents?: ReadonlySet<number> | readonly number[];
  // Active Holidays.dbc ids (any active game_event with that holiday_id). Cite: Conditions.cpp:318-321
  // IsActiveHoliday(HolidayIds(m_value1)).
  activeHolidays?: ReadonlySet<number> | readonly number[];
  /** Unit gender: 0 male, 1 female, 2 none. Cite: Conditions.h CONDITION_GENDER. */
  gender?: number;
  /** SOURCE creature last WP; absent fails closed. Cite: Conditions.cpp:413-423, :562-565. */
  lastReachedWaypoint?: number;
  // INSTANCE_SCRIPT (type 18): true when the instance meets that condition id. DM North: id N ⇔ N tribute
  // guards alive. Cite: instance_dire_maul.cpp:499-521.
  instanceCondition?: (conditionId: number) => boolean;
  /** CanTakeQuest(value1). Absent → unsupported. Cite: Conditions.cpp:295-298. */
  canTakeQuest?: (questId: number) => boolean;
  /** Type 31: DungeonEncounter id is done. Cite: Conditions.cpp:402-411 completedEncounterMask. */
  completedEncounter?: (encounterId: number) => boolean;
  // Alive creatures (entry + yards from the subject). Absent → type 37 unsupported. Cite:
  // Conditions.cpp:301-309; GridNotifiers.h onlyAlive + dist < range.
  aliveCreatures?: ReadonlyArray<{ entry: number; distance: number }>;
  /** Live spawned count for a creature entry. Cite: Map.cpp:2984-2986 SpawnedCountForEntry. */
  spawnedCountForEntry?: (entry: number) => number;
  // Map GetVariable(id). Missing snapshot → WORLDSTATE unsupported (never invent 0). Cite:
  // Conditions.cpp:496 map->GetVariableManager().GetVariable(m_value1).
  worldState?: (worldstateId: number) => number;
  // WORLD_SCRIPT (40): sWorldState.IsConditionFulfilled(value1, value2). Cite: Conditions.cpp:492-495;
  // WorldState.cpp:407.
  worldScript?: (conditionId: number, state: number) => boolean;
  /** DEAD_OR_AWAY: omit bag if unqueried; omit player/source when that pointer is null (away). */
  deadOrAway?: {
    player?: { alive: boolean; distToSource?: number };
    source?: { isUnit: boolean; alive: boolean };
  };
}

export interface ConditionEvalResult {
  ok: boolean;
  /** Condition types encountered that are not implemented. */
  unsupported: number[];
  reason?: string;
}

export type ConditionTable = ReadonlyMap<number, ConditionDef> | Readonly<Record<number, ConditionDef>>;

function hasInSet(set: ReadonlySet<number> | readonly number[] | undefined, id: number): boolean {
  if (!set) return false;
  if (Array.isArray(set)) return set.includes(id);
  return (set as ReadonlySet<number>).has(id);
}

function itemCount(
  items: ConditionSnapshot['items'],
  entry: number,
): number {
  if (!items) return 0;
  if (items instanceof Map) return items.get(entry) ?? 0;
  return (items as Record<number, number>)[entry] ?? 0;
}

function questState(
  quests: ConditionSnapshot['quests'],
  id: number,
): string {
  if (!quests) return 'none';
  if (quests instanceof Map) return quests.get(id) ?? 'none';
  return (quests as Record<number, string>)[id] ?? 'none';
}

function lookup(
  table: ConditionTable | undefined,
  id: number,
): ConditionDef | undefined {
  if (!table) return undefined;
  if (table instanceof Map) return table.get(id);
  return (table as Record<number, ConditionDef>)[id];
}

// Evaluate a condition by id (table lookup) or inline def. Recursive for AND/OR/NOT via value1/value2 ids
// or def.nested.
export function isConditionSatisfied(
  idOrDef: number | ConditionDef,
  snapshot: ConditionSnapshot,
  table?: ConditionTable,
): ConditionEvalResult {
  const unsupported: number[] = [];
  const ok = evalOne(idOrDef, snapshot, table, unsupported, new Set());
  return { ok, unsupported: [...new Set(unsupported)] };
}

function evalOne(
  idOrDef: number | ConditionDef,
  snapshot: ConditionSnapshot,
  table: ConditionTable | undefined,
  unsupported: number[],
  stack: Set<number>,
): boolean {
  let def: ConditionDef | undefined;
  let pushed: number | undefined;
  if (typeof idOrDef === 'number') {
    if (stack.has(idOrDef)) return false; // cycle guard
    stack.add(idOrDef);
    pushed = idOrDef;
    def = lookup(table, idOrDef);
    if (!def) {
      unsupported.push(idOrDef);
      stack.delete(pushed);
      return false;
    }
  } else {
    def = idOrDef;
    if (def.id) {
      if (stack.has(def.id)) return false;
      stack.add(def.id);
      pushed = def.id;
    }
  }

  let result = evalType(def, snapshot, table, unsupported, stack);

  if (def.flags != null && (def.flags & CONDITION_FLAG_REVERSE_RESULT) !== 0) {
    result = !result;
  }
  // A recursion STACK, not a visited set: conditions form a DAG, so one id legitimately sits on
  // several branches (row 2138 is reached fifteen times) and marking it visited poisoned the AND.
  if (pushed != null) stack.delete(pushed);
  return result;
}

function evalType(
  def: ConditionDef,
  snapshot: ConditionSnapshot,
  table: ConditionTable | undefined,
  unsupported: number[],
  stack: Set<number>,
): boolean {
  const t = def.type as ConditionTypeId;
  const v1 = (def.value1 ?? 0) | 0;
  const v2 = (def.value2 ?? 0) | 0;

  switch (t) {
    case CONDITION.NONE:
      return true;

    case CONDITION.AND: {
      const a = resolveNested(def, 0, v1, table);
      const b = resolveNested(def, 1, v2, table);
      if (!a || !b) {
        unsupported.push(CONDITION.AND);
        return false;
      }
      // value3 and value4 are further REQUIRED clauses, not decoration: 20 AND rows carry them, and
      // dropping one answers true where the server answers false. Cite: Conditions.cpp:167-178.
      for (const extra of extraClauses(def, table)) {
        if (!evalOne(extra, snapshot, table, unsupported, stack)) return false;
      }
      return evalOne(a, snapshot, table, unsupported, stack)
        && evalOne(b, snapshot, table, unsupported, stack);
    }

    case CONDITION.OR: {
      const a = resolveNested(def, 0, v1, table);
      const b = resolveNested(def, 1, v2, table);
      if (!a || !b) {
        unsupported.push(CONDITION.OR);
        return false;
      }
      // Cite: Conditions.cpp:157-165 — value3/value4 return true EARLY, before value1 || value2.
      for (const extra of extraClauses(def, table)) {
        if (evalOne(extra, snapshot, table, unsupported, stack)) return true;
      }
      return evalOne(a, snapshot, table, unsupported, stack)
        || evalOne(b, snapshot, table, unsupported, stack);
    }

    case CONDITION.NOT: {
      const a = resolveNested(def, 0, v1, table);
      if (!a) {
        unsupported.push(CONDITION.NOT);
        return false;
      }
      return !evalOne(a, snapshot, table, unsupported, stack);
    }

    case CONDITION.AURA:
      // value1 = spell_id (effindex ignored in this minimal port)
      return hasInSet(snapshot.auras, v1);

    case CONDITION.AD_COMMISSION_AURA:
      // Walk the player's auras; visual+attr fingerprint, not a hardcoded item id.
      // Cite: Conditions.cpp:228-234 GetSpellAuraHolderMap + SpellVisual == 3580.
      for (const id of AD_COMMISSION_AURA_SPELL_IDS) {
        if (hasInSet(snapshot.auras, id)) return true;
      }
      return false;

    case CONDITION.ITEM: {
      // An absent bag map answers false and stays that way: there is no inverted ITEM form in the
      // table, so "no supplier" and "you own none" give the same answer.
      const need = v2 > 0 ? v2 : 1;
      return itemCount(snapshot.items, v1) >= need;
    }

    case CONDITION.ITEM_WITH_BANK: {
      // value1 = item_id, value2 = count. Cite: Conditions.cpp:316-318 HasItemCount(v1, v2, true).
      const need = v2 > 0 ? v2 : 1;
      return itemCount(snapshot.items, v1) + itemCount(snapshot.bankItems, v1) >= need;
    }

    case CONDITION.ITEM_EQUIPPED:
      return hasInSet(snapshot.equipped, v1);

    case CONDITION.LEVEL: {
      // value1 = level, value2: 0 equal, 1 >=, 2 <=
      const lvl = snapshot.level;
      if (lvl == null) {
        unsupported.push(CONDITION.LEVEL);
        return false;
      }
      if (v2 === 1) return lvl >= v1;
      if (v2 === 2) return lvl <= v1;
      return lvl === v1;
    }

    case CONDITION.SPELL: {
      // No spellbook supplied is NOT an empty spellbook: 29 of the 33 baked rows are the inverted
      // form, so an absent set answered true for all of them and handed out unearned content.
      if (snapshot.knownSpells == null) {
        unsupported.push(CONDITION.SPELL);
        return false;
      }
      const has = hasInSet(snapshot.knownSpells, v1);
      return v2 === 1 ? !has : has;
    }

    case CONDITION.RACE_CLASS: {
      // value1 = race_mask, value2 = class_mask (0 mask = any)
      const raceOk = !v1 || ((snapshot.raceMask ?? 0) & v1) !== 0;
      const classOk = !v2 || ((snapshot.classMask ?? 0) & v2) !== 0;
      if (snapshot.raceMask == null && snapshot.classMask == null && (v1 || v2)) {
        unsupported.push(CONDITION.RACE_CLASS);
        return false;
      }
      return raceOk && classOk;
    }

    case CONDITION.QUESTREWARDED:
      return questState(snapshot.quests, v1) === 'rewarded';

    case CONDITION.QUESTTAKEN: {
      const st = questState(snapshot.quests, v1);
      // value2: 0 any active, 1 incomplete, 2 complete (not yet rewarded)
      if (st !== 'taken' && st !== 'complete') return false;
      if (v2 === 1) return st === 'taken';
      if (v2 === 2) return st === 'complete';
      return true;
    }

    case CONDITION.QUEST_NONE:
      return questState(snapshot.quests, v1) === 'none';

    case CONDITION.PVP_RANK: {
      // value1 = minrank, value2 = maxrank. Cite: Conditions.cpp:236-243.
      if (snapshot.pvpRank == null) {
        unsupported.push(CONDITION.PVP_RANK);
        return false;
      }
      return snapshot.pvpRank >= v1 && snapshot.pvpRank <= v2;
    }

    case CONDITION.IS_IN_COMBAT: {
      // value1: 0 = must be in combat, 1 = must be out of combat
      if (snapshot.inCombat == null) {
        unsupported.push(CONDITION.IS_IN_COMBAT);
        return false;
      }
      return v1 === 1 ? !snapshot.inCombat : snapshot.inCombat;
    }

    case CONDITION.AREAID: {
      // value1 = area_id, value2: 0 in area, 1 not in area (stub: exact id match)
      if (snapshot.areaId == null) {
        unsupported.push(CONDITION.AREAID);
        return false;
      }
      const inArea = snapshot.areaId === v1;
      return v2 === 1 ? !inArea : inArea;
    }

    case CONDITION.AREA_FLAG: {
      // value1 must-have bits, value2 must-not. Cite: Conditions.cpp:249-258.
      if (snapshot.areaFlags == null) {
        unsupported.push(CONDITION.AREA_FLAG);
        return false;
      }
      const flags = snapshot.areaFlags | 0;
      return (!v1 || (flags & v1) !== 0) && (!v2 || (flags & v2) === 0);
    }

    case CONDITION.REPUTATION_RANK_MIN: {
      // value1 = faction_id, value2 = min_rank. Player rank must be >= value2.
      // Cite: Conditions.cpp ~201–205.
      if (!snapshot.reputationRank) {
        unsupported.push(CONDITION.REPUTATION_RANK_MIN);
        return false;
      }
      return snapshot.reputationRank(v1) >= v2;
    }

    case CONDITION.REPUTATION_RANK_MAX: {
      // value1 = faction_id, value2 = max_rank. Player rank must be <= value2.
      // Cite: Conditions.cpp ~386–390.
      if (!snapshot.reputationRank) {
        unsupported.push(CONDITION.REPUTATION_RANK_MAX);
        return false;
      }
      return snapshot.reputationRank(v1) <= v2;
    }

    case CONDITION.TEAM: {
      // value1 = team (469 Alliance / 67 Horde). Cite: Conditions.cpp ~206–214.
      if (snapshot.team == null) {
        unsupported.push(CONDITION.TEAM);
        return false;
      }
      return snapshot.team === v1;
    }

    case CONDITION.SKILL: {
      // value1 = skill_id, value2 = min base value.
      // Cite: Conditions.cpp ~215–218 — HasSkill && GetSkillValueBase >= value2.
      if (!snapshot.skillValue) {
        unsupported.push(CONDITION.SKILL);
        return false;
      }
      const val = snapshot.skillValue(v1);
      if (val == null) return false; // !HasSkill
      return val >= v2;
    }

    case CONDITION.SKILL_BELOW: {
      // Cite: Conditions.cpp:377-385 — value2==1 → !HasSkill; else HasSkill && GetSkillValueBase < value2.
      if (!snapshot.skillValue) {
        unsupported.push(CONDITION.SKILL_BELOW);
        return false;
      }
      const val = snapshot.skillValue(v1);
      if (v2 === 1) return val == null;
      return val != null && val < v2;
    }

    case CONDITION.ACTIVE_GAME_EVENT: {
      // value1 = event_id. Cite: Conditions.cpp ~245–248.
      if (!snapshot.activeEvents) {
        unsupported.push(CONDITION.ACTIVE_GAME_EVENT);
        return false;
      }
      return hasInSet(snapshot.activeEvents, v1);
    }

    case CONDITION.ACTIVE_HOLIDAY: {
      // value1 = holiday_id. Cite: Conditions.cpp:318-321 — IsActiveHoliday(HolidayIds(m_value1)).
      if (v1 <= 0) return false;
      if (!snapshot.activeHolidays) {
        unsupported.push(CONDITION.ACTIVE_HOLIDAY);
        return false;
      }
      return hasInSet(snapshot.activeHolidays, v1);
    }

    case CONDITION.LAST_WAYPOINT: {
      // Cite: Conditions.cpp:413-423 — case 0 exact, 1 value1<=wp, 2 value1>wp; else false.
      const wp = snapshot.lastReachedWaypoint;
      if (wp == null) return false;
      if (v2 === 0) return v1 === wp;
      if (v2 === 1) return v1 <= wp;
      if (v2 === 2) return v1 > wp;
      return false;
    }

    case CONDITION.GENDER: {
      // value1 = 0 male / 1 female / 2 none. Cite: Conditions.cpp ~373–376.
      if (snapshot.gender == null) {
        unsupported.push(CONDITION.GENDER);
        return false;
      }
      return snapshot.gender === v1;
    }

    case CONDITION.INSTANCE_SCRIPT: {
      // value1 = INSTANCE_CONDITION_ID. Cite: Conditions.cpp CONDITION_INSTANCE_SCRIPT.
      if (!snapshot.instanceCondition) {
        unsupported.push(CONDITION.INSTANCE_SCRIPT);
        return false;
      }
      return snapshot.instanceCondition(v1);
    }

    case CONDITION.QUESTAVAILABLE: {
      // value1 = quest_id. Cite: Conditions.cpp:295-298 CanTakeQuest(GetQuestTemplate(value1), false).
      if (!snapshot.canTakeQuest) {
        unsupported.push(CONDITION.QUESTAVAILABLE);
        return false;
      }
      return snapshot.canTakeQuest(v1);
    }

    case CONDITION.COMPLETED_ENCOUNTER: {
      // value1 required, value2 optional OR. Cite: Conditions.cpp:392-411.
      if (!snapshot.completedEncounter) {
        unsupported.push(CONDITION.COMPLETED_ENCOUNTER);
        return false;
      }
      if (snapshot.completedEncounter(v1)) return true;
      return v2 !== 0 && snapshot.completedEncounter(v2);
    }

    case CONDITION.CREATURE_IN_RANGE: {
      // value1 = entry, value2 = range; alive only; dist < range. Cite: Conditions.cpp:301-309.
      if (!snapshot.aliveCreatures) {
        unsupported.push(CONDITION.CREATURE_IN_RANGE);
        return false;
      }
      return snapshot.aliveCreatures.some((c) => c.entry === v1 && c.distance < v2);
    }

    case CONDITION.SPAWN_COUNT: {
      // value1 = creatureId, value2 = min count. Cite: Conditions.cpp:488 SpawnedCountForEntry >= value2.
      if (!snapshot.spawnedCountForEntry) {
        unsupported.push(CONDITION.SPAWN_COUNT);
        return false;
      }
      return snapshot.spawnedCountForEntry(v1) >= v2;
    }


    case CONDITION.WORLD_SCRIPT: {
      // Cite: Conditions.cpp:492-495 — return sWorldState.IsConditionFulfilled(m_value1, m_value2).
      if (!snapshot.worldScript) {
        unsupported.push(CONDITION.WORLD_SCRIPT);
        return false;
      }
      return snapshot.worldScript(v1, v2);
    }

    case CONDITION.WORLDSTATE: {
      // value1 = id, value2 = op, value3 = operand. Cite: Conditions.cpp:494-497.
      if (!snapshot.worldState) {
        unsupported.push(CONDITION.WORLDSTATE);
        return false;
      }
      return checkOp(v2, snapshot.worldState(v1), (def.value3 ?? 0) | 0);
    }

    case CONDITION.DEAD_OR_AWAY: {
      // Cite: Conditions.cpp:431-463. !player/!source is away (true). Group/instance stay fail-closed.
      const units = snapshot.deadOrAway;
      if (!units) {
        unsupported.push(CONDITION.DEAD_OR_AWAY);
        return false;
      }
      if (v1 === 0) {
        const player = units.player;
        if (!player || !player.alive) return true;
        if (v2 && units.source) {
          const dist = player.distToSource;
          if (dist == null) {
            unsupported.push(CONDITION.DEAD_OR_AWAY);
            return false;
          }
          return dist > v2;
        }
        return false;
      }
      if (v1 === 3) {
        const source = units.source;
        return !source || !source.isUnit || !source.alive;
      }
      unsupported.push(CONDITION.DEAD_OR_AWAY);
      return false;
    }


    default:
      unsupported.push(Number(t));
      return false;
  }
}

/** The optional third/fourth clauses of an AND/OR row, in source order. */
function extraClauses(
  def: ConditionDef,
  table: ConditionTable | undefined,
): Array<ConditionDef | number> {
  const out: Array<ConditionDef | number> = [];
  for (const [slot, id] of [[2, def.value3 ?? 0], [3, def.value4 ?? 0]] as const) {
    if (!id && !def.nested?.[slot]) continue;
    const c = resolveNested(def, slot, id | 0, table);
    if (c) out.push(c);
  }
  return out;
}

function resolveNested(
  def: ConditionDef,
  nestedIndex: number,
  id: number,
  table: ConditionTable | undefined,
): ConditionDef | number | undefined {
  if (def.nested && def.nested[nestedIndex]) return def.nested[nestedIndex];
  if (id) return id;
  // Try table
  if (table && id) return lookup(table, id);
  return undefined;
}

// Thin cast/use gate: true when no condition, or condition is satisfied. Fights with no conditions are
// unaffected (always true).
export function passesConditionGate(
  spell: { conditionId?: number; condition?: ConditionDef },
  snapshot: ConditionSnapshot,
  table?: ConditionTable,
): ConditionEvalResult {
  if (spell.condition) {
    return isConditionSatisfied(spell.condition, snapshot, table);
  }
  if (spell.conditionId != null && spell.conditionId !== 0) {
    return isConditionSatisfied(spell.conditionId, snapshot, table);
  }
  return { ok: true, unsupported: [] };
}

// The spell-area fitness hook: zone plus an optional condition only, since the full spell_area bake is
// optional. Returns a reason on a zone mismatch and never auto-casts. Cite: SpellMgr.h SpellArea.
function isSpellAreaFitToRequirements(
  req: {
    areaId?: number;
    /** If set, must match snapshot.areaId (or be absent for global). */
    questStart?: number;
    questEnd?: number;
    conditionId?: number;
    condition?: ConditionDef;
    /** gender / race / etc. left for future ETL */
    raceMask?: number;
    gender?: number;
  },
  snapshot: ConditionSnapshot,
  table?: ConditionTable,
): ConditionEvalResult {
  if (req.areaId != null && req.areaId !== 0) {
    if (snapshot.areaId == null) {
      return { ok: false, unsupported: [CONDITION.AREAID], reason: 'area unknown' };
    }
    if (snapshot.areaId !== req.areaId) {
      return { ok: false, unsupported: [], reason: 'area mismatch' };
    }
  }
  if (req.raceMask && snapshot.raceMask != null) {
    if ((snapshot.raceMask & req.raceMask) === 0) {
      return { ok: false, unsupported: [], reason: 'race mismatch' };
    }
  }
  if (req.condition || (req.conditionId != null && req.conditionId !== 0)) {
    return passesConditionGate(
      { condition: req.condition, conditionId: req.conditionId },
      snapshot,
      table,
    );
  }
  return { ok: true, unsupported: [] };
}
