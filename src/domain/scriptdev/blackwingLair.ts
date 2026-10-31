// Blackwing Lair — the ScriptDevAI IR port of all eight encounters, read whole from
// eastern_kingdoms/blackwing_lair. Residuals: Razorgore's orb possess, his death prevention,
// and the whole egg chain (SetData64 / CUSTOM_A / DefenseTimer waves) — operator, 2026-08-29:
// the eggs are scenery until the possess lands as a playable surface.

import { CLASS } from '../../data/schema.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';
import type { ScriptDevIR, ScriptDevTimer } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { NEFARIAN_CLASS_CALL_ACTION } from './classFilter.ts';

// blackwing_lair.h:10-24
const TYPE = {
  RAZORGORE: 0, VAELASTRASZ: 1, LASHLAYER: 2, FIREMAW: 3, EBONROC: 4,
  FLAMEGOR: 5, CHROMAGGUS: 6, NEFARIAN: 7,
  CHROMA_LBREATH: 9, CHROMA_RBREATH: 10,
  // blackwing_lair.h:23-24 — "Not real events: used to store the two random drakonids selection for
  // the instance lifetime".
  NEFA_LTUNNEL: 11, NEFA_RTUNNEL: 12,
} as const;

// blackwing_lair.h:82-86 — the five drakonid spawners the tunnel roll picks between.
const DRAKONID_SPAWNERS = [14307, 14309, 14310, 14311, 14312] as const;

const NPC = {
  RAZORGORE: 12435, VAELASTRASZ: 13020, LASHLAYER: 12017, FIREMAW: 11983,
  EBONROC: 14601, FLAMEGOR: 11981, CHROMAGGUS: 14020, NEFARIAN: 11583,
  BONE_CONSTRUCT: 14605,
} as const;

/** blackwing_lair.h:88-93 — the six drakonid sets whose corpses Nefarian raises. */
const DRAKONID_ENTRIES = [14261, 14262, 14263, 14264, 14265, 14302] as const;
/** blackwing_lair.h:95 MAX_DRAKONID_SUMMONS. */
const MAX_DRAKONID_SUMMONS = 42;

/** Map 469 — BWL. Cite: instance_template / bake dungeonGameObjects maps["469"]. */
export const BWL_MAP_ID = 469;

const t = (
  id: string, spellId: number, iMin: number, iMax: number, rMin: number, rMax: number,
  target: ScriptDevTimer['target'], cite: string, extra: Partial<ScriptDevTimer> = {},
): ScriptDevTimer => ({
  id, spellId, initialMinMs: iMin, initialMaxMs: iMax, repeatMinMs: rMin, repeatMaxMs: rMax,
  target, cite, ...extra,
});

function lifecycleFor(field: number, file: string) {
  return {
    onAggro: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.IN_PROGRESS, cite: `${file} Aggro SetData(IN_PROGRESS)` }],
    onDeath: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.DONE, cite: `${file} JustDied SetData(DONE)` }],
    onEvade: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.FAIL, cite: `${file} JustReachedHome SetData(FAIL)` }],
  };
}

/** The three drakes share one kit and differ by exactly one ability. */
const DRAKE_SHARED = (file: string): ScriptDevTimer[] => [
  t('shadow_flame', 22539, 18_000, 18_000, 15_000, 18_000, 'self', `${file} SHADOW_FLAME 18s then 15-18s`),
  t('wing_buffet', 23339, 30_000, 30_000, 30_000, 35_000, 'self', `${file} WING_BUFFET 30s then 30-35s`),
  t('thrash', 3391, 6000, 6000, 2000, 6000, 'self', `${file} THRASH 6s then 2-6s`),
];

