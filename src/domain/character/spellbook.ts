import type { SpellDef } from '../../data/schema.ts';

export interface SpellBook {
  known: number[];
}

/** Minimal lookup used when resolving LEARN_SPELL stubs → castable taught abilities. */
export type SpellLookup = { spell(id: number): SpellDef | undefined };

export function emptySpellBook(): SpellBook {
  return { known: [] };
}

export function knows(sb: SpellBook, id: number): boolean {
  return sb.known.includes(id);
}

// True when `teaches` points at a triggered payload rather than a LEARN_SPELL target. Following
// one grants the orphan proc instead of the castable ability (KI-254 Charge Stun and friends).
export function isTriggerPayloadTeaches(parent: SpellDef, taughtId: number, ds: SpellLookup): boolean {
  if ((parent.effects ?? []).some((e) => e.kind === 'trigger_spell' && e.spellId === taughtId)) {
    return true;
  }
  const taught = ds.spell(taughtId);
  if (!taught) return false;
  const taughtInert =
    (taught.cost ?? 0) === 0
    && (taught.gcdMs ?? 0) === 0
    && (taught.cooldownMs ?? 0) === 0
    && (taught.castTimeMs ?? 0) === 0
    && !(taught.costPct && taught.costPct > 0)
    && !(taught.rageGenerated && taught.rageGenerated > 0);
  const parentHasEconomy =
    (parent.cost ?? 0) > 0
    || (parent.gcdMs ?? 0) > 0
    || (parent.cooldownMs ?? 0) > 0
    || (parent.castTimeMs ?? 0) > 0
    || (parent.costPct != null && parent.costPct > 0)
    || (parent.rageGenerated != null && parent.rageGenerated > 0);
  return taughtInert && parentHasEconomy;
}

// True when `childId` is a trigger_spell or proc companion of `parent`. The bake sometimes stamps
// `teaches` at those, and that is not a LEARN stub — it must not rewrite the castable parent away.
function isTriggerCompanionOf(parent: SpellDef, childId: number): boolean {
  return (parent.effects ?? []).some(
    (e) =>
      (e.kind === 'trigger_spell' && e.spellId === childId)
      || (e.kind === 'proc_trigger_spell' && e.triggerSpellId === childId),
  );
}

// Resolve a spell id for learning or casting: LEARN_SPELL (36) and LEARN_PET_SPELL (57) stubs keep
// the castable on `teaches`. Multi-slot stubs need learnGrantIds; `teaches` is a single stamp.
export function resolveSpellId(id: number, ds: SpellLookup): number {
  let cur = id;
  for (let n = 0; n < 4; n++) {
    const sp = ds.spell(cur);
    if (!sp) break;
    const stamped = sp.teaches ?? 0;
    const next = stamped > 0 ? stamped : learnTriggerFromRaw(sp);
    if (next == null || next === cur) break;
    if (isTriggerPayloadTeaches(sp, next, ds) || isTriggerCompanionOf(sp, next)) break;
    cur = next;
  }
  return cur;
}

/** SPELL_EFFECT_LEARN_SPELL — SharedDefines / SpellEffectDefines.h. */
export const SPELL_EFFECT_LEARN_SPELL = 36;
// SPELL_EFFECT_LEARN_PET_SPELL. Same EffectTriggerSpell hop as LEARN_SPELL — the stub is not the
// castable rank. Cite: SpellEffects.cpp:3386–3404 EffectLearnPetSpell; pin de8f729.
export const SPELL_EFFECT_LEARN_PET_SPELL = 57;

/** True when this raw slot is a learn stub (player 36 or pet 57). */
function isLearnStubEffect(effect: number): boolean {
  return effect === SPELL_EFFECT_LEARN_SPELL || effect === SPELL_EFFECT_LEARN_PET_SPELL;
}

