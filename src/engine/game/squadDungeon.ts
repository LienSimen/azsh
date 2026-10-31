// Squad, dungeon and full-run facade methods plus the squad battle helpers. The helpers are created
// early so the fight paths can share them; combat re-entry goes through a late-bound bridge.

import { executeRunFullDungeon } from './runFullDungeon.ts';
import type { AllyActionProvider, CombatantSpec, CombatSession } from '../combat.ts';
import { unsummonTotemsOnLeaveWorld } from '../combat/sessionDeaths.ts';
import type { SquadUpgradeRow } from './types.ts';
import type { EquipSlot, GatherNodeDef, InstanceDef, SkillLine } from '../../data/schema.ts';
import { CLASS } from '../../data/schema.ts';
import { hasAttrEx2, SPELL_ATTR_EX2 } from '../spells/spellAttributes.ts';
import {
  refuseIfDead,
  refuseIfDeadOrInCombat,
  refuseIfInCombat,
  YOU_ARE_IN_COMBAT,
} from '../../domain/run/death.ts';
import {
  type Companion,
  addCompanion,
  removeCompanion,
  companionRaceFor,
  companionCharacter,
  companionSpec,
  companionPetSpec,
  companionSpellbook,
  companionName,
  companionGender,
  companionLevel,
  stableIdHash,
  defaultXpLocked,
  MAX_COMPANIONS,
  MAX_ROSTER,
  maxCompanionsFor,
  placeHire,
  rosterSize,
  type SquadRole,
  isSquadRole,
} from '../../domain/bots/squad.ts';
import { describeRaidComp, partyRaidSubgroups } from '../../domain/raid/raidComp.ts';
import {
  clampRosterPicks,
  fillOwnedInstanceRoster,
  isRaidLineupSize,
  raidLineupCap,
  type RosterPickBody,
} from '../../domain/raid/instanceRoster.ts';
import { reconcileGamePartyAuras } from './partyAuras.ts';
import { restoreRaidPartySeating } from './raidParty.ts';
import { seatPartyForRun } from './squad/squadDungeonSeating.ts';
import { fanStopsAtSubgroup, type HealApplyTo } from '../combat/healTargets.ts';
import { sessionSeedFromWorldCooldowns } from '../spells/recovery.ts';
import { RAID_TIERS, RAID_TIER_IDS, raidRosterTemplate } from '../../domain/raid/raidRosterTemplate.ts';
import {
  innSlate,
  innZoneSalt,
  pickProfile,
  ensureSlateProfileMix,
  searchWorldBots,
  worldBot,
  type BotSearchFilters,
  type WorldBot,
} from '../../domain/bots/botPool.ts';
import {
  DEFAULT_HIRE_GEAR_PROFILE,
  GEAR_PROFILES,
  generateSpawnGear,
  isGearProfile,
  type GearProfile,
} from '../../domain/bots/botGear.ts';
import {
  hireCostCopper,
  hirePriceLabel,
  displayGearScore,
} from '../../domain/bots/companionHireCost.ts';
import { generateSpawnInventory } from '../../domain/bots/botInventory.ts';
import { SHARE_CATEGORIES, normalizeConsumableShare, planConsumableShare, shareMemberOf, shareMemberOfYou, shareRowsOf } from '../../domain/bots/consumableShare.ts';
import { sendGoodsUpgradeKey } from '../../domain/bots/sendTradeGoods.ts';
import {
  initBotPet,
  applyCompanionPetSync,
  setCompanionPetCreature,
} from '../../domain/bots/botPet.ts';
import {
  applyCompanionItemPrep,
  applyPlayerItemPrep,
  isWeaponImbueItem,
} from '../../domain/bots/companionPrep.ts';
import { writeCompanionStandings } from '../../domain/bots/companionRep.ts';
import {
  companionQuestLog,
  companionQuestOffers,
  type CompanionQuestOffer,
  type CompanionQuestPlace,
} from '../../domain/bots/companionQuests.ts';
import {
  acceptCompanionQuest as acceptCompanionQuestAction,
  turnInCompanionQuest as turnInCompanionQuestAction,
} from './companionQuestActions.ts';
import { companionBagHandle, overflowLine, partyOverflow } from './bagOverflow.ts';
import { abandon as abandonQuest } from '../../domain/quests/questlog.ts';
import { consume } from '../../progression/rest.ts';
import { resolveCombatSpell } from '../spells/interpreter/index.ts';
import { grantSpellReputationEffects } from './spellReputation.ts';
import { scanTempWeaponImbueHands } from '../../domain/professions/weaponImbueHand.ts';
import { routeWeaponImbueItem, type LiveImbueUnit } from './weaponImbueItem.ts';
import {
  ensurePartyBuffRows,
  ensureKnownDispelRows,
  raidRowOptionsOf,
  stripStoredRaidRows,
  withRaidTacticRows,
} from '../../domain/rotation/rotation.ts';
import type { ItemRuleHand, RotationProfileId } from '../../domain/rotation/rotation.ts';
import { companionSkillMap } from '../../domain/bots/squad.ts';
import { announceCompanionRanks, syncCompanionProfessionTools } from './companionTraining.ts';
import { talentsFromLink } from '../../domain/character/talentLink.ts';
import {
  companionTrainedRank,
  professionSkillCap,
  syncCompanionProfessionCatalog,
  initInventorySkill,
} from '../../domain/bots/botProfessions.ts';
import {
  canCompanionLearnProfession,
  energyCostForHours,
  gatherMissionSkillGain,
  isMissionSkill,
  missionWorkSkill,
  MAX_MISSION_HOURS,
  missionEtaLabel,
  missionProgress,
  normalizeCompanionMission,
  partyEnergy,
  recommendGatherZones,
  spendPartyEnergy,
  workableZoneNodes,
  workableZoneSkinNodes,
  zoneMissionYield,
  type CompanionProfessionMap,
  type MissionSkill,
} from '../../domain/bots/companionMissions.ts';
import {
  partyDeposit,
  partyMergedStacks,
  partyTake,
  partyTakeToBags,
  stackBoundToHolder,
  type PartyVaultCtx,
  type VaultMutators,
} from '../../domain/raid/partyVault.ts';
import { vendorShortfall, type VendorReagentBuy } from '../../domain/professions/vendorReagents.ts';
import { buyNames } from './reagentBuyIn.ts';
import { craft as doCraft } from '../../domain/professions/professions.ts';
import { partyHeldTools } from '../../domain/professions/heldTools.ts';
import {
  recipeCooldownRemainingMs, stampRecipeCooldown, craftCooldownLabel,
} from '../../domain/professions/craftCooldown.ts';
import { applyEnchant as doApplyEnchant } from '../../domain/professions/enchanting.ts';
import { zoneSpawns } from '../../world/world.ts';
import { itemTeachIntent } from '../../domain/items/itemTeaches.ts';
import { hashSeed, mulberry32 } from '../core/rng.ts';
import { seedDuelGeometry } from './combatSeed.ts';
import { playerFightActionProvider } from './rotation.ts';
import type { ActiveAura, Character, EquippedMap } from '../../domain/character/character.ts';
import { applyAura, buildCombatant, combatItems } from '../../domain/character/character.ts';
import { canChallenge, createDuelSession } from '../../domain/run/duel.ts';
import { canInteractWithCreature } from '../../domain/creature/faction.ts';
import { factionOf } from '../../domain/character/races.ts';
import {
  isMultiTargetCombatSpell,
  isRotationValid,
  rotationBandOptionsOf,
  type Rotation,
} from '../../domain/rotation/rotation.ts';
import {
  applyCompanionRole,
  botSpecIdxForRole,
  specIdxForRole,
  buildCompanionRotation,
  companionHasPvpBand,
  companionActionProvider,
} from '../../domain/bots/companionRotation.ts';
import { buildActionProvider, type ActionProviderSpec } from '../../domain/bots/actionProviderSpec.ts';
import {
  isCompanionKeepUpSpell,
  keepUpAuraDurationMs,
  syncCompanionBagItemRules,
  companionActiveProfile,
  companionHasDpsProfile,
  companionRotationSigDiffers,
  companionRotationSlot,
  companionRotationOf,
  setCompanionRotationSlot,
} from '../../domain/bots/companionRotation.ts';
import {
  activeProfile,
  addProfile,
  MAX_ROTATION_PROFILES,
  migrateLegacyProfiles,
  removeProfile,
  renameProfile,
  setActiveProfile,
  syncActiveFromMirror,
} from '../../domain/rotation/rotationProfiles.ts';
import { vsClassVariant } from '../../domain/rotation/rotationSuggestions.ts';
import {
  companionEligibleSpellIds,
  ensureCompanionActionBars,
  equippedOnUseEntries,
  growBarsForAutofill,
  resolveCompanionActionBars,
  seedCompanionActionBars,
  topUpCompanionActionBars,
} from '../../domain/bots/companionActionBar.ts';
import {
  addBar as addActionBarPure,
  removeBar as removeActionBarPure,
  setSlot as setBarSlot,
  setItemSlot as setBarItemSlot,
  clearSlot as clearBarSlot,
  autofill as autofillBars,
  replaceSpell as replaceBarSpell,
} from '../../domain/character/actionbar.ts';
import { normalizeAutopilotConfig } from '../../autopilot/config.ts';
import {
  conjurableProvisions,
  planPrePull,
  usableProvisionsFor,
  type ConjurableProvision,
  type PartyCaster,
  type PlannedBuff,
  type PlannedHandout,
} from '../../domain/bots/prePullBuffs.ts';
import { planSoulstone } from '../../domain/run/deathRecovery.ts';
import {
  healthstoneRunLog,
  runPrePullHealthstones,
  stoneHolder,
} from './prePullHealthstones.ts';
import { className, SOUL_SHARD_ITEM } from '../../domain/core/ids.ts';
import { findUpgrades } from '../../domain/items/equipmentHelper.ts';
import {
  equipItem, bagCapacity, DUAL_WIELD_SPELL_ID, type EquipOpts,
} from '../../domain/items/equipment.ts';
import {
  characterPlayerbotSpecId,
  companionPlayerbotSpecId,
  playerbotWeightScale,
} from '../../domain/bots/playerbotStatWeight.ts';
import { paladinPartyMembers } from './paladinBoard.ts';
import { normalizePaladinAssignments } from '../../domain/rotation/paladinBuffs.ts';
import {
  mergePaladinChips,
  planPartyPaladinBuffs,
  restampPaladinRotation,
  type PaladinPartyMember,
} from '../../domain/bots/paladinPrePull.ts';
import { knows, resolveSpellId } from '../../domain/character/spellbook.ts';
import { petPowerSpec, petRepertoireHas } from '../../domain/pet/pet.ts';
import { lowerRanksFor } from '../../domain/character/characterSpells.ts';
import { isSpellFitByClassAndRace, spellHasClassRestrictingAbility, spellLearnDependents } from '../../domain/character/combatSkills.ts';
import { canFitWithBagFamily } from '../../domain/items/ammo.ts';
import type { Inventory } from '../../domain/items/inventory.ts';
import { ownedInventory } from '../../domain/items/keyring.ts';
import {
  emptyInventory, addItem, addInstance, removeItem, removeStack, transferItem, takeStack, canFit,
  countItem, usedSlots,
} from '../../domain/items/inventory.ts';
import { buyBack, sellStack } from '../../domain/economy/trading.ts';
import type { ItemInstance, EquippedValue } from '../../domain/items/itemInstance.ts';
import { equippedEntry, equippedInstance } from '../../domain/items/itemInstance.ts';
import { buildEntryLockInputs } from '../../domain/run/canEnterContext.ts';
import {
  deposit, withdraw, depositStack, withdrawStack, bankCapacity, buyBankBagSlot,
  equipBankBag, unequipBankBag,
} from '../../domain/items/bank.ts';
import {
  enterRunWithRoute,
  resetRun,
  canEnter,
  lockRemainingMs,
  itemDropsInsideInstance,
  saveRunOnLeave,
  restoreSavedRun,
  pruneInstanceSaves,
  hasFlag,
} from '../../world/instances.ts';
import { entranceForInstance } from '../../data/dungeons/pack-from-clusters.ts';
import { DIRE_MAUL_WEST_FLAGS } from '../../data/dungeons/dire-maul-west.ts';
import {
  applyInstanceOnPlayerEnter,
  scriptDevByName,
  INSTANCE_DATA,
} from '../../domain/scriptdev/index.ts';
import { TYPE_WARPWOOD } from '../../domain/scriptdev/direMaul.ts';
import {
  persistScriptInstanceData,
  scriptInstanceDataMap,
} from './scriptDevGoUse.ts';
import { canTakeQuestForCondition, lootDropAllowed, questConditionSnapshot } from '../../quests/quests.ts';
import { auraIdsForSnapshot } from '../spells/conditions.ts';
import {
  DEFAULT_PULL_FUSION,
  DEFAULT_ROUTE_DENSITY,
  isPullFusion,
  isRouteDensity,
} from '../../world/dungeonRoute.ts';
import { dungeonSpawnsForMap } from '../../data/dungeonSpawns.ts';
import {
  DUNGEON_POOL_ROLL_SALT,
  poolRollFromPersisted,
  rollDungeonPools,
  type DungeonPoolRoll,
} from '../../world/rareRoll.ts';
import {
  DUNGEON_GO_POOL_ROLL_SALT,
  rollDungeonGoPools,
} from '../../world/goPoolRoll.ts';
import type { BakedPoolRow } from '../../domain/world/pools.ts';
import type {
  ActionResult,
  BeginFight,
  FightOutcome,
  Game,
  InnCandidate,
} from './types.ts';
import type { GameCtx } from './context.ts';
import { moneyMarked } from '../../domain/economy/money.ts';

// Helpers (early — before startFight)

export type SquadHelpers = {
  ensureCompanionRotation: (comp: Companion, profile?: RotationProfileId) => Rotation;
  ensureCompanionProfileList: (comp: Companion) => void;
  syncCompanionPetAfterLevel: (comp: Companion, leveledTo: readonly number[]) => void;
  buildSquadBattleParty: (targetEntry?: number) => {
    allySpecs: CombatantSpec[];
    allyActionProviders: (AllyActionProvider | null)[];
    allyProviderSpecs: (ActionProviderSpec | null)[];
    allyPetIndex: (number | null)[];
  };
  doApplyPrePullBuffs: () => { buffs: PlannedBuff[]; handouts: PlannedHandout[] };
  doRefreshPartyWeaponCoats: () => number;
  /** Cast the PallyPower board. `topUpOnly` casts only what is not already up. */
  doApplyPaladinBuffs: (now: number, opts: { topUpOnly: boolean }) => number;
  applyCompanionImbue: (compId: string, itemEntry: number, hand?: ItemRuleHand) => boolean;
  innkeeperHere: () => { entry: number; name: string } | undefined;
  spawnGearFor: (bot: WorldBot) => EquippedMap;
  innCandidates: () => InnCandidate[];
  searchInnCandidates: (filters: BotSearchFilters) => InnCandidate[];
  resolveCandidate: (botId: string) => InnCandidate | undefined;
  findCompanion: (id: string) => Companion | undefined;
  equipOnCompanion: (
    comp: Companion,
    itemEntry: number,
    preferred?: EquipSlot,
  ) => { ok: boolean; reason?: string; slot?: EquipSlot };
};

export type SquadHelpersExtras = {
  // The live unit that owns a companion's weapon while a session is open: buff-up runs BETWEEN pulls
  // with the floor shell still open, so a stone applied there has to reach the ally Fighter.
  liveImbueUnit?: LiveImbueUnit;
};

