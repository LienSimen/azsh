// The call-time tables, out of the menu-gating bundle (3.9 MB). Every one is read straight off the
// bundle when a getter is called, never derived at construction, so ds.attachWorldTables is a plain
// Object.assign. Adding a table here requires that same property — see WorldTables in schema/bundle.ts.
import type { WorldTables } from './schema.ts';

import areatriggerTeleports from './tables/areatriggerTeleports.json' with { type: 'json' };
import botPopulation from './tables/botPopulation.json' with { type: 'json' };
import conditions from './tables/conditions.json' with { type: 'json' };
import dbScripts from './tables/dbScripts.json' with { type: 'json' };
import entranceYards from './tables/entranceYards.json' with { type: 'json' };
import explorationBasexp from './tables/explorationBasexp.json' with { type: 'json' };
import gameEvents from './tables/gameEvents.json' with { type: 'json' };
import gossipMenus from './tables/gossipMenus.json' with { type: 'json' };
import graveyards from './tables/graveyards.json' with { type: 'json' };
import itemEnchantmentTemplates from './tables/itemEnchantmentTemplates.json' with { type: 'json' };
import itemRandomProperties from './tables/itemRandomProperties.json' with { type: 'json' };
import npcTexts from './tables/npcTexts.json' with { type: 'json' };
import pools from './tables/pools.json' with { type: 'json' };
import ridingSpells from './tables/ridingSpells.json' with { type: 'json' };
import spellChain from './tables/spellChain.json' with { type: 'json' };
import spellTeleports from './tables/spellTeleports.json' with { type: 'json' };
import tavernTriggers from './tables/tavernTriggers.json' with { type: 'json' };
import taxiNodes from './tables/taxiNodes.json' with { type: 'json' };
import taxiRoutes from './tables/taxiRoutes.json' with { type: 'json' };
import transports from './tables/transports.json' with { type: 'json' };
import travelAnchors from './tables/travelAnchors.json' with { type: 'json' };
import travelEdges from './tables/travelEdges.json' with { type: 'json' };
import zoneWeather from './tables/zoneWeather.json' with { type: 'json' };

const world = {
  areatriggerTeleports,
  botPopulation,
  conditions,
  dbScripts,
  entranceYards,
  explorationBasexp,
  gameEvents,
  gossipMenus,
  graveyards,
  itemEnchantmentTemplates,
  itemRandomProperties,
  npcTexts,
  pools,
  ridingSpells,
  spellChain,
  spellTeleports,
  tavernTriggers,
  taxiNodes,
  taxiRoutes,
  transports,
  travelAnchors,
  travelEdges,
  zoneWeather,
} as unknown as WorldTables;

export default world;
