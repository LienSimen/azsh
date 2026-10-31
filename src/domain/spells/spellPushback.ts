// Spell damage pushback delay ladder plus the resist roll. Cite: Spell.h GetNextDelayAtDamageMsTime
// ~826; Spell.cpp Delayed ~6804–6821 and DelayedChannel ~6843–6853.

// Delay ladder for the Nth pushback on the current cast/channel (0-based). Cite: Spell.h:826 `1000 -
// m_delayAtDamageCount++ * 200`, floor 200.
export function nextPushbackDelayMs(hitIndex: number): number {
  // hitIndex 0..n: 1000, 800, 600, 400, 200, then stay 200
  if (hitIndex < 0) return 1000;
  if (hitIndex < 5) return 1000 - hitIndex * 200;
  return 200;
}

// Chance to fully resist a cast or channel pushback on this hit: 100, modified by
// SPELLMOD_NOT_LOSE_CASTING_TIME, plus the RESIST_PUSHBACK aura total, minus 100.
export function pushbackResistChancePct(
  auraResistPct: number,
  spellModPctPoints: number = 0,
): number {
  // ApplySpellMod PCT on base 100: totalpct = 100 + sum(pct points) → value * totalpct/100.
  let resistChance = 100;
  const modPts = spellModPctPoints | 0;
  if (modPts !== 0) {
    resistChance = Math.floor((resistChance * (100 + modPts)) / 100);
  }
  resistChance += (auraResistPct | 0) - 100;
  return Math.max(0, resistChance);
}

// True when this hit's pushback is fully resisted (no delay). `chance01` is rng.chance style: argument in
// 0..1.
export function resistsPushback(
  auraResistPct: number,
  spellModPctPoints: number,
  chance01: (p: number) => boolean,
): boolean {
  const pct = pushbackResistChancePct(auraResistPct, spellModPctPoints);
  if (pct <= 0) return false;
  return chance01(pct / 100);
}
