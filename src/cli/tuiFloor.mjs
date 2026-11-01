// The continuous floor (Phase 2i): walk the dungeon instead of picking stops off the route. The party stands at
// the entrance with every spawn on the floor; you pick where to go and the party walks the nav mesh there at run
// speed while patrols walk their waypoints. Whatever sees you on the way (its detection radius, on your storey)
// pulls, so a patrol can catch you between packs and a pack beside the path joins in. A pull that belongs to a
// route stop is that stop's fight (beginEncounter with continuousFloor); a body no stop owns is a fight of its own.
//
// All of it is phonecraft's world layer (world/continuousDungeon.ts, engine/game/tickDungeonPatrolScripts.ts) over
// the server nav mesh. The meshes are not in this repo: they are read from a phonecraft checkout
// (PHONECRAFT, default ../../code/phonecraft, public/maps/bake/<slug>.navmesh.bin) or AZSH_NAVMESH_DIR. Without
// one the run window keeps its sequential route. Stratholme's Baron Run (the 45 minutes, Ysida, Barthilas, Aurius,
// the gates you walk through) runs on phonecraft's own module (liveStratUndead.ts).
//
// Events (2j) run on liveGauntletEscort.ts the same way: the Ring of Law, the Tomb of the Seven, the Stadium, Solakar's
// eggs, Mograine and Whitemane, Gandling's portals, the Zul'Farrak stairs, Gor'shak's cell, Willix and the other
// escorts, Moira standing down, Finkle, Celebras. An event arms when you walk within 50 yards of it (P starts it from
// anywhere); its waves come on their own timers and join the fight you are in, the way Pull +1 joins a pack. The floor's
// clock keeps running inside fights (startFight's onTick), so a wave called 16 seconds after the last arrives while
// you are still fighting it. A wipe or running away fails the event and puts it back.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bold, dim, yellow, green, red, cyan, fit } from './text.mjs';
import { startFight } from './tuiFight.mjs';
import { pullStop, restBetween } from './tuiDungeon.mjs';
import { prePull } from './squad.mjs';
import { decodeNavMesh, registerNavMeshForMap, navMeshForMap } from '../domain/nav/navmesh.ts';
import { bakeSlugForInstance } from '../world/bakeSlug.ts';
import { createContinuousWorld, setMoveOrder, tickWalk, entitiesInAggroRange, resolveContinuousPullEncounter, resolveKill, partyDistTo, floorEntities, summonedBodyGuids } from '../world/continuousDungeon.ts';
import { tickDungeonPatrolScripts } from '../engine/game/tickDungeonPatrolScripts.ts';
import { getDungeonSpawn } from '../data/dungeonSpawns.ts';
import { isHostileCreature } from '../domain/creature/faction.ts';
import { isTechnicalTriggerCreature } from '../domain/creature/creatureTrigger.ts';
import { isCleared, applyEncounterCleared, floorGauntletWaves, requiredFlags, hasFlag } from '../world/instances.ts';
import { getQuest } from '../domain/quests/questlog.ts';
import { MARAUDON_CELEBRAS_RITUAL, maraCelebrasStartRitual, maraCelebrasRitualActive } from '../data/dungeons/maraudon.ts';
import { BASE_RUN_SPEED } from '../domain/nav/speed.ts';
import { resolveCreatureDefForCombat } from '../data/dungeons/eventai/index.ts';
import { buildEnemySpecFromCreature } from '../engine/game/combatEnemySpec.ts';
import { injectEnemySlotPosition, isEnemyCasterKit } from '../engine/combat/combatGeometry.ts';
import { getCreatureAttackDistance } from '../domain/creature/creatureAggro.ts';
import { mulberry32 } from '../engine/core/rng.ts';
import { installStratUndead } from './liveStratUndead.ts';
import { installGauntletEscort, GAUNTLET_START_YD } from './liveGauntletEscort.ts';

const H = (text) => ({ text, header: true });
const TICK_MS = 100;
const NEAR_YD = 45;
const QUEST_SCAN_MS = 1500;
const FOLLOW_YD = 8;
// After a failed event the party is still standing where it arms; give them a minute to rest first.
const EVENT_HOLD_MS = 60_000;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where the server nav meshes are read from. */
export function navMeshDir() {
  if (process.env.AZSH_NAVMESH_DIR) return process.env.AZSH_NAVMESH_DIR;
  return join(process.env.PHONECRAFT ?? join(ROOT, '..', '..', 'code', 'phonecraft'), 'public', 'maps', 'bake');
}

