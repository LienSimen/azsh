// Bag housekeeping for the Bags tab: what Enter does to a stack (equip, open, unwrap, learn, use), the item menu
// behind m with every other verb (use all, split, wrap, move, destroy), sorting, and the keyring. Phonecraft's
// held-item menu (panels/heldItemMenu.ts) is the reference; every verb is a Game facade call.
import { bold, dim, yellow, green, red, qualityPaint, itemText } from './text.mjs';
import { autoLootOn, openLoot, takeAll } from './tuiLoot.mjs';
import { SLOT_LABEL, bagCapacity } from '../domain/items/equipment.ts';
import { freeSlots, isWrappingPaper, isFilledGift, canWrapTarget } from '../domain/items/inventory.ts';
import { isOpenableContainer } from '../domain/items/itemContainer.ts';
import { isAmmoItem } from '../domain/items/ammo.ts';
import { itemTeachIntent } from '../domain/items/itemTeaches.ts';
import { junkListOptions } from './tuiSettings.mjs';
import { isMountItem, toggleMount } from './tuiWorld.mjs';
import { questDialog } from './tuiViews.mjs';
import { useItemWithPicker, isPermanentEnchantItem } from './tuiEnchantTarget.mjs';
import { bagQuestStartState } from '../quests/quests.ts';

const stacks = (app) => app.g.state.inventory.stacks;
const hasLoot = (app) => (entry) => app.ds.lootTable(`item:${entry}`).length > 0;
const isContainer = (app, it) => isOpenableContainer(it, hasLoot(app));
const countText = (s) => (s.count > 1 ? ` x${s.count}` : '');

/** Name of what Enter does to this stack, for the detail pane and the menu. */
export function primaryVerb(app, s) {
  const it = app.ds.item(s.item);
  if (!it) return null;
  if (isMountItem(it)) return app.ch.mountedItem === it.entry ? 'Dismount' : 'Mount';
  if ((it.startQuest ?? 0) > 0 && bagQuestStartState(app.ds, app.ch, app.g.state.questlog, app.g.state.inventory, it.entry)) return 'Start the quest';
  if (isFilledGift(s)) return 'Unwrap';
  if (isWrappingPaper(it)) return 'Wrap an item';
  if (isContainer(app, it)) return 'Open';
  if (itemTeachIntent(it, app.ds)) return 'Learn';
  if (it.slot) return it.slot === 'bag' ? 'Equip bag' : 'Equip';
  if (isAmmoItem(it)) return app.ch.ammoItem === it.entry ? 'Unequip ammo' : 'Equip as ammo';
  if (it.consumable) return /bandage/i.test(it.name) ? 'Use' : it.consumable.effect === 'food' ? 'Eat' : 'Drink';
  if (it.useSpell && app.ds.enchantApplicator?.(it.useSpell)) return isPermanentEnchantItem(app, it) ? 'Apply to gear' : 'Apply to a weapon';
  if (it.useBuff || it.useInCombat || it.useSpell) return 'Use';
  return null;
}

/** Enter on a bag stack. */
export function useStack(app, slot) {
  const s = stacks(app)[slot];
  if (!s) return;
  const it = app.ds.item(s.item);
  if (isMountItem(it)) { toggleMount(app, s.item); return; }
  if ((it?.startQuest ?? 0) > 0) {
    const st = bagQuestStartState(app.ds, app.ch, app.g.state.questlog, app.g.state.inventory, s.item);
    if (st?.kind === 'offer') { app.push(questDialog(app, st.offer.quest, 'offer')); return; }
    if (st?.kind === 'blocked') { app.flashMsg(st.reason); return; }
  }
  if (isFilledGift(s)) {
    const r = app.g.unwrapItem(slot);
    app.result(r, r.ok ? `You unwrap ${itemText(it, 'the gift')}: ${app.itemLabel(r.restoredEntry)}.` : '');
    return;
  }
  if (isWrappingPaper(it)) { wrapWith(app, slot); return; }
  if (isContainer(app, it)) { openContainer(app, slot); return; }
  if (it?.slot) { const r = app.g.equip(s.item); app.result(r, r.ok ? (it.slot === 'bag' ? `You equip ${itemText(it)} as ${SLOT_LABEL[r.slot] ?? r.slot}.` : `You equip ${itemText(it)}.`) : ''); return; }
  if (isAmmoItem(it)) {
    if (app.ch.ammoItem === it.entry) app.result(app.g.clearAmmo(), 'You put your ammo away.');
    else app.result(app.g.setAmmo(s.item), `You load ${itemText(it)}.`);
    return;
  }
  // Cloth, ore, a quest item: nothing to use, so Enter opens the menu with what you can do instead.
  if (!primaryVerb(app, s)) { itemMenu(app, slot); return; }
  // An armor kit, a scope, a poison or a sharpening stone asks which slot it goes on.
  useItemWithPicker(app, s.item, (r) => (r.learned ? green(`You learn ${r.learned.name}.`) : green(`You use ${itemText(it)}.  HP ${app.hpText()}  ${app.pwText()}`)));
}

