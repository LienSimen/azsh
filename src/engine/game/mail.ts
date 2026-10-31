// Player mailbox facade. Pattern C: createMailModule(ctx) — no import of game.ts.
// Cite: MailHandler.cpp send/take/delete/return; Postal open.lua Open All.

import {
  appendSystemMail,
  deleteMail as doDeleteMail,
  listDeliveredMail,
  mailboxAsInventory,
  markMailRead as doMarkRead,
  nextMailId,
  openMailWalk,
  purgeExpiredMail,
  returnMail as doReturnMail,
  sendMail,
  takeMailItem as doTakeItem,
  takeMailMoney as doTakeMoney,
  unreadDeliveredCount,
  MAIL_CREATURE,
  MAIL_NORMAL,
  POSTAL_ATTACHMENTS_MAX,
  type MailAttachment,
  type Mailbox,
} from '../../domain/economy/mail.ts';
import { canAcceptUnique, uniqueSignalsOf } from '../../domain/items/itemRestrictions.ts';
import { countItem } from '../../domain/items/inventory.ts';
import { isConjuredItem } from '../../domain/items/itemBonding.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import { rollLootDeep } from '../../domain/items/loot.ts';
import { mulberry32, hashSeed, type Rng } from '../core/rng.ts';
import type { DataStore } from '../../data/dataStore.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';
import type { ItemInstance } from '../../domain/items/itemInstance.ts';

function stackableOf(ctx: GameCtx): (entry: number) => number {
  return (entry) => ctx.ds.item(entry)?.stackable ?? 1;
}

function storeCheckOf(ctx: GameCtx) {
  return (entry: number, quantity: number, instance?: ItemInstance): 'ok' | 'full' | 'unique' => {
    const def = ctx.ds.item(entry);
    if (def) {
      // This attachment is still in the mailbox. Count the OTHER copies only, or taking
      // the one unique you already overflowed would refuse as if you already held two.
      const mailHave = countItem(mailboxAsInventory(ctx.state.mailbox ?? []), entry);
      const others = Math.max(0, mailHave - quantity);
      const acc = canAcceptUnique(
        ctx.state.inventory,
        ctx.state.char,
        entry,
        uniqueSignalsOf(def),
        instance,
        {
          bank: ctx.state.bank,
          keyring: ctx.state.keyring,
          mailbox: others > 0 ? { stacks: [{ item: entry, count: others }] } : { stacks: [] },
        },
      );
      if (!acc.ok) return 'unique';
      if (acc.room != null && Number.isFinite(acc.room) && acc.room < quantity) return 'unique';
    }
    return 'ok';
  };
}

function purge(ctx: GameCtx, nowMs: number): void {
  const p = purgeExpiredMail(ctx.state.mailbox ?? [], nowMs);
  if (p.expired.length) ctx.state.mailbox = p.mailbox;
}

function stampConjured(ctx: GameCtx, atts: readonly MailAttachment[]): MailAttachment[] {
  return atts.map((a) => {
    const def = ctx.ds.item(a.entry);
    return def && isConjuredItem(def) ? { ...a, conjured: true } : a;
  });
}

export function createMailModule(ctx: GameCtx): Pick<
  Game,
  | 'collectMail'
  | 'listMail'
  | 'unreadMailCount'
  | 'markMailRead'
  | 'takeMailItem'
  | 'takeMailMoney'
  | 'deleteMail'
  | 'returnMail'
  | 'sendMailTo'
  | 'sendMailBatch'
