// Creature cast-list scheduling and the EVENT_HANDLERS conditions. Pure domain; combat injects
// an Rng only when arming random timers. Cite: CreatureEventAI.cpp CheckEvent ~266–551.

import type {
  CreatureCastEntry,
  SpellDef,
} from '../../data/schema.ts';
import type { Rng } from '../../engine/core/rng.ts';
import { SPELL_LIST_TARGET, TARGET_T } from './aiTargeting.ts';
import {
  CAST_FLAG,
  EFLAG_RANDOM_ACTION,
  EFLAG_REPEATABLE,
  EVENT_T,
} from './creatureAiConstants.ts';

export type { CreatureCastEntry };

// UpdateSpellLists burns a 1200 ms timer at the top of every evaluation and stops at the first
// blocking row that casts, so one spell-list ability lands per poll. Cite: UnitAI.cpp:1187.
export const SPELL_LIST_POLL_MS = 1200;

// Cast scheduler (phase-1 EventAI cast + CD)

export interface CreatureCastSlot {
  entry: CreatureCastEntry;
  spell: SpellDef;
  /** Session time when this cast becomes eligible again. */
  readyAt: number;
  /** AGGRO / non-repeatable one-shots. */
  exhausted: boolean;
  /** Stable list order index (tpl order or script order). */
  listIndex: number;
  /** CAST_OK fires this pull. Cite: boss_gothik.cpp:117 m_teleportCount. */
  fires: number;
  /** Unshuffled rotate kit. Cite: boss_fankriss.cpp:91 m_summonWormSpells. */
  rotatePool?: SpellDef[];
  /** Current shuffled order. Cite: boss_fankriss.cpp:99 std::shuffle. */
  rotateOrder?: SpellDef[];
  /** Remaining casts this wave. Cite: boss_fankriss.cpp:90 m_wormsSpawnPerWave. */
  waveLeft?: number;
}

// Friendly unit snapshot for FRIENDLY_HP / FRIENDLY_IS_CC / FRIENDLY_MISSING_BUFF. Cite:
// CreatureEventAI.cpp DoSelectLowestHpFriendly / DoFindFriendly* ~379–437.
export interface EventAiFriendlyUnit {
  /** Current HP percent 0–100. */
  hpPct: number;
  /** Current HP (absolute); used when friendlyHpIsPercent is false. */
  hp: number;
  /** Max HP. */
  maxHp: number;
  /** Yards from the scanning creature; omit when distance not modeled → treated as in-range. */
  distanceYd?: number;
  /** True when unit has ≥ stacks of spellId. */
  hasAura?: (spellId: number, stacks: number) => boolean;
  /** True when unit is crowd-controlled (FRIENDLY_IS_CC). */
  hasCc?: boolean;
}

export interface CastPickContext {
  t: number;
  /** Current HP percent 0–100 (self). */
  hpPct: number;
  /** Self mana percent 0–100; omit when creature has no mana pool. */
  manaPct?: number;
  /** Victim HP percent 0–100. */
  targetHpPct?: number;
  /** Victim mana percent 0–100; omit when victim has no mana. */
  targetManaPct?: number;
  // True when self has at least `stacks` of `spellId` (buffActive / stack model). Cite:
  // EVENT_T_MISSING_AURA / AURA — CreatureEventAI.cpp ~472–495.
  hasAura?: (spellId: number, stacks: number) => boolean;
  /** Same for victim (TARGET_MISSING_AURA / TARGET_AURA). */
  targetHasAura?: (spellId: number, stacks: number) => boolean;
  /** Victim is mid non-melee cast. Cite: EVENT_T_TARGET_CASTING ~375–377. */
  targetCasting?: boolean;
  // Yards to victim. When undefined, RANGE events are skipped (no invented distance). Cite: EVENT_T_RANGE
  // ~349–354.
  distanceYd?: number;
  // EventAI m_Phase (default 0). Used with entry.eventInversePhaseMask. Cite: CreatureEventAI.cpp
  // CheckEvent ~266–270.
  phase?: number;
  // In-combat flag. Default true (combat schedulers). TIMER_OOC requires false. Cite: CreatureEventAI.cpp
  // TIMER_OOC ~295–297, TIMER_IN_COMBAT ~291–293.
  inCombat?: boolean;
  // Ally scan list for FRIENDLY_* events. When absent, FRIENDLY_* conditions fail (do not invent multi-unit
  // state). Cite: CheckEvent ~379–437.
  friendlies?: readonly EventAiFriendlyUnit[];
  // FACING_TARGET: 0 = creature is in victim's back (melee), 1 = in front. When undefined, FACING_TARGET
  // fails closed. Cite: CheckEvent ~530–541.
  facingTarget?: 0 | 1;
  // TARGET_NOT_REACHABLE: victim present + combat movement + path not reachable. Cite: CheckEvent ~545–547.
  targetNotReachable?: boolean;
  // SELECT_ATTACKING_TARGET: true when a random threat target exists in [min,max] range. Cite: CheckEvent
  // ~519–527.
  hasAttackingTargetInRange?: boolean;
  // Is ANY living hostile inside melee reach? SELECT_FLAG_IN_MELEE_RANGE used as an existence test
  // before a self-centred AoE, not as a pick. Cite: shadowfang_keep.cpp:477; darkshore.cpp:805.
  anyHostileInMelee?: boolean;
  // Lifecycle pulses — true only when the matching C++ hook would enqueue the event. Cite:
  // JustRespawned ~1401; EnterEvadeMode ~1478; JustReachedHome ~1462; ReceiveAIEvent ~1565.
  spawned?: boolean;
  evading?: boolean;
  reachedHome?: boolean;
  oocLos?: boolean;
  /** RECEIVE_AI_EVENT pulse (matches event.receiveAIEvent). */
  receivedAiEvent?: { eventType: number; senderEntry: number };
  /** RECEIVE_EMOTE pulse. */
  receivedEmoteId?: number;
  /** SUMMONED_UNIT / SUMMONED_JUST_DIED / SUMMONED_JUST_DESPAWN invoker entry. */
  summonedEntry?: number;
  /** SPELLHIT / SPELLHIT_TARGET pulse. */
  spellHitId?: number;
  spellHitSchoolMask?: number;
  /** SPELL_CAST: spell id just cast by self. */
  spellCastId?: number;
  // JustDied / JustKilledUnit pulse flags — DEATH / KILL holders must not fire on the living poll path (C++
  // only enqueues from those hooks). Cite: CreatureEventAI.cpp JustDied / KilledUnit.
  justDied?: boolean;
  justKilled?: boolean;
  // combat_condition gate for a spell-list row. Absent → ungated (the caller has no condition tables),
  // which keeps a fixture bundle firing every row it fires today. Cite: UnitAI.cpp:1218-1224.
  combatConditionOk?: (conditionId: number) => boolean;
  // ScriptDev instance-data gate. Absent → ungated. Cite: boss_hakkar.cpp aspect CombatCondition 1005-1009
  // / zulgurub.h TYPE_*.
  instanceDataOk?: (field: number, equals?: number, notEquals?: number) => boolean;
  // Current victim in melee. `false` = known out; `true`/absent = in melee or unknown. Cite: Unit.cpp
  // CanReachWithMeleeAttack; boss_grobbulus.cpp:97-110.
  victimInMelee?: boolean;
  // False on a tick BETWEEN two spell-list evaluations: blocking rows are not eligible, while
  // EventAI and ScriptDev slots keep their own timers. Absent is open. Cite: UnitAI.cpp:1187.
  spellListPollOpen?: boolean;
  // The creature already has a bar up or a channel running, so a ready timer WAITS rather than
  // clipping: only CAST_TRIGGERED / CAST_INTERRUPT_PREVIOUS get through. Cite: UnitAI.cpp:178.
  selfCasting?: boolean;
  // Probability weight roll among the eligible spell-list rows. Absent is position priority,
  // which is what C++ falls back to when every Probability is 0. Cite: UnitAI.cpp:1246-1291.
  rng?: Rng;
  /** Whether personal/category CD allows this spell id. */
  spellReady: (spell: SpellDef) => boolean;
  /** Power / silence / etc. */
  canCast: (spell: SpellDef) => boolean;
  // True when the intended cast target already has this spell's aura (any stacks). Used by
  // CAST_AURA_NOT_PRESENT (0x20). Cite: CreatureEventAI.cpp ACTION_T_CAST ~792–793.
  targetHasSpellAura?: (spellId: number) => boolean;
  // Same, but for the CASTER — the row's target resolves to self/none, so C++ reads `caster->HasAura` and
  // never the victim's bag. Cite: UnitAI.cpp:184-192 `if (!target) { if (caster->HasAura(spellId)) ... }`.
  selfHasSpellAura?: (spellId: number) => boolean;
  // CAST_PLAYER_ONLY — true when the resolved cast target is a player-controlled unit. Cite:
  // CreatureEventAI.cpp ~790–791 SELECT_FLAG_PLAYER.
  targetIsPlayer?: boolean;
  // True when a living hostile player has this Unit::getClass() value, so a selectClass slot is
  // skipped when none is on the threat list. Cite: boss_nefarian.cpp:266.
  hostileHasClass?: (classId: number) => boolean;
  // CAST_IGNORE_UNSELECTABLE — true when the target has UNIT_FLAG_NOT_SELECTABLE / UNINTERACTIBLE set.
  // Absent → treat as selectable. Cite: UnitAI.cpp ~214 TRIGGERED_IGNORE_UNSELECTABLE_FLAG.
  targetUnselectable?: boolean;
}

