// Stance bar and primary action-bar paging for Classic shapeshift and stance forms, off
// SpellShapeshiftForm.dbc BonusActionBar. Pure serializable helpers — the UI casts the real path.

import type { SpellDef } from '../../data/schema.ts';
import { CLASS, SHAPESHIFT_FORM } from '../../data/schema.ts';
import {
  emptyItems,
  emptyMacros,
  emptyOutfits,
  SLOTS_PER_BAR,
  type ActionBar,
} from './actionbar.ts';
import { isMacroId } from '../macro/types.ts';
import { formIdFromSpell, isFormSpell } from './forms.ts';
import { SPELL_ATTR_EX2, hasAttrEx2 } from '../../engine/spells/spellAttributes.ts';

/** Classic BonusActionBar index for the primary (main) action bar. 0 = no swap / default. */
export type PrimaryBarPageId = 0 | 1 | 2 | 3;

/** Content of one primary-bar page (keys stay on actionBars[0] across pages). */
export interface PrimaryBarPageLayout {
  slots: (number | null)[];
  items: (number | null)[];
  /** Macro ids per slot. Absent on pre-macro saves — normalizePrimaryPages backfills nulls. */
  macros?: (string | null)[];
  outfits?: (string | null)[];
}

/** Optional map of primary pages keyed by page id string ("0"…"3"). */
export type PrimaryBarPages = Partial<Record<string, PrimaryBarPageLayout>>;

/** One button on the stance / shapeshift bar. */
export interface StanceBarSlot {
  spellId: number;
  formId: number;
  name: string;
  icon?: string;
  /** Classic SetChecked — true while this form/stance is active. */
  active: boolean;
}

// Canonical form-enter spell ids per class in stance-bar order; only KNOWN ids become slots.
// Ghost Wolf 2645 is a normal action-bar spell (BonusActionBar 0), not a stance strip entry.
export const CLASS_STANCE_SPELLS: Readonly<Record<number, readonly number[]>> = {
  [CLASS.WARRIOR]: [2457, 71, 2458], // Battle, Defensive, Berserker
  // Bear, Aquatic, Cat, Travel, Moonkin, Dire Bear — common Classic strip order
  [CLASS.DRUID]: [5487, 1066, 768, 783, 24858, 9634],
  [CLASS.ROGUE]: [1784], // Stealth
  [CLASS.PRIEST]: [15473], // Shadowform
  // Shaman: no stance bar. Ghost Wolf is cast from the main action bar like any other spell.
};

// Primary action-bar page for the active form, from SpellShapeshiftForm.BonusActionBar only.
// Shadowform, Moonkin, Travel, Aquatic and Ghost Wolf stay on the default main bar.
export function primaryBarPageForForm(form: number): PrimaryBarPageId {
  const f = form | 0;
  switch (f) {
    case SHAPESHIFT_FORM.CAT:
    case SHAPESHIFT_FORM.BATTLESTANCE:
    case SHAPESHIFT_FORM.STEALTH:
      return 1;
    case SHAPESHIFT_FORM.DEFENSIVESTANCE:
      return 2;
    case SHAPESHIFT_FORM.BEAR:
    case SHAPESHIFT_FORM.DIREBEAR:
    case SHAPESHIFT_FORM.BERSERKERSTANCE:
      return 3;
    default:
      // BonusActionBar=0: humanoid, Travel, Aquatic, Ghost Wolf, Shadowform, Moonkin, …
      return 0;
  }
}

/** True when this form replaces the main action bar page (BonusActionBar != 0). */
export function formPagesPrimaryBar(form: number): boolean {
  return primaryBarPageForForm(form) !== 0;
}

function emptyLayout(): PrimaryBarPageLayout {
  return {
    slots: Array(SLOTS_PER_BAR).fill(null),
    items: emptyItems(),
    macros: emptyMacros(),
    outfits: emptyOutfits(),
  };
}

/** Macro ids of a layout / bar, normalized to exactly SLOTS_PER_BAR entries. */
function macroRow(src: { macros?: (string | null)[] } | undefined): (string | null)[] {
  return Array.from({ length: SLOTS_PER_BAR }, (_, i) => (isMacroId(src?.macros?.[i]) ? src!.macros![i]! : null));
}

function outfitRow(src: { outfits?: (string | null)[] } | undefined): (string | null)[] {
  return Array.from({ length: SLOTS_PER_BAR }, (_, i) => {
    const v = src?.outfits?.[i];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  });
}

function cloneLayout(layout: PrimaryBarPageLayout): PrimaryBarPageLayout {
  return {
    slots: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
      typeof layout.slots[i] === 'number' ? layout.slots[i]! : null),
    items: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
      typeof layout.items[i] === 'number' ? layout.items[i]! : null),
    macros: macroRow(layout),
    outfits: outfitRow(layout),
  };
}

/** True when a page layout has no spells and no items. */
export function primaryPageLayoutEmpty(layout: PrimaryBarPageLayout | undefined | null): boolean {
  if (!layout) return true;
  return layout.slots.every((s) => s == null)
    && layout.items.every((e) => e == null)
    && (layout.macros ?? []).every((m) => m == null)
    && (layout.outfits ?? []).every((o) => o == null);
}

