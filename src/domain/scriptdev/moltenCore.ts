// Molten Core — the ScriptDevAI IR port of all ten encounters plus the encounter-critical adds,
// read whole from eastern_kingdoms/molten_core. Named residuals: Garr's add-leash and the gossip.

import type { ScriptDevIR, ScriptDevTimer } from './types.ts';
import { AI_EVENT, INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// molten_core.h:10-21
const TYPE = {
  LUCIFRON: 0, MAGMADAR: 1, GEHENNAS: 2, GARR: 3, SHAZZRAH: 4,
  GEDDON: 5, GOLEMAGG: 6, SULFURON: 7, MAJORDOMO: 8, RAGNAROS: 9,
} as const;

const NPC = {
  LUCIFRON: 12118, MAGMADAR: 11982, GEHENNAS: 12259, GARR: 12057, SHAZZRAH: 12264,
  GEDDON: 12056, GOLEMAGG: 11988, SULFURON: 12098, MAJORDOMO: 12018, RAGNAROS: 11502,
  FLAMEWAKER_PROTECTOR: 12119, FLAMEWAKER: 11661, FIRESWORN: 12099, CORE_RAGER: 11672,
  FLAMEWAKER_PRIEST: 11662, FLAMEWAKER_HEALER: 11663, FLAMEWAKER_ELITE: 11664,
} as const;

/** Every MC boss reports the same three lifecycle states. Cite: each boss's Aggro / JustDied / JustReachedHome. */
function lifecycleFor(field: number, file: string, evadeValue: number = INSTANCE_DATA.FAIL) {
  return {
    onAggro: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.IN_PROGRESS, cite: `${file} Aggro SetData(IN_PROGRESS)` }],
    onDeath: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.DONE, cite: `${file} JustDied SetData(DONE)` }],
    onEvade: [{ kind: 'set_instance_data' as const, field, value: evadeValue, cite: `${file} JustReachedHome SetData(${evadeValue === INSTANCE_DATA.FAIL ? 'FAIL' : 'NOT_STARTED'})` }],
  };
}

const t = (
  id: string, spellId: number, iMin: number, iMax: number, rMin: number, rMax: number,
  target: ScriptDevTimer['target'], cite: string, extra: Partial<ScriptDevTimer> = {},
): ScriptDevTimer => ({
  id, spellId, initialMinMs: iMin, initialMaxMs: iMax, repeatMinMs: rMin, repeatMaxMs: rMax,
  target, cite, ...extra,
});

// boss_lucifron
export const BOSS_LUCIFRON: ScriptDevIR = {
  name: 'boss_lucifron',
  boundCreatures: [NPC.LUCIFRON],
  sourceFile: 'eastern_kingdoms/molten_core/boss_lucifron.cpp',
  spellIds: [19702, 19703, 19460],
  timers: [
    t('impending_doom', 19702, 5000, 10_000, 20_000, 25_000, 'self', 'boss_lucifron.cpp:47,88 AddCombatAction 5-10s, re-arm 20-25s'),
    t('lucifrons_curse', 19703, 10_000, 15_000, 20_000, 25_000, 'self', 'boss_lucifron.cpp:48,94 AddCombatAction 10-15s, re-arm 20-25s'),
    t('shadow_shock', 19460, 3000, 6000, 3000, 6000, 'victim', 'boss_lucifron.cpp:49,100 AddCombatAction 3-6s, re-arm 3-6s'),
  ],
  lifecycle: lifecycleFor(TYPE.LUCIFRON, 'boss_lucifron.cpp'),
  cites: ['boss_lucifron.cpp:25-110 whole file'],
};

// boss_magmadar
export const BOSS_MAGMADAR: ScriptDevIR = {
  name: 'boss_magmadar',
  boundCreatures: [NPC.MAGMADAR],
  sourceFile: 'eastern_kingdoms/molten_core/boss_magmadar.cpp',
  // 20494 / 20495 / 19428 are the lava-bomb chain: 19411 and 20474 resolve to the summons, which
  // drop GO 177704 casting 19428, so all three have to be in the kit for the payload to resolve.
  spellIds: [19451, 19449, 19408, 19411, 20474, 20494, 20495, 19428],
  timers: [
    // Magma Spit is a self-buff re-applied on Reset, not a timed ability.
    t('magma_spit', 19449, 0, 0, 0, 0, 'self', 'boss_magmadar.cpp:62 Reset DoCastSpellIfCan(MAGMASPIT, TRIGGERED|AURA_NOT_PRESENT)', { onReset: true }),
    t('frenzy', 19451, 30_000, 30_000, 15_000, 20_000, 'self', 'boss_magmadar.cpp:47,86-92 30s then 15-20s'),
    t('panic', 19408, 6000, 10_000, 30_000, 35_000, 'self', 'boss_magmadar.cpp:48,96 6-10s then 30-35s'),
    // Two lava bombs, split by power type: the non-mana one and the mana one.
    t('lava_bomb', 19411, 12_000, 12_000, 12_000, 15_000, 'hostile_random', 'boss_magmadar.cpp:49,102-107 SELECT_FLAG_POWER_NOT_MANA'),
    t('lava_bomb_mana', 20474, 18_000, 18_000, 12_000, 15_000, 'hostile_random_mana', 'boss_magmadar.cpp:50,110-115 SELECT_FLAG_POWER_MANA', { select: { powerMana: true } }),
  ],
  lifecycle: lifecycleFor(TYPE.MAGMADAR, 'boss_magmadar.cpp', INSTANCE_DATA.NOT_STARTED),
  cites: ['boss_magmadar.cpp:25-125 whole file'],
};

// boss_gehennas
export const BOSS_GEHENNAS: ScriptDevIR = {
  name: 'boss_gehennas',
  boundCreatures: [NPC.GEHENNAS],
  sourceFile: 'eastern_kingdoms/molten_core/boss_gehennas.cpp',
  spellIds: [19716, 19717, 19729, 19728],
  timers: [
    t('gehennas_curse', 19716, 5000, 10_000, 25_000, 30_000, 'self', 'boss_gehennas.cpp:44,79 5-10s then 25-30s'),
    t('rain_of_fire', 19717, 6000, 12_000, 6000, 12_000, 'hostile_random', 'boss_gehennas.cpp:45,85-89 RANDOM|PLAYER', { select: { playerOnly: true } }),
    t('shadow_bolt_random', 19729, 3000, 6000, 3000, 6000, 'hostile_random', 'boss_gehennas.cpp:46,93-97 RANDOM|PLAYER', { select: { playerOnly: true } }),
    t('shadow_bolt_target', 19728, 3000, 6000, 3000, 6000, 'victim', 'boss_gehennas.cpp:47,101 GetVictim()'),
  ],
  lifecycle: lifecycleFor(TYPE.GEHENNAS, 'boss_gehennas.cpp'),
  cites: ['boss_gehennas.cpp:25-115 whole file'],
};

