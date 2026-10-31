// Game facade types + pure type-adjacent helpers (Wave 2 S6). Extracted from engine/game.ts so game/*
// modules can import types without cycling back through the createGame facade.

import type { AllyActionProvider, CombatantSpec, CombatResult, CombatSession } from '../combat.ts';
import type { FloorDeathSummon } from './combatSession.ts';
import type {
  Companion, CompanionAoeMode, SquadRole, SquadStrategy,
} from '../../domain/bots/squad.ts';
import type { BotSearchFilters, WorldBot } from '../../domain/bots/botPool.ts';
import type {
  CompanionEnergyState,
  CompanionMission,
  MissionProgress,
  MissionSkill,
  MissionYieldRow,
} from '../../domain/bots/companionMissions.ts';
import type { GearProfile } from '../../domain/bots/botGear.ts';
import type { CompanionQuestOffer } from '../../domain/bots/companionQuests.ts';
import type { RaidTierId } from '../../domain/raid/raidRosterTemplate.ts';
import type { Character, EquippedMap } from '../../domain/character/character.ts';
import type { Rotation, RotationProfileId } from '../../domain/rotation/rotation.ts';
import type { RotationProfile } from '../../domain/rotation/rotationProfiles.ts';
import type { TalentBuild } from '../../domain/character/talentBuilds.ts';
import type { AutopilotConfig } from '../../autopilot/config.ts';
import type { EquipmentHelperConfig } from '../../domain/items/equipmentHelper.ts';
import type { AutoDisenchantConfig } from '../../domain/professions/autoDisenchant.ts';
import type { CharacterJunkFilterConfig, JunkFilterConfig } from '../../domain/items/junkFilter.ts';
import type { GatherFilterConfig } from '../../domain/professions/gatherFilter.ts';
import type { EquipSlot, SkillLine } from '../../data/schema.ts';
import type { Inventory } from '../../domain/items/inventory.ts';
import type { ActionBar } from '../../domain/character/actionbar.ts';
import type { MacroDef, MacroScope } from '../../domain/macro/types.ts';
import type { SpellBook } from '../../domain/character/spellbook.ts';
import type { QuestLog } from '../../domain/quests/questlog.ts';
import type { PickpocketRestockMap } from '../../domain/professions/pickpocket.ts';
import type { DeathFlowMode, DeathFlowState, GraveyardEntry } from '../../domain/run/death.ts';
import type { GossipMenu } from '../../domain/quests/gossip.ts';
import type { BankBags } from '../../domain/items/bank.ts';
import type { AuctionHouseState, Auction } from '../../domain/economy/auction.ts';
import type { Mailbox, MailMessage, MailAttachment } from '../../domain/economy/mail.ts';
import type { PendingLoot, PendingLootRow } from '../../domain/items/pendingLoot.ts';
import type { HonorWeekLedger } from '../../domain/run/honorWeek.ts';
import type { LootSourceInfo } from './loot.ts';
import type { NodeState } from '../../domain/professions/professions.ts';
import type { EntranceYardRow } from '../../domain/nav/travel.ts';
import type { JourneyLeg, JourneyProgress, HearthBind } from '../../domain/nav/travelTypes.ts';
import type { GoRuntimeState } from '../../domain/world/gameObjects.ts';
import type { HazardState } from '../../domain/world/hazards.ts';
import type { WeatherState } from '../../domain/world/weather.ts';
import type { InstanceRun, InstanceSaveMap, LockoutMap } from '../../world/instances.ts';
import type { BattlegroundId, BattlegroundRun } from '../../domain/run/battlegroundRun.ts';
import type { PullFusion, RouteDensity } from '../../world/dungeonRoute.ts';
import type { DungeonRunSummary } from '../../domain/run/dungeonRun.ts';
import type { PlannedBuff, PlannedHandout } from '../../domain/bots/prePullBuffs.ts';
import type { LootDrop } from '../../domain/items/loot.ts';

// Opt-in for the loot acts (gather / skin / interactObject / openContainerItem): with `hold`, drops
// go into `state.pendingLoot` for the player to click. The UI passes it; autopilot and bots do not.
export interface LootHoldOpts {
  hold?: boolean;
  /** Wall-clock for depletion/restock gates (default Date.now()). Gather nodes share nodeState with gather(). */
  nowMs?: number;
  // Roster companion whose lockpicking skill (L×5) opens a locked container item. Omitted,
  // openContainerItem still falls back to the best qualified roster rogue.
  lockpickerId?: string;
  // openContainerItem, direct-to-bags only: refuse with 'Not enough bag space' instead of spilling
  // part of the haul. The auto-opener sets it; a hand click keeps today's partial-take behaviour.
  requireRoom?: boolean;
}

export type { PendingLoot, PendingLootRow, LootSourceInfo };

export interface GameState {
  char: Character;
  inventory: Inventory;
  // Keyring — an unbounded BagFamily KEYS container (bagFamily 9); keys never take backpack slots.
  // Optional on pre-v40 saves. Cite: Player.h KEYRING_SLOT_*; domain/items/keyring.ts.
  keyring?: Inventory;
  bank: Inventory;    // personal bank storage (Phase 4)
  // Purchased bank bag slots (WoW's 7), one entry per bought slot holding the slotted bag's entry
  // or null. Length = slots owned; each bag adds its `bagSlots` to bankCapacity.
  bankBags: BankBags;
  spellbook: SpellBook;
  actionBars: ActionBar[]; // player's configured action bars (spell-per-slot + keybinds)
  // Raid bar (empty by default). Fires for every living raid member on the Settings global keybind.
  // Optional on older saves — migrate back-fills an empty bar.
  globalActionBar?: ActionBar;
  // Classic primary action-bar pages by form (BonusActionBar). Pre-stance-bar saves omit it and
  // page "0" seeds from actionBars[0]. Only the main bar swaps with form.
  primaryBarPages?: import('../../domain/character/stanceBar.ts').PrimaryBarPages;
  // This character's macros (`c1..c18`). Account-wide macros live outside the save, in
  // CreateGameOptions.accountMacros. Cite: Blizzard_MacroUI.lua:31/:41.
  macros?: import('../../domain/macro/types.ts').MacroDef[];
  questlog: QuestLog;
  rngSeed: number;
  fightCounter: number; // monotonic nonce for every seeded action (fights, gathers, crafts)
  activity: string[]; // recent human-readable log lines, newest first
  // The most recent skinnable corpse, if any: gather it once, then it's gone.
  corpse: { creatureEntry: number; node: number } | null;
  // Creature type of the most recent kill (any kill), so an Undead can Cannibalize a fresh corpse.
  // Set on a win, cleared on travel or the next fight.
  lastCorpse?: { creatureType: number; creatureEntry?: number; hitBySpells?: number[] } | null;
  // Per-node harvest state, keyed by `${zoneId}:${nodeId}`: how many charges a placed
  // node has left and when a depleted one respawns. A missing key means a pristine node.
  nodeState: Record<string, NodeState>;
  // FI7 Pick Pocket restock map: spawnKey → nextReadyMs. Session runtime, not a bake field;
  // absent on pre-FI7 saves means every target is ready. Cite: Creature.cpp restock.
  pickpocketRestock?: PickpocketRestockMap;
  // Per-GO runtime bookkeeping for restock / trap arm / charges, keyed `${zoneId}:${objectEntry}`
  // (or entry alone when unzoned). Absent on pre-J saves, meaning every GO is pristine.
  goRuntime?: Record<string, GoRuntimeState>;
  // Temporary GameObjects placed by SPELL_EFFECT_SUMMON_OBJECT_WILD (76), session runtime only.
  // Cite: SpellEffects.cpp:3620–3662 EffectSummonObjectWild.
  wildSummonedObjects?: import('./summonObjectWild.ts').WildSummonedObject[];
  /** m_ObjectSlotGuid[0..3] session GOs. Cite: SpellEffects.cpp:4734–4790; Unit.h:1979. */
  objectSlots?: import('./summonObjectSlot.ts').SlotSummonedObject[];
  // Meeting-stone LFG queue from SCRIPT_COMMAND_MEETINGSTONE (200). Cite: ScriptMgr.cpp:3287–3307;
  // LFGMgr.cpp:38–90 AddToQueue.
  meetingStoneQueue?: import('./meetingStoneQueue.ts').MeetingStoneQueueState | null;
  // MirrorTimer-style environmental hazard state; absent on pre-J saves builds a fresh one on the
  // first regenTick. Zones stay unflagged until authored, so this is inert by default.
  hazards?: HazardState;
  // Spell and category cooldowns (wall-clock readyAt ms), persisted across fights and used for OOC
  // casts (racials, long CDs, potions via category). Old saves are back-filled on load.
  spellCooldowns: Record<number, number>;
  categoryCooldowns: Record<number, number>;
  // The dungeon run you're currently inside (Phase 5), or null when in the world.
  instance: InstanceRun | null;
  // Session clock passed to the last instance entry; raid lockouts stamp from it so expiry compares
  // on the same nowMs as `canEnter`. migrate must keep it or lockout falls to `?? 0` (KI-1022).
  instanceEnteredAtMs?: number;
  // Instances you walked out of. 5-mans hold for NORMAL_INSTANCE_RESET_TIME_MS; raids hold until lockout
  // expiry. Absent ≡ nothing held (older saves too).
  instanceSaves?: InstanceSaveMap;
  // The battleground you are in (PVP-BG-RUNSHEET). Identity only — the live BgWorld is runtime. Optional:
  // absent on every pre-BG save (you are in the world).
  battleground?: BattlegroundRun | null;
  // Map/realm worldstate variables (GetVariable / SetVariable) — OutdoorPvP SI/EP plus SET_WORLDSTATE
  // writes. Cite: WorldStateVariableManager.cpp:45-70; OutdoorPvPSI.cpp:38-46.
  worldStates?: Record<number, number>;
  // dungeonId -> lockout expiry (ms); only timed lockouts (raids, later) populate it.
  lockouts: LockoutMap;
  // The auction house (Phase 4 economy + Phase 8 bot autofill). Per-character for now;
  // a truly shared cross-player AH lands with the Phase 6 server.
  auctionHouse: AuctionHouseState;
  // Player inbox (CMaNGOS mail): AH settlement, bags-full instance loot, quest RewMailTemplateId and
  // player sends all land here. Pre-wire saves stored Delivery[]; migrateMailbox wraps them.
  mailbox: Mailbox;
  // What the open LootFrame is holding. `closeLoot` discards outdoor leftovers but keeps a
  // `kind: 'container'` remainder. Only loot acts passing `{ hold: true }` fill this.
  pendingLoot?: PendingLoot | null;
  // Limited-vendor stock (Creature.h VendorItemCount): vendorEntry → itemId → count +
  // lastIncrementTime. Only vendors with baked npc_vendor maxcount rows appear.
  vendorStock?: Record<number, Record<number, { count: number; lastIncrementTime: number }>>;
  // The open honor week: every character who banked contribution, keyed by name (`@player` for the
  // player). The weekly pass ranks against THIS population, not a curve. Cite: ObjectMgr.cpp:3765.
  honorWeek?: HonorWeekLedger;
  // Rungs of the 1v1 bot gauntlet this character has beaten. Only a WON `arena1` against the rung
  // you faced advances it, and it never goes down. 0/absent → `gauntletLadder()[0]`.
  gauntletRung?: number;
  // Arena Elo per bracket (1, 2, 3, 5), keyed by bracket size. Absent or a missing key reads as
  // ARENA_RATING_START. It REPLACES the Freemade..Apes picker for arena: the rating decides the
  // comp and the tier. A loss lowers it and there is no floor. Cite: domain/bg/arenaRating.ts.
  arenaRating?: Partial<Record<number, number>>;
  // D2 squad: persistent AI companions (free composition, geared from the player's bags - bots never roll)
  // and the player's chosen run role. Optional - absent on pre-v19 saves (no crew recruited yet).
  squad?: Companion[];
  squadRole?: SquadRole;
  /** D3 run pacing: careful | aggressive | sip — see squad.ts SQUAD_PACING. */
  squadStrategy?: SquadStrategy;
  // D4 world pool: every bot ever hired, keyed by bot id, dismissed ones included — a dismissed bot
  // keeps its gear, level and XP. Active members live in `squad`; no id is in both.
  botRoster?: Record<string, Companion>;
  // Shared companion-mission energy pool (100 max, refills at local 06:00). Absent ⇒ full for the current
  // day. Not per-companion — one budget for the roster. Cite: domain/bots/companionMissions.ts partyEnergy.
  companionEnergy?: CompanionEnergyState;
  // DEV raid bench — raid-shaped bodies built free from a tier template, kept OUT of `botRoster` so
  // a raid test cannot poison the hire economy. Only an `asRaid` instance entry fields them.
  raidRoster?: {
    dungeonId: string;
    tier: RaidTierId;
    members: Record<string, Companion>;
  };
  // The raid promotion in force, so leave / hearth / taxi / portal can undo it after a reload — as a
  // closure variable it stranded 39 promoted companions. `benched` holds members set aside for a smaller cap.
  // `fill` is a battleground merc generated for one match: it goes back to no roster at all.
  raidParty?: {
    dungeonId: string;
    promoted: { id: string; from: 'bench' | 'raid' | 'fill' }[];
    benched: Companion[];
  };
  // Hand-picked companion ids (squad + botRoster) for the next instance. When set for that dungeon,
  // the entry path seats these instead of auto-promoting the bench. Leave puts them back.
  instanceRoster?: {
    dungeonId: string;
    ids: string[];
  };
  // Raid group picked on the Companions tab (10/20/40), owned bodies only, used when that dungeon
  // has no `instanceRoster`. Empty `ids` is a real pick: you walk in with nobody extra.
  raidLineup?: {
    size: 10 | 20 | 40;
    ids: string[];
  };
  // The player's auto-combat rotation. Absent or class-mismatched regenerates on first read, and an
  // untouched default refreshes when level, spec or spellbook drifts.
  rotation?: Rotation;
  // Second, separately edited DPS rotation for a tank/healer band, built on the class damage
  // band. Absent until the DPS tab is opened; a DPS spec is never offered one.
  rotationDps?: Rotation;
  // Named rotation lists and the source of truth; `rotation` above is a MIRROR of the active one so
  // the places that rewrite it in place (rank upgrade, quest reward, respec) keep working.
  rotationProfiles?: RotationProfile[];
  /** Which named profile drives play. Absent → the first. */
  activeRotationProfileId?: string;
  // Which of the two profiles is in force. Absent/'primary' => the role rotation above.
  rotationProfile?: RotationProfileId;
  // Rotation spec override ("autodetect but let me choose"). null/undefined => derive the primary
  // tree from spent talents; a tree name (e.g. 'Feral Combat') forces that spec's suggestion bands.
  rotationSpec?: string | null;
  // Auto Quest / Autofarm settings (thresholds, speed, auto-eat toggles). Absent => defaults.
  autopilot?: AutopilotConfig;
  // Equipment helper (auto-equip better gear or only suggest). Uses StatCompare-grounded scoring.
  // Absent => DEFAULT_EQUIPMENT_HELPER_CONFIG via normalizeEquipmentHelperConfig.
  equipmentHelper?: EquipmentHelperConfig;
  // Outfitter named gear sets for the player. Companions store their own on Companion.outfitter. Absent ⇒
  // seeded on first open (Normal, Birthday Suit, smart resists, special stubs).
  outfitter?: import('../../domain/bots/outfitter.ts').OutfitterState;
  // Auto-disenchant bagged gear up to a quality ceiling when the party has Enchanting. Absent = off.
  // Always keeps your upgrades, and companion upgrades when protectCompanionUpgrades.
  autoDisenchant?: AutoDisenchantConfig;
  // How Share consumables splits your bag stacks across the party or raid: a rule per rank ladder,
  // the scope, the kit filter, and whether you keep a share. Absent => every ladder on auto, party, you included.
  consumableShare?: import('../../domain/bots/consumableShare.ts').ConsumableShareState;
  // PallyPower board: which Blessing each paladin puts on each class, and which Aura each runs.
  // Absent/empty => every cell auto, the CMaNGOS chain in rotation/paladinBuffs.ts.
  paladinAssignments?: import('../../domain/rotation/paladinBuffs.ts').PaladinAssignments;
  // Per-character junk filter layer (lists always; quality/auto when characterSpecific). Global layer lives
  // in client Settings. Absent => empty character lists, use global rules.
  junkFilter?: CharacterJunkFilterConfig;
  // Auto-quest mine/herb + fight-end auto-skin take-list (skill colour + skip/always). Absent => skip gray.
  gatherFilter?: GatherFilterConfig;
  // Named talent loadouts saved from the wiki calculator. Optional — pre-feature saves omit; empty list is
  // the same as absent.
  talentBuilds?: TalentBuild[];
  // Last talent-respec cost charged in copper (CMaNGOS `m_resetTalentsCost`); absent/0 means the
  // next respec is the 1g first-reset price. Cite: Player.cpp:3715.
  resetTalentsCost?: number;
  // Wall-clock ms of the last successful respec. CMaNGOS `m_resetTalentsTime`. Used for the 5g/month decay.
  // Cite: Player.cpp:3726. Round-tripped through saveShape.migrate alongside resetTalentsCost.
  resetTalentsTime?: number;
  // Wave DF: full death-flow snapshot (CORPSE/GHOST). Absent/`ALIVE` when repair-only mode or after
  // resurrect. Optional — pre-DF saves omit it.
  deathFlow?: DeathFlowState;
}

