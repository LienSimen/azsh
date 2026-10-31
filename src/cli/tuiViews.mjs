// The tabs and dialogs of the windowed game. A view is `{ id, title, hint, rows(app), keys, detail }`; a row is
// `{ text, header?, act?, detail?, keys? }`. Views read the Game facade and DataStore; every change is a facade call.
import { bold, dim, cyan, yellow, green, red, gray, magenta, brightBlue, brightYellow, qualityPaint, QUALITY, questText, wrapLines, fit, secondsText, plural } from './text.mjs';
import { ruleSentence, conditionsSentence, condSentence, PHASE_LABEL } from './rotationText.mjs';
import { startFight, startAutopilot } from './tuiFight.mjs';
import { className } from '../domain/core/ids.ts';
import { moneyText } from '../domain/economy/money.ts';
import { maxHealth, maxPower } from '../domain/character/character.ts';
import { effectiveStats, effectiveArmor, attackPower, powerType } from '../domain/character/characterStats.ts';
import { critChanceDisplay, dodgeChanceDisplay, hitChance } from '../domain/character/characterRatings.ts';
import { knownUsableSpells } from '../domain/character/characterSpells.ts';
import { bagCapacity, EQUIP_SLOTS, BAG_SLOTS, SLOT_LABEL, itemSlotTargets, DUAL_WIELD_SPELL_ID } from '../domain/items/equipment.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { knows } from '../domain/character/spellbook.ts';
import { availablePoints, canSpend, canRefund, spentInTree } from '../domain/character/talents.ts';
import { offeredQuests } from '../quests/quests.ts';
import { pushBuyback, buyBack as buyBackDomain } from '../domain/economy/trading.ts';
import { cityAccess, bankDialog, auctionDialog, mailDialog } from './tuiCity.mjs';
import { professionsView, profTrainerDialog, worldGatherRows, openSendGoods, reagentUses } from './tuiProfessions.mjs';
import { companionsView } from './tuiCompanions.mjs';
import { companionLevel, companionCharacter, companionSpellbook } from '../domain/bots/squad.ts';
import { squadJoinsPull } from './squad.mjs';
import { barsDialog, playerBarsOwner } from './tuiBars.mjs';
import { petWorldRows, petDialog, hasPetClass } from './tuiPet.mjs';
import { portalRows } from './tuiDungeon.mjs';
import { useStack, itemMenu, useAll, splitStack, moveStack, destroyStack, sortBags, keyringRows, primaryVerb } from './tuiBags.mjs';