// boss_garr (+ mob_firesworn)
export const BOSS_GARR: ScriptDevIR = {
  name: 'boss_garr',
  boundCreatures: [NPC.GARR],
  sourceFile: 'eastern_kingdoms/molten_core/boss_garr.cpp',
  spellIds: [19492, 19496, 20482, 23487, 19516],
  timers: [
    t('anti_magic_pulse', 19492, 10_000, 15_000, 15_000, 20_000, 'self', 'boss_garr.cpp:53,90 10-15s then 15-20s'),
    t('magma_shackles', 19496, 5000, 10_000, 10_000, 15_000, 'self', 'boss_garr.cpp:54,96 5-10s then 10-15s'),
    // 6 minutes to the first Massive Eruption, then every 20 s. The long arm is the point:
    // it is the soft enrage that ends a stalled Garr, not an opener.
    t('massive_eruption', 20482, 360_000, 360_000, 20_000, 20_000, 'self', 'boss_garr.cpp:55,102-108 6*MINUTE then 20s', {
      actions: [{
        kind: 'cast_on_script_targets',
        spellId: 20482,
        cite: 'boss_garr.cpp:102-108 SPELL_ERUPTION_TRIGGER 20482 targetA 38 + spell_script_target 12099',
      }],
    }),
  ],
  spellHits: [{
    spellId: 19515,
    actions: [{
      kind: 'cast_self',
      spellId: 19516,
      castFlags: CAST_FLAG.TRIGGERED,
      cite: 'boss_garr.cpp:82-85 SpellHit SPELL_ENRAGE_TRIGGER 19515 → SPELL_ENRAGE 19516 CAST_TRIGGERED',
    }],
    cite: 'boss_garr.cpp:82-85 SpellHit SPELL_ENRAGE_TRIGGER',
  }],
  lifecycle: (() => {
    const life = lifecycleFor(TYPE.GARR, 'boss_garr.cpp');
    return {
      ...life,
      onAggro: [
        ...life.onAggro,
        {
          kind: 'cast_self' as const,
          spellId: 23487,
          castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
          cite: 'boss_garr.cpp:73-76 Aggro SPELL_SEPARATION_ANXIETY 23487 CAST_TRIGGERED|CAST_AURA_NOT_PRESENT',
        },
      ],
    };
  })(),
  cites: [
    'boss_garr.cpp:25-175 whole file',
    'boss_garr.cpp:73-76 Aggro SPELL_SEPARATION_ANXIETY 23487 CAST_TRIGGERED|AURA_NOT_PRESENT',
    'boss_garr.cpp:82-85 SpellHit 19515 → 19516; :102-108 20482 script-targets Firesworn',
  ],
};

export const MOB_FIRESWORN: ScriptDevIR = {
  name: 'mob_firesworn',
  boundCreatures: [NPC.FIRESWORN],
  sourceFile: 'eastern_kingdoms/molten_core/boss_garr.cpp',
  spellIds: [8876, 15733, 19497, 19515, 20483],
  timers: [
    t('thrash', 8876, 0, 0, 0, 0, 'self', 'boss_garr.cpp:135 Reset THRASH TRIGGERED|AURA_NOT_PRESENT', { onReset: true }),
    t('immolate', 15733, 0, 0, 0, 0, 'self', 'boss_garr.cpp:136 Reset IMMOLATE TRIGGERED|AURA_NOT_PRESENT', { onReset: true }),
  ],
  spellHits: [{
    spellId: 20482,
    actions: [{
      kind: 'cast_self',
      spellId: 20483,
      cite: 'boss_garr.cpp:147-150 SpellHit SPELL_ERUPTION_TRIGGER 20482 → SPELL_MASSIVE_ERUPTION 20483',
    }],
    cite: 'boss_garr.cpp:147-150 SpellHit SPELL_ERUPTION_TRIGGER',
  }],
  lifecycle: {
    onDeath: [
      { kind: 'cast_self', spellId: 19497, cite: 'boss_garr.cpp:141-142 JustDied DoCastSpellIfCan(SPELL_ERUPTION)' },
      {
        kind: 'cast_on_script_targets',
        spellId: 19515,
        castFlags: CAST_FLAG.TRIGGERED,
        cite: 'boss_garr.cpp:145 JustDied SPELL_ENRAGE_TRIGGER 19515 CAST_TRIGGERED; spell_script_target 12057',
      },
      { kind: 'flavor', text: 'erupts as it dies!', cite: 'boss_garr.cpp:139-145 JustDied' },
    ],
  },
  cites: ['boss_garr.cpp:130-150 mob_fireswornAI'],
};

// boss_shazzrah
export const BOSS_SHAZZRAH: ScriptDevIR = {
  name: 'boss_shazzrah',
  boundCreatures: [NPC.SHAZZRAH],
  sourceFile: 'eastern_kingdoms/molten_core/boss_shazzrah.cpp',
  spellIds: [19712, 19713, 19714, 19715, 23138],
  timers: [
    t('arcane_explosion', 19712, 6000, 6000, 5000, 9000, 'self', 'boss_shazzrah.cpp:47,93 6s then 5-9s'),
    t('shazzrah_curse', 19713, 10_000, 10_000, 20_000, 20_000, 'self', 'boss_shazzrah.cpp:48,99 10s then 20s'),
    t('counterspell', 19715, 15_000, 15_000, 16_000, 20_000, 'self', 'boss_shazzrah.cpp:49,105 15s then 16-20s'),
    t('magic_grounding', 19714, 24_000, 24_000, 35_000, 35_000, 'self', 'boss_shazzrah.cpp:50,111 24s then 35s'),
    // Dummy 23138 picks a player and they cast 23139 on him; then SendAIEvent CUSTOM_A.
    t('gate_of_shazzrah', 23138, 30_000, 30_000, 45_000, 45_000, 'self', 'boss_shazzrah.cpp:51,117-122 30s then 45s', {
      actions: [{
        kind: 'send_ai_event',
        eventType: AI_EVENT.CUSTOM_A,
        receiver: 'self',
        cite: 'SpellEffects.cpp:910-933 case 23138 SendAIEvent(AI_EVENT_CUSTOM_A, m_caster, m_caster)',
      }],
    }),
  ],
  receiveAiEvents: [
    {
      eventType: AI_EVENT.CUSTOM_A,
      actions: [
        { kind: 'reset_threat', cite: 'boss_shazzrah.cpp:84 DoResetThreat' },
        { kind: 'cast_self', spellId: 19712, cite: 'boss_shazzrah.cpp:85 DoCastSpellIfCan(nullptr, SPELL_ARCANE_EXPLOSION)' },
      ],
      cite: 'boss_shazzrah.cpp:80-87 ReceiveAIEvent CUSTOM_A (successful teleport)',
    },
  ],
  lifecycle: lifecycleFor(TYPE.SHAZZRAH, 'boss_shazzrah.cpp', INSTANCE_DATA.NOT_STARTED),
  cites: [
    'boss_shazzrah.cpp:25-130 whole file',
    'SpellEffects.cpp:910-933 Gate dummy SendAIEvent CUSTOM_A to caster; boss_shazzrah.cpp:80-87 ReceiveAIEvent → DoResetThreat then AE',
  ],
};

