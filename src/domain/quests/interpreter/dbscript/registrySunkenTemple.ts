// QI4 — sunken_templeScripts residual, extracted for the 1500-line ratchet: the Shade of Eranikus
// areatrigger, gated on quest 8555 being rewarded. Cite: sunken_temple/sunken_templeScripts.cpp.

import type { DbScriptIntent } from './types.ts';
import { TEMPSPAWN_DEAD_DESPAWN } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: sunken_templeScripts.cpp:40 QUEST_THE_CHARGE_OF_DRAGONFLIGHTS = 8555 — the pre-quest gate
// for the Shade of Eranikus trigger. The bake has Anachronos 15192 on both ends, prevQuest 8519.
export const QUEST_THE_CHARGE_OF_DRAGONFLIGHTS = 8555;
// Cite: sunken_templeScripts.cpp:41 QUEST_ERANIKUS_TYRANT_OF_DREAMS = 8733, accepted from Malfurion
// after the summon. Not in the Phonecraft bake — kept for whole-chain mapping only.
const QUEST_ERANIKUS_TYRANT_OF_DREAMS = 8733;
// Cite: sunken_temple.h:17 TYPE_MALFURION = 3 Instance encounter slot set IN_PROGRESS when Malfurion is
// summoned.
const TYPE_MALFURION = 3;
// Cite: sc_instance.h:15 IN_PROGRESS = 1 EncounterState written by SetData(TYPE_MALFURION, IN_PROGRESS).
const ENCOUNTER_IN_PROGRESS = 1;
// Cite: sunken_temple.h:42 NPC_MALFURION = 15362 Summoned by AreaTrigger_at_shade_of_eranikus when 8555 is
// rewarded.
const NPC_MALFURION = 15362;
// Cite: sunken_temple.h:99–104 aSunkenTempleLocation[2] Malfurion summon loc { -660.5277f, -16.7117f,
// -90.8357f, 1.6055f }
const MALFURION_SPAWN = {
  x: -660.5277,
  y: -16.7117,
  z: -90.8357,
  o: 1.6055,
} as const;
// Cite: sunken_templeScripts.cpp:55 — SummonCreature(NPC_MALFURION, …, TEMPSPAWN_DEAD_DESPAWN, 0),
// which opcodes.ts spells TEMPSPAWN_DEAD_DESPAWN = 1 (Object.h:44).
const MALFURION_SPAWN_TYPE = TEMPSPAWN_DEAD_DESPAWN;
// Cite: sunken_temple.h:76 SPELL_SPIRIT_SPAWN_IN = 17321 npc_malfurionAI ctor DoCastSpellIfCan on spawn.
const SPELL_SPIRIT_SPAWN_IN = 17321;
/** Cite: sunken_templeScripts.cpp:69 EMOTE_MALFURION1 = -1109000 DoScriptText on dungeon spawn (ctor). */
const EMOTE_MALFURION1 = -1109000;
// Cite: sunken_templeScripts.cpp:70–73 SAY_MALFURION1–4 Speech sequence before SetFlag QUESTGIVER (UpdateAI
// cases 1–4).
const SAY_MALFURION1 = -1109001;
const SAY_MALFURION2 = -1109002;
const SAY_MALFURION3 = -1109003;
const SAY_MALFURION4 = -1109004;
// Cite: Unit.h:511 UNIT_NPC_FLAG_QUESTGIVER = 0x00000002 Ctor removes QUESTGIVER; speech case 5 restores it
// so 8733 can be accepted.
const UNIT_NPC_FLAG_QUESTGIVER = 0x00000002;

