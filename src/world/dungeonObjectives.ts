/**
 * Objectives: the short list of things a player actually navigates to inside an instance.
 *
 * The atlas map used to pin every route atom, and 2,608 of the 2,882 encounters across the
 * 33 instances are plain trash pulls (census 2026-08-21) — 90.5% of them, each one a
 * clickable destination. That made the pre-run map a field of identical dots and made the
 * walked route a pack-to-pack tour: BRD's boss 4 sat behind 235 trash stops
 * (instances.ts:530). A pull is something you FIGHT when you walk into it; the floor
 * already spawns from `dungeonSpawns` and aggro already works, so trash needs no pin and
 * no itinerary step.
 *
 * An objective is an encounter that answers "where am I going": a boss, a rare, an object,
 * the entrance/exit, or a trash pack that carries a MECHANIC — it opens a door, or a quest
 * starts it. Everything else is population.
 */
import type { EncounterDef, InstanceDef } from '../data/schema.ts';
import {
  flagsSetByEncounter,
  hasFlag,
  isCleared,
  objectGateEvents,
  requiredFlags,
  routeEncounterList,
  type InstanceRun,
} from './instances.ts';
import { routeItemSources } from './dungeonRouteOrder.ts';

/**
 * Does this encounter earn a pin and a route step?
 *
 * Kind alone is not the test: `trashFromClusters` stamps every cluster `kind: 'trash'`,
 * and 36 of those rows carry a `setsFlag` that a door reads (UBRS's seven rune-room packs,
 * Stratholme's 13 ziggurat/gate packs). Those are objectives; their 2,572 siblings are not.
 */
export function isObjectiveEncounter(enc: EncounterDef): boolean {
  if (enc.kind !== 'trash') return true;
  if (enc.startQuestId) return true;
  // PROVIDES, never merely GATED. Deadmines stamps `requiresFlag: iron-clad-door` on the
  // 20 ship packs behind the cannon door; a pack behind a door is still a pack, and pinning
  // them put two thirds of that map's objectives back on the map. Only the thing that OPENS
  // the door (the cannon, UBRS's rune packs, Stratholme's ziggurats) is a destination.
  if (flagsSetByEncounter(enc).length > 0) return true;
  return false;
}

/**
 * Memo for the two hot reads. The live map rebuilds its model at 10 Hz and the uncached
 * pair costs 0.635 ms on naxxramas (277 encounters) — 6% of a 100 ms frame before the 4x
 * sim multiplier. Keyed on the run OBJECT plus its two monotone counters: `defeated` and
 * `flags` only ever grow inside a run (markDefeated / setFlag push; resetRun hands back a
 * fresh object), and a re-ordered route keeps its length so the ends are keyed too.
 */
type ObjectiveMemo = {
  key: string;
  list: EncounterDef[];
  ids: Set<string>;
  /** Itineraries by target id ('' = no target). Cleared with the rest of the entry. */
  plans: Map<string, EncounterDef[]>;
};
const memo = new WeakMap<InstanceRun, ObjectiveMemo>();

function objectiveMemo(def: InstanceDef, run: InstanceRun): ObjectiveMemo {
  const ids = run.routeEncounterIds;
  const key = `${def.id}|${run.defeated.length}|${run.flags?.length ?? 0}`
    + `|${ids?.length ?? 0}|${ids?.[0] ?? ''}|${ids?.[ids.length - 1] ?? ''}`;
  const hit = memo.get(run);
  if (hit && hit.key === key) return hit;
  const list = routeEncounterList(def, run).filter(isObjectiveEncounter);
  const next: ObjectiveMemo = {
    key, list, ids: new Set(list.map((e) => e.id)), plans: new Map(),
  };
  memo.set(run, next);
  return next;
}

/** Objectives on the active route, in route order. Memoised — treat as read-only. */
export function objectiveEncounters(
  def: InstanceDef,
  run: InstanceRun,
): readonly EncounterDef[] {
  return objectiveMemo(def, run).list;
}

/** Ids of the objectives on the active route (pin/click filter). */
export function objectiveEncounterIds(def: InstanceDef, run: InstanceRun): ReadonlySet<string> {
  return objectiveMemo(def, run).ids;
}

// Encounters that could satisfy `flag`, cheapest-intent first: an encounter whose clear stamps it, or one
// hosting the objectGate that stamps it. Cleared ones are dropped — a satisfied prerequisite is not a stop.
function providersForFlag(
  def: InstanceDef,
  run: InstanceRun,
  flag: string,
): EncounterDef[] {
  const out: EncounterDef[] = [];
  for (const enc of def.encounters) {
    if (isCleared(run, enc.id)) continue;
    if (!flagsSetByEncounter(enc).includes(flag)) continue;
    out.push(enc);
  }
  return out;
}

