// Accept and turn in a quest ON a companion: Player.cpp CanTakeQuest / RewardQuest against their
// level, class, race, bags and standings. Money pays the player — companionCharacter is gold: 0.

import type { DataStore } from '../../data/dataStore.ts';
import type { QuestDef } from '../../data/schema.ts';
import type { Companion } from '../../domain/bots/squad.ts';
import { companionCharacter, companionLevel } from '../../domain/bots/squad.ts';
import { applyCompanionXp } from '../../domain/bots/companionXp.ts';
import { writeCompanionStandings } from '../../domain/bots/companionRep.ts';
import {
  companionBags,
  companionQuestLog,
  companionQuestSnapshot,
} from '../../domain/bots/companionQuests.ts';
import {
  reputationAuraModFromSpells,
  rewardQuestReputation,
} from '../../domain/creature/reputation.ts';
import { racialSpells } from '../../domain/character/races.ts';
import { addItem, addInstance, canFit, countItem, removeItem } from '../../domain/items/inventory.ts';
import { bagCapacity } from '../../domain/items/equipment.ts';
import { applyBindToInstance, resolveBonding } from '../../domain/items/itemBonding.ts';
import type { ItemInstance } from '../../domain/items/itemInstance.ts';
import {
  accept,
  canTakeQuest,
  getQuest,
  hasQuestSlot,
  isItemStartedQuest,
  itemStartRequiredItem,
  markTurnedIn,
  questComplete,
  recordSameZoneDeliver,
  satisfyQuestClass,
  shouldDestroyStartItemOnAccept,
  shouldGrantSrcItemOnAccept,
} from '../../domain/quests/questlog.ts';
import { computeQuestXpAndMoney, resolveRewChoice } from './questTurnIn.ts';
import { type PartyOverflow, overflowLine, storeOrOverflow } from './bagOverflow.ts';

export interface CompanionAcceptResult {
  ok: boolean;
  reason?: string;
}

export interface CompanionTurnInResult {
  ok: boolean;
  reason?: string;
  xp?: number;
  /** Copper paid to the PLAYER — companions carry no purse. */
  money?: number;
  items?: { item: number; count: number }[];
  rep?: { faction: number; delta: number }[];
  leveledTo?: number[];
}

function questDefFor(ds: DataStore) {
  return (id: number): QuestDef | undefined => ds.quest(id);
}

// Player acceptQuest (engine/game/questLog.ts:176) with the companion's snapshot. The zone gate is
// the caller's — companionQuestOffers already applied it, and a direct accept is a deliberate act.
export function acceptCompanionQuest(
  comp: Companion,
  entry: number,
  playerLevel: number,
  ds: DataStore,
): CompanionAcceptResult {
  if (comp.mission) return { ok: false, reason: `${comp.name} is away` };
  const q = ds.quest(entry);
  if (!q) return { ok: false, reason: 'Unknown quest' };
  const log = companionQuestLog(comp);
  if (getQuest(log, entry)) return { ok: false, reason: `Already in ${comp.name}'s log` };
  if (!hasQuestSlot(log)) return { ok: false, reason: `${comp.name}'s quest log is full` };

  const snap = companionQuestSnapshot(comp, playerLevel, ds);
  const prevMissing = !!(q.prevQuest && !ds.quest(q.prevQuest));
  if (!canTakeQuest(snap, q, { prevQuestMissingFromData: prevMissing, questDefFor: questDefFor(ds) })) {
    if (!satisfyQuestClass(snap, q)) return { ok: false, reason: `Not a quest for a ${comp.name}` };
    if (companionLevel(comp, playerLevel) < q.minLevel) {
      return { ok: false, reason: `${comp.name} needs level ${q.minLevel}` };
    }
    return { ok: false, reason: `${comp.name} cannot take this quest` };
  }

  const startItem = itemStartRequiredItem(q);
  if (isItemStartedQuest(q) && startItem != null && countItem(companionBags(comp), startItem) <= 0) {
    const iname = ds.item(startItem)?.name ?? `item ${startItem}`;
    return { ok: false, reason: `${comp.name} needs ${iname} to start this` };
  }

  comp.questLog = accept(log, q);
  // Player.cpp:12470-12488 — the start item is destroyed unless the finish still wants it.
  let bags = companionBags(comp);
  const bags0 = bags;
  if (shouldDestroyStartItemOnAccept(q) && startItem != null) {
    if (countItem(bags, startItem) >= 1) bags = removeItem(bags, startItem, 1)[0];
  }
  const src = q.srcItem;
  if (src?.item && shouldGrantSrcItemOnAccept(q)) {
    const need = src.count > 0 ? src.count : 1;
    const have = countItem(bags, src.item);
    if (have < need) {
      const missing = need - have;
      const idef = ds.item(src.item);
      const maxStack = idef?.stackable ?? 1;
      const lvl = companionLevel(comp, playerLevel);
      const cap = bagCapacity(companionCharacter(comp, lvl, ds), ds);
      if (canFit(bags, src.item, missing, maxStack, cap)) {
        bags = addItem(bags, src.item, missing, maxStack);
      }
    }
  }
  if (bags !== bags0) comp.bags = bags;
  return { ok: true };
}

