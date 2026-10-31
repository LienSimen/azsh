// RemoveAurasWithInterruptFlags — drop every holder whose spell carries one of the bits. Three had a
// consumer already; hostile action, moving and item use did not. Standing and looting have no state.

import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import { dropFeignDeath } from './combatFlag.ts';
import { DISPEL_TYPE } from '../../domain/spells/dispel.ts';

export { AURA_INTERRUPT };

export interface InterruptAurasDeps {
  /** powerForm's stealth break, which already reads the unit's own `stealthBreakFlags`. */
  maybeBreakStealthOn: (f: Fighter, flag: number, reason: string) => void;
}

export function installInterruptAuras(ctx: CombatContext, deps: InterruptAurasDeps): void {
  const aifOf = (spellId: number): number => {
    const lookup = ctx.auraInterruptFlagsOf;
    return lookup ? (lookup(spellId | 0) | 0) : 0;
  };

  // Every live holder whose spell carries any bit in the mask is removed. Stealth routes through the
  // existing break so the form, chip and log line stay in one place; Feign Death has its own pose.
  const removeAurasWithInterruptFlags = (
    f: Fighter,
    flags: number,
    reason: string,
    // Cast start owns both: it runs the ALLOW_WHILE_STEALTHED-guarded break itself, and
    // RemoveAurasOnCast never drops the caster's own holder. Cite: Unit.cpp:5247-5251.
    opts?: { skipStealth?: boolean; exceptSpellId?: number; skipInvisibility?: boolean },
  ): void => {
    const mask = flags | 0;
    if (!mask) return;
    if (f.stealthed && !opts?.skipStealth) deps.maybeBreakStealthOn(f, mask, reason);
    const feignId = f.feignSpellId | 0;
    if (f.feigningUntil > ctx.t && feignId && (aifOf(feignId) & mask) !== 0) {
      const sid = dropFeignDeath(f);
      if (sid) {
        for (const e of ctx.effectsOn(f.side)) {
          if (e.spellId === sid) {
            e.expiresAt = Math.min(e.expiresAt, ctx.t);
            ctx.touchEffect(e);
          }
        }
        ctx.push({ t: ctx.t, kind: 'aura', actor: f.side, name: 'Feign Death', applied: false });
      }
    }
    // Anything else the unit is holding. setPos calls this for every moving unit every tick, so
    // it reads the by-target index (createSession effectsOn) rather than the whole effect list.
    const held = ctx.effectsOn(f.side);
    for (let i = held.length - 1; i >= 0; i--) {
      const e = held[i];
      if (!e || !e.spellId) continue;
      if (e.expiresAt <= ctx.t) continue;
      if (opts?.exceptSpellId && e.spellId === opts.exceptSpellId) continue;
      if ((aifOf(e.spellId) & mask) === 0) continue;
      if (opts?.skipInvisibility && ctx.dispelTypeOfSpell?.(e.spellId) === DISPEL_TYPE.INVISIBILITY) continue;
      e.expiresAt = ctx.t;
      ctx.touchEffect(e);
      f.buffActive.delete(e.spellId);
    }
  };

  ctx.removeAurasWithInterruptFlags = removeAurasWithInterruptFlags;
}
