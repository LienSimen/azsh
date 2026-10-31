// Player mailbox pure rules: postage 30c, COD, the 100-mail cap, take/delete/return.
// Crate mail holds the Postal tray (vanilla Mail.h is 1). Postage: MailHandler.cpp:134.

import type { Inventory, ItemStack } from '../items/inventory.ts';
import { addItem, addInstance, removeItem, takeStack, countItem, canFit } from '../items/inventory.ts';
import type { ItemInstance } from '../items/itemInstance.ts';
import { copyInstance } from '../items/itemInstance.ts';
import { canTradeItem } from '../items/itemBonding.ts';
import type { Delivery } from './auction.ts';

/** Flat postage in copper (MailHandler.cpp:134). */
export const MAIL_POSTAGE_COPPER = 30;

// Recipient mailbox soft cap. CMaNGOS rejects when `mails_count > 100` (MailHandler.cpp:162–166). Intent
// comment: "do not allow … more than 100 mails".
export const MAILBOX_CAP = 100;
/** Alias for Wave E / docs naming. */
export const MAIL_BOX_CAP = MAILBOX_CAP;

/** Stacks one mail may carry. Vanilla Mail.h is 1; this crate uses the Postal tray. */
export const MAX_MAIL_ITEMS = 21;

/** Postal send-queue slots (Postal.lua:25). All of them ride one mail. */
export const POSTAL_ATTACHMENTS_MAX = MAX_MAIL_ITEMS;

/** Postal empty-subject fallback. Cite: Postal.lua:440. */
export const MAIL_NO_SUBJECT = '[No Subject]';

/** COD mails expire after 3 days; normal after 30 (Mail.cpp ~311). Seconds. */
export const MAIL_EXPIRE_COD_SEC = 3 * 24 * 60 * 60;
export const MAIL_EXPIRE_NORMAL_SEC = 30 * 24 * 60 * 60;
/** Auction sale-pending / empty-auction note. Mail.cpp:304 HOUR. */
export const MAIL_EXPIRE_AUCTION_PENDING_SEC = 60 * 60;
/** Battlemaster reward mail. Mail.cpp:307 DAY. */
export const MAIL_EXPIRE_BATTLEMASTER_SEC = 24 * 60 * 60;

/** Mail.h MailMessageType. */
export const MAIL_NORMAL = 0;
export const MAIL_AUCTION = 2;
export const MAIL_CREATURE = 3;

/** Stationery.dbc ids used in Mail.h. */
export const MAIL_STATIONERY_DEFAULT = 41;
export const MAIL_STATIONERY_AUCTION = 62;

/** Mail.h MailCheckMask. */
export const MAIL_CHECK_MASK_NONE = 0x00;
export const MAIL_CHECK_MASK_READ = 0x01;
export const MAIL_CHECK_MASK_RETURNED = 0x02;
export const MAIL_CHECK_MASK_COPIED = 0x04;
export const MAIL_CHECK_MASK_COD_PAYMENT = 0x08;
export const MAIL_CHECK_MASK_HAS_BODY = 0x10;

export interface MailAttachment {
  entry: number;
  quantity: number;
  // Full identity of the enclosed item, so a mailed instance is delivered as itself and its id is
  // NOT re-rolled. Absent is plain entry+quantity for mats and stackables.
  instance?: ItemInstance;
  /** Sender bag slot when composing (Postal attach grid). Not serialized on the wire mail. */
  slotIndex?: number;
  /** ITEM_FLAG_CONJURED on the def — send-time refuse. Cite: MailHandler.cpp:199. */
  conjured?: boolean;
}

/** One mailbox message (serializable plain data). */
export interface MailMessage {
  id: number;
  sender: string;
  subject: string;
  body: string;
  /** Enclosed gold paid to the recipient on take (copper). */
  money: number;
  /** Cash-on-delivery: recipient pays this to collect items (copper). 0 = none. */
  cod: number;
  attachments: MailAttachment[];
  /** Unix-ms when the mail was sent / becomes readable. */
  deliverAt: number;
  /** Unix-ms when the mail expires. */
  expiresAt: number;
  /** Mail.h MailMessageType. Absent on pre-wire rows = MAIL_NORMAL. */
  messageType?: number;
  /** Stationery.dbc. Absent = MAIL_STATIONERY_DEFAULT. */
  stationery?: number;
  /** MailCheckMask bits. Absent = none. */
  checked?: number;
  /** Original recipient (COD remittance / return-to-sender). */
  recipient?: string;
}

