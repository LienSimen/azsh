// Product pull seeder: where every body stands at t=0 of a real fight. The one rule all three branches
// obey is never opening a melee pull at reach — no walk-in means no snare and no Charge.

import type { CombatantSpec } from '../combat.ts';
import type { SpellDef } from '../../data/schema.ts';
import { castableKitIdsOfSpec } from '../combat/castableKit.ts';
import type { CombatPosYd, PullFrame, PullGeometryAnchor } from '../combat/combatGeometry.ts';
import {
  DEFAULT_OPEN_YD,
  isEnemyCasterKit,
  isPartyBackLineUnit,
  seedClusterPackPositions,
  seedMeleePackPositions,
  seedOutdoorPackPositions,
} from '../combat/combatGeometry.ts';
import { getCreatureAttackDistance } from '../../domain/creature/creatureAggro.ts';
import { ARENA_START } from '../../domain/run/battlegroundRun.ts';
import {
  getClusterMap,
  clusterMemberByGuidAllMaps,
  type ClusterMember,
} from '../../data/dungeons/pack-from-clusters.ts';
import { resolveSpawnMembers } from '../../data/dungeonSpawns.ts';

// Honest open yards for one creature at t=0 — GetAttackDistance, the distance at which the mob notices
// you. NOT the melee stop band: collapsing those two numbers is the defect this seeder fixes.
export function pullOpenYd(opts: {
  creatureLevel: number;
  playerLevel: number;
  detectionRange?: number;
}): number {
  return getCreatureAttackDistance(opts.creatureLevel, opts.playerLevel, {
    detectionRange: opts.detectionRange,
  });
}

/** Cluster geometry carried on a dungeon encounter (absent → synthetic fallback). */
export interface ClusterSeedInput {
  // `z` is optional but real: pack-from-clusters builds origins with one and the solo pin reads it.
  // The type omitted it, so that read did not typecheck.
  origin?: { x: number; y: number; z?: number };
  spawnGuids?: number[];
  /** Classic map id; absent → scan every cluster map for these guids. */
  mapId?: number;
  /** DR fusion ids — a fused multi-encounter pull has no single real layout. */
  fusedIds?: string[];
  // Sim-time since instance enter (ms). MT=2 members advance along creature_movement. Same elapsed → same
  // pose on every peer (lockstep). Absent/0 → spawn home.
  elapsedMs?: number;
}

export interface PullSeedInput {
  /** Player combatant (kit decides melee pile vs back line). */
  player: {
    rangedAuto?: boolean;
    classId?: number;
    weapon?: { dmgMax?: number } | null;
    spells?: readonly { rangeMax?: number | null; role?: string | null }[];
    standYards?: number;
  };
  /** Enemy specs in combat side order (enemy, enemy_1, …). */
  enemySpecs: readonly CombatantSpec[];
  /** Squad allies in ally_0.. order (null / empty when solo). */
  allySpecs?: readonly CombatantSpec[] | null;
  includePet: boolean;
  /** Sourced contact yards for the primary (see `pullOpenYd`). */
  primaryOpenYd: number;
  /** CallForHelp assist distances in enemy_1.. order; empty for non-assist pulls. */
  helperDistancesYd?: readonly number[];
  /** Player-chosen AoE pull distances, seated after the assist helpers (aoePullExtras). */
  extraDistancesYd?: readonly number[];
  /** Entry used when a spec carries no `creatureEntry` (primary fallback). */
  primaryEntry: number;
  /** The opponent is a TEAM, so mirror the party formation instead of the mob arc + caster ring. */
  enemyIsATeam?: boolean;
  // The session's spell store. The pack is split melee versus caster BEFORE any seat exists, so
  // reachability comes from a spec: without it 22 creatures opened at the caster ring on a dead kit.
  spellOf?: (id: number) => SpellDef | undefined;
  cluster?: ClusterSeedInput;
}

/** Resolve cluster members for `spawnGuids`, or null when any guid is unknown. */
function resolveClusterMembers(
  spawnGuids: readonly number[],
  mapId: number | undefined,
  elapsedMs?: number,
): ClusterMember[] | null {
  // Prefer the spawn bake, which carries the full creature table and orientation metadata. Packs
  // decide WHAT fights together; this is WHERE they stand, poses advanced by elapsed time.
  const fromBake = resolveSpawnMembers(spawnGuids, { elapsedMs });
  if (fromBake) {
    return fromBake.map((m) => ({
      guid: m.guid,
      entry: m.entry,
      x: m.x,
      y: m.y,
      z: m.z,
    }));
  }

  const byGuid = new Map<number, ClusterMember>();
  if (mapId != null) {
    const cmap = getClusterMap(mapId);
    if (cmap) {
      for (const pack of cmap.packs) {
        for (const m of pack.members) byGuid.set(m.guid, m);
      }
    }
  } else {
    // Scan all cluster maps for these guids (InstanceDef has no map field).
    for (const [guid, m] of clusterMemberByGuidAllMaps()) {
      if (!byGuid.has(guid)) byGuid.set(guid, m);
    }
  }
  const members: ClusterMember[] = [];
  for (const g of spawnGuids) {
    const m = byGuid.get(g);
    if (!m) return null; // partial resolve would invent coords — fall back instead
    members.push(m);
  }
  return members.length > 0 ? members : null;
}

