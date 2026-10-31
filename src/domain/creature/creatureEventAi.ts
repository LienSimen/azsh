// Creature EventAI state machine, the ACTION_HANDLERS interpreter and its tick. Pure domain.
// Cite: CreatureEventAI.cpp ProcessAction / CheckEvent / ProcessEvent; CreatureEventAI.h ACTION_T_*.

import type {
  CreatureAiAction,
  CreatureAiScript,
  CreatureAiSummon,
  CreatureCastEntry,
  CreatureSpellListEntry,
  SpellDef,
} from '../../data/schema.ts';
import type { Rng } from '../../engine/core/rng.ts';
import {
  formatEventAiChatLine,
  isUnresolvedEventAiTextId,
  lookupEventAiText,
  pickTextIdFromAction,
} from './eventAiTexts.ts';
import {
  ACTION_T_ATTACK_START,
  ACTION_T_AUTO_ATTACK,
  ACTION_T_CALL_FOR_HELP,
  ACTION_T_CAST,
  ACTION_T_CHANGE_MOVEMENT,
  ACTION_T_COMBAT_MOVEMENT,
  ACTION_T_DESPAWN_GUARDIANS,
  ACTION_T_DIE,
  ACTION_T_EMOTE,
  ACTION_T_EVADE,
  ACTION_T_FLEE_FOR_ASSIST,
  ACTION_T_FORCE_DESPAWN,
  ACTION_T_MORPH_TO_ENTRY_OR_MODEL,
  ACTION_T_MOUNT_TO_ENTRY_OR_MODEL,
  ACTION_T_QUEST_EVENT,
  ACTION_T_RANDOM_EMOTE,
  ACTION_T_RANDOM_PHASE,
  ACTION_T_RANDOM_PHASE_RANGE,
  ACTION_T_RANDOM_SOUND,
  ACTION_T_REMOVE_UNIT_FLAG,
  ACTION_T_REMOVEAURASFROMSPELL,
  ACTION_T_SET_DEATH_PREVENTION,
  ACTION_T_SET_FACTION,
  ACTION_T_SET_FOLLOW_MOVEMENT,
  ACTION_T_SET_IMMOBILIZED_STATE,
  ACTION_T_SET_INST_DATA,
  ACTION_T_SET_PHASE,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_SET_REACT_STATE,
  ACTION_T_SET_SHEATH,
  ACTION_T_SET_STAND_STATE,
  ACTION_T_SET_UNIT_FIELD,
  ACTION_T_SET_UNIT_FLAG,
  ACTION_T_SET_WALK,
  ACTION_T_SOUND,
  ACTION_T_SPAWN,
  ACTION_T_SUMMON_ID,
  ACTION_T_TEXT,
  ACTION_T_TEXT_NEW,
  ACTION_T_THROW_AI_EVENT,
  ACTION_T_SET_THROW_MASK,
  ACTION_T_THREAT_ALL_PCT,
  ACTION_T_THREAT_SINGLE,
  ACTION_T_UPDATE_TEMPLATE,
  ACTION_T_ZONE_COMBAT_PULSE,
  AI_EVENT_HEALTH_STEP_PCTS,
  AI_EVENT_HEALTH_STEP_TYPES,
  AI_EVENT_TYPE,
  CREATURE_FAMILY_FLEE_DELAY_MS,
  EVENT_T,
  getRandActionParam,
  randomPhaseInRange,
  RANGE_MODE_TYPE_NONE,
  REACT_STATE,
  SHEATH_STATE,
  UNIT_FIELD,
  WALK_SETTING,
  ACTION_T_START_RELAY_SCRIPT,
  ACTION_T_KILLED_MONSTER,
  ACTION_T_PAUSE_WAYPOINTS,
  ACTION_T_SET_FACING,
  SPELL_LIST_FLAG,
  CAST_FLAG,
} from './creatureAiConstants.ts';
import {
  type CastPickContext,
  type CreatureCastSlot,
  eventConditionsOk,
  eventPhaseBlocked,
  markCreatureCastUsed,
  rollTimer,
} from './creatureCastList.ts';

// EventAI multi-action interpreter (VE: phase / spawn / summon_id / flee) Cite: CreatureEventAI.cpp
// ProcessAction / CheckEvent; FE1 ai.scripts bake.

/** Runtime state per creature — mirrors CreatureEventAI m_Phase + holders + S3 flags. */
export interface CreatureEventAiState {
  /** m_Phase — starts 0. Cite: CreatureEventAI SET_PHASE ~919–922. */
  phase: number;
  // ORDER_FLEEING / combat-script panic. While true, casts + meaningful melee stop. Cite: UnitAI.cpp DoFlee
  // ~829–841 (SetAIOrder(ORDER_FLEEING)).
  fleeing: boolean;
  /** Session time when flee ends (0 when not fleeing). DoFlee default delay. */
  fleeUntil: number;
  // m_meleeEnabled — ACTION_T_AUTO_ATTACK. Default true. Cite: UnitAI.cpp SetMeleeEnabled ~794–809;
  // ProcessAction ~900–901.
  meleeEnabled: boolean;
  // m_rangedMode — ACTION_T_SET_RANGED_MODE. Default false. Cite: UnitAI.cpp SetRangedMode ~979–995;
  // ProcessAction ~1298–1307.
  rangedMode: boolean;
  /** m_chaseDistance when ranged mode on (yards). */
  rangedChaseDistance: number;
  /** RangeModeType stored from SET_RANGED_MODE param1. */
  rangedModeType: number;
  /** UNKILLABLE — ACTION_T_SET_DEATH_PREVENTION. Cite: CreatureAI.cpp SetDeathPrevention ~130–135. */
  deathPrevention: boolean;
  /** JustPreventedDeath already fired this pull. Cite: CreatureAI.cpp JustPreventedDeath. */
  deathPreventionFired: boolean;
  // ACTION_T_PAUSE_WAYPOINTS (51) — the unit holds its ground instead of patrolling. Cite:
  // CreatureEventAI.h:142; sessionMotion reads it as a hold.
  waypointsPaused: boolean;
  /** Unit stand state (UNIT_STAND_STATE_*). Cite: ProcessAction ~1157–1159. */
  standState: number;
  // m_reactState — ACTION_T_SET_REACT_STATE. Default AGGRESSIVE. Cite: UnitAI.h ReactStates; ProcessAction
  // ~1206–1209.
  reactState: number;
  // Follow movement enabled (inverse of UNIT_STAT_NO_FOLLOW_MOVEMENT). Cite: UnitAI.cpp SetFollowMovement
  // ~320–328.
  followMovement: boolean;
  // Entry after ACTION_T_UPDATE_TEMPLATE (UpdateEntry). 0 = still original template. Cite: ProcessAction
  // ~1076–1083.
  templateEntry: number;
  /** Force-despawn deadline (session ms); 0 = none. Cite: ForcedDespawn ~1112–1114. */
  forceDespawnAt: number;
  // Temporary faction template id (0 = default/cleared). Cite: ProcessAction SET_FACTION ~730–737. Reaction
  // via domain/creature/faction.ts getFactionReaction when a DataStore is available.
  factionId: number;
  /** Flags controlling when temporary faction restores (evade/respawn). */
  factionFlags: number;
  /** UNIT_FIELD_FLAGS bit mask. Cite: SET/REMOVE_UNIT_FLAG ~888–898. */
  unitFlags: number;
  /** Generic unit field values (SET_UNIT_FIELD). field index → value. */
  unitFields: Record<number, number>;
  /** Combat movement enabled (inverse of UNIT_STAT_NO_COMBAT_MOVEMENT). Default true. */
  combatMovement: boolean;
  /** Display model override (morph). 0 = demorphed / template. Cite: ~739–758. */
  displayId: number;
  /** Morph creature_template entry when set via entry (not model). */
  morphCreatureId: number;
  /** Mount display id (0 = unmounted). Cite: MOUNT ~1122–1138. */
  mountDisplayId: number;
  /** Mount creature entry when mounted by entry. */
  mountCreatureId: number;
  /** Sheath state. Cite: SET_SHEATH ~1107–1109. */
  sheath: number;
  /** Immobilized (rooted) AI state. Cite: SET_IMMOBILIZED_STATE ~1345–1348. */
  immobilized: boolean;
  /** Walk default / chase walk. Cite: SET_WALK ~1331–1338. */
  walkDefault: boolean;
  /** Chase uses run when true (m_chaseRun). */
  chaseRun: boolean;
  /** Movement generator type after CHANGE_MOVEMENT. */
  movementType: number;
  // m_AlreadyCallAssistance — once true, CallForHelp is a no-op and receivers are marked so they
  // do not re-broadcast, stopping the CFH ladder. Cite: Creature.cpp CallAssistance ~2151.
  alreadyCallAssistance: boolean;
  // m_throwAIEventMask — ACTION_T_SET_THROW_MASK bits of AI_EVENT_TYPE. Cite: CreatureEventAI.h:933; ctor
  // CreatureEventAI.cpp:94 (0 until action 46).
  throwAIEventMask: number;
  // m_throwAIEventStep — 0..2 health marks, or 100 after GOT_FULL_HEALTH. Cite: CreatureEventAI.h:933–936;
  // DamageTaken/HealedBy CreatureEventAI.cpp:1841–1895.
  throwAIEventStep: number;
  holders: EventAiScriptHolder[];
}

