// DPSMate-style combat meter aggregation: folds CombatEvent streams into per-actor, per-ability
// and per-target metrics. Pure data — no engine or rng. Optional event extras are read if present.

import type { CombatEvent, HitResult, Side } from '../../engine/core/events.ts';
import { isEnemySide } from '../../engine/core/events.ts';

/** Rolling window for short-window DPS/HPS (DPSMate-style recent rate). */
export const DPSMATE_WINDOW_MS = 5_000;

export type MeterSegment = 'fight' | 'run';
export type MeterSortKind = 'damage' | 'healing' | 'dps';

/** Optional fields fixtures / future engine logs may attach without breaking the union. */
export type MeterEventExtras = {
  target?: Side | string;
  absorbed?: number;
  overheal?: number;
  /** Full resist (spell); Classic often logs resists as miss — fixtures may set this. */
  resist?: boolean;
  /** Interrupt caster (interrupt events only have target + ability name in the engine). */
  source?: Side | string;
  /** Successful dispel count credit (when aura strip is not enough signal). */
  dispels?: number;
  /** Ability label on heal events (engine heal events omit name today). */
  name?: string;
  /** Shield block value stripped on a yellow land (hit/crit can coexist). */
  blocked?: number;
};

export interface HitBreakdown {
  hits: number;
  crits: number;
  misses: number;
  dodges: number;
  parries: number;
  blocks: number;
  resists: number;
  glancing: number;
  crushing: number;
}

export interface TargetTally {
  id: string;
  damage: number;
  healing: number;
  hits: number;
  crits: number;
}

export interface AbilityMetrics extends HitBreakdown {
  name: string;
  damage: number;
  healing: number;
  overhealing: number;
  /** Damage absorbed from this ability's hits (shield on target). */
  absorbed: number;
  /** Successful damage applications (hit/crit/glancing/block/crushing with amount or absorb). */
  swings: number;
  minHit: number;
  maxHit: number;
  /** Average successful hit amount (0 when no hits). */
  avgHit: number;
  /** Crit % of landed attempts (hits+crits+glancing+block+crushing); 0 when none. */
  critPct: number;
  casts: number;
  /** Aura / DoT uptime ms attributed to this ability name. */
  uptimeMs: number;
  perTarget: TargetTally[];
}

export interface ActorMetrics extends HitBreakdown {
  id: string;
  damage: number;
  healing: number;
  overhealing: number;
  /** Outgoing damage absorbed by shields on victims. */
  absorbed: number;
  damageTaken: number;
  /** Incoming damage absorbed (shields on this actor). */
  absorbedTaken: number;
  deaths: number;
  interrupts: number;
  dispels: number;
  /** Whole-segment DPS (damage / durationSec). */
  dps: number;
  /** Whole-segment HPS. */
  hps: number;
  /** Rolling window DPS. */
  windowDps: number;
  /** Rolling window HPS. */
  windowHps: number;
  abilities: AbilityMetrics[];
  /** Per-source damage taken (source actor id → amount). */
  damageTakenBySource: Array<{ id: string; damage: number }>;
}

export interface DpsMateSnapshot {
  actors: ActorMetrics[];
  totalDamage: number;
  totalHealing: number;
  totalOverhealing: number;
  totalDamageTaken: number;
  /** Segment duration from first to last event t (ms). */
  durationMs: number;
  windowMs: number;
  segment: MeterSegment;
  /** Timeline points for post-run report (damage/heal deltas by time). */
  timeline: Array<{ t: number; damage: number; healing: number }>;
}

export interface DpsMateMeter {
  ingest(events: readonly CombatEvent[]): void;
  /** Start a new fight segment (keeps whole-run totals). */
  beginFight(): void;
  snapshot(sortKind?: MeterSortKind, segment?: MeterSegment): DpsMateSnapshot;
  reset(): void;
}

interface MutableTarget {
  damage: number;
  healing: number;
  hits: number;
  crits: number;
}

interface MutableAbility extends HitBreakdown {
  damage: number;
  healing: number;
  overhealing: number;
  absorbed: number;
  swings: number;
  minHit: number;
  maxHit: number;
  casts: number;
  uptimeMs: number;
  /** Open aura start times (ability name → t) for uptime. */
  auraOpenAt: number | null;
  perTarget: Map<string, MutableTarget>;
}

interface MutableActor extends HitBreakdown {
  damage: number;
  healing: number;
  overhealing: number;
  absorbed: number;
  damageTaken: number;
  absorbedTaken: number;
  deaths: number;
  interrupts: number;
  dispels: number;
  bySpell: Map<string, MutableAbility>;
  damageTakenBySource: Map<string, number>;
}