// Squad battle + inn/hire helpers. Create early (before startFight) so combat can share
// buildSquadBattleParty / syncCompanionPetAfterLevel.
export function createSquadHelpers(ctx: GameCtx, extras: SquadHelpersExtras = {}): SquadHelpers {
  const { ds, state, log } = ctx;

  // Subgroup per party seat - player at 0, companion `i` at `i + 1`. One call, so the combat specs, the
  // pre-pull buff plan and the raid editor cannot disagree about who is in a group.
  const partySubgroups = (squad: readonly Companion[]): number[] => partyRaidSubgroups(
    { cls: state.char.cls, role: state.squadRole ?? 'dps' },
    squad.map((c) => ({ cls: c.cls, role: c.role, key: c.id })),
    state.autopilot?.raidSeating ?? null,
  );

  // A companion's rotation, lazily seeding and persisting the role-adapted class default when absent
  // or class-mismatched; custom edits are kept. Below: seed its named list from the legacy slots.
  const ensureCompanionProfileList = (comp: Companion): void => {
    if (comp.rotationProfiles?.length) {
      if (!comp.activeRotationProfileId) {
        comp.activeRotationProfileId = comp.rotationProfiles[0]!.id;
        comp.rotation = comp.rotationProfiles[0]!.rotation;
      }
      return;
    }
    ensureCompanionRotation(comp, 'primary');
    const list = migrateLegacyProfiles(comp, {
      primary: comp.role === 'tank' ? 'Tank' : comp.role === 'healer' ? 'Heal' : 'Main',
      dps: 'Damage',
    });
    comp.rotationProfiles = list;
    const wantDps = comp.rotationProfile === 'dps' && list.length > 1;
    const act = wantDps ? list[1]! : list[0]!;
    comp.activeRotationProfileId = act.id;
    comp.rotation = act.rotation;
  };

  const ensureCompanionRotation = (
    comp: Companion,
    profile: RotationProfileId = companionActiveProfile(comp),
  ): Rotation => {
    const lvl = companionLevel(comp, state.char.level);
    const cur = companionRotationSlot(comp, profile);
    // A dps-slot list is stamped role 'dps'; only the primary slot tracks the squad role.
    const wantRole = profile === 'dps' ? 'dps' : comp.role;
    const roleDrift =
      cur?.autoSig?.role != null
      && cur.autoSig.role !== wantRole
      && !cur.custom;
    // Which pool the stored list came from. A `+ PvP` companion profile was drift against the PvE
    // ladder on every read, so the refresh below rebuilt it as the PvE list.
    const mode = rotationBandOptionsOf(cur);
    let rebuilt = true;
    if (!cur || !isRotationValid(cur, comp.cls) || roleDrift) {
      // Role change or missing seed → pack default for the profile's band (same as player).
      setCompanionRotationSlot(comp, profile, buildCompanionRotation(comp, lvl, ds, profile, mode));
    } else if (!cur.custom && !cur.autoSig?.role
      && (comp.role === 'tank' || comp.role === 'healer')) {
      // Pre-role-stamp save: rebuild once so Arms kits become Protection packs.
      setCompanionRotationSlot(comp, profile, buildCompanionRotation(comp, lvl, ds, profile, mode));
    } else if (!cur.custom && companionRotationSigDiffers(comp, lvl, ds, cur, profile, mode)) {
      // Kit drift: they levelled or respecced since this default was generated, so every trainer rank
      // granted above the seed level was known and never cast. The same test the player gets.
      setCompanionRotationSlot(comp, profile, buildCompanionRotation(comp, lvl, ds, profile, mode));
    } else {
      rebuilt = false;
    }
    // A new rank has to reach the FLOOR too, and bars have no custom flag to protect hand placement,
    // so top up empty slots and swap superseded ranks in place, never reseed.
    if (rebuilt && comp.actionBars && profile === companionActiveProfile(comp)) {
      comp.actionBars = topUpCompanionActionBars(comp, state.char.level, ds);
    }
    // Always re-sync bag consumable rules: hire seeds once, gifts arrive later (M7 potions).
    {
      const char = companionCharacter(comp, lvl, ds);
      const slot = companionRotationSlot(comp, profile)!;
      // Legacy hires still hold the eight raid rows the old builder wrote into every save. They compose
      // per raid now, so a stored one is a dead row that shifts every index the editor prints.
      const pruned = stripStoredRaidRows(slot);
      // The party half of each keep-up, on the same always-re-sync footing as the bag rules: a saved
      // list predates the row, and a stored default only rebuilds on a level or a respec.
      const withParty = ensurePartyBuffRows(pruned, ds);
      // Same footing for a known dispel no row names — Tranq Shot on a list built before the book.
      const withDispel = ensureKnownDispelRows(
        withParty,
        companionSpellbook(comp, lvl, ds),
        ds,
      );
      const withItems = syncCompanionBagItemRules(withDispel, char, comp.bags, ds);
      if (withItems !== slot) setCompanionRotationSlot(comp, profile, withItems);
    }
    // Raid rows ride on the way OUT, never into the slot: 39 of 40 bodies are companions, so
    // skipping this makes the whole raid-scoped set invisible on the floor.
    const composed = withRaidTacticRows(
      companionRotationSlot(comp, profile)!,
      state.instance?.dungeonId,
      companionCharacter(comp, companionLevel(comp, state.char.level), ds),
      companionSpellbook(comp, companionLevel(comp, state.char.level), ds),
      ds,
      raidRowOptionsOf(state),
    );
    // Threat watch, the same knob and rule shape as the player's. It was player-only, and 39 of 40
    // bodies in a raid are companions, so it governed one unit and the raid peeled every boss.
    if (normalizeAutopilotConfig(state.autopilot).threatWatch && comp.role === 'dps') {
      const hasHalt = (['combat', 'recovery'] as const).some((ph) =>
        composed.phases[ph].some(
          (r) => r.action.kind === 'halt_dps' && r.conditions.some((c) => c.metric === 'hasAggro'),
        ),
      );
      if (!hasHalt) {
        return {
          ...composed,
          phases: {
            ...composed.phases,
            combat: [
              {
                id: 'g-comp-threat-watch',
                action: { kind: 'halt_dps' as const },
                conditions: [
                  { subject: 'self' as const, metric: 'hasAggro' as const, op: '==' as const, value: 1 },
                ],
                enabled: true,
              },
              ...composed.phases.combat,
            ],
          },
        };
      }
    }
    return composed;
  };

  /** Level-sync companion pet ranks (and revive) after XP grants. Logs when new ranks appear. */
  const syncCompanionPetAfterLevel = (comp: Companion, leveledTo: readonly number[]): void => {
    const lvl = companionLevel(comp, state.char.level);
    const { ranksGrew } = applyCompanionPetSync(comp, lvl, ds);
    if (ranksGrew && leveledTo.length > 0 && comp.pet) {
      log(`${comp.name}'s ${comp.pet.name} learns new abilities.`);
    }
    // A primary opens at level 5, so the hire kit of a level 1-4 body carried no pick, knife or rod.
    announceCompanionRanks(comp, lvl, ds, log);
    syncCompanionProfessionTools(comp, lvl, ds);
  };

  // The engine-ready group-fight bundle for the active squad: companions first, index-aligned with the
  // squad, then their pets. An empty squad gives empty arrays so a solo session stays byte-identical.
  const buildSquadBattleParty = (targetEntry?: number): {
    allySpecs: CombatantSpec[];
    allyActionProviders: (AllyActionProvider | null)[];
    /** The plain-data half of each provider, index-aligned, for a Worker to rebuild the same brain. */
    allyProviderSpecs: (ActionProviderSpec | null)[];
    /** Human ally index → pet ally index (for rotation pet subject). */
    allyPetIndex: (number | null)[];
  } => {
    const allySpecs: CombatantSpec[] = [];
    const allyActionProviders: (AllyActionProvider | null)[] = [];
    const allyProviderSpecs: (ActionProviderSpec | null)[] = [];
    const allyPetIndex: (number | null)[] = [];
    const squad = state.squad ?? [];
    // Long CDs ride in from the world clock, same as the player's (combatSession initSpellCds).
    const cdNow = Date.now();
    // Drink, eat, coat from bags NOW so the spec that follows already carries the aura. Buff-up
    // only ran at dungeon zone-in, so a world pull left every shared elixir sitting unused.
    {
      const drunk = applyPlayerItemPrep(state.char, state.inventory, ds, cdNow, log);
      if (drunk.spent) { state.char = drunk.char; state.inventory = drunk.inventory; }
      for (const c of squad) {
        const lvl = companionLevel(c, state.char.level);
        applyCompanionItemPrep(c, ensureCompanionRotation(c), {
          ds, now: cdNow, char: companionCharacter(c, lvl, ds),
          applyImbue: applyCompanionImbue, log,
        });
      }
    }
    // Raid subgroups: the player holds seat 0 and each companion the next. Party targets stop at the
    // caster's subgroup, so this decides who a Prayer of Healing reaches. A 5-man is one group.
    const subgroups = partySubgroups(squad);
    for (let i = 0; i < squad.length; i++) {
      const comp = squad[i]!;
      const lvl = companionLevel(comp, state.char.level);
      // Legacy hires / level-ups: ensure pet kit exists and is full HP between pulls.
      applyCompanionPetSync(comp, lvl, ds);
      // This IS the engage. A rogue stealths here and nowhere earlier — a sneak costs 30-50%
      // movement (aura 33), so stealthing for the walk in would leave it behind the party.
      // NOT seated in the list's opening form (`openerForm`), deliberately: makeFighter applies a
      // seeded form's attack time and not its power bar, so a druid seeded into Cat Form stands
      // there on 2464 mana with no energy and cannot pay for Claw. Measured both ways on one seat:
      // seeded reads powerType mana / maxPower 2464, shifted by casting 768 reads energy / 100.
      // Until that is fixed the pull's own `Cat Form` row is the correct path — it costs one GCD
      // and goes through enterForm. Ledger: capabilities/manaBarBehindTheForm.mjs seatSeededForm*.
      const rot = ensureCompanionRotation(comp);
      const spec = companionSpec(comp, lvl, ds, {
        stealthForPull: true, spellCooldowns: comp.spellCooldowns, now: cdNow,
      });
      // Spend the cooldown the entry cost, so initialSpellCooldowns below carries it into the
      // fight and a chain-pull inside 10 s finds it hot. Cite: spell_template 1784-1787.
      const sneakId = spec.stealth?.spellId ?? 0;
      if (sneakId) {
        const sneakCd = ds.spell(sneakId)?.cooldownMs ?? 0;
        if (sneakCd > 0) (comp.spellCooldowns ??= {})[sneakId] = cdNow + sneakCd;
      }
      // Companion.role 'dps' is the engine's 'damage' groupRole (S0 role AI + views).
      spec.groupRole = comp.role === 'dps' ? 'damage' : comp.role;
      spec.subgroup = subgroups[i + 1] ?? 0;
      spec.initialSpellCooldowns = sessionSeedFromWorldCooldowns(comp.spellCooldowns, cdNow);
      spec.initialCategoryCooldowns = sessionSeedFromWorldCooldowns(comp.categoryCooldowns, cdNow);
      allySpecs.push(spec);
      // Built from PLAIN DATA, not a live companion ref (S6b): the mid-fight knob toggles that ref
      // existed for now arrive per tick as `SimTickInputs.companionKnobs`, so this is portable.
      const providerSpec: ActionProviderSpec = {
        rotation: rot, ...(targetEntry != null ? { targetEntry } : {}),
      };
      allyActionProviders.push(buildActionProvider(providerSpec, ds));
      allyProviderSpecs.push(providerSpec);
      allyPetIndex.push(null); // filled after pets are appended
    }
    // Companion pets after the squad so allyIndex 0..n-1 still maps to companions.
    for (let i = 0; i < squad.length; i++) {
      const comp = squad[i]!;
      const pet = companionPetSpec(comp, companionLevel(comp, state.char.level), ds);
      if (!pet) continue;
      // A pet is not a Group member but rides its owner's subgroup (FillRaidOrPartyTargets
      // takes each in-group player's pet with it). Cite: Spell.cpp:7345–7350.
      pet.subgroup = allySpecs[i]?.subgroup;
      pet.initialSpellCooldowns = sessionSeedFromWorldCooldowns(comp.pet?.spellCooldowns, cdNow);
      pet.initialCategoryCooldowns = sessionSeedFromWorldCooldowns(comp.pet?.categoryCooldowns, cdNow);
      allyPetIndex[i] = allySpecs.length;
      allySpecs.push(pet);
      // No edited rotation: S0 damage heuristics cast the pet's known spells (Firebolt, etc.).
      allyActionProviders.push(null);
      allyProviderSpecs.push(null);
    }
    return { allySpecs, allyActionProviders, allyProviderSpecs, allyPetIndex };
  };

  // Coat one companion's weapon from THEIR OWN bags: the bound router debits the player, which is
  // wrong here, so call the unbound one with their bags and a setter that writes them back.
  const applyCompanionImbue = (
    compId: string,
    itemEntry: number,
    hand?: ItemRuleHand,
  ): boolean => {
    const comp = (state.squad ?? []).find((c) => c.id === compId);
    if (!comp) return false;
    const res = routeWeaponImbueItem(
      itemEntry,
      { target: { kind: 'companion', id: compId }, ...(hand != null ? { slot: hand } : {}) },
      {
        ds,
        char: state.char,
        inventory: comp.bags ?? emptyInventory(),
        // Their vial, their weapon: the wearer is the caster, so ownItemOnly does not refuse it.
        byWearer: true,
        squad: state.squad,
        setPlayer: () => {},
        setCompanion: (id, patch, inventory) => {
          const c = (state.squad ?? []).find((x) => x.id === id);
          if (!c) return;
          c.equipped = patch.equipped;
          c.tempEnchants = patch.tempEnchants;
          c.bags = inventory;
        },
        log,
        ...(extras.liveImbueUnit ? { liveUnit: extras.liveImbueUnit } : {}),
      },
    );
    return !!res?.ok;
  };

  // Item prep between pulls: coats plus elixirs and Well Fed. Zone-in was the only full
  // caller, so a shared flask sat unused after the first pack.
  const doRefreshPartyWeaponCoats = (): number => {
    const now = Date.now();
    const drunk = applyPlayerItemPrep(state.char, state.inventory, ds, now, log);
    if (drunk.spent) { state.char = drunk.char; state.inventory = drunk.inventory; }
    let n = drunk.spent;
    for (const c of state.squad ?? []) {
      const lvl = companionLevel(c, state.char.level);
      n += applyCompanionItemPrep(c, ensureCompanionRotation(c), {
        ds,
        now,
        char: companionCharacter(c, lvl, ds),
        applyImbue: applyCompanionImbue,
        log,
      });
    }
    return n;
  };

  /**
   * Cast the party's Blessings and Auras from the PallyPower board, and point every paladin's
   * buffs phase at what it was given.
   *
   * `topUpOnly` is the swap path: it casts ONLY what a body is not already carrying from that
   * paladin, so editing the grid takes effect at once without re-charging a Symbol of Kings for a
   * Greater that is already up. The pull path re-casts the lot, which is what it always did.
   */
  const doApplyPaladinBuffs = (now: number, opts: { topUpOnly: boolean }): number => {
    const squad = state.squad ?? [];
    const members: PaladinPartyMember[] = paladinPartyMembers(state, ds);
    const board = normalizePaladinAssignments(state.paladinAssignments);
    const pal = planPartyPaladinBuffs(members, ds, now, board);
    if (!pal.byKey.size) return 0;

    // What each body already holds from each paladin, so a top-up can tell a cast from a no-op.
    const carried = (bodyKey: string): readonly ActiveAura[] => {
      if (bodyKey === 'player') return state.char.activeAuras ?? [];
      if (bodyKey === 'player:pet') return state.char.pet?.prePullAuras ?? [];
      const [ownerId, isPet] = bodyKey.endsWith(':pet')
        ? [bodyKey.slice(0, -4), true] as const
        : [bodyKey, false] as const;
      const c = squad.find((x) => x.id === ownerId);
      if (!c) return [];
      return (isPet ? c.pet?.prePullAuras : c.prePullAuras) ?? [];
    };
    const alreadyUp = (bodyKey: string, chip: ActiveAura): boolean => carried(bodyKey).some(
      (a) => a.spellId === chip.spellId && (a.fromCaster ?? null) === (chip.fromCaster ?? null),
    );

    let cast = 0;
    const byKey = new Map<string, ActiveAura[]>();
    for (const [bodyKey, chips] of pal.byKey) {
      const want = opts.topUpOnly ? chips.filter((c) => !alreadyUp(bodyKey, c)) : chips;
      if (want.length) byKey.set(bodyKey, want);
      cast += want.length;
    }
    if (!cast) return 0;

    // A Greater Blessing eats its Symbol of Kings, same as any other cast reagent. Without this
    // the 15 min ranks were free forever. Cite: Spell.cpp TakeReagents ~4332-4350. A top-up only
    // pays for the (paladin, family, class) casts it actually made.
    const paidFor = new Set<string>();
    for (const b of pal.blessings) {
      if (!b.greater) continue;
      if (!byKey.get(b.on)?.some((c) => c.spellId === b.spellId)) continue;
      const on = members.find((m) => m.key === b.on || m.pet?.key === b.on);
      paidFor.add(`${b.from}|${b.family}|${on?.pet?.key === b.on ? 'pet' : on?.cls ?? 0}`);
    }
    for (const r of pal.reagents) {
      const owed = opts.topUpOnly
        ? [...paidFor].filter((k) => k.startsWith(`${r.from}|`)).length
        : r.count;
      if (owed <= 0) continue;
      if (r.from === 'player') {
        state.inventory = removeItem(state.inventory, r.item, Math.min(owed, r.count))[0];
        continue;
      }
      const c = squad.find((x) => x.id === r.from);
      if (c) c.bags = removeItem(c.bags ?? emptyInventory(), r.item, Math.min(owed, r.count))[0];
    }

    for (const chip of byKey.get('player') ?? []) {
      state.char = applyAura(
        state.char, chip.spellId,
        chip.expiresAt != null ? chip.expiresAt - now : 0,
        now, ds, chip.fromCaster != null ? { fromCaster: chip.fromCaster } : undefined,
      );
    }
    if (state.char.pet && state.char.pet.health > 0) {
      state.char.pet.prePullAuras = mergePaladinChips(
        state.char.pet.prePullAuras, byKey.get('player:pet'), ds,
      );
    }
    for (const c of squad) {
      c.prePullAuras = mergePaladinChips(c.prePullAuras, byKey.get(c.id), ds);
      if (c.pet && c.pet.health > 0) {
        c.pet.prePullAuras = mergePaladinChips(c.pet.prePullAuras, byKey.get(`${c.id}:pet`), ds);
      }
    }
    // The live rotation must agree with the plan, or the paladin the plan put on Devotion recasts
    // its packaged Retribution Aura on its first out-of-combat tick — and a paladin handing out two
    // families needs a keep-up row for BOTH or the second one silently expires mid-run.
    for (const c of squad) {
      if (c.cls !== CLASS.PALADIN) continue;
      const rot = ensureCompanionRotation(c);
      const next = restampPaladinRotation(rot, pal, c.id, ds);
      if (next !== rot) setCompanionRotationSlot(c, companionActiveProfile(c), next);
    }
    // A player paladin keeps its own party up too. Written to the active profile AND the mirror,
    // the pair every other in-place rotation edit writes. Cite: rotation.ts:310-313.
    if (state.char.cls === CLASS.PALADIN && state.rotation) {
      const next = restampPaladinRotation(state.rotation, pal, 'player', ds);
      if (next !== state.rotation) {
        const i = (state.rotationProfiles ?? []).findIndex(
          (p) => p.id === state.activeRotationProfileId,
        );
        if (i >= 0) state.rotationProfiles![i] = { ...state.rotationProfiles![i]!, rotation: next };
        state.rotation = next;
      }
    }
    for (const b of pal.blessings) {
      if (!byKey.get(b.on)?.some((c) => c.spellId === b.spellId)) continue;
      const sp = ds.spell(b.spellId);
      const on = members.find((m) => m.key === b.on || m.pet?.key === b.on);
      const from = members.find((m) => m.key === b.from);
      if (sp && on && from) log(`${from.name} casts ${sp.name} on ${on.name}`);
    }
    return cast;
  };

  // "Buff up" before a pull (item 6). Local so both the public method and runFullDungeon reuse it.
  const doApplyPrePullBuffs = (): { buffs: PlannedBuff[]; handouts: PlannedHandout[] } => {
    const now = Date.now();
    const squad = state.squad ?? [];
    // Providers: you + each companion. Single-target buffs (Fortitude, Blessing of Might) do
    // land on everyone; the party-scoped ones only reach their caster's own subgroup.
    const casters: PartyCaster[] = [
      { name: state.char.name, spellbook: state.spellbook },
      ...squad.map((c) => ({
        name: c.name,
        spellbook: companionSpellbook(c, companionLevel(c, state.char.level), ds),
      })),
    ];
    const plan = planPrePull(casters, ds);

    // Same seating as buildSquadBattleParty — one plan, or the buff a companion carries in is
    // not the buff their group's casters can supply once the fight starts.
    const subgroups = partySubgroups(squad);
    const isPartyScoped = (b: PlannedBuff): boolean => {
      const sp = ds.spell(b.spellId);
      if (!sp) return false;
      const applyTo = sp.effects
        .map((e) => (e as { applyTo?: HealApplyTo }).applyTo)
        .find((a) => a != null);
      return fanStopsAtSubgroup(sp, applyTo);
    };
    // Single-target and greater blessings are cast on anyone by anyone, so the raid-wide plan stands.
    // A party-scoped buff comes from its OWN subgroup's casters — 4 of 12 planned buffs are scoped.
    const openBuffs = plan.buffs.filter((b) => !isPartyScoped(b));
    const castersByGroup: PartyCaster[][] = [];
    casters.forEach((c, seat) => {
      const g = subgroups[seat] ?? 0;
      (castersByGroup[g] ??= []).push(c);
    });
    const groupBuffs = castersByGroup.map((cs) => planPrePull(cs, ds).buffs.filter(isPartyScoped));
    const buffsFor = (group: number): PlannedBuff[] => [...openBuffs, ...(groupBuffs[group] ?? [])];

    // Item prep first so a drunk elixir cannot exclusivity-drop a party aura applied next.
    {
      const drunk = applyPlayerItemPrep(state.char, state.inventory, ds, now, log);
      if (drunk.spent) { state.char = drunk.char; state.inventory = drunk.inventory; }
    }
    // Apply your own set (applyAura refreshes any rank you already had from prepOoc).
    for (const b of buffsFor(subgroups[0] ?? 0)) state.char = applyAura(state.char, b.spellId, b.durationMs, now, ds);
    // Companions carry theirs as transient auras (one per family → no stacking to dedup).
    const auraRow = (b: PlannedBuff) => ({
      spellId: b.spellId,
      ...(b.durationMs > 0 ? { expiresAt: now + b.durationMs } : {}),
    });
    squad.forEach((c, i) => {
      c.prePullAuras = buffsFor(subgroups[i + 1] ?? 0).map(auraRow);
    });
    // A pet rides its owner's subgroup and takes the owner's list with it.
    // Cite: Spell.cpp:7345-7350 FillRaidOrPartyTargets withPets.
    if (state.char.pet && state.char.pet.health > 0) {
      state.char.pet.prePullAuras = buffsFor(subgroups[0] ?? 0).map(auraRow);
    }
    squad.forEach((c, i) => {
      if (c.pet && c.pet.health > 0) c.pet.prePullAuras = buffsFor(subgroups[i + 1] ?? 0).map(auraRow);
    });

    // Paladin Blessings and Auras. One Blessing per paladin per body (spell_group 7 is
    // UNIQUE_PER_CASTER), chosen off the target's class and role, and one DISTINCT aura per
    // paladin. Cite: PlayerbotPaladinAI.cpp:412-450 CheckAuras, :643-716 BuffHelper.
    doApplyPaladinBuffs(now, { topUpOnly: false });

    // Rotation buffs-phase keep-ups: the pre-pull plan only covers party-wide buffs, so a self toggle
    // like Righteous Fury never reached it and the tank pulled without its holy threat.
    for (const c of squad) {
      const rot = ensureCompanionRotation(c);
      for (const r of rot.phases.buffs) {
        if (!r.enabled || r.action.kind !== 'spell') continue;
        const sp = ds.spell(r.action.spellId);
        if (!sp || !isCompanionKeepUpSpell(sp)) continue;
        if (c.prePullAuras!.some((a) => a.spellId === sp.id)) continue;
        // Its own exclusive group is already filled by the pre-pull plan — a second Blessing or
        // Aura from the SAME caster only replaces the first. Cite: Unit.cpp:5021.
        const grp = sp.exclusionGroup ?? sp.spellGroupId ?? 0;
        if (grp > 0 && c.prePullAuras!.some(
          (a) => a.fromCaster == null
            && ((ds.spell(a.spellId)?.exclusionGroup ?? ds.spell(a.spellId)?.spellGroupId ?? 0) === grp),
        )) continue;
        const durMs = keepUpAuraDurationMs(sp);
        c.prePullAuras!.push({ spellId: sp.id, ...(durMs > 0 ? { expiresAt: now + durMs } : {}) });
      }
      // Buffs-phase item rules (weapon imbues, scrolls) then the bag-elixir sweep.
      const lvl = companionLevel(c, state.char.level);
      applyCompanionItemPrep(c, rot, {
        ds,
        now,
        char: companionCharacter(c, lvl, ds),
        applyImbue: applyCompanionImbue,
        log,
      });
    }

    // The warlock stones the healer: a stoned healer stands themselves up where they fell and
    // resurrects the party. Cite: Player.cpp:18675-18713 — the soulstone outranks every other rez.
    {
      const stoneTargets = [
        ...squad
          .map((c, i) => ({ comp: c, seat: i }))
          .filter((e) => e.comp.role === 'healer')
          .map((e) => ({
            name: e.comp.name,
            auraSpellIds: (e.comp.prePullAuras ?? []).map((a) => a.spellId),
            apply: (spellId: number) => {
              (e.comp.prePullAuras ??= []).push({ spellId });
            },
          })),
        ...(state.squadRole === 'healer'
          ? [{
            name: state.char.name,
            auraSpellIds: (state.char.activeAuras ?? []).map((a) => a.spellId),
            // Until cancelled: a soulstone has a 15 min timer in 1.12, and durationMs 0
            // from applyAura is the persistent form. The run is shorter than the timer.
            apply: (spellId: number) => { state.char = applyAura(state.char, spellId, 0, now, ds); },
          }]
          : []),
      ];
      const suppliers = [
        ...squad
          .filter((c) => c.cls === CLASS.WARLOCK)
          .map((c) => ({
            name: c.name,
            level: companionLevel(c, state.char.level),
            knownSpellIds: companionSpellbook(c, companionLevel(c, state.char.level), ds).known,
            bag: (c.bags ?? emptyInventory()).stacks.map((s) => ({ item: s.item, count: s.count })),
            spend: (item: number, n: number) => { c.bags = removeItem(c.bags ?? emptyInventory(), item, n)[0]; },
          })),
        ...(state.char.cls === CLASS.WARLOCK
          ? [{
            name: state.char.name,
            level: state.char.level,
            knownSpellIds: state.spellbook.known,
            bag: state.inventory.stacks.map((s) => ({ item: s.item, count: s.count })),
            spend: (item: number, n: number) => { state.inventory = removeItem(state.inventory, item, n)[0]; },
          }]
          : []),
      ];
      const stone = planSoulstone({
        suppliers,
        targets: stoneTargets,
        itemOf: (e) => ds.item(e),
        spellOf: (id) => ds.spell(id),
      });
      if (stone) {
        const supplier = suppliers.find((s) => s.name === stone.warlockName);
        // Conjuring one costs a shard; an already-carried stone costs the stone.
        if (stone.soulShards > 0) supplier?.spend(SOUL_SHARD_ITEM, stone.soulShards);
        else supplier?.spend(stone.item, 1);
        stoneTargets.find((t) => t.name === stone.targetName)?.apply(stone.auraSpellId);
        log(`${stone.warlockName} puts a soulstone on ${stone.targetName}.`);
      }
    }

    // Healthstones — one per member, tanks and melee first, one Soul Shard each. Runs AFTER the soulstone
    // so the wipe insurance gets the first shard out of the bag.
    const stoneHandouts: PlannedHandout[] = [];
    {
      const holders = [
        stoneHolder({
          name: state.char.name,
          char: state.char,
          role: state.squadRole ?? 'dps',
          specName: state.rotation?.autoSig?.spec ?? null,
          knownSpellIds: state.spellbook.known,
          auraSpellIds: (state.char.activeAuras ?? []).map((a) => a.spellId),
          read: () => state.inventory,
          write: (inv) => { state.inventory = inv; },
        }),
        ...squad.map((c) => {
          const lvl = companionLevel(c, state.char.level);
          return stoneHolder({
            name: c.name,
            char: companionCharacter(c, lvl, ds),
            role: c.role,
            specName: c.rotation?.autoSig?.spec ?? ds.botSpecs(c.cls)[c.specIdx ?? 0]?.name ?? null,
            knownSpellIds: companionSpellbook(c, lvl, ds).known,
            auraSpellIds: (c.prePullAuras ?? []).map((a) => a.spellId),
            read: () => c.bags,
            write: (inv) => { c.bags = inv; },
          });
        }),
      ];
      const stones = runPrePullHealthstones(holders, ds, state.char.name);
      for (const line of healthstoneRunLog(stones, ds, state.char.name)) log(line);
      // Your own stone rides the "Handed to you" line with the conjured food and water; a stone
      // that never shows there is one the player does not know they are carrying.
      const mineStone = stones.handouts.find((h) => h.targetName === state.char.name);
      if (mineStone) {
        stoneHandouts.push({ item: mineStone.item, count: 1, from: mineStone.warlockName });
      }
    }

    // Conjured provisions, ONE stack of each per party member so a re-buff cannot flood a bag. The
    // mage used to conjure for YOU alone, so every companion walked the run on its spawn stack.
    const conjurable: ConjurableProvision[] = [];
    const providerOf = new Map<number, string>();
    for (const c of casters) {
      for (const p of conjurableProvisions(c.spellbook.known, ds)) {
        if (providerOf.has(p.item)) continue;
        providerOf.set(p.item, c.name);
        conjurable.push(p);
      }
    }
    conjurable.sort((a, b) => b.quality - a.quality);
    const stockProvisions = (
      inv: Inventory,
      who: Character,
    ): { inv: Inventory; got: PlannedHandout[] } => {
      const got: PlannedHandout[] = [];
      let out = inv;
      const want = usableProvisionsFor(conjurable, who, ds);
      for (const item of [want.food, want.drink]) {
        if (item == null) continue;
        const maxStack = Math.max(1, ds.item(item)?.stackable ?? 1);
        const have = countItem(out, item);
        if (have >= maxStack) continue; // already a full stack of this provision
        const count = maxStack - have;
        if (!canFitWithBagFamily(out, who, ds, item, count, maxStack)) continue;
        out = addItem(out, item, count, maxStack);
        got.push({ item, count, from: providerOf.get(item) ?? '' });
      }
      return { inv: out, got };
    };

    const mine = stockProvisions(state.inventory, state.char);
    state.inventory = mine.inv;
    const handouts = [...stoneHandouts, ...mine.got];
    let fedCompanions = 0;
    for (const c of squad) {
      const filled = stockProvisions(
        c.bags ?? emptyInventory(),
        companionCharacter(c, companionLevel(c, state.char.level), ds),
      );
      if (!filled.got.length) continue;
      c.bags = filled.inv;
      fedCompanions += 1;
    }
    if (plan.buffs.length) log(`Buffed up: ${plan.buffs.map((b) => b.name).join(', ')}.`);
    // The stone already has its own line from healthstoneRunLog — it only rides `handouts` so
    // the UI's "Handed to you" strip names it.
    for (const h of mine.got) {
      const idef = ds.item(h.item);
      log(`${h.from} conjures ${h.count}× ${idef?.name ?? `item ${h.item}`} for you.`);
    }
    if (fedCompanions) log(`${fedCompanions} companions get conjured provisions.`);
    // A buff-up stamps only what the units present can hold (partyAuras presence rule).
    reconcileGamePartyAuras(state, ds);
    return { buffs: plan.buffs, handouts };
  };

  // The innkeeper at the current zone, with a documented fail-open: before the bake stamps innkeepers,
  // a settlement with vendors or trainers offers a synthetic one so hiring stays playable.
  const innkeeperHere = (): { entry: number; name: string } | undefined => {
    if (state.instance) return undefined;
    const zone = ds.zone(state.char.zoneId);
    if (!zone) return undefined;
    const inns = zone.innkeepers ?? [];
    // Prefer faction-interactable innkeeper (KI-669 multi-inn contested zones).
    // Cite: domain/creature/faction.ts canInteractWithCreature; Unit::CanInteract.
    if (inns.length > 0) {
      const race = state.char.race;
      const friendly = inns.find((inn) => canInteractWithCreature(ds, race, inn.entry));
      return friendly;
    }
    // Fail open only when the whole bundle lacks innkeeper data (pre-ETL).
    const anyBaked = ds.zones().some((z) => (z.innkeepers?.length ?? 0) > 0);
    if (anyBaked) return undefined;
    const settlement = (zone.vendors?.length ?? 0) > 0 || (zone.trainers?.length ?? 0) > 0;
    if (!settlement) return undefined;
    return { entry: 0, name: 'Innkeeper' };
  };

  // Spawn-gear previews are deterministic per bot + kit profile — cache per game instance. ICH1/ICH3:
  // profile from pickProfile + slate mix (never free epic L60 outside raid-*).
  const spawnGearCache = new Map<string, EquippedMap>();
  const spawnGearFor = (
    bot: WorldBot,
    profile: GearProfile = DEFAULT_HIRE_GEAR_PROFILE,
  ): EquippedMap => {
    const cacheKey = `${bot.id}|${profile}`;
    let g = spawnGearCache.get(cacheKey);
    if (!g) {
      const scratch: Companion = {
        id: bot.id, name: bot.name, race: bot.race, cls: bot.cls, role: 'dps',
        seed: bot.seed, equipped: {}, level: bot.level, specIdx: bot.specIdx,
        gearProfile: profile,
      };
      const botSpec = ds.botSpecs(bot.cls)[bot.specIdx];
      g = generateSpawnGear(companionCharacter(scratch, bot.level, ds), bot.seed, ds, profile, {
        specIdx: bot.specIdx,
        role: botSpec?.role,
      });
      spawnGearCache.set(cacheKey, g);
    }
    return g;
  };

  const buildCandidate = (bot: WorldBot, gearProfile: GearProfile): InnCandidate => {
    const spec = ds.botSpecs(bot.cls)[bot.specIdx];
    const gear = spawnGearFor(bot, gearProfile);
    return {
      bot,
      ...(spec ? { specName: spec.name, specRole: spec.role } : {}),
      gear,
      gearProfile,
      hireCostCopper: hireCostCopper(bot.level, gearProfile),
      gearScore: displayGearScore(gear, ds),
    };
  };

  // One hireable face by bot id, slate or not. Scanning the slate made anything found by the world-pool
  // search read as no longer available — you could see a hire you could not take.
  const resolveCandidate = (botId: string): InnCandidate | undefined => {
    const fromSlate = innCandidates().find((c) => c.bot.id === botId);
    if (fromSlate) return fromSlate;
    const bot = worldBot(ds, botId);
    if (!bot) return undefined;
    if (bot.faction !== factionOf(ds, state.char.race)) return undefined;
    if ((state.squad ?? []).some((c) => c.id === botId)) return undefined;
    if (state.botRoster?.[botId]) return undefined;
    const playerLevel = state.char.level;
    const zoneSalt = innZoneSalt(state.char.zoneId, playerLevel);
    return buildCandidate(bot, pickProfile(bot.id, zoneSalt, playerLevel));
  };

  // The slate is deterministic in inn, zone, level and who is taken, and every face costs a character
  // build plus a gear walk. Both panels repaint on it, so memo the slate rather than re-price 16 bodies.
  let slateMemo: { key: string; out: InnCandidate[] } | null = null;

  const innCandidates = (): InnCandidate[] => {
    const inn = innkeeperHere();
    if (!inn) return [];
    const taken = [
      ...(state.squad ?? []).map((c) => c.id),
      ...Object.keys(state.botRoster ?? {}),
    ];
    const playerLevel = state.char.level;
    const key = `${inn.entry}|${state.char.zoneId}|${playerLevel}|${[...taken].sort().join(',')}`;
    if (slateMemo?.key === key) return slateMemo.out.slice();
    const zoneSalt = innZoneSalt(state.char.zoneId, playerLevel);
    const bots = innSlate({
      ds,
      playerRace: state.char.race,
      playerLevel,
      zoneId: state.char.zoneId,
      excludeIds: taken,
    });
    // ICH3: per-face profile roll + slate stratification (cheap face; no all-raid; mid no raid).
    const profiles = ensureSlateProfileMix(
      bots.map((bot) => pickProfile(bot.id, zoneSalt, playerLevel)),
      zoneSalt,
      playerLevel,
    );
    const out = bots.map((bot, i) => buildCandidate(bot, profiles[i] ?? DEFAULT_HIRE_GEAR_PROFILE));
    slateMemo = { key, out };
    return out.slice();
  };

  // The whole-population hire search, filter-first by contract: with nothing narrowed it returns empty,
  // because 2500 rendered faces is not a shortlist. Unlike the slate it has no level window.
  const searchInnCandidates = (filters: BotSearchFilters): InnCandidate[] => {
    if (!innkeeperHere()) return [];
    const taken = [
      ...(state.squad ?? []).map((c) => c.id),
      ...Object.keys(state.botRoster ?? {}),
    ];
    const playerLevel = state.char.level;
    const zoneSalt = innZoneSalt(state.char.zoneId, playerLevel);
    const bots = searchWorldBots({
      ds,
      playerRace: state.char.race,
      playerLevel,
      zoneId: state.char.zoneId,
      excludeIds: taken,
      filters,
    });
    return bots.map((bot) => buildCandidate(bot, pickProfile(bot.id, zoneSalt, playerLevel)));
  };

  // Squad, then the bench, then the dev raid bench: spec, role, gear and bar edits work for all three.
  // Without the last lookup all 39 raid members answered null and could not be inspected before entry.
  const findCompanion = (id: string): Companion | undefined =>
    state.squad?.find((c) => c.id === id)
    ?? state.botRoster?.[id]
    ?? state.raidRoster?.members?.[id];

  // Ownership-correct companion equip: source the bot's own bags first, else the player's. Every
  // displaced piece goes to the BOT's bags, then their bank — never back to the player.
  const equipOnCompanion = (comp: Companion, itemEntry: number, preferred?: EquipSlot): { ok: boolean; reason?: string; slot?: EquipSlot } => {
    const lvl = companionLevel(comp, state.char.level);
    const char = companionCharacter(comp, lvl, ds);
    const botBags = comp.bags ?? emptyInventory();
    const fromBot = countItem(botBags, itemEntry) > 0;
    const source = fromBot ? botBags : state.inventory;
    // Companion kits know Dual Wield 674 via companionSpellbook at trainer reqLevel.
    // Cite: Player.cpp CanDualWield; spell 674.
    const sb = companionSpellbook(comp, lvl, ds);
    // Sourcing from the player would re-home displaced gear into the PLAYER's inventory and measure it
    // against the bot's capacity, a false "not enough room". We re-home below, so skip that check.
    const opts: EquipOpts = {
      canDualWield: knows(sb, DUAL_WIELD_SPELL_ID),
      skipBagCapacityCheck: !fromBot,
    };
    const r = equipItem(char, source, ds, itemEntry, preferred, opts);
    if (!r.ok) return { ok: false, reason: r.reason ?? 'Cannot be equipped' };
    // Pieces that left the paperdoll (swap target, two-hand clearing the offhand). Wave Q P1:
    // re-home the displaced instances into the bot's bags/bank with their identity intact.
    const before = comp.equipped;
    const after = r.char.equipped;
    const displaced: ItemInstance[] = [];
    for (const [slot, v] of Object.entries(before) as Array<[EquipSlot, EquippedValue | undefined]>) {
      const beforeEntry = equippedEntry(v);
      if (beforeEntry != null && equippedEntry(after[slot]) !== beforeEntry) {
        displaced.push(equippedInstance(v)!);
      }
    }
    // fromBot: equipItem already did take+displace into r.inventory against bot bagCapacity.
    // Rebuild from source so we can spill overflow into the companion bank the same way.
    let bags = fromBot ? removeItem(botBags, itemEntry, 1)[0] : botBags;
    let bank = comp.bank ?? emptyInventory();
    const botCap = bagCapacity(r.char, ds);
    const bCap = bankCapacity(comp.bankBags ?? [], ds);
    const queued: ItemInstance[] = [];
    for (const inst of displaced) {
      const idef = ds.item(inst.item);
      if (!idef) continue;
      const maxStack = idef.stackable ?? 1;
      if (canFit(bags, inst.item, inst.count, maxStack, botCap)) {
        bags = addInstance(bags, inst, maxStack);
      } else if (canFit(bank, inst.item, inst.count, maxStack, bCap)) {
        bank = addInstance(bank, inst, maxStack);
      } else {
        // Nowhere on the body: the upgrade goes on and the old piece takes the reward's own queue.
        queued.push(inst);
      }
    }
    // Shrinking a bag can leave existing stacks over the new capacity even when the
    // displaced bag itself went to the bank — refuse rather than overflow.
    if (usedSlots(bags) > botCap) {
      return { ok: false, reason: 'Inventory full' };
    }
    comp.equipped = { ...after };
    // equipItem clears TEMP_ENCHANTMENT_SLOT on the displaced hand — mirror onto Companion.
    // Cite: equipment.ts W5 D1; W5 gap 1 companion unequip leak.
    comp.tempEnchants = r.char.tempEnchants;
    comp.bags = bags;
    comp.bank = bank;
    if (queued.length) {
      const handle = companionBagHandle(ctx, comp);
      for (const inst of queued) {
        handle.overflow(inst.item, inst.count, inst);
        log(overflowLine(handle, ds, inst.item, inst.count));
      }
    }
    if (!fromBot) state.inventory = removeItem(state.inventory, itemEntry, 1)[0];
    return { ok: true, slot: r.slot! };
  };

  return {
    ensureCompanionRotation,
    ensureCompanionProfileList,
    syncCompanionPetAfterLevel,
    buildSquadBattleParty,
    doApplyPrePullBuffs,
    doRefreshPartyWeaponCoats,
    doApplyPaladinBuffs,
    applyCompanionImbue,
    innkeeperHere,
    spawnGearFor,
    innCandidates,
    searchInnCandidates,
    resolveCandidate,
    findCompanion,
    equipOnCompanion,
  };
}

