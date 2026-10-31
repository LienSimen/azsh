// Moonglade ScriptDev IR ports. Source: scripts/kalimdor/moonglade.cpp — npc_keeper_remulos,
// boss_eranikus and go_omen_cluster. Eranikus 15491 and GO 180859 are absent from the bake.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// Shared constants — moonglade.cpp enum block

// moonglade.cpp:42–60
/** Cite: moonglade.cpp:42 SPELL_CONJURE_RIFT = 25813 */
export const SPELL_CONJURE_RIFT = 25813;
/** Cite: moonglade.cpp:43 SPELL_DRAGON_HOVER = 18430 */
export const SPELL_DRAGON_HOVER = 18430;
/** Cite: moonglade.cpp:44 SPELL_HEALING_TOUCH = 23381 */
export const SPELL_HEALING_TOUCH = 23381;
/** Cite: moonglade.cpp:45 SPELL_REGROWTH = 20665 */
export const SPELL_REGROWTH = 20665;
/** Cite: moonglade.cpp:46 SPELL_REJUVENATION = 20664 */
export const SPELL_REJUVENATION = 20664;
/** Cite: moonglade.cpp:47 SPELL_STARFIRE = 21668 */
export const SPELL_STARFIRE = 21668;
/** Cite: moonglade.cpp:48 SPELL_ERANIKUS_REDEEMED = 25846 */
export const SPELL_ERANIKUS_REDEEMED = 25846;

/** Cite: moonglade.cpp:51 NPC_ERANIKUS_TYRANT = 15491 */
export const NPC_ERANIKUS_TYRANT = 15491;
/** Cite: moonglade.cpp:52 NPC_NIGHTMARE_PHANTASM = 15629 */
export const NPC_NIGHTMARE_PHANTASM = 15629;
/** Cite: moonglade.cpp:53 NPC_REMULOS = 11832 */
export const NPC_REMULOS = 11832;
/** Cite: moonglade.cpp:54 NPC_TYRANDE_WHISPERWIND = 15633 */
export const NPC_TYRANDE_WHISPERWIND = 15633;
/** Cite: moonglade.cpp:55 NPC_ELUNE_PRIESTESS = 15634 */
export const NPC_ELUNE_PRIESTESS = 15634;
/** Cite: moonglade.cpp:56 NPC_NIGHTHAVEN_DEFENDER = 15495 */
export const NPC_NIGHTHAVEN_DEFENDER = 15495;

/** Cite: moonglade.cpp:58 FACTION_CENARION_CIRCLE = 996 */
export const FACTION_CENARION_CIRCLE = 996;

/** Cite: moonglade.cpp:60 QUEST_NIGHTMARE_MANIFESTS = 8736 */
export const QUEST_NIGHTMARE_MANIFESTS = 8736;

