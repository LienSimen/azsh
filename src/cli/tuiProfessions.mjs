// The Professions tab and its dialogs: a recipe book per crafter and profession (you or a companion), the
// party book with everything anyone can make, the enchanter's bench, profession trainers, gathering, and
// Send goods. Ported from the web client's professionsPanel.ts and the vendorPanel.ts send-goods overlay.
// A craft buys short vendor reagents (vials, thread, flux) from your purse on the way: the buy-in
// the web client shows as a coin chip on Create. Views only read; every change is a Game facade call.
import { bold, dim, cyan, yellow, green, red, gray, orange, qualityPaint, fit, plural, secondsText, wrapLines, itemText, coinText } from './text.mjs';
import { itemLines } from './tuiViews.mjs';
import { missionDialog, companionDialog } from './tuiCompanions.mjs';
import { coinsText } from '../domain/economy/money.ts';
import { className } from '../domain/core/ids.ts';
import { countItem, emptyInventory } from '../domain/items/inventory.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { EQUIP_SLOTS, SLOT_LABEL } from '../domain/items/equipment.ts';
import { actionColor, canCraft, currentRank, nextTrainerRank, nextRankReqSkill, skillGainTenths } from '../domain/professions/professions.ts';
import { bestRodTier, rodNameForTier, isDisenchantable, disenchantRuleFor } from '../domain/professions/enchanting.ts';
import { partyHeldTools } from '../domain/professions/heldTools.ts';
import { craftCooldownLabel, recipeCooldownRemainingMs } from '../domain/professions/craftCooldown.ts';
import { vendorBuyInReady, applyVendorBuys, maxCraftsWithVendor, unlimitedVendorFor } from '../domain/professions/vendorReagents.ts';
import { craftUpgradeWearers } from '../domain/items/craftUpgrades.ts';
import { companionEquipOpts, playerEquipOptsFrom } from '../domain/professions/autoDisenchant.ts';
import { companionCharacter, companionLevel, companionSkillMap } from '../domain/bots/squad.ts';
import { isMissionSkill, missionProgress, missionEtaLabel, missionVerb } from '../domain/bots/companionMissions.ts';
import { partyMergedStacks } from '../domain/raid/partyVault.ts';
import { itemTeachIntent } from '../domain/items/itemTeaches.ts';
import {
  planCompanionShare, applyCompanionShare, companionShareResultLine, goodsCompanions,
  sendGoodsUpgradeKey, tradeGoodsGiftKey, activeTradeGoodsGifts, activeSendGoodsUpgrades, tradeGoodsGiftCount,
} from '../domain/bots/sendTradeGoods.ts';
import { trainerSpellCost, vendorPriceMultiplierFor } from '../engine/game/vendorOffers.ts';
import { zoneProfTrainers } from '../world/world.ts';
import { GOSSIP_SENDER_MAIN, GOSSIP_SENDER_CHECK, S_WEAPON, S_ARMOR, S_HAMMER, S_AXE, S_SWORD, S_DRAGON, S_ELEMENTAL, S_TRIBAL } from '../domain/scriptdev/npcProfessions.ts';

const DIFF_PAINT = { orange, yellow, green, gray, locked: red };
const KIND_ORDER = { crafting: 0, gathering: 1, secondary: 2 };
const GATHER_LINES = new Set(['mining', 'herbalism', 'skinning', 'fishing']);
const H = (text) => ({ text, header: true });

// ---- crafters --------------------------------------------------------------------------------------

/** Your companions: the party first, then the bench. */
export function companionsOf(g) { return goodsCompanions(g.state); }

/** Every item the party holds, merged: your bags and bank plus each companion's. A companion crafts from it. */
function partyVault(app) {
  const g = app.g;
  const ctx = {
    char: g.state.char, inventory: g.state.inventory, bank: g.state.bank ?? emptyInventory(), bankBags: g.state.bankBags ?? [],
    companions: companionsOf(g), playerLevel: app.ch.level, ds: app.ds,
  };
  return { stacks: partyMergedStacks(ctx).map((s) => ({ item: s.item, count: s.count })) };
}

/** A body that crafts: you (id null), or a companion as the Character shell the profession rules read. */
export function crafterOf(app, id, vault) {
  const g = app.g;
  if (!id) return { id: null, name: 'You', char: app.ch, inv: g.state.inventory, cds: g.state };
  const comp = companionsOf(g).find((c) => c.id === id);
  if (!comp) return null;
  g.companionProfessionsOf(comp.id); // syncs their trainer catalog, as the engine does before a craft
  const lvl = companionLevel(comp, app.ch.level);
  const char = companionCharacter(comp, lvl, app.ds);
  char.skills = companionSkillMap(comp, lvl);
  char.knownRecipes = comp.knownRecipes ?? [];
  char.knownEnchants = comp.knownEnchants ?? [];
  return { id: comp.id, name: comp.name, comp, char, inv: vault ?? partyVault(app), cds: comp };
}

/** You, then each companion who has `skill` (any companion when no skill is given). */
function crafters(app, skill) {
  const vault = partyVault(app);
  const out = [crafterOf(app, null)];
  for (const c of companionsOf(app.g)) {
    const cr = crafterOf(app, c.id, vault);
    if (cr && (!skill || cr.char.skills[skill])) out.push(cr);
  }
  return out;
}

const whose = (cr) => (cr.id ? `${cr.name}'s` : 'Your');

function sharedTools(app) { return partyHeldTools(app.g.state.inventory, companionsOf(app.g), app.ds); }
function zoneFocus(app) { const z = app.zone(); return z ? new Set(z.craftingFocus ?? []) : null; }

/** Skill-up chance in percent for this crafter on this curve; 0 when it can no longer raise the skill. */
function upPct(cr, line, curve) {
  const sk = cr.char.skills[line];
  return sk ? Math.round(skillGainTenths(line, sk, curve, 'craft') / 10) : 0;
}
function diffOf(cr, line, curve) { const sk = cr.char.skills[line]; return sk ? actionColor(sk.current, curve) : 'locked'; }

function buyList(app, buys) { return buys.map((b) => `${app.itemLabel(b.item)} x${b.units}`).join(', '); }

// canCraft with the vendor buy-in folded in: ok with a cost when only vendor goods are short, and `max` is
// how many one "make all" would run (bags plus purse). Same fold as the web client's craftCheck.
function craftCheck(app, cr, r, env) {
  if (cr.comp?.mission) return { ok: false, reason: `${cr.name} is away`, cost: 0, buys: [], max: 0 };
  const rem = recipeCooldownRemainingMs(r, cr.cds, Date.now());
  if (rem > 0) return { ok: false, reason: `Ready in ${craftCooldownLabel(rem)}`, cost: 0, buys: [], max: 0 };
  const max = () => Math.max(1, maxCraftsWithVendor(app.ds, app.ch, r.reagents, cr.inv));
  const chk = canCraft(cr.char, cr.inv, r, env.focus, null, env.tools);
  if (chk.ok) return { ok: true, cost: 0, buys: [], max: max() };
  if (chk.reason !== 'Missing reagents') return { ok: false, reason: chk.reason, cost: 0, buys: [], max: 0 };
  const b = vendorBuyInReady(app.ds, app.ch, r.reagents, cr.inv);
  if (!b.ok) {
    const reason = b.blocked.length ? `Missing ${b.blocked.map((i) => app.itemLabel(i)).join(', ')}` : `Need ${coinText(b.cost)} for ${buyList(app, b.buys)}`;
    return { ok: false, short: true, reason, cost: b.cost, buys: b.buys, max: 0 };
  }
  const again = canCraft(cr.char, applyVendorBuys(app.ds, cr.inv, b.buys), r, env.focus, null, env.tools);
  return again.ok ? { ok: true, cost: b.cost, buys: b.buys, max: max() } : { ok: false, reason: again.reason, cost: 0, buys: [], max: 0 };
}
function craftEnv(app) { return { focus: zoneFocus(app), tools: sharedTools(app) }; }

