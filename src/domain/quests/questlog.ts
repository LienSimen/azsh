// Quest log plus the pure CanTakeQuest and Satisfy* gates. Cite: Player.cpp CanTakeQuest ~12198,
// SatisfyQuest* ~12776–13103; QuestHandler.cpp getDialogStatus ~628.
import type { ItemDef, QuestDef } from '../../data/schema.ts';
import type { Inventory } from '../items/inventory.ts';
import { countItem } from '../items/inventory.ts';
// QI5 cutover — interpreter CanCompleteQuest (lazy-safe static imports; live.ts does not import questlog).
import { canCompleteQuest } from './interpreter/canComplete.ts';
import {
  shouldUseQuestInterpreter,
  statusFromQuestState,
} from './interpreter/live.ts';
import { QUEST_SPECIAL_FLAG_REPEATABLE } from './interpreter/flags.ts';

export type QuestStatus = 'active' | 'complete' | 'turnedIn' | 'failed';

// QuestSpecialFlags bit 2: an exploration areatrigger or scripted event credit. Escort quests bake
// it with empty targets, so without requiring m_explored they free-complete on accept (KI-082).
export const QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT = 2;

export interface QuestState {
  entry: number;
  status: QuestStatus;
  kills: Record<string, number>; // creatureEntry (as string) -> count
  objects: Record<string, number>; // objectEntry (as string) -> count  (GameObject / chest / interact for Wave 3)
  // Spell-cast objective progress (ReqSpellCast* / spellCastTargets). spell id (string) → casts. Optional
  // on pre-FO3 saves → treat as {}. Cite: Player.cpp CastedCreatureOrGO; FO3.
  spells?: Record<string, number>;
  // AreaExplored or event objective met, for the EXPLORATION_OR_EVENT flag. Optional on pre-H2
  // saves, where it reads false. Cite: Player.cpp AreaExploredOrEventHappens; CanCompleteQuest.
  explored?: boolean;
  // Source-item use-on-target progress: item entry to use count. Optional on old saves. Presence
  // alone does not complete a pure sourceItemTargets quest — see requiresSourceUseCredit.
  uses?: Record<string, number>;
  // Talk-to-NPC or deliver-arrival objective met. Optional on old saves. Gates isTalkToNpcQuest
  // and isDeliverQuest. Cite: Player.cpp TalkedToCreature; KI-845.
  talked?: boolean;
  /** Remaining time in ms for timed quests. Missing/undefined implies no timer. */
  timerMs?: number;
}
export interface QuestLog {
  quests: QuestState[];
}

// Optional CMaNGOS quest template fields not yet baked on every QuestDef. Safe to pass as QuestDef &
// QuestGatingFields; absent fields are ignored. Cite: QuestDef.h / quest_template columns.
export interface QuestGatingFields {
  /** MaxLevel; default unlimited when absent (SatisfyQuestLevel). */
  maxLevel?: number;
  /** ExclusiveGroup; >0 = one-from-all while sibling active/complete. */
  exclusiveGroup?: number;
  /** Other quest entries sharing exclusiveGroup (caller-supplied; no ObjectMgr). */
  exclusiveGroupMembers?: number[];
  requiredSkill?: number;
  requiredSkillValue?: number;
  requiredMinRepFaction?: number;
  requiredMinRepValue?: number;
  requiredMaxRepFaction?: number;
  requiredMaxRepValue?: number;
  /** Race mask (RequiredRaces); 0/absent = any. */
  reqRaceMask?: number;
  /** QuestFlags / special flags bitfield if needed later. */
  specialFlags?: number;
  /** RewMoneyMaxLevel — used by progression/xpGain.questXpValue, not gating. */
  rewMoneyMaxLevel?: number;
  /** When true, quest is disabled (IsActive false). */
  inactive?: boolean;
}

export type GatedQuest = QuestDef & QuestGatingFields;

// Pure player view for CanTakeQuest. Built by the engine from Character + QuestLog + skills/rep. Cite:
// Player.cpp CanTakeQuest reads level/class/race/skills/rep/quest status.
export interface QuestPlayerSnapshot {
  level: number;
  classId: number;
  /** Race id 1..8; used only when quest.reqRaceMask is set. */
  raceId?: number;
  /** skillId → current value; missing skill ⇒ 0. */
  skillValue?: (skillId: number) => number;
  /** Absolute standing for faction (sparse + base resolved by caller). */
  standingFor?: (factionId: number) => number;
  // Quest log / history status. undefined or 'none' = never taken (QUEST_STATUS_NONE). turnedIn ≈ rewarded.
  questStatus?: (entry: number) => QuestStatus | 'none' | undefined;
  /** True if player already has a timed quest (SatisfyQuestTimed). */
  hasActiveTimedQuest?: boolean;
  /** Weekly quest already done this reset (SatisfyQuestWeek). Default allow. */
  weeklyQuestDone?: (entry: number) => boolean;
  /** Condition evaluation for QuestDef.reqCondition. When omitted, defaults to true. */
  conditionEval?: (conditionId: number) => boolean;
}

/** QuestHandler.cpp / QuestDef.h dialog status integers (Classic). */
export const DIALOG_STATUS = {
  NONE: 0,
  UNAVAILABLE: 1,
  CHAT: 2,
  INCOMPLETE: 3,
  REWARD_REP: 4,
  AVAILABLE: 5,
  REWARD_OLD: 6,
  REWARD2: 7,
} as const;
export type DialogStatusCode = (typeof DIALOG_STATUS)[keyof typeof DIALOG_STATUS];

/** Classic race id → bitmask (1 << (race-1)), matching getRaceMask(). */
export function raceMaskFor(raceId: number): number {
  if (raceId < 1 || raceId > 31) return 0;
  return 1 << (raceId - 1);
}

function statusOf(snap: QuestPlayerSnapshot, entry: number): QuestStatus | 'none' {
  const s = snap.questStatus?.(entry);
  return s === undefined ? 'none' : s;
}

// Not already on the quest (any non-NONE). RewardQuest returns a REPEATABLE to QUEST_STATUS_NONE
// with m_rewarded set, so `turnedIn` never blocks re-take. Cite: Player.cpp:13034, :12611.
export function satisfyQuestStatus(
  snap: QuestPlayerSnapshot,
  questEntry: number,
  repeatable = false,
): boolean {
  const s = statusOf(snap, questEntry);
  if (repeatable && s === 'turnedIn') return true;
  // Cite: Player.cpp CanTakeQuest ~12200 - FAILED quests must be abandoned before re-accept.
  // Phonecraft forces the user (or autopilot) to explicitly abandon a failed quest.
  return s === 'none';
}

/** SatisfyQuestLevel: MinLevel ≤ level ≤ MaxLevel (max absent ⇒ no upper bound). */
export function satisfyQuestLevel(snap: QuestPlayerSnapshot, quest: GatedQuest): boolean {
  if (snap.level < quest.minLevel) return false;
  if (quest.maxLevel != null && snap.level > quest.maxLevel) return false;
  return true;
}

/** Classic class id → bitmask bit (1 << (classId-1)), matching getClassMask(). */
export function classMaskFor(classId: number): number {
  if (classId < 1 || classId > 31) return 0;
  return 1 << (classId - 1);
}

// SatisfyQuestClass: a multi-bit reqClassMask tests (mask & classBit) != 0, a single reqClass
// tests equality, and neither means any class. Cite: Player.cpp SatisfyQuestClass.
export function satisfyQuestClass(snap: QuestPlayerSnapshot, quest: GatedQuest): boolean {
  const mask = quest.reqClassMask ?? 0;
  if (mask !== 0) {
    return (mask & classMaskFor(snap.classId)) !== 0;
  }
  if (quest.reqClass == null || quest.reqClass === 0) return true;
  return snap.classId === quest.reqClass;
}

/** SatisfyQuestRace when reqRaceMask present; else true. */
export function satisfyQuestRace(snap: QuestPlayerSnapshot, quest: GatedQuest): boolean {
  const mask = quest.reqRaceMask;
  if (mask == null || mask === 0) return true;
  if (snap.raceId == null) return false;
  return (mask & raceMaskFor(snap.raceId)) !== 0;
}

/** SatisfyQuestSkill: skill value ≥ RequiredSkillValue when skill set. */
export function satisfyQuestSkill(snap: QuestPlayerSnapshot, quest: GatedQuest): boolean {
  const skill = quest.requiredSkill ?? 0;
  if (skill === 0) return true;
  const need = quest.requiredSkillValue ?? 0;
  const have = snap.skillValue?.(skill) ?? 0;
  return have >= need;
}

