// City services: the bank, the auction house and the mailbox. Same view shape as tuiViews.mjs; every
// change is a Game facade call. Where they open follows the web client's CITY_PANEL rule: the auction
// house in the six capitals, the bank there plus the goblin and Crossroads banker towns.
import { bold, dim, cyan, yellow, green, red, inverse, vis, useColor, qualityPaint, fit, secondsText, plural, itemText, coinText } from './text.mjs';
import { moneyText } from '../domain/economy/money.ts';
import { itemLines } from './tuiViews.mjs';
import { bagCapacity } from '../domain/items/equipment.ts';
import { countItem } from '../domain/items/inventory.ts';
import { bankCapacity, nextBankBagSlotCost } from '../domain/items/bank.ts';
import { minNextBid, auctionDeposit } from '../domain/economy/auction.ts';
import { AH_DURATIONS_MS } from '../engine/game/types.ts';
import { MAX_MAIL_ITEMS, MAIL_POSTAGE_COPPER } from '../domain/economy/mail.ts';
import { hasIdentity } from '../domain/items/itemInstance.ts';
import { isConjuredItem } from '../domain/items/itemBonding.ts';
import { areHostile } from '../domain/character/races.ts';

/** Non-capital zones with a banker spawn (Unit.h UNIT_NPC_FLAG_BANKER): Ratchet/Crossroads, Booty Bay, Gadgetzan, Everlook. */
const BANK_TOWN_ZONE_IDS = new Set(['barrens', 'stranglethorn', 'tanaris', 'winterspring']);

/** Which city services the zone you stand in offers. */
export function cityAccess(app) {
  const z = app.zone();
  const capital = !!z?.capital;
  const bank = capital || BANK_TOWN_ZONE_IDS.has(app.ch.zoneId);
  // A mailbox stands outside every inn and in every capital; mail that is already waiting is always reachable.
  const mail = capital || !!z?.innkeepers?.length || (app.g.state.mailbox?.length ?? 0) > 0;
  return { capital, bank, ah: capital, mail };
}

/** "12g 5s 3c", "1.5g", "50s", "250" (copper) → copper, or null when unreadable. */
export function parseMoney(text) {
  const t = String(text).trim().toLowerCase();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  let total = 0, any = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*([gsc])/g)) {
    any = true;
    const n = Number(m[1]);
    total += m[2] === 'g' ? n * 10000 : m[2] === 's' ? n * 100 : n;
  }
  return any ? Math.round(total) : null;
}

function timeLeft(a, now) {
  const ms = a.expiresAt - now;
  if (ms <= 0) return red('ended');
  if (ms < 30 * 60 * 1000) return red('short');
  if (ms < 2 * 60 * 60 * 1000) return yellow('medium');
  if (ms < 12 * 60 * 60 * 1000) return 'long';
  return green('very long');
}

// ---- bank ---------------------------------------------------------------------------------------

