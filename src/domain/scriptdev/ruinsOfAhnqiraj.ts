// Ruins of Ahn'Qiraj — ScriptDevAI IR for five encounters plus Andorov/Kaldorei stubs.
// Rajaxx army waves are EncounterDef waves + floor gauntlet (ruins-of-ahnqiraj.ts).

import { CAST_FLAG } from '../creature/creatureAi.ts';
import type { ScriptDevIR, ScriptDevTimer } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// ruins_of_ahnqiraj.h:10-18
const TYPE = { KURINNAXX: 0, RAJAXX: 1, MOAM: 2, BURU: 3, AYAMISS: 4, OSSIRIAN: 5 } as const;
const NPC = {
  KURINNAXX: 15348, RAJAXX: 15341, MOAM: 15340, BURU: 15370, AYAMISS: 15369, OSSIRIAN: 15339,
} as const;

/** ruins_of_ahnqiraj.h:40 GO_OSSIRIAN_CRYSTAL. */
export const GO_OSSIRIAN_CRYSTAL = 180619;
/** ruins_of_ahnqiraj.h:41 NPC_OSSIRIAN_TRIGGER. */
export const NPC_OSSIRIAN_TRIGGER = 15590;
export const NPC_OSSIRIAN = NPC.OSSIRIAN;
export const SPELL_OSSIRIAN_SUPREME = 25176;
/** Cite: boss_ossirian.cpp:72 aWeaknessSpell. */
export const OSSIRIAN_WEAKNESS_SPELLS = [25177, 25178, 25180, 25181, 25183] as const;
export const OSSIRIAN_CRYSTAL_FLAG = 'aq20-ossirian-crystal';

const t = (
  id: string, spellId: number, iMin: number, iMax: number, rMin: number, rMax: number,
  target: ScriptDevTimer['target'], cite: string, extra: Partial<ScriptDevTimer> = {},
): ScriptDevTimer => ({
  id, spellId, initialMinMs: iMin, initialMaxMs: iMax, repeatMinMs: rMin, repeatMaxMs: rMax,
  target, cite, ...extra,
});

const lifecycleFor = (field: number, file: string) => ({
  onAggro: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.IN_PROGRESS, cite: `${file} Aggro SetData(IN_PROGRESS)` }],
  onDeath: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.DONE, cite: `${file} JustDied SetData(DONE)` }],
  onEvade: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.FAIL, cite: `${file} JustReachedHome SetData(FAIL)` }],
});

export const BOSS_KURINNAXX: ScriptDevIR = {
  name: 'boss_kurinnaxx',
  boundCreatures: [NPC.KURINNAXX],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/boss_kurinnaxx.cpp',
  spellIds: [25646, 26524, 3391, 25814, 26527],
  timers: [
    // Mortal Wound is the reason he needs a real tank — a stacking healing debuff.
    t('mortal_wound', 25646, 8000, 10_000, 8000, 10_000, 'victim', 'boss_kurinnaxx.cpp MORTAL_WOUND 8-10s, re-arm 8-10s'),
    t('sand_trap', 26524, 5000, 10_000, 10_000, 15_000, 'victim', 'boss_kurinnaxx.cpp SANDTRAP 5-10s then 10-15s'),
    t('thrash', 3391, 1000, 5000, 1000, 5000, 'self', 'boss_kurinnaxx.cpp THRASH 1-5s'),
    t('wide_slash', 25814, 10_000, 15_000, 12_000, 15_000, 'victim', 'boss_kurinnaxx.cpp WIDE_SLASH 10-15s then 12-15s'),
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 30,
      actions: [
        { kind: 'cast_self', spellId: 26527, cite: 'boss_kurinnaxx.cpp KURINNAXX_ENRAGE GetHealthPercent() <= 30.0f' },
        { kind: 'flavor', text: 'enrages.', cite: 'boss_kurinnaxx.cpp timerless enrage at 30 %' },
      ],
      cite: 'boss_kurinnaxx.cpp AddTimerlessCombatAction(KURINNAXX_ENRAGE) at <=30 % HP',
    },
  ],
  lifecycle: lifecycleFor(TYPE.KURINNAXX, 'boss_kurinnaxx.cpp'),
  cites: ['boss_kurinnaxx.cpp:25-160 whole file'],
};

