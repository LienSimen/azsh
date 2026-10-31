// World-tab extras that are not a creature fight, a quest or a vendor: pick pocket for rogues (P on a creature)
// real-time journeys, and riding (instructors, mounts).
import { bold, dim, yellow, red, green, cyan, bar } from './text.mjs';
import { startFight } from './tuiFight.mjs';
import { knownUsableSpells } from '../domain/character/characterSpells.ts';
import { activeStealthAura } from '../domain/character/buildCombatant.ts';
import { pickpocketLootKey, canRestockPickpocket } from '../domain/professions/pickpocket.ts';
import { moneyText } from '../domain/economy/money.ts';
import { vendorPriceMultiplierFor, trainerSpellCost } from '../engine/game/vendorOffers.ts';

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

// ---- journeys ------------------------------------------------------------------------------------------
// With a real-time travel pace (Settings) a trip takes wall-clock time: the game loop calls journeyTick, the
// header shows where you are headed, and the World tab opens on this card. Instant pace never gets here.

const PACES = ['instant', 1, 2, 4];
export const paceLabel = (p) => (p === 'instant' ? 'instant' : `${p}x real time`);
export const nextPace = (p) => PACES[(PACES.indexOf(p) + 1) % PACES.length];
const mmss = (sec) => { const s = Math.max(0, Math.ceil(sec)); return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`; };

/** "→ Westfall 1m 05s" for the header, or null when not travelling. */
export function journeyHeader(app) {
  const st = app.g.state.char.journey ? app.g.journeyStatus() : null;
  if (!st) return null;
  return `→ ${app.ds.zone(st.destination)?.name ?? st.destination} ${mmss(st.progress.remainingSeconds)}${app.travelPaused ? ' paused' : ''}`;
}

/** After a departure: say you are on the road, or that you are there (instant pace lands at once). */
export function afterDeparture(app, arrivedText) {
  if (!app.g.state.char.journey) { app.say(arrivedText()); return true; }
  const st = app.g.journeyStatus();
  app.say(`You set off for ${app.ds.zone(st?.destination)?.name ?? 'the road'}. ${dim(st ? `${mmss(st.progress.remainingSeconds)} at ${st.timeScale}x` : '')}`);
  app.journeyWas = st?.destination ?? null;
  return false;
}

/** Called from the game loop and after keys: advance the trip, announce arrival. */
export function journeyTick(app) {
  if (!app.g?.state.char.journey) return;
  app.g.journeyTick();
  if (!app.g.state.char.journey) {
    app.say(green(`You arrive in ${app.zone()?.name ?? app.ch.zoneId}.`));
    app.journeyWas = null;
    const world = app.tabs[0]?.view;
    if (world) { world.cursor = 0; world.scroll = 0; }
  }
}

export function journeyRows(app) {
  const st = app.g.state.char.journey ? app.g.journeyStatus() : null;
  if (!st) return [];
  const dest = app.ds.zone(st.destination)?.name ?? st.destination;
  const total = st.progress.totalElapsedSeconds + st.progress.remainingSeconds;
  const leg = st.legs[st.progress.legIndex];
  return [
    { text: `On the road to ${dest}`, header: true },
    { text: `${bar(st.progress.totalElapsedSeconds, total, 30, cyan)} ${mmss(st.progress.remainingSeconds)} left${app.travelPaused ? yellow('  paused') : ''}`, header: true },
    {
      text: `${leg ? `${leg.kind} ${app.ds.zone(leg.from)?.name ?? leg.from} → ${app.ds.zone(leg.to)?.name ?? leg.to}` : ''}  ${dim(`${st.timeScale}x   Enter: journey options`)}`,
      detail: () => [bold(`To ${dest}`), '', ...st.legs.map((l, i) => `${i < st.progress.legIndex ? green('✓') : i === st.progress.legIndex ? cyan('▶') : dim('·')} ${l.kind} ${app.ds.zone(l.from)?.name ?? l.from} → ${app.ds.zone(l.to)?.name ?? l.to} ${dim(mmss(l.seconds))}`), '', dim('Enter: speed, pause, arrive now, turn back')],
      act: (a) => journeyMenu(a),
    },
    { text: '', header: true },
  ];
}

export function journeyMenu(app) {
  const g = app.g;
  const st = g.journeyStatus();
  if (!st) return;
  app.pick('Journey', [
    { label: 'Arrive now', value: () => { if (app.result(app.arriveNow())) { app.journeyWas = null; app.say(green(`You arrive in ${app.zone()?.name}.`)); } } },
    ...[1, 2, 4].filter((x) => x !== st.timeScale).map((x) => ({ label: `Travel at ${x}x real time`, value: () => app.result(g.setJourneySpeed(x), `Now travelling at ${x}x.`) })),
    { label: app.travelPaused ? 'Carry on' : 'Pause the trip', value: () => { app.travelPaused = !app.travelPaused; g.setIdlePaused(app.travelPaused); app.say(dim(app.travelPaused ? 'You stop by the road.' : 'You carry on.')); } },
    { label: red('Turn back here'), value: () => { const r = g.cancelJourney(); if (app.result(r, `You stop in ${app.zone()?.name}.`)) app.journeyWas = null; } },
  ], (fn) => fn());
}

// ---- riding and mounts ---------------------------------------------------------------------------------

/** Riding instructors in this zone, as World-tab People rows. */
export function ridingRows(app) {
  const ids = app.zone()?.ridingTrainers ?? [];
  if (!ids.length || !app.ds.ridingSpells().length) return [];
  return ids.map((entry) => {
    const name = app.ds.creature(entry)?.name ?? `Riding Instructor (${entry})`;
    return {
      text: `${name} ${dim('<Riding Instructor>')}${app.ch.ridingSkill ? dim(`  you ride at ${app.ch.ridingSkill}`) : ''}`,
      detail: () => [bold(name), 'Riding instructor', `Your riding: ${app.ch.ridingSkill ?? 0}`, '', dim('Enter: learn to ride')],
      act: (a) => ridingDialog(a, entry),
    };
  });
}

function ridingDialog(app, entry) {
  const mod = vendorPriceMultiplierFor(app.ds, app.ch, entry);
  const have = app.ch.ridingSkill ?? 0;
  const seen = new Set();
  const opts = [];
  for (const sp of app.ds.ridingSpells()) {
    if (seen.has(sp.rank)) continue;
    seen.add(sp.rank);
    const cost = trainerSpellCost(sp.cost, mod);
    const why = have >= sp.rank ? 'known' : sp.step > 1 && have < 75 ? 'needs Apprentice Riding' : app.ch.level < sp.reqLevel ? `level ${sp.reqLevel}` : app.ch.gold < cost ? 'not enough money' : '';
    opts.push({ label: `${why ? dim(`Riding ${sp.rank}`) : green(`Riding ${sp.rank}`)}  ${dim(`level ${sp.reqLevel}, ${moneyText(cost)}`)}${why ? dim(`  ${why}`) : ''}`, value: sp.rank });
  }
  app.pick(`${app.ds.creature(entry)?.name ?? 'Riding instructor'}`, opts, (rank) => {
    const r = app.g.trainRiding(entry, rank);
    app.result(r, r.ok ? `You learn Riding (${r.rank}) for ${moneyText(r.spent)}.` : '');
  });
}

export const isMountItem = (it) => it != null && (it.mountSpell != null || it.mountSpeedPct != null);

/** Enter on a mount in the bags: get on, or off when it is the one you ride. */
export function toggleMount(app, entry) {
  if (app.ch.mountedItem === entry) { app.result(app.g.dismount(), 'You dismount.'); return; }
  app.result(app.g.useMount(entry), `You mount ${app.itemName(entry)}.`);
}
