// Openable container items — the bag, box, clam or lockbox you right-click. DIVERGENCE: the client
// needs two gestures for a locked box, and canOpenContainer folds the unlock into the open.

import type { ItemDef } from '../../data/schema.ts';
import { skillMaxForLevel } from '../../engine/combat/mitigation.ts';
import {
  raceClassCanLearnSkill,
  SKILL_LOCKPICKING,
  type CombatSkillMeta,
} from '../character/combatSkills.ts';
import { LOCK_KEY_ITEM, LOCK_KEY_SKILL, picklockSkillReq, type LockDef } from '../world/openLock.ts';
import type { PartyWorker } from '../professions/partyWork.ts';
import type { Companion } from '../bots/squad.ts';
import { playerLockpickingForLocks } from '../professions/poisons.ts';

export { playerLockpickingForLocks };

// A Lock.dbc skill case's index is a LOCKTYPE, not a skill id, and only LOCKTYPE_PICKLOCK maps to
// SKILL_LOCKPICKING. Treating the skill-0 OPEN and TREASURE cases as satisfied opened every box.
export const LOCKTYPE_PICKLOCK = 1;

/** SharedDefines.h CLASS_ROGUE — only rogues train Lockpicking (skill 633). */
export const CLASS_ROGUE = 4;

/** Roster rogue who can pick locks (skill = L×5, same curve as weapon skill). */
export interface PartyLockpicker {
  id: string;
  name: string;
  skill: number;
  level: number;
}

/** Squad, bench and raid bodies, minus anyone away on a mission. Cite: partyDisenchant.resolveRosterEnchanters. */
export function lockpickCompanionPool(
  squad: readonly Companion[] | undefined,
  botRoster: Readonly<Record<string, Companion>> | undefined,
  raidMembers: Readonly<Record<string, Companion>> | undefined,
): Companion[] {
  const byId = new Map<string, Companion>();
  const push = (c: Companion): void => {
    if (c.mission || byId.has(c.id)) return;
    byId.set(c.id, c);
  };
  for (const c of squad ?? []) push(c);
  for (const c of Object.values(botRoster ?? {})) push(c);
  for (const c of Object.values(raidMembers ?? {})) push(c);
  return [...byId.values()];
}

// Companion lockpicking value. Rogues keep the line maxed at L×5, so a level-25 rogue covers
// Strong Iron (125) without a skill-up loop on bots. Cite: SkillRaceClassInfo skill 633.
export function companionLockpickingSkill(
  comp: Pick<Companion, 'cls' | 'race' | 'level'>,
  playerLevel: number,
  meta?: CombatSkillMeta | null,
): number | undefined {
  if ((comp.cls | 0) !== CLASS_ROGUE) return undefined;
  // Same cap as companionLevel / weapon skill: L×5, clamped 1–60.
  const level = Math.max(1, Math.min(60, comp.level ?? playerLevel));
  if (!raceClassCanLearnSkill(meta, SKILL_LOCKPICKING, comp.race | 0, CLASS_ROGUE, level)) {
    return undefined;
  }
  return skillMaxForLevel(level);
}

// Player first if they trained the line (kept at L×5). Companion rogues are derived at the cap.
export function lockpickWorkers(
  opts: {
    playerName: string;
    /** Player's trained Lockpicking (undefined when they never learned it). */
    playerSkill?: number;
    playerMax?: number;
    playerLevel: number;
    squad?: readonly Companion[];
    meta?: CombatSkillMeta | null;
    /** Lock.dbc picklock requirement — the red level the player's gain chance is read against. */
    required: number;
    /** gatherSkillGainChanceTenths(current, required); injected so domain stays import-light. */
    gainTenths: (current: number, max: number, required: number) => number;
  },
): { candidates: PartyWorker[]; holders: PartyWorker[] } {
  const candidates: PartyWorker[] = [];
  const holders: PartyWorker[] = [];
  const consider = (w: PartyWorker): void => {
    holders.push(w);
    if (w.skill >= opts.required) candidates.push(w);
  };
  if (opts.playerSkill != null && opts.playerSkill > 0) {
    const max = opts.playerMax ?? skillMaxForLevel(opts.playerLevel);
    consider({
      name: opts.playerName,
      skill: opts.playerSkill,
      max,
      gainTenths: opts.gainTenths(opts.playerSkill, max, opts.required),
    });
  }
  for (const m of opts.squad ?? []) {
    const skill = companionLockpickingSkill(m, opts.playerLevel, opts.meta);
    if (skill == null) continue;
    // At the L×5 cap by construction — no point is reachable, so gainTenths is 0.
    consider({ compId: m.id, name: m.name, skill, max: skill, gainTenths: 0 });
  }
  return { candidates, holders };
}

/** Highest-skill roster rogue who meets `minSkill` (0 = any rogue with the line). */
export function findPartyLockpicker(
  squad: readonly Companion[] | undefined,
  playerLevel: number,
  minSkill: number,
  meta?: CombatSkillMeta | null,
): PartyLockpicker | null {
  if (!squad?.length) return null;
  let best: PartyLockpicker | null = null;
  for (const m of squad) {
    const skill = companionLockpickingSkill(m, playerLevel, meta);
    if (skill == null || skill < minSkill) continue;
    const level = Math.max(1, Math.min(60, m.level ?? playerLevel));
    if (!best || skill > best.skill) {
      best = { id: m.id, name: m.name, skill, level };
    }
  }
  return best;
}