/** One armed creature_ai_scripts row (timer/conditions + actions). */
export interface EventAiScriptHolder {
  script: CreatureAiScript;
  /** Derived cast-entry shape for shared condition/timer reuse. */
  condition: CreatureCastEntry;
  readyAt: number;
  exhausted: boolean;
  listIndex: number;
}

// Intent yielded when an EventAI action executes (combat applies side effects). Unknown action types
// produce nothing (no-op).
export type EventAiIntent =
  | { kind: 'set_phase'; phase: number }
  // ACTION_T_START_RELAY_SCRIPT (53), 158 DB rows. A positive relayId is the relay id; negative
  // picks a random relay from template -relayId. Cite: CreatureEventAI.cpp:1225-1244.
  | { kind: 'start_relay'; relayId: number; templateId: number; target: number }
  // ACTION_T_KILLED_MONSTER (33), 2 rows: 12296 credits 12297 and 12298 credits 12299 — the kill
  // credit goes to a DIFFERENT entry than the one that died. Cite: ProcessAction case 33.
  | { kind: 'killed_monster'; creatureId: number; target: number }
  /** ACTION_T_PAUSE_WAYPOINTS (51), 1 row (Zixil 6748). Cite: CreatureEventAI.h:142. */
  | { kind: 'pause_waypoints'; pause: boolean }
  // ACTION_T_SET_FACING (59), 2 rows (Zixil 6748, Kum'isha 7917). `reset` restores the spawn orientation;
  // otherwise face the resolved target. Cite: CreatureEventAI.h:150.
  | { kind: 'set_facing'; target: number; reset: boolean }
  | { kind: 'spawn'; creatureId: number; target: number; durationMs: number }
  | {
      kind: 'summon_id';
      creatureId: number;
      target: number;
      spawnId: number;
      placement?: CreatureAiSummon;
    }
  | { kind: 'flee' }
  | { kind: 'cast'; spellId: number; target: number; castFlags: number }
  /** ACTION_T_TEXT / TEXT_NEW — resolved broadcast line for combat feed. */
  | {
      kind: 'text';
      textId: number;
      chatType: number;
      text: string;
      body: string;
      unresolved?: boolean;
    }
  | { kind: 'emote'; emoteId: number }
  | { kind: 'sound'; soundId: number }
  | { kind: 'set_ranged_mode'; enabled: boolean; chaseDistance: number; modeType: number }
  | { kind: 'auto_attack'; enabled: boolean }
  | { kind: 'remove_auras_from_spell'; target: number; spellId: number }
  | { kind: 'call_for_help'; radius: number }
  | { kind: 'force_despawn'; delayMs: number }
  | { kind: 'set_stand_state'; standState: number }
  | { kind: 'set_inst_data'; field: number; value: number }
  | { kind: 'set_death_prevention'; enabled: boolean }
  | { kind: 'update_template'; creatureId: number }
  | { kind: 'set_follow_movement'; enabled: boolean }
  | { kind: 'attack_start'; target: number }
  | { kind: 'throw_ai_event'; eventType: number; radius: number; target: number }
  | { kind: 'set_throw_mask'; mask: number }
  | { kind: 'set_react_state'; reactState: number }
  | { kind: 'despawn_guardians'; entryId: number }
  // S4 tail intents
  | { kind: 'set_faction'; factionId: number; factionFlags: number }
  | { kind: 'morph'; creatureId: number; modelId: number }
  | { kind: 'threat_single'; value: number; target: number; isDirect: boolean }
  | { kind: 'threat_all_pct'; percent: number }
  | { kind: 'quest_event'; questId: number; target: number; rewardGroup: boolean }
  | { kind: 'set_unit_field'; field: number; value: number; target: number }
  | { kind: 'set_unit_flag'; flag: number; target: number }
  | { kind: 'remove_unit_flag'; flag: number; target: number }
  | { kind: 'combat_movement'; enabled: boolean; melee: boolean }
  | { kind: 'evade'; combatOnly: boolean }
  | { kind: 'die' }
  | { kind: 'zone_combat_pulse' }
  | { kind: 'set_sheath'; sheath: number }
  | { kind: 'mount'; creatureId: number; modelId: number }
  | { kind: 'change_movement'; movementType: number; wanderOrPathId: number; flags: number }
  | { kind: 'set_walk'; walkType: number }
  | { kind: 'set_immobilized_state'; apply: boolean; combatOnly: boolean };

/** ACTION_T ids registered in ACTION_HANDLERS (excludes CAST — cast-slot path). */
const NON_CAST_ACTION_TYPES = new Set<number>([
  ACTION_T_START_RELAY_SCRIPT,
  ACTION_T_KILLED_MONSTER,
  ACTION_T_PAUSE_WAYPOINTS,
  ACTION_T_SET_FACING,
  ACTION_T_TEXT,
  ACTION_T_SOUND,
  ACTION_T_EMOTE,
  ACTION_T_SPAWN,
  ACTION_T_AUTO_ATTACK,
  ACTION_T_SET_PHASE,
  ACTION_T_FLEE_FOR_ASSIST,
  ACTION_T_REMOVEAURASFROMSPELL,
  ACTION_T_SUMMON_ID,
  ACTION_T_SET_INST_DATA,
  ACTION_T_UPDATE_TEMPLATE,
  ACTION_T_CALL_FOR_HELP,
  ACTION_T_FORCE_DESPAWN,
  ACTION_T_SET_DEATH_PREVENTION,
  ACTION_T_THROW_AI_EVENT,
  ACTION_T_SET_THROW_MASK,
  ACTION_T_SET_STAND_STATE,
  ACTION_T_SET_REACT_STATE,
  ACTION_T_TEXT_NEW,
  ACTION_T_ATTACK_START,
  ACTION_T_DESPAWN_GUARDIANS,
  ACTION_T_SET_RANGED_MODE,
  ACTION_T_SET_FOLLOW_MOVEMENT,
  // S4 tail
  ACTION_T_SET_FACTION,
  ACTION_T_MORPH_TO_ENTRY_OR_MODEL,
  ACTION_T_RANDOM_SOUND,
  ACTION_T_RANDOM_EMOTE,
  ACTION_T_THREAT_SINGLE,
  ACTION_T_THREAT_ALL_PCT,
  ACTION_T_QUEST_EVENT,
  ACTION_T_SET_UNIT_FIELD,
  ACTION_T_SET_UNIT_FLAG,
  ACTION_T_REMOVE_UNIT_FLAG,
  ACTION_T_COMBAT_MOVEMENT,
  ACTION_T_EVADE,
  ACTION_T_RANDOM_PHASE,
  ACTION_T_RANDOM_PHASE_RANGE,
  ACTION_T_DIE,
  ACTION_T_ZONE_COMBAT_PULSE,
  ACTION_T_SET_SHEATH,
  ACTION_T_MOUNT_TO_ENTRY_OR_MODEL,
  ACTION_T_CHANGE_MOVEMENT,
  ACTION_T_SET_WALK,
  ACTION_T_SET_IMMOBILIZED_STATE,
]);

