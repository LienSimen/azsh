// Creature aggro helpers: attack distance, spatial pull, call-for-help eligibility, pack assist.
// Pure domain. Cite: Unit.cpp GetAttackDistance ~11747; Creature.cpp CallAssistance ~2148.

import {
  AGGRO_LEVEL_DIFF_CAP,
  CREATURE_CHECK_FOR_HELP_RADIUS,
  CREATURE_EXTRA_FLAG,
  CREATURE_FAMILY_ASSISTANCE_RADIUS,
  DEFAULT_DETECTION_RANGE,
  GUARD_ASSIST_GUARD_CIVILIAN_DIST_YD,
  GUARD_ASSIST_PLAYER_DIST_YD,
  GUARD_ASSIST_PVP_DIST_YD,
  GUARD_ASSIST_VICTIM_DIST_YD,
  MIN_AGGRO_DISTANCE,
  PET_AGGRO_FACTOR,
  RATE_CREATURE_AGGRO,
} from './creatureAiConstants.ts';
import {
  linkedCombatGuidPartners,
  linkedCombatPartnerSpecs,
} from './creatureLinking.ts';
import { aggroTogetherMemberGuids } from './creatureGroups.ts';
import { STOREY_DZ_YD } from '../nav/storey.ts';

// Aggro distance — Unit.cpp GetAttackDistance ~11747–11784

export interface AttackDistanceOpts {
  /** Template Detection / GetDetectionRange. Default DEFAULT_DETECTION_RANGE. */
  detectionRange?: number;
  /** CONFIG_FLOAT_RATE_CREATURE_AGGRO. Default RATE_CREATURE_AGGRO. */
  aggroRate?: number;
  /** Player-controlled pet factor. Default false. */
  targetIsPlayerPet?: boolean;
  /** Aura MOD_DETECT_RANGE sum on the creature (not modeled yet → 0). */
  detectRangeMod?: number;
  /** Aura MOD_DETECTED_RANGE sum on the target (not modeled yet → 0). */
  detectedRangeMod?: number;
}

// Pure port of Unit::GetAttackDistance: detection - leveldif (capped -25) + aura mods, min 5,
// pet ×0.65, ×aggroRate. Returns 0 when aggroRate or detection is 0, as the C++ early-outs.
export function getCreatureAttackDistance(
  creatureLevel: number,
  targetLevel: number,
  opts: AttackDistanceOpts = {},
): number {
  const aggroRate = opts.aggroRate ?? RATE_CREATURE_AGGRO;
  if (aggroRate === 0) return 0;

  let leveldif = (targetLevel | 0) - (creatureLevel | 0);
  if (leveldif < AGGRO_LEVEL_DIFF_CAP) leveldif = AGGRO_LEVEL_DIFF_CAP;

  let attackDistance = opts.detectionRange ?? DEFAULT_DETECTION_RANGE;
  if (attackDistance === 0) return 0;

  attackDistance -= leveldif;
  attackDistance += opts.detectRangeMod ?? 0;
  attackDistance += opts.detectedRangeMod ?? 0;

  if (attackDistance < MIN_AGGRO_DISTANCE) attackDistance = MIN_AGGRO_DISTANCE;

  if (opts.targetIsPlayerPet) attackDistance *= PET_AGGRO_FACTOR;

  return attackDistance * aggroRate;
}

/** ExtraFlags & NO_AGGRO_ON_SIGHT — Creature.h IsNoAggroOnSight. */
export function isNoAggroOnSight(extraFlags: number | undefined | null): boolean {
  return ((extraFlags ?? 0) & CREATURE_EXTRA_FLAG.NO_AGGRO_ON_SIGHT) !== 0;
}

// Spatial pull (Wave 4C) — yard distance vs GetAttackDistance when positions exist

/** Planar (x,y) distance in yards — CMaNGOS GetDistance2d style without Z. */
export function planarDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}


/** Assist / CFH yards. Other storey → Infinity so the stands never join the pit. */
function assistDistanceYd(
  a: { x: number; y: number; z?: number },
  b: { x: number; y: number; z?: number },
): number {
  const planar = planarDistance(a.x, a.y, b.x, b.y);
  if (a.z == null || b.z == null || !Number.isFinite(a.z) || !Number.isFinite(b.z)) return planar;
  if (Math.abs(a.z - b.z) > STOREY_DZ_YD) return Infinity;
  return planar;
}