// Yells — chronological (moonglade.cpp:63–109)
/** Cite: moonglade.cpp:63 SAY_REMULOS_INTRO_1 = -1000669 */
export const SAY_REMULOS_INTRO_1 = -1_000_669;
/** Cite: moonglade.cpp:64 SAY_REMULOS_INTRO_2 = -1000670 */
export const SAY_REMULOS_INTRO_2 = -1_000_670;
/** Cite: moonglade.cpp:65 SAY_REMULOS_INTRO_3 = -1000671 */
export const SAY_REMULOS_INTRO_3 = -1_000_671;
/** Cite: moonglade.cpp:66 SAY_REMULOS_INTRO_4 = -1000672 */
export const SAY_REMULOS_INTRO_4 = -1_000_672;
/** Cite: moonglade.cpp:67 SAY_REMULOS_INTRO_5 = -1000673 */
export const SAY_REMULOS_INTRO_5 = -1_000_673;
/** Cite: moonglade.cpp:69 EMOTE_SUMMON_ERANIKUS = -1000674 */
export const EMOTE_SUMMON_ERANIKUS = -1_000_674;
/** Cite: moonglade.cpp:70 SAY_ERANIKUS_SPAWN = -1000675 */
export const SAY_ERANIKUS_SPAWN = -1_000_675;
/** Cite: moonglade.cpp:79 SAY_REMULOS_DEFEND_1 = -1000682 */
export const SAY_REMULOS_DEFEND_1 = -1_000_682;
/** Cite: moonglade.cpp:80 SAY_REMULOS_DEFEND_2 = -1000683 */
export const SAY_REMULOS_DEFEND_2 = -1_000_683;
/** Cite: moonglade.cpp:81 SAY_ERANIKUS_SHADOWS = -1000684 */
export const SAY_ERANIKUS_SHADOWS = -1_000_684;
/** Cite: moonglade.cpp:82 SAY_REMULOS_DEFEND_3 = -1000685 */
export const SAY_REMULOS_DEFEND_3 = -1_000_685;
/** Cite: moonglade.cpp:83 SAY_ERANIKUS_ATTACK_1 = -1000686 */
export const SAY_ERANIKUS_ATTACK_1 = -1_000_686;
/** Cite: moonglade.cpp:84 SAY_ERANIKUS_ATTACK_2 = -1000687 */
export const SAY_ERANIKUS_ATTACK_2 = -1_000_687;
/** Cite: moonglade.cpp:85 SAY_ERANIKUS_ATTACK_3 = -1000688 */
export const SAY_ERANIKUS_ATTACK_3 = -1_000_688;
/** Cite: moonglade.cpp:86 SAY_ERANIKUS_KILL = -1000706 */
export const SAY_ERANIKUS_KILL = -1_000_706;
/** Cite: moonglade.cpp:88 SAY_TYRANDE_APPEAR = -1000689 */
export const SAY_TYRANDE_APPEAR = -1_000_689;
/** Cite: moonglade.cpp:89 SAY_TYRANDE_HEAL = -1000690 */
export const SAY_TYRANDE_HEAL = -1_000_690;
/** Cite: moonglade.cpp:90 SAY_TYRANDE_FORGIVEN_1 = -1000691 */
export const SAY_TYRANDE_FORGIVEN_1 = -1_000_691;
/** Cite: moonglade.cpp:91 SAY_TYRANDE_FORGIVEN_2 = -1000692 */
export const SAY_TYRANDE_FORGIVEN_2 = -1_000_692;
/** Cite: moonglade.cpp:92 SAY_TYRANDE_FORGIVEN_3 = -1000693 */
export const SAY_TYRANDE_FORGIVEN_3 = -1_000_693;
/** Cite: moonglade.cpp:93 SAY_ERANIKUS_DEFEAT_1 = -1000694 */
export const SAY_ERANIKUS_DEFEAT_1 = -1_000_694;
/** Cite: moonglade.cpp:94 SAY_ERANIKUS_DEFEAT_2 = -1000695 */
export const SAY_ERANIKUS_DEFEAT_2 = -1_000_695;
/** Cite: moonglade.cpp:95 SAY_ERANIKUS_DEFEAT_3 = -1000696 */
export const SAY_ERANIKUS_DEFEAT_3 = -1_000_696;
/** Cite: moonglade.cpp:96 EMOTE_ERANIKUS_REDEEM = -1000697 */
export const EMOTE_ERANIKUS_REDEEM = -1_000_697;
/** Cite: moonglade.cpp:100 EMOTE_TYRANDE_KNEEL = -1000698 */
export const EMOTE_TYRANDE_KNEEL = -1_000_698;
/** Cite: moonglade.cpp:101 SAY_TYRANDE_REDEEMED = -1000699 */
export const SAY_TYRANDE_REDEEMED = -1_000_699;
/** Cite: moonglade.cpp:103 SAY_REDEEMED_1 = -1000700 */
export const SAY_REDEEMED_1 = -1_000_700;
/** Cite: moonglade.cpp:104 SAY_REDEEMED_2 = -1000701 */
export const SAY_REDEEMED_2 = -1_000_701;
/** Cite: moonglade.cpp:105 SAY_REDEEMED_3 = -1000702 */
export const SAY_REDEEMED_3 = -1_000_702;
/** Cite: moonglade.cpp:106 SAY_REDEEMED_4 = -1000703 */
export const SAY_REDEEMED_4 = -1_000_703;
/** Cite: moonglade.cpp:108 SAY_REMULOS_OUTRO_1 = -1000704 */
export const SAY_REMULOS_OUTRO_1 = -1_000_704;
/** Cite: moonglade.cpp:109 SAY_REMULOS_OUTRO_2 = -1000705 */
export const SAY_REMULOS_OUTRO_2 = -1_000_705;

