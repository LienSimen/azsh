// QI4 — eastern_kingdoms/tirisfal_glades residual, extracted for the 1500-line ratchet: the accept
// hook for quest 590 and the mausoleum GO uses for 1819. Cite: tirisfal_glades.cpp.

import type { DbScriptIntent } from './types.ts';
import {
  TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN,
  UNIT_FLAG_CHANGE_REMOVE,
} from './opcodes.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: tirisfal_glades.cpp:85 QUEST_590 = 590 A Rogue's Deal — duel Calvin Montague in Deathknell
// (specialFlags:2 event).
export const QUEST_590 = 590;
// Cite: tirisfal_glades.cpp:41 QUEST_ULAG = 1819 Ulag the Cleaver — kill Ulag (6390) after mausoleum GO
// door summon.
export const QUEST_ULAG = 1819;

// Cite: bake starterCreatureEntries / classic-db creature_questrelation Calvin Montague
// (npc_calvin_montague script name); also ender of 590.
const NPC_CALVIN_MONTAGUE = 6784;
// Cite: tirisfal_glades.cpp:42 NPC_ULAG = 6390 Summoned by GOUse_go_mausoleum_door; bake killTargets entry
// for 1819.
const NPC_ULAG = 6390;
// Cite: bake starterCreatureEntries quest 1819 — Deathguard Dillinger (no pQuestAcceptNPC; GO residual
// opens the kill).
const NPC_DEATHGUARD_DILLINGER = 1496;
// Cite: tirisfal_glades.cpp:43 GO_TRIGGER = 104593 Mausoleum skull-stone trigger
// (GOUse_go_mausoleum_trigger).
const GO_TRIGGER = 104593;
// Cite: tirisfal_glades.cpp:44 GO_DOOR = 176594 Mausoleum door that summons Ulag when used with quest
// incomplete.
const GO_DOOR = 176594;

// Cite: tirisfal_glades.cpp:83 SAY_COMPLETE = -1000356 DoScriptText after Calvin yields (phase 1 of
// DamageTaken sequence).
const SAY_COMPLETE = -1000356;
// Cite: tirisfal_glades.cpp:84 SPELL_DRINK_SD = 2639 Cast after AreaExploredOrEventHappens (phase 2) —
// drink animation.
const SPELL_DRINK_SD = 2639;
// Cite: tirisfal_glades.cpp:86 FACTION_HOSTILE = 168 Calvin accept SetFactionTemporary (same body as
// Bartleby FACTION_ENEMY).
const FACTION_HOSTILE = 168;

/** Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 */
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: Creature.h:578 TEMPFACTION_RESTORE_COMBAT_STOP = 0x02 */
const TEMPFACTION_RESTORE_COMBAT_STOP = 0x02;
// Cite: tirisfal_glades.cpp:175 TEMPFACTION_RESTORE_COMBAT_STOP | TEMPFACTION_RESTORE_RESPAWN = 0x02 | 0x01
// = 0x03
const CALVIN_TEMP_FACTION_FLAGS =
  TEMPFACTION_RESTORE_COMBAT_STOP | TEMPFACTION_RESTORE_RESPAWN;

// Cite: Unit.h:476 UNIT_FLAG_IMMUNE_TO_PLAYER = 0x00000100 Reset() SetImmuneToPlayer(true); accept
// SetImmuneToPlayer(false).
const UNIT_FLAG_IMMUNE_TO_PLAYER = 0x00000100;

// Cite: tirisfal_glades.cpp:111 (GetHealth - damage) * 100 / MaxHealth < 15 DamageTaken yield threshold
// before phase sequence + explore credit.
const CALVIN_CREDIT_HP_PCT = 15;
// Cite: tirisfal_glades.cpp:103 m_uiPhaseTimer = 5000 Initial phase timer after yield; later steps use 7500
// (:130).
const CALVIN_PHASE_TIMER_MS = 5000;
/** Cite: tirisfal_glades.cpp:130 m_uiPhaseTimer = 7500 Timer reload between phase 1→2→3 steps. */
const CALVIN_PHASE_STEP_MS = 7500;

// Cite: tirisfal_glades.cpp:55 SummonCreature coords + TEMPSPAWN + 300000 Ulag spawn when player uses
// mausoleum door with 1819 incomplete.
const ULAG_SPAWN = {
  x: 2390.26,
  y: 336.47,
  z: 40.01,
  o: 2.26,
} as const;
/** Cite: tirisfal_glades.cpp:55 TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN, 300000 */
const ULAG_DESPAWN_MS = 300000;
// Cite: SharedDefines.h:556 GO_FLAG_INTERACT_COND = 0x00000004 Trigger GOUse removes this from the door so
// the player can open it.
const GO_FLAG_INTERACT_COND = 0x00000004;

