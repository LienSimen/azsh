// Temple of Ahn'Qiraj — the ScriptDevAI IR port of seven of the nine encounters, read whole from
// kalimdor/temple_of_ahnqiraj. Ouro is ported; C'Thun stays absent rather than half-registered.

import type { ScriptDevAction, ScriptDevIR, ScriptDevReceiveAiEvent, ScriptDevTimer } from './types.ts';
import { AI_EVENT, INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// temple_of_ahnqiraj.h:10-21
const TYPE = { SKERAM: 0, BUG_TRIO: 1, SARTURA: 2, FANKRISS: 3, VISCIDUS: 4, HUHURAN: 5, TWINS: 6, OURO: 7, CTHUN: 8 } as const;
const NPC = {
  SKERAM: 15263, SARTURA: 15516, FANKRISS: 15510, HUHURAN: 15509,
  KRI: 15511, VEM: 15544, YAUJ: 15543, VEKNILASH: 15275, VEKLOR: 15276, VISCIDUS: 15299,
  OURO: 15517, CTHUN: 15727,
  SPAWN_FANKRISS: 15630, VEKNISS_HATCHLING: 15962,
  GLOB_OF_VISCIDUS: 15667, FLESH_TENTACLE: 15802,
} as const;

/** temple_of_ahnqiraj.h:43 NPC_FLESH_TENTACLE; boss_cthun.cpp:91 MAX_FLESH_TENTACLES. */
const MAX_FLESH_TENTACLES = 2;
// boss_cthun.cpp:96-97 cthunLocations[0] — the first Flesh Tentacle spot. Both stand within a few
// yards of each other, so one anchor is the pair's site.
const CTHUN_FLESH_TENTACLE_XY = [-8571.472, 1990.2048] as const;

/** boss_viscidus.cpp:98 PHASE_EXPLODED. */
const VISCIDUS_PHASE_EXPLODED = 4;
// boss_viscidus.cpp:63 — "summons npc 15667 using spells from 25865 to 25884", so twenty globs, and
// :513 takes 5 % each: 20 x 5 = the whole bar.
const VISCIDUS_GLOB_COUNT = 20;
const VISCIDUS_GLOB_SHRINK_PCT = 5;

/** Twin Emperors shared-HP spells. Cite: boss_twinemperors.cpp:51-56. */
const SPELL_TWIN = {
  TELEPORT: 799,
  HEAL_BROTHER: 7393,
  EMPATHY: 1177,
  SUICIDE: 26627,
  TELEPORT_VISUAL: 26638,
  MUTATE_BUG: 802,
  EXPLODE_BUG: 804,
  FRENZY: 27897,
} as const;

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

/** Side-store for m_uiBugTrioDeathCount. Cite: temple_of_ahnqiraj.h:10 MAX_ENCOUNTER=10; cpp:240. */
const BUG_TRIO_CONSUME_KEY = 10;
const EMOTE_CONSUMED = -1531048;

function trioConsume(deathSpell: number, others: number[]): {
  onReset: ScriptDevAction[];
  onPreventedDeath: ScriptDevAction[];
  onEvade: ScriptDevAction[];
  receiveAiEvents: ScriptDevReceiveAiEvent[];
} {
  const life = lifecycleFor(TYPE.BUG_TRIO, 'boss_bug_trio.cpp');
  return {
    onReset: [
      { kind: 'set_death_prevention', enabled: true, cite: 'boss_bug_trio.cpp:97 SetDeathPrevention(true)' },
    ],
    onPreventedDeath: [
      {
        kind: 'set_instance_data',
        field: BUG_TRIO_CONSUME_KEY,
        value: 1,
        increment: true,
        cite: 'temple_of_ahnqiraj.cpp:240 ++m_uiBugTrioDeathCount',
      },
      { kind: 'yell', textId: EMOTE_CONSUMED, cite: 'boss_bug_trio.cpp:142 EMOTE_CONSUMED' },
      { kind: 'cast_self', spellId: deathSpell, cite: 'boss_bug_trio.cpp:144,149-152 DoSpecialAbility' },
      { kind: 'force_despawn', delayMs: 3000, cite: 'boss_bug_trio.cpp:146 ForcedDespawn(3000)' },
      ...others.map((entry) => ({
        kind: 'send_ai_event' as const,
        eventType: AI_EVENT.CUSTOM_A,
        receiver: 'creature_entry' as const,
        creatureEntry: entry,
        cite: 'temple_of_ahnqiraj.cpp:243-251 SendAIEvent CUSTOM_A to living trio',
      })),
    ],
    onEvade: [
      ...life.onEvade,
      { kind: 'set_instance_data', field: BUG_TRIO_CONSUME_KEY, value: 0, cite: 'temple_of_ahnqiraj.cpp:256-278 FAIL resets m_uiBugTrioDeathCount' },
    ],
    receiveAiEvents: [{
      eventType: AI_EVENT.CUSTOM_A,
      actions: [
        { kind: 'set_combat_movement', enabled: false, cite: 'boss_bug_trio.cpp:182 SetCombatMovement(false)' },
        {
          kind: 'set_death_prevention',
          enabled: false,
          gate: { field: BUG_TRIO_CONSUME_KEY, equals: 2, cite: 'boss_bug_trio.cpp:178 miscValue == 2' },
          cite: 'boss_bug_trio.cpp:178 SetDeathPrevention(false) at the second consume',
        },
      ],
      cite: 'boss_bug_trio.cpp:174-188 ReceiveAIEvent CUSTOM_A',
    }],
  };
}

export const BOSS_SKERAM: ScriptDevIR = {
  name: 'boss_skeram',
  boundCreatures: [NPC.SKERAM],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_skeram.cpp',
  spellIds: [26192, 26194, 785, 747],
  timers: [
    t('arcane_explosion', 26192, 6000, 12_000, 8000, 18_000, 'self', 'boss_skeram.cpp ARCANE_EXPLOSION 6-12s then 8-18s'),
    // True Fulfilment mind-controls the NEAREST non-tank player — the reason the raid
    // spreads. NEAREST_BY with skip-tank, not a plain random.
    t('true_fulfilment', 785, 15_000, 15_000, 20_000, 30_000, 'hostile_random_not_top_player', 'boss_skeram.cpp TRUE_FULFILLMENT 15s then 20-30s, NEAREST_BY skipTank', { select: { playerOnly: true, skipTopThreat: true } }),
    // Anti-kite punish, not a rotation spell: SKERAM_EARTH_SHOCK polls, and a victim the boss can
    // reach in melee sets m_rangeCheckState = -1 so nothing is cast. Only two consecutive
    // out-of-melee polls (m_rangeCheckState > 1) fire it, and the action then re-arms at 2500 ms.
    // Same shape as Ragnaros's Magma Blast (moltenCore.ts:464).
    t('earth_shock', 26194, 1200, 1200, 2500, 2500, 'victim', 'boss_skeram.cpp:75 AddCombatAction 1200; SKERAM_EARTH_SHOCK CanReachWithMeleeAttack victim → skip, else cast then timer 2500', { requireVictimNotInMelee: true }),
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 75,
      retainPhase: true,
      actions: [{ kind: 'cast_self', spellId: 747, cite: 'boss_skeram.cpp:254 DoCastSpellIfCan SPELL_SUMMON_IMAGES 747 at 75%' }],
      cite: 'boss_skeram.cpp:250-260 m_hpCheck 75 then -= 25',
    },
    {
      phase: 2,
      hpBelowPct: 50,
      retainPhase: true,
      actions: [{ kind: 'cast_self', spellId: 747, cite: 'boss_skeram.cpp:254 DoCastSpellIfCan SPELL_SUMMON_IMAGES 747 at 50%' }],
      cite: 'boss_skeram.cpp:250-260 m_hpCheck 50 then -= 25',
    },
    {
      phase: 3,
      hpBelowPct: 25,
      retainPhase: true,
      actions: [{ kind: 'cast_self', spellId: 747, cite: 'boss_skeram.cpp:254 DoCastSpellIfCan SPELL_SUMMON_IMAGES 747 at 25%' }],
      cite: 'boss_skeram.cpp:250-260 m_hpCheck 25 then -= 25',
    },
  ],
  lifecycle: {
    ...lifecycleFor(TYPE.SKERAM, 'boss_skeram.cpp'),
    justSummoned: [
      // An image is a SHARE of him, not an add: its max health is a fraction of his and its current
      // health is his own percent, so the copies made at 25 % are half his bar each.
      {
        kind: 'mirror_summoner_health',
        bands: [
          { belowPct: 25, fracOfMax: 0.50 },
          { belowPct: 50, fracOfMax: 0.20 },
          { belowPct: 101, fracOfMax: 0.10 },
        ],
        cite: 'boss_skeram.cpp:328-340 InitializeImages passes GetHealthPercent() as basepoints; :342-364 InitializeImage 0.50 below 25, 0.20 below 50, else 0.10, then SetHealthPercent',
      },
      // The C++ picks a RANDOM target for the image, not its summoner — attack_summoner pointed the
      // copies at Skeram himself.
      {
        kind: 'attack_random',
        cite: 'boss_skeram.cpp:155-160 JustSummoned SelectAttackingTarget(ATTACKING_TARGET_RANDOM, 0) then summoned->AI()->AttackStart(target)',
      },
    ],
  },
  cites: [
    'boss_skeram.cpp:25-300 whole file',
    'boss_skeram.cpp:250-260 SPELL_SUMMON_IMAGES 747 at 75/50/25 % NPC 15263',
    'boss_skeram.cpp:328-364 InitializeImages 794 / InitializeImage 3730 give each image a fraction of his max health and his own health percent, via mirror_summoner_health',
    'boss_skeram.cpp:65,89,109-153,169-200 m_isImage: the images share his ScriptName and differ by having a spawner. The teleport choreography (SPELL_TELEPORT_1/2/3 + TeleportImage) is a residual - no in-fight teleport verb here',
  ],
};

