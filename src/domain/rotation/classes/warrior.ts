// PURE: no DOM/RNG/Date. Warrior rotation post-pass + kit policy.

import type { DataStore } from '../../../data/dataStore.ts';
import { SHAPESHIFT_FORM, type SpellDef } from '../../../data/schema.ts';
import { normalizeSpellName } from '../rotationSuggestions.ts';
import type { Condition, RotationRule } from '../types.ts';
import {
  applyFormEnterGate,
  formIdForRotationSpell,
  isMultiTargetCombatSpell,
  isPiercingHowlSpell,
  piercingHowlGapConditions,
} from '../classify.ts';
import type { ClassRotationHooks, FinalizeContext } from './hooks.ts';
import { rebuildPhaseUsed } from './hooks.ts';

// Align the pull form enter with combat when they disagree, except a warrior Charge opener: every
// spec opens Battle Stance then Charge, which is Battle-only. Other classes still match.
export function reconcilePullStanceWithCombat(
  pull: RotationRule[],
  combat: RotationRule[],
  knownById: Map<number, SpellDef>,
  ds: DataStore,
  _known: readonly SpellDef[],
): RotationRule[] {
  const combatForm = combat.find((r) => {
    if (r.action.kind !== 'spell') return false;
    const sp = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
    return !!sp && !!formIdForRotationSpell(sp);
  });
  if (!combatForm || combatForm.action.kind !== 'spell') return pull;
  const combatSp = knownById.get(combatForm.action.spellId) ?? ds.spell(combatForm.action.spellId);
  if (!combatSp) return pull;
  const combatFormId = formIdForRotationSpell(combatSp);
  if (!combatFormId) return pull;

  const chargeInPull = pull.some((r) => {
    if (r.action.kind !== 'spell') return false;
    const sp = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
    const n = sp ? normalizeSpellName(sp.name) : '';
    return n === 'charge' || n === 'charge stun';
  });

  // Warrior open: Battle Stance + Charge is intentional; combat re-enters the spec stance.
  if (chargeInPull) return pull;

  return pull.flatMap((r) => {
    if (r.action.kind !== 'spell') return [r];
    const sp = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
    if (!sp) return [r];
    const fid = formIdForRotationSpell(sp);
    if (fid && fid !== combatFormId) {
      return [{
        ...r,
        action: { kind: 'spell', spellId: combatSp.id },
        conditions: applyFormEnterGate(combatSp, []),
      }];
    }
    return [r];
  });
}

// ---- Combat finalize (multi order + Arms stance dance) --------------------

const nameOf = (id: number, knownById: Map<number, SpellDef>, ds: DataStore): string =>
  normalizeSpellName((knownById.get(id) ?? ds.spell(id))?.name ?? '');

const hasEnemyCountOp = (r: RotationRule, op: Condition['op']): boolean =>
  r.conditions.some((c) => c.metric === 'enemyCount' && c.op === op);

const isFormEnterRule = (r: RotationRule, knownById: Map<number, SpellDef>, ds: DataStore): boolean => {
  if (r.action.kind !== 'spell') return false;
  const sp = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
  return !!sp && !!formIdForRotationSpell(sp);
};

/** Multi-only Battle enter (pack SS dip). */
const isMultiBattleEnter = (
  r: RotationRule,
  knownById: Map<number, SpellDef>,
  ds: DataStore,
): boolean =>
  r.action.kind === 'spell'
  && nameOf(r.action.spellId, knownById, ds) === 'battle stance'
  && (hasEnemyCountOp(r, '>=') || hasEnemyCountOp(r, '>'));

/** Multi-only Berserker enter (pack WW / post-SS). */
const isMultiZerkEnter = (
  r: RotationRule,
  knownById: Map<number, SpellDef>,
  ds: DataStore,
): boolean =>
  r.action.kind === 'spell'
  && nameOf(r.action.spellId, knownById, ds) === 'berserker stance'
  && (hasEnemyCountOp(r, '>=') || hasEnemyCountOp(r, '>'));

// Authored Fury bands keep a "Battle on multi while the SS buff is absent" row even for a character
// who never learned Sweeping Strikes, so it thrash-flips against Berserker every GCD. Drop it.
function stripDeadSweepingStrikesStanceDips(ctx: FinalizeContext): void {
  const { knownById, ds, phases } = ctx;
  phases.combat = phases.combat.filter((r) => {
    if (isMultiBattleEnter(r, knownById, ds)) return false;
    if (
      isMultiZerkEnter(r, knownById, ds)
      && r.conditions.some((c) => c.metric === 'buffPresent' && c.ref != null)
    ) {
      return false;
    }
    return true;
  });
}

