// Next concrete step for one quest. Not the Auto Quest campaign: no chaining,
// no level-band skip, no other log entries.

import type { DataStore } from '../../data/dataStore.ts';
import type { ConditionDef, QuestDef } from '../../data/schema.ts';
import type { GameState } from '../../engine/game/types.ts';
import { knows } from '../character/spellbook.ts';
import { countItem, type Inventory } from '../items/inventory.ts';
import { ownedInventory } from '../items/keyring.ts';
import { mailboxAsInventory } from '../economy/mail.ts';
import {
  eventCreditIsTheRemainingWork,
  creatureCreditTargets,
  deliverArrivalPending,
  getQuest,
  isEventTalkQuest,
  isItemStartedQuest,
  isTalkToNpcQuest,
  itemStartGateMet,
  itemStartRequiredItem,
  questComplete,
  shouldGrantSrcItemOnAccept,
  type QuestState,
} from './questlog.ts';
import {
  GARMENTS_ENTRY_QUEST,
  SPELL_FORTITUDE_R1,
  SPELL_LESSER_HEAL_R2,
} from '../scriptdev/npcsSpecial.ts';
import { huntableCreatures, zoneVendors, findVendorSelling } from '../../world/world.ts';
import { buyCostCopper } from '../economy/trading.ts';
import {
  corpseUseFightEntries,
  corpseUseSummonedEntries,
  itemIsQuestCorpseUse,
  pendingCorpseUseItem,
} from './questCorpseUse.ts';
import { pendingScriptItemUse } from './questScriptItemUse.ts';
import { factionOf } from '../character/races.ts';
import { calculateHonorRank } from '../run/honor.ts';
import { canAttackCreature } from '../creature/faction.ts';
import { unitCannotBeAttacked } from '../creature/unitFlags.ts';
import { auraIdsForSnapshot, itemGrantsAdCommissionAura, snapshotHasAdCommissionAura, CONDITION, type ConditionSnapshot } from '../../engine/spells/conditions.ts';
import {
  lootDropAllowed,
  compareQuestDroppers,
  pickQuestDropper,
  dropperPickSalt,
  creatureFarmLevel,
  creatureFarmRank,
  canTakeQuestForCondition,
  questConditionSnapshot,
  questHasBakedPath,
  questWorkSkipReason,
  dropperNoiseFloor,
} from '../../quests/quests.ts';
import { equippedEntry } from '../items/itemInstance.ts';
import { isScriptCreditOnlyTarget } from './questScriptCredit.ts';
import { lootRowIsQuestItemSource } from '../items/loot.ts';
import { canOpenLock, requiredKeyItemEntry } from '../world/openLock.ts';

const GARMENTS_QUEST_PATIENT: Readonly<Record<number, number>> = Object.fromEntries(
  Object.entries(GARMENTS_ENTRY_QUEST).map(([entry, questId]) => [questId, Number(entry)]),
);

export type DoQuestStep =
  | { kind: 'accept' }
  | { kind: 'abandon' }
  | { kind: 'talk' }
  | { kind: 'escort' }
  | { kind: 'garments'; spell: number; creature: number }
  | { kind: 'object'; objectEntry: number }
  | { kind: 'use'; itemEntry: number; targetCreatureEntry?: number }
  | { kind: 'grant-src' }
  | { kind: 'equip'; itemEntry: number }
  | { kind: 'buy'; vendorEntry: number; itemEntry: number; count: number }
  | { kind: 'turnin' }
  | { kind: 'pick-reward' }
  | { kind: 'fight'; creatureEntry: number }
  | { kind: 'travel'; zoneId: string; reason: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'done' };

export function nextDoQuestStep(
  state: GameState,
  ds: DataStore,
  entry: number,
  opts?: {
    rewardChoices?: number;
    atGo?: boolean;
    skipBuy?: boolean;
    skipObjects?: ReadonlySet<number>;
    skipCreatures?: ReadonlySet<number>;
  },
): DoQuestStep {
  const def = ds.quest(entry);
  if (!def) return { kind: 'blocked', reason: 'Unknown quest' };

  const qs = getQuest(state.questlog, entry);
  if (!qs || qs.status === 'turnedIn' || qs.status === 'failed') {
    if (qs && qs.status === 'turnedIn') return { kind: 'done' };
    if (qs && qs.status === 'failed') return { kind: 'abandon' };
    const startItem = missingStartItem(state, def);
    if (startItem != null) {
      const getIt = acquireItemStep(state, ds, def, startItem, opts);
      if (getIt) return getIt;
    }
    const go = goStarterInZone(ds, def, state.char.zoneId);
    if (go && !opts?.skipObjects?.has(go)) return { kind: 'object', objectEntry: go };
    // Start item already in bags/overflow: the item IS the giver. Do not walk to a
    // baked starter zone (Cortello's Riddle ender-zone pin). Cite: Player.cpp TYPEMASK_ITEM.
    if (itemStartGateMet(def, ownedOf(state))) return { kind: 'accept' };
    const starters = def.starterZones ?? [];
    if (
      starters.length > 0
      && !starters.includes(state.char.zoneId)
      && !def.srcItem
      && !isItemStartedQuest(def)
    ) {
      return {
        kind: 'travel',
        zoneId: starters[0]!,
        reason: `Travel to ${ds.zone(starters[0])?.name ?? starters[0]} to take ${def.title}`,
      };
    }
    return { kind: 'accept' };
  }

  const ready = qs.status === 'complete'
    || questComplete(def, qs, ownedOf(state))
    || deliverArrivalPending(def, qs, ownedOf(state), state.char.zoneId);
  if (ready) {
    const choices = opts?.rewardChoices ?? (def.rewChoiceItems ?? []).filter((c) => c.item > 0).length;
    if (choices > 1) return { kind: 'pick-reward' };
    return { kind: 'turnin' };
  }

  if (qs.status === 'active') {
    const talk = talkStep(def, qs);
    if (talk) return talk;
    if (eventCreditIsTheRemainingWork(def, qs, ownedOf(state))) {
      return { kind: 'escort' };
    }
    const garments = garmentsStep(state, def);
    if (garments) return garments;
    const corpseItem = pendingCorpseUseItem(ds, def, state.inventory, state.lastCorpse);
    if (corpseItem) return { kind: 'use', itemEntry: corpseItem };
    // Kill credit from a ScriptDev spell hit on a live NPC (Lazy Peons 5441): a use step with a
    // target, since the creature is never on zone.huntable. Cite: questScriptItemUse.ts.
    const scriptUse = pendingScriptItemUse(ds, def, qs, ownedOf(state), state.char.zoneId);
    if (scriptUse) {
      return { kind: 'use', itemEntry: scriptUse.item, targetCreatureEntry: scriptUse.targetCreatureEntry };
    }
    for (const st of def.sourceItemTargets || []) {
      if (itemIsQuestCorpseUse(ds, st.item)) continue;
      if (countItem(ownedOf(state), st.item) >= st.count) {
        return { kind: 'use', itemEntry: st.item };
      }
    }
    if (missingProvidedSrc(state, def)) {
      const go = goStarterInZone(ds, def, state.char.zoneId);
      if (go && !opts?.atGo && !opts?.skipObjects?.has(go)) {
        return { kind: 'object', objectEntry: go } as Extract<DoQuestStep, { kind: 'object' }>;
      }
      if (shouldGrantSrcItemOnAccept(def, { atGo: opts?.atGo })) return { kind: 'grant-src' };
    }
    const keyMob = questLockKeyFightTarget(state, ds, def, qs, opts?.skipCreatures);
    if (keyMob != null) {
      return { kind: 'fight', creatureEntry: keyMob } as Extract<DoQuestStep, { kind: 'fight' }>;
    }
    const keyGo = questLockKeyObjectStep(state, ds, def, qs, opts?.skipObjects);
    if (keyGo != null) {
      return { kind: 'object', objectEntry: keyGo } as Extract<DoQuestStep, { kind: 'object' }>;
    }
    const skipObj = opts?.skipObjects;
    const obj = localObjectStep(state, ds, def, qs) as Extract<DoQuestStep, { kind: 'object' }> | null;
    if (obj && !skipObj?.has(obj.objectEntry)) return obj;
    if (!opts?.skipBuy) {
      const buy = buyStep(state, ds, def);
      if (buy) return buy;
    }
    const goLoot = itemGoStep(state, ds, def) as Extract<DoQuestStep, { kind: 'object' }> | null;
    if (goLoot && !skipObj?.has(goLoot.objectEntry)) return goLoot;
    const fight = fightStep(state, ds, def, qs, opts);
    if (fight) return fight;
    if (!opts?.skipBuy) {
      const vendorTravel = vendorTravelStep(state, ds, def);
      if (vendorTravel) return vendorTravel;
    }
    const farmTravel = farmTravelStep(state, ds, def, opts);
    if (farmTravel) return farmTravel;
  }

  const dungeon = dungeonOnlyWork(state, ds, def, qs);
  if (dungeon) return { kind: 'blocked', reason: dungeon };

  const skip = questWorkSkipReason(
    ds, def, qs, ownedOf(state), state.char.zoneId, state.questlog, state.char.level,
    auraIdsForSnapshot(state.char.activeAuras),
  );
  if (skip.routeZone && skip.routeZone !== state.char.zoneId) {
    return { kind: 'travel', zoneId: skip.routeZone, reason: skip.reason };
  }
  return { kind: 'blocked', reason: humanSkip(ds, def, skip.reason, lootSnapFor(ds, state), ownedOf(state)) };
}

