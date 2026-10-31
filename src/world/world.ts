import type { DataStore } from '../data/dataStore.ts';
import type {
  CreatureDef, CreatureSpawnPos, ZoneDef, TrainerDef, VendorDef, GatherNodeDef, ProfTrainerDef, GameObjectDef,
} from '../data/schema.ts';
import type { Character } from '../domain/character/character.ts';
import { questNeededItems, sourceDropItemEntries, type QuestLog } from '../domain/quests/questlog.ts';
import {
  LOCK_KEY_SKILL,
  SKILL_HERBALISM,
  SKILL_MINING,
  isFreeOpenLockType,
  lockHasFreeOpenCase,
  skillByLockType,
} from '../domain/world/openLock.ts';
import {
  goUseHasOutcome,
  goVisibleForPlayer,
  type GoPlayerVisibility,
} from '../domain/world/gameObjects.ts';
import { firstPageForGo } from '../data/pageTexts.ts';
import { scriptDevByGo } from '../domain/scriptdev/index.ts';
import { canAttackCreature, canInteractWithCreature } from '../domain/creature/faction.ts';
import { unitCannotBeAttacked } from '../domain/creature/unitFlags.ts';
import { isScriptCreditOnlyTarget } from '../domain/quests/questScriptCredit.ts';
import { offeredQuests } from '../quests/quests.ts';
import {
  getCreatureAttackDistance,
  isNoAggroOnSight,
  resolveOutdoorPackAssist,
  selectCallForHelp,
  selectGuardAiAssistFromSpawns,
  isGuardOrCivilian,
  selectSpatialPull,
  type AssistCandidate,
  type PackSpawnPos,
  type SpatialPullHit,
  type SpatialPullCandidate,
  type SpatialPullOpts,
  type SpatialPullOrigin,
} from '../domain/creature/creatureAi.ts';
import {
  worldBossEntriesForZone,
  worldBossSpawnsForZone,
  worldBossTemplateFor,
} from '../domain/creature/worldBosses.ts';
import { resolveCreatureDefForCombat } from '../data/dungeons/boss-eventai.ts';
import {
  clusterSpatialCandidates,
  packIdAtPosition,
} from '../data/dungeons/pack-from-clusters.ts';
import viewportsJson from '../data/maps/dungeon-viewports.json' with { type: 'json' };
import {
  aggroHasLineOfSight,
  mapNavGrid,
  type NavGrid,
} from './dungeonNav.ts';
import { projectWorld, type Viewport } from './dungeonMapProjection.ts';
import { type15GameObjectsInZone } from '../domain/world/goMoTransport.ts';
import { type11GameObjectsInZone } from '../domain/world/goTransport.ts';
import { corpseUseFarmEntries, corpseUseFightEntries, corpseUseSummonedEntries } from '../domain/quests/questCorpseUse.ts';

/**
 * Creatures listed as grindable in this zone (plus quest-summoned kill targets when
 * `questlog` is given). When `race` is set, same-faction / Friendly+ NPCs are excluded
 * so Horde cannot farm Horde civilians and Alliance cannot farm Alliance guards.
 * Active quest kill targets that are not outdoor-non-grind (CIVILIAN / faction-35 /
 * same-side noXp) stay listed so Binding still surfaces via questSummonedTargets.
 * Wave T: outdoor world bosses (Kazzak / Azuregos / emerald dragons) merge in from
 * pure-code zone lists so green dragons absent from the bake still appear.
 * Cite: domain/creature/faction.ts canAttackCreature; Unit::CanAttack; domain/creature/worldBosses.ts.
 */
export function huntableCreatures(
  ds: DataStore,
  zoneId: string,
  questlog?: QuestLog,
  race?: number,
): CreatureDef[] {
  const zone = ds.zone(zoneId);
  if (!zone) return [];
  let base = zone.huntable.map((e) => ds.creature(e)).filter((c): c is CreatureDef => !!c);
  // Wave T — world bosses not (or not fully) on zone.huntable
  for (const entry of worldBossEntriesForZone(zoneId)) {
    if (base.some((b) => b.entry === entry)) continue;
    const c =
      resolveCreatureDefForCombat(entry, (id) => ds.creature(id)) ??
      worldBossTemplateFor(entry);
    if (c) base.push(c);
  }
  if (questlog) {
    for (const c of questSummonedTargets(ds, zoneId, questlog)) {
      if (!base.some((b) => b.entry === c.entry)) base.push(c);
    }
  }
  // Script helpers / named triggers are not grind targets (KI-683).
  base = base.filter((c) => !/trigger/i.test(c.name ?? ''));
  if (race != null) {
    const questKills = questlog ? questTargets(ds, questlog).kills : null;
    base = base.filter(
      // The quest-kill exemption exists so The Binding still surfaces its Voidwalker, but it
      // must not resurrect something the client cannot target.
      (c) => canAttackCreature(ds, race, c.entry)
        || ((questKills?.has(c.entry) ?? false) && !unitCannotBeAttacked(c)),
    );
  }
  return base;
}

