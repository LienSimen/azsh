// Skeram's images take the boss's HP PERCENT but a fraction of his max health. Without it the raid
// faced four full Skerams: 101 of 144 friendly deaths, AQ40 0/7. Cite: boss_skeram.cpp:342-362.

import type { Fighter } from './types.ts';
import type { ScriptDevRuntimeState } from '../../domain/scriptdev/types.ts';

/** boss_skeram.cpp:45 SPELL_SUMMON_IMAGES. */
export const SPELL_SUMMON_IMAGES = 747;
/** temple_of_ahnqiraj.h NPC_SKERAM_IMAGE — the body 747 summons. */
export const NPC_SKERAM_IMAGE = 15263;

// Max health as a fraction of the ORIGINAL boss max health, by the boss HP percent at the split. Cite:
// boss_skeram.cpp:350-357 — <25 % → 0.50, <50 % → 0.20, else 0.10.
function imageMaxHealthFraction(bossHealthPct: number): number {
  if (bossHealthPct < 25) return 0.5;
  if (bossHealthPct < 50) return 0.2;
  return 0.1;
}

// Apply the split-phase scale to bodies 747 just made. Anything that is not a Skeram image is left alone,
// so this cannot touch another summon that happens to ride the same cast.
export function scaleSkeramImages(boss: Fighter, made: readonly Fighter[]): number {
  if (!(boss.spec.maxHealth > 0)) return 0;
  const bossPct = (boss.hp / boss.spec.maxHealth) * 100;
  const frac = imageMaxHealthFraction(bossPct);
  let n = 0;
  for (const img of made) {
    if (((img.spec.creatureEntry ?? 0) | 0) !== NPC_SKERAM_IMAGE) continue;
    const maxHp = Math.max(1, Math.round(boss.spec.maxHealth * frac));
    img.spec.maxHealth = maxHp;
    // SetHealthPercent(healthPct) — the image opens on the boss's own HP percent, not full.
    img.hp = Math.max(1, Math.round(maxHp * (bossPct / 100)));
    n += 1;
  }
  return n;
}

// An image never registers the split, so only its summon phases close. Cite: boss_skeram.cpp:65-72
// m_isImage gate; 747 summons 15263 (Skeram), which ran the boss phases and re-split: 3854 -> 18.
export function closeImageSplitPhases(
  made: readonly Fighter[],
  scriptDevOf: (f: Fighter) => ScriptDevRuntimeState | null | undefined,
): number {
  let n = 0;
  for (const img of made) {
    if (((img.spec.creatureEntry ?? 0) | 0) !== NPC_SKERAM_IMAGE) continue;
    const sd = scriptDevOf(img);
    if (!sd) continue;
    for (const ph of sd.ir.phases ?? []) {
      if (!(ph.actions ?? []).some((a) => a.kind === 'cast_self' && (a.spellId | 0) === SPELL_SUMMON_IMAGES)) continue;
      if (sd.phaseFired.has(ph.phase)) continue;
      sd.phaseFired.add(ph.phase);
      n += 1;
    }
  }
  return n;
}
