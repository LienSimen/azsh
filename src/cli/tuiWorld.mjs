// World-tab extras that are not a creature fight, a quest or a vendor: pick pocket for rogues (P on a creature).
import { dim, yellow, red, green } from './text.mjs';
import { startFight } from './tuiFight.mjs';
import { knownUsableSpells } from '../domain/character/characterSpells.ts';
import { activeStealthAura } from '../domain/character/buildCombatant.ts';
import { pickpocketLootKey, canRestockPickpocket } from '../domain/professions/pickpocket.ts';

/** The Pick Pocket rank you know, or undefined. */
export function pickPocketSpell(app) {
  return knownUsableSpells(app.ch, app.g.state.spellbook, app.ds).find((s) => s.effects?.some((e) => e.kind === 'pickpocket'));
}

/** '' when there is nothing to steal from this creature, else what P would do right now. */
export function pickPocketState(app, creature) {
  if (!pickPocketSpell(app) || !app.ds.lootTable(pickpocketLootKey(creature.entry)).length) return '';
  if (!canRestockPickpocket(app.g.state.pickpocketRestock, `${app.ch.zoneId}:${creature.entry}`, Date.now())) return 'empty';
  return activeStealthAura(app.ch, app.ds, Date.now()) ? 'ready' : 'stealth';
}

/** P on a creature: the cast pays energy and checks Stealth; a resist turns into a fight with just that mob. */
export function pickPocket(app, creature) {
  const sp = pickPocketSpell(app);
  if (!sp) { app.flashMsg('Only rogues pick pockets.'); return; }
  const state = pickPocketState(app, creature);
  if (!state) { app.flashMsg(`${creature.name} carries nothing worth stealing.`); return; }
  if (state === 'empty') { app.flashMsg('Those pockets are empty. They refill ten minutes after a pick.'); return; }
  const r = app.g.castOutOfCombat(sp.id, { targetCreature: creature.entry });
  if (r.ok) { app.say(green(`You pick ${creature.name}'s pocket.`)); return; }
  app.say(red(r.reason || 'You fail to pick the pocket.'));
  if (r.aggroCreature != null) {
    app.say(yellow(`${creature.name} notices you!`));
    startFight(app, r.aggroCreature, { begin: () => app.g.beginFight(r.aggroCreature, { withSquad: true, noAoe: true }) });
  }
}

export function pickPocketTag(app, creature) {
  const st = pickPocketState(app, creature);
  return st === 'ready' ? dim('  P: pick pocket') : st === 'empty' ? dim('  pockets empty') : '';
}
