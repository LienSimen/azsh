/**
 * Alterac Valley (map 30) as an InstanceDef, so it runs on the SAME surface a raid does.
 *
 * WHY THIS EXISTS. AV shipped as its own screen (`src/ui/bg/bgScreen.ts`) that mounts `combatView`
 * directly and reimplements a cockpit around a second world sim. It therefore has none of what
 * `liveDungeonController` carries — the profiler / damage / healing / DPS / loot / quest / boss
 * tabs, the object-loot surface, the camera, the aggro stream that engages a mob before you click
 * it. Those were never removed from AV; AV was never on the surface that has them.
 *
 * Map 30 could not be an instance until 2026-09-01, because `dungeonSpawns.json` and
 * `dungeonGameObjects.json` had no rows for it at all — bake stages 5 and 5b had never run for a
 * battleground (scripts/dbake/stage-audit.mjs --map 30). They do now: 1,176 creature spawns and
 * 419 gameobjects, so `createContinuousWorld` has a real floor to stream.
 *
 * TWO DEFS, ONE MAP. AV is symmetric, and a route that walks an Alliance player to Vanndar is
 * wrong. `wing` is the field the schema already provides for several instances on one map (SM,
 * BRS, Dire Maul, Stratholme), so each side gets its own def whose encounters are the OTHER
 * faction's named commanders. Map 30 has no room plan, so `spawnsForInstanceWing` falls through
 * to the whole valley for both — which is correct here, unlike a wing of Stratholme.
 *
 * NOTHING BELOW IS HAND-PLACED (CLAUDE.md §6). Every position, entry and level is read out of
 * `AV_DATA`, which core.battlegroundAv bakes from the world DB, and each lieutenant is attributed
 * to a faction by the OWNER of the node it garrisons rather than by its name or its coordinates.
 *
 * WHAT THIS DEF IS NOT. It is the valley as a raid: the floor, the commanders and the objects.
 * Reinforcement scoring, node capture and the graveyard cycle live in `src/domain/bg/` and still
 * run only on the battleground screen. Cite: BattleGroundAV.cpp:57 (killing the general ends it),
 * :360-419 EndBattleGround.
 */

import type { EncounterDef, InstanceDef } from '../schema.ts';
import { AV_DATA, AV_QUESTS, avNode, type AvTeam } from '../alteracValley.ts';

const OTHER: Record<AvTeam, AvTeam> = { alliance: 'horde', horde: 'alliance' };

/** Slug for a commander, stable across bakes: the creature entry, which is the DB's own key. */
function encId(prefix: string, entry: number): string {
  return `${prefix}-${entry}`;
}

/**
 * The named commanders of `foe`, in the order a push meets them: the captain who holds the middle,
 * then the four tower garrisons, then the general in the keep.
 * Cite: BattleGroundAV.h:207-226 AVNodeIds; BattleGroundAV.cpp:520 a destroyed tower despawns its
 * marshal, which is why the lieutenants sit between the captain and the general.
 */
function commandersOf(team: AvTeam, foe: AvTeam): EncounterDef[] {
  const c = AV_DATA.commanders;
  const from = AV_DATA.start[team] ?? { x: 0, y: 0 };
  const out: EncounterDef[] = [];

  const captain = c.captain[foe];
  if (captain) {
    out.push({
      id: encId('captain', captain.entry),
      name: captain.name,
      kind: 'boss',
      creatureEntry: captain.entry,
      origin: { x: captain.x, y: captain.y, z: captain.z },
    });
  }

  // A lieutenant belongs to whoever OWNS the point it garrisons — the node row carries that, so
  // neither the name ("Marshal" / "Warmaster") nor a coordinate guess decides it.
  //
  // The pin sits on the NODE, not on `commanders.lieutenants[].x/y/z`. Those are keep spawn rows:
  // all four Alliance marshals read 716-723,-5..-20, on top of Vanndar, because the tower garrison
  // is placed by its event slot. The node row is where the tower it defends actually stands, and it
  // is the same bake. Cite: BattleGroundAV.h:207-226 avNodeDefaults.
  const garrison = c.lieutenants
    .map((l) => ({ l, node: l.node ? avNode(l.node) : undefined }))
    .filter((r) => r.l.entry != null && r.node != null && r.node.owner === foe)
    // Nearest the attacker's own gate first, so the boss list reads as the march it is.
    .sort((a, b) => Math.hypot(a.node!.x - from.x, a.node!.y - from.y)
      - Math.hypot(b.node!.x - from.x, b.node!.y - from.y));
  for (const { l, node } of garrison) {
    out.push({
      id: encId('lieutenant', l.entry!),
      name: l.name ?? node!.name,
      kind: 'boss',
      creatureEntry: l.entry!,
      origin: { x: node!.x, y: node!.y, z: node!.z },
    });
  }

  const boss = c.boss[foe];
  if (boss) {
    out.push({
      id: encId('general', boss.entry),
      name: boss.name,
      kind: 'boss',
      creatureEntry: boss.entry,
      origin: { x: boss.x, y: boss.y, z: boss.z },
    });
  }
  return out;
}

function avSide(team: AvTeam): InstanceDef {
  const foe = OTHER[team];
  return {
    id: `alterac-valley-${team}`,
    mapId: AV_DATA.map,
    wing: team,
    name: `Alterac Valley (${team === 'alliance' ? 'Stormpike' : 'Frostwolf'})`,
    // The valley opens off Alterac Mountains — a real zone row, not an invented one.
    portalZone: 'alterac',
    minLevel: AV_DATA.minLevel,
    maxPlayers: AV_DATA.teamSize,
    levelRange: [AV_DATA.minLevel, AV_DATA.maxLevel],
    // A battleground has no saved instance. Cite: BattleGround has no InstanceSave.
    lockoutMs: 0,
    // Your own gate. Cite: BattleGroundAV start positions, baked to AV_DATA.start.
    partyStart: AV_DATA.start[team] ?? { x: 0, y: 0 },
    // Your side's 11 turn-ins — scraps and booty, the two mine supply runs, the three air
    // strikes, the ice lord, the harnesses and the stables. Cite: BattleGroundAV.cpp:161-256
    // m_teamQuestStatus, baked to AV_DATA.quests with the slot each one increments.
    quests: AV_QUESTS.filter((q) => q.team === team).map((q) => q.id),
    encounters: commandersOf(team, foe),
  };
}

export const ALTERAC_VALLEY_ALLIANCE: InstanceDef = avSide('alliance');
export const ALTERAC_VALLEY_HORDE: InstanceDef = avSide('horde');

/** Where a side's raid walks in — its own gate, as BattleGroundAV seats it. */
export const AV_INSTANCE_START: Readonly<Record<AvTeam, { x: number; y: number; z?: number }>> = {
  alliance: AV_DATA.start.alliance ?? { x: 0, y: 0 },
  horde: AV_DATA.start.horde ?? { x: 0, y: 0 },
};

/** instance id for a faction, so a caller never rebuilds the slug. */
export function avInstanceIdFor(team: AvTeam): string {
  return `alterac-valley-${team}`;
}
