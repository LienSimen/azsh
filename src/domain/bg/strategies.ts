// BG strategy bundles — the mangosbot Action/Strategy/relevance model on a BgView-only signature.
// Every action takes `(unit, view)` and nothing else, so the fog rule is enforced by the type.

import { detHypot, detCos, detSin } from '../../engine/core/detMath.ts';
import { hashSeed } from '../../engine/core/rng.ts';
import {
  type BgAction,
  type BgPos,
  type BgStrategy,
  type BgUnitView,
  type BgView,
  OTHER_TEAM,
} from './types.ts';
import { WSG_GEOMETRY, flagObjectiveId } from './wsg.ts';
import { AB_GEOMETRY } from './ab.ts';
import { AV_GEOMETRY, avKeep, avMineObjectiveId } from './av.ts';
import { AV_MINES } from '../../data/alteracValley.ts';

const dist = (a: BgPos, b: BgPos): number => detHypot(a.x - b.x, a.y - b.y);

const homeBase = (view: BgView): BgPos => {
  const g = WSG_GEOMETRY.flagBase[view.team];
  return { x: g.x, y: g.y };
};
const enemyBase = (view: BgView): BgPos => {
  const g = WSG_GEOMETRY.flagBase[OTHER_TEAM[view.team]];
  return { x: g.x, y: g.y };
};

// Each side's flag runs keep to one edge of the field, past the brawl at the mid point: Alliance
// along the north side, Horde along the south, so the two runs never cross each other either.
// A run straight through mid put the carrier inside the mid fight's 30 yd shard every time.
const LANE_DY: Record<BgTeam, number> = { alliance: 90, horde: -90 };
const laneWaypoint = (team: BgTeam): BgPos => ({ x: WSG_GEOMETRY.mid.x, y: WSG_GEOMETRY.mid.y + LANE_DY[team] });
/** Toward `to` by the lane: the lane point while it is still ahead on the way, then `to` itself. */
const viaLane = (unit: BgUnitView, team: BgTeam, to: BgPos): BgPos => {
  const wp = laneWaypoint(team);
  const dir = Math.sign(to.x - unit.pos.x);
  if (dir !== 0 && Math.sign(wp.x - unit.pos.x) === dir && Math.abs(wp.x - unit.pos.x) > 15) return wp;
  return to;
};

const ourFlag = (view: BgView) => view.objectives.find((o) => o.id === flagObjectiveId(view.team));
const theirFlag = (view: BgView) =>
  view.objectives.find((o) => o.id === flagObjectiveId(OTHER_TEAM[view.team]));

const ourCarrier = (view: BgView): BgUnitView | undefined =>
  view.own.find((u) => u.carryingFlag && u.alive);
/** Only ever an enemy this team can SEE — a carried flag is always visible (HUD worldstate). */
const theirCarrier = (view: BgView): BgUnitView | undefined =>
  view.enemies.find((u) => u.carryingFlag && u.alive);

// Both flags carried: neither side can score until the other carrier dies and the flag returns. Left to
// escorting and holding, both teams sat on their own carrier at home and a 25-minute match had two
// pickups. The field goes to kill their carrier; the defenders stay with ours.
const doubleCarry = (view: BgView): boolean => !!ourCarrier(view) && !!theirCarrier(view);