export const BOSS_RAZORGORE: ScriptDevIR = {
  name: 'boss_razorgore',
  boundCreatures: [NPC.RAZORGORE],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_razorgore.cpp',
  spellIds: [23023, 22425, 24375, 19632, 18943],
  timers: [
    t('double_attack', 18943, 0, 0, 0, 0, 'self', 'boss_razorgore.cpp:85 Reset DOUBLE_ATTACK AURA_NOT_PRESENT|TRIGGERED', { onReset: true }),
    t('conflagration', 23023, 10_000, 15_000, 15_000, 25_000, 'self', 'boss_razorgore.cpp:63,119-123 10-15s then 15-25s'),
    t('fireball_volley', 22425, 15_000, 20_000, 15_000, 20_000, 'self', 'boss_razorgore.cpp:64,125-129 15-20s then 15-20s'),
    t('war_stomp', 24375, 30_000, 30_000, 30_000, 30_000, 'self', 'boss_razorgore.cpp:65,131-135 30s flat'),
    t('cleave', 19632, 4000, 8000, 4000, 8000, 'victim', 'boss_razorgore.cpp:66,137-141 4-8s'),
  ],
  lifecycle: {
    // JustDied DONE unconditionally: the cpp waits for SPECIAL (last egg), but the whole egg
    // chain is a residual with the orb possess, so nothing holds his death off (operator, 2026-08-29).
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE.RAZORGORE,
        value: INSTANCE_DATA.DONE,
        cite: 'blackwing_lair.cpp:391-396 JustDied DONE',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE.RAZORGORE,
        value: INSTANCE_DATA.FAIL,
        cite: 'boss_razorgore.cpp:109-112 JustReachedHome FAIL',
      },
    ],
  },
  cites: [
    'boss_razorgore.cpp:25-325 whole file',
    'boss_razorgore.cpp:67,83 Reset SetDeathPrevention not armed (worklist 838)',
    'blackwing_lair.cpp:327-367,574-619 egg chain + DefenseTimer waves deliberately not ported'
      + ' with the orb possess (operator, 2026-08-29) — eggs are scenery, no adds spawn',
  ],
};

export const BOSS_VAELASTRASZ: ScriptDevIR = {
  name: 'boss_vaelastrasz',
  boundCreatures: [NPC.VAELASTRASZ],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_vaelastrasz.cpp',
  spellIds: [23513, 18173, 23620, 23461, 23462, 15847, 19983],
  timers: [
    // The two Burning Adrenalines are a PAIR: one nails the tank on a 45 s clock, one
    // takes a random mana user every 15 s. Porting only one halves the encounter.
    t('burning_adrenaline_tank', 18173, 45_000, 45_000, 45_000, 45_000, 'victim', 'boss_vaelastrasz.cpp:86,289-293 BURNING_ADRENALINE_TANK on GetVictim(), 45s'),
    t('burning_adrenaline', 23620, 15_000, 15_000, 15_000, 15_000, 'hostile_random_mana', 'boss_vaelastrasz.cpp:87,295-301 RANDOM|PLAYER|POWER_MANA, 15s', { select: { playerOnly: true, powerMana: true } }),
    t('flame_breath', 23461, 11_000, 11_000, 4000, 8000, 'victim', 'boss_vaelastrasz.cpp:88,302-307 11s then urand(4-8)s'),
    t('fire_nova', 23462, 5000, 5000, 5000, 5000, 'self', 'boss_vaelastrasz.cpp:89,308-313 5s flat'),
    t('cleave', 19983, 8000, 8000, 15_000, 15_000, 'victim', 'boss_vaelastrasz.cpp:90,314-319 8s then 15s'),
    t('tail_sweep', 15847, 20_000, 20_000, 20_000, 20_000, 'self', 'boss_vaelastrasz.cpp:91,320-325 20s flat'),
  ],
  phases: [
    {
      // AddTimerlessCombatAction + SetActionReadyStatus(false) — fires once under 15%.
      phase: 1,
      hpBelowPct: 15,
      actions: [
        { kind: 'yell', textId: -1469029, cite: 'boss_vaelastrasz.cpp:35,282-286 SAY_HALFLIFE -1469029' },
      ],
      cite: 'boss_vaelastrasz.cpp:85,280-288 VAEL_LOW_HP_YELL GetHealthPercent() < 15.0f',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'set_health_pct',
        pct: 30,
        cite: 'boss_vaelastrasz.cpp:115 Reset SetHealth(uint32(GetMaxHealth()*.3))',
      },
    ],
    onAggro: [
      {
        kind: 'set_instance_data',
        field: TYPE.VAELASTRASZ,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'boss_vaelastrasz.cpp:149-150 Aggro SetData(IN_PROGRESS)',
      },
      {
        kind: 'cast_on_group',
        spellId: 23513,
        cite: 'boss_vaelastrasz.cpp:152-153 Aggro DoCastSpellIfCan(nullptr, SPELL_ESSENCE_OF_THE_RED 23513)',
      },
    ],
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE.VAELASTRASZ,
        value: INSTANCE_DATA.DONE,
        cite: 'boss_vaelastrasz.cpp:156-159 JustDied SetData(DONE)',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE.VAELASTRASZ,
        value: INSTANCE_DATA.FAIL,
        cite: 'boss_vaelastrasz.cpp:162-165 JustReachedHome SetData(FAIL)',
      },
    ],
    onKill: [
      {
        kind: 'yell',
        textId: -1469030,
        urandInclusiveMax: 4,
        cite: 'boss_vaelastrasz.cpp:139-145 KilledUnit if (urand(0,4)) return; SAY_KILLTARGET -1469030',
      },
    ],
  },
  cites: [
    'boss_vaelastrasz.cpp:1-406 whole file',
    'boss_vaelastrasz.cpp:115 Reset SetHealth(max*.3) via set_health_pct',
    'boss_vaelastrasz.cpp:153 SPELL_ESSENCE_OF_THE_RED 23513 cast_on_group; spell-data.json restore_power x3',
    'boss_vaelastrasz.cpp:139-145 KilledUnit urand(0,4) SAY_KILLTARGET -1469030',
    'boss_vaelastrasz.cpp:178-247 HandleIntro (Nefarius summon / technicians fleeing) - chrome, '
      + 'the floor pull is the gossip surface (BWL_VAEL)',
  ],
};

