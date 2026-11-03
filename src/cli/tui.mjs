// The windowed game. One full-screen frame: header (name, pools, tabs), a cursor-driven list with a
// detail pane beside it, a scrolling log and a hint line. Tabs are the places you can be (World, Quests,
// Bags...), dialogs stack on top (a vendor, a quest, a picker), and a live fight takes the whole middle.
// Everything here only reads and prints; every verb is a Game facade call (src/engine/game/types.ts).
import { bootDataStore } from './bootData.mjs';
import { FileSaveRepository } from './fileRepository.mjs';
import { RealTerm } from './term.mjs';
import { createCommands } from './repl.mjs';
import { makeTabs, deathView } from './tuiViews.mjs';
import { cityAccess, bankDialog, auctionDialog, mailDialog } from './tuiCity.mjs';
import { startFight, startAutopilot } from './tuiFight.mjs';
import { openRun, runCleared, holdRunLonger } from './tuiDungeon.mjs';
import { openLoot } from './tuiLoot.mjs';
import { fightPaneRule, fightPaneLines, cycleFightPane, nextPaneId, fightPane } from './tuiFightPanes.mjs';
import { MemoryPrefs, FilePrefs } from './prefs.mjs';
import { settingsDialog, globalSettingsOpts, refreshMs } from './tuiSettings.mjs';
import { autopilotSettingsDialog } from './tuiAutopilotSettings.mjs';
import { runStripLine, runHeaderLine, bagsPaneKey } from './tuiAutopilot.mjs';
import { macrosDialog, runMacro } from './tuiMacros.mjs';
import { outfitterDialog } from './tuiOutfitter.mjs';
import { journeyHeader, journeyTick } from './tuiWorld.mjs';
import { reputationDialog } from './tuiRep.mjs';
import { honorDialog, weeklyHonorPass } from './tuiHonor.mjs';
import { devCommand } from './tuiDev.mjs';
import { savePicker } from './tuiSaves.mjs';
import { wikiDialog } from './tuiWiki.mjs';
import { bold, dim, cyan, yellow, green, red, inverse, fit, vis, cut, bar, pct, brightYellow, magenta, brightBlue, strip, qualityPaint, coinText } from './text.mjs';
import { iconsOn, iconArt, iconBlank, wrapIconLines } from './iconArt.mjs';
import { createGame } from '../engine/game.ts';
import { toSave } from '../persistence/saveShape.ts';
import { className, raceName } from '../domain/core/ids.ts';
import { characterCreation } from './tuiCreate.mjs';
import { missingHdBytes, downloadHdArt, downloadDir } from './hdArt.mjs';
import { forgetHdArt } from './modelArt.mjs';
import { sixelOn } from './sixel.mjs';
import { coinsText } from '../domain/economy/money.ts';
import { maxHealth, maxPower } from '../domain/character/character.ts';
import { powerType } from '../domain/character/characterStats.ts';
import { addItem } from '../domain/items/inventory.ts';

const POWER_PAINT = { mana: brightBlue, rage: red, energy: yellow, focus: yellow };
/** Digit key → tab index: 1-9 are the first nine, 0 the tenth. */
const digitTab = (k) => (k === '0' ? 9 : Number(k) - 1);
const MOVE_KEYS = new Set(['up', 'down', 'j', 'k', 'pageup', 'pagedown', 'home', 'end']);
/** A view's hint and its labelled keys, as "k: what it does" items. */
const viewKeyHints = (view) => [...(view?.hint ? [view.hint] : []), ...Object.entries(view?.keys ?? {}).filter(([, v]) => v.hint).map(([k, v]) => `${k === 'space' ? 'Space' : k}: ${v.hint}`)];
const HELP_LINES = [
  'Moving around',
  '  1-9 0 / Tab / Left Right switch tab             Up Down j k     move the cursor',
  '  Enter                    act on the row          Esc             close the window on top (or back to World)',
  '  PgUp PgDn                page the list or text   Home End        first / last row',
  '  l                        open the full log       :               command line (same verbs as the line game)',
  '  /                        search the wiki: items, spells, quests, NPCs, zones, dungeons (:wiki <words>)',
  '  s (World tab)            find a thing in this zone: a vendor, a trainer, who sells an item, what drops it.',
  '                           a in the search (or S on World) widens it to the whole world. Enter goes or opens.',
  '  z                        sit and rest 30 s       ?               this help',
  '  Ctrl-C / :quit           save and leave          Ctrl-L          repaint a garbled screen',
  '  c (World tab) / :logout  save and go back to the character list',
  '',
  'In the world',
  '  Enter on a creature starts a live fight; f fights it instantly. Enter on a quest, vendor, trainer or',
  '  exit opens it. a shows what the autopilot will do; Enter hands the character over: it quests and hunts',
  '  on its own and its panel shows what it is doing, what comes next and what will stop it. Its fights play',
  '  live inside that panel (w takes the keys: 1-0 press the action bar; w or Esc hands them back). Esc stops the run, space',
  '  pauses it, 1-9 browse the tabs under a run strip, Tab cycles the bottom pane (the Run pane lists every',
  '  step). At 4x and up the log folds to one line a fight. For a CRT look, turn on your terminal\'s retro',
  '  effect (Windows Terminal: "experimental.retroTerminalEffect": true on the profile).',
  '  A quest it dies on 2 times or cannot finish is skipped for the rest of the session. Quests tab: d (or Do',
  '  the quest in the quest window) runs it on that one quest. :autopilot (or A) sets how it rests, pulls, fights and quests.',
  '  In a capital the World tab lists the Bank, the Auction House and the Mailbox under Services.',
  '  Rogues: P on a creature picks its pocket (Stealth first). A resist starts the fight.',
  '  :honor: your PvP rank, the arena (1v1 to 5v5), Warsong Gulch and Arathi Basin (pick your job, watch it play,',
  '  space pauses, + speeds up) and Alterac Valley (a raid run).',
  '  Dungeons: Enter on a portal opens its card (route, who walks in, supplies). In the run window Enter',
  '  pulls a stop, uses a gate or opens a chest; z rests, F finishes the run unwatched, L leaves, R resets.',
  '  W walks the floor instead: pick a place, the party walks the nav mesh, patrols walk, and what sees you pulls.',
  '',
  'Gear and bags',
  '  Character tab: your gear around you. Enter on a slot lists everything in your bags (and the bank, in a bank town) that fits it.',
  '  Your stats sit under the tooltip; s opens the rest: weapon skills, professions, auras, home, pet, honor, reputation.',
  '  ▲ marks an upgrade the equipment helper found; u puts on every upgrade at once, x takes a piece off.',
  '  r repairs one piece, R everything; o opens the Outfitter (gear sets). :outfit <name> wears a set from anywhere.',
  '  In a big enough window the Character tab is a paperdoll (the Talents tab the three trees): Up and Down walk the icons in order, Shift+arrows move across them.',
  '  Bags tab: Enter uses, equips, opens, unwraps or learns; m lists every verb for the stack. s sells to the open',
  '  vendor, j sells junk, b opens the bank, d destroys, S sorts, / splits a stack, [ ] move it, A uses the whole stack.',
  '  D lists every green, blue or epic the group can disenchant; L lists every book someone can learn. G runs it.',
  '  X marks several stacks to destroy at once; Q marks the quest items left over from quests you turned in. G destroys.',
  '  :dev item|quest|recipe|prof skips the rules (testing). New character offers a random world bot.',
  '  Settings tab (or :settings) sets auto-loot, the upgrade helper, auto-disenchant, the junk rules and which nodes get gathered.',
  '  Spells tab: b edits your action bars, m your macros. :macro <name> runs one; a macro on bar 1 fires by its key in a fight.',
  '  Loot: with :autoloot off a corpse opens the loot window. Enter takes a row, a takes all, Esc leaves the rest.',
  '',
  'In a fight',
  '  1-9 press an ability    a toggle auto-play    space pause    + - speed    l log    Esc run away',
  '  t gives a companion an order: attack a target, cast one ability, or hold ground (the fight waits).',
  '  c cancels one of your buffs (also from s on the Character tab, out of a fight).',
  '  r (in a fight you started with Enter) fights the same creature again after each win, until r again or Esc.',
  '  The ability bar runs along the bottom of the stage with its cooldowns; a takes the keys off the rotation.',
  '',
  'Professions and Companions',
  '  Professions: Enter on a profession opens its recipe book. Enter makes one, A makes all you can, N asks',
  '  how many. Short vendor reagents (vials, thread, flux) are bought from your purse as you craft. c in a',
  '  book switches the crafter to a companion; they craft from the bags and banks of the whole party.',
  '  g (Bags, Professions, Companions) sends trade goods to the companions who craft with them and puts',
  '  upgrades on whoever gains. Companions are hired at an inn; their page has gear, bags and professions.',
  '',
  'Rotation tab',
  '  The rotation is what auto-play casts for you. Rules are checked top to bottom every tick and the',
  '  first one whose conditions hold fires. Enter on a rule opens its menu; Enter on "+ Add" adds one.',
  '  D runs the rotation against a target dummy and reads the parse (DPS, casts, what did the damage).',
];

