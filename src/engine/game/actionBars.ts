// Action-bar edit surface. Pattern C: createActionBarsModule(ctx, extras).
// No import of game.ts.

import type { ActionBar } from '../../domain/character/actionbar.ts';
import {
  setSlot as setBarSlot, setItemSlot as setBarItemSlot, clearSlot as clearBarSlot,
  setMacroSlot as setBarMacroSlot,
  setKey as setBarKey, addBar as addActionBarPure, removeBar as removeActionBarPure,
} from '../../domain/character/actionbar.ts';
import { isMacroId } from '../../domain/macro/types.ts';
import {
  actionBarsForForm,
  mutateActionBarsForForm,
} from '../../domain/character/stanceBar.ts';
import { countItem } from '../../domain/items/inventory.ts';
import { isItemEquipped } from '../../progression/rest.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';

export type ActionBarsExtras = {
  eligibleSpellIds: () => number[];
  /** Macro ids this character can see (character + account). Gate for setMacroActionSlot. */
  knownMacroIds: () => string[];
};

export function createActionBarsModule(
  ctx: GameCtx,
  extras: ActionBarsExtras,
): Pick<
  Game,
  | 'setActionSlot'
  | 'setItemActionSlot'
  | 'setMacroActionSlot'
  | 'setActionKey'
  | 'addActionBar'
  | 'removeActionBar'
> {
  const { ds, state } = ctx;
  const { eligibleSpellIds, knownMacroIds } = extras;

  return {
    setActionSlot(bar, slot, spellId) {
      // null clears whatever is in the slot (spell or item). Primary bar writes the
      // form-selected page; multi-bars stay unpaged.
      const form = (state.char.form ?? 0) | 0;
      const apply = (mut: (bars: ActionBar[]) => ActionBar[]) => {
        const out = mutateActionBarsForForm(state.actionBars, state.primaryBarPages, form, mut);
        state.actionBars = out.bars;
        state.primaryBarPages = out.primaryBarPages;
      };
      if (spellId == null) {
        apply((bars) => clearBarSlot(bars, bar, slot));
        return;
      }
      // Only allow placing a spell the player actually knows and can use.
      if (!eligibleSpellIds().includes(spellId)) return;
      apply((bars) => setBarSlot(bars, bar, slot, spellId));
    },

    setItemActionSlot(bar, slot, entry) {
      // null clears whatever is in the slot (spell or item).
      const form = (state.char.form ?? 0) | 0;
      const apply = (mut: (bars: ActionBar[]) => ActionBar[]) => {
        const out = mutateActionBarsForForm(state.actionBars, state.primaryBarPages, form, mut);
        state.actionBars = out.bars;
        state.primaryBarPages = out.primaryBarPages;
      };
      if (entry == null) {
        apply((bars) => clearBarSlot(bars, bar, slot));
        return;
      }
      // Held in bags OR worn (a trinket has no bag stack), or already on a bar so a fully spent
      // stack still rearranges. Cite: rest.ts:551 takeForUse "Must be equipped".
      const visible = actionBarsForForm(state.actionBars, state.primaryBarPages, form);
      const alreadyOnBar = visible.some((b) => b.items?.includes(entry));
      const held = countItem(state.inventory, entry) > 0 || isItemEquipped(state.char, entry);
      if (!held && !alreadyOnBar) return;
      const it = ds.item(entry);
      if (!it || !(it.useInCombat || it.useBuff || it.useSpell != null)) return;
      apply((bars) => setBarItemSlot(bars, bar, slot, entry));
    },

    setMacroActionSlot(bar, slot, macroId) {
      const form = (state.char.form ?? 0) | 0;
      const apply = (mut: (bars: ActionBar[]) => ActionBar[]) => {
        const out = mutateActionBarsForForm(state.actionBars, state.primaryBarPages, form, mut);
        state.actionBars = out.bars;
        state.primaryBarPages = out.primaryBarPages;
      };
      if (macroId == null) {
        apply((bars) => clearBarSlot(bars, bar, slot));
        return;
      }
      // Only a macro that actually exists for this character may be placed — the same shape as
      // the spell gate above, and what makes a hand-edited slot id inert.
      if (!isMacroId(macroId) || !knownMacroIds().includes(macroId)) return;
      apply((bars) => setBarMacroSlot(bars, bar, slot, macroId));
    },

    setActionKey(bar, slot, key) {
      // Keys are shared across primary pages (Classic); mutate keys on the form-visible
      // stack so bar 0 keys stay authoritative.
      const form = (state.char.form ?? 0) | 0;
      const out = mutateActionBarsForForm(state.actionBars, state.primaryBarPages, form, (bars) =>
        setBarKey(bars, bar, slot, key));
      state.actionBars = out.bars;
      state.primaryBarPages = out.primaryBarPages;
    },

    addActionBar() {
      const before = state.actionBars.length;
      state.actionBars = addActionBarPure(state.actionBars);
      if (state.actionBars.length === before) return { ok: false, reason: 'No more action bars available' };
      return { ok: true };
    },

    removeActionBar() {
      const before = state.actionBars.length;
      state.actionBars = removeActionBarPure(state.actionBars);
      if (state.actionBars.length === before) return { ok: false, reason: 'You must keep at least one bar' };
      return { ok: true };
    },
  };
}
