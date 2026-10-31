// The spell-modifier runtime. All matching flats are summed and all matching percents added into one
// multiplier, applied once: two -10% mods give 0.80, not 0.81, and flat always lands first.

/** SpellModType — PlayerDefines.h: SPELLMOD_FLAT = 107, SPELLMOD_PCT = 108 */
export const SPELLMOD_FLAT = 107;
export const SPELLMOD_PCT = 108;

/** SpellModOp SPELLMOD_RADIUS — SpellDefines.h op 6 (area-aura / totem friendly radius). */
export const SPELLMOD_RADIUS_OP = 6;
/** `applySpellMod({ op })` label for SPELLMOD_RADIUS. */
export const SPELLMOD_RADIUS_LABEL = 'RADIUS';

// The radius modifiers a talent-effect list carries. Every radius row lands on the same two auras, so
// there is exactly ONE radius pipeline and never a per-talent branch.
export function radiusSpellModsFromTalentEffects(
  // Deliberately structural: the same reader takes a baked talent-effect union and a hand-written gear
  // row, without this pure module importing the data schema.
  talentEffects: readonly unknown[] | undefined | null,
): SpellMod[] {
  if (!talentEffects || talentEffects.length === 0) return [];
  const out: SpellMod[] = [];
  for (const raw of talentEffects) {
    const e = raw as {
      kind?: string;
      aura?: number;
      basePoints?: number;
      miscValue?: number;
      attr?: string;
      value?: number;
      pct?: boolean;
    };
    if (e.kind === 'spell_mod' && e.attr === 'radius') {
      out.push({
        type: e.pct ? 'pct' : 'flat',
        value: e.value ?? 0,
        op: SPELLMOD_RADIUS_LABEL,
      });
      continue;
    }
    if (e.kind !== 'other') continue;
    if (((e.miscValue ?? 0) | 0) !== SPELLMOD_RADIUS_OP) continue;
    if (e.aura !== SPELLMOD_FLAT && e.aura !== SPELLMOD_PCT) continue;
    const amount = ((e.basePoints ?? 0) | 0) + 1; // + EffectBaseDice
    if (amount === 0) continue;
    out.push({
      type: e.aura === SPELLMOD_PCT ? 'pct' : 'flat',
      value: amount,
      op: SPELLMOD_RADIUS_LABEL,
    });
  }
  return out;
}

// Ops that need special ApplySpellMod handling. Numbers from SpellDefines.h (do not invent): CASTING_TIME =
// 10, COST = 14. We use labels here so callers do not hard-code opaque ints.
export type SpellModOpLabel = 'CASTING_TIME' | 'COST' | string;

export type SpellModKind = 'flat' | 'pct';

// One modifier entry (talent spell_mod, set bonus, or finite proc mod). Mirrors SpellModifier fields used
// by ApplySpellMod + charge consumption.
export interface SpellMod {
  type: SpellModKind;
  value: number;
  // Op this mod belongs to. When omitted, `opts.op` from applySpellMod is used (CMaNGOS stores mods in
  // per-op lists, so every entry shares that op).
  op?: SpellModOpLabel;
  // Finite / charge-consuming mods (Shadow Trance, Netherwind Focus, …). isFinite ≡ charges > 0 at creation
  // (PlayerDefines.h SpellModifier ctor).
  charges?: number;
  isFinite?: boolean;
  /** Stable identity for consume / refund tracking within a cast. */
  id?: string;
  // When charges hit 0 during ApplySpellMod, CMaNGOS sets charges = -1 ("expired but locked until spell
  // casting finish"). Marked spent after success.
  spent?: boolean;
}

export interface ApplySpellModOpts {
  // When true, finite mods that apply are recorded in `consumed` (Player.h finalUse). Does not mutate
  // `mods` — call commitCastSuccess / cancelCastRefund to update state.
  finalUse?: boolean;
  // Op for this ApplySpellMod call. Early-break runs for CASTING_TIME / COST (Player.h:2584–2586).
  // Instant-cast guard for CASTING_TIME (Player.h:2595–2596).
  op?: SpellModOpLabel;
}

export interface ApplySpellModResult {
  value: number;
  // Ids of finite mods that had a charge decremented for this apply. Empty when finalUse is false or no
  // finite mods applied.
  consumed: string[];
}

/** 10 * IN_MILLISECONDS — Player.h instant-cast guard threshold (10 s). */
export const INSTANT_CAST_GUARD_MS = 10_000;

function modId(mod: SpellMod, index: number): string {
  return mod.id ?? `mod:${index}`;
}

function isEarlyBreakOp(op: SpellModOpLabel | undefined): boolean {
  return op === 'CASTING_TIME' || op === 'COST';
}

