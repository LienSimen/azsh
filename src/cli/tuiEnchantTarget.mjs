// The "apply to which slot?" picker behind an armor kit, a scope, an arcanum, a poison, a sharpening stone and a
// shaman weapon imbue. The engine refuses with `needsTarget` when no slot is named, and its `slots` are already
// filtered for that wearer, so nothing here re-derives eligibility: every offered row came from the engine, and
// a refused slot rides along greyed out with its reason. Phonecraft's panels/enchantTargetPicker.ts is the
// reference.
import { dim, qualityPaint, itemText } from './text.mjs';
import { itemLines } from './tuiViews.mjs';
import { SLOT_LABEL } from '../domain/items/equipment.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { learnOnCompanionPool } from '../domain/spells/learnOnTargets.ts';

/** Every companion whose gear a permanent enchant may land on: squad and roster, the ones away on a mission left out. */
function companionWearers(app) {
  const st = app.g.state;
  return learnOnCompanionPool(st.squad, st.botRoster, st.raidRoster?.members).filter((c) => !c.mission);
}

function wornOn(app, target, slot) {
  const eq = target.kind === 'self' ? app.ch.equipped : companionWearers(app).find((c) => c.id === target.id)?.equipped;
  const entry = eq ? equippedEntry(eq[slot]) : undefined;
  return entry != null ? app.ds.item(entry) : undefined;
}

/** True when the item applies a permanent enchant (armor kit / arcanum / scope), which never consumes on a probe. */
export function isPermanentEnchantItem(app, it) {
  return !!(it?.useSpell && app.ds.enchantApplicator?.(it.useSpell)?.permanent);
}

/** "You" or the companion's name, for a wearer row. */
function wearerName(app, target) {
  if (target.kind === 'self') return 'You';
  return companionWearers(app).find((c) => c.id === target.id)?.name ?? 'Companion';
}

/**
 * Open the picker. `wearers` is a list of { target, needsTarget } the engine already answered for;
 * `apply(target, slot)` runs with the choice. The picker stays open on a refused row and names the reason.
 */
export function pickEnchantTarget(app, what, wearers, apply) {
  const many = wearers.length > 1;
  const options = [];
  for (const { target, needsTarget } of wearers) {
    const who = wearerName(app, target);
    const row = (slot, reason) => {
      const it = wornOn(app, target, slot);
      const label = `${many ? `${who} · ` : ''}${SLOT_LABEL[slot] ?? slot}: ${it ? qualityPaint(it.quality)(it.name) : '-'}`;
      return {
        label: reason ? dim(`${label}  ${reason}`) : label,
        detail: () => itemLines(app, it, reason ? ['', dim(reason)] : ['', dim(`Enter: apply ${what} here`)]),
        value: reason ? { refused: reason } : { target, slot },
      };
    };
    for (const slot of needsTarget.slots) options.push(row(slot));
    for (const r of needsTarget.rejected) options.push(row(r.slot, r.reason));
  }
  if (!options.length) { app.flashMsg('Nothing equipped can take that.'); return; }
  app.pick(`Apply ${what} to…`, options, (v) => {
    if (v.refused) { app.flashMsg(v.refused); return; }
    app.pop();
    apply(v.target, v.slot);
    app.afterAction();
  }, { keepOpen: true });
}

/**
 * Use a bag item through the engine, opening the slot picker when it needs one. Returns true when the item was
 * used right away, false on a refusal, and null when the picker is open and the outcome is still to come.
 */
export function useItemWithPicker(app, entry, okText) {
  const r = app.g.consumeItem(entry);
  if (r.ok) { if (okText) app.say(okText(r)); return true; }
  if (!r.needsTarget) { app.result(r); return false; }
  const it = app.ds.item(entry);
  const wearers = [{ target: r.needsTarget.target, needsTarget: r.needsTarget }];
  // A permanent enchant can go on a companion too. A probe with no slot never consumes on that path, but a
  // temporary imbue would coat a companion's only weapon straight away, so those stay on your own gear.
  if (isPermanentEnchantItem(app, it)) {
    for (const c of companionWearers(app)) {
      const target = { kind: 'companion', id: c.id };
      const p = app.g.consumeItem(entry, { target });
      if (!p.ok && p.needsTarget) wearers.push({ target, needsTarget: p.needsTarget });
    }
  }
  pickEnchantTarget(app, itemText(it), wearers, (target, slot) => {
    const worn = wornOn(app, target, slot);
    const r2 = app.g.consumeItem(entry, { target, slot });
    app.result(r2, r2.ok ? `You apply ${itemText(it)} to ${target.kind === 'self' ? 'your' : `${wearerName(app, target)}'s`} ${itemText(worn, 'gear')}.` : '');
  });
  return null;
}

/** Cast a spell out of combat, opening the hand picker when a weapon imbue needs one. */
export function castWithPicker(app, spellId, opts) {
  const sp = app.ds.spell(spellId);
  const name = sp?.name ?? `spell ${spellId}`;
  const r = app.g.castOutOfCombat(spellId, opts);
  if (r.ok) { app.say(`You cast ${name}.`); return true; }
  if (!r.needsTarget) { app.result(r); return false; }
  pickEnchantTarget(app, name, [{ target: { kind: 'self' }, needsTarget: r.needsTarget }], (target, slot) => {
    const worn = wornOn(app, target, slot);
    const r2 = app.g.castOutOfCombat(spellId, { ...(opts ?? {}), slot });
    app.result(r2, r2.ok ? `You cast ${name} on your ${itemText(worn, 'weapon')}.` : '');
  });
  return null;
}

/** A companion uses an item from their own bags, with the hand picker when a weapon imbue needs one. */
export function companionUseWithPicker(app, comp, entry) {
  const it = app.ds.item(entry);
  const r = app.g.useCompanionItem(comp.id, entry);
  if (r.ok) { app.say(`${comp.name} uses ${itemText(it)}.`); return true; }
  if (!r.needsTarget) { app.result(r); return false; }
  const target = { kind: 'companion', id: comp.id };
  pickEnchantTarget(app, itemText(it), [{ target, needsTarget: r.needsTarget }], (_t, slot) => {
    const worn = wornOn(app, target, slot);
    const r2 = app.g.useCompanionItem(comp.id, entry, { slot });
    app.result(r2, r2.ok ? `${comp.name} applies ${itemText(it)} to their ${itemText(worn, 'gear')}.` : '');
  });
  return null;
}
