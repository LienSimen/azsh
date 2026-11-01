// A character (you, a companion, a saved hero) as layers on the gear pack: skin, face, facial hair and hair
// from the appearance, then every equipped item's appearance overlay in phonecraft's draw order
// (src/ui/core/paperdollSprite.ts). The pixels are modelArt.mjs's; this file only decides what stacks.
import { clampAppearance, deterministicAppearance, DEFAULT_APPEARANCE, bodySlug, hairStyleHiddenByHelm } from '../domain/character/appearance.ts';
import { equippedEntry } from '../domain/items/itemInstance.ts';
import { compositeArt, gearBody, gearKeyOfItem } from './modelArt.mjs';

// Composite draw order, bottom → top (the skin base is underneath):
//   face → shirt → legs → feet → chest/robe → waist → tabard → wrist → hands
//   → facial/beard (over torso gear so long beards drape on chest) → hair → cloak → shoulders → helm
//   → weapons → off-hand. Appearance and gear share one z space so beard and hair interleave with armour.
const Z_APPEARANCE = { face: 1, facial: 10, hair: 11 };
const Z_BY_INVTYPE = {
  4: 2, 7: 3, 8: 4, 5: 5, 20: 5, 6: 6, 19: 7, 9: 8, 10: 9, 16: 12, 3: 13, 1: 14,
  13: 15, 17: 15, 21: 15, 15: 15, 25: 15, 26: 15, 14: 16, 22: 16, 23: 16,
};
const Z_GEAR_DEFAULT = 15, Z_MIRRORED = 16;
const WEAPON_SLOTS = new Set(['mainhand', 'offhand', 'ranged']);
// Overlays are keyed by the item's InventoryType, so a one-hander only exists drawn in the main hand; in the
// off hand it is mirrored about the frame's centre. Shields and held-in-off-hand items are baked on that side.
const MAINHAND_INVTYPES = new Set([13, 17, 21]);
const HUNTER = 3;

// The bake holds every weapon unsheathed, so a hunter with an axe and a gun would swing both: one set is
// drawn. The class that auto-attacks at range carries the ranged item; everyone else the melee pair.
// An empty set yields to the other, so a wand-only priest still holds something.
function drawnWeaponSlots(c) {
  const hasMelee = equippedEntry(c.equipped?.mainhand) != null || equippedEntry(c.equipped?.offhand) != null;
  const hasRanged = equippedEntry(c.equipped?.ranged) != null;
  if (!hasMelee) return new Set(['ranged']);
  if (!hasRanged || c.cls !== HUNTER) return new Set(['mainhand', 'offhand']);
  return new Set(['ranged']);
}

/**
 * What a subject ({ race, gender, cls, name, equipped, appearance }) composes into: the body slug, the skin
 * and the layers `{ key, z, mirrored }`. The look is the stored appearance (clamped to the body's choices),
 * else the deterministic-by-name one companions get, else the default. Null when the pack lacks the body.
 */
export function paperdollLayers(c) {
  const slug = bodySlug(c.race, c.gender);
  const body = slug ? gearBody(slug) : null;
  if (!body) return null;
  const look = c.appearance ? clampAppearance(c.appearance, c.race, c.gender)
    : c.name ? deterministicAppearance(c.name, c.race, c.gender) : DEFAULT_APPEARANCE;
  const has = (k) => body.overlays.has(k);
  const layers = [];
  const headOn = equippedEntry(c.equipped?.head) != null;
  const face = `face-${look.face}-skin-${look.skin}`;
  if (look.face > 0 && has(face)) layers.push({ key: face, z: Z_APPEARANCE.face });
  // One colour option drives beard as well as scalp; the bake has the per-colour beard where it was good.
  const facial = has(`facial-${look.facialHair}-${look.hairColor}`) ? `facial-${look.facialHair}-${look.hairColor}`
    : has(`facial-${look.facialHair}-0`) ? `facial-${look.facialHair}-0` : null;
  if (facial) layers.push({ key: facial, z: Z_APPEARANCE.facial });
  // Hair is additive over a bald base: style 0 is none. A helm hides hair, never horns or tusks.
  const hair = `hair-${look.hairStyle}-${look.hairColor}`;
  if (look.hairStyle > 0 && !(headOn && hairStyleHiddenByHelm(c.race, c.gender)) && has(hair)) layers.push({ key: hair, z: Z_APPEARANCE.hair });
  const drawn = drawnWeaponSlots(c);
  for (const [slot, v] of Object.entries(c.equipped ?? {})) {
    if (WEAPON_SLOTS.has(slot) && !drawn.has(slot)) continue;
    const entry = equippedEntry(v);
    if (entry == null) continue;
    const key = gearKeyOfItem(entry);
    if (!key || !has(key)) continue;
    const inv = Number(key.split('-')[0]);
    const mirrored = slot === 'offhand' && MAINHAND_INVTYPES.has(inv);
    layers.push({ key, z: mirrored ? Z_MIRRORED : Z_BY_INVTYPE[inv] ?? Z_GEAR_DEFAULT, mirrored });
  }
  return { slug, skin: look.skin, layers };
}

/** The subject drawn in its gear as half-block lines fitting `maxCols` x `maxRows`, or null. */
export function paperdollArt(c, maxCols, maxRows) {
  const p = paperdollLayers(c);
  return p ? compositeArt(p.slug, p.skin, p.layers, maxCols, maxRows) : null;
}
