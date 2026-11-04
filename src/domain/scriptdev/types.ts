// ScriptDevAI intermediate representation — a data-shaped extract of the CMaNGOS scripts for the
// engine host, not a C++ transpile. Never invent timers, thresholds or spell ids.

import type { CreatureCastEntry } from '../../data/schema.ts';

// Target / cast helpers (reuse EventAI TARGET_T via selectTarget source 'eventai')

// ScriptDev SelectAttackingTarget mapping → EventAI TARGET_T for selectTarget. Cite: Unit.h
// AttackingTarget; boss scripts SelectAttackingTarget(RANDOM, …).
export type ScriptDevTargetMode =
  | 'self'
  | 'victim'
  | 'hostile_random'
  | 'hostile_random_not_top'
  | 'hostile_random_player'
  | 'hostile_random_not_top_player'
  | 'hostile_random_mana'
  | 'hostile_random_not_in_melee'
  // DoFindFriendlyEligibleDispel — a friendly creature in combat within range that is immobilized,
  // slowed, frozen or crowd-controlled. Cite: UnitAI.cpp:764-771; GridNotifiers.h:915-930.
  | 'friendly_dispellable'
  // SELECT_FLAG_PLAYER | SELECT_FLAG_NOT_AURA on the CAST spell — a random player who does not
  // already carry it. Cite: boss_sapphiron.cpp:241-243; creature_spell_targeting id 121.
  | 'hostile_random_player_not_aura'
  // DoFindFriendlyMissingBuff — a friendly in range that does NOT already carry the cast spell.
  // Cite: UnitAI.cpp:737-761; boss_sulfuron_harbinger.cpp:94-109.
  | 'friendly_missing_buff';

/** Optional select flags (Unit.h SelectFlags bits) plus getClass() filter. */
export interface ScriptDevSelectOpts {
  /** SELECT_FLAG_PLAYER = 0x0002 */
  playerOnly?: boolean;
  /** SELECT_FLAG_POWER_MANA = 0x0004 */
  powerMana?: boolean;
  /** SELECT_FLAG_NOT_IN_MELEE_RANGE = 0x0080 */
  notInMelee?: boolean;
  /** SELECT_FLAG_IN_MELEE_RANGE = 0x0040. Cite: boss_twinemperors.cpp:256 SPELL_UPPERCUT. */
  inMelee?: boolean;
  // SelectAttackingTarget second arg: 0 = include tank, 1 = skip top threat. Cite:
  // boss_baroness_anastari.cpp Possess SelectAttackingTarget(RANDOM, 1, …).
  skipTopThreat?: boolean;
  /** Unit::getClass() / enum Classes. Cite: SharedDefines.h:65-79; boss_nefarian.cpp:270-280. */
  classId?: number;
}

// Timers

// One UpdateAI timer: initial arm on Reset, re-arm on successful cast. Cite: ScriptedAI Reset() + UpdateAI
// timer pattern (every boss_*.cpp).
export interface ScriptDevTimer {
  /** Stable id for runtime state (e.g. 'possess', 'banshee_wail'). */
  id: string;
  spellId: number;
  /** Initial ready delay ms [min,max] inclusive. Cite: Reset() assignment. */
  initialMinMs: number;
  initialMaxMs: number;
  /** Re-arm after CAST_OK [min,max]. */
  repeatMinMs: number;
  repeatMaxMs: number;
  target: ScriptDevTargetMode;
  select?: ScriptDevSelectOpts;
  // Only fire when runtime phase equals this value (default 0). Cite: boss_dathrohan_balnazzar.cpp
  // m_bTransformed branch.
  phase?: number;
  // UnitAI CastFlags bits (TRIGGERED, AURA_NOT_PRESENT, FORCE_CAST, …). Cite: UnitAI.h CastFlags; Maleki
  // Frost Armor CAST_TRIGGERED|AURA_NOT_PRESENT.
  castFlags?: number;
  // When true, timer is armed OOC / on Reset as a one-shot buff (Frost Armor). Host emits as AGGRO or
  // initial TIMER with AURA_NOT_PRESENT.
  onReset?: boolean;
  // Optional self-HP band in percent. When set the host emits EVENT_T.HP instead of TIMER_IN_COMBAT
  // so the cast only fires inside it. Cite: boss_darkmaster_gandling.cpp:94 portal gate above 3%.
  hpPctMax?: number;
  hpPctMin?: number;
  /** creature_spell_list.CombatCondition. Cite: UnitAI.cpp:1218-1224; creatureCastList.ts:318. */
  combatCondition?: number;
  /** Instance-data gate at pick time. Cite: boss_hakkar.cpp aspect CombatCondition 1005-1009. */
  gate?: ScriptDevDataGate;
  // Skip unless the current victim is known out of melee. Cite: boss_grobbulus.cpp:97-110
  // !CanReachWithMeleeAttack(GetVictim()).
  requireVictimNotInMelee?: boolean;
  // Fire only while SOMEBODY is in melee reach — the IN_MELEE_RANGE flag used as an existence test
  // ahead of a nullptr cast. Cite: shadowfang_keep.cpp:477; darkshore.cpp:805.
  requireMeleeTargetExists?: boolean;
  // Fire `actions` on the timer without casting `spellId`. Cite: boss_four_horsemen.cpp:169-174 SPECIAL
  // DoBroadcastText, no spell.
  pollOnly?: boolean;
  /** Exhaust after this many CAST_OK fires. Cite: boss_gothik.cpp:305 m_teleportCount >= 4. */
  maxFires?: number;
  /** SCHEME_HIGHEST_HP among the first N threat entries in melee. Cite: boss_patchwerk.cpp:114-127. */
  highestHpTopThreat?: number;
  /** Shuffle these and cast `spells[waveLeft-1]` each fire. Cite: boss_fankriss.cpp:91-99,141-157. */
  rotateSpellIds?: number[];
  // urand pick made ONCE per spawn, not per fire: the slot casts the same picked spell all fight.
  // Cite: zulgurubScripts.cpp:61,110-115 m_uiCCSpell = urand(0,1) ? FEAR : KNOCKDOWN.
  pickPerSpawnSpellIds?: number[];
  /** friendly_dispellable scan radius. Cite: boss_bug_trio.cpp:371 DoFindFriendlyEligibleDispel(50.0f). */
  friendlyRadiusYd?: number;
  // An empty friendly pool falls back to SELF rather than casting nothing. Per-script: Sulfuron's
  // Inspire does, Yauj's Dispel does not. Cite: boss_sulfuron_harbinger.cpp:104-105.
  friendlyFallbackSelf?: boolean;
  // DoSelectLowestHpFriendly scan radius: the LOWEST-hp friendly in range missing at least
  // `friendlyHpDeficit` hp. Cite: UnitAI.cpp DoSelectLowestHpFriendly; boss_sulfuron_harbinger.cpp:162.
  friendlyLowestHpYd?: number;
  /** The `minHPDiff` second argument. Cite: boss_sulfuron_harbinger.cpp:162 the literal 1. */
  friendlyHpDeficit?: number;
  /** Wave size. Cite: boss_fankriss.cpp:90 urand(1, 3). */
  waveMinCount?: number;
  waveMaxCount?: number;
  /** Intra-wave re-arm. Cite: boss_fankriss.cpp:156 urand(5000, 7000). */
  intraWaveMinMs?: number;
  intraWaveMaxMs?: number;
  // When set, only this creature_template.entry arms the timer, matching the ctor filter a
  // multi-entry script uses. Cite: azshara.cpp:90-94 m_aSpitelashAbility entry match.
  creatureEntry?: number;
  /** Source citation (file:line). */
  cite: string;
  /** CombatAI action id for a getClass() switch (shared ResetCombatAction). Cite: boss_nefarian.cpp:86,285. */
  classCallGroup?: number;
  // AddCombatAction(id, true) — slot starts exhausted until arm_timer / ResetCombatAction. Cite:
  // boss_marli.cpp:72 AddCombatAction(MARLI_CHARGE, true); TimerAI.cpp disabled ctor.
  startDisabled?: boolean;
  // DisableCombatAction after CAST_OK — omit EFLAG_REPEATABLE so the slot exhausts. Cite:
  // boss_marli.cpp:146 DisableCombatAction(MARLI_CHARGE); TimerAI.cpp:248-257.
  oneShot?: boolean;
  // After a successful cast of this timer (CAST_OK). Yauj Fear → DoResetThreat; Gate 23138 dummy →
  // SendAIEvent. Cite: boss_bug_trio.cpp:356-358; boss_noth.cpp:218-219; SpellEffects.cpp:910-933.
  actions?: ScriptDevAction[];
}

