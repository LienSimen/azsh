// PURE: no DOM/RNG/Date. Paladin rotation post-pass + kit policy.

import type { DataStore } from '../../../data/dataStore.ts';
import type { SpellDef } from '../../../data/schema.ts';
import { resolveCombatSpell } from '../../../engine/spells/interpreter/item-triggers.ts';
import type { RotationRule } from '../types.ts';
import {
  cond,
  isJudgementSpell,
  isSealSpell,
  sealKindOf,
  sealKindPriority,
} from '../classify.ts';
import { auraHolderIsCastTarget } from '../../../engine/combat/healTargets.ts';
import type { AllyFilter, Condition, RotationPhase } from '../types.ts';
import type { ClassRotationHooks, FinalizeContext } from './hooks.ts';
import {
  blessingFamilyOf,
  paladinAuraOf,
  planPaladinAuras,
  planPaladinBlessings,
  type PaladinProvider,
} from '../paladinBuffs.ts';
import { rebuildPhaseUsed } from './hooks.ts';
import { gateSupportDamageRows } from './supportSpec.ts';

// Bake seals: empty effects or only proc_trigger (SoC) — resolve before sealKindOf.
function resolvedSealDef(def: SpellDef): SpellDef {
  return resolveCombatSpell(def);
}

/** One seal + Judgement gate; `spec` picks kind (Ret→Command, Holy/Prot→SoR). */
export function finalizePaladinSealJudge(
  combat: RotationRule[],
  knownById: Map<number, SpellDef>,
  ds?: DataStore,
  spec?: string | null,
): RotationRule[] {
  const defOf = (id: number): SpellDef | undefined => knownById.get(id) ?? ds?.spell(id);
  const sealRules: { rule: RotationRule; def: SpellDef }[] = [];
  for (const r of combat) {
    if (r.action.kind !== 'spell') continue;
    const def = defOf(r.action.spellId);
    if (def && isSealSpell(def)) sealRules.push({ rule: r, def });
  }
  if (!sealRules.length) return combat;

  const pri = sealKindPriority(spec);
  // Kind first (resolved effects); rank only ties same kind (highest rank wins).
  const best = [...sealRules].sort((a, b) => {
    const kindA = sealKindOf(resolvedSealDef(a.def));
    const kindB = sealKindOf(resolvedSealDef(b.def));
    return (pri[kindB] ?? -1) - (pri[kindA] ?? -1)
      || (b.def.rank ?? 0) - (a.def.rank ?? 0);
  })[0]!;
  const bestId = best.def.id;
  const dropSealIds = new Set(
    sealRules.filter((s) => s.def.id !== bestId).map((s) => s.def.id),
  );

  const out: RotationRule[] = [];
  let keptBestSeal = false;
  for (const r of combat) {
    if (r.action.kind === 'spell' && dropSealIds.has(r.action.spellId)) continue;
    if (r.action.kind === 'spell' && r.action.spellId === bestId) {
      if (keptBestSeal) continue; // one seal upkeep rule only
      keptBestSeal = true;
      out.push({
        ...r,
        conditions: [cond('self', 'buffPresent', '==', 0, bestId)],
      });
      continue;
    }
    if (r.action.kind === 'spell') {
      const def = defOf(r.action.spellId);
      // isJudgementSpell needs resolved effects; bake Judgement often has empty effects[].
      const resolved = def ? (def.effects?.length ? def : resolveCombatSpell(def)) : undefined;
      if (resolved && def && (isJudgementSpell(resolved) || /^judgement$/i.test(def.name))) {
        out.push({
          ...r,
          conditions: [cond('self', 'buffPresent', '==', 1, bestId)],
        });
        continue;
      }
    }
    out.push(r);
  }
  return out;
}

function firstSealId(
  rules: RotationRule[],
  knownById: Map<number, SpellDef>,
  ds: DataStore,
): number | null {
  for (const r of rules) {
    if (r.action.kind !== 'spell') continue;
    const def = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
    if (def && isSealSpell(def)) return r.action.spellId;
  }
  return null;
}

