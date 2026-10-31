// Out-of-combat regen and rested XP accrual. Cite: Player.cpp ComputeRest ~20000 (the 1152000 divisor,
// with the wilderness quarter rate); SetRestBonus ~16949 (the 75% cap).
import type { ActiveAura, Character } from '../domain/character/character.ts';
import {
  applyAura,
  applyInebriate,
  effectiveStats,
  equippedStatBonuses,
  getActiveBuffIds,
  currentMana,
  maxHealth,
  maxMana,
  maxPower,
  powerType,
  pruneExpiredAuras,
} from '../domain/character/character.ts';
import { isPlayerAlive, YOU_ARE_DEAD, type DeathFlowState } from '../domain/run/death.ts';
import { classHasParallelMana } from '../domain/character/forms.ts';
import { racialSpells } from '../domain/character/races.ts';

/** OOC HoT bookkeeping on ActiveAura (optional; old saves omit; not a schema version bump). */
type OocHotAura = ActiveAura & {
  nextTickRemainingMs?: number;
  durationRemainingMs?: number;
};
import type { DataStore } from '../data/dataStore.ts';
import { hasModHealthRegenInCombat } from '../data/materializeModHealthRegen.ts';
import type { ItemDef } from '../data/schema.ts';
import type { Inventory } from '../domain/items/inventory.ts';
import { addItem, canFit, countItem, removeItem } from '../domain/items/inventory.ts';
import { bagCapacity } from '../domain/items/equipment.ts';
import { getDispelMask } from '../domain/spells/dispel.ts';
import { MECHANIC_MOUNT, peelMechanicAuras } from '../domain/spells/dispelMechanic.ts';
import { dismount } from '../domain/items/mounts.ts';
import { equippedEntry, equippedInstance } from '../domain/items/itemInstance.ts';
import { castItemSurvivesUse, consumeItemCharges, hasChargesLeft, isExpendableCastItem, maxChargesOf, NO_CHARGES_REMAIN } from '../domain/items/inventory.ts';
import { itemTeachIntent } from '../domain/items/itemTeaches.ts';
import {
  petMaxHealth, petMaxPower, petHasHappiness, decayHappiness, tickLoyalty, tickFeeding,
  LOYALTY_REBELLIOUS,
} from '../domain/pet/pet.ts';
import {
  healthRegenPerSec,
  updateManaRegen,
  powerRegenPercentMultiplier,
  rageDecayAmount,
  petOocManaRegenPerSec,
  TUNING,
} from '../engine/combat/formulas.ts';
import { powerTypeName, resolvePeriodicPctOfMax } from '../engine/spells/effects.ts';
import { resolveCombatSpell } from '../engine/spells/interpreter/item-triggers.ts';
import { manaPerSecondOf } from '../engine/spells/auraPerSecondCost.ts';
import { durMs } from '../engine/spells/interpreter/duration.ts';
import {
  refuseCmangosCheckCast,
  RECENTLY_BANDAGED_SPELL_ID,
} from '../engine/combat/cmangosCastGates.ts';

// ComputeRest: every eight hours in a rest zone gains one bubble of 5% of the level's XP, as the time
// passed times the next level's XP over 1152000. Cite: Player.cpp:20000-20008.
export function computeRestGain(
  logoutSec: number,
  isCityOrInn: boolean,
  rate = 1,
  nextLevelXp = 0,
  opts?: { offline?: boolean },
): number {
  // NaN <= 0 is false — must reject non-finite or the gain (and restedXp) become NaN (KI-783).
  if (!Number.isFinite(logoutSec) || logoutSec <= 0 || !Number.isFinite(nextLevelXp) || nextLevelXp <= 0) {
    return 0;
  }
  let bonus = logoutSec * (nextLevelXp / 1152000.0);
  const offline = opts?.offline ?? true;
  if (!offline) {
    bonus *= rate; // CONFIG_FLOAT_RATE_REST_INGAME
  } else if (isCityOrInn) {
    bonus *= rate; // CONFIG_FLOAT_RATE_REST_OFFLINE_IN_TAVERN_OR_CITY
  } else {
    bonus *= rate / 4.0; // wilderness offline reduced by 4
  }
  return Number.isFinite(bonus) ? bonus : 0;
}

/** SetRestBonus max: nextLevelXp * 1.5 / 2 = 0.75 * nextLevelXp (Player.cpp ~16949). */
export function restBonusCap(nextLevelXp: number): number {
  if (!Number.isFinite(nextLevelXp) || nextLevelXp <= 0) return 0;
  return (nextLevelXp * 1.5) / 2.0;
}

/** Clamp rested pool into [0, cap]. Non-finite input → 0 (KI-783). */
export function clampRestBonus(restBonus: number, nextLevelXp: number): number {
  const cap = restBonusCap(nextLevelXp);
  if (!Number.isFinite(restBonus) || restBonus < 0) return 0;
  if (restBonus > cap) return cap;
  return restBonus;
}

// Out-of-combat periodic heal and energize auras, on the same seconds budget as spirit regen. The
// duration is tracked on the aura, so wall-clock drift between calls cannot drop the last tick.
export function tickOocRestoreAuras(
  char: Character,
  ds: DataStore,
  seconds: number,
  now: number = Date.now(),
): Character {
  if (!(seconds > 0)) return char;
  const aurasIn = char.activeAuras;
  if (!aurasIn?.length) return char;

  const mh = maxHealth(char, ds);
  const mp = maxPower(char, ds);
  let health = char.health;
  let power = char.power;
  let petHealth = char.pet?.health;
  let any = false;
  const out: ActiveAura[] = [];

  for (const rawA of aurasIn) {
    const a = rawA as OocHotAura;
    // Prefer the RESOLVED spell when the row has raw effects: the bake stores periodic amounts in
    // internal units, so Bloodrage's rage tick granted ten a second straight off the bake.
    const bakeSp = ds.spell(a.spellId);
    const sp = bakeSp?.rawEffects?.length ? resolveCombatSpell(bakeSp) : bakeSp;
    if (!sp) {
      out.push(a);
      continue;
    }
    // Every discrete restore on the aura — Dreamless Sleep carries both on one spell. The always-on
    // regen aura is folded into the rate below, and a hostile mana leech never self-ticks here.
    type RestoreEff = {
      kind: 'restore_health' | 'restore_power';
      amountPerTick?: number;
      tickMs?: number;
      durationMs?: number;
      pctOfMax?: number | null;
      applyTo?: 'self' | 'pet' | 'friendly' | 'party';
    };
    const restores: RestoreEff[] = [];
    for (const e of sp.effects ?? []) {
      if (e.kind !== 'restore_health' && e.kind !== 'restore_power') continue;
      if (e.kind === 'restore_power' && (e.amountPerTick ?? 0) < 0 && e.pctOfMax == null) continue;
      if (e.kind === 'restore_health' && hasModHealthRegenInCombat(sp)) continue;
      restores.push(e as RestoreEff);
    }
    if (!restores.length) {
      out.push(a);
      continue;
    }
    const he0 = restores[0]!;
    const tickMs = Math.max(1, (he0.tickMs ?? 0) | 0);
    let full = 0;
    for (const r of restores) {
      if ((r.durationMs ?? 0) > full) full = r.durationMs ?? 0;
    }

    // Wall-clock hard stop: aura fully past expiresAt (player AFK'd past duration).
    if (a.expiresAt != null && a.expiresAt <= now) {
      any = true;
      continue;
    }

    // Prefer the stored duration budget so repeated small ticks are exact. A fresh cast is a few ms
    // short of full, which would drop the final tick, so snap to full within a quarter second.
    let durRem = a.durationRemainingMs;
    if (durRem == null || !(durRem > 0)) {
      const wall = a.expiresAt != null ? Math.max(0, a.expiresAt - now) : 0;
      if (full > 0 && (wall <= 0 || wall + 250 >= full)) {
        durRem = full;
      } else {
        durRem = wall;
      }
    }
    if (durRem <= 0) {
      any = true;
      continue;
    }

    const processMs = Math.min(Math.round(seconds * 1000), durRem);
    if (processMs <= 0) {
      out.push(a);
      continue;
    }

    let nextTick = a.nextTickRemainingMs != null && a.nextTickRemainingMs > 0
      ? a.nextTickRemainingMs
      : tickMs;
    let t = 0;
    while (t < processMs) {
      const step = Math.min(nextTick, processMs - t);
      t += step;
      nextTick -= step;
      if (nextTick > 0) continue;
      // Fire every restore on this tick, flat or as a percent of maximum. A tick at the duration's end
      // is intentional: a 12 s Rejuvenation ticks at 3, 6, 9 and 12.
      for (const he of restores) {
        if (he.kind === 'restore_health') {
          const toPet = he.applyTo === 'pet' || sp.role === 'pet_heal';
          if (toPet) {
            const pet = char.pet;
            if (pet && (pet.health ?? 0) > 0 && petHealth != null) {
              const petMax = petMaxHealth(char, ds);
              const raw = he.pctOfMax != null && he.pctOfMax > 0
                ? resolvePeriodicPctOfMax({ maxResource: petMax, pctOfMax: he.pctOfMax })
                : Math.round(he.amountPerTick ?? 0);
              const amt = he.pctOfMax != null && he.pctOfMax > 0 ? raw : Math.max(1, raw);
              if (amt > 0 && petHealth < petMax) {
                petHealth = Math.min(petMax, Math.round(petHealth + amt));
              }
            }
            // ManaPerSecond POWER_HEALTH — owner pays after the pet tick.
            // Cite: SpellAuras.cpp:5686–5707; Health Funnel 755 = 5/sec.
            const mps = manaPerSecondOf(sp);
            if (mps > 0 && sp.powerType === 'health') {
              const cost = Math.max(1, Math.round(mps * tickMs / 1000));
              if (health <= cost) {
                any = true;
                nextTick = 0;
                t = processMs;
                durRem = processMs;
                break;
              }
              health -= cost;
            }
          } else {
            const raw = he.pctOfMax != null && he.pctOfMax > 0
              ? resolvePeriodicPctOfMax({ maxResource: mh, pctOfMax: he.pctOfMax })
              : Math.round(he.amountPerTick ?? 0);
            const amt = he.pctOfMax != null && he.pctOfMax > 0 ? raw : Math.max(1, raw);
            if (amt > 0 && health < mh) {
              health = Math.min(mh, Math.round(health + amt));
            }
          }
        } else {
          const raw = he.pctOfMax != null && he.pctOfMax > 0
            ? resolvePeriodicPctOfMax({ maxResource: mp, pctOfMax: he.pctOfMax })
            : Math.round(he.amountPerTick ?? 0);
          const amt = he.pctOfMax != null && he.pctOfMax > 0 ? raw : Math.max(1, raw);
          if (amt > 0 && power < mp) {
            power = Math.min(mp, Math.round(power + amt));
          }
        }
      }
      nextTick = tickMs;
    }

    const remainingAfter = durRem - processMs;
    any = true;
    if (remainingAfter > 0) {
      const next: OocHotAura = {
        spellId: a.spellId,
        expiresAt: now + remainingAfter,
        ...(a.charges != null ? { charges: a.charges } : {}),
        nextTickRemainingMs: nextTick,
        durationRemainingMs: remainingAfter,
      };
      out.push(next);
    }
    // else: duration fully consumed â€” drop aura
  }

  const petChanged = petHealth != null && char.pet != null && petHealth !== char.pet.health;
  if (!any && health === char.health && power === char.power && !petChanged) return char;
  const pruned = pruneExpiredAuras(out, now);
  return {
    ...char,
    health,
    power,
    ...(petChanged && char.pet
      ? { pet: { ...char.pet, health: petHealth! } }
      : {}),
    activeAuras: pruned,
    activeBuffs: getActiveBuffIds({ ...char, activeAuras: pruned }, now, ds),
  };
}

