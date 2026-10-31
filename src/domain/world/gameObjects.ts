// Per-type GameObject use engine, pure. Cite: GameObject.cpp Use 1398–1972; SharedDefines.h
// GameobjectTypes 515–548. The data-union index per type is documented in type-system.md.

import type { GameObjectDef, LockDataDef, LootEntryDef } from '../../data/schema.ts';
import { firstPageForGo } from '../../data/pageTexts.ts';
import type { Rng } from '../../engine/core/rng.ts';
import { isQuestRequiredLootEntry } from '../items/loot.ts';
import {
  canOpenLock,
  type LockDef,
  type OpenLockResult,
} from './openLock.ts';

// ---- GAMEOBJECT_TYPE_* (SharedDefines.h 515–548) --------------------------

export const GAMEOBJECT_TYPE_DOOR = 0;
export const GAMEOBJECT_TYPE_BUTTON = 1;
export const GAMEOBJECT_TYPE_QUESTGIVER = 2;
export const GAMEOBJECT_TYPE_CHEST = 3;
export const GAMEOBJECT_TYPE_BINDER = 4;
export const GAMEOBJECT_TYPE_GENERIC = 5;
export const GAMEOBJECT_TYPE_TRAP = 6;
export const GAMEOBJECT_TYPE_CHAIR = 7;
export const GAMEOBJECT_TYPE_SPELL_FOCUS = 8;
export const GAMEOBJECT_TYPE_TEXT = 9;
export const GAMEOBJECT_TYPE_GOOBER = 10;
export const GAMEOBJECT_TYPE_TRANSPORT = 11;
export const GAMEOBJECT_TYPE_AREADAMAGE = 12;
export const GAMEOBJECT_TYPE_CAMERA = 13;
export const GAMEOBJECT_TYPE_MAP_OBJECT = 14;
export const GAMEOBJECT_TYPE_MO_TRANSPORT = 15;
export const GAMEOBJECT_TYPE_DUEL_ARBITER = 16;
export const GAMEOBJECT_TYPE_FISHINGNODE = 17;
export const GAMEOBJECT_TYPE_SUMMONING_RITUAL = 18;
export const GAMEOBJECT_TYPE_MAILBOX = 19;
export const GAMEOBJECT_TYPE_AUCTIONHOUSE = 20;
export const GAMEOBJECT_TYPE_GUARDPOST = 21;
export const GAMEOBJECT_TYPE_SPELLCASTER = 22;
export const GAMEOBJECT_TYPE_MEETINGSTONE = 23;
export const GAMEOBJECT_TYPE_FLAGSTAND = 24;
export const GAMEOBJECT_TYPE_FISHINGHOLE = 25;
export const GAMEOBJECT_TYPE_FLAGDROP = 26;

// Default trap rearm cooldown when trap.cooldown is 0. Cite: GameObject.cpp:1532 — `cooldown ? cooldown :
// uint32(4)`.
export const TRAP_DEFAULT_COOLDOWN_SECS = 4;

/** Meeting Stone Summon. Cite: GameObject.cpp:1888 `spellId = 23598`. */
export const MEETINGSTONE_SUMMON_SPELL_ID = 23598;

// ---- Result / context -----------------------------------------------------

export type UseGameObjectKind =
  | 'door'
  | 'button'
  | 'chest'
  | 'trap'
  | 'goober'
  | 'questgiver'
  | 'fishingnode'
  | 'fishinghole'
  | 'transport'
  | 'mo_transport'
  | 'summoning_ritual'
  | 'spellcaster'
  | 'spell_focus'
  | 'text'
  | 'mailbox'
  | 'meetingstone'
  | 'unsupported';

export type UseGameObjectReason =
  | 'locked'
  | 'low_skill'
  | 'quest_incomplete'
  | 'event_inactive'
  | 'not_ready'
  | 'cooldown'
  | 'no_charges'
  | 'party_only'
  | 'fishing_failed'
  | 'unsupported'
  | 'missing_context'
  | 'not_in_group'
  | 'is_owner'
  | 'owner_not_channeling'
  | 'no_target'
  | 'level_out_of_range'
  /** GO_FLAG_NO_INTERACT. Cite: SpellHandler.cpp:304-308 HandleGameObjectUseOpcode. */
  | 'no_interact';

export type GoLootState = 'ready' | 'activated' | 'not_ready' | 'just_deactivated';

export interface UseGameObjectResult {
  ok: boolean;
  reason?: UseGameObjectReason;
  kind: UseGameObjectKind;
  /** gameobject_loot_template id for caller to roll — never invented here. */
  lootId?: number;
  /** Spell to cast on user (trap detonation / goober.spellId). */
  castSpellId?: number;
  /** Linked trap entry for caller to detonate (TriggerLinkedGameObject). */
  linkedTrapId?: number;
  /** Goober RewardPlayerAndGroupAtCast / cast-on-GO quest credit. */
  questCredit?: boolean;
  // Scripted event id to fire after a successful Use, from the goober or chest data union. The caller
  // may route it to a scripted-event handler — it is never a pre-use gate.
  firedEventId?: number;
  /** Consumable chest/goober: despawn (no restock). */
  despawn?: boolean;
  /** Non-consumable chest with restockTime: ready again at this wall-clock ms. */
  restockAtMs?: number;
  /** Flavor state after door/button open. */
  state?: GoLootState;
  /** Baked autoCloseSecs for door/button/goober (already /0x10000 at bake). */
  autoCloseSecs?: number;
  /** Trap bookkeeping after trigger. */
  trapUses?: number;
  trapCooldownUntilMs?: number;
  // SUMMONING_RITUAL: animSpell, else GO m_spellId (GetSpellId). Cite: GameObject.cpp:1815–1818
  // CastSpell(animSpell) / CastSpell(GetSpellId, CHANNEL_ONLY).
  channelSpellId?: number;
  // SUMMONING_RITUAL completion spell when unique uses ≥ reqParticipants. Cite: GameObject.cpp:2476
  // TriggerSummoningRitual CastSpell(spellId).
  ritualSpellId?: number;
  uniqueUseCount?: number;
  reqParticipants?: number;
  ritualReady?: boolean;
  uniqueUserIds?: string[];
  firstUser?: string;
  /** TEXT data0 pageID; host opens page_text. Cite: GameObject.h:156–163. */
  pageId?: number;
}

