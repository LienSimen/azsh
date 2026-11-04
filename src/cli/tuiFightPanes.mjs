// The bottom pane of a live fight: Tab cycles it between the combat log, a damage meter, the threat table
// and the loot taken so far. The log is the game's own log (tui.mjs); the meter is the engine's DPSMate
// aggregator fed every tick's events; threat reads the engine's ThreatManager through the session; loot is a
// session-long tally of what the "You receive" lines handed over. The choice sticks between fights.
import { bold, dim, cyan, yellow, green, red, inverse, fit, vis, cut, bar, pct, coinText } from './text.mjs';
import { createDpsMateMeter, partyMeterSnapshot } from '../domain/bots/dpsMate.ts';
import { runPaneLines, questPaneLines, bagsPaneLines } from './tuiAutopilot.mjs';
import { iconsOn, iconArt, iconBlank } from './iconArt.mjs';

export const FIGHT_PANES = [
  { id: 'log', label: 'Log' },
  { id: 'meter', label: 'Meter' },
  { id: 'threat', label: 'Threat' },
  { id: 'loot', label: 'Loot' },
  { id: 'run', label: 'Run' }, // the autopilot's ledger: only once a run exists
  { id: 'quests', label: 'Quests' }, // during a run: the quests it works on
  { id: 'bags', label: 'Bags' }, // during a run: the bags, with a cursor, so items can be used while it plays
];
const panesOf = (app) => FIGHT_PANES.filter((p) => (p.id === 'run' ? app.auto || app.lastRun : p.id === 'quests' || p.id === 'bags' ? !!app.auto : true));
// The meter's views, like a classic meter addon's modes. Each ranks the party by its own number.
const METER_VIEWS = [
  { id: 'damage', title: 'Damage done', value: (a) => a.damage },
  { id: 'dps', title: 'DPS', value: (a) => a.dps },
  { id: 'healing', title: 'Healing done', value: (a) => a.healing },
  { id: 'taken', title: 'Damage taken', value: (a) => a.damageTaken },
  { id: 'deaths', title: 'Deaths', value: (a) => a.deaths },
  { id: 'interrupts', title: 'Interrupts', value: (a) => a.interrupts },
  { id: 'dispels', title: 'Dispels', value: (a) => a.dispels },
];
const meterView = (app) => METER_VIEWS.find((v) => v.id === app.meterSort) ?? METER_VIEWS[0];

export const fightPane = (app) => app.fightPane ?? 'log';

/** The pane shows in a fight and on the autopilot's between-fight panel, so a run holds the chosen pane
 *  instead of dropping to the log after every kill. */
export const showsPanes = (app) => !app.stack.length && (app.auto ? !app.auto.browsing : !!app.fight);

/** What Tab moves to next ("meter", "threat", "loot", "log"), for the hint line. */
export function nextPaneId(app) {
  const panes = panesOf(app);
  const i = Math.max(0, panes.findIndex((p) => p.id === fightPane(app)));
  return panes[(i + 1) % panes.length].id;
}

/** Tab / Shift-Tab in a fight: the next or previous pane. */
export function cycleFightPane(app, dir = 1) {
  const panes = panesOf(app);
  const i = Math.max(0, panes.findIndex((p) => p.id === fightPane(app)));
  app.fightPane = panes[(i + dir + panes.length) % panes.length].id;
  app.render();
}

/** s on the meter pane: the next view (damage, DPS, healing, damage taken, deaths, interrupts, dispels). */
export function cycleMeterSort(app) {
  const i = METER_VIEWS.indexOf(meterView(app));
  app.meterSort = METER_VIEWS[(i + 1) % METER_VIEWS.length].id;
  app.render();
}

/** f on the meter pane: this fight, or every fight since you sat down. */
export function toggleMeterSegment(app) {
  app.meterSegment = app.meterSegment === 'run' ? 'fight' : 'run';
  app.render();
}

/** The one meter for the whole sitting: startFight calls beginFight on it, logEvents feeds it. */
export function ensureMeter(app) {
  app.meter ??= createDpsMateMeter();
  return app.meter;
}

