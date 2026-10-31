// Character → CombatantSpec assembler + combat kit helpers (combatItems, stealth).
// Extracted from character.ts (Wave 1 S3 barrel split). Pure move — no behavior change.

import type { DataStore } from '../../data/dataStore.ts';
import type { JudgementBurst, SpellDef, ShapeshiftFormId } from '../../data/schema.ts';
import { SKILL_LINE_BY_ID } from '../../data/schema/profession.ts';
import type { CombatantSpec, CombatItem } from '../../engine/combat.ts';
import type { Inventory } from '../items/inventory.ts';
import { countItem } from '../items/inventory.ts';
import type { Character } from './character.ts';
import { isHovering, setHover } from '../core/hover.ts';
import { equippedEntry, equippedInstance } from '../items/itemInstance.ts';
import { castItemSurvivesUse, maxChargesOf } from '../../domain/items/inventory.ts';
import {
  checkAmmoCompatibility,
  equippedQuiverRangedHastePct,
  projectileSubclassOf,
  weaponIsThrown,
  weaponIsWand,
  weaponNeedsProjectileAmmo,
  weaponSubclassOf,
} from '../items/ammo.ts';
import { classUsesRangedAuto } from '../core/ids.ts';
import { consumableFamilyKey, restoredPowerTypeIndex } from '../items/consumableFamily.ts';
import {
  hasCombatSelfPayload,
  hasFriendlyPayload,
  hasHostilePayload,
  isBeneficialSpeed,
  isFoodDrinkPayload,
  onUseAimsAtEnemy,
  onUseEffects,
} from '../items/onUsePayload.ts';
import {
  formAttackTimeMs, classHasParallelMana, formResourceOnEnter, resolveMeleeWeaponDamageRange,
  formCombatPackage,
} from './forms.ts';
import type { SpellBook } from './spellbook.ts';
import { isBroken } from '../items/durability.ts';
import {
  combatUseEffectFromInterpret,
  gearProcTriggerSpellIds,
  resolveCombatSpell,
  resolveSpellEffects,
} from '../../engine/spells/interpreter/item-triggers.ts';
import { combatPayloadFromSpell } from '../../engine/spells/interpreter/weapon-imbue-kit.ts';
import { SPELL_ATTR, SPELL_ATTR_EX3, hasAttr, hasAttrEx3 } from '../../engine/spells/spellAttributes.ts';
import { syntheticHunterTrapPayload } from '../../engine/spells/interpreter/hunter-kit.ts';
import {
  SETUP_TRIGGER_SPELL_ID,
  syntheticTalentTriggerPayload,
} from '../../engine/spells/interpreter/class-scripts-kit.ts';
import {
  AURA_TYPE,
  immunityBoostAurasForSpell,
  mechanicIdFromName,
} from '../../engine/spells/immunity.ts';
import {
  equippedItems,
  activeSetBonusSpells,
  powerType,
  createMana,
  createHealth,
  maxMana,
  maxHealth,
  hasResourceBaseline,
  maxPower,
  effectiveStats,
  equippedStatBonuses,
  effectiveArmor,
  baseArmorValue,
  attackPower,
  rangedAttackPower,
  blockValue,
  healingPower,
  resistances,
  mechanicResistPct,
  combatantCreatureType,
  weaponProfile,
  offhandWeaponProfile,
  rangedProfile,
  pruneExpiredAuras,
  getActiveBuffIds,
  attackPowerVersusBonuses,
  rangedAttackPowerVersusBonuses,
  spellDamageVersusBonuses,
  damageDoneVersusPctBonuses,
  damageDoneCreatureBonuses,
  critDamageVersusPctBonuses,
  offhandDamagePctBonus,
  attackerChanceBonus,
  attackerSpellHitBySchool,
  overrideClassScriptIds,
  permanentEnchantCombatProcs,
  permanentEnchantProcTriggers,
  equipResistancePenetration,
  permanentSpeedAuras,
  mergeSchoolAmounts,
} from './characterStats.ts';
import {
  activeTalentEffects,
  activeTalentProcsWithHolder,
  talentManaRegenInterruptPct,
  talentResistancePenetration,
  talentThreatModifiers,
  talentDamagePctBySchool,
  talentCritBonus,
} from './characterTalents.ts';
import { formTalentAuraDeltas } from './formTalentAuras.ts';
import { radiusSpellModsFromTalentEffects } from '../../engine/spells/spellMods.ts';
import { ownedSpellModsFromSpell } from '../../engine/spells/spellModIntents.ts';
import { pendingSpellModFromResolved } from '../../engine/combat/roles.ts';
import { victimAddTargetTriggerRows } from '../../engine/spells/addTargetTrigger.ts';
import { knownCombatSpells } from './characterSpells.ts';
import { racialSpells } from './races.ts';
import {
  canParry,
  hasShieldEquipped,
  critChance,
  spellCritChanceFromStats,
  spellHitBonusFromGear,
  hitChance,
  haste,
  dodgeChance,
  parryChance,
  blockChance,
  weaponSkill,
  defenseSkill,
  weaponSkillIdForHand,
  weaponSkillForHand,
  collectSkillBonuses,
  spellPower,
  spellDamageBySchool,
} from './characterRatings.ts';
import { getTempEnchant } from '../professions/characterEnchants.ts';
import { combatHeldEnchantFromEquipped } from '../spells/equipSpells.ts';
import { rocketBootsMalfunction } from '../items/rocketBoots.ts';
import { specialCasePayloadIds } from '../../engine/spells/specialCasePayloads.ts';
import { gearEnchantGrant } from '../professions/gearEnchant.ts';
import { itemUseCooldown } from '../items/itemUseCooldown.ts';
import { auraHolderCharges, auraStackIdentity } from '../../engine/spells/auraStacking.ts';
import { SHEET_BAKED_BUFF_MODS } from '../../engine/combat/seedDisplayAuras.ts';
import { isContinuousPartyAura } from '../spells/areaAuraMembership.ts';

type DisplayAuraEntry = NonNullable<CombatantSpec['startDisplayAuras']>[number];

// A party area aura's sheet-folded mods, with the identity a sibling rank strips it by. Only these
// sheet rows can leave mid-fight (holder gone / out of radius). Cite: SpellAuras.cpp:591-620.
function areaAuraSeedFields(
  sp: Pick<SpellDef, 'effects' | 'exclusionGroup' | 'spellFamilyName' | 'spellFamilyFlags' | 'rawEffects' | 'attributes'>,
): Pick<DisplayAuraEntry, 'sheetBuffs' | 'exclusionGroup' | 'stackIdent'> {
  const sheetBuffs: NonNullable<DisplayAuraEntry['sheetBuffs']> = [];
  for (const e of sp.effects) {
    if (e.kind !== 'buff' || !e.mod || e.hostile === true) continue;
    if (!SHEET_BAKED_BUFF_MODS.has(e.mod) || (e.amount ?? 0) === 0) continue;
    sheetBuffs.push({ mod: e.mod, amount: e.amount, ...(e.school ? { school: e.school } : {}) });
  }
  const stackIdent = auraStackIdentity(sp);
  return {
    ...(sheetBuffs.length ? { sheetBuffs } : {}),
    ...(sp.exclusionGroup != null ? { exclusionGroup: sp.exclusionGroup } : {}),
    ...(stackIdent ? { stackIdent } : {}),
  };
}

/** Sum active OOC buffs with mod 'mp5' (SPELL_AURA_MOD_POWER_REGEN total over 5s). */
function buffMp5(char: Character, ds: DataStore): number {
  let total = 0;
  for (const id of getActiveBuffIds(char, undefined, ds)) {
    const raw = ds.spell(id);
    if (!raw) continue;
    // SI5 / oil equip auras: bake effects[] may be empty — resolve from rawEffects.
    // Cite: Player.cpp ApplyEnchantment TYPE_EQUIP_SPELL; map-spell-effects aura 85.
    const effs = (raw.effects?.length ? raw.effects : resolveCombatSpell(raw).effects) ?? [];
    for (const eff of effs) {
      if (eff.kind === 'buff' && eff.mod === 'mp5') total += eff.amount;
    }
  }
  return total;
}

// OOC aura 110 / 134 totals for combat seed. Cite: StatSystem.cpp:551–562; Unit.cpp:4611–4622; KI-424
// Evocation.
function buffManaRegenAuras(char: Character, ds: DataStore): {
  pctMult: number;
  interruptPct: number;
} {
  let pctMult = 1;
  let interruptPct = 0;
  for (const id of getActiveBuffIds(char, undefined, ds)) {
    const raw = ds.spell(id);
    if (!raw) continue;
    const effs = (raw.effects?.length ? raw.effects : resolveCombatSpell(raw).effects) ?? [];
    for (const eff of effs) {
      if (eff.kind !== 'buff') continue;
      if (eff.mod === 'mana_regen_pct') {
        pctMult *= (100 + (eff.amount | 0)) / 100;
      } else if (eff.mod === 'mana_regen_interrupt') {
        interruptPct += eff.amount | 0;
      }
    }
  }
  return { pctMult, interruptPct };
}

// item_template.RequiredSkill / RequiredSkillRank use-gate. Only Engineering DEVICES carry one, so
// an absent requiredSkill is ungated. Gate on the SKILL, never the rank. Cite: Player.cpp ~9756.
export function meetsItemSkillGate(char: Character, it: { requiredSkill?: number; requiredSkillRank?: number }): boolean {
  const skillId = it.requiredSkill ?? 0;
  if (skillId <= 0) return true;
  const line = SKILL_LINE_BY_ID[skillId];
  // An unmapped skill line (lockpicking 633, poisons 40) is not a profession we model.
  // Refusing on it would silently delete working items, so it stays ungated.
  if (!line) return true;
  return (char.skills?.[line]?.current ?? 0) >= (it.requiredSkillRank ?? 0);
}

/** Charges left on a WORN unit, when the equipped instance carries a count. */
function equippedChargesOf(char: Character, itemEntry: number): number | undefined {
  for (const v of Object.values(char.equipped ?? {})) {
    if (equippedEntry(v) !== itemEntry) continue;
    return equippedInstance(v)?.charges;
  }
  return undefined;
}

function isEntryEquipped(char: Character, itemEntry: number): boolean {
  const eq = char.equipped;
  if (!eq) return false;
  for (const v of Object.values(eq)) {
    if (equippedEntry(v) === itemEntry) return true;
  }
  return false;
}

