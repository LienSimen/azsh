// QI4 — world/war_effort residuals: each resource turn-in adds its ReqItemCount to the realm AQ
// counter, and quest 8743 Bang a Gong moves the realm to phase 4. Cite: world/war_effort.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface WarEffortQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── AQResources enum (WorldState.h:139–176) ──────────────────────────────────
// Order is the C++ enum ordinal used as counter index.

/** Cite: WorldState.h:141–151 Horde-unique resources (ordinal 0–9). */
export const AQ_PEACEBLOOM = 0;
export const AQ_LEAN_WOLF_STEAK = 1;
export const AQ_TIN_BAR = 2;
export const AQ_WOOL_BANDAGE = 3;
export const AQ_FIREBLOOM = 4;
export const AQ_HEAVY_LEATHER = 5;
export const AQ_MITHRIL_BAR = 6;
export const AQ_MAGEWEAVE_BANDAGE = 7;
export const AQ_RUGGED_LEATHER = 8;
export const AQ_BAKED_SALMON = 9;
/** Cite: WorldState.h:152–162 Alliance-unique resources (ordinal 10–19). */
export const AQ_LIGHT_LEATHER = 10;
export const AQ_LINEN_BANDAGE = 11;
export const AQ_MEDIUM_LEATHER = 12;
export const AQ_STRANGLEKELP = 13;
export const AQ_RAINBOW_FIN_ALBACORE = 14;
export const AQ_IRON_BAR = 15;
export const AQ_ROAST_RAPTOR = 16;
export const AQ_SILK_BANDAGE = 17;
export const AQ_THORIUM_BAR = 18;
export const AQ_ARTHAS_TEARS = 19;
/** Cite: WorldState.h:163–174 shared / faction-split resources (ordinal 20–29). */
export const AQ_COPPER_BAR_ALLY = 20;
export const AQ_PURPLE_LOTUS_ALLY = 21;
export const AQ_THICK_LEATHER_ALLY = 22;
export const AQ_SPOTTED_YELLOWTAIL_ALLY = 23;
export const AQ_RUNECLOTH_BANDAGE_ALLY = 24;
export const AQ_COPPER_BAR_HORDE = 25;
export const AQ_PURPLE_LOTUS_HORDE = 26;
export const AQ_THICK_LEATHER_HORDE = 27;
export const AQ_SPOTTED_YELLOWTAIL_HORDE = 28;
export const AQ_RUNECLOTH_BANDAGE_HORDE = 29;

// ── AQPhase (WorldState.h:187–195) ───────────────────────────────────────────

/** Cite: WorldState.h:189 PHASE_0_DISABLED */
export const PHASE_0_DISABLED = 0;
/** Cite: WorldState.h:190 PHASE_1_GATHERING_RESOURCES */
export const PHASE_1_GATHERING_RESOURCES = 1;
/** Cite: WorldState.h:191 PHASE_2_TRANSPORTING_RESOURCES */
export const PHASE_2_TRANSPORTING_RESOURCES = 2;
/** Cite: WorldState.h:192 PHASE_3_GONG_TIME */
export const PHASE_3_GONG_TIME = 3;
/** Cite: WorldState.h:193 PHASE_4_10_HOUR_WAR */
export const PHASE_4_10_HOUR_WAR = 4;
/** Cite: WorldState.h:194 PHASE_5_DONE */
export const PHASE_5_DONE = 5;

// ── World-state NOW ids (WorldStateDefines.h:76–130 + WorldState.cpp:32–64) ──

