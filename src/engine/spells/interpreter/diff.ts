// LOCK 9a — normalize + diff interpreter output vs baked effects[]. Test / oracle only — not used by live
// combat.

import type { SpellEffect } from '../../../data/schema.ts';
import type { InterpretResult } from './types.ts';

// Kinds the covered-opcode set can emit, and the only ones the oracle diffs: conjure, imbue, summon
// pet, leech, power burn and drain, threat, dispel, interrupt, combo points, totem, extra attacks.
export const SI2_KINDS = new Set([
  'direct_damage',
  'heal',
  'dot',
  'restore_health',
  'buff',
  'energize',
  'trigger_spell',
  'weapon_percent_damage',
  'conjure',
  'weapon_imbue',
  'summon_pet',
  'health_leech',
  'power_burn',
  'power_drain',
  'extra_attacks',
  'threat',
  'dispel',
  'interrupt_cast',
  'combo_points',
  'summon_totem',
  'spell_magnet',
  // SI3 aura batch bake surfaces
  'cc',
  'speed',
  'proc_trigger_spell',
  'resist',
  // Aura 42 LShield / amount-only path. Cite: map-spell-effects.mjs mapProcTriggerSpell.
  'damage_shield',
]);

export type NormalizeOpts = {
  /** Drop durationMs so amount/kind parity can pass without DurationIndex. */
  ignoreDuration?: boolean;
  /** Drop applyTo (audience) if comparing amount-only. */
  ignoreApplyTo?: boolean;
};

function sortKey(e: SpellEffect): string {
  const k = e.kind;
  if (k === 'direct_damage' || k === 'dot') {
    return `${k}|${e.school}|${e.min}|${e.max}`;
  }
  if (k === 'health_leech') {
    return `${k}|${e.school}|${e.min}|${e.max}|${e.multiplier}`;
  }
  if (k === 'heal' || k === 'energize') {
    const extra = k === 'energize' ? `|${e.powerType}` : '';
    return `${k}${extra}|${e.min}|${e.max}`;
  }
  if (k === 'buff') return `${k}|${e.mod}|${e.amount}`;
  if (k === 'restore_health' || k === 'restore_power') {
    return `${k}|${e.amountPerTick}|${e.tickMs}`;
  }
  if (k === 'trigger_spell') return `${k}|${e.spellId}`;
  if (k === 'weapon_percent_damage') return `${k}|${e.pct}`;
  if (k === 'conjure') return `${k}|${e.item}|${e.count}`;
  if (k === 'summon_pet') return `${k}|${e.creature}`;
  if (k === 'summon_wild') return `${k}|${e.creature}|${e.count}|${e.durationMs}`;
  if (k === 'summon_guardian') return `${k}|${e.creature}|${e.count}|${e.durationMs}`;
  if (k === 'summon_object_wild') return `${k}|${e.goEntry}|${e.durationMs}`;
  if (k === 'activate_object') {
    return `${k}|${e.action}|${e.summonNpcEntry ?? ''}|${e.customAnim ? 1 : 0}`;
  }
  if (k === 'mounted') return `${k}|${e.creatureEntry}`;
  if (k === 'weapon_imbue') {
    return `${k}|${e.enchantId}|${e.durationMs}|${e.family ?? ''}`;
  }
  if (k === 'power_burn') {
    return `${k}|${e.powerType}|${e.min}|${e.max}|${e.multiplier}|${e.school}`;
  }
  if (k === 'power_drain') {
    return `${k}|${e.powerType}|${e.min}|${e.max}|${e.multiplier}`;
  }
  if (k === 'extra_attacks') return `${k}|${e.count}`;
  if (k === 'threat') return `${k}|${e.amount}`;
  if (k === 'dispel') return `${k}|${e.dispelType}|${e.count}`;
  if (k === 'dispel_mechanic') return `${k}|${e.mechanic}|${e.count}`;
  if (k === 'spell_magnet') return `${k}|${e.durationMs}|${e.charges ?? 1}`;
  if (k === 'interrupt_cast') return `${k}|${e.lockoutMs}`;
  if (k === 'combo_points') return `${k}|${e.amount}`;
  if (k === 'summon_totem') {
    return `${k}|${e.slot}|${e.creature}|${e.health}|${e.durationMs}`;
  }
  if (k === 'cc') {
    return `${k}|${e.control}|${e.mechanic}|${e.school}|${e.durationMs}`;
  }
  if (k === 'speed') {
    return `${k}|${e.aura}|${e.pct}|${e.durationMs}`;
  }
  if (k === 'proc_trigger_spell') {
    return `${k}|${e.triggerSpellId}|${e.amount ?? 0}|${e.tickMs ?? 0}|${e.durationMs}`;
  }
  if (k === 'damage_shield') {
    return `${k}|${e.school}|${e.min}|${e.max}|${e.durationMs}`;
  }
  if (k === 'resist') {
    return `${k}|${e.school}|${e.amount}`;
  }
  return JSON.stringify(e);
}

