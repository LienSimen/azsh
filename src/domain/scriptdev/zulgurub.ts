// Zul'Gurub — the ScriptDevAI IR port. CMaNGOS drives this raid from creature_spell_list, so every
// timer cites a DB row and a ported boss carries ALL its phases. Jin'do and Gahz'ranka stay baked.

import type { ScriptDevDataGate, ScriptDevIR, ScriptDevTimer } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// zulgurub.h:10-20 — TYPE_OHGAN comment "Do not change, used by Acid"; do not renumber.
const TYPE = {
  JEKLIK: 0,
  VENOXIS: 1,
  MARLI: 2,
  THEKAL: 3,
  ARLOKK: 4,
  OHGAN: 5,
  LORKHAN: 6,
  ZATH: 7,
} as const;
const NPC = {
  JEKLIK: 14517,
  VENOXIS: 14507,
  MARLI: 14510,
  THEKAL: 14509,
  ARLOKK: 14515,
  MANDOKIR: 11382,
  OHGAN_RAPTOR: 14988,
  HAKKAR: 14834,
  RENATAKI: 15084,
  CHAINED_SPIRIT: 15117,
  BAT_RIDER: 14750,
  FRENZIED_BAT: 14965,
  ZULIAN_PROWLER: 15101,
  LORKHAN: 11347,
  ZATH: 11348,
} as const;

/** boss_mandokir.cpp:60 SPELL_REVIVE — the Chained Spirit's in-combat resurrect. */
const SPELL_MANDOKIR_REVIVE = 24341;

/** Cite: boss_thekal.cpp:248 TYPE_ZATH && TYPE_LORKHAN == SPECIAL. */
const bothZealotsSpecial: ScriptDevDataGate = {
  field: TYPE.ZATH,
  equals: INSTANCE_DATA.SPECIAL,
  and: {
    field: TYPE.LORKHAN,
    equals: INSTANCE_DATA.SPECIAL,
    cite: 'boss_thekal.cpp:248 TYPE_LORKHAN SPECIAL',
  },
  cite: 'boss_thekal.cpp:248 CanPreventAddsResurrect',
};

/** Cite: boss_thekal.cpp:248 negation — either add not SPECIAL. */
const eitherZealotLive: ScriptDevDataGate = {
  field: TYPE.ZATH,
  notEquals: INSTANCE_DATA.SPECIAL,
  or: {
    field: TYPE.LORKHAN,
    notEquals: INSTANCE_DATA.SPECIAL,
    cite: 'boss_thekal.cpp:248 TYPE_LORKHAN != SPECIAL',
  },
  cite: 'boss_thekal.cpp:248 !CanPreventAddsResurrect',
};

/** Cite: boss_thekal.cpp:330 Lorkhan ress unless Thekal and Zath are both SPECIAL. */
const lorkhanMayRevive: ScriptDevDataGate = {
  field: TYPE.THEKAL,
  notEquals: INSTANCE_DATA.SPECIAL,
  or: {
    field: TYPE.ZATH,
    notEquals: INSTANCE_DATA.SPECIAL,
    cite: 'boss_thekal.cpp:330 TYPE_ZATH != SPECIAL',
  },
  cite: 'boss_thekal.cpp:330 TYPE_THEKAL != SPECIAL || TYPE_ZATH != SPECIAL',
};

/** Cite: boss_thekal.cpp:381 Zath ress unless Thekal and Lorkhan are both SPECIAL. */
const zathMayRevive: ScriptDevDataGate = {
  field: TYPE.THEKAL,
  notEquals: INSTANCE_DATA.SPECIAL,
  or: {
    field: TYPE.LORKHAN,
    notEquals: INSTANCE_DATA.SPECIAL,
    cite: 'boss_thekal.cpp:381 TYPE_LORKHAN != SPECIAL',
  },
  cite: 'boss_thekal.cpp:381 TYPE_THEKAL != SPECIAL || TYPE_LORKHAN != SPECIAL',
};

// `creature_spell_list.TargetId` → IR target mode: 0 NONE, 1 CURRENT, 2 SELF, 4 dispellable
// friendly, and 100+ a creature_spell_targeting row. Cite: CreatureSpellList.h:34-43.
const row = (
  id: string, spellId: number, target: ScriptDevTimer['target'],
  iMin: number, iMax: number, rMin: number, rMax: number, cite: string,
  phase?: number, extra: Partial<ScriptDevTimer> = {},
): ScriptDevTimer => ({
  id, spellId, initialMinMs: iMin, initialMaxMs: iMax, repeatMinMs: rMin, repeatMaxMs: rMax,
  target, cite, ...(phase != null ? { phase } : {}), ...extra,
});

export const BOSS_VENOXIS: ScriptDevIR = {
  name: 'boss_venoxis',
  boundCreatures: [NPC.VENOXIS],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_venoxis.cpp',
  // Parasitic Serpent and Virulent Poison pay through 23865 / 22412, resolved off the kit.
  spellIds: [23859, 23895, 23979, 23858, 23860, 3391, 23861, 23862, 23867, 23849, 22413, 23537, 23865, 22412, 9204],
  timers: [
    // ---- PHASE 1, the troll priest: list 1450701 ----
    row('renew', 23895, 'self', 30_000, 30_000, 20_000, 30_000, 'creature_spell_list 1450701:1 Renew on Self', 0),
    row('holy_wrath', 23979, 'victim', 40_000, 40_000, 15_000, 25_000, 'creature_spell_list 1450701:2 Holy Wrath on Current', 0),
    row('holy_nova', 23858, 'self', 15_000, 20_000, 10_000, 15_000, 'creature_spell_list 1450701:3 Holy Nova on None', 0),
    row('holy_fire', 23860, 'hostile_random', 10_000, 15_000, 20_000, 30_000, 'creature_spell_list 1450701:4 Holy Fire on Random', 0),
    row('thrash_p1', 3391, 'self', 4000, 6000, 10_000, 20_000, 'creature_spell_list 1450701:5 Thrash on Current', 0),
    // ---- PHASE 2, the serpent: list 1450702 (Poison Cloud + Venomspit, no healing) ----
    row('poison_cloud_p2', 23861, 'self', 2000, 2000, 15_000, 15_000, 'creature_spell_list 1450702:0 Poison Cloud on None', 1),
    row('venomspit_p2', 23862, 'hostile_random', 5500, 5500, 15_000, 20_000, 'creature_spell_list 1450702:1 Venomspit on Random', 1),
    row('thrash_p2', 3391, 'self', 4000, 6000, 10_000, 20_000, 'creature_spell_list 1450702:5 Thrash on Current', 1),
    // ---- PHASE 3 below 25 %: list 1450703 adds Parasitic Serpent, everything ready at 0 ----
    row('poison_cloud_p3', 23861, 'self', 0, 0, 15_000, 15_000, 'creature_spell_list 1450703:0 Poison Cloud on None', 2),
    row('venomspit_p3', 23862, 'hostile_random', 0, 0, 15_000, 20_000, 'creature_spell_list 1450703:1 Venomspit on Random', 2),
    row('parasitic_serpent', 23867, 'hostile_random', 0, 0, 15_000, 20_000, 'creature_spell_list 1450703:2 Parasitic Serpent on Random', 2),
    row('thrash_p3', 3391, 'self', 0, 0, 10_000, 20_000, 'creature_spell_list 1450703:5 Thrash on Current', 2),
    // Phase-free: timerless HP gate does not SetSpellList / bump m_uiPhase (cpp:118-121).
    // AURA_NOT_PRESENT + 0 ms poll fires once, matching DisableCombatAction.
    {
      id: 'frenzy',
      spellId: 23537,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      hpPctMax: 20,
      castFlags: CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'boss_venoxis.cpp:72,118-121 AddTimerlessCombatAction(VENOXIS_FRENZY); GetHealthPercent() < 20.f → SPELL_FRENZY 23537 then DisableCombatAction',
    },
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 50,
      actions: [
        // CAST_OK extras on VENOXIS_PHASE_2 — order matches boss_venoxis.cpp:101-108.
        { kind: 'cast_self', spellId: 23849, cite: 'boss_venoxis.cpp:101 SPELL_SNAKE_FORM on VENOXIS_PHASE_2' },
        { kind: 'flavor', text: 'sheds his priesthood and takes serpent form.', cite: 'boss_venoxis.cpp:103 DoScriptText(SAY_TRANSFORM)' },
        { kind: 'cast_self', spellId: 23861, cite: 'boss_venoxis.cpp:104 SPELL_POISON_CLOUD instant cloud on change' },
        {
          kind: 'cast_self',
          spellId: 22413,
          castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
          cite: 'boss_venoxis.cpp:105 SPELL_VIRULENT_POISON_PROC CAST_TRIGGERED|CAST_AURA_NOT_PRESENT',
        },
        { kind: 'reset_threat', cite: 'boss_venoxis.cpp:106 DoResetThreat' },
      ],
      cite: 'boss_venoxis.cpp:97-108 GetHealthPercent() > 50.f gate → snake + cloud + virulent + reset → SetSpellList(PHASE_2)',
    },
    {
      phase: 2,
      hpBelowPct: 25,
      actions: [
        { kind: 'flavor', text: 'thrashes - the venom comes faster.', cite: 'boss_venoxis.cpp:111-116 VENOXIS_PHASE_3' },
      ],
      cite: 'boss_venoxis.cpp:111-116 GetHealthPercent() < 25.f → SetSpellList(PHASE_3)',
    },
  ],
  lifecycle: {
    onDeath: [{ kind: 'set_instance_data', field: TYPE.VENOXIS, value: INSTANCE_DATA.DONE, cite: 'boss_venoxis.cpp:85-90 JustDied SetData(TYPE_VENOXIS, DONE)' }],
    onEvade: [{ kind: 'set_instance_data', field: TYPE.VENOXIS, value: INSTANCE_DATA.FAIL, cite: 'boss_venoxis.cpp:77-82 JustReachedHome SetData(FAIL)' }],
  },
  cites: [
    'boss_venoxis.cpp:25-133 whole file',
    'creature_spell_list 1450701 / 1450702 / 1450703 (13 rows, 3307/mangos)',
    'boss_venoxis.cpp:49,72,118-121 SPELL_FRENZY 23537 timerless at GetHealthPercent() < 20.f (no SetSpellList)',
  ],
};

