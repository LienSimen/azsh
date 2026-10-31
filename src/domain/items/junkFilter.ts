// Junk filter: Dejunk-style disposition over a character layer then a global one. Never sells a
// quest item or an upgrade; whole categories are guarded by junkCategories.ts.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../character/character.ts';
import type { Inventory } from './inventory.ts';
import type { Companion } from '../bots/squad.ts';
import type { EquipOpts } from './equipment.ts';
import {
  type AutoDisenchantConfig,
  canAutoDisenchantEntry,
  isUpgradeForParty,
  type PartyEnchanter,
} from '../professions/autoDisenchant.ts';
import {
  DEFAULT_PROTECT_CATEGORIES,
  junkProtectCategoryLabel,
  normalizeProtectCategories,
  protectLookupFor,
  protectedCategoryFor,
  type JunkProtectCategory,
} from './junkCategories.ts';

/** Classic quality tiers used by sell/destroy include checkboxes (poor .. epic). */
export type JunkQuality = 0 | 1 | 2 | 3 | 4;

export type JunkDisposition = 'keep' | 'sell' | 'destroy';

/** One layer of junk rules (global or character). */
export interface JunkFilterConfig {
  /** Auto-vendor matching sellable junk. Default true. */
  autoSell: boolean;
  /** Auto-discard matching destroy junk. Default false. */
  autoDestroy: boolean;
  /** Include-by-quality for sell. Default: only poor (0). */
  sellQuality: Record<JunkQuality, boolean>;
  /** Include-by-quality for destroy. Default: all false. */
  destroyQuality: Record<JunkQuality, boolean>;
  /** Never junk (exclusions). */
  keepEntries: number[];
  /** Always sell when sellable. */
  sellEntries: number[];
  /** Always destroy. */
  destroyEntries: number[];
  // Whole item categories never sold or destroyed however the quality boxes are set — arrows, food,
  // reagents, mats, bags, recipes, keys, quest items, mounts, pets, tools. Default: all of them.
  protectCategories: JunkProtectCategory[];
  // The vendor's Sell All picker remembers its own tier boxes here, separate from `sellQuality`: a manual
  // "sell my greens once" must never arm the automatic pass. Default: poor only.
  sellAllQuality: Record<JunkQuality, boolean>;
}

// Per-character layer. When `characterSpecific` is false, quality/auto flags come from global; character
// lists still apply (Dejunk: lists are always both scopes).
export interface CharacterJunkFilterConfig extends JunkFilterConfig {
  characterSpecific: boolean;
}

export type JunkListScope = 'global' | 'character';

const QUALITIES: JunkQuality[] = [0, 1, 2, 3, 4];

export const DEFAULT_JUNK_FILTER_CONFIG: JunkFilterConfig = {
  autoSell: true,
  autoDestroy: false,
  sellQuality: { 0: true, 1: false, 2: false, 3: false, 4: false },
  destroyQuality: { 0: false, 1: false, 2: false, 3: false, 4: false },
  keepEntries: [],
  sellEntries: [],
  destroyEntries: [],
  protectCategories: [...DEFAULT_PROTECT_CATEGORIES],
  sellAllQuality: { 0: true, 1: false, 2: false, 3: false, 4: false },
};

export const DEFAULT_CHARACTER_JUNK_FILTER_CONFIG: CharacterJunkFilterConfig = {
  ...DEFAULT_JUNK_FILTER_CONFIG,
  characterSpecific: false,
  // Protection is a UNION of both layers, so a character copy of the defaults would make the global
  // boxes un-unpickable. The character layer only ever ADDS.
  protectCategories: [],
};

function qualityMap(
  raw: unknown,
  fallback: Record<JunkQuality, boolean>,
): Record<JunkQuality, boolean> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<JunkQuality | string, unknown>>;
  const out = { ...fallback };
  for (const q of QUALITIES) {
    const v = r[q] ?? r[String(q)];
    if (typeof v === 'boolean') out[q] = v;
  }
  return out;
}

