// Drives the windowed game headlessly: decodes raw key bytes, rolls a character, walks every tab, opens a
// quest, a vendor and a trainer, pages through quest text, runs a live fight tick by tick, runs the autopilot
// through a live fight, and edits the rotation through its menu. Run with `npm run check:tui`; pass --frames
// to see every screen.
import { HeadlessTerm, decodeKeys, takeMarks } from './term.mjs';
import { noteDeviceAttributes, imageOf } from './sixel.mjs';
import { splitCells } from './iconGrid.mjs';
import { iconCells } from './iconArt.mjs';
import { App } from './tui.mjs';
import { bootDataStore } from './bootData.mjs';
import { newGameState } from '../engine/game.ts';
import { newGameStateFromWorldBot } from '../engine/game/newGameState.ts';
import { maxPower } from '../domain/character/character.ts';
import { startFight } from './tuiFight.mjs';
import { strip, vis, wrapLines, coinText } from './text.mjs';
import { visibleBars } from './tuiBars.mjs';
import { defaultConditionsForSpell } from './tuiRotationCond.mjs';
import { creatureArt, objectArt, hasArt, artWidth } from './modelArt.mjs';
import { nativeDisplayId } from '../domain/character/displayForm.ts';
import { paperdollLayers, paperdollArt } from './paperdoll.mjs';
import { playerArt, questDialog } from './tuiViews.mjs';
import { worldMapLines } from './tuiMap.mjs';
import { iconsOn, withIcon, wrapIconLines } from './iconArt.mjs';
import { addItem, countItem } from '../domain/items/inventory.ts';
import { offeredQuests } from '../quests/quests.ts';
import { isTalkToNpcQuest } from '../domain/quests/questlog.ts';