/** Player listing lengths. Client minutes 120/480/1440. Cite: AuctionFrame.lua:790–796; Handler.cpp:256–258. */
export const AH_DURATIONS_MS = {
  short: 2 * 60 * 60 * 1000,
  medium: 8 * 60 * 60 * 1000,
  long: 24 * 60 * 60 * 1000,
} as const;
export type AhDuration = keyof typeof AH_DURATIONS_MS;

export type { LootDrop };

/** Why `repeatQuest` stopped: bags ran dry, the per-call cap, the 20-slot log, or a refusal. */
export type QuestRepeatStop = 'materials' | 'cap' | 'log-full' | 'blocked';

// Safety cap on one repeatQuest call. A 250-stack turn-in that wants 3 items per round tops out at
// 83 rounds, so this only ever catches a data bug that makes the loop non-terminating.
export const MAX_QUEST_REPEATS = 500;

/** Why `consumeItemAll` stopped: the stack ran out, the per-call cap, or the item refused. */
export type UseAllStop = 'stack' | 'cap' | 'blocked';
export interface FightOutcome {
  ok: true;
  // `win` player killed the foe, `defeat` player HP hit 0, `timeout` combat cap with the player
  // alive (no death penalties). Cite: KI-740 — settleFight must not treat timeout as death.
  outcome: 'win' | 'defeat' | 'timeout';
  result: CombatResult;
  xpGained: number;
  goldGained: number;
  loot: LootDrop[];
  leveledTo: number[];
  /** Bodies that died and were paid — a defeat that took half the pull with it is not zero. */
  killCount: number;
}
export interface BeginFight {
  session: CombatSession;
  enemyName: string;
  enemyEntry: number; // the foe's CreatureDef entry - lets the UI show its portrait glyph
  playerMax: number;
  enemyMax: number;
  // Nearby spawns within their GetAttackDistance of the pull origin — metadata for spatial hunt,
  // not auto-joined on a player-initiated single pull (that is packAssist / CallForHelp).
  spatialAdds?: Array<{ entry: number; distance: number; attackDistance: number }>;
  // Wave 4B: pack members that joined via CallAssistance (CallForHelp radius + CanAssistTo). Already
  // present as multi-enemy specs in `session` when non-empty.
  packAssist?: Array<{ entry: number; distance: number; name: string }>;
  // Player-chosen outdoor AoE extras (Autopilot pullNormalCount / pullEliteCount). Not CallAssistance.
  aoePull?: Array<{ entry: number; distance: number; name: string }>;
  // S4A / DR fusion: encounter ids folded into this pull (primary alone when unfused). Live UI mirrors this
  // for Incoming / Pull +1 so already-fused packs are not re-shown.
  fusedIds?: string[];
}

/** Result of Game.pullAdditionalPack (S4A conveyor / mid-fight inject). */
export interface PullAdditionalPackResult {
  encounterId: string;
  name: string;
  /** Newly injected enemies (side + entry + display name). */
  injected: Array<{ side: string; name: string; entry: number }>;
  // Soft warning when living hostiles after inject exceed MAYHEM_SOFT_CAP (10). Never a hard block — UI may
  // surface it.
  softCapWarning: boolean;
  combatantCount: number;
  /** Full fusion batch after this inject (primary + prior fused + newly pulled). */
  fusedIds: string[];
}
export type ActionResult<T = {}> = ({ ok: true } & T) | { ok: false; reason: string };

export type OutfitWearResult = ActionResult<{
  wearing: boolean;
  name: string;
  missing: number;
  party?: Array<{ owner: string; name: string; ok: boolean; reason?: string }>;
}>;

/** One row of the roster-wide gearing view (Game.squadUpgradePlan). */
export interface SquadUpgradeRow {
  companionId: string;
  companionName: string;
  /** True when this companion is on the bench rather than in the party. */
  benched: boolean;
  entry: number;
  targetSlot: EquipSlot;
  currentEntry?: number;
  /** Spec-weighted score gain over what they are wearing now. */
  delta: number;
  /** Where the item is: the companion's own bags, your bags, your bank, or another companion's bags. */
  from: 'theirs' | 'you' | 'bank' | 'mate';
  /** The companion holding a 'mate' row (a crafter's product sits in the crafter's bags). */
  holderId?: string;
  holderName?: string;
}

// Where an enchant-applying item should land. Omitted target ⇒ the player's own gear. A companion is
// addressed by id so the caller never hands the engine a stale copy of it.
export type EnchantTarget =
  | { kind: 'self' }
  | { kind: 'companion'; id: string };

/** Options for Game.consumeItem beyond the legacy food/drink preference. */
export interface ConsumeItemOpts {
  preferEffect?: 'food' | 'drink';
  /** Whose gear to enchant. Default: the player's. */
  target?: EnchantTarget;
  /** Which equipped slot to enchant. Omitted ⇒ the call returns `needsTarget` instead. */
  slot?: EquipSlot;
}

// Returned with ok:false when an enchant item or weapon-imbue spell named no slot. `slots` is already
// filtered to what this wearer can take, so a picker built from it cannot offer a refused slot.
export interface EnchantNeedsTarget {
  itemEntry?: number;
  /** Shaman weapon imbue spell (Rockbiter / Flametongue / …) when the cast needs a hand. */
  spellId?: number;
  enchantId: number;
  target: EnchantTarget;
  slots: EquipSlot[];
  /** Slots that hold an item but were refused, with the reason — for a greyed-out row. */
  rejected: { slot: EquipSlot; reason: string }[];
}

/** One line of a vendor's stock, resolved for display (see Game.vendorOffers). */
export interface VendorOffer {
  itemEntry: number;
  /** Units delivered per purchase — item_template.BuyCount (1 for most items). */
  unitsPerPurchase: number;
  /** Copper for ONE purchase of `unitsPerPurchase` units, reputation discount applied. */
  pricePerPurchase: number;
  /** Undiscounted bundle price, so a surface can show the discount. */
  basePricePerPurchase: number;
  /** npc_vendor.maxcount, or null when the supply is unlimited. */
  maxStock: number | null;
  /** Units available right now after lazy restock; null when unlimited. */
  stockRemaining: number | null;
  /** ms until the next restock tick, or null when unlimited / already full. */
  restockInMs: number | null;
  /** npc_vendor.incrtime in seconds (one restock tick), null when unlimited. */
  restockEverySec: number | null;
  /** False when limited stock can't cover one purchase right now. */
  inStock: boolean;
  /** Can the player's bags take `unitsPerPurchase` units (family-aware)? */
  fits: boolean;
  // Honor Points for ONE purchase, or 0 when the line is paid in coin. PRODUCT RULE: PvP gear is
  // bought with honor, so `pricePerPurchase` is 0 whenever this is set. Cite: honorPrice.ts.
  honorPrice: number;
  /** Can the player pay `pricePerPurchase`, or `honorPrice` when that is the price? */
  affordable: boolean;
  // False when a BuyItemFromVendor requirement gate refuses this line regardless of gold, bags or stock:
  // RequiredReputation, requiredhonorrank, or npc_vendor.condition_id. Cite: Player.cpp:17528-17549.
  meetsRequirements: boolean;
  /** Why `meetsRequirements` is false ("Requires the rank of Knight"). Absent when it is true. */
  requirementReason?: string;
}

// Encounter-open failures that must not hard-stop an auto or headless dungeon: missing templates and
// empty pulls are skipped with a log. Fatal state (spirit, not in dungeon, path locked) still stops.
export function isSkippableBeginFailure(reason: string | undefined): boolean {
  if (reason == null || !reason.trim()) return true;
  const r = reason.toLowerCase();
  return (
    r.includes('unknown creature')
    || r.includes('no pull')
    || r.includes('no template')
  );
}

/** One inn hire option: a world-pool bot + its premade spec + generated spawn-gear preview. */
export interface InnCandidate {
  bot: WorldBot;
  /** Premade playerbot spec (undefined when the bake predates seed-bot-specs). */
  specName?: string;
  /** Dungeon-role hint from the spec (vet your hires - a shadow priest is not a healer). */
  specRole?: SquadRole;
  /** The spawn gear the bot arrives wearing (generated from its template, deterministic). */
  gear: EquippedMap;
  // ICH1/ICH3 kit tier for this slate face (docs/archive/INN-COMPANION-HIRE-DESIGN.md §2, §5). Frozen onto
  // Companion.gearProfile at hire. Assigned by pickProfile + slate mix.
  gearProfile?: GearProfile;
  // ICH2 first-hire price in copper (design §3). 0 for naked. Re-hire from roster is free and does not
  // appear on the slate.
  hireCostCopper?: number;
  /** ICH3 display-only gear estimate (average worn itemLevel). Not used for price (design D3). */
  gearScore?: number;
}

/** Which container `Game.sortContainer` reorders. */
export type SortContainerTarget =
  | 'bags'
  | 'bank'
  | 'companion-bags'
  | 'companion-bank'
  | 'companions';