// AreaTrigger_at_shade_of_eranikus — with 8555 rewarded, 8733 not, and TYPE_MALFURION idle, summon
// Malfurion and mark it IN_PROGRESS; his speech then flags him a questgiver. Cite: :44–61, :78–143.
function runShadeOfEranikusAt(): DbScriptIntent[] {
  const citeAt =
    'sunken_templeScripts.cpp:44–61 AreaTrigger_at_shade_of_eranikus ' +
    `GetQuestRewardStatus(${QUEST_THE_CHARGE_OF_DRAGONFLIGHTS}) gate`;
  const citeSpawn =
    `sunken_templeScripts.cpp:55 SummonCreature(NPC_MALFURION=${NPC_MALFURION}, ` +
    `aSunkenTempleLocation[2]=(${MALFURION_SPAWN.x},${MALFURION_SPAWN.y},${MALFURION_SPAWN.z},${MALFURION_SPAWN.o}), ` +
    `TEMPSPAWN_DEAD_DESPAWN, 0)`;
  const citeSet =
    `sunken_templeScripts.cpp:56 SetData(TYPE_MALFURION=${TYPE_MALFURION}, IN_PROGRESS=${ENCOUNTER_IN_PROGRESS})`;
  const citeCtor =
    `sunken_templeScripts.cpp:86–92 npc_malfurionAI ctor: DoScriptText(EMOTE_MALFURION1=${EMOTE_MALFURION1}) ` +
    `+ DoCastSpellIfCan(SPELL_SPIRIT_SPAWN_IN=${SPELL_SPIRIT_SPAWN_IN}) + RemoveFlag(QUESTGIVER)`;
  const citeSpeech =
    `sunken_templeScripts.cpp:98–143 UpdateAI speech 0–5 SAY_MALFURION1–4 ` +
    `(${SAY_MALFURION1}…${SAY_MALFURION4}) then SetFlag(UNIT_NPC_FLAG_QUESTGIVER) - FO6 timer`;
  const citeFollowUp =
    `sunken_templeScripts.cpp:41 QUEST_ERANIKUS_TYRANT_OF_DREAMS=${QUEST_ERANIKUS_TYRANT_OF_DREAMS} ` +
    'accept from Malfurion after speech - bake gap FO6';
  return [
    {
      kind: 'skip',
      reason:
        `AT Shade of Eranikus requires rewarded ${QUEST_THE_CHARGE_OF_DRAGONFLIGHTS} ` +
        `and incomplete/unrewarded ${QUEST_ERANIKUS_TYRANT_OF_DREAMS} + TYPE_MALFURION != IN_PROGRESS`,
      cite: citeAt,
    },
    {
      kind: 'temp_spawn_creature',
      creatureEntry: NPC_MALFURION,
      x: MALFURION_SPAWN.x,
      y: MALFURION_SPAWN.y,
      z: MALFURION_SPAWN.z,
      o: MALFURION_SPAWN.o,
      despawnDelay: 0,
      pathId: 0,
      setRun: false,
      summonActive: false,
      spawnDataEntry: 0,
      spawnType: MALFURION_SPAWN_TYPE,
      cite: citeSpawn,
    },
    {
      kind: 'set_instance_data',
      type: TYPE_MALFURION,
      data: ENCOUNTER_IN_PROGRESS,
      cite: citeSet,
    },
    {
      kind: 'cast_spell',
      spellId: SPELL_SPIRIT_SPAWN_IN,
      castFlags: 0,
      sourceIsGo: false,
      targetCleared: false,
      cite: citeCtor,
    },
    {
      kind: 'talk',
      textId: EMOTE_MALFURION1,
      stringTemplateId: 0,
      cite: citeCtor,
    },
    {
      kind: 'skip',
      reason:
        `npc_malfurionAI ctor RemoveFlag(UNIT_NPC_FLAG_QUESTGIVER=${UNIT_NPC_FLAG_QUESTGIVER}) on summon - host NPC flags`,
      cite: citeCtor,
    },
    {
      kind: 'skip',
      reason:
        'Malfurion speech timers (bow + SAY1–4) then SetFlag QUESTGIVER - FO6 timed AI',
      cite: citeSpeech,
    },
    {
      kind: 'skip',
      reason:
        `follow-up accept QUEST_ERANIKUS_TYRANT_OF_DREAMS (${QUEST_ERANIKUS_TYRANT_OF_DREAMS}) from Malfurion - bake gap FO6`,
      cite: citeFollowUp,
    },
  ];
}

// Family pack: sunken_temple/sunken_templeScripts.cpp. Only the Shade of Eranikus areatrigger,
// gated on 8555 being rewarded — this file has no accept or reward hook.
export function runSunkenTempleScripts(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (
    (phase === 'frame' || phase === 'complete') &&
    questId === QUEST_THE_CHARGE_OF_DRAGONFLIGHTS
  ) {
    return runShadeOfEranikusAt();
  }
  return [];
}