/** Resolved cluster-branch inputs, or null when this pull cannot use real coords. */
function resolveClusterSeed(input: PullSeedInput): {
  origin: { x: number; y: number; z?: number };
  members: ClusterMember[];
  mapId?: number;
} | null {
  const cl = input.cluster;
  // Fusion unions two packs that can be far apart, so their guid coords no longer share
  // one honest origin — the seeder refuses rather than inventing a merged frame.
  const noFusion = !cl?.fusedIds || cl.fusedIds.length <= 1;
  if (!noFusion || !cl?.origin || input.enemySpecs.length < 1) return null;

  // Need real spawn guids for a multi-member relative layout. Solo / origin-only
  // pins go through seedClusterPackPositions which refuses n<=1 (arbitrary +x void).
  if (!cl.spawnGuids || cl.spawnGuids.length === 0) return null;
  if (input.enemySpecs.length <= 1 && cl.spawnGuids.length <= 1) return null;
  const members = resolveClusterMembers(cl.spawnGuids, cl.mapId, cl.elapsedMs);
  if (!members) return null;
  return { origin: cl.origin, members, mapId: cl.mapId };
}

export type { PullFrame, PullGeometryAnchor };

/** `pull-local` — the frame for every layout that is bands rather than spawn coords. */
const LOCAL_FRAME: PullGeometryAnchor = { frame: 'pull-local' };

// Where player-shaped duelists stand at t=0, so a duel mounts the combat STAGE instead of floating
// frames. Open yards are ARENA_START's 24: outside melee, inside the engage band, past Charge's min.
export function seedDuelGeometry(input: {
  player: PullSeedInput['player'];
  enemySpecs: readonly CombatantSpec[];
  allySpecs?: readonly CombatantSpec[] | null;
  /** The duelist brought a beast or demon, so side `pet` needs yards of its own. */
  includePet?: boolean;
  spellOf?: (id: number) => SpellDef | undefined;
  /**
   * The opponent is a TEAM (an arena team match), so seed it with the party's own formation
   * mirrored instead of a mob approach arc plus caster ring. `ARENA_START` is symmetric and this
   * function kept only its distance; side A got the protected -20 yd party line and side B did
   * not, and side A won 20/20 mirrors (`scripts/qa/repro-arena-seat-gap.mjs`).
   */
  enemyIsATeam?: boolean;
}): { positions: Record<string, CombatPosYd>; anchor: PullGeometryAnchor } {
  return seedPullGeometry({
    player: input.player,
    enemySpecs: input.enemySpecs,
    allySpecs: input.allySpecs ?? null,
    includePet: input.includePet === true,
    primaryOpenYd: Math.abs(ARENA_START.horde.x - ARENA_START.alliance.x),
    primaryEntry: 0,
    ...(input.enemyIsATeam ? { enemyIsATeam: true } : {}),
    ...(input.spellOf ? { spellOf: input.spellOf } : {}),
  });
}

// Seed a pull AND report which frame the result is in. The anchor is derived from the layout actually
// produced: a predicted one would claim real coordinates for a synthetic fallback.
export function seedPullGeometry(input: PullSeedInput): {
  positions: Record<string, CombatPosYd>;
  anchor: PullGeometryAnchor;
} {
  const allySpecs = input.allySpecs ?? [];
  const allyN = allySpecs.length;
  const playerBackLine = isPartyBackLineUnit(input.player);
  const allyBackLine = allySpecs.map((a) => isPartyBackLineUnit(a as never));
  const allyRole = allySpecs.map((a) => a.groupRole);

  // Outdoor assist is a band layout: player at origin, contact/assist distances
  // outward. Real yards, invented bearings — so it is pull-local by construction.
  const helpers = input.helperDistancesYd ?? [];
  if (helpers.length === 0) {
    const cs = resolveClusterSeed(input);
    if (cs) {
      const seeded = seedClusterPackPositions({
        origin: cs.origin,
        members: cs.members,
        enemyEntries: input.enemySpecs.map((e) => e.creatureEntry ?? input.primaryEntry),
        allyCount: allyN,
        includePet: input.includePet,
        playerBackLine,
        allyBackLine,
        allyRole,
        meleeOpenYd: productOpenYd(input),
      });
      if (seeded) {
        return {
          positions: seeded,
          anchor: { frame: 'world-translated', origin: cs.origin, mapId: cs.mapId },
        };
      }
    }
  }
  return { positions: seedPullPositions(input), anchor: LOCAL_FRAME };
}