/** Open a clam, crate or lockbox into the loot window; auto-loot takes what fits straight away. */
export function openContainer(app, slot) {
  const name = app.itemLabel(stacks(app)[slot]?.item);
  const r = app.g.openContainerItem(slot, { hold: true });
  if (!app.result(r)) return;
  const by = r.openedBy ? ` ${r.openedBy} picks the lock.` : r.keyUsed ? ` The ${app.itemLabel(r.keyUsed)} turns.` : '';
  app.say(green(`You open ${name}.${by}`) + (r.skillUp ? dim(`  Lockpicking ${r.skillUp}`) : ''));
  if (!app.g.pendingLoot()) { app.say(dim('  It is empty.')); return; }
  if (autoLootOn(app)) takeAll(app);
  openLoot(app);
}

/** Wrapping paper: pick what goes in it. */
function wrapWith(app, paperSlot) {
  const targets = stacks(app).map((s, i) => ({ s, i })).filter(({ s, i }) => i !== paperSlot && canWrapTarget(app.ds.item(s.item), s).ok);
  if (!targets.length) { app.flashMsg('Nothing in your bags can be wrapped.'); return; }
  app.pick('Wrap which item?', targets.map(({ s, i }) => ({ label: `${app.itemLabel(s.item)}${countText(s)}`, value: i })), (i) => {
    const target = app.itemLabel(stacks(app)[i]?.item);
    const r = app.g.wrapItem(paperSlot, i);
    app.result(r, r.ok ? `You wrap ${target}${r.bound ? ' (it is bound to you now)' : ''}.` : '');
  });
}

/** Use (or open) the whole stack at once. Food, drink, buffs and books are left out, as phonecraft does. */
export function useAll(app, slot) {
  const s = stacks(app)[slot];
  if (!s) return;
  const it = app.ds.item(s.item);
  if (s.count < 2 || !it || it.consumable || it.useBuff || itemTeachIntent(it, app.ds) || isFilledGift(s) || !['Use', 'Open'].includes(primaryVerb(app, s))) {
    app.flashMsg(s.count < 2 ? 'Only one of those.' : 'That is used one at a time.');
    return;
  }
  const r = app.g.consumeItemAll(s.item);
  if (!app.result(r)) return;
  app.say(green(`You use ${r.used}x ${itemText(it)}.`) + (r.restored ? dim(`  +${r.restored}`) : '') + (r.stopped === 'blocked' ? yellow(`  Stopped: ${r.lastReason ?? 'refused'}.`) : ''));
}

/** Split off part of a stack into a free slot. */
export function splitStack(app, slot) {
  const s = stacks(app)[slot];
  if (!s || s.count < 2) { app.flashMsg('Nothing to split.'); return; }
  if (freeSlots(app.g.state.inventory, bagCapacity(app.ch, app.ds)) < 1) { app.flashMsg('Your bags are full.'); return; }
  app.prompt(`Split off how many ${app.itemLabel(s.item)} (1-${s.count - 1}): `, (raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n >= s.count) { app.flashMsg(`A number from 1 to ${s.count - 1}.`); return; }
    app.result(app.g.moveItem(slot, stacks(app).length, n), `You split ${n} ${app.itemLabel(s.item)} off.`);
    app.afterAction();
  });
}

