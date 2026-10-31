// Thousand Needles ScriptDev pure helpers (SESSION 10 batch). Companion to thousandNeedles.ts IR +
// constants. Cite: kalimdor/thousand_needles.cpp

import {
  FACTION_ESCORT_H_NEUTRAL_ACTIVE,
  FACTION_FRIENDLY,
  FACTION_KANATI_ESCORT,
  GALAK_SPAWN_LOC,
  GOSSIP_ACTION_INFO_DEF,
  GOSSIP_MENU_PLUCKY_DEFAULT,
  GOSSIP_MENU_PLUCKY_PHRASE,
  GRIM_BANDIT_LOCS,
  ID_AMBUSH_1,
  ID_AMBUSH_2,
  ID_AMBUSH_3,
  KANATI_WAYPOINTS,
  LAKOTA_WAYPOINTS,
  NPC_GALAK_ASS,
  NPC_GRIM_BANDIT,
  NPC_WYVERN,
  PAOKA_WAYPOINTS,
  PATH_ID_KANATI,
  PLUCKY_RESET_TIMER_MS,
  QUEST_FREE_AT_LAST,
  QUEST_HOMEWARD,
  QUEST_PROTECT_KANATI,
  QUEST_SCOOP,
  SAY_COMPLETE,
  SAY_KAN_START,
  SAY_LAKO_START,
  SAY_START,
  SAY_WYVERN,
  SPELL_PLUCKY_CHICKEN,
  SPELL_PLUCKY_HUMAN,
  TEXTEMOTE_BECKON,
  TEXTEMOTE_CHICKEN,
  TEMPFACTION_RESTORE_COMBAT_STOP,
  TEMPFACTION_RESTORE_RESPAWN,
  WYVERN_LOCS,
  EMOTE_ONESHOT_WAVE,
} from './thousandNeedles.ts';

// npc_kanati

export interface KanatiQuestAcceptResult {
  handled: boolean;
  factionId: number | null;
  tempFactionFlags: number;
  pathId: number | null;
  run: boolean;
  cite: string;
}

/** QuestAccept_npc_kanati — Protect Kanati Greycloud 4966. Cite: thousand_needles.cpp:91-102 */
export function kanatiQuestAccept(questId: number): KanatiQuestAcceptResult {
  if (questId !== QUEST_PROTECT_KANATI) {
    return {
      handled: false,
      factionId: null,
      tempFactionFlags: 0,
      pathId: null,
      run: false,
      cite: 'thousand_needles.cpp:93 not QUEST_PROTECT_KANATI 4966',
    };
  }
  return {
    handled: true,
    factionId: FACTION_KANATI_ESCORT,
    tempFactionFlags: TEMPFACTION_RESTORE_RESPAWN,
    pathId: PATH_ID_KANATI,
    run: false,
    cite: 'thousand_needles.cpp:95-99 faction 232 + Start(false, path 10638)',
  };
}

export interface KanatiWaypointResult {
  handled: boolean;
  textId: number | null;
  removeImmuneToNpc: boolean;
  setImmuneToNpc: boolean;
  spawnGalak: boolean;
  galakCount: number;
  galakEntry: number;
  galakLoc: { x: number; y: number; z: number } | null;
  questCredit: boolean;
  questId: number | null;
  restoreFaction: boolean;
  cite: string;
}

/** WaypointReached for Kanati. Cite: thousand_needles.cpp:60-77 */
export function kanatiWaypointReached(pointId: number): KanatiWaypointResult {
  const empty: KanatiWaypointResult = {
    handled: false,
    textId: null,
    removeImmuneToNpc: false,
    setImmuneToNpc: false,
    spawnGalak: false,
    galakCount: 0,
    galakEntry: NPC_GALAK_ASS,
    galakLoc: null,
    questCredit: false,
    questId: null,
    restoreFaction: false,
    cite: 'thousand_needles.cpp:60-77 no-op WP',
  };
  switch (pointId) {
    case 1: {
      // Cite: thousand_needles.cpp:64-68
      const wp = KANATI_WAYPOINTS.find((w) => w.pointId === 1)!;
      return {
        handled: true,
        textId: SAY_KAN_START,
        removeImmuneToNpc: true,
        setImmuneToNpc: false,
        spawnGalak: true,
        galakCount: 3,
        galakEntry: NPC_GALAK_ASS,
        galakLoc: { x: GALAK_SPAWN_LOC.x, y: GALAK_SPAWN_LOC.y, z: GALAK_SPAWN_LOC.z },
        questCredit: false,
        questId: null,
        restoreFaction: false,
        cite: wp.cite,
      };
    }
    case 2: {
      // Cite: thousand_needles.cpp:69-75
      const wp = KANATI_WAYPOINTS.find((w) => w.pointId === 2)!;
      return {
        handled: true,
        textId: null,
        removeImmuneToNpc: false,
        setImmuneToNpc: true,
        spawnGalak: false,
        galakCount: 0,
        galakEntry: NPC_GALAK_ASS,
        galakLoc: null,
        questCredit: true,
        questId: QUEST_PROTECT_KANATI,
        restoreFaction: true,
        cite: wp.cite,
      };
    }
    default:
      return empty;
  }
}