// True when the script has at least one VE-handled non-CAST action. Pure CAST rows stay on the
// creatureCasts path (no double schedule).
export function scriptHasNonCastEventAiActions(script: CreatureAiScript): boolean {
  for (const a of script.actions ?? []) {
    if (NON_CAST_ACTION_TYPES.has(a.type | 0)) return true;
  }
  return false;
}

// Map raw EventAI script event params → CreatureCastEntry condition/timer fields. Same param layout as ETL
// `buildCastFromAction` / CreatureEventAI.h unions. spellId is a dummy (0) — holders are not cast slots.
export function conditionEntryFromAiScript(script: CreatureAiScript): CreatureCastEntry {
  const eventType = script.eventType | 0;
  const p1 = script.eventParam1 | 0;
  const p2 = script.eventParam2 | 0;
  const p3 = script.eventParam3 | 0;
  const p4 = script.eventParam4 | 0;
  const entry: CreatureCastEntry = {
    spellId: 0,
    scriptId: script.id | 0,
    eventType,
    eventFlags: script.eventFlags | 0,
    chancePct: script.eventChance != null ? script.eventChance | 0 : 100,
    eventInversePhaseMask: script.eventInversePhaseMask,
  };

  const p5 = script.eventParam5 != null ? script.eventParam5 | 0 : 0;

  switch (eventType) {
    case EVENT_T.TIMER_IN_COMBAT:
    case EVENT_T.TIMER_OOC:
    case EVENT_T.TIMER_GENERIC:
      // InitialMin, InitialMax, RepeatMin, RepeatMax — CreatureEventAI.h timer ~626–632
      if (p1 || p2) {
        entry.initialMinMs = p1;
        entry.initialMaxMs = p2 || p1;
      }
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
    case EVENT_T.HP:
    case EVENT_T.TARGET_HP:
      entry.hpPctMax = p1;
      entry.hpPctMin = p2;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
    case EVENT_T.MANA:
    case EVENT_T.TARGET_MANA:
      entry.manaPctMax = p1;
      entry.manaPctMin = p2;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
    case EVENT_T.RANGE:
      entry.rangeMinYd = p1;
      entry.rangeMaxYd = p2;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
    case EVENT_T.OOC_LOS:
      // NoHostile, MaxRange, RepeatMin, RepeatMax — ooc_los ~674–683
      entry.selectMaxRangeYd = p2;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
    case EVENT_T.KILL:
    case EVENT_T.TARGET_CASTING:
      // GetRepeatTimers: params[0]/[1] — CreatureEventAI.cpp ~562–563
      if (p1 || p2) {
        entry.repeatMinMs = p1;
        entry.repeatMaxMs = p2 || p1;
      }
      break;
    case EVENT_T.MISSING_AURA:
    case EVENT_T.TARGET_MISSING_AURA:
    case EVENT_T.AURA:
    case EVENT_T.TARGET_AURA:
      // SpellID, stacks, RepeatMin, RepeatMax — buffed ~743–753
      entry.auraSpellId = p1;
      entry.auraStacks = p2 > 0 ? p2 : 1;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
    case EVENT_T.FRIENDLY_HP:
      // HPDeficit, Radius, RepeatMin, RepeatMax, IsPercent — friendly_hp ~697–704
      entry.friendlyHpDeficit = p1;
      entry.friendlyRadiusYd = p2;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      if (p5) entry.friendlyHpIsPercent = true;
      break;
    case EVENT_T.FRIENDLY_IS_CC:
      // DispelType, Radius, RepeatMin, RepeatMax — friendly_is_cc ~705–712
      entry.friendlyRadiusYd = p2;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
    case EVENT_T.FRIENDLY_MISSING_BUFF:
      // SpellId, Radius, RepeatMin, RepeatMax, InCombat — friendly_buff ~713–721
      entry.friendlyBuffSpellId = p1;
      entry.auraSpellId = p1;
      entry.friendlyRadiusYd = p2;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      entry.friendlyBuffInCombat = p5;
      break;
    case EVENT_T.SUMMONED_UNIT:
    case EVENT_T.SUMMONED_JUST_DIED:
    case EVENT_T.SUMMONED_JUST_DESPAWN:
      // CreatureId, RepeatMin, RepeatMax — GetRepeatTimers params[1]/[2] ~565–567
      entry.summonedCreatureId = p1;
      if (p2 || p3) {
        entry.repeatMinMs = p2;
        entry.repeatMaxMs = p3 || p2;
      }
      break;
    case EVENT_T.RECEIVE_AI_EVENT:
      // AIEventType, Sender-Entry — receiveAIEvent ~754–761
      entry.receiveAiEventType = p1;
      entry.receiveAiSenderEntry = p2;
      break;
    case EVENT_T.RECEIVE_EMOTE:
      entry.receiveEmoteId = p1;
      break;
    case EVENT_T.FACING_TARGET:
      // Position, unused, RepeatMin, RepeatMax — facingTarget ~770–777
      entry.facingBackOrFront = p1;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
    case EVENT_T.SELECT_ATTACKING_TARGET:
      // MinRange, MaxRange, RepeatMin, RepeatMax — selectTarget ~762–769
      entry.selectMinRangeYd = p1;
      entry.selectMaxRangeYd = p2;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
    case EVENT_T.SPELLHIT:
    case EVENT_T.SPELLHIT_TARGET:
      // SpellID, School, RepeatMin, RepeatMax
      entry.spellHitSpellId = p1;
      entry.spellHitSchoolMask = p2;
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
    case EVENT_T.SPELL_CAST:
      entry.spellHitSpellId = p1;
      break;
    default:
      if (p3 || p4) {
        entry.repeatMinMs = p3;
        entry.repeatMaxMs = p4 || p3;
      }
      break;
  }
  return entry;
}

// Merge event-condition params from ai.scripts onto creatureCasts rows by scriptId. The CAST
// convenience bake often omits FRIENDLY_* / FACING; this only copies sourced fields.
export function enrichCastEntriesFromScripts(
  entries: readonly CreatureCastEntry[],
  scripts: readonly CreatureAiScript[] | undefined | null,
): CreatureCastEntry[] {
  if (!scripts || scripts.length === 0) return entries as CreatureCastEntry[];
  const byId = new Map<number, CreatureAiScript>();
  for (const s of scripts) byId.set(s.id | 0, s);
  return entries.map((e) => {
    const sid = (e.scriptId ?? 0) | 0;
    if (!sid) return e;
    const script = byId.get(sid);
    if (!script) return e;
    const cond = conditionEntryFromAiScript(script);
    // Cast-row spell/target/flags/chance win; condition fills missing event fields.
    return {
      ...cond,
      ...e,
      // Prefer script-derived condition fields when cast bake omitted them:
      friendlyHpDeficit: e.friendlyHpDeficit ?? cond.friendlyHpDeficit,
      friendlyRadiusYd: e.friendlyRadiusYd ?? cond.friendlyRadiusYd,
      friendlyHpIsPercent: e.friendlyHpIsPercent ?? cond.friendlyHpIsPercent,
      friendlyBuffSpellId: e.friendlyBuffSpellId ?? cond.friendlyBuffSpellId,
      friendlyBuffInCombat: e.friendlyBuffInCombat ?? cond.friendlyBuffInCombat,
      facingBackOrFront: e.facingBackOrFront ?? cond.facingBackOrFront,
      selectMinRangeYd: e.selectMinRangeYd ?? cond.selectMinRangeYd,
      selectMaxRangeYd: e.selectMaxRangeYd ?? cond.selectMaxRangeYd,
      receiveAiEventType: e.receiveAiEventType ?? cond.receiveAiEventType,
      receiveAiSenderEntry: e.receiveAiSenderEntry ?? cond.receiveAiSenderEntry,
      receiveEmoteId: e.receiveEmoteId ?? cond.receiveEmoteId,
      summonedCreatureId: e.summonedCreatureId ?? cond.summonedCreatureId,
      spellHitSpellId: e.spellHitSpellId ?? cond.spellHitSpellId,
      spellHitSchoolMask: e.spellHitSchoolMask ?? cond.spellHitSchoolMask,
      auraSpellId: e.auraSpellId ?? cond.auraSpellId,
      auraStacks: e.auraStacks ?? cond.auraStacks,
      initialMinMs: e.initialMinMs ?? cond.initialMinMs,
      initialMaxMs: e.initialMaxMs ?? cond.initialMaxMs,
      hpPctMax: e.hpPctMax ?? cond.hpPctMax,
      hpPctMin: e.hpPctMin ?? cond.hpPctMin,
      manaPctMax: e.manaPctMax ?? cond.manaPctMax,
      manaPctMin: e.manaPctMin ?? cond.manaPctMin,
      rangeMinYd: e.rangeMinYd ?? cond.rangeMinYd,
      rangeMaxYd: e.rangeMaxYd ?? cond.rangeMaxYd,
      eventInversePhaseMask: e.eventInversePhaseMask ?? cond.eventInversePhaseMask,
    };
  });
}

