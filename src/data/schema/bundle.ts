import type {
  CombatConditionDef,
  CreatureClassLvlStatsRow,
  CreatureDef,
  PetLevelStatsRow,
  UnitConditionDef,
} from './creature.ts';

// One spell's sound timeline from SpellVisual: precast, cast, impact and travel, each a variation
// list the player picks one clip from. Stages are independent — an impact without a cast is legal.
export interface SpellSoundStages {
  precast?: string[];
  cast?: string[];
  impact?: string[];
  travel?: string[];
}

// One creature's reaction set from CreatureSoundData, field names following the DBC columns:
// `exertion*` is the creature ATTACKING and `injury*` is it BEING hit. Each is a variation list.
export interface CreatureSoundStages {
  exertion?: string[];      // it swings
  exertionCrit?: string[];  // it crits
  injury?: string[];        // it takes a hit
  injuryCrit?: string[];    // it takes a crit
  crushing?: string[];      // crushing blow (rare in 1.12: 0 rows carry one)
  death?: string[];
  stun?: string[];
  aggro?: string[];
  alert?: string[];         // "PreAggro" — noticed you, not yet engaged
  loop?: string[];          // ambient body loop (elementals, slimes)
}

// One weapon subclass's blow set from WeaponImpactSounds.dbc: the ten ImpactSoundID slots are the SURFACE
// hit (flesh / chain / plate / a metal or wooden shield / a metal or wooden parrying weapon / wood / stone /
// ethereal), named after the SoundEntries they point at; `swing*` is WeaponSwingSounds2 for the subclass's
// ItemSubClass.WeaponSwingSize. Rows are keyed `<subclass>-<0|1>`, 1 = metal (item_template.Material).
export interface WeaponSoundSet {
  flesh?: string[]; fleshCrit?: string[];
  chain?: string[]; chainCrit?: string[];
  plate?: string[]; plateCrit?: string[];
  shieldMetal?: string[]; shieldWood?: string[];
  parryMetal?: string[]; parryWood?: string[];
  wood?: string[]; woodCrit?: string[];
  stone?: string[]; stoneCrit?: string[];
  ethereal?: string[];
  swing?: string[]; swingCrit?: string[];
}

// What a creature swings: creature_equip_template slot 1 as item class/subclass/Material, plus the Material
// of a shield in slot 2. Cite: Creature.cpp:2714-2718 SetVirtualItem (the bytes UNIT_VIRTUAL_ITEM_INFO carries).
export interface CreatureWeapon {
  subclass?: number;
  material?: number;
  shield?: number;
}

// One NPC's gossip voice from NPCSounds.dbc: greeting when the window opens, farewell when it
// closes, pissed on repeat clicks. Each is a variation list, most greetings 5-6 takes.
export interface NpcVoiceStages {
  greeting?: string[];
  farewell?: string[];
  pissed?: string[];
}
import type { InstanceDef } from './encounter.ts';
import type { EnchantApplicatorDef, ItemEnchantDef } from './itemEnchant.ts';
import type {
  FactionDef,
  FactionTemplateDef,
  ReputationRankDef,
  ReputationRateDef,
  ReputationSpilloverDef,
} from './faction.ts';
import type {
  ItemDef,
  ItemSetDef,
  LootTableDef,
  RandomPropertyDef,
} from './item.ts';
import type { NpcTextDef, TrainerDef, VendorDef } from './npc.ts';
import type {
  DisenchantRuleDef,
  EnchantDef,
  EnchantRodDef,
  GameObjectDef,
  GatherNodeDef,
  LockDataDef,
  ProfessionDef,
  ProfTrainerDef,
  RecipeDef,
  SkinnableDef,
} from './profession.ts';
import type { DbScriptRow, QuestDef } from './quest.ts';
import type { SpellDef } from './spell.ts';
import type { BotSpecDef, TalentTreeDef } from './talent.ts';
import type {
  ClassLevelRow,
  CreateInfoDef,
  LevelStatRow,
  RaceDef,
  XpRow,
  ZoneDef,
} from './world.ts';