/** One spawn candidate for spatial aggro selection (sourced creature.x/y). */
export interface SpatialPullCandidate {
  entry: number;
  x: number;
  y: number;
  /** Creature level for GetAttackDistance level-diff scaling. */
  level: number;
  map?: number;
  /** World z when known — LoS / storey gate. */
  z?: number;
  detectionRange?: number;
  extraFlags?: number;
  // Authored CFH/Detection cluster id from pack-clusters.json. When candidates carry it,
  // overlapping radii of DISTINCT packs do not merge — only the nearer pack and its links join.
  packId?: string;
}

export interface SpatialPullHit {
  entry: number;
  x: number;
  y: number;
  map?: number;
  z?: number;
  /** Yards from pull origin to this spawn. */
  distance: number;
  /** GetAttackDistance for this creature vs the player. */
  attackDistance: number;
  /** Pack id when the candidate carried one. */
  packId?: string;
}

export interface SpatialPullOrigin {
  x: number;
  y: number;
  map?: number;
  z?: number;
}

export interface SpatialPullOpts {
  // Passive sight aggro only (default true): skip NO_AGGRO_ON_SIGHT helpers. Explicit player-initiated
  // fights can pass false to include them as pull targets.
  requireAggroOnSight?: boolean;
  targetIsPlayerPet?: boolean;
  aggroRate?: number;
  // Skip the primary pull spawn (same entry + within epsilon yards) so the multi-add list does not
  // double-count the mob already engaged.
  excludeOriginSpawn?: boolean;
  /** Match tolerance when excluding the origin spawn (yards). Default 0.5. */
  excludeEpsilonYd?: number;
  /** Primary entry at origin — excluded only when excludeOriginSpawn and coords match. */
  primaryEntry?: number;
  // Classic aggro requires line of sight. When provided, candidates failing the predicate are
  // rejected; outdoor callers omit it and fail open. Cite: UnitAI.cpp ~530 IsWithinLOSInMap.
  hasLineOfSight?: (
    origin: SpatialPullOrigin,
    candidate: SpatialPullCandidate,
  ) => boolean;
  // When any candidate carries `packId`, restrict the pull to the **nearest** pack (plus packs listed in
  // `packLinks` for that id). Default true. Proximity alone must never merge two authored packs.
  scopeToNearestPack?: boolean;
  // Explicit pack links only, never proximity: packId → linked pack ids that may join when that
  // pack is the nearer pull. Patrol joins and scripted gauntlets take separate paths.
  packLinks?: ReadonlyMap<string, readonly string[]>;
}

// Creatures whose spawn is within their GetAttackDistance of `origin`, gated in order by map and
// flags, radius, optional line of sight, then nearest pack. Stable: ascending distance then entry.
export function selectSpatialPull(
  origin: SpatialPullOrigin,
  playerLevel: number,
  candidates: readonly SpatialPullCandidate[],
  opts: SpatialPullOpts = {},
): SpatialPullHit[] {
  const requireSight = opts.requireAggroOnSight !== false;
  const excludePrimary = opts.excludeOriginSpawn === true;
  const eps = opts.excludeEpsilonYd ?? 0.5;
  const out: SpatialPullHit[] = [];

  for (const c of candidates) {
    if (origin.map != null && c.map != null && origin.map !== c.map) continue;
    if (requireSight && isNoAggroOnSight(c.extraFlags)) continue;

    const distance = planarDistance(origin.x, origin.y, c.x, c.y);
    if (
      excludePrimary &&
      opts.primaryEntry != null &&
      c.entry === opts.primaryEntry &&
      distance <= eps
    ) {
      continue;
    }

    const attackDistance = getCreatureAttackDistance(c.level, playerLevel, {
      detectionRange: c.detectionRange,
      targetIsPlayerPet: opts.targetIsPlayerPet,
      aggroRate: opts.aggroRate,
    });
    if (attackDistance <= 0) continue;
    if (distance > attackDistance) continue;

    if (opts.hasLineOfSight && !opts.hasLineOfSight(origin, c)) continue;

    out.push({
      entry: c.entry,
      x: c.x,
      y: c.y,
      map: c.map,
      z: c.z,
      distance,
      attackDistance,
      packId: c.packId,
    });
  }

  out.sort((a, b) => a.distance - b.distance || a.entry - b.entry);

  // Pack scope: nearer pack only (+ explicit links). Do not merge overlapping radii.
  const scopePacks = opts.scopeToNearestPack !== false;
  if (scopePacks && out.some((h) => h.packId != null)) {
    const nearest = out.find((h) => h.packId != null);
    if (nearest?.packId) {
      const allowed = new Set<string>([nearest.packId]);
      const links = opts.packLinks?.get(nearest.packId);
      if (links) for (const id of links) allowed.add(id);
      return out.filter((h) => h.packId != null && allowed.has(h.packId));
    }
  }

  return out;
}

