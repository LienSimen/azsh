// ScriptDev host — ticks IR against the existing combat cast machinery: IR timers become
// CreatureCastEntry, targets map to TARGET_T, and instance SetData couples to the door store.

import type { CreatureCastEntry } from '../../data/schema.ts';
import { CAST_FLAG, EFLAG_RANDOM_ACTION, EFLAG_REPEATABLE, EVENT_T, SPELL_LIST_TARGET, TARGET_T } from '../creature/creatureAi.ts';
import { applyDireMaulOnPlayerEnter } from './direMaul.ts';
import type {
  ScriptDevAction,
  ScriptDevAddDeathHook,
  ScriptDevAuraScript,
  ScriptDevCastPlan,
  ScriptDevDataGate,
  ScriptDevIR,
  ScriptDevRuntimeState,
  ScriptDevSelectOpts,
  ScriptDevTargetMode,
  ScriptDevTimer,
} from './types.ts';
import { ENCOUNTER_STATE, INSTANCE_DATA, SCRIPTED_AI_EVADE_COOLDOWN_MS } from './types.ts';
import {
  TYPE_PROTECTORS,
  applyProtectorsSetData,
} from './sunkenTemple.ts';
import {
  TYPE_FOUR_HORSEMEN,
  applyHorsemenSetData,
} from './instanceRaids.ts';

export type { ScriptDevCastPlan } from './types.ts';

// Target mapping → EventAI TARGET_T (selectTarget source 'eventai')

// Map ScriptDev SelectAttackingTarget patterns to TARGET_T_*. `playerOnly` is SELECT_FLAG_PLAYER
// on the random pool, not CAST_PLAYER_ONLY on the victim; `classId` is Unit::getClass().
export function targetModeToTargetT(
  mode: ScriptDevTargetMode,
  select?: ScriptDevSelectOpts,
): number {
  const player = select?.playerOnly === true;
  switch (mode) {
    case 'self':
      return TARGET_T.SELF;
    case 'victim':
      return TARGET_T.HOSTILE;
    case 'hostile_random':
      if (player) return TARGET_T.HOSTILE_RANDOM_PLAYER;
      if (select?.powerMana) return TARGET_T.HOSTILE_RANDOM_MANA;
      return TARGET_T.HOSTILE_RANDOM;
    case 'hostile_random_not_top':
      return player ? TARGET_T.HOSTILE_RANDOM_NOT_TOP_PLAYER : TARGET_T.HOSTILE_RANDOM_NOT_TOP;
    case 'hostile_random_player':
      return TARGET_T.HOSTILE_RANDOM_PLAYER;
    case 'hostile_random_not_top_player':
      return TARGET_T.HOSTILE_RANDOM_NOT_TOP_PLAYER;
    case 'hostile_random_mana':
      return TARGET_T.HOSTILE_RANDOM_MANA;
    case 'hostile_random_not_in_melee':
      // No dedicated TARGET_T — use HOSTILE_RANDOM + select.notInMelee castFlags path.
      return TARGET_T.HOSTILE_RANDOM;
    case 'friendly_dispellable':
      // Resolved in the SPELL_LIST target space (timerToCastEntry stamps targetSpace), where the
      // dispellable-friendly pool already lives. Cite: UnitAI.cpp:1310; CreatureSpellList.h:34-44.
      return SPELL_LIST_TARGET.DISPELLABLE_FRIENDLY;
    case 'friendly_missing_buff':
      // DoFindFriendlyMissingBuff; the aura checked is the ROW's own cast spell.
      // Cite: UnitAI.cpp:737-761; CreatureSpellList.h:34-44.
      return SPELL_LIST_TARGET.FRIENDLY_MISSING_BUFF;
    case 'hostile_random_player_not_aura':
      // creature_spell_targeting 121 is Param3 = PLAYER|NOT_AURA, and the aura it checks is the
      // ROW's own cast spell. Cite: aiTargeting.ts:118; meetsSelectFlags NOT_AURA.
      return SPELL_LIST_TARGET_RANDOM_PLAYER_NOT_AURA;
    default:
      return TARGET_T.HOSTILE;
  }
}

// creature_spell_targeting 121 — "Attack - random player aura not present". Cite: aiTargeting.ts:118.
const SPELL_LIST_TARGET_RANDOM_PLAYER_NOT_AURA = 121;

/** Target modes that resolve in the creature_spell_list space rather than the EventAI one. */
const SPELL_LIST_SPACE_MODES = new Set<ScriptDevTargetMode>([
  'friendly_dispellable',
  'friendly_missing_buff',
  'hostile_random_player_not_aura',
]);

function timerCastFlags(timer: ScriptDevTimer): number {
  let flags = timer.castFlags ?? 0;
  // Do NOT stamp CAST_PLAYER_ONLY from select.playerOnly: that flag is checked against the current
  // victim at pick time, so a pet on top of threat used to skip Anastari's Possess forever.
  return flags;
}

// Convert one IR timer to a CreatureCastEntry. Timers always carry TIMER_IN_COMBAT + REPEATABLE so
// specials never fall through to a bare kit; a `creature_spell_list` cite marks a DB-list row.
const SPELL_LIST_CITE = /creature_spell_list\s+\d+:\d+/;