interface SegmentState {
  actors: Map<string, MutableActor>;
  totalDamage: number;
  totalHealing: number;
  totalOverhealing: number;
  totalDamageTaken: number;
  firstT: number | null;
  lastT: number | null;
  /** (t, dmgDelta, healDelta) for window + timeline. */
  samples: Array<{ t: number; damage: number; healing: number }>;
  /** Last cast_finish: ability name → { actor, t }. */
  lastCastByName: Map<string, { actor: string; t: number }>;
  /** Open auras: `${unit}\0${name}` → { startT, casterAbility? }. */
  openAuras: Map<string, { startT: number; abilityName: string; casterId: string | null }>;
  // Last damage row per actor — dedups the weapon-ability RIDER echo: a debuff rider re-applies
  // right after the strike and emits a second spell_hit at amount 0, halving avgHit and critPct.
  lastDamageRow: Map<string, { ability: string; t: number; amount: number; target: string | null }>;
}

const FALLBACK_MELEE = 'Melee';
const FALLBACK_SPELL = 'Spell';
const FALLBACK_DOT = 'DoT';
const FALLBACK_HEAL = 'Heal';

// Classic 1.12 dispel / purge / cleanse display names, used only to credit cast_finish → dispels
// when the engine emits no dedicated dispel event. Names match baked SpellDef.name.
const DISPEL_ABILITY_NAMES = new Set([
  'Dispel Magic',
  'Purge',
  'Remove Curse',
  'Remove Lesser Curse',
  'Cleanse',
  'Purify',
  'Abolish Poison',
  'Abolish Disease',
  'Cure Poison',
  'Cure Disease',
  'Tranquilizing Shot',
]);

const EMPTY_HITS = (): HitBreakdown => ({
  hits: 0,
  crits: 0,
  misses: 0,
  dodges: 0,
  parries: 0,
  blocks: 0,
  resists: 0,
  glancing: 0,
  crushing: 0,
});

function emptyAbility(): MutableAbility {
  return {
    ...EMPTY_HITS(),
    damage: 0,
    healing: 0,
    overhealing: 0,
    absorbed: 0,
    swings: 0,
    minHit: Number.POSITIVE_INFINITY,
    maxHit: 0,
    casts: 0,
    uptimeMs: 0,
    auraOpenAt: null,
    perTarget: new Map(),
  };
}

function emptyActor(): MutableActor {
  return {
    ...EMPTY_HITS(),
    damage: 0,
    healing: 0,
    overhealing: 0,
    absorbed: 0,
    damageTaken: 0,
    absorbedTaken: 0,
    deaths: 0,
    interrupts: 0,
    dispels: 0,
    bySpell: new Map(),
    damageTakenBySource: new Map(),
  };
}

function emptySegment(): SegmentState {
  return {
    actors: new Map(),
    totalDamage: 0,
    totalHealing: 0,
    totalOverhealing: 0,
    totalDamageTaken: 0,
    firstT: null,
    lastT: null,
    samples: [],
    lastCastByName: new Map(),
    openAuras: new Map(),
    lastDamageRow: new Map(),
  };
}

function ensureActor(seg: SegmentState, id: string): MutableActor {
  let a = seg.actors.get(id);
  if (!a) {
    a = emptyActor();
    seg.actors.set(id, a);
  }
  return a;
}

function ensureSpell(actor: MutableActor, name: string): MutableAbility {
  let s = actor.bySpell.get(name);
  if (!s) {
    s = emptyAbility();
    actor.bySpell.set(name, s);
  }
  return s;
}

function ensureTarget(sp: MutableAbility, id: string): MutableTarget {
  let t = sp.perTarget.get(id);
  if (!t) {
    t = { damage: 0, healing: 0, hits: 0, crits: 0 };
    sp.perTarget.set(id, t);
  }
  return t;
}

function extrasOf(e: CombatEvent): MeterEventExtras {
  const x = e as CombatEvent & MeterEventExtras;
  const out: MeterEventExtras = {};
  if (typeof x.target === 'string' && x.target.length > 0) out.target = x.target;
  if (typeof x.absorbed === 'number' && Number.isFinite(x.absorbed)) out.absorbed = x.absorbed;
  if (typeof x.overheal === 'number' && Number.isFinite(x.overheal)) out.overheal = x.overheal;
  if (x.resist === true) out.resist = true;
  if (typeof x.source === 'string' && x.source.length > 0) out.source = x.source;
  if (typeof x.dispels === 'number' && Number.isFinite(x.dispels) && x.dispels > 0) out.dispels = x.dispels;
  if (typeof x.blocked === 'number' && Number.isFinite(x.blocked) && x.blocked > 0) out.blocked = x.blocked;
  return out;
}