// Runtime bookkeeping for multi-step GO lifecycle (trap arm, restock window). Caller owns persistence; pure
// helpers only read/return new values.
export interface GoRuntimeState {
  /** Trap: wall-clock when arming started (NOT_READY). */
  armStartedAtMs?: number;
  /** Trap / restock: earliest time the GO is ready. */
  readyAtMs?: number;
  /** Trap: uses so far (charges bookkeeping). */
  uses?: number;
  /** Trap: rearm cooldown end. */
  cooldownUntilMs?: number;
  /** Door/button open/closed flavor. */
  open?: boolean;
  /** Script spawn visibility. Cite: ScriptMgr.cpp:1980–2025 / :2864–2871. */
  spawned?: boolean;
  /** GO_FLAG_LOCKED. Cite: ScriptMgr.cpp:2478–2503. */
  locked?: boolean;
  /** GO_FLAG_NO_INTERACT. Cite: ScriptMgr.cpp:2478–2503. */
  noInteract?: boolean;
  /** Pending ForcedDespawn delay (secs) when > 0. Cite: ScriptMgr.cpp:2864–2871. */
  despawnDelay?: number;
  /** SUMMONING_RITUAL unique channelers (m_UniqueUsers). Cite: GameObject.cpp:772 AddUniqueUse. */
  uniqueUsers?: string[];
  /** First unique user (m_firstUser). Cite: GameObject.cpp:776. */
  firstUser?: string;
  /** Custom delay before TriggerSummoningRitual (CustomData1; unset in bake). */
  delayedActionUntilMs?: number;
}

export interface UseGameObjectCtx {
  /** Lock.dbc row for go.lockId (from DataBundle.locks). Shape matches LockDef. */
  lock?: LockDef | LockDataDef;
  // Item entry used as key for LOCK_KEY_ITEM (go.keyId when player holds that item). Do not invent ids —
  // pass inventory match of baked keyId.
  keyItemEntry?: number;
  /** Spell EffectMiscValue for skill-lock type match (openLock). */
  spellLockType?: number;
  /** Player skill value for LOCK_KEY_SKILL. */
  skillValue?: number;
  /** Per-LockType skill value (lockpicking / mining / herbalism). Cite: openLock.skillValueFor. */
  skillValueFor?: (lockType: number) => number | undefined;
  /** Active incomplete quest ids (goober.questId gate). */
  incompleteQuestIds?: ReadonlySet<number> | readonly number[];
  /** Fishing skill + zone base skill (FISHINGNODE roll). */
  fishingSkill?: number;
  zoneSkill?: number;
  // Optional fixed d100 for fishing tests (1..100). When omitted, uses rng.int(1,100). Cite:
  // GameObject.cpp:1703 irand(1, 100).
  fishingRoll1to100?: number;
  /** Injected clock (ms). */
  nowMs: number;
  /** Injected RNG (fishing roll when fishingRoll1to100 not set). */
  rng?: Rng;
  /** Optional prior runtime state (trap charges / arm / restock). */
  runtime?: GoRuntimeState;
  /** SPELLCASTER partyOnly: false refuses; omitted = solo user is the party. Cite: GameObject.cpp:1837–1845. */
  inOwnerGroup?: boolean;
  /** User level for MEETINGSTONE [minLevel, maxLevel]. Cite: GameObject.cpp:1880–1882. */
  playerLevel?: number;
  /** Selected group member level. Cite: GameObject.cpp:1884–1886. */
  targetLevel?: number;
  /** Selected target is in the user's group and not self. Cite: GameObject.cpp:1876–1877. */
  hasGroupTarget?: boolean;
  // Active CALENDAR game_event ids, reserved for spawn-side presence. Goober and chest event ids are
  // scripted values that fire ON use, and never gate it.
  activeEventIds?: ReadonlySet<number> | readonly number[];
  // SUMMONING_RITUAL unique-use id (player / ally_N). Default `player`. Cite: GameObject.cpp:1813
  // AddUniqueUse.
  userId?: string;
  /** Prior unique users (runtime.uniqueUsers). */
  uniqueUserIds?: readonly string[];
  /** m_firstUser from a prior Use. */
  firstUser?: string;
  /** Spell-created ritual has an owner (EffectTransmitted). */
  hasOwner?: boolean;
  /** User is the owner — C++ refuses (already counted at create). */
  isOwner?: boolean;
  /** Owner must already be channeling. Cite: GameObject.cpp:1796–1797. */
  ownerChanneling?: boolean;
  /** User is in the owner's / firstUser's group. Cite: GameObject.cpp:1792, :1801–1810. */
  inGroup?: boolean;
  /** GO instance m_spellId (SetSpellId from the creating spell). */
  goSpellId?: number;
  /** m_delayedActionTimer still running. Cite: GameObject.cpp:1777–1778. */
  delayedActionUntilMs?: number;
  /** TEXT pageID (gameobject_template.data0 / pageTexts.goPages). Cite: GameObject.h:159. */
  pageId?: number;
}

// ---- Helpers --------------------------------------------------------------

/** LockDataDef and LockDef share { id, cases } — cast for openLock. */
export function asLockDef(lock: LockDef | LockDataDef | undefined): LockDef | undefined {
  return lock as LockDef | undefined;
}

function hasIncompleteQuest(
  incomplete: UseGameObjectCtx['incompleteQuestIds'],
  questId: number,
): boolean {
  if (!incomplete) return false;
  if (Array.isArray(incomplete)) return incomplete.includes(questId);
  // Array.isArray doesn't narrow ReadonlyArray out of the union, but only a Set reaches here.
  return (incomplete as ReadonlySet<number>).has(questId);
}

