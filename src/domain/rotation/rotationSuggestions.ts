// Authored rotation SUGGESTION schema plus pure parse and normalize. Content lives in
// docs/rotation_sugguestions and compiles to src/data/rotations — the browser never parses markdown.

import { CLASS } from '../../data/schema.ts';
import { sanitizeStepBackYd } from './stand.ts';
import type { RuleMove } from './types.ts';

// ---- Class keys -----------------------------------------------------------

export const SUGGESTION_CLASS_KEYS = [
  'warrior',
  'paladin',
  'hunter',
  'rogue',
  'priest',
  'shaman',
  'mage',
  'warlock',
  'druid',
] as const;

export type SuggestionClassKey = (typeof SUGGESTION_CLASS_KEYS)[number];

export const SUGGESTION_CLASS_IDS: Record<SuggestionClassKey, number> = {
  warrior: CLASS.WARRIOR,
  paladin: CLASS.PALADIN,
  hunter: CLASS.HUNTER,
  rogue: CLASS.ROGUE,
  priest: CLASS.PRIEST,
  shaman: CLASS.SHAMAN,
  mage: CLASS.MAGE,
  warlock: CLASS.WARLOCK,
  druid: CLASS.DRUID,
};

/** Reverse map: CLASS id → suggestion slug (or null for unsupported classes). */
const CLASS_ID_TO_KEY = new Map<number, SuggestionClassKey>(
  SUGGESTION_CLASS_KEYS.map((k) => [SUGGESTION_CLASS_IDS[k], k]),
);

/** Map a character `cls` id to a suggestion pack key, or null if none. */
export function suggestionClassKeyFromClassId(classId: number): SuggestionClassKey | null {
  return CLASS_ID_TO_KEY.get(classId) ?? null;
}

// G16: the variant name for "my list against THIS class". Nothing authors one yet, and that is
// fine - `selectBand` falls a named variant it cannot find back to the variant-less pvp pool.
export function vsClassVariant(enemyClassId: number | null | undefined): string | undefined {
  const key = enemyClassId != null ? suggestionClassKeyFromClassId(enemyClassId) : null;
  return key ? `vs-${key}` : undefined;
}

/** Primary tree when the character has 0 talent points (plan § Spec defaults). */
export const CLASS_DEFAULT_SPEC: Record<SuggestionClassKey, string> = {
  warrior: 'Arms',
  paladin: 'Retribution',
  hunter: 'Beast Mastery',
  rogue: 'Combat',
  priest: 'Shadow',
  shaman: 'Enhancement',
  mage: 'Frost',
  warlock: 'Affliction',
  // L1–9 has no Bear/Cat yet; Balance matches the real starter kit (Moonfire/Wrath). Feral from L10+.
  druid: 'Balance',
};

export const SUGGESTION_PHASES = ['buffs', 'pull', 'recovery', 'combat'] as const;
export type SuggestionPhase = (typeof SUGGESTION_PHASES)[number];

// ---- Raw MD / committed JSON shape ----------------------------------------

// A baked condition row. When a pack rule carries these the builder uses them verbatim and invents
// no gates of its own — everything editable lives here.
export interface RawSuggestionCondition {
  subject?: 'self' | 'target' | 'pet';
  metric: string;
  op: string;
  value: number;
  /** Spell/item id, or `"ACTION_SPELL"` for the rule's own resolved spell. */
  ref?: number | 'ACTION_SPELL' | 'ITEM' | 'TOTEM_SLOT';
}

/** One priority row as authored in the MD JSON. */
export interface RawSuggestionRule {
  spell?: string;
  item?: string;
  when?: string;
  /** Pre-baked conditions — wins over free-text `when` when non-empty. */
  conditions?: RawSuggestionCondition[];
  /** `'other'` = cast at a non-focus, not-already-controlled hostile (crowd control). */
  target?: 'focus' | 'other';
  /** G15: after-cast retreat, yards from the focus. Sanitized by `sanitizeStepBackYd`. */
  after?: { stepBackYd?: number };
  // A walk instead of a cast — the RuleMove the builder hands to `advanceGapClose`. A row carrying
  // one names no spell, so `move` and `spell`/`item` are exclusive.
  move?: RuleMove;
}

/** One level×spec band as authored (may be stub-only with a note). */
export type BandMode = 'pvp';

