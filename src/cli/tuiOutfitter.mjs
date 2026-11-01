// The Outfitter: named gear sets for you and each companion (phonecraft panels/outfitterPanel.ts). Enter wears or
// takes off a set (sets stack, later ones over earlier ones); e edits which slots a set holds, taken from what is
// worn right now. n saves what you wear as a new set, N builds one for a stat (fire resist, fishing, spell damage),
// b rebuilds a stat set from the bags, r renames, x deletes, o switches it off, w changes whose wardrobe this is.
import { bold, dim, yellow, green, red, cyan, qualityPaint, fit } from './text.mjs';
import { EQUIP_SLOTS, SLOT_LABEL } from '../domain/items/equipment.ts';
import { OUTFIT_CATEGORY_LABEL, OUTFIT_STAT_MENU, outfitsByCategory, outfitMissing, wearingOutfit, findOutfitById } from '../domain/bots/outfitter.ts';

const H = (text) => ({ text, header: true });
const allOwned = (g) => { const m = new Map(); for (const c of g.state.squad ?? []) m.set(c.id, c); for (const c of Object.values(g.state.botRoster ?? {})) m.set(c.id, c); return [...m.values()]; };

function wearer(app, owner) {
  if (owner === 'player') return { name: 'You', equipped: app.ch.equipped, bags: app.g.state.inventory, bank: app.g.state.bank };
  const c = allOwned(app.g).find((x) => x.id === owner);
  return c ? { name: c.name, equipped: c.equipped ?? {}, bags: c.bags, bank: c.bank } : null;
}

function wearResult(app, r) {
  if (!r.ok) { app.result(r); return; }
  app.say(green(`${r.wearing ? 'You put on' : 'You take off'} ${r.name}.`) + (r.missing ? yellow(`  ${r.missing} piece${r.missing === 1 ? '' : 's'} missing.`) : ''));
  for (const p of r.party ?? []) if (!p.ok) app.say(red(`  ${p.name}: ${p.reason ?? 'could not'}`));
}

export function outfitterDialog(app, owner = 'player') {
  const ui = { owner };
  const ownerName = () => (ui.owner === 'player' ? 'Your' : `${wearer(app, ui.owner)?.name ?? 'Their'}'s`);
  const withOutfit = (fn) => (a, row) => { if (row?.data?.outfit) fn(a, row.data.outfit); };
  return {
    id: 'outfitter', title: 'Outfitter', hint: 'Enter: wear / take off',
    keys: {
      e: { hint: 'slots', fn: withOutfit((a, o) => { a.g.selectOutfit(ui.owner, o.id); a.push(outfitSlotsDialog(a, ui.owner, o.id)); }) },
      n: { hint: 'new', fn: (a) => a.prompt('Name for the set you are wearing: ', (name) => { const r = a.g.createOutfit({ owner: ui.owner, name }); a.result(r, r.ok ? `Saved ${r.name}.` : ''); a.afterAction(); }) },
      N: { hint: 'for a stat', fn: (a) => pickStat(a, (statId, label) => { const r = a.g.generateOutfit(statId, { owner: ui.owner, name: label }); a.result(r, r.ok ? `Built ${r.name} from what you carry.` : ''); }) },
      b: { fn: withOutfit((a, o) => a.result(a.g.rebuildOutfit(ui.owner, o.id), `${o.name} rebuilt from your bags.`)) },
      r: { hint: 'rename', fn: withOutfit((a, o) => a.prompt(`Rename ${o.name} to: `, (name) => { a.result(a.g.renameOutfit(ui.owner, o.id, name), `Renamed to ${name}.`); a.afterAction(); }, o.name)) },
      x: { hint: 'delete', fn: withOutfit((a, o) => a.confirm(`Delete the ${o.name} outfit?`, () => a.result(a.g.deleteOutfit(ui.owner, o.id), `${o.name} deleted.`))) },
      o: { fn: withOutfit((a, o) => a.result(a.g.setOutfitDisabled(ui.owner, o.id, !o.disabled), `${o.name} ${o.disabled ? 'on' : 'off'}.`)) },
      w: { hint: 'whose', fn: (a) => {
        const opts = [{ label: 'You', value: 'player' }, ...allOwned(a.g).map((c) => ({ label: c.name, value: c.id }))];
        if (opts.length < 2) { a.flashMsg('No companions to dress.'); return; }
        a.pick('Whose wardrobe?', opts, (v) => { ui.owner = v; a.top().cursor = 0; });
      } },
    },
    rows(a) {
      const st = a.g.ensureOutfitter(ui.owner);
      const w = wearer(a, ui.owner);
      const rows = [H(`${bold(`${ownerName()} outfits`)}   ${dim(`${st.outfits.length} saved${st.stack.length ? `, wearing ${st.stack.length}` : ''}   n: save what is worn   N: build for a stat`)}`)];
      if (!w) return rows.concat(H(dim('  That companion has left.')));
      for (const { category, outfits } of outfitsByCategory(st)) {
        if (!outfits.length) continue;
        rows.push(H(''), H(OUTFIT_CATEGORY_LABEL[category] ?? category));
        for (const o of outfits) {
          const on = wearingOutfit(st, o.id);
          const missing = outfitMissing(o, w.equipped, w.bags, w.bank, a.ds);
          const pieces = Object.values(o.items).filter(Boolean).length;
          rows.push({
            text: `${on ? green('●') : ' '} ${o.disabled ? dim(o.name) : o.name}  ${dim(`${pieces} slot${pieces === 1 ? '' : 's'}`)}${o.statId ? dim(`  ${o.statId}`) : ''}${o.seeded ? dim('  follows what you wear') : ''}${missing ? yellow('  missing pieces') : ''}${o.disabled ? dim('  off') : ''}`,
            data: { outfit: o },
            detail: () => outfitLines(a, o, w, on),
            act: (a2) => wearResult(a2, a2.g.toggleOutfit(ui.owner, o.id)),
          });
        }
      }
      return rows;
    },
  };
}

