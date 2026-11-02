// Records a scripted play session of the windowed game for the README's pictures: `azsh --tui` runs in a
// child process on pipes (as scripts/tui-pipe-check.mjs drives it), told it is COLS x ROWS and that a cell
// is CELLW x CELLH pixels, with sixel on (AZSH_SIXEL=1), so the full-size art goes out as sixel. Every byte
// it writes is logged with the time it was written, and the script drops named marks between the scenes.
// scripts/demo-render.py replays the log through a terminal emulator and writes a clip per mark.
//
//   node scripts/demo-record.mjs new  media/rec/new.jsonl      # roll a character, fight, autopilot, the tabs
//   node scripts/demo-record.mjs bot  media/rec/bot.jsonl      # a random world bot: sheet, talents, spells...
//   AZSH_SIXEL=0 keeps the half-block art; --cols, --rows, --cellw, --cellh set the terminal.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const [scene, outFile] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!scene || !outFile) { console.error('usage: node scripts/demo-record.mjs <new|bot> <out.jsonl> [--cols 160 --rows 48 --cellw 10 --cellh 20]'); process.exit(2); }
const cols = +opt('cols', 160), rows = +opt('rows', 48), cellW = +opt('cellw', 10), cellH = +opt('cellh', 20);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify({ cols, rows, cellW, cellH, scene, sixel: process.env.AZSH_SIXEL !== '0' })}\n`);
const t0 = Date.now();
const log = (rec) => appendFileSync(outFile, `${JSON.stringify({ t: Date.now() - t0, ...rec })}\n`);

const home = mkdtempSync(join(tmpdir(), 'azsh-demo-'));
// A pipe has no size: the preload tells the game how big the terminal is.
const size = `data:text/javascript,process.stdout.columns=${cols};process.stdout.rows=${rows};`;
const child = spawn(process.execPath, ['--import', size, 'bin/azsh.mjs', '--tui', '--new'], {
  env: { AZSH_SIXEL: '1', ...process.env, AZSH_HOME: home }, stdio: ['pipe', 'pipe', 'pipe'],
});
let err = '', exited = null;
child.stdout.on('data', (d) => { log({ o: d.toString('base64') }); screenFeed(d.toString('utf8')); });
child.stderr.on('data', (d) => { err += d; });
child.on('exit', (c) => { exited = c; });

// ---- a rough screen model, enough to wait for text ----------------------------------------------------
const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
let cx = 0, cy = 0, pending = '';
function screenFeed(s) {
  s = pending + s; pending = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\x1b') {
      const rest = s.slice(i + 1);
      if (rest[0] === 'P') { const e = rest.indexOf('\x1b\\'); if (e < 0) { pending = s.slice(i); return; } i += 1 + e + 2; continue; }
      const m = rest.match(/^\[([0-9;?]*)([A-Za-z@`])/);
      if (!m) { if (rest.length < 12) { pending = s.slice(i); return; } i += 1; continue; }
      i += 1 + m[0].length;
      const p = m[1].split(';').map((n) => +n);
      if (m[2] === 'H') { cy = Math.max(0, (p[0] || 1) - 1); cx = Math.max(0, (p[1] || 1) - 1); }
      else if (m[2] === 'J') { for (const r of grid) r.fill(' '); }
      else if (m[2] === 'K') { grid[cy]?.fill(' '); }
      continue;
    }
    i += 1;
    if (c === '\n') { cy = Math.min(rows - 1, cy + 1); continue; }
    if (c === '\r') { cx = 0; continue; }
    if (c < ' ') continue;
    if (cy < rows && cx < cols) grid[cy][cx] = c;
    cx += 1;
  }
}
const screen = () => grid.map((r) => r.join('').replace(/\s+$/, '')).join('\n');
const cursorRow = () => grid.map((r) => r.join('')).find((l) => l.includes('▶')) ?? '';

