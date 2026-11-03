// The rest of a companion's page and the party-wide companion dialogs: spec, talent link, AoE, off-heal and xp
// lock; their pet; their quests; their bags and bank; the tavern duel; consumable sharing, the party vault
// and the hire search. Ports of phonecraft companionsPanel.ts, companionKitPanel.ts and consumableSharePanel.ts.
import { bold, dim, cyan, yellow, green, red, qualityPaint, fit, plural, itemText, coinText } from './text.mjs';
import { itemLines, noteSale } from './tuiViews.mjs';
import { companionUseWithPicker } from './tuiEnchantTarget.mjs';
import { startFight } from './tuiFight.mjs';
import { className } from '../domain/core/ids.ts';
import { companionLevel, companionCharacter } from '../domain/bots/squad.ts';
import { listTameablePets, unlockedWarlockDemons, WARLOCK_DEMONS, WARLOCK_DEMON_UNLOCK } from '../domain/bots/botPet.ts';
import { petKnownSpells, petAutocastOn } from '../domain/pet/pet.ts';
import { MAX_QUEST_SLOTS } from '../domain/quests/questlog.ts';
import { SHARE_CATEGORIES, SHARE_CATEGORY_LABEL, SHARE_GROUPS } from '../domain/bots/consumableShare.ts';

const H = (text) => ({ text, header: true });
const HUNTER = 3, WARLOCK = 9;
const AOE_MODES = ['auto', 'aoe', 'single'];
const AOE_LABEL = { auto: 'Auto (two or more enemies)', aoe: 'Prefer area spells', single: 'Single target only' };
const allOwned = (g) => [...(g.state.squad ?? []), ...Object.values(g.state.botRoster ?? {})];
const findComp = (app, id) => allOwned(app.g).find((c) => c.id === id) ?? null;

// ---- settings ----------------------------------------------------------------------------------------

export function settingsRows(app, comp) {
  const g = app.g, id = comp.id, ds = app.ds;
  const specs = ds.botSpecs(comp.cls) ?? [];
  const spec = comp.talentLink ? null : specs[comp.specIdx];
  const rows = [H(''), H('How they play')];
  rows.push({
    text: `Spec: ${cyan(comp.talentLink ? 'own talent link' : spec?.name ?? 'premade')}`,
    detail: () => [bold('Spec'), '', 'A premade playerbot build for their class. Respeccing is free and leaves the rotation alone.', ...specs.map((s, i) => `${i === comp.specIdx && !comp.talentLink ? green('●') : dim('·')} ${s.name}`)],
    act: () => app.pick(`${comp.name}: which build?`, specs.map((s, i) => ({ label: `${i === comp.specIdx ? green('● ') : '  '}${s.name}`, value: i })), (i) => { const r = g.setCompanionSpec(id, i); app.result(r, r.ok ? `${comp.name} respecs to ${r.name}.` : ''); }),
  });
  rows.push({
    text: `Talent link: ${comp.talentLink ? cyan(comp.talentLink.slice(0, 28)) : dim('none')}`,
    detail: () => [bold('Talent link'), '', 'A classic talent string (the digits a talent calculator gives). It replaces the premade build until you pick one again.', '', dim('Enter: type one, empty clears it')],
    act: () => app.prompt('Talent link (empty clears): ', (t) => { const r = g.setCompanionTalentLink(id, t.trim() || null); app.result(r, r.ok ? `${comp.name}: ${r.name}.` : ''); app.afterAction(); }, comp.talentLink ?? ''),
  });
  const aoe = comp.aoeMode ?? 'auto';
  rows.push({
    text: `Area spells: ${cyan(AOE_LABEL[aoe])}`,
    detail: () => [bold('Area spells'), '', ...AOE_MODES.map((m) => `${m === aoe ? green('●') : dim('·')} ${AOE_LABEL[m]}`), '', dim('Enter: next')],
    act: () => { const next = AOE_MODES[(AOE_MODES.indexOf(aoe) + 1) % AOE_MODES.length]; app.result(g.setCompanionAoeMode(id, next), `${comp.name}: ${AOE_LABEL[next].toLowerCase()}.`); },
  });
  rows.push({
    text: `Emergency heals: ${comp.offHeal ? green('on') : dim('off')}`,
    detail: () => [bold('Off-heal'), '', 'A hybrid on damage duty stops to heal someone about to die.', '', dim('Enter: switch')],
    act: () => app.result(g.setCompanionOffHeal(id, !comp.offHeal), `${comp.name}: emergency heals ${comp.offHeal ? 'off' : 'on'}.`),
  });
  rows.push({
    text: `Experience: ${comp.xpLocked ? yellow('locked') : green('gaining')}`,
    detail: () => [bold('Experience lock'), '', 'Locked, they stay at their level however much they kill: a twink stays a twink.', '', dim('Enter: switch')],
    act: () => app.result(g.setCompanionXpLocked(id, !comp.xpLocked), `${comp.name} ${comp.xpLocked ? 'gains experience again' : 'stops gaining experience'}.`),
  });
  if (g.innkeeperHere()) {
    rows.push({ text: `Duel ${comp.name} in the tavern`, detail: () => [bold('Tavern duel'), '', 'A friendly bout: the loser yields at 1 health. No gold, loot, experience or wear.', '', dim('Esc in the fight yields')], act: () => tavernDuel(app, id) });
  }
  return rows;
}

