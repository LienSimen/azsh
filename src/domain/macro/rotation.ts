// A macro AS AN AUTO-ROTATION ACTION, compiled into ordinary rotation rules when the rotation is
// handed to combat. Keyboard-shaped branches ([mod:shift], @mouseover, /target) are REFUSED by name.

import type {
  CondMetric, CondOp, CondSubject, Condition, Rotation, RotationRule, RuleAction,
} from '../rotation/types.ts';
import { ROTATION_PHASES, type RotationPhase } from '../rotation/types.ts';
import { conditionGroups } from '../rotation/evaluate.ts';
import { macroCreatureTypeId } from './creatureTypes.ts';
import { macroGroupUnit, parseMacroBody, type MacroClause, type MacroCond, type MacroVerb } from './parse.ts';
import { splitSpellRank } from './snapshot.ts';
import { MACRO_DEPTH_MAX, type MacroDef } from './types.ts';
import { describeMacroUnit, parseMacroUnit, type MacroUnitRef } from './units.ts';

// Rules one macro rule may compile to. Bounds OR-group expansion, `stance:1/3` expansion and `{Other}`
// inlining together, so a hand-edited save cannot hand the evaluator a long list.
export const MACRO_ROT_RULES_MAX = 24;

/** What a macro rule compiled to, and what it could not. */
export interface MacroExpansion {
  /** The compiled rules, in priority order. Empty = nothing auto-combat can run. */
  rules: RotationRule[];
  /** One player-readable line per refused branch or dropped condition, in body order. */
  drops: string[];
  /** A cap was hit (rule count or `{macro}` depth). */
  truncated: boolean;
}

// What the compiler is allowed to know, built once per assembly from the character's own book and
// bags, so /cast in a rotation resolves exactly as /cast on a button does.
export interface MacroExpandEnv {
  macroById(id: string): MacroDef | null;
  macroByName(name: string): MacroDef | null;
  resolveSpell(name: string, rank?: number, subtext?: string): { id: number; name: string } | null;
  resolveItem(name: string): { entry: number; name: string } | null;
  // Aura NAME -> spellId for buff: and debuff: refs. Wider than resolveSpell, since an aura can sit
  // on you without being something you cast. Null means the branch refuses rather than guessing.
  resolveAura(name: string): { id: number; name: string } | null;
  /** 1-based stance-bar slot -> shapeshift form id (domain/character/stanceBar.ts listStanceSlots). */
  formIdForStanceSlot(slot: number): number | null;
  // True when the bake pairs Stealth with a shapeshift form, so `[stealth]` is readable off
  // RotationSnapshot.self.formId. False = refuse it instead of compiling a gate that never fires.
  stealthFormId: number | null;
  // Cache key material for the memo in rotationWithMacros: a macro BODY edit creates no new Rotation
  // object. Only the ids the rotation references are passed, so the hash stays short.
  signature(macroIds: readonly string[]): string;
}

// Every refusal, in one table, so the editor row, the smoke goldens and any future surface read the same
// words. Player-facing copy: plain, literal, no em dashes.
export const MACRO_ROT_REFUSAL = {
  aim: (ref: MacroUnitRef): string =>
    `auto-combat aims at your target, so it cannot aim at ${describeMacroUnit(ref)}`,
  selfCast: 'auto-combat casts at your target, so a macro rule cannot cast on you',
  friendly: 'auto-combat picks its own friendly target, so [help] cannot be read here',
  modifier: 'a modifier key is not something auto-combat can hold down',
  noRecast: '"!" means "not while it is already running", which only a keypress can know',
  equipped: 'auto-combat cannot read which weapon type you have equipped',
  group: 'auto-combat cannot read your party or raid roster from a macro',
  identity: 'auto-combat cannot tell a player from an NPC',
  rawPower: 'auto-combat reads power as a percent, so use mypower or power instead',
  exists: 'auto-combat only ever has a living target, so [exists] cannot be read',
  stealth: 'auto-combat cannot read whether you are stealthed',
  cooldownOn: '"on cooldown" is not something a rotation can wait for',
  cooldownOther: (name: string): string => `auto-combat cannot read the cooldown of ${name}`,
  attacksOther: (ref: MacroUnitRef): string =>
    `auto-combat can only read whether your target is attacking you, not ${describeMacroUnit(ref)}`,
  stanceSlot: (slot: string): string => `you have no form or stance in bar slot ${slot}`,
  unknownCond: (key: string): string => `"${key}" is not a condition auto-combat knows`,
  unreadable: 'that condition could not be read',
  verb: (verb: MacroVerb): string => `/${verb} is a keypress, not a rotation decision`,
  autoAttack: 'auto-attack runs on its own, so a rotation has nothing to fire here',
  noSpell: (arg: string): string => `you have no usable spell "${arg}"`,
  noItem: (arg: string): string => `you are not carrying "${arg}"`,
  noAura: (name: string): string => `auto-combat could not find an aura named "${name}"`,
  depth: `macros nest at most ${MACRO_DEPTH_MAX} deep`,
  cycle: (name: string): string => `macro "${name}" calls itself`,
  noMacro: (name: string): string => `no macro named "${name}"`,
  cap: `only the first ${MACRO_ROT_RULES_MAX} rules a macro compiles to are run`,
} as const;

