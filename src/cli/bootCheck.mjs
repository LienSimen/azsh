// The gate: boot the store, roll a level-1 warrior, fight ten kobolds, save and reload.
// Exits 1 on any throw or on a failed save roundtrip. `npm run check`.
import { bootDataStore } from './bootData.mjs';
import { createGame, newGameState } from '../engine/game.ts';
import { addItem } from '../domain/items/inventory.ts';
import { MemorySaveRepository } from '../persistence/memoryRepository.ts';
import { toSave } from '../persistence/saveShape.ts';

const t0 = performance.now();
const ds = bootDataStore((s) => process.stdout.write(`${s} `));
console.log(`\nstore up in ${Math.round(performance.now() - t0)} ms, ${ds.zones().length} zones`);

const g = createGame(ds, newGameState(ds, 1, 1, 'Check', 777));
if (g.state.char.equipped.mainhand == null) {
  const weapon = ds.allItems().find((i) => i.slot === 'mainhand' && i.requiredLevel <= 1);
  if (weapon) { g.state.inventory = addItem(g.state.inventory, weapon.entry, 1, 1); g.equip(weapon.entry); }
}
let wins = 0;
for (let i = 0; i < 10; i++) {
  const r = g.fight(6);
  if (r.ok && r.outcome === 'win') wins++;
  g.regenTick(30, true);
}
console.log(`kobolds: ${wins}/10 wins, level ${g.state.char.level}, ${g.state.char.gold} copper`);

const repo = new MemorySaveRepository();
await repo.save(toSave('check', g.snapshot(), Date.now()));
const back = await repo.load('check');
const state2 = back?.state;
if (!state2 || state2.char.level !== g.state.char.level || state2.char.gold !== g.state.char.gold) {
  console.error('save roundtrip FAILED');
  process.exit(1);
}
console.log('save roundtrip ok');
