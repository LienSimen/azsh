// Gnomeregan ScriptDev IR ports. Source: boss_thermaplugg.cpp, gnomeregan.cpp and
// instance_gnomeregan.cpp. The multi-face continuous bomb pressure remains an engine GAP.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// Constants — gnomeregan.h + boss_thermaplugg.cpp + gnomeregan.cpp

// gnomeregan.h:10–16
export const GNOM_MAX_ENCOUNTER = 2;
export const GNOM_MAX_GNOME_FACES = 6;
export const TYPE_GRUBBIS = 1;
export const TYPE_THERMAPLUGG = 2;
export const TYPE_EXPLOSIVE_CHARGE = 3;

// gnomeregan.h:18–22 explosive charge data keys
export const DATA_EXPLOSIVE_CHARGE_1 = 1;
export const DATA_EXPLOSIVE_CHARGE_2 = 2;
export const DATA_EXPLOSIVE_CHARGE_3 = 3;
export const DATA_EXPLOSIVE_CHARGE_4 = 4;
export const DATA_EXPLOSIVE_CHARGE_USE = 5;

// gnomeregan.h:24–44 NPC / GO
export const NPC_BLASTMASTER_SHORTFUSE = 7998;
export const NPC_KERNOBEE = 7850;
export const NPC_CHOMPER = 6215;
export const NPC_GRUBBIS = 7361;
export const NPC_THERMAPLUGG = 7800;
export const NPC_WALKING_BOMB = 7915;

export const GO_RED_ROCKET = 103820;
export const GO_CAVE_IN_NORTH = 146085;
export const GO_CAVE_IN_SOUTH = 146086;
export const GO_EXPLOSIVE_CHARGE = 144065;
export const GO_THE_FINAL_CHAMBER = 142207;

export const GO_GNOME_FACE_1 = 142211;
export const GO_GNOME_FACE_2 = 142210;
export const GO_GNOME_FACE_3 = 142209;
export const GO_GNOME_FACE_4 = 142208;
export const GO_GNOME_FACE_5 = 142213;
export const GO_GNOME_FACE_6 = 142212;

export const GO_BUTTON_1 = 142214;
export const GO_BUTTON_2 = 142215;
export const GO_BUTTON_3 = 142216;
export const GO_BUTTON_4 = 142217;
export const GO_BUTTON_5 = 142218;
export const GO_BUTTON_6 = 142219;

/** All six gnomeface buttons. Cite: gnomeregan.h:39–44; boss_thermaplugg.cpp:272–277 */
export const GO_GNOMEFACE_BUTTONS = [
  GO_BUTTON_1,
  GO_BUTTON_2,
  GO_BUTTON_3,
  GO_BUTTON_4,
  GO_BUTTON_5,
  GO_BUTTON_6,
] as const;

// boss_thermaplugg.cpp:31–54 spells + texts
export const SAY_AGGRO = -1090024;
export const SAY_PHASE = -1090025;
export const SAY_BOMB = -1090026;
export const SAY_SLAY = -1090027;

export const SPELL_ACTIVATE_BOMB_A = 11511;
export const SPELL_ACTIVATE_BOMB_01 = 11518;
export const SPELL_ACTIVATE_BOMB_02 = 11521;
export const SPELL_ACTIVATE_BOMB_03 = 11523;
export const SPELL_ACTIVATE_BOMB_04 = 11524;
export const SPELL_ACTIVATE_BOMB_05 = 11526;
export const SPELL_ACTIVATE_BOMB_06 = 11527;
export const SPELL_ACTIVATE_BOMB_B = 11795;
export const SPELL_ACTIVATE_BOMB_01B = 11796;
export const SPELL_ACTIVATE_BOMB_02B = 11797;
export const SPELL_ACTIVATE_BOMB_03B = 11798;
export const SPELL_ACTIVATE_BOMB_04B = 11799;
export const SPELL_ACTIVATE_BOMB_05B = 11800;
export const SPELL_ACTIVATE_BOMB_06B = 11801;
export const SPELL_KNOCK_AWAY = 10101;
export const SPELL_KNOCK_AWAY_AOE = 11130;
export const SPELL_WALKING_BOMB_EFFECT = 11504;