export function timerToCastEntry(timer: ScriptDevTimer, phase?: number): CreatureCastEntry {
  // Always TIMER_IN_COMBAT so armCreatureCastSlots honours initialMinMs/Max, with optional hpPct*
  // gating percentBandOk. `oneShot` omits EFLAG_REPEATABLE so markCreatureCastUsed exhausts it.
  const entry: CreatureCastEntry = {
    spellId: timer.spellId,
    eventType: EVENT_T.TIMER_IN_COMBAT,
    initialMinMs: timer.initialMinMs,
    initialMaxMs: timer.initialMaxMs,
    repeatMinMs: timer.repeatMinMs,
    repeatMaxMs: timer.repeatMaxMs,
    eventFlags: timer.oneShot ? 0 : EFLAG_REPEATABLE,
    target: targetModeToTargetT(timer.target, timer.select),
    // A spell-list target id is not a TARGET_T_*: the two spaces overlap on 0-7, so the row has to
    // say which one it means. Cite: UnitAI.cpp:1295-1361.
    targetSpace: SPELL_LIST_SPACE_MODES.has(timer.target) ? 'spell_list' : 'eventai',
  };
  // A timer whose SOURCE is a creature_spell_list row is paced by UpdateSpellLists, not by
  // ResetCombatAction, so the citation is the discriminator and smoke counts the matches.
  if (SPELL_LIST_CITE.test(timer.cite)) entry.spellListPolled = true;
  if (timer.startDisabled) entry.startDisabled = true;
  if ((timer.combatCondition ?? 0) > 0) entry.combatCondition = (timer.combatCondition ?? 0) | 0;
  if (timer.gate) {
    entry.instanceDataField = timer.gate.field | 0;
    if (timer.gate.equals != null) entry.instanceDataEquals = timer.gate.equals | 0;
    if (timer.gate.notEquals != null) entry.instanceDataNotEquals = timer.gate.notEquals | 0;
  }
  if (timer.requireVictimNotInMelee) entry.requireVictimNotInMelee = true;
  if (timer.requireMeleeTargetExists) entry.requireMeleeTargetExists = true;
  if (timer.pollOnly) entry.pollOnly = true;
  if ((timer.maxFires ?? 0) > 0) entry.maxFires = (timer.maxFires ?? 0) | 0;
  if ((timer.highestHpTopThreat ?? 0) > 0) {
    entry.highestHpTopThreat = (timer.highestHpTopThreat ?? 0) | 0;
  }
  if (timer.rotateSpellIds?.length) {
    entry.rotateSpellIds = timer.rotateSpellIds.map((id) => id | 0);
    if (timer.waveMinCount != null) entry.waveMinCount = timer.waveMinCount | 0;
    if (timer.waveMaxCount != null) entry.waveMaxCount = timer.waveMaxCount | 0;
    if (timer.intraWaveMinMs != null) entry.intraWaveMinMs = timer.intraWaveMinMs | 0;
    if (timer.intraWaveMaxMs != null) entry.intraWaveMaxMs = timer.intraWaveMaxMs | 0;
  }
  if (timer.pickPerSpawnSpellIds?.length) {
    entry.pickPerSpawnSpellIds = timer.pickPerSpawnSpellIds.map((id) => id | 0);
  }
  if ((timer.friendlyRadiusYd ?? 0) > 0) entry.friendlyRadiusYd = timer.friendlyRadiusYd;
  if (timer.friendlyFallbackSelf) entry.friendlyFallbackSelf = true;
  if ((timer.friendlyLowestHpYd ?? 0) > 0) {
    entry.friendlyLowestHpYd = timer.friendlyLowestHpYd;
    entry.friendlyHpDeficit = timer.friendlyHpDeficit ?? 1;
  }
  if (timer.hpPctMax != null || timer.hpPctMin != null) {
    entry.hpPctMax = timer.hpPctMax ?? 100;
    entry.hpPctMin = timer.hpPctMin ?? 0;
  }
  const flags = timerCastFlags(timer);
  if (flags) entry.castFlags = flags;
  const classId = timer.select?.classId ?? 0;
  if (classId > 0) entry.selectClass = classId | 0;
  if (timer.select?.inMelee === true) entry.selectInMelee = true;
  if (timer.classCallGroup != null) {
    // One CombatAI action: siblings share ResetCombatAction. Cite: boss_nefarian.cpp:285.
    entry.scriptId = timer.classCallGroup | 0;
    entry.eventFlags = (entry.eventFlags ?? 0) | EFLAG_RANDOM_ACTION;
  }
  // Phase gate: skip when (mask & (1 << phase)) != 0 — invert so only `phase` is active.
  // When timer.phase is set, mask all other phases.
  const p = timer.phase ?? phase ?? 0;
  if (timer.phase != null || phase != null) {
    // Allow only phase p: an inverse mask of all bits except bit p, as uint32. Truncating to 16
    // bits unblocked phase-0 timers at p ≥ 16 (Kel'Thuzad 30). Cite: CreatureEventAI.cpp CheckEvent.
    entry.eventInversePhaseMask = ~(1 << p);
  }
  return entry;
}