// Whether the quest-log Do Quest button should show. Matches what the pin planner can actually run.
// Talk intros count even before accept. Buy-from-vendor is a real step (beer / materials).
export function questHasDoableStep(
  state: GameState,
  ds: DataStore,
  entry: number,
): boolean {
  const dq = nextDoQuestStep(state, ds, entry);
  if (dq.kind === 'done' || dq.kind === 'blocked' || dq.kind === 'abandon') return false;
  if (dq.kind === 'accept') {
    const def = ds.quest(entry);
    if (!def) return false;
    if (isTalkToNpcQuest(def) || isEventTalkQuest(def)) return true;
    return questHasBakedPath(
      ds, def, state.questlog, ownedOf(state), state.char.zoneId, state.char.level,
      auraIdsForSnapshot(state.char.activeAuras),
    ).ok;
  }
  return true;
}

function talkStep(def: QuestDef, qs: QuestState): DoQuestStep | null {
  if (qs.status !== 'active') return null;
  if (isTalkToNpcQuest(def) && qs.talked !== true) return { kind: 'talk' };
  if (isEventTalkQuest(def) && qs.explored !== true) return { kind: 'talk' };
  return null;
}

function garmentsStep(state: GameState, def: QuestDef): DoQuestStep | null {
  const patient = GARMENTS_QUEST_PATIENT[def.entry | 0];
  if (patient == null) return null;
  const sb = state.spellbook;
  if (knows(sb, SPELL_LESSER_HEAL_R2)) {
    return { kind: 'garments', spell: SPELL_LESSER_HEAL_R2, creature: patient };
  }
  if (knows(sb, SPELL_FORTITUDE_R1)) {
    return { kind: 'garments', spell: SPELL_FORTITUDE_R1, creature: patient };
  }
  return null;
}

function ownedOf(state: GameState) {
  return ownedInventory(state.inventory, state.keyring, mailboxAsInventory(state.mailbox ?? []));
}

function missingStartItem(state: GameState, def: QuestDef): number | null {
  if (!isItemStartedQuest(def)) return null;
  const item = itemStartRequiredItem(def);
  if (item == null) return null;
  const need = def.srcItem?.item === item && def.srcItem.count > 0 ? def.srcItem.count : 1;
  if (countItem(ownedOf(state), item) >= need) return null;
  return item;
}

const TEAM_ALLIANCE = 469;
const TEAM_HORDE = 67;
const startDropperCache = new Map<string, number[]>();
const knownCreaturesCache = new WeakMap<DataStore, number[]>();
const conditionTypeCache = new WeakMap<DataStore, Map<number, ConditionDef>>();

type AcquireOpts = {
  skipBuy?: boolean;
  skipObjects?: ReadonlySet<number>;
  skipCreatures?: ReadonlySet<number>;
};

function conditionDefOf(ds: DataStore, conditionId: number): ConditionDef | null {
  let map = conditionTypeCache.get(ds);
  if (!map) {
    map = new Map();
    for (const c of ds.conditionsList()) map.set(c.id, c);
    conditionTypeCache.set(ds, map);
  }
  return map.get(conditionId) ?? null;
}

function conditionTypeOf(ds: DataStore, conditionId: number): number {
  return conditionDefOf(ds, conditionId)?.type ?? 0;
}

function snapAuraKey(snap: ConditionSnapshot): string {
  const auras = snap.auras;
  if (!auras) return '';
  const ids = Array.isArray(auras) ? auras.slice() : [...auras];
  ids.sort((a, b) => a - b);
  return ids.join(',');
}

function baggedAdCommissionItem(state: GameState, ds: DataStore): number | null {
  for (const v of Object.values(state.char.equipped ?? {})) {
    const e = equippedEntry(v);
    if (e != null && itemGrantsAdCommissionAura(ds.item(e))) return null;
  }
  for (const s of state.inventory.stacks) {
    if (s.count > 0 && itemGrantsAdCommissionAura(ds.item(s.item))) return s.item;
  }
  return null;
}

