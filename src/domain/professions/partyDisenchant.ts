// Who in the group breaks a bagged item down, and what a "disenchant every green" pass destroys.
// The mats always land in the player's bags; only the Enchanting line belongs to the worker.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef, SkillLine } from '../../data/schema.ts';
import type { Rng } from '../../engine/core/rng.ts';
import type { Character } from '../character/character.ts';
import type { CompanionProfessionMap } from '../bots/companionMissions.ts';
import type { Inventory } from '../items/inventory.ts';
import type { LootDrop } from '../items/loot.ts';
import type { Companion } from '../bots/squad.ts';
import type { PartyEnchanter } from './autoDisenchant.ts';
import { countItem } from '../items/inventory.ts';
import { companionCharacter, companionLevel, companionSkillMap } from '../bots/squad.ts';
import {
  canDisenchant,
  disenchantInto as doDisenchantInto,
  disenchantRuleFor,
  isDisenchantable,
} from './enchanting.ts';
import { nearestPartyWorker, partyWorkRefusalReason, type PartyWorker } from './partyWork.ts';

const ENCHANTING: SkillLine = 'enchanting';

/** The body that swings at it. `id` absent = the player. */
export interface DisenchantPick {
  kind: 'player' | 'companion';
  id?: string;
  name: string;
  /** Enchanting value they were accepted on. */
  skill: number;
}

export type PartyDisenchantCheck =
  | { ok: true; who: DisenchantPick }
  /** `item` = no skill could ever help (not gear, grey, no yield band). `skill` = nobody reaches it. */
  | { ok: false; reason: string; kind: 'item' | 'skill' };

// Every enchanter the PLAYER may hand an item to: you, the squad, the raid roster and benched
// companions. Player first, so a skill-up prefers your own line. Someone on a mission is not here.
export function resolveRosterEnchanters(
  player: Character,
  squad: readonly Companion[] | undefined,
  botRoster: Readonly<Record<string, Companion>> | undefined,
  raidMembers: Readonly<Record<string, Companion>> | undefined,
  ds: DataStore,
): PartyEnchanter[] {
  const out: PartyEnchanter[] = [{ kind: 'player', char: player }];
  const seen = new Set<string>();
  const push = (comp: Companion): void => {
    if (seen.has(comp.id) || comp.mission) return;
    seen.add(comp.id);
    const lvl = companionLevel(comp, player.level);
    out.push({ kind: 'companion', comp, char: companionCharacter(comp, lvl, ds) });
  };
  for (const c of squad ?? []) push(c);
  for (const c of Object.values(raidMembers ?? {})) push(c);
  for (const c of Object.values(botRoster ?? {})) push(c);
  return out;
}

/** The first enchanter in `enchanters` who can break `entry` down right now, or null. */
export function pickDisenchanter(
  entry: number,
  inv: Inventory,
  ds: DataStore,
  enchanters: readonly PartyEnchanter[],
): DisenchantPick | null {
  for (const e of enchanters) {
    if (!canDisenchant(e.char, inv, ds, entry).ok) continue;
    const skill = e.char.skills[ENCHANTING]?.current ?? 0;
    return e.kind === 'player'
      ? { kind: 'player', name: e.char.name || 'You', skill }
      : { kind: 'companion', id: e.comp.id, name: e.comp.name, skill };
  }
  return null;
}

/** Does anyone in the group hold Enchanting at all? Decides whether a refusal is worth showing. */
export function groupHasEnchanting(enchanters: readonly PartyEnchanter[]): boolean {
  return enchanters.some((e) => e.char.skills[ENCHANTING] != null);
}

/** Everyone in `enchanters` who holds the Enchanting line at all, for an honest refusal. */
function enchantingHolders(enchanters: readonly PartyEnchanter[]): PartyWorker[] {
  const out: PartyWorker[] = [];
  for (const e of enchanters) {
    const s = e.char.skills[ENCHANTING];
    if (!s) continue;
    out.push({
      ...(e.kind === 'companion' ? { compId: e.comp.id } : {}),
      name: e.kind === 'player' ? (e.char.name || 'You') : e.comp.name,
      skill: s.current,
      max: s.max,
      gainTenths: 0,
    });
  }
  return out;
}

