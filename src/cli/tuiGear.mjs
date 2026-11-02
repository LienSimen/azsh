// The Character tab's lower rows: what repairs cost and where, the ammo you shoot, and the food, water and elixirs the
// game uses for you out of combat. Per-slot durability and r (repair this one) ride on the slot rows themselves.
import { bold, dim, yellow, green, red, qualityPaint, itemText, secondsText, coinText } from './text.mjs';
import { equippedEntry, equippedInstance } from '../domain/items/itemInstance.ts';
import { gearEnchantDisplayName } from '../domain/professions/gearEnchant.ts';
import { hasDurability, maxDurability, currentDurability, repairCostSlot } from '../domain/items/durability.ts';
import { isAmmoItem, canUseAmmo, checkAmmoCompatibility, weaponNeedsProjectileAmmo } from '../domain/items/ammo.ts';
import { countItem } from '../domain/items/inventory.ts';
import { outfitterDialog } from './tuiOutfitter.mjs';
import { listAutoConsumableOptions, staleAutoConsumables, isAutoFood, isAutoDrink, isAutoBuff, AUTO_CONSUMABLE_VITAL_THRESHOLD } from '../domain/bots/autoConsumables.ts';

const H = (text) => ({ text, header: true });

/** "38/45" with a colour once it runs low, or '' for a slot that does not wear. */
/** The enchants on a worn piece: the permanent one (armor kit, scope, profession enchant), then a live weapon
 *  coat with its time left. `who` is the wearer's character record (yours, or a companion's built one), whose
 *  legacy enchant maps still carry what an older save applied. Phonecraft's itemTooltipEnchant.ts. */
export function enchantLines(app, who, slot, now = Date.now()) {
  const inst = equippedInstance(who?.equipped?.[slot]);
  const perm = (inst?.permEnchantId ?? who?.enchants?.[slot]) || 0;
  let temp = inst?.tempEnchant?.id > 0 ? inst.tempEnchant : null;
  if (!temp && (slot === 'mainhand' || slot === 'offhand')) {
    const te = who?.tempEnchants?.[slot];
    if (te?.enchantId > 0) temp = { id: te.enchantId, expiresAt: te.expiresAt };
  }
  if (temp?.expiresAt != null && temp.expiresAt <= now) temp = null;
  const out = [];
  const permName = perm ? gearEnchantDisplayName(perm, app.ds) : null;
  if (permName) out.push(green(permName));
  const tempName = temp ? gearEnchantDisplayName(temp.id, app.ds) : null;
  if (tempName) out.push(green(`${tempName}${temp.expiresAt != null ? dim(` (${secondsText(temp.expiresAt - now)})`) : ''}`));
  return out;
}

export function durabilityText(app, slot) {
  const entry = equippedEntry(app.ch.equipped[slot]);
  const it = entry != null ? app.ds.item(entry) : null;
  if (!it || !hasDurability(it)) return '';
  const cur = currentDurability(app.ch, slot, it), max = maxDurability(it);
  const paint = cur <= 0 ? red : cur / max <= 0.25 ? yellow : dim;
  return paint(`${cur}/${max}`);
}

/** r on a slot row: mend that one piece at the repairer the quote prices against. */
export function repairOne(app, slot) {
  const q = app.g.repairQuote();
  if (!q.vendorName) { app.flashMsg('Nobody here repairs. Look for a smith or a general goods vendor.'); return; }
  const cost = repairCostSlot(app.ch, slot, (e) => app.ds.item(e));
  if (!cost) { app.flashMsg('That piece needs no repair.'); return; }
  const r = app.g.repairSlot(slot, q.vendorEntry ?? undefined);
  app.result(r, r.ok ? `${q.vendorName} repairs it for ${coinText(r.spent)}.` : '');
}

/** Enter on Repair all, or R on the Character tab: mend everything you wear at the repairer the quote prices against. */
export function repairAll(app) {
  const q = app.g.repairQuote();
  if (!q.cost) { app.flashMsg('Nothing needs repair.'); return; }
  if (!q.vendorName) { app.flashMsg('Nobody here repairs.'); return; }
  const r = app.g.repairAll(q.vendorEntry ?? undefined);
  app.result(r, r.ok ? `Repaired for ${coinText(r.spent)}.` : '');
}

export function slotRepairLines(app, slot) {
  const cost = repairCostSlot(app.ch, slot, (e) => app.ds.item(e));
  if (!cost) return [];
  const q = app.g.repairQuote();
  return [q.vendorName ? dim(`r: repair this piece for ${coinText(cost)} at ${q.vendorName}`) : dim(`Repairing this piece costs about ${coinText(cost)}.`)];
}

const rangedWeapon = (app) => { const e = equippedEntry(app.ch.equipped.ranged); return e != null ? app.ds.item(e) : undefined; };

function pickAmmo(app) {
  const weapon = rangedWeapon(app);
  const seen = new Set();
  const opts = [];
  for (const s of app.g.state.inventory.stacks) {
    const it = app.ds.item(s.item);
    if (!it || !isAmmoItem(it) || seen.has(it.entry)) continue;
    seen.add(it.entry);
    const use = canUseAmmo(app.ch, it);
    const fits = !weapon || !weaponNeedsProjectileAmmo(weapon) || checkAmmoCompatibility(weapon, it);
    const note = !use.ok ? red(`  ${use.reason}`) : !fits ? yellow(`  does not fit your ${weapon.name}`) : '';
    opts.push({ label: `${app.ch.ammoItem === it.entry ? green('● ') : '  '}${qualityPaint(it.quality)(it.name)} ${dim(`x${countItem(app.g.state.inventory, it.entry)}`)}${it.ammoDps ? dim(`  +${it.ammoDps.dpsMin} dps`) : ''}${note}`, value: it.entry });
  }
  if (app.ch.ammoItem != null) opts.push({ label: dim('  No ammo'), value: null });
  if (!opts.length) { app.flashMsg('No arrows or shot in your bags. A general goods vendor sells them.'); return; }
  app.pick('Shoot which ammo?', opts, (entry) => {
    if (entry == null) app.result(app.g.clearAmmo(), 'You put your ammo away.');
    else app.result(app.g.setAmmo(entry), `You load ${app.itemLabel(entry)}.`);
  });
}

