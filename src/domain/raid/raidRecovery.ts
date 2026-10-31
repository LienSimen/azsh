// Between-pull resurrection: who can stand a corpse back up, with which spell. Read off the bake —
// a resurrect spell is any whose rawEffects carry effect 18 or 113, and the payload is its own.

import type { SpellDef } from '../../data/schema.ts';
import { resurrectEffectsFromRaw, applyResurrectEffect, type ResurrectEffect } from '../spells/resurrectSpell.ts';
import type { ResurrectDeathFlow } from '../spells/resurrectSpell.ts';

/** One party member considered as a resurrector. */
export interface RecoveryCaster {
  name: string;
  /** Companion level (its own curve, not the player's). */
  level: number;
  /** 'tank' | 'healer' | 'dps' — only used to prefer a healer when several can cast. */
  role: string;
  /** False when the member ended the last pull dead. A corpse cannot cast. */
  alive: boolean;
}

export interface ResurrectOption {
  casterName: string;
  spellId: number;
  spellName: string;
  /** Real cast time; the caller charges it as downtime. Resurrection is a 10 s cast. */
  castTimeMs: number;
  /** Flat health this rank restores (or the percent form's resolved payload). */
  effect: ResurrectEffect;
  /** Reagent this rank burns (Rebirth's seed). Absent on the reagent-free rezzes. */
  consumesItem?: number;
  /** The spell's own cooldown, for the caller to stamp (Rebirth: 30 min). */
  cooldownMs?: number;
}

/** Health this option restores, for ranking only (percent forms rank below flat ones). */
function restoredHealth(o: ResurrectOption): number {
  return o.effect.kind === 'resurrect' ? o.effect.health : 0;
}

// Reagent-paying rezzes sort behind free ones however much health they restore: Rebirth rank 5
// would otherwise always win, burning a seed and a 30-minute cooldown a priest could spare.
function isCostly(o: ResurrectOption): boolean {
  return o.consumesItem != null || (o.cooldownMs ?? 0) > 0;
}

/** Caller-supplied bag lookup. Default (nothing carried) reproduces the reagent-free behaviour. */
export type HasItemFn = (casterName: string, item: number) => number;

const NO_ITEMS: HasItemFn = () => 0;

// Best resurrect spell one caster knows at its level: the highest learnable rank. A rank with
// reagents is only offered when hasItem proves every one of them is in the bags.
export function bestResurrectSpellFor(
  caster: RecoveryCaster,
  spells: readonly SpellDef[],
  hasItem: HasItemFn = NO_ITEMS,
): ResurrectOption | null {
  let best: ResurrectOption | null = null;
  for (const s of spells) {
    const lvl = s.spellLevel ?? 0;
    if (lvl > caster.level) continue;
    const fx = resurrectEffectsFromRaw(s.rawEffects);
    if (!fx.length) continue;
    const reagents = s.reagents ?? [];
    if (reagents.some((r) => hasItem(caster.name, r.item) < Math.max(1, r.count | 0))) continue;
    const option: ResurrectOption = {
      casterName: caster.name,
      spellId: s.id,
      spellName: s.name,
      castTimeMs: Math.max(0, s.castTimeMs | 0),
      effect: fx[0]!,
      ...(reagents.length ? { consumesItem: reagents[0]!.item } : {}),
      ...((s.cooldownMs ?? 0) > 0 ? { cooldownMs: s.cooldownMs } : {}),
    };
    // Free beats costly first; within a tier, the strongest rank wins.
    if (!best) { best = option; continue; }
    if (isCostly(best) !== isCostly(option)) {
      if (isCostly(best)) best = option;
      continue;
    }
    if (restoredHealth(option) > restoredHealth(best)) best = option;
  }
  return best;
}

