// QI4 — kalimdor/moonglade residuals, extracted for the 1500-line ratchet. This batch claims the
// accept hook for quest 8736 only. Cite: kalimdor/moonglade.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface MoongladeQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

/** Cite: moonglade.cpp:60 QUEST_NIGHTMARE_MANIFESTS = 8736 Escort event; DoHandleOutro explore credit. */
export const QUEST_NIGHTMARE_MANIFESTS = 8736;

// Cite: bake starterCreatureEntries / enderCreatureEntries quest 8736; moonglade.cpp:53 NPC_REMULOS = 11832
// Keeper Remulos.
const NPC_REMULOS = 11832;
/** Cite: moonglade.cpp:51 NPC_ERANIKUS_TYRANT = 15491 Summoned via SPELL_CONJURE_RIFT mid-event. */
const NPC_ERANIKUS_TYRANT = 15491;
/** Cite: moonglade.cpp:52 NPC_NIGHTMARE_PHANTASM = 15629 Shade waves during battle. */
const NPC_NIGHTMARE_PHANTASM = 15629;
/** Cite: moonglade.cpp:54 NPC_TYRANDE_WHISPERWIND = 15633 Appears with priestesses when Eranikus is low. */
const NPC_TYRANDE_WHISPERWIND = 15633;
/** Cite: moonglade.cpp:55 NPC_ELUNE_PRIESTESS = 15634 */
const NPC_ELUNE_PRIESTESS = 15634;
// Cite: moonglade.cpp:56 NPC_NIGHTHAVEN_DEFENDER = 15495 Moonglade Defenders summoned to fight phantasms.
const NPC_NIGHTHAVEN_DEFENDER = 15495;
// Cite: moonglade.cpp:529 NPC_ERANIKUS_REDEEMED = 15628 EnterEvadeMode transforms Eranikus when HP < 20%.
const NPC_ERANIKUS_REDEEMED = 15628;

// Cite: moonglade.cpp:42 SPELL_CONJURE_RIFT = 25813 Dialogue step summons Eranikus
// (spell_conjure_dream_rift).
const SPELL_CONJURE_RIFT = 25813;
/** Cite: moonglade.cpp:43 SPELL_DRAGON_HOVER = 18430 */
const SPELL_DRAGON_HOVER = 18430;
/** Cite: moonglade.cpp:48 SPELL_ERANIKUS_REDEEMED = 25846 Transform Eranikus after redeem dialogue. */
const SPELL_ERANIKUS_REDEEMED = 25846;
/** Cite: moonglade.cpp:44–47 Remulos combat heals / starfire. */
const SPELL_HEALING_TOUCH = 23381;
const SPELL_REGROWTH = 20665;
const SPELL_REJUVENATION = 20664;
const SPELL_STARFIRE = 21668;
/** Cite: moonglade.cpp:531–533 Eranikus combat. */
const SPELL_ACID_BREATH = 24839;
const SPELL_NOXIOUS_BREATH = 24818;
const SPELL_SHADOWBOLT_VOLLEY = 25586;
/** Cite: moonglade.cpp:534 SPELL_ARCANE_CHANNELING = 23017 Tyrande channel. */
const SPELL_ARCANE_CHANNELING = 23017;

// Cite: moonglade.cpp:58 FACTION_CENARION_CIRCLE = 996 SetFactionTemporary on Remulos at
// SAY_REMULOS_DEFEND_3 battle start.
const FACTION_CENARION_CIRCLE = 996;
// Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 moonglade.cpp:352 SetFactionTemporary(996,
// TEMPFACTION_RESTORE_RESPAWN).
const TEMPFACTION_RESTORE_RESPAWN = 0x01;

/** Cite: Unit.h:478 UNIT_FLAG_PVP = 0x00001000 WP1 SetFlag; JustDied / DoHandleOutro RemoveFlag. */
const UNIT_FLAG_PVP = 0x00001000;

