// World-tab extras that are not a creature fight, a quest or a vendor: pick pocket for rogues (P on a creature)
// real-time journeys, riding (instructors, mounts), and the zone's objects (chests, books, quest objects).
import { bold, dim, yellow, red, green, cyan, bar, wrapLines, coinText } from './text.mjs';
import { startFight } from './tuiFight.mjs';
import { knownUsableSpells } from '../domain/character/characterSpells.ts';
import { activeStealthAura } from '../domain/character/buildCombatant.ts';
import { inferRole } from '../engine/combat.ts';
import { countItem } from '../domain/items/inventory.ts';
import { requiresSourceUseCredit } from '../domain/quests/questlog.ts';
import { tamingRodByQuestId } from '../domain/quests/questTameRods.ts';
import { pendingCorpseUseItem } from '../domain/quests/questCorpseUse.ts';
import { pendingScriptItemUse } from '../domain/quests/questScriptItemUse.ts';
import { pickpocketLootKey, canRestockPickpocket } from '../domain/professions/pickpocket.ts';
import { vendorPriceMultiplierFor, trainerSpellCost } from '../engine/game/vendorOffers.ts';
import { questDialog, npcLines } from './tuiViews.mjs';
import { mailDialog } from './tuiCity.mjs';
import { withWorldMap } from './tuiMap.mjs';
import { autoLootOn, openLoot, takeAll } from './tuiLoot.mjs';
import { zoneGameObjects, zoneGoListedForPlayer, makeGoPlayerVisibility, questReferencedGoEntries, questTargets } from '../world/world.ts';
import { goQuestGiverOffer, goDialogMarkerFromOffer, questStatusFromLog } from '../domain/quests/questlog.ts';
import { isGoQuestGiver, interactVerbForGoType, goRuntimeAvailability } from '../domain/world/gameObjects.ts';
import { pruneWildSummoned } from '../engine/game/summonObjectWild.ts';
import { offeredQuests } from '../quests/quests.ts';
import { pageText } from '../data/pageTexts.ts';
import { meetingStonesForPortalZone, instanceForMeetingStoneArea } from '../world/meetingStones.ts';
import { getVariable } from '../engine/game/worldState.ts';
import { WORLD_STATE_ADD, WORLD_STATE_EP_TOWER_COUNT_ALLIANCE, WORLD_STATE_EP_TOWER_COUNT_HORDE, WORLD_STATE_EP_NORTHPASS_ALLIANCE, WORLD_STATE_EP_NORTHPASS_HORDE, WORLD_STATE_EP_CROWNGUARD_ALLIANCE, WORLD_STATE_EP_CROWNGUARD_HORDE, WORLD_STATE_EP_EASTWALL_ALLIANCE, WORLD_STATE_EP_EASTWALL_HORDE, WORLD_STATE_EP_PLAGUEWOOD_ALLIANCE, WORLD_STATE_EP_PLAGUEWOOD_HORDE, GO_TOWER_BANNER_NORTHPASS, GO_TOWER_BANNER_CROWNGUARD, GO_TOWER_BANNER_EASTWALL, GO_TOWER_BANNER_PLAGUEWOOD, WORLD_STATE_SI_GATHERED_A, WORLD_STATE_SI_GATHERED_H, WORLD_STATE_SI_SILITHYST_MAX, MAX_SILITHYST } from '../engine/game/outdoorPvp.ts';
import { applyMeetingStoneQueue, meetingStoneQueueStateFromApply, leaveMeetingStoneQueue, formatMeetingStonePlace, formatMeetingStoneLevel, ERR_MEETING_STONE_IN_QUEUE_S, ERR_MEETING_STONE_LEFT_QUEUE_S, MEETINGSTONE_STATUS_JOINED_QUEUE } from '../engine/game/meetingStoneQueue.ts';

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

// ---- taming ----------------------------------------------------------------------------------------------
// The facade's tamePet is ungated, so the row gates it as phonecraft's worldView does: a hunter who has learned
// Tame Beast (the pet quest's reward) and has no pet out. While a Taming the Beast quest is open, its rod takes
// the place of the tame on the beast it names (useQuestItemOnTarget credits it). Ref worldView.ts:155.

