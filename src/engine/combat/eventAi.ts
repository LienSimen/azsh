// Peeled from createSession (Wave 4 S32 eventAi hub). Pattern (D).
// Uses local aliases so moved bodies stay nearly verbatim (determinism-safe).

import type { CombatContext } from './context.ts';
import type { Fighter } from './types.ts';
import { isAllySide, isEnemySide, type Side, type EnemySide } from '../core/events.ts';
import type { EventAiIntent } from '../../domain/creature/creatureAi.ts';
import { AURA_INTERRUPT } from '../../domain/spells/stealth.ts';
import {
  AI_EVENT_TYPE,
  AIEVENT_DEFAULT_THROW_RADIUS_YD,
  CAST_FLAG,
  EVENT_T,
  markEventAiUsed,
  processEventAiActions,
  processThrowAiEventDamageTaken,
  processThrowAiEventHealedBy,
  pulseEventAi,
  resolveCallForHelpRadius,
  rollEventAiChance,
  shouldThrowAiEventJustDied,
  stepEventAi,
} from '../../domain/creature/creatureAi.ts';
import {
  collectReachCastsDue,
  dataGatePasses,
  handleReceiveAiEvent,
  handleSpellHit,
  tickDieTimer,
  hasTrackedSummonSides,
  noteJustSummonedSide,
  planNonCharmAuraOnApply,
  scriptDevByCreature,
  tickScriptDev,
  noteScriptDevHitCount,
  lifecycleActions,
} from '../../domain/scriptdev/index.ts';
import { runEvadeLifecycle } from './evadeLifecycle.ts';
import { resetCreatureCastSlotsOnEvade, rearmCreatureCastSlotsOnPhase } from '../../domain/creature/creatureCastList.ts';
import type { ScriptDevAction, ScriptDevRuntimeState } from '../../domain/scriptdev/types.ts';
import { formatEventAiChatLine, lookupEventAiText } from '../../domain/creature/eventAiTexts.ts';
import { INSTANCE_DATA } from '../../domain/scriptdev/types.ts';
import {
  scriptTargetCreatureEntries,
  scriptTargetPickMode,
} from '../spells/scriptTargets.ts';
import {
  FLAMELASH_SPIRIT_DESPAWN_MS,
  FLAMELASH_SPIRIT_REACH_YD,
  NPC_AMBASSADOR_FLAMELASH,
  NPC_BURNING_SPIRIT,
  SPELL_BURNING_SPIRIT,
} from '../../domain/scriptdev/blackrockDepths.ts';
import { REACT_STATE } from '../../domain/creature/creatureAiConstants.ts';
import {
  NPC_STONESKIN_GARGOYLE_ENTRY,
  allowStoneskinGargoyleStoneForm,
} from '../../domain/scriptdev/naxxramas.ts';
import { navSightClear } from './navSight.ts';
import { maxPowerOfType, powerOfType, setPowerOfType } from './powerPools.ts';
import { planCastSummons } from './summonCast.ts';
import { durMs } from '../spells/interpreter/duration.ts';
import { EVENT_AI_TARGET_SELF } from '../../domain/creature/creatureAiConstants.ts';
import { pulsePartyCombat } from './combatFlag.ts';
import { emptySlowDiag, slowThinkDue, wakeForDecision, SLOW_IDLE_RATE } from './slowUpdate.ts';
import { UNIT_FLAG } from '../../domain/creature/unitFlags.ts';
import { emitSimEffect } from './simEffects.ts';

// Percent-mirror damage onto the twin partner. twinDamage = floor(damage / selfMax * partnerMax). Cite:
// boss_twinemperors.cpp:103-108.
export function mirrorDamagePercent(
  damage: number,
  selfMaxHealth: number,
  partnerMaxHealth: number,
): number {
  const selfMax = Math.max(1, selfMaxHealth | 0);
  const partnerMax = Math.max(1, partnerMaxHealth | 0);
  return Math.floor((damage / selfMax) * partnerMax);
}

/** Percent-mirror heal onto the twin partner. Cite: boss_twinemperors.cpp:120-123. */
export function mirrorHealPercent(
  healAmount: number,
  selfMaxHealth: number,
  partnerMaxHealth: number,
): number {
  const selfMax = Math.max(1, selfMaxHealth | 0);
  const partnerMax = Math.max(1, partnerMaxHealth | 0);
  return Math.floor((healAmount / selfMax) * partnerMax);
}

export type EventAiDeps = {
  injectEnemySummon: (
    summoner: Fighter,
    creatureId: number,
    durationMs: number,
    worldPos?: { x: number; y: number },
    opts?: { attackStart?: boolean },
  ) => Fighter | null;
  forceDespawnEnemy: (ef: Fighter) => void;
  resolveEventAiTargetFighter: (summoner: Fighter, targetSel: number) => Fighter;
  removeAurasDueToSpell: (unit: Fighter, spellId: number) => number;
  dead: (f: Fighter) => boolean;
  hostileTargetOf: (enemyF: Fighter) => Fighter;
  breakCharm: (f: Fighter) => void;
};

