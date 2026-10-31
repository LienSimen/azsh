// Stratholme ScriptDev IR ports. Source: boss_baroness_anastari, boss_maleki_the_pallid,
// boss_dathrohan_balnazzar, boss_cannon_master_willey and stratholme.cpp. Values cite file:line.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Spell / entry constants — from each cpp enum block

// boss_baroness_anastari.cpp:30–37
const SPELL_BANSHEE_WAIL = 16565;
const SPELL_BANSHEE_CURSE = 16867;
const SPELL_SILENCE = 18327;
const SPELL_POSSESS = 17244;
const SPELL_POSSESSED = 17246;
const SPELL_POSSESS_INV = 17250;
const NPC_BARONESS_ANASTARI = 10436;

// boss_maleki_the_pallid.cpp:29–35
const SPELL_FROST_ARMOR = 12556;
const SPELL_FROSTBOLT = 17503;
const SPELL_DRAIN_LIFE = 17238;
const SPELL_DRAIN_MANA = 17243;
const SPELL_ICE_TOMB = 16869;
const NPC_MALEKI = 10438;

// boss_cannon_master_willey.cpp:29–34
const SPELL_KNOCK_AWAY = 10101;
const SPELL_PUMMEL = 15615;
const SPELL_SHOOT = 16496;
const SPELL_SUMMON_RIFLEMAN = 17279;
const NPC_WILLEY = 10997;

// boss_dathrohan_balnazzar.cpp:35–50
const SPELL_CRUSADERSHAMMER = 17286;
const SPELL_CRUSADERSTRIKE = 17281;
const SPELL_HOLYSTRIKE = 17284;
const SPELL_BALNAZZARTRANSFORM = 17288;
const SPELL_SHADOWSHOCK = 17399;
const SPELL_MINDBLAST = 17287;
const SPELL_PSYCHICSCREAM = 13704;
const SPELL_SLEEP = 12098;
const SPELL_MINDCONTROL = 15690;
const NPC_DATHROHAN = 10812;
const NPC_BALNAZZAR = 10813;

// stratholme.h:10–23, 35–38, 56–65
const TYPE_BARONESS = 1;
const TYPE_NERUB = 2;
const TYPE_PALLID = 3;
const TYPE_RAMSTEIN = 4;
const TYPE_BARON = 5;
const NPC_NERUBENKAN = 10437;
const NPC_RAMSTEIN = 10439;
const NPC_BARON = 10440;
const NPC_ABOM_BILE = 10416;
const NPC_ABOM_VENOM = 10417;
const NPC_MINDLESS_UNDEAD = 11030;
const NPC_BLACK_GUARD = 10394;
const GO_ZIGGURAT_DOOR_1 = 175380; // Baroness
const GO_ZIGGURAT_DOOR_2 = 175379; // Nerub'enkan
const GO_ZIGGURAT_DOOR_3 = 175381; // Maleki
const GO_ZIGGURAT_DOOR_4 = 175405; // Ramstein slaughterhouse
const GO_PORT_SLAUGHTER_GATE = 175358;

/** stratholme.h:136 stratholmeLocation[2] — Ramstein SummonCreature. */
const RAMSTEIN_SUMMON = { x: 4032.643, y: -3378.546, z: 119.752, o: 4.74 };
/** stratholme.cpp:294 MovePoint → stratholmeLocation[5]. */
const RAMSTEIN_MOVE = { x: 4033.044, y: -3431.031, z: 119.055 };

// boss_baroness_anastari