/** A trial bout against a companion or a face at the inn, in the live fight view. Pays nothing. */
export function tavernDuel(app, targetId) {
  const res = app.g.tavernDuel(targetId);
  if (!app.result(res)) return;
  startFight(app, 0, {
    label: 'duel',
    begin: () => ({ ok: true, session: res.session, enemyName: res.targetName, enemyEntry: 0 }),
    resolve: (s) => {
      const r = s.result();
      const won = r.winner === 'player';
      return { ok: true, outcome: r.winner === 'timeout' ? 'timeout' : won ? 'win' : 'defeat', result: r, xpGained: 0, goldGained: 0, loot: [], leveledTo: [], killCount: 0 };
    },
    onEnd: (r) => { if (r) app.say(r.outcome === 'win' ? green(`${res.targetName} yields.`) : r.outcome === 'defeat' ? yellow(`You yield to ${res.targetName}.`) : dim('Neither of you gives way.')); },
  });
}

// ---- pet --------------------------------------------------------------------------------------------

export function petRows(app, comp) {
  if (comp.cls !== HUNTER && comp.cls !== WARLOCK) return [];
  const g = app.g, ds = app.ds, id = comp.id, lvl = companionLevel(comp, app.ch.level);
  const pet = comp.pet;
  const rows = [H(''), H(`Pet ${pet ? cyan(pet.name) : dim('none yet')}`)];
  rows.push({
    text: comp.cls === HUNTER ? 'Tame another beast…' : 'Summon another demon…',
    detail: () => [bold('Pet'), '', comp.cls === HUNTER ? `Any tameable beast up to level ${lvl}. Its abilities rank with ${comp.name}.` : 'Imp at 1, Voidwalker at 10, Succubus at 20, Felhunter at 30.'],
    act: () => {
      let opts;
      if (comp.cls === HUNTER) {
        opts = listTameablePets(lvl, ds).map((e) => ds.creature(e)).filter(Boolean)
          .sort((x, y) => (x.level ?? 1) - (y.level ?? 1) || x.name.localeCompare(y.name))
          .map((c) => ({ label: `${pet?.creature === c.entry ? green('● ') : '  '}${c.name} ${dim(`L${c.level}${c.family ? `  family ${c.family}` : ''}`)}`, value: c.entry }));
      } else {
        const open = new Set(unlockedWarlockDemons(lvl));
        opts = WARLOCK_DEMONS.map((e) => ({ label: `${pet?.creature === e ? green('● ') : '  '}${open.has(e) ? ds.creature(e)?.name : dim(`${ds.creature(e)?.name}  level ${WARLOCK_DEMON_UNLOCK[e]}`)}`, value: e }));
      }
      app.pick(`${comp.name}: pet`, opts, (entry) => { const r = g.setCompanionPet(id, entry); app.result(r, r.ok ? `${comp.name} calls ${r.name}.` : ''); });
    },
  });
  const cdef = pet ? ds.creature(pet.creature) : null;
  if (pet && cdef && pet.health > 0) {
    const shell = { ...companionCharacter(comp, lvl, ds), pet, petSpells: comp.petSpells ?? [] };
    for (const s of petKnownSpells(shell, cdef, ds)) {
      const on = petAutocastOn(pet, s, ds);
      rows.push({ text: `  ${on ? green('✓') : dim('·')} ${s.name}${s.rank ? dim(` (Rank ${s.rank})`) : ''}`, detail: () => [bold(s.name), on ? 'Autocast on: the pet uses it on its own.' : 'Autocast off.', '', dim('Enter: switch')], act: () => app.result(g.setCompanionPetAutocast(id, s.id, !on)) });
    }
  }
  return rows;
}