// Optional lookup / flags for SatisfyQuestPreviousQuest. Cite: Player.cpp SatisfyQuestPreviousQuest
// ~12839–12936.
export interface SatisfyPrevQuestOpts {
  // When prevQuest is set but the prerequisite row was pruned from the bake, treat as met — matching
  // quests.prereqMet.
  prevQuestMissingFromData?: boolean;
  // Resolve another quest's def, for the exclusive-group-all check on the PREVIOUS quest. Without
  // it only the single prevQuest-rewarded check runs. Cite: Player.cpp:12857–12890.
  questDefFor?: (entry: number) => GatedQuest | undefined;
}

// SatisfyQuestPreviousQuest: a positive prevQuest must be turned in, and when that prev has an
// each-from-all exclusive group, every other baked member must be too. Cite: Player.cpp:12857.
export function satisfyQuestPreviousQuest(
  snap: QuestPlayerSnapshot,
  quest: GatedQuest,
  opts?: SatisfyPrevQuestOpts,
): boolean {
  if (quest.prevQuest == null || quest.prevQuest === 0) return true;
  if (opts?.prevQuestMissingFromData) return true;
  const prevId = quest.prevQuest;
  if (statusOf(snap, prevId) !== 'turnedIn') return false;

  // each-from-all exclusive group on the previous quest (ExclusiveGroup < 0)
  const prevDef = opts?.questDefFor?.(prevId);
  const group = prevDef?.exclusiveGroup ?? 0;
  if (group >= 0) return true; // no group, or one-from-all: rewarded prev is enough

  const members = prevDef?.exclusiveGroupMembers ?? [];
  for (const id of members) {
    if (id === prevId) continue;
    // Unbaked sibling: never force a softlock (same as prevQuestMissingFromData).
    if (opts?.questDefFor && !opts.questDefFor(id)) continue;
    if (statusOf(snap, id) !== 'turnedIn') return false;
  }
  return true;
}

// SatisfyQuestExclusiveGroup: if ExclusiveGroup > 0, no other member may be INCOMPLETE or COMPLETE (active
// log). Rewarded/turnedIn siblings do not block. Cite: Player.cpp:13062–13102.
export function satisfyQuestExclusiveGroup(snap: QuestPlayerSnapshot, quest: GatedQuest): boolean {
  const group = quest.exclusiveGroup ?? 0;
  if (group <= 0) return true;
  const members = quest.exclusiveGroupMembers ?? [];
  for (const id of members) {
    if (id === quest.entry) continue;
    const st = statusOf(snap, id);
    if (st === 'active' || st === 'complete') return false;
  }
  return true;
}

// SatisfyQuestTimed: no second timed quest while one is active. Timed means LimitTime != 0 and
// nothing else — reading DB SpecialFlags bit 0 made 613 repeatable quests mutually exclusive.
export function satisfyQuestTimed(snap: QuestPlayerSnapshot, quest: GatedQuest): boolean {
  if (!(quest.limitTime != null && quest.limitTime > 0)) return true;
  return !snap.hasActiveTimedQuest;
}

/** SatisfyQuestWeek: default allow when no weekly tracker provided. */
export function satisfyQuestWeek(snap: QuestPlayerSnapshot, questEntry: number): boolean {
  if (!snap.weeklyQuestDone) return true;
  return !snap.weeklyQuestDone(questEntry);
}

// SatisfyQuestReqCondition: evaluate quest.reqCondition through snap.conditionEval, defaulting to
// true when no condition engine is attached. Cite: Player.cpp:12200–12206.
export function satisfyQuestReqCondition(snap: QuestPlayerSnapshot, quest: GatedQuest): boolean {
  if (!quest.reqCondition) return true;
  if (!snap.conditionEval) return true;
  return snap.conditionEval(quest.reqCondition);
}

// CanSeeStartQuest subset — the always-on gates deciding whether a quest is offerable at all.
// Level is deliberately excluded: it decides AVAILABLE vs UNAVAILABLE, not visibility.
export function canSeeQuest(
  snap: QuestPlayerSnapshot,
  quest: GatedQuest,
  opts?: SatisfyPrevQuestOpts,
): boolean {
  if (quest.inactive) return false;
  return (
    satisfyQuestClass(snap, quest)
    && satisfyQuestRace(snap, quest)
    && satisfyQuestSkill(snap, quest)
    && satisfyQuestExclusiveGroup(snap, quest)
    && satisfyQuestPreviousQuest(snap, quest, opts)
    && satisfyQuestWeek(snap, quest.entry)
    && satisfyQuestReqCondition(snap, quest)
  );
}

// Player::CanTakeQuest for the baked fields: status, exclusiveGroup, class, race, level, skill,
// reputation, previous quest, timed, week, reqCondition and active. Cite: Player.cpp:12198–12206.
export function canTakeQuest(
  snap: QuestPlayerSnapshot,
  quest: GatedQuest,
  opts?: SatisfyPrevQuestOpts,
): boolean {
  if (quest.inactive) return false;
  if (!satisfyQuestStatus(snap, quest.entry, isRepeatableQuest(quest))) return false;
  if (!satisfyQuestExclusiveGroup(snap, quest)) return false;
  if (!satisfyQuestClass(snap, quest)) return false;
  if (!satisfyQuestRace(snap, quest)) return false;
  if (!satisfyQuestLevel(snap, quest)) return false;
  if (!satisfyQuestSkill(snap, quest)) return false;
  // Reputation: reuse satisfyQuestReputation (Player.cpp:13011)
  if (snap.standingFor) {
    if (!satisfyQuestReputation({
      minFaction: quest.requiredMinRepFaction,
      minValue: quest.requiredMinRepValue,
      maxFaction: quest.requiredMaxRepFaction,
      maxValue: quest.requiredMaxRepValue,
      standingFor: snap.standingFor,
    })) return false;
  } else if (
    (quest.requiredMinRepFaction != null && quest.requiredMinRepValue != null)
    || (quest.requiredMaxRepFaction != null && quest.requiredMaxRepValue != null)
  ) {
    // Bounds exist but no standing provider → cannot satisfy (strict)
    return false;
  }
  if (!satisfyQuestPreviousQuest(snap, quest, opts)) return false;
  if (!satisfyQuestTimed(snap, quest)) return false;
  if (!satisfyQuestWeek(snap, quest.entry)) return false;
  if (!satisfyQuestReqCondition(snap, quest)) return false;
  return true;
}

// Per-quest dialog marker. `role` is 'finisher' for an involved relation and 'giver' for a start
// one; lowLevelHideDiff defaults to 5, and a negative value disables the gray demotion.
export function dialogStatusForQuest(
  snap: QuestPlayerSnapshot,
  quest: GatedQuest,
  role: 'giver' | 'finisher',
  opts?: { lowLevelHideDiff?: number; isRepeatable?: boolean; isAutoComplete?: boolean },
): DialogStatusCode {
  if (quest.inactive) return DIALOG_STATUS.NONE;
  const st = statusOf(snap, quest.entry);
  const auto = opts?.isAutoComplete ?? false;
  const rep = opts?.isRepeatable ?? false;

  if (role === 'finisher') {
    if (st === 'complete') {
      // COMPLETE && !rewarded
      return rep && !auto ? DIALOG_STATUS.REWARD_REP : DIALOG_STATUS.REWARD2;
    }
    if (auto && canTakeQuest(snap, quest)) {
      return rep ? DIALOG_STATUS.REWARD_REP : DIALOG_STATUS.AVAILABLE;
    }
    if (st === 'active') return DIALOG_STATUS.INCOMPLETE;
    return DIALOG_STATUS.NONE;
  }

  // giver path: status NONE && can see start (CanSeeStartQuest = the level-independent gates).
  // A rewarded repeatable reads NONE in core, so it keeps its marker. Cite: Player.cpp:12611.
  if (st !== 'none' && !(rep && st === 'turnedIn')) return DIALOG_STATUS.NONE;
  if (!canSeeQuest(snap, quest)) return DIALOG_STATUS.NONE;

  if (!satisfyQuestLevel(snap, quest)) return DIALOG_STATUS.UNAVAILABLE;

  if (auto) return DIALOG_STATUS.REWARD_REP;

  const lowDiff = opts?.lowLevelHideDiff ?? 5;
  const qLevel = quest.questLevel > 0 ? quest.questLevel : snap.level;
  if (lowDiff < 0 || snap.level <= qLevel + lowDiff) return DIALOG_STATUS.AVAILABLE;
  return DIALOG_STATUS.CHAT;
}

// Aggregate dialog status for a giver with multiple start/finish quest ids (max wins). Cite:
// QuestHandler.cpp getDialogStatus — higher numeric status wins.
export function getDialogStatusForGiver(
  snap: QuestPlayerSnapshot,
  relations: { entry: number; role: 'giver' | 'finisher'; quest: GatedQuest }[],
  defStatus: DialogStatusCode = DIALOG_STATUS.NONE,
): DialogStatusCode {
  let dialogStatus: DialogStatusCode = defStatus;
  for (const rel of relations) {
    const next = dialogStatusForQuest(snap, rel.quest, rel.role);
    if (next > dialogStatus) dialogStatus = next;
  }
  return dialogStatus;
}

