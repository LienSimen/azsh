// Naxxramas Construct Quarter — the ScriptDevAI IR port of Patchwerk, Grobbulus, Gluth and
// Thaddius plus his two adds. Cadence is creature_spell_list rows; the C++ is cited per timer.

import type { ScriptDevAction, ScriptDevIR, ScriptDevTimer } from './types.ts';
import { AI_EVENT, INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// naxxramas.h:65-68
const TYPE = { PATCHWERK: 9, GROBBULUS: 10, GLUTH: 11, THADDIUS: 12 } as const;

// naxxramas.h:80-83; Patchwerk and Grobbulus are not in the header — they resolve by
// creature_template.entry with ScriptName boss_patchwerk / boss_grobbulus.
const NPC = {
  PATCHWERK: 16028, GROBBULUS: 15931, GLUTH: 15932,
  THADDIUS: 15928, STALAGG: 15929, FEUGEN: 15930,
} as const;

/** BossAI::SetDataType — Aggro IN_PROGRESS, JustDied DONE, evade/home FAIL. Cite: BossAI.cpp:41-98. */
function lifecycleFor(field: number, file: string) {
  return {
    onAggro: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.IN_PROGRESS, cite: `${file} SetDataType; BossAI.cpp:75 Aggro SetData(IN_PROGRESS)` }],
    onDeath: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.DONE, cite: `${file} SetDataType; BossAI.cpp:49 JustDied SetData(DONE)` }],
    onEvade: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.FAIL, cite: `${file} SetDataType; BossAI.cpp:59,94 SetData(FAIL)` }],
  };
}

// `creature_spell_list.TargetId` → IR target mode: 0 NONE (self-cast), 1 CURRENT (victim), 100
// attack-random-player, 101 attack-random-non-tank. Cite: CreatureSpellList.h:34-43.
const t = (
  id: string, spellId: number, iMin: number, iMax: number, rMin: number, rMax: number,
  target: ScriptDevTimer['target'], cite: string, extra: Partial<ScriptDevTimer> = {},
): ScriptDevTimer => ({
  id, spellId, initialMinMs: iMin, initialMaxMs: iMax, repeatMinMs: rMin, repeatMaxMs: rMax,
  target, cite, ...extra,
});

// Side-store for the two adds' faking-death count. naxxramas.h:10 MAX_ENCOUNTER is 16, so 16 is the
// first field no TYPE_ owns — the same trick the bug trio's consume counter uses.
const THADDIUS_FAKE_KEY = 16;

