// Instance music categories over the shipped zone playlists, folding vanilla instance ZoneMusic onto
// packs we ship. Keep in lockstep with the .mjs twin, which the ETL needs under plain node.

export const DUNGEON_MUSIC: Readonly<Record<string, string>> = {
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
  // Raids, from AreaTable field 8 to ZoneMusic — the same chain extract-zone-music bakes. Onyxia's
  // Lair resolves to a Barrens set whose one file lives in the barrendry pack.
  'onyxias-lair': 'barrendry',
  'zul-gurub': 'jungle',
  // AQ20 and AQ40 are the ONLY two 1.12 AreaTable rows referencing any AQ ZoneMusic set. The six
  // interior sets are named after ROOMS, and mapping one onto an area has no source. Do not guess.
  'ruins-of-ahnqiraj': 'ahnqirajexteriorwalking',
  'temple-of-ahnqiraj': 'ahnqirajexteriorwalking',
  // Naxxramas is the one instance AreaTable cannot reach: in 1.12 its ten sets are WMO-group-driven.
  // The route is the SET NAME, which is the client's own — a fold, not a derivation.
  naxxramas: 'naxxramas',
};

// Instances whose sourced answer is SILENCE rather than a missing row: Molten Core and Blackwing Lair
// carry ZoneMusic 0. Named so the audio gate can tell "faithfully silent" from "nobody routed it".
export const DUNGEON_MUSIC_SILENT: ReadonlySet<string> = new Set([
  'molten-core',
  'blackwing-lair',
]);

export function musicForDungeon(dungeonId: string | undefined | null): string | undefined {
  if (!dungeonId) return undefined;
  return DUNGEON_MUSIC[dungeonId];
}

// Naxxramas wing to shipped pack. The client names its own sets after the wings, and those names ARE
// the route. `boss: true` picks the boss variant where the client ships one.
const NAXX_WING_MUSIC: Readonly<Record<string, { walk: string; boss: string }>> = {
  Arachnid: { walk: 'naxxramasspider', boss: 'naxxramasspiderboss' },
  Plague: { walk: 'naxxramasplague', boss: 'naxxramasplagueboss' },
  Construct: { walk: 'naxxramasabomination', boss: 'naxxramasabominationboss' },
  Military: { walk: 'naxxramasdeathknight', boss: 'naxxramasdeathknight' },
  Frostwyrm: { walk: 'naxxramasfrostwyrm', boss: 'naxxramasfrostwyrm' },
};

// Music for the pull the party is standing at, falling back to the instance's own pack. Kel'Thuzad has his
// own set even though he shares the Frostwyrm wing with Sapphiron.
export function musicForEncounter(
  dungeonId: string | undefined | null,
  encounter?: { id?: string; kind?: string; wing?: string } | null,
): string | undefined {
  const base = musicForDungeon(dungeonId);
  if (dungeonId !== 'naxxramas' || !encounter?.wing) return base;
  if (encounter.id === 'kelthuzad') return 'naxxramaskelthuzad';
  const set = NAXX_WING_MUSIC[encounter.wing];
  if (!set) return base;
  return encounter.kind === 'boss' ? set.boss : set.walk;
}

/** Music where the party is standing on an instance floor. */
export interface MusicEncounterPos {
  id?: string;
  kind?: string;
  wing?: string;
  origin?: { x: number; y: number } | null;
}

// Which pack the free-walk floor should play, from the wing of the nearest wing-tagged encounter. The
// WALK pack, always: the boss variants are a per-encounter route the floor shell cannot signal.
export function musicForInstanceAt(
  dungeonId: string | undefined | null,
  encounters: readonly MusicEncounterPos[] | undefined,
  pos: { x: number; y: number } | undefined | null,
): string | undefined {
  const base = musicForDungeon(dungeonId);
  if (!pos || !encounters?.length) return base;
  let best: MusicEncounterPos | undefined;
  let bestD = Infinity;
  for (const e of encounters) {
    if (!e.wing || !e.origin) continue;
    const dx = e.origin.x - pos.x;
    const dy = e.origin.y - pos.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return base;
  return musicForEncounter(dungeonId, { id: best.id, kind: 'trash', wing: best.wing });
}