/** One status chip for a recipe row: how many you can make, what the buy-in costs, or why not. */
function craftChip(chk) {
  if (chk.ok) return green(`${chk.max} ready`) + (chk.cost ? yellow(`  buys ${coinText(chk.cost)}`) : '');
  return (chk.short ? dim : red)(chk.reason ?? 'cannot make');
}

/** Make `want` of a recipe as this crafter, then say it once: the engine logs each craft and each buy. */
/** `all`: make as many as the reagents, purse and bags allow. For you that is the engine's craftAll in one call. */
function craftMany(app, cr, r, want, all = false) {
  const g = app.g;
  const before = g.state.activity[0] ?? null;
  let made = 0, units = 0, spent = 0, skill, reason;
  let n = Math.min(Math.max(1, want), 999);
  if (all && !cr.id) {
    const res = g.craftAll(r.id);
    if (res.ok) { made = n = res.crafted; units = res.produced?.count ?? made; spent = res.spent ?? 0; if (res.skillAfter != null && res.skillAfter !== res.skillBefore) skill = res.skillAfter; }
    else reason = res.reason;
  } else for (let i = 0; i < n; i++) {
    const res = cr.id ? g.craftAsCompanion(cr.id, r.id) : g.craft(r.id);
    if (!res.ok) { reason = res.reason; break; }
    made++;
    units += res.produced?.count ?? res.count ?? 1;
    spent += res.spent ?? 0;
    if (res.skillUp != null) skill = res.skillUp;
  }
  // Keep the engine lines a craft can cause besides itself (a quest objective, a new rank), drop the rest.
  const act = g.state.activity;
  const at = before == null ? act.length : act.indexOf(before);
  const other = act.slice(0, at < 0 ? act.length : at).filter((l) => !/^(Bought |Crafted )/.test(l) && !/ (crafts|crafted|creates) /.test(l));
  app.lastActivity = act[0] ?? null;
  if (!made) { app.say(red(reason ?? 'Cannot make that.')); return; }
  const prod = app.ds.item(r.product.item);
  app.say(green(`${cr.id ? `${cr.name} creates` : 'You create'} ${itemText(prod, r.name)}${units > 1 ? ` x${units}` : ''}.`)
    + (spent ? yellow(`  Vendor reagents ${coinText(spent)}.`) : '')
    + (made < n && reason ? dim(`  Stopped after ${made}: ${reason}`) : ''));
  if (skill != null) app.say(cyan(`${whose(cr)} ${app.ds.profession(r.skill)?.name ?? r.skill} skill is now ${skill}.`));
  for (const l of other.reverse()) app.say(dim('· ' + coinsText(l)));
}

function askCount(app, cr, r, chk) {
  app.prompt(`How many ${app.ds.item(r.product.item)?.name ?? r.name}? (up to ${chk.max}) `, (t) => {
    const n = Number(t);
    if (!(n >= 1)) { app.flashMsg('Enter a number, 1 or more.'); return; }
    craftMany(app, cr, r, Math.floor(n));
    app.afterAction();
  });
}

// ---- who would wear it -----------------------------------------------------------------------------

let upgradeMemo = null;
// The bodies a crafted piece could land on (you and the party) and which of them each product upgrades.
// One findUpgrades pass per body and product, so the answer is kept until worn gear or the product list moves.
function wearers(app, products) {
  const g = app.g, ds = app.ds;
  const bodies = [{ id: null, name: 'You', cls: app.ch.cls, char: app.ch, opts: playerEquipOptsFrom(app.ch, g.state.spellbook, ds) }];
  for (const comp of g.state.squad ?? []) {
    const lvl = companionLevel(comp, app.ch.level);
    bodies.push({ id: comp.id, name: comp.name, cls: comp.cls, char: companionCharacter(comp, lvl, ds), opts: companionEquipOpts(comp, lvl, ds) });
  }
  const list = [...new Set(products)].sort((x, y) => x - y);
  const key = `${list.join(',')}|${bodies.map((b) => `${b.id}:${b.char.level}:${JSON.stringify(b.char.equipped)}`).join(';')}`;
  if (upgradeMemo?.key !== key) upgradeMemo = { key, map: craftUpgradeWearers(list, bodies, ds) };
  return upgradeMemo.map;
}
function wearerLines(app, prodEntry, who) {
  if (!who?.length) return [];
  return ['', cyan('Upgrade for'), ...who.map((w) => {
    const worn = w.currentEntry != null ? app.itemLabel(w.currentEntry) : null;
    return `  ${w.name}${w.scale === 'spec' ? green(` +${Math.round(w.delta)}`) : ''} ${dim(`${SLOT_LABEL[w.slot] ?? w.slot}, ${worn ? `over ${worn}` : 'empty slot'}`)}`;
  })];
}

// ---- detail panes ----------------------------------------------------------------------------------

function reagentLines(app, reagents, tools, inv) {
  const out = [cyan('Reagents')];
  for (const rg of reagents) {
    const have = countItem(inv, rg.item), ok = have >= rg.count;
    const it = app.ds.item(rg.item);
    const vendor = !ok && it && unlimitedVendorFor(app.ds, rg.item, app.ch.race) != null;
    const lot = Math.max(1, it?.buyCount ?? 1);
    const cost = vendor ? Math.ceil((rg.count - have) / lot) * it.buyPrice : 0;
    out.push(`  ${(ok ? green : vendor ? yellow : red)(`${have}/${rg.count}`)} ${app.itemLabel(rg.item)}${vendor ? dim(`  vendor ${coinText(cost)}`) : ''}`);
  }
  for (const t of tools ?? []) {
    const ok = countItem(inv, t) > 0 || sharedTools(app).has(t);
    out.push(`  ${ok ? green('✓') : red('✗')} ${app.itemLabel(t)} ${dim('(tool, kept)')}`);
  }
  return out;
}

function recipeDetail(app, cr, r, chk, who) {
  const prod = app.ds.item(r.product.item);
  const count = r.product.countMax && r.product.countMax > r.product.count ? `${r.product.count}-${r.product.countMax}` : r.product.count > 1 ? `${r.product.count}` : '';
  const out = [...itemLines(app, prod).filter((l) => !/Sells for/.test(l)).map((l, i) => (i === 0 && count ? `${l} ${dim(`x${count}`)}` : l)), ''];
  out.push(...reagentLines(app, r.reagents, r.requiredTools, cr.inv));
  const diff = diffOf(cr, r.skill, r), pct = upPct(cr, r.skill, r);
  out.push('', `${DIFF_PAINT[diff](diff)} ${dim(`${r.orange}/${r.yellow}/${r.green}/${r.gray}`)}   ${pct ? `${pct}% skill-up` : dim('no skill-up')}`);
  const rem = recipeCooldownRemainingMs(r, cr.cds, Date.now());
  if (r.cooldownMs || r.categoryCooldownMs) out.push(rem > 0 ? red(`Cooldown: ${craftCooldownLabel(rem)} left`) : dim(`Cooldown ${secondsText(r.cooldownMs ?? r.categoryCooldownMs)}`));
  out.push(...wearerLines(app, r.product.item, who));
  out.push('');
  if (chk.ok) {
    if (chk.cost) out.push(yellow(`Buys ${buyList(app, chk.buys)} for ${coinText(chk.cost)} from your purse.`));
    out.push(green(`Enter: make one   A: make ${chk.max}   N: a number`));
  } else out.push(red(chk.reason ?? 'Cannot make this.'));
  if (cr.id) out.push('', dim(`${cr.name} crafts from the whole party's bags and banks. What they make lands in their bags.`));
  return out;
}

