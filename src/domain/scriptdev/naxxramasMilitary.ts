// Naxxramas Military Quarter — the ScriptDevAI IR port of Razuvious, Gothik and the Four Horsemen
// as ONE IR across four creatures. Cadence is creature_spell_list rows; the C++ is cited per timer.

import type { ScriptDevIR, ScriptDevTimer } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// naxxramas.h:61-63
const TYPE = { RAZUVIOUS: 6, GOTHIK: 7, FOUR_HORSEMEN: 8 } as const;

// naxxramas.h:88-91,105; Razuvious is not in the header — creature_template.entry 16061 with
// ScriptName 'boss_razuvious' (and his SPELLSET id 1606101 carries the entry as its prefix).
const NPC = {
  RAZUVIOUS: 16061, GOTHIK: 16060,
  MOGRAINE: 16062, ZELIEK: 16063, KORTHAZZ: 16064, BLAUMEUX: 16065,
  UNREL_TRAINEE: 16124, UNREL_DEATH_KNIGHT: 16125, UNREL_RIDER: 16126,
  SPECT_TRAINEE: 16127, SPECT_DEATH_KNIGHT: 16148, SPECT_HORSE: 16149, SPECT_RIDER: 16150,
} as const;
const GOTHIK_ADDS = [
  NPC.UNREL_TRAINEE, NPC.UNREL_DEATH_KNIGHT, NPC.UNREL_RIDER,
  NPC.SPECT_TRAINEE, NPC.SPECT_DEATH_KNIGHT, NPC.SPECT_HORSE, NPC.SPECT_RIDER,
] as const;

/** BossAI::SetDataType — Aggro IN_PROGRESS, JustDied DONE, evade/home FAIL. Cite: BossAI.cpp:41-98. */
function lifecycleFor(field: number, file: string) {
  return {
    onAggro: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.IN_PROGRESS, cite: `${file} SetDataType; BossAI.cpp:75 Aggro SetData(IN_PROGRESS)` }],
    onDeath: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.DONE, cite: `${file} SetDataType; BossAI.cpp:49 JustDied SetData(DONE)` }],
    onEvade: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.FAIL, cite: `${file} SetDataType; BossAI.cpp:59,94 SetData(FAIL)` }],
  };
}

// `creature_spell_list.TargetId` → IR target mode: 0 NONE (self-cast), 1 CURRENT (victim), 100
// attack-random-player. Cite: CreatureSpellList.h:34-43; creature_spell_targeting rows 0,1,100.
const t = (
  id: string, spellId: number, iMin: number, iMax: number, rMin: number, rMax: number,
  target: ScriptDevTimer['target'], cite: string, extra: Partial<ScriptDevTimer> = {},
): ScriptDevTimer => ({
  id, spellId, initialMinMs: iMin, initialMaxMs: iMax, repeatMinMs: rMin, repeatMaxMs: rMax,
  target, cite, ...extra,
});