export function combatItems(char: Character, inv: Inventory, ds: DataStore): CombatItem[] {
  const byEntry = new Map<number, number>();
  for (const s of inv.stacks) byEntry.set(s.item, (byEntry.get(s.item) ?? 0) + s.count);
  // Equipped on-use (trinkets etc.) leave bags on equip — still enter the fight kit.
  // High count so personal CD is the gate (use does not consume the gear).
  for (const it of equippedItems(char, ds)) {
    if (!(it.useInCombat || it.useBuff || it.useSpell != null)) continue;
    if (!byEntry.has(it.entry)) byEntry.set(it.entry, 99);
  }
  const out: CombatItem[] = [];
  for (const [entry, count] of byEntry) {
    const it = ds.item(entry);
    if (!it) continue;
    if (!meetsItemSkillGate(char, it)) continue;
    // Permanent on-use gear only when equipped (HandleUseItemOpcode InventoryType gate).
    if (it.slot != null && !isEntryEquipped(char, entry)) continue;

    // ItemTemplate.RequiredLevel is the only combat-kit level floor — not the spell or useInCombat
    // reqLevel, which over-gate pots (KI-855) and under-gate alone (KI-837).
    const itemReq = (it.requiredLevel | 0);
    if (itemReq > 0 && char.level < itemReq) continue;

    // What a use SPENDS. `reusable` = the unit survives (spellcharges 0 or POSITIVE, never the equip
    // slot); `charges` = this unit's remaining count. Cite: Spell.cpp:4209; domain/items/inventory.ts.
    const spend = ((): { reusable?: boolean; charges?: number } => {
      const max = maxChargesOf(it);
      const counted = (it.charges ?? 0) !== 0 && max > 1;
      const left = counted
        ? (equippedChargesOf(char, entry) ?? inv.stacks.find((st) => st.item === entry && st.charges != null)?.charges ?? max)
        : undefined;
      const keeps = castItemSurvivesUse(it);
      return { ...(keeps ? { reusable: true } : {}), ...(left != null ? { charges: left } : {}) };
    })();

    // Shared item-template CDs. itemUseCooldown reads useInCombat and useBuff first, then the
    // unconditional top-level carrier; spell RecoveryTime is the last fallback.
    const itemCd = itemUseCooldown(it);
    const uicCd = (_u: NonNullable<typeof it.useInCombat> | undefined, spCd: number) => ({
      cooldownMs: itemCd.cooldownMs > 0 ? itemCd.cooldownMs : spCd,
      category: itemCd.category > 0 ? itemCd.category : undefined,
      categoryCooldownMs: itemCd.categoryCooldownMs > 0 ? itemCd.categoryCooldownMs : undefined,
    });

    // 1) Instant restore (potions / healthstone / mana gem). cast_spell falls through so the
    // full SpellDef is resolved (grenades must not be flattened to min/max).
    const u = it.useInCombat;
    if (u && (u.effect === 'restore_health' || u.effect === 'restore_power')) {
      const min = u.min ?? 0;
      const max = u.max ?? min;
      out.push({
        entry,
        name: it.name,
        icon: it.icon,
        // Which pool a mana gem / Thistle Tea fills. The bake's stamp when it has one, else the
        // use-spell's own energize miscValue — a pre-powerType bake must not read as mana.
        effect: {
          kind: u.effect, min, max,
          ...(u.effect === 'restore_power'
            ? (() => {
              const idx = restoredPowerTypeIndex(it, ds);
              return idx != null ? { powerType: idx } : {};
            })()
            : {}),
        },
        ...uicCd(u, 0),
        count,
        ...spend,
      });
      continue;
    }

    // Resolve the on-use spell up front — branch 2 needs to know how many effects it has.
    // SI5/SI6: resolve via interpreter when rawEffects exist (same path as combat).
    const useSp = it.useSpell ?? (u?.effect === 'cast_spell' ? u.spellId : undefined);
    const spRaw = useSp != null ? ds.spell(useSp) : undefined;
    const sp = spRaw ? resolveCombatSpell(spRaw) : undefined;
    // A real on-use only (item_template spelltrigger 0 / the useBuff classifier). Class-9 recipe
    // books carry their TAUGHT spell in useSpell, and one of those must never ride as a cast.
    const spellRidesWhole = (u != null || it.useBuff != null) && (sp?.effects.length ?? 0) > 1;

    // Direct buff consumable (elixir / flask / scroll), only when there is no cast_spell
    // useInCombat. A multi-effect spell rides its SpellDef along so itemUse casts it whole.
    const useB = it.useBuff;
    if (useB && u?.effect !== 'cast_spell') {
      out.push({
        entry,
        name: it.name,
        icon: it.icon,
        effect: {
          kind: 'apply_buff',
          mod: useB.mod,
          amount: useB.amount,
          durationMs: useB.durationMs,
          ...(spellRidesWhole && useSp != null && sp ? { spellId: useSp, spell: sp } : {}),
        },
        ...uicCd(u, 0),
        count,
        ...spend,
      });
      continue;
    }

    // 3) useSpell → buff / heal / hostile_cast. cast_spell useInCombat lands here with CDs from
    // the item row. Skip food/drink restore_* (OOC only).
    if (useSp == null || !spRaw || !sp) continue;
    // Read through the triggers: a BG ration's restore sits two hops down (24411 → 25695/25696).
    const payload = onUseEffects(sp, ds);
    if (isFoodDrinkPayload(payload)) continue;
    // 3a) HOSTILE on-use — grenades, bombs, Tidal Charm, Slumber Sand. Checked BEFORE the buff
    // branches, or a bomb's cc slot falls past every one. The whole SpellDef rides to castOnTargets.
    const friendlyPayload = hasFriendlyPayload(sp.effects);
    if (hasHostilePayload(sp.effects) && !friendlyPayload) {
      out.push({
        entry,
        name: it.name,
        icon: it.icon,
        effect: { kind: 'hostile_cast', spellId: useSp, spell: sp },
        ...uicCd(u, sp.cooldownMs ?? 0),
        count,
        ...spend,
      });
      continue;
    }

    // 3b) DEFENSIVE on-use whose payload is an immunity, cleanse, reflect, or guardian summon
    const defensiveEff = sp.effects.some(
      (e) => e.kind === 'mechanic_immunity'
        || e.kind === 'school_immunity'
        || e.kind === 'damage_immunity'
        || e.kind === 'dispel_immunity'
        || e.kind === 'state_immunity'
        || e.kind === 'effect_immunity'
        || e.kind === 'cleanse'
        || e.kind === 'dispel'
        || e.kind === 'dispel_mechanic'
        || e.kind === 'reflect'
        || e.kind === 'summon_guardian',
    );
    if (defensiveEff) {
      out.push({
        entry,
        name: it.name,
        icon: it.icon,
        effect: { kind: 'friendly_cast', spellId: useSp, spell: sp },
        ...uicCd(u, sp.cooldownMs ?? 0),
        count,
        ...spend,
      });
      continue;
    }

    // 3c) Speed on-use — Swiftness Potion, Rocket Boots, Skull's Flee. A pure aura-31 payload is
    // not a `buff`, so all four fell past every branch. It rides as a full SpellDef for the bucket.
    if (sp.effects.some(isBeneficialSpeed)) {
      const malfunction = rocketBootsMalfunction(entry, ds, resolveCombatSpell);
      out.push({
        entry,
        name: it.name,
        icon: it.icon,
        effect: { kind: 'friendly_cast', spellId: useSp, spell: sp },
        ...uicCd(u, sp.cooldownMs ?? 0),
        count,
        ...spend,
        ...(malfunction ? { malfunction } : {}),
      });
      continue;
    }

    // A buff consumable whose spell lands more than one effect carries the WHOLE SpellDef, since
    // mod+amount holds only the first. `mod` stays the primary for the UI label and buffPresent.
    const buffEff = sp.effects.find((e) => e.kind === 'buff');
    if (buffEff && buffEff.kind === 'buff') {
      out.push({
        entry,
        name: it.name,
        icon: it.icon,
        effect: {
          kind: 'apply_buff',
          mod: buffEff.mod,
          amount: buffEff.amount,
          durationMs: buffEff.durationMs,
          spellId: useSp,
          ...(spellRidesWhole ? { spell: sp } : {}),
        },
        ...uicCd(u, sp.cooldownMs ?? 0),
        count,
        ...spend,
      });
      continue;
    }

    const healEff = sp.effects.find((e) => e.kind === 'heal');
    if (healEff && healEff.kind === 'heal') {
      out.push({
        entry,
        name: it.name,
        icon: it.icon,
        effect: { kind: 'restore_health', min: healEff.min, max: healEff.max },
        ...uicCd(u, sp.cooldownMs ?? 0),
        count,
      });
      continue;
    }

    // energize without bake useInCombat (legacy) → restore_power
    const energizeEff = sp.effects.find((e) => e.kind === 'energize');
    if (energizeEff && energizeEff.kind === 'energize') {
      out.push({
        entry,
        name: it.name,
        icon: it.icon,
        effect: {
          kind: 'restore_power', min: energizeEff.min, max: energizeEff.max,
          powerType: energizeEff.powerType | 0,
        },
        ...uicCd(u, sp.cooldownMs ?? 0),
        count,
      });
      continue;
    }

    // 3d) An absorb, resistance, proc aura, spell-mod, or a payload a trigger down: the whole
    // SpellDef rides to castOnTargets. Cite: bgConsumes.ts:161, which probed for this hole.
    if (
      hasCombatSelfPayload(payload) || hasHostilePayload(payload)
      || hasFriendlyPayload(payload) || onUseAimsAtEnemy(spRaw)
    ) {
      // The implicit target row is the server's own answer; the payload kinds only decide the
      // rows that aim at TARGET_UNIT/none. Cite: SpellTargets.cpp:31.
      const enemyBound = onUseAimsAtEnemy(spRaw)
        || (hasHostilePayload(payload) && !hasFriendlyPayload(payload));
      out.push({
        entry,
        name: it.name,
        icon: it.icon,
        effect: enemyBound
          ? { kind: 'hostile_cast', spellId: useSp, spell: sp }
          : { kind: 'friendly_cast', spellId: useSp, spell: sp },
        ...uicCd(u, sp.cooldownMs ?? 0),
        count,
        ...spend,
      });
      continue;
    }

    // Fallback: combatUseEffectFromInterpret for edge shapes not in effects[].
    if (spRaw.rawEffects?.length) {
      const interpreted = resolveSpellEffects(spRaw);
      const use = combatUseEffectFromInterpret(interpreted, useSp);
      if (!use) continue;
      if (use.kind === 'apply_buff') {
        out.push({
          entry,
          name: it.name,
          icon: it.icon,
          effect: use,
          ...uicCd(u, sp.cooldownMs ?? 0),
          count,
        });
      } else {
        out.push({
          entry,
          name: it.name,
          icon: it.icon,
          effect: { kind: 'restore_health', min: use.min, max: use.max },
          ...uicCd(u, sp.cooldownMs ?? 0),
          count,
        });
      }
    }
  }
  // Stamp the rank ladder each row belongs to. `CombatItem` is in-session only and createSession
  // holds no DataStore, so a family row can only resolve if the kit says which ladder each is on.
  for (const ci of out) {
    const it = ds.item(ci.entry);
    const family = consumableFamilyKey(it, ds);
    if (family) {
      ci.family = family;
      ci.rank = it?.itemLevel ?? 0;
    }
  }
  return out;
}

