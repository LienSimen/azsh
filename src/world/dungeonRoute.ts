// DR — route density + pull fusion (PACK-COMBAT-VISION §8b / Phase P1.5).
//
// Three knobs for dungeon runs — never creature HP multipliers:
//   1. RouteDensity  — which packs are route STOPS (bosses | full)
//   2. PullFusion    — how many consecutive route trash atoms aggro together
//   3. Rest          — SquadStrategy careful/aggressive/sip via SQUAD_PACING (domain/bots/squad.ts)
//
// Pure: no DOM, no Date.now, no Math.random (LOCK 4).

import type { EncounterDef, InstanceDef } from '../data/schema.ts';
import type { EncounterPackMember } from '../data/schema.ts';

// ---- Types ------------------------------------------------------------------

/**
 * Which combat pack atoms are route stops (vision §8b.3).
 *
 * `bosses` = `isAlwaysOnRoute` only: bosses, object gates, and the scripted trash that
 * sets or requires a flag. Everything else is still standing on the floor (density
 * removes ZERO mobs from the free-walk world — worldView.ts:580) and still aggroes as
 * the party walks past; it just stops being a route STOP the autopilot must target.
 *
 * `full` = every encounter. No player entry point sets it; it is the "all packs"
 * denominator three run-summary call sites count against (`packsAvailable`) and what
 * makes a finished run say "Dungeon cleared!" instead of "Route cleared!".
 *
 * The corridor model — `normal`/`speedrun`, keeping trash within 39/24 yd of a boss
 * spine — was deleted 2026-08-17. It had zero player entry points (the pace controls
 * came out of worldView and instanceView as inert) and it was the measured defect:
 * `normal` put 235 trash stops on blackrock-depths' 257.
 */
export type RouteDensity = 'full' | 'bosses';

/**
 * How many consecutive route trash atoms merge into one combat (vision §8b.4).
 * `link` = natural CallForHelp only — v1 has no CFH between dungeon atoms, so
 * behaves like `single` (documented; real CFH stays outdoor pack-assist).
 */
export type PullFusion = 'single' | 'link' | 'chain' | 'mayhem';

/** All route-density ids — enterInstance / setInstancePace reject anything else. */
export const ROUTE_DENSITIES: readonly RouteDensity[] = ['full', 'bosses'] as const;

/** All pull-fusion ids — enterInstance / setInstancePace reject anything else. */
export const PULL_FUSIONS: readonly PullFusion[] = ['single', 'link', 'chain', 'mayhem'] as const;

export function isRouteDensity(v: unknown): v is RouteDensity {
  return v === 'full' || v === 'bosses';
}

export function isPullFusion(v: unknown): v is PullFusion {
  return v === 'single' || v === 'link' || v === 'chain' || v === 'mayhem';
}

/**
 * Default: the itinerary is bosses + triggers.
 *
 * `normal` put 235 trash stops on blackrock-depths' 257-stop route, and `isUnlocked`'s
 * sequential prefix then makes every one of them a prerequisite for boss 4 — measured
 * 2026-08-17 with probe-run-trace at band: 3/22 bosses, 8/257 stops, 1,276 yd walked in
 * 2,400 s of run time, ending with `target=230-3fe13518` (a trash pack).
 */
export const DEFAULT_ROUTE_DENSITY: RouteDensity = 'bosses';
export const DEFAULT_PULL_FUSION: PullFusion = 'single';

/**
 * Soft cap on living hostiles in a mayhem fusion batch (primary + pack members).
 * Design constant (vision §8b.4) — grow consecutive trash until next pack would
 * push the sum over this cap; a single atom larger than the cap still fights alone.
 */
export const MAYHEM_SOFT_CAP = 10;

/** One fusion combat: ordered encounter ids fought / cleared together. */
export interface FusionBatch {
  /** Encounter ids in route order; first is the "primary" pull id. */
  encounterIds: string[];
}

// ---- Always-on route (never density-skipped) --------------------------------

