// Pull-time encounter gear: real items, outfitter-shaped, applied before the fight. Never a flat +resist
// buff. Cite: AUTOPILOT-PLAN §4 row 25; SpellEffects.cpp:3756 cloak dummy.

import type { DataStore } from '../../data/dataStore.ts';
import type { EquipSlot, ItemDef } from '../../data/schema.ts';

import type { Character } from '../character/character.ts';
import { equippedEntry } from '../items/itemInstance.ts';
import type { Inventory } from '../items/inventory.ts';
import { addItem, countItem, emptyInventory } from '../items/inventory.ts';
import { canEquipItem } from '../items/itemRestrictions.ts';
import { equipItem } from '../items/equipment.ts';
import { itemStatValue, type OutfitStatId } from '../bots/outfitter.ts';
import { resistances } from '../character/characterStats.ts';
import {
  cloakRequiredForSeat,
  RAID_BOSS_TACTICS,
  tacticsForEntry,
  type GearWho,
  type RaidBossTactics,
  type ResistSchool,
} from './raidEncounterTactics.ts';
import type { Companion } from '../bots/squad.ts';
import { companionCharacter, companionLevel } from '../bots/squad.ts';

const RESIST_STAT: Record<ResistSchool, OutfitStatId> = {
  fire: 'resFire',
  nature: 'resNature',
  frost: 'resFrost',
  shadow: 'resShadow',
};

/** Armor/jewelry slots — never replace the weapon (Viscidus frost weapons are a later row). */
const RESIST_SLOTS: readonly EquipSlot[] = [
  'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist',
  'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'offhand',
];

/** School resistance a seat should reach at this pull — a TARGET, not "as much as possible". */
export interface ResistTarget {
  tank: number;
  healer: number;
  dps: number;
  cite: string;
}

// The raid-wide resistance default when a boss has no number of its own. Every guide states the
// same shape, and without a ceiling the swap strips the whole paperdoll past the level-63 cap.
export const RAID_RESIST_DEFAULT: ResistTarget = {
  tank: 150,
  healer: 100,
  dps: 100,
  cite: 'onyxia_lair_guide.md:256-259; aq20_ruins_of_ahnqiraj_guide.md:387-389',
};

const MC_FIRE: ResistTarget = {
  // Non-tanks cap at the 60-80 buff floor; tanks build toward the cap for the burst fights.
  tank: 200,
  healer: 80,
  dps: 80,
  cite: 'molten_core_mobs_and_bosses.md:128',
};
const BWL_FIRE: ResistTarget = {
  tank: 315,
  healer: 100,
  dps: 150,
  cite: 'blackwing_lair_mobs_and_bosses.md:102-104',
};

// Per-boss BUFFED totals from the raid guides, not gear-only: the swap runs after the pre-pull
// buffs land, so what the guides count is already on the sheet. Absent bosses use the default.
export const RAID_RESIST_TARGET: Readonly<Record<number, ResistTarget>> = {
  10184: { tank: 200, healer: 100, dps: 100, cite: 'onyxia_lair_guide.md:256-259' },
  12118: MC_FIRE, 11982: MC_FIRE, 12259: MC_FIRE, 12057: MC_FIRE, 12264: MC_FIRE,
  12056: MC_FIRE, 11988: MC_FIRE, 12098: MC_FIRE, 12018: MC_FIRE,
  11502: { tank: 315, healer: 80, dps: 80, cite: 'molten_core_mobs_and_bosses.md:130-131,522' },
  13020: BWL_FIRE, 11983: BWL_FIRE, 14601: BWL_FIRE, 11981: BWL_FIRE, 11583: BWL_FIRE,
  15509: { tank: 250, healer: 150, dps: 150, cite: 'aq40_temple_of_ahnqiraj_guide.md:357,398' },
  15275: { tank: 300, healer: 150, dps: 150, cite: 'aq40_temple_of_ahnqiraj_guide.md:69,444' },
  15989: { tank: 315, healer: 210, dps: 210, cite: 'naxxramas_wings_and_mobs.md:573-575' },
};

