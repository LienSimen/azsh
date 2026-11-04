// The target dummy (the web client's rotationSimLab.ts): run the rotation on screen against a stunned dummy
// many times over and read the parse. The dummy never dies, so the numbers measure the rotation and nothing else;
// every one comes from the same combat engine the game fights in (domain/sim/dummySim.ts).
import { bold, dim, yellow, green, red, cyan, fit, bar } from './text.mjs';
import { createDummySim } from '../domain/sim/dummySim.ts';
import { DUMMY_TARGETS, DEFAULT_DUMMY_ENTRY, dummyTarget } from '../domain/sim/targetDummy.ts';

const FIGHT_SECS = [20, 30, 60, 120];
const ITERATIONS = [20, 50, 100, 200];
const STEP_MS = 40; // engine time per timer tick, so the screen keeps drawing while it runs
const H = (text) => ({ text, header: true });
const nf = (v) => (v >= 1000 ? Math.round(v).toLocaleString('en-US') : String(v));
const cycle = (list, v) => list[(list.indexOf(v) + 1) % list.length];

/** `owner()` gives `{ name, who, rotation, char, spellbook }` for whoever the Rotation tab is editing
 *  (`name` is possessive, "Your" / "Milto's"; `who` is the subject, "You" / "Milto"). */
export function simLabDialog(app, owner) {
  const s = { entry: DEFAULT_DUMMY_ENTRY, fightSecs: 20, iterations: 50, run: null, report: null, timer: null };
  const stop = () => { if (s.timer) app.term.clearInterval(s.timer); s.timer = null; if (s.run) s.report = s.run.report(); };
  const start = (a) => {
    stop();
    const o = owner();
    const state = { ...a.g.state, char: o.char, spellbook: o.spellbook };
    s.report = null;
    s.run = createDummySim(a.ds, state, o.rotation, { entry: s.entry, iterations: s.iterations, fightSecs: s.fightSecs, seed: 1337 }, () => performance.now());
    s.timer = a.term.setInterval(() => {
      s.run.step(STEP_MS);
      if (s.run.done) { stop(); a.say(green(`Dummy parse done: ${nf(s.report.dps.avg)} DPS.`)); }
      a.renderSoon();
    }, 50);
  };
  const view = {
    id: 'sim-lab', title: 'Target dummy', hint: 'Enter: change / run', noDetail: true,
    sim: s,
    onClose: () => stop(),
    keys: { G: { hint: 'run', fn: (a) => start(a) } },
    rows(a) {
      const o = owner();
      const t = dummyTarget(s.entry);
      const busy = !!s.timer;
      const rows = [H(`${bold(`${o.name} rotation`)} ${dim('against a dummy that stands still and never dies')}`), H('')];
      const setting = (label, value, fn) => ({ text: `${fit(label, 10)} ${value}`, act: () => { if (busy) return; fn(); s.report = null; } });
      rows.push(setting('Dummy', `${t?.label ?? s.entry}  ${dim(t?.note ?? '')}`, () => { s.entry = cycle(DUMMY_TARGETS.map((d) => d.entry), s.entry); }));
      rows.push(setting('Fight', `${s.fightSecs} s`, () => { s.fightSecs = cycle(FIGHT_SECS, s.fightSecs); }));
      rows.push(setting('Fights', `${s.iterations}  ${dim(`${nf(s.iterations * s.fightSecs * 10)} rounds of combat`)}`, () => { s.iterations = cycle(ITERATIONS, s.iterations); }));
      rows.push({ text: busy ? yellow('Stop') : green(s.report ? 'Run again' : 'Run the parse'), act: (a2) => { if (busy) { stop(); } else start(a2); } });
      rows.push(H(''));
      if (busy && s.run) {
        rows.push(H(`${bar(s.run.completed, s.run.iterations, 30, cyan)} ${dim(`fight ${Math.min(s.run.iterations, s.run.completed + 1)} of ${s.run.iterations}`)}`));
        return rows;
      }
      if (s.report) rows.push(...reportRows(s.report, o.who));
      return rows;
    },
  };
  return view;
}

function reportRows(r, who) {
  if (r.refusedReason) return [H(red(`The dummy could not be pulled: ${r.refusedReason}`))];
  const powerLabel = r.power.type === 'mana' ? 'mana' : r.power.type === 'rage' ? 'rage' : 'energy';
  const out = [
    H(`${who} vs ${r.target.name}, level ${r.target.level}, ${nf(r.target.armor)} armor. ${r.iterations} fights of ${r.fightSecs} s.`),
    H(''),
    H(`${bold(green(`${nf(r.dps.avg)} DPS`))}  ${dim(`median ${nf(r.dps.median)}, lowest ${nf(r.dps.min)}, highest ${nf(r.dps.max)}, spread ±${nf(r.dps.stdev)}`)}`),
    H(`${nf(r.totals.castsPerMin)} casts a minute, ${r.totals.idlePct}% idle.   ${r.power.damagePerPoint > 0 ? `${r.power.damagePerPoint} damage per ${powerLabel}, ` : ''}${dim(`${nf(r.power.spent)} spent, ${nf(r.power.regained)} back per fight`)}`),
  ];
  if (r.deaths > 0) out.push(H(yellow(`${r.deaths} of ${r.iterations} fights ended in your death; the DPS is over the seconds you were alive.`)));
  if (r.power.oomFights > 0) out.push(H(yellow(`${r.power.oomFights} fights ended under 5% ${powerLabel}.`)));
  if (r.totals.idlePct >= 25) out.push(H(yellow(`The rotation had nothing to press on ${r.totals.idlePct}% of rounds.`)));
  out.push(H(''), H(cyan(`${fit('Ability', 24)} ${fit('Damage', 9, true)} ${fit('Share', 6, true)} ${fit('Casts', 6, true)} ${fit('Avg', 7, true)} ${fit('Crit', 6, true)} ${fit('Miss', 6, true)}`)));
  if (!r.abilities.length) out.push(H(dim('The rotation cast nothing. Check range, power and the rule conditions.')));
  for (const ab of r.abilities) {
    out.push(H(`${fit(ab.name, 24)} ${fit(nf(ab.damage), 9, true)} ${fit(`${ab.damagePct}%`, 6, true)} ${fit(String(ab.casts), 6, true)} ${fit(nf(ab.avgHit), 7, true)} ${fit(`${ab.critPct}%`, 6, true)} ${fit(`${ab.missPct}%`, 6, true)}${ab.uptimeSec > 0 ? dim(`  up ${ab.uptimeSec}s`) : ''}`));
  }
  const t = r.totals;
  const parts = [['hits', t.hits], ['crits', t.crits], ['misses', t.misses], ['dodges', t.dodges], ['parries', t.parries], ['blocks', t.blocks], ['resists', t.resists], ['glancing', t.glancing], ['crushing', t.crushing]].filter(([, n]) => n > 0);
  out.push(H(''), H(dim(parts.length ? parts.map(([l, n]) => `${nf(n)} ${l}`).join(', ') : 'Nothing landed.')));
  return out;
}
