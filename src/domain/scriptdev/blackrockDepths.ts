// Blackrock Depths ScriptDev IR ports. Source: the boss_* files, blackrock_depths.cpp and its
// header under scripts/eastern_kingdoms/blackrock_depths. Every value cites file:line below.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Constants — blackrock_depths.h + boss/zone enums

// blackrock_depths.h:10–28
export const BRD_MAX_ENCOUNTER = 13;
export const MAX_RELIC_DOORS = 12;
export const MAX_DWARFS = 7;
export const MAX_DWARF_RUNES = 7;
export const MAX_CRONIES = 3;

export const TYPE_RING_OF_LAW = 1;
export const TYPE_VAULT = 2;
export const TYPE_ROCKNOT = 3;
export const TYPE_TOMB_OF_SEVEN = 4;
export const TYPE_LYCEUM = 5;
export const TYPE_IRON_HALL = 6;
export const TYPE_QUEST_JAIL_BREAK = 7;
export const TYPE_FLAMELASH = 8;
export const TYPE_HURLEY = 9;
export const TYPE_BRIDGE = 10;
export const TYPE_BAR = 11;
export const TYPE_PLUGGER = 12;
export const TYPE_NAGMARA = 13;

// blackrock_depths.h:30–76 NPCs
export const NPC_EMPEROR = 9019;
export const NPC_PRINCESS = 8929;
export const NPC_PRIESTESS = 10076;
export const NPC_HATEREL = 9034;
export const NPC_ANGERREL = 9035;
export const NPC_VILEREL = 9036;
export const NPC_GLOOMREL = 9037;
export const NPC_SEETHREL = 9038;
export const NPC_DOOMREL = 9039;
export const NPC_DOPEREL = 9040;
export const NPC_MAGMUS = 9938;
export const NPC_WATCHER_DOOMGRIP = 9476;
export const NPC_WARBRINGER_CONST = 8905;
export const NPC_LOREGRAIN = 9024;
export const NPC_FIREGUARD_DESTROYER = 8911;
export const NPC_OGRABISI = 9677;
export const NPC_SHILL = 9678;
export const NPC_CREST = 9680;
export const NPC_JAZ = 9681;
export const NPC_TOBIAS = 9679;
export const NPC_DUGHAL = 9022;
export const NPC_PHALANX = 9502;
export const NPC_HURLEY_BLACKBREATH = 9537;
export const NPC_BLACKBREATH_CRONY = 9541;
export const NPC_PLUGGER_SPAZZRING = 9499;
export const NPC_PRIVATE_ROCKNOT = 9503;
export const NPC_MISTRESS_NAGMARA = 9500;
export const NPC_RIBBLY_SCREWSPIGGOT = 9543;
export const NPC_ANVILRAGE_GUARDMAN = 8891;
export const NPC_ANVILRAGE_MEDIC = 8894;
export const NPC_ANVILRAGE_RESERVIST = 8901;
export const NPC_GRIMSTONE = 10096;
export const NPC_MARSHAL_WINDSOR = 9023;
export const NPC_IRONHAND_GUARDIAN = 8982;
export const NPC_BURNING_SPIRIT = 9178;
export const NPC_HIGH_INTERROGATOR_GERSTAHN = 9018;
export const NPC_GENERAL_ANGERFORGE = 9033;
export const NPC_AMBASSADOR_FLAMELASH = 9156;

// GOs — survey + blackrock_depths.h + InstanceDef
export const GO_BAR_DOOR = 170571;
export const GO_TOMB_ENTER = 170576;
export const GO_TOMB_EXIT = 170577;
export const GO_GOLEM_ROOM_N = 170573;
export const GO_GOLEM_ROOM_S = 170574;
export const GO_THRONE_ROOM = 170575;
export const GO_SECRET_DOOR = 174553;
export const GO_CHEST_SEVEN = 169243;
export const GO_ARENA_SPOILS = 181074;
/** Cite: survey E5d; go_bar_beer_keg */
export const GO_THUNDERBREW_LAGER_KEG = 164911;
/** Cite: survey E10; go_shadowforge_brazier pair */
export const GO_SHADOWFORGE_BRAZIER_A = 174744;
export const GO_SHADOWFORGE_BRAZIER_B = 174745;
/** Cite: survey E7; go_relic_coffer_door range 174554–174564 + 174566 */
export const GO_RELIC_COFFER_DOOR = 174554;
/** Cite: survey E5c; go_bar_ale_mug */
export const GO_DARK_IRON_ALE_MUG = 165738;
export const GO_GRIM_GUZZLER_BOAR = 165739;
/** Cite: blackrock_depths.h:107–113 GO_DWARFRUNE_A01..G01; DoSummonSpirit A01+index */
export const GO_DWARFRUNE_A01 = 170578;
export const GO_DWARFRUNE_B01 = 170579;
export const GO_DWARFRUNE_C01 = 170580;
export const GO_DWARFRUNE_D01 = 170581;
export const GO_DWARFRUNE_E01 = 170582;
export const GO_DWARFRUNE_F01 = 170583;
export const GO_DWARFRUNE_G01 = 170584;
/** Ordered A01..G01 — index matches DoSummonSpirit uiIndex. */
export const GO_DWARF_RUNES = [
  GO_DWARFRUNE_A01,
  GO_DWARFRUNE_B01,
  GO_DWARFRUNE_C01,
  GO_DWARFRUNE_D01,
  GO_DWARFRUNE_E01,
  GO_DWARFRUNE_F01,
  GO_DWARFRUNE_G01,
] as const;

// boss_high_interrogator_gerstahn.cpp:30–33
export const SPELL_SHADOWWORDPAIN_GERSTAHN = 14032;
export const SPELL_MANABURN = 14033;
export const SPELL_PSYCHICSCREAM = 13704;
export const SPELL_SHADOWSHIELD = 12040;

// boss_general_angerforge.cpp:30–40
export const EMOTE_ALARM = -1230035;
export const SPELL_FLURRY = 15088;
export const SPELL_ENRAGE = 15097;
export const SPELL_SUNDER_ARMOR = 15572;
export const NPC_ELITE_AMOUNT = 2;
export const NPC_NORMAL_AMOUNT = 8;
/** Cite: boss_general_angerforge.cpp:93 GetHealthPercent() < 30.0f */
export const ANGERFORGE_HP_ALARM = 30;
/** Cite: boss_general_angerforge.cpp:104 m_uiAlarmTimer = 3 * MINUTE * IN_MILLISECONDS */
export const ANGERFORGE_ALARM_REPEAT_MS = 180_000;
// Cite: boss_general_angerforge.cpp:43 aAlarmPoint; :67 GetRandomPoint(..., 1.0f). Leftover:
// ScriptDevSummonWave / summon_count have no xyz (types.ts out of scope).
export const ANGERFORGE_ALARM_POINT = {
  x: 717.343,
  y: 22.116,
  z: -45.4321,
  o: 3.1415,
} as const;

// boss_ambassador_flamelash.cpp:31–35
export const SPELL_FIREBLAST = 15573;
export const SPELL_BURNING_SPIRIT = 13489;
// Buff applied by EffectDummy 13489: unitTarget casts 14744 on self. Cite: SpellEffects.cpp:497-502; bake
// +30 spell_power, stackAmount 50, 180000 ms.
export const SPELL_BURNING_SPIRIT_BUFF = 14744;
/** Cite: blackrock_depths.h:13 MAX_DWARF_RUNES = 7 */
export const FLAMELASH_RUNE_COUNT = 7;
/** Cite: boss_ambassador_flamelash.cpp:53–54 Reset m_uiSpiritTimer[i] = urand(0, 1000) */
export const FLAMELASH_SPIRIT_INITIAL_MAX_MS = 1_000;
/** Cite: boss_ambassador_flamelash.cpp:133 re-arm urand(15000, 30000) */
export const FLAMELASH_SPIRIT_REPEAT_MIN_MS = 15_000;
export const FLAMELASH_SPIRIT_REPEAT_MAX_MS = 30_000;
// ObjectDefines.h CONTACT_DISTANCE 1.f — MoveInLineOfSight uses 2×CONTACT. Cite:
// boss_ambassador_flamelash.cpp:74; ObjectDefines.h CONTACT_DISTANCE.
export const FLAMELASH_SPIRIT_REACH_YD = 2;
/** TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN on DoSummonSpirit. Cite: boss_ambassador_flamelash.cpp:66. */
export const FLAMELASH_SPIRIT_DESPAWN_MS = 60_000;

