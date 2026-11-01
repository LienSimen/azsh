// Battleground core types — the order-intent layer and the information seam. ONE order-intent
// layer for input, touch and bots; and a strategy may read ONLY a per-team `BgView`, never more.

import type { CombatantSpec } from '../../engine/combat.ts';

export type BgTeam = 'alliance' | 'horde';
export type BgUnitId = string;

/** Planar world position on the BG map (the DB's x/y; z is terrain and rides on the unit). */
export interface BgPos {
  x: number;
  y: number;
}

export const OTHER_TEAM: Readonly<Record<BgTeam, BgTeam>> = Object.freeze({
  alliance: 'horde',
  horde: 'alliance',
});

// §6b: the single order union. Everything that can direct a unit produces one of these. A unit holds
// exactly one order; issuing a new one replaces it.
export type BgOrder =
  | { kind: 'move'; to: BgPos; /** Shift-click: append as a waypoint, don't replace. */ queue?: boolean;
      /** Raycast the mesh instead of routing a corridor. Cite: PathFinder.cpp:1357 m_straightLine. */
      straight?: boolean }
  | { kind: 'attack-move'; to: BgPos }
  | { kind: 'hold' }
  | { kind: 'patrol'; waypoints: readonly BgPos[]; index: number }
  | { kind: 'follow'; target: BgUnitId }
  | { kind: 'assist'; target: BgUnitId }
  | { kind: 'use-object'; objectId: string }
  | { kind: 'cast-on'; spellId: number; target: BgUnitId }
  | { kind: 'retreat'; to: BgPos };

/** Battle role a strategy assigns. Not a class role — a job on this map. */
export type BgRole =
  | 'flag-carrier'
  | 'fc-escort'
  | 'offense'
  | 'defense'
  | 'mid'
  | 'flex'
  /** AB: take the nearest base this team does not hold. */
  | 'node-assault'
  /** AB: sit on the base we hold that the enemy is closest to. */
  | 'node-defense'
  /** AV: push the enemy line — take the next tower or graveyard toward their keep. */
  | 'av-offense'
  /** AV: hold the towers and graveyards behind our line, and the boss room. */
  | 'av-defense'
  /** AV: the mine and quest-item economy — the reinforcement tick and the troop upgrades. */
  | 'av-economy'
  /** AV: a battleground NPC — a tower guard, a mine trogg, a spirit guide. Never a player seat. */
  | 'npc-guard'
  /** AV: a general, a captain or a tower lieutenant — the body a push is aimed at. */
  | 'npc-commander';

/** A unit in the battleground: human-driven or bot-driven, identically. */
export interface BgUnit {
  id: BgUnitId;
  team: BgTeam;
  name: string;
  cls: number;
  level: number;
  pos: BgPos;
  /** Terrain height, carried so the nav mask and the renderer agree. */
  z: number;
  hp: number;
  maxHp: number;
  /** Dead units hold a respawn deadline; the graveyard cycle revives them (§13b). */
  deadUntilMs?: number;
  /** Honorless Target 2479 expiry on the match clock. Cite: Player.cpp:6626; MovementHandler.cpp:241–242. */
  honorlessUntilMs?: number;
  role: BgRole;
  order: BgOrder;
  /** Combat spec — only needed when a shard is folded into a real createSession. */
  spec?: CombatantSpec;
  /** Does this seat heal? The attrition resolver reads it; absent, it falls back to the class. */
  heals?: boolean;
  /** Movement speed, yards/second. */
  speedYd: number;
  /** Set while this unit carries an enemy flag (the aura id, 23333 / 23335). */
  carryingFlag?: number;
  /** True for a seat a human is driving; bots are false. Interchangeable at any seat (§0). */
  human: boolean;
  /** Which engagement shard this unit is currently in, if any. */
  shard?: number;
  /**
   * A battleground NPC rather than a player seat: the creature it is, and the post it holds.
   * Cite: BattleGroundAV.cpp:114 HandleCreatureCreate — AV's field is creature spawns, not seats.
   */
  npc?: BgNpcBody;
}

