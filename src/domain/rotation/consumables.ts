// In-combat consumable rows for the default rotation. The row is emitted from the CATALOG, gated on
// itemCount, so buying a potion needs no rebuild: RotationAutoSig has no inventory term.

import type { DataStore } from '../../data/dataStore.ts';
import type { ItemDef, PowerType, SpellDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { meetsItemSkillGate } from '../character/buildCombatant.ts';
import { classPowerType } from '../core/ids.ts';
import { powerTypeName } from '../../engine/spells/effects.ts';
import { consumableFamilyOfEntry, restoredPowerTypeIndex } from '../items/consumableFamily.ts';
import { hasHostilePayload } from '../items/onUsePayload.ts';
import { resolveCombatSpell } from '../../engine/spells/interpreter/index.ts';
import { ccBreakGateConditions, cond } from './classify.ts';
import { DEFAULT_THRESHOLDS, type CondMetric, type Condition, type RotationPhase } from './types.ts';

// ITEM_CLASS_CONSUMABLE — the gate separating a potion from an Engineering device with the same
// restore_health shape. Mechanical Repair Kit is class 7 at requiredLevel 0 and was offered first.
const ITEM_CLASS_CONSUMABLE = 0;

// ITEM_SUBCLASS_POTION. Ranking by raw restore amount alone reaches past the potion ladder: at 20
// the best class-0 heal is Lily Root, not a Healing Potion. Healthstones are subclass 6.
const ITEM_SUBCLASS_POTION = 3;

export interface CombatConsumable {
  entry: number;
  name: string;
  /** Rank ladder this row rides (domain/items/consumableFamily.ts). Absent ⇒ a lone entry. */
  family?: string;
  /** 'health' fills HP; otherwise the power this item restores. */
  kind: 'health' | PowerType;
  /** Best rolled amount, used only to rank candidates. */
  amount: number;
}

/** Which power a restore_power consumable fills. Cite: consumableFamily.restoredPowerTypeIndex. */
function restoredPowerType(it: ItemDef, ds: DataStore): PowerType | null {
  const idx = restoredPowerTypeIndex(it, ds);
  return idx == null ? null : powerTypeName(idx);
}

// The best level-legal in-combat health potion and power potion for this character, straight off the
// catalog. One of each — a list of every rank would bury the rest of the rotation.
export function bestCombatConsumables(char: Character, ds: DataStore): CombatConsumable[] {
  const want = classPowerType(char.cls);
  let bestHealth: CombatConsumable | null = null;
  let bestPower: CombatConsumable | null = null;

  for (const it of ds.items()) {
    const u = it.useInCombat;
    if (!u) continue;
    if (u.effect !== 'restore_health' && u.effect !== 'restore_power') continue;
    if (it.notObtainable) continue;
    if ((it.itemClass ?? -1) !== ITEM_CLASS_CONSUMABLE) continue;
    if ((it.itemSubclass ?? -1) !== ITEM_SUBCLASS_POTION) continue;
    // Engineering devices are the only use-gated rows; a potion is 0/0 and stays ungated.
    // Cite: Player.cpp CanUseItem ~9756; buildCombatant.meetsItemSkillGate.
    if (!meetsItemSkillGate(char, it)) continue;
    // Permanent on-use gear is only usable while equipped — not a carried consumable.
    if (it.slot != null) continue;
    // ItemTemplate.RequiredLevel is the combat-kit floor (same one combatItems uses).
    // Cite: Player.cpp:9797 CanUseItem.
    if ((it.requiredLevel | 0) > char.level) continue;
    const amount = Math.max(u.min ?? 0, u.max ?? 0);
    if (amount <= 0) continue;

    if (u.effect === 'restore_health') {
      if (!bestHealth || amount > bestHealth.amount) {
        bestHealth = { entry: it.entry, name: it.name, kind: 'health', amount };
      }
      continue;
    }
    if (restoredPowerType(it, ds) !== want) continue;
    if (!bestPower || amount > bestPower.amount) {
      bestPower = { entry: it.entry, name: it.name, kind: want, amount };
    }
  }

  // Stamp the ladder so the row is "Healing Potion", not the one rung this level happens to
  // top out at — the evaluator then drinks whatever rung is in the bag.
  const withFamily = (c: CombatConsumable): CombatConsumable => {
    const family = consumableFamilyOfEntry(c.entry, ds);
    return family ? { ...c, family } : c;
  };
  const out: CombatConsumable[] = [];
  if (bestHealth) out.push(withFamily(bestHealth));
  if (bestPower) out.push(withFamily(bestPower));
  return out;
}

// Gate for a carried consumable: you have one, and you need it. itemCount is what makes the row
// inert rather than wrong while the bag is empty.
export function combatConsumableConditions(c: CombatConsumable, hpBand?: number): Condition[] {
  // A family row needs no itemCount gate and must not carry one: the gate names ONE entry, so a
  // Major Healing Potion row was dead for a player carrying Greater. The ladder resolve covers it.
  const need = c.family ? null : cond('self', 'itemCount', '>=', 1, c.entry);
  if (c.kind === 'health') {
    const low = cond('self', 'healthPct', '<', hpBand ?? DEFAULT_THRESHOLDS.potionLowPct);
    return need ? [need, low] : [low];
  }
  // `manaPct`, never `powerPct`: a druid in Cat Form reads ENERGY on powerPct, so a mana potion row
  // gated there drank on an empty energy bar — which is every third GCD — and never on empty mana.
  // Rage and energy restores keep powerPct, since that IS the bar they fill.
  const bar: CondMetric = c.kind === 'mana' ? 'manaPct' : 'powerPct';
  const low = cond('self', bar, '<', DEFAULT_THRESHOLDS.manaRestoreLowPct);
  // Potions share item category 4 (itemUseCooldown.ts), so a mana potion locks the health potion out
  // for the whole category cooldown. Never spend that lock while the health band is live.
  const safe = cond('self', 'healthPct', '>', DEFAULT_THRESHOLDS.manaRestoreSafeHpPct);
  return need ? [need, low, safe] : [low, safe];
}

// buildCombatant.ts:379/473 files a cure, a summon, a shield, a sprint, a CC break and a damage
// coat under one `friendly_cast` kind, and all six were gated `self.controlled == 1`.

/** A speed aura this long is a carried buff (Swiftness of Zanza 2h), not a sprint (15s). */
const SPEED_KEEP_UP_MIN_MS = 600_000;
/** An immunity this short is a panic button, not something you hold up. Invulnerability is 6s. */
const PANIC_IMMUNITY_MAX_MS = 15_000;
/** enemiesWithinYd falls back to this when the trigger's radius is not baked. Cite: types.ts. */
const DEFAULT_PBAOE_YD = 10;
/** SharedDefines.h DispelType: MAGIC 1, CURSE 2, DISEASE 3, POISON 4, ALL 7. */
const DISPEL_ALL = 7;
const CURABLE_DISPEL_TYPES = [1, 2, 3, 4] as const;

export interface ItemGate {
  conditions: Condition[];
  phase: RotationPhase;
  /** Seed the row switched OFF: it spends the stack for movement, a body, or a flee. */
  autoOff?: boolean;
  /** Seed OFF even when worn and reusable: the payload HARMS the user (Skull of Impending Doom 5024). */
  neverAuto?: boolean;
}

/** Every damaging spell an on-use aura triggers, so a PBAoE coat can be gated on bodies in range. */
function triggeredDamageRadiusYd(sp: SpellDef, ds: DataStore | undefined): number | null {
  if (!ds) return null;
  for (const e of sp.effects) {
    const id = e.kind === 'proc_trigger_spell' ? Number(e.triggerSpellId) || 0
      : e.kind === 'trigger_spell' ? Number(e.spellId) || 0 : 0;
    if (!id) continue;
    const trig = ds.spell(id);
    if (!trig) continue;
    const te = trig.effects?.length ? trig.effects : resolveCombatSpell(trig).effects;
    const dmg = (te ?? []).some((t) => t.kind === 'direct_damage' || t.kind === 'dot');
    if (!dmg) continue;
    if ((trig.rangeMax ?? 0) > 0) continue; // aimed at a target, not a shield around us
    return trig.radiusYd ?? DEFAULT_PBAOE_YD;
  }
  return null;
}

// What a `friendly_cast` item is FOR, read off the spell it casts. Each branch cites the shape it
// matches; the fallback is the keep-up gate an elixir already gets (build.ts apply_buff).
export function friendlyCastItemGate(
  sp: SpellDef,
  spellId: number,
  ds?: DataStore,
): ItemGate {
  const upAlready = cond('self', 'buffPresent', '==', 0, spellId);
  const fighting = cond('self', 'inCombat', '==', 1);

  // 1. Free Action / Living Action Potion: a pure mechanic_immunity payload, the one shape the old
  // catch-all was written for. Cite: classify.ts:848 ccBreakGateConditions.
  if (ccBreakGateConditions(sp).length > 0) {
    return { conditions: [cond('self', 'controlled', '==', 1)], phase: 'combat' };
  }
  // 2. Cowardly Flight Potion 6614 fears the DRINKER. Never a row that fires on its own.
  if (sp.effects.some((e) => e.kind === 'cc')) {
    return {
      conditions: [cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.emergencyDefensivePct)],
      phase: 'recovery',
      autoOff: true,
    };
  }
  // 3. A cure in a bottle: the cure SPELL's gate, always on self, one OR group per category it
  // clears (Purification Potion answers four). Cite: classify.ts:626 dispelGateConditions.
  const cures = new Set<number>();
  for (const e of sp.effects) {
    if (e.kind !== 'dispel') continue;
    // DISPEL_ALL 7 clears any of the four, and no debuff is ever filed under 7 itself.
    if (e.dispelType === DISPEL_ALL) for (const c of CURABLE_DISPEL_TYPES) cures.add(c);
    else cures.add(e.dispelType);
  }
  if (cures.size && !sp.effects.some((e) => e.kind === 'direct_damage')) {
    const conditions = [...cures].sort((a, b) => a - b).map((cat, i) => ({
      ...cond('self', 'dispellablePresent', '==', 1, cat),
      ...(i > 0 ? { join: 'or' as const } : {}),
    }));
    return { conditions, phase: 'combat' };
  }
  // 4. A device that drops a body (Target Dummy, Explosive Sheep, Dog Whistle). It spends the
  // stack, so it seeds off for the same reason a grenade does (companionRotation.ts:330).
  if (sp.effects.some((e) => e.kind === 'summon_guardian')) {
    return { conditions: [fighting], phase: 'combat', autoOff: true };
  }
  // 5. Limited Invulnerability Potion (6s) / Light of Elune (10s): a panic button, on the same
  // health band every self-defensive cooldown uses. Cite: build.ts isSelfDefensiveSpell inject.
  const shortImmunity = sp.effects.some((e) =>
    (e.kind === 'school_immunity' || e.kind === 'damage_immunity')
    && (e.durationMs ?? 0) > 0 && (e.durationMs ?? 0) <= PANIC_IMMUNITY_MAX_MS);
  if (shortImmunity) {
    return {
      conditions: [cond('self', 'healthPct', '<', DEFAULT_THRESHOLDS.emergencyDefensivePct)],
      phase: 'recovery',
    };
  }
  // 6. Protection potions and the engineering deflectors: a school shield held like an elixir.
  // Phase combat is what keeps it off the OOC path (evaluate.ts:1088 reads buffs and pets only).
  if (sp.effects.some((e) => e.kind === 'school_absorb')) {
    return { conditions: [upAlready], phase: 'combat' };
  }
  // 7. Resistance potions, elixirs and Flask of Chromatic Resistance: a plain keep-up.
  if (sp.effects.some((e) => e.kind === 'resist' || e.kind === 'reflect')) {
    return { conditions: [upAlready], phase: 'buffs' };
  }
  // 8. Speed. A 2h Zanza buff is a keep-up; a 15s Swiftness Potion answers a snare and is seeded
  // off, since no PvE rotation should spend one (bgConsumes.ts drives the BG use).
  const speed = sp.effects.find((e) => e.kind === 'speed');
  if (speed) {
    if ((speed.durationMs ?? 0) >= SPEED_KEEP_UP_MIN_MS) {
      return { conditions: [upAlready], phase: 'buffs' };
    }
    // Flee 5024 rides a self dot and a mana drain beside its +60%: a row that fires on its own
    // bleeds the user every 2 s. Off, worn or not; an author gates it by hand (operator, 2026-09-10).
    const harmsTheUser = hasHostilePayload(sp.effects);
    return {
      conditions: [cond('self', 'snared', '==', 1)], phase: 'combat', autoOff: true,
      ...(harmsTheUser ? { neverAuto: true } : {}),
    };
  }
  // 9. Oil of Immolation 11350 ticks 11351 into a 5 yd disc, and Dragonbreath Chili into 10. The
  // coat pays nothing with an empty disc, so the bodies in range are the gate.
  const yd = triggeredDamageRadiusYd(sp, ds);
  if (yd != null) {
    return {
      conditions: [upAlready, cond('self', 'enemiesWithinYd', '>=', 1, yd)],
      phase: 'combat',
    };
  }
  // 10. Everything else riding a whole SpellDef: Restorative Potion's periodic cleanse, Glowing
  // Wax Stick, a festival brew. The keep-up gate an elixir already gets.
  return { conditions: [upAlready], phase: 'combat' };
}