// Phases / HP thresholds

export interface ScriptDevPhaseThreshold {
  /** Enter this phase when HP% drops below threshold. */
  phase: number;
  /** Health percent (0–100). Cite: GetHealthPercent() < N. */
  hpBelowPct: number;
  // Fire `actions` once but do not assign `state.phase` / emit a phase event. Cite: boss_jeklik.cpp
  // JEKLIK_PHASE_BATS — timerless HP summon, no SetSpellList.
  retainPhase?: boolean;
  /** Actions when threshold first crosses (transform cast, UpdateEntry, yell). */
  actions?: ScriptDevAction[];
  cite: string;
}

// Actions (instance coupling, yells, summons, update entry)

export type ScriptDevAction =
  | {
      kind: 'set_instance_data';
      /** Encounter type field (stratholme.h TYPE_*). */
      field: number;
      value: number;
      /** Add `value` to the current store (default 1). Cite: temple_of_ahnqiraj.cpp:240 ++m_uiBugTrioDeathCount. */
      increment?: boolean;
      gate?: ScriptDevDataGate;
      // Write it through to the run so the next pull is seeded with it. A pull ends without an evade, so
      // an aggro IN_PROGRESS is otherwise forgotten on a wipe or a flee.
      persist?: boolean;
      cite: string;
    }
  | {
      kind: 'set_melee_enabled';
      enabled: boolean;
      gate?: ScriptDevDataGate;
      cite: string;
    }
  | {
      kind: 'yell';
      /** Negative script_texts id or positive broadcast_text id. Provide either textId or textIds. */
      textId?: number;
      textIds?: readonly number[];
      // Skip unless urand(0, urandInclusiveMax) === 0. Cite: boss_vaelastrasz.cpp:141-144 if (urand(0, 4))
      // return;
      urandInclusiveMax?: number;
      cite: string;
    }
  | {
      kind: 'update_entry';
      entry: number;
      cite: string;
    }
  | {
      kind: 'cast_self';
      spellId: number;
      castFlags?: number;
      // Instance-data condition the C++ cast sat behind. A Reset loop that casts once per open
      // encounter unrolls to one row per iteration, each carrying its own gate.
      gate?: ScriptDevDataGate;
      // JustSummoned: only this summoned entry. Omit = every summon. Cite: boss_jeklik.cpp:146-157
      // GetEntry() == NPC_BAT_RIDER / NPC_FRENZIED_BAT.
      creatureEntry?: number;
      cite: string;
    }
  | {
      kind: 'summon';
      spellId?: number;
      creatureEntry?: number;
      cite: string;
    }
  | {
      kind: 'open_door';
      /** GameObject entry (stratholme.h GO_ZIGGURAT_DOOR_*). */
      goEntry: number;
      cite: string;
    }
  | {
      /** SetGoState(GO_STATE_READY). Cite: boss_heigan.cpp:190-197 CloseEntrance. */
      kind: 'close_door';
      goEntry: number;
      cite: string;
    }
  | {
      kind: 'cast_on_player';
      spellId: number;
      castFlags?: number;
      /** Skip if player already has this aura. Cite: go_gauntlet_gate HasAura check. */
      auraNotPresent?: boolean;
      cite: string;
    }
  | {
      kind: 'cast_on_group';
      spellId: number;
      castFlags?: number;
      auraNotPresent?: boolean;
      cite: string;
    }
  | {
      // DoCastSpellIfCan(nullptr, id) when the spell resolves via spell_script_target.
      // Cite: boss_majordomo_executus.cpp:243 SPELL_ENCOURAGEMENT; SpellTargets.cpp:40,71.
      kind: 'cast_on_script_targets';
      spellId: number;
      castFlags?: number;
      cite: string;
    }
  | {
      kind: 'summon_count';
      creatureEntry: number;
      count: number;
      /** Random radius around player (yards). Cite: GetRandomPoint radius 3.0f. */
      radiusYd?: number;
      /** Map-absolute spawn X. Cite: SummonCreature(entry, x, y, z, o, …). */
      x?: number;
      /** Map-absolute spawn Y. */
      y?: number;
      cite: string;
    }
  | {
      kind: 'force_despawn';
      /** Delay ms before despawn (0 = immediate). Cite: ForcedDespawn(60000). */
      delayMs?: number;
      cite: string;
    }
  | {
      // ForcedDespawn owned summons (optional entry filter). Cite: CreatureEventAI.cpp
      // ACTION_T_DESPAWN_GUARDIANS; boss_jeklik.cpp:185-195.
      kind: 'despawn_guardians';
      /** 0 = every owned summon. Cite: CreatureEventAI.cpp param1. */
      entryId: number;
      cite: string;
    }
  | {
      kind: 'quest_credit';
      /** Quest id for an event credit, or creature entry for a creature credit — see `credit`. */
      entry: number;
      // WHICH credit call this row is: `event` is AreaExploredOrEventHappens(questId), `creature`
      // is KilledMonsterCredit(entry), `talkedTo` is TalkedToCreature(entry). Absent = event.
      credit?: 'event' | 'creature' | 'talkedTo';
      cite: string;
    }
  | {
      kind: 'stop_combat';
      // CMaNGOS AttackStop(true) — drop the current attack but STAY in the encounter, so later HP
      // phases still fire. Omit for CombatStop / EnterEvadeMode, where the pull is genuinely over.
      attackOnly?: boolean;
      cite: string;
    }
  | {
      kind: 'set_combat_movement';
      enabled: boolean;
      gate?: ScriptDevDataGate;
      cite: string;
    }
  | {
      /** CreatureAI::SetDeathPrevention — UNKILLABLE. Cite: CreatureAI.cpp:130-135 (pin de8f729). */
      kind: 'set_death_prevention';
      enabled: boolean;
      gate?: ScriptDevDataGate;
      cite: string;
    }
  | {
      // Set current HP to floor(maxHealth * pct / 100). Cite: boss_vaelastrasz.cpp:115 Reset
      // `SetHealth(uint32(GetMaxHealth()*.3))`.
      kind: 'set_health_pct';
      /** Percent of max health (0–100). */
      pct: number;
      cite: string;
    }
  | {
      // Strip every effect of spellId from the scripted unit. Cite: boss_mr_smite.cpp
      // RemoveAurasDueToSpell(SPELL_NIBLE_REFLEXES / SPELL_THRASH).
      kind: 'remove_auras';
      spellId: number;
      cite: string;
    }
  | {
      /** Combat-feed / equip chrome line (not a yell textId). */
      kind: 'flavor';
      text: string;
      cite: string;
    }
  | {
      // UnitAI::SendAIEvent — deliver eventType to one receiver (or each matching entry). Cite:
      // UnitAI.cpp:664-668; SpellEffects.cpp:933 Gate self-send; boss_golemagg.cpp:73-84.
      kind: 'send_ai_event';
      eventType: number;
      receiver: 'self' | 'creature_entry';
      creatureEntry?: number;
      /** GetCreatureListWithEntryInGrid radius yards. Cite: boss_golemagg.cpp:76 100.0f. */
      radiusYd?: number;
      miscValue?: number;
      cite: string;
    }
  | {
      // UnitAI::DoResetThreat — modifyAllThreatPercent(-100), keeping list entries at 0. With
      // `of: 'cast'` it is modifyThreatPercent on the cast target. Cite: UnitAI.cpp:773-781.
      kind: 'reset_threat';
      of?: 'all' | 'cast';
      cite: string;
    }
  | {
      // Chase-focus: DoResetThreat, pick a random player, AddThreat and AttackStart — the class
      // verb for DoAttackNewTarget. Cite: boss_buru.cpp:125-138; boss_ouro.cpp:379-386.
      kind: 'chase_focus';
      /** Flat threat after reset. Cite: boss_buru.cpp:135 AddThreat(target, 1000000.f). */
      threat: number;
      cite: string;
    }
  | {
      // CombatAI::ResetCombatAction — clear exhausted and arm readyAt = now + delayMs. Cite:
      // boss_marli.cpp:101-105 SpellHitTarget ENVELOPING_WEBS → ResetCombatAction(MARLI_CHARGE, 1000).
      kind: 'arm_timer';
      /** ScriptDevTimer.id to re-arm. */
      timerId: string;
      delayMs: number;
      gate?: ScriptDevDataGate;
      cite: string;
    }
  | {
      // CombatAI::DisableTimer. Optional creatureEntry aims at another living add. Cite:
      // boss_thekal.cpp:152-157,365-368 PreventRevive DisableTimer(ACTION_RESSURECTION).
      kind: 'disable_timer';
      timerId: string;
      creatureEntry?: number;
      gate?: ScriptDevDataGate;
      cite: string;
    }
  | {
      // JustSummoned: summoned->AI()->AttackStart(summoner). Cite: boss_loatheb.cpp:66-72 NPC_SPORE 16286.
      kind: 'attack_summoner';
      creatureEntry?: number;
      cite: string;
    }
  | {
      // JustSummoned: AttackStart(SelectAttackingTarget RANDOM). Cite: boss_jeklik.cpp:155-156
      // NPC_FRENZIED_BAT.
      kind: 'attack_random';
      creatureEntry?: number;
      cite: string;
    }
  | {
      // HandleOpenGates: each living add of these entries AddThreat on the raid. No side test
      // (IsInRightSideGothikArea is unported); product merges both sides. Cite: boss_gothik.cpp:261-287.
      kind: 'adds_threat_players';
      creatureEntries: number[];
      cite: string;
    }
  | {
      /** Write EventAI / ScriptDev phase so timer.phase masks swap. Cite: SetSpellList PHASE_2. */
      kind: 'set_phase';
      phase: number;
      gate?: ScriptDevDataGate;
      cite: string;
    }
  | {
      /** Save getThreat(invoker) at gaze apply. Cite: boss_mandokir.cpp:169 m_targetThreat. */
      kind: 'store_threat';
      cite: string;
    }
  | {
      // If current threat of the stored gaze target is higher, cast spellId on them. Cite:
      // boss_mandokir.cpp:176-181 getThreat > m_targetThreat → SPELL_CHARGE_GAZE 24315.
      kind: 'charge_if_threat_up';
      spellId: number;
      cite: string;
    }
  | {
      /** UNIT_FLAG_UNINTERACTIBLE until clear. Cite: boss_thaddius.cpp:112 Reset. */
      kind: 'set_unattackable';
      cite: string;
    }
  | {
      /** Drop UNINTERACTIBLE. Cite: boss_thaddius.cpp:329-332 Shock strips SPELL_THADIUS_SPAWN. */
      kind: 'clear_unattackable';
      cite: string;
    }
  | {
      // CastCustomSpell per target: a player takes base + ((maxYd - min(d,maxYd)) / maxYd) * scale,
      // a listed creature `pct` of ITS OWN max. Cite: boss_buru.cpp:269-281 SpellHitTarget.
      kind: 'explode_proximity';
      /** The AoE whose hit the C++ reacts to (SPELL_EXPLODE). */
      spellId: number;
      /** CastCustomSpell payload — school and mitigation come off its own bake row. */
      payloadSpellId: number;
      playerBase: number;
      playerScale: number;
      maxYd: number;
      /** Named creature targets and the percent of their own max health they take. */
      creaturePctMaxHealth?: Array<{ creatureEntry: number; pct: number; actions?: ScriptDevAction[] }>;
      cite: string;
    }
  | {
      // Shuffle once, deal one ability to self and to each same-entry sibling in range, each
      // self-casting its own. Cite: mob_anubisath_sentinel.cpp:127-131,140-159,183-205.
      kind: 'deal_group_abilities';
      spellIds: number[];
      /** GetCreatureListWithEntryInGrid radius. Cite: mob_anubisath_sentinel.cpp:117 80.0f. */
      radiusYd: number;
      cite: string;
    }
  | {
      // JustDied: the dealt ability plus healSpellId onto every living sibling in range.
      // Cite: mob_anubisath_sentinel.cpp:163-181 DoTransferAbility 2400 + HEAL_BRETHEN 26565.
      kind: 'transfer_group_ability';
      healSpellId?: number;
      radiusYd: number;
      cite: string;
    }
  | {
      // One summon per DEAD body of `fromEntries` on the floor, so the raise scales with the corpse
      // count. Cite: boss_nefarian.cpp:211-222 SPELL_RAISE_DRAKONID; :73,150-153 NPC 14605.
      kind: 'raise_corpses';
      fromEntries: number[];
      creatureEntry: number;
      /** MAX_DRAKONID_SUMMONS is 42, so the raise is bounded by the spawn budget, not by this. */
      maxCount?: number;
      cite: string;
    }
  | {
      // Casts at the current victim only when it CHANGED since the last poll — a stack per new tank
      // rather than a timer. Cite: boss_kelthuzad.cpp:495-521 KilledUnit + m_victimGuid.
      kind: 'cast_on_victim_change';
      spellId: number;
      castFlags?: number;
      cite: string;
    }
  | {
      // JustSummoned: the image's MAX is a fraction of the SUMMONER's max and its CURRENT health is
      // the summoner's percent, so a late split is a bigger body. Cite: boss_skeram.cpp:328-364.
      kind: 'mirror_summoner_health';
      /** Tried in order; the first band whose `belowPct` the summoner is under wins. */
      bands: Array<{ belowPct: number; fracOfMax: number }>;
      cite: string;
    }
  | {
      // The pbaoe a script SELF-casts: roll spellId's own direct_damage over its own radius, since
      // cast_self hands it to the caster alone. Cite: naxxramas.cpp:1089; spell_template 28433.
      kind: 'damage_in_radius';
      spellId: number;
      cite: string;
    }
  | {
      // A SET of `count` shuffled non-tank players, each taking spellId — the shape no TARGET_T has.
      // Cite: boss_maexxna.cpp:207-224 WebWrapMaexxna MAX_PLAYERS_WEB_WRAP 3.
      kind: 'cast_on_random_players';
      spellId: number;
      count: number;
      /** SELECT_FLAG_SKIP_TANK — the current victim is never picked. */
      skipTopThreat?: boolean;
      cite: string;
    }
  | {
      // A THIRD body casts: the nearest `casterEntry` within radiusYd of the VICTIM, measured from
      // the victim. Cite: boss_mandokir.cpp:209-211 KilledUnit; :257-268 Ohgan's copy.
      kind: 'proxy_cast_on_victim';
      casterEntry: number;
      spellId: number;
      radiusYd: number;
      cite: string;
    }
  | {
      // A per-INSTANCE DISTINCT pair: r = urand(0,4), l = (r + urand(1,4)) % 5, written only while
      // both fields are NOT_STARTED. Cite: SpellEffects.cpp:993-1029; blackwing_lair.cpp:622-691.
      kind: 'roll_instance_pair';
      leftField: number;
      rightField: number;
      leftValues: number[];
      rightValues: number[];
      cite: string;
    }
  | {
      // A raw SetHealth subtraction of pct% of max, NOT damage: no armor, no resist, no threat.
      // Cite: boss_viscidus.cpp:505-521 ViscidusShrinks; :517 the 1 + hpLose floor.
      kind: 'shrink_creature_pct';
      creatureEntry: number;
      pct: number;
      /** Floor the subtraction leaves standing. Cite: :517. */
      minHealth?: number;
      cite: string;
    }
  | {
      // Cast at the unit the ROW's own cast resolved to; cast_on_player would aim at the leader.
      // Cite: boss_sapphiron.cpp:265-279 PeriodicIceBolt 31800 + the 28535 payload swap.
      kind: 'cast_on_cast_target';
      spellId: number;
      castFlags?: number;
      /** Skip when that unit already holds this aura. */
      auraNotPresent?: boolean;
      cite: string;
    };

