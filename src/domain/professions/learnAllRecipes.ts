// Plan one pass of "read every recipe in the bags" across the roster. Only ONE body needs a recipe,
// so it picks the first eligible reader and learns nothing itself — the caller shows the list.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../character/character.ts';
import type { Inventory } from '../items/inventory.ts';
import type { SpellBook } from '../character/spellbook.ts';
import type { Companion } from '../bots/squad.ts';
import { countItem } from '../items/inventory.ts';
import { itemTeachIntent } from '../items/itemTeaches.ts';
import {
  probeLearnOnTargets, teachKnownToAll, teachUnreachable, type LearnOnKind, type LearnOnWho,
} from '../spells/learnOnTargets.ts';

/** One book that somebody can read right now. */
export interface LearnAllRow {
  entry: number;
  /** Companion whose bags hold the copy. Absent = your own bags. */
  owner?: string;
  ownerName?: string;
  /** Copies the bags hold. One is consumed; `spare` is what is left to sell. */
  qty: number;
  spare: number;
  itemName: string;
  /** The recipe / formula / ability the book teaches. */
  teachName: string;
  kind: LearnOnKind;
  who: LearnOnWho;
  whoName: string;
  /** "Blacksmithing 150" / "Druid 54" for the reader that was picked. */
  skillLabel?: string;
}

/** A book nobody can read, and why — usually "already known", which makes every copy sellable. */
export interface LearnAllSkip {
  entry: number;
  itemName: string;
  qty: number;
  reason: string;
  /** Nobody can read it because everyone who could already has — so every copy is sellable. */
  known?: boolean;
  // Nobody can read it because nobody has the profession or the class it is written for. The gate
  // will not lift by levelling, so every copy is sellable too.
  unreachable?: boolean;
}

export interface PlanLearnAllArgs {
  inventory: Inventory;
  ds: DataStore;
  char: Character;
  /** Squad + benched roster, the same reach the single-item Learn picker has. */
  companions: readonly Companion[];
  spellbook?: SpellBook;
  /** Companion whose bags `inventory` is. Stamped on every row so the run knows where to take it. */
  owner?: { id: string; name: string };
}

// Every teach item in the bags, split into "someone can read this" and "nobody can, here is why".
// Profession tier books are left out: they raise the reader's own cap, so they are a personal Study.
export function planLearnAllFromBags(args: PlanLearnAllArgs): {
  rows: LearnAllRow[];
  skipped: LearnAllSkip[];
} {
  const { inventory, ds, char, companions, spellbook } = args;
  const rows: LearnAllRow[] = [];
  const skipped: LearnAllSkip[] = [];
  for (const entry of new Set(inventory.stacks.map((s) => s.item))) {
    const item = ds.item(entry);
    if (!item) continue;
    const teach = itemTeachIntent(item, ds);
    if (!teach || teach.kind === 'profRank') continue;
    const qty = countItem(inventory, entry);
    if (teach.kind === 'unavailable') {
      skipped.push({ entry, itemName: item.name, qty, reason: 'Not in the game yet' });
      continue;
    }
    const probe = probeLearnOnTargets(entry, ds, char, companions, spellbook);
    if (!probe) {
      skipped.push({ entry, itemName: item.name, qty, reason: 'Not in the game yet' });
      continue;
    }
    // Eligible-first order comes out of the probe; you are the first row when you qualify.
    const pick = probe.candidates.find((cand) => !cand.reason);
    if (!pick) {
      const mine = probe.candidates.find((cand) => cand.who === 'self');
      const known = teachKnownToAll(probe);
      const unreachable = !known && teachUnreachable(probe);
      skipped.push({
        entry,
        itemName: item.name,
        qty,
        reason: mine?.reason ?? probe.candidates[0]?.reason ?? 'Nobody can learn it',
        ...(known ? { known } : {}),
        ...(unreachable ? { unreachable } : {}),
      });
      continue;
    }
    rows.push({
      entry,
      qty,
      spare: Math.max(0, qty - 1),
      itemName: item.name,
      teachName: probe.teachName,
      kind: probe.kind,
      who: pick.who,
      whoName: pick.who === 'self' ? (char.name || 'You') : pick.name,
      ...(pick.skillLabel ? { skillLabel: pick.skillLabel } : {}),
      ...(args.owner ? { owner: args.owner.id, ownerName: args.owner.name } : {}),
    });
  }
  rows.sort((a, b) => a.whoName.localeCompare(b.whoName) || a.teachName.localeCompare(b.teachName));
  skipped.sort((a, b) => a.itemName.localeCompare(b.itemName));
  return { rows, skipped };
}

/** Rows the player left switched on. */
export function activeLearnAllRows(
  rows: readonly LearnAllRow[],
  blocked: ReadonlySet<number> | readonly number[],
): LearnAllRow[] {
  const skip = blocked instanceof Set ? blocked : new Set(blocked);
  return rows.filter((r) => !skip.has(r.entry));
}

// Books the group has already read. Multi sell drops the "Recipes, formulas and books" guard on
// these: the Learn button will never take them again, so the vendor is all they are worth.
export function knownTeachEntries(skipped: readonly LearnAllSkip[]): Set<number> {
  const out = new Set<number>();
  for (const s of skipped) if (s.known) out.add(s.entry);
  return out;
}

// Books whose line nobody in the group has. Multi sell drops the "Recipes, formulas and books"
// guard on these for the same reason it drops it on a read one: no reader is coming.
export function unlearnableTeachEntries(skipped: readonly LearnAllSkip[]): Set<number> {
  const out = new Set<number>();
  for (const s of skipped) if (s.unreachable) out.add(s.entry);
  return out;
}

/** Copies left over once every planned row is read — what the vendor tab can take. */
export function learnAllSpareCount(rows: readonly LearnAllRow[]): number {
  let n = 0;
  for (const r of rows) n += r.spare;
  return n;
}
