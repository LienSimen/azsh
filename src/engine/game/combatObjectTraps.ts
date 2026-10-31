// Resolve `dbscripts_on_go_template_use` command 13 into the trap a click actually fires. It runs on
// the GAME side because the payload is in no creature kit, so the engine's trap arm cannot see it.

import { dungeonGameObjectsForMap } from '../../data/dungeonGameObjects.ts';
import type { GameObjectDef, SpellDef } from '../../data/schema.ts';
import type { CombatObjectTrap, SpellTrapSite } from '../combat/types.ts';
import { scriptTargetRowsFor, SPELL_TARGET_TYPE_GAMEOBJECT } from '../spells/scriptTargets.ts';
import { resolveCombatSpell } from '../spells/interpreter/item-triggers.ts';
import { detHypot } from '../core/detMath.ts';

/** ScriptMgr.h SCRIPT_COMMAND_ACTIVATE_OBJECT. */
const SCRIPT_COMMAND_ACTIVATE_OBJECT = 13;
/** GameObject.cpp:1532 re-arm default when `trap.cooldown` is 0. */
const DEFAULT_TRAP_REARM_MS = 4000;
/** GameObject.h GAMEOBJECT_TYPE_TRAP. */
const GAMEOBJECT_TYPE_TRAP = 6;

interface GoUseRow {
  command?: number;
  buddyEntry?: number;
  searchRadius?: number;
}

export interface CombatObjectTrapDeps {
  mapId: number;
  /** The clickable entries the encounter hands the engine (`combatObjectsFromBake`). */
  goEntries: readonly number[];
  /** World origin of a `world-translated` session, so the trap lands in combat yards. */
  anchorOrigin?: { x: number; y: number } | undefined;
  goUseScripts: (goEntry: number) => readonly GoUseRow[];
  gameObject: (entry: number) => GameObjectDef | undefined;
  spell: (id: number) => SpellDef | undefined;
}

/** Nearest spawn of `entry` to `from`, inside `radiusYd`. Cite: GetClosestGameObjectWithEntry. */
function nearestSpawn(
  mapId: number,
  entry: number,
  from: { x: number; y: number } | undefined,
  radiusYd: number,
): { x: number; y: number; z: number } | undefined {
  let best: { x: number; y: number; z: number } | undefined;
  let bestD = Infinity;
  for (const o of dungeonGameObjectsForMap(mapId)) {
    if ((o.entry | 0) !== (entry | 0)) continue;
    if (!from) return { x: o.x, y: o.y, z: o.z };
    const d = detHypot(o.x - from.x, o.y - from.y);
    if (d > radiusYd || d >= bestD) continue;
    bestD = d;
    best = { x: o.x, y: o.y, z: o.z };
  }
  return best;
}

/** First spawn of `entry` on the map, which is where the clicker stands to use it. */
function anySpawn(mapId: number, entry: number): { x: number; y: number } | undefined {
  for (const o of dungeonGameObjectsForMap(mapId)) {
    if ((o.entry | 0) === (entry | 0)) return { x: o.x, y: o.y };
  }
  return undefined;
}

