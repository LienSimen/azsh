// Death-flow facade: ghost status / run-to-corpse / reclaim / spirit healer.
// Pattern C: createDeathFlowModule(ctx) — no import of game.ts.

import {
  type DeathFlowMode,
  moveGhostToCorpse,
  reclaimCorpse as doReclaimCorpse,
  spiritHealerResurrect as doSpiritHealerResurrect,
  canReclaimCorpse,
  isCorpseReclaimReady,
} from '../../domain/run/death.ts';
import {
  maxHealth, maxPower, powerType, applyAura,
} from '../../domain/character/character.ts';
import { applyDurabilityLossFraction } from '../../domain/items/durability.ts';
import { resurrectionSicknessOnRevive } from '../../domain/character/resurrectionSickness.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';

export type DeathFlowModule = {
  deathFlowMode: () => DeathFlowMode;
  methods: Pick<
    Game,
    | 'deathFlowStatus'
    | 'runToCorpse'
    | 'reclaimCorpse'
    | 'spiritHealerResurrect'
  >;
};

export function createDeathFlowModule(ctx: GameCtx): DeathFlowModule {
  const { ds, state, opts, log } = ctx;

  const deathFlowMode = (): DeathFlowMode => {
    const v = typeof opts.deathFlowMode === 'function' ? opts.deathFlowMode() : opts.deathFlowMode;
    return v === 'full' ? 'full' : 'repair-only';
  };

  return {
    deathFlowMode,
    methods: {
      deathFlowStatus(nowMs = Date.now()) {
        const flow = state.deathFlow;
        if (!flow || flow.deathState === 'ALIVE' || flow.deathState === 'JUST_ALIVED') return null;
        const ghostTime = flow.corpse?.ghostTimeMs ?? 0;
        const readyAt = ghostTime > 0 ? ghostTime + flow.reclaimDelayMs : Number.POSITIVE_INFINITY;
        return {
          deathState: flow.deathState,
          canReclaim: canReclaimCorpse(flow, nowMs),
          reclaimReady: isCorpseReclaimReady(flow, nowMs),
          reclaimDelayMs: flow.reclaimDelayMs,
          reclaimReadyInMs: Math.max(0, readyAt - nowMs),
          corpseZoneId: flow.corpse?.zoneId ?? null,
          graveyardId: flow.graveyard?.id ?? null,
        };
      },

      runToCorpse() {
        const flow = state.deathFlow;
        if (!flow || flow.deathState !== 'GHOST') {
          return { ok: false, reason: 'You are not a ghost' };
        }
        const next = moveGhostToCorpse(flow);
        if (!next) return { ok: false, reason: 'No corpse to find' };
        state.deathFlow = next;
        // Zone-based stand-in: return to the zone where you died.
        if (next.corpse && typeof next.corpse.zoneId === 'string') {
          state.char = { ...state.char, zoneId: next.corpse.zoneId };
        }
        log('You find your corpse.');
        return { ok: true };
      },

      reclaimCorpse(nowMs = Date.now()) {
        const flow = state.deathFlow;
        if (!flow) return { ok: false, reason: 'You are not dead' };
        const res = doReclaimCorpse(flow, nowMs);
        if (!res) {
          if (!isCorpseReclaimReady(flow, nowMs)) {
            return { ok: false, reason: 'You cannot reclaim your corpse yet' };
          }
          return { ok: false, reason: 'You are too far from your corpse' };
        }
        state.deathFlow = res.flow;
        const maxHp = maxHealth(state.char, ds);
        state.char.health = Math.max(1, Math.round(maxHp * res.restorePercent));
        {
          const pt = powerType(state.char);
          state.char.power = (pt === 'mana' || pt === 'energy')
            ? Math.round(maxPower(state.char, ds) * res.restorePercent)
            : 0;
        }
        // No sickness on corpse reclaim (applySickness default false).
        log('You reclaim your corpse and return to life.');
        return { ok: true };
      },

      spiritHealerResurrect(nowMs = Date.now()) {
        void nowMs;
        const flow = state.deathFlow;
        if (!flow) return { ok: false, reason: 'You are not dead' };
        const res = doSpiritHealerResurrect(flow);
        if (!res) return { ok: false, reason: 'Only a ghost can speak with the spirit healer' };
        state.deathFlow = res.flow;
        // DurabilityLossAll(0.25f) — NPCHandler.cpp SendSpiritResurrect
        state.char = applyDurabilityLossFraction(state.char, ds.item, res.durabilityLossFraction);
        const maxHp = maxHealth(state.char, ds);
        state.char.health = Math.max(1, Math.round(maxHp * res.restorePercent));
        {
          const pt = powerType(state.char);
          state.char.power = (pt === 'mana' || pt === 'energy')
            ? Math.round(maxPower(state.char, ds) * res.restorePercent)
            : 0;
        }
        // Resurrection sickness (spell 15007), level-scaled. Cite: Player.cpp ~4340.
        const sick = resurrectionSicknessOnRevive(state.char.level, res.applySickness);
        if (sick) {
          state.char = applyAura(state.char, sick.spellId, sick.durationMs, Date.now(), ds);
          log('The spirit healer returns you to life. You feel the weight of resurrection sickness.');
        } else {
          log('The spirit healer returns you to life.');
        }
        return { ok: true };
      },
    },
  };
}
