// Professions, gather, craft, enchant, GO interact and pickpocket facade methods. The gather helpers
// are module-local, and the apply-gather export lets fight-end auto-skin share the same path.

import {
  rollGather, gainSkill, canGather, professionSkillValue, skillGainTenths,
  gatherSkillGainChanceTenths,
  rollCharges, nodeReady, respawnRemainingMs, nodeCooldownMs, isFishingPole, isMiningPick, isSkinningKnife,
  ensureFishingPoleEquipped,
  craft as doCraft, trainProfession as doTrainProfession, unlearnProfession as doUnlearnProfession,
  learnRecipe as doLearnRecipe,
  grantStarterRecipes as doGrantStarterRecipes,
} from '../../domain/professions/professions.ts';
import {
  recipeCooldownRemainingMs, stampRecipeCooldown, craftCooldownLabel,
} from '../../domain/professions/craftCooldown.ts';
import {
  miningHarvestTapCount, miningLockReqSkill, miningVeinOpenRange, mergeLootDrops,
} from '../../domain/professions/miningHarvest.ts';
import {
  isRotationNode, rotationNodeUp, rotationNodeNextUpMs,
} from '../../domain/professions/rareNodes.ts';
import {
  nearestPartyWorker,
  partyWorkRefusalReason,
  pickPartyWorker,
  type PartyWorker,
} from '../../domain/professions/partyWork.ts';
import { companionLevel, companionSkillMap, type Companion } from '../../domain/bots/squad.ts';
import { dumpGatherGoodsFromState } from '../../domain/bots/sendTradeGoods.ts';
import type { CompanionProfessionMap } from '../../domain/bots/companionMissions.ts';
import { getRank, REP_RANK } from '../../domain/creature/reputation.ts';
import { hasAttrEx2, SPELL_ATTR_EX2 } from '../spells/spellAttributes.ts';
import {
  blacksmithGossipHello,
  BS_BOUND_CREATURES,
  leatherGossipHello,
  LW_BOUND_CREATURES,
  N_TRAINER_SMITHOMNI1,
  N_TRAINER_SMITHOMNI2,
  REP_ARMOR,
  REP_WEAPON,
} from '../../domain/scriptdev/npcProfessions.ts';
import {
  applyBlacksmithSpecSelect,
  applyLeatherSpecSelect,
  knownProfessionSpecs,
} from '../../domain/scriptdev/professionSpecConsumer.ts';
import { consumeProfessionSpecKind } from './scriptDevProfessionSpec.ts';
import { buyNames, stageVendorReagents } from './reagentBuyIn.ts';
import { maxCraftsWithVendor } from '../../domain/professions/vendorReagents.ts';
import {
  applyEnchant as doApplyEnchant, learnEnchant as doLearnEnchant,
} from '../../domain/professions/enchanting.ts';
import { partyHeldTools } from '../../domain/professions/heldTools.ts';
import {
  partyDisenchantCheck,
  resolveRosterEnchanters,
  runPartyDisenchant,
  type DisenchantPick,
} from '../../domain/professions/partyDisenchant.ts';
import {
  canPickPocket,
  rollPickPocket,
  canRestockPickpocket,
  startPickpocketRestock,
  pickpocketLootKey,
  PICK_POCKET_SPELL_ID,
  PICKPOCKET_ERR,
} from '../../domain/professions/pickpocket.ts';
import {
  useGameObject,
  useSummoningRitualParty,
  applyLinkedTrap,
  goRuntimeAvailability,
  GAMEOBJECT_TYPE_QUESTGIVER,
  GAMEOBJECT_TYPE_FISHINGHOLE,
  GAMEOBJECT_TYPE_SUMMONING_RITUAL,
  GAMEOBJECT_TYPE_TEXT,
  GAMEOBJECT_TYPE_MEETINGSTONE,
  goLootIsQuestOnly,
  isGoFishingSchool,
  type GoRuntimeState,
  type UseGameObjectReason,
} from '../../domain/world/gameObjects.ts';
import { applyType15MoTransportUse } from './goMoTransportUse.ts';
import { applyType11TransportUse, type Type11DepartHooks } from './goTransportUse.ts';
import {
  applySummoningRitualUse,
  ritualPartyUserIds,
} from './summoningRitualUse.ts';
import {
  meetingStoneGroupTarget,
  meetingStoneUseCtx,
  placeMeetingStoneSummon,
} from './meetingStoneUse.ts';
import { mergeWildSummoned } from './summonObjectWild.ts';
import {
  matchingKeyItemEntry,
  canOpenLock,
  requiredKeyItemEntry,
  hardestSkillLockCase,
  isExpendableLockKeyItem,
  isFreeOpenLockType,
  skillByLockType,
  LOCK_KEY_SKILL,
  SKILL_LOCKPICKING as LOCK_SKILL_LOCKPICKING,
  type LockDef,
} from '../../domain/world/openLock.ts';
import {
  canOpenContainer,
  companionLockpickingSkill,
  containerPicklockReq,
  groupLockpickingSkill,
  lockpickCompanionPool,
  lockpickWorkers,
  playerLockpickingForLocks,
} from '../../domain/items/itemContainer.ts';
import { tryLockpickingSkillUp } from '../../domain/world/openLock.ts';
import { SKILL_LINE_BY_ID } from '../../data/schema/profession.ts';
import { consumeItemCharges, isExpendableCastItem } from '../../domain/items/inventory.ts';
import { activeStealthAura } from '../../domain/character/character.ts';

import {
  addItem, addInstance, removeItem, canFit, countItem,
} from '../../domain/items/inventory.ts';
import { ownedInventory } from '../../domain/items/keyring.ts';
import { equippedEntry, hasIdentity, identityCapable, type EquippedValue } from '../../domain/items/itemInstance.ts';
import { createItemInstance } from '../../domain/items/createItem.ts';
import { applyBindToInstance, resolveBonding } from '../../domain/items/itemBonding.ts';
import { itemTeachIntent, unavailableTeachReason } from '../../domain/items/itemTeaches.ts';
import { rollLoot, isExclusiveQuestLootRow, type LootDrop } from '../../domain/items/loot.ts';
import {
  gatherLootKind, goLootKind, type PendingLoot,
} from '../../domain/items/pendingLoot.ts';
import {
  getQuest,
  recordGoEnderInteract, recordEventHappens, recordKill,
  questNeededItems, hasQuestForItem, goQuestGiverOffer, type QuestPlayerSnapshot,
} from '../../domain/quests/questlog.ts';
import { applyGoUseAndEventDoors } from './applyDoorFromDbScript.ts';
import { applyFailedQuests } from './applyTerminateFromDbScript.ts';
import { applyTailFromDbScript } from './applyTailFromDbScript.ts';
import { deliverScriptMail } from './mail.ts';
import { ensureWorldStates } from './worldState.ts';
import {
  applyEpTowerCaptureFromGoUse,
  TEAM_ALLIANCE,
  TEAM_HORDE,
} from './outdoorPvp.ts';
import { factionOf } from '../../domain/character/races.ts';
import { canInteractWithCreature } from '../../domain/creature/faction.ts';
import { activeEventIds } from '../../domain/world/gameEvents.ts';
import type { GatherNodeDef, RecipeDef } from '../../data/schema.ts';
import { mulberry32, hashSeed } from '../core/rng.ts';
import { spellMissChancePercent } from '../combat/mitigation.ts';
import type { Rng } from '../core/rng.ts';
import type { ConditionTable } from '../spells/conditions.ts';
import { isConditionSatisfied } from '../spells/conditions.ts';
import type { ActionResult, Game } from './types.ts';
import type { GameCtx } from './context.ts';
import { announceCompanionRanks } from './companionTraining.ts';
import { scriptDevByGo } from '../../domain/scriptdev/index.ts';
import { runScriptDevGoUse } from './scriptDevGoUse.ts';
import { applyInteractObjectQuestCredit } from './goInteractQuestCredit.ts';
import {
  creditSquadEvent,
  creditSquadGoEnder,
  creditSquadKill,
  creditSquadLogs,
} from './squadQuestShare.ts';
import { applyGoSpellcasterCast } from './applyGoSpellcasterCast.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import { refuseIfDead } from '../../domain/run/death.ts';

const nodeKey = (zoneId: string, nodeId: number): string => `${zoneId}:${nodeId}`;

/** Start-of-harvest charge count: re-roll when pristine or respawned (charges already 0). */
function startGatherCharges(ctx: GameCtx, node: GatherNodeDef, nodeId: number, rng: Rng): number {
  const prior = ctx.state.nodeState[nodeKey(ctx.state.char.zoneId, nodeId)];
  if (!prior || prior.charges <= 0) return rollCharges(node, rng);
  return prior.charges;
}

// Spend one harvest charge on a gather node and mirror it into the GO runtime under the same key:
// the node state is authoritative, and the runtime tracks the same restock window.
function commitGatherNodeCharge(
  ctx: GameCtx,
  node: GatherNodeDef,
  nodeId: number,
  nowMs: number,
  startCharges: number,
  spent = 1,
): { remaining: number; depleted: boolean; respawnMs: number } {
  const { state } = ctx;
  const key = nodeKey(state.char.zoneId, nodeId);
  const remaining = Math.max(0, startCharges - spent);
  const depleted = remaining <= 0;
  const respawnMs = depleted
    ? (isRotationNode(nodeId)
      ? Math.max(0, rotationNodeNextUpMs(state.char.zoneId, nodeId, nowMs) - nowMs)
      : nodeCooldownMs(node))
    : 0;
  const readyAt = depleted ? nowMs + respawnMs : 0;
  state.nodeState[key] = { charges: remaining, readyAt };
  // Mirror into goRuntime so useGameObject restock / world panel refuse the same window.
  const entry = node.sourceId ?? nodeId;
  const rtKey = nodeKey(state.char.zoneId, entry);
  const prevRt = state.goRuntime?.[rtKey] ?? {};
  state.goRuntime = {
    ...(state.goRuntime ?? {}),
    [rtKey]: {
      ...prevRt,
      // charges left → ready now; depleted → restock at readyAt (not permanent MAX_SAFE)
      readyAtMs: depleted ? readyAt : nowMs,
    },
  };
  return { remaining, depleted, respawnMs };
}

// Item entries the player has "on hand" (bags + equipped) - used for tool checks.
function hasFishingPole(ctx: GameCtx): boolean {
  const { ds, state } = ctx;
  return state.inventory.stacks.some((s) => isFishingPole(ds.item(s.item)))
    || Object.values(state.char.equipped).some((v) => {
      const e = equippedEntry(v);
      return e != null && isFishingPole(ds.item(e));
    });
}

/** Wear a bagged pole before a school throw. Spell.cpp EquippedItem subclass 20. */
function wearFishingPole(ctx: GameCtx): boolean {
  const worn = ensureFishingPoleEquipped(ctx.state.char, ctx.state.inventory, ctx.ds);
  if (!worn.ok) return false;
  ctx.state.char = worn.char;
  ctx.state.inventory = worn.inventory;
  return true;
}

// A herb or vein on the floor is a GROUP job: the player's skills and every squad member's
// professions are real trade skills. The point goes to whoever swung at it.

/** Narrow an Object.entries key back to a SkillLine — the map is keyed by one by construction. */
function isSkillLine(line: string): line is GatherNodeDef['skill'] {
  return Object.values(SKILL_LINE_BY_ID).includes(line as GatherNodeDef['skill']);
}

/** The tool this gathering line cannot work without, or null when it needs none. */
function gatherToolPredicate(
  line: GatherNodeDef['skill'],
): ((def: ReturnType<GameCtx['ds']['item']>) => boolean) | null {
  if (line === 'mining') return isMiningPick;
  if (line === 'skinning') return isSkinningKnife;
  if (line === 'fishing') return isFishingPole;
  return null;
}

/** Tool in these bags or on this paperdoll — same "bags or equipped" rule as the player. */
function holdsGatherTool(
  ctx: GameCtx,
  line: GatherNodeDef['skill'],
  bags: { stacks: readonly { item: number }[] } | undefined,
  equipped: Record<string, EquippedValue | undefined> | undefined,
): boolean {
  const pred = gatherToolPredicate(line);
  if (!pred) return true;
  if (bags?.stacks?.some((s) => pred(ctx.ds.item(s.item)))) return true;
  for (const v of Object.values(equipped ?? {})) {
    const e = equippedEntry(v);
    if (e != null && pred(ctx.ds.item(e))) return true;
  }
  return false;
}

// Everyone who could work the node, and everyone who merely HAS the line, for an honest refusal.
// Candidates run player-first then squad order, and every tie breaks on that, so it is stable.
function gatherWorkers(
  ctx: GameCtx,
  node: GatherNodeDef,
): { candidates: PartyWorker[]; holders: PartyWorker[] } {
  const { ds, state } = ctx;
  const line = node.skill;
  const candidates: PartyWorker[] = [];
  const holders: PartyWorker[] = [];

  const consider = (w: PartyWorker, hasTool: boolean): void => {
    holders.push(w);
    if (w.skill >= node.orange && hasTool) candidates.push(w);
  };

  const own = state.char.skills[line];
  if (own) {
    const value = professionSkillValue(state.char, line, ds, state.spellbook) ?? own.current;
    consider(
      {
        name: state.char.name,
        skill: value,
        max: own.max,
        gainTenths: skillGainTenths(line, own, node),
      },
      holdsGatherTool(ctx, line, state.inventory, state.char.equipped),
    );
  }

  for (const comp of state.squad ?? []) {
    // Away on a send-out mission — the same skip partyHasSkinner and the auto-skin fallback make.
    if (comp.mission) continue;
    const lvl = companionLevel(comp, state.char.level);
    const cur = companionSkillMap(comp, lvl)[line];
    if (!cur) continue;
    consider(
      {
        compId: comp.id,
        name: comp.name,
        skill: cur.current,
        max: cur.max,
        gainTenths: skillGainTenths(line, cur, node),
      },
      holdsGatherTool(ctx, line, comp.bags, comp.equipped),
    );
  }
  return { candidates, holders };
}