// Arms multi-target dance: Battle to land Sweeping Strikes, then Berserker for Whirlwind, then
// Cleave. Authored Arms bands lock Battle always, so Whirlwind could never fire on a pack.
function ensureWarriorMultiStanceDance(ctx: FinalizeContext): void {
  const { knownById, ds, known, phases, nextFallbackId } = ctx;
  const combat = phases.combat;

  const ww = combat.find((r) => r.action.kind === 'spell' && nameOf(r.action.spellId, knownById, ds) === 'whirlwind');
  const ss = combat.find((r) => r.action.kind === 'spell' && nameOf(r.action.spellId, knownById, ds) === 'sweeping strikes');
  // SS may be known but filtered from combat; still treat as available for dip logic.
  const ssSpell = (ss && ss.action.kind === 'spell'
    ? (knownById.get(ss.action.spellId) ?? ds.spell(ss.action.spellId))
    : null)
    ?? known.find((s) => normalizeSpellName(s.name) === 'sweeping strikes');
  const needsBattleForSs = !!ssSpell;
  const needsZerkForWw = !!ww;

  // No SS in the kit: authored multi Battle (buffPresent 12292) can never complete → thrash.
  if (!needsBattleForSs) {
    stripDeadSweepingStrikesStanceDips(ctx);
    // Still allow multi Berserker for WW when primary is Battle-anchored (Arms).
    if (!needsZerkForWw) return;
  }

  const battleSp = known.find((s) => normalizeSpellName(s.name) === 'battle stance');
  const zerkSp = known.find((s) => normalizeSpellName(s.name) === 'berserker stance');
  if (!battleSp || !zerkSp) return;

  // Detect primary combat stance (first form-enter that is not multi-only).
  const primaryForm = phases.combat.find((r) => {
    if (!isFormEnterRule(r, knownById, ds)) return false;
    // Skip multi-only stance dips we may already have inserted.
    if (hasEnemyCountOp(r, '>=') || hasEnemyCountOp(r, '>')) return false;
    return true;
  });
  const primarySp = primaryForm?.action.kind === 'spell'
    ? (knownById.get(primaryForm.action.spellId) ?? ds.spell(primaryForm.action.spellId))
    : null;
  const primaryId = primarySp ? formIdForRotationSpell(primarySp) : 0;

  if (!needsBattleForSs && !needsZerkForWw) return;
  if (primaryId === SHAPESHIFT_FORM.DEFENSIVESTANCE) return; // tanks stay Defensive

  const ensureCond = (conds: Condition[], add: Condition): Condition[] =>
    conds.some((c) => c.metric === add.metric && c.op === add.op && c.value === add.value && c.ref === add.ref)
      ? conds
      : [...conds, add];

  // Rewrite primary stance enters so multi dips can win first-match (hoist keeps primary
  // in the head ahead of pack tools).
  let next = phases.combat.map((r) => {
    if (r !== primaryForm || r.action.kind !== 'spell') return r;
    const sp = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
    if (!sp) return r;
    const fid = formIdForRotationSpell(sp);
    // Arms: primary Battle becomes ST-only so multi can leave for Zerk / SS dip.
    if (
      fid === SHAPESHIFT_FORM.BATTLESTANCE
      && primaryId === SHAPESHIFT_FORM.BATTLESTANCE
      && needsZerkForWw
    ) {
      return {
        ...r,
        conditions: ensureCond(
          r.conditions.filter((c) => c.metric !== 'enemyCount'),
          { subject: 'self', metric: 'enemyCount', op: '<', value: 2 },
        ),
      };
    }
    // Fury + SS: primary Berserker is ST-only. Packs use multi Battle → SS → multi Berserker
    // (primary sits ahead of pack tools in hoist order, so an ungated Berserker thrash-flips).
    if (
      fid === SHAPESHIFT_FORM.BERSERKERSTANCE
      && primaryId === SHAPESHIFT_FORM.BERSERKERSTANCE
      && needsBattleForSs
    ) {
      return {
        ...r,
        conditions: ensureCond(
          r.conditions.filter((c) => c.metric !== 'enemyCount'),
          { subject: 'self', metric: 'enemyCount', op: '<', value: 2 },
        ),
      };
    }
    return r;
  });

  const hasMultiBattle = next.some((r) => isMultiBattleEnter(r, knownById, ds));
  const hasMultiZerk = next.some((r) => isMultiZerkEnter(r, knownById, ds));

  const inserts: RotationRule[] = [];

  // Multi Battle enter: only to cast SS (or stay Battle when no WW).
  if (needsBattleForSs && !hasMultiBattle && ssSpell) {
    const conds: Condition[] = [
      { subject: 'self', metric: 'formId', op: '!=', value: SHAPESHIFT_FORM.BATTLESTANCE },
      { subject: 'self', metric: 'enemyCount', op: '>=', value: 2 },
      // Enter Battle while SS is not up; once SS is rolling, Zerk dip wins.
      {
        subject: 'self',
        metric: 'buffPresent',
        op: '==',
        value: 0,
        ref: ssSpell.id,
      },
    ];
    inserts.push({
      id: nextFallbackId(),
      action: { kind: 'spell', spellId: battleSp.id },
      conditions: conds,
      enabled: true,
    });
  }

  // Multi Berserker enter: after SS is up (or no SS), for Whirlwind.
  if (needsZerkForWw && !hasMultiZerk) {
    const conds: Condition[] = [
      { subject: 'self', metric: 'formId', op: '!=', value: SHAPESHIFT_FORM.BERSERKERSTANCE },
      { subject: 'self', metric: 'enemyCount', op: '>=', value: 2 },
    ];
    if (ssSpell) {
      // Leave Battle once Sweeping Strikes is rolling. If SS never applied this pack,
      // multi Battle enter + SS rule fire first.
      conds.push({
        subject: 'self',
        metric: 'buffPresent',
        op: '==',
        value: 1,
        ref: ssSpell.id,
      });
    }
    inserts.push({
      id: nextFallbackId(),
      action: { kind: 'spell', spellId: zerkSp.id },
      conditions: conds,
      enabled: true,
    });
  }

  if (!inserts.length && next === phases.combat) return;
  phases.combat = inserts.length ? [...inserts, ...next] : next;
}

