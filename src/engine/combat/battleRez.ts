// Battle resurrection inside a live fight — druid Rebirth. The core offers the corpse a request and
// the dead player accepts; with nobody to click, the party member stands up on cast.

import type { SpellEffect } from '../../data/schema.ts';
import type { Fighter } from './types.ts';
import { isPlayerCharacterSide } from '../core/events.ts';

/** Role order a real raid rezzes in: put the healer back first, then the tank. */
const REZ_ROLE_ORDER: Record<string, number> = { healer: 0, tank: 1, dps: 2 };

function rezRank(f: Fighter): number {
  return REZ_ROLE_ORDER[f.spec.groupRole ?? 'dps'] ?? 2;
}

// The corpse a battle rez should land on: a dead PLAYER-CHARACTER seat on the caster's side, healer
// first. A resurrect refuses anything that is not a player, and a claim keeps two druids apart.
export function pickBattleRezTarget(
  candidates: readonly Fighter[],
  caster: Fighter,
  claimOwner?: (corpse: Fighter) => string | null | undefined,
): Fighter | null {
  let best: Fighter | null = null;
  let mine: Fighter | null = null;
  for (const f of candidates) {
    if (f === caster || f.hp > 0 || !isPlayerCharacterSide(f.side)) continue;
    const owner = claimOwner?.(f);
    if (owner != null) {
      if (owner === caster.side) mine = f;
      continue;
    }
    if (!best || rezRank(f) < rezRank(best)) best = f;
  }
  return mine ?? best;
}

// Drop stale battle-rez claims: the claimer died or stopped casting, or the body is already up
// because another rez, a soulstone or an Ankh beat us to it.
export function pruneRezClaims(
  claim: Map<string, string>,
  isDeadCorpse: (id: string) => boolean,
  isLiveClaimer: (id: string) => boolean,
): void {
  for (const [corpseId, claimerId] of [...claim.entries()]) {
    if (!isLiveClaimer(claimerId) || !isDeadCorpse(corpseId)) claim.delete(corpseId);
  }
}

/** Health and mana one resurrect effect hands the corpse. */
export function battleRezPayload(
  eff: Extract<SpellEffect, { kind: 'resurrect' } | { kind: 'resurrect_pct' }>,
  maxHealth: number,
  maxPower: number,
): { health: number; mana: number } {
  const maxHp = Math.max(1, maxHealth | 0);
  const maxMp = Math.max(0, maxPower | 0);
  if (eff.kind === 'resurrect') {
    return {
      health: Math.max(1, Math.min(maxHp, eff.health | 0)),
      mana: Math.max(0, Math.min(maxMp, eff.mana | 0)),
    };
  }
  // Integer division like the C++: max * damage / 100. Cite: SpellEffects.cpp:4822-4823.
  const pct = Math.max(0, eff.percent | 0);
  return {
    health: Math.max(1, Math.trunc((maxHp * pct) / 100)),
    mana: Math.max(0, Math.trunc((maxMp * pct) / 100)),
  };
}

// Stand a corpse up mid-fight. The same reset as the out-of-combat revive, except the unit comes back
// INSIDE the pull, so a rezzed rogue cannot open with Stealth nor a warrior re-Charge.
export function reviveInCombat(
  unit: Fighter,
  health: number,
  mana: number,
  t: number,
): void {
  unit.hp = Math.max(1, Math.round(health));
  if (unit.spec.powerType === 'rage') unit.power = 0;
  else unit.power = Math.max(0, Math.min(unit.spec.maxPower, Math.round(mana)));
  unit.castingSpell = null;
  unit.castFinishAt = 0;
  unit.castStartedAt = 0;
  unit.pendingCharge = null;
  unit.combatEnteredAt = t;
  unit.decideDirty = true;
}