// gnomeregan.cpp:72–74 escort spells
export const SPELL_EXPLOSION_NORTH = 12158;
export const SPELL_EXPLOSION_SOUTH = 12159;
export const SPELL_FIREWORKS_RED = 11542;

// gnomeregan.cpp:639 quest
export const QUEST_A_FINE_MESS = 2904;

/** HP phase threshold. Cite: boss_thermaplugg.cpp:181 GetHealthPercent() < 50.0f */
export const THERMAPLUGG_HP_PHASE_2 = 50;

/** Knock Away init. Cite: boss_thermaplugg.cpp:81 m_uiKnockAwayTimer = urand(12000, 20000) */
export const KNOCK_AWAY_INIT_MIN_MS = 12_000;
export const KNOCK_AWAY_INIT_MAX_MS = 20_000;
/** Knock Away p1 re-arm. Cite: boss_thermaplugg.cpp:197 urand(17000, 20000) */
export const KNOCK_AWAY_P1_REPEAT_MIN_MS = 17_000;
export const KNOCK_AWAY_P1_REPEAT_MAX_MS = 20_000;
/** Knock Away AOE p2 re-arm. Cite: boss_thermaplugg.cpp:192 m_uiKnockAwayTimer = 12000 */
export const KNOCK_AWAY_P2_REPEAT_MS = 12_000;

/** Activate Bomb init. Cite: boss_thermaplugg.cpp:82 m_uiActivateBombTimer = urand(10000, 15000) */
export const ACTIVATE_BOMB_INIT_MIN_MS = 10_000;
export const ACTIVATE_BOMB_INIT_MAX_MS = 15_000;
/** Activate Bomb p1 re-arm. Cite: boss_thermaplugg.cpp:207 urand(12, 17) * IN_MILLISECONDS */
export const ACTIVATE_BOMB_P1_REPEAT_MIN_MS = 12_000;
export const ACTIVATE_BOMB_P1_REPEAT_MAX_MS = 17_000;
/** Activate Bomb p2 re-arm. Cite: boss_thermaplugg.cpp:207 urand(6, 12) * IN_MILLISECONDS */
export const ACTIVATE_BOMB_P2_REPEAT_MIN_MS = 6_000;
export const ACTIVATE_BOMB_P2_REPEAT_MAX_MS = 12_000;

/** First bomb-face spawn delay after activation. Cite: instance_gnomeregan.cpp:259 m_uiBombTimer = 3000 */
export const BOMB_FACE_FIRST_SPAWN_MS = 3000;
/** Bomb-face re-spawn range. Cite: boss_thermaplugg.cpp:232 urand(10000, 25000) */
export const BOMB_FACE_RESPAWN_MIN_MS = 10_000;
export const BOMB_FACE_RESPAWN_MAX_MS = 25_000;

// Runtime phase map, host-0-based: 0 is phase one, 1 is phase two after the 50% flip.
// Cite: boss_thermaplugg.cpp:68, :181-185.
export const THERMAPLUGG_PHASE_1 = 0;
export const THERMAPLUGG_PHASE_2 = 1;

// boss_thermaplugg

