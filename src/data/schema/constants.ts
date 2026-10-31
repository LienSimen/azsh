/** Named form ids used by the engine (sourced from CMaNGOS SpellDefines.h ShapeshiftForm). */
export const SHAPESHIFT_FORM = {
  NONE: 0,
  CAT: 1,
  TREE: 2,
  TRAVEL: 3,
  AQUA: 4,
  BEAR: 5,
  DIREBEAR: 8,
  /** Shaman Ghost Wolf (FORM_GHOSTWOLF = 16). Mobility form; does not page the main action bar. */
  GHOSTWOLF: 16,
  /** Warrior stances — STANCE flag in SpellShapeshiftForm; not "real" shapeshift for NOT_SHAPESHIFT. */
  BATTLESTANCE: 17,
  DEFENSIVESTANCE: 18,
  BERSERKERSTANCE: 19,
  /** Priest Shadowform (FORM_SHADOWFORM = 28). Mana form; Holy kit leaves form then casts. */
  SHADOWFORM: 28,
  /** Rogue Stealth / Vanish aura shapeshift (FORM_STEALTH). Not a power-type switch. */
  STEALTH: 30,
  MOONKIN: 31,
} as const;

// CMaNGOS `CreatureEliteType` (SharedDefines.h). Rank drives `_GetHealthMod` / `_GetDamageMod` config rates
// (classic defaults all 1.0 — World.cpp Rate.Creature.*).
export const CREATURE_ELITE = {
  NORMAL: 0,
  ELITE: 1,
  RAREELITE: 2,
  WORLDBOSS: 3,
  RARE: 4,
} as const;

// ---- Shared class/race id constants (values, not TS enums) ----------------

export const RACE = {
  HUMAN: 1, ORC: 2, DWARF: 3, NIGHTELF: 4, UNDEAD: 5, TAUREN: 6, GNOME: 7, TROLL: 8,
} as const;
export const CLASS = {
  WARRIOR: 1, PALADIN: 2, HUNTER: 3, ROGUE: 4, PRIEST: 5,
  SHAMAN: 7, MAGE: 8, WARLOCK: 9, DRUID: 11,
} as const;
// CMaNGOS CreatureType, baked onto CreatureDef.creatureType and driving CC immunity. Distinct from
// RACE: a player Undead is RACE.UNDEAD=5 but maps to CREATURE_TYPE.UNDEAD=6 for immunity checks.
export const CREATURE_TYPE = {
  BEAST: 1, DRAGONKIN: 2, DEMON: 3, ELEMENTAL: 4, GIANT: 5,
  UNDEAD: 6, HUMANOID: 7, CRITTER: 8, MECHANICAL: 9, NOT_SPECIFIED: 10,
  // Cite: SharedDefines.h:1151 CREATURE_TYPE_TOTEM — a killed totem pays no XP (Formulas.h:368).
  TOTEM: 11,
} as const;
