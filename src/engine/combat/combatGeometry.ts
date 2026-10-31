// Combat geometry — deterministic per-unit yards relative to a pull origin. Low-dimensional, sourced
// and RNG-free, with no continuous pathing. Pairwise distance is planar, as outdoor aggro is.

import type { SpellDef } from '../../data/schema.ts';
import { triggeredIdsOf, type CompanionCandidate } from './triggeredCompanion.ts';
import {
  DEFAULT_DETECTION_RANGE,
  MIN_AGGRO_DISTANCE,
  planarDistance,
} from '../../domain/creature/creatureAi.ts';
import { BASE_CHARGE_SPEED, BASE_RUN_SPEED } from '../../domain/nav/speed.ts';
import { roleOf } from './roles.ts';
import { allySideAt, enemySideAt, type Side } from '../core/events.ts';
import { detHypot, detCos, orbitCos, orbitSin, arcCos, arcSin } from '../core/detMath.ts';
import { STOREY_DZ_YD } from '../../domain/nav/storey.ts';

export { BASE_CHARGE_SPEED, BASE_RUN_SPEED, MIN_AGGRO_DISTANCE };

// The melee white-swing gate AND the gap-close STOP band — the reach, never a seed open distance.
// The same number as the aggro minimum today, but named apart so a seeder cannot open inside it.
export const MELEE_REACH_YD = MIN_AGGRO_DISTANCE;

// Charge / Intercept max yards. Cite: PlayerbotWarriorAI.cpp:175-176 (`fTargetDist > 25.0f`).
export const CHARGE_INTERCEPT_MAX_YD = 25;

// Leeway for in-melee checks against a unit PARKED ON the reach ring: the aim lands movers at exactly
// the reach, so a zero-slack gate read a unit in visual contact as out of reach.
export const MELEE_PARK_SLACK_YD = 0.5;

/** Float ULP guard on the REACH+SLACK park ring (measured 5.500000000000003 vs 5.5). */
export const MELEE_CONTACT_EPS_YD = 0.05;

/** White-swing / melee-spell contact reach = park stop + float guard. */
export const MELEE_CONTACT_YD = MELEE_REACH_YD + MELEE_PARK_SLACK_YD + MELEE_CONTACT_EPS_YD;

// Extra reach a swing gets while BOTH units are running. Cite: ObjectDefines.h:27 MELEE_LEEWAY;
// Unit.cpp:787 CanReachWithMeleeAttack; Spell.cpp:6197-6199 for a melee-range spell.
export const MELEE_LEEWAY_YD = 8 / 3;

// `BASE_MELEERANGE_OFFSET` - the flat term every melee reach carries. Cite: Unit.h:65; Object.cpp:1746-1756
// GetCombinedCombatReach.
export const BASE_MELEERANGE_OFFSET_YD = 1.33;

// A player-sized body's own reach. `creature_model_info.combat_reach` is 1.5 for every player display id
// (49-58 measured), and a creature carries its own on `spec.combatReachYd`.
export const PLAYER_COMBAT_REACH_YD = 1.5;

// GetCombinedCombatReach for melee — own reach plus the victim's plus 1.33, floored at the attack
// distance. Two player-sized bodies floor at 5; Onyxia comes out at 26.2.
export function combinedCombatReachYd(aReachYd?: number, bReachYd?: number): number {
  const a = aReachYd != null && aReachYd > 0 ? aReachYd : PLAYER_COMBAT_REACH_YD;
  const b = bReachYd != null && bReachYd > 0 ? bReachYd : PLAYER_COMBAT_REACH_YD;
  return Math.max(MELEE_REACH_YD, a + b + BASE_MELEERANGE_OFFSET_YD);
}

// The same call with the melee flag FALSE — the two reaches with no offset and no floor. That is the
// form the chase generator's backpedal and fan use: 3.0 where the melee form is 5.
export function combatReachSumYd(aReachYd?: number, bReachYd?: number): number {
  const a = aReachYd != null && aReachYd > 0 ? aReachYd : PLAYER_COMBAT_REACH_YD;
  const b = bReachYd != null && bReachYd > 0 ? bReachYd : PLAYER_COMBAT_REACH_YD;
  return a + b;
}

// Where a melee chase PARKS, which is NOT the ring it swings from: half the combined reach, while
// only the range CHECK uses the whole thing. It also retires the knife edge that made two bosses die.
export const CHASE_RANGE_FACTOR = 0.5;

export function meleeParkYd(aReachYd?: number, bReachYd?: number): number {
  return CHASE_RANGE_FACTOR * combinedCombatReachYd(aReachYd, bReachYd);
}

// Contact reach for one pair, which is what the C++ has and a bare constant cannot be: a mob chasing a
// running target swings with 2.67 yd more reach, which is why a same-speed chase never breaks off.
export function meleeContactYd(
  bothMoving: boolean,
  aReachYd?: number,
  bReachYd?: number,
): number {
  // The park slack and the float eps stay: `sessionChase.ts:245-258` is two measured unkillable
  // bosses decided by one ULP on this ring, and a pair-sized reach does not make that go away.
  const reach = combinedCombatReachYd(aReachYd, bReachYd)
    + MELEE_PARK_SLACK_YD + MELEE_CONTACT_EPS_YD;
  return bothMoving ? reach + MELEE_LEEWAY_YD : reach;
}

// The synthetic seed OPEN band — where bodies stand at t=0 of a pull with no real spawn coords. Never
// the stop band: a melee pull must have yards to walk. Product seeds prefer the per-creature value.
export const DEFAULT_OPEN_YD = DEFAULT_DETECTION_RANGE;

// A combat position in yards from the pull origin. `z` is the unit's floor height in WORLD yards, not
// an offset, and is absent without a nav map — consumers fall back to planar, never assume 0.
export interface CombatPosYd {
  x: number;
  y: number;
  z?: number;
}

/** One owner, in domain/nav/storey.ts, which also says why the reach grade is a different 8. */
export { STOREY_DZ_YD } from '../../domain/nav/storey.ts';

// Are two units on the same floor? An unknown z is true, so a session without a nav map behaves as it
// did when positions were planar. Blackrock Spire has 60.6% of hostile pairs on different storeys.
export function sameStoreyYd(
  a: CombatPosYd | undefined,
  b: CombatPosYd | undefined,
): boolean {
  if (a?.z == null || b?.z == null) return true;
  if (!Number.isFinite(a.z) || !Number.isFinite(b.z)) return true;
  return Math.abs(a.z - b.z) <= STOREY_DZ_YD;
}

// Is planar range honest here? A destination 7–20 yd below is still "in 30 yd" in plan, so casters
// stand and refuse. The tolerance is one mesh step, not a whole storey.
export function planarRangeHonestYd(
  a: CombatPosYd | undefined,
  b: CombatPosYd | undefined,
): boolean {
  if (a?.z == null || b?.z == null) return true;
  if (!Number.isFinite(a.z) || !Number.isFinite(b.z)) return true;
  return Math.abs(a.z - b.z) <= 4;
}

export type UnitPositionsYd = Readonly<Record<string, CombatPosYd>>;

// Which frame a session's offsets live in: world-translated offsets are a pure translation of real
// spawn coordinates and may be drawn on the floorplan; pull-local bearings are not world-true.
export type PullFrame = 'world-translated' | 'pull-local';

export interface PullGeometryAnchor {
  frame: PullFrame;
  /** World anchor of the session's (0,0). Present only on `world-translated`. */
  origin?: { x: number; y: number; z?: number };
  /** Instance map id, when the pull resolved against a known cluster map. */
  mapId?: number;
}

// §7 party back line / "behind tank" — medium band 10–20 / long 20–30. Use 20 yd so radiusYd 8 melee-pile
// AoE cannot reach the healer. Cite: PACK-COMBAT-VISION.md §7.2 party line.
export const PARTY_BACK_LINE_YD = 20;

// §7 caster ring outer bound (long band 20–30). Inner = DEFAULT_DETECTION_RANGE (18). Cite:
// PACK-COMBAT-VISION.md §7.2 "Caster ring ~18–30 yd"; Detection 18.
export const CASTER_RING_OUTER_YD = 30;