// Last LEARN_SPELL / LEARN_PET_SPELL EffectTriggerSpell on the row. The bake stamps `teaches` for
// effect 36 only, so pet rank stubs need this hop at runtime: Firebolt 7886 → 3110, no re-bake.
export function learnTriggerFromRaw(sp: SpellDef): number | undefined {
  let taught = 0;
  for (const r of sp.rawEffects ?? []) {
    if (!isLearnStubEffect(Number(r.effect) | 0)) continue;
    const t = Number(r.triggerSpell) | 0;
    if (t > 0) taught = t;
  }
  return taught > 0 ? taught : undefined;
}

// Stamp `teaches` from a LEARN_PET_SPELL (57) trigger when the bake left it empty. Effect 36
// already has it from spell.chain. Cite: SpellEffects.cpp:3386–3404; spell-chain-port.mjs.
export function withPetLearnTeachesIfEmpty(spell: SpellDef): SpellDef {
  if ((spell.teaches ?? 0) > 0) return spell;
  const taught = learnTriggerFromRaw(spell);
  if (!taught) return spell;
  return { ...spell, teaches: taught };
}

// Every castable spell id a LEARN_SPELL / LEARN_PET_SPELL row grants. Multi-slot stubs teach
// several (Path of Defense 8121 → 71 + 7386 + 355), so read rawEffects 36/57, not `teaches`.
export function learnGrantIds(id: number, ds: SpellLookup): number[] {
  const sp = ds.spell(id);
  if (!sp) return [id];
  const triggers = (sp.rawEffects ?? [])
    .filter((r) => isLearnStubEffect(Number(r.effect) | 0) && (Number(r.triggerSpell) | 0) > 0)
    .map((r) => Number(r.triggerSpell) | 0);
  if (triggers.length > 0) {
    const out: number[] = [];
    for (const t of triggers) {
      // Nested LEARN stubs on a trigger are rare; one resolve hop. Does not follow
      // trigger_spell companions (Charge Stun) — those are not effect-36 targets.
      const g = resolveSpellId(t, ds);
      if (!out.includes(g)) out.push(g);
    }
    return out;
  }
  // No raw LEARN slots: single `teaches` hop (fixtures / older rows without rawEffects).
  return [resolveSpellId(id, ds)];
}

export function learn(sb: SpellBook, id: number): SpellBook {
  if (sb.known.includes(id)) return sb;
  return { known: [...sb.known, id] };
}

/** Drop a known spell id (profession specialization unlearn, rank migration, etc.). */
export function forget(sb: SpellBook, id: number): SpellBook {
  if (!sb.known.includes(id)) return sb;
  return { known: sb.known.filter((x) => x !== id) };
}

// Learn `id`, resolving LEARN stubs to every castable taught ability (multi-slot aware). Cite:
// SpellEffects.cpp:2445–2465; learnGrantIds.
export function learnResolved(sb: SpellBook, id: number, ds: SpellLookup): SpellBook {
  let next = sb;
  for (const g of learnGrantIds(id, ds)) next = learn(next, g);
  return next;
}

// Replace any LEARN stub ids in the spellbook with their taught castables, expanding multi-slot
// stubs. Idempotent. Also returns the stub→taught pairs so callers rewrite bars and rotations.
export function migrateLearnStubs(
  sb: SpellBook,
  ds: SpellLookup,
): { spellbook: SpellBook; replacements: Array<{ from: number; to: number }> } {
  const replacements: Array<{ from: number; to: number }> = [];
  const next: number[] = [];
  const seen = new Set<number>();
  for (const id of sb.known) {
    const grants = learnGrantIds(id, ds);
    if (grants.length === 1 && grants[0] === id) {
      if (!seen.has(id)) {
        seen.add(id);
        next.push(id);
      }
      continue;
    }
    for (const g of grants) {
      if (g !== id) replacements.push({ from: id, to: g });
      if (seen.has(g)) continue;
      seen.add(g);
      next.push(g);
    }
  }
  if (!replacements.length) return { spellbook: sb, replacements };
  return { spellbook: { known: next }, replacements };
}
