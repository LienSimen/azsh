// The one choke point every macro boundary runs: save load, validateSave, save/delete and each
// press. Total functions that never throw — a tampered store becomes a legal, possibly empty list.

import {
  MACROS_PER_SCOPE, MACRO_BODY_MAX, MACRO_ICON_FALLBACK, MACRO_LINES_MAX, MACRO_NAME_MAX,
  isMacroId, macroScopeOf, macroScopePrefix, type MacroDef, type MacroScope,
} from './types.ts';

/** Printable-only, single line, clamped to the client's 16-char name box. */
export function sanitizeMacroName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0)!;
    // Drop C0/C1 controls (incl. newlines) so a name can never break a row or a label.
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    out += ch;
    if (out.length >= MACRO_NAME_MAX) break;
  }
  return out.trim().slice(0, MACRO_NAME_MAX);
}

/** Keeps newlines (a body is multi-line), drops other controls, clamps chars AND lines. */
export function sanitizeMacroBody(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const unified = raw.replace(/\r\n?/g, '\n');
  let out = '';
  for (const ch of unified) {
    const code = ch.codePointAt(0)!;
    if (code !== 0x0a && (code < 0x20 || (code >= 0x7f && code <= 0x9f))) continue;
    out += ch;
    if (out.length >= MACRO_BODY_MAX) break;
  }
  const lines = out.split('\n');
  return (lines.length > MACRO_LINES_MAX ? lines.slice(0, MACRO_LINES_MAX) : lines)
    .join('\n')
    .slice(0, MACRO_BODY_MAX);
}

// An icon is a basename under /icons — never a path, never a URL. Anything else becomes the question mark,
// so a tampered icon cannot point an <img src> anywhere off-origin.
export function sanitizeMacroIcon(raw: unknown): string {
  if (typeof raw !== 'string') return MACRO_ICON_FALLBACK;
  const low = raw.trim().toLowerCase();
  if (!low || low.length > 64) return MACRO_ICON_FALLBACK;
  return /^[a-z0-9_]+$/.test(low) ? low : MACRO_ICON_FALLBACK;
}

// Adopt one untrusted macro. `id` is kept only when well-formed AND in `scope`; callers needing a
// fresh id pass keepId: false. A macro with no name is not a macro, so it returns null.
export function normalizeMacro(
  raw: unknown,
  scope: MacroScope,
  opts: { keepId?: boolean } = {},
): MacroDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = sanitizeMacroName(r.name);
  if (!name) return null;
  const keepId = opts.keepId !== false;
  const id = keepId && isMacroId(r.id) && macroScopeOf(r.id as string) === scope
    ? (r.id as string)
    : '';
  return { id, name, icon: sanitizeMacroIcon(r.icon), body: sanitizeMacroBody(r.body) };
}

// Adopt an untrusted macro LIST for one scope: drops junk rows, re-issues missing/duplicate/ cross-scope
// ids in list order, and caps the list at 18. Idempotent.
export function normalizeMacros(raw: unknown, scope: MacroScope): MacroDef[] {
  if (!Array.isArray(raw)) return [];
  const out: MacroDef[] = [];
  const used = new Set<string>();
  const pending: MacroDef[] = [];
  for (const row of raw) {
    if (out.length + pending.length >= MACROS_PER_SCOPE) break;
    const def = normalizeMacro(row, scope);
    if (!def) continue;
    if (def.id && !used.has(def.id)) {
      used.add(def.id);
      out.push(def);
    } else {
      pending.push({ ...def, id: '' });
    }
  }
  // Second pass keeps original list ORDER while handing the id-less rows the free slots.
  const p = macroScopePrefix(scope);
  let next = 1;
  for (const def of pending) {
    while (next <= MACROS_PER_SCOPE && used.has(`${p}${next}`)) next++;
    if (next > MACROS_PER_SCOPE) break;
    const id = `${p}${next}`;
    used.add(id);
    out.push({ ...def, id });
  }
  // Restore the caller's order: rows that already had ids kept their place above, so sort by
  // the index they appeared at. Cheap and stable for <= 18 rows.
  const orderOf = new Map<MacroDef, number>();
  let i = 0;
  for (const row of raw) {
    const def = out.find((d) => !orderOf.has(d) && sameSource(d, row));
    if (def) orderOf.set(def, i);
    i++;
  }
  return out.sort((a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0));
}

/** Row identity for order restoration: name + body is enough for <= 18 hand-made macros. */
function sameSource(def: MacroDef, raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return sanitizeMacroName(r.name) === def.name && sanitizeMacroBody(r.body) === def.body;
}