// ---- quests and books ------------------------------------------------------------------------------------

export function questRows(app, comp) {
  const g = app.g, ds = app.ds, id = comp.id;
  const offers = g.companionQuestOffers(id);
  const log = (comp.questLog?.quests ?? []).filter((q) => q.status !== 'turnedIn');
  if (!offers.length && !log.length) return [];
  // Ones you already handed in: their copy never completed (the items never reached their bags), so it
  // only holds a slot now.
  const yoursDone = new Set(g.state.questlog.quests.filter((q) => q.status === 'turnedIn').map((q) => q.entry));
  const stale = log.filter((qs) => qs.status !== 'complete' && yoursDone.has(qs.entry));
  const rows = [H(''), H(`Their quests ${dim(`${log.length}/${MAX_QUEST_SLOTS} in the log   x: abandon`)}`)];
  if (stale.length) {
    const titles = stale.map((qs) => ds.quest(qs.entry)?.title ?? qs.entry);
    rows.push({
      text: yellow(`Drop the ${plural(stale.length, 'quest')} you already handed in`),
      detail: () => [bold('Handed in without them'), '', 'You turned these in, but their copy never completed, usually because the quest item never reached their bags. They hold log slots, and a full log refuses shared quests.', '', ...titles.map((t) => `  ${t}`)],
      act: () => app.confirm(`${comp.name} abandons ${plural(stale.length, 'quest')}: ${titles.join(', ')}?`, () => {
        let n = 0;
        for (const qs of stale) if (g.abandonCompanionQuest(id, qs.entry).ok) n++;
        app.say(dim(`${comp.name} abandons ${plural(n, 'quest')}.`));
      }),
    });
  }
  for (const o of offers) {
    rows.push({
      text: o.kind === 'turn-in' ? `${green('?')} Hand in ${o.title}` : `${yellow('!')} Take ${o.title}${o.itemEntry ? dim(`  from ${app.itemLabel(o.itemEntry)}`) : ''}`,
      detail: () => [bold(o.title), o.kind === 'turn-in' ? 'Ready to hand in: rewards go to them, the money to you.' : 'They can take this one here.'],
      act: () => {
        if (o.kind === 'accept') { app.result(g.acceptCompanionQuest(id, o.quest), `${comp.name} takes ${o.title}.`); return; }
        const q = ds.quest(o.quest);
        const finish = (choice) => { const r = g.turnInCompanionQuest(id, o.quest, choice); app.result(r, r.ok ? `${comp.name} hands in ${o.title}${r.xp ? `: +${r.xp} xp` : ''}${r.money ? `, ${coinText(r.money)} to you` : ''}.` : ''); };
        if (q?.rewChoiceItems?.length > 1) app.pick(`${comp.name}: choose a reward`, q.rewChoiceItems.map((it, i) => ({ label: app.itemLabel(it.item), detail: () => itemLines(app, ds.item(it.item)), value: i })), finish);
        else finish(0);
      },
    });
  }
  for (const qs of log) {
    const q = ds.quest(qs.entry);
    const done = qs.status === 'complete' ? green('(Complete)') : yoursDone.has(qs.entry) ? dim('(you handed it in)') : '';
    rows.push({ text: `  ${q?.title ?? qs.entry} ${done}`, detail: () => [bold(q?.title ?? ''), '', dim('x: abandon')], keys: { x: (a) => a.confirm(`${comp.name} abandons ${q?.title}?`, () => a.result(g.abandonCompanionQuest(id, qs.entry), `${comp.name} abandons ${q?.title}.`)) } });
  }
  return rows;
}

