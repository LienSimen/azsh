// Dungeons as a text run. A dungeon is an ordered route of encounters (world/instances.ts); a room is the run of
// stops that share a roomName (dungeonRouteOrder.ts roomSequence). The run window lists the rooms with their
// stops, gates, chests and NPCs; Enter on an unlocked stop fights it live with the squad. Ports the web client's
// instanceView.ts (the entry card), liveDungeonHeadless.ts (pulls, gates, rest, Finish instantly) and the
// floor's object clicks (liveObjectLoot.ts) onto the sequential route.
import { bold, dim, cyan, yellow, green, red, gray, qualityPaint, fit, plural, secondsText, wrapLines, itemText, coinText } from './text.mjs';
import { openFloor, loadNavMesh } from './tuiFloor.mjs';
import { startFight } from './tuiFight.mjs';
import { noteLoot } from './tuiFightPanes.mjs';
import { autoLootOn, openLoot, takeAll, toastLoot } from './tuiLoot.mjs';
import { prePull } from './squad.mjs';
import { prepOoc, prepText } from './oocPrep.mjs';
import { questDialog, objectLines } from './tuiViews.mjs';
import { bookDialog } from './tuiWorld.mjs';
import { nextDoQuestStep } from '../domain/quests/doQuest.ts';
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
  itemDropsInsideInstance, lockRemainingMs, restoreSavedRun, canEnter, NORMAL_INSTANCE_RESET_TIME_MS,
} from '../world/instances.ts';
import { instanceObjectPins, lootObjectPins, objectGatesFor, textObjectPins } from '../world/instanceObjects.ts';
import { firstPageForGo } from '../data/pageTexts.ts';
import { dungeonNpcsForMap } from '../data/dungeonSpawns.ts';
import { extraEntrancesForInstance } from '../data/dungeons/pack-from-clusters.ts';
import { buildEntryLockInputs } from '../domain/run/canEnterContext.ts';
import { getDungeonGameObject } from '../data/dungeonGameObjects.ts';
import { countRouteTrash, selectRouteEncounters, DEFAULT_ROUTE_DENSITY, DEFAULT_PULL_FUSION } from '../world/dungeonRoute.ts';
import { WIPE_CAP_PER_RUN } from '../world/dungeonPreset.ts';
import { rosterDialog, lineupDialog, paladinDialog, partyHasPaladin, walkingIn, lineupSize } from './tuiRaid.mjs';

const H = (text) => ({ text, header: true });
const KIND_GLYPH = { boss: red('B'), trash: yellow('T'), rare: cyan('R'), object: dim('O'), entrance: dim('>'), exit: dim('<') };
const ROLE_NAME = { tank: 'tank', healer: 'healer', dps: 'damage' };

const runDef = (app) => (app.g.state.instance ? app.ds.instance(app.g.state.instance.dungeonId) : null);
const hasOwned = (app) => (entry) => countItem(ownedInventory(app.g.state.inventory, app.g.state.keyring), entry) > 0;
const bagCapacityOf = (app) => bagCapacity(app.ch, app.ds);
const isRaid = (def) => (def.maxPlayers ?? 5) > 5;

/** Inside a run whose every required stop is down: nothing left but the way out. */
export function runCleared(app) {
  const def = runDef(app);
  return !!def && isComplete(def, app.g.state.instance);
}

/** Bodies in a stop: the pack's counts, or the primary alone. */
function packSize(enc) {
  const n = (enc.pack ?? []).reduce((s, m) => s + (m.count ?? 1), 0);
  return Math.max(1, n);
}

// ---- portals and entry ------------------------------------------------------------------------------------

/** The engine's own door check (level, attunement, key, quest chain, lockout), so the row says no before Enter does. Ref worldView.ts:626. */
function entryCheck(app, def, now = Date.now()) {
  const g = app.g;
  return canEnter(def, app.ch.level, g.state.lockouts ?? {}, now, { teleports: app.ds.areatriggerTeleports(), instanceSaves: g.state.instanceSaves, ...buildEntryLockInputs(g.state, def.name) });
}

/** The other doors into this instance (Maraudon's orange side, Gnomeregan's train depot, Uldaman's back door...). */
const extraDoors = (def) => extraEntrancesForInstance(def.id).map((row) => ({ id: row.id, name: String(row.name ?? '').replace(/\s*-\s*Entering.*$/i, '').trim() || def.name }));

function lockText(app, def, now = Date.now()) {
  const g = app.g;
  const held = restoreSavedRun(g.state.instanceSaves, def.id, now);
  const lock = lockRemainingMs(g.state.lockouts ?? {}, def.id, now);
  if (held) {
    const left = (g.state.instanceSaves?.[def.id]?.expiresAtMs ?? now) - now;
    if (isComplete(def, held)) return green(`cleared, resets in ${secondsText(left)}`);
    return yellow(`your run is held, ${held.defeated.length} cleared, ${secondsText(left)} left`);
  }
  if (lock > 0) return red(`saved, ${secondsText(lock)} left`);
  return '';
}

