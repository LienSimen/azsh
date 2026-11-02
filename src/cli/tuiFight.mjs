// Live combat and the animated autopilot for the windowed game. A fight is the engine's real-time
// session (Game.beginFight) ticked every 100 ms. A duel (you, maybe your pet, the foes) is drawn on a stage
// (duelStage): the sprites face each other, each unit's plate sits under its feet, hits rise from the chest,
// your cast bar is centred under the floor and the keyed ability bar runs along the bottom. A party fight or
// a narrow terminal falls back to the list of unit frames (renderFrames). Auto-play runs the character's
// rotation; a number key presses an ability over it for one GCD.
import { bold, dim, cyan, yellow, green, red, gray, inverse, fit, vis, cut, bar, strip, brightBlue, itemText, orange } from './text.mjs';
import { className } from '../domain/core/ids.ts';
import { SIZES, youSize, foeSize, canvas, put, putLines, floorLine, POWER_PAINT, POP_MS, POP_RISE_MS, LUNGE_MS, SHORT_BUFF_MS, ROLE_GLYPH, plateLines, auraRows, castSlot, auraText, auraTime, putMissiles, lootToasts, putLootToasts } from './tuiStage.mjs';
import { partyStage } from './tuiPartyStage.mjs';
import { combatDistanceYd, DEFAULT_OPEN_YD, MELEE_CONTACT_YD } from '../engine/combat/combatGeometry.ts';
import { formatCombatLog, combatLogPlainText, dropLogRepeats, POWER_MERGE_MS } from './combatLogFormat.ts';
import { impliedDest } from './combatLogFilter.ts';
import { moneyText } from '../domain/economy/money.ts';
import { maxHealth, maxPower } from '../domain/character/character.ts';
import { powerType } from '../domain/character/characterStats.ts';
import { pullOpts, sessionLogNames } from './squad.mjs';
import { slotContent, visibleBars } from './tuiBars.mjs';
import { autoLootOn, openLoot } from './tuiLoot.mjs';
import { createCombatMacroHost } from './macroHostCombat.ts';
import { ensureMeter, noteLoot, cycleFightPane, cycleMeterSort, toggleMeterSegment, fightPane, nextPaneId } from './tuiFightPanes.mjs';
import { objectiveLines, playerArt } from './tuiViews.mjs';
import { runPanelLines, endCard, stopText, stepBody } from './tuiAutopilot.mjs';
import { creatureArt, artWidth } from './modelArt.mjs';
import { iconArt, iconsOn } from './iconArt.mjs';

export const TICK_MS = 100; // one engine tick per 100 ms of real time, like the web client
// A win holds the fight on screen this long (real time), plus a beat for each drop as it slides in.
const WIN_HOLD_MS = 1000, DROP_HOLD_MS = 450, DROP_STAGGER_MS = 220, WIN_HOLD_MAX_MS = 3500;

/** Start a live fight. Returns `{ ok: true, ctl }` or `{ ok: false, reason }`. `onEnd(outcome)` runs after the
 *  fight resolves (outcome null when the player ran); `label` names who is driving (the autopilot). `begin` replaces
 *  beginFight (a dungeon stop, squad always in) and `after(outcome)` runs right after resolveFight. `resolve(session)`
 *  replaces resolveFight for a fight that pays nothing (a duel); Esc in one forfeits instead of running. `onTick()` runs
 *  after every engine tick of a fight still going (the dungeon floor keeps its clock and its waves there).
 *  `why()` says what the fight is for (see fightReason); without it the header names the quest log entry the
 *  creature counts toward, if any. */