export function installEventAi(ctx: CombatContext, deps: EventAiDeps): void {
  // Aliases — same bindings createSession closures used (maps/arrays by reference).
  const push = ctx.push.bind(ctx);
  const enemyCastBySide = ctx.enemyCastBySide;
  const player = ctx.player;
  const instanceData = ctx.instanceData;
  const guardianSidesBySummoner = ctx.guardianSidesBySummoner;
  const distanceBetween = ctx.distanceBetween;
  const posOf = ctx.posOf;
  const threatOf = ctx.threatOf;
  const livingHostilesFor = ctx.livingHostilesFor;
  const bySide = ctx.bySide;
  /** Mandokir player-kill ding. Cite: boss_mandokir.cpp:190 m_uiKillCount. */
  const mandokirKillCount = new WeakMap<Fighter, number>();
  const isCharmed = ctx.isCharmed;
  const rng = ctx.rng;
  const tickMs = ctx.tickMs;
  const cfg = ctx.cfg;
  const injectEnemySummon = deps.injectEnemySummon;
  const forceDespawnEnemy = deps.forceDespawnEnemy;
  const resolveEventAiTargetFighter = deps.resolveEventAiTargetFighter;
  const removeAurasDueToSpell = deps.removeAurasDueToSpell;
  const dead = deps.dead;
  const hostileTargetOf = deps.hostileTargetOf;
  const breakCharm = deps.breakCharm;

  // The bodies below read `t` as a free variable, so each of the three functions takes a local copy of
  // ctx.t at its start rather than closing over a stale binding.

  /** Find living enemy with creatureEntry. */
  const findPartner = (entry: number): Fighter | null => {
    for (const e of ctx.livingEnemies()) {
      if (((e.spec.creatureEntry ?? 0) | 0) === entry) return e;
    }
    return null;
  };

  // DamageTaken mirror. Installed lazily over ctx.onDamaged (crowdControl assigns it after us). Cite:
  // boss_twinemperors.cpp:96-109.
  const applyDamageHealMirrorDamage = (
    victim: Fighter,
    damage: number,
    fromSpellId?: number,
  ): void => {
    if (damage <= 0 || dead(victim) || !isEnemySide(victim.side)) return;
    const cs = enemyCastBySide.get(victim.side as EnemySide);
    const mirror = cs?.scriptDev?.ir.damageHealMirror;
    if (!mirror) return;
    if (fromSpellId === mirror.empathySpellId) return;
    const partner = findPartner(mirror.partnerEntry | 0);
    if (!partner) return;
    const twinDamage = mirrorDamagePercent(damage, victim.spec.maxHealth, partner.spec.maxHealth);
    if (twinDamage <= 0) return;
    // Apply the scripted percent as a flat HP packet, not a second mitigation pass — DamageTaken
    // already saw the post-mitigation number. The fallback schools cover a stripped bake.
    const twinSpell = (id: number) =>
      victim.spec.spells.find((s) => s.id === id)
      ?? partner.spec.spells.find((s) => s.id === id);
    if (partner.hp <= twinDamage) {
      partner.hp = 0;
      const suicide = twinSpell(mirror.suicideSpellId);
      push({
        t: ctx.t,
        kind: 'spell_hit',
        actor: victim.side,
        target: partner.side,
        spellId: mirror.suicideSpellId,
        name: suicide?.name ?? 'Suicide',
        result: 'hit',
        amount: twinDamage,
        school: suicide?.school ?? 'physical',
      });
      return;
    }
    partner.hp = Math.max(0, Math.round(partner.hp - twinDamage));
    const empathy = twinSpell(mirror.empathySpellId);
    push({
      t: ctx.t,
      kind: 'spell_hit',
      actor: victim.side,
      target: partner.side,
      spellId: mirror.empathySpellId,
      name: empathy?.name ?? 'Twin Empathy',
      result: 'hit',
      amount: twinDamage,
      school: empathy?.school ?? 'holy',
    });
  };

  // HealedBy mirror. Amount is DealHeal addhealth (pre-clamp). Cite: Unit.cpp:6889;
  // boss_twinemperors.cpp:113-125.
  const applyDamageHealMirrorHeal = (
    healed: Fighter,
    healAmount: number,
    _fromSpellId?: number,
  ): void => {
    if (healAmount <= 0 || dead(healed) || !isEnemySide(healed.side)) return;
    const cs = enemyCastBySide.get(healed.side as EnemySide);
    const mirror = cs?.scriptDev?.ir.damageHealMirror;
    if (!mirror) return;
    const partner = findPartner(mirror.partnerEntry | 0);
    if (!partner || dead(partner)) return;
    const twinHeal = mirrorHealPercent(healAmount, healed.spec.maxHealth, partner.spec.maxHealth);
    if (twinHeal <= 0) return;
    const before = partner.hp;
    partner.hp = Math.min(partner.spec.maxHealth, Math.round(partner.hp + twinHeal));
    const gained = partner.hp - before;
    if (gained > 0) {
      push({ t: ctx.t, kind: 'heal', actor: partner.side, amount: gained, source: healed.side });
    }
  };

  let mirrorHooksInstalled = false;
  const ensureMirrorHooks = (): void => {
    if (mirrorHooksInstalled) return;
    mirrorHooksInstalled = true;
    const prevDamaged = ctx.onDamaged;
    if (prevDamaged) {
      ctx.onDamaged = (f, amount, damageType, fromSpellId, info) => {
        prevDamaged(f, amount, damageType, fromSpellId, info);
        applyDamageHealMirrorDamage(f, amount, fromSpellId);
      };
    } else {
      ctx.onDamaged = (f, amount, _damageType, fromSpellId) => {
        applyDamageHealMirrorDamage(f, amount, fromSpellId);
      };
    }
    const prevHealed = ctx.onHealed;
    if (prevHealed) {
      ctx.onHealed = (f, amount, fromSpellId) => {
        prevHealed(f, amount, fromSpellId);
        applyDamageHealMirrorHeal(f, amount, fromSpellId);
      };
    } else {
      ctx.onHealed = (f, amount, fromSpellId) => {
        applyDamageHealMirrorHeal(f, amount, fromSpellId);
      };
    }
  };

  // MoveInLineOfSight Heal Brother within 60 yd while the encounter is in progress. Gated only on a
  // live GCD or an in-progress cast, so the cast-if-can style failures still apply.
  const maybeCastHealBrother = (ef: Fighter): void => {
    const cs = enemyCastBySide.get(ef.side as EnemySide);
    const mirror = cs?.scriptDev?.ir.damageHealMirror;
    if (!mirror?.healBrotherSpellId || mirror.healBrotherRangeYd == null) return;
    if (mirror.encounterField != null) {
      if ((instanceData.get(mirror.encounterField) ?? 0) !== INSTANCE_DATA.IN_PROGRESS) return;
    }
    const t = ctx.t;
    if (ef.gcdUntil > t) return;
    if (ef.castingSpell != null || ef.channeling) return;
    const partner = findPartner(mirror.partnerEntry | 0);
    if (!partner) return;
    const dist = distanceBetween(ef, partner);
    if (dist == null || dist > mirror.healBrotherRangeYd) return;
    const spell =
      ef.spec.spells.find((s) => s.id === mirror.healBrotherSpellId)
      ?? partner.spec.spells.find((s) => s.id === mirror.healBrotherSpellId);
    if (!spell || !ctx.applySpell) return;
    ctx.applySpell(ef, partner, spell);
  };

  /** Apply one EventAI intent (phase already mutated in pure layer for set_phase/flee). */
  const applyEventAiIntent = (summoner: Fighter, intent: EventAiIntent): void => {
    const t = ctx.t;
    const castState = enemyCastBySide.get(summoner.side as EnemySide);
    switch (intent.kind) {
      case 'set_phase':
        push({ t, kind: 'phase', actor: summoner.side, phase: intent.phase });
        break;
      case 'flee':
        push({ t, kind: 'flee', actor: summoner.side });
        break;
      case 'start_relay':
        // ScriptsStart for a relay. 151 of the 158 DB rows name a relay id directly and all of them
        // exist; the 7 template rows cannot resolve without that table, so they are reported.
        if (intent.relayId > 0) {
          push({ t, kind: 'relay_script', actor: summoner.side, relayId: intent.relayId });
          emitSimEffect(ctx, { kind: 'relayScript', relayId: intent.relayId, actor: summoner.side });
        } else {
          push({
            t,
            kind: 'flavor',
            text: `${summoner.spec.name} relay template ${intent.templateId} unresolved (dbscript_random_templates unbaked).`,
          });
        }
        break;
      case 'killed_monster':
        // Credit a creature ENTRY, not a quest id: 12296 credits 12297, 12298 credits 12299.
        // Cite: CreatureEventAI.cpp ProcessAction case 33.
        if (intent.creatureId > 0) {
          push({ t, kind: 'kill_credit', actor: summoner.side, creatureEntry: intent.creatureId });
          emitSimEffect(ctx, { kind: 'killCredit', creatureEntry: intent.creatureId });
        }
        break;
      case 'pause_waypoints':
        // The engine has no waypoint walker for an enemy, so pausing one is expressed as the
        // thing it means on the floor: stop moving. Cite: CreatureEventAI.h:142.
        if (castState) castState.eventAi.waypointsPaused = intent.pause;
        push({
          t,
          kind: 'flavor',
          text: `${summoner.spec.name} ${intent.pause ? 'stops' : 'resumes'} patrolling.`,
        });
        break;
      case 'set_facing':
        // P11's `facing` scalar is exactly what this action writes. reset = drop the override
        // and go back to deriving it; otherwise face the current victim.
        {
          const oldFacing = summoner.facing;
          if (intent.reset) {
            summoner.facing = null;
          } else {
            const victim = hostileTargetOf(summoner);
            const heading = victim !== summoner ? ctx.facingOf?.(summoner) : undefined;
            summoner.facing = heading ?? summoner.facing;
          }
          if (summoner.facing !== oldFacing) {
            ctx.removeAurasWithInterruptFlags?.(summoner, AURA_INTERRUPT.TURNING, 'turning');
          }
        }
        break;
      case 'spawn':
        if (intent.creatureId > 0) {
          injectEnemySummon(summoner, intent.creatureId, intent.durationMs);
        }
        break;
      case 'summon_id':
        // creature_ai_summons carries the real spawn point — pass it through, or the add
        // lands on the summoner's feet (Object.cpp's zeroed-position branch).
        if (intent.creatureId > 0) {
          injectEnemySummon(
            summoner,
            intent.creatureId,
            0,
            intent.placement ? { x: intent.placement.x, y: intent.placement.y } : undefined,
            // TARGET_T_SELF summons and does NOT AttackStart. Celebras the Redeemed (13716,
            // faction 35) opened on the party and held the pull. Cite: CreatureEventAI.cpp:1023.
            { attackStart: (intent.target | 0) !== EVENT_AI_TARGET_SELF },
          );
        }
        break;
      case 'cast':
        // CAST intents are handled by the dedicated cast-slot scheduler.
        break;
      case 'text':
        if (intent.unresolved || !intent.text) break;
        push({
          t,
          kind: 'creature_text',
          actor: summoner.side,
          textId: intent.textId,
          chatType: intent.chatType,
          text: intent.text,
        });
        break;
      case 'emote':
        // SpellDefines.h:367, ChatHandler.cpp:713
        ctx.removeAurasWithInterruptFlags?.(summoner, AURA_INTERRUPT.ANIM_CANCELS, 'anim cancels');
        push({ t, kind: 'emote', actor: summoner.side, emoteId: intent.emoteId });
        // Feed line for combat log readability.
        push({ t, kind: 'flavor', text: `${summoner.spec.name} emotes (${intent.emoteId}).` });
        break;
      case 'sound':
        // playSfx when UI maps the soundId; event always recorded for observability.
        push({ t, kind: 'sound', actor: summoner.side, soundId: intent.soundId });
        break;
      case 'set_ranged_mode':
        // SetRangedMode keeps distance and stops white melee while the kit is ranged — the main
        // spell is the attack, and stacking main-hand whites on top is the double-dip bug.
        if (intent.enabled) {
          summoner.mode = 'ranged';
          summoner.autoAttackEnabled = false;
          if (castState) castState.eventAi.meleeEnabled = false;
        } else {
          summoner.mode = 'melee';
          summoner.autoAttackEnabled = true;
          if (castState) castState.eventAi.meleeEnabled = true;
        }
        push({
          t,
          kind: 'ranged_mode',
          actor: summoner.side,
          enabled: intent.enabled,
          chaseDistance: intent.chaseDistance,
        });
        break;
      case 'auto_attack':
        summoner.autoAttackEnabled = intent.enabled;
        if (castState) castState.eventAi.meleeEnabled = intent.enabled;
        push({ t, kind: 'auto_attack', actor: summoner.side, enabled: intent.enabled });
        break;
      case 'remove_auras_from_spell': {
        if (!intent.spellId) break;
        const tgt = resolveEventAiTargetFighter(summoner, intent.target);
        removeAurasDueToSpell(tgt, intent.spellId);
        push({
          t,
          kind: 'remove_auras',
          actor: summoner.side,
          target: tgt.side,
          spellId: intent.spellId,
        });
        break;
      }
      case 'call_for_help': {
        // DoCallForHelp engages nearby unengaged helpers within radius. A param of 0 means the family
        // assistance radius, NOT the whole session, and line of sight is required.
        if (castState?.eventAi.alreadyCallAssistance) break;
        const radius = resolveCallForHelpRadius(intent.radius);
        push({ t, kind: 'call_for_help', actor: summoner.side, radius });
        if (castState) castState.eventAi.alreadyCallAssistance = true;
        const from = posOf?.(summoner.side);
        const acq = cfg.acquireRangeYd;
        for (const other of ctx.livingEnemies()) {
          if (other === summoner) continue;
          // CanAssistTo: already in combat → skip (hasEnemy path).
          const tm = threatOf(other);
          if (!tm || !tm.isEmpty()) continue;
          const d = distanceBetween(summoner, other);
          if (d == null) {
            // Endless floor always has unit yards for injects — missing d is not "pack".
            // Non-endless multi-enemy without geometry: legacy co-session pack assist.
            if (cfg.endless) continue;
          } else if (d > radius) {
            continue;
          }
          // Endless local combat: a helper must also sit inside the player's acquire range. The
          // caller-centric radius alone pulls a 100 yd passive when a boss calls with r=100.
          if (acq != null && cfg.endless) {
            const toPlayer = distanceBetween(other, player);
            if (toPlayer != null && toPlayer > acq) continue;
          }
          if (cfg.navLos && from) {
            const at = posOf?.(other.side);
            if (at && !navSightClear(cfg, from, at)) continue;
          }
          const otherCast = enemyCastBySide.get(other.side as EnemySide);
          if (otherCast) otherCast.eventAi.alreadyCallAssistance = true;
          tm.addThreatDirectly('player', 1, false);
          for (const a of ctx.livingAllies()) tm.addThreatDirectly(a.side, 1, false);
          if (ctx.pet && !dead(ctx.pet)) tm.addThreatDirectly('pet', 1, false);
          wakeForDecision(other);
        }
        break;
      }
      case 'force_despawn': {
        // delay already applied to state.forceDespawnAt in pure layer.
        if (intent.delayMs <= 0) {
          forceDespawnEnemy(summoner);
        }
        // Delayed path: tickEventAiForceDespawn below when forceDespawnAt elapses.
        break;
      }
      case 'set_stand_state':
        // SpellDefines.h:367, MiscHandler.cpp:413
        ctx.removeAurasWithInterruptFlags?.(summoner, AURA_INTERRUPT.ANIM_CANCELS, 'anim cancels');
        push({ t, kind: 'stand_state', actor: summoner.side, standState: intent.standState });
        break;
      case 'set_inst_data':
        instanceData.set(intent.field | 0, intent.value | 0);
        push({ t, kind: 'instance_data', field: intent.field | 0, value: intent.value | 0 });
        // Persist like the death-bound write (sessionDeaths.ts:233): an ACID SetData outlives
        // the pull. Without this ZG's Vilebranch Speaker set TYPE_OHGAN and the run forgot.
        emitSimEffect(ctx, { kind: 'instanceData', store: new Map(instanceData), openDoors: [] });
        break;
      case 'set_death_prevention':
        push({
          t,
          kind: 'death_prevention',
          actor: summoner.side,
          enabled: intent.enabled,
        });
        break;
      case 'update_template':
        if (intent.creatureId > 0) {
          // Keep combatantEntry on the fighter for observability; full re-stat is S9+ territory.
          (summoner.spec as { creatureEntry?: number }).creatureEntry = intent.creatureId;
          push({
            t,
            kind: 'update_template',
            actor: summoner.side,
            creatureId: intent.creatureId,
          });
        }
        break;
      case 'set_follow_movement':
        push({
          t,
          kind: 'follow_movement',
          actor: summoner.side,
          enabled: intent.enabled,
        });
        break;
      case 'attack_start': {
        const tgt = resolveEventAiTargetFighter(summoner, intent.target);
        const tm = threatOf(summoner);
        if (tm) tm.addThreatDirectly(tgt.side, 1, false);
        if (castState && castState.eventAi.reactState === 0) {
          // Leave passive when forced to AttackStart.
          castState.eventAi.reactState = 2;
        }
        push({ t, kind: 'attack_start', actor: summoner.side, target: tgt.side });
        break;
      }
      case 'throw_ai_event': {
        // SendAIEventAround pulses the receive event on living enemies within radius. The C++ fires
        // only when the radius is above 0 — a radius of 0 is a no-op, not the whole session.
        sendAiEventAround(summoner, intent.eventType, intent.radius);
        break;
      }
      case 'set_throw_mask':
        // State already mutated in ACTION_HANDLERS; log for combat feed / repro.
        push({
          t,
          kind: 'flavor',
          text: `${summoner.spec.name} set throw AI event mask ${intent.mask}.`,
        });
        break;
      case 'set_react_state':
        push({
          t,
          kind: 'react_state',
          actor: summoner.side,
          reactState: intent.reactState,
        });
        break;
      case 'despawn_guardians': {
        push({
          t,
          kind: 'despawn_guardians',
          actor: summoner.side,
          entryId: intent.entryId,
        });
        const owned = guardianSidesBySummoner.get(summoner.side);
        if (!owned) break;
        for (const side of [...owned]) {
          const g = ctx.sideFighter?.(side) ?? null;
          if (!g || dead(g)) {
            owned.delete(side);
            continue;
          }
          if (intent.entryId > 0 && (g.spec.creatureEntry ?? 0) !== intent.entryId) continue;
          forceDespawnEnemy(g);
          owned.delete(side);
        }
        break;
      }
      // ---- S4 tail intents ----
      case 'set_faction':
        push({
          t,
          kind: 'set_faction',
          actor: summoner.side,
          factionId: intent.factionId,
          factionFlags: intent.factionFlags,
        });
        break;
      case 'morph':
        push({
          t,
          kind: 'morph',
          actor: summoner.side,
          creatureId: intent.creatureId,
          modelId: intent.modelId,
        });
        break;
      case 'threat_single': {
        const tgt = resolveEventAiTargetFighter(summoner, intent.target);
        const tm = threatOf(summoner);
        if (tm) {
          if (intent.isDirect) {
            tm.addThreatDirectly(tgt.side, intent.value, false);
          } else {
            tm.modifyThreatPercent(tgt.side, intent.value);
          }
        }
        push({
          t,
          kind: 'threat_single',
          actor: summoner.side,
          target: tgt.side,
          value: intent.value,
          isDirect: intent.isDirect,
        });
        break;
      }
      case 'threat_all_pct': {
        const tm = threatOf(summoner);
        if (tm) tm.modifyAllThreatPercent(intent.percent);
        push({ t, kind: 'threat_all_pct', actor: summoner.side, percent: intent.percent });
        break;
      }
      case 'quest_event':
        // GOOBER-equivalent credit signal → AreaExploredOrEventHappens.
        // Cite: CreatureEventAI.cpp ~847–862; gameObjects useGameObject questCredit.
        push({
          t,
          kind: 'quest_event',
          actor: summoner.side,
          questId: intent.questId,
          rewardGroup: intent.rewardGroup,
        });
        emitSimEffect(ctx, {
          kind: 'questEvent', questId: intent.questId, rewardGroup: intent.rewardGroup,
        });
        break;
      case 'set_unit_field': {
        const tgt = resolveEventAiTargetFighter(summoner, intent.target);
        push({
          t,
          kind: 'set_unit_field',
          actor: summoner.side,
          field: intent.field,
          value: intent.value,
          target: tgt.side,
        });
        // POWER1 (mana) field 23 — apply to fighter power when self/target is a mana unit.
        // Cite: UpdateFields.h UNIT_FIELD_POWER1 = 0x11+OBJECT_END = 23.
        if (intent.field === 23) {
          tgt.power = Math.max(0, Math.min(tgt.spec.maxPower, intent.value | 0));
        }
        break;
      }
      case 'set_unit_flag': {
        const tgt = resolveEventAiTargetFighter(summoner, intent.target);
        const ocs = enemyCastBySide.get(tgt.side as EnemySide);
        if (ocs) ocs.eventAi.unitFlags |= intent.flag;
        // UNIT_FLAG_SPAWNING / PACIFIED must hit the live fighter, not only EventAI bookkeeping.
        // Cite: Unit.h UNIT_FLAG_*; Relations.cpp CanAttack; HandleAuraModPacify.
        if (intent.flag & UNIT_FLAG.SPAWNING) tgt.unattackableUntil = Math.max(tgt.unattackableUntil, t + 3_600_000);
        if (intent.flag & UNIT_FLAG.PACIFIED) tgt.pacifiedUntil = Math.max(tgt.pacifiedUntil, t + 3_600_000);
        if (intent.flag & UNIT_FLAG.STUNNED) tgt.stunnedUntil = Math.max(tgt.stunnedUntil, t + 3_600_000);
        push({
          t,
          kind: 'set_unit_flag',
          actor: summoner.side,
          flag: intent.flag,
          target: tgt.side,
        });
        break;
      }
      case 'remove_unit_flag': {
        const tgt = resolveEventAiTargetFighter(summoner, intent.target);
        const ocs = enemyCastBySide.get(tgt.side as EnemySide);
        if (ocs) ocs.eventAi.unitFlags &= ~intent.flag;
        if (intent.flag & UNIT_FLAG.SPAWNING) tgt.unattackableUntil = 0;
        if (intent.flag & UNIT_FLAG.PACIFIED) tgt.pacifiedUntil = 0;
        if (intent.flag & UNIT_FLAG.STUNNED) tgt.stunnedUntil = 0;
        push({
          t,
          kind: 'remove_unit_flag',
          actor: summoner.side,
          flag: intent.flag,
          target: tgt.side,
        });
        break;
      }
      case 'combat_movement':
        if (castState) castState.eventAi.combatMovement = intent.enabled;
        // When stopping combat movement with melee flag, suppress AA (ranged switch).
        // Cite: ProcessAction ~913–916 SendMeleeAttackStart/Stop.
        if (!intent.enabled && intent.melee) {
          summoner.autoAttackEnabled = false;
          if (castState) castState.eventAi.meleeEnabled = false;
        } else if (intent.enabled && intent.melee) {
          summoner.autoAttackEnabled = true;
          if (castState) castState.eventAi.meleeEnabled = true;
        }
        push({
          t,
          kind: 'combat_movement',
          actor: summoner.side,
          enabled: intent.enabled,
          melee: intent.melee,
        });
        break;
      case 'evade': {
        // combatOnly → CombatStopWithPets; else EnterEvadeMode (clear threat + reset).
        // Cite: ProcessAction ~942–946.
        const tm = threatOf(summoner);
        if (tm) tm.clear();
        if (!intent.combatOnly) {
          // Full evade: heal to full is product-dependent; clear combat flags + pulse EVADE.
          summoner.hp = Math.max(summoner.hp, 1);
          if (castState) {
            const evadeIntents = pulseEventAi(
              castState.eventAi,
              EVENT_T.EVADE,
              {
                t,
                hpPct: Math.floor((summoner.hp * 100) / Math.max(1, summoner.spec.maxHealth)),
                inCombat: false,
                evading: true,
              },
              { rng, summons: summoner.spec.ai?.summons, speakerName: summoner.spec.name },
            );
            for (const ei of evadeIntents) applyEventAiIntent(summoner, ei);
            // Reached-home follows the evade. This engine has no walk-home phase, so the two fire
            // back to back rather than a tick apart. 19 DB rows, six of them 'rel bosses.
            notifyEventAiReachedHome(summoner);
          }
        }
        push({ t, kind: 'evade', actor: summoner.side, combatOnly: intent.combatOnly });
        break;
      }
      case 'die':
        // Suicide() — Cite: ProcessAction ~1085–1093.
        summoner.hp = 0;
        push({ t, kind: 'death', actor: summoner.side });
        break;
      case 'zone_combat_pulse':
        // SetInCombatWithZone — engage all living players/allies on the map.
        // Cite: ProcessAction ~1095–1100; Creature.cpp:2310–2352.
        const tm = threatOf(summoner);
        if (tm) {
          tm.addThreatDirectly('player', 1, false);
          for (const a of ctx.livingAllies()) tm.addThreatDirectly(a.side, 1, false);
        }
        pulsePartyCombat(ctx.partyUnits(), t);
        push({ t, kind: 'zone_combat_pulse', actor: summoner.side });
        break;
      case 'set_sheath':
        if (castState) castState.eventAi.sheath = intent.sheath;
        push({ t, kind: 'set_sheath', actor: summoner.side, sheath: intent.sheath });
        break;
      case 'mount':
        if (castState) {
          castState.eventAi.mountCreatureId = intent.creatureId;
          castState.eventAi.mountDisplayId = intent.modelId;
        }
        push({
          t,
          kind: 'mount',
          actor: summoner.side,
          creatureId: intent.creatureId,
          modelId: intent.modelId,
        });
        break;
      case 'change_movement':
        if (castState) castState.eventAi.movementType = intent.movementType;
        push({
          t,
          kind: 'change_movement',
          actor: summoner.side,
          movementType: intent.movementType,
          wanderOrPathId: intent.wanderOrPathId,
          flags: intent.flags,
        });
        break;
      case 'set_walk':
        push({ t, kind: 'set_walk', actor: summoner.side, walkType: intent.walkType });
        break;
      case 'set_immobilized_state':
        if (castState) castState.eventAi.immobilized = intent.apply;
        if (intent.apply) {
          summoner.rootedUntil = Math.max(summoner.rootedUntil, t + 86_400_000);
        } else {
          summoner.rootedUntil = 0;
        }
        push({
          t,
          kind: 'set_immobilized_state',
          actor: summoner.side,
          apply: intent.apply,
          combatOnly: intent.combatOnly,
        });
        break;
      default:
        break;
    }
  };

  // SendAIEventAround — pulse the receive event on living enemies in radius. A radius of 0 is a no-op,
  // and the automatic health and death throws use the default 30 yd. Cite: UnitAI.cpp:621–659.
  const sendAiEventAround = (
    sender: Fighter,
    eventType: number,
    radius: number,
  ): void => {
    const t = ctx.t;
    push({
      t,
      kind: 'throw_ai_event',
      actor: sender.side,
      eventType,
      radius,
    });
    if (!(radius > 0)) return;
    const senderEntry = sender.spec.creatureEntry ?? 0;
    for (const other of ctx.livingEnemies()) {
      if (other === sender) continue;
      const d = distanceBetween(sender, other);
      if (d == null) {
        if (cfg.endless) continue;
      } else if (d > radius) {
        continue;
      }
      const ocs = enemyCastBySide.get(other.side as EnemySide);
      if (!ocs || ocs.eventAi.holders.length === 0) continue;
      const recvIntents = pulseEventAi(
        ocs.eventAi,
        EVENT_T.RECEIVE_AI_EVENT,
        {
          t,
          hpPct: Math.floor((other.hp * 100) / Math.max(1, other.spec.maxHealth)),
          inCombat: true,
          receivedAiEvent: {
            eventType,
            senderEntry,
          },
        },
        { rng, summons: other.spec.ai?.summons, speakerName: other.spec.name },
      );
      for (const ri of recvIntents) applyEventAiIntent(other, ri);
    }
  };

  /** CreatureEventAI::DamageTaken auto-throw after HP drops. Cite: CreatureEventAI.cpp:1841–1871. */
  const notifyEventAiDamageTaken = (
    target: Fighter,
    healthBefore: number,
    damage: number,
  ): void => {
    if (!isEnemySide(target.side) || !(damage > 0)) return;
    const cs = enemyCastBySide.get(target.side as EnemySide);
    if (!cs) return;
    // Step advances even when mask bits are unset (C++ always writes m_throwAIEventStep).
    const eventType = processThrowAiEventDamageTaken(
      cs.eventAi,
      healthBefore,
      damage,
      target.spec.maxHealth,
    );
    if (eventType == null) return;
    sendAiEventAround(target, eventType, AIEVENT_DEFAULT_THROW_RADIUS_YD);
  };

  // CreatureEventAI::HealedBy auto-throw when a heal would fill HP. Cite: CreatureEventAI.cpp:1885–1895.
  const notifyEventAiHealedBy = (
    target: Fighter,
    healthBefore: number,
    healedAmount: number,
  ): void => {
    if (!isEnemySide(target.side) || !(healedAmount > 0)) return;
    const cs = enemyCastBySide.get(target.side as EnemySide);
    if (!cs) return;
    const eventType = processThrowAiEventHealedBy(
      cs.eventAi,
      healthBefore,
      healedAmount,
      target.spec.maxHealth,
    );
    if (eventType == null) return;
    sendAiEventAround(target, eventType, AIEVENT_DEFAULT_THROW_RADIUS_YD);
  };

  // Step EventAI non-CAST actions for one living enemy (phase / spawn / flee). Multiple events may fire in
  // one tick (loop until idle), capped for safety.
  const runEnemyEventAi = (ef: Fighter): void => {
    const t = ctx.t;
    // Damage/heal mirror hooks wrap onDamaged/onHealed once combatants tick.
    ensureMirrorHooks();
    // The timed despawn runs BEFORE the passive and no-holder early-outs, so an idle summon that
    // nobody attacks still expires on schedule.
    if (ef.summonDespawnAt != null && ef.summonDespawnAt > 0 && t >= ef.summonDespawnAt) {
      ef.summonDespawnAt = 0;
      forceDespawnEnemy(ef);
      return;
    }
    const castState = enemyCastBySide.get(ef.side as EnemySide);
    if (!castState) return;
    const possessInvId = castState.scriptDev?.ir.auraScripts?.find((a) => a.possessInvSpellId)
      ?.possessInvSpellId;
    const holdingPossessInv = possessInvId != null && (
      ef.buffActive.has(possessInvId)
      || ef.unattackableUntil > t
      || ctx.effectsOn(ef.side).some((e) => e.spellId === possessInvId)
    );
    // No threat means no victim, so the whole combat EventAI pass is off. Only the endless path was
    // gated, so a world-fight mob ran its combat script from t=0, unpulled. Possess must still tick.
    // oocClock (Kel'Thuzad alone) opts a script's clock back in: his phase-1 ramp runs while
    // unattackable and out of combat. Cite: boss_kelthuzad.cpp:236-238 polls players, not threat.
    const tm = threatOf(ef);
    const oocClock = castState.scriptDev?.ir.oocClock === true;
    if ((!tm || tm.isEmpty()) && !holdingPossessInv && !oocClock) {
      // Out-of-combat line of sight — MoveInLineOfSight while OUT of combat, which is the state this
      // early return covers. Gated on a party member inside acquire range, so it is a sighting.
      if (ctx.nearestPartyInAcquire?.(ef.side)) notifyEventAiOocLos(ef);
      // naxxramas.cpp:1010-1022 MoveInLineOfSight while UNINTERACTIBLE is the OOC path.
      runStoneskinGargoyleReachCasts(ef);
      return;
    }
    if (castState.eventAi.holders.length === 0) {
      // Still tick flee expiry when state exists without holders.
      const st = castState.eventAi;
      if (st.fleeing && st.fleeUntil > 0 && t >= st.fleeUntil) {
        st.fleeing = false;
        st.fleeUntil = 0;
      }
      // ScriptDev-bound bosses have no EventAI holders yet still need the host tick below for phase
      // thresholds, possess-end and leash. Gating them out kept a 40% morph from ever evaluating.
      if (!castState.scriptDev) return;
    }
    // C2: EventAI poll + friendlies snapshot on the SlowUpdate cursor. forceDespawn
    // and ScriptDev stay every tick — ScriptDev timers count down via diffMs.
    const diag = ctx.slowDiag ??= emptySlowDiag();
    const eventAiDue = slowThinkDue({
      side: ef.side,
      t,
      tickMs,
      engaged: true,
      gcdUntil: ef.gcdUntil,
      swingReadyAt: ef.swingReadyAt,
      ohSwingReadyAt: ef.ohSwingReadyAt,
      casting: ef.castingSpell != null || !!ef.channeling,
    });
    if (eventAiDue) {
      diag.eventAiThink++;
    } else {
      diag.eventAiSkip++;
    }
    const maxHp = Math.max(1, ef.spec.maxHealth);
    const hpPct = Math.floor((ef.hp * 100) / maxHp);
    if (eventAiDue) {
    const manaMax = ef.maxMana > 0 ? ef.maxMana : (ef.spec.powerType === 'mana' ? ef.spec.maxPower : 0);
    const manaNow = ef.spec.powerType === 'mana' ? ef.power : ef.mana;
    const manaPct = manaMax > 0 ? Math.floor((manaNow * 100) / manaMax) : undefined;
    const foe = hostileTargetOf(ef);
    const foeMaxHp = Math.max(1, foe.spec.maxHealth);
    const targetHpPct = Math.floor((foe.hp * 100) / foeMaxHp);
    const foeManaMax = foe.maxMana > 0 ? foe.maxMana : (foe.spec.powerType === 'mana' ? foe.spec.maxPower : 0);
    const foeManaNow = foe.spec.powerType === 'mana' ? foe.power : foe.mana;
    const targetManaPct = foeManaMax > 0 ? Math.floor((foeManaNow * 100) / foeManaMax) : undefined;
    const isCcLocked = (u: Fighter): boolean =>
      u.stunnedUntil > t || u.fearedUntil > t || u.incapUntil > t;
    // Endless floor: FRIENDLY_* events only see engaged pack mates, not passive stream.
    // Cite: friendlyPoolOf endless enemy filter; pickAction packMate gate.
    const packMate = (ally: Fighter): boolean => {
      if (ally === ef || !(ally.hp > 0)) return false;
      if (!cfg.endless) return true;
      const tm = threatOf(ally);
      return !!tm && !tm.isEmpty();
    };
    const friendlies = ctx.livingEnemies()
      .filter(packMate)
      .map((ally) => {
        const aMax = Math.max(1, ally.spec.maxHealth);
        return {
          hp: ally.hp,
          maxHp: aMax,
          hpPct: Math.floor((ally.hp * 100) / aMax),
          distanceYd: distanceBetween(ef, ally),
          hasAura: (spellId: number, stacks: number) =>
            ally.buffActive.has(spellId) && stacks <= 1,
          hasCc: isCcLocked(ally),
        };
      });
    {
      const sMax = Math.max(1, ef.spec.maxHealth);
      friendlies.push({
        hp: ef.hp,
        maxHp: sMax,
        hpPct,
        distanceYd: 0,
        hasAura: (spellId: number, stacks: number) =>
          ef.buffActive.has(spellId) && stacks <= 1,
        hasCc: isCcLocked(ef),
      });
    }
    const hitFresh = ef.spellHitAt != null && t - ef.spellHitAt <= tickMs * SLOW_IDLE_RATE;
    // FACING_TARGET — 0 wants the victim's BACK and 1 its front. The creature has the victim in its
    // own front half either way, so what the row asks is whether the VICTIM is facing away.
    const facingTarget: 0 | 1 | undefined = ctx.isInFrontArc
      ? (ctx.isInFrontArc(foe, ef) ? 1 : 0)
      : undefined;
    const aiPulse = {            t,
      hpPct,
      manaPct,
      targetHpPct,
      targetManaPct,
      phase: castState.eventAi.phase,
      // The threat gate above already returned for an unengaged creature.
      inCombat: true,
      friendlies,
      hasAura: (spellId: number, stacks: number) => ef.buffActive.has(spellId) && stacks <= 1,
      targetHasAura: (spellId: number, stacks: number) => foe.buffActive.has(spellId) && stacks <= 1,
      targetCasting: foe.castingSpell != null || !!(foe.channeling && t < foe.channeling.endsAt),
      distanceYd: distanceBetween(ef, foe),
      // EVENT_T_SPELLHIT pulse — this tick or the last one. stepEventAi clears it when a
      // SPELLHIT holder fires, so the 8-step loop cannot replay one hit.
      spellHitId: hitFresh ? ef.spellHitId : undefined,
      spellHitSchoolMask: hitFresh ? ef.spellHitSchoolMask : undefined,
      facingTarget,
      // TARGET_NOT_REACHABLE — a victim the chase cannot path to. The walk path already computed it,
      // so this is a read rather than a second pathfinder.
      targetNotReachable: ef.targetUnreachableMs >= 1000,
      // SELECT_ATTACKING_TARGET — the C++ picks a victim matching the row's range params and fires
      // when one is found. The poll already resolved a live foe, so presence is what is left.
      hasAttackingTargetInRange: foe !== ef && !dead(foe),
    };
    // Cap steps per tick so a mis-armed 0-repeat loop cannot hang the session.
    for (let step = 0; step < 8; step++) {
      const intents = stepEventAi(castState.eventAi, aiPulse, {
        rng,
        summons: ef.spec.ai?.summons,
        speakerName: ef.spec.name,
      });
      if (intents.length === 0) break;
      for (const intent of intents) applyEventAiIntent(ef, intent);
      // Phase may have changed — keep ctx in sync for next holder this tick.
      aiPulse.phase = castState.eventAi.phase;
    }
    }
    // ACTION_T_FORCE_DESPAWN delayed path.
    // Cite: CreatureEventAI.cpp ForcedDespawn ~1112–1114.
    if (
      castState.eventAi.forceDespawnAt > 0 &&
      t >= castState.eventAi.forceDespawnAt &&
      !dead(ef)
    ) {
      castState.eventAi.forceDespawnAt = 0;
      forceDespawnEnemy(ef);
    }

    // MoveInLineOfSight proximity answers, OUTSIDE the scriptDev guard on purpose: a body whose whole
    // script is a proximity check has no timers, so it never gets a cast plan to hang state on.
    runScriptDevProximityTriggers(ef);

    // aifid S9: ScriptDev host tick — phase HP thresholds + possess-end + leash.
    // Cite: boss_dathrohan_balnazzar.cpp transform; Anastari m_uiPossessEndTimer.
    if (castState.scriptDev) {
      const invId = castState.scriptDev.ir.auraScripts?.find((a) => a.possessInvSpellId)
        ?.possessInvSpellId;
      const hasPossessInv = invId != null
        ? ef.buffActive.has(invId) || ef.unattackableUntil > t
        : false;
      const party = ctx.partyUnits();
      const livingCharmed = party.filter(
        (u) => !dead(u) && isCharmed(u) && u.charmedBy === ef.side,
      );
      let possessedHpFrac: number | null = null;
      if (castState.scriptDev.possessedSide) {
        const pos = bySide(castState.scriptDev.possessedSide as Side);
        // Uncharmed / dead victim is "no player" — CMaNGOS !pPlayer || !IsAlive.
        if (pos && !dead(pos) && isCharmed(pos) && pos.charmedBy === ef.side) {
          possessedHpFrac = pos.hp / Math.max(1, pos.spec.maxHealth);
        } else {
          possessedHpFrac = null;
        }
      } else if (livingCharmed.length > 0) {
        const pos = livingCharmed[0]!;
        possessedHpFrac = pos.hp / Math.max(1, pos.spec.maxHealth);
      }
      // Threat list size proxy: living hostiles the boss can still hit (+ self if only one).
      const threatSize = livingHostilesFor(ef).length + (hasPossessInv ? 0 : 0);
      // While possessing, threat list is "possessed body + maybe nothing else" — use
      // living hostiles of the *possessed* unit when inv is up.
      let leashThreat = threatSize;
      if (hasPossessInv && castState.scriptDev.possessedSide) {
        const pos = bySide(castState.scriptDev.possessedSide as Side);
        leashThreat = pos ? livingHostilesFor(pos).length : 0;
      }
      const pos = ctx.posOf?.(ef.side);
      const home = ctx.enemyHomeYd?.get(ef.side);
      let homeYd: number | undefined;
      if (pos && home) {
        const dx = pos.x - home.x;
        const dy = pos.y - home.y;
        homeYd = Math.sqrt(dx * dx + dy * dy);
      }
      const sdTick = tickScriptDev(castState.scriptDev, {
        hpPct,
        t,
        diffMs: tickMs,
        threatSize: leashThreat,
        hasPossessInv,
        possessedHpFrac,
        rng,
        z: pos?.z,
        x: pos?.x,
        y: pos?.y,
        homeYd,
      });
      if (sdTick.evade) {
        // SetLeashingCheck true → EnterEvadeMode. Cite: boss_faerlina.cpp:67-71.
        if (tm) tm.clear();
        ef.hp = Math.max(1, ef.spec.maxHealth);
        ef.power = ef.spec.powerType === 'rage' ? 0 : ef.spec.maxPower;
        resetCreatureCastSlotsOnEvade(castState.slots, t, rng);
        castState.pendingSlot = null;
        runEvadeLifecycle(ctx, ef);
        return;
      }
      if (sdTick.phase != null) {
        const prevPhase = castState.eventAi.phase;
        rearmCreatureCastSlotsOnPhase(castState.slots, prevPhase, sdTick.phase, t, rng);
        castState.eventAi.phase = sdTick.phase;
        // The same observability event EventAI's set_phase pushes. Without it an IR phase transition
        // left NO trace in the log, so every oracle had to regex the flavour text instead.
        push({ t, kind: 'phase', actor: ef.side, phase: sdTick.phase });
      }
      const endPossessVanish = (): void => {
        for (const u of party) {
          if (u.charmedBy === ef.side || (isCharmed(u) && u.charmedBy === ef.side)) breakCharm(u);
        }
        if (invId) removeAurasDueToSpell(ef, invId);
        ef.unattackableUntil = 0;
        if (ef.stunnedUntil > t) ef.stunnedUntil = t;
        if (invId) ef.buffActive.delete(invId);
      };
      if (sdTick.breakPossess) {
        // Cite: boss_baroness_anastari.cpp:102,110 RemoveAurasDueToSpell(SPELL_POSSESS_INV).
        endPossessVanish();
      } else if (invId != null && hasPossessInv && livingCharmed.length === 0) {
        // Victim already dead / uncharmed and inv survived breakCharm — drop vanish.
        endPossessVanish();
      }
      applyScriptDevCombatActions(ef, sdTick.actions);
      // A spell-hit row can arm a countdown instead of answering at once, and the payload lands when
      // it expires. The tick was exported and had no caller, so every tagged unit stood there forever.
      const dieTick = tickDieTimer(castState.scriptDev, tickMs);
      if (dieTick.actions.length) applyScriptDevCombatActions(ef, dieTick.actions);
      // JustSummoned reach-cast after summons this tick (and any still walking in).
      // Cite: boss_ambassador_flamelash.cpp:69-78 MoveInLineOfSight.
      runScriptDevReachCasts(ef);
      for (const line of sdTick.flavor) {
        push({ t, kind: 'flavor', text: line });
      }
      // Twin Heal Brother on the SlowUpdate AI poll (not every tickMs). Cite: boss_twinemperors.cpp:209-210.
      if (eventAiDue) maybeCastHealBrother(ef);
    }
  };

  // Fire once when an enemy first reaches 0 HP. The living pass skips corpses, so a death summon
  // needs this path. Cite: CreatureEventAI.cpp EVENT_T_DEATH; ProcessEvent on JustDied.
  const runEnemyDeathEventAi = (ef: Fighter): void => {
    const t = ctx.t;
    const castState = enemyCastBySide.get(ef.side as EnemySide);
    if (!castState) return;
    // AI_EVENT_JUST_DIED auto-throw (mask bit 0) — distinct from EVENT_T_DEATH scripts.
    // Cite: CreatureEventAI.cpp:1492–1493; Reset() runs first in C++ but mask is read here.
    if (shouldThrowAiEventJustDied(castState.eventAi)) {
      sendAiEventAround(ef, AI_EVENT_TYPE.JUST_DIED, AIEVENT_DEFAULT_THROW_RADIUS_YD);
    }
    if (castState.eventAi.holders.length === 0) return;
    for (const holder of castState.eventAi.holders) {
      if (holder.exhausted) continue;
      if ((holder.script.eventType | 0) !== EVENT_T.DEATH) continue;
      if (!rollEventAiChance(holder.script, rng)) {
        markEventAiUsed(holder, t, rng);
        continue;
      }
      const intents = processEventAiActions(holder, castState.eventAi, {
        t,
        summons: ef.spec.ai?.summons,
        rng,
        speakerName: ef.spec.name,
      });
      markEventAiUsed(holder, t, rng);
      for (const intent of intents) applyEventAiIntent(ef, intent);
    }
  };

  // JustSummoned MoveFollow + guid track for Burning Spirit 9178. Cite:
  // boss_ambassador_flamelash.cpp:106-114.
  function applyFlamelashSpiritJustSummoned(
    state: ScriptDevRuntimeState,
    add: Fighter,
  ): void {
    // REACT_PASSIVE — feed spirits do not AttackStart the party.
    // Cite: cpp:112 MoveFollow only; no AttackStart on 9178.
    const ocs = enemyCastBySide.get(add.side as EnemySide);
    if (ocs) ocs.eventAi.reactState = REACT_STATE.PASSIVE;
    const tm = ctx.threatByOwner.get(add.side);
    if (tm) tm.clear();
    noteJustSummonedSide(state, add.side);
  }

  /** Which proximity rows each body has already answered. A `once` row is one per spawn. */
  const proximityFired = new WeakMap<Fighter, Set<string>>();

  // MoveInLineOfSight, generalised: an IR row that answers a player standing too close. The Living
  // Poison has melee off and no AttackStart, so presence is all it has. Cite: naxxramas.cpp:1084-1089.
  function runScriptDevProximityTriggers(unit: Fighter): void {
    if (dead(unit)) return;
    const ir = enemyCastBySide.get(unit.side as EnemySide)?.scriptDev?.ir
      ?? scriptDevByCreature((unit.spec.creatureEntry ?? 0) | 0);
    const rows = ir?.proximityTriggers;
    if (!rows?.length) return;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const tag = `proximity_${i}`;
      const fired = proximityFired.get(unit);
      if (row.once && fired?.has(tag)) continue;
      let near = false;
      for (const h of livingHostilesFor(unit)) {
        if (dead(h)) continue;
        if (!(h.side === 'player' || isAllySide(h.side))) continue;
        const d = distanceBetween(unit, h);
        if (d != null && d <= row.withinYd) {
          near = true;
          break;
        }
      }
      if (!near) continue;
      if (row.once) {
        const set = proximityFired.get(unit) ?? new Set<string>();
        set.add(tag);
        proximityFired.set(unit, set);
      }
      applyScriptDevCombatActions(unit, row.actions);
    }
  }

  /** MoveInLineOfSight AttackStart for unattackable Stoneskin Gargoyle. */
  function runStoneskinGargoyleReachCasts(boss: Fighter): void {
    if (((boss.spec.creatureEntry ?? 0) | 0) !== NPC_STONESKIN_GARGOYLE_ENTRY) return;
    const castState = enemyCastBySide.get(boss.side as EnemySide);

    // Only when it has UNIT_FLAG_UNINTERACTIBLE set
    if (!castState || !(castState.eventAi.unitFlags & UNIT_FLAG.UNINTERACTIBLE)) return;

    // Check player proximity
    const player = ctx.player;
    if (!player || dead(player)) return;

    // Not in combat
    const tm = threatOf(boss);
    if (tm && !tm.isEmpty()) return;

    // Within 17.0f, not feigned death, LOS.
    if (player.feigningUntil > ctx.t) return;
    const d = distanceBetween(boss, player);
    if (d == null || d > 17.0) return;
    if (ctx.posOf && ctx.posOf(boss.side) && ctx.posOf(player.side) && !navSightClear(ctx.cfg, ctx.posOf(boss.side)!, ctx.posOf(player.side)!)) return;

    // Cite: naxxramas.cpp:1010-1022 MoveInLineOfSight
    applyEventAiIntent(boss, { kind: 'attack_start', target: 13 });
  }

  /** MoveInLineOfSight reach-cast for tracked Flamelash spirits. */
  function runScriptDevReachCasts(boss: Fighter): void {
    if (((boss.spec.creatureEntry ?? 0) | 0) !== NPC_AMBASSADOR_FLAMELASH) return;
    const castState = enemyCastBySide.get(boss.side as EnemySide);
    const sd = castState?.scriptDev;
    if (!sd || !hasTrackedSummonSides(sd)) return;
    const dues = collectReachCastsDue(sd, {
      bossSide: boss.side,
      creatureEntry: NPC_BURNING_SPIRIT,
      spellId: SPELL_BURNING_SPIRIT,
      withinYd: FLAMELASH_SPIRIT_REACH_YD,
      cite: 'boss_ambassador_flamelash.cpp:69-78',
      distanceYd: (a, b) => {
        const fa = bySide(a as Side);
        const fb = bySide(b as Side);
        if (!fa || !fb) return null;
        // ctx.distanceBetween is number|undefined and collectReachCastsDue guards with
        // `d == null`, so undefined already behaved as null. Say so in the type.
        return distanceBetween(fa, fb) ?? null;
      },
      isAlive: (side) => {
        const f = bySide(side as Side);
        return !!f && !dead(f);
      },
      entryOf: (side) => {
        const f = bySide(side as Side);
        return (f?.spec.creatureEntry ?? 0) | 0;
      },
    });
    for (const due of dues) {
      const spirit = bySide(due.summonSide as Side);
      if (!spirit || dead(spirit) || dead(boss)) continue;
      const sp =
        boss.spec.spells.find((s) => s.id === due.spellId)
        ?? spirit.spec.spells.find((s) => s.id === due.spellId);
      if (!sp) continue;
      push({
        t: ctx.t,
        kind: 'flavor',
        text: `${spirit.spec.name} feeds ${boss.spec.name} (${due.spellId})!`,
      });
      // pWho->CastSpell(m_creature, SPELL_BURNING_SPIRIT). Cite: cpp:76.
      if (typeof ctx.applySpell === 'function') {
        (ctx.applySpell as (src: Fighter, tgt: Fighter, spell: typeof sp) => void)(
          spirit,
          boss,
          sp,
        );
      }
    }
  }

  function applyScriptDevCombatActions(
    actor: Fighter,
    actions: readonly ScriptDevAction[],
    target?: Fighter,
  ): void {
    // Aggro lifecycle runs here before the first swing — install mirror hooks early.
    ensureMirrorHooks();
    const t = ctx.t;
    const actorCast = enemyCastBySide.get(actor.side as EnemySide);
    for (const act of actions) {
      // An unrolled C++ loop keeps its per-iteration instance-data condition on the row (Hakkar's Power:
      // one stack per High Priest still alive). Cite: boss_hakkar.cpp:83-87 GetData(i) != DONE.
      if ('gate' in act && act.gate && !dataGatePasses(act.gate, instanceData)) continue;
      if (act.kind === 'set_instance_data') {
        const field = act.field | 0;
        const next = act.increment
          ? (instanceData.get(field) ?? 0) + (act.value | 0 || 1)
          : (act.value | 0);
        instanceData.set(field, next);
        push({ t, kind: 'instance_data', field, value: next });
      } else if (act.kind === 'yell') {
        // if (urand(0, N)) return — skip unless the roll is 0. Cite: boss_vaelastrasz.cpp:141-144.
        if (act.urandInclusiveMax != null && rng.int(0, act.urandInclusiveMax | 0) !== 0) continue;
        // script_texts now resolves (core.scriptTexts), so this speaks the line instead of
        // printing its id. creature_text is what carries the textId to the recorded clip.
        const textId = act.textIds && act.textIds.length > 0 ? act.textIds[rng.int(0, act.textIds.length - 1)] : (act.textId as number);
        const row = lookupEventAiText(textId);
        if (row) {
          const line = formatEventAiChatLine(actor.spec.name, row);
          push({
            t,
            kind: 'creature_text',
            actor: actor.side,
            textId: textId | 0,
            chatType: line.chatType,
            text: line.text,
          });
        } else {
          push({ t, kind: 'flavor', text: `${actor.spec.name} yells! (${textId})` });
        }
      } else if (act.kind === 'cast_self') {
        // A scripted triggered self-cast executed by the tick, the single owner of that HP threshold.
        // Armed as an HP slot as well, it carried no flags, re-armed every tick and heal-looped.
        const sp = actor.spec.spells.find((s) => s.id === act.spellId);
        push({
          t,
          kind: 'flavor',
          text: `${actor.spec.name} casts ${sp?.name ?? `spell ${act.spellId}`}!`,
        });
        if (sp && typeof ctx.applySpell === 'function') {
          (ctx.applySpell as (src: Fighter, tgt: Fighter, spell: typeof sp) => void)(actor, actor, sp);
        } else if (sp) {
          for (const eff of sp.effects) {
            if (eff.kind === 'heal_max_health') {
              const healed = Math.max(0, actor.spec.maxHealth - actor.hp);
              actor.hp = actor.spec.maxHealth;
              if (healed > 0) push({ t, kind: 'heal', actor: actor.side, amount: Math.round(healed) });
            } else if (eff.kind === 'energize') {
              // EffectMiscValue names the pool; a unit with no such pool gains nothing.
              // Cite: SpellEffects.cpp EffectEnergize; SpellAuras.cpp:4838.
              const pwr = eff.powerType | 0;
              const max = maxPowerOfType(actor, pwr);
              if (max > 0) {
                const cur = powerOfType(actor, pwr);
                setPowerOfType(actor, pwr, Math.min(max, cur + (eff.max ?? eff.min ?? 0)));
              }
            }
          }
        }
        const ownSummons = sp ? new Set(planCastSummons(actor, sp).map((o) => o.creature)) : null;
        for (const step of planNonCharmAuraOnApply(
          act.spellId,
          sp?.name ?? `spell ${act.spellId}`,
          t,
          actor.spec.spells,
        )) {
          // applySpell above already spawned the cast's own 41/42 via runCastSummons.
          if (step.kind === 'summon' && ownSummons?.has(step.creatureEntry)) continue;
          if (step.kind === 'summon') {
            const life = durMs(sp?.durationIndex) ?? 0;
            for (let i = 0; i < step.count; i++) {
              const add = injectEnemySummon(actor, step.creatureEntry, life);
              if (add && step.isGuardian) {
                add.spec.isGuardian = true;
                if (step.createdBySpell) add.spec.createdBySpell = step.createdBySpell;
              }
            }
          } else if (step.kind === 'flavor') {
            push({ t, kind: 'flavor', text: `${actor.spec.name} ${step.text}` });
          }
        }
      } else if (act.kind === 'summon') {
        if (act.creatureEntry && act.creatureEntry > 0) {
          const isSpirit =
            (act.creatureEntry | 0) === NPC_BURNING_SPIRIT
            && ((actor.spec.creatureEntry ?? 0) | 0) === NPC_AMBASSADOR_FLAMELASH;
          const add = injectEnemySummon(
            actor,
            act.creatureEntry,
            isSpirit ? FLAMELASH_SPIRIT_DESPAWN_MS : 0,
          );
          if (add && isSpirit && actorCast?.scriptDev) {
            applyFlamelashSpiritJustSummoned(actorCast.scriptDev, add);
          }
        }
      } else if (act.kind === 'summon_count') {
        if (act.creatureEntry && act.creatureEntry > 0) {
          const n = Math.max(0, act.count | 0);
          const worldPos =
            act.x != null && act.y != null ? { x: act.x, y: act.y } : undefined;
          const isSpirit =
            (act.creatureEntry | 0) === NPC_BURNING_SPIRIT
            && ((actor.spec.creatureEntry ?? 0) | 0) === NPC_AMBASSADOR_FLAMELASH;
          for (let i = 0; i < n; i++) {
            const add = injectEnemySummon(
              actor,
              act.creatureEntry,
              isSpirit ? FLAMELASH_SPIRIT_DESPAWN_MS : 0,
              worldPos,
            );
            if (add && isSpirit && actorCast?.scriptDev) {
              applyFlamelashSpiritJustSummoned(actorCast.scriptDev, add);
            }
          }
        }
      } else if (act.kind === 'update_entry') {
        const morph = actor.spec.scriptDevMorphs?.find((m) => m.creatureEntry === act.entry);
        const oldName = actor.spec.name;
        actor.spec.creatureEntry = act.entry;
        if (morph) {
          actor.spec.name = morph.name;
          actor.spec.maxHealth = morph.maxHealth;
          if (morph.armor != null) actor.spec.armor = morph.armor;
          if (morph.weapon) actor.spec.weapon = morph.weapon;
          actor.hp = morph.maxHealth;
          push({ t, kind: 'flavor', text: `${oldName} transforms into ${morph.name}!` });
        } else {
          push({ t, kind: 'flavor', text: `${actor.spec.name} transforms! (entry ${act.entry})` });
        }
      } else if (act.kind === 'remove_auras') {
        removeAurasDueToSpell(actor, act.spellId | 0);
        push({
          t,
          kind: 'remove_auras',
          actor: actor.side,
          target: actor.side,
          spellId: act.spellId | 0,
        });
      } else if (act.kind === 'flavor') {
        push({ t, kind: 'flavor', text: `${actor.spec.name} ${act.text}` });
      } else if (act.kind === 'open_door') {
        push({
          t,
          kind: 'flavor',
          text: `Door ${act.goEntry} opens.`,
        });
      } else if (act.kind === 'close_door') {
        push({
          t,
          kind: 'flavor',
          text: `Door ${act.goEntry} closes.`,
        });
      } else if (act.kind === 'quest_credit') {
        const id = act.entry | 0;
        // The entry means a different thing per credit kind, and this arm read every row as a quest
        // id. Egan's Blaster credits a CREATURE, so the Restless Soul handed back nothing at all.
        if (id > 0) {
          const kind = act.credit ?? 'event';
          if (kind === 'event') {
            push({ t, kind: 'quest_event', actor: actor.side, questId: id, rewardGroup: false });
            emitSimEffect(ctx, { kind: 'questEvent', questId: id, rewardGroup: false });
          } else if (kind === 'creature') {
            // Same call ACTION_T_KILLED_MONSTER already uses, so the questlog write and the log
            // line come from one place. Cite: Player.cpp:13477 KilledMonsterCredit.
            emitSimEffect(ctx, { kind: 'killCredit', creatureEntry: id });
          }
          // A talk credit belongs to the world interact path, not a session: it credits a talk
          // objective, and crediting it as a kill here would be the wrong objective entirely.
        }
      } else if (act.kind === 'stop_combat') {
        if (!act.attackOnly) {
          push({
            t,
            kind: 'flavor',
            text: `${actor.spec.name} yields!`,
          });
          if (actor.hp > 1) actor.hp = Math.max(1, actor.hp);
          if (!ctx.ended) {
            ctx.ended = true;
            ctx.winner = 'player';
          }
        } else {
          // AttackStop(true) — halt melee, encounter continues (Mr. Smite chest walk).
          // Cite: boss_mr_smite.cpp:214 AttackStop(true).
          actor.autoAttackEnabled = false;
        }
      } else if (act.kind === 'force_despawn') {
        const delayMs = Math.max(0, (act.delayMs ?? 0) | 0);
        if (delayMs <= 0) {
          forceDespawnEnemy(actor);
        } else if (actorCast) {
          actorCast.eventAi.forceDespawnAt = t + delayMs;
        }
      } else if (act.kind === 'despawn_guardians') {
        // Cite: CreatureEventAI.cpp ACTION_T_DESPAWN_GUARDIANS; boss_jeklik.cpp:185-195.
        const owned = guardianSidesBySummoner.get(actor.side);
        if (owned) {
          const want = act.entryId | 0;
          for (const side of [...owned]) {
            const g = ctx.sideFighter?.(side) ?? null;
            if (!g || dead(g)) {
              owned.delete(side);
              continue;
            }
            if (want > 0 && ((g.spec.creatureEntry ?? 0) | 0) !== want) continue;
            forceDespawnEnemy(g);
            owned.delete(side);
          }
        }
      } else if (act.kind === 'set_death_prevention') {
        // Cite: CreatureAI.cpp:130-135 SetDeathPrevention; Unit.cpp:1000-1001 leave 1 HP.
        if (actorCast) {
          actorCast.eventAi.deathPrevention = act.enabled;
          if (act.enabled) actorCast.eventAi.deathPreventionFired = false;
        }
        push({ t, kind: 'death_prevention', actor: actor.side, enabled: act.enabled });
      } else if (act.kind === 'set_phase') {
        if (actorCast) {
          rearmCreatureCastSlotsOnPhase(actorCast.slots, actorCast.eventAi.phase, act.phase | 0, t, rng);
          actorCast.eventAi.phase = act.phase | 0;
          if (actorCast.scriptDev) actorCast.scriptDev.phase = act.phase | 0;
        }
        push({ t, kind: 'phase', actor: actor.side, phase: act.phase | 0 });
      } else if (act.kind === 'set_health_pct') {
        // Cite: boss_vaelastrasz.cpp:115 Reset SetHealth(uint32(GetMaxHealth()*.3)). Floor at 1:
        // this runs on an evade Reset now, and a 0% row there would kill the boss it re-opens.
        const pct = Math.max(0, Math.min(100, act.pct));
        actor.hp = Math.max(1, Math.floor(actor.spec.maxHealth * (pct / 100)));
        push({ t, kind: 'flavor', text: `${actor.spec.name} health set to ${pct}%.` });
      } else if (act.kind === 'cast_on_player') {
        // The one-target twin of the group cast. It existed only on the GO-use path, so a scripted
        // NPC cast aimed at the player did nothing at all inside a session.
        const sp = actor.spec.spells.find((s) => s.id === act.spellId);
        if (!dead(player) && !(act.auraNotPresent && player.buffActive.has(act.spellId | 0))) {
          push({
            t,
            kind: 'flavor',
            text: `${actor.spec.name} casts ${sp?.name ?? `spell ${act.spellId}`} on you!`,
          });
          if (sp && typeof ctx.applySpell === 'function') {
            (ctx.applySpell as (src: Fighter, tgt: Fighter, spell: typeof sp) => void)(
              actor,
              player,
              sp,
            );
          }
        }
      } else if (act.kind === 'cast_on_group') {
        // Raid-wide buff (Vael Essence of the Red). Cite: boss_vaelastrasz.cpp:152-153;
        // stratholmeScripts.cpp:71-87 Group loop shape mirrored for combat party.
        const sp = actor.spec.spells.find((s) => s.id === act.spellId);
        const targets = ctx.partyUnits().filter((u) => !dead(u));
        push({
          t,
          kind: 'flavor',
          text: `${actor.spec.name} casts ${sp?.name ?? `spell ${act.spellId}`} on the group!`,
        });
        if (sp && typeof ctx.applySpell === 'function') {
          for (const tgt of targets) {
            (ctx.applySpell as (src: Fighter, tgt: Fighter, spell: typeof sp) => void)(
              actor,
              tgt,
              sp,
            );
          }
        }
      } else if (act.kind === 'cast_on_script_targets') {
        // DoCastSpellIfCan(nullptr, id) → spell_script_target living entries.
        // Cite: boss_majordomo_executus.cpp:243; SpellTargets.cpp:40,71; spell_script_target.
        const sp = actor.spec.spells.find((s) => s.id === act.spellId);
        const entries = new Set(scriptTargetCreatureEntries(act.spellId | 0));
        const mode = scriptTargetPickMode(sp?.rawEffects);
        const radiusYd = sp?.radiusYd != null && sp.radiusYd > 0 ? sp.radiusYd : null;
        const candidates: Fighter[] = [];
        for (const other of ctx.livingEnemies()) {
          if (other === actor) continue;
          const entry = (other.spec.creatureEntry ?? 0) | 0;
          if (!entries.has(entry)) continue;
          if (radiusYd != null) {
            const d = distanceBetween(actor, other);
            if (d != null && d > radiusYd) continue;
          }
          candidates.push(other);
        }
        let targets = candidates;
        if (mode === 'near' && candidates.length > 1) {
          candidates.sort((a, b) => {
            const da = distanceBetween(actor, a) ?? Number.POSITIVE_INFINITY;
            const db = distanceBetween(actor, b) ?? Number.POSITIVE_INFINITY;
            return da - db;
          });
          targets = candidates.slice(0, 1);
        }
        push({
          t,
          kind: 'flavor',
          text: `${actor.spec.name} casts ${sp?.name ?? `spell ${act.spellId}`} on script targets!`,
        });
        if (sp && typeof ctx.applySpell === 'function') {
          for (const tgt of targets) {
            // Applying a friendly-resolved buff sticks it on the CASTER, so self-cast on each script
            // target instead — that is what lands the encouragement auras on the Flamewakers.
            (ctx.applySpell as (src: Fighter, tgt: Fighter, spell: typeof sp) => void)(
              tgt,
              tgt,
              sp,
            );
          }
        }
      } else if (act.kind === 'set_combat_movement') {
        // Cite: UnitAI.cpp:301-318 SetCombatMovement. Lived only in the onDeath switch, so a
        // Reset that turns movement back on (boss_eranikus) never reached the fighter.
        if (actorCast) actorCast.eventAi.combatMovement = act.enabled;
        push({
          t,
          kind: 'flavor',
          text: act.enabled
            ? `${actor.spec.name} resumes combat movement.`
            : `${actor.spec.name} stops combat movement.`,
        });
      } else if (act.kind === 'set_melee_enabled') {
        if (actorCast) actorCast.eventAi.meleeEnabled = act.enabled;
        actor.autoAttackEnabled = act.enabled;
      } else if (act.kind === 'send_ai_event') {
        // UnitAI::SendAIEvent — receiver->AI()->ReceiveAIEvent. Cite: UnitAI.cpp:664-668.
        const recvs: Fighter[] = [];
        if (act.receiver === 'self') {
          recvs.push(actor);
        } else {
          const entry = (act.creatureEntry ?? 0) | 0;
          if (entry > 0) {
            for (const other of ctx.livingEnemies()) {
              if ((other.spec.creatureEntry ?? 0) !== entry) continue;
              if (act.radiusYd != null) {
                const d = distanceBetween(actor, other);
                if (d != null && d > act.radiusYd) continue;
              }
              recvs.push(other);
            }
          }
        }
        for (const recv of recvs) {
          push({
            t,
            kind: 'ai_event',
            actor: actor.side,
            eventType: act.eventType | 0,
            receiver: recv.side,
          });
          const ir = enemyCastBySide.get(recv.side as EnemySide)?.scriptDev?.ir
            ?? scriptDevByCreature((recv.spec.creatureEntry ?? 0) | 0);
          if (!ir) continue;
          const hook = handleReceiveAiEvent(ir, act.eventType | 0, (actor.spec.creatureEntry ?? 0) | 0);
          if (!hook.handled) continue;
          applyScriptDevCombatActions(recv, hook.actions);
        }
      } else if (act.kind === 'reset_threat') {
        // UnitAI::DoResetThreat → modifyAllThreatPercent(-100). Cite: UnitAI.cpp:773-781.
        // of:'cast' → modifyThreatPercent(that unit, -100). Cite: boss_onyxia.cpp:387-393.
        const resetTm = threatOf(actor);
        if (act.of === 'cast' && target) {
          if (resetTm) resetTm.modifyThreatPercent(target.side, -100);
          push({
            t, kind: 'threat_single', actor: actor.side, target: target.side,
            value: -100, isDirect: false,
          });
        } else {
          if (resetTm) resetTm.modifyAllThreatPercent(-100);
          push({ t, kind: 'threat_all_pct', actor: actor.side, percent: -100 });
        }
      } else if (act.kind === 'chase_focus') {
        // DoAttackNewTarget: DoResetThreat + random player + AddThreat + AttackStart.
        // Cite: boss_buru.cpp:131-136; ThreatManager addThreatDirectly / setCurrentVictimByTarget.
        const chaseTm = threatOf(actor);
        if (chaseTm) chaseTm.modifyAllThreatPercent(-100);
        push({ t, kind: 'threat_all_pct', actor: actor.side, percent: -100 });
        const pool = livingHostilesFor(actor).filter((h) => {
          if (dead(h)) return false;
          // SELECT_FLAG_PLAYER. Cite: boss_buru.cpp:133; Unit.h SelectFlags.
          return h.side === 'player' || isAllySide(h.side);
        });
        if (chaseTm && pool.length > 0) {
          const tgt = pool[rng.int(0, pool.length - 1)]!;
          const threatAmt = act.threat;
          chaseTm.addThreatDirectly(tgt.side, threatAmt, false);
          chaseTm.setCurrentVictimByTarget(tgt.side);
          push({
            t,
            kind: 'threat_single',
            actor: actor.side,
            target: tgt.side,
            value: threatAmt,
            isDirect: true,
          });
          push({ t, kind: 'attack_start', actor: actor.side, target: tgt.side });
        }
      } else if (act.kind === 'adds_threat_players') {
        // HandleOpenGates AddThreat(player) per add. No side geometry — every listed
        // living add engages the raid. Cite: boss_gothik.cpp:261-287.
        const entries = new Set(act.creatureEntries.map((e) => e | 0));
        for (const add of ctx.livingEnemies()) {
          if (!entries.has((add.spec.creatureEntry ?? 0) | 0)) continue;
          const tm = threatOf(add);
          if (!tm) continue;
          tm.addThreatDirectly('player', 1, false);
          for (const a of ctx.livingAllies()) tm.addThreatDirectly(a.side, 1, false);
          push({ t, kind: 'zone_combat_pulse', actor: add.side });
        }
      } else if (act.kind === 'arm_timer') {
        // CombatAI::ResetCombatAction — clear disabled + arm delayMs.
        // Cite: boss_marli.cpp:101-105 SpellHitTarget → ResetCombatAction(MARLI_CHARGE, 1000).
        const ir = actorCast?.scriptDev?.ir;
        const timer = ir?.timers.find((tm) => tm.id === act.timerId);
        if (actorCast && timer) {
          for (const slot of actorCast.slots) {
            if (slot.entry.spellId !== timer.spellId) continue;
            slot.exhausted = false;
            slot.readyAt = t + (act.delayMs | 0);
          }
        }
      } else if (act.kind === 'disable_timer') {
        // Cite: boss_thekal.cpp:365-368 PreventRevive DisableTimer(ACTION_RESSURECTION).
        const want = (act.creatureEntry ?? (actor.spec.creatureEntry ?? 0)) | 0;
        // Every enemy SEAT, corpse included: PreventRevive has to reach the schedule of an add
        // that is already down. Cite: boss_thekal.cpp:365-368.
        for (const ef of ctx.enemyBlock()) {
          if (((ef.spec.creatureEntry ?? 0) | 0) !== want) continue;
          const cs = enemyCastBySide.get(ef.side as EnemySide);
          const timer = cs?.scriptDev?.ir.timers.find((tm) => tm.id === act.timerId);
          if (!cs || !timer) continue;
          for (const slot of cs.slots) {
            if (slot.entry.spellId !== timer.spellId) continue;
            slot.exhausted = true;
          }
        }
      } else if (act.kind === 'store_threat') {
        // Cite: boss_mandokir.cpp:169 m_targetThreat = getThreat(invoker).
        const tgt = target;
        if (tgt && actorCast?.scriptDev) {
          const amount = threatOf(actor)?.getThreat(tgt.side) ?? 0;
          actorCast.scriptDev.gazeThreat = { side: tgt.side, amount };
        }
      } else if (act.kind === 'charge_if_threat_up') {
        // Cite: boss_mandokir.cpp:176-181 getThreat > m_targetThreat → SPELL_CHARGE_GAZE.
        const stored = actorCast?.scriptDev?.gazeThreat;
        if (stored) {
          const now = threatOf(actor)?.getThreat(stored.side) ?? 0;
          if (now > stored.amount) {
            const tgt = bySide(stored.side as Side);
            const sp = actor.spec.spells.find((s) => s.id === (act.spellId | 0));
            if (tgt && !dead(tgt) && sp && typeof ctx.applySpell === 'function') {
              (ctx.applySpell as (src: Fighter, dst: Fighter, spell: typeof sp) => void)(actor, tgt, sp);
            }
          }
        }
      } else if (act.kind === 'set_unattackable') {
        // Until-event stand-in (durationIndex 21). Cite: boss_thaddius.cpp:112.
        const entry = (actor.spec.creatureEntry ?? 0) | 0;
        if (!allowStoneskinGargoyleStoneForm(entry, actor.spec.movementType)) continue;
        actor.unattackableUntil = Math.max(actor.unattackableUntil, t + 3_600_000);
        if (actorCast) {
          actorCast.eventAi.unitFlags |= UNIT_FLAG.UNINTERACTIBLE;
        }
      } else if (act.kind === 'clear_unattackable') {
        actor.unattackableUntil = 0;
        if (actorCast) {
          actorCast.eventAi.unitFlags &= ~UNIT_FLAG.UNINTERACTIBLE;
        }
      } else if (act.kind === 'explode_proximity') {
        // The payload's bake row carries school and mitigation, the AMOUNT is CastCustomSpell's, and
        // it sits in no kit — so the bake is the fallback. Cite: boss_buru.cpp:269-281.
        const payload = actor.spec.spells.find((s) => s.id === (act.payloadSpellId | 0))
          ?? ctx.spellOf?.(act.payloadSpellId | 0)
          ?? null;
        const school = payload?.effects.find(
          (e): e is Extract<typeof e, { kind: 'direct_damage' }> => e.kind === 'direct_damage',
        )?.school;
        const maxYd = act.maxYd > 0 ? act.maxYd : 0;
        if (payload && school && maxYd > 0 && typeof ctx.dealDamage === 'function') {
          const level = actor.spec.level | 0;
          const hit = (tgt: Fighter, raw: number): void => {
            if (!(raw > 0)) return;
            // dealDamage does not log — every caller pushes its own beat (groundPoolTick.ts:178).
            const amount = (ctx.dealDamage as NonNullable<typeof ctx.dealDamage>)(
              tgt, raw, school, level,
              { attacker: actor, spell: payload, damageType: 'spell' },
            );
            push({
              t, kind: 'spell_hit', actor: actor.side, target: tgt.side,
              spellId: payload.id, name: payload.name, result: 'hit', amount, school,
            });
          };
          for (const tgt of livingHostilesFor(actor)) {
            if (dead(tgt)) continue;
            // An unmodelled distance is the AoE EDGE, never the centre: a missing position must not
            // invent the 500 the C++ only pays at contact. Cite: cpp:274 GetDistance(DIST_CALC_COMBAT_REACH).
            const d = distanceBetween(actor, tgt) ?? maxYd;
            if (d > maxYd) continue;
            hit(tgt, act.playerBase + ((maxYd - Math.min(d, maxYd)) / maxYd) * act.playerScale);
          }
          for (const row of act.creaturePctMaxHealth ?? []) {
            const want = row.creatureEntry | 0;
            for (const other of ctx.livingEnemies()) {
              if (((other.spec.creatureEntry ?? 0) | 0) !== want) continue;
              const d = distanceBetween(actor, other);
              if (d != null && d > maxYd) continue;
              hit(other, Math.floor((other.spec.maxHealth * row.pct) / 100));
              // ScheduleNewTarget runs on the CREATURE that took the hit, not on the egg.
              if (row.actions?.length && !dead(other)) applyScriptDevCombatActions(other, row.actions);
            }
          }
        }
      } else if (act.kind === 'deal_group_abilities') {
        // std::shuffle then deal pool[i] to self and each living sibling in range, each self-casting
        // its own. Cite: mob_anubisath_sentinel.cpp:127-131,140-159,183-205.
        if (actorCast?.scriptDev && actorCast.scriptDev.dealtAbilitySpellId == null) {
          const entry = (actor.spec.creatureEntry ?? 0) | 0;
          const group: Fighter[] = [actor];
          for (const other of ctx.livingEnemies()) {
            if (other === actor) continue;
            if (((other.spec.creatureEntry ?? 0) | 0) !== entry) continue;
            const d = distanceBetween(actor, other);
            if (d != null && d > act.radiusYd) continue;
            group.push(other);
          }
          const pool = act.spellIds.map((id) => id | 0);
          for (let i = pool.length - 1; i > 0; i--) {
            const j = rng.int(0, i);
            const tmp = pool[i]!;
            pool[i] = pool[j]!;
            pool[j] = tmp;
          }
          for (let i = 0; i < group.length && i < pool.length; i++) {
            const member = group[i]!;
            const st = enemyCastBySide.get(member.side as EnemySide)?.scriptDev;
            // SetAbility returns early when m_myAbility is already set — never re-deal.
            if (!st || st.dealtAbilitySpellId != null) continue;
            st.dealtAbilitySpellId = pool[i]!;
            applyScriptDevCombatActions(member, [{
              kind: 'cast_self',
              spellId: pool[i]!,
              castFlags: CAST_FLAG.TRIGGERED,
              cite: act.cite,
            }]);
          }
        }
      } else if (act.kind === 'damage_in_radius') {
        // The payload's own bake row carries the amount, the school and the radius — nothing here
        // names a number. Cite: naxxramas.cpp:1089; spell_template 28433.
        const sp = actor.spec.spells.find((s) => s.id === (act.spellId | 0))
          ?? ctx.spellOf?.(act.spellId | 0)
          ?? null;
        const hit = sp?.effects.find(
          (e): e is Extract<typeof e, { kind: 'direct_damage' }> => e.kind === 'direct_damage',
        );
        const radius = sp?.radiusYd ?? 0;
        if (sp && hit && radius > 0 && typeof ctx.dealDamage === 'function') {
          const level = actor.spec.level | 0;
          for (const tgt of livingHostilesFor(actor)) {
            if (dead(tgt)) continue;
            const d = distanceBetween(actor, tgt);
            if (d != null && d > radius) continue;
            const raw = hit.min + rng.int(0, Math.max(0, (hit.max | 0) - (hit.min | 0)));
            const amount = (ctx.dealDamage as NonNullable<typeof ctx.dealDamage>)(
              tgt, raw, hit.school, level,
              { attacker: actor, spell: sp, damageType: 'spell' },
            );
            push({
              t, kind: 'spell_hit', actor: actor.side, target: tgt.side,
              spellId: sp.id, name: sp.name, result: 'hit', amount, school: hit.school,
            });
          }
        }
      } else if (act.kind === 'cast_on_random_players') {
        // The pick is a SET, shuffled then resized — so it is drawn once and every member takes the
        // spell, not one unit re-rolled per cast. Cite: boss_maexxna.cpp:212-223.
        const sp = actor.spec.spells.find((s) => s.id === (act.spellId | 0))
          ?? ctx.spellOf?.(act.spellId | 0)
          ?? null;
        if (sp && typeof ctx.applySpell === 'function') {
          const victim = ctx.hostileTargetOf?.(actor) ?? null;
          const pool = livingHostilesFor(actor).filter((h) => {
            if (dead(h)) return false;
            // SELECT_FLAG_PLAYER: an ally seat is a player-controlled body here.
            if (!(h.side === 'player' || isAllySide(h.side))) return false;
            // SELECT_FLAG_SKIP_TANK is the CURRENT victim, not the role.
            if (act.skipTopThreat && victim != null && h.side === victim.side) return false;
            return true;
          });
          for (let i = pool.length - 1; i > 0; i--) {
            const j = rng.int(0, i);
            const tmp = pool[i]!;
            pool[i] = pool[j]!;
            pool[j] = tmp;
          }
          const take = Math.min(act.count | 0, pool.length);
          for (let i = 0; i < take; i++) {
            const tgt = pool[i]!;
            (ctx.applySpell as (src: Fighter, dst: Fighter, spell: typeof sp) => void)(actor, tgt, sp);
            push({ t, kind: 'flavor', text: `${tgt.spec.name} is wrapped in ${sp.name}!` });
          }
        }
      } else if (act.kind === 'proxy_cast_on_victim') {
        // GetClosestCreatureWithEntry is measured from the VICTIM, not from this script.
        // Cite: boss_mandokir.cpp:209-211.
        const victim = target;
        if (victim) {
          let nearest: Fighter | undefined;
          let best = act.radiusYd;
          for (const e of ctx.livingEnemies()) {
            if (((e.spec.creatureEntry ?? 0) | 0) !== (act.casterEntry | 0)) continue;
            const d = distanceBetween(victim, e);
            if (d != null && d <= best) {
              best = d;
              nearest = e;
            }
          }
          const sp = nearest
            ? (nearest.spec.spells.find((s) => s.id === (act.spellId | 0))
              ?? actor.spec.spells.find((s) => s.id === (act.spellId | 0))
              ?? ctx.spellOf?.(act.spellId | 0)
              ?? null)
            : null;
          if (nearest && sp && typeof ctx.applySpell === 'function') {
            (ctx.applySpell as (src: Fighter, dst: Fighter, spell: typeof sp) => void)(nearest, victim, sp);
            push({ t, kind: 'flavor', text: `${nearest.spec.name} calls ${victim.spec.name} back (${sp.name})!` });
          }
        }
      } else if (act.kind === 'roll_instance_pair') {
        // Per-INSTANCE: written only while both fields are NOT_STARTED, and the second index is the
        // first plus urand(1,4) mod 5. Cite: SpellEffects.cpp:998-999; blackwing_lair.cpp:641,650.
        const lf = act.leftField | 0;
        const rf = act.rightField | 0;
        const lVals = act.leftValues.map((v) => v | 0);
        const rVals = act.rightValues.map((v) => v | 0);
        const already = (instanceData.get(lf) ?? 0) !== 0 || (instanceData.get(rf) ?? 0) !== 0;
        if (!already && lVals.length > 0 && rVals.length === lVals.length) {
          const n = rVals.length;
          const r = rng.int(0, n - 1);
          const l = (r + rng.int(1, n - 1)) % n;
          for (const [field, value] of [[lf, lVals[l]!], [rf, rVals[r]!]] as const) {
            instanceData.set(field, value);
            push({ t, kind: 'instance_data', field, value });
          }
        }
      } else if (act.kind === 'shrink_creature_pct') {
        // A raw SetHealth, not a damage event: no armor, no resist roll, no threat.
        // Cite: boss_viscidus.cpp:505-521.
        const want = (act.creatureEntry | 0);
        const floor = Math.max(1, act.minHealth ?? 1);
        for (const other of ctx.livingEnemies()) {
          if (((other.spec.creatureEntry ?? 0) | 0) !== want) continue;
          const lose = Math.floor((other.spec.maxHealth * act.pct) / 100);
          if (lose <= 0 || other.hp <= floor + lose) continue;
          other.hp -= lose;
          push({
            t,
            kind: 'flavor',
            text: `${other.spec.name} shrinks (${act.pct}% of its bulk).`,
          });
        }
      } else if (act.kind === 'cast_on_cast_target') {
        // The unit the ROW's cast resolved to; `cast_on_player` would aim at the party leader.
        // Cite: boss_sapphiron.cpp:265-279 PeriodicIceBolt.
        const tgt = target;
        const sp = actor.spec.spells.find((s) => s.id === (act.spellId | 0))
          ?? ctx.spellOf?.(act.spellId | 0)
          ?? null;
        const already = act.auraNotPresent === true && tgt != null
          && tgt.buffActive.has(act.spellId | 0);
        if (tgt && !dead(tgt) && sp && !already && typeof ctx.applySpell === 'function') {
          (ctx.applySpell as (src: Fighter, dst: Fighter, spell: typeof sp) => void)(actor, tgt, sp);
          push({ t, kind: 'flavor', text: `${tgt.spec.name} is caught in ${sp.name}!` });
        }
      } else if (act.kind === 'raise_corpses') {
        // The corpse list is the enemy BLOCK, not the living view: a dead body keeps its seat, which
        // is the same reason PreventRevive walks it. Cite: boss_nefarian.cpp:211-222.
        const want = new Set(act.fromEntries.map((e) => e | 0));
        const cap = act.maxCount != null && act.maxCount > 0 ? act.maxCount | 0 : Infinity;
        let raised = 0;
        for (const corpse of ctx.enemyBlock()) {
          if (raised >= cap) break;
          if (!dead(corpse)) continue;
          if (!want.has((corpse.spec.creatureEntry ?? 0) | 0)) continue;
          const at = ctx.posOf?.(corpse.side);
          const add = injectEnemySummon(
            actor,
            act.creatureEntry | 0,
            0,
            at != null && Number.isFinite(at.x) && Number.isFinite(at.y) ? { x: at.x, y: at.y } : undefined,
          );
          if (add) raised++;
        }
        push({
          t,
          kind: 'flavor',
          text: raised > 0
            ? `${actor.spec.name} raises ${raised} fallen drakonid${raised === 1 ? '' : 's'}!`
            : `${actor.spec.name} finds no fallen drakonids to raise.`,
        });
      } else if (act.kind === 'cast_on_victim_change') {
        // m_victimGuid != GetVictim() → cast, then store. Cite: boss_kelthuzad.cpp:504-521.
        const sd = actorCast?.scriptDev;
        const victim = ctx.hostileTargetOf?.(actor) ?? null;
        const side = victim && !dead(victim) ? victim.side : null;
        if (sd && side != null && sd.lastVictimSide !== side) {
          const first = sd.lastVictimSide === undefined;
          sd.lastVictimSide = side;
          // The first poll only STORES the guid; the C++ casts on the next change, not on the first.
          if (!first) {
            const sp = actor.spec.spells.find((s) => s.id === (act.spellId | 0))
              ?? ctx.spellOf?.(act.spellId | 0)
              ?? null;
            if (sp && victim && typeof ctx.applySpell === 'function') {
              (ctx.applySpell as (src: Fighter, dst: Fighter, spell: typeof sp) => void)(actor, victim, sp);
              push({ t, kind: 'flavor', text: `${actor.spec.name} drains ${victim.spec.name} (${sp.name})!` });
            }
          }
        }
      } else if (act.kind === 'transfer_group_ability') {
        // DoTransferAbility: my ability plus Heal Brethren onto every living sibling in range.
        // Cite: mob_anubisath_sentinel.cpp:163-181; :225-243 SharePowers casts both on the target.
        const mine = actorCast?.scriptDev?.dealtAbilitySpellId ?? 0;
        if (mine > 0) {
          const entry = (actor.spec.creatureEntry ?? 0) | 0;
          for (const other of ctx.livingEnemies()) {
            if (other === actor || dead(other)) continue;
            if (((other.spec.creatureEntry ?? 0) | 0) !== entry) continue;
            const d = distanceBetween(actor, other);
            if (d != null && d > act.radiusYd) continue;
            const heals = act.healSpellId ? [act.healSpellId | 0] : [];
            for (const id of [mine, ...heals]) {
              applyScriptDevCombatActions(other, [{
                kind: 'cast_self',
                spellId: id,
                castFlags: CAST_FLAG.TRIGGERED,
                cite: act.cite,
              }]);
            }
          }
        }
      }
    }
  }

  const applyScriptDevTimerActions = (ef: Fighter, spellId: number, target?: Fighter): void => {
    const ir = enemyCastBySide.get(ef.side as EnemySide)?.scriptDev?.ir;
    if (!ir) return;
    const entry = (ef.spec.creatureEntry ?? 0) | 0;
    for (const timer of ir.timers) {
      const rotate = timer.rotateSpellIds ?? [];
      // A per-spawn pick fires under a DIFFERENT id than the row declares, so the row's actions have
      // to match on the pool too. Cite: zulgurubScripts.cpp:61,110-115.
      const picked = timer.pickPerSpawnSpellIds ?? [];
      if (timer.spellId !== spellId && !rotate.includes(spellId) && !picked.includes(spellId)) continue;
      if (timer.creatureEntry != null && timer.creatureEntry !== entry) continue;
      applyScriptDevCombatActions(ef, timer.actions ?? [], target);
    }
  };

  // One-shot EventAI pulses. Nine gates read a context field no polled build ever sets, so each was
  // permanently false: 177 DB rows, 51 on census creatures. Death already worked this way.
  const pulseEnemyEvent = (
    ef: Fighter,
    eventType: number,
    patch: Record<string, unknown>,
  ): void => {
    const castState = enemyCastBySide.get(ef.side as EnemySide);
    if (!castState || castState.eventAi.holders.length === 0) return;
    // Cheap guard: nothing of this type armed means no work at all for the 99% of creatures
    // that carry none of these rows.
    if (!castState.eventAi.holders.some((h) => (h.script.eventType | 0) === (eventType | 0))) return;
    const intents = pulseEventAi(
      castState.eventAi,
      eventType,
      {
        t: ctx.t,
        hpPct: Math.floor((ef.hp * 100) / Math.max(1, ef.spec.maxHealth)),
        inCombat: (threatOf(ef)?.isEmpty() ?? true) === false,
        ...patch,
      } as Parameters<typeof pulseEventAi>[2],
      { rng, summons: ef.spec.ai?.summons, speakerName: ef.spec.name },
    );
    for (const i of intents) applyEventAiIntent(ef, i);
  };

  /** EVENT_T_KILL (5) — this creature killed a player-controlled unit. 25 DB rows. */
  const notifyEventAiKill = (killer: Fighter, victim?: Fighter): void => {
    pulseEnemyEvent(killer, EVENT_T.KILL, { justKilled: true });
    const ir = scriptDevByCreature((killer.spec.creatureEntry ?? 0) | 0);
    if (ir) {
      const acts = lifecycleActions(ir, 'onKill');
      // KilledUnit's own argument: proxy_cast_on_victim measures its search from the BODY.
      if (acts.length) applyScriptDevCombatActions(killer, acts, victim);
    }
    if (((killer.spec.creatureEntry ?? 0) | 0) === 11382 && victim && !isEnemySide(victim.side)) {
      // The ding every third kill. The chained-spirit revive that sat here is now his IR's
      // proxy_cast_on_victim, so Ohgan's copy gets it too. Cite: boss_mandokir.cpp:186-204.
      const n = (mandokirKillCount.get(killer) ?? 0) + 1;
      if (n >= 3) {
        mandokirKillCount.set(killer, 0);
        const ding = killer.spec.spells.find((s) => (s.id | 0) === 24312);
        if (ding && typeof ctx.applySpell === 'function') ctx.applySpell(killer, killer, ding);
        applyScriptDevCombatActions(killer, [{
          kind: 'yell',
          textId: -1309016,
          cite: 'boss_mandokir.cpp:194 DoScriptText(SAY_DING_KILL -1309016)',
        }]);
      } else {
        mandokirKillCount.set(killer, n);
      }
    }
  };

  /** EVENT_T_SUMMONED_UNIT (17) / EVENT_T_SUMMONED_JUST_DIED (25). 1 + 9 DB rows. */
  const notifyEventAiSummoned = (summoner: Fighter, summonedEntry: number, died: boolean): void => {
    pulseEnemyEvent(
      summoner,
      died ? EVENT_T.SUMMONED_JUST_DIED : EVENT_T.SUMMONED_UNIT,
      { summonedEntry: summonedEntry | 0 },
    );
  };

  // CreatureAI::SpellHit, scripted side, running on the unit a spell was DELIVERED to: it silences the
  // caster, sheds an aura, yells or despawns. The hook had one caller, so no cast in a fight reached it.
  function runScriptDevSpellHit(tgt: Fighter, caster: Fighter, spellId: number): void {
    const state = enemyCastBySide.get(tgt.side as EnemySide)?.scriptDev;
    if (!state || !(state.ir.spellHits?.length)) return;
    const active = ctx.tickInputs?.activeQuests;
    const questIncomplete = active
      ? (state.ir.spellHits.find((h) => h.spellId === (spellId | 0))?.requireQuestIncomplete ?? null)
      : null;
    const hook = handleSpellHit(state, spellId | 0, {
      isPlayerCaster: caster.side === 'player',
      // The gate asks "is THIS quest incomplete"; answer from the caller's log, else leave it
      // null so a quest-gated row stays shut rather than firing on an unknown state.
      questIncomplete:
        questIncomplete != null && active?.has(questIncomplete) ? questIncomplete : null,
    });
    if (!hook.handled) return;
    for (const line of hook.flavor) push({ t: ctx.t, kind: 'flavor', text: line });
    if (hook.actions.length) applyScriptDevCombatActions(tgt, hook.actions);
  }

  /** EVENT_T_SPELL_CAST (37) — this creature finished a cast. 1 DB row. */
  const notifyEventAiSpellCast = (caster: Fighter, spellId: number): void => {
    pulseEnemyEvent(caster, EVENT_T.SPELL_CAST, { spellCastId: spellId | 0 });
  };

  /** EVENT_T_REACHED_HOME (21) — evade finished. 19 DB rows, 7 on dungeon creatures. */
  const notifyEventAiReachedHome = (ef: Fighter): void => {
    pulseEnemyEvent(ef, EVENT_T.REACHED_HOME, { reachedHome: true, inCombat: false });
    for (const [ownerSide, owned] of guardianSidesBySummoner) {
      if (!owned.has(ef.side)) continue;
      const owner = ctx.sideFighter?.(ownerSide);
      const ir = owner ? scriptDevByCreature((owner.spec.creatureEntry ?? 0) | 0) : undefined;
      const acts = ir ? lifecycleActions(ir, 'summonedReachedHome') : [];
      if (acts.length) applyScriptDevCombatActions(ef, acts);
      break;
    }
  };

  // EVENT_T_OOC_LOS (10) — MoveInLineOfSight while out of combat. 11 DB rows. The gate itself also requires
  // `!inCombat`, so the pulse only fires OOC.
  const notifyEventAiOocLos = (ef: Fighter): void => {
    pulseEnemyEvent(ef, EVENT_T.OOC_LOS, { oocLos: true, inCombat: false });
  };

  ctx.notifyEventAiKill = notifyEventAiKill;
  ctx.notifyEventAiSummoned = notifyEventAiSummoned;
  ctx.notifyEventAiSpellCast = notifyEventAiSpellCast;
  ctx.notifyEventAiReachedHome = notifyEventAiReachedHome;
  ctx.notifyEventAiOocLos = notifyEventAiOocLos;
  ctx.applyEventAiIntent = applyEventAiIntent;
  ctx.runEnemyEventAi = runEnemyEventAi;
  ctx.runEnemyDeathEventAi = runEnemyDeathEventAi;
  ctx.notifyEventAiDamageTaken = notifyEventAiDamageTaken;
  ctx.notifyEventAiHealedBy = notifyEventAiHealedBy;
  ctx.applyScriptDevCombatActions = applyScriptDevCombatActions;
  ctx.runScriptDevSpellHit = runScriptDevSpellHit;
  ctx.applyScriptDevTimerActions = applyScriptDevTimerActions;

  const notifyScriptDevHitCount = (
    target: Fighter,
    opts: { school: string; melee: boolean },
  ): void => {
    if (!isEnemySide(target.side)) return;
    const state = enemyCastBySide.get(target.side as EnemySide)?.scriptDev;
    if (!state?.ir.hitCountGates?.length) return;
    const before = state.phase | 0;
    const acts = noteScriptDevHitCount(state, {
      school: opts.school,
      melee: opts.melee,
      hasAura: (id) => target.buffActive.has(id),
    });
    if ((state.phase | 0) !== before) {
      const cs = enemyCastBySide.get(target.side as EnemySide);
      if (cs) {
        rearmCreatureCastSlotsOnPhase(cs.slots, before, state.phase | 0, ctx.t, rng);
        cs.eventAi.phase = state.phase | 0;
      }
      push({ t: ctx.t, kind: 'phase', actor: target.side, phase: state.phase | 0 });
    }
    if (acts.length) applyScriptDevCombatActions(target, acts);
  };
  ctx.notifyScriptDevHitCount = notifyScriptDevHitCount;
  // sessionInject calls this when arming a damageHealMirror creature (after crowdControl).
  ctx.ensureDamageHealMirrorHooks = ensureMirrorHooks;
}