// A lethal hit leaves the body at 1 hp and counted; 10 s later it REVIVES unless its partner is
// down too, which is why they must die together. Cite: boss_thaddius.cpp:163-189,197-279.
function thaddiusAddDeathChain(): {
  onReset: ScriptDevAction[];
  onPreventedDeath: ScriptDevAction[];
  onEvade: ScriptDevAction[];
  timers: ScriptDevTimer[];
} {
  const cite = 'boss_thaddius.cpp:197-279';
  return {
    onReset: [
      { kind: 'set_death_prevention', enabled: true, cite: `${cite} Reset SetDeathPrevention(true)` },
      { kind: 'set_instance_data', field: THADDIUS_FAKE_KEY, value: 0, cite: `${cite} Reset clears m_isFakingDeath` },
    ],
    onPreventedDeath: [
      { kind: 'set_instance_data', field: THADDIUS_FAKE_KEY, value: 1, increment: true, cite: `${cite} JustPreventedDeath m_isFakingDeath = true` },
      { kind: 'set_health_pct', pct: 1, cite: 'boss_thaddius.cpp:264 SetHealth(1)' },
      { kind: 'set_unattackable', cite: 'boss_thaddius.cpp:269 SetFlag(UNIT_FLAG_UNINTERACTIBLE | IMMUNE_TO_PLAYER)' },
      { kind: 'stop_combat', attackOnly: true, cite: 'boss_thaddius.cpp:265-274 StopMoving + MoveIdle + SetCombatScriptStatus(true)' },
      { kind: 'arm_timer', timerId: 'add_revive', delayMs: 10_000, cite: 'boss_thaddius.cpp:278 ResetTimer(THADDIUS_ADD_REVIVE, 10s)' },
      { kind: 'arm_timer', timerId: 'add_shock_overload', delayMs: 24_000, cite: 'boss_thaddius.cpp:175-181 the 14 s SHOCK_OVERLOAD is armed inside the 10 s revive tick, so 24 s from the fake death' },
    ],
    onEvade: [
      { kind: 'set_instance_data', field: THADDIUS_FAKE_KEY, value: 0, cite: `${cite} Reset on evade clears the count` },
    ],
    timers: [
      // Fires 10 s after the fake death. The gate is the partner's state: one add down revives,
      // both down stays down. Cite: boss_thaddius.cpp:168-188 otherAI->IsCountingDead().
      {
        id: 'add_revive',
        spellId: 0,
        initialMinMs: 0, initialMaxMs: 0, repeatMinMs: 0, repeatMaxMs: 0,
        target: 'self',
        pollOnly: true,
        startDisabled: true,
        oneShot: true,
        gate: { field: THADDIUS_FAKE_KEY, notEquals: 2, cite: 'boss_thaddius.cpp:172 IsCountingDead() on the OTHER add' },
        cite: 'boss_thaddius.cpp:166-188 AddCustomAction(THADDIUS_ADD_REVIVE) then Revive()',
        actions: [
          { kind: 'set_instance_data', field: THADDIUS_FAKE_KEY, value: -1, increment: true, cite: 'boss_thaddius.cpp:234 m_isFakingDeath = false' },
          { kind: 'set_health_pct', pct: 100, cite: 'boss_thaddius.cpp:206 Reset SetHealth(GetMaxHealth())' },
          { kind: 'clear_unattackable', cite: 'boss_thaddius.cpp:205 Reset RemoveFlag(UNINTERACTIBLE | IMMUNE_TO_PLAYER)' },
          { kind: 'reset_threat', cite: 'boss_thaddius.cpp:236 Revive() DoResetThreat()' },
          { kind: 'disable_timer', timerId: 'add_shock_overload', cite: 'boss_thaddius.cpp:184 the overload only arms on the both-down branch' },
          { kind: 'flavor', text: 'surges back to its feet!', cite: 'boss_thaddius.cpp:234-238 Revive()' },
        ],
      },
      // Both down: 14 s after the revive tick declined, the teslas overload and wake Thaddius.
      {
        id: 'add_shock_overload',
        spellId: 28359,
        initialMinMs: 0, initialMaxMs: 0, repeatMinMs: 0, repeatMaxMs: 0,
        target: 'self',
        startDisabled: true,
        oneShot: true,
        castFlags: CAST_FLAG.TRIGGERED,
        gate: { field: THADDIUS_FAKE_KEY, equals: 2, cite: 'boss_thaddius.cpp:172-184 both adds counting dead' },
        cite: 'boss_thaddius.cpp:175-181 AddCustomAction(THADDIUS_ADD_SHOCK_OVERLOAD, 14s) SPELL_TRIGGER_TESLAS 28359',
      },
    ],
  };
}

