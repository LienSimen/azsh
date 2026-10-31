// Stratholme zone ScriptDev IR ports. Source: stratholmeScripts.cpp and stratholme.h — the two
// gates, the postbox, the restless soul, the ghostly citizens and Aurius.

import type { ScriptDevIR } from './types.ts';
import { INSTANCE_DATA } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Constants — stratholme.h + stratholmeScripts.cpp enums

// stratholme.h:14–23
const TYPE_BARON_RUN = 0;
const TYPE_BARON = 5;
const TYPE_BARTHILAS_RUN = 6;
const TYPE_AURIUS = 7;
const TYPE_POSTMASTER = 9;

// stratholme.h:49, 56–57, 76–81
const NPC_UNDEAD_POSTMAN = 11142;
const GO_SERVICE_ENTRANCE = 175368;
const GO_GAUNTLET_GATE1 = 175357;
const QUEST_MEDALLION_FAITH = 5122;
const SPELL_BARON_ULTIMATUM = 27861;
const SPELL_SUMMON_POSTMASTER = 24627;

// stratholmeScripts.cpp:134–146 (mob_restless_soul)
// SAY_ZAPPED0..3 = -1329000..-1329003 (urand 0-6 picks one or silence)
const SAY_ZAPPED0 = -1329000;
const QUEST_RESTLESS_SOUL = 5282;
const SPELL_EGAN_BLASTER = 17368;
const SPELL_SOUL_FREED = 17370;
const SPELL_SUMMON_FREED_SOUL = 17408;
const NPC_RESTLESS_SOUL = 11122;
const NPC_FREED_SOUL = 11136;

// stratholmeScripts.cpp:217–219 (mobs_spectral_ghostly_citizen)
const SPELL_INCORPOREAL_DEFENSE = 16331;
const SPELL_HAUNTING_PHANTOM = 16336; // enum only — not cast by this AI body
const SPELL_SLAP = 6754;

// scriptdev2.sql:561–562 creature bindings
const NPC_SPECTRAL_CITIZEN = 10384;
const NPC_GHOSTLY_CITIZEN = 10385;
const NPC_AURIUS = 10917;

// scriptdev2.sql:565 postbox GOs
const GO_POSTBOXES = [176346, 176349, 176350, 176351, 176352, 176353] as const;

// Gossip text ids — stratholmeScripts.cpp:311–313
const GOSSIP_TEXT_AURIUS_1 = 3755;
const GOSSIP_TEXT_AURIUS_2 = 3756;
const GOSSIP_TEXT_AURIUS_3 = 3757;

// Classic TEXTEMOTE — SharedDefines.h (cmangos-classic) Cite: SharedDefines.h:589 BOW=17, :606 DANCE=34,
// :630 KISS=58, :649 RUDE=77, :673 WAVE=101 Used by stratholmeScripts.cpp:278–295 ReceiveEmote switch.
const TEXTEMOTE_BOW = 17;
const TEXTEMOTE_DANCE = 34;
const TEXTEMOTE_KISS = 58;
const TEXTEMOTE_RUDE = 77;
const TEXTEMOTE_WAVE = 101;

/** Classic INTERACTION_DISTANCE — Object.h / SharedDefines (~5 yards). */
const INTERACTION_DISTANCE_YD = 5;

// The corpus also lists 11030 and 10415 as boundCreatures for this file, but scriptdev2.sql does
// NOT bind them to these ScriptNames — the instance script owns that flow. Documented as N/A.
const CORPUS_EXTRA_BINDINGS_NOTE =
  'Corpus refresh listed entry under this file; scriptdev2.sql:560-565 does not bind it to stratholmeScripts names - owned by instance_stratholme / template, not this AI.';

// go_service_gate

