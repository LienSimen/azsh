// Aura apply, refresh, stack amount and proc charges. Adds the stack cap and charge consume on top of
// the refresh combat already did, without inventing spell-group data. Pure helpers.

import { SPELL_ATTR } from './spellAttributes.ts';

/** Minimal aura identity for stacking decisions. */
export interface AuraKey {
  spellId: number;
  source: string;
  target: string;
  kind?: string;
}

export interface StackableAura {
  spellId: number;
  source: string;
  target: string;
  kind?: string;
  expiresAt: number;
  stacks?: number;
  charges?: number;
  /** Effect-specific payload left to the caller; helpers only touch stack/charge/duration. */
  [key: string]: unknown;
}

export type AuraApplyAction =
  | { action: 'add'; stacks: number; charges?: number; replaces?: readonly number[] }
  | { action: 'refresh'; stacks: number; charges?: number; index: number }
  | { action: 'stack'; stacks: number; charges?: number; index: number }
  | { action: 'blocked'; reason: AuraBlockReason };

// Why an apply was refused: `weaker` and `lower-rank` are the two refusal arms of the no-stack removal,
// and the client shows one bounced message for both. Cite: Unit.cpp:5010-5018.
export type AuraBlockReason = 'weaker' | 'lower-rank';

/** One live aura row, as much of it as the identity rules need. */
export interface ExistingAura extends AuraKey {
  stacks?: number;
  charges?: number;
  // The aura's own modifier amount. Used for the strength compare, which divides by the stack count and
  // compares magnitudes so two negative mods order the way the C++ does.
  amount?: number;
  /** The BuffMod name, standing in for `IsSimilarAuraEffect`'s aura-name equality. */
  mod?: string;
}

// The rank chain and uniqueness inputs, injected so this module stays pure (no DataStore). `chainOf` is
// `dataStore.spellChain`, baked with prev/first/rank on 2,212 rows.
export interface AuraIdentityOpts {
  chainOf?: (spellId: number) => { first: number; rank: number } | undefined;
  /** SPELL_ATTR_EX_AURA_UNIQUE (AttributesEx 0x800) on the INCOMING spell. */
  auraUnique?: boolean;
  /** The incoming aura's own amount and mod, for the strength compare. */
  incomingAmount?: number;
  incomingMod?: string;
}

export type AuraChainNode = { first: number; rank: number };

// Pair two spell ids on the same rank ladder, recovering the rank-1 root the trainer table drops: the
// bake deletes lone roots, so 677 of 684 first ids have no row of their own.
export function resolveChainPair(
  aId: number,
  bId: number,
  chainOf: (id: number) => AuraChainNode | undefined,
): { a: AuraChainNode; b: AuraChainNode } | null {
  if (aId === bId) return null;
  let a = chainOf(aId);
  let b = chainOf(bId);
  if (!a && b && b.first === aId) a = { first: aId, rank: 1 };
  if (!b && a && a.first === bId) b = { first: bId, rank: 1 };
  if (!a || !b || a.first !== b.first) return null;
  return { a, b };
}

