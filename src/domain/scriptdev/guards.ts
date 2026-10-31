// World Guards ScriptDev IR ports. Source: scripts/world/guards.cpp and base/guard_ai. The bodies
// hard-code no combat timers — the kits live in the bake, so empty IR timers are correct.

import type { ScriptDevIR, ScriptDevAction, ScriptDevUnusedBinding } from './types.ts';

// Constants — guard_ai.h + guards.cpp

/** Cite: guard_ai.h:13 GENERIC_CREATURE_COOLDOWN = 5000 (declared; unused in guardAI body) */
export const GENERIC_CREATURE_COOLDOWN = 5000;

/** Cite: guard_ai.h:15–17 */
export const SAY_GUARD_SIL_AGGRO1 = -1000198;
export const SAY_GUARD_SIL_AGGRO2 = -1000199;
export const SAY_GUARD_SIL_AGGRO3 = -1000200;

/** Cite: guard_ai.h:19 NPC_CENARION_INFANTRY = 15184 */
export const NPC_CENARION_INFANTRY = 15184;

/** Cite: guards.cpp:91 SPELL_WINDSOR_INSPIRATION_EFFECT = 20275 */
export const SPELL_WINDSOR_INSPIRATION_EFFECT = 20275;

/** Cite: guards.cpp:92 MAX_GUARD_SALUTES = 7 */
export const MAX_GUARD_SALUTES = 7;

// Stormwind guard salute texts (Windsor inspiration). Cite: guards.cpp:95 aGuardSalute[0..6];
// scriptdev2.sql rows.
export const GUARD_SALUTE_TEXTS = [
  -1000842, // Light be with you, sir.
  -1000843, // We are but dirt beneath your feet, sir.
  -1000844, // ...nerves of thorium.
  -1000845, // Make way!
  -1000846, // A living legend...
  -1000847, // A moment I shall remember for always.
  -1000848, // You are an inspiration to us all, sir.
] as const;

// Salute wait after SpellHit 20275. Cite: guards.cpp:116 m_saluteWaitTimer = 2 * MINUTE * IN_MILLISECONDS
// SharedDefines: MINUTE=60, IN_MILLISECONDS=1000 → 120_000.
export const SALUTE_WAIT_MS = 2 * 60 * 1000;

/** Cite: SharedDefines.h Team ALLIANCE=469 HORDE=67 */
export const TEAM_ALLIANCE = 469;
export const TEAM_HORDE = 67;

/** Cite: SharedDefines.h TextEmotes */
export const TEXTEMOTE_WAVE = 101;
export const TEXTEMOTE_KISS = 58;
export const TEXTEMOTE_SALUTE = 78;
export const TEXTEMOTE_SHY = 84;
export const TEXTEMOTE_RUDE = 77;
export const TEXTEMOTE_CHICKEN = 22;

/** Cite: SharedDefines.h Emote (oneshot replies in DoReplyToTextEmote) */
export const EMOTE_ONESHOT_BOW = 2;
export const EMOTE_ONESHOT_WAVE = 3;
export const EMOTE_ONESHOT_FLEX = 23;
export const EMOTE_ONESHOT_POINT = 25;
export const EMOTE_ONESHOT_SALUTE = 66;

// Bound creature entries — scriptdev-corpus.json + guards.cpp RegisterSelf

/** Cite: corpus + guard_bluffwatcher */
export const NPC_BLUFFWATCHER = 3084;

/** Cite: corpus + guard_contested */
export const NPC_RATCHET_BRUISER = 3502;
export const NPC_BOOTY_BAY_BRUISER = 4624;
export const NPC_GADGETZAN_BRUISER = 9460;
export const NPC_EVERLOOK_BRUISER = 11190;
// NPC_CENARION_INFANTRY above

/** Cite: corpus + guard_darnassus */
export const NPC_DARNASSUS_SENTINEL = 4262;

/** Cite: corpus + guard_dunmorogh */
export const NPC_IRONFORGE_MOUNTAINEER = 727;
export const NPC_DUN_MOROGH_MOUNTAINEER = 13076;