/** Every "You receive" goes through here so the loot pane can add it up. `taken` rows are `{ item, count }`. */
export function noteLoot(app, taken = [], copper = 0) {
  const t = (app.lootTally ??= { rows: [], copper: 0 });
  for (const d of taken) {
    if (!d || d.item == null) continue;
    const i = t.rows.findIndex((r) => r.item === d.item);
    const row = i >= 0 ? t.rows.splice(i, 1)[0] : { item: d.item, count: 0 };
    row.count += d.count ?? 1;
    t.rows.unshift(row); // most recent first
  }
  t.copper += copper || 0;
}

/** The rule between the frames and the pane. In a fight it carries the pane tabs. */
export function fightPaneRule(app, L) {
  if (!showsPanes(app)) return dim('─'.repeat(L.W));
  const cur = fightPane(app);
  const tabs = panesOf(app).map((p) => (p.id === cur ? inverse(` ${p.label} `) : dim(` ${p.label} `))).join(dim('─'));
  const left = `${dim('──')}${tabs}`;
  const folded = cur === 'log' && app.fight?.folded?.() ? dim(`log folded at ${app.fight.speed}x, - unfolds it   `) : '';
  const right = `${folded}${dim('Tab: switch')}${dim('──')}`;
  const mid = Math.max(0, L.W - vis(left) - vis(right));
  return cut(`${left}${dim('─'.repeat(mid))}${right}`, L.W);
}

/** The pane's lines (exactly L.logH of them). */
export function fightPaneLines(app, L) {
  if (!showsPanes(app) || fightPane(app) === 'log') return app.logLines(L);
  const ctl = app.fight ?? app.lastFight; // between autopilot fights: the one just over
  const pane = fightPane(app);
  const lines = pane === 'run' ? runPaneLines(app, L) : pane === 'quests' ? questPaneLines(app, L) : pane === 'bags' ? bagsPaneLines(app, L)
    : pane === 'loot' ? lootLines(app, L) : !ctl ? [dim(' No fight yet.')] : pane === 'meter' ? meterLines(app, ctl, L) : threatLines(app, ctl, L);
  const out = lines.slice(0, L.logH).map((l) => fit(l, L.W));
  while (out.length < L.logH) out.push('');
  return out;
}

// ---- names ------------------------------------------------------------------------------------------

/** A combatant side ("player", "pet", "ally_0", "enemy_2", "totem_fire") as the name on screen. */
function sideName(app, ctl, side) {
  const s = ctl.session;
  if (side === 'player') return app.ch.name;
  const views = [s.petView(), ...s.alliesView(), ...s.enemiesView()].filter(Boolean);
  const v = views.find((x) => x.side === side);
  if (v) return v.name;
  const cp = s.companionPets?.().find((p) => p.side === side);
  if (cp) return cp.name;
  const tt = s.totemOwners?.().find((t) => t.side === side);
  if (tt) return tt.name;
  if (side === 'pet') return ctl.names.petName ?? 'Pet';
  return String(side);
}

/** Pets and totems fold into their owners on the meter, like a "merge pets" meter addon. */
function guardianOwners(ctl) {
  const s = ctl.session;
  const owners = {}, labels = {};
  const pet = s.petView();
  if (pet && pet.side !== 'player') { owners[pet.side] = 'player'; labels[pet.side] = pet.name; }
  for (const p of s.companionPets?.() ?? []) { owners[p.side] = p.ownerSide; labels[p.side] = p.name; }
  for (const t of s.totemOwners?.() ?? []) { owners[t.side] = t.ownerSide; labels[t.side] = t.name; }
  return { owners, labels };
}

const num = (n) => Math.round(n).toLocaleString('en-US');

// ---- meter -------------------------------------------------------------------------------------------