// Decide how to apply an aura given the live list, the stack cap and the charges: add, refresh, or
// increment a stack up to the cap. Never invent a spell-group unique or maximum without sourced data.
export function planAuraApply(
  existing: ReadonlyArray<ExistingAura>,
  incoming: AuraKey,
  opts: {
    stackAmount?: number;
    procCharges?: number;
    /** When true, match kind as well (dot vs buff). Default true when both have kind. */
    matchKind?: boolean;
    // Rank chain / uniqueness / strength inputs. Omit and nothing below the plain refresh-or-stack path
    // runs, which is what every pre-P7 caller expects.
    identity?: AuraIdentityOpts;
    // The same spell on the same target from a DIFFERENT caster shares one holder: two warriors build
    // ONE 5-stack Sunder, not two. False only for spells carrying the per-caster dot stacking rule.
    matchAnyCaster?: boolean;
  } = {},
): AuraApplyAction {
  const stackCap = opts.stackAmount != null && opts.stackAmount > 0 ? opts.stackAmount : 1;
  const charges = opts.procCharges != null && opts.procCharges > 0 ? opts.procCharges : undefined;
  const matchKind = opts.matchKind !== false;
  const ident = opts.identity;
  // SPELL_ATTR_EX_AURA_UNIQUE is unique REGARDLESS of caster, so it forces the same-holder
  // match even when the caller would have kept one row per caster. Cite: Unit.cpp:4970.
  const matchAnyCaster = opts.matchAnyCaster === true || ident?.auraUnique === true;

  const sameTargetKind = (e: ExistingAura): boolean => {
    if (e.target !== incoming.target) return false;
    return !(matchKind && e.kind != null && incoming.kind != null && e.kind !== incoming.kind);
  };

  const index = existing.findIndex((e) => {
    if (e.spellId !== incoming.spellId) return false;
    if (!matchAnyCaster && e.source !== incoming.source) return false;
    return sameTargetKind(e);
  });

  if (index < 0) {
    const identityPlan = ident ? planIdentity(existing, incoming, ident, sameTargetKind) : null;
    if (identityPlan) {
      return identityPlan.action === 'add' ? { ...identityPlan, charges } : identityPlan;
    }
    return { action: 'add', stacks: 1, charges };
  }

  const live = existing[index]!;
  const curStacks = live.stacks ?? 1;

  // A MOD_STAT world buff stacks with everything, including a second application of a different spell.
  // Same-id still refreshes below. Cite: SpellStacking.cpp:251-254.
  if (stackCap <= 1) {
    return { action: 'refresh', stacks: 1, charges: charges ?? live.charges, index };
  }

  if (curStacks < stackCap) {
    return {
      action: 'stack',
      stacks: curStacks + 1,
      charges: charges ?? live.charges,
      index,
    };
  }

  // At cap: refresh duration, keep stacks (and optionally reset charges if re-applied with charges).
  return {
    action: 'refresh',
    stacks: curStacks,
    charges: charges ?? live.charges,
    index,
  };
}

// IsSimilarExistingAuraStronger: the existing aura wins when its per-stack magnitude is larger, with
// both flipped to absolute when negative, so a -80 armor debuff outranks a -40. Cite: SpellMgr.h:1566.
function existingIsStronger(e: ExistingAura, incomingAmount: number): boolean {
  if (e.amount == null) return false;
  const perStack = e.amount / Math.max(1, e.stacks ?? 1);
  if (perStack < 0 && incomingAmount < 0) return Math.abs(perStack) > Math.abs(incomingAmount);
  return perStack > incomingAmount;
}

// Rank-chain identity before a fresh add: strength and rank bounce run only for the same ladder, and a
// lower rank is removed for every caster. Returns null so the caller falls through to a plain add.
function planIdentity(
  existing: ReadonlyArray<ExistingAura>,
  incoming: AuraKey,
  ident: AuraIdentityOpts,
  sameTargetKind: (e: ExistingAura) => boolean,
): AuraApplyAction | null {
  const chainOf = ident.chainOf;
  const replaces: number[] = [];
  for (let i = 0; i < existing.length; i++) {
    const e = existing[i]!;
    if (e.spellId === incoming.spellId) continue;
    if (!sameTargetKind(e)) continue;
    const pair = chainOf ? resolveChainPair(incoming.spellId, e.spellId, chainOf) : null;
    if (!pair) continue;
    // Same ladder is `!stackable` for positive multi-rank (SpellStacking.cpp:352-353). Strength
    // still needs a similar effect pair (SpellMgr.h:1558-1563) and runs before the rank bounce.
    const similar = ident.incomingMod != null && e.mod != null && e.mod === ident.incomingMod;
    if (similar && ident.incomingAmount != null && existingIsStronger(e, ident.incomingAmount)) {
      return { action: 'blocked', reason: 'weaker' };
    }
    if (pair.b.rank > pair.a.rank) return { action: 'blocked', reason: 'lower-rank' };
    if (pair.b.rank < pair.a.rank) replaces.push(i);
  }
  return replaces.length > 0 ? { action: 'add', stacks: 1, replaces } : null;
}

// Effect kinds that already carry the spell's proc charges. The charge drops once per holder, so a
// sibling buff must not also consume it. Cite: SpellAuras.cpp DropAuraCharge.
export const PROC_CHARGE_CARRIER_KINDS = new Set([
  'damage_shield',
  'proc_trigger_spell',
]);