// boss_emperor_dagran_thaurissan.cpp:31–38, 135–142
export const YELL_AGGRO_1 = -1230001;
export const YELL_AGGRO_2 = -1230064;
export const YELL_AGGRO_3 = -1230065;
export const YELL_SLAY = -1230002;
export const SPELL_HANDOFTHAURISSAN = 17492;
export const SPELL_AVATAROFFLAME = 15636;
export const SPELL_HEAL = 15586;
export const SPELL_RENEW = 10929;
export const SPELL_SHIELD = 10901;
export const SPELL_MINDBLAST = 15587;
export const SPELL_SHADOWWORDPAIN_MOIRA = 15654;
export const SPELL_SMITE = 10934;
export const SPELL_SHADOW_BOLT_MOIRA = 15537;
export const SPELL_OPEN_PORTAL = 13912;

// blackrock_depths.cpp Phalanx 552–554
export const YELL_PHALANX_AGGRO = -1230040;
export const SPELL_THUNDERCLAP = 15588;
export const SPELL_MIGHTY_BLOW = 14099;
export const SPELL_FIREBALL_VOLLEY = 15285;
/** Cite: blackrock_depths.cpp:666 GetHealthPercent() < 51.0f */
export const PHALANX_HP_VOLLEY = 51;

// blackrock_depths.cpp Hurley 1450–1451
export const SPELL_DRUNKEN_RAGE = 14872;
export const SPELL_FLAME_BREATH = 9573;
/** Cite: blackrock_depths.cpp:1545 GetHealthPercent() < 31.0f */
export const HURLEY_HP_ENRAGE = 31;

// blackrock_depths.cpp Plugger 1633–1638
export const SPELL_BANISH = 8994;
export const SPELL_CURSE_OF_TONGUES = 13338;
export const SPELL_DEMON_ARMOR = 13787;
export const SPELL_IMMOLATE = 12742;
export const SPELL_SHADOW_BOLT = 12739;
export const SPELL_PICKPOCKET = 921;

// blackrock_depths.cpp Ironhand 1844–1845
export const SPELL_GOUT_OF_FLAME = 15529;
export const SPELL_STONED_VISUAL = 15533;

// blackrock_depths.cpp Nagmara / Rocknot / Windsor / Grimstone spells
export const SPELL_POTION_LOVE = 14928;
export const SPELL_NAGMARA_ROCKNOT = 15064;
export const SPELL_WINDSORS_FRENZY = 15167;
export const SPELL_SUMMON_THELRIN_DND = 27517;
export const SPELL_ASHCROMBES_TELEPORT_A = 15742;
/** Cite: blackrock_depths.cpp:172 — visual teleport; ABSENT from spell bake (GAPS). */
export const SPELL_ASHCROMBES_TELEPORT_B = 6422;
export const SPELL_ARENA_FLASH_A = 15737;
export const SPELL_ARENA_FLASH_B = 15739;
export const SPELL_ARENA_FLASH_C = 15740;
export const SPELL_ARENA_FLASH_D = 15741;

// blackrock_depths.cpp Doomrel 1581
export const SAY_DOOMREL_START_EVENT = -1230003;
export const GOSSIP_TEXT_ID_CHALLENGE = 2601;

// Runtime phases
export const ANGERFORGE_PHASE_1 = 0;
export const ANGERFORGE_PHASE_ALARM = 1;
export const FLAMELASH_PHASE_1 = 0;
export const FLAMELASH_PHASE_PULL = 1;
export const HURLEY_PHASE_1 = 0;
export const HURLEY_PHASE_ENRAGE = 1;

// boss_high_interrogator_gerstahn

// boss_high_interrogator_gerstahn, creature 9018. Reset arms SW:P 4000, Mana Burn 14000, Psychic
// Scream 32000, Shadow Shield 8000; re-arms are 7000 / 10000 / 30000 / 25000 on CAST_OK.
export const BOSS_HIGH_INTERROGATOR_GERSTAHN: ScriptDevIR = {
  name: 'boss_high_interrogator_gerstahn',
  boundCreatures: [NPC_HIGH_INTERROGATOR_GERSTAHN],
  sourceFile: 'eastern_kingdoms/blackrock_depths/boss_high_interrogator_gerstahn.cpp',
  spellIds: [
    SPELL_SHADOWWORDPAIN_GERSTAHN,
    SPELL_MANABURN,
    SPELL_PSYCHICSCREAM,
    SPELL_SHADOWSHIELD,
  ],
  timers: [
    {
      id: 'shadow_word_pain',
      spellId: SPELL_SHADOWWORDPAIN_GERSTAHN,
      initialMinMs: 4000,
      initialMaxMs: 4000,
      repeatMinMs: 7000,
      repeatMaxMs: 7000,
      target: 'hostile_random',
      cite: 'boss_high_interrogator_gerstahn.cpp:48,59-66',
    },
    {
      id: 'mana_burn',
      spellId: SPELL_MANABURN,
      initialMinMs: 14_000,
      initialMaxMs: 14_000,
      repeatMinMs: 10_000,
      repeatMaxMs: 10_000,
      target: 'hostile_random_mana',
      select: { powerMana: true },
      cite: 'boss_high_interrogator_gerstahn.cpp:49,71-78 SELECT_FLAG_POWER_MANA',
    },
    {
      id: 'psychic_scream',
      spellId: SPELL_PSYCHICSCREAM,
      initialMinMs: 32_000,
      initialMaxMs: 32_000,
      repeatMinMs: 30_000,
      repeatMaxMs: 30_000,
      target: 'self',
      cite: 'boss_high_interrogator_gerstahn.cpp:50,83-87',
    },
    {
      id: 'shadow_shield',
      spellId: SPELL_SHADOWSHIELD,
      initialMinMs: 8000,
      initialMaxMs: 8000,
      repeatMinMs: 25_000,
      repeatMaxMs: 25_000,
      target: 'self',
      cite: 'boss_high_interrogator_gerstahn.cpp:51,92-96',
    },
  ],
  cites: [
    'boss_high_interrogator_gerstahn.cpp:28-116',
    'boss_high_interrogator_gerstahn.cpp:47-51 Reset',
    'boss_high_interrogator_gerstahn.cpp:53-102 UpdateAI',
  ],
};

// boss_general_angerforge

