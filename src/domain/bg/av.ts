// Alterac Valley (map 30). The node state machine is BattleGroundAV.cpp:489 ProcessPlayerDestroyedPoint
// + :645/:687 ProcessPlayerAssaults/DefendsPoint, and the reinforcement race is :267 UpdateScore.
// Unlike WSG and AB this map is a PvE-PvP hybrid: mines tick reinforcements, towers and captains
// take them away, quest turn-ins upgrade the troops, and killing a general ends it outright.

import type { BgPos, BgTeam, BgUnit, BgUnitId } from './types.ts';
import { OTHER_TEAM } from './types.ts';
import type { BgWorld } from './bgWorld.ts';
import { detHypot } from '../../engine/core/detMath.ts';
import { AV_DATA, AV_MINES, AV_NODES, AV_QUESTS } from '../../data/alteracValley.ts';
import type { AvNodeRow } from '../../data/alteracValley.ts';

/** Cite: BattleGroundAV.h:41-42. */
export const AV_MAX_NODES = 15;
export const AV_MAX_NODE_DISTANCE_YD = 25;
/** Cite: BattleGroundAV.h:46-47 — both teams open on 600 and lose them one at a time. */
export const AV_SCORE_INITIAL_POINTS = 600;
export const AV_SCORE_NEAR_LOSE = 120;
/** Cite: BattleGroundAV.h:31-32 BG_AV_CAPTIME / BG_AV_SNOWFALL_FIRSTCAP. */
export const AV_CAPTIME_MS = 240_000;
export const AV_SNOWFALL_FIRSTCAP_MS = 300_000;
/** The LONGEST the prep before the horn runs; nothing holds you there and the Start button ends it
 *  whenever you are ready. Cite: BattleGround.cpp:244 BG_START_DELAY_2M, the client's own
 *  doors-shut countdown. */
export const AV_PREP_MS = 120_000;
/** Cite: BattleGroundAV.h:28-29 BG_AV_MINE_TICK_TIMER / BG_AV_MINE_RECLAIM_TIMER. */
export const AV_MINE_TICK_MS = 45_000;
export const AV_MINE_RECLAIM_MS = 1_200_000;

/** Reinforcements a side loses. Cite: BattleGroundAV.h:57/:62 BG_AV_RES_CAPTAIN / _RES_TOWER. */
export const AV_RES_CAPTAIN = 100;
export const AV_RES_TOWER = 75;

/**
 * Flat honor a COMMANDER body pays the player who killed it — a general, a captain or a tower
 * lieutenant. This is the one flat creature-kill honor value 1.12 carries: Player.cpp:6641
 * `AddHonorCP(398.0, HONORABLE, cVictim)`, corroborated by spell_template 24923 / 24965
 * "Honor Points +398" (SPELL_EFFECT_ADD_HONOR, basePoints 397 + dieSides 1). It goes to the
 * KILLER, not the team, so it is not SCORE_BONUS_HONOR; Player.h:1777 `isKill` counts a
 * TYPEID_UNIT victim as an honorable kill, so it banks an HK too.
 * CMaNGOS never pays it — BattleGroundAV.cpp:48-113 only rewards generals and captains, and only
 * as team bonus honor. Operator decision, 2026-08-30, no tier carries a per-rank ladder.
 */
export const AV_HONOR_COMMANDER_KILL = 398;

/** Bonus-honor kill counts. Cite: BattleGroundAV.h:52-76. */
export const AV_KILL_BOSS = 4;
export const AV_KILL_CAPTAIN = 3;
export const AV_KILL_TOWER = 3;
export const AV_KILL_SURVIVING_TOWER = 2;
export const AV_KILL_SURVIVING_CAPTAIN = 2;

/** Reputation, non-holiday. Cite: BattleGroundAV.h:53-83 and .cpp:836-846 Reset. */
export const AV_REP_BOSS = 350;
export const AV_REP_CAPTAIN = 125;
export const AV_REP_TOWER = 12;
export const AV_REP_SURVIVING_TOWER = 12;
export const AV_REP_SURVIVING_CAPTAIN = 125;
export const AV_REP_OWNED_GRAVE = 12;
export const AV_REP_OWNED_MINE = 24;

/** Cite: BattleGroundAV.h:107-110 AVFactions — 730 Stormpike Guard, 729 Frostwolf Clan. */
export const AV_FACTION: Readonly<Record<BgTeam, number>> = Object.freeze({
  alliance: 730,
  horde: 729,
});

/** Cite: BattleGroundAV.h:44 BG_AV_MAX_TOWERS_PER_TEAM. */
export const AV_TOWERS_PER_TEAM = 4;

