// What a raid boss actually casts, read off the same kit combat arms: the ported ScriptDev IR
// first, then creatureCasts, spellList and spells. Resolve it — 335 of 361 bake empty effects[].

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef } from '../../data/schema.ts';
import { resolveCombatSpell } from '../../engine/spells/interpreter/item-triggers.ts';
import { isHostileSpellDef } from '../../engine/combat/predicates.ts';
import { HOSTILE_IMPLICIT } from '../../engine/spells/interpreter/targeting.ts';
import { SPELL_LIST_TARGET, TARGET_T } from '../creature/aiTargeting.ts';
import { scriptDevScheduleForEntry } from '../scriptdev/registry.ts';
import { allRaidRowIdentities, raidFightAuras, tacticsForEntry } from './raidEncounterTactics.ts';
import type { RaidTriggerKind } from './raidCustomRows.ts';

/** Where the aura an `aura` trigger reads sits. */
export type AbilityAuraSide = 'self' | 'boss';

export interface RaidBossAbility {
  spellId: number;
  name: string;
  school: string;
  /** spell_template.Description — what the fight tells the player it does. */
  description?: string;
  /** Longest aura this ability leaves behind, in ms. 0 with `trigger` set = until cancelled. */
  durationMs: number;
  /** Payload radius the raid has to clear, when the spell bakes one. */
  radiusYd?: number;
  /** How often the kit arms it, in seconds. Absent when the row carries no timer. */
  everySec?: { min: number; max: number };
  /** Every way a rule can fire off this ability. Never empty: `always` is always in it. */
  triggers: readonly RaidTriggerKind[];
  /** Which side the `aura` trigger reads, when there is one. */
  auraSide?: AbilityAuraSide;
  /** spell_cone.ConeDegrees. Negative is a REAR cone (a tail swipe), so behind is wrong. */
  coneDeg?: number;
  /** Cast time in ms, when it has one - a cast is a thing a kick can answer. */
  castMs?: number;
  /** Rule ids of the shipped plan rows that already answer this ability. */
  answeredBy: readonly string[];
}

const MAX_ABILITIES = 40;

/** Aura even at duration 0 (durationIndex 21, until cancelled). proc_trigger_spell is out. */
const AURA_AT_ZERO: ReadonlySet<string> = new Set([
  'buff', 'cc', 'dot', 'root', 'aura_dummy', 'aura_dummy_holder', 'damage_shield',
  'damage_immunity', 'effect_immunity', 'mod_scale', 'speed', 'persistent_area',
]);

/** Longest duration any effect carries, and whether the spell leaves an aura at all. */
function auraOf(s: SpellDef): { durationMs: number; isAura: boolean } {
  let ms = 0;
  let isAura = false;
  for (const e of s.effects) {
    if (!('durationMs' in e) || typeof e.durationMs !== 'number') continue;
    if (e.durationMs > ms) ms = e.durationMs;
    if (e.durationMs > 0 || AURA_AT_ZERO.has(e.kind)) isAura = true;
  }
  return { durationMs: ms, isAura };
}

/** targetA values that put the aura on the raid. Cite: SpellTargetDefines.h; targeting.ts:18. */
const AURA_ON_RAID: ReadonlySet<number> = new Set([...HOSTILE_IMPLICIT, 7, 17, 18, 22, 53]);
/** TARGET_SELF — the aura sits on the caster. */
const TARGET_A_SELF = 1;

/** Where the aura lands, off the DBC implicit target of the effects that apply one. */
function auraSitsOn(s: SpellDef): 'self' | 'boss' | undefined {
  let sawSelf = false;
  for (const re of s.rawEffects ?? []) {
    if ((re.auraName | 0) === 0) continue;
    const a = re.targetA | 0;
    if (AURA_ON_RAID.has(a)) return 'self';
    if (a === TARGET_A_SELF) sawSelf = true;
  }
  return sawSelf ? 'boss' : undefined;
}

/** Payload radius, when one of the effects bakes one. */
function payloadRadiusYd(s: SpellDef): number | undefined {
  let yd = 0;
  for (const e of s.effects) {
    if ('radiusYd' in e && typeof e.radiusYd === 'number' && e.radiusYd > yd) yd = e.radiusYd;
    else if ('radius' in e && typeof e.radius === 'number' && e.radius > yd) yd = e.radius;
  }
  return yd > 0 ? yd : undefined;
}