// boss_general_angerforge, creature 9033. Reset arms Sunder urand(5–10)s and Aggro adds Flurry +
// Enrage. Below 30% the Alarm summons 8× Reservist + 2× Medic, re-arming every 3 min.
export const BOSS_GENERAL_ANGERFORGE: ScriptDevIR = {
  name: 'boss_general_angerforge',
  boundCreatures: [NPC_GENERAL_ANGERFORGE],
  sourceFile: 'eastern_kingdoms/blackrock_depths/boss_general_angerforge.cpp',
  // Flurry 15088 and Enrage 15097 pay through 17687 / 15061, resolved off the kit.
  spellIds: [SPELL_FLURRY, SPELL_ENRAGE, SPELL_SUNDER_ARMOR, 17687, 15061],
  timers: [
    {
      id: 'flurry',
      spellId: SPELL_FLURRY,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'boss_general_angerforge.cpp:60 Aggro Flurry AURA_NOT_PRESENT|TRIGGERED',
    },
    {
      id: 'enrage',
      spellId: SPELL_ENRAGE,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'boss_general_angerforge.cpp:61 Aggro Enrage AURA_NOT_PRESENT|TRIGGERED',
    },
    {
      id: 'sunder_armor',
      spellId: SPELL_SUNDER_ARMOR,
      // Reset m_uiSunderArmorTimer = urand(5s, 10s) (cpp:54)
      initialMinMs: 5000,
      initialMaxMs: 10_000,
      // CAST_OK re-arm urand(5s, 15s) (cpp:87)
      repeatMinMs: 5000,
      repeatMaxMs: 15_000,
      target: 'victim',
      cite: 'boss_general_angerforge.cpp:54,84-88',
    },
  ],
  // armDelay = 3 min so phase opener 8+2 is not doubled at the <30% tick.
  // Cite: boss_general_angerforge.cpp:104 m_uiAlarmTimer = 3 * MINUTE * IN_MILLISECONDS
  summonWaves: [
    {
      id: 'angerforge_alarm_reservist',
      creatureEntry: NPC_ANVILRAGE_RESERVIST,
      perTick: NPC_NORMAL_AMOUNT,
      armDelayMs: ANGERFORGE_ALARM_REPEAT_MS,
      firstTickMinMs: ANGERFORGE_ALARM_REPEAT_MS,
      firstTickMaxMs: ANGERFORGE_ALARM_REPEAT_MS,
      tickMinMs: ANGERFORGE_ALARM_REPEAT_MS,
      tickMaxMs: ANGERFORGE_ALARM_REPEAT_MS,
      firstWaveCount: 1,
      waveMinCount: 1,
      waveMaxCount: 1,
      gapBaseMs: 0,
      gapPerSummonFirstMs: 0,
      gapPerSummonMs: 0,
      phase: ANGERFORGE_PHASE_ALARM,
      cite: 'boss_general_angerforge.cpp:99-100,104 SummonAdd ×8 Reservist=8901; re-arm 3*MINUTE',
    },
    {
      id: 'angerforge_alarm_medic',
      creatureEntry: NPC_ANVILRAGE_MEDIC,
      perTick: NPC_ELITE_AMOUNT,
      armDelayMs: ANGERFORGE_ALARM_REPEAT_MS,
      firstTickMinMs: ANGERFORGE_ALARM_REPEAT_MS,
      firstTickMaxMs: ANGERFORGE_ALARM_REPEAT_MS,
      tickMinMs: ANGERFORGE_ALARM_REPEAT_MS,
      tickMaxMs: ANGERFORGE_ALARM_REPEAT_MS,
      firstWaveCount: 1,
      waveMinCount: 1,
      waveMaxCount: 1,
      gapBaseMs: 0,
      gapPerSummonFirstMs: 0,
      gapPerSummonMs: 0,
      phase: ANGERFORGE_PHASE_ALARM,
      cite: 'boss_general_angerforge.cpp:101-102,104 SummonAdd ×2 Medic=8894; re-arm 3*MINUTE',
    },
  ],
  phases: [
    {
      phase: ANGERFORGE_PHASE_ALARM,
      hpBelowPct: ANGERFORGE_HP_ALARM,
      actions: [
        {
          kind: 'yell',
          textId: EMOTE_ALARM,
          cite: 'boss_general_angerforge.cpp:97 DoScriptText EMOTE_ALARM',
        },
        {
          kind: 'summon_count',
          creatureEntry: NPC_ANVILRAGE_RESERVIST,
          count: NPC_NORMAL_AMOUNT,
          cite: 'boss_general_angerforge.cpp:99-100 SummonAdd ×8 NPC_ANVILRAGE_RESERVIST=8901',
        },
        {
          kind: 'summon_count',
          creatureEntry: NPC_ANVILRAGE_MEDIC,
          count: NPC_ELITE_AMOUNT,
          cite: 'boss_general_angerforge.cpp:101-102 SummonAdd ×2 NPC_ANVILRAGE_MEDIC=8894',
        },
        {
          kind: 'flavor',
          text: 'sounds the alarm - reservists and medics pour in!',
          cite: 'boss_general_angerforge.cpp:93-108 Alarm <30%; summonWaves re-arm 180s',
        },
      ],
      cite: 'boss_general_angerforge.cpp:93-108 GetHealthPercent() < 30.0f → first Alarm; summonWaves re-arm',
    },
  ],
  cites: [
    'boss_general_angerforge.cpp:28-125',
    'boss_general_angerforge.cpp:43 aAlarmPoint (xyz leftover — no summon origin in IR)',
    'boss_general_angerforge.cpp:52-56 Reset',
    'boss_general_angerforge.cpp:58-61 Aggro',
    'boss_general_angerforge.cpp:77-110 UpdateAI',
    'boss_general_angerforge.cpp:36-40 NPC_NORMAL_AMOUNT=8 NPC_ELITE_AMOUNT=2',
    'boss_general_angerforge.cpp:104 m_uiAlarmTimer = 3 * MINUTE * IN_MILLISECONDS',
  ],
};

// boss_ambassador_flamelash