export function startFight(app, creatureEntry, { onEnd, label, begin, after, resolve, onTick, why } = {}) {
  if (app.fight) return { ok: false, reason: 'Already in a fight.' };
  if (app.isDead()) { app.flashMsg('You are dead.'); return { ok: false, reason: 'You are dead.' }; }
  const opts = begin ? { withSquad: true } : pullOpts(app.g, app.ds, app.cmds.buffPace, creatureEntry, (l) => app.say(cyan(l)));
  const b = begin ? begin() : app.g.beginFight(creatureEntry, opts);
  if (!app.result(b)) { app.render(); return { ok: false, reason: b.reason || 'Cannot fight that.' }; }
  const session = b.session;
  ensureMeter(app).beginFight(); // the meter's "this fight" segment starts here; "run" totals keep adding up
  const squadXp = new Map((app.g.state.squad ?? []).map((c) => [c.id, c.xp ?? 0]));
  const ctl = {
    // A plain fight (Enter on a creature) can repeat: r keeps pulling the same creature after each win.
    plain: !begin && !resolve && !label,
    after, resolve, onTick, session, enemyName: b.enemyName, enemyEntry: b.enemyEntry, onEnd, label, why: why ?? (() => fightReason(app, { creatureEntry, forQuest: true })), withSquad: !!opts && (app.g.state.squad ?? []).length > 0,
    // A fight opened from a window (the dungeon run) takes the screen and hands the window back after.
    savedStack: app.stack,
    auto: true, paused: false, speed: app.fightSpeed ?? 1, pressed: null, pressedTicks: 0, follow: [], focus: null, macros: null, timer: null, pend: null, ended: false,
    frames: newFrameMemory(app), compact: false, squeeze: 0,
    names: sessionLogNames(session, { playerName: app.ch.name, enemyName: b.enemyName, spellName: (id) => app.ds.spell(id)?.name }),
    hint() { if (this.holding) return `Enter, Esc: go on   Tab: ${nextPaneId(app)}   l: log`; return `${this.plain ? (app.farmEntry === creatureEntry ? 'r: stop repeating   ' : 'r: fight again after   ') : ''}1-0: your action bar   a: ${this.auto ? 'manual play' : 'auto-play'}${session.alliesView().length ? '   t: orders' : ''}   c: cancel a buff${app.g.state.instance ? '   p: pull +1' : ''}   space: ${this.paused ? 'resume' : 'pause'}   + -: speed ${this.speed}x   Tab: ${nextPaneId(app)}   l: log   ${this.label === 'autopilot' ? 'w, Esc: back to the run panel' : 'Esc: run away'}`; },
    schedule() {
      if (this.timer) app.term.clearInterval(this.timer);
      this.timer = app.term.setInterval(() => this.tick(), Math.max(10, TICK_MS / this.speed));
    },
    stop() { if (this.timer) app.term.clearInterval(this.timer); this.timer = null; },
    /** One engine tick (the check script calls this by hand). */
    tick() {
      if (this.holding && !this.paused) { if (++this.heldTicks >= this.holding.ticks) this.release(); app.renderSoon(); return; }
      if (this.ended || this.paused) return;
      let action;
      // A macro's later steps go out one per tick once the step before has left the queue.
      if (this.pressed == null && this.follow.length) {
        const st = this.follow.shift();
        if (st.kind === 'cast') { this.pressed = st.ally ? { spell: st.spellId, ally: st.ally } : st.spellId; this.pressedTicks = 0; }
        else this.useItem(st.entry, st.target);
      }
      if (this.pressed != null) {
        const id = typeof this.pressed === 'object' ? this.pressed.spell : this.pressed;
        const ab = session.abilities().find((x) => x.spell.id === id);
        if (ab?.usable) { action = this.pressed; this.pressed = null; }
        else if (++this.pressedTicks > 30 || !ab) { app.say(dim(`${ab ? ab.reason ?? 'Not ready.' : 'Lost that ability.'}`)); this.pressed = null; }
      }
      let events;
      if (action != null) { session.aiPlayer = false; events = session.tick(action); session.aiPlayer = this.auto; }
      else events = session.tick();
      this.logEvents(events);
      if (!session.ended) this.onTick?.();
      if (session.ended) this.finish();
      app.renderSoon();
    },
    /** A win holds the fight on screen a moment before it gives the screen back: the foe at 0 on its plate and
     *  what it dropped sliding in beside it (putLootToasts). The timer keeps ticking through it, so the hold is
     *  counted in ticks: the speed keys and the check script drive it like the fight. */
    holding: null, heldTicks: 0,
    /** The stage's clock: the fight's own, running on through the hold so the last hits finish rising. */
    clock() { return session.t + this.heldTicks * TICK_MS; },
    /** Real milliseconds into the hold (the toasts' clock). */
    holdMs() { return this.heldTicks * (TICK_MS / this.speed); },
    /** The drops in one line, for the frames list when the stage does not fit. Null outside a hold or with none. */
    lootLine() {
      const drops = this.holding ? lootToasts(app, this.holding) : [];
      return drops.length ? ` ${cyan('Loot')}  ${drops.map((d) => d.text).join(dim(' · '))}` : null;
    },
    /** At 4x and up under the autopilot nobody reads the ticks: the log speaks in fights (the Victory line). */
    folded() { return this.label === 'autopilot' && this.speed >= 4; },
    logEvents(events) {
      app.meter?.ingest(events);
      notePops(this.frames, events);
      if (this.folded()) return;
      const flush = () => { if (this.pend && this.pend.amount > 0) app.say(line(this.pend.t, this.pend.remake(this.pend.amount))); this.pend = null; };
      const line = (t, row) => `${dim((t / 1000).toFixed(1).padStart(5) + 's')} ${paintLog(row)}`;
      for (const ev of dropLogRepeats(events)) {
        const row = formatCombatLog(ev, this.names);
        if (!row) continue;
        if (row.merge) {
          if (this.pend && this.pend.key === row.merge.key && row.merge.t - this.pend.t0 < POWER_MERGE_MS) { this.pend.amount += row.merge.amount; this.pend.t = row.merge.t; continue; }
          flush();
          this.pend = { key: row.merge.key, t0: row.merge.t, t: row.merge.t, amount: row.merge.amount, remake: row.merge.remake };
          continue;
        }
        flush();
        app.say(line(ev.t, row));
      }
      if (this.pend && session.t - this.pend.t0 >= POWER_MERGE_MS) flush();
    },
    finish() {
      if (this.ended) return;
      this.ended = true;
      if (this.pend) { if (this.pend.amount > 0) app.say(`${dim((this.pend.t / 1000).toFixed(1).padStart(5) + 's')} ${paintLog(this.pend.remake(this.pend.amount))}`); this.pend = null; }
      // Auto-loot off: the corpse holds its drops and coin for the loot window. The autopilot always takes them.
      const hold = !this.resolve && this.label !== 'autopilot' && !autoLootOn(app);
      const r = this.resolve ? this.resolve(session) : app.g.resolveFight(session, hold ? { holdLoot: true } : undefined);
      this.after?.(r);
      const tag = r.outcome === 'win' ? green(bold('Victory')) : r.outcome === 'defeat' ? red(bold('Defeat')) : yellow(bold('Stalemate'));
      const bits = [`${(r.result.durationMs / 1000).toFixed(1)} s`, `HP ${app.hpText()}`];
      if (r.xpGained) bits.push(`+${r.xpGained} xp`);
      if (r.goldGained && !hold) bits.push(`+${moneyText(r.goldGained)}`);
      app.say(`${tag} against ${this.enemyName}  ${dim(bits.join('  '))}`);
      if (!hold) { noteLoot(app, r.loot, r.goldGained); for (const d of r.loot) app.say(`  ${yellow('You receive')} ${app.itemLabel(d.item)}${d.count > 1 ? ` x${d.count}` : ''}`); }
      const gained = (app.g.state.squad ?? []).filter((c) => (c.xp ?? 0) !== squadXp.get(c.id)).map((c) => `${c.name} ${(c.xp ?? 0) > (squadXp.get(c.id) ?? 0) ? `+${(c.xp ?? 0) - (squadXp.get(c.id) ?? 0)} xp` : 'levels up'}`);
      if (gained.length) app.say(dim(`  Companions: ${gained.join(', ')}`));
      for (const lv of r.leveledTo) { app.say(bold(green(`  You have reached level ${lv}!`))); app.flashMsg(`Level ${lv}!`); }
      if (r.outcome === 'win') app.flashMsg(`${this.enemyName} dies.${r.xpGained ? `  +${r.xpGained} xp` : ''}`);
      // The lines above already tell the story; the engine's activity rows for this fight would repeat it.
      app.lastActivity = app.g.state.activity[0] ?? null;
      this.done = { r, hold };
      if (r.outcome !== 'win') { this.release(); return; }
      // Real time: a second, a beat more for each drop as it slides in; at 4x and up it shortens with the speed.
      const loot = hold ? [] : r.loot, copper = hold ? 0 : r.goldGained ?? 0;
      const pace = Math.max(1, this.speed / 2), ms = Math.min(WIN_HOLD_MAX_MS, WIN_HOLD_MS + (loot.length + (copper ? 1 : 0)) * DROP_HOLD_MS) / pace;
      this.holding = { loot, copper, until: ms, stagger: DROP_STAGGER_MS / pace, ticks: Math.max(1, Math.ceil(ms / (TICK_MS / this.speed))) };
      app.renderSoon();
    },
    /** The fight is over and its hold too: the screen goes back to whoever opened the fight. */
    release() {
      if (!this.done || app.fight !== this) return;
      const { r, hold } = this.done;
      this.holding = null;
      this.stop();
      app.fight = null;
      app.lastFight = this; // the meter and threat panes keep reading it between autopilot fights
      app.stack = this.savedStack;
      if (hold) openLoot(app);
      app.afterAction();
      this.onEnd?.(r);
      if (this.plain && app.farmEntry === creatureEntry) {
        if (r.outcome === 'win') scheduleFarm(app);
        else { app.farmEntry = null; app.say(yellow('Stopped repeating the fight.')); }
      }
    },
    flee() {
      if (this.holding) { this.release(); return; }
      if (this.resolve) { session.forfeit('player'); for (let i = 0; i < 50 && !session.ended; i++) session.tick(); this.finish(); return; }
      this.ended = true;
      this.stop();
      if (app.farmEntry === creatureEntry) app.farmEntry = null;
      app.g.abandonLiveFight();
      app.fight = null;
      app.stack = this.savedStack;
      app.say(yellow(`You run from ${this.enemyName}.`));
      app.lastActivity = app.g.state.activity[0] ?? null;
      app.afterAction();
      this.onEnd?.(null);
    },
    key(k) {
      // Over a win's hold Enter or Esc goes on at once; the panes, the log and the speed still answer.
      if (this.holding) {
        if (k === 'escape' || k === 'return') { this.release(); return; }
        if (!['space', 'tab', 'shift-tab', 'l', 'pageup', 'pagedown', '+', '=', '-'].includes(k)) return;
      }
      if (k === 'escape') { this.flee(); return; }
      if (k === 'space') { this.paused = !this.paused; app.render(); return; }
      if (k === 'a') { this.auto = !this.auto; session.aiPlayer = this.auto; app.say(dim(this.auto ? 'Auto-play on: your rotation plays.' : 'Auto-play off: you press every ability.')); app.render(); return; }
      if (k === '+' || k === '=') { this.speed = app.fightSpeed = Math.min(8, this.speed * 2); this.schedule(); app.render(); return; }
      if (k === '-') { this.speed = app.fightSpeed = Math.max(0.5, this.speed / 2); this.schedule(); app.render(); return; }
      if (k === 'pageup') { app.logScroll = Math.min(app.log.length, app.logScroll + 5); app.render(); return; }
      if (k === 'pagedown') { app.logScroll = Math.max(0, app.logScroll - 5); app.render(); return; }
      if (k === 'l') { app.openLog(); return; }
      if (k === 'tab') { cycleFightPane(app, +1); return; }
      if (k === 'shift-tab') { cycleFightPane(app, -1); return; }
      if (k === 's' && fightPane(app) === 'meter') { cycleMeterSort(app); return; }
      if (k === 'f' && fightPane(app) === 'meter') { toggleMeterSegment(app); return; }
      if (k === 't') { partyOrders(app, this); return; }
      if (k === 'c') { cancelBuff(app, this); return; }
      if (k === 'r' && this.plain) {
        app.farmEntry = app.farmEntry === creatureEntry ? null : creatureEntry;
        app.say(dim(app.farmEntry ? `You will fight ${this.enemyName} again after each win. r stops it.` : 'No more repeats after this fight.'));
        app.render();
        return;
      }
      if (k === 'p' && app.g.state.instance) { this.pullOne(); return; }
      const slot = this.abilityBar().find((e) => e.key === k);
      if (slot) { this.fire(slot); return; }
      if (k === '0') {
        const it = session.items().find((x) => x.usable);
        if (it) { session.aiPlayer = false; this.logEvents(session.tick({ item: it.item.entry })); session.aiPlayer = this.auto; app.render(); }
        return;
      }
    },
    /** Pull +1: the next uncleared trash pack on the route joins this fight (never a boss). */
    pullOne() {
      const r = app.g.pullAdditionalPack(app.g.state.instance.dungeonId, session);
      if (!r.ok) { app.flashMsg(r.reason || 'Nothing more to pull.'); return; }
      app.say(yellow(`${r.name} joins the fight: ${r.injected.map((x) => x.name).join(', ')}.`) + (r.softCapWarning ? red('  That is a lot of enemies.') : ''));
      app.render();
    },
    /** Press one number-row slot: a spell queues over auto-play for one GCD, an item goes at once. */
    fire(slot) {
      if (slot.spell) {
        this.pressed = slot.spell.id; this.pressedTicks = 0;
        if (!slot.usable) app.say(dim(`${slot.spell.name}: ${slot.reason ?? 'not ready'} (queued)`));
      } else if (slot.item) {
        if (!slot.usable) { app.say(dim(`${slot.label}: ${slot.reason ?? 'not usable now'}`)); return; }
        session.aiPlayer = false; this.logEvents(session.tick({ item: slot.item })); session.aiPlayer = this.auto;
      } else if (slot.macro) {
        const def = app.g.macroById(slot.macro);
        if (def && !this.macroHost().press(def)) app.say(dim(`${def.name} did nothing.`));
      }
      app.render();
    },
    useItem(entry, target) {
      session.aiPlayer = false; this.logEvents(session.tick({ item: entry, ...(target ? { target } : {}) })); session.aiPlayer = this.auto;
    },
    /** The macro runtime for this fight: every step goes through the same queue a key press uses. */
    macroHost() {
      this.macros ??= createCombatMacroHost({
        session: () => session,
        ds: { spell: (id) => app.ds.spell(id), item: (entry) => app.ds.item(entry) },
        macros: () => app.g.macros(),
        stance: () => ({ classId: app.ch.cls, known: app.g.state.spellbook.known }),
        equipped: () => app.ch.equipped,
        mods: () => ({ shift: false, ctrl: false, alt: false }),
        mouseoverSide: () => null,
        focusSide: () => this.focus,
        setFocusSide: (side) => { this.focus = side; },
        queueAbility: (id, opts) => { this.pressed = opts?.ally ? { spell: id, ally: opts.ally } : id; this.pressedTicks = 0; },
        queueItem: (entry, opts) => this.useItem(entry, opts?.target),
        queueFollowUp: (steps) => { this.follow = [...steps]; },
        notify: (m) => app.say(dim(m)),
      });
      return this.macros;
    },
    /** The number row: your action bar 1 by its keybinds (spells and bag items), else your first nine abilities. */
    abilityBar() {
      const abs = session.abilities();
      const bar = visibleBars(app.g)[0];
      const out = [];
      for (let i = 0; bar && i < (bar.slots?.length ?? 0); i++) {
        const key = bar.keys?.[i];
        if (!key || !/^[0-9]$/.test(key)) continue; // letter and modifier binds would shadow the fight's own keys
        const c = slotContent(bar, i);
        if (!c) continue;
        if (c.kind === 'spell') {
          const ab = abs.find((x) => x.spell.id === c.id);
          const sp = ab?.spell ?? app.ds.spell(c.id);
          if (sp) out.push({ key, spell: sp, label: sp.name, usable: !!ab?.usable, reason: ab ? ab.reason : 'not known in this fight', cooldownRemainingMs: ab?.cooldownRemainingMs ?? 0 });
        } else if (c.kind === 'item') {
          const it = session.items().find((x) => x.item.entry === c.entry);
          out.push({ key, item: c.entry, label: `${app.itemLabel(c.entry)}${it ? ` x${it.count}` : ''}`, usable: !!it?.usable, reason: it ? it.reason : 'none left', cooldownRemainingMs: 0 });
        } else {
          const info = this.macroHost().info(c.id);
          out.push({ key, macro: c.id, label: info?.name ?? app.g.macroById(c.id)?.name ?? c.id, usable: info?.usable !== false, reason: info?.reason, cooldownRemainingMs: info?.cooldownRemainingMs ?? 0 });
        }
      }
      if (out.length) return out;
      return abs.filter((x) => !x.spell.passive).slice(0, 9).map((ab, i) => ({ key: String(i + 1), spell: ab.spell, label: ab.spell.name, usable: ab.usable, reason: ab.reason, cooldownRemainingMs: ab.cooldownRemainingMs }));
    },
    /** The title line (who, how long, who drives) with why the fight is on its right, and the objective line under it. */
    headLines(W, inline = false) {
      const t = (session.t / 1000).toFixed(1);
      // One badge says who is driving. Under the autopilot the rotation flag only shows when you took it over;
      // inside the run panel the panel's title already says who drives, so the head keeps to the fight.
      const run = this.label === 'autopilot' ? app.auto : null;
      const mode = inline ? (this.auto ? '' : yellow('you play'))
        : run ? `${cyan(bold('AUTOPILOT'))}${this.speed !== 1 ? cyan(` ${this.speed}x`) : ''}${this.auto ? '' : yellow('  you play')}${dim(`  fight ${run.fights + 1} · step ${run.planner.step}${Number.isFinite(run.planner.steps) ? `/${run.planner.steps}` : ''}`)}`
        : `${this.auto ? green('AUTO') : yellow('MANUAL')}${this.speed !== 1 ? dim(`  ${this.speed}x`) : ''}${this.label ? cyan(`   ${this.label}`) : ''}`;
      let head = ` ${bold(`Fighting ${this.enemyName}`)}   ${dim(`${t}s`)}${mode ? `   ${mode}` : ''}${this.paused ? red('  PAUSED') : ''}`;
      // Why this fight, on the right of the title: the quest it serves, with its objective counters on the line below.
      const why = this.why?.();
      if (why?.right && W - vis(head) - 4 >= 12) { const r = cut(why.right, W - vis(head) - 4); head = fit(head, W - vis(r) - 1) + r + ' '; }
      const below = why?.below ? cut(` ${why.below}`, W) : '';
      return { head, below };
    },
    /** The fight drawn inside the autopilot's run panel, so a pull never swaps the screen: the head, the objective
     *  line, the enemies, then the party one line each, cut to `room` lines. `player` is the live player frame for
     *  the panel's own slot. w opens the full view (render) with the party frames and the ability bar. */
    inlineLines(W, room) {
      const now = this.clock();
      // No head line: the panel's title names the quest and its counts, the enemy frame names the foe. What is
      // left of the head (the clock, paused, you play) goes on the title's right as `status`.
      const status = `${dim(`${(now / 1000).toFixed(1)}s`)}${this.auto ? '' : yellow('  you play')}${this.paused ? red('  PAUSED') : ''}`;
      const enemies = session.enemiesView(), allies = session.alliesView(), pet = session.petView();
      // `player` is the live frame for the panel's own slot (the run's header has no bars of its own).
      const player = unitFrame(app, this.frames, session.playerView(), W, now, true, false, {});
      const foes = (compact) => enemies.flatMap((e) => unitFrame(app, this.frames, e, W, now, false, e === session.enemyView(), { compact }));
      const nameOfSide = (side) => (side === 'player' ? app.ch.name : [...allies, ...enemies].find((v) => v.side === side)?.name ?? (pet?.side === side ? pet.name : null));
      const party = [...(pet ? [pet] : []), ...allies].map((v) => {
        const t = v !== pet && v.hp > 0 ? session.targetOf?.(v.side) : null;
        return unitFrame(app, this.frames, v, W, now, false, false, { compact: true, party: v !== pet, role: v.groupRole, target: t ? nameOfSide(t) : null })[0];
      });
      let fight = [...foes(enemies.length > 1), ...party];
      if (fight.length > room) {
        const shown = Math.max(0, room - foes(true).length);
        fight = [...foes(true), ...party.slice(0, shown), ...(party.length > shown ? [dim(`   +${party.length - shown} more in the party`)] : [])];
      }
      return { player, status, fight: fight.slice(0, Math.max(1, room)) };
    },
    /** The fight on its stage when the scene fits, 90 columns and up: a fight without allies on the duel stage
     *  (duelStage), one with the party on the party stage (partyStage, every body small on one floor). Null when
     *  the rows or the columns leave the sprites no room, and the frames list draws instead. `inline` is the
     *  autopilot's run panel, where the number keys browse tabs, so the ability bar shows its keys dim. */
    stage(W, H, { inline = false } = {}) {
      if (W < 90) return null;
      const lines = session.alliesView().length ? partyStage(app, this, W, H, { inline }) : duelStage(app, this, W, H, { inline });
      if (lines && this.holding) putLootToasts(app, lines, this.holding, W, this.holdMs());
      return lines;
    },
    /** The full fight view: the head line, then the stage; or the frames between the sprites (the foe down the
     *  right, you in your gear down the left, fightArt) when the stage does not fit. */
    render(W, H) {
      const stage = this.stage(W, H - 1);
      if (stage) return [this.headLines(W).head, ...stage];
      const { me, foe, innerW } = fightArt(app, this, W, H);
      const frames = this.renderFrames(innerW, H), loot = this.lootLine();
      if (loot) frames.splice(1, 0, loot);
      return flankArt(frames.slice(0, H), me, foe, W, H);
    },
    renderFrames(W, H) {
      const lines = [];
      const { head, below } = this.headLines(W);
      const pv = session.playerView(), now = session.t;
      const pet = session.petView();
      const allies = session.alliesView();
      const enemies = session.enemiesView();
      // Four companions and their pets do not fit two lines each: once the party outgrows the pane every
      // ally drops to one line for the rest of the fight, so frames never jump between the two shapes.
      // With icons a full frame is three lines (the aura icons and their times) and the ability bar two.
      const fh = iconsOn() ? 3 : 2;
      const need = 3 + fh * (1 + (pet ? 1 : 0) + allies.length + enemies.length) + (this.auto ? 0 : fh + 1);
      if (need > H) this.compact = true;
      const nameOfSide = (side) => (side === 'player' ? app.ch.name : [...allies, ...enemies].find((v) => v.side === side)?.name ?? (pet?.side === side ? pet.name : null));
      const party = [];
      if (pet) party.push(...unitFrame(app, this.frames, pet, W, now, false, false, { compact: this.compact }));
      for (const ally of allies) {
        const t = ally.hp > 0 ? session.targetOf?.(ally.side) : null;
        party.push(...unitFrame(app, this.frames, ally, W, now, false, false, { compact: this.compact, party: true, role: ally.groupRole, target: t ? nameOfSide(t) : null }));
      }
      const foes = (compact) => enemies.flatMap((e) => unitFrame(app, this.frames, e, W, now, false, e === session.enemyView(), { compact }));
      const tail = this.auto ? [] : ['', ...this.abilityRows(W)];
      // The enemies are what the fight is about, so they never fall off the bottom of a short pane: the
      // quest line, the spacer, the foes' aura lines and the player's go first (sticky, like `compact`),
      // then the party is cut to what is left with a count of who is hidden.
      const me = (compact) => unitFrame(app, this.frames, pv, W, now, true, false, { compact });
      const fits = () => 1 + (this.squeeze < 1 ? 1 : 0) + me(this.squeeze >= 3).length + party.length + (this.squeeze < 2 ? 1 : 0) + foes(this.squeeze >= 2).length + tail.length <= H;
      while (this.squeeze < 3 && !fits()) this.squeeze++;
      lines.push(head);
      if (this.squeeze < 1) lines.push(below);
      lines.push(...me(this.squeeze >= 3));
      const foeLines = foes(this.squeeze >= 2);
      const room = H - lines.length - (this.squeeze < 2 ? 1 : 0) - foeLines.length - tail.length;
      if (party.length > room) {
        const shown = Math.max(0, room - 1);
        lines.push(...party.slice(0, shown), dim(`   +${party.length - shown} more in the party`));
      } else lines.push(...party);
      if (this.squeeze < 2) lines.push('');
      lines.push(...foeLines, ...tail);
      return lines.slice(0, H);
    },
    /** The ability bar: numbered, dim when unusable. With icons each slot is `cols / 2` lines (a 4 or 6 pixel
     *  icon) of a fixed width, so nothing on the bar moves between ticks: the key, the icon and the name, and
     *  under the name only a cooldown (seconds), the cast in progress, or nothing. The slot of a spell just
     *  used flashes. `live` false (the autopilot's panel, where digits browse tabs) keeps the keys dim and says
     *  what takes them. Slots fold onto more rows when W is short. */
    abilityRows(W, cols = 4, { live = true } = {}) {
      const lines = [];
      const abs = this.abilityBar();
      if (iconsOn()) {
        const now = this.clock(), mem = this.frames, casting = session.playerView().casting;
        const rows = cols / 2, blank = Array.from({ length: rows }, () => ' '.repeat(cols)), gap = ' '.repeat(4);
        const nameW = 14, slotW = 4 + cols + 1 + nameW;
        const slot = (key, art, label, state) => [`${key} ${art[0]} ${fit(label, nameW)}`, `${gap}${art[1]} ${fit(state, nameW)}`, ...art.slice(2).map((l) => `${gap}${l}`)];
        const cells = abs.map((ab) => {
          const icon = ab.spell ? ab.spell.icon : ab.item != null ? app.ds.item(ab.item)?.icon : null;
          const art = iconArt(icon, cols) ?? blank;
          const id = ab.spell?.id;
          const isCasting = id != null && casting?.spellId === id;
          const flash = id != null && now - (mem.used?.get(id) ?? -Infinity) < USED_FLASH_MS;
          const cd = ab.cooldownRemainingMs > 0 ? `${Math.ceil(ab.cooldownRemainingMs / 1000)}s` : '';
          const state = isCasting ? yellow(`${(Math.max(0, casting.endsAt - now) / 1000).toFixed(1)}s`) : cd ? dim(`◔ ${cd}`) : '';
          const name = cut(ab.label, nameW);
          const label = flash || (this.pressed != null && this.pressed === id) ? inverse(name) : isCasting ? yellow(name) : ab.usable ? name : dim(name);
          const key = live && ab.usable ? inverse(` ${ab.key} `) : dim(` ${ab.key} `);
          return slot(key, art, label, state);
        });
        const items = session.items().filter((x) => x.usable);
        if (items.length) cells.push(slot(live ? inverse(' 0 ') : dim(' 0 '), iconArt(items[0].item?.icon, cols) ?? blank, cut(itemText(items[0].item), nameW), dim(`x${items[0].count}`)));
        if (!live) cells.push([dim('w: take the keys'), '', '']);
        let row = Array.from({ length: rows }, () => ' ');
        for (const cell of cells) {
          const w = Math.max(slotW, ...cell.map(vis));
          if (vis(row[0]) + w + 3 > W && row[0].trim()) { lines.push(...row); row = Array.from({ length: rows }, () => ' '); }
          row = row.map((r, i) => `${r}${fit(cell[i] ?? '', w)}   `);
        }
        lines.push(...row);
        return lines;
      }
      let row = ' ';
      for (let i = 0; i < abs.length; i++) {
        const ab = abs[i];
        const cd = ab.cooldownRemainingMs > 0 ? dim(` ${Math.ceil(ab.cooldownRemainingMs / 1000)}s`) : '';
        const label = `${ab.label}${cd}`;
        const cell = ab.usable ? `${inverse(` ${ab.key} `)} ${this.pressed != null && this.pressed === ab.spell?.id ? yellow(label) : label}` : `${dim(` ${ab.key} `)} ${dim(label)}`;
        if (vis(row) + vis(cell) + 3 > W) { lines.push(row); row = ' '; }
        row += `${cell}   `;
      }
      const items = session.items().filter((x) => x.usable);
      if (items.length) row += `${inverse(' 0 ')} ${itemText(items[0].item)} x${items[0].count}`;
      lines.push(row);
      const unusable = abs.filter((a) => !a.usable && a.reason && a.cooldownRemainingMs <= 0).slice(0, 3);
      if (unusable.length) lines.push(dim(`   ${unusable.map((a) => `${a.label}: ${a.reason}`).join('   ')}`));
      return lines;
    },
  };
  session.aiPlayer = true;
  app.fight = ctl;
  // An autopilot fight draws inside the run panel (or under the run strip), so whatever you were reading stays up.
  if (label !== 'autopilot') app.stack = [];
  app.say(cyan(`You attack ${b.enemyName}.`) + (b.packAssist?.length ? yellow(` ${b.packAssist.map((p) => p.name).join(', ')} join${b.packAssist.length === 1 ? 's' : ''} the fight!`) : ''));
  ctl.schedule();
  app.render();
  return { ok: true, ctl };
}