/** Cite: corpus + guard_durotar */
export const NPC_RAZOR_HILL_GRUNT = 5953;

/** Cite: corpus + guard_elwynnforest */
export const NPC_STORMWIND_GUARD_ELWYNN = 1423;

/** Cite: corpus + guard_ironforge */
export const NPC_IRONFORGE_GUARD = 5595;

/** Cite: corpus + guard_mulgore (Brave * entries) */
export const NPC_BRAVE_IRONHORN = 3212;
export const NPC_BRAVE_STRONGBASH = 3215;
export const NPC_BRAVE_DAWNEAGLE = 3217;
export const NPC_BRAVE_SWIFTWIND = 3218;
export const NPC_BRAVE_LEAPING_DEER = 3219;
export const NPC_BRAVE_DARKSKY = 3220;
export const NPC_BRAVE_ROCKHORN = 3221;
export const NPC_BRAVE_WILDRUNNER = 3222;
export const NPC_BRAVE_RAINCHASER = 3223;
export const NPC_BRAVE_CLOUDMANE = 3224;

/** Cite: corpus + guard_orgrimmar */
export const NPC_ORGRIMMAR_GRUNT = 3296;

/** Cite: corpus + guard_stormwind */
export const NPC_STORMWIND_CITY_GUARD = 68;
export const NPC_STORMWIND_ROYAL_GUARD = 1756;
export const NPC_STORMWIND_CITY_PATROLLER = 1976;

/** Cite: corpus + guard_teldrassil */
export const NPC_TELDRASSIL_SENTINEL = 3571;

/** Cite: corpus + guard_tirisfal */
export const NPC_DEATHGUARD_ABRAHAM = 1735;
export const NPC_DEATHGUARD_TERRENCE = 1738;
export const NPC_DEATHGUARD_BARTHOLOMEW = 1742;
export const NPC_DEATHGUARD_LAWRENCE = 1743;
export const NPC_DEATHGUARD_MORT = 1744;
export const NPC_DEATHGUARD_MORRIS = 1745;
export const NPC_DEATHGUARD_CYRUS = 1746;
export const NPC_DEATHGUARD_GAVIN = 2209;
export const NPC_DEATHGUARD_ROYANN = 2210;
export const NPC_DEATHGUARD_LUNDMARK = 5725;

/** Cite: corpus + guard_undercity */
export const NPC_UNDERCITY_GUARDIAN = 5624;

/** Product bake entries present for live-bake fights (tables/creatures.json). */
export const GUARDS_IN_BAKE = new Set([
  NPC_RATCHET_BRUISER,
  NPC_BOOTY_BAY_BRUISER,
  NPC_GADGETZAN_BRUISER,
  NPC_CENARION_INFANTRY,
  NPC_STORMWIND_CITY_GUARD,
  NPC_STORMWIND_ROYAL_GUARD,
  NPC_DEATHGUARD_ABRAHAM,
]);

// Pure helpers — guard_ai.cpp + guards.cpp

/** Map TextEmote → oneshot emote (DoReplyToTextEmote). Cite: guard_ai.cpp:83-93 */
export function guardReplyToTextEmote(textEmote: number): {
  handled: boolean;
  emoteId: number | null;
  cite: string;
} {
  switch (textEmote | 0) {
    case TEXTEMOTE_KISS:
      return { handled: true, emoteId: EMOTE_ONESHOT_BOW, cite: 'guard_ai.cpp:87 TEXTEMOTE_KISS→BOW' };
    case TEXTEMOTE_WAVE:
      return { handled: true, emoteId: EMOTE_ONESHOT_WAVE, cite: 'guard_ai.cpp:88 TEXTEMOTE_WAVE→WAVE' };
    case TEXTEMOTE_SALUTE:
      return { handled: true, emoteId: EMOTE_ONESHOT_SALUTE, cite: 'guard_ai.cpp:89 TEXTEMOTE_SALUTE→SALUTE' };
    case TEXTEMOTE_SHY:
      return { handled: true, emoteId: EMOTE_ONESHOT_FLEX, cite: 'guard_ai.cpp:90 TEXTEMOTE_SHY→FLEX' };
    case TEXTEMOTE_RUDE:
    case TEXTEMOTE_CHICKEN:
      return {
        handled: true,
        emoteId: EMOTE_ONESHOT_POINT,
        cite: 'guard_ai.cpp:91-92 TEXTEMOTE_RUDE/CHICKEN→POINT',
      };
    default:
      return { handled: false, emoteId: null, cite: 'guard_ai.cpp:83-93 no reply' };
  }
}