// boss_patchwerk
export const BOSS_PATCHWERK: ScriptDevIR = {
  name: 'boss_patchwerk',
  boundCreatures: [NPC.PATCHWERK],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_patchwerk.cpp',
  spellIds: [28307, 28308, 28131, 26662, 32309],
  timers: [
    // ---- PHASE 0, list 1602801 (SPELLSET_NORMAL) ----
    t('hateful_strike', 28308, 1200, 1200, 1200, 1200, 'victim', 'creature_spell_list 1602801:1 Patchwerk - Hateful Strike Primer 28307 -> 28308; boss_patchwerk.cpp:110-141 SCHEME_HIGHEST_HP top-4 melee', { phase: 0, highestHpTopThreat: 4 }),
    // Phase-free on purpose: the soft enrage is a timerless HP check that does NOT swap the list,
    // so it must survive the 7-minute swap. The 300 s aura + AURA_NOT_PRESENT makes it fire once.
    t('enrage', 28131, 0, 0, 0, 0, 'self', 'boss_patchwerk.cpp:65,81-92 AddTimerlessCombatAction; GetHealthPercent() < 5.0f -> SPELL_ENRAGE then DisableCombatAction', { hpPctMax: 5, castFlags: CAST_FLAG.AURA_NOT_PRESENT }),
    // ---- PHASE 1, list 1602802 (SPELLSET_BERSERK): the primer doubles in rate and Slimebolt joins ----
    t('hateful_strike_berserk', 28308, 0, 0, 1000, 1000, 'victim', 'creature_spell_list 1602802:1 Patchwerk - Hateful Strike Primer (Berserk) 28307 -> 28308', { phase: 1, highestHpTopThreat: 4 }),
    t('slimebolt_berserk', 32309, 1000, 1000, 1000, 1000, 'victim', 'creature_spell_list 1602802:2 Patchwerk - Slimebolt (Berserk), TargetId 1 = Current', { phase: 1 }),
  ],
  timedPhases: [
    {
      id: 'berserk',
      phase: 1,
      afterMs: 420_000,
      actions: [
        { kind: 'cast_self', spellId: 26662, cite: 'boss_patchwerk.cpp:95 DoCastSpellIfCan(nullptr, SPELL_BERSERK)' },
        { kind: 'flavor', text: 'goes berserk - slime sprays the room!', cite: 'boss_patchwerk.cpp:97 DoBroadcastText(EMOTE_GENERIC_BERSERK)' },
      ],
      cite: 'boss_patchwerk.cpp:66,93-101 AddCombatAction(PATCHWERK_BERSERK, 7*MINUTE) -> SetSpellList(SPELLSET_BERSERK 1602802)',
    },
  ],
  lifecycle: lifecycleFor(TYPE.PATCHWERK, 'boss_patchwerk.cpp:61'),
  cites: [
    'boss_patchwerk.cpp:30-152 whole file',
    'creature_spell_list_entry 1602801 "Naxxramas - Patchwerk", 1602802 "Naxxramas - Patchwerk - Berserk"',
    'boss_patchwerk.cpp:110-141 HatefulStrikePrimer 28307 -> 28308 highestHpTopThreat 4 melee',
  ],
};

// boss_grobbulus
export const BOSS_GROBBULUS: ScriptDevIR = {
  name: 'boss_grobbulus',
  boundCreatures: [NPC.GROBBULUS],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_grobbulus.cpp',
  spellIds: [28157, 28240, 28169, 26662, 28137, 28322, 28206, 28218, 30134],
  timers: [
    t('slime_spray', 28157, 20_000, 30_000, 20_000, 30_000, 'self', 'creature_spell_list 1593101:0 Grobbulus - Slime Spray (TargetId 0 = None)'),
    t('poison_cloud', 28240, 20_000, 25_000, 15_000, 15_000, 'self', 'creature_spell_list 1593101:1 Grobbulus - Poison Cloud'),
    // The injection cadence nearly doubles under 30 %. Bands are inclusive, so both rows are
    // live at exactly 30 % where the DB is strict > / < — one point of overlap, not a phase.
    t('mutating_injection_high', 28169, 13_000, 13_000, 13_000, 13_000, 'hostile_random_not_top_player', 'creature_spell_list 1593101:2 Above 30% (CombatCondition 1105 -> combat_condition 1105 -> unit_condition 870 HEALTH_PERCENT > 30), TargetId 101', { hpPctMin: 30 }),
    t('mutating_injection_low', 28169, 0, 0, 7000, 7000, 'hostile_random_not_top_player', 'creature_spell_list 1593101:3 Below 30% (CombatCondition 1128 -> combat_condition 1128 -> unit_condition 888 HEALTH_PERCENT < 30), TargetId 101', { hpPctMax: 30 }),
    t('berserk', 26662, 720_000, 720_000, 720_000, 720_000, 'self', 'creature_spell_list 1593101:4 Grobbulus - Berserk (12min)'),
    t('slime_stream', 28137, 5000, 5000, 5000, 5000, 'self', 'boss_grobbulus.cpp:61 AddCombatAction(SLIME_STREAM, true); :97-110 CHECK_MELEE 5s then 1s, STREAM 5s while !CanReachWithMeleeAttack', { requireVictimNotInMelee: true, castFlags: CAST_FLAG.TRIGGERED }),
  ],
  lifecycle: lifecycleFor(TYPE.GROBBULUS, 'boss_grobbulus.cpp:60'),
  cites: [
    'boss_grobbulus.cpp:30-162 whole file',
    'creature_spell_list_entry 1593101 "Naxxramas - Grobbulus"',
    'boss_grobbulus.cpp:61,97-110 SLIME_STREAM 28137 requireVictimNotInMelee 5s TRIGGERED',
    'boss_grobbulus.cpp:75-80 SpellHitTarget 28157 -> 28218 NPC 16290 per player',
    'boss_grobbulus.cpp:119-140 MutatingInjection expire -> 28322 / dispel -> 28206, always 28240'
      + ' (interpreter/handlers/aura-remove.ts)',
  ],
};

