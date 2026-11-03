// The bulk bag verbs from phonecraft's bag bar (panels/bagBulkPanel.ts, app/appInteractBulkBags.ts): break
// down a quality band, read every recipe, formula and book in the bags onto whoever can take it, and destroy
// several stacks at once (the trash skull's multi-select, and the leftover-quest-items sweep). All list first;
// Enter switches a row off or on, G runs what is on. Rows a quest still needs or that are still an upgrade
// start off. p switches between your bags and the whole party's. The runs go through the same engine verbs a
// single press uses, so a bulk pass never accepts what one-at-a-time would refuse.
import { bold, dim, yellow, green, red, qualityPaint, plural, itemText } from './text.mjs';
import { planBulkDisenchant, resolveRosterEnchanters, activeBulkDisenchantRows, bulkDisenchantRowKey } from '../domain/professions/partyDisenchant.ts';
import { companionsForUpgradeGuard, partyUpgradeEntries, playerEquipOptsFrom } from '../domain/professions/autoDisenchant.ts';
import { planLearnAllFromBags, activeLearnAllRows } from '../domain/professions/learnAllRecipes.ts';
import { questNeededItems, leftoverQuestItems } from '../domain/quests/questlog.ts';
import { itemTeachIntent } from '../domain/items/itemTeaches.ts';
import { learnOnCompanionPool } from '../domain/spells/learnOnTargets.ts';

const BANDS = [[2, 'Greens'], [3, 'Blues'], [4, 'Epics']];
const H = (text) => ({ text, header: true });

/** Whose bags a bulk verb walks: yours, or every companion's (squad and bench, once each). */
function bagsInScope(g, scope) {
  if (scope !== 'party') return [{ inventory: g.state.inventory }];
  const byId = new Map();
  for (const c of g.state.squad ?? []) byId.set(c.id, c);
  for (const c of Object.values(g.state.botRoster ?? {})) byId.set(c.id, c);
  return [...byId.values()].map((c) => ({ inventory: c.bags ?? { stacks: [] }, owner: { id: c.id, name: c.name } }));
}

/** All three bands planned once on open: the roster reads are the expensive half. */
function planBands(app, scope) {
  const { ds } = app, st = app.g.state;
  const enchanters = resolveRosterEnchanters(st.char, st.squad, st.botRoster, st.raidRoster?.members, ds);
  const companions = companionsForUpgradeGuard(st.squad, st.botRoster, st.raidRoster?.members);
  const equipOpts = playerEquipOptsFrom(st.char, st.spellbook, ds);
  const questProtected = questNeededItems(st.questlog, (e) => ds.quest(e));
  const scoped = bagsInScope(app.g, scope).map((b) => ({ ...b, upgradeEntries: partyUpgradeEntries(st.char, b.inventory, equipOpts, companions, ds) }));
  const band = (quality) => scoped.flatMap(({ inventory, owner, upgradeEntries }) => planBulkDisenchant({ inventory, quality, enchanters, ds, questProtected, upgradeEntries, ...(owner ? { owner } : {}) }));
  return { 2: band(2), 3: band(3), 4: band(4) };
}

export function bulkDisenchantDialog(app, quality = 2, scope = 'player') {
  const state = { quality, scope, bands: null, off: new Set() };
  const replan = (a) => {
    state.bands = planBands(a, state.scope);
    state.off = new Set(Object.values(state.bands).flat().filter((r) => r.warn).map(bulkDisenchantRowKey));
  };
  replan(app);
  const nextBand = (a) => { const i = BANDS.findIndex(([q]) => q === state.quality); state.quality = BANDS[(i + 1) % BANDS.length][0]; a.top().cursor = 0; };
  return {
    id: 'bulk-de', title: 'Disenchant all', hint: 'Enter: on / off',
    keys: {
      G: { hint: 'disenchant', fn: (a) => runBulkDisenchant(a, state) },
      tab: { hint: 'band', fn: nextBand },
      p: { hint: 'yours / party', fn: (a) => { state.scope = state.scope === 'party' ? 'player' : 'party'; replan(a); } },
    },
    rows(a) {
      const rows = state.bands[state.quality] ?? [];
      const on = activeBulkDisenchantRows(rows, state.off);
      const bands = BANDS.map(([q, label]) => (q === state.quality ? bold(`[${label} ${state.bands[q].length}]`) : dim(`${label} ${state.bands[q].length}`))).join('  ');
      const out = [H(`${bands}   ${dim(state.scope === 'party' ? 'the party\'s bags' : 'your bags')}`), H(dim(`${plural(on.reduce((n, r) => n + r.qty, 0), 'item')} will break down. G: go`)), H('')];
      if (!rows.length) out.push(H(dim('  Nothing in this band anyone in the group can disenchant.')));
      for (const r of rows) {
        const key = bulkDisenchantRowKey(r);
        const it = a.ds.item(r.entry);
        const isOn = !state.off.has(key);
        out.push({
          text: `${isOn ? green('✓') : dim('·')} ${qualityPaint(it?.quality)(it?.name ?? r.entry)}${r.qty > 1 ? ` x${r.qty}` : ''}  ${dim(`ilvl ${r.itemLevel}`)}${r.ownerName ? dim(`  ${r.ownerName}'s bags`) : ''}${r.warn ? yellow(`  ${r.warn}`) : ''}`,
          detail: () => [bold(itemText(it, '')), dim(`Item level ${r.itemLevel}`), '', `Breaks down by ${r.who.name} ${dim(`(Enchanting ${r.who.skill})`)}`, ...(r.warn ? ['', yellow(`${r.warn}: starts switched off.`)] : []), '', dim('Enter: switch on / off')],
          act: () => { if (isOn) state.off.add(key); else state.off.delete(key); },
        });
      }
      return out;
    },
  };
}

