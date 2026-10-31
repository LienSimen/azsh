// QI4 — kalimdor/felwood residuals, extracted for the 1500-line ratchet. Quests 4261, 4506 and
// 5203. Cite: kalimdor/felwood.cpp.

import type { DbScriptIntent } from './types.ts';
import {
  NPC_FLAG_CHANGE_ADD,
  TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN,
  UNIT_STAND_STATE_STAND,
} from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface FelwoodQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

/** Cite: felwood.cpp:331 QUEST_ID_ANCIENT_SPIRIT = 4261 Escort Arei; dialogue epilog explore credit. */
export const QUEST_ID_ANCIENT_SPIRIT = 4261;
// Cite: felwood.cpp:50 QUEST_CORRUPT_SABER = 4506 Kitten → corrupt saber residual + gossip
// AreaExploredOrEventHappens.
export const QUEST_CORRUPT_SABER = 4506;
// Cite: felwood.cpp:175 QUEST_ID_RESCUE_JAEDENAR = 5203 Escort Captured Arko'narin; WP85 explore credit.
export const QUEST_ID_RESCUE_JAEDENAR = 5203;

// Cite: felwood.cpp:327 NPC_AREI = 9598; scriptdev2.sql:365 ScriptName='npc_arei' Bake
// starterCreatureEntries quest 4261.
const NPC_AREI = 9598;
/** Cite: bake enderCreatureEntries quest 4261 — Kayneth Stillwind (3848). */
const NPC_KAYNETH_STILLWIND = 3848;
/** Cite: felwood.cpp:328–330 Arei ambush / combat entries. */
const NPC_TOXIC_HORROR = 7132;
const NPC_IRONTREE_WANDERER = 7138;
const NPC_IRONTREE_STOMPER = 7139;

/** Cite: scriptdev2.sql:362 ScriptName='npc_kitten' WHERE entry=9937 */
const NPC_KITTEN = 9937;
// Cite: felwood.cpp:51–52 NPC_WINNA / NPC_CORRUPT_SABER Bake starter/ender 9996; scriptdev2.sql:363
// entry=10042.
const NPC_WINNA = 9996;
const NPC_CORRUPT_SABER = 10042;
/** Cite: bake srcItem quest 4506 — Winna's Kitten Carrier (12565). */
const ITEM_WINNA_KITTEN_CARRIER = 12565;

// Cite: scriptdev2.sql:364 ScriptName='npc_captured_arkonarin' WHERE entry=11016 Bake
// starterCreatureEntries quest 5203.
const NPC_CAPTURED_ARKONARIN = 11016;
/** Cite: bake enderCreatureEntries quest 5203 — Jessir Moonbow (11019). */
const NPC_JESSIR_MOONBOW = 11019;
/** Cite: felwood.cpp:176–178 Arkonarin escort NPCs / cage. */
const NPC_JAEDENAR_LEGIONNAIRE = 9862;
const NPC_SPIRT_TREY = 11141;
const GO_ARKONARIN_CAGE = 176306;
/** Cite: felwood.cpp:181 PATH_ID = 11016 Sniffed waypoints for escort Start. */
const PATH_ID_ARKONARIN = 11016;

/** Cite: felwood.cpp:45–46 kitten / saber script texts. */
const EMOTE_SAB_JUMP = -1000541;
const EMOTE_SAB_FOLLOW = -1000542;
// Cite: felwood.cpp:48 SPELL_CORRUPT_SABER_VISUAL = 16510 Moonwell cast → CorruptedSaberVisual entry morph.
const SPELL_CORRUPT_SABER_VISUAL = 16510;
/** Cite: felwood.cpp:72 m_uiMoonwellCooldown = 7500 */
const MOONWELL_COOLDOWN_MS = 7500;
// Cite: ObjectDefines.h:25 INTERACTION_DISTANCE = 5.0f MoveInLineOfSight Winna gossip flag + GossipHello
// cage check.
const INTERACTION_DISTANCE = 5;