function creatureDropsItemViaAdCommission(ds: DataStore, ce: number, itemId: number): boolean {
  const cr = ds.creature(ce);
  if (!cr) return false;
  if (!ds.lootHasItem(cr.lootId, itemId)) return false;
  const table = ds.lootTable(cr.lootId);
  for (let i = 0; i < table.length; i++) {
    const d = table[i];
    if (d.item !== itemId) continue;
    const cid = (d.conditionId ?? 0) | 0;
    if (cid && conditionTypeOf(ds, cid) === CONDITION.AD_COMMISSION_AURA) return true;
  }
  return false;
}

function unmetNeedsAdCommission(
  ds: DataStore,
  unmetItems: readonly { item: number }[],
  creatures: readonly number[],
): boolean {
  for (const it of unmetItems) {
    for (const ce of creatures) {
      if (creatureDropsItemViaAdCommission(ds, ce, it.item)) return true;
    }
  }
  return false;
}

function creatureUnmetBlockedByAdCommission(
  ds: DataStore,
  ce: number,
  unmetItems: readonly { item: number }[],
  snap: ConditionSnapshot,
): boolean {
  if (snapshotHasAdCommissionAura(snap)) return false;
  let saw = false;
  for (const it of unmetItems) {
    if (!creatureDropsItemViaAdCommission(ds, ce, it.item)) continue;
    saw = true;
    if (itemChanceOnCreature(ds, ce, it.item, snap) > 0) return false;
  }
  return saw;
}

function adCommissionEquipStep(
  state: GameState,
  ds: DataStore,
  def: QuestDef,
  unmetItems: readonly { item: number }[],
  snap: ConditionSnapshot,
  huntEntries: readonly number[],
): DoQuestStep | null {
  if (unmetItems.length === 0) return null;
  if (snapshotHasAdCommissionAura(snap)) return null;
  if (!unmetNeedsAdCommission(ds, unmetItems, [...huntEntries, ...(def.farm ?? [])])) return null;
  const bagged = baggedAdCommissionItem(state, ds);
  if (bagged == null) return null;
  return { kind: 'equip', itemEntry: bagged };
}

function lootSnapFor(ds: DataStore, state: GameState): ConditionSnapshot {
  const team = factionOf(ds, state.char.race) === 'horde' ? TEAM_HORDE : TEAM_ALLIANCE;
  const items: Record<number, number> = {};
  for (const s of state.inventory.stacks) items[s.item] = (items[s.item] ?? 0) + s.count;
  for (const s of (state.keyring ?? { stacks: [] }).stacks) items[s.item] = (items[s.item] ?? 0) + s.count;
  const bankItems: Record<number, number> = {};
  for (const s of state.bank.stacks) bankItems[s.item] = (bankItems[s.item] ?? 0) + s.count;
  return {
    ...questConditionSnapshot(
      state.questlog,
      state.char.level,
      canTakeQuestForCondition(ds, state.char, state.questlog),
      state.worldStates,
    ),
    team,
    items,
    bankItems,
    pvpRank: calculateHonorRank(state.char.honor?.rp ?? 0).rank,
    auras: auraIdsForSnapshot(state.char.activeAuras),
  };
}

function itemChanceOnCreature(
  ds: DataStore,
  ce: number,
  itemId: number,
  snap: ConditionSnapshot,
): number {
  const cr = ds.creature(ce);
  if (!cr) return 0;
  // Reject off the reverse index before decoding: this runs per creature per unmet item.
  if (!ds.lootHasItem(cr.lootId, itemId)) return 0;
  let best = 0;
  const table = ds.lootTable(cr.lootId);
  const len = table.length;
  for (let i = 0; i < len; i++) {
    const d = table[i];
    if (d.item !== itemId) continue;
    if (!lootDropAllowed(ds, d.conditionId, snap)) continue;
    const mag = d.chance < 0 ? -d.chance : d.chance;
    if ((d.groupId ?? 0) !== 0 && mag === 0) {
      if (best < 1) best = 1;
    } else {
      if (best < mag) best = mag;
    }
  }
  return best;
}

/** Creature templates that can drop `itemId` — huntable, spatial spawns, and loot-id templates. */
function knownCreatureEntries(ds: DataStore): number[] {
  const hit = knownCreaturesCache.get(ds);
  if (hit) return hit;
  const seen = new Set<number>();
  for (const z of ds.zones()) {
    for (const e of z.huntable ?? []) seen.add(e);
    for (const s of z.spawns ?? []) seen.add(s.entry);
  }
  for (const id of ds.lootTemplateIds()) {
    const s = String(id);
    if (s.startsWith('go:')) continue;
    const n = Number(s);
    if (Number.isFinite(n) && ds.creature(n)) seen.add(n);
  }
  const out = [...seen];
  if (ds.lootAttached()) knownCreaturesCache.set(ds, out);
  return out;
}

// knownCreatureEntries keyed as ds.lootKeysForItem answers: lootId → the creatures reading that
// table, so a shortlist decodes only what can hold the item. Scoring all 16k scanned 11.95M rows.
const knownByLootIdCache = new WeakMap<DataStore, { gen: number; byLootId: Map<number, number[]> }>();

function knownByLootId(ds: DataStore): Map<number, number[]> {
  const gen = ds.zoneWorldGen();
  const hit = knownByLootIdCache.get(ds);
  if (hit && hit.gen === gen) return hit.byLootId;
  const byLootId = new Map<number, number[]>();
  for (const ce of knownCreatureEntries(ds)) {
    // No lootId is no loot: itemChanceOnCreature read [] and scored 0 for these.
    const lootId = ds.creature(ce)?.lootId ?? 0;
    if (!lootId) continue;
    let list = byLootId.get(lootId);
    if (list === undefined) {
      list = [];
      byLootId.set(lootId, list);
    }
    list.push(ce);
  }
  knownByLootIdCache.set(ds, { gen, byLootId });
  return byLootId;
}

/** Build the known-creature map ahead of the first Quest Log paint (bootData's idle warm). */
export function warmDoQuestDropperIndex(ds: DataStore): void {
  knownByLootId(ds);
}

/** Known creatures whose table can hold `itemId`. Deduped: one creature, one score. */
function knownCandidates(ds: DataStore, itemId: number): Set<number> {
  const byLootId = knownByLootId(ds);
  const out = new Set<number>();
  for (const lootId of ds.lootKeysForItem(itemId)) {
    // A prefixed key (go:/item:/skinning:…) is never a creature lootId — normalizeLootKey
    // leaves only those as strings, and this index holds creature.lootId numbers.
    if (typeof lootId !== 'number') continue;
    for (const ce of byLootId.get(lootId) ?? []) out.add(ce);
  }
  return out;
}