// ---- the recipe book ---------------------------------------------------------------------------------

/** One crafter's recipes in one profession; gathering lines also list the zone's nodes, enchanting its formulas. */
export function recipeBook(app, crafterId, skill) {
  if (skill === 'enchanting') return enchantBench(app, crafterId);
  const prof = app.ds.profession(skill);
  let id = crafterId, haveOnly = false, search = '';
  const current = () => crafterOf(app, id) ?? crafterOf(app, null);
  const view = {
    id: `book-${skill}`, title: prof?.name ?? skill, hint: 'Enter: make one',
    keys: {
      A: { hint: 'make all', fn: (a, row) => { const d = row?.data; if (d?.recipe) { if (d.chk.ok) craftMany(a, d.cr, d.recipe, d.chk.max, true); else a.say(red(d.chk.reason)); } } },
      N: { hint: 'how many', fn: (a, row) => { const d = row?.data; if (d?.recipe) { if (d.chk.ok) askCount(a, d.cr, d.recipe, d.chk); else a.say(red(d.chk.reason)); } } },
      h: { hint: 'have mats', fn: (a) => { haveOnly = !haveOnly; view.cursor = 0; view.scroll = 0; a.flashMsg(haveOnly ? 'Showing only what you can make now.' : 'Showing every known recipe.'); } },
      '/': { hint: 'search', fn: (a) => { if (search) { search = ''; a.flashMsg('Search cleared.'); return; } a.prompt('Search recipes: ', (t) => { search = t.toLowerCase(); view.cursor = 0; view.scroll = 0; a.render(); }); } },
      c: { hint: 'crafter', fn: (a) => {
        const opts = crafters(a, skill).map((cr) => ({ label: `${cr.name}  ${dim(`${cr.char.skills[skill]?.current ?? 0}/${cr.char.skills[skill]?.max ?? 0}`)}${cr.comp?.mission ? yellow('  away') : ''}`, value: cr.id }));
        if (opts.length < 2) { a.flashMsg(`Nobody else in your party knows ${prof?.name ?? skill}.`); return; }
        a.pick(`Who crafts ${prof?.name ?? skill}?`, opts, (v) => { id = v; view.cursor = 0; view.scroll = 0; });
      } },
    },
    rows(a) {
      const cr = current();
      const sk = cr.char.skills[skill];
      const env = craftEnv(a);
      const rows = [H(`${bold(cr.name)}  ${prof?.name ?? skill} ${sk ? `${sk.current}/${sk.max}` : dim('untrained')}${sk && prof ? dim(`  ${currentRank(cr.char, prof)?.name ?? ''}`) : ''}   ${coinText(a.ch.gold)}`)];
      const filters = [haveOnly && 'only what you can make', search && `matching "${search}"`].filter(Boolean);
      rows.push(H(dim(filters.length ? `Showing ${filters.join(', ')}.` : 'c: switch crafter   h: only what you can make   /: search')));
      if (GATHER_LINES.has(skill)) rows.push(...gatherRows(a, skill, cr));
      const known = new Set(cr.char.knownRecipes);
      let recipes = a.ds.recipes().filter((r) => r.skill === skill && known.has(r.id));
      if (search) recipes = recipes.filter((r) => r.name.toLowerCase().includes(search) || (a.ds.item(r.product.item)?.name ?? '').toLowerCase().includes(search));
      recipes.sort((x, y) => y.orange - x.orange || x.name.localeCompare(y.name));
      const checks = recipes.map((r) => ({ r, chk: craftCheck(a, cr, r, env) }));
      const shown = haveOnly ? checks.filter((x) => x.chk.ok) : checks;
      const ups = wearers(a, recipes.map((r) => r.product.item));
      if (recipes.length || !GATHER_LINES.has(skill)) {
        rows.push(H(''), H(`Recipes (${checks.filter((x) => x.chk.ok).length} of ${plural(recipes.length, 'recipe')} ready)`));
        if (!shown.length) rows.push(H(dim(recipes.length ? '  Nothing you can make right now. h shows every recipe.' : '  No recipes known. Profession trainers teach them; Plans and Patterns from drops teach the rest.')));
      }
      const W = Math.max(20, Math.min(36, a.layout().listW - 30));
      for (const { r, chk } of shown) {
        const prod = a.ds.item(r.product.item);
        const who = ups.get(r.product.item) ?? [];
        const name = DIFF_PAINT[diffOf(cr, skill, r)](r.name);
        rows.push({
          text: `${fit(name + (who.length ? green(' ▲') : ''), W)} ${craftChip(chk)}`, data: { recipe: r, chk, cr },
          icon: prod?.icon, sub: dim((r.reagents ?? []).map((x) => `${a.ds.item(x.item)?.name ?? x.item}${x.count > 1 ? ` x${x.count}` : ''}`).join(', ')),
          detail: () => recipeDetail(a, cr, r, chk, who),
          act: () => (chk.ok ? craftMany(a, cr, r, 1) : a.say(red(chk.reason ?? `Cannot make ${prod?.name ?? r.name}.`))),
        });
      }
      return rows;
    },
  };
  return view;
}

// ---- gathering ----------------------------------------------------------------------------------------

/** Lines of `skill` that you or a party companion work: gather() picks the worker, so either counts. */
function partyHas(app, skill) {
  if (app.ch.skills[skill]) return true;
  return (app.g.state.squad ?? []).some((c) => !c.mission && companionSkillMap(c, companionLevel(c, app.ch.level))[skill]);
}

/** The zone's nodes for one gathering line (plus a skinnable corpse), as rows with Enter = gather. */
export function gatherRows(app, skill, cr) {
  const g = app.g, ds = app.ds, z = app.zone();
  const rows = [];
  if (cr?.id && isMissionSkill(skill)) {
    const comp = cr.comp;
    const away = comp.mission ? missionProgress(comp.mission, Date.now()) : null;
    rows.push(H(''), H('Gathering trips'));
    rows.push({
      text: away ? `${missionVerb(comp.mission.skill)} in ${ds.zone(comp.mission.zoneId)?.name ?? comp.mission.zoneId}  ${away.done ? green('back, ready to collect') : yellow(missionEtaLabel(away))}` : `Send ${comp.name} ${skill === 'herbalism' ? 'herbing' : skill}…`,
      detail: () => [bold('Gathering trips'), '', `${comp.name} goes out alone for 1 to 10 hours and brings back what they find. Trips cost shared energy, 10 an hour, refilled every morning at 06:00.`],
      act: () => app.push(missionDialog(app, comp.id, skill)),
    });
    return rows;
  }
  if (cr?.id) return rows;
  if (skill === 'skinning' && g.state.corpse) {
    const c = ds.creature(g.state.corpse.creatureEntry);
    rows.push(H(''), H('Corpse'), {
      text: `Skin ${c?.name ?? 'the corpse'}`,
      detail: () => [bold(`Skin ${c?.name ?? 'the corpse'}`), '', 'A fresh corpse can be skinned once.'],
      act: () => { const r = g.skin(); if (app.result(r)) app.say(gatherText(app, r)); },
    });
  }
  const nodes = (z?.nodes ?? []).map((id) => ds.gatherNode(id)).filter((n) => n && n.skill === skill);
  if (!nodes.length) return rows;
  rows.push(H(''), H(`${ds.profession(skill)?.name ?? skill} here (${nodes.length})`));
  const now = Date.now();
  for (const n of nodes) {
    const st = g.gatherStatus(n.id, now);
    const diff = app.ch.skills[skill] ? actionColor(app.ch.skills[skill].current, n) : 'locked';
    rows.push({
      text: `${DIFF_PAINT[diff](n.name)} ${dim(`skill ${n.orange}`)}  ${st.ok ? green(st.chargesLeft > 1 ? `${st.chargesLeft} left` : 'ready') : st.respawnMs > 0 ? dim(`back in ${secondsText(st.respawnMs)}`) : red(st.reason ?? 'cannot')}`,
      detail: () => nodeLines(app, n, st),
      act: () => { const r = g.gather(n.id, Date.now()); if (app.result(r)) app.say(gatherText(app, r)); },
    });
  }
  return rows;
}

