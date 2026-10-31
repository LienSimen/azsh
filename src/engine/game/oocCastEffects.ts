// OOC cast effect application, peeled from game.ts: beneficial self effects for castOutOfCombat,
// including the trigger-spell expansion that turns Vanish into its stealth payload.

import type { DataStore } from '../../data/dataStore.ts';
import type { SpellDef } from '../../data/schema.ts';
import type { Character } from '../../domain/character/character.ts';
import {
  FUROR_BEAR_RAGE, FUROR_CAT_ENERGY, furorChancePctBy,
} from '../spells/interpreter/class-scripts-kit.ts';
import {
  applyAura,
  applyInebriate,
  applyTempEnchant,
  currentMana,
  getActiveBuffIds,
  maxHealth,
  powerType,
  pruneExpiredAuras,
} from '../../domain/character/character.ts';
import { setHover } from '../../domain/core/hover.ts';
import {
  classHasParallelMana,
  formPowerType,
  formResourceMax,
  formResourceOnEnter,
  formZerosPoolOnEnter,
  FORM_LABEL,
  isFormSpell,
  isStealthShapeshift,
  isWarriorStance,
} from '../../domain/character/forms.ts';
import type { Inventory } from '../../domain/items/inventory.ts';
import { addItem } from '../../domain/items/inventory.ts';
import type { LootDrop } from '../../domain/items/loot.ts';
import {
  petMaxHealth, newPet, reconcilePetPartyAuras, stripPetPartyAuras,
  petPartyAuraSpellIds, applyPetPartyAuras, applyLearnPetSpellCast,
} from '../../domain/pet/pet.ts';
import {
  collectDispellable,
  getDispelMask,
  processDispelList,
  DISPEL_TYPE,
  type DispellableAura,
} from '../../domain/spells/dispel.ts';
import { MECHANIC_MOUNT, peelMechanicAuras } from '../../domain/spells/dispelMechanic.ts';
import { dismount } from '../../domain/items/mounts.ts';
import { grantSpellReputation } from './spellReputation.ts';
import { addBonusHonor, newHonorState } from '../../domain/run/honor.ts';
import { applyDurabilityDamageFromSpell } from './applySpellDurability.ts';
import { rollBetween } from '../combat/formulas.ts';
import type { Rng } from '../core/rng.ts';
import { resolveHealMaxHealth } from '../spells/effects.ts';
import { resolveCombatSpell } from '../spells/interpreter/index.ts';
import { durMs } from '../spells/interpreter/duration.ts';
import {
  applyOocLifeTap, applyOocSiAura, isHostileTargetBuffOrSnare, isOocSiAuraKind,
} from './oocCast.ts';
import { DEMONIC_SACRIFICE_RESULT_SPELL_ID_SET } from '../spells/interpreter/handlers/shared.ts';
import { isHunterTrapArmProc, isHunterTrapCast } from '../spells/interpreter/hunter-kit.ts';
import type { PendingSpellMod } from '../combat/types.ts';
import { nextCastModApplies, pendingSpellModFromResolved } from '../combat/roles.ts';

// `isHostileTargetBuffOrSnare` lives in oocCast.ts so the effect applier and the pre-spend check cannot
// drift apart. Re-exported here because existing callers import it from this module.
export { isHostileTargetBuffOrSnare };

export interface ApplyOocCastEffectsInput {
  spellId: number;
  spell: SpellDef;
  char: Character;
  inventory: Inventory;
  ds: DataStore;
  now: number;
  alreadyStealthed: boolean;
  log: (msg: string) => void;
  // The temp-enchantment hand for a weapon imbue, resolved by castOutOfCombat with main hand first.
  // Required whenever the spell carries an imbue. Cite: SpellEffects.cpp EffectEnchantItemTmp.
  weaponImbueHand?: 'mainhand' | 'offhand';
  // The caster's own known-spell ids. Only the PLAYER's cast path has one, and only a shift reads it
  // (Furor's rank). An NPC casting a form on someone passes nothing and rolls nothing.
  knownSpellIds?: readonly number[];
  /** Conjure stack roll. Absent → the minimum, so a caller with no seed stays deterministic. */
  rng?: Rng;
}

export interface ApplyOocCastEffectsResult {
  char: Character;
  inventory: Inventory;
  conjured: LootDrop[];
}