const cond = (
  subject: CondSubject,
  metric: CondMetric,
  op: CondOp,
  value: number,
  ref?: number,
): Condition => (ref == null ? { subject, metric, op, value } : { subject, metric, op, value, ref });

/** One condition's compilation. `variants` OR together; conditions inside a variant AND. */
type CondResult =
  | { ok: true; variants: Condition[][] }
  | { ok: false; reason: string };

/** Dropped as redundant / already implied: contributes no condition, refuses nothing. */
const DROPPED: CondResult = { ok: true, variants: [[]] };

const one = (c: Condition): CondResult => ({ ok: true, variants: [[c]] });

/** `key>N` / `key<N` -> a rotation op. Roid uses strict < / > (Conditionals.lua:224). */
function cmpOp(c: MacroCond): CondOp | null {
  return c.cmp === '>' ? '>' : c.cmp === '<' ? '<' : null;
}

interface CondCtx {
  /** The spell this clause casts, so `[nocooldown:<that spell>]` reads as redundant. */
  ownName: string;
  env: MacroExpandEnv;
}

/** Aura gate: `mybuff:X` and friends need a spellId `ref`, so an unresolvable name refuses. */
function auraCond(
  c: MacroCond,
  ctx: CondCtx,
  subject: CondSubject,
  metric: 'buffPresent' | 'debuffPresent',
  want: 0 | 1,
): CondResult {
  const name = c.values[0] ?? '';
  if (!name) return { ok: false, reason: MACRO_ROT_REFUSAL.noAura(name) };
  const aura = ctx.env.resolveAura(name);
  if (!aura) return { ok: false, reason: MACRO_ROT_REFUSAL.noAura(name) };
  return one(cond(subject, metric, '==', want, aura.id));
}

function meterCond(
  c: MacroCond,
  subject: CondSubject,
  metric: 'healthPct' | 'powerPct',
): CondResult {
  const op = cmpOp(c);
  if (!op || c.amount == null) return { ok: false, reason: MACRO_ROT_REFUSAL.unreadable };
  return one(cond(subject, metric, op, c.amount));
}