/** Cite: moonglade.cpp:63–67 Remulos intro yells. */
const SAY_REMULOS_INTRO_1 = -1000669;
const SAY_REMULOS_INTRO_2 = -1000670;
const SAY_REMULOS_INTRO_3 = -1000671;
const SAY_REMULOS_INTRO_4 = -1000672;
const SAY_REMULOS_INTRO_5 = -1000673;
/** Cite: moonglade.cpp:69–70 Eranikus spawn. */
const EMOTE_SUMMON_ERANIKUS = -1000674;
const SAY_ERANIKUS_SPAWN = -1000675;
/** Cite: moonglade.cpp:72–76 taunt dialogue. */
const SAY_REMULOS_TAUNT_1 = -1000676;
const EMOTE_ERANIKUS_LAUGH = -1000677;
const SAY_ERANIKUS_TAUNT_2 = -1000678;
const SAY_REMULOS_TAUNT_3 = -1000679;
const SAY_ERANIKUS_TAUNT_4 = -1000680;
/** Cite: moonglade.cpp:78–86 defend / attack lines. */
const EMOTE_ERANIKUS_ATTACK = -1000681;
const SAY_REMULOS_DEFEND_1 = -1000682;
const SAY_REMULOS_DEFEND_2 = -1000683;
const SAY_ERANIKUS_SHADOWS = -1000684;
const SAY_REMULOS_DEFEND_3 = -1000685;
const SAY_ERANIKUS_ATTACK_1 = -1000686;
const SAY_ERANIKUS_ATTACK_2 = -1000687;
const SAY_ERANIKUS_ATTACK_3 = -1000688;
/** Cite: moonglade.cpp:108–109 Remulos outro. */
const SAY_REMULOS_OUTRO_1 = -1000704;
const SAY_REMULOS_OUTRO_2 = -1000705;

/** Cite: moonglade.cpp:115–117 MAX_SHADOWS / MAX_DEFENDERS / MAX_SUMMON_TURNS */
const MAX_SHADOWS = 3;
const MAX_DEFENDERS = 10;
const MAX_SUMMON_TURNS = 10;
/** Cite: moonglade.cpp:537 MAX_PRIESTESS = 7 */
const MAX_PRIESTESS = 7;

/** Cite: moonglade.cpp:140–146 eranikusLocations[0] spawn (SPELL_CONJURE_RIFT). */
const ERANIKUS_SPAWN = {
  x: 7881.72,
  y: -2651.23,
  z: 493.29,
  o: 0.4,
} as const;
/** Cite: moonglade.cpp:143 flight / 144 combat / 145 redeemed points. */
const ERANIKUS_FLIGHT = { x: 7929.86, y: -2574.88, z: 505.35 } as const;
const ERANIKUS_COMBAT = { x: 7912.98, y: -2568.99, z: 488.71 } as const;
const ERANIKUS_REDEEMED = { x: 7906.57, y: -2565.63, z: 488.39 } as const;

/** Cite: moonglade.cpp:353 m_shadesummonTimer = 5 * IN_MILLISECONDS Common.h IN_MILLISECONDS = 1000. */
const SHADE_SUMMON_FIRST_MS = 5 * 1000;
/** Cite: moonglade.cpp:367 m_outroTimer = 3 * IN_MILLISECONDS after credit */
const OUTRO_TIMER_MS = 3 * 1000;
/** Cite: moonglade.cpp:387–388 ForcedDespawn(3s) after SetRespawnDelay(1 MINUTE) */
const REMULOS_OUTRO_DESPAWN_MS = 3 * 1000;
const REMULOS_RESPAWN_DELAY_S = 60;
/** Cite: moonglade.cpp:417 TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN 3 * MINUTE */
const DEFENDER_DESPAWN_MS = 3 * 60 * 1000;

// ── accept handlers ──────────────────────────────────────────────────────────

