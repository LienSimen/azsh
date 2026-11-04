// Autopilot "Values": pure, read-only selectors that turn raw GameState + DataStore into
// the handful of facts the between-fight planner reasons about each step. Productionized
// from the dev bot (src/dev/bot/values.ts, which now re-exports this) so the shipped
// Auto Quest / Autofarm feature can reuse the exact same deterministic heuristics.
//
// Everything here is a *derivation*; nothing mutates. `buildView` snapshots the world once
// per planning step so the planner reads a consistent picture. PURE: no DOM/RNG/Date.

import type { DataStore } from '../data/dataStore.ts';
import type { GameState } from '../engine/game.ts';
import type { ItemDef, ItemSlot, EquipSlot, GatherNodeDef } from '../data/schema.ts';
import { maxHealth, maxPower, powerType, type EquippedMap } from '../domain/character/character.ts';
import { petPower } from '../domain/pet/pet.ts';
import { freeSlots } from '../domain/items/inventory.ts';
import { bagCapacity } from '../domain/items/equipment.ts';
import {
  huntableCreatures, zoneNodes, neighbourZones, questTargets,
  creatureAttackDistance, creatureAggroOnSight, zoneHasSpatialSpawns, pullEliteRank,
} from '../world/world.ts';
import {
  bagQuestStarts,
  offeredQuests,
  difficultyTier,
  lootChanceForItem,
  MIN_QUEST_DROPPER_CHANCE,
  compareQuestDroppers,
  pickQuestDropper,
  dropperPickSalt,
  dropperNoiseFloorFor,
} from '../quests/quests.ts';
import { itemStartGateMet } from '../domain/quests/questlog.ts';
import { questAcceptGate } from './questPolicy.ts';
import { auraIdsForSnapshot } from '../engine/spells/conditions.ts';
import type { DifficultyTier } from '../quests/quests.ts';
import { ownedInventory } from '../domain/items/keyring.ts';
import { mailboxAsInventory } from '../domain/economy/mail.ts';
import {
  canGather, professionSkillValue, nodeReady, isMiningPick, isSkinningKnife,
} from '../domain/professions/professions.ts';
import { rotationNodeUp } from '../domain/professions/rareNodes.ts';
import { companionLevel, companionSkillMap } from '../domain/bots/squad.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { goRuntimeAvailability } from '../domain/world/gameObjects.ts';
import { itemScore as legacyItemScore, fillEmptyEquipCandidate as newFillEmpty, findUpgrades } from '../domain/items/equipmentHelper.ts';
import { hasQuestForItem, questNeededItems } from '../domain/quests/questlog.ts';
import {
  autoGatherAllowed,
  gatherFilterSkills,
  normalizeGatherFilterConfig,
} from '../domain/professions/gatherFilter.ts';
import {
  companionsForOptionalUpgradeGuard,
  normalizeAutoDisenchantConfig,
  partyUpgradeEntries,
  playerEquipOptsFrom,
  type PartyEnchanter,
} from '../domain/professions/autoDisenchant.ts';
import { resolveRosterEnchanters } from '../domain/professions/partyDisenchant.ts';
import {
  dispositionForEntry,
  junkFilterFromLegacy,
  normalizeCharacterJunkFilterConfig,
  normalizeJunkFilterConfig,
  DEFAULT_CHARACTER_JUNK_FILTER_CONFIG,
  type JunkEvalContext,
  type JunkFilterConfig,
} from '../domain/items/junkFilter.ts';
import { primarySpec } from '../domain/rotation/spec.ts';
import { normalizeAutopilotConfig } from './config.ts';

/** A creature worth pulling, with its difficulty colour vs the player. */
export interface HuntTarget {
  entry: number;
  level: number;
  tier: DifficultyTier;
  forQuest: boolean; // advances an active quest (kill or item drop/pickup loot) → prioritise it
  /** True when this entry is an unmet kill objective (not only an item dropper). */
  questKill?: boolean;
  // Best free/quest-gated drop chance (%) among still-needed active quest itemTargets. Used so Autofarm
  // prefers Crag Boar (~52% ribs) over Small Crag Boar (0.02%).
  questDropChance?: number;
  /** CREATURE_ELITE_* (0 normal). Item-farm ranking prefers rank 0 over a higher-drop elite. */
  rank?: number;
  /** Unit::GetAttackDistance yards (System 9); level-diff scaled detection. */
  attackDistance?: number;
  /** false when ExtraFlags NO_AGGRO_ON_SIGHT — still pullable by the player. */
  aggroOnSight?: boolean;
  /**
   * True when the current zone has baked creature spawn positions (Wave 4C).
   * Spatial pull then uses attackDistance against those points; otherwise this
   * field is metadata only and hunt stays tier/list-based.
   */
  spatialReady?: boolean;
}