/** Gathering rows for the World tab: every node line the party works, and a corpse to skin. */
export function worldGatherRows(app) {
  const ds = app.ds, z = app.zone();
  const lines = [...new Set((z?.nodes ?? []).map((id) => ds.gatherNode(id)?.skill).filter(Boolean))];
  if (app.g.state.corpse) lines.push('skinning');
  const rows = [];
  for (const line of [...new Set(lines)]) if (partyHas(app, line)) rows.push(...gatherRows(app, line, null));
  return rows;
}

function nodeLines(app, n, st) {
  const out = [bold(n.name), dim(`${app.ds.profession(n.skill)?.name ?? n.skill}, skill ${n.orange} (${n.yellow}/${n.green}/${n.gray})`), ''];
  for (const y of n.yield) out.push(`  ${app.itemLabel(y.item)} ${dim(`${y.minCount === y.maxCount ? y.minCount : `${y.minCount}-${y.maxCount}`}, ${y.chance}%`)}`);
  out.push('', st.ok ? green('Enter: gather') : red(st.reason ?? 'Not now'));
  return out;
}

function gatherText(app, r) {
  const got = (r.yielded ?? []).map((d) => `${app.itemLabel(d.item)}${d.count > 1 ? ` x${d.count}` : ''}`).join(', ');
  return green(`${r.workedBy ? `${r.workedBy} gathers` : 'You gather'}: ${got || 'nothing'}.`) + (r.skillUp ? cyan(`  Skill ${r.skillUp}.`) : '');
}

// ---- enchanting -----------------------------------------------------------------------------------------

function enchantCheck(app, cr, e, env) {
  if (cr.comp?.mission) return { ok: false, reason: `${cr.name} is away`, cost: 0, buys: [] };
  const sk = cr.char.skills.enchanting;
  if (!sk || sk.current < e.orange) return { ok: false, reason: `Requires Enchanting ${e.orange}`, cost: 0, buys: [] };
  if (bestRodTier(cr.inv, app.ds, env.tools) < e.minRodTier) return { ok: false, reason: `Requires ${rodNameForTier(e.minRodTier, app.ds)}`, cost: 0, buys: [] };
  if (e.reagents.every((rg) => countItem(cr.inv, rg.item) >= rg.count)) return { ok: true, cost: 0, buys: [] };
  const b = vendorBuyInReady(app.ds, app.ch, e.reagents, cr.inv);
  if (b.ok) return { ok: true, cost: b.cost, buys: b.buys };
  return { ok: false, short: true, reason: b.blocked.length ? `Missing ${b.blocked.map((i) => app.itemLabel(i)).join(', ')}` : `Need ${coinText(b.cost)}`, cost: b.cost, buys: b.buys };
}

/** Whose worn piece can take this enchant: you and the party, one option per matching slot. */
function enchantTargets(app, e) {
  const ds = app.ds, out = [];
  const add = (owner, ownerId, equipped) => {
    for (const slot of EQUIP_SLOTS) {
      const entry = equippedEntry(equipped?.[slot]);
      const it = entry != null ? ds.item(entry) : null;
      if (it?.slot && e.slots.includes(it.slot)) out.push({ label: `${owner}: ${SLOT_LABEL[slot] ?? slot}  ${qualityPaint(it.quality)(it.name)}`, detail: () => itemLines(app, it), value: { ownerId, slot } });
    }
  };
  add('You', null, app.ch.equipped);
  for (const c of app.g.state.squad ?? []) add(c.name, c.id, c.equipped);
  return out;
}

function applyEnchant(app, cr, e) {
  const targets = enchantTargets(app, e);
  if (!targets.length) { app.flashMsg(`Nobody in the party wears something ${e.name} can go on.`); return; }
  app.pick(`${e.name}: on what?`, targets, ({ ownerId, slot }) => {
    const res = cr.id
      ? app.g.enchantAsCompanion(cr.id, e.id, slot, ownerId ? { kind: 'companion', id: ownerId } : { kind: 'self' })
      : app.g.enchantItem(e.id, slot, ownerId ?? undefined);
    if (!app.result(res, `${cr.id ? cr.name : 'You'} apply ${e.name}.`)) return;
    if (res.skillUp != null) app.say(cyan(`${whose(cr)} Enchanting skill is now ${res.skillUp}.`));
  });
}