// Bosses, flag-gated scripted trash, object gates, and multi-phase event pulls always stay on every route
// (vision §8b.3 — required progress).
export function isAlwaysOnRoute(enc: EncounterDef): boolean {
  if (enc.kind === 'boss') return true;
  for (const ev of enc.events ?? []) {
    switch (ev.kind) {
      case 'requiresFlag':
      case 'objectGate':
      case 'onDeathSummon':
      case 'setsFlag':
      case 'waves':
      case 'hpThreshold':
        return true;
      default:
        break;
    }
  }
  return false;
}

// ---- Combatant counting / pack merge ----------------------------------------

/** Living hostiles in one encounter atom (primary + pack counts). */
export function combatantCount(enc: EncounterDef): number {
  let n = 1;
  for (const m of enc.pack ?? []) {
    if (m.count > 0) n += m.count;
  }
  return n;
}

// Merge consecutive route trash into one pull table for beginEncounter. First encounter supplies primary +
// bossSpells; later atoms append as pack rows.
export function mergeRoutePulls(encs: readonly EncounterDef[]): {
  creatureEntry: number;
  bossSpells?: number[];
  pack?: EncounterPackMember[];
} {
  if (encs.length === 0) {
    throw new Error('mergeRoutePulls: empty encounter list');
  }
  const first = encs[0]!;
  if (encs.length === 1) {
    return {
      creatureEntry: first.creatureEntry,
      bossSpells: first.bossSpells,
      pack: first.pack,
    };
  }
  const pack: EncounterPackMember[] = [];
  for (const m of first.pack ?? []) {
    if (m.count > 0) {
      pack.push({
        creatureEntry: m.creatureEntry,
        count: m.count,
        ...(m.poolCandidates?.length ? { poolCandidates: m.poolCandidates } : {}),
      });
    }
  }
  for (let i = 1; i < encs.length; i++) {
    const e = encs[i]!;
    pack.push({
      creatureEntry: e.creatureEntry,
      count: 1,
      ...(e.poolCandidates?.length ? { poolCandidates: e.poolCandidates } : {}),
    });
    for (const m of e.pack ?? []) {
      if (m.count > 0) {
        pack.push({
          creatureEntry: m.creatureEntry,
          count: m.count,
          ...(m.poolCandidates?.length ? { poolCandidates: m.poolCandidates } : {}),
        });
      }
    }
  }
  return {
    creatureEntry: first.creatureEntry,
    bossSpells: first.bossSpells,
    pack: pack.length ? pack : undefined,
  };
}

// ---- Route density filter ---------------------------------------------------

/**
 * Route stops for a density, preserving InstanceDef relative order. Packs that are not
 * stops are absent from the list — they are never TARGETED, and they are all still on
 * the floor to aggro whoever walks past.
 *
 * Measured 2026-08-17 over the 33 baked instances: `bosses` = 328 stops, `full` = 2,882.
 */
export function selectRouteEncounters(
  def: InstanceDef,
  density: RouteDensity,
): EncounterDef[] {
  if (density === 'full') return [...def.encounters];
  // Bosses + gates + scripted-flag trash. No spine, no corridor — nothing else is a stop.
  return def.encounters.filter(isAlwaysOnRoute);
}

/** Trash-only counts for density comparisons (excludes bosses). */
export function countRouteTrash(encounters: readonly EncounterDef[]): number {
  return encounters.filter((e) => e.kind === 'trash').length;
}

// ---- Pull fusion ------------------------------------------------------------

/**
 * Bosses, flag-gated / object-gate / multi-phase encounters break fusion batches
 * and are never absorbed into a neighboring trash pull (vision §8b.4).
 * `requiresFlag` must break too — otherwise chain/mayhem would pre-pull a
 * scripted patrol before its gate flag is set.
 */
export function isFusionBreak(enc: EncounterDef): boolean {
  if (enc.kind === 'boss') return true;
  for (const ev of enc.events ?? []) {
    if (ev.kind === 'objectGate') return true;
    if (ev.kind === 'requiresFlag') return true;
    if (ev.kind === 'onDeathSummon') return true;
    if (ev.kind === 'waves') return true;
    if (ev.kind === 'hpThreshold') return true;
  }
  return false;
}

