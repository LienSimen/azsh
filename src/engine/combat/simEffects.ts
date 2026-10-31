// Effects the tick RECORDS instead of calling out for (PERF-RUNSHEET S6b mechanism 1). Each names a
// change to state only the game layer holds — the quest log, the instance, the run.

/** One recorded effect, in the shape it rides back from a worker. */
export type SimEffect =
  | { kind: 'useCombatObject'; goEntry: number; side: string }
  | { kind: 'questEvent'; questId: number; rewardGroup: boolean }
  | { kind: 'killCredit'; creatureEntry: number }
  | { kind: 'relayScript'; relayId: number; actor: string }
  | { kind: 'instanceData'; store: ReadonlyMap<number, number>; openDoors: readonly number[] }
  // A weapon or defense point the player's swing earned. The skill map lives on the CHARACTER, and
  // off-thread the reading side's copy never swings. Cite: Player.cpp UpdateCombatSkills.
  | { kind: 'skillGain'; skillId: number; current: number; max: number }
  // A consumable spent. `total` is cumulative; omit `side` (or `player`) for your bags, `ally_N` for a companion.
  | { kind: 'itemSpend'; entry: number; total: number; charges?: number; side?: string };

type EffectCtx = {
  inStep?: boolean;
  simEffects?: SimEffect[];
  cfg: { applyEffect?: (effect: SimEffect) => void };
};

// ONE rule. Inside a step the effect is buffered for the flush at the end of it; OUTSIDE a step no
// flush is coming, so it applies now — `releaseEnemyToPassive` and the evade lifecycle run BETWEEN
// ticks, and buffering theirs dropped them at the top of the next step (evade.*.instanceValue, -1).
export function emitSimEffect(ctx: EffectCtx, effect: SimEffect): void {
  if (ctx.inStep === true) {
    ctx.simEffects?.push(effect);
    return;
  }
  ctx.cfg.applyEffect?.(effect);
}
