// Dungeons as a text run. A dungeon is an ordered route of encounters (world/instances.ts); a room is the run of
// stops that share a roomName (dungeonRouteOrder.ts roomSequence). The run window lists the rooms with their
// stops, gates, chests and NPCs; Enter on an unlocked stop fights it live with the squad. Ports phonecraft
// instanceView.ts (the entry card), liveDungeonHeadless.ts (pulls, gates, rest, Finish instantly) and the
// floor's object clicks (liveObjectLoot.ts) onto the sequential route.
import { bold, dim, cyan, yellow, green, red, gray, qualityPaint, fit, plural, secondsText, wrapLines } from './text.mjs';
import { startFight } from './tuiFight.mjs';
import { prePull } from './squad.mjs';
import { questDialog } from './tuiViews.mjs';
import { nextDoQuestStep } from '../domain/quests/doQuest.ts';
import { moneyText } from '../domain/economy/money.ts';
import { maxHealth } from '../domain/character/character.ts';
import { bagCapacity } from '../domain/items/equipment.ts';
import { companionLevel, companionCharacter } from '../domain/bots/squad.ts';
import { applyCompanionKillXp } from '../domain/bots/companionXp.ts';
import { applyCompanionKillReputation } from '../domain/bots/companionRep.ts';
import { applyCompanionPetSync } from '../domain/bots/botPet.ts';
import { betweenPullConsumeLoop } from '../domain/bots/betweenPullRest.ts';
import { buildRunSummary, memberStatsFromEvents } from '../domain/run/dungeonRun.ts';
import { countItem, consumeOwnedCharges } from '../domain/items/inventory.ts';
import { ownedInventory } from '../domain/items/keyring.ts';
import { supplyBuys } from '../domain/bots/runSupply.ts';
import { allySideAt } from '../engine/core/events.ts';
import { isSkippableBeginFailure } from '../engine/game/types.ts';
import {
  instancePortals, routeEncounterList, routeEncounterIdList, encounterOf, isCleared, isUnlocked, nextEncounter,
  isComplete, requiredFlags, hasFlag, routeBossProgress, applyEncounterCleared, autoAdvanceRouteGates,
  itemDropsInsideInstance, lockRemainingMs, restoreSavedRun,
} from '../world/instances.ts';
import { instanceObjectPins, lootObjectPins, objectGatesFor } from '../world/instanceObjects.ts';
import { dungeonNpcsForMap } from '../data/dungeonSpawns.ts';
import { getDungeonGameObject } from '../data/dungeonGameObjects.ts';
import { countRouteTrash, selectRouteEncounters, DEFAULT_ROUTE_DENSITY, DEFAULT_PULL_FUSION } from '../world/dungeonRoute.ts';
import { WIPE_RETRY_PER_PULL, WIPE_CAP_PER_RUN } from '../world/dungeonPreset.ts';
import { rosterDialog, lineupDialog, paladinDialog, partyHasPaladin, walkingIn, lineupSize } from './tuiRaid.mjs';

const H = (text) => ({ text, header: true });
const KIND_GLYPH = { boss: red('B'), trash: yellow('T'), rare: cyan('R'), object: dim('O'), entrance: dim('>'), exit: dim('<') };
const ROLE_NAME = { tank: 'tank', healer: 'healer', dps: 'damage' };

const runDef = (app) => (app.g.state.instance ? app.ds.instance(app.g.state.instance.dungeonId) : null);
const hasOwned = (app) => (entry) => countItem(ownedInventory(app.g.state.inventory, app.g.state.keyring), entry) > 0;
const bagCapacityOf = (app) => bagCapacity(app.ch, app.ds);
const isRaid = (def) => (def.maxPlayers ?? 5) > 5;

/** Bodies in a stop: the pack's counts, or the primary alone. */
function packSize(enc) {
  const n = (enc.pack ?? []).reduce((s, m) => s + (m.count ?? 1), 0);
  return Math.max(1, n);
}

// ---- portals and entry ------------------------------------------------------------------------------------

function lockText(app, def, now = Date.now()) {
  const g = app.g;
  const held = restoreSavedRun(g.state.instanceSaves, def.id, now);
  const lock = lockRemainingMs(g.state.lockouts ?? {}, def.id, now);
  if (held) {
    const left = (g.state.instanceSaves?.[def.id]?.expiresAtMs ?? now) - now;
    return yellow(`your run is held, ${held.defeated.length} cleared, ${secondsText(left)} left`);
  }
  if (lock > 0) return red(`saved, ${secondsText(lock)} left`);
  return '';
}