/** Build snapshot questStatus from a QuestLog (pure helper for callers/tests). */
export function questStatusFromLog(log: QuestLog): (entry: number) => QuestStatus | 'none' {
  return (entry: number) => getQuest(log, entry)?.status ?? 'none';
}

// ---- FO2: GameObject quest-giver accept / turn-in offer --------------------
// The relations reverse-bake to questsStarted / questsEnded, so this only resolves WHICH quests.

/** Resolved accept / turn-in lists for a GO with reverse quest links. */
export interface GoQuestGiverOffer {
  /** Quest entries the player can take from this GO (not in log, passes canTakeQuest). */
  acceptable: number[];
  /** Complete quests ready to hand in at this GO. */
  turnInReady: number[];
  /** Active incomplete quests this GO would finish (in-progress marker). */
  incomplete: number[];
}

// FO2 pure offer list for a GameObject giver: acceptable uses canTakeQuest and turn-in needs both
// complete status and questComplete. It invents no zone spawns — the caller must have the GO.
export function goQuestGiverOffer(
  go: { questsStarted?: number[]; questsEnded?: number[] },
  log: QuestLog,
  snap: QuestPlayerSnapshot,
  questOf: (entry: number) => QuestDef | undefined,
  inv: Inventory,
  opts?: SatisfyPrevQuestOpts & QuestCompleteOpts & {
    /** Fixture override when reverse links are omitted on the GO def. */
    fallbackStarted?: number[];
    fallbackEnded?: number[];
  },
): GoQuestGiverOffer {
  const started = (go.questsStarted?.length ? go.questsStarted : opts?.fallbackStarted ?? [])
    .filter((id) => id > 0);
  const ended = (go.questsEnded?.length ? go.questsEnded : opts?.fallbackEnded ?? [])
    .filter((id) => id > 0);

  const acceptable: number[] = [];
  for (const id of started) {
    const q = questOf(id);
    if (!q) continue;
    const prevMissing = !!(q.prevQuest && opts?.questDefFor && !opts.questDefFor(q.prevQuest));
    if (!canTakeQuest(snap, q, {
      ...opts,
      prevQuestMissingFromData: opts?.prevQuestMissingFromData ?? prevMissing,
    })) {
      continue;
    }
    acceptable.push(id);
  }

  const turnInReady: number[] = [];
  const incomplete: number[] = [];
  for (const id of ended) {
    const q = questOf(id);
    if (!q) continue;
    const st = getQuest(log, id);
    if (!st || st.status === 'turnedIn') continue;
    if (st.status === 'complete' || questComplete(q, st, inv, opts)) {
      turnInReady.push(id);
    } else if (st.status === 'active' || st.status === 'failed') {
      incomplete.push(id);
    }
  }

  return { acceptable, turnInReady, incomplete };
}

// Dialog-status marker for a GO row, from the same lists goQuestGiverOffer uses. Precedence
// matches getDialogStatusForGiver: reward beats available beats incomplete.
export type GoDialogMarker = 'reward' | 'available' | 'incomplete';

export function goDialogMarkerFromOffer(offer: GoQuestGiverOffer): GoDialogMarker | null {
  if (offer.turnInReady.length > 0) return 'reward';
  if (offer.acceptable.length > 0) return 'available';
  if (offer.incomplete.length > 0) return 'incomplete';
  return null;
}

// Slots your quest log can hold at once (the classic 1.12 cap). Only quests you're still carrying — active
// or complete — occupy a slot; turnedIn entries are history and don't.
export const MAX_QUEST_SLOTS = 20;

export function emptyQuestLog(): QuestLog {
  return { quests: [] };
}

export function getQuest(log: QuestLog, entry: number): QuestState | undefined {
  return log.quests.find((q) => q.entry === entry);
}

/** Slots currently in use: quests you're carrying (active or complete), turnedIn excluded. */
export function activeQuestCount(log: QuestLog): number {
  return log.quests.reduce((n, q) => (q.status === 'turnedIn' ? n : n + 1), 0);
}

/** Whether there's room in the log to accept another quest. */
export function hasQuestSlot(log: QuestLog): boolean {
  return activeQuestCount(log) < MAX_QUEST_SLOTS;
}

function clone(log: QuestLog): QuestLog {
  return {
    quests: log.quests.map((q) => ({
      ...q,
      kills: { ...q.kills },
      objects: { ...(q.objects || {}) },
      spells: { ...(q.spells || {}) },
      uses: { ...(q.uses || {}) },
      // explored / talked are scalars on the spread; undefined stays undefined for old states
    })),
  };
}

// Whether completion requires AreaExploredOrEventHappens: true when exploreTriggers are baked or
// SpecialFlags carries EXPLORATION_OR_EVENT. Cite: Player.cpp:12276.
export function requiresEventCredit(quest: QuestDef): boolean {
  if ((quest.exploreTriggers?.length ?? 0) > 0) return true;
  return ((quest.specialFlags ?? 0) & QUEST_SPECIAL_FLAG_EXPLORATION_OR_EVENT) !== 0;
}

// Event / escort / exploration quests that need AreaExploredOrEventHappens credit. Alias of
// requiresEventCredit for FO6 disposition naming.
export function isEventOrEscortQuest(quest: QuestDef): boolean {
  return requiresEventCredit(quest);
}

// True when the quest has no kill, item, object, sourceItem or spellCast trackable. Creature
// SPEAKTO slots from rawObjectives count as trackable even when slim killTargets were cleared.
function hasEmptyTrackables(quest: QuestDef): boolean {
  return (
    creatureCreditTargets(quest).length === 0 &&
    (quest.itemTargets?.length ?? 0) === 0 &&
    (quest.objectTargets?.length ?? 0) === 0 &&
    (quest.sourceItemTargets?.length ?? 0) === 0 &&
    !(quest.spellCastTargets || []).some((t) => (t.count || 0) > 0)
  );
}

// True when the quest ends at a GameObject — an examined crate, a wrecked boat. Zone presence must
// NOT free-credit talked; only recordGoEnderInteract does. Cite: KI-507, KI-508.
export function hasGoEnder(quest: QuestDef): boolean {
  if (quest.goEnder != null && quest.goEnder > 0) return true;
  return (quest.goEnderEntries ?? []).some((e) => e > 0);
}

/** The GameObject that ends this quest: the scalar goEnder, else the first goEnderEntries row. */
export function goEnderEntryOf(quest: QuestDef): number | undefined {
  if ((quest.goEnder ?? 0) > 0) return quest.goEnder;
  return (quest.goEnderEntries ?? []).find((e) => e > 0);
}

// FO4 talk-to-NPC candidate, with no baked talkToNpc field to read: empty trackables, not an event
// or escort, not pure-rep, and carrying an ender or starter identity.
export function isTalkToNpcQuest(quest: QuestDef): boolean {
  if (!hasEmptyTrackables(quest)) return false;
  if (requiresEventCredit(quest)) return false;
  // Pure-rep stays gated by standingFor; do not force a talk bit on rep-only quests.
  if (quest.repObjective && (quest.repObjective.value || 0) > 0) return false;
  const ender = (quest.enderName ?? '').trim();
  const starter = (quest.starterName ?? '').trim();
  return !!(ender || starter);
}

// Empty flag-2 quests whose CMaNGOS completion is a gossip SCRIPT_COMMAND_QUEST_EXPLORED rather
// than an escort, fight or use. talkToNpc is the product proxy for that gossip chain.
const EVENT_TALK_FIGHT_ESCORT_RE =
  /\b(?:escort|protect|defend|defeat|kill|slay|ambush|face |fight|subdue|save \d+|bring forth)\b/i;
const EVENT_TALK_OBJECTIVE_RE =
  /\b(?:listen (?:as|to)\b|tells? (?:his|her|their) story|recant the history|heard your words|seek out the .+? and learn|learn what .{0,80}(?:share|teach|lore it keeps)|speak(?:ing)? (?:with|to)\b)\b/i;

export function isEventTalkQuest(quest: QuestDef): boolean {
  if (!hasEmptyTrackables(quest)) return false;
  if (!requiresEventCredit(quest)) return false;
  if ((quest.exploreTriggers?.length ?? 0) > 0) return false;
  if (hasGoEnder(quest)) return false;
  if (quest.repObjective && (quest.repObjective.value || 0) > 0) return false;
  const text = `${quest.objectivesText ?? ''} ${quest.detailsText ?? ''}`;
  if (EVENT_TALK_FIGHT_ESCORT_RE.test(text)) return false;
  return EVENT_TALK_OBJECTIVE_RE.test(text);
}