/** Cite: felwood.cpp:170 SAY_ESCORT_START = 6433 (DoBroadcastText) */
const SAY_ESCORT_START = 6433;
/** Cite: felwood.cpp:172–173 combat spells after WP37. */
const SPELL_MORTAL_STRIKE = 16856;
const SPELL_CLEAVE = 15496;
/** Cite: felwood.cpp:186 aRandomAggro = { 6801, 6802, 6803 } */
const SAY_AGGRO_1 = 6801;
const SAY_AGGRO_3 = 6803;

/** Cite: felwood.cpp:314–322 Arei escort / epilog script texts. */
const SAY_AREI_ESCORT_START = -1001159;
const SAY_ATTACK_IRONTREE = -1001160;
const SAY_ATTACK_TOXIC_HORROR = -1001161;
const SAY_EXIT_WOODS = -1001162;
const SAY_CLEAR_PATH = -1001163;
const SAY_ASHENVALE = -1001164;
const SAY_TRANSFORM = -1001165;
const SAY_LIFT_CURSE = -1001166;
const SAY_AREI_ESCORT_COMPLETE = -1001167;
/** Cite: felwood.cpp:324–325 Arei combat / transform spells. */
const SPELL_WITHER_STRIKE = 5337;
const SPELL_AREI_TRANSFORM = 14888;
/** Cite: felwood.cpp:423–425 WP37 SummonCreature coords + TEMPSPAWN 60000. */
const AREI_STOMPER_SPAWN = {
  x: 6573.321,
  y: -1195.213,
  z: 442.489,
  o: 0,
} as const;
const AREI_WANDERER_SPAWN_1 = {
  x: 6573.24,
  y: -1213.475,
  z: 443.643,
  o: 0,
} as const;
const AREI_WANDERER_SPAWN_2 = {
  x: 6583.354,
  y: -1209.811,
  z: 444.769,
  o: 0,
} as const;
/** Cite: felwood.cpp:423–425 TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN, 60000 */
const AREI_SUMMON_DESPAWN_MS = 60000;
/** Cite: felwood.cpp:455 ForcedDespawn(10000) after explore credit. */
const AREI_CREDIT_DESPAWN_MS = 10000;

