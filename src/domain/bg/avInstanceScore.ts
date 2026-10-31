/**
 * Alterac Valley's reinforcement race, for the instance surface.
 *
 * `av.ts` runs the full battleground on `BgWorld` — nodes, mines, graveyard cycle, the lot. The
 * raid surface has none of that machinery and does not need most of it: on a push the score moves
 * on exactly three things, and all three are already state the instance run keeps.
 *
 *   - a tower falls        -75  its owner   (BattleGroundAV.h:62 BG_AV_RES_TOWER)
 *   - a captain dies      -100  their team  (BattleGroundAV.h:57 BG_AV_RES_CAPTAIN)
 *   - one of yours dies     -1  your team   (BattleGroundAV.cpp:38-45 HandleKillPlayer)
 *
 * and the general's death ends it outright (BattleGroundAV.cpp:57), which on this surface IS the
 * run completing, because the general is the last encounter.
 *
 * So this is a PURE READ of the run: the cleared encounter ids give the enemy's losses and
 * `avDeaths` gives yours. Nothing here ticks, holds state, or has to be kept in sync — a re-mount
 * recomputes the same number from the same `defeated` list.
 *
 * NOT MODELLED HERE, and deliberately: the mines' one-reinforcement-per-45s tick and node capture
 * (BattleGroundAV.cpp:319-341, :645/:687). Those need an owner per node and a clock, which is the
 * battleground screen's job and the next thing to port.
 */

import type { InstanceDef } from '../../data/schema/encounter.ts';
import type { InstanceRun } from '../../world/instances.ts';
import { isCleared } from '../../world/instances.ts';
import {
  AV_RES_CAPTAIN, AV_RES_TOWER, AV_SCORE_INITIAL_POINTS, AV_SCORE_NEAR_LOSE,
} from './av.ts';
import type { AvTeam } from '../../data/alteracValley.ts';
import { avMineBoard, avNodeBoard } from './avInstanceNodes.ts';
import { avEnemyStateAt, type AvEnemyState } from './avEnemyPush.ts';

export interface AvInstanceScore {
  /** The side the player's raid is on — the def's own wing. */
  team: AvTeam;
  foe: AvTeam;
  /** Reinforcements left, both sides, against `initial`. */
  own: number;
  enemy: number;
  initial: number;
  /** Under BG_AV_NEAR_LOSE — the point the client starts warning. */
  ownNearLose: boolean;
  enemyNearLose: boolean;
  /** Towers of the foe's this raid has taken, and whether the captain is down. */
  towersDown: number;
  captainDown: boolean;
  /** Graveyards this side holds outright, and mines paying into `own`. */
  graveyardsHeld: number;
  minesHeld: number;
  /** The other side's push: what they have taken, what they are on, and whether they won. */
  enemyPush: AvEnemyState;
}

/** An AV wing def, by the id `alterac-valley.ts` builds. */
export function isAvInstance(instanceId: string): boolean {
  return instanceId === 'alterac-valley-alliance' || instanceId === 'alterac-valley-horde';
}

function teamOf(def: InstanceDef): AvTeam | null {
  if (!isAvInstance(def.id)) return null;
  return def.wing === 'horde' ? 'horde' : 'alliance';
}

/**
 * The reinforcement race for this run, or null when the def is not an AV wing.
 *
 * Encounter ids are `captain-<entry>` / `lieutenant-<entry>` / `general-<entry>`, which
 * `commandersOf` builds off the creature entry — the DB's own key, stable across bakes.
 */
export function avInstanceScore(
  def: InstanceDef,
  run: InstanceRun,
  /** Run clock, ms. Drives the enemy push; omit for a board with no opposing raid. */
  elapsedMs = 0,
): AvInstanceScore | null {
  const team = teamOf(def);
  if (!team) return null;
  const foe: AvTeam = team === 'alliance' ? 'horde' : 'alliance';

  let towersDown = 0;
  let captainDown = false;
  for (const enc of def.encounters) {
    if (!isCleared(run, enc.id)) continue;
    if (enc.id.startsWith('lieutenant-')) towersDown++;
    else if (enc.id.startsWith('captain-')) captainDown = true;
  }

  const enemy = Math.max(
    0,
    AV_SCORE_INITIAL_POINTS - towersDown * AV_RES_TOWER - (captainDown ? AV_RES_CAPTAIN : 0),
  );
  // Your own bar: one off per death, one BACK per mine tick you have banked. Cite:
  // BattleGroundAV.cpp:38-45 HandleKillPlayer; :319-341 the 45 s mine tick. Never above the start,
  // because UpdateScore clamps and a side cannot bank past its opening reinforcements.
  // ...and the other side's push takes YOUR towers and captain on its own clock, which is what
  // makes this a race rather than a one-sided countdown. avEnemyPush.ts owns that cursor.
  const push = avEnemyStateAt(team, elapsedMs);
  const own = Math.max(0, Math.min(
    AV_SCORE_INITIAL_POINTS,
    AV_SCORE_INITIAL_POINTS
      - Math.max(0, run.avDeaths ?? 0)
      - push.costSoFar
      + Math.max(0, run.avMineIncome ?? 0),
  ));

  const board = avNodeBoard(run);
  const mines = avMineBoard(run);
  return {
    enemyPush: push,
    graveyardsHeld: board.filter((n) => n.owner === team && n.state === 'owned').length,
    minesHeld: mines.filter((m) => m.owner === team).length,
    team,
    foe,
    own,
    enemy,
    initial: AV_SCORE_INITIAL_POINTS,
    ownNearLose: own < AV_SCORE_NEAR_LOSE,
    enemyNearLose: enemy < AV_SCORE_NEAR_LOSE,
    towersDown,
    captainDown,
  };
}
