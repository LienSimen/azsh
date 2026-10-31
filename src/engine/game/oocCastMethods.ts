// OOC cast methods (spellCooldownRemaining / castOutOfCombat / cannibalize). Predicates stay in oocCast.ts.
// Pattern C: createOocCastMethodsModule(ctx, extras). No import of game.ts.

import { mulberry32, hashSeed } from '../core/rng.ts';
import { applyResetCooldownsWorld } from '../spells/recovery.ts';
import { resolveCombatSpell } from '../spells/interpreter/index.ts';
import { SPELL_ATTR_EX, hasAttrEx } from '../spells/spellAttributes.ts';
import '../spells/oocTriggerSpell.ts';
import { passesTargetCreatureType } from '../spells/immunity.ts';
import { applyOocCastEffects, dropNextCastAura, findArmedNextCastMod } from './oocCastEffects.ts';
import { createHealthstoneInterpretCtx, createHealthstoneBlockedReason } from './createHealthstone.ts';
import {
  maxHealth,
  maxPower,
  powerType,
  combatantCreatureType,
  pruneExpiredAuras,
  createMana,
  createHealth,
  currentMana,
  clampResourcePools,
  getActiveBuffIds,
} from '../../domain/character/character.ts';
import {
  isNonCombatSpell, lifeTapOocFailReason, oocSpellRequiresEnemyTarget,
  oocSummoningRitualFailReason, oocTotemSummonFailReason, oocPetCallReviveFailReason,
  playerCombatFlagSet,
} from './oocCast.ts';
import {
  isFormSpell, isStealthShapeshift, formSpeedBoostSpellIds, MOBILITY_FORM_SPELL_IDS,
  resolveFormCast, resolveSpellCost, FORM_LABEL,
} from '../../domain/character/forms.ts';
import { AURA_INTERRUPT, isStealthSpell } from '../../domain/spells/stealth.ts';
import { castIsAnAction, removeCharAurasWithInterruptFlags } from './oocAuraInterrupt.ts';
import { hasAttr, SPELL_ATTR, SPELL_ATTR_EX2, hasAttrEx2 } from '../spells/spellAttributes.ts';
import {
  auraCancelRefusal, CANCEL_AURA_REFUSAL_TEXT, type AuraCancelState,
} from '../../domain/spells/cancelAura.ts';
import { isPartyAreaAura } from '../../domain/spells/areaAuraMembership.ts';
import { resolveChainPair } from '../spells/auraStacking.ts';
import { newPet, applyPetHappinessPowerDrains } from '../../domain/pet/pet.ts';
import { resolveTempWeaponImbueHand } from '../../domain/professions/weaponImbueHand.ts';
import type { LootDrop } from '../../domain/items/loot.ts';
import { knows } from '../../domain/character/spellbook.ts';
import {
  recordSpellCast, recordCastedCreatureOrGO,
} from '../../domain/quests/questlog.ts';
import { creditQuestCompleteFromSpell } from './questSpellComplete.ts';
import { applySendEventFromSpell, type ApplySendEventFromSpellResult } from './sendEventFromSpell.ts';
import { runSpellScripts } from './applyDeathAndSpellScripts.ts';
import { deliverScriptMail } from './mail.ts';
import { applyActivateObjectFromSpell } from './activateObjectFromSpell.ts';
import { applyOpenLockFromSpell } from './openLockFromSpell.ts';
import {
  LOCKTYPE_PICKLOCK,
  picklockSkillReq,
  tryLockpickingSkillUp,
  type LockDef,
} from '../../domain/world/openLock.ts';
import {
  collectSummonObjectWildFromSpell,
  mergeWildSummoned,
} from './summonObjectWild.ts';
import {
  collectSummonObjectSlotFromSpell,
  placeSummonObjectSlot,
} from './summonObjectSlot.ts';
import { applyOocResurrectEffect, applyOocSelfResurrectEffect } from './applyOocResurrect.ts';
import { CREATURE_TYPE } from '../../data/schema.ts';
import { removeItem, countItem } from '../../domain/items/inventory.ts';
import { refuseIfDead, refuseIfInCombat } from '../../domain/run/death.ts';
import {
  ITEM_SUBCLASS_WEAPON_FISHING_POLE,
  ensureFishingPoleEquipped,
} from '../../domain/professions/professions.ts';
import { firstFeedableFoodEntry } from './pets.ts';
import { isPoisonConjureName, isPoisonCraftRecipe, POISONS_SKILL_SPELL } from '../../domain/professions/poisons.ts';
import type { CombatSession } from '../combat/session-types.ts';
import type { Game } from './types.ts';
import type { GameCtx } from './context.ts';
import type { QuestLog } from '../../domain/quests/questlog.ts';
import type { DataStore } from '../../data/dataStore.ts';

export type OocCastMethodsExtras = {
  journeyTick: (nowMs: number) => void;
  castTeleport: Game['castTeleport'];
  pickPocket: Game['pickPocket'];
  skin: Game['skin'];
  disenchant: Game['disenchant'];
  feedPet: Game['feedPet'];
  garmentsAfterCast: (
    spellId: number,
    targetCreature: number | undefined,
    questlog: QuestLog,
    ds: DataStore,
    log: (msg: string) => void,
  ) => QuestLog;
  applySendEventTempSpawns: (fired: ApplySendEventFromSpellResult['fired']) => void;
  /** Open combat/floor session, when one owns the player's live auras and vitals. */
  liveSession: () => CombatSession | null;
};

export function createOocCastMethodsModule(
  ctx: GameCtx,
  extras: OocCastMethodsExtras,
): Pick<
  Game,
  'spellCooldownRemaining' | 'castOutOfCombat' | 'cannibalize' | 'cancelAura' | 'canCancelAuraNow'
