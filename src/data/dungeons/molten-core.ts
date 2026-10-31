// Molten Core (map 409) — InstanceDef graph. The fights are src/domain/scriptdev/moltenCore.ts.
// Encounter ORDER is the rune order (molten_core.h:73-82), not DB rank; Majordomo gates Ragnaros.

import type { EncounterDef, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

const ENTRY = {
  lucifron: 12118,
  magmadar: 11982,
  gehennas: 12259,
  garr: 12057,
  shazzrah: 12264,
  geddon: 12056,
  golemagg: 11988,
  sulfuron: 12098,
  majordomo: 12018,
  ragnaros: 11502,
} as const;

/** Run-flags. Cite: molten_core.cpp:162-166,202-225; boss_majordomo_executus.cpp:157. */
export const MC_FLAGS = {
  runesDoused: 'mc-runes-doused',
  majordomoDone: 'mc-majordomo-done',
} as const;

/** Cache of the Fire Lord. Cite: molten_core.h:46 GO_CACHE_OF_THE_FIRE_LORD. */
export const GO_CACHE_OF_THE_FIRE_LORD = 179703;

// Seven Molten Core runes that gate Majordomo. Cite: molten_core.h:47-53 GO_RUNE_*; :62 MAX_MOLTEN_RUNES=7;
// :73-82 m_aMoltenCoreRunes.
export const MC_MAJORDOMO_RUNES = {
  goEntry: 176956,
  goEntries: [
    176956, // GO_RUNE_KRESS — Magmadar
    176957, // GO_RUNE_MOHN — Gehennas
    176955, // GO_RUNE_BLAZ — Garr
    176953, // GO_RUNE_MAZJ — Shazzrah
    176952, // GO_RUNE_ZETH — Geddon
    176954, // GO_RUNE_THERI — Golemagg
    176951, // GO_RUNE_KORO — Sulfuron
  ] as const,
  needUses: 7,
  setsFlag: MC_FLAGS.runesDoused,
} as const;

/** Bosses stripped from cluster trash (kind:boss instead). */
export const MOLTEN_CORE_STRIP = new Set<number>([
  ENTRY.lucifron, ENTRY.magmadar, ENTRY.gehennas, ENTRY.garr, ENTRY.shazzrah,
  ENTRY.geddon, ENTRY.golemagg, ENTRY.sulfuron, ENTRY.majordomo, ENTRY.ragnaros,
]);

function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(409, entry);
  if (!p) throw new Error(`molten-core: missing survey boss pos for entry ${entry}`);
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

// The two bosses with no `creature` row: both are summoned, so their coordinates come from the C++
// that summons them, never a (0,0) sentinel. Cite: molten_core.h:90-92; boss_majordomo:330.
const SUMMON_POS = {
  majordomo: { x: 758.0892, y: -1176.712, z: -118.6403 },
  ragnaros: { x: 838.3082, y: -831.4665, z: -232.1853 },
} as const;

function boss(id: string, name: string, creatureEntry: number, intro: string): EncounterDef {
  return { id, name, kind: 'boss', creatureEntry, intro };
}

// Majordomo's eight Flamewakers have ZERO spawn-bake rows because the instance script summons them
// at fixed points. Without them the pull was a death-prevented boss alone, unwinnable by design.
const MAJORDOMO_ADDS = [
  { creatureEntry: 11664, count: 4 },
  { creatureEntry: 11663, count: 4 },
] as const;

function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('molten-core');
  if (!entrance) throw new Error('molten-core: missing areatrigger entrance');
  const trash = trashFromClusters({
    mapId: 409,
    stripEntries: MOLTEN_CORE_STRIP,
    entrance,
  });
  return interleaveTrashAndBosses(
    trash,
    [
      {
        encounter: boss('lucifron', 'Lucifron', ENTRY.lucifron,
          'Lucifron holds the entry hall with two Flamewaker Protectors.'),
        pos: bossPos(ENTRY.lucifron),
      },
      {
        encounter: boss('magmadar', 'Magmadar', ENTRY.magmadar,
          'Magmadar frenzies on a timer and drops lava bombs under the raid.'),
        pos: bossPos(ENTRY.magmadar),
      },
      {
        encounter: boss('gehennas', 'Gehennas', ENTRY.gehennas,
          'Gehennas curses the raid while his Flamewakers spam Shadow Bolt.'),
        pos: bossPos(ENTRY.gehennas),
      },
      {
        encounter: boss('garr', 'Garr', ENTRY.garr,
          'Garr and eight Firesworn - each add erupts when it dies.'),
        pos: bossPos(ENTRY.garr),
      },
      {
        encounter: boss('shazzrah', 'Shazzrah', ENTRY.shazzrah,
          'Shazzrah blinks to a random target and follows with Arcane Explosion.'),
        pos: bossPos(ENTRY.shazzrah),
      },
      {
        encounter: boss('baron-geddon', 'Baron Geddon', ENTRY.geddon,
          'Inferno every 45 s, Living Bomb on a random player, and Armageddon at 2 %.'),
        pos: bossPos(ENTRY.geddon),
      },
      {
        encounter: boss('golemagg', 'Golemagg the Incinerator', ENTRY.golemagg,
          'Two Core Ragers heal to full below 50 % while Golemagg lives.'),
        pos: bossPos(ENTRY.golemagg),
      },
      {
        encounter: boss('sulfuron-harbinger', 'Sulfuron Harbinger', ENTRY.sulfuron,
          'Four Flamewaker Priests heal him; Inspire buffs whichever still lives.'),
        pos: bossPos(ENTRY.sulfuron),
      },
      {
        encounter: {
          ...boss('majordomo-executus', 'Majordomo Executus', ENTRY.majordomo,
            'Executus cannot be killed - the encounter ends when his eight Flamewakers die.'),
          pack: [...MAJORDOMO_ADDS],
          // Pins for molten_core.cpp:202-225: each rune GO is usable once its boss TYPE is DONE,
          // then SetData SPECIAL summons 12018 at m_aMajordomoLocations[0].
          events: [
            {
              kind: 'objectGate',
              goEntry: MC_MAJORDOMO_RUNES.goEntry,
              goEntries: [...MC_MAJORDOMO_RUNES.goEntries],
              needUses: MC_MAJORDOMO_RUNES.needUses,
              setsFlag: MC_MAJORDOMO_RUNES.setsFlag,
            },
            { kind: 'requiresFlag', flag: MC_FLAGS.runesDoused },
            { kind: 'setsFlag', flag: MC_FLAGS.majordomoDone },
          ],
        },
        pos: SUMMON_POS.majordomo,
      },
      {
        encounter: {
          ...boss('ragnaros', 'Ragnaros', ENTRY.ragnaros,
            'The Firelord. Wrath of Ragnaros knocks the melee back; Magma Blast punishes a raid with nobody in melee.'),
          // Gossip StartSummonEvent is still a GAP (cpp:161-173,295-330). requiresFlag is
          // the floor gate: spawnUnlockedBodies + isUnlocked wait on mc-majordomo-done.
          events: [{ kind: 'requiresFlag', flag: MC_FLAGS.majordomoDone }],
        },
        pos: SUMMON_POS.ragnaros,
      },
    ],
    entrance,
  );
}