/** One macro condition -> rotation conditions, or a named refusal. */
function compileCond(c: MacroCond, ctx: CondCtx): CondResult {
  switch (c.key) {
    // ---- target validity ----------------------------------------------------------------
    // The parser emits `target` for every @unit token, and compileClause already handles the aim.
    case 'target': return DROPPED;
    case 'harm':
    case 'nodead': return one(cond('target', 'alive', '==', 1));
    case 'dead': return one(cond('target', 'alive', '==', 0));
    case 'help': return { ok: false, reason: MACRO_ROT_REFUSAL.friendly };
    case 'exists':
    case 'noexists': return { ok: false, reason: MACRO_ROT_REFUSAL.exists };

    // ---- state --------------------------------------------------------------------------
    case 'combat': return one(cond('self', 'inCombat', '==', 1));
    case 'nocombat': return one(cond('self', 'inCombat', '==', 0));
    case 'stealth':
    case 'nostealth': {
      const form = ctx.env.stealthFormId;
      if (form == null) return { ok: false, reason: MACRO_ROT_REFUSAL.stealth };
      return one(cond('self', 'formId', c.key === 'stealth' ? '==' : '!=', form));
    }
    case 'channeled': return one(cond('self', 'castingPresent', '==', 1));
    case 'nochanneled': return one(cond('self', 'castingPresent', '==', 0));

    // ---- form / modifiers ---------------------------------------------------------------
    // `stance:1/3` is an OR over bar slots, so each value becomes its own rule.
    case 'stance':
    case 'nostance': {
      const wantIn = c.key === 'stance';
      if (!wantIn) {
        // nostance:1/2 is AND (not slot 1 AND not slot 2). stance:1/3 is OR.
        const ands: Condition[] = [];
        for (const v of c.values) {
          const slot = Number(v);
          if (!Number.isInteger(slot)) return { ok: false, reason: MACRO_ROT_REFUSAL.unreadable };
          if (slot === 0) {
            ands.push(cond('self', 'formId', '!=', 0));
            continue;
          }
          const form = ctx.env.formIdForStanceSlot(slot);
          if (form == null) return { ok: false, reason: MACRO_ROT_REFUSAL.stanceSlot(v) };
          ands.push(cond('self', 'formId', '!=', form));
        }
        if (!ands.length) return { ok: false, reason: MACRO_ROT_REFUSAL.unreadable };
        return { ok: true, variants: [ands] };
      }
      const variants: Condition[][] = [];
      for (const v of c.values) {
        const slot = Number(v);
        if (!Number.isInteger(slot)) return { ok: false, reason: MACRO_ROT_REFUSAL.unreadable };
        if (slot === 0) {
          variants.push([cond('self', 'formId', '==', 0)]);
          continue;
        }
        const form = ctx.env.formIdForStanceSlot(slot);
        if (form == null) return { ok: false, reason: MACRO_ROT_REFUSAL.stanceSlot(v) };
        variants.push([cond('self', 'formId', '==', form)]);
      }
      if (!variants.length) return { ok: false, reason: MACRO_ROT_REFUSAL.unreadable };
      return { ok: true, variants };
    }
    case 'mod':
    case 'nomod':
    case 'modifier': return { ok: false, reason: MACRO_ROT_REFUSAL.modifier };

    // ---- gear / group / identity --------------------------------------------------------
    case 'equipped':
    case 'noequipped':
    case 'worn':
    case 'noworn': return { ok: false, reason: MACRO_ROT_REFUSAL.equipped };
    case 'party':
    case 'raid':
    case 'group': return { ok: false, reason: MACRO_ROT_REFUSAL.group };
    case 'isplayer':
    case 'isnpc': return { ok: false, reason: MACRO_ROT_REFUSAL.identity };

    // ---- auras --------------------------------------------------------------------------
    case 'mybuff': return auraCond(c, ctx, 'self', 'buffPresent', 1);
    case 'nomybuff': return auraCond(c, ctx, 'self', 'buffPresent', 0);
    case 'mydebuff': return auraCond(c, ctx, 'self', 'debuffPresent', 1);
    case 'nomydebuff': return auraCond(c, ctx, 'self', 'debuffPresent', 0);
    case 'buff': return auraCond(c, ctx, 'target', 'buffPresent', 1);
    case 'nobuff': return auraCond(c, ctx, 'target', 'buffPresent', 0);
    case 'debuff': return auraCond(c, ctx, 'target', 'debuffPresent', 1);
    case 'nodebuff': return auraCond(c, ctx, 'target', 'debuffPresent', 0);

    // ---- meters -------------------------------------------------------------------------
    case 'myhp': return meterCond(c, 'self', 'healthPct');
    case 'hp': return meterCond(c, 'target', 'healthPct');
    case 'mypower': return meterCond(c, 'self', 'powerPct');
    case 'power': return meterCond(c, 'target', 'powerPct');
    case 'rawpower':
    case 'myrawpower': return { ok: false, reason: MACRO_ROT_REFUSAL.rawPower };

    // ---- creature type: the metric IS a bitmask, so `type:Undead/Demon` is ONE condition --
    case 'type': {
      let mask = 0;
      for (const v of c.values) {
        const id = macroCreatureTypeId(v);
        if (id == null) return { ok: false, reason: MACRO_ROT_REFUSAL.unknownCond(`type:${v}`) };
        mask |= 1 << (id - 1);
      }
      if (!mask) return { ok: false, reason: MACRO_ROT_REFUSAL.unreadable };
      return one(cond('target', 'creatureTypeMask', '==', 1, mask));
    }

    // ---- cooldowns ----------------------------------------------------------------------
    // A rotation only fires a READY ability, so [nocooldown:<this spell>] is true by construction.
    case 'nocooldown': {
      const named = (c.values[0] ?? '').trim().toLowerCase();
      if (named && named === ctx.ownName.trim().toLowerCase()) return DROPPED;
      return { ok: false, reason: MACRO_ROT_REFUSAL.cooldownOther(c.values[0] ?? '?') };
    }
    case 'cooldown': return { ok: false, reason: MACRO_ROT_REFUSAL.cooldownOn };

    // ---- who is hitting whom ------------------------------------------------------------
    // `attacks:player` is unitIs(targettarget, player) — verbatim the targetAttackingMe metric.
    case 'attacks':
    case 'noattacks': {
      const ref = c.values[0] ? parseMacroUnit(c.values[0]) : { base: 'target' as const, hops: 0 };
      if (!ref) return { ok: false, reason: MACRO_ROT_REFUSAL.unreadable };
      if (ref.base !== 'player' || ref.hops > 0) {
        return { ok: false, reason: MACRO_ROT_REFUSAL.attacksOther(ref) };
      }
      return one(cond('self', 'targetAttackingMe', '==', c.key === 'attacks' ? 1 : 0));
    }

    // The parser's marker for a unit or number it could not read.
    case 'never': return { ok: false, reason: MACRO_ROT_REFUSAL.unreadable };
    default: return { ok: false, reason: MACRO_ROT_REFUSAL.unknownCond(c.key) };
  }
}