export class App {
  constructor({ term, ds, repo, prefs }) {
    this.term = term; this.ds = ds; this.repo = repo; this.prefs = prefs ?? new MemoryPrefs();
    this.g = null; this.slot = null; this.createdAt = Date.now();
    this.tabs = []; this.tab = 0;
    this.stack = [];
    this.log = []; this.logScroll = 0;
    this.flash = null;
    this.vendor = null;
    this.fight = null; this.auto = null; this.fightSpeed = 1;
    this.fightPane = 'log'; this.meterSort = 'damage'; this.meter = null; this.lootTally = null; // the fight's bottom pane
    this.cmd = null;
    this.closed = false;
    this.timers = [];
    this.lastPaint = 0; this.paintTimer = null; // renderSoon holds timer-driven repaints to the Screen refresh setting
    this.lastActivity = null;
    term.onKey = (k) => { try { this.onKey(k); } catch (err) { this.say(red(`Error: ${err.message}`)); if (process.env.AZSH_DEBUG) this.say(dim(String(err.stack).split('\n').slice(1, 4).join(' '))); this.render(); } };
    term.onResize = () => this.render();
    term.onSixel = () => setImmediate(() => this.offerHdArt());
  }

  // ---- full-size art -----------------------------------------------------------------------------

  /** The terminal draws sixel and the full-size art is not here: offer it once a run, unless told never. */
  offerHdArt() {
    const bytes = missingHdBytes();
    if (!bytes || this.closed || this.hdOffered || this.prefs.get('hdArt') === 'never') return;
    this.hdOffered = true;
    const mb = Math.round(bytes / 1e6);
    this.pick(`Your terminal draws real pixels. Download the full-size art (${mb} MB)?`, [
      { label: `Download now  ${dim(`${mb} MB into ${downloadDir()}`)}`, value: 'yes' },
      { label: `Not now  ${dim('asked again next time; :art download fetches it')}`, value: 'later' },
      { label: `Never ask  ${dim(':art download still fetches it')}`, value: 'never' },
    ], (v) => { if (v === 'yes') this.fetchHdArt(); else if (v === 'never') this.prefs.set('hdArt', 'never'); });
  }

  /** Fetch the full-size art in the background, progress on the hint row; the screen repaints in it when done. */
  fetchHdArt() {
    if (this.hdFetching) return;
    this.hdFetching = true;
    let shown = 0;
    this.flashMsg('Downloading the full-size art...');
    this.render();
    void downloadHdArt((done, total) => {
      if (Date.now() - shown < 250) return;
      shown = Date.now();
      this.flashMsg(`Downloading the full-size art: ${Math.round(done / 1e6)} of ${Math.round(total / 1e6)} MB`);
      this.render();
    }).then((res) => {
      this.hdFetching = false;
      if (this.closed) return;
      if (res.ok) { forgetHdArt(); this.flash = null; this.say(green('Full-size art downloaded: creatures, characters and icons draw in real pixels.')); this.term.refresh?.(); }
      else this.say(red(`The art download stopped: ${res.reason}. :art download tries again.`));
      this.render();
    });
  }

  // ---- game lifecycle ---------------------------------------------------------------------------

