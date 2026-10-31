// Naxxramas Arachnid + Plague Quarters — the ScriptDevAI IR port of Anub'Rekhan, Faerlina, Maexxna,
// Noth, Heigan and Loatheb. Cadence is creature_spell_list rows; the C++ is cited per timer.

import type { ScriptDevIR, ScriptDevTimer } from './types.ts';
import { INSTANCE_DATA } from './types.ts';

// naxxramas.h:53-59
const TYPE = {
  ANUB_REKHAN: 0, FAERLINA: 1, MAEXXNA: 2, NOTH: 3, HEIGAN: 4, LOATHEB: 5,
} as const;

// naxxramas.h:73-74 for the two named bosses; the rest are creature_template.entry rows whose
// ScriptName is the cpp's registered name (live3310 creature_template).
const NPC = {
  ANUB_REKHAN: 15956, FAERLINA: 15953, MAEXXNA: 15952,
  NOTH: 15954, HEIGAN: 15936, LOATHEB: 16011,
  WEB_WRAP: 16486, INVISIBLE_MAN: 17286,
  DISEASED_MAGGOT: 16056, ROTTING_MAGGOT: 16057,
  CRYPT_GUARD: 16573, CORPSE_SCARAB: 16698,
} as const;

// naxxramas.h:122
const GO_ARAC_ANUB_DOOR = 181126;

/** BossAI::SetDataType — Aggro IN_PROGRESS, JustDied DONE, evade/home FAIL. Cite: BossAI.cpp:41-98. */
function lifecycleFor(field: number, file: string) {
  return {
    onAggro: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.IN_PROGRESS, cite: `${file} SetDataType; BossAI.cpp:75 Aggro SetData(IN_PROGRESS)` }],
    onDeath: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.DONE, cite: `${file} SetDataType; BossAI.cpp:49 JustDied SetData(DONE)` }],
    onEvade: [{ kind: 'set_instance_data' as const, field, value: INSTANCE_DATA.FAIL, cite: `${file} SetDataType; BossAI.cpp:59,94 SetData(FAIL)` }],
  };
}

// `creature_spell_list.TargetId` → IR target mode: 0 NONE (self-cast), 1 CURRENT (victim), 2 SELF,
// 100 attack-random-player. Cite: CreatureSpellList.h:34-43; creature_spell_targeting rows.
const t = (
  id: string, spellId: number, iMin: number, iMax: number, rMin: number, rMax: number,
  target: ScriptDevTimer['target'], cite: string, extra: Partial<ScriptDevTimer> = {},
): ScriptDevTimer => ({
  id, spellId, initialMinMs: iMin, initialMaxMs: iMax, repeatMinMs: rMin, repeatMaxMs: rMax,
  target, cite, ...extra,
});

