// QI4 — kalimdor/azshara residuals, extracted for the 1500-line ratchet. Only 3602 and 9364 are
// registered here, both residual AI with no accept hook. Cite: kalimdor/azshara.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface AzsharaQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

// Cite: azshara.cpp:200 QUEST_AZSHARITE = 3602 Collect Crystallized Azsharite with the Felhound Tracker pet
// (kit).
export const QUEST_AZSHARITE = 3602;
// Cite: azshara.cpp:43 QUEST_FRAGMENTED_MAGIC = 9364 Polymorph Spitelash → backfire summons Polymorph Clone
// kill credit.
export const QUEST_FRAGMENTED_MAGIC = 9364;

/** Cite: azshara.cpp:42 SPELL_POLYMORPH_BACKFIRE = 28406 Comment: summons npc 16479 (Polymorph Clone). */
const SPELL_POLYMORPH_BACKFIRE = 28406;
// Cite: azshara.cpp:118–119 polymorph ranks checked in SpellHit (pSpell->Id == 118 || 12824 || 12825 ||
// 12826)
const SPELL_POLYMORPH = 118;
const SPELL_POLYMORPH_RANK2 = 12824;
const SPELL_POLYMORPH_RANK3 = 12825;
const SPELL_POLYMORPH_RANK4 = 12826;
/** Cite: azshara.cpp:120 m_uiMorphTimer = 5000 after valid polymorph hit. */
const SPITELASH_MORPH_TIMER_MS = 5000;
// Cite: UnitAI.h:67 CAST_TRIGGERED = 0x02 DoCastSpellIfCan(..., SPELL_POLYMORPH_BACKFIRE, CAST_TRIGGERED).
const CAST_TRIGGERED = 0x02;
// Cite: azshara.cpp:55–59 Spitelash creature entries with mobs_spitelashes script. scriptdev2.sql:188 WHERE
// entry IN (6190,6193,6194,6195,6196)
const NPC_SPITELASH_WARRIOR = 6190;
const NPC_SPITELASH_SCREAMER = 6193;
const NPC_SPITELASH_GUARD = 6194;
const NPC_SPITELASH_SIREN = 6195;
const NPC_SPITELASH_MYRMIDON = 6196;
// Cite: azshara.cpp:42 comment "summons npc 16479"; bake killTargets 16479×50 Polymorph Clone quest
// objective for 9364.
const NPC_POLYMORPH_CLONE = 16479;
/** Cite: bake starterCreatureEntries / enderCreatureEntries quest 9364 Archmage Xylem. */
const NPC_ARCHMAGE_XYLEM = 8379;
/** Cite: bake srcItem / itemTargets quest 9364 — Prismatic Shell. */
const ITEM_PRISMATIC_SHELL = 23250;

/** Cite: scriptdev2.sql:189 ScriptName='npc_felhound_tracker' WHERE entry=8668 */
const NPC_FELHOUND_TRACKER = 8668;
/** Cite: bake starterCreatureEntries / enderCreatureEntries quest 3602 Loramus Thalipedes. */
const NPC_LORAMUS_THALIPEDES = 7783;
/** Cite: bake srcItem quest 3602 — Felhound Tracker Kit. */
const ITEM_FELHOUND_TRACKER_KIT = 10834;
/** Cite: bake itemTargets quest 3602 — Crystallized Azsharite ×20. */
const ITEM_CRYSTALLIZED_AZSHARITE = 10714;
/** Cite: azshara.cpp:202–205 GO_AZSHARITE_1..4 crystal gameobject entries. */
const GO_AZSHARITE_1 = 152620;
const GO_AZSHARITE_2 = 152621;
const GO_AZSHARITE_3 = 152622;
const GO_AZSHARITE_4 = 152631;
/** Cite: azshara.cpp:207 SOUND_GROWL = 1249 PlayDirectSound when no usable crystal in range. */
const SOUND_GROWL = 1249;
/** Cite: SharedDefines.h:647 TEXTEMOTE_ROAR = 75 ReceiveEmote gate for DoFindNewCrystal. */
const TEXTEMOTE_ROAR = 75;
// Cite: SharedDefines.h:556 GO_FLAG_INTERACT_COND = 0x00000004 Crystals with this flag are the "new"
// interactable targets.
const GO_FLAG_INTERACT_COND = 0x00000004;
/** Cite: azshara.cpp:255 GetGameObjectListWithEntryInGrid(..., 40.0f) */
const AZSHARITE_SEARCH_RADIUS = 40;
/** Cite: azshara.cpp:285 GetContactPoint(..., 3.0f) */
const AZSHARITE_CONTACT_DIST = 3;
/** Cite: azshara.cpp:232 m_uiWaitTimer = 20000 after MovementInform. */
const FELHOUND_WAIT_TIMER_MS = 20000;

// ── frame residuals ──────────────────────────────────────────────────────────

