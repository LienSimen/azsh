// How the autopilot run looks on screen: the pre-flight card a opens, the run strip under the tabs while
// you browse, the run panel between fights (now, next, quests, this run's numbers, what stops it), the Run
// pane at the bottom (one row per planner step) and the end card. The run itself is the controller in
// tuiFight.mjs (startAutopilot); the planner is repl.mjs createAutopilot. Everything here only reads.
import { bold, dim, cyan, yellow, green, red, magenta, inverse, fit, vis, cut, bar, strip, pct, secondsText, wrapLines } from './text.mjs';
import { idlePlayerFrame, startAutopilot, fightArt, flankArt } from './tuiFight.mjs';
import { objectiveLines, questDialog } from './tuiViews.mjs';
import { autopilotSettingsDialog } from './tuiAutopilotSettings.mjs';
import { squadModeOf } from './squad.mjs';
import { moneyText } from '../domain/economy/money.ts';
import { maxHealth, maxPower } from '../domain/character/character.ts';

const H = (text) => ({ text, header: true, plain: true });
/** A labelled line that may run long (a list of quests): wrapped, the later lines indented under the text. */
const wrapRows = (lead, text, W) => wrapLines(text, Math.max(20, W - 13)).map((l, i) => H(`${i ? ' '.repeat(11) : lead}${l}`));
const num = (n) => Math.round(n).toLocaleString('en-US');
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const signedMoney = (copper) => (copper < 0 ? `-${moneyText(-copper)}` : `+${moneyText(copper) || '0c'}`);

/** "questing in Redridge Mountains", "farming Redridge Mystic in …", "doing A Baying of Gnolls". */
export function runWhat(app, ctl) {
  const zone = app.zone()?.name ?? app.ch.zoneId;
  return ctl.quest != null ? ctl.what : `${ctl.what} in ${zone}`;
}

/** The quest the run is on (the pinned one, else the one the last step served) and its counters: "The Algaz
 *  Gauntlet  Dragonmaw Scout 2/8 · Dragonmaw Grunt 0/6". Empty while the run has no quest in hand. */
function questProgress(app, ctl) {
  const log = app.g.state.questlog.quests;
  const open = (e) => log.find((x) => x.entry === e && x.status !== 'turnedIn');
  // The pinned quest, else the one the last step served; once that is handed in or skipped, the next one in the log with work.
  const last = ctl.planner.skips(ctl.planner.lastQuest) ? null : ctl.planner.lastQuest;
  let qs = open(ctl.quest ?? last) ?? log.find((x) => x.status === 'active' && !ctl.planner.skips(x.entry)) ?? log.find((x) => x.status === 'complete');
  const q = qs ? app.ds.quest(qs.entry) : null;
  if (!q) return '';
  const counts = qs.status === 'complete' ? green('ready to turn in') : objectiveLines(app, q, qs).map((o) => o.replace(' slain: ', ' ')).join(sep);
  return `${cyan(q.title)}  ${counts}`;
}

/** Why the run ended, in a sentence. The planner's reasons come first; the controller's own (Esc, running) are plain text. */
export function stopText(app, ctl) {
  if (ctl.ended) return ctl.ended;
  const r = ctl.planner.stopReason;
  if (!r) return 'the run ended';
  const d = r.detail ? ` (${r.detail})` : '';
  switch (r.reason) {
    case 'levelCap': return `level ${app.ch.level} reached`;
    case 'timeUp': return 'the time limit ran out';
    case 'defeated': return `${ctl.planner.defeats} deaths in a row`;
    case 'steps': return r.detail;
    case 'questComplete': return r.detail ?? 'the quest is done';
    case 'outOfConsumables': return 'out of food and drink';
    case 'noTargets': return `nothing left to do${d}`;
    default: return `${r.reason}${d}`;
  }
}

/** The run is over and wants a person: the pinned quest is ready to hand in with a reward to choose. */
export function needsYou(ctl) {
  const r = ctl.planner.stopReason;
  return !!r && r.reason === 'questComplete' && /^Ready to hand in/.test(r.detail ?? '') ? ctl.quest : null;
}

// ---- the strip under the tabs ----------------------------------------------------------------------