// A pollOnly row casts nothing, so it must arm even when it names no spell — Heigan's taunt and the
// Thaddius revive tick were both dropped here. Cite: boss_four_horsemen.cpp:169-174.
const POLL_ONLY_PLACEHOLDERS = new Map<number, SpellDef>();

function pollOnlyPlaceholder(spellId: number): SpellDef {
  const id = spellId | 0;
  const hit = POLL_ONLY_PLACEHOLDERS.get(id);
  if (hit) return hit;
  const made: SpellDef = {
    id,
    name: 'Scripted Action',
    rank: 0,
    school: 'physical',
    powerType: 'mana',
    cost: 0,
    castTimeMs: 0,
    cooldownMs: 0,
    gcdMs: 0,
    rangeMax: 0,
    reqLevel: 0,
    effects: [],
  };
  POLL_ONLY_PLACEHOLDERS.set(id, made);
  return made;
}

// Which spell this ROW casts for the spawn's life: a pickPerSpawn pool is drawn ONCE, and an
// all-absent pool falls back to the declared id. Cite: zulgurubScripts.cpp:61,110-115.
export function pickPerSpawnSpellId(
  entry: CreatureCastEntry,
  spellsById: ReadonlyMap<number, SpellDef>,
  rng?: Rng,
): number {
  const pool = (entry.pickPerSpawnSpellIds ?? []).map((id) => id | 0).filter((id) => spellsById.has(id));
  if (pool.length === 0) return entry.spellId;
  if (!rng || pool.length === 1) return pool[0]!;
  return pool[rng.int(0, pool.length - 1)]!;
}

// Arm slots at combat or OOC start: TIMER_* rows take their initial min/max (urand when an rng
// is given), and AGGRO or bare spells start readyAt 0. Cite: CreatureEventAI.cpp ~1607.
export function armCreatureCastSlots(
  entries: readonly CreatureCastEntry[],
  spellsById: ReadonlyMap<number, SpellDef>,
  rng?: Rng,
): CreatureCastSlot[] {
  const slots: CreatureCastSlot[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    // One urand pick per SPAWN, held all fight — so it belongs here, not in the per-fire scheduler
    // where rotateSpellIds lives. Cite: zulgurubScripts.cpp:61,110-115.
    const spell = spellsById.get(pickPerSpawnSpellId(entry, spellsById, rng))
      ?? (entry.pollOnly === true ? pollOnlyPlaceholder(entry.spellId) : undefined);
    if (!spell) continue;
    let readyAt = 0;
    const et = entry.eventType;
    // TIMER_* events roll an initial CD, and bare creatureCasts that only set initialMinMs are
    // schedule-shaped the same way, so honor the delay. Cite: UnitAI.cpp AddInitialCooldowns.
    const timerEvent =
      et === EVENT_T.TIMER_IN_COMBAT ||
      et === EVENT_T.TIMER_OOC ||
      et === EVENT_T.TIMER_GENERIC;
    const bareInitial =
      et == null && (entry.initialMinMs != null || entry.initialMaxMs != null);
    if (timerEvent || bareInitial) {
      readyAt = rollTimer(entry.initialMinMs ?? 0, entry.initialMaxMs ?? entry.initialMinMs ?? 0, rng);
    }
    // AddCombatAction(id, true) → disabled until ResetCombatAction / arm_timer.
    // Cite: boss_marli.cpp:72; TimerAI.cpp disabled ctor → CreatureCastSlot.exhausted.
    const slot: CreatureCastSlot = {
      entry,
      spell,
      readyAt,
      exhausted: entry.startDisabled === true,
      listIndex: i,
      fires: 0,
    };
    const rotateIds = entry.rotateSpellIds ?? [];
    if (rotateIds.length > 0) {
      const pool: SpellDef[] = [];
      for (const id of rotateIds) {
        const sp = spellsById.get(id | 0);
        if (sp) pool.push(sp);
      }
      if (pool.length > 0) {
        slot.rotatePool = pool;
        initRotateWave(slot, rng);
      }
    }
    slots.push(slot);
  }
  return slots;
}