// boss_razuvious
export const BOSS_RAZUVIOUS: ScriptDevIR = {
  name: 'boss_razuvious',
  boundCreatures: [NPC.RAZUVIOUS],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_razuvious.cpp',
  spellIds: [26613, 29107, 29125],
  // boss_razuviousAI declares RAZUVIOUS_ACTION_MAX with no actions: the spell list IS his kit.
  timers: [
    t('unbalancing_strike', 26613, 30_000, 30_000, 30_000, 30_000, 'victim', 'creature_spell_list 1606101:1 Razuvious - Unbalancing Strike (TargetId 1 = Current)'),
    t('disrupting_shout', 29107, 25_000, 25_000, 25_000, 25_000, 'self', 'creature_spell_list 1606101:2 Razuvious - Disrupting Shout (TargetId 0 = None)'),
  ],
  spellHits: [{
    spellId: 29060,
    actions: [{
      kind: 'yell',
      textIds: [13077, 13072, 13073, 13074],
      cite: 'boss_razuvious.cpp:35-38,70-83 SpellHit SPELL_TAUNT 29060 urand(0,3) over SAY_UNDERSTUDY_TAUNT_1-4 13077/13072/13073/13074',
    }],
    cite: 'boss_razuvious.cpp:70-83 SpellHit SPELL_TAUNT',
  }],
  leashZGt: 285,
  lifecycle: (() => {
    const life = lifecycleFor(TYPE.RAZUVIOUS, 'boss_razuvious.cpp:61');
    return {
      ...life,
      onDeath: [
        ...life.onDeath,
        {
          kind: 'cast_self' as const,
          spellId: 29125,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'boss_razuvious.cpp:104-108 JustDied SPELL_HOPELESS 29125 CAST_TRIGGERED',
        },
      ],
    };
  })(),
  cites: [
    'boss_razuvious.cpp:28-117 whole file',
    'creature_spell_list_entry 1606101 "Naxxramas - Razuvious" (list starts at Position 1 - there is no row 0)',
    'boss_razuvious.cpp:49,60 SetLeashingCheck z > 285',
    'boss_razuvious.cpp:35-38,70-83 SpellHit 29060 urand(0,3) over SAY_UNDERSTUDY_TAUNT_1-4 13077/13072/13073/13074',
    'boss_razuvious.cpp:85-102 SpellHitTarget 29107 first mana player EMOTE_TRIUMPHANT_SHOOT 13082',
    'boss_razuvious.cpp:104-108 JustDied SPELL_HOPELESS 29125 CAST_TRIGGERED',
  ],
};