export const BOSS_BROODLORD: ScriptDevIR = {
  name: 'boss_broodlord',
  boundCreatures: [NPC.LASHLAYER],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_broodlord_lashlayer.cpp',
  spellIds: [15284, 18670, 23331, 24573],
  timers: [
    t('cleave', 15284, 8000, 8000, 7000, 7000, 'victim', 'boss_broodlord_lashlayer.cpp:~48,~90 8s then 7s'),
    t('knock_away', 18670, 12_000, 12_000, 15_000, 30_000, 'victim', 'boss_broodlord_lashlayer.cpp:~49,~96 12s then 15-30s'),
    t('blast_wave', 23331, 20_000, 20_000, 8000, 16_000, 'self', 'boss_broodlord_lashlayer.cpp:~50,~102 20s then 8-16s'),
    t('mortal_strike', 24573, 30_000, 30_000, 25_000, 35_000, 'victim', 'boss_broodlord_lashlayer.cpp:~51,~108 30s then 25-35s'),
  ],
  lifecycle: lifecycleFor(TYPE.LASHLAYER, 'boss_broodlord_lashlayer.cpp'),
  cites: ['boss_broodlord_lashlayer.cpp:25-130 whole file'],
};

export const BOSS_FIREMAW: ScriptDevIR = {
  name: 'boss_firemaw',
  boundCreatures: [NPC.FIREMAW],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_firemaw.cpp',
  spellIds: [22539, 23339, 23341, 3391],
  timers: [
    ...DRAKE_SHARED('boss_firemaw.cpp'),
    // Flame Buffet is Firemaw's own: a stacking debuff on everyone in melee every 5 s.
    t('flame_buffet', 23341, 5000, 5000, 5000, 5000, 'self', 'boss_firemaw.cpp:~48,~85 FLAME_BUFFET 5s flat'),
  ],
  lifecycle: lifecycleFor(TYPE.FIREMAW, 'boss_firemaw.cpp'),
  cites: ['boss_firemaw.cpp:25-110 whole file'],
};

export const BOSS_EBONROC: ScriptDevIR = {
  name: 'boss_ebonroc',
  boundCreatures: [NPC.EBONROC],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_ebonroc.cpp',
  // Shadow of Ebonroc 23340 heals him through 23394; a trigger payload resolves off the kit.
  spellIds: [22539, 23339, 23340, 3391, 23394],
  timers: [
    ...DRAKE_SHARED('boss_ebonroc.cpp'),
    // Shadow of Ebonroc heals him for what he hits — the tank-swap ability (PLAN §6).
    t('shadow_of_ebonroc', 23340, 45_000, 45_000, 25_000, 35_000, 'victim', 'boss_ebonroc.cpp:~46,~80 45s then 25-35s'),
  ],
  lifecycle: lifecycleFor(TYPE.EBONROC, 'boss_ebonroc.cpp'),
  cites: ['boss_ebonroc.cpp:25-110 whole file'],
};

