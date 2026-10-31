// Lock.dbc open-lock checks. Cite: Spell.cpp CanOpenLock ~7246–7305 and TakeCastItem ~4209–4267;
// SharedDefines.h LockType / SkillByLockType; DBCStructure.h LockEntry MAX_LOCK_CASE=8. Pure.

import { gatherSkillGainChanceTenths } from '../professions/professions.ts';
import type { CombatSkillMap } from '../character/combatSkills.ts';

export const LOCK_KEY_NONE = 0;
export const LOCK_KEY_ITEM = 1;
export const LOCK_KEY_SKILL = 2;

/** SharedDefines.h LockType */
export const LOCKTYPE_NONE = 0;
export const LOCKTYPE_PICKLOCK = 1;
export const LOCKTYPE_HERBALISM = 2;
export const LOCKTYPE_MINING = 3;
export const LOCKTYPE_DISARM_TRAP = 4;
export const LOCKTYPE_OPEN = 5;
export const LOCKTYPE_TREASURE = 6;
export const LOCKTYPE_CLOSE = 8;
export const LOCKTYPE_QUICK_OPEN = 10;
export const LOCKTYPE_QUICK_CLOSE = 11;
export const LOCKTYPE_OPEN_TINKERING = 12;
export const LOCKTYPE_OPEN_KNEELING = 13;
export const LOCKTYPE_OPEN_ATTACKING = 14;
export const LOCKTYPE_BLASTING = 16;
export const LOCKTYPE_SLOW_OPEN = 17;
export const LOCKTYPE_SLOW_CLOSE = 18;
export const LOCKTYPE_FISHING = 19;

/** SharedDefines.h skill ids returned by SkillByLockType */
export const SKILL_NONE = 0;
export const SKILL_HERBALISM = 182;
export const SKILL_MINING = 186;
export const SKILL_FISHING = 356;
export const SKILL_LOCKPICKING = 633;

export interface LockCase {
  type: number;   // LOCK_KEY_ITEM / LOCK_KEY_SKILL
  index: number;  // item entry or lock type / skill key
  skill: number;  // required skill value
}

export interface LockDef {
  id: number;
  cases: LockCase[]; // up to 8
}

export type OpenLockResult =
  | { ok: true }
  | { ok: false; reason: 'bad_targets' | 'low_skill' };

// SharedDefines.h SkillByLockType — only picklock / herb / mine / fish map to a skill. All other LockTypes
// (OPEN_KNEELING, OPEN, TREASURE, …) are free open gestures.
export function skillByLockType(lockType: number): number {
  switch (lockType) {
    case LOCKTYPE_PICKLOCK: return SKILL_LOCKPICKING;
    case LOCKTYPE_HERBALISM: return SKILL_HERBALISM;
    case LOCKTYPE_MINING: return SKILL_MINING;
    case LOCKTYPE_FISHING: return SKILL_FISHING;
    default: return SKILL_NONE;
  }
}

/** Human label for skill-gated refusal strings (no id allowlists — type → name). */
export function skillNameForLockType(lockType: number): string {
  switch (skillByLockType(lockType)) {
    case SKILL_LOCKPICKING: return 'Lockpicking';
    case SKILL_HERBALISM: return 'Herbalism';
    case SKILL_MINING: return 'Mining';
    case SKILL_FISHING: return 'Fishing';
    default: return 'skill';
  }
}

// Free-open LockTypes for the interact path, with no cast spell: everything SkillByLockType maps to
// SKILL_NONE except the index-0 padding and DISARM_TRAP, which is skill-checked.
export function isFreeOpenLockType(lockType: number): boolean {
  if (lockType === LOCKTYPE_NONE) return false;
  if (lockType === LOCKTYPE_DISARM_TRAP) return false;
  return skillByLockType(lockType) === SKILL_NONE;
}

