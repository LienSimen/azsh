// combat_condition / unit_condition evaluation — the gate UnitAI puts on a spell-list row. 29 of
// 511 baked rows carry one. Default-open on anything not modelled. Cite: UnitAI.cpp:1218.
import type { CombatConditionDef, UnitConditionDef, UnitConditionTerm } from '../../data/schema.ts';

/** ConditionOperation. Cite: Globals/Conditions.h. */
export const CONDITION_OP = {
  NONE: 0,
  EQUAL_TO: 1,
  NOT_EQUAL_TO: 2,
  LESS_THAN: 3,
  LESS_THAN_OR_EQUAL_TO: 4,
  GREATER_THAN: 5,
  GREATER_THAN_OR_EQUAL_TO: 6,
} as const;

// The UnitCondition variables the 29 gated rows actually use, measured on the bake. Cite:
// Globals/UnitCondition.h UnitCondition enum.
export const UNIT_CONDITION = {
  NONE: 0,
  HEALTH_PERCENT: 12,
  IS_CASTING: 33,
  IS_CHANNELING: 35,
  NUMBER_OF_MELEE_ATTACKERS: 37,
  NUMBER_OF_ATTACKERS: 54,
} as const;

/** ConditionLogic for the friend/enemy clause pair. Cite: Globals/Conditions.h. */
const LOGIC = { NONE: 0, AND: 1, OR: 2, XOR: 3 } as const;

/** One unit the evaluator can ask about — self, the victim, a pack mate, or a hostile. */
export interface ConditionUnit {
  /** 0–100. */
  hpPct: number;
  /** Units currently attacking this one. Cite: NUMBER_OF_ATTACKERS getAttackers().size(). */
  attackers?: number;
  /** Of those, the ones it can reach with a melee swing. Cite: NUMBER_OF_MELEE_ATTACKERS. */
  meleeAttackers?: number;
  /** Mid non-melee cast. Cite: IS_CASTING GetCurrentSpell(CURRENT_GENERIC_SPELL). */
  casting?: boolean;
}

export interface CombatConditionContext {
  self: ConditionUnit;
  /** The creature's current victim; absent means the TargetCondition clause fails. */
  target?: ConditionUnit;
  /** Living pack mates within the spell's max range, self included. */
  friends?: readonly ConditionUnit[];
  /** Living hostiles on the threat list. */
  enemies?: readonly ConditionUnit[];
  combatCondition: (id: number) => CombatConditionDef | undefined;
  unitCondition: (id: number) => UnitConditionDef | undefined;
}

/** Cite: Conditions.cpp CheckOp — an unmapped op falls through to `return true`. */
export function checkOp(op: number, value: number, operand: number): boolean {
  switch (op | 0) {
    case CONDITION_OP.EQUAL_TO: return value === operand;
    case CONDITION_OP.NOT_EQUAL_TO: return value !== operand;
    case CONDITION_OP.LESS_THAN: return value < operand;
    case CONDITION_OP.LESS_THAN_OR_EQUAL_TO: return value <= operand;
    case CONDITION_OP.GREATER_THAN: return value > operand;
    case CONDITION_OP.GREATER_THAN_OR_EQUAL_TO: return value >= operand;
    default: return true;
  }
}

// One Variable/Op/Value slot against a unit. `null` = variable not modelled here, which the caller treats
// as open. Cite: UnitCondition.cpp getConditionValue.
function termValue(term: UnitConditionTerm, unit: ConditionUnit): number | null {
  switch (term.variable | 0) {
    case UNIT_CONDITION.NONE:
      // getConditionValue returns true for NONE and CheckOp(NONE, …) also returns true.
      return 1;
    case UNIT_CONDITION.HEALTH_PERCENT:
      return unit.hpPct | 0;
    case UNIT_CONDITION.NUMBER_OF_MELEE_ATTACKERS:
      return unit.meleeAttackers != null ? unit.meleeAttackers | 0 : null;
    case UNIT_CONDITION.NUMBER_OF_ATTACKERS:
      return unit.attackers != null ? unit.attackers | 0 : null;
    // Both read GetCurrentSpell(CURRENT_GENERIC_SPELL) in this branch — not a copy/paste here.
    // Cite: UnitCondition.cpp:180 IS_CASTING, :182 IS_CHANNELING.
    case UNIT_CONDITION.IS_CASTING:
    case UNIT_CONDITION.IS_CHANNELING:
      return unit.casting != null ? (unit.casting ? 1 : 0) : null;
    default:
      return null;
  }
}