function creatureDroppersForItem(
  ds: DataStore,
  itemId: number,
  snap: ConditionSnapshot,
  playerLevel: number,
): number[] {
  const key = `${itemId}:${snap.team ?? 0}:${playerLevel | 0}:${snapAuraKey(snap)}`;
  const cached = startDropperCache.get(key);
  if (cached) return cached;

  const scored: { ce: number; chance: number; level: number; rank: number }[] = [];

  for (const ce of knownCandidates(ds, itemId)) {
    const chance = itemChanceOnCreature(ds, ce, itemId, snap);
    if (chance <= 0) continue;
    const cr = ds.creature(ce);
    if (cr) {
      scored.push({ ce, chance, level: creatureFarmLevel(cr), rank: creatureFarmRank(cr) });
    }
  }
  
  const floor = dropperNoiseFloor(ds, itemId, snap);
  const out = scored
    .filter((s) => s.chance >= floor)
    .sort((a, b) => compareQuestDroppers(a, b, playerLevel) || a.ce - b.ce)
    .map((s) => s.ce);
  if (ds.lootAttached()) startDropperCache.set(key, out);
  return out;
}

function zoneObjectWithItem(
  ds: DataStore,
  zoneId: string,
  itemId: number,
  snap: ConditionSnapshot,
  skip?: ReadonlySet<number>,
): number | null {
  const objects = ds.zone(zoneId)?.objects;
  if (!objects) return null;
  const len = objects.length;
  for (let i = 0; i < len; i++) {
    const ge = objects[i];
    if (skip?.has(ge)) continue;
    const go = ds.gameObject(ge);
    if (!go?.lootId) continue;
    
    let hasIt = false;
    const table1 = ds.lootTable(`go:${go.lootId}`);
    for (let j = 0; j < table1.length; j++) {
      const d = table1[j];
      if (lootRowIsQuestItemSource(d, itemId) && lootDropAllowed(ds, d.conditionId, snap)) {
        hasIt = true; break;
      }
    }
    if (hasIt) return ge;
  }
  return null;
}

const worldHostedCache = new WeakMap<DataStore, Set<number>>();
/** Every creature the world model places in SOME zone (huntable list or spatial spawn). */
function worldHosted(ds: DataStore): Set<number> {
  let set = worldHostedCache.get(ds);
  if (!set) {
    set = new Set<number>();
    for (const z of ds.zones()) {
      for (const e of z.huntable ?? []) set.add(e);
      for (const sp of z.spawns ?? []) set.add(sp.entry);
    }
    worldHostedCache.set(ds, set);
  }
  return set;
}

function zonesHostingCreature(ds: DataStore, ce: number): string[] {
  const out: string[] = [];
  for (const z of ds.zones()) {
    if ((z.huntable ?? []).includes(ce)) out.push(z.id);
    else if ((z.spawns ?? []).some((s) => s.entry === ce)) out.push(z.id);
  }
  return out;
}

function pickFightable(
  ds: DataStore,
  state: GameState,
  droppers: readonly number[],
  skip?: ReadonlySet<number>,
): number | null {
  const zone = ds.zone(state.char.zoneId);
  const here = new Set<number>([
    ...(zone?.huntable ?? []),
    ...((zone?.spawns ?? []).map((s) => s.entry)),
  ]);
  const race = state.char.race;
  // A dropper the world model places in no zone cannot be pulled outdoors at all — that is how
  // Eldreth Wraith (Scholomance) and Theka's shapeshift became "the next quest fight".
  const hosted = worldHosted(ds);
  const usable = droppers.filter((ce) =>
    !skip?.has(ce) && ds.creature(ce) && hosted.has(ce)
    && !ds.isInstanceCreature(ce) && !ds.isBattlegroundCreature(ce)
    && canAttackCreature(ds, race, ce));
  const local = usable.filter((ce) => here.has(ce));
  return local[0] ?? usable[0] ?? null;
}

function acquireItemStep(
  state: GameState,
  ds: DataStore,
  def: QuestDef,
  itemId: number,
  opts?: AcquireOpts,
): DoQuestStep | null {
  const snap = lootSnapFor(ds, state);
  const itemName = ds.item(itemId)?.name ?? `item ${itemId}`;
  if (!opts?.skipBuy) {
    const need = Math.max(1, (def.srcItem?.item === itemId && def.srcItem.count > 0 ? def.srcItem.count : 1)
      - countItem(ownedOf(state), itemId));
    const local = affordableBuy(state, ds, itemId, need);
    if (local) return local;
  }
  const goHere = zoneObjectWithItem(ds, state.char.zoneId, itemId, snap, opts?.skipObjects);
  if (goHere != null) return { kind: 'object', objectEntry: goHere };

  const droppers = creatureDroppersForItem(ds, itemId, snap, state.char.level);
  const localFight = pickFightable(ds, state, droppers, opts?.skipCreatures);
  const zone = ds.zone(state.char.zoneId);
  const here = new Set<number>([
    ...(zone?.huntable ?? []),
    ...((zone?.spawns ?? []).map((s) => s.entry)),
  ]);
  if (localFight != null && here.has(localFight)) return { kind: 'fight', creatureEntry: localFight };
  if (localFight != null && (def.starterZones ?? []).includes(state.char.zoneId)) {
    return { kind: 'fight', creatureEntry: localFight };
  }

  if (!opts?.skipBuy) {
    const hit = findVendorSelling(ds, itemId, state.char.zoneId);
    if (hit && hit.zoneId !== state.char.zoneId) {
      const itemDef = ds.item(itemId);
      if (itemDef && itemDef.buyPrice > 0) {
        return {
          kind: 'travel',
          zoneId: hit.zoneId,
          reason: `Travel to ${ds.zone(hit.zoneId)?.name ?? hit.zoneId} for ${itemName}`,
        };
      }
    }
  }

  for (const z of ds.zones()) {
    if (z.id === state.char.zoneId) continue;
    if (zoneObjectWithItem(ds, z.id, itemId, snap, opts?.skipObjects)) {
      return { kind: 'travel', zoneId: z.id, reason: `Travel to ${z.name ?? z.id} for ${itemName}` };
    }
  }
  for (const ce of droppers) {
    if (opts?.skipCreatures?.has(ce)) continue;
    const dest = zonesHostingCreature(ds, ce).find((z) => z !== state.char.zoneId);
    if (dest) {
      return {
        kind: 'travel',
        zoneId: dest,
        reason: `Travel to ${ds.zone(dest)?.name ?? dest} for ${ds.creature(ce)?.name ?? 'the dropper'}`,
      };
    }
  }
  if (localFight != null) return { kind: 'fight', creatureEntry: localFight };

  const starters = def.starterZones ?? [];
  if (starters.length > 0 && !starters.includes(state.char.zoneId)) {
    return {
      kind: 'travel',
      zoneId: starters[0]!,
      reason: `Travel to ${ds.zone(starters[0])?.name ?? starters[0]} for ${itemName}`,
    };
  }
  return { kind: 'blocked', reason: `Need ${itemName} to start this quest` };
}

