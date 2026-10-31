// OutdoorPvP worldstate writers for Silithus and Eastern Plaguelands, writing only the sourced ids.
// Only the initial fill has a game caller: no GO-use or area trigger reaches the mutators in play.

import { getVariable, setVariable } from './worldState.ts';

/** Cite: SharedDefines.h:1918-1919. */
export const WORLD_STATE_REMOVE = 0;
export const WORLD_STATE_ADD = 1;

/** Cite: SharedDefines.h Team. */
export const TEAM_NONE = 0;
export const TEAM_HORDE = 67;
export const TEAM_ALLIANCE = 469;

/** Cite: WorldStateDefines.h:159-161. */
export const WORLD_STATE_SI_GATHERED_A = 2313;
export const WORLD_STATE_SI_GATHERED_H = 2314;
export const WORLD_STATE_SI_SILITHYST_MAX = 2317;

/** Cite: OutdoorPvPSI.h:57 MAX_SILITHYST = 200. */
export const MAX_SILITHYST = 200;

/** Cite: OutdoorPvPSI.h:49-50. */
export const AREATRIGGER_SILITHUS_ALLIANCE = 4162;
export const AREATRIGGER_SILITHUS_HORDE = 4168;

/** Cite: OutdoorPvPSI.h:34-35 mound / geyser. */
export const GO_SILITHYST_MOUND = 181597;
export const GO_SILITHYST_GEYSER = 181598;

/** Cite: OutdoorPvPSI.h:39 SPELL_SILITHYST. */
export const SPELL_SILITHYST = 29519;

/** Cite: WorldStateDefines.h:40-73. */
export const WORLD_STATE_EP_TOWER_COUNT_ALLIANCE = 2327;
export const WORLD_STATE_EP_TOWER_COUNT_HORDE = 2328;
export const WORLD_STATE_EP_PLAGUEWOOD_ALLIANCE = 2370;
export const WORLD_STATE_EP_PLAGUEWOOD_HORDE = 2371;
export const WORLD_STATE_EP_PLAGUEWOOD_NEUTRAL = 2353;
export const WORLD_STATE_EP_NORTHPASS_ALLIANCE = 2372;
export const WORLD_STATE_EP_NORTHPASS_HORDE = 2373;
export const WORLD_STATE_EP_NORTHPASS_NEUTRAL = 2352;
export const WORLD_STATE_EP_EASTWALL_ALLIANCE = 2354;
export const WORLD_STATE_EP_EASTWALL_HORDE = 2356;
export const WORLD_STATE_EP_EASTWALL_NEUTRAL = 2361;
export const WORLD_STATE_EP_CROWNGUARD_ALLIANCE = 2378;
export const WORLD_STATE_EP_CROWNGUARD_HORDE = 2379;
export const WORLD_STATE_EP_CROWNGUARD_NEUTRAL = 2355;

/** Cite: OutdoorPvPEP.h:29-33. */
export const TOWER_ID_NORTHPASS = 0;
export const TOWER_ID_CROWNGUARD = 1;
export const TOWER_ID_EASTWALL = 2;
export const TOWER_ID_PLAGUEWOOD = 3;
export const MAX_EP_TOWERS = 4;

/** Cite: OutdoorPvPEP.h:88-91 capture-point GOs. */
export const GO_TOWER_BANNER_NORTHPASS = 181899;
export const GO_TOWER_BANNER_CROWNGUARD = 182096;
export const GO_TOWER_BANNER_EASTWALL = 182097;
export const GO_TOWER_BANNER_PLAGUEWOOD = 182098;

/** Neutral / Alliance / Horde worldstate per tower. Cite: OutdoorPvPEP.cpp:33-36 + Defines. */
const EP_TOWER_STATES: ReadonlyArray<readonly [number, number, number]> = [
  [WORLD_STATE_EP_NORTHPASS_NEUTRAL, WORLD_STATE_EP_NORTHPASS_ALLIANCE, WORLD_STATE_EP_NORTHPASS_HORDE],
  [WORLD_STATE_EP_CROWNGUARD_NEUTRAL, WORLD_STATE_EP_CROWNGUARD_ALLIANCE, WORLD_STATE_EP_CROWNGUARD_HORDE],
  [WORLD_STATE_EP_EASTWALL_NEUTRAL, WORLD_STATE_EP_EASTWALL_ALLIANCE, WORLD_STATE_EP_EASTWALL_HORDE],
  [WORLD_STATE_EP_PLAGUEWOOD_NEUTRAL, WORLD_STATE_EP_PLAGUEWOOD_ALLIANCE, WORLD_STATE_EP_PLAGUEWOOD_HORDE],
];

const EP_TOWER_GO: readonly number[] = [
  GO_TOWER_BANNER_NORTHPASS,
  GO_TOWER_BANNER_CROWNGUARD,
  GO_TOWER_BANNER_EASTWALL,
  GO_TOWER_BANNER_PLAGUEWOOD,
];

function epStateForTeam(towerId: number, team: number): number {
  const row = EP_TOWER_STATES[towerId]!;
  if (team === TEAM_ALLIANCE) return row[1]!;
  if (team === TEAM_HORDE) return row[2]!;
  return row[0]!;
}

function epOwnerOf(vars: Readonly<Record<number, number>>, towerId: number): number {
  const row = EP_TOWER_STATES[towerId]!;
  if (getVariable(vars, row[1]!) === WORLD_STATE_ADD) return TEAM_ALLIANCE;
  if (getVariable(vars, row[2]!) === WORLD_STATE_ADD) return TEAM_HORDE;
  return TEAM_NONE;
}