  /** `updatedAt` is when the save was last written: the gap since is offline rest and regen. */
  startGame(state, slot, createdAt, isNew, updatedAt) {
    // Another terminal already playing this character would trade overwrites with us on every save.
    const held = this.repo.lock?.(slot) ?? { ok: true };
    if (!held.ok) { this.say(red(`${state.char.name} is open in another terminal (pid ${held.pid}). Close it there first.`)); return false; }
    this.slot = slot; this.createdAt = createdAt ?? Date.now();
    const awayMs = updatedAt > 0 ? Math.max(0, Date.now() - updatedAt) : 0;
    // Travel pace is a setting (instant by default, like phonecraft); `skipping` lets Arrive now land a trip at any pace.
    // wallWorldClock: aura and cooldown stamps on Date.now(), the clock every screen reads. Without it they ride the
    // fight chain, which runs hours ahead once fights resolve faster than real time (Forbearance showing 8h).
    const g = createGame(this.ds, state, { travelPace: () => (this.skipping ? 'instant' : this.prefs.get('travelPace') ?? 'instant'), offlineTimeMs: awayMs, wallWorldClock: true, ...globalSettingsOpts(this.prefs) });
    this.g = g;
    if (g.state.char.journey) { if (this.prefs.get('travelPace') === 'instant') this.arriveNow(); else g.journeyTick(); }
    // Real createInfo has no starting weapon (ETL gap KI-003); phonecraft's harness hands one over too.
    if (isNew && g.state.char.equipped.mainhand == null) {
      const weapon = this.ds.allItems().find((i) => i.slot === 'mainhand' && i.requiredLevel <= 1);
      if (weapon) { g.state.inventory = addItem(g.state.inventory, weapon.entry, 1, 1); g.equip(weapon.entry); }
    }
    this.cmds = createCommands({ g, ds: this.ds, out: (s) => this.say(s), persist: () => this.persist(), slot, arrive: () => !g.state.char.journey, skipJourney: () => this.arriveNow() });
    this.tabs = makeTabs(this);
    this.stack = [];
    this.lastActivity = g.state.activity[0] ?? null;
    this.inRunId = g.state.instance?.dungeonId ?? null; // holdRunLonger's last seen run, per character
    this.say(bold(`Welcome${isNew ? '' : ' back'}, ${g.state.char.name}.`) + dim('  Press ? for the keys.'));
    if (awayMs >= 60_000) this.offlineRest(Math.floor(awayMs / 1000));
    weeklyHonorPass(this); // a maintenance day passed while away scores that week
    if (g.state.instance && !runCleared(this)) openRun(this);
    openLoot(this); // an opened bag item's remainder is still claimable after a reload
    if (!this.term.isTTY) return;
    // Out-of-combat regeneration ticks in real time, like standing still in the world.
    this.timers.push(this.term.setInterval(() => { if (!this.fight && !this.auto && !this.closed) { this.idleTick(1); journeyTick(this); this.render(); } }, 1000));
  }

  /** Time away from the game: rested xp at the logout rate (Player::ComputeRest), and an hour of regen at most. */
  offlineRest(awaySec) {
    const g = this.g, before = g.state.char.restedXp ?? 0;
    g.accrueOfflineRest(awaySec);
    if (!this.isDead()) g.regenTick(Math.min(3600, awaySec), false, { restAlreadyBooked: true });
    const gained = (g.state.char.restedXp ?? 0) - before;
    const away = awaySec >= 86400 ? `${Math.floor(awaySec / 86400)} d` : awaySec >= 3600 ? `${Math.floor(awaySec / 3600)} h` : `${Math.floor(awaySec / 60)} min`;
    this.say(dim(`You were away ${away}.${gained > 0 ? ` +${gained} rested xp.` : ''}`));
  }

  /** Land the current trip now, whatever the travel pace. */
  arriveNow() {
    this.skipping = true;
    try { return this.g.completeJourneyNow(); } finally { this.skipping = false; }
  }

  async persist() {
    if (!this.g) return;
    try { await this.repo.save(toSave(this.slot, this.g.snapshot(), Date.now(), this.createdAt)); }
    catch (err) { this.say(red(`save failed: ${err.message}`)); }
  }

  idleTick(seconds, sitting = false) {
    if (!this.g || this.isDead()) return;
    this.g.regenTick(seconds, sitting);
  }

  async quit() {
    if (this.closed) return;
    this.closed = true;
    for (const t of this.timers) this.term.clearInterval(t);
    clearTimeout(this.paintTimer);
    this.fight?.stop?.(); this.auto?.stop?.();
    await this.persist();
    if (this.slot != null) this.repo.unlock?.(this.slot);
    this.term.close();
    this.restoreConsole?.();
    if (this.g) console.log(dim(`Saved ${this.g.state.char.name}. Farewell.`));
    this.onQuit?.();
  }

  /** Save, let go of the character and go back to the character picker. Not in the middle of a fight or a run. */
  async logout() {
    if (!this.g) return;
    if (this.fight || this.auto) { this.flashMsg('Finish the fight or stop the run first.'); this.render(); return; }
    for (const t of this.timers) this.term.clearInterval(t);
    this.timers = [];
    await this.persist();
    if (this.slot != null) this.repo.unlock?.(this.slot);
    this.say(dim(`Saved ${this.g.state.char.name}.`));
    this.g = null; this.slot = null; this.cmds = null; this.vendor = null;
    this.tabs = []; this.tab = 0; this.stack = [];
    this.meter = null; this.lootTally = null; this.lastActivity = null;
    await this.toPicker?.();
    this.render();
  }

  // ---- small helpers the views lean on -------------------------------------------------------------

  get ch() { return this.g.state.char; }
  zone() { return this.ds.zone(this.g.state.char.zoneId); }
  isDead() { if (!this.g) return false; const s = this.g.deathFlowStatus(); return !!s && s.deathState !== 'ALIVE' && s.deathState !== 'JUST_ALIVED'; }
  hpText() { return `${this.ch.health}/${maxHealth(this.ch, this.ds)}`; }
  pwText() { return `${this.ch.power}/${maxPower(this.ch, this.ds)}`; }
  itemName(entry) { return this.ds.item(entry)?.name ?? `item ${entry}`; }
  /** The item's name painted in its quality colour; for anything the player reads, not for sorting. */
  itemLabel(entry) { return qualityPaint(this.ds.item(entry)?.quality)(this.itemName(entry)); }
  spellName(id) { const s = this.ds.spell(id); return s ? `${s.name}${s.rank ? ` (Rank ${s.rank})` : ''}` : `spell ${id}`; }
  /** Report an ActionResult: ok text in green, refusal in red. Returns ok. */
  result(res, okText) {
    if (res.ok) { if (okText) this.say(green(okText)); }
    else this.say(red(res.reason || 'Nothing happened.'));
    return res.ok;
  }

  say(line) {
    for (const l of String(line).split('\n')) this.log.push(l);
    if (this.log.length > 2000) this.log.splice(0, this.log.length - 2000);
    this.logScroll = 0;
  }
  flashMsg(text) { this.flash = { text, until: Date.now() + 4000 }; }
  /** Pull new engine activity lines into the log. */
  flushActivity() {
    if (!this.g) return;
    const act = this.g.state.activity;
    const idx = this.lastActivity == null ? act.length : act.indexOf(this.lastActivity);
    const fresh = act.slice(0, idx < 0 ? act.length : idx);
    // The views already said most of these in their own words; skip an engine line that repeats one.
    const norm = (s) => strip(s).toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ').trim();
    const recent = this.log.slice(-6).map(norm);
    // Engine lines carry money as private-use coin markers (moneyMarked); spell them out as g/s/c.
    for (const line of fresh.reverse().map(coinsText)) {
      const n = norm(line);
      if (recent.some((r) => r.includes(n) || n.includes(r))) continue;
      this.say(dim('· ' + line));
    }
    this.lastActivity = act[0] ?? null;
  }