const HUNTER = 3;

/** The Tame Beast rank you know, or undefined. */
export function tameSpell(app) {
  if (app.ch.cls !== HUNTER) return undefined;
  return knownUsableSpells(app.ch, app.g.state.spellbook, app.ds).find((s) => (s.role ?? inferRole(s)) === 'pet_tame');
}

/** A quest item to use on a creature: the open Taming the Beast quest's rod (only on its beast), or a use-to-credit source item (on a tameable beast). */
export function questUseItem(app) {
  const inv = app.g.state.inventory;
  for (const qs of app.g.state.questlog.quests) {
    if (qs.status === 'turnedIn' || qs.status === 'complete') continue;
    const rod = tamingRodByQuestId(qs.entry);
    if (rod && countItem(inv, rod.item) >= 1) { const it = app.ds.item(rod.item); if (it) return { entry: it.entry, name: it.name, onlyCreature: rod.targetCreature }; }
    const q = app.ds.quest(qs.entry);
    if (!q || !requiresSourceUseCredit(q)) continue;
    for (const t of q.sourceItemTargets ?? []) { if (countItem(inv, t.item) < 1) continue; const it = app.ds.item(t.item); if (it) return { entry: it.entry, name: it.name }; }
  }
  return undefined;
}

const useItemFits = (use, creature) => !!use && (use.onlyCreature != null ? creature.entry === use.onlyCreature : !!creature.tameable);

/** What t on this creature does: 'use' (a quest item), 'tame', or why not ('' when it is not for t at all). */
export function tameState(app, creature) {
  if (useItemFits(questUseItem(app), creature)) return 'use';
  if (app.ch.cls !== HUNTER || !creature.tameable) return '';
  if (!tameSpell(app)) return 'unlearned';
  return app.ch.pet ? 'pet' : 'tame';
}

export function tameTag(app, creature) {
  const st = tameState(app, creature);
  return st === 'use' ? dim(`  t: use ${questUseItem(app).name}`) : st === 'tame' ? dim('  t: tame') : '';
}

/** t on a creature: use the quest item on it, or tame it. */
export function tame(app, creature) {
  const st = tameState(app, creature);
  if (st === 'use') {
    const use = questUseItem(app);
    app.result(app.g.useQuestItemOnTarget({ itemEntry: use.entry, targetCreatureEntry: creature.entry }), `You use ${use.name} on ${creature.name}.`);
    return;
  }
  if (app.ch.cls !== HUNTER) { app.flashMsg('Only hunters tame beasts.'); return; }
  if (!creature.tameable) { app.flashMsg(`${creature.name} cannot be tamed.`); return; }
  if (st === 'unlearned') { app.flashMsg('Learn Tame Beast first: the hunter trainer sends you on the taming quests at level 10.'); return; }
  if (st === 'pet') { app.flashMsg(`Dismiss or stable ${app.ch.pet.name} before taming another.`); return; }
  app.result(app.g.tamePet(creature.entry), `You tame ${creature.name}.`);
}

// ---- right here: loot left behind, and quest items used on a corpse or a creature the list never offers -------
// Ref worldView.ts:551-582. A corpse item (Bramble, a molt) goes on your last kill; a script item (Lazy Peons'
// blackjack) goes on a civilian, who is never on the creature list.

