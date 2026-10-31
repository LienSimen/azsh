// Drives the windowed game headlessly: decodes raw key bytes, rolls a character, walks every tab, opens a
// quest, a vendor and a trainer, pages through quest text, runs a live fight tick by tick, runs the autopilot
// through a live fight, and edits the rotation through its menu. Run with `npm run check:tui`; pass --frames
// to see every screen.
import { HeadlessTerm, decodeKeys } from './term.mjs';
import { App } from './tui.mjs';
import { bootDataStore } from './bootData.mjs';
import { newGameState } from '../engine/game.ts';
import { strip } from './text.mjs';
import { addItem, countItem } from '../domain/items/inventory.ts';

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
/** Run a live fight to its end by hand. */
const finishFight = () => { let n = 0; while (app.fight && n < 3000) { app.fight.tick(); n++; } return n; };

show('world');
check('header shows the character', frame().includes('Tuitest') && frame().includes('Elwynn Forest'));
check('world lists creatures', /Kobold/.test(frame()));

// Tabs 2..9 and 0 all render without throwing; Left/Right and Esc move between them.
for (const k of ['2', '3', '4', '5', '6', '7', '8', '9', '0']) { term.press(k); show(`tab ${k}`); }
check('rotation tab shows rules', (term.press('6'), /Combat \(checked/.test(frame())));
check('talents tab renders', (term.press('7'), /Talents unlock|point/.test(frame())));
check('0 opens the tenth tab', (term.press('0'), app.tab === 9));
const lastTab = app.tabs.length - 1;
check('character tab renders', (app.switchTab(lastTab), /Attributes/.test(frame())));
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
const barName = app.fight?.abilityBar()[0]?.spell.name;
const hasBar = () => barName && frame().split('\n').some((l) => /^\s*1\s/.test(strip(l)) && strip(l).includes(barName));
check('auto-play hides the ability bar', !hasBar());
let ticks = 0;
while (app.fight && ticks < 3000) { app.fight.tick(); ticks++; if (ticks === 15) show('fight mid'); }
check(`fight resolved in ${ticks} ticks`, !app.fight && ticks < 3000);
check('combat log has rows', app.log.some((l) => /hits|misses|crits|dies|Victory|Defeat/.test(strip(l))));
show('after fight');

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
check('autopilot started', !!app.auto);
const autoCtl = app.auto;
let steps = 0, liveFights = 0, fightTicks = 0;
while (app.auto && steps < 60) {
  if (app.fight) { liveFights++; fightTicks += finishFight(); continue; }
  if (!app.auto.step()) break;
  steps++;
}
show('autopilot');
if (app.auto) {
  if (app.fight) { liveFights++; fightTicks += finishFight(); }
  check('between fights the autopilot keeps its own panel', /^\s*Autopilot\s/m.test(strip(frame())) && strip(frame()).includes(app.ch.name));
  show('autopilot between fights');
  term.press('3'); check('tabs can be viewed while the autopilot runs', app.tab === 2 && !!app.auto && /Bags|bag/i.test(strip(frame())));
  term.press('w'); check('w goes back to watching the run', !app.auto.browsing && /^\s*Autopilot\s/m.test(strip(frame())));
  term.press('l'); check('log window opens over the autopilot', app.top().id === 'log');
  term.press('escape'); check('Esc closes the log and leaves the autopilot running', app.stack.length === 0 && !!app.auto);
  term.press('1');
}
check(`autopilot fought ${liveFights} live fights over ${steps} steps (${fightTicks} ticks)`, liveFights > 0 && app.log.some((l) => /hunting:|quest target:/.test(strip(l))));
check('autopilot counted its fights', autoCtl.fights === liveFights);
if (app.auto) { term.press('escape'); check('Esc stops the autopilot', !app.auto); }

// Autopilot fight interrupted by Esc stops the run.
term.press('a');
while (app.auto && !app.fight && app.auto.step()) { /* reach a fight */ }
if (app.fight) { term.press('escape'); check('Esc in an autopilot fight stops the run', !app.fight && !app.auto); }
else { if (app.auto) app.auto.stop(); check('autopilot reached a fight to interrupt', false); }

// A quest fight lost: the quest is blacklisted and the run goes on instead of stopping.
{
  const lost = app.cmds.createAutopilot('30', { liveFight: (step, settle) => { settle({ outcome: 'defeat' }); return { ok: true }; } });
  let line = '';
  for (let n = 0; n < 30 && !app.cmds.questBlacklist.size && line != null; n++) line = lost.next();
  check('a quest the autopilot died on is blacklisted', app.cmds.questBlacklist.size > 0 && app.log.some((l) => /skipping .*died 3 times/.test(strip(l))));
  check('dying on a quest did not stop the run', !lost.done);
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

// Rotation editing through the menu: toggle a rule, add one, give it a condition, delete it.
home(); term.press('6');
show('rotation');
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
term.press('return'); term.press('down'); term.press('return'); // menu → change when it fires
check('condition picker opened', app.top().id === 'pick' && /fire only when/.test(app.top().title));
term.press('down'); term.press('return'); term.type('50');
check('condition applied', JSON.stringify(app.g.rotation().phases.combat).includes('"healthPct"'));
show('rotation edited');
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
check('no bank or auction house in the start zone', !/Services/.test(strip(frame())));
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
    check('hire rows name their trades', /(Mining|Herb|Skin|Tailor|Smith|Engi|Alchemy|Enchant|Leather) \d+/.test(strip(app.rowsOf(app.top()).find((r) => !r.header)?.text ?? '')));
    term.press('return'); show('candidate page');
    check('Enter opens the candidate page', app.top().id.startsWith('cand-'));
    check('the candidate page lists professions and stats', app.rowsOf(app.top()).some((r) => r.header && strip(r.text) === 'Professions') && rowIndex((r, t) => /^Health \d+/.test(t)) >= 0);
    app.top().cursor = rowIndex((r, t) => /^Hire as/.test(t)); term.press('return'); show('after hire');
    check('hiring returns to the Companions tab', app.stack.length === 0);
    const comp = (g.state.squad ?? [])[0];
    check('a companion joined the party', !!comp);
    if (comp) {
      const row = rowIndex((r, t) => t.startsWith(comp.name));
      app.top().cursor = row; term.press('return'); show('companion page');
      check('Enter opens their page', app.top().id === `comp-${comp.id}`);
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
  const quickFrom = app.log.length;
  term.press(':'); term.type(`fight ${app.rowsOf(app.top())[mobAt].data.creature.entry}`);
  check(':fight brings the party in Party mode', app.log.slice(quickFrom).some((l) => squad.some((c) => strip(l).includes(c.name))));
}

// ---- dungeons: the Deadmines as a text run ------------------------------------------------------------------
{
  const g = app.g;
  const { hasFlag } = await import('../world/instances.ts');
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
  for (let n = 1; n <= 2; n++) {
    app.top().cursor = rowIndex((r, t) => /◀ next/.test(t)); term.press('return');
    check(`stop ${n} starts a live fight with the party`, !!app.fight?.withSquad && app.fight.session.alliesView().length >= 4);
    finishFight();
    check(`stop ${n} is cleared and the run window comes back`, g.state.instance.defeated.length === n && app.top()?.id === 'dungeon');
  }
  show('run window after two stops');
  const chest = rowIndex((r) => r.data?.object?.kind === 'chest' && r.data.object.pin.name === 'Defias Gunpowder');
  app.top().cursor = chest; term.press('return');
  check('the Defias Gunpowder chest gives the gunpowder', countItem(g.state.inventory, 5397) === 1);
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
  const cleared = g.state.instance.defeated.length;
  term.press('L');
  check('L leaves and the run is held', !g.state.instance && !!g.state.instanceSaves?.deadmines);
  check('the portal row shows the held run', /your run is held/.test(strip(frame())));
  app.top().cursor = rowIndex((r) => r.data?.dungeon?.id === 'deadmines'); term.press('return');
  check('the entry card offers to go back in', /Go back in/.test(strip(frame())));
  app.top().cursor = rowIndex((r, t) => /^Go back in/.test(t)); term.press('return');
  check('going back in keeps the cleared stops', g.state.instance?.defeated.length === cleared);
  term.press('R'); term.press('return');
  check('R resets the run', g.state.instance?.defeated.length === 0);
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
  g.state.char.zoneId = 'westfall';
}

// Help overlay and escape.
term.press('?'); check('help overlay', app.top().id === 'help'); term.press('escape');
check('help closed', app.stack.length === 0);

check('frames were drawn', term.frames > 20);
check('saves happened', repo.saved > 0);
console.log(failures ? `\n${failures} check(s) failed` : '\nall TUI checks passed');
process.exit(failures ? 1 : 0);