// boss_anubrekhan
export const BOSS_ANUBREKHAN: ScriptDevIR = {
  name: 'boss_anubrekhan',
  boundCreatures: [NPC.ANUB_REKHAN],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_anubrekhan.cpp',
  // Trigger payloads ride the KIT: stepSession resolves a periodic trigger off
  // spec.spells, so a payload missing here delivers nothing (moltenCore.ts:88 same rule).
  spellIds: [18943, 28783, 28785, 29103, 29508, 28961, 29379, 18941, 28786, 29104],
  timers: [
    t('double_attack', 18943, 0, 0, 0, 0, 'self', 'boss_anubrekhan.cpp:93 Reset DoCastSpellIfCan(SPELL_DOUBLE_ATTACK, TRIGGERED|AURA_NOT_PRESENT)', { onReset: true }),
    t('anub_aura', 29103, 0, 0, 0, 0, 'self', 'boss_anubrekhan.cpp:99 Aggro DoCastSpellIfCan(m_creature, SPELL_ANUB_AURA, TRIGGERED|AURA_NOT_PRESENT)', { onReset: true }),
    t('impale', 28783, 15_000, 15_000, 12_000, 18_000, 'hostile_random_player', "creature_spell_list 1595601:1 Anub'Rekhan - Impale, TargetId 100 = Attack - random player"),
    t('locust_swarm', 28785, 80_000, 120_000, 90_000, 90_000, 'self', "creature_spell_list 1595601:2 Anub'Rekhan - Locust Swarm, TargetId 2 = Self", {
      actions: [{
        kind: 'arm_timer',
        timerId: 'summon_guard',
        delayMs: 3000,
        cite: 'boss_anubrekhan.cpp:124-128 OnSpellCast(SPELL_LOCUSTSWARM) ResetTimer(ANUBREKHAN_SUMMON, 3000)',
      }],
    }),
    {
      id: 'summon_guard',
      spellId: 29508,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      startDisabled: true,
      oneShot: true,
      cite: 'boss_anubrekhan.cpp:78-81 AddCustomAction(ANUBREKHAN_SUMMON, true) DoCastSpellIfCan(SPELL_SUMMON_GUARD 29508)',
    },
    // 1595601:3 (28961) is NOT here: Availability 0 erases the row on spawn — see header.
    t('greet2', 13006, 0, 0, 0, 0, 'self', 'boss_anubrekhan.cpp:54-61 SAY_GREET2 13006 delay 7000', {
      pollOnly: true, oneShot: true, startDisabled: true,
      actions: [
        { kind: 'yell', textId: 13006, cite: 'boss_anubrekhan.cpp:56 SAY_GREET2' },
        { kind: 'arm_timer', timerId: 'greet3', delayMs: 13000, cite: 'boss_anubrekhan.cpp:57 SAY_GREET3 delay 13000' },
      ],
    }),
    t('greet3', 13007, 0, 0, 0, 0, 'self', 'boss_anubrekhan.cpp:57 SAY_GREET3 13007 delay 13000', {
      pollOnly: true, oneShot: true, startDisabled: true,
      actions: [
        { kind: 'yell', textId: 13007, cite: 'boss_anubrekhan.cpp:57 SAY_GREET3' },
        { kind: 'arm_timer', timerId: 'greet4', delayMs: 11000, cite: 'boss_anubrekhan.cpp:58 SAY_GREET4 delay 11000' },
      ],
    }),
    t('greet4', 13008, 0, 0, 0, 0, 'self', 'boss_anubrekhan.cpp:58 SAY_GREET4 13008 delay 11000', {
      pollOnly: true, oneShot: true, startDisabled: true,
      actions: [
        { kind: 'yell', textId: 13008, cite: 'boss_anubrekhan.cpp:58 SAY_GREET4' },
        { kind: 'arm_timer', timerId: 'greet5', delayMs: 10000, cite: 'boss_anubrekhan.cpp:59 SAY_GREET5 delay 10000' },
      ],
    }),
    t('greet5', 13009, 0, 0, 0, 0, 'self', 'boss_anubrekhan.cpp:59 SAY_GREET5 13009 delay 10000', {
      pollOnly: true, oneShot: true, startDisabled: true,
      actions: [
        { kind: 'yell', textId: 13009, cite: 'boss_anubrekhan.cpp:59 SAY_GREET5' },
      ],
    }),
  ],
  lifecycle: lifecycleFor(TYPE.ANUB_REKHAN, 'boss_anubrekhan.cpp:74'),
  receiveAiEvents: [
    {
      eventType: 1000,
      actions: [
        { kind: 'arm_timer', timerId: 'greet2', delayMs: 7000, cite: 'boss_anubrekhan.cpp:54-61 StartIntro() arms SAY_GREET2 at 7000' }
      ],
      cite: 'boss_anubrekhan.cpp:142-143 GOUse_go_anub_door triggers StartIntro()',
    }
  ],
  addDeaths: [{
    creatureEntries: [NPC.CRYPT_GUARD],
    atKilled: 'every',
    total: 99,
    actions: [{
      kind: 'summon_count',
      creatureEntry: NPC.CORPSE_SCARAB,
      count: 10,
      cite: 'boss_anubrekhan.cpp:164 28864 Summon 10 Corpse Scarabs; raw basePoints 9+1',
    }],
    cite: 'boss_anubrekhan.cpp:155-168 SummonCorpseScarabs 28961 on dead Crypt Guard 16573',
  }],
  cites: [
    'boss_anubrekhan.cpp:30-195 whole file',
    "creature_spell_list_entry 1595601 \"Naxxramas - Anub'Rekhan\"",
    'creature_spell_list 1595601:3 Availability 0; Creature.cpp:2397-2401 urand(0,100) > Availability erases the row',
    'boss_anubrekhan.cpp:78-81,124-128 OnSpellCast(28785) ResetTimer(SUMMON, 3000) → 29508',
    'boss_anubrekhan.cpp:155-168 28961 on dead 16573 -> 28864 x10 NPC 16698',
  ],
};

// go_anub_door (same cpp) — the door that starts his greet dialogue
export const GO_ANUB_DOOR: ScriptDevIR = {
  name: 'go_anub_door',
  boundCreatures: [],
  boundGos: [GO_ARAC_ANUB_DOOR],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_anubrekhan.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [GO_ARAC_ANUB_DOOR],
    gates: [
      { field: TYPE.ANUB_REKHAN, notEquals: INSTANCE_DATA.IN_PROGRESS, cite: 'boss_anubrekhan.cpp:141 GetData(TYPE_ANUB_REKHAN) == IN_PROGRESS -> no intro' },
      { field: TYPE.ANUB_REKHAN, notEquals: INSTANCE_DATA.DONE, cite: 'boss_anubrekhan.cpp:141 GetData(TYPE_ANUB_REKHAN) == DONE -> no intro' },
    ],
    // The 7/13/11/10 s dialogue runs on pollOnly timers triggered by send_ai_event 1000 (CUSTOM_A).
    actions: [
      { kind: 'yell', textId: 13004, cite: 'boss_anubrekhan.cpp:32,56,106 StartNextDialogueText(SAY_GREET1)' },
      { kind: 'send_ai_event', eventType: 1000, receiver: 'creature_entry', creatureEntry: NPC.ANUB_REKHAN, cite: 'boss_anubrekhan.cpp:142-143 pAI->StartIntro() triggers SAY_GREET2..5' },
    ],
    cite: 'boss_anubrekhan.cpp:137-153 GOUse_go_anub_door',
  },
  cites: [
    'boss_anubrekhan.cpp:137-153,188-191 GOUse_go_anub_door + RegisterSelf',
    'naxxramas.h:122 GO_ARAC_ANUB_DOOR 181126; gameobject_template 181126 ScriptName go_anub_door',
    'boss_anubrekhan.cpp:54-61 introDialogue SAY_GREET2..5 (13006/13007/13008/13009)',
  ],
};