/** Item gates no one's skill can change, in the order canDisenchant states them. */
function disenchantItemGate(
  entry: number, inv: Inventory, ds: DataStore,
): { item: ItemDef } | { reason: string } {
  if (countItem(inv, entry) <= 0) return { reason: "You don't have that" };
  const item = ds.item(entry);
  if (!item) return { reason: 'Unknown item' };
  if (!isDisenchantable(item)) return { reason: 'Only weapons and armor can be disenchanted' };
  if (item.quality < 2) return { reason: 'Only uncommon or better gear can be disenchanted' };
  if (!disenchantRuleFor(item, ds)) return { reason: 'That yields no enchanting materials' };
  return { item };
}

// Can the GROUP break `entry` down, and who does it? The refusal names the closest enchanter,
// since a bare "Requires Enchanting" is false the moment anyone but the player holds the line.
export function partyDisenchantCheck(
  entry: number,
  inv: Inventory,
  ds: DataStore,
  enchanters: readonly PartyEnchanter[],
): PartyDisenchantCheck {
  const gate = disenchantItemGate(entry, inv, ds);
  if ('reason' in gate) return { ok: false, reason: gate.reason, kind: 'item' };
  const who = pickDisenchanter(entry, inv, ds, enchanters);
  if (who) return { ok: true, who };
  const req = disenchantRuleFor(gate.item, ds)?.reqSkill ?? 0;
  const near = nearestPartyWorker(enchantingHolders(enchanters), req);
  return { ok: false, reason: partyWorkRefusalReason('Enchanting', near), kind: 'skill' };
}

export interface PartyDisenchantOutcome {
  ok: true;
  /** The player after the act — unchanged when a companion swung at it. */
  char: Character;
  inventory: Inventory;
  yielded: LootDrop[];
  skillUp?: number;
  /** New professions map for the companion worker, when they gained a point. Engine assigns it. */
  companionProfessions?: CompanionProfessionMap;
  /** The holder's bags minus the gear, when `holderBags` named them. Engine writes it back. */
  holderBags?: Inventory;
}

// Break `entry` down as `who`. A companion rolls their own line and the point is written into
// Companion.professions, freezing the seed-derived set first or the arrival set is wiped.
export function runPartyDisenchant(args: {
  who: DisenchantPick;
  /** The companion worker; required when `who.kind === 'companion'`. */
  comp?: Companion;
  player: Character;
  inventory: Inventory;
  ds: DataStore;
  entry: number;
  rng: Rng;
  cap?: number;
  /** One specific bag stack. Omitted = the first stack of `entry` (single-click path). */
  slot?: number;
  /** A companion's bags hold the gear. `slot` indexes THESE; the mats still land in `inventory`. */
  holderBags?: Inventory;
}): PartyDisenchantOutcome | { ok: false; reason: string } {
  const { who, comp, player, inventory, ds, entry, rng, cap, slot, holderBags } = args;
  const source = holderBags ?? inventory;
  const opts = { ...(slot != null ? { slot } : {}), ...(cap != null ? { intoCap: cap } : {}) };
  if (who.kind === 'player') {
    const res = doDisenchantInto(player, source, inventory, ds, entry, rng, opts);
    if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot disenchant' };
    return {
      ok: true,
      char: res.char,
      inventory: res.into,
      yielded: res.yielded,
      ...(res.skillUp != null ? { skillUp: res.skillUp } : {}),
      ...(holderBags ? { holderBags: res.from } : {}),
    };
  }
  if (!comp) return { ok: false, reason: `${who.name} is not with you` };
  const lvl = companionLevel(comp, player.level);
  const shell = companionCharacter(comp, lvl, ds);
  const res = doDisenchantInto(shell, source, inventory, ds, entry, rng, opts);
  if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot disenchant' };
  const out: PartyDisenchantOutcome = {
    ok: true,
    char: player,
    inventory: res.into,
    yielded: res.yielded,
    ...(res.skillUp != null ? { skillUp: res.skillUp } : {}),
    ...(holderBags ? { holderBags: res.from } : {}),
  };
  const gained = res.char.skills[ENCHANTING];
  if (res.skillUp != null && gained) {
    const skills = companionSkillMap(comp, lvl);
    let base = comp.professions;
    if (base == null || Object.keys(base).length === 0) {
      const frozen: CompanionProfessionMap = {};
      for (const k of Object.keys(skills) as SkillLine[]) {
        const cur = skills[k];
        if (cur) frozen[k] = cur.current;
      }
      base = frozen;
    }
    out.companionProfessions = { ...base, [ENCHANTING]: gained.current };
  }
  return out;
}