// When the form-selected primary page is empty but page "0" has content, copy page 0 onto it —
// warriors start in Battle Stance while autofill filled bar 0. Never overwrites a customized page.
export function seedFormPageFromDefaultIfEmpty(
  pages: PrimaryBarPages,
  form: number,
): PrimaryBarPages {
  const pageId = primaryBarPageForForm(form | 0);
  if (pageId === 0) return pages;
  const key = String(pageId);
  const def = pages['0'];
  if (!def || primaryPageLayoutEmpty(def)) return pages;
  if (!primaryPageLayoutEmpty(pages[key])) return pages;
  return { ...pages, [key]: cloneLayout(def) };
}

// Normalize primary page storage. Legacy saves have only actionBars[0] as the default page — seed page "0"
// from bar 0 when pages are absent/partial. Extra multi-bars are never paged.
export function normalizePrimaryPages(
  pages: PrimaryBarPages | undefined | null,
  bar0: ActionBar | undefined,
): PrimaryBarPages {
  const out: PrimaryBarPages = {};
  if (pages && typeof pages === 'object') {
    for (const [k, v] of Object.entries(pages)) {
      if (!v || !Array.isArray(v.slots)) continue;
      out[k] = {
        slots: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
          typeof v.slots[i] === 'number' ? v.slots[i]! : null),
        items: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
          typeof v.items?.[i] === 'number' ? v.items[i]! : null),
        macros: macroRow(v),
        outfits: outfitRow(v),
      };
    }
  }
  if (!out['0'] && bar0) {
    out['0'] = {
      slots: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
        typeof bar0.slots[i] === 'number' ? bar0.slots[i]! : null),
      items: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
        typeof bar0.items?.[i] === 'number' ? bar0.items[i]! : null),
      macros: macroRow(bar0),
      outfits: outfitRow(bar0),
    };
  }
  if (!out['0']) out['0'] = emptyLayout();
  return out;
}

// Layout for a primary page id, defaulting to bar0 content. A form page never written yet
// inherits the default rather than coming back empty, which dumped every known spell on one row.
export function primaryPageLayout(
  bar0: ActionBar,
  pages: PrimaryBarPages | undefined,
  pageId: PrimaryBarPageId,
): PrimaryBarPageLayout {
  const fromMap = pages?.[String(pageId)];
  if (fromMap) return cloneLayout(fromMap);
  const def = pageId !== 0 ? pages?.['0'] : undefined;
  if (def) return cloneLayout(def);
  return {
    slots: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
      typeof bar0.slots[i] === 'number' ? bar0.slots[i]! : null),
    items: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
      typeof bar0.items?.[i] === 'number' ? bar0.items[i]! : null),
    macros: macroRow(bar0),
    outfits: outfitRow(bar0),
  };
}

// Action bars with primary (bar 0) content swapped to the page for `form`. Extra bars (1+) are unchanged.
// Keys on bar 0 are stable across pages (Classic).
export function actionBarsForForm(
  bars: ActionBar[],
  pages: PrimaryBarPages | undefined,
  form: number,
): ActionBar[] {
  if (!bars.length) return bars;
  const pageId = primaryBarPageForForm(form);
  const layout = primaryPageLayout(bars[0]!, pages, pageId);
  return bars.map((b, i) => {
    if (i !== 0) return b;
    return {
      slots: [...layout.slots],
      keys: [...b.keys],
      items: [...layout.items],
      macros: macroRow(layout),
      outfits: outfitRow(layout),
    };
  });
}

// Apply a bars mutator against the form-visible layout, then persist primary page content. Bar 0
// always mirrors page "0" for legacy readers; other pages live only in primaryBarPages.
export function mutateActionBarsForForm(
  bars: ActionBar[],
  pages: PrimaryBarPages | undefined,
  form: number,
  mutator: (visible: ActionBar[]) => ActionBar[],
): { bars: ActionBar[]; primaryBarPages: PrimaryBarPages } {
  const pageMap = normalizePrimaryPages(pages, bars[0]);
  const pageId = primaryBarPageForForm(form);
  const visible = actionBarsForForm(bars, pageMap, form);
  const next = mutator(visible);
  if (!next.length) return { bars: next, primaryBarPages: pageMap };

  // Capture current form's primary layout from the mutator result.
  pageMap[String(pageId)] = {
    slots: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
      typeof next[0]!.slots[i] === 'number' ? next[0]!.slots[i]! : null),
    items: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
      typeof next[0]!.items?.[i] === 'number' ? next[0]!.items![i]! : null),
    macros: macroRow(next[0]!),
    outfits: outfitRow(next[0]!),
  };

  // Default page snapshot on bars[0]; keys from mutator (keybinds are shared).
  const defaultLayout = pageMap['0'] ?? emptyLayout();
  const stored: ActionBar[] = next.map((b, i) => {
    if (i !== 0) return {
      slots: [...b.slots],
      keys: [...b.keys],
      items: Array.from({ length: SLOTS_PER_BAR }, (_, j) =>
        typeof b.items?.[j] === 'number' ? b.items[j]! : null),
      macros: macroRow(b),
      outfits: outfitRow(b),
    };
    return {
      slots: [...defaultLayout.slots],
      keys: [...b.keys],
      items: [...defaultLayout.items],
      macros: macroRow(defaultLayout),
      outfits: outfitRow(defaultLayout),
    };
  });
  return { bars: stored, primaryBarPages: pageMap };
}