// CQ5: creature entries that spawn in SOME zone (huntable list or spatial spawns).
// Cached per DataStore — zone lists are immutable after boot.
const spawnedAnywhereCache = new WeakMap<DataStore, Set<number>>();
function spawnedAnywhere(ds: DataStore, entry: number): boolean {
  let set = spawnedAnywhereCache.get(ds);
  if (!set) {
    set = new Set<number>();
    for (const z of ds.zones()) {
      for (const e of z.huntable ?? []) set.add(e);
      for (const s of z.spawns ?? []) set.add(s.entry);
    }
    spawnedAnywhereCache.set(ds, set);
  }
  return set.has(entry);
}

/**
 * CQ5 — ritual / script-summoned quest kill targets. Some kill objectives point at
 * creatures that exist only when a quest script summons them (warlock Binding demons
 * 5676/5677 via the Tome at the summoning circle, Big Will 6238 in the Affray event,
 * Ulag 6390 at the Brill mausoleum — CMaNGOS spawns each from a quest/event script).
 * They are baked CreatureDefs but spawn in NO zone. While such a quest is ACTIVE with
 * the kill unmet, the target surfaces as huntable in the zones that OFFER the quest —
 * the text-RPG stand-in for "perform the ritual where the quest lives". Kill credit
 * then flows through the ordinary resolveFight path.
 */
export function questSummonedTargets(ds: DataStore, zoneId: string, questlog: QuestLog): CreatureDef[] {
  const zone = ds.zone(zoneId);
  if (!zone?.quests?.length) return [];
  const offered = new Set(zone.quests);
  const out: CreatureDef[] = [];
  for (const qs of questlog.quests) {
    if (qs.status !== 'active') continue;
    if (!offered.has(qs.entry)) continue;
    const def = ds.quest(qs.entry);
    if (!def) continue;
    for (const kt of def.killTargets ?? []) {
      if ((qs.kills?.[String(kt.creatureEntry)] ?? 0) >= kt.count) continue;
      if (spawnedAnywhere(ds, kt.creatureEntry)) continue;
      // Standing in a dungeon is not "spawns in no zone": Lord Incendius 9017 is BRD census,
      // and surfacing him outdoors handed the solo run a boss pull (map 230).
      if (ds.isInstanceCreature(kt.creatureEntry)) continue;
      // Same for a battleground: the five Arathi Basin credit markers 15001-15005 and the six
      // AV air commanders are inside maps 30/489/529, not standing in an outdoor zone.
      if (ds.isBattlegroundCreature(kt.creatureEntry)) continue;
      // Type-2 corpse-use summons (8612 Screecher Spirit) are gossip credit, not huntable.
      // Cite: spell_script_target type 2; gossip 1405 cmd 8. Binding tomes stay CQ5 (type 0).
      if (corpseUseSummonedEntries(ds, def).includes(kt.creatureEntry)) continue;
      const c = ds.creature(kt.creatureEntry);
      // A doodad is not a fight. UNIT_FLAG_UNINTERACTIBLE and friends are the exact CanAttack
      // refusal mask: the Andorhal Towers, the AV "Trigger *" air commanders, the Capture Quest
      // Doodads. 24 of 603 kill targets carry it. Cite: Relations.cpp:365.
      if (unitCannotBeAttacked(c)) continue;
      // Friendly + noXp is script credit, never a pull (Tamed Kodo, J'eevee). The Binding's
      // summons carry no noXp and stay. Cite: combatSession.ts:578-586.
      if (isScriptCreditOnlyTarget(ds, kt.creatureEntry, questlog)) continue;
      if (c && !out.some((o) => o.entry === c.entry)) out.push(c);
    }
  }
  return out;
}

/**
 * Sourced spawn placements for a zone (Wave 4C). Empty when the zone has no
 * baked `spawns` — callers must fall back to tier/list hunt, not invent coords.
 * Wave T: merges world-boss spawn overlays (creature table / WorldState.cpp).
 */