// Talk or deliver-arrival met: a talk-to-NPC quest needs state.talked, and so does a deliver quest
// with baked enderZones. Without enderZones, items alone suffice. Cite: Player.cpp TalkedToCreature.
export function talkMet(state: QuestState, quest: QuestDef): boolean {
  if (isTalkToNpcQuest(quest)) return state.talked === true;
  if (isDeliverQuest(quest)) {
    const enders = quest.enderZones ?? [];
    if (enders.length === 0) return true;
    return state.talked === true;
  }
  return true;
}

// Whether pure sourceItemTargets need recorded use credit rather than mere presence: yes when there
// are no kill, item or object targets. With normal itemTargets alongside, presence is enough.
export function requiresSourceUseCredit(quest: QuestDef): boolean {
  const sources = quest.sourceItemTargets || [];
  if (sources.length === 0) return false;
  return (
    (quest.killTargets?.length ?? 0) === 0 &&
    (quest.itemTargets?.length ?? 0) === 0 &&
    (quest.objectTargets?.length ?? 0) === 0
  );
}

/** Source-item use counts met (only when requiresSourceUseCredit; otherwise always true). */
export function sourceUsesMet(state: QuestState, quest: QuestDef): boolean {
  if (!requiresSourceUseCredit(quest)) return true;
  const uses = state.uses || {};
  return (quest.sourceItemTargets || []).every(
    (it) => (uses[String(it.item)] ?? 0) >= it.count,
  );
}

// FO6 degraded-escort candidate: a pure escort or event with empty trackables and no baked
// exploreTriggers, about 113 live quests. finishEscort is the player-invokable end condition.
export function isDegradedEscortCandidate(quest: QuestDef): boolean {
  if (!requiresEventCredit(quest)) return false;
  if ((quest.exploreTriggers?.length ?? 0) > 0) return false;
  return hasEmptyTrackables(quest);
}

// Explicit finishEscort may credit this quest: empty escorts and empty explore-trigger quests, the
// same degraded end condition. Mixed event-plus-kill waits for eventCreditIsTheRemainingWork.
export function canDegradedAutoFinish(quest: QuestDef): boolean {
  if (!requiresEventCredit(quest)) return false;
  return hasEmptyTrackables(quest);
}

// The event bit is the only remaining work: escorts, empty explore, or a mixed quest whose kill,
// item, object and use objectives are already met. Talk-gated event quests stay on the speak path.
export function eventCreditIsTheRemainingWork(
  quest: QuestDef,
  qs: QuestState,
  inv: Inventory,
): boolean {
  if (qs.explored === true) return false;
  if (isEventTalkQuest(quest)) return false;
  if (!killsMet(qs, quest) || !itemsMet(quest, inv) || !objectsMet(qs, quest)) return false;
  if (!sourcesMet(quest, inv) || !sourceUsesMet(qs, quest) || !spellsMet(qs, quest)) return false;
  if (canDegradedAutoFinish(quest)) return true;
  return (quest.exploreTriggers?.length ?? 0) > 0;
}

// Item-started quest (item_template.startquest): the item IS the giver, so accept never free-grants
// it. Detected from baked startedByItem, else a pre-FQ6 heuristic on srcItem and the placeholder name.
export function isItemStartedQuest(quest: QuestDef): boolean {
  if (quest.startedByItem != null && quest.startedByItem > 0) return true;

  const src = quest.srcItem;
  if (!src?.item) return false;
  const srcIsObjective = (quest.itemTargets ?? []).some((t) => t.item === src.item);
  if (!srcIsObjective) return false;
  // GO starter relation is a real world starter (not item-start).
  if (quest.goStarter != null && quest.goStarter > 0) return false;
  if ((quest.goStarterEntries ?? []).some((e) => e > 0)) return false;
  const name = (quest.starterName ?? '').trim();
  if (!name || name === 'A quest giver' || name === 'Unknown') return true;
  // Some extracts label item-starts as "item: <Name>" (e.g. Glowing Shard).
  if (/^item\s*:/i.test(name)) return true;
  return false;
}

// Standalone GO-started SrcItem==ReqItem find: skip zone-list grant (KI-587). C++ GiveQuestSourceItemIfNeed
// always grants (Player.cpp:13163); chain follow-ups (PrevQuestId) are that grant (KI-922).
export function isWorldLootSrcItemObjective(quest: QuestDef): boolean {
  const src = quest.srcItem;
  if (!src?.item) return false;
  const srcIsObjective = (quest.itemTargets ?? []).some((t) => t.item === src.item);
  if (!srcIsObjective) return false;
  const hasGo =
    (quest.goStarter != null && quest.goStarter > 0)
    || (quest.goStarterEntries ?? []).some((e) => e > 0);
  if (!hasGo) return false;
  // PrevQuestId: chain follow-up offered after the previous turn-in — grant.
  if ((quest.prevQuest ?? 0) > 0) return false;
  return true;
}

// Whether acceptQuest should top up the SrcItem, which CMaNGOS always attempts and which is a no-op
// when the count is met. False only for a standalone GO find away from the GO (KI-587).
export function shouldGrantSrcItemOnAccept(
  quest: QuestDef,
  opts?: { atGo?: boolean },
): boolean {
  if (!quest.srcItem?.item) return false;
  // GiveQuestSourceItemIfNeed runs on AcceptQuest at the giver, so a list-accept away from the GO
  // must not invent standalone plant or crate loot (KI-587). At the GO it must grant.
  if (isWorldLootSrcItemObjective(quest) && !opts?.atGo) return false;
  return true;
}

/**
 * Player.cpp:13710 HasQuestForItem — incomplete quest still short of ReqItem/ReqSource.
 * `stackOf` supplies item_template.Stackable, the cap a ReqSourceCount of 0 uses (Player.cpp:13760).
 */
export function hasQuestForItem(
  log: QuestLog,
  questDef: (entry: number) => QuestDef | undefined,
  inv: Inventory,
  itemId: number,
  stackOf?: (item: number) => number | undefined,
): boolean {
  if (itemId <= 0) return false;
  const have = countItem(inv, itemId);
  for (const q of log.quests) {
    if (q.status !== 'active') continue;
    const def = questDef(q.entry);
    if (!def) continue;
    for (const t of def.itemTargets ?? []) {
      if (t.item === itemId && have < t.count) return true;
    }
    if (!sourceDropItemEntries(def).includes(itemId)) continue;
    const count = (def.sourceItemTargets ?? []).find((t) => t.item === itemId)?.count ?? 0;
    const need = count > 0 ? count : Math.max(1, stackOf?.(itemId) ?? 1);
    if (have < need) return true;
  }
  return false;
}

// Item entry the player must already hold to accept an item-started quest. Prefer baked startedByItem; else
// srcItem (classic delivery pattern).
export function itemStartRequiredItem(quest: QuestDef): number | undefined {
  if (!isItemStartedQuest(quest)) return undefined;
  if (quest.startedByItem != null && quest.startedByItem > 0) return quest.startedByItem;
  return quest.srcItem?.item;
}

// Item-started accept destroys the starting item when it is neither a ReqItem objective nor the
// SrcItem — 3181 destroys 10000, while 832 keeps the Eye 4903. Cite: Player.cpp:12470–12488.
export function shouldDestroyStartItemOnAccept(quest: QuestDef): boolean {
  if (!isItemStartedQuest(quest)) return false;
  const startId = itemStartRequiredItem(quest);
  if (startId == null || startId <= 0) return false;
  if ((quest.itemTargets ?? []).some((t) => t.item === startId)) return false;
  if (quest.srcItem?.item === startId) return false;
  return true;
}

// Item-start accept gate: the start item must already be in bags, since the item IS the giver.
// Shared with the autopilot so the planner cannot offer an accept the engine will refuse.
export function itemStartGateMet(quest: QuestDef, inventory: Inventory): boolean {
  const startItemId = itemStartRequiredItem(quest);
  if (startItemId == null) return true;
  const needStart = quest.srcItem?.item === startItemId && quest.srcItem.count > 0 ? quest.srcItem.count : 1;
  return countItem(inventory, startItemId) >= needStart;
}

// Creature objective slots that track progress in QuestState.kills. Prefer slim killTargets; when
// empty, open kill keys for rawObjectives SPEAKTO slots so TalkedToCreature can still complete.
export function creatureCreditTargets(
  quest: QuestDef,
): { creatureEntry: number; count: number }[] {
  const slim = quest.killTargets ?? [];
  if (slim.length > 0) return slim;
  const raw = quest.rawObjectives;
  if (!raw) return [];
  const out: { creatureEntry: number; count: number }[] = [];
  const n = Math.min(
    raw.reqCreatureOrGoId?.length ?? 0,
    raw.reqCreatureOrGoCount?.length ?? 0,
    raw.reqSpell?.length ?? 0,
  );
  for (let i = 0; i < n; i++) {
    const id = raw.reqCreatureOrGoId[i] | 0;
    const count = raw.reqCreatureOrGoCount[i] | 0;
    const spell = raw.reqSpell[i] | 0;
    if (id > 0 && spell === 0 && count > 0) {
      out.push({ creatureEntry: id, count });
    }
  }
  return out;
}