// boss_thermaplugg, creature 7800. Knock Away urand(12–20)s then 17–20s in phase 1 and the AOE
// every 12s in phase 2; Activate Bomb A 12–17s, B 6–12s. Below 50% once he flips phase.
export const BOSS_THERMAPLUGG: ScriptDevIR = {
  name: 'boss_thermaplugg',
  boundCreatures: [NPC_THERMAPLUGG],
  sourceFile: 'eastern_kingdoms/gnomeregan/boss_thermaplugg.cpp',
  spellIds: [
    SPELL_ACTIVATE_BOMB_A,
    SPELL_ACTIVATE_BOMB_01,
    SPELL_ACTIVATE_BOMB_02,
    SPELL_ACTIVATE_BOMB_03,
    SPELL_ACTIVATE_BOMB_04,
    SPELL_ACTIVATE_BOMB_05,
    SPELL_ACTIVATE_BOMB_06,
    SPELL_ACTIVATE_BOMB_B,
    SPELL_ACTIVATE_BOMB_01B,
    SPELL_ACTIVATE_BOMB_02B,
    SPELL_ACTIVATE_BOMB_03B,
    SPELL_ACTIVATE_BOMB_04B,
    SPELL_ACTIVATE_BOMB_05B,
    SPELL_ACTIVATE_BOMB_06B,
    SPELL_KNOCK_AWAY,
    SPELL_KNOCK_AWAY_AOE,
    SPELL_WALKING_BOMB_EFFECT,
  ],
  timers: [
    {
      id: 'knock_away',
      spellId: SPELL_KNOCK_AWAY,
      // Reset urand(12000, 20000) (cpp:81)
      initialMinMs: KNOCK_AWAY_INIT_MIN_MS,
      initialMaxMs: KNOCK_AWAY_INIT_MAX_MS,
      // CAST_OK re-arm urand(17000, 20000) phase 1 (cpp:197)
      repeatMinMs: KNOCK_AWAY_P1_REPEAT_MIN_MS,
      repeatMaxMs: KNOCK_AWAY_P1_REPEAT_MAX_MS,
      target: 'victim',
      phase: THERMAPLUGG_PHASE_1,
      cite: 'boss_thermaplugg.cpp:81,187-198 phase1 Knock Away victim',
    },
    {
      id: 'knock_away_aoe',
      spellId: SPELL_KNOCK_AWAY_AOE,
      // The same timer continues into phase 2, re-arming at a fixed 12000 (cpp:192). The host arms
      // a phase-2-only entry whose init matches that re-arm, so the first p2 cast lands promptly.
      initialMinMs: KNOCK_AWAY_P2_REPEAT_MS,
      initialMaxMs: KNOCK_AWAY_P2_REPEAT_MS,
      repeatMinMs: KNOCK_AWAY_P2_REPEAT_MS,
      repeatMaxMs: KNOCK_AWAY_P2_REPEAT_MS,
      target: 'self',
      phase: THERMAPLUGG_PHASE_2,
      cite: 'boss_thermaplugg.cpp:189-192 phase2 Knock Away AOE self re-arm 12000',
    },
    {
      id: 'activate_bomb_a',
      spellId: SPELL_ACTIVATE_BOMB_A,
      // Reset urand(10000, 15000) (cpp:82)
      initialMinMs: ACTIVATE_BOMB_INIT_MIN_MS,
      initialMaxMs: ACTIVATE_BOMB_INIT_MAX_MS,
      // CAST_OK re-arm urand(12,17)*1000 phase 1 (cpp:207)
      repeatMinMs: ACTIVATE_BOMB_P1_REPEAT_MIN_MS,
      repeatMaxMs: ACTIVATE_BOMB_P1_REPEAT_MAX_MS,
      target: 'self',
      phase: THERMAPLUGG_PHASE_1,
      cite: 'boss_thermaplugg.cpp:82,203-210 phase1 Activate Bomb A',
    },
    {
      id: 'activate_bomb_b',
      spellId: SPELL_ACTIVATE_BOMB_B,
      // Phase 2 uses SPELL_ACTIVATE_BOMB_B; re-arm urand(6,12)*1000 (cpp:205-207)
      initialMinMs: ACTIVATE_BOMB_P2_REPEAT_MIN_MS,
      initialMaxMs: ACTIVATE_BOMB_P2_REPEAT_MAX_MS,
      repeatMinMs: ACTIVATE_BOMB_P2_REPEAT_MIN_MS,
      repeatMaxMs: ACTIVATE_BOMB_P2_REPEAT_MAX_MS,
      target: 'self',
      phase: THERMAPLUGG_PHASE_2,
      cite: 'boss_thermaplugg.cpp:205-207 phase2 Activate Bomb B',
    },
  ],
  phases: [
    {
      phase: THERMAPLUGG_PHASE_2,
      hpBelowPct: THERMAPLUGG_HP_PHASE_2,
      actions: [
        {
          kind: 'yell',
          textId: SAY_PHASE,
          cite: 'boss_thermaplugg.cpp:183 DoScriptText SAY_PHASE',
        },
        {
          kind: 'flavor',
          text: 'enters phase two - bomb faces accelerate!',
          cite: 'boss_thermaplugg.cpp:181-185 m_bIsPhaseTwo=true; faster bomb + AOE knock',
        },
        {
          // Product stand-in for first face activation unit (survey D-4 degraded model).
          // Continuous multi-face 10–25s respawns remain an engine GAP.
          kind: 'summon',
          creatureEntry: NPC_WALKING_BOMB,
          cite: 'boss_thermaplugg.cpp:231 SummonCreature NPC_WALKING_BOMB on active face; product: one unit at phase flip',
        },
      ],
      cite: 'boss_thermaplugg.cpp:181-185 GetHealthPercent() < 50.0f → phase two once',
    },
  ],
  lifecycle: {
    onAggro: [
      {
        kind: 'yell',
        textId: SAY_AGGRO,
        cite: 'boss_thermaplugg.cpp:116 DoScriptText SAY_AGGRO',
      },
      {
        kind: 'set_instance_data',
        field: TYPE_THERMAPLUGG,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'boss_thermaplugg.cpp:120 SetData(TYPE_THERMAPLUGG, IN_PROGRESS)',
      },
    ],
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_THERMAPLUGG,
        value: INSTANCE_DATA.DONE,
        cite: 'boss_thermaplugg.cpp:109 SetData(TYPE_THERMAPLUGG, DONE)',
      },
    ],
    onEvade: [
      {
        kind: 'set_instance_data',
        field: TYPE_THERMAPLUGG,
        value: INSTANCE_DATA.FAIL,
        cite: 'boss_thermaplugg.cpp:132 JustReachedHome SetData(TYPE_THERMAPLUGG, FAIL)',
      },
    ],
  },
  cites: [
    'boss_thermaplugg.cpp:28-296',
    'boss_thermaplugg.cpp:79-88 Reset',
    'boss_thermaplugg.cpp:165-241 UpdateAI',
    'boss_thermaplugg.cpp:249-261 ActivateBombThermaplugg SpellScript',
    'gnomeregan.h:15 TYPE_THERMAPLUGG=2; :54 NPC_WALKING_BOMB via cpp:54',
  ],
};