/** Aura kinds that hold procCharges when no carrier sibling exists. */
export const PROC_CHARGE_HOLDER_KINDS = new Set([
  'buff',
  'damage_shield',
  'proc_trigger_spell',
  'mechanic_immunity',
  'damage_immunity',
  'stealth',
  'spell_magnet',
  'next_cast_mod',
  'sweeping_strikes',
  'combustion',
]);

export type ProcChargeSpell = {
  procCharges?: number;
  effects?: ReadonlyArray<{ kind: string; charges?: number }>;
};

export type ProcChargeEffect = { kind?: string; charges?: number };

// Proc charges for one aura holder or one of its effects: the baked effect charges win, else the
// spell's own, skipped on a non-carrier sibling when a carrier kind is present.
export function auraHolderCharges(
  spell: ProcChargeSpell | null | undefined,
  effect?: ProcChargeEffect | null,
): number {
  if (!spell) return 0;
  if (effect?.charges != null && effect.charges > 0) return effect.charges | 0;
  const n = (spell.procCharges ?? 0) | 0;
  if (n <= 0) return 0;
  const effects = spell.effects ?? [];
  const hasCarrier = effects.some((e) => PROC_CHARGE_CARRIER_KINDS.has(e.kind));
  if (effect) {
    const kind = effect.kind ?? '';
    if (hasCarrier) return PROC_CHARGE_CARRIER_KINDS.has(kind) ? n : 0;
    return PROC_CHARGE_HOLDER_KINDS.has(kind) ? n : 0;
  }
  return n;
}

// Stamp missing effect.charges from SpellEntry.procCharges. Mutates in place. Same sibling rule as
// auraHolderCharges.
export function stampProcChargesOnEffects(
  effects: Array<{ kind: string; charges?: number }>,
  procCharges: number | undefined,
): Array<{ kind: string; charges?: number }> {
  const n = (procCharges ?? 0) | 0;
  if (n <= 0 || effects.length === 0) return effects;
  const hasCarrier = effects.some((e) => PROC_CHARGE_CARRIER_KINDS.has(e.kind));
  for (const e of effects) {
    if (e.charges != null && e.charges > 0) continue;
    if (hasCarrier) {
      if (PROC_CHARGE_CARRIER_KINDS.has(e.kind)) e.charges = n;
    } else if (PROC_CHARGE_HOLDER_KINDS.has(e.kind)) {
      e.charges = n;
    }
  }
  return effects;
}

// Decrement aura charges after a successful proc fire. Returns remaining charges (0 = remove aura). Absent
// charges = unlimited (-1). Cite: aura procCharges consume on proc fire (UnitAuraProcHandler).
export function consumeProcCharge(charges: number | undefined | null): {
  remaining: number | undefined;
  remove: boolean;
} {
  if (charges == null || charges < 0) {
    return { remaining: undefined, remove: false };
  }
  if (charges <= 1) {
    return { remaining: 0, remove: true };
  }
  return { remaining: charges - 1, remove: false };
}

/** Clamp stack count to StackAmount (Player.cpp / Pet.cpp stack clamp pattern). */
function clampStacks(stacks: number, stackAmount?: number): number {
  if (stackAmount == null || stackAmount <= 0) return Math.max(1, stacks);
  return Math.min(Math.max(1, stacks), stackAmount);
}

// Two positive spells in one class spell family never stack, with or without a `spell_group` row:
// SpellStacking.cpp:135 multirank, :352. This is why Gift of the Wild replaces Mark of the Wild.

/** Structural subset of SpellDef this rule reads, so fixtures and baked rows both work. */
export type StackSpell = {
  spellFamilyName?: number;
  spellFamilyFlags?: number;
  attributes?: number;
  effects?: readonly { kind: string; hostile?: boolean }[];
  rawEffects?: readonly { effect?: number; auraName?: number; basePoints?: number }[];
};

/** Mirrored onto a live aura row so a sibling test needs no spell lookup. */
export type AuraStackIdentity = {
  /** SpellFamilyName:SpellFamilyFlags — `related && siblings` in one key. */
  family: string;
  /** Aura names that may not co-exist inside that family. */
  auras: readonly number[];
  /** EffectBasePoints per entry in `auras`, index-aligned, for the stronger-existing check. */
  points: readonly number[];
  /** SPELL_ATTR_PASSIVE — a passive and an active spell always stack. SpellStacking.cpp:381. */
  passive: boolean;
  /** SPELL_ATTR_NO_AURA_CANCEL — expected to be persistent at all times. :377. */
  noCancel: boolean;
};

