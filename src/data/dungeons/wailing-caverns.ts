// Wailing Caverns (map 43) — InstanceDef graph plus the Naralex finale. Four Fanglords → Disciple
// gossip → mutanus waves. Authority: docs/dungeons/survey/02-wailing-caverns.md for the residuals.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  killSupplyFromEncounter,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

const ENTRY = {
  faerieDragon: 5912,
  ectoplasm: 3640,
  adder: 5048,
  guardian: 3637,
  ravager: 3636,
  shambler: 5761,
  viper: 5755,
  druidFang: 3840,
  dreadfang: 5056,
  venomwing: 5756,
  crocolisk: 5053,
  python: 8886,
  lasher: 5055,
  nightmare: 5914,
  moccasin: 5762,
  nightmareEcto: 5763,
  anacondra: 3671,
  cobrahn: 3669,
  kresh: 3653,
  pythas: 3670,
  skum: 3674,
  serpentis: 3673,
  verdan: 5775,
  mutanus: 3654,
} as const;

/** Bosses + rare + summon-only stripped from cluster trash. */
export const WAILING_CAVERNS_STRIP = new Set<number>([
  ENTRY.anacondra,
  ENTRY.cobrahn,
  ENTRY.kresh,
  ENTRY.pythas,
  ENTRY.skum,
  ENTRY.serpentis,
  ENTRY.verdan,
  ENTRY.mutanus,
  ENTRY.faerieDragon,
  // Friendlies / summon-only (clusters usually exclude already)
  3678, // Disciple
  3679, // Naralex
  ENTRY.moccasin,
  ENTRY.nightmareEcto,
]);

/** Flags from survey event choreography (four serpent lords → escort gate). */
export const WAILING_CAVERNS_FLAGS = {
  anacondra: 'wc-anacondra',
  cobrahn: 'wc-cobrahn',
  pythas: 'wc-pythas',
  serpentis: 'wc-serpentis',
  // Disciple gossip "Let the event begin!" — TYPE_DISCIPLE IN_PROGRESS stand-in. Cite:
  // wailing_cavernsScripts.cpp GossipSelect → Start escort; JustStartedEscort SetData.
  discipleRitual: 'wc-disciple-ritual',
} as const;

// Disciple of Naralex (3678) escort-gossip start; TYPE_DISCIPLE goes SPECIAL once four Fanglords
// are DONE. Cite: wailing_cavernsScripts.cpp:484-521; SPELL_MARK 5232; TEXT_ID_BEGIN 699.
export const WC_DISCIPLE = {
  entry: 3678,
  naralexEntry: 3679,
  markSpellId: 5232,
  gossipItemBegin: 'Let the event begin!',
  textIdBegin: 699,
  textIdDisciple: 698,
  pathId: 3678,
  /** Mutanus waves arm only after this gossip (requiresFlag on mutanus). */
  mutanusEncId: 'mutanus',
} as const;

/** Four Fanglords DONE → Disciple offers the ritual gossip (TYPE_DISCIPLE SPECIAL). */
export function wcDiscipleCanBeginRitual(flags: readonly string[]): boolean {
  const f = WAILING_CAVERNS_FLAGS;
  if (flags.includes(f.discipleRitual)) return false;
  return (
    flags.includes(f.anacondra)
    && flags.includes(f.cobrahn)
    && flags.includes(f.pythas)
    && flags.includes(f.serpentis)
  );
}

/** Gossip select → set ritual flag. Null when four Fanglords incomplete or already started. */
export function wcDiscipleBeginRitual(flags: readonly string[]): string[] | null {
  if (!wcDiscipleCanBeginRitual(flags)) return null;
  return [...flags, WAILING_CAVERNS_FLAGS.discipleRitual];
}

export function wcDiscipleRitualStarted(flags: readonly string[]): boolean {
  return flags.includes(WAILING_CAVERNS_FLAGS.discipleRitual);
}