export function bankDialog(app, startMode = 'deposit') {
  let mode = startMode;
  const hint = () => (mode === 'deposit' ? 'Enter: deposit stack   Tab: withdraw' : 'Enter: withdraw stack   Tab: deposit');
  const move = (a, index, qty) => {
    const r = mode === 'deposit' ? a.g.bankDepositStack(index, qty) : a.g.bankWithdrawStack(index, qty);
    a.result(r, r.ok ? `${mode === 'deposit' ? 'Deposited' : 'Withdrew'} ${r.moved} item${r.moved === 1 ? '' : 's'}.` : '');
  };
  const view = {
    id: 'bank', title: 'Bank', hint: hint(),
    keys: {
      n: { hint: 'move some', fn: (a, row) => { if (!row?.data) return; a.prompt(`How many ${a.itemLabel(row.data.s.item)} (1-${row.data.s.count})? `, (t) => { const n = Number(t); if (n > 0) move(a, row.data.index, Math.min(n, row.data.s.count)); a.afterAction(); }); } },
      '+': { hint: 'buy bag slot', fn: (a) => {
        const cost = nextBankBagSlotCost(a.g.state.bankBags);
        if (cost == null) { a.flashMsg('You already own every bank bag slot.'); return; }
        a.confirm(`Buy a bank bag slot for ${coinText(cost)}?`, () => a.result(a.g.buyBankBagSlot(), `Bought a bank bag slot for ${coinText(cost)}.`));
      } },
      D: { hint: 'deposit all of it', fn: (a, row) => { if (mode !== 'deposit' || !row?.data?.s) return; const e = row.data.s.item; const r = a.g.bankDeposit(e, countItem(a.g.state.inventory, e)); a.result(r, r.ok ? `Deposited every ${a.itemLabel(e)} (${r.moved}).` : ''); } },
      B: { hint: 'slot a bag', fn: (a, row) => {
        if (mode !== 'deposit' || !row?.data) { a.flashMsg('Pick a bag in your bags (deposit side) first.'); return; }
        const it = a.ds.item(row.data.s.item);
        if (it?.slot !== 'bag') { a.flashMsg('That is not a bag.'); return; }
        const free = a.g.state.bankBags.findIndex((b) => b == null);
        if (free < 0) { a.flashMsg('No empty bank bag slot. + buys one.'); return; }
        a.result(a.g.equipBankBag(it.entry ?? row.data.s.item, free), `${itemText(it)} now holds bank space.`);
      } },
    },
    onKey(a, k) { if (k === 'tab') { mode = mode === 'deposit' ? 'withdraw' : 'deposit'; view.cursor = 0; view.scroll = 0; view.hint = hint(); return true; } return false; },
    rows(a) {
      const st = a.g.state, ds = a.ds;
      const bankCap = bankCapacity(st.bankBags, ds), bagCap = bagCapacity(a.ch, ds);
      const owned = st.bankBags.length, slotted = st.bankBags.filter((b) => b != null).length;
      const rows = [
        { text: `${bold('Bank')} ${dim(`${st.bank.stacks.length}/${bankCap}`)}   ${bold('Bags')} ${dim(`${st.inventory.stacks.length}/${bagCap}`)}   ${coinText(a.ch.gold)}`, header: true },
        { text: dim(`Bank bag slots: ${owned} owned, ${slotted} holding a bag${nextBankBagSlotCost(st.bankBags) != null ? `, next costs ${coinText(nextBankBagSlotCost(st.bankBags))}` : ''}`), header: true },
      ];
      // Each bank bag slot: Enter takes the bag in it back to your bags (it has to be empty).
      st.bankBags.forEach((b, slot) => {
        if (b == null) { rows.push({ text: dim(`  Bank bag ${slot + 1}: empty   (B on a bag in your bags fills it)`), header: true }); return; }
        const bag = ds.item(typeof b === 'object' ? b.item ?? b.entry : b);
        rows.push({ text: `  Bank bag ${slot + 1}: ${itemText(bag, String(b))}${bag?.bagSlots ? dim(`  ${bag.bagSlots} slots`) : ''}   ${dim('Enter: take it out')}`, data: { bankBag: slot }, act: (a2) => a2.result(a2.g.unequipBankBag(slot), `${itemText(bag, 'The bag')} is back in your bags.`) });
      });
      rows.push(
        { text: `${mode === 'deposit' ? bold('Your bags → bank') : dim('Your bags → bank')}   ${mode === 'withdraw' ? bold('Bank → your bags') : dim('Bank → your bags')}`, header: true },
        { text: '', header: true },
      );
      const list = mode === 'deposit' ? st.inventory.stacks : st.bank.stacks;
      if (!list.length) rows.push({ text: dim(mode === 'deposit' ? 'Your bags are empty.' : 'Your bank is empty.'), header: true });
      list.forEach((s, index) => {
        const it = ds.item(s.item);
        const tag = it?.slot ? dim(`  ${it.slot}`) : it?.questItem ? dim('  quest') : '';
        rows.push({
          text: `${qualityPaint(it?.quality)(it?.name ?? `item ${s.item}`)}${s.count > 1 ? ` x${s.count}` : ''}${tag}`, data: { s, index }, icon: it?.icon, sub: dim(it?.typeName ?? ''),
          detail: () => itemLines(a, it, ['', dim(mode === 'deposit' ? 'Enter: deposit   n: deposit some' : 'Enter: withdraw   n: withdraw some')]),
          act: () => move(a, index),
        });
      });
      return rows;
    },
  };
  return view;
}

// ---- auction house ------------------------------------------------------------------------------

