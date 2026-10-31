// Autofill the player's primary bar THROUGH the form page machinery: the drawn bar 0 is the page
// (stanceBar.ts:186), so writing state.actionBars alone left a trained spell invisible until reload.

import type { ActionBar } from '../../domain/character/actionbar.ts';
import { autofillPrimaryBar } from '../../domain/character/actionbar.ts';
import type { PrimaryBarPages } from '../../domain/character/stanceBar.ts';
import { mutateActionBarsForForm } from '../../domain/character/stanceBar.ts';
import type { Character } from '../../domain/character/character.ts';

export interface PlayerBarState {
  char: Character;
  actionBars: ActionBar[];
  primaryBarPages?: PrimaryBarPages;
}

/** Drop newly usable spells onto free slots of the bar the player is looking at. Idempotent. */
export function autofillPlayerBars(state: PlayerBarState, eligibleIds: number[]): void {
  const out = mutateActionBarsForForm(
    state.actionBars,
    state.primaryBarPages,
    (state.char.form ?? 0) | 0,
    (bars) => autofillPrimaryBar(bars, eligibleIds),
  );
  state.actionBars = out.bars;
  state.primaryBarPages = out.primaryBarPages;
}