// Full cast plan from IR — cast entries + spell id set + aura scripts. Prefer this over bare
// creature.spells for bound ScriptDev bosses.
export function castPlanFromScriptDev(ir: ScriptDevIR): ScriptDevCastPlan {
  const castEntries: CreatureCastEntry[] = [];
  const spellIds = new Set<number>(ir.spellIds);

  for (const timer of ir.timers) {
    spellIds.add(timer.spellId);
    for (const id of timer.rotateSpellIds ?? []) spellIds.add(id | 0);
    // Every member of a per-spawn pool has to be in the kit: the pick happens at spawn, so the kit
    // cannot know which one this body drew. Cite: zulgurubScripts.cpp:61,110-115.
    for (const id of timer.pickPerSpawnSpellIds ?? []) spellIds.add(id | 0);
    // onReset buffs: arm at t=0 with AURA_NOT_PRESENT (Maleki Frost Armor).
    if (timer.onReset) {
      castEntries.push({
        spellId: timer.spellId,
        eventType: EVENT_T.AGGRO,
        initialMinMs: 0,
        initialMaxMs: 0,
        castFlags: (timer.castFlags ?? 0) | CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT
          | CAST_FLAG.FORCE_TARGET_SELF,
        target: TARGET_T.SELF,
        targetSpace: 'eventai',
        // one-shot on aggro (no EFLAG_REPEATABLE)
      });
      // A Reset cast that is ALSO a combat action keeps its periodic entry. Ossirian's Supreme is
      // both — boss_ossirian.cpp:111 Reset, :269-279 OSSIRIAN_SUPREME ResetCombatAction 45000 —
      // and the bare `continue` dropped the re-application, so one crystal click ended it for good.
      const periodic = timer.initialMinMs | timer.initialMaxMs | timer.repeatMinMs | timer.repeatMaxMs;
      if (periodic === 0) continue;
    }
    castEntries.push(timerToCastEntry(timer));
  }

  // Phase actions are executed by tickScriptDev, the single owner of the HP threshold. Arming them
  // as EVENT_T.HP entries too re-armed every tick and heal-looped Dathrohan at <40% forever.
  const morphEntries: number[] = [];
  for (const ph of ir.phases ?? []) {
    for (const act of ph.actions ?? []) {
      if (act.kind === 'cast_self') spellIds.add(act.spellId);
      if (act.kind === 'update_entry' && !morphEntries.includes(act.entry)) {
        morphEntries.push(act.entry);
      }
    }
  }
  for (const rec of ir.receiveAiEvents ?? []) {
    for (const act of rec.actions) {
      if (act.kind === 'cast_self') spellIds.add(act.spellId);
      if (act.kind === 'cast_on_script_targets') spellIds.add(act.spellId);
    }
  }
  // SummonedCreatureJustDied actions (ENCOURAGEMENT / CHAMPION / IMMUNE_POLY) must resolve.
  for (const hook of ir.addDeaths ?? []) {
    for (const act of hook.actions) {
      if (
        act.kind === 'cast_self'
        || act.kind === 'cast_on_script_targets'
        || act.kind === 'cast_on_group'
        || act.kind === 'cast_on_player'
      ) {
        spellIds.add(act.spellId);
      }
    }
  }

  for (const as of ir.auraScripts ?? []) {
    spellIds.add(as.spellId);
    if (as.possessInvSpellId) spellIds.add(as.possessInvSpellId);
    for (const list of [as.onApply, as.onRemove, as.onPeriodic]) {
      for (const a of list ?? []) {
        if (a.kind === 'cast_helper' || a.kind === 'remove_auras') spellIds.add(a.spellId);
      }
    }
  }
  const addCastSpellIds = (acts: ScriptDevAction[] | undefined): void => {
    for (const act of acts ?? []) {
      if (
        act.kind === 'cast_self'
        || act.kind === 'cast_on_script_targets'
        || act.kind === 'cast_on_group'
        || act.kind === 'cast_on_player'
      ) {
        spellIds.add(act.spellId);
      } else if (act.kind === 'explode_proximity') {
        // The payload's own bake row carries school and mitigation, so both ids must be in the kit.
        spellIds.add(act.spellId | 0);
        spellIds.add(act.payloadSpellId | 0);
        for (const c of act.creaturePctMaxHealth ?? []) addCastSpellIds(c.actions);
      } else if (act.kind === 'deal_group_abilities') {
        for (const id of act.spellIds) spellIds.add(id | 0);
      } else if (act.kind === 'transfer_group_ability') {
        if (act.healSpellId) spellIds.add(act.healSpellId | 0);
      } else if (
        act.kind === 'cast_on_victim_change'
        || act.kind === 'cast_on_cast_target'
        || act.kind === 'cast_on_random_players'
        || act.kind === 'proxy_cast_on_victim'
        || act.kind === 'damage_in_radius'
      ) {
        spellIds.add(act.spellId | 0);
      }
    }
  };
  addCastSpellIds(ir.lifecycle?.onAggro);
  addCastSpellIds(ir.lifecycle?.onDeath);
  addCastSpellIds(ir.lifecycle?.onEvade);
  addCastSpellIds(ir.lifecycle?.onReset);
  addCastSpellIds(ir.lifecycle?.onKill);
  addCastSpellIds(ir.lifecycle?.justSummoned);
  for (const hit of ir.spellHits ?? []) addCastSpellIds(hit.actions);
  addCastSpellIds(ir.lifecycle?.onPreventedDeath);
  addCastSpellIds(ir.lifecycle?.summonedReachedHome);
  for (const timer of ir.timers) addCastSpellIds(timer.actions);
  for (const tp of ir.timedPhases ?? []) addCastSpellIds(tp.actions);
  for (const gate of ir.hitCountGates ?? []) {
    for (const th of gate.thresholds) {
      addCastSpellIds(th.actions);
      addCastSpellIds(th.onExpire?.actions);
    }
  }

  return {
    castEntries,
    spellIds: [...spellIds],
    auraScripts: ir.auraScripts ?? [],
    morphEntries,
    ir,
  };
}

// Aura script registry (spell id → first matching IR aura script)

const auraBySpellId = new Map<number, ScriptDevAuraScript>();
let possessInvIdSet: Set<number> | null = null;
let possessInvIdList: number[] | null = null;

function invalidatePossessInvIds(): void {
  possessInvIdSet = null;
  possessInvIdList = null;
}

function rebuildPossessInvIds(): void {
  const set = new Set<number>();
  for (const as of auraBySpellId.values()) {
    const id = as.possessInvSpellId ?? 0;
    if (id > 0) set.add(id);
  }
  possessInvIdSet = set;
  possessInvIdList = [...set];
}

/** Register all aura scripts from an IR (called when registry loads). */
export function registerAuraScriptsFromIr(ir: ScriptDevIR): void {
  for (const as of ir.auraScripts ?? []) {
    auraBySpellId.set(as.spellId | 0, as);
  }
  invalidatePossessInvIds();
}

export function clearAuraScriptRegistryForTests(): void {
  auraBySpellId.clear();
  invalidatePossessInvIds();
}

/** Lookup AuraScript IR by holder spell id. */
export function getAuraScript(spellId: number): ScriptDevAuraScript | undefined {
  return auraBySpellId.get(spellId | 0);
}

/** Every registered aura-script spell id (tests / sweeps). */
export function registeredAuraScriptSpellIds(): number[] {
  return [...auraBySpellId.keys()].sort((a, b) => a - b);
}

/** Helper spell ids that vanish the charmer (Anastari 17250). */
export function possessInvSpellIds(): number[] {
  if (!possessInvIdList) rebuildPossessInvIds();
  return possessInvIdList!;
}

export function isPossessInvSpell(spellId: number): boolean {
  const id = spellId | 0;
  if (id <= 0) return false;
  if (!possessInvIdSet) rebuildPossessInvIds();
  return possessInvIdSet!.has(id);
}

// Plan a non-charm ScriptDev AuraScript onApply for a successful cast. Charm holders (Anastari)
// go through applyEnemyCharm instead. Cite: boss_noxxion.cpp:95-109 SummonNoxxionsSpawns.
export type NonCharmAuraOnApplyPlan =
  | { kind: 'set_unattackable'; untilMs: number; spellId: number; spellName: string }
  | { kind: 'summon'; creatureEntry: number; count: number; isGuardian?: boolean; createdBySpell?: number }
  | { kind: 'cast_helper_spell'; spellId: number }
  | { kind: 'flavor'; text: string };

