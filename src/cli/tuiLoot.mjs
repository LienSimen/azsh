// The loot window (the web client's LootFrame): what a corpse, chest or opened container is still holding. The engine
// keeps the haul in `state.pendingLoot`; Enter takes one row into the bags, a takes everything that fits, Esc
// closes it (outdoor leftovers are gone then, an opened bag item keeps its remainder). With auto-loot on (the
// default) fights never hold their loot and this window does not open.
import { bold, dim, yellow, green, red, qualityPaint, coinText } from './text.mjs';
import { itemLines } from './tuiViews.mjs';
import { formatItemName } from '../domain/items/itemDisplayName.ts';
import { farmNext } from './tuiFight.mjs';
import { noteLoot } from './tuiFightPanes.mjs';

const KIND_LABEL = { corpse: 'Corpse', chest: 'Chest', object: 'Object', mining: 'Mining', herbalism: 'Herbs', fishing: 'Fishing', skinning: 'Skinning', container: 'Container' };

export const autoLootOn = (app) => app.prefs.get('autoLoot') !== false;

/** Display name of a held row, with a rolled suffix ("of the Bear") when it carries one. */
function rowName(app, r) {
  const it = app.ds.item(r.item);
  const pid = r.instance?.randomPropertyId;
  const suffix = pid != null && pid > 0 ? app.ds.itemRandomProperty?.(pid)?.nameSuffix : undefined;
  return qualityPaint(it?.quality)(formatItemName(it?.name ?? `item ${r.item}`, suffix));
}

function toggleAutoLoot(app) {
  const on = !autoLootOn(app);
  app.prefs.set('autoLoot', on);
  app.say(dim(on ? 'Auto-loot on: fights put their loot straight into your bags.' : 'Auto-loot off: a corpse opens the loot window and you take what you want.'));
}

// Out of a fight nothing waits on the toasts, so they stay up longer than a win's hold (tuiFight WIN_HOLD_MS).
const TOAST_MS = 2500, TOAST_DROP_MS = 450, TOAST_STAGGER_MS = 220, TOAST_MAX_MS = 6000, TOAST_FRAME_MS = 80;

/** What a chest, node or opened bag item just gave, as the toasts a won fight slides in beside the corpse
 *  (putLootToasts), over whatever screen it was looted from. tui.mjs render() draws `app.lootToast`. */
export function toastLoot(app, taken = [], copper = 0) {
  const loot = taken.filter((t) => t.item != null);
  if (!loot.length && !copper) return;
  const until = Math.min(TOAST_MAX_MS, TOAST_MS + (loot.length + (copper ? 1 : 0)) * TOAST_DROP_MS);
  app.lootToast = { loot, copper, until, stagger: TOAST_STAGGER_MS, start: Date.now() };
  app.term.clearInterval(app.lootToastTimer);
  app.lootToastTimer = app.term.setInterval(() => {
    if (app.closed || !app.lootToast || Date.now() - app.lootToast.start > app.lootToast.until) {
      app.term.clearInterval(app.lootToastTimer); app.lootToastTimer = null; app.lootToast = null;
    }
    if (!app.closed) app.renderSoon();
  }, TOAST_FRAME_MS);
}

export function takeAll(app) {
  const r = app.g.takeAllLoot();
  if (!app.result(r)) return;
  noteLoot(app, r.taken, r.copper);
  toastLoot(app, r.taken, r.copper);
  for (const t of r.taken) app.say(`  ${yellow('You receive')} ${app.itemLabel(t.item)}${t.count > 1 ? ` x${t.count}` : ''}`);
  if (r.copper) app.say(`  ${yellow('You loot')} ${coinText(r.copper)}`);
  if (r.remaining) app.say(red(`  ${r.remaining} left in there: your bags are full.`));
  if (r.emptied && app.top()?.id === 'loot') app.pop();
}

/** Open the window over whatever is on screen, when something is held. */
export function openLoot(app) {
  if (!app.g.pendingLoot()) return false;
  if (app.top()?.id === 'loot') return true;
  app.push(lootDialog(app));
  return true;
}

export function lootDialog(app) {
  const first = app.g.pendingLoot();
  return {
    id: 'loot', title: `Loot: ${first?.title ?? 'nothing'}`, hint: 'Enter: take',
    keys: {
      a: { hint: 'take all', fn: (a) => takeAll(a) },
      o: { hint: 'auto-loot', fn: (a) => toggleAutoLoot(a) },
    },
    onClose(a) {
      const left = a.g.pendingLoot();
      if (!left) { queueMicrotask(() => farmNext(a)); return; }
      const n = left.rows.length + (left.copper > 0 ? 1 : 0);
      a.g.closeLoot();
      if (left.kind === 'container') a.say(dim(`You close ${left.title}. What is left stays inside.`));
      else a.say(dim(`You leave ${n === 1 ? 'one thing' : `${n} things`} on ${left.title}.`));
      // A repeating fight waits for the loot window; closing it starts the next pull.
      queueMicrotask(() => farmNext(a));
    },
    rows(a) {
      const L = a.g.pendingLoot();
      if (!L) return [{ text: dim('Nothing left.'), header: true }];
      const rows = [{ text: `${KIND_LABEL[L.kind] ?? L.kind}: ${L.title}`, header: true }];
      if (L.copper > 0) {
        rows.push({
          text: coinText(L.copper),
          detail: () => [bold('Money'), coinText(L.copper)],
          act: (a2) => { const r = a2.g.takeLootMoney(); if (a2.result(r)) { noteLoot(a2, [], r.copper); a2.say(`  ${yellow('You loot')} ${coinText(r.copper)}`); if (r.emptied) a2.pop(); } },
        });
      }
      L.rows.forEach((r, i) => {
        rows.push({
          text: `${rowName(a, r)}${r.count > 1 ? ` x${r.count}` : ''}${r.blocked ? red('  bags full') : ''}`,
          icon: a.ds.item(r.item)?.icon, sub: dim(a.ds.item(r.item)?.typeName ?? ''),
          detail: () => itemLines(a, a.ds.item(r.item), r.blocked ? ['', red('No room in your bags for this.')] : []),
          act: (a2) => {
            const res = a2.g.takeLoot(i);
            if (!a2.result(res)) return;
            noteLoot(a2, [{ item: res.item, count: res.count }]);
            const where = res.mailed ? dim(' (mailed: bags full)') : res.sold ? dim(' (sold)') : res.destroyed ? dim(' (destroyed)') : '';
            a2.say(`  ${yellow('You receive')} ${a2.itemLabel(res.item)}${res.count > 1 ? ` x${res.count}` : ''}${where}`);
            if (res.emptied) a2.pop();
          },
        });
      });
      rows.push({ text: '', header: true });
      rows.push({ text: green('Take all'), act: (a2) => takeAll(a2) });
      rows.push({ text: `Auto-loot: ${autoLootOn(a) ? green('on') : dim('off')}  ${dim('(next time)')}`, act: (a2) => toggleAutoLoot(a2) });
      return rows;
    },
  };
}