export const BOSS_MOAM: ScriptDevIR = {
  name: 'boss_moam',
  boundCreatures: [NPC.MOAM],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/boss_moam.cpp',
  // 25681/25682/25683 are the fan-out 25684's spell script casts, and combat resolves a triggered payload
  // off the kit, so all four have to be in it. Cite: boss_moam.cpp:176-183 SummonManaFiendsMoam.
  spellIds: [15550, 18941, 25676, 25672, 25684, 25685, 25681, 25682, 25683],
  timers: [
    t('arcane_eruption', 25672, 0, 0, 5000, 5000, 'self', 'boss_moam.cpp ARCANE_ERUPTION armed at 0, 5s floor "to prevent AI spam"'),
    t('trample', 15550, 9000, 9000, 15_000, 15_000, 'victim', 'boss_moam.cpp TRAMPLE 9s then 15s'),
    t('double_attack', 18941, 8000, 12_000, 8000, 12_000, 'self', 'boss_moam.cpp DOUBLE_ATTACK 8-12s'),
    // Drain Mana every 6 s is what fills him; without it the eruption is unmotivated.
    t('drain_mana', 25676, 6000, 6000, 6000, 6000, 'self', 'boss_moam.cpp MANA_DRAIN 6s flat'),
    t('summon_manafiends', 25684, 90_000, 90_000, 90_000, 90_000, 'self', 'boss_moam.cpp MANA_FIENDS 90s flat'),
    t('energize', 25685, 90_000, 90_000, 180_000, 180_000, 'self', 'boss_moam.cpp ENERGIZE 90s then 180s'),
  ],
  lifecycle: lifecycleFor(TYPE.MOAM, 'boss_moam.cpp'),
  cites: ['boss_moam.cpp:25-200 whole file'],
};

/** DoAttackNewTarget threat. Cite: boss_buru.cpp:135 AddThreat(target, 1000000.f). */
const BURU_CHASE_THREAT = 1_000_000;

const buruChaseFocus = (cite: string) =>
  ({ kind: 'chase_focus' as const, threat: BURU_CHASE_THREAT, cite });