function hasActiveEvent(
  active: UseGameObjectCtx['activeEventIds'],
  eventId: number,
): boolean {
  if (!active) return false;
  if (Array.isArray(active)) return active.includes(eventId);
  return (active as ReadonlySet<number>).has(eventId);
}

// Calendar game_event presence helper, spawn-side only. Do NOT use it with the goober or chest data
// union — those are scripted event ids fired on Use, not calendar prerequisites.
export function isGoEventActive(
  eventId: number | undefined,
  activeEventIds: UseGameObjectCtx['activeEventIds'],
): boolean {
  if (eventId == null || eventId <= 0) return true;
  // No event snapshot provided → do not invent a refuse.
  if (activeEventIds == null) return true;
  return hasActiveEvent(activeEventIds, eventId);
}

function lockRefuseReason(r: OpenLockResult): UseGameObjectReason {
  if (!r.ok && r.reason === 'low_skill') return 'low_skill';
  return 'locked';
}

// Gate a GO open through canOpenLock when a lockId is present: a key item, a skill value, or one of
// the free-open lock types. A prior OPEN_LOCK cast sets runtime.open and Use proceeds.
export function checkGoLock(
  go: GameObjectDef,
  ctx: Pick<
    UseGameObjectCtx,
    'lock' | 'keyItemEntry' | 'spellLockType' | 'skillValue' | 'skillValueFor' | 'runtime'
  >,
): OpenLockResult {
  if (!go.lockId) return { ok: true };
  // Already unlocked by Pick Lock / Opening spell (goRuntime.open). Cite: EffectOpenLock.
  if (ctx.runtime?.open) return { ok: true };
  return canOpenLock({
    lock: asLockDef(ctx.lock) ?? { id: go.lockId, cases: [] },
    keyItemEntry: ctx.keyItemEntry,
    spellLockType: ctx.spellLockType,
    skillValue: ctx.skillValue,
    skillValueFor: ctx.skillValueFor,
  });
}

// Fishing bobber skill roll: chance is skill - zone skill + 5, and success needs the skill to meet the
// zone's and the chance to beat an irand(1,100). Cite: GameObject.cpp:1701–1708.
export function fishingBobberSuccess(
  skill: number,
  zoneSkill: number,
  roll1to100: number,
): boolean {
  const chance = skill - zoneSkill + 5;
  return skill >= zoneSkill && chance >= roll1to100;
}

/** Chance percent used by fishingBobberSuccess (for tests / UI). */
export function fishingBobberChance(skill: number, zoneSkill: number): number {
  return skill - zoneSkill + 5;
}

// ---- Trap arm / trigger (pure) --------------------------------------------

// Begin trap arming. Ready after startDelay seconds (0 → immediately ready). Cite: GameObject.cpp:321–328
// arm with trap.startDelay.
export function armTrap(
  go: GameObjectDef,
  nowMs: number,
  runtime: GoRuntimeState = {},
): { runtime: GoRuntimeState; readyAtMs: number } {
  const delaySecs = go.trap?.startDelay ?? 0;
  const readyAtMs = nowMs + delaySecs * 1000;
  return {
    readyAtMs,
    runtime: {
      ...runtime,
      armStartedAtMs: nowMs,
      readyAtMs,
    },
  };
}

// Trigger a trap if armed, off cooldown and with charges left, returning the spellId for the caller to
// detonate. GAP: the radius search and triggerOn filter are out of pure scope.
export function triggerTrap(
  go: GameObjectDef,
  ctx: Pick<UseGameObjectCtx, 'nowMs' | 'runtime'>,
): UseGameObjectResult {
  const kind: UseGameObjectKind = 'trap';
  if (go.type !== GAMEOBJECT_TYPE_TRAP || !go.trap) {
    return { ok: false, reason: 'unsupported', kind: 'unsupported' };
  }
  const rt = ctx.runtime ?? {};
  const now = ctx.nowMs;
  const readyAt = rt.readyAtMs ?? 0;
  if (readyAt > now) {
    return { ok: false, reason: 'not_ready', kind, state: 'not_ready' };
  }
  if (rt.cooldownUntilMs != null && rt.cooldownUntilMs > now) {
    return { ok: false, reason: 'cooldown', kind, trapCooldownUntilMs: rt.cooldownUntilMs };
  }
  const maxCharges = go.trap.charges ?? 0;
  const uses = rt.uses ?? 0;
  if (maxCharges > 0 && uses >= maxCharges) {
    return { ok: false, reason: 'no_charges', kind, trapUses: uses, despawn: true };
  }

  const cdSecs = go.trap.cooldown && go.trap.cooldown > 0
    ? go.trap.cooldown
    : TRAP_DEFAULT_COOLDOWN_SECS;
  const newUses = uses + (maxCharges > 0 ? 1 : 0);
  const exhausted = maxCharges > 0 && newUses >= maxCharges;

  return {
    ok: true,
    kind,
    castSpellId: go.trap.spellId,
    trapUses: newUses,
    trapCooldownUntilMs: now + cdSecs * 1000,
    state: exhausted ? 'just_deactivated' : 'activated',
    despawn: exhausted || undefined,
  };
}

// ---- useGameObject --------------------------------------------------------