/** Cite: moonglade.cpp:111 POINT_ID_ERANIKUS_FLIGHT = 1 */
export const POINT_ID_ERANIKUS_FLIGHT = 1;
/** Cite: moonglade.cpp:112 POINT_ID_ERANIKUS_COMBAT = 2 */
export const POINT_ID_ERANIKUS_COMBAT = 2;
/** Cite: moonglade.cpp:113 POINT_ID_ERANIKUS_REDEEMED = 3 */
export const POINT_ID_ERANIKUS_REDEEMED = 3;

/** Cite: moonglade.cpp:115 MAX_SHADOWS = 3 */
export const MAX_SHADOWS = 3;
/** Cite: moonglade.cpp:116 MAX_DEFENDERS = 10 */
export const MAX_DEFENDERS = 10;
/** Cite: moonglade.cpp:117 MAX_SUMMON_TURNS = 10 */
export const MAX_SUMMON_TURNS = 10;

// boss_eranikus enums — moonglade.cpp:528–540
/** Cite: moonglade.cpp:529 NPC_ERANIKUS_REDEEMED = 15628 */
export const NPC_ERANIKUS_REDEEMED = 15628;
/** Cite: moonglade.cpp:531 SPELL_ACID_BREATH = 24839 */
export const SPELL_ACID_BREATH = 24839;
/** Cite: moonglade.cpp:532 SPELL_NOXIOUS_BREATH = 24818 */
export const SPELL_NOXIOUS_BREATH = 24818;
/** Cite: moonglade.cpp:533 SPELL_SHADOWBOLT_VOLLEY = 25586 */
export const SPELL_SHADOWBOLT_VOLLEY = 25586;
/** Cite: moonglade.cpp:534 SPELL_ARCANE_CHANNELING = 23017 */
export const SPELL_ARCANE_CHANNELING = 23017;
/** Cite: moonglade.cpp:536 FACTION_FRIENDLY = 35 */
export const FACTION_FRIENDLY = 35;
/** Cite: moonglade.cpp:537 MAX_PRIESTESS = 7 */
export const MAX_PRIESTESS = 7;
/** Cite: moonglade.cpp:98 PRIESTESS_MOUNT_ID = 9695 */
export const PRIESTESS_MOUNT_ID = 9695;

// go_omen_cluster / world map TYPE_OMEN encounter field on world kalimdor map. Cite: world_kalimdor.h:44
// TYPE_OMEN = 0
export const TYPE_OMEN = 0;

/** Cluster Launcher GO entry (scriptdev2.sql go_omen_cluster). Cite: scriptdev2.sql:419 entry=180859 */
export const GO_OMEN_CLUSTER = 180859;

// Timer constants — Remulos combat

// Heal timer. Reset 10s; always re-arm 10s after pick. Cite: moonglade.cpp:206 m_healTimer = 10 *
// IN_MILLISECONDS; :483 re-arm 10s
export const REMULOS_HEAL_MS = 10_000;

// Starfire timer. Reset 25s; CAST_OK re-arm 20s. Cite: moonglade.cpp:207 m_starfireTimer = 25 *
// IN_MILLISECONDS; :493 20s
export const REMULOS_STARFIRE_INIT_MS = 25_000;
export const REMULOS_STARFIRE_REPEAT_MS = 20_000;

/** First shade wave after DEFEND_3. Cite: moonglade.cpp:353 m_shadesummonTimer = 5 * IN_MILLISECONDS */
export const REMULOS_SHADE_FIRST_MS = 5_000;

// Subsequent shade wave interval urand(20,30)s. Cite: moonglade.cpp:462 m_shadesummonTimer = urand(20,30) *
// IN_MILLISECONDS
export const REMULOS_SHADE_REPEAT_MIN_MS = 20_000;
export const REMULOS_SHADE_REPEAT_MAX_MS = 30_000;

// Outro after explore credit. Cite: moonglade.cpp:367 m_outroTimer = 3 * IN_MILLISECONDS; :382 phase0→3s
export const REMULOS_OUTRO_MS = 3_000;

/** ForcedDespawn delay after outro line 2. Cite: moonglade.cpp:388 ForcedDespawn(3 * IN_MILLISECONDS) */
export const REMULOS_OUTRO_DESPAWN_MS = 3_000;

