// QI4 — kalimdor/winterspring residual, extracted for the 1500-line ratchet: the accept hook for
// quest 4901, whose torch and altar event continues through GOUse. Cite: kalimdor/winterspring.cpp.

import type { DbScriptIntent } from './types.ts';
import { UNIT_STAND_STATE_KNEEL } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface WinterspringQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

/** Cite: winterspring.cpp:97 QUEST_GUARDIANS_ALTAR = 4901 Escort Ranshalla; dialogue end explore credit. */
export const QUEST_GUARDIANS_ALTAR = 4901;

/** Cite: winterspring.cpp:81 NPC_RANSHALLA = 10300 Bake starterCreatureEntries quest 4901. */
const NPC_RANSHALLA = 10300;
// Cite: bake enderCreatureEntries quest 4901 — Erelas Ambersky (7916) in Rut'theran Village (teldrassil).
const NPC_ERELAS_AMBERSKY = 7916;
/** Cite: winterspring.cpp:82 NPC_PRIESTESS_ELUNE = 12116 Summoned at altar WP42. */
const NPC_PRIESTESS_ELUNE = 12116;
/** Cite: winterspring.cpp:83 NPC_VOICE_ELUNE = 12152 */
const NPC_VOICE_ELUNE = 12152;
/** Cite: winterspring.cpp:84 NPC_GUARDIAN_ELUNE = 12140 */
const NPC_GUARDIAN_ELUNE = 12140;

/** Cite: winterspring.cpp:91–95 altar event gameobjects. */
const GO_ELUNE_ALTAR = 177404;
const GO_ELUNE_FIRE = 177417;
const GO_ELUNE_GEM = 177414;
const GO_ELUNE_LIGHT = 177415;
const GO_ELUNE_AURA = 177416;

/** Cite: winterspring.cpp:40 SAY_QUEST_START = -1000739 */
const SAY_QUEST_START = -1000739;
/** Cite: winterspring.cpp:41 SAY_ENTER_OWL_THICKET = -1000707 */
const SAY_ENTER_OWL_THICKET = -1000707;
/** Cite: winterspring.cpp:42–46 torch reach / after texts. */
const SAY_REACH_TORCH_1 = -1000708;
const SAY_REACH_TORCH_2 = -1000709;
const SAY_REACH_TORCH_3 = -1000710;
const SAY_AFTER_TORCH_1 = -1000711;
const SAY_AFTER_TORCH_2 = -1000712;
/** Cite: winterspring.cpp:47–48 reach altar. */
const SAY_REACH_ALTAR_1 = -1000713;
const SAY_REACH_ALTAR_2 = -1000714;
/** Cite: winterspring.cpp:72–73 quest end texts. */
const SAY_QUEST_END_1 = -1000736;
const SAY_QUEST_END_2 = -1000737;
/** Cite: winterspring.cpp:75 EMOTE_CHANT_SPELL = -1000738 */
const EMOTE_CHANT_SPELL = -1000738;

// Cite: winterspring.cpp:77 SPELL_LIGHT_TORCH = 18953 Channeled while waiting for torch / altar interact.
const SPELL_LIGHT_TORCH = 18953;
// Cite: winterspring.cpp:78 SPELL_RANSHALLA_DESPAWN = 18954 SpellHit fails quest + ForcedDespawn if channel
// times out.
const SPELL_RANSHALLA_DESPAWN = 18954;
/** Cite: winterspring.cpp:79 SPELL_BIND_WILDKIN = 18994 Guardian casts during altar cinematic. */
const SPELL_BIND_WILDKIN = 18994;

// Cite: ScriptDevAIMgr.h:44 FACTION_ESCORT_A_NEUTRAL_PASSIVE = 10 Ranshalla SetFactionTemporary on accept.
const FACTION_ESCORT_A_NEUTRAL_PASSIVE = 10;

// Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 winterspring.cpp:460 uses RESTORE_RESPAWN only
// (no TOGGLE_IMMUNE).
const TEMPFACTION_RESTORE_RESPAWN = 0x01;

// Cite: Unit.h:101 UNIT_STAND_STATE_KNEEL (opcodes.ts re-export) SAY_QUEST_END_2 kneels before explore
// credit.
const UNIT_STAND_STATE_KNEEL_WS = UNIT_STAND_STATE_KNEEL;