// Orgrimmar: only Horde players get emote replies. Cite: guard_ai.cpp:96-100 ReceiveEmote GetTeam() ==
// HORDE
export function orgrimmarGuardReceiveEmote(
  playerTeam: number,
  textEmote: number,
): { handled: boolean; emoteId: number | null; cite: string } {
  if ((playerTeam | 0) !== TEAM_HORDE) {
    return {
      handled: false,
      emoteId: null,
      cite: 'guard_ai.cpp:98 team gate HORDE only',
    };
  }
  return guardReplyToTextEmote(textEmote);
}

// Stormwind: only Alliance players get emote replies. Cite: guards.cpp:133-137 ReceiveEmote GetTeam() ==
// ALLIANCE
export function stormwindGuardReceiveEmote(
  playerTeam: number,
  textEmote: number,
): { handled: boolean; emoteId: number | null; cite: string } {
  if ((playerTeam | 0) !== TEAM_ALLIANCE) {
    return {
      handled: false,
      emoteId: null,
      cite: 'guards.cpp:135 team gate ALLIANCE only',
    };
  }
  return guardReplyToTextEmote(textEmote);
}

// Cenarion Hold Infantry Aggro — urand(0,2) picks one of three SAY texts.
// Cite: guard_ai.cpp:42-50.
export function cenarionHoldAggroSay(roll: number): {
  textId: number;
  cite: string;
} {
  const r = Math.max(0, Math.min(2, roll | 0));
  if (r === 0) {
    return { textId: SAY_GUARD_SIL_AGGRO1, cite: 'guard_ai.cpp:46 case 0 SAY_GUARD_SIL_AGGRO1' };
  }
  if (r === 1) {
    return { textId: SAY_GUARD_SIL_AGGRO2, cite: 'guard_ai.cpp:47 case 1 SAY_GUARD_SIL_AGGRO2' };
  }
  return { textId: SAY_GUARD_SIL_AGGRO3, cite: 'guard_ai.cpp:48 case 2 SAY_GUARD_SIL_AGGRO3' };
}

// Whether Aggro should roll a Cenarion text for this entry. Cite: guard_ai.cpp:42 GetEntry() ==
// NPC_CENARION_INFANTRY
export function isCenarionHoldInfantry(entry: number): boolean {
  return (entry | 0) === NPC_CENARION_INFANTRY;
}

export interface StormwindSpellHitResult {
  handled: boolean;
  /** Random salute text id when handled. */
  textId: number | null;
  /** New m_saluteWaitTimer after hit (0 if not handled). */
  saluteWaitTimerMs: number;
  cite: string;
}

// Stormwind SpellHit on Windsor's Inspiration Effect, only when the id is 20275 and no salute
// wait timer is running. Cite: guards.cpp:111-117.
export function stormwindGuardSpellHit(
  spellId: number,
  saluteWaitTimerMs: number,
  saluteIndex: number,
): StormwindSpellHitResult {
  if ((spellId | 0) !== SPELL_WINDSOR_INSPIRATION_EFFECT) {
    return {
      handled: false,
      textId: null,
      saluteWaitTimerMs,
      cite: 'guards.cpp:113 spell id gate 20275',
    };
  }
  if ((saluteWaitTimerMs | 0) !== 0) {
    return {
      handled: false,
      textId: null,
      saluteWaitTimerMs,
      cite: 'guards.cpp:113 !m_saluteWaitTimer gate',
    };
  }
  const idx = Math.max(0, Math.min(MAX_GUARD_SALUTES - 1, saluteIndex | 0));
  return {
    handled: true,
    textId: GUARD_SALUTE_TEXTS[idx]!,
    saluteWaitTimerMs: SALUTE_WAIT_MS,
    cite: 'guards.cpp:115-116 DoScriptText aGuardSalute + timer 2*MINUTE*IN_MILLISECONDS',
  };
}