function entryList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const x of raw) {
    const n = typeof x === 'number' ? x : Number(x);
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

// dispositionForEntry re-normalizes ctx.global/ctx.character per bag entry and both are already
// canonical: mark outputs so the second pass returns the same object instead of 5 allocations.
const canonical = new WeakSet<object>();
const canonicalCharacter = new WeakSet<object>();

/** Coerce stored value; missing/partial → defaults (auto-sell greys only). */
export function normalizeJunkFilterConfig(raw: unknown): JunkFilterConfig {
  if (raw && typeof raw === 'object' && canonical.has(raw)) return raw as JunkFilterConfig;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<JunkFilterConfig>;
  const out: JunkFilterConfig = {
    autoSell: typeof r.autoSell === 'boolean' ? r.autoSell : DEFAULT_JUNK_FILTER_CONFIG.autoSell,
    autoDestroy: typeof r.autoDestroy === 'boolean' ? r.autoDestroy : DEFAULT_JUNK_FILTER_CONFIG.autoDestroy,
    sellQuality: qualityMap(r.sellQuality, DEFAULT_JUNK_FILTER_CONFIG.sellQuality),
    destroyQuality: qualityMap(r.destroyQuality, DEFAULT_JUNK_FILTER_CONFIG.destroyQuality),
    keepEntries: entryList(r.keepEntries),
    sellEntries: entryList(r.sellEntries),
    destroyEntries: entryList(r.destroyEntries),
    protectCategories: normalizeProtectCategories(r.protectCategories),
    sellAllQuality: qualityMap(r.sellAllQuality, DEFAULT_JUNK_FILTER_CONFIG.sellAllQuality),
  };
  canonical.add(out);
  return out;
}

export function normalizeCharacterJunkFilterConfig(raw: unknown): CharacterJunkFilterConfig {
  if (raw && typeof raw === 'object' && canonicalCharacter.has(raw)) {
    return raw as CharacterJunkFilterConfig;
  }
  const base = normalizeJunkFilterConfig(raw);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<CharacterJunkFilterConfig>;
  const out: CharacterJunkFilterConfig = {
    ...base,
    characterSpecific: typeof r.characterSpecific === 'boolean' ? r.characterSpecific : false,
    // Absent means "adds nothing" here, not "take the defaults" (see the constant above).
    protectCategories: Array.isArray(r.protectCategories)
      ? normalizeProtectCategories(r.protectCategories)
      : [],
  };
  canonical.add(out);
  canonicalCharacter.add(out);
  return out;
}

/** Build default config, optionally migrating legacy autopilot.autoSellGrays. */
export function junkFilterFromLegacy(autoSellGrays: boolean | undefined): JunkFilterConfig {
  return normalizeJunkFilterConfig({
    ...DEFAULT_JUNK_FILTER_CONFIG,
    autoSell: typeof autoSellGrays === 'boolean' ? autoSellGrays : DEFAULT_JUNK_FILTER_CONFIG.autoSell,
  });
}

export type JunkListKind = 'keep' | 'sell' | 'destroy';

/** Assign entry to one list (mutually exclusive within that layer). Pass null to remove. */
export function setJunkListMembership(
  cfg: JunkFilterConfig,
  entry: number,
  list: JunkListKind | null,
): JunkFilterConfig {
  const n = normalizeJunkFilterConfig(cfg);
  const strip = (arr: number[]) => arr.filter((e) => e !== entry);
  const keepEntries = strip(n.keepEntries);
  const sellEntries = strip(n.sellEntries);
  const destroyEntries = strip(n.destroyEntries);
  if (list === 'keep') keepEntries.push(entry);
  else if (list === 'sell') sellEntries.push(entry);
  else if (list === 'destroy') destroyEntries.push(entry);
  return { ...n, keepEntries, sellEntries, destroyEntries };
}

export function junkListKindFor(
  cfg: JunkFilterConfig,
  entry: number,
): JunkListKind | null {
  const n = normalizeJunkFilterConfig(cfg);
  if (n.keepEntries.includes(entry)) return 'keep';
  if (n.sellEntries.includes(entry)) return 'sell';
  if (n.destroyEntries.includes(entry)) return 'destroy';
  return null;
}

export function clearJunkList(cfg: JunkFilterConfig, list: JunkListKind): JunkFilterConfig {
  const n = normalizeJunkFilterConfig(cfg);
  if (list === 'keep') return { ...n, keepEntries: [] };
  if (list === 'sell') return { ...n, sellEntries: [] };
  return { ...n, destroyEntries: [] };
}

const mergedRules = new WeakMap<object, WeakMap<object, JunkFilterConfig>>();

// Combined quality/auto from both layers (OR). Lists stay separate in disposition order. characterSpecific
// is ignored — both Global and Character tabs always fully apply.
export function effectiveJunkRules(
  global: JunkFilterConfig,
  character: CharacterJunkFilterConfig | JunkFilterConfig,
): JunkFilterConfig {
  const g = normalizeJunkFilterConfig(global);
  const c = normalizeJunkFilterConfig(character);
  let byCharacter = mergedRules.get(g);
  const hit = byCharacter?.get(c);
  if (hit) return hit;
  const sellQuality = { ...g.sellQuality };
  const destroyQuality = { ...g.destroyQuality };
  const sellAllQuality = { ...g.sellAllQuality };
  for (const q of QUALITIES) {
    sellQuality[q] = !!(g.sellQuality[q] || c.sellQuality[q]);
    destroyQuality[q] = !!(g.destroyQuality[q] || c.destroyQuality[q]);
  }
  // Protection is additive, like a keep list: a category either layer guards stays guarded.
  const protectCategories = [...new Set([...g.protectCategories, ...c.protectCategories])];
  const out: JunkFilterConfig = {
    autoSell: !!(g.autoSell || c.autoSell),
    autoDestroy: !!(g.autoDestroy || c.autoDestroy),
    sellQuality,
    destroyQuality,
    keepEntries: c.keepEntries,
    sellEntries: c.sellEntries,
    destroyEntries: c.destroyEntries,
    protectCategories,
    // NOT merged: the vendor's Sell All picker writes the global layer and reads it back, so a
    // stale character copy must never keep a tier ticked that the player just unticked.
    sellAllQuality,
  };
  canonical.add(out);
  if (!byCharacter) { byCharacter = new WeakMap(); mergedRules.set(g, byCharacter); }
  byCharacter.set(c, out);
  return out;
}

export interface JunkEvalContext {
  global: JunkFilterConfig;
  character: CharacterJunkFilterConfig;
  deCfg: AutoDisenchantConfig;
  player: Character;
  playerInv: Inventory;
  playerEquipOpts: EquipOpts;
  companions: readonly Companion[];
  enchanters: readonly PartyEnchanter[];
  ds: DataStore;
  questProtected: ReadonlySet<number>;
  /** One findUpgrades pass per body. Absent → isUpgradeForParty per item (the old cost). */
  upgradeEntries?: ReadonlySet<number>;
}

// Disposition for a bag item (Dejunk priority): quest → char keep → char force destroy/sell → global keep →
// global force → upgrades → auto-DE claim → quality rules (char if characterSpecific else global).
export function dispositionForEntry(
  entry: number,
  ctx: JunkEvalContext,
): { disposition: JunkDisposition; reason: string } {
  const global = normalizeJunkFilterConfig(ctx.global);
  const character = normalizeCharacterJunkFilterConfig(ctx.character);
  const item = ctx.ds.item(entry);
  if (!item) return { disposition: 'keep', reason: 'Unknown item' };

  if (ctx.questProtected.has(entry)) {
    return { disposition: 'keep', reason: 'Needed for a quest' };
  }

  // Character lists (highest list priority).
  if (character.keepEntries.includes(entry)) {
    return { disposition: 'keep', reason: 'Character keep list' };
  }
  if (character.destroyEntries.includes(entry)) {
    return { disposition: 'destroy', reason: 'Character destroy list' };
  }
  if (character.sellEntries.includes(entry)) {
    if ((item.sellPrice ?? 0) > 0) return { disposition: 'sell', reason: 'Character sell list' };
    return { disposition: 'destroy', reason: 'Character sell list (no vendor value)' };
  }

  // Global lists.
  if (global.keepEntries.includes(entry)) {
    return { disposition: 'keep', reason: 'Global keep list' };
  }
  if (global.destroyEntries.includes(entry)) {
    return { disposition: 'destroy', reason: 'Global destroy list' };
  }
  if (global.sellEntries.includes(entry)) {
    if ((item.sellPrice ?? 0) > 0) return { disposition: 'sell', reason: 'Global sell list' };
    return { disposition: 'destroy', reason: 'Global sell list (no vendor value)' };
  }

  // Quality auto-sell/destroy must not eat the arrows, the food, the mats or the profession tool
  // the next pull needs. The category list is the one gate the vendor's Sell All shares.
  {
    const cat = protectedCategoryFor(
      item,
      effectiveJunkRules(global, character).protectCategories,
      protectLookupFor(ctx.ds),
    );
    if (cat) return { disposition: 'keep', reason: junkProtectCategoryLabel(cat) };
  }

  // Auto-DE owns disenchantable non-upgrades when that feature would accept them.
  const q = (item.quality ?? 0) as number;
  const isUpgrade = item.slot != null && q >= 1 && (
    ctx.upgradeEntries
      ? ctx.upgradeEntries.has(entry)
      : isUpgradeForParty(
        entry,
        ctx.player,
        ctx.playerInv,
        ctx.playerEquipOpts,
        ctx.companions,
        ctx.ds,
      )
  );
  if (isUpgrade) {
    return {
      disposition: 'keep',
      reason: ctx.companions.length > 0 ? 'Upgrade for you or a companion' : 'Upgrade for you',
    };
  }

  // Gate before the call: reading ctx.enchanters builds a companionCharacter per raid member
  // (16.6 ms at 39), and canAutoDisenchantEntry returns on !cfg.enabled as its first line.
  if (ctx.deCfg.enabled) {
    const de = canAutoDisenchantEntry(
      entry,
      ctx.deCfg,
      ctx.player,
      ctx.playerInv,
      ctx.playerEquipOpts,
      ctx.companions,
      ctx.enchanters,
      ctx.ds,
      ctx.questProtected,
      ctx.upgradeEntries,
    );
    if (de.ok) return { disposition: 'keep', reason: 'Auto-disenchant claims' };
  }

  const rules = effectiveJunkRules(global, character);
  const qKey: JunkQuality = q >= 0 && q <= 4 ? (q as JunkQuality) : 4;
  if (rules.sellQuality[qKey] && (item.sellPrice ?? 0) > 0) {
    return { disposition: 'sell', reason: 'Sell by quality' };
  }
  if (rules.destroyQuality[qKey]) {
    return { disposition: 'destroy', reason: 'Destroy by quality' };
  }

  return { disposition: 'keep', reason: 'No filter matched' };
}

/** Unique bag entries matching a disposition. */
export function bagEntriesWithDisposition(
  inv: Inventory,
  ctx: JunkEvalContext,
  want: JunkDisposition,
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const stk of inv.stacks) {
    if (seen.has(stk.item)) continue;
    seen.add(stk.item);
    if (dispositionForEntry(stk.item, ctx).disposition === want) out.push(stk.item);
  }
  return out;
}