// mobs_spitelashes SpellHit and morph timer — quest 9364: a player polymorph on an incomplete
// quest arms a 5 s timer, then the backfire cast and despawn. Cite: azshara.cpp:111–121, :157–169.
function runSpitelashPolymorphBackfire(): DbScriptIntent[] {
  const citeSpell =
    `azshara.cpp:111–121 mobs_spitelashes SpellHit polymorph ranks ` +
    `${SPELL_POLYMORPH}/${SPELL_POLYMORPH_RANK2}/${SPELL_POLYMORPH_RANK3}/` +
    `${SPELL_POLYMORPH_RANK4} incomplete ${QUEST_FRAGMENTED_MAGIC}`;
  const citeTimer =
    `azshara.cpp:120 m_uiMorphTimer=${SPITELASH_MORPH_TIMER_MS} then backfire - FO6 timer`;
  const citeCast =
    `azshara.cpp:161 DoCastSpellIfCan(SPELL_POLYMORPH_BACKFIRE=${SPELL_POLYMORPH_BACKFIRE}, ` +
    `CAST_TRIGGERED=${CAST_TRIGGERED}) summons NPC_POLYMORPH_CLONE=${NPC_POLYMORPH_CLONE}`;
  const citeDespawn =
    'azshara.cpp:164 m_creature->ForcedDespawn() after successful backfire cast';
  const citeMobs =
    `azshara.cpp:55–59 / scriptdev2.sql:188 Spitelash entries ` +
    `${NPC_SPITELASH_WARRIOR}/${NPC_SPITELASH_SCREAMER}/${NPC_SPITELASH_GUARD}/` +
    `${NPC_SPITELASH_SIREN}/${NPC_SPITELASH_MYRMIDON}`;
  const citeCredit =
    `bake killTargets NPC_POLYMORPH_CLONE=${NPC_POLYMORPH_CLONE}×50 from spell summon - host recordKill`;
  const citeItem =
    `bake itemTargets/srcItem ITEM_PRISMATIC_SHELL=${ITEM_PRISMATIC_SHELL} turn-in Xylem (${NPC_ARCHMAGE_XYLEM})`;
  return [
    {
      kind: 'skip',
      reason:
        `SpellHit polymorph (${SPELL_POLYMORPH}/${SPELL_POLYMORPH_RANK2}/` +
        `${SPELL_POLYMORPH_RANK3}/${SPELL_POLYMORPH_RANK4}) on Spitelash ` +
        `(${NPC_SPITELASH_WARRIOR}/${NPC_SPITELASH_SCREAMER}/${NPC_SPITELASH_GUARD}/` +
        `${NPC_SPITELASH_SIREN}/${NPC_SPITELASH_MYRMIDON}) incomplete 9364`,
      cite: citeSpell,
    },
    {
      kind: 'skip',
      reason:
        `m_uiMorphTimer=${SPITELASH_MORPH_TIMER_MS}ms then backfire - FO6 timer`,
      cite: citeTimer,
    },
    {
      kind: 'cast_spell',
      spellId: SPELL_POLYMORPH_BACKFIRE,
      castFlags: CAST_TRIGGERED,
      sourceIsGo: false,
      targetCleared: false,
      cite: citeCast,
    },
    {
      kind: 'despawn_self',
      despawnDelay: 0,
      cite: citeDespawn,
    },
    {
      kind: 'skip',
      reason:
        `Spitelash script entries ${NPC_SPITELASH_WARRIOR}/${NPC_SPITELASH_SCREAMER}/` +
        `${NPC_SPITELASH_GUARD}/${NPC_SPITELASH_SIREN}/${NPC_SPITELASH_MYRMIDON}`,
      cite: citeMobs,
    },
    {
      kind: 'skip',
      reason:
        `Polymorph Clone (${NPC_POLYMORPH_CLONE})×50 kill objective - host recordKill after summon`,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `Prismatic Shell (${ITEM_PRISMATIC_SHELL}) retained for turn-in to Xylem (${NPC_ARCHMAGE_XYLEM})`,
      cite: citeItem,
    },
  ];
}