export const BOSS_BURU: ScriptDevIR = {
  name: 'boss_buru',
  boundCreatures: [NPC.BURU],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/boss_buru.cpp',
  spellIds: [96, 20512, 1834, 1557, 25640, 7155],
  timers: [
    t('thorns', 25640, 0, 0, 0, 0, 'self', 'boss_buru.cpp Reset DoCastSpellIfCan(SPELL_THORNS)', { onReset: true }),
    t('dismember', 96, 5000, 5000, 5000, 5000, 'victim', 'boss_buru.cpp DISMEMBER 5s flat'),
    // Gathering Speed stacks every 9 s and Full Speed lands at 60 s — the chase pressure.
    t('gathering_speed', 1834, 9000, 9000, 9000, 9000, 'self', 'boss_buru.cpp GATHERING_SPEED 9s flat'),
    t('full_speed', 1557, 60_000, 60_000, 60_000, 60_000, 'self', 'boss_buru.cpp FULL_SPEED 60s flat'),
    // BURU_NEW_TARGET: strip speed then DoAttackNewTarget. The C++ arms it timerlessly via
    // ScheduleNewTarget, so phase 99 means never auto-armed. Cite: boss_buru.cpp:191-199, :113-117.
    t('new_target', 7155, 0, 0, 0, 0, 'self', 'boss_buru.cpp:191-199 BURU_NEW_TARGET; :113-117 SpellHitTarget → DoAttackNewTarget', {
      phase: 99,
      actions: [
        { kind: 'remove_auras', spellId: 1557, cite: 'boss_buru.cpp:193 RemoveAurasDueToSpell(SPELL_FULL_SPEED)' },
        { kind: 'remove_auras', spellId: 1834, cite: 'boss_buru.cpp:194 RemoveAurasDueToSpell(SPELL_GATHERING_SPEED)' },
        buruChaseFocus('boss_buru.cpp:113-117 SpellHitTarget 7155 → DoAttackNewTarget; :135 AddThreat 1000000.f'),
      ],
    }),
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 20,
      actions: [
        { kind: 'cast_self', spellId: 20512, cite: 'boss_buru.cpp BURU_PHASE_2_TRANSITION <20 % arms CREEPING_PLAGUE' },
        { kind: 'reset_threat', cite: 'boss_buru.cpp:182' },
        { kind: 'flavor', text: 'transforms and the plague spreads.', cite: 'boss_buru.cpp SPELL_BURU_TRANSFORM 24721 at <20 %' },
      ],
      cite: 'boss_buru.cpp GetHealthPercent() < 20.0f transform + Creeping Plague',
    },
  ],
  lifecycle: {
    onAggro: [
      { kind: 'set_instance_data', field: TYPE.BURU, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_buru.cpp Aggro SetData(IN_PROGRESS)' },
      buruChaseFocus('boss_buru.cpp:100-104 Aggro → DoAttackNewTarget; :135 AddThreat 1000000.f'),
      // EMOTE_TARGET -1509002 absent from eventai-texts bake.
      { kind: 'flavor', text: 'sets its eyes on a new target!', cite: 'boss_buru.cpp:32,101,137 EMOTE_TARGET -1509002' },
    ],
    // KilledUnit re-arms the chase: he does not stand on a corpse, he picks a new body at once.
    onKill: [buruChaseFocus('boss_buru.cpp:106-111 KilledUnit victim == GetVictim() -> ScheduleNewTarget; :119-122 SetActionReadyStatus(BURU_NEW_TARGET)')],
    onDeath: [{ kind: 'set_instance_data', field: TYPE.BURU, value: INSTANCE_DATA.DONE, cite: 'boss_buru.cpp JustDied SetData(DONE)' }],
    onEvade: [{ kind: 'set_instance_data', field: TYPE.BURU, value: INSTANCE_DATA.FAIL, cite: 'boss_buru.cpp JustReachedHome SetData(FAIL)' }],
  },
  cites: [
    'boss_buru.cpp:25-260 whole file',
    'boss_buru.cpp:106-111,119-122,125-138 DoAttackNewTarget via chase_focus, armed from Aggro, from the egg explosion and from KilledUnit',
  ],
};

export const BOSS_AYAMISS: ScriptDevIR = {
  name: 'boss_ayamiss',
  boundCreatures: [NPC.AYAMISS],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/boss_ayamiss.cpp',
  spellIds: [25749, 25748, 25708, 25725, 25852, 8269, 3391],
  timers: [
    // Paralyze prefers a NON-tank target (SelectAttackingTarget(RANDOM, 1, …)) and only
    // falls back to the whole list — skipping the top of threat is the point.
    t('paralyze', 25725, 15_000, 15_000, 15_000, 15_000, 'hostile_random_not_top_player', 'boss_ayamiss.cpp:102,245-259 PARALYZE 15s, RANDOM skipTop=1 then fallback', { select: { playerOnly: true, skipTopThreat: true } }),
    t('stinger_spray', 25749, 20_000, 30_000, 15_000, 20_000, 'self', 'boss_ayamiss.cpp:103,262-266 STINGER_SPRAY 20-30s then 15-20s'),
    // Phase 0 = air from pull (AYAMISS_FLY_UP). Stinger re-arms 2-3s while airborne.
    t('poison_stinger', 25748, 5000, 5000, 2000, 3000, 'victim', 'boss_ayamiss.cpp:104,268-272 POISON_STINGER 5s then urand(2000,3000) while PHASE_AIR', { phase: 0 }),
    t('summon_swarmer', 25708, 5000, 5000, 5000, 5000, 'self', 'boss_ayamiss.cpp:105,276-279 SUMMON_SWARMER 5s flat'),
    // Phase 1 = ground at ≤70 %. Constructed disabled (:107-108); armed on land (:228-229).
    t('lash', 25852, 5000, 8000, 8000, 15_000, 'victim', 'boss_ayamiss.cpp:107,228,295-298 LASH ResetCombatAction urand(5000,8000) then urand(8000,15000)', { phase: 1 }),
    t('thrash', 3391, 3000, 6000, 5000, 7000, 'victim', 'boss_ayamiss.cpp:108,229,301-304 THRASH ResetCombatAction urand(3000,6000) then urand(5000,7000)', { phase: 1 }),
    // Timerless HP gate — must not bump runtime phase or Lash/Thrash (phase 1) stop.
    t('frenzy', 8269, 0, 0, 0, 0, 'self', 'boss_ayamiss.cpp:101,233-242 AYAMISS_FRENZY GetHealthPercent() < 20.0f then DisableCombatAction', {
      hpPctMax: 20,
      castFlags: CAST_FLAG.AURA_NOT_PRESENT,
      actions: [{ kind: 'flavor', text: 'frenzies.', cite: 'boss_ayamiss.cpp:239 DoScriptText(EMOTE_GENERIC_FRENZY)' }],
    }),
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 70,
      actions: [
        { kind: 'reset_threat', cite: 'boss_ayamiss.cpp:222 DoResetThreat()' },
      ],
      cite: 'boss_ayamiss.cpp:100,213-229 AYAMISS_PHASE_2 GetHealthPercent() <= 70.0f → PHASE_GROUND; DisableCombatAction(POISON_STINGER); ResetCombatAction LASH/THRASH',
    },
  ],
  lifecycle: lifecycleFor(TYPE.AYAMISS, 'boss_ayamiss.cpp'),
  cites: [
    'boss_ayamiss.cpp:25-309 whole file',
    'boss_ayamiss.cpp:99 AYAMISS_FLY_UP on pull (air); :215 lands at <=70% — altitude/MovePoint leftover',
  ],
};