/** Cite: WorldStateDefines.h:129 WORLD_STATE_AQ_PEACEBLOOM_NOW */
export const WORLD_STATE_AQ_PEACEBLOOM_NOW = 2021;
/** Cite: WorldStateDefines.h:115 WORLD_STATE_AQ_LEAN_WOLF_STEAK_NOW */
export const WORLD_STATE_AQ_LEAN_WOLF_STEAK_NOW = 2095;
/** Cite: WorldStateDefines.h:91 WORLD_STATE_AQ_TIN_BARS_NOW */
export const WORLD_STATE_AQ_TIN_BARS_NOW = 2005;
/** Cite: WorldStateDefines.h:109 WORLD_STATE_AQ_WOOL_BANDAGE_NOW */
export const WORLD_STATE_AQ_WOOL_BANDAGE_NOW = 2079;
/** Cite: WorldStateDefines.h:105 WORLD_STATE_AQ_FIREBLOOM_NOW */
export const WORLD_STATE_AQ_FIREBLOOM_NOW = 2050;
/** Cite: WorldStateDefines.h:113 WORLD_STATE_AQ_HEAVY_LEATHER_NOW */
export const WORLD_STATE_AQ_HEAVY_LEATHER_NOW = 2066;
/** Cite: WorldStateDefines.h:93 WORLD_STATE_AQ_MITHRIL_BARS_NOW */
export const WORLD_STATE_AQ_MITHRIL_BARS_NOW = 2008;
/** Cite: WorldStateDefines.h:127 WORLD_STATE_AQ_MAGEWEAVE_BANDAGE_NOW */
export const WORLD_STATE_AQ_MAGEWEAVE_BANDAGE_NOW = 2085;
/** Cite: WorldStateDefines.h:107 WORLD_STATE_AQ_RUGGED_LEATHER_NOW */
export const WORLD_STATE_AQ_RUGGED_LEATHER_NOW = 2073;
/** Cite: WorldStateDefines.h:111 WORLD_STATE_AQ_BAKED_SALMON_NOW */
export const WORLD_STATE_AQ_BAKED_SALMON_NOW = 2105;
/** Cite: WorldStateDefines.h:125 WORLD_STATE_AQ_LIGHT_LEATHER_NOW */
export const WORLD_STATE_AQ_LIGHT_LEATHER_NOW = 2060;
/** Cite: WorldStateDefines.h:121 WORLD_STATE_AQ_LINEN_BANDAGE_NOW */
export const WORLD_STATE_AQ_LINEN_BANDAGE_NOW = 2076;
/** Cite: WorldStateDefines.h:101 WORLD_STATE_AQ_MEDIUM_LEATHER_NOW */
export const WORLD_STATE_AQ_MEDIUM_LEATHER_NOW = 2063;
/** Cite: WorldStateDefines.h:99 WORLD_STATE_AQ_STRANGLEKELP_NOW */
export const WORLD_STATE_AQ_STRANGLEKELP_NOW = 2047;
/** Cite: WorldStateDefines.h:103 WORLD_STATE_AQ_RAINBOW_FIN_ALBACORE_NOW */
export const WORLD_STATE_AQ_RAINBOW_FIN_ALBACORE_NOW = 2092;
/** Cite: WorldStateDefines.h:95 WORLD_STATE_AQ_IRON_BARS_NOW */
export const WORLD_STATE_AQ_IRON_BARS_NOW = 2002;
/** Cite: WorldStateDefines.h:123 WORLD_STATE_AQ_ROAST_RAPTOR_NOW */
export const WORLD_STATE_AQ_ROAST_RAPTOR_NOW = 2098;
/** Cite: WorldStateDefines.h:119 WORLD_STATE_AQ_SILK_BANDAGE_NOW */
export const WORLD_STATE_AQ_SILK_BANDAGE_NOW = 2082;
/** Cite: WorldStateDefines.h:97 WORLD_STATE_AQ_THORIUM_BARS_NOW */
export const WORLD_STATE_AQ_THORIUM_BARS_NOW = 2011;
/** Cite: WorldStateDefines.h:117 WORLD_STATE_AQ_ARTHAS_TEARS_NOW */
export const WORLD_STATE_AQ_ARTHAS_TEARS_NOW = 2057;
/** Cite: WorldStateDefines.h:76 WORLD_STATE_AQ_COPPER_BARS_ALLY_NOW */
export const WORLD_STATE_AQ_COPPER_BARS_ALLY_NOW = 1997;
/** Cite: WorldStateDefines.h:79 WORLD_STATE_AQ_PURPLE_LOTUS_ALLY_NOW */
export const WORLD_STATE_AQ_PURPLE_LOTUS_ALLY_NOW = 2053;
/** Cite: WorldStateDefines.h:88 WORLD_STATE_AQ_THICK_LEATHER_ALLY_NOW */
export const WORLD_STATE_AQ_THICK_LEATHER_ALLY_NOW = 2069;
/** Cite: WorldStateDefines.h:85 WORLD_STATE_AQ_SPOTTED_YELLOWTAIL_ALLY_NOW */
export const WORLD_STATE_AQ_SPOTTED_YELLOWTAIL_ALLY_NOW = 2101;
/** Cite: WorldStateDefines.h:82 WORLD_STATE_AQ_RUNECLOTH_BANDAGE_ALLY_NOW */
export const WORLD_STATE_AQ_RUNECLOTH_BANDAGE_ALLY_NOW = 2088;
/** Cite: WorldStateDefines.h:78 WORLD_STATE_AQ_COPPER_BARS_HORDE_NOW */
export const WORLD_STATE_AQ_COPPER_BARS_HORDE_NOW = 2018;
/** Cite: WorldStateDefines.h:81 WORLD_STATE_AQ_PURPLE_LOTUS_HORDE_NOW */
export const WORLD_STATE_AQ_PURPLE_LOTUS_HORDE_NOW = 2054;
/** Cite: WorldStateDefines.h:90 WORLD_STATE_AQ_THICK_LEATHER_HORDE_NOW */
export const WORLD_STATE_AQ_THICK_LEATHER_HORDE_NOW = 2070;
/** Cite: WorldStateDefines.h:87 WORLD_STATE_AQ_SPOTTED_YELLOWTAIL_HORDE_NOW */
export const WORLD_STATE_AQ_SPOTTED_YELLOWTAIL_HORDE_NOW = 2102;
/** Cite: WorldStateDefines.h:84 WORLD_STATE_AQ_RUNECLOTH_BANDAGE_HORDE_NOW */
export const WORLD_STATE_AQ_RUNECLOTH_BANDAGE_HORDE_NOW = 2089;

// ── Quest ids (war_effort.cpp:25–115) ────────────────────────────────────────