// GOUse_go_service_gate on GO 175368: with TYPE_BARTHILAS_RUN NOT_STARTED it sets IN_PROGRESS.
// Cite: stratholmeScripts.cpp:42–55; stratholme.h:56.
export const GO_SERVICE_GATE: ScriptDevIR = {
  name: 'go_service_gate',
  boundCreatures: [],
  boundGos: [GO_SERVICE_ENTRANCE],
  sourceFile: 'eastern_kingdoms/stratholme/stratholmeScripts.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_SERVICE_ENTRANCE],
    gates: [
      {
        field: TYPE_BARTHILAS_RUN,
        equals: INSTANCE_DATA.NOT_STARTED,
        cite: 'stratholmeScripts.cpp:49 GetData(TYPE_BARTHILAS_RUN) != NOT_STARTED → return false',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_BARTHILAS_RUN,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'stratholmeScripts.cpp:53 SetData(TYPE_BARTHILAS_RUN, IN_PROGRESS)',
      },
    ],
    cite: 'stratholmeScripts.cpp:42-55 GOUse_go_service_gate',
  },
  cites: [
    'stratholmeScripts.cpp:42-55',
    'stratholme.h:20 TYPE_BARTHILAS_RUN=6',
    'stratholme.h:56 GO_SERVICE_ENTRANCE=175368',
    'scriptdev2.sql:564',
  ],
};

// go_gauntlet_gate

// GOUse_go_gauntlet_gate: casts the Baron's Ultimatum 27861 on the group if missing and sets
// TYPE_BARON_RUN IN_PROGRESS. 27861 is absent from spell-data. Cite: cpp:61–91.
export const GO_GAUNTLET_GATE: ScriptDevIR = {
  name: 'go_gauntlet_gate',
  boundCreatures: [],
  boundGos: [GO_GAUNTLET_GATE1],
  sourceFile: 'eastern_kingdoms/stratholme/stratholmeScripts.cpp',
  spellIds: [SPELL_BARON_ULTIMATUM],
  timers: [],
  goUse: {
    goEntries: [GO_GAUNTLET_GATE1],
    gates: [
      {
        field: TYPE_BARON_RUN,
        equals: INSTANCE_DATA.NOT_STARTED,
        cite: 'stratholmeScripts.cpp:68 GetData(TYPE_BARON_RUN) != NOT_STARTED → return false',
      },
    ],
    actions: [
      {
        kind: 'cast_on_group',
        spellId: SPELL_BARON_ULTIMATUM,
        castFlags: CAST_FLAG.TRIGGERED,
        auraNotPresent: true,
        cite: 'stratholmeScripts.cpp:79-86 CastSpell SPELL_BARON_ULTIMATUM if !HasAura',
      },
      {
        kind: 'set_instance_data',
        field: TYPE_BARON_RUN,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'stratholmeScripts.cpp:89 SetData(TYPE_BARON_RUN, IN_PROGRESS)',
      },
    ],
    cite: 'stratholmeScripts.cpp:61-91 GOUse_go_gauntlet_gate',
  },
  cites: [
    'stratholmeScripts.cpp:61-91',
    'stratholme.h:14 TYPE_BARON_RUN=0',
    'stratholme.h:57 GO_GAUNTLET_GATE1=175357',
    'stratholme.h:78 SPELL_BARON_ULTIMATUM=27861',
    'scriptdev2.sql:563',
  ],
};

// go_stratholme_postbox