// Build CAST-only CreatureCastEntry rows from full ai.scripts when creatureCasts is absent,
// carrying eventInversePhaseMask so phase gating works. Cite: ACTION_T_CAST param1..3.
export function castEntriesFromAiScripts(scripts: readonly CreatureAiScript[]): CreatureCastEntry[] {
  const out: CreatureCastEntry[] = [];
  for (const script of scripts) {
    for (const action of script.actions ?? []) {
      if ((action.type | 0) !== ACTION_T_CAST) continue;
      const spellId = action.param1 | 0;
      if (spellId <= 0) continue;
      const base = conditionEntryFromAiScript(script);
      const entry: CreatureCastEntry = {
        ...base,
        spellId,
      };
      if ((action.param2 | 0) !== 0) entry.target = action.param2 | 0;
      if ((action.param3 | 0) !== 0) entry.castFlags = action.param3 | 0;
      out.push(entry);
    }
  }
  return out;
}

// Map creature_spell_list rows to TIMER_IN_COMBAT-shaped cast entries on the same scheduler path
// as EventAI timed casts. Never invents timers. Cite: UnitAI.cpp UpdateSpellLists ~1186–1293.
export function castEntriesFromSpellList(
  list: readonly CreatureSpellListEntry[] | undefined | null,
  rng?: Rng,
  rangedMode = false,
): CreatureCastEntry[] {
  if (!list || list.length === 0) return [];
  // Position order — priority when Probability sum==0; Availability draw order.
  const sorted = [...list].sort((a, b) => {
    const pa = (a.position | 0) - (b.position | 0);
    if (pa !== 0) return pa;
    return (a.spellId | 0) - (b.spellId | 0);
  });
  const out: CreatureCastEntry[] = [];
  // The two per-update rolls are ONE roll each for the whole list, not per spell, and are read at
  // ARM time: the 1,200 ms poll gates WHEN a slot fires, not whether it is armed.
  const supportRoll = rng ? rng.int(0, 100) : 0;
  const rangedRoll = rng ? rng.int(0, 100) : 0;
  for (const row of sorted) {
    const spellId = row.spellId | 0;
    if (spellId <= 0) continue;
    const listFlags = row.flags | 0;
    // SPELL_LIST_FLAG_SUPPORT_ACTION (1): skip when the one support roll beat the list's
    // ChanceSupportAction. Cite: UnitAI.cpp:1214-1216.
    if ((listFlags & SPELL_LIST_FLAG.SUPPORT_ACTION) !== 0) {
      if (rng && supportRoll > (row.chanceSupportAction ?? 0)) continue;
    }
    // SPELL_LIST_FLAG_RANGED_ACTION (2): base chance in ranged mode, chance - 50 in melee — the C++ comment
    // says it models chaincasting at range and mostly not in melee. Cite: UnitAI.cpp:1227-1230.
    if ((listFlags & SPELL_LIST_FLAG.RANGED_ACTION) !== 0) {
      const base = row.chanceRangedAttack ?? 0;
      const chance = rangedMode ? base : Math.max(base - 50, 0);
      if (rng && rangedRoll > chance) continue;
    }
    // Availability gate — Creature.cpp SetSpellList ~2397–2404.
    // urand(0, 100) > Availability → spell removed for this list lifetime.
    const availability = row.availability != null ? (row.availability | 0) : 100;
    if (availability < 100) {
      if (!rng) continue; // without RNG, fail closed for partial-availability rows
      // rng.int is inclusive; matches urand(0, 100).
      if (rng.int(0, 100) > availability) continue;
    }
    const entry: CreatureCastEntry = {
      spellId,
      eventType: EVENT_T.TIMER_IN_COMBAT,
      initialMinMs: row.initialMin != null ? (row.initialMin | 0) : 0,
      initialMaxMs:
        row.initialMax != null
          ? (row.initialMax | 0)
          : row.initialMin != null
            ? (row.initialMin | 0)
            : 0,
      repeatMinMs: row.repeatMin != null ? (row.repeatMin | 0) : 0,
      repeatMaxMs:
        row.repeatMax != null
          ? (row.repeatMax | 0)
          : row.repeatMin != null
            ? (row.repeatMin | 0)
            : 0,
      // Bare entries without eventFlags keep repeat behavior (markCreatureCastUsed).
      targetSpace: 'spell_list',
    };
    if (row.targetId != null) entry.target = row.targetId | 0;
    if (row.probability != null) entry.spellListProbability = row.probability | 0;
    // SPELL_LIST_FLAG_RANGED_ACTION also makes the row a MAIN spell (AddMainSpell), which the
    // engine already paces like a primary attack. Cite: UnitAI.cpp:1174-1177.
    if ((listFlags & SPELL_LIST_FLAG.RANGED_ACTION) !== 0) {
      entry.castFlags = (entry.castFlags ?? 0) | CAST_FLAG.MAIN_SPELL;
    }
    // SPELL_LIST_FLAG_NON_BLOCKING (8, 1 row): cast outside the one-action roll, i.e. it never
    // competes for the slot. Cite: UnitAI.cpp:1265-1269.
    if ((listFlags & SPELL_LIST_FLAG.NON_BLOCKING) !== 0) entry.nonBlocking = true;
    // SPELL_LIST_FLAG_CATEGORY_COOLDOWN (4, 4 rows on one list — the Four Horsemen, already
    // hand-noted at naxxramas.ts:100). Cite: Creature.cpp:1553.
    if ((listFlags & SPELL_LIST_FLAG.CATEGORY_COOLDOWN) !== 0) entry.categoryCooldown = true;
    // A row ScriptId starts a relay when the cast succeeds — the same producer P17 wired.
    // Cite: UnitAI.cpp:1259 ScriptsStart(SCRIPT_TYPE_RELAY, scriptId, …).
    if (row.scriptId != null && (row.scriptId | 0) > 0) entry.relayScriptId = row.scriptId | 0;
    // Carried, not evaluated here: UpdateSpellLists re-checks the gate every tick, so it
    // belongs at pick time. -1 and 0 both mean ungated. Cite: UnitAI.cpp:1218.
    const cc = row.combatCondition != null ? (row.combatCondition | 0) : 0;
    if (cc > 0) entry.combatCondition = cc;
    // Probability is the pick WEIGHT, drawn by rollSpellListSlot among the rows eligible on
    // one 1200 ms poll (pickCreatureCast). ChancePct is EventAI 0–100 — never map weight→%.
    out.push(entry);
  }
  return out;
}