  top() { return this.stack.length ? this.stack[this.stack.length - 1] : this.tabs[this.tab]?.view ?? null; }
  push(view) { view.cursor ??= 0; view.scroll ??= 0; this.stack.push(view); this.render(); }
  pop() { const v = this.stack.pop(); v?.onClose?.(this); this.render(); }
  popTo(id) { while (this.stack.length && this.stack[this.stack.length - 1].id !== id) this.stack.pop(); }
  switchTab(i) { if (i >= 0 && i < this.tabs.length) { this.tab = i; this.stack = []; this.render(); } }

  /** A list picker: options are { label, detail?, value }. onPick(value) runs after the picker closes. */
  pick(title, options, onPick, { hint, keepOpen } = {}) {
    const view = {
      id: 'pick', title, hint: hint ?? 'Enter: choose   Esc: back',
      rows: () => options.map((o) => ({ text: o.label, icon: o.icon, sub: o.sub, data: o.value, detail: o.detail ? () => (typeof o.detail === 'function' ? o.detail() : o.detail) : undefined, act: () => { if (!keepOpen) this.pop(); onPick(o.value, o); } })),
      noDetail: !options.some((o) => o.detail),
    };
    this.push(view);
    return view;
  }
  confirm(text, onYes) {
    this.pick(text, [{ label: 'Yes', value: true }, { label: 'No', value: false }], (v) => { if (v) onYes(); });
  }
  /** A one-line text prompt on the hint row. */
  prompt(label, onSubmit, initial = '') { this.cmd = { label, text: initial, onSubmit }; this.render(); }

  // ---- input -------------------------------------------------------------------------------------

  onKey(k) {
    if (k === 'ctrl-c') { void this.quit(); return; }
    if (this.cmd) return this.cmdKey(k);
    // The log window can sit on top of a fight or an autopilot run: it only scrolls and closes.
    if (this.top()?.id === 'log' && (this.fight || this.auto)) {
      if (k === 'escape' || k === 'l') this.pop();
      else if (MOVE_KEYS.has(k)) this.viewKey(k);
      return;
    }
    if (this.fight && this.stack.length) {
      // Party orders sit over a paused fight: the pickers take the keys until the last one closes.
      if (k === 'escape') this.pop(); else this.viewKey(k);
      if (!this.stack.length) { this.fight?.onOrdersClosed?.(); this.render(); }
      return;
    }
    if (this.fight && !this.inlineFight()) {
      // The full fight view. Under the autopilot Esc goes back to the run panel; the fight plays on.
      if ((k === 'escape' || k === 'w') && this.auto && this.fight.label === 'autopilot') { this.auto.watchFight = false; this.render(); return; }
      this.fight.key(k); return;
    }
    if (this.auto) {
      // The run's panel holds the screen, fights included. A tab key browses the tabs, and a browsed tab works as
      // it does without a run (Enter acts, its own keys act): the run plays on underneath, under the run strip.
      // Esc or w on a tab comes back to the run; Esc on the panel stops it; w on a fight opens the full view.
      const auto = this.auto, f = this.fight;
      // A window on top (a dialog a tab or the Bags pane opened) takes the keys until it closes.
      if (this.stack.length && this.top()?.id !== 'log') { if (k === 'escape') this.pop(); else this.viewKey(k); return; }
      if (auto.browsing) {
        if (k === 'escape' || k === 'w') { auto.browsing = false; this.stack = []; this.render(); return; }
        if (k === 'l' && !this.top()?.keys?.l) { this.openLog(); return; }
        if (/^[0-9]$/.test(k)) { this.switchTab(digitTab(k)); return; }
        if (k === 'tab' || k === 'right') { this.switchTab((this.tab + 1) % this.tabs.length); return; }
        if (k === 'shift-tab' || k === 'left') { this.switchTab((this.tab + this.tabs.length - 1) % this.tabs.length); return; }
        if (k === '?') { this.push(this.helpView()); return; }
        this.viewKey(k);
        return;
      }
      // The Bags pane at the bottom has its own cursor; Enter there uses the item under it.
      if (fightPane(this) === 'bags' && (MOVE_KEYS.has(k) || k === 'return') && bagsPaneKey(this, k)) return;
      // Over a win's hold there is nothing to run from: the hold lets go and the run stops.
      if (k === 'escape' || k === 'q') { if (f && !f.holding) f.flee(); else { f?.release(); if (this.auto === auto) auto.end('you stopped it'); } return; }
      if (k === 'space') { auto.paused = !auto.paused; if (f) f.paused = auto.paused; this.render(); return; }
      if (k === 'l') { this.openLog(); return; }
      if ((k === 'w' || k === 'return') && f) { auto.watchFight = true; this.render(); return; }
      if (k === 'a' && f) { auto.watchFight = true; f.key('a'); return; } // play it yourself: needs the ability bar
      if ((k === '+' || k === '=' || k === '-') && f) { f.key(k); return; } // the fight owns the clock while it runs
      if (k === '+' || k === '=') { this.fightSpeed = Math.min(8, this.fightSpeed * 2); this.render(); return; }
      if (k === '-') { this.fightSpeed = Math.max(0.5, this.fightSpeed / 2); this.render(); return; }
      if (/^[0-9]$/.test(k)) { auto.browsing = true; this.switchTab(digitTab(k)); return; }
      // Watching the run, Tab cycles the bottom pane; the arrows step onto the tabs.
      if (k === 'tab' || k === 'shift-tab') { cycleFightPane(this, k === 'tab' ? +1 : -1); return; }
      if (k === 'right') { auto.browsing = true; this.switchTab((this.tab + 1) % this.tabs.length); return; }
      if (k === 'left') { auto.browsing = true; this.switchTab((this.tab + this.tabs.length - 1) % this.tabs.length); return; }
      return;
    }
    if (!this.g) { if (!this.viewKey(k) && k === 'escape' && this.stack.length > 1) this.pop(); return; }
    if (k === ':') { this.prompt(':', (line) => this.runCommand(line)); return; }
    if (k === '?') { this.push(this.helpView()); return; }
    if (k === 'l' && this.top()?.id !== 'log' && !this.top()?.keys?.l) { this.openLog(); return; }
    if (this.isDead() && this.top()?.id !== 'death') { this.push(deathView(this)); return; }
    if (k === 'z' && !this.stack.length) { this.idleTick(30, true); this.say(dim(`You sit and rest for 30 s.  HP ${this.hpText()}  ${this.pwText()}`)); this.afterAction(); return; }
    if (this.viewKey(k)) return;
    // / anywhere a view does not use it: look something up in the wiki.
    if (k === '/') { const w = wikiDialog(this); this.push(w); w.keys['/'].fn(this); return; }
    if (!this.stack.length) {
      if (/^[0-9]$/.test(k)) { this.switchTab(digitTab(k)); return; }
      if (k === 'tab' || k === 'right') { this.switchTab((this.tab + 1) % this.tabs.length); return; }
      if (k === 'shift-tab' || k === 'left') { this.switchTab((this.tab + this.tabs.length - 1) % this.tabs.length); return; }
      if (k === 'escape' && this.tab !== 0) { this.switchTab(0); return; }
    }
    if (k === 'escape' && this.stack.length) { this.pop(); return; }
  }