export interface RawSuggestionBand {
  levels?: string;
  spec?: string;
  /** Some files also carry a talent-tree label (e.g. paladin.md). */
  tree?: string;
  /** `"pvp"` = duel / battleground / arena only. Absent = PvE, and PvE never sees a pvp band. */
  mode?: string;
  /** Names a SECOND pvp list for the same tree+levels. Only a request naming it selects it. */
  variant?: string;
  note?: string;
  buffs?: RawSuggestionRule[];
  pull?: RawSuggestionRule[];
  recovery?: RawSuggestionRule[];
  combat?: RawSuggestionRule[];
}

// ---- Normalized model -----------------------------------------------------

export type SuggestionRuleKind = 'spell' | 'item' | 'noop' | 'move';

/** One actionable (or intentional no-op) priority entry after normalize. */
export interface SuggestionRule {
  /** Original spell/item label from the MD. */
  label: string;
  // Ordered alternative labels after alias expand / slash-or split. Each entry is `normalizeSpellName`'d.
  // Empty when kind === 'noop'.
  labels: string[];
  /** Raw "when" string — mapped to Condition[] in Wave 0B when `conditions` is empty. */
  when: string;
  kind: SuggestionRuleKind;
  // Pre-baked conditions from materialized packs. When set, the builder skips inventing gates (role-bucket
  // / semantic inject) for this row — the pack IS the rotation.
  conditions?: RawSuggestionCondition[];
  // `other` aims the rule at a living hostile that is NOT the focus and is not already controlled —
  // the crowd-control selector. Omitted means the current target.
  target?: 'focus' | 'other';
  /** G15: authored after-cast retreat, yards. Reaches `RotationRule.after` in the builder. */
  after?: { stepBackYd?: number };
  /** Set only when `kind === 'move'`; becomes `RotationRule.action` verbatim. */
  move?: RuleMove;
}

export interface SuggestionBand {
  /** Original levels string (`"1-3"`, `"60"`, …). */
  levels: string;
  levelLo: number;
  levelHi: number;
  /** Raw MD `spec` field. */
  specRaw: string;
  /** Normalized primary tree name (e.g. Frost, Arms, Combat). */
  spec: string;
  // All trees this band applies to. Dual-authored labels like `Assassination/Subtlety` expand to both trees
  // so `selectBand` matches either request (not just the primary).
  specs: string[];
  /** Raw MD `tree` if present. */
  treeRaw?: string;
  /** Set only when the band is authored for PvP; PvE selection filters these out entirely. */
  mode?: BandMode;
  /** Set only on a pvp band, so a variant can never reach PvE selection at all. */
  variant?: string;
  note?: string;
  /** True when the band is only a note (no phase lists). */
  stub: boolean;
  phases: Record<SuggestionPhase, SuggestionRule[]>;
}

export interface ClassSuggestions {
  classKey: SuggestionClassKey;
  classId: number;
  bands: SuggestionBand[];
}

// ---- Name / alias helpers (mirrors audit-rotation-suggestions.mjs) --------

