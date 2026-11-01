// Macros (phonecraft's MacroFrame): your own and account-wide macros, a line-by-line editor, the template list,
// and a run out of combat through the world host. In a fight a macro on bar 1 fires through the combat host
// (tuiFight.mjs), so both go through the same planner (domain/macro) and the same calls a key press makes.
import { bold, dim, yellow, green, red, cyan } from './text.mjs';
import { createWorldMacroHost } from './macroHostWorld.ts';
import { castWithPicker, useItemWithPicker } from './tuiEnchantTarget.mjs';
import { filterMacroTemplates, macroTemplateNest, macroTemplateCompat, uniqueMacroName, MACROS_PER_SCOPE, macroScopeOf, parseMacroBody, describeMacroLineText } from '../domain/macro/index.ts';

const H = (text) => ({ text, header: true });
const SCOPE_LABEL = { character: 'This character', account: 'Every character' };

/** The world host for this game: casts, uses and equips through the same facade calls the screens use. */
export function worldMacroHost(app) {
  app.macroWorldHost ??= new WeakMap();
  let host = app.macroWorldHost.get(app.g);
  if (host) return host;
  host = createWorldMacroHost({
    game: app.g, ds: app.ds, now: () => Date.now(),
    mods: () => ({ shift: false, ctrl: false, alt: false }),
    // A weapon imbue or an armor kit may open the slot picker; the step counts as taken while it is open.
    castSpell: (id) => castWithPicker(app, id) !== false,
    useItem: (entry) => useItemWithPicker(app, entry, () => green(`You use ${app.itemLabel(entry)}.`)) !== false,
    equipItem: (entry, offhand) => app.result(app.g.equip(entry, offhand ? 'offhand' : undefined), `You equip ${app.itemLabel(entry)}.`),
    notify: (m) => app.say(yellow(m)),
  });
  app.macroWorldHost.set(app.g, host);
  return host;
}

export function runMacro(app, def) {
  app.say(cyan(`> ${def.name}`));
  if (!worldMacroHost(app).press(def)) app.flashMsg(`${def.name} did nothing.`);
}

/** What pressing it now would do, line by line, for the detail pane. */
function planLines(app, def) {
  const plan = worldMacroHost(app).plan(def);
  const out = [];
  for (const st of plan.steps) {
    if (st.kind === 'cast') out.push(green(`casts ${app.ds.spell(st.spellId)?.name ?? st.spellId}`));
    else if (st.kind === 'use') out.push(green(`uses ${app.itemLabel(st.entry)}`));
    else if (st.kind === 'equip') out.push(green(`equips ${app.itemLabel(st.entry)}${st.offhand ? ' in the off hand' : ''}`));
    else out.push(dim(`/${st.kind}${st.name ? ` ${st.name}` : ''}`));
  }
  for (const r of plan.refusals) out.push(red(r));
  return out.length ? out : [dim('nothing right now')];
}

function save(app, scope, def, changes) {
  const r = app.g.saveMacro(scope, { id: def?.id, name: def?.name ?? 'Macro', icon: def?.icon, body: def?.body ?? '', ...changes });
  app.result(r);
  return r.ok ? r.id : null;
}

export function macrosDialog(app) {
  const withMacro = (fn) => (a, row) => { if (row?.data?.macro) fn(a, row.data.macro); };
  return {
    id: 'macros', title: 'Macros', hint: 'Enter: edit',
    keys: {
      r: { hint: 'run', fn: withMacro((a, m) => runMacro(a, m)) },
      T: { hint: 'templates', fn: (a) => pickTemplate(a, 'character') },
      x: { hint: 'delete', fn: withMacro((a, m) => a.confirm(`Delete the macro ${m.name}? It comes off every bar.`, () => a.result(a.g.deleteMacro(m.id), `${m.name} deleted.`))) },
    },
    rows(a) {
      const rows = [];
      for (const scope of ['character', 'account']) {
        const list = a.g.macros(scope);
        rows.push(H(''), H(`${SCOPE_LABEL[scope]}  ${dim(`${list.length}/${MACROS_PER_SCOPE}`)}`));
        for (const m of list) {
          const first = m.body.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
          rows.push({
            text: `${bold(m.name)}  ${dim(first)}`, data: { macro: m },
            detail: () => [bold(m.name), dim(SCOPE_LABEL[macroScopeOf(m.id)] ?? ''), '', ...m.body.split('\n').map((l) => cyan(l)), '', bold('Pressed now'), ...planLines(a, m), '', dim('Enter: edit   r: run   x: delete')],
            act: (a2) => a2.push(macroEditor(a2, m.id)),
          });
        }
        rows.push({ text: green(`+ New ${scope === 'account' ? 'account ' : ''}macro`), act: (a2) => a2.prompt('Name: ', (name) => { const id = save(a2, scope, null, { name, body: '' }); if (id) a2.push(macroEditor(a2, id)); else a2.afterAction(); }) });
      }
      rows.shift();
      rows.push(H(''), { text: `Templates  ${dim('ready-made macros for your class (T)')}`, act: (a2) => pickTemplate(a2, 'character') });
      rows.push(H(''), H(dim('Put a macro on bar 1 (Spells tab, b) and its key fires it in a fight.')));
      return rows;
    },
  };
}