export function planNonCharmAuraOnApply(
  spellId: number,
  spellName: string,
  t: number,
  helperSpells: ReadonlyArray<{ id: number; rawEffects?: ReadonlyArray<{ effect?: number; basePoints?: number; miscValue?: number }> }>,
): NonCharmAuraOnApplyPlan[] {
  const out: NonCharmAuraOnApplyPlan[] = [];

  // SUMMON_WILD (41) / SUMMON_GUARDIAN (42) on the cast spell itself. combat's summonCast.ts owns
  // this now, so callers skip the duplicates; kept for fixtures with no interpreted effects[].
  const castSpell = helperSpells.find((s) => s.id === spellId);
  for (const r of castSpell?.rawEffects ?? []) {
    const eff = (r.effect ?? 0) | 0;
    if ((eff === 41 || eff === 42) && ((r.miscValue ?? 0) | 0) > 0) {
      out.push({
        kind: 'summon',
        creatureEntry: (r.miscValue ?? 0) | 0,
        // Fixed count = basePoints+1, deterministic where interpretSpell may roll dieSides.
        // Cite: 10247 both slots bp=0 → count 1; 17773 bp=14 → 15×11439; 17653 bp=4 → 5×11263.
        count: Math.max(1, (((r.basePoints ?? 0) | 0) + 1)),
        // Effect 42 is GUARDIAN_PET — follow 1.5 (Imp 11939 → 3). Cite: GuardianAI.cpp:31, :35-36.
        ...(eff === 42 ? { isGuardian: true, createdBySpell: spellId } : {}),
      });
    }
  }

  const auraScript = getAuraScript(spellId);
  if (
    !auraScript
    || auraScript.charmBreakHpFrac != null
    || auraScript.possessInvSpellId != null
  ) {
    return out;
  }
  const durationMs = auraScript.durationMs ?? 0;
  const until = durationMs > 0 ? t + durationMs : t;
  for (const act of auraScript.onApply ?? []) {
    if (act.kind === 'set_unattackable') {
      // UNIT_FLAG_UNINTERACTIBLE — untargetable, not stunned. Cite: boss_noxxion.cpp:104
      if (durationMs > 0) {
        out.push({ kind: 'set_unattackable', untilMs: until, spellId, spellName });
      }
    } else if (act.kind === 'cast_helper') {
      // Cite: boss_noxxion.cpp:103; spell 21707 effect 42 basePoints=4 → count 5×13456
      const helper = helperSpells.find((s) => s.id === act.spellId);
      const rawSummon = (helper?.rawEffects ?? []).find((r) => ((r.effect ?? 0) | 0) === 42);
      if (rawSummon && ((rawSummon.miscValue ?? 0) | 0) > 0) {
        out.push({
          kind: 'summon',
          creatureEntry: (rawSummon.miscValue ?? 0) | 0,
          count: Math.max(1, (((rawSummon.basePoints ?? 0) | 0) + 1)),
          isGuardian: true,
          createdBySpell: act.spellId,
        });
      } else if (helper) {
        out.push({ kind: 'cast_helper_spell', spellId: act.spellId });
      }
    } else if (act.kind === 'flavor') {
      out.push({ kind: 'flavor', text: act.text });
    }
  }
  return out;
}

// Runtime arm / phase tick

export function armScriptDevRuntime(ir: ScriptDevIR): ScriptDevRuntimeState {
  return {
    ir,
    phase: 0,
    phaseFired: new Set(),
    possessedSide: null,
    possessEndTimerMs: 0,
    spellHitTagged: false,
    dieTimerMs: 0,
    addsKilled: 0,
    oneshotTags: new Set(),
    hitCount: 0,
  };
}

// IncreaseHitCount. One packet matches one gate; thresholds fire on exact `at`. Cite:
// boss_viscidus.cpp:295-331.
export function noteScriptDevHitCount(
  state: ScriptDevRuntimeState,
  opts: {
    school?: string;
    melee?: boolean;
    hasAura: (spellId: number) => boolean;
  },
): ScriptDevAction[] {
  const gates = state.ir.hitCountGates;
  if (!gates?.length) return [];
  const out: ScriptDevAction[] = [];
  for (const gate of gates) {
    if (gate.school != null && (opts.melee || opts.school !== gate.school)) continue;
    if (gate.melee && !opts.melee) continue;
    if (gate.requireAura != null && !opts.hasAura(gate.requireAura | 0)) continue;
    const ph = state.phase | 0;
    if (gate.phaseMin != null && ph < gate.phaseMin) continue;
    if (gate.phaseMax != null && ph > gate.phaseMax) continue;
    const n = (state.hitCount ?? 0) + 1;
    state.hitCount = n;
    for (const th of gate.thresholds) {
      if (th.at !== n) continue;
      if (th.setPhase != null) state.phase = th.setPhase | 0;
      if (th.resetCount) state.hitCount = 0;
      if (th.durationMs != null && th.durationMs > 0 && th.onExpire) {
        state.hitCountExpire = {
          remainingMs: th.durationMs,
          setPhase: th.onExpire.setPhase,
          resetCount: th.onExpire.resetCount,
          actions: th.onExpire.actions,
        };
      }
      out.push(...th.actions);
      break;
    }
    break;
  }
  return out;
}

// JustSummoned guid set (m_sSpiritsGuidsSet) — kept off ScriptDevRuntimeState so types.ts stays free for
// concurrent PRs. Cite: boss_ambassador_flamelash.cpp:49,113,77.
const trackedSummonSidesByState = new WeakMap<ScriptDevRuntimeState, Set<string>>();

/** Track a JustSummoned side for later reach-cast. Cite: cpp:113 m_sSpiritsGuidsSet.insert. */
export function noteJustSummonedSide(
  state: ScriptDevRuntimeState,
  side: string,
): void {
  let set = trackedSummonSidesByState.get(state);
  if (!set) {
    set = new Set();
    trackedSummonSidesByState.set(state, set);
  }
  set.add(side);
}

export interface ScriptDevReachCastDue {
  summonSide: string;
  spellId: number;
  cite: string;
}