export const QUEST_ALLIANCE_COPPER_BARS_1 = 8492;
export const QUEST_ALLIANCE_COPPER_BARS_2 = 8493;
export const QUEST_HORDE_COPPER_BARS_1 = 8532;
export const QUEST_HORDE_COPPER_BARS_2 = 8533;
export const QUEST_ALLIANCE_PURPLE_LOTUS_1 = 8505;
export const QUEST_ALLIANCE_PURPLE_LOTUS_2 = 8506;
export const QUEST_HORDE_PURPLE_LOTUS_1 = 8582;
export const QUEST_HORDE_PURPLE_LOTUS_2 = 8583;
export const QUEST_HORDE_PEACEBLOOM_1 = 8549;
export const QUEST_HORDE_PEACEBLOOM_2 = 8550;
export const QUEST_ALLIANCE_LINEN_BANDAGE_1 = 8517;
export const QUEST_ALLIANCE_LINEN_BANDAGE_2 = 8518;
export const QUEST_ALLIANCE_RAINBOW_FIN_ALBACORE_1 = 8524;
export const QUEST_ALLIANCE_RAINBOW_FIN_ALBACORE_2 = 8525;
export const QUEST_ALLIANCE_LIGHT_LEATHER_1 = 8511;
export const QUEST_ALLIANCE_LIGHT_LEATHER_2 = 8512;
export const QUEST_HORDE_WOOL_BANDAGES_1 = 8604;
export const QUEST_HORDE_WOOL_BANDAGES_2 = 8605;
export const QUEST_ALLIANCE_STRANGLEKELP_1 = 8503;
export const QUEST_ALLIANCE_STRANGLEKELP_2 = 8504;
export const QUEST_ALLIANCE_MEDIUM_LEATHER_1 = 8513;
export const QUEST_ALLIANCE_MEDIUM_LEATHER_2 = 8514;
export const QUEST_HORDE_LEAN_WOLF_STEAKS_1 = 8611;
export const QUEST_HORDE_LEAN_WOLF_STEAKS_2 = 8612;
export const QUEST_HORDE_TIN_BARS_1 = 8542;
export const QUEST_HORDE_TIN_BARS_2 = 8543;
export const QUEST_ALLIANCE_SILK_BANDAGES_1 = 8520;
export const QUEST_ALLIANCE_SILK_BANDAGES_2 = 8521;
export const QUEST_ALLIANCE_IRON_BARS_1 = 8494;
export const QUEST_ALLIANCE_IRON_BARS_2 = 8495;
export const QUEST_ALLIANCE_ROAST_RAPTOR_1 = 8526;
export const QUEST_ALLIANCE_ROAST_RAPTOR_2 = 8527;
export const QUEST_HORDE_FIREBLOOM_1 = 8580;
export const QUEST_HORDE_FIREBLOOM_2 = 8581;
export const QUEST_HORDE_HEAVY_LEATHER_1 = 8588;
export const QUEST_HORDE_HEAVY_LEATHER_2 = 8589;
export const QUEST_ALLIANCE_SPOTTED_YELLOWTAIL_1 = 8528;
export const QUEST_ALLIANCE_SPOTTED_YELLOWTAIL_2 = 8529;
export const QUEST_HORDE_SPOTTED_YELLOWTAIL_1 = 8613;
export const QUEST_HORDE_SPOTTED_YELLOWTAIL_2 = 8614;
export const QUEST_ALLIANCE_THICK_LEATHER_1 = 8515;
export const QUEST_ALLIANCE_THICK_LEATHER_2 = 8516;
export const QUEST_HORDE_THICK_LEATHER_1 = 8590;
export const QUEST_HORDE_THICK_LEATHER_2 = 8591;
export const QUEST_HORDE_MITHRIL_BARS_1 = 8545;
export const QUEST_HORDE_MITHRIL_BARS_2 = 8546;
export const QUEST_ALLIANCE_RUNECLOTH_BANDAGES_1 = 8522;
export const QUEST_ALLIANCE_RUNECLOTH_BANDAGES_2 = 8523;
export const QUEST_HORDE_RUNECLOTH_BANDAGES_1 = 8609;
export const QUEST_HORDE_RUNECLOTH_BANDAGES_2 = 8610;
export const QUEST_ALLIANCE_ARTHAS_TEARS_1 = 8509;
export const QUEST_ALLIANCE_ARTHAS_TEARS_2 = 8510;
export const QUEST_ALLIANCE_THORIUM_BARS_1 = 8499;
export const QUEST_ALLIANCE_THORIUM_BARS_2 = 8500;
export const QUEST_HORDE_BAKED_SALMON_1 = 8615;
export const QUEST_HORDE_BAKED_SALMON_2 = 8616;
export const QUEST_HORDE_RUGGED_LEATHER_1 = 8600;
export const QUEST_HORDE_RUGGED_LEATHER_2 = 8601;
export const QUEST_HORDE_MAGEWEAVE_BANDAGE_1 = 8607;
export const QUEST_HORDE_MAGEWEAVE_BANDAGE_2 = 8608;
/** Cite: war_effort.cpp:112 QUEST_BANG_A_GONG */
export const QUEST_BANG_A_GONG = 8743;

// ── Bang-a-gong + Silithus residual constants ────────────────────────────────