// Methods (late — after combat helpers)

/** Late-bound combat re-entry for runFullDungeon. Filled after beginEncounter / resolveFight exist. */
export type SquadCombatBridge = {
  beginEncounter: (
    dungeonId: string,
    encounterId: string,
    opts?: { withSquad?: boolean; elapsedMs?: number },
  ) => ActionResult<BeginFight>;
  resolveFight: (session: CombatSession) => FightOutcome;
  getLiveFightSession: () => CombatSession | null;
  /** Same pending-fight busy signal travel.ts uses for 'You are in combat'. */
  getPendingFight: () => unknown | null;
};

export type SquadMethodsExtras = {
  helpers: SquadHelpers;
  combat: SquadCombatBridge;
  /** From travelCore — enterInstance refuses while on a journey. */
  journeyTick: (nowMs?: number) => void;
  busyTravelling: () => boolean;
  /** The player's own equip path (game/equipmentHelper.ts), for a suggestion held by a companion. */
  gear: Pick<Game, 'equip' | 'suggestedEquipmentUpgrades'>;
};

/** Every Game method this module owns. Named so the API object can be typed AND self-referenced. */
type SquadMethods = Pick<
  Game,
  | 'enterInstance'
  | 'leaveInstance'
  | 'resetInstance'
  | 'setInstancePace'
  | 'recruitCompanion'
  | 'dismissCompanion'
  | 'activateCompanion'
  | 'setSquadRole'
  | 'setSquadStrategy'
  | 'setCompanionAoeMode'
  | 'setCompanionOffHeal'
  | 'setCompanionXpLocked'
  | 'setAllCompanionsAoeMode'
  | 'equipCompanionBest'
  | 'innkeeperHere'
  | 'innCandidates'
  | 'searchInnCandidates'
  | 'hireCandidate'
  | 'buildRaidRoster'
  | 'clearRaidRoster'
  | 'setInstanceRoster'
  | 'fillInstanceRoster'
  | 'clearInstanceRoster'
  | 'setRaidLineup'
  | 'fillRaidLineup'
  | 'clearRaidLineup'
  | 'raidRosterInfo'
  | 'releaseCompanions'
  | 'tavernDuel'
  | 'setCompanionSpec'
  | 'setCompanionTalentLink'
  | 'setCompanionRole'
  | 'setCompanionPet'
  | 'setCompanionPetAutocast'
  | 'equipCompanionSlot'
  | 'unequipCompanionSlot'
  | 'companionUpgradesFor'
  | 'squadUpgradePlan'
  | 'applySquadUpgrades'
  | 'equipSuggestedUpgrade'
  | 'consumableShareState'
  | 'consumableShareMembers'
  | 'squadConsumableDetail'
  | 'squadConsumablePlan'
  | 'applySquadConsumablePlan'
  | 'setConsumableShareRule'
  | 'setConsumableShareScope'
  | 'setConsumableShareIncludeYou'
  | 'setConsumableShareCat'
  | 'companionProfessionsOf'
  | 'learnCompanionProfession'
  | 'unlearnCompanionProfession'
  | 'companionPartyEnergy'
  | 'companionMissionZones'
  | 'sendCompanionOnMission'
  | 'recallCompanionMission'
  | 'collectCompanionMission'
  | 'previewCompanionMission'
  | 'collectAllCompanionMissions'
  | 'craftAsCompanion'
  | 'enchantAsCompanion'
  | 'learnRecipeFromItemOnCompanion'
  | 'learnEnchantFromItemOnCompanion'
  | 'learnSpellFromItemOnCompanion'
  | 'learnPetSpellFromItemOnCompanion'
  | 'giveItemToBot'
  | 'companionQuestOffers'
  | 'acceptCompanionQuest'
  | 'turnInCompanionQuest'
  | 'abandonCompanionQuest'
  | 'takeItemFromBot'
  | 'useCompanionItem'
  | 'companionBankDeposit'
  | 'companionBankWithdraw'
  | 'giveItemToBotStack'
  | 'takeItemFromBotStack'
  | 'moveItemBetweenBots'
  | 'discardCompanionBagStack'
  | 'sellCompanionItemStack'
  | 'buyBackCompanionStack'
  | 'takeFromPartyStorage'
  | 'companionBankDepositStack'
  | 'companionBankWithdrawStack'
  | 'buyCompanionBankSlot'
  | 'equipCompanionBankBag'
  | 'unequipCompanionBankBag'
  | 'runFullDungeon'
  | 'companionRotation'
  | 'setCompanionRotation'
  | 'resetCompanionRotation'
  | 'companionRotationProfile'
  | 'setCompanionRotationProfile'
  | 'companionHasDpsRotationProfile'
  | 'companionRotationProfiles'
  | 'addCompanionRotationProfile'
  | 'companionHasPvpRotationBand'
  | 'renameCompanionRotationProfile'
  | 'deleteCompanionRotationProfile'
  | 'selectCompanionRotationProfile'
  | 'companionActionBars'
  | 'setCompanionActionSlot'
  | 'setCompanionItemActionSlot'
  | 'addCompanionActionBar'
  | 'removeCompanionActionBar'
  | 'resetCompanionActionBars'
  | 'squadBattleParty'
  | 'applyPrePullBuffs'
  | 'refreshPartyWeaponCoats'
  | 'refreshPaladinBuffs'
>;