// boss_faerlina
export const BOSS_FAERLINA: ScriptDevIR = {
  name: 'boss_faerlina',
  boundCreatures: [NPC.FAERLINA],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_faerlina.cpp',
  spellIds: [28796, 28794, 28798, 28732, 28797, 28748],
  timers: [
    t('poison_bolt_volley', 28796, 8000, 8000, 11_000, 11_000, 'victim', 'creature_spell_list 1595301:1 Faerlina - Poison Bolt, TargetId 1 = Current'),
    t('rain_of_fire', 28794, 16_000, 16_000, 16_000, 16_000, 'hostile_random_player', 'creature_spell_list 1595301:2 Faerlina - Rain of Fire, TargetId 100 = Attack - random player'),
    t('enrage', 28798, 60_000, 60_000, 60_000, 60_000, 'self', 'creature_spell_list 1595301:3 Faerlina - Enrage, TargetId 2 = Self (ScriptId 23010 has no dbscripts_on_relay row)', {
      actions: [{ kind: 'yell', textIds: [12857, 12858, 12859], cite: 'boss_faerlina.cpp:33-35,75-86 OnSpellCast(SPELL_ENRAGE 28798) urand(0,2) over SAY_ENRAGE_1/2/3 12857/12858/12859' }],
    }),
  ],
  lifecycle: lifecycleFor(TYPE.FAERLINA, 'boss_faerlina.cpp:63'),
  leashZGt: 266,
  cites: [
    'boss_faerlina.cpp:30-119 whole file',
    'creature_spell_list_entry 1595301 "Naxxramas - Faerlina"',
    'boss_faerlina.cpp:33-35,75-86 OnSpellCast(28798) urand(0,2) over SAY_ENRAGE_1/2/3 12857/12858/12859',
    'boss_faerlina.cpp:89-109 WidowEmbrace 28732 SpellScript is ported (applySpell.ts); raid_resp_mc_16506 now beats recovery (evaluate.ts chooseCombatAction)',
    'boss_faerlina.cpp:52,67-71 SetLeashingCheck z > 266',
  ],
};

// boss_maexxna (+ npc_web_wrap / npc_invible_man, registered by the same cpp)
export const BOSS_MAEXXNA: ScriptDevIR = {
  name: 'boss_maexxna',
  boundCreatures: [NPC.MAEXXNA],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_maexxna.cpp',
  // Trigger payloads ride the KIT: stepSession resolves a periodic trigger off
  // spec.spells, so a payload missing here delivers nothing (moltenCore.ts:88 same rule).
  spellIds: [19818, 28673, 29484, 28741, 28776, 29434, 28747, 28622, 28618, 28619, 28620, 28621, 29280, 29281, 29282, 29283, 29285, 29287, 18941],
  timers: [
    t('double_attack', 19818, 0, 0, 0, 0, 'self', 'boss_maexxna.cpp:136 Reset DoCastSpellIfCan(SPELL_DOUBLE_ATTACK, TRIGGERED|AURA_NOT_PRESENT)', { onReset: true }),
    // 28673 is a bare SCRIPT effect (raw 77), so nothing landed. Its whole output is 28622 on three
    // shuffled non-tank players — a 60 s stun and a 657/2 s dot — so the row delivers that directly.
    t('web_wrap', 28673, 20_000, 20_000, 40_000, 40_000, 'self', 'creature_spell_list 1595201:0 Maexxna - Web Wrap, TargetId 0 = None; boss_maexxna.cpp:207-224 WebWrapMaexxna', {
      actions: [{
        kind: 'cast_on_random_players',
        spellId: 28622,
        count: 3,
        skipTopThreat: true,
        cite: 'boss_maexxna.cpp:62 MAX_PLAYERS_WEB_WRAP 3; :212-223 SelectAttackingTargets(ALL_SUITABLE, 1, PLAYER | SKIP_TANK) shuffled and resized; :51 SPELL_WEBWRAP_STUN 28622 is what 28618-28621 trigger',
      }],
    }),
    t('web_spray', 29484, 40_000, 40_000, 40_000, 40_000, 'self', 'creature_spell_list 1595201:1 Maexxna - Web Spray'),
    t('poison_shock', 28741, 10_000, 20_000, 10_000, 20_000, 'self', 'creature_spell_list 1595201:2 Maexxna - Poison Shock'),
    t('necrotic_poison', 28776, 20_000, 30_000, 10_000, 30_000, 'victim', 'creature_spell_list 1595201:3 Maexxna - Necrotic Poison, TargetId 1 = Current'),
    t('summon_spiderlings', 29434, 30_000, 30_000, 40_000, 40_000, 'self', 'creature_spell_list 1595201:4 Maexxna - Summon Spiderlings (10 per cast)'),
    // Band, not a phase: 1595201:5 gates on CombatCondition 1128 -> unit_condition 888 (self
    // HEALTH_PERCENT < 30), so the 10 min repeat means it lands once at the enrage.
    t('frenzy', 28747, 0, 0, 600_000, 600_000, 'self', 'creature_spell_list 1595201:5 Maexxna - Enrage below 30% (CombatCondition 1128 -> unit_condition 888 Op 3 Value 30)', { hpPctMax: 30 }),
  ],
  lifecycle: {
    ...lifecycleFor(TYPE.MAEXXNA, 'boss_maexxna.cpp:126'),
    summonedReachedHome: [{
      kind: 'force_despawn',
      cite: 'boss_maexxna.cpp:145-148 SummonedJustReachedHome summoned->ForcedDespawn',
    }],
  },
  cites: [
    'boss_maexxna.cpp:30-301 whole file',
    'creature_spell_list_entry 1595201 "Naxxramas - Maexxna"',
    'boss_maexxna.cpp:207-246 WebWrapMaexxna 3 skip-tank players -> 28622 via cast_on_random_players',
    'boss_maexxna.cpp:66-111,151-205 the Web Wrap NPC 16486 that the raid kills to free a wrapped raider EARLY is a residual: it needs a summon owned by the victim whose death strips the aura from its spawner, and no verb here carries that link. The 60 s duration is what frees them instead',
    'boss_maexxna.cpp:145-148 SummonedJustReachedHome ForcedDespawn',
  ],
};