// MoveInLineOfSight reach-cast for tracked summons of `creatureEntry` within `withinYd`. Cite:
// boss_ambassador_flamelash.cpp:69-78.
export function collectReachCastsDue(
  state: ScriptDevRuntimeState,
  opts: {
    bossSide: string;
    creatureEntry: number;
    spellId: number;
    withinYd: number;
    cite: string;
    distanceYd: (a: string, b: string) => number | null;
    isAlive: (side: string) => boolean;
    entryOf: (side: string) => number;
  },
): ScriptDevReachCastDue[] {
  const tracked = trackedSummonSidesByState.get(state);
  if (!tracked || tracked.size === 0) return [];
  const entry = opts.creatureEntry | 0;
  const out: ScriptDevReachCastDue[] = [];
  for (const side of [...tracked]) {
    if (!opts.isAlive(side)) {
      tracked.delete(side);
      continue;
    }
    if ((opts.entryOf(side) | 0) !== entry) continue;
    const d = opts.distanceYd(side, opts.bossSide);
    if (d == null || d > opts.withinYd) continue;
    out.push({ summonSide: side, spellId: opts.spellId | 0, cite: opts.cite });
    tracked.delete(side);
  }
  return out;
}

/** True when this runtime still tracks at least one JustSummoned side. */
export function hasTrackedSummonSides(state: ScriptDevRuntimeState): boolean {
  const tracked = trackedSummonSidesByState.get(state);
  return !!tracked && tracked.size > 0;
}

/** Resolve an add-death hook's trigger count against the script's own constant. */
function addDeathThreshold(hook: ScriptDevAddDeathHook): number {
  if (hook.atKilled === 'every') return 0;
  if (hook.atKilled === 'all') return hook.total;
  if (hook.atKilled === 'allButOne') return Math.max(1, hook.total - 1);
  // MAX_MAJORDOMO_ADDS / 2 — integer division, as the C++ does.
  if (hook.atKilled === 'half') return Math.max(1, Math.trunc(hook.total / 2));
  return Math.max(1, hook.atKilled | 0);
}

// One of the script's adds just died: bump the counter and return the actions whose threshold this
// death crossed. Each fires once, ascending, and `every` re-fires after while addsKilled < total.
export function noteScriptDevAddDeath(
  state: ScriptDevRuntimeState,
  deadEntry: number,
): ScriptDevAction[] {
  const hooks = state.ir.addDeaths ?? [];
  if (!hooks.length) return [];
  const relevant = hooks.filter((h) => h.creatureEntries.includes(deadEntry | 0));
  if (!relevant.length) return [];
  const before = state.addsKilled ?? 0;
  const after = before + 1;
  state.addsKilled = after;
  const out: ScriptDevAction[] = [];
  const thresholdHooks = relevant
    .filter((h) => h.atKilled !== 'every')
    .slice()
    .sort((a, b) => addDeathThreshold(a) - addDeathThreshold(b));
  for (const hook of thresholdHooks) {
    const at = addDeathThreshold(hook);
    // `half` is a >= gate in the C++ (every later death re-casts IMMUNE_POLY); the rest fire on
    // the exact count. Modelling half as "crossed once" is the same observable buff.
    if (after >= at && before < at) out.push(...hook.actions);
  }
  // After threshold actions; skip when the last add dies (cpp:231-236 return).
  for (const hook of relevant) {
    if (hook.atKilled !== 'every') continue;
    if (after < hook.total) out.push(...hook.actions);
  }
  return out;
}

/** Evaluate one instance-data gate. */
export function dataGatePasses(
  gate: ScriptDevDataGate,
  store: Map<number, number>,
): boolean {
  const cur = store.get(gate.field | 0) ?? INSTANCE_DATA.NOT_STARTED;
  let ok = true;
  if (gate.equals != null && cur !== gate.equals) ok = false;
  if (gate.notEquals != null && cur === gate.notEquals) ok = false;
  if (ok && gate.and && !dataGatePasses(gate.and, store)) ok = false;
  if (gate.or) return ok || dataGatePasses(gate.or, store);
  return ok;
}

export interface ScriptDevTickCtx {
  /** Current HP percent 0–100. */
  hpPct: number;
  /** Session time ms. */
  t: number;
  /** Diff since last tick. */
  diffMs: number;
  /** Living hostiles for the scripted unit (threat list size proxy). */
  threatSize: number;
  /** True when unit has possess-inv aura (SPELL_POSSESS_INV). */
  hasPossessInv: boolean;
  /** HP frac of possessed target (0–1); null if none. */
  possessedHpFrac: number | null;
  /** Session RNG for summon-wave jitter (urand ranges). Midpoint when absent. */
  rng?: { int(minIncl: number, maxIncl: number): number };
  /** World z of the scripted unit. Absent → skip altitude leash. */
  z?: number;
  /** World x. Absent → skip x leash. */
  x?: number;
  /** Planar yards from respawn/home. Absent → skip home-distance leash. */
  homeYd?: number;
  /** World y. Absent → skip x/y corner leash. */
  y?: number;
}

export interface ScriptDevTickResult {
  /** Phase changed this tick. */
  phase?: number;
  /** Actions to execute (set_instance_data, yell, update_entry, cast_self). */
  actions: ScriptDevAction[];
  /** Break possess chain (remove inv + charm). */
  breakPossess?: boolean;
  /** Flavor lines. */
  flavor: string[];
  /** SetLeashingCheck tripped. Cite: boss_faerlina.cpp:67-71 z > 266. */
  evade?: boolean;
}

