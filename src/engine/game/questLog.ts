// Quest log facade: accept / abandon / finish / item-use / talk / turn-in + refresh.
// Pattern C: createRefreshQuests + createQuestLogModule — no import of game.ts.

import type { QuestDef } from '../../data/schema.ts';
import type { Inventory } from '../../domain/items/inventory.ts';
import {
  addItem,
  applyCreatedItems,
  canFit,
  countItem,
  removeItem,
} from '../../domain/items/inventory.ts';
import { ownedInventory } from '../../domain/items/keyring.ts';
import { mailboxAsInventory } from '../../domain/economy/mail.ts';
import { getStanding } from '../../domain/creature/reputation.ts';
import type { QuestLog } from '../../domain/quests/questlog.ts';
import {
  getQuest,
  accept,
  abandon,
  recordKill,
  recordCastedCreatureOrGO,
  recordEventHappens,
  recordSourceItemUse,
  recordTalkToNpc,
  reqSpellForObjectTarget,
  creatureCreditTargets,
  refreshCompletion,
  questComplete,
  hasQuestSlot,
  MAX_QUEST_SLOTS,
  canTakeQuest,
  satisfyQuestClass,
  freshQuestState,
  isItemStartedQuest,
  isRepeatableQuest,
  itemStartRequiredItem,
  itemStartGateMet,
  shouldGrantSrcItemOnAccept,
  shouldDestroyStartItemOnAccept,
  requiresEventCredit,
  requiresSourceUseCredit,
  canDegradedAutoFinish,
  recordSameZoneDeliver,
  type QuestPlayerSnapshot,
} from '../../domain/quests/questlog.ts';
import { runQuestAcceptScripts } from '../../domain/quests/interpreter/dbscript/hooks.ts';
import { recordDeliverTalk } from '../../domain/quests/talkDeliver.ts';
import {
  creditSquadEvent,
  creditSquadKill,
  creditSquadLogs,
  creditSquadSourceUse,
  creditSquadTalk,
  shareSquadAbandon,
  shareSquadAccept,
  shareSquadTurnIn,
} from './squadQuestShare.ts';
import { prereqMet } from '../../quests/quests.ts';
import { resolveCombatSpell } from '../spells/interpreter/index.ts';
import { applyOocCastEffects } from './oocCastEffects.ts';
import { mulberry32, hashSeed } from '../core/rng.ts';
import { applyQuestTurnIn } from './questTurnIn.ts';
import { partyOverflow } from './bagOverflow.ts';
import type { BagHandle } from './context.ts';
import { tryTamingRodOnTarget } from './tamingRodUse.ts';
import { consumeItemCharges, hasChargesLeft, NO_CHARGES_REMAIN } from '../../domain/items/inventory.ts';
import { tryQuestItemOnCreature } from './questItemOnCreature.ts';
import { stampCorpseSpellHit, tryQuestItemOnCorpse } from './questItemOnCorpse.ts';
import { applySendEventFromSpell, type ApplySendEventFromSpellResult } from './sendEventFromSpell.ts';
import { applyActivateObjectFromSpell } from './activateObjectFromSpell.ts';
import { applyOpenLockFromSpell } from './openLockFromSpell.ts';
import { refuseIfDead } from '../../domain/run/death.ts';
import type { CombatSession } from '../combat/session-types.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import { removeCharAurasWithInterruptFlags } from './oocAuraInterrupt.ts';
import type { LootDrop } from '../../domain/items/loot.ts';
import type { LockDef } from '../../domain/world/openLock.ts';
import { isConditionSatisfied, type ConditionTable, type ConditionSnapshot } from '../spells/conditions.ts';
import { MAX_QUEST_REPEATS, type Game, type QuestRepeatStop } from './types.ts';
import type { GameCtx } from './context.ts';
import { applyWorldStateWrites, ensureWorldStates } from './worldState.ts';
import {
  applyFailedQuests,
  collectFailedQuestIds,
  makeDbScriptEvaluateCondition,
} from './applyTerminateFromDbScript.ts';
import { applyActiveObjectFromDbScript } from './applyActiveObjectFromDbScript.ts';
import { applyEscortFromDbScript } from './applyEscortFromDbScript.ts';
import { applyHoverFromDbScript } from './applyHoverFromDbScript.ts';
import {
  applyDoorAndGoBags,
  lookupDungeonGoActor,
} from './applyDoorFromDbScript.ts';
import { applyTailFromDbScript } from './applyTailFromDbScript.ts';
import { deliverScriptMail } from './mail.ts';
import {
  collectExploreQuestIds,
  collectKillCreditEntries,
} from '../../domain/world/goEventFire.ts';

/** Bags + keyring + overflow mail, for ownership questions only. Never write through it. */
function owned(state: GameCtx['state']): Inventory {
  return ownedInventory(state.inventory, state.keyring, mailboxAsInventory(state.mailbox ?? []));
}