export const BOSS_FLAMEGOR: ScriptDevIR = {
  name: 'boss_flamegor',
  boundCreatures: [NPC.FLAMEGOR],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_flamegor.cpp',
  // Frenzy 23342 pays through Fire Nova 23462; a trigger payload resolves off the kit.
  spellIds: [22539, 23339, 23342, 3391, 23462],
  timers: [
    ...DRAKE_SHARED('boss_flamegor.cpp'),
    t('frenzy', 23342, 10_000, 10_000, 10_000, 15_000, 'self', 'boss_flamegor.cpp:~46,~80 FRENZY 10s then 10-15s'),
  ],
  lifecycle: lifecycleFor(TYPE.FLAMEGOR, 'boss_flamegor.cpp'),
  cites: ['boss_flamegor.cpp:25-110 whole file'],
};

const CHROMA_LEFT = [
  { id: 'breath_left_frost', spellId: 23187, cite: 'blackwing_lair.cpp:629 8446 -> 23187 Frost Burn' },
  { id: 'breath_left_incinerate', spellId: 23308, cite: 'blackwing_lair.cpp:630 8447 -> 23308 Incinerate' },
  { id: 'breath_left_lapse', spellId: 23310, cite: 'blackwing_lair.cpp:631 8448 -> 23310 Time Lapse' },
  { id: 'breath_left_acid', spellId: 23313, cite: 'blackwing_lair.cpp:632 8449 -> 23313 Corrosive Acid' },
  { id: 'breath_left_ignite', spellId: 23315, cite: 'blackwing_lair.cpp:633 8450 -> 23315 Ignite Flesh' },
] as const;
const CHROMA_RIGHT = [
  { id: 'breath_right_frost', spellId: 23189, cite: 'blackwing_lair.cpp:635 8451 -> 23189 Frost Burn' },
  { id: 'breath_right_incinerate', spellId: 23309, cite: 'blackwing_lair.cpp:636 8452 -> 23309 Incinerate' },
  { id: 'breath_right_lapse', spellId: 23312, cite: 'blackwing_lair.cpp:637 8453 -> 23312 Time Lapse' },
  { id: 'breath_right_acid', spellId: 23314, cite: 'blackwing_lair.cpp:638 8454 -> 23314 Corrosive Acid' },
  { id: 'breath_right_ignite', spellId: 23316, cite: 'blackwing_lair.cpp:639 8455 -> 23316 Ignite Flesh' },
] as const;

