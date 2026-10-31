// Typed, indexed read access over the committed data bundle. Hollow percent-stat rows (empty
// `effects[]` + rawEffects aura 80/137) are SI5-materialized on first spell(). Cite: KI-178/179.

import type {
  DataBundle, SpellDef, CreatureDef, ItemDef, LootEntryDef, QuestDef,
  SoundTables, WorldTables,
  TrainerDef, VendorDef, CreateInfoDef, PrimaryStats, ClassLevelRow, ZoneDef, RaceDef,
  ProfessionDef, RecipeDef, GatherNodeDef, ProfTrainerDef, InstanceDef,
  EnchantDef, EnchantRodDef, DisenchantRuleDef, CompactLoot, LootTuple, CompactProfessions,
  TalentTreeDef, TalentDef, GameObjectDef, CompactSpells, CompactGameObjects, CompactItems, ItemSetDef,
  ItemEnchantDef, EnchantApplicatorDef,
  CreatureClassLvlStatsRow, PetLevelStatsRow, FactionDef, FactionTemplateDef, ReputationRankDef,
  ReputationRateDef, ReputationSpilloverDef, BotSpecDef, LockDataDef, RandomPropertyDef,
  DbScriptRow, SpellSoundStages, CreatureSoundStages, NpcVoiceStages, WeaponSoundSet, CreatureWeapon,
  CombatConditionDef, UnitConditionDef, NpcTextDef,
} from './schema.ts';
import type { CombatSkillMeta } from '../domain/character/combatSkills.ts';
import { retagBreakableStunOnSpell, retagDisorientOnSpell } from '../domain/spells/breakableStunCc.ts';
import { CUSTOM_ITEMS } from './customItems.ts';
import { applyTamingRodUseSpells } from '../domain/quests/questTameRods.ts';
import { stampMissingSpeedFromRaw } from '../engine/spells/interpreter/materialize-speed.ts';
import { stampMissingRatingBuffsFromRaw } from '../engine/spells/interpreter/materialize-rating-buffs.ts';
import { stampMissingCharmFromRaw } from '../engine/spells/interpreter/materialize-charm.ts';
import { materializeModHealthRegenInCombat } from './materializeModHealthRegen.ts';
import { materializeModDamagePercentTaken } from './materializeModDamagePercentTaken.ts';
import { materializeSpellReputation } from './materializeSpellReputation.ts';
import { withResurrectEffectsIfEmpty } from '../domain/spells/resurrectSpell.ts';
import { withPetLearnTeachesIfEmpty } from '../domain/character/spellbook.ts';
// ManaCostPercentage / NOT_SHAPESHIFT from classic-db form-attrs (SI path — no bake re-edit).
// Cite: form-attrs.ts; Spell.cpp CalculatePowerCost; KI-120 Purge / percentage-cost kit.
import { hydrateSpellFormAttrs } from '../engine/spells/interpreter/form-attrs.ts';
import { hydrateSchoolImmunityOnSpell } from '../domain/spells/mergeSchoolImmunityFromRaw.ts';
import { normalizeIceBlock } from '../engine/combat/predicates.ts';
// Lazy companion to the eager materializers below: fills a spell whose bake `effects[]` is EMPTY on
// first access. The eager passes patch specific auras onto already-populated rows.
import { fillEmptyEffectsFromRaw } from '../engine/spells/interpreter/item-triggers.ts';
// KI-562 / KI-673 / KI-762 / KI-768+: outdoor zone.huntable must not list instance/AQ/guard
// / wrong-zone / level-mismatch pollution. Runtime prune so cold PRs need no bake rewrite.
import {
  battlegroundCreatureEntrySet,
  buildOutdoorSpawnIndex,
  CLASSIC_BG_MAP_IDS,
  CLASSIC_BG_NAME_BY_MAP,
  instanceCreatureEntrySet,
  isExcludedFromOutdoorHuntable,
  shouldKeepOutdoorHuntableEntry,
  zoneSpawnLevelBand,
} from './raidInstanceCreatures.mjs';
import { getFactionReaction } from '../domain/creature/faction.ts';
import { REP_RANK } from '../domain/creature/reputation.ts';
import { isOutdoorNonGrindCreature } from '../domain/creature/outdoorHuntable.ts';
import { applyLootChanceSanity } from './applyLootChanceSanity.ts'; // KI-108
import { stripInternalNameTags } from '../domain/core/internalNameTags.ts';
import { createSkinGapFill } from './skinNodeGapFill.ts'; // KI-904/905
import {
  ensureFlightMasterCreatures,
  patchAbsurdQuestFarms,
  patchBeliaPetTrainer,
  patchBlastedLandsVendors,
  patchBogusQuestMinRepGates,
  patchCannibalizeHeal,
  patchFoodDrinkDescriptions,
  patchGarmentHealQuests,
  patchLegendsOfTheEarthQuest,
  patchWindshearVerminDamage,
  patchZoneClassTrainers, patchZoneInnkeepers, patchZoneQuestsFromStarterZones,
  remapSyntheticClassTrainers,
  normalizeSyntheticTrainerEntry,
} from '../domain/core/runtimeDataPatches.ts';
import { lockHasFreeOpenCase } from '../domain/world/openLock.ts';
import { ensurePoisonsProfessionSlice, patchPoisonQuestReward } from '../domain/professions/poisons.ts';

