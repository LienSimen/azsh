// Pure totem helpers — parallel to domain/pet/pet.ts. Build fight-scoped totem combatants from
// summon_totem effects (with optional baked ability kits). No DOM/RNG/Date.

import type { SpellDef, SpellEffect, TotemSlot, TotemAbilityDef } from '../../data/schema.ts';
import type { CombatantSpec } from '../../engine/combat.ts';
import { sideForTotemSlot, type Side, type TotemSide } from '../../engine/core/events.ts';
import { TUNING } from '../../engine/combat/formulas.ts';
import { resolveCombatSpell } from '../../engine/spells/interpreter/item-triggers.ts';

export type { TotemSlot };

export const TOTEM_SLOTS: readonly TotemSlot[] = ['fire', 'earth', 'water', 'air'] as const;

// Numeric indices for rotation `totemPresent` ref (CMaNGOS TotemSlot: FIRE=0 … AIR=3). Wave 1D — condition
// "slot empty" uses ref = index, value 0/1 for occupied.
export const TOTEM_SLOT_INDEX: Readonly<Record<TotemSlot, number>> = {
  fire: 0,
  earth: 1,
  water: 2,
  air: 3,
} as const;

export function totemSlotIndex(slot: TotemSlot): number {
  return TOTEM_SLOT_INDEX[slot];
}

export function totemSlotFromIndex(index: number): TotemSlot | null {
  const i = index | 0;
  if (i === 0) return 'fire';
  if (i === 1) return 'earth';
  if (i === 2) return 'water';
  if (i === 3) return 'air';
  return null;
}

/** Effect-id → slot mapping (CMaNGOS SharedDefines / SpellEffects.cpp EffectSummonTotem). */
export function slotFromSummonEffectId(eff: number): TotemSlot | 'none' | null {
  if (eff === 87) return 'fire';
  if (eff === 88) return 'earth';
  if (eff === 89) return 'water';
  if (eff === 90) return 'air';
  if (eff === 74) return 'none';
  return null;
}

export function totemSide(slot: TotemSlot, owner: Side = 'player'): TotemSide {
  return sideForTotemSlot(slot, owner);
}

// CMaNGOS Totem::SetTypeBySummonSpell: if the totem's main spell has cast time → ACTIVE, else PASSIVE.
// Cite: Entities/Totem.cpp SetTypeBySummonSpell.
export function totemTypeFromAbility(ability: { castTimeMs: number } | undefined): 'active' | 'passive' {
  if (ability && (ability.castTimeMs | 0) > 0) return 'active';
  return 'passive';
}

/** Convert a baked TotemAbilityDef into a SpellDef the engine can cast. */
export function abilityToSpell(a: TotemAbilityDef): SpellDef {
  // Optional spellMagnet on kit rows (fixtures / future enrich) — type-narrow, not schema widen.
  const magnet = (a as TotemAbilityDef & { spellMagnet?: boolean }).spellMagnet === true;
  return {
    id: a.id,
    name: a.name,
    rank: 0,
    school: a.school,
    powerType: 'mana',
    cost: 0,
    castTimeMs: a.castTimeMs,
    cooldownMs: a.cooldownMs,
    gcdMs: a.gcdMs,
    rangeMax: 30,
    reqLevel: 1,
    effects: a.effects,
    // Friendly-area radius (SpellRadius.dbc) — combat filters the totem's party
    // reach by this, scaled through SPELLMOD_RADIUS on the owner.
    ...(a.radiusYd != null && a.radiusYd > 0 ? { radiusYd: a.radiusYd } : {}),
    ...(magnet ? { spellMagnet: true as const } : {}),
  };
}

// True when a creature kit spell is a WEAPON-PROC endpoint rather than a standing party aura. The DB
// lists Windfury's proc next to the metronome, and treating it as a kit aura grants a permanent +AP.
export function isWeaponProcTotemPayload(
  abil: { effects?: readonly { kind: string }[] } | null | undefined,
): boolean {
  return !!abil?.effects?.some((e) => e.kind === 'extra_attacks');
}

/** Drop swing-proc endpoints from summon-time abilities (keep them on triggerAbilities only). */
export function filterTotemSummonAbilities<T extends { effects?: readonly { kind: string }[] }>(
  abilities: readonly T[],
): T[] {
  return abilities.filter((a) => !isWeaponProcTotemPayload(a));
}

