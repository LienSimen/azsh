// Which auras a caster holds on only ONE target: 1.12 has no AttributesEx5, so the flag is derived
// from Mechanic + SpellFamily. Cite: SpellMgr.h:2230, :2261; Unit.cpp:4774-4830.

/** SpellTarget ids IsAreaEffectTarget accepts. Cite: SpellMgr.h:860; SpellTargetDefines.h:22-88. */
const AREA_EFFECT_TARGETS: ReadonlySet<number> = new Set([
  7, 8, 15, 16, 20, 24, 28, 30, 31, 33, 34, 37, 52, 56, 61,
]);

/** SPELL_AURA_MOD_STALKED. Cite: SpellAuraDefines.h:203. */
const AURA_MOD_STALKED = 68;
/** SPELLFAMILY_HUNTER. Cite: DBCEnums.h:168. */
const SPELLFAMILY_HUNTER = 9;

// MECHANIC_FEAR / MECHANIC_TURN are tracked whoever casts them.
const ALWAYS_TRACKED: ReadonlySet<string> = new Set(['fear', 'turn']);
// The rest only on player rows — a class spell is the one that carries both a family and its flags.
const PLAYER_TRACKED: ReadonlySet<string> = new Set([
  'root', 'sleep', 'knockout', 'polymorph', 'banish', 'shackle',
]);

/** As much of a spell as the area read needs — the two implicit-target columns the C++ walks. */
export interface AreaEffectSpell {
  aoe?: boolean;
  rawEffects?: readonly { targetA?: number; targetB?: number }[];
}

/** As much of a spell as the rule reads. */
export interface TrackedAuraSpell extends AreaEffectSpell {
  id: number;
  mechanic?: string;
  spellFamilyName?: number;
  spellFamilyFlags?: number;
  rawEffects?: readonly { targetA?: number; targetB?: number; auraName?: number }[];
}

const hasStalkedAura = (sp: TrackedAuraSpell): boolean =>
  (sp.rawEffects ?? []).some((e) => (e.auraName | 0) === AURA_MOD_STALKED);

/** Cite: SpellMgr.h:886 IsAreaOfEffectSpell. Baked `aoe` stands in only when rawEffects are absent. */
export function isAreaOfEffectSpell(sp: AreaEffectSpell | null | undefined): boolean {
  if (!sp) return false;
  const raw = sp.rawEffects;
  if (!raw || raw.length === 0) return sp.aoe === true;
  return raw.some(
    (e) => AREA_EFFECT_TARGETS.has(e.targetA | 0) || AREA_EFFECT_TARGETS.has(e.targetB | 0),
  );
}

/** Cite: SpellMgr.h:2230. 71 baked rows / 27 names; Banish is out, its SpellFamilyFlags is 0. */
export function isSingleTargetSpell(sp: TrackedAuraSpell | null | undefined): boolean {
  if (!sp) return false;
  const m = sp.mechanic;
  // Cheap gate before the effect scan: only these rows can ever be tracked.
  const candidate = (m != null && (ALWAYS_TRACKED.has(m) || PLAYER_TRACKED.has(m)))
    || sp.spellFamilyName === SPELLFAMILY_HUNTER;
  if (!candidate) return false;
  if (isAreaOfEffectSpell(sp)) return false;
  if (m != null && ALWAYS_TRACKED.has(m)) return true;
  if (m != null && PLAYER_TRACKED.has(m) && sp.spellFamilyName && sp.spellFamilyFlags) return true;
  return sp.spellFamilyName === SPELLFAMILY_HUNTER && hasStalkedAura(sp);
}

// SpellFamilyFlags is 64-bit in the DB and Polymorph's is 0xC1000000, so `&` would sign-flip it.
const shareFamilyFlagBit = (a: number, b: number): boolean =>
  Number.isSafeInteger(a) && Number.isSafeInteger(b) && (BigInt(a) & BigInt(b)) !== 0n;

/** Two tracked spells share a seat when same row, same rank ladder, or same family spinoff (every
 * Polymorph flavour). Cite: SpellMgr.h:2261. */
export function isSingleTargetSpellPair(
  a: TrackedAuraSpell | null | undefined,
  b: TrackedAuraSpell | null | undefined,
  sameRankChain = false,
): boolean {
  if (!a || !b) return false;
  if (!isSingleTargetSpell(a) || !isSingleTargetSpell(b)) return false;
  if (a === b || a.id === b.id) return true;
  if (sameRankChain) return true;
  if (!a.spellFamilyName || !b.spellFamilyName) return false;
  if (!a.spellFamilyFlags || !b.spellFamilyFlags) return false;
  return a.spellFamilyName === b.spellFamilyName
    && shareFamilyFlagBit(a.spellFamilyFlags, b.spellFamilyFlags);
}
