// Desolace ScriptDev IR ports. Source: scripts/kalimdor/desolace.cpp — the dying kodo, Dalinda,
// Melizza, the Gizelton caravan pair and the Magrami spectre. Every value cites file:line below.

import type { ScriptDevIR } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Shared factions / stand states / tempfaction

/** FACTION_ESCORT_A_NEUTRAL_PASSIVE. Cite: ScriptDevAIMgr.h:44 = 10; desolace.cpp:225 Dalinda */
export const FACTION_ESCORT_A_NEUTRAL_PASSIVE = 10;

/** FACTION_ESCORT_N_NEUTRAL_PASSIVE. Cite: ScriptDevAIMgr.h:50 = 250; desolace.cpp:328 Melizza */
export const FACTION_ESCORT_N_NEUTRAL_PASSIVE = 250;

/** FACTION_HOSTILE (Magrami after MovementInform). Cite: desolace.cpp:600 FACTION_HOSTILE = 16 */
export const FACTION_HOSTILE = 16;

/** TEMPFACTION_RESTORE_RESPAWN. Cite: Creature.h TEMPFACTION_RESTORE_RESPAWN=0x01; desolace.cpp:225,328 */
export const TEMPFACTION_RESTORE_RESPAWN = 0x01;

/** TEMPFACTION_TOGGLE_IMMUNE_TO_NPC. Cite: Creature.h:582 = 0x20; desolace.cpp:225 */
export const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;

/** TEMPFACTION_NONE (Magrami SetFactionTemporary). Cite: desolace.cpp:645 TEMPFACTION_NONE */
export const TEMPFACTION_NONE = 0;

/** UNIT_STAND_STATE_KNEEL / STAND. Cite: Unit.h; desolace.cpp:192 kneel ctor, :200 stand escort start */
export const UNIT_STAND_STATE_KNEEL = 8;
export const UNIT_STAND_STATE_STAND = 0;

// Constants — npc_aged_dying_ancient_kodo

// desolace.cpp:42–59
/** Cite: desolace.cpp:42 SAY_SMEED_HOME_1 = -1000348 */
export const SAY_SMEED_HOME_1 = -1_000_348;
/** Cite: desolace.cpp:43 SAY_SMEED_HOME_2 = -1000349 */
export const SAY_SMEED_HOME_2 = -1_000_349;
/** Cite: desolace.cpp:44 SAY_SMEED_HOME_3 = -1000350 */
export const SAY_SMEED_HOME_3 = -1_000_350;

/** Cite: desolace.cpp:46 QUEST_KODO = 5561 */
export const QUEST_KODO = 5561;

/** Cite: desolace.cpp:48 NPC_SMEED = 11596 */
export const NPC_SMEED = 11596;
/** Cite: desolace.cpp:49 NPC_AGED_KODO = 4700 */
export const NPC_AGED_KODO = 4700;
/** Cite: desolace.cpp:50 NPC_DYING_KODO = 4701 */
export const NPC_DYING_KODO = 4701;
/** Cite: desolace.cpp:51 NPC_ANCIENT_KODO = 4702 */
export const NPC_ANCIENT_KODO = 4702;
/** Cite: desolace.cpp:52 NPC_TAMED_KODO = 11627 */
export const NPC_TAMED_KODO = 11627;

/** Cite: desolace.cpp:54 SPELL_KODO_KOMBO_ITEM = 18153 */
export const SPELL_KODO_KOMBO_ITEM = 18153;
/** Cite: desolace.cpp:55 SPELL_KODO_KOMBO_PLAYER_BUFF = 18172 */
export const SPELL_KODO_KOMBO_PLAYER_BUFF = 18172;
/** Cite: desolace.cpp:56 SPELL_KODO_KOMBO_DESPAWN_BUFF = 18377 */
export const SPELL_KODO_KOMBO_DESPAWN_BUFF = 18377;
/** Cite: desolace.cpp:57 SPELL_KODO_KOMBO_GOSSIP = 18362 */
export const SPELL_KODO_KOMBO_GOSSIP = 18362;
/** Cite: desolace.cpp:58 SPELL_KODO_KOMBOBULATOR = 18793 */
export const SPELL_KODO_KOMBOBULATOR = 18793;
/** Cite: desolace.cpp:59 SPELL_KODO_DESPAWN = 22970 */
export const SPELL_KODO_DESPAWN = 22970;

/** Smeed home LOS distance. Cite: desolace.cpp:80 IsWithinDistInMap(pWho, 10.0f) */
export const SMEED_HOME_LOS_YD = 10;

// Despawn timer after gossip flag armed by SpellHit 18362. Cite: desolace.cpp:101 m_uiDespawnTimer = 60000
export const KODO_DESPAWN_TIMER_MS = 60_000;

/** ForcedDespawn after successful gossip quest credit. Cite: desolace.cpp:171 ForcedDespawn(10000) */
export const KODO_GOSSIP_DESPAWN_MS = 10_000;

/** Valid Kodo Kombobulator targets. Cite: desolace.cpp:138 */
export const KODO_KOMBO_TARGET_ENTRIES = [
  NPC_AGED_KODO,
  NPC_DYING_KODO,
  NPC_ANCIENT_KODO,
] as const;

// Constants — npc_dalinda_malem

// desolace.cpp:185–186
/** Cite: desolace.cpp:185 QUEST_RETURN_TO_VAHLARRIEL = 1440 */
export const QUEST_RETURN_TO_VAHLARRIEL = 1440;
/** Cite: scriptdev2.sql / bound creature Dalinda */
export const NPC_DALINDA_MALEM = 5644;

/** Explore credit waypoint. Cite: desolace.cpp:205–209 uiPointId == 18 */
export const DALINDA_CREDIT_WP = 18;

// QuestAccept temp faction flags. Cite: desolace.cpp:225 TEMPFACTION_RESTORE_RESPAWN |
// TEMPFACTION_TOGGLE_IMMUNE_TO_NPC
export const DALINDA_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;

// Constants — npc_melizza_brimbuzzle

// desolace.cpp:238–262
/** Cite: desolace.cpp:238 QUEST_GET_ME_OUT_OF_HERE = 6132 */
export const QUEST_GET_ME_OUT_OF_HERE = 6132;
/** Cite: desolace.cpp:240 GO_MELIZZAS_CAGE = 177706 */
export const GO_MELIZZAS_CAGE = 177706;

