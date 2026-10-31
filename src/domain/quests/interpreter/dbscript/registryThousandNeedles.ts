// QI4 — kalimdor/thousand_needles residuals, extracted for the 1500-line ratchet: accept hooks for
// 4966, 4904 and 4770, plus the Plucky Johnson gossip for 1950. Cite: kalimdor/thousand_needles.cpp.

import type { DbScriptIntent } from './types.ts';
import { NPC_FLAG_CHANGE_ADD, TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface ThousandNeedlesQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: thousand_needles.cpp:44 QUEST_PROTECT_KANATI = 4966 Escort Kanati; WP2 explore credit +
// RestoreOriginalFaction.
export const QUEST_PROTECT_KANATI = 4966;
/** Cite: thousand_needles.cpp:116 QUEST_FREE_AT_LAST = 4904 Escort Lakota; WP46 explore credit. */
export const QUEST_FREE_AT_LAST = 4904;
/** Cite: thousand_needles.cpp:210 QUEST_HOMEWARD = 4770 Escort Paoka; WP28 explore credit. */
export const QUEST_HOMEWARD = 4770;
// Cite: thousand_needles.cpp:283 QUEST_SCOOP = 1950 Plucky Johnson residual — emote/gossip
// AreaExploredOrEventHappens (not accept hook).
export const QUEST_SCOOP = 1950;

// Cite: bake starter/enderCreatureEntries quest 4966; PATH_ID_KANATI = 10638 thousand_needles.cpp:49
// PATH_ID_KANATI = 10638 (Kanati Greycloud).
const NPC_KANATI = 10638;
/** Cite: bake starterCreatureEntries quest 4904 Lakota Windsong. */
const NPC_LAKOTA = 10646;
/** Cite: bake enderCreatureEntries quest 4904 (Thalia Amberhide). */
const NPC_THALIA = 10645;
/** Cite: bake starterCreatureEntries quest 4770 Paoka Swiftmountain. */
const NPC_PAOKA = 10427;
/** Cite: bake enderCreatureEntries quest 4770 (Motega Firemane). */
const NPC_MOTEGA = 10428;
/** Cite: bake starter/enderCreatureEntries quest 1950 "Plucky" Johnson. */
const NPC_PLUCKY = 6548;

/** Cite: thousand_needles.cpp:45 NPC_GALAK_ASS = 10720 WP1 DoSpawnGalak ×3. */
const NPC_GALAK_ASS = 10720;
/** Cite: thousand_needles.cpp:117 NPC_GRIM_BANDIT = 10758 WP9/15/22 DoSpawnBandits ×2 each. */
const NPC_GRIM_BANDIT = 10758;
/** Cite: thousand_needles.cpp:211 NPC_WYVERN = 4107 WP16 DoSpawnWyvern ×3. */
const NPC_WYVERN = 4107;

/** Cite: thousand_needles.cpp:42 SAY_KAN_START = 6149 (DoBroadcastText) */
const SAY_KAN_START = 6149;
/** Cite: thousand_needles.cpp:110–114 Lakota script texts. */
const SAY_LAKO_START = -1000365;
const SAY_LAKO_LOOK_OUT = -1000366;
const SAY_LAKO_HERE_COME = -1000367;
const SAY_LAKO_MORE = -1000368;
const SAY_LAKO_END = -1000369;
/** Cite: thousand_needles.cpp:206–208 Paoka script texts. */
const SAY_START = -1000362;
const SAY_WYVERN = -1000363;
const SAY_COMPLETE = -1000364;

// Cite: thousand_needles.cpp:47 FACTION_KANATI_ESCORT = 232 Same id as FACTION_ESCORT_H_NEUTRAL_ACTIVE
// (ScriptDevAIMgr.h:49).
const FACTION_KANATI_ESCORT = 232;
// Cite: ScriptDevAIMgr.h:49 FACTION_ESCORT_H_NEUTRAL_ACTIVE = 232 Lakota / Paoka SetFactionTemporary on
// accept.
const FACTION_ESCORT_H_NEUTRAL_ACTIVE = 232;
// Cite: thousand_needles.cpp:282 FACTION_FRIENDLY = 35 Plucky temporary faction on beckon/chicken emote.
const FACTION_FRIENDLY = 35;

/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
// Cite: Creature.h:578 TEMPFACTION_RESTORE_COMBAT_STOP = 0x02 Plucky: TEMPFACTION_RESTORE_RESPAWN |
// TEMPFACTION_RESTORE_COMBAT_STOP = 0x03
const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;
// Cite: thousand_needles.cpp:315,325 TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP = 0x03
const PLUCKY_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_RESPAWN | TEMPFACTION_RESTORE_COMBAT_STOP;

/** Cite: Unit.h:477 UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200 Kanati WP1 RemoveFlag / WP2 SetFlag. */
const UNIT_FLAG_IMMUNE_TO_NPC = 0x00000200;

// Cite: Unit.h:510 UNIT_NPC_FLAG_GOSSIP = 0x00000001 Plucky SetFlag on emote; GossipHello when incomplete
// 1950.
const UNIT_NPC_FLAG_GOSSIP = 0x00000001;

/** Cite: thousand_needles.cpp:284–285 Plucky morph spells. */
const SPELL_PLUCKY_HUMAN = 9192;
const SPELL_PLUCKY_CHICKEN = 9220;

/** Cite: thousand_needles.cpp:49 PATH_ID_KANATI = 10638 escortAI->Start(..., PATH_ID_KANATI). */
const PATH_ID_KANATI = 10638;

/** Cite: Object.h:47 TEMPSPAWN_TIMED_OOC_DESPAWN = 5 Kanati WP1 Galak Assassin summons. */
const TEMPSPAWN_TIMED_OOC_DESPAWN = 5;
/** Cite: thousand_needles.cpp:82 Galak TEMPSPAWN_TIMED_OOC_DESPAWN 25000 */
const GALAK_DESPAWN_MS = 25000;
// Cite: thousand_needles.cpp:173 bandit TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN 60000 opcodes.ts
// TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN = 8
const BANDIT_DESPAWN_MS = 60000;
/** Cite: thousand_needles.cpp:254 wyvern TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN 60000 */
const WYVERN_DESPAWN_MS = 60000;
/** Cite: thousand_needles.cpp:301 m_uiResetTimer = 120000 (Plucky human form). */
const PLUCKY_RESET_TIMER_MS = 120000;

/** Cite: thousand_needles.cpp:52 m_afGalakLoc DoSpawnGalak SummonCreature ×3 same position. */
const GALAK_LOC = {
  x: -4867.387695,
  y: -1357.35376,
  z: -48.226,
  o: 0,
} as const;
// Cite: thousand_needles.cpp:124–132 m_afBanditLoc[6] Ambush pairs at indices 0–1 / 2–3 / 4–5
// (ID_AMBUSH_1/2/3 = 0/2/4).
const BANDIT_LOC = [
  { x: -4905.479492, y: -2062.732666, z: 84.352 },
  { x: -4915.201172, y: -2073.52832, z: 84.733 },
  { x: -4878.883301, y: -1986.947876, z: 91.966 },
  { x: -4877.503906, y: -1966.113403, z: 91.859 },
  { x: -4767.985352, y: -1873.169189, z: 90.192 },
  { x: -4788.861328, y: -1888.007813, z: 89.888 },
] as const;
/** Cite: thousand_needles.cpp:214–219 m_afWyvernLoc[3] */
const WYVERN_LOC = [
  { x: -4990.606, y: -906.057, z: -5.343 },
  { x: -4970.241, y: -927.378, z: -4.951 },
  { x: -4985.364, y: -952.528, z: -5.199 },
] as const;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_kanati — quest 4966 Protect Kanati Greycloud: escort the path, with WP1 spawning
// three Galak and WP2 carrying the explore credit. Cite: thousand_needles.cpp:91–102, :60–77.
function runKanatiAccept(): DbScriptIntent[] {
  const citeFaction =
    `thousand_needles.cpp:97 SetFactionTemporary(FACTION_KANATI_ESCORT=` +
    `${FACTION_KANATI_ESCORT}, TEMPFACTION_RESTORE_RESPAWN=${TEMPFACTION_RESTORE_RESPAWN})`;
  const citeEscort =
    `thousand_needles.cpp:98 npc_kanati (${NPC_KANATI}) ` +
    `npc_escortAI::Start(false, player, quest, true, false, PATH_ID_KANATI=${PATH_ID_KANATI}) ` +
    '- FO6 degraded finishEscort';
  const citeWp1 =
    `thousand_needles.cpp:64–68 WP1 RemoveFlag(UNIT_FLAG_IMMUNE_TO_NPC=` +
    `${UNIT_FLAG_IMMUNE_TO_NPC}) + DoBroadcastText(SAY_KAN_START=${SAY_KAN_START}) + ` +
    `DoSpawnGalak 3× NPC_GALAK_ASS=${NPC_GALAK_ASS} @ ${GALAK_LOC.x} ` +
    `TEMPSPAWN_TIMED_OOC_DESPAWN=${TEMPSPAWN_TIMED_OOC_DESPAWN} ${GALAK_DESPAWN_MS}ms - FO6`;
  const citeWp2 =
    `thousand_needles.cpp:69–75 WP2 SetFlag IMMUNE_TO_NPC + ` +
    'RewardPlayerAndGroupAtEventExplored(4966) + RestoreOriginalFaction - FO6 finishEscort';
  const citeSummoned =
    `thousand_needles.cpp:85–88 JustSummoned AttackStart(m_creature) for ` +
    `NPC_GALAK_ASS=${NPC_GALAK_ASS} - FO6 combat`;
  const citeEnder =
    `bake enderCreatureEntries NPC_KANATI=${NPC_KANATI} after WP2 explore credit`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_KANATI_ESCORT,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, true, false, PATH_ID_KANATI=${PATH_ID_KANATI}) ` +
        `npc_kanati (${NPC_KANATI}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP1 RemoveFlag IMMUNE_TO_NPC + SAY_KAN_START (${SAY_KAN_START}) + ` +
        `3× NPC_GALAK_ASS (${NPC_GALAK_ASS}) TEMPSPAWN_TIMED_OOC_DESPAWN ` +
        `(${TEMPSPAWN_TIMED_OOC_DESPAWN}) ${GALAK_DESPAWN_MS}ms - FO6`,
      cite: citeWp1,
    },
    {
      kind: 'skip',
      reason:
        `WP2 SetFlag IMMUNE_TO_NPC + RewardPlayerAndGroupAtEventExplored(4966) + ` +
        'RestoreOriginalFaction - FO6 finishEscort',
      cite: citeWp2,
    },
    {
      kind: 'skip',
      reason:
        `JustSummoned AttackStart Galak Assassin (${NPC_GALAK_ASS}) - FO6 combat`,
      cite: citeSummoned,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_KANATI (${NPC_KANATI}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_lakota_windsong — quest 4904 Free at Last: the start line, temporary faction and
// an escort with three bandit ambushes; WP46 credits. Cite: thousand_needles.cpp:187–198, :144–174.
function runLakotaAccept(): DbScriptIntent[] {
  const citeTalk =
    `thousand_needles.cpp:191 npc_lakota_windsong (${NPC_LAKOTA}) ` +
    `DoScriptText(SAY_LAKO_START=${SAY_LAKO_START})`;
  const citeFaction =
    `thousand_needles.cpp:192 SetFactionTemporary(FACTION_ESCORT_H_NEUTRAL_ACTIVE=` +
    `${FACTION_ESCORT_H_NEUTRAL_ACTIVE}, TEMPFACTION_RESTORE_RESPAWN=${TEMPFACTION_RESTORE_RESPAWN})`;
  const citeEscort =
    `thousand_needles.cpp:194–195 npc_lakota_windsong (${NPC_LAKOTA}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeWp9 =
    `thousand_needles.cpp:148–151 WP9 DoScriptText(SAY_LAKO_LOOK_OUT=${SAY_LAKO_LOOK_OUT}) + ` +
    `2× NPC_GRIM_BANDIT=${NPC_GRIM_BANDIT} @ ${BANDIT_LOC[0].x}/${BANDIT_LOC[1].x} ` +
    `TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN=${TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN} ` +
    `${BANDIT_DESPAWN_MS}ms - FO6`;
  const citeWp15 =
    `thousand_needles.cpp:152–155 WP15 DoScriptText(SAY_LAKO_HERE_COME=${SAY_LAKO_HERE_COME}) + ` +
    `2× NPC_GRIM_BANDIT @ ${BANDIT_LOC[2].x}/${BANDIT_LOC[3].x} - FO6`;
  const citeWp22 =
    `thousand_needles.cpp:156–159 WP22 DoScriptText(SAY_LAKO_MORE=${SAY_LAKO_MORE}) + ` +
    `2× NPC_GRIM_BANDIT @ ${BANDIT_LOC[4].x}/${BANDIT_LOC[5].x} - FO6`;
  const citeWp46 =
    `thousand_needles.cpp:160–164 WP46 DoScriptText(SAY_LAKO_END=${SAY_LAKO_END}) + ` +
    'RewardPlayerAndGroupAtEventExplored(4904) - FO6 finishEscort';
  const citeSummoned =
    `thousand_needles.cpp:176–179 JustSummoned AttackStart for ` +
    `NPC_GRIM_BANDIT=${NPC_GRIM_BANDIT} - FO6 combat`;
  const citeEnder =
    `bake enderCreatureEntries NPC_THALIA=${NPC_THALIA} after WP46 explore credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_LAKO_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_H_NEUTRAL_ACTIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_lakota_windsong (${NPC_LAKOTA}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP9 SAY_LAKO_LOOK_OUT (${SAY_LAKO_LOOK_OUT}) + 2× NPC_GRIM_BANDIT (${NPC_GRIM_BANDIT}) ` +
        `TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN (${TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN}) ` +
        `${BANDIT_DESPAWN_MS}ms - FO6`,
      cite: citeWp9,
    },
    {
      kind: 'skip',
      reason:
        `WP15 SAY_LAKO_HERE_COME (${SAY_LAKO_HERE_COME}) + 2× NPC_GRIM_BANDIT (${NPC_GRIM_BANDIT}) - FO6`,
      cite: citeWp15,
    },
    {
      kind: 'skip',
      reason:
        `WP22 SAY_LAKO_MORE (${SAY_LAKO_MORE}) + 2× NPC_GRIM_BANDIT (${NPC_GRIM_BANDIT}) - FO6`,
      cite: citeWp22,
    },
    {
      kind: 'skip',
      reason:
        `WP46 SAY_LAKO_END (${SAY_LAKO_END}) + RewardPlayerAndGroupAtEventExplored(4904) - FO6 finishEscort`,
      cite: citeWp46,
    },
    {
      kind: 'skip',
      reason:
        `JustSummoned AttackStart Grimtotem Bandit (${NPC_GRIM_BANDIT}) - FO6 combat`,
      cite: citeSummoned,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_THALIA (${NPC_THALIA}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// QuestAccept_npc_paoka_swiftmountain — quest 4770 Homeward Bound: the start line, temporary
// faction and an escort; WP16 is the wyvern ambush and WP28 the credit. Cite: :263–274, :231–247.
function runPaokaAccept(): DbScriptIntent[] {
  const citeTalk =
    `thousand_needles.cpp:267 npc_paoka_swiftmountain (${NPC_PAOKA}) ` +
    `DoScriptText(SAY_START=${SAY_START})`;
  const citeFaction =
    `thousand_needles.cpp:268 SetFactionTemporary(FACTION_ESCORT_H_NEUTRAL_ACTIVE=` +
    `${FACTION_ESCORT_H_NEUTRAL_ACTIVE}, TEMPFACTION_RESTORE_RESPAWN=${TEMPFACTION_RESTORE_RESPAWN})`;
  const citeEscort =
    `thousand_needles.cpp:270–271 npc_paoka_swiftmountain (${NPC_PAOKA}) ` +
    'npc_escortAI::Start(false, player, quest) - FO6 degraded finishEscort';
  const citeWp16 =
    `thousand_needles.cpp:235–238 WP16 DoScriptText(SAY_WYVERN=${SAY_WYVERN}) + ` +
    `3× NPC_WYVERN=${NPC_WYVERN} @ ${WYVERN_LOC[0].x}/${WYVERN_LOC[1].x}/${WYVERN_LOC[2].x} ` +
    `TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN=${TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN} ` +
    `${WYVERN_DESPAWN_MS}ms - FO6`;
  const citeWp27 =
    `thousand_needles.cpp:239–241 WP27 DoScriptText(SAY_COMPLETE=${SAY_COMPLETE}) - FO6`;
  const citeWp28 =
    `thousand_needles.cpp:242–245 WP28 RewardPlayerAndGroupAtEventExplored(4770) - FO6 finishEscort`;
  const citeEnder =
    `bake enderCreatureEntries NPC_MOTEGA=${NPC_MOTEGA} after WP28 explore credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_H_NEUTRAL_ACTIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest) npc_paoka_swiftmountain (${NPC_PAOKA}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP16 SAY_WYVERN (${SAY_WYVERN}) + 3× NPC_WYVERN (${NPC_WYVERN}) ` +
        `TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN (${TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN}) ` +
        `${WYVERN_DESPAWN_MS}ms - FO6`,
      cite: citeWp16,
    },
    {
      kind: 'skip',
      reason: `WP27 SAY_COMPLETE (${SAY_COMPLETE}) - FO6`,
      cite: citeWp27,
    },
    {
      kind: 'skip',
      reason:
        `WP28 RewardPlayerAndGroupAtEventExplored(4770) - FO6 finishEscort`,
      cite: citeWp28,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_MOTEGA (${NPC_MOTEGA}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// npc_plucky_johnson residual — quest 1950 Get the Scoop: a beckon or chicken emote turns him
// friendly and human, and the gossip phrase then credits it. Cite: thousand_needles.cpp:309–378.
function runPluckyFrame(): DbScriptIntent[] {
  const priorFlags = 0;
  const afterGossip = priorFlags | UNIT_NPC_FLAG_GOSSIP;
  const citeEmote =
    `thousand_needles.cpp:309–329 ReceiveEmote BECKON (quest incomplete) / CHICKEN: ` +
    `SetFactionTemporary(FACTION_FRIENDLY=${FACTION_FRIENDLY}, ` +
    `TEMPFACTION_RESTORE_RESPAWN|RESTORE_COMBAT_STOP=${PLUCKY_TEMP_FACTION_FLAGS}) + ` +
    `SetFlag(UNIT_NPC_FLAG_GOSSIP) + CastSpell(SPELL_PLUCKY_HUMAN=${SPELL_PLUCKY_HUMAN})`;
  const citeCast =
    `thousand_needles.cpp:317,327 CastSpell(SPELL_PLUCKY_HUMAN=${SPELL_PLUCKY_HUMAN})`;
  const citeGossip =
    `thousand_needles.cpp:360–378 GossipHello/Select incomplete ${QUEST_SCOOP}: ` +
    'AreaExploredOrEventHappens(1950) - FO6 finishEscort';
  const citeReset =
    `thousand_needles.cpp:299–307 Reset CastSpell(SPELL_PLUCKY_CHICKEN=${SPELL_PLUCKY_CHICKEN}) ` +
    `timer ${PLUCKY_RESET_TIMER_MS}ms - FO6`;
  const citeEnder =
    `bake starter/enderCreatureEntries NPC_PLUCKY=${NPC_PLUCKY}; next 1951 after explore credit`;
  return [
    {
      kind: 'set_faction',
      factionId: FACTION_FRIENDLY,
      flags: PLUCKY_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeEmote,
    },
    {
      kind: 'modify_npc_flags',
      flag: UNIT_NPC_FLAG_GOSSIP,
      changeFlag: NPC_FLAG_CHANGE_ADD,
      mode: 'add',
      resultFlags: afterGossip,
      cite: citeEmote,
    },
    {
      kind: 'cast_spell',
      spellId: SPELL_PLUCKY_HUMAN,
      castFlags: 0,
      sourceIsGo: false,
      targetCleared: false,
      cite: citeCast,
    },
    {
      kind: 'skip',
      reason:
        `GossipSelect AreaExploredOrEventHappens(1950) Plucky (${NPC_PLUCKY}) - FO6 finishEscort`,
      cite: citeGossip,
    },
    {
      kind: 'skip',
      reason:
        `Reset SPELL_PLUCKY_CHICKEN (${SPELL_PLUCKY_CHICKEN}) timer ${PLUCKY_RESET_TIMER_MS}ms - FO6`,
      cite: citeReset,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_PLUCKY (${NPC_PLUCKY}) after explore credit → next 1951`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/thousand_needles.cpp. Accept hooks for 4966, 4904 and 4770, plus the
// Plucky gossip-and-emote residual for 1950.
export function runThousandNeedles(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_PROTECT_KANATI) return runKanatiAccept();
    if (questId === QUEST_FREE_AT_LAST) return runLakotaAccept();
    if (questId === QUEST_HOMEWARD) return runPaokaAccept();
    return [];
  }
  if (phase === 'frame' || phase === 'complete') {
    if (questId === QUEST_SCOOP) return runPluckyFrame();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/thousand_needles'` in registry.ts.
export const THOUSAND_NEEDLES_REGISTRY: Record<
  string | number,
  ThousandNeedlesQuestScriptEntry
> = {
  'kalimdor/thousand_needles': {
    family: 'kalimdor/thousand_needles',
    questIds: [
      QUEST_PROTECT_KANATI,
      QUEST_FREE_AT_LAST,
      QUEST_HOMEWARD,
      QUEST_SCOOP,
    ],
    hooks: ['accept', 'frame'],
    cite:
      'kalimdor/thousand_needles.cpp:91–102,187–198,263–274,309–378,60–88,144–179,231–255',
    run: runThousandNeedles,
  },
  [QUEST_PROTECT_KANATI]: {
    family: 'kalimdor/thousand_needles',
    questId: QUEST_PROTECT_KANATI,
    questIds: [QUEST_PROTECT_KANATI],
    hooks: ['accept'],
    cite: 'thousand_needles.cpp:91–102 QuestAccept_npc_kanati',
    run: runThousandNeedles,
  },
  [QUEST_FREE_AT_LAST]: {
    family: 'kalimdor/thousand_needles',
    questId: QUEST_FREE_AT_LAST,
    questIds: [QUEST_FREE_AT_LAST],
    hooks: ['accept'],
    cite: 'thousand_needles.cpp:187–198 QuestAccept_npc_lakota_windsong',
    run: runThousandNeedles,
  },
  [QUEST_HOMEWARD]: {
    family: 'kalimdor/thousand_needles',
    questId: QUEST_HOMEWARD,
    questIds: [QUEST_HOMEWARD],
    hooks: ['accept'],
    cite: 'thousand_needles.cpp:263–274 QuestAccept_npc_paoka_swiftmountain',
    run: runThousandNeedles,
  },
  [QUEST_SCOOP]: {
    family: 'kalimdor/thousand_needles',
    questId: QUEST_SCOOP,
    questIds: [QUEST_SCOOP],
    hooks: ['frame'],
    cite: 'thousand_needles.cpp:309–378 npc_plucky_johnson residual (emote/gossip)',
    run: runThousandNeedles,
  },
};