export interface DataStore {
  spell(id: number): SpellDef | undefined;
  creature(entry: number): CreatureDef | undefined;
  /** Every attached creature_template row. Used by AHBot rank-split loot sources. */
  creatures(): CreatureDef[];
  // `creature_template_classlevelstats` by (level, unitClass), returning a row only when ObjectMgr
  // validity holds; otherwise undefined so SelectLevel uses the Min/Max fallback.
  creatureClassLvlStats(level: number, unitClass: number): CreatureClassLvlStatsRow | undefined;
  // `pet_levelstats` by (creatureEntry, level); hunter pets use entry 1. Gap-fills a missing level
  // from the previous one. Cite: ObjectMgr.cpp GetPetLevelInfo ~3045; LoadPetLevelInfo ~3030.
  petLevelStats(creatureEntry: number, level: number): PetLevelStatsRow | undefined;
  // SkillLineAbility.reqtrainpoints for a pet ability spell id (0 if absent / free). Baked `petAbilityTP`
  // keys are stringified spell ids. Cite: Pet.cpp GetTPForSpell ~916.
  petAbilityTP(spellId: number): number;
  /** Shared Pet-Generic skill-line 270 catalog (Growl/Cower/Great Stamina/…). */
  petGenericSpells(): { id: number; tp: number; innate?: boolean }[];
  // SpellItemEnchantment type-1 payload for an enchant id — what an ENCHANT_HELD_ITEM (92) effect actually
  // grants (Windfury 1783 → 8516 @ 20% for 10s). Undefined when the enchant is not a combat-spell enchant.
  weaponEnchantProc(enchantId: number): { spellId: number; chancePct?: number; durationMs: number } | undefined;
  // What a SpellItemEnchantment id GRANTS — kits, arcanums, oils, poisons, scopes, the enchanting
  // catalogue. Superset of weaponEnchantProc, which sees only the type-1 proc slot.
  itemEnchant(enchantId: number): ItemEnchantDef | undefined;
  // The targeting rule for an enchant APPLY spell: which slots it accepts, for how long, and
  // whether it refuses someone else's item. Keyed by apply spell — 16 enchant ids span slots.
  enchantApplicator(spellId: number): EnchantApplicatorDef | undefined;
  item(entry: number): ItemDef | undefined;
  // Every known item (boot keep set + anything merged via attachItems). Do not mutate. Items may be slim at
  // construction; bulk arrives from lazy item-data.json (Wave Z).
  items(): ItemDef[];
  /** Same full attached catalog as items() — prefer items() at new call sites. */
  allItems(): ItemDef[];
  // False while only the boot keep set is present (115 of 17,603 rows), so `item()` answers
  // "missing" for almost everything a real character owns. Anything that DELETES must check it.
  itemCatalogComplete(): boolean;
  // Lookup a loot table by id: creature and other bare tables by numeric `lootId` or its decimal
  // string, GameObject container tables by the string key `go:<n>`.
  lootTable(lootId: number | string): LootEntryDef[];
  // Every attached loot template id (creature / GO / etc), used by AHBot loot-supply sampling.
  // Only what attachLoot or construction seeded — do not invent ids.
  lootTemplateIds(): Array<number | string>;
  // Loot keys whose table lists `itemId`, read off the compact tuples so a reverse-loot shortlist
  // decodes nothing. A key can repeat, so callers that score a creature once dedupe.
  lootKeysForItem(itemId: number): readonly (number | string)[];
  /** Whether one loot table lists `itemId` at all — the same index, as a membership test. */
  lootHasItem(lootId: number | string | undefined, itemId: number): boolean;
  // Moves whenever a lazy attach can change what the zone walk yields. Cache key for anything
  // derived from `zones()` — a plain WeakMap goes stale when creatures or quests land late.
  zoneWorldGen(): number;
  // Lock.dbc row for a GameObjectDef.lockId (P0.3 bake). Undefined when lock missing. Cite:
  // DataBundle.locks; domain/world/openLock.ts canOpenLock / gameObjects.checkGoLock.
  lock(lockId: number): LockDataDef | undefined;
  // Populate the loot tables from the lazily-loaded compact loot-data.json: decodes the tuple
  // encoding and merges into the table map, keeping loot present at construction. Idempotent.
  attachLoot(compact: CompactLoot): void;
  // Called from lootTable / lootTemplateIds while compact loot is still empty. Boot wires this to parse
  // loot-data.json on first demand (not at menu).
  setLootLoader(fn: (() => void) | null): void;
  /** True after attachLoot. First corpse/gather should await ensureLoot(). */
  lootAttached(): boolean;
  /** Fetch + parse loot-data.json if needed. Resolves once tables are attached. */
  ensureLoot(): Promise<void>;
  // Populate the profession mechanics from the lazily-loaded profession-data.json, rebuilding the
  // lookup maps in place. A partial chunk attaches only the fields it carries; re-calling is safe.
  attachProfessions(chunk: CompactProfessions): void;
  // Populate additional spells (creature casts, procs, higher ranks, enchants) from spell-data.json.
  // Idempotent merge; core player spells from construction stay. Bridges on-next-swing as usual.
  attachSpells(chunk: CompactSpells): void;
  // Populate the bulk of GameObject templates from gameobject-data.json. Idempotent merge; GOs
  // present at construction (the quest-derived minimal set) are preserved.
  attachGameObjects(chunk: CompactGameObjects): void;
  // Populate bulk ItemDef rows from item-data.json. Idempotent merge by entry, re-applying
  // taming-rod useSpell stamps on newly attached items.
  attachItems(chunk: CompactItems): void;
  // Populate the bulk creature templates from the lazy tables/creatures.json chunk. Idempotent
  // merge by entry, preserving fixtures and slim boot sets. Awaited at the menu→world seam.
  attachCreatures(list: CreatureDef[]): void;
  /** Populate the bulk quest templates from lazily-loaded tables/quests.json — same
   *  seam and idempotence rules as attachCreatures. */
  attachQuests(list: QuestDef[]): void;
  /** Fill the sound tables from the lazy src/data/sound-data.ts chunk (4.8 MB). Maps are
   *  filled in place, so every accessor closure already handed out keeps working. */
  attachSounds(chunk: SoundTables): void;
  /** Merge the call-time tables from the lazy src/data/world-data.ts chunk (3.9 MB) into the
   *  bundle this store reads. Only tables with no construction-derived structure belong here —
   *  see WorldTables. */
  attachWorldTables(extra: WorldTables): void;
  quest(entry: number): QuestDef | undefined;
  /** All baked quest templates (boot + lazy attachQuests). */
  quests(): QuestDef[];
  trainer(entry: number): TrainerDef | undefined;
  /** Every trainer in the catalog (same shape as vendors()). Reverse "who teaches spell X" reads this. */
  trainers(): TrainerDef[];
  vendor(entry: number): VendorDef | undefined;
  /** Every attached npc_vendor. AHBot vendor-price clamp walks items[]. */
  vendors(): VendorDef[];
  createInfo(race: number, cls: number): CreateInfoDef | undefined;
  levelStats(race: number, cls: number, level: number): PrimaryStats | undefined;
  classLevel(cls: number, level: number): { baseHp: number; baseMana: number } | undefined;
  xpToNext(level: number): number;
  zone(id: string): ZoneDef | undefined;
  zones(): ZoneDef[];
  race(id: number): RaceDef | undefined;
  races(): RaceDef[];
  allSpells(): SpellDef[];
  // Professions (Phase 4)
  profession(id: string): ProfessionDef | undefined;
  professions(): ProfessionDef[];
  recipe(id: number): RecipeDef | undefined;
  recipes(): RecipeDef[];
  gatherNode(id: number): GatherNodeDef | undefined;
  /** Same list `gatherNode` reads — recipes() for nodes. */
  gatherNodes(): GatherNodeDef[];
  profTrainer(entry: number): ProfTrainerDef | undefined;
  /** The skinning gather-node a creature's corpse offers, if it is skinnable. */
  skinNode(creatureEntry: number): number | undefined;
  // Enchanting
  enchant(id: number): EnchantDef | undefined;
  enchants(): EnchantDef[];
  /** The tier of an enchanting rod item (undefined if the item isn't a rod). */
  enchantRodTier(entry: number): number | undefined;
  /** Every rod row, so a gate can name the rod a tier wants instead of printing the number. */
  enchantRods(): EnchantRodDef[];
  disenchantRules(): DisenchantRuleDef[];
  // Instances / dungeons (Phase 5)
  instance(id: string): InstanceDef | undefined;
  instances(): InstanceDef[];
  // True when this creature only exists inside a 5-man or raid — the same block set that prunes
  // zone.huntable. An outdoor planner must refuse these: there is no world pull.
  isInstanceCreature(entry: number): boolean;
  /** Instance hosting `entry`, for the honest-skip line: the wing that fights it when known. */
  instanceForCreature(entry: number): InstanceDef | undefined;
  // True when this creature only ever spawns inside a battleground (maps 30/489/529). Separate from
  // isInstanceCreature: the census had no BG maps until 2026-08-21, so 174 entries were invisible.
  isBattlegroundCreature(entry: number): boolean;
  /** Battleground name hosting `entry` ("Alterac Valley"), for the honest-skip line. */
  battlegroundForCreature(entry: number): string | undefined;
  // Talents (Phase A+)
  talentTrees(classId: number): TalentTreeDef[];
  talent(id: number): TalentDef | undefined;
  /** Class a trainer teaches (zone.trainers[].cls), 0 for a profession trainer. */
  trainerClass(entry: number): number;
  // GameObjects (chests/containers/quest nodes) — Lane F / Item 4
  gameObject(entry: number): GameObjectDef | undefined;
  gameObjects(): GameObjectDef[];
  // Item sets for set-bonus spells (E1)
  itemSet(id: number): ItemSetDef | undefined;
  itemSets(): ItemSetDef[];
  /** Playerbot companion name pool (seed-bot-names.mjs). Empty arrays when the bake predates it. */
  botNames(): { male: readonly string[]; female: readonly string[] };
  /** Premade playerbot talent specs for a class (seed-bot-specs.mjs). Empty when the bake predates it. */
  botSpecs(cls: number): readonly BotSpecDef[];
  /** Random-bot population weights "cls.race" -> weight (seed-bot-specs.mjs). Empty pre-bake. */
  botPopulation(): Record<string, number>;
  // R8b sound manifests (compact baked; values are clip names under /audio/sfx/ or absent)
  spellSound(id: number): string | undefined;
  /** ImpactKit landing clip (spellImpactSounds). Undefined when bake predates Wave G or spell has no impact. */
  spellImpact(id: number): string | undefined;
  creatureSound(entry: number): {
    aggro?: string; death?: string; attack?: string; greeting?: string; farewell?: string;
  } | undefined;
  // The spell's full SpellVisual stage set — precast / cast / impact / travel, each a variation
  // list. Undefined when the spell has no SpellVisual sound; callers fall back to school tables.
  spellStages(id: number): SpellSoundStages | undefined;
  // The creature's CreatureSoundData reaction set: exertion, injury, aggro, alert, death, stun and
  // loop, each a variation list. Undefined when the display chain has no sound row.
  creatureSoundSet(entry: number): CreatureSoundStages | undefined;
  // The PLAYER's reaction set, off the same chain: ChrRaces display id -> CreatureSoundData.
  // Undefined only for a race/gender the DBC has no display for.
  raceSoundSet(race: number, gender: 0 | 1 | undefined): CreatureSoundStages | undefined;
  // The NPC's gossip voice set from NPCSounds — greeting, farewell, pissed — each a variation list.
  // Undefined when the player cannot open a window (NpcFlags 0) or the display has no NPCSoundID.
  npcVoice(entry: number): NpcVoiceStages | undefined;
  // The recorded line for a script_texts / broadcast_text id — what the boss actually says out loud.
  // Undefined when the row has no sound or the clip is not shipped.
  textVoice(textId: number): readonly string[] | undefined;
  /** Client VolumeFloat for a clip key (SoundEntries): 1 unless the client attenuates it. */
  clipVolume(key: string): number;
  // The blow set for a weapon subclass (WeaponImpactSounds row), metal or not. Undefined for subclasses
  // the DBC has no row for (bow, gun, crossbow, wand, thrown) and for a bake that predates the table.
  weaponSounds(subclass: number, metal: boolean): WeaponSoundSet | undefined;
  /** What a creature swings (creature_equip_template). Undefined = unarmed. */
  creatureWeapon(entry: number): CreatureWeapon | undefined;
  // Combat skill DBC meta (SkillLine / SkillTiers / spell grants). Undefined when the bake predates
  // combat-skill enrichment — callers use hardcoded fallbacks.
  combatSkillMeta(): CombatSkillMeta | undefined;
  // Reputation factions / ranks (Wave C / E1 bake). Empty when pre-reputation bundle.
  factions(): FactionDef[];
  faction(id: number): FactionDef | undefined;
  /** FactionTemplate.dbc reaction masks by id (= creature_template.Faction). Undefined when
   *  the id is unknown or the bundle predates the faction bake — callers fail open. */
  factionTemplate(id: number): FactionTemplateDef | undefined;
  reputationRanks(): ReputationRankDef[];
  /** Per-faction kill/quest/spell rate multipliers (reputation_reward_rate). */
  reputationRates(): ReputationRateDef[];
  /** Spillover templates (reputation_spillover_template). */
  reputationSpillover(): ReputationSpilloverDef[];
  // Wave D/E/F optional bakes
  explorationBasexp(): Array<{ level: number; basexp: number }>;
  graveyards(): NonNullable<DataBundle['graveyards']>;
  gameEvents(): NonNullable<DataBundle['gameEvents']>;
  // dbscripts_on_event rows for a fire-on-use eventId (goober data2 / chest data6); empty when the
  // id is unknown. Never a calendar gate. Cite: GameObject.cpp StartEvents_Event.
  eventScripts(eventId: number): DbScriptRow[];
  // dbscripts_on_go_template_use rows for a GO entry (command 10 = summon creature at x/y/z — the Dark
  // Keeper portraits). Empty when the entry has no use script.
  goUseScripts(goEntry: number): DbScriptRow[];
  // dbscripts_on_go_use rows for a GO SPAWN GUID, not an entry (BRD Shadowforge Lock 2300093).
  // Cite: GameObject.cpp:1424-1426 ScriptsStart(SCRIPT_TYPE_GAMEOBJECT, GetDbGuid()).
  goGuidUseScripts(goGuid: number): DbScriptRow[];
  // dbscripts_on_gossip rows for a script id — `gossip_menu.script_id` fires on open with source
  // PLAYER, `gossip_menu_option.action_script_id` on the pick with source CREATURE.
  gossipScripts(scriptId: number): DbScriptRow[];
  // dbscripts_on_relay rows for a relay id — START_RELAY_SCRIPT ScriptsStart target. Cite:
  // ScriptMgr.cpp:2938–2948.
  relayScripts(relayId: number): DbScriptRow[];
  // dbscripts_on_creature_movement rows keyed by creature_movement.ScriptId. Cite:
  // WaypointMovementGenerator.cpp:183–186 ScriptsStart(SCRIPT_TYPE_CREATURE_MOVEMENT, …).
  creatureMovementScripts(scriptId: number): DbScriptRow[];
  // dbscripts_on_creature_death rows keyed by creature entry. Cite: Unit.cpp:1382
  // ScriptsStart(SCRIPT_TYPE_CREATURE_DEATH, victim->GetEntry(), …).
  creatureDeathScripts(entry: number): DbScriptRow[];
  // dbscripts_on_spell rows keyed by spell id (still returned when the slim spell table lacks the id).
  // Cite: SpellEffects.cpp:1529–1531 / :4189–4191 ScriptsStart(SCRIPT_TYPE_SPELL, m_spellInfo->Id, …).
  spellScripts(spellId: number): DbScriptRow[];
  pools(): NonNullable<DataBundle['pools']>;
  zoneWeather(): NonNullable<DataBundle['zoneWeather']>;
  conditionsList(): NonNullable<DataBundle['conditions']>;
  /** combat_condition rows by id — the creature_spell_list gate. Cite: UnitAI.cpp:1218-1224. */
  combatCondition(id: number): CombatConditionDef | undefined;
  /** unit_condition rows by id, the predicate a combat condition points at. */
  unitCondition(id: number): UnitConditionDef | undefined;
  gossipMenus(): NonNullable<DataBundle['gossipMenus']>;
  // npc_text row by id — the body a gossip menu shows above its options (`gossipMenus[].textId` is the join
  // key). Undefined when the dump has no text for the id.
  npcText(id: number): NpcTextDef | undefined;
  // Hub→dungeon entrance yardages (T0.5 enrich-travel-edges). Empty when pre-travel bake. Cite:
  // DataBundle.entranceYards; consumed by P-now / DF corpse-run helpers.
  entranceYards(): NonNullable<DataBundle['entranceYards']>;
  itemEnchantmentTemplate(entry: number): Array<{ ench: number; chance: number }> | undefined;
  // ItemRandomProperties.dbc row by id; undefined when the id is missing or the bundle predates the
  // table. Not a profession EnchantDef — PROP slots only.
  itemRandomProperty(id: number): RandomPropertyDef | undefined;
  // areatrigger_tavern rest markers (P0.6), zone-attributed. Empty when pre-areatrigger bake. Cite:
  // ObjectMgr.cpp:6287-6328; CITY rest still beats TAVERN (MiscHandler.cpp:710-717).
  tavernTriggers(): NonNullable<DataBundle['tavernTriggers']>;
  // areatrigger_teleport dungeon/portal lock rows (P0.6). Empty when pre-areatrigger bake. Cite:
  // ObjectMgr.cpp:6521-6626; consumed by world/instances canEnter (H3).
  areatriggerTeleports(): NonNullable<DataBundle['areatriggerTeleports']>;
  // Riding skill-GRANT rows (P0.7 enrich-mounts). Empty when pre-mount bake. Cite: DataBundle.ridingSpells;
  // mounts-riding.md (33388@75, 33391@150).
  ridingSpells(): NonNullable<DataBundle['ridingSpells']>;
  // Rank-chain node for a spell, or undefined when it is not part of a ladder. `prev`/`req` are the
  // prerequisites a trainer checks. Cite: SpellMgr::GetSpellChainNode; Player.cpp:3974-3982.
  spellChain(spellId: number): NonNullable<DataBundle['spellChain']>[number] | undefined;
  // FLEET-ROADMAP-3 T0.5 zone-graph travel matrix. Empty when pre-travel bake. Cite:
  // DataBundle.travelEdges; enrich-travel-edges.mjs.
  travelEdges(): NonNullable<DataBundle['travelEdges']>;
  // T0.4 hub anchors per zone. Empty object when pre-travel bake. Cite: DataBundle.travelAnchors;
  // enrich-travel-edges.mjs.
  travelAnchors(): NonNullable<DataBundle['travelAnchors']>;
  // T0.6 taxi nodes (TaxiNodes.dbc). Empty when pre-taxi bake. Cite: DataBundle.taxiNodes; enrich-taxi.mjs.
  taxiNodes(): NonNullable<DataBundle['taxiNodes']>;
  // T0.6 taxi routes (TaxiPath.dbc + spline seconds). Empty when pre-taxi bake. Cite:
  // DataBundle.taxiRoutes; enrich-taxi.mjs.
  taxiRoutes(): NonNullable<DataBundle['taxiRoutes']>;
  // T0.7 boats/zeppelins/ferries. Empty when pre-transport bake. Cite: DataBundle.transports;
  // enrich-transports.mjs.
  transports(): NonNullable<DataBundle['transports']>;
  // K4 class-travel destinations (spell_target_position + reagent gates). Empty when pre-class-travel bake.
  // Cite: DataBundle.spellTeleports; enrich-class-travel.mjs.
  spellTeleports(): NonNullable<DataBundle['spellTeleports']>;
}

/** Fewer attached items than this means only the boot keep set is here (itemCatalogComplete). */
const BULK_ITEM_FLOOR = 1000;

const triKey = (a: number, b: number, c: number): string => `${a}:${b}:${c}`;
const duoKey = (a: number, b: number): string => `${a}:${b}`;

// Warrior Charge ranks carry SPELL_ATTR_NOT_IN_COMBAT_ONLY_PEACEFUL (0x10000000), which bake rows
// leave unset, so stamp it here. Intercept and Feral Charge omit it. Cite: Spell.cpp:4598–4599.
const WARRIOR_CHARGE_NOT_IN_COMBAT_IDS = new Set([100, 6178, 11578]);

