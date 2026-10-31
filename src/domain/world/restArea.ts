// Rest-area classification — tavern or capital city — for ComputeRest. Capitals come from the baked
// capital flag. Our proxy for leaving the inn box is leaving the zone, since there are no sub-volumes.

export type RestType = 'city' | 'tavern' | 'none';

export type TavernTriggerRef = { id: number; name?: string; zone?: string };

/** Derive the capital zone-id set from baked zones (ZoneDef.capital ← AREA_FLAG_CAPITAL). */
export function capitalZoneIds(
  zones: ReadonlyArray<{ id: string; capital?: boolean }>,
): Set<string> {
  const out = new Set<string>();
  for (const z of zones) {
    if (z.capital) out.add(z.id);
  }
  return out;
}

// Classify rest for a zone: CITY when it is a capital, else TAVERN when a tavern trigger is attributed
// to it, else none. A capital with tavern rows stays CITY — the core does not overwrite city rest.
export function restTypeForZone(
  zoneId: string,
  tavernTriggers: readonly TavernTriggerRef[],
  capitals: ReadonlySet<string> | readonly string[],
): RestType {
  const capitalSet = capitals instanceof Set ? capitals : new Set(capitals);
  if (capitalSet.has(zoneId)) return 'city';
  for (const t of tavernTriggers) {
    if (t.zone === zoneId) return 'tavern';
  }
  return 'none';
}

/** True when rest type is CITY or TAVERN (ComputeRest isCityOrInn). */
export function isCityOrInnRest(restType: RestType): boolean {
  return restType === 'city' || restType === 'tavern';
}