export const BOSS_OSSIRIAN: ScriptDevIR = {
  name: 'boss_ossirian',
  boundCreatures: [NPC.OSSIRIAN],
  boundGos: [GO_OSSIRIAN_CRYSTAL],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/boss_ossirian.cpp',
  // Double Attack 19818 pays through 18941; a trigger payload resolves off the kit.
  spellIds: [25195, 25189, 25188, 25176, 19818, 25192, 25177, 25178, 25180, 25181, 25183, 18941],
  timers: [
    t('double_attack', 19818, 0, 0, 0, 0, 'self', 'boss_ossirian.cpp Reset DOUBLE_ATTACK TRIGGERED|AURA_NOT_PRESENT', { onReset: true }),
    t('supreme', 25176, 45_000, 45_000, 45_000, 45_000, 'self', 'boss_ossirian.cpp:111,269-279 SUPREME Reset + 45s CAST_AURA_NOT_PRESENT', {
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
    }),
    t('cyclone', 25189, 20_000, 20_000, 20_000, 20_000, 'victim', 'boss_ossirian.cpp CYCLONE 20s flat'),
    t('stomp', 25188, 30_000, 30_000, 30_000, 30_000, 'self', 'boss_ossirian.cpp STOMP 30s flat'),
    t('curse_of_tongues', 25195, 30_000, 30_000, 20_000, 30_000, 'self', 'boss_ossirian.cpp CURSE_OF_TONGUES 30s then 20-30s'),
  ],
  goUse: {
    goEntries: [GO_OSSIRIAN_CRYSTAL],
    actions: [
      {
        kind: 'flavor',
        text: 'The crystal flares - Ossirian weakens!',
        cite: 'boss_ossirian.cpp:312-318 GOUse_go_ossirian_crystal urand weakness then SpellHit strips SUPREME',
      },
    ],
    cite: 'boss_ossirian.cpp:312-318 GO 180619; live fight strips 25176 in combatSession',
  },
  lifecycle: lifecycleFor(TYPE.OSSIRIAN, 'boss_ossirian.cpp'),
  cites: [
    'boss_ossirian.cpp:25-300 whole file',
    'boss_ossirian.cpp:221-239,312-318 GO 180619 click → random weakness 25177-25183 + RemoveAurasDueToSpell(25176)',
    'dungeonSpawns map 509 NPC 15590 x11 crystal sites (trigger CastSpell 25192)',
  ],
};

