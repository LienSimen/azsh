// Out-of-combat prep before a pull: the rotation's buffs phase (armours, Intellect, imbues, conjures, the pet)
// cast standing still, not on the fight's first ticks. The web client's autopilotController.ts prepOoc (:889) without
// its fillMana: the mana the buffs cost stays spent, and the autopilot drinks it back before it pulls.
import { pickOocAction, useOocPrepItem } from '../autopilot/combatRotation.ts';
import { maxPower } from '../domain/character/character.ts';
import { powerType } from '../domain/character/characterStats.ts';

const MAX_PREP_ACTIONS = 8; // each pick is a guarded rule cast once; the cap keeps a refused rule from looping

/** Cast what the buffs phase wants up. Returns the names cast and the mana left as a fraction (1 for non-mana). */
export function prepOoc(g, ds) {
  const cast = [];
  for (let i = 0; i < MAX_PREP_ACTIONS; i++) {
    const action = pickOocAction(g.rotation(), g.state, ds);
    if (!action) break;
    if (action.kind === 'spell') {
      if (!g.castOutOfCombat(action.spellId).ok) break;
      cast.push(ds.spell(action.spellId)?.name ?? `spell ${action.spellId}`);
    } else if (action.kind === 'item') {
      if (!useOocPrepItem(g, action)) break;
      cast.push(ds.item(action.itemEntry)?.name ?? `item ${action.itemEntry}`);
    } else break;
  }
  const ch = g.state.char;
  const max = powerType(ch) === 'mana' ? maxPower(ch, ds) : 0;
  return { cast: [...new Set(cast)], manaPct: max > 0 ? ch.power / max : 1 };
}

/** The log line for a prep that cast something, or null. */
export function prepText(prep) {
  return prep.cast.length ? `Buffed up: ${prep.cast.join(', ')}` : null;
}