/** One line while the run is alive and something else fills the middle: what, doing, the two numbers, the keys. */
export function runStripLine(app, W) {
  const ctl = app.auto;
  const head = ctl.paused ? yellow('‖ Autopilot paused') : cyan('▶ Autopilot');
  const keys = dim('Esc, w: back to the run');
  const bits = [ctl.what, cut(ctl.status, Math.max(16, W - 70)) || dim('planning'), `${ctl.fights} fights  ${yellow(`+${num(ctl.xp)} xp`)}`, dim(clock(Date.now() - ctl.startedAt))];
  return fit(` ${head}  ${bits.join(dim('  ·  '))}`, W - vis(keys) - 3) + '  ' + keys + ' ';
}

// ---- the panel between fights ----------------------------------------------------------------------

const label = (s) => ` ${cyan(fit(s, 9))} `;
const tag = (s) => ` ${cyan(fit(s, 5))} `;
const sep = dim(' · ');

/** The middle, kept small: one title line (what, where it stands, what stops it), your frame (the header is
 *  down to the XP line during a run), then the fight when one is on or Now and Next between fights. The run's
 *  numbers, the quests and the bags are panes at the bottom. */
export function runPanelLines(app, ctl, W, height) {
  const cfg = app.g.autopilotConfig();
  // The title is the quest the run is on and how it stands; what the run is only when it has no quest in hand.
  // Steps, clock, pace and the stop limits are not progress: the pre-flight card and the Run pane have them.
  // A fight on takes the Now/Next slot with the foes and the party, and its clock sits on the title's right.
  // Your frame stays on the same rows either way. No "Autopilot" label: the screen's shape says so.
  // While a fight is on the sprites take the sides (fightArt: the foe right, you left), the panel keeping the rest.
  const live = app.fight?.label === 'autopilot' && !ctl.watchFight ? app.fight : null;
  const { me, foe, innerW } = live ? fightArt(app, live, W, height) : { me: null, foe: null, innerW: W };
  const fight = live ? live.inlineLines(innerW, Math.max(2, height - 3)) : null;
  const quest = questProgress(app, ctl);
  const right = fight ? `${fight.status} ` : ctl.paused ? `${red('PAUSED')} ` : '';
  const l0 = fit(` ${quest || dim(runWhat(app, ctl))}`, innerW - vis(right)) + right;
  const frame = fight ? fight.player : idlePlayerFrame(app, ctl.frames, innerW);
  const middle = fight ? fight.fight : [nowLine(app, ctl, cfg), nextLine(app, ctl)];
  const lines = [l0, ...frame, ...middle].slice(0, height).map((l) => cut(l, innerW));
  return flankArt(lines, me, foe, W, height);
}

/** The one-line XP header a run keeps in place of the name, bars and tabs. */
export function runHeaderLine(app, W) {
  const ch = app.ch, xpMax = app.ds.xpToNext(ch.level);
  const seg = Math.max(10, Math.min(40, Math.floor(W / 3)));
  return cut(` ${magenta('XP')} ${bar(ch.xp, xpMax, seg, magenta)} ${dim(`${pct(ch.xp, xpMax)}%${ch.restedXp ? ' rested' : ''}   ${num(xpMax - ch.xp)} to level ${ch.level + 1}`)}`, W);
}

// ---- the Quests pane -------------------------------------------------------------------------------