function runBulkDisenchant(app, state) {
  const g = app.g;
  const rows = activeBulkDisenchantRows(state.bands[state.quality] ?? [], state.off);
  if (!rows.length) { app.flashMsg('Nothing switched on.'); return; }
  let done = 0, firstRefusal = '';
  const mats = new Map();
  // Highest slot first per owner: a broken-down stack splices out of the bags and must not shift one still to come.
  const ordered = [...rows].sort((a, b) => (a.owner ?? '').localeCompare(b.owner ?? '') || b.slot - a.slot);
  for (const row of ordered) {
    const bags = row.owner ? bagsInScope(g, 'party').find((b) => b.owner.id === row.owner)?.inventory : g.state.inventory;
    const stk = bags?.stacks[row.slot];
    if (!stk || stk.item !== row.entry) continue;
    const worker = row.who.id ? { workerId: row.who.id } : undefined;
    for (let i = 0; i < row.qty; i++) {
      const res = row.owner ? g.disenchantCompanionBagStack(row.owner, row.slot, worker) : g.disenchantStack(row.slot, worker);
      if (!res.ok) { firstRefusal ||= res.reason ?? 'Cannot disenchant'; break; }
      done++;
      for (const y of res.yielded) mats.set(y.item, (mats.get(y.item) ?? 0) + y.count);
    }
  }
  if (!done) { app.say(red(firstRefusal || 'Nothing was disenchanted.')); return; }
  app.say(green(`You disenchant ${plural(done, 'item')}.`) + (firstRefusal ? yellow(`  Stopped on one: ${firstRefusal}.`) : ''));
  for (const [item, n] of mats) app.say(`  ${yellow('You create')} ${app.itemLabel(item)}${n > 1 ? ` x${n}` : ''}`);
  state.bands = planBands(app, state.scope);
}

export function learnAllDialog(app, scope = 'player') {
  const state = { scope, rows: [], skipped: [], off: new Set() };
  const replan = (a) => {
    const st = a.g.state;
    const companions = learnOnCompanionPool(st.squad, st.botRoster, st.raidRoster?.members);
    const seen = new Set();
    state.rows = []; state.skipped = [];
    for (const { inventory, owner } of bagsInScope(a.g, state.scope)) {
      const plan = planLearnAllFromBags({ inventory, ds: a.ds, char: st.char, companions, spellbook: st.spellbook, ...(owner ? { owner } : {}) });
      for (const r of plan.rows) if (!seen.has(r.entry)) { seen.add(r.entry); state.rows.push(r); }
      for (const sk of plan.skipped) if (!state.skipped.some((x) => x.entry === sk.entry)) state.skipped.push(sk);
    }
  };
  replan(app);
  return {
    id: 'learn-all', title: 'Learn all', hint: 'Enter: on / off',
    keys: {
      G: { hint: 'learn', fn: (a) => { runLearnAll(a, state); replan(a); } },
      p: { hint: 'yours / party', fn: (a) => { state.scope = state.scope === 'party' ? 'player' : 'party'; replan(a); } },
    },
    rows(a) {
      const on = activeLearnAllRows(state.rows, state.off);
      const out = [H(`${bold('Learn all')}   ${dim(state.scope === 'party' ? 'books in the party\'s bags' : 'books in your bags')}`), H(dim(`${plural(on.length, 'book')} will be read. G: go`)), H('')];
      if (!state.rows.length) out.push(H(dim('  Nothing in the bags anyone can learn from.')));
      for (const r of state.rows) {
        const isOn = !state.off.has(r.entry);
        out.push({
          text: `${isOn ? green('✓') : dim('·')} ${r.itemName}  ${dim('→')} ${r.whoName}${r.ownerName ? dim(`  from ${r.ownerName}`) : ''}${r.spare ? dim(`  ${r.spare} spare`) : ''}`,
          detail: () => [bold(r.itemName), `Teaches ${r.teachName}`, `Read by ${r.whoName}${r.skillLabel ? dim(`  (${r.skillLabel})`) : ''}`, ...(r.spare ? ['', dim(`${r.spare} more cop${r.spare === 1 ? 'y' : 'ies'} left to sell`)] : []), '', dim('Enter: switch on / off')],
          act: () => { if (isOn) state.off.add(r.entry); else state.off.delete(r.entry); },
        });
      }
      if (state.skipped.length) {
        out.push(H(''), H(dim('Nobody can read these')));
        for (const sk of state.skipped) out.push(H(`  ${sk.itemName}${sk.qty > 1 ? ` x${sk.qty}` : ''}  ${dim(sk.reason)}`));
      }
      return out;
    },
  };
}