// AuraInterruptFlags bits any pull clears: the creature swings, takes damage, or eats a hostile
// spell early. Sneak 7939 carries 0x1803, so it must not be re-applied as spawn state.
const AURA_INTERRUPT_ON_PULL = 0x1 | 0x2 | 0x1000 | 0x01000000;

// The EVENT_T_TIMER_OOC self-casts a creature already wears when the party pulls it: an OOC row
// arms at spawn and can never fire in combat, so only its permanent auras carry (126 rows).
export function spawnOocSelfAuraRows(
  entries: readonly CreatureCastEntry[],
  spellsById: ReadonlyMap<number, SpellDef>,
): Array<{ entry: CreatureCastEntry; spell: SpellDef }> {
  const out: Array<{ entry: CreatureCastEntry; spell: SpellDef }> = [];
  for (const entry of entries) {
    if (entry.eventType !== EVENT_T.TIMER_OOC) continue;
    // action target 0 is dropped by the bake (lib-eventai-cast.mjs:63), so absent IS self.
    const tgt = entry.target;
    if (entry.targetSpace === 'spell_list') continue;
    if (!(tgt == null || tgt === TARGET_T.SELF || tgt === TARGET_T.NONE)) continue;
    const spell = spellsById.get(entry.spellId);
    if (!spell) continue;
    if (!spell.rawEffects?.some((r) => (r.effect | 0) === 6)) continue;
    const fx = spell.effects ?? [];
    if (fx.length === 0 || fx.some((f) => ('durationMs' in f ? (f.durationMs ?? 0) : 0) > 0)) continue;
    if (((spell.auraInterruptFlags ?? 0) & AURA_INTERRUPT_ON_PULL) !== 0) continue;
    out.push({ entry, spell });
  }
  return out;
}

// The rows above, minus the ones whose event_chance missed. A miss re-arms the repeat timer then
// disables the row, so it is one roll per spawn, not a retry loop. Cite: CreatureEventAI.cpp:606.
export function spawnOocSelfAuras(
  entries: readonly CreatureCastEntry[],
  spellsById: ReadonlyMap<number, SpellDef>,
  rng?: Rng,
): SpellDef[] {
  const out: SpellDef[] = [];
  for (const row of spawnOocSelfAuraRows(entries, spellsById)) {
    if (!rollCreatureCastChance(row.entry, rng)) continue;
    out.push(row.spell);
  }
  return out;
}

function shuffleSpellDefs(pool: readonly SpellDef[], rng?: Rng): SpellDef[] {
  const out = pool.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng ? rng.int(0, i) : i;
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Aggro shuffle + urand wave size. Cite: boss_fankriss.cpp:90-99,150. */
function initRotateWave(slot: CreatureCastSlot, rng?: Rng): void {
  const pool = slot.rotatePool;
  if (!pool?.length) return;
  slot.rotateOrder = shuffleSpellDefs(pool, rng);
  const lo = slot.entry.waveMinCount ?? 1;
  const hi = slot.entry.waveMaxCount ?? lo;
  const n = rng ? rng.int(lo, hi) : lo;
  slot.waveLeft = Math.max(1, Math.min(n, pool.length));
  slot.spell = slot.rotateOrder[slot.waveLeft - 1] ?? slot.spell;
}

// CAST_OK of a rotating-wave slot. Intra-wave 5-7s; else reshuffle and let repeat re-arm. Cite:
// boss_fankriss.cpp:141-157.
function advanceRotateWave(slot: CreatureCastSlot, t: number, rng?: Rng): boolean {
  if (!slot.rotatePool?.length) return false;
  const left = (slot.waveLeft ?? 1) - 1;
  slot.waveLeft = left;
  if (left > 0) {
    slot.spell = slot.rotateOrder?.[left - 1] ?? slot.spell;
    const lo = slot.entry.intraWaveMinMs ?? 0;
    const hi = slot.entry.intraWaveMaxMs ?? lo;
    if (lo > 0 || hi > 0) {
      slot.readyAt = t + rollTimer(lo, hi, rng);
      return true;
    }
  }
  initRotateWave(slot, rng);
  return false;
}

// Build cast entries from a bare spell id list. NOT a combat schedule source: specials must come
// from EventAI, spellList or ScriptDev timers. Kept for tests and explicit MAIN_SPELL wiring.
export function castEntriesFromSpellIds(spellIds: readonly number[]): CreatureCastEntry[] {
  const out: CreatureCastEntry[] = [];
  const seen = new Set<number>();
  for (const id of spellIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ spellId: id });
  }
  return out;
}

// True when a cast entry has a real schedule — an EventAI event type, initial/repeat timers, or
// the weapon-paced CAST_MAIN_SPELL. Bare {spellId} rows are schedule-less specials.
export function hasCreatureCastSchedule(entry: CreatureCastEntry): boolean {
  if (entry.eventType != null) return true;
  if (entry.initialMinMs != null || entry.initialMaxMs != null) return true;
  if (entry.repeatMinMs != null || entry.repeatMaxMs != null) return true;
  if (((entry.castFlags ?? 0) & CAST_FLAG.MAIN_SPELL) !== 0) return true;
  return false;
}

/** Dev-only: schedule-less special kits are bugs, never silent weapon-pace spam. */
const _bareSpecialWarned = new Set<string>();
export function warnScheduleLessCreatureSpecial(
  creatureName: string,
  spellIds: readonly number[],
): void {
  const key = `${creatureName}:${spellIds.join(',')}`;
  if (_bareSpecialWarned.has(key)) return;
  _bareSpecialWarned.add(key);
  const msg =
    `[aifid D4] schedule-less creature special kit on "${creatureName}" ` +
    `spells=[${spellIds.join(',')}] - specials need EventAI/spellList/ScriptDev schedule; ` +
    `only melee auto uses weapon pace (GAPS D4). Template spells alone do not cast.`;
  // Loud in dev / tests; never throw (determinism + production fights stay melee-only).
  // eslint-disable-next-line no-console
  console.warn(msg);
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    // Prefer assert.ok style surface when `assert` is available via tests.
    if (typeof globalThis !== 'undefined' && (globalThis as { __AIFID_D4_ASSERT?: boolean }).__AIFID_D4_ASSERT) {
      throw new Error(msg);
    }
  }
}

