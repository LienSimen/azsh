// Action bars: the player's own (spells, bag items, macros, keybinds), a companion's kit bars (spells from their
// kit, items from their bags), and the global bar (items and outfits fired outside a fight). One editor over an
// owner, like phonecraft hudActionBarPaint.ts and companionKitPanel.ts share actionBarModel.ts.
import { bold, dim, cyan, green, yellow, red, fit } from './text.mjs';
import { spellLines, itemLines } from './tuiViews.mjs';
import { knownUsableSpells } from '../domain/character/characterSpells.ts';
import { companionLevel, companionCharacter, companionSpellbook } from '../domain/bots/squad.ts';
import { SLOTS_PER_BAR, MAX_BARS } from '../domain/character/actionbar.ts';

const H = (text) => ({ text, header: true });

/** What sits in a slot: a macro, an item or a spell, in the order the bar fires them. */
export function slotContent(bar, i) {
  if (bar.macros?.[i]) return { kind: 'macro', id: bar.macros[i] };
  if (bar.items?.[i] != null) return { kind: 'item', entry: bar.items[i] };
  if (bar.slots?.[i] != null) return { kind: 'spell', id: bar.slots[i] };
  return null;
}

export function playerBarsOwner(app) {
  const g = app.g;
  return {
    title: 'Your action bars', player: true,
    bars: () => g.state.actionBars ?? [],
    spells: () => knownUsableSpells(app.ch, g.state.spellbook, app.ds).filter((s) => !s.passive),
    items: () => g.state.inventory.stacks,
    macros: () => g.macros?.() ?? [],
    setSpell: (b, i, id) => g.setActionSlot(b, i, id),
    setItem: (b, i, e) => g.setItemActionSlot(b, i, e),
    setMacro: (b, i, m) => g.setMacroActionSlot(b, i, m),
    setKey: (b, i, k) => g.setActionKey(b, i, k),
    add: () => g.addActionBar(), remove: () => g.removeActionBar(),
  };
}

export function companionBarsOwner(app, comp) {
  const g = app.g, lvl = companionLevel(comp, app.ch.level);
  return {
    title: `${comp.name}'s action bars`,
    bars: () => g.companionActionBars(comp.id) ?? [],
    spells: () => knownUsableSpells(companionCharacter(comp, lvl, app.ds), companionSpellbook(comp, lvl, app.ds), app.ds).filter((s) => !s.passive),
    items: () => comp.bags?.stacks ?? [],
    setSpell: (b, i, id) => g.setCompanionActionSlot(comp.id, b, i, id),
    setItem: (b, i, e) => g.setCompanionItemActionSlot(comp.id, b, i, e),
    add: () => g.addCompanionActionBar(comp.id), remove: () => g.removeCompanionActionBar(comp.id),
    reset: () => g.resetCompanionActionBars(comp.id),
  };
}

function slotLabel(app, owner, c) {
  if (!c) return dim('empty');
  if (c.kind === 'spell') { const sp = app.ds.spell(c.id); return `${sp?.name ?? c.id}${sp?.rank ? dim(` (Rank ${sp.rank})`) : ''}`; }
  if (c.kind === 'item') return `${yellow(app.itemName(c.entry))}${owner.items ? dim(`  x${owner.items().filter((s) => s.item === c.entry).reduce((n, s) => n + s.count, 0)}`) : ''}`;
  return cyan(`macro ${owner.macros?.().find((m) => m.id === c.id)?.name ?? c.id}`);
}

/** Pick what goes in one slot: a spell, an item, a macro, or nothing. */
function fillSlot(app, owner, b, i) {
  const ok = (r) => r == null || r.ok !== false || (app.say(red(r.reason ?? 'That does not go there.')), false);
  const opts = [
    ...owner.spells().sort((x, y) => x.name.localeCompare(y.name)).map((sp) => ({ label: `${sp.name}${sp.rank ? dim(` (Rank ${sp.rank})`) : ''}`, detail: () => spellLines(app, sp), value: () => ok(owner.setSpell(b, i, sp.id)) })),
    ...[...new Set(owner.items().map((s) => s.item))].map((e) => app.ds.item(e)).filter((it) => it && (it.useInCombat || it.consumable || it.useSpell)).map((it) => ({ label: yellow(it.name), detail: () => itemLines(app, it), value: () => ok(owner.setItem(b, i, it.entry)) })),
    ...(owner.macros?.() ?? []).map((m) => ({ label: cyan(`Macro: ${m.name}`), value: () => ok(owner.setMacro(b, i, m.id)) })),
    { label: dim('Clear the slot'), value: () => { owner.setSpell(b, i, null); owner.setItem(b, i, null); owner.setMacro?.(b, i, null); } },
  ];
  app.pick(`Bar ${b + 1}, slot ${i + 1}`, opts, (fn) => fn());
}