/** World tab rows: the instance portals in this zone. */
export function portalRows(app) {
  const g = app.g, ds = app.ds, ch = app.ch;
  const rows = [];
  if (g.state.instance) {
    const def = runDef(app);
    rows.push(H(''), H('Dungeon'), { text: `${green('▶')} Back into ${bold(def?.name ?? g.state.instance.dungeonId)}`, detail: () => [bold(def?.name ?? ''), 'You are inside this dungeon.', '', dim('Enter: the run window')], act: () => openRun(app) });
    return rows;
  }
  const portals = instancePortals(ds, ch.zoneId).filter((d) => !d.id.startsWith('alterac'));
  if (!portals.length) return rows;
  rows.push(H(''), H(`Dungeons (${portals.length})`));
  for (const def of portals) {
    const low = ch.level < def.minLevel;
    const lock = lockText(app, def);
    rows.push({
      text: `${low ? dim(def.name) : cyan(def.name)} ${dim(`L${def.levelRange[0]}-${def.levelRange[1]}${isRaid(def) ? `  ${def.maxPlayers}-man raid` : ''}`)}${low ? red(`  requires ${def.minLevel}`) : ''}${lock ? `  ${lock}` : ''}`,
      data: { dungeon: def },
      detail: () => portalLines(app, def),
      act: () => app.push(entryDialog(app, def)),
    });
  }
  return rows;
}

function portalLines(app, def) {
  const bosses = def.encounters.filter((e) => e.kind === 'boss');
  const out = [bold(def.name), dim(`levels ${def.levelRange[0]}-${def.levelRange[1]}, requires ${def.minLevel}${isRaid(def) ? `, ${def.maxPlayers} players` : ''}`)];
  const lock = lockText(app, def);
  if (lock) out.push(lock);
  out.push('', cyan(`Bosses (${bosses.length})`), ...bosses.slice(0, 14).map((b) => `  ${b.name}`), ...(bosses.length > 14 ? [dim(`  and ${bosses.length - 14} more`)] : []));
  out.push('', dim('Enter: route, party and supplies, then go in'));
  return out;
}

/** The card before the door: route density, party or raid, food and water, Enter. */
export function entryDialog(app, def) {
  const opts = { routeDensity: DEFAULT_ROUTE_DENSITY, asRaid: isRaid(def) };
  return {
    id: `enter-${def.id}`, title: def.name, hint: 'Enter: choose',
    rows(a) {
      const g = a.g;
      const squad = g.state.squad ?? [];
      const rows = [H(`${bold(def.name)}  ${dim(`L${def.levelRange[0]}-${def.levelRange[1]}`)}  ${lockText(a, def)}`), H('')];
      const held = restoreSavedRun(g.state.instanceSaves, def.id, Date.now());
      if (held) rows.push(H(yellow(`Your earlier run is held: ${held.defeated.length} stops cleared. Entering continues it.`)), H(''));
      rows.push({ text: green(held ? 'Go back in' : 'Enter the dungeon'), detail: () => [bold('Enter'), '', `${opts.routeDensity === 'full' ? 'Every pack on the way' : 'Bosses and what guards them'}; ${opts.asRaid ? 'as a raid, the bench comes too' : `you and ${plural(squad.length, 'companion')}`}.`], act: () => enter(a, def, opts) });
      const pace = (d) => ({ text: `Route: ${cyan(d === 'full' ? 'Full' : 'Bosses')}`, detail: () => [bold('Route density'), '', 'Bosses: the bosses and the packs that stand in their way.', 'Full: every pack in the dungeon.', '', dim('Enter: switch')], act: () => { opts.routeDensity = opts.routeDensity === 'full' ? 'bosses' : 'full'; } });
      rows.push(pace(opts.routeDensity));
      rows.push({ text: `Group: ${cyan(opts.asRaid ? 'Raid' : 'Party')}`, detail: () => [bold('Party or raid'), '', 'Party: you and the up to four companions you have seated.', `Raid: the bench comes too, up to ${(def.maxPlayers ?? 5) - 1} companions.`, '', dim('Enter: switch')], act: () => { opts.asRaid = !opts.asRaid; } });
      const walk = walkingIn(g, def, opts.asRaid);
      rows.push({ text: `Who walks in: ${cyan(`${walk.ids.length} of ${walk.cap}`)}${walk.picked ? '' : dim('  (auto)')}`, detail: () => [bold('Who walks in'), '', 'Pick from every companion you own, or Fill to match what this instance wants.', '', dim('Enter: pick')], act: () => a.push(rosterDialog(a, def, () => opts.asRaid)) });
      if (isRaid(def)) { const size = lineupSize(def.maxPlayers); rows.push({ text: `Raid group (${size}-man): ${cyan(String(g.state.raidLineup?.size === size ? g.state.raidLineup.ids.length : 0))}`, detail: () => [bold(`${size}-man group`), '', 'The raid group you keep for every raid this size. A pick at the door above wins over it.'], act: () => a.push(lineupDialog(a, size)) }); }
      if (partyHasPaladin(g)) rows.push({ text: 'Paladin blessings', detail: () => [bold('PallyPower'), '', 'Who blesses which class with what, and which aura each paladin keeps up.'], act: () => a.push(paladinDialog(a)) });
      const byId = new Map([...squad, ...Object.values(g.state.botRoster ?? {})].map((c) => [c.id, c]));
      rows.push(H(''), H(`Party ${walk.ids.length + 1}`));
      rows.push(H(`  ${a.ch.name} ${dim(`L${a.ch.level}`)}`));
      for (const c of walk.ids.map((id) => byId.get(id)).filter(Boolean)) rows.push(H(`  ${c.name} ${dim(`L${companionLevel(c, a.ch.level)} ${ROLE_NAME[c.role] ?? c.role}`)}`));
      if (!walk.ids.length) rows.push(H(dim('  Nobody with you. Companions are hired at inns; dungeons are built for five.')));
      rows.push(...supplyRows(a));
      return rows;
    },
  };
}