export type Mailbox = MailMessage[];

export function emptyMailbox(): Mailbox {
  return [];
}

export function nextMailId(mailbox: readonly MailMessage[]): number {
  let max = 0;
  for (const m of mailbox) if (m.id > max) max = m.id;
  return max + 1;
}

/** True when a saved row is the v6 Delivery shape (`item`/`quantity`, no `id`/`attachments`). */
export function isLegacyDelivery(raw: unknown): raw is Delivery {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return typeof r.item === 'number' && typeof r.quantity === 'number' && !Array.isArray(r.attachments);
}

export function isMailMessage(raw: unknown): raw is MailMessage {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return typeof r.id === 'number' && Array.isArray(r.attachments);
}

// Wrap a v6 Delivery as a MailMessage (AH/loot overflow). 30-day expiry from `nowMs`. Cite: Mail.cpp:311
// default non-COD expiry.
export function mailFromDelivery(
  d: Delivery,
  id: number,
  nowMs: number,
  opts?: { sender?: string; subject?: string; messageType?: number; stationery?: number },
): MailMessage {
  const att: MailAttachment = {
    entry: d.item,
    quantity: d.quantity,
    ...(d.instance ? { instance: copyInstance(d.instance, d.quantity) } : {}),
  };
  return {
    id,
    sender: opts?.sender ?? 'Mailbox',
    subject: opts?.subject ?? '',
    body: '',
    money: 0,
    cod: 0,
    attachments: [att],
    deliverAt: nowMs,
    expiresAt: nowMs + MAIL_EXPIRE_NORMAL_SEC * 1000,
    messageType: opts?.messageType ?? MAIL_NORMAL,
    stationery: opts?.stationery ?? MAIL_STATIONERY_DEFAULT,
    checked: MAIL_CHECK_MASK_NONE,
  };
}

/** Normalize a saved mailbox (v6 Delivery[] or MailMessage[]) to MailMessage[]. */
export function migrateMailbox(raw: unknown, nowMs: number): Mailbox {
  if (!Array.isArray(raw)) return [];
  const out: MailMessage[] = [];
  let next = 1;
  for (const row of raw) {
    if (isMailMessage(row)) {
      out.push(row);
      if (row.id >= next) next = row.id + 1;
    } else if (isLegacyDelivery(row)) {
      out.push(mailFromDelivery(row, next, nowMs));
      next += 1;
    }
  }
  return out;
}

// Copper the sender must hold to dispatch: enclosed money + 30c postage. MailHandler.cpp:134 `reqmoney =
// money + 30`.
export function mailSendCost(enclosedMoney: number = 0): number {
  const money = Math.max(0, Math.floor(enclosedMoney));
  return money + MAIL_POSTAGE_COPPER;
}

/** Wave E alias — same as mailSendCost (postageCost = 30 + enclosed). */
export const postageCost = mailSendCost;

// Postal batch postage: 30c per mail, enclosed gold on the first only. Cite: Postal.lua:36
// GetSendMailPrice() * GetNumMails(); :461–471 money on first. N=0 (body/gold only) still sends one mail.
export function postalBatchCost(mailCount: number, enclosedMoney: number = 0): number {
  const n = Math.max(1, Math.floor(mailCount));
  return mailSendCost(enclosedMoney) + MAIL_POSTAGE_COPPER * (n - 1);
}

/** Postal.lua:440–443 subject, with ` (Part i of N)` when N>1. */
export function postalBatchSubject(subject: string, index: number, total: number): string {
  const base = subject.trim() ? subject.trim() : MAIL_NO_SUBJECT;
  if (total <= 1) return base;
  return `${base} (Part ${index} of ${total})`;
}

/** Seconds until expiry from send time. Mail.cpp: auction empty → HOUR; COD → 3 * DAY; else 30 * DAY. */
export function mailExpireDelaySec(
  cod: number,
  messageType: number = MAIL_NORMAL,
  hasItemsOrMoney: boolean = true,
): number {
  if (messageType === MAIL_AUCTION && !hasItemsOrMoney) return MAIL_EXPIRE_AUCTION_PENDING_SEC;
  return cod > 0 ? MAIL_EXPIRE_COD_SEC : MAIL_EXPIRE_NORMAL_SEC;
}