// Cite: UnitCondition.cpp Meets — 8 slots, AND returns on first false, OR on first true. An unmodelled
// variable evaluates open, so it cannot turn an AND row off.
export function unitConditionMeets(def: UnitConditionDef | undefined, unit: ConditionUnit): boolean {
  if (!def) return true;
  // An OR row with a spare slot returns true on the empty slot before reaching a real term.
  if (def.orShortCircuit) return true;
  const isOr = ((def.flags ?? 0) & 0x1) !== 0;
  for (const term of def.terms ?? []) {
    const v = termValue(term, unit);
    const result = v == null ? true : checkOp(term.op ?? 0, v, term.value ?? 0);
    if (result && isOr) return true;
    if (!result && !isOr) return false;
  }
  return !isOr;
}

/** Count units in `pool` meeting `conditionId`, then compare with the clause's op/count. */
function clauseMeets(
  pool: readonly ConditionUnit[] | undefined,
  clause: { condition: number; op?: number; count?: number },
  unitCondition: (id: number) => UnitConditionDef | undefined,
): boolean {
  // No pool modelled: cannot count, so the clause is open rather than zero.
  if (!pool) return true;
  const def = unitCondition(clause.condition | 0);
  let n = 0;
  for (const u of pool) if (unitConditionMeets(def, u)) n++;
  return checkOp(clause.op ?? 0, n, clause.count ?? 0);
}

function sideMeets(
  clauses: readonly { condition: number; op?: number; count?: number }[] | undefined,
  logic: number,
  pool: readonly ConditionUnit[] | undefined,
  unitCondition: (id: number) => UnitConditionDef | undefined,
): boolean {
  if (!clauses || clauses.length === 0) return true;
  // Cite: CombatCondition.cpp Meets — NONE uses clause 0 alone; AND/OR/XOR combine both.
  if ((logic | 0) === LOGIC.NONE) return clauseMeets(pool, clauses[0]!, unitCondition);
  const a = clauseMeets(pool, clauses[0]!, unitCondition);
  const b = clauses[1] ? clauseMeets(pool, clauses[1], unitCondition) : true;
  switch (logic | 0) {
    case LOGIC.AND: return a && b;
    case LOGIC.OR: return a || b;
    case LOGIC.XOR: return a !== b;
    default: return true;
  }
}

// True when the spell-list row may fire. Two deliberate departures, both open: an id with no baked
// row returns true, and WorldStateExpressionID is not evaluated. Cite: CombatCondition.cpp Meets.
export function combatConditionMeets(id: number, ctx: CombatConditionContext): boolean {
  const cid = id | 0;
  if (cid === 0 || cid === -1) return true;
  const def = ctx.combatCondition(cid);
  if (!def) return true;
  if (def.selfCondition && !unitConditionMeets(ctx.unitCondition(def.selfCondition), ctx.self)) {
    return false;
  }
  if (def.targetCondition) {
    // Cite: CombatCondition.cpp — no target is a fail, not an open.
    if (!ctx.target) return false;
    if (!unitConditionMeets(ctx.unitCondition(def.targetCondition), ctx.target)) return false;
  }
  if (!sideMeets(def.friend, def.friendLogic ?? 0, ctx.friends, ctx.unitCondition)) return false;
  if (!sideMeets(def.enemy, def.enemyLogic ?? 0, ctx.enemies, ctx.unitCondition)) return false;
  return true;
}
