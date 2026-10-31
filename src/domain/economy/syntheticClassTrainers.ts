// Synthetic class-trainer catalogs — full class spell pools, not creature_template rows. Entry is
// 1000 * 1000 + cls; the legacy 1000 + cls collided with Mosshide 1007–1011 (KI-918).

import type { TrainerDef, ZoneDef } from '../../data/schema.ts';

/** Classic playable class ids that get synthetic trainer catalogs. */
export const SYNTHETIC_CLASS_TRAINER_CLASSES = [1, 2, 3, 4, 5, 7, 8, 9, 11] as const;

const CLASS_SET: ReadonlySet<number> = new Set(SYNTHETIC_CLASS_TRAINER_CLASSES);

/** Pre-KI-918 bake base (`entry = 1000 + cls`). */
export const LEGACY_SYNTHETIC_CLASS_TRAINER_BASE = 1000;

/** entry = 1000 * 1000 + cls — derived from LEGACY base; free of vanilla creature_template ids. */
export function syntheticClassTrainerEntry(cls: number): number {
  return LEGACY_SYNTHETIC_CLASS_TRAINER_BASE * LEGACY_SYNTHETIC_CLASS_TRAINER_BASE + (cls | 0);
}

export function isSyntheticClassTrainerClass(cls: number): boolean {
  return CLASS_SET.has(cls | 0);
}

/** True when `entry` is the current (or legacy) synthetic class-trainer id for a playable class. */
export function isSyntheticClassTrainerEntry(entry: number): boolean {
  const e = entry | 0;
  const curCls = e - LEGACY_SYNTHETIC_CLASS_TRAINER_BASE * LEGACY_SYNTHETIC_CLASS_TRAINER_BASE;
  if (CLASS_SET.has(curCls)) return true;
  const legacyCls = e - LEGACY_SYNTHETIC_CLASS_TRAINER_BASE;
  return CLASS_SET.has(legacyCls);
}

/** Map legacy bake ids (1001–1011) onto the non-colliding formula. Already-new ids pass through. */
export function normalizeSyntheticTrainerEntry(entry: number): number {
  const e = entry | 0;
  const legacyCls = e - LEGACY_SYNTHETIC_CLASS_TRAINER_BASE;
  if (CLASS_SET.has(legacyCls)) return syntheticClassTrainerEntry(legacyCls);
  return e;
}

/** Load-time remap of trainer catalog + zone.trainers[] off legacy 1000+cls (KI-918). */
export function remapSyntheticClassTrainers(
  trainersIn: readonly TrainerDef[],
  zones: readonly ZoneDef[] | undefined,
): Map<number, TrainerDef> {
  const trainers = new Map<number, TrainerDef>();
  for (const t of trainersIn) {
    const entry = normalizeSyntheticTrainerEntry(t.entry | 0);
    trainers.set(entry, entry === (t.entry | 0) ? t : { ...t, entry });
  }
  for (const z of zones ?? []) {
    if (!z.trainers?.length) continue;
    let changed = false;
    const next = z.trainers.map((tr) => {
      const entry = normalizeSyntheticTrainerEntry(tr.entry | 0);
      if (entry === (tr.entry | 0)) return tr;
      changed = true;
      return { ...tr, entry };
    });
    if (changed) z.trainers = next;
  }
  return trainers;
}
