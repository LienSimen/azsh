// Party vault — virtual shared storage over the player and every companion bag and bank. Items
// still live in a real Inventory; this only resolves counts and moves across those sources.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../character/character.ts';
import type { Inventory } from '../items/inventory.ts';
import {
  addInstance,
  addItem,
  canFit,
  canFitInstance,
  countItem,
  emptyInventory,
  removeItem,
  takeStack,
} from '../items/inventory.ts';
import { bagCapacity } from '../items/equipment.ts';
import { isConjuredItem, resolveBonding, shouldBindOnTrigger } from '../items/itemBonding.ts';
import { bankCapacity, type BankBags } from '../items/bank.ts';
import type { Companion } from '../bots/squad.ts';
import { companionCharacter, companionLevel } from '../bots/squad.ts';

export type VaultSourceKind =
  | 'player-bags'
  | 'player-bank'
  | 'comp-bags'
  | 'comp-bank';

export interface VaultSource {
  kind: VaultSourceKind;
  /** Companion id when kind is comp-*; undefined for player. */
  companionId?: string;
  label: string;
  inv: Inventory;
  capacity: number;
}

export interface VaultMutators {
  setPlayerInventory(inv: Inventory): void;
  setPlayerBank(inv: Inventory): void;
  setCompanionBags(id: string, inv: Inventory): void;
  setCompanionBank(id: string, inv: Inventory): void;
}

export interface PartyVaultCtx {
  char: Character;
  inventory: Inventory;
  bank: Inventory;
  bankBags: BankBags;
  /** Active + benched bodies. */
  companions: readonly Companion[];
  playerLevel: number;
  ds: DataStore;
}

function companionCap(comp: Companion, playerLevel: number, ds: DataStore): number {
  const lvl = companionLevel(comp, playerLevel);
  return bagCapacity(companionCharacter(comp, lvl, ds), ds);
}

// A source whose capacity is computed on first read, then cached. Only the deposit fit check reads
// it, and building a Character per body cost an 80-body bench 80 discarded builds per repaint.
function lazySource(base: Omit<VaultSource, 'capacity'>, cap: () => number): VaultSource {
  let cached: number | undefined;
  return {
    ...base,
    get capacity(): number {
      if (cached === undefined) cached = cap();
      return cached;
    },
  };
}

/** Ordered sources for deposit preference (crafter first when preferredId set). */
export function listVaultSources(ctx: PartyVaultCtx, preferredCompanionId?: string): VaultSource[] {
  const out: VaultSource[] = [];
  const comps = [...ctx.companions];
  if (preferredCompanionId) {
    comps.sort((a, b) => {
      if (a.id === preferredCompanionId) return -1;
      if (b.id === preferredCompanionId) return 1;
      return 0;
    });
  }
  for (const c of comps) {
    out.push(lazySource({
      kind: 'comp-bags',
      companionId: c.id,
      label: `${c.name}'s bags`,
      inv: c.bags ?? emptyInventory(),
    }, () => companionCap(c, ctx.playerLevel, ctx.ds)));
  }
  out.push(lazySource({
    kind: 'player-bags',
    label: 'Your bags',
    inv: ctx.inventory,
  }, () => bagCapacity(ctx.char, ctx.ds)));
  for (const c of comps) {
    out.push(lazySource({
      kind: 'comp-bank',
      companionId: c.id,
      label: `${c.name}'s bank`,
      inv: c.bank ?? emptyInventory(),
    }, () => bankCapacity(c.bankBags ?? [], ctx.ds)));
  }
  out.push(lazySource({
    kind: 'player-bank',
    label: 'Your bank',
    inv: ctx.bank,
  }, () => bankCapacity(ctx.bankBags, ctx.ds)));
  return out;
}

/** Total count of an item across the whole party. */
export function partyCount(ctx: PartyVaultCtx, itemEntry: number): number {
  let n = 0;
  for (const s of listVaultSources(ctx)) n += countItem(s.inv, itemEntry);
  return n;
}

