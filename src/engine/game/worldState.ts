/** sWorldState.IsConditionFulfilled — WORLD_SCRIPT (40) host. Cite: WorldState.cpp:407-438. */

/** Cite: WorldState.h:69 Conditions WAR_EFFORT_DAYS_LEFT = 2113. */
export const WAR_EFFORT_DAYS_LEFT = 2113;

/** Cite: Common.h:113-122 TimeConstants DAY = HOUR * 24; IN_MILLISECONDS = 1000. */
const DAY = 86400;
const IN_MILLISECONDS = 1000;

/** Cite: WorldStateDefines.h:141-146 WORLD_STATE_SCOURGE_* zone icons. */
const WORLD_STATE_SCOURGE_WINTERSPRING = 2259;
const WORLD_STATE_SCOURGE_AZSHARA = 2260;
const WORLD_STATE_SCOURGE_BLASTED_LANDS = 2261;
const WORLD_STATE_SCOURGE_BURNING_STEPPES = 2262;
const WORLD_STATE_SCOURGE_TANARIS = 2263;
const WORLD_STATE_SCOURGE_EASTERN_PLAGUELANDS = 2264;

/** Cite: WorldState.h:247-253 SIRemaining ordinals. */
const SI_REMAINING_AZSHARA = 0;
const SI_REMAINING_BLASTED_LANDS = 1;
const SI_REMAINING_BURNING_STEPPES = 2;
const SI_REMAINING_EASTERN_PLAGUELANDS = 3;
const SI_REMAINING_TANARIS = 4;
const SI_REMAINING_WINTERSPRING = 5;

/** aqWorldstateMap NOW ids in AQResources order. Cite: WorldState.cpp:32-64, :99-100. */
const AQ_WORLDSTATE_NOW: readonly number[] = [
  2021, 2095, 2005, 2079, 2050, 2066, 2008, 2085, 2073, 2105,
  2060, 2076, 2063, 2047, 2092, 2002, 2098, 2082, 2011, 2057,
  1997, 2053, 2069, 2101, 2088, 2018, 2054, 2070, 2102, 2089,
];

/** Cite: WorldState.cpp:66-93 aqWorldStateTotalsMap[].second. */
const AQ_WORLDSTATE_TOTALS: readonly number[] = [
  96000, 10000, 22000, 250000, 19000, 60000, 18000, 250000, 60000, 10000,
  180000, 800000, 110000, 33000, 14000, 28000, 20000, 600000, 24000, 20000,
  45000, 13000, 40000, 8500, 200000,
];

const AQ_NOW_TO_RESOURCE: ReadonlyMap<number, number> = new Map(
  AQ_WORLDSTATE_NOW.map((now, resource) => [now, resource]),
);

/** Fields WorldState.cpp:407-438 reads. Absent → C++ ctor zeros (timer 0, counters 0, SI 0). */
export type WorldStateView = {
  /** AhnQirajData.m_timer. Cite: WorldState.h:207; GetDaysRemaining WorldState.cpp:1008-1010. */
  aqTimerMs?: number;
  /** m_WarEffortCounters[RESOURCE_MAX]. Cite: WorldState.h:208. */
  warEffortCounters?: readonly number[];
  /** m_siData.m_remaining[SI_REMAINING_MAX]. Cite: WorldState.h:289; WorldState.cpp:1184-1186. */
  siRemaining?: readonly number[];
  /** m_transportStates. Cite: WorldState.cpp:438. */
  transportStates?: Readonly<Record<number, number>>;
};

/** Cite: WorldState.cpp:1008-1010 uint32(m_timer / (DAY * IN_MILLISECONDS)) + 1. */
export function getDaysRemaining(view?: WorldStateView): number {
  return ((view?.aqTimerMs ?? 0) / (DAY * IN_MILLISECONDS) | 0) + 1;
}