/** Read a class book or pet grimoire from your bags on them. */
export function teachRow(app, comp) {
  const g = app.g, ds = app.ds;
  const books = app.g.state.inventory.stacks.map((s) => ds.item(s.item)).filter((it) => it && it.itemClass === 9 && !it.teachRecipe && !it.teachEnchant);
  if (!books.length) return [];
  return [{
    text: `Teach them from a book… ${dim(`(${books.length})`)}`,
    detail: () => [bold('Books and grimoires'), '', 'A class book or a pet grimoire in your bags, read on them. The book is used up.', '', ...books.map((b) => `  ${b.name}`)],
    act: () => app.pick(`Teach ${comp.name}`, books.map((b) => ({ label: b.name, detail: () => itemLines(app, b), value: b })), (b) => {
      const r = b.teachPetSpell ? g.learnPetSpellFromItemOnCompanion(comp.id, b.entry) : g.learnSpellFromItemOnCompanion(comp.id, b.entry);
      app.result(r, r.ok ? `${comp.name} learns ${r.name}.` : '');
    }),
  }];
}

// ---- bags and bank -------------------------------------------------------------------------------------

/** Their bags: Enter takes a stack, u uses it on them, d destroys, s sells at the open vendor, e disenchants,
 *  m hands it to another companion, b puts it in their bank. */
export function bagRows(app, comp, cap) {
  const g = app.g, ds = app.ds, id = comp.id;
  const bags = comp.bags?.stacks ?? [];
  const rows = [H(''), H(`Their bags ${dim(`${bags.length}/${cap}   Enter: take  u: use  s: sell  e: disenchant  m: give to  b: bank  d: destroy`)}`)];
  if (!bags.length) rows.push(H(dim('  Empty.')));
  bags.forEach((s, slot) => {
    const it = ds.item(s.item);
    const name = `${itemText(it, 'it')}${s.count > 1 ? ` x${s.count}` : ''}`;
    rows.push({
      text: `${qualityPaint(it?.quality)(it?.name ?? s.item)}${s.count > 1 ? ` x${s.count}` : ''}`,
      icon: it?.icon, sub: dim(`${it?.typeName ?? ''}${it?.sellPrice ? `  sells ${coinText(it.sellPrice * s.count)}` : ''}`),
      detail: () => itemLines(app, it, ['', dim('Enter: take it   u: use on them   s: sell   e: disenchant   m: to another companion   b: their bank   d: destroy')]),
      act: () => { const r = g.takeItemFromBotStack(id, slot); app.result(r, `You take ${it?.name ?? 'it'}${r.moved > 1 ? ` x${r.moved}` : ''} from ${comp.name}.`); },
      keys: {
        u: (a) => companionUseWithPicker(a, comp, s.item),
        d: (a) => a.confirm(`Destroy ${name} from ${comp.name}'s bags?`, () => a.result(g.discardCompanionBagStack(id, slot), `Destroyed ${name}.`)),
        s: (a) => { if (!a.vendor) { a.flashMsg('Open a vendor first.'); return; } const r = g.sellCompanionItemStack(id, slot); if (a.result(r, r.ok ? `Sold ${name} for ${coinText(r.earned)}.` : '')) noteSale(a, s.item, r.qty, r.earned, comp); },
        e: (a) => { const r = g.disenchantCompanionBagStack(id, slot); a.result(r, r.ok ? `It breaks into ${r.yielded.map((y) => `${a.itemLabel(y.item)}${y.count > 1 ? ` x${y.count}` : ''}`).join(', ')}.` : ''); },
        b: (a) => a.result(g.companionBankDepositStack(id, slot), `${name} goes into ${comp.name}'s bank.`),
        m: (a) => {
          const others = allOwned(g).filter((c) => c.id !== id);
          if (!others.length) { a.flashMsg('Nobody else to hand it to.'); return; }
          a.pick(`Give ${name} to`, others.map((c) => ({ label: `${c.name} ${dim(className(c.cls))}`, value: c })), (to) => a.result(g.moveItemBetweenBots(id, slot, to.id), `${comp.name} hands ${name} to ${to.name}.`));
        },
      },
    });
  });
  return rows;
}


