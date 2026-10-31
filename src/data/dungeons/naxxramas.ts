// Naxxramas (map 533) — InstanceDef graph, fifteen encounters over four wings plus the frostwyrm
// lair. naxxramas.h:53-71 declares MAX_ENCOUNTER 16 but lists fifteen TYPEs; there is no sixteenth.

import type { EncounterDef, InstanceDef, InstanceTeleporterDef } from '../schema.ts';
import areatriggerTeleportsJson from '../tables/areatriggerTeleports.json' with { type: 'json' };
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

/** areatrigger_teleport row — dest coords only; never invent arrivals. */
function atTeleport(id: number): { id: number; targetX: number; targetY: number; targetZ?: number } {
  const row = (areatriggerTeleportsJson as Array<{
    id: number; targetX: number; targetY: number; targetZ?: number;
  }>).find((r) => r.id === id);
  if (!row) throw new Error(`naxxramas: missing areatrigger_teleport ${id}`);
  return row;
}

// Force-cite the two map-533 teleporters at module load (entrance + Frostwyrm).
void atTeleport(4055);
void atTeleport(4156);

// Wing-end return GOs (181575–181578) cast spell 28444 to the hub, and the Frostwyrm pad is AT 4156;
// AT 4055 stays the outdoor entrance. The position below is classic-db spell_target_position 28444.
const SPELL_28444_HUB = { x: 3005.74, y: -3434.27, z: 304.196 };

const NAXX_TELEPORTERS = [
  // GO_ARAC_PORTAL — spider wing far end → hub (spell 28444). Unlock: Maexxna DONE.
  { goEntry: 181575, areatriggerId: 4055, dest: SPELL_28444_HUB, requiresCleared: ['maexxna'] },
  // GO_PLAG_PORTAL — plague wing → hub. Unlock: Loatheb DONE.
  { goEntry: 181577, areatriggerId: 4055, dest: SPELL_28444_HUB, requiresCleared: ['loatheb'] },
  // GO_MILI_PORTAL — military wing → hub. Unlock: Four Horsemen DONE.
  { goEntry: 181578, areatriggerId: 4055, dest: SPELL_28444_HUB, requiresCleared: ['four-horsemen'] },
  // GO_CONS_PORTAL — construct wing → hub. Unlock: Thaddius DONE.
  { goEntry: 181576, areatriggerId: 4055, dest: SPELL_28444_HUB, requiresCleared: ['thaddius'] },
  // AREATRIGGER_FROSTWYRM_TELE 4156 — hub pad → Frostwyrm Lair dest.
  // Src: AreaTrigger.dbc id=4156 map=533 (bake has target only). Dest: AT 4156 row.
  {
    areatriggerId: 4156,
    src: { x: 3006.090087890625, y: -3434.169921875, z: 306.19500732421875 },
    requiresCleared: ['maexxna', 'loatheb', 'four-horsemen', 'thaddius'],
    name: 'Frostwyrm Lair Portal',
  },
] as const satisfies ReadonlyArray<InstanceTeleporterDef & { dest?: { x: number; y: number; z?: number } }>;

const ENTRY = {
  anubrekhan: 15956,
  faerlina: 15953,
  maexxna: 15952,
  noth: 15954,
  heigan: 15936,
  loatheb: 16011,
  razuvious: 16061,
  gothik: 16060,
  mograine: 16062,
  zeliek: 16063,
  korthazz: 16064,
  blaumeux: 16065,
  patchwerk: 16028,
  grobbulus: 15931,
  gluth: 15932,
  thaddius: 15928,
  stalagg: 15929,
  feugen: 15930,
  sapphiron: 15989,
  kelthuzad: 15990,
} as const;

// Sapphiron has no `creature` spawn row — the instance summons her, so the position is the summon
// call's own. Cite: naxxramas.h:243 sapphironPositions[4]; naxxramas.cpp:134, :860.
const SAPPHIRON_SUMMON_POS = { x: 3521.48, y: -5234.87, z: 137.626 };

export const NAXX_STRIP = new Set<number>(Object.values(ENTRY));

/** Set when the Four Horsemen encounter is DONE. Cite: naxxramas.cpp:561-567. */
export const NAXX_FLAGS = {
  fourHorsemenDone: 'naxx-four-horsemen-done',
} as const;

/** Four Horsemen Chest. Cite: naxxramas.h:145 GO_CHEST_HORSEMEN_NORM. */
export const GO_CHEST_HORSEMEN_NORM = 181366;

function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(533, entry);
  if (!p) throw new Error(`naxxramas: missing survey boss pos for entry ${entry}`);
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

const boss = (id: string, name: string, creatureEntry: number, wing: string, intro: string): EncounterDef =>
  ({ id, name, kind: 'boss', creatureEntry, wing, intro: `[${wing}] ${intro}` });

// Faerlina's room adds ARE her fight: a Worshipper's whole kit is 28732 Widow's Embrace, the only
// thing that strips her Enrage. Counts read from the map 533 spawn bake: 4× 16506 + 2× 16505.
const FAERLINA_ADDS = [
  { creatureEntry: 16506, count: 4 },
  { creatureEntry: 16505, count: 2 },
] as const;