/** The enchanter's bench: known formulas (Enter applies one to you or a party member) and what to disenchant. */
function enchantBench(app, crafterId) {
  let id = crafterId, haveOnly = false, search = '';
  const current = () => crafterOf(app, id) ?? crafterOf(app, null);
  const view = {
    id: 'book-enchanting', title: 'Enchanting', hint: 'Enter: apply / disenchant',
    keys: {
      h: { hint: 'have mats', fn: (a) => { haveOnly = !haveOnly; view.cursor = 0; view.scroll = 0; a.flashMsg(haveOnly ? 'Showing only what you can enchant now.' : 'Showing every known formula.'); } },
      '/': { hint: 'search', fn: (a) => { if (search) { search = ''; a.flashMsg('Search cleared.'); return; } a.prompt('Search formulas: ', (t) => { search = t.toLowerCase(); view.cursor = 0; view.scroll = 0; a.render(); }); } },
      c: { hint: 'enchanter', fn: (a) => {
        const opts = crafters(a, 'enchanting').map((cr) => ({ label: `${cr.name}  ${dim(`${cr.char.skills.enchanting?.current ?? 0}/${cr.char.skills.enchanting?.max ?? 0}`)}`, value: cr.id }));
        if (opts.length < 2) { a.flashMsg('Nobody else in your party knows Enchanting.'); return; }
        a.pick('Who enchants?', opts, (v) => { id = v; view.cursor = 0; view.scroll = 0; });
      } },
    },
    rows(a) {
      const cr = current(), ds = a.ds;
      const sk = cr.char.skills.enchanting;
      const env = craftEnv(a);
      const rows = [H(`${bold(cr.name)}  Enchanting ${sk ? `${sk.current}/${sk.max}` : dim('untrained')}   ${dim(`rod: ${bestRodTier(cr.inv, ds, env.tools) ? rodNameForTier(bestRodTier(cr.inv, ds, env.tools), ds) : 'none'}`)}   ${coinText(a.ch.gold)}`)];
      const filters = [haveOnly && 'only what you can enchant', search && `matching "${search}"`].filter(Boolean);
      rows.push(H(dim(filters.length ? `Showing ${filters.join(', ')}.` : 'c: switch enchanter   h: only what you can enchant   /: search')));
      const known = new Set(cr.char.knownEnchants ?? []);
      let formulas = ds.enchants().filter((e) => known.has(e.id));
      const total = formulas.length;
      if (search) formulas = formulas.filter((e) => e.name.toLowerCase().includes(search) || e.slots.some((s) => s.toLowerCase().includes(search)));
      formulas.sort((x, y) => y.orange - x.orange || x.name.localeCompare(y.name));
      const checks = formulas.map((e) => ({ e, chk: enchantCheck(a, cr, e, env) }));
      const shown = haveOnly ? checks.filter((x) => x.chk.ok) : checks;
      const W = Math.max(20, Math.min(34, a.layout().listW - 31));
      rows.push(H(''), H(`Formulas (${shown.length}${shown.length !== total ? ` of ${total}` : ''})`));
      if (!total) rows.push(H(dim('  No formulas known. The enchanting trainer teaches them.')));
      else if (!shown.length) rows.push(H(dim(haveOnly ? '  Nothing you have the mats for. h shows every formula.' : '  No formula matches.')));
      for (const { e, chk } of shown) {
        rows.push({
          text: `${fit(DIFF_PAINT[diffOf(cr, 'enchanting', e)](e.name.replace(/^Enchant\s+/, '')), W)} ${chk.ok ? green('ready') + (chk.cost ? yellow(`  buys ${coinText(chk.cost)}`) : '') : (chk.short ? dim : red)(chk.reason)}`,
          detail: () => [bold(e.name), dim(`goes on: ${e.slots.join(', ')}   ${rodNameForTier(e.minRodTier, ds)}`), '', ...reagentLines(a, e.reagents, [], cr.inv), '',
            `${DIFF_PAINT[diffOf(cr, 'enchanting', e)](diffOf(cr, 'enchanting', e))}   ${upPct(cr, 'enchanting', e) ? `${upPct(cr, 'enchanting', e)}% skill-up` : dim('no skill-up')}`, '',
            chk.ok ? green('Enter: pick whose gear to enchant') : red(chk.reason)],
          act: () => (chk.ok ? applyEnchant(a, cr, e) : a.say(red(chk.reason))),
        });
      }
      // Disenchanting breaks bag gear into dust and essences; the engine picks the party enchanter who covers it.
      if (sk) {
        const st = a.g.state.inventory.stacks;
        const de = [];
        st.forEach((s, slot) => { const it = ds.item(s.item); if (it && it.quality >= 2 && isDisenchantable(it) && !it.questItem) de.push({ s, slot, it, rule: disenchantRuleFor(it, ds) }); });
        rows.push(H(''), H(`Disenchant from your bags (${de.length})`));
        if (!de.length) rows.push(H(dim('  Nothing green or better in your bags to break down.')));
        for (const { s, slot, it, rule } of de) {
          const can = rule && sk.current >= rule.reqSkill;
          rows.push({
            text: `${qualityPaint(it.quality)(it.name)}${s.count > 1 ? ` x${s.count}` : ''}  ${rule ? (can ? dim(`skill ${rule.reqSkill}`) : red(`needs ${rule.reqSkill}`)) : red('cannot')}`,
            detail: () => itemLines(a, it, ['', ...(rule ? [cyan('Breaks into'), ...rule.yield.map((y) => `  ${a.itemLabel(y.item)} ${dim(`${y.minCount}-${y.maxCount}, ${y.chance}%`)}`)] : []), '', dim('Enter: disenchant (the item is destroyed)')]),
            act: () => a.confirm(`Disenchant ${it.name}?`, () => {
              const r = a.g.disenchantStack(slot);
              a.lastActivity = a.g.state.activity[0] ?? null; // the engine's own line says the same
              if (a.result(r)) a.say(green(`${r.worker && r.worker !== a.ch.name ? `${r.worker} disenchants` : 'You disenchant'} ${itemText(it)}: ${(r.yielded ?? []).map((d) => `${a.itemLabel(d.item)}${d.count > 1 ? ` x${d.count}` : ''}`).join(', ') || 'nothing'}.`) + (r.skillUp ? cyan(`  Skill ${r.skillUp}.`) : ''));
            }),
          });
        }
      }
      return rows;
    },
  };
  return view;
}

// ---- the party book -------------------------------------------------------------------------------------

// Every recipe anyone in the party knows, grouped by profession. Each row names the crafter who can make it
// now (the one with the best skill-up chance first); c on a row picks another.
function partyBook(app) {
  let haveOnly = true;
  const pickCrafter = (a, d) => {
    const opts = d.options.map((o) => ({ label: `${o.cr.name}  ${craftChip(o.chk)}${o.pct ? cyan(`  ${o.pct}% skill-up`) : ''}`, value: o }));
    a.pick(`Who makes ${d.recipe.name}?`, opts, (o) => (o.chk.ok ? craftMany(a, o.cr, d.recipe, 1) : a.say(red(o.chk.reason))));
  };
  const view = {
    id: 'party-book', title: 'Party recipes', hint: 'Enter: make one',
    keys: {
      A: { hint: 'make all', fn: (a, row) => { const o = row?.data?.best; if (o?.chk.ok) craftMany(a, o.cr, row.data.recipe, o.chk.max, true); else if (row?.data) a.say(red(o?.chk.reason ?? 'Nobody can make that now.')); } },
      N: { hint: 'how many', fn: (a, row) => { const o = row?.data?.best; if (o?.chk.ok) askCount(a, o.cr, row.data.recipe, o.chk); else if (row?.data) a.say(red(o?.chk.reason ?? 'Nobody can make that now.')); } },
      c: { hint: 'pick crafter', fn: (a, row) => { if (row?.data) pickCrafter(a, row.data); } },
      h: { hint: 'have mats', fn: (a) => { haveOnly = !haveOnly; view.cursor = 0; view.scroll = 0; a.flashMsg(haveOnly ? 'Showing only what someone can make now.' : 'Showing every recipe the party knows.'); } },
    },
    rows(a) {
      const ds = a.ds, env = craftEnv(a);
      const all = crafters(a);
      const byRecipe = new Map();
      for (const cr of all) for (const rid of cr.char.knownRecipes) {
        const r = ds.recipe(rid);
        if (!r) continue;
        const chk = craftCheck(a, cr, r, env);
        const list = byRecipe.get(rid) ?? [];
        list.push({ cr, chk, pct: upPct(cr, r.skill, r) });
        byRecipe.set(rid, list);
      }
      const ups = wearers(a, [...byRecipe.keys()].map((rid) => ds.recipe(rid).product.item));
      const groups = new Map();
      for (const [rid, options] of byRecipe) {
        const r = ds.recipe(rid);
        options.sort((x, y) => Number(y.chk.ok) - Number(x.chk.ok) || y.pct - x.pct || Number(!!x.cr.id) - Number(!!y.cr.id));
        if (haveOnly && !options[0].chk.ok) continue;
        const g = groups.get(r.skill) ?? [];
        g.push({ recipe: r, options, best: options[0] });
        groups.set(r.skill, g);
      }
      const ready = [...byRecipe.values()].filter((o) => o.some((x) => x.chk.ok)).length;
      const rows = [H(`${plural(byRecipe.size, 'recipe')} known across ${plural(all.length, 'crafter')}, ${ready} ready   ${coinText(a.ch.gold)}`), H(dim(haveOnly ? 'Showing what someone can make now. h shows everything.' : 'Showing every known recipe. h shows only what someone can make.'))];
      if (!groups.size) rows.push(H(''), H(dim(byRecipe.size ? '  Nobody can make anything right now. h shows every recipe.' : '  Nobody in the party knows a recipe yet.')));
      const W = Math.max(20, Math.min(34, a.layout().listW - 34));
      for (const [skill, list] of [...groups].sort((x, y) => x[0].localeCompare(y[0]))) {
        rows.push(H(''), H(ds.profession(skill)?.name ?? skill));
        list.sort((x, y) => y.recipe.orange - x.recipe.orange || x.recipe.name.localeCompare(y.recipe.name));
        for (const d of list) {
          const who = ups.get(d.recipe.product.item) ?? [];
          const b = d.best;
          rows.push({
            text: `${fit(DIFF_PAINT[diffOf(b.cr, skill, d.recipe)](d.recipe.name) + (who.length ? green(' ▲') : ''), W)} ${dim(fit(b.cr.name, 10))} ${craftChip(b.chk)}`, data: d,
            detail: () => [...recipeDetail(a, b.cr, d.recipe, b.chk, who), '', cyan('Who can make it'), ...d.options.map((o) => `  ${fit(o.cr.name, 12)} ${craftChip(o.chk)}${o.pct ? cyan(`  ${o.pct}%`) : ''}`), dim('c: pick who makes it')],
            act: () => (b.chk.ok ? craftMany(a, b.cr, d.recipe, 1) : a.say(red(b.chk.reason))),
          });
        }
      }
      return rows;
    },
  };
  return view;
}