// go_gnomeface_button

// GOUse_go_gnomeface_button, GO 142214–142219: each button deactivates its bomb face. The GO use
// is a no-op shell so the ScriptName ports; face-timer state is instance runtime GAP.
export const GO_GNOMEFACE_BUTTON: ScriptDevIR = {
  name: 'go_gnomeface_button',
  boundCreatures: [],
  boundGos: [...GO_GNOMEFACE_BUTTONS],
  sourceFile: 'eastern_kingdoms/gnomeregan/boss_thermaplugg.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [...GO_GNOMEFACE_BUTTONS],
    actions: [
      {
        kind: 'flavor',
        text: 'deactivates a gnomeface bomb vent.',
        cite: 'boss_thermaplugg.cpp:269-277 DoDeactivateBombFace(index) per GO_BUTTON_1..6',
      },
    ],
    cite: 'boss_thermaplugg.cpp:263-281 GOUse_go_gnomeface_button',
  },
  cites: [
    'boss_thermaplugg.cpp:263-281 go_gnomeface_button',
    'boss_thermaplugg.cpp:291-293 RegisterSelf Name=go_gnomeface_button',
    'gnomeregan.h:39-44 GO_BUTTON_1..6 = 142214-142219',
  ],
};

// npc_blastmaster_emi_shortfuse