// Stable JSON for deep compare (sorted keys, optional field strip). weapon_imbue: compare interpreter core
// only (enchantId/durationMs/family) — enrich-weapon-imbues bakes combat kit the handler does not invent.
export function normalizeEffect(e: SpellEffect, opts: NormalizeOpts = {}): unknown {
  // Core-only for temp enchant: map-spell-effects emits minimal; enricher adds combat kit.
  if (e.kind === 'weapon_imbue') {
    const core: Record<string, unknown> = {
      kind: 'weapon_imbue',
      enchantId: e.enchantId,
      durationMs: e.durationMs,
    };
    if (e.family) core.family = e.family;
    if (opts.ignoreDuration) delete core.durationMs;
    const keys = Object.keys(core).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = core[k];
    return out;
  }
  // Core-only for totems: enrich-totems bakes name/abilities the handler does not invent.
  // Cite: map-spell-effects.mjs :353–356; SpellEffects.cpp EffectSummonTotem.
  if (e.kind === 'summon_totem') {
    const core: Record<string, unknown> = {
      kind: 'summon_totem',
      slot: e.slot,
      creature: e.creature,
      health: e.health,
      durationMs: e.durationMs,
    };
    if (opts.ignoreDuration) delete core.durationMs;
    const keys = Object.keys(core).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = core[k];
    return out;
  }
  // combo_points: enricher may stamp requiresStealth (Premeditation); C++ effect body is amount only.
  // Cite: SpellEffects.cpp:4213–4225 EffectAddComboPoints.
  if (e.kind === 'combo_points') {
    return { amount: e.amount, kind: 'combo_points' };
  }
  const copy = { ...e } as Record<string, unknown>;
  if (opts.ignoreDuration && 'durationMs' in copy) delete copy.durationMs;
  if (opts.ignoreApplyTo && 'applyTo' in copy) delete copy.applyTo;
  // SI5: proc meta (charges/cooldownMs) came from enrich-spell-aura / LShield / proc_event —
  // retired enrichers. Generic interpreter + proc.ts emit amount/trigger; strip for LOCK 9a.
  if (e.kind === 'proc_trigger_spell' || e.kind === 'damage_shield') {
    delete copy.charges;
    delete copy.cooldownMs;
  }
  // SI3+: leechMultiple on DoTs and breakOnDamage on CC are combat-surface fields the
  // pre-SI5 enricher goldens never stamped — strip so LOCK 9a compares core shapes.
  delete copy.leechMultiple;
  delete copy.breakOnDamage;
  // Sort object keys for stable stringify
  const keys = Object.keys(copy).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = copy[k];
  return out;
}

export function normalizeEffectList(
  effects: SpellEffect[],
  opts: NormalizeOpts = {},
): unknown[] {
  return [...effects]
    .map((e) => normalizeEffect(e, opts))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export interface DiffMismatch {
  spellId: number;
  spellName: string;
  detail: string;
  interpreted: unknown;
  baked: unknown;
}

// Diff SI2-covered kinds only. Baked effects of unhandled kinds are ignored (spell may have extra
// root/cc/etc.). Interpreted effects must match the SI2-kind subset of baked effects.
function diffSi2Effects(
  spellId: number,
  spellName: string,
  interpreted: InterpretResult,
  bakedEffects: SpellEffect[],
  opts: NormalizeOpts = { ignoreDuration: true },
): DiffMismatch | null {
  const got = interpreted.effects.filter((e) => SI2_KINDS.has(e.kind));
  const exp = bakedEffects.filter((e) => SI2_KINDS.has(e.kind));

  // If neither side has SI2 kinds, no mismatch for this gate.
  if (got.length === 0 && exp.length === 0) return null;

  const nGot = normalizeEffectList(got, opts);
  const nExp = normalizeEffectList(exp, opts);
  if (JSON.stringify(nGot) === JSON.stringify(nExp)) return null;

  return {
    spellId,
    spellName,
    detail: `SI2 kinds mismatch (got ${got.map((e) => e.kind).join(',')} vs baked ${exp.map((e) => e.kind).join(',')})`,
    interpreted: nGot,
    baked: nExp,
  };
}

// Full equality for spells whose every raw slot is SI2-covered and every baked effect is an SI2 kind (plus
// optional strikeBonus).
function diffFullCovered(
  spellId: number,
  spellName: string,
  interpreted: InterpretResult,
  bakedEffects: SpellEffect[],
  bakedStrikeBonus: number | undefined,
  opts: NormalizeOpts = { ignoreDuration: true },
): DiffMismatch | null {
  const nGot = normalizeEffectList(interpreted.effects, opts);
  const nExp = normalizeEffectList(bakedEffects, opts);
  const effectsOk = JSON.stringify(nGot) === JSON.stringify(nExp);

  const sbGot = interpreted.strikeBonus ?? 0;
  const sbExp = bakedStrikeBonus ?? 0;
  // Only compare strikeBonus when either side has one (weapon flat).
  const strikeOk = sbGot === sbExp || (sbGot === 0 && sbExp === 0);

  if (effectsOk && strikeOk) return null;

  return {
    spellId,
    spellName,
    detail: !effectsOk
      ? 'effects mismatch'
      : `strikeBonus mismatch got=${sbGot} baked=${sbExp}`,
    interpreted: { effects: nGot, strikeBonus: interpreted.strikeBonus },
    baked: { effects: nExp, strikeBonus: bakedStrikeBonus },
  };
}

export { sortKey };