// Apply resolved OOC cast effects onto char/inventory. Expands trigger_spell payloads (Vanish 1857 → 11329
// stealth + 18461 purge) under the triggered spell id.
export function applyOocCastEffects(input: ApplyOocCastEffectsInput): ApplyOocCastEffectsResult {
  const { spellId, spell: s, ds, now, alreadyStealthed, log } = input;
  let { char, inventory } = input;
  const conjured: LootDrop[] = [];

  type OocWork = {
    auraSpellId: number;
    auraName: string;
    owner: SpellDef;
    eff: SpellDef['effects'][number];
  };
  const work: OocWork[] = s.effects.map((eff) => ({
    auraSpellId: spellId,
    auraName: s.name,
    owner: s,
    eff,
  }));
  const seenTrig = new Set<number>();

  for (let wi = 0; wi < work.length; wi++) {
    const { auraSpellId, auraName, owner, eff } = work[wi]!;
    if (eff.kind === 'trigger_spell') {
      // SPELL_EFFECT_TRIGGER_SPELL (64): apply payload OOC (Vanish → stealth). Cite: KI-458.
      if (seenTrig.has(eff.spellId)) continue;
      seenTrig.add(eff.spellId);
      const trigRaw = ds.spell(eff.spellId);
      if (!trigRaw) continue;
      const trig = resolveCombatSpell(trigRaw, { casterLevel: char.level });
      for (const te of trig.effects) {
        work.push({
          auraSpellId: trig.id,
          auraName: trig.name,
          owner: trig,
          eff: te,
        });
      }
      continue;
    }
    if (eff.kind === 'buff') {
      // Hostile debuffs need an enemy - never self-apply OOC (KI-049).
      if (isHostileTargetBuffOrSnare(eff)) continue;
      char = applyAura(char, auraSpellId, eff.durationMs, now, ds);
    } else if (eff.kind === 'threat_temporary') {
      // Fade OOC: self aura only (no hate list out of combat). Cite: HandleAuraModTotalThreat.
      const dur = eff.durationMs > 0 ? eff.durationMs : 0;
      if (dur > 0) char = applyAura(char, auraSpellId, dur, now, ds);
    } else if (
      eff.kind === 'school_immunity'
      || eff.kind === 'damage_immunity'
      || eff.kind === 'mechanic_immunity'
      || eff.kind === 'dispel_immunity'
      || eff.kind === 'pacify'
    ) {
      // Divine Protection / BoP / Vanish Purge / Stoneform poison immunity.
      // Cite: KI-010 / KI-011 / KI-458 / KI-605; SpellAuras HandleAuraModDispelImmunity.
      const dur = eff.durationMs > 0 ? eff.durationMs : 6000;
      char = applyAura(char, auraSpellId, dur, now, ds);
    } else if (eff.kind === 'feather_fall') {
      char = applyAura(char, auraSpellId, eff.durationMs, now, ds);
    } else if (eff.kind === 'hover') {
      char = applyAura(char, auraSpellId, eff.durationMs, now, ds);
      char = { ...char, movementFlags: setHover(char.movementFlags ?? 0, true) };
    } else if (
      eff.kind === 'water_breathing'
      || eff.kind === 'water_walk'
      || eff.kind === 'mod_water_breathing'
      || eff.kind === 'mod_invisibility_detection'
      || eff.kind === 'mod_invisibility'
      || eff.kind === 'track_creatures'
      || eff.kind === 'track_resources'
      || eff.kind === 'safe_fall'
      || eff.kind === 'reflect'
      || eff.kind === 'mod_unattackable'
      || eff.kind === 'interrupt_regen'
      || eff.kind === 'no_pvp_credit'
    ) {
      // Water breathing and walking, invisibility, tracking, reflect and safe fall. The hazard breath
      // suppression, water surface and world invisibility sims are the residual consumers.
      const dur = 'durationMs' in eff && eff.durationMs > 0 ? eff.durationMs : undefined;
      char = applyAura(char, auraSpellId, dur, now, ds);
      log(`You cast ${auraName}.`);
    } else if (
      eff.kind === 'auras_visible'
      || eff.kind === 'bind_sight'
      || eff.kind === 'distract'
      || eff.kind === 'add_farsight'
      || eff.kind === 'aura_dummy_holder'
      || eff.kind === 'aura_dummy'
      || eff.kind === 'mod_possess_pet'
    ) {
      // Detect Magic, Mind Vision, Far Sight and the Soulstone dummy register an aura chip so the cast
      // is not a pure mana sink. A dummy riding another payload is not a self-buff.
      if (
        (eff.kind === 'aura_dummy_holder' || eff.kind === 'aura_dummy')
        && owner.effects.some((e) => e.kind !== 'aura_dummy' && e.kind !== 'aura_dummy_holder')
      ) {
        log(`You cast ${auraName}.`);
        continue;
      }
      const fromEff = 'durationMs' in eff && typeof eff.durationMs === 'number' ? eff.durationMs : 0;
      const fromIdx = owner.durationIndex != null ? durMs(owner.durationIndex) : undefined;
      const dur = fromEff > 0 ? fromEff : (fromIdx != null && fromIdx > 0 ? fromIdx : undefined);
      const untilCancelled = ((owner.durationIndex ?? 0) | 0) === 21 || !!owner.passive;
      if ((dur == null || dur <= 0) && !untilCancelled) {
        log(`You cast ${auraName}.`);
        continue;
      }
      char = applyAura(char, auraSpellId, untilCancelled && !(dur != null && dur > 0) ? undefined : dur, now, ds);
      log(`You cast ${auraName}.`);
    } else if (eff.kind === 'bind_hearth') {
      // SPELL_EFFECT_BIND (11) — SetHomebindToLocation at current position.
      // Same hearthBind field bindHearth writes. Cite: SpellEffects.cpp:5544–5578.
      const tav = ds.tavernTriggers().find((t) => t.zone === char.zoneId);
      const place = ds.zone(char.zoneId)?.name ?? char.zoneId;
      char = {
        ...char,
        hearthBind: {
          zone: char.zoneId,
          name: place,
          ...(tav ? { trigger: tav.id } : {}),
        },
      };
      log(`You are now bound to ${place}.`);
    } else if (eff.kind === 'learn_pet_spell') {
      // SPELL_EFFECT_LEARN_PET_SPELL (57). Cite: SpellEffects.cpp:3386–3404.
      const r = applyLearnPetSpellCast(char, eff.spellId, ds);
      if (r.ok) {
        char = r.char;
        char = applyPetPartyAuras(char, ds, now);
        const rank = r.spell.rank ? ` (Rank ${r.spell.rank})` : '';
        const tp = r.needTp ? ` for ${r.needTp} TP` : '';
        log(`${char.pet?.name ?? 'Pet'} learned ${r.spell.name}${rank}${tp}.`);
      }
    } else if (eff.kind === 'learn_spell') {
      // SPELL_EFFECT_LEARN_SPELL (36). Cite: SpellEffects.cpp:2445–2465.
      if (eff.spellId && !char.knownRecipes?.includes(eff.spellId)) {
        log(`You learn ${ds.spell(eff.spellId)?.name ?? String(eff.spellId)}.`);
      }
    } else if (eff.kind === 'send_taxi') {
      // SPELL_EFFECT_SEND_TAXI (123). Path id is EffectMiscValue.
      // Cite: SpellEffects.cpp:5124–5130 ActivateTaxiPathTo.
      log(`Flight path ${eff.pathId}.`);
    } else if (eff.kind === 'summon_player' || eff.kind === 'client_inform' || eff.kind === 'can_dual_wield') {
      const fromEff = 'durationMs' in eff && typeof eff.durationMs === 'number' ? eff.durationMs : 0;
      const fromIdx = owner.durationIndex != null ? durMs(owner.durationIndex) : undefined;
      const dur = fromEff > 0 ? fromEff : (fromIdx != null && fromIdx > 0 ? fromIdx : undefined);
      char = applyAura(char, auraSpellId, dur, now, ds);
      log(`You cast ${auraName}.`);
    } else if (eff.kind === 'add_honor') {
      // SPELL_EFFECT_ADD_HONOR (45). Cite: SpellEffects.cpp:3026–3035 AddHonorCP.
      if (eff.amount > 0) {
        char = { ...char, honor: addBonusHonor(char.honor ?? newHonorState(), eff.amount) };
        log(`You gain ${eff.amount} honor.`);
      }
    } else if (eff.kind === 'reputation') {
      // SPELL_EFFECT_REPUTATION: Increase Reputation and the AV and AQ reward spells, shared with the
      // bag on-use path. Cite: SpellEffects.cpp:4908-4926.
      char = grantSpellReputation(char, eff.factionId, eff.amount, ds, now, log);
    } else if (eff.kind === 'mod_detect_range') {
      // Mind Soothe / Soothe Animal: negative amount is hostile on enemy — never self-apply
      // OOC (pre-spend gate should already refuse; defense in depth). Cite: KI-711.
      if ((eff.amount ?? 0) < 0) continue;
      const dur = eff.durationMs > 0 ? eff.durationMs : undefined;
      char = applyAura(char, auraSpellId, dur, now, ds);
      log(`You cast ${auraName}.`);
    } else if (eff.kind === 'seal') {
      // Paladin seals OOC pre-pull. Aura chip → buildCombatant startActiveSeal → seedActiveSeal.
      // Cite: paladin-seals.ts; seedOocEffects seedActiveSeal; KI-565; KI-894.
      const fromIdx = durMs(owner.durationIndex);
      const dur = fromIdx != null && fromIdx > 0 ? fromIdx : 1_800_000;
      // One seal at a time — drop other seal auras.
      if (char.activeAuras) {
        char = {
          ...char,
          activeAuras: char.activeAuras.filter((a) => {
            if (a.spellId === auraSpellId) return true;
            const sp = ds.spell(a.spellId);
            if (!sp) return true;
            const r = resolveCombatSpell(sp, { casterLevel: char.level });
            return !r.effects.some((e) => e.kind === 'seal');
          }),
        };
      }
      char = applyAura(char, auraSpellId, dur, now, ds);
      log(`You cast ${auraName}.`);
    } else if (eff.kind === 'mounted') {
      // Summon Warhorse / Felsteed — mount + speed aura. Cite: SpellAuras HandleAuraMounted; KI-657/659.
      const fromIdx = durMs(owner.durationIndex);
      const dur = fromIdx != null && fromIdx > 0 ? fromIdx : undefined;
      char = applyAura(char, auraSpellId, dur, now, ds);
      // Aura chip only. The real mount STATE is `char.mountedItem`, an item entry every consumer keys
      // off, so a class mount with no item cannot be represented yet.
      log(`You mount up (${auraName}).`);
    } else if (eff.kind === 'holy_shock') {
      // OOC Holy Shock on self when damaged — heal branch. Cite: SpellEffects EffectDummy; KI-566.
      const maxHp = maxHealth(char, ds);
      if (char.health < maxHp && eff.heal) {
        const amount = Math.max(0, Math.round(rollBetween(eff.heal.min, eff.heal.max, 0.5)));
        if (amount > 0) {
          char = { ...char, health: Math.min(maxHp, Math.round(char.health + amount)) };
          log(`You cast ${auraName}.`);
        }
      }
    } else if (eff.kind === 'summon_demon' || eff.kind === 'summon_possessed') {
      // Inferno and Eye of Kilrogg are temporary pets: replace only after the new one succeeds, so a
      // missing template cannot dismiss the Imp. Cite: SpellEffects.cpp:4565-4570.
      const creature = (eff as { creature: number }).creature | 0;
      if (creature > 0) {
        const p = newPet(creature, ds, char);
        if (p) {
          if (char.pet) {
            const prevParty = petPartyAuraSpellIds(char, ds);
            if (prevParty.length > 0) char = stripPetPartyAuras(char, ds, prevParty, now);
            char = { ...char, pet: undefined };
            char = reconcilePetPartyAuras(char, ds, now);
          }
          char = { ...char, pet: { ...p, createdBySpell: auraSpellId }, storedPet: undefined };
          char = reconcilePetPartyAuras(char, ds, now);
          log(`You summon ${p.name}.`);
        }
      }
    } else if (eff.kind === 'dispel') {
      // OOC dispel strips matching auras from the caster, a self-cleanse. A hostile Purge is refused
      // before the spend by the target gate. Cite: SpellEffects.cpp EffectDispel.
      const mask = getDispelMask(eff.dispelType | 0);
      const auras = char.activeAuras ?? [];
      if (mask && auras.length) {
        const candidates: DispellableAura[] = [];
        for (const a of auras) {
          const def = ds.spell(a.spellId);
          // SpellDef.dispel = SharedDefines DispelType. Fall back to planted repro fields.
          let dt = (def?.dispel ?? 0) | 0;
          if (!dt) {
            const planted = a as { dispelType?: number | string; dispelMask?: number; dispel?: string };
            if (typeof planted.dispelType === 'number') dt = planted.dispelType;
            else if (typeof planted.dispelMask === 'number' && planted.dispelMask > 0) {
              for (let bit = 1; bit <= 10; bit++) {
                if ((planted.dispelMask & (1 << bit)) !== 0) { dt = bit; break; }
              }
            } else if (typeof planted.dispelType === 'string' || typeof planted.dispel === 'string') {
              const name = String(planted.dispelType ?? planted.dispel).toLowerCase();
              if (name === 'magic') dt = 1;
              else if (name === 'curse') dt = 2;
              else if (name === 'disease') dt = 3;
              else if (name === 'poison') dt = 4;
            }
          }
          if (!dt) continue;
          // The same polarity rule combat uses, and it applies to MAGIC ONLY: an OOC aura has no
          // source faction, so magic is treated as positive and skipped. Others are unconditional.
          if ((dt | 0) === DISPEL_TYPE.MAGIC) continue;
          candidates.push({ spellId: a.spellId, dispelType: dt | 0, stacks: 1 });
        }
        const eligible = collectDispellable(candidates, mask);
        if (eligible.length) {
          const rng = {
            next: () => 0.5,
            int: (min: number, max: number) => Math.min(max, Math.max(min, min)),
          };
          const { success } = processDispelList(eligible, eff.count | 0, rng);
          if (success.length) {
            const removeIds = new Set(success.map((s) => s.spellId));
            const activeAuras = auras.filter((a) => !removeIds.has(a.spellId));
            char = {
              ...char,
              activeAuras,
              activeBuffs: getActiveBuffIds({ ...char, activeAuras }, now, ds),
            };
            log(`You cast ${auraName}.`);
          }
        }
      }
    } else if (eff.kind === 'dispel_mechanic') {
      // SPELL_EFFECT_DISPEL_MECHANIC OOC: strip HasMechanic holders on the caster.
      // Cite: SpellEffects.cpp:2499–2519; SpellAuras.cpp:5786–5794.
      const auras = char.activeAuras ?? [];
      if (auras.length) {
        const rng = {
          next: () => 0.5,
          int: (min: number, max: number) => Math.min(max, Math.max(min, min)),
        };
        const { kept, removed } = peelMechanicAuras(
          auras, eff.mechanic | 0, eff.count | 0, (id) => ds.spell(id), rng,
        );
        if (removed.length) {
          char = {
            ...char,
            activeAuras: kept,
            activeBuffs: getActiveBuffIds({ ...char, activeAuras: kept }, now, ds),
          };
          if ((eff.mechanic | 0) === MECHANIC_MOUNT && char.mountedItem != null) {
            const d = dismount(char);
            if (d.ok) char = d.char;
          }
          log(`You cast ${auraName}.`);
        }
      }
    } else if (eff.kind === 'speed') {
      if (!isHostileTargetBuffOrSnare(eff)) {
        char = applyAura(char, auraSpellId, eff.durationMs, now, ds);
      }
    } else if (eff.kind === 'mod_scale') {
      // SPELL_AURA_MOD_SCALE (61) — Noggenfogger / cosmetic size. Cite: HandleAuraModScale; KI-908.
      const fromEff = eff.durationMs > 0 ? eff.durationMs : 0;
      const fromIdx = durMs(owner.durationIndex);
      const dur = fromEff > 0 ? fromEff : (fromIdx != null && fromIdx > 0 ? fromIdx : undefined);
      char = applyAura(char, auraSpellId, dur, now, ds);
      log(`You cast ${auraName}.`);
    } else if (eff.kind === 'transform') {
      // SPELL_AURA_TRANSFORM (56) — model swap only, the aura carries it. A costume with no
      // duration on the effect falls back to the row DurationIndex, same as mod_scale.
      const fromIdx = durMs(owner.durationIndex);
      const dur = eff.durationMs > 0 ? eff.durationMs : (fromIdx != null && fromIdx > 0 ? fromIdx : undefined);
      char = applyAura(char, auraSpellId, dur, now, ds);
      log(`You cast ${auraName}.`);
    } else if (eff.kind === 'stealth') {
      // MOD_STEALTH - infinite (0) or timed (Vanish).
      const dur = eff.durationMs > 0 ? eff.durationMs : undefined;
      char = applyAura(char, auraSpellId, dur ?? 24 * 60 * 60 * 1000, now, ds);
      if (!(eff.durationMs > 0) && char.activeAuras) {
        char = {
          ...char,
          activeAuras: char.activeAuras.map((a) =>
            a.spellId === auraSpellId ? { ...a, expiresAt: undefined } : a,
          ),
        };
      }
      log(`You enter ${auraName}.`);
    } else if (eff.kind === 'stealth_detect') {
      char = applyAura(char, auraSpellId, eff.durationMs, now, ds);
      log(`You cast ${auraName}.`);
    } else if (eff.kind === 'shapeshift') {
      const targetForm = eff.form;
      if (isStealthShapeshift(targetForm)) {
        if (((char.form ?? 0) | 0) === targetForm && alreadyStealthed) {
          char = { ...char, form: undefined };
        } else if (!alreadyStealthed) {
          char = { ...char, form: targetForm };
        }
        continue;
      }
      if (((char.form ?? 0) | 0) === targetForm) {
        // Re-casting the ACTIVE warrior stance refreshes it — Classic has no unform-by-recast
        // for stances (only druid forms toggle off). Cite: KI-518; forms.isWarriorStance.
        if (isWarriorStance(targetForm)) {
          char = applyAura(char, auraSpellId, undefined, now, ds);
          continue;
        }
        const mana = currentMana(char);
        const prevMax = maxHealth(char, ds);
        char = { ...char, form: undefined, power: mana };
        const nextMax = maxHealth(char, ds);
        if (nextMax < prevMax && char.health != null) {
          char.health = Math.max(1, Math.min(nextMax, char.health - (prevMax - nextMax)));
        }
        delete char.mana;
        if (char.activeAuras) {
          const activeAuras = char.activeAuras.filter((a) => a.spellId !== auraSpellId);
          char = {
            ...char,
            activeAuras,
            activeBuffs: getActiveBuffIds({ ...char, activeAuras }, now, ds),
          };
        }
        log(`You leave ${FORM_LABEL[targetForm] || 'form'}.`);
        // Cancel is the whole cast: Ghost Wolf also carries a speed effect that would
        // re-apply aura 2645 after form drop (phantom buff, no form). Cite: KI-699.
        break;
      } else {
        const prevPt = powerType(char);
        const prevMax = maxHealth(char, ds);
        const manaNow = currentMana(char);
        // Drop the previous form aura — shapeshift is modal. Must use `isFormSpell`, not an effects
        // probe: the live bake leaves form effects empty, so bear, cat and travel all stacked.
        if (char.activeAuras) {
          char = {
            ...char,
            activeAuras: char.activeAuras.filter((a) => {
              const sp = ds.spell(a.spellId);
              return !sp || !isFormSpell(sp);
            }),
          };
        }
        char = { ...char, form: targetForm };
        const nextMax = maxHealth(char, ds);
        if (nextMax > prevMax && char.health != null) {
          char.health = Math.min(nextMax, char.health + (nextMax - prevMax));
        } else if (nextMax < prevMax && char.health != null) {
          char.health = Math.max(1, Math.min(nextMax, char.health - (prevMax - nextMax)));
        }
        const pt = formPowerType(targetForm);
        if (pt === 'mana') {
          char = { ...char, power: manaNow };
          delete char.mana;
        } else {
          if (classHasParallelMana(char.cls)) char = { ...char, mana: manaNow };
          const max = formResourceMax(pt);
          if (formZerosPoolOnEnter(targetForm)) {
            // The same C++ line the in-combat path takes: zero the power on apply, then Furor. This
            // layer has no rng, so the file's fixed shim is used and Furor fires at rank 3 and up.
            const known = input.knownSpellIds;
            const pct = known ? furorChancePctBy((id) => known.includes(id)) : 0;
            const gain = pct > 50
              ? (pt === 'energy' ? FUROR_CAT_ENERGY : FUROR_BEAR_RAGE)
              : 0;
            char = { ...char, power: Math.min(max, gain) };
          } else if (prevPt !== pt) {
            const start = formResourceOnEnter(pt);
            char = { ...char, power: start >= 0 ? start : max };
          } else {
            char = { ...char, power: Math.min(max, char.power) };
          }
        }
        char = applyAura(char, auraSpellId, undefined, now, ds);
        log(`You enter ${FORM_LABEL[targetForm] || auraName}.`);
      }
    } else if (eff.kind === 'weapon_imbue') {
      // The hand is pre-resolved in castOutOfCombat, empty-first from main to off. Never default to
      // main hand here — that skipped the off hand and trusted shield slots.
      const hand = input.weaponImbueHand === 'offhand' ? 'offhand' as const : 'mainhand' as const;
      char = applyTempEnchant(char, hand, {
        spellId: auraSpellId,
        enchantId: eff.enchantId,
        expiresAt: now + eff.durationMs,
        family: eff.family,
        attackPower: eff.attackPower,
        equipSpellId: eff.equipSpellId,
        combatSpellId: eff.combatSpellId,
        combatChancePct: eff.combatChancePct,
        combatPpm: eff.combatPpm,
        damageFlat: eff.damageFlat,
        rockbiterAmount: eff.rockbiterAmount,
        combat: eff.combat,
      }, now, ds);
      log(hand === 'offhand'
        ? `You imbue your off-hand with ${auraName}.`
        : `You imbue your weapon with ${auraName}.`);
    } else if (eff.kind === 'damage_shield' || eff.kind === 'proc_trigger_spell') {
      // A hostile channel that stamps a proc on the enemy aura must not self-apply when mixed with
      // enemy-only effects at positive range. Hellfire is range 0 and still applies.
      if (
        eff.kind === 'proc_trigger_spell'
        && ((owner.rangeMax ?? 0) > 0)
        && owner.effects.some((e) => e.kind === 'dot' || e.kind === 'direct_damage'
          || e.kind === 'health_leech' || e.kind === 'cc' || e.kind === 'root')
      ) {
        continue;
      }
      const charges = (eff.charges ?? owner.procCharges ?? 0) > 0
        ? (eff.charges ?? owner.procCharges!)
        : undefined;
      const dur = eff.durationMs > 0 ? eff.durationMs : 600_000;
      char = applyAura(char, auraSpellId, dur, now, ds, charges != null ? { charges } : undefined);
      log(isHunterTrapCast(owner) || isHunterTrapArmProc(eff)
        ? `You place ${auraName}.`
        : `You gain ${auraName}.`);
    } else if (eff.kind === 'conjure') {
      const def = ds.item(eff.item);
      // num_to_add = irand(baseDice, dieSides) + bp, then clamped to the item's stack.
      // Cite: SpellEffects.cpp:1971-1978.
      const stack = def?.stackable ?? 1;
      const lo = Math.max(1, eff.count | 0);
      const hi = Math.max(lo, (eff.countMax ?? lo) | 0);
      const count = Math.min(stack, hi > lo && input.rng ? input.rng.int(lo, hi) : lo);
      inventory = addItem(inventory, eff.item, count, stack);
      conjured.push({ item: eff.item, count });
    } else if (eff.kind === 'demonic_sacrifice') {
      // Demonic Sacrifice 18788: INSTAKILL pet + CastSpell result by entry.
      // Cite: Warlock.cpp:214–234; spell_template 18789–18792; KI-833.
      const pet = char.pet;
      if (pet && (pet.health ?? 0) > 0) {
        const b = eff.byPet[pet.creature | 0];
        const isPctRegen =
          b
          && (b.restore === 'health' || b.restore === 'power')
          && (b.pctOfMax ?? 0) > 0
          && (b.tickMs ?? 0) > 0;
        const isDamageBuff = b && b.mod != null && b.amount != null;
        if (b && (isPctRegen || isDamageBuff) && (b.resultSpellId | 0) > 0) {
          const prevParty = petPartyAuraSpellIds(char, ds);
          if (prevParty.length > 0) char = stripPetPartyAuras(char, ds, prevParty, now);
          // Drop any prior sacrifice result auras (override script 2228 family).
          if (char.activeAuras?.length) {
            const nextAuras = char.activeAuras.filter(
              (a) => !DEMONIC_SACRIFICE_RESULT_SPELL_ID_SET.has(a.spellId | 0),
            );
            char = {
              ...char,
              activeAuras: nextAuras,
              activeBuffs: getActiveBuffIds({ ...char, activeAuras: nextAuras }, now, ds),
            };
          }
          char = { ...char, pet: undefined };
          char = reconcilePetPartyAuras(char, ds, now);
          const dur = b.durationMs > 0 ? b.durationMs : 1_800_000;
          char = applyAura(char, b.resultSpellId | 0, dur, now, ds);
          log(`You sacrifice ${pet.name}.`);
        }
      }
    } else if (eff.kind === 'summon_pet') {
      if (eff.creature > 0) {
        // Build the new unit first and only then replace the living pet, so a missing template cannot
        // leave the caster petless. Cite: SpellEffects.cpp EffectSummonPet ~3257-3268.
        let p = newPet(eff.creature, ds, char);
        if (p) {
          // Demon swap (Imp→VW etc.): strip previous pet's APPLY_AREA_AURA_PARTY before replacing. Capture
          // kit ids while the old pet is still living. Cite: SpellAuras.cpp AreaAura non-caster; KI-555.
          if (char.pet) {
            const prevParty = petPartyAuraSpellIds(char, ds);
            if (prevParty.length > 0) {
              char = stripPetPartyAuras(char, ds, prevParty, now);
            }
            char = { ...char, pet: undefined };
            char = reconcilePetPartyAuras(char, ds, now);
          }
          // Warlock re-summon cancels Demonic Sacrifice (GetOverrideScript 2228).
          // Cite: SpellEffects.cpp:3254–3255; spell_template 18789–18792 aura 112 misc 2228.
          if (char.activeAuras?.some((a) => DEMONIC_SACRIFICE_RESULT_SPELL_ID_SET.has(a.spellId | 0))) {
            const nextAuras = (char.activeAuras ?? []).filter(
              (a) => !DEMONIC_SACRIFICE_RESULT_SPELL_ID_SET.has(a.spellId | 0),
            );
            char = {
              ...char,
              activeAuras: nextAuras,
              activeBuffs: getActiveBuffIds({ ...char, activeAuras: nextAuras }, now, ds),
            };
          }
          const stored = char.storedPet;
          if (stored && stored.creature === eff.creature && stored.autocastOff?.length) {
            p = { ...p, autocastOff: [...stored.autocastOff] };
          }
          // UNIT_CREATED_BY_SPELL: the reagent this cost comes back when the owner's death unsummons
          // the pet. Cite: Pet.cpp:1020, 1029-1045.
          char = { ...char, pet: { ...p, createdBySpell: auraSpellId }, storedPet: undefined };
          // Imp Blood Pact (and similar APPLY_AREA_AURA_PARTY) while pet is out.
          // Cite: SpellAuras.cpp AreaAura AREA_AURA_PARTY; KI-066 / KI-555.
          char = reconcilePetPartyAuras(char, ds, now);
        }
      } else if (char.pet) {
        // Call Pet with a living pet already out must not free a full heal: the pre-spend gate refuses
        // it as already-have-summon and the effect is a no-op. Cite: Spell.cpp CheckCast ~5563-5571.
      } else if (char.storedPet) {
        // Hunter Call Pet restores a dismissed beast. Activate first so the pet's max health folds in
        // its taught passives; the full heal on call is this port's own convenience.
        char = { ...char, pet: { ...char.storedPet }, storedPet: undefined };
        const maxHp = petMaxHealth(char, ds);
        char = { ...char, pet: { ...char.pet!, health: maxHp } };
        char = reconcilePetPartyAuras(char, ds, now);
      }
      // No pet + no storedPet: pre-spend gate returns SPELL_FAILED_NO_PET (KI-553).
    } else if (eff.kind === 'revive_pet') {
      if (!char.pet && char.storedPet) {
        char = { ...char, pet: char.storedPet, storedPet: undefined };
      }
      if (char.pet) {
        const pet = char.pet;
        const health = Math.max(1, Math.round((petMaxHealth(char, ds) * eff.healthPct) / 100));
        // SetDeathState(ALIVE) + SetHealth(max * damage/100). Cite: SpellEffects.cpp:5194–5196.
        char = { ...char, pet: { ...pet, health, dead: false } };
        char = reconcilePetPartyAuras(char, ds, now);
        log(`${pet.name} returns to life.`);
      }
    } else if (eff.kind === 'heal') {
      const amount = Math.max(0, Math.round(rollBetween(eff.min, eff.max, 0.5)));
      if (amount > 0) {
        if (s.role === 'pet_heal' && char.pet) {
          const maxHp = petMaxHealth(char, ds);
          char = {
            ...char,
            pet: {
              ...char.pet,
              health: Math.min(maxHp, Math.round(char.pet.health + amount)),
            },
          };
        } else {
          const maxHp = maxHealth(char, ds);
          char = {
            ...char,
            health: Math.min(maxHp, Math.round(char.health + amount)),
          };
        }
      }
    } else if (eff.kind === 'heal_max_health') {
      // Lay on Hands: heal = caster max health AND drain all remaining mana (tooltip).
      // Cite: SpellEffects.cpp EffectHealMaxHealth; spell 633 description; KI-656.
      const casterMax = maxHealth(char, ds);
      const { healAmount } = resolveHealMaxHealth({ casterMaxHealth: casterMax });
      if (healAmount > 0) {
        char = {
          ...char,
          health: Math.min(casterMax, Math.round(char.health + healAmount)),
        };
      }
      if (powerType(char) === 'mana' && char.power > 0) {
        char = { ...char, power: 0 };
      } else if ((char.mana ?? 0) > 0) {
        char = { ...char, mana: 0 };
      }
    } else if (eff.kind === 'restore_health' || eff.kind === 'restore_power') {
      // Hostile mana/health leech (negative per-tick) needs an enemy — never self-apply OOC.
      // Cite: KI-660 Drain Mana; oocCast isEnemyTargetOnlyEffect restore_power.
      if (eff.kind === 'restore_power' && (eff.hostile === true || eff.amountPerTick < 0)) continue;
      const dur = eff.durationMs > 0 ? eff.durationMs : 0;
      if (dur > 0) {
        char = applyAura(char, auraSpellId, dur, now, ds);
      }
    } else if (eff.kind === 'school_absorb' || eff.kind === 'mana_shield') {
      const dur = eff.durationMs > 0 ? eff.durationMs : 0;
      if (dur > 0) {
        char = applyAura(char, auraSpellId, dur, now, ds);
      }
    } else if (eff.kind === 'cleanse') {
      if (eff.immuneMs && eff.immuneMs > 0) {
        char = applyAura(char, auraSpellId, eff.immuneMs, now, ds);
      }
    } else if (eff.kind === 'next_cast_mod') {
      // Presence of Mind and its family stick their self-aura out of combat so pre-pull arming is not
      // a pure cooldown burn. Duration 0 means until consumed, and charges come off the spell.
      const dur = eff.durationMs > 0 ? eff.durationMs : 600_000;
      const charges = ((owner.procCharges ?? 0) > 0) ? owner.procCharges! : 1;
      char = applyAura(char, auraSpellId, dur, now, ds, { charges });
    } else if (eff.kind === 'combustion') {
      // Pre-pop before a pull: the charges ride the active auras into the combatant build.
      // Cite: UnitAuraProcHandler.cpp:991-1003; oocCastEffects sweeping_strikes.
      const dur = eff.durationMs > 0 ? eff.durationMs : 600_000;
      char = applyAura(char, auraSpellId, dur, now, ds, { charges: eff.charges });
    } else if (eff.kind === 'sweeping_strikes') {
      // Arms the next-five-swings cleave out of combat for a pre-pull Battle Stance. Charges ride the
      // active auras into the combatant build. Cite: UnitAuraProcHandler.cpp:810-841.
      const dur = eff.durationMs > 0 ? eff.durationMs : 20_000;
      const charges = eff.charges > 0 ? eff.charges : 5;
      char = applyAura(char, auraSpellId, dur, now, ds, { charges });
    } else if (eff.kind === 'vampiric_embrace') {
      // Self shadow-leech aura — same OOC stick path as next_cast_mod.
      // Cite: UnitAuraProcHandler.cpp:1015–1028; talent-scripted 15286.
      const dur = eff.durationMs > 0 ? eff.durationMs : 60_000;
      char = applyAura(char, auraSpellId, dur, now, ds);
    } else if (eff.kind === 'resist') {
      // MOD_RESISTANCE self aura — Mage Armor is six resist rows and no armor buff. The bake omits the
      // duration on resist rows, so it comes off the owning spell's own index.
      if ((eff.amount ?? 0) > 0) {
        const fromIdx = durMs(owner.durationIndex);
        const dur = fromIdx != null && fromIdx > 0 ? fromIdx : 0;
        char = applyAura(char, auraSpellId, dur > 0 ? dur : undefined, now, ds);
      }
    } else if (eff.kind === 'force_reaction') {
      // FORCE_REACTION (the ogre suit) sticks as an aura so both the condition check and the forced
      // reactions read it. Duration 0 is permanent for the run. Cite: SpellAuras.cpp:2034-2053.
      const fromEff = typeof eff.durationMs === 'number' && eff.durationMs > 0 ? eff.durationMs : 0;
      const fromIdx = durMs(owner.durationIndex);
      const dur = fromEff > 0 ? fromEff : (fromIdx != null && fromIdx > 0 ? fromIdx : undefined);
      char = applyAura(char, auraSpellId, dur, now, ds);
      log(`You gain ${auraName}.`);
    } else if (eff.kind === 'durability_damage') {
      // Cite: SpellEffects.cpp:5236–5260 EffectDurabilityDamagePCT → DurabilityLoss.
      char = applyDurabilityDamageFromSpell(char, { ...owner, effects: [eff] }, ds.item);
    } else if (eff.kind === 'inebriate') {
      // Alcohol: drunkMod from resolveCombatSpell. Cite: EffectInebriate; KI-734.
      const mod = Number((eff as { drunkMod?: number }).drunkMod) || 0;
      if (mod > 0) {
        char = { ...char, drunkValue: applyInebriate(char.drunkValue, mod) };
        log(`You feel tipsy.`);
      }
    } else if (eff.kind === 'life_tap') {
      // Cite: Warlock.cpp LifeTap; applySpell.ts; KI-043; oocCast.ts.
      char = applyOocLifeTap(char, eff, ds);
    } else if (isOocSiAuraKind(eff.kind) && 'durationMs' in eff && typeof eff.durationMs === 'number') {
      // Blessing of Light, Concentration and Blessing of Sanctuary stick their aura out of combat. A
      // key test is not enough: several kinds declare the duration optional, so it can be undefined.
      char = applyOocSiAura(char, auraSpellId, eff.durationMs, now, ds);
    }
  }

  return { char, inventory, conjured };
}

/** Armed next_cast_mod on `char` that this resolved cast would consume. Last match wins. */
export function findArmedNextCastMod(
  char: Character,
  consuming: SpellDef,
  ds: DataStore,
): PendingSpellMod | null {
  let best: PendingSpellMod | null = null;
  for (const a of pruneExpiredAuras(char.activeAuras)) {
    const raw = ds.spell(a.spellId);
    if (!raw) continue;
    const sp = resolveCombatSpell(raw, { casterLevel: char.level });
    const mod = pendingSpellModFromResolved(sp);
    if (!mod) continue;
    if (!nextCastModApplies(mod, consuming)) continue;
    best = mod;
  }
  return best;
}

/** Drop a consumed next-cast aura from the world sheet. */
export function dropNextCastAura(
  char: Character,
  spellId: number,
  ds: DataStore,
  now: number,
): Character {
  const activeAuras = pruneExpiredAuras(char.activeAuras, now).filter((a) => a.spellId !== spellId);
  return {
    ...char,
    activeAuras,
    activeBuffs: getActiveBuffIds({ ...char, activeAuras }, now, ds),
  };
}
