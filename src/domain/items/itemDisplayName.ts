// Classic item display name: base template plus random-property suffix, so "Notched Shortsword"
// and "of Strength" make "Notched Shortsword of Strength". Pure: no DOM, no DataStore.

import type { ItemDef, RandomPropertyDef } from '../../data/schema.ts';

// Join a base item name with an ItemRandomProperties name suffix. Empty / absent suffix leaves baseName
// unchanged. Avoids double-space; if base already ends with the suffix (case-insensitive), does not double.
export function formatItemName(baseName: string, nameSuffix?: string | null): string {
  const base = (baseName ?? '').trimEnd();
  const suffix = (nameSuffix ?? '').trim();
  if (!suffix) return baseName ?? '';
  if (!base) return suffix;

  // Already carries this suffix (e.g. re-format of a previously joined name).
  const baseLower = base.toLowerCase();
  const suffixLower = suffix.toLowerCase();
  if (baseLower === suffixLower || baseLower.endsWith(` ${suffixLower}`)) {
    return base;
  }

  // Collapse any trailing whitespace before joining with a single space.
  return `${base} ${suffix}`;
}

// Display name for an item def + optional resolved random property. When prop is absent or has no
// nameSuffix, returns def.name unchanged.
export function itemDisplayName(
  def: Pick<ItemDef, 'name'> | null | undefined,
  prop?: RandomPropertyDef | null,
): string {
  const base = def?.name ?? '';
  return formatItemName(base, prop?.nameSuffix);
}