function providedItemId(def: QuestDef): number | undefined {
  const src = def.srcItem?.item;
  if (src && src > 0) return src;
  if (def.startedByItem != null && def.startedByItem > 0) return def.startedByItem;
  return undefined;
}

function isProvidedItem(def: QuestDef, item: number): boolean {
  return providedItemId(def) === item;
}

function missingProvidedSrc(state: GameState, def: QuestDef): boolean {
  const src = def.srcItem;
  if (!src?.item) return false;
  const need = src.count > 0 ? src.count : 1;
  // Bags + keyring: 6 quests hand you a BagFamily KEYS item, which never lands in the bags.
  // Cite: plan.ts:745, the same read that reported locked-no-key forever.
  return countItem(ownedOf(state), src.item) < need;
}

function goStarterInZone(ds: DataStore, def: QuestDef, zoneId: string): number | null {
  const listed = ds.zone(zoneId)?.objects ?? [];
  const ids = [def.goStarter, ...(def.goStarterEntries ?? [])].filter((e): e is number => !!e && e > 0);
  for (const id of ids) if (listed.includes(id)) return id;
  return null;
}

/**
 * The creature to pull for a locked object target's key. The skip line already names the key and its
 * dropper (quests.ts:1035); without this the planner printed that and stopped. Cite: openLock.ts.
 */
export function questLockKeyFightTarget(
  state: GameState,
  ds: DataStore,
  def: QuestDef,
  qs: QuestState,
  skip?: ReadonlySet<number>,
): number | null {
  for (const go of lockedGosFor(state, ds, def, qs)) {
    const mob = goLockKeyMob(state, ds, go, skip);
    if (mob != null) return mob;
  }
  return null;
}

/** The key this object wants, or null when it opens free or the key is already in the bags. */
function goMissingKeyEntry(
  state: GameState,
  ds: DataStore,
  go: ReturnType<DataStore['gameObject']>,
): number | null {
  if (!go || (go.lockId == null && !go.keyId)) return null;
  const lock = go.lockId != null ? ds.lock(go.lockId) : undefined;
  if (lock && canOpenLock({ lock, skillValueFor: () => undefined }).ok) return null;
  const keyEntry = go.keyId ?? (lock ? requiredKeyItemEntry(lock) : undefined);
  if (keyEntry == null || countItem(ownedOf(state), keyEntry) > 0) return null;
  return keyEntry;
}

/** The mob to pull for this object's key: null when it opens free or no local dropper carries one. */
function goLockKeyMob(
  state: GameState,
  ds: DataStore,
  go: ReturnType<DataStore['gameObject']>,
  skip?: ReadonlySet<number>,
): number | null {
  const keyEntry = goMissingKeyEntry(state, ds, go);
  if (keyEntry == null) return null;
  const snap = lootSnapFor(ds, state);
  return pickFightable(ds, state, creatureDroppersForItem(ds, keyEntry, snap, state.char.level), skip);
}

/**
 * The container here that holds this object's key. Sleepers' Cache wants Gatekeeper's Key, which is
 * itself inside a chest two rooms away, so the chain is container to key to container.
 */
function goLockKeyContainer(
  state: GameState,
  ds: DataStore,
  go: ReturnType<DataStore['gameObject']>,
  skip?: ReadonlySet<number>,
): number | null {
  const keyEntry = goMissingKeyEntry(state, ds, go);
  if (keyEntry == null) return null;
  const snap = lootSnapFor(ds, state);
  return zoneObjectWithItem(ds, state.char.zoneId, keyEntry, snap, skip);
}

/** The object to open for a blocked container's key, when a mob does not carry it. */
export function questLockKeyObjectStep(
  state: GameState,
  ds: DataStore,
  def: QuestDef,
  qs: QuestState,
  skip?: ReadonlySet<number>,
): number | null {
  for (const go of lockedGosFor(state, ds, def, qs)) {
    const ge = goLockKeyContainer(state, ds, go, skip);
    if (ge != null) return ge;
  }
  return null;
}

/** Every GameObject this quest must open here: its objectTargets plus the item container. */
function lockedGosFor(
  state: GameState,
  ds: DataStore,
  def: QuestDef,
  qs: QuestState,
): ReturnType<DataStore['gameObject']>[] {
  const listed = ds.zone(state.char.zoneId)?.objects ?? [];
  const out: ReturnType<DataStore['gameObject']>[] = [];
  for (const ot of def.objectTargets ?? []) {
    if ((qs.objects?.[String(ot.objectEntry)] ?? 0) >= ot.count) continue;
    if (!listed.includes(ot.objectEntry)) continue;
    out.push(ds.gameObject(ot.objectEntry));
  }
  const container = itemGoStep(state, ds, def);
  if (container) out.push(ds.gameObject(container.objectEntry));
  return out;
}

function localObjectStep(
  state: GameState,
  ds: DataStore,
  def: QuestDef,
  qs: QuestState,
): Extract<DoQuestStep, { kind: 'object' }> | null {
  const listed = ds.zone(state.char.zoneId)?.objects ?? [];
  for (const ot of def.objectTargets ?? []) {
    const cur = qs.objects?.[String(ot.objectEntry)] ?? 0;
    if (cur >= ot.count) continue;
    if (listed.includes(ot.objectEntry) && ds.gameObject(ot.objectEntry)) {
      return { kind: 'object', objectEntry: ot.objectEntry };
    }
  }
  if (def.goStarter && !getQuest(state.questlog, def.entry) && listed.includes(def.goStarter)) {
    return { kind: 'object', objectEntry: def.goStarter };
  }
  return null;
}

export function itemGoStep(
  state: GameState,
  ds: DataStore,
  def: QuestDef,
): Extract<DoQuestStep, { kind: 'object' }> | null {
  // Grape buckets / pumpkins: quest-gated GO loot, not objectTargets. World chests that
  // happen to drop a needed trade good (Solid Chest → Gold Bar) are not a farm source.
  const listed = ds.zone(state.char.zoneId)?.objects ?? [];
  const snap = lootSnapFor(ds, state);
  const owned = ownedOf(state);
  for (const it of def.itemTargets ?? []) {
    if (countItem(owned, it.item) >= it.count) continue;
    if (isProvidedItem(def, it.item)) continue;
    for (const ge of listed) {
      const go = ds.gameObject(ge);
      if (!go?.lootId) continue;
      const rows = ds.lootTable(`go:${go.lootId}`);
      if (rows.some((d) => lootRowIsQuestItemSource(d, it.item) && lootDropAllowed(ds, d.conditionId, snap))) {
        return { kind: 'object', objectEntry: ge };
      }
    }
  }
  return null;
}

