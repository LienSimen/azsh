// Onyxia's Lair (map 249) — InstanceDef graph, six spawns in all. The fight itself is
// src/domain/scriptdev/onyxiasLair.ts as a ScriptDev IR, with its GAPS named in that header.

import type { EncounterDef, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

const ENTRY = {
  onyxia: 10184,
  onyxianWarder: 12129,
  /** Distance anchor for boss_onyxia's CHECK_IN_LAIR; never a combatant. */
  onyxiaTrigger: 12758,
} as const;

/** Stripped from cluster trash. */
export const ONYXIA_STRIP = new Set<number>([ENTRY.onyxia, ENTRY.onyxiaTrigger]);

function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(249, entry);
  if (!p) throw new Error(`onyxias-lair: missing survey boss pos for entry ${entry}`);
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('onyxias-lair');
  if (!entrance) throw new Error('onyxias-lair: missing areatrigger entrance');
  const trash = trashFromClusters({
    mapId: 249,
    stripEntries: ONYXIA_STRIP,
    entrance,
  });
  return interleaveTrashAndBosses(
    trash,
    [
      {
        encounter: {
          id: 'onyxia',
          name: 'Onyxia',
          kind: 'boss',
          creatureEntry: ENTRY.onyxia,
          intro:
            'Onyxia sleeps coiled at the bottom of the lair. She fights on the ground, '
            + 'takes to the air at 65 %, and lands again at 40 %.',
        },
        pos: bossPos(ENTRY.onyxia),
      },
    ],
    entrance,
  );
}

export const ONYXIAS_LAIR: InstanceDef = {
  id: 'onyxias-lair',
  mapId: 249,
  name: "Onyxia's Lair",
  portalZone: 'thousandneedles',
  // areatrigger_teleport 2848: level 50 + item 16309 (Drakefire Amulet), raid group.
  entranceTriggerId: 2848,
  minLevel: 50,
  // instance_template 249 maxPlayers = 40. Cite: mangos.sql:2545-2577.
  maxPlayers: 40,
  levelRange: [60, 63],
  // instance_template 249 reset_delay = 5 days. Cite: mangos.sql:2545-2577.
  lockoutMs: 5 * 24 * 60 * 60 * 1000,
  description: '',
  encounters: buildEncounters(),
};