export function bankRows(app, comp) {
  const g = app.g, ds = app.ds, id = comp.id;
  const bank = comp.bank?.stacks ?? [];
  const rows = [H(''), H(`Their bank ${dim(`${bank.length} stacks   Enter: back to their bags`)}`)];
  bank.forEach((s, slot) => {
    const it = ds.item(s.item);
    rows.push({ text: `${qualityPaint(it?.quality)(it?.name ?? s.item)}${s.count > 1 ? ` x${s.count}` : ''}`, icon: it?.icon, sub: dim(it?.typeName ?? ''), detail: () => itemLines(app, it), act: () => app.result(g.companionBankWithdrawStack(id, slot), `${it?.name} comes back out.`) });
  });
  const bagSlots = comp.bankBags ?? [];
  rows.push({ text: dim('Buy them another bank bag slot'), detail: () => [bold('Bank bag slot'), '', 'Paid from your purse; the price climbs with each slot like your own.'], act: () => { const r = g.buyCompanionBankSlot(id); app.result(r, r.ok ? `A new bank bag slot for ${comp.name}: ${coinText(r.cost)}.` : ''); } });
  const bagsInBags = g.state.inventory.stacks.map((s) => ds.item(s.item)).filter((it) => it?.slot === 'bag');
  if (bagsInBags.length) {
    const free = bagSlots.map((b, i) => (b == null ? i : -1)).filter((i) => i >= 0);
    if (free.length) rows.push({ text: dim('Put one of your bags in their empty bank bag slot…'), act: () => app.pick('Which bag?', bagsInBags.map((b) => ({ label: b.name, value: b })), (b) => app.result(g.equipCompanionBankBag(id, b.entry, free[0]), `${b.name} goes into ${comp.name}'s bank.`)) });
  }
  bagSlots.forEach((b, i) => { if (b != null) rows.push({ text: dim(`Take ${ds.item(b)?.name ?? 'the bag'} out of bank slot ${i + 1}`), act: () => app.result(g.unequipCompanionBankBag(id, i)) }); });
  return rows;
}

// ---- party-wide dialogs ------------------------------------------------------------------------------------

/** Share consumables: every shareable stack in your bags, who would take how many, and the rules. */
export function shareDialog(app) {
  const ruleText = (r) => (!r ? 'auto' : r.kind === 'group' ? `to ${r.group}s` : r.kind === 'class' ? `to ${className(r.cls)}s` : r.kind === 'one' ? `to ${findComp(app, r.companionId)?.name ?? 'one'}` : r.kind);
  return {
    id: 'share', title: 'Share consumables', hint: 'Enter: hand this one over',
    keys: {
      A: { hint: 'share all', fn: (a) => { const r = a.g.applySquadConsumablePlan(); a.result(r, r.ok ? `${plural(r.moved, 'item')} handed out.${r.skipped.length ? ` Bags full: ${r.skipped.join(', ')}.` : ''}` : ''); } },
      r: { hint: 'rule', fn: (a, row) => { if (row?.data?.key) pickShareRule(a, row.data); } },
      o: { hint: 'scope', fn: (a) => { const st = a.g.consumableShareState(); a.result(a.g.setConsumableShareScope(st.scope === 'raid' ? 'party' : 'raid')); } },
      y: { hint: 'you count', fn: (a) => { const st = a.g.consumableShareState(); a.result(a.g.setConsumableShareIncludeYou(st.includeYou === false)); } },
      c: { hint: 'kits', fn: (a) => pickShareCats(a) },
    },
    rows(a) {
      const st = a.g.consumableShareState();
      const plan = a.g.squadConsumableDetail();
      const rows = [H(`${bold('Share consumables')}   ${dim(`to the ${st.scope === 'raid' ? 'raid group' : 'party'}, you ${st.includeYou === false ? 'do not count' : 'count as one'}`)}`), H('')];
      if (!plan.length) rows.push(H(dim('  Nothing in your bags to share: potions, elixirs, food buffs, coats, devices, bandages, ammo, reagents.')));
      for (const e of plan) {
        const given = e.rows.reduce((n, r) => n + r.count, 0);
        rows.push({
          text: `${fit(a.itemLabel(e.entry), 28)} ${dim(`x${e.have}`)}  ${given ? green(`${given} out`) : dim('nobody')}  ${dim(`keep ${e.kept}  ${ruleText(st.rules?.[e.key])}`)}`, data: e,
          detail: () => [bold(a.itemLabel(e.entry)), dim(SHARE_CATEGORY_LABEL[e.category] ?? e.category), '', ...e.rows.map((r) => `  ${r.companionName} ${r.count}  ${dim(r.why)}`), ...(e.blocked.length ? ['', ...e.blocked.map((b) => red(`  ${b}`))] : []), '', dim('Enter: hand this one over   r: rule')],
          act: () => { const r = a.g.applySquadConsumablePlan(e.entry); a.result(r, r.ok ? `${plural(r.moved, 'item')} handed out.` : ''); },
        });
      }
      return rows;
    },
  };
}