/** Cite: desolace.cpp:242 SAY_MELIZZA_START = -1000784 */
export const SAY_MELIZZA_START = -1_000_784;
/** Cite: desolace.cpp:243 SAY_MELIZZA_FINISH = -1000785 */
export const SAY_MELIZZA_FINISH = -1_000_785;
/** Cite: desolace.cpp:244 SAY_MELIZZA_1 = -1000786 */
export const SAY_MELIZZA_1 = -1_000_786;
/** Cite: desolace.cpp:245 SAY_MELIZZA_2 = -1000787 */
export const SAY_MELIZZA_2 = -1_000_787;
/** Cite: desolace.cpp:246 SAY_MELIZZA_3 = -1000788 */
export const SAY_MELIZZA_3 = -1_000_788;
/** Cite: desolace.cpp:248 SAY_HORNIZZ_1 = -1010030 */
export const SAY_HORNIZZ_1 = -1_010_030;
/** Cite: desolace.cpp:249 SAY_HORNIZZ_2 = -1010031 */
export const SAY_HORNIZZ_2 = -1_010_031;

/** Cite: desolace.cpp:251 NPC_MARAUDINE_MARAUDER = 4659 */
export const NPC_MARAUDINE_MARAUDER = 4659;
/** Cite: desolace.cpp:252 NPC_MARAUDINE_BONEPAW = 4660 */
export const NPC_MARAUDINE_BONEPAW = 4660;
/** Cite: desolace.cpp:253 NPC_MARAUDINE_WRANGLER = 4655 */
export const NPC_MARAUDINE_WRANGLER = 4655;
/** Cite: desolace.cpp:255 NPC_MELIZZA = 12277 */
export const NPC_MELIZZA = 12277;
/** Cite: world_kalimdor.h:30 NPC_HORNIZZ = 6019 */
export const NPC_HORNIZZ = 6019;

/** Cite: desolace.cpp:258 POINT_ID_QUEST_COMPLETE = 1 */
export const POINT_ID_QUEST_COMPLETE = 1;
/** Cite: desolace.cpp:259 POINT_ID_EVENT_COMPLETE = 2 */
export const POINT_ID_EVENT_COMPLETE = 2;
/** Cite: desolace.cpp:261 MAX_MARAUDERS = 2 */
export const MAX_MARAUDERS = 2;
/** Cite: desolace.cpp:262 MAX_WRANGLERS = 3 */
export const MAX_WRANGLERS = 3;

/** Marauder spawn anchors + 7yd random. Cite: desolace.cpp:284–288,336–338 */
export const MELIZZA_MARAUDER_SPAWNS = [
  { x: -1291.492, y: 2644.65, z: 111.556 },
  { x: -1306.73, y: 2675.163, z: 111.561 },
] as const;
export const MELIZZA_MARAUDER_RADIUS_YD = 7;

/** Wrangler/Bonepaw spawn + 10yd random. Cite: desolace.cpp:290,346–347 */
export const MELIZZA_WRANGLER_SPAWN = {
  x: -1393.194,
  y: 2429.465,
  z: 88.689,
} as const;
export const MELIZZA_WRANGLER_RADIUS_YD = 10;

/** Dialogue delays (aIntroDialogue). Cite: desolace.cpp:265–276 */
export const MELIZZA_DIALOGUE = [
  { entry: POINT_ID_QUEST_COMPLETE, speaker: 0, delayMs: 1000 },
  { entry: QUEST_GET_ME_OUT_OF_HERE, speaker: NPC_MELIZZA, delayMs: 0 },
  { entry: POINT_ID_EVENT_COMPLETE, speaker: 0, delayMs: 2000 },
  { entry: SAY_MELIZZA_1, speaker: NPC_MELIZZA, delayMs: 4000 },
  { entry: SAY_MELIZZA_2, speaker: NPC_MELIZZA, delayMs: 5000 },
  { entry: SAY_MELIZZA_3, speaker: NPC_MELIZZA, delayMs: 4000 },
  { entry: NPC_MELIZZA, speaker: 0, delayMs: 6000 },
  { entry: SAY_HORNIZZ_1, speaker: NPC_HORNIZZ, delayMs: 10_000 },
  { entry: SAY_HORNIZZ_2, speaker: NPC_HORNIZZ, delayMs: 0 },
] as const;

/** Face heading at event-complete pause. Cite: desolace.cpp:382 SetFacingTo(4.71f) */
export const MELIZZA_EVENT_COMPLETE_FACING = 4.71;

// Constants — npc_cork_gizelton / npc_rigger_gizelton

// desolace.cpp:423–438
/** Cite: desolace.cpp:423 NPC_CORK_GIZELTON = 11625 */
export const NPC_CORK_GIZELTON = 11625;
/** Cite: desolace.cpp:424 NPC_RIGGER_GIZELTON = 11626 */
export const NPC_RIGGER_GIZELTON = 11626;
/** Cite: desolace.cpp:425 NPC_VENDOR_TRON = 12245 */
export const NPC_VENDOR_TRON = 12245;
/** Cite: desolace.cpp:426 NPC_SUPER_SELLER = 12246 */
export const NPC_SUPER_SELLER = 12246;

/** Cite: desolace.cpp:428 QUEST_BODYGUARD_TO_HIRE = 5821 */
export const QUEST_BODYGUARD_TO_HIRE = 5821;
/** Cite: desolace.cpp:429 QUEST_GIZELTON_CARAVAN = 5943 */
export const QUEST_GIZELTON_CARAVAN = 5943;

/** Cite: desolace.cpp:431 WAYPOINT_PATH_ID = 19019 */
export const WAYPOINT_PATH_ID = 19019;
/** Cite: desolace.cpp:432 PATH_ID_CORK_GIZELTON = 11625 */
export const PATH_ID_CORK_GIZELTON = 11625;
/** Cite: desolace.cpp:433 PATH_ID_RIGGER_GIZELTON = 11626 */
export const PATH_ID_RIGGER_GIZELTON = 11626;
/** Cite: desolace.cpp:434 WAYPOINT_PATH_POINT_AFTER_ESCORT_1 = 33 */
export const WAYPOINT_PATH_POINT_AFTER_ESCORT_1 = 33;
/** Cite: desolace.cpp:435 WAYPOINT_PATH_POINT_AFTER_ESCORT_2 = 100 */
export const WAYPOINT_PATH_POINT_AFTER_ESCORT_2 = 100;

// Forced fail/despawn after caravan member death. Cite: desolace.cpp:437 GIZELTON_TIMER_AFTER_FAIL = 60 *
// IN_MILLISECONDS
export const GIZELTON_TIMER_AFTER_FAIL_MS = 60_000;

