// Death state, corpse reclaim delay and closest-graveyard selection. Pure. Cite: Player.cpp KillPlayer
// ~4411, getCorpseReclaimDelayHelper ~1360; GraveyardManager.cpp GetClosestGraveYard.

/** CMaNGOS Unit.h DeathState (player-facing subset; DEAD/JUST_* exist on Unit). */
export type DeathState = 'ALIVE' | 'JUST_DIED' | 'CORPSE' | 'GHOST' | 'JUST_ALIVED';

/** Time constants — Common.h TimeConstants. */
export const MINUTE = 60;
export const IN_MILLISECONDS = 1000;

// Seconds between death-expire steps used to index reclaim delay. Cite: Player.cpp `#define
// DEATH_EXPIRE_STEP (5*MINUTE)`.
export const DEATH_EXPIRE_STEP = 5 * MINUTE; // 300 s

/** Max death-count index into corpseReclaimDelay. Cite: Player.cpp `#define MAX_DEATH_COUNT 3`. */
export const MAX_DEATH_COUNT = 3;

// Reclaim delay table (seconds) for death-count indices 0..2. Cite: Player.cpp `static const uint32
// corpseReclaimDelay[MAX_DEATH_COUNT] = {30, 60, 120};`
export const CORPSE_RECLAIM_DELAY_SEC: readonly number[] = [30, 60, 120];

// Auto-release / repop window after death (ms). Cite: Player.cpp KillPlayer — `m_deathTimer = 6 * MINUTE *
// IN_MILLISECONDS`.
export const DEATH_TIMER_MS = 6 * MINUTE * IN_MILLISECONDS; // 360_000

// Corpse reclaim delay in ms for a recent-death window index, a port of getCorpseReclaimDelayHelper
// with the default configs. Returns 0 when the caller models the delay config off.
export function computeReclaimDelayMs(
  deaths: number,
  pvp: boolean,
  reclaimDelayEnabled = true,
): number {
  void pvp; // same table when both configs true (World.cpp defaults)
  if (!reclaimDelayEnabled) return 0;
  let count = Math.floor(Math.max(0, deaths));
  if (count >= MAX_DEATH_COUNT) count = MAX_DEATH_COUNT - 1;
  return CORPSE_RECLAIM_DELAY_SEC[count]! * IN_MILLISECONDS;
}

// Advance death-expire wall time after a kill (pure mirror of UpdateCorpseReclaimDelay). Cite: Player.cpp
// ~18928–18947. Returns new `deathExpireTime` (unix seconds).
export function updateDeathExpireTime(
  nowSec: number,
  deathExpireTime: number,
  reclaimDelayEnabled = true,
): number {
  if (!reclaimDelayEnabled) return deathExpireTime;
  if (nowSec < deathExpireTime) {
    // full and partly periods 1..3
    const count = Math.floor((deathExpireTime - nowSec) / DEATH_EXPIRE_STEP + 1);
    if (count < MAX_DEATH_COUNT) {
      return nowSec + (count + 1) * DEATH_EXPIRE_STEP;
    }
    return nowSec + MAX_DEATH_COUNT * DEATH_EXPIRE_STEP;
  }
  return nowSec + DEATH_EXPIRE_STEP;
}

// Compute reclaim delay from absolute expire timestamps (full helper shape). Cite:
// getCorpseReclaimDelayHelper(deathExpirationTime, time, pvp).
export function computeReclaimDelayFromExpire(
  deathExpireTimeSec: number,
  nowSec: number,
  pvp: boolean,
  reclaimDelayEnabled = true,
): number {
  if (!reclaimDelayEnabled) return 0;
  const t = nowSec > deathExpireTimeSec ? deathExpireTimeSec : nowSec;
  const count = Math.floor((deathExpireTimeSec - t) / DEATH_EXPIRE_STEP);
  return computeReclaimDelayMs(count, pvp, true);
}

/** Team ids — SharedDefines.h Team ALLIANCE=469, HORDE=67. */
export const TEAM_ALLIANCE = 469;
export const TEAM_HORDE = 67;
/** Neutral / both-allowed graveyard link. */
export const TEAM_BOTH = 0;

export interface GraveyardEntry {
  id: number;
  /** Zone (or area) this GY is linked to — game_graveyard_zone. */
  zoneId: number | string;
  /** Team affinity: ALLIANCE(469), HORDE(67), or 0 / BOTH for neutral. */
  team: number;
  x: number;
  y: number;
  z: number;
  mapId?: number;
}