/** Cite: BattleGroundAV.h:90-97 — 23658 completes 7141/7142; marks 24954 loser / 24955 winner. */
export const AV_SPELL_COMPLETE_QUEST = 23658;
export const AV_MARK_LOSER = 24954;
export const AV_MARK_WINNER = 24955;

/**
 * PRODUCT RULE, the same one AB carries (ab.ts:35, operator-directed): claiming a banner is a 10 s
 * cast that damage, leaving it or dying cancels. 1.12 has no such cast — the AV banners are
 * GOOBER/type-10 objects whose use is instant. Only the 4 minute burn above is 1.12.
 */
export const AV_CAPTURE_CAST_MS = 10_000;

// AVEventTypes slots the match drives directly. Cite: BattleGroundAV.h:246-266.
const EVENT_MINE_BOSS_FIRST = 46;
const EVENT_CAPTAIN_A = 48;
const EVENT_CAPTAIN_H = 49;
const EVENT_MARSHAL_FIRST = 52;
const EVENT_HERALD = 60;
const EVENT_BOSS_A = 61;
const EVENT_BOSS_H = 62;

/** m_teamQuestStatus slot 0 steps the graveyard defenders at 25 / 50 / 75 turn-ins of 20 scraps. */
export const AV_SCRAP_UPGRADE_STEPS = [500, 1000, 1500] as const;

export type AvNodeId = string;

/** POINT_ASSAULTED / POINT_CONTROLLED. Cite: BattleGroundAV.h:296-300 AVStates. */
export type AvNodeState = 'assaulted' | 'owned';

export interface AvNodeInfo {
  id: AvNodeId;
  index: number;
  name: string;
  kind: 'graveyard' | 'tower';
  owner: BgTeam | null;
  prevOwner: BgTeam | null;
  totalOwner: BgTeam | null;
  state: AvNodeState;
  /** Match clock ms the assault completes on, or undefined while controlled. */
  timerMs?: number;
}

export interface AvMineInfo {
  id: string;
  index: number;
  name: string;
  owner: BgTeam | null;
  /** Match clock ms of the next reinforcement tick. */
  nextTickMs: number;
  /** Match clock ms the mine reverts to neutral. Cite: .cpp:335 BG_AV_MINE_RECLAIM_TIMER. */
  reclaimAtMs?: number;
}

export type AvEventKind =
  | 'assault' | 'defend' | 'destroy'
  | 'claim-start' | 'claim-break'
  | 'mine-taken' | 'mine-tick'
  | 'tower-destroyed' | 'captain-dead' | 'boss-dead' | 'commander-killed'
  | 'reinforcement' | 'near-lose'
  | 'quest' | 'troops-upgraded'
  | 'honor' | 'reputation' | 'end';

export interface AvEvent {
  t: number;
  kind: AvEventKind;
  team: BgTeam;
  node?: AvNodeId;
  mine?: string;
  unit?: BgUnitId;
  /** Honor / reputation / reinforcement amounts, in their own unit. */
  amount?: number;
  /** quest only. */
  questId?: number;
  /** troops-upgraded only: the defender tier the team just reached, 0-3. */
  tier?: number;
  score?: Record<BgTeam, number>;
  /** The player-facing line, already sourced (mangos_string 759-790). */
  text?: string;
}

/** Announce lines, mangos_string 759-765 / 787-790, with the %s slots already filled. */
const TEXT = {
  towerTaken: (node: string, team: string) => `${node} was destroyed by the ${team}!`,
  towerAssaulted: (node: string, team: string) =>
    `The ${node} is under attack! If left unchecked, the ${team} will destroy it!`,
  towerDefended: (node: string, team: string) => `The ${node} was taken by the ${team}!`,
  graveTaken: (node: string, team: string) => `The ${node} was taken by the ${team}!`,
  graveDefended: (node: string, team: string) => `The ${node} was taken by the ${team}!`,
  graveAssaulted: (node: string, team: string) =>
    `The ${node} is under attack! If left unchecked, the ${team} will capture it!`,
  mineTaken: (team: string, mine: string) =>
    `The ${team} has taken the ${mine}! Its supplies will now be used for reinforcements!`,
  nearLose: (team: string) => `The ${team} Team is running out of reinforcements!`,
  generalDead: (team: string) => `The ${team} General is Dead!`,
} as const;

/** LANG_BG_ALLY / LANG_BG_HORDE — what the herald calls each side in those lines. */
const SIDE_NAME: Readonly<Record<BgTeam, string>> = Object.freeze({
  alliance: 'Alliance',
  horde: 'Horde',
});
/** The two generals by their faction, for mangos_string 789/790. */
const GENERAL_OF: Readonly<Record<BgTeam, string>> = Object.freeze({
  alliance: 'Stormpike',
  horde: 'Frostwolf',
});

