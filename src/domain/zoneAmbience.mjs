// Outdoor zone to ambient bed category, shared by the seed script and the audio proof so the bake and
// the proof cannot drift. `city` is Stormwind-only WMO bells — never assign it to another capital.

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

// SoundAmbience dayKit,nightKit pair → shipped ambience category. Pairs from classic SoundAmbience.dbc /
// AreaTable.AmbienceID.
export const AMBIENCE_PAIR_MAP = {
  '4183,4184': 'forest',
  '4176,4177': 'forest',
  '4196,4197': 'mountain',
  '4166,4167': 'plains',
  '4189,4190': 'plains',
  '4174,4175': 'plains',
  '4193,4194': 'haunted',
  '4178,4179': 'jungle',
  '4170,4171': 'haunted',
  '4180,4181': 'marsh',
  '4200,4201': 'marsh',
  '4205,4206': 'volcanic',
  '4212,4213': 'haunted',
  '4207,4208': 'plains',
  '4210,4211': 'enchanted',
  '4187,4188': 'haunted',
  '4191,4192': 'desert',
  '4202,4203': 'plains',
  '4994,4994': 'desert',
};

// Capital overrides. `city` = Stormwind WMO only (bells). Orgrimmar / Ironforge MUST NOT appear here with
// `city`.
export const CAPITAL_AMBIENCE = {
  stormwind: 'city',
  undercity: 'haunted',
  thunderbluff: 'plains',
  darnassus: 'enchanted',
};

/** Only these zones may use ambience category `city`. */
export const CITY_AMBIENCE_ALLOWED = new Set(['stormwind']);

export const DEFAULT_AMBIENCE = 'forest';

/** Resolve the expected ambience category for a zone.
 *  @param {string} zoneId @param {{ pair?: string | null }} [opts] the DBC day,night pair @param {{ name?: string, description?: string }} [zoneMeta] fallback keywords only */
export function expectedAmbience(zoneId, opts = {}, zoneMeta = {}) {
  if (CAPITAL_AMBIENCE[zoneId]) return CAPITAL_AMBIENCE[zoneId];

  const pair = opts.pair;
  if (pair && AMBIENCE_PAIR_MAP[pair]) return AMBIENCE_PAIR_MAP[pair];

  const hay = `${zoneMeta.name || ''} ${zoneMeta.description || ''}`.toLowerCase();
  if (/jungle|stranglethorn|feralas|ungoro/.test(hay)) return 'jungle';
  if (/volcan|searing|burning/.test(hay)) return 'volcanic';
  if (/haunted|duskwood|deadwind|plague|felwood|scary|undead|tirisfal/.test(hay)) return 'haunted';
  if (/marsh|wetland|swamp|dustwallow|soggy/.test(hay)) return 'marsh';
  if (/desert|tanaris|silithus|salt|blasted/.test(hay)) return 'desert';
  if (/mountain|snow|morogh|winterspring|ironforge/.test(hay)) return 'mountain';
  if (/enchant|teldrassil|ashenvale|night elf|darnassus|moonglade/.test(hay)) return 'enchanted';
  if (/plain|grass|field|barrens|mulgore|westfall|durotar|stonetalon|needle|orgrimmar/.test(hay)) return 'plains';
  if (/forest|wood|elwynn|redridge|loch/.test(hay)) return 'forest';
  if (/stormwind/.test(hay)) return 'city';
  return DEFAULT_AMBIENCE;
}

/** Soft invariant: city bed only where allowed. */
export function assertCityAmbiencePolicy(zoneId, ambience) {
  if (ambience === 'city' && !CITY_AMBIENCE_ALLOWED.has(zoneId)) {
    return `zone "${zoneId}" must not use ambience "city" (Stormwind bells); allowed only: ${[...CITY_AMBIENCE_ALLOWED].join(', ')}`;
  }
  return null;
}
