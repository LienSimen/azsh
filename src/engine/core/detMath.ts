// Bit-exact math for the lockstep sim. ECMAScript leaves sin/cos/atan2/exp/log/pow approximated, so
// one ULP on a distance flips a compare and the peers diverge. Built from exact ops and sqrt only.

/** Exact 2-arg length. Differs from `Math.hypot` only where an intermediate would overflow. */
export function detHypot(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/** Exact 3-arg length — storey hops. `detHypot` is 2-arg only. */
export function detHypot3(dx: number, dy: number, dz: number): number {
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Exact squared length — prefer this when the caller only compares against a radius. */
function detDist2(dx: number, dy: number): number {
  return dx * dx + dy * dy;
}

// Fixed-step trig tables. Every angle in the sim is a multiple of pi/7 or pi/30, so the whole surface
// is 74 constants. They MUST be pasted literals: building them with Math.cos moves the same call.

/** cos(k·π/7), k = 0..13. */
const ORBIT_COS = [1, 0.9009688679024191, 0.6234898018587336, 0.22252093395631445, -0.22252093395631434, -0.6234898018587335, -0.900968867902419, -1, -0.9009688679024191, -0.6234898018587337, -0.2225209339563146, 0.22252093395631423, 0.6234898018587334, 0.900968867902419] as const;
/** sin(k·π/7), k = 0..13. */
const ORBIT_SIN = [0, 0.4338837391175581, 0.7818314824680298, 0.9749279121818236, 0.9749279121818236, 0.7818314824680299, 0.43388373911755823, 1.2246467991473532e-16, -0.433883739117558, -0.7818314824680297, -0.9749279121818236, -0.9749279121818236, -0.7818314824680299, -0.43388373911755834] as const;
/** cos(k·π/30), k = 0..59. */
const ARC_COS = [1, 0.9945218953682733, 0.9781476007338057, 0.9510565162951535, 0.9135454576426009, 0.8660254037844387, 0.8090169943749475, 0.7431448254773942, 0.6691306063588582, 0.5877852522924731, 0.5000000000000001, 0.4067366430758004, 0.30901699437494745, 0.20791169081775945, 0.10452846326765368, 6.123233995736766e-17, -0.10452846326765333, -0.20791169081775912, -0.30901699437494734, -0.4067366430758001, -0.4999999999999998, -0.587785252292473, -0.6691306063588579, -0.7431448254773941, -0.8090169943749473, -0.8660254037844385, -0.9135454576426008, -0.9510565162951535, -0.9781476007338056, -0.9945218953682733, -1, -0.9945218953682734, -0.9781476007338057, -0.9510565162951536, -0.9135454576426011, -0.8660254037844388, -0.8090169943749475, -0.7431448254773945, -0.6691306063588585, -0.5877852522924732, -0.5000000000000004, -0.40673664307580093, -0.30901699437494756, -0.2079116908177598, -0.10452846326765423, -1.8369701987210297e-16, 0.10452846326765299, 0.20791169081775857, 0.30901699437494723, 0.40673664307579976, 0.49999999999999933, 0.5877852522924729, 0.6691306063588578, 0.7431448254773937, 0.8090169943749473, 0.8660254037844384, 0.9135454576426005, 0.9510565162951535, 0.9781476007338056, 0.9945218953682733] as const;
/** sin(k·π/30), k = 0..59. */
const ARC_SIN = [0, 0.10452846326765346, 0.20791169081775931, 0.3090169943749474, 0.40673664307580015, 0.49999999999999994, 0.5877852522924731, 0.6691306063588581, 0.7431448254773942, 0.8090169943749475, 0.8660254037844386, 0.9135454576426009, 0.9510565162951535, 0.9781476007338056, 0.9945218953682733, 1, 0.9945218953682734, 0.9781476007338057, 0.9510565162951536, 0.913545457642601, 0.8660254037844387, 0.8090169943749475, 0.7431448254773945, 0.6691306063588583, 0.5877852522924732, 0.5000000000000003, 0.40673664307580043, 0.3090169943749475, 0.20791169081775973, 0.10452846326765373, 1.2246467991473532e-16, -0.10452846326765305, -0.20791169081775907, -0.3090169943749473, -0.4067366430757998, -0.4999999999999997, -0.587785252292473, -0.6691306063588579, -0.743144825477394, -0.8090169943749473, -0.8660254037844385, -0.9135454576426005, -0.9510565162951535, -0.9781476007338056, -0.9945218953682733, -1, -0.9945218953682734, -0.9781476007338058, -0.9510565162951536, -0.9135454576426011, -0.866025403784439, -0.8090169943749476, -0.7431448254773946, -0.6691306063588588, -0.5877852522924734, -0.5000000000000004, -0.40673664307580093, -0.3090169943749476, -0.20791169081775987, -0.1045284632676543] as const;

/** True modulo — negative slots wrap instead of indexing off the front. */
function wrap(k: number, n: number): number {
  return (((k | 0) % n) + n) % n;
}

/** cos(slot·π/7) — melee orbit ring. */
export function orbitCos(slot: number): number {
  return ORBIT_COS[wrap(slot, 14)]!;
}
/** sin(slot·π/7) — melee orbit ring. */
export function orbitSin(slot: number): number {
  return ORBIT_SIN[wrap(slot, 14)]!;
}
/** cos(k·π/30) — enemy open-arc / caster-ring fan. */
export function arcCos(k: number): number {
  return ARC_COS[wrap(k, 60)]!;
}
/** sin(k·π/30) — enemy open-arc / caster-ring fan. */
export function arcSin(k: number): number {
  return ARC_SIN[wrap(k, 60)]!;
}

// log / exp

const LN2 = 0.6931471805599453;
// LN2 split with 32 zero trailing mantissa bits in the high half (0x3FE62E42FEE00000), so
// `k * LN2_HI` is exact for every |k| < 2^20 and the reduction leaks nothing. fdlibm e_exp.c.
const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);

/** 2^k for integer k, built from the exponent field — exact, no `Math.pow`. */
function pow2i(k: number): number {
  if (k > 1023) return Infinity;
  if (k < -1074) return 0;
  if (k >= -1022) {
    F64[0] = 0;
    U32[1] = (k + 1023) << 20;
    return F64[0]!;
  }
  // Subnormal: split into two normal factors (k ≥ -1074 → both exponents in range).
  return pow2i(k + 537) * pow2i(-537);
}

// Natural log, exact on every engine. Atanh series on the reduced mantissa: |f| ≤ 0.1716, so f^23 is
// already below 1 ulp.
export function detLog(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;

  F64[0] = x;
  let hi = U32[1]!;
  let e = ((hi >>> 20) & 0x7ff) - 1023;
  if (e === -1023) {
    // Subnormal — scale into normal range first (exact, power of two).
    F64[0] = x * 4503599627370496; // 2^52
    hi = U32[1]!;
    e = ((hi >>> 20) & 0x7ff) - 1023 - 52;
  }
  // Force the exponent to 0 → m in [1, 2).
  U32[1] = (hi & 0x000fffff) | 0x3ff00000;
  let m = F64[0]!;
  if (m > 1.4142135623730951) {
    m = m * 0.5;
    e = e + 1;
  }

  const f = (m - 1) / (m + 1);
  const f2 = f * f;
  let sum = 0;
  // Horner from the tail: 1/23 … 1/3, then the leading f.
  sum = 1 / 23;
  sum = sum * f2 + 1 / 21;
  sum = sum * f2 + 1 / 19;
  sum = sum * f2 + 1 / 17;
  sum = sum * f2 + 1 / 15;
  sum = sum * f2 + 1 / 13;
  sum = sum * f2 + 1 / 11;
  sum = sum * f2 + 1 / 9;
  sum = sum * f2 + 1 / 7;
  sum = sum * f2 + 1 / 5;
  sum = sum * f2 + 1 / 3;
  sum = sum * f2 + 1;
  return 2 * f * sum + e * LN2;
}

// e^x, exact on every engine. Range-reduce to |r| ≤ ln2/2 with a two-part LN2, then a 15-term Taylor sum.
export function detExp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;

  const k = Math.round(x / LN2);
  const r = x - k * LN2_HI - k * LN2_LO;

  let sum = 1 / 1307674368000; // 1/15!
  sum = sum * r + 1 / 87178291200; // 1/14!
  sum = sum * r + 1 / 6227020800;
  sum = sum * r + 1 / 479001600;
  sum = sum * r + 1 / 39916800;
  sum = sum * r + 1 / 3628800;
  sum = sum * r + 1 / 362880;
  sum = sum * r + 1 / 40320;
  sum = sum * r + 1 / 5040;
  sum = sum * r + 1 / 720;
  sum = sum * r + 1 / 120;
  sum = sum * r + 1 / 24;
  sum = sum * r + 1 / 6;
  sum = sum * r + 1 / 2;
  sum = sum * r + 1;
  sum = sum * r + 1;
  return sum * pow2i(k);
}

