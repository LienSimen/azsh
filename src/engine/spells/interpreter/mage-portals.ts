// Mage capital Portals summon a gameobject the party clicks, and carry no target position rows. Solo,
// casting one is the same journey as the twin city teleport, so those destinations are reused.

/** Portal castable id → twin Teleport: City id (same capital). */
export const MAGE_PORTAL_TWIN_TELEPORT: Readonly<Record<number, number>> = {
  10059: 3561, // Portal: Stormwind → Teleport: Stormwind
  11416: 3562, // Portal: Ironforge → Teleport: Ironforge
  11417: 3567, // Portal: Orgrimmar → Teleport: Orgrimmar
  11418: 3563, // Portal: Undercity → Teleport: Undercity
  11419: 3565, // Portal: Darnassus → Teleport: Darnassus
  11420: 3566, // Portal: Thunder Bluff → Teleport: Thunder Bluff
};

/** EffectMiscValue GO entries for the six capital portals. Cite: spell_template. */
export const MAGE_PORTAL_GO_ENTRIES: ReadonlySet<number> = new Set([
  176296, // Stormwind
  176497, // Ironforge
  176498, // Darnassus
  176499, // Orgrimmar
  176500, // Thunder Bluff
  176501, // Undercity
]);

export const MAGE_PORTAL_SPELL_IDS: ReadonlySet<number> = new Set(
  Object.keys(MAGE_PORTAL_TWIN_TELEPORT).map((k) => Number(k)),
);

/** Rune of Portals. Cite: spell_template Reagent1 on 10059/11416–11420. */
export const RUNE_OF_PORTALS = 17032;

export function isMagePortalSpell(spellId: number): boolean {
  return MAGE_PORTAL_SPELL_IDS.has(spellId | 0);
}

export function isMagePortalGo(goEntry: number): boolean {
  return MAGE_PORTAL_GO_ENTRIES.has(goEntry | 0);
}
