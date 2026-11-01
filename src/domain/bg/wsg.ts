// Warsong Gulch (map 489). Every constant is sourced — BattleGroundWS.h:29-31, :54-59, :124-130,
// battleground_template 2, world_safe_locs 769-772. Carrying the flag IS aura 23333 / 23335.

import type { BgPos, BgTeam, BgUnit } from './types.ts';
import { OTHER_TEAM } from './types.ts';
import type { BgWorld } from './bgWorld.ts';
import { detHypot } from '../../engine/core/detMath.ts';

/** Cite: BattleGroundWS.h:29-31 enum WSTimers. */
export const WS_MAX_TEAM_SCORE = 3;
export const WS_FLAG_RESPAWN_MS = 23_000;
export const WS_FLAG_DROP_MS = 10_000;

/** Cite: BattleGroundWS.h:54-59 enum WSSpells. */
export const WS_SPELL_WARSONG_FLAG = 23333;
export const WS_SPELL_WARSONG_FLAG_DROPPED = 23334;
export const WS_SPELL_SILVERWING_FLAG = 23335;
export const WS_SPELL_SILVERWING_FLAG_DROPPED = 23336;

/** Cite: BattleGroundWS.h:124-130 enum WSGameObjects. */
export const GO_WS_SILVERWING_FLAG = 179830;
export const GO_WS_WARSONG_FLAG = 179831;
export const GO_WS_SILVERWING_FLAG_DROP = 179785;
export const GO_WS_WARSONG_FLAG_DROP = 179786;

/** Cite: BattleGroundWS.h:186-187. Index by bgBracketId(level, 10, 60). */
export const WS_FLAG_CAPTURED_HONOR = [48, 82, 136, 226, 378, 396] as const;
export const WS_WIN_MATCH_HONOR = [24, 41, 68, 113, 189, 198] as const;

/** How close you must be to pick up or capture. The client uses GO interaction range. */
export const WS_FLAG_INTERACT_YD = 6;

// Real coordinates, `gameobject` @ map 489 and `world_safe_locs`. Alliance holds Silverwing (east, +x);
// Horde holds Warsong (west).
export const WSG_GEOMETRY = Object.freeze({
  flagBase: {
    alliance: { x: 1540.4, y: 1481.3, z: 351.8 }, // GO 179830 Silverwing
    horde: { x: 916.5, y: 1433.8, z: 346.4 },     // GO 179831 Warsong
  },
  start: {
    alliance: { x: 1519.53, y: 1481.87, z: 352.024 }, // world_safe_locs 769
    horde: { x: 933.331, y: 1433.72, z: 345.536 },    // world_safe_locs 770
  },
  graveyard: {
    alliance: { x: 1415.33, y: 1554.79, z: 343.156 }, // 771 Alliance Rez
    horde: { x: 1029.14, y: 1387.49, z: 340.836 },    // 772 Horde Rez
  },
  /** Field buffs — Buff_Entries[3], 180 s respawn (BattleGround.h:111-122). */
  powerups: [
    { id: 'speed-a', entry: 179871, x: 1449.9, y: 1470.7 },
    { id: 'speed-h', entry: 179871, x: 1005.2, y: 1448.0 },
    { id: 'regen-a', entry: 179904, x: 1317.5, y: 1550.8 },
    { id: 'regen-h', entry: 179904, x: 1110.5, y: 1353.7 },
    { id: 'zerk-a', entry: 179905, x: 1320.1, y: 1378.8 },
    { id: 'zerk-h', entry: 179905, x: 1139.7, y: 1560.3 },
  ],
  /** Rough field centre — the mid-map contest point strategies aim at. */
  mid: { x: 1228, y: 1457 },
});

export const WS_POWERUP_RESPAWN_MS = 180_000;

// Powerup GO → the spell its trap casts on whoever walks over it. Cite: gameobject_template type 6
// data3 for 179871 / 179904 / 179905; BattleGround.cpp HandleTriggerBuff.
export const WS_BUFF_SPELL_BY_ENTRY: Readonly<Record<number, number>> = Object.freeze({
  179871: 23451, // Speed (+100% for 10 s)
  179904: 23493, // Restoration (periodic 10%/s — CMaNGOS scripted special)
  179905: 23505, // Berserking (+30% damage done, +10% physical taken, 60 s)
});

