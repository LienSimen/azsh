// A numbered route pin is a step, not a corridor sample. Arrival is not completion:
// the runner must attack the named body / use the object before the next pin.

import { routeDist } from '../world/routeAuthoring.ts';

/** Living body this close to the pin is "on this step" (chip, not pack origin). */
export const ROUTE_STEP_SNAP_YD = 10;

export type RouteStepPt = { x: number; y: number; z?: number | null };
export type RouteStepKind = 'walk' | 'use';

export function encounterForRouteNode<E extends { id: string; name: string }>(
  n: { name?: string },
  encounters: readonly E[],
): E | undefined {
  if (!n.name) return undefined;
  return encounters.find((e) => e.name === n.name || e.id === n.name);
}

export function routeNodeForEncounter<N extends { name?: string }>(
  nodes: readonly N[],
  enc: { id: string; name: string },
): N | undefined {
  return nodes.find((n) => n.name === enc.name || n.name === enc.id);
}

export function livingOnRouteStep(
  step: RouteStepPt,
  bodies: readonly RouteStepPt[],
  snapYd: number = ROUTE_STEP_SNAP_YD,
): boolean {
  for (const b of bodies) {
    if (routeDist(step, b) <= snapYd) return true;
  }
  return false;
}

// True while this pin still has work. Standing on it is not enough. Named + arrived + no body → false so
// the hunter can walk to the real body.
export function routeStepPending(args: {
  kind: RouteStepKind;
  named?: {
    cleared: boolean;
    skipped?: boolean;
    questBlocked?: boolean;
    sealed?: boolean;
    acted?: boolean;
  } | null;
  useReady?: boolean;
  livingOnStep?: boolean;
  arrived?: boolean;
}): boolean {
  if (args.named) {
    if (
      args.named.cleared
      || args.named.skipped
      || args.named.questBlocked
      || args.named.sealed
      || args.named.acted
    ) {
      return false;
    }
    if (args.livingOnStep) return true;
    if (args.arrived) return false;
    return true;
  }
  if (args.kind === 'use') return args.useReady === true;
  return args.livingOnStep === true;
}
