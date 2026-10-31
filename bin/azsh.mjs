#!/usr/bin/env node
// azsh: Azeroth shell. Node 22.18+ strips TypeScript types natively, so the engine loads as-is.
// A terminal gets the windowed game; piped input (or --repl) gets the line game.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`azsh needs Node 22.18 or newer (found ${process.versions.node}).`);
  process.exit(1);
}
await import('../src/cli/register.mjs');
const argv = process.argv.slice(2);
const wantRepl = argv.includes('--repl') || (!argv.includes('--tui') && (!process.stdin.isTTY || !process.stdout.isTTY));
if (wantRepl) {
  const { main } = await import('../src/cli/repl.mjs');
  await main(argv.filter((a) => a !== '--repl' && a !== '--tui'));
} else {
  const { runTui } = await import('../src/cli/tui.mjs');
  await runTui({ argv });
  process.exit(0); // the save is written before the screen closes; a piped stdin would otherwise hold the loop open
}