export const AV_GEOMETRY = Object.freeze({
  start: {
    alliance: AV_DATA.start.alliance ?? { x: 873.002, y: -491.284, z: 96.542 },
    horde: AV_DATA.start.horde ?? { x: -818.557, y: -619.255, z: 54.039 },
  },
  /** Field of Strife — where the two pushes meet. Snowfall is its one objective. */
  mid: (() => {
    const snow = AV_NODES.find((n) => n.id === 'snowfall-graveyard');
    return { x: snow?.x ?? -202.549, y: snow?.y ?? -112.815 };
  })(),
});

/**
 * The team's own keep — where its general stands and where a broken push falls back to.
 * Cite: alteracValley.commanders.boss, `creature` 11948 / 11946 @ map 30.
 */
export function avKeep(team: BgTeam): BgPos {
  const boss = AV_DATA.commanders.boss[team];
  return boss ? { x: boss.x, y: boss.y } : AV_GEOMETRY.start[team];
}

/** Node ids in AVNodeIds order — the objective ids BgWorld holds. */
export const AV_NODE_IDS: readonly AvNodeId[] = AV_NODES.map((n) => n.id);

/** Every tower, in AVNodeIds order. Four per team. */
export const AV_TOWER_IDS: readonly AvNodeId[] = AV_NODES.filter((n) => n.kind === 'tower').map((n) => n.id);

/** Objective id for a mine, so the strategy layer can route to one without a map constant. */
export function avMineObjectiveId(mine: string): string {
  return `mine-${mine}`;
}

/**
 * What clicking this banner would do for `team`, or null when it would do nothing.
 * Cite: BattleGroundAV.cpp:606-624 HandlePlayerClickedOnFlag routes on the node's own state, and
 * :687/:645 refuse an assault by the current owner or by the node's totalOwner.
 */
export function avClaimIntent(node: AvNodeInfo, team: BgTeam): 'assault' | 'defend' | null {
  if (node.owner === team) return null;
  if (node.state === 'owned') return node.totalOwner === team ? null : 'assault';
  // ASSAULTED: the previous holder clicks it back, and the neutral-Snowfall case re-assaults
  // instead (.cpp:672-677 — the middle graveyard has no owner to defend it back to).
  if (node.totalOwner === null) return 'assault';
  return node.prevOwner === team ? 'defend' : null;
}

/** Nodes of `kind` this team currently holds outright. */
export function avHeld(nodes: readonly AvNodeInfo[], team: BgTeam, kind?: 'graveyard' | 'tower'): AvNodeInfo[] {
  return nodes.filter(
    (n) => n.state === 'owned' && n.owner === team && (kind == null || n.kind === kind),
  );
}

export interface AvFieldHooks {
  /**
   * Swap one `creature_battleground` event slot to `variant`, despawning the others.
   * `null` despawns the whole slot. Cite: BattleGroundAV.cpp:596 SpawnEvent(node, teamIdx*2+state).
   */
  spawnEvent(event1: number, variant: number | null): void;
  /** True while that creature entry still has a living body on the field. */
  entryAlive(entry: number): boolean;
}

export interface AvInstallOpts {
  hooks?: AvFieldHooks;
  /** BG weekend raises every reputation payout. Cite: BattleGroundAV.cpp:836-846. */
  weekend?: boolean;
}

/** The live match: node/mine state plus the handlers the session calls when something dies. */
export interface AvMatch {
  events: AvEvent[];
  nodes(): readonly AvNodeInfo[];
  node(id: AvNodeId): AvNodeInfo | undefined;
  mines(): readonly AvMineInfo[];
  /** Reinforcements left, both sides. */
  score(): Record<BgTeam, number>;
  /** Towers of `team` still standing. Cite: .cpp:850 m_homeTowersControlled. */
  towersControlled(team: BgTeam): number;
  /** The nine tracked quest counters. Cite: .cpp:562 m_teamQuestStatus. */
  questStatus(team: BgTeam): readonly number[];
  /** Graveyard defender tier 0-3 this team's turn-ins have reached. */
  defenderTier(team: BgTeam): number;
  /** A player of `team` died. Cite: .cpp:38-45 HandleKillPlayer — one reinforcement. */
  killPlayer(team: BgTeam): void;
  /** A creature `by` killed; `unit` is the killer's seat, for the per-player row. Cite: .cpp:47-113. */
  killUnit(entry: number, by: BgTeam, unit?: BgUnitId): void;
  /** A quest turn-in. Cite: .cpp:156-266 HandleQuestComplete. */
  completeQuest(questId: number, team: BgTeam): void;
  /** End-of-match bonus honor and reputation. Cite: .cpp:360-419 EndBattleGround. */
  settle(winner: BgTeam | null): AvEvent[];
}

