// Equipment helper plus the junk and disenchant pipeline. Exports the auto-equip, junk-sell, discard
// and full-bag entry points for trade, loot, the quest log and combat.

import { mulberry32, hashSeed } from '../core/rng.ts';
import { normalizeAutopilotConfig } from '../../autopilot/config.ts';
import {
  normalizeEquipmentHelperConfig,
  findUpgrades,
  type UpgradeSuggestion,
} from '../../domain/items/equipmentHelper.ts';
import { stackBoundToHolder } from '../../domain/raid/partyVault.ts';
import {
  normalizeAutoDisenchantConfig,
  mergeAutoDisenchantConfigs,
  canAutoDisenchantEntry,
  companionsForOptionalUpgradeGuard,
  partyUpgradeEntries,
  type AutoDisenchantConfig,
} from '../../domain/professions/autoDisenchant.ts';
import {
  resolveRosterEnchanters,
  runPartyDisenchant,
} from '../../domain/professions/partyDisenchant.ts';
import {
  normalizeJunkFilterConfig,
  normalizeCharacterJunkFilterConfig,
  junkFilterFromLegacy,
  bagEntriesWithDisposition,
  dispositionForEntry,
  effectiveJunkRules,
  type JunkEvalContext,
  DEFAULT_CHARACTER_JUNK_FILTER_CONFIG,
} from '../../domain/items/junkFilter.ts';
import {
  equipItem, unequipItem, DUAL_WIELD_SPELL_ID, type EquipOpts,
} from '../../domain/items/equipment.ts';
import { characterPlayerbotSpecId } from '../../domain/bots/playerbotStatWeight.ts';
import { resolveWeaponSpender } from '../../domain/items/weaponSpender.ts';
import {
  packInventoryByBagFamily,
  isAmmoItem,
  maybeAutoSelectAmmo,
} from '../../domain/items/ammo.ts';
import {
  emptyKeyring,
} from '../../domain/items/keyring.ts';
import { sell, isValidTradeQty, maxSellQtyForGold, clampGold } from '../../domain/economy/trading.ts';
import type { Companion } from '../../domain/bots/squad.ts';
import {
  addInstance,
  addItem,
  countItem,
  emptyInventory,
  removeItem,
  usedSlots,
} from '../../domain/items/inventory.ts';
import { copyInstance, equippedEntry, equippedInstance, type ItemInstance } from '../../domain/items/itemInstance.ts';
import { knows } from '../../domain/character/spellbook.ts';
import { primarySpec } from '../../domain/rotation/rotation.ts';
import { questNeededItems } from '../../domain/quests/questlog.ts';
import { isAutoOpenContainer } from '../../domain/items/itemContainer.ts';
import { getRank, meetsRequiredRep } from '../../domain/creature/reputation.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import { refuseIfDead } from '../../domain/run/death.ts';
import type { Game } from './types.ts';
import type { FullBagsHandle, GameCtx } from './context.ts';
import { type BagHandle, companionBagHandle, overflowLine, playerBagHandle } from './bagOverflow.ts';

/** One junk sweep: what it earned and the buyback rows the caller shows. */
export type JunkSellResult =
  | { ok: true; earned: number; count: number; sold: Array<{ entry: number; qty: number; refundCopper: number }> }
  | { ok: false; reason: string };

export type EquipmentHelperModule = {
  runAutoEquipUpgrades: (max?: number) => number;
  runAutoOpenContainers: (max?: number) => number;
  // Filled by game.ts once the professions module exists, the same late-bind as transportDepart.
  containerOpener: { open: (slotIndex: number) => boolean };
  /** Your bags plus the mailbox queue and the auto-equip hook behind them. */
  playerBags: BagHandle;
  sellAllJunkInner: (ctx?: JunkEvalContext, owner?: BagHandle) => JunkSellResult;
  discardItemInner: (itemEntry: number, qty: number, owner?: BagHandle) => { ok: true; discarded: number } | { ok: false; reason: string };
  handleFullBags: (item: number, count: number, owner?: BagHandle) => FullBagsHandle;
  methods: Pick<
    Game,
    | 'equipmentHelperConfig'
    | 'setEquipmentHelperConfig'
    | 'autoDisenchantConfig'
    | 'globalAutoDisenchantConfig'
    | 'characterAutoDisenchantConfig'
    | 'setAutoDisenchantConfig'
    | 'setGlobalAutoDisenchantConfig'
    | 'setCharacterAutoDisenchantConfig'
    | 'junkFilterConfig'
    | 'globalJunkFilterConfig'
    | 'setGlobalJunkFilterConfig'
    | 'characterJunkFilterConfig'
    | 'setCharacterJunkFilterConfig'
    | 'setJunkFilterConfig'
    | 'autoEquipUpgrades'
    | 'autoDisenchantUpgrades'
    | 'autoOpenContainers'
    | 'runAutoJunk'
    | 'takeOverflowSold'
    | 'junkSellPreview'
    | 'companionJunkSellPreview'
    | 'sellCompanionJunk'
    | 'suggestedEquipmentUpgrades'
    | 'equip'
    | 'unequip'
  >;
};