/** The flag a team CARRIES is the enemy's; the flag it DEFENDS is its own. */
export function flagSpellCarriedBy(team: BgTeam): number {
  // Alliance carries the Warsong (Horde) flag. Cite: wsgFlagData / WSSpells pairing.
  return team === 'alliance' ? WS_SPELL_WARSONG_FLAG : WS_SPELL_SILVERWING_FLAG;
}

/** Objective id for a team's own flag. */
export function flagObjectiveId(team: BgTeam): string {
  return `flag-${team}`;
}

export interface WsgEvent {
  t: number;
  kind: 'pickup' | 'drop' | 'return' | 'capture' | 'respawn' | 'score' | 'powerup';
  team: BgTeam;
  unit?: string;
  score?: Record<BgTeam, number>;
  /** powerup only: the GO entry taken (WS_BUFF_SPELL_BY_ENTRY maps it to the spell). */
  entry?: number;
}

// Install WSG rules onto a world: objectives, the flag state machine and the win condition.
// Returns the event log, the same pure seeded contract combat uses, so a replay reads it too.
export function installWsg(world: BgWorld): WsgEvent[] {
  const events: WsgEvent[] = [];
  const g = WSG_GEOMETRY;

  world.startPos.alliance = { x: g.start.alliance.x, y: g.start.alliance.y };
  world.startPos.horde = { x: g.start.horde.x, y: g.start.horde.y };
  world.graveyardOf = wsgGraveyard;

  for (const team of ['alliance', 'horde'] as const) {
    world.addObjective({
      id: flagObjectiveId(team),
      kind: 'flag',
      pos: { x: g.flagBase[team].x, y: g.flagBase[team].y },
      owner: team,
      state: 'base',
    });
  }
  for (const p of g.powerups) {
    world.addObjective({
      id: p.id,
      kind: 'powerup',
      pos: { x: p.x, y: p.y },
      owner: null,
      state: 'up',
    });
  }

  const baseOf = (team: BgTeam): BgPos => ({ x: g.flagBase[team].x, y: g.flagBase[team].y });

  const log = (e: WsgEvent): void => {
    events.push(e);
  };

  /** Drop the flag `unit` is carrying at its feet, with the 10 s pickup window. */
  const dropFlag = (unit: BgUnit): void => {
    const spell = unit.carryingFlag;
    if (!spell) return;
    // The flag being carried belongs to the OTHER team.
    const owner = OTHER_TEAM[unit.team];
    const obj = world.objectives.get(flagObjectiveId(owner));
    if (!obj) return;
    obj.state = 'ground';
    obj.pos = { x: unit.pos.x, y: unit.pos.y };
    obj.carrier = undefined;
    obj.timerMs = world.t + WS_FLAG_DROP_MS;
    unit.carryingFlag = undefined;
    log({ t: world.t, kind: 'drop', team: unit.team, unit: unit.id });
  };

  const returnFlag = (owner: BgTeam, byUnit?: BgUnit): void => {
    const obj = world.objectives.get(flagObjectiveId(owner));
    if (!obj) return;
    obj.state = 'base';
    obj.pos = baseOf(owner);
    obj.carrier = undefined;
    obj.timerMs = undefined;
    log({ t: world.t, kind: 'return', team: owner, unit: byUnit?.id });
  };

  world.onTick = (w) => {
    if (w.ended || !w.gatesOpen) return;

    // A carrier that died drops the flag where it fell.
    for (const u of w.units.values()) {
      if (u.carryingFlag && !w.alive(u)) dropFlag(u);
    }

    for (const team of ['alliance', 'horde'] as const) {
      const obj = w.objectives.get(flagObjectiveId(team));
      if (!obj) continue;

      // A dropped flag returns itself after 10 s. Cite: BG_WS_FLAG_DROP_TIME.
      if (obj.state === 'ground' && obj.timerMs != null && w.t >= obj.timerMs) {
        returnFlag(team);
        continue;
      }
      // A captured flag respawns at its base after 23 s. Cite: BG_WS_FLAG_RESPAWN_TIME.
      if (obj.state === 'respawning' && obj.timerMs != null && w.t >= obj.timerMs) {
        obj.state = 'base';
        obj.pos = baseOf(team);
        obj.timerMs = undefined;
        log({ t: w.t, kind: 'respawn', team });
        continue;
      }

      if (obj.state !== 'base' && obj.state !== 'ground') continue;

      // Someone standing on it either takes it (enemy) or returns it (owner, dropped only). With
      // both sides on a dropped flag the nearest hand wins; the first body in roster order used to,
      // so the team added to the world first won every contested flag and every match.
      const u = flagToucher(w, obj, team);
      if (!u) continue;
      if (u.team === team) {
        returnFlag(team, u);
        continue;
      }
      obj.state = 'carried';
      obj.carrier = u.id;
      u.carryingFlag = flagSpellCarriedBy(u.team);
      log({ t: w.t, kind: 'pickup', team: u.team, unit: u.id });
    }

    // A carrier standing on its OWN flag, with that flag at base, scores.
    // Cite: BattleGroundWS.cpp HandleAreaTrigger + "own flag must be at base".
    for (const u of w.units.values()) {
      if (!u.carryingFlag || !w.alive(u)) continue;
      const ownFlag = w.objectives.get(flagObjectiveId(u.team));
      if (!ownFlag || ownFlag.state !== 'base') continue;
      const home = baseOf(u.team);
      if (detHypot(u.pos.x - home.x, u.pos.y - home.y) > WS_FLAG_INTERACT_YD) continue;

      const captured = OTHER_TEAM[u.team];
      const capturedObj = w.objectives.get(flagObjectiveId(captured));
      if (capturedObj) {
        capturedObj.state = 'respawning';
        capturedObj.carrier = undefined;
        capturedObj.pos = baseOf(captured);
        capturedObj.timerMs = w.t + WS_FLAG_RESPAWN_MS;
      }
      u.carryingFlag = undefined;
      w.score[u.team] += 1;
      w.updatePlayerScore(u.id, 'caps', 1);
      log({ t: w.t, kind: 'capture', team: u.team, unit: u.id });
      log({ t: w.t, kind: 'score', team: u.team, score: { ...w.score } });

      if (w.score[u.team] >= WS_MAX_TEAM_SCORE) {
        w.ended = true;
        w.winner = u.team;
      }
      break;
    }

    // Powerups: walk over one to take it (trap trigger), 180 s respawn.
    // Cite: BattleGround.cpp HandleTriggerBuff; BattleGround.h Buff_Entries respawn.
    for (const o of w.objectives.values()) {
      if (o.kind !== 'powerup') continue;
      if (o.state === 'down' && o.timerMs != null && w.t >= o.timerMs) {
        o.state = 'up';
        o.timerMs = undefined;
        continue;
      }
      if (o.state !== 'up') continue;
      const entry = WSG_GEOMETRY.powerups.find((p) => p.id === o.id)?.entry;
      if (entry == null) continue;
      for (const u of w.units.values()) {
        if (!w.alive(u)) continue;
        if (detHypot(u.pos.x - o.pos.x, u.pos.y - o.pos.y) > WS_FLAG_INTERACT_YD) continue;
        o.state = 'down';
        o.timerMs = w.t + WS_POWERUP_RESPAWN_MS;
        log({ t: w.t, kind: 'powerup', team: u.team, unit: u.id, entry });
        break;
      }
    }
  };

  return events;
}