/** Tick m_saluteWaitTimer. Cite: guards.cpp:120-128 UpdateAI */
export function stormwindSaluteTimerTick(
  saluteWaitTimerMs: number,
  diffMs: number,
): { saluteWaitTimerMs: number; cite: string } {
  if (!saluteWaitTimerMs) {
    return { saluteWaitTimerMs: 0, cite: 'guards.cpp:122 timer idle' };
  }
  if (saluteWaitTimerMs < (diffMs | 0)) {
    return { saluteWaitTimerMs: 0, cite: 'guards.cpp:124-125 timer expired → 0' };
  }
  return {
    saluteWaitTimerMs: saluteWaitTimerMs - (diffMs | 0),
    cite: 'guards.cpp:127 timer -= diff',
  };
}

// JustDied zone-under-attack message is UI/channel chrome. Cite: guard_ai.cpp:53-60
// SendZoneUnderAttackMessage
export function guardJustDiedHasZoneAlert(killerIsPlayer: boolean): {
  sendZoneUnderAttack: boolean;
  cite: string;
} {
  return {
    sendZoneUnderAttack: killerIsPlayer,
    cite: 'guard_ai.cpp:58-60 killer beneficiary player → SendZoneUnderAttackMessage',
  };
}

// IR builders

function unusedCreature(entry: number, reason: string, cite: string): ScriptDevUnusedBinding {
  return { entry, kind: 'creature', reason, cite };
}

function unusedForEntries(entries: number[], scriptName: string): ScriptDevUnusedBinding[] {
  return entries
    .filter((e) => !GUARDS_IN_BAKE.has(e))
    .map((entry) =>
      unusedCreature(
        entry,
        `creature_template ${entry} bound via ScriptName=${scriptName} but absent from product bake - IR ported; combat kit lives on bake spellList when present; emote/aggro/salute pure helpers apply when spawned`,
        `scriptdev-corpus.json boundCreatures + ${scriptName}; tables/creatures.json absent`,
      ),
    );
}

const EMOTE_REPLY_ACTIONS: ScriptDevAction[] = [
  {
    kind: 'flavor',
    text: 'DoReplyToTextEmote: KISS→BOW WAVE→WAVE SALUTE→SALUTE SHY→FLEX RUDE/CHICKEN→POINT',
    cite: 'guard_ai.cpp:83-93 DoReplyToTextEmote',
  },
];

function baseGuardLifecycle(opts?: {
  cenarionAggro?: boolean;
}): ScriptDevIR['lifecycle'] {
  return {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_globalCooldown=0; m_buffTimer=0 (Rebuff as soon as we can)',
        cite: 'guard_ai.cpp:34-38 Reset',
      },
    ],
    onAggro: opts?.cenarionAggro
      ? [
          {
            kind: 'yell',
            textId: SAY_GUARD_SIL_AGGRO1,
            cite: 'guard_ai.cpp:42-50 NPC_CENARION_INFANTRY urand(0,2) SAY_GUARD_SIL_AGGRO1..3 (host picks via cenarionHoldAggroSay)',
          },
        ]
      : undefined,
    onDeath: [
      {
        kind: 'flavor',
        text: 'SendZoneUnderAttackMessage to LocalDefense/WorldDefense when killer is player',
        cite: 'guard_ai.cpp:53-60 JustDied',
      },
    ],
  };
}

