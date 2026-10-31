// QI4 — world/npc_professions residual: the blacksmith QuestComplete hook for 5283/5301 and
// 5284/5302 casts reputation spells 17451 / 17452. Cite: npc_professions.cpp:466–475.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface NpcProfessionsQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: npc_professions.cpp:468. classic-db quest_template 5283, Alliance The Art of the
// Armorsmith, with Grumnus on both the questrelation and involvedrelation rows.
export const QUEST_ART_OF_THE_ARMORSMITH_ALLY = 5283;
// Cite: npc_professions.cpp:471; classic-db 5284 — Alliance The Way of the Weaponsmith. Relations:
// (11146,5284) Ironus Coldsteel.
export const QUEST_WAY_OF_THE_WEAPONSMITH_ALLY = 5284;
// Cite: npc_professions.cpp:468; classic-db 5301 — Horde The Art of the Armorsmith. Relations: (11177,5301)
// Okothos Ironrager.
export const QUEST_ART_OF_THE_ARMORSMITH_HORDE = 5301;
// Cite: npc_professions.cpp:471; classic-db 5302 — Horde The Way of the Weaponsmith. Relations:
// (11178,5302) Borgosh Corebender.
export const QUEST_WAY_OF_THE_WEAPONSMITH_HORDE = 5302;

// Cite: npc_professions.cpp:107 S_REP_ARMOR = 17451 QuestComplete armorsmith branch CastSpell on player.
export const S_REP_ARMOR = 17451;
// Cite: npc_professions.cpp:108 S_REP_WEAPON = 17452 QuestComplete weaponsmith branch CastSpell on player.
export const S_REP_WEAPON = 17452;

// Specialization learn spells from quest_template Rew*: 9788 + 9790 armorsmith, 9787 + 9789
// weaponsmith. This is the host turn-in path, not the scriptdev residual cast.
export const S_WEAPON = 9787;
export const S_ARMOR = 9788;
export const S_LEARN_WEAPON = 9789;
export const S_LEARN_ARMOR = 9790;

// Cite: SpellDefines.h:432 TRIGGERED_OLD_TRIGGERED = 0x00000001 QuestComplete uses TRIGGERED_OLD_TRIGGERED
// on CastSpell.
export const TRIGGERED_OLD_TRIGGERED = 0x1;

// Cite: npc_professions.cpp:155–157; classic-db creature_*relation Alliance armorsmith trainer Grumnus
// Steelshaper.
export const NPC_GRUMNUS_STEELSHAPER = 5164;
// Cite: npc_professions.cpp:153 N_TRAINER_WEAPON1; classic-db (11146,5284) Alliance weaponsmith trainer
// Ironus Coldsteel.
export const NPC_IRONUS_COLDSTEEL = 11146;
// Cite: npc_professions.cpp:157 N_TRAINER_ARMOR2; classic-db (11177,5301) Horde armorsmith trainer Okothos
// Ironrager.
export const NPC_OKOTHOS_IRONRAGER = 11177;
// Cite: npc_professions.cpp:154 N_TRAINER_WEAPON2; classic-db (11178,5302) Horde weaponsmith trainer
// Borgosh Corebender.
export const NPC_BORGOSH_COREBENDER = 11178;

/** Cite: classic-db quest_template RequiredSkill = 164 (Blacksmithing). */
export const SKILL_BLACKSMITHING = 164;
/** Cite: classic-db quest_template RequiredSkillValue = 200. */
export const REQUIRED_SKILL_VALUE_BS_SPEC = 200;

/** classic-db ReqItem* for armorsmith quests 5283/5301. */
export const ITEM_ORNATE_MITHRIL_HELM = 7937;
export const ITEM_ORNATE_MITHRIL_BOOTS = 7936;
export const ITEM_ORNATE_MITHRIL_BREASTPLATE = 7935;

/** classic-db ReqItem* for weaponsmith quests 5284/5302. */
export const ITEM_MOONSTEEL_BROADSWORD = 3853;
export const ITEM_MASSIVE_IRON_AXE = 3855;
export const ITEM_HEAVY_MITHRIL_AXE = 7941;
export const ITEM_BIG_BLACK_MACE = 7945;

const ALL_QUEST_IDS = [
  QUEST_ART_OF_THE_ARMORSMITH_ALLY,
  QUEST_WAY_OF_THE_WEAPONSMITH_ALLY,
  QUEST_ART_OF_THE_ARMORSMITH_HORDE,
  QUEST_WAY_OF_THE_WEAPONSMITH_HORDE,
] as const;

function isArmorsmithQuest(questId: number): boolean {
  return (
    questId === QUEST_ART_OF_THE_ARMORSMITH_ALLY ||
    questId === QUEST_ART_OF_THE_ARMORSMITH_HORDE
  );
}

function isWeaponsmithQuest(questId: number): boolean {
  return (
    questId === QUEST_WAY_OF_THE_WEAPONSMITH_ALLY ||
    questId === QUEST_WAY_OF_THE_WEAPONSMITH_HORDE
  );
}

function enderNpcFor(questId: number): number {
  switch (questId) {
    case QUEST_ART_OF_THE_ARMORSMITH_ALLY:
      return NPC_GRUMNUS_STEELSHAPER;
    case QUEST_WAY_OF_THE_WEAPONSMITH_ALLY:
      return NPC_IRONUS_COLDSTEEL;
    case QUEST_ART_OF_THE_ARMORSMITH_HORDE:
      return NPC_OKOTHOS_IRONRAGER;
    case QUEST_WAY_OF_THE_WEAPONSMITH_HORDE:
      return NPC_BORGOSH_COREBENDER;
    default:
      return 0;
  }
}