// GO use / SpellHit / quest / emote hooks (zone scripts)

/** Condition on instance data field before a GO/quest hook runs. */
export interface ScriptDevDataGate {
  field: number;
  /** Require GetData(field) === value. */
  equals?: number;
  /** Require GetData(field) !== value. */
  notEquals?: number;
  /** Additional required gate. Cite: boss_thekal.cpp:248 TYPE_ZATH && TYPE_LORKHAN. */
  and?: ScriptDevDataGate;
  /** Alternative gate. Cite: boss_thekal.cpp:330 TYPE_THEKAL != SPECIAL || TYPE_ZATH != SPECIAL. */
  or?: ScriptDevDataGate;
  cite: string;
}

/** GameObject pGOUse handler IR. Cite: stratholmeScripts.cpp GOUse_go_* patterns. */
export interface ScriptDevGoUse {
  /** gameobject_template.entry bindings. */
  goEntries: number[];
  /** All gates must pass (AND). */
  gates?: ScriptDevDataGate[];
  // Branch on current instance data (e.g. postbox SPECIAL → summon postmaster). First matching branch wins;
  // if none match, `actions` run.
  branches?: Array<{
    gate: ScriptDevDataGate;
    actions: ScriptDevAction[];
    cite: string;
  }>;
  /** Default actions when no branch matches. */
  actions?: ScriptDevAction[];
  // Per-GO-ENTRY branches, checked before `branches`. Some GO scripts key off WHICH object was
  // used: with two Molten Core bosses down, a data-gated branch would douse the wrong rune.
  perEntry?: Array<{
    goEntry: number;
    gates?: ScriptDevDataGate[];
    actions: ScriptDevAction[];
    cite: string;
  }>;
  cite: string;
}