/** Where a dead unit of `team` comes back: the owned graveyard nearest the corpse, else the keep. */
export function avGraveyard(world: BgWorld, team: BgTeam, from?: BgPos): BgPos {
  const at = from ?? world.startPos[team];
  const base = AV_GEOMETRY.start[team];
  let best: BgPos = { x: base.x, y: base.y };
  let bestD = Infinity;
  for (const row of AV_NODES) {
    if (row.kind !== 'graveyard' || !row.graveyard) continue;
    const obj = world.objectives.get(row.id);
    // Cite: .cpp:527/:700 — the link is set on DESTROY and cleared the moment it is assaulted, so
    // a contested graveyard rezzes nobody.
    if (obj?.state !== 'owned' || obj.owner !== team) continue;
    const d = detHypot(row.graveyard.x - at.x, row.graveyard.y - at.y);
    if (d < bestD) { bestD = d; best = { x: row.graveyard.x, y: row.graveyard.y }; }
  }
  return best;
}

/** A claim running on one node. */
interface AvClaim {
  unit: BgUnitId;
  team: BgTeam;
  intent: 'assault' | 'defend';
  startedMs: number;
  hpAtStart: number;
}

const nodeRowByIndex = new Map<number, AvNodeRow>(AV_NODES.map((n) => [n.index, n]));