// The GROUP's Lockpicking value — the player's trained line or the best roster rogue's, whichever
// is higher. This is what a lock GATE reads; who picks it is pickPartyWorker's call.
export function groupLockpickingSkill(
  playerSkill: number | undefined,
  playerLevel: number,
  squad: readonly Companion[] | undefined,
  meta?: CombatSkillMeta | null,
): number | undefined {
  const rogue = findPartyLockpicker(squad, playerLevel, 0, meta);
  if (rogue == null) return playerSkill;
  return playerSkill == null ? rogue.skill : Math.max(playerSkill, rogue.skill);
}

/** Lockpicking skill required by a container's Lock.dbc row (0 when not pick-gated). */
export function containerPicklockReq(lock: LockDef | undefined): number {
  return picklockSkillReq(lock);
}

export type ContainerRefusal =
  | { ok: false; reason: string; kind: 'no_loot' | 'level' | 'unknown_lock' | 'needs_key' | 'needs_skill' };
export type ContainerOpenCheck = { ok: true; keyItemEntry?: number } | ContainerRefusal;

// Does this item open into other items? True when the bake carries an item:<entry> loot table,
// the same signal the core uses. Never name-matched — "box" in a name means nothing.
export function isOpenableContainer(
  def: Pick<ItemDef, 'entry'> | undefined,
  hasItemLootTable: (entry: number) => boolean,
): boolean {
  if (!def) return false;
  return hasItemLootTable(def.entry);
}

// A container the auto-opener may consume unattended: no lock, because HandleOpenItemOpcode refuses
// a plain open on any skill case (SpellHandler.cpp:210), and no quest item, which may be handed in.
export function isAutoOpenContainer(
  def: Pick<ItemDef, 'entry' | 'lockId' | 'questItem'> | undefined,
  hasItemLootTable: (entry: number) => boolean,
): boolean {
  if (!def) return false;
  if ((def.lockId ?? 0) > 0) return false;
  if (def.questItem) return false;
  return isOpenableContainer(def, hasItemLootTable);
}

// Whether `def` can be opened right now, and which key item (if any) the open consumes. Mirrors
// HandleOpenItemOpcode's order so the refusal a player sees is the client's refusal.
export function canOpenContainer(opts: {
  def: ItemDef;
  level: number;
  hasItemLootTable: (entry: number) => boolean;
  /** Lock.dbc row for def.lockId (undefined when the id is unknown to the bake). */
  lock?: LockDef;
  /** Does the player hold this item entry? (key cases) */
  hasItem: (entry: number) => boolean;
  /** Player's Lockpicking skill value, when they have the skill at all. */
  lockpickingSkill?: number;
}): ContainerOpenCheck {
  const { def, level, lock } = opts;
  if (!isOpenableContainer(def, opts.hasItemLootTable)) {
    return { ok: false, reason: 'There is nothing inside', kind: 'no_loot' };
  }
  // :192 — level gate comes before the lock, so a low-level rogue is told the honest reason.
  if ((def.requiredLevel ?? 0) > level) {
    return { ok: false, reason: `Requires level ${def.requiredLevel}`, kind: 'level' };
  }
  const lockId = def.lockId ?? 0;
  if (lockId === 0) return { ok: true };

  // :204 — a lockId with no Lock.dbc row is locked, full stop (the core logs and refuses).
  if (!lock || lock.id === 0) {
    return { ok: false, reason: 'Item is locked', kind: 'unknown_lock' };
  }
  if (!lock.cases.length) return { ok: true };

  // A key the player holds opens it (and is consumed on open, like a cast item).
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_ITEM && c.index > 0 && opts.hasItem(c.index)) {
      return { ok: true, keyItemEntry: c.index };
    }
  }
  // Skill cases: the C++ refuses a plain open outright. We allow it when the player actually has
  // Lockpicking at the value, which is what casting it would achieve. PICKLOCK cases only.
  let pickReq: number | undefined;
  let sawKeyCase = false;
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_SKILL) {
      if (c.index !== LOCKTYPE_PICKLOCK) continue;
      const req = c.skill ?? 0;
      if ((opts.lockpickingSkill ?? -1) >= req) return { ok: true };
      if (pickReq == null || req > pickReq) pickReq = req;
    } else if (c.type === LOCK_KEY_ITEM && c.index > 0) {
      sawKeyCase = true;
    }
  }
  const bestSkillReq = pickReq;
  if (bestSkillReq != null) {
    return {
      ok: false,
      reason: opts.lockpickingSkill == null
        ? `Locked - needs Lockpicking ${bestSkillReq} or a key`
        : `Locked - needs Lockpicking ${bestSkillReq} (you have ${opts.lockpickingSkill})`,
      kind: 'needs_skill',
    };
  }
  return {
    ok: false,
    reason: sawKeyCase ? 'Locked - you need the key' : 'Item is locked',
    kind: sawKeyCase ? 'needs_key' : 'unknown_lock',
  };
}

/** Label for the open button, so every surface words it the same way. */
export function containerOpenLabel(def: Pick<ItemDef, 'lockId'>): string {
  return (def.lockId ?? 0) > 0 ? 'Unlock' : 'Open';
}

/** Party-rogue affordance when the player cannot pick the lock themselves. */
export function containerOpenWithLabel(rogueName: string): string {
  return `Open with ${rogueName}`;
}