/** Spell/ability label for a damage or heal event (never empty). */
export function abilityKey(e: CombatEvent): string {
  if (e.kind === 'melee') {
    const n = (e as { name?: string }).name;
    return typeof n === 'string' && n.length > 0 ? n : FALLBACK_MELEE;
  }
  if (e.kind === 'spell_hit') {
    return e.name && e.name.length > 0 ? e.name : FALLBACK_SPELL;
  }
  if (e.kind === 'dot_tick') {
    return e.name && e.name.length > 0 ? e.name : FALLBACK_DOT;
  }
  if (e.kind === 'heal') {
    const n = e.name ?? (e as { name?: string }).name;
    return typeof n === 'string' && n.length > 0 ? n : FALLBACK_HEAL;
  }
  if (e.kind === 'cast_start' || e.kind === 'cast_finish') {
    return e.name && e.name.length > 0 ? e.name : FALLBACK_SPELL;
  }
  if (e.kind === 'interrupt') {
    return e.name && e.name.length > 0 ? e.name : 'Interrupt';
  }
  if (e.kind === 'aura') {
    return e.name && e.name.length > 0 ? e.name : 'Aura';
  }
  return FALLBACK_SPELL;
}

function touchTime(seg: SegmentState, t: number): void {
  if (!Number.isFinite(t)) return;
  if (seg.firstT == null || t < seg.firstT) seg.firstT = t;
  if (seg.lastT == null || t > seg.lastT) seg.lastT = t;
}

function noteSample(seg: SegmentState, t: number, damage: number, healing: number): void {
  if (damage === 0 && healing === 0) return;
  const last = seg.samples[seg.samples.length - 1];
  if (last && last.t === t) {
    last.damage += damage;
    last.healing += healing;
  } else {
    seg.samples.push({ t, damage, healing });
  }
}

function recordHitOutcome(
  actor: MutableActor,
  spell: MutableAbility,
  result: HitResult | 'resist' | string,
  isResistFlag: boolean,
): void {
  const bump = (key: keyof HitBreakdown): void => {
    actor[key] += 1;
    spell[key] += 1;
  };
  if (isResistFlag || result === 'resist') {
    bump('resists');
    return;
  }
  switch (result) {
    case 'hit':
      bump('hits');
      break;
    case 'crit':
      bump('crits');
      break;
    case 'miss':
      bump('misses');
      break;
    case 'dodge':
      bump('dodges');
      break;
    case 'parry':
      bump('parries');
      break;
    case 'block':
      bump('blocks');
      break;
    case 'glancing':
      bump('glancing');
      break;
    case 'crushing':
      bump('crushing');
      break;
    default:
      break;
  }
}

function noteSuccessfulHit(spell: MutableAbility, amount: number): void {
  spell.swings += 1;
  if (amount > 0) {
    if (amount < spell.minHit) spell.minHit = amount;
    if (amount > spell.maxHit) spell.maxHit = amount;
  }
}

function applyDamage(
  seg: SegmentState,
  args: {
    t: number;
    actorId: string;
    ability: string;
    amount: number;
    absorbed: number;
    result: HitResult | 'resist' | string;
    resistFlag: boolean;
    targetId: string | undefined;
  },
): void {
  const { t, actorId, ability, amount, absorbed, result, resistFlag, targetId } = args;
  const dmg = Number.isFinite(amount) ? amount : 0;
  const abs = Number.isFinite(absorbed) && absorbed > 0 ? absorbed : 0;
  // Misses / empty swings still count outcomes; zero damage with no absorb still creates actor for tables.
  const actor = ensureActor(seg, actorId);
  const spell = ensureSpell(actor, ability);
  recordHitOutcome(actor, spell, result, resistFlag);

  const landed =
    !resistFlag &&
    result !== 'miss' &&
    result !== 'dodge' &&
    result !== 'parry' &&
    result !== 'resist';

  if (landed) {
    noteSuccessfulHit(spell, dmg + abs);
  }

  if (dmg !== 0 || abs !== 0) {
    actor.damage += dmg;
    spell.damage += dmg;
    actor.absorbed += abs;
    spell.absorbed += abs;
    seg.totalDamage += dmg;
    noteSample(seg, t, dmg, 0);
  }

  if (targetId) {
    const tgt = ensureTarget(spell, targetId);
    if (dmg !== 0) {
      tgt.damage += dmg;
      if (result === 'crit') tgt.crits += 1;
      else if (landed) tgt.hits += 1;
    }
    // Damage taken on the victim.
    const victim = ensureActor(seg, targetId);
    victim.damageTaken += dmg;
    victim.absorbedTaken += abs;
    seg.totalDamageTaken += dmg;
    victim.damageTakenBySource.set(
      actorId,
      (victim.damageTakenBySource.get(actorId) ?? 0) + dmg,
    );
  }
}