// Browse categories: ItemClass.dbc in AuctionFrame.lua order, as the web client's auctionModel.ts. Subclass names are
// ItemSubClass.dbc; the TBC-era consumable and trade goods subclasses the item table carries get their names too.
const AH_CLASSES = [
  [2, 'Weapons'], [4, 'Armor'], [1, 'Container'], [0, 'Consumable'], [7, 'Trade Goods'],
  [6, 'Projectile'], [11, 'Quiver'], [9, 'Recipe'], [5, 'Reagent'], [15, 'Miscellaneous'],
];
const AH_SUBCLASSES = {
  0: ['Consumable', 'Potion', 'Elixir', 'Flask', 'Scroll', 'Food & Drink', 'Item Enhancement', 'Bandage', 'Other'],
  1: ['Bag', 'Soul Bag', 'Herb Bag', 'Enchanting Bag', 'Engineering Bag'],
  2: { 0: 'One-Handed Axes', 1: 'Two-Handed Axes', 2: 'Bows', 3: 'Guns', 4: 'One-Handed Maces', 5: 'Two-Handed Maces', 6: 'Polearms', 7: 'One-Handed Swords', 8: 'Two-Handed Swords', 10: 'Staves', 13: 'Fist Weapons', 14: 'Miscellaneous', 15: 'Daggers', 16: 'Thrown', 17: 'Spears', 18: 'Crossbows', 19: 'Wands', 20: 'Fishing Poles' },
  4: { 0: 'Miscellaneous', 1: 'Cloth', 2: 'Leather', 3: 'Mail', 4: 'Plate', 6: 'Shields', 7: 'Librams', 8: 'Idols', 9: 'Totems' },
  5: ['Reagent'],
  6: { 2: 'Arrows', 3: 'Bullets' },
  7: ['Trade Goods', 'Parts', 'Explosives', 'Devices', 'Jewelcrafting', 'Cloth', 'Leather', 'Metal & Stone', 'Meat', 'Herbs', 'Elemental', 'Other', 'Enchanting'],
  9: ['Books', 'Leatherworking', 'Tailoring', 'Engineering', 'Blacksmithing', 'Cooking', 'Alchemy', 'First Aid', 'Enchanting', 'Fishing'],
  11: { 2: 'Quivers', 3: 'Ammo Pouches' },
  15: ['Junk'],
};

/** [category, subcategory] of an item: a browse class (15 catches the rest) and a subclass name. */
function ahCategory(it) {
  const cls = AH_CLASSES.some(([c]) => c === it?.itemClass) ? it.itemClass : 15;
  const sub = it?.itemSubclass ?? it?.weaponSubclass ?? it?.armorSubclass ?? 0;
  return [cls, AH_SUBCLASSES[cls]?.[sub] ?? 'Other'];
}

/**
 * One line of tabs, the picked one inverse; when it does not fit it scrolls to keep the pick in view. A strip
 * under the cursor is drawn inverse whole, so there the pick is bracketed instead.
 */
export function tabStrip(labels, at, width, focused = false) {
  const cells = labels.map((l, i) => (i === at ? (useColor && !focused ? inverse(` ${l} `) : focused ? bold(`[${l}]`) : `[${l}]`) : ` ${l} `));
  let from = 0, to = cells.length;
  const len = () => cells.slice(from, to).reduce((n, c) => n + vis(c), 0) + (from > 0 ? 2 : 0) + (to < cells.length ? 2 : 0);
  while (len() > width && to - from > 1) { if (at - from > to - 1 - at) from++; else to--; }
  return `${from > 0 ? dim('‹ ') : ''}${cells.slice(from, to).join('')}${to < cells.length ? dim(' ›') : ''}`;
}