// boss_ambassador_flamelash, creature 9156. Aggro casts Fireblast and summons 4 Fireguard
// Destroyers; each of seven rune timers summons 9178 then re-arms 15–30s. Cite: cpp:53–137.
export const BOSS_AMBASSADOR_FLAMELASH: ScriptDevIR = {
  name: 'boss_ambassador_flamelash',
  boundCreatures: [NPC_AMBASSADOR_FLAMELASH],
  sourceFile: 'eastern_kingdoms/blackrock_depths/boss_ambassador_flamelash.cpp',
  // Fire Blast 15573 pays through 15574, resolved off the kit.
  spellIds: [SPELL_FIREBLAST, SPELL_BURNING_SPIRIT, SPELL_BURNING_SPIRIT_BUFF, 15574],
  timers: [
    {
      id: 'fireblast',
      spellId: SPELL_FIREBLAST,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED,
      cite: 'boss_ambassador_flamelash.cpp:83 Aggro DoCastSpellIfCan SPELL_FIREBLAST',
    },
  ],
  // Per-rune DoSummonSpirit; armDelay = re-arm min so opener ×7 is not doubled at t=0.
  summonWaves: GO_DWARF_RUNES.map((goEntry, i) => ({
    id: `burning_spirit_rune_${i}`,
    creatureEntry: NPC_BURNING_SPIRIT,
    perTick: 1,
    armDelayMs: FLAMELASH_SPIRIT_REPEAT_MIN_MS,
    firstTickMinMs: FLAMELASH_SPIRIT_REPEAT_MIN_MS,
    firstTickMaxMs: FLAMELASH_SPIRIT_REPEAT_MAX_MS,
    tickMinMs: FLAMELASH_SPIRIT_REPEAT_MIN_MS,
    tickMaxMs: FLAMELASH_SPIRIT_REPEAT_MAX_MS,
    firstWaveCount: 1,
    waveMinCount: 1,
    waveMaxCount: 1,
    gapBaseMs: 0,
    gapPerSummonFirstMs: 0,
    gapPerSummonMs: 0,
    phase: FLAMELASH_PHASE_PULL,
    cite: `boss_ambassador_flamelash.cpp:60-66,127-133 DoSummonSpirit(${i}) GO ${goEntry}; re-arm urand(15000,30000)`,
  })),
  phases: [
    {
      // 101 so 100 < 101 at pull (`hpPct < hpBelowPct`; 100 never fired).
      // Cite: boss_ambassador_flamelash.cpp:81-91 Aggro summons.
      phase: FLAMELASH_PHASE_PULL,
      hpBelowPct: 101,
      actions: [
        {
          // The four stand OUTSIDE the room (cmangos 496e43ff8), so they only meet a party that left
          // mid-fight: a pull after a wipe or a flee walks back through them. A first pull never does.
          kind: 'summon_count',
          creatureEntry: NPC_FIREGUARD_DESTROYER,
          count: 4,
          gate: {
            field: TYPE_FLAMELASH,
            equals: INSTANCE_DATA.IN_PROGRESS,
            or: { field: TYPE_FLAMELASH, equals: INSTANCE_DATA.FAIL, cite: 'JustReachedHome SetData FAIL' },
            cite: 'boss_ambassador_flamelash.cpp:85-86 an earlier Aggro left TYPE_FLAMELASH IN_PROGRESS',
          },
          cite: 'boss_ambassador_flamelash.cpp:88-91 SummonCreature NPC_FIREGUARD_DESTROYER ×4 at the door',
        },
        {
          kind: 'summon_count',
          creatureEntry: NPC_BURNING_SPIRIT,
          count: FLAMELASH_RUNE_COUNT,
          cite: 'boss_ambassador_flamelash.cpp:53-54,127-133 first DoSummonSpirit per rune (Reset timers 0–1000ms)',
        },
        {
          kind: 'set_instance_data',
          field: TYPE_FLAMELASH,
          value: INSTANCE_DATA.IN_PROGRESS,
          // Persisted: it is what lets the Destroyer gate above see the next pull is a return.
          persist: true,
          cite: 'boss_ambassador_flamelash.cpp:85-86 SetData(TYPE_FLAMELASH, IN_PROGRESS)',
        },
        {
          kind: 'flavor',
          text: 'calls Burning Spirits from the runes!',
          cite: 'boss_ambassador_flamelash.cpp:81-91 Aggro summons; 127-137 spirit timers',
        },
      ],
      cite: 'boss_ambassador_flamelash.cpp:81-91 Aggro; 53-54 first spirit wave',
    },
  ],
  lifecycle: {
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_FLAMELASH,
        value: INSTANCE_DATA.DONE,
        cite: 'boss_ambassador_flamelash.cpp:96-97 JustDied SetData DONE',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_FLAMELASH,
        value: INSTANCE_DATA.FAIL,
        cite: 'boss_ambassador_flamelash.cpp:102-103 JustReachedHome SetData FAIL',
      },
    ],
  },
  cites: [
    'boss_ambassador_flamelash.cpp:29-154',
    'boss_ambassador_flamelash.cpp:51-57 Reset',
    'boss_ambassador_flamelash.cpp:60-66 DoSummonSpirit',
    'boss_ambassador_flamelash.cpp:69-78 MoveInLineOfSight',
    'boss_ambassador_flamelash.cpp:81-91 Aggro',
    'boss_ambassador_flamelash.cpp:106-114 JustSummoned',
    'boss_ambassador_flamelash.cpp:121-140 UpdateAI',
    'SpellEffects.cpp:497-502 EffectDummy 13489 → 14744',
    'blackrock_depths.h:13 MAX_DWARF_RUNES=7; :44 NPC_FIREGUARD_DESTROYER=8911; :107-113 GO_DWARFRUNE_A01..G01',
  ],
};

// boss_emperor_dagran_thaurissan + boss_moira_bronzebeard

// boss_emperor_dagran_thaurissan, creature 9019. Hand of Thaurissan re-arms urand(5,10)s and
// Avatar of Flame 18000. JustDied turns the Princess neutral. Cite: cpp:41–122.
export const BOSS_EMPEROR_DAGRAN_THAURISSAN: ScriptDevIR = {
  name: 'boss_emperor_dagran_thaurissan',
  boundCreatures: [NPC_EMPEROR],
  sourceFile: 'eastern_kingdoms/blackrock_depths/boss_emperor_dagran_thaurissan.cpp',
  // Avatar of Flame 15636 pays through Flames 15643, resolved off the kit.
  spellIds: [SPELL_HANDOFTHAURISSAN, SPELL_AVATAROFFLAME, 15643],
  timers: [
    {
      id: 'hand_of_thaurissan',
      spellId: SPELL_HANDOFTHAURISSAN,
      initialMinMs: 4000,
      initialMaxMs: 4000,
      repeatMinMs: 5000,
      repeatMaxMs: 10_000,
      target: 'hostile_random',
      cite: 'boss_emperor_dagran_thaurissan.cpp:56,100-106',
    },
    {
      id: 'avatar_of_flame',
      spellId: SPELL_AVATAROFFLAME,
      initialMinMs: 25_000,
      initialMaxMs: 25_000,
      repeatMinMs: 18_000,
      repeatMaxMs: 18_000,
      target: 'victim',
      cite: 'boss_emperor_dagran_thaurissan.cpp:57,112-115',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: YELL_AGGRO_1,
        cite: 'boss_emperor_dagran_thaurissan.cpp:62-67 urand(0,2) aggro yell (product: YELL_AGGRO_1)',
      },
      {
        kind: 'flavor',
        text: 'calls for help!',
        cite: 'boss_emperor_dagran_thaurissan.cpp:68 CallForHelp(VISIBLE_RANGE)',
      },
    ],
    onDeath: [
      {
        kind: 'flavor',
        text: "Princess Moira turns neutral as the Emperor falls!",
        cite: 'boss_emperor_dagran_thaurissan.cpp:76-87 Princess FACTION_NEUTRAL + EnterEvadeMode',
      },
    ],
  },
  cites: [
    'boss_emperor_dagran_thaurissan.cpp:29-127',
    'boss_emperor_dagran_thaurissan.cpp:54-58 Reset',
    'boss_emperor_dagran_thaurissan.cpp:95-121 UpdateAI',
  ],
};

// boss_moira_bronzebeard, creature 8929. Mind Blast 14000, SW:P 18000, Smite 10000; the Emperor
// heal is a concurrent ally cast the solo session cannot target, so it stays a GAP.
export const BOSS_MOIRA_BRONZEBEARD: ScriptDevIR = {
  name: 'boss_moira_bronzebeard',
  boundCreatures: [NPC_PRINCESS],
  sourceFile: 'eastern_kingdoms/blackrock_depths/boss_emperor_dagran_thaurissan.cpp',
  spellIds: [
    SPELL_HEAL,
    SPELL_RENEW,
    SPELL_SHIELD,
    SPELL_MINDBLAST,
    SPELL_SHADOWWORDPAIN_MOIRA,
    SPELL_SMITE,
    SPELL_SHADOW_BOLT_MOIRA,
    SPELL_OPEN_PORTAL,
  ],
  timers: [
    {
      id: 'mind_blast',
      spellId: SPELL_MINDBLAST,
      initialMinMs: 16_000,
      initialMaxMs: 16_000,
      repeatMinMs: 14_000,
      repeatMaxMs: 14_000,
      target: 'victim',
      cite: 'boss_emperor_dagran_thaurissan.cpp:163,191-194',
    },
    {
      id: 'shadow_word_pain',
      spellId: SPELL_SHADOWWORDPAIN_MOIRA,
      initialMinMs: 2000,
      initialMaxMs: 2000,
      repeatMinMs: 18_000,
      repeatMaxMs: 18_000,
      target: 'victim',
      cite: 'boss_emperor_dagran_thaurissan.cpp:164,200-203',
    },
    {
      id: 'smite',
      spellId: SPELL_SMITE,
      initialMinMs: 8000,
      initialMaxMs: 8000,
      repeatMinMs: 10_000,
      repeatMaxMs: 10_000,
      target: 'victim',
      cite: 'boss_emperor_dagran_thaurissan.cpp:165,209-212',
    },
    // Heal targets the Emperor (cpp:220-225) — a concurrent ally cast the product cannot express,
    // so it is omitted from the schedule rather than mis-cast, but stays in spellIds for resolve.
  ],
  lifecycle: {
    onEvade: [
      {
        kind: 'cast_self',
        spellId: SPELL_OPEN_PORTAL,
        castFlags: CAST_FLAG.TRIGGERED,
        cite: 'boss_emperor_dagran_thaurissan.cpp:178-179 JustReachedHome Open Portal if Emperor dead',
      },
    ],
  },
  cites: [
    'boss_emperor_dagran_thaurissan.cpp:133-239',
    'boss_emperor_dagran_thaurissan.cpp:160-169 Reset',
    'boss_emperor_dagran_thaurissan.cpp:184-233 UpdateAI',
    'boss_emperor_dagran_thaurissan.cpp:135-142 enum (Renew/Shield/ShadowBolt unused in UpdateAI)',
  ],
};