// WP30 circle wave: each of 3 slots is a random Adder 5048 or Viper 5755, deterministic from a seed
// triple in [0,1). Cite: wailing_cavernsScripts.cpp:299-304 urand(0,1) per circleLocations slot.
export function wcCircleWavePack(rolls: readonly [number, number, number]): {
  creatureEntry: number;
  count: number;
}[] {
  const adder = ENTRY.adder;
  const viper = ENTRY.viper;
  const picks = rolls.map((r) => (r < 0.5 ? adder : viper));
  const counts = new Map<number, number>();
  for (const e of picks) counts.set(e, (counts.get(e) ?? 0) + 1);
  return [...counts.entries()].map(([creatureEntry, count]) => ({ creatureEntry, count }));
}

// Survey boss avg pos (map 43). Unknown must be NaN, not (0,0): Anacondra has no `creature` row, and
// a finite 0,0 counted as a real origin, so her DB position never landed and she pinned at 0,0.
function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(43, entry);
  if (!p) return { x: NaN, y: NaN };
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

const BOSS_SPELLS = {
  anacondra: [5187, 700, 8148, 9532],
  cobrahn: [3616, 7965, 5188, 8040, 9532],
  pythas: [5187, 700, 8147, 9532],
  skum: [6254],
  serpentis: [6778, 700, 9532],
  verdan: [8142],
  mutanus: [8150, 7967, 7399],
} as const;

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells?: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'boss',
    creatureEntry,
  };
  if (bossSpells && bossSpells.length) enc.bossSpells = [...bossSpells];
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  return enc;
}

// Cluster trash (spatial sort) interleaved with the canonical boss order. Anacondra has a null
// survey pos so she uses equal-bands, and the Naralex ritual is a hand waves encounter.
function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('wailing-caverns');
  if (!entrance) throw new Error('wailing-caverns: missing areatrigger entrance');
  const trash = trashFromClusters({
    mapId: 43,
    stripEntries: WAILING_CAVERNS_STRIP,
    entrance,
  });

  // Survey rare; isComplete ignores optional.
  const faerie = {
    ...boss(
      'deviate-faerie-dragon',
      'Deviate Faerie Dragon',
      ENTRY.faerieDragon,
      undefined,
      undefined,
      'A rare deviate faerie dragon flutters in a side alcove.',
    ),
    optional: true,
  };

  const body = interleaveTrashAndBosses(
    trash,
    [
      {
        encounter: boss(
          'lady-anacondra',
          'Lady Anacondra',
          ENTRY.anacondra,
          BOSS_SPELLS.anacondra,
          [{ kind: 'setsFlag', flag: WAILING_CAVERNS_FLAGS.anacondra }],
          'Lady Anacondra, first of the Druids of the Fang, bars the upper caverns.',
        ),
        pos: bossPos(ENTRY.anacondra),
      },
      {
        encounter: boss(
          'lord-cobrahn',
          'Lord Cobrahn',
          ENTRY.cobrahn,
          BOSS_SPELLS.cobrahn,
          [{ kind: 'setsFlag', flag: WAILING_CAVERNS_FLAGS.cobrahn }],
          'Lord Cobrahn coils in the pit of the Fanglords.',
        ),
        pos: bossPos(ENTRY.cobrahn),
      },
      {
        encounter: boss(
          'kresh',
          'Kresh',
          ENTRY.kresh,
          undefined,
          undefined,
          'Kresh the crocolisk thrashes in the pool.',
        ),
        pos: bossPos(ENTRY.kresh),
      },
      {
        encounter: boss(
          'lord-pythas',
          'Lord Pythas',
          ENTRY.pythas,
          BOSS_SPELLS.pythas,
          [{ kind: 'setsFlag', flag: WAILING_CAVERNS_FLAGS.pythas }],
          'Lord Pythas holds the southern tunnels.',
        ),
        pos: bossPos(ENTRY.pythas),
      },
      {
        encounter: boss(
          'skum',
          'Skum',
          ENTRY.skum,
          BOSS_SPELLS.skum,
          undefined,
          'Skum the thunder lizard bellows.',
        ),
        pos: bossPos(ENTRY.skum),
      },
      {
        encounter: boss(
          'lord-serpentis',
          'Lord Serpentis',
          ENTRY.serpentis,
          BOSS_SPELLS.serpentis,
          [{ kind: 'setsFlag', flag: WAILING_CAVERNS_FLAGS.serpentis }],
          "Lord Serpentis, last of the Fanglords, stands near Naralex's chamber.",
        ),
        pos: bossPos(ENTRY.serpentis),
      },
      {
        // Survey skippable; isComplete ignores optional.
        encounter: {
          ...boss(
            'verdan',
            'Verdan the Everliving',
            ENTRY.verdan,
            BOSS_SPELLS.verdan,
            undefined,
            'Verdan the Everliving blocks the approach to the Disciple.',
          ),
          optional: true,
        },
        pos: bossPos(ENTRY.verdan),
      },
    ],
    entrance,
    {
      // Rare after Kresh (survey side alcove)
      kresh: [faerie],
    },
    'equal-bands',
  );

  const mutanus: EncounterDef = {
    id: 'mutanus',
    name: 'Mutanus the Devourer',
    kind: 'boss',
    creatureEntry: ENTRY.mutanus,
    bossSpells: [...BOSS_SPELLS.mutanus],
    intro:
      'The Disciple of Naralex begins the awakening ritual. Nightmare waves pour from the dream - then Mutanus the Devourer.',
    events: [
      { kind: 'requiresFlag', flag: WAILING_CAVERNS_FLAGS.anacondra },
      { kind: 'requiresFlag', flag: WAILING_CAVERNS_FLAGS.cobrahn },
      { kind: 'requiresFlag', flag: WAILING_CAVERNS_FLAGS.pythas },
      { kind: 'requiresFlag', flag: WAILING_CAVERNS_FLAGS.serpentis },
      // GossipSelect Start escort — TYPE_DISCIPLE IN_PROGRESS stand-in (cpp:512-518,214-217).
      { kind: 'requiresFlag', flag: WAILING_CAVERNS_FLAGS.discipleRitual },
      {
        kind: 'waves',
        waves: [
          // WP12 raptorLocations ×2 (Scripts.cpp:81-85,275-278)
          { pack: [{ creatureEntry: ENTRY.ravager, count: 2 }] },
          // WP30 circleLocations ×3 urand Adder|Viper — fixed 2+1 kill supply (cpp:299-304)
          {
            pack: [
              { creatureEntry: ENTRY.adder, count: 2 },
              { creatureEntry: ENTRY.viper, count: 1 },
            ],
          },
          // WP70 moccasinLocations ×3 (cpp:102-107,338-341)
          { pack: [{ creatureEntry: ENTRY.moccasin, count: 3 }] },
          // WP70 ectoplasmLocations ×7 (cpp:116-125,351-354)
          { pack: [{ creatureEntry: ENTRY.nightmareEcto, count: 7 }] },
          // WP70 mutanosLocations Mutanus 3654 (cpp:127,365-370)
          { pack: [{ creatureEntry: ENTRY.mutanus, count: 1 }] },
        ],
      },
    ],
  };

  return [...body, mutanus];
}