// Common free-text aliases from the suggestion MD / audit script. Values are already suitable for further
// name lookup (not re-normalized here).
export const SPELL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'arcane intellect / arcane brilliance': ['arcane intellect', 'arcane brilliance'],
  'conjure food / conjure water': ['conjure food', 'conjure water'],
  'conjure mana agate / citrine': ['conjure mana agate', 'conjure mana citrine'],
  'conjure mana ruby / citrine': ['conjure mana ruby', 'conjure mana citrine'],
  'demon skin/armor': ['demon skin', 'demon armor'],
  'demon skin / armor': ['demon skin', 'demon armor'],
  // After normalizeSpellName strips `/` → spaces
  'demon skin armor': ['demon skin', 'demon armor'],
  'healing potion / healthstone': ['healing potion', 'major healing potion', 'healthstone'],
  'use healthstone': [
    'healthstone',
    'minor healthstone',
    'lesser healthstone',
    'greater healthstone',
    'major healthstone',
  ],
  'health potion': [
    'healing potion',
    'minor healing potion',
    'lesser healing potion',
    'greater healing potion',
    'major healing potion',
    'superior healing potion',
  ],
  'healing potion': [
    'healing potion',
    'minor healing potion',
    'lesser healing potion',
    'greater healing potion',
    'major healing potion',
    'superior healing potion',
  ],
  // Priest (and others) recovery row often says just "potion"
  potion: [
    'healing potion',
    'minor healing potion',
    'lesser healing potion',
    'greater healing potion',
    'major healing potion',
    'superior healing potion',
  ],
  'auto-attack': [],
  none: [],
  'n/a': [],
  autoattack: [],
  'auto attack': [],
  // Hunter Feed Pet (spell 6991) is not in the bake; happiness is raised via game.feedPet(food item),
  // not a castable rotation spell. Intentional noop so builder/audit do not thrash unresolved.
  'feed pet': [],
  'instant vi / deadly v': ['instant poison vi', 'deadly poison v', 'instant poison', 'deadly poison'],
  'instant / deadly poison': ['instant poison', 'deadly poison'],
  'instant poison': ['instant poison'],
  // Warrior Prot hybrid filler (40+ bands) — prefer WW → BT → MS when known
  'whirlwind/bloodthirst/mortal strike (hybrid)': ['whirlwind', 'bloodthirst', 'mortal strike'],
  'whirlwind bloodthirst mortal strike': ['whirlwind', 'bloodthirst', 'mortal strike'],
  // Wave 2-SHA: slash earth totems keep full Classic names (bare "stoneskin" is the aura, not the summon)
  'stoneskin/strength of earth totem': ['stoneskin totem', 'strength of earth totem'],
  'stoneskin strength of earth totem': ['stoneskin totem', 'strength of earth totem'],
  'strength of earth/stoneskin totem': ['strength of earth totem', 'stoneskin totem'],
  'strength of earth stoneskin totem': ['strength of earth totem', 'stoneskin totem'],
  // Resto solo filler row — "shocks" is not a spell name
  'shocks/flame shock': ['flame shock', 'earth shock', 'frost shock'],
  'shocks flame shock': ['flame shock', 'earth shock', 'frost shock'],
  // Resto fallback "auto-attack or LB" → Lightning Bolt only (auto-attack is engine melee, not a rule)
  'auto-attack or lb': ['lightning bolt'],
  'auto attack or lb': ['lightning bolt'],
};

// Fold free-text spell and item labels for alias lookup and bake resolve. Non-rank parentheticals
// stay as tokens, so "Faerie Fire (Feral)" is not "Faerie Fire". Memoized: 2.6% of a tick profile.
const normalizedNames = new Map<string, string>();

export function normalizeSpellName(s: string): string {
  const key = String(s);
  const hit = normalizedNames.get(key);
  if (hit !== undefined) return hit;
  const out = normalizeSpellNameUncached(key);
  if (normalizedNames.size < 50_000) normalizedNames.set(key, out);
  return out;
}

function normalizeSpellNameUncached(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/\(rank\s*\d+\)/gi, '')
    .replace(/\(if[^)]*\)/gi, '')
    .replace(/\(([^)]*)\)/g, ' $1 ')
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9'+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parenthetical rank adjectives (Create Healthstone (Major), (Rank N)). Not (Feral) / (Bear).
const RANK_PAREN_RE = /\((rank\s*\d+|minor|lesser|greater|major|superior)\)/gi;

/** Name with rank parentheses stripped, so every Create Healthstone rank shares one key. */
export function rankBaseSpellName(s: string): string {
  return normalizeSpellName(String(s).replace(RANK_PAREN_RE, ''));
}

// Parse a level band string into inclusive lo/hi. Accepts `"1-3"`, en-dash `"1–3"`, or a single level
// `"60"`. Unparseable → full classic range 1–60.
export function parseLevelBand(levels: string | number | undefined | null): { lo: number; hi: number } {
  const m = String(levels ?? '').match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return { lo: +m[1], hi: +m[2] };
  const n = parseInt(String(levels ?? ''), 10);
  if (Number.isFinite(n)) return { lo: n, hi: n };
  return { lo: 1, hi: 60 };
}