function applyHeal(
  seg: SegmentState,
  args: {
    t: number;
    casterId: string;
    targetId: string;
    ability: string;
    amount: number;
    overheal: number;
    crit: boolean;
  },
): void {
  const { t, casterId, targetId, ability, amount, overheal, crit } = args;
  if (!Number.isFinite(amount) && !Number.isFinite(overheal)) return;
  const heal = Number.isFinite(amount) ? amount : 0;
  const oh = Number.isFinite(overheal) && overheal > 0 ? overheal : 0;
  if (heal === 0 && oh === 0) return;

  const actor = ensureActor(seg, casterId);
  const spell = ensureSpell(actor, ability);
  actor.healing += heal;
  spell.healing += heal;
  actor.overhealing += oh;
  spell.overhealing += oh;
  seg.totalHealing += heal;
  seg.totalOverhealing += oh;
  noteSample(seg, t, 0, heal);

  if (crit) {
    actor.crits += 1;
    spell.crits += 1;
  } else {
    actor.hits += 1;
    spell.hits += 1;
  }
  spell.swings += 1;
  const totalEff = heal; // min/max on effective heal
  if (totalEff > 0) {
    if (totalEff < spell.minHit) spell.minHit = totalEff;
    if (totalEff > spell.maxHit) spell.maxHit = totalEff;
  }

  const tgt = ensureTarget(spell, targetId);
  tgt.healing += heal;
  if (crit) tgt.crits += 1;
  else tgt.hits += 1;
}

function closeAura(
  seg: SegmentState,
  key: string,
  endT: number,
): void {
  const open = seg.openAuras.get(key);
  if (!open) return;
  const dur = Math.max(0, endT - open.startT);
  if (open.casterId && open.abilityName) {
    const actor = ensureActor(seg, open.casterId);
    const spell = ensureSpell(actor, open.abilityName);
    spell.uptimeMs += dur;
  }
  seg.openAuras.delete(key);
}