function enter(app, def, opts) {
  const r = app.g.enterInstance(def.id, Date.now(), { routeDensity: opts.routeDensity, asRaid: opts.asRaid });
  if (!app.result(r, `You enter ${def.name}.`)) return;
  app.dungeonPulls = [];
  app.stack = [];
  openRun(app);
}

// Food and water before the door: who is short, the vendor ladder, what it costs (runSupplyPanel.ts).
function supplyRows(app) {
  const plan = app.g.runSupplyPlan();
  const rows = [H(''), H(`Food and water ${dim(plan.mage ? '(a mage conjures both on the way)' : plan.rows.length ? `${moneyText(plan.cost)} for everyone` : 'everyone has enough')}`)];
  if (plan.mage || !plan.rows.length) return rows;
  for (const r of plan.rows) {
    const rung = r.ladder[r.rung];
    rows.push(H(`  ${fit(r.memberName, 12)} ${fit(r.kind, 6)} ${dim(`has ${r.have}, short ${r.short}`)}  ${rung?.item?.name ?? '?'} x${r.units}  ${yellow(moneyText(r.cost))}`));
  }
  const buys = supplyBuys(plan.rows, app.ch.gold, true);
  rows.push({
    text: buys.length ? `Buy them ${yellow(`(${moneyText(buys.reduce((s, b) => s + b.cost, 0))})`)}` : dim('Buy them (not enough gold)'),
    detail: () => [bold('Buy supplies'), '', 'The vendor price, straight into each member\'s own bags. What does not fit is left out.', ...(plan.full.length ? ['', yellow(`Bags full: ${plan.full.map((f) => f.name).join(', ')}`)] : [])],
    act: () => { if (!buys.length) { app.flashMsg('Not enough gold for any of it.'); return; } const r = app.g.buyRunSupplies(buys); app.result(r, r.ok ? `Bought ${r.units} food and water for ${moneyText(r.spent)}.` : ''); },
  });
  return rows;
}

// ---- the run window -------------------------------------------------------------------------------------

/** Push the run window unless it is already on top. */
export function openRun(app) {
  if (!app.g.state.instance) return;
  app.dungeonPulls ??= [];
  if (app.stack.some((v) => v.id === 'dungeon')) { app.popTo('dungeon'); app.render(); return; }
  app.push(runView(app));
}

/** Route stops grouped into rooms: consecutive stops sharing a roomName, unnamed ones riding with the room before. */
function roomsOf(def, run) {
  const route = routeEncounterList(def, run);
  const rooms = [];
  for (const enc of route) {
    const name = enc.roomName ?? rooms[rooms.length - 1]?.name ?? def.name;
    if (rooms[rooms.length - 1]?.name !== name) rooms.push({ name, stops: [] });
    rooms[rooms.length - 1].stops.push(enc);
  }
  return rooms;
}

/** Who opens a flag: the gate object that sets it (by its baked name), or the stop whose clear sets it. */
function flagSource(app, def, flag) {
  for (const gate of objectGatesFor(def)) if (gate.setsFlag === flag) return app.ds.gameObject(gate.goEntry)?.name ?? `the ${gate.enc.name} gate`;
  for (const enc of def.encounters) if ((enc.events ?? []).some((e) => e.kind === 'setsFlag' && e.flag === flag)) return enc.name;
  return flag;
}

function stopState(def, run, enc) {
  if (isCleared(run, enc.id)) return 'cleared';
  return isUnlocked(def, run, enc.id) ? 'open' : 'locked';
}

function stopText(app, def, run, enc, next) {
  const st = stopState(def, run, enc);
  const n = packSize(enc);
  const name = st === 'cleared' ? gray(enc.name) : st === 'locked' ? dim(enc.name) : enc.kind === 'boss' ? red(bold(enc.name)) : enc.name;
  const tail = st === 'cleared' ? green('  ✓') : st === 'locked' ? dim(`  locked: ${requiredFlags(enc).filter((f) => !hasFlag(run, f)).map((f) => flagSource(app, def, f)).join(', ')}`) : enc.id === next?.id ? yellow('  ◀ next') : '';
  return `${KIND_GLYPH[enc.kind] ?? dim('·')} ${name}${n > 1 ? dim(` x${n}`) : ''}${enc.optional ? dim('  optional') : ''}${tail}`;
}