// Encounters that drop the key an objectGate wants, when the key drops INSIDE. `routeItemSources` is empty
// for outside keys (Seal of Ascension) — those are the player's problem before the run, not a stop on it.
function keySourcesFor(
  def: InstanceDef,
  run: InstanceRun,
  enc: EncounterDef,
  flag: string,
): EncounterDef[] {
  const out: EncounterDef[] = [];
  for (const gate of objectGateEvents(enc)) {
    if (gate.setsFlag !== flag || gate.requiredItem == null) continue;
    for (const id of routeItemSources(def.id, gate.requiredItem)) {
      if (isCleared(run, id)) continue;
      const src = def.encounters.find((e) => e.id === id);
      if (src) out.push(src);
    }
  }
  return out;
}

/**
 * Everything that must happen before `targetId` is engageable, then the target itself.
 *
 * "Pick the last boss and the route does the required tasks" is this function: walk the
 * `requiresFlag` graph backwards from the target, and for every flag the run does not
 * hold yet, put the encounter that stamps it (and the pack that drops its key) on the
 * itinerary FIRST. Post-order, so an opener always precedes what it opens.
 *
 * Returns `[]` when the target is not in the def. Already-satisfied flags contribute
 * nothing, so a second run of the same target after the doors are open is one stop.
 */
export function objectiveChainFor(
  def: InstanceDef,
  run: InstanceRun,
  targetId: string,
): EncounterDef[] {
  const target = def.encounters.find((e) => e.id === targetId)
    ?? routeEncounterList(def, run).find((e) => e.id === targetId);
  if (!target) return [];
  const chain: EncounterDef[] = [];
  const placed = new Set<string>();
  const walking = new Set<string>();

  const visit = (enc: EncounterDef): void => {
    if (placed.has(enc.id) || walking.has(enc.id)) return;
    walking.add(enc.id);
    for (const flag of requiredFlags(enc)) {
      if (hasFlag(run, flag)) continue;
      for (const opener of providersForFlag(def, run, flag)) {
        for (const key of keySourcesFor(def, run, opener, flag)) visit(key);
        visit(opener);
      }
    }
    walking.delete(enc.id);
    if (placed.has(enc.id)) return;
    placed.add(enc.id);
    chain.push(enc);
  };

  visit(target);
  return chain;
}

/**
 * Objectives to clear on the way to `targetId`, in walk order.
 *
 * The chain above is the REQUIRED set. This is the itinerary: the required set plus any
 * objective the route already puts before the target, so picking the last boss still
 * clears the bosses in front of it rather than teleport-skipping to the end. Cleared
 * stops are dropped. `targetId` null ⇒ every remaining objective.
 *
 * Memoised per (run, target) — treat the array as read-only.
 */
export function objectiveItinerary(
  def: InstanceDef,
  run: InstanceRun,
  targetId: string | null,
): readonly EncounterDef[] {
  const cached = objectiveMemo(def, run);
  const planKey = targetId ?? '';
  const hit = cached.plans.get(planKey);
  if (hit) return hit;
  const plan = buildObjectiveItinerary(def, run, targetId);
  cached.plans.set(planKey, plan);
  return plan;
}

function buildObjectiveItinerary(
  def: InstanceDef,
  run: InstanceRun,
  targetId: string | null,
): EncounterDef[] {
  const route = objectiveEncounters(def, run).filter((e) => !isCleared(run, e.id));
  if (!targetId) return route;
  const cut = route.findIndex((e) => e.id === targetId);
  const chain = objectiveChainFor(def, run, targetId);
  const requiredIds = new Set(chain.map((e) => e.id));
  // Two things get a PIN but not an itinerary step unless the run genuinely needs them:
  //   - an optional boss is not a DESTINATION (liveAutopilot.ts nextAutoBossId) — a route
  //     aimed at Drakkisath must not detour to Jed Runewatcher;
  //   - quest-started side content is not on the default plan (routeEdit.ts seedRouteFromPlan
  //     says the same for Commander Gor'shak) — the party must not walk to a fight only an
  //     accepted quest starts.
  // Either stays when the prerequisite walk asked for it (DM North's Guard Mol'dar drops the
  // Inner Door key and is optional).
  const prefix = (cut >= 0 ? route.slice(0, cut + 1) : [])
    .filter((e) => e.id === targetId
      || requiredIds.has(e.id)
      || (!e.optional && !e.startQuestId));
  const out: EncounterDef[] = [];
  const seen = new Set<string>();
  // Required openers that the route order puts AFTER the target still come first —
  // a door you have not opened is not optional because it is further down the list.
  for (const enc of chain) {
    if (enc.id === targetId) continue;
    if (prefix.some((p) => p.id === enc.id)) continue;
    seen.add(enc.id);
    out.push(enc);
  }
  for (const enc of prefix) {
    if (seen.has(enc.id)) continue;
    seen.add(enc.id);
    out.push(enc);
  }
  if (cut < 0 && !seen.has(targetId)) {
    const t = def.encounters.find((e) => e.id === targetId);
    if (t) out.push(t);
  }
  return out;
}