export interface MailSendCheck {
  ok: boolean;
  reason?: string;
  cost: number;
}

// Validate a send attempt (postage, COD rules, attachment cap, recipient mailbox size). Does not mutate
// inventory/gold — caller applies on success.
export function canSendMail(opts: {
  senderGold: number;
  enclosedMoney?: number;
  cod?: number;
  attachments?: readonly MailAttachment[];
  /** Current message count in the recipient's mailbox. */
  recipientMailCount: number;
  senderName?: string;
  recipientName?: string;
  /** True when sender and recipient factions differ. Default false (same / unknown). */
  crossFaction?: boolean;
}): MailSendCheck {
  const money = Math.max(0, Math.floor(opts.enclosedMoney ?? 0));
  const cod = Math.max(0, Math.floor(opts.cod ?? 0));
  const atts = opts.attachments ?? [];

  if (opts.recipientName != null && opts.senderName != null) {
    if (opts.recipientName.trim().toLowerCase() === opts.senderName.trim().toLowerCase()) {
      return { ok: false, reason: 'Cannot send mail to yourself', cost: 0 };
    }
  }
  if (opts.crossFaction) {
    return { ok: false, reason: 'You cannot send mail across factions', cost: 0 };
  }
  if (money > 0 && cod > 0) {
    return { ok: false, reason: 'Cannot send money and COD together', cost: 0 };
  }
  if (atts.length > MAX_MAIL_ITEMS) {
    return { ok: false, reason: 'Too many attachments', cost: 0 };
  }
  for (const a of atts) {
    if (a.instance && !canTradeItem(!!a.instance.bound)) {
      return { ok: false, reason: 'That item is soulbound', cost: 0 };
    }
    if (a.conjured) {
      return { ok: false, reason: 'Cannot mail conjured items', cost: 0 };
    }
    if (cod > 0 && a.instance?.wrappedItemEntry) {
      return { ok: false, reason: 'Cannot send wrapped items COD', cost: 0 };
    }
  }
  // MailHandler.cpp:162 — reject when count > 100 (allows exactly 100 → becomes 101).
  if (opts.recipientMailCount > MAILBOX_CAP) {
    return { ok: false, reason: 'Recipient mailbox full', cost: 0 };
  }

  const cost = mailSendCost(money);
  if (opts.senderGold < cost) {
    return { ok: false, reason: 'Not enough money', cost };
  }
  return { ok: true, cost };
}

export interface MailSendResult {
  ok: boolean;
  reason?: string;
  /** Sender gold after postage + enclosed money. */
  senderGold: number;
  /** Inventory after removing attachments (unchanged on failure). */
  senderInventory: Inventory;
  mailbox: Mailbox;
  mail?: MailMessage;
  cost: number;
}

function stampMail(opts: {
  id: number;
  sender: string;
  subject?: string;
  body?: string;
  money: number;
  cod: number;
  attachments: readonly MailAttachment[];
  nowMs: number;
  delaySec?: number;
  messageType?: number;
  stationery?: number;
  checked?: number;
  recipient?: string;
}): MailMessage {
  const money = opts.money;
  const cod = opts.cod;
  const atts = opts.attachments;
  const type = opts.messageType ?? MAIL_NORMAL;
  const hasItemsOrMoney = atts.length > 0 || money > 0;
  const delaySec = opts.delaySec ?? 0;
  const deliverAt = opts.nowMs + delaySec * 1000;
  const expireSec = mailExpireDelaySec(cod, type, hasItemsOrMoney);
  return {
    id: opts.id,
    sender: opts.sender,
    subject: opts.subject ?? '',
    body: opts.body ?? '',
    money,
    cod,
    attachments: atts.map((a) => ({
      entry: a.entry,
      quantity: a.quantity,
      ...(a.instance ? { instance: copyInstance(a.instance, a.quantity) } : {}),
    })),
    deliverAt,
    expiresAt: deliverAt + expireSec * 1000,
    messageType: type,
    stationery: opts.stationery ?? (type === MAIL_AUCTION ? MAIL_STATIONERY_AUCTION : MAIL_STATIONERY_DEFAULT),
    checked: opts.checked ?? (opts.body ? MAIL_CHECK_MASK_HAS_BODY : MAIL_CHECK_MASK_NONE),
    ...(opts.recipient ? { recipient: opts.recipient } : {}),
  };
}