/** Write a source's inventory back through mutators. */
function writeSource(
  src: VaultSource,
  inv: Inventory,
  mut: VaultMutators,
): void {
  if (src.kind === 'player-bags') mut.setPlayerInventory(inv);
  else if (src.kind === 'player-bank') mut.setPlayerBank(inv);
  else if (src.kind === 'comp-bags' && src.companionId) mut.setCompanionBags(src.companionId, inv);
  else if (src.kind === 'comp-bank' && src.companionId) mut.setCompanionBank(src.companionId, inv);
}

// Remove up to `qty` of item across sources. Prefer preferred companion bags, then others, then player.
// Returns how many were actually taken.
export function partyTake(
  ctx: PartyVaultCtx,
  mut: VaultMutators,
  itemEntry: number,
  qty: number,
  preferredCompanionId?: string,
): number {
  let left = Math.max(0, qty | 0);
  if (left <= 0) return 0;
  let taken = 0;
  // Fresh sources each pass — mutators may have rewritten companion bags mid-loop.
  for (const src of listVaultSources(ctx, preferredCompanionId)) {
    if (left <= 0) break;
    // Re-read live inventories for companions after earlier writes, since listVaultSources reads
    // c.bags — mutators must therefore update the companion objects in place.
    const live = listVaultSources(
      {
        ...ctx,
        // companions already mutated in place by setCompanionBags
      },
      preferredCompanionId,
    ).find(
      (s) =>
        s.kind === src.kind
        && s.companionId === src.companionId,
    );
    const inv = live?.inv ?? src.inv;
    const have = countItem(inv, itemEntry);
    if (have <= 0) continue;
    const n = Math.min(left, have);
    const [next] = removeItem(inv, itemEntry, n);
    writeSource(src, next, mut);
    // Keep ctx.companions bags in sync when mutator writes them — mutators own that.
    if (src.kind === 'player-bags') ctx.inventory = next;
    if (src.kind === 'player-bank') ctx.bank = next;
    taken += n;
    left -= n;
  }
  return taken;
}

// Deposit items into the first source with room. Prefer preferred companion bags, then player bags, then
// banks.
export function partyDeposit(
  ctx: PartyVaultCtx,
  mut: VaultMutators,
  itemEntry: number,
  qty: number,
  stackable: number,
  preferredCompanionId?: string,
): { deposited: number; remaining: number } {
  let left = Math.max(0, qty | 0);
  if (left <= 0) return { deposited: 0, remaining: 0 };
  let deposited = 0;
  for (const src of listVaultSources(ctx, preferredCompanionId)) {
    if (left <= 0) break;
    const live = listVaultSources(ctx, preferredCompanionId).find(
      (s) => s.kind === src.kind && s.companionId === src.companionId,
    );
    let inv = live?.inv ?? src.inv;
    const cap = live?.capacity ?? src.capacity;
    // Greedy fit one stack at a time until full or done.
    while (left > 0 && canFit(inv, itemEntry, 1, stackable, cap)) {
      const chunk = Math.min(left, stackable);
      // Binary-ish: try full chunk, shrink if needed.
      let n = chunk;
      while (n > 0 && !canFit(inv, itemEntry, n, stackable, cap)) n--;
      if (n <= 0) break;
      inv = addItem(inv, itemEntry, n, stackable);
      writeSource(src, inv, mut);
      if (src.kind === 'player-bags') ctx.inventory = inv;
      if (src.kind === 'player-bank') ctx.bank = inv;
      deposited += n;
      left -= n;
    }
  }
  return { deposited, remaining: left };
}

/** One holder's stack of a merged item: where it sits and whether it can leave that body. */
export interface VaultStackRef {
  label: string;
  count: number;
  companionId?: string;
  kind: VaultSourceKind;
  /** Index of the stack inside that holder's inventory. */
  slot: number;
  /** Soulbound - a BoP drop, or a BoE this holder equipped. */
  bound: boolean;
}