/** A filter-matched stack the planner can vendor for its unit sell price. */
export interface JunkStack {
  item: number;
  count: number;
  unitSell: number;
}

/** The per-step snapshot the planner reasons over. */
export interface BotView {
  level: number;
  gold: number;
  zoneId: string;
  /** dropperPickSalt(state): rotates bestHuntTarget's pick among near-equal quest mobs per fight. */
  pickSalt?: number;
  healthPct: number;   // 0..1 of max
  powerPct: number;    // 0..1 of max (rage users report 1 — mana isn't a gate for them)
  /**
   * Living pet's power as 0..1 of max, or 1 when there is no pet / it is dead / it has no
   * power pool. The planner had NO pet term at all, and `regenTick` — the only thing that
   * refills a pet — runs solely in the `wait` branch. So a warlock or hunter questing with a
   * healthy player never rested, and the pet's mana drained monotonically and never came back:
   * measured 377 -> 327 over 8 pulls with the player pinned at 100%, trending to zero, at
   * which point the pet stops casting entirely.
   * Reported as 1 (never a gate) for a dead pet, or the bot would rest forever on something
   * resting cannot fix.
   */
  petPowerPct: number;
  freeBagSlots: number;
  bagsFull: boolean;
  inCombatCorpse: boolean; // a skinnable corpse is pending
  junk: JunkStack[];       // junk-filter sell candidates
  turnInReady: number[];   // quest entries complete and ready to hand in
  acceptable: number[];    // quest entries offered here the planner should take (non-grey)
  hunt: HuntTarget[];      // safe, non-grey creatures to grind (quest mobs flagged)
  gatherable: number[];    // gather node ids the character can harvest here
  neighbours: string[];    // zone ids reachable from here
  objects: Array<{ entry: number; forQuest: boolean }>; // GameObject interacts still needed (quest pickups)
}

// ---- item helpers ----------------------------------------------------------

/** Grey/poor quality — mangosbot's "trash", sold to any vendor. */
export function isGrey(it: ItemDef | undefined): boolean {
  return !!it && it.quality === 0;
}

// Legacy crude score (used by some bot tests). New recommendations use the StatCompare-grounded itemValue +
// findUpgrades from equipmentHelper (which weights against the character's live stats).
export function itemScore(it: ItemDef): number {
  return legacyItemScore(it);
}

/** The paperdoll slots an item could occupy (rings/trinkets have two; a 2H takes the main hand). */
export function equipTargets(slot: ItemSlot): EquipSlot[] {
  switch (slot) {
    case 'finger': return ['finger1', 'finger2'];
    case 'trinket': return ['trinket1', 'trinket2'];
    case 'twohand': return ['mainhand'];
    case 'bag': return ['bag1', 'bag2', 'bag3', 'bag4'];
    default: return [slot];
  }
}

/**
 * A bag item worth equipping *into an empty slot*. Delegates to the StatCompare-weighted
 * helper (preserving the "empty only" contract for autopilot safety).
 *
 * "Filling the slot removes the candidate" is false for the hand pair: a worn 2H leaves the
 * off-hand empty, and equipping there empties the main hand. equipmentHelper.bestHandLoadout
 * decides both hands together so that cannot cycle. Full swaps go via findUpgrades.
 */
export function fillEmptyEquipCandidate(state: GameState, ds: DataStore): number | null {
  return newFillEmpty(state, ds);
}

// Full upgrade finder (now exposed for autopilot strategies / UI / bot). Returns suggestions that may
// include swaps, using StatCompare data + char stats weighting.
export { findUpgrades } from '../domain/items/equipmentHelper.ts';

// Auto-quest mine/herb: party skill+tool, same gate as fight-end auto-skin. Fishing stays a pole.

function holdsTool(
  ds: DataStore,
  pred: ((item: ReturnType<DataStore['item']>) => boolean) | null,
  bags: { stacks: readonly { item: number }[] } | undefined,
  equipped: EquippedMap | undefined,
): boolean {
  if (!pred) return true;
  if (bags?.stacks.some((s) => pred(ds.item(s.item)))) return true;
  for (const v of Object.values(equipped ?? {})) {
    const e = equippedEntry(v);
    if (e != null && pred(ds.item(e))) return true;
  }
  return false;
}