// Setting-gated death loop mode: 'repair-only' is an immediate half-HP revive with death durability
// and no ghost; 'full' releases to a ghost at the closest graveyard.
export type DeathFlowMode = 'repair-only' | 'full';

/** Corpse reclaim interaction radius (yards). Cite: Entities/Corpse.h `#define CORPSE_RECLAIM_RADIUS 39` */
export const CORPSE_RECLAIM_RADIUS = 39;

// Spirit-healer durability loss on resurrect (equipped + inventory bags). Cite: NPCHandler.cpp
// SendSpiritResurrect — `DurabilityLossAll(0.25f, true)`.
export const SPIRIT_HEALER_DURABILITY_LOSS = 0.25;

/** Player corpse at death location (CreateCorpse / BuildPlayerRepop). */
export interface CorpseRecord {
  x: number;
  y: number;
  z: number;
  mapId?: number;
  /** Zone where the player died (Phonecraft string id or numeric area). */
  zoneId: number | string;
  // Epoch ms when spirit released (Corpse ghost time). Cite: MiscHandler.cpp — `corpse->GetGhostTime() +
  // GetCorpseReclaimDelay(...)`. 0 until release.
  ghostTimeMs: number;
  pvp: boolean;
}

// Pure player death-flow snapshot (CORPSE / GHOST / ALIVE). Engine holds one of these when mode is `full`;
// absent/`ALIVE` otherwise.
export interface DeathFlowState {
  deathState: DeathState;
  corpse: CorpseRecord | null;
  /** Ghost (or corpse-body) world position. */
  position: Position3 | null;
  /** Selected graveyard after release (null if none found). */
  graveyard: GraveyardEntry | null;
  /** m_deathExpireTime (unix seconds) for reclaim delay stacking. */
  deathExpireTimeSec: number;
  /** Reclaim delay locked at kill (ms), from getCorpseReclaimDelayHelper. */
  reclaimDelayMs: number;
  /** Epoch ms of KillPlayer (death timer start). */
  deathAtMs: number;
}

/** Alive / no pending corpse (fresh char or after successful resurrect). */
export function createAliveDeathFlow(deathExpireTimeSec = 0): DeathFlowState {
  return {
    deathState: 'ALIVE',
    corpse: null,
    position: null,
    graveyard: null,
    deathExpireTimeSec,
    reclaimDelayMs: 0,
    deathAtMs: 0,
  };
}

/** True when the full ghost loop should run (not repair-only autopilot). */
export function usesFullDeathFlow(mode: DeathFlowMode | undefined | null): boolean {
  return mode === 'full';
}

// Map a baked `DataBundle.graveyards` row into GraveyardEntry. Prefer numeric zoneId; fall back to areaId
// (game_graveyard_zone).
export function toGraveyardEntry(g: {
  id: number;
  areaId?: number;
  zoneId?: number | string;
  faction: number;
  map?: number;
  x?: number;
  y?: number;
  z?: number;
}): GraveyardEntry {
  const zoneId =
    g.zoneId != null && g.zoneId !== ''
      ? g.zoneId
      : (g.areaId ?? 0);
  return {
    id: g.id,
    zoneId,
    team: g.faction,
    x: g.x ?? 0,
    y: g.y ?? 0,
    z: g.z ?? 0,
    mapId: g.map,
  };
}

export interface Position3 {
  x: number;
  y: number;
  z: number;
}

// Pick the closest graveyard for a zone and faction from a pre-filtered list: same zone, no enemy
// faction, same map by squared distance first. With no position, the first faction match.
export function pickClosestGraveyard(
  zoneId: number | string,
  faction: number,
  list: readonly GraveyardEntry[],
  pos?: Position3,
  mapId?: number,
): GraveyardEntry | undefined {
  const zoneKey = String(zoneId);
  const inZone = list.filter((g) => String(g.zoneId) === zoneKey);
  const candidates = (inZone.length > 0 ? inZone : list).filter(
    (g) => g.team === TEAM_BOTH || g.team === 0 || g.team === faction,
  );
  if (candidates.length === 0) return undefined;
  if (!pos) return candidates[0];

  let best: GraveyardEntry | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestFar: GraveyardEntry | undefined;

  for (const g of candidates) {
    if (mapId != null && g.mapId != null && g.mapId !== mapId) {
      if (!bestFar) bestFar = g;
      continue;
    }
    // Cite: GetClosestGraveyardHelper same-map branch — 3D squared distance
    const dx = g.x - pos.x;
    const dy = g.y - pos.y;
    const dz = g.z - pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestDist) {
      bestDist = d2;
      best = g;
    }
  }
  return best ?? bestFar ?? candidates[0];
}