// Merge EventAI cast entries with spell-list timer slots. Spell-list rows append after EventAI (listIndex
// order: scripts first, then Position). Cite: UnitAI UpdateSpellLists runs alongside EventAI ProcessEvents.
export function mergeCastEntriesWithSpellList(
  base: readonly CreatureCastEntry[],
  spellList: readonly CreatureSpellListEntry[] | undefined | null,
  rng?: Rng,
  rangedMode = false,
): CreatureCastEntry[] {
  const fromList = castEntriesFromSpellList(spellList, rng, rangedMode);
  if (fromList.length === 0) return [...base];
  return [...base, ...fromList];
}

/** Cite: CreatureEventAI.cpp:1122–1136; ScriptMgr.cpp:2409–2437 Mount/Unmount. */
export function applyMountToEntryOrModel(
  state: { mountCreatureId?: number; mountDisplayId?: number; mounted?: boolean },
  creatureId: number,
  modelId: number,
): { kind: 'mount'; creatureId: number; modelId: number } {
  if (creatureId || modelId) {
    state.mountCreatureId = creatureId;
    state.mountDisplayId = modelId;
    state.mounted = true;
  } else {
    state.mountCreatureId = 0;
    state.mountDisplayId = 0;
    state.mounted = false;
  }
  return { kind: 'mount', creatureId, modelId };
}

// Arm EventAI holders for non-CAST actions — phase, spawn, summon, flee. TIMER_OOC and FRIENDLY_*
// are armed and EVENT_HANDLERS gate them at pick time. Cite: JustRespawned timer init ~1406.
export function emptyEventAiState(): CreatureEventAiState {
  return {
    phase: 0,
    fleeing: false,
    fleeUntil: 0,
    meleeEnabled: true,
    rangedMode: false,
    rangedChaseDistance: 0,
    rangedModeType: RANGE_MODE_TYPE_NONE,
    deathPrevention: false,
    deathPreventionFired: false,
    waypointsPaused: false,
    standState: 0,
    reactState: REACT_STATE.AGGRESSIVE,
    followMovement: true,
    templateEntry: 0,
    forceDespawnAt: 0,
    factionId: 0,
    factionFlags: 0,
    unitFlags: 0,
    unitFields: {},
    combatMovement: true,
    displayId: 0,
    morphCreatureId: 0,
    mountDisplayId: 0,
    mountCreatureId: 0,
    sheath: SHEATH_STATE.MELEE,
    immobilized: false,
    walkDefault: false,
    chaseRun: true,
    movementType: 0,
    alreadyCallAssistance: false,
    throwAIEventMask: 0,
    throwAIEventStep: 0,
    holders: [],
  };
}

// CreatureEventAI::DamageTaken health-step machine. Mutates throwAIEventStep; returns AIEventType to
// SendAIEventAround, or null. Cite: CreatureEventAI.cpp:1841–1871 (HEALTH_STEPS 90/50/10, highest mark).
export function processThrowAiEventDamageTaken(
  state: CreatureEventAiState,
  healthBefore: number,
  damage: number,
  maxHealth: number,
): number | null {
  const healthSteps = AI_EVENT_HEALTH_STEP_PCTS;
  const sendEvent = AI_EVENT_HEALTH_STEP_TYPES;
  const healthStepCount = healthSteps.length;
  let step = state.throwAIEventStep !== 100 ? state.throwAIEventStep | 0 : 0;
  if (step >= healthStepCount) return null;

  const maxHp = Math.max(1, maxHealth | 0);
  const newHealthPercent = ((healthBefore - damage) * 100) / maxHp;
  if (newHealthPercent > healthSteps[step]!) return null;

  // Highest reached mark that has a mask bit (search from CRITICAL toward current).
  for (let i = healthStepCount - 1; i > step; --i) {
    const ev = sendEvent[i]!;
    if (newHealthPercent < healthSteps[i]! && (state.throwAIEventMask & (1 << ev)) !== 0) {
      step = i;
      break;
    }
  }

  const eventType = sendEvent[step]!;
  let toSend: number | null = null;
  if ((state.throwAIEventMask & (1 << eventType)) !== 0) toSend = eventType;
  state.throwAIEventStep = step + 1;
  return toSend;
}

// CreatureEventAI::HealedBy — GOT_FULL_HEALTH once when a heal would fill. Cite:
// CreatureEventAI.cpp:1885–1895 (step becomes 100 even if bit unset).
export function processThrowAiEventHealedBy(
  state: CreatureEventAiState,
  healthBefore: number,
  healedAmount: number,
  maxHealth: number,
): number | null {
  if (state.throwAIEventStep === 100) return null;
  const maxHp = Math.max(1, maxHealth | 0);
  if (healthBefore + healedAmount < maxHp) return null;
  let toSend: number | null = null;
  if ((state.throwAIEventMask & (1 << AI_EVENT_TYPE.GOT_FULL_HEALTH)) !== 0) {
    toSend = AI_EVENT_TYPE.GOT_FULL_HEALTH;
  }
  state.throwAIEventStep = 100;
  return toSend;
}

/** JustDied auto-throw bit 0. Cite: CreatureEventAI.cpp:1492–1493. */
export function shouldThrowAiEventJustDied(state: CreatureEventAiState): boolean {
  return (state.throwAIEventMask & (1 << AI_EVENT_TYPE.JUST_DIED)) !== 0;
}

export function armEventAiState(
  scripts: readonly CreatureAiScript[] | undefined | null,
  rng?: Rng,
): CreatureEventAiState {
  const base = emptyEventAiState();
  if (!scripts || scripts.length === 0) return base;
  let listIndex = 0;
  for (const script of scripts) {
    if (!scriptHasNonCastEventAiActions(script)) continue;
    const et = script.eventType | 0;
    const condition = conditionEntryFromAiScript(script);
    let readyAt = 0;
    if (
      et === EVENT_T.TIMER_IN_COMBAT ||
      et === EVENT_T.TIMER_OOC ||
      et === EVENT_T.TIMER_GENERIC
    ) {
      readyAt = rollTimer(
        condition.initialMinMs ?? 0,
        condition.initialMaxMs ?? condition.initialMinMs ?? 0,
        rng,
      );
    }
    base.holders.push({
      script,
      condition,
      readyAt,
      exhausted: false,
      listIndex: listIndex++,
    });
  }
  return base;
}

// Pick next ready EventAI holder (phase + conditions + timer). Does not roll event_chance. Deterministic:
// lowest readyAt, then listIndex, then script.id.
export function pickEventAiHolder(
  state: CreatureEventAiState,
  ctx: Omit<CastPickContext, 'spellReady' | 'canCast'>,
): EventAiScriptHolder | null {
  let best: EventAiScriptHolder | null = null;
  const phase = state.phase | 0;
  for (const holder of state.holders) {
    if (holder.exhausted) continue;
    if (ctx.t < holder.readyAt) continue;
    if (eventPhaseBlocked(holder.script.eventInversePhaseMask ?? holder.condition.eventInversePhaseMask, phase)) {
      continue;
    }
    if (!eventConditionsOk(holder.condition, { ...ctx, phase, spellReady: () => true, canCast: () => true })) {
      continue;
    }
    if (!best || compareEventHolders(holder, best) < 0) best = holder;
  }
  return best;
}

function compareEventHolders(a: EventAiScriptHolder, b: EventAiScriptHolder): number {
  if (a.readyAt !== b.readyAt) return a.readyAt - b.readyAt;
  if (a.listIndex !== b.listIndex) return a.listIndex - b.listIndex;
  return (a.script.id | 0) - (b.script.id | 0);
}

// event_chance gate for a full script row (same formula as cast chance). Cite: CreatureEventAI.cpp
// ProcessEvent ~607–612.
export function rollEventAiChance(script: CreatureAiScript, rng?: Rng): boolean {
  const chance = script.eventChance != null ? script.eventChance | 0 : 100;
  if (chance >= 100) return true;
  if (chance <= 0) return false;
  if (!rng) return false;
  return rng.int(0, 99) < chance;
}

