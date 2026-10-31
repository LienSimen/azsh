// The weapon-damage ability a rotation holds down, and the DPS a weapon reaches through it: the
// scale prices listed DPS, the engine rolls the weapon at its real speed (weapon.ts:770). Pure.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef, SpellDef } from '../../data/schema.ts';
import type { SpellBook } from '../character/spellbook.ts';
import { SHAPESHIFT_FORM } from '../../data/schema/constants.ts';
import { TUNING, calculateMinMaxDamage } from '../../engine/combat/formulas.ts';

/** A resource spender that lands as a weapon hit (Sinister Strike, Cleave, Mortal Strike). */
export interface WeaponSpender {
  spellId: number;
  /** SpellDef.cost — energy per cast. */
  cost: number;
  /** weapon_percent_damage pct; 100 for a plain weapon hit (SS r8 = roll + strikeBonus 68). */
  pct: number;
  /** SpellDef.rank, the tie-break when several ranks are known. */
  rank: number;
}

// A spell whose damage IS the weapon roll: strikeBonus is the DBC basePoints on
// SPELL_EFFECT_WEAPON_DAMAGE* and weapon_percent_damage multiplies that roll (weapon.ts:775-779).
function weaponHitPct(sp: SpellDef): number | null {
  const pctEff = (sp.effects ?? []).find((e) => e.kind === 'weapon_percent_damage');
  if (pctEff) {
    const pct = (pctEff as { pct?: number }).pct ?? 0;
    return pct > 0 ? pct : null;
  }
  return sp.strikeBonus != null ? 100 : null;
}

// Held-down means castable from the front, out of stealth, off cooldown: the schema gates that rule
// out Backstab and Ambush (requiresBehind / requiresStealth) and Riposte (cooldownMs).
function isSpammable(sp: SpellDef): boolean {
  if (sp.requiresBehind || sp.requiresStealth) return false;
  return (sp.cooldownMs || 0) === 0;
}

// SpellEntry.Stances bit for the forms that replace weapon damage with a level×speed band
// (forms.ts:79 isAttackSpeedOverriddenShapeShift): cat, bear, dire bear.
const FORM_OVERRIDES_WEAPON_MASK =
  (1 << (SHAPESHIFT_FORM.CAT - 1))
  | (1 << (SHAPESHIFT_FORM.BEAR - 1))
  | (1 << (SHAPESHIFT_FORM.DIREBEAR - 1));

// A spender castable ONLY inside such a form (a druid's Claw) rolls that band and never this
// weapon, so its weapon keeps the listed-DPS ranking.
function rollsTheEquippedWeapon(sp: SpellDef): boolean {
  const stances = sp.stances ?? 0;
  if (stances === 0) return true;
  return (stances & ~FORM_OVERRIDES_WEAPON_MASK) !== 0;
}

const SPENDER_MEMO = new WeakMap<SpellBook, WeaponSpender | null>();

// The spender to price a weapon against. Energy only: TUNING.energyPerSec is a constant regen
// (Player.cpp POWER_ENERGY), while rage income has no sustainable rate to read here.
export function resolveWeaponSpender(
  spellbook: SpellBook | undefined | null,
  ds: Pick<DataStore, 'spell'>,
): WeaponSpender | null {
  if (!spellbook) return null;
  const hit = SPENDER_MEMO.get(spellbook);
  if (hit !== undefined) return hit;
  let best: WeaponSpender | null = null;
  for (const id of spellbook.known) {
    let sp: SpellDef | undefined;
    try {
      sp = ds.spell(id);
    } catch {
      continue;
    }
    if (!sp || sp.powerType !== 'energy' || !(sp.cost > 0)) continue;
    if (!isSpammable(sp) || !rollsTheEquippedWeapon(sp)) continue;
    const pct = weaponHitPct(sp);
    if (pct == null) continue;
    const cand: WeaponSpender = { spellId: sp.id, cost: sp.cost, pct, rank: sp.rank ?? 0 };
    if (!best || pct > best.pct || (pct === best.pct && cand.rank > best.rank)) best = cand;
  }
  SPENDER_MEMO.set(spellbook, best);
  return best;
}

/** Listed weapon DPS — what the weightscale prices today (playerbotStatWeight mledps). */
export function listedWeaponDps(it: ItemDef): number {
  const w = it.weapon;
  if (!w) return 0;
  const speedSec = (w.delayMs || 2000) / 1000;
  return (w.dmgMin + w.dmgMax) / 2 / speedSec;
}

// DPS the spender adds, in the unit the scale prices: the engine's own ability roll at the weapon's
// real speed, at the rate the resource allows. The flat strikeBonus is weapon-independent, so it is out.
export function spenderWeaponDps(
  it: ItemDef,
  attackPower: number,
  spender: WeaponSpender | null | undefined,
): number {
  const w = it.weapon;
  if (!w || !spender || !(spender.cost > 0)) return 0;
  const castsPerSec = TUNING.energyPerSec / spender.cost;
  const range = calculateMinMaxDamage({
    weaponMin: w.dmgMin,
    weaponMax: w.dmgMax,
    attackPower,
    speedMs: w.delayMs || 2000,
  });
  const perCast = ((range.min + range.max) / 2) * (spender.pct / 100);
  return castsPerSec * perCast;
}