// boss_baroness_anastari. Wail 0/2–3s, Curse 10s/20s, Silence 25s/25s, Possess 15s/30s on a random
// player. The possess AuraScript applies 17246+17250 and drops below 50%. Cite: cpp:66–205.
export const BOSS_BARONESS_ANASTARI: ScriptDevIR = {
  name: 'boss_baroness_anastari',
  boundCreatures: [NPC_BARONESS_ANASTARI],
  sourceFile: 'eastern_kingdoms/stratholme/boss_baroness_anastari.cpp',
  spellIds: [
    SPELL_BANSHEE_WAIL,
    SPELL_BANSHEE_CURSE,
    SPELL_SILENCE,
    SPELL_POSSESS,
    SPELL_POSSESSED,
    SPELL_POSSESS_INV,
  ],
  timers: [
    {
      id: 'banshee_wail',
      spellId: SPELL_BANSHEE_WAIL,
      // Reset m_uiBansheeWailTimer = 0 → first cast ASAP (line 68)
      initialMinMs: 0,
      initialMaxMs: 0,
      // urand(2000, 3000) on success (line 132)
      repeatMinMs: 2000,
      repeatMaxMs: 3000,
      target: 'hostile_random',
      cite: 'boss_baroness_anastari.cpp:68,126-133',
    },
    {
      id: 'banshee_curse',
      spellId: SPELL_BANSHEE_CURSE,
      // Reset = 10000 (line 69); re-arm 20000 (line 142); cast on self (AOE)
      initialMinMs: 10_000,
      initialMaxMs: 10_000,
      repeatMinMs: 20_000,
      repeatMaxMs: 20_000,
      target: 'self',
      cite: 'boss_baroness_anastari.cpp:69,138-145',
    },
    {
      id: 'silence',
      spellId: SPELL_SILENCE,
      // Reset = 25000 (line 70); re-arm 25000 (line 153)
      initialMinMs: 25_000,
      initialMaxMs: 25_000,
      repeatMinMs: 25_000,
      repeatMaxMs: 25_000,
      target: 'hostile_random',
      cite: 'boss_baroness_anastari.cpp:70,147-157',
    },
    {
      id: 'possess',
      spellId: SPELL_POSSESS,
      // Reset = 15000 (line 71); re-arm 30000 (line 168)
      initialMinMs: 15_000,
      initialMaxMs: 15_000,
      repeatMinMs: 30_000,
      repeatMaxMs: 30_000,
      // SelectAttackingTarget(RANDOM, 1, SPELL_POSSESS, SELECT_FLAG_PLAYER) (line 162)
      target: 'hostile_random_not_top_player',
      select: { playerOnly: true, skipTopThreat: true },
      cite: 'boss_baroness_anastari.cpp:71,159-173',
    },
  ],
  auraScripts: [
    {
      spellId: SPELL_POSSESS,
      charmBreakHpFrac: 0.5,
      periodMs: 1000,
      possessInvSpellId: SPELL_POSSESS_INV,
      leashThreatSizeLte: 1,
      onApply: [
        {
          kind: 'cast_helper',
          spellId: SPELL_POSSESSED,
          on: 'aura_target',
          cite: 'boss_baroness_anastari.cpp:188',
        },
        {
          kind: 'cast_helper',
          spellId: SPELL_POSSESS_INV,
          on: 'caster',
          cite: 'boss_baroness_anastari.cpp:189',
        },
        {
          kind: 'heal_full',
          on: 'aura_target',
          cite: 'boss_baroness_anastari.cpp:188 Possessed heal-to-full via 17246',
        },
        {
          kind: 'set_unattackable',
          on: 'caster',
          cite: 'boss_baroness_anastari.cpp:37 SPELL_POSSESS_INV school immune+invis+stun',
        },
        {
          kind: 'flavor',
          text: 'vanishes into the possessed body!',
          cite: 'product flavor for possess-inv apply',
        },
      ],
      onRemove: [
        {
          kind: 'remove_auras',
          spellId: SPELL_POSSESS_INV,
          on: 'caster',
          cite: 'boss_baroness_anastari.cpp:196',
        },
        {
          kind: 'remove_auras',
          spellId: SPELL_POSSESSED,
          on: 'aura_target',
          cite: 'boss_baroness_anastari.cpp:197',
        },
        {
          kind: 'clear_unattackable',
          on: 'caster',
          cite: 'boss_baroness_anastari.cpp:196 RemoveAurasDueToSpell POSSESS_INV',
        },
        {
          kind: 'flavor',
          text: 'breaks free of the possess!',
          cite: 'product flavor on possess break',
        },
      ],
      onPeriodic: [
        {
          kind: 'break_charm_if_hp_below',
          frac: 0.5,
          cite: 'boss_baroness_anastari.cpp:203-204 OnPeriodicTickEnd < 50%',
        },
      ],
      cite: 'boss_baroness_anastari.cpp:179-205 AnastariPossess',
    },
  ],
  lifecycle: {
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_BARONESS,
        value: INSTANCE_DATA.DONE,
        cite: 'stratholme.cpp:695 OnCreatureDeath NPC_BARONESS_ANASTARI',
      },
    ],
    onAggro: [
      {
        kind: 'set_instance_data',
        field: TYPE_BARONESS,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'stratholme.cpp:644 OnCreatureEnterCombat',
      },
    ],
  },
  cites: [
    'boss_baroness_anastari.cpp:30-216',
    'stratholme.cpp:644,668,695',
  ],
};