/** What a fight against `step.creatureEntry` is for, read live from the quest log each frame. `right` goes on the
 *  header's right (the quest title and this creature's count, or "hunting for xp"), `below` on the line under it
 *  (every objective of that quest with its count, this creature's first), `short` is the one-line form for the log
 *  and the autopilot's status. Null when the creature counts toward nothing and the fight was not for xp. */
export function fightReason(app, step) {
  const ds = app.ds, log = app.g.state.questlog.quests;
  const feeds = (q) => !!q?.killTargets.some((k) => k.creatureEntry === step.creatureEntry);
  let entry = step.questEntry;
  if (entry == null && step.forQuest) entry = log.find((qs) => qs.status === 'active' && feeds(ds.quest(qs.entry)))?.entry;
  const q = entry != null ? ds.quest(entry) : null;
  if (!q) {
    if (step.questEntry != null || step.forQuest) return null;
    const ch = app.ch, need = ds.xpToNext(ch.level) - ch.xp;
    return { right: dim('hunting for xp'), below: dim(`${need} xp to level ${ch.level + 1}`), short: 'hunting for xp' };
  }
  const qs = log.find((x) => x.entry === entry && x.status !== 'turnedIn');
  const objs = objectiveLines(app, q, qs);
  const mine = q.killTargets.findIndex((k) => k.creatureEntry === step.creatureEntry);
  const first = mine >= 0 ? objs[mine] : null;
  const rest = objs.filter((_, i) => i !== mine);
  const count = (o) => o.slice(o.lastIndexOf(': ') + 2);
  return {
    right: `${dim('for')} ${cyan(q.title)}${first ? `  ${count(first)}` : ''}`,
    below: [first, ...rest.map(dim)].filter(Boolean).join(dim('   ·   ')),
    short: `for ${q.title}${first ? ` (${strip(count(first))})` : ''}`,
  };
}