// boss_gothik
export const BOSS_GOTHIK: ScriptDevIR = {
  name: 'boss_gothik',
  boundCreatures: [NPC.GOTHIK],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_gothik.cpp',
  spellIds: [28679, 29317, 28025, 28026, 29230, 28035, 28007, 28009, 28011, 27884, 28008, 28010],
  timers: [
    t('harvest_soul', 28679, 2500, 2500, 15_000, 15_000, 'self', 'creature_spell_list 1606001:0 Gothik - Harvest Soul (TargetId 0 = None)', { startDisabled: true }),
    t('shadowbolt', 29317, 2500, 2500, 1000, 1000, 'victim', 'creature_spell_list 1606001:1 Gothik - Shadowbolt (TargetId 1 = Current)', { startDisabled: true }),
    t('teleport', 28026, 20_000, 20_000, 20_000, 20_000, 'self', 'boss_gothik.cpp:157,294 ResetCombatAction(GOTHIK_TELEPORT, 20s); :313-322 LEFT/RIGHT by side; :305 m_teleportCount >= 4 || HP<=30', { hpPctMin: 30, maxFires: 4, startDisabled: true }),
    t('summon_trainee', 28007, 4000, 4000, 0, 0, 'self', 'boss_gothik.cpp:176,243-246 GOTHIK_SUMMON_TRAINEE 4s SPELL_SUMMON_TRAINEE_PERIODIC 28007', { oneShot: true }),
    t('summon_death_knight', 28009, 49_000, 49_000, 0, 0, 'self', 'boss_gothik.cpp:177,248-251 GOTHIK_SUMMON_DEATH_KNIGHT 49s SPELL_SUMMON_KNIGHT_PERIODIC 28009', { oneShot: true }),
    t('summon_rider', 28011, 104_000, 104_000, 0, 0, 'self', 'boss_gothik.cpp:178,253-256 GOTHIK_SUMMON_RIDER 104s SPELL_SUMMON_MOUNTED_KNIGHT_PERIODIC 28011', { oneShot: true }),
    t('speech_1', 29230, 1000, 1000, 0, 0, 'self', 'boss_gothik.cpp:174,97 SAY_SPEECH_1 13030 at 1s', {
      pollOnly: true, oneShot: true,
      actions: [{ kind: 'yell', textId: 13030, cite: 'boss_gothik.cpp:97 DoBroadcastText(SAY_SPEECH_1 13030)' }],
    }),
    t('speech_2', 29230, 5000, 5000, 0, 0, 'self', 'boss_gothik.cpp:98 SAY_SPEECH_2 13031 +4s', {
      pollOnly: true, oneShot: true,
      actions: [{ kind: 'yell', textId: 13031, cite: 'boss_gothik.cpp:98 DoBroadcastText(SAY_SPEECH_2 13031)' }],
    }),
    t('speech_3', 29230, 11_000, 11_000, 0, 0, 'self', 'boss_gothik.cpp:99 SAY_SPEECH_3 13032 +6s', {
      pollOnly: true, oneShot: true,
      actions: [{ kind: 'yell', textId: 13032, cite: 'boss_gothik.cpp:99 DoBroadcastText(SAY_SPEECH_3 13032)' }],
    }),
    t('speech_4', 29230, 16_000, 16_000, 0, 0, 'self', 'boss_gothik.cpp:100-104 SAY_SPEECH_4 13033 +5s PHASE_BALCONY', {
      pollOnly: true, oneShot: true,
      actions: [{ kind: 'yell', textId: 13033, cite: 'boss_gothik.cpp:102 DoBroadcastText(SAY_SPEECH_4 13033)' }],
    }),
    t('ground_phase', 28025, 274_000, 274_000, 0, 0, 'self', 'boss_gothik.cpp:179,139-158 GOTHIK_GROUND_PHASE 4min+34s SPELL_TELEPORT_RIGHT 28025', {
      oneShot: true,
      actions: [
        { kind: 'remove_auras', spellId: 29230, cite: 'boss_gothik.cpp:147 RemoveAurasDueToSpell(SPELL_IMMUNE_ALL 29230)' },
        { kind: 'yell', textId: 13028, cite: 'boss_gothik.cpp:144 DoBroadcastText(SAY_TELEPORT 13028)' },
        { kind: 'arm_timer', timerId: 'teleport', delayMs: 20_000, cite: 'boss_gothik.cpp:157 ResetCombatAction(GOTHIK_TELEPORT, 20s)' },
        { kind: 'arm_timer', timerId: 'harvest_soul', delayMs: 2500, cite: 'boss_gothik.cpp:158 AddInitialCooldowns list 1606001:0' },
        { kind: 'arm_timer', timerId: 'shadowbolt', delayMs: 2500, cite: 'boss_gothik.cpp:158 AddInitialCooldowns list 1606001:1' },
        { kind: 'set_instance_data', field: TYPE.GOTHIK, value: INSTANCE_DATA.SPECIAL, cite: 'boss_gothik.cpp:191 ProcessCentralDoor SetData(TYPE_GOTHIK, SPECIAL)' },
        { kind: 'open_door', goEntry: 181170, cite: 'naxxramas.h:142 GO_MILI_GOTH_COMBAT_GATE 181170; naxxramas.cpp:499 SPECIAL DoUseDoorOrButton' },
        {
          kind: 'adds_threat_players',
          creatureEntries: [...GOTHIK_ADDS],
          cite: 'boss_gothik.cpp:261-287 HandleOpenGates AddThreat / AttackClosestEnemy',
        },
      ],
    }),
  ],
  lifecycle: (() => {
    const life = lifecycleFor(TYPE.GOTHIK, 'boss_gothik.cpp:84');
    return {
      ...life,
      onAggro: [
        ...life.onAggro,
        {
          kind: 'cast_self' as const,
          spellId: 29230,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'boss_gothik.cpp:169-171 DoCastSpellIfCan SPELL_IMMUNE_ALL 29230 CAST_TRIGGERED',
        },
      ],
      justSummoned: [{
        kind: 'attack_summoner' as const,
        cite: 'boss_gothik.cpp:223-228 JustSummoned SetInCombatWithZone',
      }],
      onEvade: [
        ...life.onEvade,
        {
          kind: 'cast_self' as const,
          spellId: 28035,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'boss_gothik.cpp:217 DoCastSpellIfCan SPELL_RESET_GOTHIK_EVENT 28035 CAST_TRIGGERED',
        },
        { kind: 'remove_auras' as const, spellId: 28007, cite: 'boss_gothik.cpp:509 RemoveAurasDueToSpell SPELL_SUMMON_TRAINEE_PERIODIC 28007' },
        { kind: 'remove_auras' as const, spellId: 28009, cite: 'boss_gothik.cpp:510 RemoveAurasDueToSpell SPELL_SUMMON_KNIGHT_PERIODIC 28009' },
        { kind: 'remove_auras' as const, spellId: 28011, cite: 'boss_gothik.cpp:511 RemoveAurasDueToSpell SPELL_SUMMON_MOUNTED_KNIGHT_PERIODIC 28011' },
      ],
    };
  })(),
  cites: [
    'boss_gothik.cpp:30-552 whole file',
    'creature_spell_list_entry 1606001 "Naxxramas - Gothik"',
    'boss_gothik.cpp:305,316-318 maxFires 4 + hpPctMin 30 (m_teleportCount >= 4 || HP<=30)',
    'boss_gothik.cpp:161-180,243-256 Aggro 29230 + speech 13030-33 + 28007/28009/28011 + 4min34s 28025',
    'boss_gothik.cpp:139-159 HandleGroundPhase 28025 + AddInitialCooldowns (kit startDisabled until 4m34s)',
    'boss_gothik.cpp:182-193,258-288 ProcessCentralDoor SPECIAL + GO 181170 + adds_threat_players',
    'boss_gothik.cpp:214-221,501-512 EnterEvadeMode 28035 strips 28007/28009/28011',
    'boss_gothik.cpp:516-535 Shadowbolt 50% second bolt at a random player (scriptValue 1)',
  ],
};