/** Cite: war_effort.cpp:114 SAY_BANG_GONG = 11427 */
export const SAY_BANG_GONG = 11427;
/** Cite: war_effort.cpp:115 SAY_QIRAJI_BREAK = 11432 */
export const SAY_QIRAJI_BREAK = 11432;
// Cite: world_kalimdor.h:48 TYPE_GONG_TIME = 4 go reward SetData(TYPE_GONG_TIME, 0) when phase is gong
// time.
export const TYPE_GONG_TIME = 4;
/** Cite: classic-db gameobject_questrelation/involvedrelation (180717,8743) go_scarab_gong Script Name. */
export const GO_SCARAB_GONG = 180717;
/** Cite: classic-db quest_template 8743 ReqItemId1=21175 (The Scepter of the Shifting Sands). */
export const ITEM_SCEPTER_OF_THE_SHIFTING_SANDS = 21175;
/** Cite: classic-db quest_template 8743 PrevQuestId=8742 The Might of Kalimdor. */
export const QUEST_THE_MIGHT_OF_KALIMDOR = 8742;

// ── classic-db ReqItemId1 / ReqItemCount1 per quest ──────────────────────────
// Source: ClassicDB quest_template. C++: war_effort.cpp:120 quest->ReqItemCount[0].

export interface WarEffortResourceDelivery {
  /** AQResources ordinal — WorldState.h enum. */
  resource: number;
  /** WORLD_STATE_AQ_*_NOW id written by AddWarEffortProgress. */
  worldstateId: number;
  /** classic-db ReqItemCount1 (= C++ ReqItemCount[0]). */
  itemCount: number;
  /** classic-db ReqItemId1 (objective item). */
  itemId: number;
  /** classic-db creature_involvedrelation ender (collector NPC). */
  enderNpc: number;
}

