// Character appearance — the five customization slots stored as 0-based indices into each body's
// legal Choices. Pure, and the deterministic picker is a name hash so a look is stable forever.

import { APPEARANCE_OPTIONS, type BodyAppearance } from '../../data/appearanceOptions.ts';

// The five appearance slots in canonical order, each a 0-based index into that slot's legal
// Choices. A race may rename a slot, but the index meaning is fixed by position.
export interface Appearance {
  skin: number;
  face: number;
  hairStyle: number;
  hairColor: number;
  facialHair: number;
}

/** Appearance slots in canonical (option) order — index i maps to options[i]. */
export const APPEARANCE_SLOTS = ['skin', 'face', 'hairStyle', 'hairColor', 'facialHair'] as const;
export type AppearanceSlot = (typeof APPEARANCE_SLOTS)[number];

/** All-zero appearance: Choices[0] of every slot (the viewer's own default customization). */
export const DEFAULT_APPEARANCE: Appearance = { skin: 0, face: 0, hairStyle: 0, hairColor: 0, facialHair: 0 };

// race id -> slug, matching ui/core/icons.ts RACE_SLUG and render-paperdoll.mjs (kept local so the
// pure layer never imports the UI). Race 5 is 'undead' (not 'scourge').
const RACE_SLUG: Record<number, string> = {
  1: 'human', 2: 'orc', 3: 'dwarf', 4: 'nightelf', 5: 'undead', 6: 'tauren', 7: 'gnome', 8: 'troll',
};

/** Body slug ("human-male") for a race/gender, or null for an unknown race. */
export function bodySlug(race: number, gender: 0 | 1 | undefined): string | null {
  const r = RACE_SLUG[race];
  return r ? `${r}-${gender === 1 ? 'female' : 'male'}` : null;
}

/** The BodyAppearance (five option metas) for a race/gender, or undefined if unmapped. */
export function bodyOptions(race: number, gender: 0 | 1 | undefined): BodyAppearance | undefined {
  const slug = bodySlug(race, gender);
  return slug ? APPEARANCE_OPTIONS[slug] : undefined;
}

/** Legal Choice count for one slot of a body (0 when the body/slot is unknown). */
export function slotCount(race: number, gender: 0 | 1 | undefined, slot: number): number {
  return bodyOptions(race, gender)?.options[slot]?.count ?? 0;
}

// FNV-1a 32-bit — a tiny stable string hash (no crypto, deterministic across platforms).
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Deterministic-by-name appearance: hash(name|slug|slot) % count per slot, constrained to legal
// Choices and stable forever. An unmapped race returns DEFAULT_APPEARANCE, never a bad index.
export function deterministicAppearance(name: string, race: number, gender: 0 | 1 | undefined): Appearance {
  const body = bodyOptions(race, gender);
  if (!body) return { ...DEFAULT_APPEARANCE };
  const slug = bodySlug(race, gender);
  const pick = (slot: number): number => {
    const count = body.options[slot]?.count ?? 0;
    if (count <= 1) return 0;
    const h = hashString(`${name}|${slug}|${slot}`);
    // hairStyle index 0 is None (bald/hornless) — a deliberate PLAYER opt-in, never auto-derived,
    // so bots and defaults get a real style. facialHair index 0 stays a normal derived outcome.
    if (slot === 2 && body.options[2]?.none && count > 1) return 1 + (h % (count - 1));
    return h % count;
  };
  return { skin: pick(0), face: pick(1), hairStyle: pick(2), hairColor: pick(3), facialHair: pick(4) };
}

const clampIndex = (v: unknown, count: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || count <= 0) return 0;
  const i = Math.floor(v);
  if (i < 0) return 0;
  return i >= count ? count - 1 : i;
};

// Clamp every slot into its body's legal range, and push a stored index off a None the client never
// offered — an old save must not leave a tauren hornless.
export function clampAppearance(a: Appearance, race: number, gender: 0 | 1 | undefined): Appearance {
  const body = bodyOptions(race, gender);
  if (!body) return { ...DEFAULT_APPEARANCE };
  const at = (slot: number, v: unknown): number => {
    const i = clampIndex(v, body.options[slot].count);
    const floor = body.options[slot].noneSelectable === false ? 1 : 0;
    return i < floor && body.options[slot].count > floor ? floor : i;
  };
  return {
    skin: at(0, a.skin),
    face: at(1, a.face),
    hairStyle: at(2, a.hairStyle),
    hairColor: at(3, a.hairColor),
    facialHair: at(4, a.facialHair),
  };
}

// Resolve a stored or absent appearance for load and migration: a valid object is clamped, and
// anything missing falls back to the deterministic look so no character is a clone.
export function normalizeAppearance(
  raw: unknown,
  name: string,
  race: number,
  gender: 0 | 1 | undefined,
): Appearance {
  if (raw && typeof raw === 'object') {
    const r = raw as Partial<Record<AppearanceSlot, unknown>>;
    const hasAny = APPEARANCE_SLOTS.some((k) => typeof r[k] === 'number');
    if (hasAny) {
      return clampAppearance(
        {
          skin: Number(r.skin) || 0,
          face: Number(r.face) || 0,
          hairStyle: Number(r.hairStyle) || 0,
          hairColor: Number(r.hairColor) || 0,
          facialHair: Number(r.facialHair) || 0,
        },
        race,
        gender,
      );
    }
  }
  return deterministicAppearance(name, race, gender);
}

// Cycle one slot by `dir`, wrapping within the body's legal Choices — the creation screen's picker
// arrows. Pure, and unchanged when the body is unmapped or the slot has fewer than two choices.
export function cycleAppearance(
  a: Appearance,
  race: number,
  gender: 0 | 1 | undefined,
  slot: number,
  dir: 1 | -1,
): Appearance {
  const count = slotCount(race, gender, slot);
  if (count <= 1 || slot < 0 || slot >= APPEARANCE_SLOTS.length) return a;
  const key = APPEARANCE_SLOTS[slot];
  const floor = lowestSelectable(race, gender, slot);
  if (count - floor <= 1) return a;
  const cur = Math.max(clampIndex(a[key], count), floor);
  const span = count - floor;
  const next = floor + (((cur - floor + dir) % span) + span) % span;
  return { ...a, [key]: next };
}

// First index a PLAYER may pick: 1 where index 0 is a None the client never offered, else 0. The
// index space keeps the None either way, because the bake's base IS that None.
export function lowestSelectable(race: number, gender: 0 | 1 | undefined, slot: number): number {
  return bodyOptions(race, gender)?.options[slot]?.noneSelectable === false ? 1 : 0;
}

// True when the hairStyle slot is REAL hair a helm should hide — its option name mentions "Hair".
// Tauren horns and any non-hair scalp return false, so a helm never removes them.
export function hairStyleHiddenByHelm(race: number, gender: 0 | 1 | undefined): boolean {
  const name = bodyOptions(race, gender)?.options[2]?.name ?? '';
  return /hair/i.test(name);
}

// True when the hairStyle slot has a synthetic None at index 0, which every mapped body now does.
// The picker labels it "None" and it pushes no overlay, so the bald base shows through.
export function hairStyleHasNone(race: number, gender: 0 | 1 | undefined): boolean {
  return bodyOptions(race, gender)?.options[2]?.none === true;
}
