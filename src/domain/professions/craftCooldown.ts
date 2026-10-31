// One reader for a recipe's craft cooldown, the shape itemUseCooldown.ts already holds: a personal
// recovery keyed on the create-spell id plus a shared category. Cite: Player.cpp:20117 AddCooldown.

import type { RecipeDef } from '../../data/schema.ts';

export interface CraftCooldownMaps {
  spellCooldowns?: Record<number, number> | null;
  categoryCooldowns?: Record<number, number> | null;
}

/** Ms until this recipe may be crafted again; 0 is ready. */
export function recipeCooldownRemainingMs(
  recipe: RecipeDef,
  cds: CraftCooldownMaps | null | undefined,
  now: number,
): number {
  if (!cds) return 0;
  let rem = (cds.spellCooldowns?.[recipe.id] ?? 0) - now;
  const cat = recipe.cooldownCategory ?? 0;
  if (cat > 0) rem = Math.max(rem, (cds.categoryCooldowns?.[cat] ?? 0) - now);
  return Math.max(0, rem);
}

// Stamp both clocks after a craft lands. recTime and categoryRecTime are stored separately and the
// longer one wins the wait: Player::AddCooldown keeps the pair rather than collapsing them.
export function stampRecipeCooldown(
  recipe: RecipeDef,
  cds: { spellCooldowns: Record<number, number>; categoryCooldowns: Record<number, number> },
  now: number,
): void {
  const rec = recipe.cooldownMs ?? 0;
  if (rec > 0) cds.spellCooldowns[recipe.id] = Math.max(cds.spellCooldowns[recipe.id] ?? 0, now + rec);
  const cat = recipe.cooldownCategory ?? 0;
  const catRec = recipe.categoryCooldownMs ?? 0;
  if (cat > 0 && catRec > 0) {
    cds.categoryCooldowns[cat] = Math.max(cds.categoryCooldowns[cat] ?? 0, now + catRec);
  }
}

// Countdown label for a craft cooldown. format.ts `duration` stops at hours, which renders a
// 2-day transmute as "48 hr"; a cooldown this long reads in days.
export function craftCooldownLabel(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  if (sec < 60) return `${sec} sec`;
  const min = Math.ceil(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.ceil(min / 60);
  if (hr < 24) return `${hr} hr`;
  const day = Math.floor(hr / 24);
  const rem = hr % 24;
  return rem ? `${day} day ${rem} hr` : `${day} day${day > 1 ? 's' : ''}`;
}