// Tick host for phase thresholds and possess-end checks; cast selection stays on the creatureCast
// scheduler. Cite: boss_dathrohan_balnazzar.cpp UpdateAI transform; Anastari possess-end timer.
export function tickScriptDev(
  state: ScriptDevRuntimeState,
  ctx: ScriptDevTickCtx,
): ScriptDevTickResult {
  const actions: ScriptDevAction[] = [];
  const flavor: string[] = [];
  let breakPossess = false;
  let phaseOut: number | undefined;

  if (state.ir.leashZGt != null && ctx.z != null && ctx.z > state.ir.leashZGt) {
    return { actions, flavor, evade: true };
  }
  if (state.ir.leashXGt != null && ctx.x != null && ctx.x > state.ir.leashXGt) {
    return { actions, flavor, evade: true };
  }
  if (state.ir.leashHomeYd != null && ctx.homeYd != null && ctx.homeYd > state.ir.leashHomeYd) {
    return { actions, flavor, evade: true };
  }
  if (state.ir.leashOrXy?.length && ctx.x != null && ctx.y != null) {
    for (const c of state.ir.leashOrXy) {
      if (ctx.x > c.xGt && ctx.y < c.yLt) return { actions, flavor, evade: true };
    }
  }

  // Freeze durationIndex 8 → CUSTOM_A PHASE_NORMAL. Cite: boss_viscidus.cpp:415-419.
  if (state.hitCountExpire) {
    state.hitCountExpire.remainingMs -= ctx.diffMs;
    if (state.hitCountExpire.remainingMs <= 0) {
      const exp = state.hitCountExpire;
      state.hitCountExpire = undefined;
      if (exp.setPhase != null) {
        state.phase = exp.setPhase | 0;
        phaseOut = exp.setPhase | 0;
      }
      if (exp.resetCount) state.hitCount = 0;
      for (const a of exp.actions) actions.push(a);
    }
  }

  // Phase HP thresholds (once each).
  for (const ph of state.ir.phases ?? []) {
    if (state.phaseFired.has(ph.phase)) continue;
    if (ctx.hpPct < ph.hpBelowPct) {
      state.phaseFired.add(ph.phase);
      if (!ph.retainPhase) {
        state.phase = ph.phase;
        phaseOut = ph.phase;
      }
      for (const a of ph.actions ?? []) actions.push(a);
    }
  }

  // Clock-driven phases (Ragnaros's submerge cycle). Armed at combat start from the
  // first entry, then each firing arms its `next` — a two-entry ring is a cycle.
  const tps = state.ir.timedPhases ?? [];
  if (tps.length) {
    if (state.timedPhase === undefined) {
      const first = tps[0];
      state.timedPhase = first ? { id: first.id, remainingMs: first.afterMs } : null;
    }
    const armed = state.timedPhase;
    if (armed) {
      armed.remainingMs -= ctx.diffMs;
      if (armed.remainingMs <= 0) {
        const tp = tps.find((x) => x.id === armed.id);
        if (tp) {
          if (tp.hpMinPct != null && ctx.hpPct <= tp.hpMinPct) {
            // Cite: boss_sapphiron.cpp:201 GetHealthPercent() > 10.f; retry, do not Disable.
            armed.remainingMs = 1000;
          } else {
            state.phase = tp.phase;
            phaseOut = tp.phase;
            for (const a of tp.actions ?? []) actions.push(a);
            const nxt = tp.next ? tps.find((x) => x.id === tp.next) : undefined;
            state.timedPhase = nxt ? { id: nxt.id, remainingMs: nxt.afterMs } : null;
          }
        } else {
          state.timedPhase = null;
        }
      }
    }
  }

  // Script-owned summon waves (Onyxia's whelps). Armed the tick the wave's phase starts,
  // so a wave whose phase is 0 runs from the pull. Cite: boss_onyxia.cpp:309-330,339.
  const waves = state.ir.summonWaves ?? [];
  if (waves.length) {
    const urand = (lo: number, hi: number) =>
      hi <= lo ? lo : ctx.rng ? ctx.rng.int(lo, hi) : Math.floor((lo + hi) / 2);
    if (!state.summonWaves) state.summonWaves = {};
    for (const w of waves) {
      const live = state.phase === w.phase;
      let st = state.summonWaves[w.id];
      if (!live) {
        // Leaving the phase disarms the loop: DisableTimer(ONYXIA_SUMMON_WHELPS) at the
        // phase-3 transition is why the whelps stop when she lands.
        if (st) delete state.summonWaves[w.id];
        continue;
      }
      if (!st) {
        st = { timerMs: w.armDelayMs, summoned: 0, waveCount: w.firstWaveCount, firstDone: false };
        state.summonWaves[w.id] = st;
      }
      st.timerMs -= ctx.diffMs;
      if (st.timerMs > 0) continue;
      if (st.summoned >= st.waveCount) {
        const per = st.firstDone ? w.gapPerSummonMs : w.gapPerSummonFirstMs;
        st.timerMs = Math.max(0, w.gapBaseMs - st.waveCount * per);
        st.firstDone = true;
        st.waveCount = urand(w.waveMinCount, w.waveMaxCount);
        st.summoned = 0;
        continue;
      }
      actions.push({
        kind: 'summon_count',
        creatureEntry: w.creatureEntry,
        count: w.perTick,
        cite: w.cite,
      });
      st.summoned += w.perTick;
      st.timerMs = st.firstDone
        ? urand(w.tickMinMs, w.tickMaxMs)
        : urand(w.firstTickMinMs, w.firstTickMaxMs);
    }
  }

  // Possess-end: CMaNGOS polls every 1s while armed, and this also polls whenever the inv is up so
  // a missed arm cannot stick vanish. Cite: boss_baroness_anastari.cpp:86-121.
  if (ctx.hasPossessInv) {
    if (ctx.possessedHpFrac == null || ctx.possessedHpFrac <= 0.5) {
      breakPossess = true;
      state.possessEndTimerMs = 0;
      state.possessedSide = null;
    } else if (state.possessEndTimerMs > 0) {
      if (state.possessEndTimerMs <= ctx.diffMs) state.possessEndTimerMs = 1000;
      else state.possessEndTimerMs -= ctx.diffMs;
    }
  } else if (state.possessEndTimerMs > 0) {
    state.possessEndTimerMs = 0;
    state.possessedSide = null;
  }

  // Leash: possess-inv + threat size ≤ 1 → break.
  // Cite: boss_baroness_anastari.cpp SetLeashingCheck size() <= 1.
  for (const as of state.ir.auraScripts ?? []) {
    if (as.leashThreatSizeLte == null) continue;
    if (ctx.hasPossessInv && ctx.threatSize <= as.leashThreatSizeLte) {
      breakPossess = true;
    }
  }

  return { phase: phaseOut, actions, breakPossess, flavor };
}

/** Mark that possess just landed — arm end timer. Cite: m_uiPossessEndTimer = 1000. */
export function notePossessLanded(state: ScriptDevRuntimeState, possessedSide: string): void {
  state.possessedSide = possessedSide;
  state.possessEndTimerMs = 1000;
}