/** The quests the run works on, with their counters, under a line that says what comes next. */
export function questPaneLines(app, L) {
  const ctl = app.auto ?? app.lastRun;
  const ds = app.ds, log = app.g.state.questlog.quests;
  const mine = log.filter((qs) => qs.status !== 'turnedIn').sort((a, b) => (a.entry === ctl?.quest ? -1 : b.entry === ctl?.quest ? 1 : 0));
  const lines = [` ${bold('Quests')}   ${ctl ? dim(strip(nextLine(app, ctl)).replace(/^\s*Next\s+/, 'next: ')) : dim(`${mine.length} in the log`)}`];
  if (!mine.length) return [...lines, dim(' Nothing in the quest log.')];
  const titleW = Math.min(32, Math.max(16, Math.floor(L.W * 0.3)));
  for (const qs of mine.slice(0, L.logH - 1)) {
    const q = ds.quest(qs.entry);
    if (!q) continue;
    const state = qs.status === 'complete' ? green('ready to turn in') : qs.status === 'failed' ? red('failed')
      : (ctl?.planner.skips(qs.entry) ?? app.cmds.questBlacklist.has(qs.entry)) ? dim(`skipped${ctl?.planner.questDefeats(qs.entry) ? `: died ${ctl.planner.questDefeats(qs.entry)} times` : ''}`)
      : objectiveLines(app, q, qs).map((o) => o.replace(' slain: ', ' ')).join(dim('   '));
    lines.push(` ${qs.entry === ctl?.quest ? cyan('▸') : ' '}${fit(q.title, titleW)} ${state}`);
  }
  if (mine.length > L.logH - 1) lines[lines.length - 1] = fit(lines[lines.length - 1], L.W - 10) + dim(`+${mine.length - (L.logH - 1)} more`);
  return lines;
}

// ---- the Bags pane ---------------------------------------------------------------------------------

/** The Bags tab's rows at the bottom, with their own cursor, so an item can be used while the run plays. */
const bagsRows = (app) => { const v = app.tabs.find((t) => t.view.id === 'bags')?.view; return v ? (v.rows(app) ?? []).filter((r) => !r.header || r.text) : []; };

export function bagsPaneLines(app, L) {
  const rows = bagsRows(app);
  const st = (app.bagsPane ??= { cursor: 0 });
  const items = rows.map((r, i) => i).filter((i) => !rows[i].header);
  if (!items.length) return [` ${bold('Bags')}`, dim(' Nothing in your bags.')];
  if (!items.includes(st.cursor)) st.cursor = items.find((i) => i >= st.cursor) ?? items[items.length - 1];
  const room = L.logH - 1;
  const at = items.indexOf(st.cursor);
  const start = Math.max(0, Math.min(at - Math.floor(room / 2), items.length - room));
  const lines = [` ${bold('Bags')}   ${dim('Up Down: pick   Enter: use, equip, open   the run plays on')}`];
  for (const i of items.slice(start, start + room)) {
    const r = rows[i];
    const text = fit(i === st.cursor ? `▶ ${r.text}` : `  ${r.text}`, L.W - 1);
    lines.push(i === st.cursor ? inverse(text) : ` ${text}`);
  }
  return lines;
}

/** Keys on the Bags pane: the cursor moves over the items, Enter acts on the one under it. True when handled. */
export function bagsPaneKey(app, k) {
  const rows = bagsRows(app);
  const st = (app.bagsPane ??= { cursor: 0 });
  const items = rows.map((r, i) => i).filter((i) => !rows[i].header);
  if (!items.length) return false;
  const at = Math.max(0, items.indexOf(st.cursor));
  const move = (d) => { st.cursor = items[Math.max(0, Math.min(items.length - 1, at + d))]; app.render(); return true; };
  if (k === 'up' || k === 'k') return move(-1);
  if (k === 'down' || k === 'j') return move(+1);
  if (k === 'pageup') return move(-5);
  if (k === 'pagedown') return move(+5);
  if (k === 'home') { st.cursor = items[0]; app.render(); return true; }
  if (k === 'end') { st.cursor = items[items.length - 1]; app.render(); return true; }
  if (k === 'return') { const r = rows[st.cursor]; if (r?.act) { r.act(app, r); app.afterAction(); } return true; }
  return false;
}

function nowLine(app, ctl, cfg) {
  const ch = app.ch, ds = app.ds;
  if (/^resting/.test(ctl.status)) {
    const hpMax = maxHealth(ch, ds), pwMax = maxPower(ch, ds);
    const goal = Math.round(cfg.recoverToPct * 100);
    const low = ch.power / Math.max(1, pwMax) < cfg.recoverToPct && pwMax > 0 ? `   MP ${pct(ch.power, pwMax)}% → ${goal}%` : '';
    return `${tag('Now')}${ctl.status}   ${bar(ch.health, hpMax * cfg.recoverToPct, 12, green)}  ${dim(`HP ${pct(ch.health, hpMax)}% → ${goal}%${low}`)}`;
  }
  return `${tag('Now')}${ctl.status || dim('planning the next step')}`;
}

