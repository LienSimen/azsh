// Live combat and the animated autopilot for the windowed game. A fight is the engine's real-time
// session (Game.beginFight) ticked every 100 ms, drawn as unit frames with a cast slot and auras. Auto-play
// runs the character's rotation; a number key presses an ability over it for one GCD. The numbered ability
// bar only shows in manual play, where you need it.
import { bold, dim, cyan, yellow, green, red, gray, inverse, fit, vis, cut, bar, strip, brightBlue } from './text.mjs';
import { formatCombatLog, combatLogPlainText, POWER_MERGE_MS } from './combatLogFormat.ts';
import { moneyText } from '../domain/economy/money.ts';
import { maxHealth, maxPower } from '../domain/character/character.ts';
import { powerType } from '../domain/character/characterStats.ts';
import { pullOpts, sessionLogNames } from './squad.mjs';
import { slotContent, visibleBars } from './tuiBars.mjs';
import { autoLootOn, openLoot } from './tuiLoot.mjs';
import { createCombatMacroHost } from './macroHostCombat.ts';

export const TICK_MS = 100; // one engine tick per 100 ms of real time, like the web client
const POWER_PAINT = { mana: brightBlue, rage: red, energy: yellow, focus: yellow };

/** Start a live fight. Returns `{ ok: true, ctl }` or `{ ok: false, reason }`. `onEnd(outcome)` runs after the
 *  fight resolves (outcome null when the player ran); `label` names who is driving (the autopilot). `begin` replaces
 *  beginFight (a dungeon stop, squad always in) and `after(outcome)` runs right after resolveFight. `resolve(session)`
 *  replaces resolveFight for a fight that pays nothing (a duel); Esc in one forfeits instead of running. */