// npc_blastmaster_emi_shortfuse, creature 7998 — the Grubbis cave-in escort, not a boss kit.
// Combat timers are empty; the InstanceDef waves own the player-paced pack kill supply.
export const NPC_BLASTMASTER_EMI_SHORTFUSE: ScriptDevIR = {
  name: 'npc_blastmaster_emi_shortfuse',
  boundCreatures: [NPC_BLASTMASTER_SHORTFUSE],
  sourceFile: 'eastern_kingdoms/gnomeregan/gnomeregan.cpp',
  spellIds: [SPELL_EXPLOSION_NORTH, SPELL_EXPLOSION_SOUTH, SPELL_FIREWORKS_RED],
  timers: [],
  lifecycle: {
    onAggro: [
      {
        // AttackedBy one-shot defend text (random SAY_AGGRO_1 / SAY_AGGRO_2).
        kind: 'yell',
        textId: -1090007,
        cite: 'gnomeregan.cpp:242-243 AttackedBy SAY_AGGRO_1 / SAY_AGGRO_2 once per combat',
      },
    ],
    onDeath: [
      {
        kind: 'set_instance_data',
        field: TYPE_GRUBBIS,
        value: INSTANCE_DATA.FAIL,
        cite: 'gnomeregan.cpp:251 SetData(TYPE_GRUBBIS, FAIL) on Emi death',
      },
    ],
  },
  gossipHello: {
    // Gossip only when NOT_STARTED or FAIL (cpp:605-609). Default text = creature gossip.
    defaultTextId: 0,
    branches: [
      {
        gates: [
          {
            field: TYPE_GRUBBIS,
            equals: INSTANCE_DATA.NOT_STARTED,
            cite: 'gnomeregan.cpp:605 GetData(TYPE_GRUBBIS) == NOT_STARTED',
          },
        ],
        textId: 0,
        cite: 'gnomeregan.cpp:605-608 gossip start item when NOT_STARTED',
      },
      {
        gates: [
          {
            field: TYPE_GRUBBIS,
            equals: INSTANCE_DATA.FAIL,
            cite: 'gnomeregan.cpp:605 GetData(TYPE_GRUBBIS) == FAIL',
          },
        ],
        textId: 0,
        cite: 'gnomeregan.cpp:605-608 gossip start item when FAIL',
      },
    ],
    cite: 'gnomeregan.cpp:601-612 GossipHello_npc_blastmaster_emi_shortfuse',
  },
  unusedBindings: [
    {
      entry: NPC_CHOMPER,
      kind: 'creature',
      reason:
        'Chomper 6215 is summon-only pack-7 companion of Grubbis (asSummonInfo[7]); no ScriptName AI body in gnomeregan.cpp - escort SummonCreature only.',
      cite: 'gnomeregan.cpp:79,130-131 NPC_CHOMPER pack 7; corpus boundCreatures includes 6215',
    },
  ],
  cites: [
    'gnomeregan.cpp:36-630 npc_blastmaster_emi_shortfuse',
    'gnomeregan.cpp:72-74 SPELL_EXPLOSION_NORTH/SOUTH + FIREWORKS_RED',
    'gnomeregan.cpp:90-131 asSummonInfo packs 1-7',
    'gnomeregan.cpp:265-275 StartEvent SetData TYPE_GRUBBIS IN_PROGRESS',
    'gnomeregan.h:24 NPC_BLASTMASTER_SHORTFUSE=7998',
  ],
};

// npc_kernobee

