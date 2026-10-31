// Macro press -> a resolved, bounded list of steps. Pure: this decides WHAT should happen and a
// host makes it happen. One deviation: an unusable name FAILS its branch rather than consuming it.

import { firstPassingGroup } from './conditions.ts';
import { parseMacroBody, type MacroClause, type MacroProgram, type MacroVerb } from './parse.ts';
import { splitSpellRank, type MacroSnapshot, type MacroUnitSnap } from './snapshot.ts';
import { MACRO_DEPTH_MAX, MACRO_STEP_BUDGET, type MacroDef } from './types.ts';
import { MACRO_UNIT_PLAYER, MACRO_UNIT_TARGET, type MacroUnitRef } from './units.ts';
import { describeMacroInvSlot, macroInvSlotName } from './slots.ts';

export type MacroStep =
  // `unit` here is the FINAL target (docs/commands/target.md), not the checked one.
  | { kind: 'target'; unit?: MacroUnitRef; name?: string }
  | { kind: 'focus'; unit: MacroUnitRef }
  | { kind: 'clearfocus' }
  | { kind: 'cast'; spellId: number; name: string; unit?: MacroUnitRef }
  // `slot` is set when the argument named a paperdoll place (`/use 13`), so the press can say which.
  | { kind: 'use'; entry: number; name: string; slot?: string; unit?: MacroUnitRef }
  | { kind: 'equip'; entry: number; name: string; offhand: boolean }
  | { kind: 'outfitter'; action: 'wear' | 'unwear' | 'toggle'; name: string }
  | { kind: 'petattack'; unit?: MacroUnitRef }
  | { kind: 'petfollow' }
  | { kind: 'petstay' }
  | { kind: 'startattack' }
  | { kind: 'stopattack' }
  | { kind: 'stopcasting' }
  | { kind: 'unshift' };

export type MacroTooltip =
  | { kind: 'spell'; id: number; icon?: string; name: string }
  | { kind: 'item'; entry: number; icon?: string; name: string }
  | null;

export interface MacroPlan {
  steps: readonly MacroStep[];
  /** `#showtooltip` result — what the button should draw and name. */
  tooltip: MacroTooltip;
  /** Short player-readable reasons a branch did nothing (editor preview + press feedback). */
  refusals: readonly string[];
  /** A cap was hit (step budget or `{macro}` depth). */
  truncated: boolean;
}

export interface MacroPlanEnv {
  snapshot: MacroSnapshot;
  /** Look a `{Name}` macro up across both scopes (character first, like the client's list). */
  lookupMacro(name: string): MacroDef | null;
}

interface RunState {
  steps: MacroStep[];
  refusals: string[];
  truncated: boolean;
  // One spell that costs the global cooldown per press, exactly as the server counts it:
  // Player.cpp:20072-20074 adds no GCD when StartRecoveryCategory and StartRecoveryTime are both
  // 0, so Arcane Power and Presence of Mind do not block the Pyroblast behind them.
  gcdTaken: boolean;
  visiting: Set<string>;
}

/** Default aim when a `[…]` group has no `@unit`: the current target, else self. */
function defaultUnit(snap: MacroSnapshot): MacroUnitSnap | null {
  const t = snap.unit(MACRO_UNIT_TARGET);
  if (t) return t;
  return snap.autoSelfCast ? snap.unit(MACRO_UNIT_PLAYER) : null;
}

/** `!Attack` / `!Auto Shot` / `!Shoot` and `!Spell` — is that thing already running? */
function alreadyRunning(name: string, snap: MacroSnapshot): boolean {
  const low = name.toLowerCase();
  const ch = snap.channel;
  if (low === 'attack') return ch.autoAttack;
  if (low === 'auto shot') return ch.autoShot;
  if (low === 'shoot') return ch.wand;
  if (!ch.spellName) return false;
  // Roid strips the "(Rank X)" from both sides so down-ranking still matches.
  return splitSpellRank(ch.spellName).name.toLowerCase() === splitSpellRank(name).name.toLowerCase();
}

const AUTO_ATTACK_NAMES: ReadonlySet<string> = new Set(['attack', 'auto shot', 'shoot']);