export function startFight(app, creatureEntry, { onEnd, label, begin, after, resolve } = {}) {
  if (app.fight) return { ok: false, reason: 'Already in a fight.' };
  if (app.isDead()) { app.flashMsg('You are dead.'); return { ok: false, reason: 'You are dead.' }; }
  const opts = begin ? { withSquad: true } : pullOpts(app.g, app.ds, app.cmds.buffPace, creatureEntry, (l) => app.say(cyan(l)));
  const b = begin ? begin() : app.g.beginFight(creatureEntry, opts);
  if (!app.result(b)) { app.render(); return { ok: false, reason: b.reason || 'Cannot fight that.' }; }
  const session = b.session;
  const squadXp = new Map((app.g.state.squad ?? []).map((c) => [c.id, c.xp ?? 0]));
  const ctl = {
    after, resolve, session, enemyName: b.enemyName, enemyEntry: b.enemyEntry, onEnd, label, withSquad: !!opts && (app.g.state.squad ?? []).length > 0,
    // A fight opened from a window (the dungeon run) takes the screen and hands the window back after.
    savedStack: app.stack,
    auto: true, paused: false, speed: app.fightSpeed ?? 1, pressed: null, pressedTicks: 0, follow: [], focus: null, macros: null, timer: null, pend: null, ended: false,
    frames: newFrameMemory(app), compact: false,
    names: sessionLogNames(session, { playerName: app.ch.name, enemyName: b.enemyName, spellName: (id) => app.ds.spell(id)?.name }),
    hint() { return `${this.auto ? 'a: manual play' : '1-0: your action bar   a: auto-play'}${session.alliesView().length ? '   t: orders' : ''}   c: cancel a buff${app.g.state.instance ? '   p: pull +1' : ''}   space: ${this.paused ? 'resume' : 'pause'}   + -: speed ${this.speed}x   l: log   Esc: ${this.label ? 'run away, stop autopilot' : 'run away'}`; },
    schedule() {
      if (this.timer) app.term.clearInterval(this.timer);
      this.timer = app.term.setInterval(() => this.tick(), Math.max(10, TICK_MS / this.speed));
    },
    stop() { if (this.timer) app.term.clearInterval(this.timer); this.timer = null; },
    /** One engine tick (the check script calls this by hand). */
    tick() {
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
      if (session.ended) this.finish();
      app.render();
    },
    logEvents(events) {
      const flush = () => { if (this.pend && this.pend.amount > 0) app.say(line(this.pend.t, this.pend.remake(this.pend.amount))); this.pend = null; };
      const line = (t, row) => `${dim((t / 1000).toFixed(1).padStart(5) + 's')} ${combatLogPlainText(row)}`;
      for (const ev of events) {
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
      this.ended = true;
      this.stop();
      if (this.pend) { if (this.pend.amount > 0) app.say(`${dim((this.pend.t / 1000).toFixed(1).padStart(5) + 's')} ${combatLogPlainText(this.pend.remake(this.pend.amount))}`); this.pend = null; }
      // Auto-loot off: the corpse holds its drops and coin for the loot window. The autopilot always takes them.
      const hold = !this.resolve && this.label !== 'autopilot' && !autoLootOn(app);
      const r = this.resolve ? this.resolve(session) : app.g.resolveFight(session, hold ? { holdLoot: true } : undefined);
      app.fight = null;
      app.stack = this.savedStack;
      this.after?.(r);
      const tag = r.outcome === 'win' ? green(bold('Victory')) : r.outcome === 'defeat' ? red(bold('Defeat')) : yellow(bold('Stalemate'));
      const bits = [`${(r.result.durationMs / 1000).toFixed(1)} s`, `HP ${app.hpText()}`];
      if (r.xpGained) bits.push(`+${r.xpGained} xp`);
      if (r.goldGained && !hold) bits.push(`+${moneyText(r.goldGained)}`);
      app.say(`${tag} against ${this.enemyName}  ${dim(bits.join('  '))}`);
      if (!hold) for (const d of r.loot) app.say(`  ${yellow('You receive')} ${app.itemName(d.item)}${d.count > 1 ? ` x${d.count}` : ''}`);
      const gained = (app.g.state.squad ?? []).filter((c) => (c.xp ?? 0) !== squadXp.get(c.id)).map((c) => `${c.name} ${(c.xp ?? 0) > (squadXp.get(c.id) ?? 0) ? `+${(c.xp ?? 0) - (squadXp.get(c.id) ?? 0)} xp` : 'levels up'}`);
      if (gained.length) app.say(dim(`  Companions: ${gained.join(', ')}`));
      for (const lv of r.leveledTo) { app.say(bold(green(`  You have reached level ${lv}!`))); app.flashMsg(`Level ${lv}!`); }
      if (r.outcome === 'win') app.flashMsg(`${this.enemyName} dies.${r.xpGained ? `  +${r.xpGained} xp` : ''}`);
      // The lines above already tell the story; the engine's activity rows for this fight would repeat it.
      app.lastActivity = app.g.state.activity[0] ?? null;
      if (hold) openLoot(app);
      app.afterAction();
      this.onEnd?.(r);
    },
    flee() {
      if (this.resolve) { session.forfeit('player'); for (let i = 0; i < 50 && !session.ended; i++) session.tick(); this.finish(); return; }
      this.ended = true;
      this.stop();
      app.g.abandonLiveFight();
      app.fight = null;
      app.stack = this.savedStack;
      app.say(yellow(`You run from ${this.enemyName}.`));
      app.lastActivity = app.g.state.activity[0] ?? null;
      app.afterAction();
      this.onEnd?.(null);
    },
    key(k) {
      if (k === 'escape') { this.flee(); return; }
      if (k === 'space') { this.paused = !this.paused; app.render(); return; }
      if (k === 'a') { this.auto = !this.auto; session.aiPlayer = this.auto; app.say(dim(this.auto ? 'Auto-play on: your rotation plays.' : 'Auto-play off: you press every ability.')); app.render(); return; }
      if (k === '+' || k === '=') { this.speed = app.fightSpeed = Math.min(8, this.speed * 2); this.schedule(); app.render(); return; }
      if (k === '-') { this.speed = app.fightSpeed = Math.max(0.5, this.speed / 2); this.schedule(); app.render(); return; }
      if (k === 'pageup') { app.logScroll = Math.min(app.log.length, app.logScroll + 5); app.render(); return; }
      if (k === 'pagedown') { app.logScroll = Math.max(0, app.logScroll - 5); app.render(); return; }
      if (k === 'l') { app.openLog(); return; }
      if (k === 't') { partyOrders(app, this); return; }
      if (k === 'c') { cancelBuff(app, this); return; }
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
          out.push({ key, item: c.entry, label: `${app.itemName(c.entry)}${it ? ` x${it.count}` : ''}`, usable: !!it?.usable, reason: it ? it.reason : 'none left', cooldownRemainingMs: 0 });
        } else {
          const info = this.macroHost().info(c.id);
          out.push({ key, macro: c.id, label: info?.name ?? app.g.macroById(c.id)?.name ?? c.id, usable: info?.usable !== false, reason: info?.reason, cooldownRemainingMs: info?.cooldownRemainingMs ?? 0 });
        }
      }
      if (out.length) return out;
      return abs.filter((x) => !x.spell.passive).slice(0, 9).map((ab, i) => ({ key: String(i + 1), spell: ab.spell, label: ab.spell.name, usable: ab.usable, reason: ab.reason, cooldownRemainingMs: ab.cooldownRemainingMs }));
    },
    render(W, H) {
      const lines = [];
      const t = (session.t / 1000).toFixed(1);
      const mode = this.auto ? green('AUTO') : yellow('MANUAL');
      lines.push(` ${bold(`Fighting ${this.enemyName}`)}   ${dim(`${t}s`)}   ${mode}${this.paused ? red('  PAUSED') : ''}${this.speed !== 1 ? dim(`  ${this.speed}x`) : ''}${this.label ? cyan(`   ${this.label}`) : ''}`);
      lines.push('');
      const pv = session.playerView(), now = session.t;
      lines.push(...unitFrame(app, this.frames, pv, W, now, true));
      const pet = session.petView();
      const allies = session.alliesView();
      const enemies = session.enemiesView();
      // Four companions and their pets do not fit two lines each: once the party outgrows the pane every
      // ally drops to one line for the rest of the fight, so frames never jump between the two shapes.
      const need = 3 + 2 * (1 + (pet ? 1 : 0) + allies.length + enemies.length) + (this.auto ? 0 : 3);
      if (need > H) this.compact = true;
      const nameOfSide = (side) => (side === 'player' ? app.ch.name : [...allies, ...enemies].find((v) => v.side === side)?.name ?? (pet?.side === side ? pet.name : null));
      if (pet) lines.push(...unitFrame(app, this.frames, pet, W, now, false, false, { compact: this.compact }));
      for (const ally of allies) {
        const t = ally.hp > 0 ? session.targetOf?.(ally.side) : null;
        lines.push(...unitFrame(app, this.frames, ally, W, now, false, false, { compact: this.compact, party: true, role: ally.groupRole, target: t ? nameOfSide(t) : null }));
      }
      lines.push('');
      for (const e of enemies) lines.push(...unitFrame(app, this.frames, e, W, now, false, e === session.enemyView()));
      if (this.auto) return lines.slice(0, H);
      lines.push('');
      // Ability bar (manual play only): numbered, dim when unusable, cooldown shown.
      const abs = this.abilityBar();
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
      if (items.length) row += `${inverse(' 0 ')} ${items[0].item.name ?? 'item'} x${items[0].count}`;
      lines.push(row);
      const unusable = abs.filter((a) => !a.usable && a.reason && a.cooldownRemainingMs <= 0).slice(0, 3);
      if (unusable.length) lines.push(dim(`   ${unusable.map((a) => `${a.label}: ${a.reason}`).join('   ')}`));
      return lines.slice(0, H);
    },
  };
  session.aiPlayer = true;
  app.fight = ctl;
  app.stack = [];
  if (app.auto) app.auto.browsing = false; // an autopilot fight always comes back on screen
  app.say(cyan(`You attack ${b.enemyName}.`) + (b.packAssist?.length ? yellow(` ${b.packAssist.map((p) => p.name).join(', ')} join${b.packAssist.length === 1 ? 's' : ''} the fight!`) : ''));
  ctl.schedule();
  app.render();
  return { ok: true, ctl };
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