export function hereRows(app) {
  const g = app.g, ds = app.ds, inv = g.state.inventory, rows = [];
  const left = g.pendingLoot();
  if (left && app.top()?.id !== 'loot') rows.push({ text: `${yellow('Loot')} ${left.title ?? 'what you left'}  ${dim('still lootable')}`, detail: () => [bold(left.title ?? 'Loot'), 'You closed it with things still in it.', '', dim('Enter: open it again')], act: () => openLoot(app) });
  const active = g.state.questlog.quests.filter((qs) => qs.status === 'active').map((qs) => ({ qs, q: ds.quest(qs.entry) })).filter((x) => x.q);
  const useRow = (item, target, q) => {
    const it = ds.item(item), on = target ? ds.creature(target)?.name ?? `creature ${target}` : ds.creature(g.state.lastCorpse?.creatureEntry ?? 0)?.name ?? 'the corpse';
    return { text: `${yellow('Use')} ${it?.name ?? `item ${item}`} on ${on}  ${dim(q.title)}`, icon: it?.icon, detail: () => [bold(`Use ${it?.name ?? 'item'} on ${on}`), `For ${q.title}.`, '', dim('Enter: use it')], act: () => app.result(g.useQuestItemOnTarget({ itemEntry: item, ...(target ? { targetCreatureEntry: target } : {}) }), `You use ${it?.name ?? 'it'} on ${on}.`) };
  };
  const corpse = active.map(({ q }) => ({ q, item: pendingCorpseUseItem(ds, q, inv, g.state.lastCorpse) })).find((x) => x.item);
  if (corpse) rows.push(useRow(corpse.item, 0, corpse.q));
  for (const { q, qs } of active) { const u = pendingScriptItemUse(ds, q, qs, inv, app.ch.zoneId); if (u) { rows.push(useRow(u.item, u.targetCreatureEntry, q)); break; } }
  return rows.length ? [{ text: '', header: true }, { text: 'Here', header: true }, ...rows] : [];
}

// ---- journeys ------------------------------------------------------------------------------------------
// With a real-time travel pace (Settings) a trip takes wall-clock time: the game loop calls journeyTick, the
// header shows where you are headed, and the World and Travel tabs carry this card. Instant pace never gets here.

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
    for (const v of [app.tabs[0]?.view, app.top()]) if (v) { v.cursor = 0; v.scroll = 0; }
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
      // The legs, then the world map with the traveller walking the current one (tuiMap.mjs).
      detail: () => withWorldMap(app, [bold(`To ${dest}`), '', ...st.legs.map((l, i) => `${i < st.progress.legIndex ? green('✓') : i === st.progress.legIndex ? cyan('▶') : dim('·')} ${l.kind} ${app.ds.zone(l.from)?.name ?? l.from} → ${app.ds.zone(l.to)?.name ?? l.to} ${dim(mmss(l.seconds))}`), '', dim('Enter: speed, pause, arrive now, turn back')]),
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
      detail: () => npcLines(app, entry, [bold(name), 'Riding instructor', `Your riding: ${app.ch.ridingSkill ?? 0}`, '', dim('Enter: learn to ride')]),
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
    opts.push({ label: `${why ? dim(`Riding ${sp.rank}`) : green(`Riding ${sp.rank}`)}  ${dim(`level ${sp.reqLevel}, ${coinText(cost)}`)}${why ? dim(`  ${why}`) : ''}`, value: sp.rank });
  }
  app.pick(`${app.ds.creature(entry)?.name ?? 'Riding instructor'}`, opts, (rank) => {
    const r = app.g.trainRiding(entry, rank);
    app.result(r, r.ok ? `You learn Riding (${r.rank}) for ${coinText(r.spent)}.` : '');
  });
}

export const isMountItem = (it) => it != null && (it.mountSpell != null || it.mountSpeedPct != null);

/** Enter on a mount in the bags: get on, or off when it is the one you ride. */
export function toggleMount(app, entry) {
  if (app.ch.mountedItem === entry) { app.result(app.g.dismount(), 'You dismount.'); return; }
  app.result(app.g.useMount(entry), `You mount ${app.itemLabel(entry)}.`);
}

// ---- world objects ---------------------------------------------------------------------------------
// Chests, books, signposts, quest objects and banners in this zone (phonecraft worldView.ts goList). Herb and
// ore nodes stay on the gathering rows. Enter on one is interactObject; a quest object offers its quests first.