function autoSummary(app) {
  const p = app.ch.autoConsumables;
  const names = [p?.food, p?.drink, ...(p?.buffs ?? [])].filter((e) => e != null).map((e) => app.itemLabel(e));
  return names.length ? names.join(', ') : dim(`none (food and water under ${Math.round(AUTO_CONSUMABLE_VITAL_THRESHOLD * 100)}%)`);
}

export function autoConsumablesDialog(app) {
  const thr = Math.round(AUTO_CONSUMABLE_VITAL_THRESHOLD * 100);
  return {
    id: 'auto-cons', title: 'Auto consumables', hint: 'Enter: on / off',
    rows(a) {
      const c = a.ch, inv = a.g.state.inventory, prefs = c.autoConsumables;
      const rows = [H(`${bold('Auto consumables')}   ${dim('used for you out of combat: one food, one drink, any number of buffs')}`), H('')];
      for (const s of staleAutoConsumables(prefs, c, inv, a.ds)) {
        rows.push({
          text: `${red('✗')} ${itemText(s.item, `item ${s.entry}`)}  ${dim(`${s.slot}, not in your bags`)}`,
          detail: () => [bold(itemText(s.item, `item ${s.entry}`)), '', 'Set to auto-use, but none are left in your bags.', '', dim('Enter: take it off the list')],
          act: (a2) => a2.result(a2.g.clearAutoConsumable(s.entry), `${itemText(s.item, 'It')} is off the list.`),
        });
      }
      const opts = listAutoConsumableOptions(c, inv, a.ds);
      if (!opts.length) rows.push(H(dim('  No food, drink, potions or elixirs in your bags.')));
      for (const { entry, count, kind, item: it } of opts) {
        const on = kind === 'food' ? isAutoFood(prefs, entry) : kind === 'drink' ? isAutoDrink(prefs, entry) : isAutoBuff(prefs, entry);
        const when = kind === 'food' || kind === 'heal' ? `eats it when health is under ${thr}%` : kind === 'drink' ? `drinks it when mana is under ${thr}%` : 'uses it when the buff is missing';
        rows.push({
          text: `${on ? green('✓') : dim('·')} ${qualityPaint(it.quality)(it.name)} ${dim(`x${count}  ${kind}`)}`,
          detail: () => [bold(itemText(it)), dim(kind), '', `On: the game ${when}.`, '', dim('Enter: switch on / off')],
          act: (a2) => { const r = a2.g.setAutoConsumable(entry); a2.result(r, r.ok ? `${itemText(it)}: auto-use ${on ? 'off' : 'on'}.` : ''); },
        });
      }
      return rows;
    },
  };
}

/** The rows under the paperdoll on the Character tab. */
export function gearExtraRows(app) {
  const rows = [H(''), H('Upkeep')];
  const q = app.g.repairQuote();
  rows.push({
    text: `Repair all  ${q.cost ? coinText(q.cost) : dim('nothing to mend')}${q.cost ? dim(q.vendorName ? `  at ${q.vendorName}` : '  nobody here repairs') : ''}`,
    detail: () => [bold('Repair'), '', q.cost ? `Mending everything you wear costs ${coinText(q.cost)}.` : 'Everything you wear is in good shape.', q.vendorName ? dim(`Priced at ${q.vendorName}.`) : dim('A smith or general goods vendor repairs.'), '', dim('Enter: repair all   r on a slot: repair one piece')],
    act: (a) => repairAll(a),
  });
  const weapon = rangedWeapon(app);
  const hasAmmo = app.g.state.inventory.stacks.some((s) => isAmmoItem(app.ds.item(s.item)));
  if ((weapon && weaponNeedsProjectileAmmo(weapon)) || app.ch.ammoItem != null || hasAmmo) {
    const cur = app.ch.ammoItem;
    const left = cur != null ? countItem(app.g.state.inventory, cur) : 0;
    rows.push({
      text: `Ammo        ${cur != null ? `${app.itemLabel(cur)} ${left ? dim(`x${left}`) : red('none left')}` : weapon && weaponNeedsProjectileAmmo(weapon) ? red('none loaded') : dim('none')}`,
      detail: () => [bold('Ammo'), '', weapon ? `Ranged: ${itemText(weapon)}` : dim('No ranged weapon worn.'), cur != null ? `Loaded: ${app.itemLabel(cur)} (${left} in your bags)` : 'Nothing loaded.', '', dim('Enter: pick ammo from your bags')],
      act: (a) => pickAmmo(a),
    });
  }
  const outfits = app.g.outfitterState().outfits.length;
  rows.push({
    text: `Outfits     ${outfits ? `${outfits} saved` : dim('none yet')}`,
    detail: () => [bold('Outfitter'), '', 'Named gear sets for you and your companions: put one on with a key.', '', dim('Enter (or o): open')],
    act: (a) => a.push(outfitterDialog(a)),
  });
  rows.push({
    text: `Auto use    ${autoSummary(app)}`,
    detail: () => [bold('Auto consumables'), '', 'Food, water, potions and elixirs the game uses for you between fights.', '', dim('Enter: choose')],
    act: (a) => a.push(autoConsumablesDialog(a)),
  });
  return rows;
}
