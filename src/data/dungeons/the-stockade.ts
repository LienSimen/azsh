// The Stockade (map 34) — InstanceDef graph, trash from CFH/Detection clusters and CSE prisoner
// pools one slot per guid. No open GAPS: EventAI ships via the bake and map 34 has no ScriptDevAI.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  killSupplyFromEncounter,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

const ENTRY = {
  captive: 1707,
  prisoner: 1706,
  convict: 1711,
  inmate: 1708,
  insurgent: 1715,
  targorr: 1696,
  kam: 1666,
  hamhock: 1717,
  bazil: 1716,
  dextren: 1663,
  bruegal: 1720,
} as const;

export const STOCKADE_STRIP = new Set<number>([
  ENTRY.targorr,
  ENTRY.kam,
  ENTRY.hamhock,
  ENTRY.bazil,
  ENTRY.dextren,
  ENTRY.bruegal,
]);

// Quest kill/loot progress flags. No TYPE_* instance data in CMaNGOS for Stockade — product markers for the
// riot / cell-block quest heads.
export const STOCKADE_FLAGS = {
  /** Targorr the Dread dead — What Comes Around… 386 head 3630. */
  targorr: 'stockade-targorr-dead',
  /** Kam Deepfury dead — The Fury Runs Deep 378 head 3640. */
  kam: 'stockade-kam-dead',
  /** Bazil Thredd dead — The Stockade Riots 391 head 2926. */
  bazil: 'stockade-bazil-dead',
  /** Dextren Ward dead — Crime and Punishment 377 hand 3628. */
  dextren: 'stockade-dextren-dead',
} as const;

// The Stockade Riots (391) — loot Head of Bazil Thredd 2926 (Warden Thelwater → Thelwater). Cite:
// quest_template 391; survey 06-the-stockade.md. No dbscripts — pure loot on kill.
export const STOCKADE_RIOTS = {
  questId: 391,
  bossEntry: ENTRY.bazil,
  encId: 'bazil-thredd',
  headItem: 2926,
  flag: STOCKADE_FLAGS.bazil,
} as const;

// Crime and Punishment (377) — loot Hand of Dextren Ward 3628. Cite: quest_template 377 itemTargets;
// Dextren 1663 (pool of 3 guids, one up).
export const STOCKADE_CRIME = {
  questId: 377,
  bossEntry: ENTRY.dextren,
  encId: 'dextren-ward',
  handItem: 3628,
  flag: STOCKADE_FLAGS.dextren,
} as const;

// What Comes Around… (386) — loot Head of Targorr 3630. Cite: quest_template 386; Targorr 1696 (pool of 4
// guids, one up).
export const STOCKADE_WHAT_COMES = {
  questId: 386,
  bossEntry: ENTRY.targorr,
  encId: 'targorr-the-dread',
  headItem: 3630,
  flag: STOCKADE_FLAGS.targorr,
} as const;

// The Fury Runs Deep (378) — loot Head of Deepfury 3640. Cite: quest_template 378; Kam Deepfury 1666
// (single spawn).
export const STOCKADE_FURY = {
  questId: 378,
  bossEntry: ENTRY.kam,
  encId: 'kam-deepfury',
  headItem: 3640,
  flag: STOCKADE_FLAGS.kam,
} as const;

/** Bazil dead → Head of Bazil Thredd loot path open (probe / feed). */
export function stockadeRiotHeadLootable(flags: readonly string[]): boolean {
  return flags.includes(STOCKADE_FLAGS.bazil);
}

/** Dextren dead → Hand loot path open. */
export function stockadeCrimeHandLootable(flags: readonly string[]): boolean {
  return flags.includes(STOCKADE_FLAGS.dextren);
}

/** Targorr dead → head loot path open. */
export function stockadeTargorrHeadLootable(flags: readonly string[]): boolean {
  return flags.includes(STOCKADE_FLAGS.targorr);
}

/** Kam dead → Deepfury head loot path open. */
export function stockadeFuryHeadLootable(flags: readonly string[]): boolean {
  return flags.includes(STOCKADE_FLAGS.kam);
}

// Quell The Uprising (387) kill totals — Defias Prisoner 10, Convict 8, Insurgent 8. Credit is the
// combat kill tally with no flags; this helper is for probe completeness only.
export const STOCKADE_QUELL = {
  questId: 387,
  prisonerEntry: ENTRY.prisoner,
  convictEntry: ENTRY.convict,
  insurgentEntry: ENTRY.insurgent,
  prisonerNeed: 10,
  convictNeed: 8,
  insurgentNeed: 8,
} as const;