/** ExtraFlags & NO_CALL_ASSIST — SetCanCallForAssistance inverse. */
export function isNoCallAssist(extraFlags: number | undefined | null): boolean {
  return ((extraFlags ?? 0) & CREATURE_EXTRA_FLAG.NO_CALL_ASSIST) !== 0;
}

/** ExtraFlags & GUARD — Creature.h:638 IsGuard / CREATURE_EXTRA_FLAG_GUARD. */
export function isGuard(extraFlags: number | undefined | null): boolean {
  return ((extraFlags ?? 0) & CREATURE_EXTRA_FLAG.GUARD) !== 0;
}

/** ExtraFlags & CIVILIAN — Creature.h:65 substitute bit (Classic IsCivilian is Civilian != 0). */
export function isCivilian(extraFlags: number | undefined | null): boolean {
  return ((extraFlags ?? 0) & CREATURE_EXTRA_FLAG.CIVILIAN) !== 0;
}

export function isGuardOrCivilian(extraFlags: number | undefined | null): boolean {
  return isGuard(extraFlags) || isCivilian(extraFlags);
}

/** GuardAI.cpp MoveInLineOfSight `who` / `victim` type. Pet is TYPEID_CREATURE + player owner. */
export type GuardAssistUnitKind = 'player' | 'player_pet' | 'npc';

// GuardAI.cpp:54–76 distance gates after CanAssist + getAttackerForHelper. Cite: de8f7299 GuardAI.cpp:56
// who 5 / victim 10; :63 who 30; :72 who 20.
export function guardAssistShouldAttack(args: {
  whoKind: GuardAssistUnitKind;
  victimKind: GuardAssistUnitKind;
  whoIsGuardOrCivilian: boolean;
  distWho: number;
  distVictim: number;
  losWho?: boolean;
  losVictim?: boolean;
}): boolean {
  const losWho = args.losWho !== false;
  const losVictim = args.losVictim !== false;
  if (args.whoKind === 'player' && args.victimKind !== 'player') {
    return args.distWho <= GUARD_ASSIST_PLAYER_DIST_YD
      && args.distVictim <= GUARD_ASSIST_VICTIM_DIST_YD
      && losVictim;
  }
  if (
    (args.whoKind === 'player' && args.victimKind === 'player')
    || args.victimKind === 'player_pet'
  ) {
    return args.distWho <= GUARD_ASSIST_PVP_DIST_YD && losWho;
  }
  if (args.whoKind !== 'player' && args.whoIsGuardOrCivilian) {
    return args.distWho <= GUARD_ASSIST_GUARD_CIVILIAN_DIST_YD && losWho;
  }
  return false;
}

export interface GuardAiPos {
  guid: number;
  entry?: number;
  x: number;
  y: number;
  z?: number;
  extraFlags?: number;
}

export interface GuardAiCombatant extends GuardAiPos {
  kind: GuardAssistUnitKind;
  isGuardOrCivilian?: boolean;
}

