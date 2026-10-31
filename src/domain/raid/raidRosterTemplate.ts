// Per-raid roster templates — a free DEV TEST roster that never touches botRoster or gold; the paid
// inn hire is separate. Size and level come off the InstanceDef; role and class mix from raidComp.

import type { DataStore } from '../../data/dataStore.ts';
import type { InstanceDef } from '../../data/schema/encounter.ts';
import type { GearProfile } from '../bots/botGear.ts';
import { MAX_BOT_LEVEL } from '../bots/botPool.ts';
import { CLASS } from '../../data/schema.ts';
import {
  ensureClassSeat,
  instanceWantsWaterMage,
  raidCompanionSeats,
  raidRoleQuota,
  type RaidRoleQuota,
  type RaidSeat,
} from './raidComp.ts';
import type { SquadRole } from '../bots/squad.ts';

/** Progression tier — PLAN §7.8 names pre-raid / T1 / T2 / T2.5 / T3. */
export type RaidTierId = 'pre-raid' | 't1' | 't2' | 't2.5' | 't3';

export interface RaidTier {
  id: RaidTierId;
  label: string;
  /** The botGear kit every seat is generated at. */
  gear: GearProfile;
}

// The four kits botGear ships, tagged with the progression step each represents. T2 and T2.5 share
// raid-t2: there is no distinct AQ profile, and inventing one is a band with no item data.
export const RAID_TIERS: Record<RaidTierId, RaidTier> = {
  'pre-raid': { id: 'pre-raid', label: 'Pre-raid (dungeon blues)', gear: 'twink' },
  t1: { id: 't1', label: 'T1 (Molten Core / Onyxia)', gear: 'raid-mixed' },
  t2: { id: 't2', label: 'T2 (Blackwing Lair)', gear: 'raid-t2' },
  't2.5': { id: 't2.5', label: 'T2.5 (Ahn’Qiraj)', gear: 'raid-t2' },
  t3: { id: 't3', label: 'T3 (Naxxramas)', gear: 'raid-t3' },
};

// Which tier a raid is ENTERED in — the gear you bring, not the gear it drops. The order is
// Onyxia, MC, ZG, BWL, AQ20, AQ40, Naxx, with UBRS as the 10-man pre-raid step.
const ENTRY_TIER: Readonly<Record<string, RaidTierId>> = {
  ubrs: 'pre-raid',
  'onyxias-lair': 't1',
  'molten-core': 't1',
  'zul-gurub': 't1',
  'blackwing-lair': 't2',
  'ruins-of-ahnqiraj': 't2',
  'temple-of-ahnqiraj': 't2.5',
  naxxramas: 't3',
};

/** The tier ids an override may name. `bis` is not one of them. */
export const RAID_TIER_IDS: readonly RaidTierId[] = Object.keys(RAID_TIERS) as RaidTierId[];

/** Every raid slug that has a roster template, in progression order. */
export const RAID_ROSTER_SLUGS: readonly string[] = Object.keys(ENTRY_TIER);

// The itemLevel window each tier means, DERIVED by walking that tier's own boss loot: floor at the
// 25th percentile, ceiling at the real maximum. Committed because loot-data.json is lazy.
export const RAID_TIER_ITEM_LEVEL: Readonly<Record<RaidTierId, { min: number; max: number }>> = {
  'pre-raid': { min: 61, max: 63 },
  t1: { min: 61, max: 78 },
  t2: { min: 69, max: 83 },
  't2.5': { min: 76, max: 88 },
  t3: { min: 83, max: 92 },
};

/** Raids whose boss loot defines each tier — the input list the derivation script walks. */
export const TIER_SOURCE_RAIDS: Readonly<Record<RaidTierId, readonly string[]>> = {
  'pre-raid': ['ubrs'],
  t1: ['onyxias-lair', 'molten-core', 'zul-gurub'],
  t2: ['blackwing-lair', 'ruins-of-ahnqiraj'],
  't2.5': ['temple-of-ahnqiraj'],
  t3: ['naxxramas'],
};

export interface RaidRosterTemplate {
  dungeonId: string;
  name: string;
  tier: RaidTier;
  /** instance_template maxPlayers, player included. */
  size: number;
  /** Companion seats — size - 1, the player holds the last one. */
  seats: RaidSeat[];
  quota: RaidRoleQuota;
  /** Body level every seat is generated at. */
  level: number;
  /** itemLevel window the kit is picked from — what actually makes T3 differ from T1. */
  itemLevel: { min: number; max: number };
}

/** True when this instance has a raid roster template. */
export function hasRaidRosterTemplate(dungeonId: string): boolean {
  return dungeonId in ENTRY_TIER;
}

/** The tier a raid is entered in, or null for a 5-man. */
export function raidEntryTier(dungeonId: string): RaidTier | null {
  const id = ENTRY_TIER[dungeonId];
  return id ? RAID_TIERS[id] : null;
}

// The full roster template for one raid: who to build, at what level, in what kit. `tier` overrides
// the entry tier, because walking Naxx in T1 to see what happens is a finding, not a knob.
export function raidRosterTemplate(args: {
  ds: DataStore;
  def: InstanceDef;
  playerRace: number;
  playerRole?: SquadRole;
  /** Player class. Used to skip a companion mage when you already are one. */
  playerCls?: number;
  tier?: RaidTierId;
}): RaidRosterTemplate | null {
  const { ds, def, playerRace, playerRole = 'dps', playerCls = 0 } = args;
  const tierId = args.tier ?? ENTRY_TIER[def.id];
  if (!tierId) return null;
  // An unknown override built a template with `tier: undefined` and crashed 20 lines downstream on
  // `tpl.tier.id`; `raid-clear --tier bis` is the flag that found it, and there is no `bis` tier.
  if (!RAID_TIERS[tierId]) return null;
  const size = Math.max(2, def.maxPlayers ?? 0);
  if (size < 2) return null;
  let seats = raidCompanionSeats({ ds, playerRace, playerRole, size });
  if (instanceWantsWaterMage(def.id)) {
    seats = ensureClassSeat(seats, CLASS.MAGE, playerCls);
  }
  return {
    dungeonId: def.id,
    name: def.name,
    tier: RAID_TIERS[tierId],
    size,
    seats,
    quota: raidRoleQuota(size),
    // Raid content is level-cap content: every raid boss in the program is 60+ elite, and a
    // sub-cap body is a measurement of the body, not of the encounter.
    level: MAX_BOT_LEVEL,
    itemLevel: RAID_TIER_ITEM_LEVEL[tierId],
  };
}