/** Rigger → Cork hand-off search radius. Cite: desolace.cpp:585 GetClosestCreatureWithEntry(..., 100.0f) */
export const RIGGER_CORK_SEARCH_YD = 100;

// Constants — npc_magrami_spectre

// desolace.cpp:594–604
/** Cite: desolace.cpp:594 SPELL_CURSE_OF_MAGRAMI = 18159 */
export const SPELL_CURSE_OF_MAGRAMI = 18159;
/** Cite: desolace.cpp:595 SPELL_GHOST_SPAWN_IN = 17321 */
export const SPELL_GHOST_SPAWN_IN = 17321;
/** Cite: desolace.cpp:596 SPELL_BLUE_AURA = 17327 */
export const SPELL_BLUE_AURA = 17327;
/** Cite: desolace.cpp:597 SPELL_GREEN_AURA = 18951 */
export const SPELL_GREEN_AURA = 18951;
/** Cite: desolace.cpp:598 SPELL_CHILLING_TOUCH = 18146 */
export const SPELL_CHILLING_TOUCH = 18146;

/** Cite: desolace.cpp:602 SAY_EMOTE_1 = -1001226 */
export const SAY_MAGRAMI_EMOTE_1 = -1_001_226;
/** Cite: desolace.cpp:603 SAY_EMOTE_2 = -1001227 */
export const SAY_MAGRAMI_EMOTE_2 = -1_001_227;

/** Cite: scriptdev2.sql / bound creature */
export const NPC_MAGRAMI_SPECTRE = 11560;

// Curse timer initial (one-shot — set to 0 after cast). Cite: desolace.cpp:614 m_uiCurseTimer = 4000; :659
// m_uiCurseTimer = 0
export const MAGRAMI_CURSE_INIT_MS = 4000;

// Spell 18159's aura duration from bake. The host forces EFLAG_REPEATABLE, so re-arming at the
// aura duration approximates the cpp one-shot without inventing a timer. Cite: desolace.cpp:659.
export const MAGRAMI_CURSE_AURA_DURATION_MS = 900_000;

/** MovementInform point that arms green aura + hostile faction. Cite: desolace.cpp:638 uiData == 1 */
export const MAGRAMI_ARRIVE_POINT = 1;

/** Random roam radius after arrive. Cite: desolace.cpp:642 MoveRandomAroundPoint(..., 5.f) */
export const MAGRAMI_ROAM_RADIUS_YD = 5;

// Pure helpers — kodo

export interface KodoKomboCheckResult {
  ok: boolean;
  reason:
    | 'ok'
    | 'bad_target'
    | 'player_has_buff'
    | 'kodo_has_despawn_buff';
  cite: string;
}

/** Port of KodoKombobulator::OnCheckCast. Cite: desolace.cpp:135–144 */
export function kodoKomboCheckCast(
  targetEntry: number,
  playerHasBuff18172: boolean,
  kodoHasBuff18377: boolean,
): KodoKomboCheckResult {
  if (
    targetEntry !== NPC_AGED_KODO &&
    targetEntry !== NPC_DYING_KODO &&
    targetEntry !== NPC_ANCIENT_KODO
  ) {
    return {
      ok: false,
      reason: 'bad_target',
      cite: 'desolace.cpp:138 BAD_TARGETS unless Aged/Dying/Ancient Kodo',
    };
  }
  if (playerHasBuff18172) {
    return {
      ok: false,
      reason: 'player_has_buff',
      cite: 'desolace.cpp:141 caster HasAura(SPELL_KODO_KOMBO_PLAYER_BUFF) → CASTER_AURASTATE',
    };
  }
  if (kodoHasBuff18377) {
    return {
      ok: false,
      reason: 'kodo_has_despawn_buff',
      cite: 'desolace.cpp:141 target HasAura(SPELL_KODO_KOMBO_DESPAWN_BUFF) → CASTER_AURASTATE',
    };
  }
  return { ok: true, reason: 'ok', cite: 'desolace.cpp:144 SPELL_CAST_OK' };
}

export interface KodoKomboExecuteResult {
  playerBuffSpellId: number;
  updateEntry: number;
  kodoDespawnBuffSpellId: number;
  moveFollow: boolean;
  cite: string;
}

/** Port of KodoKombobulator::OnEffectExecute. Cite: desolace.cpp:147–160 */
export function kodoKomboOnEffectExecute(): KodoKomboExecuteResult {
  return {
    playerBuffSpellId: SPELL_KODO_KOMBO_PLAYER_BUFF,
    updateEntry: NPC_TAMED_KODO,
    kodoDespawnBuffSpellId: SPELL_KODO_KOMBO_DESPAWN_BUFF,
    moveFollow: true,
    cite:
      'desolace.cpp:151-159 target→caster 18172; UpdateEntry 11627; cast 18377; MoveFollow',
  };
}

export interface KodoSmeedLosResult {
  handled: boolean;
  textId: number | null;
  castGossipSpellId: number | null;
  cite: string;
}

// Port of npc_aged_dying_ancient_kodoAI::MoveInLineOfSight, Smeed branch.
// Cite: desolace.cpp:73–92.
export function kodoSmeedMoveInLos(
  smeedEntry: number,
  distYd: number,
  hasGossipFlag: boolean,
  roll02: number,
): KodoSmeedLosResult {
  if ((smeedEntry | 0) !== NPC_SMEED) {
    return {
      handled: false,
      textId: null,
      castGossipSpellId: null,
      cite: 'desolace.cpp:75 entry != NPC_SMEED → fall through ScriptedAI',
    };
  }
  if (hasGossipFlag) {
    return {
      handled: false,
      textId: null,
      castGossipSpellId: null,
      cite: 'desolace.cpp:77-78 already gossip flag → return',
    };
  }
  if (!(distYd <= SMEED_HOME_LOS_YD)) {
    return {
      handled: false,
      textId: null,
      castGossipSpellId: null,
      cite: 'desolace.cpp:80 not within 10yd → no-op',
    };
  }
  const texts = [SAY_SMEED_HOME_1, SAY_SMEED_HOME_2, SAY_SMEED_HOME_3] as const;
  const idx = ((roll02 | 0) % 3 + 3) % 3;
  return {
    handled: true,
    textId: texts[idx]!,
    castGossipSpellId: SPELL_KODO_KOMBO_GOSSIP,
    cite:
      'desolace.cpp:82-90 urand SAY_SMEED_HOME_* on Smeed + CastSpell 18362 TRIGGERED self',
  };
}