export const NPC_WEB_WRAP: ScriptDevIR = {
  name: 'npc_web_wrap',
  boundCreatures: [NPC.WEB_WRAP],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_maexxna.cpp',
  spellIds: [29826, 28628, 28629, 29108],
  timers: [
    t('self_stun', 29826, 0, 0, 0, 0, 'self', 'boss_maexxna.cpp:82 Reset DoCastSpellIfCan(m_creature, SPELL_SELF_STUN, CAST_TRIGGERED)', { onReset: true }),
  ],
  // No unusedBindings row: 16486 and 29826/28628/28629/29108 are ALL in the bake, so the row that
  // called them absent was wrong. The missing LINK is named in the cites instead.
  cites: [
    'boss_maexxna.cpp:66-111 npc_web_wrapAI; :288-291 RegisterSelf',
    'boss_maexxna.cpp:79 SetCombatMovement(false)',
    'boss_maexxna.cpp:85-94 JustDied -> 28628 on spawner + ForcedDespawn(5000); :96-110 the 1 s victim-alive poll -> 28629. Both need a summon-to-spawner link no verb here carries, so they stay unported and the wrap frees the raider on its own 60 s timer instead',
  ],
};

export const NPC_INVISIBLE_MAN: ScriptDevIR = {
  name: 'npc_invible_man',
  boundCreatures: [NPC.INVISIBLE_MAN],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_maexxna.cpp',
  // Trigger payloads ride the KIT: stepSession resolves a periodic trigger off
  // spec.spells, so a payload missing here delivers nothing (moltenCore.ts:88 same rule).
  spellIds: [28618, 28619, 28620, 28621, 28627, 28622],
  // No timers by design: the script is a SpellHitTarget relay, not a combat AI.
  timers: [],
  cites: [
    'boss_maexxna.cpp:151-205 npc_invisible_manAI; :293-296 RegisterSelf',
    'boss_maexxna.cpp:161 SetReactState(REACT_PASSIVE)',
    'boss_maexxna.cpp:188-204 SpellHitTarget 28618-28621 stores the victim, timer 5 s (28618) else 6 s',
    'boss_maexxna.cpp:172-185 HandleVictimCheck -> victim casts 28627 - GAP (no cast-as-player verb)',
  ],
};