// A fresh QUEST_STATUS_INCOMPLETE row: every counter at zero and the event/talk latches down.
// Cite: Player.cpp:12405 AddQuest.
export function freshQuestState(quest: QuestDef): QuestState {
  const kills: Record<string, number> = {};
  for (const kt of creatureCreditTargets(quest)) kills[String(kt.creatureEntry)] = 0;
  const objects: Record<string, number> = {};
  for (const ot of (quest.objectTargets || [])) objects[String(ot.objectEntry)] = 0;
  const spells: Record<string, number> = {};
  for (const st of (quest.spellCastTargets || [])) {
    if (st.spell) spells[String(st.spell)] = 0;
  }
  const uses: Record<string, number> = {};
  if (requiresSourceUseCredit(quest)) {
    for (const st of quest.sourceItemTargets || []) {
      if (st.item) uses[String(st.item)] = 0;
    }
  }
  // Event/explore quests start with explored=false so empty objectives (escorts) and granted tools (Taming
  // Rod as itemTarget) cannot self-satisfy before event credit. Cite: Player.cpp:12405; FQ1 / FQ2.
  const needsEvent = requiresEventCredit(quest);
  // FO4 talk + QI2.5 deliver: start talked=false so accept+srcItem cannot free-complete (KI-845).
  const needsTalk = isTalkToNpcQuest(quest) || isDeliverQuest(quest);
  return {
    entry: quest.entry,
    status: 'active',
    kills,
    objects,
    spells,
    ...(Object.keys(uses).length ? { uses } : {}),
    ...(needsEvent ? { explored: false } : {}),
    ...(needsTalk ? { talked: false } : {}),
    ...(quest.limitTime ? { timerMs: quest.limitTime * 1000 } : {}),
  };
}

// Rounds of a REPEATABLE the bags already pay for, counting the one in the log. 0 for anything the
// bags cannot settle (a kill, an escort, a talk). Cite: Player.cpp:12546 DestroyItemCount.
export function questRepeatsAvailable(
  quest: QuestDef,
  inv: Inventory,
  zoneId?: string,
): number {
  if (!isRepeatableQuest(quest)) return 0;
  const targets = (quest.itemTargets ?? []).filter((t) => t.item > 0 && t.count > 0);
  if (!targets.length) return 0;
  if (requiresEventCredit(quest) || isTalkToNpcQuest(quest)) return 0;
  if (creatureCreditTargets(quest).length > 0) return 0;
  if ((quest.objectTargets ?? []).length > 0) return 0;
  if ((quest.spellCastTargets ?? []).length > 0) return 0;
  // A deliver's next round is credited by STANDING at the ender, so away from that zone the rounds
  // are travel, not a press. Cite: recordSameZoneDeliver; deliverArrivalPending.
  if (isDeliverQuest(quest)) {
    const enders = quest.enderZones ?? [];
    if (enders.length > 0 && (!zoneId || !enders.includes(zoneId))) return 0;
  }
  let rounds = Number.MAX_SAFE_INTEGER;
  for (const t of targets) {
    rounds = Math.min(rounds, Math.floor(countItem(inv, t.item) / t.count));
    if (rounds <= 0) return 0;
  }
  return rounds;
}

// A rewarded REPEATABLE is re-taken over its own row: core holds one QuestStatusData per quest and
// AddQuest overwrites its counters, keeping m_rewarded. Cite: Player.cpp:12405; Player.cpp:12611.
export function accept(log: QuestLog, quest: QuestDef): QuestLog {
  const held = getQuest(log, quest.entry);
  if (held && !(held.status === 'turnedIn' && isRepeatableQuest(quest))) return log;
  const out = clone(log);
  const row = freshQuestState(quest);
  const at = out.quests.findIndex((x) => x.entry === quest.entry);
  if (at >= 0) out.quests[at] = row;
  else out.quests.push(row);
  return out;
}

// AreaExploredOrEventHappens proxy: mark explore satisfied for active quests whose exploreTriggers
// name this zone. A trigger with no zone is ignored — it cannot be attributed without geometry.
export function recordExplore(
  log: QuestLog,
  zoneId: string,
  questOf: (entry: number) => QuestDef | undefined,
): QuestLog {
  let touched = false;
  const out = clone(log);
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed') continue;
    if (q.explored) continue;
    const quest = questOf(q.entry);
    const triggers = quest?.exploreTriggers;
    if (!triggers?.length) continue;
    // Zone match is the Phonecraft proxy for entering the areatrigger volume.
    if (!triggers.some((t) => t.zone === zoneId)) continue;
    q.explored = true;
    touched = true;
  }
  return touched ? out : log;
}

// AreaExploredOrEventHappens by quest id, the script and QUEST_COMPLETE spell path used by the
// hunter taming spells. Cite: SpellEffects.cpp EffectQuestComplete; Player.cpp:13335-13357.
export function recordEventHappens(log: QuestLog, questId: number): QuestLog {
  if (!questId) return log;
  const q = getQuest(log, questId);
  if (!q || q.status === 'turnedIn' || q.status === 'failed' || q.explored) return log;
  const out = clone(log);
  const st = out.quests.find((x) => x.entry === questId);
  if (!st || st.status === 'turnedIn' || st.status === 'failed' || st.explored) return log;
  st.explored = true;
  return out;
}

// Explore or event objective met: with no exploreTriggers and no EXPLORATION flag it is always met,
// otherwise state.explored is required. Cite: Player.cpp CanCompleteQuest ~12276.
export function exploreMet(state: QuestState, quest: QuestDef): boolean {
  if (!requiresEventCredit(quest)) return true;
  // CQ6 scripted-kill events: a flag-2 quest with REAL kill objectives but no baked exploreTriggers
  // has the kill script AS the event, so meeting the kills satisfies the credit.
  if ((quest.exploreTriggers?.length ?? 0) === 0
    && (quest.killTargets?.length ?? 0) > 0 && killsMet(state, quest)) return true;
  // Same class for GO object objectives: flag-2 with real objectTargets and no exploreTriggers means
  // the GO Use path IS the event, as in 924 Demon Seed. Cite: Player.cpp CanCompleteQuest ~12276.
  if ((quest.exploreTriggers?.length ?? 0) === 0
    && (quest.objectTargets?.length ?? 0) > 0 && objectsMet(state, quest)) return true;
  return state.explored === true;
}

// Creature credit objectives met (from tracked kills). Uses creatureCreditTargets so
// SPEAKTO/TalkedToCreature slots (rawObjectives) still gate when slim killTargets is empty.
export function killsMet(state: QuestState, quest: QuestDef): boolean {
  return creatureCreditTargets(quest).every(
    (kt) => (state.kills[String(kt.creatureEntry)] ?? 0) >= kt.count,
  );
}
/** Item objectives met (checked live against the inventory). */
export function itemsMet(quest: QuestDef, inv: Inventory): boolean {
  return quest.itemTargets.every((it) => countItem(inv, it.item) >= it.count);
}
// Source-item objectives met. CanCompleteQuest does NOT check ReqSourceId — it drives drop
// eligibility, not turn-in. Only a pure use-on-target source needs the item in bags (KI-586).
export function sourcesMet(quest: QuestDef, inv: Inventory): boolean {
  if (!requiresSourceUseCredit(quest)) return true;
  return (quest.sourceItemTargets || []).every((it) => countItem(inv, it.item) >= it.count);
}
// Every ReqSourceId this quest permits as a drop, including slots the slim sourceItemTargets drops
// because ReqSourceCount is 0 (quest 905's Sunscale Feather). Count 0 is not an objective count: it
// allows the drop up to the item's stack size. Cite: Player.cpp:13741-13761 HasQuestForItem.
export function sourceDropItemEntries(quest: QuestDef): number[] {
  const out: number[] = [];
  for (const t of quest.sourceItemTargets ?? []) if (t.item > 0) out.push(t.item);
  for (const id of quest.rawObjectives?.reqSourceId ?? []) {
    const item = id | 0;
    if (item > 0 && !out.includes(item)) out.push(item);
  }
  return out;
}
// Item entries any not-yet-turned-in quest still cares about. Bulk junk-selling must never vendor
// these: a few vanilla collect quests ask for grey drops, and selling one reverts the objective.
export function questNeededItems(log: QuestLog, questDef: (entry: number) => QuestDef | undefined): Set<number> {
  const needed = new Set<number>();
  for (const q of log.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed') continue;
    const def = questDef(q.entry);
    if (!def) continue;
    for (const t of def.itemTargets) needed.add(t.item);
    for (const item of sourceDropItemEntries(def)) needed.add(item);
    if (def.srcItem?.item) needed.add(def.srcItem.item);
    if (def.startedByItem) needed.add(def.startedByItem);
  }
  return needed;
}