// Continuous out-of-combat regen for a number of seconds, off spirit and the class tables, with sitting
// multiplying health regen. Below: advance the seated well-fed gate, which standing cancels.
export function tickPendingWellFed(
  char: Character,
  ds: DataStore,
  seconds: number,
  sitting: boolean,
  now: number = Date.now(),
): Character {
  const pending = char.pendingWellFed;
  if (!pending || !(pending.triggerSpellId > 0) || !(pending.needMs > 0)) return char;
  if (!sitting) {
    if (char.pendingWellFed === undefined) return char;
    const { pendingWellFed: _drop, ...rest } = char;
    return rest as Character;
  }
  const elapsed = (pending.elapsedMs || 0) + Math.max(0, seconds) * 1000;
  if (elapsed < pending.needMs) {
    return { ...char, pendingWellFed: { ...pending, elapsedMs: elapsed } };
  }
  // Threshold met â€” cast the triggered Well Fed / Increased Stat spell.
  const dur = pending.durationMs > 0 ? pending.durationMs : 900_000;
  const staBefore = effectiveStats(char, ds).sta;
  let c = applyAura(char, pending.triggerSpellId, dur, now, ds);
  const { pendingWellFed: _done, ...cleared } = c;
  c = cleared as Character;
  // +Stamina raises max HP; bump current by the delta so the bar does not look empty.
  // Cite: game.consumeItem stamina buff path; TUNING.hpPerStamina.
  const staGain = effectiveStats(c, ds).sta - staBefore;
  if (staGain > 0) {
    const mh = maxHealth(c, ds);
    c = { ...c, health: Math.min(mh, c.health + Math.round(staGain * TUNING.hpPerStamina)) };
  }
  return c;
}

/** Sit while injured, drinking mana, or waiting on a food well-fed gate. Travel and death stand. */
export function shouldSitForOocRegen(char: Character, ds: DataStore): boolean {
  if (char.health <= 0 || char.journey) return false;
  if (char.pendingWellFed) return true;
  const mh = maxHealth(char, ds);
  if (mh > 0 && char.health < mh) return true;
  if (powerType(char) === 'mana' || classHasParallelMana(char.cls)) {
    const mp = maxMana(char, ds);
    if (mp > 0 && currentMana(char) < mp) return true;
  }
  return false;
}

/** PERIODIC_TRIGGER well-fed on a food/drink use spell. Cite: SpellAuras.cpp:4993 TriggerSpell. */
export function wellFedPendingFromItem(
  item: ItemDef | undefined,
  ds: DataStore,
): Character['pendingWellFed'] {
  if (!item?.useSpell) return undefined;
  const raw = ds.spell(item.useSpell);
  if (!raw) return undefined;
  return pendingWellFedFromEffects(resolveCombatSpell(raw).effects ?? [], ds);
}

/** Lump-sum eat already finished the channel, so the 10s amplitude has elapsed. */
export function applyWellFedFromItem(
  char: Character,
  item: ItemDef | undefined,
  ds: DataStore,
  now?: number,
): Character {
  const pending = wellFedPendingFromItem(item, ds);
  if (!pending) return char;
  return tickPendingWellFed(
    { ...char, pendingWellFed: pending },
    ds,
    pending.needMs / 1000,
    true,
    now,
  );
}

function grantSeatedWellFed(
  char: Character,
  ds: DataStore,
  pending: NonNullable<Character['pendingWellFed']>,
  now?: number,
): Character {
  return tickPendingWellFed(
    { ...char, pendingWellFed: pending },
    ds,
    pending.needMs / 1000,
    true,
    now,
  );
}

// The product of the health-regen percent auras, out of combat only, from racial passives and live
// auras. Cite: Player.cpp:2395-2398; Troll Regeneration 20555.
export function healthRegenPercentMultiplier(char: Character, ds: DataStore): number {
  let mult = 1;
  const seen = new Set<number>();
  const fold = (spellId: number): void => {
    const id = spellId | 0;
    if (!id || seen.has(id)) return;
    seen.add(id);
    const raw = ds.spell(id);
    if (!raw) return;
    const sp = resolveCombatSpell(raw, { casterLevel: char.level });
    for (const e of sp.effects ?? []) {
      if (e.kind !== 'mod_health_regen_percent') continue;
      const amt = e.amount | 0;
      if (amt) mult *= (100 + amt) / 100;
    }
  };
  for (const s of racialSpells(ds, char.race)) fold(s.id);
  for (const a of pruneExpiredAuras(char.activeAuras)) fold(a.spellId);
  return mult;
}

/** HasAuraType(94) skips OOC rage decay; 5229/29131 dummy combat also skips health regen. */
function interruptRegenFromAuras(char: Character, ds: DataStore): {
  skipRageDecay: boolean;
  dummyCombat: boolean;
} {
  let skipRageDecay = false;
  let dummyCombat = false;
  for (const a of pruneExpiredAuras(char.activeAuras)) {
    const raw = ds.spell(a.spellId);
    if (!raw) continue;
    const sp = resolveCombatSpell(raw, { casterLevel: char.level });
    for (const e of sp.effects ?? []) {
      if (e.kind !== 'interrupt_regen') continue;
      skipRageDecay = true;
      if (e.setInDummyCombatState) dummyCombat = true;
    }
  }
  return { skipRageDecay, dummyCombat };
}

