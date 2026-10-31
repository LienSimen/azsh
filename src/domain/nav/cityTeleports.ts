// The six capital teleports, selected off the bake rather than typed in: exactly the
// spellTeleports rows carrying the mage reagent (3561/3562/3563/3565/3566/3567).

/** item_template 17031 Rune of Teleportation. Cite: src/data/tables/spellTeleports.json. */
export const RUNE_OF_TELEPORTATION = 17031;

/** True for a baked teleport row that lands in a capital city. */
export function isCapitalTeleport(row: { reagents: ReadonlyArray<{ item: number }> }): boolean {
  return row.reagents.some((r) => r.item === RUNE_OF_TELEPORTATION);
}
