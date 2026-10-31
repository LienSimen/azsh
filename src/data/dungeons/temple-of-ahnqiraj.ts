// Temple of Ahn'Qiraj (map 531) — InstanceDef graph, nine encounters. The Bug Trio is ONE encounter
// across three creatures and the Twin Emperors one across two. No baked kit on any of the nine.

import type { EncounterDef, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

const ENTRY = {
  skeram: 15263,
  kri: 15511,
  yauj: 15543,
  vem: 15544,
  sartura: 15516,
  fankriss: 15510,
  viscidus: 15299,
  huhuran: 15509,
  vekniLash: 15275,
  vekLor: 15276,
  ouro: 15517,
  cthun: 15727,
  // Phase actors / escorts — stripped from trash, never encounters.
  eyeOfCthun: 15589,
  mastersEye: 15963,
  merithra: 15378,
  caelestrasz: 15379,
  arygos: 15380,
} as const;

export const AQ40_STRIP = new Set<number>(Object.values(ENTRY));

function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(531, entry);
  if (!p) throw new Error(`temple-of-ahnqiraj: missing survey boss pos for entry ${entry}`);
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

// Ouro has no static creature row — the spawner 15957 summons him at its own position on aggro, so
// the spawner's census pos is the pin. Cite: boss_ouro.cpp:334 SummonCreature.
const OURO_POS = { x: -9174, y: 2104, z: -65 } as const;

/** Bug Family pack mates (primary remains Lord Kri). Cite: temple_of_ahnqiraj.h:24-26. */
const BUG_TRIO_PACK = [
  { creatureEntry: ENTRY.yauj, count: 1 },
  { creatureEntry: ENTRY.vem, count: 1 },
] as const;

/** Twin Emperors pack mate (primary remains Vek'nilash). Cite: temple_of_ahnqiraj.h:28-29. */
const TWIN_EMPERORS_PACK = [
  { creatureEntry: ENTRY.vekLor, count: 1 },
] as const;

const boss = (id: string, name: string, creatureEntry: number, intro: string): EncounterDef =>
  ({ id, name, kind: 'boss', creatureEntry, intro });

function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('temple-of-ahnqiraj');
  if (!entrance) throw new Error('temple-of-ahnqiraj: missing areatrigger entrance');
  const trash = trashFromClusters({ mapId: 531, stripEntries: AQ40_STRIP, entrance });
  // Encounter order: temple_of_ahnqiraj.h:12-20 (TYPE_SKERAM…TYPE_CTHUN; TWINS_INTRO is not a boss).
  return interleaveTrashAndBosses(
    trash,
    [
      { encounter: boss('the-prophet-skeram', 'The Prophet Skeram', ENTRY.skeram, 'Skeram splits into images of himself as his health falls.'), pos: bossPos(ENTRY.skeram) },
      {
        encounter: {
          ...boss('bug-trio', 'The Bug Family', ENTRY.kri, "Lord Kri, Princess Yauj and Vem - one encounter across three bugs."),
          pack: [...BUG_TRIO_PACK],
        },
        pos: bossPos(ENTRY.kri),
      },
      { encounter: boss('battleguard-sartura', 'Battleguard Sartura', ENTRY.sartura, 'Sartura whirlwinds through the raid with her guards.'), pos: bossPos(ENTRY.sartura) },
      { encounter: boss('fankriss', 'Fankriss the Unyielding', ENTRY.fankriss, 'Fankriss teleports players into spawns of worms.'), pos: bossPos(ENTRY.fankriss) },
      {
        encounter: {
          ...boss('viscidus', 'Viscidus', ENTRY.viscidus, 'Frost damage freezes him; melee hits then shatter him.'),
          optional: true,
        },
        pos: bossPos(ENTRY.viscidus),
      },
      { encounter: boss('princess-huhuran', 'Princess Huhuran', ENTRY.huhuran, 'Frenzy at 30 %; her volley hits the fifteen closest.'), pos: bossPos(ENTRY.huhuran) },
      {
        encounter: {
          ...boss('twin-emperors', 'The Twin Emperors', ENTRY.vekniLash, "Vek'nilash and Vek'lor share health and teleport between each other."),
          pack: [...TWIN_EMPERORS_PACK],
        },
        pos: bossPos(ENTRY.vekniLash),
      },
      {
        encounter: {
          ...boss('ouro', 'Ouro', ENTRY.ouro, "The sandworm of Ahn'Qiraj. Optional; the raid can skip him."),
          optional: true,
        },
        pos: OURO_POS,
      },
      { encounter: boss('cthun', "C'Thun", ENTRY.cthun, 'The Old God. The Eye phase precedes the body.'), pos: bossPos(ENTRY.cthun) },
    ],
    entrance,
  );
}

export const TEMPLE_OF_AHNQIRAJ: InstanceDef = {
  id: 'temple-of-ahnqiraj',
  mapId: 531,
  name: "Temple of Ahn'Qiraj",
  portalZone: 'silithus',
  // areatrigger_teleport 4010: level 50 only.
  entranceTriggerId: 4010,
  minLevel: 50,
  // instance_template 531 maxPlayers = 40, reset_delay = 7 days. Cite: mangos.sql:2545-2577.
  maxPlayers: 40,
  levelRange: [60, 63],
  lockoutMs: 7 * 24 * 60 * 60 * 1000,
  description: '',
  encounters: buildEncounters(),
};