export function createSquadMethods(
  ctx: GameCtx,
  extras: SquadMethodsExtras,
): SquadMethods {
  const { ds, state, log } = ctx;
  const {
    helpers,
    combat,
    journeyTick,
    busyTravelling,
    gear,
  } = extras;
  const {
    ensureCompanionRotation,
    ensureCompanionProfileList,
    syncCompanionPetAfterLevel,
    buildSquadBattleParty,
    doApplyPrePullBuffs,
    doRefreshPartyWeaponCoats,
    doApplyPaladinBuffs,
    applyCompanionImbue,
    innkeeperHere,
    innCandidates,
    searchInnCandidates,
    resolveCandidate,
    findCompanion,
    equipOnCompanion,
  } = helpers;
  const { beginEncounter, resolveFight } = combat;
  // Live session OR pending fight — same busy signal travel.ts / consumables use.
  const inLiveCombat = (): boolean =>
    !!combat.getLiveFightSession() || !!combat.getPendingFight();
  // Hearth / taxi / portal used to drop the instance without this restore. A reload
  // in the world with leftover raidParty would keep those companions off the roster.
  if (!state.instance && state.raidParty) restoreRaidPartySeating(state, ds);

  // A rank a book just taught has to reach the FLOOR, not only the spellbook: swap the superseded rank
  // on their bars and rebuild every untouched rotation. Hand-edited rotations are left alone.
  const refreshCompanionKitAfterLearn = (comp: Companion, newId: number): void => {
    const lvl = companionLevel(comp, state.char.level);
    const sb = companionSpellbook(comp, lvl, ds);
    let bars = resolveCompanionActionBars(comp, state.char.level, ds);
    for (const oldId of lowerRanksFor(sb, newId, ds)) bars = replaceBarSpell(bars, oldId, newId);
    // Grow first: a densely-packed seed can leave no empty slot for a book-taught rank.
    comp.actionBars = autofillBars(growBarsForAutofill(bars, [newId]), [newId]);
    for (const profile of ['primary', 'dps'] as const) {
      const cur = companionRotationSlot(comp, profile);
      if (!cur || cur.custom) continue;
      setCompanionRotationSlot(comp, profile, buildCompanionRotation(comp, lvl, ds, profile));
    }
  };

  // Roster-wide gearing plan. Local so applySquadUpgrades can recompute between equips without routing
  // through the Game facade (`this` is not reliable in the methods literal).
  const doSquadUpgradePlan = (): SquadUpgradeRow[] => {
    const members = [
      ...(state.squad ?? []),
      ...Object.values(state.botRoster ?? {}),
    ];

      const rows: SquadUpgradeRow[] = [];
      // Pool key: '' = their own bags (uncontested), 'you:<entry>' = your bags + bank,
      // '<holderId>:<entry>' = another companion's bags.
      const shared: Array<{ key: string; row: SquadUpgradeRow }> = [];
      // Only unbound stacks can leave a holder's bags (takeItemFromBot refuses soulbound).
      const freeInBags = (inv: Inventory, entry: number): number =>
        inv.stacks.reduce((t, s) => (s.item === entry && !stackBoundToHolder(s, ds) ? t + s.count : t), 0);
      for (const comp of members) {
        const lvl = companionLevel(comp, state.char.level);
        const char = companionCharacter(comp, lvl, ds);
        const sb = companionSpellbook(comp, lvl, ds);
        const equipOpts: EquipOpts = {
          canDualWield: knows(sb, DUAL_WIELD_SPELL_ID),
          specId: companionPlayerbotSpecId(comp.cls, comp.specIdx, comp.role, ds),
          role: comp.role,
        };
        const sources: Array<{ from: SquadUpgradeRow['from']; inv: Inventory; holder?: Companion }> = [
          { from: 'theirs', inv: comp.bags ?? emptyInventory() },
          { from: 'you', inv: state.inventory },
          { from: 'bank', inv: state.bank ?? emptyInventory() },
        ];
        // A crafter's product sits in the CRAFTER's bags (craftAsCompanion), so every other
        // member's bags are a source too, the way squadConsumableDetail pools them.
        for (const o of members) {
          if (o.id !== comp.id && o.bags?.stacks.length) sources.push({ from: 'mate', inv: o.bags, holder: o });
        }
        for (const src of sources) {
          for (const u of findUpgrades(char, src.inv, ds, equipOpts)) {
            if (src.holder && freeInBags(src.inv, u.entry) <= 0) continue;
            const row: SquadUpgradeRow = {
              companionId: comp.id,
              companionName: comp.name,
              benched: !(state.squad ?? []).some((c) => c.id === comp.id),
              entry: u.entry,
              targetSlot: u.targetSlot,
              ...(u.currentEntry != null ? { currentEntry: u.currentEntry } : {}),
              delta: u.valueDelta,
              from: src.from,
              ...(src.holder ? { holderId: src.holder.id, holderName: src.holder.name } : {}),
            };
            // Their own bags are not contested; player bags / bank and a mate's bags are.
            if (src.from === 'theirs') rows.push(row);
            else shared.push({ key: `${src.holder ? src.holder.id : 'you'}:${u.entry}`, row });
          }
        }
      }
      // Claim each shared stack for its best taker. Count, not one-per-entry: three of the
      // same green shoulder can dress three companions. One row per (companion, slot) at the same
      // time: a body wears ONE wand, so listing the second-best wand as a separate upgrade offered
      // four rows that Apply All could never land.
      const claimed = new Map<string, number>();
      const takenSlots = new Set<string>();
      const owned = (row: SquadUpgradeRow): number => {
        if (row.holderId) return freeInBags(findCompanion(row.holderId)?.bags ?? emptyInventory(), row.entry);
        return countItem(state.inventory, row.entry) + countItem(state.bank ?? emptyInventory(), row.entry);
      };
      const all = [...rows.map((row) => ({ key: '', row })), ...shared]
        .sort((a, b) => b.row.delta - a.row.delta);
      const out: SquadUpgradeRow[] = [];
      for (const s of all) {
        const slotKey = `${s.row.companionId}|${s.row.targetSlot}`;
        if (takenSlots.has(slotKey)) continue;
        if (s.key !== '') {
          const used = claimed.get(s.key) ?? 0;
          if (used >= owned(s.row)) continue;
          claimed.set(s.key, used + 1);
        }
        takenSlots.add(slotKey);
        out.push(s.row);
      }
      return out;
  };

  // Every gather node in the world, once per DataStore. `ds` exposes only gatherNode(id), so the list has
  // to be assembled from the zone tables; missions need it per dispatch.

  // One raid-test body: generated, never bought. Everything a paid hire gives minus the gold, plus the
  // premade build that MATCHES the seat's role; its rotation is built the same way every other is.
  const buildRaidMember = (
    cls: number,
    role: SquadRole,
    level: number,
    gearProfile: GearProfile,
    itemLevel: { min: number; max: number },
    seed: number,
    takenNames: readonly string[],
  ): Companion | null => {
    const race = companionRaceFor(ds, state.char.race, cls);
    if (race == null) return null;
    const gender = companionGender(seed);
    const name = companionName(ds.botNames(), seed, gender, takenNames);
    const specIdx = botSpecIdxForRole(cls, role, ds);
    const base = {
      id: `r${seed.toString(36)}`,
      name, race, cls, gender, role, seed,
      level, xp: 0, gearProfile,
      ...(specIdx != null ? { specIdx } : {}),
    };
    const shell = companionCharacter({ ...base, equipped: {} }, level, ds);
    const equipped = generateSpawnGear(shell, seed, ds, gearProfile, {
      role,
      ...(specIdx != null ? { specIdx } : {}),
      itemLevel,
    });
    const kit = generateSpawnInventory({ ...shell, equipped }, seed, ds);
    const petKit = initBotPet({ ...shell, equipped: kit.equipped }, seed, ds);
    const comp: Companion = {
      ...base,
      equipped: { ...kit.equipped },
      bags: kit.inventory,
      bank: emptyInventory(),
      bankBags: [],
      // Raid bodies are fixed at the tier's level: XP from a test run must not drift them off
      // the template you are measuring.
      xpLocked: true,
      ...(petKit ? { pet: petKit.pet, petSpells: petKit.petSpells } : {}),
    };
    applyCompanionPetSync(comp, level, ds);
    return comp;
  };

  const demoteRaidPromotions = (): void => restoreRaidPartySeating(state, ds);

  let gatherNodeCache: GatherNodeDef[] | null = null;
  const allGatherNodes = (): GatherNodeDef[] => {
    if (gatherNodeCache) return gatherNodeCache;
    const seen = new Set<number>();
    const out: GatherNodeDef[] = [];
    for (const z of ds.zones()) {
      for (const id of z.nodes ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const n = ds.gatherNode(id);
        if (n) out.push(n);
      }
    }
    // Only cache a non-empty scan: the node table arrives with the lazy profession data, so an early
    // call would pin an empty list forever and every gather mission would pay out nothing.
    if (out.length > 0) gatherNodeCache = out;
    return out;
  };

  /** Bags + loot conditions for route order (13523 only after 5384 rewarded). */
  const routeItemAccess = (def: InstanceDef) => {
    const snap = {
      ...questConditionSnapshot(
        state.questlog,
        state.char.level,
        canTakeQuestForCondition(ds, state.char, state.questlog),
        state.worldStates,
      ),
      auras: auraIdsForSnapshot(state.char.activeAuras),
    };
    const loot = (id: number | string) => ds.lootTable(id);
    const goLoot = (goEntry: number) => ds.gameObject(goEntry)?.lootId;
    return {
      hasItem: (itemEntry: number) =>
        countItem(ownedInventory(state.inventory, state.keyring), itemEntry) > 0,
      itemObtainable: (itemEntry: number) => {
        // No bake row at all → don't skip the gate (loot chunk not attached).
        if (!itemDropsInsideInstance(def, itemEntry, loot, goLoot)) return true;
        return itemDropsInsideInstance(
          def,
          itemEntry,
          loot,
          goLoot,
          (row) => lootDropAllowed(ds, row.conditionId, snap),
        );
      },
    };
  };

  // Once-per-run dungeon pool roll for headless enter (same as liveDungeonController :252-291). Prior
  // winners on a held/rematerialized run do not re-roll. Cite: MapPersistentStateMgr.cpp InitPools.
  const routePoolOpts = (
    def: InstanceDef,
    priorSpawned?: readonly number[] | null,
    priorGoSpawned?: readonly number[] | null,
  ): {
    poolRoll: DungeonPoolRoll;
    mapSpawns: ReturnType<typeof dungeonSpawnsForMap>;
    floorPoolSpawnedGuids: number[];
    floorPoolSpawnedGoGuids: number[];
  } => {
    const mapSpawns = dungeonSpawnsForMap(def.mapId);
    const mapGuids = new Set<number>(mapSpawns.map((s) => s.guid));
    for (const enc of def.encounters) {
      for (const g of enc.spawnGuids ?? []) mapGuids.add(g);
    }
    const bakedPools = ds.pools() as BakedPoolRow[];
    const poolRoll: DungeonPoolRoll = priorSpawned != null
      ? poolRollFromPersisted(bakedPools, mapGuids, priorSpawned)
      : rollDungeonPools(
        bakedPools,
        mapGuids,
        mulberry32(hashSeed(state.rngSeed, hashSeed(def.mapId, DUNGEON_POOL_ROLL_SALT))),
      );
    return {
      poolRoll,
      mapSpawns,
      floorPoolSpawnedGuids: [...poolRoll.spawnedGuids],
      // Gameobject pools ride the same once-per-run rule (goPoolRoll.ts): a re-materialized route
      // keeps the winners it already has, so herbs and chests do not move when density changes.
      floorPoolSpawnedGoGuids: priorGoSpawned != null
        ? [...priorGoSpawned]
        : rollDungeonGoPools(
          def.mapId,
          mulberry32(hashSeed(state.rngSeed, hashSeed(def.mapId, DUNGEON_GO_POOL_ROLL_SALT))),
        ),
    };
  };

  /** Surface one unit of `entry` from the bank into your bags so an equip can source it. */
  const withdrawForEquip = (entry: number): boolean => {
    const bank = state.bank ?? emptyInventory();
    if (countItem(bank, entry) <= 0) return false;
    const idef = ds.item(entry);
    if (!idef) return false;
    const stack = idef.stackable ?? 1;
    if (!canFit(state.inventory, entry, 1, stack, bagCapacity(state.char, ds))) return false;
    const idx = bank.stacks.findIndex((s) => s.item === entry);
    if (idx < 0) return false;
    const [nextBank, taken] = takeStack(bank, idx, 1);
    if (!taken) return false;
    state.bank = nextBank;
    state.inventory = addInstance(state.inventory, taken, stack);
    return true;
  };

  /** All companions (active squad + benched roster) for vault / catalog. */
  const allCompanions = (): Companion[] => [
    ...(state.squad ?? []),
    ...Object.values(state.botRoster ?? {}),
  ];

  // Held tools (hammer, spanner, rod) anywhere in the party's bags. Never consumed, so a companion
  // crafts on the party's one copy instead of needing their own.
  const partyTools = (): ReadonlySet<number> =>
    partyHeldTools(state.inventory, allCompanions(), ds);

  const vaultCtx = (): PartyVaultCtx => ({
    char: state.char,
    inventory: state.inventory,
    bank: state.bank ?? emptyInventory(),
    bankBags: state.bankBags ?? [],
    companions: allCompanions(),
    playerLevel: state.char.level,
    ds,
  });

  const vaultMut = (): VaultMutators => ({
    setPlayerInventory(inv) { state.inventory = inv; },
    setPlayerBank(inv) { state.bank = inv; },
    setCompanionBags(cid, inv) {
      const c = findCompanion(cid);
      if (c) c.bags = inv;
    },
    setCompanionBank(cid, inv) {
      const c = findCompanion(cid);
      if (c) c.bank = inv;
    },
  });

  // Vendor goods the whole party lacks for a companion's craft are bought into the vault at vendor
  // price from the player's purse, the same buy-in the player's own craft() makes.
  const buyVaultVendorReagents = (
    reagents: readonly { item: number; count: number }[],
    preferId: string,
  ): { ok: true; cost: number; buys: VendorReagentBuy[] } | { ok: false; reason: string } => {
    const ctx = vaultCtx();
    let probe: Inventory = emptyInventory();
    for (const st of partyMergedStacks(ctx)) probe = { stacks: [...probe.stacks, { item: st.item, count: st.count }] };
    const sf = vendorShortfall(ds, state.char, reagents, probe);
    if (sf.blocked.length || !sf.buys.length) return { ok: true, cost: 0, buys: [] };
    if (sf.cost > state.char.gold) {
      return { ok: false, reason: `Not enough money for ${buyNames(ds, sf.buys)} (${moneyMarked(sf.cost)})` };
    }
    const mut = vaultMut();
    const landed: Array<{ item: number; count: number }> = [];
    for (const b of sf.buys) {
      const r = partyDeposit(ctx, mut, b.item, b.units, ds.item(b.item)?.stackable ?? 1, preferId);
      if (r.deposited > 0) landed.push({ item: b.item, count: r.deposited });
      if (r.remaining > 0) {
        for (const row of landed) partyTake(ctx, mut, row.item, row.count, preferId);
        return { ok: false, reason: 'Not enough bag space' };
      }
    }
    state.char = { ...state.char, gold: state.char.gold - sf.cost };
    log(`Bought ${buyNames(ds, sf.buys)} for ${moneyMarked(sf.cost)}.`);
    return { ok: true, cost: sf.cost, buys: sf.buys };
  };

  /** Resolve mission nodes for a companion mission (zone-scoped). */
  const missionNodesFor = (m: { skill: MissionSkill; zoneId: string; atSkill: number }): GatherNodeDef[] => {
    if (m.skill === 'skinning') {
      const entries = zoneSpawns(ds, m.zoneId).map((s) => s.entry);
      // Also include huntable list when spawns are sparse.
      const zone = ds.zone(m.zoneId);
      const hunt = zone?.huntable ?? [];
      const set = new Set<number>([...entries, ...hunt]);
      return workableZoneSkinNodes(m.zoneId, m.atSkill, ds, [...set]);
    }
    return workableZoneNodes(ds.zone(m.zoneId), m.skill, m.atSkill, ds);
  };

  const skinCreaturesByZone = (): Map<string, number[]> => {
    const map = new Map<string, number[]>();
    for (const z of ds.zones()) {
      const entries = new Set<number>();
      for (const s of zoneSpawns(ds, z.id)) entries.add(s.entry);
      for (const e of z.huntable ?? []) entries.add(e);
      map.set(z.id, [...entries]);
    }
    return map;
  };

  /** Ensure companion mission shape is current; drop unrecoverable legacy trips. */
  const ensureMissionShape = (comp: Companion): void => {
    if (!comp.mission) return;
    const norm = normalizeCompanionMission(comp.mission);
    if (!norm) {
      delete comp.mission;
      return;
    }
    comp.mission = norm;
  };

  // hireRaidRoster hires each seat through hireCandidate so the raid path and the single-hire
  // path share one economy. The API is an object literal, so it needs a self-reference.
  let self: SquadMethods;

  const api: SquadMethods = {
    enterInstance(dungeonId, nowMs = 0, opts) {
      journeyTick(nowMs);
      if (busyTravelling()) {
        return { ok: false, reason: 'You are travelling' };
      }
      // Corpse stays at death site; no portal while dead / mid-fight (KI-941 / KI-944).
      // Cite: Player.cpp:4388 ghost dungeon enter; travel.ts refuseIfDead + getPendingFight.
      {
        const gate = refuseIfDeadOrInCombat(
          state.char.health, state.deathFlow, inLiveCombat(), YOU_ARE_IN_COMBAT,
        );
        if (gate) return gate;
      }
      const def = ds.instance(dungeonId);
      if (!def) return { ok: false, reason: 'Unknown dungeon' };
      if (state.instance) return { ok: false, reason: 'You are already inside an instance' };
      // The area-trigger lock chain: inventory, turned-in quests and the baked teleports, with the name
      // fragment narrowing a multi-entrance zone. Cite: Player.cpp:19906-19984.
      const chk = canEnter(def, state.char.level, state.lockouts, nowMs, {
        teleports: ds.areatriggerTeleports(),
        instanceSaves: state.instanceSaves,
        ...buildEntryLockInputs(state, def.name),
      });
      if (!chk.ok) return { ok: false, reason: chk.reason ?? 'You cannot enter' };
      // Only full|bosses and single|link|chain|mayhem persist — match setSquadStrategy (KI-687).
      if (opts?.routeDensity != null && !isRouteDensity(opts.routeDensity)) {
        return {
          ok: false,
          reason: `Unknown route density '${String(opts.routeDensity)}' (use full or bosses)`,
        };
      }
      if (opts?.pullFusion != null && !isPullFusion(opts.pullFusion)) {
        return {
          ok: false,
          reason: `Unknown pull fusion '${String(opts.pullFusion)}' (use single, link, chain, or mayhem)`,
        };
      }
      // Materialize the route density and fusion for this run. The rest axis stays the squad strategy
      // and pacing, never an HP multiplier, and an over-strong pack splits into sequential pulls.
      const routeDensity = opts?.routeDensity ?? DEFAULT_ROUTE_DENSITY;
      const pullFusion = opts?.pullFusion ?? DEFAULT_PULL_FUSION;
      // A run you left (5-man under 30 min, raid until lockout) is the SAME instance, not a
      // fresh one — its route/density stand (setInstancePace refuses once packs are down).
      const held = restoreSavedRun(state.instanceSaves, dungeonId, nowMs);
      if (state.instanceSaves) {
        state.instanceSaves = pruneInstanceSaves(state.instanceSaves, nowMs);
        delete state.instanceSaves[dungeonId];
      }
      unsummonTotemsOnLeaveWorld(combat.getLiveFightSession());
      state.instance = held ?? enterRunWithRoute(def, {
        routeDensity,
        pullFusion,
        packBudget: {
          partyLevel: state.char.level,
          creatureOf: (entry) => ds.creature(entry),
          spellOf: (id) => ds.spell(id),
        },
        ...routeItemAccess(def),
        // KI-971: strip pool-absent / multi-slot rares like the live floor.
        ...routePoolOpts(def, null),
        entranceTriggerId: opts?.entranceTriggerId,
      });
      // Same clock canEnter / runFullDungeon lockout / leaveInstance compare (KI-1022).
      state.instanceEnteredAtMs = nowMs;
      // Instance OnPlayerEnter door flags (Dire Maul 179550 north-before-west).
      // Cite: instance_dire_maul.cpp:62-73; areatrigger 3189 target inside probe.
      {
        const instIr = scriptDevByName('instance_dire_maul');
        const enterAt = entranceForInstance(dungeonId, opts?.entranceTriggerId);
        if (instIr && enterAt && def.mapId === 429) {
          const store = scriptInstanceDataMap(state.instance);
          if (hasFlag(state.instance, DIRE_MAUL_WEST_FLAGS.tendrisDeath)) {
            store.set(TYPE_WARPWOOD, INSTANCE_DATA.DONE);
          }
          const doorFlags = applyInstanceOnPlayerEnter(
            instIr,
            enterAt.x,
            enterAt.y,
            store,
          );
          state.instance = persistScriptInstanceData(state.instance, store);
          for (const f of doorFlags) {
            const key = `${state.char.zoneId}:${f.goEntry}`;
            const prev = state.goRuntime?.[key] ?? {};
            state.goRuntime = {
              ...(state.goRuntime ?? {}),
              [key]: { ...prev, noInteract: f.noInteract, locked: f.locked },
            };
          }
        }
      }
      state.corpse = null;
      // A leftover record from a hearth/taxi that skipped restore — put them back
      // before this run's seating overwrites raidParty and drops the bodies.
      if (state.raidParty) restoreRaidPartySeating(state, ds);
      seatPartyForRun(state, ds, log, def, opts?.asRaid === true);
      log(held ? `You enter ${def.name}. Your progress stands.` : `You enter ${def.name}.`);
      return { ok: true };
    },

    leaveInstance(nowMs = Date.now()) {
      if (!state.instance) return { ok: false, reason: 'You are not in an instance' };
      // Refuse — do not clear corpse or orphan liveFightSession (KI-952/955/943/953).
      {
        const gate = refuseIfDeadOrInCombat(
          state.char.health, state.deathFlow, inLiveCombat(), YOU_ARE_IN_COMBAT,
        );
        if (gate) return gate;
      }
      unsummonTotemsOnLeaveWorld(combat.getLiveFightSession());
      const def = ds.instance(state.instance.dungeonId);
      const name = def?.name ?? 'the dungeon';
      demoteRaidPromotions();
      // 5-man: 30 min hold. Raid: hold until lockout so leave is not a wipe + barred door.
      const saves = state.instanceSaves ?? {};
      state.instanceSaves = def
        ? saveRunOnLeave(saves, state.instance, def, nowMs, state.lockouts)
        : pruneInstanceSaves(saves, nowMs);
      const held = def != null && state.instanceSaves[def.id] != null;
      const raidHeld = held && (def?.lockoutMs ?? 0) > 0;
      state.instance = null;
      delete state.instanceEnteredAtMs;
      state.corpse = null;
      // Outside, the companions are no longer inside any aura radius: the sheet drops their area auras.
      reconcileGamePartyAuras(state, ds);
      log(
        raidHeld ? `You leave ${name}. Your progress stands.`
          : held ? `You leave ${name}. It resets in 30 minutes.`
            : `You leave ${name}.`,
      );
      return { ok: true };
    },

    resetInstance() {
      if (!state.instance) return { ok: false, reason: 'You are not in an instance' };
      // Dead / mid-pull cannot rewrite the run (KI-958 / KI-945).
      {
        const gate = refuseIfDeadOrInCombat(
          state.char.health, state.deathFlow, inLiveCombat(), YOU_ARE_IN_COMBAT,
        );
        if (gate) return gate;
      }
      // A raid save is not resettable — that is what "saved" MEANS. Without this the lockout would be
      // one button press away from meaningless. Cite: instance_template.reset_delay.
      const rdef = ds.instance(state.instance.dungeonId);
      if (rdef && rdef.lockoutMs > 0) {
        const left = lockRemainingMs(state.lockouts, rdef.id, Date.now());
        if (left > 0) {
          const h = Math.ceil(left / 3_600_000);
          return { ok: false, reason: `You are saved to ${rdef.name} for another ${h}h` };
        }
      }
      state.instance = resetRun(state.instance);
      const name = ds.instance(state.instance.dungeonId)?.name ?? 'The instance';
      log(`${name} has been reset - the enemies return.`);
      return { ok: true };
    },

    setInstancePace(opts) {
      const run = state.instance;
      if (!run) return { ok: false, reason: 'You are not in an instance' };
      // Dead / open fight must not rematerialize the route (KI-959 / KI-951).
      {
        const gate = refuseIfDeadOrInCombat(
          state.char.health, state.deathFlow, inLiveCombat(), YOU_ARE_IN_COMBAT,
        );
        if (gate) return gate;
      }
      const def = ds.instance(run.dungeonId);
      if (!def) return { ok: false, reason: 'Unknown dungeon' };
      if (run.defeated.length > 0) {
        return { ok: false, reason: 'Reset the instance first - packs are already down' };
      }
      // Same union gate as enterInstance — refuse garbage before rematerializing the route.
      if (opts.routeDensity != null && !isRouteDensity(opts.routeDensity)) {
        return {
          ok: false,
          reason: `Unknown route density '${String(opts.routeDensity)}' (use full or bosses)`,
        };
      }
      if (opts.pullFusion != null && !isPullFusion(opts.pullFusion)) {
        return {
          ok: false,
          reason: `Unknown pull fusion '${String(opts.pullFusion)}' (use single, link, chain, or mayhem)`,
        };
      }
      const routeDensity = opts.routeDensity ?? run.routeDensity ?? DEFAULT_ROUTE_DENSITY;
      const pullFusion = opts.pullFusion ?? run.pullFusion ?? DEFAULT_PULL_FUSION;
      if (routeDensity === run.routeDensity && pullFusion === run.pullFusion) {
        return { ok: true };
      }
      // Same materialization enterInstance uses — one code path, so a route chosen here and a
      // route chosen at the portal cannot diverge.
      state.instance = enterRunWithRoute(def, {
        routeDensity,
        pullFusion,
        packBudget: {
          partyLevel: state.char.level,
          creatureOf: (entry) => ds.creature(entry),
          spellOf: (id) => ds.spell(id),
        },
        ...routeItemAccess(def),
        ...routePoolOpts(
          def,
          run.floorPoolSpawnedGuids ?? null,
          run.floorPoolSpawnedGoGuids ?? null,
        ),
      });
      return { ok: true };
    },

    recruitCompanion(cls, role, gearProfile) {
      // Seated allies must match state.squad — no mid-pull roster mutate (KI-961).
      {
        const busy = refuseIfInCombat(inLiveCombat(), YOU_ARE_IN_COMBAT);
        if (busy) return busy;
      }
      // Only tank|healer|dps and GEAR_PROFILES persist — same gate as setCompanionRole / KI-687.
      if (!isSquadRole(role)) {
        return { ok: false, reason: 'Unknown role' };
      }
      if (gearProfile != null && !isGearProfile(gearProfile)) {
        return {
          ok: false,
          reason: `Unknown gear profile '${String(gearProfile)}' (use ${GEAR_PROFILES.join(', ')})`,
        };
      }
      const squad = state.squad ?? [];
      if (rosterSize(squad, state.botRoster) >= MAX_ROSTER) {
        return { ok: false, reason: `Your roster is full (${MAX_ROSTER} companions)` };
      }
      const race = companionRaceFor(ds, state.char.race, cls);
      if (race == null) return { ok: false, reason: 'No one of your faction can fight that way' };
      // Seed on TOTAL owned, not party size: the squad stops at the cap, so every recruit past the
      // fourth drew a seed that depended only on class, and the 13th onward collided.
      const owned = rosterSize(squad, state.botRoster);
      const seed = hashSeed(state.rngSeed, 7100 + owned * 13 + cls);
      const gender = companionGender(seed);
      const takenNames = [...squad.map((c) => c.name), ...Object.values(state.botRoster ?? {}).map((c) => c.name)];
      const name = companionName(ds.botNames(), seed, gender, takenNames);
      // Stamp level to player so pet unlocks (hunter ≥10 / warlock Imp) apply immediately.
      const level = Math.max(1, Math.min(60, state.char.level));
      // Stamp a role-matching premade talent build when available so tank/healer
      // companions seed Protection/Holy bands (not Arms/Shadow) on first rotation build.
      const roleSpecIdx = botSpecIdxForRole(cls, role, ds);
      // Gear the recruit like an inn hire. It used to ship a naked level-60 body, so every headless
      // squad measurement read a fraction of real output — 39 naked companions did 5.5% of a boss.
      const profile = gearProfile ?? DEFAULT_HIRE_GEAR_PROFILE;
      const shell = companionCharacter(
        { id: `c${seed.toString(36)}`, name, race, cls, gender, role, seed, equipped: {},
          level, xp: 0,
          ...(roleSpecIdx != null ? { specIdx: roleSpecIdx } : {}) },
        level,
        ds,
      );
      const equipped = generateSpawnGear(shell, seed, ds, profile, {
        role,
        ...(roleSpecIdx != null ? { specIdx: roleSpecIdx } : {}),
      });
      // The same bag kit a raid body gets, whose own comment already claimed the paid hire did this. It
      // did not, and a hire with no Soul Shards can soulstone nobody and conjure nobody a healthstone.
      const kit = generateSpawnInventory({ ...shell, equipped }, seed, ds);
      const comp: Companion = {
        id: `c${seed.toString(36)}`, name, race, cls, gender, role, seed,
        equipped: { ...kit.equipped },
        bags: kit.inventory,
        level, xp: 0, gearProfile: profile,
        // ICH4: twink + raid-* default locked so band/endgame kits stay put (design §4.3).
        xpLocked: defaultXpLocked(profile),
        ...(roleSpecIdx != null ? { specIdx: roleSpecIdx } : {}),
      };
      applyCompanionPetSync(comp, level, ds);
      const placed = placeHire(squad, state.botRoster, comp);
      // A recruit that changed nothing must not answer ok — that is how 27 of 39 raid
      // hires vanished silently.
      if (placed.where === 'duplicate') return { ok: false, reason: 'That companion is already yours' };
      if (placed.where === 'full') return { ok: false, reason: `Your roster is full (${MAX_ROSTER} companions)` };
      state.squad = placed.squad;
      state.botRoster = placed.roster;
      reconcileGamePartyAuras(state, ds);
      log(placed.where === 'roster'
        ? `${name} joins your roster as ${role === 'dps' ? 'damage' : role} (party is full - tap Party on them in Companions).`
        : `${name} joins your party as ${role === 'dps' ? 'damage' : role}.`);
      return { ok: true, id: comp.id, name: comp.name, benched: placed.where === 'roster' };
    },

    dismissCompanion(id) {
      {
        const busy = refuseIfInCombat(inLiveCombat(), YOU_ARE_IN_COMBAT);
        if (busy) return busy;
      }
      const comp = state.squad?.find((c) => c.id === id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      // D4 ownership: the bot's gear/bags/bank are THEIRS - they leave with
      // everything and wait in your roster, re-hirable at any inn.
      state.squad = removeCompanion(state.squad ?? [], id);
      state.botRoster = { ...(state.botRoster ?? {}), [id]: comp };
      reconcileGamePartyAuras(state, ds);
      log(`${comp.name} leaves the party (their gear goes with them - bring them back from Companions).`);
      return { ok: true };
    },

    activateCompanion(id) {
      {
        const busy = refuseIfInCombat(inLiveCombat(), YOU_ARE_IN_COMBAT);
        if (busy) return busy;
      }
      // Combat only. Staging is the swap surface; Companions is not a live-floor panel (LIVE_PANEL_IDS).
      const squad = state.squad ?? [];
      if (squad.some((c) => c.id === id)) return { ok: false, reason: 'Already in your party' };
      const benched = state.botRoster?.[id];
      if (!benched) return { ok: false, reason: 'No such companion on your roster' };
      if (squad.length >= MAX_COMPANIONS) {
        return { ok: false, reason: `Your party is full (${MAX_COMPANIONS}) - bench someone first` };
      }
      const roster = { ...state.botRoster };
      delete roster[id];
      state.botRoster = roster;
      state.squad = addCompanion(squad, benched);
      reconcileGamePartyAuras(state, ds);
      log(`${benched.name} joins your party.`);
      return { ok: true, id: benched.id, name: benched.name };
    },

    setSquadRole(role) {
      // Only tank|healer|dps — match setCompanionRole so illegal stamps cannot hide grades.
      if (!isSquadRole(role)) {
        return { ok: false, reason: 'Unknown role' };
      }
      state.squadRole = role;
      // Align the auto-combat taunt policy with the signed dungeon role: the default suppresses taunts,
      // so signing tank must not leave the player as "DPS (no auto-taunt)".
      const ap = normalizeAutopilotConfig(state.autopilot);
      if (role === 'tank') {
        state.autopilot = { ...ap, combatRole: 'tank' };
      } else if (ap.combatRole === 'tank') {
        // No longer signed tank → drop auto-taunt (healer/dps). Offtank only via editor.
        state.autopilot = { ...ap, combatRole: 'dps' };
      }
      return { ok: true };
    },

    setSquadStrategy(strategy) {
      // Only careful|aggressive|sip have SQUAD_PACING rows — reject unknown keys so
      // runFullDungeon restBetweenPulls never TypeErrors on undefined.restTo (KI-687).
      if (strategy !== 'careful' && strategy !== 'aggressive' && strategy !== 'sip') {
        return { ok: false, reason: `Unknown squad strategy '${String(strategy)}' (use careful, aggressive, or sip)` };
      }
      state.squadStrategy = strategy;
      return { ok: true };
    },

    setCompanionAoeMode(id, mode) {
      const comp = state.squad?.find((c) => c.id === id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      if (mode !== 'auto' && mode !== 'aoe' && mode !== 'single') {
        return { ok: false, reason: 'Invalid AoE mode' };
      }
      comp.aoeMode = mode;
      return { ok: true };
    },

    setCompanionOffHeal(id, on) {
      const comp = state.squad?.find((c) => c.id === id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      comp.offHeal = !!on;
      return { ok: true };
    },

    setCompanionXpLocked(id, locked) {
      const comp = state.squad?.find((c) => c.id === id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      // Free toggle (design §3.4). Store explicit boolean so saves round-trip true/false.
      comp.xpLocked = !!locked;
      return { ok: true };
    },

    setAllCompanionsAoeMode(mode) {
      if (mode !== 'auto' && mode !== 'aoe' && mode !== 'single') {
        return { ok: false, reason: 'Invalid AoE mode' };
      }
      for (const c of state.squad ?? []) c.aoeMode = mode;
      return { ok: true };
    },

    equipCompanionBest(id) {
      const comp = state.squad?.find((c) => c.id === id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      let equipped = 0;
      // Their own bags first, then yours (a gifted item becomes the bot's).
      // equipOnCompanion keeps ownership straight (displaced gear → bot bags).
      for (const source of ['bot', 'player'] as const) {
        const skipped = new Set<number>();
        for (let guard = 0; guard < 16 && equipped < 12; guard++) {
          const lvl = companionLevel(comp, state.char.level);
          const char = companionCharacter(comp, lvl, ds);
          const inv = source === 'bot' ? (comp.bags ?? emptyInventory()) : state.inventory;
          // Spec weights plus Dual Wield: without them a dual-wielder never fills the off hand and a
          // caster gets melee-tilted junk. Cite: Player.cpp CanDualWield; RandomItemMgr GetPlayerSpecId.
          const sb = companionSpellbook(comp, lvl, ds);
          const equipOpts: EquipOpts = {
            canDualWield: knows(sb, DUAL_WIELD_SPELL_ID),
            specId: companionPlayerbotSpecId(comp.cls, comp.specIdx, comp.role, ds),
            role: comp.role,
          };
          const ups = findUpgrades(char, inv, ds, equipOpts);
          const best = ups.find((u) => !skipped.has(u.entry));
          if (!best) break;
          const r = equipOnCompanion(comp, best.entry, best.targetSlot);
          if (r.ok) equipped++;
          else skipped.add(best.entry);
        }
      }
      if (equipped > 0) {
        log(`${comp.name} equips ${equipped} upgrade${equipped === 1 ? '' : 's'}.`);
      }
      return { ok: true, equipped };
    },

    innkeeperHere,
    innCandidates,
    searchInnCandidates,

    hireCandidate(botId, role) {
      // Same SquadRole gate as recruitCompanion / setCompanionRole — refuse banana stamps.
      if (!isSquadRole(role)) {
        return { ok: false, reason: 'Unknown role' };
      }
      if (!innkeeperHere()) return { ok: false, reason: 'Companions are hired at an inn' };
      const squad = state.squad ?? [];
      if (squad.some((c) => c.id === botId)) return { ok: false, reason: 'Already in your party' };
      // A roster re-hire is free — the bot comes back exactly as it left. Activating a bench member is
      // the one path that must still refuse on a full PARTY, or benching them again reads as success.
      const benched = state.botRoster?.[botId];
      if (benched) {
        if (squad.length >= MAX_COMPANIONS) {
          return { ok: false, reason: `Your party is full (${MAX_COMPANIONS}) - dismiss someone to swap them in` };
        }
        const roster = { ...state.botRoster };
        delete roster[botId];
        state.botRoster = roster;
        const comp: Companion = { ...benched };
        if (comp.role !== role) applyCompanionRole(comp, role, ds);
        state.squad = addCompanion(squad, comp);
        reconcileGamePartyAuras(state, ds);
        log(`${comp.name} rejoins your party as ${role === 'dps' ? 'damage' : role} (re-hire free).`);
        return { ok: true, id: comp.id, name: comp.name, costCopper: 0 };
      }
      if (rosterSize(squad, state.botRoster) >= MAX_ROSTER) {
        return { ok: false, reason: `Your roster is full (${MAX_ROSTER} companions)` };
      }
      const cand = resolveCandidate(botId);
      if (!cand) return { ok: false, reason: 'That hire is no longer available' };
      // ICH1: freeze kit profile + spawn gear at hire (preview used the same profile).
      const gearProfile = cand.gearProfile ?? DEFAULT_HIRE_GEAR_PROFILE;
      // ICH2: first hire pays exact hireCostCopper; broke fails (design §3.1).
      const cost = cand.hireCostCopper ?? hireCostCopper(cand.bot.level, gearProfile);
      if (state.char.gold < cost) {
        return { ok: false, reason: 'Not enough gold' };
      }
      // Same helper as setCompanionRole / recruitCompanion — keep slate spec when it already plays `role`.
      const specIdx = specIdxForRole(cand.bot.cls, role, cand.bot.specIdx, ds) ?? cand.bot.specIdx;
      // PlayerbotFactory kit: bags/gold-path inventory + pet (same as Random Character).
      const hireShell = companionCharacter({
        id: cand.bot.id, name: cand.bot.name, race: cand.bot.race, cls: cand.bot.cls,
        role, seed: cand.bot.seed, equipped: { ...cand.gear }, level: cand.bot.level, specIdx,
        gearProfile,
      }, cand.bot.level, ds);
      const kit = generateSpawnInventory(
        { ...hireShell, equipped: { ...cand.gear } },
        cand.bot.seed,
        ds,
      );
      const petKit = initBotPet({ ...hireShell, equipped: kit.equipped }, cand.bot.seed, ds);
      const comp: Companion = {
        id: cand.bot.id,
        name: cand.bot.name,
        race: cand.bot.race,
        cls: cand.bot.cls,
        gender: cand.bot.gender,
        role,
        seed: cand.bot.seed,
        equipped: { ...kit.equipped }, // spawn gear + bag slots from InitBags
        level: cand.bot.level,
        xp: 0,
        specIdx,
        gearProfile,
        // ICH4: twink + raid-* default locked so band/endgame kits stay put (design §4.3).
        xpLocked: defaultXpLocked(gearProfile),
        bags: kit.inventory,
        bank: emptyInventory(),
        bankBags: [],
        ...(petKit ? { pet: petKit.pet, petSpells: petKit.petSpells } : {}),
      };
      if (cost > 0) {
        state.char = { ...state.char, gold: state.char.gold - cost };
      }
      const placed = placeHire(squad, state.botRoster, comp);
      state.squad = placed.squad;
      state.botRoster = placed.roster;
      reconcileGamePartyAuras(state, ds);
      // Design §13: Hired {name} for {price}
      const where = placed.where === 'roster' ? ' - your party is full, so they wait in your roster' : '';
      log(
        cost > 0
          ? `Hired ${comp.name} for ${hirePriceLabel(cost)}${where}.`
          : `Hired ${comp.name} (Free - knows their spells, bring your own steel)${where}.`,
      );
      return {
        ok: true, id: comp.id, name: comp.name, costCopper: cost, benched: placed.where === 'roster',
      };
    },

    // DEV: build the raid test roster for one raid from its tier template. It replaces a version that
    // spent the player's gold on the lowest-level bodies in the game. Free, generated, level 60.
    buildRaidRoster(opts) {
      const def = ds.instance(opts.dungeonId);
      if (!def) return { ok: false, reason: 'Unknown dungeon' };
      const tpl = raidRosterTemplate({
        ds,
        def,
        playerRace: state.char.race,
        playerRole: state.squadRole ?? 'dps',
        playerCls: state.char.cls,
        ...(opts.tier ? { tier: opts.tier } : {}),
      });
      if (!tpl) {
        // Separate the two refusals: a 5-man has no template at all, an unknown --tier is a typo.
        const named = opts.tier ? ` at tier '${String(opts.tier)}' (${RAID_TIER_IDS.join(', ')})` : '';
        return { ok: false, reason: `${def.name} has no raid roster template${named}` };
      }

      const members: Record<string, Companion> = {};
      const taken: string[] = [];
      let scores = 0;
      tpl.seats.forEach((seat, i) => {
        // Seeded on the raid + tier + seat index so the same template rebuilds the same raid —
        // a re-measurement has to be comparable to the one before it.
        const seed = hashSeed(
          stableIdHash(`${tpl.dungeonId}:${tpl.tier.id}`),
          7300 + i * 13 + seat.cls,
        );
        const built = buildRaidMember(
          seat.cls, seat.role, tpl.level, tpl.tier.gear, tpl.itemLevel, seed, taken,
        );
        if (!built) return;
        members[built.id] = built;
        taken.push(built.name);
        scores += displayGearScore(built.equipped, ds);
      });

      const built = Object.keys(members).length;
      if (!built) return { ok: false, reason: `No ${def.name} roster could be built for your faction` };
      state.raidRoster = { dungeonId: tpl.dungeonId, tier: tpl.tier.id, members };
      const comp = describeRaidComp([
        ...Object.values(members).map((c) => ({ cls: c.cls, role: c.role })),
        { cls: state.char.cls, role: state.squadRole ?? 'dps' },
      ]);
      const gearScore = Math.round(scores / built);
      log(`Raid roster [dev]: ${built + 1}/${tpl.size} for ${def.name} in ${tpl.tier.label} - ${comp}, avg ilvl ${gearScore}.`);
      return {
        ok: true,
        dungeonId: tpl.dungeonId,
        name: def.name,
        tier: tpl.tier.id,
        tierLabel: tpl.tier.label,
        size: tpl.size,
        built,
        comp,
        gearScore,
      };
    },

    clearRaidRoster() {
      const cleared = Object.keys(state.raidRoster?.members ?? {}).length;
      if (!cleared) return { ok: false, reason: 'No raid test roster to clear' };
      delete state.raidRoster;
      log(`Raid roster [dev]: cleared ${cleared} test companions.`);
      return { ok: true, cleared };
    },

    setInstanceRoster(dungeonId, ids) {
      const def = ds.instance(dungeonId);
      if (!def) return { ok: false, reason: 'Unknown dungeon' };
      const cap = maxCompanionsFor(def.maxPlayers);
      const ownedIds = new Set(allCompanions().map((c) => c.id));
      const picked = clampRosterPicks(ids, ownedIds, cap);
      // Empty is a real pick (you walk in alone). `clearInstanceRoster` is what returns to auto.
      state.instanceRoster = { dungeonId, ids: picked };
      return { ok: true, dungeonId, picked: picked.length, cap };
    },

    fillInstanceRoster(dungeonId) {
      const def = ds.instance(dungeonId);
      if (!def) return { ok: false, reason: 'Unknown dungeon' };
      const cap = maxCompanionsFor(def.maxPlayers);
      const owned: RosterPickBody[] = allCompanions().map((c) => ({
        id: c.id,
        cls: c.cls,
        role: c.role,
        level: companionLevel(c, state.char.level),
      }));
      if (!owned.length) return { ok: false, reason: 'You have no companions to bring' };
      const tpl = raidRosterTemplate({
        ds,
        def,
        playerRace: state.char.race,
        playerRole: state.squadRole ?? 'dps',
        playerCls: state.char.cls,
      });
      const ids = fillOwnedInstanceRoster({
        dungeonId,
        cap,
        owned,
        playerCls: state.char.cls,
        playerRole: state.squadRole ?? 'dps',
        seats: tpl?.seats ?? null,
      });
      if (!ids.length) return { ok: false, reason: 'No companion matched this instance' };
      state.instanceRoster = { dungeonId, ids };
      const mage = state.char.cls === CLASS.MAGE
        || ids.some((id) => owned.find((c) => c.id === id)?.cls === CLASS.MAGE);
      log(`${def.name}: ${ids.length}/${cap} from your roster${mage ? ' (mage in)' : ''}.`);
      return { ok: true, dungeonId, picked: ids.length, cap, mage };
    },

    clearInstanceRoster() {
      const n = state.instanceRoster?.ids.length ?? 0;
      if (!n) return { ok: false, reason: 'No instance roster picked' };
      delete state.instanceRoster;
      log('Instance roster: back to auto.');
      return { ok: true, cleared: n };
    },

    setRaidLineup(size, ids) {
      if (!isRaidLineupSize(size)) return { ok: false, reason: 'Raid size is 10, 20, or 40' };
      const cap = raidLineupCap(size);
      const ownedIds = new Set(allCompanions().map((c) => c.id));
      const picked = clampRosterPicks(ids, ownedIds, cap);
      state.raidLineup = { size, ids: picked };
      return { ok: true, size, picked: picked.length, cap };
    },

    fillRaidLineup(size) {
      if (!isRaidLineupSize(size)) return { ok: false, reason: 'Raid size is 10, 20, or 40' };
      const cap = raidLineupCap(size);
      const owned: RosterPickBody[] = allCompanions().map((c) => ({
        id: c.id,
        cls: c.cls,
        role: c.role,
        level: companionLevel(c, state.char.level),
      }));
      if (!owned.length) return { ok: false, reason: 'You have no companions to bring' };
      const ids = fillOwnedInstanceRoster({
        dungeonId: '',
        cap,
        owned,
        playerCls: state.char.cls,
        playerRole: state.squadRole ?? 'dps',
        seats: null,
      });
      if (!ids.length) return { ok: false, reason: 'No companion matched this raid size' };
      state.raidLineup = { size, ids };
      log(`Raid group: ${ids.length}/${cap} from your roster (${size}-man).`);
      return { ok: true, size, picked: ids.length, cap };
    },

    clearRaidLineup() {
      const n = state.raidLineup?.ids.length ?? 0;
      if (!state.raidLineup) return { ok: false, reason: 'No raid group picked' };
      delete state.raidLineup;
      log('Raid group: back to auto.');
      return { ok: true, cleared: n };
    },

    raidRosterInfo() {
      const rr = state.raidRoster;
      if (!rr) return null;
      const members = Object.values(rr.members ?? {});
      if (!members.length) return null;
      const def = ds.instance(rr.dungeonId);
      const tier = RAID_TIERS[rr.tier] ?? RAID_TIERS.t1;
      const levels = members.map((c) => c.level ?? 1);
      let scores = 0;
      for (const c of members) {
        scores += displayGearScore(c.equipped, ds);
      }
      return {
        dungeonId: rr.dungeonId,
        name: def?.name ?? rr.dungeonId,
        tier: rr.tier,
        tierLabel: tier.label,
        size: def?.maxPlayers ?? members.length + 1,
        built: members.length,
        comp: describeRaidComp([
          ...members.map((c) => ({ cls: c.cls, role: c.role })),
          { cls: state.char.cls, role: state.squadRole ?? 'dps' },
        ]),
        gearScore: Math.round(scores / members.length),
        levels: { min: Math.min(...levels), max: Math.max(...levels) },
      };
    },

    // Let companions go for good, refunding what they cost. Dismiss only benches, so nothing could
    // REMOVE one. The refund is exact: the cost is a pure function of level and kit profile.
    releaseCompanions(opts) {
      const idSet = opts.ids?.length ? new Set(opts.ids) : null;
      const maxLevel = opts.maxLevel;
      if (!idSet && maxLevel == null) return { ok: false, reason: 'Name companions or a level cap to release' };
      const wanted = (c: Companion): boolean => {
        if (idSet) return idSet.has(c.id);
        return (c.level ?? 1) <= (maxLevel ?? 0);
      };
      const squad = state.squad ?? [];
      const bench = { ...(state.botRoster ?? {}) };
      const goneNames: string[] = [];
      let refund = 0;
      const keep: Companion[] = [];
      const drop = (c: Companion): void => {
        goneNames.push(c.name);
        refund += hireCostCopper(c.level ?? 1, c.gearProfile ?? DEFAULT_HIRE_GEAR_PROFILE);
      };
      for (const c of squad) {
        if (wanted(c)) drop(c);
        else keep.push(c);
      }
      for (const [id, c] of Object.entries(bench)) {
        if (!wanted(c)) continue;
        drop(c);
        delete bench[id];
      }
      if (!goneNames.length) return { ok: false, reason: 'No companion matched' };
      state.squad = keep;
      state.botRoster = bench;
      reconcileGamePartyAuras(state, ds);
      if (refund > 0) state.char = { ...state.char, gold: state.char.gold + refund };
      log(`Released ${goneNames.length} companions - refunded ${hirePriceLabel(refund)}.`);
      return { ok: true, released: goneNames.length, refundCopper: refund, names: goneNames };
    },

    // The inn-gated tavern trial: an auto-resolved duel against a slate candidate or a companion,
    // yielding at 1 HP with no gold, loot, XP or durability. Cite: domain/run/duel.ts.
    tavernDuel(targetId) {
      if (!innkeeperHere()) {
        return { ok: false, reason: 'Tavern trials are only at an inn' };
      }
      if (busyTravelling()) {
        return { ok: false, reason: 'You are travelling' };
      }
      // Same death gate as startFight / travel refuseIfDead (KI-861).
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }

      // Resolve opponent: slate candidate → active squad → benched roster.
      let oppComp: Companion | undefined;
      let oppLevel: number | undefined;
      const cand = resolveCandidate(targetId);
      if (cand) {
        const role: Companion['role'] =
          cand.specRole === 'tank' || cand.specRole === 'healer' ? cand.specRole : 'dps';
        oppComp = {
          id: cand.bot.id,
          name: cand.bot.name,
          race: cand.bot.race,
          cls: cand.bot.cls,
          gender: cand.bot.gender,
          role,
          seed: cand.bot.seed,
          equipped: { ...cand.gear },
          level: cand.bot.level,
          specIdx: cand.bot.specIdx,
          gearProfile: cand.gearProfile,
        };
        oppLevel = cand.bot.level;
      } else {
        oppComp = findCompanion(targetId) ?? state.botRoster?.[targetId];
        if (oppComp) oppLevel = companionLevel(oppComp, state.char.level);
      }
      if (!oppComp || oppLevel == null) {
        return { ok: false, reason: 'That combatant is not available to trial' };
      }
      if (oppComp.name === state.char.name) {
        return { ok: false, reason: 'You cannot duel yourself' };
      }

      // Slate already level-windows peers; relax MAX_DUEL_LEVEL_GAP for trials.
      const chk = canChallenge(
        { name: state.char.name, level: state.char.level },
        { name: oppComp.name, level: oppLevel },
        { ignoreLevelGap: true },
      );
      if (!chk.ok) return { ok: false, reason: chk.reason ?? 'Cannot start trial' };

      // Real combatant shells — same buildCombatant / companionSpec path as outdoor fights.
      const playerSpec = buildCombatant(state.char, state.spellbook, ds, state.inventory);
      playerSpec.items = combatItems(state.char, state.inventory, ds);
      const targetSpec = companionSpec(oppComp, oppLevel, ds);
      // A trial is a duel, so the foe fights the pvp band and G16's matchup list, exactly as a
      // gauntlet rung is seated (arenaLab.ts:96-114). Without the provider a player-shaped enemy
      // spec only takes the class heuristics (types.ts:757), so it never ran its own list at all.
      const oppRotVariant = vsClassVariant(state.char.cls);
      const oppRot = companionRotationOf(oppComp, state.char.level, ds, undefined, {
        mode: 'pvp', ...(oppRotVariant ? { variant: oppRotVariant } : {}),
      });
      // Seeded stream: advance fightCounter so trials are deterministic and don't re-roll free.
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      // The trial is a FIGHT now, not a verdict: the caller mounts this session on the combat surface.
      // Still ephemeral — no live pointer, so it can never be settled for gold, XP or loot.
      const geo = seedDuelGeometry({
        player: playerSpec, enemySpecs: [targetSpec], spellOf: (id) => ds.spell(id),
      });
      const playerProvider = playerFightActionProvider(state, ds, ctx.opts);
      const session = createDuelSession(playerSpec, targetSpec, rng, {
        enemyActionProviders: [companionActionProvider(oppRot, undefined, {
          companion: oppComp,
          isOocKeepUp: (id) => isCompanionKeepUpSpell(ds.spell(id)),
        })],
        ...(playerProvider ? { playerActionProvider: playerProvider } : {}),
        unitPositionsYd: geo.positions,
        geometryAnchor: geo.anchor,
      });
      log(`Tavern trial vs ${oppComp.name}. Both yield at 1 HP - no stakes.`);

      return {
        ok: true,
        session,
        targetName: oppComp.name,
        opponent: {
          race: oppComp.race,
          cls: oppComp.cls,
          gender: oppComp.gender,
          equipped: oppComp.equipped,
        },
      };
    },

    setCompanionSpec(id, specIdx) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const specs = ds.botSpecs(comp.cls);
      if (specs.length === 0) return { ok: false, reason: 'No premade talent builds for this class' };
      if (!Number.isInteger(specIdx) || specIdx < 0 || specIdx >= specs.length) {
        return { ok: false, reason: 'Unknown talent build' };
      }
      const next = specs[specIdx]!;
      if (comp.specIdx === specIdx && !comp.talentLink) return { ok: true, name: next.name };
      comp.specIdx = specIdx;
      if (comp.talentLink) delete comp.talentLink;
      // Spec change invalidates the seeded rotation — rebuild on next ensure/fight
      // so Protection↔Arms actually swaps the combat list (not just talents).
      if (comp.rotation && !comp.rotation.custom) delete comp.rotation;
      log(`${comp.name} respecs to ${next.name}.`);
      return { ok: true, name: next.name };
    },

    setCompanionTalentLink(id, link) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      if (link == null || link === '') {
        if (!comp.talentLink) return { ok: true, name: comp.name };
        delete comp.talentLink;
        if (comp.rotation && !comp.rotation.custom) delete comp.rotation;
        log(`${comp.name} returns to a premade talent build.`);
        return { ok: true, name: comp.name };
      }
      const clean = link.trim();
      const lvl = companionLevel(comp, state.char.level);
      const want = talentsFromLink(clean, comp.cls, lvl, ds);
      if (!Object.values(want).some((n) => n > 0)) {
        return { ok: false, reason: `Nothing in that string fits a level ${lvl} ${comp.name}` };
      }
      if (comp.talentLink === clean) return { ok: true, name: comp.name };
      comp.talentLink = clean;
      if (comp.rotation && !comp.rotation.custom) delete comp.rotation;
      log(`${comp.name} uses a saved talent build.`);
      return { ok: true, name: comp.name };
    },

    setCompanionRole(id, role) {
      // Role was hire-time-only purely by omission: the player re-signs their own role
      // anytime (setSquadRole) while companions needed a dismiss→inn-rehire round trip.
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      if (!isSquadRole(role)) {
        return { ok: false, reason: 'Unknown role' };
      }
      if (comp.role === role) return { ok: true };
      // Re-stamp the matching talent premade when one exists, a free respec, so gear weights and
      // rotation bands follow the new job. An Arms-talented "tank" would otherwise get tank rules.
      applyCompanionRole(comp, role, ds);
      // Live fight: groupRole was snapshotted at pull — restamp the fighter + provider
      // so this pull sees tank/heal/dps now (not only the next one). Cite: docs/PLAN.md:43.
      const live = combat.getLiveFightSession();
      if (live && !live.ended && typeof live.setAllyGroupRole === 'function') {
        const idx = (state.squad ?? []).findIndex((c) => c.id === id);
        if (idx >= 0) {
          const groupRole = role === 'dps' ? 'damage' : role;
          const provider = companionActionProvider(
            ensureCompanionRotation(comp),
            undefined,
            {
              companion: comp,
              isMultiSpell: (sid) => isMultiTargetCombatSpell(ds.spell(sid)),
              isOocKeepUp: (sid) => isCompanionKeepUpSpell(ds.spell(sid)),
            },
          );
          live.setAllyGroupRole(`ally_${idx}`, groupRole, provider);
        }
      }
      log(`${comp.name} re-signs as ${role === 'dps' ? 'DPS' : role}.`);
      return { ok: true };
    },

    setCompanionPet(id, creatureEntry) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const lvl = companionLevel(comp, state.char.level);
      const r = setCompanionPetCreature(comp, lvl, creatureEntry, ds);
      if (!r.ok) return { ok: false, reason: r.reason };
      comp.pet = r.pet;
      comp.petSpells = r.petSpells;
      log(`${comp.name} calls ${r.pet.name}.`);
      return { ok: true, name: r.pet.name };
    },

    setCompanionPetAutocast(id, spellId, on) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const pet = comp.pet;
      if (!pet) return { ok: false, reason: 'Companion has no pet' };
      const sp = ds.spell(spellId);
      if (!sp) return { ok: false, reason: 'Unknown ability' };
      const sameChain = (sid: number) => sid === spellId || ds.spell(sid)?.name === sp.name;
      const off = pet.autocastOff ?? [];
      const wasOff = off.some(sameChain);
      // Explicit `on` wins; otherwise toggle.
      const wantOn = on !== undefined ? on : wasOff;
      let next: number[];
      if (wantOn) {
        next = off.filter((sid) => !sameChain(sid));
      } else {
        next = wasOff ? off : [...off, spellId];
      }
      comp.pet = { ...pet, ...(next.length ? { autocastOff: next } : { autocastOff: undefined }) };
      return { ok: true, enabled: wantOn };
    },

    equipCompanionSlot(id, itemEntry, preferred) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const r = equipOnCompanion(comp, itemEntry, preferred);
      if (!r.ok) return { ok: false, reason: r.reason ?? 'Cannot be equipped' };
      log(`${comp.name} equips ${ds.item(itemEntry)?.name ?? itemEntry}.`);
      return { ok: true, slot: r.slot! };
    },

    unequipCompanionSlot(id, slot) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const inst = equippedInstance(comp.equipped[slot]);
      if (inst == null) return { ok: false, reason: 'Nothing equipped there' };
      const idef = ds.item(inst.item);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      // Their gear stays theirs: bags first, then bank (identity intact).
      const equipped = { ...comp.equipped };
      delete equipped[slot];
      const cap = bagCapacity(companionCharacter({ ...comp, equipped }, companionLevel(comp, state.char.level), ds), ds);
      let bags = comp.bags ?? emptyInventory();
      let bank = comp.bank ?? emptyInventory();
      const maxStack = idef.stackable ?? 1;
      const bCap = bankCapacity(comp.bankBags ?? [], ds);
      if (canFit(bags, inst.item, inst.count, maxStack, cap)) {
        bags = addInstance(bags, inst, maxStack);
      } else if (canFit(bank, inst.item, inst.count, maxStack, bCap)) {
        bank = addInstance(bank, inst, maxStack);
      } else {
        return { ok: false, reason: 'Inventory full' };
      }
      // Unequipping a bag shrinks capacity — refuse if remaining stacks would overflow.
      if (idef.slot === 'bag' && usedSlots(bags) > cap) {
        return { ok: false, reason: 'Inventory full' };
      }
      comp.equipped = equipped;
      // W5 D1 / gap 1: poison does not follow a companion weapon swap (after capacity ok).
      if ((slot === 'mainhand' || slot === 'offhand') && comp.tempEnchants?.[slot]) {
        const te = { ...comp.tempEnchants };
        delete te[slot];
        comp.tempEnchants = (te.mainhand || te.offhand) ? te : undefined;
      }
      comp.bags = bags;
      comp.bank = bank;
      log(`${comp.name} unequips ${idef.name}.`);
      return { ok: true };
    },

    // One gearing view for the whole roster: the player's BANK is a source, and a shared stack must be
    // CLAIMED — highest delta wins, so Apply all cannot hand out the same axe twice.
    squadUpgradePlan() {
      return doSquadUpgradePlan();
    },

    applySquadUpgrades(max = 40, allowKeys) {
      let equipped = 0;
      const skipped = new Set<string>();
      const allow = allowKeys ? new Set(allowKeys) : null;
      for (let guard = 0; guard < max * 2 && equipped < max; guard++) {
        const next = doSquadUpgradePlan().find((r) => {
          const key = sendGoodsUpgradeKey(r);
          if (skipped.has(key)) return false;
          if (allow && !allow.has(key)) return false;
          return true;
        });
        if (!next) break;
        const key = sendGoodsUpgradeKey(next);
        const comp = findCompanion(next.companionId);
        if (!comp) { skipped.add(key); continue; }
        // equipOnCompanion sources their bags then yours — a bank row has to surface first.
        if (next.from === 'bank' && !withdrawForEquip(next.entry)) { skipped.add(key); continue; }
        // A mate's row crosses through your bags: take it from the holder, then equip from yours.
        if (next.from === 'mate' && !(next.holderId && self.takeItemFromBot(next.holderId, next.entry, 1).ok)) {
          skipped.add(key);
          continue;
        }
        const r = equipOnCompanion(comp, next.entry, next.targetSlot);
        if (r.ok) {
          equipped++;
          log(`${comp.name} equips ${ds.item(next.entry)?.name ?? next.entry}.`);
        } else {
          skipped.add(key);
        }
      }
      return { ok: true as const, equipped };
    },

    // The player's own suggestion row: a companion-held piece comes through your bags first.
    equipSuggestedUpgrade(itemEntry) {
      const hit = gear.suggestedEquipmentUpgrades().find((u) => u.entry === itemEntry);
      if (hit?.holderId) {
        const t = self.takeItemFromBot(hit.holderId, itemEntry, 1);
        if (!t.ok) return { ok: false, reason: t.reason };
      }
      return gear.equip(itemEntry, hit?.slot);
    },

    // ---- share consumables ---------------------------------------------------------------

    consumableShareState() {
      return normalizeConsumableShare(state.consumableShare);
    },

    // Party is the four seats; raid is the lineup picked on the 10/20/40 tab, and falls back to the
    // party when no lineup is set. Same pick as instanceRoster.ts pickInstanceRoster.
    consumableShareMembers() {
      const share = normalizeConsumableShare(state.consumableShare);
      const party = state.squad ?? [];
      let comps: Companion[] = party;
      if (share.scope === 'raid' && state.raidLineup?.ids.length) {
        const seen = new Set<string>();
        comps = [];
        for (const id of state.raidLineup.ids) {
          const c = findCompanion(id);
          if (c && !seen.has(c.id)) { seen.add(c.id); comps.push(c); }
        }
      }
      return comps.map((c) => shareMemberOf(c, state.char.level, ds));
    },

    // Player bags, bank, and every seated companion's bags are one pool. A bank row and a
    // companion over their share are withdrawn on apply, then the short seats are filled.
    squadConsumableDetail() {
      const share = normalizeConsumableShare(state.consumableShare);
      const off = new Set(share.off ?? []);
      return planConsumableShare({
        ds,
        inventory: { stacks: [...state.inventory.stacks, ...(state.bank ?? emptyInventory()).stacks] },
        members: self.consumableShareMembers(),
        rules: share.rules,
        includeYou: share.includeYou ?? true,
        you: shareMemberOfYou(state.char, state.spellbook.known, ds),
        cats: SHARE_CATEGORIES.filter((c) => !off.has(c)),
      });
    },

    squadConsumablePlan() {
      return shareRowsOf(self.squadConsumableDetail());
    },

    applySquadConsumablePlan(pick) {
      const want = typeof pick === 'number' ? { entry: pick } : (pick ?? {});
      const detail = self.squadConsumableDetail().filter((e) =>
        (want.entry == null || e.entry === want.entry) && (want.key == null || e.key === want.key));
      let moved = 0;
      let rows = 0;
      const skipped: string[] = [];
      for (const e of detail) {
        for (const t of e.takes) {
          const r = self.takeItemFromBot(t.companionId, t.entry, t.count);
          if (!r.ok) skipped.push(`${t.companionName}: ${r.reason}`);
        }
        for (const row of e.rows) {
          const short = row.count - countItem(state.inventory, row.entry);
          for (let i = 0; i < short; i++) if (!withdrawForEquip(row.entry)) break;
          const r = self.giveItemToBot(row.companionId, row.entry, row.count);
          if (r.ok) { moved += r.moved; rows++; } else { skipped.push(`${row.companionName}: ${r.reason}`); }
        }
      }
      return { ok: true as const, moved, rows, skipped };
    },

    setConsumableShareRule(key, rule) {
      const share = normalizeConsumableShare(state.consumableShare);
      if (rule == null || rule.kind === 'auto') delete share.rules[key];
      else share.rules[key] = rule;
      state.consumableShare = share;
      return { ok: true as const };
    },

    setConsumableShareScope(scope) {
      const share = normalizeConsumableShare(state.consumableShare);
      state.consumableShare = { ...share, scope };
      return { ok: true as const };
    },

    setConsumableShareIncludeYou(on) {
      const share = normalizeConsumableShare(state.consumableShare);
      state.consumableShare = { ...share, includeYou: on };
      return { ok: true as const };
    },

    setConsumableShareCat(cat, on) {
      if (!(SHARE_CATEGORIES as readonly string[]).includes(cat)) return { ok: false as const, reason: 'Unknown kit' };
      const share = normalizeConsumableShare(state.consumableShare);
      const off = new Set(share.off ?? []);
      if (on) off.delete(cat);
      else off.add(cat);
      state.consumableShare = { ...share, off: off.size ? [...off] : undefined };
      return { ok: true as const };
    },

    // ---- professions + zone missions + party vault craft --------------------------------

    companionProfessionsOf(id) {
      const comp = findCompanion(id);
      if (!comp) return null;
      ensureMissionShape(comp);
      const lvl = companionLevel(comp, state.char.level);
      const skills = companionSkillMap(comp, lvl);
      // Keep trainer/vendor catalog and trainer ranks in sync with skill (free for companions).
      syncCompanionProfessionCatalog(comp, skills, ds);
      announceCompanionRanks(comp, lvl, ds, log);
      return {
        cap: professionSkillCap(lvl),
        assigned: comp.professions != null && Object.keys(comp.professions).length > 0,
        lines: (Object.keys(skills) as SkillLine[]).map((line) => ({
          line,
          current: skills[line]!.current,
          max: skills[line]!.max,
          kind: ds.profession(line)?.kind ?? 'crafting',
          rank: companionTrainedRank(line, skills[line]!.current, lvl)?.name,
        })),
      };
    },

    // Take up a profession. The first call FREEZES the seed-derived set into `professions`, so learning one
    // thing does not silently wipe the two the body arrived with.
    learnCompanionProfession(id, line) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const lvl = companionLevel(comp, state.char.level);
      if (comp.professions == null || Object.keys(comp.professions).length === 0) {
        const derived = companionSkillMap(comp, lvl);
        const frozen: CompanionProfessionMap = {};
        for (const k of Object.keys(derived) as SkillLine[]) frozen[k] = derived[k]!.current;
        comp.professions = frozen;
      }
      const gate = canCompanionLearnProfession(comp, line, ds);
      if (!gate.ok) return { ok: false, reason: gate.reason };
      comp.professions = { ...comp.professions, [line]: 1 };
      const skills = companionSkillMap(comp, lvl);
      syncCompanionProfessionCatalog(comp, skills, ds);
      // Tools for the new line (pick, knife, rod, …).
      const shell = companionCharacter(comp, lvl, ds);
      shell.skills = skills;
      shell.knownRecipes = comp.knownRecipes ?? [];
      shell.knownEnchants = comp.knownEnchants ?? [];
      comp.bags = initInventorySkill(shell, comp.bags ?? emptyInventory(), ds);
      log(`${comp.name} takes up ${ds.profession(line)?.name ?? line}.`);
      announceCompanionRanks(comp, lvl, ds, log);
      return { ok: true };
    },

    unlearnCompanionProfession(id, line) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const lvl = companionLevel(comp, state.char.level);
      if (comp.professions == null || Object.keys(comp.professions).length === 0) {
        const derived = companionSkillMap(comp, lvl);
        const frozen: CompanionProfessionMap = {};
        for (const k of Object.keys(derived) as SkillLine[]) frozen[k] = derived[k]!.current;
        comp.professions = frozen;
      }
      if (comp.professions[line] == null) return { ok: false, reason: 'They do not know that' };
      ensureMissionShape(comp);
      if (comp.mission?.skill === line) return { ok: false, reason: 'They are away on that profession' };
      const next = { ...comp.professions };
      delete next[line];
      comp.professions = next;
      // Drop recipes for that line only.
      if (comp.knownRecipes?.length) {
        const drop = new Set(ds.recipes().filter((r) => r.skill === line).map((r) => r.id));
        comp.knownRecipes = comp.knownRecipes.filter((id) => !drop.has(id));
      }
      if (line === 'enchanting') comp.knownEnchants = [];
      log(`${comp.name} abandons ${ds.profession(line)?.name ?? line}.`);
      return { ok: true };
    },

    companionPartyEnergy(nowMs = Date.now()) {
      return partyEnergy(state.companionEnergy, nowMs);
    },

    companionMissionZones(id, skill) {
      const comp = findCompanion(id);
      if (!comp || !isMissionSkill(skill)) return [];
      const lvl = companionLevel(comp, state.char.level);
      const skills = companionSkillMap(comp, lvl);
      const cur = missionWorkSkill(skill, skills[skill]?.current, lvl);
      if (cur == null || cur <= 0) return [];
      return recommendGatherZones(skill, cur, ds, {
        skinCreaturesByZone: skill === 'skinning' ? skinCreaturesByZone() : undefined,
        limit: 12,
      }).map((r) => ({
        zoneId: r.zoneId,
        zoneName: r.zoneName,
        preview: r.preview,
        targetCount: r.targetCount,
      }));
    },

    sendCompanionOnMission(id, skill, zoneId, hours, nowMs = Date.now()) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      ensureMissionShape(comp);
      if (comp.mission) return { ok: false, reason: `${comp.name} is already away` };
      if (state.instance) return { ok: false, reason: 'Not while you are in a dungeon' };
      if (!isMissionSkill(skill)) return { ok: false, reason: 'Only mining, herbalism, or skinning' };
      const h = Math.max(1, Math.min(MAX_MISSION_HOURS, Math.floor(hours)));
      const cost = energyCostForHours(h);
      const lvl = companionLevel(comp, state.char.level);
      const skills = companionSkillMap(comp, lvl);
      const atSkill = missionWorkSkill(skill, skills[skill]?.current, lvl);
      if (atSkill == null) return { ok: false, reason: `${comp.name} does not have that profession` };
      const zone = ds.zone(zoneId);
      if (!zone) return { ok: false, reason: 'Unknown zone' };
      const nodes = missionNodesFor({ skill, zoneId, atSkill });
      if (!nodes.length) {
        return {
          ok: false,
          reason: `Nothing in ${zone.name} for ${comp.name} to work at ${ds.profession(skill)?.name ?? skill} ${atSkill}`,
        };
      }
      const energy = partyEnergy(state.companionEnergy, nowMs);
      if (energy < cost) {
        return {
          ok: false,
          reason: `Need ${cost} energy (have ${energy}). Pool refills at 06:00 local.`,
        };
      }
      state.companionEnergy = spendPartyEnergy(state.companionEnergy, cost, nowMs);
      comp.mission = {
        skill,
        zoneId,
        hours: h,
        energyCost: cost,
        departedAtEpochMs: nowMs,
        atLevel: lvl,
        atSkill,
      };
      log(
        `${comp.name} heads to ${zone.name} to ${skill === 'skinning' ? 'skin' : skill === 'herbalism' ? 'herb' : 'mine'} for ${h}h (${cost} energy).`,
      );
      return { ok: true, mission: comp.mission };
    },

    recallCompanionMission(id) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      ensureMissionShape(comp);
      if (!comp.mission) return { ok: false, reason: 'They are not away' };
      // Recall forfeits the payout; energy is already spent and is NOT refunded.
      delete comp.mission;
      log(`${comp.name} comes home early with nothing to show.`);
      return { ok: true };
    },

    collectCompanionMission(id, nowMs = Date.now()) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      ensureMissionShape(comp);
      const m = comp.mission;
      if (!m) return { ok: false, reason: 'They are not away' };
      const p = missionProgress(m, nowMs);
      if (!p.done) return { ok: false, reason: `${comp.name} is still away - ${missionEtaLabel(p)}` };

      const nodes = missionNodesFor(m);
      const rows = zoneMissionYield(m, comp, nodes);
      const yielded: Array<{ item: number; count: number }> = [];
      const ctx = vaultCtx();
      const mut = vaultMut();
      for (const row of rows) {
        const idef = ds.item(row.item);
        if (!idef) continue;
        const stack = idef.stackable ?? 1;
        const { deposited, remaining } = partyDeposit(ctx, mut, row.item, row.count, stack, comp.id);
        if (deposited > 0) yielded.push({ item: row.item, count: deposited });
        if (remaining > 0) {
          log(`${comp.name} could not store ${remaining}× ${idef.name} - party bags full.`);
        }
      }

      let skillUp = gatherMissionSkillGain(m);
      if (skillUp > 0) {
        const base = comp.professions?.[m.skill] ?? m.atSkill;
        // Freeze seed-derived set if still implicit.
        if (comp.professions == null || Object.keys(comp.professions).length === 0) {
          const derived = companionSkillMap(comp, companionLevel(comp, state.char.level));
          const frozen: CompanionProfessionMap = {};
          for (const k of Object.keys(derived) as SkillLine[]) frozen[k] = derived[k]!.current;
          comp.professions = frozen;
        }
        comp.professions = { ...(comp.professions ?? {}), [m.skill]: base + skillUp };
        const skills = companionSkillMap(comp, companionLevel(comp, state.char.level));
        syncCompanionProfessionCatalog(comp, skills, ds);
        announceCompanionRanks(comp, companionLevel(comp, state.char.level), ds, log);
      }

      delete comp.mission;
      const zoneName = ds.zone(m.zoneId)?.name ?? m.zoneId;
      const what = yielded.length
        ? yielded.map((y) => `${y.count}× ${ds.item(y.item)?.name ?? y.item}`).join(', ')
        : 'nothing usable';
      log(`${comp.name} returns from ${zoneName}: ${what}${skillUp ? ` (+${skillUp} skill)` : ''}.`);
      return { ok: true, skillUp, yielded };
    },

    previewCompanionMission(id, nowMs = Date.now()) {
      const comp = findCompanion(id);
      if (!comp) return null;
      ensureMissionShape(comp);
      const m = comp.mission;
      if (!m) return null;
      const nodes = missionNodesFor(m);
      return {
        skillUp: gatherMissionSkillGain(m),
        yielded: zoneMissionYield(m, comp, nodes),
        progress: missionProgress(m, nowMs),
      };
    },

    collectAllCompanionMissions(nowMs = Date.now()) {
      const bodies = [...(state.squad ?? []), ...Object.values(state.botRoster ?? {})];
      const collected: Array<{
        id: string;
        name: string;
        skillUp: number;
        yielded: Array<{ item: number; count: number }>;
      }> = [];
      for (const c of bodies) {
        ensureMissionShape(c);
        if (!c.mission) continue;
        if (!missionProgress(c.mission, nowMs).done) continue;
        const res = self.collectCompanionMission(c.id, nowMs);
        if (res.ok) collected.push({ id: c.id, name: c.name, skillUp: res.skillUp, yielded: res.yielded });
      }
      return { ok: true as const, collected };
    },

    craftAsCompanion(id, recipeId) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      if (comp.mission) return { ok: false, reason: `${comp.name} is away` };
      const recipe = ds.recipe(recipeId);
      if (!recipe) return { ok: false, reason: 'Unknown recipe' };
      const lvl = companionLevel(comp, state.char.level);
      const skills = companionSkillMap(comp, lvl);
      syncCompanionProfessionCatalog(comp, skills, ds);
      if (!(comp.knownRecipes ?? []).includes(recipeId)) {
        return { ok: false, reason: `${comp.name} does not know that recipe` };
      }
      const bought = buyVaultVendorReagents(recipe.reagents, comp.id);
      if (!bought.ok) return { ok: false, reason: bought.reason };
      // Pull reagents from the party vault into the companion's bags, then craft there.
      const ctx = vaultCtx();
      const mut = vaultMut();
      const takenRows: Array<{ item: number; count: number }> = [];
      for (const rg of recipe.reagents) {
        const taken = partyTake(ctx, mut, rg.item, rg.count, comp.id);
        if (taken < rg.count) {
          // Refund partial takes.
          for (const row of takenRows) {
            const idef = ds.item(row.item);
            partyDeposit(ctx, mut, row.item, row.count, idef?.stackable ?? 1, comp.id);
          }
          if (taken > 0) {
            const idef = ds.item(rg.item);
            partyDeposit(ctx, mut, rg.item, taken, idef?.stackable ?? 1, comp.id);
          }
          return { ok: false, reason: `Missing reagents for ${recipe.name}` };
        }
        takenRows.push({ item: rg.item, count: rg.count });
      }
      // Re-add debited reagents onto companion bags so craft() can consume them in one inv.
      let workBags = comp.bags ?? emptyInventory();
      for (const rg of recipe.reagents) {
        const idef = ds.item(rg.item);
        workBags = addItem(workBags, rg.item, rg.count, idef?.stackable ?? 1);
      }

      const shell = companionCharacter(comp, lvl, ds);
      shell.skills = skills;
      shell.knownRecipes = comp.knownRecipes ?? [];
      shell.knownEnchants = comp.knownEnchants ?? [];
      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const productStack = ds.item(recipe.product.item)?.stackable ?? 1;
      const cap = bagCapacity(shell, ds);
      // Signature matches engine/game/professions.ts craft path. A companion is its own body, so
      // the transmute cooldown reads and stamps THEIR clocks, not the player's.
      const now = Date.now();
      const res = doCraft(
        shell, workBags, recipe, productStack, rng, cap, ds, undefined, undefined,
        { spellCooldowns: comp.spellCooldowns, categoryCooldowns: comp.categoryCooldowns, now },
        partyTools(),
      );
      if (!res.ok) {
        // Reagents stay on the companion if craft refused after we staged them.
        comp.bags = res.inventory;
        if (res.reason === 'Not ready yet') {
          const rem = recipeCooldownRemainingMs(recipe, comp, now);
          return { ok: false, reason: `${comp.name} is ready in ${craftCooldownLabel(rem)}` };
        }
        return { ok: false, reason: res.reason ?? 'Cannot craft' };
      }
      stampRecipeCooldown(recipe, {
        spellCooldowns: (comp.spellCooldowns ??= {}),
        categoryCooldowns: (comp.categoryCooldowns ??= {}),
      }, now);
      if (res.skillUp != null && res.char.skills[recipe.skill]) {
        const v = res.char.skills[recipe.skill]!.current;
        if (comp.professions == null || Object.keys(comp.professions).length === 0) {
          const frozen: CompanionProfessionMap = {};
          for (const k of Object.keys(skills) as SkillLine[]) frozen[k] = skills[k]!.current;
          comp.professions = frozen;
        }
        comp.professions = { ...(comp.professions ?? {}), [recipe.skill]: v };
        syncCompanionProfessionCatalog(comp, companionSkillMap(comp, lvl), ds);
        announceCompanionRanks(comp, lvl, ds, log);
      }
      comp.bags = res.inventory;
      const product = recipe.product.item;
      const pname = ds.item(product)?.name ?? product;
      const made = res.produced?.count ?? 1;
      log(`${comp.name} crafts ${made}× ${pname}.${res.skillUp ? ` (${recipe.skill} → ${res.skillUp})` : ''}`);
      return { ok: true, product, count: made, skillUp: res.skillUp, ...(bought.cost ? { spent: bought.cost } : {}) };
    },

    enchantAsCompanion(enchanterId, enchantId, slot, target) {
      const enchanter = findCompanion(enchanterId);
      if (!enchanter) return { ok: false, reason: 'No such companion' };
      if (enchanter.mission) return { ok: false, reason: `${enchanter.name} is away` };
      const enchant = ds.enchant(enchantId);
      if (!enchant) return { ok: false, reason: 'Unknown enchant' };
      if (target !== enchanterId && hasAttrEx2(ds.spell(enchant.spellId), SPELL_ATTR_EX2.ENCHANT_OWN_ITEM_ONLY)) {
        return { ok: false, reason: 'They can only enchant their own items with that' };
      }
      const lvl = companionLevel(enchanter, state.char.level);
      const skills = companionSkillMap(enchanter, lvl);
      syncCompanionProfessionCatalog(enchanter, skills, ds);
      if (!(enchanter.knownEnchants ?? []).includes(enchantId)) {
        return { ok: false, reason: `${enchanter.name} does not know that formula` };
      }
      const bought = buyVaultVendorReagents(enchant.reagents, enchanter.id);
      if (!bought.ok) return { ok: false, reason: bought.reason };
      // Pull reagents into enchanter bags.
      const ctx = vaultCtx();
      const mut = vaultMut();
      for (const rg of enchant.reagents) {
        const taken = partyTake(ctx, mut, rg.item, rg.count, enchanter.id);
        if (taken < rg.count) {
          if (taken > 0) {
            const idef = ds.item(rg.item);
            partyDeposit(ctx, mut, rg.item, taken, idef?.stackable ?? 1, enchanter.id);
          }
          return { ok: false, reason: 'Missing reagents' };
        }
      }
      let workBags = enchanter.bags ?? emptyInventory();
      for (const rg of enchant.reagents) {
        const idef = ds.item(rg.item);
        workBags = addItem(workBags, rg.item, rg.count, idef?.stackable ?? 1);
      }
      enchanter.bags = workBags;

      // Resolve wearer paperdoll.
      let wearEquipped = state.char.equipped;
      let wearEnchants = state.char.enchants;
      let targetComp: Companion | null = null;
      if (target.kind === 'companion') {
        targetComp = findCompanion(target.id) ?? null;
        if (!targetComp) return { ok: false, reason: 'Target companion not found' };
        wearEquipped = targetComp.equipped;
        wearEnchants = undefined;
      }

      const shell = companionCharacter(enchanter, lvl, ds);
      shell.skills = skills;
      shell.knownRecipes = enchanter.knownRecipes ?? [];
      shell.knownEnchants = enchanter.knownEnchants ?? [];
      shell.equipped = wearEquipped;
      shell.enchants = wearEnchants;

      const rng = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
      const res = doApplyEnchant(shell, workBags, ds, enchant, slot, rng, partyTools());
      if (!res.ok) {
        enchanter.bags = res.inventory;
        return { ok: false, reason: res.reason ?? 'Cannot enchant' };
      }
      enchanter.bags = res.inventory;
      if (target.kind === 'self') {
        state.char.equipped = res.char.equipped;
        state.char.enchants = res.char.enchants;
      } else if (targetComp) {
        targetComp.equipped = res.char.equipped;
      }
      if (res.skillUp != null && res.char.skills.enchanting) {
        const v = res.char.skills.enchanting.current;
        if (enchanter.professions == null || Object.keys(enchanter.professions).length === 0) {
          const frozen: CompanionProfessionMap = {};
          for (const k of Object.keys(skills) as SkillLine[]) frozen[k] = skills[k]!.current;
          enchanter.professions = frozen;
        }
        enchanter.professions = { ...(enchanter.professions ?? {}), enchanting: v };
        syncCompanionProfessionCatalog(enchanter, companionSkillMap(enchanter, lvl), ds);
      }
      const who = target.kind === 'self' ? 'you' : (targetComp?.name ?? 'them');
      const targetName = (() => {
        const raw = target.kind === 'self' ? state.char.equipped[slot] : targetComp!.equipped[slot];
        const entry = typeof raw === 'number' ? raw : (raw as { item?: number } | undefined)?.item;
        return ds.item(entry ?? 0)?.name ?? slot;
      })();
      log(
        `${enchanter.name} applies ${enchant.name} to ${who}'s ${targetName}.` +
        `${res.skillUp ? ` (enchanting → ${res.skillUp})` : ''}`,
      );
      return { ok: true, skillUp: res.skillUp };
    },

    companionUpgradesFor(id, playerInv) {
      const comp = findCompanion(id);
      if (!comp) return [];
      const lvl = companionLevel(comp, state.char.level);
      const char = companionCharacter(comp, lvl, ds);
      const sb = companionSpellbook(comp, lvl, ds);
      const equipOpts: EquipOpts = {
        canDualWield: knows(sb, DUAL_WIELD_SPELL_ID),
        specId: companionPlayerbotSpecId(comp.cls, comp.specIdx, comp.role, ds),
        role: comp.role,
      };
      const tag = (from: 'bot' | 'player', inv: Inventory) =>
        findUpgrades(char, inv, ds, equipOpts).map((u) => ({
          entry: u.entry,
          slot: u.targetSlot,
          randomPropertyId: u.randomPropertyId,
          currentEntry: u.currentEntry,
          delta: u.valueDelta,
          from,
        }));
      return [
        ...tag('bot', comp.bags ?? emptyInventory()),
        ...tag('player', playerInv ?? state.inventory),
      ];
    },

    learnRecipeFromItemOnCompanion(companionId, itemEntry) {
      const comp = findCompanion(companionId);
      if (!comp) return { ok: false, reason: 'No such companion' };
      if (comp.mission) return { ok: false, reason: `${comp.name} is away` };
      const it = ds.item(itemEntry);
      const teach = itemTeachIntent(it, ds);
      if (!it || teach?.kind !== 'recipe') return { ok: false, reason: 'That item teaches no recipe' };
      if (countItem(state.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that recipe" };
      const recipe = ds.recipe(teach.id);
      if (!recipe) return { ok: false, reason: 'That recipe is unknown' };
      const lvl = companionLevel(comp, state.char.level);
      const skills = companionSkillMap(comp, lvl);
      syncCompanionProfessionCatalog(comp, skills, ds);
      const skill = skills[recipe.skill];
      if (!skill) {
        return {
          ok: false,
          reason: `${comp.name} needs ${ds.profession(recipe.skill)?.name ?? recipe.skill} first`,
        };
      }
      // Party teach: companion must meet orange (craft gate). Classic player item-learn can
      // read early; bots only take a book they can use.
      if (skill.current < (recipe.orange | 0)) {
        const pname = ds.profession(recipe.skill)?.name ?? recipe.skill;
        return {
          ok: false,
          reason: `${comp.name} needs ${pname} ${recipe.orange} (has ${skill.current})`,
        };
      }
      if ((comp.knownRecipes ?? []).includes(recipe.id)) {
        return { ok: false, reason: `${comp.name} already knows that` };
      }
      state.inventory = removeItem(state.inventory, itemEntry, 1)[0];
      comp.knownRecipes = [...(comp.knownRecipes ?? []), recipe.id];
      log(`${comp.name} studies ${it.name} and learns to craft ${recipe.name}.`);
      return { ok: true, recipeId: recipe.id, name: recipe.name };
    },

    learnEnchantFromItemOnCompanion(companionId, itemEntry) {
      const comp = findCompanion(companionId);
      if (!comp) return { ok: false, reason: 'No such companion' };
      if (comp.mission) return { ok: false, reason: `${comp.name} is away` };
      const it = ds.item(itemEntry);
      const teach = itemTeachIntent(it, ds);
      if (!it || teach?.kind !== 'enchant') return { ok: false, reason: 'That item teaches no formula' };
      if (countItem(state.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that formula" };
      const ench = ds.enchant(teach.id);
      if (!ench) return { ok: false, reason: 'That formula is unknown' };
      const lvl = companionLevel(comp, state.char.level);
      const skills = companionSkillMap(comp, lvl);
      syncCompanionProfessionCatalog(comp, skills, ds);
      const skill = skills.enchanting;
      if (!skill) {
        return { ok: false, reason: `${comp.name} needs Enchanting first` };
      }
      if (skill.current < (ench.orange | 0)) {
        return {
          ok: false,
          reason: `${comp.name} needs Enchanting ${ench.orange} (has ${skill.current})`,
        };
      }
      if ((comp.knownEnchants ?? []).includes(ench.id)) {
        return { ok: false, reason: `${comp.name} already knows that` };
      }
      state.inventory = removeItem(state.inventory, itemEntry, 1)[0];
      comp.knownEnchants = [...(comp.knownEnchants ?? []), ench.id];
      log(`${comp.name} studies ${it.name} and learns ${ench.name}.`);
      return { ok: true, enchantId: ench.id, name: ench.name };
    },

    // Read a class book ON a companion. Nothing else in their kit is stored, so the taught rank is
    // remembered on the body itself. The gates are the player's, retargeted to THEIR level.
    learnSpellFromItemOnCompanion(companionId, itemEntry) {
      const comp = findCompanion(companionId);
      if (!comp) return { ok: false, reason: 'No such companion' };
      if (comp.mission) return { ok: false, reason: `${comp.name} is away` };
      const it = ds.item(itemEntry);
      const teach = itemTeachIntent(it, ds);
      if (!it || teach?.kind !== 'spell') return { ok: false, reason: 'That item teaches no ability' };
      if (countItem(state.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that book" };
      if (it.allowClass?.length && !it.allowClass.includes(comp.cls)) {
        return { ok: false, reason: `A ${className(comp.cls)} cannot study this` };
      }
      const lvl = companionLevel(comp, state.char.level);
      if ((it.requiredLevel | 0) > lvl) {
        return { ok: false, reason: `${comp.name} needs level ${it.requiredLevel}` };
      }
      const sp = ds.spell(teach.id);
      if (!sp) return { ok: false, reason: 'That book teaches an unknown ability' };
      if ((sp.reqLevel ?? 0) > lvl) return { ok: false, reason: `${comp.name} needs level ${sp.reqLevel}` };
      const skillMeta = ds.combatSkillMeta?.();
      // Empty AllowableClass needs a class-mask SLA. Measured refuse: 5657 Instant Toxin
      // (CREATE_ITEM, no SLA) + deprecated 2404/2405. Cite: Player.cpp:18369.
      if (!it.allowClass?.length && !spellHasClassRestrictingAbility(teach.id, skillMeta)) {
        return { ok: false, reason: `${sp.name} is not a ${className(comp.cls)} ability` };
      }
      if (!isSpellFitByClassAndRace(teach.id, comp.race, comp.cls, skillMeta, lvl)) {
        return { ok: false, reason: `${sp.name} is not a ${className(comp.cls)} ability` };
      }
      const sb = companionSpellbook(comp, lvl, ds);
      if (knows(sb, teach.id)) return { ok: false, reason: `${comp.name} already knows ${sp.name}` };
      // Same expansion as the player path: the ability plus whatever learning it also trains.
      // Cite: SpellEffects.cpp:3410 UpdateSpellTrainedSkills.
      const toLearn = [teach.id, ...spellLearnDependents(teach.id, skillMeta)].filter(
        (id, i, arr) => arr.indexOf(id) === i && !!ds.spell(id) && !knows(sb, id),
      );
      state.inventory = removeItem(state.inventory, itemEntry, 1)[0];
      comp.taughtSpells = [...(comp.taughtSpells ?? []), ...toLearn];
      refreshCompanionKitAfterLearn(comp, teach.id);
      log(`${comp.name} studies ${it.name} and learns ${sp.name}.`);
      return { ok: true, spell: teach.id, name: sp.name };
    },

    // Read a pet-training book ON a companion. The rank is character-wide on THEM, exactly as the
    // player's is, so a re-summoned demon keeps it. Cite: SpellEffects.cpp:3386-3404.
    learnPetSpellFromItemOnCompanion(companionId, itemEntry) {
      const comp = findCompanion(companionId);
      if (!comp) return { ok: false, reason: 'No such companion' };
      if (comp.mission) return { ok: false, reason: `${comp.name} is away` };
      const it = ds.item(itemEntry);
      const teach = itemTeachIntent(it, ds);
      if (!it || teach?.kind !== 'petSpell') {
        return { ok: false, reason: 'That is not a pet-training book' };
      }
      if (countItem(state.inventory, itemEntry) <= 0) return { ok: false, reason: "You don't have that book" };
      if (it.allowClass?.length && !it.allowClass.includes(comp.cls)) {
        return { ok: false, reason: `A ${className(comp.cls)} cannot study this` };
      }
      const lvl = companionLevel(comp, state.char.level);
      if ((it.requiredLevel | 0) > lvl) {
        return { ok: false, reason: `${comp.name} needs level ${it.requiredLevel}` };
      }
      // Store the live rank (EffectTriggerSpell), never the LEARN_PET_SPELL stub.
      const liveId = resolveSpellId(teach.id, ds);
      const spell = ds.spell(liveId);
      if (!spell) return { ok: false, reason: 'That book teaches an unknown ability' };
      if (petRepertoireHas(comp.petSpells ?? [], liveId, ds)) {
        return { ok: false, reason: `${comp.name}'s pet already knows ${spell.name}` };
      }
      state.inventory = removeItem(state.inventory, itemEntry, 1)[0];
      comp.petSpells = [...(comp.petSpells ?? []), liveId];
      log(`${comp.name} studies ${it.name}. Their pet can now cast ${spell.name} (Rank ${spell.rank}).`);
      return { ok: true, spell: liveId, name: spell.name };
    },

    // Where the party is standing, for the offer gate. Inside a run the instance's own quest list
    // counts as being at the giver, exactly as the player's accept path has it.
    companionQuestOffers(companionId) {
      const runDef = state.instance ? ds.instance(state.instance.dungeonId) : undefined;
      const place: CompanionQuestPlace = {
        zoneId: state.char.zoneId,
        ...(runDef?.quests?.length ? { instanceQuests: runDef.quests } : {}),
      };
      const bodies = companionId
        ? [findCompanion(companionId)].filter((c): c is Companion => !!c)
        : (state.squad ?? []);
      const out: CompanionQuestOffer[] = [];
      for (const comp of bodies) {
        out.push(...companionQuestOffers(comp, state.char.level, place, ds));
      }
      return out;
    },

    acceptCompanionQuest(companionId, entry) {
      const comp = findCompanion(companionId);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const r = acceptCompanionQuestAction(comp, entry, state.char.level, ds);
      if (!r.ok) return { ok: false, reason: r.reason ?? 'Cannot take that quest' };
      log(`${comp.name} accepts ${ds.quest(entry)?.title ?? 'a quest'}.`);
      return { ok: true };
    },

    turnInCompanionQuest(companionId, entry, rewardChoice = 0) {
      const comp = findCompanion(companionId);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const r = turnInCompanionQuestAction(
        comp, entry, state.char.level, ds, state.char.zoneId, rewardChoice, partyOverflow(ctx), log,
      );
      if (!r.ok) return { ok: false, reason: r.reason ?? 'Cannot hand that in' };
      const money = r.money ?? 0;
      if (money > 0) state.char = { ...state.char, gold: state.char.gold + money };
      log(`${comp.name} completes ${ds.quest(entry)?.title ?? 'a quest'}. +${r.xp ?? 0} XP.`);
      for (const a of r.rep ?? []) {
        const name = ds.faction(a.faction)?.name ?? `faction ${a.faction}`;
        log(`${comp.name} ${a.delta > 0 ? '+' : ''}${a.delta} reputation with ${name}`);
      }
      return {
        ok: true,
        xp: r.xp ?? 0,
        money,
        items: r.items ?? [],
        rep: r.rep ?? [],
        leveledTo: r.leveledTo ?? [],
      };
    },

    abandonCompanionQuest(companionId, entry) {
      const comp = findCompanion(companionId);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const before = companionQuestLog(comp);
      const next = abandonQuest(before, entry);
      if (next === before) return { ok: false, reason: 'Not in their log' };
      comp.questLog = next;
      return { ok: true };
    },

    giveItemToBot(id, itemEntry, qty = 1) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const idef = ds.item(itemEntry);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      const n = Math.min(Math.max(1, qty), countItem(state.inventory, itemEntry));
      if (n <= 0) return { ok: false, reason: "You don't have that" };

      // Recipe/formula: teach via the learn-on path (same as bag picker), don't put the book in bags.
      const teach = itemTeachIntent(idef, ds);
      if (teach?.kind === 'recipe') {
        const r = self.learnRecipeFromItemOnCompanion(id, itemEntry);
        return r.ok ? { ok: true, moved: 1 } : { ok: false, reason: r.reason };
      }
      if (teach?.kind === 'enchant') {
        const r = self.learnEnchantFromItemOnCompanion(id, itemEntry);
        return r.ok ? { ok: true, moved: 1 } : { ok: false, reason: r.reason };
      }
      // A tome / class book / grimoire is read, not carried: hand it over and they study it.
      if (teach?.kind === 'spell') {
        const r = self.learnSpellFromItemOnCompanion(id, itemEntry);
        return r.ok ? { ok: true, moved: 1 } : { ok: false, reason: r.reason };
      }
      if (teach?.kind === 'petSpell') {
        const r = self.learnPetSpellFromItemOnCompanion(id, itemEntry);
        return r.ok ? { ok: true, moved: 1 } : { ok: false, reason: r.reason };
      }

      const bags = comp.bags ?? emptyInventory();
      const cap = bagCapacity(companionCharacter(comp, companionLevel(comp, state.char.level), ds), ds);
      if (!canFit(bags, itemEntry, n, idef.stackable ?? 1, cap)) {
        return { ok: false, reason: `${comp.name}'s bags are full` };
      }
      const moved = transferItem(state.inventory, bags, itemEntry, n, idef.stackable ?? 1, cap);
      state.inventory = moved.from;
      comp.bags = moved.to;
      log(`You give ${idef.name}${n > 1 ? ` ×${n}` : ''} to ${comp.name}.`);
      return { ok: true, moved: moved.moved };
    },

    /** One stack of yours (by bag index) into their bags. Omitted qty = that whole stack. */
    giveItemToBotStack(id, slotIndex, qty) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const stk = state.inventory.stacks[slotIndex];
      if (!stk) return { ok: false, reason: 'Invalid slot' };
      const idef = ds.item(stk.item);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      // A book / recipe / grimoire is read, not carried - the entry path owns that routing.
      if (itemTeachIntent(idef, ds)) return self.giveItemToBot(id, stk.item, 1);
      const n = Math.min(Math.max(1, qty ?? stk.count), stk.count);
      const bags = comp.bags ?? emptyInventory();
      const cap = bagCapacity(companionCharacter(comp, companionLevel(comp, state.char.level), ds), ds);
      if (!canFit(bags, stk.item, n, idef.stackable ?? 1, cap)) {
        return { ok: false, reason: `${comp.name}'s bags are full` };
      }
      const [inv, taken] = takeStack(state.inventory, slotIndex, n);
      if (!taken) return { ok: false, reason: "You don't have that" };
      state.inventory = inv;
      comp.bags = addInstance(bags, taken, idef.stackable ?? 1);
      log(`You give ${idef.name}${taken.count > 1 ? ` ×${taken.count}` : ''} to ${comp.name}.`);
      return { ok: true, moved: taken.count };
    },

    // Use a consumable out of THEIR bags, on them: a weapon imbue coats a hand, a reputation effect
    // pays their standing, a buff is drunk now. A restore is refused — it would just be destroyed.
    useCompanionItem(id, itemEntry, opts) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const idef = ds.item(itemEntry);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      const bags = comp.bags ?? emptyInventory();
      if (countItem(bags, itemEntry) <= 0) return { ok: false, reason: "They don't have that" };

      if (isWeaponImbueItem(idef, ds)) {
        const app = ds.enchantApplicator(idef.useSpell!);
        const scan = scanTempWeaponImbueHands(comp.equipped, ds, app);
        if (!scan.eligible.length) {
          const why = scan.rejected[0]?.reason;
          return {
            ok: false,
            reason: why
              ? `Nothing ${comp.name} has can take that - ${why.toLowerCase()}`
              : `Nothing ${comp.name} has can take that`,
          };
        }
        const hand = opts?.slot;
        if (hand == null && scan.eligible.length > 1) {
          return {
            ok: false,
            reason: 'Choose a hand',
            needsTarget: {
              itemEntry,
              enchantId: app!.enchantId,
              target: { kind: 'companion', id: comp.id },
              slots: scan.eligible,
              rejected: scan.rejected,
            },
          };
        }
        const pick = hand ?? scan.eligible[0]!;
        if (pick !== 'mainhand' && pick !== 'offhand') {
          return { ok: false, reason: 'That only goes on a weapon hand' };
        }
        if (!applyCompanionImbue(comp.id, itemEntry, pick)) {
          return { ok: false, reason: 'That did not take' };
        }
        return { ok: true, used: 1 };
      }

      const lvl = companionLevel(comp, state.char.level);
      const char = companionCharacter(comp, lvl, ds);
      const kit = combatItems(char, bags, ds).find((x) => x.entry === itemEntry);
      const spellId = idef.useSpell;
      // Reputation items must not fall through to the pre-pull aura path (that ate the
      // bijou as a buff and never granted standing). Cite: SpellEffects.cpp:4908-4926.
      if (spellId != null && spellId > 0) {
        const useRaw = ds.spell(spellId);
        const useResolved = useRaw
          ? resolveCombatSpell(useRaw, { casterLevel: lvl })
          : undefined;
        const hasRep = (useResolved?.effects ?? []).some((e) => e.kind === 'reputation');
        if (hasRep && useResolved) {
          const spent = consume(char, bags, ds, itemEntry);
          if (!spent.ok) {
            const why = spent.reason ?? 'Cannot use that';
            return {
              ok: false,
              reason: why === 'Your bags are full' ? `${comp.name}'s bags are full` : why,
            };
          }
          const granted = grantSpellReputationEffects(
            spent.char,
            useResolved.effects,
            ds,
            Date.now(),
            (msg) => log(`${comp.name} ${msg}`),
          );
          writeCompanionStandings(comp, granted);
          comp.bags = spent.inventory;
          log(`${comp.name} uses ${idef.name}.`);
          return { ok: true, used: 1 };
        }
      }
      if (kit?.effect.kind === 'restore_health' || kit?.effect.kind === 'restore_power') {
        return {
          ok: false,
          reason: `${comp.name} will drink that in the fight - put it in their rotation`,
        };
      }
      if (spellId == null || spellId <= 0) return { ok: false, reason: 'Nothing happens' };
      const now = Date.now();
      comp.prePullAuras ??= [];
      if (comp.prePullAuras.some((a) => a.spellId === spellId && (a.expiresAt ?? Infinity) > now)) {
        return { ok: false, reason: `${comp.name} already has that` };
      }
      const durMs = idef.useBuff?.durationMs
        ?? ds.spell(spellId)?.effects.find((e) => e.kind === 'buff')?.durationMs
        ?? 0;
      comp.bags = removeItem(bags, itemEntry, 1)[0];
      comp.prePullAuras.push({ spellId, ...(durMs > 0 ? { expiresAt: now + durMs } : {}) });
      log(`${comp.name} uses ${idef.name}.`);
      return { ok: true, used: 1 };
    },

    takeItemFromBot(id, itemEntry, qty = 1) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const idef = ds.item(itemEntry);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      // Party-internal transfer is free (shared vault) EXCEPT soulbound: a BoP row belongs to the
      // body that picked it up, so only the unbound stacks of this entry can come over.
      const bags = comp.bags ?? emptyInventory();
      const free = bags.stacks.reduce(
        (t, s) => (s.item === itemEntry && !stackBoundToHolder(s, ds) ? t + s.count : t), 0,
      );
      if (countItem(bags, itemEntry) > 0 && free <= 0) {
        return { ok: false, reason: 'Soulbound - it stays with them' };
      }
      const n = Math.min(Math.max(1, qty), free);
      if (n <= 0) return { ok: false, reason: "They don't have that" };
      const cap = bagCapacity(state.char, ds);
      if (!canFit(state.inventory, itemEntry, n, idef.stackable ?? 1, cap)) {
        return { ok: false, reason: 'Your bags are full' };
      }
      const moved = transferItem(bags, state.inventory, itemEntry, n, idef.stackable ?? 1, cap);
      comp.bags = moved.from;
      state.inventory = moved.to;
      log(`You take ${idef.name}${n > 1 ? ` ×${n}` : ''} from ${comp.name}.`);
      return { ok: true, moved: moved.moved };
    },

    /** One stack of theirs (by bag index) into your bags. Omitted qty = that whole stack. */
    takeItemFromBotStack(id, slotIndex, qty) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const bags = comp.bags ?? emptyInventory();
      const stk = bags.stacks[slotIndex];
      if (!stk) return { ok: false, reason: 'Invalid slot' };
      const idef = ds.item(stk.item);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      // The bag grid's own Take, the same soulbind gate the party-storage tile uses.
      if (stackBoundToHolder(stk, ds)) return { ok: false, reason: 'Soulbound - it stays with them' };
      const n = Math.min(Math.max(1, qty ?? stk.count), stk.count);
      const cap = bagCapacity(state.char, ds);
      if (!canFit(state.inventory, stk.item, n, idef.stackable ?? 1, cap)) {
        return { ok: false, reason: 'Your bags are full' };
      }
      const [next, taken] = takeStack(bags, slotIndex, n);
      if (!taken) return { ok: false, reason: "They don't have that" };
      comp.bags = next;
      state.inventory = addInstance(state.inventory, taken, idef.stackable ?? 1);
      log(`You take ${idef.name}${taken.count > 1 ? ` ×${taken.count}` : ''} from ${comp.name}.`);
      return { ok: true, moved: taken.count };
    },

    // One stack straight from one companion's bags to another's, without a stop in yours: the
    // vendor's split Companions grids drag onto each other. Same soulbind gate as takeItemFromBotStack.
    moveItemBetweenBots(fromId, slotIndex, toId, qty) {
      if (fromId === toId) return { ok: false, reason: 'Same companion' };
      const from = findCompanion(fromId);
      const to = findCompanion(toId);
      if (!from || !to) return { ok: false, reason: 'No such companion' };
      const fromBags = from.bags ?? emptyInventory();
      const stk = fromBags.stacks[slotIndex];
      if (!stk) return { ok: false, reason: 'Invalid slot' };
      const idef = ds.item(stk.item);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      if (stackBoundToHolder(stk, ds)) return { ok: false, reason: 'Soulbound - it stays with them' };
      const n = Math.min(Math.max(1, qty ?? stk.count), stk.count);
      const toBags = to.bags ?? emptyInventory();
      const cap = bagCapacity(companionCharacter(to, companionLevel(to, state.char.level), ds), ds);
      if (!canFit(toBags, stk.item, n, idef.stackable ?? 1, cap)) {
        return { ok: false, reason: `${to.name}'s bags are full` };
      }
      const [next, taken] = takeStack(fromBags, slotIndex, n);
      if (!taken) return { ok: false, reason: "They don't have that" };
      from.bags = next;
      to.bags = addInstance(toBags, taken, idef.stackable ?? 1);
      log(`${from.name} passes ${idef.name}${taken.count > 1 ? ` ×${taken.count}` : ''} to ${to.name}.`);
      return { ok: true, moved: taken.count };
    },

    /** Destroy one stack out of their bags. The player's trash, aimed at a companion's grid. */
    discardCompanionBagStack(id, slotIndex, qty) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const bags = comp.bags ?? emptyInventory();
      const stk = bags.stacks[slotIndex];
      if (!stk) return { ok: false, reason: 'Nothing there' };
      if (qty != null && !(Number.isInteger(qty) && qty > 0)) return { ok: false, reason: 'Invalid quantity' };
      const take = qty != null ? Math.min(qty, stk.count) : stk.count;
      const [next, n] = removeStack(bags, slotIndex, take);
      if (n <= 0) return { ok: false, reason: 'Nothing there' };
      comp.bags = next;
      const idef = ds.item(stk.item);
      log(`${comp.name} destroys ${idef?.name ?? stk.item}${n > 1 ? ` ×${n}` : ''}.`);
      return { ok: true, discarded: n };
    },

    /** Sell one stack out of their bags at the open vendor — the same sellStack the player's grid uses. */
    sellCompanionItemStack(id, slotIndex, qty) {
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const bags = comp.bags ?? emptyInventory();
      const stk = bags.stacks[slotIndex];
      if (!stk) return { ok: false, reason: 'Invalid slot' };
      const def = ds.item(stk.item);
      if (!def) return { ok: false, reason: 'Unknown item' };
      if (qty != null && !(Number.isInteger(qty) && qty > 0)) return { ok: false, reason: 'Invalid quantity' };
      const res = sellStack(state.char, bags, def, slotIndex, qty ?? stk.count);
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot sell' };
      state.char = res.char;
      comp.bags = res.inventory;
      const sold = res.qty ?? res.buybackEntry?.qty ?? stk.count;
      log(`${comp.name} sells ${sold > 1 ? `${sold}x ` : ''}${def.name} for ${moneyMarked(res.amount)}.`);
      return { ok: true, earned: res.amount, qty: sold };
    },

    // Buy a sold stack back into the bags it came out of. Your gold pays either way, but the item
    // goes home to its owner - a companion's gear never lands in your bags off the buyback tab.
    buyBackCompanionStack(id, itemEntry, qty, refundCopper) {
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const def = ds.item(itemEntry);
      if (!def) return { ok: false, reason: 'Unknown item' };
      if (!(Number.isInteger(qty) && qty > 0)) return { ok: false, reason: 'Invalid quantity' };
      if (!(Number.isInteger(refundCopper) && refundCopper >= 0)) return { ok: false, reason: 'Invalid price' };
      const bags = comp.bags ?? emptyInventory();
      const cap = bagCapacity(companionCharacter(comp, companionLevel(comp, state.char.level), ds), ds);
      const res = buyBack(
        state.char,
        bags,
        [{ entry: itemEntry, qty, refundCopper, soldAt: 0 }],
        0,
        def.stackable ?? 1,
        cap,
      );
      if (!res.ok) {
        const full = res.reason === 'Not enough bag space';
        return { ok: false, reason: full ? `${comp.name}'s bags are full` : res.reason ?? 'Cannot buy back' };
      }
      state.char = res.char;
      comp.bags = res.inventory;
      log(`You buy back ${qty > 1 ? `${qty}x ` : ''}${def.name} for ${moneyMarked(res.amount)} - back to ${comp.name}.`);
      return { ok: true, qty };
    },

    takeFromPartyStorage(itemEntry, qty) {
      const idef = ds.item(itemEntry);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      const r = partyTakeToBags(vaultCtx(), vaultMut(), itemEntry, bagCapacity(state.char, ds), qty);
      if (r.moved <= 0) {
        return { ok: false, reason: r.full ? 'Your bags are full' : r.bound > 0 ? 'Soulbound - it stays with them' : 'Nobody is carrying that' };
      }
      log(`You take ${idef.name}${r.moved > 1 ? ` ×${r.moved}` : ''} from party storage.`);
      return { ok: true, moved: r.moved, bound: r.bound, full: r.full };
    },

    companionBankDeposit(id, itemEntry, qty = 1) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const idef = ds.item(itemEntry);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      const r = deposit(
        comp.bags ?? emptyInventory(), comp.bank ?? emptyInventory(),
        itemEntry, qty, idef.stackable ?? 1, bankCapacity(comp.bankBags ?? [], ds),
      );
      if (!r.ok) return { ok: false, reason: r.reason ?? `${comp.name}'s bank is full` };
      comp.bags = r.inventory;
      comp.bank = r.bank;
      return { ok: true, moved: r.moved };
    },

    companionBankWithdraw(id, itemEntry, qty = 1) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const idef = ds.item(itemEntry);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      const cap = bagCapacity(companionCharacter(comp, companionLevel(comp, state.char.level), ds), ds);
      const r = withdraw(
        comp.bags ?? emptyInventory(), comp.bank ?? emptyInventory(),
        itemEntry, qty, idef.stackable ?? 1, cap,
      );
      if (!r.ok) return { ok: false, reason: r.reason ?? `${comp.name}'s bags are full` };
      comp.bags = r.inventory;
      comp.bank = r.bank;
      return { ok: true, moved: r.moved };
    },

    /** One stack of their bags (by index) into their bank. Omitted qty = that whole stack. */
    companionBankDepositStack(id, slotIndex, qty) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const bags = comp.bags ?? emptyInventory();
      const stk = bags.stacks[slotIndex];
      if (!stk) return { ok: false, reason: 'Invalid slot' };
      const idef = ds.item(stk.item);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      const r = depositStack(
        bags, comp.bank ?? emptyInventory(), slotIndex,
        Math.min(Math.max(1, qty ?? stk.count), stk.count),
        idef.stackable ?? 1, bankCapacity(comp.bankBags ?? [], ds),
      );
      if (!r.ok) return { ok: false, reason: r.reason ?? `${comp.name}'s bank is full` };
      comp.bags = r.inventory;
      comp.bank = r.bank;
      return { ok: true, moved: r.moved };
    },

    /** One stack of their bank (by index) into their bags. Omitted qty = that whole stack. */
    companionBankWithdrawStack(id, slotIndex, qty) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const bank = comp.bank ?? emptyInventory();
      const stk = bank.stacks[slotIndex];
      if (!stk) return { ok: false, reason: 'Invalid slot' };
      const idef = ds.item(stk.item);
      if (!idef) return { ok: false, reason: 'Unknown item' };
      const cap = bagCapacity(companionCharacter(comp, companionLevel(comp, state.char.level), ds), ds);
      const r = withdrawStack(
        comp.bags ?? emptyInventory(), bank, slotIndex,
        Math.min(Math.max(1, qty ?? stk.count), stk.count),
        idef.stackable ?? 1, cap,
      );
      if (!r.ok) return { ok: false, reason: r.reason ?? `${comp.name}'s bags are full` };
      comp.bags = r.inventory;
      comp.bank = r.bank;
      return { ok: true, moved: r.moved };
    },

    buyCompanionBankSlot(id) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const r = buyBankBagSlot(comp.bankBags ?? [], state.char.gold);
      if (!r.ok) return { ok: false, reason: r.reason ?? 'Cannot buy that slot' };
      state.char = { ...state.char, gold: state.char.gold - r.cost };
      comp.bankBags = r.bankBags;
      log(`You buy ${comp.name} a bank bag slot for ${moneyMarked(r.cost)}.`);
      return { ok: true, cost: r.cost };
    },

    equipCompanionBankBag(id, itemEntry, slotIndex) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const idef = ds.item(itemEntry);
      if (idef?.slot !== 'bag') return { ok: false, reason: 'That is not a bag' };
      // The bag may come from your bags - giving it makes it the bot's.
      let bags = comp.bags ?? emptyInventory();
      if (countItem(bags, itemEntry) <= 0 && countItem(state.inventory, itemEntry) > 0) {
        const cap = bagCapacity(companionCharacter(comp, companionLevel(comp, state.char.level), ds), ds);
        if (!canFit(bags, itemEntry, 1, 1, cap)) return { ok: false, reason: `${comp.name}'s bags are full` };
        const moved = transferItem(state.inventory, bags, itemEntry, 1, 1, cap);
        state.inventory = moved.from;
        bags = moved.to;
      }
      const r = equipBankBag(bags, comp.bank ?? emptyInventory(), comp.bankBags ?? [], ds, itemEntry, slotIndex);
      if (!r.ok) {
        comp.bags = bags; // the give (if any) stands - it's theirs now
        return { ok: false, reason: r.reason ?? 'Cannot slot that bag' };
      }
      comp.bags = r.inventory;
      comp.bankBags = r.bankBags;
      return { ok: true };
    },

    unequipCompanionBankBag(id, slotIndex) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const cap = bagCapacity(companionCharacter(comp, companionLevel(comp, state.char.level), ds), ds);
      const r = unequipBankBag(comp.bags ?? emptyInventory(), comp.bank ?? emptyInventory(), comp.bankBags ?? [], ds, slotIndex, cap);
      if (!r.ok) return { ok: false, reason: r.reason ?? 'Cannot remove that bag' };
      comp.bags = r.inventory;
      comp.bankBags = r.bankBags;
      return { ok: true };
    },

    runFullDungeon(opts) {
      return executeRunFullDungeon(ctx, combat, helpers, opts);
    },

    // S1 (GROUPING-PLAN): per-companion rotations, mirroring the player accessors.
    companionRotation(id, profile) {
      const comp = findCompanion(id);
      if (!comp) return null;
      return ensureCompanionRotation(comp, profile ?? companionActiveProfile(comp));
    },
    setCompanionRotation(id, rot, profile) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const p = profile ?? companionActiveProfile(comp);
      setCompanionRotationSlot(comp, p, { ...rot, version: 1, custom: true, profile: p });
      return { ok: true };
    },
    resetCompanionRotation(id, profile) {
      const comp = findCompanion(id);
      if (!comp) return null;
      const p = profile ?? companionActiveProfile(comp);
      const rot = buildCompanionRotation(comp, companionLevel(comp, state.char.level), ds, p);
      setCompanionRotationSlot(comp, p, rot);
      return rot;
    },
    companionRotationProfile(id) {
      const comp = findCompanion(id);
      return comp ? companionActiveProfile(comp) : 'primary';
    },
    setCompanionRotationProfile(id, profile) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      if (profile === 'dps' && !companionHasDpsProfile(comp)) {
        return { ok: false, reason: 'Only a tank or healer companion has a second rotation' };
      }
      comp.rotationProfile = profile;
      return { ok: true };
    },
    companionHasDpsRotationProfile(id) {
      const comp = findCompanion(id);
      return comp ? companionHasDpsProfile(comp) : false;
    },

    // ---- named profiles: a companion owns as many as the player does ---------------------
    companionRotationProfiles(id) {
      const comp = findCompanion(id);
      if (!comp) return [];
      ensureCompanionProfileList(comp);
      syncActiveFromMirror(comp);
      return (comp.rotationProfiles ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        active: p.id === activeProfile(comp)?.id,
      }));
    },
    companionHasPvpRotationBand(id) {
      const comp = findCompanion(id);
      return comp ? companionHasPvpBand(comp, companionLevel(comp, state.char.level), ds) : false;
    },
    addCompanionRotationProfile(id, opts) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      ensureCompanionProfileList(comp);
      const lvl = companionLevel(comp, state.char.level);
      if (opts?.mode === 'pvp' && !companionHasPvpBand(comp, lvl, ds)) {
        return { ok: false, reason: `No PvP list is authored for ${comp.name} at level ${lvl}` };
      }
      const made = addProfile(comp, {
        name: opts?.name,
        copyFromId: opts?.copyFromId,
        // `mode: 'pvp'` is what reaches the authored pvp band; without it `selectBand` filters
        // that pool out entirely (rotationSuggestions.ts).
        ...(opts?.mode === 'pvp' || opts?.fromBand !== undefined
          ? {
            rotation: buildCompanionRotation(
              comp, lvl, ds, undefined, opts?.mode ? { mode: opts.mode } : undefined,
            ),
          }
          : {}),
      });
      if (!made) return { ok: false, reason: `At most ${MAX_ROTATION_PROFILES} rotations` };
      return { ok: true, id: made.id, name: made.name };
    },
    renameCompanionRotationProfile(id, profileId, name) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      ensureCompanionProfileList(comp);
      return renameProfile(comp, profileId, name)
        ? { ok: true }
        : { ok: false, reason: 'No such rotation' };
    },
    deleteCompanionRotationProfile(id, profileId) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      ensureCompanionProfileList(comp);
      return removeProfile(comp, profileId)
        ? { ok: true }
        : { ok: false, reason: 'Cannot delete their only rotation' };
    },
    selectCompanionRotationProfile(id, profileId) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      ensureCompanionProfileList(comp);
      return setActiveProfile(comp, profileId)
        ? { ok: true }
        : { ok: false, reason: 'No such rotation' };
    },
    companionActionBars(id) {
      const comp = findCompanion(id);
      if (!comp) return null;
      // Kit-drift refresh first: this read is the bar UI, and ensureCompanionRotation is what
      // tops the bars up after a level-up (otherwise they only grow at the next pull).
      ensureCompanionRotation(comp);
      return ensureCompanionActionBars(comp, state.char.level, ds);
    },
    setCompanionActionSlot(id, bar, slot, spellId) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const bars = ensureCompanionActionBars(comp, state.char.level, ds);
      if (spellId == null) {
        comp.actionBars = clearBarSlot(bars, bar, slot);
        return { ok: true };
      }
      const eligible = companionEligibleSpellIds(comp, companionLevel(comp, state.char.level), ds);
      if (!eligible.includes(spellId)) return { ok: false, reason: 'They do not know that spell' };
      comp.actionBars = setBarSlot(bars, bar, slot, spellId);
      return { ok: true };
    },
    setCompanionItemActionSlot(id, bar, slot, entry) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const bars = ensureCompanionActionBars(comp, state.char.level, ds);
      if (entry == null) {
        comp.actionBars = clearBarSlot(bars, bar, slot);
        return { ok: true };
      }
      const inv = comp.bags ?? emptyInventory();
      const already = bars.some((b) => b.items?.includes(entry));
      const onUseGear = equippedOnUseEntries(comp, companionLevel(comp, state.char.level), ds);
      const equippedOk = onUseGear.includes(entry);
      if (countItem(inv, entry) <= 0 && !already && !equippedOk) {
        return { ok: false, reason: 'Not in their bags or equipped on-use' };
      }
      const it = ds.item(entry);
      if (!it || !(it.useInCombat || it.useBuff || it.useSpell != null)) {
        return { ok: false, reason: 'Not a combat consumable' };
      }
      comp.actionBars = setBarItemSlot(bars, bar, slot, entry);
      return { ok: true };
    },
    addCompanionActionBar(id) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const bars = ensureCompanionActionBars(comp, state.char.level, ds);
      const next = addActionBarPure(bars);
      if (next.length === bars.length) return { ok: false, reason: 'No more action bars available' };
      comp.actionBars = next;
      return { ok: true };
    },
    removeCompanionActionBar(id) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      const bars = ensureCompanionActionBars(comp, state.char.level, ds);
      const next = removeActionBarPure(bars);
      if (next.length === bars.length) return { ok: false, reason: 'They must keep at least one bar' };
      comp.actionBars = next;
      return { ok: true };
    },
    resetCompanionActionBars(id) {
      const comp = findCompanion(id);
      if (!comp) return { ok: false, reason: 'No such companion' };
      // Fresh rotation kit + on-use gear (1–3 bars), same as hire / first open.
      comp.actionBars = seedCompanionActionBars(comp, state.char.level, ds);
      return { ok: true };
    },
    squadBattleParty(targetEntry) {
      return buildSquadBattleParty(targetEntry);
    },
    applyPrePullBuffs() {
      return doApplyPrePullBuffs();
    },
    refreshPartyWeaponCoats() {
      return doRefreshPartyWeaponCoats();
    },
    // The swap path: cast what the board now says and nothing that is already up. Returns the
    // number of chips cast, so a caller can tell "changed something" from "nothing to do".
    refreshPaladinBuffs() {
      const cast = doApplyPaladinBuffs(Date.now(), { topUpOnly: true });
      // A live provider closes over the rotation it was built with, so a grid change mid-pull only
      // reached the NEXT fight. Same restamp `setCompanionRole` does at :2673.
      const live = combat.getLiveFightSession();
      if (live && !live.ended && typeof live.setAllyGroupRole === 'function') {
        const squad = state.squad ?? [];
        for (let i = 0; i < squad.length; i++) {
          const c = squad[i]!;
          if (c.cls !== CLASS.PALADIN) continue;
          live.setAllyGroupRole(
            `ally_${i}`,
            c.role === 'dps' ? 'damage' : c.role ?? 'damage',
            companionActionProvider(ensureCompanionRotation(c), undefined, {
              companion: c,
              isMultiSpell: (sid) => isMultiTargetCombatSpell(ds.spell(sid)),
              isOocKeepUp: (sid) => isCompanionKeepUpSpell(ds.spell(sid)),
            }),
          );
        }
      }
      return cast;
    },
  };
  self = api;
  return api;
}
