import type { SpellDef } from '../../data/schema.ts';

const kitByIdCache = new WeakMap<readonly SpellDef[], Map<number, SpellDef>>();

// The first row for a duplicate id, matching Array.find, keyed on the spells array so a shapeshift
// swap misses naturally. Only for arrays replaced wholesale — a pushed-to array must use find.
export function kitById(spells: readonly SpellDef[]): Map<number, SpellDef> {
  let m = kitByIdCache.get(spells);
  if (!m) {
    m = new Map<number, SpellDef>();
    for (const s of spells) if (!m.has(s.id)) m.set(s.id, s);
    kitByIdCache.set(spells, m);
  }
  return m;
}

export function spellFromKit(
  spells: readonly SpellDef[] | undefined,
  id: number,
): SpellDef | undefined {
  if (!spells?.length) return undefined;
  return kitById(spells).get(id);
}