// ---- the script's verbs ------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = async (bytes, ms = 400) => { log({ k: bytes }); child.stdin.write(bytes); await sleep(ms); };
const type = async (text, ms = 90) => { for (const ch of text) await key(ch, ms); };
const mark = (name) => { log({ m: name }); console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${name}`); };
const waitFor = async (re, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(screen())) return true; await sleep(100); } console.error(`timed out waiting for ${re}\n${screen()}`); return false; };
/** Press `k` until the cursor row matches, at most `max` times. */
const moveUntil = async (k, re, max = 40, ms = 350) => { for (let i = 0; i < max; i++) { if (re.test(cursorRow())) return true; await key(k, ms); } return re.test(cursorRow()); };
/** Press `k` until the screen matches. */
const pressUntil = async (k, re, max = 20, ms = 500) => { for (let i = 0; i < max; i++) { if (re.test(screen())) return true; await key(k, ms); } return re.test(screen()); };
const UP = '\x1b[A', DOWN = '\x1b[B', RIGHT = '\x1b[C', LEFT = '\x1b[D', ENTER = '\r', ESC = '\x1b', TAB = '\t', END = '\x1b[F', PGDN = '\x1b[6~';

const scenes = {
  // A new character: the create form, the world, a live fight, the autopilot, then the tabs.
  async new() {
    await waitFor(/Race\s+Human/);
    // The terminal's answers: no DA1 is needed (AZSH_SIXEL=1), the cell size is what the renderer draws.
    child.stdin.write(`\x1b[6;${cellH};${cellW}t`);
    await sleep(800);
    mark('create');
    await sleep(1200);
    await key(RIGHT, 900); await key(RIGHT, 900); await key(RIGHT, 1200); // a few races, each drawn
    await key(LEFT, 900); await key(LEFT, 900); await key(LEFT, 900);     // back to Human
    await key(DOWN, 500);
    await pressUntil(RIGHT, /Class\s+Mage/, 8, 900);
    await key(DOWN, 500); await key(RIGHT, 1000);                          // Female
    await key(DOWN, 400);
    await key(ENTER, 600); await type('Aeliana'); await key(ENTER, 900);
    await key('r', 700); await key('r', 700); await key('r', 900);          // a random look, thrice
    await moveUntil(DOWN, /▶\s*Create /);
    await sleep(900);
    await key(ENTER, 2500);
    await waitFor(/Aeliana L1/);
    mark('world');
    await sleep(1500);
    // The people come first (a town's worth): page down to the creatures, then walk onto a kobold.
    await pressUntil(PGDN, /^Creatures/m, 6, 700);
    if (!(await moveUntil(DOWN, /▶.*Kobold/, 30, 300))) await moveUntil(UP, /▶.*Kobold/, 30, 300);
    await sleep(1500);
    await key(DOWN, 900); await key(DOWN, 900); await key(UP, 900); await key(UP, 900);
    await sleep(600);
    mark('fight');
    await key(ENTER, 300);
    await waitFor(/Fighting/, 5000);
    // Let the rotation play; a level 1 mage and a kobold take a dozen seconds.
    const ended = await waitFor(/Victory|You die|is dead|dies\./, 45000);
    if (!ended) await key(ESC, 300);
    await sleep(2500);
    mark('autopilot');
    await key('a', 1500);
    await key(ENTER, 300);
    await sleep(40000);
    await key(ESC, 500); await key(ESC, 1500); // stop the run (out of a fight too)
    mark('tabs');
    await sleep(600);
    for (const k of ['2', '3', '4', '5', '6', '8', '9', '0']) await key(k, 2200);
    await key(TAB, 2600);
    await key('1', 1200);
    mark('end');
    await key(':', 150); await type('quit', 40); await key(ENTER, 1500);
  },
  // The create screen alone, a few races in: run once with AZSH_SIXEL=0 and once with 1 for the art comparison.
  async art() {
    await waitFor(/Race\s+Human/);
    child.stdin.write(`\x1b[6;${cellH};${cellW}t`);
    await sleep(800);
    mark('art');
    for (let i = 0; i < 5; i++) await key(RIGHT, 1200);
    mark('end');
    await key(ESC, 800);
    await key(':', 150); await type('quit', 40); await key(ENTER, 1500);
  },
  // A random world bot, at its own level in its gear: the character tab, the sheet, the talent trees, spells.
  async bot() {
    await waitFor(/Race\s+Human/);
    child.stdin.write(`\x1b[6;${cellH};${cellW}t`);
    await sleep(500);
    await moveUntil(END, /▶\s*Random character/, 1, 400);
    await moveUntil(DOWN, /▶\s*Random character/);
    await key(ENTER, 2500);
    await waitFor(/ L\d+ /);
    mark('world');
    await sleep(2000);
    await key(LEFT, 2500);              // Character (the last tab)
    mark('character');
    await sleep(2500);
    await key('4', 2500);               // Gear: the sheet
    mark('gear');
    for (let i = 0; i < 6; i++) await key('\x1b[1;2B', 700); // Shift+Down walks the slots
    await sleep(1200);
    await key('7', 2500);               // Talents: the trees
    mark('talents');
    for (let i = 0; i < 4; i++) await key('\x1b[1;2B', 700);
    for (let i = 0; i < 3; i++) await key('\x1b[1;2C', 700);
    await sleep(1200);
    await key('5', 2500);               // Spells
    mark('spells');
    for (let i = 0; i < 5; i++) await key(DOWN, 500);
    await sleep(1200);
    await key('9', 2500);               // Professions
    mark('professions');
    await sleep(2000);
    await key(ENTER, 2500);
    for (let i = 0; i < 5; i++) await key(DOWN, 500);
    await sleep(1500);
    await key(ESC, 800);
    await key('8', 2500);               // Travel
    mark('travel');
    for (let i = 0; i < 4; i++) await key(DOWN, 500);
    await sleep(1500);
    mark('end');
    await key(':', 150); await type('quit', 40); await key(ENTER, 1500);
  },
};

if (!scenes[scene]) { console.error(`no scene ${scene}; have ${Object.keys(scenes).join(', ')}`); process.exit(2); }
await scenes[scene]();
const code = exited ?? await new Promise((r) => { child.on('exit', r); setTimeout(() => { child.kill(); r('killed'); }, 4000); });
rmSync(home, { recursive: true, force: true });
if (err) console.error(err);
console.log(`exit ${code}; wrote ${outFile}`);