/** Test helper — clear once-per-name warn cache. */
export function resetScheduleLessWarnCacheForTests(): void {
  _bareSpecialWarned.clear();
}

// Does this row's target resolve to the caster itself? EventAI SELF 0 / NONE 15, spell-list
// NONE 0 / SELF 2 — the 0–7 ids overlap, so the space decides. Cite: UnitAI.cpp:186-192.
function castTargetIsCaster(entry: CreatureCastEntry): boolean {
  const mode = entry.target;
  if (mode == null) return false;
  return entry.targetSpace === 'spell_list'
    ? mode === SPELL_LIST_TARGET.NONE || mode === SPELL_LIST_TARGET.SELF
    : mode === TARGET_T.SELF || mode === TARGET_T.NONE;
}

// Pick the next ready cast deterministically: eligible rows first, then lowest readyAt, listIndex,
// spellId. Null when none. The caller rolls event_chance and re-arms via markCreatureCastUsed.
export function pickCreatureCast(slots: readonly CreatureCastSlot[], ctx: CastPickContext): CreatureCastSlot | null {
  let best: CreatureCastSlot | null = null;
  let bestFromSpellList = false;
  /** Eligible blocking spell-list rows this evaluation — the pool the Probability roll draws from. */
  let listEligible: CreatureCastSlot[] | null = null;
  const phase = ctx.phase ?? 0;
  for (const slot of slots) {
    if (slot.exhausted) continue;
    const fireCap = slot.entry.maxFires ?? 0;
    if (fireCap > 0 && slot.fires >= fireCap) continue;
    if (ctx.t < slot.readyAt) continue;
    // A spell-list row only fires on an evaluation tick; NON_BLOCKING rows are the exception and
    // never compete for the slot. Cite: UnitAI.cpp:1187-1191 the 1200 ms timer; :1265 nonBlocking.
    const fromSpellList =
      (slot.entry.targetSpace === 'spell_list' || slot.entry.spellListPolled === true)
      && slot.entry.nonBlocking !== true;
    if (fromSpellList && ctx.spellListPollOpen === false) continue;
    // Mid-cast: hold the row instead of clipping the caster's own bar. Cite: UnitAI.cpp:178,:280.
    if (ctx.selfCasting) {
      const midCastOk = (slot.entry.castFlags ?? 0)
        & (CAST_FLAG.TRIGGERED | CAST_FLAG.INTERRUPT_PREVIOUS);
      if (midCastOk === 0) continue;
    }
    // Phase gate — CreatureEventAI.cpp CheckEvent ~266–270
    if (eventPhaseBlocked(slot.entry.eventInversePhaseMask, phase)) continue;
    if (!eventConditionsOk(slot.entry, ctx)) continue;
    // creature_spell_list CombatCondition — re-checked every pick, like UpdateSpellLists.
    // Cite: UnitAI.cpp:1218-1224.
    const condId = slot.entry.combatCondition ?? 0;
    if (condId > 0 && ctx.combatConditionOk && !ctx.combatConditionOk(condId)) continue;
    if (slot.entry.instanceDataField != null && ctx.instanceDataOk) {
      if (!ctx.instanceDataOk(
        slot.entry.instanceDataField | 0,
        slot.entry.instanceDataEquals,
        slot.entry.instanceDataNotEquals,
      )) continue;
    }
    if (slot.entry.requireVictimNotInMelee && ctx.victimInMelee !== false) continue;
    // `if (Unit* target = SelectAttackingTarget(..., IN_MELEE_RANGE))` guarding a nullptr cast: the
    // flag is an EXISTENCE test here. Absent knowledge is treated as unknown, so the row still fires.
    if (slot.entry.requireMeleeTargetExists && ctx.anyHostileInMelee === false) continue;
    if (slot.entry.pollOnly) {
      if (!best || compareSlots(slot, best) < 0) best = slot;
      continue;
    }
    // Cast-flag gates at pick time (DoCastSpellIfCan pre-checks + GetTargetByType selectFlags).
    // Cite: CreatureEventAI.cpp ACTION_T_CAST ~784–802; UnitAI.cpp DoCastSpellIfCan ~160–223.
    const flags = slot.entry.castFlags ?? 0;
    // CAST_AURA_NOT_PRESENT — the aura is read off the SPELL'S target, so a self-cast reads the
    // caster. Reading the victim made the gate never true and Venoxis re-cast Frenzy 171 times.
    if ((flags & CAST_FLAG.AURA_NOT_PRESENT) !== 0) {
      const holder = castTargetIsCaster(slot.entry) ? ctx.selfHasSpellAura : ctx.targetHasSpellAura;
      if (holder?.(slot.spell.id)) continue;
    }
    // CAST_PLAYER_ONLY — ~790–791 SELECT_FLAG_PLAYER.
    if ((flags & CAST_FLAG.PLAYER_ONLY) !== 0) {
      if (ctx.targetIsPlayer === false) continue;
    }
    // getClass() existence — skip the arm when no player of that class is hostile.
    // Cite: boss_nefarian.cpp:266-280; SharedDefines.h:65-79.
    const needClass = slot.entry.selectClass ?? 0;
    if (needClass > 0 && ctx.hostileHasClass && !ctx.hostileHasClass(needClass)) continue;
    // CAST_TARGET_CASTING — ~794–795 SELECT_FLAG_CASTING.
    if ((flags & CAST_FLAG.TARGET_CASTING) !== 0) {
      if (!ctx.targetCasting) continue;
    }
    // CAST_IGNORE_UNSELECTABLE — without the bit, unselectable targets are invalid.
    if ((flags & CAST_FLAG.IGNORE_UNSELECTABLE) === 0 && ctx.targetUnselectable === true) {
      continue;
    }
    if (!ctx.spellReady(slot.spell)) continue;
    // FORCE_CAST / FORCE_TARGET_SELF skip CanCastSpell (mana/range) — UnitAI.cpp ~196–202.
    const forceCast =
      (flags & (CAST_FLAG.FORCE_CAST | CAST_FLAG.FORCE_TARGET_SELF)) !== 0;
    if (!forceCast && !ctx.canCast(slot.spell)) continue;
    if (fromSpellList) (listEligible ??= []).push(slot);
    if (!best || compareSlots(slot, best) < 0) { best = slot; bestFromSpellList = fromSpellList; }
  }
  // The spell list is weight-rolled, not ordered: C++ shuffles and rolls irand(0, sum-1), and sum 0
  // is position priority. A ScriptDev-ported row carries no weight, so the FIFO pick stands.
  if (bestFromSpellList && listEligible && listEligible.length > 1) {
    return rollSpellListSlot(listEligible, ctx.rng) ?? best;
  }
  return best;
}