// Idle IsGuard helpers that AttackStart `victim` for this combat pair. Cite: GuardAI.cpp:25–29 Permissible;
// :47–76 the three radius branches.
export function selectGuardAiAssists(
  guards: readonly GuardAiPos[],
  who: GuardAiCombatant,
  victim: GuardAiCombatant,
  opts: {
    hasLineOfSight?: (
      from: { x: number; y: number; z?: number },
      to: { x: number; y: number; z?: number },
    ) => boolean;
  } = {},
): GuardAiPos[] {
  const whoIsGuardOrCivilian =
    who.isGuardOrCivilian === true
    || (who.kind !== 'player' && isGuardOrCivilian(who.extraFlags));
  const hits: { g: GuardAiPos; d: number }[] = [];
  for (const g of guards) {
    if (g.guid === who.guid || g.guid === victim.guid) continue;
    if (!isGuard(g.extraFlags)) continue;
    const distWho = assistDistanceYd(g, who);
    const distVictim = assistDistanceYd(g, victim);
    const losWho = !opts.hasLineOfSight || opts.hasLineOfSight(g, who);
    const losVictim = !opts.hasLineOfSight || opts.hasLineOfSight(g, victim);
    if (!guardAssistShouldAttack({
      whoKind: who.kind,
      victimKind: victim.kind,
      whoIsGuardOrCivilian,
      distWho,
      distVictim,
      losWho,
      losVictim,
    })) continue;
    hits.push({ g, d: distWho });
  }
  hits.sort((a, b) => a.d - b.d || a.g.guid - b.g.guid);
  return hits.map((h) => h.g);
}

/** Outdoor spawn scan: who is the pulled creature, victim is the player (no player pose). */
export function selectGuardAiAssistFromSpawns(
  who: { entry: number; x: number; y: number; extraFlags?: number },
  spawns: readonly PackSpawnPos[],
): AssistCandidate[] {
  const whoIsGuardOrCivilian = isGuardOrCivilian(who.extraFlags);
  const out: AssistCandidate[] = [];
  for (const s of spawns) {
    if (s.entry === who.entry && s.x === who.x && s.y === who.y) continue;
    if (!isGuard(s.extraFlags)) continue;
    const distWho = planarDistance(who.x, who.y, s.x, s.y);
    if (!guardAssistShouldAttack({
      whoKind: 'npc',
      victimKind: 'player',
      whoIsGuardOrCivilian,
      distWho,
      distVictim: Number.POSITIVE_INFINITY,
      losWho: true,
      losVictim: false,
    })) continue;
    out.push({
      entry: s.entry,
      distance: distWho,
      extraFlags: s.extraFlags,
      alive: true,
      inCombat: false,
    });
  }
  out.sort((a, b) => a.distance - b.distance || a.entry - b.entry);
  return out;
}

// Call-for-help / assist (feasible pure subset)

export interface AssistCandidate {
  entry: number;
  /** Distance from the caller (yards). */
  distance: number;
  /** Caller's faction match when known; if omitted, faction check is skipped. */
  sameFaction?: boolean;
  alive?: boolean;
  inCombat?: boolean;
  extraFlags?: number;
  /** Has a master/owner (pets skip). */
  hasMaster?: boolean;
}

export interface AssistCaller {
  /** Template CallForHelp; 0 / absent → CREATURE_FAMILY_ASSISTANCE_RADIUS. */
  callForHelpRadius?: number;
  extraFlags?: number;
  alreadyCalledAssistance?: boolean;
  /** CanCallForAssistance setting (false when NO_CALL_ASSIST baked into settings). */
  canCallForAssistance?: boolean;
}

// Resolve assistance radius: template CallForHelp when > 0, else config default. Creature.cpp
// CallAssistance ~2160–2162.
export function resolveCallForHelpRadius(callForHelp: number | undefined | null): number {
  const v = callForHelp ?? 0;
  return v > 0 ? v : CREATURE_FAMILY_ASSISTANCE_RADIUS;
}

// Pure CanAssistTo subset without world flags or faction tables: alive, not NO_AGGRO_ON_SIGHT,
// not already in combat when an enemy is given, no master, optional same-faction.
export function canAssistTo(
  helper: AssistCandidate,
  opts: { checkFaction?: boolean; hasEnemy?: boolean } = {},
): boolean {
  if (helper.alive === false) return false;
  if (isNoAggroOnSight(helper.extraFlags)) return false;
  if (helper.hasMaster) return false;
  if (opts.hasEnemy !== false && helper.inCombat) return false;
  if (opts.checkFaction !== false && helper.sameFaction === false) return false;
  return true;
}