/** Cite: ItemPrototype.h ITEM_CLASS_QUEST; item_template.bonding 4 = quest. */
const ITEM_CLASS_QUEST = 12;
const BINDING_QUEST = 4;

export interface LeftoverQuestItem {
  slot: number;
  item: number;
  count: number;
  quests: Array<{ entry: number; title: string }>;
}

function isQuestResidueItem(it: ItemDef): boolean {
  return !!(it.questItem || it.itemClass === ITEM_CLASS_QUEST || it.binding === BINDING_QUEST);
}

function questUsedItem(def: QuestDef, item: number): { source: boolean; start: boolean; objective: boolean } {
  return {
    source: def.srcItem?.item === item || sourceDropItemEntries(def).includes(item),
    start: def.startedByItem === item,
    objective: (def.itemTargets ?? []).some((t) => t.item === item),
  };
}

// SpecialFlags bit 0. Cite: QuestDef.h:147 QUEST_SPECIAL_FLAG_REPEATABLE.
export function isRepeatableQuest(def: Pick<QuestDef, 'specialFlags'>): boolean {
  return ((def.specialFlags ?? 0) & QUEST_SPECIAL_FLAG_REPEATABLE) !== 0;
}

function addQuestItemIds(def: QuestDef, into: Set<number>): void {
  if (def.srcItem?.item) into.add(def.srcItem.item);
  if (def.startedByItem) into.add(def.startedByItem);
  for (const t of def.itemTargets ?? []) if (t.item > 0) into.add(t.item);
  for (const item of sourceDropItemEntries(def)) into.add(item);
}

// Bag stacks that belonged to a turned-in quest and no remaining log entry still needs.
// Class-0 leftovers of a "buy beer / linen" objective stay — those are still drinks and cloth.
// SrcItem / source-use tools and class-12 quest objects are the residue that floods bags.
// Repeatable quests (SpecialFlags REPEATABLE) keep their items — the next turn-in still wants them.
export function leftoverQuestItems(
  log: QuestLog,
  inventory: Inventory,
  questDef: (entry: number) => QuestDef | undefined,
  itemDef: (entry: number) => ItemDef | undefined,
  allQuests: Iterable<QuestDef>,
): LeftoverQuestItem[] {
  const needed = questNeededItems(log, questDef);
  const repeatableItems = new Set<number>();
  for (const def of allQuests) {
    if (!isRepeatableQuest(def)) continue;
    addQuestItemIds(def, repeatableItems);
  }
  const fromFinished = new Map<number, { quests: Array<{ entry: number; title: string }>; source: boolean; start: boolean }>();
  for (const q of log.quests) {
    if (q.status !== 'turnedIn') continue;
    const def = questDef(q.entry);
    if (!def || isRepeatableQuest(def)) continue;
    const mark = (item: number): void => {
      if (!(item > 0)) return;
      if (repeatableItems.has(item)) return;
      const used = questUsedItem(def, item);
      const cur = fromFinished.get(item) ?? { quests: [], source: false, start: false };
      if (!cur.quests.some((x) => x.entry === def.entry)) {
        cur.quests.push({ entry: def.entry, title: def.title });
      }
      cur.source = cur.source || used.source;
      cur.start = cur.start || used.start;
      fromFinished.set(item, cur);
    };
    if (def.srcItem?.item) mark(def.srcItem.item);
    if (def.startedByItem) mark(def.startedByItem);
    for (const t of def.itemTargets ?? []) mark(t.item);
    for (const item of sourceDropItemEntries(def)) mark(item);
  }

  const out: LeftoverQuestItem[] = [];
  inventory.stacks.forEach((stk, slot) => {
    if (!stk || stk.count <= 0) return;
    if (needed.has(stk.item)) return;
    if (repeatableItems.has(stk.item)) return;
    const it = itemDef(stk.item);
    if (!it) return;
    const start = it.startQuest ?? 0;
    if (start > 0) {
      const startDef = questDef(start);
      if (startDef && isRepeatableQuest(startDef)) return;
      const qs = getQuest(log, start);
      if (!qs || qs.status !== 'turnedIn') return;
    }
    const hit = fromFinished.get(stk.item);
    if (!hit || hit.quests.length === 0) return;
    if (!isQuestResidueItem(it) && !hit.source && !hit.start && start <= 0) return;
    out.push({ slot, item: stk.item, count: stk.count, quests: hit.quests });
  });
  return out;
}

/** Object (GameObject/chest) objectives met. */
export function objectsMet(state: QuestState, quest: QuestDef): boolean {
  const objs = state.objects || {};
  return (quest.objectTargets || []).every((ot) => (objs[String(ot.objectEntry)] ?? 0) >= ot.count);
}

// Sum spellCastTargets counts per spell id (duplicate slots share progress). Cite: QuestDef.h
// ReqSpellCast[i] + ReqCreatureOrGOCount[i]; FO3 consumer.
export function spellCastNeed(quest: QuestDef): Map<number, number> {
  const needed = new Map<number, number>();
  for (const t of quest.spellCastTargets || []) {
    if (!t.spell || (t.count || 0) <= 0) continue;
    needed.set(t.spell, (needed.get(t.spell) ?? 0) + t.count);
  }
  return needed;
}

/** Spell-cast objectives met (tracked casts, capped per spell id). */
export function spellsMet(state: QuestState, quest: QuestDef): boolean {
  const casts = state.spells || {};
  for (const [spell, count] of spellCastNeed(quest)) {
    if ((casts[String(spell)] ?? 0) < count) return false;
  }
  return true;
}

export interface QuestCompleteOpts {
  // Absolute standing for a faction id. When given, a repObjective above 0 requires standing at
  // least that value; when omitted, pure-rep quests stay incomplete and mixed ones ignore rep.
  standingFor?: (factionId: number) => number;
  // QI5: `false` forces pre-QI slim body (oracle / debug); `true` forces interpreter. Default: interpreter
  // when `rawObjectives` present (`PHONECRAFT_QI_INTERPRETER=0` off).
  useInterpreter?: boolean;
  /** Absolute copper; used when RewOrReqMoney < 0 (Player.cpp:12282–12286). */
  money?: number;
  rewOrReqMoney?: number;
  canTake?: boolean;
  autoRewardedSatisfied?: boolean;
}

// The pre-QI5 slim completion body, still diffed against by the LOCK-9 dual oracle. Live completion
// routes through the QI2 interpreter when rawObjectives are baked.
export function questCompleteSlim(
  quest: QuestDef,
  state: QuestState,
  inv: Inventory,
  opts?: QuestCompleteOpts,
): boolean {
  const k = killsMet(state, quest);
  const i = itemsMet(quest, inv);
  const s = sourcesMet(quest, inv);
  const o = objectsMet(state, quest);
  const sp = spellsMet(state, quest);
  const su = sourceUsesMet(state, quest);
  if (!(k && i && s && o && sp && su)) return false;
  // AreaExplored: require exploreTriggers satisfied when present (mixed or pure explore).
  // Cite: ObjectMgr force-sets EXPLORATION_OR_EVENT; AreaExploredOrEventHappens.
  if (!exploreMet(state, quest)) return false;
  // FO4: empty talk-style quests require explicit talk credit (not accept free-complete).
  if (!talkMet(state, quest)) return false;
  // Degrade gracefully: a timed quest surfaces its limit but never blocks completion, spell casts
  // are tracked via spellsMet, and reputation is enforced only when standingFor is supplied.
  const spellTargetCount = (quest.spellCastTargets || []).filter((t) => (t.count || 0) > 0).length;
  const trackableCount =
    creatureCreditTargets(quest).length +
    (quest.itemTargets?.length || 0) +
    ((quest.sourceItemTargets || []).length) +
    ((quest.objectTargets || []).length) +
    spellTargetCount;
  const hasExplore = (quest.exploreTriggers?.length || 0) > 0;
  const hasRep = !!(quest.repObjective && (quest.repObjective.value || 0) > 0);

  if (hasRep && opts?.standingFor) {
    const need = quest.repObjective!.value || 0;
    if (opts.standingFor(quest.repObjective!.faction) < need) return false;
    // Standing met: pure-rep (and any already-met spell trackables) can complete.
    return true;
  }

  // Pure untracked-objective quests — rep only, no explore — must not read as complete. Spell casts
  // and exploration are already gated above, and talk candidates by talkMet.
  const needsEvent = requiresEventCredit(quest);
  if (trackableCount === 0 && hasRep && !hasExplore && !needsEvent) return false;
  return true;
}