/** Register the mesh for this instance's map, once. True when the floor can be walked. */
export function loadNavMesh(def) {
  if (navMeshForMap(def.mapId)) return true;
  const slug = bakeSlugForInstance(def.id);
  if (!slug) return false;
  const file = join(navMeshDir(), `${slug}.navmesh.bin`);
  if (!existsSync(file)) return false;
  try { registerNavMeshForMap(def.mapId, decodeNavMesh(new Uint8Array(readFileSync(file))), file); return true; }
  catch { return false; }
}

/** Level, detection radius and reaction from the creature template (the spawn bake carries none of them). */
function stampTemplates(app, ents) {
  for (const e of ents) {
    const c = e.entry ? app.ds.creature(e.entry) : null;
    if (!c) continue;
    e.level = Math.max(1, c.level | 0);
    if (c.detectionRange > 0) e.detectionRange = c.detectionRange;
    e.hostile = isHostileCreature(app.ds, app.ch.race, e.entry);
  }
}

/** The floor for the current run, built on first use and kept on the app while the run lasts. */
function floorFor(app, def) {
  const run = app.g.state.instance;
  if (app.floor?.dungeonId === run.dungeonId) return app.floor;
  // Bodies of stops already cleared stay dead on the rebuilt floor, with any loose kills from before.
  const cleared = new Set(app.floorKills?.[run.dungeonId] ?? []);
  for (const enc of def.encounters) if (isCleared(run, enc.id)) for (const gd of enc.spawnGuids ?? []) cleared.add(gd);
  const bossEntries = new Set(def.encounters.filter((e) => e.kind === 'boss' && e.creatureEntry > 0).map((e) => e.creatureEntry));
  const world = createContinuousWorld({
    instanceId: def.id, mapId: def.mapId, clearedGuids: [...cleared],
    // Friendly bodies too: an escort's charge, Doom'rel before the challenge, the tomb's ghosts an event claims.
    includeNpcs: true,
    isHostile: (entry) => isHostileCreature(app.ds, app.ch.race, entry),
    // Script anchors are invisible in Classic; a sealed boss's own body is not one.
    skipEntry: (entry) => !bossEntries.has(entry) && isTechnicalTriggerCreature(app.ds.creature(entry)),
  });
  stampTemplates(app, world.entities);
  const f = { dungeonId: run.dungeonId, def, world, runMs: 0, patrolIndex: new Map(), target: null, walking: false, follow: true, speed: 1, timer: null, script: null, questScanMs: -Infinity, waiting: [], eventHoldUntil: 0,
    rng: mulberry32(((app.g.state.rngSeed ?? 1) ^ 0x9e3779b9) >>> 0) };
  f.script = scriptContext(app, f);
  app.floor = f;
  return f;
}

