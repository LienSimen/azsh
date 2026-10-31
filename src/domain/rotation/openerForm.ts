// PURE: no DOM/RNG/Date. The form a rotation opens IN, so a seat is seated in it instead of spending
// the first GCD entering it — and so pre-pull stealth can seed a form-gated sneak (Prowl is Cat-only).

import type { DataStore } from '../../data/dataStore.ts';
import { SHAPESHIFT_FORM } from '../../data/schema.ts';
import { isWarriorStance } from '../character/forms.ts';
import { formIdForRotationSpell } from './classify.ts';
import type { Rotation } from './types.ts';

// Pull first, then combat — G17 made Feral@60's pull name Cat, but a band that names one only in
// combat still resolves. Stealth rides the aura path, a stance is role-picked.
export function openerFormOf(rot: Rotation, ds: DataStore): number {
  for (const phase of [rot.phases.pull, rot.phases.combat]) {
    for (const r of phase) {
      if (!r.enabled || r.action.kind !== 'spell') continue;
      const sp = ds.spell(r.action.spellId);
      const form = (sp ? formIdForRotationSpell(sp) : 0) | 0;
      if (form && form !== SHAPESHIFT_FORM.STEALTH && !isWarriorStance(form)) return form;
    }
  }
  return 0;
}