// ---- Baked graveyard rows → closest-GY helper (P-now; callable by DF) ------

// Shape of one `DataBundle.graveyards[]` row (game_graveyard_zone bake). Coords / map may be absent until
// WorldSafeLocs join deepens — picker still returns a faction-matched zone entry without position.
export interface BakedGraveyardRow {
  id: number;
  areaId?: number;
  zoneId?: number | string;
  faction: number;
  map?: number;
  x?: number;
  y?: number;
  z?: number;
}

/** Map a bake row into GraveyardEntry (numeric zoneId only; skip non-numeric). */
export function graveyardEntryFromBake(row: BakedGraveyardRow): GraveyardEntry | undefined {
  const zRaw = row.zoneId ?? row.areaId;
  const zoneId = typeof zRaw === 'number' ? zRaw : Number(zRaw);
  if (!Number.isFinite(zoneId)) return undefined;
  return {
    id: row.id,
    zoneId,
    team: row.faction,
    x: row.x ?? 0,
    y: row.y ?? 0,
    z: row.z ?? 0,
    mapId: row.map,
  };
}

export function graveyardEntriesFromBake(
  rows: readonly BakedGraveyardRow[],
): GraveyardEntry[] {
  const out: GraveyardEntry[] = [];
  for (const row of rows) {
    const e = graveyardEntryFromBake(row);
    if (e) out.push(e);
  }
  return out;
}

// The single closest-graveyard resolution for the death flow and spirit release, keyed on the baked
// AreaTable id. Without coords the position is ignored and the first faction-safe entry returned.
export function resolveClosestGraveyard(
  rows: readonly BakedGraveyardRow[],
  zoneId: number,
  faction: number,
  pos?: Position3,
  mapId?: number,
): GraveyardEntry | undefined {
  const list = graveyardEntriesFromBake(rows);
  // Only pass pos when at least one candidate has non-zero coords (bake has them).
  const hasCoords = list.some((g) => g.x !== 0 || g.y !== 0 || g.z !== 0);
  return pickClosestGraveyard(
    zoneId,
    faction,
    list,
    hasCoords ? pos : undefined,
    mapId,
  );
}