// Defender TEMPSPAWN_TIMED_OOC_OR_DEAD_DESPAWN 3 min. Cite: moonglade.cpp:417 3 * MINUTE * IN_MILLISECONDS
export const REMULOS_DEFENDER_DESPAWN_MS = 3 * 60 * 1000;

// Timer constants — Eranikus combat

/** Acid Breath. Reset 10s; CAST_OK re-arm 15s. Cite: moonglade.cpp:563 m_acidBreathTimer = 10s; :868 15s */
export const ERANIKUS_ACID_BREATH_INIT_MS = 10_000;
export const ERANIKUS_ACID_BREATH_REPEAT_MS = 15_000;

// Noxious Breath. Reset 3s; CAST_OK re-arm 30s. Cite: moonglade.cpp:564 m_noxiousBreathTimer = 3s; :876 30s
export const ERANIKUS_NOXIOUS_BREATH_INIT_MS = 3_000;
export const ERANIKUS_NOXIOUS_BREATH_REPEAT_MS = 30_000;

// Shadow Bolt Volley. Reset 5s; CAST_OK re-arm 25s. Cite: moonglade.cpp:565 m_shadowboltVolleyTimer = 5s;
// :884 25s
export const ERANIKUS_SHADOWBOLT_INIT_MS = 5_000;
export const ERANIKUS_SHADOWBOLT_REPEAT_MS = 25_000;

/** Initial health-check threshold (then steps down). Cite: moonglade.cpp:571 m_healthCheck = 85 */
export const ERANIKUS_HEALTH_CHECK_START = 85;

// Redeem trigger: GetHealthPercent() < 20 → EnterEvadeMode redeem path. Cite: moonglade.cpp:855-859 case
// 20; :581 if < 20.0f
export const ERANIKUS_REDEEM_HP_PCT = 20;

/** Tyrande move after heal-point land. Cite: moonglade.cpp:675 m_tyrandeMoveTimer = 5 * IN_MILLISECONDS */
export const ERANIKUS_TYRANDE_MOVE_MS = 5_000;

/** Redeem event timer after UpdateEntry. Cite: moonglade.cpp:600 m_eventTimer = 5 * IN_MILLISECONDS */
export const ERANIKUS_REDEEM_EVENT_START_MS = 5_000;

/** Heal spell pick table for Remulos combat. Cite: moonglade.cpp:476-481 urand(0,2) */
export const REMULOS_HEAL_SPELLS = [
  SPELL_HEALING_TOUCH,
  SPELL_REJUVENATION,
  SPELL_REGROWTH,
] as const;

/** Eranikus HP threshold chain (ordered descending). Cite: moonglade.cpp:813-860 m_healthCheck switch */
export const ERANIKUS_HP_THRESHOLDS = [85, 75, 50, 35, 31, 27, 25, 20] as const;

// Positions (event geometry — pure helpers / residual)
/** Cite: moonglade.cpp:142 eranikusLocations[0] spawn */
export const ERANIKUS_SPAWN = {
  x: 7881.72,
  y: -2651.23,
  z: 493.29,
  o: 0.4,
  cite: 'moonglade.cpp:142 eranikusLocations[0]',
} as const;

/** Cite: moonglade.cpp:143 flight */
export const ERANIKUS_FLIGHT = {
  x: 7929.86,
  y: -2574.88,
  z: 505.35,
  cite: 'moonglade.cpp:143',
} as const;

/** Cite: moonglade.cpp:144 combat land */
export const ERANIKUS_COMBAT_LAND = {
  x: 7912.98,
  y: -2568.99,
  z: 488.71,
  cite: 'moonglade.cpp:144',
} as const;

/** Cite: moonglade.cpp:145 redeemed */
export const ERANIKUS_REDEEMED_POS = {
  x: 7906.57,
  y: -2565.63,
  z: 488.39,
  cite: 'moonglade.cpp:145',
} as const;

/** Cite: moonglade.cpp:151 Tyrande spawn */
export const TYRANDE_SPAWN = {
  x: 7948.89,
  y: -2575.58,
  z: 490.05,
  o: 3.03,
  cite: 'moonglade.cpp:151',
} as const;