/** What the planner has queued up: quests ready to hand in, then the first unmet objective of each active quest. */
function nextLine(app, ctl) {
  const ds = app.ds, log = app.g.state.questlog.quests;
  const pieces = [];
  if (ctl.farmQuery) pieces.push(`the next ${ctl.farmQuery}`);
  const mine = log.filter((qs) => qs.status !== 'turnedIn' && (ctl.quest == null || qs.entry === ctl.quest) && !ctl.planner.skips(qs.entry));
  for (const qs of mine) { const q = ds.quest(qs.entry); if (q && qs.status === 'complete') pieces.push(`turn in ${q.title}${q.enderName ? ` at ${q.enderName}` : ''}`); }
  for (const qs of mine) {
    const q = ds.quest(qs.entry);
    if (!q || qs.status !== 'active') continue;
    const k = q.killTargets.find((t) => (qs.kills?.[String(t.creatureEntry)] ?? 0) < t.count);
    if (k) { pieces.push(`hunt ${ds.creature(k.creatureEntry)?.name ?? k.creatureEntry} ${Math.min(qs.kills?.[String(k.creatureEntry)] ?? 0, k.count)}/${k.count}`); continue; }
    const o = q.objectTargets.find((t) => (qs.objects?.[String(t.objectEntry)] ?? 0) < t.count);
    if (o) { pieces.push(`find ${ds.gameObject?.(o.objectEntry)?.name ?? 'the objects'} for ${q.title}`); continue; }
    if (q.itemTargets.length) { pieces.push(`collect for ${q.title}`); continue; }
    if (q.enderName) pieces.push(`speak with ${q.enderName}`);
  }
  if (!pieces.length) pieces.push(ctl.quest != null ? 'finish the quest' : 'find a quest to take');
  return `${tag('Next')}${pieces.slice(0, 3).join(sep)}${pieces.length > 3 ? dim(`  +${pieces.length - 3} more`) : ''}`;
}

/** This run in one line: fights, kills, deaths, xp with its rate and the time to the next level, gold and items. */
function runLine(app, ctl) {
  const ch = app.ch, ds = app.ds;
  const hours = (Date.now() - ctl.startedAt) / 3_600_000;
  const xph = hours >= 1 / 60 && ctl.xp > 0 ? ctl.xp / hours : 0;
  const need = ds.xpToNext(ch.level) - ch.xp;
  const eta = xph > 0 ? Math.max(1, Math.round((need / xph) * 60)) : 0;
  const bits = [
    `${ctl.fights} fights`, `${ctl.kills} kills`, ctl.deaths ? red(`${ctl.deaths} deaths`) : dim('0 deaths'),
    yellow(`+${num(ctl.xp)} xp`), ...(xph ? [dim(`${num(xph)} xp/h`), `level ${ch.level + 1} in ${bold(`~${eta} min`)}`] : []),
    yellow(signedMoney(ch.gold - ctl.gold0)), `${ctl.items} item${ctl.items === 1 ? '' : 's'}`,
  ];
  return `${tag('Run')}${bits.join(sep)}`;
}

// ---- the Run pane ----------------------------------------------------------------------------------

const GLYPH = {
  fight: red('⚔'), wait: dim('~'), consume: dim('~'), cannibalize: dim('~'), turnin: green('✓'), accept: green('+'), travel: cyan('→'),
  gather: yellow('⚒'), skin: yellow('⚒'), buy: yellow('$'), equip: green('▲'), skip: yellow('✗'), dead: red('☠'), stop: yellow('■'),
};

/** The planner's ledger, newest last: one row per step, fights folded to their outcome. */
export function runPaneLines(app, L) {
  const ctl = app.auto ?? app.lastRun;
  if (!ctl) return [` ${bold('Run')}`, dim(' No autopilot run yet. a on the World tab starts one.')];
  const ap = ctl.planner;
  const title = fit(`${runLine(app, ctl)}${sep}${dim(`${clock(Date.now() - ctl.startedAt)} · ${ap.step} steps`)}${ctl.ended || ap.done ? dim(`${sep}stopped: ${stopText(app, ctl)}`) : ''}`, L.W);
  const rows = ctl.ledger.slice(-(L.logH - 1));
  if (!rows.length) return [title, dim(' Nothing yet.')];
  return [title, ...rows.map((r) => ` ${dim(`${String(r.n).padStart(4)}.`)}  ${GLYPH[r.kind] ?? dim('·')}  ${r.body}`)];
}

