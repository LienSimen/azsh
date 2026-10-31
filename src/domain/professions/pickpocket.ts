// Pick Pocket (spell 921) — pure rogue action helpers. Loot math is not duplicated: a pickpocket
// table is just another lootId. Injected Rng and nowMs only. Cite: SpellEffects.cpp:2662–2706.

import { CLASS } from '../../data/schema.ts';
import type { Rng } from '../../engine/core/rng.ts';
import { skillMaxForLevel } from '../../engine/combat/mitigation.ts';
import {
  rollLootDeep,
  type LootDrop,
  type LootTableLookup,
} from '../items/loot.ts';

/** Classic spell id for Pick Pocket. Do not invent other ids. */
export const PICK_POCKET_SPELL_ID = 921;

// Default restock delay seconds (World.cpp CreaturePickpocketRestockDelay = 600). Pure map helpers use this
// when callers omit an override.
export const PICKPOCKET_RESTOCK_DELAY_SEC = 600;

export const PICKPOCKET_ERR = {
  NOT_ROGUE: 'Only rogues can pick pockets',
  DEAD: 'That target is dead',
  NO_POCKETS: 'Target has no pockets',
  STEALTH: 'You must be stealthed',
  ALREADY: 'Already pickpocketed',
  NO_TABLE: 'Nothing to steal',
  FAILED: 'Pick pocket failed',
} as const;

export type CanPickPocketResult =
  | { ok: true }
  | { ok: false; reason: string };

// Pre-flight gates for Pick Pocket (class / life / stealth). CheckCast gates the TARGET on
// PickpocketLootId alone — no creature-type test, and spell 921 carries no targetCreatureTypeMask —
// so the caller's table lookup is the type answer. 253 of the 1569 baked tables are undead, demon
// or totem. Cite: Spell.cpp:5501-5511 SPELL_EFFECT_PICKPOCKET.
export function canPickPocket(opts: {
  /** CLASS.ROGUE required. */
  cls: number;
  // When true, stealth gate passes. When false, refuse (spell 921 requiresStealth). When omitted, stealth
  // is not checked (caller / fixtures may skip).
  stealthOk?: boolean;
  /** Pickpocket is a living-target action. */
  targetAlive: boolean;
}): CanPickPocketResult {
  if (opts.cls !== CLASS.ROGUE) {
    return { ok: false, reason: PICKPOCKET_ERR.NOT_ROGUE };
  }
  if (!opts.targetAlive) {
    return { ok: false, reason: PICKPOCKET_ERR.DEAD };
  }
  if (opts.stealthOk === false) {
    return { ok: false, reason: PICKPOCKET_ERR.STEALTH };
  }
  return { ok: true };
}

export type RollPickPocketResult =
  | { ok: true; drops: LootDrop[]; aggro: boolean; goldCopper: number }
  | { ok: false; reason: string; aggro?: boolean };

// Orange skill fail (Spell.cpp ~5494): reqSkillValue > irand(skillValue - 25, skillValue + 37),
// applied only when skillValue is given. req is skillMaxForLevel(targetLevel) = level × 5.
export function pickPocketSkillFails(
  skillValue: number,
  targetLevel: number,
  rng: Rng,
): boolean {
  const req = skillMaxForLevel(targetLevel);
  const lo = skillValue - 25;
  const hi = skillValue + 37;
  const roll = rng.int(lo, hi);
  return req > roll;
}

// Extra pickpocket copper: a = urand(0, creatureLevel/2), b = urand(0, playerLevel/2), then
// gold = 10 * (a + b) * rate. Cite: LootMgr.cpp LOOT_PICKPOCKETING 1743–1746.
export function rollPickPocketGold(
  playerLevel: number,
  targetLevel: number,
  rng: Rng,
): number {
  const a = rng.int(0, Math.floor(Math.max(0, targetLevel) / 2));
  const b = rng.int(0, Math.floor(Math.max(0, playerLevel) / 2));
  return 10 * (a + b);
}

// Live-bake namespaced key for a creature's pickpocket table. Cite: enrich-loot-tables.mjs prefix
// `pickpocket`; dataStore.normalizeLootKey.
export function pickpocketLootKey(creatureEntry: number): string {
  return `pickpocket:${creatureEntry | 0}`;
}

// Roll pickpocket loot for a valid loot id; a missing pickpocketLootId refuses (TARGET_NO_POCKETS).
// Live bake ids are strings pickpocket:<entry>. An orange fail may set aggro without drops.
export function rollPickPocket(opts: {
  /** Numeric fixture id or namespaced `pickpocket:<entry>` from live bake. */
  pickpocketLootId: number | string;
  getTable: LootTableLookup;
  rng: Rng;
  playerLevel: number;
  targetLevel: number;
  /** When set, may fail vs target level skill cap (orange formula). */
  skillValue?: number;
  /** Skip skill fail roll even if skillValue set (tests / always-succeed fixtures). */
  skipSkillCheck?: boolean;
}): RollPickPocketResult {
  const rawId = opts.pickpocketLootId;
  if (typeof rawId === 'number') {
    if ((rawId | 0) <= 0) {
      return { ok: false, reason: PICKPOCKET_ERR.NO_POCKETS };
    }
  } else if (typeof rawId !== 'string' || !rawId) {
    return { ok: false, reason: PICKPOCKET_ERR.NO_POCKETS };
  }
  const lootId = typeof rawId === 'number' ? (rawId | 0) : rawId;

  if (
    opts.skillValue != null
    && opts.skipSkillCheck !== true
    && pickPocketSkillFails(opts.skillValue, opts.targetLevel, opts.rng)
  ) {
    return { ok: false, reason: PICKPOCKET_ERR.FAILED, aggro: true };
  }

  const table = opts.getTable(lootId);
  if (!table || table.length === 0) {
    // Empty baked table: still a valid id that FillLoot would process (0 drops).
    // Refuse only when lookup returns undefined (unknown id) — empty array = no drops.
    if (table === undefined) {
      return { ok: false, reason: PICKPOCKET_ERR.NO_TABLE };
    }
  }

  const drops = table && table.length > 0
    ? rollLootDeep(table, opts.getTable, opts.rng)
    : [];
  const goldCopper = rollPickPocketGold(opts.playerLevel, opts.targetLevel, opts.rng);
  return { ok: true, drops, aggro: false, goldCopper };
}

// ---- Restock timers (pure; injected nowMs) ------------------------------------

/** spawnKey → next ready wall-clock ms. */
export type PickpocketRestockMap = Record<string, number>;

// Whether this spawn can be pickpocketed again at nowMs. Missing key → ready. Cite: Creature.cpp
// CanRestockPickpocketLoot.
export function canRestockPickpocket(
  map: PickpocketRestockMap | undefined,
  spawnKey: string,
  nowMs: number,
): boolean {
  if (!map) return true;
  const readyAt = map[spawnKey];
  if (readyAt == null) return true;
  return nowMs >= readyAt;
}

// Mark pickpocketed: next ready after restock delay. Default delay = PICKPOCKET_RESTOCK_DELAY_SEC * 1000
// (World.cpp 600s).
export function startPickpocketRestock(
  map: PickpocketRestockMap | undefined,
  spawnKey: string,
  nowMs: number,
  delaySec: number = PICKPOCKET_RESTOCK_DELAY_SEC,
): PickpocketRestockMap {
  const next = { ...(map ?? {}) };
  next[spawnKey] = nowMs + Math.max(0, delaySec) * 1000;
  return next;
}