// GOUse_go_stratholme_postbox: DONE no-ops, SPECIAL summons the Postmaster and sets DONE, anything
// else sets IN_PROGRESS. Every use summons 3 Undead Postmen. Cite: cpp:97–125.
export const GO_STRATHOLME_POSTBOX: ScriptDevIR = {
  name: 'go_stratholme_postbox',
  boundCreatures: [],
  boundGos: [...GO_POSTBOXES],
  sourceFile: 'eastern_kingdoms/stratholme/stratholmeScripts.cpp',
  spellIds: [SPELL_SUMMON_POSTMASTER],
  timers: [],
  goUse: {
    goEntries: [...GO_POSTBOXES],
    gates: [
      {
        field: TYPE_POSTMASTER,
        notEquals: INSTANCE_DATA.DONE,
        cite: 'stratholmeScripts.cpp:104 GetData(TYPE_POSTMASTER) == DONE → return false',
      },
    ],
    branches: [
      {
        gate: {
          field: TYPE_POSTMASTER,
          equals: INSTANCE_DATA.SPECIAL,
          cite: 'stratholmeScripts.cpp:108 GetData == SPECIAL',
        },
        actions: [
          {
            kind: 'cast_on_player',
            spellId: SPELL_SUMMON_POSTMASTER,
            castFlags: CAST_FLAG.TRIGGERED,
            cite: 'stratholmeScripts.cpp:110 CastSpell SPELL_SUMMON_POSTMASTER',
          },
          {
            kind: 'set_instance_data',
            field: TYPE_POSTMASTER,
            value: INSTANCE_DATA.DONE,
            cite: 'stratholmeScripts.cpp:111 SetData(TYPE_POSTMASTER, DONE)',
          },
          {
            kind: 'summon_count',
            creatureEntry: NPC_UNDEAD_POSTMAN,
            count: 3,
            radiusYd: 3,
            cite: 'stratholmeScripts.cpp:118-122 SummonCreature ×3 radius 3.0f',
          },
        ],
        cite: 'stratholmeScripts.cpp:108-112',
      },
    ],
    actions: [
      {
        kind: 'set_instance_data',
        field: TYPE_POSTMASTER,
        value: INSTANCE_DATA.IN_PROGRESS,
        cite: 'stratholmeScripts.cpp:114 SetData(TYPE_POSTMASTER, IN_PROGRESS)',
      },
      {
        kind: 'summon_count',
        creatureEntry: NPC_UNDEAD_POSTMAN,
        count: 3,
        radiusYd: 3,
        cite: 'stratholmeScripts.cpp:118-122 SummonCreature ×3 radius 3.0f',
      },
    ],
    cite: 'stratholmeScripts.cpp:97-125 GOUse_go_stratholme_postbox',
  },
  cites: [
    'stratholmeScripts.cpp:97-125',
    'stratholme.h:23 TYPE_POSTMASTER=9',
    'stratholme.h:49 NPC_UNDEAD_POSTMAN=11142',
    'stratholme.h:81 SPELL_SUMMON_POSTMASTER=24627',
    'scriptdev2.sql:565',
  ],
};

// mob_restless_soul

// mob_restless_soulAI: Egan's Blaster with quest 5282 incomplete tags it, and 1000 ms later it
// morphs to the freed soul and credits 11122. Entry 11122 is absent from bake.
export const MOB_RESTLESS_SOUL: ScriptDevIR = {
  name: 'mob_restless_soul',
  boundCreatures: [NPC_RESTLESS_SOUL],
  sourceFile: 'eastern_kingdoms/stratholme/stratholmeScripts.cpp',
  spellIds: [SPELL_EGAN_BLASTER, SPELL_SOUL_FREED, SPELL_SUMMON_FREED_SOUL],
  timers: [],
  spellHits: [
    {
      spellId: SPELL_EGAN_BLASTER,
      playerCaster: true,
      requireQuestIncomplete: QUEST_RESTLESS_SOUL,
      once: true,
      // Die timer armed from Reset value when tagged; UpdateAI counts down.
      dieTimerMs: 1000,
      onDieTimer: [
        {
          kind: 'update_entry',
          entry: NPC_FREED_SOUL,
          cite: 'stratholmeScripts.cpp:186 UpdateEntry(NPC_FREED_SOUL)',
        },
        {
          kind: 'force_despawn',
          delayMs: 60_000,
          cite: 'stratholmeScripts.cpp:187 ForcedDespawn(60000)',
        },
        // C++: switch (urand(0, 6)) cases 0–3 yell SAY_ZAPPED0..3; default silent.
        // Host has no urand action — record the text id set; fight path is unused-binding.
        {
          kind: 'yell',
          textId: SAY_ZAPPED0,
          cite: 'stratholmeScripts.cpp:188-195 urand(0,6) cases 0-3 → SAY_ZAPPED0..3 (-1329000..-1329003)',
        },
        {
          kind: 'quest_credit',
          entry: NPC_RESTLESS_SOUL,
          credit: 'creature',
          cite: 'stratholmeScripts.cpp:197 RewardPlayerAndGroupAtEventCredit(NPC_RESTLESS_SOUL)',
        },
      ],
      cite: 'stratholmeScripts.cpp:165-175 SpellHit; :161 m_uiDieTimer=1000; :183-198 die path; SAY_ZAPPED0..3=-1329000..-1329003',
    },
  ],
  unusedBindings: [
    {
      entry: NPC_RESTLESS_SOUL,
      kind: 'creature',
      reason:
        'creature_template entry 11122 Restless Soul bound via ScriptName=mob_restless_soul (scriptdev2.sql:562) but absent from product bake - IR ported; no live-bake fight possible',
      cite: 'scriptdev2.sql:562; loadRealBundle creatures missing 11122',
    },
    {
      entry: 11030,
      kind: 'creature',
      reason: CORPUS_EXTRA_BINDINGS_NOTE,
      cite: 'docs/aifid/scriptdev-corpus.json boundCreatures; scriptdev2.sql:560-565',
    },
    {
      entry: 10415,
      kind: 'creature',
      reason: CORPUS_EXTRA_BINDINGS_NOTE,
      cite: 'docs/aifid/scriptdev-corpus.json boundCreatures; scriptdev2.sql:560-565',
    },
  ],
  cites: [
    'stratholmeScripts.cpp:131-209 mob_restless_soul',
    'stratholmeScripts.cpp:141 SPELL_EGAN_BLASTER=17368',
    'stratholmeScripts.cpp:161 m_uiDieTimer=1000',
    'scriptdev2.sql:562',
  ],
};

