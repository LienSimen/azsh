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
// the gates you walk through) runs on phonecraft's own module (liveStratUndead.ts). Not ported: the gauntlets,
// waves and escorts of liveGauntletEscort.ts, which drive the live combat session directly.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bold, dim, yellow, green, red, cyan, fit } from './text.mjs';
import { startFight } from './tuiFight.mjs';
import { pullStop } from './tuiDungeon.mjs';
import { decodeNavMesh, registerNavMeshForMap, navMeshForMap } from '../domain/nav/navmesh.ts';
import { bakeSlugForInstance } from '../world/bakeSlug.ts';
import { createContinuousWorld, setMoveOrder, tickWalk, entitiesInAggroRange, resolveContinuousPullEncounter, resolveKill, partyDistTo, floorEntities } from '../world/continuousDungeon.ts';
import { tickDungeonPatrolScripts } from '../engine/game/tickDungeonPatrolScripts.ts';
import { getDungeonSpawn } from '../data/dungeonSpawns.ts';
import { isHostileCreature } from '../domain/creature/faction.ts';
import { isCleared } from '../world/instances.ts';
import { BASE_RUN_SPEED } from '../domain/nav/speed.ts';
import { installStratUndead } from './liveStratUndead.ts';

const H = (text) => ({ text, header: true });
const TICK_MS = 100;
const NEAR_YD = 45;
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

/** The floor for the current run, built on first use and kept on the app while the run lasts. */
function floorFor(app, def) {
  const run = app.g.state.instance;
  if (app.floor?.dungeonId === run.dungeonId) return app.floor;
  // Bodies of stops already cleared stay dead on the rebuilt floor, with any loose kills from before.
  const cleared = new Set(app.floorKills?.[run.dungeonId] ?? []);
  for (const enc of def.encounters) if (isCleared(run, enc.id)) for (const gd of enc.spawnGuids ?? []) cleared.add(gd);
  const world = createContinuousWorld({
    instanceId: def.id, mapId: def.mapId, clearedGuids: [...cleared],
    isHostile: (entry) => isHostileCreature(app.ds, app.ch.race, entry),
  });
  // The spawn bake carries no level or detection radius; the creature template has both.
  for (const e of world.entities) {
    const c = e.entry ? app.ds.creature(e.entry) : null;
    if (!c) continue;
    e.level = c.level;
    if (c.detectionRange) e.detectionRange = c.detectionRange;
  }
  const f = { dungeonId: run.dungeonId, def, world, runMs: 0, patrolIndex: new Map(), target: null, walking: false, speed: 1, timer: null, script: null };
  if (def.id === 'stratholme-undead') f.script = scriptContext(app, f);
  app.floor = f;
  return f;
}