function zoneObjectList(app) {
  const ds = app.ds, g = app.g, c = app.ch, log = g.state.questlog;
  const refs = questReferencedGoEntries(ds);
  const view = makeGoPlayerVisibility(ds, log, !!c.skills?.fishing);
  const seen = new Set(), out = [];
  const add = (go) => { if (go && !seen.has(go.entry)) { seen.add(go.entry); out.push(go); } };
  for (const go of zoneGameObjects(ds, c.zoneId)) if (zoneGoListedForPlayer(ds, go, refs, view)) add(go);
  for (const e of questTargets(ds, log).objects) { const go = ds.gameObject(e); if (go && zoneGoListedForPlayer(ds, go, refs, view)) add(go); }
  for (const w of pruneWildSummoned(g.state.wildSummonedObjects, Date.now())) add(ds.gameObject(w.goEntry));
  // Meeting stones are not in the zone lists: they stand by the portals of this zone's dungeons.
  for (const stone of meetingStonesForPortalZone(ds, c.zoneId)) add(stone);
  for (const o of offeredQuests(ds, c.zoneId, c, log)) if (o.quest.goStarter) add(ds.gameObject(o.quest.goStarter));
  for (const qs of log.quests) if (qs.status !== 'turnedIn') { const q = ds.quest(qs.entry); if (q?.goEnder) add(ds.gameObject(q.goEnder)); }
  return out;
}

function goOffer(app, go) {
  if (!isGoQuestGiver(go)) return null;
  const c = app.ch, log = app.g.state.questlog;
  return goQuestGiverOffer(go, log, { level: c.level, classId: c.cls, raceId: c.race, questStatus: questStatusFromLog(log) }, (e) => app.ds.quest(e), app.g.state.inventory, {
    questDefFor: (id) => app.ds.quest(id),
    fallbackStarted: !go.questsStarted?.length ? offeredQuests(app.ds, c.zoneId, c, log).filter((o) => o.quest.goStarter === go.entry).map((o) => o.quest.entry) : undefined,
    fallbackEnded: !go.questsEnded?.length ? log.quests.filter((qs) => app.ds.quest(qs.entry)?.goEnder === go.entry).map((qs) => qs.entry) : undefined,
  });
}

export function objectRows(app) {
  const list = zoneObjectList(app);
  if (!list.length) return [];
  const rows = [{ text: '', header: true }, { text: `Objects (${list.length})`, header: true }];
  const rt = app.g.state.goRuntime ?? {};
  for (const go of list) {
    const offer = goOffer(app, go);
    const mark = offer ? goDialogMarkerFromOffer(offer) : null;
    const tag = mark === 'reward' ? green('? ') : mark === 'available' ? yellow('! ') : mark === 'incomplete' ? dim('? ') : '';
    const avail = goRuntimeAvailability(rt[`${app.ch.zoneId}:${go.entry}`], Date.now());
    const verb = interactVerbForGoType(go.type);
    const state = avail.kind === 'consumed' ? dim('  gone') : avail.kind === 'restock' ? dim(`  back in ${Math.ceil((avail.readyAtMs - Date.now()) / 1000)}s`) : dim(`  ${verb.toLowerCase()}`);
    rows.push({
      text: `${tag}${go.name}${state}`, data: { object: go },
      detail: () => [
        bold(go.name), '',
        ...(offer ? [
          ...offer.acceptable.map((q) => yellow(`! ${app.ds.quest(q)?.title}`)),
          ...offer.turnInReady.map((q) => green(`? ${app.ds.quest(q)?.title}`)),
          ...offer.incomplete.map((q) => dim(`? ${app.ds.quest(q)?.title} (in progress)`)),
        ] : []),
        '', dim(`Enter: ${verb.toLowerCase()}`),
      ],
      act: (a) => useObject(a, go),
    });
  }
  return rows;
}

/** Enter on an object: its quests if it has any to give or take, else use it (open, read, take). */
export function useObject(app, go) {
  if (go.meetingstone?.areaId) { meetingStoneMenu(app, go); return; }
  const offer = goOffer(app, go);
  if (offer && (offer.acceptable.length || offer.turnInReady.length)) {
    const opts = [
      ...offer.turnInReady.map((q) => ({ label: `${green('?')} ${app.ds.quest(q)?.title}`, value: () => app.push(questDialog(app, app.ds.quest(q), 'log')) })),
      ...offer.acceptable.map((q) => ({ label: `${yellow('!')} ${app.ds.quest(q)?.title}`, value: () => app.push(questDialog(app, app.ds.quest(q), 'offer')) })),
      { label: dim(interactVerbForGoType(go.type)), value: () => interact(app, go) },
    ];
    app.pick(go.name, opts, (fn) => fn());
    return;
  }
  interact(app, go);
}