/** Honest refusal when nobody in the group can work the node (skill or missing tool). */
function gatherGroupRefusal(ctx: GameCtx, node: GatherNodeDef): string {
  const { candidates, holders } = gatherWorkers(ctx, node);
  if (candidates.length) return '';
  const skillName = ctx.ds.profession(node.skill)?.name ?? node.skill;
  // Someone qualifies on skill but nobody holds the tool — say the tool, not the skill.
  const skilled = holders.filter((h) => h.skill >= node.orange);
  const pred = gatherToolPredicate(node.skill);
  if (skilled.length && pred) {
    const toolName = node.skill === 'mining'
      ? 'a Mining Pick'
      : node.skill === 'skinning' ? 'a Skinning Knife' : 'a Fishing Pole';
    return `Requires ${toolName} - nobody in the group carries one`;
  }
  return partyWorkRefusalReason(skillName, nearestPartyWorker(holders, node.orange));
}

function miningTapsFor(
  ctx: GameCtx,
  node: GatherNodeDef,
  miningSkill: number,
  rng: Rng,
): number {
  const entry = node.sourceId ?? node.id;
  const go = ctx.ds.gameObject(entry);
  const lock = go?.lockId != null ? ctx.ds.lock(go.lockId) : undefined;
  const { min, max } = miningVeinOpenRange(node, go?.chest);
  return miningHarvestTapCount(min, max, miningSkill, miningLockReqSkill(lock), rng);
}

function grantWorkerGatherSkillTaps(
  ctx: GameCtx,
  worker: PartyWorker,
  node: GatherNodeDef,
  rng: Rng,
  taps: number,
): number | undefined {
  let skillUp: number | undefined;
  let w = worker;
  for (let i = 0; i < taps; i++) {
    const up = grantWorkerGatherSkill(ctx, w, node, rng);
    if (up == null) continue;
    skillUp = up;
    w = {
      ...w,
      skill: up,
      gainTenths: skillGainTenths(node.skill, { current: up, max: w.max }, node),
    };
  }
  return skillUp;
}

// Grant the node's skill point to the worker. A companion rolls the SAME chance and freezes its
// seed-derived professions first, or learning one point would wipe the two it arrived with.
function grantWorkerGatherSkill(
  ctx: GameCtx,
  worker: PartyWorker,
  node: GatherNodeDef,
  rng: Rng,
): number | undefined {
  const { state } = ctx;
  if (worker.compId == null) {
    const gain = gainSkill(state.char, node.skill, node, rng);
    state.char = gain.char;
    return gain.up;
  }
  const comp = (state.squad ?? []).find((m) => m.id === worker.compId);
  if (!comp) return undefined;
  const tenths = skillGainTenths(node.skill, { current: worker.skill, max: worker.max }, node);
  if (tenths <= 0 || !rng.chance(tenths / 1000)) return undefined;
  const lvl = companionLevel(comp, state.char.level);
  if (comp.professions == null || Object.keys(comp.professions).length === 0) {
    const frozen: CompanionProfessionMap = {};
    for (const [line, cur] of Object.entries(companionSkillMap(comp, lvl))) {
      if (isSkillLine(line) && cur) frozen[line] = cur.current;
    }
    comp.professions = frozen;
  }
  // worker.max is the trainer rank they hold, not the raw level cap — an untrained rung stops here.
  const next = Math.min(worker.max, worker.skill + 1);
  if (next <= worker.skill) return undefined;
  comp.professions = { ...comp.professions, [node.skill]: next };
  announceCompanionRanks(comp, lvl, ctx.ds, ctx.log);
  return next;
}

// True when Lock.dbc has a free-open case, which succeeds with no profession skill line at all.
// Cite: Spell.cpp CanOpenLock (the cases are OR'd); domain/world/openLock.ts.
function lockHasFreeOpenCase(lock: LockDef | undefined): boolean {
  if (!lock?.cases?.length) return false;
  for (const c of lock.cases) {
    if (c.type === LOCK_KEY_SKILL && isFreeOpenLockType(c.index)) return true;
  }
  return false;
}

function gameObjectLockDef(ctx: GameCtx, objectEntry: number): LockDef | undefined {
  const go = ctx.ds.gameObject(objectEntry);
  if (go?.lockId == null) return undefined;
  return ctx.ds.lock(go.lockId) as LockDef | undefined;
}

/** GO-sourced gather node whose lock free-opens (quest plant, not herb/mine skill). */
function isFreeOpenGatherNode(ctx: GameCtx, node: GatherNodeDef): boolean {
  if (node.source === 'fishing' || node.source === 'skinning') return false;
  const entry = node.sourceId ?? node.id;
  return lockHasFreeOpenCase(gameObjectLockDef(ctx, entry));
}

// The gather node for a world gameobject, so interactObject shares the gates and skill-ups. A
// free-open lock is NOT a profession node even when the bake mislists it as herbalism.
function gatherNodeForGameObject(ctx: GameCtx, objectEntry: number): GatherNodeDef | undefined {
  const node = ctx.ds.gatherNode(objectEntry);
  if (!node) return undefined;
  // Skinning is corpse-only; fishing nodes are area schools, not GO chests.
  if (node.skill === 'skinning' || node.skill === 'fishing') return undefined;
  if (node.source != null && node.source !== 'gameobject') return undefined;
  if (node.sourceId != null && node.sourceId !== objectEntry) return undefined;
  if (lockHasFreeOpenCase(gameObjectLockDef(ctx, objectEntry))) return undefined;
  return node;
}

// Profession skill and tool gates for a herb or mine GO, the same ones gather() applies. Returns a
// refuse reason, or null when the player may open the node.
function gatherProfessionGateReason(
  ctx: GameCtx,
  node: GatherNodeDef,
): string | null {
  // KI-810: free-open LockType — no profession / pick / pole gate.
  if (isFreeOpenGatherNode(ctx, node)) return null;
  // Group gate: the player OR any party/raid companion with the line and the tool.
  return gatherGroupRefusal(ctx, node) || null;
}

/** GO runtime key - zone-scoped so restock does not leak across travel. */
const goRuntimeKey = (ctx: GameCtx, entry: number): string => `${ctx.state.char.zoneId}:${entry}`;

const goRefuseReason = (
  reason: UseGameObjectReason | undefined,
  opts?: {
    restockAtMs?: number;
    nowMs?: number;
    /** Named key for LOCK_KEY_ITEM refuse (ds.item name). */
    keyName?: string;
    /** Skill gate detail for low_skill (e.g. "Lockpicking 25"). */
    skillNeed?: string;
  },
): string => {
  switch (reason) {
    case 'locked':
      return opts?.keyName
        ? `Locked - you need ${opts.keyName}`
        : 'Locked - you need the matching key';
    case 'low_skill':
      return opts?.skillNeed
        ? `Your skill is too low - needs ${opts.skillNeed}`
        : 'Your skill is too low to open this';
    case 'quest_incomplete': return 'You do not have the required quest';
    case 'event_inactive': return 'That is not available right now';
    case 'not_ready': {
      // An honest wait or route when every multi-spawn instance is consumed; a permanent despawn uses
      // a maximum ready time. Cite: GameObject.h IsDespawnAtAction.
      const ready = opts?.restockAtMs;
      const now = opts?.nowMs ?? 0;
      if (ready != null && ready >= Number.MAX_SAFE_INTEGER / 2) {
        return 'All instances consumed - none remain in this zone';
      }
      if (ready != null && ready > now) {
        const secs = Math.max(1, Math.ceil((ready - now) / 1000));
        return `Not ready yet - wait ~${secs}s for another to appear`;
      }
      return 'Not ready yet';
    }
    case 'cooldown': return 'On cooldown';
    case 'no_charges': return 'No charges remaining';
    case 'party_only': return "Only the caster's party may use that";
    case 'fishing_failed': return 'Nothing bites…';
    case 'unsupported': return 'You cannot use that object';
    case 'no_interact': return 'You cannot interact with that';
    case 'missing_context': return 'Missing context to use this object';
    case 'not_in_group': return 'You must be in the group';
    case 'is_owner': return 'You are already channeling';
    case 'owner_not_channeling': return 'The ritual has not started';
    case 'no_target': return 'You must target a group member';
    case 'level_out_of_range': return 'Your group is the wrong level for this stone';
    default: return 'Cannot use object';
  }
};

/** Lock.dbc skill case → GetSkillValue (pure + MOD_SKILL). Cite: openLock.ts; KI-935. */
function skillValueForLockType(ctx: GameCtx, lockType: number): number | undefined {
  const { state, ds } = ctx;
  const skillId = skillByLockType(lockType);
  // The GROUP's best value for the line. A herb or vein GO is gated twice on the interact path, here
  // and again in the profession gate, and both have to see the party or the herbalist opens nothing.
  if (skillId === LOCK_SKILL_LOCKPICKING) {
    const mine = playerLockpickingForLocks(state.char);
    return groupLockpickingSkill(
      mine, state.char.level, state.squad, ds.combatSkillMeta?.() ?? null,
    );
  }
  const line = SKILL_LINE_BY_ID[skillId];
  if (!line) return undefined;
  let best = professionSkillValue(state.char, line, ds, state.spellbook);
  for (const comp of state.squad ?? []) {
    const cur = companionSkillMap(comp, companionLevel(comp, state.char.level))[line];
    if (cur == null) continue;
    if (best == null || cur.current > best) best = cur.current;
  }
  return best;
}

// Whether a node is harvestable right now — skill, tool and depletion — plus how long a depleted one
// has left and how many charges remain. Shared by the UI status and the authoritative gather check.
function computeGatherStatus(
  ctx: GameCtx,
  nodeId: number,
  nowMs: number,
): { ok: boolean; reason?: string; respawnMs: number; chargesLeft: number } {
  const { ds, state } = ctx;
  const node = ds.gatherNode(nodeId);
  if (!node) return { ok: false, reason: 'Nothing to gather', respawnMs: 0, chargesLeft: 0 };
  // Skinning is only reachable via a fresh corpse (use skin()); other nodes must
  // belong to the current zone.
  if (node.skill === 'skinning') return { ok: false, reason: 'Skin a corpse instead', respawnMs: 0, chargesLeft: 0 };
  if (!ds.zone(state.char.zoneId)?.nodes?.includes(nodeId)) return { ok: false, reason: "That's not here", respawnMs: 0, chargesLeft: 0 };
  const key = nodeKey(state.char.zoneId, nodeId);
  const st = state.nodeState[key];
  // KI-810: free-open Lock.dbc cases skip profession skill + tools (quest plants).
  const freeOpen = isFreeOpenGatherNode(ctx, node);
  if (!freeOpen) {
    // Skill AND tool over the whole group: a party herbalist works the node the player cannot, and the
    // refusal names who came closest. Fishing stays solo — the player holds the pole.
    const refusal = node.skill === 'fishing'
      ? (canGather(state.char, node, professionSkillValue(state.char, node.skill, ds, state.spellbook)).ok
        ? (hasFishingPole(ctx) ? '' : 'Requires a Fishing Pole')
        : `Requires ${node.skill} skill ${node.orange}`)
      : gatherGroupRefusal(ctx, node);
    if (refusal) return { ok: false, reason: refusal, respawnMs: 0, chargesLeft: st?.charges ?? 0 };
  }
  if (!rotationNodeUp(state.char.zoneId, nodeId, nowMs)) {
    const nextUp = rotationNodeNextUpMs(state.char.zoneId, nodeId, nowMs);
    return { ok: false, reason: 'Not in bloom', respawnMs: Math.max(0, nextUp - nowMs), chargesLeft: 0 };
  }
  if (!nodeReady(st, nowMs)) return { ok: false, reason: 'Depleted', respawnMs: respawnRemainingMs(st, nowMs), chargesLeft: 0 };
  // KI-807: interactObject may have consumed the GO via goRuntime — same zone:entry key.
  if (node.skill === 'herbalism' || node.skill === 'mining' || node.source === 'gameobject') {
    const avail = goRuntimeAvailability(state.goRuntime?.[key], nowMs);
    if (avail.kind === 'consumed') {
      return { ok: false, reason: 'Depleted', respawnMs: 0, chargesLeft: 0 };
    }
    if (avail.kind === 'restock') {
      return {
        ok: false,
        reason: 'Depleted',
        respawnMs: Math.max(0, avail.readyAtMs - nowMs),
        chargesLeft: 0,
      };
    }
  }
  return { ok: true, respawnMs: 0, chargesLeft: st && st.charges > 0 ? st.charges : 0 };
}

// Where a held haul goes: the facade's `openLoot` bound to this source. Returning the container lets the
// caller hand it back to the UI in one result.
export type LootHoldSink = (drops: readonly LootDrop[]) => PendingLoot;

/** Condition/quest gate a node's loot roll consults (same shape interactObject builds). */
export type GatherLootGate = {
  lootConditionSnapshot: ProfessionsExtras['lootConditionSnapshot'];
  conditionTableById: ProfessionsExtras['conditionTableById'];
};