function stopLines(app, def, run, enc) {
  const ds = app.ds;
  const out = [bold(enc.name), dim(`${enc.kind}${enc.roomName ? `, ${enc.roomName}` : ''}${enc.optional ? ', optional' : ''}`)];
  const st = stopState(def, run, enc);
  if (st === 'cleared') out.push(green('Cleared'));
  if (st === 'locked') for (const f of requiredFlags(enc).filter((x) => !hasFlag(run, x))) out.push(red(`Locked until ${flagSource(app, def, f)}`));
  if (enc.intro) out.push('', ...wrapLines(yellow(enc.intro), 56));
  const members = (enc.pack?.length ? enc.pack : [{ creatureEntry: enc.creatureEntry, count: 1 }]);
  out.push('', cyan('Pack'));
  for (const m of members) {
    const c = ds.creature(m.creatureEntry);
    out.push(`  ${m.count > 1 ? `${m.count}x ` : ''}${c?.name ?? m.creatureEntry} ${dim(c ? `L${c.level}${c.rank ? ' elite' : ''}  ${c.hpMax} hp` : '')}`);
  }
  if (enc.bossSpells?.length) out.push('', cyan('Abilities'), ...enc.bossSpells.slice(0, 8).map((id) => `  ${ds.spell(id)?.name ?? id}`));
  const sets = (enc.events ?? []).filter((e) => e.kind === 'setsFlag');
  if (sets.length) out.push('', dim(`Clearing it opens: ${def.encounters.filter((x) => requiredFlags(x).some((f) => sets.some((s) => s.flag === f))).map((x) => x.name).join(', ') || 'the way on'}`));
  if (st === 'open') out.push('', dim('Enter: pull it'));
  return out;
}

/** Each object or NPC goes with the route stop standing nearest it, so it lists in that stop's room. */
function nearestStop(route, x, y) {
  let best = null, bd = Infinity;
  for (const enc of route) {
    if (!enc.origin) continue;
    const d = (enc.origin.x - x) ** 2 + (enc.origin.y - y) ** 2;
    if (d < bd) { bd = d; best = enc; }
  }
  return best;
}

/** Gates, chests and NPCs on this map, each keyed to its nearest stop's id. */
function roomObjects(app, def, run) {
  const route = routeEncounterList(def, run);
  const byStop = new Map();
  const add = (x, y, row) => { const s = nearestStop(route, x, y); const k = s?.id ?? '_'; if (!byStop.has(k)) byStop.set(k, []); byStop.get(k).push(row); };
  const has = hasOwned(app);
  const seenGate = new Set();
  for (const p of instanceObjectPins(def, run, { hasItem: has })) {
    const key = `${p.setsFlag}:${p.goEntry}`;
    if (seenGate.has(key)) continue; // one row per gate object kind, not per spawn
    seenGate.add(key);
    add(p.x, p.y, { kind: 'gate', pin: p });
  }
  for (const p of lootObjectPins(def, run, { hasItem: has })) add(p.x, p.y, { kind: 'chest', pin: p });
  for (const s of dungeonNpcsForMap(def.mapId)) {
    const quests = npcQuests(app, s.entry);
    if (!quests.offer.length && !quests.turnIn.length && !quests.escort.length) continue;
    add(s.x, s.y, { kind: 'npc', spawn: s, quests });
  }
  return byStop;
}

/** Quests an NPC offers, takes back or is escorted in, from the quest relations on each QuestDef. */
function npcQuests(app, entry) {
  const ds = app.ds, log = app.g.state.questlog.quests;
  app.npcQuestIndex ??= buildNpcQuestIndex(ds);
  const idx = app.npcQuestIndex.get(entry) ?? { starts: [], ends: [] };
  const have = new Map(log.map((q) => [q.entry, q]));
  const offer = idx.starts.filter((q) => !have.has(q.entry) && q.minLevel <= app.ch.level);
  const turnIn = idx.ends.filter((q) => have.get(q.entry)?.status === 'complete');
  const escort = idx.starts.filter((q) => have.get(q.entry)?.status === 'active' && nextDoQuestStep(app.g.state, ds, q.entry).kind === 'escort');
  return { offer, turnIn, escort };
}
function buildNpcQuestIndex(ds) {
  const idx = new Map();
  const at = (e) => { if (!idx.has(e)) idx.set(e, { starts: [], ends: [] }); return idx.get(e); };
  for (const q of ds.quests()) {
    for (const e of q.starterCreatureEntries ?? []) at(e).starts.push(q);
    for (const e of q.enderCreatureEntries ?? []) at(e).ends.push(q);
  }
  return idx;
}

/** Open a chest and take what it holds (GO loot lands in the loot window; this takes it all). */
function openChest(app, pin) {
  const r = app.g.lootInstanceObject(pin.guid);
  if (!app.result(r)) return false;
  const took = app.g.takeAllLoot();
  app.say(`You open ${pin.name}.${r.loot.length ? '' : ' It is empty.'}`);
  for (const d of took.ok ? took.taken : []) app.say(`  ${yellow('You receive')} ${qualityPaint(app.ds.item(d.item)?.quality)(app.itemName(d.item))}${d.count > 1 ? ` x${d.count}` : ''}`);
  if (took.ok && took.copper) app.say(`  ${yellow('You receive')} ${moneyText(took.copper)}`);
  if (took.ok && took.remaining) app.say(red(`  ${plural(took.remaining, 'item')} did not fit in your bags.`));
  return true;
}

