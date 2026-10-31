// Pure talent point math, prerequisites, spend and respec, data-driven from ds.talent* and the
// flat pointsForLevel formula. No DOM, no RNG. Immutable updates only.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from './character.ts';

/** Talent.dbc MAX_TALENT_RANK. Cite: DBCStructure.h:946; Player.cpp:19661 Row * MAX_TALENT_RANK. */
export const TALENT_TIER_POINTS = 5;

/** Classic 1.12 talent points: 0 until level 10, then +1 per level. */
export function pointsForLevel(level: number): number {
  return Math.max(0, (level | 0) - 9);
}

/** Total points the character has spent across all trees. */
export function spentPoints(char: Character): number {
  const t = char.talents ?? {};
  let sum = 0;
  for (const v of Object.values(t)) sum += (v as number) || 0;
  return sum;
}

/** Points spent inside one specific tree (used for tier gates: tier*5). */
export function spentInTree(char: Character, tabId: number, ds: DataStore): number {
  return sumTreePoints(char, tabId, ds, () => true);
}

/** Points in this tree in rows strictly below `tier`. Remaining-spec form of Player.cpp:19661. */
export function spentBelowTier(char: Character, tabId: number, tier: number, ds: DataStore): number {
  return sumTreePoints(char, tabId, ds, (t) => t < tier);
}

function sumTreePoints(
  char: Character,
  tabId: number,
  ds: DataStore,
  pred: (tier: number) => boolean,
): number {
  const trees = ds.talentTrees(char.cls);
  const tree = trees.find((tr) => tr.tabId === tabId);
  if (!tree) return 0;
  const tals = char.talents ?? {};
  let sum = 0;
  for (const td of tree.talents) {
    if (pred(td.tier)) sum += (tals[td.id] as number) || 0;
  }
  return sum;
}

/** How many points remain to spend (total pool minus spent). */
export function availablePoints(char: Character): number {
  return Math.max(0, pointsForLevel(char.level) - spentPoints(char));
}

export interface CanSpendResult {
  ok: boolean;
  reason?: string;
}

// Can this talent receive another point right now? Checks: known talent, room in maxRank, available points,
// tier gate (points in tree >= tier*5), and prereq talent rank.
export function canSpend(char: Character, talentId: number, ds: DataStore): CanSpendResult {
  const tal = ds.talent(talentId);
  if (!tal) return { ok: false, reason: 'Unknown talent' };
  // prevent learn talent for different class (cheating). Cite: Player.cpp:19585-19587.
  if (!ds.talentTrees(char.cls).some((tr) => tr.tabId === tal.tabId)) {
    return { ok: false, reason: 'Unknown talent' };
  }
  const cur = ((char.talents ?? {})[talentId] as number) || 0;
  if (cur >= tal.maxRank) return { ok: false, reason: 'Already at max rank' };
  if (availablePoints(char) <= 0) return { ok: false, reason: 'No talent points available' };
  const inTree = spentInTree(char, tal.tabId, ds);
  if (inTree < tal.tier * TALENT_TIER_POINTS) {
    return { ok: false, reason: `Requires ${tal.tier * TALENT_TIER_POINTS} points spent in this tree` };
  }
  if (tal.prereq) {
    const pre = ((char.talents ?? {})[tal.prereq.talentId] as number) || 0;
    if (pre < tal.prereq.rank) return { ok: false, reason: 'Prerequisite not met' };
  }
  return { ok: true };
}

// Simulate removing one rank; remaining talents must still pass LearnTalent's Row*5 gate against
// points BELOW that row, plus prereqs. Whole-tree sum lets a hollow spec keep its deep ranks.
export function canRefund(char: Character, talentId: number, ds: DataStore): CanSpendResult {
  const cur = ((char.talents ?? {})[talentId] as number) || 0;
  if (cur <= 0) return { ok: false, reason: 'Talent not spent' };

  const talents: Record<number, number> = { ...(char.talents ?? {}) };
  if (cur === 1) {
    delete talents[talentId];
  } else {
    talents[talentId] = cur - 1;
  }
  const next: Character = { ...char, talents };

  for (const [tidStr, rankRaw] of Object.entries(talents)) {
    const tid = Number(tidStr) | 0;
    const rank = (rankRaw as number) || 0;
    if (rank <= 0) continue;
    const tal = ds.talent(tid);
    // Unknown / synthetic talent ids (tests) cannot be validated — skip.
    if (!tal) continue;
    if (spentBelowTier(next, tal.tabId, tal.tier, ds) < tal.tier * TALENT_TIER_POINTS) {
      return { ok: false, reason: 'Would break tier requirements for another talent' };
    }
    if (tal.prereq) {
      const pre = (talents[tal.prereq.talentId] as number) || 0;
      if (pre < tal.prereq.rank) {
        return { ok: false, reason: 'Required by another talent' };
      }
    }
  }
  return { ok: true };
}