// Select neighbors within call-for-help radius that can assist. Once-per-combat: if alreadyCalledAssistance
// or NO_CALL_ASSIST / canCall=false → []. Stable order: ascending distance, then entry id.
export function selectCallForHelp(
  caller: AssistCaller,
  neighbors: readonly AssistCandidate[],
): AssistCandidate[] {
  if (caller.alreadyCalledAssistance) return [];
  if (caller.canCallForAssistance === false) return [];
  if (isNoCallAssist(caller.extraFlags)) return [];

  const radius = resolveCallForHelpRadius(caller.callForHelpRadius);
  const out = neighbors.filter(
    (n) => n.distance <= radius && canAssistTo(n, { hasEnemy: true, checkFaction: true }),
  );
  out.sort((a, b) => a.distance - b.distance || a.entry - b.entry);
  return out;
}

// Pack assist from sourced spawns (Wave 4B) Cite: Creature.cpp CallAssistance / CallForHelp; GridNotifiers
// CallOfHelpCreatureInRangeDo

/** One world spawn placement for pack-assist neighbor scan (creature table). */
export interface PackSpawnPos {
  entry: number;
  x: number;
  y: number;
  map?: number;
  extraFlags?: number;
  /** creature_template.Faction — same-faction gate when both sides known. */
  factionId?: number;
  /** creature_template.Rank — CREATURE_ELITE_* (0 normal). */
  rank?: number;
  /** creature_template.Detection; 0/absent → DEFAULT_DETECTION_RANGE (18). */
  detectionRange?: number;
}

// Build AssistCandidates for every spawn except `originIndex`, with planar distance from the
// origin. Same-map only when both carry map; LOS is not modelled here.
export function assistCandidatesFromSpawns(
  originIndex: number,
  spawns: readonly PackSpawnPos[],
): AssistCandidate[] {
  const origin = spawns[originIndex];
  if (!origin) return [];
  const out: AssistCandidate[] = [];
  for (let i = 0; i < spawns.length; i++) {
    if (i === originIndex) continue;
    const s = spawns[i]!;
    if (origin.map != null && s.map != null && origin.map !== s.map) continue;
    const distance = planarDistance(origin.x, origin.y, s.x, s.y);
    const sameFaction =
      origin.factionId != null && s.factionId != null
        ? origin.factionId === s.factionId
        : undefined;
    out.push({
      entry: s.entry,
      distance,
      sameFaction,
      alive: true,
      inCombat: false,
      extraFlags: s.extraFlags,
    });
  }
  return out;
}

// Full CallAssistance selection from the sourced spawn list: neighbors around the caller's spawn
// index, then selectCallForHelp. Stable — the same originIndex and spawns give the same helpers.
export function resolvePackAssistFromSpawns(
  caller: AssistCaller,
  originIndex: number,
  spawns: readonly PackSpawnPos[],
): AssistCandidate[] {
  const neighbors = assistCandidatesFromSpawns(originIndex, spawns);
  return selectCallForHelp(caller, neighbors);
}

// ---- CallAssistance on a live floor — identity-preserving (guid), LOS-gated ----
// Cite: Creature.cpp CallAssistance ~2143; Relations.cpp CanAssistInCombatAgainst ~1420.

/** One floor body as a CallAssistance receiver. Guid, not entry — the caller needs identity. */
export interface AssistBody {
  guid: number;
  entry: number;
  x: number;
  y: number;
  z?: number;
  /** Alive and still on the floor. */
  alive: boolean;
  /** CanJoinInAttacking's CanAttack(enemy) — attackable by this player party. */
  hostile: boolean;
  /** Already in our pull; joining again is a no-op (dungeons do not bar in-combat helpers). */
  inCombat?: boolean;
  extraFlags?: number;
  /** GetMasterGuid — pets/guardians never answer a call. */
  hasMaster?: boolean;
}