export function auctionDialog(app) {
  app.g.refillAuctions(Date.now());
  let mode = 'browse';
  let filter = '';
  let cat = 'all', sub = 'all';
  const MODES = ['browse', 'sell', 'mine'];
  // The category and subcategory strips are cursor rows: Up from the listings lands on them, Left Right turns them.
  let lastRows = [];
  const stripAt = () => lastRows[view.cursor]?.data?.strip;
  const hint = () => {
    if (mode === 'browse') {
      const s = stripAt(), hasSub = lastRows.some((r) => r.data?.strip === 'sub');
      if (s === 'cat') return `Left Right: category   Down: ${hasSub ? 'subcategory' : 'listings'}   Tab: sell`;
      if (s === 'sub') return 'Left Right: subcategory   Up: category   Down: listings   Tab: sell';
      return `Enter: buyout   Left Right: category   Up to the tabs: ${hasSub ? 'subcategory' : 'category'}   Tab: sell`;
    }
    return { sell: 'Enter: list for sale   Tab: my auctions', mine: 'Enter: cancel listing   Tab: browse' }[mode];
  };
  const unit = (x) => Math.round(x.buyoutCopper / x.quantity);
  // Back to the top of the list; in browse the cursor goes to the first listing, past the strips.
  let toList = true;
  const top = () => { toList = true; view.scroll = 0; };
  // The listings the search leaves, the categories they fall in (the picked one stays even when it empties)
  // and the subcategories of the picked category, each with its count.
  const browse = (a, now) => {
    let all = a.g.browseAuctions(now).map((au) => { const it = a.ds.item(au.item); return { au, it, c: ahCategory(it) }; });
    if (filter) all = all.filter((x) => (x.it?.name ?? '').toLowerCase().includes(filter));
    const count = (pred) => all.filter(pred).length;
    const cats = [{ key: 'all', label: 'All', n: all.length }];
    for (const [c, label] of AH_CLASSES) { const n = count((x) => x.c[0] === c); if (n || c === cat) cats.push({ key: c, label, n }); }
    const inCat = cat === 'all' ? all : all.filter((x) => x.c[0] === cat);
    const subs = [{ key: 'all', label: 'All', n: inCat.length }];
    for (const x of inCat) { const s = subs.find((y) => y.key === x.c[1]); if (s) s.n++; else subs.push({ key: x.c[1], label: x.c[1], n: 1 }); }
    if (sub !== 'all' && !subs.some((s) => s.key === sub)) subs.push({ key: sub, label: sub, n: 0 });
    const order = Object.values(AH_SUBCLASSES[cat] ?? {}), rank = (s) => (s.key === 'all' ? -1 : order.includes(s.key) ? order.indexOf(s.key) : order.length);
    subs.sort((x, y) => rank(x) - rank(y));
    const list = sub === 'all' ? inCat : inCat.filter((x) => x.c[1] === sub);
    return { cats, subs, list };
  };
  // Turn a strip; on a strip the cursor stays put so it can keep turning, from a listing it goes back to the top.
  const step = (a, which, d) => {
    const b = browse(a, Date.now());
    const opts = which === 'cat' ? b.cats : b.subs;
    if (opts.length < 2) return;
    const i = opts.findIndex((o) => o.key === (which === 'cat' ? cat : sub));
    const next = opts[(i + d + opts.length) % opts.length].key;
    if (which === 'cat') { cat = next; sub = 'all'; } else sub = next;
    if (stripAt()) view.scroll = 0; else top();
  };
  const view = {
    id: 'auction', title: 'Auction House',
    get hint() { return hint(); },
    keys: {
      s: { hint: 'search', fn: (a) => { if (mode !== 'browse') return; a.prompt('Search: ', (t) => { filter = t.trim().toLowerCase(); top(); a.render(); }, filter); } },
      '[': { fn: (a) => { if (mode === 'browse') step(a, 'sub', -1); } },
      ']': { fn: (a) => { if (mode === 'browse') step(a, 'sub', +1); } },
      b: { hint: 'bid', fn: (a, row) => {
        if (mode !== 'browse' || !row?.data?.auction) return;
        const au = row.data.auction, min = minNextBid(au);
        a.prompt(`Bid on ${a.itemLabel(au.item)} (at least ${coinText(min)}): `, (t) => {
          const amount = parseMoney(t);
          if (amount == null) { a.say(red('Say a price like 2g 50s or 250.')); a.render(); return; }
          a.result(a.g.bidAuction(au.id, amount, Date.now()), `You bid ${coinText(amount)} on ${a.itemLabel(au.item)}.`);
          a.afterAction();
        }, moneyText(min));
      } },
      m: { hint: 'mailbox', fn: (a) => a.push(mailDialog(a)) },
    },
    onKey(a, k) {
      if (mode === 'browse' && (k === 'left' || k === 'right')) { step(a, stripAt() ?? 'cat', k === 'right' ? +1 : -1); return true; }
      if (k !== 'tab' && k !== 'shift-tab') return false;
      mode = MODES[(MODES.indexOf(mode) + (k === 'tab' ? 1 : MODES.length - 1)) % MODES.length];
      if (mode === 'browse') a.g.refillAuctions(Date.now());
      top();
      return true;
    },
    rows(a) {
      const now = Date.now(), ds = a.ds;
      const unread = a.g.unreadMailCount(now);
      const L = a.layout(), width = (L.detailW ? L.listW : L.W) - 2;
      const modeLabels = MODES.map((m) => ({ browse: 'Browse', sell: 'Sell', mine: 'My auctions' }[m]));
      const rows = [
        { text: `${bold('Auction House')}  ${tabStrip(modeLabels, MODES.indexOf(mode), 40)}  ${coinText(a.ch.gold)}${unread ? yellow(`   ${unread} new mail`) : ''}`, header: true },
      ];
      if (mode === 'browse') {
        const b = browse(a, now);
        const strip = (which, opts, key, label) => {
          const focused = !toList && view.cursor === rows.length;
          rows.push({
            text: tabStrip(opts.map((o) => `${o.label} ${o.n}`), opts.findIndex((o) => o.key === key), width - 1, focused), data: { strip: which },
            detail: () => [bold(label), '', dim('Left Right: pick one'), dim(`Down${which === 'cat' && rows.some((r) => r.data?.strip === 'sub') ? ': subcategories' : ' or Enter: the listings'}`)],
            act: (a2) => a2.moveCursor(view, a2.rowsOf(view), +1),
          });
        };
        strip('cat', b.cats, cat, 'Category');
        if (cat !== 'all' && b.subs.length > 2) strip('sub', b.subs, sub, 'Subcategory');
        rows.push({ text: '', header: true });
        const list = b.list.map((x) => x.au);
        list.sort((x, y) => (ds.item(x.item)?.name ?? '').localeCompare(ds.item(y.item)?.name ?? '') || unit(x) - unit(y));
        const where = cat === 'all' ? '' : `${b.cats.find((c) => c.key === cat)?.label}${sub === 'all' ? '' : ` › ${sub}`}: `;
        rows.push({ text: `${where}${filter ? `"${filter}": ` : ''}${plural(list.length, 'listing')}${filter ? dim('   s: change search') : dim('   s: search by name')}`, header: true });
        if (!list.length) rows.push({ text: dim(filter || cat !== 'all' ? 'Nothing listed here.' : 'Nothing on the boards right now.'), header: true });
        for (const au of list) {
          const it = ds.item(au.item);
          const can = au.buyoutCopper <= a.ch.gold;
          const name = `${qualityPaint(it?.quality)(it?.name ?? au.item)}${au.quantity > 1 ? ` x${au.quantity}` : ''}`;
          rows.push({
            text: `${can ? name : dim(name)}  ${coinText(au.buyoutCopper)}${au.quantity > 1 ? dim(` (${coinText(unit(au))} each)`) : ''}  ${dim('bid')} ${coinText(au.bidCopper)}${au.highBidder === a.ch.name ? green('  yours') : ''}  ${timeLeft(au, now)}${it?.requiredLevel > a.ch.level ? red(`  L${it.requiredLevel}`) : ''}`,
            data: { auction: au }, icon: it?.icon, sub: dim(it?.typeName ?? ''),
            detail: () => itemLines(a, it, ['', `Buyout: ${coinText(au.buyoutCopper)}`, `Current bid: ${coinText(au.bidCopper)}${au.highBidder ? dim(` (${au.highBidder === a.ch.name ? 'you' : au.highBidder})`) : dim(' (no bids)')}`, `Next bid: ${coinText(minNextBid(au))}`, dim(`Seller: ${au.seller}`), '', dim('Enter: buy out   b: bid')]),
            act: () => a.confirm(`Buy ${itemText(it, String(au.item))}${au.quantity > 1 ? ` x${au.quantity}` : ''} for ${coinText(au.buyoutCopper)}?`, () => a.result(a.g.buyoutAuction(au.id), `Bought ${itemText(it)}${au.quantity > 1 ? ` x${au.quantity}` : ''} for ${coinText(au.buyoutCopper)}.`)),
          });
        }
      } else if (mode === 'sell') {
        rows.push({ text: '', header: true });
        const st = a.g.state.inventory.stacks;
        rows.push({ text: dim('Pick something from your bags to put up for auction.'), header: true });
        if (!st.length) rows.push({ text: dim('Your bags are empty.'), header: true });
        for (const s of st) {
          const it = ds.item(s.item);
          const soulbound = !!s.bound, quest = !!it?.questItem;
          const name = `${qualityPaint(it?.quality)(it?.name ?? s.item)}${s.count > 1 ? ` x${s.count}` : ''}`;
          rows.push({
            text: `${soulbound || quest ? dim(name) : name}${soulbound ? red('  soulbound') : quest ? dim('  quest') : ''}${it?.sellPrice ? dim(`  vendor ${coinText(it.sellPrice * s.count)}`) : ''}`, data: { s }, icon: it?.icon, sub: dim(it?.typeName ?? ''),
            detail: () => itemLines(a, it, ['', dim('Enter: set prices and list it')]),
            act: () => { if (soulbound) a.flashMsg('Soulbound items cannot be auctioned.'); else if (quest) a.flashMsg('Quest items cannot be auctioned.'); else sellFlow(a, s, it); },
          });
        }
      } else {
        rows.push({ text: '', header: true });
        const own = a.g.ownAuctions(), bids = a.g.myBidAuctions();
        const mail = a.g.listMail(now);
        rows.push({ text: `Mailbox: ${mail.length ? `${plural(mail.length, 'letter')} waiting` : 'empty'}${dim('  (sales and refunds arrive here)')}`, act: () => a.push(mailDialog(a)), data: {} });
        rows.push({ text: '', header: true }, { text: `Your listings (${own.length})`, header: true });
        if (!own.length) rows.push({ text: dim('  You have nothing up for sale.'), header: true });
        for (const au of own) {
          const it = ds.item(au.item);
          rows.push({
            text: `${qualityPaint(it?.quality)(it?.name ?? au.item)}${au.quantity > 1 ? ` x${au.quantity}` : ''}  ${dim('bid')} ${coinText(au.bidCopper)}${au.highBidder ? green(' (bid placed)') : ''}  ${dim('buyout')} ${coinText(au.buyoutCopper)}  ${timeLeft(au, now)}`,
            data: { auction: au }, icon: it?.icon, sub: dim(it?.typeName ?? ''),
            detail: () => itemLines(a, it, ['', `Buyout: ${coinText(au.buyoutCopper)}`, `Bid: ${coinText(au.bidCopper)}${au.highBidder ? ` by ${au.highBidder}` : ''}`, '', dim('Enter: cancel the listing (the deposit is lost)')]),
            act: () => a.confirm(`Cancel the ${itemText(it)} listing?`, () => a.result(a.g.cancelAuction(au.id), `Listing cancelled. ${itemText(it)} is back in your bags.`)),
          });
        }
        rows.push({ text: '', header: true }, { text: `Your bids (${bids.length})`, header: true });
        if (!bids.length) rows.push({ text: dim('  You hold no high bids.'), header: true });
        for (const au of bids) {
          const it = ds.item(au.item);
          rows.push({ text: `  ${qualityPaint(it?.quality)(it?.name ?? au.item)}${au.quantity > 1 ? ` x${au.quantity}` : ''}  ${dim('your bid')} ${coinText(au.bidCopper)}  ${timeLeft(au, now)}`, header: true });
        }
      }
      if (toList) {
        toList = false;
        const first = mode === 'browse' ? rows.findIndex((r) => r.data?.auction) : -1;
        view.cursor = first >= 0 ? first : 0;
      }
      lastRows = rows;
      return rows;
    },
  };
  return view;
}

