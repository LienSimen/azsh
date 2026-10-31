// P11 peel: the ring-trim wrapper that sits around stepSession's core step.
// Kept out of stepSession.ts so that file stays under its filesize ceiling.
import type { CombatContext } from './context.ts';
import type { Fighter, CombatAction, SimTickInputs } from './types.ts';
import type { CombatEvent } from '../core/events.ts';
import { isEnemySide } from '../core/events.ts';
import {
  cancelChannelOutOfRange, channelInterruptCtx, endChannelIfTargetsGone, expireChannelIfDone,
  tickChannelPerSecondCost,
} from './channel.ts';
import { combatActionOffTarget, combatActionSpellId } from './castAction.ts';
import { resetNavSightMemo } from './navSight.ts';

/** Locals installStepSession already bound; passed in so the captures stay identical. */
export type installStepWrapDeps = {
  stepCore: (action?: CombatAction) => unknown;
  events: CombatEvent[];
  push: (e: any) => void;
  player: Fighter;
  pet: Fighter | null | undefined;
  cfg: { endless?: boolean };
  dead: (...args: any[]) => any;
  isControlledHard: (...args: any[]) => any;
};

// Session event log cap. `events` was unbounded: a continuous dungeon emits ~250 events/s and a 137 s
// capture held 34.5k rows. 8k is ~30 s of raid combat at 4x; `eventsDropped` keeps cursors honest.
export const MAX_SESSION_EVENTS = 8192;
export const EVENT_TRIM_CHUNK = 2048;
export function installStepWrap(ctx: CombatContext, deps: installStepWrapDeps): void {
  const { stepCore, events, player, pet, dead } = deps;
  if (ctx.eventsDropped == null || !Number.isFinite(ctx.eventsDropped)) ctx.eventsDropped = 0;
  if (ctx.lastActionT == null || !Number.isFinite(ctx.lastActionT)) ctx.lastActionT = 0;

  const stepInner = (action?: CombatAction): CombatEvent[] => {
    resetNavSightMemo();
    const startLen = events.length;
    // NOT the first tick: it stays true until something pushes, so a silent opening makes it true more
    // than once. Safe only because the aggro lifecycle keeps its own emitted set; hang nothing else here.
    const noEventsYet = events.length === 0;
    // Out of combat means between pulls, so the next pull gets its opener sequence back. A one-fight
    // session never reaches here while it matters, so goldens are unchanged.
    ctx.clearPullSpentIfIdle?.();
    // Live UI `offTarget` → rotationOffTarget. Else a 1.5 s Poly sheeps the kill target.
    let next = action;
    if (combatActionOffTarget(action)) {
      const spellId = combatActionSpellId(action);
      const spell = spellId != null
        ? player.spec.spells.find((s) => s.id === spellId)
        : undefined;
      const foe = ctx.foeOf!(player);
      const tgt = ctx.pickCcTarget?.(player, foe, spell);
      if (!tgt || !isEnemySide(tgt.side)) {
        next = undefined;
      } else {
        ctx.rotationOffTarget?.set(player.side, tgt.side);
      }
    }
    // Retire finished channels: reachable only from the damage path before, so an undisturbed channel
    // stayed armed forever. Per-second cost ticks first so the last second at endsAt still pays.
    const chCtx = channelInterruptCtx(ctx);
    // One roster walk: the cost pass remembers who was channelling, so the expiry pass visits 0-2 units
    // instead of 40, in the same order. Lazily allocated — two 97-entry arrays a tick was the real cost.
    let channelers: Fighter[] | null = null;
    for (const f of ctx.fightersOrder()) {
      if (!f.channeling) continue;
      (channelers ??= []).push(f);
      tickChannelPerSecondCost(f, { ...chCtx, push: ctx.push });
    }
    if (channelers) {
      for (const f of channelers) {
        if (!f.channeling) continue;
        expireChannelIfDone(f, ctx.t);
        // Spell::update's other two enders: no living aura target left, and the channel target out
        // of maxRange * 1.5. Cite: Spell.cpp:3557-3562, :3544-3554.
        if (f.channeling && endChannelIfTargetsGone(f, { ...chCtx, dead })) continue;
        if (f.channeling) {
          cancelChannelOutOfRange(f, { ...chCtx, distanceBetween: ctx.distanceBetween });
        }
      }
    }
    stepCore(next);
    if (noEventsYet) {
      for (const ef of ctx.livingEnemies()) ctx.runScriptDevAggroLifecycle?.(ef);
    }
    // Floor spawns arrive long after the first tick, so their Aggro() has to be watched for.
    ctx.pumpScriptDevAggroLifecycle?.();
    ctx.invalidateViewMemo?.();
    return events.slice(startLen);
  };

  // Trim AFTER the step returns its slice, never inside push(): the slice is taken against an absolute
  // index, so a mid-step trim would hand the caller the wrong rows.
  ctx.step = (action?: CombatAction, inputs?: SimTickInputs): CombatEvent[] => {
    // ONE write point, at the top of the step: the tick never reaches back for these mid-step, which
    // is what lets the sim run somewhere else. An argument (off-thread) wins over the local supplier.
    if (inputs !== undefined) ctx.tickInputs = inputs;
    else if (ctx.cfg.tickInputs) ctx.tickInputs = ctx.cfg.tickInputs();
    if (ctx.simEffects) ctx.simEffects.length = 0;
    else ctx.simEffects = [];
    // The window a flush is coming for. Outside it `emitSimEffect` applies straight away.
    ctx.inStep = true;
    let out;
    try { out = stepInner(action); } finally { ctx.inStep = false; }
    // The flush. On this thread it runs here; behind a Worker the same array rides back with the batch
    // and the main thread's pump applies it. Either way the tick never called out mid-step.
    const apply = ctx.cfg.applyEffect;
    if (apply) for (const e of ctx.simEffects) apply(e);
    ctx.simEffects.length = 0;
    if (events.length > MAX_SESSION_EVENTS) {
      events.splice(0, EVENT_TRIM_CHUNK);
      ctx.eventsDropped = (ctx.eventsDropped ?? 0) + EVENT_TRIM_CHUNK;
    }
    return out;
  };
}
