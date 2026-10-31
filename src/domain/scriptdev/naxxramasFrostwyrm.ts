// Naxxramas Frostwyrm Lair — the ScriptDevAI IR port of Sapphiron and Kel'Thuzad plus their two
// helper scripts. Sapphiron owns his schedule through list swaps; Kel'Thuzad keeps his baked list.

import type {
  ScriptDevAction, ScriptDevIR, ScriptDevSummonWave, ScriptDevTimedPhase, ScriptDevTimer,
} from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// naxxramas.h:70-71
const TYPE = { SAPPHIRON: 13, KELTHUZAD: 14 } as const;

// naxxramas.h:98-100,116-119
const NPC = {
  SAPPHIRON: 15989, KELTHUZAD: 15990, THE_LICHKING: 16980,
  SOLDIER_FROZEN: 16427, UNSTOPPABLE_ABOM: 16428, SOUL_WEAVER: 16429, GUARDIAN: 16441,
  BLIZZARD: 16474,
} as const;

// naxxramas.h:157-160
const GO_KELTHUZAD_WINDOW = [181402, 181403, 181404, 181405] as const;

/** BossAI::SetDataType — Aggro IN_PROGRESS, JustDied DONE, evade/home FAIL. Cite: BossAI.cpp:41-98. */
function lifecycleFor(field: number, file: string) {
  return {
    onAggro: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.IN_PROGRESS, cite: `${file} SetDataType; BossAI.cpp:75 Aggro SetData(IN_PROGRESS)` }],
    onDeath: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.DONE, cite: `${file} SetDataType; BossAI.cpp:49 JustDied SetData(DONE)` }],
    onEvade: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.FAIL, cite: `${file} SetDataType; BossAI.cpp:59,94 SetData(FAIL)` }],
  };
}

// `creature_spell_list.TargetId` → IR target mode: 0 NONE (self-cast), 1 CURRENT (victim).
// Cite: CreatureSpellList.h:34-43; creature_spell_targeting rows 0,1.
const t = (
  id: string, spellId: number, iMin: number, iMax: number, rMin: number, rMax: number,
  target: ScriptDevTimer['target'], cite: string, extra: Partial<ScriptDevTimer> = {},
): ScriptDevTimer => ({
  id, spellId, initialMinMs: iMin, initialMaxMs: iMax, repeatMinMs: rMin, repeatMaxMs: rMax,
  target, cite, ...extra,
});

