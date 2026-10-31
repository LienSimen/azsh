// The AV field: the creature bodies a battleground event slot spawns and despawns. Cite:
// BattleGroundAV.cpp:596 SpawnEvent(node, teamIdx * BG_AV_MAX_STATES + state) — every guard,
// lieutenant and general on map 30 is a `creature` row tagged by `creature_battleground`.

import type { BgPos, BgTeam, BgUnit, BgUnitId } from './types.ts';
import type { BgWorld } from './bgWorld.ts';
import type { AvFieldHooks } from './av.ts';
import { AV_DATA } from '../../data/alteracValley.ts';
import type { AvSpawnRow } from '../../data/alteracValley.ts';
import type { FactionTemplateDef } from '../../data/schema.ts';
import { factionHasNoEnemies } from '../creature/faction.ts';
import { isScriptAnchorCreature } from '../creature/unitFlags.ts';

/** How far a guard chases before it turns back to its post. Cite: creature_template.leash default. */
export const AV_GUARD_LEASH_YD = 40;
/** A general or a captain holds its room and never leaves it. */
export const AV_COMMANDER_LEASH_YD = 25;

export interface AvBody {
  name: string;
  level: number;
  maxHp: number;
  /** Player class id when the creature maps to one, else 0 — only drives the chip glyph. */
  cls: number;
  /** Yards/second. Cite: creature_template.SpeedRun × BASE_RUN_SPEED. */
  speedYd: number;
}

export interface AvFieldOpts {
  world: BgWorld;
  /** Which side a creature entry fights for, from `creature_template.FactionAlliance`. */
  teamOf(entry: number): BgTeam | null;
  /** Level / health / speed for one creature entry; null drops the body. */
  bodyOf(entry: number): AvBody | null;
  onSpawn?(unit: BgUnit): void;
  onDespawn?(unit: BgUnit): void;
}

export interface AvField extends AvFieldHooks {
  /** The always-on half of the map: wildlife, quest givers, base guards, the generals' rooms. */
  spawnStatic(): void;
  /**
   * Put one body on the field with no event slot behind it — what a quest milestone buys
   * (avQuests.ts AV_WAVES). It marches on the enemy keep rather than holding a post.
   */
  spawnWaveBody(entry: number, team: BgTeam, at: BgPos, marchTo: BgPos): BgUnit | null;
  /** Living bodies of one creature entry. */
  unitsOfEntry(entry: number): BgUnit[];
  /** Every NPC body currently on the field. */
  npcs(): BgUnit[];
  /** Bodies within `yd` of a point — what a session would have to seat to make a fight real. */
  near(x: number, y: number, yd: number): BgUnit[];
  /** Total spawned so far, for the capability rows. */
  spawnedCount(): number;
}

const COMMANDER_ENTRIES = new Set<number>(
  [
    AV_DATA.commanders.boss.alliance?.entry,
    AV_DATA.commanders.boss.horde?.entry,
    AV_DATA.commanders.captain.alliance?.entry,
    AV_DATA.commanders.captain.horde?.entry,
    ...AV_DATA.commanders.lieutenants.map((l) => l.entry),
  ].filter((e): e is number => typeof e === 'number'),
);

/** Spawn rows grouped by their event slot, so a flip is one map lookup rather than a scan. */
function indexByEvent(rows: readonly AvSpawnRow[]): Map<number, Map<number, AvSpawnRow[]>> {
  const out = new Map<number, Map<number, AvSpawnRow[]>>();
  for (const r of rows) {
    if (r.event1 == null) continue;
    let byVariant = out.get(r.event1);
    if (!byVariant) { byVariant = new Map(); out.set(r.event1, byVariant); }
    const list = byVariant.get(r.event2 ?? 0);
    if (list) list.push(r);
    else byVariant.set(r.event2 ?? 0, [r]);
  }
  return out;
}

/**
 * Templates that must never get a floor body: a script anchor, or a template at war with nobody.
 * Without this the 3 PvP credit markers, the 6 wing-commander triggers, the 2 Invisible Stalkers
 * and the 4 Heralds - 17 of the 1,198 AV spawn rows - fall through `teamOf` as neutral, take a
 * side from `neutralSideFor` below, and stand in the valley as 1 hp enemies.
 * Cite: Relations.cpp:365 CanAttack; faction template 35 (enemyMask 0, no enemy factions).
 */
export function avNonCombatTemplate(
  creature: { unitFlags?: number } | null | undefined,
  ft: FactionTemplateDef | null | undefined,
): boolean {
  if (!creature) return true;
  if (isScriptAnchorCreature(creature)) return true;
  return !!ft && factionHasNoEnemies(ft);
}

/**
 * PRODUCT RULE. The valley's wildlife and the neutral mine crews (troggs, gnolls, harpies, rams)
 * are hostile to BOTH sides in 1.12, and a two-team world has no way to say that. Each such body
 * takes the side whose keep is FARTHER from it, so the team living next to a pack has to fight it —
 * which is how the mine and the armor-scrap farm actually play. Deterministic, so a replay matches.
 */
function neutralSideFor(row: AvSpawnRow): BgTeam {
  const a = AV_DATA.commanders.boss.alliance;
  const h = AV_DATA.commanders.boss.horde;
  if (!a || !h) return 'horde';
  const da = (row.x - a.x) ** 2 + (row.y - a.y) ** 2;
  const dh = (row.x - h.x) ** 2 + (row.y - h.y) ** 2;
  return da > dh ? 'alliance' : 'horde';
}