// Build and append a mail, charging postage plus enclosed gold and removing attachments from the
// sender's bags. Pure: returns new gold, inventory and mailbox. itemStackable sizes each stack.
export function sendMail(
  senderGold: number,
  senderInventory: Inventory,
  mailbox: Mailbox,
  opts: {
    id: number;
    sender: string;
    recipientName?: string;
    subject?: string;
    body?: string;
    enclosedMoney?: number;
    cod?: number;
    attachments?: readonly MailAttachment[];
    nowMs: number;
    delaySec?: number;
    messageType?: number;
    stationery?: number;
    crossFaction?: boolean;
    itemStackable: (entry: number) => number;
  },
): MailSendResult {
  const money = Math.max(0, Math.floor(opts.enclosedMoney ?? 0));
  const cod = Math.max(0, Math.floor(opts.cod ?? 0));
  const atts = opts.attachments ?? [];

  const check = canSendMail({
    senderGold,
    enclosedMoney: money,
    cod,
    attachments: atts,
    recipientMailCount: mailbox.length,
    senderName: opts.sender,
    recipientName: opts.recipientName,
    crossFaction: opts.crossFaction,
  });
  if (!check.ok) {
    return {
      ok: false,
      reason: check.reason,
      senderGold,
      senderInventory,
      mailbox,
      cost: check.cost,
    };
  }

  let inv = senderInventory;
  for (const a of atts) {
    if (a.quantity < 1) {
      return {
        ok: false, reason: 'Invalid attachment', senderGold, senderInventory, mailbox, cost: 0,
      };
    }
    if (a.slotIndex != null) {
      const stack = inv.stacks[a.slotIndex];
      if (!stack || stack.item !== a.entry || stack.count < a.quantity) {
        return {
          ok: false, reason: 'Missing attachment item', senderGold, senderInventory, mailbox, cost: 0,
        };
      }
    } else if (countItem(inv, a.entry) < a.quantity) {
      return {
        ok: false, reason: 'Missing attachment item', senderGold, senderInventory, mailbox, cost: 0,
      };
    }
  }
  // Take from highest slotIndex first so earlier indices stay stable.
  const bySlot = [...atts].sort((a, b) => (b.slotIndex ?? -1) - (a.slotIndex ?? -1));
  for (const a of bySlot) {
    if (a.slotIndex != null) {
      const [next, taken] = takeStack(inv, a.slotIndex, a.quantity);
      if (!taken) {
        return {
          ok: false, reason: 'Missing attachment item', senderGold, senderInventory, mailbox, cost: 0,
        };
      }
      inv = next;
    } else {
      const [next] = removeItem(inv, a.entry, a.quantity);
      inv = next;
    }
  }

  const cost = check.cost;
  const mail = stampMail({
    id: opts.id,
    sender: opts.sender,
    subject: opts.subject,
    body: opts.body,
    money,
    cod,
    attachments: atts,
    nowMs: opts.nowMs,
    delaySec: opts.delaySec,
    messageType: opts.messageType,
    stationery: opts.stationery,
    recipient: opts.recipientName,
  });

  return {
    ok: true,
    senderGold: senderGold - cost,
    senderInventory: inv,
    mailbox: [...mailbox, mail],
    mail,
    cost,
  };
}

export interface MailTakeResult {
  ok: boolean;
  reason?: string;
  gold: number;
  inventory: Inventory;
  mailbox: Mailbox;
  /** COD gold to remit to `to` (MailHandler.cpp:472–476). */
  remittance?: { to: string; mail: MailMessage };
}

function findDelivered(
  mailbox: Mailbox,
  mailId: number,
  nowMs?: number,
): { idx: number; mail: MailMessage } | { idx: -1; mail: null } {
  const idx = mailbox.findIndex((m) => m.id === mailId);
  if (idx < 0) return { idx: -1, mail: null };
  const m = mailbox[idx]!;
  if (nowMs != null && m.deliverAt > nowMs) return { idx: -1, mail: null };
  return { idx, mail: m };
}

function replaceMail(mailbox: Mailbox, idx: number, next: MailMessage): Mailbox {
  const out = mailbox.slice();
  out[idx] = next;
  return out;
}