// Chain fusion upper atom target (vision §8b.4 "Chain 2–3"). Planner grows consecutive trash up to this
// many atoms.
export const CHAIN_MAX_ATOMS = 3;

function chainMaxAtoms(): number {
  return CHAIN_MAX_ATOMS;
}

/**
 * Optional second gate for fusion growth (PACK_THREAT_BUDGET + MAYHEM_SOFT_CAP
 * threat envelope via packBudget.makeFusionBudgetGuard).
 * Return false to refuse absorbing `next` into `batchSoFar`. First atom is never gated.
 */
export type FusionAbsorbGuard = (
  batchSoFar: readonly EncounterDef[],
  next: EncounterDef,
) => boolean;

/**
 * Plan fusion batches over an ordered **route** encounter list.
 * Only consecutive fusable trash merge; bosses/object-gates open solo batches.
 * Mayhem also stops before exceeding `softCap` hostiles; `canAbsorb` may refuse
 * a merge for threat budget (packBudget.makeFusionBudgetGuard).
 */
export function planFusionBatches(
  route: readonly EncounterDef[],
  fusion: PullFusion,
  softCap: number = MAYHEM_SOFT_CAP,
  canAbsorb?: FusionAbsorbGuard,
): FusionBatch[] {
  // link ≡ single in v1 (no inter-atom CFH data for dungeon packs).
  const mode: PullFusion = fusion === 'link' ? 'single' : fusion;
  const batches: FusionBatch[] = [];
  let i = 0;
  while (i < route.length) {
    const enc = route[i]!;
    if (isFusionBreak(enc) || mode === 'single') {
      batches.push({ encounterIds: [enc.id] });
      i++;
      continue;
    }

    // Fusable trash: grow batch by mode rules.
    const batchEncs: EncounterDef[] = [enc];
    const ids: string[] = [enc.id];
    let hostiles = combatantCount(enc);
    i++;

    const maxAtoms = mode === 'chain' ? chainMaxAtoms() : Number.POSITIVE_INFINITY;

    while (i < route.length && ids.length < maxAtoms) {
      const next = route[i]!;
      if (isFusionBreak(next)) break;
      const add = combatantCount(next);
      if (mode === 'mayhem' && hostiles + add > softCap) break;
      if (canAbsorb && !canAbsorb(batchEncs, next)) break;
      // chain: absorb while under maxAtoms (2–3); mayhem while under softCap + budget
      batchEncs.push(next);
      ids.push(next.id);
      hostiles += add;
      i++;
    }
    batches.push({ encounterIds: ids });
  }
  return batches;
}

// Fusion batch starting at `startId` over remaining uncleared route encounters. Used by beginEncounter /
// auto-run so progress clears the whole batch.
export function fusionBatchFrom(
  route: readonly EncounterDef[],
  startId: string,
  fusion: PullFusion,
  isCleared: (id: string) => boolean,
  softCap: number = MAYHEM_SOFT_CAP,
  canAbsorb?: FusionAbsorbGuard,
): FusionBatch {
  const startIdx = route.findIndex((e) => e.id === startId);
  if (startIdx < 0) return { encounterIds: [startId] };

  const remaining = route.slice(startIdx).filter((e) => !isCleared(e.id));
  if (remaining.length === 0) return { encounterIds: [startId] };
  if (remaining[0]!.id !== startId) {
    // Requested id is cleared or not next — fight it alone.
    return { encounterIds: [startId] };
  }

  const planned = planFusionBatches(remaining, fusion, softCap, canAbsorb);
  return planned[0] ?? { encounterIds: [startId] };
}

// Resolve encounter defs for a fusion batch. Prefer `resolve` (e.g. budget-split run atoms via
// encounterOf(def, id, run)); fall back to static InstanceDef. Drops missing ids.
export function resolveFusionEncounters(
  def: InstanceDef,
  batch: FusionBatch,
  resolve?: (id: string) => EncounterDef | undefined,
): EncounterDef[] {
  const out: EncounterDef[] = [];
  for (const id of batch.encounterIds) {
    const e = resolve?.(id) ?? def.encounters.find((x) => x.id === id);
    if (e) out.push(e);
  }
  return out;
}