export function createAvField(o: AvFieldOpts): AvField {
  const { world } = o;
  const byEvent = indexByEvent(AV_DATA.spawns);
  /** Live unit ids per event slot, so a re-spawn despawns exactly what it replaces. */
  const liveByEvent = new Map<number, BgUnitId[]>();
  const liveByEntry = new Map<number, Set<BgUnitId>>();
  const npcIds = new Set<BgUnitId>();
  let spawned = 0;
  let seq = 0;

  const remember = (u: BgUnit): void => {
    npcIds.add(u.id);
    let set = liveByEntry.get(u.npc!.entry);
    if (!set) { set = new Set(); liveByEntry.set(u.npc!.entry, set); }
    set.add(u.id);
  };

  const forget = (u: BgUnit): void => {
    npcIds.delete(u.id);
    liveByEntry.get(u.npc!.entry)?.delete(u.id);
  };

  function spawnRow(row: AvSpawnRow): BgUnit | null {
    const team = o.teamOf(row.entry);
    const body = o.bodyOf(row.entry);
    if (!body) return null;
    // A neutral creature still needs a side to fight on. `neutralSideFor` is a PRODUCT RULE — see
    // its own note; two teams cannot express "hostile to everyone".
    const side: BgTeam = team ?? neutralSideFor(row);
    const unit: BgUnit = {
      id: `n${seq++}`,
      team: side,
      name: body.name || row.name,
      cls: body.cls,
      level: body.level,
      pos: { x: row.x, y: row.y },
      z: row.z,
      hp: body.maxHp,
      maxHp: body.maxHp,
      // A general, captain or tower lieutenant reads as `npc-commander`, which is what the AV
      // strategy bundle aims a push at (strategies.ts avKillCommander).
      role: COMMANDER_ENTRIES.has(row.entry) ? 'npc-commander' : 'npc-guard',
      order: { kind: 'hold' },
      speedYd: body.speedYd,
      human: false,
      npc: {
        entry: row.entry,
        // `teamOf` returned nothing, so no faction template claims it: wildlife and mine trash.
        ...(team == null ? { neutral: true } : {}),
        ...(row.event1 == null ? {} : { event1: row.event1, event2: row.event2 }),
        post: { x: row.x, y: row.y },
        leashYd: COMMANDER_ENTRIES.has(row.entry) ? AV_COMMANDER_LEASH_YD : AV_GUARD_LEASH_YD,
        // MovementType 1 is MOVEMENT_RANDOM — 312 of the valley's spawn rows carry it, and every
        // one of them stood frozen. Cite: creature.MovementType/spawndist; ObjectMgr.cpp LoadCreatures.
        ...(row.movementType === 1 && (row.spawndist ?? 0) > 0
          ? { wanderYd: row.spawndist }
          : {}),
      },
    };
    world.addUnit(unit);
    remember(unit);
    spawned++;
    o.onSpawn?.(unit);
    return unit;
  }

  function despawnEvent(event1: number): void {
    const ids = liveByEvent.get(event1);
    if (!ids) return;
    for (const id of ids) {
      const u = world.units.get(id);
      if (!u) continue;
      forget(u);
      world.units.delete(id);
      o.onDespawn?.(u);
    }
    liveByEvent.set(event1, []);
  }

  return {
    spawnEvent(event1, variant) {
      despawnEvent(event1);
      if (variant == null) return;
      const rows = byEvent.get(event1)?.get(variant);
      if (!rows) return;
      const ids: BgUnitId[] = [];
      for (const row of rows) {
        const u = spawnRow(row);
        if (u) ids.push(u.id);
      }
      liveByEvent.set(event1, ids);
    },

    entryAlive(entry) {
      const set = liveByEntry.get(entry);
      if (!set) return false;
      for (const id of set) {
        const u = world.units.get(id);
        if (u && world.alive(u)) return true;
      }
      return false;
    },

    spawnStatic() {
      for (const row of AV_DATA.spawns) {
        if (row.event1 != null) continue;
        spawnRow(row);
      }
    },

    spawnWaveBody(entry, team, at, marchTo) {
      const body = o.bodyOf(entry);
      if (!body) return null;
      const unit = {
        id: `n${seq++}`,
        team,
        name: body.name,
        cls: body.cls,
        level: body.level,
        pos: { x: at.x, y: at.y },
        z: 0,
        hp: body.maxHp,
        maxHp: body.maxHp,
        // A wave is not a guard: it walks the length of the valley, so it holds no post and its
        // leash is the whole map. Cite: BattleGroundAV.cpp:190 — the C++ never implemented this.
        role: 'npc-commander' as const,
        order: { kind: 'attack-move' as const, to: { x: marchTo.x, y: marchTo.y } },
        speedYd: body.speedYd,
        human: false,
        npc: { entry, post: { x: marchTo.x, y: marchTo.y }, leashYd: 4000 },
      };
      world.addUnit(unit);
      remember(unit);
      spawned++;
      o.onSpawn?.(unit);
      return unit;
    },

    unitsOfEntry(entry) {
      const out: BgUnit[] = [];
      for (const id of liveByEntry.get(entry) ?? []) {
        const u = world.units.get(id);
        if (u) out.push(u);
      }
      return out;
    },

    npcs() {
      const out: BgUnit[] = [];
      for (const id of npcIds) {
        const u = world.units.get(id);
        if (u) out.push(u);
      }
      return out;
    },

    near(x, y, yd) {
      const out: BgUnit[] = [];
      const r2 = yd * yd;
      for (const id of npcIds) {
        const u = world.units.get(id);
        if (!u || !world.alive(u)) continue;
        const dx = u.pos.x - x;
        const dy = u.pos.y - y;
        if (dx * dx + dy * dy <= r2) out.push(u);
      }
      return out;
    },

    spawnedCount: () => spawned,
  };
}
