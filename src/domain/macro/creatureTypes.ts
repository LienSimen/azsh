// `[type:Undead]` labels, shared by both hosts so a macro reads the same in a fight and out. The
// totem id lives here because our CREATURE_TYPE declares 1-10. Cite: SharedDefines.h TOTEM = 11.

/** CreatureType id -> the label `[type:…]` matches. Underscores in the macro read as spaces. */
export const MACRO_CREATURE_TYPE_LABEL: Readonly<Record<number, string>> = {
  1: 'Beast',
  2: 'Dragonkin',
  3: 'Demon',
  4: 'Elemental',
  5: 'Giant',
  6: 'Undead',
  7: 'Humanoid',
  8: 'Critter',
  9: 'Mechanical',
  10: 'Not specified',
  11: 'Totem',
};

/** Every label a `[type:…]` chip can offer, in the doc's alphabetical order. */
export const MACRO_CREATURE_TYPES: readonly string[] = Object.values(MACRO_CREATURE_TYPE_LABEL)
  .slice()
  .sort((a, b) => a.localeCompare(b));

// True when `query` names this creature type. Accepts the label, the doc's `Not_Specified` underscore
// spelling (the parser already turned `_` into a space), and the raw numeric id.
export function macroCreatureTypeMatches(query: string, typeId: number | undefined): boolean {
  const q = String(query ?? '').trim().toLowerCase().replace(/_/g, ' ');
  if (!q || typeId == null) return false;
  if (Number(q) === typeId) return true;
  return (MACRO_CREATURE_TYPE_LABEL[typeId] ?? '').toLowerCase() === q;
}

/** The CreatureType id a `[type:…]` value names, or null. Accepts the label or the raw id. */
export function macroCreatureTypeId(query: string): number | null {
  for (const key of Object.keys(MACRO_CREATURE_TYPE_LABEL)) {
    const id = Number(key);
    if (macroCreatureTypeMatches(query, id)) return id;
  }
  return null;
}