export interface Game {
  readonly state: GameState;
  /** Auto-resolve a whole fight (AI plays the player). */
  fight(
    creatureEntry: number,
    opts?: { withSquad?: boolean; noAoe?: boolean },
  ): ActionResult<Omit<FightOutcome, 'ok'>>;
  // Start a live, interactive fight. `withSquad` brings hired companions (default: solo).
  // `attack` reads the Attack dial; `noAoe` skips farm-dial extras (detected pickpocket).
  beginFight(
    creatureEntry: number,
    opts?: { withSquad?: boolean; sitting?: boolean; attack?: boolean; noAoe?: boolean },
  ): ActionResult<BeginFight>;
  // Free-floor dungeon pull: fight exactly these spawn guids at DB world coords. Not a route wave —
  // composition is whatever the party pulled.
  beginFloorPull(opts: {
    dungeonId: string;
    mapId: number;
    members: readonly { guid: number; entry: number; x: number; y: number }[];
    withSquad?: boolean;
    elapsedMs?: number;
  }): ActionResult<BeginFight>;
  // Continuous dungeon: one endless combat session for the whole run (dead shell enemy). Mount combatView
  // once; injectFloorMember for every pull — no fight-scene thrash.
  beginFloorShell(opts: {
    dungeonId: string;
    mapId: number;
    origin: { x: number; y: number; z?: number };
    withSquad?: boolean;
  }): ActionResult<BeginFight>;
  // Inject one DB spawn into the open endless floor session at world coords. `passive: true` — in the
  // combat pool with no AttackStart threat (not aggroed).
  injectFloorMember(
    session: CombatSession,
    member: { guid: number; entry: number; x: number; y: number; z?: number },
    opts?: { passive?: boolean },
  ): ActionResult<{ side: string; name: string; entry: number; level: number }>;
  /** After a passive stream inject enters real combat — queue kill credit for that guid. */
  noteFloorPackMember(
    member: { guid: number; entry: number; level: number },
  ): ActionResult;
  // Mid-run kill settlement for floor packs. Endless session stays open. Credits pending pack members since
  // last call, then clears that list.
  creditFloorKills(opts?: {
    guids?: number[];
    dropRest?: boolean;
    /** Hold drops + coin in the loot window (boss kill) instead of bagging them. */
    holdLoot?: boolean;
    lootTitle?: string;
    lootCreatureEntry?: number;
  }): ActionResult<{
    xpGained: number;
    goldGained: number;
    loot: LootDrop[];
    killCount: number;
    /** What each corpse's death script summoned. The floor owns where the body lands. */
    summons: FloorDeathSummon[];
  }>;
  /** Apply the outcome of a (live or auto) fight: vitals, loot, gold, quest credit, xp. */
  resolveFight(session: CombatSession, opts?: { holdLoot?: boolean }): FightOutcome;
  // Plan and depart a wall-clock journey to `zoneId` (multi-leg; the destination need not be a
  // neighbour). Fares prepay at departure and position derives from `now` via journeyTick.
  travelTo(zoneId: string, nowMs?: number): ActionResult<{ travelMs: number; totalSeconds: number; totalCopper: number }>;
  // Plan-only route preview for the map panel: legs, ETA seconds and copper with NO state change,
  // assembled the same way travelTo does so the preview always matches departure.
  previewTravel(zoneId: string, nowMs?: number): ActionResult<{ legs: JourneyLeg[]; totalSeconds: number; totalCopper: number }>;
  // Derive journey progress at `nowMs`, apply zone handoffs + first-visit hooks, clear journey on arrival.
  // Lazy-invoked by travel-relevant reads so state never goes stale.
  journeyTick(nowMs?: number): void;
  // Sim Pause: while true, journeyTick folds elapsed wall time into pausedMs and does not advance travel.
  setIdlePaused(paused: boolean, nowMs?: number): void;
  /** Read-only journey view for UI/autopilot, or null when idle. */
  journeyStatus(nowMs?: number): {
    progress: JourneyProgress;
    legs: JourneyLeg[];
    arrivalEpochMs: number;
    destination: string;
    /** Active fast-forward factor (D9 revised): 1, 2 or 4. */
    timeScale: number;
  } | null;
  // Voluntary abort. Traveler stays in the derived current zone; prepaid taxi fares on incomplete legs are
  // refunded (KI-901).
  cancelJourney(nowMs?: number): ActionResult;
  // Set the active journey's fast-forward factor (1×/2×/4× of real time), rebased for continuity and
  // persisted. New journeys take it from `opts.travelPace`; this is for changing one underway.
  setJourneySpeed(scale: number, nowMs?: number): ActionResult;
  // Instant arrival. Refused unless the live travel pace (`opts.travelPace`) is 'instant' - a local
  // single-player convenience (D3 amendment); the Phase-6 server path must never accept this call.
  completeJourneyNow(nowMs?: number): ActionResult;
  // Abandon the live (unresolved) combat session WITHOUT settling it, so the world loop cannot
  // re-open it. No XP, loot or durability, and the hero keeps its pre-fight HP.
  abandonLiveFight(nowMs?: number): ActionResult;
  /** Bind hearthstone at the current zone's inn/tavern (K2). */
  bindHearth(nowMs?: number): ActionResult<{ bind: HearthBind }>;
  /** Cast hearthstone (spell 8690): depart a single-leg hearth journey to the bind. */
  castHearth(nowMs?: number): ActionResult<{ totalSeconds: number }>;
  // Known class teleports that have a baked `spellTeleports` row; spells without one never appear.
  // `have` is the bag count via countItem. Warlock Ritual of Summoning is deferred.
  classTravelOptions(nowMs?: number): Array<{
    spellId: number;
    name: string;
    toZone: string;
    castSeconds: number;
    /** True for a City Defender's granted capital teleport: no rune, no mana. PRODUCT RULE. */
    free: boolean;
    reagents: Array<{ item: number; count: number; have: number }>;
  }>;
  // Cast a known teleport: gate reagents, then depart a single-leg `kind: 'portal'` journey for
  // castTimeMs/1000 s. TakeReagents runs only on arrival, so a cancel mid-channel consumes nothing.
  castTeleport(spellId: number, nowMs?: number): ActionResult<{ totalSeconds: number }>;
  // Direct taxi options from the current zone's discovered, faction-usable nodes to other discovered nodes
  // (single-hop view for the flight-master UI).
  taxiOptions(nowMs?: number): Array<{ toZone: string; seconds: number; priceCopper: number; pathId: number }>;
  // Live combat session from the most recent startFight. Null after resolveFight or when no fight is open.
  // UI/tests drive tick + resolveFight.
  liveFightSession(): CombatSession | null;
  acceptQuest(entry: number, opts?: { atGo?: boolean }): ActionResult;
  /** Drop a quest from the log, freeing its slot; the quest becomes offerable again. */
  abandonQuest(entry: number): ActionResult;
  // A degraded escort or event finish credits the event and refreshes completion, with no XP or money
  // — the turn-in pays. Empty explore-trigger quests take the same path.
  finishEscort(entry: number): ActionResult;
  // FO4: use a quest source/provided item on a target for use-on-target credit. Validates inventory
  // only. KI-439: a Taming Rod credits only when targetCreatureEntry is its sourced practice beast.
  useQuestItemOnTarget(opts: {
    itemEntry: number;
    targetCreatureEntry?: number;
    targetGoEntry?: number;
  }): ActionResult;
  // FO4: talk/gossip with an NPC — credits talk-candidate quests whose ender/starter name matches. Explicit
  // player action; does not free-complete on accept. Cite: MASTER-ROADMAP FO4; domain recordTalkToNpc.
  talkToNpc(opts: { creatureEntry?: number; npcName?: string }): ActionResult;
  // Turn in a complete quest. `rewardChoice` is the 0-based index into `QuestDef.rewChoiceItems`;
  // omit or 0 when there is no choice. Cite: Player.cpp:12544 RewardQuest `reward` arg.
  turnInQuest(
    entry: number,
    rewardChoice?: number,
  ): ActionResult<{ xp: number; money: number; items: LootDrop[]; spells: import('./questTurnIn.ts').QuestTurnInSpell[]; buffs?: import('./questTurnIn.ts').QuestTurnInSpell[]; leveledTo: number[]; tempSpawns?: import('./questTurnIn.ts').QuestEndTempSpawn[] }>;
  // Hand a repeatable in over and over while the bags still pay for it. Stops on the first round a
  // fresh quest row would not already read complete, so nothing half-accepted is left behind.
  repeatQuest(
    entry: number,
    opts?: { rewardChoice?: number; max?: number },
  ): ActionResult<{
    turnedIn: number;
    xp: number;
    money: number;
    items: LootDrop[];
    leveledTo: number[];
    stopped: QuestRepeatStop;
  }>;
  learnFromTrainer(trainerEntry: number, spellId: number): ActionResult;
  // Read a class book that teaches a player ability (Grimoire of Inferno, the Codex/Tome family). Consumes
  // the book, learns the ability + its dependants, and fixes bars/rotation ranks.
  learnSpellFromItem(itemEntry: number): ActionResult<{ spell: number; name: string }>;
  /** Buy `qty` of an item the given vendor stocks, spending gold and filling the bags. */
  buyItem(vendorEntry: number, itemEntry: number, qty?: number): ActionResult<{ spent: number }>;
  // Pre-run food and water (domain/bots/runSupply.ts): you plus the seated squad with their own bags; the
  // plan a mageless party sees at Start the run; the buy off your purse into each member's bags (reagentBuyIn.ts).
  runSupplyMembers(): import('../../domain/bots/runSupply.ts').SupplyMember[];
  runSupplyPlan(prefs?: import('../../domain/bots/runSupply.ts').RunSupplyPrefs): import('../../domain/bots/runSupply.ts').RunSupplyPlan;
  buyRunSupplies(
    buys: readonly import('../../domain/bots/runSupply.ts').SupplyBuy[],
  ): ActionResult<{ spent: number; units: number; rows: number; refusal?: string }>;
  // Everything a surface needs for one vendor line: units per purchase, bundle price after the rep
  // discount, and stock left plus restock time. One query, so nothing disagrees with buyItem().
  vendorOffers(vendorEntry: number, nowMs?: number): VendorOffer[];
  // Bank one character's contribution into the open honor week; `key` is a name or `'player'`. Bots
  // bank too — the weekly pass ranks against this population. Cite: Formulas.h:105 GenerateScores.
  bankWeeklyHonor(key: string, cp: number, hk?: number): void;
  // Honor for a duel WON against another player, in the same shape a BG kill takes and paying the
  // same 160 at 60. The shipped falloff zeroes a farm loop after ten wins on one person in a day.
  awardDuelHonor(opponent: { name: string; level: number; rankPoints?: number }): { cp: number };
  // Bracket win bonus for the 1v1 and 2v2, which resolve on the combat surface rather than the BG
  // screen. Same BG_WSG_WinMatchHonor number every other bracket pays. Cite: BattleGroundWS.h.
  awardArenaWinHonor(): { cp: number };
  // Run every maintenance-day (Wednesday) honor pass this save owes and return how many ran. Called
  // on load; call again after banking so a session crossing the boundary ranks. Cite: World.h:461.
  runWeeklyHonorPass(nowMs?: number): number;
  // Select projectile ammo (PLAYER_AMMO_ID / SetAmmo). Entry must be INVTYPE_AMMO and pass CanUseAmmo
  // (level/class). Cite: Player.cpp SetAmmo; ItemHandler HandleSetAmmoOpcode.
  setAmmo(itemEntry: number): ActionResult;
  /** Clear selected ammo (RemoveAmmo). Cite: Player.cpp RemoveAmmo. */
  clearAmmo(): ActionResult;
  /** Sell `qty` of an item from the bags for its sell price (any vendor buys). */
  sellItem(itemEntry: number, qty?: number): ActionResult<{ earned: number; qty: number }>;
  // Sell up to `qty` from the specific bag stack at `slotIndex` (does not drain other stacks of the same
  // item). Prefer this for vendor UI clicks on a bag cell.
  sellItemStack(slotIndex: number, qty?: number): ActionResult<{ earned: number; qty: number }>;
  /** Sell every poor-quality (grey) item in the bags at once. */
  sellAllJunk(): ActionResult<{ earned: number; count: number }>;
  /** Permanently destroy `qty` of an item from bags and/or keyring. */
  discardItem(itemEntry: number, qty?: number): ActionResult<{ discarded: number }>;
  /** Destroy the bag stack at index only (multi-select destroy; does not drain other stacks). */
  discardBagStack(index: number, qty?: number): ActionResult<{ discarded: number }>;
  /** Destroy the keyring stack at index (UI keyring cells). */
  discardKeyringStack(index: number, qty?: number): ActionResult<{ discarded: number }>;
  // Rearrange the bags: move the stack in bag slot `from` to slot `to` (merge same items, swap
  // different ones, or move to the end). `qty` must be a positive finite integer when given.
  moveItem(from: number, to: number, qty?: number): ActionResult;
  // Restack and reorder one container in the SortBags order (domain/items/sortContainer.ts).
  // `companionId` is required for the two companion targets; 'companions' does the whole crew's
  // bags and banks, which is what the merged Companion storage grid shows.
  sortContainer(where: SortContainerTarget, companionId?: string): ActionResult<{ freed: number; changed: boolean }>;
  // Repair all worn gear (any vendor repairs). `vendorEntry` applies that NPC's Honored+ discount;
  // omitted, the best discount among canRepair vendors in the zone, or 1.0 if there are none.
  repairAll(vendorEntry?: number): ActionResult<{ spent: number }>;
  // Read-only bill `repairAll(vendorEntry)` would charge, plus the repair NPC it prices against.
  // `vendorName` is null when no canRepair vendor is reachable (HUD gate).
  repairQuote(vendorEntry?: number): {
    cost: number;
    vendorEntry: number | null;
    vendorName: string | null;
  };
  /** Repair one equipped paperdoll slot (MerchantRepairItemButton / single-item path). */
  repairSlot(slot: EquipSlot, vendorEntry?: number): ActionResult<{ spent: number }>;
  // Wave DF: read-only death-flow view (null when ALIVE / repair-only). `canReclaim` / `reclaimReady` use
  // `nowMs` (default Date.now()).
  deathFlowStatus(nowMs?: number): {
    deathState: DeathFlowState['deathState'];
    canReclaim: boolean;
    reclaimReady: boolean;
    reclaimDelayMs: number;
    reclaimReadyInMs: number;
    corpseZoneId: number | string | null;
    graveyardId: number | null;
  } | null;
  /** Move ghost to corpse position (corpse-run stand-in). Ghost only. */
  runToCorpse(): ActionResult;
  // Reclaim corpse when ghost is in range and reclaim delay has elapsed. Half HP, no resurrection sickness.
  // Cite: MiscHandler.cpp HandleReclaimCorpseOpcode.
  reclaimCorpse(nowMs?: number): ActionResult;
  // Spirit healer resurrect at graveyard: half HP, res sickness (level-scaled), +25% durability loss. Cite:
  // NPCHandler.cpp SendSpiritResurrect.
  spiritHealerResurrect(nowMs?: number): ActionResult;
  // Use/consume an item out of combat. `preferEffect` applies the food/drink consumable directly;
  // a teach item routes to itemTeaches.ts. `needsTarget` rides the FAILURE branch, not ActionResult.
  consumeItem(itemEntry: number, preferEffect?: 'food' | 'drink' | ConsumeItemOpts):
    | ({ ok: true } & { restored: number; kind?: 'food' | 'drink'; buff?: { mod: string; amount: number; durationMs: number }; learned?: { kind: 'recipe' | 'enchant' | 'petSpell' | 'spell' | 'profRank'; name: string } })
    | { ok: false; reason: string; needsTarget?: EnchantNeedsTarget };
  // Use the WHOLE stack in one call, on the same route a single use takes — so a stack of clams
  // opens, a stack of tokens is spent, and a shared cooldown stops the run at the first refusal.
  consumeItemAll(itemEntry: number, max?: number): ActionResult<{
    used: number;
    restored: number;
    stopped: UseAllStop;
    /** The refusal that ended the run, when one did. */
    lastReason?: string;
  }>;
  // FI9: wrap the bag stack at `targetSlot` with paper at `paperSlot`, consuming one of each and
  // leaving a gift shell carrying `wrappedItemEntry`. Bind-on-wrap for BoP or bound targets.
  wrapItem(paperSlot: number, targetSlot: number): ActionResult<{ giftEntry: number; wrappedEntry: number; bound: boolean }>;
  // FI9: unwrap a filled gift stack at `slotIndex`, restoring the original entry. UI should play
  // `sound.clip('unwrap')` on success.
  unwrapItem(slotIndex: number): ActionResult<{ restoredEntry: number; bound: boolean }>;
  regenTick(seconds: number, sitting: boolean, opts?: {
    // The caller is replaying a background gap it already booked via accrueOfflineRest, so skip in-game
    // rested accrual. Both paths pay the same rate inside an inn — see game.ts.
    restAlreadyBooked?: boolean;
  }): void;
  // Accrue offline rested XP for a login gap (Player::ComputeRest offline path), called with
  // `now - save.updatedAt` seconds. Capitals accrue at full rate, anywhere else at rate/4.
  accrueOfflineRest(seconds: number): void;
  // OOC cast (buffs, conjures, pet summon/tame, stealth). `targetCreature` is the beast entry for
  // role `pet_tame`; `reviveTarget: 'self'` applies RESURRECT* to a dead caster.
  castOutOfCombat(spellId: number, opts?: {
    targetCreature?: number;
    // GameObject template entry this cast targets (cast-on-GO quest credit). Cite: Spell.cpp:1581
    // RewardPlayerAndGroupAtCast(go, spellId).
    targetGoEntry?: number;
    reviveTarget?: 'self';
    // TEMP_ENCHANTMENT_SLOT hand for shaman weapon imbues. Omitted → empty-first MH then OH with
    // two weapons, and ask when both are coated. Cite: domain/professions/weaponImbueHand.ts.
    slot?: EquipSlot;
    // Item entry for SPELL_EFFECT_FEED_PET (101) food or DISENCHANT (99) itemTarget. Feed omitted →
    // first diet food in bags; DE omitted → no target. Cite: SpellEffects.cpp:4640 EffectDisEnchant.
    itemEntry?: number;
  }): { ok: true; conjured: LootDrop[] }
    // `aggroCreature` is the entry a resisted Pick Pocket just alerted — the caller starts the fight.
    | { ok: false; reason: string; needsTarget?: EnchantNeedsTarget; aggroCreature?: number };
  /** Remaining cooldown (ms) for this spell id, taking the higher of per-spell and its category CD. 0 = ready. */
  spellCooldownRemaining(spellId: number): number;
  /** Forsaken racial: devour a fresh Humanoid/Undead corpse (from the last kill) to heal out of combat. */
  cannibalize(): ActionResult<{ restored: number }>;
  // CMSG_CANCEL_AURA — drop a buff you hold. Refuses passives, debuffs, channels, NO_AURA_CANCEL
  // and NO_AURA_ICON, and also strips it from an open floor session. Cite: SpellHandler.cpp:422.
  cancelAura(spellId: number): ActionResult<{ name: string }>;
  // Would `cancelAura(spellId)` be allowed right now? The UI asks before drawing the right-click
  // affordance, so hint and gesture cannot disagree. Does not check that you hold the aura.
  canCancelAuraNow(spellId: number): boolean;
  // Pets (hunter/warlock). Summoning a demon / calling a tamed pet goes through castOutOfCombat.
  /** Read a pet-training book (warlock Grimoire): consumes it and unlocks the pet ability rank it teaches. */
  trainPet(itemEntry: number): ActionResult<{ spell: number; name: string }>;
  /** Tame a huntable beast into your pet (Hunter). */
  tamePet(creatureEntry: number): ActionResult;
  /** Feed the pet a food item to raise its happiness (diet-gated; sourced food benefit). */
  feedPet(itemEntry: number): ActionResult;
  // Set (or clear with null) the food the pet auto-feeds on out of combat: regenTick re-feeds it
  // whenever happiness drops far enough to land without waste. Diet-gated like feedPet.
  setPetAutoFeed(itemEntry: number | null): ActionResult<{ entry: number | null }>;
  // Toggle an auto-consumable preference (food / drink / buff item), used OOC by regenTick. Pass
  // the same entry again to clear that slot or drop it from the buff list.
  setAutoConsumable(itemEntry: number): ActionResult<{ prefs: import('../../domain/bots/autoConsumables.ts').AutoConsumablePrefs | undefined }>;
  // Unconditionally clear an auto-consumable from every slot. `setAutoConsumable` refuses anything
  // not currently eligible, so it cannot clear an entry whose item has left the bags. This can.
  clearAutoConsumable(itemEntry: number): ActionResult<{ prefs: import('../../domain/bots/autoConsumables.ts').AutoConsumablePrefs | undefined }>;
  // Faction ids the player is at war with — the rep-pane toggle plus anything Hostile or below.
  // Feed it to domain/creature/faction.ts so those NPCs refuse to talk and become legal targets.
  atWarFactions(): ReadonlySet<number>;
  // Reputation pane war toggle (CMSG_SET_FACTION_ATWAR). Refused for your own side and for hidden
  // factions. At war, that faction's NPCs refuse to deal and turn attackable. Cite: SetAtWar.
  setFactionAtWar(factionId: number, on: boolean): ActionResult<{ atWar: boolean }>;
  // Park a faction at the bottom of the reputation pane (CMSG_SET_FACTION_INACTIVE). Only a visible faction
  // can go inactive; re-activating is always allowed. Cite: ReputationMgr::SetInactive.
  setFactionInactive(factionId: number, on: boolean): ActionResult<{ inactive: boolean }>;
  // "Show as Experience Bar" — the faction whose standing replaces the XP bar. Pass 0, or the
  // watched id again, to go back to XP. Cite: Player::SetWatchedFaction.
  setWatchedFaction(factionId: number): ActionResult<{ watched: number }>;
  // Buy a pet-ability rank from a pet trainer: GOLD ONCE into the character-wide Beast Training repertoire
  // (`char.petSpells`). Hunters only; no pet required out.
  buyPetSpell(trainerEntry: number, spellId: number): ActionResult;
  // Beast Training (spell 5149): teach the CURRENT pet a rank from the repertoire, spending ITS training
  // points (chain-aware). Cite: Pet.cpp GetTPForSpell/learnSpell.
  teachPetSpell(spellId: number): ActionResult;
  // Toggle autocast for a pet ability (right-click on the pet bar). Rank-agnostic by name chain; disabled
  // abilities stay learned but leave the combat kit (buildPet).
  togglePetAutocast(spellId: number): ActionResult<{ enabled: boolean }>;
  // Pet bar command / react state (Ctrl-1..Ctrl-0), stored on the pet so the next fight opens where
  // the player left it; a live session applies it at once. Cite: Unit.h CommandStates.
  setPetCommand(command: 'follow' | 'stay'): ActionResult;
  setPetReact(react: 'aggressive' | 'defensive' | 'passive'): ActionResult;
  /** Dismiss the active pet. */
  dismissPet(): ActionResult;
  // Buy the next hunter stable slot (max 2). Price from StableSlotPrices.dbc: 500 then 50000 copper.
  // Cite: NPCHandler.cpp HandleBuyStableSlot; Pet.h MAX_PET_STABLES.
  buyStableSlot(): ActionResult<{ spent: number; stableSlots: number }>;
  // Put the current hunter pet (or dismissed storedPet) into the first free purchased slot. Dead /
  // non-hunter pets refuse. Cite: NPCHandler.cpp HandleStablePet.
  stablePet(): ActionResult<{ slot: number }>;
  // Call the pet in 1-based stable slot `slot`. Swaps with the current/dismissed hunter pet when one
  // exists; otherwise the slot becomes empty. Cite: NPCHandler.cpp HandleUnstablePet / HandleStableSwapPet.
  callStabledPet(slot: number): ActionResult;
  // Auto-combat rotation + settings, read and written by the visual editor and autopilot. Returns
  // the rotation, regenerating a default if absent or class-mismatched; no profile = the active one.
  rotation(profile?: RotationProfileId): Rotation;
  // The rotation as COMBAT sees it: `rotation()` with every `{ kind: 'macro' }` rule compiled. Read
  // only — writing it back would replace the macro rule with its own output. Memoized.
  rotationForCombat(profile?: RotationProfileId): Rotation;
  // Spec band for player defaults: rotationSpec, else Holy/Resto/Protection when signed healer/tank, else
  // talent primary (undefined → autodect).
  playerRotationBand(): string | undefined;
  // Build the role-adapted class default (Holy/Resto/Protection pack bands when squadRole is healer). Used
  // by rotation()/resetRotation/setRotationSpec — not a second rotation store.
  buildPlayerDefaultRotation(
    specOverride?: string | null,
    profile?: RotationProfileId,
    /** `mode: 'pvp'` selects the authored pvp band for this class and tree. */
    opts?: { mode?: 'pvp'; variant?: string },
  ): Rotation;
  /** Replace the rotation (from the visual editor). Custom saves stay valid via isRotationValid. */
  setRotation(rot: Rotation, profile?: RotationProfileId): void;
  /** Discard edits and rebuild the recommended pack default for the current role band. */
  resetRotation(profile?: RotationProfileId): Rotation;
  /** Which rotation profile the player is playing ('primary' unless they picked the DPS tab). */
  rotationProfile(): RotationProfileId;
  /** Switch profiles. 'dps' is refused unless the band is a tank/healer tree. */
  setRotationProfile(profile: RotationProfileId): ActionResult;
  /** True when this character's band is tank/healer, so a second DPS rotation is offered. */
  hasDpsRotationProfile(): boolean;
  /** The active spec override for rotation generation, or null when autodetecting from talents. */
  rotationSpec(): string | null;
  /** The spec the rotation is actually built for (override if set, else the detected primary tree). */
  effectiveRotationSpec(): string;
  // Set the rotation spec override, accepting exact tree names, case variants and aliases ("feral" →
  // "Feral Combat"); null or unresolvable reverts to talent detection. Returns the rebuilt rotation.
  setRotationSpec(spec: string | null): Rotation;
  /** True when the player's hand-edited rotation is stale vs the recommended default (editor prompt). */
  rotationNeedsRefresh(): boolean;
  // S1: per-companion rotations for the editor's companion picker. Lazily seeds and persists the
  // role-adapted class default; null when the id is not in the active squad.
  companionRotation(id: string, profile?: RotationProfileId): Rotation | null;
  /** Replace a companion's rotation (from the visual editor's companion tab). */
  setCompanionRotation(id: string, rot: Rotation, profile?: RotationProfileId): ActionResult;
  /** Discard edits: rebuild + persist the role-adapted default for this companion. */
  resetCompanionRotation(id: string, profile?: RotationProfileId): Rotation | null;
  // ---- named rotation profiles (player) ------------------------------------------------
  /** Every named rotation this character owns, in display order, with the active one flagged. */
  rotationProfiles(): Array<{ id: string; name: string; active: boolean }>;
  // Add a rotation. `copyFromId` duplicates an existing one; `fromBand` builds the recommended list for a
  // talent band (the template path); neither ⇒ a copy of the active one.
  addRotationProfile(opts?: {
    name?: string;
    copyFromId?: string;
    fromBand?: string | null;
    /** Build the new list off this class's authored PVP band instead of the PvE one. */
    mode?: 'pvp';
  }): ActionResult<{ id: string; name: string }>;
  /** True when a pvp band really covers this character's level AND tree — what gates `+ PvP`. */
  hasPvpRotationBand(): boolean;
  renameRotationProfile(id: string, name: string): ActionResult;
  /** Delete a rotation. The last one is never deletable. */
  deleteRotationProfile(id: string): ActionResult;
  /** Make one the active rotation — what the auto-battler actually fights with. */
  selectRotationProfile(id: string): ActionResult;
  moveRotationProfile(from: number, to: number): ActionResult;