// Process up to 3 actions on a fired event, mutating phase, fleeing and flags for pure-domain
// actions and yielding intents for combat. CAST is skipped — cast slots handle it.
export function processEventAiActions(
  holder: EventAiScriptHolder,
  state: CreatureEventAiState,
  opts: {
    t: number;
    summons?: readonly CreatureAiSummon[] | null;
    /** Flee duration when DoFlee(0) — default CREATURE_FAMILY_FLEE_DELAY_MS. */
    fleeDelayMs?: number;
    rng?: Rng;
    /** Speaker name for TEXT feed lines (creature name). */
    speakerName?: string;
  },
): EventAiIntent[] {
  const intents: EventAiIntent[] = [];
  const summonById = new Map<number, CreatureAiSummon>();
  for (const s of opts.summons ?? []) summonById.set(s.id | 0, s);

  for (const action of holder.script.actions ?? []) {
    const intent = processOneAction(action, state, {
      t: opts.t,
      summonById,
      fleeDelayMs: opts.fleeDelayMs ?? CREATURE_FAMILY_FLEE_DELAY_MS,
      rng: opts.rng,
      speakerName: opts.speakerName ?? 'Creature',
    });
    if (intent) intents.push(intent);
  }
  return intents;
}

/** Context passed to ACTION_HANDLERS while processing one script action. */
export interface ActionHandlerOpts {
  t: number;
  summonById: ReadonlyMap<number, CreatureAiSummon>;
  fleeDelayMs: number;
  rng?: Rng;
  speakerName: string;
}

export type ActionHandler = (
  action: CreatureAiAction,
  state: CreatureEventAiState,
  opts: ActionHandlerOpts,
) => EventAiIntent | null;

function resolveTextIntent(
  textId: number,
  speakerName: string,
): EventAiIntent | null {
  if (!textId) return null;
  const row = lookupEventAiText(textId);
  if (!row) {
    // Unresolved ids are listed in docs/aifid/eventai-texts.json — honest no-op body.
    if (isUnresolvedEventAiTextId(textId)) {
      return {
        kind: 'text',
        textId,
        chatType: 0,
        text: '',
        body: '',
        unresolved: true,
      };
    }
    return {
      kind: 'text',
      textId,
      chatType: 0,
      text: '',
      body: '',
      unresolved: true,
    };
  }
  const formatted = formatEventAiChatLine(speakerName, row);
  return {
    kind: 'text',
    textId,
    chatType: formatted.chatType,
    text: formatted.text,
    body: formatted.body,
  };
}