function makePlainGuardIr(
  name: string,
  boundCreatures: number[],
  extraCites: string[] = [],
): ScriptDevIR {
  return {
    name,
    boundCreatures,
    sourceFile: 'world/guards.cpp',
    spellIds: [],
    timers: [],
    lifecycle: baseGuardLifecycle(),
    unusedBindings: unusedForEntries(boundCreatures, name),
    cites: [
      `guards.cpp GetAI_${name} → new guardAI`,
      'guard_ai.cpp:29-81 guardAI CombatAI shell (no hard-coded cast timers)',
      'guard_ai.cpp:34-38 Reset m_globalCooldown/m_buffTimer=0',
      'guard_ai.cpp:53-60 JustDied zone alert',
      'guard_ai.cpp:63-81 JustRespawned ranged mode from spell list',
      ...extraCites,
    ],
  };
}

// ScriptDev IR — plain guardAI scripts

/** Cite: guards.cpp:45-48 / 165-167 */
export const GUARD_BLUFFWATCHER: ScriptDevIR = makePlainGuardIr('guard_bluffwatcher', [
  NPC_BLUFFWATCHER,
]);

// Contested-zone bruisers + Cenarion Hold Infantry. Cite: guards.cpp:50-53 / 169-172; guard_ai.cpp:42-50
// Cenarion aggro Bindings: 3502/4624/9460/11190/15184
export const GUARD_CONTESTED: ScriptDevIR = {
  name: 'guard_contested',
  boundCreatures: [
    NPC_RATCHET_BRUISER,
    NPC_BOOTY_BAY_BRUISER,
    NPC_GADGETZAN_BRUISER,
    NPC_EVERLOOK_BRUISER,
    NPC_CENARION_INFANTRY,
  ],
  sourceFile: 'world/guards.cpp',
  spellIds: [],
  timers: [],
  lifecycle: baseGuardLifecycle({ cenarionAggro: true }),
  unusedBindings: unusedForEntries(
    [
      NPC_RATCHET_BRUISER,
      NPC_BOOTY_BAY_BRUISER,
      NPC_GADGETZAN_BRUISER,
      NPC_EVERLOOK_BRUISER,
      NPC_CENARION_INFANTRY,
    ],
    'guard_contested',
  ),
  cites: [
    'guards.cpp:50-53 GetAI_guard_contested → guardAI',
    'guards.cpp:169-172 RegisterSelf guard_contested',
    'guard_ai.cpp:42-50 Aggro Cenarion Hold Infantry 15184 SAY_GUARD_SIL_AGGRO1..3',
    'guard_ai.h:15-19 SAY_GUARD_SIL_* + NPC_CENARION_INFANTRY=15184',
    'Combat cast kits: bake spellList (not ScriptDev timers)',
  ],
};

/** Cite: guards.cpp:55-58 / 174-177 */
export const GUARD_DARNASSUS: ScriptDevIR = makePlainGuardIr('guard_darnassus', [
  NPC_DARNASSUS_SENTINEL,
]);

/** Cite: guards.cpp:60-63 / 179-182 */
export const GUARD_DUNMOROGH: ScriptDevIR = makePlainGuardIr('guard_dunmorogh', [
  NPC_IRONFORGE_MOUNTAINEER,
  NPC_DUN_MOROGH_MOUNTAINEER,
]);

/** Cite: guards.cpp:65-68 / 184-187 */
export const GUARD_DUROTAR: ScriptDevIR = makePlainGuardIr('guard_durotar', [
  NPC_RAZOR_HILL_GRUNT,
]);

/** Cite: guards.cpp:70-73 / 189-192 */
export const GUARD_ELWYNNFOREST: ScriptDevIR = makePlainGuardIr('guard_elwynnforest', [
  NPC_STORMWIND_GUARD_ELWYNN,
]);

/** Cite: guards.cpp:75-78 / 194-197 */
export const GUARD_IRONFORGE: ScriptDevIR = makePlainGuardIr('guard_ironforge', [
  NPC_IRONFORGE_GUARD,
]);