// Quest id → resource delivery residual. Switch body: war_effort.cpp:122–187; worldstate map:
// WorldState.cpp:32–64. itemCount/itemId/ender: classic-db quest_template + creature_involvedrelation.
export const WAR_EFFORT_DELIVERIES: Readonly<Record<number, WarEffortResourceDelivery>> = {
  // copper bars
  [QUEST_ALLIANCE_COPPER_BARS_1]: {
    resource: AQ_COPPER_BAR_ALLY,
    worldstateId: WORLD_STATE_AQ_COPPER_BARS_ALLY_NOW,
    itemCount: 20,
    itemId: 2840,
    enderNpc: 15383,
  },
  [QUEST_ALLIANCE_COPPER_BARS_2]: {
    resource: AQ_COPPER_BAR_ALLY,
    worldstateId: WORLD_STATE_AQ_COPPER_BARS_ALLY_NOW,
    itemCount: 20,
    itemId: 2840,
    enderNpc: 15383,
  },
  [QUEST_HORDE_COPPER_BARS_1]: {
    resource: AQ_COPPER_BAR_HORDE,
    worldstateId: WORLD_STATE_AQ_COPPER_BARS_HORDE_NOW,
    itemCount: 20,
    itemId: 2840,
    enderNpc: 15459,
  },
  [QUEST_HORDE_COPPER_BARS_2]: {
    resource: AQ_COPPER_BAR_HORDE,
    worldstateId: WORLD_STATE_AQ_COPPER_BARS_HORDE_NOW,
    itemCount: 20,
    itemId: 2840,
    enderNpc: 15459,
  },
  // purple lotus
  [QUEST_ALLIANCE_PURPLE_LOTUS_1]: {
    resource: AQ_PURPLE_LOTUS_ALLY,
    worldstateId: WORLD_STATE_AQ_PURPLE_LOTUS_ALLY_NOW,
    itemCount: 20,
    itemId: 8831,
    enderNpc: 15437,
  },
  [QUEST_ALLIANCE_PURPLE_LOTUS_2]: {
    resource: AQ_PURPLE_LOTUS_ALLY,
    worldstateId: WORLD_STATE_AQ_PURPLE_LOTUS_ALLY_NOW,
    itemCount: 20,
    itemId: 8831,
    enderNpc: 15437,
  },
  [QUEST_HORDE_PURPLE_LOTUS_1]: {
    resource: AQ_PURPLE_LOTUS_HORDE,
    worldstateId: WORLD_STATE_AQ_PURPLE_LOTUS_HORDE_NOW,
    itemCount: 20,
    itemId: 8831,
    enderNpc: 15512,
  },
  [QUEST_HORDE_PURPLE_LOTUS_2]: {
    resource: AQ_PURPLE_LOTUS_HORDE,
    worldstateId: WORLD_STATE_AQ_PURPLE_LOTUS_HORDE_NOW,
    itemCount: 20,
    itemId: 8831,
    enderNpc: 15512,
  },
  // spotted yellowtail
  [QUEST_ALLIANCE_SPOTTED_YELLOWTAIL_1]: {
    resource: AQ_SPOTTED_YELLOWTAIL_ALLY,
    worldstateId: WORLD_STATE_AQ_SPOTTED_YELLOWTAIL_ALLY_NOW,
    itemCount: 20,
    itemId: 6887,
    enderNpc: 15457,
  },
  [QUEST_ALLIANCE_SPOTTED_YELLOWTAIL_2]: {
    resource: AQ_SPOTTED_YELLOWTAIL_ALLY,
    worldstateId: WORLD_STATE_AQ_SPOTTED_YELLOWTAIL_ALLY_NOW,
    itemCount: 20,
    itemId: 6887,
    enderNpc: 15457,
  },
  [QUEST_HORDE_SPOTTED_YELLOWTAIL_1]: {
    resource: AQ_SPOTTED_YELLOWTAIL_HORDE,
    worldstateId: WORLD_STATE_AQ_SPOTTED_YELLOWTAIL_HORDE_NOW,
    itemCount: 20,
    itemId: 6887,
    enderNpc: 15534,
  },
  [QUEST_HORDE_SPOTTED_YELLOWTAIL_2]: {
    resource: AQ_SPOTTED_YELLOWTAIL_HORDE,
    worldstateId: WORLD_STATE_AQ_SPOTTED_YELLOWTAIL_HORDE_NOW,
    itemCount: 20,
    itemId: 6887,
    enderNpc: 15534,
  },
  // thick leather
  [QUEST_ALLIANCE_THICK_LEATHER_1]: {
    resource: AQ_THICK_LEATHER_ALLY,
    worldstateId: WORLD_STATE_AQ_THICK_LEATHER_ALLY_NOW,
    itemCount: 10,
    itemId: 4304,
    enderNpc: 15450,
  },
  [QUEST_ALLIANCE_THICK_LEATHER_2]: {
    resource: AQ_THICK_LEATHER_ALLY,
    worldstateId: WORLD_STATE_AQ_THICK_LEATHER_ALLY_NOW,
    itemCount: 10,
    itemId: 4304,
    enderNpc: 15450,
  },
  [QUEST_HORDE_THICK_LEATHER_1]: {
    resource: AQ_THICK_LEATHER_HORDE,
    worldstateId: WORLD_STATE_AQ_THICK_LEATHER_HORDE_NOW,
    itemCount: 10,
    itemId: 4304,
    enderNpc: 15522,
  },
  [QUEST_HORDE_THICK_LEATHER_2]: {
    resource: AQ_THICK_LEATHER_HORDE,
    worldstateId: WORLD_STATE_AQ_THICK_LEATHER_HORDE_NOW,
    itemCount: 10,
    itemId: 4304,
    enderNpc: 15522,
  },
  // runecloth bandages
  [QUEST_ALLIANCE_RUNECLOTH_BANDAGES_1]: {
    resource: AQ_RUNECLOTH_BANDAGE_ALLY,
    worldstateId: WORLD_STATE_AQ_RUNECLOTH_BANDAGE_ALLY_NOW,
    itemCount: 20,
    itemId: 14529,
    enderNpc: 15453,
  },
  [QUEST_ALLIANCE_RUNECLOTH_BANDAGES_2]: {
    resource: AQ_RUNECLOTH_BANDAGE_ALLY,
    worldstateId: WORLD_STATE_AQ_RUNECLOTH_BANDAGE_ALLY_NOW,
    itemCount: 20,
    itemId: 14529,
    enderNpc: 15453,
  },
  [QUEST_HORDE_RUNECLOTH_BANDAGES_1]: {
    resource: AQ_RUNECLOTH_BANDAGE_HORDE,
    worldstateId: WORLD_STATE_AQ_RUNECLOTH_BANDAGE_HORDE_NOW,
    itemCount: 20,
    itemId: 14529,
    enderNpc: 15532,
  },
  [QUEST_HORDE_RUNECLOTH_BANDAGES_2]: {
    resource: AQ_RUNECLOTH_BANDAGE_HORDE,
    worldstateId: WORLD_STATE_AQ_RUNECLOTH_BANDAGE_HORDE_NOW,
    itemCount: 20,
    itemId: 14529,
    enderNpc: 15532,
  },
  // horde-only
  [QUEST_HORDE_PEACEBLOOM_1]: {
    resource: AQ_PEACEBLOOM,
    worldstateId: WORLD_STATE_AQ_PEACEBLOOM_NOW,
    itemCount: 20,
    itemId: 2447,
    enderNpc: 15477,
  },
  [QUEST_HORDE_PEACEBLOOM_2]: {
    resource: AQ_PEACEBLOOM,
    worldstateId: WORLD_STATE_AQ_PEACEBLOOM_NOW,
    itemCount: 20,
    itemId: 2447,
    enderNpc: 15477,
  },
  [QUEST_HORDE_WOOL_BANDAGES_1]: {
    resource: AQ_WOOL_BANDAGE,
    worldstateId: WORLD_STATE_AQ_WOOL_BANDAGE_NOW,
    itemCount: 20,
    itemId: 3530,
    enderNpc: 15528,
  },
  [QUEST_HORDE_WOOL_BANDAGES_2]: {
    resource: AQ_WOOL_BANDAGE,
    worldstateId: WORLD_STATE_AQ_WOOL_BANDAGE_NOW,
    itemCount: 20,
    itemId: 3530,
    enderNpc: 15528,
  },
  [QUEST_HORDE_LEAN_WOLF_STEAKS_1]: {
    resource: AQ_LEAN_WOLF_STEAK,
    worldstateId: WORLD_STATE_AQ_LEAN_WOLF_STEAK_NOW,
    itemCount: 20,
    itemId: 12209,
    enderNpc: 15533,
  },
  [QUEST_HORDE_LEAN_WOLF_STEAKS_2]: {
    resource: AQ_LEAN_WOLF_STEAK,
    worldstateId: WORLD_STATE_AQ_LEAN_WOLF_STEAK_NOW,
    itemCount: 20,
    itemId: 12209,
    enderNpc: 15533,
  },
  [QUEST_HORDE_TIN_BARS_1]: {
    resource: AQ_TIN_BAR,
    worldstateId: WORLD_STATE_AQ_TIN_BARS_NOW,
    itemCount: 20,
    itemId: 3576,
    enderNpc: 15460,
  },
  [QUEST_HORDE_TIN_BARS_2]: {
    resource: AQ_TIN_BAR,
    worldstateId: WORLD_STATE_AQ_TIN_BARS_NOW,
    itemCount: 20,
    itemId: 3576,
    enderNpc: 15460,
  },
  [QUEST_HORDE_FIREBLOOM_1]: {
    resource: AQ_FIREBLOOM,
    worldstateId: WORLD_STATE_AQ_FIREBLOOM_NOW,
    itemCount: 20,
    itemId: 4625,
    enderNpc: 15508,
  },
  [QUEST_HORDE_FIREBLOOM_2]: {
    resource: AQ_FIREBLOOM,
    worldstateId: WORLD_STATE_AQ_FIREBLOOM_NOW,
    itemCount: 20,
    itemId: 4625,
    enderNpc: 15508,
  },
  [QUEST_HORDE_HEAVY_LEATHER_1]: {
    resource: AQ_HEAVY_LEATHER,
    worldstateId: WORLD_STATE_AQ_HEAVY_LEATHER_NOW,
    itemCount: 10,
    itemId: 4234,
    enderNpc: 15515,
  },
  [QUEST_HORDE_HEAVY_LEATHER_2]: {
    resource: AQ_HEAVY_LEATHER,
    worldstateId: WORLD_STATE_AQ_HEAVY_LEATHER_NOW,
    itemCount: 10,
    itemId: 4234,
    enderNpc: 15515,
  },
  [QUEST_HORDE_MITHRIL_BARS_1]: {
    resource: AQ_MITHRIL_BAR,
    worldstateId: WORLD_STATE_AQ_MITHRIL_BARS_NOW,
    itemCount: 20,
    itemId: 3860,
    enderNpc: 15469,
  },
  [QUEST_HORDE_MITHRIL_BARS_2]: {
    resource: AQ_MITHRIL_BAR,
    worldstateId: WORLD_STATE_AQ_MITHRIL_BARS_NOW,
    itemCount: 20,
    itemId: 3860,
    enderNpc: 15469,
  },
  [QUEST_HORDE_BAKED_SALMON_1]: {
    resource: AQ_BAKED_SALMON,
    worldstateId: WORLD_STATE_AQ_BAKED_SALMON_NOW,
    itemCount: 20,
    itemId: 13935,
    enderNpc: 15535,
  },
  [QUEST_HORDE_BAKED_SALMON_2]: {
    resource: AQ_BAKED_SALMON,
    worldstateId: WORLD_STATE_AQ_BAKED_SALMON_NOW,
    itemCount: 20,
    itemId: 13935,
    enderNpc: 15535,
  },
  [QUEST_HORDE_RUGGED_LEATHER_1]: {
    resource: AQ_RUGGED_LEATHER,
    worldstateId: WORLD_STATE_AQ_RUGGED_LEATHER_NOW,
    itemCount: 10,
    itemId: 8170,
    enderNpc: 15525,
  },
  [QUEST_HORDE_RUGGED_LEATHER_2]: {
    resource: AQ_RUGGED_LEATHER,
    worldstateId: WORLD_STATE_AQ_RUGGED_LEATHER_NOW,
    itemCount: 10,
    itemId: 8170,
    enderNpc: 15525,
  },
  [QUEST_HORDE_MAGEWEAVE_BANDAGE_1]: {
    resource: AQ_MAGEWEAVE_BANDAGE,
    worldstateId: WORLD_STATE_AQ_MAGEWEAVE_BANDAGE_NOW,
    itemCount: 20,
    itemId: 8544,
    enderNpc: 15529,
  },
  [QUEST_HORDE_MAGEWEAVE_BANDAGE_2]: {
    resource: AQ_MAGEWEAVE_BANDAGE,
    worldstateId: WORLD_STATE_AQ_MAGEWEAVE_BANDAGE_NOW,
    itemCount: 20,
    itemId: 8544,
    enderNpc: 15529,
  },
  // alliance-only
  [QUEST_ALLIANCE_LINEN_BANDAGE_1]: {
    resource: AQ_LINEN_BANDAGE,
    worldstateId: WORLD_STATE_AQ_LINEN_BANDAGE_NOW,
    itemCount: 20,
    itemId: 1251,
    enderNpc: 15451,
  },
  [QUEST_ALLIANCE_LINEN_BANDAGE_2]: {
    resource: AQ_LINEN_BANDAGE,
    worldstateId: WORLD_STATE_AQ_LINEN_BANDAGE_NOW,
    itemCount: 20,
    itemId: 1251,
    enderNpc: 15451,
  },
  [QUEST_ALLIANCE_RAINBOW_FIN_ALBACORE_1]: {
    resource: AQ_RAINBOW_FIN_ALBACORE,
    worldstateId: WORLD_STATE_AQ_RAINBOW_FIN_ALBACORE_NOW,
    itemCount: 20,
    itemId: 5095,
    enderNpc: 15455,
  },
  [QUEST_ALLIANCE_RAINBOW_FIN_ALBACORE_2]: {
    resource: AQ_RAINBOW_FIN_ALBACORE,
    worldstateId: WORLD_STATE_AQ_RAINBOW_FIN_ALBACORE_NOW,
    itemCount: 20,
    itemId: 5095,
    enderNpc: 15455,
  },
  [QUEST_ALLIANCE_LIGHT_LEATHER_1]: {
    resource: AQ_LIGHT_LEATHER,
    worldstateId: WORLD_STATE_AQ_LIGHT_LEATHER_NOW,
    itemCount: 10,
    itemId: 2318,
    enderNpc: 15446,
  },
  [QUEST_ALLIANCE_LIGHT_LEATHER_2]: {
    resource: AQ_LIGHT_LEATHER,
    worldstateId: WORLD_STATE_AQ_LIGHT_LEATHER_NOW,
    itemCount: 10,
    itemId: 2318,
    enderNpc: 15446,
  },
  [QUEST_ALLIANCE_STRANGLEKELP_1]: {
    resource: AQ_STRANGLEKELP,
    worldstateId: WORLD_STATE_AQ_STRANGLEKELP_NOW,
    itemCount: 20,
    itemId: 3820,
    enderNpc: 15434,
  },
  [QUEST_ALLIANCE_STRANGLEKELP_2]: {
    resource: AQ_STRANGLEKELP,
    worldstateId: WORLD_STATE_AQ_STRANGLEKELP_NOW,
    itemCount: 20,
    itemId: 3820,
    enderNpc: 15434,
  },
  [QUEST_ALLIANCE_MEDIUM_LEATHER_1]: {
    resource: AQ_MEDIUM_LEATHER,
    worldstateId: WORLD_STATE_AQ_MEDIUM_LEATHER_NOW,
    itemCount: 10,
    itemId: 2319,
    enderNpc: 15448,
  },
  [QUEST_ALLIANCE_MEDIUM_LEATHER_2]: {
    resource: AQ_MEDIUM_LEATHER,
    worldstateId: WORLD_STATE_AQ_MEDIUM_LEATHER_NOW,
    itemCount: 10,
    itemId: 2319,
    enderNpc: 15448,
  },
  [QUEST_ALLIANCE_SILK_BANDAGES_1]: {
    resource: AQ_SILK_BANDAGE,
    worldstateId: WORLD_STATE_AQ_SILK_BANDAGE_NOW,
    itemCount: 20,
    itemId: 6450,
    enderNpc: 15452,
  },
  [QUEST_ALLIANCE_SILK_BANDAGES_2]: {
    resource: AQ_SILK_BANDAGE,
    worldstateId: WORLD_STATE_AQ_SILK_BANDAGE_NOW,
    itemCount: 20,
    itemId: 6450,
    enderNpc: 15452,
  },
  [QUEST_ALLIANCE_IRON_BARS_1]: {
    resource: AQ_IRON_BAR,
    worldstateId: WORLD_STATE_AQ_IRON_BARS_NOW,
    itemCount: 20,
    itemId: 3575,
    enderNpc: 15431,
  },
  [QUEST_ALLIANCE_IRON_BARS_2]: {
    resource: AQ_IRON_BAR,
    worldstateId: WORLD_STATE_AQ_IRON_BARS_NOW,
    itemCount: 20,
    itemId: 3575,
    enderNpc: 15431,
  },
  [QUEST_ALLIANCE_ROAST_RAPTOR_1]: {
    resource: AQ_ROAST_RAPTOR,
    worldstateId: WORLD_STATE_AQ_ROAST_RAPTOR_NOW,
    itemCount: 20,
    itemId: 12210,
    enderNpc: 15456,
  },
  [QUEST_ALLIANCE_ROAST_RAPTOR_2]: {
    resource: AQ_ROAST_RAPTOR,
    worldstateId: WORLD_STATE_AQ_ROAST_RAPTOR_NOW,
    itemCount: 20,
    itemId: 12210,
    enderNpc: 15456,
  },
  [QUEST_ALLIANCE_ARTHAS_TEARS_1]: {
    resource: AQ_ARTHAS_TEARS,
    worldstateId: WORLD_STATE_AQ_ARTHAS_TEARS_NOW,
    itemCount: 20,
    itemId: 8836,
    enderNpc: 15445,
  },
  [QUEST_ALLIANCE_ARTHAS_TEARS_2]: {
    resource: AQ_ARTHAS_TEARS,
    worldstateId: WORLD_STATE_AQ_ARTHAS_TEARS_NOW,
    itemCount: 20,
    itemId: 8836,
    enderNpc: 15445,
  },
  [QUEST_ALLIANCE_THORIUM_BARS_1]: {
    resource: AQ_THORIUM_BAR,
    worldstateId: WORLD_STATE_AQ_THORIUM_BARS_NOW,
    itemCount: 20,
    itemId: 12359,
    enderNpc: 15432,
  },
  [QUEST_ALLIANCE_THORIUM_BARS_2]: {
    resource: AQ_THORIUM_BAR,
    worldstateId: WORLD_STATE_AQ_THORIUM_BARS_NOW,
    itemCount: 20,
    itemId: 12359,
    enderNpc: 15432,
  },
};