function pickTemplate(app, scope) {
  const list = [...filterMacroTemplates({ scope: 'class', cls: app.ch.cls, tag: null }), ...filterMacroTemplates({ scope: 'general', cls: app.ch.cls, tag: null })];
  if (!list.length) { app.flashMsg('No templates for your class.'); return; }
  app.pick('Templates', list.map((t) => ({
    label: `${t.name}${macroTemplateCompat(t.body).kind === 'manual' ? dim('  manual only') : ''}`,
    detail: () => [bold(t.name), t.description, '', ...t.body.split('\n').map((l) => cyan(l))],
    value: t,
  })), (t) => {
    const taken = app.g.macros().map((m) => m.name);
    // A template that calls another ({Name}) brings that one along first so the call resolves.
    for (const helper of macroTemplateNest(t)) {
      if (taken.some((n) => n.toLowerCase() === helper.name.toLowerCase())) continue;
      if (!save(app, scope, null, { name: helper.name, icon: helper.icon, body: helper.body })) return;
      taken.push(helper.name);
    }
    const id = save(app, scope, null, { name: uniqueMacroName(t.name, taken), icon: t.icon, body: t.body });
    if (id) { app.say(green(`Added ${t.name}.`)); app.push(macroEditor(app, id)); }
  });
}

/** One macro, a line per row: Enter edits a line, o adds one under it, x deletes it, n renames. */
export function macroEditor(app, id) {
  const def = () => app.g.macroById(id);
  const scope = macroScopeOf(id) ?? 'character';
  const setLines = (a, lines) => save(a, scope, def(), { body: lines.join('\n') });
  const lines = () => (def()?.body ?? '').split('\n');
  const addAfter = (a, at) => a.prompt('New line: ', (text) => { const ls = lines().filter((l, i) => l !== '' || i < lines().length - 1); ls.splice(at + 1, 0, text); setLines(a, ls); a.afterAction(); });
  return {
    id: 'macro-edit', title: 'Edit macro', hint: 'Enter: edit the line',
    keys: {
      o: { hint: 'add a line', fn: (a, row) => addAfter(a, row?.data?.line ?? lines().length - 1) },
      x: { hint: 'delete the line', fn: (a, row) => { if (row?.data?.line == null) return; const ls = lines(); ls.splice(row.data.line, 1); setLines(a, ls); } },
      n: { hint: 'rename', fn: (a) => a.prompt('Name: ', (name) => { save(a, scope, def(), { name }); a.afterAction(); }, def()?.name ?? '') },
      r: { hint: 'run', fn: (a) => { if (def()) runMacro(a, def()); } },
    },
    rows(a) {
      const m = def();
      if (!m) return [H(dim('That macro is gone.'))];
      const rows = [H(`${bold(m.name)}   ${dim(SCOPE_LABEL[scope])}`), H('')];
      const ls = m.body ? m.body.split('\n') : [];
      const parsed = parseMacroBody(m.body ?? '');
      ls.forEach((l, i) => {
        const pl = parsed.lines.find((x) => x.n === i + 1);
        const issue = parsed.issues.find((x) => x.line === i + 1);
        rows.push({
          text: `${dim(String(i + 1).padStart(2))} ${cyan(l || ' ')}${issue ? red('  ✗') : ''}`, data: { line: i },
          detail: () => [bold(`Line ${i + 1}`), l, '', ...(pl ? [describeMacroLineText(pl)] : []), ...(issue ? [red(issue.message)] : []), '', dim('Enter: edit   o: add a line under it   x: delete')],
          act: (a2) => a2.prompt('Line: ', (text) => { const cur = lines(); cur[i] = text; setLines(a2, cur); a2.afterAction(); }, l),
        });
      });
      rows.push({ text: green('+ Add a line'), act: (a2) => addAfter(a2, ls.length - 1) });
      rows.push(H(''), H(bold('Pressed now, out of a fight')));
      for (const l of planLines(a, m)) rows.push(H(`  ${l}`));
      rows.push(H(''), { text: green('Run it'), act: (a2) => runMacro(a2, def()) });
      return rows;
    },
  };
}