export const NPC_HIVE_ZARA_LARVA: ScriptDevIR = {
  name: 'npc_hive_zara_larva',
  boundCreatures: [15555],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/boss_ayamiss.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'boss_ayamiss.cpp npc_hive_zara_larva — larva feed/paralyze path; no combat timer of its own',
  ],
};

// The egg IS the kill path: 19593 is a 25 yd pbaoe whose payload the script computes, and the 15 %
// of Buru's own max health it pays is the only damage that scales with the raid popping eggs.
export const NPC_BURU_EGG: ScriptDevIR = {
  name: 'npc_buru_egg',
  boundCreatures: [15514],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/boss_buru.cpp',
  spellIds: [19593, 5255],
  timers: [],
  lifecycle: {
    onDeath: [
      {
        kind: 'explode_proximity',
        spellId: 19593,
        payloadSpellId: 5255,
        // damage = 100 + ((25 - min(d, 25)) / 25) * 400. Cite: boss_buru.cpp:274.
        playerBase: 100,
        playerScale: 400,
        // spell 19593 radiusYd 25 (pbaoe) is the same 25 the formula clamps at.
        maxYd: 25,
        creaturePctMaxHealth: [{
          creatureEntry: NPC.BURU,
          pct: 15,
          actions: [buruChaseFocus('boss_buru.cpp:278 ScheduleNewTarget after the egg damage; :135 AddThreat 1000000.f')],
        }],
        cite: 'boss_buru.cpp:269-281 SpellHitTarget SPELL_EXPLODE 19593 -> CastCustomSpell SPELL_EXPLOSION 5255',
      },
      { kind: 'summon_count', creatureEntry: 15521, count: 1, cite: 'boss_buru.cpp:297 DoCastSpellIfCan SPELL_SUMMON_HATCHLING 1881 -> summon_count 15521 (NPC_HATCHLING)' },
    ],
  },
  cites: [
    'boss_buru.cpp npc_buru_egg — egg explode/hatch on death; no combat timer',
    'boss_buru.cpp:294-298 JustDied casts SPELL_EXPLODE then SPELL_SUMMON_HATCHLING',
    'spell_template 19593 Egg Explosion radiusYd 25 pbaoe; 5255 Explosion direct_damage physical',
  ],
};

export const GO_OSSIRIAN_CRYSTAL_SCRIPT: ScriptDevIR = {
  name: 'go_ossirian_crystal',
  boundCreatures: [],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/boss_ossirian.cpp',
  spellIds: [25192],
  timers: [],
  cites: [
    'boss_ossirian.cpp:312-318 go_ossirian_crystal pGOUse — BOSS_OSSIRIAN boundGos 180619',
  ],
};

export const NPC_GENERAL_ANDOROV: ScriptDevIR = {
  name: 'npc_general_andorov',
  boundCreatures: [15471],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/boss_rajaxx.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'boss_rajaxx.cpp npc_general_andorov — Andorov escort/gossip before Rajaxx',
  ],
};

export const NPC_KALDOREI_ELITE: ScriptDevIR = {
  name: 'npc_kaldorei_elite',
  boundCreatures: [15473],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/boss_rajaxx.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'boss_rajaxx.cpp npc_kaldorei_elite — Andorov escort add; follows Andorov, no independent combat timer',
  ],
};