// Split "A / B / C" or "A or B" alternatives; expand known combined aliases. Empty / none / n/a /
// auto-attack → []. Lowercase + collapse whitespace, keep `/` so alias keys like `demon skin/armor` match.
function aliasLookupKey(s: string): string {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function splitAlternatives(raw: string): string[] {
  const s = String(raw).trim();
  if (!s || /^none$/i.test(s) || /^n\/a$/i.test(s)) return [];
  // Prefer keys that still contain `/` (authoring form), then fully folded names.
  const candidates = [aliasLookupKey(s), normalizeSpellName(s)];
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(SPELL_ALIASES, key)) {
      return [...SPELL_ALIASES[key]!];
    }
  }

  // "X or Y" openers (skip Demon Skin/Armor style — handled by alias; also skip "or" inside armor phrases)
  if (/\bor\b/i.test(s) && !/armor/i.test(s)) {
    return s
      .split(/\bor\b/i)
      .map((x) => normalizeSpellName(x))
      .filter(Boolean);
  }

  // Slash alternatives: "Sinister Strike / Backstab"
  if (s.includes('/')) {
    const parts = s
      .split('/')
      .map((x) =>
        normalizeSpellName(
          x
            .replace(/\(if.*?\)/gi, '')
            .replace(/if talented/gi, '')
            .replace(/if dipped/gi, ''),
        ),
      )
      .filter(Boolean)
      .filter((x) => x !== 'if talented' && x !== 'if available' && x !== 'if dipped');
    // Wave 2-SHA: "Stoneskin/Strength of Earth Totem" → both * Totem (not the passive aura name)
    if (parts.length > 1 && parts.some((p) => /\btotem\b/.test(p))) {
      return parts.map((p) => (/\btotem\b/.test(p) ? p : `${p} totem`));
    }
    return parts;
  }

  return [
    normalizeSpellName(s.replace(/\(if.*?\)/gi, '').replace(/,?\s*if talented.*/i, '')),
  ].filter(Boolean);
}

// ---- Spec normalize -------------------------------------------------------

// Map free-text MD spec labels → canonical talent tree names used for band pick. Keys are lowercased labels
// as they appear (or after light fold).
const SPEC_CANONICAL: Readonly<Record<string, string>> = {
  // Mage
  frost: 'Frost',
  'frost leveling': 'Frost',
  fire: 'Fire',
  'fire leveling': 'Fire',
  arcane: 'Arcane',
  'arcane leveling': 'Arcane',
  // Warrior
  arms: 'Arms',
  fury: 'Fury',
  protection: 'Protection',
  prot: 'Protection',
  // Warlock
  affliction: 'Affliction',
  demonology: 'Demonology',
  destruction: 'Destruction',
  demo: 'Demonology',
  destro: 'Destruction',
  // Priest
  discipline: 'Discipline',
  disc: 'Discipline',
  holy: 'Holy',
  shadow: 'Shadow',
  // Paladin
  retribution: 'Retribution',
  ret: 'Retribution',
  // Hunter
  'beast mastery': 'Beast Mastery',
  bm: 'Beast Mastery',
  marksmanship: 'Marksmanship',
  mm: 'Marksmanship',
  survival: 'Survival',
  // Rogue
  combat: 'Combat',
  'combat (optimal solo)': 'Combat',
  'combat optimal solo': 'Combat',
  assassination: 'Assassination',
  subtlety: 'Subtlety',
  'assassination/subtlety': 'Assassination',
  'assassination subtlety': 'Assassination',
  // Druid — canonical spec is "Feral" (matches data packs); talent tab "Feral Combat" aliases here.
  // "Feral tank" is the role-facing bear-tank band (Classic name; same Feral Combat talents).
  feral: 'Feral',
  'feral combat': 'Feral',
  'feral tank': 'Feral tank',
  feraltank: 'Feral tank',
  // Retail-era synonym kept as alias only.
  guardian: 'Feral tank',
  bear: 'Feral tank',
  balance: 'Balance',
  restoration: 'Restoration',
  resto: 'Restoration',
  // Shaman
  enhancement: 'Enhancement',
  enhance: 'Enhancement',
  elemental: 'Elemental',
  ele: 'Elemental',
  // Product / leveling labels (some MD rows)
  baseline: 'baseline',
  'wand spec leveling': 'Shadow',
  'wand spec': 'Shadow',
  'pre-shadowform leveling': 'Shadow',
  'pre-shadowform': 'Shadow',
  'shadow leveling': 'Shadow',
};

