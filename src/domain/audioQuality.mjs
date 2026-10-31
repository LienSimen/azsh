// Pure long-form-audio quality logic: no DOM, no fetch, no timers — which rung to play, how big a
// lead window to ask for, and whether the link is coping. zoneMusicQueue.mjs owns playlist ORDER.

/** Must match LOW_SUFFIX in src/dev/etl/emit-audio-variants.mjs. */
export const LOW_SUFFIX = '.low';

/** Ladder rungs, best first. `high` is the file the manifest already names. */
export const TIERS = ['high', 'low'];

/** @typedef {{ suffix: string, kbps: number }} VariantTier @typedef {{ tiers: Record<string, VariantTier>, ladder: string[] }} Variants */

/** Fallback ladder when public/audio/variants.json is absent (no rungs generated yet). */
/** @type {Variants} */
export const DEFAULT_VARIANTS = {
  tiers: { high: { suffix: '', kbps: 64 } },
  ladder: ['high'],
};

// Derive a variant URL from a primary track path. `high` is identity, so a missing or unknown
// tier degrades to the file the manifest named rather than to a 404.
export function variantUrl(track, tier, variants = DEFAULT_VARIANTS) {
  if (!track) return track;
  const def = variants && variants.tiers ? variants.tiers[tier] : null;
  const suffix = def && typeof def.suffix === 'string' ? def.suffix : '';
  if (!suffix) return track;
  // Only rewrite a real .mp3 tail; anything else is returned untouched.
  return /\.mp3$/i.test(track) ? track.replace(/\.mp3$/i, `${suffix}.mp3`) : track;
}

// Inverse of variantUrl: which rung is a given URL? Read from the URL rather than re-running the
// resolver, so a readout reports what is ACTUALLY playing.
export function tierFromUrl(url, variants = DEFAULT_VARIANTS) {
  if (!url) return null;
  const tiers = (variants && variants.tiers) || {};
  // Longest suffix first, so '.low' cannot be shadowed by a shorter future rung.
  const suffixed = Object.keys(tiers)
    .filter((t) => tiers[t] && tiers[t].suffix)
    .sort((a, b) => tiers[b].suffix.length - tiers[a].suffix.length);
  for (const t of suffixed) {
    if (new RegExp(`${tiers[t].suffix.replace(/\./g, '\\.')}\\.mp3$`, 'i').test(url)) return t;
  }
  return /\.mp3$/i.test(url) ? availableTiers(variants)[0] : null;
}

/** The rungs actually available, best-first, from a loaded variants doc. */
export function availableTiers(variants = DEFAULT_VARIANTS) {
  const ladder = variants && Array.isArray(variants.ladder) ? variants.ladder : null;
  const tiers = variants && variants.tiers ? variants.tiers : {};
  const list = (ladder || TIERS).filter((t) => tiers[t]);
  return list.length ? list : ['high'];
}

/** Nominal kbps of a tier — used to size lead windows in BYTES. */
export function tierKbps(tier, variants = DEFAULT_VARIANTS) {
  const def = variants && variants.tiers ? variants.tiers[tier] : null;
  // Number(), not `def && Number(...)`: the latter is `null | number`, and Number.isFinite is
  // not a type guard, so the inferred return leaked null into every caller's kbps field.
  const k = Number(def ? def.kbps : NaN);
  return Number.isFinite(k) && k > 0 ? k : 64;
}

/** Step one rung down the ladder; already-lowest returns itself. */
export function stepDown(tier, variants = DEFAULT_VARIANTS) {
  const list = availableTiers(variants);
  const i = list.indexOf(tier);
  if (i < 0) return list[0];
  return list[Math.min(i + 1, list.length - 1)];
}

/** Step one rung up the ladder; already-highest returns itself. */
export function stepUp(tier, variants = DEFAULT_VARIANTS) {
  const list = availableTiers(variants);
  const i = list.indexOf(tier);
  if (i <= 0) return list[0];
  return list[i - 1];
}

// ── Buffer health ───────────────────────────────────────────────────────────────────────

/** Neutral starting health: nothing measured yet, so assume the link is fine. */
export const INITIAL_HEALTH = {
  stalls: 0,           // `waiting` / `stalled` events on the audible element
  headroomS: Infinity, // buffered end − currentTime
  firstPlayMs: 0,      // wall time from src set to canplay (0 = unmeasured)
  kbps: 0,             // measured throughput, 0 = unmeasured
};

/** Below this many seconds of buffered audio ahead of the playhead we are at risk. */
export const LOW_HEADROOM_S = 4;
/** Two stalls on one track is a pattern, not bad luck. */
export const STALL_LIMIT = 2;
/** Taking this long to become playable means the link cannot carry this rung. */
export const SLOW_FIRST_PLAY_MS = 8000;

// Verdict on the link from observed playback, independent of any browser-reported connection
// class — `effectiveType` lies or is absent, and a stalling media element does not.
export function classifyHealth(health = INITIAL_HEALTH, tier = 'high', variants = DEFAULT_VARIANTS) {
  const h = { ...INITIAL_HEALTH, ...health };
  if (h.stalls >= STALL_LIMIT) return 'bad';
  if (h.firstPlayMs >= SLOW_FIRST_PLAY_MS) return 'bad';
  // A measured rate under the bitrate we are streaming cannot sustain it in real time.
  if (h.kbps > 0 && h.kbps < tierKbps(tier, variants)) return 'bad';
  if (h.stalls > 0) return 'strained';
  if (h.headroomS < LOW_HEADROOM_S) return 'strained';
  return 'good';
}

// Pure tier decision. Explicit user preference always wins; 'auto' is the only mode that reacts to
// the network. `level` is the DETECTED connection class, not the prefetch-conservative one.
export function resolveMusicTier(pref, level, health = INITIAL_HEALTH, variants = DEFAULT_VARIANTS) {
  const list = availableTiers(variants);
  const lowest = list[list.length - 1];
  if (pref === 'low') return lowest;
  if (pref === 'high') return list[0];

  // auto: start from what the connection class implies, then let measured health veto.
  let tier = level === 'minimal' ? lowest : level === 'lite' ? stepDown(list[0], variants) : list[0];
  const verdict = classifyHealth(health, tier, variants);
  if (verdict === 'bad') tier = stepDown(tier, variants);
  return tier;
}

// Bytes to fetch ahead of a cold start: `seconds` of audio at the tier's bitrate plus an ID3/Xing
// header allowance, so the element can read duration immediately. A lead buffer, not a preload.
export function leadBytes(seconds, tier = 'high', variants = DEFAULT_VARIANTS) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return 0;
  const bytesPerSecond = (tierKbps(tier, variants) * 1000) / 8;
  return Math.ceil(s * bytesPerSecond) + 4096;
}

// How deep to read ahead, given the link. A healthy link can afford a longer window (fewer round trips); a
// bad one wants the smallest thing that still starts playing.
export function leadSeconds(level, verdict = 'good') {
  if (level === 'minimal' || verdict === 'bad') return 8;
  if (level === 'lite' || verdict === 'strained') return 12;
  return 20;
}

// § 5.4 ladder in one predicate. musicEnabled is master × channel. Mute is the default.
export function shouldWarmNeighbours({ level, verdict = 'good', musicEnabled = true, userToggle = true }) {
  if (!musicEnabled || !userToggle) return false;
  if (level !== 'full') return false;
  return verdict === 'good';
}