// Lookup used to attach creature_template_spells kits onto summon_totem effects when the live bake
// lacks the embedded abilities. Cite: Totem.cpp Summon CastSpell from m_spellList.
export interface TotemKitLookup {
  creature: (entry: number) => { name?: string; spells?: readonly number[]; charmSpells?: readonly number[] } | undefined;
  spell: (id: number) => SpellDef | undefined;
  // SpellItemEnchantment type-1 payload for an ENCHANT_HELD_ITEM effect — Windfury and Flametongue
  // Totem are nothing but this. Optional, so an older bake simply leaves those two inert.
  weaponEnchantProc?: (enchantId: number) => { spellId: number; chancePct?: number; durationMs: number } | undefined;
}

// Map a totem-creature ability spell into a TotemAbilityDef. Empty bake effects on a periodic-trigger
// holder chase their triggerSpell one hop to the real kit payload.
export function slimTotemAbilityFromSpell(
  s: SpellDef,
  spellLookup: (id: number) => SpellDef | undefined,
  enchantLookup?: (enchantId: number) => { spellId: number; chancePct?: number; durationMs: number } | undefined,
): TotemAbilityDef {
  const resolved = resolveCombatSpell(s);
  let effects: SpellEffect[] = (resolved.effects ?? []).map((e) => ({ ...e }));
  // The interpreter now materializes ENCHANT_HELD_ITEM as a first-class effect. Totem plumbing
  // consumes the weapon PROC it stands for, so convert it here or the kit rows go hollow.
  effects = effects.map((e) => {
    // 'enchant_held_item' is interpreter-emitted and not (yet) in the SpellEffect union.
    if ((e as { kind: string }).kind !== 'enchant_held_item') return e;
    const enchantId = (e as { enchantId?: number }).enchantId ?? 0;
    const payload = enchantId > 0 ? enchantLookup?.(enchantId) : undefined;
    if (!payload) return e;
    return {
      kind: 'proc_trigger_spell',
      triggerSpellId: payload.spellId,
      durationMs: payload.durationMs || (e as { durationMs?: number }).durationMs || 10_000,
      ...(payload.chancePct != null ? { amount: payload.chancePct } : {}),
    } as SpellEffect;
  });
  if (effects.length === 0) {
    // ENCHANT_HELD_ITEM: the payload is a temporary main-hand enchant whose type-1 row names the
    // spell it procs. It carries the enchant's own duration and OUTLIVES the totem — that is twisting.
    for (const r of s.rawEffects ?? []) {
      if ((r.effect | 0) !== 92) continue;
      const enchantId = r.miscValue | 0;
      const payload = enchantId > 0 ? enchantLookup?.(enchantId) : undefined;
      if (!payload) continue;
      effects.push({
        kind: 'proc_trigger_spell',
        triggerSpellId: payload.spellId,
        durationMs: payload.durationMs,
        ...(payload.chancePct != null ? { amount: payload.chancePct } : {}),
      });
    }
  }
  if (effects.length === 0) {
    for (const r of s.rawEffects ?? []) {
      const trig = (r.triggerSpell | 0);
      if (trig <= 0) continue;
      const tr = spellLookup(trig);
      if (!tr) continue;
      const trResolved = resolveCombatSpell(tr);
      for (const e of trResolved.effects ?? []) effects.push({ ...e });
    }
  }
  // Radius stays with the kit spell that owns the area effect, but a periodic-trigger holder owns
  // none, so take the same one hop the effects take. Measured 4 to 9 of 11 totems resolving a radius.
  let radiusYd = s.radiusYd != null && s.radiusYd > 0 ? s.radiusYd : undefined;
  if (radiusYd == null) {
    for (const r of s.rawEffects ?? []) {
      const trig = r.triggerSpell | 0;
      if (trig <= 0) continue;
      const tr = spellLookup(trig);
      if (tr?.radiusYd != null && tr.radiusYd > 0) { radiusYd = tr.radiusYd; break; }
    }
  }
  return {
    id: s.id,
    name: s.name,
    castTimeMs: s.castTimeMs | 0,
    cooldownMs: s.cooldownMs | 0,
    gcdMs: s.gcdMs | 0,
    school: s.school || 'physical',
    effects,
    ...(radiusYd != null ? { radiusYd } : {}),
  };
}