// One line of the bulk-disenchant confirm list — one row IS one bag stack. Keyed by slot, not
// entry: two same-name greens with different suffixes are two different items.
export interface BulkDisenchantRow {
  /** Bag slot index — the row IS this stack. */
  slot: number;
  /** Companion whose bags hold it. Absent = your own bags. */
  owner?: string;
  ownerName?: string;
  entry: number;
  /** How many copies this stack holds. */
  qty: number;
  quality: number;
  itemLevel: number;
  who: DisenchantPick;
  /** Why this row starts switched OFF (quest item, still an upgrade). Absent = on. */
  warn?: string;
  /** This stack's rolled suffix, so the confirm list names exactly what it will destroy. */
  randomPropertyId?: number;
}

/** Stable per-stack id for the on/off set. Mirrors sellAllRowKey. */
export function bulkDisenchantRowKey(row: Pick<BulkDisenchantRow, 'slot' | 'entry' | 'owner'>): string {
  return `${row.owner ?? ''}:${row.slot}:${row.entry}`;
}

export interface PlanBulkDisenchantArgs {
  inventory: Inventory;
  /** Exactly this quality band: 2 green, 3 blue, 4 epic. */
  quality: number;
  enchanters: readonly PartyEnchanter[];
  ds: DataStore;
  /** Entries a quest still needs — listed, but off by default (destroying one reverts it). */
  questProtected?: ReadonlySet<number>;
  /** Entries still an upgrade for you or a companion — listed, but off by default. */
  upgradeEntries?: ReadonlySet<number>;
  /** Companion these bags belong to. Stamped on every row so the run knows whose stack to pull. */
  owner?: { id: string; name: string };
}

// Everything of one quality band the group could break down right now, best item level first.
// Nothing is destroyed here: the caller shows the list. A row nobody can DE is not listed.
export function planBulkDisenchant(args: PlanBulkDisenchantArgs): BulkDisenchantRow[] {
  const { inventory, quality, enchanters, ds } = args;
  const rows: BulkDisenchantRow[] = [];
  inventory.stacks.forEach((stk, slot) => {
    const item = ds.item(stk.item);
    if (!item || item.quality !== quality) return;
    const who = pickDisenchanter(stk.item, inventory, ds, enchanters);
    if (!who) return;
    const warn = args.questProtected?.has(stk.item)
      ? 'Needed for a quest'
      : args.upgradeEntries?.has(stk.item) ? 'Still an upgrade' : undefined;
    rows.push({
      slot,
      entry: stk.item,
      qty: stk.count,
      quality,
      itemLevel: item.itemLevel ?? 0,
      who,
      ...(warn ? { warn } : {}),
      ...(args.owner ? { owner: args.owner.id, ownerName: args.owner.name } : {}),
      ...(stk.randomPropertyId != null && stk.randomPropertyId > 0
        ? { randomPropertyId: stk.randomPropertyId }
        : {}),
    });
  });
  // Sort for reading only; the executor re-sorts by slot descending so a removal cannot shift a
  // slot it has not reached yet.
  rows.sort((a, b) => (b.itemLevel - a.itemLevel)
    || (ds.item(a.entry)?.name ?? '').localeCompare(ds.item(b.entry)?.name ?? '')
    || (a.slot - b.slot));
  return rows;
}

/** Rows the player left switched on. Keyed per stack, so one tile never speaks for another. */
export function activeBulkDisenchantRows(
  rows: readonly BulkDisenchantRow[],
  blocked: ReadonlySet<string> | readonly string[],
): BulkDisenchantRow[] {
  const skip = blocked instanceof Set ? blocked : new Set(blocked);
  return rows.filter((r) => !skip.has(bulkDisenchantRowKey(r)));
}

/** How many individual items a confirm would destroy (stacks counted out). */
export function bulkDisenchantCount(rows: readonly BulkDisenchantRow[]): number {
  let n = 0;
  for (const r of rows) n += r.qty;
  return n;
}