const STAT_LABEL = { str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intellect', spi: 'Spirit' };

/** WoW "con" colour of a creature level against the player's. */
export function conPaint(playerLevel, level) {
  const d = level - playerLevel;
  if (d >= 5) return red;
  if (d >= 3) return brightYellow;
  if (d >= -2) return yellow;
  const grayAt = playerLevel <= 5 ? 0 : playerLevel <= 39 ? playerLevel - 5 - Math.floor(playerLevel / 10) : playerLevel - 1 - Math.floor(playerLevel / 5);
  return level > grayAt ? green : gray;
}

// ---- detail panes --------------------------------------------------------------------------------

export function itemLines(app, item, extra = []) {
  if (!item) return ['Unknown item'];
  const out = [qualityPaint(item.quality)(bold(item.name))];
  const kind = [item.slot, item.typeName].filter(Boolean).join(' · ');
  if (kind) out.push(dim(kind));
  if (item.weapon) {
    const dps = ((item.weapon.dmgMin + item.weapon.dmgMax) / 2) / (item.weapon.delayMs / 1000);
    out.push(`${item.weapon.dmgMin} - ${item.weapon.dmgMax} damage   speed ${(item.weapon.delayMs / 1000).toFixed(2)}`, dim(`(${dps.toFixed(1)} damage per second)`));
  }
  if (item.armor) out.push(`${item.armor} Armor`);
  if (item.block) out.push(`${item.block} Block`);
  for (const s of item.stats ?? []) if (s.value) out.push(`${s.value > 0 ? '+' : ''}${s.value} ${STAT_LABEL[s.stat] ?? s.stat}`);
  if (item.consumable) out.push(green(`Use: Restores ${item.consumable.amountPerTick * Math.round(item.consumable.durationMs / item.consumable.tickMs)} ${item.consumable.effect === 'drink' ? 'mana' : 'health'} over ${Math.round(item.consumable.durationMs / 1000)} sec. Must remain seated.`));
  if (item.useInCombat?.effect === 'restore_health') out.push(green(`Use: Restores ${item.useInCombat.min} to ${item.useInCombat.max} health.`));
  if (item.useInCombat?.effect === 'restore_power') out.push(green(`Use: Restores ${item.useInCombat.min} to ${item.useInCombat.max} mana.`));
  if (item.requiredLevel > 1) out.push(`Requires Level ${item.requiredLevel}`);
  if (item.allowClass?.length) out.push(`Classes: ${item.allowClass.map(className).join(', ')}`);
  if (item.bagSlots) out.push(`${item.bagSlots} Slot Bag`);
  if (item.description) out.push(yellow(`"${item.description}"`));
  if (item.sellPrice) out.push(dim(`Sells for ${moneyText(item.sellPrice)}`));
  out.push(...extra);
  return out;
}

export function spellLines(app, sp, extra = []) {
  if (!sp) return ['Unknown spell'];
  const out = [bold(sp.name) + (sp.rank ? dim(`  Rank ${sp.rank}`) : '')];
  const bits = [];
  if (sp.cost) bits.push(`${sp.cost} ${sp.powerType}`);
  bits.push(sp.castTimeMs ? `${(sp.castTimeMs / 1000).toFixed(1)} sec cast` : sp.channelMs ? 'Channeled' : 'Instant');
  if (sp.cooldownMs) bits.push(`${secondsText(sp.cooldownMs)} cooldown`);
  if (sp.rangeMax) bits.push(`${sp.rangeMax} yd range`);
  out.push(dim(bits.join('   ')));
  if (sp.reagents?.length) out.push(dim('Reagents: ' + sp.reagents.map((r) => `${app.itemName(r.item)}${r.count > 1 ? ` x${r.count}` : ''}`).join(', ')));
  if (sp.description) out.push(...wrapLines(yellow(sp.description), 60));
  const cd = app.g.spellCooldownRemaining(sp.id);
  if (cd > 0) out.push(red(`Cooldown: ${secondsText(cd)} left`));
  out.push(...extra);
  return out;
}

export function creatureLines(app, c) {
  const ch = app.ch;
  const out = [conPaint(ch.level, c.level)(bold(c.name)) + dim(`  level ${c.level}`)];
  const hp = c.hpMin === c.hpMax ? `${c.hpMin}` : `${c.hpMin}-${c.hpMax}`;
  out.push(`${hp} health   hits ${c.dmgMin}-${c.dmgMax} every ${(c.attackTimeMs / 1000).toFixed(1)} s`);
  if (c.armor) out.push(`${c.armor} armor`);
  if (c.xp) out.push(dim(`about ${c.xp} xp at your level`));
  if (c.tameable) out.push(green(app.ch.cls === 3 ? 'Tameable: t tames it' : 'Tameable'));
  const wanted = app.g.state.questlog.quests.flatMap((qs) => {
    const q = app.ds.quest(qs.entry);
    const k = q?.killTargets.find((t) => t.creatureEntry === c.entry);
    return k && qs.status === 'active' ? [`${yellow('Quest')} ${q.title}: ${qs.kills?.[String(c.entry)] ?? 0}/${k.count}`] : [];
  });
  out.push(...wanted);
  if ((app.g.state.squad ?? []).length) out.push(squadJoinsPull(app.g, app.ds, c.entry) ? cyan('Your companions join this fight.') : dim('You take this one alone (squad mode, m on Companions).'));
  out.push('', dim('Enter: fight live   f: auto-resolve'));
  return out;
}

export function questLines(app, q, qs) {
  const ch = app.ch;
  const out = [bold(q.title) + dim(`  level ${q.questLevel}${q.minLevel > ch.level ? red(`  requires ${q.minLevel}`) : ''}`)];
  if (qs) out.push(qs.status === 'complete' ? green('Ready to turn in') : qs.status === 'failed' ? red('Failed') : yellow('In progress'));
  out.push(...objectiveLines(app, q, qs).map((o) => `  ${o}`));
  const rew = rewardLines(app, q);
  if (rew.length) out.push('', cyan('Rewards'), ...rew.map((r) => `  ${r}`));
  if (q.starterName) out.push('', dim(`From ${q.starterName}${q.enderName && q.enderName !== q.starterName ? `, to ${q.enderName}` : ''}`));
  return out;
}

function countInBags(app, item) { return app.g.state.inventory.stacks.filter((s) => s.item === item).reduce((n, s) => n + s.count, 0); }

export function objectiveLines(app, q, qs) {
  const out = [];
  const ds = app.ds;
  const mark = (have, need) => (have >= need ? green : yellow)(`${Math.min(have, need)}/${need}`);
  for (const k of q.killTargets) out.push(`${ds.creature(k.creatureEntry)?.name ?? k.creatureEntry} slain: ${mark(qs?.kills?.[String(k.creatureEntry)] ?? 0, k.count)}`);
  for (const it of q.itemTargets) out.push(`${ds.item(it.item)?.name ?? it.item}: ${mark(countInBags(app, it.item), it.count)}`);
  for (const o of q.objectTargets) out.push(`${ds.gameObject?.(o.objectEntry)?.name ?? `object ${o.objectEntry}`}: ${mark(qs?.objects?.[String(o.objectEntry)] ?? 0, o.count)}`);
  if (!out.length && q.enderName) out.push(`Speak with ${q.enderName}`);
  return out;
}

export function rewardLines(app, q) {
  const out = [];
  if (q.rewXP) out.push(`${q.rewXP} experience`);
  if (q.rewMoney) out.push(yellow(moneyText(q.rewMoney)));
  for (const it of q.rewItems) out.push(`${qualityPaint(app.ds.item(it.item)?.quality)(app.itemName(it.item))}${it.count > 1 ? ` x${it.count}` : ''}`);
  if (q.rewChoiceItems?.length) out.push('Choose one of: ' + q.rewChoiceItems.map((it) => qualityPaint(app.ds.item(it.item)?.quality)(app.itemName(it.item))).join(', '));
  for (const s of q.rewSpells ?? []) out.push(`Learn ${app.spellName(s)}`);
  return out;
}

// ---- tabs ------------------------------------------------------------------------------------------

export function makeTabs(app) {
  return [
    { label: 'World', view: worldView(app) },
    { label: 'Quests', view: questsView(app) },
    { label: 'Bags', view: bagsView(app) },
    { label: 'Gear', view: gearView(app) },
    { label: 'Spells', view: spellsView(app) },
    { label: 'Rotation', view: rotationView(app) },
    { label: 'Talents', view: talentsView(app) },
    { label: 'Travel', view: travelView(app) },
    { label: 'Professions', short: 'Profs', view: professionsView(app) },
    { label: 'Companions', short: 'Party', view: companionsView(app) },
    { label: 'Character', short: 'Char', view: charView(app) },
  ];
}

function worldView(app) {
  return {
    id: 'world', title: 'World', hint: 'Enter: open / fight',
    keys: {
      f: { hint: 'quick fight', fn: (a, row) => { if (row?.data?.creature) a.cmds.commands.fight(String(row.data.creature.entry)); } },
      t: { fn: (a, row) => { const c = row?.data?.creature; if (!c) return; if (a.ch.cls !== 3) { a.flashMsg('Only hunters tame beasts.'); return; } a.result(a.g.tamePet(c.entry), `You tame ${c.name}.`); } },
      a: { hint: 'autopilot', fn: (a) => startAutopilot(a) },
    },
    rows(a) {
      const ds = a.ds, g = a.g, z = a.zone(), ch = a.ch;
      if (!z) return [{ text: 'You are nowhere.', header: true }];
      const rows = [{ text: `${z.name}  ${dim(`levels ${z.levelRange[0]}-${z.levelRange[1]}${z.faction ? `, ${z.faction}` : ''}`)}`, header: true }];
      const have = new Map(g.state.questlog.quests.map((qs) => [qs.entry, qs]));
      const offered = offeredQuests(ds, z.id, ch, g.state.questlog).filter((o) => !have.has(o.quest.entry) && (o.canAccept || o.quest.minLevel <= ch.level + 5));
      const ready = g.state.questlog.quests.filter((qs) => qs.status === 'complete').map((qs) => ({ qs, q: ds.quest(qs.entry) })).filter((x) => x.q);
      if (offered.length || ready.length) {
        rows.push({ text: '', header: true }, { text: 'Quests', header: true });
        for (const { q, qs } of ready) rows.push({ text: `${green('?')} ${q.title} ${dim(`L${q.questLevel}`)}  ${green('turn in')}`, detail: () => questLines(a, q, qs), act: () => a.push(questDialog(a, q, 'log')) });
        for (const o of offered) {
          const q = o.quest;
          rows.push({ text: `${o.canAccept ? yellow('!') : dim('·')} ${o.canAccept ? q.title : dim(q.title)} ${dim(`L${q.questLevel}`)}${!o.canAccept && q.minLevel > ch.level ? dim(`  at level ${q.minLevel}`) : ''}`, detail: () => questLines(a, q), act: () => a.push(questDialog(a, q, 'offer')) });
        }
      }
      const people = [];
      for (const t of z.trainers ?? []) if (t.cls === ch.cls) { const d = ds.trainer(t.entry); if (d) people.push({ text: `${d.name} ${dim(`<${className(t.cls)} Trainer>`)}`, detail: () => [bold(d.name), `${className(t.cls)} trainer`, '', dim('Enter: see what you can learn')], act: () => a.push(trainerDialog(a, d)) }); }
      for (const v of z.vendors ?? []) { const d = ds.vendor(v); if (d) people.push({ text: `${d.name} ${dim(`<${d.subname ?? 'Vendor'}>`)}${d.canRepair ? dim('  repairs') : ''}`, detail: () => [bold(d.name), d.subname ?? 'Vendor', d.canRepair ? 'Repairs armor and weapons' : '', '', dim('Enter: browse wares')], act: () => a.push(vendorDialog(a, d)) }); }
      for (const i of z.innkeepers ?? []) people.push({ text: `${i.name} ${dim('<Innkeeper>')}`, detail: () => [bold(i.name), 'Innkeeper', '', dim('Enter: make this your home, rest')], act: () => a.push(innDialog(a, i)) });
      for (const p of z.profTrainers ?? []) {
        const d = ds.profTrainer(p);
        if (!d) continue;
        const prof = ds.profession(d.skill)?.name ?? d.skill;
        const sk = ch.skills[d.skill];
        people.push({ text: `${d.name} ${dim(`<${prof} Trainer>`)}${sk ? dim(`  ${sk.current}/${sk.max}`) : ''}`, detail: () => [bold(d.name), `${prof} trainer`, sk ? `Your skill: ${sk.current}/${sk.max}` : `You do not know ${prof} yet.`, '', dim('Enter: ranks and recipes')], act: () => a.push(profTrainerDialog(a, d)) });
      }
      for (const f of z.flightMasters ?? []) people.push({ text: `${f.name} ${dim('<Flight Master>')}`, detail: () => [bold(f.name), 'Flight master', '', dim('Enter: open the travel tab')], act: () => a.switchTab(7) });
      // City services: the bank in capitals and banker towns, the auction house in capitals, the mailbox by every inn.
      const city = cityAccess(a);
      const services = [];
      if (city.bank) services.push({ text: `${brightBlue('Bank')} ${dim(`<Banker>  ${g.state.bank.stacks.length} stacks stored`)}`, detail: () => [bold('Bank'), 'Store what you do not carry.', '', dim('Enter: open the vault   (also b in Bags)')], act: () => a.push(bankDialog(a)) });
      if (city.ah) { const n = g.browseAuctions(Date.now()).length; services.push({ text: `${brightBlue('Auction House')} ${dim(`<Auctioneer>${n ? `  ${n} listings` : ''}`)}`, detail: () => [bold('Auction House'), 'Buy from and sell to the other players of this realm.', '', dim('Enter: browse, sell, see your auctions')], act: () => a.push(auctionDialog(a)) }); }
      if (city.mail) { const unread = g.unreadMailCount(Date.now()); services.push({ text: `${brightBlue('Mailbox')}${unread ? yellow(`  ${unread} new`) : ''}`, detail: () => [bold('Mailbox'), 'Auction sales, refunds and overflow loot arrive here.', '', dim('Enter: read your mail')], act: () => a.push(mailDialog(a)) }); }
      if (services.length) rows.push({ text: '', header: true }, { text: 'Services', header: true }, ...services);
      rows.push(...portalRows(a));
      const petRows = petWorldRows(a);
      if (petRows.length) rows.push({ text: '', header: true }, { text: 'Pet', header: true }, ...petRows);
      if (people.length) rows.push({ text: '', header: true }, { text: `People (${people.length})`, header: true }, ...people);
      rows.push(...worldGatherRows(a));
      rows.push({ text: '', header: true }, { text: 'Exits', header: true });
      for (const id of z.neighbors) {
        const dest = ds.zone(id);
        if (!dest) continue;
        rows.push({ text: `${cyan(dest.name)} ${dim(`levels ${dest.levelRange[0]}-${dest.levelRange[1]}`)}`, detail: () => travelPreviewLines(a, dest), act: () => travelTo(a, dest) });
      }
      const mobs = z.huntable.map((e) => ds.creature(e)).filter(Boolean).sort((x, y) => x.level - y.level || x.name.localeCompare(y.name));
      if (mobs.length) {
        rows.push({ text: '', header: true }, { text: `Creatures (${mobs.length})`, header: true });
        for (const m of mobs) {
          const wanted = g.state.questlog.quests.some((qs) => qs.status === 'active' && ds.quest(qs.entry)?.killTargets.some((k) => k.creatureEntry === m.entry));
          rows.push({ text: `${conPaint(ch.level, m.level)(m.name)} ${dim(`L${m.level}`)}${wanted ? yellow('  !') : ''}`, data: { creature: m }, detail: () => creatureLines(a, m), act: () => startFight(a, m.entry) });
        }
      }
      // The same offer list the autopilot reads: chain, class, race and exclusive-group gates applied;
      // `canAccept` false means visible but level- or reputation-locked (shown grey, like a silver !).
      return rows;
    },
  };
}

export function travelPreviewLines(app, dest) {
  const pv = app.g.previewTravel(dest.id);
  const out = [bold(dest.name), dim(`levels ${dest.levelRange[0]}-${dest.levelRange[1]}${dest.faction ? `, ${dest.faction}` : ''}`), ''];
  if (!pv.ok) { out.push(red(pv.reason)); return out; }
  out.push(`${secondsText(pv.totalSeconds * 1000)} of travel${pv.totalCopper ? `, ${moneyText(pv.totalCopper)} in fares` : ''}`);
  for (const leg of pv.legs) out.push(dim(`  ${leg.kind} ${app.ds.zone(leg.from)?.name ?? leg.from} → ${app.ds.zone(leg.to)?.name ?? leg.to} (${secondsText(leg.seconds * 1000)})`));
  return out;
}

export function travelTo(app, dest) {
  const pv = app.g.previewTravel(dest.id);
  if (!app.result(pv)) return;
  const res = app.g.travelTo(dest.id);
  if (!app.result(res)) return;
  app.g.completeJourneyNow();
  app.vendor = null; app.cmds.setVendor(null);
  app.say(`You travel to ${bold(dest.name)}. ${dim(`${secondsText(pv.totalSeconds * 1000)}${pv.totalCopper ? `, ${moneyText(pv.totalCopper)}` : ''}`)}`);
  app.stack = [];
  app.switchTab(0);
  app.tabs[0].view.cursor = 0; app.tabs[0].view.scroll = 0;
}

function questsView(app) {
  return {
    id: 'quests', title: 'Quest log', hint: 'Enter: open', empty: 'Your quest log is empty. Look for ! in the world.',
    keys: {
      d: { hint: 'do quest', fn: (a, row) => { if (row?.data) doQuest(a, row.data.q); } },
      x: { hint: 'abandon', fn: (a, row) => { if (row?.data) a.confirm(`Abandon ${row.data.q.title}?`, () => a.result(a.g.abandonQuest(row.data.q.entry), `Abandoned ${row.data.q.title}.`)); } },
    },
    rows(a) {
      const rows = [];
      const list = a.g.state.questlog.quests.map((qs) => ({ qs, q: a.ds.quest(qs.entry) })).filter((x) => x.q);
      const log = list.filter((x) => x.qs.status !== 'turnedIn');
      rows.push({ text: `${log.length} of 20 quests`, header: true });
      for (const x of log) {
        const st = x.qs.status === 'complete' ? green('(Complete)') : x.qs.status === 'failed' ? red('(Failed)') : a.cmds.questBlacklist.has(x.q.entry) ? dim('(autopilot skips)') : '';
        rows.push({ text: `${x.q.title} ${dim(`L${x.q.questLevel}`)} ${st}`, data: x, detail: () => questLines(a, x.q, x.qs), act: () => a.push(questDialog(a, x.q, 'log')) });
      }
      return rows;
    },
  };
}

export function questDialog(app, q, mode) {
  const qs = () => app.g.state.questlog.quests.find((s) => s.entry === q.entry);
  const view = {
    id: `quest-${q.entry}`, title: q.title, hint: mode === 'offer' ? 'Enter: accept' : 'Enter: act',
    rows(a) {
      const W = a.layout().listW - 4;
      const ch = a.ch, s = qs();
      const rows = [{ text: `${bold(q.title)}  ${dim(`L${q.questLevel}`)}`, header: true }, { text: '', header: true }];
      const text = (t) => wrapLines(questText(t, ch), W).map((l) => ({ text: l, header: true }));
      if (mode === 'offer') rows.push(...text(q.detailsText), { text: '', header: true }, { text: 'Objectives', header: true }, ...text(q.objectivesText));
      else if (s?.status === 'complete') rows.push(...text(q.offerRewardText || q.endText || q.objectivesText));
      else rows.push(...text(q.objectivesText), { text: '', header: true }, ...(q.requestItemsText ? text(q.requestItemsText) : []));
      rows.push({ text: '', header: true });
      for (const o of objectiveLines(a, q, s)) rows.push({ text: `  ${o}`, header: true });
      rows.push({ text: '', header: true });
      if (mode === 'offer') {
        rows.push({ text: green('Accept the quest'), act: () => { if (a.result(a.g.acceptQuest(q.entry), `Quest accepted: ${q.title}`)) a.pop(); } });
        rows.push({ text: dim('Decline'), act: () => a.pop() });
      } else {
        if (s?.status === 'complete') rows.push({ text: green('Complete the quest'), act: () => turnIn(a, q) });
        else rows.push({ text: cyan('Do the quest'), act: () => doQuest(a, q) });
        rows.push({ text: red('Abandon the quest'), act: () => a.confirm(`Abandon ${q.title}?`, () => { if (a.result(a.g.abandonQuest(q.entry), `Abandoned ${q.title}.`)) a.popTo('__none__'); }) });
        rows.push({ text: dim('Close'), act: () => a.pop() });
      }
      return rows;
    },
    detail: (a) => questLines(a, q, qs()),
  };
  return view;
}

/** Do Quest: the autopilot works this one quest (travel, fights, objects, hand-in) and stops when it is done. */
function doQuest(app, q) {
  const s = app.g.state.questlog.quests.find((x) => x.entry === q.entry);
  if (s?.status === 'complete' && q.rewChoiceItems?.length) { turnIn(app, q); return; }
  app.stack = [];
  startAutopilot(app, 500, undefined, q.entry);
}

function turnIn(app, q) {
  const finish = (choice) => {
    const res = app.g.turnInQuest(q.entry, choice);
    if (!app.result(res, `Quest complete: ${q.title}`)) return;
    const bits = [];
    if (res.xp) bits.push(`+${res.xp} xp`);
    if (res.money) bits.push(`+${moneyText(res.money)}`);
    for (const it of res.items) bits.push(app.itemName(it.item) + (it.count > 1 ? ` x${it.count}` : ''));
    for (const s of res.spells ?? []) bits.push(`learned ${s.name ?? ''}`.trim());
    if (bits.length) app.say('  ' + bits.join(', '));
    for (const lv of res.leveledTo) { app.say(bold(green(`You have reached level ${lv}!`))); app.flashMsg(`Level ${lv}!`); }
    app.stack = [];
    app.afterAction();
  };
  if (q.rewChoiceItems?.length) {
    app.pick('Choose your reward', q.rewChoiceItems.map((it, i) => ({
      label: `${qualityPaint(app.ds.item(it.item)?.quality)(app.itemName(it.item))}${it.count > 1 ? ` x${it.count}` : ''}`,
      detail: () => itemLines(app, app.ds.item(it.item)),
      value: i,
    })), finish);
  } else finish(0);
}

function bagsView(app) {
  const slotOf = (a, row) => (row?.data && !('keyring' in row.data) ? a.g.state.inventory.stacks.indexOf(row.data) : -1);
  const onStack = (fn) => (a, row) => { const i = slotOf(a, row); if (i >= 0) fn(a, i); };
  return {
    id: 'bags', title: 'Bags', hint: 'Enter: use / equip / open   m: more', empty: 'Your bags are empty.',
    keys: {
      m: { hint: 'item menu', fn: onStack(itemMenu) },
      s: { hint: 'sell', fn: (a, row) => { if (!a.vendor) { a.flashMsg('Open a vendor first (World tab).'); return; } const i = slotOf(a, row); if (i >= 0) sellStack(a, i); } },
      j: { hint: 'sell junk', fn: (a) => { if (!a.vendor) { a.flashMsg('Open a vendor first (World tab).'); return; } sellJunk(a); } },
      d: { hint: 'destroy', fn: onStack((a, i) => destroyStack(a, i)) },
      S: { hint: 'sort', fn: (a) => sortBags(a) },
      A: { fn: onStack(useAll) },
      '/': { fn: onStack(splitStack) },
      '[': { fn: onStack((a, i) => moveStack(a, i, -1)) },
      ']': { fn: onStack((a, i) => moveStack(a, i, +1)) },
      b: { hint: 'bank', fn: (a) => { if (!cityAccess(a).bank) { a.flashMsg('No banker here. Banks are in the capitals, Ratchet, Booty Bay, Gadgetzan and Everlook.'); return; } a.push(bankDialog(a)); } },
      u: { hint: 'equip upgrades', fn: (a) => { const n = a.g.suggestedEquipmentUpgrades().length ? a.g.autoEquipUpgrades() : 0; if (n) a.say(green(`You put on ${plural(n, 'upgrade')}.`)); else a.flashMsg('Nothing in your bags beats what you wear.'); } },
      g: { hint: 'send to companions', fn: (a) => openSendGoods(a) },
    },
    rows(a) {
      const st = a.g.state.inventory.stacks;
      const ups = new Set(a.g.suggestedEquipmentUpgrades().filter((u) => !u.holderId).map((u) => u.entry));
      const rows = [{ text: `${st.length}/${bagCapacity(a.ch, a.ds)} slots   ${yellow(moneyText(a.ch.gold) || '0c')}${ups.size ? green(`   ▲ ${plural(ups.size, 'upgrade')} to wear (u)`) : ''}`, header: true }];
      st.forEach((s, i) => {
        const it = a.ds.item(s.item);
        const name = qualityPaint(it?.quality)(it?.name ?? `item ${s.item}`);
        const verb = primaryVerb(a, s);
        const tag = s.wrappedItemEntry ? dim('  gift') : it?.slot ? dim(`  ${it.slot}`) : it?.consumable ? dim(`  ${it.consumable.effect}`) : verb === 'Open' ? dim('  open') : verb === 'Learn' ? dim('  learn') : it?.questItem ? dim('  quest') : '';
        rows.push({
          text: `${name}${s.count > 1 ? ` x${s.count}` : ''}${tag}${ups.has(s.item) ? green('  ▲') : ''}`, data: s,
          detail: () => itemLines(a, it, [
            '', dim(`${verb ? `Enter: ${verb.toLowerCase()}   ` : ''}m: more${s.count > 1 ? '   /: split' : ''}   [ ]: move   d: destroy`),
            ...(a.vendor ? [dim(`s: sell to ${a.vendor.name}`)] : []),
          ]),
          act: () => useStack(a, i),
        });
      });
      rows.push(...keyringRows(a));
      return rows;
    },
  };
}

/** The item worn in a paperdoll slot, or null. */
function wornItem(app, slot) {
  const entry = equippedEntry(app.ch.equipped[slot]);
  return entry == null ? null : app.ds.item(entry) ?? null;
}

/** The engine's equipment helper: what in your bags (and the bank, when it is open) beats what you wear. */
function upgradeList(app) {
  return app.g.suggestedEquipmentUpgrades().filter((u) => !u.holderId);
}

/** Lines comparing a candidate with the item worn in `slot`: armor, damage and stat deltas. */
function compareLines(app, it, worn) {
  if (!worn || worn === it) return [];
  const out = ['', cyan(`Compared with ${worn.name}`)];
  const sign = (n, unit = '') => (n > 0 ? green : n < 0 ? red : dim)(`${n > 0 ? '+' : ''}${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`);
  if ((it.armor ?? 0) !== (worn.armor ?? 0)) out.push(`  ${sign((it.armor ?? 0) - (worn.armor ?? 0))} armor`);
  const dps = (w) => (w ? ((w.dmgMin + w.dmgMax) / 2) / (w.delayMs / 1000) : 0);
  if (it.weapon || worn.weapon) out.push(`  ${sign(dps(it.weapon) - dps(worn.weapon))} damage per second`);
  const stats = new Map();
  for (const s of it.stats ?? []) stats.set(s.stat, (stats.get(s.stat) ?? 0) + s.value);
  for (const s of worn.stats ?? []) stats.set(s.stat, (stats.get(s.stat) ?? 0) - s.value);
  for (const [stat, d] of stats) if (d) out.push(`  ${sign(d)} ${STAT_LABEL[stat] ?? stat}`);
  if (out.length === 2) out.push(dim('  no difference in armor, damage or stats'));
  return out;
}

function gearView(app) {
  return {
    id: 'gear', title: 'Equipment', hint: 'Enter: change what you wear',
    keys: {
      u: { hint: 'equip all upgrades', fn: (a) => {
        if (!upgradeList(a).length) { a.flashMsg('Nothing in your bags beats what you wear.'); return; }
        const n = a.g.autoEquipUpgrades();
        a.say(n ? green(`You put on ${plural(n, 'upgrade')}.`) : red('The upgrades could not be equipped.'));
      } },
      x: { hint: 'take off', fn: (a, row) => { if (row?.data?.it) a.result(a.g.unequip(row.data.slot), `You take off ${row.data.it.name}.`); } },
    },
    rows(a) {
      const rows = [];
      const ups = upgradeList(a);
      if (ups.length) {
        rows.push({ text: `${green('▲')} Better gear in your bags (${ups.length})   ${dim('Enter: put on   u: put on all')}`, header: true });
        for (const u of ups) {
          const it = a.ds.item(u.entry), cur = u.currentEntry != null ? a.ds.item(u.currentEntry) : null;
          rows.push({
            text: `  ${fit(SLOT_LABEL[u.slot] ?? u.slot, 10)} ${qualityPaint(it?.quality)(it?.name ?? u.entry)}  ${green(`+${Math.round(u.delta)}`)}${cur ? dim(`  replaces ${cur.name}`) : ''}${u.displaces?.length ? yellow(`  frees ${u.displaces.map((s) => SLOT_LABEL[s] ?? s).join(', ')}`) : ''}`,
            data: { upgrade: u },
            detail: () => itemLines(a, it, compareLines(a, it, cur)),
            act: () => { const r = a.g.equip(u.entry, u.slot); a.result(r, r.ok ? `You equip ${it?.name}.` : ''); },
          });
        }
        rows.push({ text: '', header: true });
      }
      rows.push({ text: `What you wear   ${dim('Enter: pick from bags' + (cityAccess(a).bank ? ' and bank' : '') + '   x: take off')}`, header: true });
      for (const slot of [...EQUIP_SLOTS, ...BAG_SLOTS]) {
        const it = wornItem(a, slot);
        const up = ups.some((u) => u.slot === slot);
        rows.push({
          text: `${fit(SLOT_LABEL[slot], 10)} ${it ? qualityPaint(it.quality)(it.name) : dim('—')}${up ? green('  ▲') : ''}`, data: { slot, it },
          detail: () => (it ? itemLines(a, it, ['', dim('Enter: change   x: take off')]) : [dim(`Nothing in the ${SLOT_LABEL[slot]} slot.`), '', dim('Enter: pick something to wear')]),
          act: () => a.push(slotDialog(a, slot)),
        });
      }
      return rows;
    },
  };
}

/** Everything in your bags (and the bank, in a bank town) that fits one paperdoll slot. Enter puts it on. */
function slotDialog(app, slot) {
  const label = SLOT_LABEL[slot] ?? slot;
  return {
    id: `slot-${slot}`, title: label, hint: 'Enter: wear it   Esc: back',
    rows(a) {
      const ds = a.ds, ch = a.ch;
      const worn = wornItem(a, slot);
      const opts = { canDualWield: knows(a.g.state.spellbook, DUAL_WIELD_SPELL_ID) };
      const fits = (s) => { const it = ds.item(s.item); return it?.slot && itemSlotTargets(it, opts).includes(slot); };
      const ups = new Map(upgradeList(a).filter((u) => u.slot === slot).map((u) => [u.entry, u]));
      const rows = [{ text: `${bold(label)}: ${worn ? qualityPaint(worn.quality)(worn.name) : dim('empty')}`, header: true }, { text: '', header: true }];
      if (worn) rows.push({ text: dim(`Take off ${worn.name}`), act: () => { if (a.result(a.g.unequip(slot), `You take off ${worn.name}.`)) a.pop(); } });
      const row = (s, from) => {
        const it = ds.item(s.item);
        const up = ups.get(s.item);
        const low = it.requiredLevel > ch.level;
        const name = qualityPaint(it.quality)(it.name);
        return {
          text: `  ${low ? dim(name) : name}${s.count > 1 ? dim(` x${s.count}`) : ''}${up ? green(`  ▲ +${Math.round(up.delta)}`) : ''}${low ? red(`  L${it.requiredLevel}`) : ''}${from === 'bank' ? dim('  in bank') : ''}`,
          data: { s, it },
          detail: () => itemLines(a, it, [...compareLines(a, it, worn), '', dim(from === 'bank' ? 'Enter: take it out of the bank and wear it' : 'Enter: wear it')]),
          act: () => {
            if (from === 'bank' && !a.result(a.g.bankWithdraw(s.item, 1), '')) return;
            const r = a.g.equip(s.item, slot);
            if (a.result(r, r.ok ? `You equip ${it.name}.` : '')) a.pop();
          },
        };
      };
      const bag = a.g.state.inventory.stacks.filter(fits);
      rows.push({ text: '', header: true }, { text: `In your bags (${bag.length})`, header: true });
      if (!bag.length) rows.push({ text: dim(`  Nothing in your bags goes in the ${label} slot.`), header: true });
      for (const s of bag) rows.push(row(s, 'bags'));
      if (cityAccess(a).bank) {
        const bank = a.g.state.bank.stacks.filter(fits);
        rows.push({ text: '', header: true }, { text: `In the bank (${bank.length})`, header: true });
        if (!bank.length) rows.push({ text: dim('  Nothing in the bank fits either.'), header: true });
        for (const s of bank) rows.push(row(s, 'bank'));
      }
      return rows;
    },
  };
}

function spellsView(app) {
  return {
    id: 'spells', title: 'Spellbook', hint: 'Enter: cast',
    keys: { b: { hint: 'action bars', fn: (a) => a.push(barsDialog(a, playerBarsOwner)) } },
    rows(a) {
      const known = knownUsableSpells(a.ch, a.g.state.spellbook, a.ds).sort((x, y) => x.name.localeCompare(y.name));
      const head = [{ text: `Action bars ${dim(`${a.g.state.actionBars?.length ?? 0} bars   b`)}`, detail: () => [bold('Action bars'), '', 'Bar 1 is the number row in a fight: put spells and bag items on it and bind keys.'], act: () => a.push(barsDialog(a, playerBarsOwner)) }, { text: '', header: true }];
      return [...head, ...known.map((sp) => {
        const cd = a.g.spellCooldownRemaining(sp.id);
        return {
          text: `${sp.name}${sp.rank ? dim(` (Rank ${sp.rank})`) : ''}${sp.cost ? dim(`  ${sp.cost} ${sp.powerType}`) : ''}${cd > 0 ? red(`  ${secondsText(cd)}`) : ''}`,
          detail: () => spellLines(a, sp),
          act: () => a.result(a.g.castOutOfCombat(sp.id), `You cast ${sp.name}.`),
        };
      })];
    },
  };
}

// ---- rotation ------------------------------------------------------------------------------------

const PHASES = ['prebuff', 'buffs', 'pull', 'combat', 'recovery'];

function rotNames(app) {
  return {
    spell: (id) => app.ds.spell(id)?.name ?? `spell ${id}`,
    item: (id) => app.itemName(id),
    creature: (e) => app.ds.creature(e)?.name,
    object: (e) => app.ds.gameObject?.(e)?.name,
  };
}

/** Whose rotation the tab edits: yours, or a seated companion's (the editor's companion picker in phonecraft
 *  rotationEditor.ts). Every read and write on the tab goes through this. */
function rotOwner(app) {
  const g = app.g, id = app.tabs[5]?.view.whose;
  const comp = id ? (g.state.squad ?? []).find((c) => c.id === id) : null;
  if (!comp) {
    return {
      name: 'your', comp: null, get: () => g.rotation(), set: (r) => g.setRotation(r), reset: () => g.resetRotation(),
      spells: () => knownUsableSpells(app.ch, g.state.spellbook, app.ds), bag: () => g.state.inventory.stacks,
      profiles: () => g.rotationProfiles(), add: (o) => g.addRotationProfile(o), rename: (pid, n) => g.renameRotationProfile(pid, n),
      del: (pid) => g.deleteRotationProfile(pid), select: (pid) => g.selectRotationProfile(pid),
    };
  }
  const lvl = companionLevel(comp, app.ch.level);
  return {
    name: `${comp.name}'s`, comp, get: () => g.companionRotation(comp.id), set: (r) => g.setCompanionRotation(comp.id, r), reset: () => g.resetCompanionRotation(comp.id),
    spells: () => knownUsableSpells(companionCharacter(comp, lvl, app.ds), companionSpellbook(comp, lvl, app.ds), app.ds), bag: () => comp.bags?.stacks ?? [],
    profiles: () => g.companionRotationProfiles(comp.id), add: (o) => g.addCompanionRotationProfile(comp.id, o), rename: (pid, n) => g.renameCompanionRotationProfile(comp.id, pid, n),
    del: (pid) => g.deleteCompanionRotationProfile(comp.id, pid), select: (pid) => g.selectCompanionRotationProfile(comp.id, pid),
  };
}

function editRotation(app, mutate) {
  const o = rotOwner(app);
  const rot = structuredClone(o.get());
  mutate(rot);
  rot.custom = true;
  o.set(rot);
}

/** w: you or one of the seated companions. */
function pickRotationOwner(app) {
  const view = app.tabs[5].view;
  const opts = [{ label: `${view.whose ? '  ' : green('● ')}You`, value: null }, ...(app.g.state.squad ?? []).map((c) => ({ label: `${view.whose === c.id ? green('● ') : '  '}${c.name} ${dim(`${className(c.cls)}, ${c.role}`)}`, value: c.id }))];
  app.pick('Whose rotation?', opts, (id) => { view.whose = id; view.cursor = 0; view.scroll = 0; });
}

/** The named rotations: switch, add (a copy or the recommended list), rename, delete. */
function profileMenu(app) {
  const o = rotOwner(app);
  const list = o.profiles();
  const opts = [
    ...list.map((p) => ({ label: `${p.active ? green('● ') : '  '}${p.name}`, value: { kind: 'select', p } })),
    { label: dim('+ New rotation (a copy of this one)'), value: { kind: 'add' } },
    { label: dim('+ New rotation (the recommended list)'), value: { kind: 'band' } },
    { label: dim('Rename this one'), value: { kind: 'rename' } },
    ...(list.length > 1 ? [{ label: red('Delete this one'), value: { kind: 'delete' } }] : []),
  ];
  const active = list.find((p) => p.active);
  app.pick(`${o.comp ? o.name : 'Your'} rotations`, opts, (v) => {
    if (v.kind === 'select') app.result(o.select(v.p.id), `Now playing ${v.p.name}.`);
    else if (v.kind === 'add' || v.kind === 'band') app.prompt('Name: ', (n) => { const r = o.add({ name: n, ...(v.kind === 'band' ? { fromBand: null } : { copyFromId: active?.id }) }); if (app.result(r, r.ok ? `Added ${r.name}.` : '')) o.select(r.id); app.afterAction(); });
    else if (v.kind === 'rename' && active) app.prompt('New name: ', (n) => { app.result(o.rename(active.id, n), `Renamed to ${n}.`); app.afterAction(); }, active.name);
    else if (v.kind === 'delete' && active) app.confirm(`Delete ${active.name}?`, () => app.result(o.del(active.id), `Deleted ${active.name}.`));
  });
}

function rotationView(app) {
  const rebuild = (a) => a.confirm('Rebuild the recommended rotation? The edits are lost.', () => { rotOwner(a).reset(); a.say(green('Rotation rebuilt.')); });
  return {
    id: 'rotation', title: 'Rotation', hint: 'Enter: open',
    keys: {
      w: { hint: 'whose', fn: (a) => pickRotationOwner(a) },
      p: { hint: 'profiles', fn: (a) => profileMenu(a) },
      // K J c d still work as shortcuts; the menu on Enter is the advertised way, so they stay out of the hint line.
      K: { fn: (a, row) => row?.data?.rule && moveRule(a, row.data, -1) },
      J: { fn: (a, row) => row?.data?.rule && moveRule(a, row.data, +1) },
      a: { hint: 'add', fn: (a, row) => addRule(a, row?.data?.phase ?? 'combat', row?.data?.rule ? row.data.index : undefined) },
      c: { fn: (a, row) => row?.data?.rule && editCondition(a, row.data) },
      d: { fn: (a, row) => row?.data?.rule && a.confirm('Delete this rule?', () => deleteRule(a, row.data)) },
      s: { hint: 'spec', fn: (a) => { if (!rotOwner(a).comp) pickSpec(a); } },
      r: { hint: 'rebuild', fn: rebuild },
    },
    rows(a) {
      const g = a.g, o = rotOwner(a), rot = o.get(), names = rotNames(a);
      const spec = o.comp ? (a.ds.botSpecs(o.comp.cls)?.[o.comp.specIdx]?.name ?? className(o.comp.cls)) : g.effectiveRotationSpec();
      const prof = o.profiles().find((p) => p.active);
      const rows = [
        { text: `${bold(o.comp ? `${o.comp.name}: ${spec}` : `${spec} rotation`)}${rot.custom ? dim('  (edited)') : dim('  (recommended)')}${!o.comp && g.rotationNeedsRefresh() ? yellow('  a newer recommended list exists') : ''}`, header: true },
        ...((g.state.squad ?? []).length ? [{ text: `Whose: ${cyan(o.comp ? o.comp.name : 'You')} ${dim('w')}`, detail: () => [bold('Whose rotation'), '', "Your own, or a seated companion's: the same rules drive them in every fight."], act: () => pickRotationOwner(a) }] : []),
        { text: `Profile: ${cyan(prof?.name ?? 'Default')} ${dim(`${o.profiles().length} saved   p`)}`, detail: () => [bold('Rotation profiles'), '', 'Keep several named rotations and switch which one plays.', ...o.profiles().map((p) => `${p.active ? green('●') : dim('·')} ${p.name}`)], act: () => profileMenu(a) },
        ...wrapLines('What auto-play casts for you. Each tick the rules are read top to bottom and the first one whose conditions hold fires. ✓ is on, · is off. Enter on a rule opens its menu.', a.layout().listW - 2).map((t) => ({ text: dim(t), header: true })),
      ];
      for (const phase of PHASES) {
        const rules = rot.phases[phase] ?? [];
        if (!rules.length && phase === 'prebuff') continue;
        rows.push({ text: '', header: true }, { text: PHASE_LABEL[phase], header: true });
        rules.forEach((rule, index) => {
          const conds = conditionsSentence(rule.conditions, names);
          const text = `${rule.enabled ? green('✓') : dim('·')} ${rule.enabled ? ruleSentence(rule, names) : dim(ruleSentence(rule, names))}${conds !== 'always' ? dim(`  when ${conds}`) : ''}`;
          rows.push({
            text, data: { phase, index, rule },
            detail: () => ruleLines(a, rule, names),
            act: () => ruleMenu(a, { phase, index, rule }),
          });
        });
        rows.push({
          text: dim(`+ Add a rule to ${PHASE_LABEL[phase].split(' (')[0].toLowerCase()}`), data: { phase },
          detail: () => [bold(PHASE_LABEL[phase]), '', dim('Enter picks a spell or a combat item to add at the end of this list. Afterwards you can say when it fires.')],
          act: () => addRule(a, phase),
        });
      }
      rows.push({ text: '', header: true }, { text: 'Settings', header: true });
      if (!o.comp) rows.push({
        text: `Build for spec: ${cyan(spec)}${g.rotationSpec() ? '' : dim('  (follows your talents)')}`,
        detail: () => [bold('Spec'), '', 'The recommended list is built for one talent tree. Enter picks another, or lets it follow your talents again.'],
        act: () => pickSpec(a),
      });
      rows.push({
        text: `Rebuild the recommended rotation${g.rotationNeedsRefresh() ? yellow('  (newer available)') : ''}`,
        detail: () => [bold('Rebuild'), '', 'Throws away your edits and builds the recommended list for your level and spec. Use it after learning new spells.'],
        act: () => rebuild(a),
      });
      return rows;
    },
  };
}

/** Enter on a rule: everything you can do with it, in one list. */
function ruleMenu(app, data) {
  const { rule } = data;
  const names = rotNames(app);
  const options = [
    { label: rule.enabled ? 'Turn it off' : green('Turn it on'), detail: [rule.enabled ? 'Auto-play skips a rule that is off.' : 'Auto-play considers this rule again.'], value: 'toggle' },
    { label: 'Change when it fires', detail: ['Pick a condition: health thresholds, a missing buff or debuff, the enemy casting, more than one enemy, melee or range.', '', dim(`Now: ${conditionsSentence(rule.conditions, names)}`)], value: 'cond' },
    { label: 'Move up', detail: ['Earlier rules are tried first.'], value: 'up' },
    { label: 'Move down', detail: ['Later rules only fire when everything above them is unusable or gated off.'], value: 'down' },
    { label: 'Add a rule after this one', value: 'add' },
    { label: red('Delete this rule'), value: 'del' },
  ];
  app.pick(ruleSentence(rule, names), options, (v) => {
    switch (v) {
      case 'toggle': editRotation(app, (r) => { r.phases[data.phase][data.index].enabled = !r.phases[data.phase][data.index].enabled; }); break;
      case 'cond': editCondition(app, data); break;
      case 'up': moveRule(app, data, -1); break;
      case 'down': moveRule(app, data, +1); break;
      case 'add': addRule(app, data.phase, data.index); break;
      case 'del': deleteRule(app, data); break;
    }
  });
}

function deleteRule(app, { phase, index }) {
  editRotation(app, (rot) => { rot.phases[phase].splice(index, 1); });
  app.say(dim('Rule deleted.'));
}

function ruleLines(app, rule, names) {
  const out = [bold(ruleSentence(rule, names)), rule.enabled ? green('enabled') : dim('disabled'), ''];
  if (rule.conditions.length) {
    out.push(cyan('Only when'));
    rule.conditions.forEach((c, i) => out.push(`  ${i ? (c.join === 'or' ? 'OR ' : 'and ') : ''}${condSentence(c, names)}`));
  } else out.push(dim('No conditions: fires whenever it is the first usable row.'));
  if (rule.action.kind === 'spell') { const sp = app.ds.spell(rule.action.spellId); if (sp) out.push('', ...spellLines(app, sp)); }
  if (rule.action.kind === 'item') { const it = app.ds.item(rule.action.itemEntry); if (it) out.push('', ...itemLines(app, it)); }
  return out;
}

function moveRule(app, { phase, index, rule }, delta) {
  const list = rotOwner(app).get().phases[phase] ?? [];
  const j = index + delta;
  if (j < 0 || j >= list.length) { app.flashMsg(delta < 0 ? 'Already first in its list.' : 'Already last in its list.'); return; }
  editRotation(app, (rot) => {
    const l = rot.phases[phase];
    [l[index], l[j]] = [l[j], l[index]];
  });
  // Keep the cursor on the rule that moved.
  const view = app.tabs[5].view;
  const at = app.rowsOf(view).findIndex((r) => r.data?.rule?.id === rule?.id);
  if (at >= 0) { view.cursor = at; app.ensureVisible(view, app.rowsOf(view)); }
}

function addRule(app, phase, afterIndex) {
  const o = rotOwner(app);
  const known = o.spells().filter((s) => !s.passive).sort((x, y) => x.name.localeCompare(y.name));
  const options = known.map((sp) => ({ label: `${sp.name}${sp.rank ? dim(` (Rank ${sp.rank})`) : ''}`, detail: () => spellLines(app, sp), value: { kind: 'spell', spellId: sp.id } }));
  const combatItems = [...new Set(o.bag().map((s) => s.item))].map((e) => app.ds.item(e)).filter((it) => it?.useInCombat);
  for (const it of combatItems) options.push({ label: `Use ${qualityPaint(it.quality)(it.name)}`, detail: () => itemLines(app, it), value: { kind: 'item', itemEntry: it.entry } });
  app.pick(`Add to ${PHASE_LABEL[phase].split(' (')[0].toLowerCase()}: what to do`, options, (action) => {
    const id = `tui-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    editRotation(app, (rot) => {
      const rule = { id, action, conditions: [], enabled: true };
      const list = rot.phases[phase] ??= [];
      list.splice(afterIndex == null ? list.length : afterIndex + 1, 0, rule);
    });
    // Land the cursor on the new rule so c (condition) and J/K act on it.
    const view = app.tabs[5].view;
    const at = app.rowsOf(view).findIndex((r) => r.data?.rule?.id === id);
    if (at >= 0) { view.cursor = at; app.ensureVisible(view, app.rowsOf(view)); }
    app.say(green(`Rule added to ${phase}. Press c to set when it fires.`));
  });
}

function editCondition(app, { phase, index, rule }) {
  const spellRef = rule.action.kind === 'spell' ? rule.action.spellId : undefined;
  const spellName = spellRef ? app.ds.spell(spellRef)?.name : 'this spell';
  const presets = [
    { label: 'Always', value: [] },
    { label: 'My health is below …%', value: 'hp', prompt: { metric: 'healthPct', subject: 'self', op: '<' } },
    { label: 'My mana/power is above …%', value: 'pw', prompt: { metric: 'powerPct', subject: 'self', op: '>' } },
    { label: "The enemy's health is below …%", value: 'ehp', prompt: { metric: 'healthPct', subject: 'target', op: '<' } },
    { label: "The enemy's health is above …%", value: 'ehp2', prompt: { metric: 'healthPct', subject: 'target', op: '>' } },
    ...(spellRef ? [
      { label: `The enemy does not have ${spellName}`, value: [{ subject: 'target', metric: 'debuffPresent', op: '==', value: 0, ref: spellRef }] },
      { label: `I do not have ${spellName}`, value: [{ subject: 'self', metric: 'buffPresent', op: '==', value: 0, ref: spellRef }] },
      { label: `${spellName} has under 3 s left on the enemy`, value: [{ subject: 'target', metric: 'debuffRemainingMs', op: '<', value: 3000, ref: spellRef }] },
    ] : []),
    { label: 'The enemy is casting', value: [{ subject: 'target', metric: 'castingPresent', op: '==', value: 1 }] },
    { label: 'More than one living enemy', value: [{ subject: 'self', metric: 'enemyCount', op: '>', value: 1 }] },
    { label: 'I am in melee range', value: [{ subject: 'self', metric: 'inMelee', op: '==', value: 1 }] },
    { label: 'I am at range', value: [{ subject: 'self', metric: 'inMelee', op: '==', value: 0 }] },
  ];
  const apply = (conds) => editRotation(app, (rot) => { rot.phases[phase][index].conditions = conds; });
  app.pick(`${spellName}: fire only when…`, presets.map((p) => ({ label: p.label, value: p })), (p) => {
    if (Array.isArray(p.value)) { apply(p.value); return; }
    app.prompt('Percent: ', (txt) => {
      const n = Number(txt);
      if (!(n >= 0 && n <= 100)) { app.flashMsg('Enter a number from 0 to 100.'); return; }
      apply([{ ...p.prompt, value: n }]);
      app.afterAction();
    });
  });
}

function pickSpec(app) {
  const trees = app.ds.talentTrees(app.ch.cls);
  const options = [{ label: 'Follow my talents (automatic)', value: null }, ...trees.map((t) => ({ label: t.name, value: t.name }))];
  app.pick('Build the rotation for which spec?', options, (spec) => { app.g.setRotationSpec(spec); app.say(green(`Rotation rebuilt for ${app.g.effectiveRotationSpec()}.`)); });
}

// ---- talents -------------------------------------------------------------------------------------

function talentsView(app) {
  return {
    id: 'talents', title: 'Talents', hint: 'Enter: spend a point',
    keys: {
      u: { hint: 'refund', fn: (a, row) => row?.data && a.result(a.g.refundTalent(row.data.id), `Refunded a point from ${row.data.name}.`) },
      R: { hint: 'respec', fn: (a) => { const cost = a.g.respecCost(); a.confirm(`Reset all talents for ${moneyText(cost) || 'free'}?`, () => a.result(a.g.respec(), 'Your talents are reset.')); } },
    },
    rows(a) {
      const ch = a.ch;
      const free = availablePoints(ch);
      const rows = [{ text: ch.level < 10 ? dim('Talents unlock at level 10.') : `${plural(free, 'point')} to spend`, header: true }];
      for (const tree of a.ds.talentTrees(ch.cls)) {
        rows.push({ text: '', header: true }, { text: `${tree.name}  ${dim(`${spentInTree(ch, tree.tabId, a.ds)} points`)}`, header: true });
        const talents = [...tree.talents].sort((x, y) => x.tier - y.tier || x.col - y.col);
        for (const t of talents) {
          const rank = ch.talents?.[t.id] ?? 0;
          const can = canSpend(ch, t.id, a.ds);
          const paint = rank >= t.maxRank ? brightYellow : can.ok ? green : dim;
          rows.push({
            text: `${paint(t.name)} ${dim(`${rank}/${t.maxRank}`)}${t.prereq ? dim(`  needs ${a.ds.talent(t.prereq.talentId)?.name ?? '?'}`) : ''}`, data: t,
            detail: () => talentLines(a, t, rank, can),
            act: () => a.result(a.g.spendTalent(t.id), `You learn ${t.name} (${(ch.talents?.[t.id] ?? 0) + 1}/${t.maxRank}).`),
          });
        }
      }
      return rows;
    },
  };
}

function talentLines(app, t, rank, can) {
  const out = [bold(t.name) + dim(`  tier ${t.tier + 1}, rank ${rank}/${t.maxRank}`)];
  if (rank > 0) out.push('', cyan('Current rank'), ...wrapLines(t.ranks[rank - 1]?.description ?? '', 60));
  if (rank < t.maxRank) out.push('', cyan(rank ? 'Next rank' : 'Rank 1'), ...wrapLines(t.ranks[rank]?.description ?? '', 60));
  out.push('', can.ok ? green('Enter to spend a point') : red(can.reason ?? 'Cannot spend here yet'));
  if (rank > 0 && canRefund(app.ch, t.id, app.ds).ok) out.push(dim('u refunds a point'));
  return out;
}

// ---- travel --------------------------------------------------------------------------------------

function travelView(app) {
  return {
    id: 'travel', title: 'Travel', hint: 'Enter: go',
    rows(a) {
      const g = a.g, ds = a.ds, z = a.zone(), ch = a.ch;
      const rows = [{ text: `You are in ${cyan(z?.name ?? ch.zoneId)}`, header: true }, { text: '', header: true }, { text: 'On foot', header: true }];
      for (const id of z?.neighbors ?? []) { const d = ds.zone(id); if (d) rows.push({ text: `${d.name} ${dim(`L${d.levelRange[0]}-${d.levelRange[1]}`)}`, detail: () => travelPreviewLines(a, d), act: () => travelTo(a, d) }); }
      const taxi = g.taxiOptions();
      if (taxi.length) {
        rows.push({ text: '', header: true }, { text: 'Flight paths', header: true });
        for (const t of taxi) { const d = ds.zone(t.toZone); if (d) rows.push({ text: `${d.name} ${dim(`${secondsText(t.seconds * 1000)}, ${moneyText(t.priceCopper)}`)}`, detail: () => travelPreviewLines(a, d), act: () => travelTo(a, d) }); }
      }
      rows.push({ text: '', header: true }, { text: 'Hearthstone', header: true });
      const bind = ch.hearthBind;
      const cd = Math.max(0, (ch.hearthCooldownUntil ?? 0) - Date.now());
      rows.push({
        text: bind ? `Hearth to ${ds.zone(bind.zone)?.name ?? bind.zone}${bind.name ? dim(` (${bind.name})`) : ''}${cd > 0 ? red(`  ${secondsText(cd)}`) : ''}` : dim('No home set: speak with an innkeeper.'),
        detail: () => [bold('Hearthstone'), bind ? `Bound at ${bind.name ?? ds.zone(bind.zone)?.name}` : 'Not bound', cd > 0 ? red(`Ready in ${secondsText(cd)}`) : green('Ready')],
        act: () => { const r = g.castHearth(); if (a.result(r)) { g.completeJourneyNow(); a.vendor = null; a.say(`You hearth to ${a.zone()?.name}.`); a.switchTab(0); } },
      });
      const ports = g.classTravelOptions();
      if (ports.length) {
        rows.push({ text: '', header: true }, { text: 'Teleports', header: true });
        for (const p of ports) rows.push({ text: `${p.name} → ${ds.zone(p.toZone)?.name ?? p.toZone}${p.reagents.some((r) => r.have < r.count) ? red('  no reagent') : ''}`, act: () => { const r = g.castTeleport(p.spellId); if (a.result(r)) { g.completeJourneyNow(); a.say(`You teleport to ${a.zone()?.name}.`); a.switchTab(0); } } });
      }
      rows.push(...portalRows(a));
      return rows;
    },
  };
}

// ---- character -----------------------------------------------------------------------------------

function charView(app) {
  return {
    id: 'char', title: 'Character', hint: '', noDetail: true,
    rows(a) {
      const ch = a.ch, ds = a.ds;
      const st = effectiveStats(ch, ds);
      const pt = powerType(ch);
      const L = (t) => ({ text: t, header: true });
      const rows = [
        L(`${bold(ch.name)}  level ${ch.level} ${className(ch.cls)}`),
        L(''),
        L(`Health ${ch.health}/${maxHealth(ch, ds)}    ${pt[0].toUpperCase() + pt.slice(1)} ${ch.power}/${maxPower(ch, ds)}`),
        L(`Experience ${ch.xp}/${ds.xpToNext(ch.level)}${ch.restedXp ? dim(`  (${ch.restedXp} rested)`) : ''}    ${yellow(moneyText(ch.gold) || '0c')}`),
        L(''),
        L(cyan('Attributes')),
        ...Object.entries(STAT_LABEL).map(([k, name]) => L(`  ${fit(name, 10)} ${st[k]}`)),
        L(''),
        L(cyan('Combat')),
        L(`  Armor      ${effectiveArmor(ch, ds)}`),
        L(`  Attack pwr ${attackPower(ch, ds)}`),
        L(`  Crit       ${(critChanceDisplay(ch, ds) * 100).toFixed(2)}%`),
        L(`  Hit        ${((hitChance(ch, ds) ?? 0) * 100).toFixed(2)}%`),
        L(`  Dodge      ${(dodgeChanceDisplay(ch, ds) * 100).toFixed(2)}%`),
        L(''),
      ];
      const skills = Object.entries(ch.skills ?? {});
      if (skills.length) rows.push(L(cyan('Professions')), ...skills.map(([k, v]) => L(`  ${ds.profession(k)?.name ?? k} ${v.value ?? v.rank ?? v}`)), L(''));
      rows.push(L(cyan('Home')), L(`  ${ch.hearthBind ? `${ch.hearthBind.name ?? ''} in ${ds.zone(ch.hearthBind.zone)?.name ?? ch.hearthBind.zone}` : 'none'}`));
      if (hasPetClass(a)) rows.push(L(''), { text: `Pet: ${ch.pet ? ch.pet.name : dim('none out')}   ${dim('Enter: the pet page')}`, act: () => a.push(petDialog(a)) });
      return rows;
    },
  };
}

// ---- NPC dialogs ---------------------------------------------------------------------------------

const VENDOR_MODES = ['buy', 'sell', 'buyback', 'party'];
const VENDOR_MODE_LABEL = { buy: 'Buying', sell: 'Selling', buyback: 'Buyback', party: 'Companions' };

/** Record a sale so the Buyback tab can undo it this session (phonecraft keeps the list caller-side too). */
export function noteSale(app, entry, qty, refundCopper, owner) {
  app.buyback = pushBuyback(app.buyback ?? [], { entry, qty, refundCopper, soldAt: Date.now(), ...(owner ? { owner: owner.id, ownerName: owner.name } : {}) });
}

/** Sell one of your bag stacks at the open vendor, onto the buyback list. */
export function sellStack(app, slot) {
  const s = app.g.state.inventory.stacks[slot];
  if (!s) return;
  const r = app.g.sellItemStack(slot, s.count);
  if (app.result(r, r.ok ? `Sold ${app.itemName(s.item)}${r.qty > 1 ? ` x${r.qty}` : ''} for ${moneyText(r.earned)}.` : '')) noteSale(app, s.item, r.qty, r.earned);
}

/** Sell every junk-filter match, each onto the buyback list. */
export function sellJunk(app) {
  const preview = app.g.junkSellPreview();
  const r = app.g.sellAllJunk();
  if (!app.result(r, r.ok ? `Sold ${plural(r.count, 'junk item')} for ${moneyText(r.earned)}.` : '')) return;
  for (const p of preview) noteSale(app, p.entry, p.count, p.unitSell * p.count);
}

// Buy a sale back: a companion's stack goes home to that companion (vendorBuybackRun.ts).
function buyBackAt(app, i) {
  const list = app.buyback ?? [], e = list[i];
  if (!e) return;
  if (e.owner) {
    const r = app.g.buyBackCompanionStack(e.owner, e.entry, e.qty, e.refundCopper);
    if (app.result(r, r.ok ? `${app.itemName(e.entry)} goes back to ${e.ownerName}.` : '')) app.buyback = list.filter((_, j) => j !== i);
    return;
  }
  const r = buyBackDomain(app.g.state.char, app.g.state.inventory, list, i, app.ds.item(e.entry)?.stackable, bagCapacity(app.ch, app.ds));
  if (!r.ok) { app.say(red(r.reason ?? 'Cannot buy that back.')); return; }
  app.g.state.char = r.char; app.g.state.inventory = r.inventory; app.buyback = r.buyback;
  app.say(green(`You buy back ${app.itemName(e.entry)}${e.qty > 1 ? ` x${e.qty}` : ''} for ${moneyText(e.refundCopper)}.`));
}

export function vendorDialog(app, vendor) {
  app.vendor = vendor; app.cmds.setVendor(vendor);
  let mode = 'buy';
  const hints = { buy: 'Enter: buy   Tab: next', sell: 'Enter: sell   Tab: next', buyback: 'Enter: buy back   Tab: next', party: 'Enter: sell for them   Tab: next' };
  const view = {
    id: `vendor-${vendor.entry}`, title: vendor.name, hint: hints.buy,
    keys: {
      B: { hint: 'buy many', fn: (a, row) => { if (mode === 'buy' && row?.data) a.prompt(`How many ${a.itemName(row.data.itemEntry)}? `, (t) => { const n = Number(t); if (n > 0) buy(a, row.data, n); a.afterAction(); }); } },
      j: { hint: 'sell junk', fn: (a, row) => {
        if (mode !== 'party') { sellJunk(a); return; }
        const comp = row?.data?.comp;
        if (!comp) return;
        const r = a.g.sellCompanionJunk(comp.id);
        if (a.result(r, r.ok ? `Sold ${plural(r.count, 'junk item')} of ${comp.name}'s for ${moneyText(r.earned)}.` : '')) for (const x of r.sold) noteSale(a, x.entry, x.qty, x.refundCopper, comp);
      } },
      ...(vendor.canRepair ? { r: { hint: 'repair', fn: (a) => { const r = a.g.repairAll(vendor.entry); a.result(r, r.ok ? (r.spent ? `Repaired for ${moneyText(r.spent)}.` : 'Nothing needs repair.') : ''); } } } : {}),
    },
    onKey(a, k) {
      if (k !== 'tab' && k !== 'shift-tab') return false;
      const i = VENDOR_MODES.indexOf(mode) + (k === 'tab' ? 1 : -1);
      mode = VENDOR_MODES[(i + VENDOR_MODES.length) % VENDOR_MODES.length];
      view.cursor = 0; view.scroll = 0; view.hint = hints[mode];
      return true;
    },
    onClose(a) { /* the vendor stays "open" for :buy / s in bags until you travel */ },
    rows(a) {
      const tabs = `${bold(VENDOR_MODE_LABEL[mode])} ${dim(`${VENDOR_MODES.indexOf(mode) + 1}/${VENDOR_MODES.length}`)}`;
      const rows = [{ text: `${bold(vendor.name)} ${dim(`<${vendor.subname ?? 'Vendor'}>`)}   ${tabs}   ${yellow(moneyText(a.ch.gold) || '0c')}`, header: true }, { text: '', header: true }];
      if (mode === 'buy') {
        const offers = a.g.vendorOffers(vendor.entry);
        const uses = reagentUses(a);
        if (!offers.length) rows.push({ text: dim('Nothing for sale.'), header: true });
        for (const o of offers) {
          const it = a.ds.item(o.itemEntry);
          const ok = o.affordable && o.meetsRequirements && o.inStock && o.fits;
          const name = `${qualityPaint(it?.quality)(it?.name ?? o.itemEntry)}${o.unitsPerPurchase > 1 ? ` x${o.unitsPerPurchase}` : ''}`;
          const price = o.honorPrice ? `${o.honorPrice} honor` : moneyText(o.pricePerPurchase);
          const why = !o.meetsRequirements ? red(`  ${o.requirementReason ?? 'requirements not met'}`) : !o.affordable ? red('  too expensive') : !o.inStock ? red('  out of stock') : !o.fits ? red('  bags full') : '';
          const usedBy = uses.get(o.itemEntry);
          rows.push({
            text: `${ok ? name : dim(name)}  ${yellow(price)}${o.stockRemaining != null ? dim(`  ${o.stockRemaining} left`) : ''}${it?.requiredLevel > a.ch.level ? red(`  L${it.requiredLevel}`) : ''}${usedBy ? cyan('  reagent') : ''}${why}`, data: o,
            detail: () => itemLines(a, it, ['', `Price: ${yellow(price)}`, ...(o.basePricePerPurchase !== o.pricePerPurchase ? [dim(`(${moneyText(o.basePricePerPurchase)} before reputation)`)] : []),
              ...(usedBy ? ['', cyan('Your party crafts with it'), ...usedBy.slice(0, 6).map((n) => `  ${n}`), ...(usedBy.length > 6 ? [dim(`  and ${usedBy.length - 6} more`)] : []), dim('Crafting buys it for you when you run short.')] : [])]),
            act: () => buy(a, o, 1),
          });
        }
      } else if (mode === 'sell') {
        const st = a.g.state.inventory.stacks;
        const junk = a.g.junkSellPreview();
        if (junk.length) rows.push({ text: dim(`j sells ${plural(junk.reduce((n, p) => n + p.count, 0), 'junk item')} for ${moneyText(junk.reduce((n, p) => n + p.unitSell * p.count, 0))}`), header: true });
        if (!st.length) rows.push({ text: dim('Your bags are empty.'), header: true });
        st.forEach((s, slot) => {
          const it = a.ds.item(s.item);
          const total = (it?.sellPrice ?? 0) * s.count;
          rows.push({
            text: `${qualityPaint(it?.quality)(it?.name ?? s.item)}${s.count > 1 ? ` x${s.count}` : ''}  ${total ? yellow(moneyText(total)) : dim('no value')}`, data: s,
            detail: () => itemLines(a, it, ['', dim('Enter: sell the stack (you can buy it back on the Buyback tab)')]),
            act: () => sellStack(a, slot),
          });
        });
      } else if (mode === 'buyback') {
        const list = a.buyback ?? [];
        if (!list.length) rows.push({ text: dim('Nothing sold here this session.'), header: true });
        list.forEach((e, i) => {
          const it = a.ds.item(e.entry);
          rows.push({
            text: `${qualityPaint(it?.quality)(it?.name ?? e.entry)}${e.qty > 1 ? ` x${e.qty}` : ''}  ${yellow(moneyText(e.refundCopper))}${e.ownerName ? dim(`  back to ${e.ownerName}`) : ''}`,
            detail: () => itemLines(a, it, ['', `Buy back for ${yellow(moneyText(e.refundCopper))}`]),
            act: () => buyBackAt(a, i),
          });
        });
      } else {
        const comps = [...(a.g.state.squad ?? []), ...Object.values(a.g.state.botRoster ?? {})];
        if (!comps.length) rows.push({ text: dim('No companions to sell for.'), header: true });
        for (const comp of comps) {
          const bags = comp.bags?.stacks ?? [];
          const junk = a.g.companionJunkSellPreview(comp.id);
          rows.push({ text: '', header: true }, { text: `${comp.name}${junk.length ? dim(`   j: sell ${plural(junk.reduce((n, p) => n + p.count, 0), 'junk item')}`) : ''}`, header: true });
          if (!bags.length) rows.push({ text: dim('  Empty bags.'), header: true });
          bags.forEach((s, slot) => {
            const it = a.ds.item(s.item);
            rows.push({
              text: `  ${qualityPaint(it?.quality)(it?.name ?? s.item)}${s.count > 1 ? ` x${s.count}` : ''}  ${it?.sellPrice ? yellow(moneyText(it.sellPrice * s.count)) : dim('no value')}`, data: { comp, s },
              detail: () => itemLines(a, it, ['', dim(`Enter: sell it out of ${comp.name}'s bags   j: sell their junk`)]),
              act: () => { const r = a.g.sellCompanionItemStack(comp.id, slot); if (a.result(r, r.ok ? `Sold ${comp.name}'s ${it?.name}${r.qty > 1 ? ` x${r.qty}` : ''} for ${moneyText(r.earned)}.` : '')) noteSale(a, s.item, r.qty, r.earned, comp); },
            });
          });
        }
      }
      return rows;
    },
  };
  return view;
}