// True when any LOCK_KEY_SKILL case is a free-open gesture. Cases are OR, so a free-open succeeds
// with no herbalism, mining or lockpicking skill at all.
export function lockHasFreeOpenCase(lock: LockDef | undefined): boolean {
  if (!lock?.cases?.length) return false;
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_SKILL && isFreeOpenLockType(c.index)) return true;
  }
  return false;
}

/** True when Lock.dbc has a LOCKTYPE_PICKLOCK skill case (pick chests / lockboxes). */
export function lockHasPicklockCase(lock: LockDef | undefined): boolean {
  if (!lock?.cases?.length) return false;
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_SKILL && c.index === LOCKTYPE_PICKLOCK) return true;
  }
  return false;
}

/** True when Lock.dbc has a LOCK_KEY_ITEM case (inventory key). */
export function lockHasKeyItemCase(lock: LockDef | undefined): boolean {
  if (!lock?.cases?.length) return false;
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_ITEM && c.index > 0) return true;
  }
  return false;
}

/** Required lockpicking value for the first LOCKTYPE_PICKLOCK case, or 0. */
export function picklockSkillReq(lock: LockDef | undefined): number {
  if (!lock?.cases?.length) return 0;
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_SKILL && c.index === LOCKTYPE_PICKLOCK) return c.skill | 0;
  }
  return 0;
}

// EffectOpenLock into UpdateGatherSkill for lockpicking, skill line 633: roll SkillGainChance with
// the required value as the red level, then add a point on success.
export function tryLockpickingSkillUp(
  map: CombatSkillMap | undefined,
  reqSkillValue: number,
  chance: (p: number) => boolean,
): { map: CombatSkillMap | undefined; up?: number } {
  if (!map) return { map };
  const cur = map[SKILL_LOCKPICKING];
  if (!cur || cur.current <= 0 || cur.current >= cur.max) return { map };
  const tenths = gatherSkillGainChanceTenths(cur.current, reqSkillValue | 0);
  if (tenths <= 0 || !chance(tenths / 1000)) return { map };
  const next = Math.min(cur.max, cur.current + 1);
  if (next <= cur.current) return { map };
  return {
    map: { ...map, [SKILL_LOCKPICKING]: { current: next, max: cur.max } },
    up: next,
  };
}