// The authoritative loot table key for a gather node, by DB provenance: the gameobject's own loot id,
// the fishing area, or the skinning id. Covers all 758 baked nodes; null for a pre-DB fixture.
function gatherLootKey(ctx: GameCtx, node: GatherNodeDef): string | null {
  if (node.sourceId == null) return null;
  if (node.source === 'fishing') return `fishing:${node.sourceId}`;
  if (node.source === 'skinning') return `skinning:${node.sourceId}`;
  if (node.source === 'gameobject') {
    const lootId = ctx.ds.gameObject(node.sourceId)?.lootId ?? 0;
    return lootId > 0 ? `go:${lootId}` : null;
  }
  return null;
}

// One harvest is ONE roll of the node's real loot template, with group semantics: the flattened yield
// view handed the player every passing row at once, so a cast landed 1.40 items from a one-item table.
function rollNodeLoot(
  ctx: GameCtx,
  node: GatherNodeDef,
  rng: Rng,
  gate?: GatherLootGate,
): LootDrop[] {
  const key = gatherLootKey(ctx, node);
  const table = key != null ? ctx.ds.lootTable(key) : [];
  if (!table.length) return rollGather(node, rng); // fixture / no baked template
  const needed = questNeededItems(ctx.state.questlog, (e) => ctx.ds.quest(e));
  return rollLoot(table, rng, {
    allowsQuestDrop: (entry: { item: number }) => needed.has(entry.item),
    allowsCondition: gate
      ? (conditionId: number) => isConditionSatisfied(
        conditionId,
        gate.lootConditionSnapshot(),
        gate.conditionTableById(),
      ).ok
      : undefined,
  });
}

// Harvest a node: roll yields into bags, then skill-up. Mining `taps` = every vein refill in one go.
// Cite: LootMgr.cpp:1265-1304. Seeded sub-stream, a fresh one per skin.
function applyGatherImpl(
  ctx: GameCtx,
  node: GatherNodeDef,
  rng: Rng = mulberry32(hashSeed(ctx.state.rngSeed, ctx.state.fightCounter++)),
  gate?: GatherLootGate,
  hold?: LootHoldSink,
  taps = 1,
): ActionResult<{ yielded: LootDrop[]; skillUp?: number; workedBy?: string; held?: PendingLoot }> {
  const { ds, state, log, takeDrop, refreshQuests, cap } = ctx;
  // KI-810: free-open quest plants skip profession skill; SkillByLockType → SKILL_NONE so no skill-up.
  const freeOpen = isFreeOpenGatherNode(ctx, node);
  // Who swings at it. Skill AND tool over the whole group — 1.12 skinning needs the knife in bags or
  // equipped — so a party skinner's knife counts as the group's. Cite: SharedDefines.h skinning knife.
  let worker: PartyWorker | undefined;
  if (!freeOpen) {
    const { candidates } = gatherWorkers(ctx, node);
    worker = pickPartyWorker(candidates);
    if (!worker) return { ok: false, reason: gatherGroupRefusal(ctx, node) };
  }
  const n = Math.max(1, taps | 0);
  const rolled = mergeLootDrops(
    Array.from({ length: n }, () => rollNodeLoot(ctx, node, rng, gate)).flat(),
  );
  // HOLD: the node keeps its harvest until the player takes it (WoW's loot window). Otherwise the
  // old direct-to-bags path, which autopilot / bots / dungeon runs still use.
  const yielded: LootDrop[] = [];
  let held: PendingLoot | undefined;
  if (hold) {
    held = hold(rolled);
    yielded.push(...rolled);
  } else {
    // Bag-full must refuse before the skill-up and the node charge, as craft and disenchant do: never
    // deplete a node or farm free skill while the mats vanish.
    if (rolled.length > 0) {
      let probe = state.inventory;
      for (const l of rolled) {
        const maxStack = ds.item(l.item)?.stackable ?? 1;
        if (!canFit(probe, l.item, l.count, maxStack, cap())) {
          return { ok: false, reason: 'Not enough bag space' };
        }
        probe = addItem(probe, l.item, l.count, maxStack);
      }
    }
    for (const l of rolled) {
      const took = takeDrop(l.item, l.count);
      if (took > 0) yielded.push({ item: l.item, count: took });
    }
    if (yielded.length
      && (node.skill === 'mining' || node.skill === 'herbalism' || node.skill === 'skinning')) {
      dumpGatherGoodsFromState(state, ds, log);
    }
  }
  let skillUp: number | undefined;
  if (!freeOpen && worker) skillUp = grantWorkerGatherSkillTaps(ctx, worker, node, rng, n);
  if (!hold) refreshQuests(); // gathered reagents can satisfy a gather objective (held loot on take)
  const names = yielded.map((l) => `${l.count}x ${ds.item(l.item)?.name ?? l.item}`).join(', ');
  // Name the hand that worked it when it was not the player's — the skill point went there.
  const by = worker?.compId != null ? ` (${worker.name})` : '';
  log(`${node.name}${by}: ${names || 'nothing of use'}.${skillUp != null ? ` (${node.skill} → ${skillUp})` : ''}`);
  return { ok: true, yielded, skillUp, ...(worker?.compId != null ? { workedBy: worker.name } : {}), ...(held ? { held } : {}) };
}

/** Export applyGather for game.ts fight-end auto-skin (professions must not import game.ts). */
export function createGatherHelpers(ctx: GameCtx, gate?: GatherLootGate): {
  applyGather: (
    node: GatherNodeDef,
    rng?: Rng,
  ) => ActionResult<{ yielded: LootDrop[]; skillUp?: number }>;
} {
  return {
    applyGather: (node, rng) =>
      rng !== undefined
        ? applyGatherImpl(ctx, node, rng, gate)
        : applyGatherImpl(ctx, node, undefined, gate),
  };
}

// Locals from createGame that interactObject needs but that are not on GameCtx (shared quest/loot condition
// helpers still owned by the facade).
export type ProfessionsExtras = {
  standingFor: (factionId: number) => number;
  trainerDiscountMod: (vendorEntry?: number) => number;
  // Put a haul in the loot container (facade's loot module). Only used on the `{ hold: true }` path, so
  // autopilot / bots / dungeon runs keep dropping straight into the bags.
  openLoot: Game['openLoot'];
  lootConditionSnapshot: () => {
    quests: Record<string, 'none' | 'taken' | 'complete' | 'rewarded'>;
    level: number;
    /** SharedDefines.h Team: ALLIANCE=469, HORDE=67 — required for CONDITION_TEAM (type 6). */
    team: number;
    /** HonorRankInfo.rank 0..18. Cite: Conditions.cpp:236-243 CONDITION_PVP_RANK. */
    pvpRank: number;
    /** CONDITION_AD_COMMISSION_AURA (10). Cite: Conditions.cpp:228-234. */
    auras?: number[];
    /** CONDITION_WORLD_SCRIPT (40) — sWorldState.IsConditionFulfilled. */
    worldScript: (conditionId: number, state: number) => boolean;
  };
  conditionTableById: () => ConditionTable;
  /** Late-bound: travelCore pace + journeyTick after a tram (11) or boat/zep (15) depart. */
  transportDepart: Type11DepartHooks;
};

export function createProfessionsModule(
  ctx: GameCtx,
  extras: ProfessionsExtras,
): Pick<
  Game,
  | 'learnProfession'
  | 'unlearnProfession'
  | 'professionSpecGossip'
  | 'selectProfessionSpec'
  | 'ensureProfessionStarters'
  | 'learnRecipe'
  | 'learnRecipeFromItem'
  | 'learnProfessionRankFromItem'
  | 'gatherStatus'
  | 'gather'
  | 'skin'
  | 'pickPocket'
  | 'interactObject'
  | 'openContainerItem'
  | 'craft'
  | 'craftAll'
  | 'learnEnchant'
  | 'learnEnchantFromItem'
  | 'enchantItem'
  | 'disenchant'
  | 'disenchantStack'
  | 'disenchantCompanionBagStack'