export function combatObjectTrapsFromBake(deps: CombatObjectTrapDeps): CombatObjectTrap[] {
  const out: CombatObjectTrap[] = [];
  const seen = new Set<number>();
  for (const raw of deps.goEntries) {
    const goEntry = raw | 0;
    if (seen.has(goEntry)) continue;
    seen.add(goEntry);
    for (const row of deps.goUseScripts(goEntry)) {
      if (((row.command ?? 0) | 0) !== SCRIPT_COMMAND_ACTIVATE_OBJECT) continue;
      const buddyEntry = row.buddyEntry != null ? row.buddyEntry | 0 : 0;
      if (buddyEntry <= 0) continue;
      const buddy = deps.gameObject(buddyEntry);
      const payloadId = buddy?.trap?.spellId != null ? buddy.trap.spellId | 0 : 0;
      // Only a trap has a payload. A door or a button activated by the same command carries
      // none, and this is not the place to invent one.
      if (!buddy || (buddy.type | 0) !== GAMEOBJECT_TYPE_TRAP || payloadId <= 0) continue;
      const bake = deps.spell(payloadId);
      if (!bake) continue;
      const cooldownSecs = buddy.trap?.cooldown != null ? buddy.trap.cooldown | 0 : 0;
      const cooldownMs = cooldownSecs > 0 ? cooldownSecs * 1000 : DEFAULT_TRAP_REARM_MS;
      // How long the activated trap stays live: the CLICKED object's own close time when it has
      // one (Scarlet Cannon goober.autoCloseSecs 1), else one re-arm window. One shot per click.
      const closeSecs = deps.gameObject(goEntry)?.goober?.autoCloseSecs ?? 0;
      const durationMs = closeSecs > 0 ? closeSecs * 1000 : cooldownMs;
      const at = nearestSpawn(
        deps.mapId,
        buddyEntry,
        anySpawn(deps.mapId, goEntry),
        row.searchRadius != null && row.searchRadius > 0 ? row.searchRadius : 50,
      );
      const o = deps.anchorOrigin;
      out.push({
        goEntry,
        buddyEntry,
        spell: resolveCombatSpell(bake, {}),
        cooldownMs,
        durationMs,
        ...(at
          ? {
            origin: o
              ? { x: at.x - o.x, y: at.y - o.y, z: at.z }
              : { x: at.x, y: at.y, z: at.z },
          }
          : {}),
      });
    }
  }
  return out;
}

export interface SpellTrapSiteDeps {
  mapId: number;
  /** Spell ids to resolve - the encounter's kits. */
  spellIds: readonly number[];
  anchorOrigin?: { x: number; y: number } | undefined;
  gameObject: (entry: number) => GameObjectDef | undefined;
  spell: (id: number) => SpellDef | undefined;
}

// Every trap gameobject the encounter's ACTIVATE_OBJECT spells can light, with its own spawn. A named
// object that is not a type-6 trap carries no payload and is skipped — a door is not a hazard.
export function spellTrapSitesFromBake(deps: SpellTrapSiteDeps): SpellTrapSite[] {
  const out: SpellTrapSite[] = [];
  const seen = new Set<number>();
  const payloads = new Map<number, SpellDef>();
  for (const raw of deps.spellIds) {
    const spellId = raw | 0;
    if (seen.has(spellId)) continue;
    seen.add(spellId);
    for (const row of scriptTargetRowsFor(spellId)) {
      if ((row.t | 0) !== SPELL_TARGET_TYPE_GAMEOBJECT) continue;
      const goEntry = row.e | 0;
      const go = deps.gameObject(goEntry);
      const payloadId = go?.trap?.spellId != null ? go.trap.spellId | 0 : 0;
      if (!go || (go.type | 0) !== GAMEOBJECT_TYPE_TRAP || payloadId <= 0) continue;
      let payload = payloads.get(payloadId);
      if (payload === undefined) {
        const bake = deps.spell(payloadId);
        if (!bake) continue;
        payload = resolveCombatSpell(bake, {});
        payloads.set(payloadId, payload);
      }
      // Every spawn of the entry: the fissure list is 1:1 with floor tiles, but four entries
      // carry two spawns each and both tiles erupt.
      for (const at of dungeonGameObjectsForMap(deps.mapId)) {
        if ((at.entry | 0) !== goEntry) continue;
        const cooldownSecs = go.trap?.cooldown != null ? go.trap.cooldown | 0 : 0;
        const cooldownMs = cooldownSecs > 0 ? cooldownSecs * 1000 : DEFAULT_TRAP_REARM_MS;
        const o = deps.anchorOrigin;
        out.push({
          spellId,
          goEntry,
          inverseEffectMask: row.m != null ? row.m | 0 : 0,
          spell: payload,
          cooldownMs,
          durationMs: cooldownMs,
          origin: o
            ? { x: at.x - o.x, y: at.y - o.y, z: at.z }
            : { x: at.x, y: at.y, z: at.z },
        });
      }
    }
  }
  return out;
}
