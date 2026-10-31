// Combat stand distance for the auto-battler, authored on the Rotation and stamped onto the spec at
// pull. The ranged default is the 20–30 design band, not the spell's rangeMax; melee is reach.

import { MIN_AGGRO_DISTANCE } from '../creature/creatureAi.ts';
import { CLASS } from '../../data/schema/constants.ts';

/** Same number as combatGeometry.MELEE_REACH_YD — kept here so domain does not import engine. */
const MELEE_REACH_YD = MIN_AGGRO_DISTANCE;
/** Contact band (reach 5 + park 0.5 + 2) — inMelee is not a 5.5 knife-edge. */
export const IN_MELEE_YD = MIN_AGGRO_DISTANCE + 2.5;

export const STAND_YARDS_AUTO = 0;
export const STAND_YARDS_MIN = 5;
export const STAND_YARDS_MAX = 40;
export const RANGED_STAND_MIN_YD = 20;
export const RANGED_STAND_MAX_YD = 30;
export const RANGED_STAND_DEFAULT_YD = 25;

/** Presets in the rotation editor (plus Auto). */
export const STAND_YARD_OPTIONS = [5, 8, 10, 15, 20, 25, 30, 35, 40] as const;

/** After-cast step-back presets (yards). 0 = off. */
export const STEP_BACK_YARD_OPTIONS = [3, 5, 8, 10, 15, 20] as const;

const PURE_CASTER = new Set<number>([CLASS.PRIEST, CLASS.MAGE, CLASS.WARLOCK]);

/** Talent-tree / pack keys whose plan is to stand at range. */
const RANGED_SPEC = new Set([
  'elemental', 'balance', 'shadow',
  'affliction', 'demonology', 'destruction',
  'frost', 'fire', 'arcane',
  'marksmanship', 'survival', 'beast mastery',
  'holy',
]);

/** Talent-tree / pack keys whose plan is to stand in melee. */
const MELEE_SPEC = new Set([
  'enhancement', 'feral', 'feral combat', 'feral tank',
  'retribution', 'arms', 'fury', 'protection',
  'assassination', 'combat', 'subtlety',
]);

function specKey(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
}

function specIn(name: string, set: ReadonlySet<string>): boolean {
  const k = specKey(name);
  if (!k) return false;
  if (set.has(k)) return true;
  for (const s of set) {
    if (k === s || k.startsWith(`${s} `) || k.endsWith(` ${s}`)) return true;
  }
  return false;
}

function clampStand(yd: number): number {
  return Math.max(STAND_YARDS_MIN, Math.min(STAND_YARDS_MAX, Math.round(yd)));
}

/** Park in the 20–30 ranged band, never past the kit's actual reach. */
export function rangedStandYards(offenseYd: number): number {
  const reach = offenseYd > 0 ? offenseYd : RANGED_STAND_DEFAULT_YD;
  // Judgement 10 must not inflate to RANGED_STAND_MIN 20 (KI-1046 Holy park past reach).
  if (reach < RANGED_STAND_MIN_YD) return clampStand(reach);
  const prefer = Math.min(reach, RANGED_STAND_DEFAULT_YD);
  return clampStand(Math.max(RANGED_STAND_MIN_YD, Math.min(RANGED_STAND_MAX_YD, prefer)));
}

export function isRangedStandSpec(specName: string | null | undefined): boolean {
  return specIn(specName ?? '', RANGED_SPEC);
}

export function isMeleeStandSpec(specName: string | null | undefined): boolean {
  return specIn(specName ?? '', MELEE_SPEC);
}

export interface StandYardsInput {
  /** Rotation.standYards: 0 / omitted = auto. */
  explicit?: number | null;
  classId?: number;
  groupRole?: 'tank' | 'healer' | 'damage';
  rangedAuto?: boolean;
  specName?: string | null;
  /** Longest ranged-offense rangeMax, or first offensive rotation spell. */
  offenseYd?: number | null;
}

// Yards this unit should hold from its focus. Product specs stamp this once at pull. Motion closes to this
// number and stops. It does not walk back to it.
export function resolveStandYards(opts: StandYardsInput): number {
  const explicit = opts.explicit ?? 0;
  if (explicit >= STAND_YARDS_MIN) return clampStand(explicit);

  if (opts.groupRole === 'tank') return MELEE_REACH_YD;
  // Paladin trees melee with seals. 'holy' in RANGED_SPEC is the priest park (KI-1046).
  if (opts.classId === CLASS.PALADIN) return MELEE_REACH_YD;
  if (opts.rangedAuto) return rangedStandYards(opts.offenseYd ?? 0);
  if (opts.groupRole === 'healer') return rangedStandYards(opts.offenseYd ?? 0);
  if (opts.classId != null && PURE_CASTER.has(opts.classId)) {
    return rangedStandYards(opts.offenseYd ?? 0);
  }
  if (isRangedStandSpec(opts.specName)) return rangedStandYards(opts.offenseYd ?? 0);
  if (isMeleeStandSpec(opts.specName)) return MELEE_REACH_YD;

  // Unknown spec: a 30 yd bolt is a caster plan; Earth Shock 20 is not.
  const offense = opts.offenseYd ?? 0;
  if (offense >= 25) return rangedStandYards(offense);
  return MELEE_REACH_YD;
}

export function wantsMeleeStand(standYards: number): boolean {
  return standYards <= MELEE_REACH_YD + 1;
}

export function sanitizeStandYards(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const n = Math.round(raw);
  if (n <= 0) return undefined;
  return clampStand(n);
}

/** Stamp the resolved stand onto a combat spec (player / companion pull). */
export function stampStandYards(
  spec: { standYards?: number; groupRole?: 'tank' | 'healer' | 'damage'; rangedAuto?: boolean; classId?: number; spells?: readonly { rangeMax?: number | null }[] },
  opts: { explicit?: number | null; specName?: string | null; offenseYd?: number | null },
): void {
  spec.standYards = resolveStandYards({
    explicit: opts.explicit,
    classId: spec.classId,
    groupRole: spec.groupRole,
    rangedAuto: spec.rangedAuto,
    specName: opts.specName,
    offenseYd: opts.offenseYd,
  });
}

export function sanitizeStepBackYd(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const n = Math.round(raw);
  if (n <= 0) return undefined;
  return Math.max(1, Math.min(STAND_YARDS_MAX, n));
}
