// Which model the player wears right now: a shapeshift form, a transform aura (costume, disguise,
// Noggenfogger skeleton), or their own race/gender face. Cite: SpellAuras.cpp:1708
// HandleAuraModShapeshift and :1979 HandleAuraTransform — both end in SetDisplayId.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from './character.ts';
import { RACE } from '../../data/schema.ts';
import { formDisplayId, FORM_LABEL } from './forms.ts';
import { factionOf } from './races.ts';

/** Native CreatureDisplayInfo id per race+gender — the `orbModel` switch reads these.
 *  Cite: item_scripts.cpp:150-184 OrbOfDeception; gender 0 = male. */
const NATIVE_DISPLAY: Record<number, readonly [number, number]> = {
  [RACE.HUMAN]: [49, 50],
  [RACE.ORC]: [51, 52],
  [RACE.DWARF]: [53, 54],
  [RACE.NIGHTELF]: [55, 56],
  [RACE.UNDEAD]: [57, 58],
  [RACE.TAUREN]: [59, 60],
  [RACE.GNOME]: [1563, 1564],
  [RACE.TROLL]: [1478, 1479],
};

/** Orb of Deception (16739): own model → opposite-faction counterpart. The spell row carries
 *  EffectMiscValue 0, so the model comes from the script. Cite: item_scripts.cpp:143. */
const ORB_OF_DECEPTION: Record<number, number> = {
  1479: 10134, 1478: 10135, 59: 10136, 49: 10137, 50: 10138, 51: 10139, 52: 10140,
  53: 10141, 54: 10142, 55: 10143, 56: 10144, 58: 10145, 57: 10146, 60: 10147,
  1563: 10148, 1564: 10149,
};
const ORB_OF_DECEPTION_SPELL = 16739;

/** Opposite-faction counterpart of a native model; 0 when the orb has no row for it. */
export function orbOfDeceptionDisplayId(nativeId: number): number {
  return ORB_OF_DECEPTION[nativeId | 0] ?? 0;
}

/** The player's own model, before any form or costume. */
export function nativeDisplayId(race: number, gender: 0 | 1 | undefined): number {
  return NATIVE_DISPLAY[race | 0]?.[gender === 1 ? 1 : 0] ?? 0;
}

export interface WornDisplay {
  /** CreatureDisplayInfo id to draw; 0 = the player's own paperdoll. */
  displayId: number;
  /** What to call it in a frame — form name, or the spell that swapped the model. */
  label: string;
}

/** Transform auras beat the form: a costume cast in Bear Form shows the costume, because
 *  HandleAuraTransform is the later SetDisplayId. `now` drops auras that have already run out. */
export function wornDisplay(char: Character, ds: DataStore, now: number): WornDisplay | null {
  for (const aura of char.activeAuras ?? []) {
    if (aura.expiresAt != null && aura.expiresAt <= now) continue;
    const spell = ds.spell(aura.spellId);
    if (!spell) continue;
    if (spell.id === ORB_OF_DECEPTION_SPELL) {
      const swapped = orbOfDeceptionDisplayId(nativeDisplayId(char.race, char.gender));
      if (swapped) return { displayId: swapped, label: spell.name };
      continue;
    }
    for (const eff of spell.effects ?? []) {
      if (eff.kind !== 'transform') continue;
      const displayId = (ds.creature(eff.creatureEntry)?.displayId ?? 0) | 0;
      if (displayId > 0) return { displayId, label: spell.name };
    }
  }
  const form = (char.form ?? 0) | 0;
  const displayId = formDisplayId(form, factionOf(ds, char.race));
  if (displayId > 0) return { displayId, label: FORM_LABEL[form] || 'Form' };
  return null;
}