/** The NPC half of a BgUnit: which creature, which event slot spawned it, where it stands. */
export interface BgNpcBody {
  /** creature_template.Entry. */
  entry: number;
  /** `creature_battleground` event1/event2 that owns this body, when it has one. */
  event1?: number;
  event2?: number;
  /** Spawn point — a guard walks back to it and never chases past `leashYd`. */
  post: BgPos;
  /** Hostile to BOTH sides in 1.12 — the wildlife and the mine trash. `team` is only the side its
   *  body fights ON (neutralSideFor); it never makes the body a member of that team's raid. */
  neutral?: boolean;
  /** How far it may leave `post` before it turns around. */
  leashYd: number;
  /** `creature.spawndist` when MovementType is 1 (MOVEMENT_RANDOM); absent means it stands still.
   *  Cite: RandomMovementGenerator.cpp:163 WanderMovementGenerator, respawn coord + radius. */
  wanderYd?: number;
}

/** A body the player may order: a seat on their own side. An AV creature never is, whichever side
 *  `neutralSideFor` parked it on. Cite: BattleGroundAV.cpp:114 HandleCreatureCreate. */
export function isCommandableBy(u: BgUnit, team: BgTeam): boolean {
  return u.team === team && !u.npc;
}

/** A map objective — a flag, a node, a tower. Owned or neutral. */
export interface BgObjective {
  id: string;
  kind: 'flag' | 'node' | 'tower' | 'powerup';
  pos: BgPos;
  /** Team that currently owns it; null = neutral / contested. */
  owner: BgTeam | null;
  /**
   * For flags: 'base' | 'carried' | 'ground' (WSPickedUpFlagStates). For AB nodes:
   * 'neutral' | 'assaulted' | 'owned' (ABNodeStatus, BattleGroundAB.h:104-111).
   */
  state?: string;
  /** Unit carrying it, when state === 'carried'. */
  carrier?: BgUnitId;
  /**
   * AB nodes: who held it before the running assault. Cite: BattleGroundAB.cpp:309 — a contested
   * node whose PREVIOUS status was occupied is defended back, not re-assaulted, so the state
   * machine cannot be expressed without it.
   */
  prevOwner?: BgTeam | null;
  /**
   * AV nodes: the last team that DESTROYED this node, which is not the same as owning it.
   * Cite: BattleGroundAV.h:566 AVNodeInfo.totalOwner — an assault is refused when the assaulting
   * team is already the totalOwner, and Snowfall stays neutral until somebody first destroys it.
   */
  totalOwner?: BgTeam | null;
  /** AB / AV: the unit whose 10 s banner claim is running, and the clock it completes on. */
  claimBy?: BgUnitId;
  claimEndsMs?: number;
  /** Wall-clock ms this objective's current timer expires (respawn / capture). */
  timerMs?: number;
}

// What ONE team may know: own units in full, enemies only as far as they are perceptible. Bots are
// held to player information at EVERY tier — tiers differ in quality and reaction, never vision.
export type ScoreType =
  | 'kills' | 'deaths' | 'honorKills' | 'caps' | 'defends' | 'bonusHonor'
  | 'gyAssaulted' | 'gyDefended' | 'towersAssaulted' | 'towersDefended'
  | 'minesCaptured' | 'leadersKilled' | 'secondaryObjectives';

/** One MSG_PVP_LOG_DATA row. Field order and the AV block are BattleGroundMgr.cpp:150-170. */
export interface BgScoreboardEntry {
  /** SCORE_KILLING_BLOWS. Cite: BattleGround.h:169-172. */
  kills: number;
  deaths: number;
  honorKills: number;
  /** SCORE_BONUS_HONOR — RewardHonorToTeam only, never a player kill. Cite: BattleGround.cpp:626. */
  bonusHonor: number;
  /** SCORE_FLAG_CAPTURES / *_ASSAULTED. Cite: BattleGround.h:175,:178,:181,:183. */
  caps: number;
  /** SCORE_*_DEFENDED — the click that puts a burning point straight back. Cite: .h:179,:182,:184. */
  defends: number;
  /** SCORE_GRAVEYARDS_ASSAULTED / _DEFENDED. Cite: BattleGroundAV.cpp:469-473. */
  gyAssaulted: number;
  gyDefended: number;
  /** SCORE_TOWERS_ASSAULTED / _DEFENDED. Cite: BattleGroundAV.cpp:475-479. */
  towersAssaulted: number;
  towersDefended: number;
  /** The client's "Mines Captured": BattleGroundAVScore.secondaryObjectives. Cite: BattleGroundMgr.cpp:162. */
  minesCaptured: number;
  /** The client's "Leaders Killed": BattleGroundAVScore.lieutnantCount. Cite: BattleGroundMgr.cpp:168. */
  leadersKilled: number;
  /** The client's "Secondary Objectives": BattleGroundAVScore.secondaryNPC. Cite: BattleGroundMgr.cpp:169. */
  secondaryObjectives: number;
}