/** The number this seat is swapping toward at this pull. */
export function resistTargetFor(creatureEntry: number, role: PullGearWearer['role']): number {
  const t = RAID_RESIST_TARGET[creatureEntry | 0] ?? RAID_RESIST_DEFAULT;
  if (role === 'tank') return t.tank;
  if (role === 'healer') return t.healer;
  return t.dps;
}

let resistPool: Map<string, ItemDef[]> | null = null;

function resistKey(school: ResistSchool, slot: EquipSlot): string {
  return `${school}:${slot}`;
}

function buildResistPool(ds: DataStore): Map<string, ItemDef[]> {
  const out = new Map<string, ItemDef[]>();
  for (const it of ds.items()) {
    if (!it.slot || it.notObtainable) continue;
    for (const school of Object.keys(RESIST_STAT) as ResistSchool[]) {
      const n = itemStatValue(it, undefined, RESIST_STAT[school], ds);
      if (n <= 0) continue;
      const slots = it.slot === 'finger' ? (['finger1', 'finger2'] as EquipSlot[])
        : it.slot === 'trinket' ? (['trinket1', 'trinket2'] as EquipSlot[])
          : it.slot === 'bag' ? []
            // 'twohand' is an ItemSlot with no EquipSlot of its own (a two-hander lives in
            // mainhand), and RESIST_SLOTS carries no weapon, so it contributes nothing.
            : it.slot === 'twohand' ? []
              : [it.slot];
      for (const slot of slots) {
        if (!RESIST_SLOTS.includes(slot)) continue;
        const k = resistKey(school, slot);
        const list = out.get(k) ?? [];
        list.push(it);
        out.set(k, list);
      }
    }
  }
  for (const list of out.values()) {
    list.sort((a, b) => (b.itemLevel ?? 0) - (a.itemLevel ?? 0));
  }
  return out;
}

function poolFor(ds: DataStore, school: ResistSchool, slot: EquipSlot): ItemDef[] {
  if (!resistPool) resistPool = buildResistPool(ds);
  return resistPool.get(resistKey(school, slot)) ?? [];
}

export interface PullGearWearer {
  char: Character;
  inventory: Inventory;
  role: 'tank' | 'healer' | 'dps' | 'damage' | undefined;
}

function ensureInBags(inv: Inventory, entry: number, ds: DataStore): Inventory {
  if (countItem(inv, entry) > 0) return inv;
  const it = ds.item(entry);
  return addItem(inv, entry, 1, it?.stackable ?? 1);
}

function wearEntry(
  wearer: PullGearWearer,
  ds: DataStore,
  entry: number,
  preferred?: EquipSlot,
): PullGearWearer {
  const it = ds.item(entry);
  if (!it) return wearer;
  if (!canEquipItem(wearer.char, it, ds)) return wearer;
  if (preferred && equippedEntry(wearer.char.equipped[preferred]) === entry) return wearer;
  let inv = ensureInBags(wearer.inventory, entry, ds);
  const r = equipItem(wearer.char, inv, ds, entry, preferred);
  if (!r.ok) return wearer;
  return { char: r.char, inventory: r.inventory, role: wearer.role };
}

function applyCloak(wearer: PullGearWearer, tactics: RaidBossTactics, ds: DataStore): PullGearWearer {
  if (!cloakRequiredForSeat(tactics, wearer.role) || !tactics.cloak) return wearer;
  return wearEntry(wearer, ds, tactics.cloak.item, 'back');
}