export function regen(
  char: Character,
  ds: DataStore,
  seconds: number,
  sitting: boolean,
  deathFlow?: Pick<DeathFlowState, 'deathState'> | null,
): Character {
  // Reject NaN/±Inf/negative: rate×seconds would poison health/power (KI-783). Zero is a no-op.
  if (!Number.isFinite(seconds) || seconds <= 0) return char;
  // Dead/ghost: no OOC regen (KI-906 / KI-948). Cite: Player.cpp:1515–1519 if IsAlive();
  // ghost keeps SetHealth(1) (Player.cpp:4288 BuildPlayerRepop) so HP-only is wrong.
  if (!isPlayerAlive(char.health, deathFlow)) return char;
  let c: Character = { ...char };
  // Well-fed gate first so a same-tick threshold lands before spirit/HoT math.
  c = tickPendingWellFed(c, ds, seconds, sitting);
  const spi = effectiveStats(c, ds).spi;
  const mult = sitting ? TUNING.sitRegenMult : 1;
  const mh = maxHealth(c, ds);
  // Cite: SpellAuras.cpp:5111–5119; Player.cpp:2298–2304; Unit.cpp:7886–7894.
  const interruptRegen = interruptRegenFromAuras(c, ds);
  // Health regen: the spirit table times the sitting multiplier, plus the always-on flat auras, whose
  // baked amount is health per five seconds. A dummy combat state skips the spirit half.
  if (c.health < mh && !interruptRegen.dummyCombat) {
    // OOC: spirit × MOD_HEALTH_REGEN_PERCENT (88) × sit. Cite: Player.cpp:2390–2403.
    let hpPerSec = healthRegenPerSec(spi, c.level, c.cls) * healthRegenPercentMultiplier(c, ds) * mult;
    for (const a of pruneExpiredAuras(c.activeAuras)) {
      const sp = ds.spell(a.spellId);
      if (!sp) continue;
      // Only the always-on modifiers belong in the rate: the periodic heal auras are ticked discretely
      // below, and folding them in here too healed them twice.
      if (!hasModHealthRegenInCombat(sp)) continue;
      for (const e of sp.effects) {
        if (e.kind !== 'restore_health') continue;
        // Aura 161 amount is HP per 5 sec when amp is unset. Cite: materializeModHealthRegen.
        const tickMs = e.tickMs > 0 ? e.tickMs : 5000;
        const amt = e.amountPerTick | 0;
        if (amt > 0) hpPerSec += amt / (tickMs / 1000);
      }
    }
    c.health = Math.min(mh, Math.round(c.health + hpPerSec * seconds));
  }
  const pt = powerType(c);
  // Mana always regenerates, even when the active power is rage or energy: it is the parallel pool for
  // a multi-power class and the primary bar otherwise. Cite: Player.cpp:2304-2306.
  {
    const usesPrimaryMana = pt === 'mana';
    const parallelMana = !usesPrimaryMana && classHasParallelMana(c.cls);
    if (usesPrimaryMana || parallelMana) {
      const mp = usesPrimaryMana ? maxPower(c, ds) : maxMana(c, ds);
      const cur = usesPrimaryMana ? c.power : (c.mana ?? 0);
      if (cur < mp) {
        let mp5 = equippedStatBonuses(c, ds).mp5 ?? 0;
        const pctAmounts: number[] = [];
        let interruptPct = 0;
        for (const a of pruneExpiredAuras(c.activeAuras)) {
          const raw = ds.spell(a.spellId);
          if (!raw) continue;
          const sp = resolveCombatSpell(raw, { casterLevel: c.level });
          for (const e of sp.effects) {
            if (e.kind !== 'buff') continue;
            if (e.mod === 'mp5') mp5 += e.amount | 0;
            else if (e.mod === 'mana_regen_pct') pctAmounts.push(e.amount | 0);
            else if (e.mod === 'mana_regen_interrupt') interruptPct += e.amount | 0;
          }
        }
        // OOC standing uses full spirit (interrupt only under 5SR / casting).
        // Cite: Player.cpp Regenerate POWER_MANA; IsUnderLastManaUseEffect; StatSystem.cpp:547–564.
        const mult = powerRegenPercentMultiplier(pctAmounts);
        const { modManaRegen } = updateManaRegen(c.cls, spi, mp5, interruptPct, mult);
        const next = Math.min(mp, Math.round(cur + modManaRegen * seconds));
        if (usesPrimaryMana) c.power = next;
        else c.mana = next;
      }
    }
  }
  if (pt === 'energy') {
    // Energy regens in and out of combat at a flat tick (CMaNGOS Player::Regenerate POWER_ENERGY).
    // Not spirit-based; sitting does not change the rate. 10 energy/sec → full in ~10s from empty.
    const mp = maxPower(c, ds);
    if (c.power < mp) c.power = Math.min(mp, Math.round(c.power + TUNING.energyPerSec * seconds));
  } else if (pt === 'rage' && c.power > 0) {
    // HasAuraType(INTERRUPT_REGEN) skips OOC rage decay. Cite: Player.cpp:2303–2304, :2337–2340.
    if (!interruptRegen.skipRageDecay) {
      const lost = rageDecayAmount(Math.round(seconds * 1000));
      c.power = Math.max(0, Math.round((c.power - lost) * 10) / 10);
    }
  }

  // The periodic heal and energize auras, after spirit regen so their deltas stack on top of it. An
  // inline copy of this loop once ran beside it and ticked every HoT twice — measured 32 against 64.
  c = tickOocRestoreAuras(c, ds, seconds);
  // Pet health and power out of combat: power persists between fights and refills here, with happiness
  // decay and the loyalty tick for a hunter pet. Cite: Pet.cpp RegenerateAll ~698-708.
  if (c.pet && c.pet.health > 0) {
    const pmh = petMaxHealth(c, ds);
    let next = c.pet;
    if (c.pet.health < pmh) {
      next = {
        ...next,
        health: Math.min(pmh, Math.round(c.pet.health + healthRegenPerSec(spi, c.level, c.cls) * mult * seconds)),
      };
    }
    const cdef = ds.creature(c.pet.creature);
    if (cdef) {
      const { powerType: ppt, maxPower: pmp } = petMaxPower(c, cdef, ds);
      if (ppt === 'focus' && pmp > 0) {
        const cur = next.power ?? pmp;
        if (cur < pmp) {
          // 24 focus per 4s â†’ 6/sec at Rate.Focus 1.0
          const perSec = TUNING.focusPer4Sec / (TUNING.focusRegenPeriodMs / 1000);
          next = { ...next, power: Math.min(pmp, Math.round(cur + perSec * seconds)) };
        }
      } else if (ppt === 'mana' && pmp > 0) {
        const cur = next.power ?? pmp;
        if (cur < pmp) {
          // maxValue/3.0 per 4s quantum â†’ per-sec (mirrors focus OOC conversion).
          // source: Creature.cpp:830; Pet.cpp:698â€“708
          const perSec = petOocManaRegenPerSec(pmp);
          next = { ...next, power: Math.min(pmp, Math.round(cur + perSec * seconds)) };
        }
      }
      // Hunter pets only: eat absorption, then OOC happiness decay + loyalty tick.
      if (petHasHappiness(cdef)) {
        // Feed Pet Effect 1539: an in-progress feeding restores its benefit over 20s
        // (10 ticks) â€” absorbed here, cancelled by game.ts when a fight begins.
        next = tickFeeding(next, seconds);
        const loyalty = next.loyalty ?? LOYALTY_REBELLIOUS;
        const h = decayHappiness(next.happiness, loyalty, seconds, false);
        const ownerXp = ds.xpToNext(c.level);
        next = tickLoyalty(
          { ...next, happiness: h },
          seconds,
          c.level,
          Number.isFinite(ownerXp) ? ownerXp : undefined,
        );
      }
    }
    if (next !== c.pet) c.pet = next;
  }
  return c;
}