// Survey boss avg pos (map 34) — no hand-typed tables. Keep `z`: it is the NavStack's layer hint,
// so dropping it made every Stockade boss a bare plan column with no floor to pick.
function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(34, entry);
  if (!p) throw new Error(`the-stockade: missing survey boss pos for entry ${entry}`);
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

const BOSS_SPELLS = {
  targorr: [8599, 8876, 674],
  kam: [7164, 8242],
  hamhock: [6742, 421],
  bazil: [9128, 7964, 674],
  dextren: [5246, 11976, 2457, 7165, 19134],
} as const;

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells?: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
): EncounterDef {
  const enc: EncounterDef = { id, name, kind: 'boss', creatureEntry };
  if (bossSpells?.length) enc.bossSpells = [...bossSpells];
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  return enc;
}

function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('the-stockade');
  if (!entrance) throw new Error('the-stockade: missing areatrigger entrance');
  const trash = trashFromClusters({
    mapId: 34,
    stripEntries: STOCKADE_STRIP,
    entrance,
  });
  return interleaveTrashAndBosses(
    trash,
    [
      {
        encounter: boss(
          'targorr-the-dread',
          'Targorr the Dread',
          ENTRY.targorr,
          BOSS_SPELLS.targorr,
          [{ kind: 'setsFlag', flag: STOCKADE_FLAGS.targorr }],
          'Targorr the Dread, a brutal Defias thug, prowls the cell block.',
        ),
        pos: bossPos(ENTRY.targorr),
      },
      {
        encounter: boss(
          'kam-deepfury',
          'Kam Deepfury',
          ENTRY.kam,
          BOSS_SPELLS.kam,
          [{ kind: 'setsFlag', flag: STOCKADE_FLAGS.kam }],
          'Kam Deepfury, the Dark Iron prisoner, waits in the lower cells.',
        ),
        pos: bossPos(ENTRY.kam),
      },
      {
        encounter: boss(
          'hamhock',
          'Hamhock',
          ENTRY.hamhock,
          BOSS_SPELLS.hamhock,
          undefined,
          'The ogre Hamhock fills the corridor with his bulk.',
        ),
        pos: bossPos(ENTRY.hamhock),
      },
      {
        encounter: boss(
          'bazil-thredd',
          'Bazil Thredd',
          ENTRY.bazil,
          BOSS_SPELLS.bazil,
          [{ kind: 'setsFlag', flag: STOCKADE_FLAGS.bazil }],
          'Bazil Thredd, mastermind of the Stockade riots, stands at the end of the block.',
        ),
        pos: bossPos(ENTRY.bazil),
      },
      {
        encounter: boss(
          'dextren-ward',
          'Dextren Ward',
          ENTRY.dextren,
          BOSS_SPELLS.dextren,
          [{ kind: 'setsFlag', flag: STOCKADE_FLAGS.dextren }],
          'Dextren Ward, leader of the Defias convicts, holds a side wing.',
        ),
        pos: bossPos(ENTRY.dextren),
      },
      {
        // Vanilla rare-elite (entry 1720) — skippable; isComplete ignores optional.
        // Cite: docs/dungeons/survey/06-the-stockade.md (rare-elite); creature Rank.
        encounter: {
          ...boss(
            'bruegal-ironknuckle',
            'Bruegal Ironknuckle',
            ENTRY.bruegal,
            undefined,
            undefined,
            'A rare elite knocks about the cell block.',
          ),
          optional: true,
        },
        pos: bossPos(ENTRY.bruegal),
      },
    ],
    entrance,
  );
}

export const THE_STOCKADE_QUESTS = [386, 377, 387, 388, 378, 391] as const;

/** @deprecated Prefer cluster-derived counts; kept for test import compatibility. */
export const THE_STOCKADE_STATIC = {
  captive: 21,
  prisoner: 22,
  convict: 8,
  inmate: 21,
  insurgent: 19,
} as const;

export const THE_STOCKADE: InstanceDef = {
  id: 'the-stockade',
  mapId: 34,
  name: 'The Stockade',
  portalZone: 'stormwind',
  minLevel: 15,
  levelRange: [23, 26],
  lockoutMs: 0,
  description: '',
  quests: [...THE_STOCKADE_QUESTS],
  encounters: buildEncounters(),
};

export function stockadeStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  for (const enc of THE_STOCKADE.encounters) {
    if (enc.kind !== 'trash') continue;
    for (const [entry, n] of killSupplyFromEncounter(enc)) {
      map.set(entry, (map.get(entry) ?? 0) + n);
    }
  }
  return map;
}

export function stockadeKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  for (const enc of THE_STOCKADE.encounters) {
    for (const [entry, n] of killSupplyFromEncounter(enc)) {
      map.set(entry, (map.get(entry) ?? 0) + n);
    }
  }
  return map;
}