// boss_noth
export const BOSS_NOTH: ScriptDevIR = {
  name: 'boss_noth',
  boundCreatures: [NPC.NOTH],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_noth.cpp',
  // Trigger payloads ride the KIT: stepSession resolves a periodic trigger off
  // spec.spells, so a payload missing here delivers nothing (moltenCore.ts:88 same rule).
  spellIds: [29213, 29208, 29209, 29210, 29211, 29252, 29247, 29248, 29249, 29216, 29231, 29230, 29212, 30228, 29217, 29227, 29224, 29225, 29258, 29262, 29255, 29257, 29267, 29238, 29214],
  timers: [
    t('curse_of_the_plaguebringer', 29213, 4000, 4000, 28_000, 28_000, 'self', 'creature_spell_list 1595401:0 Noth - Curse of the Plaguebringer, TargetId 0 = None'),
    // Four rows, one shared spell category (Flags 4) — the server fires at most one per 25 s.
    t('blink_1', 29208, 25_000, 25_000, 25_000, 25_000, 'self', 'creature_spell_list 1595401:1 Noth - Blink - Category CD', { actions: [{ kind: 'reset_threat', cite: 'boss_noth.cpp:218-219 OnSpellCast blink set → DoResetThreat' }] }),
    t('blink_2', 29209, 25_000, 25_000, 25_000, 25_000, 'self', 'creature_spell_list 1595401:2 Noth - Blink - Category CD', { actions: [{ kind: 'reset_threat', cite: 'boss_noth.cpp:218-219 OnSpellCast blink set → DoResetThreat' }] }),
    t('blink_3', 29210, 25_000, 25_000, 25_000, 25_000, 'self', 'creature_spell_list 1595401:3 Noth - Blink - Category CD', { actions: [{ kind: 'reset_threat', cite: 'boss_noth.cpp:218-219 OnSpellCast blink set → DoResetThreat' }] }),
    t('blink_4', 29211, 25_000, 25_000, 25_000, 25_000, 'self', 'creature_spell_list 1595401:4 Noth - Blink - Category CD', { actions: [{ kind: 'reset_threat', cite: 'boss_noth.cpp:218-219 OnSpellCast blink set → DoResetThreat' }] }),
    t('summon_skeletons', 29252, 12_000, 12_000, 30_000, 30_000, 'self', 'boss_noth.cpp:127,281-285 AddCombatAction(NOTH_SUMMON, 12s); ground branch casts SPELL_SUMMON_SKELETONS then re-arms 30s', { phase: 0 }),
    t('champ_sw', 29217, 0, 0, 0, 0, 'self', 'boss_noth.cpp:185 SW urand 29217/29227 NPC 16983', {
      startDisabled: true, oneShot: true, rotateSpellIds: [29217, 29227],
    }),
    t('champ_nw', 29224, 0, 0, 0, 0, 'self', 'boss_noth.cpp:187 NW urand 29224/29225 NPC 16983', {
      startDisabled: true, oneShot: true, rotateSpellIds: [29224, 29225],
    }),
    t('champ_ne', 29258, 0, 0, 0, 0, 'self', 'boss_noth.cpp:189 NE urand 29258/29262 NPC 16983', {
      startDisabled: true, oneShot: true, rotateSpellIds: [29258, 29262],
    }),
    t('champ_west', 29255, 0, 0, 0, 0, 'self', 'boss_noth.cpp:191 West urand 29255/29257/29267/29238 NPC 16983', {
      startDisabled: true, oneShot: true, rotateSpellIds: [29255, 29257, 29267, 29238],
    }),
  ],
  // ONE balcony trip, not three: boss_noth.cpp:274 disables NOTH_PHASE_GROUND right after the
  // :269-270 re-arm, and BALCONY is never re-enabled, so sub-phases 2 and 3 are unreachable.
  timedPhases: [
    { id: 'balcony_1', phase: 1, afterMs: 90_000, next: 'ground_1', actions: [
      { kind: 'set_unattackable', cite: 'boss_noth.cpp:234-239 SetAIImmobilizedState + UNINTERACTIBLE|IMMUNE_TO_PLAYER' },
      { kind: 'set_melee_enabled', enabled: false, cite: 'boss_noth.cpp:237 SetMeleeEnabled(false)' },
      { kind: 'flavor', text: 'teleports up to the balcony!', cite: 'boss_noth.cpp:228 DoCastSpellIfCan(SPELL_TELEPORT 29216)' },
      { kind: 'arm_timer', timerId: 'champ_sw', delayMs: 0, cite: 'boss_noth.cpp:182-193 DoSummonPlaguedChampions SW' },
      { kind: 'arm_timer', timerId: 'champ_nw', delayMs: 0, cite: 'boss_noth.cpp:182-193 DoSummonPlaguedChampions NW' },
      { kind: 'arm_timer', timerId: 'champ_ne', delayMs: 0, cite: 'boss_noth.cpp:182-193 DoSummonPlaguedChampions NE' },
      { kind: 'arm_timer', timerId: 'champ_west', delayMs: 0, cite: 'boss_noth.cpp:182-193 DoSummonPlaguedChampions West' },
    ], cite: 'boss_noth.cpp:128 AddCombatAction(NOTH_PHASE_BALCONY, 90s)' },
    { id: 'ground_1', phase: 0, afterMs: 70_000, actions: [
      { kind: 'clear_unattackable', cite: 'boss_noth.cpp:260-262 SetAIImmobilizedState(false) + RemoveFlag(UNINTERACTIBLE|IMMUNE_TO_PLAYER)' },
      { kind: 'set_melee_enabled', enabled: true, cite: 'boss_noth.cpp:264 SetMeleeEnabled(true)' },
      { kind: 'flavor', text: 'returns to the floor!', cite: 'boss_noth.cpp:258 DoCastSpellIfCan(SPELL_TELEPORT_RETURN 29231)' },
    ], cite: 'boss_noth.cpp:244 PHASE_SKELETON_1 ResetCombatAction(NOTH_PHASE_GROUND, 70s)' },
  ],
  lifecycle: lifecycleFor(TYPE.NOTH, 'boss_noth.cpp:124'),
  cites: [
    'boss_noth.cpp:28-353 whole file',
    'creature_spell_list_entry 1595401 "Naxxramas - Noth"',
    'boss_noth.cpp:226-255 NOTH_PHASE_BALCONY; :256-278 NOTH_PHASE_GROUND',
    'boss_noth.cpp:181-193 DoSummonPlaguedChampions first balcony 4 corners NPC 16983 (waves 2-3 unreachable)',
    'boss_noth.cpp:321-331 SummonSkeletonsNoth 29252 tick -> 29247/29248/29249',
  ],
};

// The plague wave order, verbatim. Six steps, not four: 30117 and 30118 each come round twice. Cite:
// boss_heigan.cpp:280-290 PlagueWaveController.
const WAVE_CYCLE = [
  { step: 0, spellId: 30116 },
  { step: 1, spellId: 30117 },
  { step: 2, spellId: 30118 },
  { step: 3, spellId: 30119 },
  { step: 4, spellId: 30118 },
  { step: 5, spellId: 30117 },
];

