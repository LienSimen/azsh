// Backup generations for a save slot: what is worth keeping, how many, and which write looks
// like a loss rather than a play session. Pure - the IndexedDB side lives in
// indexedDbRepository.ts and the same policy is what the server history mirrors.
//
// Why this exists: on 2026-08-21 one write turned a level 60 with 18 equipped items and a full
// bag into equipped {} / 0 stacks, and IndexedDB holds exactly one copy per slot, so the good
// state was gone the moment it landed. A save store with no generations is a single point of
// failure no matter how correct the writer is.

import type { Save } from './saveShape.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';

/**
 * daily  - the first write of each day, so yesterday is always reachable.
 * exit   - written when the player leaves the character or closes the tab.
 * guard  - the stored save, kept just BEFORE a write that looks like a loss.
 * manual - the player pressed Back up now.
 */
export type BackupKind = 'daily' | 'exit' | 'guard' | 'manual';

/** How many generations of each kind survive per slot. */
export const BACKUP_RETENTION: Readonly<Record<BackupKind, number>> = {
  daily: 5,
  exit: 2,
  guard: 3,
  manual: 5,
};

/** The numbers a loss shows up in. Cheap enough to keep in memory for every open slot. */
export interface SaveFootprint {
  equipped: number;
  items: number;
  gold: number;
  level: number;
}

export interface BackupMeta {
  id: string;
  slot: string;
  kind: BackupKind;
  /** When this generation was KEPT. Ordering and retention run on this. */
  at: number;
  /** The save's own updatedAt - the state the generation actually holds. Shown to the player:
   *  a copy kept at 16:14 of a save last written at 16:01 is 16:01 state, and labelling it
   *  16:14 reads as progress that is not in there. */
  savedAt: number;
  day: string;
  name: string;
  level: number;
  footprint: SaveFootprint;
  /** Why a guard generation was taken; absent on the other kinds. */
  reason?: string;
}

export interface BackupRecord extends BackupMeta {
  save: Save;
}

function stackCount(inv: { stacks?: unknown[] } | undefined): number {
  return Array.isArray(inv?.stacks) ? inv.stacks.length : 0;
}

export function footprintOf(save: Save): SaveFootprint {
  const st = save.state;
  const eq = st.char.equipped ?? {};
  let equipped = 0;
  for (const v of Object.values(eq)) if (equippedEntry(v) != null) equipped++;
  return {
    equipped,
    items: stackCount(st.inventory) + stackCount(st.bank) + stackCount(st.keyring),
    gold: st.char.gold | 0,
    level: st.char.level | 0,
  };
}

/** YYYY-MM-DD in LOCAL time: "a save per day" means the player's day, not UTC's. */
export function backupDay(at: number): string {
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function backupId(slot: string, kind: BackupKind, at: number): string {
  return `${slot}|${kind}|${at}`;
}

/**
 * A write that reads as an accident rather than play, or null when it is ordinary. Only
 * unambiguous collapses count: a player may vendor a bag or replace a weapon, so single-item
 * moves are never flagged. Returns the sentence the guard generation is labelled with.
 */
export function lossReason(prev: SaveFootprint, next: SaveFootprint): string | null {
  if (prev.equipped >= 3 && next.equipped === 0) return `all ${prev.equipped} equipped items vanished`;
  if (prev.items >= 5 && next.items === 0) return `all ${prev.items} carried stacks vanished`;
  if (next.equipped <= prev.equipped - 5) return `${prev.equipped - next.equipped} equipped items lost in one write`;
  if (next.items <= prev.items - 20) return `${prev.items - next.items} carried stacks lost in one write`;
  if (prev.level >= 2 && next.level < prev.level) return `level fell from ${prev.level} to ${next.level}`;
  return null;
}

/** Ids to drop so each (slot, kind) keeps only its retention count, newest first. */
export function pruneIds(metas: readonly BackupMeta[]): string[] {
  const buckets = new Map<string, BackupMeta[]>();
  for (const m of metas) {
    const k = `${m.slot}|${m.kind}`;
    const list = buckets.get(k);
    if (list) list.push(m);
    else buckets.set(k, [m]);
  }
  const drop: string[] = [];
  for (const [k, list] of buckets) {
    const kind = k.slice(k.lastIndexOf('|') + 1) as BackupKind;
    const keep = BACKUP_RETENTION[kind] ?? 3;
    list.sort((a, b) => b.at - a.at);
    for (const m of list.slice(keep)) drop.push(m.id);
  }
  return drop;
}

/** One backup per slot per day: true when this slot has no generation for `at`'s day yet. */
export function needsDaily(metas: readonly BackupMeta[], slot: string, at: number): boolean {
  const day = backupDay(at);
  return !metas.some((m) => m.slot === slot && m.kind === 'daily' && m.day === day);
}

/** Recover savedAt for generations written before BackupMeta carried it (2219a8ff). */
export function backupMetaFromRecord(row: BackupRecord): BackupMeta {
  const { save, ...meta } = row;
  return { ...meta, savedAt: meta.savedAt || save.updatedAt || meta.at };
}

export function backupMetaOf(save: Save, kind: BackupKind, at: number, reason?: string): BackupMeta {
  return {
    id: backupId(save.slot, kind, at),
    slot: save.slot,
    kind,
    at,
    savedAt: save.updatedAt,
    day: backupDay(at),
    name: save.state.char.name,
    level: save.state.char.level | 0,
    footprint: footprintOf(save),
    ...(reason ? { reason } : {}),
  };
}

// Already kept: the same state under the same kind. Two generations of one save waste retention slots - an
// exit copy and the tab-close copy minutes later are the same bytes.
export function sameGenerationKept(metas: readonly BackupMeta[], meta: BackupMeta): BackupMeta | null {
  return metas.find((m) => m.slot === meta.slot && m.kind === meta.kind && m.savedAt === meta.savedAt) ?? null;
}

/** One line for the restore list: "Today 14:31 - level 60, 18 worn, 26 carried". */
export function backupLabel(m: BackupMeta, now: number): string {
  const when = new Date(m.savedAt || m.at);
  const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  const shown = backupDay(m.savedAt || m.at);
  const days = Math.floor((new Date(backupDay(now)).getTime() - new Date(shown).getTime()) / 86_400_000);
  const day = days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : shown;
  const kind = m.kind === 'guard' ? 'before a loss' : m.kind === 'exit' ? 'on exit' : m.kind === 'manual' ? 'manual' : 'daily';
  return `${day} ${time} (${kind}) - level ${m.footprint.level}, ${m.footprint.equipped} worn, ${m.footprint.items} carried`;
}