// Pure per-type GO interaction. Deterministic given ctx (nowMs, rng, locks, quests). Caller rolls lootId
// and applies combat/spell side effects.
export function useGameObject(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  switch (go.type) {
    case GAMEOBJECT_TYPE_DOOR:
      return useDoor(go, ctx);
    case GAMEOBJECT_TYPE_BUTTON:
      return useButton(go, ctx);
    case GAMEOBJECT_TYPE_CHEST:
      return useChest(go, ctx);
    case GAMEOBJECT_TYPE_TRAP:
      return triggerTrap(go, ctx);
    case GAMEOBJECT_TYPE_GOOBER:
      return useGoober(go, ctx);
    case GAMEOBJECT_TYPE_QUESTGIVER:
      return useQuestGiver(go, ctx);
    case GAMEOBJECT_TYPE_FISHINGNODE:
      return useFishingNode(go, ctx);
    case GAMEOBJECT_TYPE_FISHINGHOLE:
      return useFishingHole(go, ctx);
    case GAMEOBJECT_TYPE_MO_TRANSPORT:
      return useMoTransport(go, ctx);
    case GAMEOBJECT_TYPE_TRANSPORT:
      return useTransport(go, ctx);
    case GAMEOBJECT_TYPE_SUMMONING_RITUAL:
      return useSummoningRitual(go, ctx);
    case GAMEOBJECT_TYPE_SPELLCASTER:
      return useSpellcaster(go, ctx);
    case GAMEOBJECT_TYPE_SPELL_FOCUS:
      return useSpellFocus(go);
    case GAMEOBJECT_TYPE_TEXT:
      return useText(go, ctx);
    case GAMEOBJECT_TYPE_MAILBOX:
      return useMailbox(go);
    case GAMEOBJECT_TYPE_MEETINGSTONE:
      return useMeetingStone(go, ctx);
    default:
      return {
        ok: false,
        reason: 'unsupported',
        kind: 'unsupported',
      };
  }
}

// QUESTGIVER Use — PrepareGossipMenu plus SendPreparedGossip. No loot: the caller surfaces the quest
// relations. The lock gate still applies, as on a locked document.
function useQuestGiver(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  const lockCheck = checkGoLock(go, ctx);
  if (!lockCheck.ok) {
    return { ok: false, reason: lockRefuseReason(lockCheck), kind: 'questgiver' };
  }
  // A type-2 QUESTGIVER may ALSO carry gameobject loot, so keep the relations AND the lootId — the
  // interact path must roll it when present. Cite: type-system.md quest relations plus loot.
  return {
    ok: true,
    kind: 'questgiver',
    lootId: go.lootId && go.lootId > 0 ? go.lootId : undefined,
    // Leave questCredit undefined so the interact path still records the object for objectTargets
    // when the same entry is also a click objective.
    state: 'activated',
  };
}

/** TEXT Use opens pageID (data0). Cite: GameObject.h:156–163; SMSG_GAMEOBJECT_PAGETEXT cpp:1607–1611. */
function useText(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  const lockCheck = checkGoLock(go, ctx);
  if (!lockCheck.ok) {
    return { ok: false, reason: lockRefuseReason(lockCheck), kind: 'text' };
  }
  const pageId = (ctx.pageId && ctx.pageId > 0 ? ctx.pageId : firstPageForGo(go.entry)) ?? undefined;
  return { ok: true, kind: 'text', pageId, state: 'activated' };
}

/** GAMEOBJECT_TYPE_MAILBOX — empty union; type value opens mail. Cite: GameObject.h:244; MailHandler.cpp:44–52, :536–545. */
function useMailbox(go: GameObjectDef): UseGameObjectResult {
  if (go.type !== GAMEOBJECT_TYPE_MAILBOX) {
    return { ok: false, reason: 'unsupported', kind: 'unsupported' };
  }
  return { ok: true, kind: 'mailbox', state: 'activated' };
}

// ---- FO2 reverse quest links (pure) ----------------------------------------

/** Quest entries this GO starts (gameobject_questrelation reverse of QuestDef.goStarter). */
export function questsStartedAtGo(go: Pick<GameObjectDef, 'questsStarted'>): number[] {
  return (go.questsStarted ?? []).filter((id) => id > 0);
}

/** Quest entries this GO ends (gameobject_involvedrelation reverse of QuestDef.goEnder). */
export function questsEndedAtGo(go: Pick<GameObjectDef, 'questsEnded'>): number[] {
  return (go.questsEnded ?? []).filter((id) => id > 0);
}

/** True when the GO is a quest-giver type or has baked start/end reverse links. */
export function isGoQuestGiver(go: Pick<GameObjectDef, 'type' | 'questsStarted' | 'questsEnded'>): boolean {
  if (go.type === GAMEOBJECT_TYPE_QUESTGIVER) return true;
  return questsStartedAtGo(go).length > 0 || questsEndedAtGo(go).length > 0;
}

/** FISHINGHOLE (25). Cite: GameObject.cpp:1911; interactObject requires the fishing line. */
export function isGoFishingSchool(go: Pick<GameObjectDef, 'type' | 'fishinghole'>): boolean {
  return go.type === GAMEOBJECT_TYPE_FISHINGHOLE || go.fishinghole != null;
}

/** chest.data8 / goober.data1 / spellFocus.data4. Cite: GameObject.h:99, :166, :151. */
export function goUseQuestId(go: Pick<GameObjectDef, 'chest' | 'goober' | 'spellFocus'>): number {
  return (go.chest?.questId ?? go.goober?.questId ?? go.spellFocus?.questId ?? 0) | 0;
}

/** Every row is ChanceOrQuestChance-gated. Empty table is not. Cite: LootMgr quest chance. */
export function goLootIsQuestOnly(loot: readonly LootEntryDef[] | undefined): boolean {
  if (!loot || loot.length === 0) return false;
  return loot.every((e) => isQuestRequiredLootEntry(e));
}

/** Player facts for `goVisibleForPlayer`. Built once per paint. */
export interface GoPlayerVisibility {
  incompleteQuestIds: ReadonlySet<number>;
  neededItems: ReadonlySet<number>;
  /** Active objectTargets (HasQuestForGO). Cite: GameObject.cpp:1172. */
  neededGoEntries?: ReadonlySet<number>;
  hasFishing: boolean;
}

export type GoLootLookup = (lootId: number) => readonly LootEntryDef[];

