// "You are in a battleground", as GameState holds it: identity only — which BG, team, seat and seed.
// The live world is rebuilt when the screen mounts, since a match no more survives a reload.

import type { BgTeam, BgUnitId } from '../bg/types.ts';
import { WSG_GEOMETRY } from '../bg/wsg.ts';
import type { BgTierId } from '../bg/bgTier.ts';

export type BattlegroundId = 'wsg' | 'ab' | 'av' | 'arena1' | 'arena2' | 'arena3' | 'arena5';

// How the match is decided. `objective` is the three 1.12 battlegrounds, played on a BgWorld;
// `arena` is last team standing on the combat surface (`game.arenaDuel` / `game.arenaMatch`) and is
// a PRODUCT RULE - arenas arrived in 2.0.
export type BgMode = 'objective' | 'arena';

export interface BattlegroundDef {
  id: BattlegroundId;
  name: string;
  mode: BgMode;
  mapId: number;
  /** MaxPlayersPerTeam / bracket. Cite: battleground_template id 2 / 3. */
  teamSize: number;
  minLevel: number;
  maxLevel: number;
  /** StartMaxDist, yards — the gate leash before the match opens. */
  startMaxDist: number;
  /** Shipped bake in public/maps/bake/ — the rendered playfield the screen draws on. */
  bakeSlug: string;
}

// How far apart the two arena teams open. Read by `seedDuelGeometry` (combatSeed.ts:161) as the
// primary contact distance: 24 yd on purpose, so both teams open already engaged instead of idling.
export const ARENA_START: Readonly<Record<BgTeam, { x: number; y: number; z?: number }>> =
  Object.freeze({
    alliance: { x: WSG_GEOMETRY.mid.x - 12, y: WSG_GEOMETRY.mid.y },
    horde: { x: WSG_GEOMETRY.mid.x + 12, y: WSG_GEOMETRY.mid.y },
  });

// The brackets, built rather than repeated since they differ only in team size. Every one of them
// mounts the combat surface as an auto-battler fight, so the map fields below are unread: an arena
// has no plate, no gate leash and no BgWorld (`enterBattleground` refuses mode 'arena').
function arenaDefs(): Record<'arena1' | 'arena2' | 'arena3' | 'arena5', BattlegroundDef> {
  const one = (n: 1 | 2 | 3 | 5): BattlegroundDef => ({
    id: `arena${n}` as BattlegroundId,
    name: n === 1 ? 'Duel, 1v1' : `Arena ${n}v${n}`,
    mode: 'arena',
    mapId: 489,
    teamSize: n,
    minLevel: 10,
    maxLevel: 60,
    // No gate leash: an arena has no tunnel to hold anyone in.
    startMaxDist: 0,
    bakeSlug: 'warsong-gulch',
  });
  return { arena1: one(1), arena2: one(2), arena3: one(3), arena5: one(5) };
}

export const BATTLEGROUNDS: Readonly<Record<BattlegroundId, BattlegroundDef>> = Object.freeze({
  wsg: {
    id: 'wsg',
    name: 'Warsong Gulch',
    mode: 'objective',
    mapId: 489,
    teamSize: 10,
    minLevel: 10,
    maxLevel: 60,
    startMaxDist: 75,
    bakeSlug: 'warsong-gulch',
  },
  // Cite: battleground_template id 3; BattleGroundAB.h; domain/bg/ab.ts installAb.
  ab: {
    id: 'ab',
    name: 'Arathi Basin',
    mode: 'objective',
    mapId: 529,
    teamSize: 15,
    minLevel: 20,
    maxLevel: 60,
    startMaxDist: 75,
    bakeSlug: 'arathi-basin',
  },
  // Cite: battleground_template id 1; BattleGroundAV.h; domain/bg/av.ts installAv. The one BG whose
  // field is creatures as well as players — 15 capture points, two mines and two generals.
  av: {
    id: 'av',
    name: 'Alterac Valley',
    mode: 'objective',
    mapId: 30,
    teamSize: 40,
    minLevel: 51,
    maxLevel: 60,
    startMaxDist: 100,
    bakeSlug: 'alterac-valley',
  },
  // Arena. PRODUCT RULE, all of it: 1.12 has no arena, so there is no template row to cite and no map
  // of its own. The names are factual bracket sizes, not lore.
  ...arenaDefs(),
});

export interface BattlegroundRun {
  bgId: BattlegroundId;
  team: BgTeam;
  /** The seat the player drives (§6e cockpit) — a BgUnitId in the built roster. */
  selfId: BgUnitId;
  teamSize: number;
  /** Seeds the whole deterministic match, so the same join replays identically. */
  seed: number;
  /** Difficulty tier (§0 Freemade→Apes) — gates the enemy kit + strategy cadence. */
  tier: BgTierId;
  /** Companion ids you bring (squad + roster picks); mercs backfill to teamSize. */
  allies: string[];
}