// SpellHit hook — e.g. Egan's Blaster on Restless Soul / Spectral Citizen. Cite:
// mob_restless_soulAI::SpellHit; mobs_spectral_ghostly_citizenAI::SpellHit.
export interface ScriptDevSpellHit {
  spellId: number;
  /** Optional incomplete quest status gate. Cite: QUEST_RESTLESS_SOUL. */
  requireQuestIncomplete?: number;
  /** Player caster only. */
  playerCaster?: boolean;
  /** One-shot tag (m_bIsTagged). */
  once?: boolean;
  /** Immediate actions on hit. */
  actions?: ScriptDevAction[];
  // Arm a one-shot die/transform timer after hit (m_uiDieTimer). Cite: restless_soul 1000; spectral 2000
  // (ctor).
  dieTimerMs?: number;
  /** Actions when die timer expires. */
  onDieTimer?: ScriptDevAction[];
  cite: string;
}

/** QuestRewarded NPC hook. Cite: QuestRewarded_npc_aurius. */
export interface ScriptDevQuestRewarded {
  questId: number;
  gates?: ScriptDevDataGate[];
  actions: ScriptDevAction[];
  cite: string;
}

/** GossipHello branch by instance data (display text only — no combat). Cite: GossipHello_npc_aurius. */
export interface ScriptDevGossipHello {
  /** Default gossip text id when no branch matches. */
  defaultTextId: number;
  branches?: Array<{
    gates: ScriptDevDataGate[];
    textId: number;
    cite: string;
  }>;
  cite: string;
}

