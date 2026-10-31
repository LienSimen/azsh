// Peeled from applySpell (Wave 4 hub) — pure bookkeeping over the live effect mirror.
// Kept out of applySpell.ts so that hub stays under the 1500-line module cap.

import type { ActiveEffect } from './types.ts';
import type { Side } from '../core/events.ts';
import type { ControlKind, Mechanic } from '../../data/schema.ts';

// Surface control used on the live mirror row for a CC effect. Charm is displayed/tracked as incapacitate
// on the player-facing side.
export function surfaceControlOf(control: ControlKind): ControlKind {
  return control === 'charm' ? 'incapacitate' : control;
}

// A multi-aura CC remap lands once per cast, so the second slot must not re-roll resist or re-advance
// DR. It may still carry breakOnDamage the first lacked, so promote that onto the applied mirror.
export function upgradeBreakOnDamageMirror(
  effects: ActiveEffect[],
  side: Side,
  spellId: number,
  control: ControlKind,
  mechanic: Mechanic | undefined,
): number {
  const surfaceControl = surfaceControlOf(control);
  let upgraded = 0;
  for (const e of effects) {
    if (
      e.kind === 'cc'
      && e.target === side
      && e.spellId === spellId
      && e.control === surfaceControl
      && e.mechanic === mechanic
      && !e.broken
    ) {
      e.breakOnDamage = true;
      upgraded++;
    }
  }
  return upgraded;
}
