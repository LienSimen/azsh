// Arathi Basin (map 529). The node state machine is BattleGroundAB.cpp:256 HandlePlayerClickedOnFlag
// plus the :63-90 contested→occupied timer; the resource race is abTickIntervals/abTickPoints.

import type { BgPos, BgTeam, BgUnit, BgUnitId } from './types.ts';
import { OTHER_TEAM } from './types.ts';
import type { BgWorld } from './bgWorld.ts';
import { detHypot } from '../../engine/core/detMath.ts';
import { mulberry32, type Rng } from '../../engine/core/rng.ts';

/** Cite: BattleGroundAB.h:78-79. */
export const AB_MAX_TEAM_SCORE = 2000;
export const AB_WARNING_NEAR_VICTORY_SCORE = 1800;
/** Contested → occupied. Cite: BattleGroundAB.h:68 BG_AB_FLAG_CAPTURING_TIME. */
export const AB_FLAG_CAPTURING_TIME_MS = 60_000;
export const AB_MAX_NODES = 5;

/**
 * PRODUCT RULE, operator-directed: claiming a banner is a 10 s cast that damage, leaving the
 * banner or dying cancels. 1.12 has no such cast — the banner is GAMEOBJECT_TYPE_GOOBER 180087-91
 * whose use is instant (GameObject.cpp:1577 GOOBER casts goober.spellId TRIGGERED_OLD_TRIGGERED)
 * and whose spells 23932/23935-23938 carry CastingTimeIndex 1 = 0 ms. Only the 60 s above is 1.12.
 */
export const AB_CAPTURE_CAST_MS = 10_000;

/** ms between resource ticks, indexed by nodes held. Cite: abTickIntervals, BattleGroundAB.h:186. */
export const AB_TICK_INTERVALS = [0, 12000, 9000, 6000, 3000, 1000] as const;
/** resources per tick, indexed by nodes held. Cite: abTickPoints, BattleGroundAB.h:187. */
export const AB_TICK_POINTS = [0, 10, 10, 10, 10, 30] as const;

/** Resources banked between honor payouts. Cite: BattleGroundAB.h:70-71, .cpp:129-133. */
export const AB_HONOR_TICK_RESOURCES = 260;
export const AB_WEEKEND_HONOR_TICK_RESOURCES = 160;
/** Resources banked between reputation payouts. Cite: BattleGroundAB.h:72-73, .cpp:122-126. */
export const AB_REPUTATION_TICK_RESOURCES = 160;
export const AB_WEEKEND_REPUTATION_TICK_RESOURCES = 120;

/** Cite: BattleGroundAB.cpp:124 — faction 509 (The League) / 510 (The Defilers), +10 per payout. */
export const AB_REPUTATION_FACTION: Readonly<Record<BgTeam, number>> = Object.freeze({
  alliance: 509,
  horde: 510,
});
export const AB_REPUTATION_PER_TICK = 10;

/** Cite: BattleGroundAB.h:131-132 — the 4-base and 5-base quest rewards. */
export const AB_SPELL_QUEST_REWARD_4_BASES = 24061;
export const AB_SPELL_QUEST_REWARD_5_BASES = 24064;

export type AbNodeId = 'stables' | 'blacksmith' | 'farm' | 'lumbermill' | 'goldmine';

export interface AbNodeDef {
  id: AbNodeId;
  name: string;
  /** Neutral banner GO. Cite: BattleGroundAB.h:116-120; gameobject @ map 529. */
  banner: number;
  /** goober.spellId of that banner (gameobject_template data10). */
  bannerSpell: number;
  /** Banner position, `gameobject` @ map 529. */
  x: number;
  y: number;
  z: number;
  /** WorldSafeLocs id + coords. Cite: BattleGroundAB.h:148-152, abGraveyardIds. */
  graveyard: { id: number; x: number; y: number; z: number };
  /** The base's one buff spawn: pool_template entry, and pool_gameobject's shared position. */
  buff: { pool: number; x: number; y: number; z: number };
}