// boss_gluth
export const BOSS_GLUTH: ScriptDevIR = {
  name: 'boss_gluth',
  boundCreatures: [NPC.GLUTH],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_gluth.cpp',
  // Double Attack 19818 pays through 18941; a trigger payload resolves off the kit.
  spellIds: [25646, 28371, 28374, 28375, 29685, 26662, 19818, 28216, 28217, 28235, 28236, 28238, 28239, 29681, 18941],
  timers: [
    t('zombie_chow_search', 28235, 0, 0, 0, 0, 'self', 'boss_gluth.cpp:112 Aggro DoCastSpellIfCan(SPELL_ZOMBIE_CHOW_SEARCH, TRIGGERED|AURA_NOT_PRESENT)', { onReset: true }),
    t('call_all_zombie_chow', 29681, 0, 0, 0, 0, 'self', 'boss_gluth.cpp:113 Aggro DoCastSpellIfCan(SPELL_CALL_ALL_ZOMBIE_CHOW, TRIGGERED|AURA_NOT_PRESENT)', { onReset: true }),
    t('summon_zombie_chow', 28216, 0, 0, 0, 0, 'self', 'boss_gluth.cpp:116-120 trigger CastSpell SPELL_SUMMON_ZOMBIE_CHOW 28216 (triggers have no IR; Gluth holds the aura)', { onReset: true, castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT }),
    t('double_attack', 19818, 0, 0, 0, 0, 'self', 'boss_gluth.cpp:114 Aggro DoCastSpellIfCan(SPELL_DOUBLE_ATTACK, TRIGGERED|AURA_NOT_PRESENT)', { onReset: true }),
    t('mortal_wound', 25646, 10_000, 10_000, 10_000, 10_000, 'victim', 'creature_spell_list 1593201:1 Gluth - Mortal Wound (TargetId 1 = Current); boss_gluth.cpp:68,83 10s'),
    t('frenzy', 28371, 10_000, 10_000, 10_000, 12_000, 'self', 'creature_spell_list 1593201:2 Gluth - Frenzy; boss_gluth.cpp:70,84 10s then urand(10,12)s'),
    t('decimate', 28374, 105_000, 105_000, 100_000, 110_000, 'self', 'creature_spell_list 1593201:3 Gluth - Decimate; boss_gluth.cpp:69,86 105s then urand(100,110)s'),
    t('terrifying_roar', 29685, 20_000, 20_000, 20_000, 20_000, 'self', 'creature_spell_list 1593201:4 Gluth - Terrifying Roar; boss_gluth.cpp:71,85 20s'),
    t('berserk', 26662, 390_000, 390_000, 300_000, 300_000, 'self', 'creature_spell_list 1593201:5 Gluth - Berserk; boss_gluth.cpp:72,87 390s then 5*MINUTE'),
  ],
  lifecycle: lifecycleFor(TYPE.GLUTH, 'boss_gluth.cpp:66'),
  cites: [
    'boss_gluth.cpp:30-257 whole file',
    'creature_spell_list_entry 1593201 "Naxxramas - Gluth"',
    'boss_gluth.cpp:92-159,203-242 ReceiveAIEvent CUSTOM_A -> 28239 instakill -> 28238 5% heal',
    'boss_gluth.cpp:116-136 SPELL_SUMMON_ZOMBIE_CHOW 28216 on Gluth (map triggers have no IR)',
    'boss_gluth.cpp:162-182 Decimate 28374 -> 28375 custom damage to 5% max HP',
  ],
};