// Pack tools win by first match, so Sweeping Strikes, Whirlwind, Cleave and Thunder Clap must sit
// above ST keep-ups and fillers that still match on packs. Signature cooldowns stay above them.
function hoistWarriorPackTools(ctx: FinalizeContext): void {
  const { knownById, ds, phases } = ctx;
  const combat = phases.combat;

  const rank = (r: RotationRule): number => {
    if (r.action.kind !== 'spell') return 50;
    const n = nameOf(r.action.spellId, knownById, ds);
    // Multi stance dips + SS first
    if (n === 'battle stance' && (hasEnemyCountOp(r, '>=') || hasEnemyCountOp(r, '>'))) return 1;
    if (n === 'sweeping strikes') return 2;
    if (n === 'berserker stance' && (hasEnemyCountOp(r, '>=') || hasEnemyCountOp(r, '>'))) return 3;
    if (n === 'whirlwind') return 4;
    if (n === 'cleave') return 5;
    if (n === 'thunder clap') return 6;
    if (n === 'demoralizing shout' && (hasEnemyCountOp(r, '>=') || hasEnemyCountOp(r, '>'))) return 7;
    return -1;
  };

  // The wall is the first unconditional no-cooldown filler, or the first ST-only keep-up that is not
  // a signature cooldown, so pack tools land just after the high-value spenders and reacts.
  const isSignatureCd = (r: RotationRule): boolean => {
    if (r.action.kind !== 'spell') return false;
    const sp = knownById.get(r.action.spellId) ?? ds.spell(r.action.spellId);
    if (!sp) return false;
    const n = normalizeSpellName(sp.name);
    if (n === 'mortal strike' || n === 'bloodthirst' || n === 'shield slam') return true;
    // Cooldown-bearing execute / overpower stay high too
    if (n === 'execute' || n === 'overpower') return true;
    return (sp.cooldownMs ?? 0) > 0 && !isMultiTargetCombatSpell(sp) && n !== 'whirlwind';
  };

  const isInterruptOrReact = (r: RotationRule): boolean =>
    r.conditions.some((c) =>
      c.metric === 'castingPresent' || c.metric === 'dodgedRecently' || c.metric === 'defenseReactRecently',
    );

  const isPrimaryStance = (r: RotationRule): boolean =>
    isFormEnterRule(r, knownById, ds) && !hasEnemyCountOp(r, '>=') && !hasEnemyCountOp(r, '>');

  const isShoutKeepUp = (r: RotationRule): boolean => {
    if (r.action.kind !== 'spell') return false;
    return nameOf(r.action.spellId, knownById, ds) === 'battle shout';
  };

  // Head: interrupts/reacts + primary stance + battle shout + signature CDs (MS/BT/Execute/OP)
  // Then pack tools in rank order, then the rest.
  const head: RotationRule[] = [];
  const pack: RotationRule[] = [];
  const rest: RotationRule[] = [];

  for (const r of combat) {
    const rk = rank(r);
    if (rk >= 0) {
      pack.push(r);
      continue;
    }
    if (isInterruptOrReact(r) || isPrimaryStance(r) || isShoutKeepUp(r) || isSignatureCd(r)) {
      head.push(r);
      continue;
    }
    rest.push(r);
  }

  pack.sort((a, b) => rank(a) - rank(b));
  phases.combat = [...head, ...pack, ...rest];
}