/** True when the player or a hired companion can work this mine / herb / skinning node. */
export function partyCanHarvestNode(state: GameState, ds: DataStore, node: GatherNodeDef): boolean {
  // The same three lines gatherToolPredicate gates (professions.ts): pick, knife, nothing.
  const tool = node.skill === 'mining'
    ? isMiningPick
    : node.skill === 'skinning' ? isSkinningKnife : null;
  if (node.skill !== 'mining' && node.skill !== 'herbalism' && node.skill !== 'skinning') return false;
  const playerVal = professionSkillValue(state.char, node.skill, ds, state.spellbook);
  if (
    playerVal != null
    && canGather(state.char, node, playerVal).ok
    && holdsTool(ds, tool, state.inventory, state.char.equipped)
  ) {
    return true;
  }
  for (const comp of state.squad ?? []) {
    if (comp.mission) continue;
    const cur = companionSkillMap(comp, companionLevel(comp, state.char.level))[node.skill];
    if (!cur || cur.current < node.orange) continue;
    if (!holdsTool(ds, tool, comp.bags, comp.equipped)) continue;
    return true;
  }
  return false;
}

function gatherNodeReady(state: GameState, node: GatherNodeDef, nowMs: number): boolean {
  const key = `${state.char.zoneId}:${node.id}`;
  if (!rotationNodeUp(state.char.zoneId, node.id, nowMs)) return false;
  if (!nodeReady(state.nodeState?.[key], nowMs)) return false;
  const entry = node.sourceId ?? node.id;
  const avail = goRuntimeAvailability(state.goRuntime?.[`${state.char.zoneId}:${entry}`], nowMs);
  return avail.kind === 'ready';
}

/**
 * Next ready mine/herb node in this zone the group can work, or null.
 * `skipId` is the node whose last gather produced no state change this tick.
 */
export function nextAutoGatherNode(
  state: GameState,
  ds: DataStore,
  nowMs: number,
  skipId?: number,
): number | null {
  const capacity = bagCapacity(state.char, ds);
  if (freeSlots(state.inventory, capacity) === 0) return null;
  const filter = normalizeGatherFilterConfig(state.gatherFilter);
  const questProtected = questNeededItems(state.questlog, (e) => ds.quest(e));
  for (const n of zoneNodes(ds, state.char.zoneId)) {
    if (n.id === skipId) continue;
    if (!partyCanHarvestNode(state, ds, n)) continue;
    if (!gatherNodeReady(state, n, nowMs)) continue;
    const skills = gatherFilterSkills(state.char, ds, n, state.spellbook, state.squad);
    if (!autoGatherAllowed(n, skills, filter, questProtected)) continue;
    return n.id;
  }
  return null;
}

// ---- the snapshot -----------------------------------------------------------

