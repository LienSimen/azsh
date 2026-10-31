// Party Ritual of Summoning (698) as a product shortcut: with a group warlock who knows it and
// nobody in combat, right-click a member to snap them over. The Soul Shard still applies.

import type { DataStore } from '../../data/dataStore.ts';
import type { Inventory } from '../items/inventory.ts';
import { countItem, removeItem } from '../items/inventory.ts';
import { SOUL_SHARD_ITEM } from '../core/ids.ts';
import { isAllySide, allyIndexOfSide } from '../../engine/core/events.ts';
import type { SpellBook } from '../character/spellbook.ts';
import { knows } from '../character/spellbook.ts';
import {
  companionLevel,
  companionSpellbook,
  type Companion,
} from '../bots/squad.ts';

/** Ritual of Summoning — trainer 1009 at reqLevel 20. */
export const RITUAL_OF_SUMMONING_SPELL_ID = 698;

export interface PartySummonCaster {
  /** `player` or `ally_N` (human companion only). */
  side: string;
  name: string;
  hasShard: boolean;
  shardCount: number;
}

export interface PartySummonTargetOpts {
  /** Session side under the cursor (`player` | `ally_N` | `pet`). */
  targetSide: string;
  targetName: string;
  targetDead: boolean;
  /** Companion-pet sides (not summon targets). */
  companionPetSides?: ReadonlySet<string> | readonly string[];
  /** True while any hostile is engaged. */
  inCombat: boolean;
  player: { name: string; spellbook: SpellBook; inventory: Inventory };
  playerLevel: number;
  squad: readonly Companion[];
  ds: DataStore;
}

export interface PartySummonOption {
  spellId: number;
  spellName: string;
  caster: PartySummonCaster;
  /** Can fire now (OOC, living non-pet target ≠ caster, has shard). */
  pickable: boolean;
  /** Short sub-line: '', 'in combat', 'need Soul Shard', 'dead', 'self', 'pet'. */
  hint: string;
}

/** Living non-pet party members a warlock may summon (not the caster, not pets). */
export function isPartySummonTargetSide(
  side: string,
  companionPetSides?: ReadonlySet<string> | readonly string[],
): boolean {
  if (side === 'player') return true;
  if (side === 'pet') return false;
  if (!isAllySide(side)) return false;
  if (!companionPetSides) return true;
  // instanceof Set does not narrow ReadonlySet — test for the method instead.
  if ('has' in companionPetSides) return !companionPetSides.has(side);
  return !companionPetSides.includes(side);
}

// Group members who know Ritual of Summoning (player + human companions). Prefer casters who still hold a
// Soul Shard, then player, then ally order.
export function partySummonCasters(opts: {
  player: { name: string; spellbook: SpellBook; inventory: Inventory };
  playerLevel: number;
  squad: readonly Companion[];
  ds: DataStore;
}): PartySummonCaster[] {
  const out: PartySummonCaster[] = [];
  if (knows(opts.player.spellbook, RITUAL_OF_SUMMONING_SPELL_ID)) {
    const n = countItem(opts.player.inventory, SOUL_SHARD_ITEM);
    out.push({
      side: 'player',
      name: opts.player.name,
      hasShard: n >= 1,
      shardCount: n,
    });
  }
  const squad = opts.squad ?? [];
  for (let i = 0; i < squad.length; i++) {
    const comp = squad[i]!;
    const lvl = companionLevel(comp, opts.playerLevel);
    const sb = companionSpellbook(comp, lvl, opts.ds);
    if (!knows(sb, RITUAL_OF_SUMMONING_SPELL_ID)) continue;
    const bags = comp.bags ?? { stacks: [] };
    const n = countItem(bags, SOUL_SHARD_ITEM);
    out.push({
      side: `ally_${i}`,
      name: comp.name,
      hasShard: n >= 1,
      shardCount: n,
    });
  }
  out.sort((a, b) => {
    if (a.hasShard !== b.hasShard) return a.hasShard ? -1 : 1;
    if (a.side === 'player') return -1;
    if (b.side === 'player') return 1;
    return a.side.localeCompare(b.side);
  });
  return out;
}