// Cite: winterspring.cpp:405 ForcedDespawn(1 * MINUTE * IN_MILLISECONDS) SharedDefines MINUTE=60,
// IN_MILLISECONDS=1000 → 60000.
const RANSHALLA_DESPAWN_MS = 60000;

/** Cite: winterspring.cpp:183 m_uiDelayTimer = 2000 after torch/altar continue */
const TORCH_CONTINUE_DELAY_MS = 2000;

/** Cite: winterspring.cpp:351 TEMPSPAWN_TIMED_DESPAWN Voice of Elune 30000 */
const VOICE_ELUNE_DESPAWN_MS = 30000;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_ranshalla — quest 4901 Guardians of the Altar: say the start line, take a passive
// faction and escort; five torches then the altar cinematic credit. Cite: winterspring.cpp:455–469.
function runRanshallaAccept(): DbScriptIntent[] {
  const citeTalk =
    `winterspring.cpp:459 npc_ranshalla (${NPC_RANSHALLA}) ` +
    `DoScriptText(SAY_QUEST_START=${SAY_QUEST_START})`;
  const citeFaction =
    'winterspring.cpp:460 SetFactionTemporary(FACTION_ESCORT_A_NEUTRAL_PASSIVE=' +
    `${FACTION_ESCORT_A_NEUTRAL_PASSIVE}, TEMPFACTION_RESTORE_RESPAWN=` +
    `${TEMPFACTION_RESTORE_RESPAWN})`;
  const citeEscort =
    `winterspring.cpp:462–463 npc_ranshalla (${NPC_RANSHALLA}) ` +
    'npc_escortAI::Start(false, player, quest, true) - FO6 degraded finishEscort';
  const citeWpTorch =
    `winterspring.cpp:257–267 WP3 SAY_ENTER_OWL_THICKET=${SAY_ENTER_OWL_THICKET}; ` +
    `WP10/15/20/25/36 DoChannelTorchSpell GO_ELUNE_FIRE=${GO_ELUNE_FIRE} ` +
    `SAY_REACH_TORCH_1..3=${SAY_REACH_TORCH_1}–${SAY_REACH_TORCH_3} ` +
    `EMOTE_CHANT_SPELL=${EMOTE_CHANT_SPELL} SPELL_LIGHT_TORCH=${SPELL_LIGHT_TORCH} - FO6`;
  const citeContinue =
    `winterspring.cpp:471–486 GOUse_go_elune_fire + :169–184 DoContinueEscort: ` +
    `SAY_AFTER_TORCH_1/2=${SAY_AFTER_TORCH_1}/${SAY_AFTER_TORCH_2} or altar; ` +
    `delay ${TORCH_CONTINUE_DELAY_MS}ms resume - FO6`;
  const citeFail =
    `winterspring.cpp:186–194 SpellHit SPELL_RANSHALLA_DESPAWN=${SPELL_RANSHALLA_DESPAWN} ` +
    'FailQuestForPlayerAndGroup + ForcedDespawn - FO6 timeout';
  const citeAltar =
    `winterspring.cpp:268–302 WP39 SAY_REACH_ALTAR_1/2=${SAY_REACH_ALTAR_1}/` +
    `${SAY_REACH_ALTAR_2}; WP41 GO_ELUNE_LIGHT=${GO_ELUNE_LIGHT} respawn; ` +
    `WP42 DoSummonPriestess 2× NPC_PRIESTESS_ELUNE=${NPC_PRIESTESS_ELUNE}; ` +
    `WP44 pause face GO_ELUNE_ALTAR=${GO_ELUNE_ALTAR} - FO6`;
  const citeCinematic =
    `winterspring.cpp:306–407 altar dialogue: GO_ELUNE_GEM=${GO_ELUNE_GEM} ` +
    `GO_ELUNE_AURA=${GO_ELUNE_AURA}; NPC_GUARDIAN_ELUNE=${NPC_GUARDIAN_ELUNE} ` +
    `SPELL_BIND_WILDKIN=${SPELL_BIND_WILDKIN}; NPC_VOICE_ELUNE=${NPC_VOICE_ELUNE} ` +
    `TEMPSPAWN ${VOICE_ELUNE_DESPAWN_MS}ms - FO6`;
  const citeCredit =
    `winterspring.cpp:390–405 DATA_EVENT_END SAY_QUEST_END_1=${SAY_QUEST_END_1}; ` +
    `SAY_QUEST_END_2=${SAY_QUEST_END_2} SetStandState(KNEEL=${UNIT_STAND_STATE_KNEEL_WS}) + ` +
    `RewardPlayerAndGroupAtEventExplored(4901) + ForcedDespawn(${RANSHALLA_DESPAWN_MS}ms) - FO6 finishEscort`;
  const citeEnder =
    `bake enderCreatureEntries NPC_ERELAS_AMBERSKY=${NPC_ERELAS_AMBERSKY} after explore credit`;
  return [
    {
      kind: 'talk',
      textId: SAY_QUEST_START,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ESCORT_A_NEUTRAL_PASSIVE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `escort Start(false, player, quest, true) npc_ranshalla (${NPC_RANSHALLA}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP3 SAY_ENTER_OWL_THICKET (${SAY_ENTER_OWL_THICKET}) + WP10/15/20/25/36 torch ` +
        `GO_ELUNE_FIRE (${GO_ELUNE_FIRE}) SPELL_LIGHT_TORCH=${SPELL_LIGHT_TORCH} ` +
        `SAY_REACH_TORCH (${SAY_REACH_TORCH_1}–${SAY_REACH_TORCH_3}) EMOTE_CHANT (${EMOTE_CHANT_SPELL}) - FO6`,
      cite: citeWpTorch,
    },
    {
      kind: 'skip',
      reason:
        `GOUse_go_elune_fire DoContinueEscort SAY_AFTER_TORCH (${SAY_AFTER_TORCH_1}/` +
        `${SAY_AFTER_TORCH_2}) delay ${TORCH_CONTINUE_DELAY_MS}ms - FO6`,
      cite: citeContinue,
    },
    {
      kind: 'skip',
      reason:
        `SpellHit SPELL_RANSHALLA_DESPAWN=${SPELL_RANSHALLA_DESPAWN} fail quest + despawn - FO6`,
      cite: citeFail,
    },
    {
      kind: 'skip',
      reason:
        `WP39–44 altar GO_ELUNE_ALTAR (${GO_ELUNE_ALTAR}) + 2× priestess (${NPC_PRIESTESS_ELUNE}) ` +
        `GO_ELUNE_LIGHT (${GO_ELUNE_LIGHT}) - FO6`,
      cite: citeAltar,
    },
    {
      kind: 'skip',
      reason:
        `altar cinematic guardian (${NPC_GUARDIAN_ELUNE}) voice (${NPC_VOICE_ELUNE}) ` +
        `gem/aura (${GO_ELUNE_GEM}/${GO_ELUNE_AURA}) SPELL_BIND_WILDKIN=${SPELL_BIND_WILDKIN} - FO6`,
      cite: citeCinematic,
    },
    {
      kind: 'skip',
      reason:
        `SAY_QUEST_END_1/2 (${SAY_QUEST_END_1}/${SAY_QUEST_END_2}) kneel + ` +
        `RewardPlayerAndGroupAtEventExplored(4901) despawn ${RANSHALLA_DESPAWN_MS}ms - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_ERELAS_AMBERSKY (${NPC_ERELAS_AMBERSKY}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/winterspring.cpp Hooks: pQuestAcceptNPC ranshalla (4901). Residuals documented on
// accept chain: torch/altar escort + explore credit.
export function runWinterspring(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_GUARDIANS_ALTAR) return runRanshallaAccept();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/winterspring'` in registry.ts.
export const WINTERSPRING_REGISTRY: Record<string | number, WinterspringQuestScriptEntry> = {
  'kalimdor/winterspring': {
    family: 'kalimdor/winterspring',
    questIds: [QUEST_GUARDIANS_ALTAR],
    hooks: ['accept'],
    cite: 'kalimdor/winterspring.cpp:455–469,253–407,169–194,471–486',
    run: runWinterspring,
  },
  [QUEST_GUARDIANS_ALTAR]: {
    family: 'kalimdor/winterspring',
    questId: QUEST_GUARDIANS_ALTAR,
    questIds: [QUEST_GUARDIANS_ALTAR],
    hooks: ['accept'],
    cite: 'winterspring.cpp:455–469 QuestAccept_npc_ranshalla',
    run: runWinterspring,
  },
};