export interface DataBundle {
  spells: SpellDef[];
  creatures: CreatureDef[];
  items: ItemDef[];
  // Loot is split out of the boot bundle into loot-data.json and attached after mount — 91% of the
  // old bundle for data touched only on a kill. Optional so the slimmed boot tables still type.
  loot?: LootTableDef[];
  quests: QuestDef[];
  trainers: TrainerDef[];
  vendors: VendorDef[];
  createInfo: CreateInfoDef[];
  races?: RaceDef[];         // playable races (Phase 3; optional so a pre-races bake still loads)
  levelStats: LevelStatRow[];
  classLevelStats: ClassLevelRow[];
  // `creature_template_classlevelstats` rows after loader adjustments. Optional: fixtures omit it
  // and SelectLevel falls back to the template Min/Max fields when the CLS lookup returns null.
  creatureClassLevelStats?: CreatureClassLvlStatsRow[];
  // `pet_levelstats` rows for Pet::InitStatsForLevel. Hunter pets use creatureEntry=1 and warlock
  // summons their own entry; without it domain/pet falls back to owner-fraction + template dmg.
  petLevelStats?: PetLevelStatsRow[];
  // Shared "Pet - Generic" skill line (270) stored ONCE instead of stamped on ~316 tameables. `tp`
  // is SkillLineAbility reqtrainpoints raw; Pet::GetTPForSpell subtracts the spent rank.
  petGenericSpells?: { id: number; tp: number; innate?: boolean }[];
  // Training-point cost per FAMILY-line pet ability spell id (only non-zero entries; demon
  // abilities cost 0 and are absent). Same source + subtraction rule as petGenericSpells.
  petAbilityTP?: Record<string, number>;
  // SpellItemEnchantment type-1 (COMBAT_SPELL) payloads by enchant id — the only bake source for
  // what effect 92 does (Windfury Totem 8514 → enchant 1783 → proc 8516 at 20%).
  weaponEnchantProcs?: Record<string, { spellId: number; chancePct?: number; durationMs: number }>;
  // Every SpellItemEnchantment row — what an enchant GRANTS — keyed by enchant id as a string.
  // Superset of weaponEnchantProcs above, which covers only the type-1 proc slot.
  itemEnchants?: Record<string, ItemEnchantDef>;
  // Every apply spell — which slots it may target and for how long — keyed by apply spell id.
  // This is what the "where do you want it?" picker reads.
  enchantApplicators?: Record<string, EnchantApplicatorDef>;
  xp: XpRow[];
  zones: ZoneDef[];
  instances?: InstanceDef[]; // dungeons (Phase 5; optional so a lagging bake can omit it)
  // Professions & economy (Phase 4). Optional because a bundle baked before this
  // slice existed must not crash the store; the dataStore guards each with `?? []`.
  professions?: ProfessionDef[];
  recipes?: RecipeDef[];
  gatherNodes?: GatherNodeDef[];
  profTrainers?: ProfTrainerDef[];
  skinnable?: SkinnableDef[];
  gameObjects?: GameObjectDef[]; // chests / containers / interactables (Item 4 data track)
  // Enchanting (seeded by dev/etl/seed-enchanting.mjs). Optional like the rest of the Phase 4
  // slice so a bundle baked before enchanting existed still loads (dataStore guards with `?? []`).
  enchants?: EnchantDef[];
  enchantRods?: EnchantRodDef[];
  disenchantRules?: DisenchantRuleDef[];
  // Talents (sourced via seed-talents.mjs). Optional so pre-talent bakes load.
  talents?: TalentTreeDef[];
  // Item sets (from ItemSet + ItemSetSpell + item_template.itemset linkage). Baked for S3
  // set-bonus spells. Optional for back-compat.
  itemSets?: ItemSetDef[];
  // Companion name pool from the playerbot module's ai_playerbot_names table (gender 0 male,
  // 1 female). Optional so pre-seed bakes load; squad.ts falls back to a tiny flavour list.
  botNames?: { male: string[]; female: string[] };
  // Premade playerbot talent specs keyed by class id; `link` is a classic Wowhead talent string in
  // the exact order ds.talentTrees() bakes, and `role` is a dungeon-role hint for the hire UI.
  botSpecs?: Record<number, BotSpecDef[]>;
  // Random-bot population weights (AiPlayerbot.ClassRaceProb, 2005 warcraftrealms census
  // per the conf) — "cls.race" -> relative weight. Drives domain/bots/botPool.ts distribution.
  botPopulation?: { classRaceProb: Record<string, number> };
  // Data-mapped sounds (spells and creatures) from the 1.12.1 client DBC chain. Clip keys are
  // relative paths under public/audio/sfx/ without .mp3. Gated on sound.combat.
  spellSounds?: Record<number, string>; // spellId -> clip key (cast/primary sound)
  // Per-spell impact (landing) clips from SpellVisual.ImpactKit → SoundEntries. Optional, so
  // runtime falls back to the school impact table when absent.
  spellImpactSounds?: Record<number, string>; // spellId -> clip key (ImpactKit only)
  creatureSounds?: Record<number, {
    aggro?: string; death?: string; attack?: string; greeting?: string; farewell?: string;
  }>; // creature entry -> first take of each sound
  // The full per-spell stage set. Each stage is a VARIATION LIST — SoundEntries holds up to 10
  // files and the client picks one per play, so playing only the first made every cast identical.
  spellSoundStages?: Record<number, SpellSoundStages>;
  // Creature reaction sets, normalized by CreatureSoundData id — 6671 creatures share only ~263 distinct
  // rows, so the sets are stored once and `creatureSoundRef` points at them.
  creatureSoundSets?: Record<number, CreatureSoundStages>;
  /** creature entry -> CreatureSoundData id (key into `creatureSoundSets`). */
  creatureSoundRef?: Record<number, number>;
  /** `<race>-<gender 0|1>` -> CreatureSoundData id: the player's own body, same 18 sets. */
  raceSoundRef?: Record<string, number>;
  // NPC gossip voice sets, normalized by NPCSounds id — 156 rows cover every talkable NPC in 1.12, so they
  // are stored once and `npcVoiceRef` points at them.
  npcVoiceSets?: Record<number, NpcVoiceStages>;
  /** creature entry -> NPCSounds id. Only NpcFlags != 0 creatures are linked. */
  npcVoiceRef?: Record<number, number>;
  /** `<weaponSubclass>-<metal 0|1>` -> the blow set (30 WeaponImpactSounds rows). */
  weaponSounds?: Record<string, WeaponSoundSet>;
  /** creature entry -> what it swings, for creatures with an equipment template. */
  creatureWeapons?: Record<number, CreatureWeapon>;
  // The recorded line behind a SAY_/YELL_ row: text id -> clip variation set. Negative keys are
  // script_texts entries (boss and instance scripts), positive keys are broadcast_text ids.
  textVoice?: Record<number, string[]>;
  // Clip key → SoundEntries VolumeFloat, emitted only where the client attenuates (1266 clips,
  // 0.69 most common). Playing every rip at full gain is why the combat palette sounded harsh.
  soundClipVolume?: Record<string, number>;
  // Combat skill DBC plus spell links (SkillLine / SkillTiers / SkillRaceClassInfo /
  // SPELL_EFFECT_SKILL). Optional: pre-skill bakes omit it and runtime uses hardcoded fallbacks.
  combatSkillMeta?: {
    categories?: Record<number, number>;
    skillNames?: Record<number, string>;
    tiers?: Record<number, number[]>;
    raceClass?: Array<{
      skillId: number;
      raceMask: number;
      classMask: number;
      flags: number;
      skillTierId: number;
      reqLevel?: number;
    }>;
    spellGrants?: Record<number, number>;
    spellLearnSkills?: Record<number, { skill: number; step: number }>;
    /** SkillLineAbility rows by spell — IsSpellFitByClassAndRace */
    spellAbilities?: Record<number, Array<{ skillId: number; raceMask: number; classMask: number }>>;
    /** spell_learn_spell: learning entry auto-teaches listed SpellIDs */
    spellLearnSpells?: Record<number, number[]>;
  };
  // Reputation (E1). All optional so a pre-reputation bake still loads. Baked from Faction.dbc,
  // creature_onkill_reputation, reputation_spillover_template and reputation_reward_rate.
  factions?: FactionDef[];               // player-tracked reputation factions (repListId >= 0)
  /** FactionTemplate.dbc reaction masks (friendly/neutral/hostile). Baked by enrich-faction-template.mjs.
   *  Absent on pre-faction bundles → domain/creature/faction.ts fails open (no gating). */
  factionTemplates?: FactionTemplateDef[];
  reputationRanks?: ReputationRankDef[]; // the 8 global rank bands (ReputationMgr)
  reputationRates?: ReputationRateDef[];
  reputationSpillover?: ReputationSpilloverDef[];
  // Wave D/E/F bakes, optional. DurabilityCosts.dbc — ItemLevel → multiplier[29] for
  // DurabilityRepair, from datadump/t0/dbc (300 rows, not the truncated 100-row copy).
  durabilityCosts?: {
    rowCount: number;
    source?: string;
    multipliersByItemLevel: Record<string, number[]>;
  };
  // DurabilityQuality.dbc — id → quality_mod float; lookup (Quality+1)*2. Baked by
  // extract-durability-costs.mjs. Cite: Player.cpp:4663; DBCStructure.h:319.
  durabilityQuality?: {
    rowCount: number;
    source?: string;
    qualityModById: Record<string, number>;
  };
  /** exploration_basexp table (E2). */
  explorationBasexp?: Array<{ level: number; basexp: number }>;
  /** game_graveyard_zone (E3a). */
  graveyards?: Array<{
    id: number;
    areaId?: number;
    zoneId?: number | string;
    faction: number;
    linkKind?: number;
    map?: number;
    x?: number;
    y?: number;
    z?: number;
  }>;
  /** game_event + game_event_time (E3a). start/end only when DB provides them. */
  gameEvents?: Array<{
    id: number;
    start?: number;
    end?: number;
    occurence: number;
    length: number;
    scheduleType?: number;
    holiday?: number;
    description?: string;
    linkedTo?: number;
  }>;
  /** pool_template + pool_creature slice (E3a). */
  pools?: Array<{
    id: number;
    maxLimit: number;
    description?: string;
    members: Array<{ guid: number; chance: number; description?: string }>;
  }>;
  /** game_weather (E3a). */
  zoneWeather?: Array<{
    zone: number;
    spring: { rain: number; snow: number; storm: number };
    summer: { rain: number; snow: number; storm: number };
    fall: { rain: number; snow: number; storm: number };
    winter: { rain: number; snow: number; storm: number };
  }>;
  /** conditions table slice (E3a). */
  conditions?: Array<{
    id: number;
    type: number;
    value1: number;
    value2: number;
    value3?: number;
    value4?: number;
    flags?: number;
  }>;
  // unit_condition — the predicate a CombatConditionDef points at. Terms are the source's
  // Variable/Op/Value slots with empty slots dropped. Cite: UnitCondition.cpp Meets.
  unitConditions?: UnitConditionDef[];
  // combat_condition — gates a creature_spell_list row. Cite: Globals/CombatCondition.h;
  // UnitAI.cpp:1218-1224.
  combatConditions?: CombatConditionDef[];
  // QI1 Run H — full dbscripts_on_* streams keyed by script id (string). Per-quest slices also live on
  // QuestDef.rawScripts.
  dbScripts?: {
    questStart?: Record<string, DbScriptRow[]>;
    questEnd?: Record<string, DbScriptRow[]>;
    goUse?: Record<string, DbScriptRow[]>;
    goTemplateUse?: Record<string, DbScriptRow[]>;
    event?: Record<string, DbScriptRow[]>;
    // All five ship in src/data/tables/dbScripts.json (gossip 277 ids) — the type omitted them,
    // so ds.gossipScripts read a key TS said did not exist. Producer: store/rules/core/db-scripts.mjs.
    gossip?: Record<string, DbScriptRow[]>;
    creatureDeath?: Record<string, DbScriptRow[]>;
    creatureMovement?: Record<string, DbScriptRow[]>;
    relay?: Record<string, DbScriptRow[]>;
    spell?: Record<string, DbScriptRow[]>;
  };
  /** gossip_menu + options (E3a). */
  gossipMenus?: Array<{
    menuId: number;
    textId?: number;
    /** gossip_menu.script_id — dbscript run when the menu opens (dbScripts.gossip). */
    scriptId?: number;
    options: Array<{
      id: number;
      icon?: number;
      text: string;
      optionType: number;
      actionMenuId?: number;
      /** gossip_menu_option.action_script_id — dbscript run when the option is picked. */
      actionScriptId?: number;
      conditionId?: number;
      boxMoney?: number;
    }>;
  }>;
  // npc_text bodies by id — the line above the gossip options, joined on `gossipMenus.textId`. Up
  // to 8 weighted slots; `female` appears only when it differs. Cite: ObjectMgr.cpp:5555-5673.
  npcTexts?: NpcTextDef[];
  /** item_enchantment_template keyed by entry (E3b). */
  itemEnchantmentTemplates?: Record<number, Array<{ ench: number; chance: number }>>;
  // ItemRandomProperties.dbc by id: enchantIds for PROP slots plus optional pre-resolved stats for
  // the paperdoll. Baked from FromPatch/t0, not the smaller client dump. Empty is valid.
  itemRandomProperties?: Record<number, RandomPropertyDef>;
  // FLEET-ROADMAP-2 Phase 0 bakes, all optional. Lock.dbc — resolve GameObjectDef.lockId here and
  // consume it through domain/world/openLock.ts.
  locks?: LockDataDef[];
  // areatrigger_teleport + AreaTrigger.dbc positions, evaluated in GetAreaTriggerLockStatus order:
  // level → requiredItem OR requiredItem2 → requiredQuest. Cite: Player.cpp:19906-19984.
  areatriggerTeleports?: Array<{
    id: number; name: string; map: number;
    targetMap: number; targetX: number; targetY: number; targetZ: number; targetO: number;
    requiredLevel?: number; requiredItem?: number; requiredItem2?: number; requiredQuest?: number;
    conditionId?: number; statusFailedText?: string;
    fromZone?: string; toZone?: string;
  }>;
  // areatrigger_tavern rest markers (P0.6), zone-attributed. Engine note for H2: CITY rest must still beat
  // TAVERN (MiscHandler.cpp:710-717 "not overwrite city rest").
  tavernTriggers?: Array<{ id: number; name: string; zone?: string }>;
  // The riding skill line: skill-GRANT spells (effect 118 → skill 762), not SpellDefs in `spells`.
  // `trainerSpell` is the learn wrapper npc_trainer sells; rank is 75 or 150; cost in copper.
  ridingSpells?: Array<{
    id: number; trainerSpell: number; rank: number; step: number; cost: number; reqLevel: number;
  }>;
  // The vanilla spell RANK CHAIN by spell id. It is what makes a talent-gated ability require its
  // talent: only LearnTalent grants rank 1, so a trainer cannot sell rank 2 to an untalented player.
  spellChain?: Record<number, { prev: number; first: number; rank: number; req?: number }>;
  // The 85-node vanilla taxi network (TaxiNodes.dbc). `zone` is the exact .map area attribution,
  // absent outside the 46-zone slice; a faction with a 0 MountCreatureID cannot use the node.
  taxiNodes?: Array<{
    id: number; name: string; map: number; x: number; y: number; z: number;
    zone?: string; faction: 'alliance' | 'horde' | 'both' | 'none';
  }>;
  // TaxiPath.dbc routes: `seconds` is spline arc length / 32 yd/s plus node delays, validated
  // within ±10% of crowd times. `transportPath` marks boat/zep splines that are NEVER flights.
  taxiRoutes?: Array<{
    id: number; from: number; to: number; priceCopper: number; seconds: number;
    transportPath?: boolean;
  }>;
  // Boats, zeppelins and ferries with REAL schedules — an offline port of GenerateWaypoints that
  // reproduces the `transports` table within 0.05%. Departures derive from `now % periodMs`.
  transports?: Array<{
    entry: number; name: string; pathId: number; periodMs: number; storedPeriodMs: number;
    stops: Array<{ zone?: string; map: number; x: number; y: number; z: number; arriveMs: number; departMs: number }>;
    crossings: Array<{ from: string | null; to: string | null; seconds: number }>;
  }>;
  // The zone-graph travel matrix, one entry per zone.neighbors edge: `ground` is navmesh-true
  // yardage, `transport` a transports crossing, `tram` the Deeprun Tram. Seconds derive at runtime.
  travelEdges?: Array<
    | { a: string; b: string; kind: 'ground'; yardsRun: number; yardsSwim: number }
    | { a: string; b: string; kind: 'transport'; transport: number }
    | { a: string; b: string; kind: 'tram'; periodMs: number; oneWaySeconds: number }
    // World teleporter (areatrigger_teleport, e.g. Darnassus↔Rut'theran): DIRECTED a→b; yardsRun = walk
    // from a's anchor to the pad, teleport itself instant. Baked by enrich-portal-edges.mjs.
    | { a: string; b: string; kind: 'portal'; yardsRun: number }
  >;
  // T0.4 hub anchors — the real coordinate each zone's travel distances are measured from, by
  // priority taxi node, innkeeper, graveyard, rect-centre. Every coordinate is sourced.
  travelAnchors?: Record<string, { map: number; x: number; y: number; z: number; source: string }>;
  // Anchor→dungeon-entrance yardages (areatriggerTeleports × AreaTrigger.dbc positions) for the future POI
  // sub-node wave. Baked by enrich-travel-edges.mjs.
  entranceYards?: Array<{ trigger: number; zone: string; yardsRun: number; yardsSwim: number }>;
  // W14 — per-instance creature spawns and creature_movement patrols in server world yards. Mask
  // cells are vmap-internal (MID − x, MID − y). Combat prefers this over pack-clusters coords.
  dungeonSpawns?: {
    generated?: string;
    mid?: number;
    maps: Record<string, {
      slug: string;
      mapId: number;
      dbCount: number;
      bakeCount: number;
      /** L09 — spawns with creature_template.NpcFlags ≠ 0. */
      npcCount?: number;
      npcDbCount?: number;
      spawns: Array<{
        guid: number;
        entry: number;
        map: number;
        x: number;
        y: number;
        z: number;
        o: number;
        spawndist: number;
        MovementType: number;
        poolCandidates?: number[];
        mask: {
          asset: string | null;
          cx: number | null;
          cy: number | null;
          onWalk: boolean;
          status: string;
        };
        path?: Array<{
          x: number; y: number; z: number; o: number; waitMs: number; scriptId?: number;
          mask: { asset: string | null; cx: number | null; cy: number | null; onWalk: boolean; status: string };
        }>;
        pathConnected?: boolean;
        pathOrigin?: string;
        /** creature_template.NpcFlags when ≠ 0 (L09). */
        npcFlags?: number;
        name?: string;
        creatureType?: number;
      }>;
      verify: {
        onWalk: number;
        offWalk: number;
        offFrame: number;
        onWalkFrac: number;
        mt2: { count: number; pathsOk: number; pathsMissing: number; pathDisconnected: number };
      };
    }>;
  };
  // L07 — per-instance gameobject spawns (server world yards). Baked by bake-dungeon-gameobjects.mjs from
  // gameobject + template. lootId is template data1 (GetLootId), not GO entry.
  dungeonGameObjects?: {
    generated?: string;
    maps: Record<string, {
      slug: string;
      mapId: number;
      dbCount: number;
      bakeCount: number;
      objects: Array<{
        guid: number;
        entry: number;
        map: number;
        x: number;
        y: number;
        z: number;
        o: number;
        type: number;
        name: string;
        displayId: number;
        poolCandidates?: number[];
        lockId?: number;
        lootId?: number;
        spawnSecsMin?: number;
        spawnSecsMax?: number;
      }>;
    }>;
  };
  // K4 class-travel destinations: spell_target_position landing points zone-attributed by
  // WorldMapArea rect, with the spell_template reagent gates. Portals have no 1.12 target rows.
  spellTeleports?: Array<{
    spell: number; zone: string; map: number; x: number; y: number; z: number;
    reagents: { item: number; count: number }[];
  }>;
}