/** Cross-product of per-condition OR variants, capped. */
function combineVariants(perCond: Condition[][][]): Condition[][] {
  let out: Condition[][] = [[]];
  for (const variants of perCond) {
    const next: Condition[][] = [];
    for (const acc of out) {
      for (const v of variants) {
        next.push([...acc, ...v]);
        if (next.length >= MACRO_ROT_RULES_MAX) break;
      }
      if (next.length >= MACRO_ROT_RULES_MAX) break;
    }
    out = next;
  }
  return out;
}

interface CompileState {
  rules: RotationRule[];
  drops: string[];
  truncated: boolean;
  visiting: Set<string>;
  /** Monotonic suffix so every compiled rule id is unique and stable for a given body. */
  seq: number;
}

function note(state: CompileState, text: string): void {
  if (state.drops.length < 12 && !state.drops.includes(text)) state.drops.push(text);
}

function refuse(state: CompileState, lineNo: number, reason: string): void {
  note(state, `line ${lineNo}: ${reason}`);
}

/** Verbs a rotation can act on at all. Everything else is a keypress. */
const CASTING_VERBS: ReadonlySet<MacroVerb> = new Set<MacroVerb>(['cast', 'use']);
const AUTO_ATTACK_NAMES: ReadonlySet<string> = new Set(['attack', 'auto shot', 'shoot']);

/** The aim a `/cast` / `/use` group resolves to, or a refusal. Per group, not the whole clause. */
function compileAim(
  ref: MacroUnitRef | undefined,
  verb: MacroVerb,
): { ok: true; selfTarget: boolean } | { ok: false; reason: string } {
  if (!ref || (ref.base === 'target' && ref.hops === 0)) return { ok: true, selfTarget: false };
  if (ref.base === 'player' && ref.hops === 0) {
    // `/use [@player] Bandage` aims the item at you; a rotation item rule says that as target:'self'.
    if (verb === 'use') return { ok: true, selfTarget: true };
    return { ok: false, reason: MACRO_ROT_REFUSAL.selfCast };
  }
  return { ok: false, reason: MACRO_ROT_REFUSAL.aim(ref) };
}

/** The action a passing `/cast` / `/use` clause performs, or a refusal. */
function compileAction(
  verb: MacroVerb,
  clause: MacroClause,
  env: MacroExpandEnv,
  selfTarget: boolean,
): { ok: true; action: RuleAction; ownName: string } | { ok: false; reason: string } {
  if (verb === 'cast') {
    const { name, rank, subtext } = splitSpellRank(clause.arg);
    if (!name) return { ok: false, reason: MACRO_ROT_REFUSAL.noSpell(clause.arg) };
    if (AUTO_ATTACK_NAMES.has(name.toLowerCase())) {
      return { ok: false, reason: MACRO_ROT_REFUSAL.autoAttack };
    }
    const spell = env.resolveSpell(name, rank, subtext);
    if (!spell) return { ok: false, reason: MACRO_ROT_REFUSAL.noSpell(clause.arg) };
    return { ok: true, action: { kind: 'spell', spellId: spell.id }, ownName: name };
  }
  const item = env.resolveItem(clause.arg);
  if (!item) return { ok: false, reason: MACRO_ROT_REFUSAL.noItem(clause.arg) };
  return {
    ok: true,
    action: selfTarget
      ? { kind: 'item', itemEntry: item.entry, target: 'self' }
      : { kind: 'item', itemEntry: item.entry },
    ownName: item.name,
  };
}