// Arbitrary-angle trig, for the few sites whose angle comes from data. The coefficients are fdlibm's
// and the arithmetic around them is exact ops only, so every peer agrees.

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.570796326794896558e0] as const;
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17] as const;
const AT = [3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.1111110405462355788e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2, -3.6531572744216915527e-2, 1.62858201153657823623e-2] as const;

const PI = 3.141592653589793;
const PI_LO = 1.2246467991473532e-16;

/** atan(x), exact on every engine. */
export function detAtan(x: number): number {
  if (x !== x) return NaN;
  const neg = x < 0;
  let a = neg ? -x : x;
  if (!(a < 7.3e19)) return neg ? -1.5707963267948966 : 1.5707963267948966;
  let id: number;
  if (a < 0.4375) {
    if (a < 3.725290298461914e-9) return x;
    id = -1;
  } else if (a < 0.6875) {
    id = 0;
    a = (2 * a - 1) / (2 + a);
  } else if (a < 1.1875) {
    id = 1;
    a = (a - 1) / (a + 1);
  } else if (a < 2.4375) {
    id = 2;
    a = (a - 1.5) / (1 + 1.5 * a);
  } else {
    id = 3;
    a = -1 / a;
  }
  const z = a * a;
  const w = z * z;
  const s1 = z * (AT[0]! + w * (AT[2]! + w * (AT[4]! + w * (AT[6]! + w * (AT[8]! + w * AT[10]!)))));
  const s2 = w * (AT[1]! + w * (AT[3]! + w * (AT[5]! + w * (AT[7]! + w * AT[9]!))));
  if (id < 0) {
    const r0 = a - a * (s1 + s2);
    return neg ? -r0 : r0;
  }
  const r = ATAN_HI[id]! - (a * (s1 + s2) - ATAN_LO[id]! - a);
  return neg ? -r : r;
}

