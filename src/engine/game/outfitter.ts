// Outfitter wear / seed / specials. Pattern C: createOutfitterModule(ctx, extras).

import { emptyInventory, countItem } from '../../domain/items/inventory.ts';
import { bagCapacity, equipItem, unequipItem, DUAL_WIELD_SPELL_ID, type EquipOpts } from '../../domain/items/equipment.ts';
import { bankCapacity, withdraw } from '../../domain/items/bank.ts';
import { knows } from '../../domain/character/spellbook.ts';
import {
  companionCharacter,
  companionLevel,
  companionSpellbook,
  type Companion,
} from '../../domain/bots/squad.ts';
import { equippedInstance } from '../../domain/items/itemInstance.ts';
import { maxHealth, maxPower, powerType } from '../../domain/character/character.ts';
import {
  addOutfit,
  applyToggleToStack,
  applyUnwearToStack,
  applyWearToStack,
  auraSpecialFromSpellName,
  deleteOutfit,
  ensureSeeded,
  findOutfitById,
  findOutfitByName,
  generateOutfitForStat,
  mergedTarget,
  normalizeOutfitterState,
  parseOutfitterCommand,
  planWear,
  refreshSeededBase,
  renameOutfit,
  ridingBlocked,
  setAllSlots,
  setOutfitSlot,
  snapshotOutfit,
  specialIdsForContext,
  updateOutfit,
  wearingOutfit,
  type Outfit,
  type OutfitOwnerId,
  type OutfitSpecialId,
  type OutfitterState,
  type SpecialContext,
  type WearOp,
} from '../../domain/bots/outfitter.ts';
import { setOutfitSlot as setBarOutfitSlot } from '../../domain/character/actionbar.ts';
import { mutateActionBarsForForm } from '../../domain/character/stanceBar.ts';
import type { Game, OutfitWearResult } from './types.ts';
import type { GameCtx } from './context.ts';

export type { OutfitOwnerId, OutfitWearResult };

export type OutfitterExtras = {
  isInCombat: () => boolean;
  outfitterEnabled: () => boolean;
};

function ownerKey(owner: OutfitOwnerId): OutfitOwnerId {
  return owner || 'player';
}

export function createOutfitterModule(
  ctx: GameCtx,
  extras: OutfitterExtras,
): Pick<
  Game,
  | 'outfitterEnabled'
  | 'outfitterState'
  | 'ensureOutfitter'
  | 'createOutfit'
  | 'renameOutfit'
  | 'deleteOutfit'
  | 'rebuildOutfit'
  | 'setOutfitSlot'
  | 'setOutfitSlotsAll'
  | 'setOutfitDisabled'
  | 'selectOutfit'
  | 'wearOutfit'
  | 'unwearOutfit'
  | 'toggleOutfit'
  | 'wearOutfitByName'
  | 'generateOutfit'
  | 'setOutfitActionSlot'
  | 'syncOutfitterSpecials'
  | 'runOutfitterCommand'