export const BOSS_JEKLIK: ScriptDevIR = {
  name: 'boss_jeklik',
  boundCreatures: [NPC.JEKLIK],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_jeklik.cpp',
  spellIds: [22911, 23919, 23918, 23974, 22644, 12097, 23952, 23953, 23954, 24085, 23966, 23968, 23973],
  timers: [
    // ---- PHASE 1, airborne: list 1451701 ----
    row('charge', 22911, 'hostile_random_player', 20_000, 20_000, 15_000, 30_000, 'creature_spell_list 1451701:0 Charge TargetId 100 Attack - random player', 0),
    // C++ SPELL_SWOOP 23919; list 1451701:1 writes 24210 which is Mark of Arlokk.
    row('swoop', 23919, 'victim', 5000, 5000, 4000, 9000, 'creature_spell_list 1451701:1 cadence, spell from boss_jeklik.cpp:42 SPELL_SWOOP 23919 (row Id 24210 is Mark of Arlokk)', 0),
    row('sonic_burst', 23918, 'victim', 8000, 8000, 8000, 13_000, 'creature_spell_list 1451701:2 Sonic Burst on Current', 0),
    row('summon_frenzied_bats', 23974, 'self', 50_000, 50_000, 60_000, 60_000, 'creature_spell_list 1451701:3 Summon Frenzied Bats on None', 0),
    row('blood_leech', 22644, 'self', 20_000, 30_000, 15_000, 30_000, 'creature_spell_list 1451701:4 Blood Leech on None', 0),
    row('pierce_armor', 12097, 'victim', 10_000, 20_000, 10_000, 20_000, 'creature_spell_list 1451701:5 Pierce Armor on Current', 0),
    // ---- PHASE 2, landed: list 1451702 — a completely different kit, including a heal ----
    row('ravage', 23952, 'victim', 6000, 6000, 12_000, 18_000, 'creature_spell_list 1451702:0 Ravage on Current', 1),
    row('mind_flay', 23953, 'victim', 11_000, 11_000, 16_000, 16_000, 'creature_spell_list 1451702:1 Mind Flay on Current', 1),
    row('greater_heal', 23954, 'self', 20_000, 20_000, 25_000, 35_000, 'creature_spell_list 1451702:2 Greater Heal on None', 1),
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 50,
      actions: [
        // cpp order: CAST_OK TRANSFORM_VISUAL → strip BAT_FORM → DoResetThreat → SetSpellList(PHASE_2)
        { kind: 'cast_self', spellId: 24085, cite: 'boss_jeklik.cpp:59 SPELL_TRANSFORM_VISUAL; :205 DoCastSpellIfCan(nullptr, SPELL_TRANSFORM_VISUAL)' },
        { kind: 'remove_auras', spellId: 23966, cite: 'boss_jeklik.cpp:58 SPELL_BAT_FORM; :207 RemoveAurasDueToSpell(SPELL_BAT_FORM)' },
        { kind: 'reset_threat', cite: 'boss_jeklik.cpp:209 DoResetThreat()' },
        { kind: 'flavor', text: 'drops out of the air and fights on the ground.', cite: 'boss_jeklik.cpp:201-213 JEKLIK_PHASE_2 GetHealthPercent() < 50.0f → SetSpellList(PHASE_2)' },
      ],
      cite: 'boss_jeklik.cpp:201-213 JEKLIK_PHASE_2 at <50 % HP',
    },
    {
      // Timerless HP summon — does not SetSpellList. phase 2 is only the once-key.
      phase: 2,
      hpBelowPct: 35,
      retainPhase: true,
      actions: [
        {
          kind: 'summon_count',
          creatureEntry: NPC.BAT_RIDER,
          count: 1,
          x: -12298.03,
          y: -1368.506,
          cite: 'boss_jeklik.cpp:220-230 positions[0] SummonCreature NPC_BAT_RIDER TEMPSPAWN_DEAD_DESPAWN',
        },
        {
          kind: 'summon_count',
          creatureEntry: NPC.BAT_RIDER,
          count: 1,
          x: -12301.69,
          y: -1371.292,
          cite: 'boss_jeklik.cpp:232-236 positions[1] SummonCreature NPC_BAT_RIDER + immediate LIQUID_FIRE',
        },
        { kind: 'yell', textId: -1309003, cite: 'boss_jeklik.cpp:45,238 SAY_RAIN_FIRE' },
      ],
      cite: 'boss_jeklik.cpp:216-240 JEKLIK_PHASE_BATS GetHealthPercent() < 35.0f DisableCombatAction',
    },
  ],
  lifecycle: {
    // Aggro: BAT_FORM. Reset only GREEN_CHANNELING 13540 (boss_jeklik.cpp:113) — not here.
    onAggro: [
      { kind: 'cast_self', spellId: 23966, cite: 'boss_jeklik.cpp:58 SPELL_BAT_FORM; :122 DoCastSpellIfCan(m_creature, SPELL_BAT_FORM)' },
    ],
    onDeath: [
      { kind: 'set_instance_data', field: TYPE.JEKLIK, value: INSTANCE_DATA.DONE, cite: 'boss_jeklik.cpp:136-137 JustDied SetData(TYPE_JEKLIK, DONE)' },
      { kind: 'despawn_guardians', entryId: NPC.BAT_RIDER, cite: 'boss_jeklik.cpp:134,185-195 JustDied DoDespawnBombRiders' },
      { kind: 'despawn_guardians', entryId: NPC.FRENZIED_BAT, cite: 'boss_jeklik.cpp:148-156 JustSummoned 14965; pull ends on TYPE_JEKLIK DONE' },
    ],
    onEvade: [
      { kind: 'set_instance_data', field: TYPE.JEKLIK, value: INSTANCE_DATA.FAIL, cite: 'boss_jeklik.cpp:144-145 JustReachedHome SetData(FAIL)' },
      { kind: 'despawn_guardians', entryId: NPC.BAT_RIDER, cite: 'boss_jeklik.cpp:142,185-195 JustReachedHome DoDespawnBombRiders' },
      { kind: 'despawn_guardians', entryId: NPC.FRENZIED_BAT, cite: 'boss_jeklik.cpp:142 JustReachedHome; owned 14965 leave with the pull' },
    ],
    justSummoned: [
      {
        kind: 'cast_self',
        spellId: 23973,
        creatureEntry: NPC.FRENZIED_BAT,
        cite: 'boss_jeklik.cpp:148-152 NPC_FRENZIED_BAT CastSpell SPELL_ROOT_SELF 23973',
      },
      {
        kind: 'attack_random',
        creatureEntry: NPC.FRENZIED_BAT,
        cite: 'boss_jeklik.cpp:155-156 SelectAttackingTarget(ATTACKING_TARGET_RANDOM, 0) AttackStart',
      },
      {
        kind: 'cast_self',
        spellId: 23968,
        creatureEntry: NPC.BAT_RIDER,
        cite: 'boss_jeklik.cpp:154-157,234 NPC_BAT_RIDER SPELL_LIQUID_FIRE 23968 (first rider 15s delay is MovePath residual)',
      },
    ],
  },
  cites: [
    'boss_jeklik.cpp:25-330 whole file',
    'creature_spell_list 1451701 / 1451702 (9 rows, 3307/mangos)',
    'boss_jeklik.cpp:216-240 JEKLIK_PHASE_BATS <35% SummonCreature 14750 x2 + SAY_RAIN_FIRE',
  ],
};