function runLearnAll(app, state) {
  const g = app.g;
  const rows = activeLearnAllRows(state.rows, state.off);
  if (!rows.length) { app.flashMsg('Nothing switched on.'); return; }
  let learned = 0, firstRefusal = '';
  for (const row of rows) {
    // The learn methods read from your bags, so a companion's copy comes across first.
    if (row.owner) {
      const took = g.takeItemFromBot(row.owner, row.entry, 1);
      if (!took.ok) { firstRefusal ||= took.reason ?? 'Cannot take that'; continue; }
    }
    const teach = itemTeachIntent(app.ds.item(row.entry), app.ds);
    const res = row.who === 'self'
      ? (teach?.kind === 'enchant' ? g.learnEnchantFromItem(row.entry) : teach?.kind === 'spell' ? g.learnSpellFromItem(row.entry) : teach?.kind === 'petSpell' ? g.trainPet(row.entry) : g.learnRecipeFromItem(row.entry))
      : (teach?.kind === 'enchant' ? g.learnEnchantFromItemOnCompanion(row.who, row.entry) : teach?.kind === 'spell' ? g.learnSpellFromItemOnCompanion(row.who, row.entry) : teach?.kind === 'petSpell' ? g.learnPetSpellFromItemOnCompanion(row.who, row.entry) : g.learnRecipeFromItemOnCompanion(row.who, row.entry));
    if (res.ok) { learned++; app.say(`  ${green(row.whoName === app.ch.name || row.who === 'self' ? 'You learn' : `${row.whoName} learns`)} ${row.teachName}`); }
    else firstRefusal ||= res.reason ?? 'Cannot learn';
  }
  if (!learned) { app.say(red(firstRefusal || 'Nothing could be learned.')); return; }
  const spare = rows.reduce((n, r) => n + r.spare, 0);
  app.say(green(`Learned ${plural(learned, 'book')}.`) + (spare ? dim(`  ${spare} duplicate${spare === 1 ? '' : 's'} left to sell.`) : '') + (firstRefusal ? yellow(`  One refused: ${firstRefusal}.`) : ''));
}

const DESTROY_TABS = [['all', 'Everything'], ['quest', 'Leftover quest items']];

/** Every stack in scope with its owner, plus the quests a leftover one belonged to (turned in, not repeatable,
 * not wanted by an open quest: phonecraft's leftoverQuestItems). */
function destroyCandidates(app, scope) {
  const st = app.g.state, out = [];
  for (const { inventory, owner } of bagsInScope(app.g, scope)) {
    const left = new Map(leftoverQuestItems(st.questlog, inventory, (e) => app.ds.quest(e), (e) => app.ds.item(e), app.ds.quests()).map((r) => [r.slot, r.quests]));
    inventory.stacks.forEach((stack, slot) => { if (stack) out.push({ stack, owner, quests: left.get(slot) ?? null }); });
  }
  return out;
}

/** Destroy several stacks at once: the trash skull's multi-select from phonecraft's bags (bagsPanel.ts
 * destroySelectMode) and its leftover-quest-items sweep in one list. Marks are the stack objects themselves,
 * so a slot shifting under a destroy never lands on the wrong item. */
