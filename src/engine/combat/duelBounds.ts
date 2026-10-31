// Player::CheckDuelDistance — the arbiter flag stands at the midpoint of the two duelists
// (SpellEffects.cpp:4259-4261), and a duelist who stays outside it long enough loses by DUEL_FLED.

import type { CombatContext } from './context.ts';
import type { CombatPosYd } from './combatGeometry.ts';
import type { Side } from '../core/events.ts';
import { detHypot } from '../core/detMath.ts';

/** Out at 50 yd, back in at 40, forfeit 10 s later. Cite: Player.cpp:6908, :6918, :6925. */
export const DUEL_OUT_OF_BOUNDS_YD = 50;
export const DUEL_BACK_IN_BOUNDS_YD = 40;
export const DUEL_FLED_AFTER_MS = 10_000;

const DUELISTS: readonly Side[] = ['player', 'enemy'];

export interface DuelBounds {
  /** The side that fled, or null. Called once a tick; a positionless duel always answers null. */
  fled: () => Side | null;
}

export function createDuelBounds(ctx: CombatContext): DuelBounds {
  let arbiter: CombatPosYd | null = null;
  const outSince = new Map<string, number>();
  const gapTo = (p: CombatPosYd, q: CombatPosYd): number => detHypot(p.x - q.x, p.y - q.y);

  return {
    fled: (): Side | null => {
      const at = DUELISTS.map((s) => ctx.posOf?.(s));
      if (!at[0] || !at[1]) return null;
      arbiter ??= { x: (at[0].x + at[1].x) / 2, y: (at[0].y + at[1].y) / 2 };
      for (let i = 0; i < DUELISTS.length; i++) {
        const side = DUELISTS[i]!;
        const d = gapTo(at[i]!, arbiter);
        const since = outSince.get(side) ?? 0;
        if (!since) {
          if (d <= DUEL_OUT_OF_BOUNDS_YD) continue;
          outSince.set(side, ctx.t);
          ctx.push({ t: ctx.t, kind: 'flavor', text: `${side === 'player' ? 'You have' : 'Your opponent has'} left the duel area.` });
          continue;
        }
        if (d <= DUEL_BACK_IN_BOUNDS_YD) { outSince.set(side, 0); continue; }
        if (ctx.t - since >= DUEL_FLED_AFTER_MS) return side;
      }
      return null;
    },
  };
}