function objectRow(app, def, o) {
  const ds = app.ds;
  if (o.kind === 'gate') {
    const p = o.pin;
    const need = p.requiredItem != null ? app.itemName(p.requiredItem) : null;
    const state = p.state === 'used' ? green('  open') : p.state === 'needsItem' ? red(`  needs ${need}`) : yellow('  use it');
    return {
      text: `${dim('◇')} ${p.name}${state}`,
      detail: () => [bold(p.name), `Opens the way to ${p.encounterName}.`, need ? `Needs ${need}.` : '', '', p.state === 'used' ? dim('Already open.') : dim('Enter: use it')],
      act: () => {
        const r = app.g.useInstanceObject(p.goEntry);
        if (!app.result(r)) return;
        app.say(r.already ? dim(`${p.name} is already open.`) : r.completed ? green(`You use ${p.name}. The way to ${p.encounterName} opens.`) : cyan(`You use ${p.name} (${r.uses}/${r.needUses}).`));
      },
    };
  }
  if (o.kind === 'chest') {
    const p = o.pin;
    const need = p.requiredItem != null ? app.itemName(p.requiredItem) : null;
    return {
      text: `${dim('▣')} ${p.state === 'looted' ? gray(p.name) : p.name}${p.state === 'looted' ? dim('  empty') : p.state === 'needsItem' ? red(`  locked, needs ${need}`) : ''}`,
      detail: () => [bold(p.name), p.state === 'looted' ? 'You have emptied it.' : need ? `Opens with ${need}.` : 'It can be opened.', '', dim('Enter: open it')],
      act: () => openChest(app, p),
    };
  }
  const { spawn, quests } = o;
  const name = spawn.name ?? ds.creature(spawn.entry)?.name ?? `npc ${spawn.entry}`;
  const marks = `${quests.turnIn.length ? green(' ?') : ''}${quests.offer.length ? yellow(' !') : ''}${quests.escort.length ? cyan(' escort') : ''}`;
  return {
    text: `${dim('☺')} ${name}${marks}`,
    detail: () => [bold(name), ...quests.offer.map((q) => `${yellow('!')} ${q.title}`), ...quests.turnIn.map((q) => `${green('?')} ${q.title}`), ...quests.escort.map((q) => `${cyan('escort')} ${q.title}`), '', dim('Enter: speak with them')],
    act: () => npcDialog(app, spawn.entry, name),
  };
}

function npcDialog(app, entry, name) {
  const r = app.g.talkToNpc({ creatureEntry: entry });
  if (r.ok) app.flushActivity();
  const q = npcQuests(app, entry);
  const opts = [
    ...q.turnIn.map((x) => ({ label: `${green('?')} ${x.title}`, value: () => app.push(questDialog(app, x, 'log')) })),
    ...q.offer.map((x) => ({ label: `${yellow('!')} ${x.title}`, value: () => app.push(questDialog(app, x, 'offer')) })),
    ...q.escort.map((x) => ({ label: `${cyan('Escort')} ${x.title}`, value: () => app.result(app.g.finishEscort(x.entry), `You see ${name} through: ${x.title}.`) })),
  ];
  if (!opts.length) { app.say(dim(`${name} has nothing for you.`)); return; }
  app.pick(name, opts, (fn) => fn());
}

function partyLines(app) {
  const g = app.g, ch = app.ch;
  const out = [`  ${fit(ch.name, 12)} ${dim(`L${ch.level}`)}  ${hpTag(ch.health, maxHealth(ch, app.ds))}`];
  for (const c of g.state.squad ?? []) {
    const lvl = companionLevel(c, ch.level);
    const max = maxHealth(companionCharacter(c, lvl, app.ds), app.ds);
    out.push(`  ${fit(c.name, 12)} ${dim(`L${lvl} ${ROLE_NAME[c.role] ?? c.role}`)}  ${hpTag(c.health ?? max, max)}`);
  }
  return out;
}
const hpTag = (hp, max) => (hp <= 0 ? red('dead') : (hp / max < 0.5 ? yellow : green)(`${Math.round((hp / Math.max(1, max)) * 100)}%`));