const nearestOf = <T extends { pos: BgPos }>(from: BgPos, list: readonly T[]): T | undefined => {
  let best: T | undefined;
  let bd = Infinity;
  for (const o of list) {
    const d = dist(from, o.pos);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
};

const nearestVisibleEnemy = (unit: BgUnitView, view: BgView): BgUnitView | undefined => {
  let best: BgUnitView | undefined;
  let bd = Infinity;
  for (const e of view.enemies) {
    if (!e.alive) continue;
    const d = dist(unit.pos, e.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
};

// ---- Actions ---------------------------------------------------------------

/** Carry it home. Nothing outranks this for the unit holding the flag. */
const runFlagHome: BgAction = {
  name: 'runFlagHome',
  relevance: () => 100,
  available: (unit) => !!unit.carryingFlag,
  order: (unit, view) => ({ kind: 'move', to: viaLane(unit, view.team, homeBase(view)) }),
};

// Our own flag is on the ground: touching it returns it. Urgent — a dropped flag returns itself in 10 s,
// and until it is home a carrier of ours cannot score.
const returnOurFlag: BgAction = {
  name: 'returnOurFlag',
  relevance: () => 95,
  available: (unit, view) => !unit.carryingFlag && ourFlag(view)?.state === 'ground',
  order: (_unit, view) => {
    const f = ourFlag(view);
    return f ? { kind: 'move', to: f.pos } : null;
  },
};

/** How far the flag runner will step aside to help kill the enemy carrier; beyond it they keep running. */
const RUNNER_PEEL_YD = 60;
/** An enemy carrier this close pulls a body out of the fight it is in. */
const CARRIER_PEEL_YD = 60;
/** A carrier of ours this close does too. */
const CARRIER_HELP_YD = 100;

// Chase whoever has our flag. Its FLOOR must stay above holdOurBase (70): at 50, defenders
// preferred an already-safe base over retrieving the flag, and both teams sat at 0-0 forever.
// The flag runner is the exception: a cross-carry is how a stalemate breaks, so they only peel onto
// a carrier who runs past them.
const chaseEnemyCarrier: BgAction = {
  name: 'chaseEnemyCarrier',
  relevance: (unit, view) => {
    const c = theirCarrier(view);
    if (!c) return 0;
    if (unit.role === 'flag-carrier') return 90;
    // A carrier passing close outranks everything but the flag actions; a far one still outranks
    // holding a base (70), but not the fight this body is in (82): with every mid fighter peeling
    // onto a carrier 200 yd away, the whole brawl migrated and the runs always died in it.
    return dist(unit.pos, c.pos) < CARRIER_PEEL_YD ? 95 : 75;
  },
  available: (unit, view) => {
    if (unit.carryingFlag) return false;
    const c = theirCarrier(view);
    if (!c) return false;
    const d = dist(unit.pos, c.pos);
    if (unit.role === 'flag-carrier') return d < RUNNER_PEEL_YD;
    // In a double carry a defender guards our carrier instead of crossing the map.
    if (unit.role === 'defense' && doubleCarry(view)) return d < CARRIER_PEEL_YD;
    return true;
  },
  // `follow`, NOT attack-move to a position: the strategy layer runs at 1 Hz, so a position order
  // sends an equal-speed chaser to where the carrier was a second ago and never closes.
  order: (_unit, view) => {
    const c = theirCarrier(view);
    return c ? { kind: 'follow', target: c.id } : null;
  },
};

// Stay on our carrier and kill what touches them. Open to every non-defense role: with escorts
// alone a carrier ran 620 yd through the enemy team by itself and died within ~50 yd every time.
// A carrier within reach outranks the fight a body is in (82), as a passing enemy carrier does;
// one far away does not, so the mid fight is not abandoned for a run on the other side of the map.
const escortCarrier: BgAction = {
  name: 'escortCarrier',
  relevance: (unit, view) => {
    const c = ourCarrier(view);
    return c && dist(unit.pos, c.pos) < CARRIER_HELP_YD ? 84 : 80;
  },
  available: (unit, view) => {
    if (unit.carryingFlag) return false;
    if (unit.role === 'defense') return false;
    return !!ourCarrier(view) && !theirCarrier(view);
  },
  order: (_unit, view) => {
    const c = ourCarrier(view);
    return c ? { kind: 'follow', target: c.id } : null;
  },
};

// Our flag runner, alive and not yet carrying: the body the escorts walk in with.
const ourRunner = (view: BgView): BgUnitView | undefined =>
  view.own.find((u) => u.role === 'flag-carrier' && u.alive && !u.carryingFlag);

// Walk in with the runner. Escorts used to wait at mid for a carrier to exist, so the runner went
// into the enemy flag room alone, picked up, and died to the two defenders before anyone arrived.
const escortRunner: BgAction = {
  name: 'escortRunner',
  relevance: () => 58,
  available: (unit, view) => !unit.carryingFlag && !ourCarrier(view) && !!ourRunner(view) && ourRunner(view)!.id !== unit.id,
  order: (_unit, view) => {
    const r = ourRunner(view);
    return r ? { kind: 'follow', target: r.id } : null;
  },
};

/** An escort this close is with the runner; farther, the runner goes back for them. */
const ESCORT_WITH_YD = 25;
/** An escort farther than this from the runner is somebody the runner should wait for. */
const ESCORT_FAR_YD = 40;

/** Our living escorts who are not carrying anything. */
const ourEscorts = (view: BgView): BgUnitView[] =>
  view.own.filter((u) => u.role === 'fc-escort' && u.alive && !u.carryingFlag);

// The runner does not walk into the enemy flag room alone. With escorts alive but elsewhere (held in
// a fight at mid, or just back from the graveyard) the runner goes to the nearest one; once an escort
// is beside them, grabEnemyFlag takes over and the group walks in together. Alone, a level-22 runner
// picked up and died to the two defenders in nine seconds, sixteen times in a row: 0-0 after 20 min.
const waitForEscort: BgAction = {
  name: 'waitForEscort',
  relevance: () => 86,
  available: (unit, view) => {
    if (unit.role !== 'flag-carrier' || unit.carryingFlag) return false;
    const escorts = ourEscorts(view).filter((e) => e.id !== unit.id);
    if (!escorts.length) return false;
    if (escorts.some((e) => dist(e.pos, unit.pos) < ESCORT_WITH_YD)) return false;
    return escorts.some((e) => dist(e.pos, unit.pos) > ESCORT_FAR_YD);
  },
  order: (unit, view) => {
    const e = nearestOf(unit.pos, ourEscorts(view).filter((o) => o.id !== unit.id));
    return e ? { kind: 'follow', target: e.id } : null;
  },
};

/** A dropped flag this close is anyone's to pick up before it returns itself in 10 s. */
const GROUND_FLAG_REACH_YD = 60;

// Go take their flag. The runner walks across the map for it; a fighter in reach of a dropped one
// picks it up (a pass, in WSG terms); everyone else only takes it from the ground when it is near.
const grabEnemyFlag: BgAction = {
  name: 'grabEnemyFlag',
  relevance: (unit, view) => {
    const f = theirFlag(view);
    if (f?.state === 'ground' && unit.role !== 'defense' && dist(unit.pos, f.pos) < GROUND_FLAG_REACH_YD) return 90;
    return unit.role === 'flag-carrier' ? 85 : unit.role === 'offense' ? 42 : 20;
  },
  available: (unit, view) => {
    if (unit.carryingFlag) return false;
    const f = theirFlag(view);
    return f?.state === 'base' || f?.state === 'ground';
  },
  order: (unit, view) => {
    const f = theirFlag(view);
    const to = f ? f.pos : enemyBase(view);
    // The runner walks the lane in; a dropped flag is wherever it fell, so it is walked to straight.
    return { kind: 'attack-move', to: unit.role === 'flag-carrier' && f?.state !== 'ground' ? viaLane(unit, view.team, to) : to };
  },
};

/** Sit on our flag room. */
const holdOurBase: BgAction = {
  name: 'holdOurBase',
  relevance: (unit) => (unit.role === 'defense' ? 70 : 15),
  available: (unit) => !unit.carryingFlag && unit.role === 'defense',
  order: (unit, view) => {
    const home = homeBase(view);
    // Already home → engage whoever is here rather than jogging on the spot.
    if (dist(unit.pos, home) < 15) {
      const foe = nearestVisibleEnemy(unit, view);
      if (foe && dist(unit.pos, foe.pos) < 40) return { kind: 'attack-move', to: foe.pos };
      return { kind: 'hold' };
    }
    return { kind: 'move', to: home };
  },
};

/** Standing this close to the mid point is holding it. */
const MID_HELD_YD = 40;

// Contest the middle — where the two flag runs cross. Walking there outranks an enemy in reach;
// once there, an enemy in reach outranks standing on the point, or two groups stood 50 yd apart
// at mid for a whole match and watched each other's runners walk past.
const contestMid: BgAction = {
  name: 'contestMid',
  relevance: (unit) => {
    if (unit.role !== 'mid') return 25;
    return dist(unit.pos, WSG_GEOMETRY.mid) > MID_HELD_YD ? 55 : 30;
  },
  available: (unit) => !unit.carryingFlag,
  order: () => ({ kind: 'attack-move', to: { ...WSG_GEOMETRY.mid } }),
};

/** Touching distance: a fight you are in. */
const ENGAGE_CONTACT_YD = 25;
/** An enemy this close is worth walking over to. */
const ENGAGE_REACH_YD = 60;

// Fight what is in front of you. In contact it outranks escorting (80) and the offense grab (42), so
// a body finishes the fight it is in instead of walking off mid-swing with the enemy on its back; it
// stays under the runner's grab (85), the carrier chase and the flag actions. In reach it outranks
// holding mid; far away it is the floor.
const engageNearest: BgAction = {
  name: 'engageNearest',
  relevance: (unit, view) => {
    const foe = nearestVisibleEnemy(unit, view);
    if (!foe) return 0;
    const d = dist(unit.pos, foe.pos);
    return d < ENGAGE_CONTACT_YD ? 82 : d < ENGAGE_REACH_YD ? 45 : 10;
  },
  available: (unit, view) => !unit.carryingFlag && !!nearestVisibleEnemy(unit, view),
  // Same reason as chaseEnemyCarrier: track the unit, not a one-second-old point.
  order: (unit, view) => {
    const foe = nearestVisibleEnemy(unit, view);
    return foe ? { kind: 'follow', target: foe.id } : null;
  },
};

// A wounded carrier with no help nearby runs for home rather than trading. Disengage is what separates a
// good flag carrier from a body.
const carrierDisengage: BgAction = {
  name: 'carrierDisengage',
  relevance: () => 105,
  available: (unit, view) => {
    if (!unit.carryingFlag || unit.hpPct >= 35) return false;
    const helpNear = view.own.some(
      (o) => o.id !== unit.id && o.alive && dist(o.pos, unit.pos) < 20,
    );
    return !helpNear;
  },
  order: (unit, view) => ({ kind: 'retreat', to: viaLane(unit, view.team, homeBase(view)) }),
};

// ---- Arathi Basin: nodes, not flags ----------------------------------------
// Every action below reads `view.objectives` where kind === 'node', so it needs no map constant
// beyond the team's own start. AB node states are ABNodeStatus (BattleGroundAB.h:104-111) as
// `neutral` | `assaulted` | `owned`, with `owner` the occupier or the assaulting team.

const nodes = (view: BgView) => view.objectives.filter((o) => o.kind === 'node');

/** Nodes this team does NOT hold outright — everything worth walking to. */
const takeableNodes = (view: BgView) =>
  nodes(view).filter((o) => !(o.state === 'owned' && o.owner === view.team));

/** Ours, and the enemy has a 60 s clock running on it. Cite: BattleGroundAB.cpp:329-348. */
const nodesUnderAssault = (view: BgView) =>
  nodes(view).filter((o) => o.state === 'assaulted' && o.prevOwner === view.team);

const abHome = (view: BgView): BgPos => {
  const s = AB_GEOMETRY.start[view.team];
  return { x: s.x, y: s.y };
};

// A base of ours is being flipped and the 60 s timer is already running. Outranks everything else
// on this map: one click by anyone of ours puts it straight back to occupied (:310-326), so the
// nearest bodies drop what they are doing.
const reclaimOurNode: BgAction = {
  name: 'reclaimOurNode',
  relevance: (unit, view) => {
    const n = nearestOf(unit.pos, nodesUnderAssault(view));
    if (!n) return 0;
    return 95 - Math.min(20, dist(unit.pos, n.pos) / 40);
  },
  available: (_unit, view) => nodesUnderAssault(view).length > 0,
  order: (unit, view) => {
    const n = nearestOf(unit.pos, nodesUnderAssault(view));
    return n ? { kind: 'attack-move', to: { ...n.pos } } : null;
  },
};

/** Walk to the nearest base we do not hold and stand on the banner until the claim lands. */
const takeNearestNode: BgAction = {
  name: 'takeNearestNode',
  relevance: (unit) => (unit.role === 'node-assault' ? 75 : 45),
  available: (_unit, view) => takeableNodes(view).length > 0,
  order: (unit, view) => {
    const n = nearestOf(unit.pos, takeableNodes(view));
    return n ? { kind: 'attack-move', to: { ...n.pos } } : null;
  },
};

// Sit on the base of ours nearest home. Standing ON the banner is the point: a defender in range is
// what turns an enemy assault back into an occupation the moment it starts.
const holdOurNode: BgAction = {
  name: 'holdOurNode',
  relevance: (unit) => (unit.role === 'node-defense' ? 70 : 10),
  available: (unit, view) =>
    unit.role === 'node-defense'
    && nodes(view).some((o) => o.state === 'owned' && o.owner === view.team),
  order: (unit, view) => {
    const held = nodes(view).filter((o) => o.state === 'owned' && o.owner === view.team);
    const post = nearestOf(abHome(view), held);
    if (!post) return null;
    if (dist(unit.pos, post.pos) < 15) {
      const foe = nearestVisibleEnemy(unit, view);
      if (foe && dist(unit.pos, foe.pos) < 40) return { kind: 'attack-move', to: { ...foe.pos } };
      return { kind: 'hold' };
    }
    return { kind: 'move', to: { ...post.pos } };
  },
};

// One buff sits at every base (pool_template 47501-47505). Worth a short detour and nothing more,
// so this scores under engageNearest's in-contact 50 and never pulls a unit off a fight.
const AB_BUFF_DETOUR_YD = 40;
const grabBaseBuff: BgAction = {
  name: 'grabBaseBuff',
  relevance: () => 40,
  available: (unit, view) => view.objectives.some(
    (o) => o.kind === 'powerup' && o.state === 'up' && dist(unit.pos, o.pos) <= AB_BUFF_DETOUR_YD,
  ),
  order: (unit, view) => {
    const near = view.objectives.filter(
      (o) => o.kind === 'powerup' && o.state === 'up' && dist(unit.pos, o.pos) <= AB_BUFF_DETOUR_YD,
    );
    const b = nearestOf(unit.pos, near);
    return b ? { kind: 'move', to: { ...b.pos } } : null;
  },
};


// ---- Alterac Valley: a line that moves, not a scoreboard ---------------------
// Every action reads `view.objectives` (kind 'node' for graveyards and mines, 'tower' for the
// bunkers and towers) plus `view.enemies`, so it needs no map constant beyond the two keeps.
// State strings are AVStates as av.ts writes them: 'owned' | 'assaulted', with `totalOwner` the
// last team that destroyed the point (BattleGroundAV.h:566).

/** How far from its post a guard will step to meet someone. */
const AV_GUARD_ENGAGE_YD = 40;
/** An enemy this close to our general is an emergency for the whole team. */
const AV_KEEP_ALARM_YD = 120;

type BgObjectiveView = BgView['objectives'][number];

const avNodes = (view: BgView): BgObjectiveView[] =>
  view.objectives.filter(
    (o) => (o.kind === 'node' || o.kind === 'tower') && !o.id.startsWith('mine-'),
  );

/** Would a unit of this team have anything to click here? Mirrors av.ts avClaimIntent. */
const avIntent = (o: BgObjectiveView, team: BgView['team']): 'assault' | 'defend' | null => {
  if (o.owner === team) return null;
  if (o.state === 'owned') return o.totalOwner === team ? null : 'assault';
  if (o.state !== 'assaulted') return null;
  if (o.totalOwner == null) return 'assault';
  return o.prevOwner === team ? 'defend' : null;
};

/** Ours, and the enemy has the 4 minute burn running on it. */
const avUnderAssault = (view: BgView): BgObjectiveView[] =>
  avNodes(view).filter((o) => avIntent(o, view.team) === 'defend');

const avTakeable = (view: BgView): BgObjectiveView[] =>
  avNodes(view).filter((o) => avIntent(o, view.team) === 'assault');

/** Enemy towers still standing. All four down is what strips the general of his lieutenants. */
const avEnemyTowersLeft = (view: BgView): number =>
  view.objectives.filter(
    (o) => o.kind === 'tower' && o.owner === OTHER_TEAM[view.team] && o.state === 'owned',
  ).length;

const avEnemyKeep = (view: BgView): BgPos => avKeep(OTHER_TEAM[view.team]);
const avOurKeep = (view: BgView): BgPos => avKeep(view.team);

/** A commander of theirs we can currently see — a lieutenant in a tower, or the general. */
const avVisibleCommander = (unit: BgUnitView, view: BgView): BgUnitView | undefined => {
  let best: BgUnitView | undefined;
  let bd = Infinity;
  for (const e of view.enemies) {
    if (!e.alive || e.role !== 'npc-commander') continue;
    const d = dist(unit.pos, e.pos);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
};

// A point of ours is burning and one click stops it. Nothing else on this map is worth 4 minutes.
const avReclaimNode: BgAction = {
  name: 'avReclaimNode',
  relevance: (unit, view) => {
    const n = nearestOf(unit.pos, avUnderAssault(view));
    if (!n) return 0;
    return 95 - Math.min(20, dist(unit.pos, n.pos) / 60);
  },
  available: (_unit, view) => avUnderAssault(view).length > 0,
  order: (unit, view) => {
    const n = nearestOf(unit.pos, avUnderAssault(view));
    return n ? { kind: 'attack-move', to: { ...n.pos } } : null;
  },
};

// Take the next point up the road. Nearest first: AV is a line, so the nearest takeable point IS
// the front, and jumping past it leaves a graveyard behind you the enemy keeps rezzing at.
const avAssaultNode: BgAction = {
  name: 'avAssaultNode',
  relevance: (unit) => (unit.role === 'av-offense' ? 78 : unit.role === 'av-defense' ? 35 : 55),
  available: (_unit, view) => avTakeable(view).length > 0,
  order: (unit, view) => {
    const n = nearestOf(unit.pos, avTakeable(view));
    return n ? { kind: 'attack-move', to: { ...n.pos } } : null;
  },
};

// Every enemy tower is down, so the general has no lieutenants left. Cite: BattleGroundAV.cpp:520 —
// destroying a tower despawns its marshal, and :57 killing the general ends the battle outright.
const avPushKeep: BgAction = {
  name: 'avPushKeep',
  relevance: () => 88,
  available: (_unit, view) => avEnemyTowersLeft(view) === 0,
  order: (_unit, view) => ({ kind: 'attack-move', to: { ...avEnemyKeep(view) } }),
};

/** Standing in their keep: hit the general, not the guard beside him. */
const avKillCommander: BgAction = {
  name: 'avKillCommander',
  relevance: (unit, view) => {
    const c = avVisibleCommander(unit, view);
    if (!c) return 0;
    return dist(unit.pos, c.pos) < 60 ? 92 : 0;
  },
  available: (unit, view) => !!avVisibleCommander(unit, view),
  order: (unit, view) => {
    const c = avVisibleCommander(unit, view);
    return c ? { kind: 'follow', target: c.id } : null;
  },
};

// Sit on the point of ours closest to their keep — the front, and the graveyard our push rezzes at.
const avHoldLine: BgAction = {
  name: 'avHoldLine',
  relevance: (unit) => (unit.role === 'av-defense' ? 70 : 12),
  available: (unit, view) =>
    unit.role === 'av-defense'
    && avNodes(view).some((o) => o.state === 'owned' && o.owner === view.team),
  order: (unit, view) => {
    const held = avNodes(view).filter((o) => o.state === 'owned' && o.owner === view.team);
    const post = nearestOf(avEnemyKeep(view), held);
    if (!post) return null;
    if (dist(unit.pos, post.pos) < 20) {
      const foe = nearestVisibleEnemy(unit, view);
      if (foe && dist(unit.pos, foe.pos) < 50) return { kind: 'attack-move', to: { ...foe.pos } };
      return { kind: 'hold' };
    }
    return { kind: 'move', to: { ...post.pos } };
  },
};

// The enemy is inside our keep, and our general is the last thing between them and the win.
const avDefendGeneral: BgAction = {
  name: 'avDefendGeneral',
  relevance: () => 100,
  available: (_unit, view) => {
    const keep = avOurKeep(view);
    return view.enemies.some((e) => e.alive && dist(e.pos, keep) < AV_KEEP_ALARM_YD);
  },
  order: (_unit, view) => ({ kind: 'attack-move', to: { ...avOurKeep(view) } }),
};

// The mines pay one reinforcement every 45 s for 20 minutes. Cite: BattleGroundAV.cpp:319-341.
const avTakeMine: BgAction = {
  name: 'avTakeMine',
  relevance: (unit) => (unit.role === 'av-economy' ? 72 : 8),
  available: (_unit, view) => view.objectives.some(
    (o) => o.id.startsWith('mine-') && o.owner !== view.team,
  ),
  order: (unit, view) => {
    const open = view.objectives.filter((o) => o.id.startsWith('mine-') && o.owner !== view.team);
    const m = nearestOf(unit.pos, open);
    return m ? { kind: 'attack-move', to: { ...m.pos } } : null;
  },
};

/** WanderMovementGenerator's pause between hops. Cite: RandomMovementGenerator.cpp:163 (3000, 10000). */
const AV_WANDER_MIN_MS = 3000;
const AV_WANDER_MAX_MS = 10_000;

/** A MOVEMENT_RANDOM hop: a point inside `radius` of the respawn coord, held one 3-10 s pause.
 *  Cite: RandomMovementGenerator.cpp:120 ComputePathToRandomPoint. Keyed off the id and the
 *  match clock, so a replay walks the same valley. */
function avWanderPoint(unit: BgUnitView, post: BgPos, radius: number, t: number): BgPos {
  let seed = 0;
  for (let i = 0; i < unit.id.length; i++) seed = (seed * 31 + unit.id.charCodeAt(i)) | 0;
  seed >>>= 0;
  const period = AV_WANDER_MIN_MS + (hashSeed(seed, 1) % (AV_WANDER_MAX_MS - AV_WANDER_MIN_MS));
  const hop = Math.floor(Math.max(0, t) / period);
  const a = ((hashSeed(seed, hop) % 3600) / 3600) * Math.PI * 2;
  const r = radius * Math.sqrt((hashSeed(seed, hop + 7919) % 1000) / 1000);
  return { x: post.x + detCos(a) * r, y: post.y + detSin(a) * r };
}

// An NPC holds its post: it fights what walks into its leash and goes home when the chase is over.
// Cite: creature_template.leash — a guard that follows a runner off the map is not a guard.
const avGuardPost: BgAction = {
  name: 'avGuardPost',
  relevance: () => 60,
  available: (unit) => !!unit.post,
  order: (unit, view) => {
    const post = unit.post!;
    const foe = nearestVisibleEnemy(unit, view);
    if (foe && dist(foe.pos, post) < AV_GUARD_ENGAGE_YD) {
      return { kind: 'attack-move', to: { ...foe.pos } };
    }
    // A wander hop stays inside spawndist of the post, so the walk home falls out of it too.
    const radius = unit.wanderYd ?? 0;
    if (radius > 0) return { kind: 'move', to: avWanderPoint(unit, post, radius, view.t), straight: true };
    if (dist(unit.pos, post) > 2) return { kind: 'move', to: { ...post } };
    return { kind: 'hold' };
  },
};

/** Mine objective ids, so a caller can name them without re-deriving the slug. */
export const AV_MINE_OBJECTIVE_IDS: readonly string[] = AV_MINES.map((m) => avMineObjectiveId(m.id));

/** Where the two AV pushes cross. Exported for the same reason WSG_GEOMETRY.mid is. */
export const AV_MID: BgPos = { ...AV_GEOMETRY.mid };

// ---- Bundles ---------------------------------------------------------------

export const BG_STRATEGIES = {
  'wsg.offense': {
    name: '~wsg.offense',
    actions: [runFlagHome, carrierDisengage, escortCarrier, chaseEnemyCarrier, waitForEscort, grabEnemyFlag, engageNearest, contestMid],
  },
  'wsg.defense': {
    name: '~wsg.defense',
    actions: [returnOurFlag, chaseEnemyCarrier, holdOurBase, engageNearest],
  },
  'wsg.fc-escort': {
    name: '~wsg.fc-escort',
    actions: [runFlagHome, carrierDisengage, escortCarrier, chaseEnemyCarrier, grabEnemyFlag, escortRunner, engageNearest, contestMid],
  },
  'wsg.mid': {
    name: '~wsg.mid',
    actions: [runFlagHome, carrierDisengage, returnOurFlag, chaseEnemyCarrier, escortCarrier, grabEnemyFlag, contestMid, engageNearest],
  },
  // Arathi Basin. No flag actions at all: the WSG bundles walk to WSG_GEOMETRY, which is map 489,
  // so an AB unit on one of them marched off the plate and never touched a banner.
  'ab.assault': {
    name: '~ab.assault',
    actions: [reclaimOurNode, takeNearestNode, engageNearest, grabBaseBuff],
  },
  'ab.defense': {
    name: '~ab.defense',
    actions: [reclaimOurNode, holdOurNode, takeNearestNode, engageNearest, grabBaseBuff],
  },
  // Alterac Valley. Three player jobs and one NPC job. No WSG or AB action appears: both walk to
  // another map's geometry, which is how an AB unit once marched off the Warsong plate.
  'av.offense': {
    name: '~av.offense',
    actions: [avDefendGeneral, avKillCommander, avPushKeep, avReclaimNode, avAssaultNode, engageNearest],
  },
  'av.defense': {
    name: '~av.defense',
    actions: [avDefendGeneral, avReclaimNode, avHoldLine, avKillCommander, avAssaultNode, engageNearest],
  },
  'av.economy': {
    name: '~av.economy',
    actions: [avDefendGeneral, avReclaimNode, avTakeMine, avAssaultNode, engageNearest],
  },
  'av.guard': {
    name: '~av.guard',
    actions: [avGuardPost],
  },
} as const satisfies Record<string, BgStrategy>;

// Bundles for one role. A tier turns bundles on and off (§6a) — it never reaches past this into the
// rotation layer, which stays the player's editable rows at every tier.
export function strategiesForRole(role: BgUnitView['role']): BgStrategy[] {
  switch (role) {
    case 'flag-carrier':
      return [BG_STRATEGIES['wsg.offense']];
    case 'fc-escort':
      return [BG_STRATEGIES['wsg.fc-escort']];
    case 'defense':
      return [BG_STRATEGIES['wsg.defense']];
    case 'mid':
      return [BG_STRATEGIES['wsg.mid']];
    case 'offense':
      return [BG_STRATEGIES['wsg.offense']];
    case 'node-assault':
      return [BG_STRATEGIES['ab.assault']];
    case 'node-defense':
      return [BG_STRATEGIES['ab.defense']];
    case 'av-offense':
      return [BG_STRATEGIES['av.offense']];
    case 'av-defense':
      return [BG_STRATEGIES['av.defense']];
    case 'av-economy':
      return [BG_STRATEGIES['av.economy']];
    case 'npc-guard':
    case 'npc-commander':
      return [BG_STRATEGIES['av.guard']];
    default:
      return [BG_STRATEGIES['wsg.mid'], BG_STRATEGIES['wsg.offense']];
  }
}