function ingestOne(seg: SegmentState, e: CombatEvent): void {
  const t = typeof e.t === 'number' ? e.t : 0;
  touchTime(seg, t);
  const ex = extrasOf(e);

  if (e.kind === 'melee' || e.kind === 'spell_hit' || e.kind === 'dot_tick') {
    const ability = abilityKey(e);
    const rowTarget = (ex.target as string | undefined) ?? null;
    // Rider echo: a zero-amount spell_hit for the SAME actor, ability, t and target right after a
    // damaging row is the debuff re-apply, not a second swing. Fanned zero-damage debuffs differ.
    if (e.kind === 'spell_hit' && (e.amount ?? 0) === 0) {
      const prev = seg.lastDamageRow.get(e.actor);
      if (prev && prev.ability === ability && prev.t === t && prev.target === rowTarget && prev.amount > 0) {
        return;
      }
    }
    if (e.kind !== 'dot_tick') {
      seg.lastDamageRow.set(e.actor, { ability, t, amount: e.amount ?? 0, target: rowTarget });
    }
    const result =
      e.kind === 'dot_tick'
        ? 'hit'
        : ((e as { result?: HitResult }).result ?? 'hit');
    applyDamage(seg, {
      t,
      actorId: e.actor,
      ability,
      amount: e.amount,
      absorbed: ex.absorbed ?? 0,
      result: ex.resist ? 'resist' : result,
      resistFlag: !!ex.resist,
      targetId: ex.target as string | undefined,
    });
    if ((ex.blocked ?? 0) > 0 && result !== 'block') {
      const actor = ensureActor(seg, e.actor);
      const spell = ensureSpell(actor, ability);
      actor.blocks += 1;
      spell.blocks += 1;
    }
    // Explicit dispel credit on damage/cast events.
    if (ex.dispels && ex.dispels > 0) {
      ensureActor(seg, e.actor).dispels += ex.dispels;
    }
    return;
  }

  if (e.kind === 'heal') {
    const casterId = e.source ?? e.actor;
    const targetId = e.actor;
    const ability = abilityKey(e);
    applyHeal(seg, {
      t,
      casterId,
      targetId,
      ability,
      amount: e.amount,
      overheal: ex.overheal ?? 0,
      crit: e.crit === true,
    });
    if (ex.dispels && ex.dispels > 0) {
      ensureActor(seg, casterId).dispels += ex.dispels;
    }
    return;
  }

  if (e.kind === 'cast_start' || e.kind === 'cast_finish') {
    const actor = ensureActor(seg, e.actor);
    const ability = abilityKey(e);
    const spell = ensureSpell(actor, ability);
    if (e.kind === 'cast_finish') {
      spell.casts += 1;
      seg.lastCastByName.set(ability, { actor: e.actor, t });
      // Credit dispel tools on successful cast_finish (no dedicated dispel event).
      if (DISPEL_ABILITY_NAMES.has(ability)) {
        actor.dispels += 1;
      }
    }
    if (ex.dispels && ex.dispels > 0) {
      actor.dispels += ex.dispels;
    }
    return;
  }

  if (e.kind === 'interrupt') {
    // Prefer explicit source; else last cast of this interrupt ability name.
    const src =
      (ex.source as string | undefined) ??
      seg.lastCastByName.get(e.name)?.actor ??
      seg.lastCastByName.get(abilityKey(e))?.actor;
    if (src) {
      ensureActor(seg, src).interrupts += 1;
      const spell = ensureSpell(ensureActor(seg, src), e.name || 'Interrupt');
      spell.casts += 1;
    } else {
      // Still record a synthetic row so the metric is visible under "unknown" caster.
      const actor = ensureActor(seg, 'player');
      actor.interrupts += 1;
    }
    return;
  }

  if (e.kind === 'death') {
    ensureActor(seg, e.actor).deaths += 1;
    return;
  }

  if (e.kind === 'aura') {
    const key = `${e.actor}\0${e.name}`;
    if (e.applied) {
      // New application: close previous, open new.
      closeAura(seg, key, t);
      const last = seg.lastCastByName.get(e.name);
      // If cast of same name was recent (same ability), credit caster; else unit self.
      const casterId = last && t - last.t <= 2000 ? last.actor : null;
      seg.openAuras.set(key, {
        startT: t,
        abilityName: e.name,
        casterId,
      });
    } else {
      closeAura(seg, key, t);
    }
    if (ex.dispels && ex.dispels > 0) {
      const who = (ex.source as string | undefined) ?? e.actor;
      ensureActor(seg, who).dispels += ex.dispels;
    }
    return;
  }

  // Optional dispel credit on any other event kind via extras.
  if (ex.dispels && ex.dispels > 0) {
    const who =
      (ex.source as string | undefined) ??
      ('actor' in e && typeof (e as { actor?: string }).actor === 'string'
        ? (e as { actor: string }).actor
        : 'player');
    ensureActor(seg, who).dispels += ex.dispels;
  }
}

function windowTotals(seg: SegmentState, endT: number): { damage: number; healing: number } {
  const start = endT - DPSMATE_WINDOW_MS;
  let damage = 0;
  let healing = 0;
  for (const s of seg.samples) {
    if (s.t >= start && s.t <= endT) {
      damage += s.damage;
      healing += s.healing;
    }
  }
  return { damage, healing };
}

function rate(amount: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return amount / (durationMs / 1000);
}

function finalizeAbility(sp: MutableAbility, name: string): AbilityMetrics {
  const minHit = Number.isFinite(sp.minHit) && sp.minHit !== Number.POSITIVE_INFINITY ? sp.minHit : 0;
  const landed = sp.hits + sp.crits + sp.glancing + sp.blocks + sp.crushing;
  const critPct = landed > 0 ? (sp.crits / landed) * 100 : 0;
  const avgHit = sp.swings > 0 && sp.damage > 0
    ? sp.damage / Math.max(1, sp.hits + sp.crits + sp.glancing + sp.blocks + sp.crushing || sp.swings)
    : sp.swings > 0
      ? 0
      : 0;
  // Prefer damage / successful damage applications when we have swings with damage.
  const dmgApps = sp.hits + sp.crits + sp.glancing + sp.blocks + sp.crushing;
  const avg = dmgApps > 0 ? sp.damage / dmgApps : (sp.swings > 0 && sp.healing > 0 ? sp.healing / sp.swings : 0);

  const perTarget: TargetTally[] = [];
  for (const [id, t] of sp.perTarget) {
    perTarget.push({ id, damage: t.damage, healing: t.healing, hits: t.hits, crits: t.crits });
  }
  perTarget.sort((a, b) => b.damage + b.healing - (a.damage + a.healing) || a.id.localeCompare(b.id));

  return {
    name,
    damage: sp.damage,
    healing: sp.healing,
    overhealing: sp.overhealing,
    absorbed: sp.absorbed,
    hits: sp.hits,
    crits: sp.crits,
    misses: sp.misses,
    dodges: sp.dodges,
    parries: sp.parries,
    blocks: sp.blocks,
    resists: sp.resists,
    glancing: sp.glancing,
    crushing: sp.crushing,
    swings: sp.swings,
    minHit,
    maxHit: sp.maxHit,
    avgHit: avg || avgHit,
    critPct,
    casts: sp.casts,
    uptimeMs: sp.uptimeMs,
    perTarget,
  };
}