// Cite: OutdoorPvPSI.cpp:38-46 + OutdoorPvPEP.cpp:45-54. SI counters 0, max 200; EP four towers Neutral
// ADD, counts 0.
export function fillOutdoorPvpInitialWorldStates(vars: Record<number, number>): void {
  setVariable(vars, WORLD_STATE_SI_GATHERED_A, 0);
  setVariable(vars, WORLD_STATE_SI_GATHERED_H, 0);
  setVariable(vars, WORLD_STATE_SI_SILITHYST_MAX, MAX_SILITHYST);
  setVariable(vars, WORLD_STATE_EP_TOWER_COUNT_ALLIANCE, 0);
  setVariable(vars, WORLD_STATE_EP_TOWER_COUNT_HORDE, 0);
  for (const [neutral, ally, horde] of EP_TOWER_STATES) {
    setVariable(vars, neutral, WORLD_STATE_ADD);
    setVariable(vars, ally, WORLD_STATE_REMOVE);
    setVariable(vars, horde, WORLD_STATE_REMOVE);
  }
}

function isSilithystCarryGo(entry: number): boolean {
  const e = entry | 0;
  return e === GO_SILITHYST_MOUND || e === GO_SILITHYST_GEYSER;
}

function silithystTeamForAreaTrigger(triggerId: number): number | undefined {
  const t = triggerId | 0;
  if (t === AREATRIGGER_SILITHUS_ALLIANCE) return TEAM_ALLIANCE;
  if (t === AREATRIGGER_SILITHUS_HORDE) return TEAM_HORDE;
  return undefined;
}

function epTowerIdForBanner(entry: number): number | undefined {
  const i = EP_TOWER_GO.indexOf(entry | 0);
  return i >= 0 ? i : undefined;
}

/** GO-use host for EP tower banners. Cite: OutdoorPvPEP.cpp:223-337 ProcessCaptureEvent. */
export function applyEpTowerCaptureFromGoUse(
  vars: Record<number, number>,
  goEntry: number,
  team: number,
): boolean {
  const id = epTowerIdForBanner(goEntry);
  if (id == null) return false;
  return processEpTowerCapture(vars, id, team);
}

// Silithyst turn-in; the caller has already checked team, liveness and the aura. At the maximum both
// counters reset to 0, as the core does. Cite: OutdoorPvPSI.cpp:70-149.
export function handleSilithystTurnIn(vars: Record<number, number>, team: number): boolean {
  if (team === TEAM_ALLIANCE) {
    const next = getVariable(vars, WORLD_STATE_SI_GATHERED_A) + 1;
    setVariable(vars, WORLD_STATE_SI_GATHERED_A, next);
    if (next === MAX_SILITHYST) {
      setVariable(vars, WORLD_STATE_SI_GATHERED_A, 0);
      setVariable(vars, WORLD_STATE_SI_GATHERED_H, 0);
    }
    return true;
  }
  if (team === TEAM_HORDE) {
    const next = getVariable(vars, WORLD_STATE_SI_GATHERED_H) + 1;
    setVariable(vars, WORLD_STATE_SI_GATHERED_H, next);
    if (next === MAX_SILITHYST) {
      setVariable(vars, WORLD_STATE_SI_GATHERED_A, 0);
      setVariable(vars, WORLD_STATE_SI_GATHERED_H, 0);
    }
    return true;
  }
  return false;
}

// Tower capture / loss. Cite: OutdoorPvPEP.cpp:223-337 ProcessCaptureEvent. `team` ALLIANCE/HORDE captures;
// TEAM_NONE returns the tower to Neutral.
function processEpTowerCapture(
  vars: Record<number, number>,
  towerId: number,
  team: number,
): boolean {
  const id = towerId | 0;
  if (id < 0 || id >= MAX_EP_TOWERS) return false;
  const prev = epOwnerOf(vars, id);
  if (prev === team) return false;

  if (team === TEAM_ALLIANCE) {
    setVariable(vars, WORLD_STATE_EP_TOWER_COUNT_ALLIANCE, getVariable(vars, WORLD_STATE_EP_TOWER_COUNT_ALLIANCE) + 1);
  } else if (team === TEAM_HORDE) {
    setVariable(vars, WORLD_STATE_EP_TOWER_COUNT_HORDE, getVariable(vars, WORLD_STATE_EP_TOWER_COUNT_HORDE) + 1);
  } else if (prev === TEAM_ALLIANCE) {
    setVariable(vars, WORLD_STATE_EP_TOWER_COUNT_ALLIANCE, getVariable(vars, WORLD_STATE_EP_TOWER_COUNT_ALLIANCE) - 1);
  } else if (prev === TEAM_HORDE) {
    setVariable(vars, WORLD_STATE_EP_TOWER_COUNT_HORDE, getVariable(vars, WORLD_STATE_EP_TOWER_COUNT_HORDE) - 1);
  }

  const row = EP_TOWER_STATES[id]!;
  setVariable(vars, row[0]!, WORLD_STATE_REMOVE);
  setVariable(vars, row[1]!, WORLD_STATE_REMOVE);
  setVariable(vars, row[2]!, WORLD_STATE_REMOVE);
  setVariable(vars, epStateForTeam(id, team), WORLD_STATE_ADD);
  return true;
}