// boss_heigan (+ npc_diseased_maggot, registered by the same cpp)
// ---------------------------------------------------------------------------
export const BOSS_HEIGAN: ScriptDevIR = {
  name: 'boss_heigan',
  boundCreatures: [NPC.HEIGAN],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_heigan.cpp',
  // Trigger payloads ride the KIT: stepSession resolves a periodic trigger off
  // spec.spells, so a payload missing here delivers nothing (moltenCore.ts:88 same rule).
  spellIds: [29310, 29998, 29499, 30211, 29273, 29350, 29351, 30114, 30122, 30116, 30117, 30118, 30119],
  timers: [
    // phase 0 only: the platform phase channels 29350, and a channel makes CanCastSpell()
    // false — see the header. All three rows are TargetId 0 (the spell picks its targets).
    t('mana_burn', 29310, 5000, 5000, 10_000, 10_000, 'self', 'creature_spell_list 1593601:0 Heigan - Mana Burn, TargetId 0 = None', { phase: 0 }),
    t('decrepit_fever', 29998, 4000, 4000, 21_000, 21_000, 'self', 'creature_spell_list 1593601:1 Heigan - Decrepit Fever', { phase: 0 }),
    t('teleport_trigger', 29499, 35_000, 45_000, 35_000, 45_000, 'self', 'creature_spell_list 1593601:2 Heigan - Teleport Trigger (3 targets -> 29273; both bake holes)', { phase: 0 }),
    t('heigan_taunt', 0, 25_000, 90_000, 25_000, 90_000, 'self', 'boss_heigan.cpp:91 AddCombatAction(HEIGAN_TAUNT, 25u * IN_MILLISECONDS, 90u * IN_MILLISECONDS); :213-221 case HEIGAN_TAUNT: switch (urand(0, 3)) DoBroadcastText', {
      phase: 0,
      pollOnly: true,
      actions: [{ kind: 'yell', textIds: [13046, 13047, 13048, 13050], cite: 'boss_heigan.cpp:213-221 case HEIGAN_TAUNT: switch (urand(0, 3)) DoBroadcastText' }],
    }),
    // THE DANCE. The controller aura walks six steps {30116,30117,30118,30119,30118,30117}, so a
    // four-timer cycle would be a 40 s invention. Ground amplitude is 10 s, the platform's 3 s.
    ...WAVE_CYCLE.flatMap(({ step, spellId }) => [
      t(
        `wave_ground_${step}`, spellId, step * 10_000, step * 10_000, 60_000, 60_000, 'self',
        'boss_heigan.cpp:280-290 PlagueWaveController step '
        + `${step} of 6; 29351 amplitude 10000 on the ground`,
        { phase: 0 },
      ),
      t(
        `wave_platform_${step}`, spellId, step * 3000, step * 3000, 18_000, 18_000, 'self',
        'boss_heigan.cpp:280-290 PlagueWaveController step '
        + `${step} of 6; 30114 amplitude 3000 while he channels`,
        { phase: 1 },
      ),
    ]),
    t('close_entrance', 29350, 15_000, 15_000, 0, 0, 'self', 'boss_heigan.cpp:124 ResetTimer(HEIGAN_DOOR, 15s) -> CloseEntrance GO 181202', {
      pollOnly: true,
      oneShot: true,
      actions: [{
        kind: 'close_door',
        goEntry: 181202,
        cite: 'boss_heigan.cpp:190-197 CloseEntrance SetGoState(GO_STATE_READY); naxxramas.h:134 GO_PLAG_HEIG_ENTRY_DOOR 181202',
      }],
    }),
  ],
  // A clock, not a health bar: 90 s on the ground, 45 s on the platform, forever.
  timedPhases: [
    {
      id: 'platform',
      phase: 1,
      afterMs: 90_000,
      next: 'ground',
      actions: [
        { kind: 'set_melee_enabled', enabled: false, cite: 'boss_heigan.cpp:162 SetMeleeEnabled(false)' },
        { kind: 'yell', textId: 13049, cite: 'boss_heigan.cpp:201 HandleChanneling DoBroadcastText(SAY_CHANNELING)' },
        // THE CHANNEL. 29350 Plague Cloud is a 45 s proc host firing 30122 every 5 s — nine 4k
        // nature pulses. The tree resolves it as an AURA, so it does not gate his other casts.
        { kind: 'cast_self', spellId: 29350, cite: 'boss_heigan.cpp:203 DoCastSpellIfCan(nullptr, SPELL_PLAGUE_CLOUD)' },
        { kind: 'flavor', text: 'leaps to his platform and starts channeling - run the dance!', cite: 'boss_heigan.cpp:157-171 HandlePlatformPhase 30211 + :202 SPELL_PLAGUE_CLOUD 29350' },
      ],
      cite: 'boss_heigan.cpp:90 AddCombatAction(HEIGAN_PHASE_PLATFORM, 90s); :225-230 ExecuteAction -> HandlePlatformPhase',
    },
    {
      id: 'ground',
      phase: 0,
      afterMs: 45_000,
      next: 'platform',
      actions: [
        { kind: 'arm_timer', timerId: 'heigan_taunt', delayMs: 5000, cite: 'boss_heigan.cpp:145-146 for (uint32 action : {HEIGAN_TAUNT}) ResetCombatAction(action, 5000)' },
        { kind: 'set_melee_enabled', enabled: true, cite: 'boss_heigan.cpp:150 SetMeleeEnabled(true)' },
        { kind: 'flavor', text: 'drops back to the floor.', cite: 'boss_heigan.cpp:143-155 HandleGroundPhase' },
      ],
      cite: 'boss_heigan.cpp:170 ResetTimer(HEIGAN_PHASE_GROUND, 45s); :154 back to 90s platform',
    },
  ],
  lifecycle: lifecycleFor(TYPE.HEIGAN, 'boss_heigan.cpp:86'),
  leashXGt: 2825,
  leashHomeYd: 90,
  cites: [
    'boss_heigan.cpp:30-323 whole file',
    'creature_spell_list_entry 1593601 "Naxxramas - Heigan"',
    'boss_heigan.cpp:92,173-188 StartEruptions -> NPC 17293 casts 29351 (slow) / 30114 (fast); the cycle runs off Heigan own timers here, so the CASTER of record is the only difference (src/dev/smoke/heiganDance.mjs)',
    'boss_heigan.cpp:280-290 PlagueWaveController {30116,30117,30118,30119,30118,30117} per tick - the six wave_ground_/wave_platform_ rows above; the fissures are type-6 traps casting 29371 Eruption',
    'boss_heigan.cpp:62,80-85 leash x > 2825 or >90 yd from spawn',
    'boss_heigan.cpp:124,190-197 entrance door GO 181202 closes 15 s after aggro',
  ],
};