function buy(app, offer, n) {
  const r = app.g.buyItem(app.vendor.entry, offer.itemEntry, n);
  app.result(r, r.ok ? `Bought ${app.itemName(offer.itemEntry)}${n > 1 ? ` x${n}` : ''} for ${moneyText(r.spent)}.` : '');
}

export function trainerDialog(app, trainer) {
  const known = () => new Set(app.g.state.spellbook.known);
  const learnable = () => trainer.spells
    .filter((ts) => ts.reqLevel <= app.ch.level && !known().has(ts.spell))
    .map((ts) => ({ ts, sp: app.ds.spell(ts.spell) })).filter((x) => x.sp)
    .sort((x, y) => x.ts.reqLevel - y.ts.reqLevel || x.sp.name.localeCompare(y.sp.name));
  return {
    id: `trainer-${trainer.entry}`, title: trainer.name, hint: 'Enter: learn',
    keys: { A: { hint: 'learn all', fn: (a) => { let n = 0; for (const { sp } of learnable()) if (a.g.learnFromTrainer(trainer.entry, sp.id).ok) { n++; a.say(green(`You have learned ${sp.name}${sp.rank ? ` (Rank ${sp.rank})` : ''}.`)); } if (!n) a.say('Nothing learned.'); } } },
    rows(a) {
      const rows = [{ text: `${bold(trainer.name)} ${dim(`<${trainer.subname ?? `${className(a.ch.cls)} Trainer`}>`)}   ${yellow(moneyText(a.ch.gold) || '0c')}`, header: true }, { text: '', header: true }, { text: 'Available now', header: true }];
      const now = learnable();
      if (!now.length) rows.push({ text: dim('  Nothing new at your level.'), header: true });
      for (const { sp, ts } of now) {
        const can = ts.cost <= a.ch.gold;
        rows.push({
          text: `${can ? sp.name : dim(sp.name)}${sp.rank ? dim(` (Rank ${sp.rank})`) : ''}  ${yellow(moneyText(ts.cost) || 'free')}`, data: sp,
          detail: () => spellLines(a, sp, ['', `Cost: ${yellow(moneyText(ts.cost) || 'free')}`]),
          act: () => a.result(a.g.learnFromTrainer(trainer.entry, sp.id), `You have learned ${sp.name}${sp.rank ? ` (Rank ${sp.rank})` : ''}.`),
        });
      }
      const later = trainer.spells.filter((ts) => ts.reqLevel > a.ch.level && !known().has(ts.spell)).map((ts) => ({ ts, sp: a.ds.spell(ts.spell) })).filter((x) => x.sp).sort((x, y) => x.ts.reqLevel - y.ts.reqLevel).slice(0, 12);
      if (later.length) {
        rows.push({ text: '', header: true }, { text: 'Coming up', header: true });
        for (const { sp, ts } of later) rows.push({ text: dim(`${sp.name}${sp.rank ? ` (Rank ${sp.rank})` : ''}  level ${ts.reqLevel}  ${moneyText(ts.cost)}`), header: true });
      }
      return rows;
    },
  };
}