// Gate any remaining ungated Sunder to single-target. Not for Protection: a tank's Sunder IS the
// threat, and "a second mob exists" describes every raid boss — Onyxia's whelps switched it off.
function gateSunderSingleTarget(ctx: FinalizeContext): void {
  const { knownById, ds, phases, spec } = ctx;
  // This pass runs BEFORE tankize inserts Taunt, so Taunt alone is not a usable tank signal
  // here — the shield kit is what exists at this point.
  const TANK_KIT = new Set(['taunt', 'defensive stance', 'shield slam', 'shield block']);
  const isTank = spec === 'Protection'
    || phases.combat.some(
      (r) => r.action.kind === 'spell' && TANK_KIT.has(nameOf(r.action.spellId, knownById, ds)),
    );
  if (isTank) return;
  phases.combat = phases.combat.map((r) => {
    if (r.action.kind !== 'spell') return r;
    if (nameOf(r.action.spellId, knownById, ds) !== 'sunder armor') return r;
    if (r.conditions.some((c) => c.metric === 'enemyCount')) return r;
    return {
      ...r,
      conditions: [
        ...r.conditions,
        { subject: 'self', metric: 'enemyCount', op: '<', value: 2 },
      ],
    };
  });
}

/** Charge is OOC-only — skip it in the pull sequence once THIS unit is in combat. */
function gateChargePullOutOfCombat(ctx: FinalizeContext): void {
  const { knownById, ds, phases } = ctx;
  phases.pull = phases.pull.map((r) => {
    if (r.action.kind !== 'spell') return r;
    const n = nameOf(r.action.spellId, knownById, ds);
    if (n !== 'charge' && n !== 'charge stun') return r;
    if (r.conditions.some((c) => c.metric === 'inCombat')) return r;
    return {
      ...r,
      conditions: [
        ...r.conditions,
        { subject: 'self', metric: 'inCombat', op: '==', value: 0 },
      ],
    };
  });
}

export function finalizeWarriorCombat(ctx: FinalizeContext): void {
  gateSunderSingleTarget(ctx);
  ensureWarriorMultiStanceDance(ctx);
  hoistWarriorPackTools(ctx);
  ensurePiercingHowlGapSnare(ctx);
  rebuildPhaseUsed(ctx, 'combat');
}

/** Howl is a gap snare. Packs omit it; a known talent still has to sit next to Hamstring. */
function ensurePiercingHowlGapSnare(ctx: FinalizeContext): void {
  const { knownById, ds, known, phases, nextFallbackId } = ctx;
  const howl = known.find((s) => isPiercingHowlSpell(s));
  if (!howl) return;
  if (phases.combat.some((r) => r.action.kind === 'spell' && r.action.spellId === howl.id)) return;
  const row: RotationRule = {
    id: nextFallbackId(),
    action: { kind: 'spell', spellId: howl.id },
    conditions: piercingHowlGapConditions(howl),
    enabled: true,
  };
  const hamIdx = phases.combat.findIndex(
    (r) => r.action.kind === 'spell' && nameOf(r.action.spellId, knownById, ds) === 'hamstring',
  );
  if (hamIdx >= 0) phases.combat.splice(hamIdx + 1, 0, row);
  else phases.combat.push(row);
}

export const warriorHooks: ClassRotationHooks = {
  // Stance reconcile runs globally from the registry (see index.ts) so behavior stays
  // identical for form-using kits; warrior owns the implementation body.
  afterFallback(ctx) {
    gateChargePullOutOfCombat(ctx);
    finalizeWarriorCombat(ctx);
  },
};