> {
  const { ds, state, log, cap, refreshQuests } = ctx;
  // The spell focus objects the crafter can reach, from the zone's baked list, so a refusal means "go
  // to a town" rather than "dead recipe". Null for an unknown zone turns the gate off.
  const reachableCraftFocus = (): ReadonlySet<number> | null => {
    const zone = ds.zone(state.char.zoneId);
    if (!zone) return null;
    return new Set(zone.craftingFocus ?? []);
  };
  // "Not ready yet" carries no number, and a 48 h transmute wait is the one refusal the player has
  // to be told the length of. Null when the recipe is off cooldown.
  const craftRefusal = (recipe: RecipeDef, now: number, reason?: string): string => {
    if (reason !== 'Not ready yet') return reason ?? 'Cannot craft';
    return `Ready in ${craftCooldownLabel(recipeCooldownRemainingMs(recipe, state, now))}`;
  };
  /** Any body the player owns — squad seat, benched roster, or a raid seat. */
  const findRosterCompanion = (id: string): Companion | undefined =>
    (state.squad ?? []).find((c) => c.id === id)
    ?? state.botRoster?.[id]
    ?? state.raidRoster?.members?.[id];

  // The party's held tools (hammer, spanner, rod). Never consumed, so one copy anywhere in the
  // party's bags satisfies the gate for the player and every companion.
  const partyTools = (): ReadonlySet<number> => partyHeldTools(state.inventory, [
    ...(state.squad ?? []),
    ...Object.values(state.botRoster ?? {}),
  ], ds);

  const { standingFor, lootConditionSnapshot, conditionTableById, openLoot, transportDepart } = extras;
  // Condition gate for node loot rolls (gather / skin) — same snapshot interactObject uses.
  const lootGate: GatherLootGate = { lootConditionSnapshot, conditionTableById };

  const isBsTrainer = (entry: number) =>
    (BS_BOUND_CREATURES as readonly number[]).includes(entry);
  const isLwTrainer = (entry: number) =>
    (LW_BOUND_CREATURES as readonly number[]).includes(entry);

  const repRank = (factionId: number): number => {
    const fac = ds.faction(factionId);
    if (!fac) return REP_RANK.HATED;
    return getRank(state.char.reputations, fac, state.char.race, state.char.cls);
  };

  const rewardedQuestIds = (): number[] =>
    state.questlog.quests.filter((q) => q.status === 'turnedIn').map((q) => q.entry);

  // The one disenchant body. `slot` names a specific bag stack (bulk confirm list); omitted, the first
  // stack of `itemEntry` is taken (single click, cast-on-item). `holder` = a companion carrying the
  // gear: it breaks down in their bags and the mats land in yours, since mats are never soulbound.
  const disenchantOne = (
    itemEntry: number,
    slot: number | undefined,
    opts?: { workerId?: string },
    holder?: Companion,
  ): ActionResult<{ yielded: LootDrop[]; skillUp?: number; worker?: string }> => {
    const source = holder ? (holder.bags ?? { stacks: [] }) : state.inventory;
    const enchanters = resolveRosterEnchanters(
      state.char, state.squad, state.botRoster, state.raidRoster?.members, ds,
    );
    let who: DisenchantPick | undefined;
    if (opts?.workerId) {
      const only = enchanters.find((e) => e.kind === 'companion' && e.comp.id === opts.workerId);
      if (!only) return { ok: false, reason: 'That companion is not available' };
      const chk = partyDisenchantCheck(itemEntry, source, ds, [only]);
      if (!chk.ok) return { ok: false, reason: chk.reason };
      who = chk.who;
    } else {
      const chk = partyDisenchantCheck(itemEntry, source, ds, enchanters);
      if (!chk.ok) return { ok: false, reason: chk.reason };
      who = chk.who;
    }
    const comp = who.kind === 'companion' ? findRosterCompanion(who.id!) : undefined;
    const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
    const res = runPartyDisenchant({
      who, comp, player: state.char, inventory: state.inventory, ds, entry: itemEntry, rng,
      cap: cap(), ...(slot != null ? { slot } : {}), ...(holder ? { holderBags: source } : {}),
    });
    if (!res.ok) return { ok: false, reason: res.reason };
    state.char = res.char;
    state.inventory = res.inventory;
    if (holder && res.holderBags) holder.bags = res.holderBags;
    if (comp && res.companionProfessions) comp.professions = res.companionProfessions;
    refreshQuests(); // destroying gear can revert a quest that wanted it turned in
    const name = ds.item(itemEntry)?.name ?? itemEntry;
    const mats = res.yielded.map((y) => `${y.count}x ${ds.item(y.item)?.name ?? y.item}`).join(', ') || 'nothing';
    const by = who.kind === 'companion' ? ` (${who.name})` : '';
    log(`Disenchanted ${name}${by}: ${mats}.${res.skillUp ? ` (enchanting → ${res.skillUp})` : ''}`);
    return {
      ok: true,
      yielded: res.yielded,
      skillUp: res.skillUp,
      ...(who.kind === 'companion' ? { worker: who.name } : {}),
    };
  };

  return {
    learnProfession(profTrainerEntry) {
      const trainer = ds.profTrainer(profTrainerEntry);
      if (!trainer) return { ok: false, reason: 'No trainer here' };
      if (!canInteractWithCreature(ds, state.char.race, profTrainerEntry)) {
        return { ok: false, reason: 'They refuse to deal with you.' };
      }
      const prof = ds.profession(trainer.skill);
      if (!prof) return { ok: false, reason: 'Unknown profession' };
      const firstRank = !state.char.skills[prof.id];
      const discountMod = extras.trainerDiscountMod(profTrainerEntry);
      const res = doTrainProfession(state.char, prof, { discountMod });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot train' };
      state.char = res.char;
      log(`Trained ${prof.name} (skill ${state.char.skills[prof.id]?.current}/${state.char.skills[prof.id]?.max}).`);
      // Apprentice starters (LearnOnGetSkill): free orange≤1 trainer recipes for the line.
      // Cite: SkillLineAbility learnOnGetSkill; extract-professions tags these source:'trainer'.
      if (firstRank) {
        const starters = doGrantStarterRecipes(state.char, prof.id, ds.recipes());
        if (starters.granted.length) {
          state.char = starters.char;
          log(`Learned: ${starters.granted.map((r) => r.name).join(', ')}.`);
        }
      }
      // Fishing needs a pole to work a school; hand a basic one to a fresh angler who has
      // none so training isn't a dead end (it's cheap and every fishing vendor sells it).
      if (prof.id === 'fishing' && !hasFishingPole(ctx)) {
        const POLE = 6256; // "Fishing Pole" - the plain starter rod
        const pdef = ds.item(POLE);
        if (pdef && canFit(state.inventory, POLE, 1, pdef.stackable ?? 1, cap())) {
          state.inventory = addItem(state.inventory, POLE, 1, pdef.stackable ?? 1);
          log('Received a Fishing Pole.');
        }
      }
      return { ok: true };
    },

    unlearnProfession(skill) {
      const prof = ds.profession(skill);
      if (!prof) return { ok: false, reason: 'Unknown profession' };
      const res = doUnlearnProfession(state.char, prof, ds.recipes());
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot unlearn' };
      state.char = res.char;
      log(`Unlearned ${prof.name}.`);
      return { ok: true };
    },

    // Specialization gossip hello for ScriptDev-bound BS/LW trainers. Cite: npc_professions.cpp
    // GossipHello_npc_prof_blacksmith / _leather.
    professionSpecGossip(trainerEntry) {
      if (isBsTrainer(trainerEntry)) {
        const skill = state.char.skills.blacksmithing?.current ?? 0;
        const hello = blacksmithGossipHello({
          creatureEntry: trainerEntry,
          skillBlacksmithing: skill,
          level: state.char.level,
          knownSpells: state.spellbook.known,
          // Omni trainers gate learn on Friendly craft-faction rep.
          // Cite: npc_professions.cpp:293-296 GetReputationRank == REP_FRIENDLY.
          repArmorRank:
            trainerEntry === N_TRAINER_SMITHOMNI1 || trainerEntry === N_TRAINER_SMITHOMNI2
              ? repRank(REP_ARMOR)
              : 0,
          repWeaponRank:
            trainerEntry === N_TRAINER_SMITHOMNI1 || trainerEntry === N_TRAINER_SMITHOMNI2
              ? repRank(REP_WEAPON)
              : 0,
          isTrainer: true,
          isVendor: !!ds.vendor(trainerEntry),
        });
        return {
          script: 'npc_prof_blacksmith' as const,
          items: hello.items.map((i) => ({
            kind: i.kind,
            action: i.action,
            cite: i.cite,
          })),
          cite: hello.cite,
        };
      }
      if (isLwTrainer(trainerEntry)) {
        const skill = state.char.skills.leatherworking?.current ?? 0;
        const hello = leatherGossipHello({
          creatureEntry: trainerEntry,
          skillLeatherworking: skill,
          level: state.char.level,
          knownSpells: state.spellbook.known,
          questRewarded: rewardedQuestIds(),
          isTrainer: true,
          isVendor: !!ds.vendor(trainerEntry),
        });
        return {
          script: 'npc_prof_leather' as const,
          items: hello.items.map((i) => {
            if (
              i.kind === 'unlearn_dragon' ||
              i.kind === 'unlearn_elemental' ||
              i.kind === 'unlearn_tribal'
            ) {
              return {
                kind: i.kind,
                action: i.action,
                costCopper: i.costCopper,
                cite: i.cite,
              };
            }
            return { kind: i.kind, action: i.action, cite: i.cite };
          }),
          cite: hello.cite,
        };
      }
      return {
        script: null,
        items: [],
        cite: 'no npc_prof_blacksmith/leather binding for entry',
      };
    },

    // Apply specialization gossip select — mutates spellbook / gold / knownRecipes. Cite:
    // npc_professions.cpp SendActionMenu; Spell.sql Effect 36 → EffectTriggerSpell.
    selectProfessionSpec(trainerEntry, opts) {
      if (isBsTrainer(trainerEntry)) {
        const applied = applyBlacksmithSpecSelect({
          sender: opts.sender,
          action: opts.action,
          level: state.char.level,
          knownSpells: state.spellbook.known,
          creatureEntry: trainerEntry,
          moneyCopper: state.char.gold,
        });
        if (!applied.ok) return { ok: false, reason: applied.reason };
        consumeProfessionSpecKind(applied, state, trainerEntry);
        return {
          ok: true,
          phase: applied.phase,
          kind: applied.kind ?? undefined,
          grantedSpellId: applied.grantedSpellId ?? undefined,
          removedSpellId: applied.removedSpellId ?? undefined,
          confirmCostCopper: applied.confirmCostCopper ?? undefined,
          knownSpecializationSpells: knownProfessionSpecs(state.spellbook.known),
          blacksmithUnlearnGap: applied.blacksmithUnlearnGap,
          openTrainer: applied.openTrainer,
          openVendor: applied.openVendor,
        };
      }
      if (isLwTrainer(trainerEntry)) {
        const applied = applyLeatherSpecSelect({
          sender: opts.sender,
          action: opts.action,
          level: state.char.level,
          moneyCopper: state.char.gold,
          knownSpells: state.spellbook.known,
          equippedOk: opts.equippedOk !== false,
        });
        if (!applied.ok) return { ok: false, reason: applied.reason };
        if (applied.phase === 'error_money') {
          return { ok: false, reason: 'Not enough money' };
        }
        if (applied.phase === 'error_equipped') {
          return { ok: false, reason: 'Unequip specialty gear first' };
        }
        consumeProfessionSpecKind(applied, state, trainerEntry);
        return {
          ok: true,
          phase: applied.phase,
          kind: applied.kind ?? undefined,
          grantedSpellId: applied.grantedSpellId ?? undefined,
          removedSpellId: applied.removedSpellId ?? undefined,
          confirmCostCopper: applied.confirmCostCopper ?? undefined,
          knownSpecializationSpells: knownProfessionSpecs(state.spellbook.known),
          openTrainer: applied.openTrainer,
          openVendor: applied.openVendor,
        };
      }
      return { ok: false, reason: 'Not a specialization trainer' };
    },

    // Repair path for saves trained before starter auto-grant: free orange≤1 trainer recipes for every
    // profession the character already has. Idempotent.
    ensureProfessionStarters() {
      let any = false;
      for (const prof of ds.professions()) {
        if (!state.char.skills[prof.id]) continue;
        const starters = doGrantStarterRecipes(state.char, prof.id, ds.recipes());
        if (starters.granted.length) {
          state.char = starters.char;
          any = true;
        }
      }
      return { ok: true as const, granted: any };
    },

    learnRecipe(recipeId, trainerEntry) {
      const recipe = ds.recipe(recipeId);
      if (!recipe) return { ok: false, reason: 'Unknown recipe' };
      const discountMod = extras.trainerDiscountMod(trainerEntry);
      const res = doLearnRecipe(state.char, recipe, { discountMod });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot learn' };
      state.char = res.char;
      const spent = Math.floor((recipe.cost ?? 0) * discountMod);
      log(`Learned recipe: ${recipe.name}${spent ? ` for ${moneyMarked(spent)}` : ''}.`);
      return { ok: true };
    },

    // Read a recipe item out of the bags: learn what it teaches, then consume it. The item gates class
    // and level; the recipe's orange skill still gates crafting, as in WoW.
    learnRecipeFromItem(itemEntry) {
      const it = ds.item(itemEntry);
      // Resolve through the shared teach intent, not the item's own field: seven obtainable recipe
      // items have the recipe row baked but no field, and were unlearnable for that reason alone.
      const teach = itemTeachIntent(it, ds);
      if (teach?.kind === 'unavailable') return { ok: false, reason: unavailableTeachReason(teach.what) };
      if (!it || teach?.kind !== 'recipe') return { ok: false, reason: 'That item teaches no recipe' };
      if (it.allowClass && !it.allowClass.includes(state.char.cls)) return { ok: false, reason: 'Your class cannot learn this' };
      if (it.requiredLevel > state.char.level) return { ok: false, reason: `Requires level ${it.requiredLevel}` };
      if (countItem(state.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that recipe" };
      const recipe = ds.recipe(teach.id);
      if (!recipe) return { ok: false, reason: 'That recipe is unknown' };
      // The learn call checks the profession is trained and refuses a duplicate. Cost is 0 on a vendor
      // or drop recipe, and `fromItem` skips the trainer's orange-skill gate — crafting still needs it.
      const res = doLearnRecipe(state.char, recipe, { fromItem: true });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot learn' };
      state.char = res.char;
      state.inventory = removeItem(state.inventory, itemEntry, 1)[0];
      log(`You study ${it.name} and learn to craft ${recipe.name}.`);
      return { ok: true, recipeId: recipe.id, name: recipe.name };
    },

    gatherStatus(nodeId, nowMs) {
      return computeGatherStatus(ctx, nodeId, nowMs);
    },

    gather(nodeId, nowMs = 0, opts) {
      // Same Use gate as interactObject / goTransportUse — ghosts cannot farm nodes.
      // Cite: domain/run/death.ts refuseIfDead; goTransportUse.ts:24; Spell.cpp:4586.
      const deadGather = refuseIfDead(state.char.health, state.deathFlow);
      if (deadGather) return deadGather;
      const node = ds.gatherNode(nodeId);
      if (!node) return { ok: false, reason: 'Nothing to gather' };
      if (node.skill === 'fishing' && !wearFishingPole(ctx)) {
        return { ok: false, reason: 'Requires a Fishing Pole' };
      }
      const status = computeGatherStatus(ctx, nodeId, nowMs);
      if (!status.ok) return { ok: false, reason: status.reason ?? 'Cannot gather' };
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const mining = node.skill === 'mining';
      let taps = 1;
      if (mining) {
        const picked = pickPartyWorker(gatherWorkers(ctx, node).candidates);
        taps = miningTapsFor(ctx, node, picked?.skill ?? 0, rng);
      }
      const startCharges = mining ? taps : startGatherCharges(ctx, node, nodeId, rng);
      const res = applyGatherImpl(ctx, node, rng, lootGate, opts?.hold
        ? (drops) => openLoot({
          kind: gatherLootKind(node.skill),
          title: node.name,
          icon: ds.profession(node.skill)?.icon,
        }, drops)
        : undefined, taps);
      if (!res.ok) return res;
      // Mining spends every refill in this harvest; herbs/fish still tick one charge.
      const spent = mining ? startCharges : 1;
      const { remaining, depleted, respawnMs } = commitGatherNodeCharge(
        ctx, node, nodeId, nowMs, startCharges, spent,
      );
      if (depleted) log(`The ${node.name} is depleted.`);
      return { ...res, depleted, chargesLeft: remaining, respawnMs };
    },

    skin(opts) {
      if (!state.corpse) return { ok: false, reason: 'No corpse to skin' };
      const node = ds.gatherNode(state.corpse.node);
      if (!node) { state.corpse = null; return { ok: false, reason: 'Nothing to skin' }; }
      // Skill AND knife over the whole GROUP, the same gate a vein is worked under: a party
      // skinner's knife counts as the group's. Refused before apply so a missing knife never
      // clears the corpse or rolls skill.
      const refusal = gatherGroupRefusal(ctx, node);
      if (refusal) return { ok: false, reason: refusal };
      const creatureEntry = state.corpse.creatureEntry;
      const res = applyGatherImpl(ctx, node, undefined, lootGate, opts?.hold
        ? (drops) => openLoot({
          kind: 'skinning',
          title: `Skinned ${ds.creature(creatureEntry)?.name ?? 'the corpse'}`,
          icon: ds.profession('skinning')?.icon,
          creatureEntry,
        }, drops)
        : undefined);
      if (res.ok) state.corpse = null; // the corpse is consumed whether or not leather dropped
      return res;
    },

    pickPocket(creatureEntry, opts) {
      // FI7: pure canPickPocket + rollPickPocket; loot via ds.lootTable (same path as corpse loot).
      // pickpocketLootId is NOT on the live CreatureDef bake — prefer opts / optional def field.
      const cdef = ds.creature(creatureEntry);
      if (!cdef) return { ok: false, reason: 'No such creature' };

      const nowMs = opts?.nowMs ?? Date.now();
      const spawnKey = `${state.char.zoneId}:${creatureEntry}`;
      if (!canRestockPickpocket(state.pickpocketRestock, spawnKey, nowMs)) {
        return { ok: false, reason: 'Already pickpocketed' };
      }

      // Player-only: Pick Pocket is reached by casting, and OOC casting is the player's spellbook
      // alone. A group path here would have no surface to click.
      const stealth = activeStealthAura(state.char, ds, nowMs);
      const gate = canPickPocket({
        cls: state.char.cls,
        targetAlive: true, // OOC pickpocket; dead targets use corpse loot instead
        stealthOk: stealth != null,
      });
      if (!gate.ok) return { ok: false, reason: gate.reason };

      // The loot key is the baked pickpocket id when there is one, else the live per-entry key.
      // Cite: Spell.cpp CheckCast TARGET_NO_POCKETS when the id is 0.
      const defLoot = (cdef as { pickpocketLootId?: number }).pickpocketLootId;
      const lootId: number | string = (defLoot != null && defLoot > 0)
        ? defLoot
        : (opts?.pickpocketLootId != null && opts.pickpocketLootId > 0)
          ? opts.pickpocketLootId
          : pickpocketLootKey(creatureEntry);
      // Spell.cpp: no PickpocketLootId → TARGET_NO_POCKETS (unknown/missing table).
      {
        const probe = ds.lootTable(lootId);
        if (probe.length === 0 && typeof lootId === 'string') {
          return { ok: false, reason: 'Target has no pockets' };
        }
        if (typeof lootId === 'number' && lootId <= 0) {
          return { ok: false, reason: 'Target has no pockets' };
        }
      }

      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      // "Failure is handled through normal spell resist": 921 is DmgClass MAGIC with neither
      // NO_AVOIDANCE nor ALWAYS_HIT, so it takes the ordinary binary-magic die — 4% at even level,
      // +1%/level to +2 and +11%/level beyond. A resist runs no effect, so no loot object is made
      // and the pocket is NOT spent; the mob notices you. Cite: SpellEffects.cpp:2673;
      // Unit.cpp:2858 MagicSpellHitResult; Unit.cpp:3841 CalculateSpellMissChance.
      const missPct = spellMissChancePercent({
        atkLevel: state.char.level,
        defLevel: cdef.level,
        victimPlayerControlled: false,
      });
      if (rng.next() * 100 < missPct) {
        log(`Pick Pocket (${cdef.name}): failed.`);
        return { ok: false, reason: PICKPOCKET_ERR.FAILED, aggro: true };
      }
      // EffectPickPocket itself has no skill roll — the die above is the only way it fails, and the
      // loot opens whenever the cast lands.
      const rolled = rollPickPocket({
        pickpocketLootId: lootId,
        getTable: (id) => {
          const rows = ds.lootTable(id);
          // Our loot lookup returns an empty array for a missing key as well as a present empty one,
          // so treat empty as undefined to keep the no-table and empty-table cases apart.
          return rows.length > 0 ? rows : undefined;
        },
        rng,
        playerLevel: state.char.level,
        targetLevel: cdef.level,
        skipSkillCheck: true,
      });
      if (!rolled.ok) {
        // Pure skill-fail (when enabled) would set aggro; with skipSkillCheck this is table errors.
        return {
          ok: false,
          reason: rolled.reason,
          ...(rolled.aggro ? { aggro: true as const } : {}),
        };
      }

      // Grant item drops into bags (same stack path as other OOC loot).
      const granted: LootDrop[] = [];
      for (const d of rolled.drops) {
        const maxStack = ds.item(d.item)?.stackable ?? 1;
        if (!canFit(state.inventory, d.item, d.count, maxStack, cap())) continue;
        state.inventory = addItem(state.inventory, d.item, d.count, maxStack);
        granted.push(d);
      }
      if (rolled.goldCopper > 0) {
        state.char = { ...state.char, gold: state.char.gold + rolled.goldCopper };
      }
      state.pickpocketRestock = startPickpocketRestock(state.pickpocketRestock, spawnKey, nowMs);

      const names = granted.map((l) => `${l.count}x ${ds.item(l.item)?.name ?? l.item}`).join(', ');
      const goldNote = rolled.goldCopper > 0 ? ` +${moneyMarked(rolled.goldCopper)}` : '';
      log(`Pick Pocket (${cdef.name}): ${names || 'nothing'}${goldNote}.`);
      // Spell 921 (PICK_POCKET_SPELL_ID) is the classic ability; this is the OOC action wire.
      void PICK_POCKET_SPELL_ID;
      return { ok: true, drops: granted, goldCopper: rolled.goldCopper, aggro: false };
    },

    interactObject(objectEntry, opts) {
      // Pure useGameObject plus canOpenLock, with the free-open cases and the key-consume rule. `opts`
      // may be a bare clock number. A dead or ghost player cannot Use a world GO.
      const dead = refuseIfDead(state.char.health, state.deathFlow);
      if (dead) return dead;
      const hold = typeof opts === 'number' ? undefined : opts?.hold;
      const nowMs = typeof opts === 'number'
        ? opts
        : (opts?.nowMs ?? Date.now());
      const go = ds.gameObject(objectEntry);
      if (!go) return { ok: false, reason: 'No such object here' };

      // A fishing hole is reached by a Fishing cast with a pole, and interactObject is that surface
      // here, so require the skill line and the pole before any loot. Cite: GameObject.cpp:1701-1727.
      if (isGoFishingSchool(go)) {
        if (state.char.skills?.fishing == null) {
          return { ok: false, reason: 'Requires fishing' };
        }
        if (!wearFishingPole(ctx)) {
          return { ok: false, reason: 'Requires a Fishing Pole' };
        }
      }

      const incompleteQuestIds = state.questlog.quests
        .filter((q) => q.status === 'active')
        .map((q) => q.entry);
      const lockDef = (go.lockId != null ? ds.lock(go.lockId) : undefined) as LockDef | undefined;
      const skillValueFor = (lockType: number) => skillValueForLockType(ctx, lockType);

      // Herb and mine GOs share gather()'s profession and tool gates: the lock's own skill requirement
      // is often 0. A free-open lock case is an OR, so the profession gate does not apply then.
      const gatherNode = gatherNodeForGameObject(ctx, objectEntry);
      if (gatherNode) {
        if (!lockHasFreeOpenCase(lockDef)) {
          const gateReason = gatherProfessionGateReason(ctx, gatherNode);
          if (gateReason) return { ok: false, reason: gateReason };
        }
        // KI-807: share nodeState depletion with gather() (same zone:entry key + clock).
        // Depletion binds even on a free-open lock — a consumed GO has nothing left to give.
        const nKey = nodeKey(state.char.zoneId, objectEntry);
        const st = state.nodeState[nKey];
        if (!rotationNodeUp(state.char.zoneId, objectEntry, nowMs)) {
          return { ok: false, reason: 'Not in bloom' };
        }
        if (!nodeReady(st, nowMs)) return { ok: false, reason: 'Depleted' };
        const avail = goRuntimeAvailability(state.goRuntime?.[nKey], nowMs);
        if (avail.kind === 'consumed' || avail.kind === 'restock') {
          return {
            ok: false,
            reason: goRefuseReason('not_ready', {
              restockAtMs: avail.kind === 'restock' ? avail.readyAtMs : Number.MAX_SAFE_INTEGER,
              nowMs,
            }),
          };
        }
      }

      // Prefer a free or skill open so a key is not burned when Use does not need one; pick the key
      // item only when the lock fails without it. Cite: Spell.cpp CanOpenLock.
      let keyItemEntry: number | undefined;
      if (lockDef) {
        const openFree = canOpenLock({ lock: lockDef, skillValueFor });
        if (!openFree.ok) {
          // Bags + keyring: keys are BagFamily KEYS and live off the bags by design, so this
          // read found nothing and every keyed world object answered "locked".
          const held = ownedInventory(state.inventory, state.keyring);
          keyItemEntry =
            go.keyId != null && countItem(held, go.keyId) > 0
              ? go.keyId
              : matchingKeyItemEntry(
                  lockDef,
                  (entry) => countItem(held, entry) > 0,
                );
        }
      }

      const rtKey = goRuntimeKey(ctx, objectEntry);
      // Gather nodes: nodeState already said ready — strip a stale permanent goRuntime mark
      // so useChest restock gate does not block a legitimate respawn open.
      let runtime = state.goRuntime?.[rtKey];
      if (gatherNode && runtime?.readyAtMs != null && runtime.readyAtMs > nowMs) {
        // Should be unreachable after gates above; keep useGameObject input honest.
        runtime = { ...runtime, readyAtMs: nowMs };
      }
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      // Refuse quest-only GO loot before the Use, so a pre-accept click never permanently despawns
      // the instance with an empty yield. A questgiver Use is a dialog examine, not a loot open.
      {
        const endsActiveQuest =
          (go.questsEnded ?? []).some((qid) => incompleteQuestIds.includes(qid)) ||
          state.questlog.quests.some((qs) => {
            if (qs.status !== 'active') return false;
            const qd = ds.quest(qs.entry);
            if (!qd) return false;
            return qd.goEnder === objectEntry || (qd.goEnderEntries ?? []).includes(objectEntry);
          });
        const skipLootGate =
          go.type === GAMEOBJECT_TYPE_QUESTGIVER || endsActiveQuest;
        const preLootId = go.lootId;
        if (!skipLootGate && preLootId != null && preLootId !== 0) {
          const preTable = ds.lootTable(`go:${preLootId}`);
          if (goLootIsQuestOnly(preTable)) {
            const needed = questNeededItems(state.questlog, (e) => ds.quest(e));
            const anyNeeded = preTable.some((e) => needed.has(e.item));
            if (!anyNeeded) {
              return { ok: false, reason: goRefuseReason('quest_incomplete') };
            }
          }
        }
      }
      // Calendar game_event snapshot is spawn-side only; goober/chest eventId is fire-on-use.
      const activeEvents = activeEventIds(ds.gameEvents(), nowMs);
      const ritualParty = ritualPartyUserIds(state.squad?.length ?? 0);
      const ms = go.meetingstone;
      const msTarget = go.type === GAMEOBJECT_TYPE_MEETINGSTONE
        ? meetingStoneGroupTarget(
          state.squad,
          state.char.level,
          ms?.minLevel ?? 0,
          ms?.maxLevel ?? 0,
        )
        : undefined;
      const goUseCtx = {
        nowMs,
        rng,
        lock: lockDef,
        keyItemEntry,
        skillValueFor,
        incompleteQuestIds,
        runtime,
        activeEventIds: activeEvents,
        // Fishing: skill from character; zoneSkill from bake (zones.mjs:203). Omit when absent → missing_context.
        fishingSkill: state.char.skills?.fishing?.current,
        zoneSkill: ds.zone(state.char.zoneId)?.zoneSkill,
        userId: 'player',
        uniqueUserIds: runtime?.uniqueUsers,
        firstUser: runtime?.firstUser,
        delayedActionUntilMs: runtime?.delayedActionUntilMs,
        inGroup: ritualParty.length > 1,
        goSpellId: state.wildSummonedObjects?.find((w) => w.goEntry === objectEntry)?.spellId,
        ...meetingStoneUseCtx(state.char.level, msTarget),
      };
      let used = go.type === GAMEOBJECT_TYPE_SUMMONING_RITUAL
        ? useSummoningRitualParty(go, { ...goUseCtx, partyUserIds: ritualParty })
        : useGameObject(go, goUseCtx);
      // SPELL_FOCUS Use is TriggerLinkedGameObject — consume linkedTrapId here (GameObject.cpp:1569-1575).
      if (used.ok && used.kind === 'spell_focus') {
        used = applyLinkedTrap(used, ds.gameObject(used.linkedTrapId ?? 0), { nowMs });
      }
      // A board is a journey depart, not a loot/quest interact — return before the GO tail.
      if (used.ok && used.kind === 'transport') {
        return applyType11TransportUse(ctx, go, nowMs, transportDepart);
      }
      if (used.ok && used.kind === 'mo_transport') {
        return applyType15MoTransportUse(ctx, go, nowMs, transportDepart);
      }
      if (!used.ok) {
        const keyEntry = go.keyId ?? requiredKeyItemEntry(lockDef);
        const keyName = keyEntry != null ? (ds.item(keyEntry)?.name ?? `item ${keyEntry}`) : undefined;
        const hard = hardestSkillLockCase(lockDef);
        const skillNeed = hard
          ? `${hard.skillName} ${hard.skillReq}`
          : undefined;
        return {
          ok: false,
          reason: goRefuseReason(used.reason, {
            restockAtMs: used.restockAtMs ?? runtime?.readyAtMs,
            nowMs,
            keyName: used.reason === 'locked' ? keyName : undefined,
            skillNeed: used.reason === 'low_skill' ? skillNeed : undefined,
          }),
        };
      }

      // SPELLCASTER: SpellStart on user, then AddUse. Cite: GameObject.cpp:1962–1970.
      if (used.kind === 'spellcaster' && used.castSpellId) {
        const applied = applyGoSpellcasterCast(used.castSpellId, state, ds, nowMs);
        if (!applied.ok) return { ok: false, reason: applied.reason };
      }

      // GOOBER data10 casts on the user at Use, the same helper as a spellcaster's charge.
      // Cite: GameObject.cpp:1645 spellCaster->CastSpell(player, spellId).
      const gooberSpellId = used.kind === 'goober' ? (used.castSpellId ?? 0) : 0;
      if (gooberSpellId > 0) applyGoSpellcasterCast(gooberSpellId, state, ds, nowMs);

      // MEETINGSTONE Use casts 23598 (player caster) — GameObject.cpp:1888–1890, :1955–1973.
      if (used.kind === 'meetingstone' && used.ok && (used.castSpellId ?? 0) > 0) {
        const portal = placeMeetingStoneSummon(ds, nowMs, used.castSpellId);
        if (portal) {
          state.wildSummonedObjects = mergeWildSummoned(state.wildSummonedObjects, [portal], nowMs);
          const portalName = ds.gameObject(portal.goEntry)?.name ?? `object ${portal.goEntry}`;
          log(`You summon ${portalName}.`);
        }
      }

      // Persist restock / trap / door runtime bookkeeping.
      if (used.restockAtMs != null || used.trapUses != null || used.trapCooldownUntilMs != null || used.state) {
        const nextRt: GoRuntimeState = {
          ...(runtime ?? {}),
          readyAtMs: used.restockAtMs ?? runtime?.readyAtMs,
          uses: used.trapUses ?? runtime?.uses,
          cooldownUntilMs: used.trapCooldownUntilMs ?? runtime?.cooldownUntilMs,
          open: used.state === 'activated' ? true : used.state === 'ready' ? false : runtime?.open,
        };
        state.goRuntime = { ...(state.goRuntime ?? {}), [rtKey]: nextRt };
      }
      if (used.kind === 'summoning_ritual') {
        const applied = applySummoningRitualUse({
          used,
          go,
          char: state.char,
          questlog: state.questlog,
          goRuntime: state.goRuntime,
          rtKey,
          nowMs,
          spellOf: (id) => ds.spell(id),
          eventScripts: (id) => ds.eventScripts(id),
          log,
        });
        state.char = applied.char;
        state.questlog = applied.questlog;
        state.goRuntime = applied.goRuntime;
      }

      // The ScriptDev GO-use host, the player-reachable path for it. It must run after the lock and
      // Use succeed, so a locked door or postbox still needs its key.
      const sdIr = scriptDevByGo(objectEntry);
      if (sdIr?.goUse) {
        runScriptDevGoUse(sdIr, state, ds, {
          nowMs,
          goRuntimeKey: (entry) => goRuntimeKey(ctx, entry),
          log,
          usedGoEntry: objectEntry,
        });
      }
      if (used.kind === 'mailbox') {
        log(`Opened ${go.name}.`);
        return { ok: true, yielded: [], mailboxOpen: true, mailbox: state.mailbox };
      }
      // KI-807: herb/mine GOs share gather() charge/respawn — never permanent-despawn here.
      // commitGatherNodeCharge after loot/skill-up owns goRuntime for those nodes.
      if (used.despawn && !(gatherNode && (gatherNode.skill === 'herbalism' || gatherNode.skill === 'mining'))) {
        // Consumable despawn (GameObject.h:377). Restock the de-duped proxy only for objectTargets
        // or exclusive quest-container rows, not world-chest group loot (Solid Chest / Gold Bar).
        let stillNeeded = 0;
        const needLootId = used.lootId ?? go.lootId;
        const needLootItems = new Set(
          needLootId != null && needLootId !== 0
            ? ds.lootTable(`go:${needLootId}`).filter((e) => isExclusiveQuestLootRow(e)).map((e) => e.item)
            : [],
        );
        for (const qs of state.questlog.quests) {
          if (qs.status !== 'active') continue;
          const qd = ds.quest(qs.entry);
          if (!qd) continue;
          // objectTargets multi-count: credit for this use lands just below.
          const ot = qd.objectTargets?.find((t) => t.objectEntry === objectEntry);
          if (ot) {
            const cur = (qs.objects || {})[String(objectEntry)] ?? 0;
            if (cur + 1 < ot.count) stillNeeded = Math.max(stillNeeded, ot.count - cur - 1);
          }
          // itemTargets / sourceItemTargets multi-count from this GO's loot. Inventory is pre-grant; treat
          // this open as +1 so the final needed open permanent-despawns after filling the stack.
          for (const it of [...(qd.itemTargets || []), ...(qd.sourceItemTargets || [])]) {
            if (!needLootItems.has(it.item)) continue;
            const have = countItem(state.inventory, it.item);
            if (have + 1 < it.count) stillNeeded = Math.max(stillNeeded, it.count - have - 1);
          }
        }
        if (stillNeeded > 0) {
          // Another concurrent pile of the same template is already up, so this is ready immediately:
          // the goober and chest timers are per-instance reuse, not inter-pile delays.
          state.goRuntime = {
            ...(state.goRuntime ?? {}),
            [rtKey]: { ...(state.goRuntime?.[rtKey] ?? {}), readyAtMs: nowMs },
          };
        } else {
          // Consumable fully done for quests: mark not_ready far in the future.
          state.goRuntime = {
            ...(state.goRuntime ?? {}),
            [rtKey]: { ...(state.goRuntime?.[rtKey] ?? {}), readyAtMs: Number.MAX_SAFE_INTEGER },
          };
        }
      }

      // A questgiver may also carry a loot id. Container tables are keyed `go:<lootId>`, since a bare
      // id collides with creature loot; quest-required and condition rows are gated as usual.
      const rawLootId = used.lootId ?? go.lootId;
      const goLootTable = rawLootId != null && rawLootId !== 0
        ? ds.lootTable(`go:${rawLootId}`)
        : [];
      const goLootCtx = {
        // Player.cpp:13710 HasQuestForItem — skip once GiveQuestSourceItemIfNeed
        // already topped up SrcItem==ReqItem (accept + GO must not stack 2).
        allowsQuestDrop: (entry: { item: number }) =>
          hasQuestForItem(state.questlog, (e) => ds.quest(e), state.inventory, entry.item,
            (i) => ds.item(i)?.stackable),
        allowsCondition: (conditionId: number) =>
          isConditionSatisfied(conditionId, lootConditionSnapshot(), conditionTableById()).ok,
      };
      let miningTaps = 1;
      let miningWorker: PartyWorker | undefined;
      if (gatherNode?.skill === 'mining') {
        miningWorker = pickPartyWorker(gatherWorkers(ctx, gatherNode).candidates);
        miningTaps = miningTapsFor(ctx, gatherNode, miningWorker?.skill ?? 0, rng);
      }
      const yielded: LootDrop[] = goLootTable.length
        ? mergeLootDrops(Array.from({ length: miningTaps }, () => rollLoot(goLootTable, rng, goLootCtx)).flat())
        : [];
      // HOLD: the object keeps its contents until the player clicks them (the loot window rolls
      // each item's identity as it fills, so taking never re-rolls a suffix).
      let heldLoot: PendingLoot | undefined;
      if (hold) {
        heldLoot = openLoot({
          kind: goLootKind(go),
          title: go.name,
          keyUsed: keyItemEntry != null && go.lockId != null,
        }, yielded);
      } else {
        for (const y of yielded) {
          const def = ds.item(y.item);
          if (!def) continue;
          // Wave Q P2: GO container loot is a new-copy create site.
          // BoP / quest bind on loot.
          const inst = applyBindToInstance(
            createItemInstance(y.item, y.count, ds, rng),
            resolveBonding(def),
            'loot',
          );
          state.inventory = (hasIdentity(inst) || identityCapable(def))
            ? addInstance(state.inventory, inst, def.stackable ?? 1)
            : addItem(state.inventory, y.item, y.count, def.stackable ?? 1);
        }
      }

      // Consume the key item only when TakeCastItem would: an expendable key is destroyed, a permanent
      // one opens and stays in the bags, and a multi-use one decrements its charges.
      let usedKeyEntry: number | undefined;
      if (keyItemEntry != null && go.lockId) {
        const keyDef = ds.item(keyItemEntry);
        if (isExpendableLockKeyItem(keyItemEntry, keyDef)) {
          const charged = consumeItemCharges(state.inventory, keyItemEntry, keyDef);
          if (charged.ok) {
            state.inventory = charged.inventory;
            usedKeyEntry = keyItemEntry;
          } else {
            // Fallback: single-unit remove (stack path).
            state.inventory = removeItem(state.inventory, keyItemEntry, 1)[0];
            usedKeyEntry = keyItemEntry;
          }
        }
        // Permanent key: open succeeds, key remains, keyUsed unset (no metal-click cue).
      }

      // Quest credit: plain Use + cast-on-GO (goober spellId or lock-key useSpell).
      // Cite: GameObject.cpp:1635; Spell.cpp:1581; Player.cpp CastedCreatureOrGO; KI-923.
      state.questlog = applyInteractObjectQuestCredit({
        questlog: state.questlog,
        objectEntry,
        questCredit: used.questCredit,
        castSpellId: used.castSpellId,
        keyItemEntry,
        keyUseSpell: keyItemEntry != null ? (ds.item(keyItemEntry)?.useSpell ?? 0) : 0,
        questOf: (e) => ds.quest(e),
        activeQuests: state.questlog.quests,
      });
      creditSquadLogs(state, (log) => applyInteractObjectQuestCredit({
        questlog: log,
        objectEntry,
        questCredit: used.questCredit,
        castSpellId: used.castSpellId,
        keyItemEntry,
        keyUseSpell: keyItemEntry != null ? (ds.item(keyItemEntry)?.useSpell ?? 0) : 0,
        questOf: (e) => ds.quest(e),
        activeQuests: log.quests,
      }));
      // Event + go-use OPEN/CLOSE_DOOR onto goRuntime. Cite: ScriptMgr.cpp:2055–2094.
      const doors = applyGoUseAndEventDoors({
        goEntry: objectEntry,
        firedEventId: used.firedEventId,
        eventScripts: (id) => ds.eventScripts(id),
        goGuidScripts: (guid) => ds.goGuidUseScripts(guid),
        goTemplateScripts: (entry) => ds.goUseScripts(entry),
        goRuntime: state.goRuntime,
        goRuntimeKey: (e) => goRuntimeKey(ctx, e),
        gameObject: (e) => ds.gameObject(e),
        log,
      });
      if (doors.goRuntime) state.goRuntime = doors.goRuntime;
      // Cite: OutdoorPvPEP.cpp:223-337 ProcessCaptureEvent on banner Use.
      {
        const team = factionOf(ds, state.char.race) === 'horde' ? TEAM_HORDE : TEAM_ALLIANCE;
        state.worldStates = ensureWorldStates(state.worldStates);
        applyEpTowerCaptureFromGoUse(state.worldStates, objectEntry, team);
      }
      for (const qid of doors.exploreQuestIds) {
        state.questlog = recordEventHappens(state.questlog, qid);
        creditSquadEvent(state, qid);
      }
      for (const entry of doors.killCreditEntries) {
        state.questlog = recordKill(state.questlog, entry, (e) => ds.quest(e));
        creditSquadKill(state, entry, ds);
      }
      // Cite: ScriptMgr.cpp:2719–2734 TERMINATE_COND failQuest.
      if (doors.failedQuestIds.length) {
        state.questlog = applyFailedQuests(state.questlog, doors.failedQuestIds);
      }
      // Cite: ScriptMgr.cpp:3264–3267 / :2828–2843 / :2182–2218 / :1815–1911 / :2881–2992 / :2938–2948.
      for (const run of doors.scriptRuns) {
        state.worldStates = ensureWorldStates(state.worldStates);
        const tail = applyTailFromDbScript(run.world, run.intents, {
          source: run.world.source,
          worldStates: state.worldStates,
          log,
          relayScripts: (id) => ds.relayScripts(id),
          questlog: state.questlog,
          goRuntime: state.goRuntime,
          goRuntimeKey: (e) => goRuntimeKey(ctx, e),
          onMail: (rec) => deliverScriptMail(ctx, rec, Date.now(), 'Mailbox'),
        });
        if (tail.questlog) state.questlog = tail.questlog;
        if (tail.goRuntime) state.goRuntime = tail.goRuntime;
      }
      const fired = doors.fired;
      // Non-credit opcodes are dispositioned (SESSION 16) — log so it is never silent.
      if (fired && fired.rowCount > 0 && fired.hasNonCreditCommands) {
        log(
          `Event ${fired.eventId} fired (${fired.rowCount} script row(s); cmds [${fired.commands.join(',')}]) - ${fired.disposition}`,
        );
      } else if (fired && fired.rowCount > 0) {
        log(`Event ${fired.eventId} fired (${fired.rowCount} script row(s)).`);
      }
      // A GO ender arrival: an empty-objective talk or examine quest ends at a questgiver GO. Credit
      // by the ender link, the reverse list, or an empty find objective naming this GO.
      state.questlog = recordGoEnderInteract(
        state.questlog,
        objectEntry,
        (e) => ds.quest(e),
        state.inventory,
        { goName: go.name, questsEnded: go.questsEnded },
      );
      creditSquadGoEnder(state, ds, objectEntry, { goName: go.name, questsEnded: go.questsEnded });
      refreshQuests();

      // Surface accept, turn-in and incomplete at the GO's quest links, falling back to matching the
      // quest definition's own starter and ender entries against the zone offers and the log.
      let questsOffered: number[] | undefined;
      let questsTurnIn: number[] | undefined;
      let questsIncomplete: number[] | undefined;
      const hasReverse =
        (go.questsStarted?.length ?? 0) > 0 || (go.questsEnded?.length ?? 0) > 0;
      const fallbackStarted: number[] = [];
      const fallbackEnded: number[] = [];
      if (!hasReverse) {
        const seenS = new Set<number>();
        const seenE = new Set<number>();
        const isStarterOf = (q: NonNullable<ReturnType<typeof ds.quest>>, entry: number) =>
          q.goStarter === entry || (q.goStarterEntries ?? []).includes(entry);
        const isEnderOf = (q: NonNullable<ReturnType<typeof ds.quest>>, entry: number) =>
          q.goEnder === entry || (q.goEnderEntries ?? []).includes(entry);
        const consider = (qe: number) => {
          const q = ds.quest(qe);
          if (!q) return;
          if (isStarterOf(q, objectEntry) && !seenS.has(qe)) {
            seenS.add(qe);
            fallbackStarted.push(qe);
          }
          if (isEnderOf(q, objectEntry) && !seenE.has(qe)) {
            seenE.add(qe);
            fallbackEnded.push(qe);
          }
        };
        for (const qe of ds.zone(state.char.zoneId)?.quests ?? []) consider(qe);
        for (const qs of state.questlog.quests) consider(qs.entry);
      }
      if (hasReverse || fallbackStarted.length || fallbackEnded.length) {
        const snap: QuestPlayerSnapshot = {
          level: state.char.level,
          classId: state.char.cls,
          raceId: state.char.race,
          questStatus: (id) => {
            const s = getQuest(state.questlog, id);
            if (!s) return 'none';
            if (s.status === 'turnedIn') return 'turnedIn';
            if (s.status === 'complete') return 'complete';
            return 'active';
          },
          skillValue: (skillId) => state.char.combatSkills?.[skillId]?.current ?? 0,
          standingFor,
          hasActiveTimedQuest: state.questlog.quests.some((qq) => {
            if (qq.status === 'turnedIn' || qq.status === 'failed') return false;
            const qd = ds.quest(qq.entry);
            return !!(qd?.limitTime && qd.limitTime > 0);
          }),
        };
        const offer = goQuestGiverOffer(
          go,
          state.questlog,
          snap,
          (e) => ds.quest(e),
          state.inventory,
          {
            questDefFor: (id) => ds.quest(id),
            standingFor,
            fallbackStarted: hasReverse ? undefined : fallbackStarted,
            fallbackEnded: hasReverse ? undefined : fallbackEnded,
          },
        );
        questsOffered = offer.acceptable;
        questsTurnIn = offer.turnInReady;
        questsIncomplete = offer.incomplete;
      }

      // A successful herb or mine open grants profession skill-ups the same way gather() does.
      // Cite: SpellEffects.cpp:2232-2244 EffectOpenLock → UpdateGatherSkill.
      let skillUp: number | undefined;
      let workedBy: string | undefined;
      if (gatherNode && (gatherNode.skill === 'herbalism' || gatherNode.skill === 'mining')) {
        const picked = miningWorker
          ?? pickPartyWorker(gatherWorkers(ctx, gatherNode).candidates);
        if (picked) {
          const taps = gatherNode.skill === 'mining' ? miningTaps : 1;
          skillUp = grantWorkerGatherSkillTaps(ctx, picked, gatherNode, rng, taps);
          if (picked.compId != null) workedBy = picked.name;
        }
        // Mining spends every refill now; herbs still tick one charge. KI-807 clock shared with gather().
        const mining = gatherNode.skill === 'mining';
        const startCharges = mining ? miningTaps : startGatherCharges(ctx, gatherNode, objectEntry, rng);
        const { depleted } = commitGatherNodeCharge(
          ctx, gatherNode, objectEntry, nowMs, startCharges, mining ? startCharges : 1,
        );
        if (depleted) log(`The ${gatherNode.name} is depleted.`);
      }
      // KI-858: fishing hole success advances Fishing like bobber resolve (UpdateFishingSkill).
      // Cite: GameObject.cpp:1727 player->UpdateFishingSkill(); Player.cpp:5141–5161.
      if (used.kind === 'fishinghole' || go.type === GAMEOBJECT_TYPE_FISHINGHOLE) {
        const gain = gainSkill(state.char, 'fishing', { orange: 1, yellow: 1, green: 1, gray: 375 }, rng);
        state.char = gain.char;
        skillUp = gain.up ?? skillUp;
        if (used.despawn) log(`The ${go.name} is depleted.`);
      }

      if (yielded.length) {
        const line = yielded.map((l) => `${l.count}× ${ds.item(l.item)?.name ?? l.item}`).join(', ');
        const skillLine = gatherNode?.skill
          ?? ((used.kind === 'fishinghole' || go.type === GAMEOBJECT_TYPE_FISHINGHOLE) ? 'fishing' : undefined);
        const skillNote = skillUp != null && skillLine != null ? ` (${skillLine} → ${skillUp})` : '';
        // Name the companion who worked it — the skill point went to them, not the player.
        log(`Opened ${go.name}${workedBy ? ` (${workedBy})` : ''}: ${line}.${skillNote}`);
      } else if (
        (questsOffered?.length ?? 0) > 0 ||
        (questsTurnIn?.length ?? 0) > 0 ||
        (questsIncomplete?.length ?? 0) > 0
      ) {
        const bits: string[] = [];
        if (questsOffered?.length) bits.push(`${questsOffered.length} quest(s) to accept`);
        if (questsTurnIn?.length) bits.push(`${questsTurnIn.length} to turn in`);
        // Honest incomplete: active at ender but objectives unmet — never a false complete.
        // Cite: QuestHandler.cpp getDialogStatus DIALOG_STATUS_INCOMPLETE.
        if (questsIncomplete?.length) bits.push(`${questsIncomplete.length} incomplete`);
        log(`Examined ${go.name}: ${bits.join(', ')}.`);
      } else if ((used.kind === 'spellcaster' || used.kind === 'goober') && used.castSpellId) {
        const sn = ds.spell(used.castSpellId)?.name ?? `spell ${used.castSpellId}`;
        log(`Used ${go.name}: ${sn}.`);
      } else if (used.kind === 'text' || go.type === GAMEOBJECT_TYPE_TEXT) {
        log(`You read ${go.name}.`);
      } else {
        log(`Used ${go.name}.`);
      }
      // keyUsed: the LOCK_KEY_ITEM entry consumed on this open (same field openContainerItem
      // reports). The UI leads the loot window's sound cue with the lock click when set.
      return {
        ok: true,
        yielded,
        questsOffered,
        questsTurnIn,
        questsIncomplete,
        keyUsed: usedKeyEntry,
        skillUp,
        ...(workedBy ? { workedBy } : {}),
        pageId: used.pageId,
        ...(heldLoot ? { held: heldLoot } : {}),
      };
    },

    // Open a container item in the bags: roll its loot template, bag the contents, consume the
    // container. Same shape as the chest path, because in the core they are the same act.
    openContainerItem(slotIndex, opts) {
      const stack = state.inventory.stacks[slotIndex];
      if (!stack) return { ok: false, reason: "You don't have that" };
      const def = ds.item(stack.item);
      if (!def) return { ok: false, reason: 'Unknown item' };

      const hasItemLootTable = (entry: number) => ds.lootTable(`item:${entry}`).length > 0;
      const lock = def.lockId != null ? ds.lock(def.lockId) : undefined;
      const hasItem = (entry: number) =>
        countItem(state.inventory, entry) > 0
        || countItem(state.keyring ?? { stacks: [] }, entry) > 0;
      const skillMeta = ds.combatSkillMeta?.() ?? null;
      const playerSkill = playerLockpickingForLocks(state.char);

      // Roster rogue lockpick: explicit companion, else best owned rogue who covers the req.
      let lockpickingSkill = playerSkill;
      let openerName: string | undefined;
      if (opts?.lockpickerId) {
        const comp = findRosterCompanion(opts.lockpickerId);
        if (!comp) return { ok: false, reason: 'No such companion' };
        const skill = companionLockpickingSkill(comp, state.char.level, skillMeta);
        if (skill == null) {
          return { ok: false, reason: `${comp.name} cannot pick locks` };
        }
        lockpickingSkill = skill;
        openerName = comp.name;
      }

      let check = canOpenContainer({
        def,
        level: state.char.level,
        hasItemLootTable,
        lock,
        hasItem,
        lockpickingSkill,
      });
      // No explicit picker: the whole group is eligible, and the box goes to whoever can still
      // gain a Lockpicking point from it — the player, until they cap out for this lock.
      let openerIsPlayer = true;
      // A key the player holds opens it, full stop — never re-route that to a rogue's picks.
      const keyOpens = check.ok && check.keyItemEntry != null;
      const refusal = check.ok ? undefined : check.kind;
      if (!keyOpens && refusal !== 'no_loot' && refusal !== 'level' && !opts?.lockpickerId) {
        const req = containerPicklockReq(lock);
        const { candidates, holders } = lockpickWorkers({
          playerName: state.char.name,
          playerSkill: playerSkill,
          // No playerMax: `skillMaxForLevel(level)` is the cap. Passing the CURRENT skill made
          // `cur >= max` always true, so the player never gained and a companion took every box.
          playerLevel: state.char.level,
          squad: lockpickCompanionPool(state.squad, state.botRoster, state.raidRoster?.members),
          meta: skillMeta,
          required: req,
          gainTenths: (cur, max, red) => (
            cur >= max ? 0 : gatherSkillGainChanceTenths(cur, red)
          ),
        });
        const picked = req > 0 ? pickPartyWorker(candidates) : undefined;
        if (picked) {
          const re = canOpenContainer({
            def, level: state.char.level, hasItemLootTable, lock, hasItem,
            lockpickingSkill: picked.skill,
          });
          if (re.ok) {
            check = re;
            openerIsPlayer = picked.compId == null;
            if (!openerIsPlayer) openerName = picked.name;
          }
        } else if (!check.ok && check.kind === 'needs_skill' && req > 0) {
          const near = nearestPartyWorker(holders, req);
          return { ok: false, reason: `Locked - ${partyWorkRefusalReason('Lockpicking', near)}` };
        }
      }
      if (!check.ok) return { ok: false, reason: check.reason };

      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      // The player picking their own lock trains Lockpicking, exactly as casting Pick Lock does. A
      // companion rogue is at the level cap and gains nothing, which is why the picker prefers you.
      let skillUp: number | undefined;
      if (openerIsPlayer && check.keyItemEntry == null && (def.lockId ?? 0) > 0) {
        const req = containerPicklockReq(lock);
        if (req > 0) {
          const gain = tryLockpickingSkillUp(
            state.char.combatSkills,
            req,
            (p) => rng.chance(p),
          );
          if (gain.up != null) {
            state.char = { ...state.char, combatSkills: gain.map };
            skillUp = gain.up;
          }
        }
      }
      const table = ds.lootTable(`item:${def.entry}`);
      // Item containers the player already holds. Quest-gated rows still roll here: the acquire gate
      // was the drop of the container itself, so opening one is extract, not a fresh loot roll.
      const yielded: LootDrop[] = rollLoot(table, rng, {
        allowsQuestDrop: () => true,
        allowsCondition: (conditionId: number) =>
          isConditionSatisfied(conditionId, lootConditionSnapshot(), conditionTableById()).ok,
      });

      // requireRoom (the auto-opener): dry-run the whole grant into a probe inventory and refuse the
      // act rather than consume the container and spill. Cite: the gather path at professions.ts:670.
      if (opts?.requireRoom && !opts?.hold) {
        let probe = removeItem(state.inventory, def.entry, 1)[0];
        for (const y of yielded) {
          const maxStack = ds.item(y.item)?.stackable ?? 1;
          if (!canFit(probe, y.item, y.count, maxStack, cap())) {
            return { ok: false, reason: 'Not enough bag space' };
          }
          probe = addItem(probe, y.item, y.count, maxStack);
        }
      }

      // The container itself goes first, so its slot is free for what was inside it.
      state.inventory = removeItem(state.inventory, def.entry, 1)[0];
      // A key case consumes the key on open — a charge off a charged key, and nothing off a permanent
      // one (Skeleton Key stays). Same rule as interactObject. Cite: Spell.cpp:4209 TakeCastItem.
      let usedKeyEntry: number | undefined;
      if (check.keyItemEntry != null) {
        const keyDef = ds.item(check.keyItemEntry);
        const spent = consumeItemCharges(state.inventory, check.keyItemEntry, keyDef);
        if (spent.ok) state.inventory = spent.inventory;
        // keyUsed is the key CONSUMED by this open, so only a destroy-at-zero row reports one.
        if (isExpendableCastItem(keyDef)) usedKeyEntry = check.keyItemEntry;
      }

      const via = openerName ? ` (${openerName})` : '';
      // Key OR lockpick skill (player or party rogue) → lock-click cue in the loot window.
      const lockOpened = check.keyItemEntry != null || ((def.lockId ?? 0) > 0);
      // HOLD keeps the contents in the loot window, which is the only place they live once the
      // container is consumed. A full backpack just leaves the row in the window.
      if (opts?.hold) {
        const held = openLoot({
          kind: 'container',
          title: def.name,
          icon: def.icon,
          containerItem: def.entry,
          keyUsed: lockOpened,
        }, yielded);
        refreshQuests();
        log(`Opened ${def.name}${via}.${skillUp != null ? ` (Lockpicking → ${skillUp})` : ''}`);
        return {
          ok: true, yielded, spilled: [], keyUsed: usedKeyEntry,
          ...(skillUp != null ? { skillUp } : {}),
          ...(openerName ? { openedBy: openerName } : {}),
          held,
        };
      }

      const granted: LootDrop[] = [];
      const spilled: LootDrop[] = [];
      for (const y of yielded) {
        const itemDef = ds.item(y.item);
        if (!itemDef) continue;
        const maxStack = itemDef.stackable ?? 1;
        if (!canFit(state.inventory, y.item, y.count, maxStack, cap())) {
          spilled.push(y); // bags full: report it rather than silently eating the drop
          continue;
        }
        const inst = applyBindToInstance(
          createItemInstance(y.item, y.count, ds, rng),
          resolveBonding(itemDef),
          'loot',
        );
        state.inventory = (hasIdentity(inst) || identityCapable(itemDef))
          ? addInstance(state.inventory, inst, maxStack)
          : addItem(state.inventory, y.item, y.count, maxStack);
        granted.push(y);
      }
      refreshQuests(); // container contents can complete a gather objective

      const line = granted.map((l) => `${l.count}× ${ds.item(l.item)?.name ?? l.item}`).join(', ');
      log(`Opened ${def.name}${via}: ${line || 'nothing inside'}.`
        + `${skillUp != null ? ` (Lockpicking → ${skillUp})` : ''}`
        + `${spilled.length ? ' (bags full - some contents lost)' : ''}`);
      return {
        ok: true, yielded: granted, spilled, keyUsed: usedKeyEntry,
        ...(skillUp != null ? { skillUp } : {}),
        ...(openerName ? { openedBy: openerName } : {}),
      };
    },

    // The zone's reachable spell focus ids: a focus-requiring recipe needs its id here. Zone
    // granularity, because outside a session the world model has no in-zone position.
    craft(recipeId) {
      const recipe = ds.recipe(recipeId);
      if (!recipe) return { ok: false, reason: 'Unknown recipe' };
      const productStack = ds.item(recipe.product.item)?.stackable ?? 1;
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      // Vendor goods the bags lack (vials, thread, dye) are bought into the craft at vendor price.
      const staged = stageVendorReagents(ds, state.char, recipe.reagents, state.inventory, cap());
      if (!staged.ok) return { ok: false, reason: staged.reason };
      // Wave Q P2: craft product is a new-copy create site (roll when product has randomProperty).
      const now = Date.now();
      const res = doCraft(
        state.char, staged.inv, recipe, productStack, rng, cap(), ds, undefined,
        reachableCraftFocus(),
        { spellCooldowns: state.spellCooldowns, categoryCooldowns: state.categoryCooldowns, now },
        partyTools(),
      );
      if (!res.ok) return { ok: false, reason: craftRefusal(recipe, now, res.reason) };
      state.char = staged.cost ? { ...res.char, gold: res.char.gold - staged.cost } : res.char;
      state.inventory = res.inventory;
      stampRecipeCooldown(recipe, state, now);
      refreshQuests(); // a crafted item can satisfy a gather objective
      const pname = ds.item(recipe.product.item)?.name ?? recipe.product.item;
      const made = res.produced?.count ?? 1;
      if (staged.cost) log(`Bought ${buyNames(ds, staged.buys)} for ${moneyMarked(staged.cost)}.`);
      log(`Crafted ${made > 1 ? `${made}x ` : ''}${pname}.${res.skillUp ? ` (${recipe.skill} → ${res.skillUp})` : ''}`);
      return { ok: true, produced: res.produced!, skillUp: res.skillUp, ...(staged.cost ? { spent: staged.cost } : {}) };
    },

    craftAll(recipeId) {
      const recipe = ds.recipe(recipeId);
      if (!recipe) return { ok: false, reason: 'Unknown recipe' };
      const productStack = ds.item(recipe.product.item)?.stackable ?? 1;
      // Upper bound = how many the reagents on hand allow (a full bag can stop us sooner).
      // A reagent-free recipe (shouldn't exist) is capped at 1 so a bad data row can't spin here.
      const maxByReagents = recipe.reagents.length
        ? maxCraftsWithVendor(ds, state.char, recipe.reagents, state.inventory)
        : 1;
      const skillBefore = state.char.skills[recipe.skill]?.current;
      let crafted = 0;
      let units = 0;
      let spent = 0;
      let produced: LootDrop | undefined;
      let lastReason: string | undefined;
      for (let i = 0; i < maxByReagents; i++) {
        // Each craft rolls its own skill-up, so give each a fresh sub-seed like craft() does.
        const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
        const staged = stageVendorReagents(ds, state.char, recipe.reagents, state.inventory, cap());
        if (!staged.ok) { lastReason = staged.reason; break; }
        const now = Date.now();
        const res = doCraft(
          state.char, staged.inv, recipe, productStack, rng, cap(), ds, undefined,
          reachableCraftFocus(),
        { spellCooldowns: state.spellCooldowns, categoryCooldowns: state.categoryCooldowns, now },
          partyTools(),
        );
        if (!res.ok) { lastReason = craftRefusal(recipe, now, res.reason); break; }
        state.char = staged.cost ? { ...res.char, gold: res.char.gold - staged.cost } : res.char;
        state.inventory = res.inventory;
        stampRecipeCooldown(recipe, state, now);
        spent += staged.cost;
        produced = res.produced;
        units += res.produced?.count ?? 1;
        crafted++;
      }
      if (crafted === 0) return { ok: false, reason: lastReason ?? 'Cannot craft' };
      refreshQuests(); // a crafted item can satisfy a gather objective
      const skillAfter = state.char.skills[recipe.skill]?.current;
      const pname = ds.item(recipe.product.item)?.name ?? recipe.product.item;
      const skillNote = skillBefore != null && skillAfter != null && skillAfter > skillBefore ? ` (${recipe.skill} ${skillBefore} → ${skillAfter})` : '';
      log(`Crafted ${units}x ${pname}.${spent ? ` Vendor reagents ${moneyMarked(spent)}.` : ''}${skillNote}`);
      return { ok: true, crafted, produced: produced!, skillBefore, skillAfter, ...(spent ? { spent } : {}) };
    },

    learnEnchant(enchantId, trainerEntry) {
      const enchant = ds.enchant(enchantId);
      if (!enchant) return { ok: false, reason: 'Unknown enchant' };
      const discountMod = extras.trainerDiscountMod(trainerEntry);
      const res = doLearnEnchant(state.char, enchant, { discountMod });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot learn' };
      state.char = res.char;
      const spent = Math.floor((enchant.cost ?? 0) * discountMod);
      log(`Learned enchant: ${enchant.name}${spent ? ` for ${moneyMarked(spent)}` : ''}.`);
      return { ok: true };
    },

    // The enchant analogue of learnRecipeFromItem: read a Formula: item, learn its formula, consume it.
    learnEnchantFromItem(itemEntry) {
      const it = ds.item(itemEntry);
      // The same derivation as the recipe path. About 76 obtainable formula items teach an enchant
      // with no baked row, so they come back unavailable — which refuses and KEEPS the formula.
      const teach = itemTeachIntent(it, ds);
      if (teach?.kind === 'unavailable') return { ok: false, reason: unavailableTeachReason(teach.what) };
      if (!it || teach?.kind !== 'enchant') return { ok: false, reason: 'That item teaches no formula' };
      if (it.allowClass && !it.allowClass.includes(state.char.cls)) return { ok: false, reason: 'Your class cannot learn this' };
      if (it.requiredLevel > state.char.level) return { ok: false, reason: `Requires level ${it.requiredLevel}` };
      if (countItem(state.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that formula" };
      const enchant = ds.enchant(teach.id);
      if (!enchant) return { ok: false, reason: 'That formula is unknown' };
      // fromItem: true — skip trainer skill≥orange gate (KI-143); apply still requires skill ≥ orange.
      const res = doLearnEnchant(state.char, enchant, { fromItem: true });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot learn' };
      state.char = res.char;
      state.inventory = removeItem(state.inventory, itemEntry, 1)[0];
      log(`You study ${it.name} and learn ${enchant.name}.`);
      return { ok: true, enchantId: enchant.id, name: enchant.name };
    },

    // A profession TIER book (Expert Cookbook and its siblings): a vendor-sold book whose on-use spell
    // is a learn of the tier spell, so no teach field was baked. Free: the book's price was the cost.
    learnProfessionRankFromItem(itemEntry) {
      const it = ds.item(itemEntry);
      const teach = itemTeachIntent(it, ds);
      if (!it || teach?.kind !== 'profRank') return { ok: false, reason: 'That book teaches no skill' };
      if (it.allowClass && !it.allowClass.includes(state.char.cls)) return { ok: false, reason: 'Your class cannot learn this' };
      if (it.requiredLevel > state.char.level) return { ok: false, reason: `Requires level ${it.requiredLevel}` };
      if (countItem(state.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that book" };
      // The tier spell is named after its skill line ("Cooking" / "Fishing" / "First Aid"), which is
      // exactly ProfessionDef.name — no new bake field needed to bridge SkillLine id → our id.
      const taughtName = ds.spell(teach.id)?.name?.trim().toLowerCase();
      const prof = taughtName
        ? ds.professions().find((p) => p.name.trim().toLowerCase() === taughtName)
        : undefined;
      if (!prof) return { ok: false, reason: 'That skill is not in the game yet' };
      const have = state.char.skills[prof.id];
      if (!have) return { ok: false, reason: `Learn ${prof.name} from a trainer first` };
      const target = prof.ranks.find((r) => r.rank === teach.rank);
      if (!target) return { ok: false, reason: `${prof.name} has no such rank` };
      if (have.max >= target.cap) return { ok: false, reason: `You already know ${target.name} ${prof.name}` };
      // The book grants exactly ONE tier — refuse when the player is more than one rank short
      // rather than skipping a tier they never trained.
      const next = prof.ranks.find((r) => r.cap > have.max);
      if (!next || next.rank !== teach.rank) {
        return { ok: false, reason: `Train ${next?.name ?? 'the next rank'} ${prof.name} first` };
      }
      const res = doTrainProfession(state.char, prof, { free: true });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot learn' };
      state.char = res.char;
      state.inventory = removeItem(state.inventory, itemEntry, 1)[0];
      log(`You study ${it.name} and learn ${target.name} ${prof.name}.`);
      return { ok: true, skill: prof.id, name: `${target.name} ${prof.name}` };
    },

    enchantItem(enchantId, slot, companionId) {
      const enchant = ds.enchant(enchantId);
      if (!enchant) return { ok: false, reason: 'Unknown enchant' };
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      if (companionId) {
        if (hasAttrEx2(ds.spell(enchant.spellId), SPELL_ATTR_EX2.ENCHANT_OWN_ITEM_ONLY)) {
          return { ok: false, reason: 'You can only enchant your own items with that' };
        }
        // A profession enchant on a companion's gear: your skill and reagents, their paperdoll. A
        // companion has no slot map, so the permanent enchant lives on the equipped instance.
        const comp = findRosterCompanion(companionId);
        if (!comp) return { ok: false, reason: 'That companion is not with you' };
        const playerEquipped = state.char.equipped;
        const playerEnchants = state.char.enchants;
        const wearShell = { ...state.char, equipped: comp.equipped, enchants: undefined };
        const staged = stageVendorReagents(ds, state.char, enchant.reagents, state.inventory, cap());
        if (!staged.ok) return { ok: false, reason: staged.reason };
        const res = doApplyEnchant(wearShell, staged.inv, ds, enchant, slot, rng, partyTools());
        if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot enchant' };
        // Skill-up stays on the player; gear reverts to player, companion gets enchanted kit.
        state.char = { ...res.char, equipped: playerEquipped, enchants: playerEnchants, gold: res.char.gold - staged.cost };
        comp.equipped = res.char.equipped;
        state.inventory = res.inventory;
        const target = ds.item(equippedEntry(comp.equipped[slot])!)?.name ?? slot;
        if (staged.cost) log(`Bought ${buyNames(ds, staged.buys)} for ${moneyMarked(staged.cost)}.`);
        log(`Applied ${enchant.name} to ${comp.name}'s ${target}.${res.skillUp ? ` (enchanting → ${res.skillUp})` : ''}`);
        return { ok: true, skillUp: res.skillUp };
      }
      const staged = stageVendorReagents(ds, state.char, enchant.reagents, state.inventory, cap());
      if (!staged.ok) return { ok: false, reason: staged.reason };
      const res = doApplyEnchant(state.char, staged.inv, ds, enchant, slot, rng, partyTools());
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot enchant' };
      state.char = staged.cost ? { ...res.char, gold: res.char.gold - staged.cost } : res.char;
      state.inventory = res.inventory;
      const target = ds.item(equippedEntry(state.char.equipped[slot])!)?.name ?? slot;
      if (staged.cost) log(`Bought ${buyNames(ds, staged.buys)} for ${moneyMarked(staged.cost)}.`);
      log(`Applied ${enchant.name} to ${target}.${res.skillUp ? ` (enchanting → ${res.skillUp})` : ''}`);
      return { ok: true, skillUp: res.skillUp };
    },

    // A GROUP job like a herb node: the item and mats are the player's, and the Enchanting line that
    // gates it belongs to whoever swings. Roster reach, because the player picked this verb.
    disenchant(itemEntry, opts) {
      return disenchantOne(itemEntry, undefined, opts);
    },
    disenchantStack(slotIndex, opts) {
      const stk = state.inventory.stacks[slotIndex];
      if (!stk) return { ok: false, reason: "You don't have that" };
      return disenchantOne(stk.item, slotIndex, opts);
    },
    // A companion's own bag stack, broken down where it lies. Soulbound gear never leaves the body
    // carrying it (partyVault.ts:259), and disenchant materials carry no bind, so the dust is yours.
    disenchantCompanionBagStack(id, slotIndex, opts) {
      const holder = findRosterCompanion(id);
      if (!holder) return { ok: false, reason: 'That companion is not with you' };
      const stk = (holder.bags ?? { stacks: [] }).stacks[slotIndex];
      if (!stk) return { ok: false, reason: 'Invalid slot' };
      return disenchantOne(stk.item, slotIndex, opts, holder);
    },
  };
}