export function runView(app) {
  return {
    id: 'dungeon', title: runDef(app)?.name ?? 'Dungeon', hint: 'Enter: pull / use',
    keys: {
      z: { hint: 'rest', fn: (a) => restBetween(a, 30) },
      F: { hint: 'finish instantly', fn: (a) => a.confirm('Run every remaining stop now, without watching?', () => finishInstantly(a)) },
      L: { hint: 'leave', fn: (a) => leaveRun(a) },
      P: { hint: 'blessings', fn: (a) => a.push(paladinDialog(a)) },
      R: { hint: 'reset', fn: (a) => a.confirm('Reset the run? Every stop comes back.', () => { if (a.result(a.g.resetInstance(), 'The dungeon resets.')) a.dungeonPulls = []; }) },
    },
    rows(a) {
      const g = a.g, run = g.state.instance, def = runDef(a);
      if (!run || !def) { setTimeout(() => { if (a.top()?.id === 'dungeon') a.pop(); }, 0); return [H('You are back in the world.')]; }
      const rooms = roomsOf(def, run);
      const next = nextEncounter(def, run);
      const here = rooms.find((r) => r.stops.some((s) => s.id === next?.id)) ?? rooms[rooms.length - 1];
      const ids = routeEncounterIdList(def, run);
      const required = ids.filter((id) => encounterOf(def, id, run)?.optional !== true);
      const done = required.filter((id) => isCleared(run, id)).length;
      const boss = routeBossProgress(def, run);
      const rows = [H(`${bold(def.name)}   ${dim('room')} ${cyan(here?.name ?? '')}   ${dim(`${done}/${required.length} cleared, bosses ${boss.down}/${boss.total}`)}${isComplete(def, run) ? green('   cleared!') : ''}`)];
      rows.push(...partyLines(a).map(H));
      const objects = roomObjects(a, def, run);
      for (const room of rooms) {
        const cleared = room.stops.every((s) => isCleared(run, s.id));
        rows.push(H(''), H(`${room.name}${cleared ? green('  ✓') : ''}${room === here ? dim('  you are here') : ''}`));
        for (const enc of room.stops) {
          rows.push({
            text: `  ${stopText(a, def, run, enc, next)}`, data: { stop: enc },
            detail: () => stopLines(a, def, run, enc),
            act: () => pullStop(a, def, enc),
          });
          for (const o of objects.get(enc.id) ?? []) { const r = objectRow(a, def, o); rows.push({ ...r, text: `    ${r.text}`, data: { object: o } }); }
        }
      }
      for (const o of objects.get('_') ?? []) rows.push({ ...objectRow(a, def, o), data: { object: o } });
      rows.push(H(''), { text: dim('Leave the dungeon'), detail: () => [bold('Leave'), '', isRaid(def) ? 'A raid holds your progress until the lockout resets.' : 'A 5-man holds your progress for 30 minutes.'], act: () => leaveRun(a) });
      return rows;
    },
  };
}

// ---- pulls ---------------------------------------------------------------------------------------------

function pullStop(app, def, enc) {
  const run = app.g.state.instance;
  if (!run) return;
  if (isCleared(run, enc.id)) { app.flashMsg(`${enc.name} is already cleared.`); return; }
  if (!isUnlocked(def, run, enc.id)) { app.flashMsg(`${enc.name} is locked.`); return; }
  for (const l of prePull(app.g, app.ds, app.cmds.buffPace)) app.say(cyan(l));
  let playerMax = 0, session = null;
  const f = startFight(app, enc.creatureEntry, {
    label: enc.kind === 'boss' ? 'boss' : undefined,
    begin: () => { const b = app.g.beginEncounter(def.id, enc.id, { withSquad: true }); if (b.ok) { playerMax = b.playerMax; session = b.session; } return b; },
    after: (r) => { recordPull(app, def, enc, r, playerMax, session, app.dungeonDowntime ?? 0); app.dungeonDowntime = 0; },
    onEnd: (r) => {
      if (!r) return;
      if (r.outcome === 'defeat') app.say(red('The party wipes. Rest, then try again.'));
      if (app.g.state.instance && isComplete(def, app.g.state.instance)) app.say(green(bold(`${def.name} is cleared.`)));
    },
  });
  if (f.ok && enc.intro) app.say(yellow(enc.intro));
}

/** Companion kill xp and reputation for a dungeon win (the engine leaves encounter xp to the run driver). */
function grantSquadKillXp(app, creatureEntry) {
  const g = app.g, ds = app.ds, def = ds.creature(creatureEntry);
  if (!def) return;
  for (const comp of g.state.squad ?? []) {
    const r = applyCompanionKillXp(comp, def, g.state.char.level, ds);
    for (const lv of r.leveledTo) app.say(green(`  ${comp.name} reaches level ${lv}!`));
    if (r.leveledTo.length) applyCompanionPetSync(comp, companionLevel(comp, g.state.char.level), ds);
    applyCompanionKillReputation(comp, def, g.state.char.level, ds, undefined, (msg) => { g.state.activity.unshift(msg); });
  }
}

function guardianOwners(app, session) {
  const owners = {};
  if (app.g.state.char.pet) owners.pet = 'player';
  if (session?.companionPets) { for (const cp of session.companionPets()) owners[cp.side] = cp.ownerSide; return owners; }
  (app.g.squadBattleParty().allyPetIndex ?? []).forEach((p, human) => { if (p != null && p >= 0) owners[allySideAt(p)] = allySideAt(human); });
  return owners;
}

function recordPull(app, def, enc, r, playerMax, session, downtimeSec) {
  const won = r.outcome === 'win';
  if (won) grantSquadKillXp(app, enc.creatureEntry);
  (app.dungeonPulls ??= []).push({
    encounterId: enc.id, name: enc.name, kind: enc.kind === 'boss' ? 'boss' : 'trash',
    outcome: r.outcome, durationMs: r.result.durationMs, xpGained: r.xpGained, goldGained: r.goldGained, loot: r.loot,
    endHpPct: playerMax > 0 ? Math.max(0, r.result.player.hp) / playerMax : 0, downtimeSec,
    memberStats: memberStatsFromEvents(r.result.events, {
      playerName: app.ch.name, petName: app.g.state.char.pet?.name,
      allies: (app.g.state.squad ?? []).map((c) => ({ name: c.name, role: c.role })),
      guardianOwners: guardianOwners(app, session),
      ...(r.result.damageTakenBySide ? { damageTakenBySide: r.result.damageTakenBySide } : {}),
    }),
  });
}

