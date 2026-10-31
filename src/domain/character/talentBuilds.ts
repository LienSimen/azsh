// Named talent loadouts saved from the wiki calculator and assigned to a player or companion.
// The stored value is the classic Wowhead talent string; apply re-spends it at the target's level.

export interface TalentBuild {
  id: string;
  name: string;
  cls: number;
  /** Classic talent string, trees separated by '-'. */
  link: string;
}

export const MAX_TALENT_BUILDS = 20;
const DEFAULT_NAME = 'Build';

/** Deterministic id from the existing set — no RNG, no Date. */
export function nextTalentBuildId(existing: readonly TalentBuild[]): string {
  let n = existing.length + 1;
  const taken = new Set(existing.map((b) => b.id));
  while (taken.has(`b${n}`)) n++;
  return `b${n}`;
}

/** Trim, collapse whitespace, cap length. Never returns ''. */
export function sanitizeTalentBuildName(raw: unknown, fallback = DEFAULT_NAME): string {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 32) : '';
  return s || fallback;
}

/** A name not already taken in this list ("Arms", "Arms 2", …). */
export function uniqueTalentBuildName(existing: readonly TalentBuild[], want: string): string {
  const base = sanitizeTalentBuildName(want);
  const taken = new Set(existing.map((b) => b.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) {
    const cand = `${base} ${i}`;
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  return base;
}

/** Drop malformed rows, dedupe ids, cap length. Empty / junk input → []. */
export function normalizeTalentBuilds(raw: unknown): TalentBuild[] {
  if (!Array.isArray(raw)) return [];
  const out: TalentBuild[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const row = r as { id?: unknown; name?: unknown; cls?: unknown; link?: unknown };
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const link = typeof row.link === 'string' ? row.link.trim() : '';
    const cls = typeof row.cls === 'number' && Number.isInteger(row.cls) ? row.cls : 0;
    if (!id || seen.has(id) || !link || cls < 1) continue;
    seen.add(id);
    out.push({
      id,
      name: sanitizeTalentBuildName(row.name),
      cls,
      link,
    });
    if (out.length >= MAX_TALENT_BUILDS) break;
  }
  return out;
}
