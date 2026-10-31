// Ragefire Chasm (map 389) — InstanceDef graph, trash from CFH/Detection cluster packs.
// Authority: docs/dungeons/survey/01-ragefire-chasm.md. Both creature_linking rows are residuals.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  killSupplyFromEncounter,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

const ENTRY = {
  earthborer: 11320,
  moltenElemental: 11321,
  ragefireShaman: 11319,
  ragefireTrogg: 11318,
  searingCultist: 11322,
  searingEnforcer: 11323,
  searingWarlock: 11324,
  oggleflint: 11517,
  taragaman: 11520,
  jergosh: 11518,
  bazzalan: 11519,
  // Friendly service — never combat (also non-combat filtered in clusters)
  maur: 11834,
} as const;

/** Boss entries stripped from cluster trash (kept as kind:boss). */
export const RAGEFIRE_STRIP = new Set<number>([
  ENTRY.oggleflint,
  ENTRY.taragaman,
  ENTRY.jergosh,
  ENTRY.bazzalan,
  ENTRY.maur,
]);

// Quest / kill progress flags. No TYPE_* instance data in CMaNGOS — pure product markers so Hidden Enemies
// / satchel / Slaying the Beast can be probed without inventing scripts.
export const RFC_FLAGS = {
  /** Jergosh the Invoker dead — Hidden Enemies 5728 kill credit path. */
  jergosh: 'rfc-jergosh-dead',
  /** Bazzalan dead — Hidden Enemies 5728 kill credit path. */
  bazzalan: 'rfc-bazzalan-dead',
  /** Taragaman dead — Slaying the Beast 5761 loot Heart 14540 becomes available. */
  taragaman: 'rfc-taragaman-dead',
  /** Searching for the Lost Satchel 5722 turned in at Maur. */
  satchelReturned: 'rfc-satchel-returned',
} as const;

// Hidden Enemies (5728) — kill Bazzalan 11519 and Jergosh 11518. No dbscripts_on_quest_* rows, so
// it is pure kill credit on the floor. Cite: quest_template 5728 killTargets.
export const RFC_HIDDEN_ENEMIES = {
  questId: 5728,
  jergoshEntry: ENTRY.jergosh,
  bazzalanEntry: ENTRY.bazzalan,
  jergoshEncId: 'jergosh',
  bazzalanEncId: 'bazzalan',
  jergoshFlag: RFC_FLAGS.jergosh,
  bazzalanFlag: RFC_FLAGS.bazzalan,
} as const;

// Maur Grimtotem (11834) satchel chain on the floor: quest 5722 ends at Maur and 5724 starts there
// with item 14381. Spawn npcFlags=2 (QUESTGIVER). Cite: survey 01-ragefire-chasm.md.
export const RFC_MAUR = {
  entry: ENTRY.maur,
  endQuestId: 5722,
  startQuestId: 5724,
  satchelItem: 14381,
  satchelFlag: RFC_FLAGS.satchelReturned,
} as const;

// Slaying the Beast (5761) — loot Taragaman the Hungerer's Heart 14540. Cite: quest_template 5761
// itemTargets; Taragaman entry 11520.
export const RFC_SLAYING_THE_BEAST = {
  questId: 5761,
  bossEntry: ENTRY.taragaman,
  encId: 'taragaman',
  heartItem: 14540,
  flag: RFC_FLAGS.taragaman,
} as const;

/** Both Hidden Enemies kill objectives satisfied (flags from setsFlag on boss clear). */
export function rfcHiddenEnemiesComplete(flags: readonly string[]): boolean {
  return flags.includes(RFC_FLAGS.jergosh) && flags.includes(RFC_FLAGS.bazzalan);
}

// Heart loot path open after Taragaman dies. Negative: no credit while he lives. Actual item credit is
// LootFrame (bake lootId); this is the run-flag gate for probes.
export function rfcTaragamanHeartLootable(flags: readonly string[]): boolean {
  return flags.includes(RFC_FLAGS.taragaman);
}

/** Mark satchel 5722 turned in at Maur. Null when already done. */
export function rfcMaurCompleteSatchel(flags: readonly string[]): string[] | null {
  if (flags.includes(RFC_FLAGS.satchelReturned)) return null;
  return [...flags, RFC_FLAGS.satchelReturned];
}