// Pure helpers live in moongladeHelpers.ts (filesize ≤1500).
export {
  conjureDreamRiftOnEffect,
  eranikusEnterEvade,
  eranikusHealthCheck,
  eranikusMovementInformCombat,
  eranikusMovementInformRedeemed,
  eranikusRedeemEventPhase,
  eranikusReset,
  omenClusterUse,
  remulosDialogueStep,
  remulosDoHandleOutro,
  remulosOutroTick,
  remulosPickHealSpell,
  remulosQuestAccept,
  remulosReset,
  remulosShadeWaveFire,
  remulosWaypointReached,
} from './moongladeHelpers.ts';
export type {
  ConjureDreamRiftResult,
  EranikusEnterEvadeResult,
  EranikusHealthCheckResult,
  EranikusRedeemEventResult,
  EranikusResetResult,
  OmenClusterUseResult,
  RemulosDialogueStepResult,
  RemulosOutroResult,
  RemulosOutroTickResult,
  RemulosQuestAcceptResult,
  RemulosResetResult,
  RemulosShadeWaveResult,
  RemulosWaypointResult,
} from './moongladeHelpers.ts';


// ScriptDev IR — npc_keeper_remulos

// npc_keeper_remulosAI, creature 11832. Escort quest 8736 with a heal/starfire kit during the
// Eranikus event. He has no bake creatureCasts, so this schedule supersedes any bare kit.
export const NPC_KEEPER_REMULOS_SCRIPT: ScriptDevIR = {
  name: 'npc_keeper_remulos',
  boundCreatures: [NPC_REMULOS],
  sourceFile: 'kalimdor/moonglade.cpp',
  spellIds: [
    SPELL_CONJURE_RIFT,
    SPELL_DRAGON_HOVER,
    SPELL_HEALING_TOUCH,
    SPELL_REGROWTH,
    SPELL_REJUVENATION,
    SPELL_STARFIRE,
  ],
  timers: [
    {
      id: 'heal',
      // Host representative: Healing Touch; pure helper remulosPickHealSpell
      // picks urand(0,2) among 23381/20664/20665 on each fire (cpp:476-481).
      spellId: SPELL_HEALING_TOUCH,
      initialMinMs: REMULOS_HEAL_MS,
      initialMaxMs: REMULOS_HEAL_MS,
      repeatMinMs: REMULOS_HEAL_MS,
      repeatMaxMs: REMULOS_HEAL_MS,
      target: 'self',
      // DEFAULT_VISIBILITY_DISTANCE. Cite: ObjectDefines.h:38 VISIBILITY_DISTANCE_NORMAL 100 yd.
      friendlyLowestHpYd: 100,
      friendlyHpDeficit: 1,
      cite: 'moonglade.cpp:206,470-483 heal 10s re-arm 10s, urand HT/Rejuv/Regrowth on DoSelectLowestHpFriendly(DEFAULT_VISIBILITY_DISTANCE)',
    },
    {
      id: 'starfire',
      spellId: SPELL_STARFIRE,
      initialMinMs: REMULOS_STARFIRE_INIT_MS,
      initialMaxMs: REMULOS_STARFIRE_INIT_MS,
      repeatMinMs: REMULOS_STARFIRE_REPEAT_MS,
      repeatMaxMs: REMULOS_STARFIRE_REPEAT_MS,
      target: 'hostile_random',
      cite: 'moonglade.cpp:207,488-497 Starfire init 25s re-arm 20s SelectAttackingTarget RANDOM',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `!escorting: heal=${REMULOS_HEAL_MS} starfire=${REMULOS_STARFIRE_INIT_MS} shade/outro/summon cleared isFirstWave=true`,
        cite: 'moonglade.cpp:195-210 Reset',
      },
    ],
    onDeath: [
      {
        kind: 'flavor',
        text: 'Eranikus EnterEvadeMode (despawn summons) + clear UNIT_FLAG_PVP',
        cite: 'moonglade.cpp:267-276 JustDied',
      },
    ],
  },
  cites: [
    'moonglade.cpp:36-520 npc_keeper_remulos',
    'moonglade.cpp:42-48 combat + conjure spells',
    'moonglade.cpp:195-210 Reset',
    'moonglade.cpp:279-305 WaypointReached',
    'moonglade.cpp:320-355 JustDidDialogueStep',
    'moonglade.cpp:358-368 DoHandleOutro explore 8736',
    'moonglade.cpp:398-499 shade waves + heal/starfire combat',
    'moonglade.cpp:508-519 QuestAccept 8736',
    'moonglade.cpp:898-912 spell_conjure_dream_rift',
    'scriptdev2.sql:417 entry 11832',
  ],
};

