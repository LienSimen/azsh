// Which quests the interpreter "claims" for dual-oracle parity: those fully covered by the
// special-flag updaters and mapping 1:1 onto the pre-QI slim questlog model.

import type { QuestDef } from '../../../data/schema.ts';
import {
  QUEST_FLAGS_AUTO_REWARDED,
  QUEST_OBJECTIVES_COUNT,
  QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT,
  computeSpecialFlags,
  hasQuestFlag,
  hasSpecialFlag,
} from './flags.ts';

export type Qi2ClaimReason =
  | 'no_raw'
  | 'has_req_spell'
  | 'has_source_items'
  | 'has_rep_objective'
  | 'auto_rewarded'
  | 'slim_raw_mismatch'
  | 'empty_no_explore'
  | 'rep_only'
  | 'claimed_kill'
  | 'claimed_item'
  | 'claimed_go'
  | 'claimed_explore'
  | 'claimed_mixed';

export interface Qi2Claim {
  claimed: boolean;
  reason: Qi2ClaimReason;
}

// True when QI2 can evaluate completion with oracle parity against the pre-QI questlog: raw
// objectives present, no ReqSpell or source items, and Req* arrays round-tripping the slim targets.
export function claimQuest(quest: QuestDef): Qi2Claim {
  const raw = quest.rawObjectives;
  if (!raw) return { claimed: false, reason: 'no_raw' };

  for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
    if ((raw.reqSpell[j] ?? 0) > 0) {
      return { claimed: false, reason: 'has_req_spell' };
    }
  }

  // Slim sourcesMet / use-credit is outside Player::CanCompleteQuest DELIVER.
  // Gate (a) oracle vs pre-QI questlog would diverge — leave for QI2.5.
  if ((quest.sourceItemTargets?.length ?? 0) > 0) {
    return { claimed: false, reason: 'has_source_items' };
  }

  // AUTO_REWARDED uses a lighter CanComplete path (Player.cpp:12239) that needs
  // Satisfy* hooks; pre-QI questlog has no equivalent — dual-oracle would diverge.
  if (hasQuestFlag(quest.questFlags, QUEST_FLAGS_AUTO_REWARDED)) {
    return { claimed: false, reason: 'auto_rewarded' };
  }

  // Rep objective: CanCompleteQuest always checks standing (Player.cpp:12288) while pre-QI only
  // gates pure-rep with standingFor. Unclaim until the dual paths align.
  const rawRepFac = raw.repFaction ?? 0;
  const rawRepVal = raw.repValue ?? 0;
  const slimRep =
    quest.repObjective && (quest.repObjective.value || 0) > 0
      ? quest.repObjective
      : undefined;
  if ((rawRepFac && rawRepVal) || slimRep) {
    return { claimed: false, reason: 'has_rep_objective' };
  }

  let hasItem = false;
  let hasCreature = false;
  let hasGo = false;
  const rawItems: Array<[number, number]> = [];
  const rawKills: Array<[number, number]> = [];
  const rawGos: Array<[number, number]> = [];
  for (let j = 0; j < QUEST_OBJECTIVES_COUNT; j++) {
    const itemId = raw.reqItemId[j] ?? 0;
    const itemN = raw.reqItemCount[j] ?? 0;
    if (itemId > 0) {
      hasItem = true;
      rawItems.push([itemId, itemN]);
    }
    const id = raw.reqCreatureOrGoId[j] ?? 0;
    const n = raw.reqCreatureOrGoCount[j] ?? 0;
    if (id > 0) {
      hasCreature = true;
      rawKills.push([id, n]);
    }
    if (id < 0) {
      hasGo = true;
      rawGos.push([-id, n]);
    }
  }

  // Round-trip raw ↔ slim so dual-oracle compares the same objectives.
  const slimItems = (quest.itemTargets ?? []).map((t) => [t.item, t.count] as [number, number]);
  const slimKills = (quest.killTargets ?? []).map(
    (t) => [t.creatureEntry, t.count] as [number, number],
  );
  const slimGos = (quest.objectTargets ?? []).map(
    (t) => [t.objectEntry, t.count] as [number, number],
  );
  if (JSON.stringify(rawItems) !== JSON.stringify(slimItems)) {
    return { claimed: false, reason: 'slim_raw_mismatch' };
  }
  if (JSON.stringify(rawKills) !== JSON.stringify(slimKills)) {
    return { claimed: false, reason: 'slim_raw_mismatch' };
  }
  if (JSON.stringify(rawGos) !== JSON.stringify(slimGos)) {
    return { claimed: false, reason: 'slim_raw_mismatch' };
  }

  const flags = computeSpecialFlags(quest);
  const hasExplore = hasSpecialFlag(flags, QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT);

  if (!hasItem && !hasCreature && !hasGo && !hasExplore) {
    return { claimed: false, reason: 'empty_no_explore' };
  }

  if (hasItem && !hasCreature && !hasGo && !hasExplore) {
    return { claimed: true, reason: 'claimed_item' };
  }
  if (hasCreature && !hasItem && !hasGo && !hasExplore) {
    return { claimed: true, reason: 'claimed_kill' };
  }
  if (hasGo && !hasItem && !hasCreature && !hasExplore) {
    return { claimed: true, reason: 'claimed_go' };
  }
  if (hasExplore && !hasItem && !hasCreature && !hasGo) {
    return { claimed: true, reason: 'claimed_explore' };
  }
  return { claimed: true, reason: 'claimed_mixed' };
}

export function isClaimedByQi2(quest: QuestDef): boolean {
  return claimQuest(quest).claimed;
}