// ---- trainers -------------------------------------------------------------------------------------------

/** A profession trainer: the next rank of the craft, and the recipes and formulas they teach. */
// Blacksmith and leatherworker specialisations, from the trainer's own gossip (npc_professions.cpp).
const SPEC_SPELL = { weapon: S_WEAPON, armor: S_ARMOR, hammer: S_HAMMER, axe: S_AXE, sword: S_SWORD, dragon: S_DRAGON, elemental: S_ELEMENTAL, tribal: S_TRIBAL };

function specRows(app, trainer) {
  const items = (app.g.professionSpecGossip(trainer.entry).items ?? []).filter((x) => /^(learn|unlearn)_/.test(x.kind));
  if (!items.length) return [];
  const rows = [H('Specialisation')];
  for (const it of items) {
    const unlearn = it.kind.startsWith('unlearn_');
    const sp = app.ds.spell(SPEC_SPELL[it.kind.replace(/^(un)?learn_/, '')]);
    const name = sp?.name ?? it.kind.replace(/^(un)?learn_/, '');
    const cost = it.costCopper ?? 0;
    rows.push({
      text: `${unlearn ? red(`Unlearn ${name}`) : green(`Become a specialist: ${name}`)}${cost ? `  ${coinText(cost)}` : ''}`,
      detail: () => [bold(name), '', unlearn ? 'Forget this specialisation and the recipes that go with it.' : 'A specialisation opens its own recipes. You can hold one at a time.', ...(cost ? ['', `Cost ${coinText(cost)}`] : [])],
      act: (a) => (unlearn ? a.confirm(`Unlearn ${name}${cost ? ` for ${coinText(cost)}` : ''}? Its recipes are forgotten.`, () => applySpec(a, trainer, it, name, true)) : applySpec(a, trainer, it, name, false)),
    });
  }
  rows.push(H(''));
  return rows;
}

function applySpec(app, trainer, it, name, unlearn) {
  const g = app.g;
  // A learn first answers with a confirm step (GOSSIP_SENDER_MAIN), then casts on the check sender.
  let r = g.selectProfessionSpec(trainer.entry, { sender: unlearn ? GOSSIP_SENDER_CHECK : GOSSIP_SENDER_MAIN, action: it.action, ...(unlearn ? { equippedOk: true } : {}) });
  if (r.ok && !unlearn && r.phase === 'confirm_learn') r = g.selectProfessionSpec(trainer.entry, { sender: GOSSIP_SENDER_CHECK, action: it.action });
  if (!app.result(r)) return;
  if (r.grantedSpellId != null) app.say(green(`You are now a specialist: ${app.ds.spell(r.grantedSpellId)?.name ?? name}.`));
  else if (r.removedSpellId != null) app.say(yellow(`You forget ${app.ds.spell(r.removedSpellId)?.name ?? name}.`));
  else if (r.blacksmithUnlearnGap) app.say(red(`${name} cannot be unlearned here: the classic script never finished blacksmith unlearning.`));
  else app.say(dim('Nothing changes.'));
}

export function profTrainerDialog(app, trainer) {
  const ds = app.ds;
  const prof = ds.profession(trainer.skill);
  const teachables = () => {
    const ch = app.ch;
    const recipes = ds.recipes().filter((r) => r.skill === trainer.skill && r.source === 'trainer' && !ch.knownRecipes.includes(r.id)).map((r) => ({ kind: 'recipe', def: r, reqLevel: r.reqLevel ?? 0 }));
    const enchants = trainer.skill === 'enchanting' ? ds.enchants().filter((e) => e.source === 'trainer' && !(ch.knownEnchants ?? []).includes(e.id)).map((e) => ({ kind: 'enchant', def: e, reqLevel: e.reqLevel ?? 0 })) : [];
    return [...recipes, ...enchants].sort((x, y) => x.def.orange - y.def.orange || x.def.name.localeCompare(y.def.name));
  };
  const learn = (a, t) => (t.kind === 'recipe' ? a.g.learnRecipe(t.def.id, trainer.entry) : a.g.learnEnchant(t.def.id, trainer.entry));
  return {
    id: `proftrainer-${trainer.entry}`, title: trainer.name, hint: 'Enter: learn',
    keys: {
      A: { hint: 'learn all', fn: (a) => {
        let n = 0, spent = 0;
        const sk = a.ch.skills[trainer.skill];
        for (const t of teachables()) {
          if (!sk || sk.current < t.def.orange || a.ch.level < t.reqLevel) continue;
          const before = a.ch.gold;
          if (learn(a, t).ok) { n++; spent += before - a.ch.gold; }
        }
        a.say(n ? green(`You learn ${plural(n, 'recipe')}${spent ? ` for ${coinText(spent)}` : ''}.`) : dim('Nothing you can learn yet.'));
      } },
    },
    rows(a) {
      const ch = a.ch, sk = ch.skills[trainer.skill];
      const mod = vendorPriceMultiplierFor(ds, ch, trainer.entry);
      const rows = [H(`${bold(trainer.name)} ${dim(`<${prof?.name ?? trainer.skill} Trainer>`)}   ${coinText(ch.gold)}`), H(dim(sk ? `Your ${prof?.name} skill: ${sk.current}/${sk.max}` : `You do not know ${prof?.name ?? trainer.skill} yet.`)), H('')];
      const nr = prof ? nextTrainerRank(ch, prof) : undefined;
      if (nr) {
        const cost = trainerSpellCost(nr.cost, mod);
        const need = nextRankReqSkill(nr, sk);
        const why = ch.level < nr.reqLevel ? `requires level ${nr.reqLevel}` : (sk?.current ?? 0) < need ? `requires ${prof.name} ${need}` : ch.gold < cost ? 'not enough money' : '';
        rows.push(H('Rank'), {
          text: `${why ? dim(`${sk ? 'Train' : 'Learn'} ${nr.name} ${prof.name}`) : green(`${sk ? 'Train' : 'Learn'} ${nr.name} ${prof.name}`)}  ${coinText(cost, 'free')}${why ? red(`  ${why}`) : ''}`,
          detail: () => [bold(`${nr.name} ${prof.name}`), `Raises your ${prof.name} cap to ${nr.cap}.`, '', `Requires level ${nr.reqLevel}${need ? `, ${prof.name} ${need}` : ''}`, `Cost ${coinText(cost, 'free')}`, '', prof.kind !== 'secondary' && !sk ? dim('You can hold two primary professions. Cooking, First Aid and Fishing do not count.') : ''],
          act: () => a.result(a.g.learnProfession(trainer.entry), `You are now a${/^[AEIOU]/.test(nr.name) ? 'n' : ''} ${nr.name} ${prof.name}.`),
        }, H(''));
      } else if (sk) rows.push(H(dim(prof?.kind === 'secondary' && sk.max < 300 ? 'Expert and Artisan come from books, not trainers.' : 'You hold the highest rank they teach.')), H(''));
      rows.push(...specRows(a, trainer));
      const list = teachables();
      const now = list.filter((t) => sk && sk.current >= t.def.orange && ch.level >= t.reqLevel);
      const later = list.filter((t) => !now.includes(t)).slice(0, 20);
      rows.push(H(`Learn now (${now.length})`));
      if (!now.length) rows.push(H(dim(sk ? '  Nothing new at your skill. Raise it and come back.' : `  Learn ${prof?.name ?? 'the profession'} first.`)));
      const W = Math.max(20, Math.min(40, a.layout().listW - 16));
      for (const t of now) {
        const cost = trainerSpellCost(t.def.cost ?? 0, mod);
        const prod = t.kind === 'recipe' ? ds.item(t.def.product.item) : null;
        rows.push({
          text: `${fit(ch.gold >= cost ? t.def.name : dim(t.def.name), W)} ${coinText(cost, 'free')}`,
          detail: () => [...(prod ? itemLines(a, prod).filter((l) => !/Sells for/.test(l)) : [bold(t.def.name), dim(`goes on: ${t.def.slots.join(', ')}`)]), '', ...reagentLines(a, t.def.reagents, t.def.requiredTools, a.g.state.inventory), '', dim(`Requires ${prof?.name} ${t.def.orange}   cost ${coinText(cost, 'free')}`)],
          act: () => a.result(learn(a, t), `You learn ${t.def.name}.`),
        });
      }
      if (later.length) {
        rows.push(H(''), H('Coming up'));
        for (const t of later) rows.push(H(dim(`  ${fit(t.def.name, W)} ${prof?.name} ${t.def.orange}${t.reqLevel > ch.level ? `, level ${t.reqLevel}` : ''}  ${coinText(trainerSpellCost(t.def.cost ?? 0, mod))}`)));
      }
      return rows;
    },
  };
}