const CAST_W = 30; // the cast/control slot on a frame's second line, so auras never move when a cast starts

/** Per-fight memory that keeps frames steady: which units have used the cast slot, and the order auras
 *  first showed up in, so a refreshed buff keeps its place instead of jumping to the end. */
function newFrameMemory(app) {
  // The player's own slot and aura order carry across fights, so their frame never reshuffles.
  app.playerAuraOrder ??= new Map();
  return { castSlot: new Set(app.playerCastSlot ? ['player'] : []), auraOrder: new Map([['player', app.playerAuraOrder]]) };
}

const ROLE_GLYPH = { tank: cyan('T'), healer: green('H'), damage: red('D') };

/** Two lines: name/level/HP/power, then a fixed cast slot + auras. `now` is the clock `casting` runs on. A party
 *  frame carries its role letter and target; `compact` keeps it to the first line with the cast in it. */
function unitFrame(app, mem, v, W, now, isPlayer, focused = false, { compact = false, party = false, role, target } = {}) {
  const dead = v.hp <= 0;
  const namePaint = dead ? gray : isPlayer ? green : focused ? red : party ? cyan : yellow;
  const barW = Math.max(10, Math.min(30, Math.floor((W - 48) / 2)));
  const hpBar = bar(v.hp, v.maxHp, barW, dead ? gray : v.hp / v.maxHp < 0.25 ? red : green);
  const pp = POWER_PAINT[v.powerType] ?? cyan;
  const pwBar = v.maxPower > 0 ? ` ${bar(v.power, v.maxPower, Math.floor(barW / 2), pp)} ${fit(`${v.power}`, 4)}` : '';
  const tag = party ? `${ROLE_GLYPH[role] ?? dim('·')} ` : '';
  const after = dead ? gray('  dead') : target ? dim(`  → ${target}`) : '';
  const head = ` ${fit(`${tag}${namePaint(bold(v.name))} ${dim(`L${v.level}`)}${focused ? red(' ◀') : ''}`, 26)} ${hpBar} ${fit(`${v.hp}/${v.maxHp}`, 11)}${pwBar}`;
  if (compact) return [cut(`${head}${v.casting && !dead ? `  ${yellow(v.casting.name)}` : after}`, W)];
  // Cast slot: a cast bar, else crowd control, else stealth. Once a unit has used it the slot stays
  // reserved (blank when idle), so the auras after it hold still.
  let slot = '';
  if (v.casting) {
    const total = v.casting.endsAt - v.casting.startedAt;
    const left = Math.max(0, v.casting.endsAt - now);
    const prog = v.casting.channeled ? left / total : 1 - left / total;
    slot = `${fit(yellow(v.casting.name), 14)} ${bar(prog, 1, 10, yellow)} ${dim(`${(left / 1000).toFixed(1)}s`)}`;
  } else if (v.controlled) slot = red(v.controlled.control);
  else if (v.stealthed) slot = dim('stealthed');
  const key = isPlayer ? 'player' : (v.side ?? v.name);
  if (slot) {
    mem.castSlot.add(key);
    if (isPlayer) app.playerCastSlot = true; // kept across fights and the autopilot's between-fight frame
  }
  const order = mem.auraOrder.get(key) ?? new Map();
  mem.auraOrder.set(key, order);
  const placed = (list) => {
    for (const a of list) if (!order.has(a.spellId)) order.set(a.spellId, order.size);
    return [...list].sort((a, b) => order.get(a.spellId) - order.get(b.spellId));
  };
  const aura = (a, paint) => paint(`${app.ds.spell(a.spellId)?.name ?? a.spellId}${a.stacks > 1 ? ` x${a.stacks}` : ''}${a.remainingMs != null ? dim(` ${auraTime(a.remainingMs)}`) : ''}`);
  const auras = [...placed(v.buffs).slice(0, 6).map((a) => aura(a, green)), ...placed(v.debuffs).slice(0, 6).map((a) => aura(a, red))].join('  ');
  const reserve = mem.castSlot.has(key);
  if (!reserve && !auras) return [cut(`${head}${after}`, W)];
  return [cut(`${head}${after}`, W), cut(`   ${reserve ? `${fit(slot, CAST_W)}  ` : ''}${auras}`, W)];
}