export function zoneSpawns(ds: DataStore, zoneId: string): CreatureSpawnPos[] {
  const base = ds.zone(zoneId)?.spawns ?? [];
  const wb = worldBossSpawnsForZone(zoneId);
  if (!wb.length) return base;
  // Prefer bake rows when present for the same entry; append overlays for gaps.
  const have = new Set(base.map((s) => s.entry));
  const extra = wb.filter((s) => !have.has(s.entry));
  return extra.length ? [...base, ...extra] : base;
}

/** Whether this zone can do spatial attackDistance pulls (positions present). */
export function zoneHasSpatialSpawns(ds: DataStore, zoneId: string): boolean {
  return (ds.zone(zoneId)?.spawns?.length ?? 0) > 0;
}

// Every spawn of a creature entry in the zone, in a stable order (map, then x, then y). A caller
// choosing a pull origin picks from these — the first row is a corner spawn as often as a camp.
export function pullOriginsForCreature(
  ds: DataStore,
  zoneId: string,
  entry: number,
): CreatureSpawnPos[] {
  const list = zoneSpawns(ds, zoneId).filter((s) => s.entry === entry);
  list.sort((a, b) => a.map - b.map || a.x - b.x || a.y - b.y);
  return list;
}

// Pick a stable pull origin for a creature entry: first spawn of that entry in the zone (sorted by map,
// then x, then y). Null when no positions exist.
export function pullOriginForCreature(
  ds: DataStore,
  zoneId: string,
  entry: number,
): CreatureSpawnPos | null {
  return pullOriginsForCreature(ds, zoneId, entry)[0] ?? null;
}

/** Viewport for a Classic map id from committed dungeon-viewports.json (first match). */
function viewportForMap(mapId: number): Viewport | null {
  const file = viewportsJson as Record<string, {
    box?: number[];
    mapId?: number;
  }>;
  for (const raw of Object.values(file)) {
    if (!raw || raw.mapId !== mapId) continue;
    if (!Array.isArray(raw.box) || raw.box.length !== 4) continue;
    const box = raw.box.map(Number) as [number, number, number, number];
    if (!box.every(Number.isFinite)) continue;
    return { box, mapId };
  }
  return null;
}

/**
 * LoS predicate from a registered map nav grid + viewport projection.
 * Fail-open (always true) when nav/viewport missing — outdoor zones have no walls.
 * Cite: UnitAI.cpp DetectOrAttack ~530–536 IsWithinLOSInMap.
 */
export function aggroLosForMap(
  mapId: number,
  grid?: NavGrid | null,
  viewport?: Viewport | null,
): SpatialPullOpts['hasLineOfSight'] | undefined {
  const g = grid ?? mapNavGrid(mapId);
  const vp = viewport ?? viewportForMap(mapId);
  if (!g || !vp) return undefined;
  return (origin, candidate) => {
    const aPct = projectWorld(vp, { x: origin.x, y: origin.y, z: origin.z });
    const bPct = projectWorld(vp, { x: candidate.x, y: candidate.y, z: candidate.z });
    return aggroHasLineOfSight(
      g,
      { pct: aPct, z: origin.z },
      { pct: bPct, z: candidate.z },
    );
  };
}

/**
 * Spatial aggro at a world point: creatures whose spawn is within their
 * GetAttackDistance of `origin`, with LoS when a map nav grid is registered and
 * pack-scope when candidates resolve to CFH clusters. Returns [] when the zone
 * has no spawns (tier-only hunt — do not invent).
 * Cite: Unit::GetAttackDistance; UnitAI DetectOrAttack (LOS); pack-clusters packs.
 */
export function spatialPullAt(
  ds: DataStore,
  zoneId: string,
  origin: SpatialPullOrigin,
  playerLevel: number,
  opts?: {
    requireAggroOnSight?: boolean;
    targetIsPlayerPet?: boolean;
    excludeOriginSpawn?: boolean;
    primaryEntry?: number;
    /** Override LoS (tests). `null` disables LoS even when map nav is registered. */
    hasLineOfSight?: SpatialPullOpts['hasLineOfSight'] | null;
    scopeToNearestPack?: boolean;
    packLinks?: ReadonlyMap<string, readonly string[]>;
  },
): SpatialPullHit[] {
  const spawns = zoneSpawns(ds, zoneId);
  if (!spawns.length) return [];

  const mapId = origin.map ?? spawns[0]?.map;
  const candidates: SpatialPullCandidate[] = [];
  for (const s of spawns) {
    const cdef = ds.creature(s.entry);
    if (!cdef) continue;
    const packId =
      mapId != null ? packIdAtPosition(mapId, { x: s.x, y: s.y }) : undefined;
    candidates.push({
      entry: s.entry,
      x: s.x,
      y: s.y,
      map: s.map,
      level: cdef.level,
      detectionRange: cdef.detectionRange,
      extraFlags: cdef.extraFlags,
      ...(packId ? { packId } : {}),
    });
  }

  let hasLos = opts?.hasLineOfSight;
  if (hasLos === null) hasLos = undefined;
  else if (hasLos === undefined && mapId != null) {
    hasLos = aggroLosForMap(mapId);
  }

  return selectSpatialPull(origin, playerLevel, candidates, {
    requireAggroOnSight: opts?.requireAggroOnSight,
    targetIsPlayerPet: opts?.targetIsPlayerPet,
    excludeOriginSpawn: opts?.excludeOriginSpawn,
    primaryEntry: opts?.primaryEntry,
    hasLineOfSight: hasLos,
    scopeToNearestPack: opts?.scopeToNearestPack,
    packLinks: opts?.packLinks,
  });
}

