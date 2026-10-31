// Text surgery for the builder: every operation takes a macro BODY and returns a new body, so the
// text stays the single stored form. Only the edited line is re-serialized.

import { MACRO_BODY_MAX, MACRO_LINES_MAX } from './types.ts';
import { parseMacroBody, type MacroClause, type MacroCond, type MacroLine, type MacroVerb } from './parse.ts';
import { macroUnitToken, type MacroUnitRef } from './units.ts';

/** Body -> raw lines, newlines normalized. Never trimmed: a blank last line is the player's. */
export function macroBodyLines(body: string): string[] {
  return String(body ?? '').replace(/\r\n?/g, '\n').split('\n');
}

const joinLines = (lines: readonly string[]): string =>
  lines.slice(0, MACRO_LINES_MAX).join('\n').slice(0, MACRO_BODY_MAX);

/** Serialize one condition back to macro text. */
export function serializeMacroCond(cond: MacroCond): string {
  if (cond.cmp != null && cond.amount != null) return `${cond.key}${cond.cmp}${cond.amount}`;
  if (!cond.values.length) return cond.key;
  // Spaces are underscores inside a condition value (Conditionals.lua:69).
  return `${cond.key}:${cond.values.map((v) => v.replace(/ /g, '_')).join('/')}`;
}

/** Serialize one `;` branch: `[@unit conds][conds] argument`. */
export function serializeMacroClause(clause: MacroClause): string {
  const groups = clause.groups.map((group, gi) => {
    const tokens: string[] = [];
    // `@unit` rides in the first group, and its mirror `target:` condition is not written twice.
    if (gi === 0 && clause.unit) tokens.push(`@${macroUnitToken(clause.unit)}`);
    for (const cond of group) {
      if (cond.key === 'target') continue;
      tokens.push(serializeMacroCond(cond));
    }
    return tokens.length ? `[${tokens.join(' ')}]` : '';
  }).filter(Boolean).join('');
  // A clause can carry a unit with no conditions at all (`/cast [@mouseover] Heal`).
  const head = groups || (clause.unit ? `[@${macroUnitToken(clause.unit)}]` : '');
  const argText = clause.call
    ? `{${clause.call}}`
    : clause.argUnit
      ? `@${macroUnitToken(clause.argUnit)}`
      : clause.arg;
  const bang = clause.noRecast ? '!' : '';
  const body = `${bang}${argText}`;
  if (!head) return body;
  return body ? `${head} ${body}` : head;
}

/** Serialize a whole line back to macro text. */
export function serializeMacroLine(line: MacroLine): string {
  const clauses = line.clauses.map(serializeMacroClause).filter((t, i) => t !== '' || i === 0);
  return `/${line.verb}${clauses.length && clauses[0] !== '' ? ` ${clauses.join('; ')}` : ''}`;
}

/** Parse ONE raw line (index into the body's lines), or null when it is not a command line. */
export function parseMacroLineAt(body: string, index: number): MacroLine | null {
  const raw = macroBodyLines(body)[index];
  if (raw == null) return null;
  const prog = parseMacroBody(raw);
  return prog.lines[0] ?? null;
}

/** Every command line in a body, with the raw index it came from (for row editing). */
export function macroCommandLines(body: string): Array<{ index: number; line: MacroLine }> {
  const out: Array<{ index: number; line: MacroLine }> = [];
  const raws = macroBodyLines(body);
  for (let i = 0; i < raws.length; i++) {
    const line = parseMacroLineAt(body, i);
    if (line) out.push({ index: i, line: { ...line, n: i + 1 } });
  }
  return out;
}

/** Replace one raw line. */
export function setMacroLineText(body: string, index: number, text: string): string {
  const lines = macroBodyLines(body);
  if (index < 0 || index >= lines.length) return body;
  lines[index] = text;
  return joinLines(lines);
}

/** Rewrite a line from its structure (the builder's workhorse). */
function writeLine(body: string, index: number, mutate: (line: MacroLine) => void): string {
  const line = parseMacroLineAt(body, index);
  if (!line) return body;
  mutate(line);
  return setMacroLineText(body, index, serializeMacroLine(line));
}

/** Append a line. A body ending in a blank line fills that instead of growing another. */
export function appendMacroLine(body: string, text: string): string {
  const lines = macroBodyLines(body);
  if (lines.length && lines[lines.length - 1]!.trim() === '') lines[lines.length - 1] = text;
  else lines.push(text);
  return joinLines(lines);
}

export function deleteMacroLine(body: string, index: number): string {
  const lines = macroBodyLines(body);
  if (index < 0 || index >= lines.length) return body;
  lines.splice(index, 1);
  return joinLines(lines);
}

/** Move a line up (-1) or down (+1). */
export function moveMacroLine(body: string, index: number, delta: number): string {
  const lines = macroBodyLines(body);
  const to = index + delta;
  if (index < 0 || index >= lines.length || to < 0 || to >= lines.length) return body;
  const [row] = lines.splice(index, 1);
  lines.splice(to, 0, row!);
  return joinLines(lines);
}