// One weighted draw over the eligible spell-list rows. Null when there is no Rng or every
// Probability is 0, and the caller then keeps its position-priority pick. Cite: UnitAI.cpp:1246.
function rollSpellListSlot(
  eligible: readonly CreatureCastSlot[],
  rng?: Rng,
): CreatureCastSlot | null {
  if (!rng) return null;
  let sum = 0;
  for (const s of eligible) sum += Math.max(0, (s.entry.spellListProbability ?? 0) | 0);
  if (sum <= 0) return null;
  const order = eligible.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  let roll = rng.int(0, sum - 1);
  for (const s of order) {
    const p = Math.max(0, (s.entry.spellListProbability ?? 0) | 0);
    if (roll < p) return s;
    roll -= p;
  }
  return null;
}

// One CombatAI getClass() switch: pick a random hostile player and fire the sibling whose
// selectClass matches. Null means no matching arm. Cite: boss_nefarian.cpp:266-287.
export function resolveClassCallCastSlot(
  slots: readonly CreatureCastSlot[],
  picked: CreatureCastSlot,
  players: readonly { classId?: number; spec?: { classId?: number } }[],
  rng?: Rng,
): CreatureCastSlot | null {
  const e = picked.entry;
  if (e.scriptId == null || (e.selectClass ?? 0) <= 0) return picked;
  const siblings = slots.filter(
    (s) => !s.exhausted && s.entry.scriptId === e.scriptId && (s.entry.selectClass ?? 0) > 0,
  );
  if (siblings.length === 0) return picked;
  const classOf = (p: { classId?: number; spec?: { classId?: number } }) =>
    ((p.classId ?? p.spec?.classId ?? 0) | 0);
  const pool = players.filter((p) => classOf(p) > 0);
  if (pool.length === 0) return null;
  let chosen = pool[0]!;
  if (pool.length > 1 && rng) {
    chosen = pool[rng.int(0, pool.length - 1)] ?? chosen;
  }
  const cls = classOf(chosen);
  return siblings.find((s) => ((s.entry.selectClass ?? 0) | 0) === cls) ?? null;
}

export function resolveRandomActionCastSlot(
  slots: readonly CreatureCastSlot[],
  picked: CreatureCastSlot,
  rng?: Rng,
): CreatureCastSlot {
  const e = picked.entry;
  if (e.scriptId == null || ((e.eventFlags ?? 0) & EFLAG_RANDOM_ACTION) === 0) return picked;
  const siblings = slots.filter((s) => !s.exhausted && s.entry.scriptId === e.scriptId);
  if (siblings.length <= 1 || !rng) return picked;
  return siblings[rng.int(0, siblings.length - 1)] ?? picked;
}

// Re-arm the whole script row after one of its RANDOM_ACTION slots fired: the row is one event
// with one timer, so every sibling mirrors it. Rows without the flag keep per-slot re-arm.
export function markCreatureCastRowUsed(
  slots: readonly CreatureCastSlot[],
  fired: CreatureCastSlot,
  t: number,
  rng?: Rng,
): void {
  markCreatureCastUsed(fired, t, rng);
  const e = fired.entry;
  if (e.scriptId == null || ((e.eventFlags ?? 0) & EFLAG_RANDOM_ACTION) === 0) return;
  for (const s of slots) {
    if (s === fired || s.entry.scriptId !== e.scriptId) continue;
    s.readyAt = fired.readyAt;
    s.exhausted = fired.exhausted;
  }
}

// event_chance gate — CreatureEventAI.cpp ProcessEvent ~607–612. `event_chance <= rnd % 100` fails. Absent
// / 100 → always true. Without rng, only chancePct ≥ 100 (or absent) succeeds (deterministic).
export function rollCreatureCastChance(entry: CreatureCastEntry, rng?: Rng): boolean {
  const chance = entry.chancePct ?? 100;
  if (chance >= 100) return true;
  if (chance <= 0) return false;
  if (!rng) return false;
  // rnd % 100 in [0, 99]; success when chance > rnd%100 ⇔ rnd%100 < chance
  return rng.int(0, 99) < chance;
}

// After a cast attempt, success or chance fail, arm the next timer and/or exhaust. One-shots
// (AGGRO/DEATH/KILL) and timer rows without EFLAG_REPEATABLE exhaust. Cite: ResetEvent ~573.
export function markCreatureCastUsed(slot: CreatureCastSlot, t: number, rng?: Rng): void {
  const e = slot.entry;
  const et = e.eventType;

  // IsRepeatableEvent-false types plus the KILL one-shot path. KILL is repeatable in C++ but
  // legacy Phonecraft always exhausted it — kept, for byte-identical fights.
  if (isAlwaysExhaustEventType(et)) {
    slot.exhausted = true;
    return;
  }

  const hasRepeat =
    (e.repeatMinMs != null && e.repeatMinMs > 0) ||
    (e.repeatMaxMs != null && e.repeatMaxMs > 0);

  // Without EFLAG_REPEATABLE, fire once and skip the timer re-arm. Bare tpl entries with no
  // eventFlags field keep phase-1 CD/repeat behaviour. Cite: ResetEvent enabled=false.
  if (
    isRepeatableEventType(et) &&
    e.eventFlags != null &&
    (e.eventFlags & EFLAG_REPEATABLE) === 0
  ) {
    slot.exhausted = true;
    return;
  }

  if (advanceRotateWave(slot, t, rng)) return;

  if (hasRepeat) {
    const lo = e.repeatMinMs ?? e.repeatMaxMs ?? 0;
    const hi = e.repeatMaxMs ?? e.repeatMinMs ?? 0;
    slot.readyAt = t + rollTimer(lo, hi, rng);
  } else {
    // Rely on spell/category CD and keep the slot eligible for re-check. Zero-CD main or ranged
    // filler would re-fire every tick, so the caller may push readyAt further after the cast.
    slot.readyAt = t;
  }
}

