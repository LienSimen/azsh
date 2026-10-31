// Wave 4 — late applySpell effect cases (summon_totem → end of loop). Pattern (D).
import type { ActiveEffect, Fighter } from './types.ts';
import type { SpellDef, SpellEffect } from '../../data/schema.ts';
import { isAllySide, isEnemySide, isTotemSide, type Side, type TotemSide } from '../core/events.ts';
import {
  TUNING, rollBetween, spellCritChance, critMultiplierWithVersus,
} from './formulas.ts';
import { fighterSpellCrit, applyBuffMod, reverseBuffMod, applyResistMod, applyMechanicResist, makeFighter } from './fighterFactory.ts';
import { spellDamageLandChance } from './mitigation.ts';
import { POWER_MANA } from '../spells/effects.ts';
import { getDispelMask, processDispelList, dispelClaimKey } from '../../domain/spells/dispel.ts';
import { applyDispelMechanicOnUnit } from './applyDispelMechanic.ts';
import type { DispellableAura } from '../../domain/spells/dispel.ts';
import { DEVOUR_MAGIC_HEAL, SPELLCATEGORY_DEVOUR_MAGIC } from '../spells/interpreter/handlers/shared.ts';
import { resolveSpellEffects } from '../spells/interpreter/index.ts';
import { buildTotemFromEffect } from '../../domain/spells/totem.ts';
import { applySpellMagnetToParty } from './totemAuras.ts';
import { isWithinRadiusYd } from './combatGeometry.ts';
import {
  areaAuraCarrierSides, effectiveAreaRadiusYd, hasAreaAuraRow, stripAreaAuraRowsFrom,
} from './areaAura.ts';
import {
  isImmuneToMechanic,
  isTotemCreatureType,
  totemRefusesNegativeAuraApply,
} from '../spells/immunity.ts';
import { spellCanCrit } from '../spells/spellAttributes.ts';
import {
  JUDGEMENT_PAYLOAD_TRIGGER_FLAGS,
  triggeredSpellIgnoresHitResult,
} from '../spells/interpreter/paladin-seals.ts';
import { SPELL_EFFECT_SCHOOL_DAMAGE } from '../spells/interpreter/opcodes.ts';
import { CLEAN_ESCAPE_AURA_SPELL_ID, HEALING_WAY_MAX_STACKS } from '../spells/interpreter/class-scripts-kit.ts';
import { isHostileBuffEffect } from './predicates.ts';
import { isHostileSpeedEffect, markSpeedDirty } from './speedAura.ts';
import { mechanicMaskOfLiveEffect } from './crowdControl.ts';
import type { HeartbeatHolder } from './heartbeatResist.ts';
import { addOwnedSpellMods } from '../spells/spellModIntents.ts';
import { COMBUSTION_UNTIL_CANCELLED_MS, setCombustionStacks } from './combustion.ts';
import { pendingSpellModFromResolved, roleOf } from './roles.ts';
import {
  filterPartyFanByRadius, resolveHealApplyTo, resolvePetHealFighter, sameSubgroup,
  selectedOrSelfFriendly,
} from './healTargets.ts';
import type { ActiveWeaponImbue } from './types.ts';
import { isStealthShapeshift } from '../../domain/character/forms.ts';
import { applyKnockBackEffect } from './knockBack.ts';
import { applyLeapEffect } from './leap.ts';
import { clampDisplacementToFloor, displaceFloorFromCfg } from './displaceFloor.ts';
import { applyModTauntAura } from './modTaunt.ts';
import { applyDemonicSacrificeEffect } from './applyDemonicSacrifice.ts';
import { getSpellRecoveryTime } from '../spells/recovery.ts';
import {
  IMPROVED_SPRINT_TRIGGER_SPELL_ID,
  improvedSprintShouldProc,
  improvedSprintTriggerSpellDef,
  isSprintSpell,
} from '../spells/cmangos-special-cases-s21.ts';
import { applyHealEffect, applyHealingWayStack } from './applyHealEffect.ts';
import { moneyMarked } from '../../domain/economy/money.ts';
import { isPossessInvSpell } from '../../domain/scriptdev/index.ts';
import { setHover } from '../../domain/core/hover.ts';