/** c in a fight: drop one of your own buffs (the ones the engine lets go). The fight waits while you pick. */
function cancelBuff(app, ctl) {
  const buffs = ctl.session.playerView().buffs.filter((b) => app.g.canCancelAuraNow(b.spellId));
  if (!buffs.length) { app.flashMsg('Nothing on you that can be cancelled.'); return; }
  const wasPaused = ctl.paused;
  ctl.paused = true;
  ctl.onOrdersClosed = () => { ctl.paused = wasPaused; ctl.onOrdersClosed = null; };
  app.pick('Cancel which buff?', buffs.map((b) => ({ label: app.ds.spell(b.spellId)?.name ?? String(b.spellId), value: b.spellId })), (id) => {
    const r = app.g.cancelAura(id);
    app.result(r, r.ok ? `${r.name} fades.` : '');
  });
}

export const FARM_DELAY_MS = 900;

/** After a won repeat fight: the next pull of the same creature, once the loot window (if open) is closed. */
function scheduleFarm(app) {
  const t = app.term.setInterval(() => { app.term.clearInterval(t); farmNext(app); }, FARM_DELAY_MS);
}

/** Start the next repeat fight now, if one is due (the loot window calls this as it closes). */
export function farmNext(app) {
  const entry = app.farmEntry;
  if (!entry || app.fight || app.auto || app.closed) return;
  if (app.top()?.id === 'loot') return;
  if (app.isDead()) { app.farmEntry = null; return; }
  if (app.ch.health < maxHealth(app.ch, app.ds) * 0.35) { app.farmEntry = null; app.say(yellow('Too hurt to go on: stopped repeating the fight.')); app.render(); return; }
  startFight(app, entry);
}