// CreatureAI::ResetTimersOnEvade — an evading creature re-rolls every in-combat timer off its
// INITIAL band, so a re-pull opens on the first pull's schedule. Cite: CreatureAI.cpp:66-71.
export function resetCreatureCastSlotsOnEvade(
  slots: readonly CreatureCastSlot[],
  t: number,
  rng?: Rng,
): void {
  for (const slot of slots) {
    const e = slot.entry;
    const et = e.eventType;
    const timerEvent = et === EVENT_T.TIMER_IN_COMBAT
      || et === EVENT_T.TIMER_OOC
      || et === EVENT_T.TIMER_GENERIC;
    const bareInitial = et == null && (e.initialMinMs != null || e.initialMaxMs != null);
    // A row disabled at arm time (AddCombatAction(id, true)) stays disabled — only the script
    // re-arms it. Cite: TimerAI.cpp disabled ctor.
    if (!timerEvent && !bareInitial) continue;
    slot.exhausted = false;
    slot.fires = 0;
    slot.readyAt = t + rollTimer(e.initialMinMs ?? 0, e.initialMaxMs ?? e.initialMinMs ?? 0, rng);
    if (slot.rotatePool?.length) initRotateWave(slot, rng);
  }
}

/** CAST_OK of a maxFires slot. Cite: boss_gothik.cpp:318 ++m_teleportCount; :305 >= 4. */
export function countCreatureCastFire(slot: CreatureCastSlot): void {
  const cap = slot.entry.maxFires ?? 0;
  if (cap <= 0) return;
  slot.fires += 1;
  if (slot.fires >= cap) slot.exhausted = true;
}

// After a successful CAST_MAIN_SPELL, pace the slot by `paceMs` so a no-CD spell cannot re-fire
// every tick. Only CAST_MAIN_SPELL uses weapon pacing; bare template specials never do.
export function paceMainSpellSlot(slot: CreatureCastSlot, t: number, paceMs: number): void {
  if (paceMs <= 0) return;
  const flags = slot.entry.castFlags ?? 0;
  const isMain = (flags & CAST_FLAG.MAIN_SPELL) !== 0;
  if (!isMain) return;
  slot.readyAt = Math.max(slot.readyAt, t + paceMs);
}

// IsRepeatableEvent — true for types that honor EFLAG_REPEATABLE. Cite: CreatureEventAI.cpp
// IsRepeatableEvent ~196–208.
function isRepeatableEventType(et: number | undefined): boolean {
  if (et == null) return true;
  if (
    et === EVENT_T.SPAWNED ||
    et === EVENT_T.DEATH ||
    et === EVENT_T.AGGRO ||
    et === EVENT_T.EVADE ||
    et === EVENT_T.REACHED_HOME
  ) {
    return false;
  }
  return true;
}

/** One-shot lifecycle types that always exhaust after fire (IsRepeatableEvent false). */
function isAlwaysExhaustEventType(et: number | undefined): boolean {
  if (et == null) return false;
  return (
    et === EVENT_T.SPAWNED ||
    et === EVENT_T.DEATH ||
    et === EVENT_T.AGGRO ||
    et === EVENT_T.EVADE ||
    et === EVENT_T.REACHED_HOME ||
    et === EVENT_T.KILL
  );
}

// EVENT_HANDLERS — CheckEvent body per type (CreatureEventAI.cpp ~291–551) Literal keys so
// scripts/aifid/census.mjs parseHandlerTable can enumerate them.

export type EventConditionHandler = (entry: CreatureCastEntry, ctx: CastPickContext) => boolean;

function inCombatFlag(ctx: CastPickContext): boolean {
  // Combat schedulers omit the flag → treat as in combat (legacy).
  return ctx.inCombat !== false;
}

function friendlyInRadius(
  f: EventAiFriendlyUnit,
  radiusYd: number,
): boolean {
  if (f.distanceYd == null) return true;
  return f.distanceYd <= radiusYd;
}

/** DoSelectLowestHpFriendly predicate — CreatureEventAI.cpp ~379–390. */
function friendlyHpMatch(
  entry: CreatureCastEntry,
  friendlies: readonly EventAiFriendlyUnit[],
): boolean {
  const deficit = entry.friendlyHpDeficit;
  const radius = entry.friendlyRadiusYd ?? 0;
  const isPct = entry.friendlyHpIsPercent === true;
  for (const f of friendlies) {
    if (!friendlyInRadius(f, radius)) continue;
    // Incomplete cast row (no deficit) — do not invent a threshold; skip unit.
    // Prefer enrichCastEntriesFromScripts so baked creatureCasts gain real params.
    if (deficit == null) continue;
    if (isPct) {
      // deficit is HP% missing required (e.g. 30 → fire when hpPct <= 70)
      if (f.hpPct <= 100 - deficit) return true;
    } else {
      // absolute missing HP: maxHp - hp >= deficit
      if (f.maxHp - f.hp >= deficit) return true;
    }
  }
  return false;
}

function friendlyMissingBuffMatch(
  entry: CreatureCastEntry,
  friendlies: readonly EventAiFriendlyUnit[],
): boolean {
  // Cast-bake rows often omit event params; the CAST spell is the buff being applied.
  const sid = entry.friendlyBuffSpellId ?? entry.auraSpellId ?? (entry.spellId || 0);
  if (!sid) return false;
  const radius = entry.friendlyRadiusYd ?? 0;
  for (const f of friendlies) {
    if (!friendlyInRadius(f, radius)) continue;
    if (f.hasAura?.(sid, 1)) continue;
    return true;
  }
  return false;
}

function friendlyIsCcMatch(
  entry: CreatureCastEntry,
  friendlies: readonly EventAiFriendlyUnit[],
): boolean {
  const radius = entry.friendlyRadiusYd ?? 0;
  for (const f of friendlies) {
    if (!friendlyInRadius(f, radius)) continue;
    if (f.hasCc) return true;
  }
  return false;
}

function spellHitMatches(entry: CreatureCastEntry, ctx: CastPickContext): boolean {
  // Pulse required — C++ only enqueues on SpellHit. Cite: SpellHit path + CheckEvent ~345–347.
  if (ctx.spellHitId == null) return false;
  const want = entry.spellHitSpellId ?? entry.auraSpellId ?? 0;
  if (want && ctx.spellHitId !== want) return false;
  const school = entry.spellHitSchoolMask;
  // -1 / 0xffffffff = any school; 0 often means "unset / any" in dumps
  if (school != null && school !== -1 && school !== 0xffffffff && school !== 0) {
    if (ctx.spellHitSchoolMask == null) return false;
    if ((ctx.spellHitSchoolMask & school) === 0) return false;
  }
  return true;
}