// Collect money and items from a mail. COD is charged from the recipient's gold and the caller
// remits it to the sender. The take-everything path; the UI prefers takeMailItem/takeMailMoney.
export function takeMail(
  gold: number,
  inventory: Inventory,
  mailbox: Mailbox,
  mailId: number,
  opts: {
    cap?: number;
    itemStackable: (entry: number) => number;
    nowMs?: number;
    nextId?: number;
  },
): MailTakeResult {
  const item = takeMailItem(gold, inventory, mailbox, mailId, opts);
  if (!item.ok && item.reason !== 'Mail has no items') {
    return item;
  }
  const mid = item.ok ? item : { gold, inventory, mailbox };
  const money = takeMailMoney(mid.gold, mid.inventory, mid.mailbox, mailId, opts);
  if (!money.ok && money.reason !== 'Mail has no money') {
    return { ...money, remittance: item.remittance };
  }
  const after = money.ok ? money : mid;
  const gone = after.mailbox.find((m) => m.id === mailId);
  let box = after.mailbox;
  if (gone && gone.attachments.length === 0 && gone.money <= 0 && gone.cod <= 0) {
    box = after.mailbox.filter((m) => m.id !== mailId);
  }
  return { ok: true, gold: after.gold, inventory: after.inventory, mailbox: box, remittance: item.remittance };
}

/** Take every attachment on the mail. Leaves the mail row. Cite: MailHandler.cpp:404–498. */
export function takeMailItem(
  gold: number,
  inventory: Inventory,
  mailbox: Mailbox,
  mailId: number,
  opts: {
    cap?: number;
    itemStackable: (entry: number) => number;
    nowMs?: number;
    nextId?: number;
    /** 'full' aborts Postal Open All; 'unique' skips this mail. */
    storeCheck?: (entry: number, quantity: number, instance?: ItemInstance) => 'ok' | 'full' | 'unique';
  },
): MailTakeResult {
  const found = findDelivered(mailbox, mailId, opts.nowMs);
  if (found.idx < 0 || !found.mail) {
    return { ok: false, reason: 'Mail not found', gold, inventory, mailbox };
  }
  const m = found.mail;
  if (m.attachments.length === 0) {
    return { ok: false, reason: 'Mail has no items', gold, inventory, mailbox };
  }
  if (m.cod > 0 && gold < m.cod) {
    return { ok: false, reason: 'Not enough money for COD', gold, inventory, mailbox };
  }

  let invProbe = inventory;
  for (const a of m.attachments) {
    const store = opts.storeCheck?.(a.entry, a.quantity, a.instance);
    if (store === 'full') {
      return { ok: false, reason: 'Not enough bag space', gold, inventory, mailbox };
    }
    if (store === 'unique') {
      return { ok: false, reason: 'You already have the maximum amount of that item', gold, inventory, mailbox };
    }
    const stack = opts.itemStackable(a.entry);
    if (!canFit(invProbe, a.entry, a.quantity, stack, opts.cap)) {
      return { ok: false, reason: 'Not enough bag space', gold, inventory, mailbox };
    }
    invProbe = addItem(invProbe, a.entry, a.quantity, stack);
  }

  let inv = inventory;
  for (const a of m.attachments) {
    inv = a.instance
      ? addInstance(inv, copyInstance(a.instance, a.quantity), opts.itemStackable(a.entry))
      : addItem(inv, a.entry, a.quantity, opts.itemStackable(a.entry));
  }

  let g = gold;
  let remittance: MailTakeResult['remittance'];
  if (m.cod > 0) {
    g -= m.cod;
    if (m.sender) {
      const pay = stampMail({
        id: opts.nextId ?? nextMailId(mailbox),
        sender: m.recipient ?? '',
        subject: m.subject,
        body: '',
        money: m.cod,
        cod: 0,
        attachments: [],
        nowMs: opts.nowMs ?? m.deliverAt,
        messageType: MAIL_NORMAL,
        stationery: MAIL_STATIONERY_DEFAULT,
        checked: MAIL_CHECK_MASK_COD_PAYMENT,
        recipient: m.sender,
      });
      remittance = { to: m.sender, mail: pay };
    }
  }

  const next: MailMessage = { ...m, attachments: [], cod: 0 };
  return {
    ok: true,
    gold: g,
    inventory: inv,
    mailbox: replaceMail(mailbox, found.idx, next),
    remittance,
  };
}