function pickShareRule(app, e) {
  const members = app.g.consumableShareMembers().filter((m) => !e.excluded?.includes(m.id));
  const opts = [
    { label: 'Auto (whoever gains the most)', value: null },
    { label: 'Even split', value: { kind: 'even' } },
    ...SHARE_GROUPS.map((gr) => ({ label: `All to ${gr}s`, value: { kind: 'group', group: gr } })),
    ...[...new Set(members.map((m) => m.cls))].map((cls) => ({ label: `All to ${className(cls)}s`, value: { kind: 'class', cls } })),
    ...members.map((m) => ({ label: `All to ${m.name}`, value: { kind: 'one', companionId: m.id } })),
    { label: 'Keep it', value: { kind: 'keep' } },
  ];
  app.pick(`${app.itemLabel(e.entry)}: who gets it?`, opts, (rule) => app.result(app.g.setConsumableShareRule(e.key, rule)));
}

function pickShareCats(app) {
  const off = new Set(app.g.consumableShareState().off ?? []);
  app.pick('Which kits are shared?', SHARE_CATEGORIES.map((c) => ({ label: `${off.has(c) ? dim('·') : green('✓')} ${SHARE_CATEGORY_LABEL[c]}`, value: c })), (c) => app.result(app.g.setConsumableShareCat(c, off.has(c))));
}

/** The party vault: every item your companions carry or bank, by item; Enter sweeps it into your bags. */
export function vaultDialog(app) {
  return {
    id: 'vault', title: 'Party storage', hint: 'Enter: take it all',
    rows(a) {
      const totals = new Map();
      for (const c of allOwned(a.g)) for (const s of [...(c.bags?.stacks ?? []), ...(c.bank?.stacks ?? [])]) {
        const t = totals.get(s.item) ?? { count: 0, who: new Set() };
        t.count += s.count; t.who.add(c.name); totals.set(s.item, t);
      }
      const rows = [H(`${bold('Party storage')}   ${dim('what your companions carry and bank')}`), H('')];
      if (!totals.size) rows.push(H(dim('  Your companions carry nothing.')));
      for (const [entry, t] of [...totals].sort((x, y) => a.itemName(x[0]).localeCompare(a.itemName(y[0])))) {
        const it = a.ds.item(entry);
        rows.push({
          text: `${qualityPaint(it?.quality)(it?.name ?? entry)} ${dim(`x${t.count}  ${[...t.who].join(', ')}`)}`,
          detail: () => itemLines(a, it, ['', dim('Enter: take every one of them into your bags (soulbound stays)')]),
          act: () => { const r = a.g.takeFromPartyStorage(entry); a.result(r, r.ok ? `You take ${r.moved} ${itemText(it)}.${r.bound ? ` ${r.bound} are soulbound and stay.` : ''}${r.full ? ' Your bags are full.' : ''}` : ''); },
        });
      }
      return rows;
    },
  };
}

/** Hire search across the whole faction: by name, class, role, level. */
export function hireSearch(app, onPick) {
  app.prompt('Search by name, class or role (e.g. "mage", "healer 20-30", "Bran"): ', (q) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const classes = [], roles = [];
    let minLevel, maxLevel, name;
    for (const w of words) {
      const cls = [1, 2, 3, 4, 5, 7, 8, 9, 11].find((c) => className(c).toLowerCase() === w);
      const lv = w.match(/^(\d+)(?:-(\d+))?$/);
      if (cls) classes.push(cls);
      else if (['tank', 'healer', 'dps', 'damage'].includes(w)) roles.push(w === 'damage' ? 'dps' : w);
      else if (lv) { minLevel = Number(lv[1]); maxLevel = Number(lv[2] ?? lv[1]); }
      else name = w;
    }
    const found = app.g.searchInnCandidates({ classes, roles, minLevel, maxLevel, name, limit: 40 });
    if (!found.length) { app.flashMsg('Nobody matches.'); return; }
    onPick(found);
  });
}