/** The slice of phonecraft's live controller context the Stratholme module reads, over this floor. */
function scriptContext(app, f) {
  const ctx = {
    game: app.g, ds: app.ds, def: f.def, continuous: f.world, stopped: false,
    get runElapsedMs() { return f.runMs; },
    // Its feed lines are HTML for the web client; the terminal keeps the words.
    pushFeed: (html) => app.say(yellow(String(html).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"'))),
    strathGatesUsed: new Set(), baronRunDeadlineMs: null, baronRunWarned10: false, baronRunWarned5: false,
    ysidaSoulDrainAtMs: null, barthilasRunArmedAtMs: null, auriusSummonAtMs: null, rivendareFightStartMs: null, rivendareRaiseCastsDone: 0,
  };
  installStratUndead(ctx);
  return ctx;
}

function remember(app, f, guids) {
  resolveKill(f.world, guids);
  app.floorKills ??= {};
  app.floorKills[f.dungeonId] = [...new Set([...(app.floorKills[f.dungeonId] ?? []), ...guids])];
}

/** One floor tick: patrols, the walk, then what sees you. Returns true when a pull started. */
export function stepFloor(app, f) {
  if (app.fight || !app.g.state.instance) return false;
  f.runMs += TICK_MS;
  tickDungeonPatrolScripts(f.world, f.runMs, (guid) => getDungeonSpawn(guid), () => {}, f.patrolIndex);
  if (f.script) { f.script.tickBaronRun(); f.script.tickStratUndeadResiduals(); }
  if (f.walking) {
    const r = tickWalk(f.world, (BASE_RUN_SPEED * TICK_MS) / 1000);
    if (r.arrived) { f.walking = false; arrive(app, f); }
  }
  const seen = entitiesInAggroRange(f.world, app.ch.level);
  if (!seen.length) return false;
  f.walking = false;
  pullSeen(app, f, seen);
  return true;
}

/** At the target: a stop whose bodies the floor never spawned (a summoned boss) is pulled by hand. */
function arrive(app, f) {
  const enc = f.target ? f.def.encounters.find((e) => e.id === f.target) : null;
  app.say(dim(`You reach ${enc?.name ?? 'the spot'}.`));
}

function pullSeen(app, f, seen) {
  const run = app.g.state.instance;
  const guids = seen.map((e) => e.guid);
  const res = resolveContinuousPullEncounter(f.def.encounters, run.defeated ?? [], guids);
  const names = [...new Set(seen.map((e) => app.ds.creature(e.entry)?.name ?? 'something'))].join(', ');
  if (res.ok) {
    const enc = f.def.encounters.find((e) => e.id === res.encounter.id);
    app.say(yellow(`${names} ${seen.length === 1 ? 'sees' : 'see'} you! ${enc.name}.`));
    for (const e of seen) e.state = 'engaged';
    pullStop(app, f.def, enc, {
      floor: true,
      onDone: (r) => {
        f.runMs += r?.result?.durationMs ?? 0; // the fight's time is run time too (the Baron's clock)
        if (r?.outcome === 'win') remember(app, f, enc.spawnGuids?.length ? enc.spawnGuids : guids);
        else for (const e of seen) if (e.state === 'engaged') e.state = 'alive';
        reopen(app);
      },
    });
    return;
  }
  // No stop owns it (a lone patrol, a straggler): one fight against the first that saw you.
  const first = seen[0];
  app.say(yellow(`${app.ds.creature(first.entry)?.name ?? 'Something'} sees you!`));
  first.state = 'engaged';
  const started = startFight(app, first.entry, {
    onEnd: (r) => {
      f.runMs += r?.result?.durationMs ?? 0;
      if (r?.outcome === 'win') remember(app, f, [first.guid]);
      else if (first.state === 'engaged') first.state = 'alive';
      reopen(app);
    },
  });
  // A body the engine will not fight here stays out of the way rather than pulling on every tick.
  if (!started.ok) { first.state = 'skipped'; app.say(dim(`  (${started.reason})`)); }
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
  app.say(dim(`You head for ${enc.name}${r ? `, ${Math.round(r.pathYd)} yards` : ''}.`));
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

function floorView(app, f) {
  const startTimer = (a) => {
    if (f.timer) return;
    f.timer = a.term.setInterval(() => {
      if (a.top()?.id !== 'floor' || a.fight) return;
      for (let i = 0; i < f.speed; i++) if (stepFloor(a, f)) break;
      a.render();
    }, TICK_MS);
  };
  const view = {
    id: 'floor', title: 'Floor', hint: 'Enter: walk there', noDetail: false, floor: f,
    onClose: (a) => { if (f.timer) a.term.clearInterval(f.timer); f.timer = null; f.walking = false; },
    keys: {
      space: { hint: 'stop', fn: () => { f.walking = false; f.world.movePath = []; } },
      '+': { hint: 'faster', fn: () => { f.speed = Math.min(8, f.speed * 2); } },
      '-': { fn: () => { f.speed = Math.max(1, f.speed / 2); } },
    },
    rows(a) {
      startTimer(a);
      const run = a.g.state.instance;
      if (!run) return [H(dim('You are out of the dungeon.'))];
      const w = f.world, def = f.def;
      const target = f.target ? def.encounters.find((e) => e.id === f.target) : null;
      const status = f.walking && target ? `walking to ${target.name}` : 'standing';
      const rows = [H(`${bold(def.name)}   ${dim(`${status}, ${Math.round(w.walkedYd)} yd walked${f.speed !== 1 ? `, ${f.speed}x` : ''}`)}`), H('')];
      // Ahead: every stop not yet cleared, nearest first.
      const ahead = def.encounters.filter((e) => e.origin && e.kind !== 'entrance' && e.kind !== 'exit' && !isCleared(run, e.id))
        .map((e) => ({ e, d: partyDistTo(w, e.origin.x, e.origin.y, e.origin.z) })).sort((x, y) => x.d - y.d);
      rows.push(H(cyan('Where to')));
      if (!ahead.length) rows.push(H(green('  Every stop is cleared.')));
      for (const { e, d } of ahead.slice(0, 30)) {
        rows.push({
          text: `  ${e.kind === 'boss' ? red('B') : dim('·')} ${fit(e.name, 30)} ${dim(`${Math.round(d)} yd`)}${f.target === e.id && f.walking ? yellow('  ◀ going') : ''}`,
          detail: () => [bold(e.name), dim(`${e.kind}, ${Math.round(d)} yards away`), '', dim('Enter: walk there. Anything that sees you on the way pulls.'), dim('P: pull it from here')],
          keys: { P: (a2) => pullStop(a2, def, e, { floor: true, onDone: () => reopen(a2) }) },
          act: (a2) => walkTo(a2, f, e),
        });
      }
      // Near you: what stands or walks within sight distance, and how close it lets you come.
      const near = floorEntities(w).filter((e) => e.hostile && !e.party && partyDistTo(w, e.x, e.y, e.z) <= NEAR_YD)
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
