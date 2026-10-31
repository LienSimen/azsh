// GetAreaTriggerLockStatus, pure and deterministic: level, then raid, then either key item, then the
// required quest. Raid locks, PvP rank gates and instance caps are skipped as no-ops here.

/** Subset of AreaLockStatus we surface (Player.cpp:19906+). */
export type AreaTriggerLockStatus =
  | 'ok'
  | 'too_low_level'
  | 'missing_item'
  | 'quest_not_completed';

/** Lock-relevant fields from DataBundle.areatriggerTeleports (schema ~1907–1913). */
export interface AreaTriggerTeleportRow {
  id: number;
  name: string;
  requiredLevel?: number;
  requiredItem?: number;
  requiredItem2?: number;
  requiredQuest?: number;
  statusFailedText?: string;
  fromZone?: string;
  toZone?: string;
  targetMap?: number;
  map?: number;
}

export interface AreaTriggerLockResult {
  ok: boolean;
  reason?: string;
  status: AreaTriggerLockStatus;
}

export interface CheckAreaTriggerLockOpts {
  level: number;
  /** Owned item entry set (inventory keys, etc.). */
  ownedItems?: ReadonlySet<number> | readonly number[];
  /** Predicate alternative to ownedItems. */
  hasItem?: (entry: number) => boolean;
  /** Completed/rewarded quest ids. */
  completedQuests?: ReadonlySet<number> | readonly number[];
  /** Predicate alternative to completedQuests. */
  hasQuestRewarded?: (questId: number) => boolean;
  /** Teleport row lock fields (from bake). */
  teleport: Pick<
    AreaTriggerTeleportRow,
    'requiredLevel' | 'requiredItem' | 'requiredItem2' | 'requiredQuest' | 'statusFailedText'
  >;
}

function itemOwned(
  entry: number,
  opts: Pick<CheckAreaTriggerLockOpts, 'ownedItems' | 'hasItem'>,
): boolean {
  if (opts.hasItem) return opts.hasItem(entry);
  if (!opts.ownedItems) return false;
  if (opts.ownedItems instanceof Set) return opts.ownedItems.has(entry);
  return (opts.ownedItems as readonly number[]).includes(entry);
}

function questRewarded(
  questId: number,
  opts: Pick<CheckAreaTriggerLockOpts, 'completedQuests' | 'hasQuestRewarded'>,
): boolean {
  if (opts.hasQuestRewarded) return opts.hasQuestRewarded(questId);
  if (!opts.completedQuests) return false;
  if (opts.completedQuests instanceof Set) return opts.completedQuests.has(questId);
  return (opts.completedQuests as readonly number[]).includes(questId);
}

// GetAreaTriggerLockStatus plus the failure-text preference from SendTransferAbortedByLockStatus:
// level, then either-of-two key items, then the required quest, preferring the row's own text.
export function checkAreaTriggerLock(opts: CheckAreaTriggerLockOpts): AreaTriggerLockResult {
  const at = opts.teleport;
  const failText = at.statusFailedText?.trim() || undefined;

  // 1. Level (Player.cpp:19922-19926) — requiredLevel 0 / absent = no gate
  const reqLevel = at.requiredLevel ?? 0;
  if (reqLevel > 0 && opts.level < reqLevel) {
    return {
      ok: false,
      status: 'too_low_level',
      // Prefer row text (Deadmines 78, Onyxia 2848, …); else stock-style
      reason: failText ?? `Requires level ${reqLevel}`,
    };
  }

  // 2. Raid group — GAP / no-op (no multiplayer)

  // 3. Key items: requiredItem OR requiredItem2 — either satisfies
  //    (Player.cpp:19939-19953). First missing reported when neither owned.
  const item1 = at.requiredItem ?? 0;
  const item2 = at.requiredItem2 ?? 0;
  if (item1 > 0 || item2 > 0) {
    const has1 = item1 > 0 && itemOwned(item1, opts);
    const has2 = item2 > 0 && itemOwned(item2, opts);
    if (!has1 && !has2) {
      const missing = item1 > 0 ? item1 : item2;
      return {
        ok: false,
        status: 'missing_item',
        reason: failText ?? `Requires item ${missing}`,
      };
    }
  }

  // 4. Attunement quest (Player.cpp:19956-19960) — must be rewarded/completed
  const reqQuest = at.requiredQuest ?? 0;
  if (reqQuest > 0 && !questRewarded(reqQuest, opts)) {
    return {
      ok: false,
      status: 'quest_not_completed',
      reason: failText ?? `Requires quest ${reqQuest}`,
    };
  }

  // 5–6. PvP rank / instance caps — GAP / no-op

  return { ok: true, status: 'ok' };
}

// ---- entrance matching (ObjectMgr GetMapEntranceTrigger spirit) --------------

// True for entrance-side portal names; false for exits. Matches "Entering" / "Entrance"; excludes "Exiting"
// / " - Exit".
export function isEntranceTeleportName(name: string): boolean {
  const n = name.toLowerCase();
  if (/\bexiting\b/.test(n) || /\bexit\b/.test(n)) return false;
  return /\bentering\b/.test(n) || /\bentrance\b/.test(n);
}

/** Count of discrete lock requirements (items count once each; quest once). */
function reqCount(t: AreaTriggerTeleportRow): number {
  let n = 0;
  if ((t.requiredItem ?? 0) > 0) n++;
  if ((t.requiredItem2 ?? 0) > 0) n++;
  if ((t.requiredQuest ?? 0) > 0) n++;
  return n;
}

// IsLessOrEqualThan spirit (ObjectMgr.h): A is less-or-equal restrictive than B if lower requiredLevel, or
// same level with fewer item/quest reqs. Used to pick the least-restrictive entrance among candidates.
export function isLessOrEqualRestrictive(
  a: AreaTriggerTeleportRow,
  b: AreaTriggerTeleportRow,
): boolean {
  const la = a.requiredLevel ?? 0;
  const lb = b.requiredLevel ?? 0;
  if (la !== lb) return la < lb;
  return reqCount(a) <= reqCount(b);
}

// Pick an entrance teleport for a dungeon portal zone, matching the from-zone and an Entering-style
// name. Several matches prefer the least restrictive, with array order breaking ties.
export function findEntranceTeleport(
  portalZone: string,
  teleports: readonly AreaTriggerTeleportRow[],
  nameFragment?: string,
): AreaTriggerTeleportRow | undefined {
  const frag = nameFragment?.toLowerCase();
  const candidates = teleports.filter((t) => {
    if (t.fromZone !== portalZone) return false;
    if (!isEntranceTeleportName(t.name)) return false;
    if (frag && !t.name.toLowerCase().includes(frag)) return false;
    return true;
  });
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i];
    // Prefer strictly less restrictive; keep first on tie
    if (isLessOrEqualRestrictive(c, best) && !isLessOrEqualRestrictive(best, c)) {
      best = c;
    }
  }
  return best;
}