// mobs_spectral_ghostly_citizen

// mobs_spectral_ghostly_citizenAI: Incorporeal Defense on reset, Egan's Blaster frees the soul,
// and 2000 ms later it summons the freed soul and despawns. Emotes drive the rest.
export const MOBS_SPECTRAL_GHOSTLY_CITIZEN: ScriptDevIR = {
  name: 'mobs_spectral_ghostly_citizen',
  boundCreatures: [NPC_SPECTRAL_CITIZEN, NPC_GHOSTLY_CITIZEN],
  sourceFile: 'eastern_kingdoms/stratholme/stratholmeScripts.cpp',
  spellIds: [
    SPELL_INCORPOREAL_DEFENSE,
    SPELL_HAUNTING_PHANTOM,
    SPELL_SLAP,
    SPELL_EGAN_BLASTER,
    SPELL_SOUL_FREED,
    SPELL_SUMMON_FREED_SOUL,
  ],
  timers: [
    {
      id: 'incorporeal_defense',
      spellId: SPELL_INCORPOREAL_DEFENSE,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'stratholmeScripts.cpp:231 DoCastSpellIfCan SPELL_INCORPOREAL_DEFENSE TRIGGERED|AURA_NOT_PRESENT',
    },
  ],
  spellHits: [
    {
      spellId: SPELL_EGAN_BLASTER,
      once: true,
      dieTimerMs: 2000,
      actions: [
        {
          kind: 'cast_self',
          spellId: SPELL_SOUL_FREED,
          cite: 'stratholmeScripts.cpp:246 CastSpell SPELL_SOUL_FREED',
        },
        {
          kind: 'stop_combat',
          cite: 'stratholmeScripts.cpp:247-249 SetCombatScriptStatus + clear target + SetCombatMovement false',
        },
        {
          kind: 'set_combat_movement',
          enabled: false,
          cite: 'stratholmeScripts.cpp:249 SetCombatMovement(false, true)',
        },
      ],
      onDieTimer: [
        {
          kind: 'cast_self',
          spellId: SPELL_SUMMON_FREED_SOUL,
          castFlags: CAST_FLAG.TRIGGERED,
          cite: 'stratholmeScripts.cpp:259 CastSpell SPELL_SUMMON_FREED_SOUL TRIGGERED',
        },
        {
          kind: 'force_despawn',
          delayMs: 0,
          cite: 'stratholmeScripts.cpp:260 ForcedDespawn()',
        },
        {
          kind: 'set_combat_movement',
          enabled: true,
          cite: 'stratholmeScripts.cpp:262 SetCombatMovement(true)',
        },
      ],
      cite: 'stratholmeScripts.cpp:241-266 SpellHit + die timer (ctor m_uiDieTimer=2000 line 224)',
    },
  ],
  receiveEmotes: [
    {
      emote: TEXTEMOTE_DANCE,
      actions: [
        {
          kind: 'stop_combat',
          cite: 'stratholmeScripts.cpp:279 EnterEvadeMode on TEXTEMOTE_DANCE',
        },
      ],
      cite: 'stratholmeScripts.cpp:278-280',
    },
    {
      emote: TEXTEMOTE_RUDE,
      maxDistYd: INTERACTION_DISTANCE_YD,
      actions: [
        {
          kind: 'cast_on_player',
          spellId: SPELL_SLAP,
          cite: 'stratholmeScripts.cpp:283 CastSpell SPELL_SLAP in range',
        },
      ],
      // Out of range: HandleEmote(EMOTE_ONESHOT_RUDE) — client emote only, no spell/text.
      outOfRangeActions: [],
      cite: 'stratholmeScripts.cpp:281-286 TEXTEMOTE_RUDE',
    },
    {
      // HandleEmote only (no combat effect) — empty actions document the branch exists.
      emote: TEXTEMOTE_WAVE,
      actions: [],
      cite: 'stratholmeScripts.cpp:287-288 HandleEmote WAVE',
    },
    {
      emote: TEXTEMOTE_BOW,
      actions: [],
      cite: 'stratholmeScripts.cpp:290-291 HandleEmote BOW',
    },
    {
      emote: TEXTEMOTE_KISS,
      actions: [],
      cite: 'stratholmeScripts.cpp:293-294 HandleEmote FLEX',
    },
  ],
  cites: [
    'stratholmeScripts.cpp:215-303 mobs_spectral_ghostly_citizen',
    'stratholmeScripts.cpp:217 SPELL_INCORPOREAL_DEFENSE=16331',
    'stratholmeScripts.cpp:218 SPELL_HAUNTING_PHANTOM=16336 (enum only)',
    'stratholmeScripts.cpp:219 SPELL_SLAP=6754',
    'stratholmeScripts.cpp:224 m_uiDieTimer=2000 ctor',
    'scriptdev2.sql:561',
  ],
};

