// SCHOOL_ABSORB and INSTAKILL apply helpers, peeled off applySpell for the line budget. Voidwalker
// Sacrifice absorbs on the owner and kills the pet. Cite: Spell.cpp:2422; SpellEffects.cpp:205.
import type { Fighter, ActiveEffect } from './types.ts';
import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import type { Side } from '../core/events.ts';
import { rollBetween } from './formulas.ts';
import { auraHolderIsCastTarget } from './healTargets.ts';
import { isEnemySide } from '../core/events.ts';
import {
  FIRE_WARD_SPELL_IDS,
  FROST_WARD_SPELL_IDS,
  fireWardTalentAbsorbBonus,
  frostWardTalentAbsorbBonus,
} from '../spells/interpreter/class-scripts-kit.ts';

export function applySchoolAbsorbEffect(opts: {
  src: Fighter;
  /** The unit this cast NAMED. Wears the pool whenever the raw row targets a friendly. */
  tgt: Fighter;
  player: Fighter;
  spell: SpellDef;
  eff: Extract<SpellEffect, { kind: 'school_absorb' }>;
  effects: ActiveEffect[];
  effectsOn?: (side: Side) => ActiveEffect[];
  t: number;
  durFor: (ms: number) => number;
  rngNext: () => number;
  push: (e: { t: number; kind: 'aura'; actor: Side; name: string; applied: boolean; spellId?: number }) => void;
  touchEffect?: (e: ActiveEffect) => void;
}): boolean {
  const { src, tgt, player, spell, eff, effects, t, durFor, rngNext, push, touchEffect } = opts;
  // applyTo 'owner' (TARGET_UNIT_CASTER_MASTER 27): pet → master.
  // No master for a non-pet caster → empty target list (C++ skip).
  if (eff.applyTo === 'owner' && src.side !== 'pet') return false;
  // Otherwise the SELECTED unit wears the pool — Power Word: Shield is never a self row, and
  // resolving to the caster shielded the priest. Self rows like Ice Barrier still land on the caster.
  const absorbTgt = eff.applyTo === 'owner' && src.side === 'pet'
    ? player
    : (auraHolderIsCastTarget(spell) && isEnemySide(tgt.side) === isEnemySide(src.side))
      ? tgt
      : src;
  let amount = Math.max(0, Math.round(rollBetween(eff.min, eff.max, rngNext())));
  // Mage Fire/Frost Ward ClassScripts add talent absorb. Cite: Mage.cpp:77–105.
  const sid = spell.id | 0;
  if (FIRE_WARD_SPELL_IDS.has(sid)) {
    amount += fireWardTalentAbsorbBonus(src.spec.spells.map((s) => s.id));
  } else if (FROST_WARD_SPELL_IDS.has(sid)) {
    amount += frostWardTalentAbsorbBonus(src.buffActive);
  }
  const dur = durFor(eff.durationMs);
  absorbTgt.schoolAbsorbs = absorbTgt.schoolAbsorbs.filter((a) => a.id !== spell.id);
  absorbTgt.schoolAbsorbs.push({ schoolMask: eff.schoolMask, amount, id: spell.id });
  const held = opts.effectsOn?.(absorbTgt.side) ?? effects;
  const live = held.find(
    (e) => e.kind === 'school_absorb' && e.spellId === spell.id && e.target === absorbTgt.side,
  );
  if (live) {
    live.expiresAt = t + dur;
    live.min = amount;
    live.max = amount;
    touchEffect?.(live);
  } else {
    effects.push({
      kind: 'school_absorb', source: src.side, target: absorbTgt.side,
      spellId: spell.id, name: spell.name, expiresAt: t + dur, min: amount, max: amount,
    });
  }
  absorbTgt.buffActive.add(spell.id);
  push({ t, kind: 'aura', actor: absorbTgt.side, name: spell.name, applied: true, spellId: spell.id });
  // Vanilla PW:S applies Weakened Soul for 15 s so the target cannot be re-shielded. Linked by the
  // priest spell-family flag bit, not an id table.
  const PWS_FAMILY = 6;
  const PWS_FAMILY_FLAG = 1;
  const WEAKENED_SOUL_ID = 6788;
  const WEAKENED_SOUL_MS = 15_000;
  if (
    (spell.spellFamilyName ?? 0) === PWS_FAMILY
    && ((spell.spellFamilyFlags ?? 0) & PWS_FAMILY_FLAG) !== 0
  ) {
    const wsLive = held.find(
      (e) => e.kind === 'buff' && e.spellId === WEAKENED_SOUL_ID && e.target === absorbTgt.side,
    );
    if (wsLive) {
      wsLive.expiresAt = t + WEAKENED_SOUL_MS;
      touchEffect?.(wsLive);
    } else {
      effects.push({
        kind: 'buff', source: src.side, target: absorbTgt.side,
        spellId: WEAKENED_SOUL_ID, name: 'Weakened Soul', expiresAt: t + WEAKENED_SOUL_MS,
      });
    }
    absorbTgt.buffActive.add(WEAKENED_SOUL_ID);
    push({ t, kind: 'aura', actor: absorbTgt.side, name: 'Weakened Soul', applied: true });
  }
  return true;
}

export function applyInstakillEffect(opts: {
  src: Fighter;
  tgt: Fighter;
  eff: Extract<SpellEffect, { kind: 'instakill' }>;
  dead: (f: Fighter) => boolean;
  checkDeaths: () => void;
}): void {
  const { src, tgt, eff, dead, checkDeaths } = opts;
  // Self means the caster dies, which is how Sacrifice kills the pet after the owner absorb. Both
  // flags mean caster, and an absent one defaults to the self-kill path.
  const selfKill = (eff.self ?? eff.selfCast) !== false;
  const killTgt = selfKill ? src : tgt;
  if (!dead(killTgt)) {
    killTgt.hp = 0;
    checkDeaths();
  }
}