export interface FloorAssistCaller {
  guid: number;
  x: number;
  y: number;
  z?: number;
  /** creature_template.CallForHelp; 0/absent → CREATURE_FAMILY_ASSISTANCE_RADIUS (5.0). */
  callForHelpRadius?: number;
  extraFlags?: number;
  /** m_AlreadyCallAssistance — once per combat. */
  alreadyCalledAssistance?: boolean;
  canCallForAssistance?: boolean;
}

// Bodies that answer one creature's CallAssistance. Inside an instance the gate is only "can it
// attack our party" (Relations.cpp:1425). Distance is from the CALLER, which must see the helper.
export function selectFloorCallAssistance(
  caller: FloorAssistCaller,
  bodies: readonly AssistBody[],
  opts: {
    hasLineOfSight?: (
      from: { x: number; y: number; z?: number },
      to: { x: number; y: number; z?: number },
    ) => boolean;
  } = {},
): AssistBody[] {
  if (caller.alreadyCalledAssistance) return [];
  if (caller.canCallForAssistance === false) return [];
  if (isNoCallAssist(caller.extraFlags)) return [];

  const radius = resolveCallForHelpRadius(caller.callForHelpRadius);
  const hits: { body: AssistBody; distance: number }[] = [];
  for (const b of bodies) {
    if (b.guid === caller.guid) continue;
    if (!b.alive || !b.hostile) continue;
    if (b.inCombat) continue;
    if (b.hasMaster) continue;
    if (isNoAggroOnSight(b.extraFlags)) continue;
    const distance = assistDistanceYd(caller, b);
    if (distance > radius) continue;
    if (opts.hasLineOfSight && !opts.hasLineOfSight(caller, b)) continue;
    hits.push({ body: b, distance });
  }
  hits.sort((a, b) => a.distance - b.distance || a.body.guid - b.body.guid);
  return hits.map((h) => h.body);
}

/** An engaged body a bystander can notice — its LIVE position, not its spawn. */
export interface CheckForHelpFighter {
  guid: number;
  x: number;
  y: number;
  z?: number;
  extraFlags?: number;
}

// UnitAI::CheckForHelp — the continuous pack join. CallAssistance fires once at EnterCombat off
// the spawn; this runs from MoveInLineOfSight against live positions for the whole fight.
export function selectFloorCheckForHelp(
  fighters: readonly CheckForHelpFighter[],
  bodies: readonly AssistBody[],
  opts: {
    radius?: number;
    hasLineOfSight?: (
      from: { x: number; y: number; z?: number },
      to: { x: number; y: number; z?: number },
    ) => boolean;
  } = {},
): AssistBody[] {
  if (!fighters.length) return [];
  const radius = opts.radius ?? CREATURE_CHECK_FOR_HELP_RADIUS;
  const engaged = new Set(fighters.map((f) => f.guid));
  const hits: { body: AssistBody; distance: number }[] = [];
  for (const b of bodies) {
    if (engaged.has(b.guid)) continue;
    if (!b.alive || !b.hostile) continue;
    if (b.inCombat) continue;      // me->IsInCombat()
    if (b.hasMaster) continue;     // pets/guardians never answer
    if (isNoAggroOnSight(b.extraFlags)) continue;
    if (isNoCallAssist(b.extraFlags)) continue; // !me->CanCallForAssistance()
    let best = Infinity;
    for (const f of fighters) {
      if (isNoCallAssist(f.extraFlags)) continue; // !who->CanCallForAssistance()
      const d = assistDistanceYd(f, b);
      if (d > radius || d >= best) continue;
      // me->IsWithinLOSInMap(who) — the helper must see the unit it is answering.
      if (opts.hasLineOfSight && !opts.hasLineOfSight(b, f)) continue;
      best = d;
    }
    if (best === Infinity) continue;
    hits.push({ body: b, distance: best });
  }
  hits.sort((a, b) => a.distance - b.distance || a.body.guid - b.body.guid);
  return hits.map((h) => h.body);
}

/** Cell query used by the instance grid — returns a shortlist, not the whole floor. */
export type NearBodies = (x: number, y: number, r: number) => readonly AssistBody[];

