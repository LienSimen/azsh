// Timing probe for the windowed game: module import, boot stages, heap, a repaint on every tab, and a live fight
// tick by tick, all headless. Numbers, not pass/fail; run with `npm run check:perf` and compare against the last
// run. The import is timed from a child process so the loader cache state is what a real launch would see.
import { execFileSync } from 'node:child_process';

const registerUrl = new URL('./register.mjs', import.meta.url).href;
const mb = (n) => `${(n / 1048576).toFixed(0)} MB`;
const now = () => performance.now();
const heap = () => process.memoryUsage();

// 1. Import cost, twice: the first run fills the stripped-JS cache when it is empty, the second is a normal launch.
const probe = 'const t = performance.now(); await import(process.argv[1]); console.log((performance.now() - t).toFixed(0));';
const tuiUrl = new URL('./tui.mjs', import.meta.url).href;
const importMs = () => Number(execFileSync(process.execPath, ['--import', registerUrl, '--input-type=module', '-e', probe, tuiUrl], { encoding: 'utf8' }).trim());
console.log(`import tui.mjs: ${importMs()} ms, then ${importMs()} ms`);

// 2. Boot stages and heap, in this process.
const { bootDataStore } = await import('./bootData.mjs');
const { HeadlessTerm } = await import('./term.mjs');
const { App } = await import('./tui.mjs');
const { newGameState } = await import('../engine/game.ts');
console.log(`heap after imports: ${mb(heap().heapUsed)}`);
let t = now(), stage = null;
const stages = [];
const ds = bootDataStore((s) => { if (stage) stages.push([stage, now() - t]); stage = s; t = now(); });
stages.push([stage, now() - t]);
console.log(`boot: ${stages.map(([s, ms]) => `${s} ${ms.toFixed(0)}`).join(', ')} = ${stages.reduce((a, [, ms]) => a + ms, 0).toFixed(0)} ms; heap ${mb(heap().heapUsed)}, rss ${mb(heap().rss)}`);

// 3. A repaint on every tab, and the world rows alone.
const term = new HeadlessTerm(110, 34);
const repo = { async save() {}, async list() { return []; }, async load() { return null; } };
const app = new App({ term, ds, repo });
term.open();
const human = ds.races().find((r) => r.name === 'Human');
app.startGame(newGameState(ds, human.id, 1, 'Perftest', 12345, 0), 'perftest', Date.now(), true);
const per = (fn, n = 50) => { fn(); const t0 = now(); for (let i = 0; i < n; i++) fn(); return (now() - t0) / n; };
const tabs = [];
for (let i = 0; i < app.tabs.length; i++) { app.switchTab(i); tabs.push(`${app.tabs[i].label} ${per(() => app.render()).toFixed(2)}`); }
app.switchTab(0);
console.log(`repaint ms/frame: ${tabs.join(', ')}; world rows alone ${per(() => app.rowsOf(app.top())).toFixed(2)}`);

// 4. A live fight: the engine tick and the repaint timed apart.
const mobRow = app.rowsOf(app.top()).findIndex((r) => r.data?.creature);
app.top().cursor = mobRow; term.press('return');
if (!app.fight) { console.log('FAIL no fight started'); process.exit(1); }
const s = app.fight.session;
let n = 0, eng = 0, ren = 0;
while (app.fight && n < 5000) {
  const a = now(); const ev = s.tick(); eng += now() - a;
  app.fight.logEvents(ev);
  const b = now(); app.render(); ren += now() - b;
  if (s.ended) app.fight.finish();
  n++;
}
console.log(`fight: ${n} ticks, engine ${(eng / n).toFixed(2)} ms/tick, repaint ${(ren / n).toFixed(2)} ms/frame`);
app.closed = true;