export function createEquipmentHelperModule(ctx: GameCtx): EquipmentHelperModule {
  const { ds, state, opts, log, cap, refreshQuests } = ctx;

  // Dual Wield 674 → INVTYPE_WEAPON can go OH. Spec weightscale from talents / rotationSpec so auto-equip
  // is not class-flat. Cite: Player.cpp CanDualWield; RandomItemMgr GetPlayerSpecId.
  const equipOpts = (): EquipOpts => ({
    canDualWield: knows(state.spellbook, DUAL_WIELD_SPELL_ID),
    // The rotation spec is the editor override. Passing the zero-talent class default as a spec name
    // hid the squad role and scored an untalented paladin healer as retribution.
    specId: characterPlayerbotSpecId(state.char, ds, {
      specName: state.rotationSpec
        ? primarySpec(state.char, ds, state.rotationSpec)
        : undefined,
      role: state.squadRole,
    }),
    // Same shape as canDualWield: the spellbook lives on the state, not the Character, so the
    // weapon-damage spender is resolved here and the scorer prices a main hand per cast.
    weaponSpender: resolveWeaponSpender(state.spellbook, ds),
  });

  // A reward the bags cannot hold still goes ON when auto-equip scores it an upgrade; the piece it
  // replaces spills to the queue. Cite: equipment.ts:236 equipItem (no bag gate on a non-bag swap).
  function wearOverBagCap(bags: BagHandle, item: number, count: number, instance?: ItemInstance): boolean {
    const eqCfg = normalizeEquipmentHelperConfig(state.equipmentHelper);
    if (!eqCfg.enabled || eqCfg.mode !== 'auto') return false;
    const def = ds.item(item);
    if (!def?.slot || count !== 1) return false;
    const eqOpts = equipOpts();
    const maxStack = def.stackable ?? 1;
    // One stack over capacity on purpose — equipItem takes it straight back out.
    const probe = instance
      ? addInstance(bags.get(), copyInstance(instance, 1), maxStack)
      : addItem(bags.get(), item, 1, maxStack);
    const up = findUpgrades(state.char, probe, ds, eqOpts).find((u) => u.entry === item);
    if (!up) return false;
    const displaced = equippedInstance(state.char.equipped[up.targetSlot]);
    const r = equipItem(state.char, probe, ds, item, up.targetSlot, eqOpts);
    if (!r.ok) return false;
    state.char = r.char;
    bags.set(r.inventory);
    log(`${bags.isPlayer ? 'You equip' : `${bags.name} equips`} ${def.name ?? item} straight from the reward.`);
    // The swap is slot-neutral, so anything still over the cap is the piece that came off.
    if (displaced && usedSlots(bags.get()) > bags.cap()) {
      const [next, took] = removeItem(bags.get(), displaced.item, displaced.count);
      if (took > 0) {
        bags.set(next);
        bags.overflow(displaced.item, took, displaced);
        log(overflowLine(bags, ds, displaced.item, took));
      }
    }
    return true;
  }

  // Your own bags as a BagHandle. Every junk / make-room / overflow pass below takes one of these,
  // so a companion runs the same code against theirs.
  let playerBagsMemo: BagHandle | null = null;
  const playerBags = (): BagHandle => (playerBagsMemo ??= {
    ...playerBagHandle(ctx),
    wear: (item, count, instance) => wearOverBagCap(playerBags(), item, count, instance),
  });

  // Wired by game.ts after createProfessionsModule; a no-op until then.
  const containerOpener = { open: (_slotIndex: number): boolean => false };

  function autoOpenEnabled(): boolean {
    const raw = typeof opts.autoOpenContainers === 'function'
      ? opts.autoOpenContainers()
      : opts.autoOpenContainers;
    return raw !== false;
  }

  // Unpack bagged containers that only exist to be opened: a clam, a sack, a bloated fish. Locked
  // and quest containers are never touched, and requireRoom refuses rather than spilling.
  function runAutoOpenContainers(max = 8): number {
    if (!autoOpenEnabled()) return 0;
    if (refuseIfDead(state.char.health, state.deathFlow)) return 0;
    const hasItemLootTable = (entry: number) => ds.lootTable(`item:${entry}`).length > 0;
    // questNeededItems walks the whole log, so build it only once a candidate actually turns up.
    let protectedItems: ReadonlySet<number> | null = null;
    let opened = 0;
    const skipped = new Set<number>();
    // Re-scan each pass: an opened container can yield another one, and every open moves slots.
    for (let guard = 0; guard < max * 2 && opened < max; guard++) {
      const candidate = (st: { item: number }): boolean => {
        if (!st || skipped.has(st.item)) return false;
        const def = ds.item(st.item);
        if (!isAutoOpenContainer(def, hasItemLootTable)) return false;
        return (def?.requiredLevel ?? 0) <= state.char.level;
      };
      let slot = state.inventory.stacks.findIndex(candidate);
      if (slot >= 0) {
        protectedItems ??= questNeededItems(state.questlog, (e) => ds.quest(e));
        // A quest objective naming the container itself keeps it whole.
        const guarded = protectedItems;
        slot = state.inventory.stacks.findIndex((st) => candidate(st) && !guarded.has(st.item));
      }
      if (slot < 0) break;
      const entry = state.inventory.stacks[slot]?.item;
      if (containerOpener.open(slot)) opened++;
      else if (entry != null) skipped.add(entry); // bags too tight for this one - try the next
    }
    return opened;
  }

  /** Shared auto-equip loop: skip failed candidates instead of aborting the whole pass. */
  function runAutoEquipUpgrades(max = 8): number {
    // Containers first: what is inside them is what the equip / DE / junk passes below then judge.
    runAutoOpenContainers(Math.max(8, max));
    const eqCfg = normalizeEquipmentHelperConfig(state.equipmentHelper);
    let equipped = 0;
    if (eqCfg.enabled && eqCfg.mode === 'auto') {
      const skipped = new Set<number>();
      // Entries this pass already equipped or displaced. Without it the pass could re-equip
      // an item it had just stowed and trade the same two pieces until the budget ran out.
      const settled = new Set<number>();
      // specId reads talents/spellbook, which equipping gear cannot change: one build per pass.
      const eqOpts = equipOpts();
      for (let guard = 0; guard < max * 2 && equipped < max; guard++) {
        const ups = findUpgrades(state.char, state.inventory, ds, eqOpts);
        const best = ups.find((u) => !skipped.has(u.entry) && !settled.has(u.entry));
        if (!best) break;
        const before = { ...state.char.equipped };
        const r = equipItem(state.char, state.inventory, ds, best.entry, best.targetSlot, eqOpts);
        if (r.ok) {
          settled.add(best.entry);
          for (const slot of Object.keys(before) as Array<keyof typeof before>) {
            const prevEntry = equippedEntry(before[slot]);
            if (prevEntry != null && equippedEntry(r.char.equipped[slot]) !== prevEntry) {
              settled.add(prevEntry);
            }
          }
          state.char = r.char;
          state.inventory = r.inventory;
          equipped++;
        } else {
          // e.g. bag shrink would overflow - try the next upgrade instead of giving up.
          skipped.add(best.entry);
        }
      }
    }
    // After equip: DE leftover non-upgrades, then junk sell/destroy (when enabled).
    runAutoDisenchant(Math.max(8, max * 2));
    runAutoJunkPass(Math.max(16, max * 2));
    return equipped;
  }

  /** Global junk filter via createGame opts (Settings); fallback defaults for headless/smoke. */
  function resolvedGlobalJunkFilter() {
    const raw = typeof opts.junkFilter === 'function' ? opts.junkFilter() : opts.junkFilter;
    if (raw !== undefined) return normalizeJunkFilterConfig(raw);
    const ap = normalizeAutopilotConfig(state.autopilot);
    return junkFilterFromLegacy(ap.autoSellGrays);
  }

  function resolvedCharacterJunkFilter() {
    if (state.junkFilter === undefined) {
      const ap = normalizeAutopilotConfig(state.autopilot);
      // Legacy: save only had quality/lists without characterSpecific → treat as character lists
      // with characterSpecific false (use global quality), preserving any lists on the save.
      state.junkFilter = {
        ...DEFAULT_CHARACTER_JUNK_FILTER_CONFIG,
        autoSell: ap.autoSellGrays,
      };
    }
    return normalizeCharacterJunkFilterConfig(state.junkFilter);
  }

  function resolvedGlobalAutoDisenchant(): AutoDisenchantConfig {
    const raw = typeof opts.autoDisenchant === 'function' ? opts.autoDisenchant() : opts.autoDisenchant;
    return normalizeAutoDisenchantConfig(raw ?? { enabled: false, maxQuality: 2 });
  }

  function resolvedCharacterAutoDisenchant(): AutoDisenchantConfig {
    return normalizeAutoDisenchantConfig(state.autoDisenchant);
  }

  /** Global OR character auto-DE (ceiling = max of enabled layers). */
  function resolvedAutoDisenchant(): AutoDisenchantConfig {
    return mergeAutoDisenchantConfigs(resolvedGlobalAutoDisenchant(), resolvedCharacterAutoDisenchant());
  }

  /** Party seat or bench body by id — the roster the junk filter's own companion list is built from. */
  function rosterCompanion(id: string) {
    return (state.squad ?? []).find((c) => c.id === id)
      ?? Object.values(state.botRoster ?? {}).find((c) => c.id === id);
  }

  function junkEvalCtx(): JunkEvalContext {
    const protectedItems = questNeededItems(state.questlog, (e) => ds.quest(e));
    const playerEquipOpts = equipOpts();
    const deCfg = resolvedAutoDisenchant();
    const companions = companionsForOptionalUpgradeGuard(
      deCfg,
      state.squad,
      state.botRoster,
      state.raidRoster?.members,
    );
    let enchanters: JunkEvalContext['enchanters'] | null = null;
    let upgrades: ReadonlySet<number> | null = null;
    return {
      global: resolvedGlobalJunkFilter(),
      character: resolvedCharacterJunkFilter(),
      deCfg,
      player: state.char,
      playerInv: state.inventory,
      playerEquipOpts,
      companions,
      // A companionCharacter per raid member for a list only canAutoDisenchantEntry reads, and
      // that returns on !cfg.enabled first: 39 bodies built for nothing with auto-DE off.
      get enchanters() {
        return (enchanters ??= resolveRosterEnchanters(
          state.char,
          state.squad,
          state.botRoster,
          state.raidRoster?.members,
          ds,
        ));
      },
      ds,
      questProtected: protectedItems,
      // Only a slotted quality>=1 bag entry consults this, so a bag of greys and mats never
      // pays the 39-body findUpgrades sweep.
      get upgradeEntries() {
        return (upgrades ??= partyUpgradeEntries(
          state.char,
          state.inventory,
          playerEquipOpts,
          companions,
          ds,
        ));
      },
    };
  }

  /** Sell then destroy bag junk under effective auto flags. DE already ran in equip pipeline. */
  function runAutoJunkPass(max = 32, owner?: BagHandle): { sold: number; destroyed: number; earned: number } {
    const rules = effectiveJunkRules(resolvedGlobalJunkFilter(), resolvedCharacterJunkFilter());
    let sold = 0;
    let destroyed = 0;
    let earned = 0;
    if (!rules.autoSell && !rules.autoDestroy) return { sold, destroyed, earned };
    const jctx = junkEvalCtx();
    if (rules.autoSell) {
      const r = sellAllJunkInner(jctx, owner);
      if (r.ok) {
        sold = r.count;
        earned = r.earned;
      }
    }
    if (rules.autoDestroy) {
      destroyed = runAutoDestroy(max, jctx, owner);
    }
    return { sold, destroyed, earned };
  }

  const noFullBags: FullBagsHandle = {
    soldIncoming: 0, earnedIncoming: 0, destroyedIncoming: 0, madeRoom: false,
  };
  let overflowSoldTally = { count: 0, gold: 0 };

  // Bags cannot take this drop. Same junk filter as vendor/auto-junk: sell or destroy the incoming stack,
  // else run the bag sell+destroy pass so a keeper can fit. `owner` runs it over a companion's bags.
  function handleFullBags(item: number, count: number, owner?: BagHandle): FullBagsHandle {
    if (count <= 0) return noFullBags;
    const rules = effectiveJunkRules(resolvedGlobalJunkFilter(), resolvedCharacterJunkFilter());
    if (!rules.autoSell && !rules.autoDestroy) return noFullBags;

    const bags = owner ?? playerBags();
    const who = bags.isPlayer ? 'Bags full' : `${bags.name}'s bags are full`;
    const def = ds.item(item);
    let jctx: JunkEvalContext | null = null;
    const ctx = (): JunkEvalContext => (jctx ??= junkEvalCtx());
    const disp = def ? dispositionForEntry(item, ctx()).disposition : 'keep';
    const dead = refuseIfDead(state.char.health, state.deathFlow);

    if (!dead && disp === 'sell' && rules.autoSell && def && (def.sellPrice ?? 0) > 0) {
      // All-or-nothing: a partial gold-cap sale would leave a leftover row that re-sells.
      if (maxSellQtyForGold(state.char, def, count) >= count) {
        const earned = def.sellPrice * count;
        state.char = { ...state.char, gold: clampGold(state.char.gold + earned) };
        log(`${who} - sold ${count}x ${def.name ?? item} for ${moneyMarked(earned)}.`);
        overflowSoldTally = {
          count: overflowSoldTally.count + count,
          gold: overflowSoldTally.gold + earned,
        };
        return { soldIncoming: count, earnedIncoming: earned, destroyedIncoming: 0, madeRoom: false };
      }
    }
    // Destroy is allowed while dead (HandleDestroyItemOpcode has no alive gate).
    if (disp === 'destroy' && rules.autoDestroy && def) {
      log(`${who} - destroyed ${count}x ${def.name ?? item}.`);
      return { soldIncoming: 0, earnedIncoming: 0, destroyedIncoming: count, madeRoom: false };
    }

    let madeRoom = false;
    if (!dead && rules.autoSell) {
      const r = sellAllJunkInner(ctx(), bags);
      madeRoom = !!(r.ok && r.count > 0);
    }
    if (!madeRoom && rules.autoDestroy) {
      madeRoom = runAutoDestroy(Math.max(16, count), ctx(), bags) > 0;
    }
    return { ...noFullBags, madeRoom };
  }

  function runAutoDestroy(max = 32, ctx?: JunkEvalContext, owner?: BagHandle): number {
    let done = 0;
    const bags = owner ?? playerBags();
    const skipped = new Set<number>();
    // One ctx for the pass — each build is 47 companion bodies plus a findUpgrades sweep, and
    // destroying a non-upgrade can only shrink the candidate set. runAutoDisenchant hoists the same.
    const jctx = ctx ?? junkEvalCtx();
    for (let guard = 0; guard < max * 3 && done < max; guard++) {
      const candidates = bagEntriesWithDisposition(bags.get(), jctx, 'destroy')
        .filter((e) => !skipped.has(e));
      const entry = candidates[0];
      if (entry == null) break;
      const have = bags.get().stacks
        .filter((s) => s.item === entry)
        .reduce((n, s) => n + s.count, 0);
      if (have <= 0) {
        skipped.add(entry);
        continue;
      }
      const def = ds.item(entry);
      if (!def) {
        skipped.add(entry);
        continue;
      }
      // Prefer bags first; discardItem already handles bag+keyring.
      const res = discardItemInner(entry, have, bags);
      if (!res.ok) {
        skipped.add(entry);
        continue;
      }
      done += res.discarded;
    }
    return done;
  }

  /** Shared sell-all body for sellAllJunk + auto-sell path, over any owner's bags. */
  function sellAllJunkInner(ctx?: JunkEvalContext, owner?: BagHandle): JunkSellResult {
    // Dead cannot sell (KI-930). Cite: Player.cpp BuyItemFromVendor !IsAlive pattern.
    {
      const dead = refuseIfDead(state.char.health, state.deathFlow);
      if (dead) return dead;
    }
    const bags = owner ?? playerBags();
    const jctx = ctx ?? junkEvalCtx();
    const junk = bagEntriesWithDisposition(bags.get(), jctx, 'sell');
    const sold: Array<{ entry: number; qty: number; refundCopper: number }> = [];
    let earned = 0;
    let count = 0;
    let moneyCapBlocked = false;
    for (const entry of junk) {
      const def = ds.item(entry);
      if (!def) continue;
      const have = bags.get().stacks
        .filter((s) => s.item === entry)
        .reduce((n, s) => n + s.count, 0);
      if (have <= 0) continue;
      const res = sell(state.char, bags.get(), def, have);
      if (!res.ok) {
        if (res.reason === 'You cannot carry any more money') moneyCapBlocked = true;
        continue;
      }
      state.char = res.char;
      bags.set(res.inventory);
      earned += res.amount;
      const qty = res.buybackEntry?.qty ?? 0;
      count += qty;
      if (qty > 0) sold.push({ entry, qty, refundCopper: res.amount });
    }
    if (!count) {
      if (moneyCapBlocked) return { ok: false, reason: 'You cannot carry any more money' };
      return { ok: false, reason: 'No junk to sell' };
    }
    // Their bags are not your quest inventory — only your own sale can complete an objective.
    if (bags.isPlayer) refreshQuests();
    log(bags.isPlayer
      ? `Sold ${count} junk item${count === 1 ? '' : 's'} for ${moneyMarked(earned)}.`
      : `${bags.name} sells ${count} junk item${count === 1 ? '' : 's'} for ${moneyMarked(earned)}.`);
    return { ok: true, earned, count, sold };
  }

  function discardItemInner(itemEntry: number, qty: number, owner?: BagHandle): { ok: true; discarded: number } | { ok: false; reason: string } {
    // Destroying a bag item while dead is ALLOWED: HandleDestroyItemOpcode has no alive gate,
    // unlike HandleListInventoryOpcode (`if (!GetPlayer()->IsAlive()) return;`). KI-931 intended.
    const def = ds.item(itemEntry);
    if (!def) return { ok: false, reason: 'Unknown item' };
    if (!isValidTradeQty(qty)) return { ok: false, reason: 'Invalid quantity' };
    const bags = owner ?? playerBags();
    const bagHave = countItem(bags.get(), itemEntry);
    // Only you carry a keyring; a companion's destroy pass is bags-only.
    const keyHave = bags.isPlayer ? countItem(state.keyring ?? emptyKeyring(), itemEntry) : 0;
    if (bagHave + keyHave < qty) {
      return { ok: false, reason: "You don't have that" };
    }
    let left = qty;
    let removed = 0;
    if (bagHave > 0 && left > 0) {
      const take = Math.min(bagHave, left);
      const [inv, n] = removeItem(bags.get(), itemEntry, take);
      bags.set(inv);
      removed += n;
      left -= n;
    }
    if (left > 0 && keyHave > 0) {
      const [kr, n] = removeItem(state.keyring ?? emptyKeyring(), itemEntry, left);
      state.keyring = kr;
      removed += n;
    }
    if (removed <= 0) return { ok: false, reason: "You don't have that" };
    if (bags.isPlayer) {
      if (isAmmoItem(def)) state.char = maybeAutoSelectAmmo(state.char, state.inventory, ds);
      refreshQuests();
    }
    log(bags.isPlayer
      ? `Destroyed ${removed > 1 ? `${removed}x ` : ''}${def.name}.`
      : `${bags.name} destroys ${removed > 1 ? `${removed}x ` : ''}${def.name}.`);
    return { ok: true, discarded: removed };
  }

  function findOwnedCompanion(id: string): Companion | undefined {
    return (state.squad ?? []).find((c) => c.id === id)
      ?? state.botRoster?.[id]
      ?? state.raidRoster?.members?.[id];
  }

  // Auto-disenchant bagged gear up to quality ceiling. Skips your upgrades (and companion upgrades when
  // that option is on), quest items, and no-enchanter gear.
  function runAutoDisenchant(max = 16): number {
    const cfg = resolvedAutoDisenchant();
    if (!cfg.enabled) return 0;
    const protectedItems = questNeededItems(state.questlog, (e) => ds.quest(e));
    const companions = companionsForOptionalUpgradeGuard(
      cfg,
      state.squad,
      state.botRoster,
      state.raidRoster?.members,
    );
    const enchanters = resolveRosterEnchanters(
      state.char,
      state.squad,
      state.botRoster,
      state.raidRoster?.members,
      ds,
    );
    const playerEquipOpts = equipOpts();
    const upgradeEntries = partyUpgradeEntries(
      state.char,
      state.inventory,
      playerEquipOpts,
      companions,
      ds,
    );
    let done = 0;
    const skipped = new Set<number>();
    for (let guard = 0; guard < max * 3 && done < max; guard++) {
      const candidates = [...new Set(state.inventory.stacks.map((s) => s.item))];
      let picked: number | null = null;
      let who: ReturnType<typeof canAutoDisenchantEntry> | null = null;
      for (const entry of candidates) {
        if (skipped.has(entry)) continue;
        const gate = canAutoDisenchantEntry(
          entry,
          cfg,
          state.char,
          state.inventory,
          playerEquipOpts,
          companions,
          enchanters,
          ds,
          protectedItems,
          upgradeEntries,
        );
        if (!gate.ok) {
          skipped.add(entry);
          continue;
        }
        picked = entry;
        who = gate;
        break;
      }
      if (picked == null || !who || !who.ok) break;

      // Companion enchanter: skill-up on them, mats into your bags (the item was yours).
      // Same runner the held-item Disenchant verb uses — one write-back, not two.
      const comp = who.enchanter.kind === 'companion'
        ? findOwnedCompanion(who.enchanter.id)
        : undefined;
      if (who.enchanter.kind === 'companion' && !comp) {
        skipped.add(picked);
        continue;
      }
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const res = runPartyDisenchant({
        who: who.enchanter.kind === 'player'
          ? { kind: 'player', name: state.char.name, skill: state.char.skills.enchanting?.current ?? 0 }
          : { kind: 'companion', id: who.enchanter.id, name: who.enchanter.name, skill: 0 },
        comp,
        player: state.char,
        inventory: state.inventory,
        ds,
        entry: picked,
        rng,
        cap: cap(),
      });
      if (!res.ok) {
        skipped.add(picked);
        continue;
      }
      state.char = res.char;
      state.inventory = res.inventory;
      if (comp && res.companionProfessions) comp.professions = res.companionProfessions;
      const name = ds.item(picked)?.name ?? picked;
      const mats = res.yielded.map((y) => `${y.count}x ${ds.item(y.item)?.name ?? y.item}`).join(', ') || 'nothing';
      log(
        `Auto-disenchanted ${name}${comp ? ` (${comp.name})` : ''}: ${mats}.`
        + `${res.skillUp ? ` (enchanting → ${res.skillUp})` : ''}`,
      );
      done++;
    }
    if (done > 0) refreshQuests();
    return done;
  }

  function setGlobalJunkFilterConfig(cfg: Parameters<Game['setGlobalJunkFilterConfig']>[0]): void {
    const next = normalizeJunkFilterConfig(cfg);
    opts.onJunkFilterChange?.(next);
    const rules = effectiveJunkRules(next, resolvedCharacterJunkFilter());
    const ap = normalizeAutopilotConfig(state.autopilot);
    state.autopilot = { ...ap, autoSellGrays: rules.autoSell };
  }

  const methods: EquipmentHelperModule['methods'] = {
    equipmentHelperConfig() { return normalizeEquipmentHelperConfig(state.equipmentHelper); },
    setEquipmentHelperConfig(cfg) { state.equipmentHelper = normalizeEquipmentHelperConfig(cfg); },
    autoDisenchantConfig() { return resolvedAutoDisenchant(); },
    globalAutoDisenchantConfig() { return resolvedGlobalAutoDisenchant(); },
    characterAutoDisenchantConfig() { return resolvedCharacterAutoDisenchant(); },
    setAutoDisenchantConfig(cfg) {
      // Legacy: write character layer.
      state.autoDisenchant = normalizeAutoDisenchantConfig(cfg);
    },
    setGlobalAutoDisenchantConfig(cfg) {
      opts.onAutoDisenchantChange?.(normalizeAutoDisenchantConfig(cfg));
    },
    setCharacterAutoDisenchantConfig(cfg) {
      state.autoDisenchant = normalizeAutoDisenchantConfig(cfg);
    },
    junkFilterConfig() {
      return effectiveJunkRules(resolvedGlobalJunkFilter(), resolvedCharacterJunkFilter());
    },
    globalJunkFilterConfig() { return resolvedGlobalJunkFilter(); },
    setGlobalJunkFilterConfig,
    characterJunkFilterConfig() { return resolvedCharacterJunkFilter(); },
    setCharacterJunkFilterConfig(cfg) {
      const next = normalizeCharacterJunkFilterConfig(cfg);
      state.junkFilter = next;
      const rules = effectiveJunkRules(resolvedGlobalJunkFilter(), next);
      const ap = normalizeAutopilotConfig(state.autopilot);
      state.autopilot = { ...ap, autoSellGrays: rules.autoSell };
    },
    setJunkFilterConfig(cfg) {
      // Legacy: write global quality/auto + lists.
      setGlobalJunkFilterConfig(cfg);
    },
    autoEquipUpgrades(max = 8) { return runAutoEquipUpgrades(max); },
    autoDisenchantUpgrades(max = 16) { return runAutoDisenchant(max); },
    autoOpenContainers(max = 8) { return runAutoOpenContainers(max); },
    runAutoJunk(max = 32) { return runAutoJunkPass(max); },
    takeOverflowSold() {
      const v = overflowSoldTally;
      overflowSoldTally = { count: 0, gold: 0 };
      return v;
    },
    junkSellPreview() {
      const jctx = junkEvalCtx();
      const entries = bagEntriesWithDisposition(state.inventory, jctx, 'sell');
      const out: Array<{ entry: number; count: number; unitSell: number }> = [];
      for (const entry of entries) {
        const def = ds.item(entry);
        if (!def || !(def.sellPrice > 0)) continue;
        const count = state.inventory.stacks
          .filter((s) => s.item === entry)
          .reduce((n, s) => n + s.count, 0);
        if (count > 0) out.push({ entry, count, unitSell: def.sellPrice });
      }
      return out;
    },
    // The same filter, run over a companion's bags instead of yours. A companion carries loot the
    // party never came back for, and the vendor's Companions tab sells it from where it sits.
    companionJunkSellPreview(id) {
      const comp = rosterCompanion(id);
      if (!comp?.bags) return [];
      const jctx = junkEvalCtx();
      const out: Array<{ entry: number; count: number; unitSell: number }> = [];
      for (const entry of bagEntriesWithDisposition(comp.bags, jctx, 'sell')) {
        const def = ds.item(entry);
        if (!def || !(def.sellPrice > 0)) continue;
        const count = comp.bags.stacks
          .filter((st) => st.item === entry)
          .reduce((n, st) => n + st.count, 0);
        if (count > 0) out.push({ entry, count, unitSell: def.sellPrice });
      }
      return out;
    },

    // The player's own sell-all pass, pointed at their bags. Same filter, same buyback rows.
    sellCompanionJunk(id) {
      const comp = rosterCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const r = sellAllJunkInner(undefined, companionBagHandle(ctx, comp));
      return r.ok ? r : { ok: false, reason: r.reason };
    },

    suggestedEquipmentUpgrades(inv) {
      const cfg = normalizeEquipmentHelperConfig(state.equipmentHelper);
      if (!cfg.enabled) return [];
      const o = equipOpts();
      const row = (u: UpgradeSuggestion, holder?: Companion) => ({
        entry: u.entry,
        slot: u.targetSlot,
        randomPropertyId: u.randomPropertyId,
        currentEntry: u.currentEntry,
        delta: u.valueDelta,
        displaces: u.displaces,
        ...(holder ? { holderId: holder.id, holderName: holder.name } : {}),
      });
      const out = findUpgrades(state.char, inv ?? state.inventory, ds, o).map((u) => row(u));
      // A probe scores itself; the live list also reads every companion's unbound stacks, since a
      // crafter's product sits in the crafter's bags (squadUpgradePlan 'mate'). Your copy wins a tie.
      if (inv) return out;
      const seen = new Map(out.map((r) => [r.entry, r]));
      const members = [...(state.squad ?? []), ...Object.values(state.botRoster ?? {})];
      for (const comp of members) {
        const free = (comp.bags?.stacks ?? []).filter((s) => !stackBoundToHolder(s, ds));
        if (!free.length) continue;
        for (const u of findUpgrades(state.char, { stacks: free }, ds, o)) {
          const prev = seen.get(u.entry);
          if (prev && prev.delta >= u.valueDelta) continue;
          seen.set(u.entry, row(u, comp));
        }
      }
      return [...seen.values()].sort((a, b) => b.delta - a.delta);
    },

    equip(itemEntry, preferred) {
      // RequiredReputation also gates equip/use (Player::CanUseItem). Low-risk check here
      // rather than domain/items/equipment.ts (out of C3 touch list).
      const itemDef = ds.item(itemEntry);
      if (itemDef?.requiredRep) {
        const fac = ds.faction(itemDef.requiredRep.faction);
        if (!fac) return { ok: false, reason: 'Requires higher reputation' };
        const rank = getRank(state.char.reputations, fac, state.char.race, state.char.cls);
        if (!meetsRequiredRep(rank, itemDef.requiredRep.rank)) {
          return { ok: false, reason: 'Requires higher reputation' };
        }
      }
      // Dual Wield 674 gates a one-hand weapon into the off hand. `preferred` is the ring, trinket or
      // hand the player picked to replace. Cite: Player.cpp ViableEquipSlots ~7978-7987.
      const res = equipItem(state.char, state.inventory, ds, itemEntry, preferred, equipOpts());
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot be equipped' };
      state.char = res.char;
      // Equip quiver/pouch → pull matching ammo into specialty slots (source re-store pass).
      state.inventory = packInventoryByBagFamily(res.inventory, state.char, ds);
      log(`You equipped ${ds.item(itemEntry)?.name ?? itemEntry}.`);
      return { ok: true, slot: res.slot! };
    },

    unequip(slot) {
      const entry = equippedEntry(state.char.equipped[slot]);
      const res = unequipItem(state.char, state.inventory, ds, slot);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Nothing to unequip' };
      state.char = res.char;
      state.inventory = packInventoryByBagFamily(res.inventory, state.char, ds);
      log(`You unequipped ${entry != null ? ds.item(entry)?.name ?? entry : 'an item'}.`);
      return { ok: true };
    },
  };

  return {
    runAutoEquipUpgrades,
    runAutoOpenContainers,
    containerOpener,
    playerBags: playerBags(),
    sellAllJunkInner,
    discardItemInner,
    handleFullBags,
    methods,
  };
}
