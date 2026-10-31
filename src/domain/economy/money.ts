// Money formatting shared by the engine's activity log and the UI. No DOM, no settings. The COIN
// MARKERS are the point: PUA codepoints ride through esc() so a sink renders art or g/s/c letters.
const MARK = { g: '\uE000', s: '\uE001', c: '\uE002' } as const;
const MARK_KIND: Record<string, 'g' | 's' | 'c'> = { '\uE000': 'g', '\uE001': 's', '\uE002': 'c' };

/** Matches any coin marker. Callers use it with String.replace, which resets lastIndex. */
export const COIN_MARK_RE = /[\uE000-\uE002]/g;
export const coinMarkKind = (ch: string): 'g' | 's' | 'c' => MARK_KIND[ch] ?? 'c';

/** Gold/silver/copper fields → copper. Missing parts are 0. */
export function copperFromCoins(gold: number, silver: number, copper: number): number {
  return Math.max(0, (Math.floor(gold) || 0) * 10000 + (Math.floor(silver) || 0) * 100 + (Math.floor(copper) || 0));
}

/** Copper split the way a money string shows it: gold/silver hidden when zero, copper always. */
export function coinParts(copper: number): Array<{ k: 'g' | 's' | 'c'; n: number }> {
  // JS remainder keeps the dividend's sign, so a negative delta used to print as -1g -1s -Nc.
  const n = Math.max(0, Math.floor(copper) || 0);
  const g = Math.floor(n / 10000);
  const s = Math.floor((n % 10000) / 100);
  const out: Array<{ k: 'g' | 's' | 'c'; n: number }> = [];
  if (g) out.push({ k: 'g', n: g });
  if (s) out.push({ k: 's', n: s });
  out.push({ k: 'c', n: n % 100 });
  return out;
}

/** Copper -> "1g 20s 5c" (100 copper = 1 silver, 100 silver = 1 gold). Plain text only. */
export function moneyText(copper: number): string {
  return coinParts(copper).map((p) => `${p.n}${p.k}`).join(' ');
}

/** Copper -> the same string with coin markers instead of letters. For anything that reaches
 *  HTML through esc() — the activity log, tooltip hints, flash lines, modal messages. */
export function moneyMarked(copper: number): string {
  return coinParts(copper).map((p) => `${p.n}${MARK[p.k]}`).join(' ');
}

/** Flatten coin markers back to g/s/c letters — attributes, aria-labels, bug reports. */
export function coinsText(s: string): string {
  return s.replace(COIN_MARK_RE, (m) => coinMarkKind(m));
}