export function rfcMaurSatchelDone(flags: readonly string[]): boolean {
  return flags.includes(RFC_FLAGS.satchelReturned);
}

// Maur talk surface: which satchel step the player can act on. Negative: idle when neither turn-in nor
// offer is open.
export function rfcMaurTalkAction(opts: {
  canTurnIn5722: boolean;
  canAccept5724: boolean;
}): 'turnin-5722' | 'offer-5724' | 'idle' {
  if (opts.canTurnIn5722) return 'turnin-5722';
  if (opts.canAccept5724) return 'offer-5724';
  return 'idle';
}

/** Survey boss avg pos (map 389) — no hand-typed tables (dmapfid W2 / O7). Keep `z`: it is
 *  the NavStack layer hint (`snapAllLayers`). */
function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(389, entry);
  if (!p) throw new Error(`ragefire-chasm: missing survey boss pos for entry ${entry}`);
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

// Boss spells: creature.spells from bake — no invented ids.
const BOSS_SPELLS = {
  oggleflint: [15584],
  taragaman: [11970, 18072],
  jergosh: [20800, 18267],
  bazzalan: [3616, 14873],
} as const;

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'boss',
    creatureEntry,
    bossSpells: [...bossSpells],
  };
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  return enc;
}

// Linear graph: cluster trash sorted from entrance, bosses interleaved by survey coords. Quest progress
// flags on the three quest-relevant bosses; Oggleflint has no quest row.
function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('ragefire-chasm');
  if (!entrance) throw new Error('ragefire-chasm: missing areatrigger entrance');
  const trash = trashFromClusters({
    mapId: 389,
    stripEntries: RAGEFIRE_STRIP,
    entrance,
  });

  return interleaveTrashAndBosses(
    trash,
    [
      {
        encounter: boss(
          'oggleflint',
          'Oggleflint',
          ENTRY.oggleflint,
          BOSS_SPELLS.oggleflint,
          undefined,
          'Oggleflint, a hulking Ragefire trogg, bars the fissure entrance.',
        ),
        pos: bossPos(ENTRY.oggleflint),
      },
      {
        encounter: boss(
          'taragaman',
          'Taragaman the Hungerer',
          ENTRY.taragaman,
          BOSS_SPELLS.taragaman,
          [{ kind: 'setsFlag', flag: RFC_FLAGS.taragaman }],
          'Taragaman the Hungerer roars from the lava pit.',
        ),
        pos: bossPos(ENTRY.taragaman),
      },
      {
        encounter: boss(
          'jergosh',
          'Jergosh the Invoker',
          ENTRY.jergosh,
          BOSS_SPELLS.jergosh,
          [{ kind: 'setsFlag', flag: RFC_FLAGS.jergosh }],
          'Jergosh the Invoker channels dark magic among the Searing Blade.',
        ),
        pos: bossPos(ENTRY.jergosh),
      },
      {
        encounter: boss(
          'bazzalan',
          'Bazzalan',
          ENTRY.bazzalan,
          BOSS_SPELLS.bazzalan,
          [{ kind: 'setsFlag', flag: RFC_FLAGS.bazzalan }],
          "Bazzalan, satyr overseer of the Searing Blade, waits at the chasm's end.",
        ),
        pos: bossPos(ENTRY.bazzalan),
      },
    ],
    entrance,
  );
}

/** Survey quests completable inside / linked to map 389. */
export const RAGEFIRE_CHASM_QUESTS = [5723, 5722, 5724, 5725, 5728, 5761] as const;

export const RAGEFIRE_CHASM: InstanceDef = {
  id: 'ragefire-chasm',
  mapId: 389,
  name: 'Ragefire Chasm',
  portalZone: 'orgrimmar',
  minLevel: 8, // entrance trigger 2230 requiredLevel
  levelRange: [13, 15], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...RAGEFIRE_CHASM_QUESTS],
  encounters: buildEncounters(),
};

export function ragefireKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  for (const enc of RAGEFIRE_CHASM.encounters) {
    for (const [entry, n] of killSupplyFromEncounter(enc)) {
      map.set(entry, (map.get(entry) ?? 0) + n);
    }
  }
  return map;
}