// npc_kernobee, creature 7850. FollowerAI for quest 2904: within 2× INTERACTION_DISTANCE of the
// end position it completes, gives explore credit and despawns. No combat cast schedule.
export const NPC_KERNOBEE_SCRIPT: ScriptDevIR = {
  name: 'npc_kernobee',
  boundCreatures: [NPC_KERNOBEE],
  sourceFile: 'eastern_kingdoms/gnomeregan/gnomeregan.cpp',
  spellIds: [],
  timers: [],
  questRewarded: [
    {
      // QuestAccept path credits explored on reach — model as quest hook inventory.
      questId: QUEST_A_FINE_MESS,
      actions: [
        {
          kind: 'quest_credit',
          entry: NPC_KERNOBEE,
          cite: 'gnomeregan.cpp:684-685 RewardPlayerAndGroupAtEventExplored QUEST_A_FINE_MESS',
        },
        {
          kind: 'force_despawn',
          delayMs: 2000,
          cite: 'gnomeregan.cpp:687 ForcedDespawn(2000) after walk-out MovePoint',
        },
      ],
      cite: 'gnomeregan.cpp:700-706 QuestAccept_npc_kernobee → follower end credit',
    },
  ],
  cites: [
    'gnomeregan.cpp:632-706 npc_kernobee',
    'gnomeregan.cpp:639 QUEST_A_FINE_MESS=2904',
    'gnomeregan.cpp:643-647 aKernobeePositions end + walk-out',
    'gnomeregan.cpp:653 m_uiCheckEndposTimer = 10000 then 500',
  ],
};

// instance_gnomeregan

// instance_gnomeregan, m_auiEncounter[2]: TYPE_GRUBBIS from Emi's event and TYPE_THERMAPLUGG from
// the boss, which locks the Final Chamber. Bound via instance_template for map 90 only.
export const INSTANCE_GNOMEREGAN: ScriptDevIR = {
  name: 'instance_gnomeregan',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/gnomeregan/instance_gnomeregan.cpp',
  spellIds: [],
  timers: [],
  encounters: [
    {
      creatureEntry: NPC_GRUBBIS,
      field: TYPE_GRUBBIS,
      onDeath: INSTANCE_DATA.DONE,
      // Aggro/start is Emi StartEvent, not Grubbis aggro.
      cite: 'gnomeregan.cpp:202-206 Grubbis death → TYPE_GRUBBIS DONE; h:14 TYPE_GRUBBIS=1',
    },
    {
      creatureEntry: NPC_THERMAPLUGG,
      field: TYPE_THERMAPLUGG,
      onAggro: INSTANCE_DATA.IN_PROGRESS,
      onDeath: INSTANCE_DATA.DONE,
      onEvade: INSTANCE_DATA.FAIL,
      cite: 'boss_thermaplugg.cpp:109,120,132; instance_gnomeregan.cpp:166-194 TYPE_THERMAPLUGG; h:15',
    },
  ],
  doors: [
    {
      // Final Chamber unlocks when Thermaplugg is DONE or FAIL (cpp:181-189).
      // Product door binding opens on DONE (route credit); FAIL also unlocks in cpp.
      field: TYPE_THERMAPLUGG,
      goEntry: GO_THE_FINAL_CHAMBER,
      openOn: [INSTANCE_DATA.DONE, INSTANCE_DATA.FAIL],
      cite: 'instance_gnomeregan.cpp:181-189 DONE/FAIL → unlock GO_THE_FINAL_CHAMBER 142207',
    },
  ],
  unusedBindings: [
    {
      entry: GO_RED_ROCKET,
      kind: 'go',
      reason:
        'Red Rocket GOs respawn on TYPE_GRUBBIS DONE (cpp:130-131) - map object, not a ScriptName binding.',
      cite: 'instance_gnomeregan.cpp:130-131; gnomeregan.h:26 GO_RED_ROCKET=103820',
    },
  ],
  cites: [
    'instance_gnomeregan.cpp:29-287 instance body',
    'instance_gnomeregan.cpp:78-210 SetData GRUBBIS/THERMAPLUGG/EXPLOSIVE_CHARGE',
    'instance_gnomeregan.cpp:250-274 DoActivateBombFace / DoDeactivateBombFace',
    'gnomeregan.h:8-85',
    'AddSC Name=instance_gnomeregan - instance_template map 90, no creature_template.ScriptName',
  ],
};