/** JustSummoned — Galak assassins AttackStart Kanati. Cite: thousand_needles.cpp:85-88 */
export function kanatiJustSummoned(): { attackEscort: boolean; cite: string } {
  return {
    attackEscort: true,
    cite: 'thousand_needles.cpp:85-88 JustSummoned AttackStart(m_creature)',
  };
}

// npc_lakota_windsong

export interface LakotaQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  factionId: number | null;
  tempFactionFlags: number;
  run: boolean;
  cite: string;
}

/** QuestAccept_npc_lakota_windsong — Free at Last 4904. Cite: thousand_needles.cpp:187-198 */
export function lakotaQuestAccept(questId: number): LakotaQuestAcceptResult {
  if (questId !== QUEST_FREE_AT_LAST) {
    return {
      handled: false,
      textId: null,
      factionId: null,
      tempFactionFlags: 0,
      run: false,
      cite: 'thousand_needles.cpp:189 not QUEST_FREE_AT_LAST 4904',
    };
  }
  return {
    handled: true,
    textId: SAY_LAKO_START,
    factionId: FACTION_ESCORT_H_NEUTRAL_ACTIVE,
    tempFactionFlags: TEMPFACTION_RESTORE_RESPAWN,
    run: false,
    cite: 'thousand_needles.cpp:191-195 SAY_LAKO_START + faction 232 + Start(false)',
  };
}

export interface LakotaWaypointResult {
  handled: boolean;
  textId: number | null;
  ambushId: number | null;
  spawnBandits: boolean;
  banditCount: number;
  banditEntry: number;
  banditLocs: ReadonlyArray<{ x: number; y: number; z: number }>;
  questCredit: boolean;
  questId: number | null;
  cite: string;
}

/** WaypointReached for Lakota. Cite: thousand_needles.cpp:144-166 */
export function lakotaWaypointReached(pointId: number): LakotaWaypointResult {
  const empty: LakotaWaypointResult = {
    handled: false,
    textId: null,
    ambushId: null,
    spawnBandits: false,
    banditCount: 0,
    banditEntry: NPC_GRIM_BANDIT,
    banditLocs: [],
    questCredit: false,
    questId: null,
    cite: 'thousand_needles.cpp:144-166 no-op WP',
  };
  const wp = LAKOTA_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!wp) return empty;

  if (wp.ambushId != null) {
    // Cite: thousand_needles.cpp:168-174 DoSpawnBandits: 2 summons from locs[i+ambushId]
    const locs = [0, 1].map((i) => {
      const row = GRIM_BANDIT_LOCS[i + wp.ambushId!]!;
      return { x: row.x, y: row.y, z: row.z };
    });
    return {
      handled: true,
      textId: wp.textId,
      ambushId: wp.ambushId,
      spawnBandits: true,
      banditCount: 2,
      banditEntry: NPC_GRIM_BANDIT,
      banditLocs: locs,
      questCredit: false,
      questId: null,
      cite: wp.cite,
    };
  }

  return {
    handled: true,
    textId: wp.textId,
    ambushId: null,
    spawnBandits: false,
    banditCount: 0,
    banditEntry: NPC_GRIM_BANDIT,
    banditLocs: [],
    questCredit: wp.questCredit,
    questId: wp.questCredit ? QUEST_FREE_AT_LAST : null,
    cite: wp.cite,
  };
}

/** DoSpawnBandits ambush id map. Cite: thousand_needles.cpp:119-121,168-174 */
export function lakotaAmbushIds(): readonly number[] {
  return [ID_AMBUSH_1, ID_AMBUSH_2, ID_AMBUSH_3] as const;
}

/** JustSummoned — bandits AttackStart Lakota. Cite: thousand_needles.cpp:176-179 */
export function lakotaJustSummoned(): { attackEscort: boolean; cite: string } {
  return {
    attackEscort: true,
    cite: 'thousand_needles.cpp:176-179 JustSummoned AttackStart',
  };
}

// npc_paoka_swiftmountain

export interface PaokaQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  factionId: number | null;
  tempFactionFlags: number;
  run: boolean;
  cite: string;
}