/** Hide when Use would refuse (quest / no fishing). Cite: GameObject.cpp:1628-1633. */
export function goVisibleForPlayer(
  go: GameObjectDef,
  player: GoPlayerVisibility,
  lootFor?: GoLootLookup,
): boolean {
  if (isGoFishingSchool(go) && !player.hasFishing) return false;
  // A type-2 giver is a dialog examine, not a loot open. Cite: professions.ts skipLootGate.
  if (go.type === GAMEOBJECT_TYPE_QUESTGIVER) return true;
  const questId = goUseQuestId(go);
  if (questId > 0 && !player.incompleteQuestIds.has(questId)) return false;
  const lootId = (go.lootId ?? 0) | 0;
  if (lootId > 0 && lootFor) {
    const table = lootFor(lootId);
    if (goLootIsQuestOnly(table)) {
      const neededGo = player.neededGoEntries?.has(go.entry) === true;
      if (!neededGo && !table.some((e) => player.neededItems.has(e.item))) return false;
    }
  }
  return true;
}

/** What a Use can reach beyond the GO row itself, read by the caller from its own tables. */
export interface GoUseOutcomeDeps {
  /** Some quest names this entry as an objective target, a goStarter or a goEnder. */
  questReferenced: boolean;
  /** firstPageForGo — a TEXT/goober page the Use opens. */
  hasPageText: boolean;
  /** A herb / vein / fishing node row: the Use is a gather. */
  isGatherNode: boolean;
  /** dbscripts_on_go_template_use rows, a ported ScriptDev goUse, or any other scripted Use host. */
  hasScriptedUse: boolean;
}

/**
 * True when a successful Use hands the player something: loot, a page, a quest link, a spell, a
 * fired script, or a surface of its own. Only the five types a world row resolves are judged.
 */
export function goUseHasOutcome(go: GameObjectDef, deps: GoUseOutcomeDeps): boolean {
  if (deps.questReferenced || deps.hasPageText || deps.isGatherNode || deps.hasScriptedUse) return true;
  if ((go.lootId ?? 0) > 0) return true;
  if (questsStartedAtGo(go).length > 0 || questsEndedAtGo(go).length > 0) return true;
  switch (go.type) {
    case GAMEOBJECT_TYPE_CHEST: {
      const c = go.chest;
      return (c?.questId ?? 0) > 0 || (c?.eventId ?? 0) > 0 || (c?.linkedTrapId ?? 0) > 0;
    }
    case GAMEOBJECT_TYPE_GOOBER: {
      const g = go.goober;
      return (g?.questId ?? 0) > 0 || (g?.spellId ?? 0) > 0
        || (g?.eventId ?? 0) > 0 || (g?.linkedTrapId ?? 0) > 0 || (g?.pageId ?? 0) > 0;
    }
    // A questgiver with no relations and no loot gossips at nothing; GENERIC and TEXT with no page
    // fall through useGameObject to `unsupported`.
    case GAMEOBJECT_TYPE_QUESTGIVER:
    case GAMEOBJECT_TYPE_GENERIC:
    case GAMEOBJECT_TYPE_TEXT:
      return false;
    default:
      return true;
  }
}

// Type-driven interact verb for world-panel rows, never hand-mapped per entry: a questgiver gossips,
// a chest or fishing hole opens, a text row reads, and everything else is Use.
export function interactVerbForGoType(type: number): string {
  switch (type) {
    case GAMEOBJECT_TYPE_QUESTGIVER:
      return 'Examine';
    case GAMEOBJECT_TYPE_CHEST:
    case GAMEOBJECT_TYPE_FISHINGHOLE:
    case GAMEOBJECT_TYPE_DOOR:
      return 'Open';
    case GAMEOBJECT_TYPE_TEXT:
      return 'Read';
    case GAMEOBJECT_TYPE_MAILBOX:
      return 'Open';
    case GAMEOBJECT_TYPE_GOOBER:
    case GAMEOBJECT_TYPE_BUTTON:
    case GAMEOBJECT_TYPE_SPELLCASTER:
    case GAMEOBJECT_TYPE_GENERIC:
    default:
      return 'Use';
  }
}

// World-panel availability for a zone-scoped GO runtime slot, the consumable multi-spawn proxy. A
// permanent despawn uses a readyAt of MAX_SAFE_INTEGER.
export type GoRuntimeAvailability =
  | { kind: 'ready' }
  | { kind: 'consumed' }
  | { kind: 'restock'; readyAtMs: number };

export function goRuntimeAvailability(
  runtime: GoRuntimeState | undefined,
  nowMs: number,
): GoRuntimeAvailability {
  // DESPAWN_GO delay 0 → not spawned. Cite: ScriptMgr.cpp:2864–2871.
  if (runtime?.spawned === false) return { kind: 'consumed' };
  const readyAt = runtime?.readyAtMs;
  if (readyAt == null || readyAt <= nowMs) return { kind: 'ready' };
  if (readyAt >= Number.MAX_SAFE_INTEGER / 2) return { kind: 'consumed' };
  return { kind: 'restock', readyAtMs: readyAt };
}

function useDoor(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  // data-union: door { startOpen, lockId, autoCloseTime } — GameObject.h:51–60
  // Cite: SpellHandler.cpp:304-308 GO_FLAG_NO_INTERACT → Use refused (before lock open).
  if (ctx.runtime?.noInteract) {
    return { ok: false, reason: 'no_interact', kind: 'door' };
  }
  const lockCheck = checkGoLock(go, ctx);
  if (!lockCheck.ok) {
    return { ok: false, reason: lockRefuseReason(lockCheck), kind: 'door' };
  }
  const open = !(ctx.runtime?.open ?? go.door?.startOpen ?? false);
  return {
    ok: true,
    kind: 'door',
    state: open ? 'activated' : 'ready',
    autoCloseSecs: go.door?.autoCloseSecs,
  };
}

function useButton(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  // data-union: button { startOpen, lockId, autoCloseTime, linkedTrapId } — GameObject.h:61–73
  const lockCheck = checkGoLock(go, ctx);
  if (!lockCheck.ok) {
    return { ok: false, reason: lockRefuseReason(lockCheck), kind: 'button' };
  }
  const open = !(ctx.runtime?.open ?? go.button?.startOpen ?? false);
  return {
    ok: true,
    kind: 'button',
    state: open ? 'activated' : 'ready',
    autoCloseSecs: go.button?.autoCloseSecs,
    linkedTrapId: go.button?.linkedTrapId,
  };
}