/** World tab rows: the instance portals in this zone, the one you are in among them. */
export function portalRows(app) {
  const g = app.g, ds = app.ds, ch = app.ch;
  const inside = runDef(app);
  const portals = instancePortals(ds, ch.zoneId).filter((d) => !d.id.startsWith('alterac'));
  // The run you are in is listed even when its door is in another zone.
  if (inside && !portals.some((d) => d.id === inside.id)) portals.unshift(inside);
  if (!portals.length) return [];
  const rows = [H(''), H(`Dungeons (${portals.length})`)];
  for (const def of portals) {
    const range = dim(`L${def.levelRange[0]}-${def.levelRange[1]}${isRaid(def) ? `  ${def.maxPlayers}-man raid` : ''}`);
    if (def.id === inside?.id) {
      rows.push({ text: `${cyan(def.name)} ${range}  ${green('▶ you are in it')}`, data: { dungeon: def }, detail: () => portalLines(app, def), act: () => openRun(app) });
      continue;
    }
    const chk = entryCheck(app, def);
    const low = !chk.ok && !restoreSavedRun(g.state.instanceSaves, def.id, Date.now());
    const lock = lockText(app, def);
    rows.push({
      text: `${low ? dim(def.name) : cyan(def.name)} ${range}${low && !lock ? red(`  ${chk.reason ?? `requires ${def.minLevel}`}`) : ''}${lock ? `  ${lock}` : ''}`,
      data: { dungeon: def },
      detail: () => portalLines(app, def),
      act: () => goToDungeon(app, def),
    });
  }
  return rows;
}

/** Enter on a portal: out of the run you are in (it is held), then straight back into a run you left
 *  half done, or the entry card for a fresh one. */
function goToDungeon(app, def) {
  if (app.g.state.instance) {
    const was = runDef(app);
    if (!app.result(app.g.leaveInstance(Date.now()), `You leave ${was?.name ?? 'the dungeon'}.`)) return;
    app.dungeonPulls = [];
    app.floor = null;
    app.stack = [];
  }
  const held = restoreSavedRun(app.g.state.instanceSaves, def.id, Date.now());
  if (held && !isComplete(def, held)) enter(app, def, { routeDensity: held.routeDensity ?? DEFAULT_ROUTE_DENSITY, asRaid: isRaid(def), door: null });
  else app.push(entryDialog(app, def));
}

// A 5-man you walk out of stays as you left it for two hours here, not the engine's 30 minutes
// (NORMAL_INSTANCE_RESET_TIME): time to hearth, sell, repair and come back. Raids keep their lockout.
const RUN_HOLD_MS = 2 * 60 * 60 * 1000;

/** After every action: when the run you were in is gone (leave, hearth, taxi, another door), stretch its hold. */
export function holdRunLonger(app) {
  const g = app.g;
  if (!g) { app.inRunId = null; return; }
  const was = app.inRunId, now = g.state.instance?.dungeonId ?? null;
  app.inRunId = now;
  if (!was || was === now) return;
  const def = app.ds.instance(was), save = g.state.instanceSaves?.[was];
  if (!def || def.lockoutMs > 0 || !save) return;
  g.state.instanceSaves = { ...g.state.instanceSaves, [was]: { ...save, expiresAtMs: save.expiresAtMs - NORMAL_INSTANCE_RESET_TIME_MS + RUN_HOLD_MS } };
  const i = g.state.activity.findIndex((l, j) => j < 5 && l.endsWith('It resets in 30 minutes.'));
  if (i >= 0) g.state.activity[i] = g.state.activity[i].replace('30 minutes', '2 hours');
}

function portalLines(app, def) {
  const bosses = def.encounters.filter((e) => e.kind === 'boss');
  const out = [bold(def.name), dim(`levels ${def.levelRange[0]}-${def.levelRange[1]}, requires ${def.minLevel}${isRaid(def) ? `, ${def.maxPlayers} players` : ''}`)];
  const lock = lockText(app, def);
  if (lock) out.push(lock);
  const chk = entryCheck(app, def);
  if (!chk.ok && !lock) out.push(red(chk.reason ?? 'You cannot enter yet.'));
  out.push('', cyan(`Bosses (${bosses.length})`), ...bosses.slice(0, 14).map((b) => `  ${b.name}`), ...(bosses.length > 14 ? [dim(`  and ${bosses.length - 14} more`)] : []));
  out.push('', dim('Enter: route, party and supplies, then go in'));
  return out;
}