  /** Switch a tank/healer companion between its role list and its DPS list. */
  setCompanionRotationProfile(id: string, profile: RotationProfileId): ActionResult;
  /** Which slot drives this companion right now. 'primary' for anyone without a second profile. */
  companionRotationProfile(id: string): RotationProfileId;
  /** True when this companion's band is a tank/healer tree, i.e. it has a second profile. */
  companionHasDpsRotationProfile(id: string): boolean;

  // ---- named rotation profiles (companions) — same surface as the player's ---------------
  companionRotationProfiles(id: string): Array<{ id: string; name: string; active: boolean }>;
  addCompanionRotationProfile(id: string, opts?: {
    name?: string;
    copyFromId?: string;
    fromBand?: string | null;
    /** Build the new list off this class's authored PVP band instead of the PvE one. */
    mode?: 'pvp';
  }): ActionResult<{ id: string; name: string }>;
  /** Same question for a companion, at the level they fight at. */
  companionHasPvpRotationBand(id: string): boolean;
  renameCompanionRotationProfile(id: string, profileId: string, name: string): ActionResult;
  deleteCompanionRotationProfile(id: string, profileId: string): ActionResult;
  selectCompanionRotationProfile(id: string, profileId: string): ActionResult;
  // Companion action bars for party takeover (lazy-seed + autofill when empty). Null when id is not in the
  // active squad. Keys at fight time overlay the player's.
  companionActionBars(id: string): import('../../domain/character/actionbar.ts').ActionBar[] | null;
  /** Place a spell (or clear) on a companion bar slot. Spell must be in their kit. */
  setCompanionActionSlot(id: string, bar: number, slot: number, spellId: number | null): ActionResult;
  /** Place a bag consumable (or clear) on a companion bar slot — from THEIR bags. */
  setCompanionItemActionSlot(id: string, bar: number, slot: number, entry: number | null): ActionResult;
  /** Add an extra action bar on a companion (up to MAX_BARS). */
  addCompanionActionBar(id: string): ActionResult;
  /** Remove the last companion action bar (never the first). */
  removeCompanionActionBar(id: string): ActionResult;
  /** Reset companion bars to autofilled kit on a single bar. */
  resetCompanionActionBars(id: string): ActionResult;
  // Engine-ready group-fight bundle for the active squad: `allySpecs` in state.squad order plus
  // index-aligned `allyActionProviders`. `targetEntry` selects per-creature rotation overrides.
  squadBattleParty(targetEntry?: number): {
    allySpecs: CombatantSpec[];
    allyActionProviders: (AllyActionProvider | null)[];
    /** Human companion ally index → pet ally index (rotation pet subject). */
    allyPetIndex: (number | null)[];
  };
  // "Buff up" before a dungeon pull: every party member contributes its raid buffs, the best rank of
  // each family lands on the party, and mage/warlock companions conjure into your bags. Idempotent.
  applyPrePullBuffs(): { buffs: PlannedBuff[]; handouts: PlannedHandout[] };
  // Re-coat every companion's open weapon hands between pulls (poisons, stones, oils). Returns how
  // many coats landed. The zone-in buff-up is the only other caller and a coat runs 30 minutes.
  refreshPartyWeaponCoats(): number;
  /** The autopilot settings, defaulted if unset. */
  autopilotConfig(): AutopilotConfig;
  /** Replace the autopilot settings. */
  setAutopilotConfig(cfg: AutopilotConfig): void;
  /** Equipment helper config (auto vs suggest upgrades). */
  equipmentHelperConfig(): EquipmentHelperConfig;
  /** Replace equipment helper config. */
  setEquipmentHelperConfig(cfg: EquipmentHelperConfig): void;
  /** Effective auto-disenchant (global OR character). */
  autoDisenchantConfig(): AutoDisenchantConfig;
  /** Global auto-disenchant layer. */
  globalAutoDisenchantConfig(): AutoDisenchantConfig;
  /** This character's auto-disenchant layer. */
  characterAutoDisenchantConfig(): AutoDisenchantConfig;
  /** @deprecated Prefer setCharacterAutoDisenchantConfig / setGlobalAutoDisenchantConfig. */
  setAutoDisenchantConfig(cfg: AutoDisenchantConfig): void;
  setGlobalAutoDisenchantConfig(cfg: AutoDisenchantConfig): void;
  setCharacterAutoDisenchantConfig(cfg: AutoDisenchantConfig): void;
  /** Effective quality/auto layer (character if characterSpecific, else global). */
  junkFilterConfig(): JunkFilterConfig;
  /** Global junk filter (all characters). */
  globalJunkFilterConfig(): JunkFilterConfig;
  /** Replace global junk filter. */
  setGlobalJunkFilterConfig(cfg: JunkFilterConfig): void;
  /** This character's junk filter layer. */
  characterJunkFilterConfig(): CharacterJunkFilterConfig;
  /** Replace this character's junk filter layer. */
  setCharacterJunkFilterConfig(cfg: CharacterJunkFilterConfig): void;
  /** @deprecated Use setGlobalJunkFilterConfig / setCharacterJunkFilterConfig. Writes global. */
  setJunkFilterConfig(cfg: JunkFilterConfig): void;
  /** Auto-quest mine/herb + auto-skin take-list (default skip gray). */
  gatherFilterConfig(): GatherFilterConfig;
  setGatherFilterConfig(cfg: GatherFilterConfig): void;
  // With the helper enabled in 'auto' mode, equip strict bag upgrades (StatCompare-weighted),
  // skipping ones that fail equip. Always runs auto-disenchant after, then auto-sell/destroy.
  autoEquipUpgrades(max?: number): number;
  // Disenchant bagged non-upgrade gear up to the quality ceiling when a party enchanter has enough skill.
  // Returns how many items were destroyed into materials.
  autoDisenchantUpgrades(max?: number): number;
  // Open every unlocked, non-quest bag container that has room to unpack (clams, sacks, bloated
  // fish). Returns how many were opened. Runs at the head of the post-bag hook when enabled.
  autoOpenContainers(max?: number): number;
  // Auto-sell then auto-destroy bag junk under junkFilter (respects autoSell/autoDestroy flags). Returns
  // counts of sold stacks units and destroyed units.
  runAutoJunk(max?: number): { sold: number; destroyed: number; earned: number };
  /** Greys instant-vendored because bags were full (clears the tally). */
  takeOverflowSold(): { count: number; gold: number };
  /** Bag stacks the current junk filter would sell (for vendor button + buyback snapshot). */
  junkSellPreview(): Array<{ entry: number; count: number; unitSell: number }>;
  /** The junk filter run over one companion's bags — the vendor's Companions tab preview. */
  companionJunkSellPreview(id: string): Array<{ entry: number; count: number; unitSell: number }>;
  /** Sell every junk-filter match out of one companion's bags. `sold` feeds the caller's buyback. */
  sellCompanionJunk(id: string): ActionResult<{
    earned: number;
    count: number;
    sold: Array<{ entry: number; qty: number; refundCopper: number }>;
  }>;
  /** Current upgrade suggestions (for suggest mode UI). Empty when disabled or none. Optional `inv` scores a probe (bags + pending loot); without it companions' unbound stacks are read too, `holderId` naming whose bags. */
  suggestedEquipmentUpgrades(inv?: Inventory): Array<{ entry: number; slot: EquipSlot; randomPropertyId?: number; currentEntry?: number; delta: number; displaces?: EquipSlot[]; holderId?: string; holderName?: string }>;
  /** Equip one suggestion at its own slot, taking it from the holding companion first when it is theirs. */
  equipSuggestedUpgrade(itemEntry: number): ActionResult<{ slot: EquipSlot }>;
  // Equip from bags. Optional `preferred` picks which multi-slot to fill/replace (finger1/2, trinket1/2,
  // dual-wield MH|OH). When omitted, first free target wins.
  equip(itemEntry: number, preferred?: EquipSlot): ActionResult<{ slot: EquipSlot }>;
  unequip(slot: EquipSlot): ActionResult;
  // Action bars (spell-per-slot + keybinds; used by the world HUD and combat)
  /** Assign `spellId` (or null to clear both spell and item) to a bar/slot. De-dupes the spell across bars. */
  setActionSlot(bar: number, slot: number, spellId: number | null): void;
  // Assign a bag consumable `entry` (or null to clear both spell and item) to a bar/slot. De-dupes the item
  // across bars; requires count > 0 in bags when placing.
  setItemActionSlot(bar: number, slot: number, entry: number | null): void;
  // Assign macro `macroId` (or null to clear the slot) to a bar/slot. De-dupes across bars. Refuses an id
  // this character cannot see, so a hand-edited save or DOM cannot place a phantom button.
  setMacroActionSlot(bar: number, slot: number, macroId: string | null): void;
  // Outfitter (named gear sets — player + each companion). Wear is OOC only.
  outfitterEnabled(): boolean;
  outfitterState(owner?: import('../../domain/bots/outfitter.ts').OutfitOwnerId): import('../../domain/bots/outfitter.ts').OutfitterState;
  ensureOutfitter(owner?: import('../../domain/bots/outfitter.ts').OutfitOwnerId): import('../../domain/bots/outfitter.ts').OutfitterState;
  createOutfit(opts: {
    owner?: import('../../domain/bots/outfitter.ts').OutfitOwnerId;
    name?: string;
    empty?: boolean;
    statId?: import('../../domain/bots/outfitter.ts').OutfitStatId;
    party?: boolean;
  }): ActionResult<{ id: string; name: string }>;
  renameOutfit(owner: import('../../domain/bots/outfitter.ts').OutfitOwnerId, id: string, name: string): ActionResult;
  deleteOutfit(owner: import('../../domain/bots/outfitter.ts').OutfitOwnerId, id: string): ActionResult;
  rebuildOutfit(owner: import('../../domain/bots/outfitter.ts').OutfitOwnerId, id: string): ActionResult;
  setOutfitSlot(
    owner: import('../../domain/bots/outfitter.ts').OutfitOwnerId,
    id: string,
    slot: import('../../data/schema.ts').EquipSlot,
    enabled: boolean,
  ): ActionResult;
  setOutfitSlotsAll(owner: import('../../domain/bots/outfitter.ts').OutfitOwnerId, id: string, enable: boolean): ActionResult;
  setOutfitDisabled(owner: import('../../domain/bots/outfitter.ts').OutfitOwnerId, id: string, disabled: boolean): ActionResult;
  selectOutfit(owner: import('../../domain/bots/outfitter.ts').OutfitOwnerId, id: string | null): ActionResult;
  wearOutfit(owner: import('../../domain/bots/outfitter.ts').OutfitOwnerId, id: string): OutfitWearResult;
  unwearOutfit(owner: import('../../domain/bots/outfitter.ts').OutfitOwnerId, id: string): OutfitWearResult;
  toggleOutfit(owner: import('../../domain/bots/outfitter.ts').OutfitOwnerId, id: string): OutfitWearResult;
  wearOutfitByName(name: string, opts?: {
    owner?: import('../../domain/bots/outfitter.ts').OutfitOwnerId;
    party?: boolean;
  }): OutfitWearResult;
  generateOutfit(statId: import('../../domain/bots/outfitter.ts').OutfitStatId, opts?: {
    owner?: import('../../domain/bots/outfitter.ts').OutfitOwnerId;
    name?: string;
    party?: boolean;
  }): ActionResult<{ id: string; name: string }>;
  setOutfitActionSlot(bar: number, slot: number, name: string | null): void;
  /** Place a consumable on the raid bar. Player or any companion must hold it (or it is already on the bar). */
  setGlobalItemSlot(slot: number, entry: number | null): void;
  /** Place an outfit name on the raid bar (party wear on fire). */
  setGlobalOutfitSlot(slot: number, name: string | null): void;
  clearGlobalActionSlot(slot: number): void;
  /** Fire every filled raid-bar slot for the living raid. */
  fireGlobalActionBar(): { tried: number };
  fireGlobalActionSlot(slot: number): { tried: number };
  syncOutfitterSpecials(): void;
  runOutfitterCommand(raw: string, opts?: { party?: boolean }): OutfitWearResult;
  // Macros (the MacroFrame). `character` lives on the save; `account` is shared by every character.
  /** Macros in one scope, or (no argument) character macros followed by account macros. */
  macros(scope?: MacroScope): MacroDef[];
  macroById(id: string): MacroDef | null;
  /** Name lookup for `{Other}` invocation and #showtooltip. Character macros win a tie. */
  macroByName(name: string): MacroDef | null;
  /** Create (no id) or overwrite (existing id). Normalizes name/icon/body; enforces the 18 cap. */
  saveMacro(
    scope: MacroScope,
    macro: { id?: string; name: string; icon?: string; body?: string },
  ): ActionResult<{ id: string }>;
  /** Delete a macro AND clear it from every action bar / form page. */
  deleteMacro(id: string): ActionResult;
  /** Bind `key` (or null to clear) to a bar/slot. Keys are unique across all bars. */
  setActionKey(bar: number, slot: number, key: string | null): void;
  /** Add another action bar (up to the max). */
  addActionBar(): ActionResult;
  /** Remove the last action bar (never the first). */
  removeActionBar(): ActionResult;
  // Train a riding rank at a zone riding trainer. `rankOrSpellId` is a rank (75|150), a skill-grant
  // spell id or a trainer wrapper id. Riding NPCs sit in zone.ridingTrainers, not `trainers`.
  trainRiding(trainerNpcEntry: number, rankOrSpellId: number): ActionResult<{ rank: number; spent: number }>;
  /** Use a mount item from bags (does not consume the item). */
  useMount(itemEntry: number): ActionResult;
  /** Dismount if mounted. */
  dismount(): ActionResult;
  // Professions (Phase 4)
  /** Train (or rank up) a profession at the given profession trainer. */
  learnProfession(profTrainerEntry: number): ActionResult;
  // Unlearn a trained profession (skill + its recipes/formulas). Free; frees a primary slot. Classic
  // skills-panel unlearn — irreversible.
  unlearnProfession(skill: SkillLine): ActionResult;
  // ScriptDev npc_prof_blacksmith / npc_prof_leather gossip hello for specialization learn/unlearn. Pure
  // menu surface; select via {@link selectProfessionSpec}. Cite: npc_professions.cpp GossipHello_*.
  professionSpecGossip(trainerEntry: number): {
    script: 'npc_prof_blacksmith' | 'npc_prof_leather' | null;
    items: Array<{ kind: string; action: number; costCopper?: number; cite: string }>;
    cite: string;
  };
  // Apply a specialization gossip select (learn / unlearn / confirm), mutating the spellbook and
  // gold. Cite: npc_professions.cpp SendActionMenu_*; LEARN_SPELL EffectTriggerSpell.
  selectProfessionSpec(
    trainerEntry: number,
    opts: { sender: number; action: number; equippedOk?: boolean },
  ): ActionResult<{
    phase: string;
    /** IR kind consumed by the host (`learn_armor`, `trade`, …). */
    kind?: string;
    grantedSpellId?: number;
    removedSpellId?: number;
    confirmCostCopper?: number;
    knownSpecializationSpells: number[];
    blacksmithUnlearnGap?: boolean;
    /** Scripted GOSSIP_ACTION_TRAIN → open trainer list (SEND_TRAINERLIST). */
    openTrainer?: boolean;
    /** Scripted GOSSIP_ACTION_TRADE → open vendor list (SEND_VENDORLIST). */
    openVendor?: boolean;
  }>;
  // ScriptDev npc_innkeeper gossip hello (What to do / Trick or Treat). Cite: npcs_special.cpp:771-788
  // GossipHello_npc_innkeeper.
  innkeeperGossip(nowMs?: number): {
    items: Array<{ kind: string; action: number; cite: string }>;
    cite: string;
    holidayHallowsEnd: boolean;
  };
  // Apply innkeeper gossip select — what_to_do text or Trick or Treat cast. Cite: npcs_special.cpp:791-811
  // GossipSelect_npc_innkeeper.
  selectInnkeeperGossip(
    action: number,
    nowMs?: number,
  ): ActionResult<{
    phase: string;
    textId?: number;
    castSpellId?: number;
    closeMenu?: boolean;
    /** SEND_GOSSIP_MENU body for what_to_do (TEXT_ID_WHAT_TO_DO). */
    flavor?: string;
  }>;
  // Free apprentice starter recipes (orange≤1 trainer) for already-trained professions. Idempotent repair
  // for saves trained before auto-grant on learnProfession.
  ensureProfessionStarters(): ActionResult<{ granted: boolean }>;
  /** Learn a recipe (from a trainer listing). */
  learnRecipe(recipeId: number, trainerEntry?: number): ActionResult;