// ScriptDev IR — boss_eranikus

// boss_eranikusAI, creature 15491 — ABSENT from the product bake, so the binding is unused. The
// HP phase chain fires once each as HP drops; 20% stops combat and morphs to the redeemed 15628.
export const BOSS_ERANIKUS: ScriptDevIR = {
  name: 'boss_eranikus',
  boundCreatures: [NPC_ERANIKUS_TYRANT],
  sourceFile: 'kalimdor/moonglade.cpp',
  spellIds: [
    SPELL_ACID_BREATH,
    SPELL_NOXIOUS_BREATH,
    SPELL_SHADOWBOLT_VOLLEY,
    SPELL_ERANIKUS_REDEEMED,
    SPELL_ARCANE_CHANNELING,
    SPELL_DRAGON_HOVER,
  ],
  timers: [
    {
      id: 'acid_breath',
      spellId: SPELL_ACID_BREATH,
      initialMinMs: ERANIKUS_ACID_BREATH_INIT_MS,
      initialMaxMs: ERANIKUS_ACID_BREATH_INIT_MS,
      repeatMinMs: ERANIKUS_ACID_BREATH_REPEAT_MS,
      repeatMaxMs: ERANIKUS_ACID_BREATH_REPEAT_MS,
      target: 'self',
      cite: 'moonglade.cpp:563,865-868 Acid Breath init 10s re-arm 15s self',
    },
    {
      id: 'noxious_breath',
      spellId: SPELL_NOXIOUS_BREATH,
      initialMinMs: ERANIKUS_NOXIOUS_BREATH_INIT_MS,
      initialMaxMs: ERANIKUS_NOXIOUS_BREATH_INIT_MS,
      repeatMinMs: ERANIKUS_NOXIOUS_BREATH_REPEAT_MS,
      repeatMaxMs: ERANIKUS_NOXIOUS_BREATH_REPEAT_MS,
      target: 'self',
      cite: 'moonglade.cpp:564,873-876 Noxious Breath init 3s re-arm 30s self',
    },
    {
      id: 'shadowbolt_volley',
      spellId: SPELL_SHADOWBOLT_VOLLEY,
      initialMinMs: ERANIKUS_SHADOWBOLT_INIT_MS,
      initialMaxMs: ERANIKUS_SHADOWBOLT_INIT_MS,
      repeatMinMs: ERANIKUS_SHADOWBOLT_REPEAT_MS,
      repeatMaxMs: ERANIKUS_SHADOWBOLT_REPEAT_MS,
      target: 'self',
      cite: 'moonglade.cpp:565,881-884 Shadow Bolt Volley init 5s re-arm 25s self',
    },
  ],
  phases: [
    {
      phase: 1,
      hpBelowPct: 85,
      actions: [
        {
          kind: 'yell',
          textId: SAY_ERANIKUS_ATTACK_3,
          cite: 'moonglade.cpp:818 SAY_ERANIKUS_ATTACK_3',
        },
        {
          kind: 'flavor',
          text: `temp summon Tyrande ${NPC_TYRANDE_WHISPERWIND} 1s for SAY_TYRANDE_APPEAR`,
          cite: 'moonglade.cpp:820-821',
        },
      ],
      cite: 'moonglade.cpp:817-822 healthCheck 85 → 75',
    },
    {
      phase: 2,
      hpBelowPct: 75,
      actions: [
        {
          kind: 'yell',
          textId: SAY_ERANIKUS_ATTACK_3,
          cite: 'moonglade.cpp:826 SAY_ERANIKUS_ATTACK_3',
        },
      ],
      cite: 'moonglade.cpp:824-827 healthCheck 75 → 50',
    },
    {
      phase: 3,
      hpBelowPct: 50,
      actions: [
        {
          kind: 'summon',
          creatureEntry: NPC_TYRANDE_WHISPERWIND,
          cite: 'moonglade.cpp:831-832 SummonCreature Tyrande mounted PRIESTESS_MOUNT_ID',
        },
      ],
      cite: 'moonglade.cpp:829-833 healthCheck 50 → 35',
    },
    {
      phase: 4,
      hpBelowPct: 35,
      actions: [
        {
          kind: 'summon_count',
          creatureEntry: NPC_ELUNE_PRIESTESS,
          count: MAX_PRIESTESS,
          radiusYd: 10,
          cite: 'moonglade.cpp:623-631 DoSummonHealers MAX_PRIESTESS=7 radius 10',
        },
        {
          kind: 'yell',
          textId: SAY_ERANIKUS_DEFEAT_1,
          cite: 'moonglade.cpp:838 SAY_ERANIKUS_DEFEAT_1',
        },
      ],
      cite: 'moonglade.cpp:835-839 healthCheck 35 → 31',
    },
    {
      phase: 5,
      hpBelowPct: 31,
      actions: [
        {
          kind: 'yell',
          textId: SAY_TYRANDE_FORGIVEN_2,
          cite: 'moonglade.cpp:843 SAY_TYRANDE_FORGIVEN_2 (Tyrande speaker)',
        },
      ],
      cite: 'moonglade.cpp:841-844 healthCheck 31 → 27',
    },
    {
      phase: 6,
      hpBelowPct: 27,
      actions: [
        {
          kind: 'yell',
          textId: SAY_TYRANDE_FORGIVEN_3,
          cite: 'moonglade.cpp:848 SAY_TYRANDE_FORGIVEN_3',
        },
      ],
      cite: 'moonglade.cpp:846-849 healthCheck 27 → 25',
    },
    {
      phase: 7,
      hpBelowPct: 25,
      actions: [
        {
          kind: 'yell',
          textId: SAY_ERANIKUS_DEFEAT_2,
          cite: 'moonglade.cpp:852 SAY_ERANIKUS_DEFEAT_2',
        },
      ],
      cite: 'moonglade.cpp:851-853 healthCheck 25 → 20',
    },
    {
      phase: 8,
      hpBelowPct: 20,
      actions: [
        {
          kind: 'yell',
          textId: SAY_ERANIKUS_DEFEAT_3,
          cite: 'moonglade.cpp:857 SAY_ERANIKUS_DEFEAT_3',
        },
        {
          kind: 'stop_combat',
          cite: 'moonglade.cpp:858 EnterEvadeMode → redeem path',
        },
        {
          kind: 'update_entry',
          entry: NPC_ERANIKUS_REDEEMED,
          cite: 'moonglade.cpp:601 UpdateEntry(NPC_ERANIKUS_REDEEMED 15628)',
        },
        {
          kind: 'flavor',
          text: `redeem eventTimer=${ERANIKUS_REDEEM_EVENT_START_MS}ms → Tyrande kneel + SPELL_ERANIKUS_REDEEMED 25846 + Remulos DoHandleOutro explore 8736`,
          cite: 'moonglade.cpp:600,725-787 redeem event chain',
        },
      ],
      cite: 'moonglade.cpp:855-859 healthCheck 20 → 0 redeem',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'set_combat_movement',
        enabled: false,
        cite: 'moonglade.cpp:576 SetCombatMovement(false)',
      },
      {
        kind: 'flavor',
        text: `acid=${ERANIKUS_ACID_BREATH_INIT_MS} noxious=${ERANIKUS_NOXIOUS_BREATH_INIT_MS} volley=${ERANIKUS_SHADOWBOLT_INIT_MS} healthCheck=${ERANIKUS_HEALTH_CHECK_START}`,
        cite: 'moonglade.cpp:563-573 Reset',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: 'HP<20 redeem UpdateEntry 15628; else ForcedDespawn self+summons',
        cite: 'moonglade.cpp:579-612 EnterEvadeMode',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_ERANIKUS_TYRANT,
      kind: 'creature',
      reason:
        'Creature 15491 Eranikus, Tyrant of the Dream is DB-bound ScriptName boss_eranikus but absent from product bake - IR combat timers + HP phase chain + redeem pure helpers ported; product cannot spawn event boss until rebake. Summoned mid-event by SPELL_CONJURE_RIFT from Remulos escort (quest 8736).',
      cite: 'scriptdev2.sql:418; moonglade.cpp:543-896; loadRealBundle missing 15491',
    },
    {
      entry: NPC_ERANIKUS_REDEEMED,
      kind: 'creature',
      reason:
        'Redeem morph target 15628 Eranikus the Redeemed (UpdateEntry on HP<20 evade) absent from bake - documented for morphEntries / pure helper path.',
      cite: 'moonglade.cpp:529,601; loadRealBundle missing 15628',
    },
    {
      entry: NPC_TYRANDE_WHISPERWIND,
      kind: 'creature',
      reason:
        'Event-summoned Tyrande 15633 (HP 50% / appear yell) absent from bake - residual summon in phases.',
      cite: 'moonglade.cpp:54,820-832; loadRealBundle missing 15633',
    },
    {
      entry: NPC_ELUNE_PRIESTESS,
      kind: 'creature',
      reason:
        'Event-summoned Priestess of Elune 15634 ×7 at 35% absent from bake.',
      cite: 'moonglade.cpp:55,623-631; loadRealBundle missing 15634',
    },
    {
      entry: NPC_NIGHTMARE_PHANTASM,
      kind: 'creature',
      reason:
        'Remulos shade-wave summon 15629 absent from bake - event residual (not boss AI binding).',
      cite: 'moonglade.cpp:52,407-437; loadRealBundle missing 15629',
    },
    {
      entry: NPC_NIGHTHAVEN_DEFENDER,
      kind: 'creature',
      reason:
        'Remulos defender summon 15495 absent from bake - event residual.',
      cite: 'moonglade.cpp:56,410-446; loadRealBundle missing 15495',
    },
  ],
  cites: [
    'moonglade.cpp:522-896 boss_eranikus',
    'moonglade.cpp:531-534 combat spells + arcane channel',
    'moonglade.cpp:561-577 Reset',
    'moonglade.cpp:579-612 EnterEvadeMode redeem',
    'moonglade.cpp:623-631 DoSummonHealers',
    'moonglade.cpp:694-720 MovementInform combat/redeemed',
    'moonglade.cpp:723-890 UpdateAI event + HP chain + combat',
    'scriptdev2.sql:418 entry 15491',
  ],
};