function sortMetric(
  kind: MeterSortKind,
  a: { damage: number; healing: number; dps?: number },
  b: { damage: number; healing: number; dps?: number },
): number {
  if (kind === 'healing') return b.healing - a.healing;
  if (kind === 'dps') return (b.dps ?? b.damage) - (a.dps ?? a.damage);
  return b.damage - a.damage;
}

function snapshotSegment(seg: SegmentState, sortKind: MeterSortKind, segment: MeterSegment): DpsMateSnapshot {
  // Close open auras at lastT for uptime with a SOFT close: compute the extra uptime in a local
  // map without deleting, so a re-snapshot is not destructive.
  const openBonus = new Map<string, number>(); // abilityKey caster\0name → ms
  if (seg.lastT != null) {
    for (const open of seg.openAuras.values()) {
      if (!open.casterId) continue;
      const dur = Math.max(0, seg.lastT - open.startT);
      const k = `${open.casterId}\0${open.abilityName}`;
      openBonus.set(k, (openBonus.get(k) ?? 0) + dur);
    }
  }

  const durationMs =
    seg.firstT != null && seg.lastT != null ? Math.max(0, seg.lastT - seg.firstT) : 0;
  const endT = seg.lastT ?? 0;
  const win = windowTotals(seg, endT);
  const windowDenom = Math.min(DPSMATE_WINDOW_MS, durationMs || DPSMATE_WINDOW_MS);

  const rows: ActorMetrics[] = [];
  for (const [id, a] of seg.actors) {
    const abilities: AbilityMetrics[] = [];
    for (const [name, sp] of a.bySpell) {
      const fin = finalizeAbility(sp, name);
      const bonus = openBonus.get(`${id}\0${name}`) ?? 0;
      if (bonus > 0) fin.uptimeMs += bonus;
      abilities.push(fin);
    }
    abilities.sort(
      (x, y) =>
        sortMetric(sortKind, x, y) || x.name.localeCompare(y.name),
    );

    const dps = rate(a.damage, durationMs);
    const hps = rate(a.healing, durationMs);
    // Window rates use full window length (or elapsed if shorter).
    const wDur = durationMs > 0 ? Math.min(DPSMATE_WINDOW_MS, durationMs) : windowDenom;
    // Per-actor window: only global samples exist, so the window share is approximated from the
    // actor's damage ratio. Per-actor samples would be exact.
    const shareD =
      seg.totalDamage > 0 ? a.damage / seg.totalDamage : 0;
    const shareH =
      seg.totalHealing > 0 ? a.healing / seg.totalHealing : 0;
    const windowDps = rate(win.damage * shareD, wDur);
    const windowHps = rate(win.healing * shareH, wDur);

    const damageTakenBySource = [...a.damageTakenBySource.entries()]
      .map(([sid, damage]) => ({ id: sid, damage }))
      .sort((x, y) => y.damage - x.damage || x.id.localeCompare(y.id));

    rows.push({
      id,
      damage: a.damage,
      healing: a.healing,
      overhealing: a.overhealing,
      absorbed: a.absorbed,
      damageTaken: a.damageTaken,
      absorbedTaken: a.absorbedTaken,
      deaths: a.deaths,
      interrupts: a.interrupts,
      dispels: a.dispels,
      hits: a.hits,
      crits: a.crits,
      misses: a.misses,
      dodges: a.dodges,
      parries: a.parries,
      blocks: a.blocks,
      resists: a.resists,
      glancing: a.glancing,
      crushing: a.crushing,
      dps,
      hps,
      windowDps,
      windowHps,
      abilities,
      damageTakenBySource,
    });
  }

  rows.sort(
    (a, b) => sortMetric(sortKind, a, b) || a.id.localeCompare(b.id),
  );

  return {
    actors: rows,
    totalDamage: seg.totalDamage,
    totalHealing: seg.totalHealing,
    totalOverhealing: seg.totalOverhealing,
    totalDamageTaken: seg.totalDamageTaken,
    durationMs,
    windowMs: DPSMATE_WINDOW_MS,
    segment,
    timeline: seg.samples.map((s) => ({ t: s.t, damage: s.damage, healing: s.healing })),
  };
}

