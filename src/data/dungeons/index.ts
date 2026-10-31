// Dungeon InstanceDef registry (D-1 / DUNGEONS-FLEET-PLAN).
// Per-dungeon modules under this folder; merged at boot via withDungeons().

import type { InstanceDef } from '../schema.ts';
import { withInstanceGeometry } from './apply-instance-geometry.ts';
import { withSpawnPlacement } from './apply-spawn-placement.ts';
import { withDungeonRooms } from './apply-dungeon-rooms.ts';
import { withEncounterOutdoors } from './apply-encounter-outdoors.ts';
import { DEADMINES } from './deadmines.ts';
import { RAGEFIRE_CHASM } from './ragefire-chasm.ts';
import { WAILING_CAVERNS } from './wailing-caverns.ts';
import { SHADOWFANG_KEEP } from './shadowfang-keep.ts';
import { THE_STOCKADE } from './the-stockade.ts';
import { BLACKFATHOM_DEEPS } from './blackfathom-deeps.ts';
// Wave 2
import { GNOMEREGAN } from './gnomeregan.ts';
import { RAZORFEN_KRAUL } from './razorfen-kraul.ts';
import { SM_GRAVEYARD } from './sm-graveyard.ts';
import { SM_LIBRARY } from './sm-library.ts';
import { SM_ARMORY } from './sm-armory.ts';
import { SM_CATHEDRAL } from './sm-cathedral.ts';
import { RAZORFEN_DOWNS } from './razorfen-downs.ts';
// Wave 3
import { ULDAMAN } from './uldaman.ts';
import { ZUL_FARRAK } from './zul-farrak.ts';
import { MARAUDON } from './maraudon.ts';
// Wave 4
import { SUNKEN_TEMPLE } from './sunken-temple.ts';
import { BLACKROCK_DEPTHS } from './blackrock-depths.ts';
import { LBRS } from './lbrs.ts';
import { UBRS } from './ubrs.ts';
import { DIRE_MAUL_EAST } from './dire-maul-east.ts';
import { DIRE_MAUL_WEST } from './dire-maul-west.ts';
import { DIRE_MAUL_NORTH } from './dire-maul-north.ts';
import { SCHOLOMANCE } from './scholomance.ts';
import { STRATHOLME_LIVE } from './stratholme-live.ts';
import { STRATHOLME_UNDEAD } from './stratholme-undead.ts';
// Raids (docs/archive/raids/PLAN.md §9) — one per wave, shipped complete before the next starts.
import { ONYXIAS_LAIR } from './onyxias-lair.ts';
import { MOLTEN_CORE } from './molten-core.ts';
import { ZUL_GURUB } from './zul-gurub.ts';
import { BLACKWING_LAIR } from './blackwing-lair.ts';
import { RUINS_OF_AHNQIRAJ } from './ruins-of-ahnqiraj.ts';
import { TEMPLE_OF_AHNQIRAJ } from './temple-of-ahnqiraj.ts';
import { NAXXRAMAS } from './naxxramas.ts';
// Alterac Valley, one def per faction on map 30. It is a battleground, so it is NOT in the
// five-man/raid censuses; it is here because the valley now has a spawn and gameobject bake and
// therefore runs on the same floor a raid does. See alterac-valley.ts for what it is and is not.
import { ALTERAC_VALLEY_ALLIANCE, ALTERAC_VALLEY_HORDE } from './alterac-valley.ts';

// Raw InstanceDefs before W5 geometry merge. Kept for tests that assert module- local construction;
// production consumers use DUNGEON_INSTANCES.
const RAW_DUNGEON_INSTANCES: InstanceDef[] = [
  RAGEFIRE_CHASM,
  WAILING_CAVERNS,
  DEADMINES,
  SHADOWFANG_KEEP,
  THE_STOCKADE,
  BLACKFATHOM_DEEPS,
  GNOMEREGAN,
  RAZORFEN_KRAUL,
  SM_GRAVEYARD,
  SM_LIBRARY,
  SM_ARMORY,
  SM_CATHEDRAL,
  RAZORFEN_DOWNS,
  ULDAMAN,
  ZUL_FARRAK,
  MARAUDON,
  SUNKEN_TEMPLE,
  BLACKROCK_DEPTHS,
  LBRS,
  UBRS,
  DIRE_MAUL_EAST,
  DIRE_MAUL_WEST,
  DIRE_MAUL_NORTH,
  SCHOLOMANCE,
  STRATHOLME_LIVE,
  STRATHOLME_UNDEAD,
  ONYXIAS_LAIR,
  MOLTEN_CORE,
  ZUL_GURUB,
  BLACKWING_LAIR,
  RUINS_OF_AHNQIRAJ,
  TEMPLE_OF_AHNQIRAJ,
  NAXXRAMAS,
  ALTERAC_VALLEY_ALLIANCE,
  ALTERAC_VALLEY_HORDE,
];

// All registered instance graphs. Origin and path come from instance-geometry.json, boss spawnGuids
// from the cluster packs, rooms from dungeon-rooms.json and outdoors from encounter-outdoors.json.
export const DUNGEON_INSTANCES: InstanceDef[] = RAW_DUNGEON_INSTANCES
  .map(withInstanceGeometry)
  .map(withSpawnPlacement)
  .map(withDungeonRooms)
  .map(withEncounterOutdoors);

export {
  DEADMINES,
  RAGEFIRE_CHASM,
  WAILING_CAVERNS,
  SHADOWFANG_KEEP,
  THE_STOCKADE,
  BLACKFATHOM_DEEPS,
  GNOMEREGAN,
  RAZORFEN_KRAUL,
  SM_GRAVEYARD,
  SM_LIBRARY,
  SM_ARMORY,
  SM_CATHEDRAL,
  RAZORFEN_DOWNS,
  ULDAMAN,
  ZUL_FARRAK,
  MARAUDON,
  SUNKEN_TEMPLE,
  BLACKROCK_DEPTHS,
  LBRS,
  UBRS,
  DIRE_MAUL_EAST,
  DIRE_MAUL_WEST,
  DIRE_MAUL_NORTH,
  SCHOLOMANCE,
  STRATHOLME_LIVE,
  STRATHOLME_UNDEAD,
};