/**
 * Adds that would join a player-initiated pull of `primaryEntry` when spawn
 * positions exist: origin = that entry's spawn; neighbors within *their*
 * attackDistance (passive sight), LoS + nearest-pack scoped when geometry exists.
 * Empty when no positions / no origin spawn.
 * Does not invent multi-combat — returns the entry list for 4A/4B consumers.
 */
export function spatialAddsForPull(
  ds: DataStore,
  zoneId: string,
  primaryEntry: number,
  playerLevel: number,
): SpatialPullHit[] {
  const origin = pullOriginForCreature(ds, zoneId, primaryEntry);
  if (!origin) return [];
  return spatialPullAt(ds, zoneId, origin, playerLevel, {
    requireAggroOnSight: true,
    excludeOriginSpawn: true,
    primaryEntry,
  });
}

/**
 * Spatial pull over a dungeon's CFH/Detection clusters (not zone.spawns).
 * Pack-scoped + LoS when nav is registered for `mapId`. Primary surface for
 * "walk into this pack" in instances.
 *
 * Cite: pack-clusters.json; UnitAI DetectOrAttack; selectSpatialPull.
 */
export function spatialPullOnMap(
  ds: DataStore,
  mapId: number,
  origin: SpatialPullOrigin,
  playerLevel: number,
  opts?: {
    requireAggroOnSight?: boolean;
    hasLineOfSight?: SpatialPullOpts['hasLineOfSight'] | null;
    scopeToNearestPack?: boolean;
    packLinks?: ReadonlyMap<string, readonly string[]>;
    /** Nav/viewport overrides (tests load floorplan without global registry). */
    navGrid?: NavGrid | null;
    viewport?: Viewport | null;
  },
): SpatialPullHit[] {
  const candidates = clusterSpatialCandidates(mapId, (entry) => ds.creature(entry));
  if (!candidates.length) return [];

  let hasLos = opts?.hasLineOfSight;
  if (hasLos === null) hasLos = undefined;
  else if (hasLos === undefined) {
    hasLos = aggroLosForMap(mapId, opts?.navGrid, opts?.viewport);
  }

  return selectSpatialPull(
    { ...origin, map: origin.map ?? mapId },
    playerLevel,
    candidates,
    {
      requireAggroOnSight: opts?.requireAggroOnSight,
      hasLineOfSight: hasLos,
      scopeToNearestPack: opts?.scopeToNearestPack,
      packLinks: opts?.packLinks,
    },
  );
}

// Aggro/pull radius for a creature vs a player level (Unit::GetAttackDistance). System 9 — used by
// autopilot/world when distance is modeled; always pure.
export function creatureAttackDistance(
  creature: CreatureDef,
  playerLevel: number,
  opts?: { targetIsPlayerPet?: boolean; aggroRate?: number },
): number {
  return getCreatureAttackDistance(creature.level, playerLevel, {
    detectionRange: creature.detectionRange,
    targetIsPlayerPet: opts?.targetIsPlayerPet,
    aggroRate: opts?.aggroRate,
  });
}

// Whether this creature passively engages on sight (false when NO_AGGRO_ON_SIGHT). Explicit
// player-initiated fights still allowed; this only gates passive aggro.
export function creatureAggroOnSight(creature: CreatureDef): boolean {
  return !isNoAggroOnSight(creature.extraFlags);
}

/**
 * Call-for-help selection seam: given a caller CreatureDef and neighbor list with
 * distances, return eligible assistants. Multi-combat packs wire this when available.
 * Cite: Creature.cpp CallAssistance / CanAssistTo.
 */