// npc_aurius

// npc_aurius: the quest 5122 reward sets TYPE_AURIUS DONE unless Baron or Aurius is already DONE,
// and gossip text follows that data. Quest and gossip only, with no UpdateAI timers.
export const NPC_AURIUS_SCRIPT: ScriptDevIR = {
  name: 'npc_aurius',
  boundCreatures: [NPC_AURIUS],
  sourceFile: 'eastern_kingdoms/stratholme/stratholmeScripts.cpp',
  spellIds: [],
  timers: [],
  questRewarded: [
    {
      questId: QUEST_MEDALLION_FAITH,
      gates: [
        {
          field: TYPE_BARON,
          notEquals: INSTANCE_DATA.DONE,
          cite: 'stratholmeScripts.cpp:323 GetData(TYPE_BARON) == DONE → return false',
        },
        {
          field: TYPE_AURIUS,
          notEquals: INSTANCE_DATA.DONE,
          cite: 'stratholmeScripts.cpp:323 GetData(TYPE_AURIUS) == DONE → return false',
        },
      ],
      actions: [
        {
          kind: 'set_instance_data',
          field: TYPE_AURIUS,
          value: INSTANCE_DATA.DONE,
          cite: 'stratholmeScripts.cpp:327 SetData(TYPE_AURIUS, DONE)',
        },
      ],
      cite: 'stratholmeScripts.cpp:316-329 QuestRewarded_npc_aurius',
    },
  ],
  gossipHello: {
    defaultTextId: GOSSIP_TEXT_AURIUS_1,
    branches: [
      {
        gates: [
          {
            field: TYPE_BARON,
            equals: INSTANCE_DATA.DONE,
            cite: 'stratholmeScripts.cpp:344 TYPE_BARON == DONE',
          },
          {
            field: TYPE_AURIUS,
            equals: INSTANCE_DATA.DONE,
            cite: 'stratholmeScripts.cpp:344 TYPE_AURIUS == DONE',
          },
        ],
        textId: GOSSIP_TEXT_AURIUS_3,
        cite: 'stratholmeScripts.cpp:344-345 GOSSIP_TEXT_AURIUS_3=3757',
      },
      {
        gates: [
          {
            field: TYPE_AURIUS,
            equals: INSTANCE_DATA.DONE,
            cite: 'stratholmeScripts.cpp:347 TYPE_AURIUS == DONE',
          },
        ],
        textId: GOSSIP_TEXT_AURIUS_2,
        cite: 'stratholmeScripts.cpp:347-348 GOSSIP_TEXT_AURIUS_2=3756',
      },
    ],
    cite: 'stratholmeScripts.cpp:332-353 GossipHello_npc_aurius',
  },
  cites: [
    'stratholmeScripts.cpp:309-354 npc_aurius',
    'stratholme.h:21 TYPE_AURIUS=7',
    'stratholme.h:76 QUEST_MEDALLION_FAITH=5122',
    'stratholme.h:39 NPC_AURIUS=10917',
    'scriptdev2.sql:560',
  ],
};