function affordableBuy(
  state: GameState,
  ds: DataStore,
  itemId: number,
  need: number,
): Extract<DoQuestStep, { kind: 'buy' }> | null {
  if (need <= 0) return null;
  const def = ds.item(itemId);
  if (!def || def.buyPrice <= 0) return null;
  const vendors = zoneVendors(ds, state.char.zoneId);
  const vendor = vendors.find((v) => v.items.includes(itemId));
  if (!vendor) return null;
  const buyCount = Math.max(1, def.buyCount ?? 1);
  const purchases = Math.max(1, Math.ceil(need / buyCount));
  if (state.char.gold < buyCostCopper(def, purchases)) return null;
  return { kind: 'buy', vendorEntry: vendor.entry, itemEntry: itemId, count: need };
}

/** Local merchant buy for an active quest. Auto Quest campaign calls this before farming. */
export function questVendorBuyStep(
  state: GameState,
  ds: DataStore,
  entry: number,
): Extract<DoQuestStep, { kind: 'buy' }> | null {
  const def = ds.quest(entry);
  if (!def) return null;
  const qs = getQuest(state.questlog, entry);
  if (!qs || qs.status !== 'active') return null;
  const buy = buyStep(state, ds, def);
  return buy?.kind === 'buy' ? buy : null;
}

function buyStep(state: GameState, ds: DataStore, def: QuestDef): DoQuestStep | null {
  const owned = ownedOf(state);
  for (const it of def.itemTargets ?? []) {
    const have = countItem(owned, it.item);
    if (have >= it.count) continue;
    if (isProvidedItem(def, it.item)) continue;
    const buy = affordableBuy(state, ds, it.item, it.count - have);
    if (buy) return buy;
  }
  return null;
}

function vendorTravelStep(state: GameState, ds: DataStore, def: QuestDef): DoQuestStep | null {
  const owned = ownedOf(state);
  for (const it of def.itemTargets ?? []) {
    const have = countItem(owned, it.item);
    if (have >= it.count) continue;
    if (isProvidedItem(def, it.item)) continue;
    const itemDef = ds.item(it.item);
    if (!itemDef || itemDef.buyPrice <= 0) continue;
    const hit = findVendorSelling(ds, it.item, state.char.zoneId);
    if (!hit || hit.zoneId === state.char.zoneId) continue;
    const buyCount = Math.max(1, itemDef.buyCount ?? 1);
    const purchases = Math.max(1, Math.ceil((it.count - have) / buyCount));
    if (state.char.gold < buyCostCopper(itemDef, purchases)) continue;
    const itemName = itemDef.name ?? `item ${it.item}`;
    const zoneName = ds.zone(hit.zoneId)?.name ?? hit.zoneId;
    return {
      kind: 'travel',
      zoneId: hit.zoneId,
      reason: `Buy ${itemName} in ${zoneName}`,
    };
  }
  return null;
}

/** Any row for `itemId` this creature could actually roll right now. */
function creatureRowAllowsItem(
  ds: DataStore,
  ce: number,
  itemId: number,
  snap: ConditionSnapshot,
): boolean {
  const lootId = ds.creature(ce)?.lootId;
  if (lootId == null || !ds.lootHasItem(lootId, itemId)) return false;
  return ds.lootTable(lootId).some((d) => d.item === itemId && lootDropAllowed(ds, d.conditionId, snap));
}

/**
 * A farm entry that provably cannot produce anything still needed. Two shapes, both measured:
 * the Malformed Defias Drone carries the Defias Tower Key at 1/1 while the journal is in a chest,
 * and a Frostsaber Stalker's E'ko row is condition-gated on the Cache of Mau'ari we do not hold
 * (conditions 207/208/216) — the roll refuses it too, so the pull is pure grind either way.
 * A creature whose loot lists none of this quest's items is unreadable, not hopeless: it stays.
 */
function farmCandidateIsHopeless(
  ds: DataStore,
  def: QuestDef,
  ce: number,
  unmetItems: readonly { item: number; count: number }[],
  owned: Inventory,
  snap: ConditionSnapshot,
): boolean {
  const lootId = ds.creature(ce)?.lootId;
  if (lootId == null) return false;
  // A row below the noise floor still rolls — only an absent or condition-blocked row does not.
  if (unmetItems.some((it) => creatureRowAllowsItem(ds, ce, it.item, snap))) return false;
  if (unmetItems.some((it) => ds.lootHasItem(lootId, it.item))) return true;
  // A filled objective is filled however it arrived: Catelyn's Blade is the srcItem of The Curse
  // of the Tides AND a target, so "Pretty Boy" Duncan carries nothing once we hold it.
  return (def.itemTargets ?? []).some(
    (it) => countItem(owned, it.item) >= it.count && ds.lootHasItem(lootId, it.item),
  );
}