export function callForHelpFrom(
  caller: CreatureDef,
  neighbors: AssistCandidate[],
  opts?: { alreadyCalledAssistance?: boolean },
): AssistCandidate[] {
  // NO_CALL_ASSIST is on the caller's ExtraFlags — selectCallForHelp reads it.
  return selectCallForHelp(
    {
      callForHelpRadius: caller.callForHelpRadius,
      extraFlags: caller.extraFlags,
      alreadyCalledAssistance: opts?.alreadyCalledAssistance,
    },
    neighbors,
  );
}

/**
 * Pack assist for a player-initiated pull of `primaryEntry` in a zone with baked
 * spawns (Wave 4B). Entry-hunt: prefer an isolated primary spawn; keep helpers
 * only from creature_linking_template within searchRange (Princess, Fozruk, Morna)
 * or unique Rank>=1 elites with one outdoor spawn worldwide, within Detection
 * (Otto + Falconcrest). Guid-level CallAssistance is not modeled outdoors.
 *
 * Empty when: no zone spawns, no origin, NO_CALL_ASSIST, isolated + unlinked
 * normal-rank primary. Does not invent pack graphs from spawn-pool co-location.
 *
 * Cite: Creature.cpp CallAssistance ~2148-2164; creature_linking_template;
 * domain `resolveOutdoorPackAssist`.
 */
export function packAssistForPull(
  ds: DataStore,
  zoneId: string,
  primaryEntry: number,
  opts?: { alreadyCalledAssistance?: boolean },
): AssistCandidate[] {
  const callerDef = ds.creature(primaryEntry);
  if (!callerDef) return [];

  const raw = zoneSpawns(ds, zoneId);
  if (!raw.length) return [];

  // Annotate spawns with ExtraFlags + Faction for CanAssistTo.
  // Primary sites get the caller's flags/faction so same-faction checks are exact.
  const spawns: PackSpawnPos[] = [];
  for (const s of raw) {
    const cdef = ds.creature(s.entry);
    const isPrimary = s.entry === primaryEntry;
    spawns.push({
      entry: s.entry,
      x: s.x,
      y: s.y,
      map: s.map,
      extraFlags: isPrimary ? callerDef.extraFlags : cdef?.extraFlags,
      factionId: isPrimary ? callerDef.factionId : cdef?.factionId,
      rank: isPrimary ? callerDef.scaling?.rank : cdef?.scaling?.rank,
      detectionRange: isPrimary ? callerDef.detectionRange : cdef?.detectionRange,
    });
  }

  const worldSpawnCounts = new Map<number, number>();
  for (const z of ds.zones()) {
    for (const s of z.spawns ?? []) {
      worldSpawnCounts.set(s.entry, (worldSpawnCounts.get(s.entry) ?? 0) + 1);
    }
  }

  return resolveOutdoorPackAssist(
    {
      callForHelpRadius: callerDef.callForHelpRadius,
      extraFlags: callerDef.extraFlags,
      alreadyCalledAssistance: opts?.alreadyCalledAssistance,
    },
    primaryEntry,
    spawns,
    worldSpawnCounts,
  );
}

// GuardAI.cpp:72 — idle IsGuard neighbors within 20 yd of a pulled guard/civilian. Victim is the player (no
// outdoor pose); only the creature-who branch can fire.
export function guardAiAssistForPull(
  ds: DataStore,
  zoneId: string,
  primaryEntry: number,
): AssistCandidate[] {
  const whoDef = ds.creature(primaryEntry);
  if (!whoDef || !isGuardOrCivilian(whoDef.extraFlags)) return [];
  const raw = zoneSpawns(ds, zoneId);
  if (!raw.length) return [];
  const sites = raw.filter((s) => s.entry === primaryEntry);
  if (!sites.length) return [];
  sites.sort((a, b) => a.map - b.map || a.x - b.x || a.y - b.y);
  const origin = sites[0]!;
  const spawns: PackSpawnPos[] = [];
  for (const s of raw) {
    const cdef = ds.creature(s.entry);
    spawns.push({
      entry: s.entry,
      x: s.x,
      y: s.y,
      map: s.map,
      extraFlags: cdef?.extraFlags,
      factionId: cdef?.factionId,
    });
  }
  return selectGuardAiAssistFromSpawns(
    { entry: primaryEntry, x: origin.x, y: origin.y, extraFlags: whoDef.extraFlags },
    spawns,
  );
}

