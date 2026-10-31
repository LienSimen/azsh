// QI4 — kalimdor/desolace residuals, extracted for the 1500-line ratchet. Quests 1440, 5561, 5821,
// 5943 and 6132. Cite: kalimdor/desolace.cpp.

import type { DbScriptIntent } from './types.ts';
import {
  NPC_FLAG_CHANGE_ADD,
  UNIT_STAND_STATE_STAND,
} from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface DesolaceQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: desolace.cpp:185 QUEST_RETURN_TO_VAHLARRIEL = 1440 Escort Dalinda Malem; WP18 event explore credit.
export const QUEST_RETURN_TO_VAHLARRIEL = 1440;
// Cite: desolace.cpp:46 QUEST_KODO = 5561 Kodo Kombobulator tame + gossip TalkedToCreature credit residual.
export const QUEST_KODO = 5561;
// Cite: desolace.cpp:428 QUEST_BODYGUARD_TO_HIRE = 5821 Escort Cork Gizelton caravan north path; WP19
// explore credit.
export const QUEST_BODYGUARD_TO_HIRE = 5821;
// Cite: desolace.cpp:429 QUEST_GIZELTON_CARAVAN = 5943 Rigger accept → Cork StartRiggerEscort south path;
// WP21 explore credit.
export const QUEST_GIZELTON_CARAVAN = 5943;
// Cite: desolace.cpp:238 QUEST_GET_ME_OUT_OF_HERE = 6132 Escort Melizza Brimbuzzle; dialogue step explore
// credit.
export const QUEST_GET_ME_OUT_OF_HERE = 6132;

/** Cite: bake starterCreatureEntries quest 1440; scriptdev2 dalinda entry Dalinda Malem. */
const NPC_DALINDA_MALEM = 5644;
/** Cite: bake enderCreatureEntries quest 1440 — Vahlarriel Demonslayer (5642). */
const NPC_VAHLARRIEL = 5642;

/** Cite: bake starter/ender quest 5561; desolace.cpp:48 NPC_SMEED = 11596 */
const NPC_SMEED = 11596;
/** Cite: desolace.cpp:49–52 aged/dying/ancient kodo templates for spell target check. */
const NPC_AGED_KODO = 4700;
const NPC_DYING_KODO = 4701;
const NPC_ANCIENT_KODO = 4702;
// Cite: desolace.cpp:52 NPC_TAMED_KODO = 11627 Bake killTargets quest 5561 ×5; UpdateEntry +
// TalkedToCreature credit entry.
const NPC_TAMED_KODO = 11627;
/** Cite: bake srcItem/itemTargets quest 5561 — Kodo Kombobulator (13892). */
const ITEM_KODO_KOMBOBULATOR = 13892;
/** Cite: desolace.cpp:54 SPELL_KODO_KOMBO_ITEM = 18153 (spell_kodo_kombobulator). */
const SPELL_KODO_KOMBO_ITEM = 18153;
/** Cite: desolace.cpp:55 SPELL_KODO_KOMBO_PLAYER_BUFF = 18172 */
const SPELL_KODO_KOMBO_PLAYER_BUFF = 18172;
/** Cite: desolace.cpp:56 SPELL_KODO_KOMBO_DESPAWN_BUFF = 18377 */
const SPELL_KODO_KOMBO_DESPAWN_BUFF = 18377;
/** Cite: desolace.cpp:57 SPELL_KODO_KOMBO_GOSSIP = 18362 (LOS Smeed → gossip flag). */
const SPELL_KODO_KOMBO_GOSSIP = 18362;
/** Cite: desolace.cpp:42–44 SAY_SMEED_HOME_1..3 script texts (urand FO6). */
const SAY_SMEED_HOME_1 = -1000348;
const SAY_SMEED_HOME_3 = -1000350;
// Cite: desolace.cpp:101 m_uiDespawnTimer = 60000 after gossip aura. Cite: desolace.cpp:171
// ForcedDespawn(10000) on GossipHello credit.
const KODO_GOSSIP_DESPAWN_TIMER_MS = 60000;
const KODO_CREDIT_FORCED_DESPAWN_MS = 10000;
/** Cite: Unit.h UNIT_NPC_FLAG_GOSSIP = 0x1; SpellHit sets gossip after Smeed LOS. */
const UNIT_NPC_FLAG_GOSSIP = 0x00000001;

