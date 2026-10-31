// Wave V — DB-sourced EventAI overlays for LOCK-8 proving bosses, attached at combat build time.
// Authority: creature_ai_scripts / creature_ai_summons / creature_template. Never invent ids.

import type { CreatureAiBundle, CreatureDef } from '../../schema.ts';
import { worldBossTemplateFor } from '../../../domain/creature/worldBosses.ts';
import { overlays as ragefireChasmOverlays } from './ragefire-chasm.ts';
import { overlays as wailingCavernsOverlays } from './wailing-caverns.ts';
import { overlays as deadminesOverlays } from './deadmines.ts';
import { overlays as shadowfangKeepOverlays } from './shadowfang-keep.ts';
import { overlays as theStockadeOverlays } from './the-stockade.ts';
import { overlays as blackfathomDeepsOverlays } from './blackfathom-deeps.ts';
import { overlays as gnomereganOverlays } from './gnomeregan.ts';
import { overlays as razorfenKraulOverlays } from './razorfen-kraul.ts';
import { overlays as smGraveyardOverlays } from './sm-graveyard.ts';
import { overlays as smLibraryOverlays } from './sm-library.ts';
import { overlays as smCathedralOverlays } from './sm-cathedral.ts';
import {
  overlays as razorfenDownsOverlays,
  summonOnly as razorfenDownsSummonOnly,
} from './razorfen-downs.ts';
import { overlays as uldamanOverlays } from './uldaman.ts';
import {
  overlays as zulFarrakOverlays,
  summonOnly as zulFarrakSummonOnly,
} from './zul-farrak.ts';
import { overlays as maraudonOverlays } from './maraudon.ts';
import { overlays as sunkenTempleOverlays } from './sunken-temple.ts';
import {
  overlays as blackrockDepthsOverlays,
  summonOnly as blackrockDepthsSummonOnly,
} from './blackrock-depths.ts';
import { overlays as lbrsOverlays } from './lbrs.ts';
import { overlays as ubrsOverlays } from './ubrs.ts';
import { overlays as direMaulEastOverlays } from './dire-maul-east.ts';
import { overlays as scholomanceOverlays } from './scholomance.ts';
import { overlays as stratholmeUndeadOverlays } from './stratholme-undead.ts';

/** Concatenate per-dungeon entries; throw on duplicate keys (no last-write-wins). */
export function mergeUniqueEntries<T>(
  chunks: ReadonlyArray<ReadonlyArray<readonly [number, T]>>,
  kind: string,
): ReadonlyMap<number, T> {
  const out = new Map<number, T>();
  for (const chunk of chunks) {
    for (const pair of chunk) {
      const entry = pair[0];
      const value = pair[1];
      if (out.has(entry)) {
        throw new Error(`duplicate EventAI ${kind} entry ${entry}`);
      }
      out.set(entry, value);
    }
  }
  return out;
}

// Summon-only templates absent from the creatures bake, with stats taken from exact
// creature_template columns. Faction 16 for the BRD ring trash stubs, matching the bake residents.
export const SUMMON_ONLY_TEMPLATES: ReadonlyMap<number, CreatureDef> = mergeUniqueEntries(
  [
    zulFarrakSummonOnly,
    razorfenDownsSummonOnly,
    blackrockDepthsSummonOnly,
  ],
  'summon-only template',
);

/** Lookup summon-only template (overlay) or undefined. */
export function summonOnlyTemplate(entry: number): CreatureDef | undefined {
  return SUMMON_ONLY_TEMPLATES.get(entry | 0);
}

// Every creature entry targeted by Wave-V overlay SUMMON_ID / SPAWN actions, derived from the
// overlay scripts. Keep in sync when adding a summon action.
export const WAVE_V_SUMMON_ENTRIES: readonly number[] = [
  8138, // Antu'sul SUMMON_ID broodling
  8156, // Antu'sul SPAWN servant
  8585, // Amnennar SPAWN Frost Spectre
  5721, // Jammal'an death SUMMON_ID Dreamscythe (bake)
  5720, // Jammal'an death SUMMON_ID Weaver (bake)
  11197, // Baron Rivendare Raise Dead → Mindless Skeleton (bake)
  8901, // Angerforge Alarm SPAWN Anvilrage Reservist (bake)
  8894, // Angerforge Alarm SPAWN Anvilrage Medic (bake)
  8911, // Flamelash aggro SPAWN Fireguard Destroyer (bake)
  12238, // Theradras death SUMMON_ID Zaetar's Spirit
  11460, // Alzzin 40% SUMMON_ID minions
  13716, // Celebras death SUMMON_ID Celebras the Redeemed
  7787, // Ukorz 30% SUMMON_ID Sandfury Slave
  10268, // Halycon death SUMMON_ID Gizrul
];

/** creature_template.entry → EventAI overlay for LOCK-8 proving bosses. */
export const BOSS_EVENTAI_OVERLAYS: ReadonlyMap<number, CreatureAiBundle> = mergeUniqueEntries(
  [
    ragefireChasmOverlays,
    wailingCavernsOverlays,
    deadminesOverlays,
    shadowfangKeepOverlays,
    theStockadeOverlays,
    blackfathomDeepsOverlays,
    gnomereganOverlays,
    razorfenKraulOverlays,
    smGraveyardOverlays,
    smLibraryOverlays,
    smCathedralOverlays,
    razorfenDownsOverlays,
    uldamanOverlays,
    zulFarrakOverlays,
    maraudonOverlays,
    sunkenTempleOverlays,
    blackrockDepthsOverlays,
    lbrsOverlays,
    ubrsOverlays,
    direMaulEastOverlays,
    scholomanceOverlays,
    stratholmeUndeadOverlays,
  ],
  'overlay',
);

/** Return EventAI overlay for a creature entry, if any. */
export function bossEventAiOverlay(entry: number): CreatureAiBundle | undefined {
  return BOSS_EVENTAI_OVERLAYS.get(entry | 0);
}

// Resolve a creature def for combat: bake first, then summon-only overlay templates, then Wave-T
// world-boss templates. Generic in the bake row so a narrower `creature()` still resolves here.
export function resolveCreatureDefForCombat<T>(
  entry: number,
  lookup: (id: number) => T | undefined,
): T | CreatureDef | undefined {
  return lookup(entry) ?? summonOnlyTemplate(entry) ?? worldBossTemplateFor(entry);
}
