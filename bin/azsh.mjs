#!/usr/bin/env node
// azsh: Azeroth shell. Node 22.18+ strips TypeScript types natively, so the engine loads as-is.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`azsh needs Node 22.18 or newer (found ${process.versions.node}).`);
  process.exit(1);
}
const { main } = await import('../src/cli/repl.mjs');
await main(process.argv.slice(2));