  /** The whole log as a window: arrows and PgUp/PgDn move through it, Esc closes. */
  openLog() {
    const view = {
      id: 'log', title: 'Log', hint: 'Up Down PgUp PgDn: scroll', noDetail: true,
      rows: () => this.log.map((t) => ({ text: t, header: true })),
    };
    this.push(view);
    view.scroll = Math.max(0, this.log.length - this.layout().mainH);
    this.render();
  }

  /** Give the key to the active view: its row keys, its view keys, cursor movement, Enter. */
  viewKey(k) {
    const view = this.top();
    if (!view) return false;
    const rows = this.rowsOf(view);
    const row = rows[view.cursor];
    if (row?.keys?.[k]) { row.keys[k](this, row); this.afterAction(); return true; }
    if (view.keys?.[k]) { view.keys[k].fn(this, row); this.afterAction(); return true; }
    if (view.onKey?.(this, k, row)) { this.afterAction(); return true; }
    // A view drawn as an icon grid (the paperdoll, the talent trees): Up and Down still walk its rows in order
    // and Left and Right still change tabs; Shift+arrows move on the picture in two dimensions.
    const gridDir = { 'shift-up': 'up', 'shift-down': 'down', 'shift-left': 'left', 'shift-right': 'right' }[k];
    if (view.gridNav && gridDir) {
      const to = view.gridNav(gridDir, view.cursor);
      if (to != null) view.cursor = to;
      this.render();
      return true;
    }
    switch (k) {
      case 'up': case 'k': this.moveCursor(view, rows, -1); return true;
      case 'down': case 'j': this.moveCursor(view, rows, +1); return true;
      case 'home': view.cursor = Math.max(0, rows.findIndex((r) => !r.header)); view.scroll = 0; this.render(); return true;
      case 'end': { let i = rows.length - 1; while (i > 0 && rows[i].header) i--; view.cursor = i; this.ensureVisible(view, rows); const L = this.layout(); view.scroll = this.maxScrollOf(rows, L.mainH, this.listWOf(view, L)); this.render(); return true; }
      case 'pageup': case 'pagedown': this.pageView(view, rows, k === 'pageup' ? -1 : +1); return true;
      case 'return': case 'space': if (row && !row.header && row.act) { row.act(this, row); this.afterAction(); } return true;
      default: return false;
    }
  }

  moveCursor(view, rows, delta) {
    let i = view.cursor + delta;
    while (i >= 0 && i < rows.length && rows[i].header) i += delta;
    if (i >= 0 && i < rows.length) { view.cursor = i; this.ensureVisible(view, rows); }
    else {
      // No selectable row that way: scroll the pane instead so long text can be read.
      const L = this.layout();
      const maxScroll = this.maxScrollOf(rows, L.mainH, this.listWOf(view, L));
      view.scroll = Math.max(0, Math.min(maxScroll, view.scroll + delta));
    }
    this.render();
  }
  /** Scroll the pane by a page; the cursor follows onto a selectable row inside the new window when there is one. */
  pageView(view, rows, dir) {
    const L = this.layout(), h = L.mainH, listW = this.listWOf(view, L);
    const maxScroll = this.maxScrollOf(rows, h, listW);
    view.scroll = Math.max(0, Math.min(maxScroll, (view.scroll ?? 0) + dir * Math.max(1, h - 1)));
    const end = this.windowEnd(rows, view.scroll, h, listW);
    const inWindow = (i) => i >= view.scroll && i < end;
    if (!inWindow(view.cursor)) {
      const from = dir > 0 ? view.scroll : end - 1;
      let i = from;
      while (i >= view.scroll && i < end && rows[i]?.header) i += dir;
      if (inWindow(i) && rows[i] && !rows[i].header) view.cursor = i;
    }
    this.render();
  }
  ensureVisible(view, rows) {
    const L = this.layout(), h = L.mainH, listW = this.listWOf(view, L);
    if (view.cursor < view.scroll) view.scroll = view.cursor;
    while (view.scroll < view.cursor && this.windowEnd(rows, view.scroll, h, listW) <= view.cursor) view.scroll++;
    view.scroll = Math.max(0, Math.min(view.scroll, this.maxScrollOf(rows, h, listW)));
  }
  /** The list's width in a layout: the whole pane when the view has no detail column. */
  listWOf(view, L) { return L.detailW > 0 && !view.noDetail ? L.listW : L.W; }
  /** Lines a row takes: two for a row with an icon when icons draw and the list has room for them. */
  rowH(r, listW) { return r.icon && listW >= 40 && iconsOn() ? 2 : 1; }
  /** The first row a window of `h` lines from `scroll` does not show (rows fit whole). */
  windowEnd(rows, scroll, h, listW) {
    let used = 0, i = scroll;
    while (i < rows.length && used + this.rowH(rows[i], listW) <= h) { used += this.rowH(rows[i], listW); i++; }
    return Math.max(i, scroll + 1);
  }
  /** The largest scroll that still fills the window from the end. */
  maxScrollOf(rows, h, listW) {
    let used = 0, s = rows.length;
    while (s > 0 && used + this.rowH(rows[s - 1], listW) <= h) { used += this.rowH(rows[s - 1], listW); s--; }
    return s;
  }
  rowsOf(view) {
    const rows = view.rows(this) ?? [];
    view.cursor = Math.max(0, Math.min(view.cursor ?? 0, rows.length - 1));
    if (rows[view.cursor]?.header) {
      let i = rows.findIndex((r, j) => j >= view.cursor && !r.header);
      if (i < 0) i = rows.findIndex((r) => !r.header);
      view.cursor = Math.max(0, i);
    }
    return rows;
  }

  /** After any state-changing key: pull activity, save, repaint. */
  afterAction() {
    journeyTick(this);
    holdRunLonger(this);
    this.flushActivity();
    if (this.g) void this.persist();
    if (this.g && this.isDead() && this.top()?.id !== 'death' && !this.fight) this.push(deathView(this));
    this.render();
  }