// boss_baron_geddon
export const BOSS_BARON_GEDDON: ScriptDevIR = {
  name: 'boss_baron_geddon',
  boundCreatures: [NPC.GEDDON],
  sourceFile: 'eastern_kingdoms/molten_core/boss_baron_geddon.cpp',
  spellIds: [19695, 19659, 20475, 20478],
  timers: [
    t('inferno', 19695, 45_000, 45_000, 45_000, 45_000, 'self', 'boss_baron_geddon.cpp:35,84 45s flat'),
    t('ignite_mana', 19659, 30_000, 30_000, 30_000, 30_000, 'self', 'boss_baron_geddon.cpp:36,90 30s flat'),
    t('living_bomb', 20475, 35_000, 35_000, 35_000, 35_000, 'hostile_random', 'boss_baron_geddon.cpp:37,96-100 RANDOM|PLAYER, 35s', { select: { playerOnly: true } }),
  ],
  phases: [
    {
      // ARMAGEDDON is a suicide at 2 % that must kill the raid — a timerless action
      // gated purely on health, so it maps to an HP phase, not a timer.
      phase: 1,
      hpBelowPct: 2,
      actions: [
        { kind: 'cast_self', spellId: 20478, cite: 'boss_baron_geddon.cpp:70-79 GetHealthPercent() <= 2.0f → SPELL_ARMAGEDDON' },
        { kind: 'flavor', text: 'begins to glow white-hot - Armageddon!', cite: 'boss_baron_geddon.cpp:74 DoScriptText(EMOTE_SERVICE)' },
      ],
      cite: 'boss_baron_geddon.cpp:66-80 GEDDON_ARMAGEDDON timerless at <=2 % HP, fires once',
    },
  ],
  lifecycle: lifecycleFor(TYPE.GEDDON, 'boss_baron_geddon.cpp', INSTANCE_DATA.NOT_STARTED),
  cites: ['boss_baron_geddon.cpp:25-120 whole file'],
};

// boss_golemagg (+ mob_core_rager)
export const BOSS_GOLEMAGG: ScriptDevIR = {
  name: 'boss_golemagg',
  boundCreatures: [NPC.GOLEMAGG],
  sourceFile: 'eastern_kingdoms/molten_core/boss_golemagg.cpp',
  spellIds: [13879, 20228, 19798, 20556, 18943],
  timers: [
    t('magma_splash', 13879, 0, 0, 0, 0, 'self', 'boss_golemagg.cpp:64 Reset MAGMA_SPLASH TRIGGERED|AURA_NOT_PRESENT', { onReset: true }),
    t('double_attack', 18943, 0, 0, 0, 0, 'self', 'boss_golemagg.cpp:65 Reset DOUBLE_ATTACK', { onReset: true }),
    // Golemagg's Trust is the aura that keeps the Core Ragers alive — without it the
    // adds are ordinary trash, so it is not optional chrome.
    t('golemagg_trust', 20556, 0, 0, 0, 0, 'self', 'boss_golemagg.cpp:66 Reset GOLEMAGG_TRUST', { onReset: true }),
    t('pyroblast', 20228, 7000, 7000, 7000, 7000, 'hostile_random', 'boss_golemagg.cpp:50,109-113 RANDOM|PLAYER, 7s', { select: { playerOnly: true } }),
    // Earthquake is disabled until the <=10 % enrage flips it on — phase 1 only.
    t('earthquake', 19798, 0, 0, 3000, 3000, 'self', 'boss_golemagg.cpp:51,100,117 armed disabled; enrage ResetCombatAction(EARTHQUAKE, 0), then 3s', { phase: 1 }),
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 10,
      actions: [
        { kind: 'flavor', text: 'enrages - the ground begins to shake!', cite: 'boss_golemagg.cpp:95-102 GOLEMAGG_ENRAGE at <=10 % starts Earthquake' },
      ],
      cite: 'boss_golemagg.cpp:95-102 GetHealthPercent() > 10.0f gate → ResetCombatAction(EARTHQUAKE, 0)',
    },
  ],
  lifecycle: {
    ...lifecycleFor(TYPE.GOLEMAGG, 'boss_golemagg.cpp'),
    onDeath: [
      ...lifecycleFor(TYPE.GOLEMAGG, 'boss_golemagg.cpp').onDeath!,
      {
        kind: 'send_ai_event',
        eventType: AI_EVENT.CUSTOM_A,
        receiver: 'creature_entry',
        creatureEntry: NPC.CORE_RAGER,
        radiusYd: 100,
        cite: 'boss_golemagg.cpp:73-84 JustDied GetCreatureListWithEntryInGrid(NPC_CORE_RAGER, 100.0f) SendAIEvent CUSTOM_A',
      },
    ],
  },
  cites: [
    'boss_golemagg.cpp:25-200 whole file',
    'boss_golemagg.cpp:73-84 JustDied SendAIEvent CUSTOM_A to living Core Ragers',
  ],
};