// QuestComplete_npc_prof_blacksmith residual: 5283/5301 casts 17451 and 5284/5302 casts 17452.
// Accept has no residual, and the host still applies RewSpell on turn-in. Cite: :466–475.
export function runNpcProfessions(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'reward' && phase !== 'complete') return [];
  if (!ALL_QUEST_IDS.includes(questId as (typeof ALL_QUEST_IDS)[number])) {
    return [];
  }

  const ender = enderNpcFor(questId);
  const intents: DbScriptIntent[] = [
    {
      kind: 'skip',
      reason:
        `QuestComplete_npc_prof_blacksmith residual on turn-in NPC ${ender}; ` +
        `classic-db RequiredSkill SKILL_BLACKSMITHING=${SKILL_BLACKSMITHING} ` +
        `value≥${REQUIRED_SKILL_VALUE_BS_SPEC}`,
      cite: 'npc_professions.cpp:466–475 QuestComplete_npc_prof_blacksmith (commented hook)',
    },
  ];

  if (isArmorsmithQuest(questId)) {
    // Cite: classic-db RewSpell=9788 (S_ARMOR) RewSpellCast=9790 (S_LEARN_ARMOR)
    intents.push({
      kind: 'skip',
      reason:
        `host turn-in applies classic-db RewSpell S_ARMOR=${S_ARMOR} + ` +
        `RewSpellCast S_LEARN_ARMOR=${S_LEARN_ARMOR} (not this residual)`,
      cite: `classic-db quest_template ${questId} RewSpell/RewSpellCast armorsmith`,
    });
    intents.push({
      kind: 'cast_spell',
      spellId: S_REP_ARMOR,
      castFlags: TRIGGERED_OLD_TRIGGERED,
      sourceIsGo: false,
      targetCleared: false,
      cite:
        `npc_professions.cpp:468–469 quest ${questId} armorsmith → ` +
        `CastSpell(S_REP_ARMOR=${S_REP_ARMOR}, TRIGGERED_OLD_TRIGGERED=${TRIGGERED_OLD_TRIGGERED})`,
    });
    return intents;
  }

  if (isWeaponsmithQuest(questId)) {
    // Cite: classic-db RewSpell=9787 (S_WEAPON) RewSpellCast=9789 (S_LEARN_WEAPON)
    intents.push({
      kind: 'skip',
      reason:
        `host turn-in applies classic-db RewSpell S_WEAPON=${S_WEAPON} + ` +
        `RewSpellCast S_LEARN_WEAPON=${S_LEARN_WEAPON} (not this residual)`,
      cite: `classic-db quest_template ${questId} RewSpell/RewSpellCast weaponsmith`,
    });
    intents.push({
      kind: 'cast_spell',
      spellId: S_REP_WEAPON,
      castFlags: TRIGGERED_OLD_TRIGGERED,
      sourceIsGo: false,
      targetCleared: false,
      cite:
        `npc_professions.cpp:471–472 quest ${questId} weaponsmith → ` +
        `CastSpell(S_REP_WEAPON=${S_REP_WEAPON}, TRIGGERED_OLD_TRIGGERED=${TRIGGERED_OLD_TRIGGERED})`,
    });
    return intents;
  }

  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'world/npc_professions'` in registry.ts.
export const NPC_PROFESSIONS_REGISTRY: Record<
  string | number,
  NpcProfessionsQuestScriptEntry
> = {
  'world/npc_professions': {
    family: 'world/npc_professions',
    questIds: [...ALL_QUEST_IDS],
    hooks: ['reward', 'complete'],
    cite: 'world/npc_professions.cpp:466–475 QuestComplete_npc_prof_blacksmith',
    run: runNpcProfessions,
  },
  [QUEST_ART_OF_THE_ARMORSMITH_ALLY]: {
    family: 'world/npc_professions',
    questId: QUEST_ART_OF_THE_ARMORSMITH_ALLY,
    questIds: [QUEST_ART_OF_THE_ARMORSMITH_ALLY],
    hooks: ['reward', 'complete'],
    cite: 'npc_professions.cpp:468–469 armorsmith CastSpell S_REP_ARMOR (Alliance 5283)',
    run: runNpcProfessions,
  },
  [QUEST_WAY_OF_THE_WEAPONSMITH_ALLY]: {
    family: 'world/npc_professions',
    questId: QUEST_WAY_OF_THE_WEAPONSMITH_ALLY,
    questIds: [QUEST_WAY_OF_THE_WEAPONSMITH_ALLY],
    hooks: ['reward', 'complete'],
    cite: 'npc_professions.cpp:471–472 weaponsmith CastSpell S_REP_WEAPON (Alliance 5284)',
    run: runNpcProfessions,
  },
  [QUEST_ART_OF_THE_ARMORSMITH_HORDE]: {
    family: 'world/npc_professions',
    questId: QUEST_ART_OF_THE_ARMORSMITH_HORDE,
    questIds: [QUEST_ART_OF_THE_ARMORSMITH_HORDE],
    hooks: ['reward', 'complete'],
    cite: 'npc_professions.cpp:468–469 armorsmith CastSpell S_REP_ARMOR (Horde 5301)',
    run: runNpcProfessions,
  },
  [QUEST_WAY_OF_THE_WEAPONSMITH_HORDE]: {
    family: 'world/npc_professions',
    questId: QUEST_WAY_OF_THE_WEAPONSMITH_HORDE,
    questIds: [QUEST_WAY_OF_THE_WEAPONSMITH_HORDE],
    hooks: ['reward', 'complete'],
    cite: 'npc_professions.cpp:471–472 weaponsmith CastSpell S_REP_WEAPON (Horde 5302)',
    run: runNpcProfessions,
  },
};