export interface KodoSpellHitResult {
  handled: boolean;
  moveIdle: boolean;
  setGossipFlag: boolean;
  despawnTimerMs: number;
  cite: string;
}

/** Port of npc_aged_dying_ancient_kodoAI::SpellHit. Cite: desolace.cpp:95–103 */
export function kodoSpellHit(spellId: number): KodoSpellHitResult {
  if ((spellId | 0) !== SPELL_KODO_KOMBO_GOSSIP) {
    return {
      handled: false,
      moveIdle: false,
      setGossipFlag: false,
      despawnTimerMs: 0,
      cite: 'desolace.cpp:97 spellId != SPELL_KODO_KOMBO_GOSSIP → no-op',
    };
  }
  return {
    handled: true,
    moveIdle: true,
    setGossipFlag: true,
    despawnTimerMs: KODO_DESPAWN_TIMER_MS,
    cite:
      'desolace.cpp:99-101 MoveIdle + gossip flag + m_uiDespawnTimer=60000',
  };
}

export interface KodoGossipHelloResult {
  handled: boolean;
  questTalkEntry: number | null;
  stripPlayerBuff: boolean;
  forceDespawnMs: number;
  cite: string;
}

/** Port of GossipHello_npc_aged_dying_ancient_kodo credit branch. Cite: desolace.cpp:163–177 */
export function kodoGossipHello(
  playerHasBuff18172: boolean,
  kodoHasBuff18377: boolean,
  kodoEntry: number,
): KodoGossipHelloResult {
  if (!playerHasBuff18172 || !kodoHasBuff18377) {
    return {
      handled: false,
      questTalkEntry: null,
      stripPlayerBuff: false,
      forceDespawnMs: 0,
      cite: 'desolace.cpp:165 missing buff pair → prepare default gossip only',
    };
  }
  return {
    handled: true,
    questTalkEntry: kodoEntry | 0,
    stripPlayerBuff: true,
    forceDespawnMs: KODO_GOSSIP_DESPAWN_MS,
    cite:
      'desolace.cpp:168-171 TalkedToCreature(entry) + RemoveAuras 18172 + ForcedDespawn(10000)',
  };
}

export interface KodoDespawnTimerResult {
  expired: boolean;
  justDiedRespawn: boolean;
  remainingMs: number;
  cite: string;
}

// Port of the despawn-timer branch in UpdateAI.
// Cite: desolace.cpp:105–118.
export function kodoDespawnTimerTick(
  despawnTimerMs: number,
  diffMs: number,
  hasVictim: boolean,
  alive: boolean,
): KodoDespawnTimerResult {
  if (!despawnTimerMs) {
    return {
      expired: false,
      justDiedRespawn: false,
      remainingMs: 0,
      cite: 'desolace.cpp:108 m_uiDespawnTimer==0 → skip',
    };
  }
  if (despawnTimerMs <= diffMs) {
    if (!hasVictim && alive) {
      return {
        expired: true,
        justDiedRespawn: true,
        remainingMs: 0,
        cite: 'desolace.cpp:110-115 OOC alive → Reset + JUST_DIED + Respawn',
      };
    }
    return {
      expired: true,
      justDiedRespawn: false,
      remainingMs: 0,
      cite: 'desolace.cpp:110 in combat or dead → no JUST_DIED path',
    };
  }
  return {
    expired: false,
    justDiedRespawn: false,
    remainingMs: despawnTimerMs - diffMs,
    cite: 'desolace.cpp:118 m_uiDespawnTimer -= diff',
  };
}

// Pure helpers — Dalinda

export interface DalindaQuestAcceptResult {
  handled: boolean;
  standState: number;
  factionId: number;
  factionFlags: number;
  questId: number;
  cite: string;
}

/** Port of QuestAccept_npc_dalinda_malem + JustStartedEscort stand. Cite: desolace.cpp:198–201,218–229 */
export function dalindaQuestAccept(questId: number): DalindaQuestAcceptResult {
  if ((questId | 0) !== QUEST_RETURN_TO_VAHLARRIEL) {
    return {
      handled: false,
      standState: UNIT_STAND_STATE_KNEEL,
      factionId: 0,
      factionFlags: 0,
      questId: 0,
      cite: 'desolace.cpp:220 quest != 1440 → no-op',
    };
  }
  return {
    handled: true,
    standState: UNIT_STAND_STATE_STAND,
    factionId: FACTION_ESCORT_A_NEUTRAL_PASSIVE,
    factionFlags: DALINDA_TEMP_FACTION_FLAGS,
    questId: QUEST_RETURN_TO_VAHLARRIEL,
    cite:
      'desolace.cpp:200,225-226 STAND + FACTION_ESCORT_A_NEUTRAL_PASSIVE 10 flags 0x21 + Start',
  };
}

export interface DalindaWaypointResult {
  handled: boolean;
  exploreQuestId: number | null;
  cite: string;
}

/** Port of npc_dalinda_malemAI::WaypointReached. Cite: desolace.cpp:203–210 */
export function dalindaWaypointReached(pointId: number): DalindaWaypointResult {
  if ((pointId | 0) === DALINDA_CREDIT_WP) {
    return {
      handled: true,
      exploreQuestId: QUEST_RETURN_TO_VAHLARRIEL,
      cite: 'desolace.cpp:205-208 WP18 RewardPlayerAndGroupAtEventExplored(1440)',
    };
  }
  return {
    handled: false,
    exploreQuestId: null,
    cite: 'desolace.cpp:205 pointId != 18 → no-op',
  };
}

// Pure helpers — Melizza

export interface MelizzaWaypointResult {
  handled: boolean;
  /** SAY text id(s) at this point. */
  textIds: number[];
  setFactionId: number | null;
  openCage: boolean;
  /** Marauder summon count total (anchors × MAX_MARAUDERS). */
  summonMarauders: number;
  /** Bonepaw + Wrangler pairs (MAX_WRANGLERS each). */
  summonWranglerPairs: number;
  startDialoguePoint: number | null;
  cite: string;
}