// boss_thaddius (+ boss_stalagg / boss_feugen, registered by the same cpp)
export const BOSS_THADDIUS: ScriptDevIR = {
  name: 'boss_thaddius',
  boundCreatures: [NPC.THADDIUS],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_thaddius.cpp',
  spellIds: [27680, 28089, 28167, 28299, 28160, 28136, 28059, 28084, 28062, 28085, 29659, 29660],
  timers: [
    t('berserk', 27680, 360_000, 360_000, 600_000, 600_000, 'self', 'creature_spell_list 1592801:0 Thaddius - Berserk'),
    t('polarity_shift', 28089, 15_000, 15_000, 30_000, 30_000, 'self', 'creature_spell_list 1592801:1 Thaddius - Polarity Shift'),
    t('chain_lightning', 28167, 8000, 8000, 15_000, 15_000, 'hostile_random_player', 'creature_spell_list 1592801:2 Thaddius - Chain Lightning (TargetId 100 = Attack - random player)'),
    t('ball_lightning', 28299, 3000, 3000, 3000, 3000, 'hostile_random_player', 'creature_spell_list 1592801:3 Thaddius - Ball Lightning CombatCondition 321 → unit_condition 361 NUMBER_OF_MELEE_ATTACKERS == 0, TargetId 100', { combatCondition: 321 }),
    {
      id: 'tesla_overload',
      spellId: 28136,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      startDisabled: true,
      oneShot: true,
      pollOnly: true,
      cite: 'boss_thaddius.cpp:177-180 both adds dead → 14s SPELL_TRIGGER_TESLAS then Shock strips 28160',
      actions: [
        { kind: 'clear_unattackable', cite: 'boss_thaddius.cpp:329-332 ShockThaddius RemoveAurasDueToSpell(SPELL_THADIUS_SPAWN)' },
        { kind: 'remove_auras', spellId: 28160, cite: 'boss_thaddius.cpp:331 RemoveAurasDueToSpell(SPELL_THADIUS_SPAWN 28160)' },
        { kind: 'flavor', text: 'the teslas overload - Thaddius is loose!', cite: 'boss_thaddius.cpp:332 SPELL_THADIUS_LIGHTNING_VISUAL 28136' },
      ],
    },
  ],
  // boss_thaddiusAI declares THADDIUS_ACTION_MAX with no actions: the spell list IS his kit.
  lifecycle: (() => {
    const life = lifecycleFor(TYPE.THADDIUS, 'boss_thaddius.cpp:101');
    return {
      ...life,
      onReset: [
        { kind: 'set_unattackable', cite: 'boss_thaddius.cpp:112 SetFlag UNIT_FLAG_UNINTERACTIBLE' },
        { kind: 'cast_self', spellId: 28160, castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT, cite: 'boss_thaddius.cpp:114 SPELL_THADIUS_SPAWN 28160 TRIGGERED|AURA_NOT_PRESENT' },
      ],
      onDeath: [
        ...life.onDeath,
        {
          kind: 'send_ai_event' as const,
          eventType: AI_EVENT.CUSTOM_A,
          receiver: 'creature_entry' as const,
          creatureEntry: NPC.FEUGEN,
          cite: 'boss_thaddius.cpp:136-142 JustDied GetSingleCreatureFromStorage(NPC_FEUGEN) ForcedDespawn',
        },
        {
          kind: 'send_ai_event' as const,
          eventType: AI_EVENT.CUSTOM_A,
          receiver: 'creature_entry' as const,
          creatureEntry: NPC.STALAGG,
          cite: 'boss_thaddius.cpp:137-143 JustDied GetSingleCreatureFromStorage(NPC_STALAGG) ForcedDespawn',
        },
      ],
    };
  })(),
  addDeaths: [
    {
      creatureEntries: [NPC.STALAGG, NPC.FEUGEN],
      atKilled: 2,
      total: 2,
      actions: [
        { kind: 'arm_timer', timerId: 'tesla_overload', delayMs: 14_000, cite: 'boss_thaddius.cpp:177-180 both IsCountingDead → 14s TRIGGER_TESLAS' },
      ],
      cite: 'boss_thaddius.cpp:174-180 otherAI->IsCountingDead then 14s teslas',
    },
  ],
  cites: [
    'boss_thaddius.cpp:34-146 boss_thaddiusAI; :546-572 AddSC',
    'creature_spell_list_entry 1592801 "Naxxramas - Thaddius"',
    'boss_thaddius.cpp:109-129,177-180,319-343 UNINTERACTIBLE + 28160 until both adds down then 14s teslas',
    'boss_thaddius.cpp:131-145 JustDied ForcedDespawn Feugen 15930 + Stalagg 15929',
    'boss_thaddius.cpp:363-468 PolarityShift 28089 assigns 28059/28084; 28062/28085 skip same-charge; 29659/29660 stack 13yd',
  ],
};

