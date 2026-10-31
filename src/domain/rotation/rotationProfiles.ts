// Named rotation profiles, per character and per companion. `profiles` is the source of truth and the
// legacy single `rotation` field is kept as a MIRROR of the active one, folded back on read.

import type { Rotation } from './rotation.ts';

/** One named list. `id` is stable across renames so the active pointer never dangles. */
export interface RotationProfile {
  id: string;
  name: string;
  rotation: Rotation;
}

/** Anything that owns profiles: the player's GameState or a Companion. */
export interface ProfileOwner {
  rotation?: Rotation;
  rotationDps?: Rotation;
  rotationProfiles?: RotationProfile[];
  activeRotationProfileId?: string;
}

export const MAX_ROTATION_PROFILES = 20;
const DEFAULT_NAME = 'Main';

/** Deterministic id from the existing set — no RNG, no Date (determinism goldens). */
export function nextProfileId(existing: readonly RotationProfile[]): string {
  let n = existing.length + 1;
  const taken = new Set(existing.map((p) => p.id));
  while (taken.has(`p${n}`)) n++;
  return `p${n}`;
}

/** Trim, collapse whitespace, cap length, fall back to a default. Never returns ''. */
export function sanitizeProfileName(raw: unknown, fallback = DEFAULT_NAME): string {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 32) : '';
  return s || fallback;
}

/** A name not already taken in this list ("Damage", "Damage 2", …). */
export function uniqueProfileName(existing: readonly RotationProfile[], want: string): string {
  const base = sanitizeProfileName(want);
  const taken = new Set(existing.map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i++) {
    const cand = `${base} ${i}`;
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  return base;
}

// The profile list, migrating a legacy save on first read: the single rotation becomes the first
// profile and the old fixed second slot the second. Empty when the owner has none yet.
export function migrateLegacyProfiles(
  owner: ProfileOwner,
  names: { primary?: string; dps?: string } = {},
): RotationProfile[] {
  const out: RotationProfile[] = [];
  if (owner.rotation) {
    out.push({ id: 'p1', name: sanitizeProfileName(names.primary, DEFAULT_NAME), rotation: owner.rotation });
  }
  if (owner.rotationDps) {
    out.push({ id: 'p2', name: sanitizeProfileName(names.dps, 'Damage'), rotation: owner.rotationDps });
  }
  return out;
}

/** Normalize a loaded list: drop malformed rows, dedupe ids, cap length. */
export function normalizeProfiles(raw: unknown): RotationProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: RotationProfile[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const row = r as Partial<RotationProfile>;
    if (!row.rotation || typeof row.rotation !== 'object') continue;
    const id = typeof row.id === 'string' && row.id && !seen.has(row.id)
      ? row.id
      : nextProfileId(out);
    seen.add(id);
    out.push({ id, name: sanitizeProfileName(row.name, DEFAULT_NAME), rotation: row.rotation as Rotation });
    if (out.length >= MAX_ROTATION_PROFILES) break;
  }
  return out;
}

/** Index of the active profile, clamped to a real row (0 when the pointer is stale). */
export function activeProfileIndex(owner: ProfileOwner): number {
  const list = owner.rotationProfiles ?? [];
  if (!list.length) return -1;
  const i = list.findIndex((p) => p.id === owner.activeRotationProfileId);
  return i >= 0 ? i : 0;
}

export function activeProfile(owner: ProfileOwner): RotationProfile | null {
  const i = activeProfileIndex(owner);
  return i >= 0 ? owner.rotationProfiles![i]! : null;
}

// Fold an external write to the mirror back into the active profile. Learn-a-rank, quest reward and
// respec all rewrite state.rotation in place, and without this the list serves the old copy.
export function syncActiveFromMirror(owner: ProfileOwner): void {
  const i = activeProfileIndex(owner);
  if (i < 0 || !owner.rotation) return;
  const cur = owner.rotationProfiles![i]!;
  if (cur.rotation !== owner.rotation) {
    owner.rotationProfiles![i] = { ...cur, rotation: owner.rotation };
  }
}

/** Point the mirror at a profile — the inverse of syncActiveFromMirror. */
export function setActiveProfile(owner: ProfileOwner, id: string): boolean {
  const list = owner.rotationProfiles ?? [];
  const hit = list.find((p) => p.id === id);
  if (!hit) return false;
  syncActiveFromMirror(owner);
  owner.activeRotationProfileId = hit.id;
  owner.rotation = hit.rotation;
  return true;
}

// Add a profile, optionally copying an existing one (the "duplicate / start from a template" path). Returns
// the new profile, or null when the cap is reached.
export function addProfile(
  owner: ProfileOwner,
  opts: { name?: string; copyFromId?: string; rotation?: Rotation } = {},
): RotationProfile | null {
  syncActiveFromMirror(owner);
  const list = owner.rotationProfiles ?? (owner.rotationProfiles = []);
  if (list.length >= MAX_ROTATION_PROFILES) return null;
  const src = opts.copyFromId ? list.find((p) => p.id === opts.copyFromId) : null;
  const rotation = opts.rotation
    ?? (src ? cloneRotation(src.rotation) : null)
    ?? (owner.rotation ? cloneRotation(owner.rotation) : null);
  if (!rotation) return null;
  const profile: RotationProfile = {
    id: nextProfileId(list),
    name: uniqueProfileName(list, opts.name ?? (src ? `${src.name} copy` : DEFAULT_NAME)),
    // A copy is the player's own list from that moment on, never auto-refreshed back to a default.
    rotation: { ...rotation, custom: true },
  };
  list.push(profile);
  return profile;
}

export function renameProfile(owner: ProfileOwner, id: string, name: string): boolean {
  const list = owner.rotationProfiles ?? [];
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return false;
  const others = list.filter((_, k) => k !== i);
  list[i] = { ...list[i]!, name: uniqueProfileName(others, name) };
  return true;
}

/** Remove a profile. The last one is never removable — a character always has a rotation. */
export function removeProfile(owner: ProfileOwner, id: string): boolean {
  const list = owner.rotationProfiles ?? [];
  if (list.length <= 1) return false;
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return false;
  const wasActive = list[i]!.id === (activeProfile(owner)?.id ?? null);
  list.splice(i, 1);
  if (wasActive) {
    const next = list[Math.min(i, list.length - 1)]!;
    owner.activeRotationProfileId = next.id;
    owner.rotation = next.rotation;
  }
  return true;
}

/** Reorder (drag in the editor). Out-of-range indices are a no-op. */
export function moveProfile(owner: ProfileOwner, from: number, to: number): boolean {
  const list = owner.rotationProfiles ?? [];
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return false;
  const [row] = list.splice(from, 1);
  list.splice(to, 0, row!);
  return true;
}

function cloneRotation(rot: Rotation): Rotation {
  return JSON.parse(JSON.stringify(rot)) as Rotation;
}