/** Zone ids in which the given creature entry is listed as huntable (its spawn zones for grinding / quest targets). */
export function spawnZonesForCreature(ds: DataStore, creatureEntry: number): string[] {
  const out: string[] = [];
  for (const z of ds.zones()) {
    if ((z.huntable ?? []).includes(creatureEntry)) out.push(z.id);
  }
  return out;
}

/**
 * What the player's ACTIVE quests still send them after, for highlighting in the hub:
 * `kills` = creature entries with an unmet kill objective; `items` = quest item entries
 * still to be collected. `objects` = GameObject entries for pickup/click/interact objectives.
 * The UI marks a mob when it's a kill target or drops a needed item, a gather node, and
 * surfaces objects in the gathering section. Completed/turned-in quests contribute nothing.
 */
export function questTargets(ds: DataStore, log: QuestLog): { kills: Set<number>; items: Set<number>; objects: Set<number> } {
  const kills = new Set<number>();
  const items = new Set<number>();
  const objects = new Set<number>();
  for (const qs of log.quests) {
    if (qs.status !== 'active') continue;
    const q = ds.quest(qs.entry);
    if (!q) continue;
    for (const kt of q.killTargets) {
      if ((qs.kills[String(kt.creatureEntry)] ?? 0) < kt.count) {
        const summoned = corpseUseSummonedEntries(ds, q);
        if (summoned.includes(kt.creatureEntry)) {
          for (const e of corpseUseFarmEntries(ds, q)) kills.add(e);
        } else {
          kills.add(kt.creatureEntry);
        }
      }
    }
    for (const e of corpseUseFightEntries(ds, q, qs)) kills.add(e);
    for (const it of q.itemTargets) items.add(it.item);
    for (const item of sourceDropItemEntries(q)) items.add(item);
    for (const ot of (q.objectTargets || [])) {
      const cur = (qs.objects || {})[String(ot.objectEntry)] ?? 0;
      if (cur < ot.count) objects.add(ot.objectEntry);
    }
  }
  return { kills, items, objects };
}

/** Whether a creature is worth a quest marker: a live kill target or a needed-item dropper. */
export function isQuestMob(ds: DataStore, cr: CreatureDef, targets: { kills: Set<number>; items: Set<number>; objects?: Set<number> }): boolean {
  if (targets.kills.has(cr.entry)) return true;
  if (!targets.items.size) return false;
  // QI3: any loot row for a still-tracked quest item (condition gating is applied by the
  // planner's creatureDropsItem / huntableQuests path when deciding fights).
  return ds.lootTable(cr.lootId).some((e) => targets.items.has(e.item));
}

export function neighbourZones(ds: DataStore, zoneId: string): ZoneDef[] {
  const zone = ds.zone(zoneId);
  if (!zone) return [];
  return zone.neighbors.map((id) => ds.zone(id)).filter((z): z is ZoneDef => !!z);
}

/** The trainer for a given class present in the zone, if any. */
export function zoneTrainer(ds: DataStore, zoneId: string, cls: number): TrainerDef | undefined {
  const zone = ds.zone(zoneId);
  const link = zone?.trainers.find((t) => t.cls === cls);
  return link ? ds.trainer(link.entry) : undefined;
}

/** Weapon masters (TrainerType=2) present in the zone, if any. */
export function zoneWeaponTrainers(ds: DataStore, zoneId: string): TrainerDef[] {
  const zone = ds.zone(zoneId);
  if (!zone?.weaponTrainers?.length) return [];
  return zone.weaponTrainers
    .map((e) => ds.trainer(e))
    .filter((t): t is TrainerDef => !!t);
}

/** Hunter pet trainers present in the zone (empty if none — `zone.petTrainers` is optional). */
export function zonePetTrainers(ds: DataStore, zoneId: string): TrainerDef[] {
  const zone = ds.zone(zoneId);
  if (!zone?.petTrainers?.length) return [];
  return zone.petTrainers
    .map((e) => ds.trainer(e))
    .filter((t): t is TrainerDef => !!t);
}

/** Vendor entries spawned in the zone: baked zone.vendors plus innkeepers who have a stock table. */
export function zoneVendorEntries(zone: { vendors?: number[]; innkeepers?: { entry: number }[] }): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (e: number): void => {
    if (!(e > 0) || seen.has(e)) return;
    seen.add(e);
    out.push(e);
  };
  for (const e of zone.vendors ?? []) add(e);
  for (const i of zone.innkeepers ?? []) add(i.entry);
  return out;
}