/** Spend one rank in the talent if allowed. Returns a new Character (or the same if not allowed). */
export function spendTalent(char: Character, talentId: number, ds: DataStore): Character {
  const check = canSpend(char, talentId, ds);
  if (!check.ok) return char;
  const talents: Record<number, number> = { ...(char.talents ?? {}) };
  talents[talentId] = ((talents[talentId] as number) || 0) + 1;
  return { ...char, talents };
}

// Refund one rank from a spent talent if the remaining build stays legal (see canRefund). Returns a new
// Character, or the same reference when refund is refused / not spent.
export function refundTalent(char: Character, talentId: number, ds: DataStore): Character {
  const check = canRefund(char, talentId, ds);
  if (!check.ok) return char;
  const tals = char.talents ?? {};
  const cur = (tals[talentId] as number) || 0;
  if (cur <= 0) return char;
  const talents: Record<number, number> = { ...tals };
  if (cur === 1) {
    delete talents[talentId];
  } else {
    talents[talentId] = cur - 1;
  }
  return { ...char, talents };
}

/** Full respec: clear all spent talent points. Returns a new Character. Gold cost is handled by caller (Game). */
export function respec(char: Character): Character {
  const t = char.talents;
  if (!t || Object.keys(t).length === 0) return char;
  return { ...char, talents: {} };
}

// Spell ids currently granted by spent talent ranks via grant_spell / grant_passive, scanning
// every rank 1..current so multi-rank grants stay tracked after a rank-up.
export function talentGrantedSpellIds(char: Character, ds: DataStore): Set<number> {
  const out = new Set<number>();
  const spent = char.talents ?? {};
  for (const [tidStr, rnkRaw] of Object.entries(spent)) {
    const tid = Number(tidStr) | 0;
    const rnk = (rnkRaw as number) || 0;
    if (rnk < 1) continue;
    const tal = ds.talent(tid);
    if (!tal) continue;
    const maxR = Math.min(rnk, tal.ranks.length);
    for (let r = 1; r <= maxR; r++) {
      const rank = tal.ranks[r - 1];
      if (!rank) continue;
      for (const eff of rank.effects ?? []) {
        if (eff.kind === 'grant_spell' && typeof (eff as { spellId?: number }).spellId === 'number') {
          out.add((eff as { spellId: number }).spellId);
        }
        if (eff.kind === 'grant_passive' && rank.spellId) {
          out.add(rank.spellId);
        }
      }
    }
  }
  return out;
}

// Every spell id ANY talent of `cls` can grant, so the spent set is always a subset and a
// "known but not granted" diff cannot accuse a talent the character took. 73 ids in the bake.
const allTalentGrantsByStore = new WeakMap<object, Map<number, Set<number>>>();
export function allTalentGrantedSpellIds(cls: number, ds: DataStore): Set<number> {
  let byCls = allTalentGrantsByStore.get(ds as object);
  if (!byCls) { byCls = new Map(); allTalentGrantsByStore.set(ds as object, byCls); }
  const hit = byCls.get(cls);
  if (hit) return hit;
  const out = new Set<number>();
  for (const tree of ds.talentTrees(cls) ?? []) {
    for (const tal of tree.talents ?? []) {
      for (const rank of tal.ranks ?? []) {
        for (const eff of rank.effects ?? []) {
          if (eff.kind === 'grant_spell' && typeof (eff as { spellId?: number }).spellId === 'number') {
            out.add((eff as { spellId: number }).spellId);
          }
          if (eff.kind === 'grant_passive' && rank.spellId) out.add(rank.spellId);
        }
      }
    }
  }
  byCls.set(cls, out);
  return out;
}