/** Same preferred seal on pull + combat (opener must match keep-up). */
function finalizePaladinPhases(ctx: FinalizeContext): void {
  ctx.phases.pull = finalizePaladinSealJudge(ctx.phases.pull, ctx.knownById, ctx.ds, ctx.spec);
  ctx.phases.combat = finalizePaladinSealJudge(ctx.phases.combat, ctx.knownById, ctx.ds, ctx.spec);

  const combatSeal = firstSealId(ctx.phases.combat, ctx.knownById, ctx.ds);
  const pullSeal = firstSealId(ctx.phases.pull, ctx.knownById, ctx.ds);
  if (combatSeal != null && pullSeal != null && combatSeal !== pullSeal) {
    // Asymmetric pools (or leftover order): force pull onto combat's seal id.
    let rewritten = false;
    ctx.phases.pull = ctx.phases.pull.flatMap((r) => {
      if (r.action.kind !== 'spell') return [r];
      if (r.action.spellId === pullSeal && !rewritten) {
        rewritten = true;
        return [{
          ...r,
          action: { kind: 'spell' as const, spellId: combatSeal },
          conditions: [cond('self', 'buffPresent', '==', 0, combatSeal)],
        }];
      }
      const def = ctx.knownById.get(r.action.spellId) ?? ctx.ds.spell(r.action.spellId);
      if (def && isSealSpell(def)) return [];
      return [r];
    });
  }

  rebuildPhaseUsed(ctx, 'pull');
  rebuildPhaseUsed(ctx, 'combat');
}

function isHammerOfJustice(ctx: FinalizeContext, spellId: number): boolean {
  const def = ctx.knownById.get(spellId) ?? ctx.ds.spell(spellId);
  return /^hammer of justice$/i.test(def?.name ?? '');
}

// A Hammer of Justice boss keep-up never fires: a stun-immune boss reads as already debuffed. Hold
// a second mob instead. ONLY that gate is repaired — this used to overwrite every HoJ row.
function finalizePaladinHoJ(ctx: FinalizeContext): void {
  const addCc = [
    cond('self', 'enemyCount', '>=', 2),
  ];
  const isDeadKeepUp = (r: { conditions: readonly { subject?: string; metric: string }[] }): boolean =>
    r.conditions.some(
      (c) => c.subject === 'target' && (c.metric === 'debuffPresent' || c.metric === 'debuffStacks'),
    );
  ctx.phases.pull = ctx.phases.pull.filter(
    (r) => !(r.action.kind === 'spell' && isHammerOfJustice(ctx, r.action.spellId) && isDeadKeepUp(r)),
  );
  ctx.phases.combat = ctx.phases.combat.map((r) => {
    if (r.action.kind !== 'spell' || !isHammerOfJustice(ctx, r.action.spellId)) return r;
    if (!isDeadKeepUp(r)) return r;
    return {
      ...r,
      action: { ...r.action, target: 'other' as const },
      conditions: addCc,
    };
  });
  rebuildPhaseUsed(ctx, 'pull');
  rebuildPhaseUsed(ctx, 'combat');
}

// One Blessing row and one Aura row, always. The shipped packs left a Prot paladin with no blessing
// at all and gave every spec the same aura, so a second paladin in the group added nothing. Which
// aura and which blessing family is CheckAuras / BuffHelper's call; who else is in the party is the
// pre-pull plan's (bots/paladinPrePull.ts), which restamps these rows before a pull.
function finalizePaladinBlessingAndAura(ctx: FinalizeContext): void {
  // `Character` carries no group role; the build's own spec string is what names it, the same way
  // sealKindPriority reads it. Cite: classify.ts:69 primarySpec buckets.
  const role = /prot/i.test(ctx.spec) ? 'tank' : /holy/i.test(ctx.spec) ? 'healer' : 'dps';
  const provider: PaladinProvider = {
    key: 'self',
    name: ctx.char.name,
    level: ctx.char.level,
    known: ctx.sb.known,
    spec: ctx.spec,
    role,
  };
  const has = (pred: (sp: SpellDef | undefined) => boolean): boolean =>
    ctx.phases.buffs.some(
      (r) => r.action.kind === 'spell'
        && pred(ctx.knownById.get(r.action.spellId) ?? ctx.ds.spell(r.action.spellId)),
    );
  if (!has((sp) => blessingFamilyOf(sp) != null)) {
    const own = planPaladinBlessings(
      [provider],
      [{ key: 'self', cls: ctx.char.cls, role }],
      ctx.ds,
      { preferGreater: false },
    ).blessings[0];
    if (own) {
      ctx.phases.buffs.push({
        id: ctx.nextFallbackId(),
        action: { kind: 'spell', spellId: own.spellId },
        conditions: [cond('self', 'buffPresent', '==', 0, own.spellId)],
        enabled: true,
      });
      ctx.usedSpellsByPhase.buffs.add(own.spellId);
    }
  }
  // Only ADD a missing aura row. Which aura beats which is CheckAuras' call and its first clause
  // reads "is there a tank in the group" (:414-432) — a fact a single-unit rotation build cannot
  // see. paladinPrePull.restampPaladinRotation makes that call once the party is known.
  if (!has((sp) => paladinAuraOf(sp) != null)) {
    const aura = planPaladinAuras([provider], ctx.ds)[0];
    if (aura) {
      ctx.phases.buffs.push({
        id: ctx.nextFallbackId(),
        action: { kind: 'spell', spellId: aura.spellId },
        conditions: [cond('self', 'buffPresent', '==', 0, aura.spellId)],
        enabled: true,
      });
      ctx.usedSpellsByPhase.buffs.add(aura.spellId);
    }
  }
  rebuildPhaseUsed(ctx, 'buffs');
}