/** Best summon option for one party unit, or null when no warlock knows 698. */
export function partySummonOption(opts: PartySummonTargetOpts): PartySummonOption | null {
  const casters = partySummonCasters(opts);
  if (casters.length === 0) return null;

  const spell = opts.ds.spell(RITUAL_OF_SUMMONING_SPELL_ID);
  const spellName = spell?.name ?? 'Ritual of Summoning';
  const spellId = RITUAL_OF_SUMMONING_SPELL_ID;

  // Prefer a caster other than the target; fall back to first if every warlock is the target.
  const caster = casters.find((c) => c.side !== opts.targetSide) ?? casters[0]!;

  let hint = '';
  let pickable = true;
  if (opts.inCombat) {
    pickable = false;
    hint = 'out of combat only';
  } else if (opts.targetDead) {
    pickable = false;
    hint = 'dead';
  } else if (!isPartySummonTargetSide(opts.targetSide, opts.companionPetSides)) {
    pickable = false;
    hint = 'pet';
  } else if (opts.targetSide === caster.side) {
    pickable = false;
    hint = 'self';
  } else if (!caster.hasShard) {
    pickable = false;
    hint = 'need Soul Shard';
  }

  return { spellId, spellName, caster, pickable, hint };
}

// Debit one Soul Shard from the caster's bags. Mutates player inventory or companion bags on the objects
// you pass (caller owns game state). Returns false if none left.
export function takeSoulShardForSummon(
  casterSide: string,
  playerInv: Inventory,
  squad: Companion[],
): { ok: true; inventory?: Inventory } | { ok: false; reason: string } {
  if (casterSide === 'player') {
    if (countItem(playerInv, SOUL_SHARD_ITEM) < 1) {
      return { ok: false, reason: 'Need a Soul Shard' };
    }
    const [next, n] = removeItem(playerInv, SOUL_SHARD_ITEM, 1);
    if (n < 1) return { ok: false, reason: 'Need a Soul Shard' };
    return { ok: true, inventory: next };
  }
  // `startsWith('ally_')` accepted `ally_abc`, whose Number() is NaN and whose squad lookup then
  // refused one line later. allyIndexOfSide validates the digits, so the refusal is up front.
  const i = allyIndexOfSide(casterSide);
  const comp = i >= 0 ? squad[i] : undefined;
  if (!comp) return { ok: false, reason: 'Invalid caster' };
  const bags = comp.bags ?? { stacks: [] };
  if (countItem(bags, SOUL_SHARD_ITEM) < 1) {
    return { ok: false, reason: 'Need a Soul Shard' };
  }
  const [next, n] = removeItem(bags, SOUL_SHARD_ITEM, 1);
  if (n < 1) return { ok: false, reason: 'Need a Soul Shard' };
  comp.bags = next;
  return { ok: true };
}

/** Combat-yard dest ~1.5 yd beside the warlock (or on them if snap fails). */
export function summonDestBeside(
  casterPos: { x: number; y: number; z?: number },
  snap?: (p: { x: number; y: number; z?: number }, refZ?: number | null) =>
    | { x: number; y: number; z?: number }
    | null
    | undefined,
): { x: number; y: number; z?: number } {
  const raw = { x: casterPos.x + 1.5, y: casterPos.y, z: casterPos.z };
  const snapped = snap?.(raw, casterPos.z ?? null) ?? null;
  if (snapped) {
    return snapped.z == null && casterPos.z != null
      ? { ...snapped, z: casterPos.z }
      : snapped;
  }
  const onCaster = snap?.(
    { x: casterPos.x, y: casterPos.y, z: casterPos.z },
    casterPos.z ?? null,
  );
  if (onCaster) {
    return onCaster.z == null && casterPos.z != null
      ? { ...onCaster, z: casterPos.z }
      : onCaster;
  }
  return raw;
}