/** Create dual-segment (current fight + whole run) DPSMate aggregator. */
export function createDpsMateMeter(): DpsMateMeter {
  let fight = emptySegment();
  let run = emptySegment();
  // Whole-run clock: every pull's event `t` restarts at 0, so run-segment events shift by the
  // accumulated span of CLOSED fights. Idle time between pulls is deliberately not counted.
  let runOffsetMs = 0;

  const feed = (seg: SegmentState, events: readonly CombatEvent[], offsetMs = 0): void => {
    for (const e of events) {
      ingestOne(seg, offsetMs === 0 ? e : ({ ...e, t: (e.t ?? 0) + offsetMs } as CombatEvent));
    }
  };

  return {
    ingest(events: readonly CombatEvent[]): void {
      feed(fight, events);
      feed(run, events, runOffsetMs);
    },

    beginFight(): void {
      // Fold the closed fight's span into the run clock, then drop its tallies. The offset applies
      // only to a finished per-pull segment that restarted near 0 and actually fought.
      if (
        fight.lastT != null
        && fight.firstT != null
        && fight.firstT < 100
        && fight.totalDamage + fight.totalHealing > 0
      ) {
        runOffsetMs += Math.max(0, fight.lastT);
      }
      fight = emptySegment();
    },

    snapshot(sortKind: MeterSortKind = 'damage', segment: MeterSegment = 'fight'): DpsMateSnapshot {
      const seg = segment === 'run' ? run : fight;
      return snapshotSegment(seg, sortKind, segment);
    },

    reset(): void {
      fight = emptySegment();
      run = emptySegment();
    },
  };
}

// One-shot fold of an event log into a DPSMate snapshot (post-run / pull report). Does not dual-segment;
// whole log = one fight.
export function dpsMateFromEvents(
  events: readonly CombatEvent[],
  sortKind: MeterSortKind = 'damage',
): DpsMateSnapshot {
  const m = createDpsMateMeter();
  m.ingest(events);
  return m.snapshot(sortKind, 'fight');
}

/** Friendly filter helper: party-ish sides for post-run party table. */
export function isPartySide(id: string): boolean {
  return id === 'player' || id === 'pet' || /^ally_\d+$/.test(id) || id.startsWith('totem_');
}

export function isHostileSide(id: string): boolean {
  return isEnemySide(id);
}

/** Guardian combatant id → owning player/ally side (pet → player, totem_fire → ally_2, …). */
export type GuardianOwnerMap = Readonly<Record<string, string>>;

export interface PartyMeterOpts {
  // Fold pet/totem rows into their owner (Details/DPSMate "merge pets" default). Guardian abilities keep a
  // `"Totem/Pet name: ability"` label under the owner.
  mergeGuardians?: boolean;
  /** Drop enemy actors from the ranking (party damage done). Default true. */
  friendlyOnly?: boolean;
  /** guardian side → owner side */
  owners?: GuardianOwnerMap;
  /** guardian side → short display name for ability prefixes */
  guardianLabels?: Readonly<Record<string, string>>;
}

function cloneAbility(a: AbilityMetrics): AbilityMetrics {
  return {
    ...a,
    perTarget: a.perTarget.map((t) => ({ ...t })),
  };
}

function cloneActor(a: ActorMetrics): ActorMetrics {
  return {
    ...a,
    abilities: a.abilities.map(cloneAbility),
    damageTakenBySource: a.damageTakenBySource.map((s) => ({ ...s })),
  };
}

function addHitBreakdown(into: HitBreakdown, from: HitBreakdown): void {
  into.hits += from.hits;
  into.crits += from.crits;
  into.misses += from.misses;
  into.dodges += from.dodges;
  into.parries += from.parries;
  into.blocks += from.blocks;
  into.resists += from.resists;
  into.glancing += from.glancing;
  into.crushing += from.crushing;
}

function mergeAbilityInto(into: AbilityMetrics, from: AbilityMetrics): void {
  into.damage += from.damage;
  into.healing += from.healing;
  into.overhealing += from.overhealing;
  into.absorbed += from.absorbed;
  into.swings += from.swings;
  into.casts += from.casts;
  into.uptimeMs += from.uptimeMs;
  addHitBreakdown(into, from);
  if (Number.isFinite(from.minHit) && from.minHit < into.minHit) into.minHit = from.minHit;
  if (from.maxHit > into.maxHit) into.maxHit = from.maxHit;
  const landed = into.hits + into.crits + into.glancing + into.blocks + into.crushing;
  into.avgHit = into.swings > 0 ? into.damage / into.swings : 0;
  into.critPct = landed > 0 ? (into.crits / landed) * 100 : 0;
  // Per-target: sum by id.
  const byId = new Map(into.perTarget.map((t) => [t.id, { ...t }]));
  for (const t of from.perTarget) {
    const cur = byId.get(t.id);
    if (!cur) byId.set(t.id, { ...t });
    else {
      cur.damage += t.damage;
      cur.healing += t.healing;
      cur.hits += t.hits;
      cur.crits += t.crits;
    }
  }
  into.perTarget = [...byId.values()].sort((a, b) => b.damage - a.damage || a.id.localeCompare(b.id));
}

