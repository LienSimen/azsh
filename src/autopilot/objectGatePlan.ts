/**
 * Pure decision: when autopilot's step needs unmet `requiresFlag`s, pick the
 * objectGate pin that sets one — or skip when the only pins are `needsItem`.
 * Live floor only; never auto-fires gates the party is not heading for.
 */
import type { InstanceDef } from '../data/schema/encounter.ts';
import { hasFlag, requiredFlags, type InstanceRun } from '../world/instances.ts';
import {
  instanceObjectPins,
  pinDistanceYd,
  type InstanceObjectPin,
} from '../world/instanceObjects.ts';

export type ObjectGatePlan =
  | { kind: 'open' }
  | { kind: 'use'; pin: InstanceObjectPin }
  | { kind: 'needsItem'; pin: InstanceObjectPin }
  | { kind: 'noGate' };

/**
 * For one chosen encounter step: flags already set → open; else nearest ready
 * pin that sets a missing flag; else needsItem (skip — no key); else noGate
 * (flag is kill/orphan sourced, not an object the live floor can use).
 */
export function planObjectGateForStep(
  def: InstanceDef,
  run: InstanceRun,
  encounterId: string,
  party: { x: number; y: number },
  hasItem: (itemEntry: number) => boolean,
): ObjectGatePlan {
  const enc = def.encounters.find((e) => e.id === encounterId);
  if (!enc) return { kind: 'open' };
  const missing = requiredFlags(enc).filter((f) => !hasFlag(run, f));
  if (!missing.length) return { kind: 'open' };

  const pins = instanceObjectPins(def, run, { hasItem }).filter(
    (p) => missing.includes(p.setsFlag) && p.state !== 'used',
  );
  if (!pins.length) return { kind: 'noGate' };

  const ready = pins
    .filter((p) => p.state === 'ready')
    .sort((a, b) => pinDistanceYd(a, party) - pinDistanceYd(b, party));
  if (ready[0]) return { kind: 'use', pin: ready[0] };

  // All matching pins want an item the player lacks — do not walk a dead end.
  const locked = pins
    .filter((p) => p.state === 'needsItem')
    .sort((a, b) => pinDistanceYd(a, party) - pinDistanceYd(b, party));
  if (locked[0]) return { kind: 'needsItem', pin: locked[0] };
  return { kind: 'noGate' };
}
