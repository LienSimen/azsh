// Outdoor zone to music playlist category. THE MAPPING IS THE CLIENT'S: a category is a ZoneMusic set
// a zone reaches through AreaTable field 8. The old substring folding was measurably wrong and is gone.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SETS = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'zone-music-sets.json'), 'utf8'));

/** zone id → primary AreaTable ID */
export const ZONE_AREAS = {
  stormwind: 1519, ironforge: 1537, undercity: 1497,
  elwynn: 12, westfall: 40, redridge: 44, duskwood: 10,
  dunmorogh: 1, lochmodan: 38, wetlands: 11, badlands: 3,
  searinggorge: 51, burningsteppes: 46, deadwindpass: 41, swampofsorrows: 8, blastedlands: 4,
  stranglethorn: 33,
  tirisfal: 85, silverpine: 130, hillsbrad: 267, alterac: 36, arathi: 45, hinterlands: 47,
  westernplaguelands: 28, easternplaguelands: 139,
  orgrimmar: 1637, thunderbluff: 1638, darnassus: 1657,
  durotar: 14, barrens: 17, mulgore: 215,
  azshara: 16, teldrassil: 141, darkshore: 148, ashenvale: 331,
  felwood: 361, winterspring: 618, moonglade: 493,
  stonetalon: 406, desolace: 405, feralas: 357, thousandneedles: 400,
  dustwallow: 15, tanaris: 440, ungoro: 490, silithus: 1377,
};

// Capitals always use their city playlist — a deliberate override, since vanilla points a capital AREA
// at an outdoor set or at nothing while a proper city row exists. The ids come from the DBC by name.
export const CAPITAL_MUSIC = SETS.capitalSets;

export const DEFAULT_MUSIC = 'forest';

/** The ZoneMusic.dbc set a zone resolves to, or null if the client assigns it none. */
export function musicSetFor(zoneId) {
  if (CAPITAL_MUSIC[zoneId]) return CAPITAL_MUSIC[zoneId];
  const areaId = ZONE_AREAS[zoneId];
  if (areaId == null) return null;
  return SETS.areaSets[String(areaId)] || null;
}

/** Music category for a zone, straight from the client's tables. Extra arguments are accepted and
 *  ignored — the old folding and keyword heuristics are gone. @param {string} zoneId */
export function expectedMusic(zoneId) {
  return musicSetFor(zoneId) || DEFAULT_MUSIC;
}

// Shipped music categories, which must exist under public/audio/zone/. DERIVED from the zones we have,
// so adding one cannot leave the list stale — a hand-typed array is what hid the folded sets.
export const SHIPPED_MUSIC_TRACKS = [
  ...new Set(Object.keys(ZONE_AREAS).map((z) => expectedMusic(z))),
].sort();

/** The zone-music sets as baked from the DBC: slug → { day[], night[], silence, dirBase, … }. */
export const MUSIC_SETS = SETS.sets;

/** Soft policy: capital music key must match capital id. */
export function assertCapitalMusicPolicy(zoneId, music) {
  if (CAPITAL_MUSIC[zoneId] && music !== zoneId) {
    return `capital "${zoneId}" music must be "${zoneId}", got "${music}"`;
  }
  return null;
}