/** Sum MOD_STEALTH_LEVEL (154) from known passives/talents (Shadowmeld Passive, Master of Deception, …). */
export function stealthLevelBonusFromKnown(sb: SpellBook, ds: DataStore): number {
  let n = 0;
  for (const id of sb.known) {
    const s = ds.spell(id);
    if (!s) continue;
    for (const e of s.effects) {
      if (e.kind === 'stealth_level') n += e.amount | 0;
    }
  }
  return n;
}

// Active MOD_STEALTH from OOC auras (Stealth / Prowl / Shadowmeld / Vanish). Returns the best (highest
// strength) active stealth aura, or null if none.
export function activeStealthAura(
  char: Character,
  ds: DataStore,
  now: number = Date.now(),
): { spellId: number; strength: number; breakFlags?: number } | null {
  let best: { spellId: number; strength: number; breakFlags?: number } | null = null;
  for (const a of pruneExpiredAuras(char.activeAuras, now)) {
    const s = ds.spell(a.spellId);
    if (!s) continue;
    for (const e of s.effects) {
      if (e.kind !== 'stealth') continue;
      if (!best || e.strength > best.strength) {
        best = { spellId: s.id, strength: e.strength | 0, breakFlags: e.breakFlags };
      }
    }
  }
  return best;
}

// TYPE_DAMAGE flat amount for a paperdoll slot: gearEnchantGrant first, then the legacy EnchantDef
// cache, then item.weaponDamageFlat. A random prop stacks with PERM, and a broken item is inert.
function weaponDamageFlatForSlot(
  char: Character,
  ds: DataStore,
  slot: 'mainhand' | 'offhand' | 'ranged',
): number {
  const entry = equippedEntry(char.equipped[slot]);
  if (entry == null) return 0;
  let flat = 0;
  const inst = equippedInstance(char.equipped[slot]);
  // LOCK 2: instance.permEnchantId first, then legacy slot map.
  const enchId = inst?.permEnchantId ?? char.enchants?.[slot];
  if (enchId != null) {
    const grant = gearEnchantGrant(enchId, ds);
    if (grant?.weaponDamageFlat) flat = grant.weaponDamageFlat;
    else {
      const enc = ds.enchant(enchId) as { weaponDamageFlat?: number } | undefined;
      if (enc?.weaponDamageFlat) flat = enc.weaponDamageFlat;
    }
  }
  const it = ds.item(entry);
  if (!flat) flat = it?.weaponDamageFlat ?? 0;
  // Random property TYPE_DAMAGE — stacks with profession PERM; suppressed when slot is broken
  // (same inert rule as equippedWithEnchant for stats/armor).
  if (it && !isBroken(char, slot, it)) {
    const rpId = inst?.randomPropertyId;
    if (rpId != null && rpId > 0) {
      const prop = ds.itemRandomProperty(rpId);
      if (prop?.weaponDamageFlat) flat += prop.weaponDamageFlat;
    }
  }
  return flat;
}

// Fill the judgement burst from its own carrier spell in the store — damage range AND coefficient —
// instead of the transcribed tables, which are a frozen copy no re-bake can correct.
function withJudgeFromCarrier(
  judge: JudgementBurst | undefined,
  ds: DataStore,
): JudgementBurst | undefined {
  if (!judge?.spellId) return judge;
  const carrier = ds.spell(judge.spellId);
  if (!carrier) return judge;
  const dmg = carrier.effects?.find((e) => e.kind === 'direct_damage');
  const slot = dmg?.effectSlot ?? 0;
  const coeff = carrier.effectBonusCoefficient?.[slot] ?? 0;
  const next: JudgementBurst = { ...judge };
  if (dmg && dmg.min > 0 && dmg.max >= dmg.min) {
    next.min = dmg.min;
    next.max = dmg.max;
  }
  if (judge.coeff == null && coeff > 0) next.coeff = coeff;
  return next;
}