// boss_four_horsemen — ONE IR over four creatures and four upstream script names. Every timer
// carries creatureEntry so scriptDevCastPlanForEntry hands each Horseman only his own two lists.

/** creature_spell_list row for one Horseman — entry-tagged so it arms for him alone. */
const h = (
  entry: number, id: string, spellId: number, iMin: number, iMax: number, rMin: number, rMax: number,
  target: ScriptDevTimer['target'], cite: string, phase: number,
): ScriptDevTimer => t(id, spellId, iMin, iMax, rMin, rMax, target, cite, { creatureEntry: entry, phase });

export const BOSS_FOUR_HORSEMEN: ScriptDevIR = {
  name: 'boss_four_horsemen',
  boundCreatures: [NPC.MOGRAINE, NPC.ZELIEK, NPC.KORTHAZZ, NPC.BLAUMEUX],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_four_horsemen.cpp',
  // Only the spells ALL FOUR cast: spellIds is not filtered by creatureEntry, so a union here
  // would hand Mograine a Void Zone he can never arm.
  spellIds: [29061, 26662, 28836],
  timers: [
    // Shared: timerless Shield Wall at 50% then 20% (action names SHIELD_WALL_50/_20).
    t('shield_wall_50', 29061, 0, 0, 0, 0, 'self', 'boss_four_horsemen.cpp:133-134,161-168 AddTimerlessCombatAction(SHIELD_WALL_50) SPELL_SHIELDWALL then DisableCombatAction; vanilla 50%/20% HP gates (action names)', { hpPctMax: 50, oneShot: true }),
    t('shield_wall_20', 29061, 0, 0, 0, 0, 'self', 'boss_four_horsemen.cpp:133-134,161-168 AddTimerlessCombatAction(SHIELD_WALL_20) SPELL_SHIELDWALL then DisableCombatAction', { hpPctMax: 20, oneShot: true }),
    t('blaumeux_special', 29061, 5000, 120_000, 5000, 120_000, 'self', 'boss_four_horsemen.cpp:131 AddCombatAction(BLAUMEUX_SPECIAL, 5s, 120s); :169-174 DoBroadcastText(SAY_BLAU_SPECIAL 13013)', { creatureEntry: NPC.BLAUMEUX, pollOnly: true, actions: [{ kind: 'yell', textId: 13013, cite: 'boss_four_horsemen.cpp:171 DoBroadcastText(SAY_BLAU_SPECIAL)' }] }),
    t('mograine_special', 29061, 5000, 120_000, 5000, 120_000, 'self', 'boss_four_horsemen.cpp:200 AddCombatAction(MOGRAINE_SPECIAL, 5s, 120s); DoBroadcastText(SAY_MORG_SPECIAL 13057)', { creatureEntry: NPC.MOGRAINE, pollOnly: true, actions: [{ kind: 'yell', textId: 13057, cite: 'boss_four_horsemen.cpp SAY_MORG_SPECIAL 13057' }] }),
    t('korthazz_special', 29061, 5000, 120_000, 5000, 120_000, 'self', 'boss_four_horsemen.cpp:267 AddCombatAction(KORT_SPECIAL, 5s, 120s); DoBroadcastText(SAY_KORT_SPECIAL 13037)', { creatureEntry: NPC.KORTHAZZ, pollOnly: true, actions: [{ kind: 'yell', textId: 13037, cite: 'boss_four_horsemen.cpp SAY_KORT_SPECIAL 13037' }] }),
    t('zeliek_special', 29061, 5000, 120_000, 5000, 120_000, 'self', 'boss_four_horsemen.cpp:334 AddCombatAction(ZELIEK_SPECIAL, 5s, 120s); :372 DoBroadcastText(SAY_ZELI_SPECIAL 13100)', { creatureEntry: NPC.ZELIEK, pollOnly: true, actions: [{ kind: 'yell', textId: 13100, cite: 'boss_four_horsemen.cpp:372 DoBroadcastText(SAY_ZELI_SPECIAL)' }] }),

    // ---- PHASE 0: the baked lists ----
    h(NPC.MOGRAINE, 'mograine_mark', 28834, 20_000, 20_000, 12_000, 12_000, 'self', 'creature_spell_list 1606201:0 Highlord Mograine - Mark of Mograine (TargetId 0 = None)', 0),
    h(NPC.MOGRAINE, 'mograine_righteous_fire', 28882, 15_000, 15_000, 15_000, 15_000, 'victim', 'creature_spell_list 1606201:1 Highlord Mograine - Righteous Fire (TargetId 1 = Current)', 0),
    h(NPC.MOGRAINE, 'mograine_berserk', 26662, 2_000_000, 2_000_000, 300_000, 300_000, 'self', 'creature_spell_list 1606201:2 Highlord Mograine - Berserk', 0),

    h(NPC.ZELIEK, 'zeliek_mark', 28835, 20_000, 20_000, 12_000, 12_000, 'self', 'creature_spell_list 1606301:0 Sir Zeliek - Mark of Zeliek (TargetId 0 = None)', 0),
    h(NPC.ZELIEK, 'zeliek_holy_wrath', 28883, 12_000, 12_000, 15_000, 15_000, 'hostile_random_player', 'creature_spell_list 1606301:1 Sir Zeliek - Holy Wrath (TargetId 100 = Attack - random player)', 0),
    h(NPC.ZELIEK, 'zeliek_berserk', 26662, 2_000_000, 2_000_000, 300_000, 300_000, 'self', 'creature_spell_list 1606301:2 Sir Zeliek - Berserk', 0),

    h(NPC.KORTHAZZ, 'korthazz_mark', 28832, 20_000, 20_000, 12_000, 12_000, 'self', 'creature_spell_list 1606401:0 Thane Korthazz - Mark of Korthazz (TargetId 0 = None)', 0),
    h(NPC.KORTHAZZ, 'korthazz_meteor', 28884, 20_000, 20_000, 20_000, 20_000, 'victim', 'creature_spell_list 1606401:1 Thane Korthazz - Meteor (TargetId 1 = Current)', 0),
    h(NPC.KORTHAZZ, 'korthazz_berserk', 26662, 2_000_000, 2_000_000, 300_000, 300_000, 'self', 'creature_spell_list 1606401:2 Thane Korthazz - Berserk', 0),

    h(NPC.BLAUMEUX, 'blaumeux_mark', 28833, 20_000, 20_000, 12_000, 12_000, 'self', 'creature_spell_list 1606501:0 Lady Blaumeux - Mark of Blaumeux (TargetId 0 = None)', 0),
    h(NPC.BLAUMEUX, 'blaumeux_void_zone', 28863, 12_000, 12_000, 12_000, 12_000, 'hostile_random_player', 'creature_spell_list 1606501:1 Lady Blaumeux - Void Zone (TargetId 100 = Attack - random player)', 0),
    h(NPC.BLAUMEUX, 'blaumeux_berserk', 26662, 2_000_000, 2_000_000, 300_000, 300_000, 'self', 'creature_spell_list 1606501:2 Lady Blaumeux - Berserk', 0),

    // ---- PHASE 1: the `…02` enrage lists, absent from the bake. Marks go to 1 s and Berserk
    // drops from a 2000 s initial to 0, which is the whole point of the swap.
    h(NPC.MOGRAINE, 'mograine_mark_enrage', 28834, 0, 0, 1000, 1000, 'self', 'creature_spell_list 1606202:0 Highlord Mograine Enrage - Mark of Mograine', 1),
    h(NPC.MOGRAINE, 'mograine_righteous_fire_enrage', 28882, 0, 0, 15_000, 15_000, 'victim', 'creature_spell_list 1606202:1 Highlord Mograine Enrage - Righteous Fire', 1),
    h(NPC.MOGRAINE, 'mograine_berserk_enrage', 26662, 0, 0, 300_000, 300_000, 'self', 'creature_spell_list 1606202:2 Highlord Mograine Enrage - Berserk', 1),

    h(NPC.ZELIEK, 'zeliek_mark_enrage', 28835, 0, 0, 1000, 1000, 'self', 'creature_spell_list 1606302:0 Sir Zeliek Enrage - Mark of Zeliek', 1),
    h(NPC.ZELIEK, 'zeliek_holy_bolt_enrage', 57376, 0, 0, 2000, 3000, 'victim', 'creature_spell_list 1606302:1 Sir Zeliek Enrage - Holy Bolt (TargetId 1 = Current); 57376 is a 57xxx id absent from src/data/spell-data.json and from the 1.12.1 DBC range, so the row arms and resolves nothing', 1),
    h(NPC.ZELIEK, 'zeliek_holy_wrath_enrage', 28883, 0, 0, 15_000, 15_000, 'hostile_random_player', 'creature_spell_list 1606302:2 Sir Zeliek Enrage - Holy Wrath', 1),
    h(NPC.ZELIEK, 'zeliek_berserk_enrage', 26662, 0, 0, 300_000, 300_000, 'self', 'creature_spell_list 1606302:3 Sir Zeliek Enrage - Berserk', 1),
    h(NPC.ZELIEK, 'zeliek_condemnation_enrage', 57377, 0, 0, 5000, 5000, 'self', 'creature_spell_list 1606302:4 Sir Zeliek Enrage - Condemnation; SOURCE-ABSENT, not unported: spell 57377 is not in src/data/spell-data.json (22374 rows) and combat_condition 925 is not in src/data/tables/combatConditions.json (0-410), and both come from the live3310 dump rather than 1.12.1', 1),

    h(NPC.KORTHAZZ, 'korthazz_mark_enrage', 28832, 0, 0, 1000, 1000, 'self', 'creature_spell_list 1606402:0 Thane Korthazz Enrage - Mark of Korthazz', 1),
    h(NPC.KORTHAZZ, 'korthazz_meteor_enrage', 28884, 0, 0, 20_000, 20_000, 'victim', 'creature_spell_list 1606402:1 Thane Korthazz Enrage - Meteor', 1),
    h(NPC.KORTHAZZ, 'korthazz_berserk_enrage', 26662, 0, 0, 300_000, 300_000, 'self', 'creature_spell_list 1606402:2 Thane Korthazz Enrage - Berserk', 1),

    h(NPC.BLAUMEUX, 'blaumeux_mark_enrage', 28833, 0, 0, 1000, 1000, 'self', 'creature_spell_list 1606502:0 Lady Blaumeux Enrage - Mark of Blaumeux', 1),
    h(NPC.BLAUMEUX, 'blaumeux_void_zone_enrage', 28863, 0, 0, 15_000, 15_000, 'hostile_random_player', 'creature_spell_list 1606502:1 Lady Blaumeux Enrage - Void Zone', 1),
    h(NPC.BLAUMEUX, 'blaumeux_berserk_enrage', 26662, 0, 0, 300_000, 300_000, 'self', 'creature_spell_list 1606502:2 Lady Blaumeux Enrage - Berserk', 1),
  ],
  timedPhases: [
    {
      id: 'enrage',
      phase: 1,
      afterMs: 1_200_000,
      actions: [
        { kind: 'flavor', text: 'grows enraged - the marks come faster!', cite: 'boss_four_horsemen.cpp:176 SetSpellList(SpellList + 1)' },
      ],
      cite: 'boss_four_horsemen.cpp:132,175-178 AddCombatAction(ENRAGE, 20min) -> SetSpellList(GetCreatureInfo()->SpellList + 1); same at :201,242-245 / :268,309-312 / :334,376-379',
    },
  ],
  // No onDeath here: BossAI JustDied SetData(DONE) is instance_naxxramas encounters
  // (all four entries) + applyHorsemenSetData. Wiring it here would double-count.
  leashOrXy: [
    { xGt: 2577.3, yLt: -3024.0 },
    { xGt: 2585.9, yLt: -3015.1 },
    { xGt: 2594.6, yLt: -3006.7 },
  ],
  lifecycle: {
    onAggro: [{ kind: 'set_instance_data', field: TYPE.FOUR_HORSEMEN, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_four_horsemen.cpp:127,196,263,330 SetDataType(TYPE_FOUR_HORSEMEN); BossAI.cpp:75' }],
    onEvade: [{ kind: 'set_instance_data', field: TYPE.FOUR_HORSEMEN, value: INSTANCE_DATA.FAIL, cite: 'boss_four_horsemen.cpp:127,196,263,330 SetDataType(TYPE_FOUR_HORSEMEN); BossAI.cpp:59,94' }],
  },
  cites: [
    'boss_four_horsemen.cpp:30-436 whole file',
    'creature_spell_list_entry 1606201/1606301/1606401/1606501 + the enrage twins 1606202/1606302/1606402/1606502 (live3310_classicmangos.sql)',
    'creature_template 16062/16063/16064/16065 SpellList = 1606201/1606301/1606401/1606501, ScriptName = boss_alexandros_mograine/boss_sir_zeliek/boss_thane_korthazz/boss_lady_blaumeux',
    'boss_four_horsemen.cpp:89,99,388-411 MAX_MARK_STACKS 100 + HorsemenMark ladder via 28836',
    'boss_four_horsemen.cpp:107-112,135-140 three-corner leash (x>Xi && y<Yi)',
    'boss_four_horsemen.cpp:131,169-174 SPECIAL yell every 5-120s pollOnly',
    'naxxramas.cpp:527-553 m_horsemenKilled counter gates DONE at 4 (instance_naxxramas)',
  ],
};

export const NAXXRAMAS_MILITARY_IRS: readonly ScriptDevIR[] = [
  BOSS_RAZUVIOUS, BOSS_GOTHIK, BOSS_FOUR_HORSEMEN,
];