/**
 * Vendors present in the zone (empty if none — a zone's `vendors` list is optional).
 * Innkeepers with an npc_vendor table are merchants too (Helbrek / Flagon of Mead).
 * PRODUCT RULE: the two capital halls have no door. `requiredVisualRank` stays baked (12 NPCs,
 * Player.cpp:19962 ENTER_HALL_RANK 6) but nothing gates on it — Honor Points buy the shelf, so
 * hiding the quartermaster behind a rank would hide the currency's only sink.
 */
export function zoneVendors(ds: DataStore, zoneId: string): VendorDef[] {
  const zone = ds.zone(zoneId);
  if (!zone) return [];
  return zoneVendorEntries(zone)
    .map((e) => ds.vendor(e))
    .filter((v): v is VendorDef => !!v);
}

// The zone's vendors who will deal with this character: enemy-faction merchants and factions you
// declared war on refuse. Cite: ItemHandler.cpp:704 GetNPCIfCanInteractWith(UNIT_NPC_FLAG_VENDOR).
export function interactableZoneVendors(
  ds: DataStore,
  zoneId: string,
  race: number,
  atWar?: ReadonlySet<number>,
): VendorDef[] {
  return zoneVendors(ds, zoneId).filter((v) => canInteractWithCreature(ds, race, v.entry, atWar));
}

export type VendorStockHit = { vendorEntry: number; zoneId: string };

const vendorHitsByItem = new WeakMap<DataStore, Map<number, VendorStockHit[]>>();

function vendorHitsIndex(ds: DataStore): Map<number, VendorStockHit[]> {
  let idx = vendorHitsByItem.get(ds);
  if (idx) return idx;
  idx = new Map();
  for (const z of ds.zones()) {
    for (const e of zoneVendorEntries(z)) {
      const v = ds.vendor(e);
      if (!v) continue;
      for (const item of v.items) {
        const list = idx.get(item);
        const hit = { vendorEntry: v.entry, zoneId: z.id };
        if (list) list.push(hit);
        else idx.set(item, [hit]);
      }
    }
  }
  vendorHitsByItem.set(ds, idx);
  return idx;
}

/** Prefer a merchant in `currentZone`, else any zone that stocks `itemId`. */
export function findVendorSelling(
  ds: DataStore,
  itemId: number,
  currentZone: string,
): VendorStockHit | null {
  const hits = vendorHitsIndex(ds).get(itemId);
  if (!hits || hits.length === 0) return null;
  const known = (h: VendorStockHit): boolean => !!ds.vendor(h.vendorEntry);
  const local = hits.find((h) => h.zoneId === currentZone && known(h));
  if (local) return local;
  return hits.find(known) ?? null;
}

/** Every zone-attached vendor that lists `itemId`; the same index findVendorSelling reads. */
export function vendorsSelling(ds: DataStore, itemId: number): VendorStockHit[] {
  return vendorHitsIndex(ds).get(itemId) ?? [];
}

/** Gather nodes harvestable in the zone (mining/herbalism/fishing; empty if none). */
export function zoneNodes(ds: DataStore, zoneId: string): GatherNodeDef[] {
  const zone = ds.zone(zoneId);
  if (!zone) return [];
  return (zone.nodes ?? []).map((id) => ds.gatherNode(id)).filter((n): n is GatherNodeDef => !!n);
}

/** Profession trainers present in the zone (empty if none). */
export function zoneProfTrainers(ds: DataStore, zoneId: string): ProfTrainerDef[] {
  const zone = ds.zone(zoneId);
  if (!zone) return [];
  return (zone.profTrainers ?? []).map((e) => ds.profTrainer(e)).filter((t): t is ProfTrainerDef => !!t);
}

/** GameObjects (chests, clickables, nodes, containers) present/spawned in the zone.
 * Uses real per-zone spawns from ZoneDef.objects (G2). Falls back to quest-ref derivation
 * only for zones that have no baked `objects` field yet (pre-G2 data or no spawns in slice).
 */
export function zoneGameObjects(ds: DataStore, zoneId: string): GameObjectDef[] {
  const zone = ds.zone(zoneId);
  if (!zone) return [];
  // Real baked spawns (Lane G) take precedence so chests/clickables/nodes appear in-zone.
  // Quest-ref fallback is kept only when the zone lacks an `objects` key entirely.
  if (zone.objects !== undefined) {
    const baked = (zone.objects ?? []).map((e) => ds.gameObject(e)).filter((g): g is GameObjectDef => !!g);
    const extra = [
      ...type11GameObjectsInZone(zoneId, ds.travelEdges(), (e) => ds.gameObject(e)),
      ...type15GameObjectsInZone(zoneId, ds.transports(), (e) => ds.gameObject(e)),
    ];
    if (!extra.length) return baked;
    const seen = new Set(baked.map((g) => g.entry));
    for (const g of extra) if (!seen.has(g.entry)) baked.push(g);
    return baked;
  }
  const ids = new Set<number>();
  for (const qe of zone.quests ?? []) {
    const q = ds.quest(qe);
    if (q) for (const ot of (q.objectTargets || [])) ids.add(ot.objectEntry);
  }
  return [...ids].map((e) => ds.gameObject(e)).filter((g): g is GameObjectDef => !!g);
}

