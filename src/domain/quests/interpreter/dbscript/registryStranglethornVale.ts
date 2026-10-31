// QI4 — eastern_kingdoms/stranglethorn_vale residual, extracted for the 1500-line ratchet. Only
// the mob_yenniku SpellHit for quest 592; there is no accept hook. Cite: stranglethorn_vale.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: stranglethorn_vale.cpp:42 QUEST_ID_SAVING_YENNIKU = 592 Saving Yenniku — stun Yenniku with the Soul
// Gem, fill it, return to Nimboya.
export const QUEST_SAVING_YENNIKU = 592;
// Cite: stranglethorn_vale.cpp:40 SPELL_YENNIKUS_RELEASE = 3607 Soul Gem (item 3912) spell that hits
// Yenniku while 592 is incomplete.
const SPELL_YENNIKUS_RELEASE = 3607;
// Cite: stranglethorn_vale.cpp:44 FACTION_ID_HORDE_GENERIC = 83 Temporary faction after SpellHit
// EnterEvadeMode (comment: may not be correct).
const FACTION_ID_HORDE_GENERIC = 83;
// Cite: Creature.h:579 TEMPFACTION_RESTORE_REACH_HOME = 0x04 SetFactionTemporary flags on Yenniku after
// release.
const TEMPFACTION_RESTORE_REACH_HOME = 0x04;
// Cite: SharedDefines.h:795 EMOTE_STATE_STUN = 64 HandleEmote on EnterEvadeMode while reset timer is
// active.
const EMOTE_STATE_STUN = 64;
// Cite: stranglethorn_vale.cpp:61 m_uiResetTimer = 60000 Duration (ms) of stun/faction window before
// EMOTE_STATE_NONE + re-evade.
const YENNIKU_RESET_TIMER_MS = 60000;
// Cite: classic-db / ACID acid_classic.sql "Yenniku 2530 - mob_yenniku" Creature entry for ScriptName
// mob_yenniku.
const NPC_YENNIKU = 2530;
// Cite: classic-db item_template 3912 Soul Gem (spell 3607); 3913 Filled Soul Gem Objective item for quest
// 592 (ReqItemId1=3913).
const ITEM_SOUL_GEM = 3912;
const ITEM_FILLED_SOUL_GEM = 3913;

// mob_yenniku SpellHit — quest 592 Saving Yenniku: the Soul Gem release evades him into a stunned
// Horde-faction state for 60 s. Cite: stranglethorn_vale.cpp:55–96. The bake lacks quest 592.
function runYennikuSpellHit(): DbScriptIntent[] {
  const citeSpell =
    `stranglethorn_vale.cpp:55–65 mob_yenniku (${NPC_YENNIKU}) SpellHit(` +
    `SPELL_YENNIKUS_RELEASE=${SPELL_YENNIKUS_RELEASE}) incomplete quest 592`;
  const citeTimer =
    `stranglethorn_vale.cpp:61 m_uiResetTimer=${YENNIKU_RESET_TIMER_MS}; EnterEvadeMode()`;
  const citeEvade =
    'stranglethorn_vale.cpp:71–75 RemoveAllAurasOnEvade + CombatStop + LoadCreatureAddon + SetLootRecipient - host FO6';
  const citeEmote =
    `stranglethorn_vale.cpp:77 HandleEmote(EMOTE_STATE_STUN=${EMOTE_STATE_STUN})`;
  const citeFaction =
    `stranglethorn_vale.cpp:78 SetFactionTemporary(FACTION_ID_HORDE_GENERIC=${FACTION_ID_HORDE_GENERIC}, ` +
    `TEMPFACTION_RESTORE_REACH_HOME=${TEMPFACTION_RESTORE_REACH_HOME})`;
  const citeReset =
    `stranglethorn_vale.cpp:88–92 UpdateAI after ${YENNIKU_RESET_TIMER_MS}ms ` +
    'EMOTE_STATE_NONE + EnterEvadeMode restore - FO6 timer';
  const citeItem =
    `classic-db quest 592 ReqItemId1=${ITEM_FILLED_SOUL_GEM} from Soul Gem ${ITEM_SOUL_GEM} spell ${SPELL_YENNIKUS_RELEASE} - host item grant`;
  return [
    {
      kind: 'skip',
      reason:
        `SpellHit SPELL_YENNIKUS_RELEASE (${SPELL_YENNIKUS_RELEASE}) on npc_yenniku (${NPC_YENNIKU}) with incomplete 592`,
      cite: citeSpell,
    },
    {
      kind: 'skip',
      reason: `m_uiResetTimer=${YENNIKU_RESET_TIMER_MS} then EnterEvadeMode - FO6 timer start`,
      cite: citeTimer,
    },
    {
      kind: 'skip',
      reason:
        'RemoveAllAurasOnEvade + CombatStop + LoadCreatureAddon + clear loot recipient - host FO6',
      cite: citeEvade,
    },
    {
      kind: 'emote',
      emoteId: EMOTE_STATE_STUN,
      cite: citeEmote,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_ID_HORDE_GENERIC,
      flags: TEMPFACTION_RESTORE_REACH_HOME,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'skip',
      reason:
        `timer ${YENNIKU_RESET_TIMER_MS}ms EMOTE_STATE_NONE + re-evade (TEMPFACTION_RESTORE_REACH_HOME) - FO6`,
      cite: citeReset,
    },
    {
      kind: 'skip',
      reason:
        `Filled Soul Gem (${ITEM_FILLED_SOUL_GEM}) from spell/item host - not AI residual`,
      cite: citeItem,
    },
  ];
}

// Family pack: eastern_kingdoms/stranglethorn_vale.cpp Residual: mob_yenniku SpellHit for quest 592
// (frame/complete). No accept/reward NPC hooks in this file.
export function runStranglethornVale(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (
    (phase === 'frame' || phase === 'complete') &&
    questId === QUEST_SAVING_YENNIKU
  ) {
    return runYennikuSpellHit();
  }
  return [];
}