/** Port of npc_melizza_brimbuzzleAI::WaypointReached. Cite: desolace.cpp:320–359 */
export function melizzaWaypointReached(pointId: number): MelizzaWaypointResult {
  switch (pointId | 0) {
    case 1:
      return {
        handled: true,
        textIds: [SAY_MELIZZA_START],
        setFactionId: FACTION_ESCORT_N_NEUTRAL_PASSIVE,
        openCage: false,
        summonMarauders: 0,
        summonWranglerPairs: 0,
        startDialoguePoint: null,
        cite: 'desolace.cpp:324-329 WP1 SAY_MELIZZA_START + FACTION_ESCORT_N_NEUTRAL_PASSIVE 250',
      };
    case 4:
      return {
        handled: true,
        textIds: [],
        setFactionId: null,
        openCage: false,
        summonMarauders: MELIZZA_MARAUDER_SPAWNS.length * MAX_MARAUDERS,
        summonWranglerPairs: 0,
        startDialoguePoint: null,
        cite: 'desolace.cpp:330-340 WP4 2 anchors × MAX_MARAUDERS=2 → Maraudine Marauder 4659',
      };
    case 9:
      return {
        handled: true,
        textIds: [],
        setFactionId: null,
        openCage: false,
        summonMarauders: 0,
        summonWranglerPairs: MAX_WRANGLERS,
        startDialoguePoint: null,
        cite: 'desolace.cpp:342-351 WP9 MAX_WRANGLERS=3 × (Bonepaw 4660 + Wrangler 4655)',
      };
    case 12:
      return {
        handled: true,
        textIds: [],
        setFactionId: null,
        openCage: false,
        summonMarauders: 0,
        summonWranglerPairs: 0,
        startDialoguePoint: POINT_ID_QUEST_COMPLETE,
        cite: 'desolace.cpp:353-355 WP12 StartNextDialogueText(POINT_ID_QUEST_COMPLETE)',
      };
    case 19:
      return {
        handled: true,
        textIds: [],
        setFactionId: null,
        openCage: false,
        summonMarauders: 0,
        summonWranglerPairs: 0,
        startDialoguePoint: POINT_ID_EVENT_COMPLETE,
        cite: 'desolace.cpp:356-358 WP19 StartNextDialogueText(POINT_ID_EVENT_COMPLETE)',
      };
    default:
      return {
        handled: false,
        textIds: [],
        setFactionId: null,
        openCage: false,
        summonMarauders: 0,
        summonWranglerPairs: 0,
        startDialoguePoint: null,
        cite: 'desolace.cpp:320-359 no case for this pointId',
      };
  }
}

export interface MelizzaDialogueStepResult {
  handled: boolean;
  pauseEscort: boolean | null;
  resumeEscort: boolean;
  setRun: boolean;
  clearFaction: boolean;
  exploreQuestId: number | null;
  finishTextId: number | null;
  face: number | null;
  cite: string;
}

/** Port of npc_melizza_brimbuzzleAI::JustDidDialogueStep. Cite: desolace.cpp:362–388 */
export function melizzaDialogueStep(stepEntry: number): MelizzaDialogueStepResult {
  switch (stepEntry | 0) {
    case POINT_ID_QUEST_COMPLETE:
      return {
        handled: true,
        pauseEscort: true,
        resumeEscort: false,
        setRun: false,
        clearFaction: false,
        exploreQuestId: null,
        finishTextId: null,
        face: null,
        cite: 'desolace.cpp:366-368 POINT_ID_QUEST_COMPLETE → SetEscortPaused(true)',
      };
    case QUEST_GET_ME_OUT_OF_HERE:
      return {
        handled: true,
        pauseEscort: false,
        resumeEscort: true,
        setRun: true,
        clearFaction: true,
        exploreQuestId: QUEST_GET_ME_OUT_OF_HERE,
        finishTextId: SAY_MELIZZA_FINISH,
        face: null,
        cite:
          'desolace.cpp:369-378 QUEST_GET_ME_OUT_OF_HERE → SAY_FINISH + explore 6132 + clear faction + SetRun + unpause',
      };
    case POINT_ID_EVENT_COMPLETE:
      return {
        handled: true,
        pauseEscort: true,
        resumeEscort: false,
        setRun: false,
        clearFaction: false,
        exploreQuestId: null,
        finishTextId: null,
        face: MELIZZA_EVENT_COMPLETE_FACING,
        cite: 'desolace.cpp:380-383 POINT_ID_EVENT_COMPLETE → pause + SetFacingTo(4.71f)',
      };
    case NPC_MELIZZA:
      return {
        handled: true,
        pauseEscort: false,
        resumeEscort: true,
        setRun: false,
        clearFaction: false,
        exploreQuestId: null,
        finishTextId: null,
        face: null,
        cite: 'desolace.cpp:384-386 NPC_MELIZZA step → SetEscortPaused(false)',
      };
    default:
      return {
        handled: false,
        pauseEscort: null,
        resumeEscort: false,
        setRun: false,
        clearFaction: false,
        exploreQuestId: null,
        finishTextId: null,
        face: null,
        cite: 'desolace.cpp:362-388 no JustDidDialogueStep case',
      };
  }
}

/** Port of JustStartedEscort cage open. Cite: desolace.cpp:302–306 */
export function melizzaJustStartedEscort(): {
  openGoEntry: number;
  cite: string;
} {
  return {
    openGoEntry: GO_MELIZZAS_CAGE,
    cite: 'desolace.cpp:304-305 GetClosestGameObjectWithEntry(GO_MELIZZAS_CAGE) UseDoorOrButton',
  };
}

// Pure helpers — Cork / Rigger Gizelton

export interface CorkWaypointResult {
  handled: boolean;
  exploreQuestId: number | null;
  resumePathId: number | null;
  resumePathPoint: number | null;
  endEscort: boolean;
  clearSouthQuest: boolean;
  cite: string;
}

// Port of npc_cork_gizeltonAI::WaypointReached, while escorting only.
// Cite: desolace.cpp:500–542.
export function corkWaypointReached(
  pointId: number,
  escorting: boolean,
  southQuest: boolean,
  questIncomplete5821: boolean,
  questIncomplete5943: boolean,
): CorkWaypointResult {
  if (!escorting) {
    return {
      handled: false,
      exploreQuestId: null,
      resumePathId: null,
      resumePathPoint: null,
      endEscort: false,
      clearSouthQuest: false,
      cite: 'desolace.cpp:502-503 !escorting → return',
    };
  }
  if ((pointId | 0) === 19 && !southQuest) {
    return {
      handled: true,
      exploreQuestId: questIncomplete5821 ? QUEST_BODYGUARD_TO_HIRE : null,
      resumePathId: WAYPOINT_PATH_ID,
      resumePathPoint: WAYPOINT_PATH_POINT_AFTER_ESCORT_1,
      endEscort: true,
      clearSouthQuest: false,
      cite:
        'desolace.cpp:509-523 WP19 !SouthQuest → explore 5821 if incomplete + MoveWaypoint 19019 point 33 + End',
    };
  }
  if ((pointId | 0) === 21 && southQuest) {
    return {
      handled: true,
      exploreQuestId: questIncomplete5943 ? QUEST_GIZELTON_CARAVAN : null,
      resumePathId: WAYPOINT_PATH_ID,
      resumePathPoint: WAYPOINT_PATH_POINT_AFTER_ESCORT_2,
      endEscort: true,
      clearSouthQuest: true,
      cite:
        'desolace.cpp:526-540 WP21 SouthQuest → explore 5943 if incomplete + MoveWaypoint 19019 point 100 + End + SouthQuest=false',
    };
  }
  return {
    handled: false,
    exploreQuestId: null,
    resumePathId: null,
    resumePathPoint: null,
    endEscort: false,
    clearSouthQuest: false,
    cite: 'desolace.cpp:500-542 point/flag mismatch → no-op',
  };
}

