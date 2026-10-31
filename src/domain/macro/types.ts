// Macro model and the caps that bound every macro path. The client's WRITING limits are 2006 frame
// sizes and are deliberately exceeded; the WORK limits are ours and stay tight. Pure data.

/** Macros per scope (two scopes = 72). The client's own frame held 18: Blizzard_MacroUI.lua:1. */
export const MACROS_PER_SCOPE = 36;
/** Name length. The client's popup box took 16: Blizzard_MacroUI.xml:697. */
export const MACRO_NAME_MAX = 24;
/** Body length. The client's edit box took 255: Blizzard_MacroUI.xml:406. */
export const MACRO_BODY_MAX = 2048;
/** Lines a body may run. A 2 KB body can hold more than the old 16. */
export const MACRO_LINES_MAX = 32;
/** Ours: `;` branches per line (the ranged-weapon example in docs/conditions/equipped.md uses 4). */
export const MACRO_CLAUSES_MAX = 12;
/** Ours: conditions inside one `[…]` group. */
export const MACRO_CONDS_MAX = 8;
/** Ours: `[a][b]` OR-groups per clause. */
export const MACRO_GROUPS_MAX = 4;
/** Ours: `{Other}` nesting depth. Roid recurses unbounded (Core.lua:236-241). */
export const MACRO_DEPTH_MAX = 3;
/** Ours: resolved steps per press, across the whole call tree. */
export const MACRO_STEP_BUDGET = 32;

/** WoW's default macro icon. Same basename icons.ts ships as its FALLBACK. */
export const MACRO_ICON_FALLBACK = 'inv_misc_questionmark';

/** Account-wide ("General" tab) or this character only. Cite: Blizzard_MacroUI.lua:31/:41. */
export type MacroScope = 'account' | 'character';

/** One macro. `icon` is an icon basename under /icons; `body` is the raw macro text. */
export interface MacroDef {
  /** Stable id: `a1..aN` (account) / `c1..cN` (character), N = MACROS_PER_SCOPE. A bar slot stores this. */
  id: string;
  name: string;
  icon: string;
  body: string;
}

export function macroScopePrefix(scope: MacroScope): 'a' | 'c' {
  return scope === 'account' ? 'a' : 'c';
}

/** True for a well-formed macro id in range (`a1`..`aN` / `c1`..`cN`, N = MACROS_PER_SCOPE). */
export function isMacroId(s: unknown): s is string {
  if (typeof s !== 'string' || s.length < 2) return false;
  const p = s.charCodeAt(0);
  if (p !== 97 /* a */ && p !== 99 /* c */) return false;
  // No leading zeros / signs / spaces: an id is one letter then a plain 1-based index, so the
  // string form is canonical and `a07` can never masquerade as `a7` on a bar slot.
  const rest = s.slice(1);
  if (!/^[1-9][0-9]*$/.test(rest)) return false;
  const n = Number(rest);
  return n <= MACROS_PER_SCOPE;
}

export function macroScopeOf(id: string): MacroScope | null {
  if (!isMacroId(id)) return null;
  return id.charCodeAt(0) === 97 ? 'account' : 'character';
}

/** Lowest free id in `scope`, or null when that scope is full. */
export function nextMacroId(scope: MacroScope, taken: Iterable<string>): string | null {
  const used = new Set<string>();
  for (const t of taken) if (typeof t === 'string') used.add(t);
  const p = macroScopePrefix(scope);
  for (let i = 1; i <= MACROS_PER_SCOPE; i++) {
    const id = `${p}${i}`;
    if (!used.has(id)) return id;
  }
  return null;
}