/** ReceiveEmote responses (TEXTEMOTE_*). Cite: mobs_spectral_ghostly_citizenAI::ReceiveEmote. */
export interface ScriptDevReceiveEmote {
  /** TEXTEMOTE id (e.g. DANCE=10, RUDE=14, WAVE=0, BOW=2, KISS=17 — Classic). */
  emote: number;
  /** Optional interaction distance gate (yards). Cite: INTERACTION_DISTANCE. */
  maxDistYd?: number;
  actions: ScriptDevAction[];
  /** Fallback when out of range (emote reply only). */
  outOfRangeActions?: ScriptDevAction[];
  cite: string;
}

// DB ScriptName binding that is not runnable in product (entry absent from bake). Census treats documented
// N/A bindings as ported when the script name is registered.
export interface ScriptDevUnusedBinding {
  entry: number;
  kind: 'creature' | 'go';
  reason: string;
  cite: string;
}

// AuraScript hooks (Anastari Possess pattern)

// AuraScript IR — apply/remove/periodic + charm-side-switch helpers. Cite: SpellScript/AuraScript;
// boss_baroness_anastari.cpp AnastariPossess.
export interface ScriptDevAuraScript {
  spellId: number;
  // When this spell charms an enemy→player unit, break when HP ≤ frac * max. Cite: AnastariPossess
  // OnPeriodicTickEnd GetHealthPercent() < 50.f.
  charmBreakHpFrac?: number;
  /** ForcePeriodicity interval ms (0 = none). Cite: AnastariPossess OnApply ForcePeriodicity(1000). */
  periodMs?: number;
  // Aura duration ms for non-charm holder auras (set_unattackable window). Cite: spell DurationIndex →
  // SpellDuration; Noxxion 21708 index 8 → 15_000.
  durationMs?: number;
  onApply?: ScriptDevAuraAction[];
  onRemove?: ScriptDevAuraAction[];
  onPeriodic?: ScriptDevAuraAction[];
  // Leash/break when charmer has possess-inv aura and threat list size ≤ N. Cite:
  // boss_baroness_anastari.cpp SetLeashingCheck size() <= 1.
  leashThreatSizeLte?: number;
  /** Spell id that marks charmer "possessing" (for leash + unattackable). */
  possessInvSpellId?: number;
  cite: string;
}