export interface CorkFailTimerResult {
  scriptDone: boolean;
  failQuests: boolean;
  remainingMs: number;
  cite: string;
}

// Port of the UpdateEscortAI fail timer after CreatureGroupMemberDied.
// Cite: desolace.cpp:482–498, :451–480.
export function corkFailTimerTick(
  statusFailed: boolean,
  scriptDone: boolean,
  failTimerMs: number,
  diffMs: number,
  groupOutOfCombat: boolean,
): CorkFailTimerResult {
  if (scriptDone) {
    return {
      scriptDone: true,
      failQuests: false,
      remainingMs: failTimerMs,
      cite: 'desolace.cpp:486-487 ScriptDone → return',
    };
  }
  if (!statusFailed) {
    return {
      scriptDone: false,
      failQuests: false,
      remainingMs: failTimerMs,
      cite: 'desolace.cpp:489-490 !StatusFailed → return',
    };
  }
  const next = failTimerMs - diffMs;
  if (next > 0 && !groupOutOfCombat) {
    return {
      scriptDone: false,
      failQuests: false,
      remainingMs: next,
      cite: 'desolace.cpp:492-494 FailTimer>0 and group still in combat → wait',
    };
  }
  return {
    scriptDone: true,
    failQuests: true,
    remainingMs: Math.max(0, next),
    cite:
      'desolace.cpp:496-497 MakeQuestFailAndClean (5821+5943 group fail + Despawn) + ScriptDone',
  };
}

/** Port of QuestAccept_npc_cork_gizelton. Cite: desolace.cpp:558–566 */
export function corkQuestAccept(questId: number): {
  handled: boolean;
  pathId: number;
  southQuest: boolean;
  cite: string;
} {
  if ((questId | 0) !== QUEST_BODYGUARD_TO_HIRE) {
    return {
      handled: false,
      pathId: 0,
      southQuest: false,
      cite: 'desolace.cpp:560 quest != 5821 → no-op',
    };
  }
  return {
    handled: true,
    pathId: PATH_ID_CORK_GIZELTON,
    southQuest: false,
    cite: 'desolace.cpp:562-563 Start(false, player, quest, false, false, PATH_ID_CORK_GIZELTON=11625)',
  };
}

/** Port of QuestAccept_npc_rigger_gizelton → Cork StartRiggerEscort. Cite: desolace.cpp:579–589,545–548 */
export function riggerQuestAccept(
  questId: number,
  corkWithinYd: number,
): {
  handled: boolean;
  startCorkSouth: boolean;
  pathId: number;
  cite: string;
} {
  if ((questId | 0) !== QUEST_GIZELTON_CARAVAN) {
    return {
      handled: false,
      startCorkSouth: false,
      pathId: 0,
      cite: 'desolace.cpp:581 quest != 5943 → no-op',
    };
  }
  if (!(corkWithinYd <= RIGGER_CORK_SEARCH_YD)) {
    return {
      handled: false,
      startCorkSouth: false,
      pathId: 0,
      cite: 'desolace.cpp:585 no Cork within 100yd → no StartRiggerEscort',
    };
  }
  return {
    handled: true,
    startCorkSouth: true,
    pathId: PATH_ID_RIGGER_GIZELTON,
    cite:
      'desolace.cpp:585-587 Cork StartRiggerEscort: SouthQuest=true + Start path PATH_ID_RIGGER_GIZELTON=11626',
  };
}

// Pure helpers — Magrami Spectre

export interface MagramiRespawnResult {
  spellIds: number[];
  textId: number;
  cite: string;
}

// Port of npc_magrami_spectre::JustRespawned; `roll01` picks the emote.
// Cite: desolace.cpp:617–631.
export function magramiJustRespawned(roll01: number): MagramiRespawnResult {
  const textId =
    ((roll01 | 0) & 1) === 0 ? SAY_MAGRAMI_EMOTE_1 : SAY_MAGRAMI_EMOTE_2;
  return {
    spellIds: [SPELL_GHOST_SPAWN_IN, SPELL_BLUE_AURA, SPELL_CHILLING_TOUCH],
    textId,
    cite:
      'desolace.cpp:619-630 Cast 17321/17327/18146 + urand SAY_EMOTE_1/2',
  };
}

export interface MagramiMovementInformResult {
  handled: boolean;
  stripBlueAura: boolean;
  castGreenAura: boolean;
  factionId: number;
  roamRadiusYd: number;
  cite: string;
}

// Port of npc_magrami_spectre::MovementInform, POINT branch (POINT_MOTION_TYPE is 1).
// Cite: desolace.cpp:634–647.
export function magramiMovementInform(
  motionTypeIsPoint: boolean,
  pointId: number,
): MagramiMovementInformResult {
  if (!motionTypeIsPoint || (pointId | 0) !== MAGRAMI_ARRIVE_POINT) {
    return {
      handled: false,
      stripBlueAura: false,
      castGreenAura: false,
      factionId: 0,
      roamRadiusYd: 0,
      cite: 'desolace.cpp:636-638 !POINT or uiData!=1 → no-op',
    };
  }
  return {
    handled: true,
    stripBlueAura: true,
    castGreenAura: true,
    factionId: FACTION_HOSTILE,
    roamRadiusYd: MAGRAMI_ROAM_RADIUS_YD,
    cite:
      'desolace.cpp:640-645 MoveRandomAroundPoint 5yd; strip 17327; cast 18951; SetFactionTemporary(16)',
  };
}

export interface MagramiCurseTickResult {
  cast: boolean;
  timerMs: number;
  cite: string;
}