export function applySpellEffectLate(
  L: Record<string, any>,
  src: Fighter,
  tgt: Fighter,
  spell: SpellDef,
  eff: SpellEffect,
  state: {
    t: number;
    durFor: (n: number) => number;
    crit: boolean;
    binary: any;
    hitBox?: { finisherHit: boolean };
    hitCount?: number;
    unitTargetGender?: 0 | 1;
    /** Armed when this speed row owns the spell's one heartbeat clock. Cite: Spell.cpp:1483-1489. */
    heartbeat?: HeartbeatHolder | null;
  },
): void {
  const t = state.t;
  const durFor = state.durFor;
  const crit = state.crit;
  const binary = state.binary;
  // Mutable finisher flag shared with applySpell's loop (set true on land).
  let finisherHit = state.hitBox?.finisherHit ?? false;
  const markFinisherHit = () => {
    finisherHit = true;
    if (state.hitBox) state.hitBox.finisherHit = true;
  };
  const {
    push, effects: effectsRaw, rng, cfg, player, pet, totems, enemy,
    dealDamage, applyFlatThreat, applyHealThreat, applySpellThreatBonus, applyDamageThreat,
    powerOfType, maxPowerOfType, setPowerOfType, grantImmunityAura,
    consumeChargedImmunityOnMechanicBlock,
    resolveDispelTarget, dispellableAurasOn, stripAuraOnDispel, dispelTypeOfSpell,
    dispelClaim,
    livingFriendlies: livingFriendliesRaw, livingAllies, dead, foeOf, lowestHpFriendly, unsummonTotem,
    sealRighteousnessSwing, spellCost, spend, addComboPoints, clearComboPoints, comboOn,
    threatOf, bySide, sideFighter, factionOf, distanceBetween, livingHostilesFor, reflectChanceFor,
    rollHeal, applyControl, applyDr, ccImmune, onDamaged, enterForm, leaveForm,
    applyStealth, breakStealth, maybeBreakStealthOn, behindOk,
    // Wave 4 fix-up: these were referenced as bare identifiers after the peel
    // (ReferenceError at runtime on totem party auras / triggered casts / procs).
    isCharmed, applySpell, livingEnemies, triggerProcs, rollGearProcs,
    consumePendingSpellMod,
    // Geometry + class-A area-aura plumbing (totem origin / radius maintain).
    posOf, setPos, displaced, registerAreaAuraSource, reverseActiveEffect,
    runCastSummons, effectsOn: effectsOnRaw, effectsFrom: effectsFromRaw,
    setEffectSource: setEffectSourceRaw, bumpEffectsVersion: bumpEffectsVersionRaw,
    applyBuffMod: _ab, // may come from L
    touchEffect: touchEffectRaw, touchPeriodicDue,
  } = L;
  const touchEffect = (e: ActiveEffect): void => { (touchEffectRaw as ((ae: ActiveEffect) => void) | undefined)?.(e); };
  // L is a Record bag; narrow the live-effect table + friendlies for callback typing.
  const effects = effectsRaw as ActiveEffect[];
  const effectsOn = effectsOnRaw as ((side: string) => ActiveEffect[]) | undefined;
  const effectsFrom = effectsFromRaw as ((side: string) => ActiveEffect[]) | undefined;
  const rowsOn = (f: Fighter): ActiveEffect[] => effectsOn?.(f.side) ?? effects;
  const rowsFrom = (f: Fighter): ActiveEffect[] => effectsFrom?.(f.side) ?? effects;
  const setEffectSource = setEffectSourceRaw as ((e: ActiveEffect, side: string) => void) | undefined;
  const bumpEffectsVersion = bumpEffectsVersionRaw as (() => void) | undefined;
  const livingFriendlies = livingFriendliesRaw as () => Fighter[];
  // Ensure threatOf always available (hub on CombatContext)
  const threatOfFn = threatOf ?? ((owner: any) => L.threatOf?.(owner));
  void threatOfFn;
  // Prefer L.applyBuffMod if present
  const applyBuffModFn = L.applyBuffMod ?? applyBuffMod;
  void applyBuffModFn;

if (eff.kind === 'summon_totem') {
        // Shaman totem: replace the slot, spawn the fighter, apply the passives or arm the cast AI.
        // The player OR a party ally — a companion shaman is a shaman. A CREATURE'S is not our slot.
        if (src.side !== 'player' && !isAllySide(src.side)) {
          const made = runCastSummons(src, spell);
          if (made.length > 0) {
            push({ t, kind: 'flavor', text: `${src.spec.name} summons ${made[0]!.spec.name}.` });
          }
          markFinisherHit();
          return;
        }
        if (eff.slot === 'none') return;
        const built = buildTotemFromEffect(
          eff,
          spell.id,
          src.spec.level,
          src.spec.critChance,
          src.spec.hitChance,
          spell.name,
          src.side,
        );
        if (!built) return;
        // `if (damage)` is false for 23419, so that totem keeps the creature_template health rather
        // than the 1 hp a bare max(1) gave it. Cite: SpellEffects.cpp:4538-4542.
        if ((eff.health | 0) <= 0) {
          const dbHp = (cfg.resolveSummon?.(eff.creature | 0)?.maxHealth ?? 0) | 0;
          if (dbHp > 0) {
            built.maxHp = dbHp;
            built.spec.maxHealth = dbHp;
            built.spec.startHealth = dbHp;
          }
        }
        // Only THIS caster's seat is replaced. Cite: SpellEffects.cpp:4500 `m_caster->GetTotem(slot)`.
        if (totems.has(built.side)) unsummonTotem(built.side, 'replace');
        const tot = makeFighter(built.side, built.spec);
        tot.totemExpiresAt = t + built.durationMs;
        (touchPeriodicDue as ((at: number) => void) | undefined)?.(tot.totemExpiresAt);
        tot.totemSlot = built.slot;
        tot.totemSummonSpellId = built.summonSpellId;
        // GetSpell() + aura-23 payloads: the pulse schedule resolves triggerSpellId against these,
        // and UnSummon strips only auras carrying kitSpellId. Cite: Totem.cpp UnSummon / GetSpell.
        tot.totemKitSpellId = built.kitSpellId;
        if (built.triggerSpells.length) tot.totemTriggerSpells = built.triggerSpells;
        if (built.auraRadiusYd > 0) tot.totemAuraRadiusYd = built.auraRadiusYd;
        // No white melee for totems (TotemAI only CastSpell).
        tot.swingReadyAt = Number.POSITIVE_INFINITY;
        L.rosterSetTotem(built.side, tot); // seat + fightersOrder generation, one writer
        // Mark the summon spell up so buffPresent gates stop re-spamming the same totem, on the
        // CASTER: marking the player for an ally's totem gated the wrong unit and drew a phantom chip.
        tot.totemOwnerSide = src.side;
        // Meter merge survives UnSummon (Searing Totem damage still credits the sham).
        (L.noteTotemOwner as ((s: string, o: Side, n: string) => void) | undefined)
          ?.(built.side, src.side, built.name);
        // Geometry: a totem is dropped AT THE CASTER'S FEET and never moves, so its position — not the
        // shaman's — is the origin of every friendly-radius test. Cite: SpellEffects EffectSummonTotem.
        {
          const ownerPos = posOf?.(src.side);
          if (ownerPos) setPos?.(built.side, { x: ownerPos.x, y: ownerPos.y });
        }
        src.buffActive.add(built.summonSpellId);
        push({ t, kind: 'flavor', text: `${src.spec.name} summons ${built.name}.` });
        push({ t, kind: 'aura', actor: src.side, name: built.name, applied: true });
        if (built.type === 'passive') {
          // Totem::Summon TOTEM_PASSIVE casts each kit spell on summon. Party auras reach the owner and
          // same-subgroup members, and UnSummon strips that set. Pets are not Group members.
          const totemParty = (): Fighter[] => {
            const out: Fighter[] = [];
            if (player.hp > 0 && !isCharmed(player)) out.push(player);
            for (const al of livingAllies()) if (!isCharmed(al)) out.push(al);
            // UnSummon strips "owner + same-subgroup members" because that is exactly who
            // the kit aura reached — a totem never buffed the other seven raid groups.
            return out.filter((fr) => sameSubgroup(src, fr));
          };
          // The effective radius for one kit ability: the DBC yards scaled by the OWNER's radius mods,
          // so Totemic Mastery rides one pipeline rather than an if-mastery branch.
          const kitRadiusYd = (abil: SpellDef): number | undefined =>
            effectiveAreaRadiusYd(abil.radiusYd, src.radiusSpellMods);
          /** In-radius members of the totem's party (fails open on a missing radius). */
          const inRadiusParty = (abil: SpellDef): Fighter[] => {
            const r = kitRadiusYd(abil);
            const origin = posOf?.(built.side);
            return totemParty().filter((fr) =>
              isWithinRadiusYd(origin, posOf?.(fr.side), r),
            );
          };
          // Register the kit aura as a live class-A holder so the maintain pass keeps re-checking the
          // totem-to-ally distance. The origin is the TOTEM; the mod owner is the shaman.
          const registerTotemAreaAura = (abil: SpellDef, apply: (fr: Fighter) => void): void => {
            registerAreaAuraSource?.({
              holderSide: built.side,
              spellId: abil.id,
              name: abil.name,
              baseRadiusYd: abil.radiusYd,
              modOwnerSide: src.side,
              apply,
              strip: (fr: Fighter) => {
                stripAreaAuraRowsFrom(effects, fr, abil.id, built.side, reverseActiveEffect, rowsOn(fr));
              },
              members: totemParty,
              carriers: () => areaAuraCarrierSides(effectsFrom?.(built.side) ?? effects, abil.id, built.side),
              alive: () => totems.get(built.side) === tot && !dead(tot),
            });
          };
          for (const abil of built.abilities) {
            // Weapon-proc payloads fire from the enchant proc on the wielder's SWING, never as a
            // standing party aura — applying them here handed the party a PERMANENT +315 AP.
            if (abil.effects.some((e) => e.kind === 'extra_attacks')) continue;
            const hasOffense = abil.effects.some((e) => e.kind === 'direct_damage' || e.kind === 'dot');
            if (hasOffense) {
              const foe = foeOf(tot);
              // foeOf returns the caster itself when no hostiles live, and a Searing Totem must not fire
              // at itself. The recursive applySpell is fine: a kit id is never the summon spell.
              if (foe !== tot && !dead(foe)) applySpell(tot, foe, abil);
            }
            for (const ae of abil.effects) {
              if (ae.kind === 'buff') {
                const amount = ae.amount;
                // An area-party kit aura bakes durationMs 0 and lives as long as the totem, but a kit
                // spell with its OWN duration is a proc payload — honour its clock when it has one.
                const dur = ae.durationMs > 0 ? ae.durationMs : built.durationMs;
                // Kit buffs from area-party totems use applyTo party; totem passives without a hostile
                // flag default to it. Party reach is the TOTEM's radius, not everyone alive.
                const buffTgts = ae.hostile
                  ? livingEnemies().filter((en: Fighter) =>
                    isWithinRadiusYd(posOf?.(built.side), posOf?.(en.side), kitRadiusYd(abil) ?? 10),
                  )
                  : (ae.applyTo === 'self' ? [player] : inRadiusParty(abil));
                const applyKitBuff = (fr: Fighter): void => {
                  if (dead(fr)) return;
                  if (hasAreaAuraRow(rowsOn(fr), fr, abil.id, built.side)) return;
                  applyBuffMod(fr, ae.mod, amount);
                  fr.buffActive.add(abil.id);
                  effects.push({
                    kind: 'buff', source: built.side, target: fr.side, spellId: abil.id, name: abil.name,
                    mod: ae.mod, amount, expiresAt: t + dur, fromTotem: built.side,
                  });
                  push({ t, kind: 'aura', actor: fr.side, name: abil.name, applied: true });
                };
                // continue (not return): one dead friendly must not abort party aura reach.
                // Cite: Totem.cpp UnSummon party strip :145–157; APPLY_AREA_AURA_PARTY effect 35.
                for (const fr of buffTgts) applyKitBuff(fr);
                if (!ae.hostile && ae.applyTo !== 'self') {
                  registerTotemAreaAura(abil, applyKitBuff);
                }
              } else if (ae.kind === 'restore_health' || ae.kind === 'restore_power') {
                // Tick while the totem lives (Healing Stream / Mana Spring) — party reach.
                // Cite: APPLY_AREA_AURA_PARTY; Totem.cpp UnSummon removes aura on all subgroup members.
                const tickMs = Math.max(1, ae.tickMs);
                const kitPower = ae.kind === 'restore_power' ? (ae.powerType ?? POWER_MANA) | 0 : undefined;
                const applyKitTick = (fr: Fighter): void => {
                  if (dead(fr)) return;
                  if (hasAreaAuraRow(rowsOn(fr), fr, abil.id, built.side)) return;
                  // The aura lands on every living party member for strip symmetry; the pool it pays
                  // rides on the row, so Mana Spring on a warrior ticks nothing rather than rage.
                  fr.buffActive.add(abil.id);
                  effects.push({
                    kind: ae.kind, source: built.side, target: fr.side, spellId: abil.id, name: abil.name,
                    amountPerTick: ae.amountPerTick, pctOfMax: ae.pctOfMax, tickMs, nextTickAt: t + tickMs,
                    ...(kitPower != null ? { powerType: kitPower } : {}),
                    expiresAt: t + built.durationMs, fromTotem: built.side,
                  });
                  push({ t, kind: 'aura', actor: fr.side, name: abil.name, applied: true });
                };
                // Healing Stream / Mana Spring only tick on allies standing in the totem's
                // radius — walk out and the stream stops for you (§4.9.1).
                for (const fr of inRadiusParty(abil)) applyKitTick(fr);
                registerTotemAreaAura(abil, applyKitTick);
              } else if (ae.kind === 'proc_trigger_spell') {
                // PERIODIC_TRIGGER_SPELL on a totem kit: the kit spell is only the metronome and the
                // payload is its trigger. Dropping it made every cleanser and Windfury grant nothing.
                const tickMs = Math.max(1, ae.tickMs ?? 0);
                effects.push({
                  kind: 'proc_trigger_spell',
                  source: built.side,
                  target: built.side,
                  spellId: abil.id,
                  name: abil.name,
                  triggerSpellId: ae.triggerSpellId,
                  tickMs,
                  nextTickAt: t + tickMs,
                  expiresAt: t + built.durationMs,
                  fromTotem: built.side,
                });
              } else if (ae.kind === 'resist') {
                // MOD_RESISTANCE party aura — the Frost, Fire and Nature Resistance Totems. Same party
                // reach and strip symmetry as the stat buffs; without it they were summoned decoration.
                const applyKitResist = (fr: Fighter): void => {
                  if (dead(fr)) return;
                  if (hasAreaAuraRow(rowsOn(fr), fr, abil.id, built.side)) return;
                  applyResistMod(fr, ae.school, ae.amount);
                  fr.buffActive.add(abil.id);
                  effects.push({
                    kind: 'resist', source: built.side, target: fr.side, spellId: abil.id,
                    name: abil.name, school: ae.school, amount: ae.amount,
                    expiresAt: t + built.durationMs, fromTotem: built.side,
                  });
                  push({ t, kind: 'aura', actor: fr.side, name: abil.name, applied: true });
                };
                for (const fr of inRadiusParty(abil)) applyKitResist(fr);
                registerTotemAreaAura(abil, applyKitResist);
              } else if (ae.kind === 'threat') {
                // SPELL_EFFECT_THREAT on totem kit (Stoneclaw Effect) — real list score.
                // Cite: SpellEffects.cpp EffectThreat; amount from EffectBasePoints.
                applyFlatThreat(tot, ae.amount, abil as unknown as SpellDef);
              } else if (ae.kind === 'spell_magnet') {
                const magnetDur = ae.durationMs > 0 ? ae.durationMs : built.durationMs;
                const applyKitMagnet = (fr: Fighter): void => {
                  applySpellMagnetToParty({
                    effects, effectsOn, party: [fr], source: built.side, spell: abil,
                    expiresAt: t + magnetDur, t, push, touchEffect,
                  });
                };
                for (const fr of inRadiusParty(abil)) applyKitMagnet(fr);
                registerTotemAreaAura(abil, applyKitMagnet);
              } else if (ae.kind === 'speed' && (ae.hostile || ae.pct < 0)) {
                // Earthbind-style snare on passive totem kit — radius of the TOTEM, not
                // the whole floor stream. Cite: Earthbind 3600 radius 10; SpellRadius.dbc.
                const snareR = kitRadiusYd(abil) ?? 10;
                const snareOrigin = posOf?.(built.side);
                for (const enemy of livingEnemies()) {
                  if (dead(enemy)) continue;
                  if (!isWithinRadiusYd(snareOrigin, posOf?.(enemy.side), snareR)) continue;
                  const snareDur = Math.max(ae.durationMs || 0, built.durationMs);
                  effects.push({
                    kind: 'speed',
                    source: built.side,
                    target: enemy.side,
                    spellId: abil.id,
                    name: abil.name,
                    aura: ae.aura,
                    pct: ae.pct,
                    expiresAt: t + snareDur,
                    fromTotem: built.side,
                  });
                  push({ t, kind: 'aura', actor: enemy.side, name: abil.name, applied: true });
                }
              }
            }
          }
          // 8178 lives on triggerAbilities (kit 8179 is the metronome). Apply magnet now.
          // Cite: creature 5925 spells=[8179]; 8178 APPLY_AREA_AURA_PARTY aura 96.
          for (const trig of built.triggerSpells) {
            const magnetFx = trig.effects.find((e) => e.kind === 'spell_magnet');
            if (!magnetFx || magnetFx.kind !== 'spell_magnet') continue;
            const magnetDur = magnetFx.durationMs > 0 ? magnetFx.durationMs : built.durationMs;
            const applyTrigMagnet = (fr: Fighter): void => {
              applySpellMagnetToParty({
                effects, effectsOn, party: [fr], source: built.side,
                spell: { id: trig.id, name: trig.name, procCharges: magnetFx.charges },
                expiresAt: t + magnetDur, t, push, touchEffect,
              });
            };
            for (const fr of inRadiusParty(trig)) applyTrigMagnet(fr);
            registerTotemAreaAura(trig, applyTrigMagnet);
          }
        }
      } else if (eff.kind === 'heal') {
        // Party / chain / triage — see applyHealEffect.ts (was inlined; double-heal fix).
        applyHealEffect(L, src, tgt, spell, eff, t);
      } else if (eff.kind === 'aura_dummy_holder' || eff.kind === 'aura_dummy') {
        // An empty-body dummy still shows an icon and timer when it has a real duration AND is the
        // spell's only payload. A dummy riding damage, a proc or haste is a script hook, not a chip.
        const rawDur = (eff.durationMs ?? 0) | 0;
        const untilCancelled = rawDur <= 0 && (((spell.durationIndex ?? 0) | 0) === 21 || !!spell.passive);
        const dummyIsRider = spell.effects.some(
          (e) => e.kind !== 'aura_dummy' && e.kind !== 'aura_dummy_holder',
        );
        const hostileDummy = eff.hostile === true;
        const skipHostileOnSelf = hostileDummy
          && (tgt === src || isEnemySide(src.side) === isEnemySide(tgt.side));
        if (dummyIsRider || (rawDur <= 0 && !untilCancelled) || skipHostileOnSelf) {
          markFinisherHit();
        } else {
          const holder = (eff.auraOnTarget === true || hostileDummy) && tgt !== src ? tgt : src;
          holder.buffActive.add(spell.id);
          effects.push({
            kind: 'buff', source: src.side, target: holder.side, spellId: spell.id, name: spell.name,
            expiresAt: untilCancelled ? Number.POSITIVE_INFINITY : t + durFor(rawDur),
          });
          push({ t, kind: 'aura', actor: holder.side, name: spell.name, applied: true });
          markFinisherHit();
        }
      } else if (eff.kind === 'durability_damage') {
        // SPELL_EFFECT_DURABILITY_DAMAGE_PCT — Character apply is settleFight. Cite: :5236–5260.
        push({
          t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id,
          name: spell.name, result: 'hit', amount: 0, school: spell.school || 'physical',
        });
        markFinisherHit();
      } else if (eff.kind === 'instakill') {
        // SPELL_EFFECT_INSTAKILL — DealDamage full remaining HP. Cite: SpellEffects.cpp:205–221.
        if (!dead(tgt)) {
          const amount = Math.max(1, Math.round(tgt.hp));
          dealDamage(tgt, amount, spell.school || 'physical', src.spec.level, {
            damageType: 'spell', attacker: src, spell,
          });
          push({
            t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id,
            name: spell.name, result: 'hit', amount, school: spell.school || 'physical',
          });
          markFinisherHit();
        }
      } else if (eff.kind === 'summon_critter') {
        // SPELL_EFFECT_SUMMON_CRITTER — mini-pet companion (cosmetic). Cite: SpellEffects.cpp:5031–5111.
        if (!eff.despawnOnly) {
          push({
            t, kind: 'flavor',
            text: `${src.spec.name} summons a companion (${eff.creature}).`,
          });
        } else {
          push({ t, kind: 'flavor', text: `${src.spec.name} dismisses their companion.` });
        }
        markFinisherHit();
      } else if (eff.kind === 'mod_scale') {
        // SPELL_AURA_MOD_SCALE — cosmetic size. Stored as a timed buff aura row.
        // Cite: SpellAuras.cpp:2182–2185.
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
          // durationMs 0 = permanent, the same read every other aura branch takes
          // (applySpell expAt). Strength of Ossirian 25176 is aura 79 + aura 61 on
          // DurationIndex 21: the scale row took one tick and took the whole spell with it.
          amount: eff.pct,
          expiresAt: eff.durationMs > 0 ? t + durFor(eff.durationMs) : Number.POSITIVE_INFINITY,
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'mod_detect_range') {
        // MOD_DETECT_RANGE (91) — Mind Soothe and Soothe Animal. The attack distance takes the total
        // aura modifier on the CREATURE, and a negative amount is hostile. Cite: Unit.cpp:11772.
        const amount = Number(eff.amount) || 0;
        const auraTgt = amount < 0 ? tgt : src;
        if (amount < 0 && !isEnemySide(tgt.side)) {
          // Hostile soothe needs an enemy; do not self-stick.
        } else {
          const dur = durFor(eff.durationMs);
          const exp = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
          // One (caster, spell, target) row — refresh and reverse prior detectRangeMod.
          const mine = rowsOn(auraTgt);
          for (let i = mine.length - 1; i >= 0; i--) {
            const e = mine[i]!;
            if (
              e.kind === 'buff'
              && e.spellId === spell.id
              && e.source === src.side
            ) {
              if (e.detectRangeAmount != null) {
                auraTgt.detectRangeMod = (auraTgt.detectRangeMod ?? 0) - e.detectRangeAmount;
              }
              const idx = effects.lastIndexOf(e);
              if (idx >= 0) effects.splice(idx, 1);
            }
          }
          auraTgt.detectRangeMod = (auraTgt.detectRangeMod ?? 0) + amount;
          auraTgt.buffActive.add(spell.id);
          effects.push({
            kind: 'buff',
            source: src.side,
            target: auraTgt.side,
            spellId: spell.id,
            name: spell.name,
            amount,
            detectRangeAmount: amount,
            expiresAt: exp,
          });
          push({
            t, kind: 'aura', actor: auraTgt.side, name: spell.name, applied: true, spellId: spell.id,
          });
          if (auraTgt.side !== src.side) {
            push({
              t, kind: 'spell_hit', actor: src.side, target: auraTgt.side,
              spellId: spell.id, name: spell.name, result: 'hit', amount: 0, school: spell.school,
            });
          }
          markFinisherHit();
        }
      } else if (eff.kind === 'mod_invisibility') {
        // SPELL_AURA_MOD_INVISIBILITY — stealth / invis. Cite: SpellAuras.cpp:2626–2675.
        src.buffActive.add(spell.id);
        const invisUntil = t + durFor(eff.durationMs);
        // Possess Inv 17250: invis + school immune + stun. Vanish is untargetable.
        // Cite: boss_baroness_anastari.cpp:37 SPELL_POSSESS_INV.
        if (isPossessInvSpell(spell.id)) {
          src.unattackableUntil = Math.max(src.unattackableUntil, invisUntil);
        }
        effects.push({
          kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
          amount: eff.amount, expiresAt: invisUntil,
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true, spellId: spell.id });
        markFinisherHit();
      } else if (eff.kind === 'track_creatures') {
        // SPELL_AURA_TRACK_CREATURES — minimap. Cite: SpellAuras.cpp:2152–2161.
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
          amount: eff.trackFlag || eff.creatureType, expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'channel_death_item') {
        // Apply is a no-op; shards ride the DoT. Cite: SpellAuras.cpp:2072; sessionDeaths.ts:246.
        markFinisherHit();
      } else if (eff.kind === 'leap') {
        // LEAP (29) — a near-teleport of radiusYd along the facing. The facing is the foe when hostile,
        // else the move intent, else +x. Cite: SpellEffects.cpp:4895–4906.
        const dist = (spell.radiusYd != null && spell.radiusYd > 0) ? spell.radiusYd : 0;
        const foe = typeof foeOf === 'function' ? foeOf(src) : null;
        let faceToward = foe && foe.side !== src.side ? posOf?.(foe.side) : undefined;
        if (!faceToward && typeof L.moveIntentOf === 'function' && typeof posOf === 'function') {
          const intent = L.moveIntentOf(src.side) as { x: number; y: number } | null | undefined;
          const from = posOf(src.side) as { x: number; y: number } | undefined;
          if (intent && from) faceToward = { x: from.x + intent.x, y: from.y + intent.y };
        }
        applyLeapEffect({
          t,
          spell,
          actor: src.side,
          distanceYd: dist,
          faceToward,
          posOf,
          setPos,
          displaced,
          clampLanding: (from, dest) => clampDisplacementToFloor(from, dest, displaceFloorFromCfg(cfg)),
          push,
        });
        markFinisherHit();
      } else if (eff.kind === 'trade_skill') {
        // Profession open — OOC utility; emit flavor so the cast is observable.
        push({
          t, kind: 'flavor',
          text: `${src.spec.name} works a trade skill.`,
        });
        markFinisherHit();
      } else if (eff.kind === 'inebriate') {
        // Alcohol: apply drunkMod on player fighters. Cite: EffectInebriate; KI-734.
        const mod = Number((eff as { drunkMod?: number }).drunkMod) || 0;
        if (mod > 0 && src.side === 'player') {
          const cur = Math.max(0, Math.min(0xFFFF, (src.spec.drunkValue ?? 0) | 0));
          src.spec.drunkValue = Math.min(0xFFFF, cur + Math.trunc(mod));
        }
        push({
          t, kind: 'flavor',
          text: `${src.spec.name} feels tipsy.`,
        });
        markFinisherHit();
      } else if (eff.kind === 'mod_skill') {
        // MOD_SKILL / MOD_SKILL_TALENT — a live ModifySkillBonus on the target. Permanent talent ranks
        // are baked at build, but an equip or temp aura applied mid-fight still has to raise the value.
        const skillId = ((eff as { skillId?: number }).skillId ?? 0) | 0;
        const amount = ((eff as { amount?: number }).amount ?? 0) | 0;
        if (skillId && amount) {
          const bonuses = { ...(src.spec.skillBonuses ?? {}) };
          bonuses[skillId] = (bonuses[skillId] ?? 0) + amount;
          src.spec.skillBonuses = bonuses;
          const pureWeapon = (id: number): number => {
            const row = src.spec.combatSkills?.[id];
            if (row) return row.current | 0;
            // Legacy absent map → L×5 pure.
            return Math.max(1, (src.spec.level | 0) * 5);
          };
          if (skillId === 95 /* SKILL_DEFENSE */) {
            src.spec.defenseSkill = pureWeapon(skillId) + (bonuses[skillId] ?? 0);
          } else {
            if (src.spec.weaponSkillId === skillId) {
              src.spec.weaponSkill = pureWeapon(skillId) + (bonuses[skillId] ?? 0);
            }
            if (src.spec.offhandSkillId === skillId) {
              src.spec.offhandWeaponSkill = pureWeapon(skillId) + (bonuses[skillId] ?? 0);
            }
            if (src.spec.rangedSkillId === skillId) {
              src.spec.rangedWeaponSkill = pureWeapon(skillId) + (bonuses[skillId] ?? 0);
            }
          }
          src.buffActive.add(spell.id);
          effects.push({
            kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
            amount, expiresAt: t + durFor((eff as { durationMs?: number }).durationMs || 15_000),
          });
          push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        }
        markFinisherHit();
      } else if (
        eff.kind === 'summon_wild'
        || eff.kind === 'summon_guardian'
        || eff.kind === 'summon_demon'
        || eff.kind === 'summon_possessed'
        || eff.kind === 'summon_pet'
      ) {
        // SUMMON* (28/41/42/56/73/112) — a creature body on the caster's own side, once per cast
        // however many effect slots or AoE targets this pass covers.
        const made = runCastSummons(src, spell);
        if (made.length > 0) {
          const label = made.length > 1 ? `${made[0]!.spec.name} x${made.length}` : made[0]!.spec.name;
          push({ t, kind: 'flavor', text: `${src.spec.name} summons ${label}.` });
        } else if (eff.kind === 'summon_guardian') {
          // No body landed (no resolveSummon, unknown entry, roster full): the old
          // stand-in still pulls focus off the caster so Target Dummy reads as doing something.
          for (const foe of livingHostilesFor(src)) {
            const tm = threatOf(foe);
            if (tm) tm.addThreatDirectly(src.side, -2000, false);
          }
        }
        markFinisherHit();
      } else if (
        eff.kind === 'transmitted_object'
        || eff.kind === 'summon_object_slot'
        || eff.kind === 'enchant_held_item'
        || eff.kind === 'sanctuary'
        || eff.kind === 'mod_health_regen_percent'
        || eff.kind === 'skill_step'
        || eff.kind === 'skill_marker'
        || eff.kind === 'mod_stalked'
        || eff.kind === 'mod_language'
        || eff.kind === 'force_reaction'
        || eff.kind === 'prevents_fleeing'
        || eff.kind === 'teleport_face_caster'
        || eff.kind === 'add_farsight'
        || eff.kind === 'summon_change_item'
        || eff.kind === 'script_handled_noop'
        // Feed Pet is OOC (CheckCast pet combat); IR marker only in combat.
        // Cite: Spell.cpp:5332–5355; EffectFeedPet; KI-854.
        || eff.kind === 'feed_pet'
      ) {
        // Utility / world / skill surfaces — aura or flavor so the cast is observable.
        // Cite: SpellEffects / SpellAuras for each kind.
        const auraKinds = new Set([
          'sanctuary', 'mod_health_regen_percent', 'mod_stalked', 'mod_language',
          'force_reaction', 'prevents_fleeing',
        ]);
        if (auraKinds.has(eff.kind)) {
          // mod_stalked tracks the judged foe; mod_language and prevents_fleeing land on the enemy the
          // curse names, never as a caster self-buff (KI-765).
          const utilityHostile = (
            eff.kind === 'mod_language' || eff.kind === 'prevents_fleeing'
          ) && (
            (eff as { hostile?: boolean }).hostile === true
            || spell.effects.some((e) => e.kind === 'buff' && isHostileBuffEffect(e, e.amount ?? 0))
          );
          const tgtUnit = (eff.kind === 'mod_stalked' || utilityHostile) ? tgt : src;
          // Track-unit only. When the same spell also carries a real combat mod, do NOT seed a no-mod
          // effect: that trips the sheet-baked path and the attack-power rider never lands.
          const skipHollowStalked =
            eff.kind === 'mod_stalked'
            && spell.effects.some((e) => e.kind === 'buff' && e.mod != null);
          const skipHollowUtility =
            utilityHostile
            && spell.effects.some((e) => e.kind === 'buff' && e.mod != null);
          if (!skipHollowStalked && !skipHollowUtility) {
            tgtUnit.buffActive.add(spell.id);
            effects.push({
              kind: 'buff', source: src.side, target: tgtUnit.side, spellId: spell.id, name: spell.name,
              amount: (eff as { amount?: number }).amount ?? 0,
              expiresAt: t + durFor((eff as { durationMs?: number }).durationMs || 15_000),
            });
            push({ t, kind: 'aura', actor: tgtUnit.side, name: spell.name, applied: true });
          }
          // Vanish OnCast: Clean Escape 23582 → heal 23583. Cite: Rogue.cpp:87–88.
          if (
            eff.kind === 'sanctuary'
            && (eff as { vanishRogueSpecial?: boolean }).vanishRogueSpecial
            && src.buffActive.has(CLEAN_ESCAPE_AURA_SPELL_ID)
          ) {
            // spell_template 23583 EffectHeal bp 499 → 500.
            const before = src.hp;
            src.hp = Math.min(src.spec.maxHealth, src.hp + 500);
            if (src.hp !== before) {
              push({ t, kind: 'heal', actor: src.side, amount: src.hp - before });
            }
          }
        } else {
          push({
            t, kind: 'flavor',
            text: `${src.spec.name} uses ${spell.name}.`,
          });
        }
        markFinisherHit();
      } else if (eff.kind === 'threat') {
        // THREAT (63) — a flat AddThreat on the enemy's list for the caster. Cast on a specific enemy
        // it touches only that manager; otherwise every living one, which is the totem path.
        const threatTgt = isEnemySide(tgt.side) ? tgt : undefined;
        applyFlatThreat(src, eff.amount, spell, threatTgt);
        // spell_threat flat (Distracting Shot row amount 100) rides the same hit.
        // Cite: Spell.cpp HandleThreatSpells; spell_threat.threat.
        if (threatTgt) applySpellThreatBonus(src, spell, threatTgt, state.hitCount);
        else applySpellThreatBonus(src, spell, undefined, state.hitCount);
        // Combat log: pure THREAT has no damage row — still attribute the cast (KI-746).
        if (threatTgt) {
          push({
            t, kind: 'spell_hit', actor: src.side, target: threatTgt.side,
            spellId: spell.id, name: spell.name, result: 'hit', amount: 0, school: spell.school,
          });
        }
        markFinisherHit();
      } else if (eff.kind === 'taunt') {
        // SPELL_EFFECT_ATTACK_ME (114) — EffectTaunt equalize + force victim.
        // Cite: SpellEffects.cpp:3413–3435. Wave 4A: taunt the targeted enemy only.
        if (isEnemySide(tgt.side)) {
          const tm = threatOf(tgt);
          if (tm) tm.applyTaunt(src.side, false);
          // spell_threat flat rides the taunt hit too (Growl bakes 415 flat) —
          // HandleThreatSpells applies on any negative spell hit, not only damage.
          applySpellThreatBonus(src, spell, tgt, state.hitCount);
          // Combat log: a pure ATTACK_ME has no damage or aura row, so attribute the cast to the caster
          // anyway or an ally tank kit never appears in the fight log.
          push({
            t, kind: 'spell_hit', actor: src.side, target: tgt.side,
            spellId: spell.id, name: spell.name, result: 'hit', amount: 0, school: spell.school,
          });
          markFinisherHit();
        }
      } else if (eff.kind === 'mod_taunt') {
        // MOD_TAUNT (11) — a TauntUpdate hold for the duration, distinct from the EffectTaunt equalize.
        // Cite: SpellAuras.cpp:2860–2875; ThreatManager.cpp:557–575.
        if (isEnemySide(tgt.side)) {
          const dur = durFor(eff.durationMs);
          const exp = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
          // One (caster, spell, target) hold at a time — refresh like other auras.
          const mine = rowsOn(tgt);
          for (let i = mine.length - 1; i >= 0; i--) {
            const e = mine[i]!;
            if (
              e.kind === 'mod_taunt'
              && e.spellId === spell.id
              && e.source === src.side
            ) {
              const idx = effects.lastIndexOf(e);
              if (idx >= 0) effects.splice(idx, 1);
            }
          }
          const tm = threatOf(tgt);
          if (tm) {
            const row = applyModTauntAura(tm, src, tgt, spell.id, spell.name, exp);
            if (row) effects.push(row);
          }
        }
      } else if (eff.kind === 'restore_health' || eff.kind === 'restore_power') {
        // PERIODIC_MANA_LEECH bakes as restore_power with a negative per-tick amount, so apply it as a
        // hostile periodic on the target rather than a self restore (KI-101).
        if (eff.kind === 'restore_power' && eff.amountPerTick < 0 && eff.pctOfMax == null) {
          const dur = durFor(eff.durationMs);
          // DurationIndex 21 (−1 infinite) → until-cancelled, same as speed/reflect.
          // Cite: duration.ts FALLBACK 21; SpellAuras.cpp:1031–1042 Nitrous until mana runs out.
          const exp = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
          const tickMs = Math.max(1, eff.tickMs);
          // hostile:false → self maintain cost (Nitrous); default → foe leech (Viper Sting).
          // Cite: schema restore_power.hostile; SpellAuras.cpp:1031–1042.
          const drainTgt = eff.hostile === false ? src : tgt;
          // One (caster, spell, target) leech at a time — refresh like DoTs.
          const mine = rowsOn(drainTgt);
          for (let i = mine.length - 1; i >= 0; i--) {
            const e = mine[i]!;
            if (
              e.kind === 'restore_power'
              && e.spellId === spell.id
              && e.source === src.side
            ) {
              const idx = effects.lastIndexOf(e);
              if (idx >= 0) effects.splice(idx, 1);
            }
          }
          const manaLeechMult =
            typeof eff.leechMultiple === 'number' && eff.leechMultiple > 0
              ? eff.leechMultiple
              : undefined;
          effects.push({
            kind: 'restore_power',
            source: src.side,
            target: drainTgt.side,
            spellId: spell.id,
            name: spell.name,
            amountPerTick: eff.amountPerTick,
            // The pool drained is the effect's own, not the victim's primary bar. Cite: :4746-4753.
            ...(eff.powerType != null ? { powerType: eff.powerType | 0 } : {}),
            tickMs,
            nextTickAt: t + tickMs,
            expiresAt: exp,
            // Drain Mana transfers; Viper Sting leaves this unset (pure drain). KI-702.
            ...(manaLeechMult != null ? { leechMultiple: manaLeechMult } : {}),
          });
          push({ t, kind: 'aura', actor: drainTgt.side, name: spell.name, applied: true });
          markFinisherHit();
        } else {
          // A periodic HoT or power regen applies as a lasting effect the sweep ticks, never one lump
          // sum. A pet-targeted funnel sits on the pet; a friendly HoT follows selected-or-self.
          const restoreTgt = (() => {
            // PERIODIC_ENERGIZE sits on GetTarget(), not the caster, and a self-cast simply makes the
            // two the same. Cite: SpellAuras.cpp:4809-4844; boss_vaelastrasz.cpp:153.
            if (eff.kind === 'restore_power') return tgt;
            if (eff.kind !== 'restore_health') return src;
            const applyTo = resolveHealApplyTo(spell, eff);
            if (applyTo === 'pet' || roleOf(spell) === 'pet_heal') {
              return resolvePetHealFighter(src, sideFighter, pet, dead, isAllySide);
            }
            if (applyTo === 'self') return src;
            // TARGET_UNIT_FRIEND is the selected unit, not heal triage. Cite: Spell.cpp:2298-2306.
            const pinned = src.friendlyPin ? sideFighter(src.friendlyPin) : null;
            return selectedOrSelfFriendly(src, tgt, pinned, dead, isEnemySide);
          })();
          if (!restoreTgt || dead(restoreTgt)) return;
          // Essence of the Red has three energize rows and the C++ skips a power the unit has no max
          // of. The pool comes off the effect; rawEffects is the fallback for a pre-powerType bake.
          // No x10 rage conversion here: the interpreter already did it when it rebuilt these
          // effects, and doing it twice read 2 rage a second instead of 20.
          let restorePower: number | undefined;
          if (eff.kind === 'restore_power') {
            if (eff.powerType != null) restorePower = eff.powerType | 0;
            else {
              const idx = spell.effects.indexOf(eff);
              const misc = idx >= 0 ? spell.rawEffects?.[idx]?.miscValue : undefined;
              if (misc != null) restorePower = misc | 0;
            }
            // GetMaxPower(power) == 0 → the aura never lands. Cite: SpellAuras.cpp:4838.
            if (restorePower != null && maxPowerOfType(restoreTgt, restorePower) <= 0) return;
          }
          const dur = durFor(eff.durationMs);
          if (dur <= 0) return;
          const tickMs = Math.max(1, eff.tickMs);
          const amountPerTick = Math.max(0, eff.amountPerTick);
          const pctOfMax = eff.pctOfMax != null && eff.pctOfMax > 0 ? Math.trunc(eff.pctOfMax) : undefined;
          const live = rowsOn(restoreTgt).find(
            (e) => e.kind === eff.kind && e.spellId === spell.id,
          );
          if (live) {
            // Refresh: reset duration + tick schedule (DoT refresh pattern).
            live.amountPerTick = amountPerTick;
            live.pctOfMax = pctOfMax;
            live.tickMs = tickMs;
            live.nextTickAt = t + tickMs;
            live.expiresAt = t + dur;
            if (setEffectSource) setEffectSource(live, src.side); else live.source = src.side;
            live.name = spell.name;
            if (restorePower != null) live.powerType = restorePower;
            touchEffect(live);
          } else {
            effects.push({
              kind: eff.kind, source: src.side, target: restoreTgt.side,
              spellId: spell.id, name: spell.name,
              amountPerTick, pctOfMax, tickMs, nextTickAt: t + tickMs,
              ...(restorePower != null ? { powerType: restorePower } : {}),
              expiresAt: t + dur,
            });
          }
          restoreTgt.buffActive.add(spell.id);
          push({ t, kind: 'aura', actor: restoreTgt.side, name: spell.name, applied: true });
        }
      } else if (eff.kind === 'seal') {
        // Cast a paladin seal (only one at a time). Drop any existing seal, arm the new one, and
        // mirror it as a self-buff so the rotation/UI see it as present (drives seal upkeep).
        if (src.activeSeal && src.activeSeal.spellId !== spell.id) {
          const old = src.activeSeal.spellId;
          src.buffActive.delete(old);
          for (const e of rowsOn(src)) if (e.kind === 'buff' && e.spellId === old) { e.expiresAt = Math.min(e.expiresAt, t); touchEffect(e); }
        }
        src.activeSeal = {
          spellId: spell.id, name: spell.name, seal: eff.seal, coeff: eff.coeff, procPpm: eff.procPpm,
          onSwingWeaponPct: eff.onSwingWeaponPct, onSwingHeal: eff.onSwingHeal, onSwingMana: eff.onSwingMana,
          judge: eff.judge, expiresAt: t + eff.durationMs,
        };
        src.buffActive.add(spell.id);
        effects.push({ kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name, expiresAt: t + eff.durationMs });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
      } else if (eff.kind === 'weapon_imbue') {
        // The temp enchant lands on the main hand by default, or the off-hand when the fighter targets
        // it. A refresh strips the previous hand's AP first. Pending is the one-shot and wins.
        const hand: 'mainhand' | 'offhand' = src.pendingWeaponImbueHand
          ?? (src.spec.weaponImbueCastHand === 'offhand' ? 'offhand' : 'mainhand');
        // One-shot pending hand so a later cast defaults back to MH unless re-armed.
        if (src.pendingWeaponImbueHand) src.pendingWeaponImbueHand = undefined;
        const prev = src.weaponImbues[hand];
        if (prev) {
          // The old enchant's TYPE_EQUIP_SPELL aura goes with it, so a swapped oil leaves no
          // passive behind. Cite: Player.cpp:11299-11310 RemoveAurasDueToItemSpell.
          const goneIds = prev.equipSpellId
            ? [prev.spellId, prev.equipSpellId]
            : [prev.spellId];
          for (const id of goneIds) src.buffActive.delete(id);
          if (prev.attackPower) src.attackPower = Math.max(0, src.attackPower - prev.attackPower);
          for (const e of rowsOn(src)) {
            if (e.kind === 'buff' && e.spellId != null && goneIds.includes(e.spellId)) {
              e.expiresAt = Math.min(e.expiresAt, t);
              touchEffect(e);
            }
          }
          if (prev.spellId !== spell.id) {
            push({ t, kind: 'aura', actor: src.side, name: prev.name, applied: false });
          }
        }
        const imbue: ActiveWeaponImbue = {
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + eff.durationMs,
          enchantId: eff.enchantId,
          family: eff.family,
          attackPower: eff.attackPower,
          equipSpellId: eff.equipSpellId,
          combatChancePct: eff.combatChancePct,
          combatPpm: eff.combatPpm,
          damageFlat: eff.damageFlat,
          rockbiterAmount: eff.rockbiterAmount,
          combat: eff.combat,
        };
        src.weaponImbues[hand] = imbue;
        if (eff.attackPower) src.attackPower += eff.attackPower;
        src.buffActive.add(spell.id);
        // Refresh duration on existing buff effect when re-applying same imbue.
        const liveImbueBuff = rowsOn(src).find(
          (e) => e.kind === 'buff' && e.spellId === spell.id,
        );
        if (liveImbueBuff) {
          liveImbueBuff.expiresAt = t + eff.durationMs;
          touchEffect(liveImbueBuff);
        } else {
          effects.push({
            kind: 'buff', source: src.side, target: src.side,
            spellId: spell.id, name: spell.name, expiresAt: t + eff.durationMs,
          });
        }
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
      } else if (eff.kind === 'judgement') {
        // Judgement consumes the active seal and unleashes its payload; with no seal up it is inert.
        // A damage seal is a holy burst, a utility seal a debuff whose on-hit proc pays the striker.
        const seal = src.activeSeal;
        if (!seal) return;
        src.activeSeal = null;
        src.buffActive.delete(seal.spellId);
        for (const e of rowsOn(src)) if (e.kind === 'buff' && e.spellId === seal.spellId) { e.expiresAt = Math.min(e.expiresAt, t); touchEffect(e); }
        push({ t, kind: 'aura', actor: src.side, name: seal.name, applied: false });
        const j = seal.judge;
        if (j) {
          const tgtTotem = totemRefusesNegativeAuraApply(
            tgt.creatureType ?? tgt.spec.creatureType,
            true,
          ) || isTotemSide(tgt.side);
          // JoL and JoW apply or refresh the on-hit debuff on the target, with no direct damage. A
          // totem refuses the aura index while the script effect still fires.
          if (!tgtTotem && j.debuffSpellId && (j.onHitHeal || j.onHitMana)) {
            const debuffName = j.debuffName ?? (j.onHitHeal ? 'Judgement of Light' : 'Judgement of Wisdom');
            const debuffDur = j.debuffDurationMs ?? 10_000;
            // One JoL/JoW family at a time on the target (refresh or replace prior judgement debuff).
            for (const e of rowsOn(tgt)) {
              if (
                e.kind === 'proc_trigger_spell'
                && (e.onHitHeal != null || e.onHitMana != null)
              ) {
                e.expiresAt = Math.min(e.expiresAt, t);
                touchEffect(e);
              }
            }
            const live = rowsOn(tgt).find(
              (e) =>
                e.kind === 'proc_trigger_spell'
                && e.spellId === j.debuffSpellId
                && e.expiresAt > t,
            );
            if (live) {
              live.expiresAt = t + debuffDur;
              live.onHitHeal = j.onHitHeal;
              live.onHitMana = j.onHitMana;
              live.name = debuffName;
              touchEffect(live);
            } else {
              effects.push({
                kind: 'proc_trigger_spell',
                source: src.side,
                target: tgt.side,
                spellId: j.debuffSpellId,
                name: debuffName,
                // Intermediate 5373/1826 is empty in the bake; onHit* is the real consumer.
                // Cite: Paladin.cpp JoL/JoW intermediate scripts; accepted JoC bake-gap pattern.
                triggerSpellId: 0,
                onHitHeal: j.onHitHeal,
                onHitMana: j.onHitMana,
                expiresAt: t + debuffDur,
                nextProcAt: 0,
              });
            }
            push({ t, kind: 'aura', actor: tgt.side, name: debuffName, applied: true });
          }

          // Judgement of the Crusader is a hostile MOD_DAMAGE_TAKEN — flat spell and holy taken.
          // Cite: Paladin.cpp:78–116 spell_judgement; SpellAuras.cpp SPELL_AURA_MOD_DAMAGE_TAKEN.
          if (!tgtTotem && j.debuffSpellId && j.spellTaken != null && j.spellTaken !== 0) {
            const debuffName = j.debuffName ?? 'Judgement of the Crusader';
            const debuffDur = j.debuffDurationMs ?? 10_000;
            const amount = j.spellTaken;
            // One JoC-family (spell_taken from a Judgement of the Crusader) at a time.
            for (const e of rowsOn(tgt)) {
              if (
                e.kind === 'buff'
                && e.mod === 'spell_taken'
                && e.spellId != null
                && (
                  e.spellId === 21183 || e.spellId === 20188 || e.spellId === 20300
                  || e.spellId === 20301 || e.spellId === 20302 || e.spellId === 20303
                  || (e.name != null && /Judgement of the Crusader/i.test(e.name))
                )
              ) {
                if (e.amount) reverseBuffMod(tgt, 'spell_taken', e.amount);
                e.expiresAt = Math.min(e.expiresAt, t);
                tgt.buffActive.delete(e.spellId);
                touchEffect(e);
              }
            }
            const live = rowsOn(tgt).find(
              (e) =>
                e.kind === 'buff'
                && e.spellId === j.debuffSpellId
                && e.expiresAt > t,
            );
            if (live && live.kind === 'buff') {
              if (live.mod === 'spell_taken' && live.amount) {
                reverseBuffMod(tgt, 'spell_taken', live.amount);
              }
              live.expiresAt = t + debuffDur;
              live.mod = 'spell_taken';
              live.amount = amount;
              live.name = debuffName;
              touchEffect(live);
              applyBuffMod(tgt, 'spell_taken', amount);
            } else {
              effects.push({
                kind: 'buff',
                source: src.side,
                target: tgt.side,
                spellId: j.debuffSpellId,
                name: debuffName,
                mod: 'spell_taken',
                amount,
                expiresAt: t + debuffDur,
              });
              applyBuffMod(tgt, 'spell_taken', amount);
            }
            tgt.buffActive.add(j.debuffSpellId);
            push({ t, kind: 'aura', actor: tgt.side, name: debuffName, applied: true });
          }

          // JoR / Judgement of Command direct holy burst (max > 0). Cite: Judgement of Righteousness/Command carriers.
          if (j.max > 0) {
            // Paladin.cpp:115 TRIGGERED_IGNORE_HIT_CALCULATION → Spell.cpp:458/951 SPELL_MISS_NONE.
            const skipHit = triggeredSpellIgnoresHitResult(JUDGEMENT_PAYLOAD_TRIGGER_FLAGS);
            let landed = true;
            if (!skipHit) {
              const land = spellDamageLandChance({
                atkLevel: src.spec.level,
                defLevel: tgt.spec.level,
                school: j.school,
                resistance: tgt.resistances[j.school] ?? 0,
                binary: false,
                spellHitBonusPercent: src.spellHitBonusPercent,
                aoeAvoidancePercent: spell.aoe ? (tgt.aoeAvoidancePercent ?? 0) : 0,
                attackerPlayerControlled: src.side === 'player' || src.side === 'pet' || isAllySide(src.side),
                victimIsNpc: isEnemySide(tgt.side),
                victimPlayerControlled: tgt.side === 'player' || tgt.side === 'pet' || isAllySide(tgt.side),
              });
              landed = rng.chance(land);
            }
            if (!landed) {
              push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result: 'miss', amount: 0, school: j.school });
            } else {
              let raw = rollBetween(j.min, j.max, rng.next());
              // Judgement of Command hits for half unless the target is stunned (cmangos JudgementOfCommand).
              if (j.halveIfNotStunned && !(tgt.stunnedUntil > t)) raw = raw / 2;
              const payload = j.spellId != null
                ? src.spec.spells.find((s) => s.id === j.spellId)
                : undefined;
              const crit = spellCanCrit(payload ?? { rawEffects: [{ effect: SPELL_EFFECT_SCHOOL_DAMAGE }] })
                && rng.chance(spellCritChance(fighterSpellCrit(src), src.spec.level, tgt.spec.level, spell.dmgClass));
              if (crit) raw *= critMultiplierWithVersus(TUNING.spellCritMult, src.critDamageVersusPct, tgt.creatureType);
              const dmgPct = src.damagePctBySchool[j.school] ?? 0;
              if (dmgPct) raw *= (1 + dmgPct / 100);
              const amount = dealDamage(tgt, raw, j.school, src.spec.level, {
                binary: false, damageType: 'spell', attacker: src,
              });
              push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result: crit ? 'crit' : 'hit', amount, school: j.school });
              if (amount > 0) {
                triggerProcs(src, tgt, !!crit, 'spell', spell);
                rollGearProcs(src, tgt, crit ? 'crit' : 'hit', spell);
              }
            }
          }
        }
      } else if (eff.kind === 'shapeshift') {
        // Form enter/toggle. FORM_STEALTH pairs with a stealth effect on the same spell —
        // only set the stance bit when entering (toggle-off is handled by the stealth effect).
        if (isStealthShapeshift(eff.form) && spell.effects.some((e) => e.kind === 'stealth')) {
          if (!src.stealthed) enterForm(src, eff.form, spell.name, spell.id);
          // if already stealthed, stealth effect below will break (toggle off)
        } else {
          enterForm(src, eff.form, spell.name, spell.id);
        }
        markFinisherHit();
      } else if (eff.kind === 'stealth') {
        // Classic toggle: recasting Stealth/Prowl while stealthed cancels the aura.
        if (src.stealthed) {
          breakStealth(src, 'toggle');
        } else {
          applyStealth(src, eff.strength, eff.durationMs, eff.breakFlags, spell);
        }
        markFinisherHit();
      } else if (eff.kind === 'stealth_level') {
        src.stealthLevelBonus += Math.max(0, eff.amount | 0);
        markFinisherHit();
      } else if (eff.kind === 'stealth_detect') {
        src.stealthDetectStrength += Math.max(0, eff.amount | 0);
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
          expiresAt: t + Math.max(0, eff.durationMs | 0),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'reset_cooldowns') {
        // Scripted dummy: finish cooldowns on a cluster of the caster's own spells, never the resetter
        // itself. It must `continue` on a non-match, or one miss aborts every later reset.
        let reset = 0;
        for (const cd of src.spec.spells) {
          if (cd.id === spell.id) continue; // never reset the resetter itself
          if (eff.scope === 'frost' && (cd.school !== 'frost' || getSpellRecoveryTime(cd) === 0)) continue;
          // rogue / hunter scopes: all other kit abilities (combatant list is class-scoped)
          const readyAt = src.cooldowns.get(cd.id) ?? 0;
          const catReadyAt = cd.category != null ? (src.categoryCooldowns.get(cd.category) ?? 0) : 0;
          if (readyAt <= t && catReadyAt <= t) continue;
          src.cooldowns.delete(cd.id);
          if (cd.category != null) src.categoryCooldowns.delete(cd.category);
          // A cooldown-on-event spell has not started its real timer yet, so the pending entry goes too
          // — otherwise the aura fading later re-stamps the cooldown a reset just cleared.
          src.deferredCooldowns?.delete(cd.id);
          src.deferredCategoryCooldowns?.delete(cd.id);
          reset++;
        }
        if (reset > 0) push({ t, kind: 'flavor', text: `${spell.name} resets ${reset} cooldown${reset === 1 ? '' : 's'}.` });
        markFinisherHit();
      } else if (eff.kind === 'split_damage') {
        // Soul Link redirects a percent of the caster's incoming damage to the pet. dealDamage already
        // consumes the split; this just arms it. A toggle for the fight, and it needs a live pet.
        if (pet && !dead(pet)) {
          src.splitDamage = { schoolMask: eff.schoolMask, pct: eff.pct, linkedTargetId: pet.side, id: spell.id };
          src.buffActive.add(spell.id);
          effects.push({ kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name, expiresAt: t + durFor(eff.durationMs) });
          push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        }
        markFinisherHit();
      } else if (eff.kind === 'split_damage_flat') {
        // Blessing of Sacrifice: the aura sits on a friendly and the damage splits to the caster.
        // Casting it on yourself is a no-op in the C++, so it needs a living ally.
        const splitTgt = livingFriendlies().find((f) => f.side !== src.side) ?? null;
        if (splitTgt && !dead(splitTgt) && splitTgt.side !== src.side) {
          splitTgt.splitDamageFlat = {
            schoolMask: eff.schoolMask,
            amount: eff.amount,
            linkedTargetId: src.side,
            id: spell.id,
          };
          splitTgt.buffActive.add(spell.id);
          // Track as buff for expiry (same pattern as Soul Link split_damage).
          effects.push({
            kind: 'buff',
            source: src.side,
            target: splitTgt.side,
            spellId: spell.id,
            name: spell.name,
            expiresAt: t + durFor(eff.durationMs),
          });
          push({ t, kind: 'aura', actor: splitTgt.side, name: spell.name, applied: true });
        }
        markFinisherHit();
      } else if (eff.kind === 'resist_pushback') {
        // Concentration Aura / Barkskin pushback resist %. Cite: Spell.cpp:6817–6820.
        const pushPool = typeof L.friendlyPoolOf === 'function' ? L.friendlyPoolOf(src) : livingFriendlies();
        const pushTargets: Fighter[] =
          eff.applyTo === 'party'
            ? filterPartyFanByRadius(
              src,
              pushPool,
              spell,
              eff.applyTo,
              (a, b) => (typeof L.distanceBetween === 'function' ? L.distanceBetween(a, b) : undefined),
            )
            : [src];
        for (const pt of pushTargets) {
          pt.pushbackResistChance += eff.amount;
          pt.buffActive.add(spell.id);
          // amount = resist %; no BuffMod — expiry subtracts pushbackResistChance.
          effects.push({
            kind: 'buff',
            source: src.side,
            target: pt.side,
            spellId: spell.id,
            name: spell.name,
            expiresAt: t + durFor(eff.durationMs),
            amount: eff.amount,
          });
          push({ t, kind: 'aura', actor: pt.side, name: spell.name, applied: true });
        }
        markFinisherHit();
      } else if (eff.kind === 'mod_mechanic_resistance') {
        // Focused Casting / Hardiness — interrupt/stun resist %. Cite: Unit.cpp:4015–4031.
        const mechanic = eff.mechanic | 0;
        const amount = eff.amount | 0;
        if (mechanic && amount) {
          applyMechanicResist(src, mechanic, amount);
          src.buffActive.add(spell.id);
          const dur = durFor(eff.durationMs ?? 0);
          effects.push({
            kind: 'buff',
            source: src.side,
            target: src.side,
            spellId: spell.id,
            name: spell.name,
            expiresAt: dur > 0 ? t + dur : Number.POSITIVE_INFINITY,
            mechanicResist: { mechanic, amount },
          });
          push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        }
        markFinisherHit();
      } else if (eff.kind === 'healing_way_talent') {
        src.healingWayChancePct = eff.chancePct | 0;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: (eff.durationMs | 0) > 0 ? t + durFor(eff.durationMs) : Number.POSITIVE_INFINITY,
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'healing_way') {
        applyHealingWayStack(
          tgt,
          src,
          t,
          effects,
          push,
          eff.amountPct | 0,
          durFor(eff.durationMs),
          (eff.maxStacks | 0) || HEALING_WAY_MAX_STACKS,
          rowsOn(tgt),
        );
        markFinisherHit();
      } else if (eff.kind === 'blessing_of_light') {
        // Blessing of Light on friendly/party. Cite: Paladin.cpp:119–138.
        const bolRaw = typeof L.friendlyPoolOf === 'function' ? L.friendlyPoolOf(src) : livingFriendlies();
        const bolPool = filterPartyFanByRadius(
          src,
          bolRaw,
          spell,
          eff.applyTo,
          (a, b) => (typeof L.distanceBetween === 'function' ? L.distanceBetween(a, b) : undefined),
        );
        const bolTriage = typeof L.lowestHpFriendlyOf === 'function'
          ? L.lowestHpFriendlyOf(src)
          : lowestHpFriendly();
        const bolTargets: Fighter[] =
          eff.applyTo === 'party' ? bolPool
            : eff.applyTo === 'friendly' ? [bolTriage ?? src]
              : [src];
        for (const bt of bolTargets) {
          bt.blessingOfLight = {
            holyLight: eff.holyLight,
            flashOfLight: eff.flashOfLight,
            spellId: spell.id,
          };
          bt.buffActive.add(spell.id);
          effects.push({
            kind: 'buff',
            source: src.side,
            target: bt.side,
            spellId: spell.id,
            name: spell.name,
            expiresAt: t + durFor(eff.durationMs),
          });
          push({ t, kind: 'aura', actor: bt.side, name: spell.name, applied: true });
        }
        markFinisherHit();
      } else if (eff.kind === 'holy_shock') {
        // Holy Shock heals a friendly target or deals holy damage to a hostile one, branching on the
        // target reaction. Hostility is faction-relative — an enemy caster must not take the heal arm.
        const srcFac = typeof L.factionOfFighter === 'function'
          ? L.factionOfFighter(src)
          : (isEnemySide(src.side) ? 'enemy' : 'player');
        const tgtFac = typeof L.factionOfFighter === 'function'
          ? L.factionOfFighter(tgt)
          : (isEnemySide(tgt.side) ? 'enemy' : 'player');
        if (srcFac !== tgtFac) {
          const d = eff.damage;
          const spellCrit = fighterSpellCrit(src) + (src.castCritAdd ?? 0);
          // SpellEffects.cpp:1452 casts 25912 (SCHOOL_DAMAGE), not the parent DUMMY 20473.
          const crit = spellCanCrit({ rawEffects: [{ effect: SPELL_EFFECT_SCHOOL_DAMAGE }] })
            && rng.chance(spellCritChance(spellCrit, src.spec.level, tgt.spec.level, spell.dmgClass));
          let raw = rollBetween(d.min, d.max, rng.next());
          if (crit) raw *= critMultiplierWithVersus(TUNING.spellCritMult, src.critDamageVersusPct, tgt.creatureType);
          const dmgPct = src.damagePctBySchool[d.school] ?? 0;
          if (dmgPct) raw *= (1 + dmgPct / 100);
          const amount = dealDamage(tgt, raw, d.school, src.spec.level, { damageType: 'spell', attacker: src, spell, crit });
          push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name, result: crit ? 'crit' : 'hit', amount, school: d.school });
          if (amount > 0) applySpellThreatBonus(src, spell, tgt, state.hitCount);
        } else {
          const healTarget = (typeof L.lowestHpFriendlyOf === 'function'
            ? L.lowestHpFriendlyOf(src)
            : lowestHpFriendly()) ?? tgt;
          if (!dead(healTarget)) {
            const { amount, crit } = rollHeal(src, eff.heal.min, eff.heal.max);
            if (amount > 0) {
              healTarget.hp = Math.min(healTarget.spec.maxHealth, Math.round(healTarget.hp + amount));
              push({
                t, kind: 'heal', actor: healTarget.side, amount,
                source: src.side, name: spell.name, spellId: spell.id,
                ...(crit ? { crit: true } : {}),
              });
              applyHealThreat(src, amount, spell, healTarget.side);
            }
          }
        }
        markFinisherHit();
      } else if (eff.kind === 'combustion') {
        // Three FIRE CRITS, not three casts. The stack that slot 1 already triggered is counted
        // here so the buff bar and the crit mod agree. Cite: UnitAuraProcHandler.cpp:991-1003.
        src.combustionCharges = eff.charges;
        setCombustionStacks(src, eff, 1);
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
          expiresAt: t + (eff.durationMs > 0 ? durFor(eff.durationMs) : COMBUSTION_UNTIL_CANCELLED_MS),
          charges: eff.charges, stacks: 1,
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'sweeping_strikes') {
        // Arm the cleave counter the melee/strike path consumes. Cite: Sweeping Strikes 5-charge proc.
        src.sweepingStrikesCharges = eff.charges;
        src.buffActive.add(spell.id);
        effects.push({ kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name, expiresAt: t + durFor(eff.durationMs) });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'vampiric_embrace') {
        // Target debuff: shadow damage YOU deal to THIS target heals caster+party for pct%.
        // Not a self buff (KI-701). Cite: UnitAuraProcHandler.cpp:1015–1028; talent-scripted 15286.
        const until = t + durFor(eff.durationMs);
        const fromSrc = rowsFrom(src);
        for (let i = fromSrc.length - 1; i >= 0; i--) {
          const e = fromSrc[i]!;
          if (e.kind === 'buff' && e.spellId === spell.id) {
            const prev = (bySide?.(e.target) as Fighter | undefined)
              ?? (e.target === tgt.side ? tgt : e.target === src.side ? src : undefined);
            if (prev) {
              prev.vampiricEmbracePct = 0;
              prev.vampiricEmbraceCasterSide = undefined;
            }
            const idx = effects.lastIndexOf(e);
            if (idx >= 0) effects.splice(idx, 1);
          }
        }
        // Clear stale self-buff residual from older builds / OOC seed.
        src.vampiricEmbracePct = 0;
        src.buffActive.delete(spell.id);
        tgt.vampiricEmbracePct = eff.pct;
        tgt.vampiricEmbraceCasterSide = src.side;
        effects.push({
          kind: 'buff',
          source: src.side,
          target: tgt.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: until,
          hostile: true,
        });
        push({ t, kind: 'aura', actor: src.side, target: tgt.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'eye_for_an_eye') {
        // Self-aura: magic damage taken → reflect pct% (capped 50% max HP) via 25997.
        // Cite: UnitAuraProcHandler.cpp:795–808; cmangos-special-cases eyeForAnEyeReflectAmount.
        src.eyeForAnEyePct = eff.pct;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'oracle_healing_bonus') {
        // Self-aura: heals cast → self-heal pct% via 26170.
        // Cite: UnitAuraProcHandler.cpp:1046–1052 case 26169.
        src.oracleHealingBonusPct = eff.pct;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'obsidian_armor') {
        // Self-aura: non-physical school damage taken → school resist buff.
        // Cite: UnitAuraProcHandler.cpp:910–930 case 27539.
        src.obsidianArmorActive = true;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'adaptive_warding') {
        // Self-aura: non-physical/non-holy school damage taken under Mage Armor → resist buff.
        // Cite: UnitAuraProcHandler.cpp:870–907 case 28764.
        src.adaptiveWardingActive = true;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'class_power_set') {
        src.classPowerSetKind = eff.setKind;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'vestments_greater_heal') {
        src.vestmentsGreaterHealActive = true;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'dreamwalker_healing_touch') {
        src.dreamwalkerHealingTouchActive = true;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'idol_healing_touch_refund') {
        src.idolHealingTouchRefundActive = true;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'totem_lesser_healing_wave') {
        src.totemLesserHealingWaveActive = true;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'cheat_death') {
        src.cheatDeathActive = true;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'master_of_elements') {
        src.masterOfElementsPct = eff.pct;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'magic_absorption') {
        src.magicAbsorptionPct = eff.pct;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'ignite') {
        // Self-aura: fire damage dealt → DoT 12654 at rank%. Cite: UnitAuraProcHandler.cpp:970–985.
        src.igniteRankSpellId = eff.rankSpellId;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'deep_wounds') {
        // Self-aura: melee crit → DoT 12721 at weaponDamage×rank%/6.
        // Cite: UnitAuraProcHandler.cpp:1316–1342.
        src.deepWoundsRankSpellId = eff.rankSpellId;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'add_target_trigger') {
        // NoImmediateEffect: register holder; fire is applySpell ProcSpellAuraTriggers.
        // Cite: SpellAuras.cpp:170; Spell.cpp:7433–7468.
        const trig = eff.triggerSpellId | 0;
        if (!trig) return;
        const dur = durFor(eff.durationMs);
        const exp = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        src.addTargetTriggers = src.addTargetTriggers.filter((r) => r.spellId !== spell.id);
        src.addTargetTriggers.push({
          spellId: spell.id,
          triggerSpellId: trig,
          chancePct: eff.chancePct | 0,
          familyName: (eff.familyName ?? spell.spellFamilyName ?? 0) | 0,
          familyFlags: (eff.familyFlags ?? 0) | 0,
          expiresAt: exp,
        });
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: exp,
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'improved_sprint') {
        // Self-aura: on successful Sprint cast, chance% → cast 30918 (purge root+snare).
        // Cite: Spell.cpp:7433–7468 ProcSpellAuraTriggers; SpellEffects.cpp:4140–4147.
        src.improvedSprintChancePct = eff.chancePct | 0;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'pyroclasm') {
        // Self-aura: Hellfire/RoF ticks → chance stun 18093.
        // Cite: UnitAuraProcHandler.cpp:1347–1375.
        src.pyroclasmRankSpellId = eff.rankSpellId;
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff',
          source: src.side,
          target: src.side,
          spellId: spell.id,
          name: spell.name,
          expiresAt: t + durFor(eff.durationMs),
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'speed') {
        // A raw speed aura. Route by "is the target someone else", NOT by enemy side: written from the
        // player's seat, a creature's snare fell through and the caster snared itself.
        const isHostileSpeed = isHostileSpeedEffect(eff);
        // dest-at-src fear/nova primary can be the caster — do not self-apply the victim speed.
        const skipHostileOnSelf = isHostileSpeed
          && (tgt === src || isEnemySide(src.side) === isEnemySide(tgt.side));
        const snareTgt = skipHostileOnSelf ? src
          : isHostileSpeed && tgt !== src ? tgt : src;
        if (!skipHostileOnSelf) {
        // Snare immunity (Free Action / template mask). Cite: SharedDefines MECHANIC_SNARE=11.
        const speedMech = isHostileSpeed
          ? ((eff as { mechanic?: string }).mechanic || spell.mechanic || 'snare')
          : undefined;
        if (isHostileSpeed && snareTgt !== src && (
          isTotemCreatureType(snareTgt.creatureType)
          || isTotemCreatureType(snareTgt.spec.creatureType)
          || isTotemSide(snareTgt.side)
          || isImmuneToMechanic(snareTgt.immunity, speedMech!, {
            schoolImmuneMask: snareTgt.spec.schoolImmuneMask,
            mechanicImmuneMask: snareTgt.spec.mechanicImmuneMask,
          })
        )) {
          consumeChargedImmunityOnMechanicBlock?.(snareTgt, speedMech!);
          push({ t, kind: 'cc_immune', target: snareTgt.side, control: 'snare', name: spell.name });
          return;
        }
        const dur = durFor(eff.durationMs);
        const exp = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        const live = rowsOn(snareTgt).find(
          (e) => e.kind === 'speed' && e.spellId === spell.id && e.aura === eff.aura,
        );
        if (live) {
          live.expiresAt = exp; live.pct = eff.pct; live.hostile = isHostileSpeed; markSpeedDirty(snareTgt); touchEffect(live);
          if (state.heartbeat) { live.heartbeat = state.heartbeat; bumpEffectsVersion?.(); }
        } else {
          effects.push({
            kind: 'speed',
            source: src.side,
            target: snareTgt.side,
            spellId: spell.id,
            name: spell.name,
            aura: eff.aura,
            pct: eff.pct,
            hostile: isHostileSpeed,
            expiresAt: exp,
            ...(state.heartbeat ? { heartbeat: state.heartbeat } : {}),
          });
        }
        // Beneficial aspects / sprints show on the buff bar (not as debuffs).
        if (!isHostileSpeed) snareTgt.buffActive.add(spell.id);
        // The fade already logs `control: snare` (crowdControl.ts:936); without this the log carried
        // a Hamstring wearing off that nobody ever saw land.
        if (isHostileSpeed && !live) {
          push({ t, kind: 'control', target: snareTgt.side, control: 'snare', applied: true, name: spell.name });
        }
        push({ t, kind: 'aura', actor: snareTgt.side, name: spell.name, applied: true, spellId: spell.id });
        markFinisherHit();
        // Improved Sprint: a target trigger on a successful Sprint hit that removes root and snare.
        // Cite: Spell.cpp:7433–7468; SpellEffects.cpp:4140–4147; Unit.cpp:10562–10584.
        if (
          !isHostileSpeed
          && snareTgt === src
          && src.improvedSprintChancePct > 0
          && isSprintSpell(
            spell.id,
            spell.spellFamilyName,
            spell.spellFamilyFlags as number | undefined,
          )
          && improvedSprintShouldProc(src.improvedSprintChancePct, rng.next())
        ) {
          const trig =
            src.spec.spells.find((s) => s.id === IMPROVED_SPRINT_TRIGGER_SPELL_ID)
            ?? improvedSprintTriggerSpellDef();
          applySpell(src, src, trig);
        }
        }
      } else if (eff.kind === 'feather_fall') {
        // Slow Fall — register self aura (no movement sim in text combat).
        const dur = durFor(eff.durationMs);
        src.buffActive.add(spell.id);
        effects.push({
          kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
          expiresAt: dur > 0 ? t + dur : Number.POSITIVE_INFINITY,
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'hover') {
        // Levitate — SetHover / MOVEFLAG_HOVER. Cite: SpellAuras.cpp:1681–1688; Unit.cpp:12428.
        const dur = durFor(eff.durationMs);
        src.buffActive.add(spell.id);
        src.movementFlags = setHover(src.movementFlags ?? 0, true);
        effects.push({
          kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
          expiresAt: dur > 0 ? t + dur : Number.POSITIVE_INFINITY,
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'reflect') {
        // The spell-reflect self-buff, read back at incoming-magic time. A durationMs of 0 is
        // until-cancelled, so it lasts the fight, and a recast refreshes it.
        const dur = durFor(eff.durationMs);
        const exp = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        const live = rowsOn(src).find(
          (e) => e.kind === 'reflect' && e.spellId === spell.id && e.school === eff.school,
        );
        if (live) { live.expiresAt = exp; live.pct = eff.pct; touchEffect(live); }
        else {
          effects.push({
            kind: 'reflect', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
            school: eff.school, pct: eff.pct, expiresAt: exp,
          });
        }
        src.buffActive.add(spell.id);
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'dispel') {
        // SPELL_EFFECT_DISPEL. NOTHING_TO_DISPEL pure gate upstream (Spell.cpp:4890–4919; KI-610/120).
        // Success → strip + spell_hit. Cite: SpellEffects.cpp:2577–2594 EvaluateResultLists.
        const res = resolveDispelTarget(src, tgt, eff.dispelType);
        const releaseDispelClaim = (unitSide: string): void => {
          if (!dispelClaim) return;
          const key = dispelClaimKey(unitSide, eff.dispelType);
          if (dispelClaim.get(key) === src.side) dispelClaim.delete(key);
        };
        if (res) {
          const { unit, friendlyDispel } = res;
          const mask = getDispelMask(eff.dispelType);
          const candidates: DispellableAura[] = (dispellableAurasOn(unit, mask, friendlyDispel) as ActiveEffect[]).map((e: ActiveEffect) => ({
            spellId: e.spellId, dispelType: dispelTypeOfSpell(e.spellId), stacks: e.stacks ?? 1,
          }));
          const { success } = processDispelList(candidates, eff.count, rng);
          const removed = new Map<number, number>();
          for (const s of success) removed.set(s.spellId, (removed.get(s.spellId) ?? 0) + 1);
          let stripped = 0;
          for (const [spellId, n] of removed) { stripAuraOnDispel(unit, spellId, n); stripped += n; }
          if (stripped > 0) {
            push({ t, kind: 'spell_hit', actor: src.side, target: unit.side, spellId: spell.id,
              name: spell.name, result: 'hit', amount: stripped, school: spell.school });

            // Priest.cpp:80-86 SetHelpfulThreatCoefficient(0.5f).
            // Dispel Magic base threat rides applyHealThreat when friendly.
            if (friendlyDispel && (spell.id === 527 || spell.id === 988)) {
              applyHealThreat(src, 0, spell, unit.side);
            }

            // On success dispel, Devour Magic casts the rank's heal on the pet. Intent first, table fallback.
            // Cite: SpellEffects.cpp:2596-2612; SpellMgr.h SPELLCATEGORY_DEVOUR_MAGIC=12.
            let healSpellId = DEVOUR_MAGIC_HEAL[spell.id | 0];
            if (healSpellId || ((spell.category ?? 0) | 0) === SPELLCATEGORY_DEVOUR_MAGIC) {
              const intents = resolveSpellEffects(spell, { forceInterpreter: true }).intents ?? [];
              for (const intent of intents) {
                if (intent.kind === 'devour_magic_heal') {
                  healSpellId = intent.healSpellId;
                  break;
                }
              }
            }
            if (healSpellId) {
              const healSpell = L.spellOf?.(healSpellId);
              if (healSpell) {
                applySpell(src, src, healSpell);
              }
            }
          }
          releaseDispelClaim(unit.side);
        } else {
          releaseDispelClaim(tgt.side);
        }
        markFinisherHit();
      } else if (eff.kind === 'dispel_mechanic') {
        // SPELL_EFFECT_DISPEL_MECHANIC — strip HasMechanic(misc) holders on unitTarget.
        // Cite: SpellEffects.cpp:2499–2519; SpellAuras.cpp:5786–5794.
        const order = (L.fightersOrder?.() ?? [src, tgt]) as Fighter[];
        const lookup = (id: number): SpellDef | undefined => {
          for (const f of order) {
            const sp = f.spec.spells.find((s) => s.id === id);
            if (sp) return sp;
          }
          return undefined;
        };
        const stripped = applyDispelMechanicOnUnit(
          tgt, eff.mechanic, eff.count, effects, lookup, rng,
          (spellId, n) => stripAuraOnDispel(tgt, spellId, n),
        );
        if (stripped > 0) {
          push({ t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id,
            name: spell.name, result: 'hit', amount: stripped, school: spell.school });
        }
        markFinisherHit();
      } else if (eff.kind === 'mechanic_immunity_purge') {
        const purgeMechMask = eff.mechanicMask ?? 0;
        if (purgeMechMask > 0) {
          const dropIds = new Set<number>();
          for (const e of rowsOn(tgt)) {
            if (e.expiresAt <= t || e.broken) continue;
            // The spell applies the mask bit or the kind 'root'/'cc' defines it.
            // Since CC maps to mechanics directly, check the kind.
            if ((mechanicMaskOfLiveEffect(e) & purgeMechMask) !== 0) {
              dropIds.add(e.spellId);
            }
          }
          for (const spellId of dropIds) L.removeAurasDueToSpell?.(tgt, spellId);
        }
      } else if (eff.kind === 'combo_points') {
        addComboPoints(src, tgt, eff.amount); // Cite: EffectAddComboPoints.
        markFinisherHit();
      } else if (eff.kind === 'retain_combo_points') {
        // Self-aura expire strip CP. Cite: SpellAuras.cpp:4436–4452.
        const dur = durFor(eff.durationMs);
        const expAt = dur > 0 ? t + dur : Number.POSITIVE_INFINITY;
        const live = rowsOn(src).find(
          (e) => e.kind === 'buff' && e.spellId === spell.id && e.retainComboAmount != null,
        );
        if (live) {
          live.expiresAt = expAt;
          live.retainComboAmount = eff.amount;
          live.amount = eff.amount;
          touchEffect(live);
        } else {
          effects.push({
            kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
            expiresAt: expAt, retainComboAmount: eff.amount, amount: eff.amount,
          });
          src.buffActive.add(spell.id);
          push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        }
        markFinisherHit();
      } else if (eff.kind === 'lightwell') {
        // Place the well (Lightwell 724). It reactively renews the most-hurt friendly each interval
        // until its charges run out or it expires. Cite: Priest.cpp Lightwell / Renew 7001.
        src.lightwell = {
          charges: eff.charges, healPerCharge: eff.healPerCharge, intervalMs: eff.intervalMs,
          expiresAt: t + durFor(eff.durationMs), nextHealAt: t, spellId: spell.id,
        };
        src.buffActive.add(spell.id);
        effects.push({ kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name, expiresAt: t + durFor(eff.durationMs) });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'demonic_sacrifice') {
        // Cite: Warlock.cpp:214–234; applyDemonicSacrifice.ts; spell_template 18789–18792.
        applyDemonicSacrificeEffect({ src, pet, spell, eff, effects, t, durFor, dead, push });
        markFinisherHit();
      } else if (eff.kind === 'next_cast_mod') {
        // Arm a one-shot modifier the caster's next matching cast consumes, replacing any already
        // armed. A display aura carries the optional timeout; the cast site consumes it early.
        if (src.pendingSpellMod) consumePendingSpellMod(src);
        // One builder for every arming site, so the DBC 107/108 rows ride along and the mask —
        // not the appliesTo shorthand — decides what consumes this. Cite: roles.ts.
        src.pendingSpellMod = pendingSpellModFromResolved(spell) ?? {
          spellId: spell.id, name: spell.name, appliesTo: eff.appliesTo,
          critAdd: eff.critAdd, instant: !!eff.instant, freeCost: !!eff.freeCost,
          // costModPct = SPELLMOD_COST; never SpellDef.costPct (ManaCostPercentage).
          costModPct: eff.costModPct ?? eff.costPct, effectPct: eff.effectPct,
          castTimeFlat: eff.castTimeFlat,
          spellFamilyName: spell.spellFamilyName,
          familyFlags: eff.familyFlags,
        };
        const dur = eff.durationMs > 0 ? eff.durationMs : 600_000; // 0 = until consumed
        src.buffActive.add(spell.id);
        const charges = ((spell.procCharges ?? 0) > 0) ? spell.procCharges : 1;
        effects.push({
          kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
          expiresAt: t + dur, charges,
        });
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'owned_spell_mods') {
        // A lasting flat or percent modifier. Sibling buffs hold the display duration, and a holder is
        // still added when none exists. Cite: SpellAuras.cpp HandleAddModifier; Player.cpp AddSpellMod.
        addOwnedSpellMods(src, eff.mods.map((m) => ({
          spellId: spell.id,
          op: m.op,
          type: m.type,
          value: m.amount,
          familyName: spell.spellFamilyName,
          familyFlags: m.familyFlags,
        })));
        const dur = eff.durationMs > 0 ? eff.durationMs : 0;
        src.buffActive.add(spell.id);
        if (dur > 0 && !rowsOn(src).some((e) => e.kind === 'buff' && e.spellId === spell.id)) {
          effects.push({
            kind: 'buff', source: src.side, target: src.side, spellId: spell.id, name: spell.name,
            expiresAt: t + dur,
          });
        }
        push({ t, kind: 'aura', actor: src.side, name: spell.name, applied: true });
        markFinisherHit();
      } else if (eff.kind === 'pickpocket') {
        // PICKPOCKET (71): grant the loot and gold in-fight, down the same path as the OOC verb.
        // Vanilla does NOT break stealth. CheckCast gates on PickpocketLootId alone, which the
        // grant below reads — a creature-type test here refused the 253 undead, demon and totem
        // tables the bake carries. Cite: SpellEffects.cpp:2662–2706; Spell.cpp:5501-5511; KI-612.
        {
          const entry = (tgt.spec as { creatureEntry?: number }).creatureEntry
            ?? (tgt as { creatureEntry?: number }).creatureEntry
            ?? 0;
          const granted = entry > 0 && cfg?.onPickPocket
            ? cfg.onPickPocket(entry)
            : { ok: false as const, reason: 'no pickpocket host' };
          const dropN = (granted.drops ?? []).reduce((n: number, d: { count?: number }) => n + (d.count || 0), 0);
          const gold = granted.goldCopper ?? 0;
          if (granted.ok) {
            const bits: string[] = [];
            if (dropN > 0) bits.push(`${dropN} item(s)`);
            if (gold > 0) bits.push(moneyMarked(gold));
            push({
              t, kind: 'flavor', actor: src.side, spellId: spell.id,
              text: bits.length
                ? `${src.spec.name} picks ${tgt.spec.name}'s pocket (${bits.join(', ')}).`
                : `${src.spec.name} picks ${tgt.spec.name}'s pocket.`,
            });
          } else {
            push({
              t, kind: 'flavor', actor: src.side, spellId: spell.id,
              text: granted.reason
                ? `${spell.name} fails - ${granted.reason}.`
                : `${src.spec.name} picks ${tgt.spec.name}'s pocket.`,
            });
          }
          push({
            t, kind: 'spell_hit', actor: src.side, target: tgt.side, spellId: spell.id, name: spell.name,
            result: 'hit', amount: gold > 0 ? gold : dropN, school: spell.school,
          });
        }
        markFinisherHit();
      } else if (eff.kind === 'knock_back') {
        // SPELL_EFFECT_KNOCK_BACK (98). Materialized speeds → event + geometry push.
        // Cite: SpellEffects.cpp:5113–5121; combat/knockBack.ts; Unit.cpp KnockBackFrom.
        applyKnockBackEffect({
          t,
          spell,
          actor: src.side,
          target: tgt.side,
          horizontal: eff.horizontal,
          vertical: eff.vertical,
          now: t,
          targetRootedUntil: tgt.rootedUntil,
          posOf,
          setPos,
          displaced,
          clampLanding: (from, dest) => clampDisplacementToFloor(from, dest, displaceFloorFromCfg(cfg)),
          push,
        });
        markFinisherHit();
      } else if (eff.kind === 'pull_towards') {
        applyKnockBackEffect({
          t,
          spell,
          actor: src.side,
          target: tgt.side,
          horizontal: eff.speedXY,
          vertical: eff.speedZ ?? 0,
          now: t,
          targetRootedUntil: tgt.rootedUntil,
          posOf,
          setPos,
          displaced,
          clampLanding: (from, dest) => clampDisplacementToFloor(from, dest, displaceFloorFromCfg(cfg)),
          push,
        });
        markFinisherHit();
      } else if (eff.kind === 'destroy_all_totems') {
        // SPELL_EFFECT_DESTROY_ALL_TOTEMS (110) takes the CASTER's own four seats, never the party's.
        // Cite: SpellEffects.cpp:5204–5206 `m_caster->GetTotem(TotemSlot(slot))`.
        for (const tot of [...totems.values()]) {
          if ((tot.totemOwnerSide ?? 'player') !== src.side) continue;
          unsummonTotem(tot.side as TotemSide, 'owner');
        }
      }
    

}