// Attach creature ability kits onto summon_totem effects that lack them, idempotently. This is what
// lets the pure combat engine pulse party auras without a DataStore at cast time.
export function attachTotemKits(spell: SpellDef, lookup: TotemKitLookup): SpellDef {
  if (!(spell.effects ?? []).some((e) => e.kind === 'summon_totem')) return spell;
  let changed = false;
  const effects = spell.effects.map((e) => {
    if (e.kind !== 'summon_totem') return e;
    if (e.abilities && e.abilities.length > 0) {
      // Kits already baked, but a bake predating trigger abilities carries none — fill them in rather
      // than leaving every cleanser and Windfury totem inert. Swing-proc endpoints are always stripped.
      const cleaned = filterTotemSummonAbilities(e.abilities);
      const abilitiesChanged = cleaned.length !== e.abilities.length;
      if (e.triggerAbilities && e.triggerAbilities.length > 0) {
        if (!abilitiesChanged) return e;
        changed = true;
        return { ...e, abilities: cleaned };
      }
      // resolveTriggerAbilities must see the full kit (incl. 8516 when present on creature
      // list) so enchant→proc endpoints still materialize — then abilities drops them.
      const trigs = resolveTriggerAbilities(e.abilities, lookup.spell, lookup.weaponEnchantProc);
      if (!trigs.length && !abilitiesChanged) return e;
      changed = true;
      return {
        ...e,
        abilities: cleaned,
        ...(trigs.length ? { triggerAbilities: trigs } : {}),
      };
    }
    const creature = e.creature | 0;
    if (!creature) return e;
    const cdef = lookup.creature(creature);
    // Totem::Summon walks m_spellList and casts EVERY row, never reading the Disabled flag only the AI
    // checks. Reading `spells` alone left 91 of 99 totem creatures hollow — charmSpells is the fallback.
    const abilIds = cdef?.spells?.length ? cdef.spells : (cdef?.charmSpells ?? []);
    if (!abilIds.length) return e;
    const rawAbilities: TotemAbilityDef[] = [];
    for (const id of abilIds) {
      const ab = lookup.spell(id);
      if (ab) rawAbilities.push(slimTotemAbilityFromSpell(ab, lookup.spell, lookup.weaponEnchantProc));
    }
    if (!rawAbilities.length) return e;
    changed = true;
    // Trigger chain first (needs 8516 on the raw list for endpoint carry), then strip
    // summon-time abilities so combat never applies +AP as a party aura.
    const triggerAbilities = resolveTriggerAbilities(rawAbilities, lookup.spell, lookup.weaponEnchantProc);
    const abilities = filterTotemSummonAbilities(rawAbilities);
    return {
      ...e,
      name: e.name || cdef?.name || spell.name,
      abilities,
      ...(triggerAbilities.length ? { triggerAbilities } : {}),
    };
  });
  if (!changed) return spell;
  return { ...spell, effects };
}

// Resolve the payload spell behind every kit proc_trigger_spell: the kit spell is only the metronome,
// and the triggered one is where the real effect lives. Resolving here keeps combat DataStore-free.
function resolveTriggerAbilities(
  abilities: readonly TotemAbilityDef[],
  spellLookup: (id: number) => SpellDef | undefined,
  enchantLookup?: (enchantId: number) => { spellId: number; chancePct?: number; durationMs: number } | undefined,
): TotemAbilityDef[] {
  const out: TotemAbilityDef[] = [];
  const seen = new Set<number>();
  for (const a of abilities) {
    for (const e of a.effects) {
      if (e.kind !== 'proc_trigger_spell') continue;
      const id = e.triggerSpellId | 0;
      if (id <= 0 || seen.has(id)) continue;
      seen.add(id);
      const trig = spellLookup(id);
      if (!trig) continue;
      const slim = slimTotemAbilityFromSpell(trig, spellLookup, enchantLookup);
      if (!slim.effects.length) continue; // nothing resolvable — do not carry a hollow row
      out.push(slim);
      // A weapon-enchant payload procs a further spell (1783 → 8516). Carry that too so the
      // party fighter can resolve the proc when it fires.
      for (const se of slim.effects) {
        if (se.kind !== 'proc_trigger_spell') continue;
        const procId = se.triggerSpellId | 0;
        if (procId <= 0 || seen.has(procId)) continue;
        seen.add(procId);
        const procSpell = spellLookup(procId);
        if (!procSpell) continue;
        const procSlim = slimTotemAbilityFromSpell(procSpell, spellLookup, enchantLookup);
        if (procSlim.effects.length) out.push(procSlim);
      }
    }
  }
  return out;
}

export interface TotemSummonEffect {
  kind: 'summon_totem';
  slot: TotemSlot | 'none';
  creature: number;
  health: number;
  durationMs: number;
  name?: string;
  abilities?: TotemAbilityDef[];
  triggerAbilities?: TotemAbilityDef[];
}