/** Port of curse timer in UpdateAI (one-shot). Cite: desolace.cpp:655–664 */
export function magramiCurseTimerTick(
  curseTimerMs: number,
  diffMs: number,
  hasVictim: boolean,
): MagramiCurseTickResult {
  if (!hasVictim) {
    return {
      cast: false,
      timerMs: curseTimerMs,
      cite: 'desolace.cpp:652 no victim → return before curse branch',
    };
  }
  if (!curseTimerMs) {
    return {
      cast: false,
      timerMs: 0,
      cite: 'desolace.cpp:655 m_uiCurseTimer==0 → skip',
    };
  }
  if (curseTimerMs <= diffMs) {
    return {
      cast: true,
      timerMs: 0,
      cite: 'desolace.cpp:657-660 m_uiCurseTimer=0 + DoCastSpellIfCan(victim, SPELL_CURSE_OF_MAGRAMI)',
    };
  }
  return {
    cast: false,
    timerMs: curseTimerMs - diffMs,
    cite: 'desolace.cpp:662-663 m_uiCurseTimer -= uiDiff',
  };
}

// ScriptDev IR — npc_aged_dying_ancient_kodo

// npc_aged_dying_ancient_kodoAI — 4700 Aged, 4701 Dying, 4702 Ancient and 11627 Tamed, all in
// bake. No combat cast timers: the quest machine is pure helpers plus SpellHit 18362.
export const NPC_AGED_DYING_ANCIENT_KODO_SCRIPT: ScriptDevIR = {
  name: 'npc_aged_dying_ancient_kodo',
  boundCreatures: [
    NPC_AGED_KODO,
    NPC_DYING_KODO,
    NPC_ANCIENT_KODO,
    NPC_TAMED_KODO,
  ],
  sourceFile: 'kalimdor/desolace.cpp',
  spellIds: [
    SPELL_KODO_KOMBO_ITEM,
    SPELL_KODO_KOMBO_PLAYER_BUFF,
    SPELL_KODO_KOMBO_DESPAWN_BUFF,
    SPELL_KODO_KOMBO_GOSSIP,
    SPELL_KODO_KOMBOBULATOR,
    SPELL_KODO_DESPAWN,
  ],
  timers: [],
  spellHits: [
    {
      spellId: SPELL_KODO_KOMBO_GOSSIP,
      once: false,
      actions: [
        {
          kind: 'flavor',
          text: `MoveIdle + UNIT_NPC_FLAG_GOSSIP + m_uiDespawnTimer=${KODO_DESPAWN_TIMER_MS}`,
          cite: 'desolace.cpp:99-101 SpellHit 18362',
        },
      ],
      cite: 'desolace.cpp:95-103 SpellHit SPELL_KODO_KOMBO_GOSSIP',
    },
  ],
  gossipHello: {
    defaultTextId: 0,
    cite: 'desolace.cpp:163-177 GossipHello default menu; credit branch when buffs 18172+18377 (kodoGossipHello)',
  },
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_uiDespawnTimer=0',
        cite: 'desolace.cpp:68-71 Reset',
      },
    ],
  },
  cites: [
    'desolace.cpp:36-177 npc_aged_dying_ancient_kodo + KodoKombobulator + GossipHello',
    'desolace.cpp:46 QUEST_KODO=5561',
    'desolace.cpp:49-52 Aged/Dying/Ancient/Tamed entries',
    'desolace.cpp:54-59 combo spells 18153/18172/18377/18362/18793/22970',
    'desolace.cpp:68-71 Reset despawn timer 0',
    'desolace.cpp:73-92 Smeed LOS ≤10yd + SAY + cast 18362',
    'desolace.cpp:95-103 SpellHit 18362 gossip + timer 60000',
    'desolace.cpp:105-118 despawn timer JUST_DIED+Respawn OOC',
    'desolace.cpp:132-161 spell_kodo_kombobulator OnCheckCast/OnEffectExecute',
    'desolace.cpp:163-177 GossipHello TalkedToCreature + strip 18172 + despawn 10s',
    'scriptdev2.sql ScriptName npc_aged_dying_ancient_kodo',
  ],
};

// ScriptDev IR — npc_dalinda_malem

// Cite: desolace.cpp npc_dalinda_malemAI Binding: 5644 Dalinda Malem (in bake). Escort quest 1440 — no
// combat timers. QI4 owns pQuestAcceptNPC; pure helpers dalindaQuestAccept / dalindaWaypointReached.
export const NPC_DALINDA_MALEM_SCRIPT: ScriptDevIR = {
  name: 'npc_dalinda_malem',
  boundCreatures: [NPC_DALINDA_MALEM],
  sourceFile: 'kalimdor/desolace.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; ctor kneel UNIT_STAND_STATE_KNEEL',
        cite: 'desolace.cpp:192,196',
      },
    ],
  },
  cites: [
    'desolace.cpp:179-230 npc_dalinda_malem',
    'desolace.cpp:185 QUEST_RETURN_TO_VAHLARRIEL=1440',
    'desolace.cpp:192 ctor SetStandState KNEEL',
    'desolace.cpp:198-201 JustStartedEscort STAND',
    'desolace.cpp:203-210 WP18 explore credit 1440',
    'desolace.cpp:218-229 QuestAccept faction 10 flags 0x21 + Start',
    'scriptdev2.sql entry 5644',
  ],
};

// ScriptDev IR — npc_melizza_brimbuzzle

// npc_melizza_brimbuzzleAI, creature 12277. Escort 6132 with ambush summons and a dialogue
// credit, no combat cast timers. Bonepaw 4660 is absent from bake, so that summon is unused.
export const NPC_MELIZZA_BRIMBUZZLE_SCRIPT: ScriptDevIR = {
  name: 'npc_melizza_brimbuzzle',
  boundCreatures: [NPC_MELIZZA],
  sourceFile: 'kalimdor/desolace.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; JustStartedEscort opens GO_MELIZZAS_CAGE 177706',
        cite: 'desolace.cpp:300-306',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_MARAUDINE_BONEPAW,
      kind: 'creature',
      reason:
        'NPC 4660 Maraudine Bonepaw is summoned at Melizza WP9 (desolace.cpp:348) but absent from product bake - IR summons record the entry; product cannot spawn Bonepaw until rebake. Wrangler 4655 + Marauder 4659 are in bake.',
      cite: 'desolace.cpp:252,348; loadRealBundle missing 4660',
    },
  ],
  cites: [
    'desolace.cpp:232-415 npc_melizza_brimbuzzle',
    'desolace.cpp:238 QUEST_GET_ME_OUT_OF_HERE=6132',
    'desolace.cpp:240 GO_MELIZZAS_CAGE=177706',
    'desolace.cpp:242-249 SAY_MELIZZA_* + SAY_HORNIZZ_*',
    'desolace.cpp:251-255 Marauder/Bonepaw/Wrangler/Melizza entries',
    'desolace.cpp:261-262 MAX_MARAUDERS=2 MAX_WRANGLERS=3',
    'desolace.cpp:265-276 aIntroDialogue delays',
    'desolace.cpp:284-290 spawn coords',
    'desolace.cpp:302-306 cage open on escort start',
    'desolace.cpp:320-359 WaypointReached ambush + dialogue',
    'desolace.cpp:362-388 JustDidDialogueStep explore credit 6132',
    'desolace.cpp:406-414 QuestAccept Start',
    'scriptdev2.sql entry 12277',
  ],
};