/** Aura time left at a fixed width: "  9s", " 12s", " 30m". */
function auraTime(ms) {
  const s = Math.ceil(ms / 1000);
  return (s < 60 ? `${s}s` : `${Math.ceil(s / 60)}m`).padStart(3);
}

/** The player's frame from the character between fights, shaped like the in-fight one so it stays put. */
function idlePlayerFrame(app, mem, W) {
  const ch = app.ch, ds = app.ds, now = Date.now();
  const buffs = (ch.activeAuras ?? (ch.activeBuffs ?? []).map((spellId) => ({ spellId })))
    .filter((a) => a.expiresAt == null || a.expiresAt > now)
    .map((a) => ({ spellId: a.spellId, ...(a.expiresAt != null ? { remainingMs: a.expiresAt - now } : {}) }));
  const v = {
    name: ch.name, level: ch.level, hp: ch.health, maxHp: maxHealth(ch, ds), power: ch.power, maxPower: maxPower(ch, ds),
    powerType: powerType(ch), casting: null, controlled: null, buffs, debuffs: [],
  };
  return unitFrame(app, mem, v, W, 0, true);
}

export const AUTOPILOT_STEP_MS = 350;
const REST_SECONDS_PER_STEP = 10; // a rest step folds this much regen in; the log says so

