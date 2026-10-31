// BG auto-rescue kit-item path, peeled out of stepSession.ts at its filesize ceiling.
// Behaviour is byte-identical to the three closures it replaces (W12).

import type { CombatContext } from './context.ts';
import type { CombatItem, Fighter } from './types.ts';

export interface ItemRescue {
  /** This unit's item bag + per-entry cooldown map, or null when it carries none. */
  bagAndCdOf(f: Fighter): { bag: readonly CombatItem[]; cd: Map<number, number> } | null;
  /** Does `entry` in this unit's bag carry the immunity that cancels the control on it? */
  itemBreaksControl(f: Fighter, entry: number): boolean;
  /** Pop the first usable kit item whose own immunity cancels the control on `f`. */
  tryItemRescue(f: Fighter): boolean;
}

export function createItemRescue(
  ctx: CombatContext,
  useItem: (entry: number, from: string, to: string) => boolean,
): ItemRescue {
  const bagAndCdOf = (f: Fighter): { bag: readonly CombatItem[]; cd: Map<number, number> } | null => {
    if (f === ctx.player) return { bag: ctx.playerItems, cd: ctx.itemCd };
    const bag = ctx.unitItems.get(f.side);
    const cd = ctx.unitItemCd.get(f.side);
    return bag && cd ? { bag, cd } : null;
  };

  const itemBreaksControl = (f: Fighter, entry: number): boolean => {
    const it = bagAndCdOf(f)?.bag.find((x) => x.entry === entry);
    if (!it || it.count <= 0 || it.effect.kind !== 'friendly_cast') return false;
    return ctx.spellCancelsOwnControl?.(f, it.effect.spell) === true;
  };

  /** cfg.autoRescueItems: the trinket/FAP a player would tap, fired for AI units too. */
  const tryItemRescue = (f: Fighter): boolean => {
    const kit = bagAndCdOf(f);
    if (!kit || f.castingSpell) return false;
    for (const it of kit.bag) {
      if (it.count <= 0 || it.effect.kind !== 'friendly_cast') continue;
      if ((kit.cd.get(it.entry) ?? 0) > ctx.t) continue;
      if (it.category != null && it.categoryCooldownMs != null && it.categoryCooldownMs > 0
        && (f.categoryCooldowns.get(it.category) ?? 0) > ctx.t) continue;
      if (ctx.spellCancelsOwnControl?.(f, it.effect.spell) !== true) continue;
      if (useItem(it.entry, f.side, f.side)) return true;
    }
    return false;
  };

  return { bagAndCdOf, itemBreaksControl, tryItemRescue };
}