// npc_felhound_tracker ROAR emote — quest 3602 Azsharite: search GO_AZSHARITE_1..4 within 40 yd,
// preferring an interactable one, else growl or move to it. Cite: azshara.cpp:235–289.
function runFelhoundTrackerRoar(): DbScriptIntent[] {
  const citeEmote =
    `azshara.cpp:235–247 npc_felhound_tracker (${NPC_FELHOUND_TRACKER}) ` +
    `ReceiveEmote TEXTEMOTE_ROAR=${TEXTEMOTE_ROAR} incomplete ${QUEST_AZSHARITE}`;
  const citeSearch =
    `azshara.cpp:250–259 DoFindNewCrystal GO_AZSHARITE ` +
    `${GO_AZSHARITE_1}/${GO_AZSHARITE_2}/${GO_AZSHARITE_3}/${GO_AZSHARITE_4} ` +
    `radius ${AZSHARITE_SEARCH_RADIUS}`;
  const citeFlag =
    `azshara.cpp:272–277 prefer GO_FLAG_INTERACT_COND=${GO_FLAG_INTERACT_COND} crystals`;
  const citeGrowl =
    `azshara.cpp:263–264,281–282 PlayDirectSound(SOUND_GROWL=${SOUND_GROWL}) when none`;
  const citeMove =
    `azshara.cpp:284–288 MovePoint contact+${AZSHARITE_CONTACT_DIST} run; ` +
    `wait ${FELHOUND_WAIT_TIMER_MS}ms after MovementInform - FO6 pet path`;
  const citeKit =
    `bake srcItem ITEM_FELHOUND_TRACKER_KIT=${ITEM_FELHOUND_TRACKER_KIT} summons pet ${NPC_FELHOUND_TRACKER}`;
  const citeLoot =
    `bake itemTargets ITEM_CRYSTALLIZED_AZSHARITE=${ITEM_CRYSTALLIZED_AZSHARITE}×20 from GO loot - host item grant`;
  const citeTurnIn =
    `turn-in Loramus Thalipedes (${NPC_LORAMUS_THALIPEDES}) after 20 crystals`;
  return [
    {
      kind: 'skip',
      reason:
        `ReceiveEmote TEXTEMOTE_ROAR (${TEXTEMOTE_ROAR}) on felhound (${NPC_FELHOUND_TRACKER}) incomplete 3602`,
      cite: citeEmote,
    },
    {
      kind: 'skip',
      reason:
        `DoFindNewCrystal GO ${GO_AZSHARITE_1}/${GO_AZSHARITE_2}/${GO_AZSHARITE_3}/${GO_AZSHARITE_4} ` +
        `radius ${AZSHARITE_SEARCH_RADIUS} - FO6 zone search`,
      cite: citeSearch,
    },
    {
      kind: 'skip',
      reason:
        `prefer GO_FLAG_INTERACT_COND (0x${GO_FLAG_INTERACT_COND.toString(16)}) crystals - FO6 GO flags`,
      cite: citeFlag,
    },
    {
      kind: 'play_sound',
      soundId: SOUND_GROWL,
      flags: 0,
      playParameter: 0,
      isMusic: false,
      mode: 'direct',
      cite: citeGrowl,
    },
    {
      kind: 'skip',
      reason:
        `MovePoint contact+${AZSHARITE_CONTACT_DIST} + wait ${FELHOUND_WAIT_TIMER_MS}ms - FO6 pet path`,
      cite: citeMove,
    },
    {
      kind: 'skip',
      reason:
        `Felhound Tracker Kit (${ITEM_FELHOUND_TRACKER_KIT}) → pet ${NPC_FELHOUND_TRACKER}`,
      cite: citeKit,
    },
    {
      kind: 'skip',
      reason:
        `Crystallized Azsharite (${ITEM_CRYSTALLIZED_AZSHARITE})×20 GO loot - host item grant`,
      cite: citeLoot,
    },
    {
      kind: 'skip',
      reason: `turn-in NPC_LORAMUS_THALIPEDES (${NPC_LORAMUS_THALIPEDES}) after crystals`,
      cite: citeTurnIn,
    },
  ];
}

/** Family pack: kalimdor/azshara.cpp Residual frame/complete AI only — no accept/reward NPC hooks. */
export function runAzshara(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'frame' && phase !== 'complete') return [];
  if (questId === QUEST_FRAGMENTED_MAGIC) return runSpitelashPolymorphBackfire();
  if (questId === QUEST_AZSHARITE) return runFelhoundTrackerRoar();
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'kalimdor/azshara'` in registry.ts.
export const AZSHARA_REGISTRY: Record<string | number, AzsharaQuestScriptEntry> = {
  'kalimdor/azshara': {
    family: 'kalimdor/azshara',
    questIds: [QUEST_AZSHARITE, QUEST_FRAGMENTED_MAGIC],
    hooks: ['frame', 'complete'],
    cite: 'kalimdor/azshara.cpp:111–169,235–289',
    run: runAzshara,
  },
  [QUEST_AZSHARITE]: {
    family: 'kalimdor/azshara',
    questId: QUEST_AZSHARITE,
    questIds: [QUEST_AZSHARITE],
    hooks: ['frame', 'complete'],
    cite: 'azshara.cpp:235–289 npc_felhound_tracker ReceiveEmote/DoFindNewCrystal',
    run: runAzshara,
  },
  [QUEST_FRAGMENTED_MAGIC]: {
    family: 'kalimdor/azshara',
    questId: QUEST_FRAGMENTED_MAGIC,
    questIds: [QUEST_FRAGMENTED_MAGIC],
    hooks: ['frame', 'complete'],
    cite: 'azshara.cpp:111–169 mobs_spitelashes SpellHit + morph backfire',
    run: runAzshara,
  },
};
