// Bindings the peeled late-effect cases close over. Pure wiring, not logic: the split-out cases still
// need the context hub methods and assembler locals they used to capture lexically. All late-bound.
import type { CombatContext } from './context.ts';
import type { installApplySpellDeps } from './applySpell.ts';
import type { SpellDef } from '../../data/schema.ts';
import type { Fighter } from './types.ts';
import type { Side, TotemSide } from '../core/events.ts';
import { applyBuffMod } from './fighterFactory.ts';
import { runCastSummons } from './summonCast.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Extra bindings that are locals of `installApplySpell` rather than ctx/deps members. */
export interface LateBagExtras {
  push: (e: any) => void;
}

// Fill the bag in place with the late-case bindings: the bag those cases read, the combat context
// whose hub methods resolve per call, and the same deps installApplySpell received.
export function bindLateEffectBag(
  L: Record<string, any>,
  ctx: CombatContext,
  deps: installApplySpellDeps,
  extras: LateBagExtras,
): void {
  const hub = (name: string) => (...args: any[]) => ((ctx as any)[name] as Function)(...args);
  Object.assign(L, {
    get t() { return ctx.t; },
    push: extras.push,
    effects: ctx.effects,
    effectsOn: ctx.effectsOn,
    effectsFrom: ctx.effectsFrom,
    setEffectSource: ctx.setEffectSource,
    bumpEffectsVersion: ctx.bumpEffectsVersion,
    rng: ctx.rng,
    tickMs: ctx.tickMs,
    cfg: ctx.cfg,
    player: ctx.player,
    allyBlock: ctx.allyBlock,
    pet: ctx.pet,
    totems: ctx.totems,
    enemyCastBySide: ctx.enemyCastBySide,
    livingFriendlies: ctx.livingFriendlies,
    friendlyPoolOf: ctx.friendlyPoolOf,
    lowestHpFriendlyOf: ctx.lowestHpFriendlyOf,
    livingHostilesFor: ctx.livingHostilesFor,
    livingEnemies: ctx.livingEnemies,
    livingAllies: ctx.livingAllies,
    bySide: ctx.bySide,
    // The null-returning twin of bySide (which misses to the primary or the player). E1.1.
    sideFighter: (side: Side) => ctx.sideFighter?.(side) ?? null,
    fightersOrder: ctx.fightersOrder,
    // Deferred like the slot it replaced, since the bag is built before sessionPools installs — but
    // NOT optional-chained: a missing install must throw rather than drop a totem in silence.
    rosterSetTotem: (side: TotemSide, f: Fighter) => ctx.rosterSetTotem!(side, f),
    factionOf: ctx.factionOf,
    factionOfFighter: ctx.factionOfFighter,
    isCharmed: ctx.isCharmed,
    distanceBetween: ctx.distanceBetween,
    // Geometry + class-A area-aura plumbing: a totem is dropped at the owner's feet
    // and its friendly radius is maintained per tick. Cite: RANGE-ARCHITECTURE §4.9.
    posOf: ctx.posOf,
    setPos: ctx.setPos,
    /** Knock-back / leap landing: the unit is not where its walk was planned from. */
    displaced: (side: string) => ctx.clearMotionCaches?.(side),
    touchEffect: (e: import('./types.ts').ActiveEffect) => ctx.touchEffect(e),
    touchPeriodicDue: (at: number) => ctx.touchPeriodicDue(at),
    touchGroundPool: (p: import('../game/dynamicObject.ts').GroundPool) => ctx.touchGroundPool(p),
    // Facing proxy for leaps when no foe: held WASD / stick vector.
    moveIntentOf: (side: string) =>
      (ctx as { unitMoveIntents?: Map<string, { x: number; y: number }> }).unitMoveIntents?.get(side) ?? null,
    registerAreaAuraSource: hub('registerAreaAuraSource'),
    reverseActiveEffect: hub('reverseActiveEffect'),
    threatOf: ctx.threatOf.bind ? ctx.threatOf.bind(ctx) : ctx.threatOf,
    dealDamage: hub('dealDamage'),
    applySpell: hub('applySpell'),
    /** SPELL_EFFECT_SUMMON* → bodies on the caster's side, deduped per cast. */
    runCastSummons: (src: Fighter, spell: SpellDef) => runCastSummons(ctx, src, spell),
    noteTotemOwner: (...args: Parameters<NonNullable<CombatContext['noteTotemOwner']>>) =>
      (ctx.noteTotemOwner as NonNullable<CombatContext['noteTotemOwner']>)(...args),
    consumePendingSpellMod: (...args: Parameters<NonNullable<CombatContext['consumePendingSpellMod']>>) =>
      (ctx.consumePendingSpellMod as NonNullable<CombatContext['consumePendingSpellMod']>)(...args),
    applyProc: hub('applyProc'),
    triggerProcs: hub('triggerProcs'),
    rollGearProcs: hub('rollGearProcs'),
    fireDamageShields: hub('fireDamageShields'),
    applyFlatThreat: hub('applyFlatThreat'),
    applyHealThreat: hub('applyHealThreat'),
    applySpellThreatBonus: hub('applySpellThreatBonus'),
    applyDamageThreat: hub('applyDamageThreat'),
    notifyEventAiHealedBy: hub('notifyEventAiHealedBy'),
    grantImmunityAura: hub('grantImmunityAura'),
    consumeChargedImmunityOnMechanicBlock: (...args: any[]) =>
      ctx.consumeChargedImmunityOnMechanicBlock?.(args[0], args[1]),
    resolveDispelTarget: hub('resolveDispelTarget'),
    dispellableAurasOn: hub('dispellableAurasOn'),
    stripAuraOnDispel: hub('stripAuraOnDispel'),
    dispelTypeOfSpell: hub('dispelTypeOfSpell'),
    get dispelClaim() { return ctx.dispelClaim; },
    get spellOf() { return ctx.spellOf; },
    reflectChanceFor: hub('reflectChanceFor'),
    powerOfType: hub('powerOfType'),
    maxPowerOfType: hub('maxPowerOfType'),
    setPowerOfType: hub('setPowerOfType'),
    dead: deps.dead,
    spend: deps.spend,
    gainRage: deps.gainRage,
    addComboPoints: deps.addComboPoints,
    clearComboPoints: deps.clearComboPoints,
    comboOn: deps.comboOn,
    scaleDurationByCp: deps.scaleDurationByCp,
    spellCost: deps.spellCost,
    canAffordSpell: deps.canAffordSpell,
    leaveForm: deps.leaveForm,
    enterForm: deps.enterForm,
    applyStealth: deps.applyStealth,
    breakStealth: deps.breakStealth,
    maybeBreakStealthOn: deps.maybeBreakStealthOn,
    behindOk: deps.behindOk,
    foeOf: deps.foeOf,
    ensurePlayerFocus: deps.ensurePlayerFocus,
    lowestHpFriendly: deps.lowestHpFriendly,
    isControlled: deps.isControlled,
    isControlledHard: deps.isControlledHard,
    isWeaponAction: deps.isWeaponAction,
    isBreaker: deps.isBreaker,
    spellTemplateImmune: deps.spellTemplateImmune,
    ccImmune: deps.ccImmune,
    applyDr: deps.applyDr,
    applyControl: deps.applyControl,
    breakControl: deps.breakControl,
    onDamaged: deps.onDamaged,
    // Twin HealedBy. Late-bound so install order vs eventAi does not matter.
    // Cite: boss_twinemperors.cpp:113-125.
    onHealed: (f: Parameters<NonNullable<CombatContext['onHealed']>>[0], amount: number, fromSpellId?: number) =>
      ctx.onHealed?.(f, amount, fromSpellId),
    rollHeal: deps.rollHeal,
    unsummonTotem: deps.unsummonTotem,
    sealRighteousnessSwing: deps.sealRighteousnessSwing,
    checkDeaths: deps.checkDeaths,
    finalize: deps.finalize,
    applyBuffMod,
  });
}
