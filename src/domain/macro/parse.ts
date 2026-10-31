// Macro body -> a bounded program. Pure and TOTAL: any string parses and problems come back as
// issues. Fixed regexes only. The grammar follows the 1.12 client plus Roid-Macros.

import {
  MACRO_CLAUSES_MAX, MACRO_CONDS_MAX, MACRO_GROUPS_MAX, MACRO_LINES_MAX, MACRO_NAME_MAX,
} from './types.ts';
import { macroUnitToken, parseMacroUnit, type MacroUnitRef } from './units.ts';

export type MacroVerb =
  | 'cast' | 'use' | 'equip' | 'equipoh' | 'outfitter' | 'target'
  | 'petattack' | 'petfollow' | 'petstay'
  | 'startattack' | 'stopattack' | 'stopcasting' | 'unshift'
  | 'focus' | 'clearfocus';

/** One condition inside a `[…]` group. `values` are `/`-separated, `_` already read as space. */
export interface MacroCond {
  key: string;
  values: string[];
  /** Present for `key>N` / `key<N` (Roid's bigger=1 / 0). */
  cmp?: '>' | '<';
  amount?: number;
}

/** One `;` branch: OR-ed condition groups plus what to do when they pass. */
export interface MacroClause {
  /** `[a b][c]` → [[a,b],[c]]. Groups OR, conditions inside a group AND. */
  groups: MacroCond[][];
  // Last `@unit` in the clause (serialize / describe). Press and auto-combat read each group's own unit via
  // macroGroupUnit — a later `[harm]` does not inherit a sibling `@mouseover`.
  unit?: MacroUnitRef;
  /** Spell / item / macro-name argument, `!` and `{}` already stripped. */
  arg: string;
  // The argument when it is itself a unit (/target @targettarget) — the FINAL target. Separate from
  // `unit`, so `/target [harm @mouseover] Ragnaros` checks mouseover and selects Ragnaros.
  argUnit?: MacroUnitRef;
  /** `!Mind Flay` — skip while that channel / autorepeat is already running. */
  noRecast: boolean;
  /** `{Other}` — run that macro instead of casting `arg`. */
  call?: string;
}

export interface MacroLine {
  /** 1-based body line, so the editor can point at it. */
  n: number;
  verb: MacroVerb;
  clauses: MacroClause[];
}

export interface MacroParseIssue { line: number; message: string }

export type MacroTooltipDirective =
  | { kind: 'none' }
  | { kind: 'dynamic' }
  | { kind: 'named'; name: string };

export interface MacroProgram {
  tooltip: MacroTooltipDirective;
  lines: MacroLine[];
  issues: MacroParseIssue[];
}

/** Slash command -> verb. Aliases match what the client accepts. */
const VERBS: Record<string, MacroVerb> = {
  cast: 'cast',
  use: 'use',
  equip: 'equip',
  equipoh: 'equipoh',
  outfitter: 'outfitter',
  equipoffhand: 'equipoh',
  target: 'target',
  petattack: 'petattack',
  petfollow: 'petfollow',
  petstay: 'petstay',
  startattack: 'startattack',
  stopattack: 'stopattack',
  stopcasting: 'stopcasting',
  unshift: 'unshift',
  cancelform: 'unshift',
  focus: 'focus',
  clearfocus: 'clearfocus',
};

/** Commands that only exist from TBC on — named so the editor can say why, not just "unknown". */
const POST_VANILLA: Record<string, string> = {
  castsequence: '/castsequence is a TBC command; vanilla macros have no sequences',
  castrandom: '/castrandom is a TBC command',
  cancelaura: '/cancelaura is a TBC command; use /unshift for forms',
  click: '/click is not supported',
  run: '/run and /script are not supported: a macro is data here, not code',
  script: '/run and /script are not supported: a macro is data here, not code',
};

/** Verbs whose clause must name something (a spell, an item, a macro, or a unit). */
const NEEDS_ARG: ReadonlySet<MacroVerb> = new Set<MacroVerb>(['cast', 'use', 'equip', 'equipoh', 'outfitter', 'target']);
/** Verbs that read a unit from `@unit` or a bare unit token. */
const UNIT_VERBS: ReadonlySet<MacroVerb> = new Set<MacroVerb>(['target', 'focus', 'petattack']);

const SHOWTOOLTIP = '#showtooltip';