// One-time normalizer for legacy QuestLog (pre-GameObject support) so objects[] always exists
// when objectTargets are declared on the quest def. Safe/no-op on modern data.
function ensureQuestObjects(log: QuestLog, questOf: (e: number) => QuestDef | undefined): QuestLog {
  const out = { ...log, quests: log.quests.map(q => ({ ...q, objects: { ...(q.objects || {}) } })) };
  for (const q of out.quests) {
    const def = questOf(q.entry);
    if (!def) continue;
    for (const ot of (def.objectTargets || [])) {
      const k = String(ot.objectEntry);
      if (!(k in q.objects)) q.objects[k] = 0;
    }
  }
  return out;
}

// FO3: back-fill spells{} for active quests with spellCastTargets (pre-FO3 saves).
function ensureQuestSpells(log: QuestLog, questOf: (e: number) => QuestDef | undefined): QuestLog {
  const out = { ...log, quests: log.quests.map(q => ({ ...q, spells: { ...(q.spells || {}) } })) };
  for (const q of out.quests) {
    const def = questOf(q.entry);
    if (!def) continue;
    for (const st of (def.spellCastTargets || [])) {
      if (!st.spell) continue;
      const k = String(st.spell);
      if (!(k in q.spells!)) q.spells![k] = 0;
    }
    // SPEAKTO / TalkedToCreature slots when slim killTargets was cleared (garments).
    for (const kt of creatureCreditTargets(def)) {
      const k = String(kt.creatureEntry);
      if (!(k in q.kills)) q.kills[k] = 0;
    }
  }
  return out;
}

export type RefreshQuestsExtras = {
  standingFor: (factionId: number) => number;
};

/** Early helper so GameCtx.refreshQuests exists before other modules mount. */
export function createRefreshQuests(
  deps: Pick<GameCtx, 'ds' | 'state'>,
  extras: RefreshQuestsExtras,
): () => void {
  const { ds, state } = deps;
  const { standingFor } = extras;
  return (): void => {
    // Ensure object / spell-cast tracking for legacy saves that may lack those maps on QuestState
    state.questlog = ensureQuestObjects(state.questlog, (e) => ds.quest(e));
    state.questlog = ensureQuestSpells(state.questlog, (e) => ds.quest(e));
    // Bags AND keyring: objectives were checked against bags alone, so any objective item whose bag
    // family is KEYS migrated to the keyring on pickup and the quest never registered it.
    const inv = owned(state);
    // Deliver arrival while already in the ender zone, for a same-zone accept or a last gather.
    // Deliver only — a pure talk still needs a zone enter or an actual conversation.
    state.questlog = recordSameZoneDeliver(
      state.questlog,
      state.char.zoneId,
      (e) => ds.quest(e),
      inv,
    );
    state.questlog = refreshCompletion(state.questlog, (e) => ds.quest(e), inv, { standingFor });
  };
}

export type QuestLogExtras = {
  standingFor: (factionId: number) => number;
  /** Your bags plus the queue behind them — full bags never refuse a hand-in. */
  playerBags: BagHandle;
  runAutoEquipUpgrades: (max?: number) => number;
  applySendEventTempSpawns: (fired: ApplySendEventFromSpellResult['fired']) => void;
  conditionTableById?: () => ConditionTable;
  lootConditionSnapshot?: () => ConditionSnapshot;
  /** The open floor session owns the player's live auras — DoInteraction has to reach it too. */
  liveSession?: () => CombatSession | null;
};

export function createQuestLogModule(
  ctx: GameCtx,
  extras: QuestLogExtras,
): Pick<
  Game,
  | 'acceptQuest'
  | 'abandonQuest'
  | 'finishEscort'
  | 'useQuestItemOnTarget'
  | 'talkToNpc'
  | 'turnInQuest'
  | 'repeatQuest'