/** Watchable autopilot: the planner picks a step every few hundred ms; a fight step runs as a live session
 *  (the same frames and combat log as pressing Enter on a creature) and the planner waits for it to end.
 *  Esc stops the run; in a fight Esc runs away and stops it. `quest` pins the run to that quest (Do Quest). */
export function startAutopilot(app, steps = 200, farmQuery, quest) {
  if (app.fight || app.auto) return;
  const what = farmQuery ? `farming ${farmQuery}` : quest != null ? `doing ${app.ds.quest(quest)?.title ?? `quest ${quest}`}` : 'questing';
  const ctl = {
    timer: null, fights: 0, kills: 0, xp: 0, restSteps: 0, status: '', browsing: false, frames: newFrameMemory(app),
    /** One planner step (the check script calls this by hand). Returns false when the run is over. */
    step() {
      if (app.fight) return true; // the live fight calls back through onEnd
      let line;
      try { line = ap.next(); }
      catch (err) { app.say(red(`autopilot error: ${err.message}`)); line = null; }
      if (line == null) { this.stop(); app.say(`${cyan('Autopilot done.')} ${ap.summary()} ${dim(`${this.fights} fights, ${this.kills} kills, +${this.xp} xp`)}`); app.afterAction(); return false; }
      if (ap.lastKind === 'wait') {
        // One rest line that keeps updating instead of a column of them.
        this.restSteps++;
        this.status = `resting ${this.restSteps * REST_SECONDS_PER_STEP} s`;
        const text = `${dim('    resting')} ${dim(`${this.restSteps * REST_SECONDS_PER_STEP} s`)}  HP ${app.hpText()}  ${app.pwText()}`;
        if (this.restSteps > 1 && app.log.length && app.log[app.log.length - 1].includes('resting')) app.log[app.log.length - 1] = text;
        else app.say(text);
      } else {
        this.restSteps = 0;
        if (line) { app.say(line); this.status = strip(line).trim(); }
      }
      // The step line already tells the story; the engine's activity rows for it would repeat it.
      app.lastActivity = app.g.state.activity[0] ?? null;
      app.render();
      return true;
    },
    stop() { if (this.timer) app.term.clearInterval(this.timer); this.timer = null; if (app.auto === this) app.auto = null; void app.persist(); app.render(); },
    /** Between fights: the same top rows as a fight (header, player frame), so fast runs don't flash the menus. */
    render(W, H) {
      const speed = app.fightSpeed ?? 1;
      const lines = [
        ` ${bold('Autopilot')}   ${dim(what)}   ${dim(`${this.fights} fights  ${this.kills} kills  +${this.xp} xp`)}${speed !== 1 ? dim(`  ${speed}x`) : ''}`,
        '',
        ...idlePlayerFrame(app, this.frames, W),
        '',
        dim(` ${cut(this.status || 'planning the next step', W - 2)}`),
      ];
      return lines.slice(0, H);
    },
  };
  const liveFight = (step, settle) => {
    const c = app.ds.creature(step.creatureEntry);
    ctl.status = `${step.forQuest ? 'quest target' : 'hunting'}: ${c?.name ?? step.creatureEntry}`;
    app.say(`${dim(String(ap.step).padStart(3) + '.')} ${ctl.status}`);
    const f = startFight(app, step.creatureEntry, {
      label: 'autopilot',
      onEnd: (r) => {
        if (!r) { app.say(yellow('Autopilot stopped: you ran.')); ctl.stop(); return; }
        settle(r);
        ctl.status = `${r.outcome === 'win' ? 'beat' : r.outcome === 'defeat' ? 'lost to' : 'stalemate with'} ${c?.name ?? step.creatureEntry}`;
        ctl.fights++;
        if (r.outcome === 'win') { ctl.kills += r.killCount ?? 1; ctl.xp += r.xpGained; }
      },
    });
    return f.ok ? f : { ok: false, reason: f.reason };
  };
  const ap = app.cmds.createAutopilot(`${steps}${farmQuery ? ` farm ${farmQuery}` : ''}`, { liveFight, quest });
  if (ap.error) { app.say(red(ap.error)); app.render(); return; }
  app.say(cyan(`Autopilot: ${what}, fights play live. Esc stops it.`));
  app.auto = ctl;
  ctl.timer = app.term.setInterval(() => ctl.step(), AUTOPILOT_STEP_MS);
  app.render();
  return ctl;
}