/** Split one condition group into at most MACRO_CONDS_MAX tokens (spaces or commas). */
function condTokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const t = raw.trim();
    if (!t) continue;
    out.push(t);
    if (out.length >= MACRO_CONDS_MAX) break;
  }
  return out;
}

/** `key:v1/v2` values: `_` reads as a space (Conditionals.lua:69 gsub "_" -> " "). */
function condValues(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('/')) {
    const v = raw.replace(/_/g, ' ').trim();
    if (v) out.push(v);
  }
  return out;
}

// Roid's FindDelimeter order: ':' wins, then '>', then '<' (Core.lua:58-79). `=` is accepted as a ':' alias
// so retail muscle memory (`[target=focus]`) parses too.
function splitCond(token: string): { key: string; rest: string; cmp?: '>' | '<' } {
  const colon = token.indexOf(':');
  if (colon >= 0) return { key: token.slice(0, colon), rest: token.slice(colon + 1) };
  const eq = token.indexOf('=');
  if (eq >= 0) return { key: token.slice(0, eq), rest: token.slice(eq + 1) };
  const gt = token.indexOf('>');
  if (gt >= 0) return { key: token.slice(0, gt), rest: token.slice(gt + 1), cmp: '>' };
  const lt = token.indexOf('<');
  if (lt >= 0) return { key: token.slice(0, lt), rest: token.slice(lt + 1), cmp: '<' };
  return { key: token, rest: '' };
}

interface GroupParse { groups: MacroCond[][]; unit?: MacroUnitRef; rest: string; issues: string[] }

/** Read the leading `[…]` groups off a clause. Unclosed bracket -> issue, rest is dropped. */
function parseGroups(text: string, lineNo: number): GroupParse {
  const groups: MacroCond[][] = [];
  const issues: string[] = [];
  let unit: MacroUnitRef | undefined;
  let s = text.trimStart();
  while (s.startsWith('[') && groups.length < MACRO_GROUPS_MAX) {
    const end = s.indexOf(']');
    if (end < 0) {
      issues.push('unclosed [ in the conditions');
      return { groups, unit, rest: '', issues };
    }
    const body = s.slice(1, end);
    s = s.slice(end + 1).trimStart();
    const conds: MacroCond[] = [];
    for (const token of condTokens(body)) {
      if (token.startsWith('@')) {
        const u = parseMacroUnit(token.slice(1));
        if (!u) {
          issues.push(`unknown unit "${token}"`);
          // A named-but-unknown unit must never silently become "the current target".
          conds.push({ key: 'never', values: [] });
          continue;
        }
        unit = u;
        conds.push({ key: 'target', values: [macroUnitToken(u)] });
        continue;
      }
      const { key, rest, cmp } = splitCond(token);
      const low = key.trim().toLowerCase();
      if (!low) continue;
      if (cmp) {
        const amount = Number(rest);
        if (!Number.isFinite(amount)) {
          issues.push(`"${token}" needs a number after ${cmp}`);
          conds.push({ key: 'never', values: [] });
          continue;
        }
        conds.push({ key: low, values: [], cmp, amount });
        continue;
      }
      const values = condValues(rest);
      if (low === 'target') {
        const u = values[0] ? parseMacroUnit(values[0]) : null;
        if (u) unit = u;
        else if (values.length) {
          issues.push(`unknown unit "${values[0]}"`);
          conds.push({ key: 'never', values: [] });
          continue;
        }
      }
      conds.push({ key: low, values });
      if (conds.length >= MACRO_CONDS_MAX) break;
    }
    groups.push(conds);
  }
  // A 5th group is silently ignored by the caps; say so rather than change the meaning quietly.
  if (s.startsWith('[')) issues.push(`only ${MACRO_GROUPS_MAX} condition groups per line are read`);
  void lineNo;
  return { groups, unit, rest: s, issues };
}