// Lateral yard step so co-banded units are not identical points. Stays inside the short band (5–10)
// relative to pile; not a freeform arena offset. Cite: §7 short band; Unit melee cluster.
const LATERAL_STEP_YD = 1;

/** detMath ORBIT_* length — ring-0 slots 0..13 stay on that table (5-man bit-identical). */
const ORBIT_SLOT_COUNT = 14;

/** Back-line units per row (party/subgroup size); row 0 = old single-row lateralY. */
const BACK_LINE_ROW_WIDTH = 5;

/** Depth between ranged-camp rows (2 × lateral step). */
const BACK_LINE_ROW_DEPTH_YD = 2 * LATERAL_STEP_YD;

/** Ranged-arc angular step in π/30 slots (2 → 12°, ≈4 yd apart on the 20 yd band). */
const BACK_LINE_ARC_STEP = 2;

/** Arc positions per band: ±2 … ±14 slots, i.e. the back semicircle to ±84°. */
const BACK_LINE_ARC_SLOTS = 14;

// First raid-camp bearing clear of a default cone. `CONE_HALF_ANGLE_RAD` is π/6 = 30° = 5 π/30 slots, so
// slot 6 (36°) is the first bearing a cone cannot reach.
const RAID_CAMP_MIN_K = 6;

/** Widest raid-camp bearing: 15 π/30 slots = 90°, abreast of the boss. */
const RAID_CAMP_MAX_K = 15;

/** Bearings per camp row: k = 15…6, mirrored left/right. */
const RAID_CAMP_ROW_SLOTS = (RAID_CAMP_MAX_K - RAID_CAMP_MIN_K + 1) * 2;

// Pairwise yards. The same storey, or a missing z, stays planar so a ramp cannot lose melee; another
// floor pays the extra height. Cite: WorldObject::GetDistance is3D; STOREY_DZ_YD.
export function combatDistanceYd(
  a: CombatPosYd | undefined,
  b: CombatPosYd | undefined,
): number | undefined {
  if (a == null || b == null) return undefined;
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
    return undefined;
  }
  const planar = planarDistance(a.x, a.y, b.x, b.y);
  if (a.z == null || b.z == null || !Number.isFinite(a.z) || !Number.isFinite(b.z)) return planar;
  const dz = Math.abs(a.z - b.z);
  if (dz <= STOREY_DZ_YD) return planar;
  return detHypot(planar, dz - STOREY_DZ_YD);
}

// Radius filter for AoE and ground pools. A missing radius or position is always true, since neither
// invents a default; another storey is false; the same floor is planar, because a radius is a disc.
export function isWithinRadiusYd(
  a: CombatPosYd | undefined,
  b: CombatPosYd | undefined,
  radiusYd: number | undefined | null,
): boolean {
  if (radiusYd == null || !(radiusYd > 0)) return true;
  if (a == null || b == null) return true;
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
    return true;
  }
  if (!sameStoreyYd(a, b)) return false;
  return planarDistance(a.x, a.y, b.x, b.y) <= radiusYd;
}

// The spell cast range gate. An unknown distance or a non-positive rangeMax allows. The melee band
// adds contact leeway, the running leeway, and the pair's own combat reach when the caller has it.
export function isInSpellRange(
  distanceYd: number | undefined,
  rangeMax: number | undefined | null,
  rangeMin?: number | undefined | null,
  bothMoving = false,
  aReachYd?: number,
  bReachYd?: number,
): boolean {
  if (distanceYd == null) return true;
  const max = rangeMax ?? 0;
  if (!(max > 0)) return true;
  // Melee-band spells share MELEE_CONTACT_YD with whites (park stop + float eps).
  const reach = max <= MELEE_REACH_YD
    ? meleeContactYd(bothMoving, aReachYd, bReachYd)
    : max;
  if (distanceYd > reach) return false;
  const min = rangeMin ?? 0;
  if (min > 0 && distanceYd < min) return false;
  return true;
}

// A straight-line step toward `to` by at most `stepYd`. With `stopAtDist` set it does not overshoot
// that distance from the destination. No pathfinding, no LOS, deterministic.
export function stepToward(
  from: CombatPosYd,
  to: CombatPosYd,
  stepYd: number,
  stopAtDist?: number,
): CombatPosYd {
  if (!(stepYd > 0)) return { x: from.x, y: from.y };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = detHypot(dx, dy);
  if (!(dist > 0)) return { x: from.x, y: from.y };
  const stop = stopAtDist != null && stopAtDist > 0 ? stopAtDist : 0;
  if (dist <= stop) return { x: from.x, y: from.y };
  const travel = Math.min(stepYd, dist - stop);
  const ux = dx / dist;
  const uy = dy / dist;
  return { x: from.x + ux * travel, y: from.y + uy * travel };
}

// Charge and Intercept landing: melee reach short of the target on the ray between them. The distance
// comes from the live pair at cast, not rangeMax and not a walk destination.
export function chargeLandingPos(from: CombatPosYd, to: CombatPosYd): CombatPosYd {
  const land = stepToward(from, to, 1e9, MELEE_REACH_YD);
  const z = to.z ?? from.z;
  return z != null ? { x: land.x, y: land.y, z } : land;
}

// Yards moved in one fixed combat tick at `speedYdPerSec`. Cite: TUNING.tickMs fixed timestep; Unit.cpp
// base run / BASE_CHARGE_SPEED.
export function moveStepYd(speedYdPerSec: number, tickMs: number): number {
  return speedYdPerSec * (tickMs / 1000);
}

// Missile flight time in ms from planar yards and the spell's own speed. A non-positive speed or
// distance is an instant impact. Cite: spell_template.Speed; Spell.cpp missile delay after cast.
export function missileTravelMs(distanceYd: number, speedYdPerSec: number): number {
  if (!(speedYdPerSec > 0) || !Number.isFinite(speedYdPerSec)) return 0;
  if (!(distanceYd > 0) || !Number.isFinite(distanceYd)) return 0;
  return Math.round((distanceYd / speedYdPerSec) * 1000);
}

// The AoE fan origin for the secondary filter: a pbaoe, a cone or an absent shape fans from the
// caster, while a ground shape fans from the primary target's position.
export function aoeFanFromCaster(aoeShape: 'pbaoe' | 'ground' | 'cone' | undefined): boolean {
  return aoeShape !== 'ground';
}

// EffectImplicitTargetA values whose location IS the caster's own position. Everything else names a
// dest somewhere other than the caster. Cite: SpellTargetDefines.h:22-64.
const CASTER_LOCATION_TARGET_A: ReadonlySet<number> = new Set([1, 7, 15, 18, 22, 24, 30, 33]);

// Fan origin for a live spell: is the area centred on the CASTER or on its target? aoeShape alone
// cannot answer, since 'ground' only means "an area at a dest" and targetA says where that dest is.
export function spellAoeFromCaster(spell: {
  aoeShape?: 'pbaoe' | 'ground' | 'cone';
  rangeMax?: number | null;
  rawEffects?: readonly { targetA?: number }[];
}): boolean {
  if (!((spell.rangeMax ?? 0) > 0)) return true;
  // A pbaoe or a cone is already an area around the caster, and its targetA often names the UNIT the
  // effect picks rather than the centre. Reading targetA there flipped 37 spells the wrong way.
  if (aoeFanFromCaster(spell.aoeShape)) return true;
  for (const e of spell.rawEffects ?? []) {
    const a = e.targetA;
    if (a != null && a > 0) return CASTER_LOCATION_TARGET_A.has(a);
  }
  return false;
}

// Classic's default cone half-angle: GetCone returns 60° when the spell has no SpellCones row, so a
// cone reaches 30° either side of the caster's facing. Cite: Spell.cpp:7585-7591.
export const CONE_HALF_ANGLE_RAD = Math.PI / 6;