/** All claim-list quest ids for this family. */
export const WAR_EFFORT_QUEST_IDS: readonly number[] = [
  ...Object.keys(WAR_EFFORT_DELIVERIES).map(Number),
  QUEST_BANG_A_GONG,
].sort((a, b) => a - b);

// ── residual runners ─────────────────────────────────────────────────────────

// QuestRewarded_war_effort for an NPC resource turn-in: map the quest to its AQResources and add
// ReqItemCount[0]. The zone model emits it from a zeroed counter. Cite: war_effort.cpp:118–192.
function runNpcResourceReward(questId: number): DbScriptIntent[] {
  const d = WAR_EFFORT_DELIVERIES[questId];
  if (!d) return [];
  return [
    {
      kind: 'skip',
      reason:
        `QuestRewarded_war_effort NPC: turn-in ${questId} to collector ${d.enderNpc}; ` +
        `ReqItem ${d.itemId}×${d.itemCount} → AddWarEffortProgress(AQ resource ${d.resource}, ${d.itemCount})`,
      cite: 'war_effort.cpp:118–191 QuestRewarded_war_effort(Player,Creature,Quest)',
    },
    {
      kind: 'set_worldstate',
      worldstateId: d.worldstateId,
      value: d.itemCount,
      cite:
        `war_effort.cpp:190 AddWarEffortProgress(resource=${d.resource}, count=${d.itemCount}); ` +
        `WorldState.cpp:32–64 aqWorldstateMap → WORLD_STATE ${d.worldstateId}`,
    },
  ];
}

