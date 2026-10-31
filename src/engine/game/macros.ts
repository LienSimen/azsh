// Macro CRUD, in the client's two scopes: `character` lives on the save and `account` outside it,
// through a host-supplied getter and writer. Every read and write goes through normalizeMacros.

import {
  MACROS_PER_SCOPE, macroScopeOf, normalizeMacro, normalizeMacros, nextMacroId,
  type MacroDef, type MacroScope,
} from '../../domain/macro/index.ts';
import { clearMacroFromBars } from '../../domain/character/actionbar.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';

export type MacrosExtras = {
  /** Account-wide macros, read live so a change in one character shows in another. */
  accountMacros: () => MacroDef[];
  /** Persist account-wide macros (localStorage in the browser host). */
  onAccountMacrosChange?: (macros: MacroDef[]) => void;
};

export function createMacrosModule(
  ctx: GameCtx,
  extras: MacrosExtras,
): Pick<Game, 'macros' | 'macroById' | 'macroByName' | 'saveMacro' | 'deleteMacro'> {
  const { state } = ctx;
  const { accountMacros, onAccountMacrosChange } = extras;

  const readAccount = (): MacroDef[] => {
    try {
      return normalizeMacros(accountMacros(), 'account');
    } catch {
      return [];
    }
  };
  const readCharacter = (): MacroDef[] => normalizeMacros(state.macros, 'character');

  const writeAccount = (list: MacroDef[]): void => {
    const next = normalizeMacros(list, 'account');
    onAccountMacrosChange?.(next);
  };
  const writeCharacter = (list: MacroDef[]): void => {
    state.macros = normalizeMacros(list, 'character');
  };

  const read = (scope: MacroScope): MacroDef[] => (scope === 'account' ? readAccount() : readCharacter());
  const write = (scope: MacroScope, list: MacroDef[]): void =>
    (scope === 'account' ? writeAccount(list) : writeCharacter(list));

  /** Character macros first, then account — the order the editor and `{Name}` lookups use. */
  const all = (): MacroDef[] => [...readCharacter(), ...readAccount()];

  /** Drop this id from every bar and every form page of the primary bar. */
  const sweepBars = (id: string): void => {
    state.actionBars = clearMacroFromBars(state.actionBars, id);
    const pages = state.primaryBarPages;
    if (!pages) return;
    let touched = false;
    const next: NonNullable<typeof pages> = {};
    for (const [k, layout] of Object.entries(pages)) {
      if (!layout) continue;
      const macros = layout.macros ?? [];
      if (!macros.includes(id)) {
        next[k] = layout;
        continue;
      }
      touched = true;
      next[k] = { ...layout, macros: macros.map((m) => (m === id ? null : m)) };
    }
    if (touched) state.primaryBarPages = next;
  };

  return {
    macros(scope) {
      if (scope === 'account' || scope === 'character') return read(scope);
      return all();
    },

    macroById(id) {
      const scope = macroScopeOf(id);
      if (!scope) return null;
      return read(scope).find((m) => m.id === id) ?? null;
    },

    macroByName(name) {
      const want = String(name ?? '').trim().toLowerCase();
      if (!want) return null;
      return all().find((m) => m.name.toLowerCase() === want) ?? null;
    },

    saveMacro(scope, macro) {
      if (scope !== 'account' && scope !== 'character') return { ok: false, reason: 'Unknown macro tab' };
      // keepId:false — the id is decided here (existing row or the next free slot), never by input.
      const clean = normalizeMacro(macro, scope, { keepId: false });
      if (!clean) return { ok: false, reason: 'A macro needs a name' };
      const list = read(scope);
      const wantId = typeof macro?.id === 'string' ? macro.id : '';
      const at = wantId ? list.findIndex((m) => m.id === wantId) : -1;
      if (at >= 0) {
        const id = list[at]!.id;
        list[at] = { ...clean, id };
        write(scope, list);
        return { ok: true, id };
      }
      if (list.length >= MACROS_PER_SCOPE) {
        return { ok: false, reason: `That tab already holds ${MACROS_PER_SCOPE} macros` };
      }
      const id = nextMacroId(scope, list.map((m) => m.id));
      if (!id) return { ok: false, reason: `That tab already holds ${MACROS_PER_SCOPE} macros` };
      list.push({ ...clean, id });
      write(scope, list);
      return { ok: true, id };
    },

    deleteMacro(id) {
      const scope = macroScopeOf(id);
      if (!scope) return { ok: false, reason: 'No such macro' };
      const list = read(scope);
      const at = list.findIndex((m) => m.id === id);
      if (at < 0) return { ok: false, reason: 'No such macro' };
      list.splice(at, 1);
      write(scope, list);
      // A deleted macro must not leave a live button behind on any bar or form page.
      sweepBars(id);
      return { ok: true };
    },
  };
}
