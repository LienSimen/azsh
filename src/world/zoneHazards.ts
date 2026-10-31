/**
 * Zone → environmental hazard flags registry.
 *
 * Design gate: hazards are OFF by default everywhere so autofarm never
 * surprise-kills. Which zones are wet/lava is authoring — do not invent lists.
 *
 * Cite: docs/cmangos_mapping/misc/environmental-damage-mirror-timers.md
 *   Recommendations — model hazards as sub-area flags; portable core is the
 *   timer state machine in domain/world/hazards.ts.
 */

import type { HazardFlags } from '../domain/world/hazards.ts';

// Committed defaults: empty. No real zone is underwater/magma/highSea until explicitly authored later.
// Never pre-flag elwynn, searing-gorge, etc.
const ZONE_HAZARDS: Readonly<Record<string, HazardFlags>> = Object.freeze({});

// Hazard flags for a zone id. Always returns a plain object; unknown zones and all known zones currently
// resolve to no flags.
export function hazardsForZone(zoneId: string): HazardFlags {
  const flags = ZONE_HAZARDS[zoneId];
  return flags ? { ...flags } : {};
}

/** True if the registry has any non-empty entry (always false until authored). */
export function zoneHazardRegistryIsEmpty(): boolean {
  return Object.keys(ZONE_HAZARDS).length === 0;
}

/**
 * Autofarm / map tint for a zone's hazard flags (J-wiring item 6).
 * Always `'none'` while the registry is empty — no surprise deaths, no false tints.
 * Priority when multiple flags authored: magma > underwater > highSea.
 */
export type HazardZoneColor = 'none' | 'water' | 'lava' | 'high_sea';

export function hazardColorForFlags(flags: HazardFlags): HazardZoneColor {
  if (flags.magma) return 'lava';
  if (flags.underwater) return 'water';
  if (flags.highSea) return 'high_sea';
  return 'none';
}

/** Map tint for a zone id — keys off hazardsForZone (never invents wet/lava lists). */
export function hazardColorForZone(zoneId: string): HazardZoneColor {
  return hazardColorForFlags(hazardsForZone(zoneId));
}