function foldSpecKey(raw: string): string {
  return String(raw)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/leveling/g, ' ')
    .replace(/optimal\s+solo/g, ' ')
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9'+\-\/\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalize an authored spec to a canonical tree name for band matching, falling back to the class
// default. A dual label keeps the FIRST tree as primary; use band.specs for full membership.
export function normalizeSpecKey(
  classKey: SuggestionClassKey,
  specRaw: string | undefined | null,
  treeRaw?: string | undefined | null,
): string {
  return normalizeSpecKeys(classKey, specRaw, treeRaw)[0]!;
}

// All canonical trees implied by an MD `spec` label. Splits dual-tree authorship (`Assassination/Subtlety`)
// so both trees match the band.
export function normalizeSpecKeys(
  classKey: SuggestionClassKey,
  specRaw: string | undefined | null,
  treeRaw?: string | undefined | null,
): string[] {
  const tryMap = (raw: string | undefined | null): string | null => {
    if (raw == null || String(raw).trim() === '') return null;
    const exact = String(raw).toLowerCase().trim();
    if (SPEC_CANONICAL[exact]) return SPEC_CANONICAL[exact]!;
    const folded = foldSpecKey(raw);
    if (SPEC_CANONICAL[folded]) return SPEC_CANONICAL[folded]!;
    // Title-case fallback when it already looks like a simple tree name
    if (/^[a-z]+(?:\s+[a-z]+)?$/i.test(String(raw).trim()) && !/^baseline$/i.test(String(raw))) {
      return String(raw)
        .trim()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
    return null;
  };

  const mapOne = (raw: string | undefined | null): string | null => {
    const fromTree = tryMap(treeRaw);
    const fromSpec = tryMap(raw);
    if (fromSpec === 'baseline') {
      return fromTree && fromTree !== 'baseline' ? fromTree : CLASS_DEFAULT_SPEC[classKey];
    }
    if (fromSpec && fromSpec !== 'baseline') return fromSpec;
    if (fromTree && fromTree !== 'baseline') return fromTree;
    return null;
  };

  // Dual-tree labels: split on `/` before whole-string canonical lookup so "Assassination/Subtlety" applies
  // to both trees (SPEC_CANONICAL maps the mash solely to Assassination for legacy primary-key callers).
  const raw = specRaw != null ? String(specRaw).trim() : '';
  if (raw.includes('/')) {
    const parts = raw
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      const keys: string[] = [];
      const seen = new Set<string>();
      for (const part of parts) {
        // Map each side alone (no treeRaw — tree applies to whole row, not each half).
        const k = mapOne(part) ?? tryMap(part);
        if (k && k !== 'baseline' && !seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
      if (keys.length > 1) return keys;
      if (keys.length === 1) return keys;
    }
  }

  const single = mapOne(specRaw);
  if (single && single !== 'baseline') return [single];
  return [CLASS_DEFAULT_SPEC[classKey]];
}

/** True when band membership includes `want` (primary or dual-spec). */
export function bandMatchesSpec(band: SuggestionBand, want: string): boolean {
  if (band.spec === want) return true;
  return band.specs.includes(want);
}

// Parse stub notes like `identical to Affliction` / `identical to Affliction (pet…)`. Returns the
// referenced tree label or null.
export function parseIdenticalToNote(note: string | undefined | null): string | null {
  if (note == null || String(note).trim() === '') return null;
  const m = String(note).match(/identical\s+to\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
  return m ? m[1]!.trim() : null;
}

/** Distance from `level` to a band's inclusive range (0 if inside). */
function levelBandDistance(level: number, band: SuggestionBand): number {
  if (level < band.levelLo) return band.levelLo - level;
  if (level > band.levelHi) return level - band.levelHi;
  return 0;
}

/** Clone a donor band under a requested tree identity (stub resolve / rebrand). */
function rebrandBand(donor: SuggestionBand, want: string, stub?: SuggestionBand): SuggestionBand {
  return {
    ...donor,
    spec: want,
    specs: [want],
    stub: false,
    note: stub?.note ?? donor.note,
    specRaw: stub?.specRaw ?? want,
  };
}

// ---- Rule / band normalize ------------------------------------------------

function isNoopLabel(label: string): boolean {
  const key = normalizeSpellName(label);
  if (!key || key === 'none' || key === 'n/a' || key === 'autoattack' || /^auto[- ]?attack$/.test(key)) {
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(SPELL_ALIASES, key) && SPELL_ALIASES[key]!.length === 0) {
    return true;
  }
  return false;
}

/** Reader label for a move row — what the editor and the audit print instead of a spell name. */
function moveLabel(move: RuleMove): string {
  switch (move.kind) {
    case 'keep_range': return `keep ${move.minYd} yd`;
    case 'spread': return `spread ${move.minYd} yd`;
    case 'flee_raid': return `run out ${move.yd} yd`;
    case 'stack_on': return `stack on ${'unit' in move ? move.unit : move.role}`;
    case 'behind_target': return 'get behind';
    case 'flank_target': return 'flank';
    case 'move_to': return `move to ${move.x},${move.y}`;
    case 'avoid_zone': return `avoid ${move.id}`;
    case 'split_by_aura': return `split ${move.awayYd} yd`;
    default: return 'move';
  }
}

export function normalizeSuggestionRule(raw: RawSuggestionRule): SuggestionRule {
  const hasItem = raw.item != null && String(raw.item).trim() !== '';
  const hasSpell = raw.spell != null && String(raw.spell).trim() !== '';
  const label = String(hasSpell ? raw.spell : hasItem ? raw.item : '').trim();
  const when = String(raw.when ?? '').trim();
  const baked = Array.isArray(raw.conditions) && raw.conditions.length > 0
    ? raw.conditions.map((c) => ({
      subject: c.subject,
      metric: String(c.metric ?? ''),
      op: String(c.op ?? '=='),
      value: Number(c.value) || 0,
      ...(c.ref != null ? { ref: c.ref } : {}),
    }))
    : undefined;

  // A move row is decided before the spell path: it carries no label to resolve, so the noop and
  // empty-labels guards below would drop it.
  if (raw.move) {
    return {
      label: moveLabel(raw.move), labels: [], when, kind: 'move', move: raw.move,
      ...(baked ? { conditions: baked } : {}),
    };
  }

  if (isNoopLabel(label)) {
    return { label: label || 'none', labels: [], when, kind: 'noop', ...(baked ? { conditions: baked } : {}) };
  }

  const kind: SuggestionRuleKind = hasItem && !hasSpell ? 'item' : 'spell';
  const labels = splitAlternatives(label);
  const target = raw.target === 'other' ? 'other' as const : undefined;
  const stepBackYd = sanitizeStepBackYd(raw.after?.stepBackYd);
  return {
    label, labels, when, kind,
    ...(baked ? { conditions: baked } : {}),
    ...(target ? { target } : {}),
    ...(stepBackYd ? { after: { stepBackYd } } : {}),
  };
}

export function normalizeSuggestionBand(
  classKey: SuggestionClassKey,
  raw: RawSuggestionBand,
): SuggestionBand {
  const levels = String(raw.levels ?? '1-60');
  const { lo, hi } = parseLevelBand(levels);
  const specRaw = String(raw.spec ?? '');
  const treeRaw = raw.tree != null ? String(raw.tree) : undefined;
  // Strict: only the one known mode normalizes, so a typo reads as PvE rather than as a band
  // nothing can ever select.
  const mode: BandMode | undefined =
    String(raw.mode ?? '').trim().toLowerCase() === 'pvp' ? 'pvp' : undefined;
  // Variant discriminates the pvp pool only: dropping it off a PvE band is what makes
  // "a variant never leaks into levelling" structural rather than a selector rule.
  const variantRaw = String(raw.variant ?? '').trim();
  const variant = mode === 'pvp' && variantRaw ? variantRaw : undefined;
  const note = raw.note != null ? String(raw.note) : undefined;

  const phases: Record<SuggestionPhase, SuggestionRule[]> = {
    buffs: [],
    pull: [],
    recovery: [],
    combat: [],
  };

  let anyPhase = false;
  for (const phase of SUGGESTION_PHASES) {
    const list = raw[phase];
    if (!Array.isArray(list)) continue;
    anyPhase = true;
    phases[phase] = list.map((r) => normalizeSuggestionRule(r ?? {}));
  }

  // Stub: note-only rows (no phase lists) — warlock "identical to Affliction" style
  const stub = !anyPhase;
  const specs = normalizeSpecKeys(classKey, specRaw, treeRaw);

  return {
    levels,
    levelLo: lo,
    levelHi: hi,
    specRaw,
    spec: specs[0]!,
    specs,
    treeRaw,
    ...(mode ? { mode } : {}),
    ...(variant ? { variant } : {}),
    note,
    stub,
    phases,
  };
}

export function normalizeClassSuggestions(
  classKey: SuggestionClassKey,
  rawBands: readonly RawSuggestionBand[],
): ClassSuggestions {
  if (!Array.isArray(rawBands)) {
    throw new Error(`rotationSuggestions: ${classKey} expected array of bands`);
  }
  return {
    classKey,
    classId: SUGGESTION_CLASS_IDS[classKey],
    bands: rawBands.map((b) => normalizeSuggestionBand(classKey, b)),
  };
}

// ---- Source parse (MD / JSON text → raw array) ----------------------------

// Parse suggestion source text (raw JSON array, or MD with a leading/trailing prose wrapping a `[...]` JSON
// array). Throws if no array can be extracted.
export function parseSuggestionDocument(text: string): RawSuggestionBand[] {
  const trimmed = String(text).trim();
  if (!trimmed) throw new Error('rotationSuggestions: empty source');

  const tryParse = (s: string): RawSuggestionBand[] => {
    const v = JSON.parse(s) as unknown;
    if (!Array.isArray(v)) throw new Error('rotationSuggestions: expected JSON array');
    return v as RawSuggestionBand[];
  };

  try {
    return tryParse(trimmed);
  } catch {
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start >= 0 && end > start) {
      return tryParse(trimmed.slice(start, end + 1));
    }
    throw new Error('rotationSuggestions: cannot parse suggestion source');
  }
}

/** True if `key` is a known suggestion class slug. */
export function isSuggestionClassKey(key: string): key is SuggestionClassKey {
  return (SUGGESTION_CLASS_KEYS as readonly string[]).includes(key);
}

// ---- Load committed JSON ---------------------------------------------------
// One file per class per spec per mode, merged by src/data/rotations/index.ts.

import { ROTATION_PACKS } from '../../data/rotations/index.ts';

/** Load and normalize one class from its committed `src/data/rotations/<mode>/<class>/*.json`. */
export function getClassSuggestions(classKey: SuggestionClassKey): ClassSuggestions {
  const raw = ROTATION_PACKS[classKey];
  if (!raw) throw new Error(`rotationSuggestions: unknown class key "${classKey}"`);
  return normalizeClassSuggestions(classKey, raw);
}

/** Load all nine class suggestion packs (throws if any fail). */
export function loadAllSuggestionClasses(): Record<SuggestionClassKey, ClassSuggestions> {
  const out = {} as Record<SuggestionClassKey, ClassSuggestions>;
  for (const key of SUGGESTION_CLASS_KEYS) {
    out[key] = getClassSuggestions(key);
  }
  return out;
}

// ---- Band pick (Wave 0C) --------------------------------------------------

// Pick the best non-stub band for this level and primary spec: a covering band for the tree, then a
// rebranded stub donor, then the nearest same-tree band, then the class default, then any.
export function selectBand(
  pack: ClassSuggestions,
  level: number,
  spec: string,
  opts?: { mode?: BandMode; variant?: string },
): SuggestionBand | null {
  const pve = pack.bands.filter((b) => b.mode === undefined);
  if (opts?.mode !== 'pvp') return pickBand(pack.classKey, pve, level, spec);
  // A pvp band applies only to the tree AND the levels it was authored for: the PvE tail would hand
  // a level-19 mage a level-60 list. Variant is an EQUALITY filter, never a preference — but a
  // variant the asker names is a choice of LIST, not a choice of fight, so a level no variant band
  // covers falls to the variant-less pvp pool before the PvE ladder. A promoted duelist names its
  // variant on the seat (`ArenaCompSeat.rotation`, arenaComps.ts) and its variant is authored at 60,
  // so without this the top three rungs of every tier fought a levelling list below 60 while the
  // build they beat fought the pvp one. The reverse never happens: an asker naming no variant sees
  // only the variant-less pool, which is G1's no-leak rule.
  const want = String(opts.variant ?? '').trim() || undefined;
  for (const v of want ? [want, undefined] : [undefined]) {
    const pvp = pack.bands.filter((b) => b.mode === 'pvp' && (b.variant ?? undefined) === v);
    const hit = pvp.length ? pickBand(pack.classKey, pvp, level, spec) : null;
    if (hit && bandMatchesSpec(hit, spec) && level >= hit.levelLo && level <= hit.levelHi) return hit;
  }
  return pickBand(pack.classKey, pve, level, spec);
}

/** The band ladder, over one already-mode-filtered pool. */
function pickBand(
  classKey: SuggestionClassKey,
  bands: readonly SuggestionBand[],
  level: number,
  spec: string,
): SuggestionBand | null {
  const covering = bands.filter((b) => level >= b.levelLo && level <= b.levelHi);
  const nonStubCovering = covering.filter((b) => !b.stub);

  const bySpecIn = (want: string, pool: readonly SuggestionBand[]): SuggestionBand | undefined =>
    pool.find((b) => bandMatchesSpec(b, want));

  // 1. Exact tree at this level (incl. dual-spec membership).
  const exact = bySpecIn(spec, nonStubCovering);
  if (exact) return exact;

  // 2. Stub "identical to X" at this level → donor content, requested identity.
  const stub = covering.find((b) => b.stub && bandMatchesSpec(b, spec));
  if (stub) {
    const targetRaw = parseIdenticalToNote(stub.note);
    if (targetRaw) {
      const target = normalizeSpecKey(classKey, targetRaw);
      // Prefer covering donor; else nearest same-tree (not recursive rebrand of another stub).
      let donor = bySpecIn(target, nonStubCovering);
      if (!donor) {
        const sameTree = bands.filter((b) => !b.stub && bandMatchesSpec(b, target));
        if (sameTree.length) {
          donor = sameTree.reduce((best, b) =>
            levelBandDistance(level, b) < levelBandDistance(level, best) ? b : best,
          );
        }
      }
      if (donor) return rebrandBand(donor, spec, stub);
    }
  }

  // 3. Nearest non-stub of the **requested** tree (any level) before wrong-tree default.
  const sameSpecAll = bands.filter((b) => !b.stub && bandMatchesSpec(b, spec));
  if (sameSpecAll.length) {
    return sameSpecAll.reduce((best, b) =>
      levelBandDistance(level, b) < levelBandDistance(level, best) ? b : best,
    );
  }

  // 3b. Only stubs exist for this tree (e.g. Demonology everywhere) but no covering
  // row at this exact level — still try any stub + identical-to resolve.
  const anyStub = bands.find((b) => b.stub && bandMatchesSpec(b, spec));
  if (anyStub) {
    const targetRaw = parseIdenticalToNote(anyStub.note);
    if (targetRaw) {
      const target = normalizeSpecKey(classKey, targetRaw);
      const donor =
        bySpecIn(target, nonStubCovering) ??
        (() => {
          const sameTree = bands.filter((b) => !b.stub && bandMatchesSpec(b, target));
          if (!sameTree.length) return undefined;
          return sameTree.reduce((best, b) =>
            levelBandDistance(level, b) < levelBandDistance(level, best) ? b : best,
          );
        })();
      if (donor) return rebrandBand(donor, spec, anyStub);
    }
  }

  if (!nonStubCovering.length) return null;

  // 4–5. Class default, then any covering non-stub.
  return (
    bySpecIn(CLASS_DEFAULT_SPEC[classKey], nonStubCovering) ??
    nonStubCovering[0] ??
    null
  );
}

// Resolve a free-text, case-variant or authored spec label to a real talent tree name for this
// class, or null when none match. Accepts exact names, any case, and the pack aliases.
export function resolveTalentTreeName(
  classId: number,
  trees: readonly { name: string }[],
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const exact = trees.find((t) => t.name === s);
  if (exact) return exact.name;

  const lower = s.toLowerCase();
  const ci = trees.find((t) => t.name.toLowerCase() === lower);
  if (ci) return ci.name;

  const classKey = suggestionClassKeyFromClassId(classId);
  if (!classKey) return null;

  const canon = normalizeSpecKey(classKey, s);
  const byCanon = trees.find((t) => {
    if (t.name === canon) return true;
    if (t.name.toLowerCase() === canon.toLowerCase()) return true;
    return normalizeSpecKey(classKey, t.name) === canon;
  });
  return byCanon?.name ?? null;
}