/** Survey “Quests completable inside” entry ids (map 43). */
export const WAILING_CAVERNS_QUESTS = [385, 866, 1486, 962, 1487, 914, 7944] as const;

export const WAILING_CAVERNS: InstanceDef = {
  id: 'wailing-caverns',
  mapId: 43,
  name: 'Wailing Caverns',
  portalZone: 'barrens',
  minLevel: 10, // entrance trigger 228 requiredLevel
  levelRange: [17, 21], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...WAILING_CAVERNS_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored kill supply per creature entry (CSE max-coverage + waves). */
export function wailingCavernsKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  for (const enc of WAILING_CAVERNS.encounters) {
    for (const [entry, n] of killSupplyFromEncounter(enc)) {
      map.set(entry, (map.get(entry) ?? 0) + n);
    }
  }
  return map;
}

/** Pure static trash packs (no bosses, no flag-gated, no wave tables). CSE max-coverage for pool slots. */
export function wailingCavernsPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  for (const enc of WAILING_CAVERNS.encounters) {
    if (enc.kind !== 'trash') continue;
    const req = (enc.events ?? []).some((e) => e.kind === 'requiresFlag');
    if (req) continue;
    const hasWaves = (enc.events ?? []).some((e) => e.kind === 'waves');
    if (hasWaves) continue;
    for (const [entry, n] of killSupplyFromEncounter(enc)) {
      map.set(entry, (map.get(entry) ?? 0) + n);
    }
  }
  return map;
}