/** Ask quantity, bid, buyout and duration, then list. Each answer is a hint-row prompt. */
function sellFlow(app, s, it) {
  const finish = (qty, bid, buyout) => {
    const opts = Object.entries(AH_DURATIONS_MS).map(([k, ms]) => {
      const dep = auctionDeposit(it?.sellPrice ?? 0, qty, ms / 1000);
      return { label: `${{ short: '2 hours', medium: '8 hours', long: '24 hours' }[k]}  ${dim(`deposit ${coinText(dep)}`)}`, value: k };
    });
    app.pick('How long should it run?', opts, (dur) => {
      const r = app.g.listAuction(s.item, qty, bid, buyout, dur, Date.now());
      app.result(r, r.ok ? `Listed ${itemText(it)}${qty > 1 ? ` x${qty}` : ''}: bid ${coinText(bid)}, buyout ${coinText(buyout)}.` : '');
      app.afterAction();
    });
  };
  const askPrices = (qty) => {
    const vendor = (it?.sellPrice ?? 0) * qty;
    app.prompt(`Starting bid for ${itemText(it)}${qty > 1 ? ` x${qty}` : ''} (e.g. 2g 50s): `, (t1) => {
      const bid = parseMoney(t1);
      if (bid == null || bid < 1) { app.say(red('Say a price like 2g 50s or 250.')); app.render(); return; }
      app.prompt(`Buyout (at least ${coinText(bid)}): `, (t2) => {
        const buyout = parseMoney(t2);
        if (buyout == null || buyout < bid) { app.say(red('The buyout must be at least the starting bid.')); app.render(); return; }
        finish(qty, bid, buyout);
      }, moneyText(Math.max(bid, Math.round(bid * 1.5))));
    }, vendor ? moneyText(Math.max(1, vendor * 2)) : '');
  };
  if (s.count > 1) app.prompt(`How many ${itemText(it)} (1-${s.count})? `, (t) => { const n = Math.min(s.count, Number(t)); if (n > 0) askPrices(n); else app.render(); }, String(s.count));
  else askPrices(1);
}

