// Auto Quest setup policy: which quests the run takes on, and where it is allowed to walk.
// PURE: no DOM/RNG/Date — every gate is a function of the baked data plus AutopilotConfig.
//
// Elite is read off the baked creature (`CreatureDef.rank`, CREATURE_ELITE_*), never guessed
// from a quest field: vanilla quest_template has no elite flag, and neither does our bake.

import type { DataStore } from '../data/dataStore.ts';
import type { QuestDef } from '../data/schema.ts';
import type { Inventory } from '../domain/items/inventory.ts';
import type { QuestLog } from '../domain/quests/questlog.ts';
import {
  getQuest,
  isEventTalkQuest,
  isRepeatableQuest,
  isTalkToNpcQuest,
} from '../domain/quests/questlog.ts';
import { difficultyTier, questHasBakedPath } from '../quests/quests.ts';
import type { AutopilotConfig } from './config.ts';

/** A refusal a caller acts on beyond printing `reason` (the run's companion prompt reads this). */
export type QuestGateCode = 'elite-needs-squad';

/** A policy verdict. `reason` is player-facing and lands in the run's honest-skip line. */
export interface QuestGate {
  ok: boolean;
  reason?: string;
  code?: QuestGateCode;
}

const PASS: QuestGate = { ok: true };

/** Fallback "levels above you" band when the knob is turned off but a gate still needs one. */
const DEFAULT_LEVEL_ABOVE = 4;

/**
 * CREATURE_ELITE_* rank of one creature (0 normal, 1 elite, 2 rare-elite, 3 world boss, 4 rare).
 * The bake carries it under `scaling.rank` — measured 2026-08-14: Hogger 448 has
 * `rank: undefined, scaling.rank: 1`, VanCleef 639 scaling.rank 2. Reading only the top-level
 * field scored 0/4245 quests as elite. Same `rank ?? scaling.rank` read as dataStore spawnRankOf.
 */
export function creatureRank(ds: DataStore, entry: number): number {
  const c = ds.creature(entry) as { rank?: number; scaling?: { rank?: number } } | undefined;
  if (!c) return 0;
  return c.rank ?? c.scaling?.rank ?? 0;
}

/**
 * Highest creature rank among a quest's kill targets (0 = every named target is a normal mob).
 * Kill targets only: `farm` droppers are a broad reverse index where the planner already picks
 * the best source, so ranking off it would mark ordinary gather quests elite.
 * Cite: data/schema/constants.ts CREATURE_ELITE; creature.ts `rank`.
 */
export function questEliteRank(ds: DataStore, def: QuestDef): number {
  let rank = 0;
  for (const kt of def.killTargets ?? []) {
    const r = creatureRank(ds, kt.creatureEntry);
    if (r > rank) rank = r;
  }
  return rank;
}

/** True when this quest wants an elite dead. */
export function questIsElite(ds: DataStore, def: QuestDef): boolean {
  return questEliteRank(ds, def) > 0;
}

/**
 * Elite policy for a quest — applies both to accepting it and to advancing one already in the
 * log, so flipping the setting mid-session takes effect on the next planning step.
 * `squadSize` is the number of hired companions who would join the pull.
 */
export function questEliteGate(
  ds: DataStore,
  def: QuestDef,
  cfg: AutopilotConfig,
  squadSize: number,
): QuestGate {
  if (cfg.questEliteMode === 'solo') return PASS;
  if (!questIsElite(ds, def)) return PASS;
  if (cfg.questEliteMode === 'skip') {
    return { ok: false, reason: `elite quest skipped by setup: "${def.title}"` };
  }
  // 'squad': the companions are the reason this is attemptable at all.
  if (squadSize > 0) return PASS;
  return {
    ok: false,
    reason: `elite quest needs a squad and you have none: "${def.title}"`,
    code: 'elite-needs-squad',
  };
}

/**
 * Repeatable quests (SpecialFlags bit 0) are out of the auto run: a rewarded one reads NONE again
 * (Player.cpp:12611), so the offer comes straight back and the run loops on it instead of advancing.
 */
export function questRepeatableGate(def: QuestDef): QuestGate {
  if (!isRepeatableQuest(def)) return PASS;
  return { ok: false, reason: `"${def.title}" is repeatable, Auto Quest leaves it to you` };
}

// 8 cities × Wool/Silk/Mageweave/Runecloth, plus Additional Runecloth. quest_template titles.
const CLOTH_DONATION_TITLES = new Set([
  'A Donation of Wool',
  'A Donation of Silk',
  'A Donation of Mageweave',
  'A Donation of Runecloth',
  'Additional Runecloth',
]);

export function isClothDonationQuest(def: Pick<QuestDef, 'title'>): boolean {
  return CLOTH_DONATION_TITLES.has(def.title);
}

/** Cloth donations farm 60 cloth per city. Auto Quest leaves them. */
export function questClothDonationGate(def: QuestDef): QuestGate {
  if (!isClothDonationQuest(def)) return PASS;
  return { ok: false, reason: `"${def.title}" is a cloth donation, Auto Quest leaves it to you` };
}

/** Level band for auto-accept: one limit for below the character, one for above. */
export function questLevelGate(def: QuestDef, charLevel: number, cfg: AutopilotConfig): QuestGate {
  const lvl = def.questLevel;
  const away = lvl - charLevel;
  const limit = away > 0 ? cfg.questLevelAbove : cfg.questLevelBelow;
  if (!(limit > 0)) return PASS; // 0 = that direction is unlimited
  if (Math.abs(away) <= limit) return PASS;
  return {
    ok: false,
    reason: `"${def.title}" is level ${lvl} (${difficultyTier(lvl, charLevel)}), ${Math.abs(away)} ${away > 0 ? 'above' : 'below'} you - limit is ${limit}`,
  };
}