/** Write a full primary-page layout for `form` (tests / bulk set). Does not touch multi-bars. */
export function writePrimaryPageContent(
  bars: ActionBar[],
  pages: PrimaryBarPages | undefined,
  form: number,
  _barIndex: number,
  _slot: number,
  next: { slots: (number | null)[]; items: (number | null)[]; macros?: (string | null)[]; outfits?: (string | null)[] },
): { bars: ActionBar[]; primaryBarPages: PrimaryBarPages } {
  const pageMap = normalizePrimaryPages(pages, bars[0]);
  const pageId = primaryBarPageForForm(form);
  pageMap[String(pageId)] = {
    slots: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
      typeof next.slots[i] === 'number' ? next.slots[i]! : null),
    items: Array.from({ length: SLOTS_PER_BAR }, (_, i) =>
      typeof next.items[i] === 'number' ? next.items[i]! : null),
    macros: macroRow(next),
    outfits: outfitRow(next),
  };
  if (!bars[0]) return { bars, primaryBarPages: pageMap };
  const defaultLayout = pageMap['0'] ?? emptyLayout();
  const nextBars = bars.map((b, i) => {
    if (i !== 0) return b;
    return {
      slots: [...defaultLayout.slots],
      keys: [...b.keys],
      items: [...defaultLayout.items],
      macros: macroRow(defaultLayout),
      outfits: outfitRow(defaultLayout),
    };
  });
  return { bars: nextBars, primaryBarPages: pageMap };
}

// Dire Bear (9634) supersedes Bear (5487) on the stance strip — one bear slot, since both share
// page 3. The spellbook still keeps Bear; the bar is the upgrade path.
const BEAR_FORM_SPELL = 5487;
const DIRE_BEAR_FORM_SPELL = 9634;

// Stance-bar slots for a character: known form spells only, in class order. Active = form id matches
// `activeForm` (or warrior default Battle when formless + known).
export function listStanceSlots(
  classId: number,
  knownSpellIds: ReadonlyArray<number>,
  spellOf: (id: number) => SpellDef | undefined,
  activeForm: number,
): StanceBarSlot[] {
  const candidates = CLASS_STANCE_SPELLS[classId | 0];
  if (!candidates?.length) return [];
  const known = new Set(knownSpellIds);
  const form = activeForm | 0;
  const slots: StanceBarSlot[] = [];
  for (const spellId of candidates) {
    if (!known.has(spellId)) continue;
    // One bear form at a time: hide Bear once Dire Bear is known.
    if (spellId === BEAR_FORM_SPELL && known.has(DIRE_BEAR_FORM_SPELL)) continue;
    const sp = spellOf(spellId);
    if (!sp) continue;
    if (hasAttrEx2(sp, SPELL_ATTR_EX2.NO_SHAPESHIFT_UI)) continue;
    // Prefer real form spells; still accept known canonical ids if bake is thin.
    if (!isFormSpell(sp) && sp.role !== 'stealth' && sp.role !== 'form' && !hasAttrEx2(sp, SPELL_ATTR_EX2.USE_SHAPESHIFT_BAR)) continue;
    let formId = formIdFromSpell(sp);
    if (!formId) {
      // Canonical fallbacks when effects[] not yet resolved (rawEffects still present via isFormSpell).
      formId = FORM_ID_BY_SPELL[spellId] ?? 0;
    }
    if (!formId) continue;
    slots.push({
      spellId,
      formId,
      name: sp.name,
      icon: sp.icon,
      active: form === formId,
    });
  }
  return slots;
}

/** Form id for each canonical stance-bar spell (1.12). */
const FORM_ID_BY_SPELL: Readonly<Record<number, number>> = {
  2457: SHAPESHIFT_FORM.BATTLESTANCE,
  71: SHAPESHIFT_FORM.DEFENSIVESTANCE,
  2458: SHAPESHIFT_FORM.BERSERKERSTANCE,
  5487: SHAPESHIFT_FORM.BEAR,
  9634: SHAPESHIFT_FORM.DIREBEAR,
  768: SHAPESHIFT_FORM.CAT,
  783: SHAPESHIFT_FORM.TRAVEL,
  1066: SHAPESHIFT_FORM.AQUA,
  24858: SHAPESHIFT_FORM.MOONKIN,
  15473: SHAPESHIFT_FORM.SHADOWFORM,
  1784: SHAPESHIFT_FORM.STEALTH,
};

/** Classes that show a stance bar when they know at least one form spell. */
export function classHasStanceBar(classId: number): boolean {
  return !!CLASS_STANCE_SPELLS[classId | 0]?.length;
}