// The body that gets a flag everyone within reach wants. The owner's side can only return a dropped
// flag; the other side's runner is preferred over its escorts at the base, since a pickup by the
// escort sent the runner home empty-handed. Exact ties (bodies stacked on one point) alternate by
// tick, so neither side is favoured by roster order.
function flagToucher(w: BgWorld, obj: { pos: BgPos; state: string }, owner: BgTeam): BgUnit | null {
  let best: BgUnit | null = null;
  let bd = Infinity;
  let bestRunner = false;
  const odd = Math.floor(w.t / Math.max(1, w.tickMs)) % 2 === 1;
  for (const u of w.units.values()) {
    if (!w.alive(u)) continue;
    const own = u.team === owner;
    if (own ? obj.state !== 'ground' : !!u.carryingFlag) continue;
    const d = detHypot(u.pos.x - obj.pos.x, u.pos.y - obj.pos.y);
    if (d > WS_FLAG_INTERACT_YD) continue;
    const runner = !own && u.role === 'flag-carrier';
    if (!best || (runner && !bestRunner) || (runner === bestRunner && (d < bd || (d === bd && odd)))) {
      best = u; bd = d; bestRunner = runner;
    }
  }
  return best;
}

/** Where a dead unit of `team` comes back. Cite: world_safe_locs 771 / 772. */
export function wsgGraveyard(team: BgTeam): BgPos {
  const gy = WSG_GEOMETRY.graveyard[team];
  return { x: gy.x, y: gy.y };
}