// Zone combat AIs (blackrock_depths.cpp)

// npc_phalanxAI, blackrock_depths.cpp:557–679. Aggro arms Thunderclap 12000, Mighty Blow 15000 and
// Fireball Volley 1; the volley fires below 51%. Escort activation remains a bar-event GAP.
export const NPC_PHALANX_SCRIPT: ScriptDevIR = {
  name: 'npc_phalanx',
  boundCreatures: [NPC_PHALANX],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [SPELL_THUNDERCLAP, SPELL_MIGHTY_BLOW, SPELL_FIREBALL_VOLLEY],
  timers: [
    {
      id: 'thunderclap',
      spellId: SPELL_THUNDERCLAP,
      // Aggro uiThunderclapTimer = 12000 (cpp:592)
      initialMinMs: 12_000,
      initialMaxMs: 12_000,
      // CAST_OK re-arm 10000 (cpp:653)
      repeatMinMs: 10_000,
      repeatMaxMs: 10_000,
      target: 'victim',
      cite: 'blackrock_depths.cpp:592,650-653',
    },
    {
      id: 'mighty_blow',
      spellId: SPELL_MIGHTY_BLOW,
      // Aggro uiMightyBlowTimer = 15000 (cpp:593)
      initialMinMs: 15_000,
      initialMaxMs: 15_000,
      // CAST_OK re-arm 10000 (cpp:661)
      repeatMinMs: 10_000,
      repeatMaxMs: 10_000,
      target: 'victim',
      cite: 'blackrock_depths.cpp:593,658-661',
    },
    {
      id: 'fireball_volley',
      spellId: SPELL_FIREBALL_VOLLEY,
      // Aggro uiFireballVolleyTimer = 1 (cpp:594); gated <51%
      initialMinMs: 1,
      initialMaxMs: 1,
      // CAST_OK re-arm 15000 (cpp:671)
      repeatMinMs: 15_000,
      repeatMaxMs: 15_000,
      target: 'self',
      hpPctMax: PHALANX_HP_VOLLEY,
      hpPctMin: 0,
      cite: 'blackrock_depths.cpp:594,666-671 GetHealthPercent() < 51.0f',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: YELL_PHALANX_AGGRO,
        cite: 'blackrock_depths.cpp:605 DoScriptText YELL_PHALANX_AGGRO (wp1; product on combat)',
      },
    ],
  },
  cites: [
    'blackrock_depths.cpp:545-685',
    'blackrock_depths.cpp:590-595 Aggro timer arm',
    'blackrock_depths.cpp:647-678 combat',
  ],
};

// boss_plugger_spazzringAI, blackrock_depths.cpp:1645–1803. Aggro arms Banish urand(8–12)s,
// Immolate urand(18–20)s, Shadow Bolt 1s and Curse 17s. Death starts the Phalanx escort.
export const BOSS_PLUGGER_SPAZZRING: ScriptDevIR = {
  name: 'boss_plugger_spazzring',
  boundCreatures: [NPC_PLUGGER_SPAZZRING],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [
    SPELL_BANISH,
    SPELL_CURSE_OF_TONGUES,
    SPELL_DEMON_ARMOR,
    SPELL_IMMOLATE,
    SPELL_SHADOW_BOLT,
    SPELL_PICKPOCKET,
  ],
  timers: [
    {
      id: 'demon_armor',
      spellId: SPELL_DEMON_ARMOR,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'blackrock_depths.cpp:1667,1794-1797 OOC Demon Armor; product onReset buff',
    },
    {
      id: 'banish',
      spellId: SPELL_BANISH,
      // Aggro m_uiBanishTimer = urand(8,12)*1000 (cpp:1677)
      initialMinMs: 8000,
      initialMaxMs: 12_000,
      // CAST_OK re-arm urand(26,28)*1000 (cpp:1736)
      repeatMinMs: 26_000,
      repeatMaxMs: 28_000,
      target: 'hostile_random',
      cite: 'blackrock_depths.cpp:1677,1731-1736',
    },
    {
      id: 'immolate',
      spellId: SPELL_IMMOLATE,
      // Aggro m_uiImmolateTimer = urand(18,20)*1000 (cpp:1678)
      initialMinMs: 18_000,
      initialMaxMs: 20_000,
      // CAST_OK re-arm 25000 (cpp:1745)
      repeatMinMs: 25_000,
      repeatMaxMs: 25_000,
      target: 'victim',
      cite: 'blackrock_depths.cpp:1678,1742-1745',
    },
    {
      id: 'shadow_bolt',
      spellId: SPELL_SHADOW_BOLT,
      // Aggro m_uiShadowBoltTimer = 1000 (cpp:1679)
      initialMinMs: 1000,
      initialMaxMs: 1000,
      // CAST_OK re-arm urand(36,63)*100 (cpp:1753)
      repeatMinMs: 3600,
      repeatMaxMs: 6300,
      target: 'victim',
      cite: 'blackrock_depths.cpp:1679,1750-1753',
    },
    {
      id: 'curse_of_tongues',
      spellId: SPELL_CURSE_OF_TONGUES,
      // Aggro m_uiCurseOfTonguesTimer = 17000 (cpp:1680)
      initialMinMs: 17_000,
      initialMaxMs: 17_000,
      // CAST_OK re-arm urand(19,31)*1000 (cpp:1763)
      repeatMinMs: 19_000,
      repeatMaxMs: 31_000,
      target: 'hostile_random_mana',
      select: { powerMana: true },
      cite: 'blackrock_depths.cpp:1680,1758-1763 SELECT_FLAG_POWER_MANA',
    },
  ],
  lifecycle: {
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_PLUGGER,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'blackrock_depths.cpp:1695 SetData(TYPE_PLUGGER, IN_PROGRESS) on Plugger death',
      },
      {
        kind: 'flavor',
        text: 'dies - the bar turns hostile and Phalanx awakens!',
        cite: 'blackrock_depths.cpp:1688-1695 Phalanx escort Start + HandleBarPatrons HOSTILE',
      },
    ],
  },
  cites: [
    'blackrock_depths.cpp:1614-1808',
    'blackrock_depths.cpp:1664-1673 Reset',
    'blackrock_depths.cpp:1675-1681 Aggro',
    'blackrock_depths.cpp:1726-1801 UpdateAI',
  ],
};