const showFrames = process.argv.includes('--frames');
let failures = 0;
const check = (label, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`); if (!cond) failures++; };

// ---- raw key decoding (what a real terminal sends) --------------------------------------------------
const keyCases = [
  ['\x1b', ['escape']], ['\x1b\x1b', ['escape', 'escape']], ['\x1b[A', ['up']], ['\x1b[B\x1b', ['down', 'escape']],
  ['\x1b[5~', ['pageup']], ['\x1b[6~', ['pagedown']], ['\x1b[Z', ['shift-tab']], ['\x1bOH', ['home']], ['\x1b[F', ['end']],
  ['\r', ['return']], ['\r\n', ['return']], ['\t', ['tab']], ['\x7f', ['backspace']], ['\b', ['backspace']], [' ', ['space']],
  ['\x03', ['ctrl-c']], ['K', ['K']], [':', [':']], ['\x1b1', ['alt-1']], ['a\x1b[Bb', ['a', 'down', 'b']],
];
check('raw key decoding', keyCases.every(([bytes, want]) => JSON.stringify(decodeKeys(bytes)) === JSON.stringify(want)));

const t0 = performance.now();
const ds = bootDataStore();
console.log(`store ready in ${Math.round(performance.now() - t0)} ms`);

const term = new HeadlessTerm(110, 34);
const repo = { saved: 0, async save() { this.saved++; }, async list() { return []; }, async load() { return null; } };
const app = new App({ term, ds, repo });
term.open();
const human = ds.races().find((r) => r.name === 'Human');
app.startGame(newGameState(ds, human.id, 1, 'Tuitest', 12345, 0), 'tuitest', Date.now(), true);
app.render();

const frame = () => term.text();
const home = () => { let n = 0; while (app.stack.length && n++ < 10) term.press('escape'); };
const show = (label) => { if (showFrames) console.log(`\n=== ${label} ===\n${frame()}`); };
const rowIndex = (pred) => app.rowsOf(app.top()).findIndex((r) => !r.header && pred(r, strip(r.text)));
/** Run a live fight to its end by hand, through the hold a win keeps on screen after it. */
const finishFight = () => { let n = 0; while (app.fight && n < 3000) { app.fight.tick(); n++; } return n; };

show('world');
check('header shows the character', frame().includes('Tuitest') && frame().includes('Elwynn Forest'));
check('world lists creatures', rowIndex((r, s) => r.data?.creature && /Kobold/.test(s)) >= 0);
{
  // The People rows draw their NPC: the art pack bakes every vendor, trainer and innkeeper a zone lists.
  const vendor = rowIndex((r, s) => /<General Supplies>/.test(s));
  const saved = app.top().cursor;
  app.top().cursor = vendor; app.render();
  check('a vendor row draws the merchant beside their title', vendor >= 0 && /[▀▄]/.test(frame()));
  app.top().cursor = saved; app.render();
}
{
  const rs = app.rowsOf(app.top()).filter((r) => r.header).map((r) => strip(r.text));
  check('world lists quests last, after creatures', rs.indexOf('Quests') > rs.findIndex((s) => s.startsWith('Creatures')));
}

// Tabs 2..9 and 0 all render without throwing; Left/Right and Esc move between them.
for (const k of ['2', '3', '4', '5', '6', '7', '8', '9', '0']) { term.press(k); show(`tab ${k}`); }
// Rules are two lines each with their icons, so the Combat phase can start past the first window.
check('rotation tab shows rules', (term.press('6'), /Combat \(checked/.test(frame()) || (term.press('pagedown'), /Combat \(checked/.test(frame()))));
check('talents tab renders', (term.press('7'), /Talents unlock|point/.test(frame())));
check('0 opens the tenth tab', (term.press('0'), app.tab === 9));
const lastTab = app.tabs.length - 1;
check('the last tab is Settings', (app.switchTab(lastTab), app.top().id === 'settings' && /Auto-loot/.test(frame())));
check('the character tab heads with your name and lists your gear', (app.switchTab(3), frame().includes(app.ch.name) && /Chest/.test(strip(frame()))));
check('s on the character tab opens your stats', (term.press('s'), app.top().id === 'char' && /Attributes/.test(frame())));
check('the stats page draws your body', !hasArt(nativeDisplayId(app.ch.race, app.ch.gender)) || /[▀▄]/.test(frame()));
{
  // Starting gear is a shirt, pants, boots and a weapon or two: at least three of them have an appearance overlay.
  const p = paperdollLayers(app.ch);
  check('your starting gear stacks on your body', !p || (p.layers.filter((l) => /^\d/.test(l.key)).length >= 3 && !!paperdollArt(app.ch, 20, 12)));
}
{
  // A form or a costume is the model you are drawn as: each one's model is in the pack, and a fight's live
  // view (the form, a Polymorph debuff) beats the saved character. Cite: displayForm.ts wornDisplay.
  const drawn = (view) => playerArt(app, 20, 12, view)?.lines.join('\n');
  const as = (displayId, height = 1) => creatureArt(displayId, 20, Math.round(12 * height))?.join('\n');
  const view = (o) => ({ buffs: [], debuffs: [], ...o });
  const flipOut = app.ds.creature(app.ds.spell(8219)?.effects.find((e) => e.kind === 'transform')?.creatureEntry)?.displayId;
  const saved = app.ch.activeAuras;
  app.ch.activeAuras = [...(saved ?? []), { spellId: 8219, expiresAt: Date.now() + 60_000 }];
  const costumed = drawn(null) === as(flipOut);
  app.ch.activeAuras = saved;
  check('every form and costume model is in the art pack', [892, 8571, 2281, 2289, 632, 2428, 4613, 15374, 15375, 864, 857, flipOut].every((id) => hasArt(id)));
  check('cat form in a fight draws you as the cat', drawn(view({ form: 1 })) === as(892, 0.6));
  check('the cat stands lower than you do on two legs', playerArt(app, 20, 12, view({ form: 1 })).lines.length < playerArt(app, 20, 12, view({ form: 0 })).lines.length);
  check('a Polymorph on you draws the sheep over your form, critter-sized', drawn(view({ form: 1, debuffs: [{ spellId: 118 }] })) === as(857, 0.35));
  check('a costume aura draws its model', costumed);
  check('out of form you are in your gear again', drawn(view({ form: 0 })) === paperdollArt(app.ch, 20, 12)?.join('\n'));
}
{
  // What a fight turns into or brings in is drawn too: Dathrohan's morph to Balnazzar, a shaman's totem, a
  // witch doctor's ward. None is spawned anywhere, so the bake follows each kit. Cite: bake-model-art.mjs addFightCreatures.
  check('a boss morph, a totem and a ward have art', [10813, 3903, 3560].every((e) => hasArt(app.ds.creature(e)?.displayId)));
  check("an EventAI death summon has art (Halycon's Gizrul)", hasArt(app.ds.creature(10268)?.displayId));
}
if (iconsOn()) {
  // A big window: the Gear tab is the character sheet and the Talents tab the three trees, both icon grids
  // the arrows walk in two dimensions. At the usual 110x34 both list instead (the checks above).
  const [cols, rows] = [term.cols, term.rows];
  term.cols = 160; term.rows = 54;
  const slot = () => app.rowsOf(app.top())[app.top().cursor]?.cell?.slot;
  const rowIndexOfSlot = (s) => app.rowsOf(app.top()).findIndex((r) => r.cell?.slot === s);
  app.switchTab(3);
  check('a big window draws the Character tab as the sheet', !!app.top().gridNav && frame().includes(app.ch.name) && /Head/.test(frame()));
  check('the sheet keeps your stats under the tooltip', /Strength/.test(frame()) && /Attack pwr/.test(frame()));
  app.top().cursor = 0; app.render();
  term.press('shift-right');
  const across = slot();
  term.press('shift-left', 'shift-down', 'shift-down', 'shift-down', 'shift-down', 'shift-down', 'shift-down', 'shift-down');
  const below = slot();
  term.press('down');
  check('Shift+arrows walk the sheet: head across to hands, down the left to the main hand', across === 'hands' && below === 'mainhand' && slot() === 'offhand');
  term.press('right');
  check('Right still changes the tab on the sheet', app.tab === 4);
  app.switchTab(3);
  app.top().cursor = rowIndexOfSlot('mainhand');
  term.press('return');
  check('Enter on a sheet slot opens its picker', app.top().id === 'slot-mainhand');
  home();
  app.switchTab(6);
  const names = app.ds.talentTrees(app.ch.cls).map((t) => t.name);
  check('the Talents tab draws every tree side by side', !!app.top().gridNav && names.every((n) => frame().includes(n)));
  app.top().cursor = 0; app.render();
  const first = app.rowsOf(app.top())[0].node;
  term.press('shift-right');
  const next = app.rowsOf(app.top())[app.top().cursor].node;
  check('Shift+Right walks to the next talent on the tier', next.tree === first.tree && next.t.tier === first.t.tier && next.t.col > first.t.col && frame().includes(next.t.name));
  term.cols = cols; term.rows = rows;
  app.switchTab(3); term.press('s');
  // A tooltip's long sentence wraps beside its icon while they share rows, not back under the art.
  const tip = wrapIconLines(withIcon('ability_rogue_ambush', ['Ambush', 'Ambush the target, causing 250% weapon damage plus 230 to the target. Must be stealthed and behind the target.']), 36);
  check('tooltip text wraps beside its icon', tip.slice(0, 4).every((l) => l.startsWith('\x1b[38;2;')) && tip.length > 4);
}
{
  const charRows = app.rowsOf(app.top()).map((r) => strip(r.text)).join('|');
  check('the stats page lists weapon skills with Defense and the hand in use', /Weapon skills\|\s+Defense\s+\d+\/\d+\|/.test(charRows) && /\d+\/\d+( \+\d+)? +main hand/.test(charRows));
}
home(); app.switchTab(lastTab);
term.press('right'); check('Right wraps to the first tab', app.tab === 0);
term.press('left'); check('Left wraps to the last tab', app.tab === lastTab);
term.press('escape'); check('Esc on a tab returns to World', app.tab === 0);

// Open the first offered quest from the world tab, page through its text, accept it.
term.press('1');
const firstQuest = rowIndex((r, t) => t.startsWith('!'));
check('a quest is offered in the start zone', firstQuest > 0);
if (firstQuest > 0) {
  app.top().cursor = firstQuest; term.press('return');
  show('quest dialog');
  check('quest dialog opened', app.top().id.startsWith('quest-'));
  const rows = app.rowsOf(app.top());
  const long = rows.length > app.layout().mainH;
  term.press('pagedown');
  check('PgDn pages the quest text', !long || app.top().scroll > 0);
  term.press('pageup');
  check('PgUp pages back', app.top().scroll === 0);
  term.press('end');
  check('End shows the bottom of the dialog', !long || app.top().scroll > 0);
  // Accept is the first selectable row after the text; End left the cursor on Decline.
  term.press('home'); term.press('return');
  check('quest accepted', app.g.state.questlog.quests.length === 1);
  check('Enter on Accept closed the dialog', app.stack.length === 0);
  term.press('2'); show('quest log');
  check('quest log lists it', /1 of 20/.test(frame()));
  const zoneOffers = offeredQuests(app.ds, app.ch.zoneId, app.ch, app.g.state.questlog).filter((o) => o.canAccept).length;
  check('quest log also lists what the zone offers', !zoneOffers || (/Available in /.test(frame()) && app.rowsOf(app.top()).filter((r) => !r.header).length > 1));
}

// Esc closes a window; the log window opens and closes.
home(); term.press('1');
term.press('l'); check('l opens the log window', app.top().id === 'log'); show('log window');
term.press('escape'); check('Esc closes the log window', app.stack.length === 0);

// Vendor: open the first vendor and read offers.
const vendorRow = rowIndex((r, t) => /<.*>/.test(t) && !/Trainer|Innkeeper|Flight/.test(t));
if (vendorRow > 0) {
  app.top().cursor = vendorRow; term.press('return'); show('vendor');
  check('vendor dialog opened', app.top().id.startsWith('vendor-'));
  term.press('tab'); show('vendor sell');
  check('vendor sell list shows bags', /Selling/.test(frame()));
  const sold = app.g.state.inventory.stacks.find((s) => (ds.item(s.item)?.sellPrice ?? 0) > 0);
  if (sold) {
    const had = countItem(app.g.state.inventory, sold.item);
    app.top().cursor = rowIndex((r) => r.data === sold); term.press('return');
    term.press('tab'); show('vendor buyback');
    check('a sale lands on the Buyback tab', /Buyback/.test(frame()) && strip(frame()).includes(ds.item(sold.item).name));
    app.top().cursor = rowIndex((r, t) => t.includes(ds.item(sold.item).name)); term.press('return');
    check('Enter buys it back', countItem(app.g.state.inventory, sold.item) === had && !(app.buyback ?? []).length);
    term.press('shift-tab');
    const doomed = app.g.state.inventory.stacks.find((s) => s.item === sold.item);
    app.top().cursor = rowIndex((r) => r.data === doomed); term.press('d'); term.press('return');
    check('d destroys a stack from the Selling tab', countItem(app.g.state.inventory, sold.item) === had - doomed.count && app.top().id.startsWith('vendor-'));
    term.press('tab'); term.press('tab'); check('Tab reaches the companions mode', /Companions/.test(strip(frame())));
  }
  term.press('escape');
  check('Esc closes the vendor', app.stack.length === 0);
}

// Trainer dialog.
const trainerRow = rowIndex((r, t) => /Trainer>/.test(t));
if (trainerRow > 0) { app.top().cursor = trainerRow; term.press('return'); show('trainer'); check('trainer dialog opened', app.top().id.startsWith('trainer-')); term.press('escape'); }

// Live fight against the lowest-level creature, ticked by hand.
home(); term.press('1');
const mobRow = app.rowsOf(app.top()).findIndex((r) => r.data?.creature);
app.top().cursor = mobRow; term.press('return');
check('live fight started', !!app.fight);
show('fight start');
{
  const art = creatureArt(384, 20, 10); // Hogger
  check('creature art scales to the room it gets', !!art && art.length <= 10 && art.every((l) => strip(l).length === strip(art[0]).length && strip(l).length <= 20));
  const foeDisplay = ds.creature(app.fight?.enemyEntry)?.displayId;
  check('the fight shows the foe beside the frames', !hasArt(foeDisplay) || /[▀▄]/.test(frame()));
}
// The bar's key row (each slot's number, its cooldown beside it) drawn somewhere in the frame.
const hasBar = () => { const keys = strip(app.fight?.abilityRows(200)[0] ?? '').trim(); return /^1\b/.test(keys) && strip(frame()).includes(keys); };
// The duel stage keeps the ability bar on under auto-play too (its cooldowns are worth watching), with the
// plates under the sprites' feet: your name, level and class, then the bars; and a floor under it all.
check('auto-play shows the stage with the ability bar', hasBar() && new RegExp(`^\\s+${app.ch.name}  L\\d+  Warrior`, 'm').test(strip(frame())));
check('the stage stands on a floor', /[▁▂_]{40}/.test(strip(frame())));
{
  // A slot that waits only on the GCD (or a cast) draws as a ready one, or the whole bar blinks with every cast.
  const f = app.fight, bar = f.abilityBar;
  const drawn = (reason) => { f.abilityBar = () => bar.call(f).map((a, i) => (i === 0 ? { ...a, usable: !reason, reason } : a)); const out = f.abilityRows(200).join('\n'); f.abilityBar = bar; return out; };
  check('the GCD greys no slot on the ability bar', ['gcd', 'casting', 'channeling'].every((r) => drawn(r) === drawn(undefined)) && drawn('rage') !== drawn(undefined));
}
let ticks = 0;
let paneFrames = null;
while (app.fight && ticks < 3000) {
  app.fight.tick(); ticks++;
  if (ticks === 15) show('fight mid');
  // The bottom pane: Tab walks log → meter → threat → loot → log, each drawn without throwing, mid-fight.
  if (ticks === 40 && app.fight) {
    paneFrames = {};
    for (const id of ['meter', 'threat', 'loot', 'log']) { term.press('tab'); paneFrames[id] = { pane: app.fightPane, text: strip(frame()) }; show(`fight ${id} pane`); }
    term.press('tab'); term.press('shift-tab');
    // The meter's views: s walks all seven, f flips to the whole sitting and back.
    app.fightPane = 'meter';
    paneFrames.views = [];
    for (let i = 0; i < 7; i++) { term.press('s'); paneFrames.views.push(strip(frame())); show(`meter view ${i + 1}`); }
    term.press('f'); paneFrames.sitting = strip(frame()); show('meter whole sitting'); term.press('f');
    app.fightPane = 'log';
  }
}
check(`fight resolved in ${ticks} ticks`, !app.fight && ticks < 3000);
check('combat log has rows', app.log.some((l) => /hits|misses|crits|dies|Victory|Defeat/.test(strip(l))));
if (paneFrames) {
  check('Tab cycles the fight pane', paneFrames.meter.pane === 'meter' && paneFrames.threat.pane === 'threat' && paneFrames.loot.pane === 'loot' && paneFrames.log.pane === 'log');
  check('meter pane names the player', /Damage done/.test(paneFrames.meter.text) && /Tuitest/.test(paneFrames.meter.text));
  check('meter s walks every view back to damage', ['DPS', 'Healing done', 'Damage taken', 'Deaths', 'Interrupts', 'Dispels', 'Damage done'].every((t, i) => paneFrames.views[i]?.includes(t)));
  check('meter f shows the whole sitting', /this sitting/.test(paneFrames.sitting) && app.meterSegment === 'fight');
  check('threat pane shows the enemy', /Threat on /.test(paneFrames.threat.text) && /aggro|Nobody has threat/.test(paneFrames.threat.text));
  check('loot pane renders', /Loot this sitting/.test(paneFrames.loot.text));
  check('Shift-Tab goes back to the log', app.fightPane === 'log');
} else check('fight lasted long enough to try the panes', false);
show('after fight');
check('loot tally fills from a win', !!app.lootTally && (app.lootTally.rows.length > 0 || app.lootTally.copper > 0) || app.log.every((l) => !/You receive/.test(strip(l))));

// Manual press path: start another fight, press ability 1, keep ticking.
app.top().cursor = mobRow; term.press('return');
if (app.fight) {
  term.press('a'); // manual
  check('manual play shows the ability bar', hasBar());
  term.press('1');
  check('manual fight resolved', finishFight() > 0 && !app.fight);
}

// The log window over a fight scrolls and closes without touching the fight.
app.top().cursor = mobRow; term.press('return');
if (app.fight) {
  app.fight.tick(); term.press('l');
  check('log window opens over a fight', app.top().id === 'log' && !!app.fight && /Log/.test(frame()));
  term.press('pageup'); term.press('escape');
  check('Esc closes the log without fleeing', app.stack.length === 0 && !!app.fight);
  finishFight();
}

// Fleeing a fight.
app.top().cursor = mobRow; term.press('return');
if (app.fight) { app.fight.tick(); term.press('escape'); check('Esc runs from a fight', !app.fight && app.log.some((l) => /You run from/.test(strip(l)))); }

// Command line runs REPL verbs into the log.
term.press(':'); term.type('rest 30');
check('command line ran rest', app.log.some((l) => /You rest for 30 s/.test(strip(l))));

// Autopilot: steps by hand; its fights are live sessions that we tick to the end.
home(); term.press('1'); term.press('a');
check('a opens the pre-flight card', app.top()?.id === 'autopilot-preflight' && /Stops\s+.*deaths in a row/.test(strip(frame())));
show('autopilot pre-flight');
app.fightSpeed = 8; // at 4x and up the combat log folds to one line a fight
const ticksBefore = app.log.filter((l) => /^\s*\d+\.\ds /.test(strip(l))).length;
term.press('return');
check('Enter on the card starts the autopilot', !!app.auto && app.stack.length === 0);
const autoCtl = app.auto;
let steps = 0, liveFights = 0, fightTicks = 0, heldWin = false;
/** The first win: the fight stays on the stage with the foe at 0 and the drops beside it, the planner waits,
 *  and the screen moves on once the hold's ticks are spent. */
const checkWinHold = () => {
  const f = app.fight, h = f.holding;
  const stageRows = () => { const rows = strip(frame()).split('\n'); return rows.slice(2, rows.findIndex((l) => /^── Log/.test(l))); };
  check('a win holds the stage with the foe dead at 0', f.ended && stageRows().some((l) => /  dead\b/.test(l)) && stageRows().some((l) => / 0\/\d+/.test(l)));
  const stepBefore = autoCtl.planner.step; autoCtl.step();
  check('the planner waits out the hold', autoCtl.planner.step === stepBefore && app.fight === f);
  if (h.loot.length) {
    while (app.fight === f && f.holdMs() < h.stagger + 300) f.tick();
    const name = ds.item(h.loot[0].item)?.name;
    check(`what it dropped slides in on the stage (${name})`, app.fight === f && stageRows().some((l) => l.includes(name)));
    show('autopilot win hold');
  }
  let n = 0; while (app.fight === f && n++ < 200) f.tick();
  check(`the hold lets go on its own (${n} ticks)`, !app.fight && n <= h.ticks);
};
while (app.auto && steps < 60) {
  if (app.fight) {
    if (!liveFights) {
      show('autopilot fight');
      check('an autopilot fight says what it is for', /(\d+\/\d+|hunting for xp|questing in)/.test(strip(frame()).split('\n')[2] ?? ''));
      check('the run panel shows the foe beside the fight', !hasArt(ds.creature(app.fight.enemyEntry)?.displayId) || /[▀▄]/.test(frame()));
      check('the fight draws inside the run panel, without a head line of its own', app.inlineFight() && app.compactHeader() && / ◀ /.test(strip(frame())) && !/^ Fighting /m.test(strip(frame())));
      check('a run keeps only the XP line for a header', app.compactHeader() && /^ XP /.test(strip(frame())) && !/1 World/.test(strip(frame())));
      check('your plate sits on the stage, once', (strip(frame()).match(new RegExp(`^\\s+${app.ch.name}  L\\d+  `, 'mg')) ?? []).length === 1);
      term.press('w'); check('w opens the full fight view', !!app.auto.watchFight && !app.inlineFight() && /^ Fighting /m.test(strip(frame())));
      term.press('escape'); check('Esc comes back to the run panel without running', !!app.fight && !!app.auto && app.inlineFight());
      term.press('3'); check('a tab can be browsed during an autopilot fight, under the run strip', app.auto.browsing && !!app.fight && /Autopilot.*back to the run/.test(strip(frame()).split('\n')[3] ?? ''));
      term.press('w'); check('w returns to the panel with the fight still on', !app.auto.browsing && app.inlineFight());
    }
    liveFights++;
    if (!heldWin) { const f = app.fight; while (app.fight === f && !f.ended) { f.tick(); fightTicks++; } if (f.holding) { heldWin = true; checkWinHold(); } }
    fightTicks += finishFight(); continue;
  }
  if (!app.auto.step()) break;
  steps++;
}
check('the autopilot won a fight to hold on', heldWin);
show('autopilot');
if (app.auto) {
  if (app.fight) { liveFights++; fightTicks += finishFight(); }
  check('between fights the autopilot keeps its own panel', app.compactHeader() && /^ Now\s/m.test(strip(frame())) && strip(frame()).includes(app.ch.name));
  show('autopilot between fights');
  app.fightPane = 'loot'; app.render();
  check('between fights the autopilot keeps the fight pane', /Loot this sitting/.test(strip(frame())));
  if (iconsOn() && app.lootTally?.rows.length) check('the Loot pane draws an icon beside each item', /Loot this sitting[^\n]*\n ▀▀▀▀ \S/.test(strip(frame())));
  term.press('tab'); check('Tab between autopilot fights cycles the pane, not the tabs', app.fightPane === 'run' && !app.auto.browsing);
  check('the Run pane lists the planner steps with the fights folded', /^ Run\s/m.test(strip(frame())) && autoCtl.ledger.some((r) => r.kind === 'fight' && /won|lost|stalemate/.test(strip(r.body))));
  show('autopilot run pane');
  term.press('tab'); check('Tab moves on to the Quests pane', app.fightPane === 'quests');
  term.press('tab'); term.press('tab'); check('Tab wraps back to the log after Bags', app.fightPane === 'log');
  check('the run panel says what is now, what is next and how the quest in hand stands', /^ Now\s/m.test(strip(frame())) && /^ Next\s/m.test(strip(frame())) && /(\d+\/\d+|ready to turn in)/.test(strip(frame()).split('\n')[2] ?? '') && !/stops at/.test(strip(frame())));
  check('the panel is five lines at most between fights', strip(frame()).split('\n').slice(2, 12).filter((l) => l.trim()).length <= 5);
  app.fightPane = 'quests'; app.render();
  check('the Quests pane lists the quests the run works on', /^ Quests\s+next: /m.test(strip(frame())) && app.g.state.questlog.quests.some((qs) => qs.status !== 'turnedIn' && strip(frame()).includes(ds.quest(qs.entry).title)));
  show('autopilot quests pane');
  app.fightPane = 'bags'; app.render();
  check('the Bags pane shows the bags with a cursor', /^ Bags\s/m.test(strip(frame())) && /^▶/m.test(strip(frame())));
  if (iconsOn()) check('the Bags pane draws an icon beside each item', /^▶▀▀▀▀ \S/m.test(strip(frame())));
  const bagCursor = app.bagsPane.cursor; term.press('down');
  check('Down moves the Bags pane cursor', app.bagsPane.cursor > bagCursor && !!app.auto);
  const logBefore = app.log.length; term.press('return');
  check('Enter on a bag row acts while the run plays on', (app.log.length > logBefore || app.stack.length > 0) && !!app.auto);
  home(); show('autopilot bags pane');
  app.fightPane = 'log';
  term.press('space'); const stepBefore = autoCtl.planner.step; autoCtl.step();
  check('space pauses the run between fights', autoCtl.paused && autoCtl.planner.step === stepBefore && /PAUSED/.test(strip(frame())));
  term.press('space'); check('space resumes it', !autoCtl.paused);
  term.press('3'); check('tabs can be viewed while the autopilot runs', app.tab === 2 && !!app.auto && /Bags|bag/i.test(strip(frame())));
  check('the run strip sits under the tabs while browsing', /Autopilot.*fights.*back to the run/.test(strip(frame()).split('\n')[3] ?? ''));
  show('autopilot run strip');
  // A browsed tab works during the run: Enter acts on the row (here a bag item) instead of jumping back.
  { const logBefore = app.log.length; app.top().cursor = 1; term.press('return'); check('Enter acts on a row while browsing during the run', !!app.auto && app.auto.browsing && (app.log.length > logBefore || app.stack.length > 0)); home(); }
  term.press('7'); check('the Talents tab opens during the run', app.tab === 6 && app.auto.browsing);
  term.press('escape'); check('Esc on a tab comes back to the run instead of stopping it', !!app.auto && !app.auto.browsing);
  term.press('3');
  term.press('w'); check('w goes back to watching the run', !app.auto.browsing && app.compactHeader() && /^ Now\s/m.test(strip(frame())));
  term.press('l'); check('log window opens over the autopilot', app.top().id === 'log');
  term.press('escape'); check('Esc closes the log and leaves the autopilot running', app.stack.length === 0 && !!app.auto);
  term.press('1'); term.press('w'); // back on the panel, where Esc stops the run
}
check(`autopilot fought ${liveFights} live fights over ${steps} steps (${fightTicks} ticks)`, liveFights > 0 && app.log.some((l) => /hunting:|quest target:/.test(strip(l))));
check('autopilot counted its fights', autoCtl.fights === liveFights);
check('at 8x the combat log folds to one line a fight', app.log.filter((l) => /^\s*\d+\.\ds /.test(strip(l))).length === ticksBefore && app.log.some((l) => /^Victory|^Defeat/.test(strip(l))));
if (app.auto) {
  term.press('escape'); check('Esc stops the autopilot', !app.auto);
  check('the end card sums the run up', app.top()?.id === 'autopilot-done' && /Autopilot done/.test(strip(frame())) && /Stopped: you stopped it/.test(strip(frame())));
  show('autopilot end card');
  term.press('return'); check('Enter closes the end card', app.stack.length === 0);
}

// Autopilot fight interrupted by Esc stops the run.
term.press('a'); term.press('return');
while (app.auto && !app.fight && app.auto.step()) { /* reach a fight */ }
if (app.fight) { term.press('escape'); check('Esc in an autopilot fight stops the run', !app.fight && !app.auto); }
else { if (app.auto) app.auto.stop(); check('autopilot reached a fight to interrupt', false); }

// A quest fight lost: the quest is blacklisted and the run goes on instead of stopping.
{
  const lost = app.cmds.createAutopilot('30', { liveFight: (step, settle) => { settle({ outcome: 'defeat' }); return { ok: true }; } });
  let line = '';
  for (let n = 0; n < 30 && !app.cmds.questBlacklist.size && line != null; n++) line = lost.next();
  check('a quest the autopilot died on is blacklisted', app.cmds.questBlacklist.size > 0 && app.log.some((l) => /skipping .*died 2 times/.test(strip(l))));
  check('dying on a quest did not stop the run', !lost.done);
}

// The windowed run has no step cap: the Stop after setting ends it, on the run's real clock.
{
  const timed = app.cmds.createAutopilot('', { maxSteps: Infinity, clock: () => 25 * 3_600_000, liveFight: () => ({ ok: true }) });
  timed.next();
  check('a run stops on the Stop after clock, not a step count', timed.steps === Infinity && timed.stopReason?.reason === 'timeUp');
}

// Do Quest: d on a quest log row runs the autopilot pinned to that quest, and clears its blacklist entry.
home(); term.press('2');
const doRow = rowIndex((r) => r.data?.qs?.status === 'active');
check('the quest log has an active quest to do', doRow >= 0);
if (doRow >= 0) {
  const doEntry = app.rowsOf(app.top())[doRow].data.q.entry;
  app.cmds.questBlacklist.add(doEntry);
  app.top().cursor = doRow; term.press('d');
  check('d on the quest log starts Do Quest', !!app.auto && !app.cmds.questBlacklist.has(doEntry));
  show('do quest');
  let n = 0;
  while (app.auto && n < 400) { if (app.fight) { finishFight(); continue; } if (!app.auto.step()) break; n++; }
  const st = app.g.state.questlog.quests.find((q) => q.entry === doEntry)?.status;
  check(`Do Quest finished the quest (${st} after ${n} steps)`, st === 'turnedIn' || st === 'complete');
  if (app.auto) app.auto.stop();
}

// Blacklist: b on the quest log and the quest page's row set a quest aside, and it survives a settings write
// and a save and reload (it used to live only in memory).
{
  const { toSave, migrate } = await import('../persistence/saveShape.ts');
  home(); term.press('2');
  const blRow = rowIndex((r) => r.data?.qs?.status === 'active');
  if (blRow >= 0) {
    const entry = app.rowsOf(app.top())[blRow].data.q.entry;
    app.cmds.questBlacklist.clear();
    app.top().cursor = blRow; term.press('b');
    check('b on the quest log blacklists the quest', app.cmds.questBlacklist.has(entry) && /\(blacklisted\)/.test(strip(app.rowsOf(app.top())[blRow].text)));
    app.g.setAutopilotConfig({ ...app.g.autopilotConfig(), questLevelAbove: 4 });
    app.cmds.keepQuestBlacklist();
    const back = migrate(JSON.parse(JSON.stringify(toSave('tuitest', app.g.snapshot(), Date.now()))));
    const app2 = new App({ term: new HeadlessTerm(110, 34), ds, repo });
    app2.startGame(back.state, 'blcheck', Date.now(), false);
    check('the blacklist survives a settings write and a reload', app2.cmds.questBlacklist.has(entry) && app2.g.autopilotConfig().questLevelAbove === 4);
    const page = questDialog(app, app.ds.quest(entry), 'log');
    const off = app.rowsOf(page).find((r) => strip(r.text) === 'Take it off the blacklist');
    off?.act();
    check('the quest page takes it off the blacklist', !!off && !app.cmds.questBlacklist.has(entry));
  } else check('the quest log has an active quest to blacklist', false);
}

// Rotation editing through the menu: toggle a rule, add one, give it a condition, delete it.
home(); term.press('6');
show('rotation');
check('rotation phases start closed', !app.rowsOf(app.top()).some((r) => r.data?.rule));
app.top().cursor = rowIndex((r) => r.data?.toggle && r.data.phase === 'pull'); term.press('return');
check('Enter on Pull opens its rules', app.rowsOf(app.top()).some((r) => r.data?.rule && r.data.phase === 'pull') && rowIndex((r, t) => /\+ Add a rule to pull/.test(t)) > 0);
term.press('return');
check('Enter again closes it', !app.rowsOf(app.top()).some((r) => r.data?.rule));
app.top().cursor = rowIndex((r) => r.data?.toggle && r.data.phase === 'combat'); term.press('return');
show('rotation, combat open');
const ruleRow = app.rowsOf(app.top()).findIndex((r) => r.data?.rule);
const ruleData = app.rowsOf(app.top())[ruleRow].data;
app.top().cursor = ruleRow; term.press('return');
check('Enter on a rule opens its menu', app.top().id === 'pick');
show('rule menu');
term.press('return'); // first entry: turn it off
check('rule turned off through the menu', app.g.rotation().custom === true && app.g.rotation().phases[ruleData.phase][ruleData.index].enabled === false);
term.press('return'); term.press('return'); // back on
check('rule turned on again', app.g.rotation().phases[ruleData.phase][ruleData.index].enabled === true);
const before = app.g.rotation().phases.combat.length;
const addRow = rowIndex((r, t) => /\+ Add a rule to combat/.test(t));
check('combat list has an add row', addRow > 0);
app.top().cursor = addRow; term.press('return');
check('add-rule picker opened', app.top().id === 'pick');
term.press('return');
check('rule added to combat', app.g.rotation().phases.combat.length === before + 1);
check('cursor landed on the new rule', app.rowsOf(app.top())[app.top().cursor]?.data?.rule?.id?.startsWith('tui-'));
{
  const added = app.rowsOf(app.top())[app.top().cursor].data.rule;
  const want = defaultConditionsForSpell(ds.spell(added.action.spellId), app.ch);
  check('new rule starts with the smart default conditions', JSON.stringify(added.conditions) === JSON.stringify(want));
}
term.press('return'); term.press('down'); term.press('return'); // menu → change when it fires
check('condition editor opened', app.top().id === 'conds');
show('condition editor');
app.top().cursor = rowIndex((r, t) => /\+ Add a condition/.test(t)); term.press('return');
check('metric catalog opened', app.top().id === 'pick' && /What to check/.test(app.top().title));
app.top().cursor = rowIndex((r, t) => /living enemies/.test(t)); term.press('return');
check('condition added from the catalog', app.g.rotation().phases.combat.some((r) => r.id.startsWith('tui-') && r.conditions.some((c) => c.metric === 'enemyCount')));
check('one condition menu opened', app.top().id === 'cond');
app.top().cursor = rowIndex((r, t) => /^Value:/.test(t)); term.press('return'); term.type('3');
check('value changed through the prompt', app.g.rotation().phases.combat.some((r) => r.id.startsWith('tui-') && r.conditions.some((c) => c.metric === 'enemyCount' && c.value === 3)));
show('one condition');
app.top().cursor = rowIndex((r, t) => /^Check:/.test(t)); term.press('return'); term.press('/'); term.type('ally');
check('/ searches the catalog', app.top().id === 'pick' && /matching "ally"/.test(app.top().title));
app.top().cursor = rowIndex((r, t) => /^\s*health %$/.test(t)); term.press('return');
app.top().cursor = rowIndex((r, t) => /^Who:/.test(t)); term.press('return');
app.top().cursor = rowIndex((r, t) => /an ally/.test(t)); term.press('return');
check('an ally subject shows the ally filter', rowIndex((r, t) => /Which ally/.test(t)) >= 0);
app.top().cursor = rowIndex((r, t) => /Which ally/.test(t)); term.press('return');
app.top().cursor = rowIndex((r, t) => /a healer/.test(t)); term.press('return');
check('ally filter stored on the condition', app.g.rotation().phases.combat.find((r) => r.id.startsWith('tui-')).conditions.some((c) => c.subject === 'ally' && c.ally?.role === 'healer'));
show('ally condition');
term.press('escape');
app.top().cursor = rowIndex((r, t) => /Quick presets/.test(t)); term.press('return');
app.top().cursor = rowIndex((r, t) => /My health is below/.test(t)); term.press('return'); term.type('50');
check('preset replaced the conditions', JSON.stringify(app.g.rotation().phases.combat.find((r) => r.id.startsWith('tui-')).conditions) === JSON.stringify([{ metric: 'healthPct', subject: 'self', op: '<', value: 50 }]));
show('rotation edited');
term.press('escape'); // leave the condition editor
term.press('return'); term.press('end'); term.press('return'); // menu → delete
check('rule deleted through the menu', app.g.rotation().phases.combat.length === before);

// Gear: a slot opens a picker of what fits it; the equipment helper marks and equips upgrades.
home();
{
  const pick = (slot, q) => ds.items().find((i) => i.slot === slot && (i.requiredLevel ?? 1) <= app.ch.level && i.quality >= q && (i.armor ?? 0) > 0 && !i.allowClass?.length && i.entry > 100) ?? null;
  const worn = app.g.state.char.equipped.chest != null ? app.ds.item(app.g.state.char.equipped.chest?.entry ?? app.g.state.char.equipped.chest) : null;
  const chest = ds.items().filter((i) => i.slot === 'chest' && (i.requiredLevel ?? 1) <= app.ch.level && i.quality >= 2 && (i.armor ?? 0) > (worn?.armor ?? 0) + 20 && !i.allowClass?.length && i.entry > 100)[0] ?? pick('chest', 1);
  if (chest) app.g.state.inventory = addItem(app.g.state.inventory, chest.entry, 1, 1);
  term.press('4'); show('gear');
  check('gear tab shows slot labels', /Head\s|Chest\s|Main Hand/.test(strip(frame())));
  const chestRow = rowIndex((r, t) => t.startsWith('Chest'));
  check('gear tab has a Chest slot row', chestRow >= 0);
  app.top().cursor = chestRow; term.press('return'); show('slot picker');
  check('Enter on a slot opens its picker', app.top().id === 'slot-chest');
  const cand = rowIndex((r, t) => chest && t.includes(chest.name));
  check('the picker lists the chest piece from the bags', !!chest && cand > 0);
  if (cand > 0) {
    app.top().cursor = cand; term.press('return');
    check('Enter in the picker equips it and closes', app.stack.length === 0 && (app.g.state.char.equipped.chest?.entry ?? app.g.state.char.equipped.chest) === chest.entry);
  }
  const ups = app.g.suggestedEquipmentUpgrades();
  check(`equipment helper answers (${ups.length} upgrades)`, Array.isArray(ups));
  term.press('u'); // nothing or everything; must not throw
  check('u on the gear tab runs the helper', app.tab === 3);
}

// Bags: an armor kit asks which slot it goes on, the picker greys refused slots with the reason, and Enter
// applies it; ammo loads from the bags; a plain material opens the item menu instead of "Cannot be consumed".
home();
{
  const kit = ds.items().find((i) => i.name === 'Light Armor Kit');
  const arrow = ds.items().find((i) => i.name === 'Rough Arrow');
  const cloth = ds.items().find((i) => i.name === 'Linen Cloth');
  for (const it of [kit, arrow, cloth]) if (it) app.g.state.inventory = addItem(app.g.state.inventory, it.entry, 1, 1);
  const { useStack } = await import('./tuiBags.mjs');
  const slotOf = (it) => app.g.state.inventory.stacks.findIndex((s) => s.item === it?.entry);
  term.press('3');
  useStack(app, slotOf(kit)); show('armor kit picker');
  check('an armor kit opens the slot picker', app.top()?.id === 'pick' && /Apply Light Armor Kit/.test(strip(app.top().title)));
  const rows = app.rowsOf(app.top()).map((r) => strip(r.text));
  check('the picker lists an eligible slot and greys a refused one with its reason', rows.some((t) => /^Legs:/.test(t)) && rows.some((t) => /Main Hand:.*only goes on armor/.test(t)));
  const refused = rowIndex((r, t) => /Main Hand:/.test(t));
  app.top().cursor = refused; term.press('return');
  check('Enter on a refused slot keeps the picker open', app.top()?.id === 'pick');
  const legsBefore = JSON.stringify(app.g.state.char.equipped.legs);
  app.top().cursor = rowIndex((r, t) => /^Legs:/.test(t)); term.press('return');
  check('Enter on an eligible slot applies the kit and closes the picker', app.stack.length === 0 && JSON.stringify(app.g.state.char.equipped.legs) !== legsBefore && slotOf(kit) < 0);
  useStack(app, slotOf(arrow));
  check('Enter on ammo in the bags loads it', app.g.state.char.ammoItem === arrow?.entry);
  useStack(app, slotOf(cloth)); show('item menu from cloth');
  check('Enter on cloth opens the item menu', app.top()?.id === 'pick' && /Linen Cloth/.test(strip(app.top().title ?? '')));
  home();
}

// Bags: Enter on a bag equips it into a bag slot; the Gear tab's Bag slot picker lists bags too.
home();
{
  const bag = ds.items().find((i) => i.slot === 'bag' && i.itemClass !== 11 && (i.bagSlots ?? 0) >= 6 && (i.requiredLevel ?? 1) <= 1 && i.quality <= 1 && !i.allowClass?.length);
  if (bag) app.g.state.inventory = addItem(app.g.state.inventory, bag.entry, 1, 1);
  term.press('3'); show('bags with a bag');
  const bagRow = rowIndex((r, t) => bag && t.includes(bag.name));
  check('bags tab lists the bag', bagRow > 0);
  const cap = app.g.state.inventory.stacks.length;
  if (bagRow > 0) {
    app.top().cursor = bagRow; term.press('return');
    const slots = Object.entries(app.g.state.char.equipped).filter(([k, v]) => k.startsWith('bag') && v != null);
    check('Enter on a bag equips it', slots.length === 1 && app.g.state.inventory.stacks.length === cap - 1);
    term.press('4');
    const bagSlotRow = rowIndex((r, t) => /^Bag 1\s/.test(t) && t.includes(bag.name));
    check('gear tab shows the bag in Bag 1', bagSlotRow > 0);
    term.press('3');
    check('bags grew by the bag size', /\/(2[0-9]|3[0-9]) slots/.test(strip(frame())));
  }
}

// City services: not offered in Elwynn; a capital lists the bank, the auction house and the mailbox.
home(); term.press('1');
check('no bank or auction house in the start zone', rowIndex((r, s) => /^(Bank|Auction House)\b/.test(s)) < 0);
term.press('3'); term.press('b');
check('b in Bags outside a bank town only flashes', app.stack.length === 0);
{
  const back = app.g.state.char.zoneId;
  app.g.state.char.zoneId = 'stormwind';
  home(); term.press('1'); show('capital');
  check('capital World tab lists Services above the people', /Services/.test(strip(frame())) && rowIndex((r, t) => t.startsWith('Bank')) > 0 && rowIndex((r, t) => t.startsWith('Auction House')) > 0 && rowIndex((r, t) => t.startsWith('Mailbox')) > 0 && rowIndex((r, t) => t.startsWith('Bank')) < app.rowsOf(app.top()).findIndex((r) => /^People/.test(strip(r.text))));
  const bankRow = rowIndex((r, t) => t.startsWith('Bank'));
  app.top().cursor = bankRow; term.press('return'); show('bank');
  check('bank dialog opened', app.top().id === 'bank');
  const stacks = app.g.state.inventory.stacks.length;
  const dep = rowIndex((r) => r.data?.s);
  if (dep >= 0) {
    app.top().cursor = dep; term.press('return');
    check('Enter deposits a stack', app.g.state.bank.stacks.length === 1 && app.g.state.inventory.stacks.length === stacks - 1);
    term.press('tab'); show('bank withdraw');
    check('Tab switches to the bank side', /Bank → your bags/.test(strip(frame())));
    term.press('return');
    check('Enter withdraws it again', app.g.state.bank.stacks.length === 0 && app.g.state.inventory.stacks.length === stacks);
  }
  term.press('escape');
  term.press('3'); term.press('b'); check('b in Bags opens the bank in a capital', app.top().id === 'bank'); term.press('escape');
  home(); term.press('1');
  const ahRow = rowIndex((r, t) => t.startsWith('Auction House'));
  app.top().cursor = ahRow; term.press('return'); show('auction house');
  check('auction dialog opened', app.top().id === 'auction');
  const listings = app.g.browseAuctions(Date.now()).length;
  check(`auction house has bot listings (${listings})`, listings > 0);
  // Categories: Left/Right picks an item class, [ ] a subclass inside it; Left back round to All shows everything.
  const shown = () => app.rowsOf(app.top()).filter((r) => r.data?.auction).map((r) => app.ds.item(r.data.auction.item));
  term.press('right'); show('auction category');
  const inCat = shown(), cls = inCat[0]?.itemClass;
  check(`Right picks a category (${inCat.length} of ${listings})`, inCat.length > 0 && inCat.length < listings && inCat.every((it) => it.itemClass === cls));
  const onStrip = () => app.rowsOf(app.top())[app.top().cursor]?.data?.strip;
  check('the cursor starts on a listing, not a strip', !onStrip());
  term.press('up');
  check(`Up from the first listing lands on a strip (${onStrip()})`, !!onStrip());
  if (onStrip() === 'sub') {
    term.press('right'); show('auction subcategory');
    const inSub = shown(), subOf = (it) => it.itemSubclass ?? it.weaponSubclass ?? it.armorSubclass;
    check(`Right on the subcategory strip picks one (${inSub.length} of ${inCat.length})`, inSub.length > 0 && inSub.length <= inCat.length && inSub.every((it) => it.itemClass === cls && subOf(it) === subOf(inSub[0])));
    check('the cursor stays on the strip', onStrip() === 'sub');
    term.press('down');
    check('Down from the strip goes to the listings', !onStrip() && !!app.rowsOf(app.top())[app.top().cursor]?.data?.auction);
  } else term.press('down');
  term.press('left'); check('Left back to All lists every listing', shown().length === listings);
  term.press('s'); term.type('cloth'); show('auction search');
  check('search filters the boards', /"cloth"/.test(strip(frame())));
  term.press('tab'); show('auction sell');
  check('Tab moves to the sell list', /Pick something from your bags/.test(strip(frame())));
  // Sell flow: quantity, bid, buyout, duration; then cancel it from My auctions.
  app.g.state.inventory = addItem(app.g.state.inventory, 2589, 3, 20); // Linen Cloth: a trade good, not vendor stock
  app.render();
  const sellRow = rowIndex((r, t) => /Linen Cloth/.test(t));
  if (sellRow > 0) {
    const bags = app.g.state.inventory.stacks.length;
    app.top().cursor = sellRow; term.press('return');
    check('selling asks how many', !!app.cmd && /How many/.test(app.cmd.label));
    term.type('1'); term.type('5g'); term.type('9g'); // appended to the suggested prices: well above what a vendor pays
    check('duration picker opened', app.top().id === 'pick' && /How long/.test(app.top().title));
    term.press('return');
    check('listing posted', app.g.ownAuctions().length === 1 && app.g.state.inventory.stacks.length <= bags);
    show('after listing');
  } else check('a sellable stack is in the bags', false);
  term.press('tab'); show('my auctions');
  check('Tab moves to my auctions', /Your listings/.test(strip(frame())));
  const mine = rowIndex((r) => r.data?.auction);
  if (mine > 0) { app.top().cursor = mine; term.press('return'); term.press('return'); check('Enter cancels the listing', app.g.ownAuctions().length === 0); }
  term.press('escape');
  const mailRow = rowIndex((r, t) => t.startsWith('Mailbox'));
  app.top().cursor = mailRow; term.press('return'); show('mailbox');
  check('mailbox opened', app.top().id === 'mail' && /No mail|letter/.test(strip(frame())));
  term.press('escape');
  app.g.state.char.zoneId = back;
}

// ---- professions and companions ------------------------------------------------------------------------
{
  const g = app.g;
  const tabOf = (id) => app.tabs.findIndex((t) => t.view.id === id);
  const inv = () => g.state.inventory;
  const rowsNow = () => app.rowsOf(app.top());
  home(); term.press('9'); show('professions, none known');
  check('9 opens the Professions tab', app.tab === tabOf('profs'));
  check('with no professions it says where the trainers are', /no professions yet/.test(strip(frame())));
  g.devLearnProfession('tailoring');
  g.ensureProfessionStarters();
  g.state.char.gold = 10_000_000;
  // Exactly 4 Linen Cloth (the auction test left some behind).
  g.state.inventory = addItem({ stacks: g.state.inventory.stacks.filter((s) => s.item !== 2589) }, 2589, 4, 20);
  app.render(); show('professions tab');
  const tailor = rowIndex((r, t) => /^Tailoring/.test(t));
  check('the tab lists Tailoring', tailor >= 0);
  if (tailor >= 0) {
    app.top().cursor = tailor; term.press('return'); show('tailoring book');
    check('Enter opens the recipe book', app.top().id === 'book-tailoring');
    const bolt = rowIndex((r) => r.data?.recipe?.name === 'Bolt of Linen Cloth');
    check('Bolt of Linen Cloth is ready twice from 4 cloth', bolt > 0 && /^Bolt of Linen Cloth\s+2 ready/.test(strip(rowsNow()[bolt].text).trim()));
    if (bolt > 0) { app.top().cursor = bolt; term.press('A'); }
    check('A makes all of them', countItem(inv(), 2996) === 2 && countItem(inv(), 2589) === 0);
    const cloak = rowIndex((r) => r.data?.recipe?.name === 'Linen Cloak');
    check('Linen Cloak shows the thread buy-in', cloak > 0 && /buys/.test(strip(rowsNow()[cloak].text)));
    const gold = g.state.char.gold, product = ds.recipe(2387).product.item;
    if (cloak > 0) { app.top().cursor = cloak; term.press('return'); }
    check('crafting buys the Coarse Thread from the purse', countItem(inv(), product) === 1 && g.state.char.gold < gold);
    check('one summary line says what was made', /You create Linen Cloak/.test(strip(frame())));
    term.press('h'); check('h narrows the book to what can be made', !rowsNow().some((r) => r.data?.recipe && !r.data.chk.ok));
    term.press('escape');
  }

  // Hire a companion at the Elwynn inn, teach them Tailoring, hand them cloth, and craft as them. The slate is
  // within two levels of yours, and a primary profession trains at 5, so hire as a level 10.
  g.state.char.level = 10;
  home(); term.press('0'); show('companions, none');
  check('0 opens the Companions tab', app.tab === tabOf('companions'));
  const hire = rowIndex((r, t) => /^Hire a companion/.test(t));
  check('the inn offers hires', hire >= 0);
  if (hire >= 0) {
    app.top().cursor = hire; term.press('return'); show('hire list');
    check('the hire list opened', app.top().id === 'hire' && rowIndex(() => true) >= 0);
    check('hire rows name their trades', /(Mining|Herb|Skin|Tailor|Smith|Engi|Alchemy|Enchant|Leather) \d+/.test(strip(app.rowsOf(app.top())[app.top().cursor]?.text ?? '')));
    const hireRows = () => app.rowsOf(app.top()).filter((r) => !r.header && r.data);
    check('the hire list is the whole faction, every level', hireRows().length > 1000 && hireRows().some((r) => /^\S+\s+L1 /.test(strip(r.text))) && hireRows().some((r) => /^\S+\s+L60 /.test(strip(r.text))));
    check('the hire list opens on your level', /^\S+\s+L(8|9|10|11|12) /.test(strip(app.rowsOf(app.top())[app.top().cursor]?.text ?? '')));
    term.press('right');
    check('Right steps to the DPS tab', app.top().title === 'Hire · DPS' && hireRows().every((r) => /^\S+\s+L\d+ \S+\s+dps /.test(strip(r.text))));
    term.press('t'); term.press('t');
    check('t narrows to one kit', app.top().title === 'Hire · DPS · Shabby' && hireRows().length > 0 && hireRows().every((r) => / dps\s+Shabby /.test(strip(r.text))));
    term.press('left'); term.press('left'); term.press('right');
    check('the role tabs wrap, All is the start', app.top().title === 'Hire · Shabby');
    term.press('T'); term.press('T');
    check('T steps the kit back to any', app.top().title === 'Hire');
    term.press('return'); show('candidate page');
    check('Enter opens the candidate page', app.top().id.startsWith('cand-'));
    check('the candidate page lists professions and stats', app.rowsOf(app.top()).some((r) => r.header && strip(r.text) === 'Professions') && rowIndex((r, t) => /^Health \d+/.test(t)) >= 0);
    app.top().cursor = rowIndex((r, t) => /^Hire as/.test(t)); app.render();
    check('the hire row draws the candidate in their gear beside the cost', !hasArt(nativeDisplayId(human.id, 0)) || /[▀▄]/.test(frame()));
    term.press('return'); show('after hire');
    check('hiring returns to the hire list, not the tab', app.top()?.id === 'hire');
    term.press('escape'); check('Esc closes the hire list', app.stack.length === 0);
    const comp = (g.state.squad ?? [])[0];
    check('a companion joined the party', !!comp);
    if (comp) {
      const row = rowIndex((r, t) => t.startsWith(comp.name));
      app.top().cursor = row; term.press('return'); show('companion page');
      check('Enter opens their page', app.top().id === `comp-${comp.id}`);
      check('their page draws them beside the Role note', !hasArt(nativeDisplayId(comp.race, comp.gender)) || /[▀▄]/.test(frame()));
      // Make room for Tailoring: drop one primary when they hold two.
      const lines = g.companionProfessionsOf(comp.id)?.lines ?? [];
      const primaries = lines.filter((l) => l.kind !== 'secondary');
      if (!lines.some((l) => l.line === 'tailoring')) {
        if (primaries.length >= 2) g.unlearnCompanionProfession(comp.id, primaries[0].line);
        app.render();
        const take = rowIndex((r, t) => /Take up a profession/.test(t));
        app.top().cursor = take; term.press('return'); show('take up a profession');
        const tl = rowIndex((r, t) => /^Tailoring/.test(t));
        app.top().cursor = tl; term.press('return');
      }
      check('they take up Tailoring', !!g.companionProfessionsOf(comp.id)?.lines.some((l) => l.line === 'tailoring'));
      home(); term.press('0');
      g.state.inventory = addItem(g.state.inventory, 2589, 6, 20);
      app.render();
      term.press('g'); show('send goods');
      check('g opens Send goods', app.top().id === 'send-goods');
      const gift = rowIndex((r, t) => /Linen Cloth x6/.test(t) && t.includes(comp.name));
      check('the cloth goes to the new tailor', gift > 0);
      app.top().cursor = rowIndex((r, t) => t.startsWith('Apply')); term.press('return');
      check('Apply hands it over', countItem(comp.bags ?? { stacks: [] }, 2589) === 6 && countItem(inv(), 2589) === 0);
      home(); term.press('9');
      const theirs = rowIndex((r, t) => t.startsWith(comp.name.slice(0, 10)) && /Tailoring/.test(t));
      check('the Professions tab lists their Tailoring', theirs > 0);
      if (theirs > 0) {
        app.top().cursor = theirs; term.press('return'); show('companion book');
        const bolt = rowIndex((r) => r.data?.recipe?.name === 'Bolt of Linen Cloth');
        check('their book has Bolt of Linen Cloth ready', bolt > 0 && rowsNow()[bolt].data.chk.ok);
        const had = countItem(comp.bags ?? { stacks: [] }, 2996); // Send goods may have handed over a spare bolt
        if (bolt > 0) { app.top().cursor = bolt; term.press('return'); }
        check('they craft it into their own bags', countItem(comp.bags ?? { stacks: [] }, 2996) === had + 1);
        term.press('escape');
      }
      const party = rowIndex((r, t) => /Everything the party can make/.test(t));
      app.top().cursor = party; term.press('return'); show('party book');
      check('the party book opens', app.top().id === 'party-book' && /crafter/.test(strip(frame())));
      term.press('escape');
    }
  }

  // Vendor rows flag the reagents the party crafts with.
  home(); term.press('1');
  const vend = rowIndex((r, t) => /Trade Supplies|General Goods|Supplies/.test(t));
  if (vend > 0) {
    app.top().cursor = vend; term.press('return'); show('vendor with reagents');
    const thread = rowIndex((r) => r.data?.itemEntry === 2320);
    if (thread > 0) check('the vendor flags Coarse Thread as a reagent', /reagent/.test(strip(rowsNow()[thread].text)));
    term.press('escape');
  }

  // Gathering lines list the zone's nodes on the World tab.
  g.devLearnProfession('mining');
  g.state.inventory = addItem(g.state.inventory, 2901, 1, 1); // Mining Pick
  home(); term.press('1'); show('world with mining');
  const vein = rowIndex((r, t) => /Copper Vein/.test(t));
  check('the World tab lists Copper Vein for a miner', vein > 0);
  if (vein > 0) {
    app.top().cursor = vein; term.press('return');
    check('Enter mines it', countItem(inv(), 2770) > 0);
  }
}

// ---- companions fight beside you (squad mode) -------------------------------------------------------------
{
  const g = app.g;
  const tabOf = (id) => app.tabs.findIndex((t) => t.view.id === id);
  if ((g.state.squad ?? []).length < 2) {
    const cand = g.innCandidates()[0];
    if (cand) g.hireCandidate(cand.bot.id, 'healer');
  }
  const squad = g.state.squad ?? [];
  check(`two companions are seated (${squad.length})`, squad.length >= 2);
  if (iconsOn() && squad[0]) {
    // c on a companion's page opens their character sheet: the Character tab's paperdoll, for them.
    const [cols, rows] = [term.cols, term.rows];
    term.cols = 160; term.rows = 54;
    home(); app.switchTab(tabOf('companions'));
    app.top().cursor = rowIndex((r, t) => t.startsWith(squad[0].name)); term.press('return'); term.press('c'); show('companion sheet');
    check('c on a companion opens their sheet as the paperdoll grid', app.top().id === `sheet-${squad[0].id}` && !!app.top().gridNav && frame().includes(squad[0].name) && /Attack pwr/.test(frame()));
    term.cols = cols; term.rows = rows; home();
  }
  check('money reads in coins, an empty copper left off', strip(coinText(250000)) === (iconsOn() ? '25●' : '25g 0c') && strip(coinText(0, 'free')) === 'free');
  home(); app.switchTab(tabOf('companions'));
  term.press('m'); show('squad mode picker');
  check('m on Companions opens the squad mode picker', app.top().id === 'pick' && /How do your companions fight/.test(app.top().title));
  app.top().cursor = rowIndex((r, t) => /^\S*\s*Party/.test(t)); term.press('return');
  check('Party mode is set', g.autopilotConfig().questSquadAlways === true && /Fights: Party/.test(strip(frame())));
  // A creature near your level so the companions earn xp from it.
  home(); term.press('1');
  const mobs = app.rowsOf(app.top()).map((r, i) => [r, i]).filter(([r]) => r.data?.creature && r.data.creature.level <= app.ch.level);
  const [, mobAt] = mobs.sort(([a], [b]) => b.data.creature.level - a.data.creature.level)[0] ?? [null, -1];
  app.g.regenTick(600, true);
  const xpBefore = squad.map((c) => c.xp ?? 0);
  const logFrom = app.log.length;
  app.top().cursor = mobAt; term.press('return');
  check('a party fight started', !!app.fight?.withSquad);
  for (let n = 0; n < 8 && app.fight; n++) app.fight.tick();
  show('party fight');
  const f = strip(frame());
  check('ally frames name both companions with a role letter', squad.every((c) => new RegExp(`[TDH·] ${c.name}`).test(f)));
  // t: an order to the first companion. The fight waits while the pickers are open.
  term.press('t');
  check('t opens party orders and pauses the fight', app.top()?.title === 'Orders: who?' && app.fight.paused);
  term.press('return'); show('orders for one companion');
  const side = app.fight.session.alliesView()[0].side;
  app.top().cursor = rowIndex((r, t) => /Hold ground/.test(t)); term.press('return');
  check('a hold order lands and the fight resumes', app.fight.session.unitStanceOf?.(side) === 'hold' && !app.fight.paused && app.stack.length === 0);
  term.press('t'); term.press('return');
  const atk = rowIndex((r, t) => /^Attack /.test(t));
  app.top().cursor = atk; term.press('return');
  check('an attack order holds the companion on that target', !!app.fight.session.allyTargetOf(side));
  finishFight();
  const fightLog = app.log.slice(logFrom).map(strip);
  check('the combat log names the companions, not ally_N', squad.some((c) => fightLog.some((l) => l.includes(c.name))) && !fightLog.some((l) => /ally_\d/.test(l)));
  const xpNow = (c) => (g.state.squad ?? []).find((x) => x.id === c.id) ?? c;
  check(`companion xp rose (${xpBefore.join(',')} -> ${squad.map((c) => xpNow(c).xp ?? 0).join(',')})`, squad.some((c, i) => (xpNow(c).xp ?? 0) > xpBefore[i] || xpNow(c).level > c.level));
  // Solo mode keeps them home: the next pull has no allies.
  term.press(':'); term.type('squad solo');
  check(':squad solo sets Solo', g.autopilotConfig().questSquadAlways === false && g.autopilotConfig().questEliteMode === 'solo');
  app.top().cursor = mobAt; term.press('return');
  check('a solo pull brings nobody', !!app.fight && app.fight.session.alliesView().length === 0);
  finishFight();
  term.press(':'); term.type('squad party');
  const quickEntry = app.rowsOf(app.top())[mobAt].data.creature.entry;
  term.press(':'); term.type(`fight ${quickEntry}`);
  // The log is capped at 2000 lines (say()), so read from the command's echo, not from a length taken before it.
  const quickLog = app.log.map(strip);
  const quickAt = quickLog.lastIndexOf(`> fight ${quickEntry}`);
  check(':fight brings the party in Party mode', quickAt >= 0 && quickLog.slice(quickAt + 1).some((l) => squad.some((c) => l.includes(c.name))));
}

// ---- gear: a BoE a companion carries (a crafter's product) goes on from the Equipment tab, no trade first ----
{
  const g = app.g, comp = g.state.squad[0];
  const cloak = ds.items().find((i) => i.slot === 'back' && i.bonding === 2 && (i.requiredLevel ?? 1) <= app.ch.level && !i.allowClass?.length && i.entry > 100);
  check('a BoE cloak exists to hand a companion', !!cloak && !!comp);
  if (cloak && comp) {
    comp.bags = addItem(comp.bags ?? { stacks: [] }, cloak.entry, 1, 1);
    home(); app.switchTab(app.tabs.findIndex((t) => t.view.id === 'gear'));
    app.top().cursor = rowIndex((r) => r.data?.slot === 'back' && !r.data?.upgrade); term.press('return'); show('back slot picker with companion bags');
    const row = rowIndex((r, t) => t.includes(cloak.name) && t.includes(comp.name));
    check("the slot picker lists the cloak from the companion's bags", row > 0);
    if (row > 0) {
      app.top().cursor = row; term.press('return');
      const back = app.g.state.char.equipped.back;
      check("Enter takes the companion's cloak and wears it", (back?.item ?? back) === cloak.entry && countItem(comp.bags, cloak.entry) === 0);
    }
  }
}

// ---- dungeons: the Deadmines as a text run ------------------------------------------------------------------
{
  const g = app.g;
  const { hasFlag, isComplete, routeEncounterIdList } = await import('../world/instances.ts');
  g.state.char.level = 20; g.state.char.gold = 10_000_000;
  const bag = ds.items().find((i) => i.slot === 'bag' && i.itemClass !== 11 && (i.bagSlots ?? 0) >= 10 && (i.requiredLevel ?? 1) <= 20 && !i.allowClass?.length);
  for (let i = 0; i < 4; i++) { g.state.inventory = addItem(g.state.inventory, bag.entry, 1, 1); g.equip(bag.entry); }
  for (const c of [...(g.state.squad ?? [])]) g.dismissCompanion(c.id);
  for (const [cls, role] of [[1, 'tank'], [2, 'healer'], [8, 'dps'], [4, 'dps']]) g.recruitCompanion(cls, role, 'twink');
  for (const c of g.state.squad) c.level = 20;
  g.state.char.zoneId = 'westfall'; g.regenTick(600, true);
  home(); term.press('1'); show('westfall with a portal');
  const portal = rowIndex((r) => r.data?.dungeon?.id === 'deadmines');
  check('the World tab lists the Deadmines portal', portal > 0);
  app.top().cursor = portal; term.press('return'); show('deadmines entry card');
  check('Enter on the portal opens the entry card', app.top().id === 'enter-deadmines' && /Who walks in: 4 of 4/.test(strip(frame())));
  app.top().cursor = rowIndex((r, t) => /^Route:/.test(t)); term.press('return');
  check('the route toggles to Full', /Route: Full/.test(strip(frame())));
  term.press('return');
  app.top().cursor = rowIndex((r, t) => /^Enter the dungeon/.test(t)); term.press('return'); show('run window');
  check('entering opens the run window', app.top()?.id === 'dungeon' && g.state.instance?.dungeonId === 'deadmines' && /Rhahk'Zor/.test(strip(frame())));
  let picksChecked = false;
  for (let n = 1; n <= 2; n++) {
    app.top().cursor = rowIndex((r, t) => /◀ next/.test(t)); term.press('return');
    check(`stop ${n} starts a live fight with the party`, !!app.fight?.withSquad && app.fight.session.alliesView().length >= 4);
    // ← → walk a pick along the pack, Enter makes it your target, Esc drops the pick without running.
    {
      const f = app.fight, foes = f?.pickable() ?? [];
      if (app.fight && !picksChecked && foes.length >= 2) {
        picksChecked = true;
        const was = f.session.enemyView().side;
        term.press('right');
        const picked = f.pick;
        check('→ picks a foe other than the one you face, marked on its plate', !!picked && picked !== was && strip(frame()).includes('◁'));
        term.press('escape');
        check('Esc drops the pick and stays in the fight', app.fight === f && f.pick === null);
        term.press('left'); const target = f.pick; term.press('return');
        check('Enter on a pick makes it your target', !!target && f.session.enemyView().side === target && f.pick === null);
      }
      if (n === 2 && !picksChecked) check('a Deadmines pull has a pack to pick from', false);
    }
    if (n === 1 && app.fight) {
      // The party stage: every body on one floor, the party's plates on one row (role letter, name) left of the
      // pack's, an HP percent under each, the foe you face marked, and a cast bar under a caster while it casts.
      for (let k = 0; k < 8 && app.fight; k++) app.fight.tick();
      show('party stage');
      const rows = strip(frame()).split('\n');
      const plateRow = rows.findIndex((l) => /\bT \S/.test(l) && /\bH \S/.test(l) && l.includes(app.ch.name));
      check('the party stage puts the tank, the healer and you on one plate row', plateRow > 0);
      const pct = (rows[plateRow + 1] ?? '').match(/\d+%/g) ?? [];
      const bodies = 1 + app.fight.session.alliesView().length + 1; // you, the party, at least the foe you face
      check(`an HP percent sits under every sprite (${pct.length} of ${bodies}+)`, pct.length >= bodies);
      check('the pack stands right of the party with the faced foe marked', plateRow > 0 && rows[plateRow].indexOf('◀') > rows[plateRow].lastIndexOf(app.ch.name));
      check('the party stage stands on a floor', /[▁▂_]{40}/.test(strip(frame())));
      let cast = null;
      for (let k = 0; k < 400 && app.fight && !cast; k++) {
        app.fight.tick();
        const s = app.fight.session;
        cast = [...s.alliesView(), ...s.enemiesView()].find((v) => v.hp > 0 && v.casting && v.casting.endsAt - s.t >= 300) ?? null;
      }
      check('a cast shows as a bar under the caster', !cast || strip(frame()).includes(cast.casting.name.slice(0, 8)));
      if (cast) show('party stage cast');
      // The last foe falls and the win holds: the party stays where it fought, it does not walk back to its start.
      const plates = () => strip(frame()).split('\n').find((l) => /\bT \S/.test(l) && l.includes(app.ch.name))?.replace(/ ◀/, '').replace(/\s+$/, '') ?? ''; // the dead foe loses its mark
      let before = '';
      for (let k = 0; k < 3000 && app.fight && !app.fight.ended; k++) {
        const left = app.fight.session.enemiesView().filter((v) => v.hp > 0);
        if (left.length === 1 && left[0].hp < left[0].maxHp * 0.25) before = plates();
        app.fight.tick();
      }
      if (app.fight?.holding && before) { const after = plates(); check(`the party holds its ground over the win${after === before ? '' : `\n       ${before}\n       ${after}`}`, after === before); }
    }
    finishFight();
    check(`stop ${n} is cleared and the run window comes back`, g.state.instance.defeated.length === n && app.top()?.id === 'dungeon');
  }
  show('run window after two stops');
  const chest = rowIndex((r) => r.data?.object?.kind === 'chest' && r.data.object.pin.name === 'Defias Gunpowder');
  app.top().cursor = chest; app.render();
  const chestPin = app.rowsOf(app.top())[chest]?.data?.object?.pin;
  check('a chest row draws the chest in the detail pane', !objectArt(chestPin?.displayId, 20, 10) || /[▀▄]/.test(frame()));
  term.press('return');
  check('the Defias Gunpowder chest gives the gunpowder', countItem(g.state.inventory, 5397) === 1);
  check('opening a chest by hand slides what it gave in as loot toasts', !!app.lootToast?.loot.some((d) => d.item === 5397));
  app.lootToast.start = Date.now() - 1500; app.render(); show('chest loot toast');
  check('the toast names the gunpowder over the run window', frame().includes(ds.item(5397).name));
  app.lootToast = null;
  const cannon = rowIndex((r) => r.data?.object?.kind === 'gate');
  app.top().cursor = cannon; term.press('return');
  check('the Defias Cannon opens the iron-clad door', hasFlag(g.state.instance, 'deadmines-iron-clad-door'));
  term.press('P'); show('paladin board');
  check('P opens the paladin board with the paladin companion', app.top().id === 'pallypower' && rowIndex((r, t) => /^\s*Aura/.test(t)) > 0);
  app.top().cursor = rowIndex((r, t) => /^\s*Aura/.test(t)); term.press('return');
  check('Enter on the aura row assigns one', g.paladinBoard().rows.some((r) => r.assignedAura));
  term.press('escape');
  term.press('F'); term.press('return'); show('run report');
  check('finish instantly ends on the run report', app.top()?.id === 'run-summary' && /Run report|Cleared|Partial|Wiped/.test(strip(frame())) && (app.dungeonPulls?.length ?? 0) > 2);
  term.press('escape');
  {
    const secRows = () => app.rowsOf(app.top()).filter((r) => r.data?.section);
    const stopCount = () => app.rowsOf(app.top()).filter((r) => r.data?.stop).length;
    const shut = secRows().filter((r) => /^▸/.test(strip(r.text)));
    show('run window, sections past a dead boss folded');
    check(`a section folds on its own once its boss is down, trash and all (${shut.length} of ${secRows().length})`, app.top()?.id === 'dungeon' && secRows().length > 1 && shut.length > 0);
    const i = rowIndex((r, t) => !!r.data?.section && /^▸/.test(t));
    const before = stopCount();
    app.top().cursor = i; term.press('return');
    check('Enter on a folded section opens it and keeps the cursor there', stopCount() > before && app.top().cursor === i);
    term.press('e');
    const allOpen = secRows().every((r) => /^▾/.test(strip(r.text)));
    term.press('e');
    check('e opens every section while one is folded, then folds them all, no stop left showing', allOpen && secRows().every((r) => /^▸/.test(strip(r.text))) && stopCount() === 0);
  }
  const cleared = g.state.instance.defeated.length;
  const allDown = isComplete(ds.instance('deadmines'), g.state.instance);
  {
    const { portalRows } = await import('./tuiDungeon.mjs');
    const texts = portalRows(app).map((r) => strip(r.text));
    check('inside a run, the World tab still lists the zone\'s dungeons, the one you are in marked', texts.some((t) => /The Deadmines .*you are in it/.test(t)) && !texts.some((t) => /Back into/.test(t)));
  }
  term.press('L');
  check('L leaves and the run is held', !g.state.instance && !!g.state.instanceSaves?.deadmines);
  check('a 5-man holds the run for two hours', Math.abs(g.state.instanceSaves.deadmines.expiresAtMs - Date.now() - 2 * 3600_000) < 60_000);
  check('the portal row shows the held run', allDown ? /cleared, resets in/.test(strip(frame())) : /your run is held/.test(strip(frame())));
  app.top().cursor = rowIndex((r) => r.data?.dungeon?.id === 'deadmines'); term.press('return');
  if (allDown) {
    check('the entry card of a cleared run offers to go back in', /Go back in/.test(strip(frame())) && /You cleared it/.test(strip(frame())));
    app.top().cursor = rowIndex((r, t) => /^Go back in/.test(t)); term.press('return');
  }
  check('a held run is walked straight back into', g.state.instance?.dungeonId === 'deadmines');
  check('going back in keeps the cleared stops', g.state.instance?.defeated.length === cleared);
  term.press('R'); term.press('return');
  check('R resets the run', g.state.instance?.defeated.length === 0);
  // Finish instantly on a boss it cannot beat: Captain Greenskin gates nothing, so the run leaves him and goes on.
  {
    const realResolve = g.resolveFight;
    g.resolveFight = (session, opts) => {
      const was = g.state.instance;
      const r = realResolve.call(g, session, opts);
      if (!g.state.instance?.defeated.includes('captain-greenskin') || was?.defeated.includes('captain-greenskin')) return r;
      g.state.instance = was;
      return { ...r, outcome: 'defeat' };
    };
    const route = routeEncounterIdList(ds.instance('deadmines'), g.state.instance);
    const after = route.slice(route.indexOf('captain-greenskin') + 1);
    g.regenTick(600, true);
    term.press('F'); term.press('return'); show('run report, a boss left standing');
    g.resolveFight = realResolve;
    const tries = (app.dungeonPulls ?? []).filter((p) => p.encounterId === 'captain-greenskin');
    const lastTry = app.dungeonPulls.lastIndexOf(tries.at(-1));
    const wonPast = app.dungeonPulls.slice(lastTry + 1).filter((p) => p.outcome === 'win');
    check(`finish instantly leaves a boss it cannot beat after ${tries.length} try and goes on (${wonPast.length} won after)`,
      tries.length === 1 && !g.state.instance.defeated.includes('captain-greenskin') && wonPast.length > 0 && after.some((id) => g.state.instance.defeated.includes(id)));
    check('the run report names the boss it could not beat', app.top()?.id === 'run-summary' && /Could not beat Captain Greenskin/.test(strip(frame())));
    term.press('escape');
    term.press('R'); term.press('return');
    app.dungeonPulls = [];
  }
  // The continuous floor (2i): walk the Deadmines on its nav mesh; what sees you on the way pulls.
  {
    const { loadNavMesh, stepFloor, navMeshDir } = await import('./tuiFloor.mjs');
    const def = ds.instance('deadmines');
    g.regenTick(600, true);
    if (loadNavMesh(def)) {
      term.press('W'); show('the floor');
      check('W opens the floor with the stops by distance', app.top()?.id === 'floor' && /Where to/.test(strip(frame())));
      const f = app.floor;
      const thingsAt = () => { const rows = app.top().rows(app); const ti = rows.findIndex((r) => r.header && /Things to use/.test(strip(r.text))); return { rows, ti }; };
      {
        const { rows, ti } = thingsAt();
        check('the floor lists things to use, a map of the mesh above each', ti >= 0 && !!rows[ti + 1]?.act && rows[ti + 1].detail(app, rows[ti + 1]).some((l) => strip(l).includes('@')));
        term.press('m');
        check('m shows the floor map', app.top()?.id === 'floor-map' && strip(frame()).includes('@') && /north up/.test(strip(frame())));
        term.press('escape');
      }
      const at0 = { x: f.world.party.x, y: f.world.party.y };
      app.top().cursor = rowIndex((r) => r.data === undefined && !!r.keys?.P); term.press('return');
      check('Enter on a stop starts the walk', f.walking && !!f.target);
      let pulled = false;
      for (let i = 0; i < 3000 && !pulled; i++) pulled = stepFloor(app, f) || !!app.fight;
      check('the party walks the mesh', f.world.walkedYd > 1 && Math.hypot(f.world.party.x - at0.x, f.world.party.y - at0.y) > 1);
      check('what sees you on the way pulls, with the party', pulled && !!app.fight && app.fight.session.alliesView().length >= 4);
      const before = g.state.instance.defeated.length;
      finishFight();
      check('a won floor pull clears its stop and its bodies', g.state.instance.defeated.length === before + 1 && f.world.clearedGuids.length > 0 && app.top()?.id === 'floor');
      {
        // Nobody left to pull on the way: Enter on the nearest thing you can use walks there and uses it.
        const { rows, ti } = thingsAt();
        const at = rows.findIndex((r, i) => i > ti && !r.header && !/needs|locked/.test(strip(r.text)));
        for (const e of f.world.entities) if (!e.party) e.state = 'skipped'; // the grid still holds them; skipped bodies never pull
        app.top().cursor = at; term.press('return');
        for (let i = 0; i < 3000 && f.walking; i++) stepFloor(app, f);
        check('Enter on a thing walks there and uses it', at > ti && !f.walking && (app.top()?.id !== 'floor' || app.log.slice(-8).some((l) => /You (open|mine|pick)/.test(strip(l)))));
        while (app.top()?.id !== 'floor' && app.stack.length) term.press('escape');
      }
      term.press('escape');
      term.press('R'); term.press('return');
      check('a reset forgets the floor too', !app.floor && g.state.instance?.defeated.length === 0);
    } else {
      term.press('W');
      check(`no mesh at ${navMeshDir()}: W says so and the run stays sequential`, app.top()?.id === 'dungeon' && /no floor to walk/.test(app.flash?.text ?? ''));
    }
  }
  term.press('L');
  check('leaving a fresh run holds nothing', !g.state.instance && !g.state.instanceSaves?.deadmines);
  // A raid door: the walk-in picker and the 20-man group, on Zul'Gurub's card.
  g.state.char.zoneId = 'stranglethorn';
  home(); term.press('1');
  app.top().cursor = rowIndex((r) => r.data?.dungeon?.id === 'zul-gurub'); term.press('return'); show('zul-gurub card');
  check('a raid card offers the raid group', app.top().id === 'enter-zul-gurub' && /Group: Raid/.test(strip(frame())) && /Raid group \(20-man\)/.test(strip(frame())));
  app.top().cursor = rowIndex((r, t) => /^Who walks in/.test(t)); term.press('return');
  term.press('return');
  check('a pick at the door sets the instance roster', g.state.instanceRoster?.dungeonId === 'zul-gurub');
  term.press('c'); check('c goes back to auto', !g.state.instanceRoster);
  term.press('escape');
  app.top().cursor = rowIndex((r, t) => /^Raid group/.test(t)); term.press('return'); term.press('f');
  check('f fills the 20-man group', g.state.raidLineup?.size === 20 && g.state.raidLineup.ids.length > 0);
  term.press('c'); home();
  // Travel splits a zone's neighbors by how you get there: Grom'gol's zeppelins are not a walk to Tirisfal.
  app.switchTab(app.tabs.findIndex((t) => t.view.id === 'travel')); app.render();
  {
    const texts = app.rowsOf(app.top()).map((r) => strip(r.text));
    const foot = texts.indexOf('On foot'), boats = texts.indexOf('Boats and zeppelins');
    const tirisfal = texts.findIndex((t) => t.startsWith('Tirisfal Glades'));
    check('Travel lists the zeppelin to Tirisfal under boats, Duskwood on foot', foot >= 0 && boats > foot && tirisfal > boats
      && /Undercity/.test(texts[tirisfal]) && texts.findIndex((t) => t.startsWith('Duskwood')) < boats);
  }
  home();
  g.state.char.zoneId = 'westfall';
}

// ---- companions: settings, hire search, rotation, bars, bags, bank, share, pets, duel ------------------------
{
  const g = app.g;
  const tabOf = (id) => app.tabs.findIndex((t) => t.view.id === id);
  const comp = () => g.state.squad[2];
  const openPage = () => { home(); app.switchTab(tabOf('companions')); app.top().cursor = rowIndex((r, t) => t.startsWith(comp().name)); term.press('return'); };
  openPage(); show('companion page with settings');
  check('the companion page has settings rows', /How they play/.test(strip(frame())) || rowIndex((r, t) => /^Area spells:/.test(t)) > 0);
  app.top().cursor = rowIndex((r, t) => /^Area spells:/.test(t)); term.press('return');
  check('Enter cycles their AoE mode', comp().aoeMode === 'aoe');
  app.top().cursor = rowIndex((r, t) => /^Emergency heals:/.test(t)); term.press('return');
  check('Enter switches off-heal', comp().offHeal === true);
  const locked = comp().xpLocked === true;
  app.top().cursor = rowIndex((r, t) => /^Experience:/.test(t)); term.press('return');
  check('Enter switches their experience lock', (comp().xpLocked === true) !== locked);
  term.press('return');
  const specs = ds.botSpecs(comp().cls) ?? [];
  app.top().cursor = rowIndex((r, t) => /^Spec:/.test(t)); term.press('return');
  const before = comp().specIdx;
  app.top().cursor = app.rowsOf(app.top()).findIndex((r, i) => i !== before); term.press('return');
  check(`a spec pick respecs them (${specs.length} builds)`, specs.length < 2 || comp().specIdx !== before);
  // Bags: give them a potion, use it on them is refused or fine; sell needs a vendor; bank and back.
  const potion = ds.items().find((i) => i.useInCombat?.effect === 'restore_health' && (i.requiredLevel ?? 1) <= 5);
  g.state.inventory = addItem(g.state.inventory, potion.entry, 3, 5);
  g.giveItemToBot(comp().id, potion.entry, 3);
  openPage();
  const potRow = rowIndex((r, t) => t.startsWith(potion.name));
  check('their bags list what you gave', potRow > 0);
  app.top().cursor = potRow; term.press('b');
  check('b puts it in their bank', (comp().bank?.stacks ?? []).some((s) => s.item === potion.entry));
  app.top().cursor = rowIndex((r, t) => t.startsWith(potion.name)); term.press('return');
  check('Enter in their bank takes it back to their bags', (comp().bags?.stacks ?? []).some((s) => s.item === potion.entry));
  // Action bars: their kit bar opens and a slot fills from their spells.
  app.top().cursor = rowIndex((r, t) => /^Action bars/.test(t)); term.press('return'); show('companion bars');
  check('their action bars open', app.top().id === 'bars' && /action bars/.test(strip(frame())));
  term.press('escape'); term.press('escape');
  // Rotation tab: switch to the companion, add a profile, switch back.
  home(); term.press('6'); term.press('w');
  app.top().cursor = rowIndex((r, t) => t.includes(comp().name)); term.press('return'); show('companion rotation');
  check('w shows the companion rotation', strip(frame()).includes(`${comp().name}:`));
  term.press('p'); app.top().cursor = rowIndex((r, t) => /copy of this one/.test(t)); term.press('return'); term.type('Second');
  check('p adds a named companion rotation', g.companionRotationProfiles(comp().id).some((p) => p.name === 'Second' && p.active));
  term.press('w'); term.press('return');
  check('w back to your own rotation', !app.tabs[5].view.whose);
  // Spellbook tabs: General, then one per talent tree; [ ] and Left Right on the strip turn them.
  home(); term.press('5'); show('spellbook');
  {
    const rs = () => app.rowsOf(app.top());
    const stripAt = () => rs().findIndex((r) => r.data?.strip);
    const spells = () => rs().slice(stripAt() + 1).filter((r) => !r.header).map((r) => strip(r.text));
    const trees = ds.talentTrees(app.ch.cls).map((t) => t.name);
    check('spellbook has General and a tab per talent tree', stripAt() > 0 && ['General', ...trees].every((n) => strip(rs()[stripAt()].text).includes(n)));
    const first = spells();
    check(`the book opens on a tab with spells (${first.join(', ')})`, first.length > 0);
    // ] through every tab and back: each spell sits on exactly one tab, and the class spells are not on General.
    const seen = [];
    for (let i = 0; i <= trees.length; i++) { seen.push(...spells()); term.press(']'); }
    check('] walks every tab and comes back round', JSON.stringify(spells()) === JSON.stringify(first) && new Set(seen).size === seen.length);
    // This warrior's General is empty, so the book opens on Arms.
    check('Heroic Strike is filed under Arms, not General', /General 0\s+Arms [1-9]/.test(strip(rs()[stripAt()].text)) && first.some((n) => n.startsWith('Heroic Strike')));
    app.top().cursor = stripAt(); term.press('left');
    const back = spells();
    term.press('right');
    check('Left Right on the strip turn the book, not the window', app.top().id === 'spells' && JSON.stringify(spells()) === JSON.stringify(first) && JSON.stringify(back) !== JSON.stringify(first));
  }
  // Player action bars: bar 1 from the Spells tab, and the fight's number row reads it.
  home(); term.press('5'); term.press('b'); show('player bars');
  check('b on Spells opens your action bars', app.top().id === 'bars' && /Bar 1/.test(strip(frame())));
  term.press('escape');
  // Share consumables and the party vault from the Companions tab.
  g.state.inventory = addItem(g.state.inventory, potion.entry, 8, 5);
  home(); app.switchTab(tabOf('companions')); term.press('s'); show('share consumables');
  check('s opens Share consumables listing the potion', app.top().id === 'share' && strip(frame()).includes(potion.name));
  term.press('A');
  check('A hands potions out', g.state.squad.some((c) => (c.bags?.stacks ?? []).some((s) => s.item === potion.entry)));
  term.press('escape'); term.press('v');
  check('v opens party storage', app.top().id === 'vault' && rowIndex((r, t) => t.includes(potion.name)) > 0);
  app.top().cursor = rowIndex((r, t) => t.includes(potion.name)); term.press('return');
  check('Enter in party storage takes it all back', countItem(g.state.inventory, potion.entry) > 0 && g.state.squad.every((c) => !(c.bags?.stacks ?? []).some((s) => s.item === potion.entry)));
  term.press('escape');
  // A hunter on the bench with a pet picker; a tavern duel at an inn.
  const hunter = g.recruitCompanion(3, 'dps', 'field');
  const hc = Object.values(g.state.botRoster ?? {}).find((c) => c.id === hunter.id) ?? g.state.squad.find((c) => c.id === hunter.id);
  if (hc) hc.level = 20;
  const benched = g.dismissCompanion(g.state.squad[3].id);
  g.activateCompanion(hunter.id);
  home(); app.switchTab(tabOf('companions')); app.top().cursor = rowIndex((r, t) => t.startsWith(hc?.name ?? '?')); term.press('return');
  const petRow = rowIndex((r, t) => /^Tame another beast/.test(t));
  check('a hunter companion has a pet picker', petRow > 0 && benched.ok);
  if (petRow > 0) {
    app.top().cursor = petRow; term.press('return'); term.press('down'); term.press('return');
    check('picking a beast gives them that pet', !!(g.state.squad.find((c) => c.id === hunter.id)?.pet));
  }
  g.state.char.zoneId = 'elwynn';
  home(); app.switchTab(tabOf('companions')); app.top().cursor = rowIndex((r, t) => t.startsWith(comp().name)); term.press('return');
  const duelRow = rowIndex((r, t) => /^Duel /.test(t));
  check('at an inn a companion can be duelled', duelRow > 0);
  if (duelRow > 0) {
    const hp = g.state.char.health;
    app.top().cursor = duelRow; term.press('return');
    check('the duel runs in the live fight view', !!app.fight && app.fight.label === 'duel');
    finishFight();
    check('a duel costs nothing and ends on a yield', !app.fight && app.log.slice(-6).some((l) => /yield|gives way/.test(strip(l))) && g.state.char.health > 0 && hp > 0);
  }
  // Hire search from the hire list.
  home(); app.switchTab(tabOf('companions'));
  app.top().cursor = rowIndex((r, t) => /^Hire a companion/.test(t)); term.press('return');
  term.press('/'); term.type('mage');
  check('/ in the hire list searches the faction', app.top().id === 'hire-search' && app.rowsOf(app.top()).some((r) => !r.header && /Mage/.test(strip(r.text))));
  home();
}

// ---- a hunter's pet: tame, orders, autocast, stable, pet trainer ----------------------------------------------
{
  const term2 = new HeadlessTerm(110, 34);
  const app2 = new App({ term: term2, ds, repo });
  term2.open();
  const dwarf = ds.races().find((r) => r.name === 'Dwarf');
  app2.startGame(newGameState(ds, dwarf.id, 3, 'Pettest', 99, 0), 'pettest', Date.now(), true);
  const g2 = app2.g;
  g2.state.char.level = 12; g2.state.char.gold = 1_000_000;
  app2.render();
  const at = (pred) => app2.rowsOf(app2.top()).findIndex((r) => !r.header && pred(r, strip(r.text)));
  // One with an innate ability, so the pet page has an autocast row to toggle.
  const beast = () => at((r) => r.data?.creature?.tameable && r.data.creature.level <= 12 && r.data.creature.petDefaultSpells?.length);
  app2.top().cursor = beast(); term2.press('t');
  check('t refuses a hunter who has not learned Tame Beast', !g2.state.char.pet);
  // Taming the Beast (Dun Morogh): the rod goes on the Large Crag Boar the quest names, and t says so on its row.
  g2.state.char.level = 10; app2.result(g2.acceptQuest(6064));
  const boar = at((r) => r.data?.creature?.entry === 1126);
  check('the taming quest puts its rod on the beast it names', boar >= 0 && /t: use Taming Rod/.test(strip(app2.rowsOf(app2.top())[boar].text)));
  app2.top().cursor = boar; term2.press('t');
  check('t uses the rod and the quest completes', g2.state.questlog.quests.find((q) => q.entry === 6064)?.status === 'complete');
  g2.state.char.level = 12;
  g2.state.spellbook = { known: [...g2.state.spellbook.known, 1515] };
  app2.render();
  check('a hunter with Tame Beast sees t: tame on a beast', /t: tame/.test(strip(app2.rowsOf(app2.top())[beast()].text)));
  app2.top().cursor = beast(); term2.press('t');
  check('t on a tameable beast tames it', !!g2.state.char.pet);
  app2.top().cursor = at((r, t) => /^Pet:/.test(t)); term2.press('return');
  if (showFrames) console.log(`\n=== pet page ===\n${term2.text()}`);
  check('the World tab Pet row opens the pet page', app2.top().id === 'pet');
  app2.top().cursor = at((r, t) => /^Command:/.test(t)); term2.press('return');
  check('Enter switches the pet to stay', g2.state.char.pet.command === 'stay');
  app2.top().cursor = at((r, t) => /^Reaction:/.test(t)); term2.press('return');
  check('Enter cycles its reaction', g2.state.char.pet.react === 'passive' || g2.state.char.pet.react === 'aggressive');
  const ability = at((r, t) => /^✓ /.test(t));
  app2.top().cursor = ability; term2.press('return');
  check('Enter turns an ability off autocast', (g2.state.char.pet.autocastOff ?? []).length > 0);
  app2.top().cursor = at((r, t) => /^Buy a stable slot/.test(t)); term2.press('return');
  check('a stable slot can be bought', (g2.state.char.stableSlots ?? 0) === 1);
  const name = g2.state.char.pet.name;
  app2.top().cursor = at((r, t) => /^Stable /.test(t)); term2.press('return');
  check('the pet goes into the stable', !g2.state.char.pet && g2.state.char.stablePets?.[0]?.name === name);
  app2.top().cursor = at((r, t) => /Slot 1:/.test(t)); term2.press('return');
  check('and comes back out', g2.state.char.pet?.name === name);
  term2.press('escape');
  g2.state.char.zoneId = 'dunmorogh'; app2.render();
  const trainer = at((r, t) => /<Pet Trainer>/.test(t));
  check('Dun Morogh lists a pet trainer', trainer > 0);
  if (trainer > 0) {
    app2.top().cursor = trainer; term2.press('return');
    check('the pet trainer offers to untrain the pet', at((r, t) => /^Untrain /.test(t)) > 0);
    const rank = at((r, t) => !/level \d+/.test(t) && !/^✓/.test(t) && !/^Untrain /.test(t));
    app2.top().cursor = rank; term2.press('return');
    check('a pet trainer rank can be bought', (g2.state.char.petSpells ?? []).length > 0);
  }
  term2.close?.();
}

// ---- what the client's World tab, quest card and bag menu offer: weapon masters, ring picker, hearth, quest steps --
{
  const term2 = new HeadlessTerm(110, 34);
  const app2 = new App({ term: term2, ds, repo });
  term2.open();
  const dwarf = ds.races().find((r) => r.name === 'Dwarf');
  app2.startGame(newGameState(ds, dwarf.id, 1, 'Portcheck', 98, 0), 'portcheck', Date.now(), true);
  const g2 = app2.g;
  g2.state.char.level = 20; g2.state.char.zoneId = 'ironforge';
  app2.switchTab(0); app2.render();
  const at = (pred) => app2.rowsOf(app2.top()).findIndex((r) => !r.header && pred(r, strip(r.text)));
  check('Ironforge lists its weapon masters on the World tab', at((r, t) => /Weapon Master|Weapon Trainer/i.test(t)) >= 0);
  check('no Horde trainer or vendor in an Alliance capital', at((r, t) => /Orgrimmar|Thunder Bluff/.test(t) && /</.test(t)) < 0);
  // Two rings on, a third from the bags asks which to replace instead of overwriting the first.
  const rings = ds.allItems().filter((it) => it.slot === 'finger' && (it.requiredLevel ?? 0) <= 20 && !it.unique).slice(0, 3);
  if (rings.length === 3) {
    for (const r of rings.slice(0, 2)) { g2.state.inventory = addItem(g2.state.inventory, r.entry, 1, 1); g2.equip(r.entry); }
    g2.state.inventory = addItem(g2.state.inventory, rings[2].entry, 1, 1);
    app2.switchTab(2); app2.render();
    app2.top().cursor = at((r, t) => t.includes(rings[2].name)); term2.press('return');
    check('a third ring asks which ring to replace', app2.top().id === 'pick' && /replace which/.test(strip(app2.top().title)));
    term2.press('down'); term2.press('return');
    check('the picked ring slot takes it', Object.values(g2.state.char.equipped).some((e) => (e?.entry ?? e) === rings[2].entry));
  } else check('three plain rings exist for the slot picker check', false);
  // The Hearthstone from the bags takes you home, as the Travel tab's row does.
  g2.state.char.hearthBind = { zone: 'dunmorogh', name: 'Thunderbrew Distillery' };
  app2.stack = []; app2.switchTab(2); app2.render();
  const hs = at((r, t) => /Hearthstone/.test(t));
  if (hs >= 0) {
    app2.top().cursor = hs; term2.press('return');
    check('Enter on the Hearthstone in the bags hearths you', g2.state.char.zoneId !== 'ironforge' || !!g2.state.char.journey);
  } else check('a new dwarf carries a Hearthstone', false);
  // A speak-to quest in the log gets its Speak row on the quest page.
  const talk = ds.quests().find((q) => isTalkToNpcQuest(q) && !q.goEnder && !(q.goEnderEntries ?? []).some((e) => e > 0) && (q.enderName || q.starterName));
  if (talk) {
    g2.state.questlog = { ...g2.state.questlog, quests: [...g2.state.questlog.quests, { entry: talk.entry, status: 'active', kills: {} }] };
    app2.stack = []; app2.push(questDialog(app2, talk, 'log')); app2.render();
    check('a speak-to quest offers Speak to its NPC on the quest page', at((r, t) => /^Speak to /.test(t)) >= 0);
  }
  term2.close?.();
}

// Loot window: auto-loot off holds the corpse's drops and coin; Enter takes a row, a takes the rest, Esc leaves it.
{
  home(); term.press('1');
  term.press(':'); for (const ch of 'autoloot off') term.press(ch === ' ' ? 'space' : ch); term.press('return');
  check(':autoloot off turns auto-loot off', app.prefs.get('autoLoot') === false);
  let held = false;
  for (let i = 0; i < 8 && !held; i++) {
    app.idleTick(600, true);
    const mob = app.rowsOf(app.top()).findIndex((r) => r.data?.creature);
    if (mob < 0) break;
    app.top().cursor = mob; term.press('return'); finishFight();
    held = app.top()?.id === 'loot';
    if (!held && app.g.pendingLoot()) app.g.closeLoot();
  }
  // Nothing dropped in eight kills: fill the container by hand so the window's verbs still get exercised.
  if (!held) {
    const linen = ds.allItems().find((it) => /^Linen Cloth$/.test(it.name));
    app.g.openLoot({ kind: 'corpse', title: 'Test Corpse' }, [{ item: linen.entry, count: 2 }], 37);
    term.press('escape'); term.press(':'); for (const ch of 'autoloot off') term.press(ch === ' ' ? 'space' : ch); term.press('return');
    app.push((await import('./tuiLoot.mjs')).lootDialog(app));
  }
  show('loot window');
  check('a won fight with auto-loot off opens the loot window', app.top()?.id === 'loot' && !!app.g.pendingLoot());
  const before = app.g.pendingLoot();
  const n0 = before.rows.length + (before.copper > 0 ? 1 : 0);
  const gold0 = app.ch.gold, bag0 = app.g.state.inventory.stacks.reduce((n, st) => n + st.count, 0);
  term.press('return');
  const after1 = app.g.pendingLoot();
  check('Enter takes one row out of the container', (after1 ? after1.rows.length + (after1.copper > 0 ? 1 : 0) : 0) === n0 - 1 && (app.ch.gold > gold0 || app.g.state.inventory.stacks.reduce((n, st) => n + st.count, 0) > bag0));
  if (app.g.pendingLoot()) term.press('a');
  check('a takes the rest and closes the window', !app.g.pendingLoot() && app.top()?.id !== 'loot');
  // Esc on a held corpse leaves the rest behind.
  const linen = ds.allItems().find((it) => /^Linen Cloth$/.test(it.name));
  app.g.openLoot({ kind: 'corpse', title: 'Test Corpse' }, [{ item: linen.entry, count: 1 }], 5);
  app.push((await import('./tuiLoot.mjs')).lootDialog(app));
  term.press('escape');
  check('Esc closes the window and leaves the leftovers', !app.g.pendingLoot() && app.top()?.id !== 'loot');
  app.prefs.set('autoLoot', true);
}

// Bag housekeeping: open a container, split, move, sort, wrap and unwrap, destroy, the keyring.
{
  const g = app.g;
  home(); app.switchTab(2);
  const bagRow = (entry) => rowIndex((r) => r.data?.item === entry);
  const lvl = g.state.char.level;
  const box = ds.allItems().find((it) => !(it.lockId > 0) && !it.questItem && (it.requiredLevel ?? 0) <= lvl && ds.lootTable(`item:${it.entry}`).length > 0 && ds.lootTable(`item:${it.entry}`).every((l) => !l.questRequired));
  if (box) {
    g.state.inventory = addItem(g.state.inventory, box.entry, 2, box.stackable ?? 1);
    app.render(); app.top().cursor = bagRow(box.entry); show('bags with a container');
    check('a container shows as openable', /open/.test(strip(app.rowsOf(app.top())[app.top().cursor].text)));
    app.prefs.set('autoLoot', false);
    term.press('return'); show('opened container');
    check('Enter opens a container into the loot window', countItem(g.state.inventory, box.entry) === 1 && (app.top()?.id === 'loot' || !g.pendingLoot()));
    if (app.top()?.id === 'loot') term.press('a');
    app.prefs.set('autoLoot', true);
    check('the container is empty afterwards', !g.pendingLoot());
    home(); app.switchTab(2);
  } else check('the data has an openable container', false);
  // A trade good the character does not hold yet, so every count below is exact.
  const linen = ds.allItems().find((it) => it.itemClass === 7 && (it.stackable ?? 1) >= 10 && it.quality === 1 && !it.questItem && countItem(g.state.inventory, it.entry) === 0);
  g.state.inventory = addItem(g.state.inventory, linen.entry, 5, linen.stackable);
  app.render();
  const stacksOf = (entry) => g.state.inventory.stacks.filter((x) => x.item === entry).map((x) => x.count);
  app.top().cursor = bagRow(linen.entry); term.press('/'); term.press('2'); term.press('return');
  check('/ splits a stack', stacksOf(linen.entry).includes(2) && stacksOf(linen.entry).length >= 2);
  const at = g.state.inventory.stacks.findIndex((x) => x.item === linen.entry);
  app.top().cursor = bagRow(linen.entry);
  const next = g.state.inventory.stacks[at + 1];
  term.press(']');
  check('] moves a stack down a slot', g.state.inventory.stacks[at + 1]?.item === linen.entry || (next?.item === linen.entry && stacksOf(linen.entry).length === 1));
  term.press('S');
  check('S sorts the bags back into one linen stack', stacksOf(linen.entry).length === 1);
  app.top().cursor = bagRow(linen.entry); term.press('m'); show('item menu');
  check('m opens the item menu', app.top().id === 'pick' && /Split the stack/.test(strip(frame())) && /Destroy/.test(strip(frame())));
  term.press('escape');
  const paper = ds.allItems().find((it) => /Wrapping Paper$/.test(it.name) && !/\(/.test(it.name) && it.itemClass === 0);
  if (paper) {
    g.state.inventory = addItem(g.state.inventory, paper.entry, 1, 1);
    app.render(); app.top().cursor = bagRow(paper.entry); term.press('return');
    app.top().cursor = rowIndex((r, t) => t === linen.name || t.startsWith(`${linen.name} x`)); term.press('return');
    const gift = g.state.inventory.stacks.find((x) => x.wrappedItemEntry === linen.entry);
    check('wrapping paper wraps an item into a gift', !!gift && countItem(g.state.inventory, paper.entry) === 0);
    if (gift) {
      app.top().cursor = rowIndex((r) => r.data === gift); term.press('return');
      check('Enter on a gift unwraps it', countItem(g.state.inventory, linen.entry) === 5 && !g.state.inventory.stacks.some((x) => x.wrappedItemEntry));
    }
  } else check('the data has wrapping paper', false);
  app.top().cursor = bagRow(linen.entry);
  const had = countItem(g.state.inventory, linen.entry), doomed = app.rowsOf(app.top())[app.top().cursor].data.count;
  term.press('d'); term.press('return');
  check('d destroys that one stack after a yes', countItem(g.state.inventory, linen.entry) === had - doomed);
  const key = ds.allItems().find((it) => it.itemClass === 13);
  if (key) {
    g.state.keyring = { stacks: [{ item: key.entry, count: 1 }] };
    app.render();
    check('the keyring is listed under the bags', /Keyring/.test(strip(app.rowsOf(app.top()).map((r) => r.text).join(' '))));
    app.top().cursor = rowIndex((r) => r.data?.keyring === 0); term.press('d'); term.press('return');
    check('d destroys a key from the keyring', !(g.state.keyring?.stacks ?? []).length);
  }
  home();
}

// Bulk: disenchant a band and learn every book, both as a list you switch rows off in, then G.
{
  const g = app.g;
  g.devLearnProfession('enchanting');
  const { isDisenchantable, disenchantRuleFor } = await import('../domain/professions/enchanting.ts');
  const green = ds.allItems().find((it) => it.quality === 2 && it.slot && it.slot !== 'bag' && isDisenchantable(it) && disenchantRuleFor(it, ds) && (it.itemLevel ?? 0) >= 15 && (it.itemLevel ?? 0) <= 25 && countItem(g.state.inventory, it.entry) === 0);
  g.state.inventory = addItem(g.state.inventory, green.entry, 1, 1);
  home(); app.switchTab(2); term.press('D'); show('disenchant all');
  check('D opens Disenchant all on the greens', app.top().id === 'bulk-de' && /Greens/.test(strip(frame())));
  const deRow = rowIndex((r, t) => t.includes(green.name));
  check('the green in the bags is listed', deRow > 0);
  app.top().cursor = deRow;
  if (!/^✓/.test(strip(app.rowsOf(app.top())[deRow].text))) term.press('return');
  term.press('G');
  check('G breaks it down into enchanting mats', countItem(g.state.inventory, green.entry) === 0 && app.log.some((l) => /You create/.test(strip(l))));
  term.press('tab'); check('Tab moves to the Blues band', /\[Blues/.test(strip(frame())));
  term.press('escape');
  const known = new Set(g.state.char.knownRecipes);
  const book = ds.allItems().find((it) => it.teachRecipe != null && ds.recipe(it.teachRecipe)?.skill === 'tailoring' && !known.has(it.teachRecipe) && (ds.recipe(it.teachRecipe)?.requiredSkill ?? 0) <= 75 && (it.requiredLevel ?? 0) <= g.state.char.level);
  if (book) {
    g.state.inventory = addItem(g.state.inventory, book.entry, 1, 1);
    term.press('L'); show('learn all');
    check('L opens Learn all with the pattern', app.top().id === 'learn-all' && rowIndex((r, t) => t.includes(book.name)) > 0);
    term.press('G');
    check('G learns it and eats the book', g.state.char.knownRecipes.includes(book.teachRecipe) && countItem(g.state.inventory, book.entry) === 0);
    term.press('escape');
  } else check('the data has a tailoring pattern to learn', false);
  home();
}

// Destroy several: X marks stacks and G destroys them after a yes; Q opens on the quest leftovers, already marked.
{
  const g = app.g;
  const { isRepeatableQuest, leftoverQuestItems } = await import('../domain/quests/questlog.ts');
  // Two grey items the bags do not already hold, so one stack each.
  const [linen, wool] = ds.allItems().filter((it) => it.quality === 0 && !it.slot && (it.stackable ?? 1) > 1 && countItem(g.state.inventory, it.entry) === 0).slice(0, 2);
  g.state.inventory = addItem(addItem(g.state.inventory, linen.entry, 3, 20), wool.entry, 2, 20);
  home(); app.switchTab(2); term.press('X'); show('destroy several');
  check('X opens Destroy with nothing marked', app.top().id === 'destroy-many' && /Nothing marked/.test(strip(frame())));
  for (const name of [linen.name, wool.name]) { app.top().cursor = rowIndex((r, t) => t.includes(name)); term.press('return'); }
  check('Enter marks two stacks', /2 stacks .* marked/.test(strip(frame())));
  term.press('G');
  check('G asks first', app.top().id === 'pick' && /Destroy 2 stacks/.test(strip(frame())));
  term.press('return');
  check('a yes destroys both marked stacks', countItem(g.state.inventory, linen.entry) === 0 && countItem(g.state.inventory, wool.entry) === 0 && app.top().id === 'destroy-many');
  term.press('escape');
  const open = new Set(g.state.questlog.quests.map((x) => x.entry));
  const q = ds.quests().find((d) => !isRepeatableQuest(d) && !open.has(d.entry) && d.itemTargets?.some((t) => ds.item(t.item)?.questItem) && !ds.quests().some((o) => o !== d && o.itemTargets?.some((t) => t.item === d.itemTargets[0].item)));
  const relic = q && q.itemTargets.find((t) => ds.item(t.item)?.questItem).item;
  if (relic) {
    g.state.questlog.quests.push({ entry: q.entry, status: 'turnedIn', kills: {}, objects: {} });
    g.state.inventory = addItem(g.state.inventory, relic, 1, 20);
    const left = leftoverQuestItems(g.state.questlog, g.state.inventory, (e) => ds.quest(e), (e) => ds.item(e), ds.quests());
    check('the turned-in quest leaves its item behind', left.some((r) => r.item === relic));
    term.press('Q'); show('quest leftovers');
    check('Q lists the leftover, marked', app.top().id === 'destroy-many' && rowIndex((r, t) => t.startsWith('✗') && t.includes(ds.item(relic).name)) > 0);
    term.press('G'); term.press('return');
    check('G and a yes destroy it', countItem(g.state.inventory, relic) === 0);
    term.press('escape');
  } else check('the data has a finished quest with a quest item to leave behind', false);
  home();
}

// Gear upkeep: durability on the slots, repair one piece, repair all, load ammo, auto consumables.
{
  const g = app.g;
  home(); app.switchTab(3);
  const worn = ['chest', 'legs', 'mainhand', 'feet'].find((sl) => g.state.char.equipped[sl] != null);
  g.state.char.durability = { ...(g.state.char.durability ?? {}), [worn]: 1 };
  g.state.char.gold += 100000;
  app.render(); show('gear with a worn piece');
  const slotRow = rowIndex((r) => r.data?.slot === worn);
  check('a worn-down slot shows its durability', / 1\/\d+/.test(strip(app.rowsOf(app.top())[slotRow].text)));
  check('the header corner shows gear durability beside the gold', /Dur \d+%/.test(strip(frame()).split('\n')[0]) && !/Dur 100%/.test(strip(frame()).split('\n')[0]));
  const quote = g.repairQuote();
  check('the Repair all row prices the bill', rowIndex((r, t) => t.startsWith('Repair all') && t.includes(strip(coinText(quote.cost)))) > 0);
  if (quote.vendorName) {
    app.top().cursor = slotRow; term.press('r');
    check('r on a slot repairs that piece', g.state.char.durability?.[worn] == null);
  } else check(`a repairer is in reach in ${g.state.char.zoneId}`, false);
  const bow = ds.allItems().find((it) => it.slot === 'ranged' && it.itemSubclass === 2 && (it.requiredLevel ?? 0) <= g.state.char.level && it.quality <= 2);
  const arrows = ds.allItems().find((it) => it.itemClass === 6 && it.itemSubclass === 2 && (it.requiredLevel ?? 0) <= g.state.char.level);
  g.state.inventory = addItem(addItem(g.state.inventory, bow.entry, 1, 1), arrows.entry, 200, arrows.stackable ?? 200);
  g.equip(bow.entry, 'ranged');
  app.render();
  app.top().cursor = rowIndex((r, t) => t.startsWith('Ammo')); term.press('return'); show('ammo picker');
  app.top().cursor = rowIndex((r, t) => t.includes(arrows.name)); term.press('return');
  check('Enter on Ammo loads arrows', g.state.char.ammoItem === arrows.entry);
  app.top().cursor = rowIndex((r, t) => t.startsWith('Ammo')); term.press('return');
  app.top().cursor = rowIndex((r, t) => t.trim() === 'No ammo'); term.press('return');
  check('and No ammo puts them away', g.state.char.ammoItem == null);
  const bread = ds.allItems().find((it) => it.consumable?.effect === 'food' && (it.requiredLevel ?? 0) <= g.state.char.level && !it.useBuff);
  g.state.inventory = addItem(g.state.inventory, bread.entry, 5, bread.stackable ?? 20);
  app.render();
  app.top().cursor = rowIndex((r, t) => t.startsWith('Auto use')); term.press('return'); show('auto consumables');
  check('Auto use opens the auto consumables list', app.top().id === 'auto-cons');
  app.top().cursor = rowIndex((r, t) => t.includes(bread.name)); term.press('return');
  check('Enter sets a food to eat on its own', g.state.char.autoConsumables?.food === bread.entry);
  term.press('return');
  check('Enter again takes it off', g.state.char.autoConsumables?.food !== bread.entry);
  home();
}

// Outfitter: save what is worn, wear it back after taking a piece off, edit slots, build for a stat, delete.
{
  const g = app.g;
  const typeLine = (text) => { for (const ch of text) term.press(ch === ' ' ? 'space' : ch); term.press('return'); };
  const outfitRow = (name) => rowIndex((r) => r.data?.outfit?.name === name);
  home(); app.switchTab(3); term.press('o'); show('outfitter');
  check('o on Gear opens the Outfitter', app.top().id === 'outfitter');
  term.press('n'); typeLine('Kit');
  check('n saves what is worn as an outfit', g.outfitterState().outfits.some((o) => o.name === 'Kit'));
  const chest = g.state.char.equipped.chest;
  term.press('escape');
  g.unequip('chest');
  term.press('o');
  app.top().cursor = outfitRow('Kit'); term.press('return'); show('outfit worn');
  check('Enter on the outfit puts the missing piece back on', g.state.char.equipped.chest != null && JSON.stringify(g.state.char.equipped.chest) === JSON.stringify(chest));
  app.top().cursor = outfitRow('Kit'); term.press('e'); show('outfit slots');
  check('e lists the outfit slots', app.top().id === 'outfit-slots' && /Chest/.test(strip(frame())));
  app.top().cursor = rowIndex((r, t) => /Chest/.test(t)); term.press('return');
  const kit = () => g.outfitterState().outfits.find((o) => o.name === 'Kit');
  check('Enter drops a slot from the set', !kit().items.chest);
  term.press('escape');
  term.press('N'); app.top().cursor = rowIndex((r, t) => /Stamina$/.test(t)); term.press('return');
  check('N builds an outfit for a stat', g.outfitterState().outfits.some((o) => o.statId === 'sta'));
  app.top().cursor = outfitRow('Kit'); term.press('x'); term.press('return');
  check('x deletes an outfit after a yes', !kit());
  home();
}

// Settings: auto-loot, helper mode, auto-disenchant on both layers, junk boxes and lists, gather colours.
{
  const g = app.g;
  const row = (re) => rowIndex((r, t) => re.test(t));
  const enter = (re) => { app.top().cursor = row(re); term.press('return'); };
  home(); term.press(':'); for (const ch of 'settings') term.press(ch); term.press('return'); show('settings');
  check(':settings opens the Settings window', app.top().id === 'settings');
  enter(/^Auto-loot/); check('Enter flips auto-loot', app.prefs.get('autoLoot') === false); enter(/^Auto-loot/);
  enter(/^Upgrades/); check('Enter switches the helper to put upgrades on', g.equipmentHelperConfig().mode === 'auto'); enter(/^Upgrades/);
  enter(/^This character/); check('this character disenchants greens on its own', g.characterAutoDisenchantConfig().enabled && g.characterAutoDisenchantConfig().maxQuality === 2);
  enter(/^Every character/); check('the every-character layer lands in the prefs file', app.prefs.get('autoDisenchant')?.enabled === true);
  enter(/sell Common$/); check('a sell box edits the shared junk rules', g.globalJunkFilterConfig().sellQuality[1] === true && app.prefs.get('junkFilter')?.sellQuality?.[1] === true);
  enter(/^Rules/); check('Rules gives this character its own junk rules', g.characterJunkFilterConfig().characterSpecific === true);
  enter(/destroy Poor$/); check('edits then land on the character layer', g.characterJunkFilterConfig().destroyQuality[0] === true && !g.globalJunkFilterConfig().destroyQuality[0]);
  enter(/^ *. gray$/); check('a gather colour box flips', g.gatherFilterConfig().takeColor.gray === true);
  term.press('escape');
  app.switchTab(2);
  const st = g.state.inventory.stacks[0];
  app.top().cursor = rowIndex((r) => r.data === st); term.press('m');
  app.top().cursor = rowIndex((r, t) => t === 'Always keep'); term.press('return');
  check('the bag item menu puts an item on the keep list', g.characterJunkFilterConfig().keepEntries.includes(st.item));
  // Back to the defaults so nothing after this runs under these rules.
  g.setCharacterAutoDisenchantConfig({ enabled: false, maxQuality: 2, protectCompanionUpgrades: true });
  g.setCharacterJunkFilterConfig({ ...g.characterJunkFilterConfig(), characterSpecific: false, keepEntries: [], destroyQuality: { 0: false, 1: false, 2: false, 3: false, 4: false } });
  app.prefs.set('autoDisenchant', undefined); app.prefs.set('junkFilter', undefined);
  home();
}

// Action bars: bind a key, the fight's number row fires it; add and remove a bar; the global bar fills and fires.
{
  const g = app.g;
  const typeLine = (text) => { for (const ch of text) term.press(ch === ' ' ? 'space' : ch); term.press('return'); };
  home(); term.press('5'); term.press('b');
  const slotRow = (b, i) => rowIndex((r) => r.data?.b === b && r.data?.i === i);
  app.top().cursor = slotRow(0, 4); term.press('return');
  // The engine de-dupes across bars: placing Heroic Strike here moves it from slot 1.
  const spellName = ds.spell(78).name;
  const pickRow = rowIndex((r, t) => t.trim().replace(/ \(Rank \d+\)$/, '') === spellName);
  app.top().cursor = pickRow; term.press('return');
  check('Enter fills a bar slot with a spell on the page for the current form', visibleBars(g)[0].slots[4] === 78);
  app.top().cursor = slotRow(0, 4); term.press('k'); typeLine('7');
  check('k binds a key to the slot', g.state.actionBars[0].keys[4] === '7');
  const bars = g.state.actionBars.length;
  term.press('+'); check('+ adds a bar', g.state.actionBars.length === bars + 1);
  term.press('-'); check('- removes it again', g.state.actionBars.length === bars);
  const potion = ds.allItems().find((it) => it.useInCombat?.effect === 'restore_health' && (it.requiredLevel ?? 0) <= g.state.char.level);
  g.state.inventory = addItem(g.state.inventory, potion.entry, 3, potion.stackable ?? 5);
  app.top().cursor = rowIndex((r, t) => /^\d+\s+empty$/.test(t.trim()) && !('b' in (r.data ?? {}))); term.press('return');
  app.top().cursor = rowIndex((r, t) => t.trim() === potion.name); term.press('return');
  check('a global bar slot takes a bag item', (g.state.globalActionBar?.items ?? []).includes(potion.entry));
  g.state.char.health = Math.max(1, Math.floor(g.state.char.health / 2));
  const potions = countItem(g.state.inventory, potion.entry);
  // The kobold fight above may have drunk one, and the potion cooldown runs on the wall clock now.
  g.state.spellCooldowns = {}; g.state.categoryCooldowns = {};
  app.top().cursor = rowIndex((r, t) => /Fire the whole global bar/.test(t)); term.press('return');
  check('firing the global bar drinks the potion', countItem(g.state.inventory, potion.entry) === potions - 1);
  app.top().cursor = rowIndex((r, t) => t.includes(potion.name) && !('b' in (r.data ?? {}))); term.press('return');
  app.top().cursor = rowIndex((r, t) => t.trim() === 'Clear'); term.press('return');
  check('Clear empties the global slot', !(g.state.globalActionBar?.items ?? []).includes(potion.entry));
  term.press('escape'); home(); term.press('1');
  g.state.char.health = Math.max(1, Math.floor(g.state.char.health / 2));
  const mob = app.rowsOf(app.top()).findIndex((r) => r.data?.creature);
  if (mob >= 0) {
    app.top().cursor = mob; term.press('return');
    const row = app.fight?.abilityBar() ?? [];
    check('the fight number row fires the bound key', row.some((x) => x.key === '7' && x.label === spellName));
    finishFight();
  } else check('a creature to fight for the bar check', false);
  home();
}

// Macros: write one line by line, see what it would do, account macros in the prefs file, a template, fire it in a fight.
{
  const g = app.g;
  const typeLine = (text) => { for (const ch of text) term.press(ch === ' ' ? 'space' : ch); term.press('return'); };
  home(); term.press('5'); term.press('m'); show('macros');
  check('m on Spells opens the macros', app.top().id === 'macros');
  app.top().cursor = rowIndex((r, t) => t === '+ New macro'); term.press('return'); typeLine('Strike');
  check('a new macro opens in the editor', app.top().id === 'macro-edit' && g.macroByName('Strike') != null);
  app.top().cursor = rowIndex((r, t) => t === '+ Add a line'); term.press('return'); typeLine('/cast Heroic Strike');
  show('macro editor');
  check('a line goes into the body', g.macroByName('Strike').body.trim() === '/cast Heroic Strike');
  check('the editor says what a press would do', /casts Heroic Strike/.test(strip(frame())));
  app.top().cursor = rowIndex((r) => r.data?.line === 0); term.press('o'); typeLine('/cast Battle Shout');
  check('o adds a line under it', g.macroByName('Strike').body.split('\n').length === 2);
  app.top().cursor = rowIndex((r) => r.data?.line === 1); term.press('x');
  check('x deletes a line', g.macroByName('Strike').body.split('\n').length === 1);
  term.press('escape');
  const acc = g.saveMacro('account', { name: 'Shared', body: '/cast Battle Shout' });
  check('an account macro is kept in the prefs file', acc.ok && (app.prefs.get('accountMacros') ?? []).some((m) => m.name === 'Shared'));
  const before = g.macros().length;
  term.press('T'); term.press('return');
  check('T adds a template macro', g.macros().length > before);
  home();
  const strike = g.macroByName('Strike');
  g.setMacroActionSlot(0, 7, strike.id); g.setActionKey(0, 7, '8');
  term.press('1');
  const mob = app.rowsOf(app.top()).findIndex((r) => r.data?.creature);
  if (mob >= 0) {
    app.top().cursor = mob; term.press('return');
    check('a macro on bar 1 shows on the fight number row', (app.fight?.abilityBar() ?? []).some((x) => x.key === '8' && x.macro === strike.id));
    term.press('8');
    check('its key queues the macro cast', app.fight?.pressed === 78);
    finishFight();
  } else check('a creature for the macro fight', false);
  home();
}

// Cancel an aura: from the Character tab's stats page, and with c inside a fight.
{
  const g = app.g;
  const fort = ds.spell(1243);
  const give = () => { g.state.char.activeAuras = [...(g.state.char.activeAuras ?? []).filter((x) => x.spellId !== 1243), { spellId: 1243, expiresAt: Date.now() + 600000 }]; };
  give();
  home(); app.switchTab(3); term.press('s'); show('character auras');
  const at = rowIndex((r, t) => t.includes(fort.name));
  check('the stats page lists your auras', at > 0);
  app.top().cursor = at; term.press('return');
  check('Enter on a buff cancels it', !(g.state.char.activeAuras ?? []).some((x) => x.spellId === 1243));
  give(); home(); term.press('1');
  const mob = app.rowsOf(app.top()).findIndex((r) => r.data?.creature);
  app.top().cursor = mob; term.press('return');
  if (app.fight && app.fight.session.playerView().buffs.some((b) => b.spellId === 1243)) {
    term.press('c');
    check('c in a fight lists the buffs you can cancel', app.top()?.title === 'Cancel which buff?');
    app.top().cursor = rowIndex((r, t) => t.includes(fort.name)); term.press('return');
    check('picking one cancels it in the fight', !app.fight.session.playerView().buffs.some((b) => b.spellId === 1243) && !app.stack.length);
  } else check('the buff carries into the fight', false);
  finishFight(); home();
}

// Pick pocket: a rogue in Stealth presses P on a humanoid; the pocket empties, or a resist starts the fight.
{
  const term3 = new HeadlessTerm(110, 34);
  const app3 = new App({ term: term3, ds, repo });
  term3.open();
  app3.startGame(newGameState(ds, human.id, 4, 'Picktest', 77, 0), 'picktest', Date.now(), true);
  const g3 = app3.g;
  g3.state.char.level = 10;
  g3.state.spellbook = { known: [...g3.state.spellbook.known, 921, 1784] };
  g3.state.char.power = 100;
  const at = (pred) => app3.rowsOf(app3.top()).findIndex((r) => !r.header && pred(r, strip(r.text)));
  const { pickpocketLootKey } = await import('../domain/professions/pickpocket.ts');
  const mark = at((r) => r.data?.creature && ds.lootTable(pickpocketLootKey(r.data.creature.entry)).length > 0);
  check('Elwynn has a creature with pockets to pick', mark > 0);
  if (mark > 0) {
    const cr = app3.rowsOf(app3.top())[mark].data.creature;
    app3.top().cursor = mark; term3.press('P');
    check('P outside Stealth is refused', !app3.fight && app3.log.some((l) => /stealth/i.test(strip(l))));
    const st = g3.castOutOfCombat(1784);
    app3.render();
    check('in Stealth the creature row offers P', /P: pick pocket/.test(strip(app3.rowsOf(app3.top())[mark].text)));
    g3.state.char.power = 100;
    term3.press('P');
    const picked = !!g3.state.pickpocketRestock?.[`${g3.state.char.zoneId}:${cr.entry}`];
    check(`P picks the pocket or a resist starts the fight (stealth cast ${st.ok ? 'ok' : st.reason})`, picked || !!app3.fight);
    while (app3.fight) app3.fight.tick();
  }
  term3.close?.();
}

// Your rotation profiles: add a copy, rename it, switch between them, delete one.
{
  const g = app.g;
  const typeLine = (text) => { for (const ch of text) term.press(ch === ' ' ? 'space' : ch); term.press('return'); };
  const pickRow = (re) => { app.top().cursor = rowIndex((r, t) => re.test(t)); term.press('return'); };
  home(); term.press('6');
  const n0 = g.rotationProfiles().length;
  term.press('p'); pickRow(/New rotation \(a copy/); typeLine('Aoe');
  check('p adds a rotation profile and plays it', g.rotationProfiles().length === n0 + 1 && g.rotationProfiles().find((x) => x.active)?.name === 'Aoe');
  term.press('p'); pickRow(/^Rename this one/); for (let i = 0; i < 3; i++) term.press('backspace'); typeLine('Cleave');
  check('it can be renamed', g.rotationProfiles().some((x) => x.name === 'Cleave'));
  const other = g.rotationProfiles().find((x) => !x.active);
  term.press('p'); pickRow(new RegExp(`^\s*${other.name}$`));
  check('another profile can be picked', g.rotationProfiles().find((x) => x.active)?.id === other.id);
  term.press('p'); pickRow(/Cleave/); term.press('p'); pickRow(/^Delete this one/); term.press('return');
  check('and deleted', !g.rotationProfiles().some((x) => x.name === 'Cleave') && g.rotationProfiles().length === n0);
  home();
}

// Talent builds: a premade spec, save it, respec, put the saved build back, paste a string, delete the build.
{
  const g = app.g;
  const typeLine = (text) => { for (const ch of text) term.press(ch === ' ' ? 'space' : ch); term.press('return'); };
  const pickRow = (re) => { app.top().cursor = rowIndex((r, t) => re.test(t)); term.press('return'); };
  const spent = () => Object.values(g.state.char.talents ?? {}).reduce((n, v) => n + v, 0);
  const { talentLinkFromTalents } = await import('../domain/character/talentLink.ts');
  const link = () => talentLinkFromTalents(g.state.char.talents ?? {}, g.state.char.cls, ds);
  g.state.char.gold += 1_000_000;
  home(); term.press('7'); term.press('B'); show('talent builds');
  check('B on Talents lists the premade specs', app.top().title === 'Talent builds' && /premade/.test(strip(frame())));
  pickRow(/premade/); if (app.top()?.id === 'pick' && /respec/.test(app.top().title)) term.press('return');
  const premade = link();
  check('a premade spec spends the points', spent() > 0 && premade.length > 0);
  term.press('B'); pickRow(/^Save my talents/); typeLine('Mine');
  check('the current talents save as a build', (g.state.talentBuilds ?? []).some((b) => b.name === 'Mine' && b.link === premade));
  g.respec();
  check('a respec empties the tree', spent() === 0);
  term.press('B'); pickRow(/saved\s+Mine/); pickRow(/^Use this build/);
  check('the saved build goes back on', link() === premade);
  g.respec();
  term.press('B'); pickRow(/^Paste a talent string/); typeLine(premade);
  check('a pasted talent string is applied', link() === premade);
  term.press('B'); pickRow(/saved\s+Mine/); pickRow(/^Delete it/); term.press('return');
  check('a saved build can be deleted', !(g.state.talentBuilds ?? []).some((b) => b.name === 'Mine'));
  home();
}

// Target dummy: D on the Rotation tab parses the rotation; the report names DPS and the abilities that did damage.
{
  home(); term.press('6'); term.press('D'); show('target dummy');
  check('D on Rotation opens the target dummy', app.top().id === 'sim-lab');
  app.top().cursor = rowIndex((r, t) => /^Fights/.test(t));
  while (app.top().sim.iterations !== 20) term.press('return');
  app.top().cursor = rowIndex((r, t) => /^Dummy/.test(t));
  while (app.top().sim.entry !== 2673) term.press('return');
  term.press('G');
  const sim = app.top().sim;
  while (!sim.run.done) sim.run.step(1000);
  sim.report = sim.run.report();
  app.render(); show('dummy parse');
  check('the parse reports DPS', sim.report.dps.avg > 0 && /DPS/.test(strip(frame())));
  check('and which abilities did the damage', sim.report.abilities.length > 0 && rowIndex(() => true) >= 0 && app.rowsOf(app.top()).some((r) => strip(r.text).startsWith(sim.report.abilities[0].name)));
  home();
}

// Autopilot settings: a switch, a choice, a percentage and a count, each through the form.
{
  const g = app.g;
  const typeLine = (text) => { for (const ch of text) term.press(ch === ' ' ? 'space' : ch); term.press('return'); };
  const field = (key) => { app.top().cursor = rowIndex((r) => r.data?.key === key); };
  home(); term.press(':'); for (const ch of 'autopilot') term.press(ch); term.press('return'); show('autopilot settings');
  check(':autopilot opens the autopilot settings', app.top().id === 'autopilot-settings');
  const before = g.autopilotConfig();
  field('autoGather'); term.press('return');
  check('Enter flips a switch', g.autopilotConfig().autoGather === !before.autoGather);
  field('aoeMode'); term.press('return');
  check('Enter steps a choice', g.autopilotConfig().aoeMode !== before.aoeMode);
  field('healthEnterPct'); term.press('return'); for (let i = 0; i < 4; i++) term.press('backspace'); typeLine('60');
  check('a percentage is typed in', Math.abs(g.autopilotConfig().healthEnterPct - 0.6) < 1e-9);
  field('pullNormalCount'); term.press('return'); term.press('backspace'); typeLine('3');
  check('a count is typed in', g.autopilotConfig().pullNormalCount === 3);
  field('pullNormalCount'); term.press('return'); term.press('backspace'); typeLine('99');
  check('an out-of-range number is refused', g.autopilotConfig().pullNormalCount === 3);
  g.setAutopilotConfig(before);
  home();
}

// The Travel tab's detail pane carries the world map (tuiMap.mjs): the terrain as half-block cells, you and the
// destination pinned on it, the planned route dotted between them.
{
  home(); term.press('8');
  const here = app.g.state.char.zoneId;
  const dest = (ds.zone(here)?.neighbors ?? []).map((id) => ds.zone(id)).find((z) => z && app.g.previewTravel(z.id).ok);
  app.top().cursor = rowIndex((r, t) => t.startsWith(dest.name)); app.render();
  const pane = strip(frame()).split('\n').map((l) => l.split('│')[1] ?? '').join('\n');
  check('the Travel tab draws the world map under a destination, you pinned on it', /▀/.test(pane) && pane.includes('●') && /you .*destination/.test(pane));
  const far = ds.zones().find((z) => z.continent !== ds.zone(here).continent && app.g.previewTravel(z.id).ok);
  const lines = worldMapLines(app, { dest: far, legs: app.g.previewTravel(far.id).legs, maxCols: 60, maxRows: 24 });
  check('a trip to the other continent draws its route, every line inside the room given', lines.length === 24 && lines.every((l) => vis(l) <= 60) && lines.slice(0, -1).join('').includes('·') && lines.join('').includes('◆'));
  home();
}

// Real-time travel: with a 1x pace a trip takes time; the header counts down, the World tab carries the journey
// card (speed, pause, arrive now, turn back), and the game loop lands it.
{
  const g = app.g;
  const pickRow = (re) => { app.top().cursor = rowIndex((r, t) => re.test(t)); term.press('return'); };
  home(); term.press(':'); for (const ch of 'settings') term.press(ch); term.press('return');
  pickRow(/^Travel pace/);
  check('Settings sets a real-time travel pace', app.prefs.get('travelPace') === 1);
  pickRow(/^Screen refresh/);
  check('Settings steps the screen refresh up from 100 ms', app.prefs.get('refreshMs') === 250);
  // On a real terminal a game loop's repaint waits out the refresh; a key's render paints at once and drops it.
  term.isTTY = true;
  app.render(); const painted = term.frames;
  app.renderSoon(); app.renderSoon();
  check('renderSoon holds a repaint inside the refresh window', term.frames === painted && app.paintTimer != null);
  app.render();
  check('render paints and cancels the held repaint', term.frames === painted + 1 && app.paintTimer == null);
  term.isTTY = false;
  app.prefs.set('refreshMs', 100);
  home();
  const here = g.state.char.zoneId;
  const dest = (ds.zone(here)?.neighbors ?? []).map((id) => ds.zone(id)).find((z) => z && g.previewTravel(z.id).ok);
  term.press('8'); app.top().cursor = rowIndex((r, t) => t.startsWith(dest.name)); term.press('return');
  show('on the road');
  check('a trip at 1x takes time', !!g.state.char.journey && g.state.char.zoneId !== dest.id);
  check('the header counts it down', strip(frame()).split('\n')[0].includes(`→ ${dest.name}`));
  check('the Travel tab stays open, on the journey card', app.tab === 7 && /On the road to/.test(strip(frame())));
  term.press('1'); check('the World tab carries the card too', /On the road to/.test(strip(frame()))); term.press('8');
  app.top().cursor = rowIndex((r, t) => /journey options/.test(t)); term.press('return');
  pickRow(/^Travel at 4x/);
  check('the trip can be sped up', g.journeyStatus()?.timeScale === 4);
  app.top().cursor = rowIndex((r, t) => /journey options/.test(t)); term.press('return'); pickRow(/^Turn back/);
  check('and turned back', !g.state.char.journey);
  term.press('8'); app.top().cursor = rowIndex((r, t) => t.startsWith(dest.name)); term.press('return');
  app.top().cursor = rowIndex((r, t) => /journey options/.test(t)); term.press('return'); pickRow(/^Arrive now/);
  check('Arrive now lands it at once', !g.state.char.journey && g.state.char.zoneId === dest.id);
  term.press('8'); app.top().cursor = rowIndex((r, t) => t.startsWith(ds.zone(here).name)); term.press('return');
  g.journeyTick(Date.now() + 24 * 3600_000);
  check('the clock running out lands the trip too', !g.state.char.journey && g.state.char.zoneId === here);
  app.prefs.set('travelPace', 'instant');
  home();
}

// Offline rest: a save last written eight hours ago comes back with rested xp.
{
  const term4 = new HeadlessTerm(110, 34);
  const app4 = new App({ term: term4, ds, repo });
  term4.open();
  const st = newGameState(ds, human.id, 1, 'Resttest', 5, 0);
  st.char.level = 10; st.char.restedXp = 0;
  app4.startGame(st, 'resttest', Date.now() - 9 * 3600_000, false, Date.now() - 8 * 3600_000);
  check('time away is rested xp on load', (app4.g.state.char.restedXp ?? 0) > 0 && app4.log.some((l) => /You were away 8 h\. \+\d+ rested xp/.test(strip(l))));
  term4.close?.();
}

// Riding: an instructor teaches Apprentice Riding, a mount in the bags puts you on and takes you off.
{
  const g = app.g;
  const { isMountItem } = await import('./tuiWorld.mjs');
  const keep = { level: g.state.char.level, zone: g.state.char.zoneId };
  g.state.char.level = 40; g.state.char.gold += 2_000_000;
  const rz = ds.zones().find((z) => (z.ridingTrainers ?? []).some((e) => ds.creature(e) && g.previewTravel(z.id).ok) && (z.faction ?? 'Alliance') !== 'Horde');
  g.state.char.zoneId = rz.id;
  home(); term.press('1');
  const instructor = rowIndex((r, t) => /<Riding Instructor>/.test(t));
  check(`${rz.name} lists a riding instructor`, instructor > 0);
  app.top().cursor = instructor; term.press('return'); show('riding instructor');
  app.top().cursor = rowIndex((r, t) => /^Riding 75/.test(t)); term.press('return');
  check('Enter on a rank teaches riding', (g.state.char.ridingSkill ?? 0) >= 75);
  const horse = ds.allItems().find((it) => isMountItem(it) && (it.requiredLevel ?? 0) <= 40 && (!it.allowRace?.length || it.allowRace.includes(g.state.char.race)) && (it.requiredSkillRank ?? 0) <= 75);
  g.state.inventory = addItem(g.state.inventory, horse.entry, 1, 1);
  app.switchTab(2); app.top().cursor = rowIndex((r) => r.data?.item === horse.entry); term.press('return');
  check('Enter on a mount in the bags mounts it', g.state.char.mountedItem === horse.entry && /mounted/.test(strip(frame()).split('\n')[0]));
  term.press('return');
  check('and Enter again gets off', g.state.char.mountedItem == null);
  g.state.char.level = keep.level; g.state.char.zoneId = keep.zone;
  home();
}

// World objects: a chest opens into the loot window, a poster offers its quest, a book pages.
{
  const g = app.g;
  const keep = g.state.char.zoneId;
  g.state.char.zoneId = 'elwynn';
  home(); term.press('1');
  const chest = rowIndex((r) => r.data?.object?.name === 'Battered Chest');
  check('Elwynn lists objects with a chest', chest > 0);
  app.top().cursor = chest; app.render(); show('chest row');
  check('the Battered Chest row draws the chest in the detail pane', !objectArt(259, 20, 10) || /[▀▄]/.test(frame()));
  if (objectArt(310, 9, 5)) {
    const { holdNewArt } = await import('./sixel.mjs');
    const held = holdNewArt(() => objectArt(310, 11, 7));
    check('a picture not made before is held back while the cursor moves', held.value === null && held.missed);
    objectArt(310, 11, 7);
    check('one made before is drawn at once', !!holdNewArt(() => objectArt(310, 11, 7)).value);
  }
  app.prefs.set('autoLoot', false);
  app.top().cursor = chest; term.press('return'); show('chest opened');
  check('Enter on a chest opens it', app.top()?.id === 'loot' || app.log.some((l) => /Battered Chest/.test(strip(l))));
  if (app.top()?.id === 'loot') term.press('a');
  app.prefs.set('autoLoot', true);
  home(); term.press('1');
  const poster = rowIndex((r, t) => r.data?.object && t.startsWith('! '));
  if (poster > 0) {
    app.top().cursor = poster; term.press('return');
    check('a quest object offers its quest', app.top()?.id === 'pick' && /!/.test(strip(frame())));
    term.press('escape');
  }
  // Readable pages are baked for dungeon books; the reader is the same window wherever the book stands.
  const { pageText } = await import('../data/pageTexts.ts');
  const { bookDialog } = await import('./tuiWorld.mjs');
  let first = null;
  for (let id = 1; id < 5000 && first == null; id++) { const p = pageText(id); if (p?.next) first = id; }
  if (first != null) {
    app.push(bookDialog(app, 'A book', first)); show('book');
    check('a book opens on its first page', app.top()?.id === 'book' && /page 1 of/.test(strip(frame())));
    app.top().cursor = rowIndex((r, t) => t === 'Next page'); term.press('return');
    check('Next page turns it', /page 2 of/.test(strip(frame())));
    term.press('b'); check('b goes back a page', /page 1 of/.test(strip(frame())));
    term.press('escape');
  } else check('the data has a book with two pages', false);
  g.state.char.zoneId = keep;
  home();
}

// Quests: the next quest in a chain opens after a turn-in, gray quests go in one press, a bag item starts a quest.
{
  const term5 = new HeadlessTerm(110, 34);
  const app5 = new App({ term: term5, ds, repo });
  term5.open();
  app5.startGame(newGameState(ds, human.id, 1, 'Chaintest', 11, 0), 'chaintest', Date.now(), true);
  const g5 = app5.g;
  const at = (pred) => app5.rowsOf(app5.top()).findIndex((r) => !r.header && pred(r, strip(r.text)));
  const { offeredQuests, chainFollowUpOffer } = await import('../quests/quests.ts');
  // A Threat Within (speak to the Marshal) leads to Kobold Camp Cleanup: talk to him, then hand it in through the quest window.
  let chained = ds.quest(783);
  if (!g5.acceptQuest(783).ok) chained = null;
  else g5.talkToNpc({ npcName: chained.enderName });
  if (chained) {
    app5.switchTab(1); app5.render();
    app5.top().cursor = at((r) => r.data?.q?.entry === chained.entry); term5.press('return');
    app5.top().cursor = at((r, t) => t === 'Complete the quest'); term5.press('return');
    if (app5.top()?.id === 'pick') term5.press('return');
    const next = g5.state.questlog.quests.find((x) => x.entry === chained.entry)?.status === 'turnedIn' || !g5.state.questlog.quests.some((x) => x.entry === chained.entry);
    check(`turning in ${chained.title} opens the next quest in the chain`, next && /^quest-/.test(app5.top()?.id ?? '') && app5.top().id !== `quest-${chained.entry}`);
  } else check('Northshire has a talk quest with a follow-up', false);
  app5.stack = [];
  // Gray quests: at level 30 the Northshire quests are gray.
  const o = offeredQuests(ds, g5.state.char.zoneId, g5.state.char, g5.state.questlog).find((x) => x.canAccept);
  if (o && g5.acceptQuest(o.quest.entry).ok) {
    g5.state.char.level = 30;
    app5.switchTab(1); term5.press('G'); term5.press('return');
    check('G abandons the gray quests', !g5.state.questlog.quests.some((x) => x.entry === o.quest.entry && x.status === 'active'));
    g5.state.char.level = 1;
  }
  const { bagQuestStartState } = await import('../quests/quests.ts');
  const starter = ds.allItems().filter((it) => (it.startQuest ?? 0) > 0).find((it) => {
    const inv = addItem(g5.state.inventory, it.entry, 1, 1);
    return bagQuestStartState(ds, g5.state.char, g5.state.questlog, inv, it.entry)?.kind === 'offer';
  });
  if (starter) {
    g5.state.inventory = addItem(g5.state.inventory, starter.entry, 1, 1);
    app5.switchTab(2); app5.render();
    app5.top().cursor = at((r) => r.data?.item === starter.entry); term5.press('return');
    check(`${starter.name} in the bags opens its quest`, app5.top()?.id === `quest-${starter.startQuest}`);
    app5.top().cursor = at((r, t) => t === 'Accept the quest'); term5.press('return');
    check('and the quest can be accepted from it', g5.state.questlog.quests.some((x) => x.entry === starter.startQuest));
  } else check('the data has an item that starts a quest', false);
  term5.close?.();
}

// Reputation: the window lists factions by group; watch one on the xp bar, declare war on one that allows it.
{
  const g = app.g;
  const pickRow = (re) => { app.top().cursor = rowIndex((r, t) => re.test(t)); term.press('return'); };
  // A neutral faction you have met (Booty Bay) can be declared war on; the home cities cannot.
  g.state.char.reputations = { ...(g.state.char.reputations ?? {}), 21: g.state.char.reputations?.[21] ?? 0 };
  home(); term.press(':'); for (const ch of 'rep') term.press(ch); term.press('return'); show('reputation');
  check(':rep opens the reputation window', app.top().id === 'reputation');
  const first = rowIndex((r) => r.data?.faction);
  check('it lists factions', first > 0);
  const f = app.rowsOf(app.top())[first].data.faction;
  app.top().cursor = first; term.press('return'); pickRow(/^Watch it/);
  check('Enter watches a faction', g.state.char.watchedFaction === f.id);
  const rows = app.rowsOf(app.top()).filter((r) => r.data?.faction);
  let warred = null;
  for (const r of rows) {
    app.top().cursor = rowIndex((x) => x.data?.faction === r.data.faction); term.press('return');
    const war = rowIndex((x, t) => /Declare war/.test(t));
    if (war >= 0) { app.top().cursor = war; term.press('return'); warred = r.data.faction; break; }
    term.press('escape');
  }
  check('a faction that allows it can be declared war on', warred != null && g.atWarFactions().has(warred.id));
  if (warred) g.setFactionAtWar(warred.id, false);
  g.setWatchedFaction(0);
  home();
}

// Meeting stone: the stone by the Deadmines queues you for it; the World tab carries the queue card until you leave.
{
  const g = app.g;
  const keep = g.state.char.zoneId;
  g.state.char.zoneId = 'westfall';
  home(); term.press('1');
  const stone = rowIndex((r) => r.data?.object?.meetingstone);
  check('Westfall lists the Deadmines meeting stone', stone > 0);
  if (stone > 0) {
    app.top().cursor = stone; term.press('return'); show('meeting stone');
    app.top().cursor = rowIndex((r, t) => /^Join the queue/.test(t)); term.press('return');
    check('the stone queues you', g.state.meetingStoneQueue?.status === 1);
    check('the World tab shows the queue card', /Looking for more for/.test(strip(frame())));
    app.top().cursor = rowIndex((r, t) => /Looking for more/.test(t)); term.press('return');
    check('Enter on the card leaves the queue', !g.state.meetingStoneQueue);
  }
  g.state.char.zoneId = keep;
  home();
}

// Repeat a fight: r in a plain fight pulls the same creature again after each win, until r again or Esc.
{
  const g = app.g;
  const { farmNext } = await import('./tuiFight.mjs');
  home(); term.press('1');
  g.state.char.health = 100000; app.idleTick(600, true);
  const mob = app.rowsOf(app.top()).findIndex((r) => r.data?.creature);
  const entry = app.rowsOf(app.top())[mob].data.creature.entry;
  app.top().cursor = mob; term.press('return');
  term.press('r');
  check('r marks the fight to repeat', app.farmEntry === entry && /stop repeating/.test(app.fight.hint()));
  finishFight();
  farmNext(app);
  check('a won repeat fight pulls the same creature again', !!app.fight && app.fight.enemyEntry === entry);
  term.press('r');
  check('r again stops the repeats', app.farmEntry == null);
  finishFight(); farmNext(app);
  check('and no new fight starts', !app.fight);
  home();
}

// Profession specialisation: a leatherworker who did the Dragonscale quest learns it from Peter Galen in Azshara.
{
  const term6 = new HeadlessTerm(110, 34);
  const app6 = new App({ term: term6, ds, repo });
  term6.open();
  app6.startGame(newGameState(ds, human.id, 1, 'Leathertest', 13, 0), 'leathertest', Date.now(), true);
  const g6 = app6.g;
  g6.state.char.level = 60; g6.state.char.gold = 10_000_000;
  g6.devLearnProfession('leatherworking');
  g6.state.questlog.quests.push({ entry: 5141, status: 'turnedIn', progress: {} });
  g6.state.char.zoneId = 'azshara'; app6.render();
  const at = (pred) => app6.rowsOf(app6.top()).findIndex((r) => !r.header && pred(r, strip(r.text)));
  app6.top().cursor = at((r, t) => t.startsWith('Peter Galen')); term6.press('return');
  if (showFrames) console.log(`\n=== leather trainer ===\n${term6.text()}`);
  const row = at((r, t) => /Become a specialist/.test(t));
  check('the trainer offers Dragonscale Leatherworking', row >= 0);
  if (row >= 0) {
    app6.top().cursor = row; term6.press('return');
    check('Enter makes you a Dragonscale leatherworker', g6.state.spellbook.known.includes(10656));
  }
  term6.close?.();
}

// Mail to your own characters: a letter with an item lands in the other save; they send it back. Bank bags and deposit-all.
{
  const { toSave, summarize } = await import('../persistence/saveShape.ts');
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const store = new Map();
  const repo7 = {
    async list() { return [...store.values()].map(summarize); },
    async load(slot) { const s = store.get(slot); return s ? structuredClone(s) : null; },
    async save(save) { store.set(save.slot, structuredClone(save)); },
  };
  const now = Date.now();
  store.set('alt', toSave('alt', newGameState(ds, human.id, 1, 'Alttest', 21, 0), now, now));
  const term7 = new HeadlessTerm(110, 34);
  const app7 = new App({ term: term7, ds, repo: repo7 });
  term7.open();
  const main = newGameState(ds, human.id, 1, 'Mailtest', 22, 0);
  app7.startGame(main, 'main', now, true);
  await repo7.save(toSave('main', app7.g.snapshot(), now, now));
  const g7 = app7.g;
  g7.state.char.gold = 100000; g7.state.char.zoneId = 'stormwind';
  const linen = ds.allItems().find((it) => it.name === 'Linen Cloth');
  g7.state.inventory = addItem(g7.state.inventory, linen.entry, 7, linen.stackable);
  const at = (pred) => app7.rowsOf(app7.top()).findIndex((r) => !r.header && pred(r, strip(r.text)));
  term7.press(':'); for (const ch of 'mail') term7.press(ch); term7.press('return'); await tick();
  term7.press('s');
  check('s in the mailbox opens a letter', app7.top()?.id === 'mail-compose');
  const compose = app7.top();
  app7.top().cursor = at((r, t) => t.startsWith('To')); term7.press('return'); await compose.picking;
  app7.top().cursor = at((r, t) => t.startsWith('Alttest')); term7.press('return');
  app7.top().cursor = at((r) => r.data?.slot === g7.state.inventory.stacks.findIndex((x) => x.item === linen.entry)); term7.press('return');
  term7.press('S'); await compose.sending; await tick();
  const altBox = store.get('alt').state.mailbox;
  check('the letter lands in the other character\'s mailbox', altBox.length === 1 && altBox[0].attachments.some((x) => x.entry === linen.entry) && countItem(g7.state.inventory, linen.entry) === 0);
  term7.close?.();
  // The other character sends it back.
  const term8 = new HeadlessTerm(110, 34);
  const app8 = new App({ term: term8, ds, repo: repo7 });
  term8.open();
  const alt = await repo7.load('alt');
  app8.startGame(alt.state, 'alt', alt.createdAt, false, alt.updatedAt);
  term8.press(':'); for (const ch of 'mail') term8.press(ch); term8.press('return'); await tick();
  app8.top().cursor = app8.rowsOf(app8.top()).findIndex((r) => r.data?.mail); term8.press('r'); term8.press('return');
  for (let i = 0; i < 5; i++) await tick();
  check('r returns it to the sender\'s mailbox', (store.get('main').state.mailbox ?? []).some((m) => m.attachments?.some((x) => x.entry === linen.entry)));
  term8.close?.();
  // Bank: a bag in a bank bag slot comes back out; D deposits every stack of an item.
  const bag = ds.allItems().find((it) => it.slot === 'bag' && (it.bagSlots ?? 0) >= 4 && !it.bagFamily);
  g7.state.inventory = addItem(addItem(g7.state.inventory, bag.entry, 1, 1), linen.entry, 25, linen.stackable);
  app7.push((await import('./tuiCity.mjs')).bankDialog(app7));
  term7.press('+'); term7.press('return');
  app7.top().cursor = at((r) => r.data?.s?.item === bag.entry); term7.press('B');
  check('B puts a bag in a bought bank bag slot', g7.state.bankBags.some((b) => b != null));
  app7.top().cursor = at((r) => r.data?.bankBag != null); term7.press('return');
  check('Enter on the bank bag takes it back out', g7.state.bankBags.every((b) => b == null) && countItem(g7.state.inventory, bag.entry) === 1);
  app7.top().cursor = at((r) => r.data?.s?.item === linen.entry); term7.press('D');
  check('D deposits every stack of the item', countItem(g7.state.inventory, linen.entry) === 0 && countItem(g7.state.bank, linen.entry) === 25);
}

// Honor: the window shows rank, kills and the week; a City Defender gets free capital teleports.
{
  const g = app.g;
  const { newHonorState, CITY_DEFENDER_MIN_RP } = await import('../domain/run/honor.ts');
  home(); term.press(':'); for (const ch of 'honor') term.press(ch); term.press('return'); show('honor');
  const honorText = strip(app.rowsOf(app.top()).map((r) => r.text).join('|'));
  check(':honor opens the honor window', app.top().id === 'honor' && /This week/.test(honorText) && /Standings posted/.test(honorText));
  term.press('escape');
  const keep = g.state.char.honor;
  g.state.char.honor = { ...(keep ?? newHonorState()), rp: CITY_DEFENDER_MIN_RP + 1, todayHk: 3 };
  term.press(':'); for (const ch of 'honor') term.press(ch); term.press('return');
  check('a City Defender sees the free capital teleports', /Capital teleports/.test(strip(app.rowsOf(app.top()).map((r) => r.text).join(' '))));
  check('the rank title shows', !/No rank/.test(strip(app.rowsOf(app.top())[0].text)));
  g.state.char.honor = keep;
  home();
}

// Arena: the 1v1 and a 2v2 from the Honor window play in the live fight view and move the rating either way.
{
  const g = app.g;
  const { arenaRatingOf } = await import('../domain/bg/arenaRating.ts');
  home(); term.press(':'); for (const ch of 'honor') term.press(ch); term.press('return');
  const duel = rowIndex((r, t) => /1v1|Arena 1/.test(t) || /gauntlet/.test(t));
  check('the honor window lists the arena 1v1', duel > 0);
  const r1 = arenaRatingOf(g.state.arenaRating, 1);
  app.top().cursor = duel; term.press('return'); show('arena duel');
  check('Enter starts the duel in the live fight view', !!app.fight && app.fight.label === 'arena');
  finishFight();
  check('the 1v1 moves the rating', arenaRatingOf(g.state.arenaRating, 1) !== r1 && app.log.some((l) => /Arena rating/.test(strip(l))));
  home(); term.press(':'); for (const ch of 'honor') term.press(ch); term.press('return');
  const two = rowIndex((r, t) => /companion\b/.test(t));
  const r2 = arenaRatingOf(g.state.arenaRating, 2);
  if (two > 0) {
    app.top().cursor = two; term.press('return');
    check('the 2v2 starts with a companion beside you', !!app.fight && app.fight.session.alliesView().length >= 1);
    finishFight();
    check('the 2v2 moves its own rating', arenaRatingOf(g.state.arenaRating, 2) !== r2);
  } else check('the honor window lists the 2v2', false);
  home();
}

// Outdoor PvP: the Eastern Plaguelands towers and who holds them are on the World tab.
{
  const g = app.g;
  const keep = g.state.char.zoneId;
  g.state.char.zoneId = 'easternplaguelands';
  home(); term.press('1');
  const rows = app.rowsOf(app.top());
  check('Eastern Plaguelands lists its four towers', rows.filter((r) => r.data?.tower).length === 4 && rows.some((r) => /^Towers/.test(strip(r.text))));
  g.state.char.zoneId = keep;
  home();
}

// :dev verbs, and a random world-bot character from the create screen.
{
  const g = app.g;
  const cmd = (text) => { term.press(':'); for (const ch of text) term.press(ch === ' ' ? 'space' : ch); term.press('return'); };
  home();
  const linen = ds.allItems().find((it) => it.name === 'Linen Cloth');
  const had = countItem(g.state.inventory, linen.entry);
  cmd('dev item linen cloth 3');
  check(':dev item gives the item', countItem(g.state.inventory, linen.entry) === had + 3);
  cmd('dev prof cooking');
  check(':dev prof learns a profession at its cap', (g.state.char.skills.cooking?.max ?? 0) >= 300);
  const known = new Set(g.state.char.knownRecipes);
  const recipe = ds.recipes().find((r) => r.skill === 'cooking' && !known.has(r.id));
  cmd(`dev recipe ${recipe.id}`);
  check(':dev recipe learns it', g.state.char.knownRecipes.includes(recipe.id));
  cmd('dev quest 783');
  check(':dev quest finishes a quest', g.state.questlog.quests.some((q) => q.entry === 783 && q.status === 'turnedIn') || app.log.some((l) => /Quest done/.test(strip(l))));
  cmd('dev nothing');
  check(':dev with no verb lists them', app.log.some((l) => /:dev item/.test(strip(l))));
  const term9 = new HeadlessTerm(110, 34);
  const app9 = new App({ term: term9, ds, repo });
  term9.open();
  const { characterCreation } = await import('./tui.mjs');
  let created = null, cancelled = 0;
  characterCreation(app9, (state) => { created = state; }, { onCancel: () => { cancelled++; } });
  const row9 = (id) => app9.rowsOf(app9.top()).findIndex((r) => r.id === id);
  const text9 = () => term9.text();
  check('the create screen opens on the faction row with the hero drawn', app9.top().id === 'create' && app9.top().cursor === row9('faction') && row9('faction') < row9('race') && /Faction\s+Alliance/.test(text9()) && /Unnamed\s+Male Human Warrior/.test(text9()) && /Look/.test(text9()) && /New character/.test(text9()));
  app9.top().cursor = row9('race'); term9.press('right');
  check('Right on Race steps to the next race of the faction', /Race\s+Dwarf/.test(text9()));
  app9.top().cursor = row9('faction'); term9.press('right');
  check('Right on Faction switches to its first race', /Faction\s+Horde/.test(text9()) && /Race\s+Orc/.test(text9()) && /Orc · Horde/.test(text9()));
  term9.press('left');
  check('flipping back returns to the race last chosen there', /Faction\s+Alliance/.test(text9()) && /Race\s+Dwarf/.test(text9()));
  term9.press('right');
  app9.top().cursor = row9('race'); term9.press('left');
  check('Left on Race wraps to the faction\'s last race', /Race\s+Troll/.test(text9()));
  // A troll cannot be a paladin or a druid: the class row only offers what the race may roll.
  app9.top().cursor = row9('class');
  const classes9 = new Set();
  for (let i = 0; i < 12; i++) { term9.press('right'); classes9.add(text9().match(/Class\s+(\w+)/)[1]); }
  check('Class cycles through the troll classes only', classes9.has('Hunter') && classes9.has('Shaman') && !classes9.has('Paladin') && !classes9.has('Druid'));
  term9.press('return');
  check('Enter on Class opens the class list over the screen', app9.top().title === 'Class' && app9.stack.length === 2 && /Hunter/.test(text9()));
  term9.press('escape');
  check('Esc closes the list before a game is open', app9.top().id === 'create' && app9.stack.length === 1);
  app9.top().cursor = row9('gender'); term9.press('right');
  check('Right on Gender flips it', /Gender\s+Female/.test(text9()) && /Female Troll/.test(text9()));
  app9.top().cursor = row9('skin');
  const skin9 = text9().match(/Skin Color\s+(\d+) of/)[1]; term9.press('right');
  check('Right on a look row changes it', text9().match(/Skin Color\s+(\d+) of/)[1] !== skin9);
  app9.top().cursor = row9('create'); term9.press('return');
  check('Create without a name asks for one and moves to the Name row', !created && app9.top().cursor === row9('name') && /Give them a name/.test(text9()));
  term9.press('n');
  check('n rolls a random name', /Name\s+[A-Z][a-z]+/.test(text9()));
  app9.top().cursor = row9('name'); term9.press('return'); term9.type('x1');
  check('a bad name is refused', !!app9.cmd && /Letters only/.test(text9()));
  term9.type('thrallina');
  check('typing a name lands on the Create row', !app9.cmd && app9.top().cursor === row9('create') && /Create Thrallina, Female Troll/.test(text9()));
  term9.press('return');
  check('Enter on Create makes the character as chosen', created?.char?.name === 'Thrallina' && created.char.race === 8 && created.char.gender === 1 && created.char.level === 1 && created.char.appearance != null);
  created = null; app9.stack = [];
  characterCreation(app9, (state) => { created = state; }, { onCancel: () => { cancelled++; } });
  term9.press('escape');
  check('Esc on the create screen goes back to the character list', cancelled === 1);
  app9.top().cursor = row9('random'); term9.press('return');
  check('the create screen rolls a random world bot', !!created?.char?.name && created.char.level >= 1);
  term9.close?.();
  home();
}

// Saves: from the picker, back up, delete and bring back, restore, export and import (a real save folder in tmp).
{
  const { mkdtempSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { FileSaveRepository } = await import('./fileRepository.mjs');
  const { toSave } = await import('../persistence/saveShape.ts');
  const { savePicker } = await import('./tuiSaves.mjs');
  const tick = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
  const dir = mkdtempSync(join(tmpdir(), 'azsh-saves-'));
  const repo10 = new FileSaveRepository(join(dir, 'saves'));
  const now = Date.now();
  await repo10.save(toSave('keeper', newGameState(ds, human.id, 1, 'Keeper', 31, 0), now, now));
  const term10 = new HeadlessTerm(110, 34);
  const app10 = new App({ term: term10, ds, repo: repo10 });
  term10.open();
  let played = null;
  const open = async () => { app10.stack = []; await savePicker(app10, { onPlay: (s2) => { played = s2; }, onNew: () => {} }); };
  const at = (pred) => app10.rowsOf(app10.top()).findIndex((r) => !r.header && pred(r, strip(r.text)));
  const choose = async (re) => { app10.top().cursor = at((r, t) => re.test(t)); term10.press('return'); await tick(); };
  await open(); show('save picker');
  check('the picker lists the save', at((r, t) => /^Keeper/.test(t)) >= 0);
  app10.top().cursor = at((r, t) => /^Keeper/.test(t)); term10.press('m');
  await choose(/^Back it up now/);
  check('a save can be backed up by hand', (await repo10.listBackups('keeper')).length === 1);
  app10.top().cursor = at((r, t) => /^Keeper/.test(t)); term10.press('m');
  await choose(/^Export to a file/);
  const exported = app10.log.map(strip).reverse().find((l) => /^Wrote /.test(l))?.slice(6);
  check('a save exports to a file', !!exported && existsSync(exported));
  app10.top().cursor = at((r, t) => /^Keeper/.test(t)); term10.press('m');
  await choose(/^Delete/); term10.press('return'); await tick();
  check('delete removes it from the list', !(await repo10.list()).some((m) => m.slot === 'keeper'));
  await open();
  await choose(/^Bring back Keeper/);
  check('and Bring back restores it', (await repo10.list()).some((m) => m.slot === 'keeper'));
  await open();
  await choose(/^Import a save file/);
  for (const ch of exported) term10.press(ch === ' ' ? 'space' : ch); term10.press('return'); await tick();
  check('an exported file imports as a second copy', (await repo10.list()).filter((m) => m.name === 'Keeper').length === 2);
  await open();
  await choose(/^Keeper/);
  check('Enter on a save still plays it', played?.state?.char?.name === 'Keeper');
  // Locks: one character per process. A second repo stands in for a second terminal (same pid, so a
  // hand-written lock with a foreign live pid plays the other side; a dead pid is a stale lock).
  const { writeFileSync: writeLock, readFileSync: readLock } = await import('node:fs');
  const other = new FileSaveRepository(join(dir, 'saves'));
  check('lock() takes a free slot', repo10.lock('keeper').ok === true && existsSync(repo10.lockPath('keeper')));
  check('a lock we hold reads as free to us', repo10.lockedBy('keeper') === null);
  check('and as free to a second repo in the same process too', other.lockedBy('keeper') === null); // same pid: a reopen in-process is not a second terminal
  check('a different slot locks independently', other.lock('elsewhere').ok === true);
  writeLock(other.lockPath('ghost'), JSON.stringify({ pid: 2_000_000_000, at: 1 })); // no such process
  check('a stale lock (dead pid) is taken over', other.lock('ghost').ok === true && JSON.parse(readLock(other.lockPath('ghost'), 'utf8')).pid === process.pid);
  const livePid = process.ppid || process.pid + 1; // the parent shell is alive and is not us
  const foreign = JSON.stringify({ pid: livePid, at: Date.now() });
  writeLock(other.lockPath('taken'), foreign);
  const refused = other.lock('taken');
  check('a live lock from another process is refused', refused.ok === false && refused.pid === livePid && readLock(other.lockPath('taken'), 'utf8') === foreign);
  other.unlock('taken');
  check('unlock() never removes a lock we do not hold', existsSync(other.lockPath('taken')));
  repo10.unlock('keeper');
  check('unlock() releases ours', !existsSync(repo10.lockPath('keeper')));
  // The picker: a character held by another live process is marked and refuses to play or be managed.
  writeLock(repo10.lockPath('keeper'), foreign);
  played = null;
  await open(); show('save picker, keeper open elsewhere');
  const marked = () => app10.rowsOf(app10.top()).some((r) => /open in another terminal/.test(strip(r.text)));
  check('the picker marks a character open in another terminal', marked());
  await choose(/^Keeper.*open in another terminal/); // the imported copy is a Keeper too
  check('Enter refuses to play it', played === null && app10.log.map(strip).some((l) => /Keeper is open in another terminal/.test(l)));
  app10.top().cursor = at((r, t) => /^Keeper.*open in another terminal/.test(t)); term10.press('m'); await tick();
  check('m refuses to manage it', app10.top()?.title === 'Choose a character' && app10.log.map(strip).filter((l) => /Keeper is open in another terminal/.test(l)).length === 2);
  check('startGame on a held slot backs out', app10.startGame(newGameState(ds, human.id, 1, 'Keeper', 31, 0), 'keeper', Date.now(), true) === false && app10.g == null);
  writeLock(repo10.lockPath('keeper'), JSON.stringify({ pid: 2_000_000_000, at: 1 }));
  await open();
  check('a stale lock does not mark the character', !marked());
  term10.close?.();
  rmSync(dir, { recursive: true, force: true });
  if (exported) rmSync(exported, { force: true });
}

// Wiki: / searches every catalog, a page lists its links, Enter follows one, Esc comes back.
{
  home(); term.press('1');
  term.press('/'); for (const ch of 'linen cloth') term.press(ch === ' ' ? 'space' : ch); term.press('return'); show('wiki search');
  check('/ opens the wiki and searches', app.top().id === 'wiki' && /Linen Cloth/.test(strip(frame())));
  app.top().cursor = rowIndex((r, t) => t.startsWith('Linen Cloth')); term.press('return'); show('wiki item page');
  const page = app.rowsOf(app.top()).map((r) => strip(r.text)).join('|');
  check('the item page says where it drops', app.top().id === 'wiki-page' && /Dropped by/.test(page) && /Reagent for/.test(page));
  const drop = rowIndex((r, t) => !!r.act && /%/.test(t));
  app.top().cursor = drop; term.press('return');
  check('Enter follows a link to the NPC page', app.top().id === 'wiki-page' && app.stack.filter((v) => v.id === 'wiki-page').length === 2);
  term.press('escape');
  check('Esc goes back to the item', app.rowsOf(app.top()).some((r) => /Reagent for/.test(strip(r.text))));
  home(); term.press(':'); for (const ch of 'wiki hogger') term.press(ch === ' ' ? 'space' : ch); term.press('return');
  check(':wiki <words> opens on the search', app.top().id === 'wiki' && /Hogger/.test(strip(frame())));
  term.press('tab'); term.press('tab'); term.press('tab'); term.press('tab');
  check('Tab narrows to one kind', /\[NPCs\]/.test(strip(frame())));
  home();
}

// Alterac Valley: from the Honor window it is a raid run in the dungeon run window.
{
  const term11 = new HeadlessTerm(110, 34);
  const app11 = new App({ term: term11, ds, repo });
  term11.open();
  app11.startGame(newGameState(ds, human.id, 1, 'Valleytest', 41, 0), 'valleytest', Date.now(), true);
  const g11 = app11.g;
  g11.state.char.level = 60;
  const at = (pred) => app11.rowsOf(app11.top()).findIndex((r) => !r.header && pred(r, strip(r.text)));
  term11.press(':'); for (const ch of 'honor') term11.press(ch); term11.press('return');
  const av = at((r, t) => /Alterac Valley/.test(t));
  check('the honor window lists Alterac Valley', av >= 0);
  app11.top().cursor = av; term11.press('return');
  if (showFrames) console.log(`\n=== alterac valley ===\n${term11.text()}`);
  check('Enter starts the valley as a raid run', /^alterac-valley-/.test(g11.state.instance?.dungeonId ?? '') && app11.top()?.id === 'dungeon');
  term11.close?.();
}

// Warsong Gulch from the Honor window: pick your job, the match plays out, honor and marks settle, you are out.
{
  const term12 = new HeadlessTerm(110, 34);
  const app12 = new App({ term: term12, ds, repo });
  term12.open();
  app12.startGame(newGameState(ds, human.id, 1, 'Gulchtest', 51, 0), 'gulchtest', Date.now(), true);
  const g12 = app12.g;
  g12.state.char.level = 30;
  const { stepBg } = await import('./tuiBg.mjs');
  const at = (pred) => app12.rowsOf(app12.top()).findIndex((r) => !r.header && pred(r, strip(r.text)));
  term12.press(':'); for (const ch of 'honor') term12.press(ch); term12.press('return');
  app12.top().cursor = at((r, t) => /Warsong Gulch/.test(t)); term12.press('return');
  if (showFrames) console.log(`\n=== warsong gulch ===\n${term12.text()}`);
  check('the honor window starts Warsong Gulch', app12.top()?.id === 'bg' && !!g12.state.battleground && /flag/.test(strip(term12.text())));
  app12.top().cursor = at((r, t) => /Autopilot:/.test(t)); term12.press('return'); // the orders picker
  app12.top().cursor = at((r, t) => /Autopilot:/.test(t)); term12.press('return'); // its job option
  app12.top().cursor = at((r, t) => /guard our flag/.test(t)); term12.press('return');
  check('you can change your job', app12.bg.world.units.get(app12.bg.selfId).role === 'defense');
  const bg = app12.bg;
  check('the gulch is drawn as a strip with you on it', /Horde.*mid.*Alliance/.test(strip(term12.text())) && /@/.test(strip(term12.text())));
  // Your own seat by place: an order takes you off autopilot, and once the gates open you walk toward mid.
  const { WSG_GEOMETRY } = await import('../domain/bg/wsg.ts');
  const me12 = bg.world.units.get(bg.selfId);
  const toMid = () => Math.hypot(me12.pos.x - WSG_GEOMETRY.mid.x, me12.pos.y - WSG_GEOMETRY.mid.y);
  const d0 = toMid();
  term12.press('o');
  app12.top().cursor = at((r, t) => /Go to mid/.test(t)); term12.press('return');
  check('an order by place takes your seat off autopilot', me12.human === true && me12.order.kind === 'attack-move');
  stepBg(app12, bg, 300);
  check('and you walk there yourself', toMid() < d0 - 50 && me12.order.kind === 'attack-move');
  // A team call holds your side against the strategy layer for a while, then hands them back.
  term12.press('t');
  app12.top().cursor = at((r, t) => /Everyone to mid/.test(t)); term12.press('return');
  const called = [...bg.commanded.keys()];
  stepBg(app12, bg, 25); // two strategy cycles
  const stillOnIt = called.filter((id) => { const u = bg.world.units.get(id); return u.order.kind === 'attack-move' && Math.abs(u.order.to.x - WSG_GEOMETRY.mid.x) < 1; });
  check('a team call holds your side past the strategy cycle', called.length >= 5 && stillOnIt.length === called.filter((id) => bg.world.alive(bg.world.units.get(id))).length);
  stepBg(app12, bg, 500);
  check('and lapses after its time', bg.commanded.size === 0);
  bg.speed = 8;
  term12.press('j');
  app12.top().cursor = at((r, t) => /guard our flag/.test(t)); term12.press('return');
  check('autopilot takes your seat back', me12.human === false && bg.my == null);
  const marks0 = g12.state.inventory.stacks.length;
  let n = 0;
  while (!bg.world.ended && n < 40000) { stepBg(app12, bg, 200); n += 200; }
  app12.render();
  check('the match plays to an end', bg.world.ended && bg.settled);
  check('inside its 25 minute clock, with a winner', bg.world.t <= 25 * 60_000 + 10_000 && bg.world.winner != null);
  check('both sides scored kills and the header counts them', bg.teamKills.alliance > 0 && bg.teamKills.horde > 0 && /kills [0-9]+-[0-9]+/.test(strip(term12.text())));
  check('honor and marks of honor settle', bg.marks > 0 && g12.state.inventory.stacks.length > marks0 && (g12.state.char.honor?.cp ?? 0) > 0);
  check('and you are out of the battleground', !g12.state.battleground);
  app12.top().cursor = at((r, t) => /Leave the battleground/.test(t)); term12.press('return');
  check('Leave closes the match window', app12.top()?.id !== 'bg');
  term12.close?.();
}

// Stratholme on the floor: the Gauntlet gate arms the Baron's Ultimatum, Ysida is caged, the 45 minutes run out.
{
  const { loadNavMesh, stepFloor } = await import('./tuiFloor.mjs');
  const { setFlag, hasFlag } = await import('../world/instances.ts');
  const { STRATH_BARON_RUN } = await import('../data/dungeons/stratholme-undead.ts');
  const def = ds.instance('stratholme-undead');
  if (def && loadNavMesh(def)) {
    const term13 = new HeadlessTerm(110, 34);
    const app13 = new App({ term: term13, ds, repo });
    term13.open();
    app13.startGame(newGameState(ds, human.id, 1, 'Barontest', 61, 0), 'barontest', Date.now(), true);
    const g13 = app13.g;
    g13.state.char.level = 60;
    check('Stratholme (Undead) can be entered', g13.enterInstance('stratholme-undead', Date.now()).ok);
    app13.stack = []; (await import('./tuiDungeon.mjs')).openRun(app13);
    term13.press('W');
    const f = app13.floor;
    check('the Stratholme floor carries its script', app13.top()?.id === 'floor' && !!f.script);
    g13.state.instance = setFlag(g13.state.instance, STRATH_BARON_RUN.runFlag);
    f.world.entities = f.world.entities.filter((e) => e.party); // nothing to pull: only the clock matters here
    stepFloor(app13, f);
    check('the gate arms the Baron\'s Ultimatum and cages Ysida', app13.log.some((l) => /45 minutes/.test(strip(l))) && app13.log.some((l) => /Ysida Harmon/.test(strip(l))));
    f.runMs += STRATH_BARON_RUN.durationMs;
    stepFloor(app13, f);
    check('the 45 minutes run out', hasFlag(g13.state.instance, STRATH_BARON_RUN.failFlag) && app13.log.some((l) => /expired/.test(strip(l))));
    term13.close?.();
  } else check('Stratholme has a nav mesh to walk', false);
}

// Events on the floor (2j): Fenrus arms as you come near, running fails it and holds it, his voidwalkers join the
// fight you are in, the stop clears. Then Willix: an escort quest in the log starts the walk and the party keeps up.
{
  const { loadNavMesh, stepFloor } = await import('./tuiFloor.mjs');
  const { openRun } = await import('./tuiDungeon.mjs');
  const sfk = ds.instance('shadowfang-keep'), rfk = ds.instance('razorfen-kraul');
  if (sfk && rfk && loadNavMesh(sfk) && loadNavMesh(rfk)) {
    const term14 = new HeadlessTerm(110, 34);
    const app14 = new App({ term: term14, ds, repo });
    term14.open();
    app14.startGame(newGameState(ds, human.id, 1, 'Eventtest', 71, 0), 'eventtest', Date.now(), true);
    const g14 = app14.g;
    g14.state.char.level = 30;
    for (const [cls, role] of [[1, 'tank'], [2, 'healer'], [8, 'dps'], [4, 'dps']]) g14.recruitCompanion(cls, role, 'twink');
    for (const c of g14.state.squad) c.level = 30;
    g14.regenTick(600, true);
    const fightOut = () => { let n = 0; while (app14.fight && n++ < 8000) app14.fight.tick(); };
    const stepUntil = (pred, max = 400) => { for (let i = 0; i < max && !pred(); i++) stepFloor(app14, app14.floor); return pred(); };
    check('Shadowfang Keep can be entered', g14.enterInstance('shadowfang-keep', Date.now()).ok);
    app14.stack = []; openRun(app14); term14.press('W');
    let f = app14.floor, ctx = f.script;
    const fenrus = sfk.encounters.find((e) => e.id === 'fenrus');
    const fenrusRow = app14.rowsOf(app14.top()).find((r) => /Fenrus/.test(strip(r.text ?? '')));
    check('the floor marks Fenrus as an event', !!fenrusRow && /^\s*W /.test(strip(fenrusRow.text)) && fenrusRow.detail().some((l) => /event in 2 waves/.test(strip(l))));
    Object.assign(f.world.party, { x: fenrus.origin.x + 20, y: fenrus.origin.y, z: fenrus.origin.z });
    check('coming within 50 yards starts the event and its first wave', stepUntil(() => !!app14.fight) && ctx.gauntlet?.encId === 'fenrus' && app14.log.some((l) => /the event begins/.test(strip(l))));
    check('the wave fights under its world guid', !!app14.fight.session.sideOfGuid(fenrus.spawnGuids[0]));
    app14.fight.flee();
    check('running away fails the event', !ctx.gauntlet && app14.log.some((l) => /The event fails/.test(strip(l))));
    stepUntil(() => !!ctx.gauntlet, 100);
    check('and it waits before it arms again', !ctx.gauntlet && !app14.fight);
    g14.regenTick(600, true);
    f.runMs += 60_000;
    check('a minute on, it arms again', stepUntil(() => !!app14.fight) && ctx.gauntlet?.idx === 1);
    ctx.callGauntletWave(); // the voidwalkers early, while Fenrus still stands
    const voids = app14.fight?.session.enemiesView().filter((v) => /Voidwalker/.test(v.name)) ?? [];
    check('a wave called mid-fight joins the fight you are in', voids.length === 4 && ctx.gauntlet.spawned.every((gd) => !!app14.fight.session.sideOfGuid(gd)));
    fightOut();
    stepUntil(() => !ctx.gauntlet || !!app14.fight, 50);
    check('the event ends and the stop is cleared', !ctx.gauntlet && !app14.fight && g14.state.instance.defeated.includes('fenrus') && app14.log.some((l) => /Fenrus the Devourer is done/.test(strip(l))));
    // Willix the Importer: the quest is in the log, so the escort starts and the party follows him.
    app14.stack = [];
    g14.leaveInstance(Date.now());
    check('Razorfen Kraul can be entered', g14.enterInstance('razorfen-kraul', Date.now()).ok);
    openRun(app14); term14.press('W');
    f = app14.floor; ctx = f.script;
    const willix = f.world.entities.find((e) => e.entry === 4508);
    check('the floor carries friendly NPCs (Willix)', !!willix && !willix.hostile);
    Object.assign(f.world.party, { x: willix.x + 2, y: willix.y, z: willix.z });
    g14.state.questlog.quests.push({ entry: 1144, status: 'active', kills: {}, objects: {}, spells: {}, explored: false });
    check('an escort quest in the log starts the escort', stepUntil(() => !!ctx.floorEscort, 40) && ctx.floorEscort.status === 'active' && app14.log.some((l) => /Escort started/.test(strip(l))));
    check('the floor shows whom you escort', app14.rowsOf(app14.top()).some((r) => /Escorting Willix the Importer/.test(strip(r.text ?? ''))));
    const at = { x: willix.x, y: willix.y };
    const gap = () => Math.hypot(f.world.party.x - willix.x, f.world.party.y - willix.y);
    for (let i = 0; i < 1500 && ctx.floorEscort.waypointIndex < 6; i++) { if (app14.fight) fightOut(); else stepFloor(app14, f); }
    // He walks on while you fight and waits at 50 yards; out of the fight the party catches up.
    for (let i = 0; i < 600 && gap() > 12; i++) { if (app14.fight) fightOut(); else stepFloor(app14, f); }
    check('Willix walks his path and the party keeps up', ctx.floorEscort.waypointIndex >= 6 && Math.hypot(willix.x - at.x, willix.y - at.y) > 5 && gap() <= 12);
    term14.close?.();
  } else check('Shadowfang Keep and Razorfen Kraul have nav meshes to walk', false);
}

// World search: s on the World tab, a vendor item lists who sells it and where, a node its zones, a dungeon its door.
{
  const txt = () => app.rowsOf(app.top()).map((r) => strip(r.text)).join('|');
  const find = (key, q) => { home(); term.press('1'); term.press(key); for (const ch of q) term.press(ch === ' ' ? 'space' : ch); term.press('return'); };
  const search = (q) => find('S', q);
  find('s', 'hogger'); show('zone search');
  check('s searches the zone you stand in', app.top().id === 'world-search' && /Search Elwynn Forest/.test(strip(frame())) && /Hogger L11.*here/.test(txt()));
  find('s', 'deadmines');
  check('the zone search leaves out what is elsewhere', /Nothing by that name in Elwynn Forest/.test(txt()));
  term.press('a');
  check('a widens it to the whole world', /Deadmines.*Dungeon.*entrance in Westfall/.test(txt()));
  search('mining pick'); show('world search');
  check('S opens the world search', app.top().id === 'world-search' && /Mining Pick/.test(txt()));
  check('an item lists the vendors that sell it and where they stand', /sold by .*<.*>.*(here|Stormwind|Westfall|Loch Modan|Redridge)/.test(txt()));
  search('copper vein'); show('world search node');
  check('a gather node lists the zones it grows in', /Copper Vein.*Mining.*(here|Dun Morogh|Durotar|Mulgore|Westfall|Loch Modan)/.test(txt()));
  search('deadmines');
  check('a dungeon shows its entrance', /Deadmines.*Dungeon.*entrance in Westfall/.test(txt()));
  search('hoger');
  check('a typo still finds the creature (fuzzy)', /Hogger L11.*here/.test(txt()));
  search('westfall');
  app.top().cursor = rowIndex((r, t) => /^Westfall/.test(t)); term.press('return');
  check('Enter on a zone elsewhere asks before travelling', app.top().id === 'pick' && /Travel to Westfall/.test(strip(frame())));
  term.press('escape');
  search('elwynn');
  app.top().cursor = rowIndex((r, t) => /^Elwynn Forest/.test(t)); term.press('return');
  check('Enter on the zone you stand in just says so', app.top().id === 'world-search' && /already here/.test(app.flash?.text ?? ''));
  home();
}

// Help overlay and escape.
term.press('?'); check('help overlay', app.top().id === 'help'); term.press('escape');
check('help closed', app.stack.length === 0);

// Pre-pull buffs: a mage buffs standing still, the autopilot drinks back what that cost, and the pull opens at
// full mana on an attack. Casting the buffs phase on the fight's first ticks sent it in at three quarters.
{
  const termB = new HeadlessTerm(110, 34);
  const appB = new App({ term: termB, ds, repo });
  termB.open();
  appB.startGame(newGameStateFromWorldBot(ds, { id: 'buffcheck', index: 0, name: 'Buffcheck', gender: 0, race: 1, cls: 8, faction: undefined, level: 20, specIdx: 0, seed: 7 }, 7), 'buffcheck', Date.now(), true);
  const gB = appB.g;
  const wolf = ds.zone(gB.state.char.zoneId).huntable[0];
  const hasAI = () => (gB.state.char.activeAuras ?? []).some((a) => ds.spell(a.spellId)?.name === 'Arcane Intellect');
  const full = () => gB.state.char.power === maxPower(gB.state.char, ds);
  let pulledFull = null, pulledBuffed = null;
  const ap = appB.cmds.createAutopilot(`farm ${ds.creature(wolf).name}`, { maxSteps: 6, liveFight: (step, settle) => { pulledFull ??= full(); pulledBuffed ??= hasAI(); settle({ outcome: 'win' }); return { ok: true }; } });
  ap.next();
  check('autopilot buffs before the pull, then rests instead of pulling', ap.lastKind === 'buff' && hasAI() && !full());
  for (let i = 0; i < 5 && pulledFull == null; i++) ap.next();
  check('autopilot pulls buffed and at full mana', pulledFull === true && pulledBuffed === true);
  gB.state.char.activeAuras = (gB.state.char.activeAuras ?? []).filter((a) => ds.spell(a.spellId)?.name !== 'Arcane Intellect');
  gB.state.char.activeBuffs = (gB.state.char.activeBuffs ?? []).filter((id) => ds.spell(id)?.name !== 'Arcane Intellect');
  const from = appB.log.length;
  startFight(appB, wolf);
  const buffedFirst = hasAI();
  for (let i = 0; i < 2000 && appB.fight; i++) appB.fight.tick();
  const casts = appB.log.slice(from).map(strip).filter((l) => /^\s*[\d.]+s You cast /.test(l));
  check('a plain fight buffs before it starts and opens on an attack', buffedFirst && casts.length > 0 && !casts.some((l) => /Arcane Intellect/.test(l)));
  // A dungeon stop: the same buff, then the party drinks back to the rest line before the pull, and again before
  // the next one. Pulling straight after the armour and conjures opened Rhahk'Zor at 761 of 1966.
  const { openRun, pullStop } = await import('./tuiDungeon.mjs');
  const { nextEncounter } = await import('../world/instances.ts');
  for (const [cls, role] of [[1, 'tank'], [2, 'healer']]) gB.recruitCompanion(cls, role, 'twink');
  for (const c of gB.state.squad) c.level = 20;
  gB.state.char.activeAuras = []; gB.state.char.activeBuffs = [];
  gB.regenTick(600, true);
  const dm = ds.instance('deadmines');
  check('a level 20 mage party can enter the Deadmines', gB.enterInstance('deadmines', Date.now()).ok);
  appB.stack = []; openRun(appB);
  const openPct = [];
  for (let i = 0; i < 2; i++) {
    pullStop(appB, dm, nextEncounter(dm, gB.state.instance));
    const pv = appB.fight?.session.playerView();
    openPct.push(pv ? pv.power / maxPower(gB.state.char, ds) : 0);
    for (let n = 0; n < 8000 && appB.fight; n++) appB.fight.tick();
    appB.fight?.release?.();
  }
  check('a dungeon stop buffs, then drinks back before the pull', hasAI() && openPct[0] >= 0.9);
  check('the next stop rests back up too', openPct[1] >= 0.9);
  // Sneed's Shredder ejects Sneed: the next phase opens on the stage. It was run to its end the moment the
  // Shredder fell, so Sneed appeared and died in the same frame.
  {
    const shredder = dm.encounters.find((e) => e.id === 'sneeds-shredder');
    gB.regenTick(600, true);
    pullStop(appB, dm, shredder, { floor: true });
    const ticks = new Map();
    for (let n = 0; n < 20000 && appB.fight; n++) {
      if (!appB.fight.ended) ticks.set(appB.fight.enemyEntry, (ticks.get(appB.fight.enemyEntry) ?? 0) + 1);
      appB.fight.tick();
    }
    check(`Sneed comes out of his Shredder and is fought on the stage (${ticks.get(643) ?? 0} ticks)`, ticks.has(642) && (ticks.get(643) ?? 0) > 20);
    check('the Shredder stop clears once Sneed is down', gB.state.instance.defeated.includes('sneeds-shredder'));
  }
}

// A foe that resets ends the fight. The engine keeps the session open with the mob passive at full HP and the
// rotation idle, which held a Razormane Scout fight for 970 s. Here a Quilboar is pinned 50 yd out once it is
// in combat, so it cannot close and evades; the fight must settle as a stalemate a few seconds later.
{
  const termQ = new HeadlessTerm(110, 34);
  const appQ = new App({ term: termQ, ds, repo });
  termQ.open();
  appQ.startGame(newGameStateFromWorldBot(ds, { id: 'quietcheck', index: 0, name: 'Quietcheck', gender: 0, race: 2, cls: 7, faction: undefined, level: 11, specIdx: 0, seed: 5 }, 5), 'quietcheck', Date.now(), true);
  const boar = ds.creatures().find((c) => c.name === 'Razormane Quilboar');
  const from = appQ.log.length;
  startFight(appQ, boar.entry);
  const s = appQ.fight.session, side = s.enemiesView()[0].side;
  let engagedAt = null, ticks = 0;
  for (; ticks < 1200 && appQ.fight && !appQ.fight.ended; ticks++) {
    if (engagedAt == null && s.enemiesView()[0].engaged) engagedAt = s.t;
    s.setUnitPosYd('player', { x: 0, y: 0 });
    if (engagedAt != null) s.setUnitPosYd(side, { x: 50, y: 0 });
    appQ.fight.tick();
  }
  const said = appQ.log.slice(from).map(strip);
  const reset = said.some((l) => /cannot reach you and resets/.test(l));
  check(`a foe that resets ends the fight as a stalemate (${(s.t / 1000).toFixed(1)} s, reset ${reset})`,
    reset && said.some((l) => /resets and the fight is over/.test(l)) && said.some((l) => /^Stalemate against/.test(l)) && s.t < 20_000);
  appQ.fight?.release?.();
}

// c on the World tab saves, lets go of the character and hands the screen back to the picker.
{
  const termL = new HeadlessTerm(110, 34);
  const repoL = { saved: 0, unlocked: [], async save() { this.saved++; }, async list() { return []; }, async load() { return null; }, unlock(s) { this.unlocked.push(s); } };
  const appL = new App({ term: termL, ds, repo: repoL });
  termL.open();
  appL.startGame(newGameState(ds, human.id, 1, 'Logouttest', 777, 0), 'logouttest', Date.now(), true);
  let picked = 0;
  appL.toPicker = async () => { picked++; };
  termL.press('c');
  await new Promise((r) => setImmediate(r));
  check('c on World saves, unlocks and goes back to the character list', !appL.g && picked === 1 && repoL.saved > 0 && repoL.unlocked.includes('logouttest') && !appL.timers.length);
}

// Sixel art, last: once on it stays on for the process. The terminal says it draws sixel (DA1 parameter 4);
// art then travels as placeholders whose markers the terminal layer takes out and places.
{
  noteDeviceAttributes('?62;4;22');
  const art = creatureArt(2332, 28, 14);
  const mark = art?.[0]?.match(/\x1b\[9999;(\d+);0m/);
  check('sixel on: a creature is a placeholder of marked blank rows', !!mark && art.every((l, r) => l.includes(`\x1b[9999;${mark[1]};${r}m`)) && /^\x1bP0;1;0q"1;1;\d+;\d+#/.test(imageOf(+mark[1])?.sixel ?? ''));
  // The shipped worn pack fills what the downloaded hd pack lacks: forms and costumes draw sharp too.
  check('sixel on: cat and bear form draw as pixels, not half-blocks', [892, 2281].every((id) => /\x1b\[9999;/.test(creatureArt(id, 28, 14)?.[0] ?? '')));
  const placed = new Map();
  const rows = art.map((l, r) => takeMarks(`ab${l}${l}`, 5 + r, placed));
  check('the same picture twice on a row is two placements, at their columns, markers gone', placed.size === 2 && [...placed.values()].every((p) => p.y === 5 && p.bottom) && [...placed.values()].map((p) => p.x).join() === `2,${2 + artWidth(art)}` && rows.every((l) => !l.includes('\x1b[9999')));
  check('a marker rides one cell in a grid, not every cell after it', splitCells(art[0]).filter((c) => c.includes('\x1b[9999')).length === 1);
  const map = worldMapLines(app, { maxCols: 40, maxRows: 12 });
  check('the world map is a placeholder too, with its legend under it', !!map && map.length === 12 && /\x1b\[9999;/.test(map[0]) && /^\x1bP0;1;0q"1;1;\d+;\d+#/.test(imageOf(+map[0].match(/\x1b\[9999;(\d+);/)[1])?.sixel ?? '') && /you/.test(strip(map[11])));
  check('a wrapped line does not carry a marker to the next', wrapLines(`${art[0]} ${'word '.repeat(20)}`, 40).slice(1).every((l) => !l.includes('\x1b[9999')));
  const icon = iconCells('spell_holy_holysmite', 6, '', [{ x: 4, y: 2, w: 2 }]);
  check('an icon is a placeholder too, with its badge corner see-through', !!icon && icon.length === 3 && icon[0][0].includes('\x1b[9999') && /#\d+;2;/.test(imageOf(+icon[0][0].match(/\x1b\[9999;(\d+);/)[1])?.sixel ?? ''));
}

check('frames were drawn', term.frames > 20);
check('saves happened', repo.saved > 0);
console.log(failures ? `\n${failures} check(s) failed` : '\nall TUI checks passed');
process.exit(failures ? 1 : 0);