function pushStep(state: RunState, step: MacroStep): boolean {
  if (state.steps.length >= MACRO_STEP_BUDGET) {
    state.truncated = true;
    return false;
  }
  state.steps.push(step);
  return true;
}

function refuse(state: RunState, message: string): false {
  if (state.refusals.length < 8 && !state.refusals.includes(message)) state.refusals.push(message);
  return false;
}

/** Emit the step(s) for one passing clause. False = this branch did nothing, try the next. */
function emit(
  verb: MacroVerb,
  clause: MacroClause,
  env: MacroPlanEnv,
  state: RunState,
  depth: number,
  groupUnit?: MacroUnitRef,
): boolean {
  const { snapshot: snap } = env;
  if (clause.call) {
    if (depth + 1 > MACRO_DEPTH_MAX) {
      state.truncated = true;
      return refuse(state, `macros nest at most ${MACRO_DEPTH_MAX} deep`);
    }
    const nested = env.lookupMacro(clause.call);
    if (!nested) return refuse(state, `no macro named "${clause.call}"`);
    if (state.visiting.has(nested.id)) return refuse(state, `macro "${nested.name}" calls itself`);
    state.visiting.add(nested.id);
    const acted = runProgram(nested, env, state, depth + 1);
    state.visiting.delete(nested.id);
    return acted;
  }

  switch (verb) {
    case 'cast': {
      const { name, rank, subtext } = splitSpellRank(clause.arg);
      if (!name) return false;
      if (clause.noRecast && alreadyRunning(name, snap)) return false;
      if (AUTO_ATTACK_NAMES.has(name.toLowerCase())) return pushStep(state, { kind: 'startattack' });
      const spell = snap.resolveSpell(name, rank, subtext);
      if (!spell) return refuse(state, `you have no usable spell "${clause.arg}"`);
      // An unsourced gcdMs counts as on-GCD: never let a missing field widen what a press does.
      const onGcd = (spell.gcdMs ?? 1500) > 0;
      if (onGcd && state.gcdTaken) {
        refuse(state, 'only one spell that costs the global cooldown can fire per press');
        return true;
      }
      if (!pushStep(state, {
        kind: 'cast', spellId: spell.id, name: spell.name, unit: clause.argUnit ?? groupUnit,
      })) {
        return false;
      }
      if (onGcd) state.gcdTaken = true;
      return true;
    }
    case 'use': {
      const item = snap.resolveItem(clause.arg);
      if (!item) {
        const slot = describeMacroInvSlot(clause.arg);
        if (slot) return refuse(state, `nothing equipped in ${slot}`);
        const named = macroInvSlotName(clause.arg);
        if (named) return refuse(state, `this character has no ${named} slot`);
        return refuse(state, `you are not carrying "${clause.arg}"`);
      }
      if (clause.noRecast && alreadyRunning(item.name, snap)) return false;
      // An item use never touches gcdUntil in this engine (itemUse.ts), so it neither waits for
      // the global cooldown nor spends it: every /use in a macro fires on the one press.
      if (!pushStep(state, {
        kind: 'use',
        entry: item.entry,
        name: item.name,
        slot: describeMacroInvSlot(clause.arg) ?? undefined,
        unit: clause.argUnit ?? groupUnit,
      })) {
        return false;
      }
      return true;
    }
    case 'outfitter': {
      const parsed = /^((?:wear|unwear|toggle)\s+)?(.+)$/i.exec(clause.arg.trim());
      if (!parsed?.[2]) return refuse(state, '/outfitter needs wear|unwear|toggle name');
      const action = (parsed[1] ? parsed[1].trim().toLowerCase() : 'wear') as 'wear' | 'unwear' | 'toggle';
      return pushStep(state, { kind: 'outfitter', action, name: parsed[2].trim() });
    }
    case 'equip':
    case 'equipoh': {
      const item = snap.resolveItem(clause.arg);
      if (!item) return refuse(state, `you are not carrying "${clause.arg}"`);
      return pushStep(state, {
        kind: 'equip', entry: item.entry, name: item.name, offhand: verb === 'equipoh',
      });
    }
    case 'target': {
      // FINAL target: the argument. The bracket's `@unit` only decided whether we got here.
      if (clause.argUnit) return pushStep(state, { kind: 'target', unit: clause.argUnit });
      if (clause.arg) return pushStep(state, { kind: 'target', name: clause.arg });
      // `/target [harm @mouseover]` with no argument: select the unit we just checked.
      if (groupUnit) return pushStep(state, { kind: 'target', unit: groupUnit });
      if (clause.unit) return pushStep(state, { kind: 'target', unit: clause.unit });
      return false;
    }
    case 'focus':
      return pushStep(state, {
        kind: 'focus', unit: clause.argUnit ?? groupUnit ?? clause.unit ?? MACRO_UNIT_TARGET,
      });
    case 'clearfocus':
      return pushStep(state, { kind: 'clearfocus' });
    case 'petattack':
      return pushStep(state, { kind: 'petattack', unit: clause.argUnit ?? groupUnit ?? clause.unit });
    case 'petfollow':
      return pushStep(state, { kind: 'petfollow' });
    case 'petstay':
      return pushStep(state, { kind: 'petstay' });
    case 'startattack':
      return pushStep(state, { kind: 'startattack' });
    case 'stopattack':
      return pushStep(state, { kind: 'stopattack' });
    case 'stopcasting':
      return pushStep(state, { kind: 'stopcasting' });
    case 'unshift':
      return pushStep(state, { kind: 'unshift' });
    default:
      return false;
  }
}