const STANCES = [['retaliate', 'Fight back (default)'], ['passive', 'Passive: walk, then stand'], ['hold', 'Hold ground: no moving, rotation keeps going']];

/** t in a party fight: pick a companion, then an order (attack a target, cast one ability, change stance).
 *  The fight pauses while the pickers are open and picks up where it was when the last one closes. */
function partyOrders(app, ctl) {
  const s = ctl.session;
  const allies = s.alliesView().filter((v) => v.hp > 0);
  if (!allies.length) { app.flashMsg('Nobody is fighting beside you.'); return; }
  const wasPaused = ctl.paused;
  ctl.paused = true;
  ctl.onOrdersClosed = () => { ctl.paused = wasPaused; ctl.onOrdersClosed = null; };
  const enemyName = (side) => s.enemiesView().find((e) => e.side === side)?.name ?? side;
  app.pick('Orders: who?', allies.map((v) => {
    const held = s.allyTargetOf(v.side);
    return { label: `${ROLE_GLYPH[v.groupRole] ?? dim('·')} ${v.name}${held ? dim(`  holding ${enemyName(held)}`) : ''}`, value: v };
  }), (v) => {
    const opts = [];
    for (const e of s.enemiesView().filter((x) => x.hp > 0)) opts.push({ label: `Attack ${e.name} ${dim(`${e.hp}/${e.maxHp}`)}`, value: { kind: 'target', side: e.side } });
    if (s.allyTargetOf(v.side)) opts.push({ label: dim('Back to their own choice of target'), value: { kind: 'target', side: null } });
    for (const ab of s.allyAbilities(v.side).filter((a) => !a.spell.passive && a.usable)) opts.push({ label: `Cast ${ab.spell.name}`, value: { kind: 'cast', id: ab.spell.id } });
    if (s.setUnitStance) {
      const cur = s.unitStanceOf?.(v.side) ?? 'retaliate';
      for (const [st, label] of STANCES) opts.push({ label: `${st === cur ? green('● ') : '  '}${label}`, value: { kind: 'stance', stance: st } });
    }
    app.pick(`Orders: ${v.name}`, opts, (o) => {
      if (o.kind === 'target') { if (s.setAllyTarget(v.side, o.side)) app.say(cyan(o.side ? `${v.name} attacks ${enemyName(o.side)}.` : `${v.name} picks their own targets again.`)); }
      else if (o.kind === 'cast') app.say(s.queueAllyAction(v.side, o.id, s.allyTargetOf(v.side)) ? cyan(`${v.name} will cast ${app.ds.spell(o.id)?.name}.`) : red(`${v.name} cannot cast that now.`));
      else if (s.setUnitStance(v.side, o.stance)) app.say(cyan(`${v.name}: ${STANCES.find(([x]) => x === o.stance)[1].toLowerCase()}.`));
    });
  });
}

/** A combat log row with its parts painted, like a classic client's log: you green, friends and pets cyan, foes
 *  yellow, spells cyan, damage red, healing green. The words between stay plain so the line still reads. */
function paintLog(row) {
  return row.segs.map((s) => {
    const c = s.cls ?? '';
    if (c.includes('tw-clog-amt')) return c.includes('sch-heal') ? green(s.text) : red(s.text);
    if (c.includes('tw-clog-u-mine')) return green(s.text);
    if (c.includes('tw-clog-u-friend') || c.includes('tw-clog-u-pet')) return cyan(s.text);
    if (c.includes('tw-clog-u-hostile')) return yellow(s.text);
    if (c.includes('tw-clog-sp')) return cyan(s.text);
    return s.text;
  }).join('');
}

const CAST_W = 30; // the cast/control slot on a frame's second line, so auras never move when a cast starts

/** Per-fight memory that keeps frames steady: the order auras first showed up in, so a refreshed buff keeps
 *  its place instead of jumping to the end. */
function newFrameMemory(app) {
  // The player's own aura order carries across fights, so their frame never reshuffles.
  app.playerAuraOrder ??= new Map();
  return { auraOrder: new Map([['player', app.playerAuraOrder]]), pops: new Map(), used: new Map(), lunge: new Map() };
}

const POP_W = 18; // a hit or heal stays beside the bars for POP_MS (fight time), in a slot this wide
const USED_FLASH_MS = 500; // the ability bar slot of a spell just cast stays inverted this long
const MISS_WORD = { miss: 'Miss', dodge: 'Dodge', parry: 'Parry', immune: 'Immune', deflect: 'Deflect', block: 'Block' };

/** Damage and healing landing on each unit, newest first, for the numbers that pop up beside its bars; the
 *  player's casts, for the flash on the ability bar; and every melee swing, for the lunge. */