export const BOSS_STALAGG: ScriptDevIR = {
  name: 'boss_stalagg',
  boundCreatures: [NPC.STALAGG],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_thaddius.cpp',
  spellIds: [28134, 28125, 28338, 28339, 28096, 28097, 28359],
  timers: [
    t('power_surge', 28134, 10_000, 15_000, 10_000, 15_000, 'self', 'creature_spell_list 1592901:0 Stalagg - Powersurge'),
    t('war_stomp', 28125, 8000, 10_000, 8000, 10_000, 'self', 'creature_spell_list 1592901:1 Stalagg - Warstomp'),
    // OnSpellCast 28338 makes FEUGEN cast 28339: the pair swaps the tanks, one half alone just pulls
    // Stalagg's. CUSTOM_B carries it, because CUSTOM_A is already Thaddius's despawn broadcast.
    t('magnetic_pull', 28338, 20_000, 20_000, 20_000, 20_000, 'self', 'creature_spell_list 1592901:2 Stalagg - Magnetic Pull', {
      actions: [{
        kind: 'send_ai_event',
        eventType: AI_EVENT.CUSTOM_B,
        receiver: 'creature_entry',
        creatureEntry: NPC.FEUGEN,
        radiusYd: 100,
        cite: 'boss_thaddius.cpp:295-302 OnSpellCast SPELL_MAGNETIC_PULL_A -> feugen->CastSpell(SPELL_MAGNETIC_PULL_B)',
      }],
    }),
    ...thaddiusAddDeathChain().timers,
  ],
  // Still no onDeath DONE: the adds never end the encounter, Thaddius does. What they DO own now is
  // the death-prevention chain, so a lethal hit is a 10 s clock rather than a kill.
  lifecycle: {
    onAggro: [{ kind: 'set_instance_data', field: TYPE.THADDIUS, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_thaddius.cpp:167 SetDataType(TYPE_THADDIUS); BossAI.cpp:75' }],
    onReset: thaddiusAddDeathChain().onReset,
    onPreventedDeath: thaddiusAddDeathChain().onPreventedDeath,
    onEvade: [
      { kind: 'set_instance_data', field: TYPE.THADDIUS, value: INSTANCE_DATA.FAIL, cite: 'boss_thaddius.cpp:167 SetDataType(TYPE_THADDIUS); BossAI.cpp:59,94' },
      ...thaddiusAddDeathChain().onEvade,
    ],
  },
  receiveAiEvents: [{
    eventType: AI_EVENT.CUSTOM_A,
    senderEntry: NPC.THADDIUS,
    actions: [{ kind: 'force_despawn', cite: 'boss_thaddius.cpp:137-143 JustDied stalagg->ForcedDespawn' }],
    cite: 'boss_thaddius.cpp:131-145 Thaddius JustDied ForcedDespawn Stalagg',
  }],
  cites: [
    'boss_thaddius.cpp:163-303 boss_thaddiusAddsAI + boss_stalaggAI',
    'creature_spell_list_entry 1592901 "Naxxramas - Stalagg"',
    'boss_thaddius.cpp:295-302 OnSpellCast 28338 -> partner casts 28339 via send_ai_event CUSTOM_B',
    'boss_thaddius.cpp:163-189,197-279 SetDeathPrevention + 10 s revive + 14 s TRIGGER_TESLAS 28359 via thaddiusAddDeathChain; the partner test is instance field 16, the first one no TYPE_ owns',
  ],
};

export const BOSS_FEUGEN: ScriptDevIR = {
  name: 'boss_feugen',
  boundCreatures: [NPC.FEUGEN],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_thaddius.cpp',
  spellIds: [28135, 28125, 28111, 28109, 28359, 28339],
  timers: [
    t('static_field', 28135, 10_000, 15_000, 10_000, 15_000, 'self', 'creature_spell_list 1593001:0 Feugen - Static Field'),
    t('war_stomp', 28125, 8000, 10_000, 8000, 10_000, 'self', 'creature_spell_list 1593001:1 Feugen - Warstomp'),
    ...thaddiusAddDeathChain().timers,
  ],
  lifecycle: {
    onAggro: [{ kind: 'set_instance_data', field: TYPE.THADDIUS, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_thaddius.cpp:167 SetDataType(TYPE_THADDIUS); BossAI.cpp:75' }],
    onReset: thaddiusAddDeathChain().onReset,
    onPreventedDeath: thaddiusAddDeathChain().onPreventedDeath,
    onEvade: [
      { kind: 'set_instance_data', field: TYPE.THADDIUS, value: INSTANCE_DATA.FAIL, cite: 'boss_thaddius.cpp:167 SetDataType(TYPE_THADDIUS); BossAI.cpp:59,94' },
      ...thaddiusAddDeathChain().onEvade,
    ],
  },
  receiveAiEvents: [
    {
      eventType: AI_EVENT.CUSTOM_A,
      senderEntry: NPC.THADDIUS,
      actions: [{ kind: 'force_despawn', cite: 'boss_thaddius.cpp:136-142 JustDied feugen->ForcedDespawn' }],
      cite: 'boss_thaddius.cpp:131-145 Thaddius JustDied ForcedDespawn Feugen',
    },
    {
      // Stalagg's 28338 landed, so Feugen throws the other half. The C++ note says it is meant to be
      // cast untriggered, so the row does not stamp CAST_TRIGGERED.
      eventType: AI_EVENT.CUSTOM_B,
      senderEntry: NPC.STALAGG,
      actions: [{ kind: 'cast_self', spellId: 28339, cite: 'boss_thaddius.cpp:299-301 feugen->CastSpell(nullptr, SPELL_MAGNETIC_PULL_B 28339)' }],
      cite: 'boss_thaddius.cpp:295-302 boss_stalaggAI::OnSpellCast pairs the two pulls',
    },
  ],
  cites: [
    'boss_thaddius.cpp:163-317 boss_thaddiusAddsAI + boss_feugenAI',
    'creature_spell_list_entry 1593001 "Naxxramas - Feugen"',
    'boss_thaddius.cpp:163-189,197-279 SetDeathPrevention + 10 s revive + 14 s TRIGGER_TESLAS 28359 via thaddiusAddDeathChain; the partner test is instance field 16, the first one no TYPE_ owns',
  ],
};

export const NAXXRAMAS_CONSTRUCT_IRS: readonly ScriptDevIR[] = [
  BOSS_PATCHWERK, BOSS_GROBBULUS, BOSS_GLUTH, BOSS_THADDIUS, BOSS_STALAGG, BOSS_FEUGEN,
];