// Auras the stack switch lets through even for a multirank pair, in order:
// SpellStacking.cpp:171-175, :177-180, :299-305 (positive only), :328-330.
const ALWAYS_STACK_AURAS: ReadonlySet<number> = new Set([3, 13, 20, 21, 79, 89, 96, 138, 140, 162]);

/** SPELL_EFFECT_APPLY_AREA_AURA_PARTY. Cite: SpellEffectDefines.h = 35. */
const EFFECT_APPLY_AREA_AURA_PARTY = 35;

/** SpellDefines.h:41 SPELL_ATTR_PASSIVE. */
const SPELL_ATTR_PASSIVE = 0x40;

// Scope: the stat/resistance rows a buff bar carries. HoT and proc pairs the C++ rule also refuses
// (Rejuvenation/Blessed Recovery, Feedback/Shadowguard) are out — nothing here reverses those rows.
function isStatBuff(sp: StackSpell): boolean {
  const eff = sp.effects ?? [];
  if (eff.length === 0) return false;
  let any = false;
  for (const e of eff) {
    if (e.kind !== 'buff' && e.kind !== 'resist') return false;
    if (e.hostile === true) return false;
    any = true;
  }
  return any;
}

/** The pair identity, or null when this spell is outside the rule (no family, or not a stat buff). */
export function auraStackIdentity(sp: StackSpell | null | undefined): AuraStackIdentity | null {
  if (!sp) return null;
  const fam = sp.spellFamilyName ?? 0;
  const flags = sp.spellFamilyFlags ?? 0;
  // `player` — SpellStacking.cpp:134. A generic-family spell (scroll, food, boss aura) is out.
  if (!fam || !flags) return null;
  if (!isStatBuff(sp)) return null;
  const auras: number[] = [];
  const points: number[] = [];
  for (const r of sp.rawEffects ?? []) {
    const aura = r.auraName ?? 0;
    if (aura <= 0 || ALWAYS_STACK_AURAS.has(aura)) continue;
    // IsSimilarAuraEffect matches Effect AND aura name (SpellMgr.h:1561-1562): an APPLY_AURA (6) row
    // keys on the aura alone, an APPLY_AREA_AURA_PARTY (35) row on both, so two Devotion ranks pair.
    const effect = r.effect ?? 0;
    if (effect !== 6 && effect !== EFFECT_APPLY_AREA_AURA_PARTY) continue;
    const key = effect === 6 ? aura : effect * 1000 + aura;
    // …and on the effect's SIGN (:1563). A negative row is the debuff half (Resurrection
    // Sickness stat percent), and it never matches a buff's row of the same aura.
    const bp = r.basePoints ?? 0;
    if (bp < 0) continue;
    const at = auras.indexOf(key);
    if (at < 0) {
      auras.push(key);
      points.push(bp);
    } else if (bp > points[at]!) {
      points[at] = bp;
    }
  }
  if (auras.length === 0) return null;
  const attr = sp.attributes ?? 0;
  return {
    family: `${fam}:${flags}`,
    auras,
    points,
    passive: (attr & SPELL_ATTR_PASSIVE) !== 0,
    noCancel: (attr & SPELL_ATTR.NO_AURA_CANCEL) !== 0,
  };
}

/** Same family and at least one aura in common — IsSimilarAuraEffect, SpellMgr.h:1558-1563. */
export function stackIdentitiesExclude(
  a: AuraStackIdentity | null | undefined,
  b: AuraStackIdentity | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.family !== b.family) return false;
  // Uncancellable auras are persistent, and a passive never fights an active — so Cat Form
  // (Passive) keeps its AP beside the Predatory Strikes grant. SpellStacking.cpp:377-382.
  if (a.noCancel || b.noCancel) return false;
  if (a.passive !== b.passive) return false;
  return a.auras.some((x) => b.auras.includes(x));
}

/** True when these two spells may not sit on one unit at once (Mark of the Wild / Gift of the Wild). */
export function auraMultirankExclusive(
  a: StackSpell | null | undefined,
  b: StackSpell | null | undefined,
): boolean {
  return stackIdentitiesExclude(auraStackIdentity(a), auraStackIdentity(b));
}