export const MOB_CORE_RAGER: ScriptDevIR = {
  name: 'mob_core_rager',
  boundCreatures: [NPC.CORE_RAGER],
  sourceFile: 'eastern_kingdoms/molten_core/boss_golemagg.cpp',
  spellIds: [12787, 19820, 17683, 3617],
  timers: [
    t('thrash', 12787, 0, 0, 0, 0, 'self', 'boss_golemagg.cpp:~160 Reset THRASH TRIGGERED|AURA_NOT_PRESENT', { onReset: true }),
    t('mangle', 19820, 7000, 7000, 10_000, 10_000, 'victim', 'boss_golemagg.cpp:~155,175 7s then 10s'),
  ],
  phases: [
    {
      // Full Heal below 50 % is why Golemagg must die first — the adds are unkillable
      // while his Trust aura is up. Dropping it would invert the encounter.
      phase: 1,
      hpBelowPct: 50,
      actions: [
        { kind: 'cast_self', spellId: 17683, cite: 'boss_golemagg.cpp:~168 CORE_RAGER_HEAL GetHealthPercent() > 50 gate → SPELL_FULL_HEAL' },
        { kind: 'flavor', text: 'is healed to full by Golemagg’s Trust!', cite: 'boss_golemagg.cpp:~170 DoScriptText(EMOTE_LOW_HP)' },
      ],
      cite: 'boss_golemagg.cpp:~165-172 timerless heal at <=50 % HP',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'set_death_prevention',
        enabled: true,
        cite: 'boss_golemagg.cpp:147 ctor SetDeathPrevention(true)',
      },
    ],
  },
  receiveAiEvents: [
    {
      eventType: AI_EVENT.CUSTOM_A,
      senderEntry: NPC.GOLEMAGG,
      actions: [
        { kind: 'cast_self', spellId: 3617, cite: 'boss_golemagg.cpp:162-163 DoCastSpellIfCan(SPELL_QUIET_SUICIDE, CAST_TRIGGERED)' },
      ],
      cite: 'boss_golemagg.cpp:159-163 ReceiveAIEvent CUSTOM_A from Golemagg → Quiet Suicide',
    },
  ],
  cites: [
    'boss_golemagg.cpp:~145-185 mob_core_ragerAI',
    'boss_golemagg.cpp:147 ctor SetDeathPrevention(true), cleared only by the CUSTOM_A Quiet Suicide 3617 (INSTAKILL bypasses the 1 HP clamp)',
  ],
};

// boss_sulfuron_harbinger (+ mob_flamewaker_priest)
export const BOSS_SULFURON: ScriptDevIR = {
  name: 'boss_sulfuron',
  boundCreatures: [NPC.SULFURON],
  sourceFile: 'eastern_kingdoms/molten_core/boss_sulfuron_harbinger.cpp',
  spellIds: [19778, 19779, 19780, 19781],
  timers: [
    t('demoralizing_shout', 19778, 15_000, 15_000, 15_000, 20_000, 'self', 'boss_sulfuron_harbinger.cpp:47,88 15s then 15-20s'),
    // Inspire goes on a friendly MISSING it within 45 yd, which in practice is his priests, and only
    // falls back to himself when none is. Self-only meant the priests never got it.
    t('inspire', 19779, 3000, 3000, 10_000, 10_000, 'friendly_missing_buff', 'boss_sulfuron_harbinger.cpp:48,94-109 DoFindFriendlyMissingBuff(45.0f, SPELL_INSPIRE, false) random of the list else m_creature, ResetCombatAction 10000', {
      friendlyRadiusYd: 45,
      friendlyFallbackSelf: true,
    }),
    t('hand_of_ragnaros', 19780, 6000, 6000, 12_000, 15_000, 'self', 'boss_sulfuron_harbinger.cpp:49,113 6s then 12-15s'),
    t('flame_spear', 19781, 2000, 2000, 12_000, 16_000, 'hostile_random', 'boss_sulfuron_harbinger.cpp:50,119-124 RANDOM|PLAYER, 12-16s', { select: { playerOnly: true } }),
  ],
  lifecycle: lifecycleFor(TYPE.SULFURON, 'boss_sulfuron_harbinger.cpp'),
  cites: [
    'boss_sulfuron_harbinger.cpp:25-200 whole file',
    'boss_sulfuron_harbinger.cpp:94-109 Inspire via friendly_missing_buff at 45 yd with the self fallback',
  ],
};

export const MOB_FLAMEWAKER_PRIEST: ScriptDevIR = {
  name: 'mob_flamewaker_priest',
  boundCreatures: [NPC.FLAMEWAKER_PRIEST],
  sourceFile: 'eastern_kingdoms/molten_core/boss_sulfuron_harbinger.cpp',
  spellIds: [19777, 19775, 19776, 20294],
  timers: [
    t('dark_strike', 19777, 10_000, 10_000, 15_000, 18_000, 'victim', 'boss_sulfuron_harbinger.cpp:~150,175 10s then 15-18s'),
    // Dark Mending on the LOWEST-hp friendly within 60 yd, which is why the priests have to be
    // killed or interrupted first; self-only made it a different encounter.
    t('dark_mending', 19775, 15_000, 30_000, 15_000, 20_000, 'self', 'boss_sulfuron_harbinger.cpp:143,158-167 DoSelectLowestHpFriendly(60.0f, 1) then SPELL_HEAL 19775, ResetCombatAction urand(15000,20000)', {
      friendlyLowestHpYd: 60,
      friendlyHpDeficit: 1,
    }),
    t('shadow_word_pain', 19776, 2000, 2000, 18_000, 26_000, 'hostile_random', 'boss_sulfuron_harbinger.cpp:~152,188-192 RANDOM|PLAYER', { select: { playerOnly: true } }),
    t('immolate', 20294, 8000, 8000, 15_000, 25_000, 'hostile_random', 'boss_sulfuron_harbinger.cpp:~153,195-199 RANDOM|PLAYER', { select: { playerOnly: true } }),
  ],
  cites: [
    'boss_sulfuron_harbinger.cpp:135-205 mob_flamewaker_priestAI',
    'boss_sulfuron_harbinger.cpp:158-167 Dark Mending via friendlyLowestHpYd 60 / friendlyHpDeficit 1 (DoSelectLowestHpFriendly)',
  ],
};