// ---- the end card ----------------------------------------------------------------------------------

/** What the run did, why it stopped, and the keys for what comes next. */
export function endCard(app, ctl) {
  const ap = ctl.planner, ds = app.ds, ch = app.ch;
  const pin = needsYou(ctl);
  const q = pin != null ? ds.quest(pin) : null;
  const keys = {
    q: { hint: 'quests', fn: (a) => { a.stack = []; a.switchTab(1); } },
    b: { hint: 'bags', fn: (a) => { a.stack = []; a.switchTab(2); } },
    a: { hint: 'run again', fn: (a) => { a.stack = []; startAutopilot(a, ctl.steps, ctl.farmQuery, ctl.quest); } },
  };
  if (q) keys.t = { hint: 'hand it in', fn: (a) => { a.stack = []; a.push(questDialog(a, q)); } };
  return {
    id: 'autopilot-done', title: 'Autopilot done', noDetail: true, keys,
    hint: 'Enter: close',
    onKey: (a, k) => { if (k === 'return' || k === 'space') { a.pop(); return true; } return false; },
    rows(a) {
      const ms = Date.now() - ctl.startedAt;
      const xph = ms >= 60_000 && ctl.xp > 0 ? `   ${dim(`${num(ctl.xp / (ms / 3_600_000))} xp/h`)}` : '';
      const skipped = ap.skipped.map((e) => `${ds.quest(e)?.title ?? `quest ${e}`}${ap.questDefeats(e) ? dim(` (died ${ap.questDefeats(e)} times)`) : ''}`);
      const why = q ? yellow(`needs you: ${q.title} is ready to hand in and the reward is yours to pick`) : stopText(a, ctl);
      const rows = [
        H(` ${bold('Autopilot done')}   ${dim(`${secondsText(ms)} · ${ap.step} steps`)}`),
        H(` Stopped: ${why}`),
        H(''),
        H(`${label('Fights')}${ctl.fights - ctl.deaths} won   ${ctl.deaths ? red(`${ctl.deaths} lost`) : dim('0 lost')}        ${cyan('XP')}  ${yellow(`+${num(ctl.xp)}`)}${ctl.level0 !== ch.level ? `   level ${ctl.level0} → ${bold(String(ch.level))}` : ''}${xph}`),
        ...wrapRows(label('Quests'), ctl.turnedIn.length ? `${ctl.turnedIn.length} turned in: ${ctl.turnedIn.join(', ')}` : dim('none turned in'), a.layout().W),
        ...(skipped.length ? wrapRows(' '.repeat(11), `${skipped.length} skipped: ${skipped.join(', ')}`, a.layout().W) : []),
        H(`${label('Loot')}${ctl.items} item${ctl.items === 1 ? '' : 's'}   ${yellow(signedMoney(ch.gold - ctl.gold0))}`),
        H(`${label('Now')}${a.zone()?.name ?? ch.zoneId}   ${dim(`HP ${a.hpText()}   ${a.pwText()}`)}`),
        H(''),
        H(` ${dim(`Enter: close${q ? '   t: hand it in' : ''}   q: quests   b: bags   a: run again`)}`),
      ];
      return rows;
    },
  };
}

// ---- the pre-flight card ---------------------------------------------------------------------------