// Razuvious's Understudies: only a mind-controlled Understudy can tank him, since its whole kit is
// 29060 Taunt and Unbalancing Strike shreds a real tank. 4× 16803 from the map 533 spawn bake.
const RAZUVIOUS_ADDS = [
  { creatureEntry: 16803, count: 4 },
] as const;

function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('naxxramas');
  if (!entrance) throw new Error('naxxramas: missing areatrigger entrance');
  const trash = trashFromClusters({ mapId: 533, stripEntries: NAXX_STRIP, entrance });
  return interleaveTrashAndBosses(
    trash,
    [
      { encounter: boss('anubrekhan', "Anub'Rekhan", ENTRY.anubrekhan, 'Arachnid', 'Crypt guards and locust swarm open the spider wing.'), pos: bossPos(ENTRY.anubrekhan) },
      {
        encounter: {
          ...boss('grand-widow-faerlina', 'Grand Widow Faerlina', ENTRY.faerlina, 'Arachnid', 'Her worshippers can be sacrificed to break the enrage.'),
          pack: [...FAERLINA_ADDS],
        },
        pos: bossPos(ENTRY.faerlina),
      },
      { encounter: boss('maexxna', 'Maexxna', ENTRY.maexxna, 'Arachnid', 'Web wrap pulls a player to the wall every 40 s.'), pos: bossPos(ENTRY.maexxna) },
      { encounter: boss('noth-the-plaguebringer', 'Noth the Plaguebringer', ENTRY.noth, 'Plague', 'Noth blinks to his balcony and sends skeletons down.'), pos: bossPos(ENTRY.noth) },
      { encounter: boss('heigan-the-unclean', 'Heigan the Unclean', ENTRY.heigan, 'Plague', 'The floor erupts in timed sections - the dance.'), pos: bossPos(ENTRY.heigan) },
      { encounter: boss('loatheb', 'Loatheb', ENTRY.loatheb, 'Plague', 'Healing is locked out except in narrow windows; Doom ramps.'), pos: bossPos(ENTRY.loatheb) },
      {
        encounter: {
          ...boss('instructor-razuvious', 'Instructor Razuvious', ENTRY.razuvious, 'Military', 'Only mind-controlled Death Knight Understudies can tank him.'),
          pack: [...RAZUVIOUS_ADDS],
        },
        pos: bossPos(ENTRY.razuvious),
      },
      { encounter: boss('gothik-the-harvester', 'Gothik the Harvester', ENTRY.gothik, 'Military', 'The raid splits in two rooms until the gate opens.'), pos: bossPos(ENTRY.gothik) },
      {
        encounter: {
          ...boss('four-horsemen', 'The Four Horsemen', ENTRY.mograine, 'Military', 'Four bosses, four corners, stacking marks that force rotation.'),
          events: [{ kind: 'setsFlag', flag: NAXX_FLAGS.fourHorsemenDone }],
        },
        pos: bossPos(ENTRY.mograine),
      },
      { encounter: boss('patchwerk', 'Patchwerk', ENTRY.patchwerk, 'Construct', 'Hateful Strike hits the highest-health player in melee.'), pos: bossPos(ENTRY.patchwerk) },
      { encounter: boss('grobbulus', 'Grobbulus', ENTRY.grobbulus, 'Construct', 'Injections must be walked away from the raid.'), pos: bossPos(ENTRY.grobbulus) },
      { encounter: boss('gluth', 'Gluth', ENTRY.gluth, 'Construct', 'Zombie chow must be kited and killed before he eats them.'), pos: bossPos(ENTRY.gluth) },
      { encounter: boss('thaddius', 'Thaddius', ENTRY.thaddius, 'Construct', 'Stalagg and Feugen must die together; then the charge phase.'), pos: bossPos(ENTRY.thaddius) },
      { encounter: boss('sapphiron', 'Sapphiron', ENTRY.sapphiron, 'Frostwyrm', 'The frost wyrm lifts off and drops ice blocks the raid must hide behind.'), pos: SAPPHIRON_SUMMON_POS },
      { encounter: boss('kelthuzad', "Kel'Thuzad", ENTRY.kelthuzad, 'Frostwyrm', 'The lich himself, after the frostwyrm lair.'), pos: bossPos(ENTRY.kelthuzad) },
    ],
    entrance,
  );
}

export const NAXXRAMAS: InstanceDef = {
  id: 'naxxramas',
  mapId: 533,
  name: 'Naxxramas',
  // AT 4055 is the entrance: AreaTrigger.dbc puts it on map 0 targeting 533. AT 4156 sits INSIDE
  // map 533 and lands in the Frostwyrm Lair, so shipping it as the entrance skipped 13 bosses.
  portalZone: 'easternplaguelands',
  entranceTriggerId: 4055,
  minLevel: 51,
  // instance_template 533 maxPlayers = 40, reset_delay = 7 days. Cite: mangos.sql:2545-2577.
  maxPlayers: 40,
  levelRange: [60, 63],
  lockoutMs: 7 * 24 * 60 * 60 * 1000,
  description: '',
  encounters: buildEncounters(),
  teleporters: NAXX_TELEPORTERS,
  lootObjects: [
    // Guid 5330075; spawnSecs -604800. revealedByFlag hides the bake pin until Horsemen DONE.
    { goEntry: GO_CHEST_HORSEMEN_NORM, revealedByFlag: NAXX_FLAGS.fourHorsemenDone },
  ],
};