/** Take enclosed gold. Leaves the mail row. Cite: MailHandler.cpp:502–533. */
export function takeMailMoney(
  gold: number,
  inventory: Inventory,
  mailbox: Mailbox,
  mailId: number,
  opts?: { nowMs?: number },
): MailTakeResult {
  const found = findDelivered(mailbox, mailId, opts?.nowMs);
  if (found.idx < 0 || !found.mail) {
    return { ok: false, reason: 'Mail not found', gold, inventory, mailbox };
  }
  const m = found.mail;
  if (m.money <= 0) {
    return { ok: false, reason: 'Mail has no money', gold, inventory, mailbox };
  }
  const next: MailMessage = { ...m, money: 0 };
  return {
    ok: true,
    gold: gold + m.money,
    inventory,
    mailbox: replaceMail(mailbox, found.idx, next),
  };
}

/** Delete a mail. COD is refused. Remaining attachments are destroyed. Cite: MailHandler.cpp:313–337. */
export function deleteMail(
  mailbox: Mailbox,
  mailId: number,
  opts?: { nowMs?: number },
): { ok: boolean; reason?: string; mailbox: Mailbox } {
  const found = findDelivered(mailbox, mailId, opts?.nowMs);
  if (found.idx < 0 || !found.mail) {
    return { ok: false, reason: 'Mail not found', mailbox };
  }
  if (found.mail.cod > 0) {
    return { ok: false, reason: 'Cannot delete COD mail', mailbox };
  }
  return { ok: true, mailbox: mailbox.filter((_, i) => i !== found.idx) };
}

/** Delete every delivered id. COD rows are skipped, not a stop. */
export function deleteMails(
  mailbox: Mailbox,
  ids: readonly number[],
  opts?: { nowMs?: number },
): { mailbox: Mailbox; deleted: number; skippedCod: number } {
  let box = mailbox;
  let deleted = 0;
  let skippedCod = 0;
  for (const id of ids) {
    const r = deleteMail(box, id, opts);
    if (!r.ok) {
      if (r.reason === 'Cannot delete COD mail') skippedCod += 1;
      continue;
    }
    box = r.mailbox;
    deleted += 1;
  }
  return { mailbox: box, deleted, skippedCod };
}

/** Count of `entry` sitting in delivered, non-COD attachments. Bags-full overflow lives here. */
export function countMailItem(
  mailbox: readonly MailMessage[],
  entry: number,
  nowMs = Date.now(),
): number {
  let n = 0;
  for (const m of listDeliveredMail(mailbox, nowMs)) {
    if (m.cod > 0) continue;
    for (const a of m.attachments) {
      if (a.entry === entry) n += a.quantity;
    }
  }
  return n;
}

// Delivered attachments as a read-only inventory. Overflow loot is still owned — quest deliver
// and unique MaxCount must see it the way bags and the keyring already do.
export function mailboxAsInventory(
  mailbox: readonly MailMessage[],
  nowMs = Date.now(),
): Inventory {
  const stacks: ItemStack[] = [];
  for (const m of listDeliveredMail(mailbox, nowMs)) {
    if (m.cod > 0) continue;
    for (const a of m.attachments) {
      stacks.push(a.instance
        ? { ...copyInstance(a.instance, a.quantity), item: a.entry, count: a.quantity }
        : { item: a.entry, count: a.quantity });
    }
  }
  return { stacks };
}

/** Spend `count` of `entry` from delivered non-COD attachments. Empty rows drop. */
export function spendMailItem(
  mailbox: Mailbox,
  entry: number,
  count: number,
  nowMs = Date.now(),
): { mailbox: Mailbox; removed: number } {
  let need = Math.max(0, count);
  if (need <= 0) return { mailbox, removed: 0 };
  const next: Mailbox = [];
  let removed = 0;
  for (const m of mailbox) {
    if (need <= 0 || m.cod > 0 || m.deliverAt > nowMs) {
      next.push(m);
      continue;
    }
    const kept: MailAttachment[] = [];
    let changed = false;
    for (const a of m.attachments) {
      if (need <= 0 || a.entry !== entry) {
        kept.push(a);
        continue;
      }
      const take = Math.min(a.quantity, need);
      need -= take;
      removed += take;
      changed = true;
      if (a.quantity > take) {
        const left = a.quantity - take;
        kept.push({
          ...a,
          quantity: left,
          ...(a.instance ? { instance: copyInstance(a.instance, left) } : {}),
        });
      }
    }
    if (!changed) {
      next.push(m);
      continue;
    }
    const row: MailMessage = { ...m, attachments: kept };
    if (row.attachments.length === 0 && row.money <= 0) continue;
    next.push(row);
  }
  return { mailbox: next, removed };
}

