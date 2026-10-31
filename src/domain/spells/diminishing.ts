// Pure CC diminishing returns. Cite: Unit.cpp ApplyDiminishingToDuration ~8851; Unit.h
// DiminishingLevels; SpellMgr.cpp GetDiminishingReturnsGroupForSpell ~2636. No DOM, no I/O.

/** DiminishingLevels (Unit.h). */
export const DIMINISHING_LEVEL = {
  LEVEL_1: 0,
  LEVEL_2: 1,
  LEVEL_3: 2,
  IMMUNE: 3,
} as const;

/** Duration multiplier by level (Unit.cpp ApplyDiminishingToDuration). */
export function diminishingDurationMod(level: number): number {
  switch (level) {
    case DIMINISHING_LEVEL.LEVEL_1: return 1.0;
    case DIMINISHING_LEVEL.LEVEL_2: return 0.5;
    case DIMINISHING_LEVEL.LEVEL_3: return 0.25;
    case DIMINISHING_LEVEL.IMMUNE: return 0.0;
    default: return 1.0;
  }
}

/** Apply DR to duration ms. Permanent (-1) and NONE group skip. Cite: Unit.cpp ~8851–8878. */
export function applyDiminishingToDuration(durationMs: number, level: number): number {
  if (durationMs < 0) return durationMs; // permanent
  const mod = diminishingDurationMod(level);
  return Math.floor(durationMs * mod);
}

/** 15s DR hit window (Unit.h DiminishingReturn hitTime comment). */
export const DR_HIT_WINDOW_MS = 15_000;

export interface DrState {
  /** group id → { level, hitTimeMs } */
  groups: Record<string, { level: number; hitTimeMs: number }>;
}

export function emptyDrState(): DrState {
  return { groups: {} };
}

/** Get current level for a group, resetting to L1 if >15s since last hit. */
export function getDiminishingLevel(state: DrState, group: string, nowMs: number): number {
  const g = state.groups[group];
  if (!g) return DIMINISHING_LEVEL.LEVEL_1;
  if (nowMs - g.hitTimeMs > DR_HIT_WINDOW_MS) return DIMINISHING_LEVEL.LEVEL_1;
  return g.level;
}

/** After a CC lands: bump level (L1→L2→L3→IMMUNE) and refresh hitTime. Returns new state (immutable). */
export function bumpDiminishing(state: DrState, group: string, nowMs: number): DrState {
  const cur = getDiminishingLevel(state, group, nowMs);
  const nextLevel = Math.min(DIMINISHING_LEVEL.IMMUNE, cur + 1);
  return {
    groups: {
      ...state.groups,
      [group]: { level: nextLevel, hitTimeMs: nowMs },
    },
  };
}

/** Map mechanic string → DR group key (simplified SpellMgr grouping). */
export function diminishingGroupForMechanic(mechanic: string, triggered = false): string {
  switch (mechanic) {
    case 'stun':
      return triggered ? 'trigger_stun' : 'control_stun';
    // MECHANIC_FREEZE has its OWN group and it is player-only, not the all-targets stun track, so
    // Freezing Trap diminishes against players alone. Cite: SpellMgr.cpp:2700-2701.
    case 'freeze':
      return 'freeze';
    case 'root':
    case 'snare':
    case 'daze':
      return triggered ? 'trigger_root' : 'control_root';
    case 'fear':
    case 'turn':
      return 'fear';
    case 'horror': return 'deathcoil';
    case 'polymorph':
    case 'disoriented':
      return 'polymorph';
    case 'sleep':
    case 'shackle':
      return 'sleep';
    case 'sap':
    case 'knockout': return 'knockout';
    case 'charm': return 'charm';
    case 'silence':
    case 'interrupt':
      return 'silence';
    case 'disarm': return 'disarm';
    case 'banish': return 'banish';
    default: return 'none';
  }
}

// DiminishingReturnsType: 'all' applies even against creatures, 'player' only when the target is
// player-controlled, and 'none' is not subject to level DR at all.
export type DiminishingReturnsType = 'all' | 'player' | 'none';

// The groups a rotation may ASK ABOUT, in a stable order, so drLevel's ref is an index the editor can
// name. APPEND-ONLY: inserting or removing would change what a shipped row means.
export const DIMINISHING_GROUP_ORDER: readonly string[] = [
  'control_stun', 'trigger_stun', 'control_root', 'trigger_root', 'fear',
  'polymorph', 'sleep', 'knockout', 'charm', 'silence',
  'disarm', 'banish', 'freeze', 'deathcoil',
] as const;

/** Cite: SpellMgr.cpp GetDiminishingReturnsGroupType ~2748 (CHARM → DRTYPE_ALL @2756). */
export function getDiminishingReturnsGroupType(group: string): DiminishingReturnsType {
  switch (group) {
    case 'control_stun':
    case 'trigger_stun':
    case 'kidneyshot':
    case 'blind':
    case 'charm':
    // combat.ts simplified keys that map to the same DRTYPE_ALL groups:
    case 'stun':
      return 'all';
    case 'sleep':
    case 'control_root':
    case 'trigger_root':
    case 'fear':
    case 'polymorph':
    case 'deathcoil':
    case 'freeze':
    case 'banish':
    case 'warlock_fear':
    case 'knockout':
    // combat.ts simplified shared tracks:
    case 'incapacitate':
    case 'root':
      return 'player';
    // 'silence' and 'disarm' fall through to 'none' ON PURPOSE, a departure from the source tier:
    // both groups are marked "From 2.3.0", and 1.12 the game had no DR on either.
    default:
      return 'none';
  }
}

// Whether duration is scaled by DR level for this group. Charm is special: duration diminish only in PvP.
// Cite: SpellMgr.cpp IsDiminishingReturnsGroupDurationDiminished ~2737 (CHARM → pvp @2741).
export function isDiminishingReturnsGroupDurationDiminished(group: string, pvp: boolean): boolean {
  if (group === 'charm') return pvp;
  return true;
}

// Whether DR levels apply (step advances / immune tracking). Cite: SpellMgr.cpp
// IsSubjectToDiminishingLevels ~2778. true if (type == DRTYPE_PLAYER && pvp) || type == DRTYPE_ALL
export function isSubjectToDiminishingLevels(group: string, pvp: boolean): boolean {
  const type = getDiminishingReturnsGroupType(group);
  return type === 'all' || (type === 'player' && pvp);
}

// Apply duration DR for a group, honoring charm's PvP-only duration diminish. Levels may still
// advance in PvE while the duration stays full. Cite: Unit.cpp ApplyDiminishingToDuration ~8851.
export function applyDiminishingToDurationForGroup(
  durationMs: number,
  level: number,
  group: string,
  pvp: boolean,
): number {
  if (durationMs < 0) return durationMs; // permanent
  if (!isSubjectToDiminishingLevels(group, pvp)) return durationMs;
  if (!isDiminishingReturnsGroupDurationDiminished(group, pvp)) return durationMs;
  return applyDiminishingToDuration(durationMs, level);
}