/** CallAssistance against a near-query. Same gates as selectFloorCallAssistance. */
export function selectFloorCallAssistanceNear(
  caller: FloorAssistCaller,
  near: NearBodies,
  opts: {
    hasLineOfSight?: (
      from: { x: number; y: number; z?: number },
      to: { x: number; y: number; z?: number },
    ) => boolean;
  } = {},
): AssistBody[] {
  if (caller.alreadyCalledAssistance) return [];
  if (caller.canCallForAssistance === false) return [];
  if (isNoCallAssist(caller.extraFlags)) return [];
  const radius = resolveCallForHelpRadius(caller.callForHelpRadius);
  return selectFloorCallAssistance(caller, near(caller.x, caller.y, radius), opts);
}

// CheckForHelp against a near-query around each fighter (union, then the same gates). One getNear per
// engaged body — not O(floor).
export function selectFloorCheckForHelpNear(
  fighters: readonly CheckForHelpFighter[],
  near: NearBodies,
  opts: {
    radius?: number;
    hasLineOfSight?: (
      from: { x: number; y: number; z?: number },
      to: { x: number; y: number; z?: number },
    ) => boolean;
  } = {},
): AssistBody[] {
  if (!fighters.length) return [];
  const radius = opts.radius ?? CREATURE_CHECK_FOR_HELP_RADIUS;
  const seen = new Set<number>();
  const bodies: AssistBody[] = [];
  for (const f of fighters) {
    if (isNoCallAssist(f.extraFlags)) continue;
    for (const b of near(f.x, f.y, radius)) {
      if (seen.has(b.guid)) continue;
      seen.add(b.guid);
      bodies.push(b);
    }
  }
  return selectFloorCheckForHelp(fighters, bodies, opts);
}

// Outdoor entry-hunt packs: creature_linking_template partners inside that row's searchRange
// (0 = whole map), or unique Rank>=1 elites within Detection. Uniqueness is world spawn count.
export function resolveOutdoorPackAssist(
  caller: AssistCaller,
  primaryEntry: number,
  spawns: readonly PackSpawnPos[],
  worldSpawnCounts?: ReadonlyMap<number, number>,
): AssistCandidate[] {
  if (caller.alreadyCalledAssistance) return [];
  if (caller.canCallForAssistance === false) return [];
  if (isNoCallAssist(caller.extraFlags)) return [];
  if (!spawns.length) return [];

  const primaryIndices: number[] = [];
  for (let i = 0; i < spawns.length; i++) {
    if (spawns[i]!.entry === primaryEntry) primaryIndices.push(i);
  }
  if (!primaryIndices.length) return [];

  type Site = { index: number; x: number; y: number; map?: number; help: AssistCandidate[] };
  const sites: Site[] = [];
  for (const idx of primaryIndices) {
    const s = spawns[idx]!;
    sites.push({
      index: idx,
      x: s.x,
      y: s.y,
      map: s.map,
      help: resolvePackAssistFromSpawns(caller, idx, spawns),
    });
  }
  sites.sort(
    (a, b) =>
      a.help.length - b.help.length
      || (a.map ?? 0) - (b.map ?? 0)
      || a.x - b.x
      || a.y - b.y,
  );
  const chosen = sites[0]!;
  const linkedHelp = linkedJoinsFromSpawns(chosen.index, primaryEntry, spawns);
  const eliteHelp = uniqueEliteDetectionJoins(
    chosen.index,
    primaryEntry,
    spawns,
    worldSpawnCounts,
  );
  if (!linkedHelp.length && !eliteHelp.length) return [];

  const have = new Set(linkedHelp.map((h) => h.entry));
  const extra = eliteHelp.filter((h) => !have.has(h.entry));
  return [...linkedHelp, ...extra].sort((a, b) => a.distance - b.distance || a.entry - b.entry);
}

