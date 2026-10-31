// Raid action bar fire/edit surface. Pattern C: createGlobalActionBarModule(ctx, extras).
// Empty by default. Every living raid member at least tries each slot.

import { slotAt, SLOTS_PER_BAR, type ActionBar } from '../../domain/character/actionbar.ts';
import {
  clearGlobalBarSlot,
  globalItemKind,
  normalizeGlobalBar,
  setGlobalBarItem,
  setGlobalBarOutfit,
  shouldTryGlobalAction,
  type GlobalMemberSnap,
} from '../../domain/raid/globalActionBar.ts';
import { maxHealth, maxPower } from '../../domain/character/character.ts';
import { canUseItem } from '../../domain/items/itemRestrictions.ts';
import { countItem, emptyInventory } from '../../domain/items/inventory.ts';
import { findOutfitByName, normalizeOutfitterState } from '../../domain/bots/outfitter.ts';
import { companionCharacter, companionLevel } from '../../domain/bots/squad.ts';
import type { CombatSession } from '../combat.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';

export type GlobalActionBarExtras = {
  consumeItem: Game['consumeItem'];
  useCompanionItem: Game['useCompanionItem'];
  wearOutfitByName: Game['wearOutfitByName'];
  liveSession: () => CombatSession | null;
};

function raidHasItem(state: Game['state'], entry: number): boolean {
  if (countItem(state.inventory, entry) > 0) return true;
  for (const c of state.squad ?? []) {
    if (countItem(c.bags ?? emptyInventory(), entry) > 0) return true;
  }
  return false;
}

function alreadyOnGlobalBar(bar: ActionBar, entry: number): boolean {
  return (bar.items ?? []).includes(entry);
}

export function createGlobalActionBarModule(
  ctx: GameCtx,
  extras: GlobalActionBarExtras,
): Pick<
  Game,
  | 'setGlobalItemSlot'
  | 'setGlobalOutfitSlot'
  | 'clearGlobalActionSlot'
  | 'fireGlobalActionBar'
  | 'fireGlobalActionSlot'
> {
  const { ds, state } = ctx;

  const barOf = (): ActionBar => normalizeGlobalBar(state.globalActionBar);

  const write = (next: ActionBar): void => {
    state.globalActionBar = next;
  };

  const memberSnaps = (entry: number | null, outfitName: string | null): GlobalMemberSnap[] => {
    const sess = extras.liveSession();
    const it = entry != null ? ds.item(entry) : undefined;
    const out: GlobalMemberSnap[] = [];

    const pv = sess?.playerView();
    const pCount = sess
      ? (sess.unitItems('player').find((x) => x.item.entry === entry)?.count ?? 0)
      : (entry != null ? countItem(state.inventory, entry) : 0);
    out.push({
      alive: pv ? pv.hp > 0 : state.char.health > 0,
      classId: state.char.cls,
      health: pv ? pv.hp : state.char.health,
      maxHealth: pv ? pv.maxHp : maxHealth(state.char, ds),
      power: pv ? pv.power : state.char.power,
      maxPower: pv ? pv.maxPower : maxPower(state.char, ds),
      itemCount: pCount,
      canUse: it ? canUseItem(state.char, it, ds) : true,
      hasOutfit: outfitName
        ? !!findOutfitByName(normalizeOutfitterState(state.outfitter), outfitName)
        : false,
    });

    const squad = state.squad ?? [];
    for (let i = 0; i < squad.length; i++) {
      const comp = squad[i]!;
      const lvl = companionLevel(comp, state.char.level);
      const char = companionCharacter(comp, lvl, ds);
      const av = sess?.alliesView()?.[i];
      const side = `ally_${i}`;
      const cCount = sess
        ? (sess.unitItems(side).find((x) => x.item.entry === entry)?.count ?? 0)
        : (entry != null ? countItem(comp.bags ?? emptyInventory(), entry) : 0);
      out.push({
        alive: av ? av.hp > 0 : char.health > 0,
        classId: char.cls,
        health: av ? av.hp : char.health,
        maxHealth: av ? av.maxHp : maxHealth(char, ds),
        power: av ? av.power : char.power,
        maxPower: av ? av.maxPower : maxPower(char, ds),
        itemCount: cCount,
        canUse: it ? canUseItem(char, it, ds) : true,
        hasOutfit: outfitName
          ? !!findOutfitByName(normalizeOutfitterState(comp.outfitter), outfitName)
          : false,
      });
    }
    return out;
  };

  const fireSlot = (slot: number): number => {
    const content = slotAt(barOf(), slot);
    if (!content) return 0;
    if (content.kind === 'outfit') {
      if (extras.liveSession()) return 0;
      const snaps = memberSnaps(null, content.name);
      if (!snaps.some((m) => shouldTryGlobalAction(content, m, null))) return 0;
      extras.wearOutfitByName(content.name, { party: true });
      return 1;
    }
    if (content.kind !== 'item') return 0;
    const it = ds.item(content.entry);
    const kind = globalItemKind(it);
    const snaps = memberSnaps(content.entry, null);
    const sess = extras.liveSession();
    let tried = 0;
    for (let i = 0; i < snaps.length; i++) {
      const snap = snaps[i]!;
      if (!shouldTryGlobalAction(content, snap, kind)) continue;
      tried++;
      if (i === 0) {
        if (sess) sess.useUnitItem('player', content.entry);
        else extras.consumeItem(content.entry);
      } else {
        const side = `ally_${i - 1}`;
        const id = state.squad?.[i - 1]?.id;
        if (sess) sess.useUnitItem(side, content.entry);
        else if (id) extras.useCompanionItem(id, content.entry);
      }
    }
    return tried;
  };

  return {
    setGlobalItemSlot(slot, entry) {
      if (entry == null) {
        write(clearGlobalBarSlot(barOf(), slot));
        return;
      }
      const current = barOf();
      if (!raidHasItem(state, entry) && !alreadyOnGlobalBar(current, entry)) return;
      const it = ds.item(entry);
      if (!it || !(it.useInCombat || it.useBuff || it.useSpell != null)) return;
      write(setGlobalBarItem(current, slot, entry));
    },

    setGlobalOutfitSlot(slot, name) {
      if (name == null || !name.trim()) {
        write(clearGlobalBarSlot(barOf(), slot));
        return;
      }
      write(setGlobalBarOutfit(barOf(), slot, name));
    },

    clearGlobalActionSlot(slot) {
      write(clearGlobalBarSlot(barOf(), slot));
    },

    fireGlobalActionBar() {
      let tried = 0;
      for (let i = 0; i < SLOTS_PER_BAR; i++) tried += fireSlot(i);
      return { tried };
    },

    fireGlobalActionSlot(slot) {
      return { tried: fireSlot(slot) };
    },
  };
}