// Implemented EVENT_T condition table. Presence = census "implemented". Cite: CreatureEventAI.cpp
// CheckEvent ~291–551 per case.
export const EVENT_HANDLERS: Record<number, EventConditionHandler> = {
  // TIMER_IN_COMBAT — ~291–293 Optional hpPct band (ScriptDev: Gandling portal only while HP > 3%). Cite:
  // boss_darkmaster_gandling.cpp:94; CreatureEventAI.cpp percent_range ~301–310.
  [EVENT_T.TIMER_IN_COMBAT]: (entry, ctx) => {
    if (!inCombatFlag(ctx)) return false;
    if (entry.hpPctMax != null || entry.hpPctMin != null) {
      return percentBandOk(ctx.hpPct, entry.hpPctMax, entry.hpPctMin);
    }
    return true;
  },
  // TIMER_OOC — ~295–297
  [EVENT_T.TIMER_OOC]: (_e, ctx) => !inCombatFlag(ctx),
  // TIMER_GENERIC — ~299–300 (any combat state)
  [EVENT_T.TIMER_GENERIC]: () => true,
  // HP — ~301–310
  [EVENT_T.HP]: (entry, ctx) => percentBandOk(ctx.hpPct, entry.hpPctMax, entry.hpPctMin),
  // MANA — ~312–321
  [EVENT_T.MANA]: (entry, ctx) => {
    if (ctx.manaPct == null) return false;
    return percentBandOk(ctx.manaPct, entry.manaPctMax, entry.manaPctMin);
  },
  // AGGRO — ~323–324 (hook-gated; poll path treats ready slot as eligible like legacy)
  [EVENT_T.AGGRO]: () => true,
  // KILL — ~325–327 (JustKilledUnit hook only — never poll while living)
  [EVENT_T.KILL]: (_e, ctx) => ctx.justKilled === true,
  // DEATH — ~329–341 (JustDied hook only — never poll while living; combat uses runEnemyDeathEventAi)
  [EVENT_T.DEATH]: (_e, ctx) => ctx.justDied === true,
  // EVADE — ~343–344; requires evade pulse (EnterEvadeMode ~1478)
  [EVENT_T.EVADE]: (_e, ctx) => ctx.evading === true,
  // SPELLHIT — enqueued from the SpellHit hook only, filtered by spell id and school mask. Polling
  // it as () => true fired the row every tick. Cite: CreatureEventAI.cpp:1666; Spell.cpp:1345.
  [EVENT_T.SPELLHIT]: (entry, ctx) => spellHitMatches(entry, ctx),
  // RANGE — ~349–354
  [EVENT_T.RANGE]: (entry, ctx) => {
    if (ctx.distanceYd == null) return true;
    const minD = entry.rangeMinYd ?? 0;
    const maxD = entry.rangeMaxYd ?? Number.POSITIVE_INFINITY;
    return ctx.distanceYd >= minD && ctx.distanceYd <= maxD;
  },
  // OOC_LOS — ~356–361; requires oocLos pulse (MoveInLineOfSight OOC)
  [EVENT_T.OOC_LOS]: (_e, ctx) => ctx.oocLos === true && !inCombatFlag(ctx),
  // SPAWNED — ~362–363; JustRespawned pulse or combat-start arm (readyAt=0 one-shot)
  // When spawned flag omitted, allow once like AGGRO (fight arm ≈ spawn into session).
  [EVENT_T.SPAWNED]: (_e, ctx) => ctx.spawned !== false,
  // TARGET_HP — ~364–373
  [EVENT_T.TARGET_HP]: (entry, ctx) => {
    if (ctx.targetHpPct == null) return false;
    return percentBandOk(ctx.targetHpPct, entry.hpPctMax, entry.hpPctMin);
  },
  // TARGET_CASTING — ~375–377
  [EVENT_T.TARGET_CASTING]: (_e, ctx) => ctx.targetCasting === true,
  // FRIENDLY_HP — ~379–390
  [EVENT_T.FRIENDLY_HP]: (entry, ctx) => {
    if (!inCombatFlag(ctx)) return false;
    if (!ctx.friendlies || ctx.friendlies.length === 0) return false;
    return friendlyHpMatch(entry, ctx.friendlies);
  },
  // FRIENDLY_IS_CC — ~392–405
  [EVENT_T.FRIENDLY_IS_CC]: (entry, ctx) => {
    if (!inCombatFlag(ctx)) return false;
    if (!ctx.friendlies || ctx.friendlies.length === 0) return false;
    return friendlyIsCcMatch(entry, ctx.friendlies);
  },
  // FRIENDLY_MISSING_BUFF — ~407–437
  [EVENT_T.FRIENDLY_MISSING_BUFF]: (entry, ctx) => {
    const mode = entry.friendlyBuffInCombat ?? 0;
    const combat = inCombatFlag(ctx);
    if (mode === 0 && !combat) return false;
    if (mode === 2 && combat) return false;
    if (!ctx.friendlies || ctx.friendlies.length === 0) return false;
    return friendlyMissingBuffMatch(entry, ctx.friendlies);
  },
  // SUMMONED_UNIT — ~439–450
  [EVENT_T.SUMMONED_UNIT]: (entry, ctx) => {
    if (ctx.summonedEntry == null) return false;
    const want = entry.summonedCreatureId ?? 0;
    return !want || ctx.summonedEntry === want;
  },
  // TARGET_MANA — ~452–461
  [EVENT_T.TARGET_MANA]: (entry, ctx) => {
    if (ctx.targetManaPct == null) return false;
    return percentBandOk(ctx.targetManaPct, entry.manaPctMax, entry.manaPctMin);
  },
  // REACHED_HOME — ~463–464
  [EVENT_T.REACHED_HOME]: (_e, ctx) => ctx.reachedHome === true,
  // RECEIVE_EMOTE — ~465–471 (product has no /emote surface → disposition in census;
  // handler still present so domain pulses work if a surface is added later)
  [EVENT_T.RECEIVE_EMOTE]: (entry, ctx) => {
    if (ctx.receivedEmoteId == null) return false;
    const want = entry.receiveEmoteId ?? 0;
    return !want || ctx.receivedEmoteId === want;
  },
  // AURA — ~472–477 (self has enough stacks)
  [EVENT_T.AURA]: (entry, ctx) => {
    const sid = entry.auraSpellId ?? 0;
    if (!sid) return false;
    const stacks = entry.auraStacks ?? 1;
    if (!ctx.hasAura) return false;
    return ctx.hasAura(sid, stacks);
  },
  // TARGET_AURA — ~479–487
  [EVENT_T.TARGET_AURA]: (entry, ctx) => {
    const sid = entry.auraSpellId ?? 0;
    if (!sid) return false;
    const stacks = entry.auraStacks ?? 1;
    if (!ctx.targetHasAura) return false;
    return ctx.targetHasAura(sid, stacks);
  },
  // SUMMONED_JUST_DIED — ~439–450 (same filter as SUMMONED_UNIT)
  [EVENT_T.SUMMONED_JUST_DIED]: (entry, ctx) => {
    if (ctx.summonedEntry == null) return false;
    const want = entry.summonedCreatureId ?? 0;
    return !want || ctx.summonedEntry === want;
  },
  // SUMMONED_JUST_DESPAWN — same
  [EVENT_T.SUMMONED_JUST_DESPAWN]: (entry, ctx) => {
    if (ctx.summonedEntry == null) return false;
    const want = entry.summonedCreatureId ?? 0;
    return !want || ctx.summonedEntry === want;
  },
  // MISSING_AURA — ~489–494
  [EVENT_T.MISSING_AURA]: (entry, ctx) => {
    const sid = entry.auraSpellId ?? 0;
    if (!sid) return true;
    const stacks = entry.auraStacks ?? 1;
    if (!ctx.hasAura) return true;
    return !ctx.hasAura(sid, stacks);
  },
  // TARGET_MISSING_AURA — ~496–504
  [EVENT_T.TARGET_MISSING_AURA]: (entry, ctx) => {
    const sid = entry.auraSpellId ?? 0;
    if (!sid) return true;
    const stacks = entry.auraStacks ?? 1;
    if (!ctx.targetHasAura) return true;
    return !ctx.targetHasAura(sid, stacks);
  },
  // RECEIVE_AI_EVENT — ~506–507 + ReceiveAIEvent filter ~1565–1567
  [EVENT_T.RECEIVE_AI_EVENT]: (entry, ctx) => {
    if (!ctx.receivedAiEvent) return false;
    const wantType = entry.receiveAiEventType ?? 0;
    if (wantType && ctx.receivedAiEvent.eventType !== wantType) return false;
    const wantSender = entry.receiveAiSenderEntry ?? 0;
    if (wantSender && ctx.receivedAiEvent.senderEntry !== wantSender) return false;
    return true;
  },
  // SELECT_ATTACKING_TARGET — ~519–527
  [EVENT_T.SELECT_ATTACKING_TARGET]: (_e, ctx) => ctx.hasAttackingTargetInRange === true,
  // FACING_TARGET — ~530–541
  [EVENT_T.FACING_TARGET]: (entry, ctx) => {
    if (!inCombatFlag(ctx)) return false;
    if (ctx.facingTarget == null) return false;
    const want = entry.facingBackOrFront ?? 0;
    return ctx.facingTarget === want;
  },
  // SPELLHIT_TARGET — ~345–347 (pulse-gated; unlike SPELLHIT legacy)
  [EVENT_T.SPELLHIT_TARGET]: (entry, ctx) => spellHitMatches(entry, ctx),
  // TARGET_NOT_REACHABLE — ~545–547
  [EVENT_T.TARGET_NOT_REACHABLE]: (_e, ctx) => ctx.targetNotReachable === true,
  // SPELL_CAST — ~1584–1587
  [EVENT_T.SPELL_CAST]: (entry, ctx) => {
    if (ctx.spellCastId == null) return false;
    const want = entry.spellHitSpellId ?? entry.auraSpellId ?? 0;
    return !want || ctx.spellCastId === want;
  },
};