// Spell::CanOpenLock. A lockId of 0 is fine, and the cases are alternatives — the first satisfied one
// wins. A low-skill result on one case never aborts its siblings.
export function canOpenLock(opts: {
  lock: LockDef | undefined;
  /** Item entry used as key (cast item). */
  keyItemEntry?: number;
  /** Spell EffectMiscValue for skill lock type match. */
  spellLockType?: number;
  /** Player skill value for the mapped skill (single-value path). */
  skillValue?: number;
  /** Per-lock-type skill value (interact path may carry lockpicking + mining). */
  skillValueFor?: (lockType: number) => number | undefined;
  /** When disarm trap: creature/go level → req = level*5. */
  trapGoLevel?: number;
  /** Lock type index for disarm trap (caller knows). */
  isDisarmTrap?: boolean;
}): OpenLockResult {
  const lock = opts.lock;
  if (!lock || lock.id === 0) return { ok: true };
  if (!lock.cases.length) return { ok: true };

  let reqKey = false;
  let sawLowSkill = false;
  let sawItemCase = false;
  let itemMatched = false;
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_ITEM) {
      reqKey = true;
      if (c.index > 0) sawItemCase = true;
      if (c.index && opts.keyItemEntry === c.index) {
        itemMatched = true;
        return { ok: true };
      }
    } else if (c.type === LOCK_KEY_SKILL) {
      reqKey = true;
      if (opts.spellLockType != null && opts.spellLockType !== c.index) continue;
      // Interact path (no spellLockType): LOCKTYPE_NONE is not a free Use — skip.
      if (opts.spellLockType == null && c.index === LOCKTYPE_NONE) continue;

      // Interact: skip companion open gestures on key/picklock locks (KI-613; lock 1562/1564).
      // Cite: SpellHandler.cpp:297–298 GO_FLAG_LOCKED; SharedDefines.h QUICK_OPEN=10 BLASTING=16.
      if (opts.spellLockType == null) {
        if (c.index === LOCKTYPE_PICKLOCK) {
          // Skill opens only when caller supplies skillValue(For); else Pick Lock spell path.
          const have =
            opts.skillValueFor?.(c.index) ?? opts.skillValue;
          if (have != null) {
            if (have < c.skill) {
              sawLowSkill = true;
              continue;
            }
            return { ok: true };
          }
          sawLowSkill = true;
          continue;
        }
        if (
          isFreeOpenLockType(c.index) &&
          (lockHasPicklockCase(lock) || lockHasKeyItemCase(lock))
        ) {
          continue;
        }
      }

      // Free-open gestures: SkillByLockType → SKILL_NONE (OPEN_KNEELING / OPEN / …).
      // Cite: SharedDefines.h SkillByLockType default branch returns SKILL_NONE → no skill check.
      if (isFreeOpenLockType(c.index)) {
        return { ok: true };
      }

      let req = c.skill;
      const isDisarm =
        opts.isDisarmTrap || c.index === LOCKTYPE_DISARM_TRAP;
      if (isDisarm && opts.trapGoLevel != null) {
        req = opts.trapGoLevel * 5; // Spell.cpp CanOpenLock DISARM_TRAP branch
      }
      const have =
        opts.skillValueFor?.(c.index) ??
        opts.skillValue ??
        0;
      if (have < req) {
        sawLowSkill = true;
        continue;
      }
      return { ok: true };
    }
  }
  // A mixed item-and-skill lock with the key missing reports bad targets, so the interact path can
  // name the key. A pure skill lock reports low skill.
  if (sawItemCase && !itemMatched) return { ok: false, reason: 'bad_targets' };
  if (sawLowSkill) return { ok: false, reason: 'low_skill' };
  if (reqKey) return { ok: false, reason: 'bad_targets' };
  return { ok: true };
}

// The first inventory LOCK_KEY_ITEM case that can open the lock, used to pick which key entry to
// consume. Cite: Spell.cpp CanOpenLock; TakeCastItem destroys only expendable cast items.
export function matchingKeyItemEntry(
  lock: LockDef | undefined,
  hasItem: (itemEntry: number) => boolean,
): number | undefined {
  if (!lock || lock.id === 0 || !lock.cases.length) return undefined;
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_ITEM && c.index > 0 && hasItem(c.index)) {
      if (canOpenLock({ lock, keyItemEntry: c.index }).ok) return c.index;
    }
  }
  return undefined;
}

/** First LOCK_KEY_ITEM index on the lock (for honest "need key X" strings), or undefined. */
export function requiredKeyItemEntry(lock: LockDef | undefined): number | undefined {
  if (!lock || !lock.cases.length) return undefined;
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_ITEM && c.index > 0) return c.index;
  }
  return undefined;
}

// Best skill-gated case for honest skip / refuse strings when the player cannot open. Prefers skilled
// LockTypes (picklock/herb/mine/fish) with the highest req.
export function hardestSkillLockCase(
  lock: LockDef | undefined,
): { lockType: number; skillReq: number; skillName: string } | undefined {
  if (!lock) return undefined;
  let best: { lockType: number; skillReq: number; skillName: string } | undefined;
  for (const c of lock.cases) {
    if (c.type !== LOCK_KEY_SKILL) continue;
    if (isFreeOpenLockType(c.index) || c.index === LOCKTYPE_NONE) continue;
    if (skillByLockType(c.index) === SKILL_NONE) continue;
    const skillReq = c.skill ?? 0;
    if (!best || skillReq > best.skillReq) {
      best = {
        lockType: c.index,
        skillReq,
        skillName: skillNameForLockType(c.index),
      };
    }
  }
  return best;
}

