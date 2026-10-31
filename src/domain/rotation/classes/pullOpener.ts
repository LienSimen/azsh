// Caster kits pull by STARTING a cast-time nuke, not by dumping an instant while walking in. An
// empty pull phase falls through to combat, which is how priests opened with an instant DoT.

import { inferRole } from '../../../engine/combat/roles.ts';
import { isMultiTargetCombatSpell } from '../classify.ts';
import type { FinalizeContext } from './hooks.ts';
import type { SpellDef } from '../../../data/schema.ts';

const CASTER_CLASS = new Set(['mage', 'warlock', 'priest']);
const CASTER_SPEC = /^(frost|fire|arcane|affliction|demonology|destruction|shadow|holy|discipline|elemental|balance)\b/i;

function isCasterKit(ctx: FinalizeContext): boolean {
  if (CASTER_CLASS.has(ctx.classKey)) return true;
  return CASTER_SPEC.test(ctx.spec);
}

function isCastTimePullNuke(s: SpellDef): boolean {
  if ((s.castTimeMs ?? 0) <= 0) return false;
  if ((s.channelMs ?? 0) > 0) return false;
  if (isMultiTargetCombatSpell(s)) return false;
  const role = s.role ?? inferRole(s);
  return role === 'nuke' || role === 'dot';
}

// Yards a pull is opened from — the ranged stand band. Only used to turn a projectile's SpellDef.speed
// (yards/sec) into the travel time it actually spends in the air.
const PULL_OPEN_YD = 30;

// Time from pressing the button to the damage LANDING: cast time plus missile flight. A projectile
// keeps travelling after the cast bar ends; a direct-land cast does not. Cite: Spell.cpp speed.
function timeToLandMs(s: SpellDef): number {
  const cast = s.castTimeMs ?? 0;
  const speed = s.speed ?? 0;
  const travel = speed > 0 ? Math.round((PULL_OPEN_YD / speed) * 1000) : 0;
  return cast + travel;
}

// Order the opener so the slowest-landing cast goes FIRST and the sequence lands together. Only
// cast-time nukes are reordered among themselves — stances, shouts and buffs keep their slot.
export function orderPullByTimeToLand(ctx: FinalizeContext): void {
  const pull = ctx.phases.pull;
  const idx: number[] = [];
  for (let i = 0; i < pull.length; i++) {
    const r = pull[i]!;
    if (!r.enabled || r.action.kind !== 'spell') continue;
    const s = ctx.knownById.get(r.action.spellId);
    if (s && isCastTimePullNuke(s)) idx.push(i);
  }
  if (idx.length < 2) return;
  const sorted = idx
    .slice()
    .sort((a, b) => {
      const sa = ctx.knownById.get((pull[a]!.action as { spellId: number }).spellId)!;
      const sb = ctx.knownById.get((pull[b]!.action as { spellId: number }).spellId)!;
      const d = timeToLandMs(sb) - timeToLandMs(sa);
      return d !== 0 ? d : a - b; // stable: authored order breaks ties
    })
    .map((i) => pull[i]!);
  idx.forEach((slot, k) => { pull[slot] = sorted[k]!; });
}

export function ensureCastTimePullOpener(ctx: FinalizeContext): void {
  if (!isCasterKit(ctx)) return;
  const hasCastPull = ctx.phases.pull.some((r) => {
    if (!r.enabled || r.action.kind !== 'spell') return false;
    const s = ctx.knownById.get(r.action.spellId);
    return !!s && isCastTimePullNuke(s);
  });
  if (hasCastPull) return;
  for (const r of ctx.phases.combat) {
    if (!r.enabled || r.action.kind !== 'spell') continue;
    const s = ctx.knownById.get(r.action.spellId);
    if (!s || !isCastTimePullNuke(s)) continue;
    if (r.conditions.some((c) =>
      c.metric === 'castingPresent'
      || c.metric === 'creatureTypeMask'
      || (c.metric === 'healthPct' && c.subject === 'target')
    )) {
      continue;
    }
    ctx.phases.pull.unshift({
      id: ctx.nextFallbackId(),
      action: { kind: 'spell', spellId: s.id },
      conditions: r.conditions.filter((c) =>
        c.metric === 'debuffPresent' || c.metric === 'formId' || c.metric === 'inCombat',
      ),
      enabled: true,
    });
    ctx.usedSpellsByPhase.pull.add(s.id);
    return;
  }
}