/** A fresh row. One factory, so a new packet field cannot be half-initialised at two call sites. */
export function emptyBgScore(): BgScoreboardEntry {
  return {
    kills: 0, deaths: 0, honorKills: 0, bonusHonor: 0, caps: 0, defends: 0,
    gyAssaulted: 0, gyDefended: 0, towersAssaulted: 0, towersDefended: 0,
    minesCaptured: 0, leadersKilled: 0, secondaryObjectives: 0,
  };
}

export interface BgView {
  team: BgTeam;
  /** Match clock, ms since gates opened (negative during the countdown). */
  t: number;
  /** Own team, in full. */
  own: readonly BgUnitView[];
  /** Enemies this team can currently perceive. NOT the enemy roster. */
  enemies: readonly BgUnitView[];
  objectives: readonly BgObjective[];
  score: Readonly<Record<BgTeam, number>>;
  scoreboard: ReadonlyMap<BgUnitId, BgScoreboardEntry>;
  /** The vision rules this view was built under (§6g config table). */
  vision: BgVisionConfig;
}

/** A unit as seen through a view — no spec, no order, no internals. */
export interface BgUnitView {
  id: BgUnitId;
  team: BgTeam;
  name: string;
  cls: number;
  level: number;
  pos: BgPos;
  hpPct: number;
  alive: boolean;
  role: BgRole;
  carryingFlag?: number;
  /** Only present for own units — an enemy's job is not visible. */
  order?: BgOrder;
  /** NPCs only: the spawn point it guards. Where a creature stands is not hidden information. */
  post?: BgPos;
  /** NPCs only: MOVEMENT_RANDOM radius around `post`, 0 for a body that holds still. */
  wanderYd?: number;
}

// Per-tier vision. The seam is architecture; the amount is config (§6g). Defaults are player-equivalent;
// every field that loosens them is opt-in and logged.
export interface BgVisionConfig {
  /** Ignore line of sight — see through terrain. Default false. */
  seeThroughWalls: boolean;
  /** Ignore stealth. Default false. */
  seeStealthed: boolean;
  /** Hard sight radius in yards. Beyond this an enemy is unseen even in the open. */
  sightYd: number;
  /** ms a bot waits before reacting to something new — the honest difficulty axis. */
  reactionDelayMs: number;
}

/** Held to player information. The default at every tier. */
export const FAIR_VISION: BgVisionConfig = Object.freeze({
  seeThroughWalls: false,
  seeStealthed: false,
  sightYd: 100,
  reactionDelayMs: 0,
});

// Strategy layer (§6a) — mangosbot relevance idiom, BgView-only

// One thing a team can decide to do with one unit. Mirrors `BotAction` but the signature takes
// ONLY the view, so it is not possible to write a BG action that reads the opposing roster.
export interface BgAction {
  name: string;
  /** Preference weight when available; higher wins. */
  relevance(unit: BgUnitView, view: BgView): number;
  /** Trigger: is this worth doing for this unit right now? */
  available(unit: BgUnitView, view: BgView): boolean;
  /** The order to issue. Returning null falls through to the next action. */
  order(unit: BgUnitView, view: BgView): BgOrder | null;
}

/** A toggleable, named bundle of actions (mangosbot strategy). */
export interface BgStrategy {
  name: string;
  actions: readonly BgAction[];
}

/** Flatten active bundles to the action list the policy chooses from. */
export function bgActionsOf(strategies: readonly BgStrategy[]): BgAction[] {
  return strategies.flatMap((s) => [...s.actions]);
}

// Pick the highest-relevance available action for one unit and return its order. Ties break on action
// order, so a bundle list is a priority list.
export function pickBgOrder(
  unit: BgUnitView,
  view: BgView,
  actions: readonly BgAction[],
): { order: BgOrder; action: string } | null {
  let best: { order: BgOrder; action: string; rel: number } | null = null;
  for (const a of actions) {
    if (!a.available(unit, view)) continue;
    const rel = a.relevance(unit, view);
    if (best && rel <= best.rel) continue;
    const order = a.order(unit, view);
    if (!order) continue;
    best = { order, action: a.name, rel };
  }
  return best ? { order: best.order, action: best.action } : null;
}