// ---- mailbox ------------------------------------------------------------------------------------

// Postal's Open All: every letter's money and items, and each letter it empties is thrown away. COD letters wait.
function takeAllMail(a) {
  const before = a.g.listMail(Date.now()).length;
  const r = a.g.collectMail();
  if (!r.ok) { a.result(r, ''); return; }
  const left = a.g.listMail(Date.now());
  const cleared = before - left.length;
  const cod = left.filter((m) => m.cod > 0).length;
  const msg = r.abortedFull ? red('Your bags filled up before the mail was empty.')
    : cleared || r.moved ? `${cleared ? `Emptied ${plural(cleared, 'letter')}.` : `Collected ${r.moved} from the mail.`}${cod ? dim(`  ${plural(cod, 'COD letter')} left: Enter pays and takes.`) : ''}`
      : 'Nothing to collect.';
  a.result(r, msg);
}

export function mailDialog(app) {
  const takeAll = { hint: 'take all', fn: takeAllMail };
  return {
    id: 'mail', title: 'Mailbox', hint: 'Enter: take it and bin the letter',
    keys: {
      a: takeAll, A: { fn: takeAllMail },
      d: { hint: 'delete', fn: (a, row) => { if (row?.data?.mail) a.confirm(`Delete "${row.data.mail.subject}"?`, () => a.result(a.g.deleteMail(row.data.mail.id), 'Mail deleted.')); } },
      r: { hint: 'return', fn: (a, row) => { if (row?.data?.mail) a.confirm(`Send "${row.data.mail.subject}" back to ${row.data.mail.sender}?`, () => { void returnToSender(a, row.data.mail); }); } },
      s: { hint: 'send', fn: (a) => a.push(composeDialog(a)) },
    },
    rows(a) {
      const now = Date.now();
      const mail = a.g.listMail(now);
      const rows = [{ text: `${bold('Mailbox')}  ${dim(plural(mail.length, 'letter'))}   ${coinText(a.ch.gold)}${mail.length ? dim('   a: take everything') : ''}`, header: true }, { text: '', header: true }];
      if (!mail.length) rows.push({ text: dim('No mail.'), header: true });
      for (const m of mail) {
        const atts = m.attachments.map((x) => `${a.itemLabel(x.entry)}${x.quantity > 1 ? ` x${x.quantity}` : ''}`);
        const bits = [...(m.money ? [coinText(m.money)] : []), ...atts];
        const read = (m.checked ?? 0) & 1;
        rows.push({
          text: `${read ? dim(m.subject) : bold(m.subject)}  ${dim(`from ${m.sender}`)}${bits.length ? `  ${bits.join(', ')}` : ''}${m.cod ? red(`  COD ${coinText(m.cod)}`) : ''}`,
          data: { mail: m }, icon: (m.attachments.length ? a.ds.item(m.attachments[0].entry)?.icon : null) ?? (m.money ? 'inv_misc_coin_03' : 'inv_letter_01'),
          detail: () => [bold(m.subject), dim(`From ${m.sender}`), '', ...String(m.body ?? '').split('\n').filter(Boolean), ...(bits.length ? ['', cyan('Enclosed'), ...bits.map((b) => `  ${b}`)] : []), ...(m.cod ? ['', red(`Cash on delivery: ${coinText(m.cod)}`)] : []), '', dim(`Expires in ${secondsText(Math.max(0, m.expiresAt - now))}`)],
          act: () => takeMail(a, m),
        });
      }
      return rows;
    },
  };
}

