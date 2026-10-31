// QI4 — stratholmeScripts residual, extracted for the 1500-line ratchet: the Aurius reward hook
// for 5122 and the restless-soul kill credit for 5282. Cite: stratholme/stratholmeScripts.cpp.

import type { DbScriptIntent } from './types.ts';
import { NPC_FLAG_CHANGE_REMOVE } from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: stratholme.h:76 QUEST_MEDALLION_FAITH = 5122 Turn-in of the Medallion of Faith at Aurius (chapel)
// arms the Baron ally event.
export const QUEST_MEDALLION_FAITH = 5122;
// Cite: stratholmeScripts.cpp:139 QUEST_RESTLESS_SOUL = 5282 The Restless Souls — free 15 Restless Souls
// with Egan's Blaster.
export const QUEST_RESTLESS_SOUL = 5282;
// Cite: stratholme.h:21 TYPE_AURIUS = 7 Instance encounter slot set DONE when Medallion of Faith is
// rewarded.
const TYPE_AURIUS = 7;
/** Cite: sc_instance.h:17 DONE = 3 EncounterState written by SetData(TYPE_AURIUS, DONE). */
const ENCOUNTER_DONE = 3;
/** Cite: stratholme.h:48 NPC_AURIUS = 10917 Quest giver for 5122 / 5125; script name npc_aurius. */
const NPC_AURIUS = 10917;
// Cite: Unit.h:511 UNIT_NPC_FLAG_QUESTGIVER = 0x00000002 Removed on Aurius when TYPE_AURIUS becomes DONE
// (SetData special).
const UNIT_NPC_FLAG_QUESTGIVER = 0x00000002;
// Cite: stratholmeScripts.cpp:145 NPC_RESTLESS_SOUL = 11122 Kill-credit entry for
// RewardPlayerAndGroupAtEventCredit after blaster tag.
const NPC_RESTLESS_SOUL = 11122;
/** Cite: stratholmeScripts.cpp:146 NPC_FREED_SOUL = 11136 UpdateEntry target after the 1s die timer. */
const NPC_FREED_SOUL = 11136;
// Cite: stratholmeScripts.cpp:141 SPELL_EGAN_BLASTER = 17368 Item spell (Egan's Blaster 13289) that tags
// Restless Souls while 5282 incomplete.
const SPELL_EGAN_BLASTER = 17368;
// Cite: stratholmeScripts.cpp:161 m_uiDieTimer = 1000 Delay (ms) from blaster tag to UpdateEntry + kill
// credit.
const RESTLESS_DIE_TIMER_MS = 1000;
/** Cite: stratholmeScripts.cpp:187 ForcedDespawn(60000) Despawn delay (ms) after the soul is freed. */
const FREED_SOUL_DESPAWN_MS = 60000;

// QuestRewarded_npc_aurius — quest 5122 The Medallion of Faith: sets TYPE_AURIUS DONE, which
// strips his QUESTGIVER flag and arms him as a Baron ally. Cite: stratholmeScripts.cpp:316–329.
function runAuriusReward(): DbScriptIntent[] {
  const citeSet =
    'stratholmeScripts.cpp:326–327 SetData(TYPE_AURIUS, DONE) for QUEST_MEDALLION_FAITH';
  const citeFlag =
    'stratholme.cpp:478–480 TYPE_AURIUS DONE RemoveFlag(UNIT_NPC_FLAG_QUESTGIVER) on Aurius';
  const citeBaron =
    'stratholme.cpp:356–358,1109–1135 TYPE_AURIUS DONE → auriusSummonTimer 5s on Baron engage - instance FO6';
  // Prior: typical questgiver QUESTGIVER only for this residual strip path.
  const prior = UNIT_NPC_FLAG_QUESTGIVER;
  const resultFlags = prior & ~UNIT_NPC_FLAG_QUESTGIVER;
  return [
    {
      kind: 'set_instance_data',
      type: TYPE_AURIUS,
      data: ENCOUNTER_DONE,
      cite: citeSet,
    },
    {
      kind: 'modify_npc_flags',
      flag: UNIT_NPC_FLAG_QUESTGIVER,
      changeFlag: NPC_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags,
      cite: citeFlag,
    },
    {
      kind: 'skip',
      reason:
        `npc_aurius (${NPC_AURIUS}) Baron-ally summon after TYPE_AURIUS DONE - instance FO6`,
      cite: citeBaron,
    },
  ];
}

// mob_restless_soul SpellHit — quest 5282 The Restless Souls: Egan's Blaster tags the soul, and a
// second later it frees, despawns and credits 11122. Cite: stratholmeScripts.cpp:165–198.
function runRestlessSoulCredit(): DbScriptIntent[] {
  const citeSpell =
    `stratholmeScripts.cpp:165–174 SpellHit SPELL_EGAN_BLASTER=${SPELL_EGAN_BLASTER} incomplete ${QUEST_RESTLESS_SOUL}`;
  const citeTimer =
    `stratholmeScripts.cpp:161,183–186 m_uiDieTimer=${RESTLESS_DIE_TIMER_MS} then transform`;
  const citeEntry =
    `stratholmeScripts.cpp:186 UpdateEntry(NPC_FREED_SOUL=${NPC_FREED_SOUL})`;
  const citeDespawn =
    `stratholmeScripts.cpp:187 ForcedDespawn(${FREED_SOUL_DESPAWN_MS})`;
  const citeTalk =
    'stratholmeScripts.cpp:188–195 urand SAY_ZAPPED0–3 - FO6 random talk';
  const citeCredit =
    `stratholmeScripts.cpp:196–197 RewardPlayerAndGroupAtEventCredit(NPC_RESTLESS_SOUL=${NPC_RESTLESS_SOUL})`;
  return [
    {
      kind: 'skip',
      reason:
        `SpellHit SPELL_EGAN_BLASTER (${SPELL_EGAN_BLASTER}) on Restless Soul with incomplete 5282`,
      cite: citeSpell,
    },
    {
      kind: 'skip',
      reason: `m_uiDieTimer=${RESTLESS_DIE_TIMER_MS}ms then UpdateEntry/credit - FO6 timer`,
      cite: citeTimer,
    },
    {
      kind: 'update_template',
      oldEntry: NPC_RESTLESS_SOUL,
      newTemplate: NPC_FREED_SOUL,
      changed: true,
      cite: citeEntry,
    },
    {
      kind: 'despawn_self',
      despawnDelay: FREED_SOUL_DESPAWN_MS,
      cite: citeDespawn,
    },
    {
      kind: 'skip',
      reason: 'optional DoScriptText SAY_ZAPPED0–3 via urand(0,6) - FO6 random',
      cite: citeTalk,
    },
    {
      kind: 'kill_credit',
      creatureEntry: NPC_RESTLESS_SOUL,
      cite: citeCredit,
    },
  ];
}

// Family pack: stratholme/stratholmeScripts.cpp. The Aurius reward hook for 5122, plus the
// restless-soul kill credit for 5282 as a residual.
export function runStratholmeScripts(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'reward' && questId === QUEST_MEDALLION_FAITH) {
    return runAuriusReward();
  }
  if (
    (phase === 'frame' || phase === 'complete') &&
    questId === QUEST_RESTLESS_SOUL
  ) {
    return runRestlessSoulCredit();
  }
  return [];
}