> {
  const { ds, state, log } = ctx;

  const enabled = () => extras.outfitterEnabled();

  const findComp = (id: string): Companion | undefined =>
    state.squad?.find((c) => c.id === id)
    ?? state.botRoster?.[id]
    ?? state.raidRoster?.members?.[id];

  const playerWearer = () => ({
    char: state.char,
    bags: state.inventory,
    bank: state.bank,
    spellbook: state.spellbook,
  });

  const companionWearer = (comp: Companion) => {
    const lvl = companionLevel(comp, state.char.level);
    return {
      char: companionCharacter(comp, lvl, ds),
      bags: comp.bags ?? emptyInventory(),
      bank: comp.bank ?? emptyInventory(),
      spellbook: companionSpellbook(comp, lvl, ds),
    };
  };

  const readState = (owner: OutfitOwnerId): OutfitterState => {
    if (owner === 'player') return normalizeOutfitterState(state.outfitter);
    const comp = findComp(owner);
    return normalizeOutfitterState(comp?.outfitter);
  };

  const writeState = (owner: OutfitOwnerId, next: OutfitterState): void => {
    if (owner === 'player') {
      state.outfitter = next;
      return;
    }
    const comp = findComp(owner);
    if (comp) comp.outfitter = next;
  };

  const ensure = (owner: OutfitOwnerId): OutfitterState => {
    const cur = readState(owner);
    if (cur.outfits.length > 0) {
      writeState(owner, cur);
      return cur;
    }
    const wearer = owner === 'player' ? playerWearer() : (() => {
      const c = findComp(owner);
      return c ? companionWearer(c) : playerWearer();
    })();
    const seeded = ensureSeeded(cur, wearer, ds);
    writeState(owner, seeded);
    return seeded;
  };

  const equipOptsFor = (owner: OutfitOwnerId): EquipOpts => {
    if (owner === 'player') {
      return { canDualWield: knows(state.spellbook, DUAL_WIELD_SPELL_ID) };
    }
    const comp = findComp(owner);
    if (!comp) return {};
    const lvl = companionLevel(comp, state.char.level);
    return { canDualWield: knows(companionSpellbook(comp, lvl, ds), DUAL_WIELD_SPELL_ID) };
  };

  const applyPlayerOp = (op: WearOp): string | null => {
    if (op.kind === 'missing') return `Can't find item`;
    if (op.kind === 'setAmmo') {
      if (op.entry == null) {
        const next = { ...state.char };
        delete next.ammoItem;
        state.char = next;
      } else if (countItem(state.inventory, op.entry) > 0) {
        state.char = { ...state.char, ammoItem: op.entry };
      }
      return null;
    }
    if (op.kind === 'unequip') {
      const r = unequipItem(state.char, state.inventory, ds, op.slot);
      if (!r.ok) return r.reason ?? 'Cannot unequip';
      state.char = r.char;
      state.inventory = r.inventory;
      return null;
    }
    if (op.from === 'equipped' && op.fromSlot && op.fromSlot !== op.slot) {
      const u = unequipItem(state.char, state.inventory, ds, op.fromSlot);
      if (u.ok) {
        state.char = u.char;
        state.inventory = u.inventory;
      }
    }
    if (op.from === 'bank') {
      const it = ds.item(op.entry);
      const w = withdraw(
        state.inventory, state.bank, op.entry, 1, it?.stackable ?? 1, ctx.cap(),
      );
      if (!w.ok) return w.reason ?? 'Cannot withdraw';
      state.inventory = w.inventory;
      state.bank = w.bank;
    }
    const r = equipItem(state.char, state.inventory, ds, op.entry, op.slot, equipOptsFor('player'));
    if (!r.ok) return r.reason ?? 'Cannot equip';
    state.char = r.char;
    state.inventory = r.inventory;
    return null;
  };

  const applyCompanionOp = (comp: Companion, op: WearOp): string | null => {
    if (op.kind === 'missing') return `Can't find item`;
    if (op.kind === 'setAmmo') return null;
    const lvl = companionLevel(comp, state.char.level);
    const opts = equipOptsFor(comp.id);
    if (op.kind === 'unequip') {
      const char = companionCharacter(comp, lvl, ds);
      const r = unequipItem(char, comp.bags ?? emptyInventory(), ds, op.slot);
      if (!r.ok) return r.reason ?? 'Cannot unequip';
      comp.equipped = { ...r.char.equipped };
      comp.tempEnchants = r.char.tempEnchants;
      comp.bags = r.inventory;
      return null;
    }
    let bags = comp.bags ?? emptyInventory();
    let bank = comp.bank ?? emptyInventory();
    if (op.from === 'bank') {
      const it = ds.item(op.entry);
      const char = companionCharacter(comp, lvl, ds);
      const w = withdraw(bags, bank, op.entry, 1, it?.stackable ?? 1, bagCapacity(char, ds));
      if (!w.ok) return w.reason ?? 'Cannot withdraw';
      bags = w.inventory;
      bank = w.bank;
      comp.bags = bags;
      comp.bank = bank;
    }
    if (op.from === 'equipped' && op.fromSlot && op.fromSlot !== op.slot) {
      const char0 = companionCharacter(comp, lvl, ds);
      const u = unequipItem(char0, bags, ds, op.fromSlot);
      if (u.ok) {
        comp.equipped = { ...u.char.equipped };
        comp.tempEnchants = u.char.tempEnchants;
        bags = u.inventory;
        comp.bags = bags;
      }
    }
    const char = companionCharacter(comp, lvl, ds);
    const r = equipItem(char, bags, ds, op.entry, op.slot, { ...opts, skipBagCapacityCheck: true });
    if (!r.ok) return r.reason ?? 'Cannot equip';
    const cap = bagCapacity(r.char, ds);
    if ((r.inventory.stacks.length) > cap) {
      const bCap = bankCapacity(comp.bankBags ?? [], ds);
      // displaced already in r.inventory; if over cap, last-resort fail
      if (r.inventory.stacks.length > cap + (bCap - (bank.stacks.length))) {
        return 'Inventory full';
      }
    }
    comp.equipped = { ...r.char.equipped };
    comp.tempEnchants = r.char.tempEnchants;
    comp.bags = r.inventory;
    comp.bank = bank;
    return null;
  };

  const applyOps = (owner: OutfitOwnerId, ops: WearOp[]): { applied: number; missing: number; error?: string } => {
    let applied = 0;
    let missing = 0;
    // Unequip first so bag space frees before we pull replacements.
    const ordered = [
      ...ops.filter((o) => o.kind === 'unequip'),
      ...ops.filter((o) => o.kind !== 'unequip' && o.kind !== 'missing'),
      ...ops.filter((o) => o.kind === 'missing'),
    ];
    const comp = owner === 'player' ? undefined : findComp(owner);
    for (const op of ordered) {
      if (op.kind === 'missing') {
        missing++;
        continue;
      }
      const err = owner === 'player' ? applyPlayerOp(op) : (comp ? applyCompanionOp(comp, op) : 'No such companion');
      if (err) {
        if (!applied && !missing) return { applied, missing, error: err };
        continue;
      }
      applied++;
    }
    return { applied, missing };
  };

  // The seeded base outfit tracks the paperdoll instead of freezing it: without this, applying the
  // stack strips every piece equipped since the outfitter seeded itself back into the bags.
  const refreshBase = (owner: OutfitOwnerId): void => {
    const st = readState(owner);
    if (owner === 'player') {
      writeState(owner, refreshSeededBase(st, state.char.equipped, state.char.ammoItem));
      return;
    }
    const comp = findComp(owner);
    if (comp) writeState(owner, refreshSeededBase(st, comp.equipped));
  };

  const applyStack = (owner: OutfitOwnerId): { missing: number; error?: string } => {
    const st = readState(owner);
    const wearer = owner === 'player' ? playerWearer() : (() => {
      const c = findComp(owner);
      return c ? companionWearer(c) : null;
    })();
    if (!wearer) return { missing: 0, error: 'No such companion' };
    const target = mergedTarget(st);
    const plan = planWear(
      target.items,
      wearer.char.equipped,
      wearer.bags,
      wearer.bank,
      ds,
      owner === 'player' ? target.ammoEntry : undefined,
      owner === 'player' ? state.char.ammoItem : undefined,
    );
    return applyOps(owner, plan.ops);
  };

  const wearOne = (
    owner: OutfitOwnerId,
    outfit: Outfit,
    mode: 'wear' | 'unwear' | 'toggle',
  ): OutfitWearResult => {
    if (extras.isInCombat()) return { ok: false, reason: 'Cannot change outfits in combat' };
    ensure(owner);
    refreshBase(owner);
    let st = readState(owner);
    const live = findOutfitById(st, outfit.id);
    if (!live) return { ok: false, reason: 'Outfit not found' };
    if (live.disabled && mode !== 'unwear') return { ok: false, reason: 'That outfit is disabled' };
    let wearing = wearingOutfit(st, live.id);
    if (mode === 'wear') {
      st = applyWearToStack(st, live);
      wearing = true;
    } else if (mode === 'unwear') {
      st = applyUnwearToStack(st, live.id);
      wearing = false;
    } else {
      const t = applyToggleToStack(st, live);
      st = t.state;
      wearing = t.wearing;
    }
    writeState(owner, st);
    const applied = applyStack(owner);
    if (applied.error && applied.missing === 0) return { ok: false, reason: applied.error };
    return { ok: true, wearing, name: live.name, missing: applied.missing };
  };

  const buildSpecialCtx = (): SpecialContext => {
    const zone = ds.zone(state.char.zoneId);
    const inst = state.instance?.dungeonId ?? null;
    const bg = state.battleground?.bgId ?? null;
    const hp = maxHealth(state.char, ds);
    const ptype = powerType(state.char);
    const mp = ptype === 'mana' ? maxPower(state.char, ds) : 0;
    const hpFull = hp > 0 && state.char.health / hp >= 0.99;
    const manaFull = mp <= 0 || state.char.power / mp >= 0.99;
    const diningAura = (state.char.activeAuras ?? []).some((a) => {
      const sp = ds.spell(a.spellId);
      return sp?.name && /food|drink|refreshment/i.test(sp.name);
    });
    const dining = diningAura && !(hpFull && manaFull);
    const auraSpecials: OutfitSpecialId[] = [];
    for (const a of state.char.activeAuras ?? []) {
      const sp = ds.spell(a.spellId);
      const sid = sp?.name ? auraSpecialFromSpellName(sp.name) : undefined;
      if (sid) auraSpecials.push(sid);
    }
    return {
      zoneName: zone?.name,
      instanceId: inst,
      battleground: bg === 'wsg' || bg === 'ab' ? bg : null,
      mounted: state.char.mountedItem != null,
      dining,
      form: (state.char.form ?? 0) | 0,
      auraSpecials,
      inBattleground: !!state.battleground,
    };
  };

  const syncOwnerSpecials = (owner: OutfitOwnerId, ctxSpec: SpecialContext): void => {
    ensure(owner);
    refreshBase(owner);
    const st = readState(owner);
    let next = st;
    const desired = specialIdsForContext(ctxSpec);
    for (const o of st.outfits) {
      if (!o.specialId) continue;
      const want = desired.includes(o.specialId) && !o.disabled && !ridingBlocked(o, ctxSpec);
      const have = wearingOutfit(next, o.id);
      if (want && !have) next = applyWearToStack(next, o);
      else if (!want && have) next = applyUnwearToStack(next, o.id);
    }
    writeState(owner, next);
    applyStack(owner);
  };

  return {
    outfitterEnabled() {
      return enabled();
    },

    outfitterState(owner = 'player') {
      return ensure(ownerKey(owner));
    },

    ensureOutfitter(owner = 'player') {
      return ensure(ownerKey(owner));
    },

    createOutfit(opts) {
      const owner = ownerKey(opts.owner ?? 'player');
      if (extras.isInCombat()) return { ok: false, reason: 'Cannot change outfits in combat' };
      const st = ensure(owner);
      const wearer = owner === 'player' ? playerWearer() : (() => {
        const c = findComp(owner);
        return c ? companionWearer(c) : null;
      })();
      if (!wearer) return { ok: false, reason: 'No such companion' };
      let outfit: Outfit;
      if (opts.statId) {
        const gen = generateOutfitForStat(
          opts.name ?? opts.statId, opts.statId, wearer.char, wearer.bags, wearer.bank, ds,
          wearer.spellbook,
        );
        if (!gen) return { ok: false, reason: 'None of your items have that attribute' };
        outfit = gen;
      } else if (opts.empty) {
        outfit = {
          id: 'tmp', name: opts.name ?? 'Outfit', category: 'Partial', items: {},
        };
      } else {
        outfit = snapshotOutfit('tmp', opts.name ?? 'Outfit', wearer.char.equipped, wearer.char.ammoItem);
      }
      const next = addOutfit(st, outfit);
      const created = next.outfits[next.outfits.length - 1]!;
      writeState(owner, next);
      if (opts.party && opts.statId) {
        for (const c of state.squad ?? []) {
          if (c.id === owner) continue;
          this.generateOutfit(opts.statId, { owner: c.id, name: created.name, party: false });
        }
        if (owner !== 'player') {
          this.generateOutfit(opts.statId, { owner: 'player', name: created.name, party: false });
        }
      }
      return { ok: true, id: created.id, name: created.name };
    },

    renameOutfit(owner, id, name) {
      const o = ownerKey(owner);
      const st = ensure(o);
      if (!findOutfitById(st, id)) return { ok: false, reason: 'Outfit not found' };
      writeState(o, renameOutfit(st, id, name));
      return { ok: true };
    },

    deleteOutfit(owner, id) {
      const o = ownerKey(owner);
      const st = ensure(o);
      const hit = findOutfitById(st, id);
      if (!hit) return { ok: false, reason: 'Outfit not found' };
      if (hit.specialId) return { ok: false, reason: 'Cannot delete a special occasion outfit' };
      writeState(o, deleteOutfit(st, id));
      return { ok: true };
    },

    rebuildOutfit(owner, id) {
      const o = ownerKey(owner);
      const st = ensure(o);
      const hit = findOutfitById(st, id);
      if (!hit?.statId) return { ok: false, reason: 'That outfit cannot be rebuilt' };
      const wearer = o === 'player' ? playerWearer() : (() => {
        const c = findComp(o);
        return c ? companionWearer(c) : null;
      })();
      if (!wearer) return { ok: false, reason: 'No such companion' };
      const gen = generateOutfitForStat(
        hit.name, hit.statId, wearer.char, wearer.bags, wearer.bank, ds, wearer.spellbook, hit.id,
      );
      if (!gen) return { ok: false, reason: 'None of your items have that attribute' };
      writeState(o, updateOutfit(st, id, { items: gen.items, category: gen.category, isAccessory: gen.isAccessory }));
      return { ok: true };
    },

    setOutfitSlot(owner, id, slot, enabled) {
      const o = ownerKey(owner);
      const st = ensure(o);
      const wearer = o === 'player' ? playerWearer() : (() => {
        const c = findComp(o);
        return c ? companionWearer(c) : null;
      })();
      if (!wearer) return { ok: false, reason: 'No such companion' };
      const inst = equippedInstance(wearer.char.equipped[slot]);
      const ref = enabled
        ? (inst ? { entry: inst.item, permEnchantId: inst.permEnchantId, randomPropertyId: inst.randomPropertyId } : { entry: 0 })
        : null;
      writeState(o, setOutfitSlot(st, id, slot, ref));
      return { ok: true };
    },

    setOutfitSlotsAll(owner, id, enable) {
      const o = ownerKey(owner);
      const st = ensure(o);
      const wearer = o === 'player' ? playerWearer() : (() => {
        const c = findComp(o);
        return c ? companionWearer(c) : null;
      })();
      if (!wearer) return { ok: false, reason: 'No such companion' };
      writeState(o, setAllSlots(st, id, wearer.char.equipped, enable));
      return { ok: true };
    },

    setOutfitDisabled(owner, id, disabled) {
      const o = ownerKey(owner);
      const st = ensure(o);
      if (!findOutfitById(st, id)) return { ok: false, reason: 'Outfit not found' };
      let next = updateOutfit(st, id, { disabled });
      if (disabled) next = applyUnwearToStack(next, id);
      writeState(o, next);
      if (disabled) applyStack(o);
      return { ok: true };
    },

    selectOutfit(owner, id) {
      const o = ownerKey(owner);
      const st = ensure(o);
      if (id != null && !findOutfitById(st, id)) return { ok: false, reason: 'Outfit not found' };
      writeState(o, { ...st, selectedId: id ?? null });
      return { ok: true };
    },

    wearOutfit(owner, id) {
      const o = ownerKey(owner);
      const st = ensure(o);
      const hit = findOutfitById(st, id);
      if (!hit) return { ok: false, reason: 'Outfit not found' };
      const res = wearOne(o, hit, 'wear');
      if (res.ok) log(`Outfitter: ${hit.name} equipped`);
      return res;
    },

    unwearOutfit(owner, id) {
      const o = ownerKey(owner);
      const st = ensure(o);
      const hit = findOutfitById(st, id);
      if (!hit) return { ok: false, reason: 'Outfit not found' };
      const res = wearOne(o, hit, 'unwear');
      if (res.ok) log(`Outfitter: ${hit.name} unequipped`);
      return res;
    },

    toggleOutfit(owner, id) {
      const o = ownerKey(owner);
      const st = ensure(o);
      const hit = findOutfitById(st, id);
      if (!hit) return { ok: false, reason: 'Outfit not found' };
      const res = wearOne(o, hit, 'toggle');
      if (res.ok) log(res.wearing ? `Outfitter: ${hit.name} equipped` : `Outfitter: ${hit.name} unequipped`);
      return res;
    },

    wearOutfitByName(name, opts) {
      if (extras.isInCombat()) return { ok: false, reason: 'Cannot change outfits in combat' };
      const party = opts?.party !== false && opts?.owner == null;
      const owners: OutfitOwnerId[] = party
        ? ['player', ...(state.squad ?? []).map((c) => c.id)]
        : [ownerKey(opts?.owner ?? 'player')];
      const results: Array<{ owner: OutfitOwnerId; name: string; ok: boolean; reason?: string }> = [];
      let any = false;
      let wearing = false;
      let missing = 0;
      for (const owner of owners) {
        const st = ensure(owner);
        const hit = findOutfitByName(st, name);
        if (!hit) {
          results.push({ owner, name, ok: false, reason: 'No outfit with that name' });
          continue;
        }
        const res = wearOne(owner, hit, hit.category === 'Complete' ? 'wear' : 'toggle');
        results.push({
          owner,
          name: hit.name,
          ok: res.ok,
          reason: res.ok ? undefined : res.reason,
        });
        if (res.ok) {
          any = true;
          wearing = res.wearing;
          missing += res.missing;
        }
      }
      if (!any) return { ok: false, reason: `No one has an outfit named ${name}` };
      log(`Outfitter: ${name} ${wearing ? 'equipped' : 'unequipped'}`);
      return { ok: true, wearing, name, missing, party: results };
    },

    generateOutfit(statId, opts) {
      return this.createOutfit({
        owner: opts?.owner,
        name: opts?.name,
        statId,
        party: opts?.party,
      });
    },

    setOutfitActionSlot(bar, slot, name) {
      const form = (state.char.form ?? 0) | 0;
      const out = mutateActionBarsForForm(state.actionBars, state.primaryBarPages, form, (bars) =>
        setBarOutfitSlot(bars, bar, slot, name));
      state.actionBars = out.bars;
      state.primaryBarPages = out.primaryBarPages;
    },

    syncOutfitterSpecials() {
      if (!enabled()) return;
      if (extras.isInCombat()) return;
      const ctxSpec = buildSpecialCtx();
      syncOwnerSpecials('player', ctxSpec);
      for (const c of state.squad ?? []) {
        // Companions share zone / BG / city / AD; form/dining/riding stay player-only.
        const cCtx: SpecialContext = {
          ...ctxSpec,
          mounted: false,
          dining: false,
          form: 0,
          auraSpecials: [],
        };
        syncOwnerSpecials(c.id, cCtx);
      }
    },

    runOutfitterCommand(raw, opts) {
      const cmd = parseOutfitterCommand(raw);
      if (!cmd) return { ok: false, reason: 'Usage: /outfitter wear|unwear|toggle name' };
      const party = opts?.party !== false;
      if (cmd.action === 'wear' || cmd.action === 'toggle') {
        return this.wearOutfitByName(cmd.name, { party });
      }
      // unwear by name on each owner
      const owners: OutfitOwnerId[] = party
        ? ['player', ...(state.squad ?? []).map((c) => c.id)]
        : ['player'];
      let any = false;
      for (const owner of owners) {
        const st = ensure(owner);
        const hit = findOutfitByName(st, cmd.name);
        if (!hit) continue;
        const res = wearOne(owner, hit, 'unwear');
        if (res.ok) any = true;
      }
      if (!any) return { ok: false, reason: `No one is wearing ${cmd.name}` };
      log(`Outfitter: ${cmd.name} unequipped`);
      return { ok: true, wearing: false, name: cmd.name, missing: 0 };
    },
  };
}