interface KitSlot {
  id: number;
  everySec?: { min: number; max: number };
  /** Who the cast picks, when the schedule row names one. */
  lands?: 'self' | 'boss';
}

/** Who the aura ends up on, from the schedule row's own target. */
function landsFrom(target: number | undefined, space: string | undefined): 'self' | 'boss' | undefined {
  if (target == null) return undefined;
  if (space === 'spell_list') {
    if (target === SPELL_LIST_TARGET.SELF) return 'boss';
    if (target === SPELL_LIST_TARGET.CURRENT || target === SPELL_LIST_TARGET.CURRENT_NOT_ALONE) return 'self';
    return undefined;
  }
  if (target === TARGET_T.SELF) return 'boss';
  if (
    target === TARGET_T.HOSTILE || target === TARGET_T.HOSTILE_SECOND_AGGRO
    || target === TARGET_T.HOSTILE_LAST_AGGRO || target === TARGET_T.HOSTILE_RANDOM
    || target === TARGET_T.HOSTILE_RANDOM_NOT_TOP || target === TARGET_T.HOSTILE_RANDOM_PLAYER
    || target === TARGET_T.HOSTILE_RANDOM_NOT_TOP_PLAYER || target === TARGET_T.HOSTILE_RANDOM_MANA
    || target === TARGET_T.HOSTILE_FARTHEST_AWAY
  ) return 'self';
  return undefined;
}

/** Every spell id the boss's own kit arms, in the order the engine walks them. */
function kitSpellIds(ds: DataStore, entry: number): KitSlot[] {
  const out: KitSlot[] = [];
  const seen = new Set<number>();
  const add = (
    id: unknown,
    minMs?: number,
    maxMs?: number,
    lands?: 'self' | 'boss',
  ): void => {
    if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0 || seen.has(id)) return;
    seen.add(id);
    const lo = typeof minMs === 'number' && minMs > 0 ? Math.round(minMs / 1000) : 0;
    const hi = typeof maxMs === 'number' && maxMs > 0 ? Math.round(maxMs / 1000) : lo;
    out.push({
      id,
      ...(lo > 0 ? { everySec: { min: lo, max: Math.max(lo, hi) } } : {}),
      ...(lands ? { lands } : {}),
    });
  };
  const sd = scriptDevScheduleForEntry(entry);
  for (const k of sd?.castEntries ?? []) {
    add(
      k.spellId,
      k.repeatMinMs ?? k.initialMinMs,
      k.repeatMaxMs ?? k.initialMaxMs,
      landsFrom(k.target, k.targetSpace),
    );
  }
  // Phase / lifecycle casts the IR fires with no timer (Armageddon at 2 %) carry no schedule.
  for (const id of sd?.spellIds ?? []) add(id);
  const c = ds.creature(entry);
  for (const k of c?.creatureCasts ?? []) {
    add(
      k.spellId,
      k.repeatMinMs ?? k.initialMinMs,
      k.repeatMaxMs ?? k.initialMaxMs,
      landsFrom(k.target, k.targetSpace),
    );
  }
  for (const r of c?.spellList ?? []) {
    add(r.spellId, r.repeatMin ?? r.initialMin, r.repeatMax ?? r.initialMax);
  }
  for (const id of c?.spells ?? []) add(id);
  return out;
}

interface AnsweredRow { ruleId: string; on: 'self' | 'boss' }

/** Plan rows answering each ability, and where each reads it - the sourced `trigger`. */
function answeredIndex(entry: number): Map<number, AnsweredRow[]> {
  const out = new Map<number, AnsweredRow[]>();
  const add = (spellId: number, row: AnsweredRow): void => {
    const cur = out.get(spellId);
    if (cur) { if (!cur.some((r) => r.ruleId === row.ruleId)) cur.push(row); }
    else out.set(spellId, [row]);
  };
  const auraOn = new Map(raidFightAuras(entry).map((a) => [a.aura, a.on]));
  for (const [ruleId, id] of allRaidRowIdentities()) {
    if (!id.sources.some((s) => s.entry === entry)) continue;
    if (id.auraSpellId == null) continue;
    add(id.auraSpellId, { ruleId, on: auraOn.get(id.auraSpellId) ?? 'self' });
  }
  const t = tacticsForEntry(entry);
  for (const row of t?.encounterRows ?? []) {
    for (const c of row.rule.conditions) {
      if (c.ref == null || c.ref <= 0) continue;
      add(c.ref, { ruleId: row.rule.id, on: c.subject === 'target' ? 'boss' : 'self' });
    }
  }
  return out;
}

