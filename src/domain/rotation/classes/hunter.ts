// PURE: no DOM/RNG/Date. Hunter rotation post-pass + kit policy.

import type { DataStore } from '../../../data/dataStore.ts';
import type { SpellDef } from '../../../data/schema.ts';
import { inferRole } from '../../../engine/combat.ts';
import { cond, isFeignDeathSpell } from '../classify.ts';
import type { RotationRule } from '../types.ts';
import { rebuildPhaseUsed, type ClassRotationHooks, type FinalizeContext } from './hooks.ts';

function isAutoShotOrShootSpell(def: SpellDef | undefined): boolean {
  if (!def) return false;
  if (/^auto shot$/i.test(def.name)) return true;
  if (/^shoot$/i.test(def.name)) return true;
  // Paid shoot-role shots (Multi/Aimed) are abilities, not the auto-repeat toggle.
  // Cite: predicates.isRangedAutoRepeatToggle; KI-745.
  if ((def.cost ?? 0) > 0 || (def.castTimeMs ?? 0) > 0 || (def.gcdMs ?? 0) > 0) return false;
  const role = def.role ?? inferRole(def);
  return role === 'shoot';
}

/** Melee next-swing / short-range strike that should not outrank Auto Shot when unguarded. */
function isUnconditionalHunterMeleeStrike(def: SpellDef | undefined, rule: RotationRule): boolean {
  if (!def) return false;
  // A melee strike gated only on `inMelee` range still sorts after Auto Shot as a
  // situational next-swing — the inMelee gate is not a "special" trigger.
  const nonMeleeGates = rule.conditions.filter((c) => c.metric !== 'inMelee');
  if (nonMeleeGates.length > 0) return false;
  if (def.onNextSwing) return true;
  const role = def.role ?? inferRole(def);
  // Raptor Strike and similar: strike role, melee range band.
  return role === 'strike' && (def.rangeMax ?? 0) > 0 && (def.rangeMax ?? 0) <= 5;
}

// Hunter combat must keep Auto Shot as the ranged primary, never leaving unconditional next-swing
// Raptor Strike as the sole filler. Order: conditioned specials, then shoot, then melee.
export function finalizeHunterRangedPrimary(
  combat: RotationRule[],
  known: readonly SpellDef[],
  knownById: Map<number, SpellDef>,
  ds: DataStore,
): RotationRule[] {
  const autoDef =
    known.find((s) => /^auto shot$/i.test(s.name))
    ?? known.find((s) => isAutoShotOrShootSpell(s));

  let rules = combat.slice();
  const hasShoot = rules.some(
    (r) => r.action.kind === 'spell' && isAutoShotOrShootSpell(
      knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId),
    ),
  );
  if (autoDef && !hasShoot) {
    rules.push({
      id: 'auto-shot',
      action: { kind: 'spell', spellId: autoDef.id },
      conditions: [],
      enabled: true,
    });
  }

  const specials: RotationRule[] = [];
  const instantShots: RotationRule[] = [];
  const castTimeShots: RotationRule[] = [];
  const shoots: RotationRule[] = [];
  const nextSwings: RotationRule[] = [];
  for (const r of rules) {
    if (r.action.kind === 'spell') {
      const def = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
      if (isAutoShotOrShootSpell(def)) {
        shoots.push(r);
        continue;
      }
      if (isUnconditionalHunterMeleeStrike(def, r)) {
        nextSwings.push(r);
        continue;
      }
      // Aimed Shot is a 3.5 s stand-still; ahead of Arcane Shot it roots the hunter while the boss
      // walks into the dead zone. C++ fires Arcane first. Cite: PlayerbotHunterAI.cpp:286, :306.
      const nm = (def?.name ?? '').toLowerCase();
      if (nm === 'aimed shot' || ((def?.castTimeMs ?? 0) > 0 && /shot$/.test(nm) && nm !== 'auto shot')) {
        castTimeShots.push(r);
        continue;
      }
      if (nm === 'arcane shot' || nm === 'multi-shot' || nm === 'multishot') {
        instantShots.push(r);
        continue;
      }
    }
    specials.push(r);
  }
  // Dedupe shoot ids (band + fallback can both list Auto Shot after per-phase merge).
  const seenShoot = new Set<number>();
  const uniqueShoots: RotationRule[] = [];
  for (const r of shoots) {
    if (r.action.kind !== 'spell') continue;
    if (seenShoot.has(r.action.spellId)) continue;
    seenShoot.add(r.action.spellId);
    uniqueShoots.push(r);
  }
  return [...specials, ...instantShots, ...castTimeShots, ...uniqueShoots, ...nextSwings];
}

/** Call Pet before Revive Pet — `pet.alive==0` is true for a missing pet, so Revive first
 * is picked, the cast fails, and Aspect of the Hawk never fires. */
export function orderHunterPetBuffs(ctx: FinalizeContext): void {
  const call: RotationRule[] = [];
  const revive: RotationRule[] = [];
  const rest: RotationRule[] = [];
  for (const r of ctx.phases.buffs) {
    if (r.action.kind !== 'spell') { rest.push(r); continue; }
    const def = ctx.knownById.get(r.action.spellId) ?? ctx.ds.spell(r.action.spellId);
    const n = (def?.name ?? '').toLowerCase();
    if (n === 'call pet') call.push(r);
    else if (n === 'revive pet') revive.push(r);
    else rest.push(r);
  }
  if (!call.length && !revive.length) return;
  ctx.phases.buffs = [...call, ...revive, ...rest];
  rebuildPhaseUsed(ctx, 'buffs');
}

// Combat-head Feign Death: any enemy on the hunter. Idempotent. No pet term — see the same gate in
// rotation/build.ts (PlayerbotHunterAI.cpp:246).
export function ensureHunterFeignDeath(ctx: FinalizeContext): void {
  const fd = ctx.known.find((s) => isFeignDeathSpell(s));
  if (!fd) return;
  if (ctx.phases.combat.some((r) => r.action.kind === 'spell' && r.action.spellId === fd.id)) return;
  ctx.phases.combat.unshift({
    id: ctx.nextFallbackId(),
    action: { kind: 'spell', spellId: fd.id },
    conditions: [
      cond('self', 'hasAggro', '==', 1),
    ],
    enabled: true,
  });
  rebuildPhaseUsed(ctx, 'combat');
}

export const hunterHooks: ClassRotationHooks = {
  afterSuggestion(ctx) {
    orderHunterPetBuffs(ctx);
    ensureHunterFeignDeath(ctx);
  },
  afterFallback(ctx) {
    orderHunterPetBuffs(ctx);
    ensureHunterFeignDeath(ctx);
    // Hunter: Auto Shot is the ranged primary; unconditional on-next-swing Raptor must not
    // sit alone ahead of it (KI-389 starter Raptor-only combat).
    ctx.phases.combat = finalizeHunterRangedPrimary(
      ctx.phases.combat,
      ctx.known,
      ctx.knownById,
      ctx.ds,
    );
  },
};