export function barsDialog(app, ownerFn) {
  return {
    id: 'bars', title: 'Action bars', hint: 'Enter: fill the slot',
    keys: {
      '+': { hint: 'add a bar', fn: (a) => a.result(ownerFn(a).add()) },
      '-': { hint: 'remove the last bar', fn: (a) => a.result(ownerFn(a).remove()) },
      k: { hint: 'keybind', fn: (a, row) => { const o = ownerFn(a); if (!o.setKey || row?.data == null) return; a.prompt('Key (1-9, 0, -, =, q, shift+2 …; empty clears): ', (t) => { o.setKey(row.data.b, row.data.i, t.trim().toLowerCase() || null); a.afterAction(); }); } },
      x: { hint: 'clear', fn: (a, row) => { const o = ownerFn(a); if (row?.data == null) return; o.setSpell(row.data.b, row.data.i, null); o.setItem(row.data.b, row.data.i, null); o.setMacro?.(row.data.b, row.data.i, null); } },
      R: { hint: 'reset', fn: (a) => { const o = ownerFn(a); if (o.reset) a.confirm('Reset the bars to their kit?', () => a.result(o.reset(), 'Bars reset.')); } },
    },
    rows(a) {
      const o = ownerFn(a);
      const bars = o.bars();
      const rows = [H(`${bold(o.title)}   ${dim(`${bars.length} of ${MAX_BARS} bars`)}`)];
      if (o.player) rows.push(H(dim('Bar 1 is the number row in a fight. Keys you bind here fire there.')));
      bars.forEach((bar, b) => {
        rows.push(H(''), H(`Bar ${b + 1}`));
        for (let i = 0; i < SLOTS_PER_BAR; i++) {
          const c = slotContent(bar, i);
          rows.push({
            text: `${fit(dim(bar.keys?.[i] ?? ''), 8)} ${slotLabel(a, o, c)}`, data: { b, i },
            detail: () => [bold(`Bar ${b + 1}, slot ${i + 1}`), bar.keys?.[i] ? `Key: ${bar.keys[i]}` : dim('No key'), '', ...(c?.kind === 'spell' ? spellLines(a, a.ds.spell(c.id)) : c?.kind === 'item' ? itemLines(a, a.ds.item(c.entry)) : []), '', dim(`Enter: fill   x: clear${o.setKey ? '   k: keybind' : ''}`)],
            act: () => fillSlot(a, o, b, i),
          });
        }
      });
      if (o.player) rows.push(...globalBarRows(a));
      return rows;
    },
  };
}

/** The global bar: bag items and outfits, fired out of combat one slot or all at once. */
function globalBarRows(app) {
  const g = app.g, bar = g.state.globalActionBar;
  const rows = [H(''), H(`Global bar ${dim('items and outfits, fired outside a fight')}`)];
  rows.push({ text: green('Fire the whole global bar'), act: () => { const r = g.fireGlobalActionBar(); app.say(dim(`${r.tried} slot(s) fired.`)); } });
  for (let i = 0; i < SLOTS_PER_BAR; i++) {
    const item = bar?.items?.[i], outfit = bar?.outfits?.[i];
    rows.push({
      text: `  ${fit(dim(String(i + 1)), 4)} ${outfit ? cyan(`outfit ${outfit}`) : item != null ? yellow(app.itemName(item)) : dim('empty')}`,
      act: () => {
        const opts = [
          ...(item != null || outfit ? [{ label: green('Fire it now'), value: () => { const r = g.fireGlobalActionSlot(i); app.say(dim(`${r.tried} fired.`)); } }] : []),
          ...[...new Set(g.state.inventory.stacks.map((s) => s.item))].map((e) => app.ds.item(e)).filter((it) => it?.consumable || it?.useSpell || it?.useInCombat).map((it) => ({ label: yellow(it.name), value: () => g.setGlobalItemSlot(i, it.entry) })),
          ...(g.outfitterState?.()?.outfits ?? []).map((o) => ({ label: cyan(`Outfit: ${o.name}`), value: () => g.setGlobalOutfitSlot(i, o.name) })),
          { label: dim('Clear'), value: () => g.clearGlobalActionSlot(i) },
        ];
        app.pick(`Global slot ${i + 1}`, opts, (fn) => fn());
      },
    });
  }
  return rows;
}