export const NPC_DISEASED_MAGGOT: ScriptDevIR = {
  name: 'npc_diseased_maggot',
  boundCreatures: [NPC.DISEASED_MAGGOT, NPC.ROTTING_MAGGOT],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_heigan.cpp',
  spellIds: [],
  // No timers by design: the whole script is a 3 s proximity force-evade.
  timers: [],
  cites: [
    'boss_heigan.cpp:237-276 npc_diseased_maggotAI; :316-319 RegisterSelf',
    'boss_heigan.cpp:264-272 3 s poll: NPC_WORLD_TRIGGER 15384 within 45 yd -> EnterEvadeMode - GAP',
    'creature_template 16056 Diseased Maggot / 16057 Rotting Maggot ScriptName npc_diseased_maggot',
  ],
};

// boss_loatheb — the only creature in this wing with a second spell list
export const BOSS_LOATHEB: ScriptDevIR = {
  name: 'boss_loatheb',
  boundCreatures: [NPC.LOATHEB],
  sourceFile: 'eastern_kingdoms/naxxramas/boss_loatheb.cpp',
  // Trigger payloads ride the KIT: stepSession resolves a periodic trigger off
  // spec.spells, so a payload missing here delivers nothing (moltenCore.ts:88 same rule).
  spellIds: [29865, 29234, 29201, 29204, 30281, 29185, 29194, 29196, 29198, 29184, 29195, 29197, 29199],
  timers: [
    // ---- PHASE 0, list 1601101 (SPELLSET_LOATHEB) ----
    t('poison_aura', 29865, 5000, 5000, 12_000, 12_000, 'self', 'creature_spell_list 1601101:1 Loatheb - Poison Aura, TargetId 0 = None', { phase: 0 }),
    t('summon_spore', 29234, 12_000, 12_000, 12_000, 12_000, 'self', 'creature_spell_list 1601101:2 Loatheb - Summon Spore', { phase: 0 }),
    t('corrupted_mind', 29201, 4000, 4000, 60_000, 60_000, 'self', 'creature_spell_list 1601101:3 Loatheb - Corrupted Mind', { phase: 0 }),
    t('inevitable_doom', 29204, 120_000, 120_000, 30_000, 30_000, 'self', 'creature_spell_list 1601101:4 Loatheb - Inevitable Doom (P1)', { phase: 0 }),
    t('decurse', 30281, 30_000, 30_000, 30_000, 30_000, 'self', 'creature_spell_list 1601101:5 Loatheb - Decurse', { phase: 0 }),
    // ---- PHASE 1, list 1601102 (SPELLSET_LOATHEB_P2): Doom doubles, the rest re-arm at 0 ----
    t('poison_aura_p2', 29865, 0, 0, 12_000, 12_000, 'self', 'creature_spell_list 1601102:1 Loatheb - Poison Aura (P2)', { phase: 1 }),
    t('summon_spore_p2', 29234, 0, 0, 12_000, 12_000, 'self', 'creature_spell_list 1601102:2 Loatheb - Summon Spore (P2)', { phase: 1 }),
    t('corrupted_mind_p2', 29201, 0, 0, 60_000, 60_000, 'self', 'creature_spell_list 1601102:3 Loatheb - Corrupted Mind (P2)', { phase: 1 }),
    t('inevitable_doom_p2', 29204, 0, 0, 15_000, 15_000, 'self', 'creature_spell_list 1601102:4 Loatheb - Inevitable Doom(P2) - 30s -> 15s', { phase: 1 }),
    t('decurse_p2', 30281, 30_000, 30_000, 30_000, 30_000, 'self', 'creature_spell_list 1601102:5 Loatheb - Decurse (P2, unchanged)', { phase: 1 }),
  ],
  timedPhases: [
    {
      id: 'soft_enrage',
      phase: 1,
      afterMs: 300_000,
      actions: [{ kind: 'flavor', text: "'s doom quickens!", cite: 'boss_loatheb.cpp:80 SetSpellList(SPELLSET_LOATHEB_P2)' }],
      cite: 'boss_loatheb.cpp:55,78-82 AddCombatAction(LOATHEB_SOFT_ENRAGE, 5min) -> SetSpellList(1601102)',
    },
  ],
  lifecycle: {
    ...lifecycleFor(TYPE.LOATHEB, 'boss_loatheb.cpp:54'),
    justSummoned: [{
      kind: 'attack_summoner',
      creatureEntry: 16286,
      cite: 'boss_loatheb.cpp:66-72 JustSummoned NPC_SPORE 16286 AttackStart(m_creature)',
    }],
  },
  cites: [
    'boss_loatheb.cpp:30-127 whole file',
    'creature_spell_list_entry 1601101 "Naxxramas - Loatheb", 1601102 "Naxxramas - Loatheb(P2)"',
    'boss_loatheb.cpp:89-117 CorruptedMind 29201 -> 29196/29185/29198/29194 -> 29197/29184/29199/29195 aura 112 script 4327',
    'boss_loatheb.cpp:66-72 JustSummoned NPC_SPORE 16286 AttackStart(Loatheb)',
  ],
};

export const NPC_STONESKIN_GARGOYLE_ENTRY = 16168;