// Pick who resurrects: a living member with a rez, cheap first, then healers, then the strongest
// rank. Null with no candidate. `onCooldown` refuses a caster whose Rebirth is still ticking.
export function pickResurrector(
  casters: readonly RecoveryCaster[],
  spellsOf: (caster: RecoveryCaster) => readonly SpellDef[],
  opts?: { hasItem?: HasItemFn; onCooldown?: (casterName: string, spellId: number) => boolean },
): ResurrectOption | null {
  const hasItem = opts?.hasItem ?? NO_ITEMS;
  const onCooldown = opts?.onCooldown;
  const offers: Array<{ option: ResurrectOption; healer: boolean }> = [];
  for (const c of casters) {
    if (!c.alive) continue;
    const usable = spellsOf(c).filter((s) => !onCooldown?.(c.name, s.id));
    const option = bestResurrectSpellFor(c, usable, hasItem);
    if (option) offers.push({ option, healer: c.role === 'healer' });
  }
  if (!offers.length) return null;
  offers.sort((a, b) => {
    const ac = isCostly(a.option);
    const bc = isCostly(b.option);
    if (ac !== bc) return ac ? 1 : -1;
    if (a.healer !== b.healer) return a.healer ? -1 : 1;
    return restoredHealth(b.option) - restoredHealth(a.option);
  });
  return offers[0]!.option;
}

export interface PartyResurrectApply {
  /** Health to set on the revived character (null = nothing to revive). */
  health: number | null;
  mana: number | null;
  clearDeathFlow?: { deathState: 'ALIVE'; deathExpireTimeSec: number };
  /** Player-facing line: who stood you up and with what. */
  log: string;
}

// Resolve the revive numbers for a chosen option. Thin wrapper over `applyResurrectEffect` (the same pure
// apply the player's own OOC cast path uses), so a party res and a self res cannot drift apart.
export function resolvePartyResurrect(
  option: ResurrectOption,
  target: {
    maxHealth: number;
    maxMana: number;
    powerType: string;
    hasParallelMana: boolean;
    // Present only in deathFlowMode 'full'. The default 'repair-only' mode has no flow object, so
    // applyResurrectEffect alone reads "no dead target" and refuses.
    deathFlow: ResurrectDeathFlow | null | undefined;
  },
): PartyResurrectApply {
  const res = applyResurrectEffect({
    effect: option.effect,
    maxHealth: target.maxHealth,
    maxMana: target.maxMana,
    deathFlow: target.deathFlow,
    // The caller has already established the target is a corpse (isPlayerAlive false), and this
    // is a PARTY res on that corpse, so force it rather than re-deriving death from the flow.
    forceSelf: true,
    powerType: target.powerType,
    hasParallelMana: target.hasParallelMana,
  });
  return {
    health: res.health,
    mana: res.mana,
    ...(res.clearDeathFlow ? { clearDeathFlow: res.clearDeathFlow } : {}),
    log: res.health == null
      ? res.log
      : `${option.casterName} casts ${option.spellName} on you. You return to life with ${res.health} health.`,
  };
}


// Release, walk back, reclaim at half health with no sickness, paying the death-count delay.
// Cite: MiscHandler.cpp HandleReclaimCorpseOpcode -> ResurrectPlayer(0.5f); corpseReclaimDelay.
export interface CorpseRunApply {
  /** Health to restore the player to. */
  health: number;
  /** Mana to restore, or null for a rage/energy body. */
  mana: number | null;
  /** Seconds the walk back and the reclaim delay cost the run. */
  downtimeSec: number;
}

/** MiscHandler.cpp ResurrectPlayer(0.5f) — the reclaim restores half. */
export const CORPSE_RECLAIM_RESTORE_PERCENT = 0.5;

export function resolveCorpseRun(target: {
  maxHealth: number;
  maxMana: number;
  powerType: string;
  /** Deaths so far this run — indexes the reclaim delay table. */
  deaths: number;
  reclaimDelayMs: number;
}): CorpseRunApply {
  const health = Math.max(1, Math.round(target.maxHealth * CORPSE_RECLAIM_RESTORE_PERCENT));
  const mana = target.powerType === 'rage' || target.powerType === 'energy'
    ? null
    : Math.max(0, Math.round(target.maxMana * CORPSE_RECLAIM_RESTORE_PERCENT));
  return { health, mana, downtimeSec: Math.round(target.reclaimDelayMs / 1000) };
}