// Five independent urand(0,1) picks in Reset, held for the spawn's whole life — so each slot is one
// row with a two-member per-spawn pool, never a per-fire rotation.
export const MOB_ANUBISATH_GUARDIAN: ScriptDevIR = {
  name: 'mob_anubisath_guardian',
  boundCreatures: [15355],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/ruins_of_ahnqirajScripts.cpp',
  spellIds: [24340, 22997, 26546, 26554, 13022, 19595, 8599, 25698, 17430, 17431],
  timers: [
    t('guardian_spell1', 24340, 10_000, 10_000, 15_000, 15_000, 'victim', 'ruins_of_ahnqirajScripts.cpp:75,81,127-132 m_uiSpell1 METEOR 24340 / PLAGUE 22997, 10s then 15s', {
      pickPerSpawnSpellIds: [24340, 22997],
    }),
    t('guardian_spell2', 26546, 20_000, 20_000, 15_000, 15_000, 'victim', 'ruins_of_ahnqirajScripts.cpp:76,82,136-141 m_uiSpell2 SHADOW_STORM 26546 / THUNDER_CLAP 26554, 20s then 15s', {
      pickPerSpawnSpellIds: [26546, 26554],
    }),
    // Aggro reflect: 13022 Fire/Arcane or 19595 Shadow/Frost, one per spawn.
    t('guardian_reflect', 13022, 0, 0, 0, 0, 'self', 'ruins_of_ahnqirajScripts.cpp:77,88-91 Aggro DoCastSpellIfCan(m_creature, m_uiSpell3) REFLECT_ARFR 13022 / REFLECT_FSSH 19595', {
      onReset: true,
      pickPerSpawnSpellIds: [13022, 19595],
    }),
    // DamageTaken below 10 %: the enrage half is a self-cast with the frenzy emote, the explode half
    // lands on the victim. One HP-banded row carries both because the pick decides which spell it is.
    t('guardian_spell4', 8599, 1000, 1000, 0, 0, 'victim', 'ruins_of_ahnqirajScripts.cpp:78,108-117 DamageTaken <10 % ENRAGE 8599 / EXPLODE 25698', {
      hpPctMax: 9,
      oneShot: true,
      pickPerSpawnSpellIds: [8599, 25698],
      actions: [{ kind: 'flavor', text: 'goes into a frenzy!', cite: 'ruins_of_ahnqirajScripts.cpp:112 DoScriptText(EMOTE_FRENZY -1000002)' }],
    }),
    // The `m_uiSummonCount < 4` cap is a live headcount of its own summons, which the IR has no
    // predicate for; the 15 s cadence is kept and the cap is the one clause left out.
    t('guardian_summon', 17430, 10_000, 10_000, 15_000, 15_000, 'victim', 'ruins_of_ahnqirajScripts.cpp:79,83,145-153 m_uiSpell5 SWARMGUARD 17430 / WARRIOR 17431, 10s then 15s (m_uiSummonCount < 4 cap unported)', {
      pickPerSpawnSpellIds: [17430, 17431],
    }),
  ],
  lifecycle: {
    justSummoned: [{ kind: 'attack_random', cite: 'ruins_of_ahnqirajScripts.cpp:96-100 JustSummoned AttackStart(m_creature->GetVictim())' }],
  },
  cites: [
    'ruins_of_ahnqirajScripts.cpp:60-171 whole mob_anubisath_guardianAI',
    'ruins_of_ahnqirajScripts.cpp:75-79 five urand(0,1) per-spawn picks in Reset',
  ],
};

export const INSTANCE_RUINS_OF_AHNQIRAJ: ScriptDevIR = {
  name: 'instance_ruins_of_ahnqiraj',
  boundCreatures: [],
  sourceFile: 'kalimdor/ruins_of_ahnqiraj/ruins_of_ahnqiraj.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    { creatureEntry: NPC.KURINNAXX, field: TYPE.KURINNAXX, cite: 'ruins_of_ahnqiraj.h:13' },
    { creatureEntry: NPC.RAJAXX, field: TYPE.RAJAXX, cite: 'ruins_of_ahnqiraj.h:14' },
    { creatureEntry: NPC.MOAM, field: TYPE.MOAM, cite: 'ruins_of_ahnqiraj.h:15' },
    { creatureEntry: NPC.BURU, field: TYPE.BURU, cite: 'ruins_of_ahnqiraj.h:16' },
    { creatureEntry: NPC.AYAMISS, field: TYPE.AYAMISS, cite: 'ruins_of_ahnqiraj.h:17' },
    { creatureEntry: NPC.OSSIRIAN, field: TYPE.OSSIRIAN, cite: 'ruins_of_ahnqiraj.h:18' },
  ],
  cites: ['ruins_of_ahnqiraj.cpp whole file', 'ruins_of_ahnqiraj.cpp:326-373 Rajaxx army waves - GAP'],
};