// Node order is ABNodes (BattleGroundAB.h:86-95): stables, blacksmith, farm, lumber mill, gold mine.
export const AB_NODES: readonly AbNodeDef[] = Object.freeze([
  {
    id: 'stables', name: 'Stables', banner: 180087, bannerSpell: 23932,
    x: 1166.79, y: 1200.13, z: -56.7086,
    graveyard: { id: 895, x: 1201.870, y: 1163.131, z: -56.286 },
    buff: { pool: 47501, x: 1185.71, y: 1185.24, z: -56.36 },
  },
  {
    id: 'blacksmith', name: 'Blacksmith', banner: 180088, bannerSpell: 23936,
    x: 977.016, y: 1046.62, z: -44.8092,
    graveyard: { id: 894, x: 1016.588, y: 955.185, z: -42.829 },
    buff: { pool: 47503, x: 990.75, y: 1008.18, z: -42.6 },
  },
  {
    id: 'farm', name: 'Farm', banner: 180089, bannerSpell: 23935,
    x: 806.182, y: 874.272, z: -55.9937,
    graveyard: { id: 893, x: 834.726, y: 784.979, z: -57.082 },
    buff: { pool: 47505, x: 817.66, y: 843.34, z: -56.54 },
  },
  {
    id: 'lumbermill', name: 'Lumber Mill', banner: 180090, bannerSpell: 23938,
    x: 856.142, y: 1148.9, z: 11.1847,
    graveyard: { id: 897, x: 772.756, y: 1213.114, z: 15.797 },
    buff: { pool: 47504, x: 807.46, y: 1189.16, z: 11.92 },
  },
  {
    id: 'goldmine', name: 'Gold Mine', banner: 180091, bannerSpell: 23937,
    x: 1146.92, y: 848.178, z: -110.917,
    graveyard: { id: 896, x: 1211.524, y: 781.557, z: -82.710 },
    buff: { pool: 47502, x: 1146.62, y: 816.94, z: -98.49 },
  },
]);

/** Cite: battleground_template id 3 AllianceStartLoc 890 / HordeStartLoc 889; world_safe_locs. */
export const AB_GEOMETRY = Object.freeze({
  start: {
    alliance: { x: 1313.900, y: 1310.740, z: -9.010 },
    horde: { x: 684.014, y: 681.220, z: -12.916 },
  },
  // Base graveyards, live for the whole match. Cite: BattleGroundAB.h:154-155 and .cpp:161-165 —
  // 898 Trollbane Hall / 899 Defiler's Den are linked at StartingEventOpenDoors and the two
  // INSIDE-base yards (890 / 889) are unlinked there, so a team with no node rezzes at these.
  baseGraveyard: {
    alliance: { id: 898, x: 1354.700, y: 1270.270, z: -11.129 },
    horde: { id: 899, x: 713.710, y: 638.364, z: -10.600 },
  },
  /** The middle base — where the two halves of the map meet. */
  mid: { x: 977.016, y: 1046.62 },
});

/** Field buffs. Cite: BattleGround.h:111-113 Buff_Entries; gameobject_template type 6 data3. */
export const AB_BUFF_ENTRIES = [179871, 179904, 179905] as const;
export const AB_BUFF_SPELL_BY_ENTRY: Readonly<Record<number, number>> = Object.freeze({
  179871: 23451, // Speed (+100% run speed, 10 s)
  179904: 23493, // Restoration (periodic heal, 10 s)
  179905: 23505, // Berserking (+30% damage done, +10% physical taken, 60 s)
});
/** `gameobject.spawntimesecsmin` = 180 for all 15 AB buff rows. */
export const AB_BUFF_RESPAWN_MS = 180_000;

/** How close you must stand to claim a banner. GO interaction range, as WSG uses for its flags. */
export const AB_NODE_INTERACT_YD = 8;

/** Objective id for a node's buff spawn. */
export function abBuffObjectiveId(node: AbNodeId): string {
  return `buff-${node}`;
}

export interface AbEvent {
  t: number;
  kind: 'claim-start' | 'claim-break' | 'assault' | 'capture' | 'defend' | 'buff' | 'tick'
    | 'honor' | 'reputation' | 'score' | 'near-victory';
  team: BgTeam;
  node?: AbNodeId;
  unit?: BgUnitId;
  score?: Record<BgTeam, number>;
  /** buff only: the GO entry taken (AB_BUFF_SPELL_BY_ENTRY maps it to the spell). */
  entry?: number;
  /** honor / reputation only: the amount owed to the team, in the payout's own unit. */
  amount?: number;
}