  cmdKey(k) {
    const c = this.cmd;
    if (k === 'escape') { this.cmd = null; this.render(); return; }
    if (k === 'return') { this.cmd = null; const text = c.text.trim(); this.render(); if (text) c.onSubmit(text); return; }
    if (k === 'backspace') c.text = c.text.slice(0, -1);
    else if (k === 'space') c.text += ' ';
    else if (k.length === 1) c.text += k;
    this.render();
  }

  /** The `:` line runs the line game's verbs; a few are rerouted to the windowed versions. */
  async runCommand(line) {
    const [, cmd = '', args = ''] = line.match(/^(\S+)\s*(.*)$/) ?? [];
    const c = cmd.toLowerCase();
    if (c === 'quit' || c === 'exit' || c === 'q') { await this.quit(); return; }
    if (c === 'logout' || c === 'characters') { await this.logout(); return; }
    if (c === 'auto') { const m = args.match(/^(\d+)?\s*(?:farm\s+(.+))?$/i); startAutopilot(this, m?.[1] ? Number(m[1]) : Infinity, m?.[2]); return; }
    if (c === 'art') {
      const missing = missingHdBytes();
      if (args.trim().toLowerCase() === 'download') { if (missing) this.fetchHdArt(); else this.say('The full-size art is all here.'); this.render(); return; }
      const how = sixelOn() ? green('this terminal draws real pixels') : yellow('this terminal draws half-block art (no sixel)');
      this.say(`Art: ${how}; ${missing ? `${Math.round(missing / 1e6)} MB of full-size art not downloaded (:art download)` : `full-size art in ${downloadDir()}`}.`);
      this.render();
      return;
    }
    if (c === 'autoloot') {
      const want = args.trim().toLowerCase();
      if (want === 'on' || want === 'off') this.prefs.set('autoLoot', want === 'on');
      this.say(`Auto-loot is ${this.prefs.get('autoLoot') !== false ? green('on') : yellow('off')}. ${dim(':autoloot on|off')}`);
      this.render();
      return;
    }
    if (c === 'settings' || c === 'options') { this.push(settingsDialog(this)); return; }
    if (c === 'autopilot') { this.push(autopilotSettingsDialog(this)); return; }
    if (c === 'rep' || c === 'reputation') { this.push(reputationDialog(this)); return; }
    if (c === 'honor' || c === 'pvp') { this.push(honorDialog(this)); return; }
    if (c === 'wiki' || c === 'w') { this.push(wikiDialog(this, args.trim())); return; }
    if (c === 'dev') { this.say(cyan(`> ${line}`)); devCommand(this, args); this.afterAction(); return; }
    if (c === 'macro' || c === 'macros') {
      const name = args.trim();
      if (!name) { this.push(macrosDialog(this)); return; }
      const def = this.g.macroByName(name);
      if (def) runMacro(this, def); else this.say(red(`No macro called ${name}.`));
      this.afterAction();
      return;
    }
    if (c === 'outfit') {
      if (!args.trim()) { this.push(outfitterDialog(this)); return; }
      // A bare name wears it; wear|unwear|toggle name are the macro forms. Companions with a set of that name follow.
      const r = this.g.runOutfitterCommand(/^(wear|unwear|toggle)\s/i.test(args.trim()) ? args.trim() : `wear ${args.trim()}`);
      if (r.ok) this.say(green(`${r.wearing ? 'You put on' : 'You take off'} ${r.name}.`) + (r.missing ? yellow(`  ${r.missing} missing.`) : ''));
      else this.say(red(r.reason));
      this.afterAction();
      return;
    }
    if (c === 'bank' || c === 'ah' || c === 'auction' || c === 'mail') {
      const city = cityAccess(this);
      if (c === 'bank') { if (city.bank) this.push(bankDialog(this)); else this.say(red('No banker here. Banks are in the capitals, Ratchet, Booty Bay, Gadgetzan and Everlook.')); }
      else if (c === 'mail') this.push(mailDialog(this));
      else if (city.ah) this.push(auctionDialog(this)); else this.say(red('No auctioneer here. Auction houses are in the capitals.'));
      this.render();
      return;
    }
    const fn = this.cmds.commands[c];
    if (!fn) { this.say(dim(`Unknown command "${cmd}". Type :help.`)); this.render(); return; }
    this.say(cyan(`> ${line}`));
    try { await fn.call(this.cmds.commands, args); }
    catch (err) { this.say(red(`Error: ${err.message}`)); }
    this.vendor = this.cmds.getVendor();
    this.afterAction();
  }

  // ---- drawing -----------------------------------------------------------------------------------

  layout() {
    const W = this.term.cols, H = this.term.rows;
    const logH = this.g ? Math.max(5, Math.min(12, Math.floor(H * 0.3))) : 3;
    const top = this.compactHeader() ? 2 : 4 + (this.showsRunStrip() ? 1 : 0); // title, bars, tabs, (the run strip), rule; a run keeps only XP
    const mainH = H - top - 1 - logH - 1;
    // A view can ask for a narrower detail pane (the talent trees want three side by side).
    const detailW = W >= 90 ? Math.floor(W * (this.top()?.detailShare ?? 0.4)) : 0;
    const listW = detailW ? W - detailW - 1 : W;
    return { W, H, logH, top, mainH, listW, detailW };
  }

  /** A repaint from a game loop (a fight tick, the autopilot, a dungeon walk). The game keeps ticking every
   *  100 ms; the screen catches up at most once per Screen refresh, and the last change is always painted. */
  renderSoon() {
    if (!this.term.isTTY) { this.render(); return; }
    const wait = this.lastPaint + refreshMs(this.prefs) - Date.now();
    if (wait <= 0) this.render();
    else if (!this.paintTimer) this.paintTimer = setTimeout(() => { this.paintTimer = null; this.render(); }, wait);
  }

  render() {
    if (this.closed) return;
    clearTimeout(this.paintTimer); this.paintTimer = null; this.lastPaint = Date.now();
    const L = this.layout();
    const lines = [];
    lines.push(...this.headerLines(L));
    if (this.fight && !this.stack.length && !this.inlineFight()) lines.push(...this.fight.render(L.W, L.mainH));
    else if (this.auto && !this.auto.browsing && !this.stack.length) lines.push(...this.auto.render(L.W, L.mainH));
    else lines.push(...this.mainLines(L));
    while (lines.length < L.top + L.mainH) lines.push('');
    lines.length = L.top + L.mainH;
    // In a fight the rule carries the pane tabs (Tab: log, meter, threat, loot) and the pane draws below it.
    lines.push(fightPaneRule(this, L));
    lines.push(...fightPaneLines(this, L));
    lines.push(this.hintLine(L));
    this.term.draw(lines);
  }