function takeMail(app, m) {
  app.g.markMailRead(m.id);
  let took = 0;
  if (m.money) { const r = app.g.takeMailMoney(m.id); if (r.ok && r.taken) { took++; app.say(green(`You take ${coinText(r.taken)}.`)); } else if (!r.ok) app.say(red(r.reason)); }
  for (let i = 0; i < 16; i++) {
    const cur = app.g.listMail(Date.now()).find((x) => x.id === m.id);
    if (!cur?.attachments.length) break;
    const att = cur.attachments[0];
    const r = app.g.takeMailItem(m.id);
    if (!r.ok) { app.say(red(r.reason)); break; }
    // Taking a COD item pays the sender: their payment letter goes to their mailbox.
    if (r.remittance) void deliverNamedMail(app, r.remittance.to, r.remittance.mail);
    took++;
    app.say(green(`You take ${app.itemLabel(att.entry)}${att.quantity > 1 ? ` x${att.quantity}` : ''}.`));
  }
  // A letter with nothing left in it is thrown away, as Postal does; a COD or full-bag letter stays.
  const cur = app.g.listMail(Date.now()).find((x) => x.id === m.id);
  if (cur && !cur.money && !cur.attachments.length && !cur.cod) {
    const r = app.g.deleteMail(m.id);
    if (r.ok && !took) app.say(dim(`Threw away "${m.subject}".`));
  }
}

// ---- mail between your own characters -------------------------------------------------------------
// Every save in ~/.azsh/saves is a character on this realm: a letter to one is written into that save's
// mailbox (the web client's appInteractInputB.ts sendMailBatch). Returned letters and COD payments land the same way.

const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** Put a letter in the named character's mailbox: yours, or another save's. False when nobody has that name. */
export async function deliverNamedMail(app, toName, mail) {
  if (sameName(toName, app.ch.name)) { app.g.state.mailbox = [...(app.g.state.mailbox ?? []), mail]; return true; }
  const meta = (await app.repo.list()).find((s) => sameName(s.name, toName));
  const dest = meta ? await app.repo.load(meta.slot) : null;
  if (!dest) return false;
  dest.state.mailbox = [...(dest.state.mailbox ?? []), mail];
  dest.updatedAt = Date.now();
  await app.repo.save(dest);
  return true;
}

async function returnToSender(app, m) {
  const r = app.g.returnMail(m.id, Date.now());
  if (!app.result(r)) return;
  const delivered = await deliverNamedMail(app, r.to, r.mail);
  app.say(delivered ? green(`Returned to ${r.to}.`) : dim(`Returned. ${r.to} is not one of your characters, so it goes nowhere.`));
  await app.persist();
  app.render();
}