// Event conditions from CheckEvent via EVENT_HANDLERS. Bare entries (no eventType) always pass. Unknown
// types fail closed.
export function eventConditionsOk(entry: CreatureCastEntry, ctx: CastPickContext): boolean {
  const et = entry.eventType;
  if (et == null) return true;
  const handler = EVENT_HANDLERS[et];
  if (!handler) return false;
  return handler(entry, ctx);
}

/** perc > percentMax || perc < percentMin → fail (EVENT_T_HP/MANA). */
function percentBandOk(pct: number, max?: number, min?: number): boolean {
  const hi = max ?? 100;
  const lo = min ?? 0;
  return pct <= hi && pct >= lo;
}

function compareSlots(a: CreatureCastSlot, b: CreatureCastSlot): number {
  if (a.readyAt !== b.readyAt) return a.readyAt - b.readyAt;
  if (a.listIndex !== b.listIndex) return a.listIndex - b.listIndex;
  return a.spell.id - b.spell.id;
}

/** Re-arm a timer that just became unblocked. Cite: boss_onyxia.cpp:368-378 ResetCombatAction. */
export function rearmCreatureCastSlotsOnPhase(
  slots: readonly CreatureCastSlot[],
  prevPhase: number,
  nextPhase: number,
  t: number,
  rng?: Rng,
): void {
  if ((prevPhase | 0) === (nextPhase | 0)) return;
  for (const slot of slots) {
    const mask = slot.entry.eventInversePhaseMask;
    if (!mask) continue;
    if (!eventPhaseBlocked(mask, prevPhase) || eventPhaseBlocked(mask, nextPhase)) continue;
    const e = slot.entry;
    slot.exhausted = false;
    slot.readyAt = t + rollTimer(e.initialMinMs ?? 0, e.initialMaxMs ?? e.initialMinMs ?? 0, rng);
  }
}

export function rollTimer(minMs: number, maxMs: number, rng?: Rng): number {
  const lo = Math.max(0, minMs | 0);
  const hi = Math.max(lo, maxMs | 0);
  if (hi <= lo || !rng) return lo;
  return rng.int(lo, hi);
}

// Skip the event when the bit for the current phase is SET in event_inverse_phase_mask.
// Cite: CreatureEventAI.cpp CheckEvent ~266–270.
export function eventPhaseBlocked(
  eventInversePhaseMask: number | undefined | null,
  phase: number,
): boolean {
  const mask = (eventInversePhaseMask ?? 0) | 0;
  if (!mask) return false;
  const p = phase | 0;
  if (p < 0 || p > 31) return false;
  return (mask & (1 << p)) !== 0;
}