export interface BuiltTotem {
  slot: TotemSlot;
  side: TotemSide;
  summonSpellId: number;
  creature: number;
  name: string;
  maxHp: number;
  durationMs: number;
  type: 'active' | 'passive';
  /** All ability spells (active casts and/or passive aura sources). */
  abilities: SpellDef[];
  // `Totem::GetSpell()` — first kit spell id, the only aura UnSummon strips. Cite: Entities/Totem.cpp
  // GetSpell() :169–174; UnSummon RemoveAurasDueToSpell :131–158.
  kitSpellId: number;
  /** Payloads fired by the aura-23 pulse schedule (never applied at summon time). */
  triggerSpells: SpellDef[];
  /** Widest SpellRadius yards over the whole kit — the ground this totem covers. 0 = none baked. */
  auraRadiusYd: number;
  spec: CombatantSpec;
}

/** Offensive kit effects that deal damage (Searing Attack, Fire Nova, Magma pulse). */
export function isOffensiveTotemAbility(s: SpellDef): boolean {
  return s.effects.some((e) => e.kind === 'direct_damage' || e.kind === 'dot');
}

// Build a fight-scoped totem from a summon_totem effect. Uses baked `abilities`/`name` when present
// (enrich-totems); returns null only when slot is 'none' or health is invalid.
export function buildTotemFromEffect(
  eff: TotemSummonEffect,
  summonSpellId: number,
  ownerLevel: number,
  ownerCritChance?: number,
  ownerHitChance?: number,
  summonSpellName?: string,
  ownerSide: Side = 'player',
): BuiltTotem | null {
  if (eff.slot === 'none') return null;
  const slot = eff.slot;
  // Strip Windfury-class swing-proc endpoints even if a bake still lists them on abilities.
  // They must only resolve via triggerAbilities → party weapon enchant → swing proc.
  const abilities = filterTotemSummonAbilities(eff.abilities ?? []).map(abilityToSpell);
  const main = abilities[0];
  // CMaNGOS Totem::SetTypeBySummonSpell: castTime > 0 → TOTEM_ACTIVE (TotemAI cast loop).
  // Fire Nova 8443 bakes castTimeMs 0 → passive; Magma Passive same. Active = Searing Attack etc.
  const type = totemTypeFromAbility(main);
  const maxHp = Math.max(1, eff.health | 0);
  // Active totems carry the TotemAI combat spells; passive kits cast once on summon. Magnet carriers
  // stay on the fighter either way, so a passive Grounding still works.
  const combatSpells = type === 'active' ? abilities.filter(isOffensiveTotemAbility) : [];
  const MAGNET_KIT_IDS = new Set([8178, 8179]);
  const magnetCarriers = abilities.filter(
    (s) => s.spellMagnet === true || MAGNET_KIT_IDS.has(s.id),
  );
  const spells = [...combatSpells];
  for (const ab of magnetCarriers) {
    if (!spells.some((s) => s.id === ab.id)) spells.push(ab);
  }
  const name = eff.name || summonSpellName || 'Totem';
  const triggerSpells = (eff.triggerAbilities ?? []).map(abilityToSpell);
  const spec: CombatantSpec = {
    name,
    level: ownerLevel,
    maxHealth: maxHp,
    startHealth: maxHp,
    powerType: 'mana',
    maxPower: 0,
    startPower: 0,
    armor: 0,
    weapon: { dmgMin: 0, dmgMax: 0, speedMs: 60_000, school: 'physical' },
    attackPower: 0,
    // Crit/hit delegate to owner (CMaNGOS Totem.cpp GetCritChance).
    critChance: ownerCritChance ?? TUNING.baseCritChance,
    hitChance: ownerHitChance ?? TUNING.meleeHitChance,
    haste: 0,
    canParry: false,
    canBlock: false,
    creatureType: 11, // CREATURE_TYPE totem
    spells,
  };
  return {
    slot,
    side: totemSide(slot, ownerSide),
    summonSpellId,
    creature: eff.creature,
    name,
    maxHp,
    durationMs: Math.max(0, eff.durationMs | 0),
    type,
    abilities,
    // GetSpell() is m_spellList.Spells.begin() — the FIRST kit spell, not every kit spell.
    kitSpellId: abilities.length ? abilities[0]!.id : 0,
    triggerSpells,
    auraRadiusYd: [...abilities, ...triggerSpells]
      .reduce((m, s) => Math.max(m, s.radiusYd ?? 0), 0),
    spec,
  };
}

/** True when a spell is a totem summon (role or effect). */
export function isTotemSummonSpell(s: SpellDef): boolean {
  if (s.role === 'totem_summon') return true;
  return s.effects.some((e) => e.kind === 'summon_totem');
}

/** Slot occupied by this summon spell, or null if not a totem summon. */
export function totemSlotOfSpell(s: SpellDef): TotemSlot | 'none' | null {
  const eff = s.effects.find((e) => e.kind === 'summon_totem');
  if (!eff || eff.kind !== 'summon_totem') return null;
  return eff.slot;
}
