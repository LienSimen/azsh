// Blackwing Lair (map 469) — InstanceDef graph. The fights are src/domain/scriptdev/blackwingLair.ts.
// Nefarian 11583 has no `creature` row, so his coordinates come from Nefarius 10162's own spawn.

import type { EncounterDef, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

const ENTRY = {
  razorgore: 12435,
  vaelastrasz: 13020,
  lashlayer: 12017,
  firemaw: 11983,
  ebonroc: 14601,
  flamegor: 11981,
  chromaggus: 14020,
  nefarius: 10162,
  nefarian: 11583,
} as const;

export const BLACKWING_LAIR_STRIP = new Set<number>(Object.values(ENTRY));

// GossipSelect last option → SetFactionTemporary(14) + SetInCombatWithZone; speech timers are chrome
// and must not block the pull. Cite: boss_vaelastrasz.cpp:331-342; :266-269 HandleSpeech.
export const BWL_FLAGS = {
  vaelHostile: 'bwl-vael-hostile',
} as const;

export const BWL_VAEL = {
  entry: ENTRY.vaelastrasz,
  encId: 'vaelastrasz',
  /** Cite: boss_vaelastrasz.cpp:60 FACTION_HOSTILE */
  factionHostile: 14,
  /** Cite: scriptdev2.sql -1469026 vaelastrasz SAY_LINE1 */
  sayLine1: "Too late, friends! Nefarius' corruption has taken hold...I cannot...control myself.",
} as const;

export function vaelGossipStartsCombat(flags: readonly string[]): boolean {
  return flags.includes(BWL_FLAGS.vaelHostile);
}

/** Null when already engaged. */
export function vaelAcceptGossip(flags: readonly string[]): string[] | null {
  if (flags.includes(BWL_FLAGS.vaelHostile)) return null;
  return [...flags, BWL_FLAGS.vaelHostile];
}

function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(469, entry);
  if (!p) throw new Error(`blackwing-lair: missing survey boss pos for entry ${entry}`);
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

function boss(id: string, name: string, creatureEntry: number, intro: string): EncounterDef {
  return { id, name, kind: 'boss', creatureEntry, intro };
}

function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('blackwing-lair');
  if (!entrance) throw new Error('blackwing-lair: missing areatrigger entrance');
  const trash = trashFromClusters({ mapId: 469, stripEntries: BLACKWING_LAIR_STRIP, entrance });
  return interleaveTrashAndBosses(
    trash,
    [
      {
        encounter: boss('razorgore', 'Razorgore the Untamed', ENTRY.razorgore,
          'Kill Razorgore. The black dragon eggs are scenery: nothing in the chamber holds his death off.'),
        pos: bossPos(ENTRY.razorgore),
      },
      {
        encounter: boss('vaelastrasz', 'Vaelastrasz the Corrupt', ENTRY.vaelastrasz,
          'Burning Adrenaline lands on the tank every 45 s and on a random mana user every 15 s.'),
        pos: bossPos(ENTRY.vaelastrasz),
      },
      {
        encounter: boss('broodlord-lashlayer', 'Broodlord Lashlayer', ENTRY.lashlayer,
          'Mortal Strike and Blast Wave; he leashes if the raid drops below the platform.'),
        pos: bossPos(ENTRY.lashlayer),
      },
      {
        encounter: boss('firemaw', 'Firemaw', ENTRY.firemaw,
          'Flame Buffet stacks on everyone standing in melee.'),
        pos: bossPos(ENTRY.firemaw),
      },
      {
        encounter: boss('ebonroc', 'Ebonroc', ENTRY.ebonroc,
          'Shadow of Ebonroc heals him for what he hits - the tank has to be swapped.'),
        pos: bossPos(ENTRY.ebonroc),
      },
      {
        encounter: boss('flamegor', 'Flamegor', ENTRY.flamegor,
          'Frenzy every 10 s on top of the shared drake kit.'),
        pos: bossPos(ENTRY.flamegor),
      },
      {
        encounter: boss('chromaggus', 'Chromaggus', ENTRY.chromaggus,
          'A rotating elemental shield halts one school at a time while Brood Affliction stacks.'),
        pos: bossPos(ENTRY.chromaggus),
      },
      {
        encounter: boss('nefarian', 'Nefarian', ENTRY.nefarian,
          'Lord Victor Nefarius drops the mask and lands. At 20 % he raises every dead drakonid.'),
        // Nefarian has no spawn row; the fight is where Nefarius stands.
        pos: bossPos(ENTRY.nefarius),
      },
    ],
    entrance,
  );
}

export const BLACKWING_LAIR: InstanceDef = {
  id: 'blackwing-lair',
  mapId: 469,
  name: 'Blackwing Lair',
  // The entrance areatrigger 3726 sits INSIDE Blackrock Spire (map 229), so its baked
  // fromZone is null and only entranceTriggerId can reach it — docs/archive/raids/PLAN.md §2.3.
  portalZone: 'burningsteppes',
  entranceTriggerId: 3726,
  minLevel: 50,
  // instance_template 469 maxPlayers = 40, reset_delay = 7 days. Cite: mangos.sql:2545-2577.
  maxPlayers: 40,
  levelRange: [60, 63],
  lockoutMs: 7 * 24 * 60 * 60 * 1000,
  description: '',
  encounters: buildEncounters(),
};