> {
  const { state, log, cap } = ctx;
  return {
    listMail(nowMs) {
      purge(ctx, nowMs);
      return listDeliveredMail(state.mailbox ?? [], nowMs);
    },

    unreadMailCount(nowMs) {
      purge(ctx, nowMs);
      return unreadDeliveredCount(state.mailbox ?? [], nowMs);
    },

    markMailRead(mailId) {
      const next = doMarkRead(state.mailbox ?? [], mailId);
      state.mailbox = next;
      return { ok: true };
    },

    takeMailItem(mailId, nowMs) {
      const now = nowMs ?? Date.now();
      purge(ctx, now);
      const res = doTakeItem(state.char.gold, state.inventory, state.mailbox ?? [], mailId, {
        cap: cap(),
        itemStackable: stackableOf(ctx),
        nowMs: now,
        nextId: nextMailId(state.mailbox ?? []),
        storeCheck: storeCheckOf(ctx),
      });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot take item' };
      state.char.gold = res.gold;
      state.inventory = res.inventory;
      state.mailbox = res.mailbox;
      log('Took an item from the mail.');
      return { ok: true, remittance: res.remittance };
    },

    takeMailMoney(mailId, nowMs) {
      const now = nowMs ?? Date.now();
      purge(ctx, now);
      const res = doTakeMoney(state.char.gold, state.inventory, state.mailbox ?? [], mailId, { nowMs: now });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot take money' };
      const taken = res.gold - state.char.gold;
      state.char.gold = res.gold;
      state.mailbox = res.mailbox;
      if (taken > 0) log(`Took ${moneyMarked(taken)} from the mail.`);
      return { ok: true, taken };
    },

    deleteMail(mailId, nowMs) {
      const now = nowMs ?? Date.now();
      purge(ctx, now);
      const res = doDeleteMail(state.mailbox ?? [], mailId, { nowMs: now });
      if (!res.ok) return { ok: false, reason: res.reason ?? 'Cannot delete' };
      state.mailbox = res.mailbox;
      log('Deleted a mail.');
      return { ok: true };
    },

    returnMail(mailId, nowMs) {
      const now = nowMs ?? Date.now();
      purge(ctx, now);
      const res = doReturnMail(state.mailbox ?? [], mailId, {
        nowMs: now,
        nextId: nextMailId(state.mailbox ?? []),
        fromName: state.char.name,
      });
      if (!res.ok || !res.returned || !res.to) {
        return { ok: false, reason: res.reason ?? 'Cannot return this mail' };
      }
      state.mailbox = res.mailbox;
      log(`Returned mail to ${res.to}.`);
      return { ok: true, to: res.to, mail: res.returned };
    },

    collectMail() {
      const now = Date.now();
      purge(ctx, now);
      const ids = listDeliveredMail(state.mailbox ?? [], now).map((m) => m.id);
      const walk = openMailWalk(state.char.gold, state.inventory, state.mailbox ?? [], ids, {
        cap: cap(),
        itemStackable: stackableOf(ctx),
        nowMs: now,
        storeCheck: storeCheckOf(ctx),
      });
      state.char.gold = walk.gold;
      state.inventory = walk.inventory;
      state.mailbox = walk.mailbox;
      const moved = walk.movedItems + walk.movedMoney;
      if (walk.abortedFull) log('Inventory full. Aborting.');
      else if (moved > 0) log(`Collected ${moved} item stack${moved > 1 ? 's' : ''} from the mail.`);
      return { ok: true, moved, abortedFull: walk.abortedFull };
    },

    sendMailTo(opts) {
      const atts = stampConjured(ctx, opts.attachments ?? []);
      const dest = opts.recipientMailbox;
      const res = sendMail(state.char.gold, state.inventory, dest, {
        id: nextMailId(dest),
        sender: state.char.name,
        recipientName: opts.recipientName,
        subject: opts.subject,
        body: opts.body,
        enclosedMoney: opts.enclosedMoney,
        cod: opts.cod,
        attachments: atts,
        nowMs: opts.nowMs,
        crossFaction: opts.crossFaction,
        itemStackable: stackableOf(ctx),
      });
      if (!res.ok || !res.mail) return { ok: false, reason: res.reason ?? 'Cannot send' };
      state.char.gold = res.senderGold;
      state.inventory = res.senderInventory;
      log(`Mail sent to ${opts.recipientName}.`);
      return { ok: true, mail: res.mail, destMailbox: res.mailbox, cost: res.cost };
    },

    sendMailBatch(opts) {
      const raw = opts.attachments.slice(0, POSTAL_ATTACHMENTS_MAX);
      const atts = stampConjured(ctx, raw);
      const dest = opts.recipientMailbox;
      const res = sendMail(state.char.gold, state.inventory, dest, {
        id: nextMailId(dest),
        sender: state.char.name,
        recipientName: opts.recipientName,
        subject: opts.subject,
        body: opts.body,
        enclosedMoney: opts.enclosedMoney,
        cod: opts.cod,
        attachments: atts,
        nowMs: opts.nowMs,
        crossFaction: opts.crossFaction,
        itemStackable: stackableOf(ctx),
      });
      if (!res.ok || !res.mail) return { ok: false, reason: res.reason ?? 'Cannot send' };
      state.char.gold = res.senderGold;
      state.inventory = res.senderInventory;
      log(`Mail sent to ${opts.recipientName}.`);
      return { ok: true, mails: [res.mail], destMailbox: res.mailbox, cost: res.cost };
    },
  };
}

/** dbscript SEND_MAIL — template loot + delay. Cite: ScriptMgr.cpp:2828–2843. */
export function mailFromTemplate(
  mailbox: Mailbox,
  lootTable: DataStore['lootTable'],
  rec: { mailTemplateId: number; deliverDelay: number; money?: number },
  opts: { nowMs: number; sender: string; rng: Rng },
): Mailbox {
  if (rec.mailTemplateId <= 0) return mailbox;
  const rows = lootTable(`mail:${rec.mailTemplateId}`) ?? [];
  const drops = rows.length ? rollLootDeep(rows, (id) => lootTable(id), opts.rng) : [];
  return appendSystemMail(mailbox, {
    sender: opts.sender,
    subject: '',
    money: rec.money ?? 0,
    nowMs: opts.nowMs,
    delaySec: rec.deliverDelay > 0 ? rec.deliverDelay : 0,
    messageType: MAIL_CREATURE,
    attachments: drops.map((d) => ({ entry: d.item, quantity: d.count })),
  }).mailbox;
}

export function deliverScriptMail(
  ctx: GameCtx,
  rec: { mailTemplateId: number; deliverDelay: number; altSender?: number; money?: number },
  nowMs: number,
  senderName: string,
): void {
  const rng = mulberry32(hashSeed(ctx.state.rngSeed, ctx.state.fightCounter++));
  ctx.state.mailbox = mailFromTemplate(ctx.state.mailbox ?? [], (id) => ctx.ds.lootTable(id), rec, {
    nowMs,
    sender: senderName,
    rng,
  });
}

/** Bags-full / AH overflow helper. */
export function mailOverflow(
  ctx: GameCtx,
  opts: {
    item: number;
    quantity: number;
    instance?: ItemInstance;
    nowMs?: number;
    sender?: string;
    subject?: string;
    messageType?: number;
  },
): void {
  const applied = appendSystemMail(ctx.state.mailbox ?? [], {
    sender: opts.sender ?? 'Mailbox',
    subject: opts.subject ?? '',
    nowMs: opts.nowMs ?? Date.now(),
    messageType: opts.messageType ?? MAIL_NORMAL,
    attachments: [{
      entry: opts.item,
      quantity: opts.quantity,
      ...(opts.instance ? { instance: opts.instance } : {}),
    }],
  });
  ctx.state.mailbox = applied.mailbox;
}