export function buildView(
  state: GameState,
  ds: DataStore,
  /** Global junk filter when available (all characters share one). */
  globalJunkFilter?: JunkFilterConfig,
): BotView {
  const { char, inventory, questlog } = state;
  const owned = ownedInventory(inventory, state.keyring, mailboxAsInventory(state.mailbox ?? []));
  const auras = auraIdsForSnapshot(char.activeAuras);
  const hpMax = maxHealth(char, ds);
  const pMax = powerType(char) === 'mana' ? maxPower(char, ds) : 0;
  const capacity = bagCapacity(char, ds);

  const ap = normalizeAutopilotConfig(state.autopilot);
  const global = globalJunkFilter !== undefined
    ? normalizeJunkFilterConfig(globalJunkFilter)
    : junkFilterFromLegacy(ap.autoSellGrays);
  const character = state.junkFilter !== undefined
    ? normalizeCharacterJunkFilterConfig(state.junkFilter)
    : { ...DEFAULT_CHARACTER_JUNK_FILTER_CONFIG, autoSell: ap.autoSellGrays };
  const protectedItems = questNeededItems(questlog, (e) => ds.quest(e));
  const deCfg = normalizeAutoDisenchantConfig(state.autoDisenchant);
  const playerEquipOpts = playerEquipOptsFrom(char, state.spellbook, ds, {
    specName: primarySpec(char, ds, state.rotationSpec),
    role: state.squadRole,
  });
  const guarded = companionsForOptionalUpgradeGuard(
    deCfg,
    state.squad,
    state.botRoster,
    state.raidRoster?.members,
  );
  let enchanters: readonly PartyEnchanter[] | null = null;
  let upgrades: ReadonlySet<number> | null = null;
  const junkCtx: JunkEvalContext = {
    global,
    character,
    deCfg,
    player: char,
    playerInv: inventory,
    playerEquipOpts,
    companions: guarded,
    get enchanters() {
      return (enchanters ??= resolveRosterEnchanters(
        char, state.squad, state.botRoster, state.raidRoster?.members, ds,
      ));
    },
    ds,
    questProtected: protectedItems,
    // Absent, this fell back to isUpgradeForParty per bag entry: one findUpgrades sweep per
    // guarded body per stack, instead of one per view (autoDisenchant.ts partyUpgradeEntries).
    get upgradeEntries() {
      return (upgrades ??= partyUpgradeEntries(char, inventory, playerEquipOpts, guarded, ds));
    },
  };
  const junk: JunkStack[] = [];
  for (const stack of inventory.stacks) {
    const it = ds.item(stack.item);
    if (!it || !(it.sellPrice > 0)) continue;
    if (dispositionForEntry(stack.item, junkCtx).disposition !== 'sell') continue;
    junk.push({ item: stack.item, count: stack.count, unitSell: it.sellPrice });
  }

  // Quests: what's ready to hand in, and what's worth accepting here.
  const turnInReady = questlog.quests.filter((q) => q.status === 'complete').map((q) => q.entry);
  const qTargets = questTargets(ds, questlog);
  // itemStartGateMet mirrors the engine's item-started accept gate (game.acceptQuest):
  // an item-started quest whose scroll/start item isn't in bags would be refused on accept,
  // and a planner that keeps proposing it deadlocks the whole quest loop (Cortello's Riddle).
  // Item-starts are no longer zone offers (the item is the giver), so the planner reads them
  // from the bags or it stops seeing Cortello's Riddle and its 200-odd siblings entirely.
  const acceptable = [
    ...offeredQuests(ds, char.zoneId, char, questlog),
    ...bagQuestStarts(ds, char, questlog, owned),
  ]
    .filter((o) => {
      if (!(o.canAccept && itemStartGateMet(o.quest, owned))) return false;
      return questAcceptGate(ds, o.quest, char.level, ap, (state.squad ?? []).length, {
        log: questlog,
        inv: owned,
        zoneId: char.zoneId,
        auras,
      }).ok;
    })
    .map((o) => o.quest.entry);

  // Grind targets: skip grey (no XP) and red (too deadly) for pure farm; for quest targets
  // we loosen gray (low-level quest mobs still need to be killed/looted to complete) but keep red out
  // (auto won't suicide on deadly con even for a quest objective).
  // forQuest now covers both direct killTargets and mobs that drop unmet quest items (pickup loot).
  // Wave 4C: when zone.spawns exist, attackDistance is live spatial data (used at pull via
  // spatialAddsForPull); hunt list itself stays tier-filtered (no continuous player walk pos).
  const spatialReady = zoneHasSpatialSpawns(ds, char.zoneId);
  // Still-needed quest items only (met bag counts are not farm work).
  // qTargets does not track counts, so the still-short test is HasQuestForItem itself: it covers
  // ReqItem counts and a ReqSourceCount-0 permit (quest 905's feather) in one place.
  const neededQuestItems = new Set<number>();
  for (const itemId of qTargets.items) {
    if (hasQuestForItem(questlog, (e) => ds.quest(e), owned, itemId, (i) => ds.item(i)?.stackable)) {
      neededQuestItems.add(itemId);
    }
  }
  // CQ5: questlog-aware — ritual/script-summoned kill targets (Binding demons, Big Will)
  // surface as huntable in the quest's own zone while the objective is unmet.
  const hunt: HuntTarget[] = huntableCreatures(ds, char.zoneId, questlog, char.race)
    .map((c) => {
      const questKill = qTargets.kills.has(c.entry);
      let questDropChance = 0;
      for (const itemId of neededQuestItems) {
        const ch = lootChanceForItem(ds, c.entry, itemId, questlog, char.level, auras);
        if (ch <= 0) continue;
        if (ch < dropperNoiseFloorFor(ds, itemId, questlog, char.level, auras)) continue;
        if (ch > questDropChance) questDropChance = ch;
      }
      return {
        entry: c.entry,
        level: c.level,
        tier: difficultyTier(c.level, char.level),
        forQuest: questKill || questDropChance > 0,
        questKill,
        questDropChance,
        // The pull's rank, not the template's: a normal mob whose linked elite joins it is an elite pull.
        rank: pullEliteRank(ds, char.zoneId, c.entry),
        attackDistance: creatureAttackDistance(c, char.level),
        aggroOnSight: creatureAggroOnSight(c),
        spatialReady,
      };
    })
    .filter((h) => {
      if (h.forQuest) return h.tier !== 'red';
      return h.tier !== 'gray' && h.tier !== 'red';
    });

  const gatherable = zoneNodes(ds, char.zoneId)
    .filter((n) =>
      n.skill === 'fishing'
        ? canGather(char, n, professionSkillValue(char, n.skill, ds)).ok
        : partyCanHarvestNode(state, ds, n))
    .map((n) => n.id);

  // Object objectives still incomplete for active quests (pickup / use / open chests).
  const activeObjTargets = new Set<number>();
  for (const q of questlog.quests) {
    if (q.status === 'turnedIn') continue;
    const def = ds.quest(q.entry);
    for (const ot of def?.objectTargets ?? []) {
      const cur = ((q as any).objects || (q.objects || {}))[String(ot.objectEntry)] ?? 0;
      if (cur < ot.count) activeObjTargets.add(ot.objectEntry);
    }
  }
  const objects = [...activeObjTargets].map((e) => ({ entry: e, forQuest: true }));

  return {
    level: char.level,
    gold: char.gold,
    zoneId: char.zoneId,
    pickSalt: dropperPickSalt(state),
    healthPct: hpMax > 0 ? char.health / hpMax : 1,
    powerPct: pMax > 0 ? char.power / pMax : 1,
    // petPower returns null for absent/dead pet → 1, so those never gate resting.
    petPowerPct: (() => {
      const pw = petPower(char, ds);
      return pw && pw.maxPower > 0 ? pw.power / pw.maxPower : 1;
    })(),
    freeBagSlots: freeSlots(inventory, capacity),
    bagsFull: freeSlots(inventory, capacity) === 0,
    inCombatCorpse: state.corpse != null,
    junk,
    turnInReady,
    acceptable,
    hunt,
    gatherable,
    neighbours: neighbourZones(ds, char.zoneId).map((z) => z.id),
    objects,
  };
}