// QuestAccept_npc_keeper_remulos — quest 8736 The Nightmare Manifests: a run escort whose dialogue
// conjures Eranikus, and whose outro after the redeem credits it. Cite: moonglade.cpp:508–520.
function runRemulosAccept(): DbScriptIntent[] {
  const citeEscort =
    `moonglade.cpp:512–513 npc_keeper_remulos (${NPC_REMULOS}) ` +
    'npc_escortAI::Start(true, player, quest) - FO6 degraded finishEscort';
  const citeWpIntro =
    `moonglade.cpp:283–293 WP1 DoScriptText(SAY_REMULOS_INTRO_1=${SAY_REMULOS_INTRO_1}) ` +
    `+ SetFlag(UNIT_FLAG_PVP=${UNIT_FLAG_PVP}); WP2 SAY_REMULOS_INTRO_2=${SAY_REMULOS_INTRO_2} - FO6`;
  const citeDialogue =
    `moonglade.cpp:120–138,320–356 dialogue SAY_REMULOS_INTRO_3..5=` +
    `${SAY_REMULOS_INTRO_3}–${SAY_REMULOS_INTRO_5}; SPELL_CONJURE_RIFT=${SPELL_CONJURE_RIFT}; ` +
    `EMOTE_SUMMON_ERANIKUS=${EMOTE_SUMMON_ERANIKUS}; SAY_ERANIKUS_SPAWN=${SAY_ERANIKUS_SPAWN}; ` +
    `taunts ${SAY_REMULOS_TAUNT_1}/${SAY_ERANIKUS_TAUNT_2}/${SAY_REMULOS_TAUNT_3}/` +
    `${SAY_ERANIKUS_TAUNT_4}; EMOTE_ERANIKUS_ATTACK=${EMOTE_ERANIKUS_ATTACK}; ` +
    `SAY_REMULOS_DEFEND_1=${SAY_REMULOS_DEFEND_1} - FO6 dialogue`;
  const citeSummon =
    `moonglade.cpp:898–913 ConjureDreamRift SummonCreature NPC_ERANIKUS_TYRANT=` +
    `${NPC_ERANIKUS_TYRANT} at ${ERANIKUS_SPAWN.x},${ERANIKUS_SPAWN.y},${ERANIKUS_SPAWN.z},` +
    `${ERANIKUS_SPAWN.o} + SPELL_DRAGON_HOVER=${SPELL_DRAGON_HOVER}; ` +
    `flight MovePoint ${ERANIKUS_FLIGHT.x},${ERANIKUS_FLIGHT.y},${ERANIKUS_FLIGHT.z} - FO6 summon`;
  const citeFaction =
    `moonglade.cpp:350–353 SAY_REMULOS_DEFEND_3=${SAY_REMULOS_DEFEND_3}: ` +
    `SetFactionTemporary(FACTION_CENARION_CIRCLE=${FACTION_CENARION_CIRCLE}, ` +
    `TEMPFACTION_RESTORE_RESPAWN=${TEMPFACTION_RESTORE_RESPAWN}) + ` +
    `m_shadesummonTimer=${SHADE_SUMMON_FIRST_MS}ms - FO6 mid-event`;
  const citeShades =
    `moonglade.cpp:398–466 first wave MAX_SHADOWS=${MAX_SHADOWS} NPC_NIGHTMARE_PHANTASM=` +
    `${NPC_NIGHTMARE_PHANTASM} + MAX_DEFENDERS=${MAX_DEFENDERS} NPC_NIGHTHAVEN_DEFENDER=` +
    `${NPC_NIGHTHAVEN_DEFENDER} despawn ${DEFENDER_DESPAWN_MS}ms; turns MAX_SUMMON_TURNS=` +
    `${MAX_SUMMON_TURNS}; SAY_ERANIKUS_ATTACK_1=${SAY_ERANIKUS_ATTACK_1}; land combat ` +
    `MovePoint ${ERANIKUS_COMBAT.x},${ERANIKUS_COMBAT.y},${ERANIKUS_COMBAT.z} - FO6 combat`;
  const citeRemulosCombat =
    `moonglade.cpp:468–499 Remulos heal SPELL_HEALING_TOUCH/REJUVENATION/REGROWTH=` +
    `${SPELL_HEALING_TOUCH}/${SPELL_REJUVENATION}/${SPELL_REGROWTH}; ` +
    `SPELL_STARFIRE=${SPELL_STARFIRE} - FO6 combat`;
  const citeEranikus =
    `moonglade.cpp:543–890 boss_eranikus: SPELL_ACID_BREATH/NOXIOUS_BREATH/SHADOWBOLT_VOLLEY=` +
    `${SPELL_ACID_BREATH}/${SPELL_NOXIOUS_BREATH}/${SPELL_SHADOWBOLT_VOLLEY}; ` +
    `HP checks summon NPC_TYRANDE_WHISPERWIND=${NPC_TYRANDE_WHISPERWIND} + ` +
    `MAX_PRIESTESS=${MAX_PRIESTESS}×NPC_ELUNE_PRIESTESS=${NPC_ELUNE_PRIESTESS}; ` +
    `SPELL_ARCANE_CHANNELING=${SPELL_ARCANE_CHANNELING}; EnterEvadeMode <20% → ` +
    `UpdateEntry(NPC_ERANIKUS_REDEEMED=${NPC_ERANIKUS_REDEEMED}) + SPELL_ERANIKUS_REDEEMED=` +
    `${SPELL_ERANIKUS_REDEEMED}; MovePoint redeemed ${ERANIKUS_REDEEMED.x},` +
    `${ERANIKUS_REDEEMED.y},${ERANIKUS_REDEEMED.z} - FO6 boss event`;
  const citeCredit =
    `moonglade.cpp:358–368 DoHandleOutro: RewardPlayerAndGroupAtEventExplored(8736) + ` +
    `RemoveFlag(UNIT_FLAG_PVP=${UNIT_FLAG_PVP}) + m_outroTimer=${OUTRO_TIMER_MS}ms ` +
    `SAY_REMULOS_OUTRO_1/2=${SAY_REMULOS_OUTRO_1}/${SAY_REMULOS_OUTRO_2} + ` +
    `SetRespawnDelay(${REMULOS_RESPAWN_DELAY_S}s) ForcedDespawn(${REMULOS_OUTRO_DESPAWN_MS}ms) ` +
    '- FO6 finishEscort';
  const citeEnder =
    `bake enderCreatureEntries NPC_REMULOS=${NPC_REMULOS} after DoHandleOutro explore credit`;
  return [
    {
      kind: 'skip',
      reason:
        `escort Start(true, player, quest) npc_keeper_remulos (${NPC_REMULOS}) - FO6 degraded finishEscort`,
      cite: citeEscort,
    },
    {
      kind: 'skip',
      reason:
        `WP1 SAY_REMULOS_INTRO_1 (${SAY_REMULOS_INTRO_1}) + SetFlag UNIT_FLAG_PVP ` +
        `(${UNIT_FLAG_PVP}); WP2 SAY_REMULOS_INTRO_2 (${SAY_REMULOS_INTRO_2}) - FO6`,
      cite: citeWpIntro,
    },
    {
      kind: 'skip',
      reason:
        `dialogue intro + SPELL_CONJURE_RIFT (${SPELL_CONJURE_RIFT}) + Eranikus taunts ` +
        `(${SAY_ERANIKUS_SPAWN}/${SAY_REMULOS_TAUNT_1}/${EMOTE_ERANIKUS_LAUGH}) - FO6 dialogue`,
      cite: citeDialogue,
    },
    {
      kind: 'skip',
      reason:
        `SummonCreature NPC_ERANIKUS_TYRANT (${NPC_ERANIKUS_TYRANT}) at ` +
        `${ERANIKUS_SPAWN.x}/${ERANIKUS_SPAWN.y}/${ERANIKUS_SPAWN.z} + ` +
        `SPELL_DRAGON_HOVER (${SPELL_DRAGON_HOVER}) - FO6 summon`,
      cite: citeSummon,
    },
    {
      kind: 'skip',
      reason:
        `SAY_REMULOS_DEFEND_3 SetFactionTemporary FACTION_CENARION_CIRCLE ` +
        `(${FACTION_CENARION_CIRCLE}) flags ${TEMPFACTION_RESTORE_RESPAWN} + shade timer ` +
        `${SHADE_SUMMON_FIRST_MS}ms - FO6 mid-event`,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `shade waves NPC_NIGHTMARE_PHANTASM (${NPC_NIGHTMARE_PHANTASM}) ×${MAX_SHADOWS} ` +
        `×${MAX_SUMMON_TURNS} + defenders (${NPC_NIGHTHAVEN_DEFENDER}) ×${MAX_DEFENDERS} ` +
        `→ land combat (${ERANIKUS_COMBAT.x}/${ERANIKUS_COMBAT.y}) - FO6 combat`,
      cite: citeShades,
    },
    {
      kind: 'skip',
      reason:
        `Remulos combat SPELL_HEALING_TOUCH/STARFIRE (${SPELL_HEALING_TOUCH}/` +
        `${SPELL_STARFIRE}) - FO6 combat`,
      cite: citeRemulosCombat,
    },
    {
      kind: 'skip',
      reason:
        `boss_eranikus HP event Tyrande (${NPC_TYRANDE_WHISPERWIND}) + priestess ` +
        `(${NPC_ELUNE_PRIESTESS})×${MAX_PRIESTESS} → redeem (${NPC_ERANIKUS_REDEEMED}) ` +
        `SPELL_ERANIKUS_REDEEMED (${SPELL_ERANIKUS_REDEEMED}) - FO6 boss event`,
      cite: citeEranikus,
    },
    {
      kind: 'skip',
      reason:
        `DoHandleOutro RewardPlayerAndGroupAtEventExplored(8736) + RemoveFlag UNIT_FLAG_PVP ` +
        `(${UNIT_FLAG_PVP}) + SAY_REMULOS_OUTRO (${SAY_REMULOS_OUTRO_1}/${SAY_REMULOS_OUTRO_2}) ` +
        `ForcedDespawn(${REMULOS_OUTRO_DESPAWN_MS}ms) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_REMULOS (${NPC_REMULOS}) after explore credit`,
      cite: citeEnder,
    },
  ];
}

// Family pack: kalimdor/moonglade.cpp Hooks: pQuestAcceptNPC keeper_remulos (8736). Residuals documented on
// accept chain: boss_eranikus redeem, spell_conjure_dream_rift.
export function runMoonglade(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase === 'accept') {
    if (questId === QUEST_NIGHTMARE_MANIFESTS) return runRemulosAccept();
    return [];
  }
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/moonglade'` in registry.ts.
export const MOONGLADE_REGISTRY: Record<string | number, MoongladeQuestScriptEntry> = {
  'kalimdor/moonglade': {
    family: 'kalimdor/moonglade',
    questIds: [QUEST_NIGHTMARE_MANIFESTS],
    hooks: ['accept'],
    cite: 'kalimdor/moonglade.cpp:508–520,279–306,358–368,898–913',
    run: runMoonglade,
  },
  [QUEST_NIGHTMARE_MANIFESTS]: {
    family: 'kalimdor/moonglade',
    questId: QUEST_NIGHTMARE_MANIFESTS,
    questIds: [QUEST_NIGHTMARE_MANIFESTS],
    hooks: ['accept'],
    cite: 'moonglade.cpp:508–520 QuestAccept_npc_keeper_remulos',
    run: runMoonglade,
  },
};