// QuestAccept_npc_calvin_montague — quest 590 A Rogue's Deal: he turns hostile and attacks, and
// yielding under 15% health says the line, credits and evades. Cite: tirisfal_glades.cpp:170–178.
function runCalvinMontagueAccept(): DbScriptIntent[] {
  const citeImmune =
    `tirisfal_glades.cpp:174 npc_calvin_montague (${NPC_CALVIN_MONTAGUE}) ` +
    'SetImmuneToPlayer(false) / RemoveFlag(UNIT_FLAG_IMMUNE_TO_PLAYER)';
  const citeFaction =
    `tirisfal_glades.cpp:175 SetFactionTemporary(FACTION_HOSTILE=${FACTION_HOSTILE}, ` +
    'TEMPFACTION_RESTORE_COMBAT_STOP | TEMPFACTION_RESTORE_RESPAWN)';
  const citeAttack =
    'tirisfal_glades.cpp:176 AI()->AttackStart(player)';
  const citeYield =
    `tirisfal_glades.cpp:109–122 DamageTaken HP<${CALVIN_CREDIT_HP_PCT}% CombatStop + REACT_PASSIVE + phase=1`;
  const citeSay =
    `tirisfal_glades.cpp:139–141 phase1 DoScriptText(SAY_COMPLETE=${SAY_COMPLETE}) ` +
    `after ${CALVIN_PHASE_TIMER_MS}ms / step ${CALVIN_PHASE_STEP_MS}ms - FO6`;
  const citeCredit =
    `tirisfal_glades.cpp:143–148 phase2 AreaExploredOrEventHappens(${QUEST_590}) + ` +
    `CastSpell(SPELL_DRINK_SD=${SPELL_DRINK_SD}) - FO6 finishEscort`;
  const citeEvade =
    'tirisfal_glades.cpp:150–152 phase3 EnterEvadeMode - FO6 fight end';
  // Reset() leaves UNIT_FLAG_IMMUNE_TO_PLAYER set; accept removes it → 0 when only that bit.
  const priorFlags = UNIT_FLAG_IMMUNE_TO_PLAYER;
  const resultFlags = priorFlags & ~UNIT_FLAG_IMMUNE_TO_PLAYER;
  return [
    {
      kind: 'modify_unit_flags',
      flag: UNIT_FLAG_IMMUNE_TO_PLAYER,
      changeFlag: UNIT_FLAG_CHANGE_REMOVE,
      mode: 'remove',
      resultFlags,
      cite: citeImmune,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_HOSTILE,
      flags: CALVIN_TEMP_FACTION_FLAGS,
      cleared: false,
      cite: citeFaction,
    },
    {
      kind: 'attack_start',
      canAttack: true,
      cite: citeAttack,
    },
    {
      kind: 'skip',
      reason:
        `DamageTaken HP<${CALVIN_CREDIT_HP_PCT}% yield CombatStop + phase timer - FO6 fight`,
      cite: citeYield,
    },
    {
      kind: 'skip',
      reason:
        `phase1 DoScriptText(SAY_COMPLETE=${SAY_COMPLETE}) - FO6 timer ${CALVIN_PHASE_TIMER_MS}ms`,
      cite: citeSay,
    },
    {
      kind: 'skip',
      reason:
        `phase2 AreaExploredOrEventHappens(${QUEST_590}) + SPELL_DRINK_SD (${SPELL_DRINK_SD}) - FO6 finishEscort`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason: 'phase3 EnterEvadeMode - FO6 fight end',
      cite: citeEvade,
    },
  ];
}

// The mausoleum GO residual — quest 1819 Ulag the Cleaver: the trigger unlocks the door and the
// door summons Ulag 6390 for five minutes. Cite: tirisfal_glades.cpp:47–75.
function runUlagMausoleumFrame(): DbScriptIntent[] {
  const citeTrigger =
    `tirisfal_glades.cpp:62–75 GOUse_go_mausoleum_trigger (${GO_TRIGGER}) ` +
    `quest ${QUEST_ULAG} incomplete → SetGoState(ACTIVE) + door RemoveFlag(GO_FLAG_INTERACT_COND=${GO_FLAG_INTERACT_COND})`;
  const citeDoor =
    `tirisfal_glades.cpp:47–59 GOUse_go_mausoleum_door (${GO_DOOR}) ` +
    `quest ${QUEST_ULAG} incomplete → trigger SetGoState(READY) + SummonCreature`;
  const citeSpawn =
    `tirisfal_glades.cpp:55 SummonCreature(NPC_ULAG=${NPC_ULAG}, ` +
    `(${ULAG_SPAWN.x},${ULAG_SPAWN.y},${ULAG_SPAWN.z},${ULAG_SPAWN.o}), ` +
    `TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN, ${ULAG_DESPAWN_MS})`;
  const citeKill =
    `bake killTargets NPC_ULAG=${NPC_ULAG}×1; turn-in to Deathguard Dillinger (${NPC_DEATHGUARD_DILLINGER})`;
  return [
    {
      kind: 'skip',
      reason:
        `mausoleum trigger ${GO_TRIGGER} SetGoState(ACTIVE) + door ${GO_DOOR} RemoveFlag(INTERACT_COND) - host GO FO6`,
      cite: citeTrigger,
    },
    {
      kind: 'skip',
      reason:
        `mausoleum door ${GO_DOOR} SetGoState(READY) on trigger ${GO_TRIGGER} then summon - host GO FO6`,
      cite: citeDoor,
    },
    {
      kind: 'temp_spawn_creature',
      creatureEntry: NPC_ULAG,
      x: ULAG_SPAWN.x,
      y: ULAG_SPAWN.y,
      z: ULAG_SPAWN.z,
      o: ULAG_SPAWN.o,
      despawnDelay: ULAG_DESPAWN_MS,
      pathId: 0,
      setRun: false,
      summonActive: false,
      spawnDataEntry: 0,
      spawnType: TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN,
      cite: citeSpawn,
    },
    {
      kind: 'skip',
      reason:
        `kill Ulag (${NPC_ULAG}) then turn-in to Dillinger (${NPC_DEATHGUARD_DILLINGER}) - host recordKill`,
      cite: citeKill,
    },
  ];
}

// Family pack: eastern_kingdoms/tirisfal_glades.cpp. The accept hook for 590 and the mausoleum
// door and trigger GO residual for 1819.
export function runTirisfalGlades(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (questId === QUEST_590) {
    if (phase === 'accept') return runCalvinMontagueAccept();
    return [];
  }
  if (questId === QUEST_ULAG) {
    if (phase === 'frame' || phase === 'complete') return runUlagMausoleumFrame();
    return [];
  }
  return [];
}