/** The twelve sound tables, lifted out of the boot bundle into src/data/sound-data.ts so the menu
 *  does not parse 4.8 MB of clip keys before it paints. Attached via ds.attachSounds. */
export type SoundTables = Pick<
  DataBundle,
  'spellSounds' | 'spellImpactSounds' | 'creatureSounds' | 'spellSoundStages'
  | 'creatureSoundSets' | 'creatureSoundRef' | 'raceSoundRef' | 'npcVoiceSets' | 'npcVoiceRef' | 'textVoice'
  | 'weaponSounds' | 'creatureWeapons'
>;

/** Tables createDataStore reads AT CALL TIME, off the bundle, with no structure derived from them
 *  at construction. That is the whole entry requirement for src/data/world-data.ts: attachWorldTables
 *  is an Object.assign, so a table with construction-time derived state needs its own attach that
 *  rebuilds it (npcTexts is the one exception, and its index is reset on attach). */
export type WorldTables = Pick<
  DataBundle,
  'areatriggerTeleports' | 'botPopulation' | 'conditions' | 'dbScripts' | 'entranceYards'
  | 'explorationBasexp' | 'gameEvents' | 'gossipMenus' | 'graveyards'
  | 'itemEnchantmentTemplates' | 'itemRandomProperties' | 'npcTexts' | 'pools'
  | 'ridingSpells' | 'spellChain' | 'spellTeleports' | 'tavernTriggers' | 'taxiNodes'
  | 'taxiRoutes' | 'transports' | 'travelAnchors' | 'travelEdges' | 'zoneWeather'
>;
