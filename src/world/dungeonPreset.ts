/**
 * Dungeon run pacing constants (COMBAT-INTERACTION-V2 S4).
 *
 * The pace PRESET layer (DungeonPacePreset, DUNGEON_PACE_PRESETS and its tooltip/label
 * maps, dungeonPaceTriple, matchDungeonPacePreset) was deleted 2026-08-17: the segmented
 * control it fed came out of worldView and instanceView as inert, nothing ever passed a
 * `pacePreset`, and the map's only remaining job was re-deriving DEFAULT_ROUTE_DENSITY
 * and DEFAULT_PULL_FUSION, which `enterRun` now reads straight from dungeonRoute.ts.
 *
 * Pure: no DOM, no Date.now, no Math.random (LOCK 4).
 */

import type { SquadStrategy } from '../domain/bots/squad.ts';

// Default ready-gate action seeded by rest strategy (player still decides each gap). sip → keep chaining
// (Pull); careful/aggressive → recover first (Drink).
export function defaultReadyGateAction(
  restStrategy: SquadStrategy | null | undefined,
): 'drink' | 'pull' {
  return restStrategy === 'sip' ? 'pull' : 'drink';
}

/**
 * Wipe caps — how many times a run retries one pull, and how many wipes end the run.
 *
 * Product decisions, not sourced numbers: 3 attempts at one pull, 8 wipes across a run, so an
 * unwinnable pull terminates instead of spinning. Each retry runs a FRESH encounter session, so
 * the pack is back at full health — no grinding one pack down across wipes.
 *
 * They live here because BOTH the headless runner (`runFullDungeon`, engine) and the live floor
 * (`livePullLifecycle`, ui) enforce them, and the engine cannot import from ui. They were two
 * independent copies of 3/8 until 2026-08-14 and would have drifted apart silently.
 */
export const WIPE_RETRY_PER_PULL = 3;
export const WIPE_CAP_PER_RUN = 8;