export function innDialog(app, inn) {
  return {
    id: `inn-${inn.entry}`, title: inn.name, hint: 'Enter: choose', noDetail: true,
    rows(a) {
      const bound = a.ch.hearthBind?.name === inn.name;
      return [
        { text: `${bold(inn.name)} ${dim('<Innkeeper>')}`, header: true }, { text: '', header: true },
        { text: bound ? dim('This inn is already your home.') : 'Make this inn your home', act: () => { if (!bound) a.result(a.g.bindHearth(), `${inn.name} sets your hearthstone to ${a.zone()?.name}.`); } },
        { text: 'Rest here for a while (60 s)', act: () => { a.idleTick(60, true); a.say(dim(`You rest at the inn.  HP ${a.hpText()}  ${a.pwText()}`)); } },
        { text: dim('Goodbye'), act: () => a.pop() },
      ];
    },
  };
}

export function deathView(app) {
  return {
    id: 'death', title: 'You are dead', hint: 'Enter: choose', noDetail: true,
    rows(a) {
      const s = a.g.deathFlowStatus();
      if (!s || !a.isDead()) { setTimeout(() => { if (a.top()?.id === 'death') a.pop(); }, 0); return [{ text: 'You live.', header: true }]; }
      const rows = [{ text: red(bold('You have died.')) + dim(`  (${s.deathState})`), header: true }, { text: '', header: true }];
      rows.push({ text: 'Release spirit and run to your corpse', act: () => a.result(a.g.runToCorpse(), 'You release your spirit and run back to your corpse.') });
      rows.push({ text: s.canReclaim ? (s.reclaimReady ? green('Reclaim your corpse') : `Reclaim your corpse ${dim(`(${secondsText(s.reclaimReadyInMs)})`)}`) : dim('Reclaim your corpse (release first)'), act: () => { if (a.result(a.g.reclaimCorpse(), `You return to life.  HP ${a.hpText()}`)) a.pop(); } });
      rows.push({ text: `Ask the spirit healer to return you ${dim('(resurrection sickness, durability loss)')}`, act: () => { if (a.result(a.g.spiritHealerResurrect(), `The spirit healer returns you to life.  HP ${a.hpText()}`)) a.pop(); } });
      return rows;
    },
  };
}