// boss_sapphiron
export const BOSS_SAPPHIRON: ScriptDevIR = {
  name: 'boss_sapphiron',
  boundCreatures: [NPC.SAPPHIRON],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_sapphiron.cpp',
  // Trigger payloads ride the KIT: stepSession resolves a periodic trigger off
  // spec.spells, so a payload missing here delivers nothing (moltenCore.ts:88 same rule).
  spellIds: [
    19818, 28529, 26662, 19983, 15847, 28542, 28560, 28561,
    18430, 28526, 28522, 31800, 28535, 30101, 28524, 29329, 29330,
    18941, 28531, 29318, 30132, 29336,
  ],
  timers: [
    t('double_attack', 19818, 0, 0, 0, 0, 'self', 'boss_sapphiron.cpp:111 Reset DoCastSpellIfCan(SPELL_DOUBLE_ATTACK, CAST_TRIGGERED|CAST_AURA_NOT_PRESENT)', { onReset: true }),
    t('frost_aura', 28529, 0, 0, 0, 0, 'self', 'boss_sapphiron.cpp:127 Aggro DoCastSpellIfCan(SPELL_FROST_AURA, CAST_TRIGGERED|CAST_AURA_NOT_PRESENT); :35 periodically triggers 28531', { onReset: true }),
    // Phase-free: the 15-minute enrage is in neither list and must survive both swaps.
    // AURA_NOT_PRESENT makes the 300 s re-arm fire exactly once, matching DisableCombatAction.
    t('berserk', 26662, 900_000, 900_000, 300_000, 300_000, 'self', 'boss_sapphiron.cpp:88,118,190-197 AddCombatAction(SAPPHIRON_BERSERK, 15*MINUTE), subsequent 300s, DisableCombatAction on CAST_OK', { castFlags: CAST_FLAG.AURA_NOT_PRESENT }),
    // ---- PHASE 0, list 1598901 (SPELLSET_GROUND) ----
    t('cleave', 19983, 5000, 5000, 5000, 10_000, 'victim', 'creature_spell_list 1598901:1 Sapphiron - Cleave (TargetId 1 = Current)', { phase: 0 }),
    t('tail_sweep', 15847, 12_000, 12_000, 7000, 10_000, 'self', 'creature_spell_list 1598901:2 Sapphiron - Tail Sweep (TargetId 0 = None)', { phase: 0 }),
    t('life_drain', 28542, 11_000, 11_000, 24_000, 24_000, 'self', 'creature_spell_list 1598901:3 Sapphiron - Life Drain', { phase: 0 }),
    t('blizzard', 28560, 15_000, 15_000, 10_000, 30_000, 'self', 'creature_spell_list 1598901:4 Sapphiron - Blizzard', { phase: 0 }),
    // PHASE 1, list 1598902 SPELLSET_AIR. 28526 is a bare SCRIPT effect: the pick (a player without
    // 28522) and the 31800 immunity ARE the port, and that immunity carries them through the breath.
    t('icebolt', 28522, 2000, 2000, 3000, 3000, 'hostile_random_player_not_aura', 'creature_spell_list 1598902:1 Sapphiron - Icebolt (live3310 dump); boss_sapphiron.cpp:238-250 IceBolt SpellScript SelectAttackingTarget(RANDOM, 0, SPELL_ICEBOLT, PLAYER | NOT_AURA)', {
      phase: 1,
      actions: [
        {
          kind: 'cast_on_cast_target',
          spellId: 31800,
          castFlags: CAST_FLAG.TRIGGERED,
          auraNotPresent: true,
          cite: 'boss_sapphiron.cpp:268-274 PeriodicIceBolt: !HasAura(SPELL_ICEBOLT_IMMUNITY) -> CastSpell(target, 31800)',
        },
        {
          kind: 'cast_on_cast_target',
          spellId: 28535,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'boss_sapphiron.cpp:272 data.spellInfo = SPELL_ICEBLOCK_SUMMON 28535 (GO 181247, 22 s)',
        },
      ],
    }),
    // ---- PHASE 2, list 1598903 (SPELLSET_NULL): zero rows, so zero timers ----
  ],
  timedPhases: [
    {
      id: 'air',
      phase: 1,
      afterMs: 46_000,
      next: 'frost_breath',
      hpMinPct: 10,
      actions: [
        { kind: 'set_melee_enabled', enabled: false, cite: 'boss_sapphiron.cpp:207 SetMeleeEnabled(false)' },
        { kind: 'cast_self', spellId: 29329, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_sapphiron.cpp:144 SPELL_SUMMON_WING_BUFFET' },
        { kind: 'cast_self', spellId: 18430, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_sapphiron.cpp:150 CastSpell(SPELL_DRAGON_HOVER, TRIGGERED_OLD_TRIGGERED)' },
        { kind: 'flavor', text: 'takes to the air!', cite: 'boss_sapphiron.cpp:148 HandleEmote(EMOTE_ONESHOT_LIFTOFF)' },
      ],
      cite: 'boss_sapphiron.cpp:89,199-211 AddCombatAction(SAPPHIRON_AIR_PHASE, 46s) -> :151 SetSpellList(SPELLSET_AIR 1598902)',
    },
    {
      // 2000 initial + 5 x 3000 repeat = the SIXTH icebolt, which is the cast at which
      // m_iceboltCount has reached 5. Cite: creature_spell_list 1598902:1 + :251.
      id: 'frost_breath',
      phase: 2,
      afterMs: 17_000,
      next: 'ground',
      actions: [
        { kind: 'cast_self', spellId: 28524, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_sapphiron.cpp:254 CastSpell(SPELL_FROST_BREATH); :52 triggers 29318 + 30132' },
        { kind: 'cast_self', spellId: 30101, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_sapphiron.cpp:253,181 SPELL_FROST_BREATH_DUMMY' },
        { kind: 'flavor', text: 'takes a deep breath...', cite: 'boss_sapphiron.cpp:255 DoBroadcastText(EMOTE_BREATH 7213)' },
      ],
      cite: 'boss_sapphiron.cpp:251-258 m_iceboltCount >= 5 -> Frost Breath then SetSpellList(SPELLSET_NULL 1598903)',
    },
    {
      // 10 s from the breath to the landing emote (:257), then 2 s to the ground list (:158).
      id: 'ground',
      phase: 0,
      afterMs: 12_000,
      next: 'air',
      actions: [
        { kind: 'set_melee_enabled', enabled: true, cite: 'boss_sapphiron.cpp:167 SetMeleeEnabled(true)' },
        { kind: 'cast_self', spellId: 29330, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_sapphiron.cpp:145 SPELL_DESPAWN_WING_BUFFET' },
        { kind: 'remove_auras', spellId: 18430, cite: 'boss_sapphiron.cpp:169 RemoveAurasDueToSpell(SPELL_DRAGON_HOVER)' },
        { kind: 'flavor', text: 'lands.', cite: 'boss_sapphiron.cpp:157 HandleEmote(EMOTE_ONESHOT_LAND)' },
      ],
      cite: 'boss_sapphiron.cpp:155-175 HandleLandingPhase -> HandleGroundPhase SetSpellList(SPELLSET_GROUND 1598901) + ResetCombatAction(AIR_PHASE, 46s)',
    },
  ],
  lifecycle: lifecycleFor(TYPE.SAPPHIRON, 'boss_sapphiron.cpp:87'),
  cites: [
    'boss_sapphiron.cpp:28-347 whole file',
    'creature_spell_list_entry 1598901 "Naxxramas - Sapphiron", 1598902 "… - Air Phase", 1598903 "… - NULL list" (live3310_classicmangos.sql)',
    'boss_sapphiron.cpp:201 air phase only while GetHealthPercent() > 10.f (timedPhases.air.hpMinPct)',
    'boss_sapphiron.cpp:238-279 Icebolt pick + 31800 immunity + 28535 Ice Block via the icebolt row',
    'boss_sapphiron.cpp:280-306 DespawnIceBlock 30132 strips 31800/28522 early - residual: 30132 has no mapped effects, so the 27 s immunity outlives the breath instead of being cut by it',
  ],
};

// go_sapphiron_birth — GO 181356 'Sapphiron Birth' (gameobject_template.ScriptName)
export const GO_SAPPHIRON_BIRTH: ScriptDevIR = {
  name: 'go_sapphiron_birth',
  boundCreatures: [],
  boundGos: [181356],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_sapphiron.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [181356],
    gates: [{ field: TYPE.SAPPHIRON, equals: INSTANCE_DATA.NOT_STARTED, cite: 'boss_sapphiron.cpp:225 GetData(TYPE_SAPPHIRON) != NOT_STARTED -> return' }],
    actions: [{ kind: 'set_instance_data', field: TYPE.SAPPHIRON, value: INSTANCE_DATA.SPECIAL, cite: 'boss_sapphiron.cpp:233 SetData(TYPE_SAPPHIRON, SPECIAL)' }],
    cite: 'boss_sapphiron.cpp:218-235 GOUse_go_sapphiron_birth; :337 newScript->Name = "go_sapphiron_birth"',
  },
  cites: [
    'gameobject_template 181356 "Sapphiron Birth" ScriptName go_sapphiron_birth (live3310_classicmangos.sql)',
    'boss_sapphiron.cpp:229 GetSingleCreatureFromStorage safety check has no IR equivalent - harmless, it only guards a double summon',
  ],
};

// boss_kelthuzad — phase 1 ramp

// boss_kelthuzad.cpp:107-131 — [first tick, summon-rate aura, aura period ms, adds this segment].
// Periods and per-segment counts are the source's own annotations, summing to 14 / 14 / 120.
type KtSeg = readonly [tick: number, auraSpellId: number, periodMs: number, count: number];

const KT_TIMELINES: ReadonlyArray<{
  key: string; entry: number; segs: readonly KtSeg[]; cite: string;
}> = [
  {
    key: 'soul_weaver',
    entry: NPC.SOUL_WEAVER,
    segs: [
      [1, 29399, 40_000, 1], [42, 29401, 20_000, 1], [63, 28427, 30_000, 3],
      [154, 29412, 15_000, 9], [290, 0, 0, 0],
    ],
    cite: 'boss_kelthuzad.cpp:107-113 soulWeaverSpellsTimers (total 14)',
  },
  {
    key: 'abomination',
    entry: NPC.UNSTOPPABLE_ABOM,
    segs: [
      [15, 28426, 30_000, 2], [76, 29393, 25_000, 2], [127, 29394, 20_000, 5],
      [228, 29398, 15_000, 3], [259, 29411, 10_000, 2], [291, 0, 0, 0],
    ],
    cite: 'boss_kelthuzad.cpp:115-122 unstoppableAbominationSpellsTimers (total 14)',
  },
  {
    key: 'soldier',
    entry: NPC.SOLDIER_FROZEN,
    segs: [
      [7, 29410, 5000, 13], [73, 29391, 4000, 15], [134, 28425, 3000, 18],
      [189, 29392, 2000, 27], [244, 29409, 1000, 47], [292, 0, 0, 0],
    ],
    cite: 'boss_kelthuzad.cpp:124-131 soldierFrozenWasteSpellsTimers (total 120)',
  },
];

/** GetCreatures("KEL_THUZAD_WORLD_TRIGGERS_ADDS") — string_id 5330001, 8 creature_spawn_data rows. */
const KT_ALCOVE_TRIGGERS = 8;

/** boss_kelthuzad.cpp:213-221 — SummonIntroCreatures(entry, count) spawns count PER trigger. */
const KT_INTRO_BURSTS: Record<number, { entry: number; per: number; cite: string }> = {
  4: { entry: NPC.SOLDIER_FROZEN, per: 9, cite: 'boss_kelthuzad.cpp:213-215 tick 4 SummonIntroCreatures(NPC_SOLDIER_FROZEN, 9)' },
  9: { entry: NPC.UNSTOPPABLE_ABOM, per: 3, cite: 'boss_kelthuzad.cpp:216-218 tick 9 SummonIntroCreatures(NPC_UNSTOPPABLE_ABOM, 3)' },
  12: { entry: NPC.SOUL_WEAVER, per: 1, cite: 'boss_kelthuzad.cpp:219-221 tick 12 SummonIntroCreatures(NPC_SOUL_WEAVER, 1)' },
};

const KT_TICK_DESPAWN = 310;
const KT_TICK_PHASE_TWO = 325;

const KT_BOUNDARY_TICKS: readonly number[] = [
  ...new Set([
    ...KT_TIMELINES.flatMap((tl) => tl.segs.map((s) => s[0])),
    ...Object.keys(KT_INTRO_BURSTS).map(Number),
    KT_TICK_DESPAWN, KT_TICK_PHASE_TWO,
  ]),
].sort((a, b) => a - b);

/** Runtime phase for the segment starting at boundary index i; phase 0 is the pre-ramp second. */
const ktPhaseFor = (i: number) => i + 1;

const KT_PHASE_ONE: ScriptDevTimedPhase[] = KT_BOUNDARY_TICKS.map((tick, i) => {
  const actions: ScriptDevAction[] = [];
  const burst = KT_INTRO_BURSTS[tick];
  if (burst) {
    actions.push({
      kind: 'summon_count',
      creatureEntry: burst.entry,
      count: burst.per * KT_ALCOVE_TRIGGERS,
      cite: `${burst.cite} x ${KT_ALCOVE_TRIGGERS} triggers (:330 GetCreatures("KEL_THUZAD_WORLD_TRIGGERS_ADDS"))`,
    });
  }
  if (tick === KT_TICK_DESPAWN) {
    actions.push({ kind: 'yell', textId: 12995, cite: 'boss_kelthuzad.cpp:222-230 MAX_SUMMON_TICKS -> urand SAY_AGGRO1/2/3' });
  }
  if (tick === KT_TICK_PHASE_TWO) {
    actions.push({ kind: 'clear_unattackable', cite: 'boss_kelthuzad.cpp:368-372 RemoveFlag(IMMUNE_TO_PLAYER|UNINTERACTIBLE) + SetInCombatWithZone + MoveChase' });
    actions.push({ kind: 'flavor', text: 'stops channelling and turns on the raid!', cite: 'boss_kelthuzad.cpp:231-232,364-375 StartPhase2 RemoveFlag + SetInCombatWithZone + MoveChase' });
  }
  const next = KT_BOUNDARY_TICKS[i + 1];
  return {
    id: `tick${tick}`,
    phase: ktPhaseFor(i),
    afterMs: (tick - (i === 0 ? 0 : KT_BOUNDARY_TICKS[i - 1])) * 1000,
    ...(next != null ? { next: `tick${next}` } : {}),
    actions,
    cite: `boss_kelthuzad.cpp:207-241 m_summonTicks == ${tick} (1 s per 29422 tick)`,
  };
});

// One wave per (add type, segment) — a plain periodic summoner at the aura's period, whose `waveCount` is
// the segment's own documented add count so it never wraps inside the phase.
const KT_SUMMON_WAVES: ScriptDevSummonWave[] = KT_TIMELINES.flatMap((tl) =>
  KT_BOUNDARY_TICKS.flatMap((tick, i) => {
    const seg = [...tl.segs].reverse().find((s) => s[0] <= tick);
    if (!seg || seg[1] === 0) return [];
    const period = seg[2];
    return [{
      id: `${tl.key}_t${tick}`,
      creatureEntry: tl.entry,
      perTick: 1,
      armDelayMs: period,
      firstTickMinMs: period,
      firstTickMaxMs: period,
      tickMinMs: period,
      tickMaxMs: period,
      firstWaveCount: seg[3],
      waveMinCount: seg[3],
      waveMaxCount: seg[3],
      gapBaseMs: 0,
      gapPerSummonFirstMs: 0,
      gapPerSummonMs: 0,
      phase: ktPhaseFor(i),
      cite: `${tl.cite}; aura ${seg[1]} every ${period / 1000}s from tick ${seg[0]} (boss_kelthuzad.cpp:61-77)`,
    }];
  }),
);

/** 55 s of spawns at one every 10 s. Cite: boss_kelthuzad.cpp:98 + :431 ResetTimer(STOP_GUARDIAN_SPAWNS, 55s). */
const KT_GUARDIAN_COUNT = 5;

export const BOSS_KELTHUZAD: ScriptDevIR = {
  name: 'boss_kelthuzad',
  boundCreatures: [NPC.KELTHUZAD],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_kelthuzad.cpp',
  spellIds: [
    29423, 29422, 28421, 28422, 28423, 28415, 28416, 28417,
    28478, 28479, 27819, 27820, 27810, 27808, 29879, 28408, 28409, 28410,
    28453, 28454, 28455, 29898, 29910,
  ],
  // Deliberately empty: all six rows of 1599001 are his phase-2 kit, the bake already has
  // them, and `phases` alone still returns a plan — so the list arms and the phases run.
  timers: [],
  timedPhases: KT_PHASE_ONE,
  oocClock: true,
  summonWaves: KT_SUMMON_WAVES,
  phases: [
    {
      // Above every ramp phase so a boundary crossing cannot re-enter it; nothing is gated
      // on it staying set, because its entire payload fires here once.
      phase: 30,
      hpBelowPct: 40,
      actions: [
        { kind: 'yell', textId: 12998, cite: 'boss_kelthuzad.cpp:443 DoScriptText(SAY_REQUEST_AID)' },
        { kind: 'yell', textId: 12994, cite: 'boss_kelthuzad.cpp:424-425 SAY_ANSWER_REQUEST on NPC_THE_LICHKING 16980' },
        { kind: 'cast_self', spellId: 28453, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_kelthuzad.cpp:420 CastSpell(SPELL_SUMMON_PERIODIC_D, TRIGGERED_OLD_TRIGGERED)' },
        { kind: 'cast_self', spellId: 29898, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_kelthuzad.cpp:422 CastSpell(SPELL_GUARDIAN_INIT, TRIGGERED_OLD_TRIGGERED)' },
        { kind: 'summon_count', creatureEntry: NPC.GUARDIAN, count: KT_GUARDIAN_COUNT, cite: 'boss_kelthuzad.cpp:98,420,431 28453 summons one Guardian every 10s, stopped after 55s' },
        ...GO_KELTHUZAD_WINDOW.map((goEntry, n): ScriptDevAction => ({
          kind: 'open_door', goEntry, cite: `boss_kelthuzad.cpp:${427 + n} DoUseDoorOrButton(GO_KELTHUZAD_WINDOW_${n + 1}); naxxramas.h:${157 + n}`,
        })),
      ],
      cite: 'boss_kelthuzad.cpp:163,438-446 AddTimerlessCombatAction(KELTHUZAD_PHASE_GUARDIANS) GetHealthPercent() < 40.0f',
    },
  ],
  lifecycle: {
    onReset: [
      { kind: 'set_unattackable', cite: 'boss_kelthuzad.cpp:181-182 UNIT_FLAG_IMMUNE_TO_PLAYER|UNINTERACTIBLE + SetMeleeEnabled(false)' },
      { kind: 'set_melee_enabled', enabled: false, cite: 'boss_kelthuzad.cpp:182 SetMeleeEnabled(false)' },
    ],
    onAggro: [
      { kind: 'set_instance_data', field: TYPE.KELTHUZAD, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_kelthuzad.cpp:158 SetDataType(TYPE_KELTHUZAD); BossAI.cpp:75' },
      { kind: 'yell', textId: 12999, cite: 'boss_kelthuzad.cpp:203-206 SpellHit(SPELL_CHANNEL_VISUAL) -> SAY_SUMMON_MINIONS' },
    ],
    onDeath: [
      { kind: 'set_instance_data', field: TYPE.KELTHUZAD, value: INSTANCE_DATA.DONE, cite: 'boss_kelthuzad.cpp:158 SetDataType(TYPE_KELTHUZAD); BossAI.cpp:49' },
      { kind: 'yell', textId: 13019, cite: 'boss_kelthuzad.cpp:160 AddOnDeathText(SAY_DEATH)' },
    ],
    onEvade: [
      { kind: 'set_instance_data', field: TYPE.KELTHUZAD, value: INSTANCE_DATA.FAIL, cite: 'boss_kelthuzad.cpp:158 SetDataType(TYPE_KELTHUZAD); BossAI.cpp:59,94' },
    ],
  },
  cites: [
    'boss_kelthuzad.cpp:30-654 whole file',
    'creature_spell_list_entry 1599001 "Naxxramas - KelThuzad" - 6 rows kept on the bake',
    'boss_kelthuzad.cpp:79-80 MAX_SUMMON_TICKS 310 / MAX_CHANNEL_TICKS 325 (1 tick = 1 s)',
    'boss_kelthuzad.cpp:159,411-414 AddOnKillText + OnSpellCast chain/frost-blast/mana lines - no per-cast yell hook',
  ],
};

// npc_icecrown_guardian — registered by boss_kelthuzad.cpp:644-647
export const NPC_ICECROWN_GUARDIAN: ScriptDevIR = {
  name: 'npc_icecrown_guardian',
  boundCreatures: [NPC.GUARDIAN],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_kelthuzad.cpp',
  spellIds: [29897, 29899, 28470],
  timers: [
    t('guardian_passive', 29897, 0, 0, 0, 0, 'self', 'boss_kelthuzad.cpp:480 Reset DoCastSpellIfCan(SPELL_GUARDIAN_PASSIVE, CAST_AURA_NOT_PRESENT)', { onReset: true }),
    // Blood Tap is a stack per NEW tank, not a timer: the 2 s poll compares the current victim with
    // the one stored at the last poll and only casts when it moved.
    t('guardian_blood_tap_poll', 28470, 2000, 2000, 2000, 2000, 'self', 'boss_kelthuzad.cpp:501-521 m_checkCurrentVictimTimer 2 s, m_victimGuid != GetVictim() -> SPELL_BLOOD_TAP', {
      pollOnly: true,
      actions: [{
        kind: 'cast_on_victim_change',
        spellId: 28470,
        cite: 'boss_kelthuzad.cpp:512-517 DoCastSpellIfCan(m_creature->GetVictim(), SPELL_BLOOD_TAP)',
      }],
    }),
  ],
  lifecycle: {
    onKill: [{
      kind: 'cast_on_victim_change',
      spellId: 28470,
      cite: 'boss_kelthuzad.cpp:495-498 KilledUnit -> DoCastSpellIfCan(GetVictim(), SPELL_BLOOD_TAP)',
    }],
  },
  cites: [
    'boss_kelthuzad.cpp:463-524 npc_icecrown_guardianAI; :645 newScript->Name = "npc_icecrown_guardian"',
    'boss_kelthuzad.cpp:495-523 Blood Tap 28470 on kill and on every victim change, via cast_on_victim_change',
    'creature_template 16441 Guardian of Icecrown IS in src/data/tables/creatures.json - the unusedBindings row that said otherwise was wrong and is deleted',
    'boss_kelthuzad.cpp:483-493 JustReachedHome ForcedDespawn / EnterEvadeMode aura strip - no home-reached hook',
  ],
};

export const NAXXRAMAS_FROSTWYRM_IRS: readonly ScriptDevIR[] = [
  BOSS_SAPPHIRON, GO_SAPPHIRON_BIRTH, BOSS_KELTHUZAD, NPC_ICECROWN_GUARDIAN,
];