function pushRule(
  state: CompileState,
  baseId: string,
  action: RuleAction,
  conditions: Condition[],
  after: RotationRule['after'],
): void {
  if (state.rules.length >= MACRO_ROT_RULES_MAX) {
    state.truncated = true;
    return;
  }
  state.rules.push({
    id: `${baseId}#${state.seq++}`,
    action,
    conditions,
    enabled: true,
    ...(after ? { after } : {}),
  });
}

/** One `;` branch -> zero or more rules. */
function compileClause(
  verb: MacroVerb,
  clause: MacroClause,
  lineNo: number,
  env: MacroExpandEnv,
  state: CompileState,
  depth: number,
  baseId: string,
  inherited: readonly Condition[],
  after: RotationRule['after'],
): void {
  // A `{Other}` call has no verb of its own: it runs another macro under this branch's guards.
  if (!clause.call && !CASTING_VERBS.has(verb)) {
    refuse(state, lineNo, MACRO_ROT_REFUSAL.verb(verb));
    return;
  }
  if (!clause.call && clause.noRecast) {
    refuse(state, lineNo, MACRO_ROT_REFUSAL.noRecast);
    return;
  }

  // No brackets is one empty group: "always, when ready".
  const groups = clause.groups.length ? clause.groups : [[]];
  for (const group of groups) {
    let action: RuleAction | null = null;
    let ownName = '';
    if (!clause.call) {
      const aim = compileAim(macroGroupUnit(group), verb);
      if (!aim.ok) {
        refuse(state, lineNo, aim.reason);
        continue;
      }
      const act = compileAction(verb, clause, env, aim.selfTarget);
      if (!act.ok) {
        refuse(state, lineNo, act.reason);
        continue;
      }
      action = act.action;
      ownName = act.ownName;
    }

    const ctx: CondCtx = { ownName, env };
    const perCond: Condition[][][] = [];
    let refused: string | null = null;
    for (const c of group) {
      const r = compileCond(c, ctx);
      if (!r.ok) { refused = r.reason; break; }
      perCond.push(r.variants);
    }
    // Groups OR, so one unreadable group does not kill the others - but it is still named.
    if (refused) {
      refuse(state, lineNo, refused);
      continue;
    }
    for (const variant of combineVariants(perCond)) {
      // The rule's own guard may be OR-joined, and (A and B or C) and V distributes: one compiled
      // rule per inherited group, each ANDing the macro's own conditions onto it.
      for (const group of (inherited.length ? conditionGroups(inherited) : [[]])) {
        const conditions = [...group.map(dropJoin), ...variant];
        if (clause.call) {
          compileCall(clause.call, lineNo, env, state, depth, conditions, after);
        } else if (action) {
          pushRule(state, baseId, action, conditions, after);
        }
      }
    }
  }
}

/** A compiled group is one flat AND list, so the `or` that started it has nothing left to join. */
function dropJoin(c: Condition): Condition {
  if (c.join == null) return c;
  const { join: _or, ...rest } = c;
  return rest;
}

/** `{Other}` - inline the called macro under the calling branch's conditions. */
function compileCall(
  name: string,
  lineNo: number,
  env: MacroExpandEnv,
  state: CompileState,
  depth: number,
  inherited: readonly Condition[],
  after: RotationRule['after'],
): void {
  if (depth + 1 > MACRO_DEPTH_MAX) {
    state.truncated = true;
    refuse(state, lineNo, MACRO_ROT_REFUSAL.depth);
    return;
  }
  const nested = env.macroByName(name);
  if (!nested) {
    refuse(state, lineNo, MACRO_ROT_REFUSAL.noMacro(name));
    return;
  }
  if (state.visiting.has(nested.id)) {
    refuse(state, lineNo, MACRO_ROT_REFUSAL.cycle(nested.name));
    return;
  }
  state.visiting.add(nested.id);
  compileBody(nested, env, state, depth + 1, inherited, after);
  state.visiting.delete(nested.id);
}

/** Walk one macro body: every line, each line's branches in order. */
function compileBody(
  def: MacroDef,
  env: MacroExpandEnv,
  state: CompileState,
  depth: number,
  inherited: readonly Condition[],
  after: RotationRule['after'],
): void {
  const program = parseMacroBody(def.body);
  for (const line of program.lines) {
    if (state.rules.length >= MACRO_ROT_RULES_MAX) {
      state.truncated = true;
      break;
    }
    for (const clause of line.clauses) {
      compileClause(line.verb, clause, line.n, env, state, depth, def.id, inherited, after);
    }
  }
}