// boss_maleki_the_pallid

// boss_maleki_the_pallid. Frost Armor on reset; Frostbolt 0/3–4s, Ice Tomb 15s/15–20s, Drain Life
// 20s/15–20s, Drain Mana 30s/20–30s. Cite: boss_maleki_the_pallid.cpp:48–103.
export const BOSS_MALEKI_THE_PALLID: ScriptDevIR = {
  name: 'boss_maleki_the_pallid',
  boundCreatures: [NPC_MALEKI],
  sourceFile: 'eastern_kingdoms/stratholme/boss_maleki_the_pallid.cpp',
  // Frost Armor 12556 chills through 6136; a trigger payload resolves off the kit.
  spellIds: [
    SPELL_FROST_ARMOR,
    SPELL_FROSTBOLT,
    SPELL_DRAIN_LIFE,
    SPELL_DRAIN_MANA,
    SPELL_ICE_TOMB, 6136,
  ],
  timers: [
    {
      id: 'frost_armor',
      spellId: SPELL_FROST_ARMOR,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'boss_maleki_the_pallid.cpp:53',
    },
    {
      id: 'frostbolt',
      spellId: SPELL_FROSTBOLT,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 3000,
      repeatMaxMs: 4000,
      target: 'hostile_random',
      cite: 'boss_maleki_the_pallid.cpp:49,61-71',
    },
    {
      id: 'ice_tomb',
      spellId: SPELL_ICE_TOMB,
      initialMinMs: 15_000,
      initialMaxMs: 15_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 20_000,
      // SelectAttackingTarget(RANDOM, 1) — skip tank (line 76)
      target: 'hostile_random_not_top',
      select: { skipTopThreat: true },
      cite: 'boss_maleki_the_pallid.cpp:50,73-83',
    },
    {
      id: 'drain_life',
      spellId: SPELL_DRAIN_LIFE,
      initialMinMs: 20_000,
      initialMaxMs: 20_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 20_000,
      target: 'hostile_random',
      cite: 'boss_maleki_the_pallid.cpp:51,85-95',
    },
    {
      id: 'drain_mana',
      spellId: SPELL_DRAIN_MANA,
      initialMinMs: 30_000,
      initialMaxMs: 30_000,
      repeatMinMs: 20_000,
      repeatMaxMs: 30_000,
      // SELECT_FLAG_POWER_MANA (line 100)
      target: 'hostile_random_mana',
      select: { powerMana: true },
      cite: 'boss_maleki_the_pallid.cpp:48,97-107',
    },
  ],
  lifecycle: {
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_PALLID,
        value: INSTANCE_DATA.DONE,
        cite: 'stratholme.cpp:696 OnCreatureDeath NPC_MALEKI_THE_PALLID',
      },
    ],
    onAggro: [
      {
        kind: 'set_instance_data',
        field: TYPE_PALLID,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'stratholme.cpp:645',
      },
    ],
  },
  cites: ['boss_maleki_the_pallid.cpp:28-124', 'stratholme.cpp:645,669,696'],
};

// boss_cannon_master_willey