// Is `at` inside the caster's cone? The caster faces its current victim, so the arc is measured from
// that bearing. Fails OPEN on a missing coordinate. Modelled as a circle, one breath hit 49 of 49.
export function isWithinConeYd(
  origin: CombatPosYd | undefined,
  facingAt: CombatPosYd | undefined,
  at: CombatPosYd | undefined,
  halfAngleRad: number = CONE_HALF_ANGLE_RAD,
  rear = false,
): boolean {
  if (!origin || !facingAt || !at) return true;
  const fx = facingAt.x - origin.x;
  const fy = facingAt.y - origin.y;
  const tx = at.x - origin.x;
  const ty = at.y - origin.y;
  const fLen = detHypot(fx, fy);
  const tLen = detHypot(tx, ty);
  // Caster standing on its victim has no bearing; a unit on the caster is always hit.
  if (fLen < 1e-6 || tLen < 1e-6) return true;
  const cos = (fx * tx + fy * ty) / (fLen * tLen);
  // angle ≤ half ⇔ cos ≥ cos(half) for half ∈ [0, π]. Default π/6 → ARC k=5 (√3/2).
  const cosHalf = halfAngleRad === CONE_HALF_ANGLE_RAD ? arcCos(5) : detCos(halfAngleRad);
  // A rear cone is the negation of the front test, so the border is STRICT where the front one is
  // inclusive. Cite: Object.cpp:1589-1592; Spell.h:1151-1155.
  if (rear) return cos < -cosHalf;
  return cos >= cosHalf;
}

// spell_cone.ConeDegrees gives the arc one cone test uses. A NEGATIVE angle is not a narrow cone but
// a REAR one, so Tail Sweep sweeps behind the dragon and misses everything in front.
export function coneArcOf(coneDeg: number | null | undefined): {
  halfAngleRad: number;
  rear: boolean;
} {
  if (coneDeg == null || coneDeg === 60) return { halfAngleRad: CONE_HALF_ANGLE_RAD, rear: false };
  const rear = coneDeg < 0;
  const full = (rear ? -coneDeg : coneDeg) * (Math.PI / 180);
  return { halfAngleRad: full / 2, rear };
}

// One cone spell as this module needs to see it: a shape and a signed angle. The kit's DISTINCT arcs
// are what "am I in its breath" asks, since one caster can hold a front cone and a rear one at once.
interface ConeKitSpell {
  /** Needed by the `castable` filter below; absent on a hand-built fixture spell. */
  id?: number;
  aoeShape?: 'pbaoe' | 'ground' | 'cone';
  coneDeg?: number;
  radiusYd?: number;
}
// One wedge a kit can sweep: the arc AND how far it reaches. Both halves are needed — 41 of 129 cone
// spells stop at 10 yd, so an angle alone puts a healer at 30 yd inside a Cleave that cannot reach.
export type ConeArc = { halfAngleRad: number; rear: boolean; radiusYd: number };
const CONE_ARCS_BY_KIT = new WeakMap<readonly ConeKitSpell[], ConeArc[]>();