// npc_hurley_blackbreathAI, blackrock_depths.cpp:1457–1568. Aggro arms Flame Breath 7000, re-arm
// 10s; below 31% he enrages once. The three-keg summon stays the InstanceDef objectGate.
export const NPC_HURLEY_BLACKBREATH_SCRIPT: ScriptDevIR = {
  name: 'npc_hurley_blackbreath',
  boundCreatures: [NPC_HURLEY_BLACKBREATH],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [SPELL_FLAME_BREATH, SPELL_DRUNKEN_RAGE],
  timers: [
    {
      id: 'flame_breath',
      spellId: SPELL_FLAME_BREATH,
      // Aggro uiFlameBreathTimer = 7000 (cpp:1496)
      initialMinMs: 7000,
      initialMaxMs: 7000,
      // CAST_OK re-arm 10000 (cpp:1540)
      repeatMinMs: 10_000,
      repeatMaxMs: 10_000,
      target: 'victim',
      cite: 'blackrock_depths.cpp:1496,1537-1540',
    },
  ],
  phases: [
    {
      phase: HURLEY_PHASE_ENRAGE,
      hpBelowPct: HURLEY_HP_ENRAGE,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_DRUNKEN_RAGE,
          cite: 'blackrock_depths.cpp:1547 DoCastSpellIfCan SPELL_DRUNKEN_RAGE once <31%',
        },
        {
          kind: 'flavor',
          text: 'flies into a drunken rage!',
          cite: 'blackrock_depths.cpp:1545-1548 bIsEnraged',
        },
      ],
      cite: 'blackrock_depths.cpp:1545-1548 GetHealthPercent() < 31.0f && !bIsEnraged',
    },
  ],
  lifecycle: {
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_HURLEY,
        value: INSTANCE_DATA.DONE,
        cite: 'instance_blackrock_depths.cpp:543-544 NPC_HURLEY_BLACKBREATH → TYPE_HURLEY DONE',
      },
    ],
  },
  cites: [
    'blackrock_depths.cpp:1441-1573',
    'blackrock_depths.cpp:1494-1499 Aggro',
    'blackrock_depths.cpp:1529-1566 UpdateEscortAI combat',
  ],
};

// npc_ironhand_guardianAI, blackrock_depths.cpp:1848–1900. Passive until TYPE_IRON_HALL starts,
// then strips Stoned and arms Gout of Flame urand(4–30)s.
export const NPC_IRONHAND_GUARDIAN_SCRIPT: ScriptDevIR = {
  name: 'npc_ironhand_guardian',
  boundCreatures: [NPC_IRONHAND_GUARDIAN],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  // Gout of Flame 15529 ticks 15538; a trigger payload resolves off the kit.
  spellIds: [SPELL_GOUT_OF_FLAME, SPELL_STONED_VISUAL, 15538],
  timers: [
    {
      id: 'gout_of_flame',
      spellId: SPELL_GOUT_OF_FLAME,
      // Reset m_goutOfFlameTimer = urand(4,30)*IN_MILLISECONDS (cpp:1863)
      initialMinMs: 4000,
      initialMaxMs: 30_000,
      // re-arm urand(4,30)*IN_MILLISECONDS (cpp:1891 area)
      repeatMinMs: 4000,
      repeatMaxMs: 30_000,
      target: 'self',
      cite: 'blackrock_depths.cpp:1863,1888-1891 Gout of Flame when TYPE_IRON_HALL active',
    },
  ],
  cites: [
    'blackrock_depths.cpp:1838-1900',
    'blackrock_depths.cpp:1861-1867 Reset passive',
    'blackrock_depths.cpp:1869-1895 UpdateAI TYPE_IRON_HALL gate',
  ],
};

// boss_doomrel gossip, blackrock_depths.cpp:1579–1612: the challenge is offered while
// TYPE_TOMB_OF_SEVEN is NOT_STARTED or FAIL, and selecting it sets IN_PROGRESS.
export const BOSS_DOOMREL: ScriptDevIR = {
  name: 'boss_doomrel',
  boundCreatures: [NPC_DOOMREL],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [],
  timers: [],
  gossipHello: {
    defaultTextId: GOSSIP_TEXT_ID_CHALLENGE,
    cite: 'blackrock_depths.cpp:1594 SEND_GOSSIP_MENU GOSSIP_TEXT_ID_CHALLENGE=2601',
  },
  lifecycle: {
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_TOMB_OF_SEVEN,
        value: INSTANCE_DATA.DONE,
        cite: 'instance_blackrock_depths.cpp:537-538 NPC_DOOMREL → TYPE_TOMB_OF_SEVEN DONE',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_TOMB_OF_SEVEN,
        value: INSTANCE_DATA.FAIL,
        cite: 'instance_blackrock_depths.cpp:486-493 Tomb dwarfs evade → FAIL',
      },
    ],
  },
  cites: [
    'blackrock_depths.cpp:1575-1612 boss_doomrel gossip',
    'instance_blackrock_depths.cpp:252-281 TYPE_TOMB_OF_SEVEN SetData',
  ],
};

// GO / AT / escort / romance scripts (zone — documented + instance data arms)

/** Cite: blackrock_depths.cpp:55–64 go_bar_beer_keg → TYPE_HURLEY SPECIAL */
export const GO_BAR_BEER_KEG: ScriptDevIR = {
  name: 'go_bar_beer_keg',
  boundCreatures: [],
  boundGos: [GO_THUNDERBREW_LAGER_KEG],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_THUNDERBREW_LAGER_KEG],
    gates: [
      {
        field: TYPE_HURLEY,
        notEquals: INSTANCE_DATA.IN_PROGRESS,
        cite: 'blackrock_depths.cpp:59 TYPE_HURLEY != IN_PROGRESS',
      },
      {
        field: TYPE_HURLEY,
        notEquals: INSTANCE_DATA.DONE,
        cite: 'blackrock_depths.cpp:59 TYPE_HURLEY != DONE',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_HURLEY,
        value: INSTANCE_DATA.SPECIAL,
        cite: 'blackrock_depths.cpp:62 SetData(TYPE_HURLEY, SPECIAL); instance caps at 3 → IN_PROGRESS + summon',
      },
    ],
    cite: 'blackrock_depths.cpp:55-64 GOUse_go_bar_beer_keg',
  },
  cites: [
    'blackrock_depths.cpp:51-64',
    'instance_blackrock_depths.cpp:319-357 TYPE_HURLEY SPECIAL → 3 kegs → summon Hurley',
  ],
};

/** Cite: blackrock_depths.cpp:71–80 go_shadowforge_brazier → TYPE_LYCEUM toggle */
export const GO_SHADOWFORGE_BRAZIER_SCRIPT: ScriptDevIR = {
  name: 'go_shadowforge_brazier',
  boundCreatures: [],
  boundGos: [GO_SHADOWFORGE_BRAZIER_A, GO_SHADOWFORGE_BRAZIER_B],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_SHADOWFORGE_BRAZIER_A, GO_SHADOWFORGE_BRAZIER_B],
    branches: [
      {
        gate: {
          field: TYPE_LYCEUM,
          equals: INSTANCE_DATA.IN_PROGRESS,
          cite: 'blackrock_depths.cpp:75 GetData(TYPE_LYCEUM) == IN_PROGRESS → DONE',
        },
        actions: [
          {
            kind: 'set_instance_data',
            field: TYPE_LYCEUM,
            value: INSTANCE_DATA.DONE,
            cite: 'blackrock_depths.cpp:76 SetData(TYPE_LYCEUM, DONE)',
          },
        ],
        cite: 'blackrock_depths.cpp:75-76 second brazier',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_LYCEUM,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'blackrock_depths.cpp:78 SetData(TYPE_LYCEUM, IN_PROGRESS) first brazier',
      },
    ],
    cite: 'blackrock_depths.cpp:71-80 GOUse_go_shadowforge_brazier',
  },
  cites: [
    'blackrock_depths.cpp:67-80',
    'instance_blackrock_depths.cpp:283-291 TYPE_LYCEUM DONE → golem doors + Magmus yell',
  ],
};

/** Cite: blackrock_depths.cpp:87–97 go_relic_coffer_door → TYPE_VAULT SPECIAL */
export const GO_RELIC_COFFER_DOOR_SCRIPT: ScriptDevIR = {
  name: 'go_relic_coffer_door',
  boundCreatures: [],
  boundGos: [GO_RELIC_COFFER_DOOR],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_RELIC_COFFER_DOOR],
    gates: [
      {
        field: TYPE_VAULT,
        notEquals: INSTANCE_DATA.DONE,
        cite: 'blackrock_depths.cpp:92 TYPE_VAULT != DONE',
      },
      {
        field: TYPE_VAULT,
        notEquals: INSTANCE_DATA.IN_PROGRESS,
        cite: 'blackrock_depths.cpp:92 TYPE_VAULT != IN_PROGRESS',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_VAULT,
        value: INSTANCE_DATA.SPECIAL,
        cite: 'blackrock_depths.cpp:93 SetData(TYPE_VAULT, SPECIAL); instance counts to 12 → Doomgrip',
      },
    ],
    cite: 'blackrock_depths.cpp:87-97 GOUse_go_relic_coffer_door',
  },
  cites: [
    'blackrock_depths.cpp:83-97',
    'instance_blackrock_depths.cpp:204-230 TYPE_VAULT SPECIAL counter MAX_RELIC_DOORS=12',
  ],
};