/** Linking-template combat partners from the origin spawn. searchRange 0 = whole map. */
function linkedJoinsFromSpawns(
  originIndex: number,
  primaryEntry: number,
  spawns: readonly PackSpawnPos[],
): AssistCandidate[] {
  const origin = spawns[originIndex];
  if (!origin) return [];
  const specs = linkedCombatPartnerSpecs(primaryEntry, origin.map);
  if (!specs.length) return [];
  const rangeBy = new Map(specs.map((s) => [s.entry, s.searchRange]));
  const hits: AssistCandidate[] = [];
  for (let i = 0; i < spawns.length; i++) {
    if (i === originIndex) continue;
    const s = spawns[i]!;
    if (!rangeBy.has(s.entry)) continue;
    if (origin.map != null && s.map != null && origin.map !== s.map) continue;
    const distance = planarDistance(origin.x, origin.y, s.x, s.y);
    if (distance <= 0) continue;
    const range = rangeBy.get(s.entry) ?? 0;
    if (range > 0 && distance > range) continue;
    hits.push({
      entry: s.entry,
      distance,
      sameFaction: true,
      alive: true,
      inCombat: false,
      extraFlags: s.extraFlags,
    });
  }
  hits.sort((a, b) => a.distance - b.distance || a.entry - b.entry);
  return hits;
}

/** Unique Rank>=1, one outdoor spawn worldwide: other unique same-faction elites within Detection. Distance 0 is CSE. */
function uniqueEliteDetectionJoins(
  originIndex: number,
  primaryEntry: number,
  spawns: readonly PackSpawnPos[],
  worldSpawnCounts?: ReadonlyMap<number, number>,
): AssistCandidate[] {
  const origin = spawns[originIndex];
  if (!origin || (origin.rank ?? 0) < 1) return [];

  const localCounts = new Map<number, number>();
  if (!worldSpawnCounts) {
    for (const s of spawns) localCounts.set(s.entry, (localCounts.get(s.entry) ?? 0) + 1);
  }
  const nOf = (entry: number): number =>
    worldSpawnCounts?.get(entry) ?? localCounts.get(entry) ?? 0;
  if (nOf(primaryEntry) !== 1) return [];

  const hits: AssistCandidate[] = [];
  for (let i = 0; i < spawns.length; i++) {
    if (i === originIndex) continue;
    const s = spawns[i]!;
    if (s.entry === primaryEntry) continue;
    if (origin.map != null && s.map != null && origin.map !== s.map) continue;
    if (nOf(s.entry) !== 1) continue;
    if ((s.rank ?? 0) < 1) continue;
    if (origin.factionId != null && s.factionId != null && origin.factionId !== s.factionId) continue;
    if (isNoAggroOnSight(s.extraFlags)) continue;
    const distance = planarDistance(origin.x, origin.y, s.x, s.y);
    if (distance <= 0) continue;
    const detect = s.detectionRange && s.detectionRange > 0
      ? s.detectionRange
      : DEFAULT_DETECTION_RANGE;
    if (distance > detect) continue;
    hits.push({
      entry: s.entry,
      distance,
      sameFaction: true,
      alive: true,
      inCombat: false,
      extraFlags: s.extraFlags,
    });
  }
  hits.sort((a, b) => a.distance - b.distance || a.entry - b.entry);
  return hits;
}

// Hard social joins: spawn_group AGGRO_TOGETHER and guid creature_linking only. Entry templates
// with searchRange 0 match every same-entry body on the floor, which pulled a whole Strat wing.
export function selectFloorSocialJoins(
  caller: { guid: number; entry: number; x: number; y: number; mapId?: number },
  bodies: readonly AssistBody[],
): AssistBody[] {
  const wantGuid = new Set<number>([
    ...aggroTogetherMemberGuids(caller.guid),
    ...linkedCombatGuidPartners(caller.guid),
  ]);
  if (!wantGuid.size) return [];

  const hits: { body: AssistBody; distance: number }[] = [];
  for (const b of bodies) {
    if (b.guid === caller.guid) continue;
    if (!b.alive || !b.hostile) continue;
    if (b.inCombat) continue;
    if (!wantGuid.has(b.guid)) continue;
    hits.push({ body: b, distance: planarDistance(caller.x, caller.y, b.x, b.y) });
  }
  hits.sort((a, b) => a.distance - b.distance || a.body.guid - b.body.guid);
  return hits.map((h) => h.body);
}