export const BOSS_CHROMAGGUS: ScriptDevIR = {
  name: 'boss_chromaggus',
  boundCreatures: [NPC.CHROMAGGUS],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_chromaggus.cpp',
  // 22277-22281 must be on the kit: applySpell trigger_spell looks up the payload there.
  // Cite: SpellEffects.cpp:822 elemshields[]; combatEnemySpec.ts:94 IR spellIds.
  spellIds: [
    22276, 22277, 22278, 22279, 22280, 22281, 23173, 23128, 23537, 23195,
    23187, 23308, 23310, 23313, 23315, 23189, 23309, 23312, 23314, 23316, 9204
  ],
  timers: [
    // 23195's whole job is the roll, and nothing was writing the two fields the ten breath rows
    // below gate on — so Chromaggus breathed NOTHING. The pair is always two different schools.
    t('breath_selection', 23195, 0, 0, 0, 0, 'self', 'boss_chromaggus.cpp:60 DoCastSpellIfCan SPELL_BREATH_SELECTION; SpellEffects.cpp:993-1010', {
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      actions: [{
        kind: 'roll_instance_pair',
        leftField: TYPE.CHROMA_LBREATH,
        rightField: TYPE.CHROMA_RBREATH,
        leftValues: CHROMA_LEFT.map((b) => b.spellId),
        rightValues: CHROMA_RIGHT.map((b) => b.spellId),
        cite: 'SpellEffects.cpp:998-1008 rightBreath = urand(0,4), leftBreath = (right + urand(1,4)) % 5, events 8446-8455; blackwing_lair.cpp:622-654 InitiateBreath sets each field only while NOT_STARTED',
      }],
    }),
    // The rotating school immunity is what makes the fight a DPS-halt puzzle (PLAN §6).
    t('elemental_shield', 22276, 0, 0, 45_000, 45_000, 'self', 'boss_chromaggus.cpp:~60,~120 ELEMENTAL_SHIELD at 0 then 45s'),
    t('brood_affliction', 23173, 7000, 7000, 7000, 7000, 'self', 'boss_chromaggus.cpp:~63,~140 BROOD_AFFLICTION 7s flat'),
    t('frenzy', 23128, 15_000, 15_000, 15_000, 15_000, 'self', 'boss_chromaggus.cpp:~64,~146 FRENZY 15s flat'),
    ...CHROMA_LEFT.map((b) => t(
      b.id, b.spellId, 30_000, 30_000, 60_000, 60_000, 'self',
      `boss_chromaggus.cpp:68,120-123 BREATH_LEFT 30s then 60s; ${b.cite}`,
      { gate: { field: TYPE.CHROMA_LBREATH, equals: b.spellId, cite: b.cite } },
    )),
    ...CHROMA_RIGHT.map((b) => t(
      b.id, b.spellId, 60_000, 60_000, 60_000, 60_000, 'self',
      `boss_chromaggus.cpp:69,126-129 BREATH_RIGHT 60s then 60s; ${b.cite}`,
      { gate: { field: TYPE.CHROMA_RBREATH, equals: b.spellId, cite: b.cite } },
    )),
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 20,
      actions: [
        { kind: 'cast_self', spellId: 23537, cite: 'boss_chromaggus.cpp:~112 GetHealthPercent() < 20.0f → SPELL_ENRAGE' },
        { kind: 'flavor', text: 'enrages.', cite: 'boss_chromaggus.cpp:~110-114 CHROMAGGUS_ENRAGE timerless' },
      ],
      cite: 'boss_chromaggus.cpp:~110-114 enrage below 20 % HP',
    },
  ],
  lifecycle: lifecycleFor(TYPE.CHROMAGGUS, 'boss_chromaggus.cpp'),
  cites: [
    'boss_chromaggus.cpp:25-260 whole file',
    'SpellEffects.cpp:993-1010 23195 urand pair via roll_instance_pair; blackwing_lair.cpp:622-654 InitiateBreath; boss_chromaggus.cpp:60,68-69,120-129',
  ],
};

/** One CombatAI class-call arm. Cite: boss_nefarian.cpp:204,266-285 DoCastSpellIfCan(nullptr). */
const nefClassCall = (
  id: string,
  spellId: number,
  classId: number,
  textId: number,
  cite: string,
): ScriptDevTimer => t(
  id, spellId, 35_000, 35_000, 35_000, 40_000, 'self', cite,
  {
    select: { playerOnly: true, classId },
    classCallGroup: NEFARIAN_CLASS_CALL_ACTION,
    actions: [{ kind: 'yell', textId, cite }],
  },
);