> {
  const { ds, state, log, refreshQuests, cap } = ctx;
  const {
    journeyTick,
    castTeleport,
    pickPocket,
    skin,
    disenchant,
    feedPet,
    garmentsAfterCast,
    applySendEventTempSpawns,
    liveSession,
  } = extras;

  /** spellId → expiresAt (-1 = until cancelled) for every aura on the sheet right now. */
  const auraStamp = (): Map<number, number> => {
    const m = new Map<number, number>();
    for (const a of state.char.activeAuras ?? []) m.set(a.spellId, a.expiresAt ?? -1);
    return m;
  };

  // A dungeon keeps ONE endless session open, and while it is open THAT session owns the player's live
  // auras — so mirror whatever the cast LANDED onto the live unit, replaying the aura's own spell.
  const mirrorNewAurasToLiveUnit = (before: Map<number, number>): void => {
    const live = liveSession();
    if (!live || typeof live.applySpellToUnit !== 'function') return;
    for (const a of state.char.activeAuras ?? []) {
      const prev = before.get(a.spellId);
      if (prev !== undefined && prev === (a.expiresAt ?? -1)) continue;
      const raw = ds.spell(a.spellId);
      if (!raw) continue;
      live.applySpellToUnit('player', resolveCombatSpell(raw, { casterLevel: state.char.level }));
    }
  };

  // Sheet stand-in for "the holder's caster is the player": only a party area aura the PLAYER
  // knows is own. A pet's Blood Pact and a totem's kit auras have another guid.
  const playerIsAreaAuraCaster = (auraId: number): boolean => {
    const chainOf = (id: number) => ds.spellChain(id);
    for (const id of state.spellbook?.known ?? []) {
      const sp = ds.spell(id);
      if (!isPartyAreaAura(sp)) continue;
      if (id === auraId) return true;
      if (resolveChainPair(id, auraId, chainOf)) return true;
    }
    return false;
  };

  /** The gate's state half, resolved from the session when one owns the auras, else the sheet. */
  const cancelStateFor = (id: number, live: CombatSession | null): AuraCancelState =>
    live?.auraCancelState?.(id) ?? { possessed: false, ownAura: playerIsAreaAuraCaster(id) };

  /** SpellEffects.cpp:1529–1531 / :4189–4191 ScriptsStart(SCRIPT_TYPE_SPELL) on finish. */
  const applySpellDbScripts = (
    spellId: number,
    castOpts?: { targetCreature?: number; targetGoEntry?: number },
  ): void => {
    const rows = ds.spellScripts(spellId);
    if (!rows.length) return;
    const target = castOpts?.targetCreature
      ? { kind: 'creature' as const, entry: castOpts.targetCreature, alive: true }
      : castOpts?.targetGoEntry
        ? { kind: 'gameobject' as const, entry: castOpts.targetGoEntry, spawned: true }
        : null;
    const applied = runSpellScripts(spellId, rows, {
      questlog: state.questlog,
      inventory: state.inventory,
      itemOf: (e) => ds.item(e),
      bagCap: cap(),
      goRuntime: state.goRuntime,
      goRuntimeKey: (e) => `${state.char.zoneId}:${e}`,
      worldStates: state.worldStates,
      relayScripts: (id) => ds.relayScripts(id),
      questOf: (e) => ds.quest(e),
      log,
      source: { kind: 'player' },
      target,
      onMail: (rec) => deliverScriptMail(ctx, rec, Date.now(), 'Mailbox'),
    });
    state.questlog = applied.questlog;
    if (applied.inventory) state.inventory = applied.inventory;
    if (applied.goRuntime) state.goRuntime = applied.goRuntime;
    if (applied.worldStates) state.worldStates = applied.worldStates;
  };

  return {
    spellCooldownRemaining(spellId: number) {
      const s = ds.spell(spellId);
      if (!s) return 0;
      const own = Math.max(0, (state.spellCooldowns?.[spellId] ?? 0) - Date.now());
      let cat = 0;
      if (s.category != null) cat = Math.max(0, (state.categoryCooldowns?.[s.category] ?? 0) - Date.now());
      return Math.max(own, cat);
    },

    castOutOfCombat(spellId, opts) {
      const rawSpell = ds.spell(spellId);
      if (!rawSpell) { log(`Failed to cast ${spellId}: Unknown spell`); return { ok: false, reason: 'Unknown spell' }; }
      // Dead cannot cast (buffs/OOC utility). Cite: Spell.cpp CheckCast SPELL_FAILED_CASTER_DEAD
      // (m_caster !IsAlive → fail unless ALLOW_CAST_WHILE_DEAD); refuseIfDead (KI-936).
      if (!hasAttr(rawSpell, SPELL_ATTR.ALLOW_CAST_WHILE_DEAD) && !hasAttr(rawSpell, SPELL_ATTR.PASSIVE)) {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      // Refuse a non-combat spell while the caster's flag is hot: the bar greys these already, this
      // path did not, and Shadowmeld landed mid-fight. Cite: Spell.cpp:4598 IsNonCombatSpell.
      if (isNonCombatSpell(rawSpell)) {
        const busy = refuseIfInCombat(playerCombatFlagSet(liveSession()));
        if (busy) { log(`Failed to cast ${rawSpell.name}: ${busy.reason}`); return busy; }
      }
      // SI5 OOC resolve (+ Create Healthstone Improved rank / TOO_MANY — Warlock.cpp).
      // Berserking haste_mod needs health % (SpellEffects.cpp:1270–1275; KI-125).
      const maxHpOoc = maxHealth(state.char, ds);
      const s = resolveCombatSpell(rawSpell, {
        casterLevel: state.char.level,
        casterHealthPercent: maxHpOoc > 0 ? (state.char.health / maxHpOoc) * 100 : 100,
        casterMaxHealth: maxHpOoc,
        ...createHealthstoneInterpretCtx(spellId, state.char, ds),
      });
      if (!knows(state.spellbook, spellId)) { log(`Failed to cast ${s.name}: Not learned`); return { ok: false, reason: 'Not learned' }; }
      if (
        spellId === POISONS_SKILL_SPELL
        || isPoisonCraftRecipe(ds.recipe(spellId))
        || (s.effects.some((e) => e.kind === 'conjure') && isPoisonConjureName(s.name))
      ) {
        log(`Failed to cast ${s.name}: Craft that from the profession tab`);
        return { ok: false, reason: 'Craft that from the profession tab' };
      }
      { const hsBlock = createHealthstoneBlockedReason(spellId, s.effects, state.inventory); if (hsBlock) { log(`Failed to cast ${s.name}: ${hsBlock}`); return { ok: false, reason: hsBlock }; } }

      // Fishing 7620/7731/7732/18248: EquippedItemClass weapon + subclass bit 20.
      // Cite: Spell.cpp TotemCategory / EquippedItem*; ItemPrototype.h subclass 20.
      const poleMask = 1 << ITEM_SUBCLASS_WEAPON_FISHING_POLE;
      if (
        rawSpell.equippedItemClass === 2
        && ((rawSpell.equippedItemSubClassMask ?? 0) & poleMask) === poleMask
      ) {
        const worn = ensureFishingPoleEquipped(state.char, state.inventory, ds);
        if (!worn.ok) {
          log(`Failed to cast ${s.name}: Requires a Fishing Pole`);
          return { ok: false, reason: 'Requires a Fishing Pole' };
        }
        state.char = worn.char;
        state.inventory = worn.inventory;
      }

      // Form / stance gate (same product rules as combat: NOT_SHAPESHIFT leaves form first).
      const form = (state.char.form ?? 0) | 0;
      const gate = resolveFormCast(s, form);
      if (!gate.ok) {
        log(`Failed to cast ${s.name}: ${gate.reason}`);
        return { ok: false, reason: gate.reason };
      }
      if (gate.leaveForm && form) {
        // Drop form → mana as active power. Strip the form chip too (KI-699 phantom Ghost Wolf).
        const mana = currentMana(state.char);
        state.char.form = undefined;
        state.char.power = mana;
        delete state.char.mana;
        if (state.char.activeAuras) {
          const drop = new Set<number>([...MOBILITY_FORM_SPELL_IDS, ...formSpeedBoostSpellIds(form)]);
          const activeAuras = state.char.activeAuras.filter((a) => {
            if (drop.has(a.spellId)) return false;
            const sp = ds.spell(a.spellId);
            return !sp || !isFormSpell(sp);
          });
          state.char.activeAuras = activeAuras;
          state.char.activeBuffs = getActiveBuffIds({ ...state.char, activeAuras }, Date.now(), ds);
        }
        log(`You leave ${FORM_LABEL[form] || 'form'}.`);
      }

      // Hostile damage, debuffs and CC need an enemy target, which OOC has none of, so fail before the
      // spend. Dismiss, feed, possess and learn are self-utility; taming uses its target creature.
      const isDismissPet = s.effects.some((e) => e.kind === 'dismiss_pet');
      const isFeedPet = s.effects.some((e) => e.kind === 'feed_pet');
      const isPossessPet = s.effects.some((e) => e.kind === 'mod_possess_pet');
      const isLearnPetSpell = s.effects.some((e) => e.kind === 'learn_pet_spell');
      const isPetTame = s.role === 'pet_tame';
      if (!isDismissPet && !isFeedPet && !isPossessPet && !isLearnPetSpell && !isPetTame && oocSpellRequiresEnemyTarget(s)) {
        log(`Failed to cast ${s.name}: No target`);
        return { ok: false, reason: 'No target' };
      }

      // A corpse racial reads its target creature type off the last corpse. Eyes of the Beast has a
      // Beast mask on a LIVING pet, not a corpse, so possess is excluded. Cite: Spell.cpp.
      const corpseTypeMask = ((s.targetCreatureTypeMask ?? 0) | 0) > 0
        && !oocSpellRequiresEnemyTarget(s)
        && s.role !== 'pet_tame'
        && !isPossessPet
        ? ((s.targetCreatureTypeMask ?? 0) | 0)
        : 0;
      if (corpseTypeMask) {
        const type = state.lastCorpse?.creatureType;
        // type 0 is not edible (passesTargetCreatureType early-allows 0 for unit targets).
        if (type == null || type === 0 || !passesTargetCreatureType(corpseTypeMask, type)) {
          log(`Failed to cast ${s.name}: No edible corpse nearby`);
          return { ok: false, reason: 'No edible corpse nearby' };
        }
      }

      // role pet_heal (Mend Pet / Health Funnel): need a living pet; fail before spend.
      // Cite: combat.ts healTarget when roleOf === 'pet_heal'; KI-105 / KI-130.
      if (s.role === 'pet_heal') {
        if (!state.char.pet) {
          log(`Failed to cast ${s.name}: You have no pet`);
          return { ok: false, reason: 'You have no pet' };
        }
        if (state.char.pet.health <= 0) {
          log(`Failed to cast ${s.name}: Your pet is dead`);
          return { ok: false, reason: 'Your pet is dead' };
        }
      }

      // SPELL_AURA_MOD_POSSESS_PET (128): CheckCast requires GetPet() not charmed.
      // Cite: Spell.cpp:5717–5735; SpellAuras.cpp HandleModPossessPet; KI-729.
      if (isPossessPet) {
        if (!state.char.pet) {
          log(`Failed to cast ${s.name}: You have no pet`);
          return { ok: false, reason: 'You have no pet' };
        }
        if (state.char.pet.health <= 0) {
          log(`Failed to cast ${s.name}: Your pet is dead`);
          return { ok: false, reason: 'Your pet is dead' };
        }
      }

      // SPELL_EFFECT_LEARN_PET_SPELL (57): refuse no/dead pet before spend.
      // Cite: Spell.cpp:5308–5313 CheckCast SPELL_FAILED_NO_PET; SpellEffects.cpp:3393–3397.
      if (isLearnPetSpell) {
        if (!state.char.pet) {
          log(`Failed to cast ${s.name}: You have no pet`);
          return { ok: false, reason: 'You have no pet' };
        }
        if (state.char.pet.health <= 0) {
          log(`Failed to cast ${s.name}: Your pet is dead`);
          return { ok: false, reason: 'Your pet is dead' };
        }
      }

      // FEED_PET needs a living happiness pet and diet food, consuming the item for a 20 s course. The
      // pre-spend gates mirror the resolver and CheckCast. Cite: SpellEffects.cpp:4681-4712.
      if (isFeedPet) {
        if (!state.char.pet) {
          log(`Failed to cast ${s.name}: You have no pet`);
          return { ok: false, reason: 'You have no pet' };
        }
        if (state.char.pet.health <= 0) {
          log(`Failed to cast ${s.name}: Your pet is dead`);
          return { ok: false, reason: 'Your pet is dead' };
        }
        const foodEntry = (opts?.itemEntry != null && opts.itemEntry > 0)
          ? opts.itemEntry
          : firstFeedableFoodEntry(ctx);
        if (foodEntry == null) {
          log(`Failed to cast ${s.name}: You need pet food`);
          return { ok: false, reason: 'You need pet food' };
        }
        // Same path as feedPet() API — consume 1 food, start feedRemaining course.
        const fed = feedPet(foodEntry);
        if (!fed.ok) {
          log(`Failed to cast ${s.name}: ${fed.reason ?? 'Cannot feed pet'}`);
          return { ok: false, reason: fed.reason ?? 'Cannot feed pet' };
        }
        state.questlog = creditQuestCompleteFromSpell(
          recordSpellCast(state.questlog, spellId, (e) => ds.quest(e)),
          ds.spell(spellId),
        );
        refreshQuests();
        {
          const now = Date.now();
          const personal = (s.cooldownMs ?? 0) | 0;
          const catMs = (s.category != null && s.category !== 0)
            ? ((s.categoryRecoveryMs != null && s.categoryRecoveryMs > 0)
              ? s.categoryRecoveryMs
              : personal)
            : 0;
          if (personal > 0) {
            if (!state.spellCooldowns) state.spellCooldowns = {};
            state.spellCooldowns[spellId] = now + personal;
          }
          if (s.category != null && catMs > 0) {
            if (!state.categoryCooldowns) state.categoryCooldowns = {};
            state.categoryCooldowns[s.category] = now + catMs;
          }
        }
        log(`You cast ${s.name}.`);
        return { ok: true, conjured: [] };
      }

      // A party battle rez needs a dead friendly, and single-player has no party corpse model — refuse
      // before the spend unless self is dead. Reincarnation is separate and always self.
      if (s.effects.some((e) => e.kind === 'resurrect' || e.kind === 'resurrect_pct')) {
        const forceSelf = opts?.reviveTarget === 'self';
        const flow = state.deathFlow;
        const selfDead = !!flow
          && flow.deathState !== 'ALIVE'
          && flow.deathState !== 'JUST_ALIVED';
        if (!forceSelf && !selfDead) {
          log(`Failed to cast ${s.name}: No target`);
          return { ok: false, reason: 'No target' };
        }
      }

      // A summoning ritual needs party clicks after the cast, which solo has no channel for, so refuse
      // before the mana and shard are spent. Cite: SpellEffects.cpp EffectTransmitted.
      {
        const ritualFail = oocSummoningRitualFailReason(s.effects, (entry) => ds.gameObject(entry));
        if (ritualFail) {
          log(`Failed to cast ${s.name}: ${ritualFail}`);
          return { ok: false, reason: ritualFail };
        }
      }

      // Totems are fight-scoped only — no OOC totem entity on char/world. Refuse before
      // mana so castOutOfCombat is not a pure sink (KI-817). Cite: oocCast.oocTotemSummonFailReason.
      {
        const totemFail = oocTotemSummonFailReason(s.effects, s.role);
        if (totemFail) {
          log(`Failed to cast ${s.name}: ${totemFail}`);
          return { ok: false, reason: totemFail };
        }
      }

      // SPELL_ATTR_EX2_NO_ACTIVE_PETS gate.
      // Cite: Spell.cpp:5877-5890 if player HasAttribute(NO_ACTIVE_PETS) and (GetPetGuid() || HasCharm())
      if (hasAttrEx2(s, SPELL_ATTR_EX2.NO_ACTIVE_PETS)) {
        if (state.char.pet || state.char.storedPet) {
          log(`Failed to cast ${s.name}: You already have a pet`);
          return { ok: false, reason: 'You already have a pet' };
        }
      }

      // Pet call and revive gates, pre-spend: a living pet out refuses, a dead one needs Revive, no pet
      // at all refuses, and a stored living pet is fine. Cite: Spell.cpp CheckCast ~5555-5580.
      {
        const petGate = oocPetCallReviveFailReason(s.effects, state.char);
        if (petGate) {
          log(`Failed to cast ${s.name}: ${petGate}`);
          return { ok: false, reason: petGate };
        }
      }

      if (hasAttrEx(rawSpell, SPELL_ATTR_EX.DISMISS_PET_FIRST) && state.char.pet) {
        const name = state.char.pet.name;
        state.char.storedPet = applyPetHappinessPowerDrains(state.char.pet, s.effects);
        state.char.pet = undefined;
        log(`You dismissed ${name}.`);
      }

      // A fixed-entry summon needs a baked creature template before the spend: a missing one used to
      // report success and clear the Imp with no replacement. Cite: SpellEffects.cpp:4565-4570.
      {
        let missingTpl: number | null = null;
        for (const e of s.effects) {
          const kind = e.kind;
          if (kind !== 'summon_possessed' && kind !== 'summon_demon' && kind !== 'summon_pet') continue;
          const c = ('creature' in e ? (e.creature as number) : 0) | 0;
          if (c > 0 && !ds.creature(c)) {
            missingTpl = c;
            break;
          }
        }
        if (missingTpl != null) {
          log(`Failed to cast ${s.name}: Unknown creature`);
          return { ok: false, reason: 'Unknown creature' };
        }
      }

      // Cite: Spell.cpp CalculatePowerCost — POWER_HEALTH uses GetCreateHealth for % costs.
      const armed = findArmedNextCastMod(state.char, s, ds);
      let cost = resolveSpellCost(s, createMana(state.char, ds), createHealth(state.char, ds));
      if (hasAttrEx(s, SPELL_ATTR_EX.USE_ALL_MANA)) {
        if (s.powerType === 'health') cost = state.char.health;
        else if (s.powerType === 'mana') cost = currentMana(state.char);
        else cost = state.char.power;
      }
      // ApplySpellMod COST / CASTING_TIME before TakePower. Cite: Player.h:2575; SPELLMOD_COST=14.
      if (armed?.freeCost) cost = 0;
      else if (armed?.costModPct) cost = Math.max(0, Math.round(cost * (1 + armed.costModPct / 100)));
      if (armed?.costFlat) cost = Math.max(0, cost + armed.costFlat);
      {
        // Form costs and mana spells spend mana, energy and rage spend the active power, and a health
        // cost spends HP — which must be strictly greater than the cost. Cite: Spell.cpp:6383-6387.
        const spendsHealth = s.powerType === 'health';
        const spendsMana = !spendsHealth && (s.powerType === 'mana' || isFormSpell(s) || !!s.costPct);
        const spendsEnergy = s.powerType === 'energy';
        const spendsRage = s.powerType === 'rage';
        if (spendsHealth && cost > 0) {
          if (state.char.health <= cost) {
            log(`Failed to cast ${s.name}: Not enough health`);
            return { ok: false, reason: 'Not enough health' };
          }
        } else if (spendsMana && cost > 0) {
          const mana = currentMana(state.char);
          if (mana < cost) {
            log(`Failed to cast ${s.name}: Not enough mana`);
            return { ok: false, reason: 'Not enough mana' };
          }
        } else if (spendsEnergy && cost > 0 && state.char.power < cost) {
          log(`Failed to cast ${s.name}: Not enough energy`);
          return { ok: false, reason: 'Not enough energy' };
        } else if (spendsRage && cost > 0 && state.char.power < cost) {
          log(`Failed to cast ${s.name}: Not enough rage`);
          return { ok: false, reason: 'Not enough rage' };
        }
      }

      // Reagent gate: CheckItems then TakeReagents, consumed after the cooldown check so a cooldown
      // refusal does not eat them. Cite: Spell.cpp:6560-6593; :4332-4350.
      const spellReagents = s.reagents ?? [];
      for (const r of spellReagents) {
        if (countItem(state.inventory, r.item) < r.count) {
          const idef = ds.item(r.item);
          const reason = idef
            ? `Requires ${r.count}× ${idef.name}`
            : `Missing reagents (item ${r.item})`;
          log(`Failed to cast ${s.name}: ${reason}`);
          return { ok: false, reason };
        }
      }

      // Cooldown enforcement (per-spell + category shared, e.g. potions). World wall time.
      const cnow = Date.now();
      const ownRem = Math.max(0, (state.spellCooldowns?.[spellId] ?? 0) - cnow);
      let catRem = 0;
      if (s.category != null) catRem = Math.max(0, (state.categoryCooldowns?.[s.category] ?? 0) - cnow);
      if (ownRem > 0 || catRem > 0) {
        log(`Failed to cast ${s.name}: On cooldown`);
        return { ok: false, reason: 'cooldown' };
      }

      // Life Tap pre-spend fizzle (Warlock.cpp OnCheckCast). Cite: KI-043; oocCast.ts.
      {
        const ltFail = lifeTapOocFailReason(s.effects, state.char.health);
        if (ltFail) {
          log(`Failed to cast ${s.name}: ${ltFail}`);
          return { ok: false, reason: ltFail };
        }
      }

      // The weapon imbue hand has the same eligibility as an item coat — weapon hands only, never a
      // shield — resolved empty-first before the spend so a refusal does not eat mana.
      let resolvedWeaponImbueHand: 'mainhand' | 'offhand' | undefined;
      if (s.effects.some((e) => e.kind === 'weapon_imbue')) {
        const app = ds.enchantApplicator(spellId);
        const picked = resolveTempWeaponImbueHand({
          equipped: state.char.equipped,
          ds,
          app,
          requested: (opts?.slot === 'offhand' || opts?.slot === 'mainhand') ? opts.slot : undefined,
          char: state.char,
          now: cnow,
          mode: 'empty-first',
        });
        if (!picked.ok) {
          if (picked.needsChoose) {
            log(`Failed to cast ${s.name}: Choose a slot`);
            return {
              ok: false,
              reason: 'Choose a slot',
              needsTarget: {
                spellId,
                enchantId: app?.enchantId ?? 0,
                target: { kind: 'self' },
                slots: picked.needsChoose.slots,
                rejected: picked.needsChoose.rejected,
              },
            };
          }
          log(`Failed to cast ${s.name}: ${picked.reason}`);
          return { ok: false, reason: picked.reason };
        }
        resolvedWeaponImbueHand = picked.hand;
      }

      // City teleports gate mana, cooldown and reagents at the cast, with the power taken on arrival.
      // Empty-effect ranks used to sink mana with the zone unchanged. Cite: game/travel.ts.
      if (s.effects.some((e) => e.kind === 'teleport')) {
        const nowTp = Date.now();
        journeyTick(nowTp);
        const tp = castTeleport(spellId, nowTp);
        if (!tp.ok) {
          log(`Failed to cast ${s.name}: ${tp.reason ?? 'teleport failed'}`);
          return { ok: false, reason: tp.reason ?? 'teleport failed' };
        }
        // OOC cast is atomic: advance past castTime so the portal leg lands (power/CD on arrival).
        const arriveAt = nowTp + Math.max(1, ((s.castTimeMs ?? 0) | 0) + 1);
        journeyTick(arriveAt);
        state.questlog = creditQuestCompleteFromSpell(recordSpellCast(state.questlog, spellId, (e) => ds.quest(e)), ds.spell(spellId));
        refreshQuests();
        log(`You cast ${s.name}.`);
        return { ok: true, conjured: [] };
      }

      // Astral Recall / hearth teleports — same bind as Hearthstone, no item required.
      // Cite: SpellEffects.cpp EffectTeleportUnits TARGET_LOCATION_CASTER_HOME_BIND; KI-532.
      if (s.effects.some((e) => e.kind === 'teleport_hearth')) {
        const nowTp = Date.now();
        journeyTick(nowTp);
        const bind = state.char.hearthBind;
        if (!bind) {
          log(`Failed to cast ${s.name}: You have no hearthstone bind`);
          return { ok: false, reason: 'You have no hearthstone bind' };
        }
        if (state.instance) {
          log(`Failed to cast ${s.name}: Cannot hearth inside an instance`);
          return { ok: false, reason: 'Cannot hearth inside an instance' };
        }
        // Spend mana/CD before snap (atomic OOC — no multi-minute cast bar in headless).
        {
          const spendsMana = s.powerType === 'mana' || isFormSpell(s) || !!s.costPct;
          if (spendsMana && cost > 0) {
            if (powerType(state.char) === 'mana') state.char.power -= cost;
            else state.char.mana = Math.max(0, (state.char.mana ?? 0) - cost);
          }
        }
        {
          const personal = (s.cooldownMs ?? 0) | 0;
          if (personal > 0) {
            if (!state.spellCooldowns) state.spellCooldowns = {};
            state.spellCooldowns[spellId] = nowTp + personal;
          }
        }
        state.char = {
          ...state.char,
          zoneId: bind.zone,
          journey: undefined,
        };
        state.questlog = creditQuestCompleteFromSpell(recordSpellCast(state.questlog, spellId, (e) => ds.quest(e)), ds.spell(spellId));
        refreshQuests();
        log(`You cast ${s.name}.`);
        return { ok: true, conjured: [] };
      }

      // Skinning: state.corpse → game.skin. Cite: SpellEffects.cpp:4970–5006 EffectSkinning.
      if (s.effects.some((e) => e.kind === 'skinning')) {
        const sk = skin();
        if (!sk.ok) {
          log(`Failed to cast ${s.name}: ${sk.reason ?? 'Cannot skin'}`);
          return { ok: false, reason: sk.reason ?? 'Cannot skin' };
        }
        {
          const personal = (s.cooldownMs ?? 0) | 0;
          if (personal > 0) {
            if (!state.spellCooldowns) state.spellCooldowns = {};
            state.spellCooldowns[spellId] = Date.now() + personal;
          }
        }
        state.questlog = creditQuestCompleteFromSpell(recordSpellCast(state.questlog, spellId, (e) => ds.quest(e)), ds.spell(spellId));
        refreshQuests();
        log(`You cast ${s.name}.`);
        return { ok: true, conjured: sk.yielded };
      }

      // Disenchant: itemTarget → existing game.disenchant (destroy + mats + craft skill-up).
      // Cite: SpellEffects.cpp:4640–4666 EffectDisEnchant; domain/professions/enchanting.ts.
      if (s.effects.some((e) => e.kind === 'disenchant')) {
        const itemEntry = (opts?.itemEntry != null && opts.itemEntry > 0) ? opts.itemEntry : 0;
        if (itemEntry <= 0) {
          log(`Failed to cast ${s.name}: No target`);
          return { ok: false, reason: 'No target' };
        }
        const de = disenchant(itemEntry);
        if (!de.ok) {
          log(`Failed to cast ${s.name}: ${de.reason ?? 'Cannot disenchant'}`);
          return { ok: false, reason: de.reason ?? 'Cannot disenchant' };
        }
        {
          const personal = (s.cooldownMs ?? 0) | 0;
          if (personal > 0) {
            if (!state.spellCooldowns) state.spellCooldowns = {};
            state.spellCooldowns[spellId] = Date.now() + personal;
          }
        }
        state.questlog = creditQuestCompleteFromSpell(recordSpellCast(state.questlog, spellId, (e) => ds.quest(e)), ds.spell(spellId));
        refreshQuests();
        log(`You cast ${s.name}.`);
        return { ok: true, conjured: de.yielded };
      }

      // Pick Pocket: need a creature target OOC — not a pure no-op while stealthed.
      // Cite: SpellEffects.cpp EffectPickPocket; domain/professions/pickpocket.ts; KI-112.
      if (s.effects.some((e) => e.kind === 'pickpocket')) {
        const creatureEntry = opts?.targetCreature;
        if (creatureEntry == null) {
          log(`Failed to cast ${s.name}: No target`);
          return { ok: false, reason: 'No target' };
        }
        const pp = pickPocket(creatureEntry, { nowMs: Date.now() });
        if (!pp.ok) {
          log(`Failed to cast ${s.name}: ${pp.reason ?? 'pick pocket failed'}`);
          // A resist is a landed hostile cast that did nothing: the mob knows who tried.
          return pp.aggro
            ? { ok: false, reason: pp.reason ?? 'pick pocket failed', aggroCreature: creatureEntry }
            : { ok: false, reason: pp.reason ?? 'pick pocket failed' };
        }
        {
          const spendsEnergy = s.powerType === 'energy';
          if (spendsEnergy && cost > 0) state.char.power -= cost;
        }
        const now = Date.now();
        {
          const personal = (s.cooldownMs ?? 0) | 0;
          if (personal > 0) {
            if (!state.spellCooldowns) state.spellCooldowns = {};
            state.spellCooldowns[spellId] = now + personal;
          }
        }
        state.questlog = creditQuestCompleteFromSpell(recordSpellCast(state.questlog, spellId, (e) => ds.quest(e)), ds.spell(spellId));
        refreshQuests();
        log(`You cast ${s.name}.`);
        return { ok: true, conjured: [] };
      }

      // Tame Beast's baked effects are a misclassified self attack-power buff, not a tame, so they are
      // not applied: require a beast target and perform the same tame the dedicated path does.
      if (s.role === 'pet_tame') {
        const creatureEntry = opts?.targetCreature;
        if (creatureEntry == null) {
          log(`Failed to cast ${s.name}: No target`);
          return { ok: false, reason: 'No target' };
        }
        const c = ds.creature(creatureEntry);
        if (!c?.tameable) {
          log(`Failed to cast ${s.name}: That beast cannot be tamed`);
          return { ok: false, reason: 'That beast cannot be tamed' };
        }
        // Spend resource (same rules as the generic path below).
        {
          const spendsHealth = s.powerType === 'health';
          const spendsMana = !spendsHealth && (s.powerType === 'mana' || isFormSpell(s) || !!s.costPct);
          const spendsEnergy = s.powerType === 'energy';
          const spendsRage = s.powerType === 'rage';
          if (spendsHealth && cost > 0) {
            state.char.health = Math.max(0, state.char.health - cost);
          } else if (spendsMana && cost > 0) {
            if (powerType(state.char) === 'mana') state.char.power -= cost;
            else state.char.mana = Math.max(0, (state.char.mana ?? 0) - cost);
          } else if ((spendsEnergy || spendsRage) && cost > 0) {
            state.char.power -= cost;
          }
        }
        const pet = newPet(creatureEntry, ds, state.char);
        if (!pet) {
          log(`Failed to cast ${s.name}: Unknown beast`);
          return { ok: false, reason: 'Unknown beast' };
        }
        state.char.pet = pet;
        const now = Date.now();
        {
          const personal = (s.cooldownMs ?? 0) | 0;
          const catMs = (s.category != null && s.category !== 0)
            ? ((s.categoryRecoveryMs != null && s.categoryRecoveryMs > 0)
              ? s.categoryRecoveryMs
              : personal)
            : 0;
          if (personal > 0) {
            if (!state.spellCooldowns) state.spellCooldowns = {};
            state.spellCooldowns[spellId] = now + personal;
          }
          if (s.category != null && catMs > 0) {
            if (!state.categoryCooldowns) state.categoryCooldowns = {};
            state.categoryCooldowns[s.category] = now + catMs;
          }
        }
        // FO3: successful cast credits spellCastTargets.
        state.questlog = recordSpellCast(state.questlog, spellId, (e) => ds.quest(e));
        refreshQuests();
        log(`You tamed ${c.name}.`);
        return { ok: true, conjured: [] };
      }

      // Spend reagents (after all fail-checks).
      for (const r of spellReagents) {
        state.inventory = removeItem(state.inventory, r.item, r.count)[0];
      }

      // Spend resource. Cite: Spell.cpp TakePower — POWER_HEALTH → ModifyHealth(-cost).
      {
        const spendsHealth = s.powerType === 'health';
        const spendsMana = !spendsHealth && (s.powerType === 'mana' || isFormSpell(s) || !!s.costPct);
        const spendsEnergy = s.powerType === 'energy';
        const spendsRage = s.powerType === 'rage';
        if (spendsHealth && cost > 0) {
          state.char.health = Math.max(0, state.char.health - cost);
        } else if (spendsMana && cost > 0) {
          if (powerType(state.char) === 'mana') state.char.power -= cost;
          else state.char.mana = Math.max(0, (state.char.mana ?? 0) - cost);
        } else if ((spendsEnergy || spendsRage) && cost > 0) {
          state.char.power -= cost;
        }
      }

      const conjured: LootDrop[] = [];
      const now = Date.now();
      const aurasBeforeCast = auraStamp();
      // Stealth toggle: recasting Stealth/Prowl while the aura is up cancels it (Classic).
      const alreadyStealthed = s.effects.some((e) => e.kind === 'stealth')
        && (state.char.activeAuras ?? []).some((a) => a.spellId === spellId);
      // RemoveAurasOnCast(AURA_INTERRUPT_FLAG_ACTION) at cast start — the world half of the strip
      // combat already runs. Cite: Spell.cpp:2941-2944; Unit.cpp:5239.
      if (castIsAnAction(s)) {
        const stripped = removeCharAurasWithInterruptFlags(
          state.char, AURA_INTERRUPT.ACTION, ds, s, liveSession(),
        );
        for (const gone of stripped) log(`${gone.name} fades.`);
      }
      if (alreadyStealthed && isStealthSpell(s)) {
        state.char.activeAuras = pruneExpiredAuras(state.char.activeAuras, now)
          .filter((a) => a.spellId !== spellId);
        if (isStealthShapeshift((state.char.form ?? 0) | 0)) {
          state.char.form = undefined;
        }
        log(`You leave ${s.name}.`);
      } else if (isDismissPet) {
        // DISMISS_PET, with its optional happiness drain, which runs on the live pet before the
        // unsummon. Cite: SpellEffects.cpp:1750-1791 and :4714-4729.
        if (!state.char.pet) {
          log(`Failed to cast ${s.name}: You have no pet`);
          return { ok: false, reason: 'You have no pet' };
        }
        // CMaNGOS: "not let dismiss dead pet". Cite: SpellEffects.cpp:4721–4723 EffectDismissPet.
        if (state.char.pet.health <= 0) {
          log(`Failed to cast ${s.name}: Your pet is dead`);
          return { ok: false, reason: 'Your pet is dead' };
        }
        const name = state.char.pet.name;
        state.char.storedPet = applyPetHappinessPowerDrains(state.char.pet, s.effects);
        state.char.pet = undefined;
        log(`You dismissed ${name}.`);
      } else {
        // Beneficial OOC effects + SPELL_EFFECT_TRIGGER_SPELL expansion (Vanish → stealth).
        // Cite: game/oocCastEffects.ts; SpellEffects.cpp EffectTriggerSpell; KI-458.
        const applied = applyOocCastEffects({
          spellId,
          spell: s,
          char: state.char,
          inventory: state.inventory,
          ds,
          now, alreadyStealthed, log,
          weaponImbueHand: resolvedWeaponImbueHand,
          // Only the PLAYER's own cast carries a spellbook, and only a shift reads it (Furor).
          knownSpellIds: state.spellbook?.known,
          rng: mulberry32(hashSeed(state.rngSeed, state.fightCounter++)),
        });
        state.char = applied.char;
        state.inventory = applied.inventory;
        conjured.push(...applied.conjured);
        // These two stay here rather than in the peeled effects module because they need the whole
        // GameState: resurrect resolves a revive target, and the cooldown reset rewrites the maps.
        for (const eff of s.effects) {
          if (eff.kind === 'resurrect' || eff.kind === 'resurrect_pct') {
            log(applyOocResurrectEffect(state, ds, eff, s.name, opts?.reviveTarget === 'self'));
          } else if (eff.kind === 'self_resurrect') {
            // Reincarnation / EffectSelfResurrect — always self. Cite: SpellEffects.cpp:4937.
            log(applyOocSelfResurrectEffect(state, ds, eff, s.name));
          } else if (eff.kind === 'reset_cooldowns') {
            applyResetCooldownsWorld(eff.scope, spellId, state.spellCooldowns, state.categoryCooldowns, state.spellbook.known, (id) => ds.spell(id));
          }
        }
        // SUMMON_OBJECT_WILD places temporary world gameobjects with no owner. It needs GameState, so
        // it sits beside resurrect for the same reason. Cite: SpellEffects.cpp:3620-3662.
        {
          const wilds = collectSummonObjectWildFromSpell(s, now);
          if (wilds.length) {
            state.wildSummonedObjects = mergeWildSummoned(state.wildSummonedObjects, wilds, now);
            for (const w of wilds) {
              const goName = ds.gameObject(w.goEntry)?.name ?? `object ${w.goEntry}`;
              log(`You summon ${goName}.`);
            }
          }
          const slots = collectSummonObjectSlotFromSpell(s, now);
          if (slots.length) {
            state.objectSlots = placeSummonObjectSlot(state.objectSlots, slots, now);
            for (const w of slots) {
              const goName = ds.gameObject(w.goEntry)?.name ?? `object ${w.goEntry}`;
              log(`You summon ${goName}.`);
            }
          }
        }
      }

      // DropAuraCharge after a successful matching cast — the world chip must go with the combat one.
      // Cite: Player.cpp:16843–16855 RemoveSpellMods; SpellAuras.cpp:5750 DropAuraCharge.
      if (armed) state.char = dropNextCastAura(state.char, armed.spellId, ds, now);

      // Charge / similar: spell-level rage grant (not an effect kind). Cap at rage max.
      // Cite: combat.ts cast path ~5043 gainRage(spell.rageGenerated).
      if (s.rageGenerated && s.rageGenerated > 0 && powerType(state.char) === 'rage') {
        const max = maxPower(state.char, ds);
        state.char.power = Math.min(max, state.char.power + s.rageGenerated);
      }

      // A successful OOC cast credits its spell cast targets and quest completion. A cast on a GO
      // credits the GO too, and the garments heal credits TalkedToCreature on the patient.
      if (opts?.targetGoEntry) {
        state.questlog = recordCastedCreatureOrGO(
          state.questlog,
          opts.targetGoEntry,
          spellId,
          (e) => ds.quest(e),
        );
        state.questlog = creditQuestCompleteFromSpell(state.questlog, ds.spell(spellId));
      } else {
        state.questlog = creditQuestCompleteFromSpell(recordSpellCast(state.questlog, spellId, (e) => ds.quest(e)), ds.spell(spellId));
        state.questlog = garmentsAfterCast(spellId, opts?.targetCreature, state.questlog, ds, log);
      }
      // SPELL_EFFECT_SEND_EVENT — StartEvents_Event(misc). Cite: SpellEffects.cpp:1794–1798.
      {
        const se = applySendEventFromSpell(
          state.questlog,
          s,
          (id) => ds.eventScripts(id),
          log,
          (e) => ds.quest(e),
        );
        state.questlog = se.log;
        applySendEventTempSpawns(se.fired);
      }
      // dbscripts_on_spell — same finish moment as SEND_EVENT. Cite: SpellEffects.cpp:1529–1531.
      applySpellDbScripts(spellId, opts);
      // SPELL_EFFECT_ACTIVATE_OBJECT — GameObjectActions on targetGoEntry (gameObjTarget).
      // No target → no-op (C++ if (!gameObjTarget) return). Cite: SpellEffects.cpp:4377–4482.
      {
        const goEntry = opts?.targetGoEntry;
        const ao = applyActivateObjectFromSpell(s, {
          targetGoEntry: goEntry,
          goRuntime: state.goRuntime,
          goRuntimeKey: (entry) => `${state.char.zoneId}:${entry}`,
          wildSummonedObjects: state.wildSummonedObjects,
          goName: goEntry ? (ds.gameObject(goEntry)?.name) : undefined,
        });
        if (ao.goRuntime) state.goRuntime = ao.goRuntime;
        if (ao.wildSummonedObjects) state.wildSummonedObjects = ao.wildSummonedObjects;
        for (const a of ao.applied) log(a.message);
      }
      // SPELL_EFFECT_OPEN_LOCK (33) / OPEN_LOCK_ITEM (59) — EffectOpenLock on GO / item.
      // No target → no-op (C++ :2217–2228). Cite: SpellEffects.cpp:2204–2274; openLockFromSpell.ts.
      {
        const goEntry = opts?.targetGoEntry;
        const go = goEntry ? ds.gameObject(goEntry) : undefined;
        const lockDef = go?.lockId != null
          ? (ds.lock(go.lockId) as LockDef | undefined)
          : undefined;
        const ol = applyOpenLockFromSpell(s, {
          targetGoEntry: goEntry,
          lock: lockDef,
          goRuntime: state.goRuntime,
          goRuntimeKey: (entry) => `${state.char.zoneId}:${entry}`,
          targetName: go?.name,
        });
        if (ol.goRuntime) state.goRuntime = ol.goRuntime;
        for (const a of ol.applied) {
          log(a.message);
          // UpdateGatherSkill when open succeeded via picklock skill case.
          // Cite: SpellEffects.cpp:2232–2244; skillId from CanOpenLock SkillByLockType.
          if (
            (a.open || a.unlocked) &&
            (a.lockType === LOCKTYPE_PICKLOCK || (a.lockType == null && picklockSkillReq(lockDef) > 0))
          ) {
            const rngLp = mulberry32(hashSeed(state.rngSeed, state.fightCounter++));
            const gain = tryLockpickingSkillUp(
              state.char.combatSkills,
              picklockSkillReq(lockDef),
              (p) => rngLp.chance(p),
            );
            if (gain.map) state.char = { ...state.char, combatSkills: gain.map };
            if (gain.up != null) log(`Your lockpicking skill has increased to ${gain.up}.`);
          }
        }
      }
      refreshQuests();

      // Start this cast's cooldowns, preferring the split personal and category recovery off the
      // category recovery time. Cite: SpellMgr.h GetSpellRecoveryTime; spells/recovery.ts.
      {
        const personal = (s.cooldownMs ?? 0) | 0;
        const catMs = (s.category != null && s.category !== 0)
          ? ((s.categoryRecoveryMs != null && s.categoryRecoveryMs > 0)
            ? s.categoryRecoveryMs
            : personal)
          : 0;
        if (personal > 0) {
          if (!state.spellCooldowns) state.spellCooldowns = {};
          state.spellCooldowns[spellId] = now + personal;
        }
        if (s.category != null && catMs > 0) {
          if (!state.categoryCooldowns) state.categoryCooldowns = {};
          state.categoryCooldowns[s.category] = now + catMs;
        }
      }

      // One feed per corpse (same as cannibalize()).
      if (corpseTypeMask) state.lastCorpse = null;

      mirrorNewAurasToLiveUnit(aurasBeforeCast);

      if (!isFormSpell(s)) log(`You cast ${s.name}.`);
      return { ok: true, conjured };
    },

    cannibalize() {
      // The dead cannot cannibalize: CheckCast fails a dead caster unless the spell may be cast while
      // dead. Cite: Spell.cpp:4586 SPELL_FAILED_CASTER_DEAD.
      {
        const dead = refuseIfDead(state.char.health, state.deathFlow);
        if (dead) return dead;
      }
      // The Forsaken devour a fresh Humanoid or Undead corpse to recover health out of combat, gated
      // on race, on having learned Cannibalize, and on a suitable corpse — one feed per corpse.
      const CANNIBALIZE = 20577, HEAL_FRAC = 0.35;
      if (combatantCreatureType(state.char) !== CREATURE_TYPE.UNDEAD) return { ok: false, reason: 'Only the Forsaken can cannibalize' };
      if (!knows(state.spellbook, CANNIBALIZE)) return { ok: false, reason: 'You have not learned Cannibalize' };
      const type = state.lastCorpse?.creatureType;
      if (type !== CREATURE_TYPE.HUMANOID && type !== CREATURE_TYPE.UNDEAD) return { ok: false, reason: 'No edible corpse nearby' };
      const max = maxHealth(state.char, ds);
      const before = state.char.health;
      state.char.health = Math.min(max, before + Math.round(max * HEAL_FRAC));
      state.lastCorpse = null; // consumed
      const restored = state.char.health - before;
      log(`You feast on the corpse, restoring ${restored} health.`);
      return { ok: true, restored };
    },

    cancelAura(spellId: number) {
      const id = spellId | 0;
      const sp = ds.spell(id);
      if (!sp) return { ok: false, reason: CANCEL_AURA_REFUSAL_TEXT['unknown-spell'] };
      const name = sp.name || `spell ${id}`;

      // Session: ActiveEffect.source. Sheet: playerIsAreaAuraCaster (player guid, not pet/totem).
      // Cite: SpellHandler.cpp:446,484.
      const live = liveSession();
      const refusal = auraCancelRefusal(sp, cancelStateFor(id, live));
      if (refusal) return { ok: false, reason: CANCEL_AURA_REFUSAL_TEXT[refusal] };

      // Two stores hold auras, and on a floor usually only the session does: it owns the
      // player's live auras from zone-in to zone-out, so a floor-gained aura is off the sheet.
      const auras = state.char.activeAuras;
      const onSheet = (auras ?? []).some((a) => a.spellId === id)
        || (state.char.activeBuffs ?? []).includes(id);
      const onUnit = !!live?.playerView().buffs.some((b) => (b.spellId | 0) === id);
      if (!onSheet && !onUnit) return { ok: false, reason: `You are not affected by ${name}` };

      if (onSheet) {
        // getActiveBuffIds derives activeBuffs from activeAuras whenever that list exists; a
        // legacy save with no activeAuras holds ids only in activeBuffs, hence the 2nd filter.
        if (auras !== undefined) state.char.activeAuras = auras.filter((a) => a.spellId !== id);
        state.char.activeBuffs = getActiveBuffIds(state.char, Date.now(), ds).filter((b) => b !== id);
        // A +Int/+Sta buff leaving shrinks the pools it grew. clampResourcePools returns a copy.
        state.char = clampResourcePools(state.char, ds);
      }
      // Cite: sessionApi.ts:1438 removeAurasDueToSpell -> Unit.cpp:5085
      // RemoveAurasDueToSpellByCancel (AURA_REMOVE_BY_CANCEL).
      live?.removeAurasDueToSpell('player', id);

      log(`${name} fades from you.`);
      return { ok: true, name };
    },

    canCancelAuraNow(spellId: number) {
      const id = spellId | 0;
      const sp = ds.spell(id);
      if (!sp) return false;
      return auraCancelRefusal(sp, cancelStateFor(id, liveSession())) === null;
    },
  };
}