  // Guide-screen test grants (devGrant.ts): no gate, no trainer, no cost. Scaffolding.
  /** Put `qty` of an item in the bags, honouring bag space, unique and MaxCount. */
  devGrantItem(entry: number, qty?: number): ActionResult<{ added: number }>;
  /** Accept if needed, satisfy every objective, then turn the quest in for its rewards. */
  devCompleteQuest(entry: number): ActionResult<{ xp: number; money: number }>;
  /** Train a profession line straight to its highest rank cap; `recipes` also learns every recipe. */
  devLearnProfession(skill: SkillLine, opts?: { recipes?: boolean }): ActionResult<{ cap: number; recipes: number }>;
  /** Learn one recipe free, skipping the trainer and the orange-skill gate. */
  devLearnRecipe(recipeId: number): ActionResult;
  /** Learn a recipe by USING a recipe item (Plans:/Pattern:/…) from bags - consumes the item. */
  learnRecipeFromItem(itemEntry: number): ActionResult<{ recipeId: number; name: string }>;
  // Teach a companion a recipe from a Plans/Pattern/… item in YOUR bags (consumes one). Companion must have
  // the profession; drop recipes are never auto-granted.
  learnRecipeFromItemOnCompanion(
    companionId: string,
    itemEntry: number,
  ): ActionResult<{ recipeId: number; name: string }>;
  /** Teach a companion an enchant formula from a Formula: item in YOUR bags (consumes one). */
  learnEnchantFromItemOnCompanion(
    companionId: string,
    itemEntry: number,
  ): ActionResult<{ enchantId: number; name: string }>;
  // Read a class book / tome / codex / libram ON a companion, consuming one from YOUR bags. Gated by
  // the item's AllowableClass + RequiredLevel and the taught spell's reqLevel against THEIR level.
  learnSpellFromItemOnCompanion(
    companionId: string,
    itemEntry: number,
  ): ActionResult<{ spell: number; name: string }>;
  // Read a pet-training book ON a companion (warlock Grimoire, hunter pet tome) - consumes one from YOUR
  // bags. The rank is character-wide on them, so a re-summoned pet keeps it.
  learnPetSpellFromItemOnCompanion(
    companionId: string,
    itemEntry: number,
  ): ActionResult<{ spell: number; name: string }>;
  // Everything the party can do with a companion's quests where it is standing right now — an
  // item-started accept out of their own bags, or a completed turn-in. Status is per body.
  companionQuestOffers(companionId?: string): CompanionQuestOffer[];
  /** Put a quest in ONE companion's log, gated by their level, class, race and standings. */
  acceptCompanionQuest(companionId: string, entry: number): ActionResult;
  // Hand in a companion's completed quest. Objective items leave THEIR bags; reward items,
  // reputation, XP and rewSpells land on them, and the money pays you.
  turnInCompanionQuest(
    companionId: string,
    entry: number,
    rewardChoice?: number,
  ): ActionResult<{ xp: number; money: number; items: { item: number; count: number }[]; rep: { faction: number; delta: number }[]; leveledTo: number[] }>;
  /** Drop a quest from a companion's log (abandon). */
  abandonCompanionQuest(companionId: string, entry: number): ActionResult;
  // Raise a profession one tier by reading a tier book (Expert Cookbook → Expert Cooking). Free,
  // consumes the book, and refuses when the prior tier is untrained. See itemTeaches.ts.
  learnProfessionRankFromItem(itemEntry: number): ActionResult<{ skill: SkillLine; name: string }>;
  // Harvest a gather node in the current zone. `nowMs` drives depletion: a node holds a few charges then
  // respawns after a cooldown, so a spent node refuses until it's back.
  gather(nodeId: number, nowMs?: number, opts?: LootHoldOpts): ActionResult<{ yielded: LootDrop[]; skillUp?: number; workedBy?: string; depleted: boolean; chargesLeft: number; respawnMs: number; held?: PendingLoot }>;
  /** Whether a node can be harvested right now (skill/tool/depletion), for the UI. */
  gatherStatus(nodeId: number, nowMs: number): { ok: boolean; reason?: string; respawnMs: number; chargesLeft: number };
  /** Skin the current skinnable corpse, if any. */
  skin(opts?: LootHoldOpts): ActionResult<{ yielded: LootDrop[]; skillUp?: number; workedBy?: string; held?: PendingLoot }>;
  // Pick Pocket (921) a living creature; rogue + stealth. Loot id from `creature.pickpocketLootId`
  // else `opts`. A resisted cast returns `{ ok: false, aggro: true }` — the pocket is not spent, and
  // the caller decides whether the mob turns on you. Cite: SpellEffects.cpp:2673 normal spell resist.
  pickPocket(
    creatureEntry: number,
    opts?: { pickpocketLootId?: number; nowMs?: number },
  ): { ok: true; drops: LootDrop[]; goldCopper?: number; aggro?: boolean }
    | { ok: false; reason: string; aggro?: boolean };
  // Use a world GameObject (quest node, chest, locked container, questgiver): checks key/lock,
  // advances objectTargets, yields loot. `opts` may be LootHoldOpts or a bare nowMs (KI-807).
  interactObject(objectEntry: number, opts?: LootHoldOpts | number): ActionResult<{
    yielded: LootDrop[];
    /** FO2: quest entries this GO can start for the player right now. */
    questsOffered?: number[];
    /** FO2: complete quest entries this GO can turn in right now. */
    questsTurnIn?: number[];
    // FO2: active incomplete quests this GO would finish — honest in-progress feedback, never listed
    // in questsTurnIn. Cite: QuestHandler.cpp getDialogStatus DIALOG_STATUS_INCOMPLETE.
    questsIncomplete?: number[];
    /** Key item entry consumed to open a LOCK_KEY_ITEM lock, when one was used. */
    keyUsed?: number;
    // Herb/mine GO open: new profession skill value when a skill-up landed (same path as gather() / CMaNGOS
    // EffectOpenLock → UpdateGatherSkill). KI-645.
    skillUp?: number;
    // The party/raid companion whose skill worked the node, when it was not the player's. The skill point
    // went to them. Cite: domain/professions/partyWork.ts pickPartyWorker.
    workedBy?: string;
    /** With `{ hold: true }`: the drops are HELD in the loot container, not in the bags. */
    held?: PendingLoot;
    /** Type-11 tram / type-15 boat-zep: the player stepped aboard; the depart follows on arrival. */
    boarded?: boolean;
    /** Type-11 tram / type-15 boat-zep: destination zone after board. */
    destination?: string;
    /** Transport hop length (wait + crossing) in ms from the travel/transports bake. */
    travelMs?: number;
    /** TEXT Use: page_text id the host must open. Cite: GameObject.h:159 text.pageID. */
    pageId?: number;
    /** MAILBOX Use: host opened the inbox (MailHandler.cpp:536–545 HandleGetMailList). */
    mailboxOpen?: boolean;
    /** Waiting deliveries listed at that open (state.mailbox). */
    mailbox?: Mailbox;
  }>;
  // Open a bagged container (bag/box/clam/crate/lockbox): roll its item_loot_template into the bags
  // and consume it, refusing with the client's own reason. Cite: SpellHandler.cpp:162.
  openContainerItem(slotIndex: number, opts?: LootHoldOpts): ActionResult<{
    yielded: LootDrop[];
    /** Rolled but undeliverable because the bags were full (direct-to-bags path only). */
    spilled: LootDrop[];
    /** Key item entry consumed to open a locked container, when one was used. */
    keyUsed?: number;
    /** New Lockpicking value when the player picked it and trained a point. */
    skillUp?: number;
    /** The party/raid rogue who picked it, when it was not the player. */
    openedBy?: string;
    /** With `{ hold: true }`: the contents are HELD, not in the bags — take them via takeLoot. */
    held?: PendingLoot;
  }>;