// Cite: desolace.cpp:424 NPC_CORK_GIZELTON = 11625 Bake starterCreatureEntries quest 5821; handles both
// caravan escorts.
const NPC_CORK_GIZELTON = 11625;
/** Cite: desolace.cpp:425 NPC_RIGGER_GIZELTON = 11626 Bake starterCreatureEntries quest 5943. */
const NPC_RIGGER_GIZELTON = 11626;
/** Cite: desolace.cpp:432 PATH_ID_CORK_GIZELTON = 11625 Cork escort path for Bodyguard for Hire. */
const PATH_ID_CORK_GIZELTON = 11625;
// Cite: desolace.cpp:433 PATH_ID_RIGGER_GIZELTON = 11626 Cork StartRiggerEscort path for Gizelton Caravan.
const PATH_ID_RIGGER_GIZELTON = 11626;
// Cite: desolace.cpp:437 GIZELTON_TIMER_AFTER_FAIL = 60 * IN_MILLISECONDS Common.h IN_MILLISECONDS=1000 →
// 60000ms member-died fail clean-up.
const GIZELTON_TIMER_AFTER_FAIL_MS = 60 * 1000;

/** Cite: desolace.cpp:255 NPC_MELIZZA = 12277 Bake starterCreatureEntries quest 6132. */
const NPC_MELIZZA = 12277;
// Cite: world_kalimdor.h:30 NPC_HORNIZZ = 6019; bake enderCreatureEntries 6132. Cite: desolace.cpp:256
// commented NPC_HORNIZZ = 6019 (storage via instance).
const NPC_HORNIZZ = 6019;
/** Cite: desolace.cpp:240 GO_MELIZZAS_CAGE = 177706 JustStartedEscort UseDoorOrButton. */
const GO_MELIZZAS_CAGE = 177706;
/** Cite: desolace.cpp:242–246 Melizza script texts. */
const SAY_MELIZZA_START = -1000784;
const SAY_MELIZZA_FINISH = -1000785;
const SAY_MELIZZA_1 = -1000786;
const SAY_MELIZZA_3 = -1000788;
/** Cite: desolace.cpp:248–249 Hornizz dialogue after escort. */
const SAY_HORNIZZ_1 = -1010030;
const SAY_HORNIZZ_2 = -1010031;
/** Cite: desolace.cpp:251–253 Maraudine ambush entries (FO6 summons). */
const NPC_MARAUDINE_MARAUDER = 4659;
const NPC_MARAUDINE_BONEPAW = 4660;
const NPC_MARAUDINE_WRANGLER = 4655;
/** Cite: desolace.cpp:261–262 MAX_MARAUDERS = 2; MAX_WRANGLERS = 3 */
const MAX_MARAUDERS = 2;
const MAX_WRANGLERS = 3;