// Live quest completion. With the interpreter gate on and rawObjectives present it runs
// CanCompleteQuest then the FO4 talk and source gates; otherwise the slim body.
export function questComplete(
  quest: QuestDef,
  state: QuestState,
  inv: Inventory,
  opts?: QuestCompleteOpts,
): boolean {
  if (shouldUseQuestInterpreter(quest, opts)) {
    const st = statusFromQuestState(quest, state, inv);
    if (
      !canCompleteQuest(quest, st, {
        standingFor: opts?.standingFor,
        money: opts?.money,
        rewOrReqMoney: opts?.rewOrReqMoney,
        canTake: opts?.canTake,
        autoRewardedSatisfied: opts?.autoRewardedSatisfied,
      })
    ) {
      return false;
    }
    // FO4 zone-granular gates with no CMaNGOS m_* counterpart.
    if (!talkMet(state, quest)) return false;
    if (!sourceUsesMet(state, quest)) return false;
    if (!sourcesMet(quest, inv)) return false;
    return true;
  }
  return questCompleteSlim(quest, state, inv, opts);
}

// SatisfyQuestReputation-style accept gate: min requires standing at or above the value and max
// requires it strictly below. Absent bounds are ignored, and the fields are not baked yet.
export function satisfyQuestReputation(opts: {
  minFaction?: number;
  minValue?: number;
  maxFaction?: number;
  maxValue?: number;
  standingFor: (factionId: number) => number;
}): boolean {
  if (opts.minFaction != null && opts.minValue != null) {
    if (opts.standingFor(opts.minFaction) < opts.minValue) return false;
  }
  if (opts.maxFaction != null && opts.maxValue != null) {
    if (opts.standingFor(opts.maxFaction) >= opts.maxValue) return false;
  }
  return true;
}

// Record a creature credit — KilledMonsterCredit or TalkedToCreature — against every active quest
// tracking that entry. It does not change status; callers run questComplete afterwards.
export function recordKill(log: QuestLog, creatureEntry: number, questOf: (entry: number) => QuestDef | undefined): QuestLog {
  const out = clone(log);
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed') continue;
    const key = String(creatureEntry);
    if (!(key in q.kills)) continue;
    const quest = questOf(q.entry);
    if (!quest) continue;
    const target = creatureCreditTargets(quest).find((kt) => kt.creatureEntry === creatureEntry);
    if (target) q.kills[key] = Math.min(target.count, (q.kills[key] ?? 0) + 1);
  }
  return out;
}

// Required spell for a GO objectTarget slot, from rawObjectives when baked. 0 is a plain Use.
// Cite: Player.cpp CastedCreatureOrGO :13558–13560, where ReqSpell must match the spell id.
export function reqSpellForObjectTarget(
  quest: QuestDef,
  objectEntry: number,
): number {
  const raw = quest.rawObjectives;
  if (raw) {
    for (let j = 0; j < (raw.reqCreatureOrGoId?.length ?? 0); j++) {
      const id = raw.reqCreatureOrGoId[j] ?? 0;
      if (id === -objectEntry) return (raw.reqSpell?.[j] ?? 0) | 0;
    }
  }
  // Slim fixtures without raw: treat as plain interact (spell 0).
  return 0;
}

// Record an object interaction against every active quest tracking it, on the plain Use path only:
// slots whose ReqSpell is above 0 need recordCastedCreatureOrGO. Cite: GameObject.cpp:1635.
export function recordObject(log: QuestLog, objectEntry: number, questOf: (entry: number) => QuestDef | undefined): QuestLog {
  const out = clone(log);
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed') continue;
    const key = String(objectEntry);
    if (!q.objects) q.objects = {};
    const quest = questOf(q.entry);
    const target = quest?.objectTargets?.find((ot) => ot.objectEntry === objectEntry);
    if (!target) continue;
    // Cast-on-GO objectives (ReqSpell > 0) are not credited by bare Use.
    if (quest && reqSpellForObjectTarget(quest, objectEntry) > 0) continue;
    if (!(key in q.objects)) q.objects[key] = 0; // init for legacy saves or new objective
    q.objects[key] = Math.min(target.count, (q.objects[key] ?? 0) + 1);
  }
  return out;
}

// CastedCreatureOrGO slim bridge: credit GO progress when the spell matches that slot's ReqSpell,
// and advance spellCastTargets. A spellId of 0 matches only ReqSpell 0 — prefer recordObject.
export function recordCastedCreatureOrGO(
  log: QuestLog,
  goEntry: number,
  spellId: number,
  questOf: (entry: number) => QuestDef | undefined,
): QuestLog {
  if (!goEntry) return log;
  let out = clone(log);
  let touched = false;
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed') continue;
    const quest = questOf(q.entry);
    if (!quest) continue;
    const target = quest.objectTargets?.find((ot) => ot.objectEntry === goEntry);
    if (!target) continue;
    const needSpell = reqSpellForObjectTarget(quest, goEntry);
    // Player.cpp:13558 — skip wrong spell casts.
    if (needSpell !== spellId) continue;
    if (!q.objects) q.objects = {};
    const key = String(goEntry);
    if (!(key in q.objects)) q.objects[key] = 0;
    const next = Math.min(target.count, (q.objects[key] ?? 0) + 1);
    if (next !== q.objects[key]) {
      q.objects[key] = next;
      touched = true;
    }
  }
  // Also advance spellCastTargets when the cast carries a real spell id.
  if (spellId > 0) {
    const afterSpell = recordSpellCast(out, spellId, questOf);
    if (afterSpell !== out) {
      out = afterSpell;
      touched = true;
    }
  }
  return touched ? out : log;
}

// Record a successful cast of `spellId` against every active quest with a matching
// spellCastTargets entry. Progress is per spell id, and duplicate slots sum their counts.
export function recordSpellCast(
  log: QuestLog,
  spellId: number,
  questOf: (entry: number) => QuestDef | undefined,
): QuestLog {
  if (!spellId) return log;
  const out = clone(log);
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed') continue;
    const quest = questOf(q.entry);
    if (!quest) continue;
    const need = spellCastNeed(quest).get(spellId);
    if (need == null || need <= 0) continue;
    if (!q.spells) q.spells = {};
    const key = String(spellId);
    if (!(key in q.spells)) q.spells[key] = 0;
    q.spells[key] = Math.min(need, (q.spells[key] ?? 0) + 1);
  }
  return out;
}

// FO4: record using a source item on a target, crediting active quests that list the entry in
// sourceItemTargets, capped at the required count. It does not consume inventory.
export function recordSourceItemUse(
  log: QuestLog,
  itemEntry: number,
  questOf: (entry: number) => QuestDef | undefined,
  count = 1,
): QuestLog {
  if (!itemEntry || count <= 0) return log;
  const out = clone(log);
  let touched = false;
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed') continue;
    const quest = questOf(q.entry);
    if (!quest) continue;
    const target = (quest.sourceItemTargets || []).find((t) => t.item === itemEntry);
    if (!target || target.count <= 0) continue;
    if (!q.uses) q.uses = {};
    const key = String(itemEntry);
    if (!(key in q.uses)) q.uses[key] = 0;
    const next = Math.min(target.count, (q.uses[key] ?? 0) + count);
    if (next !== q.uses[key]) {
      q.uses[key] = next;
      touched = true;
    }
  }
  return touched ? out : log;
}

// FO4: match NPC identity to a talk-candidate quest's ender/starter name. creatureEntry resolves via
// optional name lookup (bake has names, not ender entries).
export function npcMatchesTalkObjective(
  quest: QuestDef,
  opts: { npcName?: string; creatureEntry?: number },
  creatureNameOf?: (entry: number) => string | undefined,
): boolean {
  const names = new Set(
    [quest.enderName, quest.starterName]
      .map((n) => (n ?? '').trim())
      .filter(Boolean),
  );
  if (names.size === 0) return false;
  if (opts.npcName) {
    const n = opts.npcName.trim();
    if (n && names.has(n)) return true;
  }
  if (opts.creatureEntry != null && creatureNameOf) {
    const cn = (creatureNameOf(opts.creatureEntry) ?? '').trim();
    if (cn && names.has(cn)) return true;
  }
  return false;
}