/** Effects that leave something on the FLOOR — the `pool` trigger reads these. */
const POOL_KINDS: ReadonlySet<string> = new Set([
  'persistent_area', 'summon_object_wild', 'summon_object_slot',
]);

/** Effect 41 SUMMON_WILD / 50 TRANS_DOOR put an object on the floor. */
const POOL_RAW_EFFECTS: ReadonlySet<number> = new Set([41, 50]);

// A chain (Throw Liquid Fire 23968 -> 23969 -> 23971) bakes the summon on the LAST link, so the spell the
// boss casts shows only a trigger. Two links is every chain in the raid packs.
function laysAPool(ds: DataStore, s: SpellDef, depth = 2): boolean {
  if (s.effects.some((e) => POOL_KINDS.has(e.kind))) return true;
  if ((s.rawEffects ?? []).some((r) => POOL_RAW_EFFECTS.has(r.effect | 0))) return true;
  if (depth <= 0) return false;
  for (const r of s.rawEffects ?? []) {
    const next = (r.triggerSpell | 0) > 0 ? ds.spell(r.triggerSpell) : null;
    if (next && laysAPool(ds, resolveCombatSpell(next), depth - 1)) return true;
  }
  for (const e of s.effects) {
    if (e.kind !== 'trigger_spell') continue;
    const id = 'spellId' in e && typeof e.spellId === 'number' ? e.spellId : 0;
    const next = id > 0 ? ds.spell(id) : null;
    if (next && laysAPool(ds, resolveCombatSpell(next), depth - 1)) return true;
  }
  return false;
}

/** Everything this boss casts, answerable ones first. */
export function raidBossAbilities(ds: DataStore, entry: number): readonly RaidBossAbility[] {
  const answered = answeredIndex(entry);
  const out: RaidBossAbility[] = [];
  for (const slot of kitSpellIds(ds, entry)) {
    const raw = ds.spell(slot.id);
    if (!raw) continue;
    const s = resolveCombatSpell(raw);
    const { durationMs, isAura } = auraOf(s);
    const rows = answered.get(slot.id) ?? [];
    // Sourced first: a shipped row that reads this aura says where it sits. Then the schedule
    // row's own target. Only then the effect table's hostile flag.
    const on = rows[0]?.on ?? auraSitsOn(s) ?? slot.lands ?? (isHostileSpellDef(s) ? 'self' : 'boss');
    // Nothing is unanswerable. Worst case the answer is "always in this fight, under N%".
    const triggers: RaidTriggerKind[] = [];
    if (isAura || rows.length) triggers.push('aura');
    if (s.castTimeMs > 0) triggers.push('cast');
    if (laysAPool(ds, s)) triggers.push('pool');
    if (s.coneDeg != null) triggers.push('cone');
    // `raidhurt` reads the RAID's health, not this ability's shape, so every ability can carry
    // it — unlike `pool` or `cone`, which would be a facade on a spell that lays neither.
    triggers.push('raidhurt');
    triggers.push('always');
    out.push({
      spellId: slot.id,
      name: s.name || `spell #${slot.id}`,
      school: s.school,
      ...(s.description ? { description: s.description } : {}),
      durationMs,
      ...(payloadRadiusYd(s) != null ? { radiusYd: payloadRadiusYd(s) } : {}),
      ...(slot.everySec ? { everySec: slot.everySec } : {}),
      triggers,
      ...(isAura || rows.length ? { auraSide: on } : {}),
      ...(s.coneDeg != null ? { coneDeg: s.coneDeg } : {}),
      ...(s.castTimeMs > 0 ? { castMs: s.castTimeMs } : {}),
      answeredBy: rows.map((r) => r.ruleId),
    });
  }
  // Answered first, then the ones with a specific trigger, then always-only.
  out.sort((a, b) => {
    const rank = (x: RaidBossAbility): number =>
      (x.answeredBy.length ? 0 : 2) + (x.triggers.length > 1 ? 0 : 1);
    const d = rank(a) - rank(b);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  return out.slice(0, MAX_ABILITIES);
}

/** The "write a rule" ability list. Every ability qualifies - `always` is a real trigger. */
export function raidBossTriggerAbilities(
  ds: DataStore,
  entry: number,
): readonly RaidBossAbility[] {
  return raidBossAbilities(ds, entry);
}