export interface ConsumeResult {
  ok: boolean;
  reason?: string;
  char: Character;
  inventory: Inventory;
  restored: number;
  kind?: 'food' | 'drink';
  // For useBuff consumables (elixirs etc.): the applied buff details (duration from DB)
  buff?: { mod: string; amount: number; durationMs: number };
  // The poison and sharpening-stone path, where the item's use spell is a temporary weapon imbue. The
  // game layer applies it to the chosen hand. Cite: SpellEffects.cpp EffectEnchantItemTmp.
  weaponImbueSpellId?: number;
  // The armor kit and arcanum path, a permanent enchant. Like the imbue it DECIDES without applying:
  // consume() does not know which slot the player picked, or even whose gear it is.
  permEnchant?: { spellId: number; enchantId: number };
  // True when this was permanent on-use gear (trinket, etc.): effect applied, item kept. Game.consumeItem
  // may start item/spell cooldown from baked data when present.
  permanentUse?: boolean;
  // Multi-aura chips — utility potions, food secondaries and trigger parents. When set, the game layer
  // applies each instead of the single use-spell path.
  applyAuras?: Array<{ spellId: number; durationMs?: number }>;
}

// On-use gear that keeps its stack slot through a use: unlimited (0) or a POSITIVE charge count, which
// runs out without being destroyed. Cite: Spell.cpp:4209 TakeCastItem — `expendable` is negative-only.
export function isPermanentOnUseGear(it: ItemDef | null | undefined): boolean {
  return it != null && castItemSurvivesUse(it);
}

// A permanent tool held in bags rather than worn — a shovel, a blackjack, a lock key. It is never
// destroyed, and the equip requirement applies only to equippable types, so it works from the bag.
function isPermanentBagTool(it: ItemDef | null | undefined): boolean {
  return it != null && it.slot == null && castItemSurvivesUse(it);
}

/** True when `itemEntry` occupies any paperdoll slot. */
export function isItemEquipped(char: Character, itemEntry: number): boolean {
  const eq = char.equipped;
  if (!eq) return false;
  for (const v of Object.values(eq)) {
    if (equippedEntry(v) === itemEntry) return true;
  }
  return false;
}

// Charges left on the unit about to be used — the worn instance when it is worn, else the first bag
// stack. No counter yet means a fresh unit at the template maximum.
function remainingChargesOf(
  char: Character,
  inv: Inventory,
  itemEntry: number,
  max: number,
): number {
  for (const v of Object.values(char.equipped ?? {})) {
    if (equippedEntry(v) !== itemEntry) continue;
    return equippedInstance(v)?.charges ?? max;
  }
  const stack = (inv.stacks ?? []).find((st) => st.item === itemEntry);
  return stack?.charges ?? max;
}

// Spend one charge off a WORN unit. The slot empties only on a NEGATIVE row; a positive one sits at 0
// charges and refuses further use. Null when not worn. Cite: Spell.cpp:4209 TakeCastItem.
function spendWornCharge(
  char: Character,
  itemEntry: number,
  max: number,
  expendable: boolean,
): Character | null {
  if (!char.equipped) return null;
  const next = { ...char.equipped };
  let spent = false;
  for (const slot of Object.keys(next) as (keyof typeof next)[]) {
    if (equippedEntry(next[slot]) !== itemEntry) continue;
    const inst = equippedInstance(next[slot]);
    if (!inst) continue;
    const left = (inst.charges ?? max) - 1;
    if (left <= 0 && expendable) delete next[slot];
    else next[slot] = { ...inst, charges: Math.max(0, left) };
    spent = true;
  }
  return spent ? { ...char, equipped: next } : null;
}

// The inventory after a use. Three outcomes from the charge column's sign: unlimited spends nothing, a
// positive count decrements and keeps the item, a negative one destroys it at zero. Cite: Spell.cpp:4209.
function takeForUse(
  char: Character,
  inv: Inventory,
  itemEntry: number,
  permanent: boolean,
  it?: ItemDef | null,
): { ok: true; inventory: Inventory; permanentUse: boolean; char?: Character } | { ok: false; reason: string } {
  const safeInv = inv && inv.stacks ? inv : { stacks: [] as Inventory['stacks'] };
  const equipped = isItemEquipped(char, itemEntry);
  // An equippable is used from the paperdoll, never from the bag it is sitting in.
  // Cite: HandleUseItemOpcode InventoryType gate (same rule as combatItems).
  if (it?.slot != null && !equipped) return { ok: false, reason: 'Must be equipped' };

  const charges = it?.charges ?? 0;
  const max = maxChargesOf(it);
  const expendable = isExpendableCastItem(it);
  if (charges === 0) {
    // No charge column: unlimited for a permanent tool, one unit per use for anything else.
    if (permanent) return { ok: true, inventory: safeInv as Inventory, permanentUse: true };
    const taken = consumeItemCharges(safeInv as Inventory, itemEntry, it);
    if (!taken.ok) return { ok: false, reason: "You don't have this" };
    return { ok: true, inventory: taken.inventory, permanentUse: false };
  }
  // Charge-bearing: a spent unit refuses before any effect runs, and is not destroyed by trying.
  const remaining = remainingChargesOf(char, safeInv as Inventory, itemEntry, max);
  if (!hasChargesLeft(it, remaining)) return { ok: false, reason: NO_CHARGES_REMAIN };
  if (equipped) {
    const worn = spendWornCharge(char, itemEntry, max, expendable);
    if (worn) return { ok: true, inventory: safeInv as Inventory, permanentUse: !expendable, char: worn };
  }
  const taken = consumeItemCharges(safeInv as Inventory, itemEntry, it);
  if (!taken.ok) return { ok: false, reason: taken.reason };
  return { ok: true, inventory: taken.inventory, permanentUse: !expendable };
}

/** One expanded useSpell effect tagged with the aura spell id that owns it. */
type UseSpellWork = {
  auraSpellId: number;
  e: { kind: string; spellId?: number; [k: string]: unknown };
};

// Expand a use spell for an out-of-combat consume, following ONE level of trigger so a dual food
// restores both halves. Periodic triggers are NOT expanded — those wait for the seated well-fed gate.
function expandUseSpellWork(
  sp: { id?: number; effects?: ReadonlyArray<{ kind: string; spellId?: number; [k: string]: unknown }> },
  useSpId: number,
  ds: DataStore,
): UseSpellWork[] {
  const out: UseSpellWork[] = [];
  for (const e of sp.effects ?? []) {
    if (e.kind === 'trigger_spell' && typeof e.spellId === 'number' && e.spellId > 0) {
      const childRaw = ds.spell(e.spellId);
      if (!childRaw) {
        // Outcome spell absent from bake (Noggenfogger 16595/93/91) â€” still land a chip.
        out.push({
          auraSpellId: e.spellId,
          e: { kind: 'buff', mod: 'transform', amount: 1, durationMs: 0 },
        });
        continue;
      }
      const child = resolveCombatSpell(childRaw);
      const childId = child.id || e.spellId;
      const childFx = child.effects ?? [];
      if (!childFx.length) {
        out.push({
          auraSpellId: childId,
          e: { kind: 'buff', mod: 'transform', amount: 1, durationMs: 0 },
        });
        continue;
      }
      for (const ce of childFx) {
        out.push({ auraSpellId: childId, e: ce as UseSpellWork['e'] });
      }
    } else {
      out.push({ auraSpellId: useSpId, e: e as UseSpellWork['e'] });
    }
  }
  return out;
}

/** Flat effects list (pendingWellFed / channel checks). */
function workEffects(work: UseSpellWork[]): Array<{ kind: string; [k: string]: unknown }> {
  return work.map((w) => w.e);
}