// boss_cannon_master_willey. Shoot 1s/3–4s while not in melee, Pummel 7s/12s, Knock Away 11s/14s,
// Summon Rifleman 15s/30s. Cite: boss_cannon_master_willey.cpp:47–99.
export const BOSS_CANNON_MASTER_WILLEY: ScriptDevIR = {
  name: 'boss_cannon_master_willey',
  boundCreatures: [NPC_WILLEY],
  sourceFile: 'eastern_kingdoms/stratholme/boss_cannon_master_willey.cpp',
  spellIds: [SPELL_KNOCK_AWAY, SPELL_PUMMEL, SPELL_SHOOT, SPELL_SUMMON_RIFLEMAN],
  timers: [
    {
      id: 'shoot',
      spellId: SPELL_SHOOT,
      initialMinMs: 1000,
      initialMaxMs: 1000,
      repeatMinMs: 3000,
      repeatMaxMs: 4000,
      target: 'hostile_random_not_in_melee',
      select: { notInMelee: true },
      cite: 'boss_cannon_master_willey.cpp:48,83-93',
    },
    {
      id: 'pummel',
      spellId: SPELL_PUMMEL,
      initialMinMs: 7000,
      initialMaxMs: 7000,
      repeatMinMs: 12_000,
      repeatMaxMs: 12_000,
      target: 'victim',
      cite: 'boss_cannon_master_willey.cpp:49,65-72',
    },
    {
      id: 'knock_away',
      spellId: SPELL_KNOCK_AWAY,
      initialMinMs: 11_000,
      initialMaxMs: 11_000,
      repeatMinMs: 14_000,
      repeatMaxMs: 14_000,
      target: 'victim',
      cite: 'boss_cannon_master_willey.cpp:50,74-81',
    },
    {
      id: 'summon_rifleman',
      spellId: SPELL_SUMMON_RIFLEMAN,
      initialMinMs: 15_000,
      initialMaxMs: 15_000,
      repeatMinMs: 30_000,
      repeatMaxMs: 30_000,
      target: 'self',
      cite: 'boss_cannon_master_willey.cpp:50,95-102',
    },
  ],
  cites: ['boss_cannon_master_willey.cpp:28-119'],
};

// boss_dathrohan_balnazzar