// ---- recipes in the bags ----------------------------------------------------------------------------------

/** Plans, Patterns and Formulas in your bags; Enter teaches one to you or to a companion with that craft. */
function teachFromItem(app, stack) {
  const ds = app.ds, it = ds.item(stack.item);
  const teach = itemTeachIntent(it, ds);
  if (!teach || (teach.kind !== 'recipe' && teach.kind !== 'enchant')) { app.flashMsg('That item does not teach a recipe.'); return; }
  const def = teach.kind === 'recipe' ? ds.recipe(teach.id) : ds.enchant(teach.id);
  const skill = teach.kind === 'recipe' ? def?.skill : 'enchanting';
  const opts = crafters(app, skill).map((cr) => {
    const knows = teach.kind === 'recipe' ? cr.char.knownRecipes.includes(teach.id) : (cr.char.knownEnchants ?? []).includes(teach.id);
    const sk = cr.char.skills[skill];
    return { label: `${cr.name}  ${sk ? dim(`${sk.current}/${sk.max}`) : red('untrained')}${knows ? dim('  knows it') : ''}`, value: cr };
  });
  if (!opts.length) { app.flashMsg('Nobody in the party has that profession.'); return; }
  app.pick(`Who learns ${def?.name ?? it?.name}?`, opts, (cr) => {
    const g = app.g;
    const res = cr.id
      ? (teach.kind === 'enchant' ? g.learnEnchantFromItemOnCompanion(cr.id, stack.item) : g.learnRecipeFromItemOnCompanion(cr.id, stack.item))
      : (teach.kind === 'enchant' ? g.learnEnchantFromItem(stack.item) : g.learnRecipeFromItem(stack.item));
    app.result(res, `${cr.id ? `${cr.name} learns` : 'You learn'} ${res.name ?? def?.name}.`);
  });
}

// ---- send goods -----------------------------------------------------------------------------------------

const FROM_LABEL = { theirs: 'their bags', you: 'your bags', bank: 'your bank' };

/** Plan the share: trade goods go to the companions who craft with them, upgrades go on whoever gains. */
export function openSendGoods(app) {
  const g = app.g;
  if (!companionsOf(g).length) { app.flashMsg('You have no companions. Hire one at an inn (Companions tab).'); return; }
  const modal = planCompanionShare({ inventory: g.state.inventory, squad: companionsOf(g), playerLevel: app.ch.level, playerSkills: app.ch.skills, ds: app.ds, upgrades: g.squadUpgradePlan() });
  if (!modal) { app.flashMsg('No upgrades or trade goods for your companions.'); return; }
  app.push(sendGoodsDialog(app, modal));
}

function sendGoodsDialog(app, modal) {
  const blocked = new Set(), blockedGear = new Set();
  const toggle = (set, key) => (set.has(key) ? set.delete(key) : set.add(key));
  return {
    id: 'send-goods', title: 'Send goods', hint: 'Enter: skip or keep a row',
    rows(a) {
      const gear = activeSendGoodsUpgrades(modal.upgrades, [...blockedGear]);
      const goods = activeTradeGoodsGifts(modal.rows, [...blocked]);
      const items = tradeGoodsGiftCount(goods);
      const rows = [...wrapLines('Upgrades go on whoever gains from them; trade goods go to the companions who craft with them. Enter on a row skips it, Enter again keeps it.', a.layout().listW - 2).map((t) => H(dim(t))), H('')];
      rows.push({
        text: gear.length || items ? green(`Apply: ${[gear.length && plural(gear.length, 'upgrade'), items && `${plural(items, 'item')} to send`].filter(Boolean).join(', ')}`) : dim('Nothing left to apply'),
        detail: () => [bold('Apply'), '', 'Equips every upgrade still ticked (taking it from your bags, your bank or their own bags) and gives every trade good still ticked.'],
        act: () => {
          const r = applyCompanionShare(a.g, { ...modal, blocked: [...blocked], blockedGear: [...blockedGear] });
          a.pop();
          a.say((r.equipped || r.moved ? green : red)(`${companionShareResultLine(r)}.`));
        },
      });
      if (modal.upgrades.length) {
        rows.push(H(''), H('Upgrades'));
        for (const u of modal.upgrades) {
          const key = sendGoodsUpgradeKey(u), off = blockedGear.has(key), it = a.ds.item(u.entry);
          rows.push({
            text: `${off ? dim('· skip') : green('✓')} ${fit(u.companionName, 10)} ${qualityPaint(it?.quality)(it?.name ?? u.entry)} ${dim(SLOT_LABEL[u.targetSlot] ?? u.targetSlot)} ${green(`+${Math.round(u.delta)}`)}${u.benched ? dim('  bench') : ''}`,
            detail: () => itemLines(a, it, ['', dim(`${u.currentEntry != null ? `replaces ${a.itemLabel(u.currentEntry)}` : 'empty slot'}, from ${FROM_LABEL[u.from] ?? u.from}`)]),
            act: () => toggle(blockedGear, key),
          });
        }
      }
      if (modal.rows.length) {
        rows.push(H(''), H('Trade goods'));
        for (const r of modal.rows) {
          const key = tradeGoodsGiftKey(r), off = blocked.has(key), it = a.ds.item(r.entry);
          rows.push({
            text: `${off ? dim('· skip') : green('✓')} ${qualityPaint(it?.quality)(it?.name ?? r.entry)}${r.qty > 1 ? ` x${r.qty}` : ''} ${dim(`→ ${r.companionName}`)}`,
            detail: () => itemLines(a, it, ['', dim(`${r.companionName} crafts with it.`)]),
            act: () => toggle(blocked, key),
          });
        }
      }
      return rows;
    },
  };
}

// ---- vendor hook -----------------------------------------------------------------------------------------

/** Item → names of the known recipes (yours and your companions') that use it, for the vendor's buy list. */
export function reagentUses(app) {
  const ds = app.ds, out = new Map();
  const add = (id) => {
    const r = ds.recipe(id) ?? ds.enchant(id);
    for (const rg of r?.reagents ?? []) { const l = out.get(rg.item) ?? []; if (!l.includes(r.name)) l.push(r.name); out.set(rg.item, l); }
  };
  for (const id of app.ch.knownRecipes) add(id);
  for (const id of app.ch.knownEnchants ?? []) add(id);
  for (const c of companionsOf(app.g)) { for (const id of c.knownRecipes ?? []) add(id); for (const id of c.knownEnchants ?? []) add(id); }
  return out;
}