function notePops(mem, events) {
  for (const ev of events) {
    let side, text;
    if (ev.actor === 'player' && ev.spellId != null && (ev.kind === 'cast_start' || ev.kind === 'cast_finish' || ev.kind === 'spell_hit' || ev.kind === 'cast_self')) mem.used?.set(ev.spellId, ev.t);
    if (ev.kind === 'melee' && ev.actor) mem.lunge?.set(ev.actor, ev.t); // only a weapon swing lunges; spells, strikes and thorns do not
    if (ev.kind === 'melee' || ev.kind === 'spell_hit' || ev.kind === 'dot_tick') {
      side = ev.target ?? impliedDest(ev.actor);
      if (ev.amount > 0) text = ev.result === 'crit' ? bold(red(`-${ev.amount}!`)) : red(`-${ev.amount}`);
      else if (MISS_WORD[ev.result]) text = gray(MISS_WORD[ev.result]);
    } else if (ev.kind === 'heal' && ev.amount > 0) {
      side = ev.actor;
      text = ev.crit ? bold(green(`+${ev.amount}!`)) : green(`+${ev.amount}`);
    }
    if (!text) continue;
    mem.pops.set(side, [{ t: ev.t, text }, ...(mem.pops.get(side) ?? [])].slice(0, 4));
  }
}

/** The pops still up on one unit at `now`, as many as fit the slot; the older half of their life is dim. */
function popText(mem, key, now) {
  let out = '';
  for (const p of mem.pops?.get(key) ?? []) {
    if (now - p.t >= POP_MS || vis(out) + (out ? 1 : 0) + vis(p.text) > POP_W) break;
    out += (out ? ' ' : '') + (now - p.t > POP_MS / 2 ? dim(p.text) : p.text);
  }
  return out;
}

/** Two lines: name/level/HP/power, then a fixed cast slot + auras. `now` is the clock `casting` runs on. A party
 *  frame carries its role letter and target; `compact` keeps it to the first line with the cast in it. */
function unitFrame(app, mem, v, W, now, isPlayer, focused = false, { compact = false, party = false, role, target, bars = true } = {}) {
  const dead = v.hp <= 0;
  // No bars (the header already shows them): one line of name, cast slot, hits landing and auras.
  if (!bars) {
    const key = isPlayer ? 'player' : (v.side ?? v.name);
    const name = `${(dead ? gray : isPlayer ? green : yellow)(bold(v.name))} ${dim(`L${v.level}`)}`;
    const slot = castSlot(v, now);
    const auras = auraText(app, mem, v, key);
    return [cut(` ${fit(name, 20)} ${fit(slot, CAST_W)} ${fit(popText(mem, key, now), POP_W)} ${auras}`, W)];
  }
  const namePaint = dead ? gray : isPlayer ? green : focused ? red : party ? cyan : yellow;
  const barW = Math.max(10, Math.min(30, Math.floor((W - 48 - POP_W) / 2)));
  const hpBar = bar(v.hp, v.maxHp, barW, dead ? gray : v.hp / v.maxHp < 0.25 ? red : green);
  const pp = POWER_PAINT[v.powerType] ?? cyan;
  const pwBar = v.maxPower > 0 ? ` ${bar(v.power, v.maxPower, Math.floor(barW / 2), pp)} ${fit(`${v.power}`, 4)}` : ' '.repeat(Math.floor(barW / 2) + 6);
  const tag = party ? `${ROLE_GLYPH[role] ?? dim('·')} ` : '';
  const after = dead ? gray('  dead') : target ? dim(`  → ${target}`) : '';
  const key = isPlayer ? 'player' : (v.side ?? v.name);
  const head = ` ${fit(`${tag}${namePaint(bold(v.name))} ${dim(`L${v.level}`)}${focused ? red(' ◀') : ''}`, 26)} ${hpBar} ${fit(`${v.hp}/${v.maxHp}`, 11)}${pwBar} ${fit(popText(mem, key, now), POP_W)}`;
  if (compact) return [cut(`${head}${v.casting && !dead ? `  ${yellow(v.casting.name)}` : after}`, W)];
  // The second line is always there, cast slot first (a cast bar, else crowd control, else stealth, blank when
  // idle) and the auras after it, so gaining a buff or starting a cast never moves this frame or the ones below.
  const slot = castSlot(v, now);
  if (iconsOn()) {
    // Icons: a strip of 4x4 icons beside the cast slot, each one's time (or stacks) under it on a third line.
    const [top, bottom] = auraIcons(app, mem, v, key);
    return [cut(`${head}${after}`, W), cut(`   ${fit(slot, CAST_W)}  ${top}`, W), cut(`   ${' '.repeat(CAST_W)}  ${bottom}`, W)];
  }
  const auras = auraText(app, mem, v, key);
  return [cut(`${head}${after}`, W), cut(`   ${fit(slot, CAST_W)}  ${auras}`, W)];
}

/** The auras auraText lists, as two lines: icons (a 4-letter stub when one has no art) and their times. */
function auraIcons(app, mem, v, key) {
  const order = mem.auraOrder.get(key) ?? new Map();
  mem.auraOrder.set(key, order);
  const placed = (list) => {
    for (const a of list) if (!order.has(a.spellId)) order.set(a.spellId, order.size);
    return [...list].sort((a, b) => order.get(a.spellId) - order.get(b.spellId));
  };
  const short = v.buffs.filter((a) => a.remainingMs != null && a.remainingMs < SHORT_BUFF_MS);
  const all = [...placed(short).slice(0, 6).map((a) => [a, green]), ...placed(v.debuffs).slice(0, 6).map((a) => [a, red])];
  let top = '', bottom = '';
  for (const [a, paint] of all) {
    const sp = app.ds.spell(a.spellId);
    const art = iconArt(sp?.icon, 4);
    const name = sp?.name ?? String(a.spellId);
    top += `${art ? art[0] : paint(fit(name, 4))} `;
    bottom += `${art ? (a.stacks > 1 ? yellow(fit(`x${a.stacks}`, 4)) : paint(fit(a.remainingMs != null ? auraTime(a.remainingMs).trim() : '', 4))) : paint(fit(name.slice(4), 4))} `;
  }
  return [top, bottom];
}

/** Columns an art column gets in a pane W wide: none under 90 columns, up to 28. */
const artCols = (W) => (W >= 90 ? Math.min(28, Math.floor(W * 0.22)) : 0);

/**
 * The sprites round a fight pane W x H: the foe a controller faces down the right from 90 columns, you in
 * your gear (playerArt) down the left from 130; `innerW` is what the frames keep. The full fight view and
 * the autopilot's run panel both use it, so a run shows the same scene either way.
 */
export function fightArt(app, ctl, W, H) {
  const cols = artCols(W);
  const entry = ctl.session?.enemyView()?.creatureEntry ?? ctl.enemyEntry;
  const foe = cols && entry != null ? creatureArt(app.ds.creature(entry)?.displayId, cols, H) : null;
  const me = cols && W >= 130 ? playerArt(app, cols, H)?.lines ?? null : null;
  const innerW = W - (foe ? artWidth(foe) + 2 : 0) - (me ? artWidth(me) + 2 : 0);
  return { me, foe, innerW };
}

/** `lines` (drawn to the width the art leaves) between `left` and `right` art, each centred on the pane's height; every line W wide. */
export function flankArt(lines, left, right, W, H) {
  if (!left && !right) return lines;
  const lw = artWidth(left), rw = artWidth(right);
  const innerW = W - (left ? lw + 2 : 0) - (right ? rw + 2 : 0);
  const out = lines.slice(0, H);
  while (out.length < H) out.push('');
  const lt = Math.max(0, Math.floor((H - (left?.length ?? 0)) / 2)), rt = Math.max(0, Math.floor((H - (right?.length ?? 0)) / 2));
  return out.map((l, i) => `${left ? `${fit(left[i - lt] ?? '', lw)}  ` : ''}${fit(l, innerW)}${right ? `  ${right[i - rt] ?? ''}` : ''}`);
}

// ---- the stage ----------------------------------------------------------------------------------------

const PLATE_PAD = 12; // columns a plate needs past its bar: the numbers after it
const GAP = 2;        // columns between the stage's edge and a column, and between columns
const LANE_MIN = 8;   // the gap kept open between the two sides for the glyphs that cross it