// Cite: ScriptDevAIMgr.h:44 FACTION_ESCORT_A_NEUTRAL_PASSIVE = 10 Dalinda SetFactionTemporary on accept.
const FACTION_ESCORT_A_NEUTRAL_PASSIVE = 10;
/** Cite: ScriptDevAIMgr.h:46 FACTION_ESCORT_N_NEUTRAL_PASSIVE = 113 Melizza SetFactionTemporary at WP1. */
const FACTION_ESCORT_N_NEUTRAL_PASSIVE = 113;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: desolace.cpp:225 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 | 0x20 =
// 0x21
const DALINDA_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_dalinda_malem — quest 1440 Return to Vahlarriel: temporary passive faction and
// escort start; WP18 carries the explore credit. Cite: desolace.cpp:218–229, :203–210.
function runDalindaAccept(): DbScriptIntent[] {
  const citeFaction =
    'desolace.cpp:225 SetFactionTemporary(FACTION_ESCORT_A_NEUTRAL_PASSIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_TOGGLE_IMMUNE_TO_NPC)';
  const citeStand =
    'desolace.cpp:198–201 JustStartedEscort SetStandState(UNIT_STAND_STATE_STAND)';
  const citeEscort =
    `desolace.cpp:226 npc_dalinda_malem (${NPC_DALINDA_MALEM}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeCredit =
    'desolace.cpp:205–208 WP18 RewardPlayerAndGroupAtEventExplored(1440) - FO6 finishEscort';
  const citeEnder =
    `bake enderCreatureEntries NPC_VAHLARRIEL=${NPC_VAHLARRIEL} after WP18 explore credit`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_A_NEUTRAL_PASSIVE,
      flags: DALINDA_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND,
      cite: citeStand,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_dalinda_malem (${NPC_DALINDA_MALEM}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        'WP18 RewardPlayerAndGroupAtEventExplored(1440) - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_VAHLARRIEL (${NPC_VAHLARRIEL}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_melizza_brimbuzzle — quest 6132 Get Me Out of Here!: open the cage, escort, and
// Maraudine ambushes; WP12's dialogue credits it. Cite: desolace.cpp:406–415, :302–378.
function runMelizzaAccept(): DbScriptIntent[] {
  const citeEscort =
    `desolace.cpp:411 npc_melizza_brimbuzzle (${NPC_MELIZZA}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeCage =
    `desolace.cpp:304–305 JustStartedEscort GO_MELIZZAS_CAGE=${GO_MELIZZAS_CAGE} UseDoorOrButton - FO6`;
  const citeWp1 =
    `desolace.cpp:324–328 WP1 DoScriptText(SAY_MELIZZA_START=${SAY_MELIZZA_START}) + ` +
    `SetFactionTemporary(FACTION_ESCORT_N_NEUTRAL_PASSIVE=${FACTION_ESCORT_N_NEUTRAL_PASSIVE}, ` +
    `TEMPFACTION_RESTORE_RESPAWN) - FO6`;
  const citeSummons =
    `desolace.cpp:330–351 WP4 MAX_MARAUDERS=${MAX_MARAUDERS}×2 NPC_MARAUDINE_MARAUDER=${NPC_MARAUDINE_MARAUDER}; ` +
    `WP9 MAX_WRANGLERS=${MAX_WRANGLERS} NPC_MARAUDINE_BONEPAW=${NPC_MARAUDINE_BONEPAW}/` +
    `NPC_MARAUDINE_WRANGLER=${NPC_MARAUDINE_WRANGLER} - FO6 combat`;
  const citeCredit =
    `desolace.cpp:369–378 dialogue QUEST_GET_ME_OUT_OF_HERE: ` +
    `DoScriptText(SAY_MELIZZA_FINISH=${SAY_MELIZZA_FINISH}) + ` +
    'RewardPlayerAndGroupAtEventExplored(6132) - FO6 finishEscort';
  const citePost =
    `desolace.cpp:380–386 WP19 post-credit SAY_MELIZZA_1..3=${SAY_MELIZZA_1}–${SAY_MELIZZA_3}; ` +
    `SAY_HORNIZZ_1/2=${SAY_HORNIZZ_1}/${SAY_HORNIZZ_2} NPC_HORNIZZ=${NPC_HORNIZZ} - FO6`;
  const citeEnder =
    `bake enderCreatureEntries NPC_HORNIZZ=${NPC_HORNIZZ} after explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_melizza_brimbuzzle (${NPC_MELIZZA}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `JustStartedEscort open GO_MELIZZAS_CAGE (${GO_MELIZZAS_CAGE}) - FO6`,
      cite: citeCage,
    },
    {
      kind: 'skip',
      reason:
        `WP1 SAY_MELIZZA_START (${SAY_MELIZZA_START}) + FACTION_ESCORT_N_NEUTRAL_PASSIVE ` +
        `(${FACTION_ESCORT_N_NEUTRAL_PASSIVE}) flags 0x01 - FO6`,
      cite: citeWp1,
    },
    {
      kind: 'skip',
      reason:
        `WP4/9 Maraudine summons (${NPC_MARAUDINE_MARAUDER}/${NPC_MARAUDINE_BONEPAW}/` +
        `${NPC_MARAUDINE_WRANGLER}) - FO6 combat`,
      cite: citeSummons,
    },
    {
      kind: 'skip',
      reason:
        `dialogue RewardPlayerAndGroupAtEventExplored(6132) + SAY_MELIZZA_FINISH ` +
        `(${SAY_MELIZZA_FINISH}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `post-credit Melizza/Hornizz dialogue (${SAY_MELIZZA_1}–${SAY_MELIZZA_3}, ` +
        `${SAY_HORNIZZ_1}/${SAY_HORNIZZ_2}) - FO6`,
      cite: citePost,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_HORNIZZ (${NPC_HORNIZZ}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_cork_gizelton — quest 5821 Bodyguard for Hire: escort path 11625, with WP19
// carrying the explore credit. A caravan death fails the quest. Cite: desolace.cpp:558–566.
function runCorkBodyguardAccept(): DbScriptIntent[] {
  const citeEscort =
    `desolace.cpp:563 npc_cork_gizelton (${NPC_CORK_GIZELTON}) ` +
    `Start(false, player, quest, false, false, PATH_ID_CORK_GIZELTON=${PATH_ID_CORK_GIZELTON}) ` +
    '- FO6 degraded finishEscort';
  const citeCredit =
    'desolace.cpp:509–516 WP19 RewardPlayerAndGroupAtEventExplored(5821) + End - FO6 finishEscort';
  const citeFail =
    `desolace.cpp:451–480,552–555 CreatureGroupMemberDied → FailQuest(5821/5943) after ` +
    `GIZELTON_TIMER_AFTER_FAIL=${GIZELTON_TIMER_AFTER_FAIL_MS}ms - FO6 fail path`;
  const citeEnder =
    `bake enderCreatureEntries NPC_SMEED=${NPC_SMEED} after WP19 explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, false, false, path=${PATH_ID_CORK_GIZELTON}) ` +
        `npc_cork_gizelton (${NPC_CORK_GIZELTON}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        'WP19 RewardPlayerAndGroupAtEventExplored(5821) + End - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `CreatureGroupMemberDied fail clean-up timer ${GIZELTON_TIMER_AFTER_FAIL_MS}ms - FO6`,
      cite: citeFail,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_SMEED (${NPC_SMEED}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_rigger_gizelton — quest 5943 Gizelton Caravan: Rigger hands off to Cork, who
// runs path 11626; WP21 carries the credit. Cite: desolace.cpp:579–590, :526–540.
function runRiggerCaravanAccept(): DbScriptIntent[] {
  const citeRigger =
    `desolace.cpp:585–587 npc_rigger_gizelton (${NPC_RIGGER_GIZELTON}) ` +
    `GetClosestCreatureWithEntry(NPC_CORK_GIZELTON=${NPC_CORK_GIZELTON}, 100.0f) → StartRiggerEscort`;
  const citeEscort =
    `desolace.cpp:545–549 StartRiggerEscort SouthQuest + ` +
    `Start(false, player, quest, false, false, PATH_ID_RIGGER_GIZELTON=${PATH_ID_RIGGER_GIZELTON}) ` +
    '- FO6 degraded finishEscort';
  const citeCredit =
    'desolace.cpp:526–533 WP21 RewardPlayerAndGroupAtEventExplored(5943) + End - FO6 finishEscort';
  const citeEnder =
    `bake enderCreatureEntries NPC_SMEED=${NPC_SMEED} after WP21 explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `Rigger accept → Cork (${NPC_CORK_GIZELTON}) StartRiggerEscort - FO6`,
      cite: citeRigger,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, false, false, path=${PATH_ID_RIGGER_GIZELTON}) ` +
        `npc_cork_gizelton (${NPC_CORK_GIZELTON}) SouthQuest - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        'WP21 RewardPlayerAndGroupAtEventExplored(5943) + End - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_SMEED (${NPC_SMEED}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// ── frame residuals (no pQuestAcceptNPC) ─────────────────────────────────────

// The Kodo Roundup residual — quest 5561: the Kombobulator re-templates a kodo and makes it follow,
// and gossiping it at Smeed gives the credit. Cite: desolace.cpp:133–172.
function runKodoRoundupResidual(): DbScriptIntent[] {
  const citeSpell =
    `desolace.cpp:133–160 KodoKombobulator SPELL_KODO_KOMBO_ITEM=${SPELL_KODO_KOMBO_ITEM} ` +
    `on NPC_AGED_KODO/DYING/ANCIENT=${NPC_AGED_KODO}/${NPC_DYING_KODO}/${NPC_ANCIENT_KODO}`;
  const citeBuffs =
    `desolace.cpp:151–154 SPELL_KODO_KOMBO_PLAYER_BUFF=${SPELL_KODO_KOMBO_PLAYER_BUFF}; ` +
    `SPELL_KODO_KOMBO_DESPAWN_BUFF=${SPELL_KODO_KOMBO_DESPAWN_BUFF}`;
  const citeEntry =
    `desolace.cpp:153 UpdateEntry(NPC_TAMED_KODO=${NPC_TAMED_KODO}) from aged/dying/ancient`;
  const citeFollow =
    'desolace.cpp:159 MoveFollow(caster, PET_FOLLOW_DIST, PET_FOLLOW_ANGLE) - FO6 follow';
  const citeSmeed =
    `desolace.cpp:75–101 LOS NPC_SMEED=${NPC_SMEED} 10yd: urand SAY_SMEED_HOME_1..3=` +
    `${SAY_SMEED_HOME_1}–${SAY_SMEED_HOME_3}; SPELL_KODO_KOMBO_GOSSIP=${SPELL_KODO_KOMBO_GOSSIP}; ` +
    `SetFlag GOSSIP + m_uiDespawnTimer=${KODO_GOSSIP_DESPAWN_TIMER_MS} - FO6`;
  const citeGossip =
    `desolace.cpp:163–172 GossipHello TalkedToCreature(NPC_TAMED_KODO=${NPC_TAMED_KODO}) ` +
    `when player buff + despawn buff; ForcedDespawn(${KODO_CREDIT_FORCED_DESPAWN_MS})`;
  const citeItem =
    `bake srcItem ITEM_KODO_KOMBOBULATOR=${ITEM_KODO_KOMBOBULATOR}; killTargets ${NPC_TAMED_KODO}×5`;
  const citeEnder =
    `bake enderCreatureEntries NPC_SMEED=${NPC_SMEED} after 5 tamed-kodo credits`;
  const priorFlags = 0;
  const afterGossip = priorFlags | UNIT_NPC_FLAG_GOSSIP;
  return [
    {
      kind: 'skip',
      reason:
        `SpellHit SPELL_KODO_KOMBO_ITEM (${SPELL_KODO_KOMBO_ITEM}) on aged/dying/ancient kodo ` +
        `(${NPC_AGED_KODO}/${NPC_DYING_KODO}/${NPC_ANCIENT_KODO}) incomplete 5561`,
      cite: citeSpell,
    },
    {
      kind: 'cast_spell',
      spellId: SPELL_KODO_KOMBO_PLAYER_BUFF,
      castFlags: 0,
      sourceIsGo: false,
      targetCleared: false,
      cite: citeBuffs,
    },
    {
      kind: 'update_template',
      oldEntry: NPC_AGED_KODO,
      newTemplate: NPC_TAMED_KODO,
      changed: true,
      cite: citeEntry,
    },
    {
      kind: 'skip',
      reason: 'MoveFollow caster PET_FOLLOW_DIST/ANGLE - FO6 follow',
      cite: citeFollow,
    },
    {
      kind: 'skip',
      reason:
        `LOS Smeed (${NPC_SMEED}) SAY_SMEED_HOME (${SAY_SMEED_HOME_1}–${SAY_SMEED_HOME_3}) + ` +
        `SPELL_KODO_KOMBO_GOSSIP (${SPELL_KODO_KOMBO_GOSSIP}) timer ${KODO_GOSSIP_DESPAWN_TIMER_MS} - FO6`,
      cite: citeSmeed,
    },
    {
      kind: 'modify_npc_flags',
      flag: UNIT_NPC_FLAG_GOSSIP,
      changeFlag: NPC_FLAG_CHANGE_ADD,
      mode: 'add',
      resultFlags: afterGossip,
      cite: citeSmeed,
    },
    {
      kind: 'kill_credit',
      creatureEntry: NPC_TAMED_KODO,
      cite: citeGossip,
    },
    {
      kind: 'despawn_self',
      despawnDelay: KODO_CREDIT_FORCED_DESPAWN_MS,
      cite: citeGossip,
    },
    {
      kind: 'skip',
      reason:
        `srcItem Kodo Kombobulator (${ITEM_KODO_KOMBOBULATOR}); kill tamed kodo (${NPC_TAMED_KODO})×5`,
      cite: citeItem,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_SMEED (${NPC_SMEED}) after 5 tamed-kodo credits`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/desolace.cpp Hooks: pQuestAcceptNPC dalinda (1440), melizza (6132), cork (5821),
// rigger (5943). Residual: aged/dying/ancient kodo + KodoKombobulator gossip (5561 frame).
export function runDesolace(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_RETURN_TO_VAHLARRIEL) return runDalindaAccept();
    if (questId === QUEST_GET_ME_OUT_OF_HERE) return runMelizzaAccept();
    if (questId === QUEST_BODYGUARD_TO_HIRE) return runCorkBodyguardAccept();
    if (questId === QUEST_GIZELTON_CARAVAN) return runRiggerCaravanAccept();
    return [];
  }
  if (phase === 'frame' || phase === 'complete') {
    if (questId === QUEST_KODO) return runKodoRoundupResidual();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/desolace'` in registry.ts.
export const DESOLACE_REGISTRY: Record<string | number, DesolaceQuestScriptEntry> = {
  'kalimdor/desolace': {
    family: 'kalimdor/desolace',
    questIds: [
      QUEST_RETURN_TO_VAHLARRIEL,
      QUEST_KODO,
      QUEST_BODYGUARD_TO_HIRE,
      QUEST_GIZELTON_CARAVAN,
      QUEST_GET_ME_OUT_OF_HERE,
    ],
    hooks: ['accept', 'frame', 'complete'],
    cite: 'kalimdor/desolace.cpp:133–177,218–229,406–415,545–590',
    run: runDesolace,
  },
  [QUEST_RETURN_TO_VAHLARRIEL]: {
    family: 'kalimdor/desolace',
    questId: QUEST_RETURN_TO_VAHLARRIEL,
    questIds: [QUEST_RETURN_TO_VAHLARRIEL],
    hooks: ['accept'],
    cite: 'desolace.cpp:218–229 QuestAccept_npc_dalinda_malem',
    run: runDesolace,
  },
  [QUEST_KODO]: {
    family: 'kalimdor/desolace',
    questId: QUEST_KODO,
    questIds: [QUEST_KODO],
    hooks: ['frame', 'complete'],
    cite: 'desolace.cpp:133–177 KodoKombobulator + GossipHello residual',
    run: runDesolace,
  },
  [QUEST_BODYGUARD_TO_HIRE]: {
    family: 'kalimdor/desolace',
    questId: QUEST_BODYGUARD_TO_HIRE,
    questIds: [QUEST_BODYGUARD_TO_HIRE],
    hooks: ['accept'],
    cite: 'desolace.cpp:558–566 QuestAccept_npc_cork_gizelton',
    run: runDesolace,
  },
  [QUEST_GIZELTON_CARAVAN]: {
    family: 'kalimdor/desolace',
    questId: QUEST_GIZELTON_CARAVAN,
    questIds: [QUEST_GIZELTON_CARAVAN],
    hooks: ['accept'],
    cite: 'desolace.cpp:579–590 QuestAccept_npc_rigger_gizelton',
    run: runDesolace,
  },
  [QUEST_GET_ME_OUT_OF_HERE]: {
    family: 'kalimdor/desolace',
    questId: QUEST_GET_ME_OUT_OF_HERE,
    questIds: [QUEST_GET_ME_OUT_OF_HERE],
    hooks: ['accept'],
    cite: 'desolace.cpp:406–415 QuestAccept_npc_melizza_brimbuzzle',
    run: runDesolace,
  },
};