function fightStep(
  state: GameState,
  ds: DataStore,
  def: QuestDef,
  qs: QuestState,
  opts?: AcquireOpts,
): DoQuestStep | null {
  const skip = opts?.skipCreatures;
  const hunt = huntableCreatures(ds, state.char.zoneId, state.questlog, state.char.race);
  const summoned = new Set(corpseUseSummonedEntries(ds, def));
  const salt = dropperPickSalt(state);
  const killable: { entry: number; level: number; chance: number; rank: number }[] = [];
  for (const kt of creatureCreditTargets(def)) {
    if ((qs.kills[String(kt.creatureEntry)] ?? 0) >= kt.count) continue;
    if (skip?.has(kt.creatureEntry)) continue;
    if (summoned.has(kt.creatureEntry)) continue;
    // An instance-only target has no outdoor pull, and the run would open a 1v1 on a dungeon boss.
    // A battleground-only one is the same shape on a different map.
    if (ds.isInstanceCreature(kt.creatureEntry)) continue;
    if (ds.isBattlegroundCreature(kt.creatureEntry)) continue;
    // A doodad the client cannot even target is not a fight, however named — the Andorhal Towers,
    // the AV air-commander triggers, the Capture Quest Doodads. Cite: Relations.cpp:365.
    if (unitCannotBeAttacked(ds.creature(kt.creatureEntry))) continue;
    // Friendly + noXp: beginFight refuses it as script credit, so proposing it strands the quest.
    if (isScriptCreditOnlyTarget(ds, kt.creatureEntry, state.questlog)) continue;
    // Named kill target is the quest — fight it even when it is not on zone.huntable.
    const cr = ds.creature(kt.creatureEntry);
    if (cr) killable.push({ entry: kt.creatureEntry, level: creatureFarmLevel(cr), chance: 0, rank: creatureFarmRank(cr) });
  }
  if (killable.length > 0) {
    // Several unmet kill objectives: rotate among the near-equal ones that are actually here, so a
    // multi-template objective does not open on its first-listed entry every pull.
    const here = new Set(hunt.map((c) => c.entry));
    const local = killable.filter((k) => here.has(k.entry));
    if (local.length === 0) return { kind: 'fight', creatureEntry: killable[0].entry };
    local.sort((a, b) => compareQuestDroppers(a, b, state.char.level) || a.entry - b.entry);
    return { kind: 'fight', creatureEntry: pickQuestDropper(local, state.char.level, salt)!.entry };
  }
  const farm = corpseUseFightEntries(ds, def, qs, state.inventory);
  if (farm.length) {
    const zone = ds.zone(state.char.zoneId);
    const here = new Set<number>([
      ...(zone?.huntable ?? []),
      ...((zone?.spawns ?? []).map((s) => s.entry)),
    ]);
    const local = farm.find((ce) => here.has(ce) && ds.creature(ce) && !skip?.has(ce));
    if (local != null) return { kind: 'fight', creatureEntry: local };
  }
  const snap = lootSnapFor(ds, state);
  // Item objectives still short. farm[] is baked from itemTargets alone
  // (src/dev/store/rules/core/quests.mjs:271), so all met = no dropper fight left to earn.
  const owned = ownedOf(state);
  const unmetItems = (def.itemTargets ?? []).filter(
    (it) => !isProvidedItem(def, it.item) && countItem(owned, it.item) < it.count,
  );
  const huntEntries = hunt.map((c) => c.entry);
  const wear = adCommissionEquipStep(state, ds, def, unmetItems, snap, huntEntries);
  if (wear) return wear;
  const byEntry = new Map<number, { entry: number; level: number; chance: number; rank: number }>();
  for (const it of unmetItems) {
    const floor = dropperNoiseFloor(ds, it.item, snap);
    for (const c of hunt) {
      if (skip?.has(c.entry)) continue;
      const ch = itemChanceOnCreature(ds, c.entry, it.item, snap);
      if (ch <= 0 || ch < floor) continue;
      const prev = byEntry.get(c.entry);
      if (!prev || ch > prev.chance) {
        byEntry.set(c.entry, { entry: c.entry, level: c.level, chance: ch, rank: creatureFarmRank(c) });
      }
    }
  }
  const usable = [...byEntry.values()];
  usable.sort((a, b) => compareQuestDroppers(a, b, state.char.level) || a.entry - b.entry);
  const dropper = pickQuestDropper(usable, state.char.level, salt);
  if (dropper) return { kind: 'fight', creatureEntry: dropper.entry };
  if (unmetItems.length === 0) return null;
  // farm[] is one union over every itemTarget, and many named templates are not on zone.huntable.
  // Prefer an entry that drops what we still need; 40 of 1366 farm quests gate it behind a condition.
  const farmScored: { ce: number; chance: number; level: number; rank: number }[] = [];
  for (const ce of def.farm ?? []) {
    if (skip?.has(ce)) continue;
    const cr = ds.creature(ce);
    if (!cr || ds.isInstanceCreature(ce) || ds.isBattlegroundCreature(ce)) continue;
    if (creatureUnmetBlockedByAdCommission(ds, ce, unmetItems, snap)) continue;
    let ch = 0;
    for (const it of unmetItems) {
      const c = itemChanceOnCreature(ds, ce, it.item, snap);
      if (c >= dropperNoiseFloor(ds, it.item, snap)) ch = Math.max(ch, c);
    }
    farmScored.push({ ce, chance: ch, level: creatureFarmLevel(cr), rank: creatureFarmRank(cr) });
  }
  const farmDrop = farmScored.filter((s) => s.chance > 0);
  const farmPool = farmDrop.length > 0
    ? farmDrop
    : farmScored.filter((s) => !farmCandidateIsHopeless(ds, def, s.ce, unmetItems, owned, snap));
  farmPool.sort((a, b) => compareQuestDroppers(a, b, state.char.level) || a.ce - b.ce);
  const farmPick = pickQuestDropper(farmPool, state.char.level, salt);
  if (farmPick) return { kind: 'fight', creatureEntry: farmPick.ce };
  for (const it of unmetItems) {
    const fight = pickFightable(ds, state, creatureDroppersForItem(ds, it.item, snap, state.char.level), skip);
    if (fight != null) return { kind: 'fight', creatureEntry: fight };
  }
  return null;
}

// Every remaining kill / item objective lives inside an instance, so the outdoor run has no pull to make.
// Returns the player-facing skip line naming the dungeon, or null.
function dungeonOnlyWork(
  state: GameState,
  ds: DataStore,
  def: QuestDef,
  qs: QuestState,
): string | null {
  let inside: number | null = null;
  let work = false;
  for (const kt of creatureCreditTargets(def)) {
    if ((qs.kills[String(kt.creatureEntry)] ?? 0) >= kt.count) continue;
    work = true;
    if (!ds.isInstanceCreature(kt.creatureEntry) && !ds.isBattlegroundCreature(kt.creatureEntry)) return null;
    if (inside == null) inside = kt.creatureEntry;
  }
  const snap = lootSnapFor(ds, state);
  const owned = ownedOf(state);
  for (const it of def.itemTargets ?? []) {
    if (isProvidedItem(def, it.item)) continue;
    if (countItem(owned, it.item) >= it.count) continue;
    work = true;
    const droppers = creatureDroppersForItem(ds, it.item, snap, state.char.level);
    // No dropper at all is "no baked path", a different skip — leave that line to questWorkSkipReason.
    if (droppers.length === 0) return null;
    if (droppers.some((ce) => !ds.isInstanceCreature(ce) && !ds.isBattlegroundCreature(ce))) return null;
    if (inside == null) inside = droppers[0];
  }
  if (!work || inside == null) return null;
  // A battleground quest names the battleground and says so — it is not a dungeon.
  const bg = ds.battlegroundForCreature(inside);
  if (bg) return `"${def.title}" is a battleground quest, run it inside ${bg}`;
  const name = ds.instanceForCreature(inside)?.name;
  return name
    ? `"${def.title}" is a dungeon quest, run it inside ${name}`
    : `"${def.title}" is a dungeon quest`;
}