function questIsOnLevel(def: QuestDef, charLevel: number, cfg: AutopilotConfig): boolean {
  return difficultyTier(def.questLevel, charLevel) !== 'gray' && questLevelGate(def, charLevel, cfg).ok;
}

const chainChildren = new WeakMap<object, Map<number, number[]>>();

function childrenOf(ds: DataStore, entry: number): number[] {
  let idx = chainChildren.get(ds);
  if (!idx) {
    // Built into a const the closure owns: a captured `let` cannot be narrowed past its assignment.
    const built = new Map<number, number[]>();
    const add = (from: number, to: number): void => {
      if (!(from > 0) || !(to > 0) || from === to) return;
      const list = built.get(from);
      if (list) {
        if (!list.includes(to)) list.push(to);
      } else {
        built.set(from, [to]);
      }
    };
    for (const q of ds.quests()) {
      if (q.nextQuest) add(q.entry, q.nextQuest);
      if (q.prevQuest) add(q.prevQuest, q.entry);
    }
    chainChildren.set(ds, built);
    idx = built;
  }
  return idx.get(entry) ?? [];
}

/** True when a later quest in this chain sits in the player's band (not gray, within ±N). */
export function chainHasOnLevelQuest(
  ds: DataStore,
  def: QuestDef,
  charLevel: number,
  cfg: AutopilotConfig,
  log?: QuestLog,
): boolean {
  const seen = new Set<number>([def.entry]);
  const queue = childrenOf(ds, def.entry).slice();
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    if (seen.has(id)) continue;
    seen.add(id);
    const next = ds.quest(id);
    if (!next) continue;
    if (log && getQuest(log, id)?.status === 'turnedIn') continue;
    if (!isRepeatableQuest(next) && !isClothDonationQuest(next) && questIsOnLevel(next, charLevel, cfg)) {
      return true;
    }
    queue.push(...childrenOf(ds, id));
  }
  return false;
}

/** Everything that decides whether Auto Quest will ACCEPT an offered quest. */
export interface QuestAcceptPath {
  log: QuestLog;
  inv: Inventory;
  zoneId: string;
  auras?: readonly number[];
}

export function questAcceptGate(
  ds: DataStore,
  def: QuestDef,
  charLevel: number,
  cfg: AutopilotConfig,
  squadSize: number,
  path?: QuestAcceptPath,
): QuestGate {
  const repeat = questRepeatableGate(def);
  if (!repeat.ok) return repeat;
  const cloth = questClothDonationGate(def);
  if (!cloth.ok) return cloth;
  const leads = chainHasOnLevelQuest(ds, def, charLevel, cfg, path?.log);
  if (difficultyTier(def.questLevel, charLevel) === 'gray') {
    if (!leads) return { ok: false, reason: `"${def.title}" is gray, no XP` };
  } else if (def.questLevel > charLevel) {
    const lvl = questLevelGate(def, charLevel, cfg);
    if (!lvl.ok) return lvl;
  } else {
    const lvl = questLevelGate(def, charLevel, cfg);
    if (!lvl.ok && !leads) return lvl;
  }
  const talk = isTalkToNpcQuest(def) || isEventTalkQuest(def);
  if (!talk) {
    const elite = questEliteGate(ds, def, cfg, squadSize);
    if (!elite.ok) return elite;
  }
  if (!path) return PASS;
  if (talk) return PASS;
  const baked = questHasBakedPath(ds, def, path.log, path.inv, path.zoneId, charLevel, path.auras);
  if (!baked.ok) return { ok: false, reason: baked.reason };
  return PASS;
}

/** Working a log quest: skip gray unless the chain still has on-level work. Band is not re-applied. */
export function questRunGate(
  ds: DataStore,
  def: QuestDef,
  cfg: AutopilotConfig,
  squadSize: number,
  charLevel: number,
  log?: QuestLog,
): QuestGate {
  const cloth = questClothDonationGate(def);
  if (!cloth.ok) return cloth;
  if (
    difficultyTier(def.questLevel, charLevel) === 'gray'
    && !chainHasOnLevelQuest(ds, def, charLevel, cfg, log)
  ) {
    return { ok: false, reason: `"${def.title}" is gray, no XP` };
  }
  return questEliteGate(ds, def, cfg, squadSize);
}

/** Whether the run may travel to `zoneId` (see {@link AutopilotConfig.questZoneSwap}). */
export function zoneSwapGate(
  ds: DataStore,
  zoneId: string,
  charLevel: number,
  cfg: AutopilotConfig,
): QuestGate {
  if (cfg.questZoneSwap === 'any') return PASS;
  if (cfg.questZoneSwap === 'off') {
    return { ok: false, reason: `zone swap is off, ${ds.zone(zoneId)?.name ?? zoneId} is out of bounds` };
  }
  const zone = ds.zone(zoneId);
  const floor = zone?.levelRange?.[0] ?? 0;
  if (!(floor > 0)) return PASS; // no baked band — fail open rather than strand the run
  // Only the floor matters: walking into a zone BELOW your level is never the unsafe direction,
  // so this reads the "above" limit only.
  const band = cfg.questLevelAbove > 0 ? cfg.questLevelAbove : DEFAULT_LEVEL_ABOVE;
  if (floor - charLevel > band) {
    return {
      ok: false,
      reason: `${zone?.name ?? zoneId} starts at level ${floor}, more than ${band} above you`,
    };
  }
  return PASS;
}