export const BOSS_NEFARIAN: ScriptDevIR = {
  name: 'boss_nefarian',
  boundCreatures: [NPC.NEFARIAN],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_nefarian.cpp',
  // Double Attack, Shadow Flame and the class calls all pay through triggers, resolved off the kit.
  spellIds: [
    22539, 22686, 22687, 19983, 23364, 19818, 22992,
    23410, 23397, 23398, 23401, 23418, 23425, 23427, 23436, 23414, 18941, 22986, 22972, 22978, 22981, 23603, 23402, 23415,
    23362
  ],
  timers: [
    t('double_attack', 19818, 0, 0, 0, 0, 'self', 'boss_nefarian.cpp:117 JustRespawned DOUBLE_ATTACK', { onReset: true }),
    t('shadow_flame_passive', 22992, 0, 0, 0, 0, 'self', 'boss_nefarian.cpp:118 JustRespawned SHADOW_FLAME_PASSIVE', { onReset: true }),
    t('shadow_flame', 22539, 12_000, 12_000, 12_000, 12_000, 'self', 'boss_nefarian.cpp:199,235-236 HandleAttackStart 12s then CAST_OK 12s'),
    t('bellowing_roar', 22686, 30_000, 30_000, 30_000, 30_000, 'self', 'boss_nefarian.cpp:200,241-242 HandleAttackStart 30s then CAST_OK 30s'),
    t('veil_of_shadow', 22687, 15_000, 15_000, 15_000, 15_000, 'victim', 'boss_nefarian.cpp:201,247-248 HandleAttackStart 15s then CAST_OK 15s'),
    t('cleave', 19983, 7000, 7000, 7000, 7000, 'victim', 'boss_nefarian.cpp:202,253-254 HandleAttackStart 7s then CAST_OK 7s'),
    t('tail_lash', 23364, 10_000, 10_000, 10_000, 10_000, 'self', 'boss_nefarian.cpp:203,259-260 HandleAttackStart 10s then CAST_OK 10s'),
    // NEFARIAN_CLASS_CALL picks a RANDOM PLAYER, switches on getClass() and casts, then resets the
    // action to urand(35000,40000). Cite: boss_nefarian.cpp:204 first arm 35000; :263-287.
    nefClassCall('class_call_warrior', 23397, CLASS.WARRIOR, -1469014, 'boss_nefarian.cpp:64,272 SPELL_WARRIOR 23397 SAY_WARRIOR -1469014'),
    nefClassCall('class_call_paladin', 23418, CLASS.PALADIN, -1469017, 'boss_nefarian.cpp:67,273 SPELL_PALADIN 23418 SAY_PALADIN -1469017'),
    nefClassCall('class_call_hunter', 23436, CLASS.HUNTER, -1469020, 'boss_nefarian.cpp:70,274 SPELL_HUNTER 23436 SAY_HUNTER -1469020'),
    nefClassCall('class_call_rogue', 23414, CLASS.ROGUE, -1469021, 'boss_nefarian.cpp:71,275 SPELL_ROGUE 23414 SAY_ROGUE -1469021'),
    nefClassCall('class_call_priest', 23401, CLASS.PRIEST, -1469016, 'boss_nefarian.cpp:66,276 SPELL_PRIEST 23401 SAY_PRIEST -1469016'),
    nefClassCall('class_call_shaman', 23425, CLASS.SHAMAN, -1469018, 'boss_nefarian.cpp:68,277 SPELL_SHAMAN 23425 SAY_SHAMAN -1469018'),
    nefClassCall('class_call_mage', 23410, CLASS.MAGE, -1469013, 'boss_nefarian.cpp:63,278 SPELL_MAGE 23410 SAY_MAGE -1469013'),
    nefClassCall('class_call_warlock', 23427, CLASS.WARLOCK, -1469019, 'boss_nefarian.cpp:69,279 SPELL_WARLOCK 23427 SAY_WARLOCK -1469019'),
    nefClassCall('class_call_druid', 23398, CLASS.DRUID, -1469015, 'boss_nefarian.cpp:65,280 SPELL_DRUID 23398 SAY_DRUID -1469015'),
  ],
  phases: [
    {
      // Phase 3 at 20 %: he raises every dead drakonid on the floor.
      phase: 1,
      hpBelowPct: 20,
      actions: [
        { kind: 'yell', textId: -1469010, cite: 'boss_nefarian.cpp:38,219 SAY_RAISE_SKELETONS -1469010' },
        { kind: 'cast_self', spellId: 23362, cite: 'boss_nefarian.cpp:216 DoCastSpellIfCan(nullptr, SPELL_RAISE_DRAKONID 23362)' },
        // The raise scales with how many drakonids the raid killed in phase 2 — that corpse count IS
        // the mechanic, so it reads the enemy block rather than summoning a fixed wave.
        {
          kind: 'raise_corpses',
          fromEntries: [...DRAKONID_ENTRIES],
          creatureEntry: NPC.BONE_CONSTRUCT,
          maxCount: MAX_DRAKONID_SUMMONS,
          cite: 'blackwing_lair.h:88-95 the six drakonid entries + MAX_DRAKONID_SUMMONS 42; boss_nefarian.cpp:73,150-153 NPC_BONE_CONSTRUCT 14605',
        },
      ],
      cite: 'boss_nefarian.cpp:211-222 GetHealthPercent() < 20.0f',
    },
    {
      phase: 2,
      hpBelowPct: 5,
      actions: [
        { kind: 'yell', textId: -1469008, cite: 'boss_nefarian.cpp:36,224-230 NEFARIAN_LOW_HP_YELL <5% SAY_XHEALTH -1469008' },
      ],
      cite: 'boss_nefarian.cpp:224-230 GetHealthPercent() < 5.0f',
    },
  ],
  lifecycle: lifecycleFor(TYPE.NEFARIAN, 'boss_nefarian.cpp'),
  cites: [
    'boss_nefarian.cpp:33-300 whole file',
    'boss_nefarian.cpp:63-71,204,263-289 nine class-call spells via select.classId + classCallGroup 7',
    'Spell.cpp:8003-8040 OnCheckTarget getClass() gate on those nine spell ids',
    'boss_nefarian.cpp:211-222 SPELL_RAISE_DRAKONID 23362 via raise_corpses over the dead drakonid seats',
  ],
};