// ScriptDev IR — npc_cork_gizelton

// Cite: desolace.cpp npc_cork_gizeltonAI Binding: 11625 Cork Gizelton (in bake). Dual escort 5821/5943 +
// fail timer. No combat cast timers. Vendor-tron/Super-Seller constants unused in AI body.
export const NPC_CORK_GIZELTON_SCRIPT: ScriptDevIR = {
  name: 'npc_cork_gizelton',
  boundCreatures: [NPC_CORK_GIZELTON],
  sourceFile: 'kalimdor/desolace.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty; FailTimer defaults 60000; StatusFailed/ScriptDone/SouthQuest false',
        cite: 'desolace.cpp:444-449,437',
      },
    ],
  },
  cites: [
    'desolace.cpp:417-566 npc_cork_gizelton',
    'desolace.cpp:428-429 QUEST_BODYGUARD_TO_HIRE=5821 QUEST_GIZELTON_CARAVAN=5943',
    'desolace.cpp:431-435 path ids + post-escort points 33/100',
    'desolace.cpp:437 GIZELTON_TIMER_AFTER_FAIL=60000',
    'desolace.cpp:451-480 MakeQuestFailAndClean group fail both quests + Despawn',
    'desolace.cpp:482-498 fail timer UpdateEscortAI',
    'desolace.cpp:500-542 WP19/21 credit + resume waypoint path',
    'desolace.cpp:545-548 StartRiggerEscort SouthQuest',
    'desolace.cpp:552-555 CreatureGroupMemberDied → StatusFailed',
    'desolace.cpp:558-566 QuestAccept 5821 path 11625',
    'scriptdev2.sql entry 11625',
  ],
};

// ScriptDev IR — npc_rigger_gizelton

// Cite: desolace.cpp npc_rigger_gizeltonAI + QuestAccept Binding: 11626 Rigger Gizelton (in bake). Empty
// AI; QuestAccept 5943 hands off to nearby Cork StartRiggerEscort.
export const NPC_RIGGER_GIZELTON_SCRIPT: ScriptDevIR = {
  name: 'npc_rigger_gizelton',
  boundCreatures: [NPC_RIGGER_GIZELTON],
  sourceFile: 'kalimdor/desolace.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'Reset empty (ScriptedAI)',
        cite: 'desolace.cpp:576',
      },
    ],
  },
  cites: [
    'desolace.cpp:568-590 npc_rigger_gizelton',
    'desolace.cpp:576 Reset empty',
    'desolace.cpp:579-589 QuestAccept 5943 → Cork StartRiggerEscort ≤100yd',
    'scriptdev2.sql entry 11626',
  ],
};

// ScriptDev IR — npc_magrami_spectre

// Cite: desolace.cpp npc_magrami_spectre Binding: 11560 Magrami Spectre (in bake). Quest 6134 residual
// combat: spawn auras + arrive faction + one-shot Curse 18159 at 4s. Outdoor zone — no InstanceDef.
export const NPC_MAGRAMI_SPECTRE_SCRIPT: ScriptDevIR = {
  name: 'npc_magrami_spectre',
  boundCreatures: [NPC_MAGRAMI_SPECTRE],
  sourceFile: 'kalimdor/desolace.cpp',
  spellIds: [
    SPELL_CURSE_OF_MAGRAMI,
    SPELL_GHOST_SPAWN_IN,
    SPELL_BLUE_AURA,
    SPELL_GREEN_AURA,
    SPELL_CHILLING_TOUCH,
  ],
  timers: [
    {
      id: 'chilling_touch',
      spellId: SPELL_CHILLING_TOUCH,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite:
        'desolace.cpp:621 JustRespawned CastSpell SPELL_CHILLING_TOUCH (host onReset AURA_NOT_PRESENT stand-in)',
    },
    {
      id: 'curse_of_magrami',
      spellId: SPELL_CURSE_OF_MAGRAMI,
      initialMinMs: MAGRAMI_CURSE_INIT_MS,
      initialMaxMs: MAGRAMI_CURSE_INIT_MS,
      // cpp zeros timer after cast (one-shot). Host always EFLAG_REPEATABLE —
      // re-arm at bake aura duration so product does not spam every tick.
      repeatMinMs: MAGRAMI_CURSE_AURA_DURATION_MS,
      repeatMaxMs: MAGRAMI_CURSE_AURA_DURATION_MS,
      target: 'victim',
      cite:
        'desolace.cpp:614,655-660 m_uiCurseTimer=4000 then =0 + DoCastSpellIfCan(victim, 18159); re-arm 900000ms = spell-data aura duration (one-shot stand-in)',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_uiCurseTimer=4000; JustRespawned casts 17321/17327/18146 + emote (magramiJustRespawned)',
        cite: 'desolace.cpp:612-631',
      },
    ],
  },
  cites: [
    'desolace.cpp:592-673 npc_magrami_spectre',
    'desolace.cpp:594-598 SPELL_CURSE_OF_MAGRAMI=18159 GHOST_SPAWN_IN=17321 BLUE=17327 GREEN=18951 CHILLING_TOUCH=18146',
    'desolace.cpp:600 FACTION_HOSTILE=16',
    'desolace.cpp:602-603 SAY_EMOTE_1/2',
    'desolace.cpp:612-615 Reset curse timer 4000',
    'desolace.cpp:617-631 JustRespawned auras + emote',
    'desolace.cpp:634-647 MovementInform point 1 green aura + hostile',
    'desolace.cpp:650-667 UpdateAI curse once + melee',
    'scriptdev2.sql entry 11560',
  ],
};