  // ---- The loot container (WoW's LootFrame) -------------------------------------------------
  // Put a haul in by hand; anything still held from a previous source is collected into the bags.
  openLoot(info: LootSourceInfo, drops: readonly LootDrop[], copper?: number): PendingLoot;
  /** What the open container is still holding, or null. */
  pendingLoot(): PendingLoot | null;
  /** Take one held row into the bags (`emptied` when that was the last thing in there). */
  takeLoot(index: number): ActionResult<{
    item: number; count: number; remaining: number; emptied: boolean; mailed?: boolean; sold?: boolean; destroyed?: boolean;
  }>;
  /** Take the held money row. */
  takeLootMoney(): ActionResult<{ copper: number; emptied: boolean }>;
  /** Take everything that fits; rows that do not fit stay held and are counted in `remaining`. */
  takeAllLoot(): ActionResult<{
    taken: Array<{ item: number; count: number }>; copper: number; remaining: number; emptied: boolean;
  }>;
  // Close the window. Outdoor/corpse/node: discard leftovers. Inventory container: keep remainder held (bag
  // contents must not vanish).
  closeLoot(): ActionResult;
  /** Craft a known recipe, consuming reagents and rolling a skill-up. */
  craft(recipeId: number): ActionResult<{ produced: LootDrop; skillUp?: number; spent?: number }>;
  /** Craft a known recipe repeatedly - as many as reagents, the purse for vendor goods and bag space allow. */
  craftAll(recipeId: number): ActionResult<{ crafted: number; produced: LootDrop; skillBefore?: number; skillAfter?: number; spent?: number }>;
  // Enchanting
  /** Learn an enchant formula (from an enchanting-trainer listing). */
  learnEnchant(enchantId: number, trainerEntry?: number): ActionResult;
  /** Learn an enchant formula by USING a Formula: item from bags - consumes the item. */
  learnEnchantFromItem(itemEntry: number): ActionResult<{ enchantId: number; name: string }>;
  // Apply a known enchant to the item in `slot`, consuming reagents (needs a rod of its tier). Optional
  // `companionId` targets a party companion's paperdoll instead of yours.
  enchantItem(enchantId: number, slot: EquipSlot, companionId?: string): ActionResult<{ skillUp?: number }>;
  // Disenchant a bagged item into materials, rolling a skill-up. The worker is the group's — you,
  // then any roster enchanter covering the band. Mats land in YOUR bags; `workerId` pins one.
  disenchant(
    itemEntry: number,
    opts?: { workerId?: string },
  ): ActionResult<{ yielded: LootDrop[]; skillUp?: number; worker?: string }>;
  // Disenchant a SPECIFIC stack by slot index, not the first stack of that entry: two "Archer's
  // Jerkin" with different suffixes are different items. Same contract as bankDepositStack.
  disenchantStack(
    slotIndex: number,
    opts?: { workerId?: string },
  ): ActionResult<{ yielded: LootDrop[]; skillUp?: number; worker?: string }>;
  // Disenchant a stack out of a COMPANION's bags. Soulbound gear cannot come to you, but the mats
  // it yields carry no bind, so the item breaks down where it lies and the dust lands in your bags.
  disenchantCompanionBagStack(
    id: string,
    slotIndex: number,
    opts?: { workerId?: string },
  ): ActionResult<{ yielded: LootDrop[]; skillUp?: number; worker?: string }>;
  /** Move items between the backpack and the bank. */
  bankDeposit(itemEntry: number, qty?: number): ActionResult<{ moved: number }>;
  bankWithdraw(itemEntry: number, qty?: number): ActionResult<{ moved: number }>;
  /** Move a *specific stack* (by its slot index in the array) between backpack and bank.
   *  Default qty moves the entire chosen stack (the tap behavior). */
  bankDepositStack(slotIndex: number, qty?: number): ActionResult<{ moved: number }>;
  bankWithdrawStack(slotIndex: number, qty?: number): ActionResult<{ moved: number }>;
  /** Purchase the next bank bag slot (escalating gold cost, WoW-style). */
  buyBankBagSlot(): ActionResult<{ spent: number }>;
  /** Slot a bag from the bags into a purchased bank bag slot (grows bank capacity). */
  equipBankBag(itemEntry: number, slotIndex: number): ActionResult;
  /** Remove the bag in a bank bag slot, returning it to the bags. */
  unequipBankBag(slotIndex: number): ActionResult;
  // Step into a dungeon's portal, beginning a fresh run (level- and lockout-gated). Three DR axes,
  // never HP multipliers: `routeDensity`, `pullFusion`, and rest via GameState.squadStrategy.
  enterInstance(
    dungeonId: string,
    nowMs?: number,
    opts?: {
      routeDensity?: RouteDensity;
      pullFusion?: PullFusion;
      // Bring the bench in as a RAID, up to `instance_template.maxPlayers - 1`. Off by default:
      // your party is your party, and a sourced 10-man used to drag everyone you owned along.
      asRaid?: boolean;
      /** Alternate world door (areatrigger_teleport id) on this InstanceDef. */
      entranceTriggerId?: number;
    },
  ): ActionResult;
  // D1 auto-first dungeon mode: auto-resolve every remaining encounter in order, resting to full
  // between pulls and stopping on a wipe. `keepLogs` attaches each pull's events for replay.
  runFullDungeon(opts?: { keepLogs?: boolean }): ActionResult<{ summary: DungeonRunSummary }>;
  // D2 squad (dev/test convenience): recruit a synthetic companion of `cls`, outside the world pool.
  // Level-syncs to the player like a v19 companion.
  recruitCompanion(
    cls: number,
    role: SquadRole,
    // Kit profile, the same axis as an inn hire (botGear GEAR_PROFILES). Omitted uses the default;
    // without it the dev recruiter shipped NAKED companions. Cite: docs/archive/raids/PLAN.md §7.8.
    gearProfile?: GearProfile,
  ): ActionResult<{ id: string; name: string; benched?: boolean }>;
  // D4: dismiss to the ROSTER, not oblivion - the bot keeps its gear, level and XP (their loot stays
  // theirs) and can be re-hired at any inn.
  dismissCompanion(id: string): ActionResult;
  // Seat a benched companion into the 5-man party. Already owned — no inn, no gold. Party-full still
  // refuses (bench someone first). Combat refuses; the instance starting screen does not.
  activateCompanion(id: string): ActionResult<{ id: string; name: string }>;
  /** The player's own role for squad runs (report flavor + grades). */
  setSquadRole(role: SquadRole): ActionResult;
  /** D3 group-leader strategy toggle (careful/aggressive run pacing). */
  setSquadStrategy(strategy: SquadStrategy): ActionResult;
  // PallyPower tab. The board is derived (roster x class), the three setters write the overrides;
  // a null cell / aura is "back to auto". Cite: engine/game/paladinBoard.ts.
  paladinAssignments(): import('../../domain/rotation/paladinBuffs.ts').PaladinAssignments;
  paladinBoard(): import('./paladinBoard.ts').PaladinBoard;
  setPaladinBlessing(
    paladinKey: string,
    col: string,
    cell: import('../../domain/rotation/paladinBuffs.ts').BlessingCell | null,
  ): ActionResult<{ board: import('./paladinBoard.ts').PaladinBoard }>;
  setPaladinAura(
    paladinKey: string,
    aura: import('../../domain/rotation/paladinBuffs.ts').PaladinAura | null,
  ): ActionResult<{ board: import('./paladinBoard.ts').PaladinBoard }>;
  // A wheel notch or a swipe over one icon: `dir` is +1 down the cycle, -1 up it.
  stepPaladinBlessing(
    paladinKey: string,
    col: string,
    dir: 1 | -1,
  ): ActionResult<{ board: import('./paladinBoard.ts').PaladinBoard }>;
  stepPaladinAura(
    paladinKey: string,
    dir: 1 | -1,
  ): ActionResult<{ board: import('./paladinBoard.ts').PaladinBoard }>;
  // "Auto sort": write every cell at once — the sourced chain per column, and an improved family
  // handed to the paladin that took the talent. Refuses with no paladin in the party.
  autoSortPaladinAssignments(): ActionResult<{ board: import('./paladinBoard.ts').PaladinBoard }>;
  clearPaladinAssignments(): ActionResult<{ board: import('./paladinBoard.ts').PaladinBoard }>;
  // Cast what the board now says, skipping anything a body already carries from that paladin, and
  // re-author every paladin's keep-up rows. Returns the chips cast. Called when the grid changes.
  refreshPaladinBuffs(): number;
  // S4C: per-companion AoE ↔ single-target knob (`auto` | `aoe` | `single`). Mutates the live companion
  // object so an open fight's action provider re-reads next GCD.
  setCompanionAoeMode(id: string, mode: CompanionAoeMode): ActionResult;
  /** S4C: per-companion off-heal toggle (hybrid DPS emergency heals). Same live-object semantics. */
  setCompanionOffHeal(id: string, on: boolean): ActionResult;
  // ICH4: per-companion XP lock. When true, outdoor/dungeon XP grants no-op. Free toggle (design §3.4).
  // Missing on legacy companions → treated as unlocked.
  setCompanionXpLocked(id: string, locked: boolean): ActionResult;
  /** S4C: party-wide shortcut — set every companion's aoeMode (e.g. "everyone AoE"). */
  setAllCompanionsAoeMode(mode: CompanionAoeMode): ActionResult;
  // Gear the bot fast: auto-equip strict upgrades from its OWN bags first, then from yours (an item taken
  // from your bags becomes the bot's).
  equipCompanionBest(id: string): ActionResult<{ equipped: number }>;
  // The innkeeper in the CURRENT world zone (first of zone.innkeepers); undefined inside instances.
  // Fail-open before the ETL lands: a settlement offers a synthetic `{ entry: 0 }` innkeeper.
  innkeeperHere(): { entry: number; name: string } | undefined;
  // D4 world pool: the inn's hire slate — same-faction bots within ±2 levels (the window widens
  // when few match), each with a premade spec and spawn gear. Squad and roster bots are excluded.
  innCandidates(): InnCandidate[];
  // DEV: build a raid-shaped test roster for `dungeonId` from its tier template — free, level 60,
  // role-matched premades, kept in `state.raidRoster`. `tier` overrides the raid's entry tier.
  buildRaidRoster(opts: { dungeonId: string; tier?: RaidTierId }): ActionResult<{
    dungeonId: string;
    name: string;
    tier: RaidTierId;
    tierLabel: string;
    size: number;
    built: number;
    comp: string;
    gearScore: number;
  }>;
  /** DEV: drop the raid test roster. Never touches squad or botRoster. */
  clearRaidRoster(): ActionResult<{ cleared: number }>;
  // Who walks into `dungeonId` from the companions you own. Empty `ids` clears the pick and the
  // door falls back to auto. Does not require an inn — this is seating, not a re-hire.
  setInstanceRoster(dungeonId: string, ids: readonly string[]): ActionResult<{
    dungeonId: string;
    picked: number;
    cap: number;
  }>;
  /** Match owned companions to this instance's template (or a 5-man quota). UBRS keeps a mage. */
  fillInstanceRoster(dungeonId: string): ActionResult<{
    dungeonId: string;
    picked: number;
    cap: number;
    mage: boolean;
  }>;
  /** Drop the hand-picked lineup. The door goes back to auto. */
  clearInstanceRoster(): ActionResult<{ cleared: number }>;
  // Raid group for the next 10/20/40-man. Empty `ids` is a real pick. Does not require an inn — seating,
  // same as `setInstanceRoster`.
  setRaidLineup(size: 10 | 20 | 40, ids: readonly string[]): ActionResult<{
    size: 10 | 20 | 40;
    picked: number;
    cap: number;
  }>;
  /** Best tank / healer / damage from what you own, up to this raid size. */
  fillRaidLineup(size: 10 | 20 | 40): ActionResult<{
    size: 10 | 20 | 40;
    picked: number;
    cap: number;
  }>;
  /** Drop the raid group. Enter-as-raid goes back to auto-fill. */
  clearRaidLineup(): ActionResult<{ cleared: number }>;
  /** DEV: what `state.raidRoster` currently holds, for the UI read-out. */
  raidRosterInfo(): {
    dungeonId: string;
    name: string;
    tier: RaidTierId;
    tierLabel: string;
    size: number;
    built: number;
    comp: string;
    gearScore: number;
    levels: { min: number; max: number };
  } | null;
  // Permanently let companions go — the only path that REMOVES them, where `dismissCompanion` only
  // benches. Refunds each hire price. Pass `ids`, or `maxLevel` to sweep everyone at or below it.
  releaseCompanions(opts: { ids?: readonly string[]; maxLevel?: number }): ActionResult<{
    released: number;
    refundCopper: number;
    names: string[];
  }>;
  // Hire search across the whole same-faction population. Returns [] when `filters` narrows nothing — the
  // caller renders "choose filters, then search", never a wall of 2500 faces.
  searchInnCandidates(filters: BotSearchFilters): InnCandidate[];
  // D4 / ICH2: hire a bot. A slate bot joins at ITS level in its spawn gear and pays
  // hireCostCopper; a roster bot re-joins free. A full party benches the hire rather than refusing.
  hireCandidate(
    botId: string,
    role: SquadRole,
  ): ActionResult<{ id: string; name: string; costCopper: number; benched?: boolean }>;
  // The 1v1 as ONE auto-battler fight: a duelist near your bracket-1 rating, seated where a mob
  // would be. Hands back a live session to mount, never resolving it; `settleArenaRating` moves the
  // Elo and `settleArenaDuel` stamps the highest rung beaten.
  arenaDuel(): ActionResult<{
    session: CombatSession;
    /** The comp beaten-or-not, for `settleArenaDuel`. */
    compId: string;
    /** Your rating going in, and the duelist's own - the two numbers `settleArenaRating` needs. */
    rating: number;
    oppRating: number;
    targetName: string;
    targetLevel: number;
    opponent: {
      race: number;
      cls: number;
      gender?: 0 | 1;
      equipped: Character['equipped'];
    };
  }>;
  // A team bracket (2v2, 3v3, 5v5) as ONE auto-battler fight: you plus the resolving allies (merc
  // backfill included) against an authored comp with pvp brains. Elimination, not yield-at-1-HP;
  // settled for honor. No `tier`: the bracket's rating picks the comp AND its tier.
  arenaMatch(opts?: {
    /** 2, 3 or 5. Absent = 2, the bracket that mounted here first. */
    bracket?: import('../../domain/bg/arenaComps.ts').ArenaBracket;
    allies?: string[];
  }): ActionResult<{
    session: CombatSession;
    /** Echoed back so the settle moves the right bracket's rating. */
    bracket: import('../../domain/bg/arenaComps.ts').ArenaBracket;
    /** The comp's own name - a factual team label, e.g. "Warrior and priest". */
    name: string;
    compId: string;
    rating: number;
    oppRating: number;
    opponents: {
      name: string;
      level: number;
      race: number;
      cls: number;
      gender?: 0 | 1;
      equipped: Character['equipped'];
    }[];
    /** Your own seats, in ally_0.. order — bracket-1 of them. */
    allies: {
      name: string;
      race: number;
      cls: number;
      gender?: 0 | 1;
      equipped: Character['equipped'];
    }[];
  }>;
  /** Advance the gauntlet rung for a finished `arenaDuel`. Honor is a separate awardDuelHonor. */
  settleArenaDuel(compId: string, won: boolean): { rung: number; of: number; advanced: boolean };
  // The Elo for a finished arena match, in any bracket. Runs on a LOSS as well as a win - that is
  // what makes it a rating and not the rung. `opponent` is a rating, or a comp id to resolve one.
  settleArenaRating(
    bracket: import('../../domain/bg/arenaComps.ts').ArenaBracket,
    opponent: number | string | null,
    outcome: import('../../domain/bg/arenaRating.ts').ArenaOutcome,
  ): { rating: number; before: number; delta: number };
  // ICH5 tavern trial: an inn-gated duel against a hire-slate candidate or a roster/squad companion.
  // Yield at 1 HP, and no gold, loot, XP or durability loss. Cite: domain/run/duel.ts.
  tavernDuel(targetId: string): ActionResult<{
    session: CombatSession;
    targetName: string;
    /** The opponent's frame identity — a player-shaped foe portrait, as the BG builds its own. */
    opponent: {
      race: number;
      cls: number;
      gender?: 0 | 1;
      equipped: Character['equipped'];
    };
  }>;
  // Switch a companion onto another premade playerbot talent build for their class. Free respec —
  // talents re-derive from the link at their level, and the rotation is left alone.
  setCompanionSpec(id: string, specIdx: number): ActionResult<{ name: string }>;
  // Stamp a classic talent string onto a companion. Overrides their premade specIdx until a premade/role
  // restamp clears it. Free, like setCompanionSpec.
  setCompanionTalentLink(id: string, link: string | null): ActionResult<{ name: string }>;
  // Change a hired companion's squad role anytime, not only at hire. Free: re-stamps the matching
  // premade and rebuilds a non-custom rotation. Mid-fight it also dirties their live decision.
  setCompanionRole(id: string, role: SquadRole): ActionResult;
  // Companion pet selection (questless): hunter beast ≤ companion level, or unlocked warlock demon (Imp 1 /
  // VW 10 / Succubus 20 / Felhunter 30). Rebuilds kit + ranks.
  setCompanionPet(id: string, creatureEntry: number): ActionResult<{ name: string }>;
  /** Toggle autocast on a companion's pet ability (same name-chain rules as player pets). */
  setCompanionPetAutocast(id: string, spellId: number, on?: boolean): ActionResult<{ enabled: boolean }>;
  // Equip ONE item onto companion `id` under the real equipItem rules, sourcing the bot's bags
  // first then yours. Displaced gear goes to the BOT's bags. `preferred` targets a specific slot.
  equipCompanionSlot(id: string, itemEntry: number, preferred?: EquipSlot): ActionResult<{ slot: EquipSlot }>;
  /** Unequip one companion paperdoll slot into the BOT's bags (their loot stays theirs). */
  unequipCompanionSlot(id: string, slot: EquipSlot): ActionResult;
  // Upgrade suggestions for a companion over its own bags AND your bags (same shape as
  // suggestedEquipmentUpgrades, scored via findUpgrades).
  companionUpgradesFor(id: string, playerInv?: Inventory): Array<{ entry: number; slot: EquipSlot; randomPropertyId?: number; currentEntry?: number; delta: number; from: 'bot' | 'player' }>;
  // Roster-wide gearing: every companion (party AND benched) scored against their own bags, your
  // bags and your bank, with shared stacks claimed by their best taker.
  squadUpgradePlan(): SquadUpgradeRow[];
  /** Apply the plan best-first, recomputing after each equip. Withdraws bank rows as needed. */
  applySquadUpgrades(max?: number, allowKeys?: Iterable<string>): ActionResult<{ equipped: number }>;