/** Ranged-auto opens floor at DEFAULT_OPEN_YD (18) so level-diff contact is not inside Auto Shot min. Cite: KI-870. */
function productOpenYd(input: PullSeedInput): number {
  const open = input.primaryOpenYd > 0 ? input.primaryOpenYd : DEFAULT_OPEN_YD;
  if (input.player.rangedAuto === true) return Math.max(open, DEFAULT_OPEN_YD);
  return open;
}

// Seed `unitPositionsYd` for a product pull. Always returns a layout — every real fight has geometry,
// including outdoor solo 1v1 (§3.5 "Unseeded" row).
export function seedPullPositions(input: PullSeedInput): Record<string, CombatPosYd> {
  const allySpecs = input.allySpecs ?? [];
  const allyN = allySpecs.length;
  const playerBackLine = isPartyBackLineUnit({
    isPlayer: true,
    rangedAuto: input.player.rangedAuto === true,
    classId: input.player.classId,
    weaponDmgMax: input.player.weapon?.dmgMax,
    spells: input.player.spells,
    standYards: input.player.standYards,
  });
  const allyBackLine = allySpecs.map((a) =>
    isPartyBackLineUnit({
      groupRole: a.groupRole,
      rangedAuto: a.rangedAuto === true,
      classId: a.classId,
      weaponDmgMax: a.weapon?.dmgMax,
      spells: a.spells,
      standYards: a.standYards,
    }),
  );
  const allyRole = allySpecs.map((a) => a.groupRole);
  const openYd = productOpenYd(input);

  // --- Outdoor CallForHelp: player at origin, primary at contact, helpers beyond ---
  const helpers = input.helperDistancesYd ?? [];
  const extras = input.extraDistancesYd ?? [];
  if (helpers.length > 0) {
    return seedOutdoorPackPositions({
      helperDistancesYd: helpers,
      ...(extras.length ? { extraDistancesYd: extras } : {}),
      allyCount: allyN,
      includePet: input.includePet,
      primaryOpenYd: openYd,
      playerBackLine,
      allyBackLine,
      allyRole,
    });
  }

  // --- Dungeon cluster: real relative spawn coords (multi-enemy, no fusion) --- Same resolver
  // `pullGeometryAnchor` reads, so the frame it reports is the frame that actually gets seeded.
  const cs = resolveClusterSeed(input);
  if (cs) {
    const seeded = seedClusterPackPositions({
      origin: cs.origin,
      members: cs.members,
      enemyEntries: input.enemySpecs.map((e) => e.creatureEntry ?? input.primaryEntry),
      allyCount: allyN,
      includePet: input.includePet,
      playerBackLine,
      allyBackLine,
      allyRole,
      meleeOpenYd: openYd,
    });
    if (seeded) return seeded;
  }

  // --- Synthetic (incl. solo 1v1): melee on the open arc, casters on the ring ---
  // A TEAM opponent is judged by the SAME back-line rule as the party (`isPartyBackLineUnit`),
  // not by `isEnemyCasterKit`: two rules for one question put side B's warrior on the caster ring.
  const enemyTeam = input.enemyIsATeam === true
    ? input.enemySpecs.map((e) => isPartyBackLineUnit({
      groupRole: e.groupRole,
      rangedAuto: e.rangedAuto === true,
      classId: e.classId,
      weaponDmgMax: e.weapon?.dmgMax,
      spells: e.spells,
      standYards: e.standYards,
    }))
    : null;
  return seedMeleePackPositions({
    enemyCount: input.enemySpecs.length,
    allyCount: allyN,
    includePet: input.includePet,
    playerBackLine,
    allyBackLine,
    allyRole,
    ...(enemyTeam ? {
      enemyTeamBackLine: enemyTeam,
      enemyTeamRole: input.enemySpecs.map((e) => e.groupRole),
    } : {}),
    // Every `enemySpecs` entry is an enemy by construction, which is the side test the Fighter
    // form of the helper does; there is no seat to ask here yet.
    enemyCaster: input.enemySpecs.map((e) =>
      isEnemyCasterKit(e.spells, {
        maxPower: e.maxPower,
        castable: castableKitIdsOfSpec(e, input.spellOf),
      }),
    ),
    meleeOpenYd: openYd,
  });
}