/** QuestAccept_npc_paoka_swiftmountain — Homeward Bound 4770. Cite: thousand_needles.cpp:263-274 */
export function paokaQuestAccept(questId: number): PaokaQuestAcceptResult {
  if (questId !== QUEST_HOMEWARD) {
    return {
      handled: false,
      textId: null,
      factionId: null,
      tempFactionFlags: 0,
      run: false,
      cite: 'thousand_needles.cpp:265 not QUEST_HOMEWARD 4770',
    };
  }
  return {
    handled: true,
    textId: SAY_START,
    factionId: FACTION_ESCORT_H_NEUTRAL_ACTIVE,
    tempFactionFlags: TEMPFACTION_RESTORE_RESPAWN,
    run: false,
    cite: 'thousand_needles.cpp:267-271 SAY_START + faction 232 + Start(false)',
  };
}

export interface PaokaWaypointResult {
  handled: boolean;
  textId: number | null;
  spawnWyvern: boolean;
  wyvernCount: number;
  wyvernEntry: number;
  wyvernLocs: ReadonlyArray<{ x: number; y: number; z: number }>;
  questCredit: boolean;
  questId: number | null;
  cite: string;
}

/** WaypointReached for Pao'ka. Cite: thousand_needles.cpp:231-246 */
export function paokaWaypointReached(pointId: number): PaokaWaypointResult {
  const empty: PaokaWaypointResult = {
    handled: false,
    textId: null,
    spawnWyvern: false,
    wyvernCount: 0,
    wyvernEntry: NPC_WYVERN,
    wyvernLocs: [],
    questCredit: false,
    questId: null,
    cite: 'thousand_needles.cpp:231-246 no-op WP',
  };
  const wp = PAOKA_WAYPOINTS.find((w) => w.pointId === pointId);
  if (!wp) return empty;

  if (wp.spawnWyvern) {
    // Cite: thousand_needles.cpp:249-255 DoSpawnWyvern — 3 locs
    return {
      handled: true,
      textId: SAY_WYVERN,
      spawnWyvern: true,
      wyvernCount: 3,
      wyvernEntry: NPC_WYVERN,
      wyvernLocs: WYVERN_LOCS.map((r) => ({ x: r.x, y: r.y, z: r.z })),
      questCredit: false,
      questId: null,
      cite: wp.cite,
    };
  }

  return {
    handled: true,
    textId: wp.textId === SAY_COMPLETE ? SAY_COMPLETE : null,
    spawnWyvern: false,
    wyvernCount: 0,
    wyvernEntry: NPC_WYVERN,
    wyvernLocs: [],
    questCredit: wp.questCredit,
    questId: wp.questCredit ? QUEST_HOMEWARD : null,
    cite: wp.cite,
  };
}

// npc_plucky_johnson

export interface PluckyState {
  /** m_uiResetTimer — armed on Reset; ticks only while gossip flag is set. */
  resetTimerMs: number;
  hasGossipFlag: boolean;
  factionId: number | null;
  form: 'chicken' | 'human';
  waveEmote: boolean;
}

/** Ctor / Reset state. Cite: thousand_needles.cpp:299-307 */
export function pluckyReset(): PluckyState {
  return {
    resetTimerMs: PLUCKY_RESET_TIMER_MS,
    hasGossipFlag: false,
    factionId: null,
    form: 'chicken',
    waveEmote: false,
  };
}

export interface PluckyEmoteResult {
  handled: boolean;
  state: PluckyState;
  castSpellId: number | null;
  waveEmote: boolean;
  cite: string;
}

// ReceiveEmote — BECKON (quest incomplete) or CHICKEN (if not already gossip). Cite:
// thousand_needles.cpp:309-329
export function pluckyReceiveEmote(
  textEmote: number,
  questIncomplete: boolean,
  prior: PluckyState,
): PluckyEmoteResult {
  if (textEmote === TEXTEMOTE_BECKON) {
    // Cite: thousand_needles.cpp:311-318
    if (!questIncomplete) {
      return {
        handled: false,
        state: prior,
        castSpellId: null,
        waveEmote: false,
        cite: 'thousand_needles.cpp:311 quest 1950 not incomplete → ignore BECKON',
      };
    }
    return {
      handled: true,
      state: {
        ...prior,
        factionId: FACTION_FRIENDLY,
        hasGossipFlag: true,
        form: 'human',
        waveEmote: false,
      },
      castSpellId: SPELL_PLUCKY_HUMAN,
      waveEmote: false,
      cite: 'thousand_needles.cpp:313-317 BECKON → faction 35 + gossip + SPELL_PLUCKY_HUMAN 9192',
    };
  }

  if (textEmote === TEXTEMOTE_CHICKEN) {
    // Cite: thousand_needles.cpp:321-328
    if (prior.hasGossipFlag) {
      return {
        handled: false,
        state: prior,
        castSpellId: null,
        waveEmote: false,
        cite: 'thousand_needles.cpp:323-324 already GOSSIP → ignore CHICKEN',
      };
    }
    return {
      handled: true,
      state: {
        ...prior,
        factionId: FACTION_FRIENDLY,
        hasGossipFlag: true,
        form: 'human',
        waveEmote: true,
      },
      castSpellId: SPELL_PLUCKY_HUMAN,
      waveEmote: true,
      cite: 'thousand_needles.cpp:325-328 CHICKEN → faction 35 + gossip + 9192 + EMOTE_ONESHOT_WAVE',
    };
  }

  return {
    handled: false,
    state: prior,
    castSpellId: null,
    waveEmote: false,
    cite: 'thousand_needles.cpp:309-329 unrelated emote',
  };
}