/**
 * GameObject entries some quest names — an objective target, a goStarter or a goEnder. `zoneGoVisible`
 * reads it so a Use that only ever mattered to a quest still shows its row. Built in one pass over
 * `ds.quests()` because that map grows on `attachQuests`; callers hold the set for a render.
 */
export function questReferencedGoEntries(ds: DataStore): Set<number> {
  const s = new Set<number>();
  for (const q of ds.quests()) {
    for (const ot of (q.objectTargets ?? [])) s.add(ot.objectEntry);
    if (q.goStarter) s.add(q.goStarter);
    if (q.goEnder) s.add(q.goEnder);
    for (const e of (q.goStarterEntries ?? [])) s.add(e);
    for (const e of (q.goEnderEntries ?? [])) s.add(e);
  }
  return s;
}

/** Herb / vein GOs — already on the Gather row, or unusable without the skill. */
function isHerbOrMineGo(ds: DataStore, go: GameObjectDef): boolean {
  const lock = go.lockId != null ? ds.lock(go.lockId) : undefined;
  if (lockHasFreeOpenCase(lock)) return false;
  const node = ds.gatherNode(go.entry);
  if (node && (node.skill === 'herbalism' || node.skill === 'mining')) return true;
  const hard = (lock?.cases ?? []).filter(
    (c) => c.type === LOCK_KEY_SKILL && !isFreeOpenLockType(c.index) && c.index !== 0,
  );
  if (!hard.length) return false;
  return hard.every((c) => {
    const skill = skillByLockType(c.index);
    return skill === SKILL_HERBALISM || skill === SKILL_MINING;
  });
}

/**
 * Object list on Main: drop herb/vein rows, then drop the rows whose Use resolves ok and shows the
 * player nothing at all (`goUseHasOutcome`). Pass `questRefs` from `questReferencedGoEntries` once
 * per render; without it only the herb/vein rule applies.
 */
export function zoneGoVisible(ds: DataStore, go: GameObjectDef, questRefs?: ReadonlySet<number>): boolean {
  if (isHerbOrMineGo(ds, go)) return false;
  if (!questRefs) return true;
  return goUseHasOutcome(go, {
    questReferenced: questRefs.has(go.entry),
    hasPageText: firstPageForGo(go.entry) != null,
    isGatherNode: !!ds.gatherNode(go.entry),
    hasScriptedUse: ds.goUseScripts(go.entry).length > 0 || !!scriptDevByGo(go.entry)?.goUse,
  });
}

/** Quest log + fishing line for `goVisibleForPlayer` / `zoneGoListedForPlayer`. */
export function makeGoPlayerVisibility(
  ds: DataStore,
  log: QuestLog,
  hasFishing: boolean,
): GoPlayerVisibility {
  const incompleteQuestIds = new Set<number>();
  for (const q of log.quests) {
    if (q.status === 'active') incompleteQuestIds.add(q.entry);
  }
  return {
    incompleteQuestIds,
    neededItems: questNeededItems(log, (e) => ds.quest(e)),
    neededGoEntries: questTargets(ds, log).objects,
    hasFishing,
  };
}

/** zoneGoVisible plus quest/fishing Use gates. Player view from makeGoPlayerVisibility. */
export function zoneGoListedForPlayer(
  ds: DataStore,
  go: GameObjectDef,
  questRefs: ReadonlySet<number> | undefined,
  player: GoPlayerVisibility,
): boolean {
  if (!zoneGoVisible(ds, go, questRefs)) return false;
  return goVisibleForPlayer(go, player, (lootId) => ds.lootTable(`go:${lootId}`));
}

export function canTravel(ds: DataStore, fromZone: string, toZone: string): boolean {
  const zone = ds.zone(fromZone);
  return !!zone && zone.neighbors.includes(toZone);
}

/** How many quests a zone offers that the character can accept right now — a hint for travel/map. */
export function availableQuestCount(ds: DataStore, zoneId: string, char: Character, log: QuestLog): number {
  return offeredQuests(ds, zoneId, char, log).filter((o) => o.canAccept).length;
}