// boss_dathrohan_balnazzar. Phase 0 is Hammer / Strike / Mind Blast / Holy Strike; below 40% he
// transforms and phase 1 adds Shadow Shock, Psychic Scream, Sleep and Mind Control.
export const BOSS_DATHROHAN_BALNAZZAR: ScriptDevIR = {
  name: 'boss_dathrohan_balnazzar',
  boundCreatures: [NPC_DATHROHAN, NPC_BALNAZZAR],
  sourceFile: 'eastern_kingdoms/stratholme/boss_dathrohan_balnazzar.cpp',
  spellIds: [
    SPELL_CRUSADERSHAMMER,
    SPELL_CRUSADERSTRIKE,
    SPELL_HOLYSTRIKE,
    SPELL_BALNAZZARTRANSFORM,
    SPELL_SHADOWSHOCK,
    SPELL_MINDBLAST,
    SPELL_PSYCHICSCREAM,
    SPELL_SLEEP,
    SPELL_MINDCONTROL,
  ],
  timers: [
    // ---- Phase 0 (Dathrohan) — eventInversePhaseMask allows only phase 0 ----
    {
      id: 'mind_blast_p0',
      spellId: SPELL_MINDBLAST,
      initialMinMs: 6000,
      initialMaxMs: 6000,
      repeatMinMs: 15_000,
      repeatMaxMs: 20_000,
      target: 'victim',
      phase: 0,
      cite: 'boss_dathrohan_balnazzar.cpp:71,101-107',
    },
    {
      id: 'crusaders_hammer',
      spellId: SPELL_CRUSADERSHAMMER,
      initialMinMs: 8000,
      initialMaxMs: 8000,
      repeatMinMs: 12_000,
      repeatMaxMs: 12_000,
      target: 'victim',
      phase: 0,
      cite: 'boss_dathrohan_balnazzar.cpp:69,109-115',
    },
    {
      id: 'crusader_strike',
      spellId: SPELL_CRUSADERSTRIKE,
      initialMinMs: 12_000,
      initialMaxMs: 12_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 15_000,
      target: 'victim',
      phase: 0,
      cite: 'boss_dathrohan_balnazzar.cpp:70,117-123',
    },
    {
      id: 'holy_strike',
      spellId: SPELL_HOLYSTRIKE,
      initialMinMs: 18_000,
      initialMaxMs: 18_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 15_000,
      target: 'victim',
      phase: 0,
      cite: 'boss_dathrohan_balnazzar.cpp:72,125-131',
    },
    // ---- Phase 1 (Balnazzar) ----
    {
      id: 'mind_blast_p1',
      spellId: SPELL_MINDBLAST,
      initialMinMs: 6000,
      initialMaxMs: 6000,
      repeatMinMs: 15_000,
      repeatMaxMs: 20_000,
      target: 'victim',
      phase: 1,
      cite: 'boss_dathrohan_balnazzar.cpp:150-156',
    },
    {
      id: 'shadow_shock',
      spellId: SPELL_SHADOWSHOCK,
      // Reset ShadowShock = 4000 (line 73) — used after transform
      initialMinMs: 4000,
      initialMaxMs: 4000,
      repeatMinMs: 11_000,
      repeatMaxMs: 11_000,
      target: 'victim',
      phase: 1,
      cite: 'boss_dathrohan_balnazzar.cpp:73,158-164',
    },
    {
      id: 'psychic_scream',
      spellId: SPELL_PSYCHICSCREAM,
      initialMinMs: 16_000,
      initialMaxMs: 16_000,
      repeatMinMs: 20_000,
      repeatMaxMs: 20_000,
      target: 'hostile_random',
      phase: 1,
      cite: 'boss_dathrohan_balnazzar.cpp:74,166-174',
    },
    {
      id: 'deep_sleep',
      spellId: SPELL_SLEEP,
      initialMinMs: 20_000,
      initialMaxMs: 20_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 15_000,
      target: 'hostile_random',
      phase: 1,
      cite: 'boss_dathrohan_balnazzar.cpp:75,176-184',
    },
    {
      id: 'mind_control',
      spellId: SPELL_MINDCONTROL,
      initialMinMs: 10_000,
      initialMaxMs: 10_000,
      repeatMinMs: 15_000,
      repeatMaxMs: 15_000,
      target: 'victim',
      phase: 1,
      cite: 'boss_dathrohan_balnazzar.cpp:76,186-192',
    },
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 40,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_BALNAZZARTRANSFORM,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'boss_dathrohan_balnazzar.cpp:134-137',
        },
        {
          kind: 'update_entry',
          entry: NPC_BALNAZZAR,
          cite: 'boss_dathrohan_balnazzar.cpp:139',
        },
        {
          kind: 'yell',
          textId: -1329017,
          cite: 'boss_dathrohan_balnazzar.cpp:32,140 SAY_TRANSFORM',
        },
      ],
      cite: 'boss_dathrohan_balnazzar.cpp:133-145 GetHealthPercent() < 40.0f',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: -1329016,
        cite: 'boss_dathrohan_balnazzar.cpp:31,83-86 SAY_AGGRO',
      },
    ],
    onDeath: [
      {
        kind: 'yell',
        textId: -1329018,
        cite: 'boss_dathrohan_balnazzar.cpp:33,88-91 SAY_DEATH',
      },
    ],
  },
  cites: ['boss_dathrohan_balnazzar.cpp:28-210'],
};

// instance_stratholme