export const BOSS_SARTURA: ScriptDevIR = {
  name: 'boss_sartura',
  boundCreatures: [NPC.SARTURA],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_sartura.cpp',
  spellIds: [26083, 25174, 27680, 8269],
  timers: [
    t('whirlwind', 26083, 10_000, 20_000, 20_000, 25_000, 'self', 'boss_sartura.cpp WHIRLWIND 10-20s then 20-25s'),
    t('sundering_cleave', 25174, 2000, 5000, 2000, 5000, 'victim', 'boss_sartura.cpp SUNDERING_CLEAVE 2-5s'),
    // A ten-minute hard berserk. It is the fight's clock, not chrome.
    t('berserk', 27680, 600_000, 600_000, 600_000, 600_000, 'self', 'boss_sartura.cpp BERSERK 10*MINUTE'),
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 25,
      actions: [
        { kind: 'cast_self', spellId: 8269, cite: 'boss_sartura.cpp SARTURA_ENRAGE GetHealthPercent() <= 25.0f' },
        { kind: 'flavor', text: 'enrages.', cite: 'boss_sartura.cpp timerless enrage at 25 %' },
      ],
      cite: 'boss_sartura.cpp AddTimerlessCombatAction(SARTURA_ENRAGE) at <=25 % HP',
    },
  ],
  lifecycle: lifecycleFor(TYPE.SARTURA, 'boss_sartura.cpp'),
  cites: ['boss_sartura.cpp:25-200 whole file'],
};

export const BOSS_FANKRISS: ScriptDevIR = {
  name: 'boss_fankriss',
  boundCreatures: [NPC.FANKRISS],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_fankriss.cpp',
  spellIds: [25646, 720, 731, 1121, 518, 25831, 25832, 26630, 26631, 26632],
  timers: [
    t('mortal_wound', 25646, 10_000, 15_000, 7000, 14_000, 'victim', 'boss_fankriss.cpp MORTAL_WOUND 10-15s then 7-14s'),
    // Entangle teleports a NON-tank into one alcove — SELECT_FLAG_SKIP_TANK.
    t('entangle', 720, 15_000, 20_000, 25_000, 55_000, 'hostile_random_not_top_player', 'boss_fankriss.cpp:160-180 urand 720/731/1121 PLAYER|SKIP_TANK', {
      select: { playerOnly: true, skipTopThreat: true },
      rotateSpellIds: [720, 731, 1121],
    }),
    t('summon_worm', 518, 30_000, 50_000, 22_000, 70_000, 'self', 'boss_fankriss.cpp:70,141-157 shuffle 518/25831/25832 waves urand(1,3)', {
      rotateSpellIds: [518, 25831, 25832],
      waveMinCount: 1,
      waveMaxCount: 3,
      intraWaveMinMs: 5000,
      intraWaveMaxMs: 7000,
    }),
  ],
  lifecycle: {
    ...lifecycleFor(TYPE.FANKRISS, 'boss_fankriss.cpp'),
    justSummoned: [
      { kind: 'attack_random', creatureEntry: NPC.SPAWN_FANKRISS, cite: 'boss_fankriss.cpp:115-119 JustSummoned NPC_SPAWN_FANKRISS SelectAttackingTarget(RANDOM) AttackStart' },
    ],
  },
  cites: [
    'boss_fankriss.cpp:25-213 whole file',
    'boss_fankriss.cpp:91-99,141-157 m_summonWormSpells 518/25831/25832 NPC 15630',
    'boss_fankriss.cpp:54-55,160-180,186-203 aEntangle 720/731/1121 -> 26630/26631/26632 NPC 15962',
  ],
};

export const BOSS_HUHURAN: ScriptDevIR = {
  name: 'boss_huhuran',
  boundCreatures: [NPC.HUHURAN],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_huhuran.cpp',
  // Frenzy 26051 and Berserk 26068 pay through Poison Bolt 26052, resolved off the kit.
  spellIds: [26051, 26068, 26053, 26180, 26050, 26052, 26233],
  timers: [
    t('acid_spit', 26050, 8000, 8000, 5000, 10_000, 'self', 'boss_huhuran.cpp SPIT 8s then 5-10s'),
    // Frenzy triggers the Poison Bolt Volley that hits the 15 CLOSEST — the spread rule
    // (PLAN §6). The volley itself rides the frenzy spell.
    t('frenzy', 26051, 25_000, 35_000, 10_000, 20_000, 'self', 'boss_huhuran.cpp FRENZY 25-35s then 10-20s'),
    t('noxious_poison', 26053, 10_000, 20_000, 12_000, 24_000, 'self', 'boss_huhuran.cpp NOXIOUS_POISON 10-20s then 12-24s'),
    t('wyvern_sting', 26180, 35_000, 45_000, 25_000, 35_000, 'hostile_random', 'boss_huhuran.cpp WYVERN 35-45s then 25-35s'),
    t('berserk', 26068, 300_000, 300_000, 300_000, 300_000, 'self', 'boss_huhuran.cpp BERSERK 5*MINUTE'),
  ],
  phases: [
    {
      // Below 30 % the berserk is forced early — the fight has a hard back half.
      phase: 1,
      hpBelowPct: 30,
      actions: [
        { kind: 'cast_self', spellId: 26068, cite: 'boss_huhuran.cpp HUHURAN_BERSERK_HP_CHECK GetHealthPercent() > 30.0f gate' },
        { kind: 'flavor', text: 'goes berserk - poison volleys hit the fifteen closest.', cite: 'boss_huhuran.cpp berserk HP check at 30 %' },
      ],
      cite: 'boss_huhuran.cpp AddTimerlessCombatAction(HUHURAN_BERSERK_HP_CHECK) at <=30 % HP',
    },
  ],
  lifecycle: lifecycleFor(TYPE.HUHURAN, 'boss_huhuran.cpp'),
  cites: ['boss_huhuran.cpp:25-200 whole file'],
};

// The Bug Family, boss_bug_trio.cpp read whole. All three share TYPE_BUG_TRIO, and the second
// Consume drops death prevention on the survivor. Cite: boss_bug_trio.cpp:100-135.
export const BOSS_KRI: ScriptDevIR = {
  name: 'boss_kri',
  boundCreatures: [NPC.KRI],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_bug_trio.cpp',
  spellIds: [26350, 25812, 3391, 26590],
  timers: [
    t('cleave', 26350, 4000, 8000, 5000, 12_000, 'victim', 'boss_bug_trio.cpp:204,226 CLEAVE 4-8s then 5-12s'),
    // nullptr target = self-centred AoE volley, not a picked victim.
    t('toxic_volley', 25812, 6000, 30_000, 15_000, 25_000, 'self', 'boss_bug_trio.cpp:205,232 TOXIC_VOLLEY 6-30s then 15-25s'),
    t('thrash', 3391, 6000, 6000, 2000, 6000, 'self', 'boss_bug_trio.cpp:206,238 THRASH 6s then 2-6s'),
  ],
  lifecycle: (() => {
    const life = lifecycleFor(TYPE.BUG_TRIO, 'boss_bug_trio.cpp');
    const c = trioConsume(26590, [NPC.VEM, NPC.YAUJ]);
    return {
      ...life,
      onReset: c.onReset,
      onPreventedDeath: c.onPreventedDeath,
      onEvade: c.onEvade,
      onDeath: [
        ...life.onDeath,
        {
          kind: 'cast_self' as const,
          spellId: 26590,
          cite: 'boss_bug_trio.cpp:128-136,149-152,214 JustDied DoSpecialAbility SPELL_SUMMON_CLOUD 26590',
        },
      ],
    };
  })(),
  receiveAiEvents: trioConsume(26590, [NPC.VEM, NPC.YAUJ]).receiveAiEvents,
  cites: [
    'boss_bug_trio.cpp:1-397 whole file',
    'boss_bug_trio.cpp:116-146,174-188 DummyConsume + second-consume unlocks the survivor',
    'boss_bug_trio.cpp:128-136,149-152,214 JustDied DoSpecialAbility SPELL_SUMMON_CLOUD 26590 NPC 15933',
  ],
};