export type ScriptDevAuraAction =
  | {
      kind: 'cast_helper';
      spellId: number;
      basepoints?: number;
      /** 'aura_target' | 'caster' */
      on: 'aura_target' | 'caster';
      cite: string;
    }
  | {
      kind: 'remove_auras';
      spellId: number;
      on: 'aura_target' | 'caster';
      cite: string;
    }
  | {
      kind: 'heal_full';
      on: 'aura_target' | 'caster';
      cite: string;
    }
  | {
      kind: 'set_unattackable';
      on: 'aura_target' | 'caster';
      cite: string;
    }
  | {
      kind: 'clear_unattackable';
      on: 'aura_target' | 'caster';
      cite: string;
    }
  | {
      kind: 'break_charm_if_hp_below';
      frac: number;
      cite: string;
    }
  | {
      kind: 'flavor';
      text: string;
      cite: string;
    };

// Timed phases (a CLOCK, not a health bar)

// One IncreaseHitCount ladder. Frost and melee share `hitCount`. Cite: boss_viscidus.cpp:86-92 HITCOUNT_*;
// :295-331 IncreaseHitCount; :552-565 FrostWeakness.
export interface ScriptDevHitCountGate {
  id: string;
  /** SpellDef.school exact match. Cite: GetSchoolMask() == SPELL_SCHOOL_MASK_FROST. */
  school?: 'frost';
  /** BASE_ATTACK / OFF_ATTACK. Cite: ViscidusFreeze OnProc attType. */
  melee?: boolean;
  /** Aura that must be on the boss (WEAKNESS 25926). */
  requireAura?: number;
  phaseMin?: number;
  phaseMax?: number;
  thresholds: ScriptDevHitCountThreshold[];
  cite: string;
}

export interface ScriptDevHitCountThreshold {
  at: number;
  setPhase?: number;
  resetCount?: boolean;
  /** Arm hitCountExpire. Cite: 25937 durationIndex 8 → 15000. */
  durationMs?: number;
  onExpire?: {
    setPhase?: number;
    resetCount?: boolean;
    actions: ScriptDevAction[];
    cite: string;
  };
  actions: ScriptDevAction[];
  cite: string;
}

// A phase transition driven by elapsed combat time, optionally cycling — `phases` is health-gated
// and fires once each, which is wrong for a submerge cycle. A two-entry ring is a cycle.
export interface ScriptDevTimedPhase {
  /** Stable id, referenced by `next`. */
  id: string;
  /** Runtime phase to enter (gates timers via their `phase` field). */
  phase: number;
  /** Delay from arming to firing. */
  afterMs: number;
  /** Id armed after this one fires. Omit for a one-shot. */
  next?: string;
  // Skip this firing while HP% is at or below this; poll until it is not. Cite: boss_sapphiron.cpp:201
  // GetHealthPercent() > 10.f air-phase gate.
  hpMinPct?: number;
  actions?: ScriptDevAction[];
  cite: string;
}

// MoveInLineOfSight proximity trigger — a body that answers PRESENCE rather than a timer. Cite:
// naxxramas.cpp:1084-1089 npc_living_poison GetDistance2d(who) > 4.0f -> return, else explode.
export interface ScriptDevProximityTrigger {
  /** Yards. Cite: the literal in the MoveInLineOfSight guard. */
  withinYd: number;
  /** Fire once per spawn — an exploding body has nothing to fire twice. */
  once?: boolean;
  actions: ScriptDevAction[];
  cite: string;
}

// Summon waves (add-pressure that is NOT a spell)

// A repeating summon loop owned by the script, not by a spell: summon `perTick` every tick until
// `waveCount` are out, then wait. Onyxia's whelps have no usable summon spell to express it.
export interface ScriptDevSummonWave {
  /** Stable id for runtime state. */
  id: string;
  creatureEntry: number;
  /** Summons per firing. Cite: `for (uint8 i = 0; i < 2; i++)`. */
  perTick: number;
  /** Delay from wave arm to first firing. Cite: ResetTimer(SUMMON_WHELPS, 3000). */
  armDelayMs: number;
  /** Between firings INSIDE the first wave. */
  firstTickMinMs: number;
  firstTickMaxMs: number;
  /** Between firings inside every later wave. */
  tickMinMs: number;
  tickMaxMs: number;
  /** Size of the first wave. Cite: m_uiWhelpsPerWave = 20. */
  firstWaveCount: number;
  /** Size of every later wave. Cite: urand(4, 10). */
  waveMinCount: number;
  waveMaxCount: number;
  /** Gap = gapBaseMs - count * gapPerSummon{First,}Ms. Cite: 90 * IN_MILLISECONDS. */
  gapBaseMs: number;
  gapPerSummonFirstMs: number;
  gapPerSummonMs: number;
  /** Only runs while the runtime phase equals this. */
  phase: number;
  cite: string;
}

// Lifecycle hooks