  // Share consumables: every shareable stack in your bags split across the party or the raid lineup
  // under the saved rules (auto = weightscale gain, like squadUpgradePlan). Companions carrying them
  // drink and throw them through their own bag item rules (syncCompanionBagItemRules).
  consumableShareState(): import('../../domain/bots/consumableShare.ts').ConsumableShareState;
  consumableShareMembers(): import('../../domain/bots/consumableShare.ts').ShareMember[];
  /** Per bag stack: who takes how many, what you keep, and why nobody can when nobody can. */
  squadConsumableDetail(): import('../../domain/bots/consumableShare.ts').SharePlanEntry[];
  squadConsumablePlan(): import('../../domain/bots/consumableShare.ts').ShareRow[];
  /** Hand planned rows over — all of them, one entry, or one rank ladder. A full bag is skipped and named. */
  applySquadConsumablePlan(pick?: number | { entry?: number; key?: string }): ActionResult<{ moved: number; rows: number; skipped: string[] }>;
  setConsumableShareRule(key: string, rule: import('../../domain/bots/consumableShare.ts').ShareRule | null): ActionResult;
  setConsumableShareScope(scope: import('../../domain/bots/consumableShare.ts').ShareScope): ActionResult;
  setConsumableShareIncludeYou(on: boolean): ActionResult;
  setConsumableShareCat(cat: import('../../domain/bots/consumableShare.ts').ShareCategory, on: boolean): ActionResult;

  // ---- companion professions + send-out missions ----------------------------------------