export const GO_SUPPRESSION: ScriptDevIR = {
  name: 'go_suppression',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackwing_lair/blackwing_lair.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'blackwing_lair.cpp go_suppression — suppression device GO; no combat timer',
  ],
};

export const EVENT_WEEKLY_CHROMATIC_SELECTION: ScriptDevIR = {
  name: 'event_weekly_chromatic_selection',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackwing_lair/blackwing_lair.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'blackwing_lair.cpp event_weekly_chromatic_selection — the per-instance chromatic roll now lands through the breath_selection row on Chromaggus himself (roll_instance_pair into TYPE_CHROMA_L/RBREATH), because 23195 is what the C++ casts and this event id is only its delivery',
  ],
};

export const NPC_BLACKWING_ORB: ScriptDevIR = {
  name: 'npc_blackwing_orb',
  boundCreatures: [14449],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_razorgore.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'boss_razorgore.cpp npc_blackwing_orb — Dragon Orb mind-control of Razorgore; control-transfer GAP (module header)',
  ],
};

export const EVENT_RAZORGORE_POSSESS: ScriptDevIR = {
  name: 'event_razorgore_possess',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_razorgore.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'boss_razorgore.cpp event_razorgore_possess — AI_EVENT_CUSTOM_A egg/possess chain; control-transfer GAP',
  ],
};

export const AT_VAELASTRASZ: ScriptDevIR = {
  name: 'at_vaelastrasz',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_vaelastrasz.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'boss_vaelastrasz.cpp AreaTrigger_at_vaelastrasz — starts the gossip/intro; no combat body',
  ],
};

