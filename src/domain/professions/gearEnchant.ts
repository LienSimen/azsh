// Resolve an enchant on gear, whichever of the TWO tables it came from: permEnchantId holds a
// formula SPELL id, item-applied enchants a SpellItemEnchantment id. The id spaces are disjoint.

import type {
  EnchantDef, EnchantGrant, ItemEnchantDef, School, Stat,
} from '../../data/schema.ts';

  // The minimal lookup surface — DataStore, or a stub in tests. Both are OPTIONAL and called
  // defensively: a missing lookup means "no enchant from that table", never a crash mid-stat.
export interface GearEnchantDs {
  /** Enchanting-profession formula, keyed by apply SPELL id. */
  enchant?(id: number): EnchantDef | undefined;
  /** SpellItemEnchantment row, keyed by enchant id. */
  itemEnchant?(id: number): ItemEnchantDef | undefined;
}

/** One enchant's contribution to a piece of gear, flattened for the stat and combat paths. */
export interface GearEnchantGrant {
  name: string;
  /** Primary/secondary stat lines (the only thing the old EnchantDef could express). */
  stats: { stat: Stat; value: number }[];
  /** Bonus armor. */
  armor: number;
  /** Resistances by school — the whole point of widening past EnchantDef. */
  resists: Partial<Record<School | 'armor', number>>;
  /** Everything else, verbatim, so a consumer can grow without another schema change. */
  grants: EnchantGrant[];
  /** ITEM_ENCHANTMENT_TYPE_DAMAGE — flat weapon damage. */
  weaponDamageFlat?: number;
  /** ITEM_ENCHANTMENT_TYPE_COMBAT_SPELL — an on-hit proc on a PERMANENT weapon enchant. */
  combat?: { spellId: number; chancePct?: number; ppm?: number };
}

const empty = (name: string): GearEnchantGrant => ({ name, stats: [], armor: 0, resists: {}, grants: [] });

/** Fold one EnchantGrant into the flattened accumulator. */
function foldGrant(out: GearEnchantGrant, g: EnchantGrant): void {
  out.grants.push(g);
  switch (g.kind) {
    case 'stat':
      out.stats.push({ stat: g.stat, value: g.amount });
      break;
    case 'all_stats':
      // "+N to all stats" — expand so every consumer that reads `stats` sees it.
      for (const s of ['str', 'agi', 'sta', 'int', 'spi'] as const) {
        out.stats.push({ stat: s, value: g.amount });
      }
      break;
    case 'armor':
      out.armor += g.amount;
      break;
    case 'resist':
      if (g.school === 'armor') out.armor += g.amount;
      else out.resists[g.school] = (out.resists[g.school] ?? 0) + g.amount;
      break;
    default:
      // Kept in `grants` only — consumers opt in as they learn each kind.
      break;
  }
}

/** Fold one ItemEnchantDef's effects into a GearEnchantGrant accumulator. */
function foldItemEnchant(out: GearEnchantGrant, sie: ItemEnchantDef): void {
  for (const eff of sie.effects) {
    switch (eff.type) {
      case 'resistance':
        if (eff.school === 'armor') out.armor += eff.amount;
        else out.resists[eff.school] = (out.resists[eff.school] ?? 0) + eff.amount;
        break;
      case 'stat':
        out.stats.push({ stat: eff.stat, value: eff.amount });
        break;
      case 'weapon_damage':
        out.weaponDamageFlat = (out.weaponDamageFlat ?? 0) + eff.amount;
        break;
      case 'equip_spell':
        for (const g of eff.grants) foldGrant(out, g);
        break;
      case 'combat_spell':
        out.combat = { spellId: eff.spellId };
        if (eff.chancePct != null) out.combat.chancePct = eff.chancePct;
        if (eff.ppm != null) out.combat.ppm = eff.ppm;
        break;
      case 'totem':
        // Legacy Rockbiter shape; no permanent-gear consumer.
        break;
    }
  }
}

// Resolve `id` through BOTH enchant tables, undefined when neither knows it. Formula ids are tried
// first; when one carries enchantId the grant comes from ItemEnchantDef, which can express procs.
export function gearEnchantGrant(id: number, ds: GearEnchantDs): GearEnchantGrant | undefined {
  if (!id) return undefined;

  const formula = ds.enchant?.(id);
  if (formula) {
    const sieId = (formula as EnchantDef).enchantId;
    if (sieId) {
      const sie = ds.itemEnchant?.(sieId);
      if (sie) {
        const out = empty(formula.name || sie.name);
        foldItemEnchant(out, sie);
        return out;
      }
    }
    // Fallback: pre-W7 rows with only the hand-authored stats/armor cache.
    const out = empty(formula.name);
    out.armor = formula.armor ?? 0;
    for (const s of formula.stats ?? []) out.stats.push({ stat: s.stat, value: s.value });
    return out;
  }

  const sie = ds.itemEnchant?.(id);
  if (!sie) return undefined;

  const out = empty(sie.name);
  foldItemEnchant(out, sie);
  return out;
}

/** True when `id` resolves in either table — cheap guard for callers that only need existence. */
export function isKnownGearEnchant(id: number, ds: GearEnchantDs): boolean {
  return !!id && (!!ds.enchant?.(id) || !!ds.itemEnchant?.(id));
}

// Classic tooltip label for a gear enchant id, preferring the SpellItemEnchantment name over the
// formula title — the green line the 1.12 client prints. Existence still goes via the grant.
export function gearEnchantDisplayName(id: number, ds: GearEnchantDs): string | undefined {
  const grant = gearEnchantGrant(id, ds);
  if (!grant) return undefined;
  const formula = ds.enchant?.(id);
  const sieId = formula?.enchantId ?? id;
  const sieName = ds.itemEnchant?.(sieId)?.name?.trim();
  if (sieName) return sieName;
  return grant.name;
}