/**
 * The duel on a stage W x H (the design page's §2): you down the left with your pet beside you, the foes
 * down the right with the one you face outermost. Under each sprite sits its plate (name, level, class or
 * rank; HP; power), its state (a cast bar, crowd control, stealth; a row kept even when empty, so the auras
 * never move) and its aura strip. Hits rise from the chest, a spell crosses the gap as a glyph, the floor
 * runs under the plates and the ability bar closes the scene. Returns H lines each W wide, or null when the rows leave
 * the sprites no room (the frames list draws instead).
 */
function duelStage(app, ctl, W, H, { inline }) {
  const s = ctl.session, now = ctl.clock(), mem = ctl.frames;
  const pv = s.playerView(), pet = s.petView(), focus = s.enemyView();
  const icons = iconsOn();
  const barW = W >= 140 ? 30 : W >= 110 ? 24 : 18;
  const plateW = barW + PLATE_PAD;
  const auraH = icons ? 3 : 1;
  // Rows the scene keeps whatever the sprites get: the plate (3), the state row, the auras and the floor.
  // The state row is there idle or casting, so a cast never moves the auras under it. The ability bar goes
  // when rows are short, and only under auto-play.
  const barLines = ctl.abilityRows(W, W >= 140 ? 6 : 4, { live: !inline });
  let barRows = barLines.length;
  const fixed = () => 3 + 1 + auraH + 1 + barRows;
  if (H - fixed() < 4 && ctl.auto) barRows = 0;
  const artRows = H - fixed();
  if (artRows < 4) return null;
  const rankOf = (v) => { const c = v.creatureEntry != null ? app.ds.creature(v.creatureEntry) : null; return c?.rank ?? c?.scaling?.rank ?? 0; };
  const creatureLines = (v, c, r) => (v.creatureEntry != null ? creatureArt(app.ds.creature(v.creatureEntry)?.displayId, c, r) : null);
  /** One column of the stage: the unit, its box, its art and its plate; placed by x later. */
  const column = (v, key, size, artOf, o) => {
    const box = SIZES[size];
    const art = artOf(box[0], Math.min(box[1], artRows));
    const pw = (o.barW ?? barW) + PLATE_PAD;
    return { v, key, art, aw: artWidth(art), cw: Math.max(pw, art ? artWidth(art) : 0), plateW: pw, ...o, barW: o.barW ?? barW };
  };
  const cols = [];
  const you = column(pv, 'player', youSize(W), (c, r) => playerArt(app, c, r)?.lines ?? null, { isPlayer: true });
  const margin = Math.max(GAP, Math.floor(W / 16)); // the actors stand a little in from the edges
  you.x = margin; cols.push(you);
  let left = you.x + you.cw + GAP, right = W - margin, petCol = null;
  if (pet) {
    const c = column(pet, pet.side ?? pet.name, 'xs', (cc, r) => creatureLines(pet, cc, r), { friend: true, small: true, barW: 10 });
    if (left + c.cw + LANE_MIN + plateW <= right) { c.x = left; left += c.cw + GAP; cols.push(c); petCol = c; }
  }
  // The other foes stand at the far edge. You and the foe you face stand where you really are: the engine
  // keeps every unit's position in yards, so the gap between you is the real one, scaled from melee contact
  // to the widest it has been this fight. Whoever walked closes it on screen: a melee character runs up to
  // the mob (it stands where it was pulled), a mob chases the caster that hit it. Nobody slides who did not move.
  let hidden = 0;
  for (const e of s.enemiesView().filter((x) => x !== focus)) {
    const c = column(e, e.side ?? e.name, 's', (cc, r) => creatureLines(e, cc, r), { small: true, barW: 12, rank: rankOf(e) });
    if (right - c.cw - LANE_MIN - plateW < left) { hidden++; continue; }
    c.x = right - c.cw; right = c.x - GAP; cols.push(c);
  }
  const foe = focus ? column(focus, focus.side ?? focus.name, foeSize(W, rankOf(focus)), (c, r) => creatureLines(focus, c, r), { focused: true, rank: rankOf(focus) }) : null;
  if (foe) {
    const near = left + LANE_MIN, far = Math.max(near, right - foe.cw);
    const pP = s.unitPosYd?.('player'), pF = s.unitPosYd?.(focus.side);
    const yd = combatDistanceYd(pP, pF);
    mem.openYd = Math.max(mem.openYd ?? DEFAULT_OPEN_YD, yd ?? 0);
    mem.openPos ??= new Map();
    if (pP && !mem.openPos.has('player')) mem.openPos.set('player', { ...pP });
    if (pF && !mem.openPos.has(foe.key)) mem.openPos.set(foe.key, { ...pF });
    const walkedP = combatDistanceYd(mem.openPos.get('player'), pP) ?? 0, walkedF = combatDistanceYd(mem.openPos.get(foe.key), pF) ?? 0;
    const share = walkedP + walkedF > 0 ? walkedP / (walkedP + walkedF) : 1; // your share of the closing; yours when nobody has walked yet
    const frac = yd == null ? 1 : Math.max(0, Math.min(1, (yd - MELEE_CONTACT_YD) / Math.max(1, mem.openYd - MELEE_CONTACT_YD)));
    const closing = Math.round((1 - frac) * (far - near)), yours = Math.round(closing * share);
    for (const col of cols) if (col.isPlayer || col.friend) col.x += yours; // your pet walks beside you
    foe.x = far - (closing - yours); foe.yd = yd;
    // The pet has its own yards too: it runs out from your side to the foe and back. Its distance to the
    // foe, from your gap down to melee contact, slides it from its place beside you to just in front of
    // the foe's plate (the lane is at least LANE_MIN wide, so the two never overlap).
    if (petCol && yd != null) {
      const dPet = combatDistanceYd(s.unitPosYd?.(petCol.key), pF);
      if (dPet != null) {
        const out = Math.max(0, Math.min(1, (yd - dPet) / Math.max(1, yd - MELEE_CONTACT_YD)));
        petCol.x += Math.round(out * Math.max(0, foe.x - GAP - (petCol.x + petCol.cw)));
      }
    }
    cols.push(foe);
  }
  const zone = artRows, stateRow = zone + 3, auraTop = zone + 4, floorRow = auraTop + auraH, barTop = floorRow + 1;
  const c = canvas(W, H);
  for (const col of cols) {
    const v = col.v, dead = v.hp <= 0;
    // The sprite stands on the plate, centred over it; the plate hangs under its feet. A swing lunges it two
    // columns toward the other side for a moment.
    if (col.art) {
      const lunge = now - (mem.lunge?.get(col.key) ?? -Infinity) < LUNGE_MS ? (col.isPlayer || col.friend ? 2 : -2) : 0;
      col.ax = col.x + Math.max(0, Math.floor((col.cw - col.aw) / 2)) + lunge; col.top = zone - col.art.length; putLines(c, col.ax, col.top, col.art);
    }
    putLines(c, col.x, zone, plateLines(app, v, { ...col, dead }));
    // Your cast sits where the foe's does: under the power bar, in the state row every plate keeps.
    const slot = castSlot(v, now);
    if (slot && !dead) put(c, col.x, stateRow, cut(slot, col.plateW));
    else if (col === foe && hidden) put(c, col.x, stateRow, dim(`+${hidden} more in the fight`));
    if (!col.small && !dead) putLines(c, col.x, auraTop, auraRows(app, mem, v, col.key, col.plateW, icons));
    // Hits and heals rise from the chest, the newest lowest; without art they sit beside the name.
    const pops = (mem.pops.get(col.key) ?? []).filter((p) => now - p.t < POP_MS);
    pops.forEach((p, i) => {
      const text = now - p.t > POP_MS / 2 ? dim(p.text) : p.text;
      // On the sprite's inner shoulder, spilling toward the middle of the stage, so the body stays readable.
      if (col.art) put(c, col.isPlayer || col.friend ? col.ax + col.aw - 1 : col.ax + 1 - vis(text), col.top + Math.floor(col.art.length / 3) - Math.floor((now - p.t) / POP_RISE_MS) - i, text);
      else put(c, col.x + col.plateW + 1 + i * (vis(text) + 1), zone, text);
    });
  }
  // The engine's missiles in flight cross the gap as glyphs (putMissiles), on a row through the sprites' chests.
  putMissiles(c, s, cols, now, Math.max(0, zone - 1 - Math.floor(Math.min(artRows, 14) / 2)), (id) => app.ds.spell(id)?.name);
  c[floorRow] = floorLine(W, gray);
  if (barRows) putLines(c, 0, barTop, barLines);
  const out = c.map((l) => fit(l, W));
  // The open lane between your side's sprites and the faced foe's, for what is drawn over the stage later
  // (the drops after a win, putLootToasts).
  if (foe) out.lane = { left: Math.max(...cols.filter((x) => x.isPlayer || x.friend).map((x) => (x.art ? x.ax + x.aw : x.x))), right: foe.art ? foe.ax : foe.x, rows: zone };
  return out;
}