function interact(app, go) {
  const r = app.g.interactObject(go.entry, { hold: true });
  if (!app.result(r)) return;
  const verb = interactVerbForGoType(go.type).toLowerCase();
  if (r.mailboxOpen) { app.push(mailDialog(app)); return; }
  if (r.boarded) { afterDeparture(app, () => `You ride to ${app.zone()?.name}.`); return; }
  if (r.pageId > 0) { app.push(bookDialog(app, go.name, r.pageId)); return; }
  if (r.keyUsed) app.say(dim(`The ${app.itemLabel(r.keyUsed)} turns.`));
  if (app.g.pendingLoot()) {
    app.say(green(`You ${verb} ${go.name}.`) + (r.workedBy ? dim(`  ${r.workedBy} works it.`) : '') + (r.skillUp ? cyan(`  Skill ${r.skillUp}.`) : ''));
    if (autoLootOn(app)) takeAll(app);
    openLoot(app);
    return;
  }
  const bits = [
    ...(r.questsOffered ?? []).map((q) => `${yellow('!')} ${app.ds.quest(q)?.title}`),
    ...(r.questsTurnIn ?? []).map((q) => `${green('?')} ${app.ds.quest(q)?.title}`),
    ...(r.questsIncomplete ?? []).map((q) => dim(`${app.ds.quest(q)?.title} is not done yet`)),
  ];
  app.say(`You ${verb} ${go.name}.${bits.length ? `  ${bits.join('   ')}` : r.yielded?.length ? '' : dim('  Nothing happens.')}`);
}

/** A book, plaque or letter: one page at a time; Enter on Next page turns it, b goes back. */
export function bookDialog(app, title, firstPage) {
  const pages = [];
  for (let id = firstPage, n = 0; id > 0 && n < 50; n++) { const p = pageText(id); if (!p) break; pages.push(p.text); id = p.next ?? 0; }
  const view = {
    id: 'book', title, hint: pages.length > 1 ? 'Enter: next page' : '', noDetail: true, page: 0,
    keys: { b: { hint: 'previous page', fn: () => { view.page = Math.max(0, view.page - 1); } } },
    rows(a) {
      const text = pages[view.page] ?? '(blank)';
      const width = Math.max(40, a.layout().W - 4);
      const rows = [{ text: `${bold(title)}  ${dim(`page ${view.page + 1} of ${pages.length}`)}`, header: true }, { text: '', header: true }];
      for (const para of text.split(/\n/)) for (const l of wrapLines(para, width)) rows.push({ text: ` ${l}`, header: true });
      rows.push({ text: '', header: true }, {
        text: view.page + 1 < pages.length ? 'Next page' : 'Close',
        act: (a2) => { if (view.page + 1 < pages.length) { view.page++; view.cursor = 0; view.scroll = 0; } else a2.pop(); },
      });
      return rows;
    },
  };
  return view;
}

// ---- meeting stones ------------------------------------------------------------------------------------
// The stone by a dungeon puts you (or your party) in the queue for it, as SCRIPT_COMMAND_MEETINGSTONE does; the
// World tab shows the queue card until you leave it. Cite: LFGMgr.cpp:38-90 via engine/game/meetingStoneQueue.ts.

function stonePlace(app, areaId) {
  return instanceForMeetingStoneArea(app.ds, areaId)?.name ?? `area ${areaId}`;
}

function meetingStoneMenu(app, go) {
  const areaId = go.meetingstone.areaId;
  const place = stonePlace(app, areaId);
  const q = app.g.state.meetingStoneQueue;
  const queuedHere = q?.status === MEETINGSTONE_STATUS_JOINED_QUEUE && q.areaId === areaId;
  const band = go.meetingstone.maxLevel ? `  ${dim(formatMeetingStoneLevel(go.meetingstone.minLevel ?? 1, go.meetingstone.maxLevel))}` : '';
  app.pick(go.name, [
    queuedHere
      ? { label: 'Leave the queue', value: () => leaveQueue(app) }
      : { label: `Join the queue for ${place}${band}`, value: () => joinQueue(app, areaId) },
  ], (fn) => fn());
}