  /** Resolved trade skills for a companion (assigned set, else the seed-derived one). */
  companionProfessionsOf(id: string): {
    cap: number;
    /** True once the player has assigned professions (the derived set is frozen from then on). */
    assigned: boolean;
    /** `rank` is the trainer rank they hold (Apprentice … Artisan); absent when the line is new. */
    lines: Array<{ line: SkillLine; current: number; max: number; kind: string; rank?: string }>;
  } | null;
  /** Take up a profession. Same 2-primary limit the player has. */
  learnCompanionProfession(id: string, line: SkillLine): ActionResult;
  unlearnCompanionProfession(id: string, line: SkillLine): ActionResult;
  /** Shared mission energy remaining (0..100), after daily 06:00 refill. */
  companionPartyEnergy(nowMs?: number): number;
  /** Recommended zones for a companion's gathering skill. */
  companionMissionZones(
    id: string,
    skill: MissionSkill,
  ): Array<{ zoneId: string; zoneName: string; preview: string[]; targetCount: number }>;
  // Send a companion to a zone to mine / herb / skin for N hours. Costs shared energy (10 per hour) up
  // front; resolution is by wall clock, so it completes while closed.
  sendCompanionOnMission(
    id: string,
    skill: MissionSkill,
    zoneId: string,
    hours: number,
    nowMs?: number,
  ): ActionResult<{ mission: CompanionMission }>;
  /** Bring them home early. Forfeits the payout; the energy is not refunded. */
  recallCompanionMission(id: string): ActionResult;
  /** Claim a finished mission: skill-ups, and materials into bags / party storage. */
  collectCompanionMission(
    id: string,
    nowMs?: number,
  ): ActionResult<{ skillUp: number; yielded: MissionYieldRow[] }>;
  // Yield + skill-up a finished (or still-away) trip would pay, from the same stamp Collect uses. Null when
  // they are not away. Away trips still report loot; the desk only shows it when done.
  previewCompanionMission(
    id: string,
    nowMs?: number,
  ): { skillUp: number; yielded: MissionYieldRow[]; progress: MissionProgress } | null;
  /** Collect every finished trip on the party and the benched roster. */
  collectAllCompanionMissions(nowMs?: number): ActionResult<{
    collected: Array<{ id: string; name: string; skillUp: number; yielded: MissionYieldRow[] }>;
  }>;
  /** Craft a known recipe as this companion (reagents from party storage). */
  craftAsCompanion(id: string, recipeId: number): ActionResult<{ product: number; count: number; skillUp?: number; spent?: number }>;
  /** Enchant gear as this companion (their skill/rod/formulas). Target is player or a companion id. */
  enchantAsCompanion(
    enchanterId: string,
    enchantId: number,
    slot: EquipSlot,
    target: { kind: 'self' } | { kind: 'companion'; id: string },
  ): ActionResult<{ skillUp?: number }>;
  // Give an item from your bags to the bot's bags. Party-internal transfer (free). Recipe items are learned
  // automatically when given.
  giveItemToBot(id: string, itemEntry: number, qty?: number): ActionResult<{ moved: number }>;
  // Use a consumable from the companion's own bags, on the companion. A weapon imbue returns
  // `needsTarget` when both hands are eligible, the same picker contract as consumeItem.
  useCompanionItem(
    id: string,
    itemEntry: number,
    opts?: { slot?: EquipSlot },
  ): { ok: true; used: number } | { ok: false; reason: string; needsTarget?: EnchantNeedsTarget };
  /** Take an item from a bot's bags into yours. Party-internal transfer (free). */
  takeItemFromBot(id: string, itemEntry: number, qty?: number): ActionResult<{ moved: number }>;
  /** Move items between the bot's bags and its own bank (their stash - expandable like yours). */
  companionBankDeposit(id: string, itemEntry: number, qty?: number): ActionResult<{ moved: number }>;
  companionBankWithdraw(id: string, itemEntry: number, qty?: number): ActionResult<{ moved: number }>;
  // Stack-exact twins of the four above: `slotIndex` indexes the SOURCE container and an omitted
  // `qty` moves that ONE stack whole. The entry-keyed versions sweep every stack of that item.
  giveItemToBotStack(id: string, slotIndex: number, qty?: number): ActionResult<{ moved: number }>;
  takeItemFromBotStack(id: string, slotIndex: number, qty?: number): ActionResult<{ moved: number }>;
  /** One stack out of one companion's bags into another's. Soulbound stays put, as when you take it. */
  moveItemBetweenBots(fromId: string, slotIndex: number, toId: string, qty?: number): ActionResult<{ moved: number }>;
  /** Destroy one stack in a companion's bags (their grid's trash, same contract as discardBagStack). */
  discardCompanionBagStack(id: string, slotIndex: number, qty?: number): ActionResult<{ discarded: number }>;
  /** Sell one stack out of a companion's bags at the open vendor. Buyback is the caller's, as for sellItemStack. */
  sellCompanionItemStack(id: string, slotIndex: number, qty?: number): ActionResult<{ earned: number; qty: number }>;
  // Buy a stack sold off a companion back into THEIR bags, paid from your purse. The buyback list is
  // the caller's, so it hands back the entry it recorded on the sale.
  buyBackCompanionStack(
    id: string,
    itemEntry: number,
    qty: number,
    refundCopper: number,
  ): ActionResult<{ qty: number }>;
  // Party storage → your bags: sweep one item out of every companion's bags and bank. Soulbound
  // stacks stay put and are reported in `bound`; `full` says your bags stopped the sweep.
  takeFromPartyStorage(itemEntry: number, qty?: number): ActionResult<{ moved: number; bound: number; full: boolean }>;
  companionBankDepositStack(id: string, slotIndex: number, qty?: number): ActionResult<{ moved: number }>;
  companionBankWithdrawStack(id: string, slotIndex: number, qty?: number): ActionResult<{ moved: number }>;
  /** Buy the bot's next bank bag slot (escalating cost, paid with YOUR gold). */
  buyCompanionBankSlot(id: string): ActionResult<{ cost: number }>;
  /** Slot a bag from YOUR bags into the bot's purchased bank bag slot (the bag becomes theirs). */
  equipCompanionBankBag(id: string, itemEntry: number, slotIndex: number): ActionResult;
  /** Move a bank bag into the bot's bags (stays the bot's property). */
  unequipCompanionBankBag(id: string, slotIndex: number): ActionResult;
  // Exit the current dungeon back to the world. A 5-man's progress is held for 30 minutes and
  // restored on re-entry inside that window; pass the same wall clock the entry path got.
  leaveInstance(nowMs?: number): ActionResult;
  // Queue into a battleground. Path B of §0: you + your chosen companions take seats, mercs backfill both
  // teams. Refused inside a dungeon, or under the bracket's minimum level.
  enterBattleground(
    bgId?: BattlegroundId,
    opts?: {
      seed?: number;
      tier?: import('../../domain/bg/bgTier.ts').BgTierId;
      allies?: string[];
    },
  ): ActionResult;
  /** Leave the battleground (the match is abandoned, exactly like leaving a real BG). */
  leaveBattleground(): ActionResult;
  /** Reset the current run's progress for another attempt (the on-demand 5-man reset). */
  resetInstance(): ActionResult;
  // Re-materialize the current run's route at a new pace WITHOUT re-entering. Refused once anything
  // is cleared, because changing density mid-run rewrites the route list `defeated` indexes into.
  setInstancePace(opts: {
    routeDensity?: RouteDensity;
    pullFusion?: PullFusion;
  }): ActionResult;
  // Begin an encounter fight inside the current instance (like beginFight, plus boss abilities).
  // `{ withSquad: true }` brings the active squad in as real allies; omitted keeps the solo session.
  beginEncounter(
    dungeonId: string,
    encounterId: string,
    opts?: {
      withSquad?: boolean;
      elapsedMs?: number;
      // Continuous floor pull (walk/aggro/skip product): skip sequential route isUnlocked. Party already
      // stands on those guids. Default false (headless hop/route scaffolding keeps sequential unlock).
      continuousFloor?: boolean;
    },
  ): ActionResult<BeginFight>;
  // S4A conveyor / Pull +1: inject the next uncleared route TRASH pack into an OPEN session, never
  // a boss. Credits the pack on win like fusion, and no-ops with a reason when nothing is pullable.
  pullAdditionalPack(
    dungeonId: string,
    session: CombatSession,
  ): ActionResult<PullAdditionalPackResult>;
  // Use an in-instance gameobject authored as an `objectGate` event. May require an inventory item;
  // multi-step gates set the flag only after needUses, and `once` defaults to once per instance.
  useInstanceObject(
    goEntry: number,
      // `ignoreRequiredItem` is the AUTO-RUN policy: `autoFireObjectGates` forces `okItem` true so a
      // key item cannot soft-lock a route (instances.ts:914-917). Never pass it from a player click.
    opts?: { ignoreRequiredItem?: boolean },
  ): ActionResult<{
    flag: string;
    already: boolean;
    uses: number;
    needUses: number;
    completed: boolean;
  }>;
  // Loot an instance GO authored on `InstanceDef.lootObjects` by baked guid, once per run per guid.
  // Rolls the baked `go:<lootId>` table with quest/condition gating, straight into the bags.
  lootInstanceObject(goGuid: number): ActionResult<{ loot: LootDrop[]; name: string }>;
  // Auction house: settle expired always. The bot tick empties the house in one sell pass, else runs
  // at most one 120s CMaNGOS slice at Chance.Sell/Buy 10%. Cite: AuctionHouseBot.cpp:166.
  refillAuctions(nowMs: number, opts?: { bot?: boolean }): void;
  /** Active listings from others + bots (excludes your own), for browsing/buying. */
  browseAuctions(nowMs: number): Auction[];
  /** Your own live listings, for cancelling. */
  ownAuctions(): Auction[];
  /** Auctions you currently hold the high bid on (your gold is escrowed there). */
  myBidAuctions(): Auction[];
  // List from bags. `stacks` posts N same-size stacks (Auctionator GetNumStacks). Charges CMaNGOS deposit
  // (sellPrice × count × time/MIN_AUCTION_TIME × 5%).
  listAuction(itemEntry: number, quantity: number, bidCopper: number, buyoutCopper: number, duration: AhDuration, nowMs: number, stacks?: number): ActionResult<{ auctionId: number; listed: number }>;
  /** Buy a listing outright: pay its buyout, receive the items. */
  buyoutAuction(auctionId: number): ActionResult<{ spent: number }>;
  /** Place a bid on a listing, escrowing the gold until you win or are outbid. */
  bidAuction(auctionId: number, amount: number, nowMs: number): ActionResult<{ bid: number }>;
  /** Cancel your own listing and reclaim the items. */
  cancelAuction(auctionId: number): ActionResult;
  /** Pull everything in the mailbox that fits into your bags; returns how many stacks moved. */
  collectMail(): ActionResult<{ moved: number; abortedFull: boolean }>;
  /** Delivered, unexpired inbox (MailHandler.cpp:559–561). Purges expired first. */
  listMail(nowMs: number): MailMessage[];
  /** Unread delivered count for the Mail tab badge. */
  unreadMailCount(nowMs: number): number;
  markMailRead(mailId: number): ActionResult;
  takeMailItem(mailId: number, nowMs?: number): ActionResult<{ remittance?: { to: string; mail: MailMessage } }>;
  takeMailMoney(mailId: number, nowMs?: number): ActionResult<{ taken: number }>;
  deleteMail(mailId: number, nowMs?: number): ActionResult;
  returnMail(mailId: number, nowMs?: number): ActionResult<{ to: string; mail: MailMessage }>;
  // Player send. One mail may carry MAX_MAIL_ITEMS stacks (crate). Postage 30c.
  // `recipientMailbox` is the destination inbox, and the returned one is what the caller persists.
  sendMailTo(opts: {
    recipientName: string;
    recipientMailbox: Mailbox;
    subject?: string;
    body?: string;
    enclosedMoney?: number;
    cod?: number;
    attachments?: readonly MailAttachment[];
    nowMs: number;
    crossFaction?: boolean;
  }): ActionResult<{ mail: MailMessage; destMailbox: Mailbox; cost: number }>;
  // Postal send queue: every attached stack rides one mail. Cite: Postal.lua:25 tray.
  sendMailBatch(opts: {
    recipientName: string;
    recipientMailbox: Mailbox;
    subject?: string;
    body?: string;
    enclosedMoney?: number;
    cod?: number;
    attachments: readonly MailAttachment[];
    nowMs: number;
    crossFaction?: boolean;
  }): ActionResult<{ mails: MailMessage[]; destMailbox: Mailbox; cost: number }>;
  snapshot(): GameState;
  /** Spend one point in the given talent (if prereqs, tier, points, and rank allow). */
  spendTalent(talentId: number): ActionResult;
  /** Refund one point from the given talent (if any spent on it). */
  refundTalent(talentId: number): ActionResult;
  // Full respec: clear all spent talent points, charging the CMaNGOS escalating trainer cost.
  // `nowMs` is wall clock for monthly decay. Cite: Player.cpp:3715 resetTalentsCost.
  respec(nowMs?: number): ActionResult<{ cost: number }>;
  // Next talent-respec price in copper (CMaNGOS ladder + monthly decay). 0 when nothing is spent (a blank
  // tree needs no reset). `nowMs` defaults to Date.now().
  respecCost(nowMs?: number): number;
  // Apply a premade playerbot talent build, replacing the talent map with the level-scaled link.
  // A paid respec when points are already spent, free when the tree is empty or already matches.
  applyPremadeSpec(specIdx: number, nowMs?: number): ActionResult<{ name: string; cost: number }>;
  /** Store a named talent string for this class. Caps at MAX_TALENT_BUILDS. */
  saveTalentBuild(name: string, cls: number, link: string): ActionResult<{ id: string; name: string }>;
  /** Drop a saved loadout. Companions that already copied the string keep it. */
  deleteTalentBuild(id: string): ActionResult;
  // Apply a saved loadout to the player. Paid respec when the tree is spent, same ladder as
  // `applyPremadeSpec`.
  applyTalentBuild(id: string, nowMs?: number): ActionResult<{ name: string; cost: number }>;
  // Apply a classic talent string to the player at their current level. Same cost rules as
  // `applyTalentBuild`.
  applyTalentLink(link: string, nowMs?: number): ActionResult<{ name: string; cost: number }>;
  // NPC talk / right-click: gossip options from the baked menu id when present, else today's
  // quest/vendor/trainer/taxi/innkeeper shortcuts. Pass `menuId` explicitly; never invents lines.
  npcGossip(npcEntry: number, opts?: { menuId?: number }): GossipMenu;
  // Closest graveyard for the current zone's AreaTable id + player faction. Pure bake lookup — DF owns the
  // death loop; call this for yard selection.
  closestGraveyard(pos?: { x: number; y: number; z: number }): GraveyardEntry | undefined;
  /** Whether a baked game event is active at `nowMs` (default Date.now()). */
  isGameEventActive(eventId: number, nowMs?: number): boolean;
  // Roll one pool member guid via domain/pools (not first-entry). Returns undefined when pool missing or at
  // maxLimit.
  rollPoolGuid(poolId: number, spawned?: readonly number[]): number | undefined;
  /** Entrance yardage row by areatrigger id, or all rows for a zone string. */
  entranceYard(query: { trigger: number } | { zone: string }): EntranceYardRow | EntranceYardRow[] | undefined;
  // Current session weather for a zone (default char.zoneId) — an ephemeral Map on the Game
  // instance, NOT saved. Missing → fine weather. Cite: Weather.cpp; domain/world/weather.ts.
  weather(opts?: { zoneId?: string }): WeatherState;
  // One weather regeneration step for the zone (areaId → zoneWeather rates), with injected
  // day-of-year and a fightCounter sub-seed rather than wall clock. Cite: Weather.cpp ReGenerate.
  stepZoneWeather(opts?: { zoneId?: string; dayOfYear?: number }): WeatherState;
}

// The client's persistent travel pace, a settings MODE rather than a per-journey dial: 1/2/4 is the
// fast-forward factor applied at departure; 'instant' completes a journey the moment it departs.
export type TravelPace = 1 | 2 | 4 | 'instant';

/** Options for createGame (travel / dev cheats). */
export interface CreateGameOptions {
  // Persistent travel pace applied to EVERY journey at departure. A getter is read at call time so
  // the settings control applies at once. 'instant' also unlocks `completeJourneyNow` (local only).
  travelPace?: TravelPace | (() => TravelPace);
  // Wave DF death loop. Getter is read on each defeat so the settings control applies without re-enter.
  // Default `repair-only` (immediate half-HP revive).
  deathFlowMode?: DeathFlowMode | (() => DeathFlowMode);
  // Global junk filter (all characters). Getter is read live so Settings → Loot filter applies without
  // re-enter. Default: auto-sell greys only.
  junkFilter?: JunkFilterConfig | (() => JunkFilterConfig);
  // Unpack bagged containers (clam, sack, bloated fish) as soon as they land, so junk containers do
  // not fill the bags. Live getter like junkFilter. Default true; locked and quest containers never.
  autoOpenContainers?: boolean | (() => boolean);
  // Outfitter master enable (chrome + auto specials). Live getter so Settings applies without re-enter.
  // Default true. Explicit bar clicks still wear when false.
  outfitterEnabled?: boolean | (() => boolean);
  /** Persist global junk filter when the player edits global Loot filter settings. */
  onJunkFilterChange?: (cfg: JunkFilterConfig) => void;
  /** Global auto-disenchant (all characters). Live getter; character layer is GameState.autoDisenchant. */
  autoDisenchant?: import('../../domain/professions/autoDisenchant.ts').AutoDisenchantConfig
    | (() => import('../../domain/professions/autoDisenchant.ts').AutoDisenchantConfig);
  /** Persist global auto-disenchant. */
  onAutoDisenchantChange?: (cfg: import('../../domain/professions/autoDisenchant.ts').AutoDisenchantConfig) => void;
  // Account-wide macros — the MacroFrame "General" tab, shared by every character, so they do not
  // live on the save. A live getter like junkFilter. Cite: Blizzard_MacroUI.lua:31.
  accountMacros?: MacroDef[] | (() => MacroDef[]);
  /** Persist account-wide macros (localStorage in the browser host). */
  onAccountMacrosChange?: (macros: MacroDef[]) => void;
  // Stamp world timers (aura expiry, cooldowns, mail, pickpocket restock) on the wall clock instead
  // of the fight chain. The live app sets it; headless runs keep the chain (KI-956).
  wallWorldClock?: boolean;
  // Offline time gap for timers like offline rested XP or offline aura duration decay.
  offlineTimeMs?: number;
}