/** Apply runtime spell flags that the current bake still omits. Idempotent. */
function withRuntimeSpellFlags(s: SpellDef): SpellDef {
  let out = s;
  if (WARRIOR_CHARGE_NOT_IN_COMBAT_IDS.has(out.id) && !out.notInCombatOnly) {
    out = { ...out, notInCombatOnly: true };
  }
  // KI-745: Multi-Shot / Aimed Shot bake role=shoot but are real mana+GCD casts, not Auto Shot
  // toggles. Pure toggles stay cost=0 cast=0 gcd=0 (Auto Shot 75, Shoot 5019, Throw 2764).
  if (
    out.role === 'shoot'
    && ((out.cost ?? 0) > 0 || (out.castTimeMs ?? 0) > 0 || (out.gcdMs ?? 0) > 0)
  ) {
    out = { ...out, role: (out.castTimeMs ?? 0) > 0 ? 'nuke' : 'instant_nuke' };
  }
  return out;
}

// Reverse split-loot.mjs's compact encoding back into a LootEntryDef, restoring the count pair
// omitted when it was the near-universal 1..1. An optional 6th element is conditionId.
function decodeLoot(t: LootTuple | LootEntryDef): LootEntryDef {
  // Object-form rows (quest soft-lock tooling / e.item scanners) pass through.
  if (t && typeof t === 'object' && !Array.isArray(t) && 'item' in t) {
    const o = t as LootEntryDef & { referenceLootId?: number };
    const ent: LootEntryDef = {
      item: o.item | 0,
      chance: Number(o.chance ?? 0),
      groupId: (o.groupId ?? 0) | 0,
      minCount: (o.minCount ?? 1) | 0 || 1,
      maxCount: (o.maxCount ?? 1) | 0 || 1,
    };
    if (o.conditionId) ent.conditionId = o.conditionId | 0;
    if (o.questRequired) ent.questRequired = true;
    if (o.referenceLootId) (ent as { referenceLootId?: number }).referenceLootId = o.referenceLootId | 0;
    return ent;
  }
  const row = t as LootTuple;
  const ent: LootEntryDef = {
    item: row[0],
    chance: row[1],
    groupId: row[2],
    minCount: row.length >= 5 ? (row[3] as number) : 1,
    maxCount: row.length >= 5 ? (row[4] as number) : 1,
  };
  if (row.length >= 6 && ((row[5] as number) | 0) !== 0) ent.conditionId = (row[5] as number) | 0;
  return ent;
}

// Loot map keys normalize as: digit strings → number, `go:`/`item:`/`pickpocket:`… → the full
// string, anything else as-is. EMPTY_LOOT_KEYS below is the shared frozen result, never mutated.
const EMPTY_LOOT_KEYS: readonly (number | string)[] = Object.freeze([]);

export function normalizeLootKey(id: string | number): number | string {
  if (typeof id === 'number') return id;
  if (/^(go|item|pickpocket|skinning|fishing|mail|spell|prospecting):\d+$/.test(id)) return id;
  if (/^\d+$/.test(id)) return Number(id);
  return id;
}

// FO1 discoverability bridge: GO container tables live under `go:<lootId>`, but zone scans call
// `lootTable(go.lootId)` bare, so dual-write. On collision only quest-gated GO rows merge.
export function dualWriteGoLootDiscoverability(
  loot: Map<number | string, LootEntryDef[]>,
  bareTable?: (id: number) => LootEntryDef[],
): void {
  for (const [key, entries] of [...loot.entries()]) {
    if (typeof key !== 'string' || !/^go:\d+$/.test(key)) continue;
    const n = Number(key.slice(3));
    if (!(n > 0) || !entries.length) continue;
    // Creature tables decode lazily out of compact loot, so `loot` alone cannot see the collision —
    // pass ensureLoot. Reading only `loot` replaced 132 creature tables with the GO's 1-3 rows.
    const bare = loot.get(n) ?? bareTable?.(n);
    if (!bare || bare.length === 0) {
      loot.set(n, entries.map((e) => ({ ...e })));
      continue;
    }
    const have = new Set(bare.map((e) => e.item));
    for (const e of entries) {
      const questGated = e.questRequired === true || e.chance < 0;
      if (!questGated || have.has(e.item)) continue;
      bare.push({ ...e });
      have.add(e.item);
    }
  }
}

// Bridge CMaNGOS SrcItemId grants that have no gameobject_loot_template row so zone loot scans can
// find the item. Surfaces already-baked srcItem onto the starter GO; invents no item ids.
export function bridgeGoStarterSrcItemLoot(
  loot: Map<number | string, LootEntryDef[]>,
  gameObjects: Map<number, GameObjectDef>,
  quests: Iterable<QuestDef>,
  zones: Map<string, ZoneDef>,
  get: (key: number | string) => LootEntryDef[] = (key) => loot.get(key) ?? [],
): void {
  for (const q of quests) {
    const src = q.srcItem;
    if (!src?.item) continue;
    const goEntries =
      (q.goStarterEntries?.length ? q.goStarterEntries : null)
      ?? (q.goStarter && q.goStarter > 0 ? [q.goStarter] : []);
    if (!goEntries.length) continue;

    const count = src.count > 0 ? src.count : 1;
    for (const ge of goEntries) {
      const go = gameObjects.get(ge);
      if (!go) continue;
      // Prefer existing chest/fishing loot id; else use GO entry (free in classic for type-2).
      let lid = ((go.lootId ?? 0) | 0) > 0 ? ((go.lootId ?? 0) | 0) : ge;
      if (!(((go.lootId ?? 0) | 0) > 0)) go.lootId = lid;

      const ensure = (key: number | string) => {
        let rows = get(key);
        if (!loot.has(key)) {
          rows = rows.length ? rows : [];
          loot.set(key, rows);
        }
        if (rows.some((r) => r.item === src.item)) return;
        rows.push({
          item: src.item,
          chance: -100, // quest-gated (FQ3 sign) — only while objective needs the item
          groupId: 0,
          minCount: count,
          maxCount: count,
        });
      };
      ensure(`go:${lid}`);
      ensure(lid);
    }

    // Place goStarter on starter zone object lists (FO2 discoverability).
    for (const zid of q.starterZones ?? []) {
      const z = zones.get(zid);
      if (!z) continue;
      if (!z.objects) z.objects = [];
      for (const ge of goEntries) {
        if (!z.objects.includes(ge)) z.objects.push(ge);
      }
    }
  }
}

// Place GOs that yield quest itemTargets via quest-gated gameobject_loot onto zone.objects when the
// bake left them orphaned. Name-token co-location plus a death-summon fallback; no invented zones.
const QUEST_LOOT_GO_NAME_STOP = new Set([
  'eggs', 'egg', 'chest', 'crate', 'box', 'food', 'water', 'armor', 'iron', 'gold',
  'ore', 'vein', 'deposit', 'covered', 'large', 'small', 'locked', 'rusty', 'pitted',
  'filled', 'strongbox', 'clusters', 'formation', 'rubble', 'artifact', 'the', 'and',
  'of', 'with', 'from', 'ooze', 'skin', 'shadow', 'heart', 'mountain', 'scar', 'thread',
  'enchanted', 'tablet', 'fifth', 'sixth', 'data', 'safe', 'dirt', 'mound', 'banner',
]);
const QUEST_LOOT_GO_MAX_TOKEN_ZONES = 2;
/** CreatureEventAI event_type = JustDied. Cite: CreatureEventAI.h EVENT_T_DEATH. */
const EVENT_T_DEATH = 6;
/** CreatureEventAI action_type = cast spell. Cite: CreatureEventAI.h ACTION_T_CAST. */
const ACTION_T_CAST = 11;
/** SPELL_EFFECT_SUMMON_OBJECT_WILD. Cite: SharedDefines.h / SpellEffects.cpp EffectSummonObjectWild. */
const SPELL_EFFECT_SUMMON_OBJECT_WILD = 76;

function lootRowsForGo(
  get: (key: number | string) => LootEntryDef[],
  lootId: number,
): LootEntryDef[] {
  const a = get(`go:${lootId}`);
  const b = get(lootId);
  if (!a.length) return b;
  if (!b.length) return a;
  // Prefer namespaced table; merge unique items from bare for safety.
  const seen = new Set(a.map((r) => r.item));
  const out = a.slice();
  for (const r of b) {
    if (!seen.has(r.item)) out.push(r);
  }
  return out;
}

function goNameTokens(name: string | undefined): string[] {
  return String(name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !QUEST_LOOT_GO_NAME_STOP.has(t));
}

/** GO entry summoned by SPELL_EFFECT_SUMMON_OBJECT_WILD (effects[] or rawEffects). */
function summonObjectWildGoEntry(spell: SpellDef | undefined): number {
  if (!spell) return 0;
  for (const e of spell.effects ?? []) {
    if (e.kind === 'summon_object_wild' && (e.goEntry | 0) > 0) return e.goEntry | 0;
  }
  for (const r of spell.rawEffects ?? []) {
    if ((r.effect | 0) === SPELL_EFFECT_SUMMON_OBJECT_WILD && (r.miscValue | 0) > 0) {
      return r.miscValue | 0;
    }
  }
  return 0;
}

// Map goEntry → creature entries that death-cast a SUMMON_OBJECT_WILD spell for it. Sourced:
// creature_ai_scripts event_type=6 action type=11 + spell EffectMiscValue.
function deathSummonCreaturesByGo(
  creatures: Map<number, CreatureDef>,
  spellOf: ((id: number) => SpellDef | undefined) | undefined,
): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  if (!spellOf) return out;
  for (const cr of creatures.values()) {
    const ce = cr.entry | 0;
    if (!(ce > 0)) continue;
    for (const scr of cr.ai?.scripts ?? []) {
      if ((scr.eventType | 0) !== EVENT_T_DEATH) continue;
      for (const act of scr.actions ?? []) {
        if ((act.type | 0) !== ACTION_T_CAST) continue;
        const go = summonObjectWildGoEntry(spellOf(act.param1 | 0));
        if (!(go > 0)) continue;
        let set = out.get(go);
        if (!set) {
          set = new Set();
          out.set(go, set);
        }
        set.add(ce);
      }
    }
  }
  return out;
}