// Whether opening with this key should consume it: only when SpellCharges is NEGATIVE, which is the
// column's way of saying "destroy at 0". ItemDef.charges mirrors that column sign and all.
export function isExpendableLockKeyItem(
  itemEntry: number,
  item?: { charges?: number } | null,
): boolean {
  void itemEntry;
  if (item?.charges != null) return item.charges < 0;
  // Field omitted → the bake never reached this row; Classic's common case is single-use (−1).
  return true;
}

// Honest world-panel lock affordance when the player cannot open: an item lock names the key and a
// skill lock names the skill and value. Null when the inventory already satisfies the lock.
export function lockAffordanceLabel(
  lock: LockDef | undefined,
  opts: {
    hasItem: (itemEntry: number) => boolean;
    /** Baked GameObjectDef.keyId when present. */
    keyId?: number;
    itemName?: (itemEntry: number) => string | undefined;
    skillValue?: number;
    spellLockType?: number;
    skillValueFor?: (lockType: number) => number | undefined;
  },
): string | null {
  if (inventorySatisfiesLock(lock, opts.hasItem, {
    skillValue: opts.skillValue,
    spellLockType: opts.spellLockType,
    skillValueFor: opts.skillValueFor,
  })) {
    return null;
  }
  const keyEntry = (opts.keyId != null && opts.keyId > 0)
    ? opts.keyId
    : requiredKeyItemEntry(lock);
  if (keyEntry != null && keyEntry > 0 && !opts.hasItem(keyEntry)) {
    const name = opts.itemName?.(keyEntry) ?? `item ${keyEntry}`;
    return `Locked - need ${name}`;
  }
  const hard = hardestSkillLockCase(lock);
  if (hard) {
    return `Needs ${hard.skillName} ${hard.skillReq}`;
  }
  return 'Locked';
}

export function inventorySatisfiesLock(
  lock: LockDef | undefined,
  hasItem: (itemEntry: number) => boolean,
  opts?: {
    skillValue?: number;
    spellLockType?: number;
    skillValueFor?: (lockType: number) => number | undefined;
  },
): boolean {
  if (!lock || lock.id === 0 || !lock.cases.length) return true;

  // Free-open skill cases open without inventory/skill (interact path).
  if (canOpenLock({
    lock,
    spellLockType: opts?.spellLockType,
    skillValue: opts?.skillValue,
    skillValueFor: opts?.skillValueFor,
  }).ok) {
    return true;
  }

  let hasKeyItemCase = false;
  let hasHardSkillCase = false;
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_ITEM && c.index > 0) {
      hasKeyItemCase = true;
      if (
        hasItem(c.index) &&
        canOpenLock({
          lock,
          keyItemEntry: c.index,
          spellLockType: opts?.spellLockType,
          skillValue: opts?.skillValue,
          skillValueFor: opts?.skillValueFor,
        }).ok
      ) {
        return true;
      }
    } else if (c.type === LOCK_KEY_SKILL && !isFreeOpenLockType(c.index) && c.index !== LOCKTYPE_NONE) {
      hasHardSkillCase = true;
      if (opts?.skillValue != null || opts?.skillValueFor != null) {
        if (
          canOpenLock({
            lock,
            spellLockType: opts.spellLockType ?? c.index,
            skillValue: opts.skillValue,
            skillValueFor: opts.skillValueFor,
          }).ok
        ) {
          return true;
        }
      }
    }
  }

  if (!hasKeyItemCase) {
    // Skill-only: UI offers interact when skill is unknown; engine is source of truth.
    if (opts?.skillValue == null && opts?.skillValueFor == null) return true;
    return false;
  }
  if (hasHardSkillCase && (opts?.skillValue != null || opts?.skillValueFor != null)) {
    return canOpenLock({
      lock,
      spellLockType: opts?.spellLockType,
      skillValue: opts?.skillValue,
      skillValueFor: opts?.skillValueFor,
    }).ok;
  }
  return false;
}