function joinQueue(app, areaId) {
  const applied = applyMeetingStoneQueue({ areaId, hasGroup: (app.g.state.squad?.length ?? 0) > 0, isLeader: true });
  const queued = meetingStoneQueueStateFromApply(applied);
  if (!queued) { app.flashMsg('Only the party leader can queue the party.'); return; }
  app.g.state.meetingStoneQueue = queued;
  app.say(cyan(formatMeetingStonePlace(ERR_MEETING_STONE_IN_QUEUE_S, stonePlace(app, areaId))) + dim(queued.mode === 'group' ? '  (your party)' : ''));
}

function leaveQueue(app) {
  const left = leaveMeetingStoneQueue(app.g.state.meetingStoneQueue);
  if (!left.left) return;
  app.g.state.meetingStoneQueue = null;
  app.say(dim(formatMeetingStonePlace(ERR_MEETING_STONE_LEFT_QUEUE_S, stonePlace(app, left.areaId))));
}

/** The queue card at the top of the World tab while you are queued. */
export function meetingStoneQueueRows(app) {
  const q = app.g.state.meetingStoneQueue;
  if (!q || q.status !== MEETINGSTONE_STATUS_JOINED_QUEUE) return [];
  const place = stonePlace(app, q.areaId);
  return [
    { text: `${cyan('Looking for more')} for ${place}  ${dim(q.mode === 'group' ? 'your party is queued' : 'you are queued')}   ${dim('Enter: leave the queue')}`, act: (a) => leaveQueue(a) },
    { text: '', header: true },
  ];
}

// ---- outdoor PvP ---------------------------------------------------------------------------------------
// Eastern Plaguelands' four towers and Silithus' silithyst count, read from the world states. Read only for now:
// the banners are GameObject type 29 (capture point), which useGameObject has no case for, so interactObject
// refuses before its OutdoorPvPEP capture hook runs. That is a phonecraft engine fix.

const EP_TOWERS = [
  ['Northpass Tower', GO_TOWER_BANNER_NORTHPASS, WORLD_STATE_EP_NORTHPASS_ALLIANCE, WORLD_STATE_EP_NORTHPASS_HORDE],
  ['Crown Guard Tower', GO_TOWER_BANNER_CROWNGUARD, WORLD_STATE_EP_CROWNGUARD_ALLIANCE, WORLD_STATE_EP_CROWNGUARD_HORDE],
  ['Eastwall Tower', GO_TOWER_BANNER_EASTWALL, WORLD_STATE_EP_EASTWALL_ALLIANCE, WORLD_STATE_EP_EASTWALL_HORDE],
  ['Plaguewood Tower', GO_TOWER_BANNER_PLAGUEWOOD, WORLD_STATE_EP_PLAGUEWOOD_ALLIANCE, WORLD_STATE_EP_PLAGUEWOOD_HORDE],
];

export function outdoorPvpRows(app) {
  const vars = app.g.state.worldStates;
  const zone = app.ch.zoneId;
  if (zone === 'easternplaguelands') {
    const a = getVariable(vars, WORLD_STATE_EP_TOWER_COUNT_ALLIANCE), h = getVariable(vars, WORLD_STATE_EP_TOWER_COUNT_HORDE);
    const rows = [{ text: '', header: true }, { text: `Towers  ${cyan(`Alliance ${a}`)}  ${red(`Horde ${h}`)}`, header: true }];
    for (const [name, banner, sa, sh] of EP_TOWERS) {
      const owner = getVariable(vars, sa) === WORLD_STATE_ADD ? cyan('Alliance') : getVariable(vars, sh) === WORLD_STATE_ADD ? red('Horde') : dim('nobody');
      rows.push({ text: `  ${name}  ${owner}`, header: true, data: { tower: banner } });
    }
    return rows;
  }
  if (zone === 'silithus') {
    const max = getVariable(vars, WORLD_STATE_SI_SILITHYST_MAX) || MAX_SILITHYST;
    return [{ text: '', header: true }, { text: `Silithyst gathered  ${cyan(`Alliance ${getVariable(vars, WORLD_STATE_SI_GATHERED_A)}/${max}`)}  ${red(`Horde ${getVariable(vars, WORLD_STATE_SI_GATHERED_H)}/${max}`)}`, header: true }];
  }
  return [];
}