// Implemented ACTION_T handlers. Literal keys for census parseHandlerTable. Cite: CreatureEventAI.cpp
// ProcessAction per case (file:line in each handler).
export const ACTION_HANDLERS: Record<number, ActionHandler> = {
  // ACTION_T_TEXT ~674–728 — TextId1..3 randomize when multiple present.
  [ACTION_T_TEXT]: (action, _state, opts) => {
    const id0 = action.param1 | 0;
    const id1 = action.param2 | 0;
    const id2 = action.param3 | 0;
    if (!id0) return null;
    const rnd01 = opts.rng ? opts.rng.next() : 0;
    const textId = pickTextIdFromAction(id0, id1, id2, rnd01);
    return resolveTextIntent(textId, opts.speakerName);
  },
  // ACTION_T_START_RELAY_SCRIPT ~1225–1244. param1 is SIGNED: positive a relay id, negative a
  // random-template id. 151 of the 158 DB rows are positive and all their ids exist.
  [ACTION_T_START_RELAY_SCRIPT]: (action) => {
    const raw = action.param1 | 0;
    if (!raw) return null;
    return raw > 0
      ? { kind: 'start_relay', relayId: raw, templateId: 0, target: action.param2 | 0 }
      : { kind: 'start_relay', relayId: 0, templateId: -raw, target: action.param2 | 0 };
  },
  // ACTION_T_KILLED_MONSTER ~ProcessAction case 33 — credit a creature entry, not a quest id.
  [ACTION_T_KILLED_MONSTER]: (action) => {
    const creatureId = action.param1 | 0;
    if (creatureId <= 0) return null;
    return { kind: 'killed_monster', creatureId, target: action.param2 | 0 };
  },
  // ACTION_T_PAUSE_WAYPOINTS — CreatureEventAI.h:142, doPause in param1.
  [ACTION_T_PAUSE_WAYPOINTS]: (action) => ({ kind: 'pause_waypoints', pause: (action.param1 | 0) !== 0 }),
  // ACTION_T_SET_FACING — CreatureEventAI.h:150, param2 0 = set toward target, 1 = reset.
  [ACTION_T_SET_FACING]: (action) => ({
    kind: 'set_facing',
    target: action.param1 | 0,
    reset: (action.param2 | 0) === 1,
  }),
  // ACTION_T_SOUND ~760–761
  [ACTION_T_SOUND]: (action) => {
    const soundId = action.param1 | 0;
    if (!soundId) return null;
    return { kind: 'sound', soundId };
  },
  // ACTION_T_EMOTE ~763–764
  [ACTION_T_EMOTE]: (action) => {
    const emoteId = action.param1 | 0;
    if (!emoteId) return null;
    return { kind: 'emote', emoteId };
  },
  [ACTION_T_CAST]: (action) => ({
    kind: 'cast',
    spellId: action.param1 | 0,
    target: action.param2 | 0,
    castFlags: action.param3 | 0,
  }),
  [ACTION_T_SPAWN]: (action) => ({
    kind: 'spawn',
    creatureId: action.param1 | 0,
    target: action.param2 | 0,
    durationMs: action.param3 | 0,
  }),
  // ACTION_T_AUTO_ATTACK ~900–901 → SetMeleeEnabled
  [ACTION_T_AUTO_ATTACK]: (action, state) => {
    const enabled = (action.param1 | 0) !== 0;
    state.meleeEnabled = enabled;
    return { kind: 'auto_attack', enabled };
  },
  [ACTION_T_SET_PHASE]: (action, state) => {
    const phase = action.param1 | 0;
    state.phase = phase;
    return { kind: 'set_phase', phase };
  },
  [ACTION_T_FLEE_FOR_ASSIST]: (_action, state, opts) => {
    state.fleeing = true;
    state.fleeUntil = opts.t + opts.fleeDelayMs;
    return { kind: 'flee' };
  },
  // ACTION_T_REMOVEAURASFROMSPELL ~971–973 — target, spellId
  [ACTION_T_REMOVEAURASFROMSPELL]: (action) => ({
    kind: 'remove_auras_from_spell',
    target: action.param1 | 0,
    spellId: action.param2 | 0,
  }),
  [ACTION_T_SUMMON_ID]: (action, _state, opts) => {
    const spawnId = action.param3 | 0;
    return {
      kind: 'summon_id',
      creatureId: action.param1 | 0,
      target: action.param2 | 0,
      spawnId,
      placement: opts.summonById.get(spawnId),
    };
  },
  // ACTION_T_SET_INST_DATA ~1044–1054
  [ACTION_T_SET_INST_DATA]: (action) => ({
    kind: 'set_inst_data',
    field: action.param1 | 0,
    value: action.param2 | 0,
  }),
  // ACTION_T_UPDATE_TEMPLATE ~1076–1083
  [ACTION_T_UPDATE_TEMPLATE]: (action, state) => {
    const creatureId = action.param1 | 0;
    if (!creatureId || creatureId === state.templateEntry) return null;
    state.templateEntry = creatureId;
    return { kind: 'update_template', creatureId };
  },
  // ACTION_T_CALL_FOR_HELP ~1102–1105
  [ACTION_T_CALL_FOR_HELP]: (action) => ({
    kind: 'call_for_help',
    radius: action.param1 | 0,
  }),
  // ACTION_T_FORCE_DESPAWN ~1112–1114
  [ACTION_T_FORCE_DESPAWN]: (action, state, opts) => {
    const delayMs = Math.max(0, action.param1 | 0);
    state.forceDespawnAt = opts.t + delayMs;
    return { kind: 'force_despawn', delayMs };
  },
  // ACTION_T_SET_DEATH_PREVENTION ~1117–1119
  [ACTION_T_SET_DEATH_PREVENTION]: (action, state) => {
    const enabled = (action.param1 | 0) !== 0;
    state.deathPrevention = enabled;
    if (enabled) state.deathPreventionFired = false;
    return { kind: 'set_death_prevention', enabled };
  },
  // ACTION_T_THROW_AI_EVENT ~1140–1149
  [ACTION_T_THROW_AI_EVENT]: (action) => ({
    kind: 'throw_ai_event',
    eventType: action.param1 | 0,
    radius: action.param2 | 0,
    target: action.param3 | 0,
  }),
  // ACTION_T_SET_THROW_MASK ~1152–1156 — arms DamageTaken/HealedBy/JustDied auto throws
  [ACTION_T_SET_THROW_MASK]: (action, state) => {
    const mask = action.param1 | 0;
    state.throwAIEventMask = mask;
    return { kind: 'set_throw_mask', mask };
  },
  // ACTION_T_SET_STAND_STATE ~1157–1159
  [ACTION_T_SET_STAND_STATE]: (action, state) => {
    const standState = action.param1 | 0;
    state.standState = standState;
    return { kind: 'set_stand_state', standState };
  },
  // ACTION_T_SET_REACT_STATE ~1206–1209
  [ACTION_T_SET_REACT_STATE]: (action, state) => {
    const reactState = action.param1 | 0;
    state.reactState = reactState;
    return { kind: 'set_react_state', reactState };
  },
  // ACTION_T_TEXT_NEW ~1246–1268 — textId or templateId (template needs ScriptMgr; no payload → no-op)
  [ACTION_T_TEXT_NEW]: (action, _state, opts) => {
    const textId = action.param1 | 0;
    const templateId = action.param3 | 0;
    // Template path: no committed script_string_template payload — honest no-op when only templateId.
    // Cite: ProcessAction ~1258–1262 GetRandomScriptStringFromTemplate.
    if (templateId && !textId) return null;
    if (!textId) return null;
    return resolveTextIntent(textId, opts.speakerName);
  },
  // ACTION_T_ATTACK_START ~1271–1280
  [ACTION_T_ATTACK_START]: (action) => ({
    kind: 'attack_start',
    target: action.param1 | 0,
  }),
  // ACTION_T_DESPAWN_GUARDIANS ~1283–1295
  [ACTION_T_DESPAWN_GUARDIANS]: (action) => ({
    kind: 'despawn_guardians',
    entryId: action.param1 | 0,
  }),
  // ACTION_T_SET_RANGED_MODE ~1298–1307; SetRangedMode(type != TYPE_NONE, chaseDistance, type)
  [ACTION_T_SET_RANGED_MODE]: (action, state) => {
    const modeType = action.param1 | 0;
    const chaseDistance = action.param2 | 0;
    const enabled = modeType !== RANGE_MODE_TYPE_NONE;
    state.rangedMode = enabled;
    state.rangedModeType = modeType;
    state.rangedChaseDistance = enabled ? chaseDistance : 0;
    return { kind: 'set_ranged_mode', enabled, chaseDistance, modeType };
  },
  // ACTION_T_SET_FOLLOW_MOVEMENT ~1366–1367
  [ACTION_T_SET_FOLLOW_MOVEMENT]: (action, state) => {
    const enabled = (action.param1 | 0) !== 0;
    state.followMovement = enabled;
    return { kind: 'set_follow_movement', enabled };
  },

  // ---- SESSION 4 tail — CreatureEventAI.cpp ProcessAction ----

  // ACTION_T_SET_FACTION ~730–737
  [ACTION_T_SET_FACTION]: (action, state) => {
    const factionId = action.param1 | 0;
    const factionFlags = action.param2 | 0;
    state.factionId = factionId;
    state.factionFlags = factionFlags;
    return { kind: 'set_faction', factionId, factionFlags };
  },
  // ACTION_T_MORPH_TO_ENTRY_OR_MODEL ~739–758
  [ACTION_T_MORPH_TO_ENTRY_OR_MODEL]: (action, state) => {
    const creatureId = action.param1 | 0;
    const modelId = action.param2 | 0;
    if (creatureId || modelId) {
      state.morphCreatureId = creatureId;
      state.displayId = modelId;
    } else {
      // DeMorph
      state.morphCreatureId = 0;
      state.displayId = 0;
    }
    return { kind: 'morph', creatureId, modelId };
  },
  // ACTION_T_RANDOM_SOUND ~766–771
  [ACTION_T_RANDOM_SOUND]: (action, _state, opts) => {
    const rnd = opts.rng ? opts.rng.int(0, 2) : 0;
    const soundId = getRandActionParam(rnd, action.param1 | 0, action.param2 | 0, action.param3 | 0);
    // -1 in any field means no output if randomed that field (signed).
    if (soundId < 0 || !soundId) return null;
    return { kind: 'sound', soundId };
  },
  // ACTION_T_RANDOM_EMOTE ~773–778
  [ACTION_T_RANDOM_EMOTE]: (action, _state, opts) => {
    const rnd = opts.rng ? opts.rng.int(0, 2) : 0;
    const emoteId = getRandActionParam(rnd, action.param1 | 0, action.param2 | 0, action.param3 | 0);
    if (emoteId < 0 || !emoteId) return null;
    return { kind: 'emote', emoteId };
  },
  // ACTION_T_THREAT_SINGLE ~828–837
  [ACTION_T_THREAT_SINGLE]: (action) => ({
    kind: 'threat_single',
    value: action.param1 | 0,
    target: action.param2 | 0,
    isDirect: (action.param3 | 0) !== 0,
  }),
  // ACTION_T_THREAT_ALL_PCT ~839–845
  [ACTION_T_THREAT_ALL_PCT]: (action) => ({
    kind: 'threat_all_pct',
    percent: action.param1 | 0,
  }),
  // ACTION_T_QUEST_EVENT ~847–862 — AreaExploredOrEventHappens / group explore.
  [ACTION_T_QUEST_EVENT]: (action) => {
    const questId = action.param1 | 0;
    if (!questId) return null;
    return {
      kind: 'quest_event',
      questId,
      target: action.param2 | 0,
      rewardGroup: (action.param3 | 0) !== 0,
    };
  },
  // ACTION_T_SET_UNIT_FIELD ~873–886
  [ACTION_T_SET_UNIT_FIELD]: (action, state) => {
    const field = action.param1 | 0;
    const value = action.param2 | 0;
    const target = action.param3 | 0;
    // C++ rejects field < OBJECT_END || field >= UNIT_END — UpdateFields.h OBJECT_END=6, UNIT_END=0xb6+6.
    // Cite: ProcessAction ~878–879.
    const OBJECT_END = 6;
    const UNIT_END = 0xb6 + OBJECT_END;
    if (field < OBJECT_END || field >= UNIT_END) return null;
    // Self-target fields stored on AI state (most rows use TARGET_T_SELF=0).
    if (target === 0) {
      state.unitFields[field] = value;
      if (field === UNIT_FIELD.FLAGS) state.unitFlags = value;
    }
    return { kind: 'set_unit_field', field, value, target };
  },
  // ACTION_T_SET_UNIT_FLAG ~888–892
  [ACTION_T_SET_UNIT_FLAG]: (action, state) => {
    const flag = action.param1 | 0;
    const target = action.param2 | 0;
    if (target === 0) state.unitFlags |= flag;
    return { kind: 'set_unit_flag', flag, target };
  },
  // ACTION_T_REMOVE_UNIT_FLAG ~894–898
  [ACTION_T_REMOVE_UNIT_FLAG]: (action, state) => {
    const flag = action.param1 | 0;
    const target = action.param2 | 0;
    if (target === 0) state.unitFlags &= ~flag;
    return { kind: 'remove_unit_flag', flag, target };
  },
  // ACTION_T_COMBAT_MOVEMENT ~903–917
  [ACTION_T_COMBAT_MOVEMENT]: (action, state) => {
    const enabled = (action.param1 | 0) !== 0;
    const melee = (action.param2 | 0) !== 0;
    // C++ returns false (no success) when state already matches and not casting —
    // still emit intent for observability; state write is the contract.
    state.combatMovement = enabled;
    return { kind: 'combat_movement', enabled, melee };
  },
  // ACTION_T_EVADE ~942–946
  [ACTION_T_EVADE]: (action) => ({
    kind: 'evade',
    combatOnly: (action.param1 | 0) !== 0,
  }),
  // ACTION_T_RANDOM_PHASE ~991–993
  [ACTION_T_RANDOM_PHASE]: (action, state, opts) => {
    const rnd = opts.rng ? opts.rng.int(0, 2) : 0;
    const phase = getRandActionParam(rnd, action.param1 | 0, action.param2 | 0, action.param3 | 0);
    state.phase = phase | 0;
    return { kind: 'set_phase', phase: state.phase };
  },
  // ACTION_T_RANDOM_PHASE_RANGE ~995–999
  [ACTION_T_RANDOM_PHASE_RANGE]: (action, state, opts) => {
    const phaseMin = action.param1 | 0;
    const phaseMax = action.param2 | 0;
    if (phaseMax <= phaseMin) return null;
    const rnd = opts.rng ? opts.rng.int(0, 0x7fffffff) : 0;
    const phase = randomPhaseInRange(rnd, phaseMin, phaseMax);
    if (phase == null) return null;
    state.phase = phase;
    return { kind: 'set_phase', phase };
  },
  // ACTION_T_DIE ~1085–1093 Suicide()
  [ACTION_T_DIE]: () => ({ kind: 'die' }),
  // ACTION_T_ZONE_COMBAT_PULSE ~1095–1100
  [ACTION_T_ZONE_COMBAT_PULSE]: () => ({ kind: 'zone_combat_pulse' }),
  // ACTION_T_SET_SHEATH ~1107–1109
  [ACTION_T_SET_SHEATH]: (action, state) => {
    const sheath = action.param1 | 0;
    state.sheath = sheath;
    return { kind: 'set_sheath', sheath };
  },
  // ACTION_T_MOUNT_TO_ENTRY_OR_MODEL ~1122–1138
  [ACTION_T_MOUNT_TO_ENTRY_OR_MODEL]: (action, state) =>
    applyMountToEntryOrModel(state, action.param1 | 0, action.param2 | 0),
  // ACTION_T_CHANGE_MOVEMENT ~1162–1204
  [ACTION_T_CHANGE_MOVEMENT]: (action, state) => {
    const movementType = action.param1 | 0;
    const wanderOrPathId = action.param2 | 0;
    const flags = action.param3 | 0;
    state.movementType = movementType;
    return { kind: 'change_movement', movementType, wanderOrPathId, flags };
  },
  // ACTION_T_SET_WALK ~1331–1338
  [ACTION_T_SET_WALK]: (action, state) => {
    const walkType = action.param1 | 0;
    switch (walkType) {
      case WALK_SETTING.WALK_DEFAULT:
        state.walkDefault = true;
        break;
      case WALK_SETTING.RUN_DEFAULT:
        state.walkDefault = false;
        break;
      case WALK_SETTING.WALK_CHASE:
        state.chaseRun = false;
        break;
      case WALK_SETTING.RUN_CHASE:
        state.chaseRun = true;
        break;
      default:
        break;
    }
    return { kind: 'set_walk', walkType };
  },
  // ACTION_T_SET_IMMOBILIZED_STATE ~1345–1348
  [ACTION_T_SET_IMMOBILIZED_STATE]: (action, state) => {
    const apply = (action.param1 | 0) !== 0;
    const combatOnly = (action.param2 | 0) !== 0;
    state.immobilized = apply;
    return { kind: 'set_immobilized_state', apply, combatOnly };
  },
};