// ScriptDev IR — go_omen_cluster

// GOUse_go_omen_cluster, GO 180859 — absent from tables/gameObjects so the binding is unused.
// Sets TYPE_OMEN NOT_STARTED so the world map script can advance the Omen encounter.
export const GO_OMEN_CLUSTER_SCRIPT: ScriptDevIR = {
  name: 'go_omen_cluster',
  boundCreatures: [],
  boundGos: [GO_OMEN_CLUSTER],
  sourceFile: 'kalimdor/moonglade.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_OMEN_CLUSTER],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_OMEN,
        value: INSTANCE_DATA.NOT_STARTED,
        cite: 'moonglade.cpp:933 SetData(TYPE_OMEN, NOT_STARTED)',
      },
      {
        kind: 'flavor',
        text: 'static cluster only (GetSpawner null); world map script summons Omen 15467 / minions when rocket count advances',
        cite: 'moonglade.cpp:921-924; world_kalimdor.cpp:324-357 TYPE_OMEN',
      },
    ],
    cite: 'moonglade.cpp:919-935 GOUse_go_omen_cluster; scriptdev2.sql:419 entry 180859',
  },
  unusedBindings: [
    {
      entry: GO_OMEN_CLUSTER,
      kind: 'go',
      reason:
        'GO 180859 Cluster Launcher is DB-bound ScriptName go_omen_cluster but absent from product tables/gameObjects.json (present in gameobject-data.json as Cluster Launcher) - IR + pure helper omenClusterUse ported; product GO use not spawnable until tables row. Map script residual (TYPE_OMEN Omen 15467) lives in world_kalimdor.cpp (not this file).',
      cite: 'scriptdev2.sql:419; moonglade.cpp:919-935; tables/gameObjects missing 180859',
    },
  ],
  cites: [
    'moonglade.cpp:915-935 go_omen_cluster',
    'world_kalimdor.h:44 TYPE_OMEN=0',
    'world_kalimdor.cpp:324-363 TYPE_OMEN rocket / Omen summon',
    'scriptdev2.sql:419 entry 180859',
  ],
};
