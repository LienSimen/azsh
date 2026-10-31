// App instance id -> navmesh bake slug. Wings on one map share one slug (SM, BRS, DM, Stratholme).
// Sourced from phonecraft scripts/dbake/census.py:INSTANCES; keys index NAVMESH_FLOORS.
const BAKE_SLUG_BY_INSTANCE: Readonly<Record<string, string>> = {
  'ragefire-chasm': 'ragefire-chasm',
  'wailing-caverns': 'wailing-caverns',
  deadmines: 'deadmines',
  'shadowfang-keep': 'shadowfang-keep',
  'the-stockade': 'the-stockade',
  'blackfathom-deeps': 'blackfathom-deeps',
  gnomeregan: 'gnomeregan',
  'razorfen-kraul': 'razorfen-kraul',
  'sm-graveyard': 'scarlet-monastery',
  'sm-library': 'scarlet-monastery',
  'sm-armory': 'scarlet-monastery',
  'sm-cathedral': 'scarlet-monastery',
  'razorfen-downs': 'razorfen-downs',
  uldaman: 'uldaman',
  'zul-farrak': 'zul-farrak',
  maraudon: 'maraudon',
  'sunken-temple': 'sunken-temple',
  'blackrock-depths': 'blackrock-depths',
  lbrs: 'blackrock-spire',
  ubrs: 'blackrock-spire',
  'dire-maul-east': 'dire-maul',
  'dire-maul-west': 'dire-maul',
  'dire-maul-north': 'dire-maul',
  scholomance: 'scholomance',
  'stratholme-live': 'stratholme',
  'stratholme-undead': 'stratholme',
  'onyxias-lair': 'onyxias-lair',
  'molten-core': 'molten-core',
  'zul-gurub': 'zul-gurub',
  'blackwing-lair': 'blackwing-lair',
  'ruins-of-ahnqiraj': 'ruins-of-ahnqiraj',
  'temple-of-ahnqiraj': 'temple-of-ahnqiraj',
  naxxramas: 'naxxramas',
  'alterac-valley-alliance': 'alterac-valley',
  'alterac-valley-horde': 'alterac-valley',
};

export function bakeSlugForInstance(instanceId: string): string | null {
  return BAKE_SLUG_BY_INSTANCE[instanceId] ?? null;
}