// Soulflayer — 9 floor spawns whose template lists four spells with no spellList, EventAI or IR, so
// it cast nothing at all. Both random slots are JustRespawned picks, held for the spawn's whole life.
export const NPC_SOULFLAYER: ScriptDevIR = {
  name: 'npc_soulflayer',
  boundCreatures: [11359],
  sourceFile: 'eastern_kingdoms/zulgurub/zulgurubScripts.cpp',
  spellIds: [24619, 20543, 22678, 20276, 8269, 28371, 8876],
  timers: [
    // Reset(): m_uiSoulTapTimer = urand(m_uiRandomCcAbilityTimer, 7000), and the CC timer
    // is itself urand(2000, 5000) — so the earliest possible arm is 2 s.
    row('soul_tap', 24619, 'hostile_random', 2000, 7000, 10_000, 15_000, 'zulgurubScripts.cpp:74,90-95 SOUL_TAP urand(ccTimer,7000) then urand(10000,15000), ATTACKING_TARGET_RANDOM ANY_ENEMY'),
    row('lightning_breath', 20543, 'victim', 2000, 9000, 10_000, 15_000, 'zulgurubScripts.cpp:75,99-103 LIGHTNING_BREATH urand(soulTapTimer,9000) then urand(10000,15000), GetVictim'),
    row('random_cc', 22678, 'victim', 2000, 5000, 8000, 10_000, 'zulgurubScripts.cpp:61,112-115 spell_list_cc[urand(0,1)] FEAR 22678 / KNOCKDOWN 20276, urand(2000,5000) then urand(8000,10000)', undefined, {
      pickPerSpawnSpellIds: [22678, 20276],
    }),
    // Two of the three buff picks are a <=30 % HP one-shot; the third (Thrash 8876) is a passive the
    // C++ casts on spawn instead, which is a DIFFERENT slot shape, so it gets its own row below.
    row('random_buff', 8269, 'victim', 1000, 1000, 0, 0, 'zulgurubScripts.cpp:64,122-125 spell_list_buff ENRAGE 8269 / FRENZY 28371 at <=30 % HP, HasAura guard', undefined, {
      hpPctMax: 30,
      oneShot: true,
      castFlags: CAST_FLAG.AURA_NOT_PRESENT,
      pickPerSpawnSpellIds: [8269, 28371],
    }),
    row('thrash_on_spawn', 8876, 'self', 0, 0, 0, 0, 'zulgurubScripts.cpp:66-68,77-78 the THRASH 8876 third of spell_list_buff is cast on spawn, CAST_TRIGGERED | CAST_AURA_NOT_PRESENT', undefined, {
      onReset: true,
    }),
  ],
  cites: [
    'zulgurubScripts.cpp:31-131 whole npc_soulflayer',
    'zulgurubScripts.cpp:55-68 JustRespawned makes both random picks ONCE per spawn',
    'zulgurubScripts.cpp:64 spell_list_buff is a THREE-member pool; the port splits it because Thrash is a spawn passive and the other two are an HP one-shot, so each spawn here can wear both where the C++ wears one',
  ],
};