// QuestRewarded_war_effort for the gong: in PHASE_3_GONG_TIME, broadcast the yells, clear
// TYPE_GONG_TIME and transition to the ten-hour war. Cite: war_effort.cpp:221–235.
function runBangAGongReward(): DbScriptIntent[] {
  return [
    {
      kind: 'skip',
      reason:
        `QuestRewarded_war_effort GO scarab gong ${GO_SCARAB_GONG}: quest ${QUEST_BANG_A_GONG} ` +
        `requires GetAqPhase()==PHASE_3_GONG_TIME (${PHASE_3_GONG_TIME}); ` +
        `scepter ${ITEM_SCEPTER_OF_THE_SHIFTING_SANDS}, prev ${QUEST_THE_MIGHT_OF_KALIMDOR}`,
      cite: 'war_effort.cpp:223–225 QUEST_BANG_A_GONG + PHASE_3_GONG_TIME gate',
    },
    {
      kind: 'talk',
      textId: SAY_BANG_GONG,
      stringTemplateId: 0,
      cite: `war_effort.cpp:227 SendBgNeutralToPlayer(SAY_BANG_GONG=${SAY_BANG_GONG})`,
    },
    {
      kind: 'talk',
      textId: SAY_QIRAJI_BREAK,
      stringTemplateId: 0,
      cite: `war_effort.cpp:228 SendBgNeutralToPlayer(SAY_QIRAJI_BREAK=${SAY_QIRAJI_BREAK})`,
    },
    {
      kind: 'set_instance_data',
      type: TYPE_GONG_TIME,
      data: 0,
      cite: `war_effort.cpp:229–230 InstanceData SetData(TYPE_GONG_TIME=${TYPE_GONG_TIME}, 0)`,
    },
    {
      kind: 'skip',
      reason:
        `HandleWarEffortPhaseTransition(PHASE_4_10_HOUR_WAR=${PHASE_4_10_HOUR_WAR}) - ` +
        'realm AQ phase advances; game events / GO spawns owned by WorldState host',
      cite: 'war_effort.cpp:231 HandleWarEffortPhaseTransition(PHASE_4_10_HOUR_WAR)',
    },
  ];
}