// Farm entries for one item, ordered the way fightStep picks: noise floor first, then compareQuestDroppers,
// then the salted pick moved to the front, so the travel hop names the mob the fight will actually open on.
function rankFarmForItem(
  ds: DataStore,
  farm: readonly number[],
  itemId: number,
  snap: ConditionSnapshot,
  playerLevel: number,
  salt: number,
): number[] {
  const scored: { ce: number; chance: number; level: number; rank: number }[] = [];
  const floor = dropperNoiseFloor(ds, itemId, snap);
  for (const ce of farm) {
    const cr = ds.creature(ce);
    if (!cr) continue;
    const chance = itemChanceOnCreature(ds, ce, itemId, snap);
    scored.push({
      ce,
      chance: chance >= floor ? chance : 0,
      level: creatureFarmLevel(cr),
      rank: creatureFarmRank(cr),
    });
  }
  const drops = scored.filter((s) => s.chance > 0);
  const pool = drops.length > 0 ? drops : scored;
  pool.sort((a, b) => compareQuestDroppers(a, b, playerLevel) || a.ce - b.ce);
  const first = pickQuestDropper(pool, playerLevel, salt);
  return first ? [first.ce, ...pool.filter((s) => s !== first).map((s) => s.ce)] : [];
}

function farmTravelStep(
  state: GameState,
  ds: DataStore,
  def: QuestDef,
  opts?: AcquireOpts,
): DoQuestStep | null {
  const qs = getQuest(state.questlog, def.entry);
  if (qs) {
    for (const ce of corpseUseFightEntries(ds, def, qs, state.inventory)) {
      if (opts?.skipCreatures?.has(ce)) continue;
      const dest = zonesHostingCreature(ds, ce).find((z) => z !== state.char.zoneId);
      if (dest) {
        const mob = ds.creature(ce)?.name ?? `creature ${ce}`;
        return { kind: 'travel', zoneId: dest, reason: `Travel to ${ds.zone(dest)?.name ?? dest} for ${mob}` };
      }
    }
  }
  const snap = lootSnapFor(ds, state);
  const unmetItems = (def.itemTargets ?? []).filter(
    (it) => !isProvidedItem(def, it.item) && countItem(ownedOf(state), it.item) < it.count,
  );
  const bagged = baggedAdCommissionItem(state, ds);
  for (const it of def.itemTargets ?? []) {
    if (countItem(ownedOf(state), it.item) >= it.count) continue;
    if (isProvidedItem(def, it.item)) continue;
    const ces = (def.farm ?? []).length
      ? rankFarmForItem(ds, def.farm ?? [], it.item, snap, state.char.level, dropperPickSalt(state))
      : creatureDroppersForItem(ds, it.item, snap, state.char.level);
    for (const ce of ces) {
      if (opts?.skipCreatures?.has(ce)) continue;
      if (creatureUnmetBlockedByAdCommission(ds, ce, unmetItems, snap) && bagged == null) continue;
      const dest = zonesHostingCreature(ds, ce).find((z) => z !== state.char.zoneId);
      if (dest) {
        const mob = ds.creature(ce)?.name ?? `creature ${ce}`;
        return { kind: 'travel', zoneId: dest, reason: `Travel to ${ds.zone(dest)?.name ?? dest} for ${mob}` };
      }
    }
  }
  return null;
}

/** The condition row blocking every farm drop of `itemId`, or null when none is. */
function blockingLootCondition(
  ds: DataStore,
  def: QuestDef,
  itemId: number,
  snap: ConditionSnapshot,
): ConditionDef | null {
  let blocked: ConditionDef | null = null;
  for (const ce of def.farm ?? []) {
    const lootId = ds.creature(ce)?.lootId;
    if (lootId == null || !ds.lootHasItem(lootId, itemId)) continue;
    for (const d of ds.lootTable(lootId)) {
      if (d.item !== itemId) continue;
      if (lootDropAllowed(ds, d.conditionId, snap)) return null;
      blocked = blocked ?? conditionDefOf(ds, (d.conditionId ?? 0) | 0);
    }
  }
  return blocked;
}

/**
 * The step a condition-gated drop actually wants, named. The E'ko rows want the Cache of Mau'ari in
 * the bags (condition 207), the Deadwood feathers want quest 8460 rewarded (216). Cite:
 * conditions table type 2 ITEM / 3 ITEM_EQUIPPED / 8 QUESTREWARDED / 9 QUESTTAKEN.
 */
function conditionSkipLine(ds: DataStore, cond: ConditionDef, itemName: string): string | null {
  const t = cond.type | 0;
  if (t === CONDITION.ITEM || t === CONDITION.ITEM_WITH_BANK) {
    return `Carry ${ds.item(cond.value1)?.name ?? `item ${cond.value1}`} to loot ${itemName}`;
  }
  if (t === CONDITION.ITEM_EQUIPPED) {
    return `Equip ${ds.item(cond.value1)?.name ?? `item ${cond.value1}`} to loot ${itemName}`;
  }
  if (t === CONDITION.QUESTREWARDED) {
    return `Finish "${ds.quest(cond.value1)?.title ?? `quest ${cond.value1}`}" to loot ${itemName}`;
  }
  if (t === CONDITION.QUESTTAKEN) {
    return `Take "${ds.quest(cond.value1)?.title ?? `quest ${cond.value1}`}" to loot ${itemName}`;
  }
  return null;
}

function humanSkip(
  ds: DataStore,
  def: QuestDef,
  reason: string,
  snap: ConditionSnapshot,
  owned: Inventory,
): string {
  if (!/condition-satisfied dropper/i.test(reason)) return reason;
  const unmet = (def.itemTargets ?? []).filter((it) => !isProvidedItem(def, it.item));
  if (unmetNeedsAdCommission(ds, unmet, def.farm ?? [])) {
    const trinket = ds.item(12846)?.name ?? 'Argent Dawn Commission';
    const missing = unmet.map((it) => ds.item(it.item)?.name ?? `item ${it.item}`);
    if (missing.length) return `Wear ${trinket} to loot ${missing.join(', ')}`;
    return `Wear ${trinket}`;
  }
  // Name the gate, never the mob: "Kill Frostsaber Cub" sent the run back to a pull whose only
  // quest row is condition-blocked, which is the grind this reason exists to stop.
  for (const it of unmet) {
    if (countItem(owned, it.item) >= it.count) continue;
    const cond = blockingLootCondition(ds, def, it.item, snap);
    if (!cond) continue;
    const line = conditionSkipLine(ds, cond, ds.item(it.item)?.name ?? `item ${it.item}`);
    if (line) return line;
  }
  const farm = (def.farm ?? []).map((ce) => ds.creature(ce)?.name ?? `creature ${ce}`);
  if (farm.length) return `Kill ${farm[0]}`;
  const src = def.srcItem?.item;
  if (src && (def.itemTargets ?? []).some((it) => it.item === src)) {
    const nm = ds.item(src)?.name ?? `item ${src}`;
    return `Need ${nm} from ${def.starterName || 'the quest giver'}`;
  }
  const missing = (def.itemTargets ?? [])
    .filter((it) => !isProvidedItem(def, it.item))
    .map((it) => ds.item(it.item)?.name ?? `item ${it.item}`);
  if (missing.length === 0) return reason;
  return `Need ${missing.join(', ')} - not sold here and nothing here drops it.`;
}