function meterLines(app, ctl, L) {
  const meter = ensureMeter(app);
  const view = meterView(app);
  const segment = app.meterSegment === 'run' ? 'run' : 'fight';
  const { owners, labels } = guardianOwners(ctl);
  const sortKind = ['damage', 'healing', 'dps'].includes(view.id) ? view.id : 'damage';
  const snap = partyMeterSnapshot(meter.snapshot(sortKind, segment), { owners, guardianLabels: labels });
  const secs = (snap.durationMs / 1000).toFixed(1);
  const totals = view.id === 'healing'
    ? `total ${num(snap.totalHealing)} heal${snap.totalOverhealing ? `, ${num(snap.totalOverhealing)} overheal` : ''}`
    : view.id === 'taken' ? `total ${num(snap.totalDamageTaken)} taken`
    : ['deaths', 'interrupts', 'dispels'].includes(view.id) ? `total ${num(snap.actors.reduce((t, a) => t + view.value(a), 0))}`
    : `total ${num(snap.totalDamage)} dmg${snap.totalHealing ? `, ${num(snap.totalHealing)} heal` : ''}`;
  const where = segment === 'run' ? 'this sitting' : 'this fight';
  const lines = [` ${bold(view.title)} ${dim(`${where} · ${secs}s · ${totals}`)}   ${dim(`s: next view  f: ${segment === 'run' ? 'this fight' : 'whole sitting'}`)}`];
  const actors = snap.actors.filter((a) => view.value(a) > 0).sort((a, b) => view.value(b) - view.value(a) || a.id.localeCompare(b.id));
  if (!actors.length) { lines.push(dim(view.id === 'deaths' ? ' Nobody has died.' : view.id === 'taken' ? ' Nobody has been hit yet.' : view.id === 'interrupts' ? ' No interrupts yet.' : view.id === 'dispels' ? ' No dispels yet.' : view.id === 'healing' ? ' No healing yet.' : ' Nothing landed yet.')); return lines; }
  const top = Math.max(...actors.map(view.value), 1);
  const sum = Math.max(1, actors.reduce((t, x) => t + view.value(x), 0));
  const nameW = Math.min(18, Math.max(8, Math.floor(L.W * 0.2)));
  const barW = L.W >= 80 ? 20 : L.W >= 60 ? 12 : 8;
  const wide = L.W >= 70;
  const perSec = (n) => (snap.durationMs > 0 ? (n / snap.durationMs) * 1000 : 0);
  for (const a of actors.slice(0, L.logH - 1)) {
    const me = a.id === 'player';
    const name = fit(sideName(app, ctl, a.id), nameW);
    const paint = view.id === 'taken' || view.id === 'deaths' ? red : me ? green : a.id.startsWith('ally') ? cyan : yellow;
    lines.push(` ${me ? bold(name) : name} ${bar(view.value(a), top, barW, paint)} ${meterCells(app, ctl, view.id, a, perSec, wide)} ${dim(fit(`${pct(view.value(a), sum)}%`, 4, true))}`);
  }
  if (actors.length > L.logH - 1) lines[lines.length - 1] = fit(lines[lines.length - 1], L.W - 10) + dim(`+${actors.length - (L.logH - 1)} more`);
  return lines;
}

/** The numbers after a meter row's bar: the view's own figure, then what goes with it. */
function meterCells(app, ctl, id, a, perSec, wide) {
  const amt = (n, rate) => `${fit(num(n), 8, true)} ${dim(fit(`${num(rate)} ${id === 'healing' ? 'hps' : id === 'taken' ? 'dtps' : 'dps'}`, 10, true))}`;
  if (id === 'damage') return amt(a.damage, a.dps) + (wide && a.healing > 0 ? `  ${dim(fit(`${num(a.healing)} heal`, 11, true))}` : '');
  if (id === 'dps') return `${fit(`${num(a.dps)} dps`, 10, true)} ${dim(fit(`${num(a.damage)} dmg`, 12, true))}`;
  if (id === 'healing') {
    const oh = a.healing + a.overhealing > 0 ? Math.round((a.overhealing / (a.healing + a.overhealing)) * 100) : 0;
    return amt(a.healing, a.hps) + (wide && a.overhealing > 0 ? `  ${dim(fit(`${oh}% over`, 9, true))}` : '');
  }
  if (id === 'taken') {
    const src = a.damageTakenBySource[0];
    const from = src ? sideName(app, ctl, src.id) : '';
    const bits = [a.absorbedTaken > 0 ? `${num(a.absorbedTaken)} absorbed` : '', wide && src && from !== src.id ? `most from ${from}` : ''].filter(Boolean);
    return amt(a.damageTaken, perSec(a.damageTaken)) + (bits.length ? `  ${dim(bits.join(' · '))}` : '');
  }
  return fit(num(a[id]), 4, true);
}

// ---- threat ------------------------------------------------------------------------------------------

