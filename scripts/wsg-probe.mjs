// Headless Warsong Gulch: play a match the way the Honor window does and print the field per minute,
// so a change to the strategy layer or the attrition resolver is judged by what the match does, not by
// watching it at 1x. Flag events, fights by place and both sides' kills; `--drops` lists every drop and
// capture with who stood around the carrier; `--where` adds where each side's bodies are.
//
//   node --import ./src/cli/register.mjs scripts/wsg-probe.mjs [minutes] [level] [seed] [--race=Orc]
//   node --import ./src/cli/register.mjs scripts/wsg-probe.mjs 26 22 1 --save=%USERPROFILE%/.azsh/saves/<slot>.json --drops
//
// Swap the two addTeam calls in tuiBg.mjs and run a few seeds: if one side now wins every match, the
// engine has a roster-order bias again (the contested-flag touch had one, and the first-added team won).
import fs from 'node:fs';
import { HeadlessTerm } from '../src/cli/term.mjs';
import { App } from '../src/cli/tui.mjs';
import { bootDataStore } from '../src/cli/bootData.mjs';
import { newGameState } from '../src/engine/game.ts';
import { stepBg, startBattleground } from '../src/cli/tuiBg.mjs';
import { WSG_GEOMETRY, flagObjectiveId } from '../src/domain/bg/wsg.ts';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const minutes = Number(positional[0] ?? 26);
const level = Number(positional[1] ?? 60);
const seed = Number(positional[2] ?? 51);

const ds = bootDataStore();
const term = new HeadlessTerm(110, 34);
const repo = { async save() {}, async list() { return []; }, async load() { return null; } };
const app = new App({ term, ds, repo });
term.open();
const savePath = flag('save');
if (savePath) {
  const save = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  save.state.battleground = undefined;
  app.startGame(save.state, save.slot, save.createdAt, false, save.updatedAt);
} else {
  const race = ds.races().find((r) => r.name === (flag('race') ?? 'Human'));
  app.startGame(newGameState(ds, race.id, 1, 'Probe', seed, 0), 'probe', Date.now(), true);
  app.g.state.char.level = level;
}
app.say = () => {};
const bg = startBattleground(app, 'wsg');
if (bg.timer) app.term.clearInterval(bg.timer);
const { world } = bg;
const healers = (t) => world.unitsOf(t).filter((u) => u.heals).length;
const runner = [...world.units.values()].filter((u) => u.role === 'flag-carrier').map((u) => `${u.id}/${u.maxHp}hp`).join(' ');
console.log(`you are ${bg.team}; ${world.units.size} seats; healers A${healers('alliance')} H${healers('horde')}; runners ${runner}`);

const g = WSG_GEOMETRY;
const zone = (pos) => {
  const d = (p) => Math.hypot(pos.x - p.x, pos.y - p.y);
  if (d(g.flagBase.horde) < 60) return 'Hbase';
  if (d(g.flagBase.alliance) < 60) return 'Abase';
  if (d(g.graveyard.horde) < 50) return 'Hgy';
  if (d(g.graveyard.alliance) < 50) return 'Agy';
  if (d(g.mid) < 80) return 'mid';
  return pos.x < g.mid.x ? 'Hhalf' : 'Ahalf';
};
const where = (team) => {
  const c = {};
  for (const u of world.unitsOf(team)) { const z = world.alive(u) ? zone(u.pos) : 'dead'; c[z] = (c[z] ?? 0) + 1; }
  return Object.entries(c).map(([k, v]) => `${k}:${v}`).join(' ');
};

let deaths0 = 0, ev0 = 0;
const counts = {};
const pickedAt = new Map();
const drops = [];
for (let m = 1; m <= minutes && !world.ended; m++) {
  for (let sec = 0; sec < 60 && !world.ended; sec++) {
    stepBg(app, bg, 10);
    for (; ev0 < bg.wsgEvents.length; ev0++) {
      const e = bg.wsgEvents[ev0];
      if (e.kind === 'score' || e.kind === 'powerup') continue;
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
      if (e.kind === 'pickup') pickedAt.set(e.unit, e.t);
      if (e.kind === 'drop' || e.kind === 'capture') {
        const u = world.units.get(e.unit);
        const near = world.unitsNear(u.pos.x, u.pos.y, 30);
        const foes = near.filter((o) => o.team !== u.team && world.alive(o)).length;
        const friends = near.filter((o) => o.team === u.team && o.id !== u.id && world.alive(o)).length;
        const carried = Math.round((e.t - (pickedAt.get(e.unit) ?? e.t)) / 1000);
        drops.push(`${e.kind} ${e.unit} after ${carried}s at ${zone(u.pos)} (${Math.round(u.pos.x)},${Math.round(u.pos.y)}) foes ${foes} friends ${friends}`);
      }
    }
  }
  const d = bg.match.deaths;
  const shards = [...world.currentShards()].filter((s) => new Set(s.units.map((id) => world.units.get(id).team)).size > 1);
  const fights = shards.map((s) => {
    let a = 0, h = 0;
    for (const id of s.units) { const u = world.units.get(id); if (!world.alive(u)) continue; if (u.team === 'alliance') a++; else h++; }
    return `${a}v${h}@${zone(world.units.get(s.units[0]).pos)}`;
  }).join(',');
  const flags = ['alliance', 'horde'].map((t) => { const f = world.objectives.get(flagObjectiveId(t)); return `${t[0]}:${f.state}${f.carrier ? `(${f.carrier})` : ''}`; }).join(' ');
  console.log(`${String(m).padStart(2)}m  deaths +${d - deaths0} (${d})  kills A${bg.teamKills.alliance}-H${bg.teamKills.horde}  score A${world.score.alliance}-H${world.score.horde}  flags ${flags}  fights [${fights}]`);
  if (process.argv.includes('--where')) console.log(`     A: ${where('alliance')}\n     H: ${where('horde')}`);
  deaths0 = d;
}
if (process.argv.includes('--drops')) for (const l of drops) console.log('  ', l);
console.log('events', counts, world.ended ? `ended, winner ${world.winner ?? 'none'}` : 'still running');
process.exit(0);