// FO4 talk credit, preferring an ender match and accepting a starter. A talkGo quest never takes
// NPC-talk credit; an event-talk quest sets m_explored when the spoken NPC matches.
export function recordTalkToNpc(
  log: QuestLog,
  questOf: (entry: number) => QuestDef | undefined,
  opts: { npcName?: string; creatureEntry?: number },
  creatureNameOf?: (entry: number) => string | undefined,
): QuestLog {
  const out = clone(log);
  let touched = false;
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed') continue;
    const quest = questOf(q.entry);
    if (!quest) continue;
    // GO ender examine is the objective — talking to the starter (or any NPC) is not.
    if (hasGoEnder(quest)) continue;

    // FO4: empty non-event talk candidates → talked bit.
    if (isTalkToNpcQuest(quest)) {
      if (q.talked) continue;
      if (!npcMatchesTalkObjective(quest, opts, creatureNameOf)) continue;
      q.talked = true;
      touched = true;
      continue;
    }

    // Empty SF2 gossip-story / listen: QUEST_EXPLORED → m_explored (not talked).
    if (isEventTalkQuest(quest)) {
      if (q.explored) continue;
      if (!npcMatchesEventTalkObjective(quest, opts, creatureNameOf)) continue;
      q.explored = true;
      touched = true;
    }
  }
  return touched ? out : log;
}

// Event-talk NPC match: the ender or starter, or a name appearing in the objectives or details —
// the Great Bear Spirit is not the questrelation ender. Cite: dbscripts_on_gossip 3884.
export function npcMatchesEventTalkObjective(
  quest: QuestDef,
  opts: { npcName?: string; creatureEntry?: number },
  creatureNameOf?: (entry: number) => string | undefined,
): boolean {
  if (npcMatchesTalkObjective(quest, opts, creatureNameOf)) return true;
  let name = (opts.npcName ?? '').trim();
  if (!name && opts.creatureEntry != null && creatureNameOf) {
    name = (creatureNameOf(opts.creatureEntry) ?? '').trim();
  }
  if (!name) return false;
  const text = `${quest.objectivesText ?? ''} ${quest.detailsText ?? ''}`;
  return text.toLowerCase().includes(name.toLowerCase());
}

// Credit talk, deliver or event when the player uses a GameObject baked as an ender. For an
// empty-objective examine quest the GO Use IS the talk proxy, and for a flag-2 quest the credit.
export function recordGoEnderInteract(
  log: QuestLog,
  objectEntry: number,
  questOf: (entry: number) => QuestDef | undefined,
  inv: Inventory,
  opts?: {
    goName?: string;
    /** gameobject_involvedrelation reverse list on the GO def. */
    questsEnded?: readonly number[];
  },
): QuestLog {
  if (!objectEntry) return log;
  const out = clone(log);
  let touched = false;
  const endedSet = opts?.questsEnded?.length
    ? new Set(opts.questsEnded.filter((id) => id > 0))
    : null;
  const goName = (opts?.goName ?? '').trim();
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed') continue;
    const quest = questOf(q.entry);
    if (!quest) continue;
    const isEnder =
      quest.goEnder === objectEntry ||
      (quest.goEnderEntries ?? []).includes(objectEntry) ||
      (endedSet?.has(q.entry) ?? false) ||
      (!!goName && hasEmptyTrackables(quest) && (quest.enderName ?? '').trim() === goName);
    if (!isEnder) continue;

    // FO4 talk-to examine (empty trackables, not event/escort, not pure-rep).
    if (isTalkToNpcQuest(quest)) {
      if (!q.talked) {
        q.talked = true;
        touched = true;
      }
      continue;
    }

    // talkGo + EXPLORATION_OR_EVENT: GO ender interact grants m_explored (event proxy).
    // Pure-rep stays gated by standingFor — do not free-complete rep-only on GO use.
    if (
      requiresEventCredit(quest) &&
      hasEmptyTrackables(quest) &&
      !(quest.repObjective && (quest.repObjective.value || 0) > 0)
    ) {
      if (!q.explored) {
        q.explored = true;
        touched = true;
      }
      continue;
    }

    // DELIVER-with-items: arrival credit only when carried items meet the objective.
    if (isDeliverQuest(quest) && itemsMet(quest, inv)) {
      if (!q.talked) {
        q.talked = true;
        touched = true;
      }
    }
  }
  return touched ? out : log;
}

// QI2.5 deliver class: item objectives, no kill, object or spell trackables, not an event or
// escort and not a pure talk-to-NPC. The typical "Report to" or gather-and-hand-in.
export function isDeliverQuest(quest: QuestDef): boolean {
  if (isTalkToNpcQuest(quest)) return false;
  if (requiresEventCredit(quest)) return false;
  if ((quest.killTargets?.length ?? 0) > 0) return false;
  if ((quest.objectTargets?.length ?? 0) > 0) return false;
  if ((quest.spellCastTargets ?? []).some((t) => (t.count || 0) > 0)) return false;
  return (quest.itemTargets?.length ?? 0) > 0;
}

// A deliver arrival not yet credited: the items are in the bags and the player is standing in an
// ender zone. Only a zone TRANSITION ever set `talked`, which stranded a same-zone finish.
export function deliverArrivalPending(
  quest: QuestDef,
  state: QuestState,
  inv: Inventory,
  zoneId: string | undefined,
): boolean {
  if (state.talked === true || state.status === 'turnedIn' || state.status === 'failed') return false;
  if (!zoneId || !isDeliverQuest(quest)) return false;
  if (!(quest.enderZones ?? []).includes(zoneId)) return false;
  return itemsMet(quest, inv);
}

export function recordSameZoneTalkOrDeliver(
  log: QuestLog,
  zoneId: string,
  questOf: (entry: number) => QuestDef | undefined,
  inv: Inventory,
): QuestLog {
  if (!zoneId) return log;
  const out = clone(log);
  let touched = false;
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed' || q.talked) continue;
    const quest = questOf(q.entry);
    if (!quest) continue;
    const enders = quest.enderZones ?? [];
    if (!enders.includes(zoneId)) continue;

    if (isTalkToNpcQuest(quest)) {
      // GO ender: must examine the object — being anywhere in the ender zone is not enough.
      if (hasGoEnder(quest)) continue;
      q.talked = true;
      touched = true;
      continue;
    }
    if (isDeliverQuest(quest) && itemsMet(quest, inv)) {
      // Deliver in ender zone with carried items → TalkedToCreature proxy (KI-845).
      // talkMet gates questComplete; goEnder delivers still prefer GO interact for turn-in UI.
      q.talked = true;
      touched = true;
    }
  }
  return touched ? out : log;
}

// Deliver-only ender-zone credit, so gathering in the zone completes without a leave-and-reenter.
// It does NOT credit a pure talk quest, which still needs a speak or a zone enter.
export function recordSameZoneDeliver(
  log: QuestLog,
  zoneId: string,
  questOf: (entry: number) => QuestDef | undefined,
  inv: Inventory,
): QuestLog {
  if (!zoneId) return log;
  const out = clone(log);
  let touched = false;
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed' || q.talked) continue;
    const quest = questOf(q.entry);
    if (!quest || !isDeliverQuest(quest)) continue;
    const enders = quest.enderZones ?? [];
    if (!enders.includes(zoneId)) continue;
    if (!itemsMet(quest, inv)) continue;
    q.talked = true;
    touched = true;
  }
  return touched ? out : log;
}

/** Recompute complete/active for every non-turned-in quest (kills + live item counts + optional rep). */
export function refreshCompletion(
  log: QuestLog,
  questOf: (entry: number) => QuestDef | undefined,
  inv: Inventory,
  opts?: QuestCompleteOpts,
): QuestLog {
  const out = clone(log);
  for (const q of out.quests) {
    if (q.status === 'turnedIn' || q.status === 'failed') continue;
    const quest = questOf(q.entry);
    if (!quest) continue;
    q.status = questComplete(quest, q, inv, opts) ? 'complete' : 'active';
  }
  return out;
}

export function markTurnedIn(log: QuestLog, entry: number): QuestLog {
  const out = clone(log);
  const q = out.quests.find((x) => x.entry === entry);
  if (q) q.status = 'turnedIn';
  return out;
}

// Fail an incomplete quest (TERMINATE_COND failQuest). Only INCOMPLETE → FAILED. Cite:
// Player.cpp:12730–12761 FailQuest; ScriptMgr.cpp:2732 QUEST_STATUS_INCOMPLETE.
export function fail(log: QuestLog, entry: number): QuestLog {
  const q = getQuest(log, entry);
  if (!q || q.status !== 'active') return log;
  const out = clone(log);
  const row = out.quests.find((x) => x.entry === entry);
  if (row) row.status = 'failed';
  return out;
}

// Abandon a quest: drop it from the log entirely, freeing the slot and making it offerable again,
// with kill progress lost. A turned-in quest is never abandoned — chains gate on it.
export function abandon(log: QuestLog, entry: number): QuestLog {
  const q = getQuest(log, entry);
  if (!q || q.status === 'turnedIn') return log;
  const out = clone(log);
  out.quests = out.quests.filter((x) => x.entry !== entry);
  return out;
}
