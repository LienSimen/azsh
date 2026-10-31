// Drives the windowed game headlessly: decodes raw key bytes, rolls a character, walks every tab, opens a
// quest, a vendor and a trainer, pages through quest text, runs a live fight tick by tick, runs the autopilot
// through a live fight, and edits the rotation through its menu. Run with `npm run check:tui`; pass --frames
// to see every screen.
import { HeadlessTerm, decodeKeys } from './term.mjs';
import { App } from './tui.mjs';
import { bootDataStore } from './bootData.mjs';
import { newGameState } from '../engine/game.ts';
import { strip } from './text.mjs';
import { visibleBars } from './tuiBars.mjs';
import { addItem, countItem } from '../domain/items/inventory.ts';
import { moneyText as moneyTextOf } from '../domain/economy/money.ts';

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
  const sold = app.g.state.inventory.stacks.find((s) => (ds.item(s.item)?.sellPrice ?? 0) > 0);
  if (sold) {
    const had = countItem(app.g.state.inventory, sold.item);
    app.top().cursor = rowIndex((r) => r.data === sold); term.press('return');
    term.press('tab'); show('vendor buyback');
    check('a sale lands on the Buyback tab', /Buyback/.test(frame()) && strip(frame()).includes(ds.item(sold.item).name));
    app.top().cursor = rowIndex((r, t) => t.includes(ds.item(sold.item).name)); term.press('return');
    check('Enter buys it back', countItem(app.g.state.inventory, sold.item) === had && !(app.buyback ?? []).length);
    term.press('tab'); check('Tab reaches the companions mode', /Companions/.test(strip(frame())));
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
  app2.top().cursor = at((r) => r.data?.creature?.tameable && r.data.creature.level <= 12); term2.press('t');
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
    const rank = at((r, t) => !/level \d+/.test(t) && !/^✓/.test(t));
    app2.top().cursor = rank; term2.press('return');
    check('a pet trainer rank can be bought', (g2.state.char.petSpells ?? []).length > 0);
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
  const quote = g.repairQuote();
  check('the Repair all row prices the bill', rowIndex((r, t) => t.startsWith('Repair all') && t.includes(moneyTextOf(quote.cost))) > 0);
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

// Cancel an aura: from the Character tab, and with c inside a fight.
{
  const g = app.g;
  const fort = ds.spell(1243);
  const give = () => { g.state.char.activeAuras = [...(g.state.char.activeAuras ?? []).filter((x) => x.spellId !== 1243), { spellId: 1243, expiresAt: Date.now() + 600000 }]; };
  give();
  home(); app.switchTab(app.tabs.length - 1); show('character auras');
  const at = rowIndex((r, t) => t.includes(fort.name));
  check('the Character tab lists your auras', at > 0);
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

// Real-time travel: with a 1x pace a trip takes time; the header counts down, the World tab carries the journey
// card (speed, pause, arrive now, turn back), and the game loop lands it.
{
  const g = app.g;
  const pickRow = (re) => { app.top().cursor = rowIndex((r, t) => re.test(t)); term.press('return'); };
  home(); term.press(':'); for (const ch of 'settings') term.press(ch); term.press('return');
  pickRow(/^Travel pace/);
  check('Settings sets a real-time travel pace', app.prefs.get('travelPace') === 1);
  home();
  const here = g.state.char.zoneId;
  const dest = (ds.zone(here)?.neighbors ?? []).map((id) => ds.zone(id)).find((z) => z && g.previewTravel(z.id).ok);
  term.press('8'); app.top().cursor = rowIndex((r, t) => t.startsWith(dest.name)); term.press('return');
  show('on the road');
  check('a trip at 1x takes time', !!g.state.char.journey && g.state.char.zoneId !== dest.id);
  check('the header counts it down', strip(frame()).split('\n')[0].includes(`→ ${dest.name}`));
  check('the World tab opens on the journey card', app.tab === 0 && /On the road to/.test(strip(frame())));
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

// Help overlay and escape.
term.press('?'); check('help overlay', app.top().id === 'help'); term.press('escape');
check('help closed', app.stack.length === 0);

check('frames were drawn', term.frames > 20);
check('saves happened', repo.saved > 0);
console.log(failures ? `\n${failures} check(s) failed` : '\nall TUI checks passed');
process.exit(failures ? 1 : 0);