// The first periodic-trigger payload on a food or drink channel: the amplitude is the wait and the
// duration comes off the triggered spell's own buff. Cite: spell_template EffectAmplitude.
function pendingWellFedFromEffects(
  effects: ReadonlyArray<{ kind: string; [k: string]: unknown }>,
  ds: DataStore,
): Character['pendingWellFed'] | undefined {
  let best: Character['pendingWellFed'] | undefined;
  for (const e of effects) {
    // Aura 23 PERIODIC_TRIGGER (Herb Baked Egg) uses triggerSpellId; SPELL_EFFECT_TRIGGER_SPELL 64
    // (Nightfin Soup 18233 → 18194) uses spellId. Cite: SpellEffects.cpp EffectTriggerSpell.
    let triggerSpellId = 0;
    let needMs = 0;
    if (e.kind === 'proc_trigger_spell') {
      triggerSpellId = Number(e.triggerSpellId) || 0;
      needMs = Number(e.tickMs) || 0;
      if (needMs <= 0) continue;
    } else if (e.kind === 'trigger_spell') {
      triggerSpellId = Number(e.spellId) || 0;
      needMs = Number(e.tickMs) || 10_000;
    } else continue;
    if (triggerSpellId <= 0) continue;
    const trigRaw = ds.spell(triggerSpellId);
    if (!trigRaw) continue;
    const trig = resolveCombatSpell(trigRaw);
    // Stat Well Fed is kind:buff; Sagefish Brain Food / Nightfin 18194 is long restore_power (mp5).
    const payloads = (trig.effects ?? []).filter(
      (ce) => ce.kind === 'buff' || ce.kind === 'restore_power' || ce.kind === 'restore_health',
    );
    if (!payloads.length) continue;
    let durationMs = 0;
    for (const b of payloads) {
      const d = Number((b as { durationMs?: number }).durationMs) || 0;
      if (d > durationMs) durationMs = d;
    }
    if (!(durationMs > 0)) continue;
    // Effect 64 also fires the 21s sit-and-eat (Sagefish 25888). Keep the carried buff.
    if (e.kind === 'trigger_spell' && durationMs <= LONG_REGEN_AURA_MS) continue;
    const row = { triggerSpellId, needMs, elapsedMs: 0, durationMs };
    if (!best || durationMs > best.durationMs) best = row;
  }
  return best;
}

/** SharedDefines Powers â†’ Character powerType string. Cite: SharedDefines.h Powers. */
function energizePowerWanted(powerTypeId: number): 'mana' | 'rage' | 'energy' | null {
  if (powerTypeId === 0) return 'mana';
  if (powerTypeId === 1) return 'rage';
  if (powerTypeId === 3) return 'energy';
  return null;
}

/** Sit-and-eat food/drink channels are ≤ ~30s; 1h regen pots (Troll's Blood / Mageblood) stick as auras. */
export const LONG_REGEN_AURA_MS = 60_000;

// True when a short restore must tick as an aura rather than dump: a bandage channel, or a multi-effect
// channel with a control payload. Pure food and drink keep the instant dump.
function mustTickRestoreChannel(
  sp: { mechanic?: string },
  effects: ReadonlyArray<{ kind: string }>,
): boolean {
  if (sp.mechanic === 'bandage') return true;
  return effects.some((e) => {
    if (
      e.kind === 'restore_health'
      || e.kind === 'restore_power'
      || e.kind === 'trigger_spell'
      || e.kind === 'proc_trigger_spell'
      || e.kind === 'buff'
      || e.kind === 'resist'
    ) {
      return false;
    }
    return true;
  });
}

// The prefer-effect fast path may dump only a short pure food or drink. An hour-long regen, a bandage
// or a cooking secondary defers to the full consume.
export function canPreferConsumableDump(
  item: ItemDef,
  cons: NonNullable<ItemDef['consumable']>,
  ds: DataStore,
): boolean {
  if ((cons.durationMs | 0) > LONG_REGEN_AURA_MS) return false;
  const useSp = item.useSpell ?? 0;
  if (!(useSp > 0)) return true;
  const spRaw = ds.spell(useSp);
  if (!spRaw) return true;
  const sp = resolveCombatSpell(spRaw);
  if (sp.mechanic === 'bandage') return false;
  for (const e of sp.effects ?? []) {
    if (e.kind === 'trigger_spell' || e.kind === 'proc_trigger_spell') return false;
    if (e.kind !== 'restore_health' && e.kind !== 'restore_power') return false;
    if ((Number((e as { durationMs?: number }).durationMs) || 0) > LONG_REGEN_AURA_MS) return false;
  }
  return true;
}