// instance_stratholme. Baroness, Maleki and Nerub'enkan deaths open their ziggurat doors, and
// TYPE_RAMSTEIN SPECIAL at abomCount 0 summons Ramstein. Cite: stratholme.cpp:244-328, :695-697.
export const INSTANCE_STRATHOLME: ScriptDevIR = {
  name: 'instance_stratholme',
  boundCreatures: [NPC_ABOM_BILE, NPC_ABOM_VENOM],
  sourceFile: 'eastern_kingdoms/stratholme/stratholme.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_BARONESS_ANASTARI,
      field: TYPE_BARONESS,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'stratholme.cpp:644,668,695; stratholme.h:15 TYPE_BARONESS=1',
    },
    {
      creatureEntry: NPC_NERUBENKAN,
      field: TYPE_NERUB,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'stratholme.cpp:646,670,697; stratholme.h:16 TYPE_NERUB=2',
    },
    {
      creatureEntry: NPC_MALEKI,
      field: TYPE_PALLID,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'stratholme.cpp:645,669,696; stratholme.h:17 TYPE_PALLID=3',
    },
    {
      creatureEntry: NPC_ABOM_BILE,
      field: TYPE_RAMSTEIN,
      onDeath: INSTANCE_DATA.SPECIAL,
      onAggro: INSTANCE_DATA.SPECIAL,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'stratholme.cpp:650-653,678-681,709-712 NPC_ABOM_BILE → TYPE_RAMSTEIN SPECIAL/FAIL',
    },
    {
      creatureEntry: NPC_ABOM_VENOM,
      field: TYPE_RAMSTEIN,
      onDeath: INSTANCE_DATA.SPECIAL,
      onAggro: INSTANCE_DATA.SPECIAL,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'stratholme.cpp:650-653,678-681,709-712 NPC_ABOM_VENOM → TYPE_RAMSTEIN SPECIAL/FAIL',
    },
    {
      creatureEntry: NPC_RAMSTEIN,
      field: TYPE_RAMSTEIN,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'stratholme.cpp:647,673-676,698; stratholme.h:18 TYPE_RAMSTEIN=4',
    },
    {
      creatureEntry: NPC_BARON,
      field: TYPE_BARON,
      onDeath: INSTANCE_DATA.DONE,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'stratholme.cpp:648,671,699; stratholme.h:19 TYPE_BARON=5',
    },
  ],
  doors: [
    {
      field: TYPE_BARONESS,
      goEntry: GO_ZIGGURAT_DOOR_1,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'stratholme.h:59 GO_ZIGGURAT_DOOR_1; stratholme.cpp:251',
    },
    {
      field: TYPE_NERUB,
      goEntry: GO_ZIGGURAT_DOOR_2,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'stratholme.h:60 GO_ZIGGURAT_DOOR_2; stratholme.cpp:251',
    },
    {
      field: TYPE_PALLID,
      goEntry: GO_ZIGGURAT_DOOR_3,
      openOn: [INSTANCE_DATA.DONE],
      cite: 'stratholme.h:61 GO_ZIGGURAT_DOOR_3; stratholme.cpp:251',
    },
    {
      field: TYPE_RAMSTEIN,
      goEntry: GO_ZIGGURAT_DOOR_4,
      openOn: [INSTANCE_DATA.SPECIAL],
      cite: 'stratholme.h:62 GO_ZIGGURAT_DOOR_4; stratholme.cpp:284-285 open; :309-310 close on DONE',
    },
  ],
  cites: [
    'stratholme.cpp:210-252 SetData',
    'stratholme.cpp:257-346 TYPE_RAMSTEIN SPECIAL summon / DONE mindless+guards',
    `stratholme.cpp:293-294 SummonCreature(${NPC_RAMSTEIN}) at (${RAMSTEIN_SUMMON.x},${RAMSTEIN_SUMMON.y},${RAMSTEIN_SUMMON.z}) MovePoint (${RAMSTEIN_MOVE.x},${RAMSTEIN_MOVE.y},${RAMSTEIN_MOVE.z})`,
    `stratholme.cpp:308-324 GO_PORT_SLAUGHTER_GATE ${GO_PORT_SLAUGHTER_GATE}; 5×${NPC_BLACK_GUARD}; Update :1193-1218 30×${NPC_MINDLESS_UNDEAD}`,
    'stratholme.cpp:640-699 OnCreatureEnterCombat/Evade/Death',
    'stratholme.cpp:1269-1274 AddSC_instance_stratholme',
    'stratholme.h:8-115',
  ],
};