export const BOSS_VEM: ScriptDevIR = {
  name: 'boss_vem',
  boundCreatures: [NPC.VEM],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_bug_trio.cpp',
  spellIds: [26561, 18670, 19128, 25790],
  timers: [
    t('charge', 26561, 15_000, 27_000, 8000, 16_000, 'hostile_random_not_in_melee', 'boss_bug_trio.cpp:257,280-282 CHARGE 15-27s then 8-16s, PLAYER|NOT_IN_MELEE_RANGE', { select: { playerOnly: true, notInMelee: true } }),
    t('knock_away', 18670, 10_000, 20_000, 10_000, 20_000, 'victim', 'boss_bug_trio.cpp:258,288 KNOCK_AWAY 10-20s'),
    t('knockdown', 19128, 5000, 8000, 15_000, 20_000, 'victim', 'boss_bug_trio.cpp:259,294 KNOCKDOWN 5-8s then 15-20s'),
  ],
  lifecycle: (() => {
    const life = lifecycleFor(TYPE.BUG_TRIO, 'boss_bug_trio.cpp');
    const c = trioConsume(25790, [NPC.KRI, NPC.YAUJ]);
    return { ...life, onReset: c.onReset, onPreventedDeath: c.onPreventedDeath, onEvade: c.onEvade };
  })(),
  receiveAiEvents: trioConsume(25790, [NPC.KRI, NPC.YAUJ]).receiveAiEvents,
  cites: [
    'boss_bug_trio.cpp:1-397 whole file',
    'boss_bug_trio.cpp:116-146,174-188,267 DummyConsume SPELL_VENGEANCE 25790',
    'creature_template 15544 also carries 26662, which the script never schedules - left unscheduled',
  ],
};

export const BOSS_YAUJ: ScriptDevIR = {
  name: 'boss_yauj',
  boundCreatures: [NPC.YAUJ],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_bug_trio.cpp',
  spellIds: [25807, 26580, 3242, 25789, 25808],
  timers: [
    // GetHealthPercent() < 100.0f — the heal only fires once she has taken a hit.
    t('heal', 25807, 20_000, 30_000, 10_000, 30_000, 'self', 'boss_bug_trio.cpp:314,349-351 HEAL 20-30s then 10-30s, only below 100 % HP', { hpPctMax: 99 }),
    t('fear', 26580, 12_000, 24_000, 20_000, 20_000, 'self', 'boss_bug_trio.cpp:316,356-359 FEAR 12-24s then 20s', {
      actions: [{ kind: 'reset_threat', cite: 'boss_bug_trio.cpp:356-358 CAST_OK SPELL_FEAR → DoResetThreat' }],
    }),
    t('ravage', 3242, 12_000, 12_000, 10_000, 15_000, 'victim', 'boss_bug_trio.cpp:317,366 RAVAGE 12s then 10-15s'),
    // The pool is not "anything with a debuff": empty dispel/mechanic masks make the check pass only
    // on a friendly in combat that is rooted, snared, frozen or crowd-controlled.
    t('dispel', 25808, 10_000, 30_000, 10_000, 15_000, 'friendly_dispellable', 'boss_bug_trio.cpp:315,369-375 YAUJ_DISPEL 10-30s then 10-15s, DoFindFriendlyEligibleDispel(50.0f)', {
      friendlyRadiusYd: 50,
    }),
  ],
  lifecycle: (() => {
    const life = lifecycleFor(TYPE.BUG_TRIO, 'boss_bug_trio.cpp');
    const c = trioConsume(25789, [NPC.KRI, NPC.VEM]);
    return { ...life, onReset: c.onReset, onPreventedDeath: c.onPreventedDeath, onEvade: c.onEvade };
  })(),
  receiveAiEvents: trioConsume(25789, [NPC.KRI, NPC.VEM]).receiveAiEvents,
  cites: [
    'boss_bug_trio.cpp:1-397 whole file',
    'boss_bug_trio.cpp:315,369-375 DISPEL 25808 via friendly_dispellable; UnitAI.cpp:764-771 + GridNotifiers.h:915-930 empty-mask check = immobilized/snared/frozen/CC',
    'boss_bug_trio.cpp:356-358 CAST_OK SPELL_FEAR → DoResetThreat via reset_threat',
    'boss_bug_trio.cpp:116-146,174-188,325 DummyConsume SPELL_SUMMON_BROOD 25789 NPC 15621',
  ],
};

// The Twin Emperors, boss_twinemperors.cpp read whole. `damageHealMirror` ports the percent link
// and the 60 yd Heal Brother LoS; teleport 799 swaps position and threat and stuns both.
export const BOSS_VEKNILASH: ScriptDevIR = {
  name: 'boss_veknilash',
  boundCreatures: [NPC.VEKNILASH],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_twinemperors.cpp',
  // Double Attack 18943 pays through 18941; a trigger payload resolves off the kit.
  spellIds: [26007, 26613, 27680, 18943, 802, SPELL_TWIN.HEAL_BROTHER, SPELL_TWIN.EMPATHY, SPELL_TWIN.SUICIDE, 18941],
  timers: [
    t('uppercut', 26007, 14_000, 29_000, 15_000, 30_000, 'hostile_random', 'boss_twinemperors.cpp:196,256-259 UPPERCUT 14-29s then 15-30s, SELECT_FLAG_IN_MELEE_RANGE', { select: { inMelee: true } }),
    t('unbalancing_strike', 26613, 8000, 18_000, 8000, 20_000, 'victim', 'boss_twinemperors.cpp:197,265-266 UNBALANCING_STRIKE 8-18s then 8-20s'),
    t('berserk', 27680, 900_000, 900_000, 900_000, 900_000, 'self', 'boss_twinemperors.cpp:88,247 BERSERK at 15*MINUTE, DisableCombatAction after'),
    t('double_attack', 18943, 0, 0, 0, 0, 'self', 'boss_twinemperors.cpp:204 Reset DOUBLE_ATTACK TRIGGERED|AURA_NOT_PRESENT', { onReset: true }),
    t('mutate_bug', 802, 7000, 14_000, 10_000, 17_000, 'self', 'boss_twinemperors.cpp:89,175-178,242 EMPEROR_BUG_ABILITY 7-14s then 10-17s SPELL_MUTATE_BUG', {
      pollOnly: true,
      actions: [{
        kind: 'cast_on_script_targets',
        spellId: 802,
        cite: 'boss_twinemperors.cpp:242 DoCastSpellIfCan(nullptr, SPELL_MUTATE_BUG); spell_script_target 15316/15317',
      }],
    }),
  ],
  damageHealMirror: {
    partnerEntry: NPC.VEKLOR,
    empathySpellId: SPELL_TWIN.EMPATHY,
    suicideSpellId: SPELL_TWIN.SUICIDE,
    healBrotherSpellId: SPELL_TWIN.HEAL_BROTHER,
    healBrotherRangeYd: 60,
    encounterField: TYPE.TWINS,
    cite: 'boss_twinemperors.cpp:96-125 DamageTaken/HealedBy; :209-210 Heal Brother 60yd',
  },
  lifecycle: lifecycleFor(TYPE.TWINS, 'boss_twinemperors.cpp'),
  cites: [
    'boss_twinemperors.cpp:256 SPELL_UPPERCUT SELECT_FLAG_IN_MELEE_RANGE via select.inMelee; the flag is a target PICK here, while shadowfang_keep.cpp:477 and darkshore.cpp:805 use it as an EXISTENCE gate on a self-centred AoE, which is requireMeleeTargetExists',
    'boss_twinemperors.cpp:1-435 whole file',
    'boss_twinemperors.cpp:96-125,209-210 damageHealMirror (EMPATHY 1177 + HEAL_BROTHER 7393 + SUICIDE 26627)',
    'boss_twinemperors.cpp:332-356 TWIN_TELEPORT 799 SpellHit swaps pos with Veklor',
    'boss_twinemperors.cpp:66,175-178,242 MUTATE_BUG 802 script-AOE entries 15316/15317',
  ],
};

