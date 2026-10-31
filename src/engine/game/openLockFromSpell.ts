// SPELL_EFFECT_OPEN_LOCK: the open applies only when a GO or item target is set, matching the C++
// early return; without one the cast still succeeds for its co-slots. Cite: SpellEffects.cpp:2204-2274.

import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import type { GoRuntimeState } from '../../domain/world/gameObjects.ts';
import {
  canOpenLock,
  type LockDef,
} from '../../domain/world/openLock.ts';
import { resolveSpellEffects } from '../spells/interpreter/index.ts';

export type OpenLockEffect = Extract<SpellEffect, { kind: 'open_lock' }>;

export interface OpenLockApplied {
  skillBonus: number;
  fromItem: boolean;
  lockType?: number;
  /** GO template entry when the open targeted a game object. */
  goEntry?: number;
  /** Item template entry when the open targeted a bag/lockbox item. */
  itemEntry?: number;
  /** GO path: runtime open after successful CanOpenLock. */
  open?: boolean;
  /** Item path: ITEM_DYNFLAG_UNLOCKED parity. */
  unlocked?: boolean;
  /** Player-visible activity line. */
  message: string;
}

export interface ApplyOpenLockResult {
  applied: OpenLockApplied[];
  goRuntime: Record<string, GoRuntimeState> | undefined;
  /** Item entries marked unlocked this apply (ITEM_DYNFLAG_UNLOCKED). */
  unlockedItemEntries: number[];
}

/** Collect materialized open_lock effects (order preserved). */
export function collectOpenLockEffects(
  spell: SpellDef | null | undefined,
): OpenLockEffect[] {
  if (!spell) return [];
  const fromEffects = (spell.effects ?? []).filter(
    (e): e is OpenLockEffect => e.kind === 'open_lock',
  );
  if (fromEffects.length) return fromEffects;
  // Intent path covers resolveSpellEffects-only consumers (pre-materialize / hollow bake).
  if (!spell.rawEffects?.length) return [];
  const out: OpenLockEffect[] = [];
  for (const intent of resolveSpellEffects(spell, {}).intents ?? []) {
    if (intent.kind !== 'open_lock') continue;
    out.push({
      kind: 'open_lock',
      skillBonus: intent.skillBonus,
      fromItem: intent.fromItem,
      ...(intent.lockType != null ? { lockType: intent.lockType } : {}),
    });
  }
  return out;
}

// Apply each OPEN_LOCK slot to `targetGoEntry` and/or `targetItemEntry`. No target → empty applied (C++
// EffectOpenLock early-out). Cite: :2217–2228.
export function applyOpenLockFromSpell(
  spell: SpellDef | null | undefined,
  opts: {
    /** gameObjTarget entry. Cite: SpellEffects.cpp:2217–2220. */
    targetGoEntry?: number | null;
    /** itemTarget entry. Cite: SpellEffects.cpp:2221–2224. */
    targetItemEntry?: number | null;
    /** Cast-item entry for LOCK_KEY_ITEM cases. Cite: Spell.cpp CanOpenLock LOCK_KEY_ITEM. */
    castItemEntry?: number | null;
    /** Lock.dbc row for the target GO / item. */
    lock?: LockDef;
    goRuntime?: Record<string, GoRuntimeState>;
    /** Key for goRuntime (`${zoneId}:${entry}` in createGame). */
    goRuntimeKey?: (entry: number) => string;
    /** Display name for activity log. */
    targetName?: string;
  },
): ApplyOpenLockResult {
  const applied: OpenLockApplied[] = [];
  let goRuntime = opts.goRuntime;
  const unlockedItemEntries: number[] = [];

  const goEntry = (opts.targetGoEntry ?? 0) | 0;
  const itemEntry = (opts.targetItemEntry ?? 0) | 0;
  // C++: no gameObjTarget and no itemTarget → return. Cite: :2217–2228.
  if (!goEntry && !itemEntry) {
    return {
      applied,
      goRuntime: opts.goRuntime,
      unlockedItemEntries,
    };
  }

  const effects = collectOpenLockEffects(spell);
  if (!effects.length) {
    return {
      applied,
      goRuntime: opts.goRuntime,
      unlockedItemEntries,
    };
  }

  for (const e of effects) {
    const skillBonus = e.skillBonus | 0;
    const lockType = (e.lockType ?? 0) | 0;
    // CanOpenLock skillValue = CalculateSpellEffectValue. Cite: Spell.cpp:7281.
    const check = canOpenLock({
      lock: opts.lock,
      skillValue: skillBonus,
      // Always pass misc (0 included) so skill cases match EffectMiscValue only.
      // Cite: Spell.cpp:7273–7274 wrong locktype skip.
      spellLockType: lockType,
      keyItemEntry: opts.castItemEntry != null ? (opts.castItemEntry | 0) : undefined,
    });

    if (goEntry) {
      const goName = opts.targetName?.trim() || `object ${goEntry}`;
      if (!check.ok) {
        applied.push({
          skillBonus,
          fromItem: e.fromItem,
          ...(e.lockType != null ? { lockType: e.lockType } : {}),
          goEntry,
          message:
            check.reason === 'low_skill'
              ? `You lack the skill to open ${goName}.`
              : `You cannot open ${goName}.`,
        });
        continue;
      }
      const key = opts.goRuntimeKey?.(goEntry) ?? String(goEntry);
      const prev = goRuntime?.[key] ?? {};
      goRuntime = { ...(goRuntime ?? {}), [key]: { ...prev, open: true } };
      applied.push({
        skillBonus,
        fromItem: e.fromItem,
        ...(e.lockType != null ? { lockType: e.lockType } : {}),
        goEntry,
        open: true,
        message: `You unlock ${goName}.`,
      });
      continue;
    }

    // itemTarget path. Cite: :2255–2266 SetFlag ITEM_DYNFLAG_UNLOCKED + SendLoot.
    const itemName = opts.targetName?.trim() || `item ${itemEntry}`;
    if (!check.ok) {
      applied.push({
        skillBonus,
        fromItem: e.fromItem,
        ...(e.lockType != null ? { lockType: e.lockType } : {}),
        itemEntry,
        message:
          check.reason === 'low_skill'
            ? `You lack the skill to open ${itemName}.`
            : `You cannot open ${itemName}.`,
      });
      continue;
    }
    unlockedItemEntries.push(itemEntry);
    applied.push({
      skillBonus,
      fromItem: e.fromItem,
      ...(e.lockType != null ? { lockType: e.lockType } : {}),
      itemEntry,
      unlocked: true,
      message: `You unlock ${itemName}.`,
    });
  }

  return { applied, goRuntime, unlockedItemEntries };
}