/** 3D distance² between two positions (no sqrt). */
export function distSq3(a: Position3, b: Position3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

// True when ghost is within CORPSE_RECLAIM_RADIUS of the corpse. Cite: MiscHandler.cpp
// HandleReclaimCorpseOpcode — IsWithinDistInMap(..., CORPSE_RECLAIM_RADIUS).
export function isWithinCorpseReclaimRange(
  ghostPos: Position3,
  corpsePos: Position3,
  radius: number = CORPSE_RECLAIM_RADIUS,
): boolean {
  return distSq3(ghostPos, corpsePos) <= radius * radius;
}

/** Transition helpers (pure state labels — no engine side effects). */
export function onKillPlayer(): { deathState: DeathState; deathTimerMs: number } {
  // Cite: KillPlayer — SetDeathState(CORPSE), m_deathTimer = 6 min
  return { deathState: 'CORPSE', deathTimerMs: DEATH_TIMER_MS };
}

/** Spirit release: player leaves corpse and becomes ghost at graveyard. */
export function onReleaseSpirit(): DeathState {
  return 'GHOST';
}

/** Resurrect (reclaim body / spirit healer / spell). */
export function onResurrect(): DeathState {
  return 'ALIVE';
}

// KillPlayer → CORPSE with corpse record + reclaim delay. Cite: Player.cpp KillPlayer, CreateCorpse,
// UpdateCorpseReclaimDelay.
export function beginPlayerDeath(input: {
  nowMs: number;
  /** Unix seconds; defaults to floor(nowMs/1000). */
  nowSec?: number;
  deathPos: Position3;
  zoneId: number | string;
  mapId?: number;
  pvp?: boolean;
  /** Prior m_deathExpireTime for stacking multi-death delays. */
  deathExpireTimeSec?: number;
  reclaimDelayEnabled?: boolean;
}): DeathFlowState {
  const nowSec = input.nowSec ?? Math.floor(input.nowMs / 1000);
  const pvp = input.pvp ?? false;
  const reclaimDelayEnabled = input.reclaimDelayEnabled ?? true;
  const deathExpireTimeSec = updateDeathExpireTime(
    nowSec,
    input.deathExpireTimeSec ?? 0,
    reclaimDelayEnabled,
  );
  const reclaimDelayMs = computeReclaimDelayFromExpire(
    deathExpireTimeSec,
    nowSec,
    pvp,
    reclaimDelayEnabled,
  );
  const kill = onKillPlayer();
  return {
    deathState: kill.deathState,
    corpse: {
      x: input.deathPos.x,
      y: input.deathPos.y,
      z: input.deathPos.z,
      mapId: input.mapId,
      zoneId: input.zoneId,
      ghostTimeMs: 0,
      pvp,
    },
    position: { ...input.deathPos },
    graveyard: null,
    deathExpireTimeSec,
    reclaimDelayMs,
    deathAtMs: input.nowMs,
  };
}

// Release spirit to a ghost at the closest graveyard, deterministically. With no faction-matching
// graveyard the ghost stays at the corpse, which is what vanilla does when the lookup is null.
export function releaseSpiritToGraveyard(input: {
  flow: DeathFlowState;
  nowMs: number;
  graveyards: readonly GraveyardEntry[];
  faction: number;
  /** Override zone filter; default uses corpse.zoneId. */
  zoneId?: number | string;
  mapId?: number;
}): DeathFlowState | null {
  const { flow } = input;
  if (flow.deathState !== 'CORPSE' || !flow.corpse) return null;
  const zoneId = input.zoneId ?? flow.corpse.zoneId;
  const deathPos: Position3 = {
    x: flow.corpse.x,
    y: flow.corpse.y,
    z: flow.corpse.z,
  };
  const gy = pickClosestGraveyard(
    zoneId,
    input.faction,
    input.graveyards,
    deathPos,
    input.mapId ?? flow.corpse.mapId,
  );
  return {
    ...flow,
    deathState: onReleaseSpirit(),
    corpse: { ...flow.corpse, ghostTimeMs: input.nowMs },
    position: gy ? { x: gy.x, y: gy.y, z: gy.z } : deathPos,
    graveyard: gy ?? null,
  };
}

// Full open-world death: KillPlayer → immediate release to closest GY. Wave DF default path when
// DeathFlowMode is `full`.
export function deathToGhostAtGraveyard(input: {
  nowMs: number;
  nowSec?: number;
  deathPos: Position3;
  zoneId: number | string;
  mapId?: number;
  pvp?: boolean;
  deathExpireTimeSec?: number;
  reclaimDelayEnabled?: boolean;
  graveyards: readonly GraveyardEntry[];
  faction: number;
}): DeathFlowState {
  const corpse = beginPlayerDeath(input);
  const released = releaseSpiritToGraveyard({
    flow: corpse,
    nowMs: input.nowMs,
    graveyards: input.graveyards,
    faction: input.faction,
    zoneId: input.zoneId,
    mapId: input.mapId,
  });
  return released ?? corpse;
}

/** Reclaim delay elapsed since ghost time. */
export function isCorpseReclaimReady(flow: DeathFlowState, nowMs: number): boolean {
  if (flow.deathState !== 'GHOST' || !flow.corpse) return false;
  if (flow.corpse.ghostTimeMs <= 0) return false;
  return nowMs >= flow.corpse.ghostTimeMs + flow.reclaimDelayMs;
}

// Ghost may reclaim: GHOST + delay elapsed + within CORPSE_RECLAIM_RADIUS. Cite: MiscHandler.cpp
// HandleReclaimCorpseOpcode.
export function canReclaimCorpse(
  flow: DeathFlowState,
  nowMs: number,
  ghostPos?: Position3 | null,
): boolean {
  if (!isCorpseReclaimReady(flow, nowMs) || !flow.corpse) return false;
  const pos = ghostPos ?? flow.position;
  if (!pos) return false;
  return isWithinCorpseReclaimRange(pos, flow.corpse);
}

// Move ghost to corpse location (text-RPG stand-in for the corpse run). Does not resurrect — only positions
// for a subsequent reclaim check.
export function moveGhostToCorpse(flow: DeathFlowState): DeathFlowState | null {
  if (flow.deathState !== 'GHOST' || !flow.corpse) return null;
  return {
    ...flow,
    position: { x: flow.corpse.x, y: flow.corpse.y, z: flow.corpse.z },
  };
}

// Corpse reclaim result. Caller restores HP and clears ghost flags. Cite: MiscHandler.cpp —
// ResurrectPlayer(0.5f) default applySickness=false.
export interface ReclaimResult {
  flow: DeathFlowState;
  restorePercent: number;
  applySickness: boolean;
}

export function reclaimCorpse(
  flow: DeathFlowState,
  nowMs: number,
  ghostPos?: Position3 | null,
): ReclaimResult | null {
  if (!canReclaimCorpse(flow, nowMs, ghostPos)) return null;
  return {
    flow: createAliveDeathFlow(flow.deathExpireTimeSec),
    restorePercent: 0.5,
    applySickness: false,
  };
}

// Spirit healer resurrect result: half health and 25% durability off everything. Requires a released
// spirit. Cite: NPCHandler.cpp SendSpiritResurrect.
export interface SpiritHealerResult {
  flow: DeathFlowState;
  restorePercent: number;
  applySickness: boolean;
  /** DurabilityLossAll fraction (equipped; inventory bag wear is engine/save scope). */
  durabilityLossFraction: number;
  reviveAt: Position3 | null;
}

export function spiritHealerResurrect(flow: DeathFlowState): SpiritHealerResult | null {
  if (flow.deathState !== 'GHOST') return null;
  const reviveAt = flow.graveyard
    ? { x: flow.graveyard.x, y: flow.graveyard.y, z: flow.graveyard.z }
    : flow.position
      ? { ...flow.position }
      : null;
  return {
    flow: createAliveDeathFlow(flow.deathExpireTimeSec),
    restorePercent: 0.5,
    applySickness: true,
    durabilityLossFraction: SPIRIT_HEALER_DURABILITY_LOSS,
    reviveAt,
  };
}

// ---- Living-player action gate (shared by travel / combat / regen / trade / quests) ----

/** Player-facing refuse string used by fight/travel/economy death gates. */
export const YOU_ARE_DEAD = 'You are dead';

// A living player for action gates: finite health above 0 and a deathFlow that is not a dead state.
// Non-finite health is treated as dead, since NaN <= 0 is false (KI-861).
export function isPlayerAlive(
  health: number,
  deathFlow?: Pick<DeathFlowState, 'deathState'> | null,
): boolean {
  if (!Number.isFinite(health) || health <= 0) return false;
  const ds = deathFlow?.deathState;
  if (ds && ds !== 'ALIVE' && ds !== 'JUST_ALIVED') return false;
  return true;
}

/** ActionResult-shaped refuse when the character is dead/ghost. */
export function refuseIfDead(
  health: number,
  deathFlow?: Pick<DeathFlowState, 'deathState'> | null,
): { ok: false; reason: string } | null {
  if (isPlayerAlive(health, deathFlow)) return null;
  return { ok: false, reason: YOU_ARE_DEAD };
}

/** Travel / economy busy string (travel.ts getPendingFight gate; KI-913). */
export const YOU_ARE_IN_COMBAT = 'You are in combat';

/** beginEncounter busy string when liveFightSession is already set (KI-890). */
export const ALREADY_IN_COMBAT = 'Already in combat';

/** ActionResult-shaped refuse while a live / pending fight is open. */
export function refuseIfInCombat(
  inCombat: boolean,
  reason: string = YOU_ARE_IN_COMBAT,
): { ok: false; reason: string } | null {
  if (!inCombat) return null;
  return { ok: false, reason };
}

// Dead first, then combat busy — the order for instance and squad mutation APIs. Cite: Player.cpp:4388
// ghost dungeon enter; Spell.cpp:4586 SPELL_FAILED_CASTER_DEAD.
export function refuseIfDeadOrInCombat(
  health: number,
  deathFlow: Pick<DeathFlowState, 'deathState'> | null | undefined,
  inCombat: boolean,
  combatReason: string = YOU_ARE_IN_COMBAT,
): { ok: false; reason: string } | null {
  const dead = refuseIfDead(health, deathFlow);
  if (dead) return dead;
  return refuseIfInCombat(inCombat, combatReason);
}