export const BOSS_VEKLOR: ScriptDevIR = {
  name: 'boss_veklor',
  boundCreatures: [NPC.VEKLOR],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_twinemperors.cpp',
  // Explode Bug and Enrage pay through 26059 / 26643, resolved off the kit.
  spellIds: [26006, 26607, 568, 804, 799, 800, SPELL_TWIN.FRENZY, SPELL_TWIN.HEAL_BROTHER, SPELL_TWIN.EMPATHY, SPELL_TWIN.SUICIDE, 26059, 26643],
  timers: [
    t('shadow_bolt', 26006, 1000, 1000, 2000, 2000, 'victim', 'boss_twinemperors.cpp:289,374-375 SHADOW_BOLT 1s then every 2s'),
    t('blizzard', 26607, 15_000, 20_000, 15_000, 30_000, 'hostile_random_player', 'boss_twinemperors.cpp:290,380-382 BLIZZARD 15-20s then 15-30s, PLAYER', { select: { playerOnly: true } }),
    // Self-centred burst, gated in source on a top-aggro player inside the effect radius.
    t('arcane_burst', 568, 1000, 1000, 5000, 5000, 'self', 'boss_twinemperors.cpp:291,387-389 ARCANE_BURST 1s then 5s, TOPAGGRO|USE_EFFECT_RADIUS'),
    // TARGET_UNIT_CASTER. Cite: SpellTargetDefines.h:25; Spell.dbc 27897 EffectImplicitTargetA=1.
    t('frenzy', SPELL_TWIN.FRENZY, 900_000, 900_000, 900_000, 900_000, 'self', 'boss_twinemperors.cpp:88,365 FRENZY at 15*MINUTE'),
    t('twin_teleport', 799, 35_000, 35_000, 35_000, 35_000, 'self', 'boss_twinemperors.cpp:292,394 VEKLOR_TELEPORT 35s SPELL_TWIN_TELEPORT 799'),
    t('explode_bug', 804, 7000, 14_000, 10_000, 17_000, 'self', 'boss_twinemperors.cpp:89,175-178,360 EMPEROR_BUG_ABILITY 7-14s then 10-17s SPELL_EXPLODE_BUG', {
      pollOnly: true,
      actions: [{
        kind: 'cast_on_script_targets',
        spellId: 804,
        cite: 'boss_twinemperors.cpp:360 DoCastSpellIfCan(nullptr, SPELL_EXPLODE_BUG); spell_script_target 15316/15317',
      }],
    }),
  ],
  damageHealMirror: {
    partnerEntry: NPC.VEKNILASH,
    empathySpellId: SPELL_TWIN.EMPATHY,
    suicideSpellId: SPELL_TWIN.SUICIDE,
    healBrotherSpellId: SPELL_TWIN.HEAL_BROTHER,
    healBrotherRangeYd: 60,
    encounterField: TYPE.TWINS,
    cite: 'boss_twinemperors.cpp:96-125 DamageTaken/HealedBy; :306-307 Heal Brother 60yd',
  },
  lifecycle: lifecycleFor(TYPE.TWINS, 'boss_twinemperors.cpp'),
  cites: [
    'boss_twinemperors.cpp:1-435 whole file',
    'boss_twinemperors.cpp:96-125,306-307 damageHealMirror (EMPATHY 1177 + HEAL_BROTHER 7393 + SUICIDE 26627)',
    'boss_twinemperors.cpp:88,365 FRENZY 27897 at 15*MINUTE TARGET_UNIT_CASTER',
    'boss_twinemperors.cpp:292,332-356,393-394 TWIN_TELEPORT 799 SpellHit swaps pos with Veknilash',
    'boss_twinemperors.cpp:60,175-178,360 EXPLODE_BUG 804 script-AOE entries 15316/15317',
  ],
};

// Viscidus, boss_viscidus.cpp read whole. The frost hit-count is ported — 100/150/200 packets apply
// 26034/26036/25937 — and the glob explode 25885 is a script-handled no-op.
export const BOSS_VISCIDUS: ScriptDevIR = {
  name: 'boss_viscidus',
  boundCreatures: [NPC.VISCIDUS],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_viscidus.cpp',
  spellIds: [25993, 25991, 25994, 26584, 25926, 26034, 26036, 25937],
  timers: [
    t('poison_shock', 25993, 7000, 12_000, 7000, 12_000, 'self', 'boss_viscidus.cpp:128,367-368 POISON_SHOCK 7-12s'),
    t('poisonbolt_volley', 25991, 10_000, 15_000, 10_000, 15_000, 'self', 'boss_viscidus.cpp:129,373-374 POISONBOLT_VOLLEY 10-15s'),
    t('toxin', 26584, 30_000, 30_000, 30_000, 30_000, 'hostile_random_player', 'boss_viscidus.cpp:127,358-362 VISCIDUS_TOXIN 30s SELECT_FLAG_PLAYER SPELL_SUMMON_TOXIC_SLIME 26584'),
  ],
  lifecycle: (() => {
    const life = lifecycleFor(TYPE.VISCIDUS, 'boss_viscidus.cpp');
    return {
      ...life,
      onAggro: [
        ...life.onAggro,
        {
          kind: 'cast_self' as const,
          spellId: 25994,
          castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
          cite: 'boss_viscidus.cpp:162 Aggro SPELL_MEMBRANE_VISCIDUS 25994 CAST_TRIGGERED|AURA_NOT_PRESENT',
        },
        {
          kind: 'cast_self' as const,
          spellId: 25926,
          castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
          cite: 'boss_viscidus.cpp:163 Aggro SPELL_VISCIDUS_WEAKNESS 25926 CAST_TRIGGERED|AURA_NOT_PRESENT',
        },
      ],
    };
  })(),
  hitCountGates: [
    {
      id: 'frost',
      school: 'frost',
      requireAura: 25926,
      phaseMin: 0,
      phaseMax: 2,
      thresholds: [
        {
          at: 100,
          setPhase: 1,
          actions: [
            { kind: 'cast_self', spellId: 26034, castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT, cite: 'boss_viscidus.cpp:244 SPELL_VISCIDUS_SLOWED 26034' },
            { kind: 'yell', textId: -1531041, cite: 'boss_viscidus.cpp:243 EMOTE_SLOW' },
          ],
          cite: 'boss_viscidus.cpp:87 HITCOUNT_SLOW 100; :301-305 PHASE_SLOWED',
        },
        {
          at: 150,
          setPhase: 2,
          actions: [
            { kind: 'remove_auras', spellId: 26034, cite: 'boss_viscidus.cpp:229 RemoveAurasDueToSpell SLOWED' },
            { kind: 'cast_self', spellId: 26036, castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT, cite: 'boss_viscidus.cpp:250 SPELL_VISCIDUS_SLOWED_MORE 26036' },
            { kind: 'yell', textId: -1531042, cite: 'boss_viscidus.cpp:249 EMOTE_FREEZE' },
          ],
          cite: 'boss_viscidus.cpp:88 HITCOUNT_SLOW_MORE 150; :307-311 PHASE_SLOWED_MORE',
        },
        {
          at: 200,
          setPhase: 3,
          resetCount: true,
          durationMs: 15_000,
          actions: [
            { kind: 'remove_auras', spellId: 26036, cite: 'boss_viscidus.cpp:230 RemoveAurasDueToSpell SLOWED_MORE' },
            { kind: 'cast_self', spellId: 25937, castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT, cite: 'boss_viscidus.cpp:258 SPELL_VISCIDUS_FREEZE 25937' },
            { kind: 'set_combat_movement', enabled: false, cite: 'boss_viscidus.cpp:258 freeze stun (self 25937)' },
            { kind: 'yell', textId: -1531043, cite: 'boss_viscidus.cpp:257 EMOTE_FROZEN' },
          ],
          onExpire: {
            setPhase: 0,
            resetCount: true,
            actions: [
              { kind: 'remove_auras', spellId: 25937, cite: 'boss_viscidus.cpp:231 RemoveAurasDueToSpell FREEZE' },
              { kind: 'set_combat_movement', enabled: true, cite: 'boss_viscidus.cpp:235-240 PHASE_NORMAL melee on' },
              { kind: 'cast_self', spellId: 25994, castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT, cite: 'boss_viscidus.cpp:237 SPELL_MEMBRANE_VISCIDUS' },
              { kind: 'cast_self', spellId: 25926, castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT, cite: 'boss_viscidus.cpp:238 SPELL_VISCIDUS_WEAKNESS' },
              { kind: 'reset_threat', cite: 'boss_viscidus.cpp:239 SPELL_HATE_TO_ZERO 20538' },
            ],
            cite: 'boss_viscidus.cpp:415-419 freeze OnApply(!apply) CUSTOM_A → PHASE_NORMAL; 25937 durationIndex 8',
          },
          cite: 'boss_viscidus.cpp:89 HITCOUNT_FREEZE 200; :313-317 PHASE_FROZEN',
        },
      ],
      cite: 'boss_viscidus.cpp:552-565 ViscidusFrostWeakness frost school → CUSTOM_B IncreaseHitCount',
    },
    {
      id: 'melee',
      melee: true,
      phaseMin: 3,
      phaseMax: 3,
      thresholds: [
        {
          at: 50,
          actions: [{ kind: 'yell', textId: -1531044, cite: 'boss_viscidus.cpp:322 EMOTE_CRACK' }],
          cite: 'boss_viscidus.cpp:90 HITCOUNT_CRACK 50',
        },
        {
          at: 100,
          actions: [{ kind: 'yell', textId: -1531045, cite: 'boss_viscidus.cpp:324 EMOTE_SHATTER' }],
          cite: 'boss_viscidus.cpp:91 HITCOUNT_SHATTER 100',
        },
        {
          // THE SHATTER: 150 melee hits burst him into twenty globs, each worth 5 % of his bulk.
          // Twenty globs is exactly a full bar, which is why this and not raw dps ends him.
          at: 150,
          setPhase: VISCIDUS_PHASE_EXPLODED,
          resetCount: true,
          actions: [
            {
              kind: 'summon_count',
              creatureEntry: NPC.GLOB_OF_VISCIDUS,
              count: VISCIDUS_GLOB_COUNT,
              cite: 'boss_viscidus.cpp:63,387 SPELL_SUMMON_GLOBS 25885 - a script effect that fires the twenty summons 25865-25884, each raw effect 41 -> NPC 15667',
            },
            { kind: 'set_unattackable', cite: 'boss_viscidus.cpp:391-393 SPELL_INVIS_SELF 25905 + SPELL_STUN_SELF 25900' },
            { kind: 'set_melee_enabled', enabled: false, cite: 'boss_viscidus.cpp:393 SPELL_STUN_SELF 25900' },
            { kind: 'remove_auras', spellId: 25926, cite: 'boss_viscidus.cpp:397 RemoveAurasDueToSpell(SPELL_VISCIDUS_WEAKNESS)' },
          ],
          cite: 'boss_viscidus.cpp:92 HITCOUNT_EXPLODE 150; :325-326 SetPhase(PHASE_EXPLODED); :382-400 HandleExplode',
        },
      ],
      cite: 'boss_viscidus.cpp:422-428 ViscidusFreeze melee OnProc CUSTOM_C; :92 HITCOUNT_EXPLODE 150',
    },
  ],
  cites: [
    'boss_viscidus.cpp:1-585 whole file',
    'boss_viscidus.cpp:127,358-362 VISCIDUS_TOXIN 30s 26584 on random player',
    'boss_viscidus.cpp:162-163 Aggro 25994 + 25926; frost 100/150/200 → 26034/26036/25937',
    'boss_viscidus.cpp:382-400,505-521 SUMMON_GLOBS 25885 -> twenty globs, each death shrinking him 5 % via shrink_creature_pct',
    'boss_viscidus.cpp:214-224 SummonedMovementInform rejoin walk - residual: no movement verb, so a glob the raid ignores never walks back and never restores the 5 %',
  ],
};