  headerLines(L) {
    if (!this.g) {
      const crumbs = this.stack.map((v) => bold(v.title ?? '')).join(dim(' › '));
      return [bold(' azsh') + dim('  Azeroth Shell'), crumbs ? cut(` ${crumbs}`, L.W) : '', '', dim('─'.repeat(L.W))];
    }
    // Watching a run, the name, bars and tabs go: the panel has your frame, and the XP line is what a run is for.
    if (this.compactHeader()) return [runHeaderLine(this, L.W), dim('─'.repeat(L.W))];
    const ch = this.ch, ds = this.ds;
    const z = this.zone();
    const dead = this.isDead() ? red(bold('  DEAD')) : ch.mountedItem != null ? dim('  mounted') : '';
    const title = ` ${bold(ch.name)} ${dim(`L${ch.level} ${raceName(ch.race)} ${className(ch.cls)}`)}${dead}`;
    const road = journeyHeader(this);
    const right = `${road ? yellow(road) : cyan(z?.name ?? ch.zoneId)}  ${coinText(ch.gold)} `;
    const l0 = fit(title, L.W - vis(right)) + right;
    // In a fight the bars follow the live session, so the header is the player's frame and no panel needs another.
    const live = this.fight?.session?.playerView?.() ?? null;
    const hp = live ? live.hp : ch.health, hpMax = live ? live.maxHp : maxHealth(ch, ds);
    const pw = live ? live.power : ch.power, pwMax = live ? live.maxPower : maxPower(ch, ds), pt = powerType(ch);
    const xpMax = ds.xpToNext(ch.level);
    const seg = Math.max(8, Math.floor((L.W - 50) / 3));
    const l1 = ` ${green('HP')} ${bar(hp, hpMax, seg, hp / Math.max(1, hpMax) < 0.25 ? red : green)} ${fit(`${hp}/${hpMax}`, 9)}`
      + ` ${(POWER_PAINT[pt] ?? cyan)(pt === 'mana' ? 'MP' : pt === 'rage' ? 'RG' : 'EN')} ${bar(pw, pwMax, seg, POWER_PAINT[pt] ?? cyan)} ${fit(`${pw}/${pwMax}`, 9)}`
      + ` ${magenta('XP')} ${bar(ch.xp, xpMax, seg, magenta)} ${dim(`${pct(ch.xp, xpMax)}%${ch.restedXp ? ' rested' : ''}`)}`;
    // Tabs 1-9 and 0 have a digit, and where the terminal draws sixel a one-line icon in front while there is
    // room (as half-block cells an icon two wide is a smudge of colour, so those get none). Short labels take
    // over when the full ones do not fit, then the icons go, and inside a dialog the bar shrinks to the
    // current tab so the breadcrumb stays readable.
    const digit = (i) => (i < 9 ? String(i + 1) : i === 9 ? '0' : '');
    const tabBar = (short, icons) => (icons && sixelOn() ? ' ' : '') + this.tabs.map((t, i) => {
      const label = short ? (t.short ?? t.label) : t.label, d = digit(i);
      const art = icons && sixelOn() ? iconArt(t.icon, 2)?.[0] : null;
      const tab = i === this.tab && !this.stack.length ? inverse(` ${d ? `${d} ` : ''}${label} `) : ` ${d ? `${dim(d)} ` : ''}${label} `;
      return art ? `${art}${tab}` : tab;
    }).join('');
    const crumbs = this.stack.map((v) => ` › ${bold(v.title)}`).join('');
    let tabs = tabBar(false, true);
    for (const [short, icons] of [[true, true], [false, false], [true, false]]) if (vis(tabs + crumbs) > L.W) tabs = tabBar(short, icons);
    if (vis(tabs + crumbs) > L.W && this.stack.length) { const d = digit(this.tab); tabs = ` ${d ? `${dim(d)} ` : ''}${this.tabs[this.tab]?.label ?? ''}`; }
    const strip = this.showsRunStrip() ? [runStripLine(this, L.W)] : [];
    return [l0, l1, cut(tabs + crumbs, L.W), ...strip, dim('─'.repeat(L.W))];
  }

  /** The run strip sits under the tabs whenever a run is alive and neither its panel nor its fight fills the middle. */
  showsRunStrip() { return !!this.auto && (this.stack.length > 0 || this.auto.browsing) && !(this.fight && !this.stack.length && !this.inlineFight()); }

  /** An autopilot fight draws inside the run panel unless w asked for the full fight view. */
  inlineFight() { return !!this.fight && this.fight.label === 'autopilot' && !!this.auto && !this.auto.watchFight; }

  /** Watching a run (its panel or its fight on screen): the header is only the XP line. */
  compactHeader() { return !!this.auto && !this.auto.browsing && !this.stack.length; }

  mainLines(L) {
    const view = this.top();
    const out = [];
    if (!view) return out;
    const rows = this.rowsOf(view);
    const showDetail = L.detailW > 0 && !view.noDetail;
    const listW = showDetail ? L.listW : L.W;
    const maxScroll = this.maxScrollOf(rows, L.mainH, listW);
    view.scroll = Math.max(0, Math.min(view.scroll ?? 0, maxScroll));
    // A grid view draws its own list side when it fits (null when it does not, and the rows list as usual).
    const grid = view.grid?.(this, rows, listW, L.mainH) ?? null;
    view.gridNav = grid?.nav ?? null;
    const listLines = grid ? grid.lines.slice(0, L.mainH) : [];
    const end = grid ? rows.length : this.windowEnd(rows, view.scroll, L.mainH, listW);
    for (let i = grid ? end : view.scroll; i < end; i++) {
      const r = rows[i];
      const sel = i === view.cursor && !r.header;
      // A row with an icon is two lines: the icon's cells down the left, the text beside the top row and
      // the row's `sub` (a kind, a cost) beside the bottom one. The icon keeps its own colours when selected.
      if (this.rowH(r, listW) === 2) {
        const art = iconArt(r.icon, 4) ?? iconBlank(4);
        const w = listW - 6;
        const t1 = fit(` ${r.text}`, w), t2 = fit(` ${r.sub ?? ''}`, w);
        listLines.push(`${sel ? '▶' : ' '}${art[0]}${sel ? inverse(t1) : t1}`, ` ${art[1]}${sel ? inverse(t2) : t2}`);
        continue;
      }
      // A header row is a cyan title; a plain one (a card's line of text) keeps its own paint.
      let text = r.header ? (!r.text ? '' : r.plain ? r.text : cyan(bold(r.text))) : ` ${r.text}`;
      text = fit(sel ? `${'▶'}${text.slice(1)}` : text, listW - 1);
      listLines.push(sel ? inverse(text) : text);
    }
    // A cursor row scrolled out of view is echoed on the last line so Enter is never a mystery.
    const cursorRow = rows[view.cursor];
    if (!grid && cursorRow && !cursorRow.header && (view.cursor < view.scroll || view.cursor >= end) && listLines.length === L.mainH) {
      listLines[L.mainH - 1] = inverse(fit(` ${view.cursor < view.scroll ? '▲' : '▼'} ${cursorRow.text}`, listW - 1));
    }
    if (!rows.length && view.empty) listLines.push(dim(` ${view.empty}`));
    let detailLines = [];
    if (showDetail) {
      const d = cursorRow?.detail?.(this, cursorRow) ?? view.detail?.(this, cursorRow) ?? [];
      detailLines = wrapIconLines(d, L.detailW - 2);
      // A view's foot (the Character tab's stats) sits at the bottom of the pane when the tooltip keeps room above it.
      const foot = view.detailFoot ? wrapIconLines(view.detailFoot(this, L.detailW - 2), L.detailW - 2) : [];
      const room = foot.length && L.mainH - foot.length >= 16 ? L.mainH - foot.length - 1 : L.mainH;
      if (detailLines.length > room) detailLines = detailLines.slice(0, room - 1).concat(dim('…'));
      if (room < L.mainH) detailLines = [...detailLines, ...Array(L.mainH - foot.length - detailLines.length).fill(''), ...foot];
    }
    for (let i = 0; i < L.mainH; i++) {
      const left = fit(listLines[i] ?? '', listW);
      out.push(showDetail ? `${left}${dim('│')} ${fit(detailLines[i] ?? '', L.detailW - 2)}` : left);
    }
    return out;
  }