function processOneAction(
  action: CreatureAiAction,
  state: CreatureEventAiState,
  opts: ActionHandlerOpts,
): EventAiIntent | null {
  const type = action.type | 0;
  if (type === 0) return null; // ACTION_T_NONE
  const handler = ACTION_HANDLERS[type];
  if (!handler) return null;
  return handler(action, state, opts);
}

// Fire holders whose eventType matches when their EVENT_HANDLERS condition passes — the lifecycle
// pulses C++ enqueues from hooks rather than the periodic poll. Cite: EnterEvadeMode ~1478.
export function pulseEventAi(
  state: CreatureEventAiState,
  eventType: number,
  ctx: Omit<CastPickContext, 'spellReady' | 'canCast'>,
  opts: {
    rng?: Rng;
    summons?: readonly CreatureAiSummon[] | null;
    fleeDelayMs?: number;
    speakerName?: string;
  } = {},
): EventAiIntent[] {
  const out: EventAiIntent[] = [];
  const phase = state.phase | 0;
  for (const holder of state.holders) {
    if (holder.exhausted) continue;
    if ((holder.script.eventType | 0) !== eventType) continue;
    if (eventPhaseBlocked(holder.script.eventInversePhaseMask ?? holder.condition.eventInversePhaseMask, phase)) {
      continue;
    }
    if (!eventConditionsOk(holder.condition, { ...ctx, phase, spellReady: () => true, canCast: () => true })) {
      continue;
    }
    if (!rollEventAiChance(holder.script, opts.rng)) {
      markEventAiUsed(holder, ctx.t, opts.rng);
      continue;
    }
    const intents = processEventAiActions(holder, state, {
      t: ctx.t,
      summons: opts.summons,
      fleeDelayMs: opts.fleeDelayMs,
      rng: opts.rng,
      speakerName: opts.speakerName,
    });
    markEventAiUsed(holder, ctx.t, opts.rng);
    out.push(...intents);
  }
  return out;
}

// After an event fires (success or chance fail), re-arm / exhaust like markCreatureCastUsed. Cite:
// ResetEvent ~573–585.
export function markEventAiUsed(holder: EventAiScriptHolder, t: number, rng?: Rng): void {
  // Reuse cast-slot re-arm by projecting holder onto a temporary slot.
  const slot: CreatureCastSlot = {
    entry: holder.condition,
    spell: { id: 0 } as SpellDef,
    readyAt: holder.readyAt,
    exhausted: holder.exhausted,
    listIndex: holder.listIndex,
    fires: 0,
  };
  markCreatureCastUsed(slot, t, rng);
  holder.readyAt = slot.readyAt;
  holder.exhausted = slot.exhausted;
}

/** Clear flee when duration elapsed. Cite: UnitAI.cpp TimedFleeingEnded ~819–827. */
export function tickEventAiFlee(state: CreatureEventAiState, t: number): void {
  if (state.fleeing && state.fleeUntil > 0 && t >= state.fleeUntil) {
    state.fleeing = false;
    state.fleeUntil = 0;
  }
}

// Step EventAI once: pick one ready holder, roll chance, process actions, mark used. Returns intents for
// combat. At most one event per call (combat may loop).
export function stepEventAi(
  state: CreatureEventAiState,
  ctx: Omit<CastPickContext, 'spellReady' | 'canCast'>,
  opts: {
    rng?: Rng;
    summons?: readonly CreatureAiSummon[] | null;
    fleeDelayMs?: number;
    speakerName?: string;
  } = {},
): EventAiIntent[] {
  tickEventAiFlee(state, ctx.t);
  const holder = pickEventAiHolder(state, ctx);
  if (!holder) return [];
  if (!rollEventAiChance(holder.script, opts.rng)) {
    markEventAiUsed(holder, ctx.t, opts.rng);
    return [];
  }
  const intents = processEventAiActions(holder, state, {
    t: ctx.t,
    summons: opts.summons,
    fleeDelayMs: opts.fleeDelayMs,
    rng: opts.rng,
    speakerName: opts.speakerName,
  });
  markEventAiUsed(holder, ctx.t, opts.rng);
  // One SpellHit is one enqueue: spend the pulse so a repeatable row with no repeat timer cannot
  // replay the same hit on the caller's next step. Cite: CreatureEventAI.cpp:1670.
  const fired = holder.condition.eventType;
  if (fired === EVENT_T.SPELLHIT || fired === EVENT_T.SPELLHIT_TARGET) ctx.spellHitId = undefined;
  return intents;
}