// boss_majordomo_executus
export const BOSS_MAJORDOMO: ScriptDevIR = {
  name: 'boss_majordomo',
  boundCreatures: [NPC.MAJORDOMO],
  sourceFile: 'eastern_kingdoms/molten_core/boss_majordomo_executus.cpp',
  // 21086/21087/21090: SummonedCreatureJustDied script-target casts (spell_script_target).
  spellIds: [20619, 21075, 20620, 20618, 20534, 21094, 21086, 21087, 21090],
  timers: [
    t('aegis', 20620, 5000, 5000, 25_000, 30_000, 'self', 'boss_majordomo_executus.cpp:95,~250 AEGIS 5s then 25-30s, TRIGGERED|AURA_NOT_PRESENT'),
    // One of the two reflection shields at random. The product puts the damage one on the timer and
    // the magic one on the alternate slot rather than inventing a coin flip; both share 30 s.
    t('damage_reflection', 21075, 15_000, 15_000, 30_000, 30_000, 'self', 'boss_majordomo_executus.cpp:92,~225 urand(0,1) DAMAGE/MAGIC reflection, 30s'),
    t('magic_reflection', 20619, 30_000, 30_000, 30_000, 30_000, 'self', 'boss_majordomo_executus.cpp:92,~225 the other half of the same coin flip'),
    t('teleport_victim', 20534, 15_000, 15_000, 25_000, 30_000, 'victim', 'boss_majordomo_executus.cpp:93,~232 TELEPORT_TARGET on victim, 25-30s'),
    t('teleport_random', 20618, 30_000, 30_000, 25_000, 30_000, 'hostile_random', 'boss_majordomo_executus.cpp:94,~242 TELEPORT_RANDOM, 25-30s'),
  ],
  lifecycle: {
    onAggro: [
      { kind: 'set_instance_data', field: TYPE.MAJORDOMO, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_majordomo_executus.cpp:~132 SetData(TYPE_MAJORDOMO, IN_PROGRESS)' },
      { kind: 'flavor', text: 'Executus shields himself - kill his Flamewakers.', cite: 'boss_majordomo_executus.cpp:~124-132 Aggro AEGIS + SEPARATION_ANXIETY' },
    ],
    // Reset()/ctor SetDeathPrevention(true): he is UNKILLABLE, and the retreat below is the
    // only way his encounter can end. Cite: boss_majordomo_executus.cpp:96.
    onReset: [
      { kind: 'set_death_prevention', enabled: true, cite: 'boss_majordomo_executus.cpp:96 SetDeathPrevention(true)' },
    ],
    onEvade: [{ kind: 'set_instance_data', field: TYPE.MAJORDOMO, value: INSTANCE_DATA.FAIL, cite: 'boss_majordomo_executus.cpp:~140 JustReachedHome FAIL' }],
  },
  // SummonedCreatureJustDied over the eight Flamewakers. This is the encounter's ONLY win
  // condition: at eight dead he walks home, turns friendly and writes DONE.
  addDeaths: [
    {
      creatureEntries: [NPC.FLAMEWAKER_HEALER, NPC.FLAMEWAKER_ELITE],
      atKilled: 'half',
      total: 8,
      actions: [
        // spell_script_target 21087 → entry 11663 only. Cite: cpp:239-240; spell_script_target.
        { kind: 'cast_on_script_targets', spellId: 21087, cite: 'boss_majordomo_executus.cpp:239-240 IMMUNE_POLY at half the adds dead' },
      ],
      cite: 'boss_majordomo_executus.cpp:238-240',
    },
    {
      creatureEntries: [NPC.FLAMEWAKER_HEALER, NPC.FLAMEWAKER_ELITE],
      atKilled: 'allButOne',
      total: 8,
      actions: [
        { kind: 'yell', textId: -1409019, cite: 'boss_majordomo_executus.cpp:228 SAY_LAST_ADD' },
        // TARGET_UNIT_SCRIPT_NEAR_CASTER 38 → nearest living Flamewaker. Cite: cpp:229.
        { kind: 'cast_on_script_targets', spellId: 21090, cite: 'boss_majordomo_executus.cpp:229 SPELL_CHAMPION onto the last add' },
      ],
      cite: 'boss_majordomo_executus.cpp:226-230',
    },
    {
      creatureEntries: [NPC.FLAMEWAKER_HEALER, NPC.FLAMEWAKER_ELITE],
      atKilled: 'all',
      total: 8,
      actions: [
        { kind: 'set_instance_data', field: TYPE.MAJORDOMO, value: INSTANCE_DATA.DONE, cite: 'boss_majordomo_executus.cpp:158 JustReachedHome SetData(TYPE_MAJORDOMO, DONE)' },
        // CombatStop + friendly faction + immune to players: the pull is over and the raid won,
        // which is exactly what `stop_combat` (attackOnly omitted) means in this IR.
        { kind: 'stop_combat', cite: 'boss_majordomo_executus.cpp:232-235 m_bHasEncounterFinished + MoveTargetedHome; :145-160 JustReachedHome CombatStop/SetFactionTemporary(FACTION_MAJORDOMO_FRIENDLY)' },
      ],
      cite: 'boss_majordomo_executus.cpp:231-236',
    },
    {
      // Every death except the finishing return: buff remaining adds (stackAmount 10).
      creatureEntries: [NPC.FLAMEWAKER_HEALER, NPC.FLAMEWAKER_ELITE],
      atKilled: 'every',
      total: 8,
      actions: [
        { kind: 'cast_on_script_targets', spellId: 21086, cite: 'boss_majordomo_executus.cpp:243 SPELL_ENCOURAGEMENT on remaining adds' },
      ],
      cite: 'boss_majordomo_executus.cpp:242-243',
    },
  ],
  cites: [
    'boss_majordomo_executus.cpp:25-320 whole file',
    'boss_majordomo_executus.cpp:96 SetDeathPrevention(true) - he cannot be killed; the 8 adds end the fight',
    'boss_majordomo_executus.cpp:217-245 SummonedCreatureJustDied add counter + ENCOURAGEMENT/CHAMPION/IMMUNE_POLY',
    'molten_core.cpp:29-39,243 the 8 adds and their spawn points',
    'boss_majordomo_executus.cpp:243 SPELL_ENCOURAGEMENT 21086 via spell_script_target 11663/11664',
  ],
};

// boss_ragnaros
export const BOSS_RAGNAROS: ScriptDevIR = {
  name: 'boss_ragnaros',
  boundCreatures: [NPC.RAGNAROS],
  sourceFile: 'eastern_kingdoms/molten_core/boss_ragnaros.cpp',
  spellIds: [20566, 20563, 20565, 21387, 21154, 21908, 19818],
  timers: [
    t('melt_weapon', 21387, 0, 0, 0, 0, 'self', 'boss_ragnaros.cpp:~118 Reset MELT_WEAPON TRIGGERED|AURA_NOT_PRESENT', { onReset: true }),
    t('elemental_fire', 20563, 0, 0, 0, 0, 'self', 'boss_ragnaros.cpp:~119 Reset ELEMENTAL_FIRE TRIGGERED|AURA_NOT_PRESENT', { onReset: true }),
    t('wrath_of_ragnaros', 20566, 30_000, 30_000, 25_000, 25_000, 'self', 'boss_ragnaros.cpp:56,~215 30s then 25s (+SAY_WRATH)', { phase: 0 }),
    t('might_of_ragnaros', 21154, 11_000, 11_000, 11_000, 30_000, 'hostile_random_mana', 'boss_ragnaros.cpp:57,~224 RANDOM|POWER_MANA, 11-30s', { select: { powerMana: true }, phase: 0 }),
    // Magma Blast is the "nobody in melee" punish: 2 s poll, 2.5 s between casts once it
    // starts. Without it a raid that loses the tank simply stops taking damage.
    t('magma_blast', 20565, 2000, 2000, 2500, 2500, 'hostile_random', 'boss_ragnaros.cpp:88,308-335 MAGMA_BLAST 2s; CanReachWithMeleeAttack victim → skip, else RANDOM|PLAYER 2.5s', { select: { playerOnly: true }, phase: 0, requireVictimNotInMelee: true }),
    t('lava_burst', 21908, 20_000, 20_000, 5000, 25_000, 'self', 'boss_ragnaros.cpp:59,~272 20s then 5-25s', { phase: 0 }),
  ],
  // THE SUBMERGE CYCLE. Every ability above is DisableCombatAction'd under the lava, which is why
  // they carry phase 0 — the eight Sons of Flame only matter if he is not also hitting the raid.
  timedPhases: [
    {
      id: 'submerge',
      phase: 1,
      afterMs: 180_000,
      next: 'emerge',
      actions: [
        {
          kind: 'summon_count',
          creatureEntry: 12143,
          count: 8,
          cite: 'boss_ragnaros.cpp SPELL_SUMMON_SONS_FLAME 21108 → NB_ADDS_IN_SUBMERGE 8 (NPC_SON_OF_FLAME 12143)',
        },
        {
          kind: 'flavor',
          text: 'sinks into the lava - reinforcements! Eight Sons of Flame rise.',
          cite: 'boss_ragnaros.cpp HandlePhaseTransition PHASE_EMERGED → SAY_REINFORCEMENTS_1/2 + summon',
        },
      ],
      cite: 'boss_ragnaros.cpp:57 AddCombatAction(RAGNAROS_PHASE_TRANSITION, 3*MINUTE); HandlePhaseTransition PHASE_EMERGED',
    },
    {
      id: 'emerge',
      phase: 0,
      // 3000 (SUBMERGING) + 90000 (SUBMERGED) + 500 (EMERGING) — three cited waits, summed.
      afterMs: 93_500,
      next: 'submerge',
      actions: [
        {
          kind: 'flavor',
          text: 'erupts from the lava.',
          cite: 'boss_ragnaros.cpp HandlePhaseTransition PHASE_EMERGING → SPELL_RAGNA_EMERGE 20568',
        },
      ],
      cite: 'boss_ragnaros.cpp HandlePhaseTransition: SUBMERGING ResetCombatAction 3000; SUBMERGED 90*IN_MILLISECONDS; EMERGING 500',
    },
  ],
  lifecycle: {
    onAggro: [{ kind: 'set_instance_data', field: TYPE.RAGNAROS, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_ragnaros.cpp:~152 Aggro SetData(IN_PROGRESS)' }],
    onDeath: [{ kind: 'set_instance_data', field: TYPE.RAGNAROS, value: INSTANCE_DATA.DONE, cite: 'boss_ragnaros.cpp:~143 JustDied SetData(DONE)' }],
    onEvade: [{ kind: 'set_instance_data', field: TYPE.RAGNAROS, value: INSTANCE_DATA.FAIL, cite: 'boss_ragnaros.cpp:~160 EnterEvadeMode SetData(FAIL)' }],
    onKill: [{ kind: 'yell', textId: 7626, cite: 'boss_ragnaros.cpp:37,89 AddOnKillText(SAY_KILL 7626)' }],
  },
  cites: [
    'boss_ragnaros.cpp:25-400 whole file',
    'boss_ragnaros.cpp:HandlePhaseTransition - PORTED as timedPhases (submerge 180s / emerge 93.5s, 8 Sons of Flame)',
  ],
};

// The seven runes. Each is usable only once ITS boss is DONE, and using it sets that boss's slot to
// SPECIAL, which DoSpawnMajordomoIfCan polls. Keyed per GO ENTRY. Cite: molten_core.h:47-53,73-82.
const RUNE: Array<[number, number, string]> = [
  [176956, TYPE.MAGMADAR, 'GO_RUNE_KRESS 176956 -> TYPE_MAGMADAR'],
  [176957, TYPE.GEHENNAS, 'GO_RUNE_MOHN 176957 -> TYPE_GEHENNAS'],
  [176955, TYPE.GARR, 'GO_RUNE_BLAZ 176955 -> TYPE_GARR'],
  [176953, TYPE.SHAZZRAH, 'GO_RUNE_MAZJ 176953 -> TYPE_SHAZZRAH'],
  [176952, TYPE.GEDDON, 'GO_RUNE_ZETH 176952 -> TYPE_GEDDON'],
  [176954, TYPE.GOLEMAGG, 'GO_RUNE_THERI 176954 -> TYPE_GOLEMAGG'],
  [176951, TYPE.SULFURON, 'GO_RUNE_KORO 176951 -> TYPE_SULFURON'],
];

/** Rune GO entries in m_aMoltenCoreRunes order. Cite: molten_core.h:47-53,73-82. */
export const MOLTEN_CORE_RUNE_GO_ENTRIES = RUNE.map(([go]) => go);

/** TYPE_MAGMADAR..TYPE_SULFURON. Cite: molten_core.cpp:212-217; molten_core.h:13-19. */
export const MC_RUNE_BOSS_FIELDS = [
  TYPE.MAGMADAR, TYPE.GEHENNAS, TYPE.GARR, TYPE.SHAZZRAH,
  TYPE.GEDDON, TYPE.GOLEMAGG, TYPE.SULFURON,
] as const;

/** Floor encounter id for 12018. Same string as molten-core.ts boss('majordomo-executus'). */
export const MAJORDOMO_ENCOUNTER_ID = 'majordomo-executus';

/** Same string as MC_FLAGS.runesDoused — spawn unlock after the SPECIAL poll. */
export const MC_RUNES_DOUSED_FLAG = 'mc-runes-doused';

/** Rune GO entry → encounter TYPE. Cite: molten_core.h:73-82 m_aMoltenCoreRunes. */
export function moltenCoreRuneField(goEntry: number): number | undefined {
  const row = RUNE.find(([go]) => go === (goEntry | 0));
  return row ? row[1] : undefined;
}

// Fight / post-DONE summon coords. Cite: molten_core.h:90-93 m_aMajordomoLocations. [0] encounter place;
// [1] near Ragnaros after TYPE_MAJORDOMO DONE.
export const MAJORDOMO_LOCATIONS = [
  { entry: NPC.MAJORDOMO, x: 758.0892, y: -1176.712, z: -118.6403, o: 3.124139 },
  { entry: NPC.MAJORDOMO, x: 848.933, y: -812.875, z: -229.601, o: 4.046 },
] as const;

export interface MajordomoSpawnState {
  /** m_auiEncounter[TYPE_MAJORDOMO]. */
  majordomo: number;
  /** m_auiEncounter[TYPE_RAGNAROS]. */
  ragnaros: number;
  /** GetSingleCreatureFromStorage(NPC_MAJORDOMO) already present. */
  majordomoPresent: boolean;
  // Encounter values for TYPE_MAGMADAR..TYPE_SULFURON (fields 1..7), same loop as `for (uint8 i =
  // TYPE_MAGMADAR; i < TYPE_MAJORDOMO; ++i)`.
  runeBosses: readonly number[];
  /** GetPlayerInMap() non-null. */
  hasPlayer: boolean;
}

export interface MajordomoSpawnResult {
  ok: boolean;
  /** 0 = fight pos, 1 = near Ragnaros. Null when blocked. */
  summonPos: 0 | 1 | null;
  /** `!bByPlayerEnter` — yell SAY_MAJORDOMO_SPAWN + summon adds when true. */
  initialSummon: boolean;
  creatureEntry: number;
  x: number;
  y: number;
  z: number;
  o: number;
  cite: string;
}

// Port of instance_molten_core::DoSpawnMajordomoIfCan. Cite: molten_core.cpp:202-225; SpawnMajordomo at
// :227-248 uses m_aMajordomoLocations.
export function doSpawnMajordomoIfCan(
  state: MajordomoSpawnState,
  byPlayerEnter: boolean,
): MajordomoSpawnResult {
  const blocked = (
    cite: string,
  ): MajordomoSpawnResult => ({
    ok: false,
    summonPos: null,
    initialSummon: false,
    creatureEntry: 0,
    x: 0,
    y: 0,
    z: 0,
    o: 0,
    cite,
  });

  // cpp:204-206 — both finished → never re-summon
  if (state.majordomo === INSTANCE_DATA.DONE && state.ragnaros === INSTANCE_DATA.DONE) {
    return blocked('molten_core.cpp:204-206 TYPE_MAJORDOMO+TYPE_RAGNAROS DONE → return');
  }
  // cpp:208-210
  if (state.majordomoPresent) {
    return blocked('molten_core.cpp:208-210 NPC_MAJORDOMO already stored → return');
  }
  // cpp:212-217 for (i = TYPE_MAGMADAR; i < TYPE_MAJORDOMO; ++i) != SPECIAL → return
  if (state.runeBosses.length !== 7) {
    return blocked('molten_core.cpp:212-217 runeBosses must be TYPE_MAGMADAR..TYPE_SULFURON (7)');
  }
  for (let i = 0; i < 7; i++) {
    if (state.runeBosses[i] !== INSTANCE_DATA.SPECIAL) {
      return blocked('molten_core.cpp:212-217 m_auiEncounter[TYPE_MAGMADAR..SULFURON] != SPECIAL → return');
    }
  }
  // cpp:219-221
  if (!state.hasPlayer) {
    return blocked('molten_core.cpp:219-221 GetPlayerInMap null → return');
  }

  // cpp:223-224 — DONE Majordomo → near Ragnaros; else fight plateau
  const summonPos: 0 | 1 = state.majordomo === INSTANCE_DATA.DONE ? 1 : 0;
  const loc = MAJORDOMO_LOCATIONS[summonPos]!;
  return {
    ok: true,
    summonPos,
    initialSummon: !byPlayerEnter,
    creatureEntry: loc.entry,
    x: loc.x,
    y: loc.y,
    z: loc.z,
    o: loc.o,
    cite: 'molten_core.cpp:202-225 DoSpawnMajordomoIfCan → SpawnMajordomo; h:90-93',
  };
}

export function majordomoSpawnStateFromStore(
  store: Map<number, number>,
  opts: { majordomoPresent: boolean; hasPlayer: boolean },
): MajordomoSpawnState {
  return {
    majordomo: store.get(TYPE.MAJORDOMO) ?? INSTANCE_DATA.NOT_STARTED,
    ragnaros: store.get(TYPE.RAGNAROS) ?? INSTANCE_DATA.NOT_STARTED,
    majordomoPresent: opts.majordomoPresent,
    runeBosses: MC_RUNE_BOSS_FIELDS.map((f) => store.get(f) ?? INSTANCE_DATA.NOT_STARTED),
    hasPlayer: opts.hasPlayer,
  };
}

/** InstanceRun fields DoSpawnMajordomoIfCan writes (flag + coords + pending 12018). */
export type MajordomoRunPatch = {
  flags?: string[];
  scriptInstanceData?: Record<number, number>;
  scriptPendingSummons?: Array<{
    creatureEntry: number;
    count: number;
    x?: number;
    y?: number;
    z?: number;
    encounterId?: string;
  }>;
  encounterOrigins?: Record<string, { x: number; y: number; z?: number }>;
};

function majordomoAlreadyOut(run: MajordomoRunPatch): boolean {
  return (run.scriptPendingSummons ?? []).some(
    (s) => (s.creatureEntry | 0) === NPC.MAJORDOMO,
  );
}

function persistStoreToRun<T extends MajordomoRunPatch>(run: T, store: Map<number, number>): T {
  const scriptInstanceData: Record<number, number> = {};
  for (const [k, v] of store) scriptInstanceData[k] = v;
  return { ...run, scriptInstanceData };
}

// Host for DoSpawnMajordomoIfCan: stamp mc-runes-doused and queue 12018 at the cited xyz. Cite:
// molten_core.cpp:227-231 SummonCreature(m_aMajordomoLocations).
export function applyMajordomoSpawnToRun<T extends MajordomoRunPatch>(
  run: T,
  store: Map<number, number>,
  opts: { byPlayerEnter: boolean; majordomoPresent?: boolean; hasPlayer?: boolean },
): T {
  const result = doSpawnMajordomoIfCan(
    majordomoSpawnStateFromStore(store, {
      majordomoPresent: opts.majordomoPresent ?? majordomoAlreadyOut(run),
      hasPlayer: opts.hasPlayer !== false,
    }),
    opts.byPlayerEnter,
  );
  if (!result.ok) return run;
  const flags = run.flags ?? [];
  const nextFlags = flags.includes(MC_RUNES_DOUSED_FLAG)
    ? flags
    : [...flags, MC_RUNES_DOUSED_FLAG];
  const origin = { x: result.x, y: result.y, z: result.z };
  const pending = run.scriptPendingSummons ?? [];
  const alreadyQueued = pending.some((s) => (s.creatureEntry | 0) === result.creatureEntry);
  return {
    ...run,
    flags: nextFlags,
    encounterOrigins: {
      ...(run.encounterOrigins ?? {}),
      [MAJORDOMO_ENCOUNTER_ID]: origin,
    },
    scriptPendingSummons: alreadyQueued
      ? pending
      : [
        ...pending,
        {
          creatureEntry: result.creatureEntry,
          count: 1,
          x: result.x,
          y: result.y,
          z: result.z,
          encounterId: MAJORDOMO_ENCOUNTER_ID,
        },
      ],
  };
}

// SetData(uiType, SPECIAL) then DoSpawnMajordomoIfCan(false). Cite: molten_core.cpp:172-174;
// molten_coreScripts.cpp:47-52.
export function applyMoltenCoreRuneSpecial<T extends MajordomoRunPatch>(
  run: T,
  field: number,
): T {
  const store = new Map<number, number>();
  if (run.scriptInstanceData) {
    for (const [k, v] of Object.entries(run.scriptInstanceData)) {
      store.set(Number(k) | 0, (v as number) | 0);
    }
  }
  store.set(field | 0, INSTANCE_DATA.SPECIAL);
  const next = persistStoreToRun(run, store);
  return applyMajordomoSpawnToRun(next, store, { byPlayerEnter: false, hasPlayer: true });
}

/** OnPlayerEnter → DoSpawnMajordomoIfCan(true). Cite: molten_core.cpp:62-65. */
export function applyMajordomoSpawnOnPlayerEnter<T extends MajordomoRunPatch>(run: T): T {
  const store = new Map<number, number>();
  if (run.scriptInstanceData) {
    for (const [k, v] of Object.entries(run.scriptInstanceData)) {
      store.set(Number(k) | 0, (v as number) | 0);
    }
  }
  return applyMajordomoSpawnToRun(run, store, { byPlayerEnter: true, hasPlayer: true });
}

export const GO_MOLTEN_CORE_RUNE: ScriptDevIR = {
  name: 'go_molten_core_rune',
  boundCreatures: [],
  boundGos: RUNE.map(([go]) => go),
  sourceFile: 'eastern_kingdoms/molten_core/molten_coreScripts.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: RUNE.map(([go]) => go),
    perEntry: RUNE.map(([go, field, note]) => ({
      goEntry: go,
      // "if (pInstance->GetData(type) != DONE) return true;" — the rune does nothing
      // until its own boss is dead.
      gates: [{ field, equals: INSTANCE_DATA.DONE, cite: `molten_coreScripts.cpp GetData(${note}) != DONE -> no-op` }],
      actions: [
        { kind: 'set_instance_data', field, value: INSTANCE_DATA.SPECIAL, cite: `molten_coreScripts.cpp SetData(${note}, SPECIAL)` },
        { kind: 'flavor', text: 'The rune goes dark.', cite: 'molten_coreScripts.cpp GOUse_go_molten_core_rune' },
      ],
      cite: `molten_core.h:73-82 m_aMoltenCoreRunes ${note}`,
    })),
    cite: 'molten_coreScripts.cpp:36-70 GOUse_go_molten_core_rune',
  },
  cites: [
    'molten_coreScripts.cpp whole file',
    'molten_core.h:47-53 GO_RUNE_KRESS/MOHN/BLAZ/MAZJ/ZETH/THERI/KORO',
    'molten_core.cpp:172-174 SetData SPECIAL → DoSpawnMajordomoIfCan(false)',
    'molten_core.cpp:202-225 DoSpawnMajordomoIfCan polls all seven for SPECIAL',
  ],
};

export const INSTANCE_MOLTEN_CORE: ScriptDevIR = {
  name: 'instance_molten_core',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/molten_core/molten_core.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    { creatureEntry: NPC.LUCIFRON, field: TYPE.LUCIFRON, cite: 'molten_core.h:12; boss_lucifron.cpp Aggro/JustDied' },
    { creatureEntry: NPC.MAGMADAR, field: TYPE.MAGMADAR, cite: 'molten_core.h:13' },
    { creatureEntry: NPC.GEHENNAS, field: TYPE.GEHENNAS, cite: 'molten_core.h:14' },
    { creatureEntry: NPC.GARR, field: TYPE.GARR, cite: 'molten_core.h:15' },
    { creatureEntry: NPC.SHAZZRAH, field: TYPE.SHAZZRAH, cite: 'molten_core.h:16' },
    { creatureEntry: NPC.GEDDON, field: TYPE.GEDDON, cite: 'molten_core.h:17' },
    { creatureEntry: NPC.GOLEMAGG, field: TYPE.GOLEMAGG, cite: 'molten_core.h:18' },
    { creatureEntry: NPC.SULFURON, field: TYPE.SULFURON, cite: 'molten_core.h:19' },
    { creatureEntry: NPC.MAJORDOMO, field: TYPE.MAJORDOMO, cite: 'molten_core.h:20' },
    { creatureEntry: NPC.RAGNAROS, field: TYPE.RAGNAROS, cite: 'molten_core.h:21' },
  ],
  cites: [
    'molten_core.cpp:40-270 whole file',
    'molten_core.cpp:202-225 DoSpawnMajordomoIfCan — ported as doSpawnMajordomoIfCan()',
    'molten_core.h:90-93 m_aMajordomoLocations; SetData SPECIAL / OnPlayerEnter call doSpawnMajordomoIfCan',
    'molten_core.cpp:162-166 TYPE_MAJORDOMO DONE respawns GO_CACHE_OF_THE_FIRE_LORD 179703 (InstanceDef lootObjects revealedByFlag mc-majordomo-done)',
    'boss_majordomo_executus.cpp:161-173,295-330 gossip StartSummonEvent + SummonCreature NPC_RAGNAROS - GAP; requiresFlag on ragnaros is the floor gate',
  ],
};

export const MOLTEN_CORE_IRS: readonly ScriptDevIR[] = [
  BOSS_LUCIFRON, BOSS_MAGMADAR, BOSS_GEHENNAS, BOSS_GARR, MOB_FIRESWORN,
  BOSS_SHAZZRAH, BOSS_BARON_GEDDON, BOSS_GOLEMAGG, MOB_CORE_RAGER,
  BOSS_SULFURON, MOB_FLAMEWAKER_PRIEST, BOSS_MAJORDOMO, BOSS_RAGNAROS,
  GO_MOLTEN_CORE_RUNE, INSTANCE_MOLTEN_CORE,
];
