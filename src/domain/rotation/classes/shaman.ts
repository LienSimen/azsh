// Shaman rotation post-pass and kit policy. Pure. Ghost Wolf is travel-only and never a combat form
// enter — pickAction cancels it to fight.

import type { ClassRotationHooks, FinalizeContext } from './hooks.ts';
import {
  gateSupportDamageOnTopped,
  gateSupportDamageRows,
  hoistSupportHealsIntoCombat,
} from './supportSpec.ts';

/** Restoration: heals in the combat list, and no mana on damage while in a party. */
function restoFinalize(ctx: FinalizeContext): void {
  if (!/^restoration$/i.test(ctx.spec)) return;
  hoistSupportHealsIntoCombat(ctx);
  gateSupportDamageOnTopped(ctx);
  gateSupportDamageRows(ctx);
}

export const shamanHooks: ClassRotationHooks = {
  allowFormFallback() {
    return false;
  },
  afterSuggestion(ctx) {
    restoFinalize(ctx);
  },
  afterFallback(ctx) {
    restoFinalize(ctx);
  },
};