/** The player's frame between fights: one line of name, level and bars. No auras here, the fight shows those. */
export function idlePlayerFrame(app, mem, W) {
  const ch = app.ch, ds = app.ds;
  const v = {
    name: ch.name, level: ch.level, hp: ch.health, maxHp: maxHealth(ch, ds), power: ch.power, maxPower: maxPower(ch, ds),
    powerType: powerType(ch), casting: null, controlled: null, buffs: [], debuffs: [],
  };
  return unitFrame(app, mem, v, W, 0, true, false, { compact: true });
}

export const AUTOPILOT_STEP_MS = 350;
const REST_SECONDS_PER_STEP = 10; // a rest step folds this much regen in; the log says so

/** Watchable autopilot: the planner picks a step every few hundred ms; a fight step runs as a live session
 *  (the same frames and combat log as pressing Enter on a creature) and the planner waits for it to end.
 *  Esc stops the run; in a fight Esc runs away and stops it. `quest` pins the run to that quest (Do Quest).
 *  No step cap unless `steps` asks for one: the Stop after setting ends the run, in real minutes. */
export function startAutopilot(app, steps = Infinity, farmQuery, quest) {
  if (app.fight || app.auto) return;
  const what = farmQuery ? `farming ${farmQuery}` : quest != null ? `doing ${app.ds.quest(quest)?.title ?? `quest ${quest}`}` : 'questing';
  const ctl = {
    timer: null, fights: 0, kills: 0, xp: 0, deaths: 0, items: 0, restSteps: 0, status: '', browsing: false, paused: false, frames: newFrameMemory(app),
    // What the run strip, the run panel, the Run pane and the end card read (tuiAutopilot.mjs).
    what, steps, farmQuery, quest, startedAt: Date.now(), gold0: app.ch.gold, level0: app.ch.level, ledger: [], turnedIn: [], ended: null,
    get planner() { return ap; },
    /** One row in the Run pane per planner step; a rest keeps updating its one row. */
    note(kind, body, { replace = false } = {}) {
      const last = this.ledger[this.ledger.length - 1];
      if (replace && last && last.kind === kind) { last.n = ap.step; last.body = body; return last; }
      const row = { n: ap.step, kind, body };
      this.ledger.push(row);
      if (this.ledger.length > 500) this.ledger.splice(0, this.ledger.length - 500);
      return row;
    },
    /** One planner step (the check script calls this by hand). Returns false when the run is over. */
    step() {
      if (app.fight || this.paused) return true; // the live fight calls back through onEnd
      let line;
      try { line = ap.next(); }
      catch (err) { app.say(red(`autopilot error: ${err.message}`)); line = null; }
      if (line == null) { this.end(); return false; }
      if (ap.lastKind === 'wait') {
        // One rest line that keeps updating instead of a column of them.
        this.restSteps++;
        this.status = `resting ${this.restSteps * REST_SECONDS_PER_STEP} s`;
        const text = `${dim('    resting')} ${dim(`${this.restSteps * REST_SECONDS_PER_STEP} s`)}  HP ${app.hpText()}  ${app.pwText()}`;
        if (this.restSteps > 1 && app.log.length && app.log[app.log.length - 1].includes('resting')) app.log[app.log.length - 1] = text;
        else app.say(text);
        this.note('wait', `rest ${this.restSteps * REST_SECONDS_PER_STEP} s   ${dim(`HP ${app.hpText()}   ${app.pwText()}`)}`, { replace: true });
      } else {
        this.restSteps = 0;
        if (line) {
          app.say(line);
          const body = stepBody(line), plain = strip(body).trim();
          this.status = plain;
          const kind = /^skipping /.test(plain) ? 'skip' : /^back to life/.test(plain) ? 'dead' : /^autopilot stopped/.test(plain) ? 'stop' : ap.lastKind ?? 'note';
          this.note(kind, body);
          if (kind === 'turnin' && /^turned in /.test(plain)) this.turnedIn.push(plain.slice('turned in '.length));
        }
      }
      // The step line already tells the story; the engine's activity rows for it would repeat it.
      app.lastActivity = app.g.state.activity[0] ?? null;
      app.renderSoon();
      return true;
    },
    stop() { if (this.timer) app.term.clearInterval(this.timer); this.timer = null; if (app.auto === this) { app.auto = null; app.lastRun = this; } void app.persist(); app.render(); },
    /** The run is over (the planner stopped, or `why` says the player did): the log line, then the end card
     *  once there is something to sum up. */
    end(why) {
      this.ended = why ?? null;
      this.stop();
      app.say(`${cyan(why ? 'Autopilot stopped.' : 'Autopilot done.')} ${dim(stopText(app, this))}  ${ap.summary()} ${dim(`${this.fights} fights, ${this.kills} kills, +${this.xp} xp`)}`);
      if (!app.closed && (this.fights > 0 || ap.step > 3)) { app.stack = []; app.push(endCard(app, this)); }
      app.afterAction();
    },
    /** Between fights: the run panel (tuiAutopilot.mjs) fills the middle. */
    render(W, H) { return runPanelLines(app, this, W, H); },
  };
  const liveFight = (step, settle) => {
    const c = app.ds.creature(step.creatureEntry);
    const name = c?.name ?? String(step.creatureEntry);
    const why = () => fightReason(app, step);
    const reason = why();
    ctl.status = `${step.forQuest ? 'quest target' : 'hunting'}: ${name}${reason && step.forQuest ? `  ${reason.short}` : ''}`;
    app.say(`${dim(String(ap.step).padStart(3) + '.')} ${ctl.status}`);
    const row = ctl.note('fight', `${fit(name, 24)} ${cyan('fighting')}${reason ? `   ${dim(reason.short)}` : ''}`);
    const f = startFight(app, step.creatureEntry, {
      label: 'autopilot', why,
      onEnd: (r) => {
        ctl.watchFight = false; // w watches one fight; the next one draws inside the panel again
        if (!r) { row.body = `${fit(name, 24)} ${yellow('ran')}`; ctl.end('you ran'); return; }
        const skippedBefore = ap.skipped.length;
        settle(r);
        ctl.status = `${r.outcome === 'win' ? 'beat' : r.outcome === 'defeat' ? 'lost to' : 'stalemate with'} ${name}`;
        ctl.fights++;
        if (r.outcome === 'win') { ctl.kills += r.killCount ?? 1; ctl.xp += r.xpGained; ctl.items += r.loot.reduce((n, d) => n + (d.count ?? 1), 0); }
        if (r.outcome === 'defeat') ctl.deaths++;
        const outcome = r.outcome === 'win' ? green('won') : r.outcome === 'defeat' ? red('lost') : yellow('stalemate');
        const loot = r.loot.map((d) => `${app.itemLabel(d.item)}${d.count > 1 ? ` x${d.count}` : ''}`).join(', ');
        row.body = `${fit(name, 24)} ${outcome}  ${dim(`${(r.result.durationMs / 1000).toFixed(1)} s`)}${r.xpGained ? `   ${yellow(`+${r.xpGained} xp`)}` : ''}${loot ? `   ${loot}` : ''}`;
        for (const entry of ap.skipped.slice(skippedBefore)) ctl.note('skip', `skipped ${app.ds.quest(entry)?.title ?? `quest ${entry}`}   ${dim(`died ${ap.questDefeats(entry)} times`)}`);
      },
    });
    return f.ok ? f : { ok: false, reason: f.reason };
  };
  const ap = app.cmds.createAutopilot(farmQuery ? `farm ${farmQuery}` : '', { liveFight, quest, maxSteps: steps, clock: () => Date.now() - ctl.startedAt });
  if (ap.error) { app.say(red(ap.error)); app.render(); return; }
  app.say(cyan(`Autopilot: ${what}, fights play live. Esc stops it.`));
  app.auto = ctl;
  ctl.timer = app.term.setInterval(() => ctl.step(), AUTOPILOT_STEP_MS);
  app.render();
  return ctl;
}