// Arlokk — the one ZG boss whose phases are a CLOCK: 30 s troll, then 120 s panther, forever. She
// is summoned by the Gong of Bethekk, not spawned, so her encounter sits at the summon point.
export const BOSS_ARLOKK: ScriptDevIR = {
  name: 'boss_arlokk',
  boundCreatures: [NPC.ARLOKK],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_arlokk.cpp',
  // Mark of Arlokk and Whirlwind pay through 24211 / 15589, resolved off the kit.
  spellIds: [24212, 24210, 12540, 24213, 3391, 24236, 24223, 24190, 24085, 24228, 24235, 20538, 24211, 15589],
  timers: [
    // ---- PHASE 0, the troll priestess: list 1451501 ----
    row('shadow_word_pain', 24212, 'hostile_random', 8000, 8000, 15_000, 15_000, 'creature_spell_list 1451501:0 Shadow Word Pain on Random', 0),
    {
      ...row('mark_of_arlokk', 24210, 'hostile_random', 5000, 5000, 30_000, 30_000, 'creature_spell_list 1451501:1 Mark of Arlokk on Random', 0),
      actions: [{
        kind: 'yell',
        textId: -1309012,
        cite: 'boss_arlokk.cpp:204-209 OnSpellCast SPELL_MARK_ARLOKK 24210 DoScriptText(SAY_FEAST_PANTHER, target)',
      }],
    },
    row('gouge', 12540, 'victim', 14_000, 14_000, 17_000, 27_000, 'creature_spell_list 1451501:2 Gouge on Current', 0),
    // ---- PHASE 1, the panther: list 1451502 ----
    // Thrash 3391 is a self-cast extra-attack buff, so it takes 'self' despite the row's Comments.
    row('ravage', 24213, 'victim', 12_000, 12_000, 10_000, 15_000, 'creature_spell_list 1451502:0 Ravage on Current', 1),
    row('thrash_panther', 3391, 'self', 20_000, 20_000, 13_000, 15_000, 'creature_spell_list 1451502:1 Thrash on Current', 1),
    row('whirlwind', 24236, 'self', 15_000, 15_000, 17_000, 27_000, 'creature_spell_list 1451502:2 Whirlwind on None', 1),
    {
      ...row('vanish', 24223, 'self', 5000, 10_000, 85_000, 85_000, 'creature_spell_list 1451502:3 Vanish on None', 1),
      actions: [
        { kind: 'cast_self', spellId: 24228, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_arlokk.cpp:277 ArlokkVanish SPELL_VANISH_TELEPORT 24228 TRIGGERED' },
        { kind: 'cast_self', spellId: 24235, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_arlokk.cpp:278 ArlokkVanish SPELL_SUPER_INVIS 24235 TRIGGERED' },
        { kind: 'reset_threat', cite: 'boss_arlokk.cpp:166 ReceiveAIEvent CUSTOM_A DoResetThreat' },
        { kind: 'set_combat_movement', enabled: false, cite: 'boss_arlokk.cpp:167-168 SetCombatScriptStatus(true) SetMeleeEnabled(false); :86 SetCombatMovement(false)' },
        { kind: 'arm_timer', timerId: 'invis_select', delayMs: 10_000, cite: 'boss_arlokk.cpp:169 ResetTimer(ARLOKK_INVIS_SELECT, 10000)' },
        { kind: 'arm_timer', timerId: 'invis_reappear', delayMs: 50_000, cite: 'boss_arlokk.cpp:170 ResetTimer(ARLOKK_INVIS_TIMER, 50000)' },
      ],
    },
    {
      id: 'invis_select',
      spellId: 20538,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      phase: 1,
      startDisabled: true,
      oneShot: true,
      cite: 'boss_arlokk.cpp:77-83 ARLOKK_INVIS_SELECT AttackStart random player; 20538 is HATE_TO_ZERO dummy (already the panther reset_threat stand-in)',
      actions: [{
        kind: 'chase_focus',
        threat: 1_000_000,
        cite: 'boss_arlokk.cpp:80-83 SelectAttackingTarget RANDOM PLAYER AttackStart; SetCombatMovement(false)',
      }],
    },
    {
      id: 'invis_reappear',
      spellId: 24235,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      phase: 1,
      startDisabled: true,
      oneShot: true,
      cite: 'boss_arlokk.cpp:84-90 ARLOKK_INVIS_TIMER RemoveAurasDueToSpell(SPELL_SUPER_INVIS) resume combat',
      actions: [
        { kind: 'remove_auras', spellId: 24235, cite: 'boss_arlokk.cpp:86 RemoveAurasDueToSpell(SPELL_SUPER_INVIS 24235)' },
        { kind: 'set_combat_movement', enabled: true, cite: 'boss_arlokk.cpp:87-89 SetCombatScriptStatus(false) SetCombatMovement(true) SetMeleeEnabled(true)' },
      ],
    },
  ],
  timedPhases: [
    {
      id: 'panther',
      phase: 1,
      afterMs: 30_000,
      next: 'troll',
      actions: [
        { kind: 'cast_self', spellId: 24190, cite: 'boss_arlokk.cpp:193 DoCastSpellIfCan(nullptr, SPELL_PANTHER_TRANSFORM)' },
        { kind: 'reset_threat', cite: 'boss_arlokk.cpp:195 CastSpell(SPELL_HATE_TO_ZERO 20538) - dummy, effects=[] in bake; DoResetThreat class' },
        { kind: 'flavor', text: 'drops to all fours as a panther.', cite: 'boss_arlokk.cpp:191-200 troll->panther branch' },
      ],
      cite: 'boss_arlokk.cpp:76 AddCombatAction(ARLOKK_PHASE_TRANSITION, 30000); :196 ResetCombatAction(action, 120000)',
    },
    {
      id: 'troll',
      phase: 0,
      afterMs: 120_000,
      next: 'panther',
      actions: [
        { kind: 'cast_self', spellId: 24085, cite: 'boss_arlokk.cpp:183 DoCastSpellIfCan(nullptr, SPELL_TRANSFORM_VISUAL)' },
        { kind: 'remove_auras', spellId: 24190, cite: 'boss_arlokk.cpp:185 RemoveAurasDueToSpell(SPELL_PANTHER_TRANSFORM)' },
        { kind: 'flavor', text: 'stands up, a troll again.', cite: 'boss_arlokk.cpp:180-190 panther->troll branch' },
      ],
      cite: 'boss_arlokk.cpp:186 ResetCombatAction(action, 30000) - the troll half of the ring',
    },
  ],
  lifecycle: {
    onAggro: [
      { kind: 'yell', textId: -1309011, cite: 'boss_arlokk.cpp:114 DoScriptText(SAY_AGGRO)' },
    ],
    onDeath: [
      { kind: 'yell', textId: -1309013, cite: 'boss_arlokk.cpp:140 DoScriptText(SAY_DEATH)' },
      { kind: 'set_instance_data', field: TYPE.ARLOKK, value: INSTANCE_DATA.DONE, cite: 'boss_arlokk.cpp:148 SetData(TYPE_ARLOKK, DONE)' },
    ],
    onEvade: [
      { kind: 'set_instance_data', field: TYPE.ARLOKK, value: INSTANCE_DATA.FAIL, cite: 'boss_arlokk.cpp:127 JustReachedHome SetData(TYPE_ARLOKK, FAIL)' },
    ],
  },
  // 24247 durationIndex 21 = until cancelled (RemoveAuras on death/evade :152-162).
  // Two waves because host.ts:663-668 disarms a wave when the clock leaves its phase.
  summonWaves: [
    {
      id: 'prowlers_troll',
      creatureEntry: NPC.ZULIAN_PROWLER,
      perTick: 2,
      armDelayMs: 0,
      firstTickMinMs: 5000,
      firstTickMaxMs: 5000,
      tickMinMs: 5000,
      tickMaxMs: 5000,
      firstWaveCount: 200,
      waveMinCount: 0,
      waveMaxCount: 0,
      gapBaseMs: 3_600_000,
      gapPerSummonFirstMs: 0,
      gapPerSummonMs: 0,
      phase: 0,
      cite: 'boss_arlokk.cpp:116-122 two triggers 24247; spell-data 24247 tickMs 5000 trigger 24246 miscValue 15101',
    },
    {
      id: 'prowlers_panther',
      creatureEntry: NPC.ZULIAN_PROWLER,
      perTick: 2,
      armDelayMs: 0,
      firstTickMinMs: 5000,
      firstTickMaxMs: 5000,
      tickMinMs: 5000,
      tickMaxMs: 5000,
      firstWaveCount: 200,
      waveMinCount: 0,
      waveMaxCount: 0,
      gapBaseMs: 3_600_000,
      gapPerSummonFirstMs: 0,
      gapPerSummonMs: 0,
      phase: 1,
      cite: 'boss_arlokk.cpp:116-122 aura is not phase-gated; host disarms waves on phase leave',
    },
  ],
  cites: [
    'boss_arlokk.cpp:36-210 whole boss_arlokkAI',
    'creature_spell_list 1451501 (3 rows) / 1451502 (4 rows), classic-db z2815',
    'boss_arlokk.cpp:195 SPELL_HATE_TO_ZERO 20538 rides the panther transform - reset_threat (20538 dummy, bake effects=[])',
    'boss_arlokk.cpp:273-287 ArlokkVanish spell script (self-send CUSTOM_A) + :164-174 ReceiveAIEvent 10s re-select / 50s reappear',
    'boss_arlokk.cpp:112-123,152-162 two panther triggers 24247 → NPC 15101 every 5s',
    'boss_arlokk.cpp:204-209 OnSpellCast SPELL_MARK_ARLOKK 24210 SAY_FEAST_PANTHER -1309012',
  ],
};

// Thekal — a fake death via SetDeathPrevention, then the tiger PHASE_2 list swap. The ress is 10 s,
// or 1 s when both zealots are SPECIAL. Cite: boss_thekal.cpp:266-296; lists 1450901/1450902.
export const BOSS_THEKAL: ScriptDevIR = {
  name: 'boss_thekal',
  boundCreatures: [NPC.THEKAL],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_thekal.cpp',
  spellIds: [22859, 24185, 22666, 24408, 23128, 24189, 24192, 24183, 24169, 8269, 24173, 24171, 19951],
  timers: [
    // ---- PHASE 0 troll priest: list 1450901 ----
    row('mortal_cleave', 22859, 'victim', 4000, 4000, 15_000, 20_000, 'creature_spell_list 1450901:0 Mortal Cleave on Current', 0),
    // TargetId 6 = FRIENDLY_MISSING_BUFF_NO_SELF — self when solo (azshara Siren pattern).
    row('bloodlust', 24185, 'self', 10_000, 15_000, 20_000, 30_000, 'creature_spell_list 1450901:1 Bloodlust on Friendly Missing Buff no self', 0),
    row('silence', 22666, 'hostile_random', 9000, 9000, 20_000, 25_000, 'creature_spell_list 1450901:2 Silence on Random Casting (TargetId 102)', 0),
    // ---- PHASE 1 tiger: list 1450902 ----
    row('charge_tiger', 24408, 'hostile_random', 12_000, 12_000, 15_000, 22_000, 'creature_spell_list 1450902:0 Charge on Random', 1),
    row('frenzy', 23128, 'self', 30_000, 30_000, 30_000, 30_000, 'creature_spell_list 1450902:1 Frenzy on None', 1),
    row('force_punch', 24189, 'self', 4000, 4000, 16_000, 21_000, 'creature_spell_list 1450902:2 Force Punch on None', 1),
    row('speed_slash', 24192, 'self', 15_000, 20_000, 20_000, 25_000, 'creature_spell_list 1450902:3 Speed Slash on None', 1),
    row('summon_tigers', 24183, 'self', 25_000, 25_000, 50_000, 50_000, 'creature_spell_list 1450902:4 Summon Zulian Guardians on None', 1),
    // Timerless THEKAL_TIGER_ENRAGE at <11 % once (cpp:309-316).
    {
      id: 'tiger_enrage',
      spellId: 8269,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 3_600_000,
      repeatMaxMs: 3_600_000,
      target: 'self',
      phase: 1,
      hpPctMax: 11,
      cite: 'boss_thekal.cpp:309-316 THEKAL_TIGER_ENRAGE GetHealthPercent() < 11.f SPELL_ENRAGE 8269 once',
    },
    {
      id: 'thekal_ress',
      spellId: 24173,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      startDisabled: true,
      oneShot: true,
      pollOnly: true,
      cite: 'boss_thekal.cpp:171-182 ACTION_RESSURECTION then CanPreventAddsResurrect',
      actions: [
        { kind: 'cast_self', spellId: 24173, cite: 'boss_thekal.cpp:174 SPELL_RESURRECT 24173' },
        { kind: 'set_instance_data', field: TYPE.THEKAL, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_thekal.cpp:180 SetData(TYPE_THEKAL, IN_PROGRESS)' },
        {
          kind: 'disable_timer',
          timerId: 'zealot_ress',
          creatureEntry: NPC.LORKHAN,
          gate: bothZealotsSpecial,
          cite: 'boss_thekal.cpp:252-256,365-368 PreventRevive DisableTimer Lorkhan',
        },
        {
          kind: 'disable_timer',
          timerId: 'zealot_ress',
          creatureEntry: NPC.ZATH,
          gate: bothZealotsSpecial,
          cite: 'boss_thekal.cpp:257-261,413-416 PreventRevive DisableTimer Zath',
        },
        {
          kind: 'arm_timer',
          timerId: 'thekal_tiger',
          delayMs: 5000,
          gate: bothZealotsSpecial,
          cite: 'boss_thekal.cpp:286-292 OnRevive CanPreventAddsResurrect → 5s tiger',
        },
        {
          kind: 'arm_timer',
          timerId: 'thekal_troll',
          delayMs: 0,
          gate: eitherZealotLive,
          cite: 'boss_thekal.cpp:280-295 OnRevive false → Revive as troll',
        },
      ],
    },
    {
      id: 'thekal_tiger',
      spellId: 24169,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      startDisabled: true,
      oneShot: true,
      pollOnly: true,
      cite: 'boss_thekal.cpp:183-194 THEKAL_RESS_PHASE_2_DELAY tiger form',
      actions: [
        { kind: 'cast_self', spellId: 24171, cite: 'boss_thekal.cpp:290 SPELL_RESSURECTION_IMPACT_VISUAL' },
        { kind: 'cast_self', spellId: 24169, cite: 'boss_thekal.cpp:185 SPELL_TIGER_FORM 24169' },
        { kind: 'set_death_prevention', enabled: false, cite: 'boss_thekal.cpp:187 SetDeathPrevention(false)' },
        { kind: 'set_combat_movement', enabled: true, cite: 'boss_thekal.cpp:190 SetCombatMovement(true, true)' },
        { kind: 'set_phase', phase: 1, cite: 'boss_thekal.cpp:186,192 PHASE_TIGER SetSpellList(1450902)' },
        { kind: 'reset_threat', cite: 'boss_thekal.cpp:138 DoResetThreat in Revive' },
        { kind: 'flavor', text: 'rises as a tiger.', cite: 'boss_thekal.cpp:183-194 PHASE_TIGER' },
      ],
    },
    {
      id: 'thekal_troll',
      spellId: 19951,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      startDisabled: true,
      oneShot: true,
      pollOnly: true,
      cite: 'boss_thekal.cpp:125-149 Revive when CanPreventAddsResurrect is false',
      actions: [
        { kind: 'set_phase', phase: 0, cite: 'boss_thekal.cpp:136 m_uiPhase = PHASE_NORMAL' },
        { kind: 'set_death_prevention', enabled: true, cite: 'boss_thekal.cpp:146 SetDeathPrevention(true)' },
        { kind: 'set_combat_movement', enabled: true, cite: 'boss_thekal.cpp:144 SetCombatMovement(true, true)' },
        { kind: 'reset_threat', cite: 'boss_thekal.cpp:138 DoResetThreat' },
        { kind: 'flavor', text: 'stands back up.', cite: 'boss_thekal.cpp:125-149 Revive troll' },
      ],
    },
  ],
  lifecycle: {
    onReset: [
      { kind: 'set_death_prevention', enabled: true, cite: 'boss_thekal.cpp:83,91 ctor/Reset SetDeathPrevention(true)' },
    ],
    onAggro: [
      { kind: 'yell', textId: -1309009, cite: 'boss_thekal.cpp:213 DoScriptText(SAY_AGGRO)' },
    ],
    onPreventedDeath: [
      { kind: 'set_combat_movement', enabled: false, cite: 'boss_thekal.cpp:117 SetCombatMovement(false)' },
      { kind: 'set_phase', phase: 2, cite: 'boss_thekal.cpp:120 PHASE_FAKE_DEATH' },
      { kind: 'cast_self', spellId: 19951, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_thekal.cpp:115 SPELL_PACIFY_SELF 19951 CAST_TRIGGERED' },
      { kind: 'set_instance_data', field: TYPE.THEKAL, value: INSTANCE_DATA.SPECIAL, cite: 'boss_thekal.cpp:272 SetData(TYPE_THEKAL, SPECIAL)' },
      { kind: 'arm_timer', timerId: 'thekal_ress', delayMs: 10_000, cite: 'boss_thekal.cpp:268 ResetTimer(ACTION_RESSURECTION, 10000)' },
      {
        kind: 'arm_timer',
        timerId: 'thekal_ress',
        delayMs: 1000,
        gate: bothZealotsSpecial,
        cite: 'boss_thekal.cpp:275-276 CanPreventAddsResurrect → ResetTimer 1000',
      },
    ],
    onDeath: [
      { kind: 'yell', textId: -1309010, cite: 'boss_thekal.cpp:218 DoScriptText(SAY_DEATH)' },
      { kind: 'set_instance_data', field: TYPE.THEKAL, value: INSTANCE_DATA.DONE, cite: 'boss_thekal.cpp:223 SetData(TYPE_THEKAL, DONE)' },
    ],
    onEvade: [
      { kind: 'set_instance_data', field: TYPE.THEKAL, value: INSTANCE_DATA.FAIL, cite: 'boss_thekal.cpp:241 JustReachedHome SetData(FAIL)' },
    ],
  },
  cites: [
    'boss_thekal.cpp:1-449 whole file (boss + zealots + ThekalResurrect)',
    'creature_spell_list 1450901 (3 rows) / 1450902 (5 rows), classic-db z2815',
    'boss_thekal.cpp:102-123,266-296 JustPreventedDeath 10s ress / 1s if both zealots SPECIAL then 5s tiger',
    'boss_thekal.cpp:245-264,330,381 CanPreventAddsResurrect PreventRevive on both zealots',
  ],
};

// Mar'li — a 60 s troll⇄spider ring. The list ids come from the DB dump, not the Venoxis typo at
// cpp:56-57: creature_template.SpellList is 1451001 and the phase-2 rows are under 1451002.
export const BOSS_MARLI: ScriptDevIR = {
  name: 'boss_marli',
  boundCreatures: [NPC.MARLI],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_marli.cpp',
  spellIds: [24099, 24300, 24082, 24109, 3391, 24110, 24111, 24112, 24084, 24085, 24083, 22911],
  timers: [
    // ---- PHASE 0 troll: list 1451001 ----
    row('poison_volley', 24099, 'self', 15_000, 15_000, 10_000, 20_000, 'creature_spell_list 1451001:0 Poison Volley on None', 0),
    row('drain_life', 24300, 'hostile_random', 30_000, 30_000, 20_000, 50_000, 'creature_spell_list 1451001:1 Drain Life on Random', 0),
    row('spider_egg', 24082, 'self', 55_000, 55_000, 60_000, 60_000, 'creature_spell_list 1451001:2 Spider Egg on None', 0),
    row('enlarge', 24109, 'self', 10_000, 20_000, 20_000, 40_000, 'creature_spell_list 1451001:3 Enlarge on Friendly missing buff no Self (TargetId 6)', 0),
    row('thrash_troll', 3391, 'self', 4000, 6000, 10_000, 20_000, 'creature_spell_list 1451001:4 Thrash on Current', 0),
    // ---- PHASE 1 spider: list 1451002 ----
    {
      ...row('enveloping_webs', 24110, 'self', 5000, 5000, 15_000, 20_000, 'creature_spell_list 1451002:0 Enveloping Webs on None', 1),
      // CAST_OK stands in for SpellHitTarget (Mandokir charge / Buru shape).
      actions: [
        {
          kind: 'arm_timer',
          timerId: 'charge',
          delayMs: 1000,
          cite: 'boss_marli.cpp:101-105 SpellHitTarget ENVELOPING_WEBS → ResetCombatAction(MARLI_CHARGE, 1000)',
        },
      ],
    },
    row('corrosive_poison', 24111, 'hostile_random', 1000, 1000, 25_000, 35_000, 'creature_spell_list 1451002:1 Corrosive Poison on Random', 1),
    row('poison_shock', 24112, 'hostile_random', 5000, 10_000, 10_000, 15_000, 'creature_spell_list 1451002:2 Poison Shock on Random', 1),
    row('thrash_spider', 3391, 'self', 4000, 6000, 10_000, 20_000, 'creature_spell_list 1451002:3 Thrash on Current', 1),
    // MARLI_CHARGE — disabled until webs arm it; one-shot DisableCombatAction after cast.
    {
      id: 'charge',
      spellId: 22911,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'hostile_random_player',
      startDisabled: true,
      oneShot: true,
      cite: 'boss_marli.cpp:72 AddCombatAction(MARLI_CHARGE, true); :143-146 SelectAttackingTarget RANDOM PLAYER + DisableCombatAction',
    },
  ],
  timedPhases: [
    {
      id: 'spider',
      phase: 1,
      afterMs: 60_000,
      next: 'troll',
      actions: [
        { kind: 'cast_self', spellId: 24084, cite: 'boss_marli.cpp:122 DoCastSpellIfCan SPELL_SPIDER_FORM' },
        { kind: 'reset_threat', cite: 'boss_marli.cpp:125 DoResetThreat' },
        { kind: 'yell', textId: -1309006, cite: 'boss_marli.cpp:124 DoScriptText(SAY_TRANSFORM)' },
        { kind: 'flavor', text: 'takes spider form.', cite: 'boss_marli.cpp:119-128 m_phaseTwo=true SetSpellList(PHASE_2)' },
      ],
      cite: 'boss_marli.cpp:71 AddCombatAction(MARLI_PHASE_CHANGE, 60000); :126 ResetCombatAction 60000',
    },
    {
      id: 'troll',
      phase: 0,
      afterMs: 60_000,
      next: 'spider',
      actions: [
        { kind: 'cast_self', spellId: 24085, cite: 'boss_marli.cpp:133 DoCastSpellIfCan SPELL_TRANSFORM_BACK' },
        { kind: 'remove_auras', spellId: 24084, cite: 'boss_marli.cpp:136 RemoveAurasDueToSpell(SPELL_SPIDER_FORM)' },
        { kind: 'yell', textId: -1309025, cite: 'boss_marli.cpp:135 DoScriptText(SAY_TRANSFORM_BACK)' },
        { kind: 'flavor', text: 'returns to troll form.', cite: 'boss_marli.cpp:132-140 m_phaseTwo=false SetSpellList(PHASE_1)' },
      ],
      cite: 'boss_marli.cpp:137 ResetCombatAction(action, 60000) - troll half of the ring',
    },
  ],
  lifecycle: {
    onAggro: [
      { kind: 'yell', textId: -1309005, cite: 'boss_marli.cpp:88 DoScriptText(SAY_AGGRO)' },
      { kind: 'cast_self', spellId: 24083, cite: 'boss_marli.cpp:90 DoCastSpellIfCan SPELL_HATCH_EGGS' },
    ],
    onDeath: [
      { kind: 'yell', textId: -1309008, cite: 'boss_marli.cpp:95 DoScriptText(SAY_DEATH)' },
      { kind: 'set_instance_data', field: TYPE.MARLI, value: INSTANCE_DATA.DONE, cite: 'boss_marli.cpp:98 SetData(TYPE_MARLI, DONE)' },
    ],
    onEvade: [
      { kind: 'set_instance_data', field: TYPE.MARLI, value: INSTANCE_DATA.FAIL, cite: 'boss_marli.cpp:110 JustReachedHome SetData(FAIL)' },
    ],
  },
  cites: [
    'boss_marli.cpp:1-158 whole file',
    'creature_spell_list 1451001 (5 rows) / 1451002 (4 rows), Full_DB ClassicDB_1_12_1_z2815 — NOT cpp typo 1450701/1450702',
    'boss_marli.cpp:101-105 SpellHitTarget ENVELOPING_WEBS → ResetCombatAction(MARLI_CHARGE, 1000); :143-146 cast 22911 + DisableCombatAction',
  ],
};

// Mandokir — list 1138201 is the combat kit; C++ owns Ohgan enrage, spirits, raptor, gaze AI. TYPE_OHGAN
// (zulgurub.h:18) — do not renumber. boss_mandokir.cpp:72-93 aSpirits[] — x,y only (no z/o on this engine).
const MANDOKIR_SPIRIT_POS: ReadonlyArray<{ x: number; y: number }> = [
  { x: -12150.9, y: -1956.24 },
  { x: -12157.1, y: -1972.78 },
  { x: -12172.3, y: -1982.63 },
  { x: -12194.0, y: -1979.54 },
  { x: -12211.3, y: -1978.49 },
  { x: -12228.4, y: -1977.10 },
  { x: -12250.0, y: -1964.78 },
  { x: -12264.0, y: -1953.08 },
  { x: -12289.0, y: -1924.00 },
  { x: -12267.3, y: -1902.26 },
  { x: -12255.3, y: -1893.53 },
  { x: -12229.9, y: -1891.39 },
  { x: -12215.9, y: -1889.09 },
  { x: -12200.5, y: -1890.69 },
  { x: -12186.0, y: -1890.12 },
  { x: -12246.3, y: -1890.09 },
  { x: -12170.7, y: -1894.85 },
  { x: -12279.0, y: -1931.92 },
  { x: -12266.1, y: -1940.72 },
];

export const BOSS_MANDOKIR: ScriptDevIR = {
  name: 'boss_mandokir',
  boundCreatures: [NPC.MANDOKIR],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_mandokir.cpp',
  // Whirlwind 13736 pays through 15589; a trigger payload resolves off the kit.
  spellIds: [24314, 24408, 16856, 13736, 19134, 24407, 24349, 23537, 24342, 24312, 24341, 24315, 25104, 15589, 9204],
  timers: [
    {
      ...row('threatening_gaze', 24314, 'hostile_random', 30_000, 35_000, 20_000, 25_000, 'creature_spell_list 1138201:0 Threatening Gaze on Random'),
      actions: [
        { kind: 'yell', textId: -1309018, cite: 'boss_mandokir.cpp:167 DoScriptText(SAY_WATCH, invoker)' },
        { kind: 'yell', textId: -1309019, cite: 'boss_mandokir.cpp:168 DoScriptText(SAY_WATCH_WHISPER, invoker)' },
        { kind: 'store_threat', cite: 'boss_mandokir.cpp:169 m_targetThreat = getThreat(invoker)' },
        { kind: 'arm_timer', timerId: 'gaze_charge', delayMs: 6000, cite: 'SpellDuration index 32 → 6000ms; ThreateningGaze OnApply false' },
      ],
    },
    {
      ...row('charge', 24408, 'hostile_random', 25_000, 30_000, 25_000, 35_000, 'creature_spell_list 1138201:1 Charge on Random'),
      actions: [
        { kind: 'reset_threat', cite: 'boss_mandokir.cpp:157-160 SpellHitTarget SPELL_CHARGE → DoResetThreat' },
      ],
    },
    row('mortal_strike', 16856, 'victim', 5000, 10_000, 15_000, 15_000, 'creature_spell_list 1138201:2 Mortal Strike on Current'),
    row('whirlwind', 13736, 'victim', 20_000, 20_000, 20_000, 20_000, 'creature_spell_list 1138201:3 Whirlwind on Current'),
    row('intimidating_shout', 19134, 'self', 10_000, 15_000, 20_000, 25_000, 'creature_spell_list 1138201:4 Intimidating Shout on None (MODIFIED FOR CLASSIC)'),
    row('overpower', 24407, 'victim', 5000, 10_000, 15_000, 15_000, 'creature_spell_list 1138201:5 Overpower on Current'),
    {
      id: 'gaze_charge',
      spellId: 24315,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      startDisabled: true,
      oneShot: true,
      pollOnly: true,
      cite: 'boss_mandokir.cpp:171-182 CUSTOM_B 6s later charge if threat rose',
      actions: [
        { kind: 'charge_if_threat_up', spellId: 24315, cite: 'boss_mandokir.cpp:176-181 SPELL_CHARGE_GAZE 24315' },
      ],
    },
  ],
  lifecycle: {
    onAggro: [
      { kind: 'yell', textId: -1309015, cite: 'boss_mandokir.cpp:124 DoScriptText(SAY_AGGRO)' },
      { kind: 'set_instance_data', field: TYPE.OHGAN, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_mandokir.cpp:136 SetData(TYPE_OHGAN, IN_PROGRESS)' },
      ...MANDOKIR_SPIRIT_POS.map((p, i) => ({
        kind: 'summon_count' as const,
        creatureEntry: NPC.CHAINED_SPIRIT,
        count: 1,
        x: p.x,
        y: p.y,
        cite: `boss_mandokir.cpp:${74 + i} aSpirits[${i}] NPC 15117`,
      })),
      { kind: 'cast_self', spellId: 24349, cite: 'boss_mandokir.cpp:133 SPELL_SUMMON_BLOODLORDS_RAPTOR' },
    ],
    onDeath: [
      { kind: 'set_instance_data', field: TYPE.OHGAN, value: INSTANCE_DATA.DONE, cite: 'boss_mandokir.cpp:152 SetData(TYPE_OHGAN, DONE)' },
      { kind: 'cast_self', spellId: 24342, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_mandokir.cpp:154 SPELL_DESPAWN_CHAINED_SPIRITS' },
    ],
    onEvade: [
      { kind: 'set_instance_data', field: TYPE.OHGAN, value: INSTANCE_DATA.FAIL, cite: 'boss_mandokir.cpp:142 SetData(TYPE_OHGAN, FAIL)' },
      { kind: 'cast_self', spellId: 24342, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_mandokir.cpp:144 SPELL_DESPAWN_CHAINED_SPIRITS' },
    ],
    // KilledUnit: the nearest Chained Spirit hauls the dead raider back up. This lived as a
    // hardcoded `entry === 11382` branch in eventAi.ts, which is why Ohgan's copy never had it.
    onKill: [{
      kind: 'proxy_cast_on_victim',
      casterEntry: NPC.CHAINED_SPIRIT,
      spellId: SPELL_MANDOKIR_REVIVE,
      radiusYd: 50,
      cite: 'boss_mandokir.cpp:206-212 KilledUnit -> GetClosestCreatureWithEntry(victim, NPC_CHAINED_SPIRIT 15117, 50.0f) -> CastSpell(victim, SPELL_REVIVE 24341)',
    }],
  },
  addDeaths: [
    {
      creatureEntries: [NPC.OHGAN_RAPTOR],
      atKilled: 1,
      total: 1,
      actions: [
        { kind: 'cast_self', spellId: 23537, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_mandokir.cpp:230 DoCastSpellIfCan SPELL_ENRAGE CAST_TRIGGERED' },
        { kind: 'yell', textId: -1309024, cite: 'boss_mandokir.cpp:231 DoScriptText(EMOTE_RAGE)' },
      ],
      cite: 'boss_mandokir.cpp:226-232 SummonedCreatureJustDied NPC_OHGAN',
    },
  ],
  cites: [
    'boss_mandokir.cpp:1-313 whole file (boss + Ohgan + ThreateningGaze + DespawnChainedSpirits)',
    'creature_spell_list 1138201 (6 rows), classic-db z2815',
    'boss_mandokir.cpp:163-183 ThreateningGaze CUSTOM_A store threat + CUSTOM_B charge 24315 if threat rose (durationIndex 32 = 6000ms)',
    'boss_mandokir.cpp:186-204 KilledUnit ding/level-up 24312 every 3 player kills (eventAi.ts special case)',
    'boss_mandokir.cpp:206-212 KilledUnit spirit 24341 revive via proxy_cast_on_victim on onKill',
    'boss_mandokir.cpp:249-276 mob_ohgan Sunder 24317 - separate ScriptName mob_ohgan, bake thrash only',
  ],
};

// Hakkar — no TYPE slot (PLAN §5 / zulgurub.h). MAX_PRIESTS=5 gates power stacks and aspect
// combatConditions. List 1483401 is the full kit.
export const BOSS_HAKKAR: ScriptDevIR = {
  name: 'boss_hakkar',
  boundCreatures: [NPC.HAKKAR],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_hakkar.cpp',
  // Double Attack 19818 pays through 18941; a trigger payload resolves off the kit.
  spellIds: [24324, 24322, 24323, 24321, 24328, 24327, 24178, 24318, 24687, 24688, 24686, 24689, 24690, 19818, 24692, 18941],
  timers: [
    {
      id: 'double_attack',
      spellId: 19818,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'boss_hakkar.cpp:69 DoCastSpellIfCan SPELL_DOUBLE_ATTACK CAST_TRIGGERED|AURA_NOT_PRESENT',
    },
    row('blood_siphon', 24324, 'self', 90_000, 90_000, 90_000, 90_000, 'creature_spell_list 1483401:0 Blood Siphon on None'),
    row('corrupted_blood', 24328, 'hostile_random', 25_000, 25_000, 30_000, 45_000, 'creature_spell_list 1483401:1 Corrupted Blood on Random'),
    // TargetId 7 = CURRENT_NOT_ALONE → victim.
    row('cause_insanity', 24327, 'victim', 17_000, 17_000, 10_000, 15_000, 'creature_spell_list 1483401:2 Cause Insanity on Current (TargetId 7)'),
    row('will_of_hakkar', 24178, 'hostile_random_not_top', 17_000, 17_000, 25_000, 35_000, 'creature_spell_list 1483401:3 Will of Hakkar on Random non tank (TargetId 101)'),
    // Soft enrage at 100 min from the list; hard path clears CD at <5 % (cpp:92-99).
    row('enrage_soft', 24318, 'self', 6_000_000, 6_000_000, 6_000_000, 6_000_000, 'creature_spell_list 1483401:4 Enrage on None'),
    // Aspects: combatCondition 1005-1009 worldStateExpression 2982-2986 (priest NOT DONE).
    // Worldstates are unevaluated; TYPE_* != DONE is the same test InitiateHakkarPowerStacks uses.
    row('aspect_jeklik', 24687, 'self', 4000, 4000, 10_000, 14_000, 'creature_spell_list 1483401:5 Aspect of Jeklik CombatCondition 1007', undefined, { gate: { field: TYPE.JEKLIK, notEquals: INSTANCE_DATA.DONE, cite: 'zulgurub.h:13 TYPE_JEKLIK; combat_condition 1007 worldStateExpression 2984' } }),
    row('aspect_venoxis', 24688, 'self', 7000, 7000, 8000, 8000, 'creature_spell_list 1483401:6 Aspect of Venoxis CombatCondition 1006', undefined, { gate: { field: TYPE.VENOXIS, notEquals: INSTANCE_DATA.DONE, cite: 'zulgurub.h:14 TYPE_VENOXIS; combat_condition 1006 worldStateExpression 2983' } }),
    row('aspect_marli', 24686, 'victim', 12_000, 12_000, 10_000, 10_000, 'creature_spell_list 1483401:7 Aspect of Marli CombatCondition 1008', undefined, { gate: { field: TYPE.MARLI, notEquals: INSTANCE_DATA.DONE, cite: 'zulgurub.h:15 TYPE_MARLI; combat_condition 1008 worldStateExpression 2985' } }),
    row('aspect_thekal', 24689, 'self', 8000, 8000, 15_000, 15_000, 'creature_spell_list 1483401:8 Aspect of Thekal CombatCondition 1009', undefined, { gate: { field: TYPE.THEKAL, notEquals: INSTANCE_DATA.DONE, cite: 'zulgurub.h:16 TYPE_THEKAL; combat_condition 1009 worldStateExpression 2986' } }),
    row('aspect_arlokk', 24690, 'victim', 18_000, 18_000, 10_000, 15_000, 'creature_spell_list 1483401:9 Aspect of Arlokk CombatCondition 1005', undefined, { gate: { field: TYPE.ARLOKK, notEquals: INSTANCE_DATA.DONE, cite: 'zulgurub.h:17 TYPE_ARLOKK; combat_condition 1005 worldStateExpression 2982' } }),
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 5,
      actions: [
        { kind: 'cast_self', spellId: 24318, cite: 'boss_hakkar.cpp:94-98 HAKKAR_ENRAGE_LOW <5% RemoveSpellCooldown(SPELL_ENRAGE) — product casts once' },
      ],
      cite: 'boss_hakkar.cpp:92-99 timerless HAKKAR_ENRAGE_LOW at GetHealthPercent() < 5.f',
    },
  ],
  lifecycle: {
    onReset: [
      { kind: 'remove_auras', spellId: 24692, cite: 'boss_hakkar.cpp:82 RemoveAurasDueToSpell(SPELL_HAKKAR_POWER)' },
      // One stack per High Priest still standing, so each unrolled row keeps its own iteration's
      // gate. Kill the wing and Hakkar re-opens weaker; without the gates a wipe hands back all five.
      { kind: 'cast_self', spellId: 24692, gate: { field: TYPE.JEKLIK, notEquals: INSTANCE_DATA.DONE, cite: 'zulgurub.h:13 TYPE_JEKLIK' }, cite: 'boss_hakkar.cpp:83-87 InitiateHakkarPowerStacks; zulgurub.h:11 MAX_PRIESTS=5 -> stack 1/5' },
      { kind: 'cast_self', spellId: 24692, gate: { field: TYPE.VENOXIS, notEquals: INSTANCE_DATA.DONE, cite: 'zulgurub.h:14 TYPE_VENOXIS' }, cite: 'boss_hakkar.cpp:83-87 stack 2/5' },
      { kind: 'cast_self', spellId: 24692, gate: { field: TYPE.MARLI, notEquals: INSTANCE_DATA.DONE, cite: 'zulgurub.h:15 TYPE_MARLI' }, cite: 'boss_hakkar.cpp:83-87 stack 3/5' },
      { kind: 'cast_self', spellId: 24692, gate: { field: TYPE.THEKAL, notEquals: INSTANCE_DATA.DONE, cite: 'zulgurub.h:16 TYPE_THEKAL' }, cite: 'boss_hakkar.cpp:83-87 stack 4/5' },
      { kind: 'cast_self', spellId: 24692, gate: { field: TYPE.ARLOKK, notEquals: INSTANCE_DATA.DONE, cite: 'zulgurub.h:17 TYPE_ARLOKK' }, cite: 'boss_hakkar.cpp:83-87 stack 5/5' },
    ],
    onAggro: [
      { kind: 'yell', textId: -1309020, cite: 'boss_hakkar.cpp:76 DoScriptText(SAY_AGGRO)' },
    ],
  },
  cites: [
    'boss_hakkar.cpp:1-139 whole file',
    'zulgurub.h:11 MAX_PRIESTS=5; :41-42 SPELL_HAKKAR_POWER 24692 / POWER_DOWN 24693; no TYPE_HAKKAR',
    'creature_spell_list 1483401 (10 rows), classic-db z2815',
    'combat_condition 1005-1009 worldStateExpression 2982-2986 → TYPE_* != DONE on aspect timers',
    'zulgurub.cpp:173-183 RemoveHakkarPowerStack on priest DONE - instance script, not this IR',
    'boss_hakkar.cpp:118-127 BloodSiphon 24324 -> 24322 funnel or 24323 if 24321',
  ],
};

export const NPC_ZULIAN_PROWLER: ScriptDevIR = {
  name: 'npc_zulian_prowler',
  boundCreatures: [15101],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_arlokk.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'boss_arlokk.cpp:239-251 JustRespawned MovePoint aArlokkWallShieldPos — movement GAP',
  ],
};

export const GO_GONG_OF_BETHEKK: ScriptDevIR = {
  name: 'go_gong_of_bethekk',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_arlokk.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'boss_arlokk.cpp Gong of Bethekk summons Arlokk 14515 (dbscripts_on_event 9066); no combat timer',
  ],
};

export const NPC_GURUBASHI_BAT_RIDER: ScriptDevIR = {
  name: 'npc_gurubashi_bat_rider',
  boundCreatures: [NPC.BAT_RIDER],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_jeklik.cpp',
  // 23971 lays the fire; 23972 Blaze is the trap spell the GO casts, and combat reads the pool's
  // damage and radius off it, so it has to be in the kit too.
  spellIds: [8876, 24024, 23971, 23972],
  timers: [
    {
      id: 'thrash',
      spellId: 8876,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      cite: 'boss_jeklik.cpp:287 Reset DoCastSpellIfCan(SPELL_THRASH, CAST_TRIGGERED|CAST_AURA_NOT_PRESENT)',
    },
    {
      // The pot of fire. 23968 is a periodic trigger of 23969, whose script effect casts 23971, but
      // 23969 has no body upstream so the fire never lands. This is the ported chain at 8 s.
      id: 'liquid_fire',
      spellId: 23971,
      initialMinMs: 8000,
      initialMaxMs: 8000,
      repeatMinMs: 8000,
      repeatMaxMs: 8000,
      target: 'hostile_random',
      cite: 'boss_jeklik.cpp:62 SPELL_LIQUID_FIRE 23968 "script effect - triggers 23971"; :95,233 rider CastSpell(23968); spell 23968 aura 23 amplitude 8000 -> 23969 (targetB 15 enemies at src loc) -> 23971 SUMMON_OBJECT_WILD GO 180125',
    },
    {
      id: 'unstable_concoction',
      spellId: 24024,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      hpPctMax: 40,
      oneShot: true,
      cite: 'boss_jeklik.cpp:296-306 BAT_RIDER_UNSTABLE_CONCOCTION GetHealthPercent() < 40.f SPELL_UNSTABLE_CONCOCTION 24024',
      actions: [{ kind: 'yell', textId: -1309028, cite: 'boss_jeklik.cpp:50,302 SAY_SELF_DETONATE' }],
    },
  ],
  cites: [
    'boss_jeklik.cpp:261-318 npc_gurubashi_bat_riderAI CombatAI',
    'boss_jeklik.cpp:154-157,227-236 rider MovePath / 15s delayed LIQUID_FIRE — movement GAP',
  ],
};

export const MOB_OHGAN: ScriptDevIR = {
  name: 'mob_ohgan',
  boundCreatures: [NPC.OHGAN_RAPTOR],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_mandokir.cpp',
  spellIds: [24317, SPELL_MANDOKIR_REVIVE],
  timers: [
    row('sunder_armor', 24317, 'victim', 5000, 5000, 10_000, 15_000, 'boss_mandokir.cpp:253 AddCombatAction 5000; :272-273 CAST_OK urand(10-15)s Sunder Armor'),
  ],
  // Ohgan's KilledUnit is a copy of his rider's: the nearest Chained Spirit hauls the dead raider
  // back up. The rider's half was a hardcoded entry check in eventAi.ts and this one had nothing.
  lifecycle: {
    onKill: [{
      kind: 'proxy_cast_on_victim',
      casterEntry: NPC.CHAINED_SPIRIT,
      spellId: SPELL_MANDOKIR_REVIVE,
      radiusYd: 50,
      cite: 'boss_mandokir.cpp:257-268 mob_ohganAI::KilledUnit -> GetClosestCreatureWithEntry(victim, NPC_CHAINED_SPIRIT 15117, 50.0f) -> CastSpell(victim, SPELL_REVIVE 24341)',
    }],
  },
  cites: [
    'boss_mandokir.cpp:248-276 mob_ohganAI',
    'boss_mandokir.cpp:257-268 KilledUnit player -> nearest chained spirit SPELL_REVIVE via proxy_cast_on_victim',
  ],
};

export const MOB_ZEALOT_LORKHAN: ScriptDevIR = {
  name: 'mob_zealot_lorkhan',
  boundCreatures: [NPC.LORKHAN],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_thekal.cpp',
  spellIds: [17201, 20545, 24208, 6713, 24173, 19951],
  timers: [
    row('dispel_magic', 17201, 'self', 0, 0, 15_000, 20_000, 'creature_spell_list 1134701:0 Dispel Magic on Dispellable Friendly (product: self)', 0),
    row('lightning_shield', 20545, 'self', 1000, 1000, 61_000, 61_000, 'creature_spell_list 1134701:1 Lightning Shield on None', 0),
    row('great_heal', 24208, 'self', 32_000, 32_000, 15_000, 20_000, 'creature_spell_list 1134701:2 Great Heal on targeting 200 (product: self)', 0),
    row('disarm', 6713, 'victim', 6000, 6000, 15_000, 25_000, 'creature_spell_list 1134701:3 Disarm on Current', 0),
    {
      id: 'zealot_ress',
      spellId: 24173,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      startDisabled: true,
      oneShot: true,
      pollOnly: true,
      cite: 'boss_thekal.cpp:329-334 ACTION_RESSURECTION unless Thekal+Zath SPECIAL',
      actions: [
        { kind: 'cast_self', spellId: 24173, gate: lorkhanMayRevive, cite: 'boss_thekal.cpp:332 SPELL_RESURRECT 24173' },
        { kind: 'set_instance_data', field: TYPE.LORKHAN, value: INSTANCE_DATA.IN_PROGRESS, gate: lorkhanMayRevive, cite: 'boss_thekal.cpp:333 SetData(TYPE_LORKHAN, IN_PROGRESS)' },
        { kind: 'set_phase', phase: 0, gate: lorkhanMayRevive, cite: 'boss_thekal.cpp:136 Revive PHASE_NORMAL' },
        { kind: 'set_death_prevention', enabled: true, gate: lorkhanMayRevive, cite: 'boss_thekal.cpp:146 SetDeathPrevention(true)' },
        { kind: 'set_combat_movement', enabled: true, gate: lorkhanMayRevive, cite: 'boss_thekal.cpp:144 SetCombatMovement(true)' },
      ],
    },
  ],
  lifecycle: {
    onReset: [
      { kind: 'set_death_prevention', enabled: true, cite: 'boss_thekal.cpp:83,91 ctor/Reset SetDeathPrevention(true)' },
      { kind: 'set_instance_data', field: TYPE.LORKHAN, value: INSTANCE_DATA.NOT_STARTED, cite: 'boss_thekal.cpp:345 SetData(TYPE_LORKHAN, NOT_STARTED)' },
    ],
    onAggro: [
      { kind: 'set_instance_data', field: TYPE.LORKHAN, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_thekal.cpp:353 SetData(TYPE_LORKHAN, IN_PROGRESS)' },
    ],
    onPreventedDeath: [
      { kind: 'set_combat_movement', enabled: false, cite: 'boss_thekal.cpp:117 SetCombatMovement(false)' },
      { kind: 'set_phase', phase: 2, cite: 'boss_thekal.cpp:120 PHASE_FAKE_DEATH' },
      { kind: 'cast_self', spellId: 19951, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_thekal.cpp:115 SPELL_PACIFY_SELF 19951' },
      { kind: 'set_instance_data', field: TYPE.LORKHAN, value: INSTANCE_DATA.SPECIAL, cite: 'boss_thekal.cpp:361 SetData(TYPE_LORKHAN, SPECIAL)' },
      { kind: 'arm_timer', timerId: 'zealot_ress', delayMs: 10_000, cite: 'boss_thekal.cpp:358 ResetTimer(ACTION_RESSURECTION, 10000)' },
    ],
  },
  cites: [
    'boss_thekal.cpp:324-369 mob_zealot_lorkhanAI fake-death + SPECIAL + 10s ress',
    'creature_spell_list 1134701 (4 rows)',
  ],
};

export const MOB_ZEALOT_ZATH: ScriptDevIR = {
  name: 'mob_zealot_zath',
  boundCreatures: [NPC.ZATH],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_thekal.cpp',
  spellIds: [15581, 12540, 15614, 21060, 18765, 24173, 19951],
  timers: [
    row('sinister_strike', 15581, 'victim', 8000, 8000, 8000, 16_000, 'creature_spell_list 1134801:0 Sinister Strike on Current', 0),
    row('gouge', 12540, 'self', 25_000, 25_000, 17_000, 27_000, 'creature_spell_list 1134801:1 Gouge on None', 0),
    row('kick', 15614, 'hostile_random', 18_000, 18_000, 15_000, 25_000, 'creature_spell_list 1134801:2 Kick on Random Casting (TargetId 102)', 0),
    row('blind', 21060, 'victim', 5000, 5000, 10_000, 20_000, 'creature_spell_list 1134801:3 Blind on Current', 0),
    row('sweeping_strikes', 18765, 'self', 0, 0, 20_000, 25_000, 'creature_spell_list 1134801:4 Sweeping Strikes on None', 0),
    {
      id: 'zealot_ress',
      spellId: 24173,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      startDisabled: true,
      oneShot: true,
      pollOnly: true,
      cite: 'boss_thekal.cpp:379-385 ACTION_RESSURECTION unless Thekal+Lorkhan SPECIAL',
      actions: [
        { kind: 'cast_self', spellId: 24173, gate: zathMayRevive, cite: 'boss_thekal.cpp:383 SPELL_RESURRECT 24173' },
        { kind: 'set_instance_data', field: TYPE.ZATH, value: INSTANCE_DATA.IN_PROGRESS, gate: zathMayRevive, cite: 'boss_thekal.cpp:384 SetData(TYPE_ZATH, IN_PROGRESS)' },
        { kind: 'set_phase', phase: 0, gate: zathMayRevive, cite: 'boss_thekal.cpp:136 Revive PHASE_NORMAL' },
        { kind: 'set_death_prevention', enabled: true, gate: zathMayRevive, cite: 'boss_thekal.cpp:146 SetDeathPrevention(true)' },
        { kind: 'set_combat_movement', enabled: true, gate: zathMayRevive, cite: 'boss_thekal.cpp:144 SetCombatMovement(true)' },
      ],
    },
  ],
  lifecycle: {
    onReset: [
      { kind: 'set_death_prevention', enabled: true, cite: 'boss_thekal.cpp:83,91 ctor/Reset SetDeathPrevention(true)' },
      { kind: 'set_instance_data', field: TYPE.ZATH, value: INSTANCE_DATA.NOT_STARTED, cite: 'boss_thekal.cpp:394 SetData(TYPE_ZATH, NOT_STARTED)' },
    ],
    onAggro: [
      { kind: 'set_instance_data', field: TYPE.ZATH, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_thekal.cpp:402 SetData(TYPE_ZATH, IN_PROGRESS)' },
    ],
    onPreventedDeath: [
      { kind: 'set_combat_movement', enabled: false, cite: 'boss_thekal.cpp:117 SetCombatMovement(false)' },
      { kind: 'set_phase', phase: 2, cite: 'boss_thekal.cpp:120 PHASE_FAKE_DEATH' },
      { kind: 'cast_self', spellId: 19951, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_thekal.cpp:115 SPELL_PACIFY_SELF 19951' },
      { kind: 'set_instance_data', field: TYPE.ZATH, value: INSTANCE_DATA.SPECIAL, cite: 'boss_thekal.cpp:410 SetData(TYPE_ZATH, SPECIAL)' },
      { kind: 'arm_timer', timerId: 'zealot_ress', delayMs: 10_000, cite: 'boss_thekal.cpp:407 ResetTimer(ACTION_RESSURECTION, 10000)' },
    ],
  },
  cites: [
    'boss_thekal.cpp:376-417 mob_zealot_zathAI fake-death + SPECIAL + 10s ress',
    'creature_spell_list 1134801 (5 rows)',
  ],
};

export const AT_ZULGURUB: ScriptDevIR = {
  name: 'at_zulgurub',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/zulgurub/zulgurub.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'zulgurub.cpp AreaTrigger_at_zulgurub — Hakkar-bridge / edge triggers; no combat body',
  ],
};

// Renataki — Edge of Madness. Combat kit is list 1508401; C++ only owns vanish teleport choreography via
// spell scripts (boss_renataki.cpp).
export const BOSS_RENATAKI: ScriptDevIR = {
  name: 'boss_renataki',
  boundCreatures: [NPC.RENATAKI],
  sourceFile: 'eastern_kingdoms/zulgurub/boss_renataki.cpp',
  spellIds: [24649, 24699, 24698, 3391, 24700, 18951, 24240],
  timers: [
    row('thousand_blades', 24649, 'victim', 4000, 8000, 7000, 12_000, 'creature_spell_list 1508401:0 Thousand Blades on Current'),
    row('vanish', 24699, 'self', 25_000, 30_000, 25_000, 40_000, 'creature_spell_list 1508401:1 Vanish on None'),
    row('gouge', 24698, 'self', 15_000, 25_000, 7000, 20_000, 'creature_spell_list 1508401:2 Gouge on None'),
    row('thrash', 3391, 'self', 10_000, 15_000, 10_000, 15_000, 'creature_spell_list 1508401:3 Thrash on Current'),
  ],
  lifecycle: {
    onReset: [
      { kind: 'cast_self', spellId: 18951, cite: 'boss_renataki.cpp:77 JustRespawned SPELL_SPIRIT_PARTICLES' },
      { kind: 'cast_self', spellId: 24240, cite: 'boss_renataki.cpp:78 JustRespawned SPELL_SPAWN_RED_LIGHTNING' },
    ],
  },
  cites: [
    'boss_renataki.cpp:1-150 whole file',
    'creature_spell_list 1508401 (4 rows), classic-db z2815',
    'boss_renataki.cpp:52-59,81-90,116-138 Vanish → AI_EVENT_CUSTOM_A → VANISH_TELEPORT 24700 delay - GAP (spell-script choreography)',
    'boss_renataki.cpp:93-114 ThousandBlades 24649 fans to 9 other players (triggered, skip current)',
  ],
};