function outfitLines(app, o, w, on) {
  const out = [bold(o.name), dim(`${o.category}${on ? ', worn now' : ''}${o.disabled ? ', switched off' : ''}`), ''];
  for (const slot of EQUIP_SLOTS) {
    const ref = o.items[slot];
    if (!ref) continue;
    if (ref.entry === 0) { out.push(`${fit(SLOT_LABEL[slot] ?? slot, 10)} ${dim('empty')}`); continue; }
    const it = app.ds.item(ref.entry);
    out.push(`${fit(SLOT_LABEL[slot] ?? slot, 10)} ${qualityPaint(it?.quality)(it?.name ?? ref.entry)}`);
  }
  if (out.length === 3) out.push(dim('No slots yet. e: pick slots from what is worn.'));
  out.push('', dim(`Enter: ${on ? 'take off' : 'wear'}   e: slots   r: rename   x: delete   o: ${o.disabled ? 'switch on' : 'switch off'}${o.statId ? '   b: rebuild' : ''}`));
  return out;
}

function pickStat(app, onPick) {
  const opts = [];
  for (const g of OUTFIT_STAT_MENU) for (const it of g.items) opts.push({ label: `${dim(fit(g.group, 7))} ${it.name}`, value: it });
  app.pick('Build an outfit for', opts, (it) => onPick(it.id, it.name));
}

/** Which slots a set holds. Enter on a slot takes what is worn there into the set, or drops it. */
function outfitSlotsDialog(app, owner, id) {
  return {
    id: 'outfit-slots', title: 'Slots', hint: 'Enter: take what is worn here / drop the slot',
    keys: {
      A: { hint: 'all worn', fn: (a) => a.result(a.g.setOutfitSlotsAll(owner, id, true), 'Every worn slot is in the set.') },
      Z: { hint: 'none', fn: (a) => a.result(a.g.setOutfitSlotsAll(owner, id, false), 'The set is empty.') },
    },
    rows(a) {
      const o = findOutfitById(a.g.outfitterState(owner), id);
      if (!o) return [H(dim('That outfit is gone.'))];
      const w = wearer(a, owner);
      const rows = [H(`${bold(o.name)}   ${dim('a slot in the set is put on when the set is worn')}`), H('')];
      for (const slot of EQUIP_SLOTS) {
        const ref = o.items[slot];
        const wornEntry = w?.equipped?.[slot];
        const wornId = typeof wornEntry === 'object' && wornEntry ? wornEntry.item : wornEntry;
        const name = ref ? (ref.entry === 0 ? dim('empty') : a.itemLabel(ref.entry)) : dim('not in the set');
        rows.push({
          text: `${ref ? green('✓') : dim('·')} ${fit(SLOT_LABEL[slot] ?? slot, 10)} ${name}${!ref && wornId ? cyan(`  worn: ${a.itemLabel(wornId)}`) : ''}`,
          act: (a2) => a2.result(a2.g.setOutfitSlot(owner, id, slot, !ref)),
        });
      }
      return rows;
    },
  };
}