// Instance host — SetData / doors on S3 instanceData Map

export interface InstanceHostResult {
  /** Fields written this call. */
  writes: Array<{ field: number; value: number }>;
  /** Door GO entries that should open. */
  openDoors: number[];
  flavor: string[];
}

/** GO_FLAG_NO_INTERACT / GO_FLAG_LOCKED toggle from OnPlayerEnter. */
export interface InstanceEnterDoorFlags {
  goEntry: number;
  noInteract: boolean;
  locked: boolean;
  doNorthBeforeWest?: boolean;
  cite: string;
}

// Apply instance SetData semantics from an instance IR, consuming the shared combat instanceData
// store. Cite: instance_stratholme::SetData (stratholme.cpp:210+); OnCreatureDeath (691+).
export function applyInstanceSetData(
  ir: ScriptDevIR,
  field: number,
  value: number,
  store: Map<number, number>,
): InstanceHostResult {
  // TYPE_PROTECTORS: each DONE --remaining; encounter+door only at 0.
  // Cite: sunken_temple.cpp:162-178; naive store.set would open 149431 on first death.
  if (
    ir.name === 'instance_sunken_temple'
    && field === TYPE_PROTECTORS
  ) {
    const res = applyProtectorsSetData(store, value);
    return {
      writes: res.writes,
      openDoors: res.openDoors,
      flavor: res.flavor,
    };
  }
  // TYPE_FOUR_HORSEMEN: each DONE ++m_horsemenKilled; encounter+door only at 4.
  // Cite: naxxramas.cpp:527-553; naive store.set would DONE the wing on Mograine.
  if (ir.name === 'instance_naxxramas' && field === TYPE_FOUR_HORSEMEN) {
    const res = applyHorsemenSetData(store, value);
    return {
      writes: res.writes,
      openDoors: res.openDoors,
      flavor: res.flavor,
    };
  }

  const writes: Array<{ field: number; value: number }> = [];
  const openDoors: number[] = [];
  const flavor: string[] = [];

  store.set(field | 0, value | 0);
  writes.push({ field: field | 0, value: value | 0 });

  // Door opens when the value is in door.openOn (default [DONE]).
  // Cite: stratholme.cpp TYPE_BARONESS data==DONE; sunken_temple.cpp:285-286 TYPE_AVATAR.
  for (const door of ir.doors ?? []) {
    if (door.field !== field) continue;
    const openOn = door.openOn ?? [ENCOUNTER_STATE.DONE];
    if (openOn.includes(value)) {
      openDoors.push(door.goEntry);
    }
  }

  return { writes, openDoors, flavor };
}

// Instance OnPlayerEnter door-flag host (the DoToggleGameObjectFlags seam): in Dire Maul, standing
// near North before TYPE_WARPWOOD is DONE sets GO 179550 NO_INTERACT. Cite: cpp:62-73.
export function applyInstanceOnPlayerEnter(
  ir: ScriptDevIR,
  playerX: number,
  playerY: number,
  store: Map<number, number>,
): InstanceEnterDoorFlags[] {
  if (ir.name !== 'instance_dire_maul') return [];
  const r = applyDireMaulOnPlayerEnter(playerX, playerY, (field) => (
    store.get(field | 0) ?? INSTANCE_DATA.NOT_STARTED
  ));
  return [{
    goEntry: r.goEntry,
    noInteract: r.noInteract,
    locked: r.locked,
    doNorthBeforeWest: r.doNorthBeforeWest,
    cite: r.cite,
  }];
}

// Resolve death/aggro SetData for a creature entry against instance IR. Cite:
// instance_stratholme::OnCreatureDeath NPC_BARONESS_ANASTARI → TYPE_BARONESS DONE.
export function instanceEventForCreature(
  ir: ScriptDevIR,
  creatureEntry: number,
  event: 'death' | 'aggro' | 'evade',
): { field: number; value: number; cite: string; evadeCooldownMs?: number } | null {
  for (const enc of ir.encounters ?? []) {
    if (enc.creatureEntry !== creatureEntry) continue;
    if (event === 'death') {
      return {
        field: enc.field,
        value: enc.onDeath ?? ENCOUNTER_STATE.DONE,
        cite: enc.cite,
      };
    }
    if (event === 'aggro') {
      return {
        field: enc.field,
        value: enc.onAggro ?? ENCOUNTER_STATE.IN_PROGRESS,
        cite: enc.cite,
      };
    }
    return {
      field: enc.field,
      value: enc.onEvade ?? ENCOUNTER_STATE.FAIL,
      evadeCooldownMs: SCRIPTED_AI_EVADE_COOLDOWN_MS,
      cite: enc.cite,
    };
  }
  return null;
}

/** Collect lifecycle actions for a boss IR (onDeath / onAggro). */
export function lifecycleActions(
  ir: ScriptDevIR,
  event: 'onAggro' | 'onDeath' | 'onEvade' | 'onReset' | 'onKill' | 'summonedReachedHome' | 'onPreventedDeath',
): ScriptDevAction[] {
  return ir.lifecycle?.[event] ?? [];
}

// Zone / GO / SpellHit host helpers (stratholmeScripts.cpp patterns)

export interface ScriptDevHookResult {
  /** Whether the hook consumed the interaction (C++ returned true/false varies). */
  handled: boolean;
  actions: ScriptDevAction[];
  /** Instance fields written via set_instance_data actions (also applied to store). */
  writes: Array<{ field: number; value: number }>;
  flavor: string[];
}

function runActionsOnStore(
  actions: ScriptDevAction[],
  store: Map<number, number>,
): ScriptDevHookResult {
  const writes: Array<{ field: number; value: number }> = [];
  const flavor: string[] = [];
  for (const a of actions) {
    if (a.kind === 'set_instance_data') {
      store.set(a.field | 0, a.value | 0);
      writes.push({ field: a.field | 0, value: a.value | 0 });
    }
  }
  return { handled: true, actions, writes, flavor };
}