// DPSMate/Details-style party view of a snapshot: optionally merge pets and totems into their
// owner, and optionally drop hostile actors from the ranking. Pure — the input is not mutated.
export function partyMeterSnapshot(
  snap: DpsMateSnapshot,
  opts: PartyMeterOpts = {},
): DpsMateSnapshot {
  const merge = opts.mergeGuardians !== false;
  const friendlyOnly = opts.friendlyOnly !== false;
  const owners = opts.owners ?? {};
  const labels = opts.guardianLabels ?? {};

  const byId = new Map<string, ActorMetrics>();
  for (const a of snap.actors) byId.set(a.id, cloneActor(a));

  if (merge) {
    for (const [gid, ownerId] of Object.entries(owners)) {
      if (!ownerId || gid === ownerId) continue;
      const g = byId.get(gid);
      if (!g) continue;
      let owner = byId.get(ownerId);
      if (!owner) {
        // Owner had zero events of their own — still surface them as a rank row.
        owner = {
          id: ownerId,
          damage: 0,
          healing: 0,
          overhealing: 0,
          absorbed: 0,
          damageTaken: 0,
          absorbedTaken: 0,
          deaths: 0,
          interrupts: 0,
          dispels: 0,
          hits: 0,
          crits: 0,
          misses: 0,
          dodges: 0,
          parries: 0,
          blocks: 0,
          resists: 0,
          glancing: 0,
          crushing: 0,
          dps: 0,
          hps: 0,
          windowDps: 0,
          windowHps: 0,
          abilities: [],
          damageTakenBySource: [],
        };
        byId.set(ownerId, owner);
      }
      owner.damage += g.damage;
      owner.healing += g.healing;
      owner.overhealing += g.overhealing;
      owner.absorbed += g.absorbed;
      owner.damageTaken += g.damageTaken;
      owner.absorbedTaken += g.absorbedTaken;
      owner.deaths += g.deaths;
      owner.interrupts += g.interrupts;
      owner.dispels += g.dispels;
      addHitBreakdown(owner, g);
      const gLabel = labels[gid] ?? gid;
      for (const ab of g.abilities) {
        const prefixed = cloneAbility(ab);
        prefixed.name = `${gLabel}: ${ab.name}`;
        const existing = owner.abilities.find((x) => x.name === prefixed.name);
        if (existing) mergeAbilityInto(existing, prefixed);
        else owner.abilities.push(prefixed);
      }
      // Taken-from sources stay on the owner so DTPS is coherent.
      const takenMap = new Map(owner.damageTakenBySource.map((s) => [s.id, s.damage]));
      for (const s of g.damageTakenBySource) {
        takenMap.set(s.id, (takenMap.get(s.id) ?? 0) + s.damage);
      }
      owner.damageTakenBySource = [...takenMap.entries()]
        .map(([id, damage]) => ({ id, damage }))
        .sort((a, b) => b.damage - a.damage || a.id.localeCompare(b.id));
      byId.delete(gid);
    }
  }

  let actors = [...byId.values()];
  if (friendlyOnly) {
    // Party only: player / allies / (unmerged) pets & totems. Hostiles never rank here.
    actors = actors.filter((a) => isPartySide(a.id));
  }

  const durationMs = snap.durationMs;
  for (const a of actors) {
    a.dps = durationMs > 0 ? (a.damage / durationMs) * 1000 : 0;
    a.hps = durationMs > 0 ? (a.healing / durationMs) * 1000 : 0;
    a.abilities.sort((x, y) => y.damage - x.damage || x.name.localeCompare(y.name));
  }
  actors.sort((a, b) => b.damage - a.damage || a.id.localeCompare(b.id));

  const totalDamage = actors.reduce((n, a) => n + a.damage, 0);
  const totalHealing = actors.reduce((n, a) => n + a.healing, 0);
  const totalOverhealing = actors.reduce((n, a) => n + a.overhealing, 0);
  const totalDamageTaken = actors.reduce((n, a) => n + a.damageTaken, 0);

  return {
    ...snap,
    actors,
    totalDamage,
    totalHealing,
    totalOverhealing,
    totalDamageTaken,
  };
}