export function buildCombatant(
  char: Character,
  sb: SpellBook,
  ds: DataStore,
  inv?: Inventory,
): CombatantSpec {
  const ranged = rangedProfile(char, ds);
  // Pass spellbook so CanParry requires trained Parry (EffectParry), not bare MH weapon.
  // Cite: Player.cpp m_canParry; characterRatings.canParry; KI-818.
  const canP = canParry(char, ds, sb);
  const hasSh = hasShieldEquipped(char, ds);
  const form = ((char.form ?? 0) | 0) as ShapeshiftFormId;
  // The spec is the FORM-FREE body (fighterFactory.ts:744): applyFormCombatEnter adds the package, the
  // Cat agility AP and these talent auras, and clearFormCombatBonuses takes all three back on a shift.
  const formTalentAuras = formTalentAuraDeltas(char, ds, sb);
  // The BAR follows the form even though the body does not: a druid carried into the next fight in
  // Cat Form holds energy in `power` and its mana in `mana`. Both are read before the strip.
  const pt = powerType(char);
  const maxP = maxPower(char, ds);
  char = char.form == null ? char : { ...char, form: undefined };
  const baseWeapon = weaponProfile(char, ds);
  const offhand = offhandWeaponProfile(char, ds);
  // Form attack-time override (Player.cpp InitDataForForm): cat 1.0s / bear 2.5s.
  // Forms that override attack speed do not dual-wield (single form timer).
  const formAtk = formAttackTimeMs(form);
  const dmgRange = resolveMeleeWeaponDamageRange(form, char.level, baseWeapon.dmgMin, baseWeapon.dmgMax, formAtk);
  const weapon = formAtk > 0
    ? { ...baseWeapon, speedMs: formAtk, dmgMin: dmgRange.min, dmgMax: dmgRange.max }
    : baseWeapon;
  const dualWield = formAtk <= 0 && offhand != null;
  const mMana = maxMana(char, ds);
  const startMana = pt === 'mana' ? char.power : (char.mana ?? mMana);
  // Parallel mana for multi-power classes (Druid) — always present for display + form costs.
  const multiPower = classHasParallelMana(char.cls);
  // A seat SEEDED into a form never ran the shapeshift handler, and is told apart from a shifted
  // druid by the parallel `mana` that shift splits off. Its pool starts where the handler leaves
  // it. Cite: SpellAuras.cpp:1959; oocCastEffects.ts:478 writes the shifted sheet.
  const seededIntoForm = pt !== 'mana' && multiPower && char.mana == null;
  const startPower = pt === 'mana' ? char.power
    : seededIntoForm ? Math.max(0, formResourceOnEnter(pt))
      : Math.min(char.power, maxP);
  const cMana = createMana(char, ds);
  const cHealth = createHealth(char, ds);
  const levelBonus = stealthLevelBonusFromKnown(sb, ds);
  const activeStealth = activeStealthAura(char, ds);
  const stats = effectiveStats(char, ds);
  const gearStats = equippedStatBonuses(char, ds);
  const mh = maxHealth(char, ds);
  const victimAtt = (() => {
    const rows: NonNullable<CombatantSpec['startAddTargetTriggers']> = [];
    const skipHolders = new Set<number>();
    for (const { holderSpellId } of activeTalentProcsWithHolder(char, ds)) {
      const hid = holderSpellId | 0;
      if (!hid || skipHolders.has(hid)) continue;
      const holder = ds.spell(hid);
      if (!holder) continue;
      const att = victimAddTargetTriggerRows(holder, (id) => ds.spell(id));
      if (!att.length) continue;
      skipHolders.add(hid);
      for (const r of att) rows.push({ spellId: hid, ...r });
    }
    return { rows, skipHolders };
  })();
  return {
    name: char.name,
    level: char.level,
    gender: char.gender,
    classId: char.cls,
    ...(() => {
      const equippedItemEntries: number[] = [];
      for (const v of Object.values(char.equipped ?? {})) {
        const e = equippedEntry(v);
        if (e) equippedItemEntries.push(e);
      }
      return equippedItemEntries.length ? { equippedItemEntries } : {};
    })(),
    // TYPEID_PLAYER, whatever seat it takes. Only creatures skip this builder, so the flag is
    // unconditional; the side fallback it replaces read a companion in an enemy seat as a creature.
    isPlayerOrPet: true,
    ...(char.cls === 5 || char.cls === 8 || char.cls === 9
      ? { wandUser: true, casterGlance: true }
      : {}),
    // Live drunk state for in-combat alcohol. Cite: Player m_drunk; KI-734.
    ...(typeof char.drunkValue === 'number' && char.drunkValue > 0
      ? { drunkValue: Math.min(0xFFFF, char.drunkValue | 0) }
      : {}),
    ...(isHovering(char.movementFlags ?? 0)
      ? { movementFlags: setHover(char.movementFlags ?? 0, true) }
      : {}),
    maxHealth: mh,
    // Clamped, not passed through: a lapsed buff lowers maxHealth while char.health still holds the
    // buffed value. `?? mh` guards an undefined health, and hasResourceBaseline the missing row.
    // When entering in form, subtract form health bonus so applyFormCombatEnter restores live HP.
    ...(() => {
      const startFormHealth = form ? (formCombatPackage(form).healthFlat + (formTalentAuras?.[form]?.health ?? 0)) : 0;
      const startHp = char.health != null ? Math.max(1, char.health - startFormHealth) : mh;
      return { startHealth: hasResourceBaseline(char, ds) ? Math.min(startHp, mh) : char.health };
    })(),
    powerType: pt,
    maxPower: maxP,
    startPower,
    // OCT mana regen inputs (combat 5SR + OOC). source: Unit.cpp OCTRegen*; StatSystem UpdateManaRegen
    spirit: stats.spi,
    // Gear ITEM_MOD_MANA_REGENERATION + buff mod 'mp5' (SPELL_AURA_MOD_POWER_REGEN total / 5s).
    mp5: (gearStats.mp5 ?? 0) + buffMp5(char, ds),
    // Meditation talents plus OOC auras 134 and 110 (Evocation ×16, Innervate), and aura 116
    // MOD_REGEN_DURING_COMBAT from racials and live auras. Cite: StatSystem.cpp ~551-558; KI-898.
    ...(() => {
      let combatHpRegenPct = 0;
      // Aura 88 MOD_HEALTH_REGEN_PERCENT multiplies the OOC spirit rate (Troll Regeneration 20555).
      // Cite: Player.cpp:2393-2398; the same fold rest.ts:367 healthRegenPercentMultiplier runs.
      let oocHpRegenMult = 1;
      const seenRegen = new Set<number>();
      const foldRegenDuringCombat = (spellId: number): void => {
        const id = spellId | 0;
        if (!id || seenRegen.has(id)) return;
        seenRegen.add(id);
        const raw = ds.spell(id);
        if (!raw) return;
        const sp = resolveCombatSpell(raw, { casterLevel: char.level });
        for (const e of sp.effects ?? []) {
          if (e.kind === 'mod_regen_during_combat') combatHpRegenPct += e.amount | 0;
          else if (e.kind === 'mod_health_regen_percent' && (e.amount | 0)) {
            oocHpRegenMult *= (100 + (e.amount | 0)) / 100;
          }
        }
      };
      for (const s of racialSpells(ds, char.race)) foldRegenDuringCombat(s.id);
      for (const a of pruneExpiredAuras(char.activeAuras)) foldRegenDuringCombat(a.spellId);
      return {
        ...(combatHpRegenPct > 0 ? { healthRegenDuringCombatPct: combatHpRegenPct } : {}),
        ...(oocHpRegenMult !== 1 ? { healthRegenPctMult: oocHpRegenMult } : {}),
      };
    })(),
    ...(() => {
      const { pctMult, interruptPct } = buffManaRegenAuras(char, ds);
      return {
        manaRegenInterruptPct: Math.min(
          100,
          Math.max(0, talentManaRegenInterruptPct(char, ds) + interruptPct),
        ),
        manaRegenPctMult: pctMult,
      };
    })(),
    // MOD_TARGET_RESISTANCE → GetResistancePenetration. Cite: Unit.cpp ~3890.
    // Talents + equip / OOC buff auras (spell pen gear, Bonereaver proc shell).
    resistancePenetration: mergeSchoolAmounts(
      talentResistancePenetration(char, ds),
      equipResistancePenetration(char, ds),
    ),
    // Creature-type versus AP and flat spell damage. Aura 59 MOD_DAMAGE_DONE_CREATURE is flat
    // DoneFlat for spells AND melee, so it folds into both paths. Cite: Unit.cpp:7465, :7061.
    ...(() => {
      const ddc = damageDoneCreatureBonuses(char, ds);
      const spellVs = spellDamageVersusBonuses(char, ds);
      return {
        attackPowerVersus: attackPowerVersusBonuses(char, ds),
        rangedAttackPowerVersus: rangedAttackPowerVersusBonuses(char, ds),
        spellDamageVersus: ddc.length ? [...spellVs, ...ddc] : spellVs,
        damageDoneVersusPct: damageDoneVersusPctBonuses(char, ds),
        // Aura 169 crit MULTIPLIER vs creature type (Monster / Humanoid Slaying).
        critDamageVersusPct: critDamageVersusPctBonuses(char, ds),
        ...(ddc.length ? { damageDoneCreature: ddc } : {}),
      };
    })(),
    // Aura 122 off-hand TOTAL_PCT and the victim-side 185-188 chance auras. Both are talent-only
    // in vanilla, so they read zero until a rank is spent. Cite: SpellAuras.cpp:4175; Unit.cpp:3525.
    ...(() => {
      const offhand = offhandDamagePctBonus(char, ds);
      const mCrit = attackerChanceBonus(char, ds, 'attacker_melee_crit');
      const rCrit = attackerChanceBonus(char, ds, 'attacker_ranged_crit');
      const rHit = attackerChanceBonus(char, ds, 'attacker_ranged_hit');
      const sHit = attackerSpellHitBySchool(char, ds);
      const scriptIds = overrideClassScriptIds(char, ds, sb);
      return {
        ...(offhand ? { offhandDamagePct: offhand } : {}),
        ...(mCrit ? { attackerMeleeCrit: mCrit } : {}),
        ...(rCrit ? { attackerRangedCrit: rCrit } : {}),
        ...(rHit ? { attackerRangedHit: rHit } : {}),
        ...(Object.keys(sHit).length ? { attackerSpellHitBySchool: sHit } : {}),
        ...(scriptIds.length ? { overrideScriptIds: scriptIds } : {}),
      };
    })(),
    // MOD_THREAT → m_threatModifier[school]. Cite: SpellAuras.cpp HandleModThreat.
    threatModifierBySchool: talentThreatModifiers(char, ds),
    // createMana is the BASE pool a ManaCostPercentage spell is a percentage OF. Stamped only for
    // parallel-mana classes before, so every other % cost fell back to maxMana and overcharged.
    createMana: cMana,
    ...(multiPower ? { mana: startMana, maxMana: mMana } : {}),
    // POWER_HEALTH % costs (Bloodrage) — always available when classlevel baseHp is known.
    ...(cHealth > 0 ? { createHealth: cHealth } : {}),
    ...(form ? { form } : {}),
    ...(activeStealth
      ? { stealth: {
        spellId: activeStealth.spellId,
        strength: activeStealth.strength,
        levelBonus,
        breakFlags: activeStealth.breakFlags,
      } }
      : levelBonus > 0 ? { stealthLevelBonus: levelBonus } : {}),
    baseWeaponSpeedMs: baseWeapon.speedMs,
    baseWeaponDmgMin: baseWeapon.dmgMin,
    baseWeaponDmgMax: baseWeapon.dmgMax,
    armor: effectiveArmor(char, ds),
    // The slice a mid-fight aura 142 multiplies — item armor only, agi×2 and flat buffs excluded.
    baseArmor: Math.floor(baseArmorValue(char, ds)),
    weapon,
    // Off-hand weapon only when dual-wielding (not shield). Forms strip OH autos via dualWield false.
    ...(dualWield && offhand ? { offhand, dualWield: true as const } : {}),
    // A wand lights up Shoot on demand; a Hunter with a bow/gun auto-attacks at range.
    ranged: ranged ?? undefined,
    rangedAuto: !!ranged && classUsesRangedAuto(char.cls),
    // Ammo DPS only when the selection is compatible and count ≥ 1, mirroring _ApplyAmmoBonuses.
    // The EquippedItem* subclasses for HasItemFitToSpellReqirements ride the same paperdoll walk.
    ...(() => {
      const out: {
        ammoDpsMin?: number;
        ammoDpsMax?: number;
        ammoEntry?: number;
        ammoRemaining?: number;
        ammoSubclass?: number;
        rangedWeaponSubclass?: number;
        mainhandWeaponSubclass?: number;
        offhandWeaponSubclass?: number;
        brokenMainhandWeaponSubclass?: number;
        brokenOffhandWeaponSubclass?: number;
        brokenRangedWeaponSubclass?: number;
        offhandArmorSubclass?: number;
        bodyArmorSubclasses?: number[];
        rangedArmorSubclass?: number;
        equippedItemFitReady: true;
        thrownRemaining?: number;
        thrownEntry?: number;
      } = { equippedItemFitReady: true };

      // MH / OH / body / ranged-armor subclasses for the EquippedItem* fit. A broken weapon stays
      // equipped but combat-inert, recorded under broken* so the gate says "broken", not "none".
      const mhEntry = equippedEntry(char.equipped.mainhand);
      const mhItem = mhEntry != null ? ds.item(mhEntry) : undefined;
      if (mhItem?.weapon) {
        const mhSub = weaponSubclassOf(mhItem);
        if (mhSub != null) {
          if (isBroken(char, 'mainhand', mhItem)) out.brokenMainhandWeaponSubclass = mhSub;
          else out.mainhandWeaponSubclass = mhSub;
        }
      }
      const ohEntry = equippedEntry(char.equipped.offhand);
      const ohItem = ohEntry != null ? ds.item(ohEntry) : undefined;
      if (ohItem) {
        if (ohItem.weapon) {
          const ohSub = weaponSubclassOf(ohItem);
          if (ohSub != null) {
            if (isBroken(char, 'offhand', ohItem)) out.brokenOffhandWeaponSubclass = ohSub;
            else out.offhandWeaponSubclass = ohSub;
          }
        } else if (!isBroken(char, 'offhand', ohItem)) {
          // Shield / holdable armor — ITEM_CLASS_ARMOR in OH slot.
          // Cite: Player.cpp:18611–18614; ItemPrototype armor subclasses.
          const aSub = ohItem.armorSubclass
            ?? (ohItem.typeName === 'Shield' ? 6 : undefined);
          if (aSub != null) out.offhandArmorSubclass = aSub;
        }
      }
      // Body slots = EQUIPMENT_SLOT_START..MAINHAND exclusive (Player.cpp:18605–18609).
      const BODY_SLOTS = [
        'head', 'neck', 'shoulder', 'shirt', 'chest', 'waist', 'legs', 'feet',
        'wrist', 'hands', 'finger1', 'finger2', 'trinket1', 'trinket2', 'back',
      ] as const;
      const bodySubs: number[] = [];
      for (const slot of BODY_SLOTS) {
        const entry = equippedEntry(char.equipped[slot]);
        if (entry == null) continue;
        const it = ds.item(entry);
        if (!it || isBroken(char, slot, it) || it.weapon) continue;
        if (it.armorSubclass != null) bodySubs.push(it.armorSubclass);
      }
      if (bodySubs.length) out.bodyArmorSubclasses = bodySubs;

      const rangedEntry = equippedEntry(char.equipped.ranged);
      const weapon = rangedEntry != null ? ds.item(rangedEntry) : undefined;
      if (weapon) {
        if (weapon.weapon) {
          const wSub = weaponSubclassOf(weapon);
          if (wSub != null) {
            if (isBroken(char, 'ranged', weapon)) out.brokenRangedWeaponSubclass = wSub;
            else out.rangedWeaponSubclass = wSub;
          }
        } else if (!isBroken(char, 'ranged', weapon) && weapon.armorSubclass != null) {
          // Relic (libram/idol/totem) in ranged — armor class scan.
          // Cite: Player.cpp:18616–18619.
          out.rangedArmorSubclass = weapon.armorSubclass;
        }
      }

      if (weaponIsThrown(weapon) && rangedEntry != null) {
        // Equipped unit + bag stacks (stackable thrown). Cite: Spell.cpp TakeAmmo thrown.
        const bagN = inv ? countItem(inv, rangedEntry) : 0;
        out.thrownRemaining = bagN + 1;
        out.thrownEntry = rangedEntry;
        return out;
      }
      if (weaponIsWand(weapon) || !weaponNeedsProjectileAmmo(weapon)) return out;

      // Always expose empty ammo state so combat NO_AMMO gate cannot skip free shots.
      // Cite: Spell.cpp CheckCast — missing PLAYER_AMMO_ID / count → fail.
      out.ammoRemaining = 0;

      if (char.ammoItem == null) return out;
      const ammo = ds.item(char.ammoItem);
      if (!ammo?.ammoDps) return out;
      if (!checkAmmoCompatibility(weapon, ammo)) return out;
      const have = inv ? countItem(inv, char.ammoItem) : 1; // no inv → assume present for unit tests
      if (have < 1) return out;
      out.ammoDpsMin = ammo.ammoDps.dpsMin;
      out.ammoDpsMax = ammo.ammoDps.dpsMax;
      out.ammoEntry = char.ammoItem;
      out.ammoRemaining = have;
      const aSub = projectileSubclassOf(ammo);
      if (aSub != null) out.ammoSubclass = aSub;
      return out;
    })(),
    // TYPE_DAMAGE enchant flats when baked on EnchantDef or item (optional fields).
    enchantFlatMh: weaponDamageFlatForSlot(char, ds, 'mainhand'),
    enchantFlatOh: weaponDamageFlatForSlot(char, ds, 'offhand'),
    enchantFlatRanged: weaponDamageFlatForSlot(char, ds, 'ranged'),
    // CombatantSpec.attackPower is form-package-free (humanoid base); combat applies the Cat AGI
    // and shapeshift package on form enter. The sheet UI still includes form AGI.
    attackPower: attackPower({ ...char, form: 0 }, ds),
    // TEMP_ENCHANTMENT_SLOT imbues and poisons → combat procs and the rotation gate. When apply
    // stamped only combatSpellId, materialize from the combat spell so Instant Poison really procs.
    tempEnchants: (() => {
      const now = Date.now();
      const out: CombatantSpec['tempEnchants'] = {};
      for (const hand of ['mainhand', 'offhand'] as const) {
        const te = getTempEnchant(char, hand, now);
        if (!te) continue;
        let combat = te.combat;
        if (!combat && te.combatSpellId) {
          const proc = ds.spell(te.combatSpellId);
          if (proc) {
            const resolved = resolveCombatSpell(proc, { casterLevel: char.level });
            combat = combatPayloadFromSpell(resolved) as typeof te.combat;
          }
        }
        out[hand] = {
          spellId: te.spellId,
          name: ds.spell(te.spellId)?.name ?? `imbue ${te.spellId}`,
          expiresAt: te.expiresAt ?? (now + 30 * 60 * 1000),
          enchantId: te.enchantId,
          family: te.family,
          attackPower: te.attackPower,
          combatChancePct: te.combatChancePct,
          combatPpm: te.combatPpm,
          damageFlat: te.damageFlat,
          rockbiterAmount: te.rockbiterAmount,
          combat,
        };
        // Mirror buff so rotation buffPresent / UI see the imbue mid-fight too.
      }
      // KI-680: a Firestone equip is an ENCHANT_HELD_ITEM combat kit, so when OOC tempEnchants was
      // cleared but the stone is still equipped, re-seed the main hand.
      if (!out.mainhand) {
        const held = combatHeldEnchantFromEquipped(char, ds);
        if (held) {
          let combat = held.combat;
          if (!combat && held.combatSpellId) {
            const proc = ds.spell(held.combatSpellId);
            if (proc) {
              const resolved = resolveCombatSpell(proc, { casterLevel: char.level });
              combat = combatPayloadFromSpell(resolved) as typeof held.combat;
            }
          }
          out.mainhand = {
            spellId: held.spellId,
            name: ds.spell(held.spellId)?.name ?? `imbue ${held.spellId}`,
            expiresAt: now + 30 * 60 * 1000,
            enchantId: held.enchantId,
            combatChancePct: held.combatChancePct,
            combatPpm: held.combatPpm,
            combat,
          };
        }
      }
      return Object.keys(out).length ? out : undefined;
    })(),
    // OOC damage shields (Lightning Shield, Thorns) → combat with charges. The bake may leave
    // effects:[] for an aura-42 LS, so resolve at pull the way castOutOfCombat does.
    startDamageShields: (() => {
      const now = Date.now();
      const out: NonNullable<CombatantSpec['startDamageShields']> = [];
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const raw = ds.spell(a.spellId);
        if (!raw) continue;
        const sp = resolveCombatSpell(raw, { casterLevel: char.level });
        const dse = sp.effects.find((e) => e.kind === 'damage_shield');
        if (!dse || dse.kind !== 'damage_shield') continue;
        const remainingMs = a.expiresAt != null
          ? Math.max(0, a.expiresAt - now)
          : dse.durationMs;
        if (remainingMs <= 0) continue;
        const charges = (a.charges != null && a.charges > 0)
          ? a.charges
          : (dse.charges != null && dse.charges > 0
            ? dse.charges
            : ((sp.procCharges ?? 0) > 0 ? sp.procCharges : undefined));
        out.push({
          spellId: sp.id,
          name: sp.name,
          school: dse.school,
          min: dse.min,
          max: dse.max,
          remainingMs,
          ...(charges != null ? { charges } : {}),
          cooldownMs: dse.cooldownMs ?? sp.spellProcEvent?.cooldownMs,
        });
      }
      return out.length ? out : undefined;
    })(),
    // OOC aura-42 procs (Frost Armor chill, Nature's Grasp, Touch of Weakness). The bake often
    // keeps only the armor row, so resolveCombatSpell materializes the proc from rawEffects.
    startProcTriggers: (() => {
      const now = Date.now();
      const out: NonNullable<CombatantSpec['startProcTriggers']> = [];
      const seenHolders = new Set<number>();
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const raw = ds.spell(a.spellId);
        if (!raw) continue;
        const sp = resolveCombatSpell(raw, { casterLevel: char.level });
        const pe = sp.effects.find((e) => e.kind === 'proc_trigger_spell');
        if (!pe || pe.kind !== 'proc_trigger_spell') continue;
        const remainingMs = a.expiresAt != null
          ? Math.max(0, a.expiresAt - now)
          : (pe.durationMs > 0 ? pe.durationMs : 600_000);
        if (remainingMs <= 0) continue;
        // Deal vs take filtering + chance/PPM from spell_template / spell_proc_event.
        // Cite: UnitAuraProcHandler.cpp:523–526, :590–595; SpellMgr.h ProcFlags.
        const procFlags = sp.procFlags ?? sp.spellProcEvent?.procFlags;
        const procPpm = sp.spellProcEvent?.ppmRate ?? null;
        let procChance: number | null = null;
        if (sp.spellProcEvent?.customChance != null && sp.spellProcEvent.customChance > 0) {
          const c = sp.spellProcEvent.customChance;
          procChance = c > 1 ? Math.min(1, c / 100) : Math.min(1, c);
        } else if (sp.procChance != null && sp.procChance > 0) {
          // DB ProcChance is percent. Cite: UnitAuraProcHandler roll_chance_f(percent).
          procChance = Math.min(1, sp.procChance / 100);
        }
        seenHolders.add(sp.id);
        out.push({
          spellId: sp.id,
          name: sp.name,
          triggerSpellId: pe.triggerSpellId,
          remainingMs,
          charges: a.charges ?? pe.charges ?? sp.procCharges,
          cooldownMs: pe.cooldownMs ?? sp.spellProcEvent?.cooldownMs,
          ...(procFlags != null && procFlags !== 0 ? { procFlags } : {}),
          ...(procPpm != null && procPpm > 0 ? { procPpm } : {}),
          ...(procChance != null ? { procChance } : {}),
        });
      }
      // Permanent chest Absorption etc. — equip_spell proc_spell never lands in activeAuras.
      // Cite: Player.cpp ApplyEnchantment TYPE_EQUIP_SPELL; KI-1045.
      for (const row of permanentEnchantProcTriggers(char, ds)) {
        if (seenHolders.has(row.spellId)) continue;
        seenHolders.add(row.spellId);
        out.push(row);
      }
      return out.length ? out : undefined;
    })(),
    // OOC school_absorb (PW:Shield, the Wards, Ice Barrier) → combat with remaining duration. Many
    // ranks bake effects=[] with raw aura 69, so a hollow aura must still seed a pool.
    // Boots enchant and speed talents ride as permanent aura rows, so a Sprint or a pair of Rocket
    // Boots REPLACES them rather than adding to them. Cite: Unit.cpp:8352 GetMaxPositiveAuraModifier.
    permanentSpeedAuras: (() => {
      const rows = permanentSpeedAuras(char, ds);
      return rows.length ? rows : undefined;
    })(),
    startSchoolAbsorbs: (() => {
      const now = Date.now();
      const out: NonNullable<CombatantSpec['startSchoolAbsorbs']> = [];
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const sp = resolveCombatSpell(spRaw, { casterLevel: char.level });
        const se = sp.effects.find((e) => e.kind === 'school_absorb');
        if (!se || se.kind !== 'school_absorb') continue;
        const remainingMs = a.expiresAt != null
          ? Math.max(0, a.expiresAt - now)
          : se.durationMs;
        if (remainingMs <= 0) continue;
        out.push({
          spellId: sp.id,
          name: sp.name,
          schoolMask: se.schoolMask,
          min: se.min,
          max: se.max,
          remainingMs,
        });
      }
      return out.length ? out : undefined;
    })(),
    // OOC restore_health HoTs (Renew, Rejuvenation) → combat with remaining duration, resolving raw
    // when the bake is empty. `pctOfMax` is OBS_MOD_HEALTH (Fel Stamina 18790).
    startRestoreHealth: (() => {
      const now = Date.now();
      const out: NonNullable<CombatantSpec['startRestoreHealth']> = [];
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const sp = resolveCombatSpell(spRaw, { casterLevel: char.level });
        const he = sp.effects.find((e) => e.kind === 'restore_health');
        if (!he || he.kind !== 'restore_health') continue;
        // Pet-target HoT (Health Funnel / Mend Pet) is on the pet, not the owner.
        if (he.applyTo === 'pet' || sp.role === 'pet_heal') continue;
        const remainingMs = a.expiresAt != null
          ? Math.max(0, a.expiresAt - now)
          : he.durationMs;
        if (remainingMs <= 0) continue;
        out.push({
          spellId: sp.id,
          name: sp.name,
          amountPerTick: he.amountPerTick,
          tickMs: he.tickMs,
          remainingMs,
          ...((he.pctOfMax ?? 0) > 0 ? { pctOfMax: Math.trunc(he.pctOfMax!) } : {}),
        });
      }
      return out.length ? out : undefined;
    })(),
    // OOC restore_power (Fel Energy 18792 OBS_MOD_MANA) → combat ticks.
    // Cite: SpellAuras.cpp OBS_MOD_MANA; Warlock.cpp DemonicSacrifice Felhunter; KI-833.
    startRestorePower: (() => {
      const now = Date.now();
      const out: NonNullable<CombatantSpec['startRestorePower']> = [];
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const sp = resolveCombatSpell(spRaw, { casterLevel: char.level });
        const pe = sp.effects.find((e) => e.kind === 'restore_power');
        if (!pe || pe.kind !== 'restore_power') continue;
        // Skip hostile leech (Viper Sting): amountPerTick < 0 without pctOfMax.
        if ((pe.amountPerTick ?? 0) < 0 && !(pe.pctOfMax && pe.pctOfMax > 0)) continue;
        const remainingMs = a.expiresAt != null
          ? Math.max(0, a.expiresAt - now)
          : pe.durationMs;
        if (remainingMs <= 0) continue;
        out.push({
          spellId: sp.id,
          name: sp.name,
          amountPerTick: pe.amountPerTick,
          tickMs: pe.tickMs,
          remainingMs,
          ...((pe.pctOfMax ?? 0) > 0 ? { pctOfMax: Math.trunc(pe.pctOfMax!) } : {}),
          ...(pe.powerType != null ? { powerType: pe.powerType | 0 } : {}),
        });
      }
      return out.length ? out : undefined;
    })(),
    // OOC mana_shield → combat by the same import path as school_absorb. Mana Shield ranks bake
    // effects=[] with raw aura 97, so they materialize through resolveCombatSpell.
    startManaShields: (() => {
      const now = Date.now();
      const out: NonNullable<CombatantSpec['startManaShields']> = [];
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const sp = resolveCombatSpell(spRaw, { casterLevel: char.level });
        const me = sp.effects.find((e) => e.kind === 'mana_shield');
        if (!me || me.kind !== 'mana_shield') continue;
        const remainingMs = a.expiresAt != null
          ? Math.max(0, a.expiresAt - now)
          : me.durationMs;
        if (remainingMs <= 0) continue;
        out.push({
          spellId: sp.id,
          name: sp.name,
          schoolMask: me.schoolMask,
          min: me.min,
          max: me.max,
          manaMultiplier: me.manaMultiplier,
          remainingMs,
        });
      }
      return out.length ? out : undefined;
    })(),
    // OOC next_cast_mod (Presence of Mind, Nature's Swiftness, Cold Blood) → pendingSpellMod. Bake
    // rows are often effects:[] with aura 107/108 only, so the engine effect materializes here.
    startPendingSpellMod: (() => {
      const now = Date.now();
      let best: NonNullable<CombatantSpec['startPendingSpellMod']> | undefined;
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const sp = resolveCombatSpell(spRaw, { casterLevel: char.level });
        const mod = pendingSpellModFromResolved(sp);
        if (!mod) continue;
        const me = sp.effects.find((e) => e.kind === 'next_cast_mod');
        const scriptedDur = me && me.kind === 'next_cast_mod' ? me.durationMs : 0;
        const remainingMs = a.expiresAt != null
          ? Math.max(0, a.expiresAt - now)
          : (scriptedDur > 0 ? scriptedDur : 600_000);
        if (remainingMs <= 0) continue;
        // Last matching aura wins (combat also replaces any prior pendingSpellMod).
        best = { ...mod, remainingMs };
      }
      return best;
    })(),
    // Lasting 107/108 from OOC auras + known/set-bonus passives (not talent ranks —
    // those stay on withTalentMods). Cite: Player.cpp AddSpellMod; spellModIntents.ts.
    startOwnedSpellMods: (() => {
      const now = Date.now();
      const out: NonNullable<CombatantSpec['startOwnedSpellMods']> = [];
      const seen = new Set<number>();
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const remainingMs = a.expiresAt != null ? a.expiresAt - now : 1;
        if (a.expiresAt != null && remainingMs <= 0) continue;
        const sp = resolveCombatSpell(spRaw, { casterLevel: char.level });
        const me = sp.effects.find((e) => e.kind === 'owned_spell_mods');
        if (!me || me.kind !== 'owned_spell_mods') continue;
        seen.add(sp.id);
        for (const m of me.mods) {
          out.push({
            spellId: sp.id,
            op: m.op,
            type: m.type,
            value: m.amount,
            familyName: sp.spellFamilyName,
            familyFlags: m.familyFlags,
          });
        }
      }
      const talentRankIds = new Set<number>();
      for (const tree of ds.talentTrees(char.cls)) {
        for (const t of tree.talents ?? []) {
          for (const r of t.ranks ?? []) {
            if (r.spellId) talentRankIds.add(r.spellId | 0);
          }
        }
      }
      const considerPassive = (id: number) => {
        if (seen.has(id) || talentRankIds.has(id)) return;
        const raw = ds.spell(id);
        if (!raw?.passive) return;
        const mods = ownedSpellModsFromSpell(raw);
        if (!mods.length) return;
        seen.add(id);
        out.push(...mods);
      };
      for (const id of sb.known) considerPassive(id);
      for (const id of activeSetBonusSpells(char, ds)) considerPassive(id);
      return out.length ? out : undefined;
    })(),
    // OOC Combustion → combat fire-crit counter. Cite: UnitAuraProcHandler.cpp:991-1003.
    startCombustion: (() => {
      const now = Date.now();
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const sp = resolveCombatSpell(spRaw, { casterLevel: char.level });
        const ce = sp.effects.find((e) => e.kind === 'combustion');
        if (!ce || ce.kind !== 'combustion') continue;
        const remainingMs = a.expiresAt != null ? Math.max(0, a.expiresAt - now) : 600_000;
        if (remainingMs <= 0) continue;
        const charges = (a.charges != null && a.charges > 0) ? a.charges : ce.charges;
        if (charges <= 0) continue;
        return { spellId: sp.id, name: sp.name, charges, stacks: 1, remainingMs };
      }
      return undefined;
    })(),
    // OOC Sweeping Strikes → combat charge counter. Cite: UnitAuraProcHandler.cpp:810–841.
    startSweepingStrikes: (() => {
      const now = Date.now();
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const sp = resolveCombatSpell(spRaw, { casterLevel: char.level });
        const se = sp.effects.find((e) => e.kind === 'sweeping_strikes');
        if (!se || se.kind !== 'sweeping_strikes') continue;
        const remainingMs = a.expiresAt != null
          ? Math.max(0, a.expiresAt - now)
          : (se.durationMs > 0 ? se.durationMs : 20_000);
        if (remainingMs <= 0) continue;
        const charges = (a.charges != null && a.charges > 0) ? a.charges : se.charges;
        if (charges <= 0) continue;
        return { spellId: sp.id, name: sp.name, charges, remainingMs };
      }
      return undefined;
    })(),
    // OOC Vampiric Embrace → combat leech pct. Cite: UnitAuraProcHandler.cpp:1015–1028.
    startVampiricEmbrace: (() => {
      const now = Date.now();
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const sp = resolveCombatSpell(spRaw, { casterLevel: char.level });
        const se = sp.effects.find((e) => e.kind === 'vampiric_embrace');
        if (!se || se.kind !== 'vampiric_embrace') continue;
        const remainingMs = a.expiresAt != null
          ? Math.max(0, a.expiresAt - now)
          : (se.durationMs > 0 ? se.durationMs : 60_000);
        if (remainingMs <= 0) continue;
        return { spellId: sp.id, name: sp.name, pct: se.pct, remainingMs };
      }
      return undefined;
    })(),
    // OOC paladin seal → combat ActiveSeal and buff bar. The bake is often effects:[], so
    // resolveCombatSpell materializes the seal through paladin-seals.ts. Cite: KI-894.
    startActiveSeal: (() => {
      const now = Date.now();
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const sp = resolveCombatSpell(spRaw, { casterLevel: char.level });
        const se = sp.effects.find((e) => e.kind === 'seal');
        if (!se || se.kind !== 'seal') continue;
        const remainingMs = a.expiresAt != null
          ? Math.max(0, a.expiresAt - now)
          : (se.durationMs > 0 ? se.durationMs : 30_000);
        if (remainingMs <= 0) continue;
        // One seal — last matching aura wins (OOC cast already exclusivity-filters).
        return {
          spellId: sp.id,
          name: sp.name,
          seal: se.seal,
          coeff: se.coeff,
          procPpm: se.procPpm,
          onSwingWeaponPct: se.onSwingWeaponPct,
          onSwingHeal: se.onSwingHeal,
          onSwingMana: se.onSwingMana,
          judge: withJudgeFromCarrier(se.judge, ds),
          remainingMs,
        };
      }
      return undefined;
    })(),
    // OOC school_immunity (Divine Shield / DP / BoP) → combat ImmunityState.
    // Cite: SPELL_AURA_SCHOOL_IMMUNITY; KI-086 pre-pull DS; createSession seedSchoolImmunities.
    startSchoolImmunities: (() => {
      const now = Date.now();
      const out: NonNullable<CombatantSpec['startSchoolImmunities']> = [];
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        // Prefer resolved effects so thin bake rows still carry immunity (SI5).
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        const sp = resolveCombatSpell(spRaw);
        for (const se of sp.effects) {
          if (se.kind !== 'school_immunity') continue;
          const remainingMs = a.expiresAt != null
            ? Math.max(0, a.expiresAt - now)
            : (se.durationMs > 0 ? se.durationMs : 0);
          if (remainingMs <= 0) continue;
          out.push({
            spellId: sp.id,
            name: sp.name,
            schoolMask: se.schoolMask | 0,
            remainingMs,
            positive: se.positive !== false,
            mechanic: mechanicIdFromName(sp.mechanic) || undefined,
          });
        }
      }
      return out.length ? out : undefined;
    })(),
    // OOC buffs, aspects, forms and auras → the combat buff bar; the start* importers own shield,
    // HoT and absorb rows. Many self-buffs ship empty effects[], so resolve them the same way.
    startDisplayAuras: (() => {
      const now = Date.now();
      const out: NonNullable<CombatantSpec['startDisplayAuras']> = [];
      // An allowlist, not a denylist: characterRatings already folds crit and defense from
      // activeAuras, so admitting them here applies twice. damage_done_pct and haste are combat-only.
      const COMBAT_ONLY_BUFF_MODS = new Set(['threat_mod', 'armor_pct', 'dodge', 'damage_done_pct', 'haste', 'cast_haste']);
      for (const a of pruneExpiredAuras(char.activeAuras, now)) {
        const spRaw = ds.spell(a.spellId);
        if (!spRaw) continue;
        // Resolve scripted residuals so next_cast_mod chips stay on the bar, and interpreter effects
        // when the bake is empty. Berserking icon 1661 needs the health % for its haste mod.
        const hpPct = mh > 0 ? ((char.health ?? mh) / mh) * 100 : 100;
        const sp = resolveCombatSpell(spRaw, {
          casterLevel: char.level,
          casterHealthPercent: hpPct,
          casterMaxHealth: mh,
        });
        const kinds = new Set(sp.effects.map((e) => e.kind));
        const visible = kinds.has('buff') || kinds.has('speed') || kinds.has('shapeshift')
          || kinds.has('stealth') || kinds.has('feather_fall') || kinds.has('hover')
          || kinds.has('school_immunity')
          || kinds.has('damage_immunity') || kinds.has('mechanic_immunity')
          || kinds.has('dispel_immunity')
          || kinds.has('next_cast_mod')
          || kinds.has('owned_spell_mods')
          || kinds.has('sweeping_strikes')
          || kinds.has('combustion')
          || kinds.has('vampiric_embrace')
          // Mage Armor resist-only self aura. Cite: KI-482; resistances() from activeAuras.
          || kinds.has('resist')
          // SPELL_AURA_DUMMY (4) equip — Onyxia Scale Cloak 22683. Cite: SpellEffects.cpp:3756.
          || (spRaw.rawEffects ?? []).some((r) => (r.effect | 0) === 6 && (r.auraName | 0) === 4);
        if (!visible) continue;
        // Pure hostile debuffs never ride player OOC auras for display carry, and a baked
        // `hostile:false` is respected — Divine Shield's haste −100 is a self penalty.
        const onlyHostile = sp.effects.length > 0 && sp.effects.every((e) =>
          (e.kind === 'buff' && e.hostile !== false && !!(e.hostile || e.amount < 0))
          || (e.kind === 'speed' && e.hostile !== false && !!(e.hostile || e.pct < 0))
          || e.kind === 'dot' || e.kind === 'direct_damage' || e.kind === 'root' || e.kind === 'cc',
        );
        if (onlyHostile) continue;
        const permanent = a.expiresAt == null;
        const remainingMs = permanent
          ? undefined
          : Math.max(0, (a.expiresAt as number) - now);
        if (!permanent && (remainingMs ?? 0) <= 0) continue;
        // Combat-only buff mods; passives skip the kitSpell seed. Permanent passive dodge is already
        // folded into domain dodgeChance, so it must not re-apply. Timed Evasion still seeds.
        const liveBuffs: NonNullable<NonNullable<CombatantSpec['startDisplayAuras']>[number]['liveBuffs']> = [];
        const mechanicImmunities: number[] = [];
        const dispelImmunities: number[] = [];
        for (const e of sp.effects) {
          if (
            e.kind === 'buff'
            && e.mod
            && COMBAT_ONLY_BUFF_MODS.has(e.mod)
            && e.hostile !== true
            && (e.amount ?? 0) !== 0
            // Permanent passive dodge is already in the sheet's dodgeChance (racial Quickness);
            // timed Evasion still seeds. Cite: passiveBuffModPoints; KI-522.
            && !(sp.passive && e.mod === 'dodge' && (e.durationMs ?? 0) <= 0)
          ) {
            liveBuffs.push({
              mod: e.mod,
              amount: e.amount,
              ...(e.school ? { school: e.school } : {}),
            });
          } else if (e.kind === 'mechanic_immunity') {
            mechanicImmunities.push(e.mechanic | 0);
          } else if (e.kind === 'dispel_immunity') {
            dispelImmunities.push(e.dispelType | 0);
          }
        }
        // Scripted boost immunities (Stoneform 20594 → 20612 disease + bleed).
        // Cite: SpellAuras.cpp:5567 HandleSpellSpecificBoosts; immunityBoostAurasForSpell.
        const boostDur = remainingMs ?? 0;
        for (const boost of immunityBoostAurasForSpell(sp.id, boostDur)) {
          if (boost.auraType === AURA_TYPE.MECHANIC_IMMUNITY && (boost.mechanic ?? 0) > 0) {
            mechanicImmunities.push(boost.mechanic! | 0);
          } else if (boost.auraType === AURA_TYPE.DISPEL_IMMUNITY && (boost.dispelType ?? 0) > 0) {
            dispelImmunities.push(boost.dispelType! | 0);
          }
        }
        out.push({
          spellId: sp.id,
          name: sp.name,
          ...(permanent ? { permanent: true as const } : { remainingMs }),
          ...(liveBuffs.length ? { liveBuffs } : {}),
          ...(mechanicImmunities.length ? { mechanicImmunities } : {}),
          ...(dispelImmunities.length ? { dispelImmunities } : {}),
          ...(isContinuousPartyAura(spRaw) ? areaAuraSeedFields(sp) : {}),
          ...(() => {
            // Carriers seed via startDamageShields / startProcTriggers — do not also
            // stamp the display buff (Holy Shield block + shield).
            if (kinds.has('damage_shield') || kinds.has('proc_trigger_spell')) return {};
            const n = (a.charges != null && a.charges > 0) ? a.charges : auraHolderCharges(sp);
            if (!(n > 0)) return {};
            const chargedSheetBuffs: NonNullable<NonNullable<CombatantSpec['startDisplayAuras']>[number]['chargedSheetBuffs']> = [];
            for (const e of sp.effects) {
              if (
                e.kind === 'buff'
                && e.mod
                && SHEET_BAKED_BUFF_MODS.has(e.mod)
                && e.hostile !== true
                && (e.amount ?? 0) !== 0
              ) {
                chargedSheetBuffs.push({
                  mod: e.mod,
                  amount: e.amount,
                  ...(e.school ? { school: e.school } : {}),
                });
              }
            }
            const pf = (sp.procFlags ?? 0) | 0;
            return {
              charges: n,
              ...(pf !== 0 ? { procFlags: pf } : {}),
              ...(chargedSheetBuffs.length ? { chargedSheetBuffs } : {}),
            };
          })(),
        });
      }
      // Equip SPELL_AURA_DUMMY even when applyItemEquipSpells did not seed activeAuras
      // (companion paperdoll). Cite: SpellEffects.cpp:3756 GetDummyAura(22683).
      const seen = new Set(out.map((a) => a.spellId));
      for (const it of equippedItems(char, ds)) {
        for (const sid of it.equipSpells ?? []) {
          if (seen.has(sid)) continue;
          const spRaw = ds.spell(sid);
          const dummy = !spRaw || (spRaw.rawEffects ?? []).some(
            (r) => (r.effect | 0) === 6 && (r.auraName | 0) === 4,
          );
          if (!dummy) continue;
          seen.add(sid);
          out.push({ spellId: sid, name: spRaw?.name ?? it.name, permanent: true });
        }
      }
      return out.length ? out : undefined;
    })(),
    /** Sheet AGI for mid-fight Cat AP (SHAPESHIFT_FLAG_AGILITY_ATTACK_BONUS). */
    agility: stats.agi,
    rangedAttackPower: rangedAttackPower(char, ds),
    critChance: critChance(char, ds),
    spellCritChance: spellCritChanceFromStats(char, ds),
    hitChance: hitChance(char, ds),
    // SPELL_AURA_MOD_SPELL_HIT_CHANCE gear — seeds Fighter.spellHitBonusPercent.
    // Cite: SpellAuras.cpp HandleModSpellHitChance; OPEN 197 hollow Equip: spell_hit.
    spellHitBonusPercent: spellHitBonusFromGear(char, ds),
    // Melee/cast haste from gear stats; quiver ammo-haste is ranged-only (rangedHastePct).
    haste: haste(char, ds),
    // SPELL_AURA_MOD_RANGED_AMMO_HASTE from equipped quiver/pouch equipSpells.
    // Cite: SpellAuras.cpp HandleRangedAmmoHaste (highest only).
    ...((): { rangedHastePct?: number } => {
      const pct = equippedQuiverRangedHastePct(char, ds);
      return pct > 0 ? { rangedHastePct: pct } : {};
    })(),
    dodgeChance: dodgeChance(char, ds, sb),
    parryChance: parryChance(char, ds, sb),
    blockChance: blockChance(char, ds, sb),
    blockValue: hasSh ? blockValue(char, ds) : 0,
    canParry: canP,
    canBlock: hasSh,
    // GetWeaponSkillValue / GetDefenseSkillValue = pure trained + MOD_SKILL bonuses.
    // Cite: Unit.cpp :4036 / :2970; Player.h GetSkillValue.
    ...(() => {
      const skillBonuses = collectSkillBonuses(char, ds, sb);
      const mhId = weaponSkillIdForHand(char, ds, 'mainhand');
      const ohId = weaponSkillIdForHand(char, ds, 'offhand') || undefined;
      const rngId = weaponSkillIdForHand(char, ds, 'ranged') || undefined;
      return {
        weaponSkill: weaponSkill(char, ds, sb),
        defenseSkill: defenseSkill(char, ds, sb),
        weaponSkillId: mhId,
        offhandSkillId: ohId,
        rangedSkillId: rngId,
        offhandWeaponSkill: ohId
          ? weaponSkillForHand(char, ds, 'offhand', sb, skillBonuses)
          : undefined,
        rangedWeaponSkill: rngId
          ? weaponSkillForHand(char, ds, 'ranged', sb, skillBonuses)
          : undefined,
        skillBonuses: Object.keys(skillBonuses).length ? { ...skillBonuses } : undefined,
        // Live map for mid-fight skill gain; absent → pure L×5 (legacy) but bonuses still apply.
        combatSkills: char.combatSkills ? { ...char.combatSkills } : undefined,
      };
    })(),
    intellect: stats.int,
    // Gear + spell_power auras; recomputed each build (not frozen across OOC buff lifecycle).
    spellPower: spellPower(char, ds),
    // One-school MOD_DAMAGE_DONE extras. Benefit = spellPower + map[school].
    // Cite: Unit.cpp SpellBaseDamageBonusDone ~7129.
    ...(() => {
      const bySchool = spellDamageBySchool(char, ds);
      return Object.keys(bySchool).length ? { spellDamageBySchool: bySchool } : {};
    })(),
    // SIE healing_power + equipMods healing_done. Classic separates heal bonus from SP. KI-590.
    healingPower: healingPower(char, ds),
    resistances: resistances(char, ds),   // racial + buffs + talents + gear (Item 5)
    // Hardiness etc. Cite: Unit.cpp GetTotalAuraModifierByMiscValue(MOD_MECHANIC_RESISTANCE).
    ...(() => {
      const mr = mechanicResistPct(char, ds, sb?.known);
      return Object.keys(mr).length ? { mechanicResistPct: mr } : {};
    })(),
    ...(formTalentAuras ? { formTalentAuras } : {}),
    creatureType: combatantCreatureType(char), // Undead heroes are poly-immune; everyone else is Humanoid
    damagePctBySchool: talentDamagePctBySchool(char, ds),
    critChanceBonus: talentCritBonus(char, ds),
    // SPELLMOD_RADIUS (op 6) mods this unit owns — Totemic Mastery, Guardian Totems, baked set
    // rows. Combat reads them at the area-aura seam: ONE pipeline, no hardcoded "Mastery = 30".
    radiusSpellMods: radiusSpellModsFromTalentEffects(activeTalentEffects(char, ds)),
    ...(victimAtt.rows.length ? { startAddTargetTriggers: victimAtt.rows } : {}),
    procs: activeTalentProcsWithHolder(char, ds)
      .filter(({ holderSpellId }) => !victimAtt.skipHolders.has(holderSpellId | 0))
      .map(({ effect: e, holderSpellId, stances }) => {
        // Prefer filters baked on the talent effect, from the talent rank's own proc event, and
        // fall back to the trigger spell's — companions usually have no family mask.
        const pe = ds.spell(e.triggerSpellId)?.spellProcEvent;
        // EX3_CAN_PROC_FROM_PROCS lives on the talent RANK spell that owns the proc, so it is
        // resolved here where the DataStore is in hand. Cite: UnitAuraProcHandler.cpp:610.
        const holder = holderSpellId > 0 ? ds.spell(holderSpellId) : undefined;
        const canProcFromProcs = holder != null
          && hasAttrEx3(holder, SPELL_ATTR_EX3.CAN_PROC_FROM_PROCS);
        // PROC_FAILURE_BURNS_CHARGE is Attributes bit 0, on the holder too.
        const failureBurnsCharge = holder != null && hasAttr(holder, SPELL_ATTR.PROC_FAILURE_BURNS_CHARGE);
        return {
          triggerSpellId: e.triggerSpellId,
          ...(canProcFromProcs ? { canProcFromProcs: true } : {}),
          ...(failureBurnsCharge ? { failureBurnsCharge: true } : {}),
          ...(holder?.spellIconId != null ? { spellIconId: holder.spellIconId } : {}),
          // Blood Frenzy is cat, Primal Fury bear/dire — the PROC path reads the live form.
          ...(stances ? { stances } : {}),
          chance: e.chance ?? null,
          ppm: e.ppm ?? pe?.ppmRate ?? null,
          procFlags: e.procFlags ?? pe?.procFlags,
          procEx: e.procEx ?? pe?.procEx,
          // Setup bake ICD 1000s is wrong — CMaNGOS Cooldown=0. Cite: mangos.sql 13983.
          cooldownMs: e.triggerSpellId === SETUP_TRIGGER_SPELL_ID
            ? 0
            : (e.cooldownMs ?? pe?.cooldownMs),
          schoolMask: e.schoolMask ?? pe?.schoolMask,
          spellFamilyName: e.spellFamilyName ?? pe?.spellFamilyName,
          spellFamilyMask: e.spellFamilyMask ?? pe?.spellFamilyMask,
        };
      }),
    gearProcs: (() => {
      const fromItems = equippedItems(char, ds).flatMap((it) => (it.procs ?? []).map((p) => ({ ...p })));
      // Permanent weapon TYPE_COMBAT_SPELL (Crusader / Fiery / …). Cite: CastItemCombatSpell; KI-1044.
      const fromEnchants = permanentEnchantCombatProcs(char, ds);
      if (!fromEnchants.length) return fromItems;
      const seen = new Set(fromItems.map((p) => p.spell));
      const merged = fromItems.slice();
      for (const p of fromEnchants) {
        if (seen.has(p.spell)) continue;
        seen.add(p.spell);
        merged.push(p);
      }
      return merged;
    })(),
    spells: (() => {
      const base = knownCombatSpells(char, sb, ds);
      const tEffs = activeTalentEffects(char, ds);
      const procIds = new Set<number>();
      for (const e of tEffs) if (e.kind === 'proc' && e.triggerSpellId) procIds.add(e.triggerSpellId);
      for (const r of victimAtt.rows) procIds.add(r.triggerSpellId);
      // Channel and aura trigger payloads on the known kit, plus SPELL_EFFECT_TRIGGER_SPELL (64)
      // secondaries, must be re-attached here or applySpell's trigger lookup fails.
      for (const s of base) {
        for (const e of s.effects) {
          if (e.kind === 'proc_trigger_spell' && e.triggerSpellId) procIds.add(e.triggerSpellId);
          else if (e.kind === 'trigger_spell' && e.spellId) procIds.add(e.spellId);
        }
      }
      // An OOC-armed aura-42 may sit only on activeAuras, since the parent can be level-gated out
      // of knownCombatSpells while castOutOfCombat armed it. Resolve the holder so 28598 rewrites.
      {
        const nowAura = Date.now();
        for (const a of pruneExpiredAuras(char.activeAuras, nowAura)) {
          const raw = ds.spell(a.spellId);
          if (!raw) continue;
          const sp = resolveCombatSpell(raw, { casterLevel: char.level });
          for (const e of sp.effects) {
            if (e.kind === 'proc_trigger_spell' && e.triggerSpellId) procIds.add(e.triggerSpellId);
            else if (e.kind === 'trigger_spell' && e.spellId) procIds.add(e.spellId);
          }
        }
      }
      // Permanent enchant combat_spell + Absorption holders/triggers (KI-1044 / KI-1045).
      for (const p of permanentEnchantCombatProcs(char, ds)) procIds.add(p.spell);
      for (const row of permanentEnchantProcTriggers(char, ds)) {
        procIds.add(row.spellId);
        procIds.add(row.triggerSpellId);
      }
      const extra: SpellDef[] = [];
      for (const pid of procIds) {
        if (!base.some((s) => s.id === pid)) {
          const ps = ds.spell(pid);
          if (ps) {
            // SI5: materialize trigger payloads (Chilled 6136 haste+speed, etc.) — bake may
            // only carry one effect while rawEffects has the rest. Cite: KI-483 Chilled 6136.
            extra.push(resolveCombatSpell(ps, { casterLevel: char.level }));
          } else {
            // Freezing and Frost trap effect rows are absent from the bake, so a SQL-sourced
            // synthetic payload is injected for fireDamageShields to resolve the armed proc.
            const synth = syntheticHunterTrapPayload(pid) ?? syntheticTalentTriggerPayload(pid);
            if (synth) extra.push(synth);
          }
        }
      }
      // Gear proc trigger spells (E1) + SI6 aura-42 nested triggers (empty-effects holders).
      for (const it of equippedItems(char, ds)) {
        const itemProcIds = gearProcTriggerSpellIds(it.procs, (id) => ds.spell(id));
        for (const sid of itemProcIds) {
          if (!base.some((s) => s.id === sid) && !extra.some((s) => s.id === sid)) {
            const ps = ds.spell(sid);
            if (ps) extra.push(ps);
          }
        }
      }
      // ItemSetDef bonus spells when piece count met (character derivation + combat) (E1)
      for (const sid of activeSetBonusSpells(char, ds)) {
        if (!base.some((s) => s.id === sid) && !extra.some((s) => s.id === sid)) {
          const ps = ds.spell(sid);
          if (ps) extra.push(ps);
        }
      }
      // A HOLDER THAT ARRIVES IN `extra` NEEDS ITS PAYLOAD TOO: the procIds walk runs over `base`
      // only, so five live 6pc set bonuses armed their branch and delivered nothing.
      {
        const payloadQueue: SpellDef[] = [...base, ...extra];
        for (let qi = 0; qi < payloadQueue.length; qi++) {
          const holder = payloadQueue[qi]!;
          const ids: number[] = [];
          for (const e of holder.effects) {
            if (e.kind === 'proc_trigger_spell' && e.triggerSpellId) ids.push(e.triggerSpellId);
            else if (e.kind === 'trigger_spell' && e.spellId) ids.push(e.spellId);
          }
          for (const pid of specialCasePayloadIds(holder.id)) ids.push(pid);
          for (const pid of ids) {
            if (base.some((x) => x.id === pid) || extra.some((x) => x.id === pid)) continue;
            const ps = ds.spell(pid);
            if (!ps) continue;
            const resolved = resolveCombatSpell(ps, { casterLevel: char.level });
            extra.push(resolved);
            payloadQueue.push(resolved);
          }
        }
      }
      return [...base, ...extra];
    })(),
  };
}