function useChest(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  // data-union chest: lockId data0, lootId data1, restockTime data2, consumable data3,
  // linkedTrapId data7, questId data8 — type-system.md; restock vs consumable GameObject.cpp:625–634
  const lockCheck = checkGoLock(go, ctx);
  if (!lockCheck.ok) {
    return { ok: false, reason: lockRefuseReason(lockCheck), kind: 'chest' };
  }

  // Restock window: still not ready
  if (ctx.runtime?.readyAtMs != null && ctx.runtime.readyAtMs > ctx.nowMs) {
    return {
      ok: false,
      reason: 'not_ready',
      kind: 'chest',
      restockAtMs: ctx.runtime.readyAtMs,
      state: 'not_ready',
    };
  }

  const chest = go.chest;
  // chest.data8: Use refuses without QUEST_STATUS_INCOMPLETE; goVisibleForPlayer hides the row.
  // Cite: GameObject.h:99; GameObject.cpp:1628–1633 (goober; same gate on chest Use here).
  const chestQuestId = chest?.questId ?? 0;
  if (chestQuestId > 0 && !hasIncompleteQuest(ctx.incompleteQuestIds, chestQuestId)) {
    return { ok: false, reason: 'quest_incomplete', kind: 'chest' };
  }
  const lootId = go.lootId;
  const linkedTrapId = chest?.linkedTrapId;
  const consumable = !!chest?.consumable;
  const restockTime = chest?.restockTime ?? 0;
  // chest data6 "lootedEvent" — fire after loot, never a pre-use calendar gate.
  const firedEventId = chest?.eventId && chest.eventId > 0 ? chest.eventId : undefined;

  // consumable overrides restock (GameObject.cpp:627–634)
  if (consumable) {
    return {
      ok: true,
      kind: 'chest',
      lootId,
      linkedTrapId,
      firedEventId,
      despawn: true,
      state: 'just_deactivated',
    };
  }

  if (restockTime > 0) {
    const restockAtMs = ctx.nowMs + restockTime * 1000;
    return {
      ok: true,
      kind: 'chest',
      lootId,
      linkedTrapId,
      firedEventId,
      restockAtMs,
      state: 'not_ready',
    };
  }

  // No restock, not consumable: open once; caller may still despawn spawn-side
  return {
    ok: true,
    kind: 'chest',
    lootId,
    linkedTrapId,
    firedEventId,
    state: 'activated',
  };
}

function useGoober(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  // data-union goober: lockId data0, questId data1, consumable data5, spellId data10,
  // linkedTrapId data12 — GameObject.h:162–184; Use GameObject.cpp:1577–1651
  const lockCheck = checkGoLock(go, ctx);
  if (!lockCheck.ok) {
    return { ok: false, reason: lockRefuseReason(lockCheck), kind: 'goober' };
  }

  // Multi-spawn consumable restock and permanent despawn, on the same readyAt gate as chests. The
  // interact path restocks single-id proxies while objectTargets still need their clicks.
  if (ctx.runtime?.readyAtMs != null && ctx.runtime.readyAtMs > ctx.nowMs) {
    return {
      ok: false,
      reason: 'not_ready',
      kind: 'goober',
      restockAtMs: ctx.runtime.readyAtMs,
      state: 'not_ready',
    };
  }

  const goober = go.goober;
  const questId = goober?.questId ?? 0;
  // questId > 0 → must be QUEST_STATUS_INCOMPLETE (GameObject.cpp:1628–1633)
  if (questId > 0 && !hasIncompleteQuest(ctx.incompleteQuestIds, questId)) {
    return { ok: false, reason: 'quest_incomplete', kind: 'goober' };
  }

  // goober data2 eventId is scripted_event_id fired ON use (StartEvents_Event),
  // not a calendar game_event prerequisite — surface as firedEventId only.
  const firedEventId = goober?.eventId && goober.eventId > 0 ? goober.eventId : undefined;
  const consumable = !!goober?.consumable;
  return {
    ok: true,
    kind: 'goober',
    // RewardPlayerAndGroupAtCast always on successful player Use (cpp:1635)
    questCredit: true,
    castSpellId: goober?.spellId,
    linkedTrapId: goober?.linkedTrapId,
    firedEventId,
    despawn: consumable || undefined,
    autoCloseSecs: goober?.autoCloseSecs,
    state: consumable ? 'just_deactivated' : 'activated',
  };
}

function useFishingNode(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  // FISHINGNODE Use GameObject.cpp:1672–1771; skill roll :1693–1708
  const skill = ctx.fishingSkill;
  const zoneSkill = ctx.zoneSkill;
  if (skill == null || zoneSkill == null) {
    return { ok: false, reason: 'missing_context', kind: 'fishingnode' };
  }

  let roll = ctx.fishingRoll1to100;
  if (roll == null) {
    if (!ctx.rng) {
      return { ok: false, reason: 'missing_context', kind: 'fishingnode' };
    }
    roll = ctx.rng.int(1, 100);
  }

  if (!fishingBobberSuccess(skill, zoneSkill, roll)) {
    return { ok: false, reason: 'fishing_failed', kind: 'fishingnode' };
  }

  // Bobber loot is LOOT_FISHING by zone; optional fishnode.lootId if baked
  return {
    ok: true,
    kind: 'fishingnode',
    lootId: go.fishnode?.lootId,
    state: 'activated',
  };
}

/** GAMEOBJECT_TYPE_MO_TRANSPORT Use — C++ has no type-15 case; Phonecraft Use is AddPassenger. Cite: GameObject.cpp:1948; Transports.cpp:271. */
function useMoTransport(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  const lockCheck = checkGoLock(go, ctx);
  if (!lockCheck.ok) {
    return { ok: false, reason: lockRefuseReason(lockCheck), kind: 'mo_transport' };
  }
  return { ok: true, kind: 'mo_transport', state: 'activated' };
}