/** Walk one macro body: every line runs, each line takes its first working branch. */
function runProgram(
  def: MacroDef,
  env: MacroPlanEnv,
  state: RunState,
  depth: number,
  parsed?: MacroProgram,
): boolean {
  // The caller may already have the program (planMacro parses once and uses it twice).
  const program = parsed ?? parseMacroBody(def.body);
  let acted = false;
  for (const line of program.lines) {
    if (state.steps.length >= MACRO_STEP_BUDGET) {
      state.truncated = true;
      break;
    }
    for (const clause of line.clauses) {
      const passing = firstPassingGroup(clause.groups, defaultUnit(env.snapshot), env.snapshot);
      if (!passing) continue;
      if (emit(line.verb, clause, env, state, depth, passing.unitRef)) {
        acted = true;
        break;
      }
    }
  }
  return acted;
}

// Bare #showtooltip shows what the macro would do; with a name it shows that thing. The bare form
// prefers the step actually resolved this press, so an unmet condition does not blank the button.
function resolveTooltip(
  program: MacroProgram,
  steps: readonly MacroStep[],
  snap: MacroSnapshot,
): MacroTooltip {
  const fromName = (raw: string): MacroTooltip => {
    const { name, rank, subtext } = splitSpellRank(raw);
    const spell = snap.resolveSpell(name, rank, subtext);
    if (spell) return { kind: 'spell', id: spell.id, icon: spell.icon, name: spell.name };
    const item = snap.resolveItem(raw);
    if (item) return { kind: 'item', entry: item.entry, icon: item.icon, name: item.name };
    return null;
  };
  if (program.tooltip.kind === 'named') return fromName(program.tooltip.name);
  if (program.tooltip.kind !== 'dynamic') return null;
  for (const s of steps) {
    if (s.kind === 'cast') {
      const sp = snap.resolveSpell(s.name);
      return { kind: 'spell', id: s.spellId, icon: sp?.icon, name: s.name };
    }
    if (s.kind === 'use') {
      const it = snap.resolveItem(s.name);
      return { kind: 'item', entry: s.entry, icon: it?.icon, name: s.name };
    }
  }
  for (const line of program.lines) {
    if (line.verb !== 'cast' && line.verb !== 'use') continue;
    for (const clause of line.clauses) {
      if (!clause.arg) continue;
      const tip = fromName(clause.arg);
      if (tip) return tip;
    }
  }
  return null;
}

/** Resolve one macro press against a snapshot. Never throws; always bounded. */
export function planMacro(def: MacroDef, env: MacroPlanEnv): MacroPlan {
  const state: RunState = {
    steps: [], refusals: [], truncated: false, gcdTaken: false, visiting: new Set([def.id]),
  };
  const program = parseMacroBody(def.body);
  runProgram(def, env, state, 0, program);
  const tooltip = resolveTooltip(program, state.steps, env.snapshot);
  return { steps: state.steps, tooltip, refusals: state.refusals, truncated: state.truncated };
}
