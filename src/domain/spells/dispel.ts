// Dispel type masks plus a pure ProcessDispelList selection. Pure, with an injected rng for the
// selection; the miss chance is 0 until a spellmod says otherwise. Cite: SpellEffects.cpp ~2521.

/** SPELL_EFFECT_DISPEL — SpellEffectDefines.h. */
export const SPELL_EFFECT_DISPEL = 38;

export const DISPEL_TYPE = {
  NONE: 0,
  MAGIC: 1,
  CURSE: 2,
  DISEASE: 3,
  POISON: 4,
  STEALTH: 5,
  INVISIBILITY: 6,
  ALL: 7,
  SPE_NPC_ONLY: 8,
  ENRAGE: 9,
  ZG_TICKET: 10,
} as const;

/** DISPEL_ALL_MASK = MAGIC|CURSE|DISEASE|POISON */
export const DISPEL_ALL_MASK =
  (1 << DISPEL_TYPE.MAGIC) |
  (1 << DISPEL_TYPE.CURSE) |
  (1 << DISPEL_TYPE.DISEASE) |
  (1 << DISPEL_TYPE.POISON);

/** GetDispellMask(DispelType) — bit for type, or ALL mask. */
export function getDispelMask(dispelType: number): number {
  if (dispelType === DISPEL_TYPE.ALL) return DISPEL_ALL_MASK;
  if (dispelType <= 0) return 0;
  return 1 << dispelType;
}

export interface DispellableAura {
  spellId: number;
  /** Aura Dispel field from SpellEntry. */
  dispelType: number;
  stacks: number;
}

export function isDispellableByMask(aura: DispellableAura, mask: number): boolean {
  if (!mask) return false;
  if (aura.dispelType === DISPEL_TYPE.NONE) return false;
  return (getDispelMask(aura.dispelType) & mask) !== 0;
}

export interface DispelRng {
  /** [0,1) uniform */
  next(): number;
  /** inclusive int */
  int(min: number, max: number): number;
}

// ProcessDispelList: pick up to `count` auras, 0 meaning 1, uniformly among those remaining, each
// pick reducing the stack by one. The miss chance is SPELLMOD_RESIST_DISPEL_CHANCE, base 0.
export function processDispelList(
  candidates: DispellableAura[],
  count: number,
  rng: DispelRng,
  missChance = 0,
): { success: Array<{ spellId: number }>; fail: number[] } {
  const need = count > 0 ? count : 1;
  // Work on stack counts
  const pool = candidates.map((a) => ({ ...a }));
  const success: Array<{ spellId: number }> = [];
  const fail: number[] = [];

  for (let i = 0; i < need && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1);
    const aura = pool[idx]!;
    // resist roll: roll_chance_i(miss_chance)
    if (missChance > 0 && rng.next() * 100 < missChance) {
      fail.push(aura.spellId);
    } else {
      success.push({ spellId: aura.spellId });
    }
    aura.stacks -= 1;
    if (aura.stacks <= 0) pool.splice(idx, 1);
  }
  return { success, fail };
}

export function collectDispellable(
  auras: readonly DispellableAura[],
  mask: number,
): DispellableAura[] {
  return auras.filter((a) => isDispellableByMask(a, mask));
}

// The Classic CheckCast pure-dispel shape: effect 0 is DISPEL and the others are NONE. Those fail
// with nothing-to-dispel on an empty target, while a multi-effect spell keeps casting.
export function isPureDispelSpell(spell: {
  effects: ReadonlyArray<{ kind: string }>;
  rawEffects?: ReadonlyArray<{ effect: number }> | null;
}): boolean {
  const raw = spell.rawEffects;
  if (raw && raw.length > 0) {
    const e0 = raw[0];
    if (!e0 || (e0.effect | 0) !== SPELL_EFFECT_DISPEL) return false;
    for (let i = 1; i < 3; i++) {
      const e = raw[i];
      if (e && (e.effect | 0) !== 0) return false;
    }
    return true;
  }
  return spell.effects.length === 1 && spell.effects[0]!.kind === 'dispel';
}

/** First resolved `dispel` effect on the spell, if any. */
export function firstDispelEffect(
  spell: { effects: ReadonlyArray<{ kind: string; dispelType?: number; count?: number }> },
): { kind: 'dispel'; dispelType: number; count: number } | null {
  for (const e of spell.effects) {
    if (e.kind === 'dispel' && typeof e.dispelType === 'number') {
      return { kind: 'dispel', dispelType: e.dispelType, count: e.count ?? 1 };
    }
  }
  return null;
}

/** Party claim map key. Cite: AUTOPILOT-PLAN §4 row 21 (copy of interruptClaim). */
export function dispelClaimKey(targetId: string, cat: number): string {
  return `${targetId}:${cat}`;
}

// Drop stale party dispel claims: claimer/target dead, category gone, or the claimer is no longer mid-cast
// (kick / move-cancel / fizzle). Instant Tranq/Purge also release in applySpell.
export function pruneDispelClaims(
  claim: Map<string, string>,
  isAlive: (id: string) => boolean,
  hasCat: (targetId: string, cat: number) => boolean,
  isCasting?: (id: string) => boolean,
): void {
  for (const [key, claimerId] of [...claim.entries()]) {
    const sep = key.lastIndexOf(':');
    if (sep <= 0) {
      claim.delete(key);
      continue;
    }
    const targetId = key.slice(0, sep);
    const cat = Number(key.slice(sep + 1));
    if (!Number.isFinite(cat) || !isAlive(claimerId) || !isAlive(targetId) || !hasCat(targetId, cat)) {
      claim.delete(key);
      continue;
    }
    if (isCasting && !isCasting(claimerId)) claim.delete(key);
  }
}