// Grind desirability of a con colour (gray/red are already filtered out): even-con
// yellow is the efficient sweet spot (good XP, winnable); green is easy but still XP;
// orange (+3/+4) is risky for the reward, so only grind it if nothing better exists.
const TIER_PREFERENCE: Record<string, number> = { yellow: 3, green: 2, orange: 1 };

/**
 * Pick the best grind target. Quest mobs always win (they advance an objective). Among
 * quest mobs: kill first, then closer to the player (not above-level for a better drop),
 * then highest drop chance. 1% floor still drops Small Crag Boar 0.02% vs Crag Boar ~52%.
 * The winner is one of the near-equal pool (pickQuestDropper, rotated by view.pickSalt), not
 * always the comparator's first: that fought the same template every pull of a quest.
 * Otherwise prefer the safest *rewarding* con — yellow over green over orange — and, within
 * a colour, the highest level for max XP.
 */
export function bestHuntTarget(view: BotView): HuntTarget | null {
  if (view.hunt.length === 0) return null;
  const questMobs = view.hunt.filter((h) => h.forQuest);
  if (questMobs.length > 0) {
    let bestDrop = 0;
    for (const h of questMobs) {
      if (!h.questKill) bestDrop = Math.max(bestDrop, h.questDropChance ?? 0);
    }
    const dropFloor = bestDrop >= MIN_QUEST_DROPPER_CHANCE ? MIN_QUEST_DROPPER_CHANCE : 0;
    const usable = questMobs.filter(
      (h) => h.questKill || (h.questDropChance ?? 0) >= dropFloor,
    );
    const pool = usable.length > 0 ? usable : questMobs;
    const kills = pool.filter((h) => h.questKill);
    const ranked = (kills.length > 0 ? kills : pool)
      .map((h) => ({ h, level: h.level, chance: h.questDropChance ?? 0, rank: h.rank ?? 0 }))
      .sort((a, b) => compareQuestDroppers(a, b, view.level) || a.h.entry - b.h.entry);
    return pickQuestDropper(ranked, view.level, view.pickSalt ?? 0)?.h ?? null;
  }
  // Pure-farm safety guard: only auto-pick cons the character can reliably win. Yellow (even, ±2)
  // and green (below-con) are winnable; orange (+3/+4) is a likely loss for an unattended rotation
  // and red (+5) is already filtered out of `hunt`. If nothing safer than orange is here, return
  // null so the driver stops ('noTargets') rather than feeding the character to a too-high mob.
  // (A player who explicitly pins a mob via mode.creatureEntry bypasses this — see plan.ts — so
  // their deliberate choice of a tougher con is still respected.)
  const safe = view.hunt.filter((h) => h.tier === 'yellow' || h.tier === 'green');
  if (safe.length === 0) return null;
  return safe.reduce((a, b) => {
    const ra = TIER_PREFERENCE[a.tier] ?? 0;
    const rb = TIER_PREFERENCE[b.tier] ?? 0;
    if (rb !== ra) return rb > ra ? b : a;
    return b.level > a.level ? b : a;
  });
}