> {
  const { ds, state, log, cap, refreshQuests } = ctx;
  const { standingFor, runAutoEquipUpgrades, applySendEventTempSpawns } = extras;
  // Full bags no longer refuse a hand-in: the reward junk-filters, frees a slot, is worn, or is queued.
  const playerBags = extras.playerBags;

  // Player::DoInteraction — clicking a quest giver drops stealth and anything else carrying the bit.
  // Cite: Player.cpp:20022; Player.cpp:2422 GetNPCIfCanInteractWith, :2463 for a GO giver.
  const doInteraction = (): void => {
    const stripped = removeCharAurasWithInterruptFlags(
      state.char, AURA_INTERRUPT.INTERACTING, ds, null, extras.liveSession?.() ?? null,
    );
    for (const gone of stripped) log(`${gone.name} fades.`);
  };

  const api: Pick<
    Game,
    | 'acceptQuest'
    | 'abandonQuest'
    | 'finishEscort'
    | 'useQuestItemOnTarget'
    | 'talkToNpc'
    | 'turnInQuest'
    | 'repeatQuest'
  > = {
    acceptQuest(entry, opts) {
      // Dead cannot accept quests (KI-915). Cite: Unit::IsAlive interact / CanTakeQuest path.
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      doInteraction();
      const q = ds.quest(entry);
      if (!q) return { ok: false, reason: 'Unknown quest' };
      // A rewarded REPEATABLE keeps its row (this tree's m_rewarded) but core reads its status as
      // NONE, so it is takeable again. Cite: Player.cpp:12611 RewardQuest.
      const held = getQuest(state.questlog, entry);
      if (held && !(held.status === 'turnedIn' && isRepeatableQuest(q))) {
        return { ok: false, reason: 'Already in your log' };
      }
      if (!hasQuestSlot(state.questlog)) return { ok: false, reason: `Your quest log is full (${MAX_QUEST_SLOTS}/${MAX_QUEST_SLOTS}). Abandon a quest first.` };
      // Wave D: full Satisfy* gate (level/class/race/prev/exclusive/skill/rep/timed/reqCondition).
      // Cite: Player.cpp CanTakeQuest. Snapshot from live char + log.
      const snap: QuestPlayerSnapshot = {
        level: state.char.level,
        classId: state.char.cls,
        raceId: state.char.race,
        questStatus: (id) => {
          const s = getQuest(state.questlog, id);
          if (!s) return 'none';
          if (s.status === 'turnedIn') return 'turnedIn';
          if (s.status === 'complete') return 'complete';
          if (s.status === 'failed') return 'failed';
          return 'active';
        },
        skillValue: (skillId) => {
          // Numeric skillId → combatSkills (weapon/defense/lockpicking). Cite: domain/character/combatSkills.ts.
          return state.char.combatSkills?.[skillId]?.current ?? 0;
        },
        standingFor: (factionId) => {
          const f = ds.faction(factionId);
          if (!f) return 0;
          return getStanding(state.char.reputations, f, state.char.race, state.char.cls);
        },
        hasActiveTimedQuest: state.questlog.quests.some((qq) => {
          if (qq.status === 'turnedIn' || qq.status === 'failed') return false;
          const qd = ds.quest(qq.entry);
          return !!(qd?.limitTime && qd.limitTime > 0);
        }),
        conditionEval: (conditionId) => {
          if (!extras.conditionTableById || !extras.lootConditionSnapshot) return true;
          return isConditionSatisfied(conditionId, extras.lootConditionSnapshot(), extras.conditionTableById()).ok;
        },
      };
      // prevQuest pruned from bake (no row) must not gate - same as prereqMet.
      // questDefFor: exclusive-group-all on rewarded prev (Player.cpp:12857–12890 / KI-161).
      const prevMissing = !!(q.prevQuest && !ds.quest(q.prevQuest));
      if (!canTakeQuest(snap, q, {
        prevQuestMissingFromData: prevMissing,
        questDefFor: (id) => ds.quest(id) as typeof q | undefined,
      })) {
        // Keep useful messages for common failures; generic for complex gates.
        if (!satisfyQuestClass(snap, q)) return { ok: false, reason: 'Not a quest for your class' };
        if (state.char.level < q.minLevel) return { ok: false, reason: `Requires level ${q.minLevel}` };
        if (!prereqMet(ds, q, state.questlog)) return { ok: false, reason: 'Finish the earlier quest in the chain first' };
        return { ok: false, reason: 'You cannot take this quest' };
      }
      // Accept always tops up the quest's source item, and an item-started quest whose start differs
      // from its source still grants. Unused start items are destroyed first so bag space frees.
      const itemStarted = isItemStartedQuest(q);
      // The starter-zone gate, which item-started quests bypass. The character's zone is never a
      // dungeon, so the gate alone blocked 187 of 331 dungeon quest rows. Being in the run IS being there.
      const starters = q.starterZones ?? [];
      const runDef = state.instance ? ds.instance(state.instance.dungeonId) : undefined;
      const atInstanceGiver = !!runDef?.quests?.includes(entry);
      if (starters.length > 0 && !itemStarted && !atInstanceGiver
          && !starters.includes(state.char.zoneId)) {
        return { ok: false, reason: 'That quest giver is not here' };
      }
      const grantSrc = shouldGrantSrcItemOnAccept(q, opts);
      const destroyStart = shouldDestroyStartItemOnAccept(q);
      const startItemId = itemStartRequiredItem(q);
      if (itemStarted && startItemId != null && !itemStartGateMet(q, owned(state))) {
        const iname = ds.item(startItemId)?.name ?? `item ${startItemId}`;
        return { ok: false, reason: `Requires ${iname} to start this quest` };
      }
      // CanAddQuest bag-fit for the missing grant amount only when we will grant.
      // If start item is destroyed first, fit against inventory after that remove.
      const src = q.srcItem;
      if (src?.item && grantSrc) {
        const need = src.count > 0 ? src.count : 1;
        const have = countItem(state.inventory, src.item);
        if (have < need) {
          const missing = need - have;
          const idef = ds.item(src.item);
          const maxStack = idef?.stackable ?? 1;
          let invForFit = state.inventory;
          if (destroyStart && startItemId != null && startItemId !== src.item
              && countItem(state.inventory, startItemId) >= 1) {
            invForFit = removeItem(state.inventory, startItemId, 1)[0];
          }
          if (!canFit(invForFit, src.item, missing, maxStack, cap())) {
            // The source item has to sit IN the bags to do the quest, so it is never queued — but
            // the same junk pass a reward gets still frees the slot first (CanAddQuest, Player.cpp:12296).
            ctx.handleFullBags(src.item, missing, playerBags);
            invForFit = state.inventory;
            if (destroyStart && startItemId != null && startItemId !== src.item
                && countItem(state.inventory, startItemId) >= 1) {
              invForFit = removeItem(state.inventory, startItemId, 1)[0];
            }
            if (!canFit(invForFit, src.item, missing, maxStack, cap())) {
              return { ok: false, reason: 'Inventory full' };
            }
          }
        }
      }
      state.questlog = accept(state.questlog, q);
      // Player.cpp:12470-12488 — destroy start item when not needed for finish / not SrcItem.
      if (destroyStart && startItemId != null && countItem(state.inventory, startItemId) >= 1) {
        state.inventory = removeItem(state.inventory, startItemId, 1)[0];
      }
      if (src?.item && grantSrc) {
        const need = src.count > 0 ? src.count : 1;
        const have = countItem(state.inventory, src.item);
        if (have < need) {
          const missing = need - have;
          const idef = ds.item(src.item);
          state.inventory = addItem(state.inventory, src.item, missing, idef?.stackable ?? 1);
        }
      }
      // Bag-met item objectives recompute on refresh, while a deliver still needs ender arrival. Do
      // NOT run the full talk-or-deliver on accept — that was free XP for talk quests.
      refreshQuests();
      // QI5: dbscripts_on_quest_start + scriptdev2 accept registry (Player.cpp AcceptQuest StartScript).
      // Prefer QuestDef.rawScripts; host surfaces talk intents in the zone feed.
      try {
        const goRuntimeKey = (entry: number) => `${state.char.zoneId}:${entry}`;
        const goLookupCache = new Map<number, ReturnType<typeof lookupDungeonGoActor>>();
        const lookupGameObjectByGuid = (g: number) => {
          if (goLookupCache.has(g)) return goLookupCache.get(g) ?? null;
          const a = lookupDungeonGoActor(g, {
            goRuntime: state.goRuntime,
            goRuntimeKey,
            gameObject: (e) => ds.gameObject(e),
          });
          goLookupCache.set(g, a);
          return a;
        };
        const scriptOpts =
          extras.conditionTableById && extras.lootConditionSnapshot
            ? {
                evaluateCondition: makeDbScriptEvaluateCondition(
                  extras.lootConditionSnapshot(),
                  extras.conditionTableById(),
                ),
                lookupGameObjectByGuid,
              }
            : { lookupGameObjectByGuid };
        const scriptRes = runQuestAcceptScripts(q, scriptOpts);
        for (const intent of scriptRes.intents ?? []) {
          // TALK intents carry textId (DB string); surface as a feed line when present.
          if (intent.kind === 'talk' && intent.textId) {
            log(`(quest) says text #${intent.textId}`);
          }
        }
        if (scriptRes.world?.worldStates) {
          state.worldStates = ensureWorldStates(state.worldStates);
          applyWorldStateWrites(state.worldStates, scriptRes.world.worldStates);
        }
        // Cite: ScriptMgr.cpp:2220-2235 StoreNewItemInInventorySlot / DestroyItemCount.
        state.inventory = applyCreatedItems(
          state.inventory,
          scriptRes.world.createdItems,
          (e) => ds.item(e),
          cap(),
        );
        // Cite: ScriptMgr.cpp:2719–2734 TERMINATE_COND failQuest; Player.cpp:12730–12761.
        state.questlog = applyFailedQuests(
          state.questlog,
          collectFailedQuestIds(scriptRes.world, scriptRes.intents),
        );
        for (const qid of collectExploreQuestIds(scriptRes)) {
          state.questlog = recordEventHappens(state.questlog, qid);
          creditSquadEvent(state, qid);
        }
        for (const entry of collectKillCreditEntries(scriptRes)) {
          state.questlog = recordKill(state.questlog, entry, (e) => ds.quest(e));
          creditSquadKill(state, entry, ds);
        }
        // Cite: ScriptMgr.cpp:2367–2376; Object.cpp:2563–2578.
        applyActiveObjectFromDbScript(scriptRes.world, scriptRes.intents);
        // Cite: ScriptMgr.cpp:1829–1874 / :2439–2456 / :2684–2692 / :2757–2826 / :2237–2250.
        applyEscortFromDbScript(scriptRes.world, scriptRes.intents);
        // Cite: ScriptMgr.cpp:2847–2864 SetHover(fly) on Creature pSource.
        applyHoverFromDbScript(scriptRes.world, scriptRes.intents);
        // Cite: ScriptMgr.cpp:1980–2025 / :2864–2871 / :2478–2503 / :2907–2923.
        state.goRuntime = applyDoorAndGoBags(
          scriptRes.world,
          scriptRes.intents,
          state.goRuntime,
          goRuntimeKey,
          log,
        );
        // Cite: ScriptMgr.cpp:3264–3267 / :2828–2843 / :2182–2218 / :1815–1911 / :2881–2992 / :2938–2948.
        {
          state.worldStates = ensureWorldStates(state.worldStates);
          const tail = applyTailFromDbScript(scriptRes.world, scriptRes.intents, {
            source: scriptRes.world.source,
            worldStates: state.worldStates,
            log,
            relayScripts: (id) => ds.relayScripts(id),
            questlog: state.questlog,
            goRuntime: state.goRuntime,
            goRuntimeKey,
            evaluateCondition: 'evaluateCondition' in scriptOpts
              ? scriptOpts.evaluateCondition
              : undefined,
            lookupGameObjectByGuid,
            onMail: (rec) => deliverScriptMail(ctx, rec, Date.now(), 'Mailbox'),
          });
          if (tail.questlog) state.questlog = tail.questlog;
          if (tail.goRuntime) state.goRuntime = tail.goRuntime;
        }
        refreshQuests();
      } catch (e) {
        // Scripts must never block accept; log honestly.
        log(`Quest start script error: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Player.cpp AcceptQuest: CastSpell(this, GetSrcSpell(), true) — triggered, no learn/cost.
      // Missing/empty bake (6716, 19027) must not fail accept. Cite: Player.cpp AcceptQuest.
      const srcSpell = q.srcSpell ?? 0;
      if (srcSpell > 0) {
        try {
          const raw = ds.spell(srcSpell);
          if (raw) {
            const resolved = resolveCombatSpell(raw, { casterLevel: state.char.level });
            const now = Date.now();
            const applied = applyOocCastEffects({
              spellId: srcSpell,
              spell: resolved,
              char: state.char,
              inventory: state.inventory,
              ds,
              now,
              alreadyStealthed: false,
              log,
              rng: mulberry32(hashSeed(state.rngSeed, state.fightCounter++)),
            });
            state.char = applied.char;
            state.inventory = applied.inventory;
          }
        } catch (e) {
          log(`Quest srcSpell error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      log(`Quest accepted: ${q.title}.`);
      {
        const names = shareSquadAccept(state, ds, entry, log);
        if (names.length) log(`${names.join(', ')} take the quest too.`);
      }
      return { ok: true };
    },

    abandonQuest(entry) {
      const st = getQuest(state.questlog, entry);
      if (!st) return { ok: false, reason: 'Not in your log' };
      if (st.status === 'turnedIn') return { ok: false, reason: 'Already completed' };
      // CMaNGOS TakeQuestSourceItem (Player.cpp:13209): destroy SrcItem on abandon.
      const q = ds.quest(entry);
      const src = q?.srcItem;
      if (src?.item) {
        const take = src.count > 0 ? src.count : 1;
        state.inventory = removeItem(state.inventory, src.item, take)[0];
      }
      state.questlog = abandon(state.questlog, entry);
      shareSquadAbandon(state, entry);
      log(`Quest abandoned: ${ds.quest(entry)?.title ?? entry}.`);
      return { ok: true };
    },

    // An explicit player end-condition for event and escort quests with no escort path in the bake.
    // Credits the event bit only; the turn-in remains the reward path, and accept does not fire it.
    finishEscort(entry) {
      const q = ds.quest(entry);
      if (!q) return { ok: false, reason: 'Unknown quest' };
      const st = getQuest(state.questlog, entry);
      if (!st) return { ok: false, reason: 'Not in your log' };
      if (st.status === 'turnedIn') return { ok: false, reason: 'Already completed' };
      if (st.status === 'failed') return { ok: false, reason: 'Quest failed, abandon to retry' };
      if (!requiresEventCredit(q)) {
        return { ok: false, reason: 'This quest does not use escort/event completion' };
      }
      if (st.explored === true) {
        return { ok: false, reason: 'Escort/event already complete' };
      }
      // A degraded escort, an empty explore, or a mixed event and kill quest credits the event bit
      // only: kill, item and use objectives still gate completion and turn-in.
      state.questlog = recordEventHappens(state.questlog, entry);
      creditSquadEvent(state, entry);
      refreshQuests();
      if ((q.exploreTriggers?.length ?? 0) > 0) {
        log(`Exploration complete (simplified): ${q.title}.`);
      } else if (canDegradedAutoFinish(q)) {
        log(`Escort complete (simplified): ${q.title}.`);
      } else {
        log(`Event objective complete: ${q.title}.`);
      }
      return { ok: true };
    },

    // Use a source or provided quest item on a creature or object target. A successful use spends it the
    // way TakeCastItem does, and nothing at all at spellcharges 0. Taming rods route here.
    useQuestItemOnTarget(opts) {
      // Dead cannot use quest items on targets (acceptQuest already gated; KI-915/KI-936).
      // Cite: Spell.cpp CheckCast SPELL_FAILED_CASTER_DEAD; refuseIfDead.
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      const itemEntry = opts?.itemEntry ?? 0;
      if (!itemEntry) return { ok: false, reason: 'No item' };
      if (countItem(state.inventory, itemEntry) < 1) {
        return { ok: false, reason: 'You do not have that item' };
      }
      // A spent charge row refuses BEFORE any quest credit, the same order CheckCast uses.
      // Cite: Spell.cpp:6462 SPELL_FAILED_NO_CHARGES_REMAIN; :4209 TakeCastItem.
      {
        const def = ds.item(itemEntry);
        const held = (state.inventory.stacks ?? []).find((st) => st.item === itemEntry);
        if (!hasChargesLeft(def, held?.charges)) {
          return { ok: false, reason: NO_CHARGES_REMAIN };
        }
      }
      // consumeItemCharges is the whole rule: unlimited spends nothing, a counted row decrements, and
      // only a negative one loses the unit at zero. Cite: Spell.cpp:4209 TakeCastItem.
      const spendCastItem = (): void => {
        const taken = consumeItemCharges(state.inventory, itemEntry, ds.item(itemEntry));
        if (taken.ok) state.inventory = taken.inventory;
      };
      const tame = tryTamingRodOnTarget({
        itemEntry,
        targetCreatureEntry: opts.targetCreatureEntry,
        inventory: state.inventory,
        questlog: state.questlog,
        ds,
      });
      if (tame.handled) {
        if (!tame.ok) return { ok: false, reason: tame.reason };
        state.questlog = tame.questlog;
        spendCastItem();
        refreshQuests();
        log(tame.logLine);
        return { ok: true };
      }
      // Cast-on-creature: item.useSpell + ScriptDev spellHits → KilledMonsterCredit.
      // Cite: durotar.cpp AwakenPeon 19938 → KilledMonsterCredit(10556); questItemOnCreature.ts.
      const onCreature = tryQuestItemOnCreature({
        itemEntry,
        targetCreatureEntry: opts.targetCreatureEntry,
        inventory: state.inventory,
        questlog: state.questlog,
        ds,
      });
      if (onCreature.handled) {
        if (!onCreature.ok) return { ok: false, reason: onCreature.reason };
        state.questlog = onCreature.questlog;
        spendCastItem();
        refreshQuests();
        log(onCreature.logLine);
        return { ok: true };
      }
      // Type-2 corpse: srcItem.useSpell on lastCorpse (Screecher Bramble / molt / pike).
      // Cite: spell_script_target type 2; Spell.cpp:7925-7935; gossip 1405 cmd 8.
      const onCorpse = tryQuestItemOnCorpse({
        itemEntry,
        targetCreatureEntry: opts.targetCreatureEntry,
        lastCorpse: state.lastCorpse,
        corpse: state.corpse,
        inventory: state.inventory,
        questlog: state.questlog,
        ds,
      });
      if (onCorpse.handled) {
        if (!onCorpse.ok) return { ok: false, reason: onCorpse.reason };
        state.questlog = onCorpse.questlog;
        if (onCorpse.inventory) state.inventory = onCorpse.inventory;
        spendCastItem();
        state.lastCorpse = stampCorpseSpellHit(state.lastCorpse, onCorpse.hitSpellId, onCorpse.targetEntry);
        refreshQuests();
        log(onCorpse.logLine);
        return { ok: true };
      }
      // A cast on a GO credits the cast against that GO's entry, one class path for seeds, keys and
      // moonwell water with no per-quest branches. Cite: Spell.cpp:1581.
      const goEntry = opts.targetGoEntry;
      const useSpell = ds.item(itemEntry)?.useSpell ?? 0;
      if (goEntry && useSpell > 0) {
        const go = ds.gameObject(goEntry);
        if (!go) return { ok: false, reason: 'No such object here' };
        let matches = false;
        for (const qs of state.questlog.quests) {
          if (qs.status === 'turnedIn' || qs.status === 'failed') continue;
          const q = ds.quest(qs.entry);
          if (!q) continue;
          if (!(q.objectTargets ?? []).some((ot) => ot.objectEntry === goEntry)) continue;
          if (reqSpellForObjectTarget(q, goEntry) === useSpell) {
            matches = true;
            break;
          }
        }
        if (matches) {
          state.questlog = recordCastedCreatureOrGO(
            state.questlog,
            goEntry,
            useSpell,
            (e) => ds.quest(e),
          );
          creditSquadLogs(state, (log) => recordCastedCreatureOrGO(log, goEntry, useSpell, (e) => ds.quest(e)));
          // FO4 source-item use credit when the item is also a sourceItemTarget.
          state.questlog = recordSourceItemUse(state.questlog, itemEntry, (e) => ds.quest(e), 1);
          creditSquadSourceUse(state, itemEntry, ds);
          // Cast-on-GO: fire SEND_EVENT + ACTIVATE_OBJECT from the use spell (gameObjTarget set).
          // Cite: SpellEffects.cpp:1794–1798 EffectSendEvent; :4377–4482 EffectActivateObject.
          const useRaw = ds.spell(useSpell);
          if (useRaw) {
            const useResolved = resolveCombatSpell(useRaw, { casterLevel: state.char.level });
            const se = applySendEventFromSpell(
              state.questlog,
              useResolved,
              (id) => ds.eventScripts(id),
              log,
              (e) => ds.quest(e),
            );
            state.questlog = se.log;
            applySendEventTempSpawns(se.fired);
            const ao = applyActivateObjectFromSpell(useResolved, {
              targetGoEntry: goEntry,
              goRuntime: state.goRuntime,
              goRuntimeKey: (entry) => `${state.char.zoneId}:${entry}`,
              wildSummonedObjects: state.wildSummonedObjects,
              goName: go.name,
            });
            if (ao.goRuntime) state.goRuntime = ao.goRuntime;
            if (ao.wildSummonedObjects) state.wildSummonedObjects = ao.wildSummonedObjects;
            for (const a of ao.applied) log(a.message);
            // SPELL_EFFECT_OPEN_LOCK / OPEN_LOCK_ITEM — EffectOpenLock on gameObjTarget.
            // Cite: SpellEffects.cpp:2204–2274; game/openLockFromSpell.ts.
            const ol = applyOpenLockFromSpell(useResolved, {
              targetGoEntry: goEntry,
              castItemEntry: itemEntry,
              lock: go.lockId != null ? (ds.lock(go.lockId) as LockDef | undefined) : undefined,
              goRuntime: state.goRuntime,
              goRuntimeKey: (entry) => `${state.char.zoneId}:${entry}`,
              targetName: go.name,
            });
            if (ol.goRuntime) state.goRuntime = ol.goRuntime;
            for (const a of ol.applied) log(a.message);
          }
          spendCastItem();
          refreshQuests();
          const iname = ds.item(itemEntry)?.name ?? `item ${itemEntry}`;
          log(`You use ${iname} on ${go.name}.`);
          return { ok: true };
        }
      }

      // Require an active pure-source-item quest that lists this item (use-credit style).
      let listed = false;
      for (const qs of state.questlog.quests) {
        if (qs.status === 'turnedIn' || qs.status === 'failed') continue;
        const q = ds.quest(qs.entry);
        if (!q || !requiresSourceUseCredit(q)) continue;
        if ((q.sourceItemTargets || []).some((t) => t.item === itemEntry)) {
          listed = true;
          break;
        }
      }
      if (!listed) {
        return { ok: false, reason: 'No quest needs that item used on a target' };
      }
      // targetCreatureEntry reserved for future bake target validation when not cast-on-GO.
      void opts.targetCreatureEntry;
      state.questlog = recordSourceItemUse(state.questlog, itemEntry, (e) => ds.quest(e), 1);
      creditSquadSourceUse(state, itemEntry, ds);
      spendCastItem();
      refreshQuests();
      const iname = ds.item(itemEntry)?.name ?? `item ${itemEntry}`;
      log(`You use ${iname}.`);
      return { ok: true };
    },

    // FO4 talk + empty-SF2 gossip-event (QUEST_EXPLORED → m_explored). Matching ender/starter or
    // objective-named mid-event NPC (Great Bear Spirit / Kalaran listen chain).
    talkToNpc(opts) {
      let npcName = (opts?.npcName ?? '').trim();
      const creatureEntry = opts?.creatureEntry;
      if (!npcName && creatureEntry != null) {
        npcName = (ds.creature(creatureEntry)?.name ?? '').trim();
      }
      if (!npcName && creatureEntry == null) {
        return { ok: false, reason: 'Unknown NPC' };
      }
      if (!npcName && creatureEntry != null) {
        return { ok: false, reason: 'Unknown NPC' };
      }
      doInteraction();
      state.questlog = recordTalkToNpc(
        state.questlog,
        (e) => ds.quest(e),
        { npcName, creatureEntry },
        (entry) => ds.creature(entry)?.name,
      );
      // TalkedToCreature for DELIVER (ender + items). Cite: Player.cpp:13603; QI5.
      state.questlog = recordDeliverTalk(
        state.questlog,
        (e) => ds.quest(e),
        { npcName, creatureEntry },
        owned(state),
        (entry) => ds.creature(entry)?.name,
      );
      creditSquadTalk(state, ds, { npcName, creatureEntry });
      refreshQuests();
      log(`You talk to ${npcName}.`);
      return { ok: true };
    },

    turnInQuest(entry, rewardChoice = 0) {
      doInteraction();
      const q = ds.quest(entry);
      if (!q) return { ok: false, reason: 'Unknown quest' };
      const st = getQuest(state.questlog, entry);
      if (!st) return { ok: false, reason: 'Not in your log' };
      // KI-620: objectives often stay "met" after markTurnedIn — block re-reward.
      // Cite: Player.cpp CanRewardQuest; same guard as abandonQuest / finishEscort.
      if (st.status === 'turnedIn') return { ok: false, reason: 'Already completed' };
      if (st.status === 'failed') return { ok: false, reason: 'Quest failed, abandon to retry' };
      // Do NOT free-credit talk or explore here: an empty find or speak quest completes only through a
      // real ender interaction. Deliver arrival is credited first — standing there IS that event.
      state.questlog = recordSameZoneDeliver(
        state.questlog,
        state.char.zoneId,
        (e) => ds.quest(e),
        owned(state),
      );
      const stNow = getQuest(state.questlog, entry) ?? st;
      if (!questComplete(q, stNow, owned(state), { standingFor, money: state.char.gold })) {
        return { ok: false, reason: 'Quest is not complete' };
      }
      // QI5/QI6 reward body peeled to game/questTurnIn.ts (filesize + RewardQuest fidelity).
      const applied = applyQuestTurnIn(
        q,
        entry,
        rewardChoice,
        {
          char: state.char,
          inventory: state.inventory,
          questlog: state.questlog,
          spellbook: state.spellbook,
          actionBars: state.actionBars,
          primaryBarPages: state.primaryBarPages,
          rotation: state.rotation,
          squadRole: state.squadRole,
          rotationSpec: state.rotationSpec,
          rngSeed: state.rngSeed,
          fightCounter: state.fightCounter,
          mailbox: state.mailbox ?? [],
          worldStates: state.worldStates,
          goRuntime: state.goRuntime,
        },
        {
          ds,
          log,
          cap,
          runAutoEquipUpgrades,
          refreshQuests,
          bags: playerBags,
          handleFullBags: ctx.handleFullBags,
          publish: (char, inventory, mailbox) => {
            state.char = char;
            state.inventory = inventory;
            state.mailbox = mailbox;
          },
          adopt: () => ({ char: state.char, inventory: state.inventory, mailbox: state.mailbox ?? [] }),
        },
      );
      if (!applied.ok) return { ok: false, reason: applied.reason };
      state.char = applied.state.char;
      state.inventory = applied.state.inventory;
      state.questlog = applied.state.questlog;
      state.spellbook = applied.state.spellbook;
      state.actionBars = applied.state.actionBars;
      if (applied.state.primaryBarPages) state.primaryBarPages = applied.state.primaryBarPages;
      state.rotation = applied.state.rotation ?? state.rotation;
      state.fightCounter = applied.state.fightCounter;
      if (applied.state.mailbox) state.mailbox = applied.state.mailbox;
      if (applied.state.worldStates) state.worldStates = applied.state.worldStates;
      if (applied.state.goRuntime) state.goRuntime = applied.state.goRuntime;
      {
        const names = shareSquadTurnIn(state, ds, entry, partyOverflow(ctx), log);
        if (names.length) log(`${names.join(', ')} complete the quest too.`);
      }
      return {
        ok: true,
        xp: applied.xp,
        money: applied.money,
        items: applied.items,
        spells: applied.spells,
        buffs: applied.buffs,
        leveledTo: applied.leveledTo,
        tempSpawns: applied.tempSpawns,
      };
    },

    // Turn in and re-accept until a fresh row would not already read complete — the 250-stack token
    // hand-ins are otherwise one click per item. Cite: Player.cpp:12611 RewardQuest.
    repeatQuest(entry, opts) {
      const q = ds.quest(entry);
      if (!q) return { ok: false, reason: 'Unknown quest' };
      if (!isRepeatableQuest(q)) return { ok: false, reason: 'That quest is not repeatable' };
      const max = Math.max(1, Math.min(opts?.max ?? MAX_QUEST_REPEATS, MAX_QUEST_REPEATS));
      const rewardChoice = opts?.rewardChoice ?? 0;
      const items: LootDrop[] = [];
      const leveledTo: number[] = [];
      let turnedIn = 0;
      let xp = 0;
      let money = 0;
      let stopped: QuestRepeatStop = 'materials';
      while (turnedIn < max) {
        const res = api.turnInQuest(entry, rewardChoice);
        if (!res.ok) {
          if (turnedIn === 0) return { ok: false, reason: res.reason };
          stopped = 'blocked';
          break;
        }
        turnedIn++;
        xp += res.xp;
        money += res.money;
        for (const it of res.items) items.push(it);
        for (const lv of res.leveledTo) leveledTo.push(lv);
        if (turnedIn >= max) { stopped = 'cap'; break; }
        // Probed off the log: accepting to find out then abandoning would fire the accept scripts
        // and leak the SrcItem. Same-zone deliver credit first, as refreshQuests gives it.
        const inv = owned(state);
        const probeLog = recordSameZoneDeliver(
          { quests: [freshQuestState(q)] },
          state.char.zoneId,
          (e) => ds.quest(e),
          inv,
        );
        const probe = probeLog.quests[0]!;
        if (!questComplete(q, probe, inv, { standingFor, money: state.char.gold })) break;
        const again = api.acceptQuest(entry);
        if (!again.ok) {
          stopped = hasQuestSlot(state.questlog) ? 'blocked' : 'log-full';
          break;
        }
        refreshQuests();
        if (getQuest(state.questlog, entry)?.status !== 'complete') { stopped = 'blocked'; break; }
      }
      return { ok: true, turnedIn, xp, money, items, leveledTo, stopped };
    },
  };
  return api;
}