export interface PluckyTimerTickResult {
  state: PluckyState;
  expired: boolean;
  enterEvade: boolean;
  removeGossipOnly: boolean;
  cite: string;
}

// UpdateAI gossip resetTimer tick; expiry uses a strict `<`.
// Cite: thousand_needles.cpp:332-346.
export function pluckyResetTimerTick(
  prior: PluckyState,
  diffMs: number,
  hasVictim: boolean,
): PluckyTimerTickResult {
  if (!prior.hasGossipFlag) {
    return {
      state: prior,
      expired: false,
      enterEvade: false,
      removeGossipOnly: false,
      cite: 'thousand_needles.cpp:334 no GOSSIP flag → timer idle',
    };
  }
  // Cite: thousand_needles.cpp:336 if (m_uiResetTimer < uiDiff)
  if (prior.resetTimerMs < diffMs) {
    if (!hasVictim) {
      // EnterEvadeMode → Reset() re-arms chicken + clears gossip
      return {
        state: pluckyReset(),
        expired: true,
        enterEvade: true,
        removeGossipOnly: false,
        cite: 'thousand_needles.cpp:338-339 no victim → EnterEvadeMode (Reset chicken)',
      };
    }
    return {
      state: { ...prior, hasGossipFlag: false, resetTimerMs: 0 },
      expired: true,
      enterEvade: false,
      removeGossipOnly: true,
      cite: 'thousand_needles.cpp:340-341 has victim → RemoveFlag GOSSIP only',
    };
  }
  return {
    state: { ...prior, resetTimerMs: prior.resetTimerMs - diffMs },
    expired: false,
    enterEvade: false,
    removeGossipOnly: false,
    cite: 'thousand_needles.cpp:345 decrement m_uiResetTimer',
  };
}

export interface PluckyGossipHelloResult {
  addQuestItem: boolean;
  menuTextId: number;
  cite: string;
}

/** GossipHello_npc_plucky_johnson. Cite: thousand_needles.cpp:360-367 */
export function pluckyGossipHello(questIncomplete: boolean): PluckyGossipHelloResult {
  return {
    addQuestItem: questIncomplete,
    menuTextId: GOSSIP_MENU_PLUCKY_DEFAULT,
    cite: questIncomplete
      ? 'thousand_needles.cpp:362-365 incomplete 1950 → ADD_GOSSIP_ITEM + menu 720'
      : 'thousand_needles.cpp:365 menu 720 without phrase item',
  };
}

export interface PluckyGossipSelectResult {
  handled: boolean;
  menuTextId: number | null;
  questCredit: boolean;
  questId: number | null;
  cite: string;
}

/** GossipSelect_npc_plucky_johnson — phrase → explore credit 1950. Cite: thousand_needles.cpp:369-378 */
export function pluckyGossipSelect(action: number): PluckyGossipSelectResult {
  if (action !== GOSSIP_ACTION_INFO_DEF) {
    return {
      handled: false,
      menuTextId: null,
      questCredit: false,
      questId: null,
      cite: 'thousand_needles.cpp:371 action != GOSSIP_ACTION_INFO_DEF 1000',
    };
  }
  return {
    handled: true,
    menuTextId: GOSSIP_MENU_PLUCKY_PHRASE,
    questCredit: true,
    questId: QUEST_SCOOP,
    cite: 'thousand_needles.cpp:373-374 menu 738 + AreaExploredOrEventHappens 1950',
  };
}

// Temp-faction flags used on Plucky transform. Cite: thousand_needles.cpp:315,325
// TEMPFACTION_RESTORE_RESPAWN|RESTORE_COMBAT_STOP
export function pluckyTempFactionFlags(): number {
  return TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP;
}

/** EMOTE_ONESHOT_WAVE on CHICKEN path. Cite: thousand_needles.cpp:328 */
export function pluckyWaveEmoteId(): number {
  return EMOTE_ONESHOT_WAVE;
}

/** Reset casts chicken form. Cite: thousand_needles.cpp:306 SPELL_PLUCKY_CHICKEN 9220 */
export function pluckyResetCastSpellId(): number {
  return SPELL_PLUCKY_CHICKEN;
}