/** Cite: blackrock_depths.cpp:1814–1836 go_bar_ale_mug → TYPE_PLUGGER SPECIAL */
export const GO_BAR_ALE_MUG: ScriptDevIR = {
  name: 'go_bar_ale_mug',
  boundCreatures: [],
  boundGos: [GO_DARK_IRON_ALE_MUG, GO_GRIM_GUZZLER_BOAR],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_DARK_IRON_ALE_MUG, GO_GRIM_GUZZLER_BOAR],
    gates: [
      {
        field: TYPE_PLUGGER,
        notEquals: INSTANCE_DATA.IN_PROGRESS,
        cite: 'blackrock_depths.cpp:1818 TYPE_PLUGGER != IN_PROGRESS',
      },
      {
        field: TYPE_PLUGGER,
        notEquals: INSTANCE_DATA.DONE,
        cite: 'blackrock_depths.cpp:1818 TYPE_PLUGGER != DONE',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_PLUGGER,
        value: INSTANCE_DATA.SPECIAL,
        cite: 'blackrock_depths.cpp:1825 SetData(TYPE_PLUGGER, SPECIAL); 3 steals → IN_PROGRESS',
      },
    ],
    cite: 'blackrock_depths.cpp:1814-1836 GOUse_go_bar_ale_mug',
  },
  cites: [
    'blackrock_depths.cpp:1810-1836',
    'instance_blackrock_depths.cpp:366-376 TYPE_PLUGGER SPECIAL stolen-ales counter',
  ],
};

/** Cite: blackrock_depths.cpp:115–143 at_shadowforge_bridge AT-1786 */
export const AT_SHADOWFORGE_BRIDGE: ScriptDevIR = {
  name: 'at_shadowforge_bridge',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    gates: [
      {
        field: TYPE_BRIDGE,
        notEquals: INSTANCE_DATA.DONE,
        cite: 'blackrock_depths.cpp:119 TYPE_BRIDGE != DONE',
      },
    ],
    actions: [
      {
        kind: 'summon_count',
        creatureEntry: NPC_ANVILRAGE_GUARDMAN,
        count: 2,
        cite: 'blackrock_depths.cpp:127-136 SummonCreature NPC_ANVILRAGE_GUARDMAN ×2',
      },
      {
        kind: 'set_instance_data',
        field: TYPE_BRIDGE,
        value: INSTANCE_DATA.DONE,
        cite: 'blackrock_depths.cpp:141 SetData(TYPE_BRIDGE, DONE)',
      },
      {
        kind: 'flavor',
        text: 'Anvilrage Guardsmen ambush from the Shadowforge bridge!',
        cite: 'blackrock_depths.cpp:115-143 AreaTrigger_at_shadowforge_bridge',
      },
    ],
    cite: 'blackrock_depths.cpp:115-143 at_shadowforge_bridge',
  },
  cites: ['blackrock_depths.cpp:99-143', 'blackrock_depths.h:25 TYPE_BRIDGE=10'],
};

/** Cite: blackrock_depths.cpp at_ring_of_law + npc_grimstone arena event */
export const AT_RING_OF_LAW: ScriptDevIR = {
  name: 'at_ring_of_law',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [
    SPELL_SUMMON_THELRIN_DND,
    SPELL_ASHCROMBES_TELEPORT_A,
    SPELL_ARENA_FLASH_A,
    SPELL_ARENA_FLASH_B,
    SPELL_ARENA_FLASH_C,
    SPELL_ARENA_FLASH_D,
  ],
  timers: [],
  goUse: {
    goEntries: [],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_RING_OF_LAW,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'blackrock_depths.cpp Ring of Law AT / Grimstone starts TYPE_RING_OF_LAW',
      },
      {
        kind: 'flavor',
        text: 'The Ring of Law begins - High Justice Grimstone presides!',
        cite: 'blackrock_depths.cpp:146-540 at_ring_of_law + npc_grimstone escort event',
      },
    ],
    cite: 'blackrock_depths.cpp at_ring_of_law; InstanceDef objectGate GO 161525 remains product stand-in',
  },
  unusedBindings: [
    {
      entry: SPELL_ASHCROMBES_TELEPORT_B,
      kind: 'creature',
      reason:
        'SPELL_ASHCROMBES_TELEPORT_B=6422 (Ashcrombe teleport visual on Grimstone arena flash) is ABSENT from the spell bake and spell-refs-missing payload - cosmetic only; arena combat uses InstanceDef ring-of-law waves. Do not stub.',
      cite: 'blackrock_depths.cpp:172 SPELL_ASHCROMBES_TELEPORT_B=6422; bake has no row',
    },
  ],
  cites: [
    'blackrock_depths.cpp:146-540 npc_grimstone + at_ring_of_law',
    'blackrock_depths.h:16 TYPE_RING_OF_LAW=1',
  ],
};

// Cite: blackrock_depths.cpp:235+ npc_grimstone escort AI Arena event choreography (teleports, flashes,
// wave summons) — product InstanceDef ring-of-law waves stand in; IR documents binding + spell kit.
export const NPC_GRIMSTONE_SCRIPT: ScriptDevIR = {
  name: 'npc_grimstone',
  boundCreatures: [NPC_GRIMSTONE],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [
    SPELL_SUMMON_THELRIN_DND,
    SPELL_ASHCROMBES_TELEPORT_A,
    SPELL_ARENA_FLASH_A,
    SPELL_ARENA_FLASH_B,
    SPELL_ARENA_FLASH_C,
    SPELL_ARENA_FLASH_D,
  ],
  timers: [],
  cites: [
    'blackrock_depths.cpp:235-540 npc_grimstoneAI escort event',
    'blackrock_depths.cpp:169-176 arena flash / teleport spells',
  ],
};

/** Cite: blackrock_depths.cpp:707+ Nagmara romance / QUEST_POTION_LOVE */
export const NPC_MISTRESS_NAGMARA_SCRIPT: ScriptDevIR = {
  name: 'npc_mistress_nagmara',
  boundCreatures: [NPC_MISTRESS_NAGMARA],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [SPELL_POTION_LOVE, SPELL_NAGMARA_ROCKNOT],
  timers: [],
  questRewarded: [
    {
      questId: 4201,
      actions: [
        {
          kind: 'set_instance_data',
          field: TYPE_NAGMARA,
          value: INSTANCE_DATA.IN_PROGRESS,
          cite: 'blackrock_depths.cpp:837-850 QuestRewarded → DoPotionOfLoveIfCan romance phase',
        },
        {
          kind: 'flavor',
          text: 'Nagmara and Rocknot leave for a private moment…',
          cite: 'blackrock_depths.cpp:727-802 DoPotionOfLoveIfCan phase machine',
        },
      ],
      cite: 'blackrock_depths.cpp:837-850 QuestRewarded_npc_mistress_nagmara QUEST_POTION_LOVE=4201',
    },
  ],
  cites: [
    'blackrock_depths.cpp:687-850 npc_mistress_nagmara',
    'blackrock_depths.h:28 TYPE_NAGMARA=13',
  ],
};

