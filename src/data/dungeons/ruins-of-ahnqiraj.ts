// Ruins of Ahn'Qiraj (map 509) — InstanceDef graph; five of six bosses are ported in
// src/domain/scriptdev/ruinsOfAhnqiraj.ts. Rajaxx's seven army waves are sourced and shipped.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

const ENTRY = {
  kurinnaxx: 15348,
  rajaxx: 15341,
  moam: 15340,
  buru: 15370,
  ayamiss: 15369,
  ossirian: 15339,
} as const;

/** Bosses + the seven wave officers (they arrive with Rajaxx, not as wandering trash). */
export const AQ20_STRIP = new Set<number>([
  ...Object.values(ENTRY),
  15391, 15392, 15389, 15390, 15386, 15388, 15385,
]);

function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(509, entry);
  if (!p) throw new Error(`ruins-of-ahnqiraj: missing survey boss pos for entry ${entry}`);
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

const boss = (id: string, name: string, creatureEntry: number, intro: string): EncounterDef =>
  ({ id, name, kind: 'boss', creatureEntry, intro });

const ARMY = {
  qeez: 15391, tuubid: 15392, drenn: 15389, xurrem: 15390,
  yeggeth: 15386, pakkon: 15388, zerran: 15385,
  warrior: 15387, needler: 15344,
} as const;

/** ruins_of_ahnqiraj.cpp:302-374 DoSendNextArmyWave; :310/:370 3*MINUTE. */
export const RAJAXX_ARMY = {
  encId: 'general-rajaxx',
  entry: ENTRY.rajaxx,
  /** 7 captains (h:38 MAX_ARMY_WAVES) + Rajaxx (cpp:333-341). */
  waveCount: 8,
  waveGapMs: 3 * 60 * 1000,
  /** QEEZ pack 131-148 yd from instance Rajaxx guid 5090159. */
  claimMaxYd: 200,
} as const;

// Rajaxx's seven army waves in the C++'s own order, one every 3 minutes. Membership resolved from
// classic-db 509_ruins_of_ahnqiraj.sql — 50 guids, 0 unresolved. Wave 8 is Rajaxx himself.
const RAJAXX_ARMY_WAVES: EncounterEvent = {
  kind: 'waves',
  waves: [
    { pack: [{ creatureEntry: ARMY.qeez, count: 1 }, { creatureEntry: ARMY.warrior, count: 3 }, { creatureEntry: ARMY.needler, count: 2 }] },
    { pack: [{ creatureEntry: ARMY.tuubid, count: 1 }, { creatureEntry: ARMY.warrior, count: 3 }, { creatureEntry: ARMY.needler, count: 3 }] },
    { pack: [{ creatureEntry: ARMY.drenn, count: 1 }, { creatureEntry: ARMY.needler, count: 5 }, { creatureEntry: ARMY.warrior, count: 1 }] },
    { pack: [{ creatureEntry: ARMY.xurrem, count: 1 }, { creatureEntry: ARMY.warrior, count: 3 }, { creatureEntry: ARMY.needler, count: 3 }] },
    { pack: [{ creatureEntry: ARMY.yeggeth, count: 1 }, { creatureEntry: ARMY.needler, count: 4 }, { creatureEntry: ARMY.warrior, count: 2 }] },
    { pack: [{ creatureEntry: ARMY.pakkon, count: 1 }, { creatureEntry: ARMY.warrior, count: 4 }, { creatureEntry: ARMY.needler, count: 2 }] },
    { pack: [{ creatureEntry: ARMY.zerran, count: 1 }, { creatureEntry: ARMY.warrior, count: 3 }, { creatureEntry: ARMY.needler, count: 3 }] },
    { pack: [{ creatureEntry: ENTRY.rajaxx, count: 1 }] },
  ],
};

function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('ruins-of-ahnqiraj');
  if (!entrance) throw new Error('ruins-of-ahnqiraj: missing areatrigger entrance');
  const trash = trashFromClusters({ mapId: 509, stripEntries: AQ20_STRIP, entrance });
  return interleaveTrashAndBosses(
    trash,
    [
      { encounter: boss('kurinnaxx', 'Kurinnaxx', ENTRY.kurinnaxx, 'The first sand reaver, in the outer ring.'), pos: bossPos(ENTRY.kurinnaxx) },
      {
        encounter: {
          ...boss('general-rajaxx', 'General Rajaxx', ENTRY.rajaxx,
            'Seven army waves, one every three minutes, then the general himself.'),
          events: [RAJAXX_ARMY_WAVES],
        },
        pos: bossPos(ENTRY.rajaxx),
      },
      { encounter: boss('moam', 'Moam', ENTRY.moam, 'Moam drains mana and turns to stone when full.'), pos: bossPos(ENTRY.moam) },
      { encounter: boss('buru', 'Buru the Gorger', ENTRY.buru, 'Buru chases one player at a time through the egg chamber.'), pos: bossPos(ENTRY.buru) },
      { encounter: boss('ayamiss', 'Ayamiss the Hunter', ENTRY.ayamiss, 'Ayamiss hovers above the hive and paralyses from the air.'), pos: bossPos(ENTRY.ayamiss) },
      {
        encounter: {
          ...boss('ossirian', 'Ossirian the Unscarred', ENTRY.ossirian,
            'Crystals around the ruin strip his shield one at a time.'),
          events: [{
            kind: 'objectGate',
            goEntry: 180619,
            once: false,
            setsFlag: 'aq20-ossirian-crystal',
          }],
        },
        pos: bossPos(ENTRY.ossirian),
      },
    ],
    entrance,
  );
}

export const RUINS_OF_AHNQIRAJ: InstanceDef = {
  id: 'ruins-of-ahnqiraj',
  mapId: 509,
  name: "Ruins of Ahn'Qiraj",
  portalZone: 'silithus',
  // areatrigger_teleport 4008: level 50 only. The scarab-gate world event is out of scope
  // (docs/archive/raids/PLAN.md §1) — the source gate is a level check and nothing else.
  entranceTriggerId: 4008,
  minLevel: 50,
  // instance_template 509 maxPlayers = 20, reset_delay = 3 days. Cite: mangos.sql:2545-2577.
  maxPlayers: 20,
  levelRange: [58, 63],
  lockoutMs: 3 * 24 * 60 * 60 * 1000,
  description: '',
  encounters: buildEncounters(),
};