/** Install AV rules onto a world and return the live match handle. */
export function installAv(world: BgWorld, opts: AvInstallOpts = {}): AvMatch {
  const events: AvEvent[] = [];
  const hooks = opts.hooks ?? null;
  const repMult = opts.weekend ? 1.5 : 1;
  const log = (e: AvEvent): void => { events.push(e); };

  world.startPos.alliance = { x: AV_GEOMETRY.start.alliance.x, y: AV_GEOMETRY.start.alliance.y };
  world.startPos.horde = { x: AV_GEOMETRY.start.horde.x, y: AV_GEOMETRY.start.horde.y };
  world.graveyardOf = (team, unit) => avGraveyard(world, team, unit?.pos);

  world.score.alliance = AV_SCORE_INITIAL_POINTS;
  world.score.horde = AV_SCORE_INITIAL_POINTS;

  // ---- node state, straight off avNodeDefaults ------------------------------
  const nodes: AvNodeInfo[] = AV_NODES.map((row) => ({
    id: row.id,
    index: row.index,
    name: row.name,
    kind: row.kind,
    owner: row.owner,
    prevOwner: row.owner,
    totalOwner: row.owner,
    state: 'owned' as AvNodeState,
  }));
  const nodeById = new Map<AvNodeId, AvNodeInfo>(nodes.map((n) => [n.id, n]));

  for (const n of nodes) {
    world.addObjective({
      id: n.id,
      kind: n.kind === 'tower' ? 'tower' : 'node',
      pos: { x: nodeRowByIndex.get(n.index)!.x, y: nodeRowByIndex.get(n.index)!.y },
      owner: n.owner,
      state: n.state,
      prevOwner: n.prevOwner,
      totalOwner: n.totalOwner,
    });
    // The bodies this node's current state spawns: teamIdx * BG_AV_MAX_STATES + state.
    hooks?.spawnEvent(n.index, eventVariantOf(n));
    if (n.kind === 'graveyard' && n.owner) {
      hooks?.spawnEvent(AV_MAX_NODES + n.index, teamIndex(n.owner) * 4);
    }
  }

  // Cite: BattleGroundAV.cpp:865-876 Reset — the captains, the herald, the two generals and one
  // marshal per tower are armed at event2 = 0 before the match opens. Without this the field has
  // no commander on it at all: 0 generals, 0 captains, 0 lieutenants, and a tower push buys
  // nothing because there is no marshal to despawn.
  hooks?.spawnEvent(EVENT_CAPTAIN_A, 0);
  hooks?.spawnEvent(EVENT_CAPTAIN_H, 0);
  hooks?.spawnEvent(EVENT_HERALD, 0);
  hooks?.spawnEvent(EVENT_BOSS_A, 0);
  hooks?.spawnEvent(EVENT_BOSS_H, 0);
  for (let i = 0; i < AV_TOWER_IDS.length; i++) hooks?.spawnEvent(EVENT_MARSHAL_FIRST + i, 0);

  const mines: AvMineInfo[] = AV_MINES.map((m) => ({
    id: m.id, index: m.index, name: m.name, owner: null, nextTickMs: 0,
  }));
  for (const m of AV_MINES) {
    if (!m.at) continue;
    world.addObjective({
      id: avMineObjectiveId(m.id),
      kind: 'node',
      pos: { x: m.at.x, y: m.at.y },
      owner: null,
      state: 'neutral',
    });
    // The neutral mine crew holds it until somebody kills the leader (.cpp:104-113).
    hooks?.spawnEvent(m.trashEvent, 2);
    hooks?.spawnEvent(EVENT_MINE_BOSS_FIRST + m.index, 2);
  }

  const questStatus: Record<BgTeam, number[]> = {
    alliance: new Array<number>(9).fill(0),
    horde: new Array<number>(9).fill(0),
  };
  const homeTowers: Record<BgTeam, number> = { alliance: AV_TOWERS_PER_TEAM, horde: AV_TOWERS_PER_TEAM };
  const informedNearLose: Record<BgTeam, boolean> = { alliance: false, horde: false };
  const claims = new Map<AvNodeId, AvClaim>();

  const questById = new Map(AV_QUESTS.map((q) => [q.id, q]));
  const lieutenantOf = new Map<AvNodeId, number>();
  for (const l of AV_DATA.commanders.lieutenants) {
    if (l.node && l.entry) lieutenantOf.set(l.node, l.entry);
  }
  /** The bodies AV_HONOR_COMMANDER_KILL is paid for: both generals, both captains, all eight
   *  tower lieutenants. The client's "Leaders Killed" column counts the same set. */
  const commanderEntries = new Set<number>();
  for (const row of [
    AV_DATA.commanders.boss.alliance, AV_DATA.commanders.boss.horde,
    AV_DATA.commanders.captain.alliance, AV_DATA.commanders.captain.horde,
    ...AV_DATA.commanders.lieutenants,
  ]) {
    if (row?.entry) commanderEntries.add(row.entry);
  }

  function teamIndex(team: BgTeam): number {
    return team === 'alliance' ? 0 : 1;
  }
  /** teamIdx * BG_AV_MAX_STATES + state, with state 0 = assaulted, 1 = controlled (.cpp:596). */
  function eventVariantOf(n: AvNodeInfo): number | null {
    if (!n.owner) return null;
    return teamIndex(n.owner) * 2 + (n.state === 'owned' ? 1 : 0);
  }

  function sync(n: AvNodeInfo): void {
    const obj = world.objectives.get(n.id);
    if (!obj) return;
    obj.owner = n.owner;
    obj.prevOwner = n.prevOwner;
    obj.totalOwner = n.totalOwner;
    obj.state = n.state;
    obj.timerMs = n.timerMs;
  }

  function defenderTier(team: BgTeam): number {
    const scraps = questStatus[team][0]!;
    let tier = 0;
    for (const step of AV_SCRAP_UPGRADE_STEPS) if (scraps >= step) tier++;
    return tier;
  }

  /** Re-spawn a node's own bodies, and a graveyard's defenders at the team's current tier. */
  function populate(n: AvNodeInfo): void {
    if (!hooks) return;
    hooks.spawnEvent(n.index, eventVariantOf(n));
    if (n.kind !== 'graveyard') return;
    if (!n.owner) { hooks.spawnEvent(AV_MAX_NODES + n.index, null); return; }
    const variant = n.state === 'owned'
      ? teamIndex(n.owner) * 4 + defenderTier(n.owner)
      : null;
    hooks.spawnEvent(AV_MAX_NODES + n.index, variant);
  }

  // Cite: .cpp:267-292 UpdateScore. Negative points take reinforcements away; 0 ends the match.
  function updateScore(team: BgTeam, points: number): void {
    const next = Math.max(0, world.score[team] + points);
    world.score[team] = next;
    log({ t: world.t, kind: 'reinforcement', team, amount: points, score: { ...world.score } });
    if (points >= 0 || world.ended) return;
    if (next < 1) {
      world.ended = true;
      world.winner = OTHER_TEAM[team];
      log({ t: world.t, kind: 'end', team: OTHER_TEAM[team], score: { ...world.score } });
      return;
    }
    if (!informedNearLose[team] && next < AV_SCORE_NEAR_LOSE) {
      informedNearLose[team] = true;
      log({
        t: world.t, kind: 'near-lose', team,
        text: TEXT.nearLose(SIDE_NAME[team]), score: { ...world.score },
      });
    }
  }

  function reward(team: BgTeam, honorKills: number, rep: number): void {
    if (honorKills > 0) log({ t: world.t, kind: 'honor', team, amount: honorKills });
    if (rep > 0) log({ t: world.t, kind: 'reputation', team, amount: Math.round(rep * repMult) });
  }

  // Cite: .cpp:645-683 AssaultNode — the timer reads prevOwner BEFORE it is reassigned, which is
  // what makes the first Snowfall cap 5 minutes and every later one 4.
  function assault(n: AvNodeInfo, team: BgTeam, unit?: BgUnitId): void {
    n.timerMs = world.t + (n.prevOwner ? AV_CAPTIME_MS : AV_SNOWFALL_FIRSTCAP_MS);
    n.prevOwner = n.owner;
    n.owner = team;
    n.state = 'assaulted';
    sync(n);
    populate(n);
    // Cite: .cpp:699 — isTower picks SCORE_TOWERS_ASSAULTED over SCORE_GRAVEYARDS_ASSAULTED.
    if (unit) world.updatePlayerScore(unit, n.kind === 'tower' ? 'towersAssaulted' : 'gyAssaulted', 1);
    log({
      t: world.t, kind: 'assault', team, node: n.id, unit,
      text: n.kind === 'tower'
        ? TEXT.towerAssaulted(n.name, SIDE_NAME[team])
        : TEXT.graveAssaulted(n.name, SIDE_NAME[team]),
    });
  }

  /** Cite: .cpp:695-706 DefendNode — one click puts a contested node straight back. */
  function defend(n: AvNodeInfo, team: BgTeam, unit?: BgUnitId): void {
    n.prevOwner = n.owner;
    n.owner = team;
    n.state = 'owned';
    n.timerMs = undefined;
    sync(n);
    populate(n);
    // SCORE_GRAVEYARDS_DEFENDED / SCORE_TOWERS_DEFENDED. Cite: BattleGroundAV.cpp:667,:678.
    if (unit) world.updatePlayerScore(unit, n.kind === 'tower' ? 'towersDefended' : 'gyDefended', 1);
    log({
      t: world.t, kind: 'defend', team, node: n.id, unit,
      text: n.kind === 'tower'
        ? TEXT.towerDefended(n.name, SIDE_NAME[team])
        : TEXT.graveDefended(n.name, SIDE_NAME[team]),
    });
  }

  /** Cite: .cpp:489-527 ProcessPlayerDestroyedPoint — the 4 minute burn finishing. */
  function destroy(n: AvNodeInfo): void {
    const owner = n.owner;
    if (!owner) return;
    const loser = OTHER_TEAM[owner];
    n.totalOwner = owner;
    n.prevOwner = owner;
    n.state = 'owned';
    n.timerMs = undefined;
    sync(n);
    populate(n);

    if (n.kind === 'tower') {
      // The tower's lieutenant dies with it — that is what makes a tower push worth making.
      const entry = lieutenantOf.get(n.id);
      const towerSlot = AV_TOWER_IDS.indexOf(n.id);
      if (towerSlot >= 0) hooks?.spawnEvent(EVENT_MARSHAL_FIRST + towerSlot, null);
      updateScore(loser, -AV_RES_TOWER);
      reward(owner, AV_KILL_TOWER, AV_REP_TOWER);
      homeTowers[loser] = Math.max(0, homeTowers[loser] - 1);
      log({
        t: world.t, kind: 'tower-destroyed', team: owner, node: n.id,
        amount: entry, text: TEXT.towerTaken(n.name, SIDE_NAME[owner]),
      });
    } else {
      log({
        t: world.t, kind: 'destroy', team: owner, node: n.id,
        text: TEXT.graveTaken(n.name, SIDE_NAME[owner]),
      });
    }
  }

  /** Cite: .cpp:295-347 ChangeMineOwner. */
  function changeMineOwner(mine: AvMineInfo, team: BgTeam | null): void {
    if (mine.owner === team) return;
    mine.owner = team;
    const row = AV_MINES[mine.index]!;
    const variant = team === null ? 2 : teamIndex(team);
    hooks?.spawnEvent(row.trashEvent, variant);
    hooks?.spawnEvent(EVENT_MINE_BOSS_FIRST + row.index, variant);
    const obj = world.objectives.get(avMineObjectiveId(mine.id));
    if (obj) { obj.owner = team; obj.state = team ? 'owned' : 'neutral'; }
    if (!team) { mine.reclaimAtMs = undefined; return; }
    mine.reclaimAtMs = world.t + AV_MINE_RECLAIM_MS;
    mine.nextTickMs = world.t + AV_MINE_TICK_MS;
    log({
      t: world.t, kind: 'mine-taken', team, mine: mine.id,
      text: TEXT.mineTaken(SIDE_NAME[team], mine.name),
    });
  }

  // ---- the tick -------------------------------------------------------------
  world.onTick = (w) => {
    if (w.ended || !w.gatesOpen) return;

    // 1. banner claims — a 10 s uninterrupted stand, the AB product rule on AV's banners.
    for (const n of nodes) {
      const obj = w.objectives.get(n.id);
      if (!obj) continue;
      const live = claims.get(n.id);
      if (live) {
        const u = w.units.get(live.unit);
        const inRange = !!u && w.alive(u)
          && detHypot(u.pos.x - obj.pos.x, u.pos.y - obj.pos.y) <= AV_MAX_NODE_DISTANCE_YD;
        const hurt = !!u && u.hp < live.hpAtStart;
        const stale = avClaimIntent(n, live.team) !== live.intent;
        if (!inRange || hurt || stale) {
          claims.delete(n.id);
          obj.claimBy = undefined;
          obj.claimEndsMs = undefined;
          log({ t: w.t, kind: 'claim-break', team: live.team, node: n.id, unit: live.unit });
        } else if (w.t - live.startedMs >= AV_CAPTURE_CAST_MS) {
          claims.delete(n.id);
          obj.claimBy = undefined;
          obj.claimEndsMs = undefined;
          if (live.intent === 'assault') assault(n, live.team, live.unit);
          else defend(n, live.team, live.unit);
        } else {
          continue;
        }
      }
      let starter: BgUnit | undefined;
      let intent: 'assault' | 'defend' | null = null;
      for (const u of w.unitsNear(obj.pos.x, obj.pos.y, AV_MAX_NODE_DISTANCE_YD)) {
        if (!w.alive(u) || u.npc) continue; // an NPC guard never flips a banner
        if (detHypot(u.pos.x - obj.pos.x, u.pos.y - obj.pos.y) > AV_MAX_NODE_DISTANCE_YD) continue;
        const want = avClaimIntent(n, u.team);
        if (!want) continue;
        starter = u;
        intent = want;
        break;
      }
      if (!starter || !intent) continue;
      claims.set(n.id, {
        unit: starter.id, team: starter.team, intent, startedMs: w.t, hpAtStart: starter.hp,
      });
      obj.claimBy = starter.id;
      obj.claimEndsMs = w.t + AV_CAPTURE_CAST_MS;
      log({ t: w.t, kind: 'claim-start', team: starter.team, node: n.id, unit: starter.id });
    }

    // 2. the 4 minute burn. Cite: .cpp:344-353 Update.
    for (const n of nodes) {
      if (n.state !== 'assaulted' || n.timerMs == null) continue;
      if (w.t < n.timerMs) continue;
      destroy(n);
      if (w.ended) return;
    }

    // 3. mines: one reinforcement every 45 s, and back to neutral after 20 minutes.
    for (const m of mines) {
      if (!m.owner) continue;
      while (w.t >= m.nextTickMs) {
        m.nextTickMs += AV_MINE_TICK_MS;
        updateScore(m.owner, 1);
        log({ t: w.t, kind: 'mine-tick', team: m.owner, mine: m.id, amount: 1 });
      }
      if (m.reclaimAtMs != null && w.t >= m.reclaimAtMs) changeMineOwner(m, null);
    }
  };

  const match: AvMatch = {
    events,
    nodes: () => nodes,
    node: (id) => nodeById.get(id),
    mines: () => mines,
    score: () => ({ ...world.score }),
    towersControlled: (team) => homeTowers[team],
    questStatus: (team) => questStatus[team],
    defenderTier,

    killPlayer(team) {
      if (world.ended) return;
      updateScore(team, -1);
    },

    killUnit(entry, by, unit) {
      if (world.ended) return;
      // A commander body pays its KILLER a flat 398 and banks an honorable kill, whatever else the
      // death does to the match. Cite: Player.cpp:6629-6641; Player.h:1777.
      if (commanderEntries.has(entry)) {
        if (unit) world.updatePlayerScore(unit, 'leadersKilled', 1);
        log({
          t: world.t, kind: 'commander-killed', team: by, unit,
          amount: AV_HONOR_COMMANDER_KILL,
        });
      }
      const boss = AV_DATA.commanders.boss;
      const captain = AV_DATA.commanders.captain;
      if (boss.alliance && entry === boss.alliance.entry) {
        reward('horde', AV_KILL_BOSS, AV_REP_BOSS);
        world.ended = true;
        world.winner = 'horde';
        log({
          t: world.t, kind: 'boss-dead', team: 'horde',
          text: TEXT.generalDead(GENERAL_OF.alliance), score: { ...world.score },
        });
        return;
      }
      if (boss.horde && entry === boss.horde.entry) {
        reward('alliance', AV_KILL_BOSS, AV_REP_BOSS);
        world.ended = true;
        world.winner = 'alliance';
        log({
          t: world.t, kind: 'boss-dead', team: 'alliance',
          text: TEXT.generalDead(GENERAL_OF.horde), score: { ...world.score },
        });
        return;
      }
      if (captain.alliance && entry === captain.alliance.entry) {
        reward('horde', AV_KILL_CAPTAIN, AV_REP_CAPTAIN);
        updateScore('alliance', -AV_RES_CAPTAIN);
        log({ t: world.t, kind: 'captain-dead', team: 'horde' });
        return;
      }
      if (captain.horde && entry === captain.horde.entry) {
        reward('alliance', AV_KILL_CAPTAIN, AV_REP_CAPTAIN);
        updateScore('horde', -AV_RES_CAPTAIN);
        log({ t: world.t, kind: 'captain-dead', team: 'alliance' });
        return;
      }
      // The mine leaders: whichever variant is standing, killing it hands the mine over.
      for (const m of mines) {
        const row = AV_MINES[m.index]!;
        const leaders = [row.leader.alliance, row.leader.horde, row.leader.neutral];
        if (leaders.some((l) => l?.entry === entry)) {
          changeMineOwner(m, by);
          // The client's "Mines Captured" column, BattleGroundAVScore.secondaryObjectives. The
          // C++ declares the field and the packet ships it, but no caller writes it
          // (BattleGroundAV.cpp:481 is the only mention) - the mine handover is what it names.
          if (unit) world.updatePlayerScore(unit, 'minesCaptured', 1);
          return;
        }
      }
    },

    completeQuest(questId, team) {
      const q = questById.get(questId);
      if (!q || world.ended) return;
      const before = questStatus[team][q.slot]!;
      const after = before + q.step;
      questStatus[team][q.slot] = after;
      reward(team, 0, q.teamRep);
      log({ t: world.t, kind: 'quest', team, questId, amount: after });

      if (q.slot !== 0) return;
      // Cite: .cpp:170-180 — 25 / 50 / 75 armor-scrap turn-ins step the graveyard defenders. The
      // C++ loop runs `i < BG_AV_NODES_FROSTWOLF_HUT`, so the hut itself keeps its old tier.
      if (!AV_SCRAP_UPGRADE_STEPS.some((step) => before < step && after >= step)) return;
      const tier = defenderTier(team);
      for (const n of nodes) {
        if (n.index >= 6 || n.kind !== 'graveyard') continue;
        if (n.owner !== team || n.state !== 'owned') continue;
        populate(n);
      }
      log({ t: world.t, kind: 'troops-upgraded', team, tier });
    },

    // Cite: .cpp:360-419 EndBattleGround — surviving towers, held graveyards and mines, and a
    // captain who lived all pay out once, to each side, after the winner is known.
    settle(winner) {
      const out: AvEvent[] = [];
      const push = (e: AvEvent): void => { out.push(e); events.push(e); };
      for (const team of ['alliance', 'horde'] as const) {
        const towers = homeTowers[team];
        if (towers > 0) {
          push({ t: world.t, kind: 'honor', team, amount: towers * AV_KILL_SURVIVING_TOWER });
          push({
            t: world.t, kind: 'reputation', team,
            amount: Math.round(towers * AV_REP_SURVIVING_TOWER * repMult),
          });
        }
        const graves = avHeld(nodes, team, 'graveyard').length;
        if (graves > 0) {
          push({
            t: world.t, kind: 'reputation', team,
            amount: Math.round(graves * AV_REP_OWNED_GRAVE * repMult),
          });
        }
        const minesHeld = mines.filter((m) => m.owner === team).length;
        if (minesHeld > 0) {
          push({
            t: world.t, kind: 'reputation', team,
            amount: Math.round(minesHeld * AV_REP_OWNED_MINE * repMult),
          });
        }
        const captain = AV_DATA.commanders.captain[team];
        if (captain && (!hooks || hooks.entryAlive(captain.entry))) {
          push({ t: world.t, kind: 'honor', team, amount: AV_KILL_SURVIVING_CAPTAIN });
          push({
            t: world.t, kind: 'reputation', team,
            amount: Math.round(AV_REP_SURVIVING_CAPTAIN * repMult),
          });
        }
      }
      if (winner) push({ t: world.t, kind: 'end', team: winner, score: { ...world.score } });
      return out;
    },
  };

  return match;
}