/** Mark MAIL_CHECK_MASK_READ. Cite: MailHandler.cpp:282–301. */
export function markMailRead(
  mailbox: Mailbox,
  mailId: number,
): Mailbox {
  const idx = mailbox.findIndex((m) => m.id === mailId);
  if (idx < 0) return mailbox;
  const m = mailbox[idx]!;
  const checked = (m.checked ?? 0) | MAIL_CHECK_MASK_READ;
  if (checked === (m.checked ?? 0)) return mailbox;
  return replaceMail(mailbox, idx, { ...m, checked });
}

export function isMailUnread(m: MailMessage): boolean {
  return ((m.checked ?? 0) & MAIL_CHECK_MASK_READ) === 0;
}

// Return a normal player mail to its sender. Caller delivers `returned` into the sender's box. Cite:
// MailHandler.cpp:348–399; Mail.cpp:264.
export function returnMail(
  mailbox: Mailbox,
  mailId: number,
  opts: { nowMs: number; nextId: number; fromName: string },
): {
  ok: boolean;
  reason?: string;
  mailbox: Mailbox;
  returned?: MailMessage;
  to?: string;
} {
  const found = findDelivered(mailbox, mailId, opts.nowMs);
  if (found.idx < 0 || !found.mail) {
    return { ok: false, reason: 'Mail not found', mailbox };
  }
  const m = found.mail;
  const type = m.messageType ?? MAIL_NORMAL;
  if (type !== MAIL_NORMAL || !m.sender) {
    return { ok: false, reason: 'Cannot return this mail', mailbox };
  }
  const returned = stampMail({
    id: opts.nextId,
    sender: opts.fromName,
    subject: m.subject,
    body: m.body,
    money: m.money,
    cod: 0,
    attachments: m.attachments,
    nowMs: opts.nowMs,
    messageType: MAIL_NORMAL,
    stationery: m.stationery,
    checked: MAIL_CHECK_MASK_RETURNED,
    recipient: m.sender,
  });
  return {
    ok: true,
    mailbox: mailbox.filter((_, i) => i !== found.idx),
    returned,
    to: m.sender,
  };
}

/** Drop expired mails (expiresAt <= nowMs). Returns kept mailbox + removed list. */
export function purgeExpiredMail(mailbox: Mailbox, nowMs: number): {
  mailbox: Mailbox;
  expired: MailMessage[];
} {
  const kept: MailMessage[] = [];
  const expired: MailMessage[] = [];
  for (const m of mailbox) {
    if (m.expiresAt <= nowMs) expired.push(m);
    else kept.push(m);
  }
  return { mailbox: kept, expired };
}

/** Inbox list: delivered and not expired. Cite: MailHandler.cpp:559–561. */
export function listDeliveredMail(mailbox: readonly MailMessage[], nowMs: number): MailMessage[] {
  return mailbox.filter((m) => m.deliverAt <= nowMs && m.expiresAt > nowMs);
}

export function unreadDeliveredCount(mailbox: readonly MailMessage[], nowMs: number): number {
  let n = 0;
  for (const m of listDeliveredMail(mailbox, nowMs)) {
    if (isMailUnread(m)) n += 1;
  }
  return n;
}