// Family runner — reward / complete only (pQuestRewarded* hooks). Cite: war_effort.cpp:118–192 NPC;
// :221–235 GO.
export function runWarEffort(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'reward' && phase !== 'complete') return [];
  if (questId === QUEST_BANG_A_GONG) return runBangAGongReward();
  return runNpcResourceReward(questId);
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'world/war_effort'` in registry.ts.
export const WAR_EFFORT_REGISTRY: Record<string | number, WarEffortQuestScriptEntry> = {
  'world/war_effort': {
    family: 'world/war_effort',
    questIds: [...WAR_EFFORT_QUEST_IDS],
    hooks: ['reward', 'complete'],
    cite:
      'world/war_effort.cpp:118–192 QuestRewarded_war_effort NPC; ' +
      ':221–235 GO Bang a Gong; :269–279 AddSC_war_effort',
    run: runWarEffort,
  },
};

for (const questId of WAR_EFFORT_QUEST_IDS) {
  const delivery = WAR_EFFORT_DELIVERIES[questId];
  WAR_EFFORT_REGISTRY[questId] = {
    family: 'world/war_effort',
    questId,
    questIds: [questId],
    hooks: ['reward', 'complete'],
    cite: delivery
      ? `war_effort.cpp:122–187 quest ${questId} → AQ resource ${delivery.resource} +` +
        ` AddWarEffortProgress count=${delivery.itemCount}`
      : `war_effort.cpp:221–235 QuestRewarded_war_effort GO Bang a Gong ${QUEST_BANG_A_GONG}`,
    run: runWarEffort,
  };
}