/** Cite: guards.cpp:80-83 / 199-202 */
export const GUARD_MULGORE: ScriptDevIR = makePlainGuardIr('guard_mulgore', [
  NPC_BRAVE_IRONHORN,
  NPC_BRAVE_STRONGBASH,
  NPC_BRAVE_DAWNEAGLE,
  NPC_BRAVE_SWIFTWIND,
  NPC_BRAVE_LEAPING_DEER,
  NPC_BRAVE_DARKSKY,
  NPC_BRAVE_ROCKHORN,
  NPC_BRAVE_WILDRUNNER,
  NPC_BRAVE_RAINCHASER,
  NPC_BRAVE_CLOUDMANE,
]);

/** Cite: guards.cpp:145-148 / 214-217 */
export const GUARD_TELDRASSIL: ScriptDevIR = makePlainGuardIr('guard_teldrassil', [
  NPC_TELDRASSIL_SENTINEL,
]);

/** Cite: guards.cpp:150-153 / 219-222 */
export const GUARD_TIRISFAL: ScriptDevIR = makePlainGuardIr('guard_tirisfal', [
  NPC_DEATHGUARD_ABRAHAM,
  NPC_DEATHGUARD_TERRENCE,
  NPC_DEATHGUARD_BARTHOLOMEW,
  NPC_DEATHGUARD_LAWRENCE,
  NPC_DEATHGUARD_MORT,
  NPC_DEATHGUARD_MORRIS,
  NPC_DEATHGUARD_CYRUS,
  NPC_DEATHGUARD_GAVIN,
  NPC_DEATHGUARD_ROYANN,
  NPC_DEATHGUARD_LUNDMARK,
]);

/** Cite: guards.cpp:155-158 / 224-227 */
export const GUARD_UNDERCITY: ScriptDevIR = makePlainGuardIr('guard_undercity', [
  NPC_UNDERCITY_GUARDIAN,
]);

// ScriptDev IR — guard_orgrimmar (Horde emote replies)

// Cite: guards.cpp:85-88 / 204-207; guard_ai.cpp:96-100 guardAI_orgrimmar Binding: 3296 Orgrimmar Grunt
// (ABSENT bake → unused-binding).
export const GUARD_ORGRIMMAR: ScriptDevIR = {
  name: 'guard_orgrimmar',
  boundCreatures: [NPC_ORGRIMMAR_GRUNT],
  sourceFile: 'world/guards.cpp',
  spellIds: [],
  timers: [],
  lifecycle: baseGuardLifecycle(),
  receiveEmotes: [
    {
      emote: TEXTEMOTE_KISS,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guard_ai.cpp:87,96-100 Horde ReceiveEmote KISS→BOW (orgrimmarGuardReceiveEmote)',
    },
    {
      emote: TEXTEMOTE_WAVE,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guard_ai.cpp:88,96-100 Horde ReceiveEmote WAVE',
    },
    {
      emote: TEXTEMOTE_SALUTE,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guard_ai.cpp:89,96-100 Horde ReceiveEmote SALUTE',
    },
    {
      emote: TEXTEMOTE_SHY,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guard_ai.cpp:90,96-100 Horde ReceiveEmote SHY→FLEX',
    },
    {
      emote: TEXTEMOTE_RUDE,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guard_ai.cpp:91-92,96-100 Horde ReceiveEmote RUDE→POINT',
    },
    {
      emote: TEXTEMOTE_CHICKEN,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guard_ai.cpp:91-92,96-100 Horde ReceiveEmote CHICKEN→POINT',
    },
  ],
  unusedBindings: unusedForEntries([NPC_ORGRIMMAR_GRUNT], 'guard_orgrimmar'),
  cites: [
    'guards.cpp:85-88 GetAI_guard_orgrimmar → guardAI_orgrimmar',
    'guards.cpp:204-207 RegisterSelf',
    'guard_ai.cpp:42-47 struct guardAI_orgrimmar',
    'guard_ai.cpp:96-100 ReceiveEmote Horde only → DoReplyToTextEmote',
    'guard_ai.cpp:83-93 DoReplyToTextEmote switch',
  ],
};