// Postal Open All / Open Selected walk. Skip COD; take item; take money; delete empty. Abort on bags full;
// skip unique-cap. Cite: addons/Postal/open.lua:60–85; Postal.lua:541–546.
export function openMailWalk(
  gold: number,
  inventory: Inventory,
  mailbox: Mailbox,
  ids: readonly number[],
  opts: {
    cap?: number;
    itemStackable: (entry: number) => number;
    nowMs: number;
    storeCheck?: (entry: number, quantity: number, instance?: ItemInstance) => 'ok' | 'full' | 'unique';
  },
): {
  gold: number;
  inventory: Inventory;
  mailbox: Mailbox;
  movedItems: number;
  movedMoney: number;
  deleted: number;
  skippedCod: number;
  skippedUnique: number;
  abortedFull: boolean;
} {
  let g = gold;
  let inv = inventory;
  let box = mailbox;
  let movedItems = 0;
  let movedMoney = 0;
  let deleted = 0;
  let skippedCod = 0;
  let skippedUnique = 0;
  let abortedFull = false;

  for (const id of ids) {
    const m = box.find((x) => x.id === id);
    if (!m) continue;
    if (m.deliverAt > opts.nowMs) continue;
    if (m.cod > 0) {
      skippedCod += 1;
      continue;
    }
    if (m.attachments.length > 0) {
      const nAtt = m.attachments.length;
      const t = takeMailItem(g, inv, box, id, opts);
      if (!t.ok) {
        if (t.reason === 'Not enough bag space') {
          abortedFull = true;
          break;
        }
        if (t.reason === 'You already have the maximum amount of that item') {
          skippedUnique += 1;
          continue;
        }
        continue;
      }
      g = t.gold;
      inv = t.inventory;
      box = t.mailbox;
      movedItems += nAtt;
    }
    const cur = box.find((x) => x.id === id);
    if (cur && cur.money > 0) {
      const t = takeMailMoney(g, inv, box, id, opts);
      if (t.ok) {
        g = t.gold;
        inv = t.inventory;
        box = t.mailbox;
        movedMoney += 1;
      }
    }
    const left = box.find((x) => x.id === id);
    if (left && left.attachments.length === 0 && left.money <= 0 && left.cod <= 0) {
      const d = deleteMail(box, id, opts);
      if (d.ok) {
        box = d.mailbox;
        deleted += 1;
      }
    }
  }
  return { gold: g, inventory: inv, mailbox: box, movedItems, movedMoney, deleted, skippedCod, skippedUnique, abortedFull };
}

// Wave E pure constructor: build a MailMessage without inventory mutation. Prefer `sendMail` when bags/gold
// must move; this is the lightweight create path.
export function createMail(opts: {
  id: number;
  sender: string;
  subject?: string;
  body?: string;
  money?: number;
  cod?: number;
  attachments?: readonly MailAttachment[];
  nowMs: number;
  delaySec?: number;
  messageType?: number;
  stationery?: number;
  checked?: number;
  recipient?: string;
  senderGold: number;
  recipientMailCount: number;
}): { ok: boolean; reason?: string; mail?: MailMessage; cost: number } {
  const money = Math.max(0, Math.floor(opts.money ?? 0));
  const cod = Math.max(0, Math.floor(opts.cod ?? 0));
  const atts = opts.attachments ?? [];
  const check = canSendMail({
    senderGold: opts.senderGold,
    enclosedMoney: money,
    cod,
    attachments: atts,
    recipientMailCount: opts.recipientMailCount,
  });
  if (!check.ok) return { ok: false, reason: check.reason, cost: check.cost };
  const mail = stampMail({
    id: opts.id,
    sender: opts.sender,
    subject: opts.subject,
    body: opts.body,
    money,
    cod,
    attachments: atts,
    nowMs: opts.nowMs,
    delaySec: opts.delaySec,
    messageType: opts.messageType,
    stationery: opts.stationery,
    checked: opts.checked,
    recipient: opts.recipient,
  });
  return { ok: true, mail, cost: 0 };
}

/** System / AH / loot / quest mail: no postage, no bag removal. */
export function appendSystemMail(
  mailbox: Mailbox,
  opts: {
    sender: string;
    subject?: string;
    body?: string;
    money?: number;
    attachments?: readonly MailAttachment[];
    nowMs: number;
    delaySec?: number;
    messageType?: number;
    stationery?: number;
  },
): { mailbox: Mailbox; mail: MailMessage } {
  const mail = stampMail({
    id: nextMailId(mailbox),
    sender: opts.sender,
    subject: opts.subject,
    body: opts.body,
    money: Math.max(0, Math.floor(opts.money ?? 0)),
    cod: 0,
    attachments: opts.attachments ?? [],
    nowMs: opts.nowMs,
    delaySec: opts.delaySec,
    messageType: opts.messageType,
    stationery: opts.stationery,
  });
  return { mailbox: [...mailbox, mail], mail };
}
