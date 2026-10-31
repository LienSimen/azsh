// Instance music categories (shipped public/audio/zone/<key> playlists).
// Vanilla instance ZoneMusic folded onto packs we ship.

/** @type {Record<string, string>} */
export const DUNGEON_MUSIC = {
  'ragefire-chasm': 'volcanic',
  'wailing-caverns': 'jungle',
  'deadmines': 'plaguelands',
  'shadowfang-keep': 'evilforest',
  'the-stockade': 'stormwind',
  'blackfathom-deeps': 'soggyswamp',
  'gnomeregan': 'ironforge',
  'razorfen-kraul': 'barrendry',
  'sm-graveyard': 'evilforest',
  'sm-library': 'evilforest',
  'sm-armory': 'evilforest',
  'sm-cathedral': 'evilforest',
  'razorfen-downs': 'barrendry',
  'uldaman': 'mountain',
  'zul-farrak': 'desert',
  'maraudon': 'barrendry',
  'sunken-temple': 'soggyswamp',
  'blackrock-depths': 'volcanic',
  'lbrs': 'volcanic',
  'ubrs': 'volcanic',
  'dire-maul-east': 'enchantedforest',
  'dire-maul-west': 'enchantedforest',
  'dire-maul-north': 'enchantedforest',
  'scholomance': 'plaguelands',
  'stratholme-live': 'evilforest',
  'stratholme-undead': 'evilforest',
  // See dungeonMusic.ts for the AreaTable -> ZoneMusic provenance of these rows.
  'onyxias-lair': 'barrendry',
  'zul-gurub': 'jungle',
  'ruins-of-ahnqiraj': 'ahnqirajexteriorwalking',
  'temple-of-ahnqiraj': 'ahnqirajexteriorwalking',
  naxxramas: 'naxxramas',
};

// Sourced SILENCE, not a missing row — Molten Core (area 2717) and Blackwing Lair (2677) carry ZoneMusic 0
// in the client. Lockstep twin of dungeonMusic.ts DUNGEON_MUSIC_SILENT.
export const DUNGEON_MUSIC_SILENT = new Set(['molten-core', 'blackwing-lair']);

/** @param {string | undefined | null} dungeonId */
export function musicForDungeon(dungeonId) {
  if (!dungeonId) return undefined;
  return DUNGEON_MUSIC[dungeonId];
}