export function bridgeQuestItemLootGoZones(
  loot: Map<number | string, LootEntryDef[]>,
  gameObjects: Map<number, GameObjectDef>,
  creatures: Map<number, CreatureDef>,
  quests: Iterable<QuestDef>,
  zones: Map<string, ZoneDef>,
  gatherNodeNames?: Set<string>,
  /** Optional spell lookup — enables death-summon co-location (KI-739 Rusty Chest). */
  spellOf?: (id: number) => SpellDef | undefined,
  /** Lock.dbc — free-open quest plants (KI-775) may dual-list on zone.objects. */
  locks?: Map<number, LockDataDef>,
  getLoot: (key: number | string) => LootEntryDef[] = (key) => loot.get(key) ?? [],
): void {
  const itemTargets = new Set<number>();
  for (const q of quests) {
    for (const it of q.itemTargets ?? []) {
      if (it?.item) itemTargets.add(it.item | 0);
    }
  }
  if (!itemTargets.size) return;

  const freeOpenGo = (go: GameObjectDef): boolean => {
    if (!locks || go.lockId == null) return false;
    const lock = locks.get(go.lockId | 0);
    if (!lock?.cases?.length) return false;
    // LockDataDef cases match LockDef shape for free-open detection.
    return lockHasFreeOpenCase(lock as Parameters<typeof lockHasFreeOpenCase>[0]);
  };

  // token → outdoor zones that host a huntable whose name contains the token
  const tokenZones = new Map<string, Set<string>>();
  // creature entry → zones listing it as huntable (death-summon home)
  const huntableZones = new Map<number, Set<string>>();
  for (const z of zones.values()) {
    for (const ce of z.huntable ?? []) {
      let hz = huntableZones.get(ce);
      if (!hz) {
        hz = new Set();
        huntableZones.set(ce, hz);
      }
      hz.add(z.id);
      const cr = creatures.get(ce);
      if (!cr?.name) continue;
      for (const tok of goNameTokens(cr.name)) {
        if (!tokenZones.has(tok)) tokenZones.set(tok, new Set());
        tokenZones.get(tok)!.add(z.id);
      }
    }
  }

  const deathSummonByGo = deathSummonCreaturesByGo(creatures, spellOf);

  const listed = new Set<number>();
  for (const z of zones.values()) {
    for (const e of z.objects ?? []) listed.add(e);
  }

  for (const go of gameObjects.values()) {
    const entry = go.entry | 0;
    if (!(entry > 0) || listed.has(entry)) continue;
    const lid = ((go.lootId ?? 0) | 0);
    if (!(lid > 0)) continue;
    // Profession herbs stay nodes-only; free-open quest plants (Gloom Weed) may dual-list.
    if (gatherNodeNames?.has(String(go.name || '').toLowerCase()) && !freeOpenGo(go)) continue;

    const rows = lootRowsForGo(getLoot, lid);
    // Quest-gated (chance < 0) OR free-open GO that yields any itemTarget (Serpentbloom +100).
    const isQuestLoot = rows.some((r) => {
      if (!itemTargets.has(r.item | 0)) return false;
      if (r.questRequired === true || r.chance < 0) return true;
      return freeOpenGo(go);
    });
    if (!isQuestLoot) continue;

    // Prefer the most exclusive name token (fewest co-located zones, ≥1).
    let best: string[] | null = null;
    let bestSize = Infinity;
    for (const tok of goNameTokens(go.name)) {
      const zs = tokenZones.get(tok);
      if (!zs || zs.size === 0) continue;
      if (zs.size > QUEST_LOOT_GO_MAX_TOKEN_ZONES) continue;
      if (zs.size < bestSize) {
        bestSize = zs.size;
        best = [...zs];
      }
    }

    // KI-739: death-summoned quest chests have only stop-word names ("Rusty Chest").
    // Place on zones hosting the EventAI death-caster (Rotting Slime → ashenvale).
    if (!best?.length) {
      const summoners = deathSummonByGo.get(entry);
      if (summoners?.size) {
        const zs = new Set<string>();
        for (const ce of summoners) {
          for (const zid of huntableZones.get(ce) ?? []) zs.add(zid);
        }
        if (zs.size) best = [...zs].sort();
      }
    }
    if (!best?.length) continue;

    for (const zid of best) {
      const z = zones.get(zid);
      if (!z) continue;
      if (!z.objects) z.objects = [];
      if (!z.objects.includes(entry)) z.objects.push(entry);
    }
    listed.add(entry);
  }

  // KI-775: free-open quest plants already on zone.nodes (DB spawn path via extract-professions) promote to
  // zone.objects. Name co-location cannot place "Gloom Weed" / "Doom Weed"; nodes list is the sourced home.
  for (const z of zones.values()) {
    for (const nodeId of z.nodes ?? []) {
      const entry = nodeId | 0;
      if (!(entry > 0)) continue;
      const go = gameObjects.get(entry);
      if (!go) continue;
      if (!freeOpenGo(go)) continue;
      const lid = ((go.lootId ?? 0) | 0);
      if (!(lid > 0)) continue;
      const rows = lootRowsForGo(getLoot, lid);
      const yieldsTarget = rows.some((r) => itemTargets.has(r.item | 0));
      if (!yieldsTarget) continue;
      if (!z.objects) z.objects = [];
      if (!z.objects.includes(entry)) z.objects.push(entry);
    }
  }
}
export function createDataStore(b: DataBundle): DataStore {
  // Spells: core player spells from the boot bundle, with attachSpells merging the rest. The runtime
  // materializers below run in a fixed order and must be added to BOTH this path and attachSpells.
  let allSpellDefs = b.spells
    .map(withRuntimeSpellFlags)
    .map(withResurrectEffectsIfEmpty)
    .map(withPetLearnTeachesIfEmpty);
  for (const s of allSpellDefs) stampMissingSpeedFromRaw(s);
  for (const s of allSpellDefs) stampMissingRatingBuffsFromRaw(s);
  for (const s of allSpellDefs) stampMissingCharmFromRaw(s);
  for (const s of allSpellDefs) materializeModHealthRegenInCombat(s);
  for (const s of allSpellDefs) materializeModDamagePercentTaken(s);
  for (const s of allSpellDefs) materializeSpellReputation(s);
  for (const s of allSpellDefs) hydrateSpellFormAttrs(s);
  // Cannibalize seed flat 20 → OBS_MOD 7% max (KI-806). Cite: runtimeDataPatches.
  for (const s of allSpellDefs) patchCannibalizeHeal(s);
  // Sleep / Shackle Undead / Hibernate were baked as hard stun (MOD_STUN generic); retag in-memory
  // so ds.spell() matches SI resolveCombatSpell without a re-bake. Cite: KI-151 / KI-189.
  for (const s of allSpellDefs) retagBreakableStunOnSpell(s);
  for (const s of allSpellDefs) retagDisorientOnSpell(s);
  for (const s of allSpellDefs) hydrateSchoolImmunityOnSpell(s);
  // Ice Block: silence+pacify lockout, not stun debuff (KI-709). After school_immunity hydrate.
  allSpellDefs = allSpellDefs.map((s) => normalizeIceBlock(s));
  const spells = new Map(allSpellDefs.map((s) => [s.id, s]));
  /** id → index in allSpellDefs. Replaces a 13.5k findIndex on the spell() hot path. */
  const spellIndexById = new Map<number, number>();
  const reindexSpells = (from = 0): void => {
    for (let i = from; i < allSpellDefs.length; i++) spellIndexById.set(allSpellDefs[i]!.id, i);
  };
  reindexSpells();
  // KI-520: Seal of the Crusader ranks were mis-baked as plain MOD_ATTACK_POWER buffs. Strip the
  // AP-only shell; combat still resolves seal + Judgement of the Crusader from rawEffects.
  const SEAL_OF_THE_CRUSADER_IDS = [21082, 20162, 20305, 20306, 20307, 20308] as const;
  for (const id of SEAL_OF_THE_CRUSADER_IDS) {
    const sp = spells.get(id);
    if (!sp) continue;
    const hasApOnly = (sp.effects ?? []).some(
      (e) => e.kind === 'buff' && e.mod === 'attack_power' && (e.amount ?? 0) > 0,
    );
    const hasSeal = (sp.effects ?? []).some((e) => e.kind === 'seal');
    if (hasApOnly && !hasSeal) {
      const patched = { ...sp, effects: [] as typeof sp.effects, role: 'seal' as const };
      spells.set(id, patched);
      const idx = allSpellDefs.findIndex((s) => s.id === id);
      if (idx >= 0) allSpellDefs = allSpellDefs.map((s, i) => (i === idx ? patched : s));
    }
  }
  const creatures = new Map(b.creatures.map((c) => {
    const name = stripInternalNameTags(c.name);
    return [c.entry, name === c.name ? c : { ...c, name }];
  }));
  // Items: createInfo starters (and inline fixtures) from the boot bundle; attachItems merges the
  // rest. A `let` list so items()/allItems() reflect the attached catalog, not a stale array.
  let allItemDefs: ItemDef[] = (b.items ?? []).slice();
  const items = new Map(allItemDefs.map((i) => [i.entry, i]));
  // The boot keep set is 115 rows; the lazy chunk is 17,603. A bundle that already carries a
  // real catalog (probes merge it inline) counts as complete without waiting for attachItems.
  let bulkItemsPresent = allItemDefs.length >= BULK_ITEM_FLOOR;
  // Custom items are not in the bake, so they are merged for every bundle — boot, lazy, fixtures.
  // After bulkItemsPresent, so they can never make a boot-only bundle read as a full catalog.
  for (const it of CUSTOM_ITEMS) {
    if (items.has(it.entry)) continue;
    items.set(it.entry, it);
    allItemDefs.push(it);
  }
  // FQ2 / KI-141: class-12 Taming Rods are injected without useSpell; stamp sourced spellid_1
  // so rods are usable (item_template → channel tame spell). Cite: domain/quests/questTameRods.ts.
  applyTamingRodUseSpells(items.values());
  // Loot is usually attached later from the lazy compact bundle. Fixtures and the dungeon merge
  // still pass it inline, so seed from `b.loot` when present. Keys: numbers, or `go:<n>` strings.
  const loot = new Map<number | string, LootEntryDef[]>(
    (b.loot ?? []).map((l) => [normalizeLootKey(l.lootId), l.entries]),
  );
  // Compact tuples from loot-data.json. Decode on first lootTable() — 1.36M object rows
  // at attach was the boot spike (505 ms parse + 138 ms 39 MB clone + 90 ms decode).
  const compactLoot = new Map<number | string, CompactLoot[string]>();
  let attachedCompact: CompactLoot | null = null;
  let lootSanitized = false;
  let lootLoader: (() => void) | null = null;
  let lootWaiters: Array<() => void> = [];
  const sanitizeAttachedLoot = (): void => {
    if (lootSanitized || !attachedCompact || quests.size === 0) return;
    applyLootChanceSanity(attachedCompact, quests.values());
    lootSanitized = true;
    invalidateItemLootIndex();
    // Drop creature tables decoded before patches landed (go: keys are not patched).
    for (const k of [...loot.keys()]) {
      if (compactLoot.has(k) && (typeof k === 'number' || /^\d+$/.test(String(k)))) loot.delete(k);
    }
  };
  const decodeLootTable = (rows: CompactLoot[string]): LootEntryDef[] => {
    const len = rows.length;
    const out = new Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = decodeLoot(rows[i]);
    }
    return out;
  };
  // itemId → numeric loot keys listing it. Built from the compact tuples (t[0] is the item),
  // so a shortlist costs no decode. Invalidated wherever the loot map can gain rows.
  let itemLootKeys: Map<number, (number | string)[]> | null = null;
  const itemLootSets = new Map<number, Set<number | string>>();
  const invalidateItemLootIndex = (): void => {
    itemLootKeys = null;
    itemLootSets.clear();
  };
  const buildItemLootKeys = (): Map<number, (number | string)[]> => {
    const idx = new Map<number, (number | string)[]>();
    const push = (item: number, key: number | string): void => {
      let list = idx.get(item);
      if (list === undefined) {
        list = [];
        idx.set(item, list);
      }
      // Rows of one table are contiguous, so this collapses a table's repeat items.
      if (list[list.length - 1] !== key) list.push(key);
    };
    if (attachedCompact) {
      for (const id in attachedCompact) {
        const key = normalizeLootKey(id);
        for (const t of attachedCompact[id]!) push(t[0] | 0, key);
      }
    }
    // Decoded tables too, INCLUDING keys the compact map also has: the two bridges push rows onto
    // an already-decoded table. That can repeat a key, so callers scoring a creature once dedupe.
    for (const [key, rows] of loot) {
      for (const d of rows) push(d.item | 0, key);
    }
    return idx;
  };
  const lootKeysForItemImpl = (itemId: number): readonly (number | string)[] => {
    if (!compactLoot.size) lootLoader?.();
    if (itemLootKeys === null) itemLootKeys = buildItemLootKeys();
    return itemLootKeys.get(itemId | 0) ?? EMPTY_LOOT_KEYS;
  };
  const ensureLoot = (key: number | string): LootEntryDef[] => {
    if (!compactLoot.size) lootLoader?.();
    sanitizeAttachedLoot();
    let rows = loot.get(key);
    if (rows) return rows;
    const raw = compactLoot.get(key);
    if (raw == null) return [];
    rows = decodeLootTable(raw);
    loot.set(key, rows);
    return rows;
  };
  // Construction-time loot (fixtures / inline) also gets GO discoverability dual-write.
  dualWriteGoLootDiscoverability(loot);
  const quests = new Map(b.quests.map((q) => {
    const patched = patchPoisonQuestReward(q);
    return [q.entry, patched === q ? q : { ...q, ...patched }];
  }));
  const trainers = remapSyntheticClassTrainers(b.trainers, b.zones); // KI-918
  // Runtime trainer patches for core class spells missing from the bake's npc_trainer extract, at
  // cost 0 or peer cost — never invented prices. Judgement 20271 is the KI-244 case.
  const JUDGEMENT_SPELL_ID = 20271;
  const JUDGEMENT_REQ_LEVEL = 4;
  const JUDGEMENT_TRAIN_COST = 100; // sourced: peer L4 rows on paladin trainer
  // Warrior quest-only teaches: 0 npc_trainer rows in 1.12, so the synthetic class trainer still
  // needs the offers (KI-819). Cost 0 = quest rewSpell; reqLevel is the quest MinLevel.
  const WARRIOR_QUEST_TRAINER_GRANTS: ReadonlyArray<{ spell: number; reqLevel: number }> = [
    { spell: 71, reqLevel: 10 },   // Defensive Stance
    { spell: 355, reqLevel: 10 },  // Taunt
    { spell: 2458, reqLevel: 30 }, // Berserker Stance
  ];
  // TrainerDef carries no class — the mapping is baked on `zone.trainers[].cls`. Reading `t.cls`
  // here was always undefined, so the KI-244 Judgement patch never applied to any trainer.
  const trainerClass = new Map<number, number>();
  for (const z of b.zones ?? []) {
    for (const tr of z.trainers ?? []) trainerClass.set(tr.entry | 0, tr.cls | 0);
  }
  const withCoreTrainerSpells = (t: TrainerDef): TrainerDef => {
    // CLASS.WARRIOR=1, PALADIN=2, ROGUE=4 (schema.ts); keep dataStore leaf-clean (no CLASS import).
    const cls = trainerClass.get(t.entry | 0);
    const extras: TrainerDef['spells'] = [];
    if (cls === 1) {
      for (const g of WARRIOR_QUEST_TRAINER_GRANTS) {
        if (!t.spells.some((s) => s.spell === g.spell) && spells.has(g.spell)) {
          extras.push({
            spell: g.spell,
            cost: 0,
            reqLevel: g.reqLevel,
            reqSkill: 0,
            reqSkillValue: 0,
          });
        }
      }
    }
    if (cls === 2 && !t.spells.some((s) => s.spell === JUDGEMENT_SPELL_ID) && spells.has(JUDGEMENT_SPELL_ID)) {
      extras.push({
        spell: JUDGEMENT_SPELL_ID,
        cost: JUDGEMENT_TRAIN_COST,
        reqLevel: JUDGEMENT_REQ_LEVEL,
        reqSkill: 0,
        reqSkillValue: 0,
      });
    }
    // KI-871: trainer offer reqLevel must not undercut Spell.dbc cast/learn gate
    // (synthetic class trainers: Intimidating Shout 20 vs 22, Cure Disease, Banish).
    let spellsOut = extras.length ? [...t.spells, ...extras] : t.spells;
    let clamped = false;
    spellsOut = spellsOut.map((s) => {
      const sp = spells.get(s.spell);
      if (!sp) return s;
      const spellReq = Math.max(sp.reqLevel | 0, (sp.spellLevel ?? 0) | 0);
      if (spellReq <= (s.reqLevel | 0)) return s;
      clamped = true;
      return { ...s, reqLevel: spellReq };
    });
    if (!extras.length && !clamped) return t;
    return { ...t, spells: spellsOut };
  };
  // `?? []` because the offline-baked bundle can lag the schema; a JSON without a
  // `vendors` key must not crash the store (boot casts the JSON, so tsc won't catch it).
  const vendors = new Map((b.vendors ?? []).map((v) => [v.entry, v]));
  const createInfo = new Map(b.createInfo.map((c) => [duoKey(c.race, c.cls), c]));
  const levelStats = new Map(b.levelStats.map((r) => [triKey(r.race, r.cls, r.level), r.stats]));
  const classLevel = new Map<string, ClassLevelRow>(
    b.classLevelStats.map((r) => [duoKey(r.cls, r.level), r]),
  );
  // Creature class×level stats (optional; System 8 SelectLevel). Key: level:unitClass.
  const creatureCls = new Map<string, CreatureClassLvlStatsRow>(
    (b.creatureClassLevelStats ?? []).map((r) => [duoKey(r.level, r.unitClass), r]),
  );
  // Pet levelstats (optional; Wave 3A). Key: creatureEntry:level. Hunter = entry 1.
  const petLvl = new Map<string, PetLevelStatsRow>(
    (b.petLevelStats ?? []).map((r) => [duoKey(r.creatureEntry, r.level), r]),
  );
  // Per-entry sorted levels for gap-fill (ObjectMgr copies previous when a level is missing).
  const petLvlByEntry = new Map<number, number[]>();
  for (const r of b.petLevelStats ?? []) {
    let arr = petLvlByEntry.get(r.creatureEntry);
    if (!arr) { arr = []; petLvlByEntry.set(r.creatureEntry, arr); }
    arr.push(r.level);
  }
  for (const arr of petLvlByEntry.values()) arr.sort((a, b) => a - b);
  // Pet training points (optional; Wave B). String keys in the bake → number lookup.
  const petAbilityTpMap = b.petAbilityTP ?? {};
  // Weapon-enchant combat-spell payloads (optional; absent on a bake predating the table).
  const weaponEnchantProcMap = b.weaponEnchantProcs ?? {};
  // Item-enchant spine (optional; absent on a bake predating the tables).
  const itemEnchantMap = b.itemEnchants ?? {};
  const enchantApplicatorMap = b.enchantApplicators ?? {};
  const petGenericSpellList = b.petGenericSpells ?? [];
  const xp = new Map(b.xp.map((r) => [r.level, r.toNext]));
  // Races (guard with `?? []`: a bundle baked before Phase 3 lacks them).
  const racesList = b.races ?? [];
  const races = new Map(racesList.map((r) => [r.id, r]));
  // Faction templates — used to prune never-attackable rows from zone.huntable.
  const factionTemplatesEarly = new Map((b.factionTemplates ?? []).map((t) => [t.id, t]));
  // Outdoor spawn index + instance block (5-man + raid + summon-only, outdoor-spawn exempt).
  // Rebuilt when zones are fixed at construction; zone.spawns come from the bake.
  const { outdoorSpawned, spawnZonesByEntry } = buildOutdoorSpawnIndex(b.zones ?? []);
  const censusByMap = (b as { dungeonCensus?: Record<string, { entries?: Record<string, unknown> }> })
    .dungeonCensus;
  const raidHuntableBlock = instanceCreatureEntrySet(censusByMap, { outdoorSpawnedEntries: outdoorSpawned });
  const bgHuntableBlock = battlegroundCreatureEntrySet(censusByMap, { outdoorSpawnedEntries: outdoorSpawned });
  // The outdoor prune blocks BOTH — a BG creature is no more reachable from a zone than a
  // dungeon one. The two sets stay separate only so the skip line can name the right place.
  const outdoorHuntableBlock = new Set([...raidHuntableBlock, ...bgHuntableBlock]);
  // Bosses the authored instance graphs fight that dungeonCensus never saw because they are
  // summoned, not spawned: Ragnaros, Nefarian, Majordomo, Sapphiron, Ouro, Arlokk. 14 of 881.
  for (const inst of b.instances ?? []) {
    for (const enc of inst.encounters) {
      const members = [
        enc.creatureEntry,
        ...(enc.poolCandidates ?? []),
        ...(enc.pack ?? []).flatMap((m) => [m.creatureEntry, ...(m.poolCandidates ?? [])]),
      ];
      for (const m of members) {
        const e = m | 0;
        if (e > 0 && !outdoorSpawned.has(e)) raidHuntableBlock.add(e);
      }
    }
  }
  // creature entry -> instance mapId, built on first ask (only the honest-skip line needs it).
  let creatureMapId: Map<number, number> | null = null;
  const instanceMapOfCreature = (entry: number): number | undefined => {
    if (!creatureMapId) {
      creatureMapId = new Map();
      for (const [mapKey, row] of Object.entries(censusByMap ?? {})) {
        const mid = Number(mapKey);
        if (!Number.isFinite(mid)) continue;
        for (const k of Object.keys(row?.entries ?? {})) {
          const n = Number(k);
          if (Number.isFinite(n) && !creatureMapId.has(n)) creatureMapId.set(n, mid);
        }
      }
    }
    return creatureMapId.get(entry);
  };
  /** zoneId → local outdoor spawn entries */
  const localSpawnsByZone = new Map<string, Set<number>>();
  /** zoneId → AreaTable alliance/horde/contested (same-side noXp prune). */
  const zoneFactionById = new Map<string, ZoneDef['faction']>();
  /** zoneId → p10–p90 level band from local spawns */
  const levelBandByZone = new Map<string, [number, number] | null>();
  const spawnRankOf = (e: number): number => {
    const c = creatures.get(e | 0) as { rank?: number; scaling?: { rank?: number } } | undefined;
    if (!c) return 0;
    const r = c.rank ?? c.scaling?.rank;
    return (typeof r === 'number' && Number.isFinite(r) ? r : 0) | 0;
  };
  for (const z of b.zones ?? []) {
    const zid = z.id;
    if (!zid) continue;
    const local = new Set<number>();
    for (const s of z.spawns ?? []) {
      const e = (s.entry ?? 0) | 0;
      if (e > 0) local.add(e);
    }
    localSpawnsByZone.set(zid, local);
    if (z.faction) zoneFactionById.set(zid, z.faction);
    levelBandByZone.set(
      zid,
      zoneSpawnLevelBand(local, (e) => creatures.get(e)?.level ?? 0, { rankOf: spawnRankOf }),
    );
  }
  // Quest kill targets AND baked item droppers (quest.farm) that still pass isOutdoorNonGrindCreature.
  // Faction-35 Binding / Garments heal proxies are rebuilt out after patchGarmentHealQuests. Cite: KI-1037.
  const questTargetHuntable = new Set<number>();
  /** zoneId → kill-target entries for quests listed on that zone */
  const killByZone = new Map<string, Set<number>>();
  const rebuildKillByZone = () => {
    killByZone.clear();
    for (const z of b.zones ?? []) {
      const zid = z.id;
      if (!zid) continue;
      const ks = new Set<number>();
      for (const qe of z.quests ?? []) {
        const q = quests.get(qe | 0);
        if (!q) continue;
        for (const kt of q.killTargets ?? []) {
          const e = kt.creatureEntry | 0;
          if (e > 0) ks.add(e);
        }
      }
      killByZone.set(zid, ks);
    }
  };
  const ingestQuestTargets = (list: Iterable<QuestDef>) => {
    for (const q of list) {
      for (const kt of q.killTargets ?? []) {
        const e = kt.creatureEntry | 0;
        if (e > 0) questTargetHuntable.add(e);
      }
      // The reverse-loot dropper list is the same objective in item form; the prune dropped it for
      // NO_XP, which only zeroes XP. Cite: Formulas.h:368 Gain; Player.cpp:18727 RewardHonor.
      for (const ce of q.farm ?? []) {
        const e = ce | 0;
        if (e > 0) questTargetHuntable.add(e);
      }
    }
  };
  /** Clear + rebuild after patches that strip bogus killTargets / absurd farms. */
  const rebuildQuestTargetHuntable = () => {
    questTargetHuntable.clear();
    ingestQuestTargets(quests.values());
    questKillHuntableGen = questTargetHuntable.size;
  };
  let questKillHuntableGen = 0;
  rebuildQuestTargetHuntable();
  rebuildKillByZone();

  // Keep zone.huntable entries at least one player race can attack, and drop instance/summon-only,
  // civilians, guards and out-of-band leaks. FAILS OPEN on an unknown entry: `creatures` is LAZY.
  const huntableEntryOk = (entry: number, zoneId: string): boolean => {
    const e = entry | 0;
    const c = creatures.get(e);
    // Instance / rank-3 / AQ / guard / noXp — instance block wins over quest-kill allowlist.
    if (
      isExcludedFromOutdoorHuntable(e, c, {
        blockSet: outdoorHuntableBlock,
        questTargetSet: questTargetHuntable,
        outdoorSpawned,
      })
    ) {
      return false;
    }
    // Zone-aware wrong-zone + level-band (needs spawn index; safe before creatures attach
    // for spawn-local rows; level band re-evaluates after attach when levels exist).
    const localSpawns = localSpawnsByZone.get(zoneId) ?? new Set<number>();
    // Recompute level band once creatures are attached (construction-time band is empty).
    // Prefer rank-0 normals so elite islands do not inflate p90 (KI-842/865/867/885/886).
    let band = levelBandByZone.get(zoneId) ?? null;
    if (creatures.size > 0 && localSpawns.size > 0) {
      band = zoneSpawnLevelBand(
        localSpawns,
        (id) => creatures.get(id)?.level ?? 0,
        { rankOf: spawnRankOf },
      );
      levelBandByZone.set(zoneId, band);
    }
    if (
      !shouldKeepOutdoorHuntableEntry(e, zoneId, {
        blockSet: outdoorHuntableBlock,
        questTargetSet: questTargetHuntable,
        outdoorSpawned,
        spawnZonesByEntry,
        localKillSet: killByZone.get(zoneId) ?? new Set(),
        localSpawnSet: localSpawns,
        levelBand: band,
        creature: c,
      })
    ) {
      return false;
    }
    if (!c) return true;
    const a = c.factionId != null ? factionTemplatesEarly.get(c.factionId) : undefined;
    const zoneFaction = zoneFactionById.get(zoneId);
    // Same-side noXp / CIVILIAN / faction-35 / CanAttack mask — no quest-kill bypass.
    if (isOutdoorNonGrindCreature(c, a, zoneFaction)) return false;
    // Hostile quest targets stay listable even when the template is Neutral to some races.
    if (questTargetHuntable.has(e)) return true;
    if (!a) return true; // fail open when faction bake missing
    for (const race of racesList) {
      const bft = race.factionTemplate != null
        ? factionTemplatesEarly.get(race.factionTemplate)
        : undefined;
      if (!bft) continue;
      // getFactionReaction(a=creature, b=player) — attackable when < FRIENDLY.
      if (getFactionReaction(a, bft) < REP_RANK.FRIENDLY) return true;
    }
    return false;
  };
  // Zone/catalog load-time patches (KI-429/467/478/670/730/873/879/916) — sourced ids only; no re-bake.
  patchBeliaPetTrainer(b.zones ?? [], creatures);
  for (const z of b.zones ?? []) {
    patchZoneInnkeepers(z);
    patchBlastedLandsVendors(z);
    // core.zones dropped Druid (cls 11) from faction class lists; restore from race unions.
    patchZoneClassTrainers(z, (e) => trainers.has(e));
    for (const tr of z.trainers ?? []) trainerClass.set(tr.entry | 0, tr.cls | 0);
  }
  // KI-873: starter-hub quests (Camp Narache, …) have starterZones but ZoneOrSort is a
  // sub-area id, so bake zone.quests omitted them. Union before kill-by-zone rebuild.
  if (quests.size > 0) {
    patchZoneQuestsFromStarterZones(b.zones ?? [], quests.values());
    rebuildKillByZone();
  }
  const zones = new Map(b.zones.map((z) => [z.id, z]));
  // Non-lazy callers (probes, dev drivers) pass creatures/quests eagerly and never call
  // attach*, so patch here too — but ONLY when the table is really populated. Cite: KI-478/670/916.
  if (creatures.size > 0) {
    ensureFlightMasterCreatures(b.zones ?? [], creatures);
    patchWindshearVerminDamage(creatures);
  }
  if (quests.size > 0) {
    patchGarmentHealQuests(quests.values());
    patchBogusQuestMinRepGates(quests.values());
    patchLegendsOfTheEarthQuest(quests.values());
    // Garments cleared killTargets — drop heal-proxy entries from the huntable allowlist.
    rebuildQuestTargetHuntable();
    rebuildKillByZone();
  }
  // KI-826: scrub absurd reverse-loot farm[] once both catalogs exist (eager bundles).
  if (quests.size > 0 && creatures.size > 0) {
    patchAbsurdQuestFarms(quests.values(), creatures, zones.values());
    // The allowlist reads farm[] — re-ingest so a scrubbed dropper loses its bypass too.
    rebuildQuestTargetHuntable();
  }
  // Zone with the huntable prune applied, evaluated on READ because `creatures` only fills when
  // boot.ts attaches the lazy table. Memoized on `creatures.size` + the quest-kill set gen.
  let huntableMemo = new Map<string, ZoneDef>();
  let huntableMemoKey = -1;
  /** The zone walk's own memo key, published so callers can key their derived maps on it. */
  const zoneWorldGen = (): number => (creatures.size > 0
    ? creatures.size * 1_000_003 + questKillHuntableGen
    : questKillHuntableGen);
  const zonePruned = (z: ZoneDef | undefined): ZoneDef | undefined => {
    if (!z) return z;
    // Raid-map filter is safe before creatures attach (uses dungeonCensus only). Faction
    // prune still waits for the lazy catalog — same gate as huntable-lazy.test.ts.
    const canFactionPrune = creatures.size > 0;
    const memoKey = zoneWorldGen();
    if (huntableMemoKey !== memoKey) {
      huntableMemo = new Map();
      huntableMemoKey = memoKey;
    }
    const hit = huntableMemo.get(z.id);
    if (hit) return hit;
    const raw = z.huntable ?? [];
    // Inject zone quest killTargets omitted from bake (KI-888 Highvale). Skip spawn-home elsewhere.
    let candidates = raw;
    if (canFactionPrune) {
      const localKills = killByZone.get(z.id);
      if (localKills?.size) {
        const set = new Set(raw);
        let grew = false;
        for (const e of localKills) {
          if (set.has(e)) continue;
          const homes = spawnZonesByEntry.get(e);
          if (homes && homes.size > 0 && !homes.has(z.id)) continue;
          // localKillSet bypasses every band/rank check, so guard here: a level-1 row is a
          // trigger/doodad/structure, never a grind target (14 of 109). Real targets are level 2+.
          if ((creatures.get(e)?.level ?? 0) <= 1) continue;
          set.add(e);
          grew = true;
        }
        if (grew) candidates = [...set];
      }
    }
    const hunt = canFactionPrune
      ? candidates.filter((e) => huntableEntryOk(e, z.id))
      : outdoorHuntableBlock.size
        ? raw.filter((e) => !outdoorHuntableBlock.has(e | 0))
        : raw;
    // Surface capital weapon masters on zone.trainers (cls=0) so discovery scans that only walk
    // trainers still find One-Handed Swords (KI-573). zoneTrainer(cls) still keys on cls.
    let trainersList = z.trainers ?? [];
    const wms = z.weaponTrainers ?? [];
    if (wms.length) {
      const have = new Set(trainersList.map((t) => t.entry | 0));
      const extra = wms
        .map((e) => e | 0)
        .filter((e) => e > 0 && !have.has(e) && trainers.has(e))
        .map((entry) => ({ cls: 0, entry }));
      if (extra.length) trainersList = [...trainersList, ...extra];
    }
    const trainersChanged = trainersList !== z.trainers && trainersList !== (z.trainers ?? []);
    const huntableChanged =
      hunt.length !== raw.length || !raw.every((e, i) => e === hunt[i]);
    // Recompute levelRange when huntable shrank so L40–46 instance/AQ rows no longer inflate it.
    let levelRange = z.levelRange;
    let levelRangeChanged = false;
    if (huntableChanged && canFactionPrune) {
      const lvls: number[] = [];
      for (const e of hunt) {
        const c = creatures.get(e | 0);
        const lvl = c?.level ?? 0;
        if (lvl > 0) lvls.push(lvl);
      }
      if (lvls.length) {
        const nextRange: [number, number] = [Math.min(...lvls), Math.max(...lvls)];
        const prev = z.levelRange;
        if (!prev || prev[0] !== nextRange[0] || prev[1] !== nextRange[1]) {
          levelRange = nextRange;
          levelRangeChanged = true;
        }
      }
    }
    const out =
      !huntableChanged && !trainersChanged && !levelRangeChanged
        ? z
        : {
            ...z,
            ...(huntableChanged ? { huntable: hunt } : {}),
            ...(trainersChanged ? { trainers: trainersList } : {}),
            ...(levelRangeChanged ? { levelRange } : {}),
          };
    huntableMemo.set(z.id, out);
    return out;
  };
  // Professions (guard each with `?? []`: a pre-Phase-4 bundle lacks them). Usually EMPTY at
  // construction and attached later; `let` so attachProfessions can swap the array bindings.
  let professionList = b.professions ?? [];
  // Key by plain string so lookups by an arbitrary id (the `profession(id: string)`
  // contract) type-check — the keys are the SkillLine union, which widens to string.
  const professions = new Map<string, ProfessionDef>(professionList.map((p) => [p.id, p]));
  let recipeList = b.recipes ?? [];
  const recipes = new Map(recipeList.map((r) => [r.id, r]));
  let gatherNodeList = b.gatherNodes ?? [];
  const gatherNodes = new Map(gatherNodeList.map((n) => [n.id, n]));
  const profTrainers = new Map((b.profTrainers ?? []).map((t) => [t.entry, t]));
  const skinnable = new Map((b.skinnable ?? []).map((s) => [s.creature, s.node])); const skinGap = createSkinGapFill(skinnable, gatherNodes, (e) => creatures.get(e)); // KI-904/905
  // Enchanting (guard with `?? []`: a bundle baked before seed-enchanting.mjs lacks them).
  let enchantList = b.enchants ?? [];
  const enchants = new Map(enchantList.map((e) => [e.id, e]));
  let enchantRodList = b.enchantRods ?? [];
  const enchantRods = new Map(enchantRodList.map((r) => [r.entry, r.tier]));
  let disenchantRules = b.disenchantRules ?? [];
  // Instances (guard with `?? []`: a bundle baked before Phase 5 lacks them).
  const instanceList = b.instances ?? [];
  const instances = new Map(instanceList.map((d) => [d.id, d]));
  const encounterHasCreature = (inst: InstanceDef, e: number): boolean =>
    inst.encounters.some((enc) =>
      enc.creatureEntry === e
      || (enc.poolCandidates ?? []).includes(e)
      || (enc.pack ?? []).some((m) => m.creatureEntry === e || (m.poolCandidates ?? []).includes(e)));
  // Talents (guard `?? []`)
  const talentTreesAll: TalentTreeDef[] = (b.talents ?? []).map(t => ({...t, talents: t.talents ?? [] }));
  const talentById = new Map<number, TalentDef>();
  for (const tree of talentTreesAll) {
    for (const tal of (tree.talents ?? [])) talentById.set(tal.id, tal);
  }
  const treesByClass = new Map<number, TalentTreeDef[]>();
  for (const t of talentTreesAll) {
    if (!treesByClass.has(t.classId)) treesByClass.set(t.classId, []);
    treesByClass.get(t.classId)!.push(t);
  }
  // GameObjects: a slim set (quest/current zone) may be in the core bundle; attachGameObjects
  // merges the bulk from lazy gameobject-data.json. Use `let` list so getter returns attached.
  let gameObjectList: GameObjectDef[] = (b.gameObjects ?? []).slice();
  const gameObjects = new Map<number, GameObjectDef>(gameObjectList.map((g) => [g.entry, g]));
  patchLegendsOfTheEarthQuest(quests.values(), gameObjects);
  // Lock.dbc (P0.3) — resolve GameObjectDef.lockId for canOpenLock / useGameObject.
  // Built before quest-loot GO bridge so KI-775 free-open plant promote can read locks.
  const locksById = new Map<number, LockDataDef>((b.locks ?? []).map((l) => [l.id, l]));
  // Built on first read: these two ship as boot tables, but a fixture bundle omits them and
  // the spell-list gate must then default open rather than silence every gated row.
  let combatCondIdx: Map<number, CombatConditionDef> | null = null;
  const combatConditionById = (): Map<number, CombatConditionDef> => {
    combatCondIdx ??= new Map((b.combatConditions ?? []).map((c) => [c.id | 0, c]));
    return combatCondIdx;
  };
  let npcTextIdx: Map<number, NpcTextDef> | null = null;
  const npcTextById = (): Map<number, NpcTextDef> => {
    npcTextIdx ??= new Map((b.npcTexts ?? []).map((t) => [t.id | 0, t]));
    return npcTextIdx;
  };
  let unitCondIdx: Map<number, UnitConditionDef> | null = null;
  const unitConditionById = (): Map<number, UnitConditionDef> => {
    unitCondIdx ??= new Map((b.unitConditions ?? []).map((c) => [c.id | 0, c]));
    return unitCondIdx;
  };
  // Inline-boot GOs + quests: bridge SrcItem goStarters (KI-502 Menethil Statuette pattern).
  bridgeGoStarterSrcItemLoot(loot, gameObjects, quests.values(), zones);
  dualWriteGoLootDiscoverability(loot);
  // KI-689 / KI-775: quest itemTarget GO loot → zone.objects (name co-location + free-open nodes).
  // Re-run on attachLoot / attachGameObjects / attachCreatures / attachProfessions.
  const runQuestLootGoBridge = () => {
    const nodeNames = new Set<string>();
    for (const n of gatherNodes.values()) {
      if (n.name) nodeNames.add(String(n.name).toLowerCase());
    }
    // spellOf after attachSpells fills lazy spell-data (Summon Rusty Chest 6464 etc.).
    bridgeQuestItemLootGoZones(
      loot,
      gameObjects,
      creatures,
      quests.values(),
      zones,
      nodeNames.size ? nodeNames : undefined,
      (id) => spells.get(id),
      locksById,
      ensureLoot,
    );
  };
  runQuestLootGoBridge();

  // Item sets (small; for E1 set bonuses)
  const itemSetsList: ItemSetDef[] = (b.itemSets ?? []).slice();
  const itemSets = new Map<number, ItemSetDef>(itemSetsList.map((s) => [s.id, s]));

  // Playerbot companion name pool (optional; pre-seed bundles lack it)
  const botNamePool = { male: b.botNames?.male ?? [], female: b.botNames?.female ?? [] };

  // Premade playerbot specs by class (optional; pre-seed bundles lack it)
  const botSpecsByClass = new Map<number, BotSpecDef[]>(
    Object.entries(b.botSpecs ?? {}).map(([k, v]) => [Number(k), v]),
  );

  // R8b sounds (optional; pre-bake bundles may lack the keys)
  const spellSounds = new Map<number, string>(Object.entries(b.spellSounds ?? {}).map(([k, v]) => [Number(k), v]));
  const spellImpactSounds = new Map<number, string>(Object.entries(b.spellImpactSounds ?? {}).map(([k, v]) => [Number(k), v]));
  const creatureSounds = new Map<number, {
    aggro?: string; death?: string; attack?: string; greeting?: string; farewell?: string;
  }>(
    Object.entries(b.creatureSounds ?? {}).map(([k, v]) => [Number(k), v || {}])
  );
  const spellSoundStages = new Map<number, SpellSoundStages>(
    Object.entries(b.spellSoundStages ?? {}).map(([k, v]) => [Number(k), v])
  );
  // Normalized: entry -> CreatureSoundData id -> the shared set (263 sets for 5474 creatures).
  const creatureSoundSets = new Map<number, CreatureSoundStages>(
    Object.entries(b.creatureSoundSets ?? {}).map(([k, v]) => [Number(k), v])
  );
  const creatureSoundRef = new Map<number, number>(
    Object.entries(b.creatureSoundRef ?? {}).map(([k, v]) => [Number(k), Number(v)])
  );
  // `<race>-<gender>` -> the same CreatureSoundData ids, so the player shares creatureSoundSets.
  const raceSoundRef = new Map<string, number>(
    Object.entries(b.raceSoundRef ?? {}).map(([k, v]) => [k, Number(v)])
  );
  // NPCSounds is its own chain (gossip voice), normalized the same way: 156 sets, entry → id.
  const npcVoiceSets = new Map<number, NpcVoiceStages>(
    Object.entries(b.npcVoiceSets ?? {}).map(([k, v]) => [Number(k), v])
  );
  const npcVoiceRef = new Map<number, number>(
    Object.entries(b.npcVoiceRef ?? {}).map(([k, v]) => [Number(k), Number(v)])
  );
  const textVoice = new Map<number, string[]>(
    Object.entries(b.textVoice ?? {}).map(([k, v]) => [Number(k), v])
  );
  const weaponSounds = new Map<string, WeaponSoundSet>(Object.entries(b.weaponSounds ?? {}));
  const creatureWeapons = new Map<number, CreatureWeapon>(
    Object.entries(b.creatureWeapons ?? {}).map(([k, v]) => [Number(k), v])
  );
  const soundClipVolume = b.soundClipVolume ?? {};

  // Combat skill meta: normalize JSON string keys → number keys for Record lookups.
  const rawMeta = b.combatSkillMeta;
  let combatMeta: CombatSkillMeta | undefined;
  if (rawMeta) {
    const numRec = <T>(r?: Record<number, T> | Record<string, T>): Record<number, T> | undefined => {
      if (!r) return undefined;
      const out: Record<number, T> = {};
      for (const [k, v] of Object.entries(r)) out[Number(k)] = v as T;
      return out;
    };
    combatMeta = {
      categories: numRec(rawMeta.categories),
      skillNames: numRec(rawMeta.skillNames),
      tiers: numRec(rawMeta.tiers),
      raceClass: rawMeta.raceClass,
      spellGrants: numRec(rawMeta.spellGrants),
      spellLearnSkills: numRec(rawMeta.spellLearnSkills),
      // SkillLineAbility rows for IsSpellFitByClassAndRace (weapon masters / trainers).
      spellAbilities: numRec(rawMeta.spellAbilities),
      // spell_learn_spell graph (Poisons 2842 → Instant Poison 8681, Beast Training → Growl, …).
      // Dropped here previously → train() never auto-taught dependents (KI-640).
      spellLearnSpells: numRec(rawMeta.spellLearnSpells),
    };
    // SPELL_EFFECT_PARRY (22): EffectMiscValue is the mono skill line (Parry 3127 → 90). SLA
    // learnOnGetSkill never maps it, so combatSkills[90] stayed undefined and CanParry never armed.
    const grants = combatMeta.spellGrants ?? (combatMeta.spellGrants = {});
    for (const s of allSpellDefs) {
      if (grants[s.id] != null) continue;
      for (const re of s.rawEffects ?? []) {
        if ((re.effect | 0) !== 22) continue;
        const skillId = (re.miscValue | 0);
        if (skillId > 0) {
          grants[s.id] = skillId;
          break;
        }
      }
    }
  }

  // Reputation factions / ranks / rates / spillover (Wave C). Guard `?? []` for pre-E1 bundles.
  const factionsList: FactionDef[] = b.factions ?? [];
  const factionsById = new Map(factionsList.map((f) => [f.id, f]));
  const factionTemplatesById = new Map((b.factionTemplates ?? []).map((t) => [t.id, t]));
  const reputationRanksList: ReputationRankDef[] = b.reputationRanks ?? [];
  const reputationRatesList: ReputationRateDef[] = b.reputationRates ?? [];
  const reputationSpilloverList: ReputationSpilloverDef[] = b.reputationSpillover ?? [];

  // Materialize hollow percent-stat effects (aura 80/137) once, then cache — `settled` is what
  // keeps this a Map lookup at ~10k/s in a pull. Both mutations are idempotent and one-shot.
  const settled = new WeakSet<SpellDef>();
  const materializeSpell = (s: SpellDef): SpellDef => {
    if (settled.has(s)) return s;
    // Food/drink tooltips: per-tick → total (KI-147). Safe when effects already filled.
    if ((s.effects?.length ?? 0) > 0) {
      patchFoodDrinkDescriptions(s);
      settled.add(s);
      return s;
    }
    if (!(s.rawEffects?.length)) { settled.add(s); return s; }
    const filled = fillEmptyEffectsFromRaw(s);
    if (filled === s || !(filled.effects?.length)) { settled.add(s); return s; }
    patchFoodDrinkDescriptions(filled);
    settled.add(filled);
    spells.set(s.id, filled);
    // Keep allSpellDefs in sync for allSpells() / census iterators.
    const idx = spellIndexById.get(s.id);
    if (idx != null && idx >= 0) allSpellDefs[idx] = filled;
    return filled;
  };

  return {
    spell: (id) => {
      const s = spells.get(id);
      return s ? materializeSpell(s) : undefined;
    },
    creature: (entry) => creatures.get(entry),
    creatures: () => [...creatures.values()],
    item: (entry) => items.get(entry),
    items: () => allItemDefs,
    allItems: () => allItemDefs,
    itemCatalogComplete: () => bulkItemsPresent,
    lootTable: (lootId) => ensureLoot(normalizeLootKey(lootId)),
    zoneWorldGen: () => zoneWorldGen(),
    lootKeysForItem: (itemId) => lootKeysForItemImpl(itemId),
    lootHasItem: (lootId, itemId) => {
      if (lootId == null) return false;
      const id = itemId | 0;
      let set = itemLootSets.get(id);
      if (set === undefined) {
        set = new Set(lootKeysForItemImpl(id));
        itemLootSets.set(id, set);
      }
      return set.has(normalizeLootKey(lootId));
    },
    lootTemplateIds: () => {
      if (!compactLoot.size) lootLoader?.();
      if (!compactLoot.size) return [...loot.keys()];
      const ids = [...compactLoot.keys()];
      for (const k of loot.keys()) if (!compactLoot.has(k)) ids.push(k);
      return ids;
    },
    lock: (lockId) => locksById.get(lockId),
    setLootLoader: (fn) => { lootLoader = fn; },
    lootAttached: () => attachedCompact != null,
    ensureLoot: () => {
      if (attachedCompact) return Promise.resolve();
      lootLoader?.();
      if (attachedCompact) return Promise.resolve();
      return new Promise<void>((resolve) => { lootWaiters.push(resolve); });
    },
    attachLoot: (compact) => {
      attachedCompact = compact;
      invalidateItemLootIndex();
      for (const id in compact) {
        const k = normalizeLootKey(id);
        const rows = compact[id]!;
        compactLoot.set(k, rows);
        if (typeof k === 'string' && k.startsWith('go:')) loot.set(k, decodeLootTable(rows));
      }
      sanitizeAttachedLoot();
      dualWriteGoLootDiscoverability(loot, ensureLoot);
      bridgeGoStarterSrcItemLoot(loot, gameObjects, quests.values(), zones, ensureLoot);
      runQuestLootGoBridge();
      // Again after the bridges: sanitizeAttachedLoot's invalidate ran before them.
      invalidateItemLootIndex();
      if (lootWaiters.length) {
        const waiters = lootWaiters;
        lootWaiters = [];
        for (const w of waiters) w();
      }
    },
    attachProfessions: (chunk) => {
      if (chunk.professions) { professionList = chunk.professions; professions.clear(); for (const p of professionList) professions.set(p.id, p); }
      if (chunk.recipes) { recipeList = chunk.recipes; recipes.clear(); for (const r of recipeList) recipes.set(r.id, r); }
      {
        const sliced = ensurePoisonsProfessionSlice({
          professions: professionList,
          recipes: recipeList,
          spellOf: (id) => spells.get(id),
        });
        if (sliced.professions !== professionList) {
          professionList = sliced.professions;
          professions.clear();
          for (const p of professionList) professions.set(p.id, p);
        }
        if (sliced.recipes !== recipeList) {
          recipeList = sliced.recipes;
          recipes.clear();
          for (const r of recipeList) recipes.set(r.id, r);
        }
      }
      if (chunk.gatherNodes) {
        gatherNodeList = chunk.gatherNodes;
        gatherNodes.clear();
        for (const n of chunk.gatherNodes) gatherNodes.set(n.id, n);
        skinGap.invalidate();
      }
      if (chunk.profTrainers) { profTrainers.clear(); for (const t of chunk.profTrainers) profTrainers.set(t.entry, t); }
      if (chunk.skinnable) { skinnable.clear(); for (const s of chunk.skinnable) skinnable.set(s.creature, s.node); skinGap.invalidate(); }
      if (chunk.enchants) { enchantList = chunk.enchants; enchants.clear(); for (const e of enchantList) enchants.set(e.id, e); }
      if (chunk.enchantRods) { enchantRodList = chunk.enchantRods; enchantRods.clear(); for (const r of enchantRodList) enchantRods.set(r.entry, r.tier); }
      if (chunk.disenchantRules) disenchantRules = chunk.disenchantRules;
      runQuestLootGoBridge();
    },
    attachSpells: (chunk) => {
      if (!chunk?.spells?.length) return;
      const added: SpellDef[] = [];
      for (const raw of chunk.spells) {
        if (!spells.has(raw.id)) {
          // Same construction materializers, in the same order.
          const s = withPetLearnTeachesIfEmpty(withResurrectEffectsIfEmpty(withRuntimeSpellFlags(raw)));
          hydrateSpellFormAttrs(s);
          retagBreakableStunOnSpell(s);
          retagDisorientOnSpell(s);
          hydrateSchoolImmunityOnSpell(s);
          stampMissingSpeedFromRaw(s);
          stampMissingRatingBuffsFromRaw(s);
          stampMissingCharmFromRaw(s);
          materializeModHealthRegenInCombat(s);
          materializeModDamagePercentTaken(s);
          materializeSpellReputation(s);
          patchCannibalizeHeal(s);
          const normalized = normalizeIceBlock(s);
          spells.set(normalized.id, normalized);
          added.push(normalized);
        }
      }
      if (added.length > 0) {
        const from = allSpellDefs.length;
        allSpellDefs = allSpellDefs.concat(added);
        reindexSpells(from);
      }
    },
    attachGameObjects: (chunk) => {
      if (!chunk?.gameObjects?.length) return;
      for (const g of chunk.gameObjects) {
        if (!gameObjects.has(g.entry)) {
          gameObjects.set(g.entry, g);
          gameObjectList.push(g);
        }
      }
      // SrcItem ↔ goStarter bridge once GO defs exist (loot may already be attached).
      bridgeGoStarterSrcItemLoot(loot, gameObjects, quests.values(), zones, ensureLoot);
      dualWriteGoLootDiscoverability(loot, ensureLoot);
      patchLegendsOfTheEarthQuest(quests.values(), gameObjects);
      runQuestLootGoBridge();
      invalidateItemLootIndex();
    },
    attachItems: (chunk) => {
      if (!chunk?.items?.length) return;
      const added: ItemDef[] = [];
      for (const it of chunk.items) {
        if (!items.has(it.entry)) {
          items.set(it.entry, it);
          added.push(it);
        }
      }
      if (added.length > 0) {
        allItemDefs = allItemDefs.concat(added);
        // Taming rods may land only in the lazy chunk — stamp useSpell on the new set.
        applyTamingRodUseSpells(added);
      }
      if (allItemDefs.length >= BULK_ITEM_FLOOR) bulkItemsPresent = true;
    },
    attachCreatures: (list) => {
      for (const c of list ?? []) {
        if (creatures.has(c.entry)) continue;
        const name = stripInternalNameTags(c.name);
        creatures.set(c.entry, name === c.name ? c : { ...c, name });
      }
      skinGap.invalidate(); // KI-904/905
      // AFTER the real rows, never at construction: `creatures` is the empty stub there, so
      // stubbing every flight master up front made all 61 hp-1/faction-0. Cite: KI-670.
      ensureFlightMasterCreatures(b.zones ?? [], creatures);
      patchBeliaPetTrainer(b.zones ?? [], creatures);
      patchWindshearVerminDamage(creatures);
      // Creature names power KI-689 quest-loot GO zone co-location.
      runQuestLootGoBridge();
      invalidateItemLootIndex();
      // KI-826 farm scrub needs creature levels — re-run after lazy creatures attach.
      if (quests.size > 0) {
        patchAbsurdQuestFarms(quests.values(), creatures, zones.values());
        rebuildQuestTargetHuntable();
      }
    },
    attachQuests: (list) => {
      for (const q of list ?? []) if (!quests.has(q.entry)) quests.set(q.entry, q);
      sanitizeAttachedLoot();
      // Garment heal quests live in the lazy chunk — patching b.quests at construction ran
      // against the empty stub and never fired. Cite: KI-478.
      patchGarmentHealQuests(quests.values());
      // KI-784: strip classic-db bogus IF Honored gate on Young Crocolisk Skins (484).
      patchBogusQuestMinRepGates(quests.values());
      patchLegendsOfTheEarthQuest(quests.values(), gameObjects);
      // KI-826: strip L42 reverse-loot farms from low-level quests once creatures are present.
      if (creatures.size > 0) patchAbsurdQuestFarms(quests.values(), creatures, zones.values());
      // KI-873: lazy quest rows may carry starterZones the boot stub lacked — re-union.
      if ((list ?? []).length) patchZoneQuestsFromStarterZones(zones.values(), list ?? []);
      // Rebuild after garment heal-proxy killTargets are cleared (KI-1037/1041/1049).
      rebuildQuestTargetHuntable();
      rebuildKillByZone();
      questKillHuntableGen += 1;
      // Lazy quest chunk may arrive after loot/GOs — re-bridge SrcItem goStarters.
      bridgeGoStarterSrcItemLoot(loot, gameObjects, quests.values(), zones, ensureLoot);
      dualWriteGoLootDiscoverability(loot, ensureLoot);
      runQuestLootGoBridge();
      invalidateItemLootIndex();
    },
    attachWorldTables: (extra) => {
      if (!extra) return;
      Object.assign(b, extra);
      npcTextIdx = null; // the only derived read; rebuilt lazily on the next npcText()
    },
    attachSounds: (chunk) => {
      if (!chunk) return;
      // Filled in place so every accessor closure createDataStore already handed out sees them.
      const fill = <V>(m: Map<number, V>, r: Record<number, V> | undefined): void => {
        for (const [k, v] of Object.entries(r ?? {})) m.set(Number(k), v);
      };
      fill(spellSounds, chunk.spellSounds);
      fill(spellImpactSounds, chunk.spellImpactSounds);
      for (const [k, v] of Object.entries(chunk.creatureSounds ?? {})) {
        creatureSounds.set(Number(k), v || {});
      }
      fill(spellSoundStages, chunk.spellSoundStages);
      fill(creatureSoundSets, chunk.creatureSoundSets);
      fill(creatureSoundRef, chunk.creatureSoundRef);
      for (const [k, v] of Object.entries(chunk.raceSoundRef ?? {})) raceSoundRef.set(k, Number(v));
      fill(npcVoiceSets, chunk.npcVoiceSets);
      fill(npcVoiceRef, chunk.npcVoiceRef);
      fill(textVoice, chunk.textVoice);
      fill(creatureWeapons, chunk.creatureWeapons);
      for (const [k, v] of Object.entries(chunk.weaponSounds ?? {})) weaponSounds.set(k, v);
    },
    quest: (entry) => quests.get(entry),
    quests: () => [...quests.values()],
    trainer: (entry) => {
      // Zone lists carry `{ cls, entry }` refs, so accept the bare entry number or the ref object
      // and let a caller passing a zone list element through resolve the same catalog.
      const id =
        typeof entry === 'object' && entry != null && 'entry' in (entry as object)
          ? Number((entry as { entry: number }).entry)
          : Number(entry);
      // Legacy synthetic class-trainer ids (1000+cls) still resolve: KI-918 moved them to
      // 1000*1000+cls, and src_npc_trainer has no rows in 1001-1012, so the old id shadows nothing.
      const t = trainers.get(id) ?? trainers.get(normalizeSyntheticTrainerEntry(id));
      return t ? withCoreTrainerSpells(t) : undefined;
    },
    trainers: () => [...trainers.values()].map((t) => withCoreTrainerSpells(t)),
    vendor: (entry) => vendors.get(entry),
    vendors: () => [...vendors.values()],
    createInfo: (race, cls) => createInfo.get(duoKey(race, cls)),
    levelStats: (race, cls, level) => levelStats.get(triKey(race, cls, level)),
    classLevel: (cls, level) => {
      const r = classLevel.get(duoKey(cls, level));
      return r ? { baseHp: r.baseHp, baseMana: r.baseMana } : undefined;
    },
    creatureClassLvlStats: (level, unitClass) => {
      // ObjectMgr::GetCreatureClassLvlStats validity (ObjectMgr.cpp ~795–796)
      const r = creatureCls.get(duoKey(level, unitClass));
      if (!r) return undefined;
      const stamina = r.stamina ?? 0;
      if ((r.baseHealth !== 0 || stamina > 0) && r.baseDamage > 0.1) return r;
      return undefined;
    },
    petLevelStats: (creatureEntry, level) => {
      const L = Math.max(1, Math.min(60, level | 0));
      const direct = petLvl.get(duoKey(creatureEntry, L));
      if (direct) return direct;
      // Gap-fill: walk down to the nearest lower level present (ObjectMgr.cpp ~3030–3038).
      const levels = petLvlByEntry.get(creatureEntry);
      if (!levels || levels.length === 0) return undefined;
      let best: number | undefined;
      for (const lv of levels) {
        if (lv <= L) best = lv;
        else break;
      }
      return best != null ? petLvl.get(duoKey(creatureEntry, best)) : undefined;
    },
    petAbilityTP: (spellId) => {
      const v = petAbilityTpMap[String(spellId)];
      return typeof v === 'number' && v > 0 ? v : 0;
    },
    petGenericSpells: () => petGenericSpellList,
    weaponEnchantProc: (enchantId: number) => weaponEnchantProcMap[String(enchantId | 0)],
    itemEnchant: (enchantId: number) => itemEnchantMap[String(enchantId | 0)],
    enchantApplicator: (spellId: number) => enchantApplicatorMap[String(spellId | 0)],
    xpToNext: (level) => xp.get(level) ?? Infinity,
    zone: (id) => zonePruned(zones.get(id)),
    // Prune here too — `zones()` used to bypass the filter entirely, so browse and autopilot
    // disagreed about what was fightable in a zone.
    zones: () => b.zones.map((z) => zonePruned(z) as ZoneDef),
    race: (id) => races.get(id),
    races: () => racesList,
    allSpells: () => {
      // Materialize on demand so census / kit builders see filled effects.
      for (let i = 0; i < allSpellDefs.length; i++) {
        allSpellDefs[i] = materializeSpell(allSpellDefs[i]!);
      }
      return allSpellDefs;
    },
    profession: (id) => professions.get(id),
    professions: () => professionList,
    recipe: (id) => recipes.get(id),
    recipes: () => recipeList,
    gatherNode: (id) => gatherNodes.get(id),
    gatherNodes: () => gatherNodeList,
    profTrainer: (entry) => profTrainers.get(entry),
    skinNode: (creatureEntry) => skinGap.resolve(creatureEntry),
    enchant: (id) => enchants.get(id),
    enchants: () => enchantList,
    enchantRodTier: (entry) => enchantRods.get(entry),
    enchantRods: () => enchantRodList,
    disenchantRules: () => disenchantRules,
    instance: (id) => instances.get(id),
    instances: () => instanceList,
    isInstanceCreature: (entry) => raidHuntableBlock.has(entry | 0),
    isBattlegroundCreature: (entry) => bgHuntableBlock.has(entry | 0),
    battlegroundForCreature: (entry) => {
      const e = entry | 0;
      if (!bgHuntableBlock.has(e)) return undefined;
      for (const mapId of CLASSIC_BG_MAP_IDS) {
        if (censusByMap?.[String(mapId)]?.entries?.[String(e)] != null) {
          return CLASSIC_BG_NAME_BY_MAP[mapId as 30 | 489 | 529];
        }
      }
      return undefined;
    },
    instanceForCreature: (entry) => {
      const e = entry | 0;
      // Authored encounter first: it is the only signal that knows which WING fights this
      // creature, and shared maps (SM, BRS, Strat, Dire Maul) would otherwise name the wrong door.
      const byEncounter = instanceList.find((i) => encounterHasCreature(i, e));
      if (byEncounter) return byEncounter;
      const mapId = instanceMapOfCreature(e);
      if (mapId == null) return undefined;
      const onMap = instanceList.filter((i) => i.mapId === mapId);
      if (onMap.length <= 1) return onMap[0];
      // Trash / mid-fight adds no encounter names: fall back to the whole instance, built by
      // cutting the wing suffix off ("Stratholme (Live)" -> "Stratholme"). No suffix, no name.
      const cut = onMap[0]!.name.search(/ - | \(/);
      if (cut <= 0) return undefined;
      const shared = onMap[0]!.name.slice(0, cut);
      return onMap.every((i) => i.name.startsWith(shared)) ? { ...onMap[0]!, name: shared } : undefined;
    },
    talentTrees: (classId) => (treesByClass.get(classId) ?? []).slice().sort((a, b) => a.order - b.order),
    talent: (id) => talentById.get(id),
    trainerClass: (entry) => trainerClass.get(entry | 0) ?? 0,
    // GameObjects (chests/containers/quest nodes) — merge from attach if split
    gameObject: (entry) => gameObjects.get(entry),
    gameObjects: () => gameObjectList,
    itemSet: (id) => itemSets.get(id),
    itemSets: () => itemSetsList,
    botNames: () => botNamePool,
    botSpecs: (cls) => botSpecsByClass.get(cls) ?? [],
    botPopulation: () => b.botPopulation?.classRaceProb ?? {},
    spellStages: (id) => spellSoundStages.get(id),
    creatureSoundSet: (entry) => {
      const sd = creatureSoundRef.get(entry);
      return sd == null ? undefined : creatureSoundSets.get(sd);
    },
    raceSoundSet: (race, gender) => {
      const sd = raceSoundRef.get(`${race}-${gender === 1 ? 1 : 0}`);
      return sd == null ? undefined : creatureSoundSets.get(sd);
    },
    npcVoice: (entry) => {
      const ns = npcVoiceRef.get(entry);
      return ns == null ? undefined : npcVoiceSets.get(ns);
    },
    textVoice: (textId) => textVoice.get(textId),
    clipVolume: (key) => soundClipVolume[key] ?? 1,
    weaponSounds: (subclass, metal) => weaponSounds.get(`${subclass}-${metal ? 1 : 0}`),
    creatureWeapon: (entry) => creatureWeapons.get(entry),
    spellSound: (id) => spellSounds.get(id),
    spellImpact: (id) => spellImpactSounds.get(id),
    creatureSound: (entry) => creatureSounds.get(entry),
    combatSkillMeta: () => combatMeta,
    factions: () => factionsList,
    faction: (id) => factionsById.get(id),
    factionTemplate: (id) => factionTemplatesById.get(id),
    reputationRanks: () => reputationRanksList,
    reputationRates: () => reputationRatesList,
    reputationSpillover: () => reputationSpilloverList,
    explorationBasexp: () => b.explorationBasexp ?? [],
    graveyards: () => b.graveyards ?? [],
    gameEvents: () => b.gameEvents ?? [],
    eventScripts: (eventId: number) => {
      if (!eventId) return [];
      return b.dbScripts?.event?.[String(eventId)] ?? [];
    },
    // GameObject.cpp Use → dbscripts_on_go_template_use (Dark Keeper portraits, …).
    goUseScripts: (goEntry: number) => {
      if (!goEntry) return [];
      return b.dbScripts?.goTemplateUse?.[String(goEntry)] ?? [];
    },
    goGuidUseScripts: (goGuid: number) => {
      if (!goGuid) return [];
      return b.dbScripts?.goUse?.[String(goGuid)] ?? [];
    },
    gossipScripts: (scriptId: number) => {
      if (!scriptId) return [];
      return b.dbScripts?.gossip?.[String(scriptId)] ?? [];
    },
    // Cite: ScriptMgr.cpp:2938–2948 ScriptsStart(SCRIPT_TYPE_RELAY, chosenId).
    relayScripts: (relayId: number) => {
      if (!relayId) return [];
      return b.dbScripts?.relay?.[String(relayId)] ?? [];
    },
    // Cite: WaypointMovementGenerator.cpp:183–186 ScriptsStart(SCRIPT_TYPE_CREATURE_MOVEMENT, …).
    creatureMovementScripts: (scriptId: number) => {
      if (!scriptId) return [];
      return b.dbScripts?.creatureMovement?.[String(scriptId)] ?? [];
    },
    // Cite: Unit.cpp:1382 ScriptsStart(SCRIPT_TYPE_CREATURE_DEATH, victim->GetEntry(), …).
    creatureDeathScripts: (entry: number) => {
      if (!entry) return [];
      return b.dbScripts?.creatureDeath?.[String(entry)] ?? [];
    },
    // Cite: SpellEffects.cpp:1529–1531 / :4189–4191 ScriptsStart(SCRIPT_TYPE_SPELL, …).
    spellScripts: (spellId: number) => {
      if (!spellId) return [];
      return b.dbScripts?.spell?.[String(spellId)] ?? [];
    },
    pools: () => b.pools ?? [],
    zoneWeather: () => b.zoneWeather ?? [],
    conditionsList: () => b.conditions ?? [],
    combatCondition: (id: number) => combatConditionById().get(id | 0),
    unitCondition: (id: number) => unitConditionById().get(id | 0),
    gossipMenus: () => b.gossipMenus ?? [],
    npcText: (id: number) => npcTextById().get(id | 0),
    entranceYards: () => b.entranceYards ?? [],
    itemEnchantmentTemplate: (entry) => b.itemEnchantmentTemplates?.[entry],
    itemRandomProperty: (id) => b.itemRandomProperties?.[id],
    tavernTriggers: () => b.tavernTriggers ?? [],
    areatriggerTeleports: () => b.areatriggerTeleports ?? [],
    ridingSpells: () => b.ridingSpells ?? [],
    spellChain: (spellId) => b.spellChain?.[spellId | 0],
    travelEdges: () => b.travelEdges ?? [],
    travelAnchors: () => b.travelAnchors ?? {},
    taxiNodes: () => b.taxiNodes ?? [],
    taxiRoutes: () => b.taxiRoutes ?? [],
    transports: () => b.transports ?? [],
    spellTeleports: () => b.spellTeleports ?? [],
  };
}