/** atan2(y, x), exact on every engine. Matches the spec's quadrant and zero rules. */
export function detAtan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (y === 0) return x >= 0 && !Object.is(x, -0) ? (Object.is(y, -0) ? -0 : 0) : (Object.is(y, -0) ? -PI : PI);
  if (x === 0) return y > 0 ? 1.5707963267948966 : -1.5707963267948966;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    if (!Number.isFinite(x) && !Number.isFinite(y)) {
      const q = x > 0 ? 0.7853981633974483 : 2.356194490192345;
      return y > 0 ? q : -q;
    }
    if (!Number.isFinite(y)) return y > 0 ? 1.5707963267948966 : -1.5707963267948966;
    return x > 0 ? (y > 0 ? 0 : -0) : y > 0 ? PI : -PI;
  }
  const a = detAtan(y / x);
  if (x > 0) return a;
  return y > 0 ? a + PI + PI_LO : a - PI - PI_LO;
}

const S1 = -1.66666666666666324348e-1, S2 = 8.33333333332248946124e-3, S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6, S5 = -2.50507602534068634195e-8, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-2, C2 = -1.38888888888741095749e-3, C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7, C5 = 2.0875723212981748279e-9, C6 = -1.13596475577881948265e-11;
// π/2 split into pieces with zeroed low mantissa bits, so `k * PIO2_x` stays exact.
const PIO2_1 = 1.57079632673412561417e0, PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21;

function kernelSin(x: number): number {
  const z = x * x;
  return x + x * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}
function kernelCos(x: number): number {
  const z = x * x;
  return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}

/** Reduce to |r| ≤ π/4 and the quadrant 0..3. Cody-Waite; exact for |a| < 2^20·π/2. */
function reduceQuadrant(a: number): { r: number; q: number } {
  const k = Math.round(a * 0.6366197723675814);
  let r = a - k * PIO2_1 - k * PIO2_1T;
  if (k > 1048576 || k < -1048576) r = a - k * PIO2_1 - k * PIO2_1T - k * PIO2_2 - k * PIO2_2T;
  return { r, q: ((k % 4) + 4) % 4 };
}

/** sin(x), exact on every engine. */
export function detSin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const { r, q } = reduceQuadrant(x);
  return q === 0 ? kernelSin(r) : q === 1 ? kernelCos(r) : q === 2 ? -kernelSin(r) : -kernelCos(r);
}

/** cos(x), exact on every engine. */
export function detCos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const { r, q } = reduceQuadrant(x);
  return q === 0 ? kernelCos(r) : q === 1 ? -kernelSin(r) : q === 2 ? -kernelCos(r) : kernelSin(r);
}

// State hash — the desync detector's primitive (W12b)

/** FNV-1a over a float, by its exact bits. Order-dependent by design. */
export function hashFloat(h: number, v: number): number {
  F64[0] = v === 0 ? 0 : v; // fold -0 into +0 so a sign-only diff is not a desync
  let x = h;
  let lo = U32[0]!;
  let hi = U32[1]!;
  for (let i = 0; i < 4; i++) {
    x = Math.imul(x ^ (lo & 0xff), 0x01000193);
    lo = lo >>> 8;
  }
  for (let i = 0; i < 4; i++) {
    x = Math.imul(x ^ (hi & 0xff), 0x01000193);
    hi = hi >>> 8;
  }
  return x >>> 0;
}

/** FNV-1a over a 32-bit integer. */
function hashInt(h: number, v: number): number {
  let x = h;
  let n = v | 0;
  for (let i = 0; i < 4; i++) {
    x = Math.imul(x ^ (n & 0xff), 0x01000193);
    n = n >>> 8;
  }
  return x >>> 0;
}

/** FNV-1a over a string's code units. */
function hashStr(h: number, s: string): number {
  let x = h;
  for (let i = 0; i < s.length; i++) {
    x = Math.imul(x ^ (s.charCodeAt(i) & 0xff), 0x01000193);
    x = Math.imul(x ^ (s.charCodeAt(i) >>> 8), 0x01000193);
  }
  return x >>> 0;
}

export const HASH_SEED = 0x811c9dc5;