// ScriptDev IR — guard_stormwind (Alliance emote + Windsor salute)

// guardAI_stormwind — 68 and 1756 are in bake, 1976 is absent so that binding is unused. The
// salute timer and text selection are pure helpers. Cite: guards.cpp:90-143.
export const GUARD_STORMWIND: ScriptDevIR = {
  name: 'guard_stormwind',
  boundCreatures: [
    NPC_STORMWIND_CITY_GUARD,
    NPC_STORMWIND_ROYAL_GUARD,
    NPC_STORMWIND_CITY_PATROLLER,
  ],
  sourceFile: 'world/guards.cpp',
  spellIds: [SPELL_WINDSOR_INSPIRATION_EFFECT],
  timers: [],
  spellHits: [
    {
      spellId: SPELL_WINDSOR_INSPIRATION_EFFECT,
      actions: [
        {
          kind: 'yell',
          textId: GUARD_SALUTE_TEXTS[0]!,
          cite: 'guards.cpp:115 DoScriptText aGuardSalute[urand]; pure helper stormwindGuardSpellHit arms SALUTE_WAIT_MS',
        },
        {
          kind: 'flavor',
          text: `m_saluteWaitTimer = ${SALUTE_WAIT_MS} (2*MINUTE*IN_MILLISECONDS); blocked until timer expires`,
          cite: 'guards.cpp:116-117',
        },
      ],
      cite: 'guards.cpp:111-117 SpellHit SPELL_WINDSOR_INSPIRATION_EFFECT 20275',
    },
  ],
  receiveEmotes: [
    {
      emote: TEXTEMOTE_KISS,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guards.cpp:133-137 Alliance ReceiveEmote KISS (stormwindGuardReceiveEmote)',
    },
    {
      emote: TEXTEMOTE_WAVE,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guards.cpp:133-137 Alliance ReceiveEmote WAVE',
    },
    {
      emote: TEXTEMOTE_SALUTE,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guards.cpp:133-137 Alliance ReceiveEmote SALUTE',
    },
    {
      emote: TEXTEMOTE_SHY,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guards.cpp:133-137 Alliance ReceiveEmote SHY',
    },
    {
      emote: TEXTEMOTE_RUDE,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guards.cpp:133-137 Alliance ReceiveEmote RUDE',
    },
    {
      emote: TEXTEMOTE_CHICKEN,
      actions: EMOTE_REPLY_ACTIONS,
      cite: 'guards.cpp:133-137 Alliance ReceiveEmote CHICKEN',
    },
  ],
  lifecycle: {
    ...baseGuardLifecycle(),
    onReset: [
      {
        kind: 'flavor',
        text: 'm_saluteWaitTimer=0; guardAI::Reset m_globalCooldown/m_buffTimer=0',
        cite: 'guards.cpp:106-109 Reset; guard_ai.cpp:34-38',
      },
    ],
  },
  unusedBindings: unusedForEntries(
    [NPC_STORMWIND_CITY_GUARD, NPC_STORMWIND_ROYAL_GUARD, NPC_STORMWIND_CITY_PATROLLER],
    'guard_stormwind',
  ),
  cites: [
    'guards.cpp:90-143 guardAI_stormwind',
    'guards.cpp:91 SPELL_WINDSOR_INSPIRATION_EFFECT=20275',
    'guards.cpp:92-95 MAX_GUARD_SALUTES=7 aGuardSalute',
    'guards.cpp:106-109 Reset m_saluteWaitTimer=0',
    'guards.cpp:111-117 SpellHit 20275 + 2min timer',
    'guards.cpp:120-131 UpdateAI salute countdown + guardAI::UpdateAI',
    'guards.cpp:133-137 ReceiveEmote Alliance only',
    'guards.cpp:140-143 GetAI / 209-212 RegisterSelf',
  ],
};