export function coneArcsOfKit(
  spells: readonly ConeKitSpell[],
  // Ids the creature can actually reach — scheduled, or a triggered payload of one. Absent means
  // every kit spell counts, which is what a fixture wants. 36 creatures published a phantom cone.
  castable?: ReadonlySet<number> | null,
): ConeArc[] {
  // Keyed on the kit ARRAY, like the sibling caches, so a shapeshift misses naturally. Keyed on the
  // array ALONE, which is safe only because the filter is a pure function of that spec.
  const hit = CONE_ARCS_BY_KIT.get(spells);
  if (hit) return hit;
  const seen = new Set<string>();
  const out: ConeArc[] = [];
  for (const s of spells) {
    if (s.aoeShape !== 'cone') continue;
    if (castable && !castable.has((s.id ?? 0) | 0)) continue;
    const deg = s.coneDeg ?? 60;
    // Absent radius is UNBOUNDED, never zero: every baked cone carries one, so a missing value
    // is a fixture, and a fixture must not silently stop being a cone.
    const radiusYd = s.radiusYd ?? Number.POSITIVE_INFINITY;
    const key = `${deg}:${radiusYd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...coneArcOf(s.coneDeg), radiusYd });
  }
  CONE_ARCS_BY_KIT.set(spells, out);
  return out;
}

/** Does this wedge reach `at` — angle AND radius, the pair `isWithinConeYd` deliberately splits. */
export function coneCovers(
  origin: CombatPosYd | undefined,
  facingAt: CombatPosYd | undefined,
  at: CombatPosYd | undefined,
  arc: ConeArc,
): boolean {
  if (!origin || !facingAt || !at) return true;
  const d = combatDistanceYd(origin, at);
  if (d != null && d > arc.radiusYd) return false;
  return isWithinConeYd(origin, facingAt, at, arc.halfAngleRad, arc.rear);
}

// Clearance kept off every arc border, in radians (~11.5 deg). The focus turns with its victim, so a slot
// solved exactly on a cone edge flips in and out as the tank shuffles.
const MELEE_SLOT_MARGIN_RAD = 0.2;

// Where a melee DPS should stand, as a bearing OFFSET from the focus's facing. Two things make the
// front bad: parry and block need the front arc, and a cone sweeps its own wedge.
export function meleeSlotOffsetRad(arcs: readonly ConeArc[]): number {
  const band = meleeSlotBandRad(arcs);
  return band ? band.hi : Math.PI;
}

// The same two bounds as a BAND, so N melee on one boss get N slots. One shared point is not a
// parking place: body separation pushes each arrival off it, and they walk for the whole fight.
export function meleeSlotBandRad(arcs: readonly ConeArc[]): { lo: number; hi: number } | null {
  let frontHalf = 0;
  let rearHalf = 0;
  for (const a of arcs) {
    if (a.rear) rearHalf = Math.max(rearHalf, a.halfAngleRad);
    else frontHalf = Math.max(frontHalf, a.halfAngleRad);
  }
  const lo = Math.max(Math.PI / 2, frontHalf) + MELEE_SLOT_MARGIN_RAD;
  const hi = Math.PI - (rearHalf > 0 ? rearHalf + MELEE_SLOT_MARGIN_RAD : 0);
  return hi >= lo ? { lo, hi } : null;
}

// The band of bearing offsets clearing every wedge that reaches this distance. A front wedge raises
// the floor, a rear one drops the ceiling. Null when they cross — nowhere at that radius is clear.
export function coneClearBandRad(
  arcs: readonly ConeArc[],
  distanceYd: number,
): { lo: number; hi: number } | null {
  let lo = 0;
  let hi = Math.PI;
  for (const a of arcs) {
    if (a.radiusYd < distanceYd) continue; // this wedge cannot reach us where we stand
    if (a.rear) hi = Math.min(hi, Math.PI - a.halfAngleRad - MELEE_SLOT_MARGIN_RAD);
    else lo = Math.max(lo, a.halfAngleRad + MELEE_SLOT_MARGIN_RAD);
  }
  return lo > hi ? null : { lo, hi };
}

// Is this spot one a melee DPS should leave — inside the focus's front half, or inside a wedge its
// kit can sweep? The margin makes it an ENTRY test: without one the moving boundary walks you forever.
export function meleeSlotIsExposed(
  origin: CombatPosYd | undefined,
  facingAt: CombatPosYd | undefined,
  at: CombatPosYd | undefined,
  arcs: readonly ConeArc[],
  marginRad = 0,
): boolean {
  if (!origin || !facingAt || !at) return false;
  // Front HALF, so the same pi arc HasInArc uses — not a cone.
  const half = Math.PI / 2 - marginRad;
  if (half > 0 && isWithinConeYd(origin, facingAt, at, half, false)) return true;
  for (const a of arcs) {
    const ha = a.halfAngleRad - marginRad;
    if (ha <= 0) continue;
    const d = combatDistanceYd(origin, at);
    if (d != null && d > a.radiusYd) continue;
    if (isWithinConeYd(origin, facingAt, at, ha, a.rear)) return true;
  }
  return false;
}

// Outdoor CallForHelp pack layout: the player at the origin, the primary at honest contact yards
// rather than stacked on them, and each helper its reported assist distance further out.
export function seedOutdoorPackPositions(opts: {
  /** Assist distances (yards) in enemy_1.. order — same order as packAssistForPull. */
  helperDistancesYd: readonly number[];
  /**
   * Player-chosen AoE pull mobs (aoePullExtras), seated after the assist helpers. Without these
   * a dialled pull put N mobs in the fight and gave N-1 of them no position, so the stage drew
   * one mob and the player fought a pack it could not see.
   */
  extraDistancesYd?: readonly number[];
  allyCount?: number;
  includePet?: boolean;
  // Contact yards for the primary. Sourced per-creature at the product seam (`getCreatureAttackDistance`);
  // defaults to the Classic detection band so a caller that omits it still never opens on the melee arc.
  primaryOpenYd?: number;
  /** Honoured for the player only inside a raid camp — see `playerTakesBackLine`. */
  playerBackLine?: boolean;
  allyBackLine?: readonly boolean[];
  /** Per-ally group role in ally_0.. order — raid camps give healers the widest bearings. */
  allyRole?: readonly (string | undefined)[];
  playerRole?: string;
}): Record<string, CombatPosYd> {
  const origin: CombatPosYd = { x: 0, y: 0 };
  const openYd = opts.primaryOpenYd != null && opts.primaryOpenYd > 0
    ? opts.primaryOpenYd
    : DEFAULT_OPEN_YD;
  const out: Record<string, CombatPosYd> = {};

  const backSides: string[] = [];
  const backHealer: boolean[] = [];
  let meleePileSlot = 0;
  const placeParty = (side: string, back: boolean, role?: string): void => {
    if (back) {
      backSides.push(side);
      backHealer.push(role === 'healer');
      out[side] = { x: 0, y: 0 }; // key order; overwritten below
      return;
    }
    // Melee pile: lateral y so pet/allies are not stacked on the player origin.
    // hypot(open, 1 yd) ≈ open — walk-in and whites stay intact.
    out[side] = { x: origin.x, y: origin.y + lateralY(meleePileSlot++) };
  };
  const nAllies = opts.allyCount ?? 0;
  const raidCamp = isRaidBackLine(
    backLineCount(opts.playerBackLine, opts.allyBackLine, nAllies),
  );
  placeParty('player', playerTakesBackLine(opts.playerBackLine, raidCamp), opts.playerRole);
  if (opts.includePet) placeParty('pet', false);
  for (let i = 0; i < nAllies; i++) {
    placeParty(allySideAt(i), opts.allyBackLine?.[i] === true, opts.allyRole?.[i]);
  }
  const backSlots = backLineSlots(backHealer, raidCamp);
  for (let i = 0; i < backSides.length; i++) {
    const side = backSides[i]!;
    if (raidCamp) {
      out[side] = raidBackLineCamp(backSlots[i]!, openYd);
      continue;
    }
    const camp = backLineCampOffset(backSlots[i]!);
    out[side] = { x: -PARTY_BACK_LINE_YD + camp.x, y: camp.y };
  }

  out.enemy = { x: openYd, y: 0 };
  for (let i = 0; i < opts.helperDistancesYd.length; i++) {
    const d = opts.helperDistancesYd[i]!;
    // enemy_1 is first helper (primary is index 0 / side 'enemy'); assist distance
    // is measured from the caller, so stack it beyond the primary's station.
    out[enemySideAt(i + 1)] = { x: openYd + d, y: 0 };
  }
  const extras = opts.extraDistancesYd ?? [];
  const afterHelpers = opts.helperDistancesYd.length;
  for (let i = 0; i < extras.length; i++) {
    // Lateral, because a camp of eight can hold two mobs at the same distance and a shared
    // point is one body on the stage. Same step the party melee pile uses.
    out[enemySideAt(afterHelpers + i + 1)] = { x: openYd + extras[i]!, y: lateralY(i + 1) };
  }
  return out;
}

// Pure caster class ids — they stay at cast range even when the staff has real weapon damage. Every
// hybrid, and every creature with a real white swing, closes into melee.
const PURE_CASTER_CLASS_IDS: ReadonlySet<number> = new Set([
  5, // PRIEST
  8, // MAGE
  9, // WARLOCK
]);

// SpellDef.role is the BAKE column and is null for most spells, so live motion resolves it instead.
// Reading the raw field seeded a 39-companion raid's casters into the melee pile.
function kitSpellRole(s: { role?: string | null }): string | null {
  if (s.role != null) return s.role;
  // Structural callers (probes, fixtures) pass {rangeMax, role} without effects.
  return Array.isArray((s as SpellDef).effects) ? roleOf(s as SpellDef) : null;
}

// Whether a kit's MOTION PLAN is close-and-swing or hold at its longest offense range. Shared by
// gap-close and the party seed, so a hybrid cannot seed on the back line and then refuse to walk.
export function kitWantsMeleeBand(opts: {
  /** Hunter bow / wand primary auto — never walk into melee for whites. */
  rangedAuto?: boolean;
  groupRole?: 'tank' | 'healer' | 'damage';
  /** schema CLASS id when known (player / companion). */
  classId?: number;
  /** Main-hand weapon dmgMax — creatures bake melee into this (attackPower often 0). */
  weaponDmgMax?: number;
  // Spells (rangeMax + role). Utility `shoot` does not count as ranged offense when the unit also has a
  // real melee weapon (Warrior Throw must not exile a melee kit).
  spells?: readonly { id?: number; rangeMax?: number | null; role?: string | null }[];
  /** Charge / intercept kit → always wants melee after the gap-close lands. */
  hasCharge?: boolean;
  // Live only: true when a ranged nuke or dot is castable RIGHT NOW. False walks a hybrid with a
  // white swing into melee; undefined is the static seed classification with no live cooldowns.
  hasCastableRangedOffense?: boolean;
  /** Stamped stand yards — when set, this is the motion plan (5 = melee, 20+ = hold). */
  standYards?: number;
  /** Kit ids this unit can reach - scheduled or a payload of one (castableKit.ts). */
  castable?: ReadonlySet<number> | null;
}): boolean {
  if (opts.standYards != null) return opts.standYards <= MIN_AGGRO_DISTANCE + 1;
  if (opts.rangedAuto) return false;
  if (opts.groupRole === 'tank') return true;

  // Pure caster classes hold at cast range (staff white-swings are not the plan).
  if (opts.classId != null && PURE_CASTER_CLASS_IDS.has(opts.classId)) return false;

  const hasRealMelee = (opts.weaponDmgMax ?? 0) > 0;
  // A kit spell the unit cannot REACH is no reason to hold at range. Tested inside the
  // loop below, so nothing is allocated per unit per tick. Cite: castableKit.ts.
  const castable = opts.castable;
  const whiteSwing = (opts.weaponDmgMax ?? 0) > 1;
  let longOffense = 0;
  for (const s of opts.spells ?? []) {
    if (castable && !castable.has((s.id ?? 0) | 0)) continue;
    // Bake `role` is often null — resolve via roleOf when effects exist (kitSpellRole).
    const role = kitSpellRole(s);
    const rangedOffense =
      role === 'nuke' || role === 'dot'
      || (role === 'shoot' && !hasRealMelee);
    if (!rangedOffense) continue;
    const r = s.rangeMax ?? 0;
    if (r > longOffense) longOffense = r;
  }

  if (opts.hasCharge) return true;

  // No long-range offense: close only when there is a real white swing, so paper pins stay put. A
  // healer kit without a bolt lands here too — an unconditional false froze them out of range.
  if (longOffense <= MIN_AGGRO_DISTANCE) return whiteSwing;

  // Healer with a real ranged offense band holds back (resto LB / Wrath / Smite).
  if (opts.groupRole === 'healer') return false;

  // Hybrid player class (shaman / paladin / warrior / …) with a real weapon: always
  // close. Lightning Bolt alone must not exile them to 30 yd.
  if (whiteSwing && opts.classId != null && !PURE_CASTER_CLASS_IDS.has(opts.classId)) {
    return true;
  }
  // A melee-role companion with a white swing stays front even knowing a bolt. The class id is
  // required: a pet stamps the same role, and an Imp's Firebolt must not walk it into the pile.
  if (whiteSwing && opts.groupRole === 'damage' && opts.classId != null) return true;

  // A creature or unclassed hybrid walks into melee when the ranged plan is unavailable. While a
  // ranged cast is still available it holds, so a pure caster keeps casting.
  if (whiteSwing && opts.hasCastableRangedOffense === false) return true;

  // Ranged-nuke kit with cast still available (or static seed with no live CD) → hold.
  return false;
}

// Party unit to back line or melee pile: a healer is always back and a tank always melee, and damage
// is the inverse of the melee-band test. Pets are placed by the caller, not here.
export function isPartyBackLineUnit(opts: {
  groupRole?: 'tank' | 'healer' | 'damage';
  /** Player usually has no groupRole — kit heuristics apply. */
  isPlayer?: boolean;
  rangedAuto?: boolean;
  /** schema CLASS id when known — pure casters (mage/warlock/priest) stay back. */
  classId?: number;
  /** Stamped stand yards — 20+ parks on the back line. */
  standYards?: number;
  /** Main-hand weapon dmgMax — hybrids with a real white-swing stay front. */
  weaponDmgMax?: number;
  // The unit's spells. Back-line classification keys on a PRIMARY ranged offense, not on merely
  // owning a bow: a warrior who knows Throw is melee and must not be exiled to the back line.
  spells?: readonly { rangeMax?: number | null; role?: string | null }[];
}): boolean {
  if (opts.groupRole === 'healer') return true;
  if (opts.groupRole === 'tank') return false;
  if (opts.standYards != null) return opts.standYards > MIN_AGGRO_DISTANCE + 1;
  // Primary ranged auto-attack (hunter in ranged mode / wand caster) → back line.
  if (opts.rangedAuto) return true;
  if (opts.groupRole === 'damage' || opts.isPlayer) {
    // Hybrid / tanky white-swing kits seed front (same plan as live gap-close).
    if (kitWantsMeleeBand({
      rangedAuto: opts.rangedAuto,
      groupRole: opts.groupRole,
      classId: opts.classId,
      weaponDmgMax: opts.weaponDmgMax,
      spells: opts.spells,
    })) {
      return false;
    }
    // Pure ranged offense (nuke/dot only — not Throw/Shoot utility) → back line. Shoot-only without a
    // weapon stays front so a stranded Throw warrior still seeds in the melee pile (#187 sibling).
    return (opts.spells ?? []).some(
      (s) => {
        const role = kitSpellRole(s);
        return (role === 'nuke' || role === 'dot') && (s.rangeMax ?? 0) > MIN_AGGRO_DISTANCE;
      },
    );
  }
  return false;
}

// Two maps, not one keyed on the array alone: the same kit is asked WITH a reachability filter from
// an enemy seat and WITHOUT one elsewhere, and a single key would let the first answer stand for both.
const CASTER_KIT_FILTERED = new WeakMap<object, boolean>();
const CASTER_KIT_RAW = new WeakMap<object, boolean>();

export function isEnemyCasterKit(
  spells: readonly (CompanionCandidate & { rangeMax?: number | null; role?: string | null })[],
  opts?: {
    maxPower?: number;
    // Kit ids the unit can REACH. The same argument as the triggered skip below, one population
    // over: the kit also carries the charm bar, and 22 creatures read as casters off one row.
    castable?: ReadonlySet<number> | null;
  },
): boolean {
  // No power pool → cannot sustain a ranged kit; melee station.
  // (Fixture kobolds list Firebolt but maxPower 0 — stay in melee pile.)
  if (opts != null && !(opts.maxPower! > 0)) return false;
  const castable = opts?.castable;
  // MEMOIZED on the kit array, like its sibling caches. Adding the reachability test to an unmemoized
  // walk cost 4.8 points of combat.sim, and an empty kit is answered before the memo, never keyed.
  if (spells.length === 0) return false;
  const cache = castable ? CASTER_KIT_FILTERED : CASTER_KIT_RAW;
  const memo = cache.get(spells);
  if (memo !== undefined) return memo;

  // A payload is in the kit so the engine can RESOLVE it, not so the unit can cast it. Frost Armor's
  // Chilled carries a 30 yd range, and 12 melee creatures opened at the caster ring off it.
  const triggered = triggeredIdsOf(spells);
  for (const s of spells) {
    if (s.id != null && triggered.has(s.id)) continue;
    if (castable && !castable.has((s.id ?? 0) | 0)) continue;
    const r = s.rangeMax ?? 0;
    if (r >= DEFAULT_DETECTION_RANGE) {
      cache.set(spells, true);
      return true;
    }
    // Explicit long-range nuke/dot below Detection still implies ranged kit
    // (medium band 10–20). Melee specials with rangeMax 5–10 stay melee.
    if (r > 10 && (s.role === 'nuke' || s.role === 'dot')) {
      cache.set(spells, true);
      return true;
    }
  }
  cache.set(spells, false);
  return false;
}

/** Symmetric lateral y for the i-th unit in a band (0, +1, −1, +2, −2, …). */
function lateralY(index: number): number {
  if (index <= 0) return 0;
  const step = Math.ceil(index / 2) * LATERAL_STEP_YD;
  return index % 2 === 1 ? step : -step;
}

// The ranged camp. Row 0 matches the old lateral spread, so every 5-man is unchanged. Past it the camp
// fans onto an arc behind the melee pile: a column put all 40 raiders on the boss's facing ray.
function backLineCampOffset(index: number): CombatPosYd {
  const i = index <= 0 ? 0 : index | 0;
  if (i < BACK_LINE_ROW_WIDTH) return { x: 0, y: lateralY(i) };
  const j = i - BACK_LINE_ROW_WIDTH;
  const band = Math.floor(j / BACK_LINE_ARC_SLOTS);
  const p = j - band * BACK_LINE_ARC_SLOTS;
  // ±12° steps from the back axis, alternating sides: +2, −2, +4, … ±14 (±84°).
  // Starts at ±2 because row 0 already owns the ±6° wedge (y ≤ 2 yd at 20 yd).
  const k = (p % 2 === 0 ? 1 : -1) * (BACK_LINE_ARC_STEP + BACK_LINE_ARC_STEP * Math.floor(p / 2));
  const radius = PARTY_BACK_LINE_YD + band * BACK_LINE_ROW_DEPTH_YD;
  return {
    x: PARTY_BACK_LINE_YD - radius * arcCos(k),
    y: radius * arcSin(k),
  };
}

// The raid ranged camp — an arc around the BOSS, measured off its facing. Slot 0 is the WIDEST
// bearing, since re-seeding healers at 50–82° doubled raid healing and took her to 38.6%.
function raidBackLineCamp(slot: number, bossOpenYd: number): CombatPosYd {
  const s = slot <= 0 ? 0 : slot | 0;
  const row = Math.floor(s / RAID_CAMP_ROW_SLOTS);
  const p = s - row * RAID_CAMP_ROW_SLOTS;
  const k = Math.max(RAID_CAMP_MIN_K, RAID_CAMP_MAX_K - Math.floor(p / 2));
  const sign = p % 2 === 0 ? 1 : -1;
  const radius = Math.max(
    DEFAULT_DETECTION_RANGE,
    CASTER_RING_OUTER_YD - row * BACK_LINE_ROW_DEPTH_YD,
  );
  return {
    x: bossOpenYd - radius * arcCos(k),
    y: sign * radius * arcSin(k),
  };
}

// Back-line slot per unit, healers on the widest bearings. Slots used to go in ally-index order, which
// handed the healers the narrow column. Returns a slot per input position, so the caller keeps order.
function backLineSlots(healer: readonly boolean[], raid: boolean): number[] {
  const out = new Array<number>(healer.length);
  if (!raid) {
    for (let i = 0; i < healer.length; i++) out[i] = i;
    return out;
  }
  let next = 0;
  for (let i = 0; i < healer.length; i++) if (healer[i]) out[i] = next++;
  for (let i = 0; i < healer.length; i++) if (!healer[i]) out[i] = next++;
  return out;
}

/** Back line big enough that the fan has left row 0 — the raid camp owns it from here. */
function isRaidBackLine(count: number): boolean {
  return count > BACK_LINE_ROW_WIDTH;
}

// Does the PLAYER take a back-line stand at the seed? Not outside a raid camp: the player is the
// puller and the pull-open distance is measured from them, so parking them behind it was a lie.
function playerTakesBackLine(playerBackLine: boolean | undefined, raidCamp: boolean): boolean {
  return playerBackLine === true && raidCamp;
}

/** Back-line head count as the raid-camp test sees it — the player included. */
function backLineCount(
  playerBackLine: boolean | undefined,
  allyBackLine: readonly boolean[] | undefined,
  allyCount: number,
): number {
  let n = playerBackLine === true ? 1 : 0;
  for (let i = 0; i < allyCount; i++) if (allyBackLine?.[i] === true) n++;
  return n;
}

// Five-man party bubble. Measured on a 75 s Deadmines floor run: without it the healer and mage moved 0.0
// yd in 75 s while the melee half chased to a 29.5 yd spread.
export const PARTY_FOLLOW_YD = 14;

// Where the party STANDS on the live floor: one stacked group, tanks in front, melee a yard back,
// ranged and healers three. Nothing here is the boss-relative pull camp the endless floor never runs.
export const PARTY_BAND_DEPTH_YD: Readonly<Record<'tank' | 'melee' | 'back', number>> = {
  tank: 0,
  melee: 1,
  back: 3,
};

/** Units that fit on a ring: floor(2πr / spacing), capped at the ARC table (60). */
export function meleeRingCapacity(radiusYd: number, spacingYd: number = LATERAL_STEP_YD): number {
  if (!(radiusYd > 0) || !(spacingYd > 0)) return 1;
  const fit = Math.floor((2 * Math.PI * radiusYd) / spacingYd);
  return Math.max(1, Math.min(60, fit));
}

// Stable melee-orbit slot for a combat side. Used so gap-close aims at different points on the MELEE_REACH
// circle instead of stacking everyone on the same ray (player + pet + adds all ending on one pixel).
function meleeOrbitSlot(side: string): number {
  if (side === 'player') return 0;
  if (side === 'pet') return 1;
  if (side.startsWith('ally_')) {
    const n = Number(side.slice('ally_'.length));
    return 2 + (Number.isFinite(n) ? n : 0);
  }
  if (side === 'enemy') return 0;
  if (side.startsWith('enemy_')) {
    const n = Number(side.slice('enemy_'.length));
    return 1 + (Number.isFinite(n) ? n : 0);
  }
  return 0;
}

// The polar offset for a melee orbit slot. Ring 0 uses the orbit table at melee reach, so a 5-man is
// bit-identical; further slots densify on that ring, then overflow outward but stay inside the slack.
function meleeOrbitOffset(slot: number): { radius: number; co: number; so: number } {
  let s = slot | 0;
  // Legacy negative wrap stays on ring 0 of the orbit table (probe + old callers).
  if (s < 0) {
    return { radius: MELEE_REACH_YD, co: orbitCos(s), so: orbitSin(s) };
  }

  let ring = 0;
  for (;;) {
    // Ring 0 at exact MELEE_REACH; further rings step by LATERAL_STEP but clamp to
    // MELEE_REACH + MELEE_PARK_SLACK so gap-close parks still white-swing.
    const rawR = MELEE_REACH_YD + ring * LATERAL_STEP_YD;
    const radius = ring === 0
      ? MELEE_REACH_YD
      : Math.min(rawR, MELEE_REACH_YD + MELEE_PARK_SLACK_YD);

    // Ring 0: orbit table (14) + up to 30 odd ARC gaps (π/30·(2i+1) never equals k·π/7).
    // Outer rings: full circumference/spacing capacity, ARC-even fan.
    const spacingCap = meleeRingCapacity(radius);
    const cap = ring === 0
      ? Math.min(ORBIT_SLOT_COUNT + 30, Math.max(ORBIT_SLOT_COUNT, spacingCap))
      : spacingCap;

    if (s < cap) {
      if (ring === 0 && s < ORBIT_SLOT_COUNT) {
        return { radius: MELEE_REACH_YD, co: orbitCos(s), so: orbitSin(s) };
      }
      if (ring === 0) {
        // Odd ARC indices only — disjoint from the two orbit-coincident ARC angles (0, π).
        const densified = s - ORBIT_SLOT_COUNT;
        const k = (2 * densified + 1) % 60;
        return { radius: MELEE_REACH_YD, co: arcCos(k), so: arcSin(k) };
      }
      // Even fan; cap ≤ 60 so floor(s·60/cap) is injective for s ∈ [0, cap).
      const k = Math.floor((s * 60) / cap) % 60;
      return { radius, co: arcCos(k), so: arcSin(k) };
    }
    s -= cap;
    ring++;
    if (ring > 16) {
      const k = s % 60;
      return {
        radius: MELEE_REACH_YD + MELEE_PARK_SLACK_YD,
        co: arcCos(k),
        so: arcSin(k),
      };
    }
  }
}

// The aim point on the melee-reach ring around the target, fanned by orbit slot from the approach
// bearing. Everyone still lands in white-swing range, and a pet no longer shares the player's point.
export function meleeOrbitAim(
  from: CombatPosYd,
  to: CombatPosYd,
  slot: number,
): CombatPosYd {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  // Angle addition instead of atan2→cos/sin: cos(base)=dx/d, sin(base)=dy/d, and ring-0
  // offsets are integer multiples of π/7 (orbit table) so the 5-man path is exact (W1b).
  const d = detHypot(dx, dy);
  const cb = d > 0 ? dx / d : 1;
  const sb = d > 0 ? dy / d : 0;
  const { radius, co, so } = meleeOrbitOffset(slot);
  return {
    x: to.x + radius * (cb * co - sb * so),
    y: to.y + radius * (sb * co + cb * so),
    ...(to.z != null && Number.isFinite(to.z) ? { z: to.z } : {}),
  };
}

// Max yards from the party stand to any enemy at seed. Beyond it the pull is one the party cannot
// close without a cross-map march; the tighter ring sum was too small for real 8-mob rooms.
export const MAX_SEED_PARTY_ENEMY_YD = 60;

export function injectEnemySlotPosition(opts: {
  /** Index of the new enemy among all enemies after inject (0 = primary 'enemy'). */
  enemyIndex: number;
  /** When true, place on caster ring instead of melee open arc. */
  isCaster?: boolean;
  /** Melee open band (sourced attack distance); defaults to DEFAULT_OPEN_YD. */
  meleeOpenYd?: number;
}): CombatPosYd {
  const i = Math.max(0, opts.enemyIndex | 0);
  if (opts.isCaster) {
    // A bounded ring: wrap the slot around the circle so a high index still lands on the outer arc.
    // The old lateral formula grew without bound and put enemy 104 at 125 yd.
    const ringSpan = CASTER_RING_OUTER_YD - DEFAULT_DETECTION_RANGE;
    const ring = 12;
    const depth = Math.min(ringSpan, Math.floor(i / ring) * (ringSpan / 3));
    const r = DEFAULT_DETECTION_RANGE + depth;
    const slot = i % ring;
    return {
      x: r * orbitCos(slot),
      y: r * orbitSin(slot),
    };
  }
  // Melee arc on the OPEN circle (same ~12° step as seedMeleePackPositions).
  // Wrap every 30 slots so a dense floor inject never lands beyond open yards.
  const open = opts.meleeOpenYd != null && opts.meleeOpenYd > 0 ? opts.meleeOpenYd : DEFAULT_OPEN_YD;
  const slot = i % 30;
  return {
    x: open * arcCos(slot),
    y: open * arcSin(slot),
  };
}

/** ObjectDefines.h `CONTACT_DISTANCE 1.f` — how far a spawner's summon lands from its feet. */
export const CONTACT_DISTANCE_YD = 1;

// A map-absolute spawn point handed to a summon, plus what the placement may do with it. Script rows
// arrive bare; a near-caster dest arrives map-verified, with a walkable centre to clamp out from.
export type SummonWorldPoint = {
  x: number;
  y: number;
  /** Walkable world centre the point was drawn around — the floor clamp's `from`. */
  from?: { x: number; y: number };
  /** Read off this map's spawn table, so the 100 yd wrong-map cap does not apply. */
  mapVerified?: boolean;
};

// Where a summoned add appears: at its SUMMONER, one contact distance out. These used to fall through
// to a ring around the PULL ORIGIN, which is how frost spectres arrived across the map.
export function summonSpawnPosition(summoner: CombatPosYd, slot: number): CombatPosYd {
  return {
    x: summoner.x + CONTACT_DISTANCE_YD * orbitCos(slot),
    y: summoner.y + CONTACT_DISTANCE_YD * orbitSin(slot),
  };
}

// Multi-enemy dungeon pack layout — slots and range bands along the pull axis. Melee enemies open on
// the OPEN arc, not the reach arc: a pull already in white range has no walk-in, so Charge cannot fire.
export function seedMeleePackPositions(opts: {
  enemyCount: number;
  allyCount?: number;
  includePet?: boolean;
  /** Player on back line (ranged/caster kit). Default false → melee pile. */
  playerBackLine?: boolean;
  /** Per-ally back-line flags in ally_0.. order. Missing entry → melee. */
  allyBackLine?: readonly boolean[];
  /** Per-ally group role in ally_0.. order — raid camps give healers the widest bearings. */
  allyRole?: readonly (string | undefined)[];
  /** Player group role, when the host knows it (raid healer player). */
  playerRole?: string;
  /** Per-enemy caster-ring flags in enemy / enemy_1.. order. Missing → melee. */
  enemyCaster?: readonly boolean[];
  /**
   * The other side is a TEAM, not a mob pack: an arena or duel-lab team match. Its bodies then
   * take the party's OWN formation mirrored across the contact line, so each team's back line
   * stands behind its own melee and both are the same distance from the enemy. `ARENA_START` is
   * symmetric (`battlegroundRun.ts:32`, mid-12 / mid+12) and `seedDuelGeometry` kept only its
   * distance, so side B was seeded as an approach arc plus a caster ring while side A got the
   * protected -20 yd party line. Measured 2026-09-10: side A won 20/20 mirrors.
   */
  enemyTeamBackLine?: readonly boolean[];
  /** Enemy group roles in the same order, for the healer bearings the party line already uses. */
  enemyTeamRole?: readonly (string | undefined)[];
  // Melee **open** band radius (sourced `getCreatureAttackDistance` at the product seam). Defaults to
  // DEFAULT_OPEN_YD. Never pass MELEE_REACH_YD unless the fight genuinely began in melee.
  meleeOpenYd?: number;
}): Record<string, CombatPosYd> {
  const out: Record<string, CombatPosYd> = {};
  const meleeOpenYd = opts.meleeOpenYd != null && opts.meleeOpenYd > 0
    ? opts.meleeOpenYd
    : DEFAULT_OPEN_YD;

  // Party: the melee pile sits at the origin with a small lateral spread so bodies are not one pixel,
  // and the back line is placed in two passes because raid camp bearings are handed out at once.
  const backSides: string[] = [];
  const backHealer: boolean[] = [];
  let meleePileSlot = 0;
  const placeParty = (side: string, back: boolean, role?: string): void => {
    if (back) {
      backSides.push(side);
      backHealer.push(role === 'healer');
      out[side] = { x: 0, y: 0 }; // keeps party key order; overwritten in the second pass
    } else {
      out[side] = { x: 0, y: lateralY(meleePileSlot++) };
    }
  };

  const nAllies = opts.allyCount ?? 0;
  const raidCamp = isRaidBackLine(
    backLineCount(opts.playerBackLine, opts.allyBackLine, nAllies),
  );
  placeParty('player', playerTakesBackLine(opts.playerBackLine, raidCamp), opts.playerRole);
  if (opts.includePet) {
    // Pets: melee pile with a lateral slot (not on the player's exact point).
    placeParty('pet', false);
  }
  for (let i = 0; i < nAllies; i++) {
    const back = opts.allyBackLine?.[i] === true;
    placeParty(allySideAt(i), back, opts.allyRole?.[i]);
  }
  const backSlots = backLineSlots(backHealer, raidCamp);
  for (let i = 0; i < backSides.length; i++) {
    const side = backSides[i]!;
    if (raidCamp) {
      out[side] = raidBackLineCamp(backSlots[i]!, meleeOpenYd);
      continue;
    }
    const camp = backLineCampOffset(backSlots[i]!);
    out[side] = { x: -PARTY_BACK_LINE_YD + camp.x, y: camp.y };
  }

  // --- Enemies: melee open station vs caster ring ---
  const n = Math.max(0, opts.enemyCount | 0);
  // Count melee vs caster first so arc placement stays on the open circle (hypot(x,y) === meleeOpenYd) —
  // lateral y at fixed x would make each slot a different distance and desynchronise the walk-in.
  let meleeEnemyCount = 0;
  let casterEnemyCount = 0;
  for (let i = 0; i < n; i++) {
    if (opts.enemyCaster?.[i] === true) casterEnemyCount++;
    else meleeEnemyCount++;
  }
  // A TEAM opponent is placed by the party's rule, mirrored: melee on the open arc at
  // `meleeOpenYd`, back line PARTY_BACK_LINE_YD beyond it. Both sides then read the same.
  if (opts.enemyTeamBackLine) {
    const backIdx: number[] = [];
    const backIsHealer: boolean[] = [];
    let mSlot = 0;
    for (let i = 0; i < n; i++) {
      const side = enemySideAt(i);
      if (opts.enemyTeamBackLine[i] === true) {
        backIdx.push(i);
        backIsHealer.push(opts.enemyTeamRole?.[i] === 'healer');
        out[side] = { x: meleeOpenYd, y: 0 }; // key order; overwritten below
        continue;
      }
      // The party's OWN melee rule mirrored — a pile at the contact point with `lateralY`
      // offsets — not the mob arc. The arc spreads bodies ~5 yd apart at 24 yd while the party
      // pile sits 1 yd apart, so a 5v5 mirror opened with A's two melee 1.0 yd apart and B's
      // 5.0 (measured). Same reason the back line above mirrors rather than fanning on a ring.
      out[side] = { x: meleeOpenYd, y: lateralY(mSlot++) };
    }
    const slots = backLineSlots(backIsHealer, false);
    for (let j = 0; j < backIdx.length; j++) {
      const camp = backLineCampOffset(slots[j]!);
      // Mirror of the party's `-PARTY_BACK_LINE_YD + camp.x`: further from the party, not nearer.
      out[enemySideAt(backIdx[j]!)] = { x: meleeOpenYd + PARTY_BACK_LINE_YD - camp.x, y: camp.y };
    }
    return out;
  }

  let meleeEnemySlot = 0;
  let casterEnemySlot = 0;
  for (let i = 0; i < n; i++) {
    const side = enemySideAt(i);
    if (opts.enemyCaster?.[i] === true) {
      // Fan casters along the ring: first at (DETECTION, 0), then alternate y / push x toward outer.
      // Inner ring DEFAULT_DETECTION_RANGE (18); outer CASTER_RING_OUTER_YD (30) — §7 caster ring.
      const t = casterEnemySlot++;
      const ringSpan = CASTER_RING_OUTER_YD - DEFAULT_DETECTION_RANGE;
      const depth =
        casterEnemyCount > 1
          ? (t / Math.max(1, casterEnemyCount - 1)) * ringSpan
          : 0;
      const x = DEFAULT_DETECTION_RANGE + depth;
      const y = lateralY(t) * 2;
      out[side] = { x, y };
    } else {
      // Arc on the OPEN circle so pairwise distance to the melee pile is exactly
      // `meleeOpenYd` for every melee mob — they all walk in together.
      const t = meleeEnemySlot++;
      // ~12° steps — small spread, still planar, still one open band.
      // (t − (n−1)/2)·(π/15) = (2t − n + 1)·(π/30) — integer slot on the π/30 table (W1b).
      const k = 2 * t - meleeEnemyCount + 1;
      out[side] = {
        x: meleeOpenYd * arcCos(k),
        y: meleeOpenYd * arcSin(k),
      };
    }
  }

  return out;
}

// Convenience: seed from role/kit flags already derived by the host (game.ts). Same layout as
// seedMeleePackPositions — alias for call sites that pass full kit inputs.
function seedPackCombatPositions(opts: {
  enemyCount: number;
  allyCount?: number;
  includePet?: boolean;
  playerBackLine?: boolean;
  allyBackLine?: readonly boolean[];
  enemyCaster?: readonly boolean[];
  meleeOpenYd?: number;
}): Record<string, CombatPosYd> {
  return seedMeleePackPositions(opts);
}

// One cluster spawn member used for the real-coord seed. Coords are world planar yards from the pack
// clusters. A z may be present but this seed is strictly planar and ignores it.
export interface ClusterSeedMember {
  guid: number;
  entry: number;
  x: number;
  y: number;
  z?: number;
}

// Multi-enemy pack layout from REAL cluster spawn coords: enemies sit relative to the pack centroid,
// matched to members by entry. Unmatchable returns null so the caller falls back to the synthetic seed.
export function seedClusterPackPositions(opts: {
  /** Pack origin/centroid. Optional z is ignored (planar seed). */
  origin: { x: number; y: number; z?: number };
  /** Cluster members for this pull (must cover spawnGuids). Optional z ignored. */
  members: readonly ClusterSeedMember[];
  // Enemy creature entries in combat side order (enemy, enemy_1, …) — same order as enemySpecs after
  // primary + pack expansion.
  enemyEntries: readonly number[];
  allyCount?: number;
  includePet?: boolean;
  playerBackLine?: boolean;
  allyBackLine?: readonly boolean[];
  /** Per-ally group role in ally_0.. order — raid camps give healers the widest bearings. */
  allyRole?: readonly (string | undefined)[];
  playerRole?: string;
  // Approach standoff from the pack centroid for the melee pile. Ring 1: "do not snap melee to 5 yd" — the
  // party opens at the honest open band and walks in. Defaults to DEFAULT_OPEN_YD.
  meleeOpenYd?: number;
}): Record<string, CombatPosYd> | null {
  const n = opts.enemyEntries.length;
  // Solo: the enemy sits on the origin, so the mean is ~0 and the approach falls back to +x, often
  // into a wall. Keep the synthetic pull-local layout for 1v1; multi-spawn packs keep the real one.
  if (n <= 1) return null;
  if (!opts.members.length) return null;

  // We need one member slot per enemy; a pack with fewer real spawns than combatants
  // cannot be laid out from spawns alone.
  if (opts.members.length < n) return null;

  // Two passes. The first matches by entry, which is exact. The second exists because that alone
  // rejected most real pulls, and a leftover REAL spawn point beats an invented bearing.
  const unused = opts.members.map((m, i) => i);
  const slot: (number | null)[] = new Array(n).fill(null);
  for (let ei = 0; ei < n; ei++) {
    const entry = opts.enemyEntries[ei]!;
    const uidx = unused.findIndex((mi) => opts.members[mi]!.entry === entry);
    if (uidx < 0) continue;
    slot[ei] = unused[uidx]!;
    unused.splice(uidx, 1);
  }
  for (let ei = 0; ei < n; ei++) {
    if (slot[ei] != null) continue;
    const mi = unused.shift();
    if (mi == null) return null; // ran out of real spawns — refuse rather than invent one
    slot[ei] = mi;
  }

  const enemyRel: CombatPosYd[] = [];
  for (let ei = 0; ei < n; ei++) {
    const m = opts.members[slot[ei]!]!;
    enemyRel.push({ x: m.x - opts.origin.x, y: m.y - opts.origin.y });
  }

  // Approach: from party toward pack mean (or +x when mean is ~0).
  let meanX = 0;
  let meanY = 0;
  for (const p of enemyRel) {
    meanX += p.x;
    meanY += p.y;
  }
  meanX /= n;
  meanY /= n;
  let dirX = meanX;
  let dirY = meanY;
  let dirLen = detHypot(dirX, dirY);
  if (!(dirLen > 1e-6)) {
    dirX = 1;
    dirY = 0;
    dirLen = 1;
  }
  const ux = dirX / dirLen;
  const uy = dirY / dirLen;

  const out: Record<string, CombatPosYd> = {};
  for (let i = 0; i < n; i++) {
    out[enemySideAt(i)] = enemyRel[i]!;
  }

  // The melee pile stands on the approach side of the centroid at the honest OPEN band, not snapped to
  // melee reach: the party stands that many yards short of the pack and walks in.
  const approachYd = opts.meleeOpenYd != null && opts.meleeOpenYd > 0
    ? opts.meleeOpenYd
    : DEFAULT_OPEN_YD;
  const meleeBase: CombatPosYd = {
    x: -ux * approachYd,
    y: -uy * approachYd,
  };
  // Back line: further opposite the approach (far side of the pack from the enemies' mean).
  const backBase: CombatPosYd = {
    x: meleeBase.x - ux * PARTY_BACK_LINE_YD,
    y: meleeBase.y - uy * PARTY_BACK_LINE_YD,
  };

  const backSides: string[] = [];
  const backHealer: boolean[] = [];
  let meleePileSlot = 0;
  const placeParty = (side: string, back: boolean, role?: string): void => {
    // Perp of approach (ux,uy) is (-uy, ux) — lateral along the party line.
    if (back) {
      backSides.push(side);
      backHealer.push(role === 'healer');
      out[side] = { x: backBase.x, y: backBase.y }; // key order; overwritten below
    } else {
      // Melee pile: fan pet/allies off the tank point along the party line.
      const lat = lateralY(meleePileSlot++);
      out[side] = {
        x: meleeBase.x + (-uy * lat),
        y: meleeBase.y + (ux * lat),
      };
    }
  };

  const nAllies = opts.allyCount ?? 0;
  const raidCamp = isRaidBackLine(
    backLineCount(opts.playerBackLine, opts.allyBackLine, nAllies),
  );
  placeParty('player', playerTakesBackLine(opts.playerBackLine, raidCamp), opts.playerRole);
  if (opts.includePet) placeParty('pet', false);
  for (let i = 0; i < nAllies; i++) {
    placeParty(allySideAt(i), opts.allyBackLine?.[i] === true, opts.allyRole?.[i]);
  }
  const backSlots = backLineSlots(backHealer, raidCamp);
  for (let i = 0; i < backSides.length; i++) {
    const side = backSides[i]!;
    if (raidCamp) {
      // Pull-frame yards (+x toward the pack centroid) rotated onto the approach axis.
      const camp = raidBackLineCamp(backSlots[i]!, approachYd);
      out[side] = {
        x: meleeBase.x + ux * camp.x + (-uy * camp.y),
        y: meleeBase.y + uy * camp.x + (ux * camp.y),
      };
      continue;
    }
    // Further-back rows step along −approach (same as synthetic camp depth).
    const camp = backLineCampOffset(backSlots[i]!);
    const depth = -camp.x; // row * BACK_LINE_ROW_DEPTH_YD ≥ 0
    out[side] = {
      x: backBase.x - ux * depth + (-uy * camp.y),
      y: backBase.y - uy * depth + (ux * camp.y),
    };
  }

  // A wide pack room leaves a far member past the seed cap, so slide the WHOLE party toward the pack
  // mean until the worst enemy is in reach. Enemy coords stay real; only the stand moves.
  const partyKeys = Object.keys(out).filter((k) => k === 'player' || k === 'pet' || k.startsWith('ally_'));
  const p0 = out.player;
  if (p0 && partyKeys.length) {
    let worst = 0;
    let far: CombatPosYd | null = null;
    for (let i = 0; i < n; i++) {
      const e = out[enemySideAt(i)];
      if (!e) continue;
      const d = detHypot(e.x - p0.x, e.y - p0.y);
      if (d > worst) { worst = d; far = e; }
    }
    // ε under the cap so floating point never reports maxSeedYd=60.0000001 as OVER.
    const cap = MAX_SEED_PARTY_ENEMY_YD - 1e-6;
    if (far && worst > cap) {
      const excess = worst - cap;
      const dx = far.x - p0.x;
      const dy = far.y - p0.y;
      const len = detHypot(dx, dy);
      if (len > 1e-6) {
        const sx = (dx / len) * excess;
        const sy = (dy / len) * excess;
        for (const k of partyKeys) {
          const p = out[k]!;
          out[k] = { x: p.x + sx, y: p.y + sy };
        }
      }
    }
  }

  return out;
}

/** Look up a combatant side in a positions map. */
export function positionOf(
  positions: UnitPositionsYd | undefined | null,
  side: Side | string,
): CombatPosYd | undefined {
  if (!positions) return undefined;
  return positions[side];
}