  logLines(L) {
    const end = Math.max(0, this.log.length - this.logScroll);
    const start = Math.max(0, end - L.logH);
    const out = this.log.slice(start, end).map((l) => ` ${l}`);
    while (out.length < L.logH) out.unshift('');
    if (this.logScroll > 0) out[0] = fit(out[0], L.W - 14) + dim(`↑ ${this.logScroll} more`);
    else if (this.log.length > L.logH && !this.fight) out[0] = fit(out[0], L.W - 12) + dim('l: full log');
    return out;
  }

  hintLine(L) {
    if (this.cmd) return ` ${bold(this.cmd.label)}${this.cmd.text}${inverse(' ')}`;
    if (this.flash && Date.now() < this.flash.until) return ` ${brightYellow(this.flash.text)}`;
    if (this.fight && !this.stack.length && !this.inlineFight()) return ` ${dim(this.fight.hint())}`;
    if (this.auto && !this.stack.length && !this.auto.browsing) {
      const f = this.inlineFight() ? this.fight : null;
      const pace = f ? f.speed : this.fightSpeed;
      const bags = fightPane(this) === 'bags' && !this.auto.browsing ? 'Up Down: pick an item   Enter: use it   ' : '';
      return ` ${dim(`${bags}Esc: stop   space: ${(f ? f.paused : this.auto.paused) ? 'resume' : 'pause'}   + -: pace ${pace}x   l: log   ${this.auto.browsing ? 'w: watch the run' : `${f ? 'w: take the keys (1-0: action bar)   a: play it yourself   ' : ''}Tab: ${nextPaneId(this)}   1-9: look at a tab`}`)}`;
    }
    // The view's own keys fill the line while they fit; the way out and ? always stay. What does not fit is on ?.
    const view = this.top();
    const head = viewKeyHints(view);
    if (!this.g) return ` ${dim(cut([...new Set([...head, ...(this.stack.length > 1 ? ['Esc: back'] : [])])].join('   '), L.W - 2))}`;
    const tail = [...(view?.id !== 'log' ? ['l: log'] : []), this.stack.length ? 'Esc: back' : this.auto ? 'Esc: back to the run   1-9: tabs' : '1-9: tabs'];
    const room = L.W - 2 - vis([...tail, '?: more keys'].join('   ')) - 3;
    const shown = [];
    for (const h of head) { if (vis([...shown, h].join('   ')) > room) break; shown.push(h); }
    const hints = [...shown, ...tail, shown.length < head.length ? '?: more keys' : '?: help'];
    return ` ${dim(cut(hints.join('   '), L.W - 2))}`;
  }

  /** The key list: the open window's own keys first, then the global ones. */
  helpView() {
    const own = viewKeyHints(this.top());
    const lines = own.length ? [bold(`This window (${strip(this.top().title ?? this.top().id)})`), ...own.map((h) => `  ${h}`), ''] : [];
    return { id: 'help', title: 'Keys', hint: 'Esc: back', noDetail: true, rows: () => [...lines, ...HELP_LINES].map((t) => ({ text: t, header: true })) };
  }
}

// ---- boot ----------------------------------------------------------------------------------------

/** The save-pick screen, then the game. Resolves when the player quits. */
export async function runTui({ term = new RealTerm(), argv = [] } = {}) {
  term.open();
  // The tables take a second or two to load: say so, stage by stage, instead of leaving the screen blank.
  const loading = (stage) => term.draw([bold(' azsh') + dim('  Azeroth Shell'), '', dim(`  Loading ${stage}…`)]);
  loading('the game');
  await new Promise((r) => setImmediate(r)); // the first frame leaves before the synchronous load holds the loop
  const ds = bootDataStore(loading);
  const repo = new FileSaveRepository();
  const app = new App({ term, ds, repo, prefs: new FilePrefs() });
  // Engine diagnostics (console.warn from the combat layer) would print over the frame: while the screen is
  // open they go to the log pane under AZSH_DEBUG, and nowhere otherwise.
  const saved = { log: console.log, warn: console.warn, info: console.info, debug: console.debug };
  const quiet = (...a) => { if (process.env.AZSH_DEBUG) app.say(dim(a.map(String).join(' '))); };
  Object.assign(console, { log: quiet, warn: quiet, info: quiet, debug: quiet });
  app.restoreConsole = () => Object.assign(console, saved);
  app.render();
  const saves = await repo.list();
  const begin = async (save) => {
    app.stack = [];
    // false: another terminal took this character between the picker's check and now; back to the picker.
    if (app.startGame(save.state, save.slot, save.createdAt, false, save.updatedAt) === false) return reopenPicker();
    app.render();
  };
  const reopenPicker = () => savePicker(app, { onPlay: (save) => { void begin(save); }, onNew: createFlow });
  app.toPicker = reopenPicker;
  const createFlow = () => characterCreation(app, (state) => {
    app.stack = [];
    app.startGame(state, `${state.char.name.toLowerCase()}-${Date.now().toString(36)}`, Date.now(), true);
    void app.persist();
    app.render();
  }, { onCancel: saves.length ? reopenPicker : null });
  if (saves.length && !argv.includes('--new')) await reopenPicker();
  else createFlow();
  return new Promise((resolve) => { app.onQuit = resolve; });
}

export { characterCreation } from './tuiCreate.mjs';