/** Cite: blackrock_depths.cpp:877+ Rocknot beer quest / bar break */
export const NPC_ROCKNOT_SCRIPT: ScriptDevIR = {
  name: 'npc_rocknot',
  boundCreatures: [NPC_PRIVATE_ROCKNOT],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [SPELL_DRUNKEN_RAGE],
  timers: [],
  questRewarded: [
    {
      questId: 4295,
      actions: [
        {
          kind: 'set_instance_data',
          field: TYPE_ROCKNOT,
          value: INSTANCE_DATA.SPECIAL,
          cite: 'blackrock_depths.cpp:1081-1107 ale count SPECIAL; 3 ales → DONE + Phalanx',
        },
        {
          kind: 'yell',
          textId: -1230000,
          cite: 'blackrock_depths.cpp:1097 DoScriptText SAY_GOT_BEER=-1230000',
        },
      ],
      cite: 'blackrock_depths.cpp:1081-1107 QuestRewarded Rocknot QUEST_ALE=4295',
    },
  ],
  cites: [
    'blackrock_depths.cpp:852-1107 npc_rocknot',
    'blackrock_depths.h:18 TYPE_ROCKNOT=3',
  ],
};

/** Cite: blackrock_depths.cpp:1156+ Marshal Windsor jail break escort FO6 */
export const NPC_MARSHAL_WINDSOR_SCRIPT: ScriptDevIR = {
  name: 'npc_marshal_windsor',
  boundCreatures: [NPC_MARSHAL_WINDSOR],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [SPELL_WINDSORS_FRENZY],
  timers: [],
  questRewarded: [],
  // QuestAccept 4322 is QI dbscript registry (already ported). Combat frenzy:
  lifecycle: {
    onAggro: [
      {
        kind: 'cast_self',
        spellId: SPELL_WINDSORS_FRENZY,
        castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
        cite: 'blackrock_depths.cpp:1241 DoCastSpellIfCan SPELL_WINDSORS_FRENZY TRIGGERED|AURA_NOT_PRESENT',
      },
    ],
  },
  cites: [
    'blackrock_depths.cpp:1148-1372 npc_marshal_windsor escort Jail Break',
    'blackrock_depths.h:22 TYPE_QUEST_JAIL_BREAK=7',
  ],
};

/** Cite: blackrock_depths.cpp Tobias Seecher jail escort */
export const NPC_TOBIAS_SEECHER_SCRIPT: ScriptDevIR = {
  name: 'npc_tobias_seecher',
  boundCreatures: [NPC_TOBIAS],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [],
  timers: [],
  unusedBindings: [
    {
      entry: NPC_TOBIAS,
      kind: 'creature',
      reason:
        'npc_tobias_seecher is a Jail Break escort (quest 4322 companion). Escort/waypoint combat is FO6 / dbscript-owned; no combat cast kit in ScriptDev body. Binding documented for census.',
      cite: 'blackrock_depths.cpp Tobias escort; blackrock_depths.h:51 NPC_TOBIAS=9679',
    },
  ],
  cites: ['blackrock_depths.cpp Jail Break Tobias escort', 'blackrock_depths.h:51'],
};

/** Cite: blackrock_depths.cpp Dughal Stormwing jail escort */
export const NPC_DUGHAL_STORMWING_SCRIPT: ScriptDevIR = {
  name: 'npc_dughal_stormwing',
  boundCreatures: [NPC_DUGHAL],
  sourceFile: 'eastern_kingdoms/blackrock_depths/blackrock_depths.cpp',
  spellIds: [],
  timers: [],
  unusedBindings: [
    {
      entry: NPC_DUGHAL,
      kind: 'creature',
      reason:
        'npc_dughal_stormwing is a Jail Break cell-release escort. Escort FO6 / dbscript-owned; no combat cast kit in ScriptDev body. Binding documented for census.',
      cite: 'blackrock_depths.cpp Dughal escort; blackrock_depths.h:52 NPC_DUGHAL=9022',
    },
  ],
  cites: ['blackrock_depths.cpp Jail Break Dughal escort', 'blackrock_depths.h:52'],
};

// instance_blackrock_depths

// instance_blackrock_depths. No creature_template.ScriptName — bound through instance_template for
// map 230 only. m_auiEncounter[13] runs TYPE_RING_OF_LAW through TYPE_NAGMARA.
export const INSTANCE_BLACKROCK_DEPTHS: ScriptDevIR = {
  name: 'instance_blackrock_depths',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/blackrock_depths/instance_blackrock_depths.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_DOOMREL,
      field: TYPE_TOMB_OF_SEVEN,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_blackrock_depths.cpp:537-538,486-493 NPC_DOOMREL tomb',
    },
    {
      creatureEntry: NPC_MAGMUS,
      field: TYPE_IRON_HALL,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'instance_blackrock_depths.cpp:465-466,496-497,540-541 Magmus Iron Hall',
    },
    {
      creatureEntry: NPC_HURLEY_BLACKBREATH,
      field: TYPE_HURLEY,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_blackrock_depths.cpp:543-544 NPC_HURLEY_BLACKBREATH',
    },
    {
      creatureEntry: NPC_AMBASSADOR_FLAMELASH,
      field: TYPE_FLAMELASH,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'boss_ambassador_flamelash.cpp:85-103; instance SetData TYPE_FLAMELASH (rune GO toggle only in SetData)',
    },
    {
      creatureEntry: NPC_WATCHER_DOOMGRIP,
      field: TYPE_VAULT,
      onDeath: INSTANCE_DATA.DONE,
      cite: 'instance_blackrock_depths.cpp:505-514 vault constructs + Doomgrip → DONE when empty',
    },
  ],
  doors: [
    {
      field: TYPE_TOMB_OF_SEVEN,
      goEntry: GO_TOMB_EXIT,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackrock_depths.cpp:278-279 TYPE_TOMB_OF_SEVEN DONE → GO_TOMB_EXIT',
    },
    {
      field: TYPE_IRON_HALL,
      goEntry: GO_THRONE_ROOM,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackrock_depths.cpp:307 TYPE_IRON_HALL DONE → GO_THRONE_ROOM',
    },
    {
      field: TYPE_VAULT,
      goEntry: GO_SECRET_DOOR,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackrock_depths.cpp:234 TYPE_VAULT DONE → GO_SECRET_DOOR',
    },
    {
      field: TYPE_LYCEUM,
      goEntry: GO_GOLEM_ROOM_N,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackrock_depths.cpp:286 TYPE_LYCEUM DONE → GO_GOLEM_ROOM_N',
    },
    {
      field: TYPE_LYCEUM,
      goEntry: GO_GOLEM_ROOM_S,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'instance_blackrock_depths.cpp:287 TYPE_LYCEUM DONE → GO_GOLEM_ROOM_S',
    },
  ],
  unusedBindings: [
    {
      entry: 0,
      kind: 'creature',
      reason:
        'instance_blackrock_depths has no creature_template.ScriptName - registered only via instance_template map 230 GetInstanceData. Corpus boundCreatures []. 13 TYPE_* encounters + bar/vault/tomb/lyceum/iron-hall door machine.',
      cite: 'instance_blackrock_depths.cpp:823-828 RegisterSelf Name=instance_blackrock_depths; blackrock_depths.h:10 MAX_ENCOUNTER=13',
    },
    {
      entry: NPC_SHILL,
      kind: 'creature',
      reason:
        'Shill Dinger 9678 is instance-stored for Jail Break (OnCreatureCreate) and death → TYPE_QUEST_JAIL_BREAK SPECIAL; no dedicated ScriptName AI body in blackrock_depths.cpp. Documented for corpus boundCreatures row.',
      cite: 'instance_blackrock_depths.cpp:73,516-521 NPC_SHILL jail break; blackrock_depths.h:48',
    },
  ],
  cites: [
    'instance_blackrock_depths.cpp:29-829',
    'instance_blackrock_depths.cpp:186-399 SetData',
    'instance_blackrock_depths.cpp:401-437 GetData',
    'blackrock_depths.h:8-145',
  ],
};