/** The card before the door: route density, party or raid, food and water, Enter. */
export function entryDialog(app, def) {
  const opts = { routeDensity: DEFAULT_ROUTE_DENSITY, asRaid: isRaid(def), door: null };
  const doors = extraDoors(def);
  return {
    id: `enter-${def.id}`, title: def.name, hint: 'Enter: choose',
    rows(a) {
      const g = a.g;
      const squad = g.state.squad ?? [];
      const rows = [H(`${bold(def.name)}  ${dim(`L${def.levelRange[0]}-${def.levelRange[1]}`)}  ${lockText(a, def)}`), H('')];
      const held = restoreSavedRun(g.state.instanceSaves, def.id, Date.now());
      const heldDone = held && isComplete(def, held);
      if (heldDone) rows.push(H(green('You cleared it. The halls stay empty until it resets.')), H(''));
      else if (held) rows.push(H(yellow(`Your earlier run is held: ${held.defeated.length} stops cleared. Entering continues it.`)), H(''));
      rows.push({ text: heldDone ? dim('Go back in (nothing left to fight)') : green(held ? 'Go back in' : 'Enter the dungeon'), detail: () => [bold('Enter'), '', `${opts.routeDensity === 'full' ? 'Every pack on the way' : 'Bosses and what guards them'}; ${opts.asRaid ? 'as a raid, the bench comes too' : `you and ${plural(squad.length, 'companion')}`}.`], act: () => enter(a, def, opts) });
      const pace = (d) => ({ text: `Route: ${cyan(d === 'full' ? 'Full' : 'Bosses')}`, detail: () => [bold('Route density'), '', 'Bosses: the bosses and the packs that stand in their way.', 'Full: every pack in the dungeon.', '', dim('Enter: switch')], act: () => { opts.routeDensity = opts.routeDensity === 'full' ? 'bosses' : 'full'; } });
      rows.push(pace(opts.routeDensity));
      if (doors.length) { const all = [null, ...doors]; rows.push({ text: `Door: ${cyan(opts.door?.name ?? 'Main entrance')}`, detail: () => [bold('Which door'), '', 'Some instances have more than one way in; each starts you at its own end of the route.', ...doors.map((d) => `  ${d.name}`), '', dim('Enter: next door')], act: () => { opts.door = all[(all.indexOf(opts.door) + 1) % all.length]; } }); }
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
  const r = app.g.enterInstance(def.id, Date.now(), { routeDensity: opts.routeDensity, asRaid: opts.asRaid, ...(opts.door ? { entranceTriggerId: opts.door.id } : {}) });
  if (!app.result(r, `You enter ${def.name}.`)) return;
  app.dungeonPulls = [];
  app.stack = [];
  openRun(app);
}

// Food and water before the door: who is short, the vendor ladder, what it costs (runSupplyPanel.ts).
function supplyRows(app) {
  const plan = app.g.runSupplyPlan();
  const rows = [H(''), H(`Food and water ${dim(plan.mage ? '(a mage conjures both on the way)' : plan.rows.length ? `${coinText(plan.cost)} for everyone` : 'everyone has enough')}`)];
  if (plan.mage || !plan.rows.length) return rows;
  for (const r of plan.rows) {
    const rung = r.ladder[r.rung];
    rows.push(H(`  ${fit(r.memberName, 12)} ${fit(r.kind, 6)} ${dim(`has ${r.have}, short ${r.short}`)}  ${itemText(rung?.item, '?')} x${r.units}  ${coinText(r.cost)}`));
  }
  const buys = supplyBuys(plan.rows, app.ch.gold, true);
  rows.push({
    text: buys.length ? `Buy them ${yellow(`(${coinText(buys.reduce((s, b) => s + b.cost, 0))})`)}` : dim('Buy them (not enough gold)'),
    detail: () => [bold('Buy supplies'), '', 'The vendor price, straight into each member\'s own bags. What does not fit is left out.', ...(plan.full.length ? ['', yellow(`Bags full: ${plan.full.map((f) => f.name).join(', ')}`)] : [])],
    act: () => { if (!buys.length) { app.flashMsg('Not enough gold for any of it.'); return; } const r = app.g.buyRunSupplies(buys); app.result(r, r.ok ? `Bought ${r.units} food and water for ${coinText(r.spent)}.` : ''); },
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
/** The def's encounters with the run's route versions in their place, budget-split sub-pulls included. */
function encountersWithRoute(def, run) {
  const route = routeEncounterList(def, run), ids = new Set(route.map((e) => e.id));
  return [...route, ...def.encounters.filter((e) => !ids.has(e.id))];
}

/** What sets a flag, by name: the gate object, else the stop whose clear sets it. */
export function flagSource(app, def, run, flag) {
  for (const gate of objectGatesFor(def)) if (gate.setsFlag === flag) return app.ds.gameObject(gate.goEntry)?.name ?? `the ${gate.enc.name} gate`;
  for (const enc of encountersWithRoute(def, run)) if ((enc.events ?? []).some((e) => e.kind === 'setsFlag' && e.flag === flag)) return enc.name;
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
  const tail = st === 'cleared' ? green('  ✓') : st === 'locked' ? dim(`  locked: ${requiredFlags(enc).filter((f) => !hasFlag(run, f)).map((f) => flagSource(app, def, run, f)).join(', ')}`) : enc.id === next?.id ? yellow('  ◀ next') : '';
  return `${KIND_GLYPH[enc.kind] ?? dim('·')} ${name}${n > 1 ? dim(` x${n}`) : ''}${enc.optional ? dim('  optional') : ''}${tail}`;
}

function stopLines(app, def, run, enc) {
  const ds = app.ds;
  const out = [bold(enc.name), dim(`${enc.kind}${enc.roomName ? `, ${enc.roomName}` : ''}${enc.optional ? ', optional' : ''}`)];
  const st = stopState(def, run, enc);
  if (st === 'cleared') out.push(green('Cleared'));
  if (st === 'locked') for (const f of requiredFlags(enc).filter((x) => !hasFlag(run, x))) out.push(red(`Locked until ${flagSource(app, def, run, f)}`));
  if (enc.intro) out.push('', ...wrapLines(yellow(enc.intro), 56));
  const members = (enc.pack?.length ? enc.pack : [{ creatureEntry: enc.creatureEntry, count: 1 }]);
  out.push('', cyan('Pack'));
  for (const m of members) {
    const c = ds.creature(m.creatureEntry);
    out.push(`  ${m.count > 1 ? `${m.count}x ` : ''}${c?.name ?? m.creatureEntry} ${dim(c ? `L${c.level}${c.rank ? ' elite' : ''}  ${c.hpMax} hp` : '')}`);
  }
  if (enc.bossSpells?.length) out.push('', cyan('Abilities'), ...enc.bossSpells.slice(0, 8).map((id) => `  ${ds.spell(id)?.name ?? id}`));
  const sets = (enc.events ?? []).filter((e) => e.kind === 'setsFlag');
  if (sets.length) out.push('', dim(`Clearing it opens: ${encountersWithRoute(def, run).filter((x) => requiredFlags(x).some((f) => sets.some((s) => s.flag === f))).map((x) => x.name).join(', ') || 'the way on'}`));
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
  for (const p of lootObjectPins(def, run, { hasItem: has })) {
    // A vein or a herb is a chest with a skill lock; it lists as what it is and asks for the skill.
    const node = app.ds.gatherNode(p.goEntry);
    add(p.x, p.y, node?.skill === 'mining' ? { kind: 'ore', pin: p, node } : node?.skill === 'herbalism' ? { kind: 'herb', pin: p, node } : { kind: 'chest', pin: p });
  }
  for (const p of textObjectPins(def, run)) if (firstPageForGo(p.goEntry)) add(p.x, p.y, { kind: 'book', pin: p });
  for (const s of dungeonNpcsForMap(def.mapId)) {
    const quests = npcQuests(app, s.entry);
    if (!quests.offer.length && !quests.turnIn.length && !quests.escort.length) continue;
    add(s.x, s.y, { kind: 'npc', spawn: s, quests });
  }
  return byStop;
}

/** Every object and quest NPC on the map with where it stands, for the floor. */
export function floorObjects(app, def, run) {
  const out = [];
  for (const list of roomObjects(app, def, run).values()) {
    for (const o of list) {
      const at = o.pin ?? o.spawn;
      out.push({ ...o, x: at.x, y: at.y, z: at.z, name: o.pin?.name ?? o.spawn.name ?? app.ds.creature(o.spawn.entry)?.name ?? `npc ${o.spawn.entry}` });
    }
  }
  return out;
}

/** Still something to do there: unopened, unpicked, a gate still shut, a book, someone with a quest. */
export const floorObjectOpen = (o) => (o.kind === 'gate' ? o.pin.state !== 'used' : o.pin && o.kind !== 'book' ? o.pin.state !== 'looted' : true);

const GATHER_SKILL = { mining: 'Mining', herbalism: 'Herbalism' };

/** What a vein or herb still asks of you: the profession, or more of it. Null when you can work it. */
function gatherNeed(app, node) {
  const name = GATHER_SKILL[node.skill];
  const have = app.ch.skills?.[node.skill];
  if (!have) return name;
  return (have.current ?? 0) < node.orange ? `${name} ${node.orange}` : null;
}

/** You cannot use it yet: a key you lack, or a profession. */
export const floorObjectBlocked = (app, o) => o.pin?.state === 'needsItem' || (!!o.node && !!gatherNeed(app, o.node));

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

/** Open a chest. GO loot lands in the loot window: by hand it goes the way a corpse's does (auto-loot takes what
 *  fits and the drops slide in, else the window opens); the route opening a key chest (`take`) takes it all. */
function openChest(app, pin, { take = false, verb = 'open' } = {}) {
  const r = app.g.lootInstanceObject(pin.guid);
  if (!app.result(r)) return false;
  app.say(`You ${verb} ${pin.name}.${r.loot.length ? '' : ' It is empty.'}`);
  if (!take) {
    if (autoLootOn(app)) takeAll(app);
    openLoot(app);
    return true;
  }
  const took = app.g.takeAllLoot();
  if (took.ok) { noteLoot(app, took.taken, took.copper); toastLoot(app, took.taken, took.copper); }
  for (const d of took.ok ? took.taken : []) app.say(`  ${yellow('You receive')} ${app.itemLabel(d.item)}${d.count > 1 ? ` x${d.count}` : ''}`);
  if (took.ok && took.copper) app.say(`  ${yellow('You receive')} ${coinText(took.copper)}`);
  if (took.ok && took.remaining) app.say(red(`  ${plural(took.remaining, 'item')} did not fit in your bags.`));
  return true;
}

export function objectRow(app, def, o) {
  const ds = app.ds;
  if (o.kind === 'ore' || o.kind === 'herb') {
    const p = o.pin, need = gatherNeed(app, o.node), done = p.state === 'looted';
    const verb = o.kind === 'ore' ? 'mine' : 'pick';
    return {
      text: `${o.kind === 'ore' ? yellow('◆') : green('♣')} ${done ? gray(p.name) : p.name}${done ? dim(o.kind === 'ore' ? '  mined' : '  picked') : need ? red(`  needs ${need}`) : ''}`,
      detail: () => objectLines(app, p.displayId, [bold(p.name), `${GATHER_SKILL[o.node.skill]} ${o.node.orange}`, '', done ? dim('Already worked.') : need ? red(`You need ${need}.`) : dim(`Enter: ${verb} it`)]),
      act: () => { if (need) { app.flashMsg(`You need ${need} for ${p.name}.`); return; } openChest(app, p, { verb }); },
    };
  }
  if (o.kind === 'book') {
    const p = o.pin;
    return {
      text: `${cyan('≡')} ${p.name}`,
      detail: () => objectLines(app, p.displayId, [bold(p.name), 'Something to read.', '', dim('Enter: read it')]),
      act: () => app.push(bookDialog(app, p.name, firstPageForGo(p.goEntry))),
    };
  }
  if (o.kind === 'gate') {
    const p = o.pin;
    const need = p.requiredItem != null ? app.itemLabel(p.requiredItem) : null;
    const state = p.state === 'used' ? green('  open') : p.state === 'needsItem' ? red(`  needs ${need}`) : yellow('  use it');
    return {
      text: `${dim('◇')} ${p.name}${state}`,
      detail: () => objectLines(app, p.displayId, [bold(p.name), `Opens the way to ${p.encounterName}.`, need ? `Needs ${need}.` : '', '', p.state === 'used' ? dim('Already open.') : dim('Enter: use it')]),
      act: () => {
        const r = app.g.useInstanceObject(p.goEntry);
        if (!app.result(r)) return;
        app.say(r.already ? dim(`${p.name} is already open.`) : r.completed ? green(`You use ${p.name}. The way to ${p.encounterName} opens.`) : cyan(`You use ${p.name} (${r.uses}/${r.needUses}).`));
      },
    };
  }
  if (o.kind === 'chest') {
    const p = o.pin;
    const need = p.requiredItem != null ? app.itemLabel(p.requiredItem) : null;
    return {
      text: `${dim('▣')} ${p.state === 'looted' ? gray(p.name) : p.name}${p.state === 'looted' ? dim('  empty') : p.state === 'needsItem' ? red(`  locked, needs ${need}`) : ''}`,
      detail: () => objectLines(app, p.displayId, [bold(p.name), p.state === 'looted' ? 'You have emptied it.' : need ? `Opens with ${need}.` : 'It can be opened.', '', dim('Enter: open it')]),
      act: () => openChest(app, p),
    };
  }
  const { spawn, quests } = o;
  const name = spawn.name ?? ds.creature(spawn.entry)?.name ?? `npc ${spawn.entry}`;
  const marks = `${quests.turnIn.length ? green(' ?') : ''}${quests.offer.length ? yellow(' !') : ''}${quests.escort.length ? cyan(' escort') : ''}`;
  return {
    text: `${dim('•')} ${name}${marks}`,
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

/** One line each for a party; a raid (more than ten) folds into a line per role plus whoever is hurt or dead. */
function partyLines(app) {
  const g = app.g, ch = app.ch;
  const squad = g.state.squad ?? [];
  const me = `  ${fit(ch.name, 12)} ${dim(`L${ch.level}`)}  ${hpTag(ch.health, maxHealth(ch, app.ds))}`;
  const members = squad.map((c) => {
    const lvl = companionLevel(c, ch.level);
    const max = maxHealth(companionCharacter(c, lvl, app.ds), app.ds);
    return { c, lvl, max, hp: c.health ?? max };
  });
  if (squad.length < 10) return [me, ...members.map((m) => `  ${fit(m.c.name, 12)} ${dim(`L${m.lvl} ${ROLE_NAME[m.c.role] ?? m.c.role}`)}  ${hpTag(m.hp, m.max)}`)];
  const byRole = new Map();
  for (const m of members) byRole.set(m.c.role, (byRole.get(m.c.role) ?? 0) + 1);
  const hurt = members.filter((m) => m.hp < m.max * 0.5).sort((x, y) => x.hp / x.max - y.hp / y.max);
  const out = [me, `  ${dim(`raid of ${squad.length + 1}:`)} ${[...byRole].map(([r, n]) => `${n} ${r === 'dps' ? 'damage' : `${ROLE_NAME[r] ?? r}${n === 1 ? '' : 's'}`}`).join(', ')}`];
  if (hurt.length) out.push(`  ${dim('hurt:')} ${hurt.slice(0, 6).map((m) => `${m.c.name} ${hpTag(m.hp, m.max)}`).join('  ')}${hurt.length > 6 ? dim(`  +${hurt.length - 6}`) : ''}`);
  return out;
}
const hpTag = (hp, max) => (hp <= 0 ? red('dead') : (hp / max < 0.5 ? yellow : green)(`${Math.round((hp / Math.max(1, max)) * 100)}%`));

/** Route stops cut into sections, each the way to a boss and the boss: everything after the boss before it, up
 *  to and with it. What is left past the last boss is a section of its own. Optional bosses ride inside one.
 *  Rooms (roomName) cannot fold: a route zigzags through them, Wailing Caverns is 54 of them, a boss often alone. */
function sectionsOf(def, run) {
  const out = [];
  let cur = null;
  for (const enc of routeEncounterList(def, run)) {
    if (!cur) out.push(cur = { boss: null, stops: [] });
    cur.stops.push(enc);
    if (enc.kind === 'boss' && enc.optional !== true) { cur.boss = enc; cur = null; }
  }
  return out;
}

/** A section folds on its own once its boss is down (or, past the last boss, once it is all cleared). The
 *  player's own Enter on the section row wins until that default changes (R resets), then the default is back. */
function sectionFolds(app, def, run, sections) {
  const own = (app.sectionFold ??= {})[def.id] ??= new Map(); // per dungeon, so a held run comes back folded as you left it
  return sections.map((sec, i) => {
    const key = `${i}:${sec.boss?.id ?? 'end'}`;
    const cleared = sec.stops.every((s) => isCleared(run, s.id));
    const auto = sec.boss ? isCleared(run, sec.boss.id) : cleared;
    const mine = own.get(key);
    if (mine && mine.basis !== auto) own.delete(key);
    const shut = mine && mine.basis === auto ? mine.shut : auto;
    return { sec, key, cleared, auto, shut, set: (s) => own.set(key, { shut: s, basis: auto }) };
  });
}

/** In a folded section only what still wants a hand stays listed: a chest not emptied, a gate not opened, a quest NPC. */
const stillToDo = (o) => o.kind !== 'book' && floorObjectOpen(o);

export function runView(app) {
  const view = {
    id: 'dungeon', title: runDef(app)?.name ?? 'Dungeon', hint: 'Enter: pull / use / fold a section',
    keys: {
      e: { hint: 'fold / open all', fn: () => { const f = view.folds ?? []; const open = f.some((x) => x.shut); for (const x of f) x.set(!open); view.byHand = true; } },
      z: { hint: 'rest', fn: (a) => restBetween(a, 30) },
      W: { hint: 'walk the floor', fn: (a) => openFloor(a) },
      F: { hint: 'finish instantly', fn: (a) => a.confirm('Run every remaining stop now, without watching?', () => finishInstantly(a)) },
      L: { hint: 'leave', fn: (a) => leaveRun(a) },
      P: { hint: 'blessings', fn: (a) => a.push(paladinDialog(a)) },
      R: { hint: 'reset', fn: (a) => a.confirm('Reset the run? Every stop comes back.', () => { if (a.result(a.g.resetInstance(), 'The dungeon resets.')) { a.dungeonPulls = []; a.floor = null; } }) },
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
      const folds = view.folds = sectionFolds(a, def, run, sectionsOf(def, run));
      let lastBoss = null;
      for (const f of folds) {
        const { sec, cleared, shut } = f;
        const left = sec.stops.filter((s) => !isCleared(run, s.id)).length;
        const title = sec.boss ? sec.boss.name : lastBoss ? `Past ${lastBoss.name}` : def.name;
        const where = sec.boss?.roomName ?? '';
        lastBoss = sec.boss ?? lastBoss;
        const hasNext = sec.stops.some((s) => s.id === next?.id);
        rows.push(H(''), {
          text: `${shut ? '▸' : '▾'} ${sec.boss ? bold(title) : title}${cleared ? green('  ✓') : ''}${where ? dim(`  ${where}`) : ''}${shut ? dim(`  ${plural(sec.stops.length, 'stop')}${left ? `, ${left} left` : ''}`) : ''}${shut && hasNext ? yellow('  ◀ next') : ''}`,
          data: { section: f.key },
          detail: () => [bold(title), dim(`${plural(sec.stops.length, 'stop')}, ${left} left`), '', ...sec.stops.slice(0, 24).map((s) => `  ${stopText(a, def, run, s, next)}`), ...(sec.stops.length > 24 ? [dim(`  and ${sec.stops.length - 24} more`)] : []), '', dim(shut ? 'Enter: open the section' : 'Enter: fold the section   e: fold or open them all')],
          act: () => { f.set(!shut); view.byHand = true; },
        });
        for (const enc of sec.stops) {
          if (!shut) rows.push({
            text: `  ${stopText(a, def, run, enc, next)}`, data: { stop: enc },
            detail: () => stopLines(a, def, run, enc),
            act: () => pullStop(a, def, enc),
          });
          for (const o of (objects.get(enc.id) ?? []).filter((x) => !shut || stillToDo(x))) { const r = objectRow(a, def, o); rows.push({ ...r, text: `    ${r.text}`, data: { object: o } }); }
        }
      }
      for (const o of objects.get('_') ?? []) rows.push({ ...objectRow(a, def, o), data: { object: o } });
      // The floor walks the dungeon's nav mesh; a raid ships none, so there is nothing to offer.
      if (loadNavMesh(def)) rows.push(H(''), { text: `Walk the floor  ${dim('go anywhere; patrols and packs you pass pull on their own (W)')}`, detail: () => [bold('The floor'), '', 'Instead of picking stops, walk the dungeon on its nav mesh. Patrols walk their routes, and whatever sees you on the way pulls.'], act: () => openFloor(a) });
      rows.push({ text: dim('Leave the dungeon'), detail: () => [bold('Leave'), '', isRaid(def) ? 'A raid holds your progress until the lockout resets.' : 'A 5-man holds your progress for 2 hours.'], act: () => leaveRun(a) });
      // Walking in, or a section folding on its own after a kill: the cursor goes to the next stop (or the
      // first open one showing, when the next is trash left in a folded section), not to whatever row slid under
      // its old index. A fold by hand leaves it on the section row.
      const sig = folds.map((x) => (x.shut ? 1 : 0)).join('');
      if (sig !== view.foldSig && !view.byHand) {
        let at = rows.findIndex((r) => r.data?.stop && r.data.stop.id === next?.id);
        if (at < 0) at = rows.findIndex((r) => r.data?.stop && stopState(def, run, r.data.stop) === 'open');
        if (at >= 0) { view.cursor = at; a.ensureVisible(view, rows); }
      }
      view.foldSig = sig; view.byHand = false;
      return rows;
    },
  };
  return view;
}

// ---- pulls ---------------------------------------------------------------------------------------------

/** Pull one stop. `floor`: the continuous floor's pull (no sequential lock: you walked into it); `ready`: buff
 *  and rest first, a pull you chose (a floor pack that saw you is already on you); `onDone(r)` runs after the
 *  fight with its outcome (null when you ran). */
export function pullStop(app, def, enc, { floor = false, ready = !floor, onDone, onTick } = {}) {
  const run = app.g.state.instance;
  if (!run) return;
  if (isCleared(run, enc.id)) { app.flashMsg(`${enc.name} is already cleared.`); return; }
  if (!floor && !isUnlocked(def, run, enc.id)) { app.flashMsg(`${enc.name} is locked.`); return; }
  if (ready) readyUp(app);
  for (const l of prePull(app.g, app.ds, app.cmds.buffPace)) app.say(cyan(l));
  const f = pullPhase(app, def, enc, enc.creatureEntry, () => app.g.beginEncounter(def.id, enc.id, { withSquad: true, ...(floor ? { continuousFloor: true } : {}) }), { onDone, onTick });
  if (f.ok && enc.intro) app.say(yellow(enc.intro));
}

/** One phase of a stop's fight. A win the encounter chains on from (Sneed's Shredder ejecting Sneed) opens the next
 *  phase on the stage, on the floor the last one fought on; `onDone` waits for the last phase. */
function pullPhase(app, def, enc, creatureEntry, open, { onDone, onTick }) {
  let playerMax = 0, session = null;
  return startFight(app, creatureEntry, {
    label: enc.kind === 'boss' ? 'boss' : undefined, onTick, chain: true,
    begin: () => { const b = open(); if (b.ok) { playerMax = b.playerMax; session = b.session; } return b; },
    after: (r) => { recordPull(app, def, enc, r, playerMax, session, app.dungeonDowntime ?? 0, creatureEntry); app.dungeonDowntime = 0; },
    onEnd: (r) => {
      if (r?.nextPhase) {
        const floor = app.lastFight?.floor;
        app.say(yellow(bold(`${r.nextPhase.name} appears!`)));
        const next = pullPhase(app, def, enc, r.nextPhase.creatureEntry, () => app.g.beginChainedPhase(), { onDone, onTick });
        if (next.ok) { if (floor) app.fight.floor = floor; return; }
        app.say(red(`${r.nextPhase.name} could not be fought: ${next.reason}`));
      }
      onDone?.(r);
      if (!r) return;
      if (r.outcome === 'defeat') app.say(red('The party wipes. Rest, then try again.'));
      if (app.g.state.instance && isComplete(def, app.g.state.instance)) app.say(green(bold(`${def.name} is cleared.`)));
    },
  });
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

function recordPull(app, def, enc, r, playerMax, session, downtimeSec, creatureEntry = enc.creatureEntry) {
  const won = r.outcome === 'win';
  if (won) grantSquadKillXp(app, creatureEntry);
  // A later phase of the stop (Sneed out of his Shredder) is its own row, under the foe it was.
  const name = creatureEntry === enc.creatureEntry ? enc.name : app.ds.creature(creatureEntry)?.name ?? enc.name;
  (app.dungeonPulls ??= []).push({
    encounterId: enc.id, name, kind: enc.kind === 'boss' ? 'boss' : 'trash',
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

/** Eat and drink from the bags, then sit, up to the squad strategy's rest line (betweenPullRest.ts). */
function eatAndDrink(app) {
  const g = app.g;
  const r = betweenPullConsumeLoop({ char: g.state.char, inventory: g.state.inventory, ds: app.ds, strategy: g.state.squadStrategy, deathFlow: g.state.deathFlow });
  g.state.char = r.char; g.state.inventory = r.inventory;
  app.dungeonDowntime = (app.dungeonDowntime ?? 0) + r.seconds;
  return r;
}

/** Between pulls: eat and drink to the rest line, then sit. */
export function restBetween(app, seconds) {
  const r = eatAndDrink(app);
  app.idleTick(seconds, true);
  app.dungeonDowntime += seconds;
  app.say(dim(`The party rests${r.seconds ? ` and eats (${Math.round(r.seconds)} s)` : ''}.  HP ${app.hpText()}  ${app.pwText()}`));
}

/** Before a pull you chose: the buffs phase cast standing still, then eat and drink back to the rest line, as
 *  runFullDungeon rests between pulls. Pulling on the mana the armour, Intellect and conjures just took sent
 *  a level 20 mage in at 761 of 1966, and nothing between stops gave it back. */
export function readyUp(app) {
  const buffed = prepText(prepOoc(app.g, app.ds));
  if (buffed) app.say(cyan(buffed));
  const r = eatAndDrink(app);
  if (r.seconds > 0) app.say(dim(`The party rests before the pull (${Math.round(r.seconds)} s).  HP ${app.hpText()}  ${app.pwText()}`));
  for (const m of r.messages) if (/^Out of /.test(m)) app.say(yellow(`  ${m}.`));
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
    openChest(app, chest, { take: true });
    for (let i = 0; i < 5 && has(gate.requiredItem); i++) {
      const u = g.useInstanceObject(gate.goEntry);
      if (!u.ok) break;
      if (u.completed) { app.say(green(`You use ${gate.name}. The way to ${gate.encounterName} opens.`)); opened = true; break; }
    }
  }
  return opened;
}

/** The next stop Finish instantly goes for: nextEncounter's pick, passing over the stops it gave up on. The route
 *  order is an itinerary, not a lock, so a boss the party cannot beat leaves everything its flags do not gate. */
function nextStop(def, run, skip) {
  const open = routeEncounterList(def, run).find((e) => !isCleared(run, e.id) && !skip.has(e.id) && e.optional !== true && isUnlocked(def, run, e.id));
  if (open) return open;
  const opener = nextEncounter(def, run); // an optional key-dropper that opens a sealed stop
  return opener && !skip.has(opener.id) ? opener : undefined;
}

/** F: every remaining stop resolves headlessly, the squad in, resting between pulls; then the summary. A stop
 *  that beats the party once is left standing and the run goes on to what it can still reach. */
export function finishInstantly(app) {
  const g = app.g, ds = app.ds;
  const def = runDef(app);
  if (!def) return;
  let stopReason;
  const givenUp = new Map(); // encounter id -> name
  let wipes = 0;
  for (let guard = 0; guard < 300; guard++) {
    autoFireGates(app);
    const inst = g.state.instance;
    if (!inst) break;
    const enc = nextStop(def, inst, givenUp);
    if (!enc) {
      if (isComplete(def, inst)) break;
      if (openKeyedGates(app, def)) continue;
      if (givenUp.size) { stopReason = `Could not beat ${[...givenUp.values()].join(', ')}; went on to everything else in reach.`; break; }
      const stuck = instanceObjectPins(def, inst, { hasItem: hasOwned(app) }).find((p) => p.state === 'needsItem');
      stopReason = stuck ? `${stuck.name} needs ${app.itemLabel(stuck.requiredItem)}${(app.g.state.inventory.stacks.length >= bagCapacityOf(app)) ? ' (your bags are full)' : ''}.` : 'No unlocked stop left: a door or a key is missing.';
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
    noteLoot(app, r.loot, r.goldGained);
    for (const d of r.loot) app.say(`    ${yellow('You receive')} ${app.itemLabel(d.item)}${d.count > 1 ? ` x${d.count}` : ''}`);
    // One try a stop: a pull that wipes or times out is passed over rather than pulled again, so a stop the party
    // cannot beat costs one repair bill, not runFullDungeon's WIPE_RETRY_PER_PULL. WIPE_CAP_PER_RUN still ends a run.
    if (r.outcome !== 'win') {
      if (r.outcome === 'defeat') wipes++;
      const why = `${r.outcome === 'defeat' ? 'Party wiped' : 'Combat timed out'} on ${enc.name}`;
      if (wipes >= WIPE_CAP_PER_RUN) { stopReason = `${why}, ${plural(wipes, 'wipe')} this run`; break; }
      givenUp.set(enc.id, enc.name);
      app.say(yellow(`  ${why}: leaving it and going on.`));
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
      rows.push(H(`  ${secondsText(s.combatMs)} fighting, ${secondsText(s.downtimeSec * 1000)} resting   +${s.totalXp} xp   ${coinText(s.totalGold)}`));
      if (s.stopReason) rows.push(H(red(`  Stopped: ${s.stopReason}`)));
      if (s.memberTotals?.length) {
        const secs = Math.max(1, s.combatMs / 1000);
        rows.push(H(''), H(`${fit('Party', 16)} ${fit('damage', 10)} ${fit('dps', 7)} ${fit('healing', 10)} ${fit('hps', 7)} taken`));
        for (const m of s.memberTotals) rows.push(H(`  ${fit(m.name, 14)} ${fit(String(m.damage), 10)} ${fit((m.damage / secs).toFixed(1), 7)} ${fit(String(m.healing), 10)} ${fit((m.healing / secs).toFixed(1), 7)} ${m.damageTaken ?? ''}`));
      }
      if (s.totalLoot?.length) {
        rows.push(H(''), H('Loot'));
        for (const l of s.totalLoot) rows.push(H(`  ${a.itemLabel(l.item)}${l.count > 1 ? ` x${l.count}` : ''}`));
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
  app.floor = null; // rebuilt on the way back in; a held run keeps its floor kills
  app.stack = [];
  app.switchTab(0);
}