// Eat food or drink, or use a buff consumable, out of combat only. A multi-effect use spell applies ALL
// its resolved effects — never returning after the first heal or energize.
export function consume(
  char: Character,
  inv: Inventory,
  ds: DataStore,
  itemEntry: number,
  deathFlow?: Pick<DeathFlowState, 'deathState'> | null,
): ConsumeResult {
  const fail = (reason: string): ConsumeResult => ({ ok: false, reason, char, inventory: inv, restored: 0 });
  // Dead/ghost cannot eat/drink (KI-948). Cite: Player.cpp:9740 CanUseItem !IsAlive;
  // ghost HP=1 (Player.cpp:4288) still fails IsAlive.
  if (!isPlayerAlive(char.health, deathFlow)) return fail(YOU_ARE_DEAD);
  const it = ds.item(itemEntry);
  if (!it) return fail('Unknown item');
  // A recipe or book is never consumed here: its use spell is the learn stub carrying the taught
  // spell's mirrored effects, so this branch would eat the book and teach nothing.
  if (itemTeachIntent(it, ds)) return fail('Read it from your bags to learn it');
  const permanent = isPermanentOnUseGear(it);

  // The item's own required level is the ONLY bag-use floor. A spell level over-gates a potion and a
  // hollow one under-gates an elixir. Cite: Player.cpp:9797 CanUseItem.
  const itemReq = (it.requiredLevel | 0);
  if (itemReq > 0 && char.level < itemReq) return fail(`Requires level ${itemReq}`);

  // Priority: the cached single-mod buff, then the full use spell, then the in-combat item, then food.
  // The use spell wins when it carries non-buff payloads, as a stat buff plus an inebriate does.
  const useB = it.useBuff;
  const useSp = it.useSpell;
  let skipUseBuff = false;
  if (useB && useSp) {
    const spRaw = ds.spell(useSp);
    if (spRaw) {
      const fx = resolveCombatSpell(spRaw).effects ?? [];
      if (fx.length > 0 && fx.some((e) => e.kind !== 'buff')) skipUseBuff = true;
    }
  }
  if (useB && !skipUseBuff) {
    const taken = takeForUse(char, inv, itemEntry, permanent, it);
    if (!taken.ok) return fail(taken.reason);
    const c: Character = { ...(taken.char ?? char) };
    return {
      ok: true, char: c, inventory: taken.inventory, restored: 0,
      buff: { mod: useB.mod, amount: useB.amount, durationMs: useB.durationMs },
      permanentUse: taken.permanentUse || undefined,
    };
  }
  if (useSp) {
    const spRaw = ds.spell(useSp);
    // SI5: materialize weapon_imbue / restore_* / mechanic_immunity / speed when bake effects[] empty.
    const sp = spRaw ? resolveCombatSpell(spRaw) : undefined;
    if (sp) {
      const work = expandUseSpellWork(sp, useSp, ds);
      const effects = workEffects(work);

      // Offensive items (grenades, bombs, damage trinkets) cannot be self-consumed out of combat.
      const isHostileOnly = effects.some((e) => e.kind === 'direct_damage' || e.kind === 'dot' || (e.kind === 'cc' && !!(e as { mechanic?: string }).mechanic))
        && !effects.some((e) => e.kind === 'energize' || e.kind === 'heal' || e.kind === 'buff' || e.kind === 'restore_health' || e.kind === 'restore_power');
      if (isHostileOnly) return fail('Requires an enemy target');

      // A pure power restore refuses a wrong power type BEFORE the item is taken, so the stack is kept:
      // the energize already no-ops on a mismatch, but the item was destroyed anyway.
      const hasManaEnergize = effects.some(
        (e) => e.kind === 'energize' && (e as { powerType?: number }).powerType === 0,
      );
      const hasRageEnergize = effects.some(
        (e) => e.kind === 'energize' && (e as { powerType?: number }).powerType === 1,
      );
      const hasEnergyEnergize = effects.some(
        (e) => e.kind === 'energize' && (e as { powerType?: number }).powerType === 3,
      );
      const hasManaRestore = effects.some((e) => e.kind === 'restore_power');
      const hasSidePayload = effects.some((e) =>
        e.kind === 'heal'
        || e.kind === 'restore_health'
        || e.kind === 'buff'
        || e.kind === 'resist'
        || e.kind === 'proc_trigger_spell'
        || e.kind === 'mechanic_immunity'
        || e.kind === 'school_immunity'
        || e.kind === 'damage_immunity'
        || e.kind === 'speed'
        || e.kind === 'pacify'
        || e.kind === 'weapon_imbue'
        || e.kind === 'school_absorb'
        || e.kind === 'direct_damage'
        || e.kind === 'cc'
        || e.kind === 'root'
        || e.kind === 'dispel'
        || e.kind === 'dispel_mechanic'
        || e.kind === 'reflect'
        || e.kind === 'stealth_detect'
        || e.kind === 'mod_invisibility'
        || e.kind === 'track_creatures'
        || e.kind === 'mod_invisibility_detection'
        || e.kind === 'mod_scale',
      );
      const tickChannel = mustTickRestoreChannel(sp, effects);
      const charPt = powerType(char);
      // Pure mana pots / drink restore: non-mana classes cannot use (item preserved).
      if ((hasManaEnergize || hasManaRestore) && charPt !== 'mana' && !hasSidePayload) {
        return fail("You don't use mana");
      }
      // Rune path: energize + direct_damage only — still mana-gated (no warrior free mana).
      if (hasManaEnergize && charPt !== 'mana') {
        const onlyRuneShape = effects.every(
          (e) => e.kind === 'energize' || e.kind === 'direct_damage',
        );
        if (onlyRuneShape) return fail("You don't use mana");
      }
      // Pure rage pots (5631/5633): non-rage classes refuse like mana pots. Cite: KI-757.
      if (hasRageEnergize && charPt !== 'rage' && !hasSidePayload) {
        return fail("You don't use rage");
      }
      // Pure energy (Thistle Tea 7676): same gate for energy classes only.
      if (hasEnergyEnergize && charPt !== 'energy' && !hasSidePayload) {
        return fail("You don't use energy");
      }

      // Spell reagents are ADDITIONAL to the cast item itself: an essence combine spends the item plus
      // two more as reagents. Cite: Spell.cpp:6560-6593 CheckItems; :4332-4350 TakeReagents.
      const spellReagents = spRaw?.reagents ?? [];
      {
        const need = new Map<number, number>();
        // The cast item counts against the BAGS only when that is where it lives: a worn charged
        // trinket spends a charge off the equipped instance, not a bag stack.
        if (!permanent && !isItemEquipped(char, itemEntry)) {
          need.set(itemEntry, (need.get(itemEntry) ?? 0) + 1);
        }
        for (const r of spellReagents) {
          if ((r.item | 0) <= 0 || (r.count | 0) <= 0) continue;
          need.set(r.item, (need.get(r.item) ?? 0) + r.count);
        }
        for (const [entry, n] of need) {
          if (countItem(inv, entry) < n) {
            const idef = ds.item(entry);
            return fail(idef ? `Requires ${n}× ${idef.name}` : `Missing reagents (item ${entry})`);
          }
        }
      }

      // A create-item on a use spell, such as an empty vial to a filled one. The bag fit is probed AFTER
      // the cast item and reagents are spent, and refused before the take — never destroy without grant.
      {
        const conjures: Array<{ kind: 'conjure'; item: number; count: number }> = [];
        for (const e of effects) {
          if (e.kind !== 'conjure') continue;
          const item = Number(e.item) | 0;
          const count = Number(e.count) | 0;
          if (item > 0 && count > 0) conjures.push({ kind: 'conjure', item, count });
        }
        if (conjures.length > 0) {
          const cap = bagCapacity(char, ds);
          let probe = inv;
          // Bag-space dry run. A worn charged item frees no bag slot, so it is not probed here.
          if (!permanent && !isItemEquipped(char, itemEntry)) {
            const [afterTake, removed] = removeItem(inv, itemEntry, 1);
            if (removed <= 0) return fail("You don't have this");
            probe = afterTake;
          }
          for (const r of spellReagents) {
            if ((r.item | 0) <= 0 || (r.count | 0) <= 0) continue;
            const [afterRg, rgRemoved] = removeItem(probe, r.item, r.count);
            if (rgRemoved < r.count) return fail('Missing reagents');
            probe = afterRg;
          }
          for (const ce of conjures) {
            const maxStack = ds.item(ce.item)?.stackable ?? 1;
            if (!canFit(probe, ce.item, ce.count, maxStack, cap)) {
              return fail('Your bags are full');
            }
            probe = addItem(probe, ce.item, ce.count, maxStack);
          }
        }
      }

      // Bandage lockout before spend. Cite: Spell.cpp:3114 AddPrecastSpell(11196).
      if (sp.mechanic === 'bandage' && refuseCmangosCheckCast(sp, {
        auraSpellIds: new Set(getActiveBuffIds(char, Date.now(), ds)),
      }, undefined, false)) {
        return fail(ds.spell(RECENTLY_BANDAGED_SPELL_ID)?.name ?? 'Recently Bandaged');
      }
      const taken = takeForUse(char, inv, itemEntry, permanent, it);
      if (!taken.ok) return fail(taken.reason);
      let c: Character = { ...(taken.char ?? char) };
      let invOut = taken.inventory;
      for (const r of spellReagents) {
        if ((r.item | 0) <= 0 || (r.count | 0) <= 0) continue;
        const [afterRg, rgRemoved] = removeItem(invOut, r.item, r.count);
        if (rgRemoved < r.count) return fail('Missing reagents');
        invOut = afterRg;
      }
      let restored = 0;
      let kind: 'food' | 'drink' | undefined;
      let buff: { mod: string; amount: number; durationMs: number } | undefined;
      let weaponImbueSpellId: number | undefined;
      let permEnchant: { spellId: number; enchantId: number } | undefined;
      const applyAuras: Array<{ spellId: number; durationMs?: number }> = [];
      const queuedAuraIds = new Set<number>();

      const stickAura = (mod: string, amount: number, durationMs: number) => {
        if (!(durationMs > 0)) return;
        if (!buff || durationMs > buff.durationMs) {
          buff = { mod, amount, durationMs };
        }
      };
      /** Queue a real aura chip under the owning spell id (food secondaries, utility pots). */
      const queueAura = (spellId: number, mod: string, amount: number, durationMs: number) => {
        if (spellId > 0 && !queuedAuraIds.has(spellId)) {
          queuedAuraIds.add(spellId);
          applyAuras.push({ spellId, durationMs: durationMs > 0 ? durationMs : undefined });
        }
        stickAura(mod, amount, durationMs > 0 ? durationMs : 1);
      };

      // Food/drink seated well-fed: arm AFTER restores so we know kind, but detect now for
      // proc_trigger skip (do not double-apply the parent as an instant aura).
      const willArmPendingWellFed = effects.some((e) => e.kind === 'restore_health')
        || effects.some((e) => e.kind === 'restore_power' && Number(e.durationMs) > 0
          && Number(e.durationMs) <= LONG_REGEN_AURA_MS);

      // Apply ALL effects — do not early-return after first heal/energize (KI-492, KI-493).
      for (const { auraSpellId, e } of work) {
        if (e.kind === 'conjure') {
          const itemId = Number(e.item) | 0;
          const count = Math.max(1, Number(e.count) | 0);
          if (itemId > 0) {
            const maxStack = ds.item(itemId)?.stackable ?? 1;
            invOut = addItem(invOut, itemId, count, maxStack);
          }
          continue;
        }
        if (e.kind === 'restore_health' || e.kind === 'restore_power') {
          const amountPerTick = Number(e.amountPerTick) || 0;
          const durationMs = Number(e.durationMs) || 0;
          const tickMs = Number(e.tickMs) || 3000;
          // Long-duration MOD_HEALTH_REGEN_IN_COMBAT (161) / hour-long mana regen: aura, not food dump.
          // Cite: Player.cpp RegenerateHealth aura 161; KI-495 / KI-443 sibling.
          if (durationMs > LONG_REGEN_AURA_MS) {
            const mod = e.kind === 'restore_health' ? 'health_regen' : 'mp5';
            // Nightfin Soup secondary (18194) is a long restore_power on the child spell id.
            queueAura(auraSpellId, mod, amountPerTick, durationMs);
            continue;
          }
          // A bandage or a multi-effect channel potion sticks its aura so the tick loop delivers the
          // amount over the duration. Do NOT lump-sum it as food.
          if (tickChannel && durationMs > 0) {
            const mod = e.kind === 'restore_health' ? 'restore_health' : 'restore_power';
            queueAura(auraSpellId, mod, amountPerTick, durationMs);
            continue;
          }
          // An instant full-period restore for an out-of-combat channel, the same total as the ticks.
          // A percent-of-max aura ticks a PERCENTAGE: reading it flat healed Harvest Fish 2 a second.
          const ticks = Math.max(1, Math.floor(durationMs / tickMs));
          const pctOfMax = Number((e as { pctOfMax?: number }).pctOfMax) || 0;
          const maxRes = e.kind === 'restore_health' ? maxHealth(c, ds) : maxPower(c, ds);
          const perTick = pctOfMax > 0 ? Math.floor((maxRes * pctOfMax) / 100) : amountPerTick;
          const amt = Math.round(perTick * ticks);
          if (e.kind === 'restore_health') {
            const before = c.health;
            c.health = Math.min(maxHealth(c, ds), before + amt);
            restored += Math.max(0, c.health - before);
            if (!kind) kind = 'food';
          } else if (powerType(c) === 'mana') {
            const before = c.power;
            c.power = Math.min(maxPower(c, ds), before + amt);
            restored += Math.max(0, c.power - before);
            kind = kind === 'food' ? kind : 'drink';
          }
          continue;
        }
        if (e.kind === 'cc' || e.kind === 'root') {
          // Dreamless Sleep (and any self-CC consumable): stick so Game.consumeItem applies the
          // useSpell aura for the full channel. Cite: spell 15822/24360; KI-707.
          const durationMs = Number((e as { durationMs?: number }).durationMs) || 0;
          const control = e.kind === 'root'
            ? 'root'
            : String((e as { control?: string; mechanic?: string }).control
              ?? (e as { mechanic?: string }).mechanic
              ?? 'cc');
          queueAura(auraSpellId, control, 1, durationMs);
          continue;
        }
        if (e.kind === 'heal') {
          const min = Number((e as { min?: number }).min) || 0;
          const max = Number((e as { max?: number }).max) || 0;
          const amt = Math.round((min + max) / 2);
          const before = c.health;
          c.health = Math.min(maxHealth(c, ds), before + amt);
          restored += Math.max(0, c.health - before);
          continue;
        }
        if (e.kind === 'energize') {
          // Instant power restore â€” mana pots, Thistle Tea energy, rage potions.
          // Cite: SpellEffects.cpp EffectEnergize; SharedDefines Powers; KI-646.
          const power = Number((e as { powerType?: number }).powerType);
          const want = energizePowerWanted(power);
          if (!want || powerType(c) !== want) continue;
          const min = Number((e as { min?: number }).min) || 0;
          const max = Number((e as { max?: number }).max) || 0;
          const amt = Math.round((min + max) / 2);
          const before = c.power;
          c.power = Math.min(maxPower(c, ds), before + amt);
          restored += Math.max(0, c.power - before);
          continue;
        }
        if (e.kind === 'direct_damage') {
          // Self-cost payloads (Demonic/Dark Rune). Deterministic avg; floor at 1 HP OOC.
          // Cite: SpellEffects.cpp EffectSchoolDMG; spell 16666/27869 raw effect 2.
          const min = Number((e as { min?: number }).min) || 0;
          const max = Number((e as { max?: number }).max) || 0;
          const amt = Math.round((min + max) / 2);
          if (amt > 0) c.health = Math.max(1, c.health - amt);
          continue;
        }
        if (e.kind === 'buff') {
          const mod = String((e as { mod?: string }).mod ?? 'unknown');
          const amount = Number((e as { amount?: number }).amount) || 0;
          const durationMs = Number((e as { durationMs?: number }).durationMs) || 0;
          queueAura(auraSpellId, mod, amount, durationMs);
          continue;
        }
        if (e.kind === 'resist') {
          // A resistance aura — the flasks and resist elixirs. The bake often omits the duration on a
          // resist row, so it comes off the spell's own duration index. Cite: HandleModResistance.
          const amount = Number((e as { amount?: number }).amount) || 0;
          if (amount <= 0) continue;
          let durationMs = Number((e as { durationMs?: number }).durationMs) || 0;
          if (!(durationMs > 0) && auraSpellId > 0) {
            const owner = ds.spell(auraSpellId);
            const fromIdx = owner?.durationIndex != null ? durMs(owner.durationIndex) : undefined;
            if (fromIdx != null && fromIdx > 0) durationMs = fromIdx;
          }
          queueAura(auraSpellId, 'resist', amount, durationMs);
          continue;
        }
        if (
          e.kind === 'mechanic_immunity'
          || e.kind === 'school_immunity'
          || e.kind === 'damage_immunity'
          || e.kind === 'pacify'
        ) {
          // Utility pots (Free Action, Living Action, LIP). Game.consumeItem sticks aura via buff.
          // Cite: SpellAuras HandleModMechanicImmunity / SchoolImmunity; KI-494.
          const durationMs = Number((e as { durationMs?: number }).durationMs) || 0;
          queueAura(auraSpellId, e.kind, 1, durationMs);
          continue;
        }
        if (e.kind === 'speed') {
          // Swiftness / Swim Speed potions. Cite: Unit::UpdateSpeed; aura 31/58.
          const durationMs = Number((e as { durationMs?: number }).durationMs) || 0;
          const pct = Number((e as { pct?: number }).pct) || 0;
          queueAura(auraSpellId, 'speed', pct, durationMs);
          continue;
        }
        if (e.kind === 'mod_scale') {
          // SPELL_AURA_MOD_SCALE (61) — Noggenfogger shrink/grow. Cosmetic size aura.
          // Cite: SpellAuras.cpp HandleAuraModScale; applySpellLate mod_scale; KI-908.
          let durationMs = Number((e as { durationMs?: number }).durationMs) || 0;
          if (!(durationMs > 0) && auraSpellId > 0) {
            const owner = ds.spell(auraSpellId);
            const fromIdx = owner?.durationIndex != null ? durMs(owner.durationIndex) : undefined;
            if (fromIdx != null && fromIdx > 0) durationMs = fromIdx;
          }
          const pct = Number((e as { pct?: number }).pct) || 0;
          queueAura(auraSpellId, 'mod_scale', pct, durationMs);
          continue;
        }
        if (e.kind === 'school_absorb' || e.kind === 'mana_shield') {
          const durationMs = Number((e as { durationMs?: number }).durationMs) || 0;
          const min = Number((e as { min?: number }).min) || 0;
          const max = Number((e as { max?: number }).max) || min;
          queueAura(auraSpellId, e.kind, Math.round((min + max) / 2), durationMs);
          continue;
        }
        if (
          e.kind === 'stealth_detect'
          || e.kind === 'mod_invisibility'
          || e.kind === 'mod_invisibility_detection'
          || e.kind === 'track_creatures'
          || e.kind === 'track_resources'
          || e.kind === 'water_breathing'
          || e.kind === 'mod_water_breathing'
          || e.kind === 'water_walk'
          || e.kind === 'safe_fall'
          || e.kind === 'feather_fall'
          || e.kind === 'hover'
          || e.kind === 'reflect'
          || e.kind === 'aura_dummy_holder'
          || e.kind === 'aura_dummy'
          || e.kind === 'add_farsight'
        ) {
          // Utility pots / elixirs: Catseye, invis, Detect Undead, Water Breathing, Dream Vision.
          // Cite: oocCastEffects; SpellAuras ReflectSpells / WaterBreathing; KI-592/593/625/647/665.
          let durationMs = Number((e as { durationMs?: number }).durationMs) || 0;
          if (!(durationMs > 0) && auraSpellId > 0) {
            const owner = ds.spell(auraSpellId);
            const fromIdx = owner?.durationIndex != null ? durMs(owner.durationIndex) : undefined;
            if (fromIdx != null && fromIdx > 0) durationMs = fromIdx;
          }
          const amount = Number(
            (e as { amount?: number; pct?: number }).amount
              ?? (e as { pct?: number }).pct
              ?? 1,
          ) || 1;
          if (e.kind === 'aura_dummy_holder' || e.kind === 'aura_dummy') {
            const owner = auraSpellId > 0 ? ds.spell(auraSpellId) : undefined;
            const mixed = owner?.effects?.some(
              (x) => x.kind !== 'aura_dummy' && x.kind !== 'aura_dummy_holder',
            );
            if (mixed) continue;
            if (!(durationMs > 0) && ((owner?.durationIndex ?? 0) | 0) !== 21 && !owner?.passive) continue;
          }
          queueAura(auraSpellId, e.kind, amount, durationMs);
          continue;
        }
        if (e.kind === 'dispel') {
          // Antidote / Jungle Remedy / Elixir of Poison Resistance â€” strip matching auras OOC.
          // Cite: SpellEffects.cpp EffectDispel; domain/spells/dispel.ts; KI-556.
          const mask = getDispelMask(Number((e as { dispelType?: number }).dispelType) || 0);
          let remaining = Math.max(1, Number((e as { count?: number }).count) || 1);
          if (mask && remaining > 0 && c.activeAuras?.length) {
            const kept: typeof c.activeAuras = [];
            for (const a of c.activeAuras) {
              if (remaining <= 0) { kept.push(a); continue; }
              const auraSp = ds.spell(a.spellId);
              const dt = (auraSp?.dispel ?? 0) | 0;
              if (dt > 0 && (getDispelMask(dt) & mask) !== 0) {
                remaining -= 1;
                continue;
              }
              kept.push(a);
            }
            c = {
              ...c,
              activeAuras: kept,
              activeBuffs: getActiveBuffIds({ ...c, activeAuras: kept }, Date.now(), ds),
            };
          }
          continue;
        }
        if (e.kind === 'dispel_mechanic') {
          // Restorative Potion family / item DISPEL_MECHANIC. Cite: SpellEffects.cpp:2499–2519.
          const mechanic = Number((e as { mechanic?: number }).mechanic) || 0;
          const count = Math.max(1, Number((e as { count?: number }).count) || 1);
          if (mechanic && c.activeAuras?.length) {
            const rng = {
              next: () => 0.5,
              int: (min: number, max: number) => Math.min(max, Math.max(min, min)),
            };
            const { kept, removed } = peelMechanicAuras(
              c.activeAuras, mechanic, count, (id) => ds.spell(id), rng,
            );
            if (removed.length) {
              c = {
                ...c,
                activeAuras: kept,
                activeBuffs: getActiveBuffIds({ ...c, activeAuras: kept }, Date.now(), ds),
              };
              if (mechanic === MECHANIC_MOUNT && c.mountedItem != null) {
                const d = dismount(c);
                if (d.ok) c = d.char;
              }
            }
          }
          continue;
        }
        if (e.kind === 'proc_trigger_spell') {
          // A food's well-fed metronome waits on the seated gate, so no instant apply. A restorative
          // potion or an oil is its OWN aura, whose parent IS the periodic effect.
          const triggerSpellId = Number((e as { triggerSpellId?: number }).triggerSpellId) || 0;
          const durationMs = Number((e as { durationMs?: number }).durationMs) || 0;
          const needMs = Number((e as { tickMs?: number }).tickMs) || 0;
          const isFoodGate = willArmPendingWellFed && needMs > 0 && triggerSpellId > 0
            && !!pendingWellFedFromEffects([e], ds);
          if (isFoodGate) continue;
          if (durationMs > 0 || triggerSpellId > 0) {
            queueAura(auraSpellId, 'proc_trigger_spell', triggerSpellId || 1, durationMs || 1);
          }
          continue;
        }
        if (e.kind === 'weapon_imbue') {
          weaponImbueSpellId = useSp;
          continue;
        }
        if (e.kind === 'enchant_item_perm') {
          // Decide only. consume() does not know which slot was chosen, and the target may be
          // a companion's gear rather than this character's â€” Game.consumeItem writes it.
          permEnchant = { spellId: useSp, enchantId: Number((e as { enchantId?: number }).enchantId) || 0 };
          continue;
        }
        if (e.kind === 'inebriate') {
          // Alcohol: baked drunkMod (= damage×256). Cite: EffectInebriate; KI-734.
          const mod = Number((e as { drunkMod?: number }).drunkMod) || 0;
          if (mod > 0) c = { ...c, drunkValue: applyInebriate(c.drunkValue, mod) };
          continue;
        }
      }

      // Precast Recently Bandaged on the unit that was bandaged (self on this path).
      // Cite: Spell.cpp:3114 MECHANIC_BANDAGE AddPrecastSpell(11196).
      if (sp.mechanic === 'bandage') {
        const recently = ds.spell(RECENTLY_BANDAGED_SPELL_ID);
        const imm = recently?.effects?.find((e) => e.kind === 'mechanic_immunity');
        const dur = imm && imm.kind === 'mechanic_immunity' ? (imm.durationMs | 0) : 0;
        if (dur > 0) queueAura(RECENTLY_BANDAGED_SPELL_ID, 'mechanic_immunity', 1, dur);
      }

      // Lump-sum restore already finished the sit-channel, so the aura-23 amplitude has elapsed.
      // Cite: SpellAuras.cpp:4993 TriggerSpell; Food 24869 amp=10000 → Well Fed 24870.
      const pending = (kind === 'food' || kind === 'drink'
        || effects.some((e) => e.kind === 'restore_health' || e.kind === 'restore_power'))
        ? pendingWellFedFromEffects(effects, ds)
        : undefined;
      if (pending) {
        c = grantSeatedWellFed(c, ds, pending);
        if (pending.triggerSpellId > 0 && !queuedAuraIds.has(pending.triggerSpellId)) {
          queuedAuraIds.add(pending.triggerSpellId);
          applyAuras.push({ spellId: pending.triggerSpellId, durationMs: pending.durationMs });
        }
      }

      return {
        ok: true,
        char: c,
        inventory: invOut,
        restored,
        kind,
        buff,
        weaponImbueSpellId,
        permEnchant,
        permanentUse: taken.permanentUse || undefined,
        applyAuras: applyAuras.length ? applyAuras : undefined,
      };
    }
  }

  // The in-combat item cache is used only when there is no use spell, which is preferred so a
  // dual-resource item is not truncated to its health half. The level is already gated on the item.
  const uic = it.useInCombat;
  if (uic) {
    // min/max are optional on the bake. Without them this computed NaN and wrote NaN into
    // char.health / char.power, which then persists into the save â€” check BEFORE consuming.
    const amt = Math.round(((uic.min ?? 0) + (uic.max ?? 0)) / 2); // deterministic avg out of combat
    if (!(amt > 0)) return fail('This item has no restore amount in the bake');
    const taken = takeForUse(char, inv, itemEntry, permanent, it);
    if (!taken.ok) return fail(taken.reason);
    const c: Character = { ...(taken.char ?? char) };
    let restored = 0;
    if (uic.effect === 'restore_health') {
      const before = c.health;
      c.health = Math.min(maxHealth(c, ds), before + amt);
      restored = c.health - before;
    } else if (powerTypeName((uic.powerType ?? 0) | 0) === powerType(c)) {
      // A Mana Potion pays mana and a Thistle Tea energy; the wrong bar gets nothing.
      // Cite: SpellEffects.cpp EffectEnergize EffectMiscValue; item.ts useInCombat.powerType.
      const before = c.power;
      c.power = Math.min(maxPower(c, ds), before + amt);
      restored = c.power - before;
    }
    return {
      ok: true, char: c, inventory: taken.inventory, restored,
      kind: uic.effect === 'restore_health' ? undefined : 'drink' as any,
      permanentUse: taken.permanentUse || undefined,
    };
  }

  const cons = it.consumable;
  if (cons) {
    // Level already gated on item.requiredLevel (food bake may stamp cons.reqLevel from item).
    if (cons.effect === 'drink' && powerType(char) !== 'mana') return fail("You don't use mana");

    const taken = takeForUse(char, inv, itemEntry, permanent, it);
    if (!taken.ok) return fail(taken.reason);

    const ticks = Math.max(1, Math.floor(cons.durationMs / cons.tickMs));
    // OBS_MOD_HEALTH/MANA: percent of max (same as useSpell path). Cite: SpellAuras.cpp:4706.
    const pctOfMax = Number((cons as { pctOfMax?: number }).pctOfMax) || 0;
    let c: Character = { ...(taken.char ?? char) };
    let restored = 0;
    if (cons.effect === 'food') {
      const maxRes = maxHealth(c, ds);
      const perTick = pctOfMax > 0 ? Math.floor((maxRes * pctOfMax) / 100) : cons.amountPerTick;
      const total = perTick * ticks;
      const before = c.health;
      c.health = Math.min(maxRes, c.health + total);
      restored = c.health - before;
    } else {
      const maxRes = maxPower(c, ds);
      const perTick = pctOfMax > 0 ? Math.floor((maxRes * pctOfMax) / 100) : cons.amountPerTick;
      const total = perTick * ticks;
      const before = c.power;
      c.power = Math.min(maxRes, c.power + total);
      restored = c.power - before;
    }
    if (cons.effect === 'food' && it.useSpell) {
      const spRaw = ds.spell(it.useSpell);
      if (spRaw) {
        const pending = pendingWellFedFromEffects(resolveCombatSpell(spRaw).effects ?? [], ds);
        if (pending) c = grantSeatedWellFed(c, ds, pending);
      }
    }
    return {
      ok: true, char: c, inventory: taken.inventory, restored, kind: cons.effect,
      permanentUse: taken.permanentUse || undefined,
    };
  }

  // Not a usable item (gear, reagents like Soul Shards, trade goods, quest items). Never consume
  // it "for nothing" â€” that would silently destroy reagents and quest items on a stray right-click.
  return fail('Cannot be consumed');
}