// TRANSPORT Use — board the elevator or tram. The C++ has no type-11 Use case at all; boarding is
// walking on, so our Use is that board. Movement comes from ElevatorTransport and the travel bake.
function useTransport(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  const lockCheck = checkGoLock(go, ctx);
  if (!lockCheck.ok) {
    return { ok: false, reason: lockRefuseReason(lockCheck), kind: 'transport' };
  }
  return { ok: true, kind: 'transport', state: 'activated' };
}

// SUMMONING_RITUAL Use — the grouped channel. Cite: GameObject.cpp:1772–1829 AddUniqueUse, the
// animation and channel casts, and the participant count against reqParticipants.
function useSummoningRitual(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  const kind: UseGameObjectKind = 'summoning_ritual';
  if (go.type !== GAMEOBJECT_TYPE_SUMMONING_RITUAL) {
    return { ok: false, reason: 'unsupported', kind: 'unsupported' };
  }
  const ritual = go.summoningRitual ?? {};
  const delayUntil = ctx.delayedActionUntilMs ?? ctx.runtime?.delayedActionUntilMs;
  if (delayUntil != null && delayUntil > ctx.nowMs) {
    return { ok: false, reason: 'not_ready', kind };
  }

  const userId = ctx.userId ?? 'player';
  const unique = new Set(ctx.uniqueUserIds ?? ctx.runtime?.uniqueUsers ?? []);
  const firstUser = ctx.firstUser ?? ctx.runtime?.firstUser;

  if (ctx.hasOwner) {
    // Owner already counted in EffectTransmitted; cannot Use again.
    // Cite: GameObject.cpp:1791–1793; SpellEffects.cpp:5374 AddUniqueUse(caster).
    if (ctx.isOwner) return { ok: false, reason: 'is_owner', kind };
    if (ritual.castersGrouped && !ctx.inGroup) {
      return { ok: false, reason: 'not_in_group', kind };
    }
    if (!ctx.ownerChanneling) {
      return { ok: false, reason: 'owner_not_channeling', kind };
    }
  } else if (
    firstUser
    && firstUser !== userId
    && ritual.castersGrouped
    && !ctx.inGroup
  ) {
    // Cite: GameObject.cpp:1801–1810 — later users must share firstUser's group.
    return { ok: false, reason: 'not_in_group', kind };
  }

  unique.add(userId);
  const nextFirst = firstUser ?? userId;
  const uniqueUseCount = unique.size;
  const reqParticipants = (ritual.reqParticipants ?? 0) | 0;
  const anim = (ritual.animSpell ?? 0) | 0;
  const goSpell = (ctx.goSpellId ?? 0) | 0;
  const channelSpellId = anim > 0 ? anim : goSpell > 0 ? goSpell : undefined;
  const ready = uniqueUseCount >= reqParticipants;
  const persist = ritual.ritualPersistent === true;
  // Custom delay is CustomData1 — not baked. No delay → TriggerSummoningRitual now.
  // Cite: GameObject.cpp:1824–1827; GameObject.h:359–363 summoningRitualCustom.delay.

  return {
    ok: true,
    kind,
    channelSpellId,
    ritualSpellId: ready && ((ritual.spellId ?? 0) | 0) > 0 ? ritual.spellId : undefined,
    uniqueUseCount,
    reqParticipants,
    ritualReady: ready,
    uniqueUserIds: ready && persist ? [] : [...unique],
    firstUser: ready && persist ? undefined : nextFirst,
    despawn: ready && !persist ? true : undefined,
    state: ready ? (persist ? 'ready' : 'just_deactivated') : 'activated',
  };
}

// The player's Use plus the remaining group members as unique channelers. The C++ needs each player
// to click; companions have no click, so one Use joins the whole group.
export function useSummoningRitualParty(
  go: GameObjectDef,
  ctx: UseGameObjectCtx & { partyUserIds?: readonly string[] },
): UseGameObjectResult {
  const party = ctx.partyUserIds && ctx.partyUserIds.length > 0
    ? ctx.partyUserIds
    : [ctx.userId ?? 'player'];
  let last = useGameObject(go, { ...ctx, userId: party[0] });
  if (!last.ok || !go.summoningRitual?.castersGrouped) return last;
  for (let i = 1; i < party.length; i++) {
    if (last.ritualReady) break;
    last = useGameObject(go, {
      ...ctx,
      userId: party[i],
      inGroup: true,
      uniqueUserIds: last.uniqueUserIds,
      firstUser: last.firstUser,
    });
    if (!last.ok) return last;
  }
  return last;
}

/** GameObject.cpp:1569-1575 — Use is only TriggerLinkedGameObject (GetLinkedGameObjectEntry :474). */
function useSpellFocus(go: GameObjectDef): UseGameObjectResult {
  return {
    ok: true,
    kind: 'spell_focus',
    linkedTrapId: go.spellFocus?.linkedTrapId,
    questCredit: false,
    state: 'activated',
  };
}

/** TriggerLinkedGameObject — Use the linked trap template. Cite: GameObject.cpp:1273-1303. */
export function applyLinkedTrap(
  result: UseGameObjectResult,
  trapGo: GameObjectDef | undefined,
  ctx: Pick<UseGameObjectCtx, 'nowMs' | 'runtime'>,
): UseGameObjectResult {
  if (!result.ok || !result.linkedTrapId) return result;
  if (!trapGo || trapGo.entry !== result.linkedTrapId || trapGo.type !== GAMEOBJECT_TYPE_TRAP) {
    return result;
  }
  const trapUsed = triggerTrap(trapGo, ctx);
  if (!trapUsed.ok) return result;
  return { ...result, castSpellId: trapUsed.castSpellId ?? result.castSpellId };
}

