/** Host consume for MEETINGSTONE Use: cast 23598 → EffectTransmitted portal. Cite: GameObject.cpp:1864–1892, :1955–1973. */

import type { DataStore } from '../../data/dataStore.ts';
import type { UseGameObjectCtx } from '../../domain/world/gameObjects.ts';
import { MEETINGSTONE_SUMMON_SPELL_ID } from '../../domain/world/gameObjects.ts';
import { companionLevel, type Companion } from '../../domain/bots/squad.ts';
import { SPELL_EFFECT_TRANS_DOOR } from '../spells/interpreter/opcodes.ts';
import { durMs } from '../spells/interpreter/duration.ts';
import type { WildSummonedObject } from './summonObjectWild.ts';

/** First in-range squad member, else first member (C++ selection has no UI here). */
export function meetingStoneGroupTarget(
  squad: readonly Companion[] | undefined,
  playerLevel: number,
  minLevel: number,
  maxLevel: number,
): Companion | undefined {
  const members = squad ?? [];
  if (!members.length) return undefined;
  const inRange = members.find((c) => {
    const lvl = companionLevel(c, playerLevel);
    return lvl >= minLevel && lvl <= maxLevel;
  });
  return inRange ?? members[0];
}

export function meetingStoneUseCtx(
  playerLevel: number,
  target: Companion | undefined,
): Pick<UseGameObjectCtx, 'playerLevel' | 'targetLevel' | 'hasGroupTarget'> {
  return {
    playerLevel,
    targetLevel: target ? companionLevel(target, playerLevel) : undefined,
    hasGroupTarget: !!target,
  };
}

/** Place the Meeting Stone Summoning Portal from spell 23598 EffectTransmitted. */
export function placeMeetingStoneSummon(
  ds: DataStore,
  nowMs: number,
  spellId: number = MEETINGSTONE_SUMMON_SPELL_ID,
): WildSummonedObject | null {
  const spell = ds.spell(spellId);
  const raw = spell?.rawEffects?.find((e) => (e.effect | 0) === SPELL_EFFECT_TRANS_DOOR);
  const goEntry = (raw?.miscValue ?? 0) | 0;
  if (goEntry <= 0) return null;
  const durationMs = durMs(spell?.durationIndex) || (spell?.channelMs ?? 0) | 0;
  return {
    goEntry,
    spellId: spellId | 0,
    expiresAtMs: durationMs > 0 ? nowMs + durationMs : 0,
  };
}