/** a on the World tab: what the run will do, read from the settings, before it does it. Enter starts it. */
export function preflightCard(app) {
  return {
    id: 'autopilot-preflight', title: 'Autopilot', noDetail: true,
    hint: 'Enter: go',
    keys: {
      A: { hint: 'settings', fn: (a) => a.push(autopilotSettingsDialog(a)) },
      f: { hint: 'farm a creature', fn: (a) => farmPicker(a) },
      u: { fn: (a) => { if (!a.cmds.questBlacklist.size) return; a.cmds.questBlacklist.clear(); a.flashMsg('Skipped quests are back on the list.'); } },
    },
    onKey: (a, k) => { if (k === 'return' || k === 'space') { a.stack = []; startAutopilot(a); return true; } return false; },
    rows(a) {
      const cfg = a.g.autopilotConfig(), ds = a.ds, log = a.g.state.questlog.quests;
      const active = log.filter((qs) => qs.status === 'active').length, ready = log.filter((qs) => qs.status === 'complete').length;
      const mode = squadModeOf(cfg);
      const squad = (a.g.state.squad ?? []).map((c) => c.name);
      const fights = mode === 'party' && squad.length ? `with the party ${dim(`(${squad.join(', ')})`)}` : mode === 'elite' && squad.length ? `alone, the party joins for elites` : squad.length ? 'alone' : `alone ${dim('(no companions hired)')}`;
      const role = { dps: 'damage', tank: 'tank', offtank: 'off-tank' }[cfg.combatRole] ?? cfg.combatRole;
      const stops = [cfg.stopAtLevel > 0 ? `at level ${cfg.stopAtLevel}` : '', `after ${cfg.maxConsecutiveDefeats} deaths in a row`, cfg.sessionMs > 0 ? `after ${Math.round(cfg.sessionMs / 60_000)} min` : ''].filter(Boolean);
      const skipped = [...a.cmds.questBlacklist].map((e) => ds.quest(e)?.title ?? `quest ${e}`);
      const rows = [
        H(` ${bold('Autopilot')}   ${dim('what it will do')}`),
        H(''),
        H(`${label('Questing')}in ${a.zone()?.name ?? a.ch.zoneId}   ${dim(`${active} active quest${active === 1 ? '' : 's'}${ready ? `, ${ready} ready to turn in` : ''}`)}`),
        H(`${label('Fights')}${fights}   role: ${role}`),
        H(`${label('Rest')}below ${Math.round(cfg.healthEnterPct * 100)}% health or ${Math.round(cfg.manaEnterPct * 100)}% mana, until ${Math.round(cfg.recoverToPct * 100)}%`),
        H(`${label('Stops')}${stops.join(dim('   ·   '))}`),
        H(`${label('Quests')}${cfg.questAutoAccept ? 'takes quests on its own' : 'only the quests in the log'}   ${dim('·')}   rewards: ${cfg.questRewardChoice === 'wait' ? 'asks you' : 'picks the best'}   ${dim('·')}   zones: ${{ 'level-safe': 'when the level fits', any: 'wherever the quests go', off: 'stays here' }[cfg.questZoneSwap] ?? cfg.questZoneSwap}`),
        ...(skipped.length ? [H(`${label('Skips')}${skipped.join(', ')}   ${dim('u: take them again')}`)] : []),
        H(''),
        H(` ${dim('Enter: go     A: settings     f: farm a creature instead     Esc: not now')}`),
      ];
      return rows;
    },
  };
}

/** f on the pre-flight card: hunt one creature of this zone over and over. */
function farmPicker(app) {
  const z = app.zone();
  const mobs = (z?.huntable ?? []).map((e) => app.ds.creature(e)).filter(Boolean).sort((x, y) => x.level - y.level || x.name.localeCompare(y.name));
  if (!mobs.length) { app.flashMsg('Nothing to hunt here.'); return; }
  app.pick('Farm which creature?', mobs.map((c) => ({ label: `${c.name}  ${dim(`L${c.level}`)}`, value: c.name })), (name) => { app.stack = []; startAutopilot(app, Infinity, name); });
}

/** Strip the planner's "  93. " prefix off a step line so the ledger can number it itself. */
export function stepBody(line) {
  const m = strip(line).match(/^\s*\d+\.\s/);
  return m ? dropVisible(line, m[0].length) : line;
}

/** The painted string without its first `n` visible characters; the colour codes among them stay. */
function dropVisible(s, n) {
  let i = 0, seen = 0;
  while (i < s.length && seen < n) {
    if (s[i] === '\x1b') { const m = s.slice(i).match(/^\x1b\[[0-9;]*m/); if (m) { i += m[0].length; continue; } }
    i++; seen++;
  }
  return s.slice(i);
}