/** Between pulls: eat and drink from the bags to the squad strategy's rest line, then sit (betweenPullRest.ts). */
function restBetween(app, seconds) {
  const g = app.g;
  const r = betweenPullConsumeLoop({ char: g.state.char, inventory: g.state.inventory, ds: app.ds, strategy: g.state.squadStrategy, deathFlow: g.state.deathFlow });
  g.state.char = r.char; g.state.inventory = r.inventory;
  app.idleTick(seconds, true);
  app.dungeonDowntime = (app.dungeonDowntime ?? 0) + r.seconds + seconds;
  app.say(dim(`The party rests${r.seconds ? ` and eats (${Math.round(r.seconds)} s)` : ''}.  HP ${app.hpText()}  ${app.pwText()}`));
}

/** Open gates that need no item, and route flags the density skipped (liveDungeonHeadless.ts autoFireGates). */
function autoFireGates(app) {
  const g = app.g, ds = app.ds, inst = g.state.instance;
  const def = inst && ds.instance(inst.dungeonId);
  if (!def) return;
  const auto = autoAdvanceRouteGates(def, inst, hasOwned(app), {
    keyDropsInside: (entry) => itemDropsInsideInstance(def, entry, (id) => ds.lootTable(id), (go) => ds.gameObject(go)?.lootId),
  });
  if (auto.fired > 0) g.state.instance = auto.run;
  for (const entry of auto.consumedItems) {
    const spent = consumeOwnedCharges(g.state.inventory, g.state.keyring, entry, ds.item(entry));
    g.state.inventory = spent.bags; g.state.keyring = spent.keyring;
  }
}

/** A gate whose key lies in a chest on this map (Defias Gunpowder for the Defias Cannon): open the chest, use the
 *  gate. What a player standing in the room does by hand; the route stops there otherwise. */
function openKeyedGates(app, def) {
  const g = app.g, ds = app.ds, has = hasOwned(app);
  const holds = (guid, item) => { const lootId = getDungeonGameObject(guid)?.lootId; return !!lootId && ds.lootTable(`go:${lootId}`).some((r) => r.item === item); };
  let opened = false;
  for (const gate of instanceObjectPins(def, g.state.instance, { hasItem: has })) {
    if (gate.state !== 'needsItem' || gate.requiredItem == null) continue;
    const chest = lootObjectPins(def, g.state.instance, { hasItem: has }).find((p) => p.state === 'ready' && holds(p.guid, gate.requiredItem));
    if (!chest) continue;
    openChest(app, chest);
    for (let i = 0; i < 5 && has(gate.requiredItem); i++) {
      const u = g.useInstanceObject(gate.goEntry);
      if (!u.ok) break;
      if (u.completed) { app.say(green(`You use ${gate.name}. The way to ${gate.encounterName} opens.`)); opened = true; break; }
    }
  }
  return opened;
}

/** F: every remaining stop resolves headlessly, the squad in, resting between pulls; then the summary. */
export function finishInstantly(app) {
  const g = app.g, ds = app.ds;
  const def = runDef(app);
  if (!def) return;
  let stopReason;
  const tries = new Map();
  let wipes = 0;
  for (let guard = 0; guard < 300; guard++) {
    autoFireGates(app);
    const inst = g.state.instance;
    if (!inst) break;
    const enc = nextEncounter(def, inst);
    if (!enc) {
      if (isComplete(def, inst)) break;
      if (openKeyedGates(app, def)) continue;
      const stuck = instanceObjectPins(def, inst, { hasItem: hasOwned(app) }).find((p) => p.state === 'needsItem');
      stopReason = stuck ? `${stuck.name} needs ${app.itemName(stuck.requiredItem)}${(app.g.state.inventory.stacks.length >= bagCapacityOf(app)) ? ' (your bags are full)' : ''}.` : 'No unlocked stop left: a door or a key is missing.';
      break;
    }
    const r0 = betweenPullConsumeLoop({ char: g.state.char, inventory: g.state.inventory, ds, strategy: g.state.squadStrategy, deathFlow: g.state.deathFlow });
    g.state.char = r0.char; g.state.inventory = r0.inventory;
    prePull(g, ds, app.cmds.buffPace);
    const b = g.beginEncounter(def.id, enc.id, { withSquad: true });
    if (!b.ok) {
      if (isSkippableBeginFailure(b.reason)) { g.state.activity.unshift(`Skipping ${enc.name}: ${b.reason}`); g.state.instance = applyEncounterCleared(g.state.instance, enc); continue; }
      stopReason = b.reason; break;
    }
    b.session.runToEnd();
    const r = g.resolveFight(b.session);
    recordPull(app, def, enc, r, b.playerMax, b.session, r0.seconds);
    app.say(`${r.outcome === 'win' ? green('✓') : red('✗')} ${enc.name}  ${dim(`${(r.result.durationMs / 1000).toFixed(1)} s${r.xpGained ? `  +${r.xpGained} xp` : ''}`)}`);
    for (const d of r.loot) app.say(`    ${yellow('You receive')} ${app.itemName(d.item)}${d.count > 1 ? ` x${d.count}` : ''}`);
    // runFullDungeon's rule: a pull that wipes or times out is tried again, WIPE_RETRY_PER_PULL times, WIPE_CAP_PER_RUN wipes a run.
    if (r.outcome !== 'win') {
      const n = (tries.get(enc.id) ?? 0) + 1;
      tries.set(enc.id, n);
      if (r.outcome === 'defeat') wipes++;
      if (n >= WIPE_RETRY_PER_PULL || wipes >= WIPE_CAP_PER_RUN) { stopReason = `${r.outcome === 'defeat' ? 'Party wiped' : 'Combat timed out'} on ${enc.name} (${plural(n, 'attempt')})`; break; }
      app.say(dim(`  ${r.outcome === 'defeat' ? 'Wipe' : 'Timed out'}: the party runs back and pulls again (attempt ${n + 1} of ${WIPE_RETRY_PER_PULL}).`));
    }
  }
  const summary = runSummary(app, def, stopReason);
  if (summary) app.push(summaryView(app, summary));
}