function threatLines(app, ctl, L) {
  const s = ctl.session;
  const focus = s.enemyView();
  const enemies = s.enemiesView().filter((e) => e.hp > 0);
  enemies.sort((a, b) => (a === focus ? -1 : b === focus ? 1 : 0));
  if (!enemies.length) return [dim(' No enemies left.')];
  const tableOf = (e) => {
    const list = (s.enemyThreatList?.(e.side) ?? []).filter((x) => x.online !== false).sort((a, b) => b.threat - a.threat);
    return { list, victim: s.enemyThreatVictim?.(e.side) ?? null, top: list[0]?.threat ?? 0 };
  };
  const first = enemies[0], t = tableOf(first);
  const lines = [` ${bold(`Threat on ${first.name}`)}${enemies.length > 1 ? dim(`   ${enemies.length - 1} more below`) : ''}`];
  if (!t.list.length) lines.push(dim(' Nobody has threat yet.'));
  const nameW = Math.min(18, Math.max(8, Math.floor(L.W * 0.2)));
  const barW = L.W >= 80 ? 20 : L.W >= 60 ? 12 : 8;
  const rest = Math.max(1, L.logH - 1 - Math.min(enemies.length - 1, 3));
  for (const row of t.list.slice(0, rest)) {
    const aggro = row.id === t.victim;
    const p = t.top > 0 ? Math.round((row.threat / t.top) * 100) : 0;
    const name = fit(sideName(app, ctl, row.id), nameW);
    const paint = aggro ? red : row.id === 'player' ? green : cyan;
    lines.push(` ${row.id === 'player' ? bold(name) : name} ${bar(row.threat, Math.max(1, t.top), barW, paint)} ${fit(`${p}%`, 5, true)} ${dim(fit(num(row.threat), 8, true))}${aggro ? `  ${red(bold('aggro'))}` : row.tauntState && row.tauntState !== 'none' ? `  ${yellow(String(row.tauntState))}` : ''}`);
  }
  for (const e of enemies.slice(1, 4)) {
    const o = tableOf(e);
    const bits = o.list.slice(0, 4).map((r) => {
      const n = sideName(app, ctl, r.id), p = o.top > 0 ? Math.round((r.threat / o.top) * 100) : 0;
      return r.id === o.victim ? red(`${n} ${p}%`) : `${n} ${dim(`${p}%`)}`;
    });
    lines.push(` ${yellow(e.name)} ${dim('▶')} ${bits.length ? bits.join(dim(', ')) : dim('nobody yet')}`);
  }
  return lines;
}

// ---- loot --------------------------------------------------------------------------------------------

function lootLines(app, L) {
  const t = app.lootTally ?? { rows: [], copper: 0 };
  const n = t.rows.reduce((a, r) => a + r.count, 0);
  const lines = [` ${bold('Loot this sitting')} ${dim(`${n} item${n === 1 ? '' : 's'}${t.copper ? ` · ${coinText(t.copper)}` : ''}`)}`];
  if (!t.rows.length && !t.copper) { lines.push(dim(' Nothing looted yet. Whatever you take shows up here.')); return lines; }
  const colW = Math.max(24, Math.floor((L.W - 2) / Math.max(1, Math.min(3, Math.floor(L.W / 30)))));
  const cols = Math.max(1, Math.floor((L.W - 2) / colW));
  // With icons each cell is two lines: a 4px icon down its left, the name beside the top and the count and
  // kind beside the bottom.
  const icons = iconsOn() && L.W >= 40;
  const h = icons ? 2 : 1;
  const cells = t.rows.map((r) => {
    if (!icons) return [`${app.itemLabel(r.item)}${r.count > 1 ? dim(` x${r.count}`) : ''}`];
    const it = app.ds.item(r.item);
    const art = iconArt(it?.icon, 4) ?? iconBlank(4);
    return [`${art[0]} ${app.itemLabel(r.item)}`, `${art[1]} ${dim([r.count > 1 ? `x${r.count}` : '', it?.typeName].filter(Boolean).join(' · '))}`];
  });
  const rowsAvail = Math.floor((L.logH - 1) / h);
  for (let i = 0; i < rowsAvail; i++) {
    const slice = cells.slice(i * cols, i * cols + cols);
    if (!slice.length) break;
    for (let k = 0; k < h; k++) lines.push(` ${slice.map((c) => fit(c[k], colW - 1)).join(' ')}`);
  }
  const shown = Math.min(cells.length, rowsAvail * cols);
  if (shown < cells.length) lines[lines.length - 1] = fit(lines[lines.length - 1], L.W - 10) + dim(`+${cells.length - shown} more`);
  return lines;
}
