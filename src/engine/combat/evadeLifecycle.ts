// The scripted half of EnterEvadeMode. Two seams evade a mob and both land here, so an encounter fails
// the same way whichever fires. Before this, 91 onEvade rows had no dispatcher at all.

import {
  applyInstanceSetData,
  instanceEventForCreature,
  lifecycleActions,
  scriptDevByCreature,
  scriptDevInstanceForCreature,
} from '../../domain/scriptdev/index.ts';
import type { ScriptDevAction } from '../../domain/scriptdev/types.ts';
import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import { isEnemySide } from '../core/events.ts';
import { linkedEvadeDespawns } from '../../domain/creature/creatureLinking.ts';
import { emitSimEffect } from './simEffects.ts';

// Run the instance hook and the boss script's evade and reset for a mob that just evaded. Call it
// AFTER the hp and threat reset: a Reset row may set health and must win over the evade's full heal.
export function runEvadeLifecycle(ctx: CombatContext, ef: Fighter): void {
  const entry = (ef.spec.creatureEntry ?? 0) | 0;
  if (!entry) return;
  // LINKING_EVENT_EVADE: a master going home takes its DESPAWN_ON_EVADE slaves off the floor — the
  // six C'Thun tentacle types carry it beside SELFKILL_ON_DEATH. Cite: CreatureLinkingMgr.h:65.
  for (const slaveEntry of linkedEvadeDespawns(entry, ef.spec.mapId)) {
    for (const other of ctx.enemyBlock()) {
      if (other === ef || ((other.spec.creatureEntry ?? 0) | 0) !== slaveEntry) continue;
      if (!isEnemySide(other.side) || other.hp <= 0) continue;
      ctx.forceDespawnEnemy?.(other);
      ctx.push({ t: ctx.t, kind: 'despawn', actor: other.side });
    }
  }
  /** field:value pairs the instance hook already wrote, so a boss row does not repeat them. */
  const written = new Set<string>();
  const instIr = scriptDevInstanceForCreature(entry);
  const ev = instIr ? instanceEventForCreature(instIr, entry, 'evade') : null;
  if (instIr && ev) {
    const res = applyInstanceSetData(instIr, ev.field, ev.value, ctx.instanceData);
    for (const w of res.writes) {
      written.add(`${w.field}:${w.value}`);
      ctx.push({ t: ctx.t, kind: 'instance_data', field: w.field, value: w.value });
    }
    for (const go of res.openDoors) {
      ctx.push({ t: ctx.t, kind: 'flavor', text: `Door ${go} opens.` });
    }
    for (const text of res.flavor) ctx.push({ t: ctx.t, kind: 'flavor', text });
    emitSimEffect(ctx, {
      kind: 'instanceData', store: new Map(ctx.instanceData), openDoors: res.openDoors,
    });
  }
  const bossIr = scriptDevByCreature(entry);
  if (isEnemySide(ef.side)) ctx.enemyCastBySide.get(ef.side)?.scriptDev?.oneshotTags?.clear();
  if (!bossIr) return;
  const acts: ScriptDevAction[] = [
    ...lifecycleActions(bossIr, 'onEvade'),
    ...lifecycleActions(bossIr, 'onReset'),
  ].filter((a) => a.kind !== 'set_instance_data'
    || !written.has(`${a.field | 0}:${a.value | 0}`));
  if (acts.length) ctx.applyScriptDevCombatActions?.(ef, acts);
  // SummonedJustReachedHome rides the same evade: this engine has no walk-home phase.
  // Cite: CreatureAI.cpp JustReachedHome after EnterEvadeMode; boss_maexxna.cpp:145-148.
  ctx.notifyEventAiReachedHome?.(ef);
}