/** Resources for `nodes` held, using the real interval/points tables. */
export function abResourceRate(nodes: number): { intervalMs: number; points: number } {
  const n = Math.max(0, Math.min(AB_MAX_NODES, nodes | 0));
  return { intervalMs: AB_TICK_INTERVALS[n]!, points: AB_TICK_POINTS[n]! };
}

/** Nodes `team` currently occupies. */
export function abNodesHeld(world: BgWorld, team: BgTeam): number {
  let held = 0;
  for (const n of AB_NODES) {
    const o = world.objectives.get(n.id);
    if (o?.state === 'owned' && o.owner === team) held++;
  }
  return held;
}

/**
 * Where a dead unit of `team` comes back: the graveyard of the OCCUPIED node nearest the corpse,
 * else the team's own base yard. Cite: BattleGroundAB.cpp:252 links a node's yard to its captor and
 * :348 unlinks it the moment the node is assaulted, so only occupied nodes are candidates;
 * GraveyardManager picks the closest live link to where the player fell.
 */
export function abGraveyard(world: BgWorld, team: BgTeam, from?: BgPos): BgPos {
  const base = AB_GEOMETRY.baseGraveyard[team];
  let best: BgPos = { x: base.x, y: base.y };
  const at = from ?? world.startPos[team];
  let bestD = Infinity;
  for (const n of AB_NODES) {
    const o = world.objectives.get(n.id);
    if (o?.state !== 'owned' || o.owner !== team) continue;
    const d = detHypot(n.graveyard.x - at.x, n.graveyard.y - at.y);
    if (d < bestD) { bestD = d; best = { x: n.graveyard.x, y: n.graveyard.y }; }
  }
  return best;
}

export interface AbInstallOpts {
  /** Seeded stream for the buff pool roll. Same seed, same buffs. */
  rng?: Rng;
  /** BG weekend shortens both payout intervals. Cite: BattleGroundAB.cpp:462-464. */
  weekend?: boolean;
}

/** A claim in progress on one node. */
interface AbClaim {
  unit: BgUnitId;
  team: BgTeam;
  startedMs: number;
  /** hp when the cast began — any drop cancels it. */
  hpAtStart: number;
}