/** WorldState::IsConditionFulfilled(conditionId, state). Cite: WorldState.cpp:407-438. */
export function isConditionFulfilled(
  conditionId: number,
  state: number,
  view?: WorldStateView,
): boolean {
  if (conditionId === WAR_EFFORT_DAYS_LEFT) return getDaysRemaining(view) === state;

  const resource = AQ_NOW_TO_RESOURCE.get(conditionId);
  if (resource != null) {
    let id = resource;
    if (id >= AQ_WORLDSTATE_TOTALS.length) id -= 5;
    const counter = view?.warEffortCounters?.[id] ?? 0;
    return counter === (AQ_WORLDSTATE_TOTALS[id] ?? 0);
  }

  // Cite: WorldState.cpp:421-436 GetSIRemaining(SI_REMAINING_*) > 0.
  const remaining = view?.siRemaining;
  switch (conditionId) {
    case WORLD_STATE_SCOURGE_WINTERSPRING:
      return (remaining?.[SI_REMAINING_WINTERSPRING] ?? 0) > 0;
    case WORLD_STATE_SCOURGE_AZSHARA:
      return (remaining?.[SI_REMAINING_AZSHARA] ?? 0) > 0;
    case WORLD_STATE_SCOURGE_BLASTED_LANDS:
      return (remaining?.[SI_REMAINING_BLASTED_LANDS] ?? 0) > 0;
    case WORLD_STATE_SCOURGE_BURNING_STEPPES:
      return (remaining?.[SI_REMAINING_BURNING_STEPPES] ?? 0) > 0;
    case WORLD_STATE_SCOURGE_TANARIS:
      return (remaining?.[SI_REMAINING_TANARIS] ?? 0) > 0;
    case WORLD_STATE_SCOURGE_EASTERN_PLAGUELANDS:
      return (remaining?.[SI_REMAINING_EASTERN_PLAGUELANDS] ?? 0) > 0;
    default:
      break;
  }

  // Cite: WorldState.cpp:438 m_transportStates.at(conditionId) == state. Missing key: fail closed.
  const stored = view?.transportStates?.[conditionId];
  return stored != null && stored === state;
}

/** Conditions.h ConditionOperation — DO NOT ALTER. Cite: pin de8f72993b9e1faa1bf92dd5505f3daec5cea3ce. */
export const CONDITION_OP = {
  NONE: 0,
  EQUAL_TO: 1,
  NOT_EQUAL_TO: 2,
  LESS_THAN: 3,
  LESS_THAN_OR_EQUAL_TO: 4,
  GREATER_THAN: 5,
  GREATER_THAN_OR_EQUAL_TO: 6,
} as const;

/** Cite: Conditions.cpp:132-145 CheckOp — NONE / unknown → true. */
export function checkOp(op: number, value: number, operand: number): boolean {
  switch (op | 0) {
    case CONDITION_OP.EQUAL_TO: return value === operand;
    case CONDITION_OP.NOT_EQUAL_TO: return value !== operand;
    case CONDITION_OP.LESS_THAN: return value < operand;
    case CONDITION_OP.LESS_THAN_OR_EQUAL_TO: return value <= operand;
    case CONDITION_OP.GREATER_THAN: return value > operand;
    case CONDITION_OP.GREATER_THAN_OR_EQUAL_TO: return value >= operand;
    default: return true;
  }
}

/** Cite: WorldStateVariableManager.cpp:45-50 — missing id → 0. */
export function getVariable(vars: Readonly<Record<number, number>> | undefined, id: number): number {
  if (!vars) return 0;
  return (vars[id | 0] ?? 0) | 0;
}

/** Cite: WorldStateVariableManager.cpp:62-70 — no-op when unchanged. */
export function setVariable(vars: Record<number, number>, id: number, value: number): void {
  const i = id | 0;
  const v = value | 0;
  if (((vars[i] ?? 0) | 0) === v) return;
  vars[i] = v;
}

export function ensureWorldStates(vars: Record<number, number> | undefined): Record<number, number> {
  return vars ?? {};
}

// SCRIPT_COMMAND_SET_WORLDSTATE (53) absolute write. Cite: ScriptMgr.cpp:3264-3267 textId[0]=id
// textId[1]=value.
export function applyWorldStateWrites(
  vars: Record<number, number>,
  writes: Readonly<Record<number, number>> | undefined,
): void {
  if (!writes) return;
  for (const [k, v] of Object.entries(writes)) {
    setVariable(vars, Number(k) | 0, (v as number) | 0);
  }
}

/** Snapshot suppliers: map GetVariable (42) + sWorldState.IsConditionFulfilled (40). */
export function worldStateConditionFns(
  vars: Readonly<Record<number, number>> | undefined,
): {
  worldState: (id: number) => number;
  worldScript: typeof isConditionFulfilled;
} {
  return {
    worldState: (id) => getVariable(vars, id),
    worldScript: isConditionFulfilled,
  };
}