// IsSimilarExistingAuraStronger (SpellMgr.h:1566): a bigger existing amount on a shared aura refuses
// the apply, so Gift of the Wild rank 1 never downgrades Mark of the Wild rank 7.
export function existingStackIsStronger(
  incoming: AuraStackIdentity | null | undefined,
  existing: AuraStackIdentity | null | undefined,
): boolean {
  if (!incoming || !existing) return false;
  if (incoming.family !== existing.family) return false;
  for (let i = 0; i < existing.auras.length; i++) {
    const at = incoming.auras.indexOf(existing.auras[i]!);
    if (at < 0) continue;
    if ((existing.points[i] ?? 0) > (incoming.points[at] ?? 0)) return true;
  }
  return false;
}

// Reconcile a whole aura list: a save written before this rule holds both halves until they expire.
// Keeps the stronger row, ties keep the earlier, and returns the SAME array when nothing changed.
export function dropWeakerMultirankSiblings<T extends { spellId: number }>(
  auras: readonly T[] | undefined,
  spell: (id: number) => StackSpell | null | undefined,
): readonly T[] {
  if (!auras || auras.length < 2) return auras ?? [];
  const idents = auras.map((a) => auraStackIdentity(spell(a.spellId)));
  const drop = new Set<number>();
  for (let i = 0; i < auras.length; i++) {
    if (drop.has(i) || !idents[i]) continue;
    for (let j = i + 1; j < auras.length; j++) {
      if (drop.has(j) || !stackIdentitiesExclude(idents[i], idents[j])) continue;
      // The later row wins only when it is strictly stronger, so order cannot flip a tie.
      if (existingStackIsStronger(idents[i], idents[j])) {
        drop.add(i);
        break;
      }
      drop.add(j);
    }
  }
  return drop.size === 0 ? auras : auras.filter((_, i) => !drop.has(i));
}

/** Spell fields a keep-up presence check reads. Chain rank comes from `chainOf`. */
export type KeepUpSpell = StackSpell & {
  name?: string;
  rank?: number;
};

export type KeepUpLookup = {
  spell: (id: number) => KeepUpSpell | null | undefined;
  chainOf?: (id: number) => { first: number; rank: number } | undefined;
};

function chainRank(
  id: number,
  node: { first: number; rank: number } | undefined,
  sp: KeepUpSpell | null | undefined,
): number {
  if (node) return node.rank;
  if (sp?.rank && sp.rank > 0) return sp.rank;
  return 1;
}

function sameRankLadder(
  ref: number,
  haveId: number,
  inChain: { first: number; rank: number } | undefined,
  haveChain: { first: number; rank: number } | undefined,
): boolean {
  if (inChain) {
    if (haveChain && haveChain.first === inChain.first) return true;
    if (haveId === inChain.first) return true;
  }
  if (haveChain && ref === haveChain.first) return true;
  return false;
}

// Same-or-higher rank, same name, or a stronger stack sibling covers a keep-up. Lower rank upgrades.
// Cite: Unit.cpp:5013-5015; SpellStacking.cpp:135,352.
export function keepUpAlreadyPresent(
  ids: ReadonlySet<number>,
  ref: number,
  lookup: KeepUpLookup,
): boolean {
  const want = ref | 0;
  if (want <= 0) return false;
  if (ids.has(want)) return true;
  const incoming = lookup.spell(want);
  if (!incoming) return false;
  const inChain = lookup.chainOf?.(want);
  const inIdent = auraStackIdentity(incoming);
  const inName = incoming.name;
  const inRank = chainRank(want, inChain, incoming);
  for (const id of ids) {
    if (id === want) return true;
    const have = lookup.spell(id);
    if (!have) continue;
    const haveChain = lookup.chainOf?.(id);
    if (sameRankLadder(want, id, inChain, haveChain)) {
      if (chainRank(id, haveChain, have) >= inRank) return true;
      continue;
    }
    if (inName && have.name === inName) {
      if (chainRank(id, haveChain, have) >= inRank) return true;
      continue;
    }
    const haveIdent = auraStackIdentity(have);
    if (!inIdent || !haveIdent || !stackIdentitiesExclude(inIdent, haveIdent)) continue;
    if (existingStackIsStronger(inIdent, haveIdent)) return true;
    if (!existingStackIsStronger(haveIdent, inIdent)) return true;
  }
  return false;
}