/** The slice of phonecraft's live controller context the Stratholme and event modules read, over this floor. */
function scriptContext(app, f) {
  const ctx = {
    game: app.g, ds: app.ds, def: f.def, continuous: f.world, stopped: false,
    get runElapsedMs() { return f.runMs; },
    // Its feed lines are HTML for the web client; the terminal keeps the words.
    pushFeed: (html) => app.say(yellow(String(html).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'))),
    // Stratholme (liveStratUndead.ts).
    strathGatesUsed: new Set(), baronRunDeadlineMs: null, baronRunWarned10: false, baronRunWarned5: false,
    ysidaSoulDrainAtMs: null, barthilasRunArmedAtMs: null, auriusSummonAtMs: null, rivendareFightStartMs: null, rivendareRaiseCastsDone: 0,
    // Events and escorts (liveGauntletEscort.ts).
    gauntlet: null, lastGauntletScanMs: -Infinity, floorEscort: null, floorEscortDef: null,
    releasedAllies: new Set(), finkleSpawned: false, celebrasRitualStartedAtMs: null,
    get targetEncounterId() { return f.target; },
    get currentSession() { return app.fight?.session ?? null; },
    inActiveFight: () => !!app.fight,
    // The party stands where the floor says; the terminal has no separate fight positions to read back.
    partyWorldFromSession: () => {},
    // The run is saved with the game; the floor itself is rebuilt from it.
    saveFloorState: () => {}, persist: () => {},
    stampTemplates: (ents) => stampTemplates(app, ents),
    guidsForFloorEncounter: (enc) => guidsForEncounter(f, enc),
    floorSideOfGuid: (guid) => app.fight?.session.sideOfGuid?.(guid) ?? undefined,
    unbindFloorSide: () => {},
    aggroFloorEntities: (ents) => engage(app, f, ents),
  };
  if (f.def.id === 'stratholme-undead') installStratUndead(ctx);
  installGauntletEscort(ctx);
  return ctx;
}

/** An encounter's bodies on the floor: its spawn rows, plus the body an event or summon put there for it. */
function guidsForEncounter(f, enc) {
  const summoned = summonedBodyGuids(f.world, { id: enc.id });
  return enc.spawnGuids?.length ? [...enc.spawnGuids, ...summoned] : summoned;
}

/** Bodies an event calls in its own time: they never pull by sight. */
function eventGuids(app, f) {
  const run = app.g.state.instance, out = new Set();
  for (const enc of f.def.encounters) {
    if (isCleared(run, enc.id) || !floorGauntletWaves(enc)) continue;
    for (const gd of guidsForEncounter(f, enc)) out.add(gd);
  }
  for (const gd of f.script.gauntlet?.spawned ?? []) out.add(gd);
  return out;
}

/** In this fight now: a body the clock watches, so it counts as fallen the tick it dies. */
function markEngaged(f, ents) {
  for (const e of ents) { e.state = 'engaged'; if (!f.world.engagedGuids.includes(e.guid)) f.world.engagedGuids.push(e.guid); }
}

function remember(app, f, guids) {
  resolveKill(f.world, guids);
  app.floorKills ??= {};
  app.floorKills[f.dungeonId] = [...new Set([...(app.floorKills[f.dungeonId] ?? []), ...guids])];
}

/** One floor tick: patrols, the walk, the scripts, then what sees you. Returns true when a pull started. */
export function stepFloor(app, f) {
  if (app.fight || !app.g.state.instance) return false;
  f.runMs += TICK_MS;
  tickDungeonPatrolScripts(f.world, f.runMs, (guid) => getDungeonSpawn(guid), () => {}, f.patrolIndex);
  if (tickScripts(app, f)) { f.walking = false; return true; }
  followEscort(app, f);
  if (f.walking) {
    const r = tickWalk(f.world, (BASE_RUN_SPEED * TICK_MS) / 1000);
    if (r.arrived) { f.walking = false; if (arrive(app, f)) return true; }
  }
  const skip = eventGuids(app, f);
  const seen = entitiesInAggroRange(f.world, app.ch.level).filter((e) => !skip.has(e.guid));
  if (!seen.length) return false;
  f.walking = false;
  pullSeen(app, f, seen);
  return true;
}

/** Inside a floor fight: the clock runs on, the events tick and may send their next wave in. */
function stepInFight(app, f) {
  f.runMs += TICK_MS;
  const s = app.fight?.session;
  // A body that fell in this fight is dead on the floor now, so an event that waits on a clear sees it.
  if (s?.sideOfGuid) {
    const fell = [];
    for (const gd of f.world.engagedGuids ?? []) {
      const side = s.sideOfGuid(gd);
      const v = side ? s.viewOfSide?.(side) : null;
      if (v && !(v.hp > 0)) fell.push(gd);
    }
    if (fell.length) remember(app, f, fell);
  }
  tickScripts(app, f);
}

/** Stratholme's clocks, the events, escorts and the rest. True when one of them started a fight. */
function tickScripts(app, f) {
  const ctx = f.script, fighting = !!app.fight;
  if (ctx.tickBaronRun) { ctx.tickBaronRun(); ctx.tickStratUndeadResiduals(); }
  const was = ctx.gauntlet;
  if (was || f.runMs >= f.eventHoldUntil) ctx.tickGauntlet();
  if (was && !ctx.gauntlet && was.idx >= was.waves.length) credit(app, f, was.encId);
  ctx.tickAllyRelease();
  ctx.tickFinkleSpawn();
  ctx.tickFloorEscort(TICK_MS);
  ctx.tickCelebrasRitual();
  questStarts(app, f);
  return !fighting && !!app.fight;
}

/** What phonecraft starts on quest accept, read off the log instead: an escort, Celebras's ritual. */
function questStarts(app, f) {
  if (f.runMs - f.questScanMs < QUEST_SCAN_MS) return;
  f.questScanMs = f.runMs;
  const ctx = f.script, run = app.g.state.instance, log = app.g.state.questlog;
  // A failed escort waits for the quest to be dropped and taken again.
  if (ctx.floorEscort?.status === 'failed' && !getQuest(log, ctx.floorEscort.questId)) ctx.floorEscort = null;
  if (!ctx.floorEscort) { ctx.resumeFloorEscortsFromLog(); if (ctx.floorEscort) f.follow = true; }
  if (f.def.id === 'maraudon' && run && ctx.celebrasRitualStartedAtMs == null) {
    if (maraCelebrasRitualActive(run.flags ?? [])) { ctx.celebrasRitualStartedAtMs = f.runMs; return; }
    const st = getQuest(log, MARAUDON_CELEBRAS_RITUAL.questId);
    if (!st || st.status === 'turnedIn') return;
    const next = maraCelebrasStartRitual(run.flags ?? [], isCleared(run, MARAUDON_CELEBRAS_RITUAL.cursedEncId));
    if (!next) return;
    app.g.state.instance = { ...run, flags: next };
    ctx.celebrasRitualStartedAtMs = f.runMs;
    ctx.pushFeed(`Celebras the Redeemed says: "${MARAUDON_CELEBRAS_RITUAL.says.follow.text}" - the ritual begins.`);
  }
}

/** An escort walks at its own pace and waits when you fall behind; unless you walk elsewhere, you keep up. */
function followEscort(app, f) {
  const esc = f.script.floorEscort;
  if (!f.follow || f.walking || esc?.status !== 'active' && esc?.status !== 'paused') return;
  if (partyDistTo(f.world, esc.x, esc.y, esc.z) <= FOLLOW_YD) return;
  if (setMoveOrder(f.world, { x: esc.x, y: esc.y, z: esc.z }, f.def.mapId)) { f.walking = true; f.target = null; }
}

/** Mark an encounter done on the run, once. */
function credit(app, f, encId) {
  const run = app.g.state.instance;
  const enc = f.def.encounters.find((e) => e.id === encId);
  if (!run || !enc || isCleared(run, encId)) return;
  app.g.state.instance = applyEncounterCleared(run, enc);
  app.say(green(`${enc.name} is done.`));
}

/** The route loop after a floor fight: an encounter whose every body is dead is cleared. Absent is not dead. */
function creditCleared(app, f) {
  const run = app.g.state.instance;
  if (!run) return;
  const killed = new Set(f.world.clearedGuids);
  for (const enc of f.def.encounters) {
    if (isCleared(app.g.state.instance, enc.id)) continue;
    const guids = guidsForEncounter(f, enc);
    if (!guids.length) continue;
    if (guids.every((gd) => killed.has(gd) || f.world.entities.find((e) => e.guid === gd)?.state === 'dead')) credit(app, f, enc.id);
  }
}

/** At the target. Beside a friendly boss you went to on purpose, that is the challenge (Doom'rel, Ribbly, Bly). */
function arrive(app, f) {
  const enc = f.target ? f.def.encounters.find((e) => e.id === f.target) : null;
  if (!enc) return false;
  app.say(dim(`You reach ${enc.name}.`));
  return f.script.startChallengeGauntletAt() && !!app.fight;
}

/** Bodies that came for you (an event's wave, a whelp, an ambush): into the fight you are in, or a fight of their own. */
function engage(app, f, ents) {
  const live = ents.filter((e) => e.state !== 'dead' && e.entry > 0);
  if (!live.length) return false;
  const fight = app.fight;
  if (!fight) return fightBodies(app, f, live);
  if (!fight.floor) { f.waiting.push(...live); return false; }
  let n = 0;
  for (const e of live) {
    if (fight.session.sideOfGuid?.(e.guid)) continue;
    if (injectBody(app, f, fight.session, e)) { markEngaged(f, [e]); n++; }
    else f.waiting.push(e);
  }
  return n > 0;
}

/** One floor body into the open fight, as pullAdditionalPack builds a pack member. Its corpse pays like any other. */
function injectBody(app, f, session, e) {
  const def = resolveCreatureDefForCombat(e.entry, (id) => app.ds.creature(id));
  if (!def) return false;
  const built = buildEnemySpecFromCreature(app.ds, def, f.rng);
  const pos = injectEnemySlotPosition({
    enemyIndex: session.enemiesView().length,
    isCaster: isEnemyCasterKit(built.spec.spells, { maxPower: built.spec.maxPower }),
    meleeOpenYd: getCreatureAttackDistance(built.level, app.ch.level, { detectionRange: def.detectionRange }),
  });
  return !!session.injectEnemy({ ...built.spec, guid: e.guid }, pos);
}

/** Seat each body of a fresh fight under its world guid, so the events can find it (Whitemane's health, Moira). */
function stampSides(session, ents) {
  if (!session?.stampUnitGuid) return;
  const left = [...ents];
  for (const v of session.enemiesView()) {
    const i = left.findIndex((e) => e.entry === v.creatureEntry);
    if (i < 0) continue;
    session.stampUnitGuid(v.side, left[i].guid);
    left.splice(i, 1);
  }
}

/** A fight against exactly these floor bodies (beginFloorPull), with the party. */
function fightBodies(app, f, ents) {
  for (const l of prePull(app.g, app.ds, app.cmds.buffPace)) app.say(cyan(l));
  const members = ents.map((e) => ({ guid: e.guid, entry: e.entry, x: e.x, y: e.y }));
  const started = startFight(app, ents[0].entry, {
    begin: () => app.g.beginFloorPull({ dungeonId: f.dungeonId, mapId: f.def.mapId, members, withSquad: true, elapsedMs: f.runMs }),
    onTick: () => stepInFight(app, f),
    onEnd: (r) => settle(app, f, r),
  });
  if (!started.ok) {
    app.say(dim(`  (${started.reason})`));
    // An event whose wave cannot be fought fails, or it would wait on bodies nobody can kill.
    const gt = f.script.gauntlet;
    if (gt && ents.some((e) => gt.spawned.includes(e.guid))) { failEvent(app, f); return false; }
    // A body the engine will not fight here stays out of the way rather than pulling on every tick.
    for (const e of ents) e.state = 'skipped';
    return false;
  }
  markEngaged(f, ents);
  stampSides(app.fight.session, ents);
  app.fight.floor = f;
  return true;
}

/** The event is lost: its summoned bodies go, claimed ones stand down, and it waits a minute before it arms again. */
function failEvent(app, f) {
  f.script.resetGauntletOnWipe();
  f.eventHoldUntil = f.runMs + EVENT_HOLD_MS;
  app.say(red('The event fails. Rest (z) before you go again; it waits a minute.'));
}

/** After any floor fight: the dead stay dead, a lost or abandoned event resets, then the route loop credits. */
function settle(app, f, r) {
  const engaged = f.world.entities.filter((e) => e.state === 'engaged').map((e) => e.guid);
  if (r?.outcome === 'win') remember(app, f, engaged);
  else {
    for (const e of f.world.entities) if (e.state === 'engaged') e.state = 'alive';
    f.world.engagedGuids = [];
    if (f.script.gauntlet) failEvent(app, f);
  }
  creditCleared(app, f);
  reopen(app);
  // Whatever an event called while another kind of fight held the screen comes for you now.
  const waiting = f.waiting.splice(0).filter((e) => e.state === 'alive' && f.world.entities.includes(e));
  if (waiting.length && app.g.state.instance) engage(app, f, waiting);
}

function pullSeen(app, f, seen) {
  const run = app.g.state.instance;
  const guids = seen.map((e) => e.guid);
  const res = resolveContinuousPullEncounter(f.def.encounters, run.defeated ?? [], guids);
  const names = [...new Set(seen.map((e) => app.ds.creature(e.entry)?.name ?? 'something'))].join(', ');
  if (res.ok) {
    const enc = f.def.encounters.find((e) => e.id === res.encounter.id);
    app.say(yellow(`${names} ${seen.length === 1 ? 'sees' : 'see'} you! ${enc.name}.`));
    pullStop(app, f.def, enc, {
      floor: true,
      onTick: () => stepInFight(app, f),
      onDone: (r) => {
        if (r?.outcome === 'win') remember(app, f, enc.spawnGuids?.length ? enc.spawnGuids : guids);
        settle(app, f, r);
      },
    });
    if (app.fight) {
      app.fight.floor = f;
      const bodies = enc.spawnGuids?.length ? f.world.entities.filter((e) => enc.spawnGuids.includes(e.guid) && e.state !== 'dead') : seen;
      markEngaged(f, bodies);
      stampSides(app.fight.session, bodies);
    }
    return;
  }
  // No stop owns it (a lone patrol, a straggler): one fight against the first that saw you.
  const first = seen[0];
  app.say(yellow(`${app.ds.creature(first.entry)?.name ?? 'Something'} sees you!`));
  fightBodies(app, f, [first]);
}

function reopen(app) {
  const f = app.floor;
  if (f && app.top()?.id !== 'floor' && app.g.state.instance) app.push(floorView(app, f));
}

/** Walk the party to a stop's spot. */
export function walkTo(app, f, enc) {
  const dest = enc.origin;
  if (!dest) { app.flashMsg(`${enc.name} has no place on the floor.`); return; }
  const r = setMoveOrder(f.world, dest, f.def.mapId);
  f.target = enc.id;
  f.walking = true;
  f.follow = false;
  app.say(dim(`You head for ${enc.name}${r ? `, ${Math.round(r.pathYd)} yards` : ''}.`));
}

/** P on a stop: an event starts where it stands, anything else is pulled from here. */
function pullFromHere(app, f, enc) {
  if (!floorGauntletWaves(enc)) { pullStop(app, f.def, enc, { floor: true, onTick: () => stepInFight(app, f), onDone: (r) => settle(app, f, r) }); if (app.fight) app.fight.floor = f; return; }
  const run = app.g.state.instance;
  const need = requiredFlags(enc).filter((fl) => !hasFlag(run, fl));
  if (need.length) { app.flashMsg(`${enc.name} has not been set off yet (${need.join(', ')}).`); return; }
  if (f.script.gauntlet) { app.flashMsg('Another event is under way.'); return; }
  if (!f.script.startGauntlet(enc)) app.flashMsg(`${enc.name} will not start.`);
}

export function openFloor(app) {
  const run = app.g.state.instance;
  if (!run) return;
  const def = app.ds.instance(run.dungeonId);
  if (!def) return;
  if (!loadNavMesh(def)) {
    app.flashMsg(`No nav mesh for ${def.name} at ${navMeshDir()}. Set PHONECRAFT or AZSH_NAVMESH_DIR.`);
    return;
  }
  const f = floorFor(app, def);
  app.push(floorView(app, f));
}

/** The event under way and the escort you are on, as header lines. */
function eventRows(app, f) {
  const ctx = f.script, rows = [];
  const gt = ctx.gauntlet;
  if (gt) {
    const next = gt.nextCallAtMs != null ? Math.max(0, Math.ceil((gt.nextCallAtMs - f.runMs) / 1000)) : null;
    const left = gt.spawned.filter((gd) => f.world.entities.find((e) => e.guid === gd)?.state !== 'dead').length;
    const when = gt.idx >= gt.waves.length ? 'last wave' : next != null ? `next wave in ${next} s` : 'next wave when these fall';
    rows.push(H(`${yellow(bold(gt.enc.name))}  ${dim(`wave ${gt.idx} of ${gt.waves.length}, ${left} standing, ${when}`)}`));
  }
  const es = ctx.floorEscort;
  if (es && (es.status === 'active' || es.status === 'paused')) {
    const n = ctx.floorEscortDef?.waypoints.length ?? 0;
    const who = app.ds.creature(es.npcEntry)?.name ?? 'your charge';
    rows.push(H(`${cyan(bold(`Escorting ${who}`))}  ${dim(`${app.ds.quest(es.questId)?.title ?? ''}, point ${Math.min(es.waypointIndex + 1, n)} of ${n}${es.status === 'paused' ? ', waiting for you' : ''}${f.follow ? ', following' : ''}`)}`));
  }
  return rows;
}

function floorView(app, f) {
  const startTimer = (a) => {
    if (f.timer) return;
    f.timer = a.term.setInterval(() => {
      if (a.top()?.id !== 'floor' || a.fight) return;
      for (let i = 0; i < f.speed; i++) if (stepFloor(a, f)) break;
      a.renderSoon();
    }, TICK_MS);
  };
  const view = {
    id: 'floor', title: 'Floor', hint: 'Enter: walk there   P: pull or start it from here   f: follow the escort', noDetail: false, floor: f,
    onClose: (a) => { if (f.timer) a.term.clearInterval(f.timer); f.timer = null; f.walking = false; },
    keys: {
      space: { hint: 'stop', fn: () => { f.walking = false; f.follow = false; f.world.movePath = []; } },
      z: { hint: 'rest', fn: (a) => { restBetween(a, 30); f.runMs += 30_000; } },
      f: { fn: (a) => { f.follow = !f.follow; a.flashMsg(f.follow ? 'You keep up with the escort.' : 'You stop following.'); } },
      '+': { hint: 'faster', fn: () => { f.speed = Math.min(8, f.speed * 2); } },
      '-': { fn: () => { f.speed = Math.max(1, f.speed / 2); } },
    },
    rows(a) {
      startTimer(a);
      const run = a.g.state.instance;
      if (!run) return [H(dim('You are out of the dungeon.'))];
      const w = f.world, def = f.def;
      const target = f.target ? def.encounters.find((e) => e.id === f.target) : null;
      const status = f.walking && target ? `walking to ${target.name}` : f.walking ? 'walking' : 'standing';
      const rows = [H(`${bold(def.name)}   ${dim(`${status}, ${Math.round(w.walkedYd)} yd walked${f.speed !== 1 ? `, ${f.speed}x` : ''}`)}`), ...eventRows(a, f), H('')];
      // Ahead: every stop not yet cleared, nearest first.
      const ahead = def.encounters.filter((e) => e.origin && e.kind !== 'entrance' && e.kind !== 'exit' && !isCleared(run, e.id))
        .map((e) => ({ e, d: partyDistTo(w, e.origin.x, e.origin.y, e.origin.z) })).sort((x, y) => x.d - y.d);
      rows.push(H(cyan('Where to')));
      if (!ahead.length) rows.push(H(green('  Every stop is cleared.')));
      for (const { e, d } of ahead.slice(0, 30)) {
        const waves = floorGauntletWaves(e);
        const need = requiredFlags(e).filter((fl) => !hasFlag(run, fl));
        rows.push({
          text: `  ${waves ? yellow('W') : e.kind === 'boss' ? red('B') : dim('·')} ${fit(e.name, 30)} ${dim(`${Math.round(d)} yd`)}${f.target === e.id && f.walking ? yellow('  ◀ going') : ''}`,
          detail: () => [bold(e.name), dim(`${e.kind}, ${Math.round(d)} yards away`), '',
            ...(waves ? [`An event in ${waves.length} waves.`, dim(need.length ? `Not set off yet: ${need.join(', ')}.` : `It starts when you come within ${GAUNTLET_START_YD} yards.`), ''] : []),
            dim('Enter: walk there. Anything that sees you on the way pulls.'), dim(waves ? 'P: start it from here' : 'P: pull it from here')],
          keys: { P: (a2) => pullFromHere(a2, f, e) },
          act: (a2) => walkTo(a2, f, e),
        });
      }
      // Near you: what stands or walks within sight distance, and how close it lets you come.
      const near = floorEntities(w).filter((e) => e.hostile && !e.party && e.state !== 'dead' && partyDistTo(w, e.x, e.y, e.z) <= NEAR_YD)
        .map((e) => ({ e, d: partyDistTo(w, e.x, e.y, e.z) })).sort((x, y) => x.d - y.d);
      rows.push(H(''), H(cyan(`Near you (${near.length})`)));
      for (const { e, d } of near.slice(0, 12)) {
        const c = a.ds.creature(e.entry);
        rows.push(H(`  ${fit(c?.name ?? e.entry, 26)} ${dim(`L${e.level}  ${Math.round(d)} yd`)}${e.movementType === 2 ? yellow('  patrolling') : ''}`));
      }
      return rows;
    },
  };
  return view;
}