export interface ScriptDevLifecycle {
  onAggro?: ScriptDevAction[];
  onDeath?: ScriptDevAction[];
  onEvade?: ScriptDevAction[];
  onReset?: ScriptDevAction[];
  // CreatureAI::KilledUnit — this creature killed a player-side unit. Cite: Unit.cpp Kill →
  // killer->AI()->KilledUnit; boss_vaelastrasz.cpp:139-145.
  onKill?: ScriptDevAction[];
  // JustSummoned — actions run on each creature this AI summons (actor = summoned). Cite:
  // boss_jandice_barov.cpp:52-55 CastSpell(pSummoned, SPELL_SPREAD_ILLUSIONS).
  justSummoned?: ScriptDevAction[];
  // CreatureAI::JustPreventedDeath — lethal hit while SetDeathPrevention, once per pull. Cite:
  // CreatureAI.cpp JustPreventedDeath; boss_thekal.cpp:102-123.
  onPreventedDeath?: ScriptDevAction[];
  // SummonedJustReachedHome — actions run on the summon that reached home. Cite: boss_maexxna.cpp:145-148
  // summoned->ForcedDespawn().
  summonedReachedHome?: ScriptDevAction[];
}

// Cross-creature damage/heal mirror (the Twin Emperors' shared pool): damage and heal are scaled
// by the partner's max, and Heal Brother fires within range. Cite: boss_twinemperors.cpp:96-125.
export interface ScriptDevDamageHealMirror {
  partnerEntry: number;
  /** SPELL_TWIN_EMPATHY — CastCustomSpell damage; recursion guard. */
  empathySpellId: number;
  /** SPELL_TWIN_SUICIDE when mirrored damage >= partner HP. */
  suicideSpellId: number;
  /** SPELL_HEAL_BROTHER contact heal. */
  healBrotherSpellId?: number;
  /** MoveInLineOfSight range yards. Cite: boss_twinemperors.cpp:209 60.0f */
  healBrotherRangeYd?: number;
  /** Encounter field that must be IN_PROGRESS for Heal Brother. */
  encounterField?: number;
  cite: string;
}

// Instance script IR

/** Encounter state values — classic InstanceData. Cite: sc_instance.h. */
export const INSTANCE_DATA = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  FAIL: 2,
  DONE: 3,
  SPECIAL: 4,
} as const;

// ScriptDev AIEventType ids used by SendAIEvent / ReceiveAIEvent. Cite: AIDefines.h:50-55 (pin de8f729).
export const AI_EVENT = {
  CUSTOM_A: 1000,
  CUSTOM_B: 1001,
  CUSTOM_C: 1002,
  CUSTOM_D: 1003,
  CUSTOM_E: 1004,
  CUSTOM_F: 1005,
} as const;

// ReceiveAIEvent hook — actions when this script is the SendAIEvent receiver. Cite: UnitAI.cpp:667
// receiver->AI()->ReceiveAIEvent; boss_shazzrah.cpp:80-87.
export interface ScriptDevReceiveAiEvent {
  eventType: number;
  /** If set, only this sender entry (Core Rager checks NPC_GOLEMAGG). */
  senderEntry?: number;
  actions: ScriptDevAction[];
  cite: string;
}

// `SummonedCreatureJustDied` — actions keyed on how many of the script's own adds have died. It
// exists for the boss whose encounter ends without him dying: Majordomo, unwinnable without it.
export interface ScriptDevAddDeathHook {
  /** Which creature entries count as this script's adds. */
  creatureEntries: number[];
  // Deaths that trigger the actions; `all` / `allButOne` / `half` resolve against `total`, the
  // script's own constant, never a live headcount. `every` fires while addsKilled < total.
  atKilled: number | 'all' | 'allButOne' | 'half' | 'every';
  total: number;
  actions: ScriptDevAction[];
  cite: string;
}

export interface ScriptDevEncounterBinding {
  /** creature_template.entry that drives this encounter field. */
  creatureEntry: number;
  field: number;
  /** SetData value on death. Default DONE. */
  onDeath?: number;
  /** SetData value on aggro. Default IN_PROGRESS. */
  onAggro?: number;
  /** SetData value on evade/fail. Default FAIL. */
  onEvade?: number;
  cite: string;
}

export interface ScriptDevDoorBinding {
  /** Encounter field that opens this door when value === DONE (or SPECIAL). */
  field: number;
  goEntry: number;
  /** Values that open the door. Default [DONE]. */
  openOn?: number[];
  cite: string;
}

// Top-level IR

