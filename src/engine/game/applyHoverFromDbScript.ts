// SET_HOVER host — persist hover on the creature source + matching live bodies. Cite:
// ScriptMgr.cpp:2847–2864 SetHover(fly); Unit.cpp:12428–12438; Unit.h:1788.

import { setHover } from '../../domain/core/hover.ts';

/** Ratchet kind — product host must name it outside interpreter/dbscript/. */
const SET_HOVER = 'set_hover';

export type HoverIntent = {
  kind: string;
  hover?: boolean;
};

export type HoverSource = {
  kind?: string;
  hovering?: boolean;
  movementFlags?: number;
  entry?: number;
  dbGuid?: number;
};

export type HoverWorldBag = {
  source?: HoverSource | null;
  hoverChanges?: Array<{ hover: boolean }>;
};

export type HoverBag = {
  hover: boolean;
  entry?: number;
  dbGuid?: number;
};

/** Live floor / temp body the host can stamp. */
export type HoverBody = {
  entry?: number;
  dbGuid?: number;
  guid?: number;
  hovering?: boolean;
  movementFlags?: number;
};

function stampHover(target: HoverSource | HoverBody, hover: boolean): void {
  target.hovering = hover;
  target.movementFlags = setHover(target.movementFlags ?? 0, hover);
}

/** Collect SET_HOVER. Player sources skipped (C++ LogIfNotCreature). Cite: ScriptMgr.cpp:2847–2864. */
export function collectHover(
  world: HoverWorldBag | undefined,
  intents?: readonly HoverIntent[],
): HoverBag | null {
  const source = world?.source;
  if (source?.kind === 'player') return null;

  let hover: boolean | undefined;
  // Filter so the kind string literal stays in this product host file (unhosted ratchet).
  for (const i of (intents ?? []).filter((x) => x.kind === SET_HOVER)) {
    if (typeof i.hover === 'boolean') hover = i.hover;
  }
  const bag = world?.hoverChanges ?? [];
  if (hover === undefined && bag.length) hover = bag[bag.length - 1]!.hover;
  if (hover === undefined && typeof source?.hovering === 'boolean') {
    hover = source.hovering;
  }
  if (hover === undefined) return null;
  return {
    hover,
    entry: source?.entry,
    dbGuid: source?.dbGuid,
  };
}

/** Stamp source + matching live bodies (entry / dbGuid). */
export function applyHover(
  bag: HoverBag | null,
  opts?: {
    source?: HoverSource | null;
    bodies?: Array<HoverBody | null | undefined> | null;
  },
): void {
  if (!bag) return;
  if (opts?.source && opts.source.kind !== 'player') {
    stampHover(opts.source, bag.hover);
  }
  for (const body of opts?.bodies ?? []) {
    if (!body) continue;
    const byEntry = bag.entry != null && body.entry === bag.entry;
    const byGuid =
      bag.dbGuid != null
      && (body.dbGuid === bag.dbGuid || body.guid === bag.dbGuid);
    if (byEntry || byGuid) stampHover(body, bag.hover);
  }
}

/** Collect + apply in one call (quest / gossip / movement hosts). */
export function applyHoverFromDbScript(
  world: HoverWorldBag | undefined,
  intents?: readonly HoverIntent[],
  opts?: {
    source?: HoverSource | null;
    bodies?: Array<HoverBody | null | undefined> | null;
  },
): HoverBag | null {
  const bag = collectHover(world, intents);
  applyHover(bag, {
    source: opts?.source ?? world?.source ?? null,
    bodies: opts?.bodies,
  });
  return bag;
}