// Left behind by every MECHANIC_INVULNERABILITY cast, and it locks out the next one.
// Cite: Spell.cpp:3144-3145 AddPrecastSpell(25771).
const FORBEARANCE_ID = 25771;

// The one paladin invulnerability aimed at somebody ELSE. Divine Shield / Divine Protection carry
// the same mechanic on the CASTER, so the target column is what separates them.
function isProtectionBlessing(sp: SpellDef | undefined): boolean {
  if (!sp || sp.mechanic !== 'invulnerability') return false;
  if ((sp.id | 0) === FORBEARANCE_ID) return false;
  return auraHolderIsCastTarget(sp);
}

const allyCond = (
  metric: 'healthPct' | 'buffPresent',
  op: '<' | '==',
  value: number,
  ally: AllyFilter,
  ref?: number,
): Condition => ({ subject: 'ally', metric, op, value, ally, ...(ref != null ? { ref } : {}) });

// A tank is never a band: it holds threat on purpose, and BoP drops it.
// Cite: PlayerbotPaladinAI.cpp:305-313 (hp < 25 && JOB_HEAL) || (hp < 15 && !JOB_TANK).
const BOP_BANDS: readonly { filter: AllyFilter; hpPct: number }[] = [
  { filter: { role: 'healer' }, hpPct: 25 },
  { filter: { notRole: 'tank' }, hpPct: 15 },
];

// One row per band: `allyFilterOfRule` takes the FIRST ally filter, so a shared row would aim both
// bands at the healer bar. Cite: evaluate.ts allyFilterOfRule.
function finalizePaladinProtection(ctx: FinalizeContext): void {
  // PvP too: PaladinAI.cpp:268-273 PVP→PVE FindTargetAndHeal, HealPlayer :304-313.
  const bop = ctx.known
    .filter((sp) => isProtectionBlessing(sp))
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0) || b.id - a.id)[0];
  if (!bop) return;
  const phase: RotationPhase = 'combat';
  // Skip only an already-aimed ally row. Self-BoP (every pvp holy band) is not that.
  if (ctx.phases[phase].some((r) => {
    if (r.action.kind !== 'spell') return false;
    if (!isProtectionBlessing(ctx.knownById.get(r.action.spellId) ?? ctx.ds.spell(r.action.spellId))) {
      return false;
    }
    return r.conditions.some((c) => c.subject === 'ally');
  })) return;
  const rows: RotationRule[] = BOP_BANDS.map(({ filter, hpPct }) => ({
    id: ctx.nextFallbackId(),
    action: { kind: 'spell', spellId: bop.id },
    conditions: [
      allyCond('healthPct', '<', hpPct, filter),
      // Through Forbearance the cast is wasted; on a body already holding BoP it is a re-cast.
      allyCond('buffPresent', '==', 0, filter, FORBEARANCE_ID),
      allyCond('buffPresent', '==', 0, filter, bop.id),
    ],
    enabled: true,
  }));
  // Ahead of the damage tail: a 15% non-tank outranks a Judgement.
  ctx.phases[phase].unshift(...rows);
  rebuildPhaseUsed(ctx, phase);
}

export const paladinHooks: ClassRotationHooks = {
  afterSuggestion(ctx) {
    finalizePaladinPhases(ctx);
    finalizePaladinHoJ(ctx);
    if (/^holy$/i.test(ctx.spec)) gateSupportDamageRows(ctx);
  },
  afterFallback(ctx) {
    // Re-finalize after fallback so role-bucket cannot re-introduce a rival seal (KI-217).
    finalizePaladinPhases(ctx);
    finalizePaladinHoJ(ctx);
    finalizePaladinBlessingAndAura(ctx);
    finalizePaladinProtection(ctx);
    // Seal and Judgement cost the Holy paladin nothing; Exorcism / Holy Wrath / Consecration do.
    if (/^holy$/i.test(ctx.spec)) gateSupportDamageRows(ctx);
  },
};