/** Write a letter to another of your characters: recipient, subject, money or COD, and up to 21 stacks. */
export function composeDialog(app) {
  const m = { to: null, subject: '', money: 0, cod: false, attach: new Set() };
  const send = async (a) => {
    if (!m.to) { a.flashMsg('Pick who it goes to first.'); a.render(); return; }
    const dest = await a.repo.load(m.to.slot);
    if (!dest) { a.say(red(`${m.to.name} cannot be found.`)); a.render(); return; }
    const stacks = a.g.state.inventory.stacks;
    const attachments = [...m.attach].sort((x, y) => x - y).filter((slot) => stacks[slot]).map((slot) => {
      const stk = stacks[slot];
      return { entry: stk.item, quantity: stk.count, slotIndex: slot, ...(hasIdentity(stk) ? { instance: stk } : {}), ...(isConjuredItem(a.ds.item(stk.item)) ? { conjured: true } : {}) };
    });
    const r = a.g.sendMailBatch({
      recipientName: dest.state.char.name, recipientMailbox: dest.state.mailbox ?? [],
      subject: m.subject || (attachments.length ? a.itemName(attachments[0].entry) : 'A letter'), body: '',
      enclosedMoney: m.cod ? 0 : m.money, cod: m.cod ? m.money : 0, attachments, nowMs: Date.now(),
      crossFaction: areHostile(a.ds, a.ch.race, dest.state.char.race),
    });
    if (!a.result(r)) { a.render(); return; }
    dest.state.mailbox = r.destMailbox;
    dest.updatedAt = Date.now();
    await a.repo.save(dest);
    a.say(green(`Mail sent to ${dest.state.char.name}.`) + dim(`  Postage ${coinText(r.cost)}.`));
    await a.persist();
    if (a.top()?.id === 'mail-compose') a.pop(); else a.render();
  };
  const view = {
    id: 'mail-compose', title: 'Send mail', hint: 'Enter: change / enclose',
    keys: { S: { hint: 'send', fn: (a) => { view.sending = send(a); } } },
    rows(a) {
      const rows = [{ text: bold('Send mail'), header: true }, { text: '', header: true }];
      rows.push({ text: `To       ${m.to ? cyan(m.to.name) : dim('pick one of your characters')}`, act: (a2) => { view.picking = pickAlt(a2, (s) => { m.to = s; }); } });
      rows.push({ text: `Subject  ${m.subject || dim('(the first item, or "A letter")')}`, act: (a2) => a2.prompt('Subject: ', (t) => { m.subject = t.slice(0, 64); a2.render(); }, m.subject) });
      rows.push({ text: `${m.cod ? 'COD     ' : 'Money   '} ${m.money ? coinText(m.money) : dim('none')}`, act: (a2) => a2.prompt(m.cod ? 'Cash on delivery: ' : 'Money to send: ', (t) => { const c = parseMoney(t); if (c == null) a2.flashMsg('Say a price like 2g 50s or 250.'); else m.money = c; a2.render(); }) });
      rows.push({ text: `Pay      ${m.cod ? red('cash on delivery: they pay the money to take the items') : dim('the money is a gift')}`, act: () => { m.cod = !m.cod; } });
      rows.push({ text: '', header: true }, { text: `Enclose  ${dim(`${m.attach.size}/${MAX_MAIL_ITEMS}`)}`, header: true });
      a.g.state.inventory.stacks.forEach((s, slot) => {
        const it = a.ds.item(s.item);
        const on = m.attach.has(slot);
        rows.push({
          text: `${on ? green('✓') : dim('·')} ${qualityPaint(it?.quality)(it?.name ?? s.item)}${s.count > 1 ? ` x${s.count}` : ''}`, data: { slot },
          act: () => { if (on) m.attach.delete(slot); else if (m.attach.size < MAX_MAIL_ITEMS) m.attach.add(slot); else a.flashMsg(`At most ${MAX_MAIL_ITEMS} stacks in one letter.`); },
        });
      });
      rows.push({ text: '', header: true }, { text: green(`Send  ${dim(`S, postage ${coinText(MAIL_POSTAGE_COPPER)}`)}`), act: () => { view.sending = send(a); } });
      return rows;
    },
  };
  return view;
}

async function pickAlt(app, onPick) {
  const saves = (await app.repo.list()).filter((s) => !sameName(s.name, app.ch.name));
  if (!saves.length) { app.flashMsg('You have no other characters to write to.'); app.render(); return; }
  app.pick('Send it to', saves.map((s) => ({ label: `${s.name}  ${dim(`L${s.level}`)}`, value: s })), onPick);
}
