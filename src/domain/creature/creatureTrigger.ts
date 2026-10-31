// Technical trigger creatures — script anchors with no combat body, classified off
// creature_template.UnitFlags. Spawn flags are no verdict: callers exempt entries a def authors.

import { isScriptAnchorCreature, type UnitFlagsBearer } from './unitFlags.ts';

// True when this template is a script anchor at spawn: unattackable AND unable to start a fight.
// Never give one a nameplate or a trash slot unless an instance def authors it. Fails open.
export function isTechnicalTriggerCreature(creature: UnitFlagsBearer): boolean {
  return isScriptAnchorCreature(creature);
}

// Dungeon-spawned script anchors as ENTRY IDS, for callers with no DataStore. DERIVED, never
// hand-picked, and the trigger-packs gate recomputes the set and fails on drift either way.
export const TECHNICAL_TRIGGER_ENTRIES: ReadonlySet<number> = new Set<number>([
  8662, // Idol Oven Fire Target
  8982, // Ironhand Guardian
  10415, // Ash'ari Crystal
  12434, // Monster Generator (Blackwing)
  12758, // Onyxia Trigger
  12999, // Blackwing Trigger
  13876, // Mekgineer Trigger
  13916, // Dire Maul Crystal Totem
  13976, // Tortured Drake
  14449, // Blackwing Orb Trigger
  14459, // Nefarian's Troops
  14646, // Stratholme Trigger
  14758, // Zul'Gurub Trigger
  15091, // Zul'Gurub Panther Trigger
  15384, // World Trigger
  15426, // Ahn'Qiraj Trigger
  15590, // Ossirian Crystal Trigger
  15695, // Vek Twins Trigger
  15800, // Exit Trigger
  15896, // C'Thun Portal
  15957, // Ouro Spawner
  16044, // Mor Grayhoof Trigger
  16045, // Isalien Trigger
  16046, // Jarien and Sothos Trigger
  16047, // Kormok Trigger
  16048, // Lord Valthalak Trigger
  16079, // Theldren Trigger
  16082, // Naxxramas Trigger
  16100, // Ysida's Trigger
  16137, // Naxxramas Military Sub-Boss Trigger
  16211, // Naxxramas Combat Dummy
  16218, // Tesla Coil
  16400, // Toxic Tunnel
  16604, // Blackwing Spell Marker
  16980, // The Lich King
  17231, // Garden Gas
  17286, // Invisible Man
  17293, // Plague Wave
]);