function runSummary(app, def, stopReason) {
  const inst = app.g.state.instance;
  if (!inst) return null;
  const ids = routeEncounterIdList(def, inst);
  const required = ids.filter((id) => encounterOf(def, id, inst)?.optional !== true);
  const boss = routeBossProgress(def, inst);
  const density = inst.routeDensity ?? DEFAULT_ROUTE_DENSITY;
  return buildRunSummary({
    dungeonId: def.id, dungeonName: def.name, pulls: app.dungeonPulls ?? [],
    encounterTotal: Math.max(1, required.length), bossTotal: boss.total,
    encountersCleared: required.filter((id) => isCleared(inst, id)).length, bossesDown: boss.down,
    ...(stopReason ? { stopReason } : {}),
    routeDensity: density, pullFusion: inst.pullFusion ?? DEFAULT_PULL_FUSION,
    packsAvailable: countRouteTrash(selectRouteEncounters(def, 'full')), packsOnRoute: countRouteTrash(selectRouteEncounters(def, density)),
    routeComplete: isComplete(def, inst),
  });
}

export function summaryView(app, s) {
  return {
    id: 'run-summary', title: 'Run report', hint: 'Esc: back', noDetail: true,
    rows(a) {
      const tag = s.outcome === 'clear' ? green(bold('Cleared')) : s.outcome === 'wipe' ? red(bold('Wiped')) : yellow(bold('Partial'));
      const deaths = s.pulls.filter((p) => p.outcome === 'defeat').length;
      const rows = [H(`${bold(s.dungeonName)}  ${tag}`), H('')];
      rows.push(H(`  ${s.encountersCleared}/${s.encounterTotal} stops, bosses ${s.bossesDown}/${s.bossTotal}, ${plural(s.pulls.length, 'pull')}, ${plural(deaths, 'wipe')}`));
      rows.push(H(`  ${secondsText(s.combatMs)} fighting, ${secondsText(s.downtimeSec * 1000)} resting   +${s.totalXp} xp   ${moneyText(s.totalGold) || '0c'}`));
      if (s.stopReason) rows.push(H(red(`  Stopped: ${s.stopReason}`)));
      if (s.memberTotals?.length) {
        const secs = Math.max(1, s.combatMs / 1000);
        rows.push(H(''), H(`${fit('Party', 16)} ${fit('damage', 10)} ${fit('dps', 7)} ${fit('healing', 10)} ${fit('hps', 7)} taken`));
        for (const m of s.memberTotals) rows.push(H(`  ${fit(m.name, 14)} ${fit(String(m.damage), 10)} ${fit((m.damage / secs).toFixed(1), 7)} ${fit(String(m.healing), 10)} ${fit((m.healing / secs).toFixed(1), 7)} ${m.damageTaken ?? ''}`));
      }
      if (s.totalLoot?.length) {
        rows.push(H(''), H('Loot'));
        for (const l of s.totalLoot) rows.push(H(`  ${qualityPaint(a.ds.item(l.item)?.quality)(a.itemName(l.item))}${l.count > 1 ? ` x${l.count}` : ''}`));
      }
      if (s.keyMoments?.length) rows.push(H(''), H('Moments'), ...s.keyMoments.map((k) => H(`  ${k}`)));
      rows.push(H(''), H('Pulls'));
      for (const p of s.pulls) rows.push(H(`  ${p.outcome === 'win' ? green('✓') : red('✗')} ${fit(p.name, 28)} ${dim(`${(p.durationMs / 1000).toFixed(1)} s  ${Math.round(p.endHpPct * 100)}% hp`)}`));
      return rows;
    },
  };
}

function leaveRun(app) {
  const def = runDef(app);
  const r = app.g.leaveInstance(Date.now());
  if (!app.result(r, `You leave ${def?.name ?? 'the dungeon'}.`)) return;
  app.dungeonPulls = [];
  app.stack = [];
  app.switchTab(0);
}