function applyResist(
  wearer: PullGearWearer,
  school: ResistSchool,
  ds: DataStore,
  skipBack: boolean,
  target: number,
): PullGearWearer {
  const stat = RESIST_STAT[school];
  let next = wearer;
  // Running total, seeded from what the seat already has and stepped by each swap's delta, so the
  // walk stops at the target instead of recomputing the whole sheet 15 times per body.
  let total = resistances(next.char, ds)[school] ?? 0;
  for (const slot of RESIST_SLOTS) {
    if (total >= target) break;
    if (skipBack && slot === 'back') continue;
    const curEntry = equippedEntry(next.char.equipped[slot]);
    const cur = curEntry != null ? ds.item(curEntry) : undefined;
    const curVal = cur ? itemStatValue(cur, undefined, stat, ds) : 0;
    let best: ItemDef | undefined;
    let bestVal = curVal;
    // No itemLevel floor. Resist gear IS lower itemLevel than the tier kit, so a never-downgrade
    // guard cancelled the swap exactly where the fight demands it. Equal resistance still ranks.
    for (const it of poolFor(ds, school, slot)) {
      if (!canEquipItem(next.char, it, ds)) continue;
      const v = itemStatValue(it, undefined, stat, ds);
      if (v <= bestVal) continue;
      best = it;
      bestVal = v;
    }
    if (best && best.entry !== curEntry) {
      const before = next;
      next = wearEntry(next, ds, best.entry, slot);
      if (next !== before) total += bestVal - curVal;
    }
  }
  return next;
}

/** Apply cloak + resist set for this creature entry onto one wearer. */
export function applyEncounterPullGear(
  wearer: PullGearWearer,
  ds: DataStore,
  creatureEntry: number,
): PullGearWearer {
  const tactics = tacticsForEntry(creatureEntry);
  if (!tactics) return wearer;
  let next = wearer;
  if (tactics.cloak) next = applyCloak(next, tactics, ds);
  if (tactics.resist) {
    next = applyResist(
      next,
      tactics.resist,
      ds,
      cloakRequiredForSeat(tactics, next.role),
      resistTargetFor(creatureEntry, next.role),
    );
  }
  return next;
}

export function applyEncounterPullGearToPlayer(
  char: Character,
  inventory: Inventory,
  ds: DataStore,
  creatureEntry: number,
  role: PullGearWearer['role'],
): { char: Character; inventory: Inventory } {
  const out = applyEncounterPullGear({ char, inventory, role }, ds, creatureEntry);
  return { char: out.char, inventory: out.inventory };
}

export function applyEncounterPullGearToCompanion(
  comp: Companion,
  ds: DataStore,
  creatureEntry: number,
  playerLevel: number,
): Companion {
  const lvl = companionLevel(comp, playerLevel);
  const char = companionCharacter(comp, lvl, ds);
  const inv = comp.bags ?? emptyInventory();
  const out = applyEncounterPullGear(
    { char, inventory: inv, role: comp.role },
    ds,
    creatureEntry,
  );
  return {
    ...comp,
    equipped: out.char.equipped,
    bags: out.inventory,
    ...(out.char.durability ? { durability: out.char.durability } : {}),
  };
}

/** One-line player-facing summary for the rotation editor. */
export function encounterGearSummary(creatureEntry: number): string | null {
  const t = tacticsForEntry(creatureEntry);
  if (!t) return null;
  const bits: string[] = [];
  if (t.cloak) {
    bits.push(
      t.cloak.who === 'raid'
        ? 'Onyxia Scale Cloak on the raid'
        : 'Onyxia Scale Cloak on tanks',
    );
  }
  if (t.resist) bits.push(`${t.resist} resistance gear`);
  return bits.length ? bits.join('; ') : null;
}

/** One fight's pull-time kit, for the editor to render as a row rather than a sentence. */
export interface RaidGearFight {
  slug: string;
  bossName: string;
  /** Who the cloak goes on, when this fight needs one. */
  cloak?: GearWho;
  resist?: ResistSchool;
}

// Every auto pull-time set, as data. This used to be one joined sentence naming 22 resistance bosses, which
// the editor printed as an unbounded paragraph above the raid seat list.
export function raidEncounterGearFights(): readonly RaidGearFight[] {
  const out: RaidGearFight[] = [];
  for (const t of RAID_BOSS_TACTICS) {
    if (!t.cloak && !t.resist) continue;
    out.push({
      slug: t.slug,
      bossName: t.name,
      ...(t.cloak ? { cloak: t.cloak.who } : {}),
      ...(t.resist ? { resist: t.resist } : {}),
    });
  }
  return out;
}