function useFishingHole(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  // FISHINGHOLE: the loot id is data1. The school's open counter finishes it — AddUse, then a use
  // count at or past urand(minSuccessOpens, maxSuccessOpens) deactivates the hole.
  const lockCheck = checkGoLock(go, ctx);
  if (!lockCheck.ok) {
    return { ok: false, reason: lockRefuseReason(lockCheck), kind: 'fishinghole' };
  }
  // Already despawned / restocking (prior open hit min/maxSuccessOpens).
  if (ctx.runtime?.readyAtMs != null && ctx.runtime.readyAtMs > ctx.nowMs) {
    return {
      ok: false,
      reason: 'not_ready',
      kind: 'fishinghole',
      restockAtMs: ctx.runtime.readyAtMs,
      state: 'not_ready',
    };
  }
  const hole = go.fishinghole;
  const minOpens = hole?.minSuccessOpens != null && hole.minSuccessOpens > 0 ? hole.minSuccessOpens : 1;
  const maxOpens = hole?.maxSuccessOpens != null && hole.maxSuccessOpens >= minOpens
    ? hole.maxSuccessOpens
    : minOpens;
  const prevUses = ctx.runtime?.uses ?? 0;
  const newUses = prevUses + 1;
  // Re-roll threshold each finish (exact CMaNGOS: urand each loot, not a fixed charge pool).
  const threshold = ctx.rng ? ctx.rng.int(minOpens, maxOpens) : maxOpens;
  const depleted = newUses >= threshold;
  const lootId = hole?.lootId ?? go.lootId;
  return {
    ok: true,
    kind: 'fishinghole',
    lootId,
    // Reuse trapUses slot for school open count (goRuntime.uses).
    trapUses: newUses,
    despawn: depleted || undefined,
    state: depleted ? 'just_deactivated' : 'activated',
  };
}

/** GAMEOBJECT_TYPE_SPELLCASTER Use — spellId + charges. Cite: GameObject.cpp:1831–1859, :1952–1970, :508–513. */
function useSpellcaster(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  const kind: UseGameObjectKind = 'spellcaster';
  if (go.type !== GAMEOBJECT_TYPE_SPELLCASTER) {
    return { ok: false, reason: 'unsupported', kind: 'unsupported' };
  }
  const info = go.spellcaster;
  const spellId = info?.spellId ?? 0;
  if (!spellId) {
    return { ok: false, reason: 'unsupported', kind };
  }
  if (info?.partyOnly && ctx.inOwnerGroup === false) {
    return { ok: false, reason: 'party_only', kind };
  }
  const maxCharges = info?.charges ?? 0;
  const uses = ctx.runtime?.uses ?? 0;
  if (maxCharges > 0 && uses >= maxCharges) {
    return { ok: false, reason: 'no_charges', kind, trapUses: uses, despawn: true };
  }
  const newUses = uses + 1;
  const exhausted = maxCharges > 0 && newUses >= maxCharges;
  return {
    ok: true,
    kind,
    castSpellId: spellId,
    trapUses: newUses,
    despawn: exhausted || undefined,
    state: exhausted ? 'just_deactivated' : 'activated',
  };
}

/** GAMEOBJECT_TYPE_MEETINGSTONE Use — group target + level gate, then spell 23598. Cite: GameObject.cpp:1864–1892. */
function useMeetingStone(go: GameObjectDef, ctx: UseGameObjectCtx): UseGameObjectResult {
  const kind: UseGameObjectKind = 'meetingstone';
  if (go.type !== GAMEOBJECT_TYPE_MEETINGSTONE || !go.meetingstone) {
    return { ok: false, reason: 'unsupported', kind: 'unsupported' };
  }
  // Cite: GameObject.cpp:1876–1877 — !target || target == player || !IsInGroup → return.
  if (!ctx.hasGroupTarget) {
    return { ok: false, reason: 'no_target', kind };
  }
  const minL = go.meetingstone.minLevel ?? 0;
  const maxL = go.meetingstone.maxLevel ?? 0;
  const playerLevel = ctx.playerLevel;
  const targetLevel = ctx.targetLevel;
  if (playerLevel == null || targetLevel == null) {
    return { ok: false, reason: 'missing_context', kind };
  }
  // Cite: GameObject.cpp:1880–1886 — both players must be within [minLevel, maxLevel].
  if (playerLevel < minL || playerLevel > maxL || targetLevel < minL || targetLevel > maxL) {
    return { ok: false, reason: 'level_out_of_range', kind };
  }
  return {
    ok: true,
    kind,
    castSpellId: MEETINGSTONE_SUMMON_SPELL_ID,
    state: 'activated',
  };
}

/** Types not implemented in this pure engine (explicit gaps for H2+). Do not silently treat as chests. */
export const UNSUPPORTED_GO_TYPES: ReadonlyArray<{ type: number; name: string }> = [
  // QUESTGIVER is implemented (FO2) — not listed here.
  { type: GAMEOBJECT_TYPE_BINDER, name: 'BINDER' },
  { type: GAMEOBJECT_TYPE_GENERIC, name: 'GENERIC' },
  { type: GAMEOBJECT_TYPE_CHAIR, name: 'CHAIR' },
  { type: GAMEOBJECT_TYPE_TEXT, name: 'TEXT' },
  { type: GAMEOBJECT_TYPE_AREADAMAGE, name: 'AREADAMAGE' },
  { type: GAMEOBJECT_TYPE_CAMERA, name: 'CAMERA' },
  { type: GAMEOBJECT_TYPE_MAP_OBJECT, name: 'MAP_OBJECT' },
  { type: GAMEOBJECT_TYPE_DUEL_ARBITER, name: 'DUEL_ARBITER' },
  { type: GAMEOBJECT_TYPE_MAILBOX, name: 'MAILBOX' },
  { type: GAMEOBJECT_TYPE_SUMMONING_RITUAL, name: 'SUMMONING_RITUAL' },
  { type: GAMEOBJECT_TYPE_AUCTIONHOUSE, name: 'AUCTIONHOUSE' },
  { type: GAMEOBJECT_TYPE_GUARDPOST, name: 'GUARDPOST' },
  { type: GAMEOBJECT_TYPE_FLAGSTAND, name: 'FLAGSTAND' },
  { type: GAMEOBJECT_TYPE_FLAGDROP, name: 'FLAGDROP' },
];