// ---- the tab ----------------------------------------------------------------------------------------------

function profRowLines(app, cr, prof, sk, ready) {
  const out = [bold(`${prof.name}`) + dim(`  ${prof.kind}`), `${whose(cr)} skill ${sk.current}/${sk.max}${cr.char ? dim(`  ${currentRank(cr.char, prof)?.name ?? ''}`) : ''}`];
  const nr = !cr.id ? nextTrainerRank(cr.char, prof) : null;
  if (nr) out.push(dim(`Next rank: ${nr.name} (cap ${nr.cap}) at level ${nr.reqLevel}, skill ${nextRankReqSkill(nr, sk)}, from a ${prof.name} trainer.`));
  const known = prof.id === 'enchanting' ? (cr.char.knownEnchants ?? []).length : cr.char.knownRecipes.filter((id) => app.ds.recipe(id)?.skill === prof.id).length;
  out.push('', `${plural(known, prof.id === 'enchanting' ? 'formula' : 'recipe')} known${ready ? `, ${green(`${ready} ready`)}` : ''}`);
  if (cr.comp?.mission) { const p = missionProgress(cr.comp.mission, Date.now()); out.push(yellow(`${missionVerb(cr.comp.mission.skill)} in ${app.ds.zone(cr.comp.mission.zoneId)?.name}: ${missionEtaLabel(p)}`)); }
  out.push('', dim(GATHER_LINES.has(prof.id) && !cr.id ? 'Enter: nodes here and recipes' : 'Enter: open the recipe book'), dim(cr.id ? 'x: drop this profession' : 'x: unlearn (forgets every recipe)'));
  return out;
}

export function professionsView(app) {
  app.g.ensureProfessionStarters();
  return {
    id: 'profs', title: 'Professions', hint: 'Enter: open',
    keys: {
      g: { hint: 'send goods', fn: (a) => openSendGoods(a) },
      x: { hint: 'unlearn', fn: (a, row) => {
        const d = row?.data;
        if (!d?.skill) return;
        const name = a.ds.profession(d.skill)?.name ?? d.skill;
        if (d.cr.id) a.confirm(`${d.cr.name} drops ${name}, forgetting the skill and its recipes?`, () => a.result(a.g.unlearnCompanionProfession(d.cr.id, d.skill), `${d.cr.name} drops ${name}.`));
        else a.confirm(`Unlearn ${name}? You forget the skill and every recipe. This cannot be undone.`, () => a.result(a.g.unlearnProfession(d.skill), `You unlearn ${name}.`));
      } },
    },
    rows(a) {
      const ds = a.ds, g = a.g, env = craftEnv(a);
      const vault = partyVault(a);
      const readyCount = (cr, skill) => (skill === 'enchanting'
        ? ds.enchants().filter((e) => (cr.char.knownEnchants ?? []).includes(e.id) && enchantCheck(a, cr, e, env).ok).length
        : cr.char.knownRecipes.map((id) => ds.recipe(id)).filter((r) => r?.skill === skill && craftCheck(a, cr, r, env).ok).length);
      const profRows = (cr) => {
        const lines = Object.keys(cr.char.skills).map((k) => ds.profession(k)).filter(Boolean)
          .sort((x, y) => (KIND_ORDER[x.kind] ?? 3) - (KIND_ORDER[y.kind] ?? 3) || x.name.localeCompare(y.name));
        return lines.map((prof) => {
          const sk = cr.char.skills[prof.id];
          const ready = readyCount(cr, prof.id);
          const away = cr.comp?.mission?.skill === prof.id;
          return {
            text: `${cr.id ? `${fit(cr.name, 10)} ` : ''}${fit(prof.name, 15)} ${fit(`${sk.current}/${sk.max}`, 8)}${ready ? green(`${ready} ready`) : GATHER_LINES.has(prof.id) ? dim(prof.kind) : ''}${away ? yellow('  away') : ''}`,
            icon: prof.icon, sub: dim(currentRank(cr.char, prof)?.name ?? ''),
            data: { cr, skill: prof.id },
            detail: () => profRowLines(a, cr, prof, sk, ready),
            act: () => a.push(recipeBook(a, cr.id, prof.id)),
          };
        });
      };
      const you = crafterOf(a, null);
      const mine = profRows(you);
      const rows = [H(`Your professions   ${coinText(a.ch.gold)}`)];
      if (mine.length) rows.push(...mine);
      else rows.push(H(dim('  You have no professions yet. Profession trainers stand in towns and capitals (World tab).')));
      const comps = companionsOf(g);
      if (comps.length) {
        rows.push(H(''), H('Companions'));
        for (const c of comps) {
          const cr = crafterOf(a, c.id, vault);
          const lines = profRows(cr);
          if (lines.length) rows.push(...lines);
          else rows.push({ text: `${fit(c.name, 10)} ${dim('no professions')}`, detail: () => [bold(c.name), dim(`level ${companionLevel(c, a.ch.level)} ${className(c.cls)}`), '', 'Enter: open their companion page to take up a profession.'], act: () => a.push(companionDialog(a, c.id)) });
        }
      }
      const books = [];
      if (comps.length || mine.length) {
        books.push({ text: 'Everything the party can make', detail: () => [bold('Party recipes'), '', 'Every recipe you and your companions know, in one list. Each row names who can make it now; c picks someone else.', '', 'Companions craft from the whole party\'s bags and banks. Missing vendor goods are bought from your purse.'], act: () => a.push(partyBook(a)) });
      }
      if (comps.length) books.push({ text: `Send trade goods and upgrades to companions ${dim('(g)')}`, detail: () => [bold('Send goods'), '', 'Trade goods in your bags go to the companions whose recipes use them (ore to the blacksmith, herbs to the alchemist), and gear upgrades go on whoever gains from them. You review the list before anything moves.'], act: () => openSendGoods(a) });
      if (books.length) rows.push(H(''), H('Party'), ...books);
      const trainers = zoneProfTrainers(ds, a.ch.zoneId);
      if (trainers.length) {
        rows.push(H(''), H(`Trainers here (${trainers.length})`));
        for (const t of trainers) {
          const prof = ds.profession(t.skill);
          const sk = a.ch.skills[t.skill];
          const newOnes = sk ? ds.recipes().filter((r) => r.skill === t.skill && r.source === 'trainer' && !a.ch.knownRecipes.includes(r.id) && sk.current >= r.orange && a.ch.level >= (r.reqLevel ?? 0)).length : 0;
          rows.push({ text: `${t.name} ${dim(`<${prof?.name ?? t.skill} Trainer>`)}${newOnes ? green(`  ${newOnes} to learn`) : ''}`, icon: prof?.icon, sub: dim(sk ? `your skill ${sk.current}/${sk.max}` : 'not learned'), detail: () => [bold(t.name), `${prof?.name ?? t.skill} trainer`, '', dim('Enter: ranks and recipes')], act: () => a.push(profTrainerDialog(a, t)) });
        }
      }
      const books2 = [];
      g.state.inventory.stacks.forEach((s) => {
        const it = ds.item(s.item), teach = itemTeachIntent(it, ds);
        if (teach?.kind === 'recipe' || teach?.kind === 'enchant') books2.push({ text: `${qualityPaint(it.quality)(it.name)}${s.count > 1 ? ` x${s.count}` : ''}`, icon: it.icon, sub: dim(teach.kind), detail: () => itemLines(a, it, ['', dim('Enter: pick who learns it (you or a companion with the craft)')]), act: () => teachFromItem(a, s) });
      });
      if (books2.length) rows.push(H(''), H('Recipes in your bags'), ...books2);
      return rows;
    },
  };
}