// Compile one `{ kind: 'macro' }` rule. A rule that compiles to zero rules is an ERROR STATE for the caller
// to show (see rotationMacroRow.ts), never a silent no-op.
export function expandMacroRule(rule: RotationRule, env: MacroExpandEnv): MacroExpansion {
  if (rule.action.kind !== 'macro') return { rules: [rule], drops: [], truncated: false };
  const def = env.macroById(rule.action.macroId);
  const state: CompileState = {
    rules: [], drops: [], truncated: false, visiting: new Set(), seq: 0,
  };
  if (!def) {
    return {
      rules: [],
      drops: [MACRO_ROT_REFUSAL.noMacro(rule.action.macroId)],
      truncated: false,
    };
  }
  state.visiting.add(def.id);
  // The rule's own conditions are the player's extra guard on top of the macro's own.
  compileBody(def, env, state, 0, rule.conditions, rule.after);
  if (state.truncated) note(state, MACRO_ROT_REFUSAL.cap);
  return { rules: state.rules, drops: state.drops, truncated: state.truncated };
}

// Macro ids this rotation references, in phase order, deduped. Empty = the fast path: every caller of
// `rotationWithMacros` gets its rotation back untouched and pays nothing.
export function macroRuleIds(rot: Rotation): string[] {
  const out: string[] = [];
  const scan = (rules: readonly RotationRule[] | undefined): void => {
    for (const r of rules ?? []) {
      if (r.action.kind === 'macro' && !out.includes(r.action.macroId)) out.push(r.action.macroId);
    }
  };
  for (const phase of ROTATION_PHASES) scan(rot.phases[phase] ?? []);
  for (const list of Object.values(rot.overrides ?? {})) scan(list);
  return out;
}

// Every macro rule in a rotation, compiled in place. `drops` is keyed by the ORIGINAL rule id so the editor
// can put the refusals back on the row the player is looking at.
export function expandMacroRules(
  rot: Rotation,
  env: MacroExpandEnv,
): { rotation: Rotation; drops: ReadonlyMap<string, readonly string[]> } {
  const drops = new Map<string, readonly string[]>();
  if (!macroRuleIds(rot).length) return { rotation: rot, drops };
  const expandList = (rules: readonly RotationRule[]): RotationRule[] => {
    const out: RotationRule[] = [];
    for (const r of rules) {
      if (r.action.kind !== 'macro') { out.push(r); continue; }
      const ex = expandMacroRule(r, env);
      // A disabled macro rule contributes nothing, exactly like a disabled spell rule.
      if (r.enabled) out.push(...ex.rules);
      drops.set(r.id, ex.drops);
    }
    return out;
  };
  const phases = { ...rot.phases };
  for (const phase of ROTATION_PHASES) phases[phase] = expandList(rot.phases[phase] ?? []);
  let overrides = rot.overrides;
  if (overrides) {
    const next: Record<number, RotationRule[]> = {};
    for (const [entry, list] of Object.entries(overrides)) next[Number(entry)] = expandList(list);
    overrides = next;
  }
  return {
    rotation: { ...rot, phases: phases as Record<RotationPhase, RotationRule[]>, ...(overrides ? { overrides } : {}) },
    drops,
  };
}

// ---- memo -----------------------------------------------------------------------------------
// pickCombatAbility runs at 10 Hz, and a macro BODY edit makes no new Rotation — hence the signature.

interface MemoEntry { sig: string; out: Rotation }
const memo = new WeakMap<Rotation, MemoEntry>();
let expansions = 0;

/** Expansion count, for the smoke cost row. */
export function macroExpandStats(): { expansions: number } {
  return { expansions };
}

// The rotation as COMBAT sees it. Returns `rot` itself when it holds no macro rule, so every caller can use
// it unconditionally at zero cost.
export function rotationWithMacros(rot: Rotation, env: MacroExpandEnv): Rotation {
  const ids = macroRuleIds(rot);
  if (!ids.length) return rot;
  const sig = env.signature(ids);
  const hit = memo.get(rot);
  if (hit && hit.sig === sig) return hit.out;
  const { rotation } = expandMacroRules(rot, env);
  expansions++;
  memo.set(rot, { sig, out: rotation });
  return rotation;
}