/** Survey quests that start or end inside the instance. */
export const MOLTEN_CORE_QUESTS = [6643, 6644, 6822, 6824, 7604, 7632, 7786, 8578] as const;

export const MOLTEN_CORE: InstanceDef = {
  id: 'molten-core',
  mapId: 409,
  name: 'Molten Core',
  // Blackrock Mountain, like every other instance inside it. MC said searinggorge, and
  // `instancePortals` lists a dungeon only in the zone its portalZone names, so MC was invisible.
  portalZone: 'burningsteppes',
  // areatrigger_teleport 3528 "The Molten Core Window Entrance": level 50 + quest 7848. 2886, the
  // BRD bridge walk-in, is ungated and is a named residual — do NOT "fix" it.
  entranceTriggerId: 3528,
  minLevel: 50,
  // instance_template 409 maxPlayers = 40, reset_delay = 7 days. Cite: mangos.sql:2545-2577.
  maxPlayers: 40,
  levelRange: [60, 63],
  lockoutMs: 7 * 24 * 60 * 60 * 1000,
  description: '',
  quests: [...MOLTEN_CORE_QUESTS],
  encounters: buildEncounters(),
  lootObjects: [
    // Guid 4090060 at Majordomo's plateau; spawnSecs -604800 so C++ DoRespawnGameObject
    // is what puts it on the floor. revealedByFlag hides the bake pin until surrender.
    { goEntry: GO_CACHE_OF_THE_FIRE_LORD, revealedByFlag: MC_FLAGS.majordomoDone },
  ],
};