// Player::ApplySpellMod — pure port of Player.h:2575–2630 math. Skips matching (caller filters). Does not
// mutate `mods`. Integer-style truncation toward zero matches C++ cast of the T template for int bases.
export function applySpellMod(
  basevalue: number,
  mods: readonly SpellMod[],
  opts: ApplySpellModOpts = {},
): ApplySpellModResult {
  const applyOp = opts.op;
  const finalUse = opts.finalUse === true;

  let totalpct = 100;
  let totalflat = 0;
  const consumed: string[] = [];
  const consumedSet = new Set<string>();

  for (let i = 0; i < mods.length; i++) {
    const mod = mods[i]!;
    if (mod.spent) continue;

    // The casting-time and cost operations break EARLY, before this modifier applies, so the remaining
    // mods neither apply nor consume a charge. The C++ truncates toward zero here too.
    if (isEarlyBreakOp(applyOp)) {
      const running = truncTowardZero(
        ((basevalue + totalflat) * Math.max(0, totalpct)) / 100,
      );
      if (running <= 0) break;
    }

    if (mod.type === 'flat') {
      totalflat += mod.value;
    } else if (mod.type === 'pct') {
      // Player.h:2595–2596 — skip −100% (or lower) PCT cast-time for base ≥ 10 s.
      const op = applyOp ?? mod.op;
      if (op === 'CASTING_TIME' && basevalue >= INSTANT_CAST_GUARD_MS && mod.value <= -100) {
        continue;
      }
      totalpct += mod.value;
    }

    // Player.h:2601–2618 — finite charge bookkeeping when finalUse.
    if (mod.isFinite && finalUse) {
      const id = modId(mod, i);
      // Already consumed this cast → do not consume again (m_consumedMods).
      if (consumedSet.has(id)) continue;
      // charges === -1: locked to consuming cast; still applies, no further consume.
      if (mod.charges !== undefined && mod.charges < 0) continue;
      // No charges left (0) and not locked — skip consume.
      if (mod.charges !== undefined && mod.charges === 0) continue;

      consumedSet.add(id);
      consumed.push(id);
    }
  }

  // Player.h:2625–2626
  if (totalpct < 0) totalpct = 0;

  let value = basevalue;
  // Player.h:2628–2629 — only rewrite when something changed.
  if (totalflat !== 0 || totalpct !== 100) {
    // C++ T((base + flat) * max(0, totalpct) / 100) — truncate toward zero for ints.
    value = truncTowardZero(((basevalue + totalflat) * Math.max(0, totalpct)) / 100);
  }

  return { value, consumed };
}

function truncTowardZero(n: number): number {
  return n < 0 ? Math.ceil(n) : Math.floor(n);
}

// After a successful cast, decrement one charge per consumed id and drop a modifier that hits zero.
// Pure: it returns a new array with the spent mods filtered out. Cite: Player.cpp:16843-16861.
export function commitCastSuccess(
  mods: readonly SpellMod[],
  consumedIds: readonly string[],
): SpellMod[] {
  if (!consumedIds.length) return mods.map((m) => ({ ...m }));
  const set = new Set(consumedIds);
  const out: SpellMod[] = [];
  for (let i = 0; i < mods.length; i++) {
    const mod = mods[i]!;
    const id = modId(mod, i);
    if (!set.has(id)) {
      out.push({ ...mod });
      continue;
    }
    const prev = mod.charges ?? 1;
    const next = prev - 1;
    if (next <= 0) {
      // Spent — drop (aura removed when charges exhausted).
      continue;
    }
    out.push({ ...mod, charges: next, isFinite: true });
  }
  return out;
}

// After a cancelled cast, charges are refunded. Applying a modifier does not mutate charges, so this
// is a no-op on the state and returns a shallow copy for symmetry. Cite: Player.cpp:16863-16872.
export function cancelCastRefund(
  mods: readonly SpellMod[],
  consumedIds: readonly string[],
  opts?: { alreadyDecremented?: boolean },
): SpellMod[] {
  if (!consumedIds.length || !opts?.alreadyDecremented) {
    return mods.map((m) => ({ ...m }));
  }
  const set = new Set(consumedIds);
  return mods.map((mod, i) => {
    const id = modId(mod, i);
    if (!set.has(id)) return { ...mod };
    const charges = (mod.charges ?? 0) + 1;
    return { ...mod, charges, isFinite: true, spent: false };
  });
}

// Decrement charges in place for testing the intermediate ApplySpellMod state (charges → 0 becomes −1
// "locked", matching Player.h:2616–2617). Prefer commitCastSuccess / cancelCastRefund for cast lifecycle.
function applyChargeDecrements(
  mods: readonly SpellMod[],
  consumedIds: readonly string[],
): SpellMod[] {
  if (!consumedIds.length) return mods.map((m) => ({ ...m }));
  const set = new Set(consumedIds);
  return mods.map((mod, i) => {
    const id = modId(mod, i);
    if (!set.has(id)) return { ...mod };
    const prev = mod.charges ?? 1;
    let next = prev - 1;
    if (next === 0) next = -1; // locked until cast finishes
    return { ...mod, charges: next, isFinite: true };
  });
}

/** Helpers for building mods from talent spell_mod effects. */
function talentEffectToSpellMod(
  value: number,
  pct: boolean,
  op?: SpellModOpLabel,
  extra?: Partial<SpellMod>,
): SpellMod {
  return {
    type: pct ? 'pct' : 'flat',
    value,
    op,
    ...extra,
  };
}

// Map withTalentMods attr names → ApplySpellMod op labels for guards. SpellDefines.h: CASTING_TIME = 10,
// COST = 14 (cited, not invented as free numbers).
export function attrToSpellModOp(
  attr: 'damage' | 'cost' | 'cooldown' | 'castTime' | 'duration' | 'critChance' | 'threat' | 'radius' | 'notLoseCastingTime',
): SpellModOpLabel {
  switch (attr) {
    case 'radius':
      // SPELLMOD_RADIUS = 6 (SpellDefines.h). Applied to area-aura / totem radii.
      return 'RADIUS';
    case 'castTime':
      return 'CASTING_TIME';
    case 'cost':
      return 'COST';
    case 'damage':
      return 'DAMAGE';
    case 'cooldown':
      return 'COOLDOWN';
    case 'duration':
      return 'DURATION';
    case 'critChance':
      return 'CRITICAL_CHANCE';
    case 'threat':
      return 'THREAT';
    case 'notLoseCastingTime':
      // SPELLMOD_NOT_LOSE_CASTING_TIME = 9. Delayed / DelayedChannel resist roll.
      return 'NOT_LOSE_CASTING_TIME';
  }
}