export interface ScriptDevIR {
  /** Script Name = "…" — registry key; census parses quoted names. */
  name: string;
  /** creature_template.ScriptName bindings. Empty for pure instance / GO scripts. */
  boundCreatures: number[];
  /** gameobject_template.ScriptName bindings. */
  boundGos?: number[];
  /** Source cpp relative path under ScriptDevAI/scripts/. */
  sourceFile: string;
  timers: ScriptDevTimer[];
  phases?: ScriptDevPhaseThreshold[];
  /** Script-owned repeating summon loops (no spell drives them). */
  summonWaves?: ScriptDevSummonWave[];
  /** Clock-driven phase transitions (submerge cycles). See ScriptDevTimedPhase. */
  timedPhases?: ScriptDevTimedPhase[];
  // Ticks `timedPhases` while out of combat (no threat). Only Kel'Thuzad's C++ runs its
  // phase clock outside combat. Cite: boss_kelthuzad.cpp:236-238 polls players, not threat.
  oocClock?: boolean;
  // School / melee hit-count freeze gates (shared m_hitCount). Cite:
  // boss_viscidus.cpp:86-92,295-331,552-565.
  hitCountGates?: ScriptDevHitCountGate[];
  /** MoveInLineOfSight proximity answers. Cite: naxxramas.cpp:1084-1089. */
  proximityTriggers?: ScriptDevProximityTrigger[];
  // Shared HP pool — damage and heals on this creature apply percent-mirrored to partnerEntry. Cite:
  // boss_twinemperors.cpp:96-125.
  damageHealMirror?: ScriptDevDamageHealMirror;
  auraScripts?: ScriptDevAuraScript[];
  lifecycle?: ScriptDevLifecycle;
  /** SummonedCreatureJustDied hooks — see ScriptDevAddDeathHook. */
  addDeaths?: ScriptDevAddDeathHook[];
  /** Instance-only: encounter type → creature death / doors. */
  encounters?: ScriptDevEncounterBinding[];
  doors?: ScriptDevDoorBinding[];
  /** GO use handlers (pGOUse). */
  goUse?: ScriptDevGoUse;
  /** SpellHit handlers. */
  spellHits?: ScriptDevSpellHit[];
  /** QuestRewarded NPC hooks. */
  questRewarded?: ScriptDevQuestRewarded[];
  /** GossipHello text selection. */
  gossipHello?: ScriptDevGossipHello;
  /** ReceiveEmote handlers. */
  receiveEmotes?: ScriptDevReceiveEmote[];
  /** ReceiveAIEvent handlers. Cite: UnitAI.cpp:667; boss_shazzrah.cpp:80-87. */
  receiveAiEvents?: ScriptDevReceiveAiEvent[];
  // DB bindings not present in the bake (or not owned by this script body). Documented so census / missions
  // treat the script as fully ported.
  unusedBindings?: ScriptDevUnusedBinding[];
  // CombatManager SetLeashingCheck: evade when the unit's z is above this. Cite: boss_faerlina.cpp:52,67-71
  // resetZ 266; boss_razuvious.cpp:49,60 z 285.
  leashZGt?: number;
  /** Evade when world x is above this. Cite: boss_heigan.cpp:62,80-85 resetX 2825. */
  leashXGt?: number;
  // Evade when planar yards from respawn/home exceed this. Cite: boss_heigan.cpp:84 GetDistance2d(respawn)
  // > 90.
  leashHomeYd?: number;
  /** Evade if any corner matches (x > xGt && y < yLt). Cite: boss_four_horsemen.cpp:107-140. */
  leashOrXy?: { xGt: number; yLt: number }[];
  /** Spell ids referenced (for kit assembly). */
  spellIds: number[];
  cites: string[];
}

// Runtime state (host-owned; combat injects)

export interface ScriptDevRuntimeState {
  ir: ScriptDevIR;
  /** Current phase (0 default). */
  phase: number;
  /** Phase thresholds already fired. */
  phaseFired: Set<number>;
  /** Possessed target side id while possess-end timer runs (Anastari). */
  possessedSide?: string | null;
  /** Possess-end check timer remaining ms (0 = idle). Cite: m_uiPossessEndTimer. */
  possessEndTimerMs: number;
  /** Armed timed phase id + ms left (ScriptDevTimedPhase). */
  timedPhase?: { id: string; remainingMs: number } | null;
  /** Per-wave summon loop state, keyed by ScriptDevSummonWave.id. */
  summonWaves?: Record<string, { timerMs: number; summoned: number; waveCount: number; firstDone: boolean }>;
  /** SpellHit one-shot tag (m_bIsTagged). */
  spellHitTagged?: boolean;
  /** How many of this script's own adds have died (SummonedCreatureJustDied counter). */
  addsKilled?: number;
  /** Remaining die-after-tag timer ms (0 = idle). Cite: m_uiDieTimer. */
  dieTimerMs?: number;
  /** One-shot C++ bools (m_isInitialEntangleDone). Cleared on evade Reset. */
  oneshotTags?: Set<string>;
  /** Threatening Gaze: threat of the gazed unit at apply. Cite: boss_mandokir.cpp:111,169. */
  gazeThreat?: { side: string; amount: number };
  /** Ability dealt by deal_group_abilities. Cite: mob_anubisath_sentinel.cpp:74 m_myAbility. */
  dealtAbilitySpellId?: number;
  /** Victim side at the last cast_on_victim_change poll. Cite: boss_kelthuzad.cpp:504 m_victimGuid. */
  lastVictimSide?: string | null;
  /** Shared m_hitCount. Cite: boss_viscidus.cpp:142,151,296. */
  hitCount?: number;
  /** Freeze-aura duration clock. Cite: boss_viscidus.cpp:415-419; 25937 durationIndex 8. */
  hitCountExpire?: {
    remainingMs: number;
    setPhase?: number;
    resetCount?: boolean;
    actions: ScriptDevAction[];
  };
}

/** Output of IR → cast-entry conversion (feeds existing creatureCasts arm path). */
export interface ScriptDevCastPlan {
  castEntries: CreatureCastEntry[];
  spellIds: number[];
  auraScripts: ScriptDevAuraScript[];
  // Creature entries this script can UpdateEntry into mid-fight (Dathrohan → Balnazzar 10813). The
  // spec builder resolves each against the bake so combat can swap stats without a DataStore.
  morphEntries: number[];
  ir: ScriptDevIR;
}

// ScriptedAI and ScriptedInstance constants (sc_creature.cpp, sc_instance.h, system.h)

/** ScriptedAI.cpp:22–24 m_uiEvadeCheckCooldown = 2500 ms */
export const SCRIPTED_AI_EVADE_COOLDOWN_MS = 2500;

/** EncounterState enum. Cite: sc_instance.h:12–19 */
export const ENCOUNTER_STATE = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  FAIL: 2,
  DONE: 3,
  SPECIAL: 4,
} as const;

/** Script texts offset ranges. Cite: system.h:35–38, system.cpp:48 LoadMangosStrings */
export const TEXT_SOURCE_RANGE = {
  SCRIPT_TEXTS_START: -1_000_000,
  SCRIPT_TEXTS_END: -1_999_999,
  CUSTOM_TEXTS_START: -2_000_000,
  CUSTOM_TEXTS_END: -2_999_999,
  GOSSIP_TEXTS_START: -3_000_000,
  GOSSIP_TEXTS_END: -3_999_999,
} as const;
