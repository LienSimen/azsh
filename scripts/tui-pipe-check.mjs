// Drives the real terminal path (RealTerm, raw key bytes on stdin, ANSI frames on stdout) through pipes:
// `azsh --tui --new` in a child process with a throwaway AZSH_HOME. Checks that a lone Esc acts at once,
// PgDn pages, Enter opens a dialog, Esc closes it, and :quit saves and exits 0. Run with `npm run check:pipe`.
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'azsh-pipe-'));
// AZSH_EXE=dist/azsh.exe runs the same checks against the standalone build.
const [cmd, ...pre] = process.env.AZSH_EXE ? [process.env.AZSH_EXE] : [process.execPath, 'bin/azsh.mjs'];
const child = spawn(cmd, [...pre, '--tui', '--new'], {
  env: { ...process.env, AZSH_HOME: home, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
});
let out = '', err = '', exited = null;
child.stdout.on('data', (d) => { out += d; });
child.stderr.on('data', (d) => { err += d; });
child.on('exit', (c) => { exited = c; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = async (bytes, ms = 200) => { child.stdin.write(bytes); await sleep(ms); };
let failures = 0;
const check = (label, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`); if (!cond) failures++; };

/** Replay cursor-addressed writes into a screen model. */
function screen() {
  const rows = new Map();
  const re = /\x1b\[(\d+);1H([^\x1b]*(?:\x1b\[(?!\d+;1H)[^\x1b]*)*)/g;
  let m;
  while ((m = re.exec(out))) rows.set(Number(m[1]), m[2].replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''));
  const h = rows.size ? Math.max(...rows.keys()) : 0;
  const lines = [];
  for (let i = 1; i <= h; i++) lines.push((rows.get(i) ?? '').replace(/\s+$/, ''));
  return lines.join('\n');
}
const waitFor = async (re, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(screen())) return true; await sleep(100); } return false; };

check('the create screen appears', await waitFor(/Race\s+Human/));
await key('\x1b[B'); await key('\x1b[B'); await key('\x1b[B'); // Human Warrior, Male: down to Name
await key('\r');                                                 // Enter types one
for (const ch of 'Pipetest') await key(ch, 20);
await key('\r');                                                 // named: the cursor lands on Create
await key('\r', 1000);
check('world tab after character creation', /Pipetest L1/.test(screen()) && /Quests/.test(screen()));
await key('6', 400);
check('digit switches to the Rotation tab', /Pre-buff/.test(screen()));
await key('\x1b[6~', 400);
check('PgDn pages the rotation list', /Settings/.test(screen()));
const t0 = Date.now();
await key('\x1b', 250);                                           // a lone Esc: back to World, at once
check(`lone Esc acts at once (${Date.now() - t0} ms)`, /Quests/.test(screen()) && !/Pre-buff/.test(screen()));
await key('\r', 400);
check('Enter opens the quest on the cursor', /›/.test(screen()) && /Accept the quest/.test(screen()));
await key('\x1b', 300);
check('Esc closes the dialog', !/Accept the quest/.test(screen()));
await key(':', 100); for (const ch of 'quit') await key(ch, 30); await key('\r', 1500);
const code = exited ?? await new Promise((r) => { child.on('exit', r); setTimeout(() => { child.kill(); r('killed'); }, 3000); });
check('quit exits 0', code === 0);
check('the save was written', readdirSync(join(home, 'saves')).some((f) => f.startsWith('pipetest')));
check('alternate screen restored', /\x1b\[\?1049l/.test(out));
check('no stderr output', !err);
if (err) console.log(err);
rmSync(home, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : '\nall pipe checks passed');
process.exit(failures ? 1 : 0);