export function setMacroLineVerb(body: string, index: number, verb: MacroVerb): string {
  return writeLine(body, index, (line) => { line.verb = verb; });
}

/** Set a branch's argument (a spell / item / mob name). Clears a unit argument. */
export function setMacroBranchArg(body: string, index: number, branch: number, arg: string): string {
  return writeLine(body, index, (line) => {
    const c = line.clauses[branch];
    if (!c) return;
    c.arg = arg;
    c.call = undefined;
    c.argUnit = undefined;
  });
}

/** Point a branch's ACTION at a unit (`/target @focus`), or clear it with null. */
export function setMacroBranchArgUnit(
  body: string,
  index: number,
  branch: number,
  ref: MacroUnitRef | null,
): string {
  return writeLine(body, index, (line) => {
    const c = line.clauses[branch];
    if (!c) return;
    c.argUnit = ref ?? undefined;
    if (ref) { c.arg = ''; c.call = undefined; }
  });
}

/** Aim a branch at a unit (`[@mouseover]`), or clear the aim with null. */
export function setMacroBranchUnit(
  body: string,
  index: number,
  branch: number,
  ref: MacroUnitRef | null,
): string {
  return writeLine(body, index, (line) => {
    const c = line.clauses[branch];
    if (!c) return;
    c.unit = ref ?? undefined;
    // Drop the parser's mirrored `target:` condition so it cannot contradict the new aim.
    for (const g of c.groups) {
      for (let i = g.length - 1; i >= 0; i--) if (g[i]!.key === 'target') g.splice(i, 1);
    }
  });
}

/** Toggle `!` (do not re-cast a running channel / auto-attack) on a branch. */
export function toggleMacroBranchNoRecast(body: string, index: number, branch: number): string {
  return writeLine(body, index, (line) => {
    const c = line.clauses[branch];
    if (c) c.noRecast = !c.noRecast;
  });
}

/** Add a condition to a branch's first group (creating the group when there is none). */
export function addMacroCond(body: string, index: number, branch: number, cond: MacroCond): string {
  return writeLine(body, index, (line) => {
    const c = line.clauses[branch];
    if (!c) return;
    if (!c.groups.length) c.groups.push([]);
    const group = c.groups[0]!;
    // One condition of a kind per group: tapping "in combat" twice must not write it twice.
    const at = group.findIndex((x) => x.key === cond.key);
    if (at >= 0) group[at] = cond;
    else group.push(cond);
  });
}

/** Remove every condition with this key from a branch. */
export function removeMacroCond(body: string, index: number, branch: number, key: string): string {
  return writeLine(body, index, (line) => {
    const c = line.clauses[branch];
    if (!c) return;
    for (const g of c.groups) {
      for (let i = g.length - 1; i >= 0; i--) if (g[i]!.key === key) g.splice(i, 1);
    }
    // An emptied group would serialize as `[]`.
    c.groups = c.groups.filter((g) => g.length > 0);
  });
}

// Append a `; branch` to a line. The argument is REQUIRED — a blank branch does not survive
// serialization, so Build mode would show a row the text does not have.
export function addMacroBranch(body: string, index: number, arg: string): string {
  if (!String(arg ?? '').trim()) return body;
  return writeLine(body, index, (line) => {
    line.clauses.push({ groups: [], arg, noRecast: false });
  });
}

export function deleteMacroBranch(body: string, index: number, branch: number): string {
  return writeLine(body, index, (line) => {
    if (line.clauses.length > 1) line.clauses.splice(branch, 1);
  });
}

/** `#showtooltip` on/off (bare form). Always the first line, like the client's own macros. */
export function setMacroShowTooltip(body: string, on: boolean): string {
  const lines = macroBodyLines(body).filter((l) => !/^\s*#showtooltip\b/i.test(l));
  if (on) lines.unshift('#showtooltip');
  return joinLines(lines);
}

export function macroHasShowTooltip(body: string): boolean {
  return macroBodyLines(body).some((l) => /^\s*#showtooltip\b/i.test(l));
}

// What the client's own helper does: append `/cast <name>`, and give a bare macro a #showtooltip
// so the button immediately shows what it will fire. Cite: GlobalStrings.lua:2644.
export function appendMacroCast(body: string, spellName: string): string {
  const name = String(spellName ?? '').trim();
  if (!name) return body;
  const withTip = body.trim() ? body : '#showtooltip';
  return appendMacroLine(withTip, `/cast ${name}`);
}

/** Same, for an item (`/use <name>`). */
export function appendMacroUse(body: string, itemName: string): string {
  const name = String(itemName ?? '').trim();
  if (!name) return body;
  const withTip = body.trim() ? body : '#showtooltip';
  return appendMacroLine(withTip, `/use ${name}`);
}