export const BOSS_EYE_OF_CTHUN: ScriptDevIR = {
  name: 'boss_eye_of_cthun',
  boundCreatures: [15589],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_cthun.cpp',
  spellIds: [26134, 32950, 26029, 26137, 26397, 26152, 18950, 26255],
  timers: [
    t('eye_beam_init', 32950, 1, 1, 3000, 5000, 'victim', 'boss_cthun.cpp:117 AddCombatAction INIT_EYEBEAM 1ms; :225-234 first three on the victim then DisableCombatAction', { maxFires: 3 }),
    // After the first three the DB list takes over: 26134 on a random player every 2-3 s.
    t('eye_beam', 26134, 22_000, 22_000, 2000, 3000, 'hostile_random_player', 'creature_spell_list 1558900:1 Eye of Cthun - Eye Beam, TargetId 100 = attack random player, 22 s then 2-3 s', { phase: 0, select: { playerOnly: true } }),
    // 26137 is a bare SCRIPT effect whose only job is the phase switch, so the row polls: 40 s of
    // Dark Glare with no targeting, then back to eye beams. Cite: boss_cthun.cpp:208-220 OnSpellCast.
    t('rotate_trigger', 26137, 45_000, 45_000, 85_000, 85_000, 'self', 'creature_spell_list 1558900:0 Eye of Cthun - Rotate Trigger, 45 s then 85 s; boss_cthun.cpp:208-220 OnSpellCast SPELL_ROTATE_TRIGGER -> 40 s sub-phase', {
      phase: 0,
      pollOnly: true,
      actions: [
        { kind: 'set_phase', phase: 1, cite: 'boss_cthun.cpp:213-218 SetCombatScriptStatus(true) + SetTarget(nullptr) for the Dark Glare sub-phase' },
        { kind: 'arm_timer', timerId: 'dark_glare_end', delayMs: 40_000, cite: 'boss_cthun.cpp:219 ResetTimer(EYECTHUN_END_DARKGLARE, 40000)' },
      ],
    }),
    // The sweep itself: 26029 is a 100 yd CONE, and the rotate auras 26009/26136 pulse it every
    // second while the eye spins. Cite: spell_template 26009/26136 aura 23 amplitude 1000.
    t('dark_glare', 26029, 0, 0, 1000, 1000, 'self', 'boss_cthun.cpp:40-43 SPELL_DARK_GLARE 26029 triggered by SPELL_ROTATE_360_LEFT 26009 / RIGHT 26136; spell_template 26029 direct_damage shadow 43750-56250 cone radiusYd 100', { phase: 1 }),
    // spellId 0 on purpose: this row shares no id with rotate_trigger, and applyScriptDevTimerActions
    // matches on the id, so 26137 on both would have run BOTH action lists on every fire.
    t('dark_glare_end', 0, 40_000, 40_000, 40_000, 40_000, 'self', 'boss_cthun.cpp:193-205 HandleEndDarkGlare strips the rotate auras and resumes targeting', {
      phase: 1,
      pollOnly: true,
      startDisabled: true,
      actions: [
        { kind: 'set_phase', phase: 0, cite: 'boss_cthun.cpp:200-205 SetCombatScriptStatus(false) + SetTarget(GetVictim()) + AddInitialCooldowns' },
        { kind: 'arm_timer', timerId: 'eye_beam', delayMs: 2000, cite: 'boss_cthun.cpp:205 AddInitialCooldowns re-arms the eye beam' },
      ],
    }),
  ],
  lifecycle: {
    onAggro: [
      { kind: 'set_instance_data', field: TYPE.CTHUN, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_cthun.cpp:144-145 Aggro SetData(TYPE_CTHUN, IN_PROGRESS)' },
      { kind: 'cast_self', spellId: 26152, castFlags: 1, cite: 'boss_cthun.cpp:151 SPELL_SUMMON_EYE_TENTACLES CAST_TRIGGERED|AURA_NOT_PRESENT' },
      { kind: 'cast_self', spellId: 26397, castFlags: 1, cite: 'boss_cthun.cpp:152 SPELL_SUMMON_HOOK_TENTACLES_1 CAST_TRIGGERED|AURA_NOT_PRESENT' },
    ],
    onEvade: [
      { kind: 'set_instance_data', field: TYPE.CTHUN, value: INSTANCE_DATA.FAIL, cite: 'boss_cthun.cpp:178-179 EnterEvadeMode SetData(FAIL)' },
    ],
  },
  cites: [
    'boss_cthun.cpp:102-239 boss_eye_of_cthunAI',
    'boss_cthun.cpp:193-220 the 40 s Dark Glare sub-phase via a phase swap: 26029 pulses its own 100 yd cone every second, which is the sweep. The ORIENTATION control (the eye spinning, so the cone walks the room) is a residual - the rotate auras 26009/26136 turn the body and no facing verb here does',
  ],
};

// The body phase has ONE win condition and it is not damage: two Flesh Tentacles stand in the
// stomach, and killing both strips the Carapace for 45 s. Everything else here is pressure.
export const BOSS_CTHUN: ScriptDevIR = {
  name: 'boss_cthun',
  boundCreatures: [15727],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_cthun.cpp',
  spellIds: [26213, 26769, 26232, 26235, 26156, 26255],
  timers: [
    t('giant_claw', 26213, 10_000, 10_000, 60_000, 60_000, 'self', 'boss_cthun.cpp:259 AddCombatAction CLAWTENTACLEDELAY 10s; comment :258 60s period after the offset'),
    t('giant_eye', 26769, 40_000, 40_000, 60_000, 60_000, 'self', 'boss_cthun.cpp:260 AddCombatAction EYETENTACLEDELAY 40s; 60s period after the offset'),
    // HandleEndWeaken, 45 s after the vulnerability lands: the Carapace comes back and a fresh pair
    // of Flesh Tentacles goes up, so the raid has to do it again.
    t('weaken_end', 26156, 0, 0, 0, 0, 'self', 'boss_cthun.cpp:406 ResetTimer(CTHUN_WEAKENED_END, 45s); :410-416 HandleEndWeaken re-casts SPELL_CARAPACE_CTHUN 26156 + SPELL_CHECK_RESET_AURA 26255 and re-spawns the tentacles', {
      startDisabled: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      actions: [
        { kind: 'cast_self', spellId: 26255, castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT, cite: 'boss_cthun.cpp:414 SPELL_CHECK_RESET_AURA 26255' },
        {
          kind: 'summon_count',
          creatureEntry: NPC.FLESH_TENTACLE,
          count: MAX_FLESH_TENTACLES,
          x: CTHUN_FLESH_TENTACLE_XY[0],
          y: CTHUN_FLESH_TENTACLE_XY[1],
          cite: 'boss_cthun.cpp:94-99 cthunLocations[0..1]; :371-373 DoSpawnTentacles summons MAX_FLESH_TENTACLES 2',
        },
      ],
    }),
  ],
  lifecycle: {
    ...lifecycleFor(TYPE.CTHUN, 'boss_cthun.cpp'),
    onAggro: [
      { kind: 'set_instance_data', field: TYPE.CTHUN, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_cthun.cpp Aggro SetData(IN_PROGRESS)' },
      { kind: 'cast_self', spellId: 26156, castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT, cite: 'boss_cthun.cpp:390 HandleEmerge SPELL_CARAPACE_CTHUN 26156' },
      {
        kind: 'summon_count',
        creatureEntry: NPC.FLESH_TENTACLE,
        count: MAX_FLESH_TENTACLES,
        x: CTHUN_FLESH_TENTACLE_XY[0],
        y: CTHUN_FLESH_TENTACLE_XY[1],
        cite: 'boss_cthun.cpp:94-99 cthunLocations[0..1]; :371-373 DoSpawnTentacles',
      },
    ],
  },
  // The stomach pair is the ONLY thing that makes him killable, and the hook that owns it already
  // exists for Majordomo: a boss whose encounter turns on his own adds dying, not on his own death.
  addDeaths: [{
    creatureEntries: [NPC.FLESH_TENTACLE],
    atKilled: 'all',
    total: MAX_FLESH_TENTACLES,
    actions: [
      { kind: 'cast_self', spellId: 26235, cite: 'boss_cthun.cpp:399 HandleWeaken SPELL_CTHUN_VULNERABLE 26235 CAST_INTERRUPT_PREVIOUS' },
      { kind: 'remove_auras', spellId: 26156, cite: 'boss_cthun.cpp:402 RemoveAurasDueToSpell(SPELL_CARAPACE_CTHUN)' },
      { kind: 'remove_auras', spellId: 26255, cite: 'boss_cthun.cpp:401 RemoveAurasDueToSpell(SPELL_CHECK_RESET_AURA)' },
      { kind: 'yell', textId: 11476, cite: 'boss_cthun.cpp:32,404 EMOTE_WEAKENED 11476' },
      { kind: 'arm_timer', timerId: 'weaken_end', delayMs: 45_000, cite: 'boss_cthun.cpp:406 ResetTimer(CTHUN_WEAKENED_END, 45 * IN_MILLISECONDS)' },
    ],
    cite: 'boss_cthun.cpp:351-360 SummonedCreatureJustDied counts NPC_FLESH_TENTACLE to MAX_FLESH_TENTACLES then HandleWeaken',
  }],
  cites: [
    'boss_cthun.cpp:241-460 boss_cthunAI body phase',
    'boss_cthun.cpp:91,351-360,371-373,396-416 two Flesh Tentacles 15802 -> 26235 vulnerable, carapace off, 45 s, then both respawn',
    'boss_cthun.cpp:77-89,555-600 the stomach TELEPORT itself (26220 in, 26221/26230 out, areatriggers 4033/4034/4036) is a residual: this engine has no in-fight teleport-to-a-second-room verb, so the tentacles stand in the same room the raid is already in',
  ],
};

// A rooted body with two ONE-SHOT ground pulses, not a melee add: the IR was empty, so neither
// pulse nor the immobilize existed. Neither AddCustomAction handler re-arms.
export const MOB_GIANT_CLAW_TENTACLE: ScriptDevIR = {
  name: 'mob_giant_claw_tentacle',
  boundCreatures: [15728],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_cthun.cpp',
  spellIds: [26478, 6524, 26404],
  timers: [
    t('ground_rupture', 26478, 2000, 2000, 0, 0, 'self', 'boss_cthun.cpp:490,504-507 AddCustomAction(GIANTCLAW_RUPTURE, 2000) HandleRupture SPELL_GIANT_GROUND_RUPTURE 26478, never re-armed', { oneShot: true }),
    t('ground_tremor', 6524, 7000, 7000, 0, 0, 'self', 'boss_cthun.cpp:491,509-512 AddCustomAction(GIANTCLAW_GROUND_TREMOR, 7000) HandleGroundTremor SPELL_GROUND_TREMOR 6524, never re-armed', { oneShot: true }),
  ],
  lifecycle: {
    onReset: [
      { kind: 'set_combat_movement', enabled: false, cite: 'boss_cthun.cpp:501 Reset SetImmobilizedState(true)' },
    ],
    onDeath: [
      { kind: 'cast_self', spellId: 26404, cite: 'boss_cthun.cpp:514-517 JustDied CastSpell(nullptr, SPELL_DESPAWN_TENT_PORT 26404, TRIGGERED_OLD_TRIGGERED)' },
    ],
  },
  cites: [
    'boss_cthun.cpp:484-547 npc_giant_claw_tentacleAI whole struct',
    'boss_cthun.cpp:464,470-471 SPELL_GIANT_GROUND_RUPTURE 26478, SPELL_GROUND_TREMOR 6524, SPELL_DESPAWN_TENT_PORT 26404',
    'boss_cthun.cpp:488,523-545 GIANTCLAW_CHECKTARGET: after 5 s untanked it TELEPORTS to its victim with 26205. Residual - this engine has no in-fight teleport verb, and chase_focus would re-pick a target rather than move the body, which is a different mechanic',
  ],
};

export const AT_STOMACH_CTHUN: ScriptDevIR = {
  name: 'at_stomach_cthun',
  boundCreatures: [],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_cthun.cpp',
  spellIds: [26220, 26230],
  timers: [],
  cites: [
    'boss_cthun.cpp:87-89 AREATRIGGER_STOMACH_1/2/3 4033/4034/4036; at_stomach_cthun eject/kill',
  ],
};

export const BOSS_OURO: ScriptDevIR = {
  name: 'boss_ouro',
  boundCreatures: [15517],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_ouro.cpp',
  // Berserk 26615 summons the mounds through 26617, resolved off the kit.
  spellIds: [18941, 26103, 26102, 26616, 26615, 26586, 26100, 26063, 26058, 26617],
  timers: [
    t('birth_spawn', 26586, 300, 300, 300, 300, 'self', 'boss_ouro.cpp:112 AddCombatAction OURO_SPAWN 300ms; :227 DisableCombatAction after first', { phase: 0 }),
    t('sandblast', 26102, 25_000, 25_000, 25_000, 25_000, 'self', 'boss_ouro.cpp:115 AddCombatAction SAND_BLAST 25s; :268-269 CAST_OK re-arm 25000', { phase: 0 }),
    t('sweep', 26103, 20_000, 20_000, 20_000, 20_000, 'self', 'boss_ouro.cpp:116 AddCombatAction SWEEP 20s; :274-275 CAST_OK re-arm 20000', { phase: 0 }),
    t('double_attack', 18941, 1000, 10_000, 1000, 10_000, 'self', 'boss_ouro.cpp:117 AddCombatAction DOUBLE_ATTACK urand(1-10)s', { phase: 0 }),
    t('berserk', 26615, 0, 0, 0, 0, 'self', 'boss_ouro.cpp:247-256 OURO_ENRAGE timerless at <20% HP', { hpPctMax: 20 }),
  ],
  timedPhases: [
    {
      id: 'submerge',
      phase: 1,
      afterMs: 90_000,
      next: 'emerge',
      hpMinPct: 20,
      actions: [
        { kind: 'cast_self', spellId: 26063, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_ouro.cpp:193 SPELL_SUBMERGE_VISUAL 26063' },
        { kind: 'cast_self', spellId: 26058, castFlags: CAST_FLAG.TRIGGERED, cite: 'boss_ouro.cpp:197 SPELL_SUMMON_OURO_MOUNDS 26058 (raw effect 41 bp 4 → 5× NPC 15712)' },
        { kind: 'set_unattackable', cite: 'boss_ouro.cpp:200 SetFlag UNIT_FLAG_UNINTERACTIBLE (ForcedDespawn 2000 skipped — same body re-emerges)' },
        { kind: 'set_combat_movement', enabled: false, cite: 'boss_ouro.cpp:196 SetMeleeEnabled(false)' },
        { kind: 'flavor', text: 'burrows.', cite: 'boss_ouro.cpp:191-209 Burrow' },
      ],
      cite: 'boss_ouro.cpp:113,191-209,261-264 OURO_SUBMERGE 90s Burrow 5 dirt mounds',
    },
    {
      id: 'emerge',
      phase: 0,
      afterMs: 30_000,
      next: 'submerge',
      actions: [
        { kind: 'clear_unattackable', cite: 'boss_ouro.cpp:214-218 HandleSpawnDelay SetMeleeEnabled(true)' },
        { kind: 'set_combat_movement', enabled: true, cite: 'boss_ouro.cpp:214 SetMeleeEnabled(true)' },
        { kind: 'cast_self', spellId: 26100, cite: 'boss_ouro.cpp:218 SPELL_GROUND_RUPTURE on emerge' },
        { kind: 'flavor', text: 'erupts from the sand.', cite: 'boss_ouro.cpp:212-218 HandleSpawnDelay' },
      ],
      cite: 'spell-data 26642 tickMs 30000 first mound SPELL_SUMMON_OURO_TRIGG → re-summon; product keeps the same body',
    },
  ],
  lifecycle: lifecycleFor(TYPE.OURO, 'boss_ouro.cpp'),
  cites: [
    'boss_ouro.cpp:107-280 boss_ouroAI ground kit',
    'boss_ouro.cpp:191-209,197 SPELL_SUMMON_OURO_MOUNDS 26058 five NPC 15712; emerge 30s (26642 tickMs)',
  ],
};

export const NPC_OURO_SPAWNER: ScriptDevIR = {
  name: 'npc_ouro_spawner',
  boundCreatures: [15957],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_ouro.cpp',
  spellIds: [],
  timers: [],
  cites: ['boss_ouro.cpp npc_ouro_spawner — summons Ouro; no combat timer'],
};

// The mound is the submerge phase's whole pressure: a 1 s Quake pulse under it and a fresh random
// player picked every 5-10 s, so it cannot be tanked and the raid has to break line with it.
export const NPC_OURO_MOUND: ScriptDevIR = {
  name: 'npc_ouro_mound',
  boundCreatures: [15712],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_ouro.cpp',
  // 26093 Quake is 26092's periodic payload and has to be on the kit for the trigger to resolve.
  spellIds: [24780, 26060, 26092, 26093],
  timers: [
    t('dirtmound_passive', 26092, 0, 0, 0, 0, 'self', 'boss_ouro.cpp:56,360-362 Reset SPELL_DIRTMOUND_PASSIVE 26092 CAST_AURA_NOT_PRESENT | CAST_TRIGGERED; it casts SPELL_QUAKE 26093 every 1 s', {
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
    }),
    // PickNewTarget: SetInCombatWithZone, DoResetThreat, a random PLAYER, AddThreat 1000000 and
    // AttackStart — the chase_focus verb exactly, on a 1 s first pick then urand(5-10)s.
    t('pick_new_target', 26092, 1000, 1000, 5000, 10_000, 'self', 'boss_ouro.cpp:357,378-387,390-393 AddCustomAction(1) delayed 1000 then ResetTimer(1, urand(5000,10000)) PickNewTarget', {
      pollOnly: true,
      actions: [{
        kind: 'chase_focus',
        threat: 1_000_000,
        cite: 'boss_ouro.cpp:379-386 SetInCombatWithZone + DoResetThreat + SelectAttackingTarget(RANDOM, 0, nullptr, SELECT_FLAG_PLAYER) + AddThreat(target, 1000000.f) + AttackStart',
      }],
    }),
  ],
  cites: [
    'boss_ouro.cpp:352-394 npc_ouro_moundAI',
    'boss_ouro.cpp:51-56 SPELL_QUAKE 26093, SPELL_DREAM_FOG 24780, SPELL_DIRTMOUND_PASSIVE 26092, SPELL_SUMMON_SCARABS 26060',
    'boss_ouro.cpp:52 SPELL_DREAM_FOG 24780 is commented "on mounds" and is cast NOWHERE in the file, so it stays absent rather than invented',
    'boss_ouro.cpp:440-447 the 30 s scarab summon is an AuraScript payload swap on the passive - no aura-script payload-swap verb here, so 26060 rides the kit unscheduled',
  ],
};

export const NPC_OURO_TRIGGER: ScriptDevIR = {
  name: 'npc_ouro_trigger',
  boundCreatures: [15717],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_ouro.cpp',
  spellIds: [],
  timers: [],
  cites: ['boss_ouro.cpp:85-105 npc_ouro_triggerAI stores Ouro HP% for emerge; REACT_PASSIVE'],
};

// No ScriptName of its own: the behaviour is Viscidus's summon hooks plus the ViscidusShrinks
// SpellScript. It gets an IR because the hook that owns the 5 % is the glob's own death.
export const NPC_GLOB_OF_VISCIDUS: ScriptDevIR = {
  name: 'npc_glob_of_viscidus',
  boundCreatures: [NPC.GLOB_OF_VISCIDUS],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_viscidus.cpp',
  spellIds: [25896],
  timers: [],
  lifecycle: {
    onDeath: [{
      kind: 'shrink_creature_pct',
      creatureEntry: NPC.VISCIDUS,
      pct: VISCIDUS_GLOB_SHRINK_PCT,
      cite: 'boss_viscidus.cpp:505-521 ViscidusShrinks: hpLose = 0.05f * GetMaxHealth(), SetHealth(GetHealth() - hpLose) with a GetHealth() > 1 + hpLose floor',
    }],
  },
  cites: [
    'boss_viscidus.cpp:63,82 SPELL_SUMMON_GLOBS 25885 -> NPC_GLOB_OF_VISCIDUS 15667',
    'boss_viscidus.cpp:183-198 JustSummoned REACT_PASSIVE + MovePoint back to the respawn coord',
    'boss_viscidus.cpp:200-210 SummonedCreatureJustDied -> the shrink; :214-224 the rejoin walk is a movement residual',
    'creature_template 15667 Glob of Viscidus carries no ScriptName; the shrink is a SpellScript on 25893/27934',
  ],
};

export const NPC_OURO_SCARAB: ScriptDevIR = {
  name: 'npc_ouro_scarab',
  boundCreatures: [15718],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/boss_ouro.cpp',
  spellIds: [],
  timers: [],
  cites: ['boss_ouro.cpp npc_ouro_scarab — mound hatch add; no independent combat timer'],
};

/** mob_anubisath_sentinel.cpp:78 m_abilities — the nine dealt one per sibling, never stacked. */
const SENTINEL_ABILITIES = [812, 2147, 2148, 2834, 9347, 13022, 19595, 21737, 25777] as const;

// Five sentinels, nine abilities, one shuffle: the group that aggros deals pool[0..4] out and each
// wears exactly one. On death the dead one's ability moves to every survivor, so a wipe-race stacks.
export const MOB_ANUBISATH_SENTINEL: ScriptDevIR = {
  name: 'mob_anubisath_sentinel',
  boundCreatures: [15264],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/mob_anubisath_sentinel.cpp',
  spellIds: [8599, 2400, 26565, ...SENTINEL_ABILITIES],
  timers: [
    // DisableCombatAction after CAST_OK, so it is one enrage per pull and not a per-tick re-arm.
    t('enrage', 8599, 0, 0, 0, 0, 'self', 'mob_anubisath_sentinel.cpp:65 AddTimerlessCombatAction BERSERK_HP_CHECK; :211-221 <30 % CAST_OK then DisableCombatAction', { hpPctMax: 30, oneShot: true }),
  ],
  lifecycle: {
    onAggro: [{
      kind: 'deal_group_abilities',
      spellIds: [...SENTINEL_ABILITIES],
      radiusYd: 80,
      cite: 'mob_anubisath_sentinel.cpp:117 GetCreatureListWithEntryInGrid 80.0f; :127-131 std::shuffle; :140-159 SetAbility; :183-205 InitSentinelsNear',
    }],
    onDeath: [{
      kind: 'transfer_group_ability',
      healSpellId: 26565,
      radiusYd: 80,
      cite: 'mob_anubisath_sentinel.cpp:136-138,163-181 JustDied DoTransferAbility SPELL_TRANSFER_POWER 2400; :225-243 SharePowers casts the ability + SPELL_HEAL_BRETHEN 26565 on the buddy',
    }],
  },
  cites: [
    'mob_anubisath_sentinel.cpp:36-247 whole npc_anubisath_sentinelAI',
    'mob_anubisath_sentinel.cpp:53 MAX_BUDDY 4 (five bodies incl. self); :78 the nine-ability pool',
    'mob_anubisath_sentinel.cpp:95-110 EnterEvadeMode respawns fallen buddies — no host verb, left out',
  ],
};

// The Defender re-randomises on every AGGRO, not on spawn: one reflect, one of Meteor/Plague, one of
// Thunderclap/Shadow Storm, and a summon slot that re-rolls on EVERY fire (so that one rotates).
export const MOB_ANUBISATH_DEFENDER: ScriptDevIR = {
  name: 'mob_anubisath_defender',
  boundCreatures: [15277],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/mob_anubisath_sentinel.cpp',
  spellIds: [8269, 25698, 26555, 26556, 26558, 26554, 13022, 19595, 17430, 17431],
  timers: [
    t('defender_reflect', 13022, 0, 0, 0, 0, 'self', 'mob_anubisath_sentinel.cpp:293-294 Aggro urand(0,1) FIRE_ARCANE_REFLECT 13022 / SHADOW_FROST_REFLECT 19595, CAST_TRIGGERED', {
      onReset: true,
      pickPerSpawnSpellIds: [13022, 19595],
    }),
    // Aggro picks ONE of the pair and arms only that action, so the two rows are one slot with a pool.
    // Meteor takes a random PLAYER, Plague takes SELECT_FLAG_SKIP_TANK.
    t('defender_meteor_plague', 26558, 6000, 10_000, 8000, 12_000, 'hostile_random', 'mob_anubisath_sentinel.cpp:296-299,332-349 urand(0,1) METEOR 26558 (SELECT_FLAG_PLAYER) / PLAGUE 26556 (SKIP_TANK), 6-10s then 8-12s', {
      select: { playerOnly: true },
      pickPerSpawnSpellIds: [26558, 26556],
    }),
    t('defender_clap_storm', 26554, 5000, 8000, 6000, 10_000, 'self', 'mob_anubisath_sentinel.cpp:301-304,350-361 urand(0,1) THUNDERCLAP 26554 / SHADOW_STORM 26555 (nullptr target), 5-8s then 6-10s', {
      pickPerSpawnSpellIds: [26554, 26555],
    }),
    // This one really is per-fire: the urand sits inside ExecuteAction, so it re-rolls each cast.
    t('defender_summon', 17430, 3000, 5000, 12_000, 16_000, 'self', 'mob_anubisath_sentinel.cpp:283,362-376 ANUBDEFENDER_SUMMON 3-5s then 12-16s, urand(0,1) SWARMGUARD 17430 / WARRIOR 17431 per fire', {
      rotateSpellIds: [17430, 17431],
      waveMinCount: 1,
      waveMaxCount: 1,
    }),
    t('defender_hp_check', 8269, 1000, 1000, 0, 0, 'self', 'mob_anubisath_sentinel.cpp:277,312-330 HP_CHECK <10 % urand(0,1) ENRAGE 8269 / EXPLODE 25698, then DisableCombatAction', {
      hpPctMax: 9,
      oneShot: true,
      pickPerSpawnSpellIds: [8269, 25698],
      actions: [{ kind: 'flavor', text: 'goes into a frenzy!', cite: 'mob_anubisath_sentinel.cpp:320 DoScriptText(EMOTE_GENERIC_FRENZY 2384)' }],
    }),
  ],
  cites: [
    'mob_anubisath_sentinel.cpp:249-380 whole npc_anubisath_defenderAI',
    'mob_anubisath_sentinel.cpp:288-306 Aggro re-randomises the four abilities every pull',
    'mob_anubisath_sentinel.cpp:290 RemoveAllAuras on aggro — no host verb, left out',
  ],
};

export const AT_TEMPLE_AHNQIRAJ: ScriptDevIR = {
  name: 'at_temple_ahnqiraj',
  boundCreatures: [],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/temple_of_ahnqiraj.cpp',
  spellIds: [],
  timers: [],
  cites: ['temple_of_ahnqiraj.cpp:476 AreaTrigger_at_temple_ahnqiraj — C\'Thun room / twins intro'],
};

export const EVENT_CTHUN_RESET: ScriptDevIR = {
  name: 'event_cthun_reset',
  boundCreatures: [],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/temple_of_ahnqiraj.cpp',
  spellIds: [26257],
  timers: [],
  cites: ['temple_of_ahnqiraj.cpp:481 event_cthun_reset — SPELL_RESET_ENCOUNTER 26257'],
};

export const INSTANCE_TEMPLE_OF_AHNQIRAJ: ScriptDevIR = {
  name: 'instance_temple_of_ahnqiraj',
  boundCreatures: [],
  sourceFile: 'kalimdor/temple_of_ahnqiraj/temple_of_ahnqiraj.cpp',
  spellIds: [],
  timers: [],
  // Every slot that has a creature, not just the four bosses whose kits are ported: the instance
  // table is state, and a raid that clears Viscidus must record it even without a freeze verb.
  encounters: [
    { creatureEntry: NPC.SKERAM, field: TYPE.SKERAM, cite: 'temple_of_ahnqiraj.h:12 TYPE_SKERAM' },
    { creatureEntry: 15511, field: TYPE.BUG_TRIO, cite: 'temple_of_ahnqiraj.h:13 TYPE_BUG_TRIO (Lord Kri 15511 is the primary)' },
    { creatureEntry: NPC.SARTURA, field: TYPE.SARTURA, cite: 'temple_of_ahnqiraj.h:14 TYPE_SARTURA' },
    { creatureEntry: NPC.FANKRISS, field: TYPE.FANKRISS, cite: 'temple_of_ahnqiraj.h:15 TYPE_FANKRISS' },
    { creatureEntry: 15299, field: TYPE.VISCIDUS, cite: 'temple_of_ahnqiraj.h:16 TYPE_VISCIDUS' },
    { creatureEntry: NPC.HUHURAN, field: TYPE.HUHURAN, cite: 'temple_of_ahnqiraj.h:17 TYPE_HUHURAN' },
    { creatureEntry: NPC.VEKNILASH, field: TYPE.TWINS, cite: "temple_of_ahnqiraj.h:18 TYPE_TWINS (Vek'nilash 15275 is the primary)" },
    { creatureEntry: NPC.OURO, field: TYPE.OURO, cite: 'temple_of_ahnqiraj.h:19 TYPE_OURO' },
    { creatureEntry: NPC.CTHUN, field: TYPE.CTHUN, cite: "temple_of_ahnqiraj.h:20 TYPE_CTHUN" },
  ],
  cites: [
    'temple_of_ahnqiraj.cpp whole file',
    'temple_of_ahnqiraj.h:10-21 MAX_ENCOUNTER 10 - slot 9 is TWINS_INTRO, a pseudo-event',
  ],
};

/** DungeonEncounter.Id → TYPE_* (encounterIndex). Bake type-31 value1s: 715 Twin Emperors, 716 Ouro. */
const DUNGEON_ENCOUNTER_TYPE: Record<number, number> = {
  715: TYPE.TWINS,
  716: TYPE.OURO,
};

/** DungeonEncounter 715 is graph id twin-emperors (Ouro has no graph row). */
const DUNGEON_ENCOUNTER_DEFEATED: Record<number, string> = {
  715: 'twin-emperors',
};

/** True when AQ40 SetData is DONE or the graph encounter is defeated. Cite: Conditions.cpp:402-411. */
export function isCompletedDungeonEncounter(
  run: {
    dungeonId?: string;
    scriptInstanceData?: Record<number, number>;
    defeated?: string[];
  } | null | undefined,
  encounterId: number,
): boolean {
  if (!run || run.dungeonId !== 'temple-of-ahnqiraj') return false;
  const field = DUNGEON_ENCOUNTER_TYPE[encounterId];
  if (field == null) return false;
  if ((run.scriptInstanceData?.[field] ?? 0) === INSTANCE_DATA.DONE) return true;
  const graphId = DUNGEON_ENCOUNTER_DEFEATED[encounterId];
  return graphId != null && (run.defeated ?? []).includes(graphId);
}