export function destroyManyDialog(app, tab = 'all', scope = 'player') {
  const state = { tab, scope, marked: new Set() };
  const shown = (a) => destroyCandidates(a, state.scope).filter((c) => state.tab === 'all' || c.quests);
  const markLeftovers = (a) => { for (const c of destroyCandidates(a, state.scope)) if (c.quests) state.marked.add(c.stack); };
  if (tab === 'quest') markLeftovers(app);
  return {
    id: 'destroy-many', title: 'Destroy', hint: 'Enter: mark / unmark',
    keys: {
      G: { hint: 'destroy', fn: (a) => confirmDestroyMany(a, state) },
      tab: { hint: 'everything / quest leftovers', fn: (a) => { state.tab = state.tab === 'all' ? 'quest' : 'all'; a.top().cursor = 0; } },
      a: { hint: 'mark all shown', fn: (a) => { for (const c of shown(a)) state.marked.add(c.stack); } },
      c: { hint: 'clear', fn: () => state.marked.clear() },
      p: { hint: 'yours / party', fn: (a) => { state.scope = state.scope === 'party' ? 'player' : 'party'; state.marked.clear(); if (state.tab === 'quest') markLeftovers(a); } },
    },
    rows(a) {
      const all = destroyCandidates(a, state.scope);
      const rows = state.tab === 'all' ? all : all.filter((c) => c.quests);
      const on = all.filter((c) => state.marked.has(c.stack));
      const tabs = DESTROY_TABS.map(([t, label]) => (t === state.tab ? bold(`[${label}]`) : dim(label))).join('  ');
      const out = [H(`${tabs}   ${dim(state.scope === 'party' ? 'the party\'s bags' : 'your bags')}`), H(on.length ? red(`${plural(on.length, 'stack')} (${plural(on.reduce((n, c) => n + c.stack.count, 0), 'item')}) marked. G: destroy`) : dim('Nothing marked. Enter marks a stack, a marks every one shown.')), H('')];
      if (!rows.length) out.push(H(dim(state.tab === 'quest' ? '  No quest items left over from quests you have turned in.' : '  The bags are empty.')));
      for (const c of rows) {
        const it = a.ds.item(c.stack.item);
        const isOn = state.marked.has(c.stack);
        const from = c.quests ? c.quests.map((q) => q.title).join(', ') : '';
        out.push({
          text: `${isOn ? red('✗') : dim('·')} ${qualityPaint(it?.quality)(it?.name ?? c.stack.item)}${c.stack.count > 1 ? ` x${c.stack.count}` : ''}${c.owner ? dim(`  ${c.owner.name}'s bags`) : ''}${from ? dim(`  ${from}`) : ''}`,
          detail: () => [bold(itemText(it, '')), ...(from ? ['', dim(`Left over from ${from}.`)] : []), '', dim(isOn ? 'Enter: keep it' : 'Enter: mark it to destroy')],
          act: () => { if (isOn) state.marked.delete(c.stack); else state.marked.add(c.stack); },
        });
      }
      return out;
    },
  };
}

function confirmDestroyMany(app, state) {
  // Slots resolved now, before anything splices: highest first per owner, as phonecraft's doDiscardSelected.
  const targets = [];
  for (const { inventory, owner } of bagsInScope(app.g, state.scope)) {
    inventory.stacks.forEach((s, slot) => { if (state.marked.has(s)) targets.push({ owner: owner?.id, slot, item: s.item, count: s.count }); });
  }
  if (!targets.length) { app.flashMsg('Nothing marked.'); return; }
  const pieces = targets.reduce((n, t) => n + t.count, 0);
  const what = targets.length === 1 ? `${app.itemLabel(targets[0].item)}${pieces > 1 ? ` x${pieces}` : ''}` : `${plural(targets.length, 'stack')} (${plural(pieces, 'item')})`;
  app.confirm(`Destroy ${what}? This cannot be undone.`, () => {
    const g = app.g;
    let stacks = 0, gone = 0, firstRefusal = '';
    targets.sort((a, b) => (a.owner ?? '').localeCompare(b.owner ?? '') || b.slot - a.slot);
    for (const t of targets) {
      const bags = t.owner ? bagsInScope(g, 'party').find((b) => b.owner.id === t.owner)?.inventory : g.state.inventory;
      if (bags?.stacks[t.slot]?.item !== t.item) continue;
      const r = t.owner ? g.discardCompanionBagStack(t.owner, t.slot) : g.discardBagStack(t.slot);
      if (!r.ok) { firstRefusal ||= r.reason ?? 'Cannot destroy'; continue; }
      stacks++; gone += r.discarded;
    }
    state.marked.clear();
    if (!stacks) { app.say(red(firstRefusal || 'Nothing was destroyed.')); return; }
    app.say(green(stacks === 1 ? `Destroyed ${what}.` : `Destroyed ${plural(stacks, 'stack')} (${plural(gone, 'item')}).`) + (firstRefusal ? yellow(`  One refused: ${firstRefusal}.`) : ''));
  });
}