/** Move a stack one slot up or down (a same-item neighbour merges into it). The cursor follows. */
export function moveStack(app, slot, delta) {
  const to = slot + delta;
  if (!stacks(app)[slot] || to < 0 || to >= stacks(app).length) return;
  const r = app.g.moveItem(slot, to);
  if (!app.result(r)) return;
  const view = app.top();
  if (view?.id === 'bags') view.cursor = Math.max(0, view.cursor + delta);
}

export function destroyStack(app, slot, keyring = false) {
  const s = (keyring ? app.g.state.keyring?.stacks : stacks(app))?.[slot];
  if (!s) return;
  app.confirm(`Destroy ${app.itemLabel(s.item)}${countText(s)}? This cannot be undone.`, () => {
    const r = keyring ? app.g.discardKeyringStack(slot) : app.g.discardBagStack(slot);
    app.result(r, r.ok ? `Destroyed ${app.itemLabel(s.item)}${r.discarded > 1 ? ` x${r.discarded}` : ''}.` : '');
  });
}

export function sortBags(app) {
  const r = app.g.sortContainer('bags');
  if (!app.result(r)) return;
  app.say(green(r.changed ? `Bags sorted${r.freed ? `, ${r.freed} slot${r.freed === 1 ? '' : 's'} freed` : ''}.` : 'Your bags are already in order.'));
}

/** m on a stack: every verb that applies to it. */
export function itemMenu(app, slot) {
  const s = stacks(app)[slot];
  if (!s) return;
  const it = app.ds.item(s.item);
  const verb = primaryVerb(app, s);
  const opts = [];
  if (verb) opts.push({ label: `${verb}  ${dim('Enter')}`, value: () => useStack(app, slot) });
  if (s.count > 1 && ['Use', 'Open'].includes(verb) && !it?.consumable && !it?.useBuff) opts.push({ label: `${verb === 'Open' ? 'Open' : 'Use'} all x${s.count}  ${dim('A')}`, value: () => useAll(app, slot) });
  if (s.count > 1) opts.push({ label: `Split the stack  ${dim('/')}`, value: () => splitStack(app, slot) });
  const paper = stacks(app).findIndex((x, i) => i !== slot && isWrappingPaper(app.ds.item(x.item)));
  if (paper >= 0 && !isWrappingPaper(it) && canWrapTarget(it, s).ok) {
    opts.push({ label: `Wrap it in ${app.itemLabel(stacks(app)[paper].item)}`, value: () => { const r = app.g.wrapItem(paper, slot); app.result(r, r.ok ? `You wrap ${itemText(it)}.` : ''); } });
  }
  if (slot > 0) opts.push({ label: `Move up  ${dim('[')}`, value: () => moveStack(app, slot, -1) });
  if (slot < stacks(app).length - 1) opts.push({ label: `Move down  ${dim(']')}`, value: () => moveStack(app, slot, +1) });
  opts.push({ label: `Move to the end`, value: () => app.result(app.g.moveItem(slot, stacks(app).length)) });
  opts.push(...junkListOptions(app, s.item));
  opts.push({ label: red(`Destroy  ${dim('d')}`), value: () => destroyStack(app, slot) });
  app.pick(`${itemText(it, 'Item')}${countText(s)}`, opts, (fn) => fn());
}

/** The keyring under the bags: keys only destroy from here (the engine uses them when it opens a lock). */
export function keyringRows(app) {
  const keys = app.g.state.keyring?.stacks ?? [];
  if (!keys.length) return [];
  const rows = [{ text: '', header: true }, { text: `Keyring  ${dim(`${keys.length}`)}`, header: true }];
  keys.forEach((k, i) => {
    rows.push({
      text: `${app.itemLabel(k.item)}${countText(k)}`, data: { keyring: i },
      detail: () => [bold(app.itemLabel(k.item)), dim('A key. Locked doors and boxes use it on their own.'), '', dim('d: destroy')],
      keys: { d: (a) => destroyStack(a, i, true) },
    });
  });
  return rows;
}
