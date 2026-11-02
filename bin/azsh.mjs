#!/usr/bin/env node
// azsh: Azeroth shell. Node 22.18+ strips TypeScript types natively, so the engine loads as-is.
// A terminal gets the windowed game; piped input (or --repl) gets the line game.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`azsh needs Node 22.18 or newer (found ${process.versions.node}).`);
  process.exit(1);
}
const argv = process.argv.slice(2);
if (argv.includes('--art')) {
  // Fetch the full-size art up front instead of waiting for the in-game offer; says what and from where first.
  const { hdManifest, missingHdBytes, downloadHdArt, downloadDir } = await import('../src/cli/hdArt.mjs');
  const m = hdManifest(), bytes = missingHdBytes();
  if (!m) { console.error('This build has no art manifest.'); process.exit(1); }
  if (!bytes) { console.log(`The full-size art is all here (${downloadDir()}).`); process.exit(0); }
  console.log(`Fetching ${Math.round(bytes / 1e6)} MB of full-size art (${m.files.length} files, sha256-checked)\n  from ${m.base}\n  into ${downloadDir()}`);
  const res = await downloadHdArt((done, total) => {
    if (process.stdout.isTTY) process.stdout.write(`\r  ${Math.round(done / 1e6)} of ${Math.round(total / 1e6)} MB`);
  });
  if (process.stdout.isTTY) process.stdout.write('\n');
  console.log(res.ok ? 'Done. A sixel terminal now draws creatures, characters and icons in real pixels.' : `Stopped: ${res.reason}`);
  process.exit(res.ok ? 0 : 1);
}
await import('../src/cli/register.mjs');
const wantRepl = argv.includes('--repl') || (!argv.includes('--tui') && (!process.stdin.isTTY || !process.stdout.isTTY));
if (wantRepl) {
  const { main } = await import('../src/cli/repl.mjs');
  await main(argv.filter((a) => a !== '--repl' && a !== '--tui'));
} else {
  // Loading the engine takes a moment (longer on the first run, which fills the stripped-JS cache); say so.
  process.stdout.write('azsh: loading...\n');
  const { runTui } = await import('../src/cli/tui.mjs');
  await runTui({ argv });
  process.exit(0); // the save is written before the screen closes; a piped stdin would otherwise hold the loop open
}