// Merged stack list for the UI: item to total count plus a row per stack. `only` narrows which
// holders count, so the companions panel shows the crew's storage, not your own bags again.
export function partyMergedStacks(
  ctx: PartyVaultCtx,
  only?: readonly VaultSourceKind[],
): Array<{ item: number; count: number; sources: VaultStackRef[] }> {
  const map = new Map<number, { count: number; sources: VaultStackRef[] }>();
  for (const src of listVaultSources(ctx)) {
    if (only && !only.includes(src.kind)) continue;
    src.inv.stacks.forEach((st, slot) => {
      const cur = map.get(st.item) ?? { count: 0, sources: [] };
      cur.count += st.count;
      cur.sources.push({
        label: src.label,
        count: st.count,
        companionId: src.companionId,
        kind: src.kind,
        slot,
        bound: stackBoundToHolder(st, ctx.ds),
      });
      map.set(st.item, cur);
    });
  }
  return [...map.entries()]
    .map(([item, v]) => ({ item, count: v.count, sources: v.sources }))
    .sort((a, b) => b.count - a.count);
}

/** The two holders the companions panel shows: their bags and their banks. */
export const COMPANION_VAULT_KINDS: readonly VaultSourceKind[] = ['comp-bags', 'comp-bank'];

// Soulbound to the body carrying it. A BoP or quest row is bound by definition, so the def decides
// when the stack carries no flag. Conjured class utility is the standing exception.
export function stackBoundToHolder(
  st: { item: number; bound?: boolean },
  ds: DataStore,
): boolean {
  if (st.bound) return true;
  const def = ds.item(st.item);
  if (!def || isConjuredItem(def)) return false;
  return shouldBindOnTrigger(resolveBonding(def), 'loot', false);
}

/** A companion holds it (bags or bank) and it is not soulbound, so it can come to you. */
export function isTakeableFromParty(ref: { kind: VaultSourceKind; bound: boolean }): boolean {
  return !ref.bound && (ref.kind === 'comp-bags' || ref.kind === 'comp-bank');
}

export interface PartyTakeReport {
  moved: number;
  /** Left behind: soulbound to the companion holding it. */
  bound: number;
  /** Left behind: your bags ran out of room. */
  full: boolean;
}

// Party storage to your bags, moving whole stacks and keeping each instance's identity. Soulbound
// instances never move: the item belongs to that body, and only the crew can pass it around.
export function partyTakeToBags(
  ctx: PartyVaultCtx,
  mut: VaultMutators,
  itemEntry: number,
  playerBagCap: number,
  qty?: number,
): PartyTakeReport {
  const maxStack = ctx.ds.item(itemEntry)?.stackable ?? 1;
  let left = qty != null ? Math.max(0, qty | 0) : Number.MAX_SAFE_INTEGER;
  const out: PartyTakeReport = { moved: 0, bound: 0, full: false };
  for (const src of listVaultSources(ctx)) {
    if (!COMPANION_VAULT_KINDS.includes(src.kind)) continue;
    let inv = src.inv;
    let dirty = false;
    // Descending so a splice cannot shift a slot we have not visited yet.
    for (let i = inv.stacks.length - 1; i >= 0; i--) {
      if (left <= 0) break;
      const st = inv.stacks[i];
      if (!st || st.item !== itemEntry) continue;
      if (stackBoundToHolder(st, ctx.ds)) { out.bound += st.count; continue; }
      const [next, taken] = takeStack(inv, i, Math.min(left, st.count));
      if (!taken) continue;
      if (!canFitInstance(ctx.inventory, taken, maxStack, playerBagCap)) { out.full = true; break; }
      inv = next;
      dirty = true;
      ctx.inventory = addInstance(ctx.inventory, taken, maxStack);
      out.moved += taken.count;
      left -= taken.count;
    }
    if (dirty) {
      writeSource(src, inv, mut);
      mut.setPlayerInventory(ctx.inventory);
    }
    if (out.full) break;
  }
  return out;
}