// Apply pGOUse IR against the instance data store. Cite: GOUse_go_service_gate / go_gauntlet_gate /
// go_stratholme_postbox.
export function handleGoUse(
  ir: ScriptDevIR,
  store: Map<number, number>,
  /** The GO entry the player actually used — required by `perEntry` scripts. */
  usedGoEntry?: number,
): ScriptDevHookResult {
  const gu = ir.goUse;
  if (!gu) return { handled: false, actions: [], writes: [], flavor: [] };

  for (const g of gu.gates ?? []) {
    if (!dataGatePasses(g, store)) {
      return { handled: false, actions: [], writes: [], flavor: [] };
    }
  }

  // Per-entry first: which object was used decides, before any data branch.
  if (gu.perEntry?.length && usedGoEntry != null) {
    const row = gu.perEntry.find((r) => r.goEntry === (usedGoEntry | 0));
    if (row) {
      for (const g of row.gates ?? []) {
        if (!dataGatePasses(g, store)) {
          return { handled: false, actions: [], writes: [], flavor: [] };
        }
      }
      return runActionsOnStore(row.actions, store);
    }
  }

  if (gu.branches?.length) {
    for (const br of gu.branches) {
      if (dataGatePasses(br.gate, store)) {
        return runActionsOnStore(br.actions, store);
      }
    }
    // Branches present but none matched — only fall through when default actions exist
    // (e.g. go_stratholme_postbox). Event-only OR branches (avatar start) → unhandled.
    if (!(gu.actions?.length)) {
      return { handled: false, actions: [], writes: [], flavor: [] };
    }
  }

  return runActionsOnStore(gu.actions ?? [], store);
}

// Apply SpellHit IR — arms die timer / immediate actions. Cite: mob_restless_soulAI::SpellHit;
// mobs_spectral_ghostly_citizenAI::SpellHit.
export function handleSpellHit(
  state: ScriptDevRuntimeState,
  spellId: number,
  opts: { isPlayerCaster?: boolean; questIncomplete?: number | null } = {},
): ScriptDevHookResult {
  const hits = state.ir.spellHits ?? [];
  for (const hit of hits) {
    if (hit.spellId !== (spellId | 0)) continue;
    if (hit.once && state.spellHitTagged) {
      return { handled: false, actions: [], writes: [], flavor: [] };
    }
    if (hit.playerCaster && !opts.isPlayerCaster) {
      return { handled: false, actions: [], writes: [], flavor: [] };
    }
    if (hit.requireQuestIncomplete != null) {
      if (opts.questIncomplete !== hit.requireQuestIncomplete) {
        return { handled: false, actions: [], writes: [], flavor: [] };
      }
    }
    if (hit.once) state.spellHitTagged = true;
    if (hit.dieTimerMs != null) state.dieTimerMs = hit.dieTimerMs;
    return {
      handled: true,
      actions: hit.actions ?? [],
      writes: [],
      flavor: [],
    };
  }
  return { handled: false, actions: [], writes: [], flavor: [] };
}

/** Tick die-after-tag timer (restless soul / spectral citizen). Cite: m_uiDieTimer UpdateAI branches. */
export function tickDieTimer(
  state: ScriptDevRuntimeState,
  diffMs: number,
): ScriptDevHookResult {
  if (!state.spellHitTagged || !state.dieTimerMs || state.dieTimerMs <= 0) {
    return { handled: false, actions: [], writes: [], flavor: [] };
  }
  if (state.dieTimerMs > diffMs) {
    state.dieTimerMs -= diffMs;
    return { handled: true, actions: [], writes: [], flavor: [] };
  }
  state.dieTimerMs = 0;
  // Find the spell-hit that armed the timer (first with dieTimerMs).
  const hit = (state.ir.spellHits ?? []).find((h) => h.dieTimerMs != null);
  return {
    handled: true,
    actions: hit?.onDieTimer ?? [],
    writes: [],
    flavor: [],
  };
}

/** QuestRewarded NPC hook. Cite: QuestRewarded_npc_aurius. */
export function handleQuestRewarded(
  ir: ScriptDevIR,
  questId: number,
  store: Map<number, number>,
): ScriptDevHookResult {
  for (const q of ir.questRewarded ?? []) {
    if (q.questId !== (questId | 0)) continue;
    for (const g of q.gates ?? []) {
      if (!dataGatePasses(g, store)) {
        return { handled: false, actions: [], writes: [], flavor: [] };
      }
    }
    return runActionsOnStore(q.actions, store);
  }
  return { handled: false, actions: [], writes: [], flavor: [] };
}

/** Resolve gossip text id from instance data. Cite: GossipHello_npc_aurius. */
export function resolveGossipTextId(
  ir: ScriptDevIR,
  store: Map<number, number>,
): number | null {
  const g = ir.gossipHello;
  if (!g) return null;
  for (const br of g.branches ?? []) {
    if (br.gates.every((gate) => dataGatePasses(gate, store))) return br.textId;
  }
  return g.defaultTextId;
}

// ReceiveAIEvent — first matching eventType (+ optional sender entry). Cite: UnitAI.cpp:667;
// boss_shazzrah.cpp:80-87; boss_golemagg.cpp:159-163.
export function handleReceiveAiEvent(
  ir: ScriptDevIR,
  eventType: number,
  senderEntry?: number,
): ScriptDevHookResult {
  for (const rec of ir.receiveAiEvents ?? []) {
    if (rec.eventType !== (eventType | 0)) continue;
    if (rec.senderEntry != null && rec.senderEntry !== ((senderEntry ?? 0) | 0)) continue;
    return { handled: true, actions: rec.actions, writes: [], flavor: [] };
  }
  return { handled: false, actions: [], writes: [], flavor: [] };
}

/** ReceiveEmote handler. Cite: mobs_spectral_ghostly_citizenAI::ReceiveEmote. */
export function handleReceiveEmote(
  ir: ScriptDevIR,
  emote: number,
  distYd: number,
): ScriptDevHookResult {
  for (const re of ir.receiveEmotes ?? []) {
    if (re.emote !== (emote | 0)) continue;
    if (re.maxDistYd != null && distYd > re.maxDistYd) {
      return {
        handled: true,
        actions: re.outOfRangeActions ?? [],
        writes: [],
        flavor: [],
      };
    }
    return { handled: true, actions: re.actions, writes: [], flavor: [] };
  }
  return { handled: false, actions: [], writes: [], flavor: [] };
}