// Player turnInQuest (engine/game/questLog.ts:647) run against one companion. Objective items come
// out of THEIR bags, reward items and reputation land on THEM, money goes to the player's purse.
export function turnInCompanionQuest(
  comp: Companion,
  entry: number,
  playerLevel: number,
  ds: DataStore,
  zoneId: string,
  rewardChoice = 0,
  overflow?: PartyOverflow,
  feed?: (msg: string) => void,
): CompanionTurnInResult {
  if (comp.mission) return { ok: false, reason: `${comp.name} is away` };
  const q = ds.quest(entry);
  if (!q) return { ok: false, reason: 'Unknown quest' };
  const log = companionQuestLog(comp);
  const st = getQuest(log, entry);
  if (!st) return { ok: false, reason: `Not in ${comp.name}'s log` };
  if (st.status === 'turnedIn') return { ok: false, reason: 'Already completed' };
  if (st.status === 'failed') return { ok: false, reason: 'Quest failed' };

  const snap = companionQuestSnapshot(comp, playerLevel, ds);
  const lvl = companionLevel(comp, playerLevel);
  const char = companionCharacter(comp, lvl, ds);
  // Same cap giveItemToBot measures against — their equipped bags, not a bare backpack.
  const cap = bagCapacity(char, ds);
  let bags = companionBags(comp);
  // Standing in the ender zone with the goods IS the deliver event, the same credit the player's
  // turnInQuest records before it checks completion (engine/game/questLog.ts:659).
  const delivered = recordSameZoneDeliver(log, zoneId, (e) => ds.quest(e), bags);
  if (delivered !== log) comp.questLog = delivered;
  const stNow = getQuest(delivered, entry) ?? st;
  if (!questComplete(q, stNow, bags, { standingFor: snap.standingFor })) {
    return { ok: false, reason: 'Quest is not complete' };
  }

  const choice = resolveRewChoice(q, rewardChoice);
  if (!choice.ok) return { ok: false, reason: choice.reason };
  const rewards = [...(q.rewItems ?? []), ...(choice.grant ? [choice.grant] : [])];

  // CanRewardQuest's bag fit (Player.cpp:12548-12551) only refuses when no overflow is wired; with
  // one, the player's own junk pass frees the slot or queues the reward instead.
  if (!overflow) {
    let probe = bags;
    for (const t of q.itemTargets ?? []) probe = removeItem(probe, t.item, t.count)[0];
    for (const r of rewards) {
      const def = ds.item(r.item);
      if (!def) continue;
      if (!canFit(probe, r.item, r.count, def.stackable ?? 1, cap)) {
        return { ok: false, reason: `${comp.name}'s bags are full` };
      }
      probe = addInstance(probe, { item: r.item, count: r.count }, def.stackable ?? 1);
    }
  }

  for (const t of q.itemTargets ?? []) bags = removeItem(bags, t.item, t.count)[0];
  comp.bags = bags;

  const granted: { item: number; count: number }[] = [];
  const handle = overflow?.bagsFor(comp);
  for (const r of rewards) {
    const def = ds.item(r.item);
    if (!def) continue;
    // A quest reward is bound on the body that earned it, same trigger the loot path uses.
    const base: ItemInstance = { item: r.item, count: r.count };
    const inst = applyBindToInstance(base, resolveBonding(def), 'loot');
    if (handle && overflow) {
      const outcome = storeOrOverflow(handle, ds, overflow.handleFullBags, r.item, r.count, inst);
      if (outcome === 'overflow') feed?.(overflowLine(handle, ds, r.item, r.count));
    } else {
      comp.bags = addInstance(companionBags(comp), inst, def.stackable ?? 1);
    }
    granted.push({ item: r.item, count: r.count });
  }

  const { xpAward, moneyAward } = computeQuestXpAndMoney(q, lvl);

  const applied: { faction: number; delta: number }[] = [];
  if (q.rewRep?.length) {
    const repMod = reputationAuraModFromSpells(racialSpells(ds, comp.race));
    const result = rewardQuestReputation({
      rewRep: q.rewRep,
      playerLevel: lvl,
      questLevel: q.questLevel,
      raceId: char.race,
      classId: char.cls,
      reputations: char.reputations ?? {},
      factions: ds.factions(),
      rates: ds.reputationRates(),
      spillover: ds.reputationSpillover(),
      flags: char.factionFlags ?? {},
      spilloverMask: q.reputationSpilloverMask ?? 0,
      ...(repMod ? { repMod } : {}),
    });
    writeCompanionStandings(comp, {
      ...char,
      reputations: result.reputations,
      factionFlags: result.flags ?? char.factionFlags,
    });
    for (const a of result.applied) {
      if (a.delta !== 0) applied.push({ faction: a.faction, delta: a.delta });
    }
  }

  // Class-quest rewSpells are remembered on the body, the same field a tome writes.
  const learned: number[] = [];
  for (const raw of q.rewSpells ?? []) {
    if (!ds.spell(raw)) continue;
    if ((comp.taughtSpells ?? []).includes(raw)) continue;
    learned.push(raw);
  }
  if (learned.length) comp.taughtSpells = [...(comp.taughtSpells ?? []), ...learned];

  const xp = applyCompanionXp(comp, xpAward, playerLevel, ds);
  comp.questLog = markTurnedIn(companionQuestLog(comp), entry);

  return {
    ok: true,
    xp: xp.gain,
    money: moneyAward,
    items: granted,
    rep: applied,
    leveledTo: xp.leveledTo,
  };
}