/** TryStoneForm: IDLE_MOTION_TYPE only; missing MovementType is a GAP. Cite: naxxramas.cpp:995 */
export function allowStoneskinGargoyleStoneForm(
  entry: number,
  movementType: number | undefined,
): boolean {
  if ((entry | 0) !== NPC_STONESKIN_GARGOYLE_ENTRY) return true;
  return movementType === 0;
}

export const NPC_STONESKIN_GARGOYLE: ScriptDevIR = {
  name: 'npc_stoneskin_gargoyle',
  boundCreatures: [NPC_STONESKIN_GARGOYLE_ENTRY],
  sourceFile: 'eastern_kingdoms/naxxramas/naxxramas.cpp',
  spellIds: [28995, 29325, 29154, 18950],
  timers: [
    t('acid_volley', 29325, 4000, 4000, 8000, 8000, 'self', 'naxxramas.cpp:986 acidVolleyTimer=4000; :1057-1060 CAST_OK re-arm 8000 (only idle-spawn / low-Z gargoyles)'),
    t('stoneskin', 28995, 0, 0, 0, 0, 'self', 'naxxramas.cpp:1048-1051 Stoneskin at <30% HP', { hpPctMax: 30 }),
  ],
  lifecycle: {
    onReset: [
      { kind: 'cast_self', spellId: 29154, cite: 'naxxramas.cpp:994-1002 TryStoneForm SPELL_STONEFORM 29154 OOC' },
      { kind: 'set_unattackable', cite: 'naxxramas.cpp:994-1002 TryStoneForm SPELL_STONEFORM 29154 OOC' },
    ],
    onAggro: [
      { kind: 'clear_unattackable', cite: 'naxxramas.cpp:1027-1032 Aggro clear UNIT_FLAG_UNINTERACTIBLE' },
    ],
  },
  cites: [
    'naxxramas.cpp:960-1068 npc_stoneskin_gargoyleAI',
    'naxxramas.cpp:994-1002 TryStoneForm SPELL_STONEFORM 29154 OOC — IDLE_MOTION_TYPE only; missing spawn MovementType is a GAP',
    'naxxramas.cpp:1010-1022 MoveInLineOfSight player <17.0f while UNINTERACTIBLE → AttackStart',
  ],
};

// Melee off, no AttackStart: PRESENCE is the only thing it can react to, and standing on one is how
// a raider dies to it. Without the proximity answer it was a harmless prop on the floor.
export const NPC_LIVING_POISON: ScriptDevIR = {
  name: 'npc_living_poison',
  boundCreatures: [16027],
  sourceFile: 'eastern_kingdoms/naxxramas/naxxramas.cpp',
  spellIds: [28433],
  timers: [],
  lifecycle: {
    onReset: [
      { kind: 'set_melee_enabled', enabled: false, cite: 'naxxramas.cpp:1078-1081 Reset SetMeleeEnabled(false)' },
    ],
  },
  proximityTriggers: [{
    withinYd: 4,
    once: true,
    actions: [
      // The C++ self-casts it, and 28433's own pbaoe radius is what hurts the raider standing on it —
      // `cast_self` would hand the whole 28-31 k to the poison and to nobody else.
      { kind: 'damage_in_radius', spellId: 28433, cite: 'naxxramas.cpp:1089 DoCastSpellIfCan(m_creature, SPELL_EXPLODE 28433, CAST_TRIGGERED); spell_template 28433 direct_damage nature 28125-31875 radiusYd 5 pbaoe' },
      { kind: 'force_despawn', cite: 'naxxramas.cpp:1084-1090 the explode kills it - "explode and kill itself while doing heavy AoE damage to the player"' },
    ],
    cite: 'naxxramas.cpp:1084-1089 MoveInLineOfSight GetDistance2d(who, DIST_CALC_BOUNDING_RADIUS) > 4.0f -> return',
  }],
  cites: [
    'naxxramas.cpp:1074-1093 npc_living_poisonAI; naxxramas.h:208 SPELL_EXPLODE 28433',
    'naxxramas.cpp:1084-1089 MoveInLineOfSight player <4 yd -> explode CAST_TRIGGERED via proximityTriggers',
    'naxxramas.cpp:1092 AttackStart is an empty override, so it never picks a victim of its own',
  ],
};

export const AT_NAXXRAMAS: ScriptDevIR = {
  name: 'at_naxxramas',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/naxxramas/naxxramas.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'naxxramas.cpp:1095-1143 AreaTrigger_at_naxxramas — Kel\'Thuzad / Faerlina intro / Thaddius door / frostwyrm tele',
  ],
};

export const EVENT_NAXXRAMAS: ScriptDevIR = {
  name: 'event_naxxramas',
  boundCreatures: [],
  sourceFile: 'eastern_kingdoms/naxxramas/naxxramas.cpp',
  spellIds: [],
  timers: [],
  cites: [
    'naxxramas.cpp:1145-1151 ProcessEventId_naxxramas → instance DoHandleEvent',
  ],
};

export const NAXXRAMAS_ARACHNID_PLAGUE_IRS: readonly ScriptDevIR[] = [
  BOSS_ANUBREKHAN, GO_ANUB_DOOR, BOSS_FAERLINA, BOSS_MAEXXNA, NPC_WEB_WRAP, NPC_INVISIBLE_MAN,
  BOSS_NOTH, BOSS_HEIGAN, NPC_DISEASED_MAGGOT, BOSS_LOATHEB,
];