// Install AB rules onto a world: the five nodes, their 10 s claim / 60 s capture state machine, the
// per-base buff pool, the resource race and the honor/reputation payouts. Returns the event log.
export function installAb(world: BgWorld, opts: AbInstallOpts = {}): AbEvent[] {
  const events: AbEvent[] = [];
  const rng = opts.rng ?? mulberry32(529);
  const honorEvery = opts.weekend ? AB_WEEKEND_HONOR_TICK_RESOURCES : AB_HONOR_TICK_RESOURCES;
  const repEvery = opts.weekend
    ? AB_WEEKEND_REPUTATION_TICK_RESOURCES
    : AB_REPUTATION_TICK_RESOURCES;

  world.startPos.alliance = { x: AB_GEOMETRY.start.alliance.x, y: AB_GEOMETRY.start.alliance.y };
  world.startPos.horde = { x: AB_GEOMETRY.start.horde.x, y: AB_GEOMETRY.start.horde.y };
  world.graveyardOf = (team, unit) => abGraveyard(world, team, unit?.pos);

  /** Roll which of the three buffs is up here. Cite: pool_template 47501-47505 max_limit 1. */
  const rollBuff = (): number =>
    AB_BUFF_ENTRIES[rng.int(0, AB_BUFF_ENTRIES.length - 1)] ?? AB_BUFF_ENTRIES[0];

  for (const n of AB_NODES) {
    world.addObjective({
      id: n.id,
      kind: 'node',
      pos: { x: n.x, y: n.y },
      owner: null,
      state: 'neutral',
    });
    world.addObjective({
      id: abBuffObjectiveId(n.id),
      kind: 'powerup',
      pos: { x: n.buff.x, y: n.buff.y },
      owner: null,
      state: 'up',
    });
  }
  /** Which entry each base's pool currently has up. */
  const buffEntry = new Map<string, number>(
    AB_NODES.map((n) => [abBuffObjectiveId(n.id), rollBuff()]),
  );

  /** Claims in progress, by node id. */
  const claims = new Map<AbNodeId, AbClaim>();
  /** Next resource tick per team, on the match clock. */
  const nextTick: Record<BgTeam, number> = { alliance: 0, horde: 0 };
  /** Resources banked toward the next honor / reputation payout. */
  const honorBank: Record<BgTeam, number> = { alliance: 0, horde: 0 };
  const repBank: Record<BgTeam, number> = { alliance: 0, horde: 0 };
  let informedNearVictory = false;

  const log = (e: AbEvent): void => { events.push(e); };

  /**
   * The banner click, ported whole. Cite: BattleGroundAB.cpp:256-375 HandlePlayerClickedOnFlag —
   * neutral and occupied both go CONTESTED with a fresh 60 s timer, and a contested node whose
   * PREVIOUS status was occupied is DEFENDED straight back to occupied with the timer cleared.
   */
  const clickBanner = (node: AbNodeDef, team: BgTeam, unit?: BgUnitId): void => {
    const obj = world.objectives.get(node.id);
    if (!obj) return;

    if (obj.state === 'assaulted' && obj.prevOwner === team) {
      // :310-326 — we held it, they flipped it to contested, we clicked it back.
      obj.state = 'owned';
      obj.owner = team;
      obj.prevOwner = team;
      obj.timerMs = undefined;
      // SCORE_BASES_DEFENDED. Cite: BattleGroundAB.cpp:314, .h:204-208.
      if (unit) world.updatePlayerScore(unit, 'defends', 1);
      log({ t: world.t, kind: 'defend', team, node: node.id, unit });
      return;
    }

    // :280-296 (neutral) and :329-348 (occupied by the other team) are the same transition; the
    // only difference is that flipping an occupied node takes its yard off its old owner, which
    // falls out of `state` no longer being 'owned'.
    obj.prevOwner = obj.state === 'owned' ? obj.owner : null;
    obj.state = 'assaulted';
    obj.owner = team;
    obj.timerMs = world.t + AB_FLAG_CAPTURING_TIME_MS;
    // SCORE_BASES_ASSAULTED. Cite: BattleGroundAB.cpp:283/:331, .h:204-208.
    if (unit) world.updatePlayerScore(unit, 'caps', 1);
    log({ t: world.t, kind: 'assault', team, node: node.id, unit });
  };

  /** May `team` start a claim on this node at all? */
  const claimable = (nodeId: AbNodeId, team: BgTeam): boolean => {
    const obj = world.objectives.get(nodeId);
    if (!obj) return false;
    if (obj.state === 'owned') return obj.owner !== team;
    if (obj.state === 'assaulted') {
      // Our own assault is already running; only the other team, or the previous holder
      // defending it back, has anything to click.
      if (obj.owner === team) return false;
      return true;
    }
    return true; // neutral
  };

  world.onTick = (w, dtMs) => {
    if (w.ended || !w.gatesOpen) return;

    // ---- 1. claims: a 10 s uninterrupted cast on the banner --------------------
    for (const n of AB_NODES) {
      const obj = w.objectives.get(n.id);
      if (!obj) continue;
      const live = claims.get(n.id);

      if (live) {
        const u = w.units.get(live.unit);
        const inRange = !!u && w.alive(u)
          && detHypot(u.pos.x - obj.pos.x, u.pos.y - obj.pos.y) <= AB_NODE_INTERACT_YD;
        const hurt = !!u && u.hp < live.hpAtStart;
        // Somebody else already changed the node under us — re-decide from scratch.
        const stale = !claimable(n.id, live.team);
        if (!inRange || hurt || stale) {
          claims.delete(n.id);
          obj.claimBy = undefined;
          obj.claimEndsMs = undefined;
          log({ t: w.t, kind: 'claim-break', team: live.team, node: n.id, unit: live.unit });
        } else if (w.t - live.startedMs >= AB_CAPTURE_CAST_MS) {
          claims.delete(n.id);
          obj.claimBy = undefined;
          obj.claimEndsMs = undefined;
          clickBanner(n, live.team, live.unit);
        } else {
          continue; // a live claim holds the banner for its whole cast
        }
      }

      // Nobody claiming: the first unit standing on a banner its team can take starts one.
      let starter: BgUnit | undefined;
      for (const u of w.units.values()) {
        if (!w.alive(u)) continue;
        if (detHypot(u.pos.x - obj.pos.x, u.pos.y - obj.pos.y) > AB_NODE_INTERACT_YD) continue;
        if (!claimable(n.id, u.team)) continue;
        starter = u;
        break;
      }
      if (!starter) continue;
      claims.set(n.id, {
        unit: starter.id, team: starter.team, startedMs: w.t, hpAtStart: starter.hp,
      });
      obj.claimBy = starter.id;
      obj.claimEndsMs = w.t + AB_CAPTURE_CAST_MS;
      log({ t: w.t, kind: 'claim-start', team: starter.team, node: n.id, unit: starter.id });
    }

    // ---- 2. contested → occupied after 60 s. Cite: BattleGroundAB.cpp:63-90 ----
    for (const n of AB_NODES) {
      const obj = w.objectives.get(n.id);
      if (!obj || obj.state !== 'assaulted' || obj.timerMs == null) continue;
      if (w.t < obj.timerMs) continue;
      const team = obj.owner;
      if (!team) continue;
      obj.state = 'owned';
      obj.prevOwner = team;
      obj.timerMs = undefined;
      log({ t: w.t, kind: 'capture', team, node: n.id });
    }

    // ---- 3. the per-base buff pool --------------------------------------------
    // Cite: BattleGround.cpp:1795 HandleTriggerBuff despawns the trap on use; pool_template
    // 47501-47505 max_limit 1 re-rolls which of the three comes back.
    for (const n of AB_NODES) {
      const id = abBuffObjectiveId(n.id);
      const o = w.objectives.get(id);
      if (!o) continue;
      if (o.state === 'down') {
        if (o.timerMs != null && w.t >= o.timerMs) {
          o.state = 'up';
          o.timerMs = undefined;
          buffEntry.set(id, rollBuff());
        }
        continue;
      }
      for (const u of w.units.values()) {
        if (!w.alive(u)) continue;
        if (detHypot(u.pos.x - o.pos.x, u.pos.y - o.pos.y) > AB_NODE_INTERACT_YD) continue;
        const entry = buffEntry.get(id) ?? AB_BUFF_ENTRIES[0];
        o.state = 'down';
        o.timerMs = w.t + AB_BUFF_RESPAWN_MS;
        log({ t: w.t, kind: 'buff', team: u.team, node: n.id, unit: u.id, entry });
        break;
      }
    }

    // ---- 4. the resource race. Cite: BattleGroundAB.cpp:99-146 ------------------
    for (const team of ['alliance', 'horde'] as const) {
      const held = abNodesHeld(w, team);
      const { intervalMs, points } = abResourceRate(held);
      if (intervalMs <= 0) {
        nextTick[team] = w.t + 1000; // nothing held — re-check shortly
        continue;
      }
      if (nextTick[team] === 0) nextTick[team] = w.t + intervalMs;
      while (w.t >= nextTick[team]) {
        w.score[team] = Math.min(AB_MAX_TEAM_SCORE, w.score[team] + points);
        nextTick[team] += intervalMs;
        honorBank[team] += points;
        repBank[team] += points;
        log({ t: w.t, kind: 'tick', team, score: { ...w.score } });

        // :129-133 — one bonus-honor award per `honorEvery` resources banked.
        while (honorBank[team] >= honorEvery) {
          honorBank[team] -= honorEvery;
          log({ t: w.t, kind: 'honor', team, amount: 1 });
        }
        // :122-126 — +10 with faction 509 / 510 per `repEvery` resources banked.
        while (repBank[team] >= repEvery) {
          repBank[team] -= repEvery;
          log({ t: w.t, kind: 'reputation', team, amount: AB_REPUTATION_PER_TICK });
        }

        // :136-141 — the near-victory call, once per match, for whoever crosses first.
        if (!informedNearVictory && w.score[team] > AB_WARNING_NEAR_VICTORY_SCORE) {
          informedNearVictory = true;
          log({ t: w.t, kind: 'near-victory', team, score: { ...w.score } });
        }

        if (w.score[team] >= AB_MAX_TEAM_SCORE) {
          w.ended = true;
          w.winner = team;
          log({ t: w.t, kind: 'score', team, score: { ...w.score } });
          return;
        }
      }
    }
    void dtMs;
    void OTHER_TEAM;
  };

  return events;
}
