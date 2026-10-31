// Zul'Gurub (map 309) — InstanceDef graph. All eight kits come from the bake via creature_spell_list;
// Venoxis, Jeklik and Arlokk also have IRs, which own their schedule and suppress the list merge.

import type { EncounterDef, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

const ENTRY = {
  venoxis: 14507,
  jeklik: 14517,
  marli: 14510,
  mandokir: 11382,
  thekal: 14509,
  arlokk: 14515,
  jindo: 11380,
  hakkar: 14834,
} as const;

// Arlokk has no `creature` spawn row — the Gong of Bethekk summons her, and these are the summon
// coordinates: gameobject_template 180526 data2 = event 9066, dbscripts_on_event 9066 TEMP_SUMMON.
const ARLOKK_SUMMON_POS = { x: -11540.7, y: -1627.71, z: 41.27 };

// Jeklik fights from a LEDGE the navmesh does not connect, so CMaNGOS flies her off it on aggro.
// This is the cave floor the party stands on to pull her: 6.05 yd from her spawn in plan.
const JEKLIK_APPROACH_POS = { x: -12287.29, y: -1384.0, z: 133.84 };

// ...and this is where her BODY stands. Left on the ledge she was visible-only, 11 yd straight up
// with no path. 3.48 yd from the point the C++ flies her to. Cite: boss_jeklik.cpp:124-127.
const JEKLIK_GROUND_POS = { x: -12284.85, y: -1394.03, z: 131.58 };

/** Her `creature` row (dungeonSpawns map 309) and the floor pose the encounter uses. */
export const ZG_JEKLIK_GROUND = {
  bossEntry: ENTRY.jeklik,
  spawnGuid: 3090595,
  pos: JEKLIK_GROUND_POS,
} as const;

// Mandokir is NOT summoned by a kill — he stands on his balcony and RUNS DOWN when the Vilebranch
// Speaker 11391 dies, via ACID row 1139104 SET_INST_DATA. Cite: zulgurub.cpp:139-147.
export const ZG_MANDOKIR_DOWNSTAIRS = {
  /** zulgurub.h:17 TYPE_OHGAN. */
  field: 5,
  /** sc_instance.h SPECIAL. */
  special: 4,
  bossEntry: 11382,
  /** dungeonSpawns map 309 - his one `creature` row. */
  spawnGuid: 3090529,
  speakerEntry: 11391,
  /** zulgurub.h:45 aMandokirDownstairsPos. */
  pos: { x: -12196.3, y: -1948.37, z: 130.31 },
} as const;

/** True once the Speaker's death has written TYPE_OHGAN = SPECIAL on this run. */
export function mandokirCalledDownstairs(
  scriptInstanceData: Readonly<Record<number, number>> | undefined,
): boolean {
  return (scriptInstanceData?.[ZG_MANDOKIR_DOWNSTAIRS.field] ?? 0) === ZG_MANDOKIR_DOWNSTAIRS.special;
}

export const ZUL_GURUB_STRIP = new Set<number>(Object.values(ENTRY));

function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(309, entry);
  if (!p) throw new Error(`zul-gurub: missing survey boss pos for entry ${entry}`);
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

function boss(id: string, name: string, creatureEntry: number, intro: string): EncounterDef {
  return { id, name, kind: 'boss', creatureEntry, intro };
}

function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('zul-gurub');
  if (!entrance) throw new Error('zul-gurub: missing areatrigger entrance');
  const trash = trashFromClusters({ mapId: 309, stripEntries: ZUL_GURUB_STRIP, entrance });
  return interleaveTrashAndBosses(
    trash,
    [
      {
        encounter: boss('high-priestess-jeklik', 'High Priestess Jeklik', ENTRY.jeklik,
          'The bat priestess fights from the air until half health, then lands.'),
        pos: JEKLIK_APPROACH_POS,
      },
      {
        encounter: boss('high-priest-venoxis', 'High Priest Venoxis', ENTRY.venoxis,
          'A troll priest until 50 %, then a serpent that trades healing for poison.'),
        pos: bossPos(ENTRY.venoxis),
      },
      {
        encounter: boss('high-priestess-marli', "High Priestess Mar'li", ENTRY.marli,
          'Spider eggs hatch across the platform while she casts.'),
        pos: bossPos(ENTRY.marli),
      },
      {
        encounter: boss('bloodlord-mandokir', 'Bloodlord Mandokir', ENTRY.mandokir,
          'Mandokir and his raptor Ohgan - he watches one player and punishes them.'),
        pos: bossPos(ENTRY.mandokir),
      },
      {
        encounter: boss('high-priest-thekal', 'High Priest Thekal', ENTRY.thekal,
          "Thekal fights with Zealots Lor'Khan and Zath; all three must fall together."),
        pos: bossPos(ENTRY.thekal),
      },
      {
        encounter: boss('high-priestess-arlokk', "High Priestess Arlokk", ENTRY.arlokk,
          'She toggles between troll and panther on a clock while her prowlers stalk the pit.'),
        pos: ARLOKK_SUMMON_POS,
      },
      {
        encounter: boss('jindo-the-hexxer', "Jin'do the Hexxer", ENTRY.jindo,
          'Jin\'do hexes and shackles; his brittle skeletons keep the raid busy.'),
        pos: bossPos(ENTRY.jindo),
      },
      {
        encounter: boss('hakkar', 'Hakkar', ENTRY.hakkar,
          'The Soulflayer. Every high priest left alive feeds him.'),
        pos: bossPos(ENTRY.hakkar),
      },
    ],
    entrance,
  );
}

export const ZUL_GURUB: InstanceDef = {
  id: 'zul-gurub',
  mapId: 309,
  name: "Zul'Gurub",
  portalZone: 'stranglethorn',
  // areatrigger_teleport 3928: level 50, no quest or item — ZG has no attunement.
  entranceTriggerId: 3928,
  minLevel: 50,
  // instance_template 309 maxPlayers = 20, reset_delay = 3 days. Cite: mangos.sql:2545-2577.
  maxPlayers: 20,
  levelRange: [58, 63],
  lockoutMs: 3 * 24 * 60 * 60 * 1000,
  description: '',
  encounters: buildEncounters(),
};