export const BOSS_VICTOR_NEFARIUS: ScriptDevIR = {
  name: 'boss_victor_nefarius',
  boundCreatures: [10162],
  sourceFile: 'eastern_kingdoms/blackwing_lair/boss_victor_nefarius.cpp',
  spellIds: [22663, 22664, 22665, 22666, 22667, 22677, 22678, 23343],
  timers: [
    t('shadowbolt', 22677, 3000, 3000, 2000, 4000, 'hostile_random_player', 'boss_victor_nefarius.cpp:86 AddCombatAction 3s; :155-157 CAST_OK urand(2-4)s RANDOM PLAYER', { select: { playerOnly: true } }),
    t('fear', 22678, 8000, 8000, 10_000, 20_000, 'hostile_random_not_top_player', 'boss_victor_nefarius.cpp:87 AddCombatAction 8s; :162-164 CAST_OK urand(10-20)s skip-tank PLAYER', { select: { playerOnly: true, skipTopThreat: true } }),
    t('shadowbolt_volley', 22665, 13_000, 13_000, 19_000, 28_000, 'self', 'boss_victor_nefarius.cpp:88 AddCombatAction 13s; :169-170 CAST_OK urand(19-28)s'),
    t('silence', 22666, 23_000, 23_000, 14_000, 23_000, 'hostile_random_player', 'boss_victor_nefarius.cpp:89 AddCombatAction 23s; :175-177 CAST_OK urand(14-23)s RANDOM PLAYER', { select: { playerOnly: true } }),
    t('shadow_command', 22667, 30_000, 30_000, 24_000, 30_000, 'hostile_random_not_top_player', 'boss_victor_nefarius.cpp:90 AddCombatAction 30s; :182-184 CAST_OK urand(24-30)s skip-tank PLAYER', { select: { playerOnly: true, skipTopThreat: true } }),
    t('shadowblink', 22664, 40_000, 40_000, 30_000, 40_000, 'self', 'boss_victor_nefarius.cpp:91 AddCombatAction 40s; :189-190 CAST_OK urand(30-40)s'),
  ],
  lifecycle: {
    onReset: [
      { kind: 'cast_self', spellId: 22663, cite: 'boss_victor_nefarius.cpp:126 DoCastSpellIfCan SPELL_NEFARIUS_BARRIER CAST_TRIGGERED after intro (armed here so the immunity exists when combat starts)' },
      // 23343's whole job, and the same distinct-pair roll as Chromaggus's breaths: which two of the
      // five drakonid spawners feed the tunnels for this instance's lifetime.
      {
        kind: 'roll_instance_pair',
        leftField: TYPE.NEFA_LTUNNEL,
        rightField: TYPE.NEFA_RTUNNEL,
        leftValues: [...DRAKONID_SPAWNERS],
        rightValues: [...DRAKONID_SPAWNERS],
        cite: 'boss_victor_nefarius.cpp:83-84 SPELL_TUNNEL_SELECTION 23343; SpellEffects.cpp:1012-1029 rightDrakonid = urand(0,4), leftDrakonid = (right + urand(1,4)) % 5, events 8520-8529; blackwing_lair.cpp:657-691 InitiateDrakonid sets each field only while NOT_STARTED',
      },
    ],
    onAggro: [
      { kind: 'set_instance_data', field: TYPE.NEFARIAN, value: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_victor_nefarius.cpp:109-110 Aggro SetData(TYPE_NEFARIAN, IN_PROGRESS)' },
    ],
    onEvade: [
      { kind: 'set_instance_data', field: TYPE.NEFARIAN, value: INSTANCE_DATA.FAIL, cite: 'boss_victor_nefarius.cpp:115-116 JustReachedHome SetData(FAIL)' },
    ],
  },
  gossipHello: {
    defaultTextId: 7134,
    cite: 'boss_victor_nefarius.cpp:206-213 GossipHello GOSSIP_TEXT_NEFARIUS_1 7134',
  },
  cites: [
    'boss_victor_nefarius.cpp:17-230 whole file',
    'boss_victor_nefarius.cpp:83-84 SPELL_TUNNEL_SELECTION 23343 picks the two drakonid tunnels via roll_instance_pair into TYPE_NEFA_L/RTUNNEL',
    'blackwing_lair.cpp:657-691 InitiateDrakonid maps events 8520-8529 to the five spawners 14307/14309/14310/14311/14312; the SPAWNERS themselves are a residual - nothing here reads the two fields yet to place them',
  ],
};

export const INSTANCE_BLACKWING_LAIR: ScriptDevIR = {
  name: 'instance_blackwing_lair',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackwing_lair/blackwing_lair.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    { creatureEntry: NPC.RAZORGORE, field: TYPE.RAZORGORE, cite: 'blackwing_lair.h:12' },
    { creatureEntry: NPC.VAELASTRASZ, field: TYPE.VAELASTRASZ, cite: 'blackwing_lair.h:13' },
    { creatureEntry: NPC.LASHLAYER, field: TYPE.LASHLAYER, cite: 'blackwing_lair.h:14' },
    { creatureEntry: NPC.FIREMAW, field: TYPE.FIREMAW, cite: 'blackwing_lair.h:15' },
    { creatureEntry: NPC.EBONROC, field: TYPE.EBONROC, cite: 'blackwing_lair.h:16' },
    { creatureEntry: NPC.FLAMEGOR, field: TYPE.FLAMEGOR, cite: 'blackwing_lair.h:17' },
    { creatureEntry: NPC.CHROMAGGUS, field: TYPE.CHROMAGGUS, cite: 'blackwing_lair.h:18' },
    { creatureEntry: NPC.NEFARIAN, field: TYPE.NEFARIAN, cite: 'blackwing_lair.h:19' },
  ],
  cites: [
    'blackwing_lair.cpp whole file',
    'blackwing_lair.h:10-24 MAX_ENCOUNTER 13 - slots 8-12 are QUEST_SCEPTER + the two per-instance random pairs, not bosses',
    'blackwing_lair.cpp:129-130,327-367 egg GUID list + SetData64 last-egg SPECIAL',
    'blackwing_lair.cpp:574-619 DefenseTimer add waves - GAP (named in file header)',
  ],
};
