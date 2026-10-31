// How a kill-order term matches a body. A leaf on purpose: the config module (raidCustomRows),
// the evaluator and engine/combat all match the same way, and none of them may pull the others in.

// The "any add" term: everything alive EXCEPT the fight's own boss. Only 7 of the 65 shipped raid
// fights name their adds, so a row that waited for that list was hidden on the other 58.
export function killOrderAnyAddOf(bossEntry: number): number {
  return -Math.abs(bossEntry | 0);
}

// "A charmed body of my own side" — the one term that can never be a creature entry, since the body
// is an ally seat. ZERO is free: entry matching already refuses everything at or below 0.
export const KILL_ORDER_CHARMED_ALLY = 0;

// Does the charmed-ally term take this body? Booleans rather than a Fighter, because this leaf may
// not import the engine and because two callers must not answer it differently.
export function killOrderTakesCharmed(
  orderEntry: number,
  bodyIsCharmed: boolean,
  bodyIsOnMyNativeSide: boolean,
): boolean {
  return (orderEntry | 0) === KILL_ORDER_CHARMED_ALLY && bodyIsCharmed && bodyIsOnMyNativeSide;
}

// Does this order term take that creature? creature_template.entry is a positive uint32, so a NEGATIVE term
// is free to mean "anything but this entry".
export function killOrderEntryMatches(orderEntry: number, creatureEntry: number): boolean {
  const e = creatureEntry | 0;
  if (e <= 0) return false;
  return orderEntry < 0 ? e !== -orderEntry : e === orderEntry;
}