/** One `;` branch -> clause. `!arg` and `{Macro}` are read off the argument here. */
function parseClause(text: string, verb: MacroVerb, lineNo: number): { clause: MacroClause; issues: string[] } {
  const g = parseGroups(text, lineNo);
  const issues = [...g.issues];
  let arg = g.rest.trim();
  let noRecast = false;
  let call: string | undefined;
  if (arg.startsWith('!')) {
    noRecast = true;
    arg = arg.slice(1).trim();
  }
  if (arg.startsWith('{')) {
    const end = arg.indexOf('}');
    if (end < 0) issues.push('unclosed { in the macro name');
    else {
      call = arg.slice(1, end).trim().slice(0, MACRO_NAME_MAX);
      arg = '';
      if (!call) issues.push('{} needs a macro name');
    }
  }
  const unit = g.unit;
  // The argument may name the FINAL target. An `@` always parses as a unit; a bare word only for
  // the unit verbs, so a mob called "Target Dummy" stays a name. Cite: Core.lua:305-311.
  let argUnit: MacroUnitRef | undefined;
  if (arg) {
    const asUnit = arg.startsWith('@') || UNIT_VERBS.has(verb) ? parseMacroUnit(arg) : null;
    if (asUnit) {
      argUnit = asUnit;
      arg = '';
    } else if (arg.startsWith('@')) {
      issues.push(`unknown unit "${arg}"`);
      arg = '';
    }
  }
  // Only complain about a missing argument when the conditions parsed cleanly — an unclosed
  // bracket already ate the rest of the line, and two messages for one typo is noise.
  if (NEEDS_ARG.has(verb) && !arg && !call && !argUnit && !unit && !issues.length) {
    issues.push(`/${verb} needs something to act on`);
  }
  return { clause: { groups: g.groups, unit, argUnit, arg, noRecast, call }, issues };
}

/** `@unit` for this one `[…]` group. Later groups do not inherit a sibling's unit. */
export function macroGroupUnit(group: readonly MacroCond[]): MacroUnitRef | undefined {
  let ref: MacroUnitRef | undefined;
  for (const cond of group) {
    if (cond.key !== 'target' || !cond.values[0]) continue;
    const u = parseMacroUnit(cond.values[0]);
    if (u) ref = u;
  }
  return ref;
}

// Parse a macro body. Never throws; caps every dimension (16 lines, 8 branches, 4 groups, 8 conditions) so
// a hand-edited 255-char body cannot produce unbounded work at press time.
export function parseMacroBody(body: string): MacroProgram {
  const issues: MacroParseIssue[] = [];
  const lines: MacroLine[] = [];
  let tooltip: MacroTooltipDirective = { kind: 'none' };
  const raw = typeof body === 'string' ? body.replace(/\r\n?/g, '\n') : '';
  const src = raw.split('\n');
  const count = Math.min(src.length, MACRO_LINES_MAX);
  if (src.length > MACRO_LINES_MAX) {
    issues.push({ line: MACRO_LINES_MAX + 1, message: `only the first ${MACRO_LINES_MAX} lines run` });
  }
  for (let i = 0; i < count; i++) {
    const lineNo = i + 1;
    const line = src[i]!.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const low = line.toLowerCase();
      if (tooltip.kind === 'none' && low.startsWith(SHOWTOOLTIP)) {
        const rest = line.slice(SHOWTOOLTIP.length).trim();
        tooltip = rest ? { kind: 'named', name: rest } : { kind: 'dynamic' };
      }
      continue;
    }
    if (!line.startsWith('/')) {
      issues.push({ line: lineNo, message: 'a macro line starts with a / command' });
      continue;
    }
    const sp = line.search(/\s/);
    const verbRaw = (sp < 0 ? line.slice(1) : line.slice(1, sp)).toLowerCase();
    const rest = sp < 0 ? '' : line.slice(sp + 1);
    const verb = VERBS[verbRaw];
    if (!verb) {
      issues.push({
        line: lineNo,
        message: POST_VANILLA[verbRaw] ?? `unknown command /${verbRaw}`,
      });
      continue;
    }
    const clauses: MacroClause[] = [];
    const branches = rest.split(';');
    const take = Math.min(branches.length, MACRO_CLAUSES_MAX);
    if (branches.length > MACRO_CLAUSES_MAX) {
      issues.push({ line: lineNo, message: `only ${MACRO_CLAUSES_MAX} ";" branches per line run` });
    }
    for (let b = 0; b < take; b++) {
      const text = branches[b]!;
      // `/stopcasting` and friends take no argument: one empty clause still has to run.
      if (!text.trim() && (b > 0 || NEEDS_ARG.has(verb))) continue;
      const { clause, issues: cIssues } = parseClause(text, verb, lineNo);
      for (const m of cIssues) issues.push({ line: lineNo, message: m });
      clauses.push(clause);
    }
    if (!clauses.length) {
      if (NEEDS_ARG.has(verb)) {
        issues.push({ line: lineNo, message: `/${verb} needs something to act on` });
        continue;
      }
      clauses.push({ groups: [], arg: '', noRecast: false });
    }
    lines.push({ n: lineNo, verb, clauses });
  }
  return { tooltip, lines, issues };
}