// Cite: ScriptDevAIMgr.h:46 FACTION_ESCORT_N_NEUTRAL_PASSIVE = 113 Arei SetFactionTemporary on escort
// start.
const FACTION_ESCORT_N_NEUTRAL_PASSIVE = 113;
// Cite: ScriptDevAIMgr.h:50 FACTION_ESCORT_N_NEUTRAL_ACTIVE = 250 Arkonarin SetFactionTemporary on escort
// start.
const FACTION_ESCORT_N_NEUTRAL_ACTIVE = 250;
/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:582 TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20 */
const TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x20;
// Cite: felwood.cpp:229 TEMPFACTION_RESTORE_RESPAWN + TEMPFACTION_TOGGLE_IMMUNE_TO_NPC = 0x01 + 0x20 = 0x21
// (same as bitwise OR for these flags).
const ARKONARIN_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN + TEMPFACTION_TOGGLE_IMMUNE_TO_NPC;
/** Cite: AIDefines.h:43 AI_EVENT_START_ESCORT = 100 */
const AI_EVENT_START_ESCORT = 100;
/** Cite: Unit.h:477 UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200 WP85 SetFlag after credit. */
const UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200;
/** Cite: Unit.h:470 UNIT_FLAG_SPAWNING = 0x00000002 Kitten constructor SetFlag while paused at moonwell. */
const UNIT_FLAG_SPAWNING = 0x00000002;
/** Cite: Unit.h:510 UNIT_NPC_FLAG_GOSSIP = 0x00000001 Kitten MoveInLineOfSight near Winna. */
const UNIT_NPC_FLAG_GOSSIP = 0x00000001;
/** Cite: SharedDefines.h:750 EMOTE_ONESHOT_TALK = 1 Arkonarin WP1 HandleEmote. */
const EMOTE_ONESHOT_TALK = 1;
/** Cite: Unit.h TRIGGERED_NONE = 0 for CastSpell corrupt saber visual. */
const TRIGGERED_NONE = 0;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_arei — quest 4261 Ancient Spirit: the AI event says the start line, sets a
// passive faction and runs the escort; the WP37 dialogue credits it. Cite: felwood.cpp:485–491.
function runAreiAccept(questId: number): DbScriptIntent[] {
  const citeEvent =
    `felwood.cpp:488 npc_arei (${NPC_AREI}) ` +
    'SendAIEvent(AI_EVENT_START_ESCORT, player, creature, questId)';
  const citeTalk =
    `felwood.cpp:410 DoScriptText(SAY_AREI_ESCORT_START=${SAY_AREI_ESCORT_START}) via ReceiveAIEvent`;
  const citeFaction =
    'felwood.cpp:412 SetFactionTemporary(FACTION_ESCORT_N_NEUTRAL_PASSIVE, TEMPFACTION_RESTORE_RESPAWN)';
  const citeEscort =
    `felwood.cpp:413 npc_escortAI::Start(true, player, quest) npc_arei (${NPC_AREI}) - FO6 degraded finishEscort`;
  const citeWp37 =
    `felwood.cpp:419–425 WP37 SetEscortPaused + SummonCreature ` +
    `NPC_IRONTREE_STOMPER=${NPC_IRONTREE_STOMPER} + 2× NPC_IRONTREE_WANDERER=${NPC_IRONTREE_WANDERER} ` +
    `TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN ${AREI_SUMMON_DESPAWN_MS}ms - FO6 combat`;
  const citeAggro =
    `felwood.cpp:366–378 Aggro SAY_ATTACK_IRONTREE=${SAY_ATTACK_IRONTREE} / ` +
    `SAY_ATTACK_TOXIC_HORROR=${SAY_ATTACK_TOXIC_HORROR} (NPC_TOXIC_HORROR=${NPC_TOXIC_HORROR}) - FO6 combat`;
  const citeExit =
    `felwood.cpp:385–387 JustSummoned stomper DoScriptText(SAY_EXIT_WOODS=${SAY_EXIT_WOODS}) - FO6`;
  const citeDialogue =
    `felwood.cpp:334–341,437–457 epilog SAY_CLEAR_PATH=${SAY_CLEAR_PATH} → ` +
    `SPELL_WITHER_STRIKE=${SPELL_WITHER_STRIKE}/SAY_ASHENVALE=${SAY_ASHENVALE} → ` +
    `SAY_TRANSFORM=${SAY_TRANSFORM} → SPELL_AREI_TRANSFORM=${SPELL_AREI_TRANSFORM}/` +
    `SAY_LIFT_CURSE=${SAY_LIFT_CURSE} → explore credit - FO6 dialogue`;
  const citeCredit =
    `felwood.cpp:450–455 QUEST_ID_ANCIENT_SPIRIT step: ` +
    `DoScriptText(SAY_AREI_ESCORT_COMPLETE=${SAY_AREI_ESCORT_COMPLETE}) + ` +
    `RewardPlayerAndGroupAtEventExplored(4261) + ForcedDespawn(${AREI_CREDIT_DESPAWN_MS}) - FO6 finishEscort`;
  const citeEnder =
    `bake enderCreatureEntries NPC_KAYNETH_STILLWIND=${NPC_KAYNETH_STILLWIND} after explore credit`;
  return [
    {
      kind: 'send_ai_event',
      eventType: AI_EVENT_START_ESCORT,
      radius: 0,
      value: questId,
      mode: 'receive_on_source',
      cite: citeEvent,
    },
    {
      kind: 'talk',
      textId: SAY_AREI_ESCORT_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_N_NEUTRAL_PASSIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(true, player, quest) npc_arei (${NPC_AREI}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP37 SummonCreature stomper (${NPC_IRONTREE_STOMPER}) + wanderers (${NPC_IRONTREE_WANDERER}) ` +
        `despawn ${AREI_SUMMON_DESPAWN_MS}ms coords ${AREI_STOMPER_SPAWN.x}/${AREI_WANDERER_SPAWN_1.x}/` +
        `${AREI_WANDERER_SPAWN_2.x} TEMPSPAWN=${TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN} - FO6 combat`,
      cite: citeWp37,
    },
    {
      kind: 'skip',
      reason:
        `Aggro Irontree/Toxic Horror lines (${SAY_ATTACK_IRONTREE}/${SAY_ATTACK_TOXIC_HORROR}) ` +
        `entry ${NPC_TOXIC_HORROR} - FO6 combat`,
      cite: citeAggro,
    },
    {
      kind: 'skip',
      reason: `JustSummoned stomper SAY_EXIT_WOODS (${SAY_EXIT_WOODS}) - FO6`,
      cite: citeExit,
    },
    {
      kind: 'skip',
      reason:
        `epilog dialogue SAY_CLEAR_PATH (${SAY_CLEAR_PATH}) → transform ${SPELL_AREI_TRANSFORM} ` +
        `+ SAY_LIFT_CURSE (${SAY_LIFT_CURSE}) - FO6 dialogue`,
      cite: citeDialogue,
    },
    {
      kind: 'skip',
      reason:
        `RewardPlayerAndGroupAtEventExplored(4261) + SAY_AREI_ESCORT_COMPLETE (${SAY_AREI_ESCORT_COMPLETE}) ` +
        `+ ForcedDespawn(${AREI_CREDIT_DESPAWN_MS}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_KAYNETH_STILLWIND (${NPC_KAYNETH_STILLWIND}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_captured_arkonarin — quest 5203 Rescue From Jaedenar: stand, temporary faction,
// open the cage and escort path 11016; WP85 carries the credit. Cite: felwood.cpp:300–306, :224–264.
function runArkonarinAccept(questId: number): DbScriptIntent[] {
  const citeEvent =
    `felwood.cpp:303 npc_captured_arkonarin (${NPC_CAPTURED_ARKONARIN}) ` +
    'SendAIEvent(AI_EVENT_START_ESCORT, player, creature, questId)';
  const citeStand =
    'felwood.cpp:228 SetStandState(UNIT_STAND_STATE_STAND) via ReceiveAIEvent ' +
    '(constructor felwood.cpp:192 kneel until escort)';
  const citeFaction =
    'felwood.cpp:229 SetFactionTemporary(FACTION_ESCORT_N_NEUTRAL_ACTIVE, ' +
    'TEMPFACTION_RESTORE_RESPAWN + TEMPFACTION_TOGGLE_IMMUNE_TO_NPC)';
  const citeEscort =
    `felwood.cpp:230 Start(false, player, quest, false, false, PATH_ID=${PATH_ID_ARKONARIN}) ` +
    `npc_captured_arkonarin (${NPC_CAPTURED_ARKONARIN}) - FO6 degraded finishEscort`;
  const citeCage =
    `felwood.cpp:232–233 GetClosestGameObjectWithEntry(GO_ARKONARIN_CAGE=${GO_ARKONARIN_CAGE}, 5.0f) Use - FO6`;
  const citeWp1 =
    `felwood.cpp:241–246 WP1 DoBroadcastText(SAY_ESCORT_START=${SAY_ESCORT_START}) + ` +
    `HandleEmote(EMOTE_ONESHOT_TALK=${EMOTE_ONESHOT_TALK}) - FO6 waypoint`;
  const citeCombat =
    `felwood.cpp:248–250 WP37 m_bCanAttack; SPELL_MORTAL_STRIKE=${SPELL_MORTAL_STRIKE} / ` +
    `SPELL_CLEAVE=${SPELL_CLEAVE}; Aggro aRandomAggro ${SAY_AGGRO_1}–${SAY_AGGRO_3}; ` +
    `NPC_JAEDENAR_LEGIONNAIRE=${NPC_JAEDENAR_LEGIONNAIRE} - FO6 combat`;
  const citeTrey =
    `felwood.cpp:251–253 WP83 SetEscortPaused; :218–221 NPC_SPIRT_TREY=${NPC_SPIRT_TREY} death unpauses - FO6`;
  const citeCredit =
    `felwood.cpp:254–262 WP85 RewardPlayerAndGroupAtEventExplored(5203) + ` +
    `SetFlag(UNIT_FLAG_IMMUNE_TO_NPC=${UNIT_FLAG_IMMUNE_TO_NPC}) + QuestEnd - FO6 finishEscort`;
  const citeEnder =
    `bake enderCreatureEntries NPC_JESSIR_MOONBOW=${NPC_JESSIR_MOONBOW} after WP85 explore credit`;
  return [
    {
      kind: 'send_ai_event',
      eventType: AI_EVENT_START_ESCORT,
      radius: 0,
      value: questId,
      mode: 'receive_on_source',
      cite: citeEvent,
    },
    {
      kind: 'stand_state',
      standState: UNIT_STAND_STATE_STAND,
      cite: citeStand,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_N_NEUTRAL_ACTIVE,
      flags: ARKONARIN_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, false, false, path=${PATH_ID_ARKONARIN}) ` +
        `npc_captured_arkonarin (${NPC_CAPTURED_ARKONARIN}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `open GO_ARKONARIN_CAGE (${GO_ARKONARIN_CAGE}) Use radius 5.0f - FO6`,
      cite: citeCage,
    },
    {
      kind: 'skip',
      reason:
        `WP1 SAY_ESCORT_START (${SAY_ESCORT_START}) + EMOTE_ONESHOT_TALK (${EMOTE_ONESHOT_TALK}) - FO6 waypoint`,
      cite: citeWp1,
    },
    {
      kind: 'skip',
      reason:
        `WP37 combat spells ${SPELL_MORTAL_STRIKE}/${SPELL_CLEAVE} + Jaedenar legionnaire ` +
        `(${NPC_JAEDENAR_LEGIONNAIRE}) - FO6 combat`,
      cite: citeCombat,
    },
    {
      kind: 'skip',
      reason:
        `WP83 pause until Spirit of Trey (${NPC_SPIRT_TREY}) dies - FO6 combat`,
      cite: citeTrey,
    },
    {
      kind: 'skip',
      reason:
        'WP85 RewardPlayerAndGroupAtEventExplored(5203) + UNIT_FLAG_IMMUNE_TO_NPC + QuestEnd - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_JESSIR_MOONBOW (${NPC_JESSIR_MOONBOW}) after WP85 explore credit`,
      cite: citeEnder,
    },
  ];
}

// ── frame residual (4506) ────────────────────────────────────────────────────

// The Corrupted Sabers residual — quest 4506: the kitten follows, the moonwell visual re-templates
// it, and gossiping it at Winna releases and credits. Cite: felwood.cpp:57–161.
function runCorruptSaberResidual(): DbScriptIntent[] {
  const citeSpawn =
    `felwood.cpp:61–70 npc_kitten (${NPC_KITTEN}) StartFollow + SetFollowPaused + ` +
    `DoScriptText(EMOTE_SAB_JUMP=${EMOTE_SAB_JUMP}) + UNIT_FLAG_SPAWNING=${UNIT_FLAG_SPAWNING}`;
  const citeTimer =
    `felwood.cpp:72,96–100 m_uiMoonwellCooldown=${MOONWELL_COOLDOWN_MS} then ` +
    `CastSpell(SPELL_CORRUPT_SABER_VISUAL=${SPELL_CORRUPT_SABER_VISUAL}, TRIGGERED_NONE) - FO6 timer`;
  const citeCast =
    `felwood.cpp:99 CastSpell(SPELL_CORRUPT_SABER_VISUAL=${SPELL_CORRUPT_SABER_VISUAL}, TRIGGERED_NONE=${TRIGGERED_NONE})`;
  const citeMorph =
    `felwood.cpp:124–129 CorruptedSaberVisual SetEntry/DisplayId NPC_CORRUPT_SABER=${NPC_CORRUPT_SABER} from kitten ${NPC_KITTEN}`;
  const citeFollow =
    `felwood.cpp:132–133 DoScriptText(EMOTE_SAB_FOLLOW=${EMOTE_SAB_FOLLOW}, owner) after morph`;
  const citeGossipFlag =
    `felwood.cpp:83–86 MoveInLineOfSight NPC_WINNA=${NPC_WINNA} within ` +
    `INTERACTION_DISTANCE=${INTERACTION_DISTANCE} → SetFlag(UNIT_NPC_FLAG_GOSSIP)`;
  const citeCredit =
    `felwood.cpp:149–158 GossipSelect SetFollowComplete + ` +
    'AreaExploredOrEventHappens(4506) - FO6 finishEscort';
  const citeItem =
    `bake srcItem ITEM_WINNA_KITTEN_CARRIER=${ITEM_WINNA_KITTEN_CARRIER} summons pet ${NPC_KITTEN}`;
  const citeTurnIn =
    `turn-in NPC_WINNA (${NPC_WINNA}) after gossip explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `npc_kitten (${NPC_KITTEN}) StartFollow paused + EMOTE_SAB_JUMP (${EMOTE_SAB_JUMP}) + ` +
        `UNIT_FLAG_SPAWNING - FO6 pet spawn`,
      cite: citeSpawn,
    },
    {
      kind: 'skip',
      reason:
        `m_uiMoonwellCooldown=${MOONWELL_COOLDOWN_MS}ms then corrupt visual - FO6 timer`,
      cite: citeTimer,
    },
    {
      kind: 'cast_spell',
      spellId: SPELL_CORRUPT_SABER_VISUAL,
      castFlags: TRIGGERED_NONE,
      sourceIsGo: false,
      targetCleared: false,
      cite: citeCast,
    },
    {
      kind: 'update_template',
      oldEntry: NPC_KITTEN,
      newTemplate: NPC_CORRUPT_SABER,
      changed: true,
      cite: citeMorph,
    },
    {
      kind: 'talk',
      textId: EMOTE_SAB_FOLLOW,
      stringTemplateId: 0,
      cite: citeFollow,
    },
    {
      kind: 'modify_npc_flags',
      flag: UNIT_NPC_FLAG_GOSSIP,
      changeFlag: NPC_FLAG_CHANGE_ADD,
      mode: 'add',
      resultFlags: UNIT_NPC_FLAG_GOSSIP,
      cite: citeGossipFlag,
    },
    {
      kind: 'skip',
      reason:
        `GossipSelect near Winna (${NPC_WINNA}) radius ${INTERACTION_DISTANCE}: ` +
        'AreaExploredOrEventHappens(4506) - FO6 finishEscort',
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `Winna's Kitten Carrier (${ITEM_WINNA_KITTEN_CARRIER}) → pet ${NPC_KITTEN}`,
      cite: citeItem,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_WINNA (${NPC_WINNA}) after explore credit`,
      cite: citeTurnIn,
    },
  ];
}

// Family pack: kalimdor/felwood.cpp Accept: 4261 Arei, 5203 Arkonarin; frame residual: 4506 corrupt saber.
export function runFelwood(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_ID_ANCIENT_SPIRIT) return runAreiAccept(questId);
    if (questId === QUEST_ID_RESCUE_JAEDENAR) return runArkonarinAccept(questId);
    return [];
  }
  if (phase === 'frame' || phase === 'complete') {
    if (questId === QUEST_CORRUPT_SABER) return runCorruptSaberResidual();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/felwood'` in registry.ts.
export const FELWOOD_REGISTRY: Record<string | number, FelwoodQuestScriptEntry> = {
  'kalimdor/felwood': {
    family: 'kalimdor/felwood',
    questIds: [QUEST_ID_ANCIENT_SPIRIT, QUEST_CORRUPT_SABER, QUEST_ID_RESCUE_JAEDENAR],
    hooks: ['accept', 'frame', 'complete'],
    cite: 'kalimdor/felwood.cpp:57–161,224–306,406–491',
    run: runFelwood,
  },
  [QUEST_ID_ANCIENT_SPIRIT]: {
    family: 'kalimdor/felwood',
    questId: QUEST_ID_ANCIENT_SPIRIT,
    questIds: [QUEST_ID_ANCIENT_SPIRIT],
    hooks: ['accept'],
    cite: 'felwood.cpp:485–491 QuestAccept_npc_arei; :406–457 escort/dialogue',
    run: runFelwood,
  },
  [QUEST_CORRUPT_SABER]: {
    family: 'kalimdor/felwood',
    questId: QUEST_CORRUPT_SABER,
    questIds: [QUEST_CORRUPT_SABER],
    hooks: ['frame', 'complete'],
    cite: 'felwood.cpp:57–161 npc_kitten / CorruptedSaberVisual / gossip residual',
    run: runFelwood,
  },
  [QUEST_ID_RESCUE_JAEDENAR]: {
    family: 'kalimdor/felwood',
    questId: QUEST_ID_RESCUE_JAEDENAR,
    questIds: [QUEST_ID_RESCUE_JAEDENAR],
    hooks: ['accept'],
    cite: 'felwood.cpp:300–306 QuestAccept_npc_captured_arkonarin; :224–264 escort',
    run: runFelwood,
  },
};
