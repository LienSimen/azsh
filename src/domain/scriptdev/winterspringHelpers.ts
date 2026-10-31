// Winterspring ScriptDev pure helpers: deterministic ports of the control-flow branches the IR
// host does not tick as combat timers — escort WP, GO use, gossip/transform and despawn gates.

import {
  ARTORIUS_DESPAWN_MS,
  ARTORIUS_DOOM_INIT_MS,
  ARTORIUS_DOOM_RANGE_YD,
  ARTORIUS_FRENZY_INIT_MAX_MS,
  ARTORIUS_FRENZY_INIT_MIN_MS,
  ARTORIUS_HOME,
  ARTORIUS_RESPAWN_ON_DEATH_MS,
  ARTORIUS_RESPAWN_ON_DESPAWN_MS,
  ARTORIUS_TRANSFORM_EMOTE_MS,
  ARTORIUS_TRANSFORM_MS,
  CLASS_HUNTER,
  CLEANER_DESPAWN_MS,
  EMOTE_CHANT_SPELL,
  EMOTE_ONESHOT_ROAR,
  EMOTE_POISON,
  FACTION_ESCORT_A_NEUTRAL_PASSIVE,
  GO_ELUNE_ALTAR,
  GO_ELUNE_FIRE,
  NPC_ARTORIUS_THE_AMIABLE,
  NPC_ARTORIUS_THE_DOOMBRINGER,
  NPC_GUARDIAN_ELUNE,
  NPC_PRIESTESS_ELUNE,
  NPC_RANSHALLA,
  NPC_THE_CLEANER,
  NPC_VOICE_ELUNE,
  QUEST_GUARDIANS_ALTAR,
  QUEST_STAVE_OF_THE_ANCIENTS,
  RANSHALLA_COMPLETE_DESPAWN_MS,
  RANSHALLA_CONTINUE_DELAY_MS,
  RANSHALLA_GO_SEARCH_YD,
  RANSHALLA_TORCH_WAYPOINTS,
  SAY_AFTER_TORCH_1,
  SAY_AFTER_TORCH_2,
  SAY_ENTER_OWL_THICKET,
  SAY_QUEST_END_1,
  SAY_QUEST_END_2,
  SAY_QUEST_START,
  SAY_RANSHALLA_ALTAR_1,
  SAY_RANSHALLA_ALTAR_2,
  SAY_REACH_ALTAR_1,
  SAY_REACH_TORCH_1,
  SAY_REACH_TORCH_2,
  SAY_REACH_TORCH_3,
  SPELL_BIND_WILDKIN,
  SPELL_LIGHT_TORCH,
  SPELL_RANSHALLA_DESPAWN,
  SPELL_SERPENT_STING_R8,
  SPELL_SERPENT_STING_R9,
  SPELL_STINGING_TRAUMA,
  TEMPFACTION_RESTORE_RESPAWN,
  UNIT_STAND_STATE_KNEEL,
  VOICE_ELUNE_DESPAWN_MS,
} from './winterspring.ts';

// Pure helpers — npc_ranshalla

export interface RanshallaQuestAcceptResult {
  handled: boolean;
  textId: number | null;
  factionId: number;
  factionFlags: number;
  startEscort: boolean;
  cite: string;
}

/** Port of QuestAccept_npc_ranshalla. Cite: winterspring.cpp:455–469 */
export function ranshallaQuestAccept(questId: number): RanshallaQuestAcceptResult {
  if ((questId | 0) !== QUEST_GUARDIANS_ALTAR) {
    return {
      handled: false,
      textId: null,
      factionId: 0,
      factionFlags: 0,
      startEscort: false,
      cite: 'winterspring.cpp:457 quest != 4901 → return false',
    };
  }
  return {
    handled: true,
    textId: SAY_QUEST_START,
    factionId: FACTION_ESCORT_A_NEUTRAL_PASSIVE,
    factionFlags: TEMPFACTION_RESTORE_RESPAWN,
    startEscort: true,
    cite:
      'winterspring.cpp:459-463 SAY_QUEST_START + faction 10 RESTORE_RESPAWN + escort Start',
  };
}

export interface RanshallaWaypointResult {
  handled: boolean;
  textId: number | null;
  channelTorch: boolean;
  startAltarDialogue: boolean;
  pauseEscort: boolean;
  summonPriestesses: boolean;
  storeWaypoint: boolean;
  respawnLights: boolean;
  faceAltar: boolean;
  cite: string;
}

/** Port of WaypointReached branches. Cite: winterspring.cpp:253–304 */
export function ranshallaWaypointReached(pointId: number): RanshallaWaypointResult {
  const p = pointId | 0;
  if (p === 3) {
    return {
      handled: true,
      textId: SAY_ENTER_OWL_THICKET,
      channelTorch: false,
      startAltarDialogue: false,
      pauseEscort: false,
      summonPriestesses: false,
      storeWaypoint: false,
      respawnLights: false,
      faceAltar: false,
      cite: 'winterspring.cpp:257-259 case 3 SAY_ENTER_OWL_THICKET',
    };
  }
  if ((RANSHALLA_TORCH_WAYPOINTS as readonly number[]).includes(p)) {
    return {
      handled: true,
      textId: null,
      channelTorch: true,
      startAltarDialogue: false,
      pauseEscort: true,
      summonPriestesses: false,
      storeWaypoint: true,
      respawnLights: false,
      faceAltar: false,
      cite: `winterspring.cpp:260-267 case ${p} DoChannelTorchSpell + pause`,
    };
  }
  if (p === 39) {
    return {
      handled: true,
      textId: SAY_REACH_ALTAR_1,
      channelTorch: false,
      startAltarDialogue: true,
      pauseEscort: true,
      summonPriestesses: false,
      storeWaypoint: true,
      respawnLights: false,
      faceAltar: false,
      cite: 'winterspring.cpp:268-272 case 39 StartNextDialogueText SAY_REACH_ALTAR_1 + pause',
    };
  }
  if (p === 41) {
    return {
      handled: true,
      textId: null,
      channelTorch: false,
      startAltarDialogue: false,
      pauseEscort: false,
      summonPriestesses: false,
      storeWaypoint: false,
      respawnLights: true,
      faceAltar: true,
      cite: 'winterspring.cpp:273-289 case 41 respawn Elune lights + face altar',
    };
  }
  if (p === 42) {
    return {
      handled: true,
      textId: SAY_RANSHALLA_ALTAR_2,
      channelTorch: false,
      startAltarDialogue: false,
      pauseEscort: true,
      summonPriestesses: true,
      storeWaypoint: false,
      respawnLights: false,
      faceAltar: false,
      cite: 'winterspring.cpp:291-296 case 42 pause + DoSummonPriestess + SAY_RANSHALLA_ALTAR_2',
    };
  }
  if (p === 44) {
    return {
      handled: true,
      textId: null,
      channelTorch: false,
      startAltarDialogue: false,
      pauseEscort: true,
      summonPriestesses: false,
      storeWaypoint: false,
      respawnLights: false,
      faceAltar: true,
      cite: 'winterspring.cpp:297-302 case 44 pause + face altar',
    };
  }
  return {
    handled: false,
    textId: null,
    channelTorch: false,
    startAltarDialogue: false,
    pauseEscort: false,
    summonPriestesses: false,
    storeWaypoint: false,
    respawnLights: false,
    faceAltar: false,
    cite: 'winterspring.cpp:253 unknown WP → no-op',
  };
}

export interface RanshallaChannelTorchResult {
  torchTextIds: readonly number[];
  emoteTextId: number;
  castLightTorch: boolean;
  spellId: number;
  removeNoInteractFire: boolean;
  removeNoInteractAltar: boolean;
  pauseEscort: boolean;
  cite: string;
}

// Port of DoChannelTorchSpell; `isAltarWaypoint` distinguishes the altar from a fire torch.
// Cite: winterspring.cpp:197–226.
export function ranshallaChannelTorch(
  isAltarWaypoint: boolean,
): RanshallaChannelTorchResult {
  return {
    torchTextIds: [SAY_REACH_TORCH_1, SAY_REACH_TORCH_2, SAY_REACH_TORCH_3],
    emoteTextId: EMOTE_CHANT_SPELL,
    castLightTorch: true,
    spellId: SPELL_LIGHT_TORCH,
    removeNoInteractFire: !isAltarWaypoint,
    removeNoInteractAltar: isAltarWaypoint,
    pauseEscort: true,
    cite: isAltarWaypoint
      ? 'winterspring.cpp:200-225 altar: clear NO_INTERACT + face + torch SAY urand + EMOTE + LIGHT_TORCH + pause'
      : 'winterspring.cpp:209-225 fire: clear NO_INTERACT + torch SAY urand + EMOTE + LIGHT_TORCH + pause',
  };
}

export interface RanshallaContinueEscortResult {
  textIdAltar: number;
  textIdsTorch: readonly number[];
  delayMs: number;
  cite: string;
}

/** Port of DoContinueEscort (player used fire/altar). Cite: winterspring.cpp:170–184 */
export function ranshallaContinueEscort(
  isAltarWaypoint: boolean,
): RanshallaContinueEscortResult {
  return {
    textIdAltar: SAY_RANSHALLA_ALTAR_1,
    textIdsTorch: [SAY_AFTER_TORCH_1, SAY_AFTER_TORCH_2],
    delayMs: RANSHALLA_CONTINUE_DELAY_MS,
    cite: isAltarWaypoint
      ? 'winterspring.cpp:172-183 altar → SAY_RANSHALLA_ALTAR_1 + delay 2000'
      : 'winterspring.cpp:175-183 torch → urand AFTER_TORCH_1/2 + delay 2000',
  };
}

export interface RanshallaContinueDelayTickResult {
  interruptSpells: boolean;
  unpauseEscort: boolean;
  setNextWaypoint: boolean;
  nextWaypoint: number;
  remainingMs: number;
  cite: string;
}

// Port of the UpdateEscortAI delay-timer branch after DoContinueEscort.
// Cite: winterspring.cpp:428–441.
export function ranshallaContinueDelayTick(
  delayMs: number,
  currentWaypoint: number,
  diffMs: number,
): RanshallaContinueDelayTickResult {
  if (!delayMs) {
    return {
      interruptSpells: false,
      unpauseEscort: false,
      setNextWaypoint: false,
      nextWaypoint: currentWaypoint,
      remainingMs: 0,
      cite: 'winterspring.cpp:428 !m_uiDelayTimer → skip',
    };
  }
  if (delayMs <= diffMs) {
    return {
      interruptSpells: true,
      unpauseEscort: true,
      setNextWaypoint: true,
      nextWaypoint: (currentWaypoint | 0) + 1,
      remainingMs: 0,
      cite:
        'winterspring.cpp:430-437 InterruptNonMeleeSpells + unpause + SetNextWaypoint(current+1)',
    };
  }
  return {
    interruptSpells: false,
    unpauseEscort: false,
    setNextWaypoint: false,
    nextWaypoint: currentWaypoint,
    remainingMs: delayMs - diffMs,
    cite: 'winterspring.cpp:440 m_uiDelayTimer -= uiDiff',
  };
}

export interface RanshallaSpellHitDespawnResult {
  failQuest: boolean;
  forceDespawn: boolean;
  cite: string;
}

/** Port of SpellHit for SPELL_RANSHALLA_DESPAWN. Cite: winterspring.cpp:186–194 */
export function ranshallaSpellHitDespawn(spellId: number): RanshallaSpellHitDespawnResult {
  if ((spellId | 0) === SPELL_RANSHALLA_DESPAWN) {
    return {
      failQuest: true,
      forceDespawn: true,
      cite: 'winterspring.cpp:189-192 18954 → FailQuestForPlayerAndGroup + ForcedDespawn',
    };
  }
  return {
    failQuest: false,
    forceDespawn: false,
    cite: 'winterspring.cpp:189 spell != 18954 → no-op',
  };
}

export interface RanshallaQuestEndResult {
  facePlayer: boolean;
  textIdEnd1: number;
  textIdEnd2: number;
  faceAltar: boolean;
  standStateKneel: number;
  exploreQuestId: number;
  forceDespawnMs: number;
  cite: string;
}

// Port of DATA_EVENT_END + SAY_QUEST_END_2 dialogue steps (quest complete). Cite: winterspring.cpp:390–406
export function ranshallaQuestEnd(): RanshallaQuestEndResult {
  return {
    facePlayer: true,
    textIdEnd1: SAY_QUEST_END_1,
    textIdEnd2: SAY_QUEST_END_2,
    faceAltar: true,
    standStateKneel: UNIT_STAND_STATE_KNEEL,
    exploreQuestId: QUEST_GUARDIANS_ALTAR,
    forceDespawnMs: RANSHALLA_COMPLETE_DESPAWN_MS,
    cite:
      'winterspring.cpp:390-406 face player SAY_END_1; face altar kneel explore 4901 ForcedDespawn 1min',
  };
}

export interface RanshallaSummonPriestessResult {
  summons: Array<{ entry: number; movePointId: number }>;
  cite: string;
}

/** Port of DoSummonPriestess (two Elune priestesses). Cite: winterspring.cpp:228–242 */
export function ranshallaSummonPriestess(): RanshallaSummonPriestessResult {
  return {
    summons: [
      { entry: NPC_PRIESTESS_ELUNE, movePointId: 0 },
      { entry: NPC_PRIESTESS_ELUNE, movePointId: 1 },
    ],
    cite: 'winterspring.cpp:231-241 SummonCreature priestess×2 MovePoint 0/1',
  };
}

export interface RanshallaAltarSummonVoiceGuardResult {
  summonGuardian: number;
  summonVoice: number;
  voiceDespawnMs: number;
  bindWildkinSpellId: number;
  cite: string;
}

// Port of JustDidDialogueStep SAY_PRIESTESS_ALTAR_13 + SAY_VOICE_ALTAR_15 bind. Cite:
// winterspring.cpp:341–365
export function ranshallaAltarSummonVoiceGuard(): RanshallaAltarSummonVoiceGuardResult {
  return {
    summonGuardian: NPC_GUARDIAN_ELUNE,
    summonVoice: NPC_VOICE_ELUNE,
    voiceDespawnMs: VOICE_ELUNE_DESPAWN_MS,
    bindWildkinSpellId: SPELL_BIND_WILDKIN,
    cite:
      'winterspring.cpp:343-364 summon Guardian+Voice(30s); guard casts BIND_WILDKIN 18994',
  };
}

// Pure helpers — go_elune_fire

export interface EluneFireUsedResult {
  handled: boolean;
  isAltar: boolean;
  searchRanshallaYd: number;
  ranshallaEntry: number;
  continueEscort: boolean;
  cite: string;
}

// Port of GOUse_go_elune_fire.
// Cite: winterspring.cpp:471–486.
export function eluneFireUsed(
  goEntry: number,
  ranshallaInRange: boolean,
): EluneFireUsedResult {
  const isAltar = (goEntry | 0) === GO_ELUNE_ALTAR;
  if ((goEntry | 0) !== GO_ELUNE_ALTAR && (goEntry | 0) !== GO_ELUNE_FIRE) {
    return {
      handled: false,
      isAltar: false,
      searchRanshallaYd: RANSHALLA_GO_SEARCH_YD,
      ranshallaEntry: NPC_RANSHALLA,
      continueEscort: false,
      cite: 'winterspring.cpp:471 go entry not altar/fire → not this handler',
    };
  }
  if (!ranshallaInRange) {
    return {
      handled: true,
      isAltar,
      searchRanshallaYd: RANSHALLA_GO_SEARCH_YD,
      ranshallaEntry: NPC_RANSHALLA,
      continueEscort: false,
      cite: 'winterspring.cpp:479 GetClosest Ranshalla fails → no ContinueEscort',
    };
  }
  return {
    handled: true,
    isAltar,
    searchRanshallaYd: RANSHALLA_GO_SEARCH_YD,
    ranshallaEntry: NPC_RANSHALLA,
    continueEscort: true,
    cite: isAltar
      ? 'winterspring.cpp:476-482 altar → DoContinueEscort(true)'
      : 'winterspring.cpp:479-482 fire → DoContinueEscort(false)',
  };
}

// Pure helpers — npc_artorius (Amiable + Doombringer)

export interface ArtoriusGossipHelloResult {
  showChallenge: boolean;
  cite: string;
}

/** Port of GossipHello_npc_artorius challenge branch. Cite: winterspring.cpp:702–708 */
export function artoriusGossipHello(
  questIncomplete7636: boolean,
): ArtoriusGossipHelloResult {
  if (questIncomplete7636) {
    return {
      showChallenge: true,
      cite:
        'winterspring.cpp:704-705 QUEST_STAVE incomplete → ADD_GOSSIP_ITEM real face',
    };
  }
  return {
    showChallenge: false,
    cite: 'winterspring.cpp:707 default gossip only',
  };
}

export interface ArtoriusBeginEventResult {
  playerGuidBound: boolean;
  moveIdle: boolean;
  clearGossipFlag: boolean;
  transformArmed: boolean;
  transformTimerMs: number;
  transformEmoteTimerMs: number;
  cite: string;
}

/** Port of GossipSelect → BeginEvent. Cite: winterspring.cpp:572–579,711–715 */
export function artoriusBeginEvent(): ArtoriusBeginEventResult {
  return {
    playerGuidBound: true,
    moveIdle: true,
    clearGossipFlag: true,
    transformArmed: true,
    transformTimerMs: ARTORIUS_TRANSFORM_MS,
    transformEmoteTimerMs: ARTORIUS_TRANSFORM_EMOTE_MS,
    cite:
      'winterspring.cpp:574-578 bind player + MoveIdle + clear gossip + m_bTransform',
  };
}

export interface ArtoriusTransformTickResult {
  emoteRoar: boolean;
  emoteId: number;
  doTransform: boolean;
  remainingEmoteMs: number;
  remainingTransformMs: number;
  transformArmed: boolean;
  cite: string;
}

/** Port of UpdateAI transform branch while m_bTransform. Cite: winterspring.cpp:639–659 */
export function artoriusTransformTick(
  transformArmed: boolean,
  emoteMs: number,
  transformMs: number,
  diffMs: number,
): ArtoriusTransformTickResult {
  if (!transformArmed) {
    return {
      emoteRoar: false,
      emoteId: EMOTE_ONESHOT_ROAR,
      doTransform: false,
      remainingEmoteMs: emoteMs,
      remainingTransformMs: transformMs,
      transformArmed: false,
      cite: 'winterspring.cpp:639 !m_bTransform → skip transform branch',
    };
  }

  let nextEmote = emoteMs;
  let emoteRoar = false;
  if (emoteMs) {
    if (emoteMs <= diffMs) {
      emoteRoar = true;
      nextEmote = 0;
    } else {
      nextEmote = emoteMs - diffMs;
    }
  }

  // cpp: if (m_uiTransform_Timer < uiDiff) Transform; else subtract
  if (transformMs < diffMs) {
    return {
      emoteRoar,
      emoteId: EMOTE_ONESHOT_ROAR,
      doTransform: true,
      remainingEmoteMs: nextEmote,
      remainingTransformMs: 0,
      transformArmed: false,
      cite: 'winterspring.cpp:652-655 m_bTransform=false + Transform()',
    };
  }
  return {
    emoteRoar,
    emoteId: EMOTE_ONESHOT_ROAR,
    doTransform: false,
    remainingEmoteMs: nextEmote,
    remainingTransformMs: transformMs - diffMs,
    transformArmed: true,
    cite: emoteRoar
      ? 'winterspring.cpp:643-646 EMOTE_ONESHOT_ROAR; transform still ticking'
      : 'winterspring.cpp:641-658 transform timers subtract',
  };
}

export interface ArtoriusTransformResult {
  updateEntry: number;
  cite: string;
}

/** Port of Transform() — in-place UpdateEntry (not Simone summon). Cite: winterspring.cpp:566–570 */
export function artoriusTransform(): ArtoriusTransformResult {
  return {
    updateEntry: NPC_ARTORIUS_THE_DOOMBRINGER,
    cite: 'winterspring.cpp:568 UpdateEntry(NPC_ARTORIUS_THE_DOOMBRINGER) + Reset()',
  };
}

export interface ArtoriusAmiableResetResult {
  respawnMs: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  homeO: number;
  gossipOn: boolean;
  transformTimerMs: number;
  transformEmoteTimerMs: number;
  transformArmed: boolean;
  cite: string;
}

/** Port of Reset for Amiable entry. Cite: winterspring.cpp:537–553 */
export function artoriusAmiableReset(): ArtoriusAmiableResetResult {
  return {
    respawnMs: 35 * 60_000,
    homeX: ARTORIUS_HOME.x,
    homeY: ARTORIUS_HOME.y,
    homeZ: ARTORIUS_HOME.z,
    homeO: ARTORIUS_HOME.o,
    gossipOn: true,
    transformTimerMs: ARTORIUS_TRANSFORM_MS,
    transformEmoteTimerMs: ARTORIUS_TRANSFORM_EMOTE_MS,
    transformArmed: false,
    cite:
      'winterspring.cpp:538-552 respawn 35min + home teleport + gossip + transform arms off',
  };
}

export interface ArtoriusDoombringerResetResult {
  despawnMs: number;
  clearHunter: boolean;
  doomTimerMs: number;
  frenzyMinMs: number;
  frenzyMaxMs: number;
  cite: string;
}

// Port of Reset for the Doombringer entry, which arms the despawn only when it is not already set.
// Cite: winterspring.cpp:554–561.
export function artoriusDoombringerReset(
  despawnAlreadyArmed: boolean,
): ArtoriusDoombringerResetResult {
  return {
    despawnMs: despawnAlreadyArmed ? 0 : ARTORIUS_DESPAWN_MS,
    clearHunter: true,
    doomTimerMs: ARTORIUS_DOOM_INIT_MS,
    frenzyMinMs: ARTORIUS_FRENZY_INIT_MIN_MS,
    frenzyMaxMs: ARTORIUS_FRENZY_INIT_MAX_MS,
    cite: despawnAlreadyArmed
      ? 'winterspring.cpp:555-560 despawn already set; clear hunter; Doom 7500; Frenzy urand(5-8)s'
      : 'winterspring.cpp:555-560 arm despawn 20min; clear hunter; Doom 7500; Frenzy urand(5-8)s',
  };
}

export interface ArtoriusAggroResult {
  bindHunter: boolean;
  demonDespawn: boolean;
  cite: string;
}

// Port of Aggro for the Doombringer, which binds the first hunter it sees.
// Cite: winterspring.cpp:582–590.
export function artoriusAggro(
  whoClass: number,
  hunterGuidEmpty: boolean,
  whoIsBoundHunter: boolean,
): ArtoriusAggroResult {
  if ((whoClass | 0) === CLASS_HUNTER && (hunterGuidEmpty || whoIsBoundHunter)) {
    return {
      bindHunter: true,
      demonDespawn: false,
      cite: 'winterspring.cpp:584-587 hunter ok → bind m_hunterGuid',
    };
  }
  return {
    bindHunter: false,
    demonDespawn: true,
    cite: 'winterspring.cpp:588-589 non-hunter (or wrong hunter) → DemonDespawn()',
  };
}

export interface ArtoriusThreatCheckResult {
  demonDespawn: boolean;
  cite: string;
}

/** Port of multi-threat DemonDespawn gate (inline each UpdateAI). Cite: winterspring.cpp:676–677 */
export function artoriusThreatCheck(threatListSize: number): ArtoriusThreatCheckResult {
  if ((threatListSize | 0) > 1) {
    return {
      demonDespawn: true,
      cite: 'winterspring.cpp:676-677 threat size >1 → DemonDespawn()',
    };
  }
  return {
    demonDespawn: false,
    cite: 'winterspring.cpp:676 threat size ≤1 → continue casts',
  };
}

export interface ArtoriusSpellHitResult {
  castStingingTrauma: boolean;
  traumaSpellId: number;
  emoteTextId: number | null;
  cite: string;
}

/** Port of SpellHit Serpent Sting → Stinging Trauma. Cite: winterspring.cpp:627–634 */
export function artoriusSpellHit(spellId: number): ArtoriusSpellHitResult {
  const id = spellId | 0;
  if (id === SPELL_SERPENT_STING_R8 || id === SPELL_SERPENT_STING_R9) {
    return {
      castStingingTrauma: true,
      traumaSpellId: SPELL_STINGING_TRAUMA,
      emoteTextId: EMOTE_POISON,
      cite:
        'winterspring.cpp:629-632 Serpent Sting R8/R9 → CAST_TRIGGERED Stinging Trauma 23299 + EMOTE_POISON',
    };
  }
  return {
    castStingingTrauma: false,
    traumaSpellId: 0,
    emoteTextId: null,
    cite: 'winterspring.cpp:629 spell not 13555/25295 → no-op',
  };
}

export interface ArtoriusDemonDespawnResult {
  respawnDelayMs: number;
  summonCleaner: boolean;
  cleanerEntry: number;
  cleanerDespawnMs: number;
  forceDespawnSelf: boolean;
  cite: string;
}

// Port of DemonDespawn(triggered); triggered summons the Cleaner and attacks the threat list.
// Cite: winterspring.cpp:600–625.
export function artoriusDemonDespawn(triggered = true): ArtoriusDemonDespawnResult {
  return {
    respawnDelayMs: ARTORIUS_RESPAWN_ON_DESPAWN_MS,
    summonCleaner: triggered,
    cleanerEntry: NPC_THE_CLEANER,
    cleanerDespawnMs: CLEANER_DESPAWN_MS,
    forceDespawnSelf: true,
    cite: triggered
      ? 'winterspring.cpp:602-624 15min respawn + Cleaner 14503 20min + ForcedDespawn'
      : 'winterspring.cpp:602-624 15min respawn; no Cleaner; ForcedDespawn',
  };
}

export interface ArtoriusJustDiedResult {
  respawnMs: number;
  cite: string;
}

/** Port of JustDied respawn delay. Cite: winterspring.cpp:592–598 */
export function artoriusJustDied(): ArtoriusJustDiedResult {
  return {
    respawnMs: ARTORIUS_RESPAWN_ON_DEATH_MS,
    cite: 'winterspring.cpp:594-597 SetRespawnDelay/Time 2*HOUR',
  };
}

export interface ArtoriusDespawnOocTickResult {
  demonDespawn: boolean;
  remainingMs: number;
  cite: string;
}

/** Port of OOC 20-minute despawn arm. Cite: winterspring.cpp:662–671 */
export function artoriusDespawnOocTick(
  alive: boolean,
  inCombat: boolean,
  despawnMs: number,
  diffMs: number,
): ArtoriusDespawnOocTickResult {
  if (!despawnMs) {
    return {
      demonDespawn: false,
      remainingMs: 0,
      cite: 'winterspring.cpp:662 !m_uiDespawn_Timer → skip',
    };
  }
  if (despawnMs <= diffMs) {
    if (alive && !inCombat) {
      return {
        demonDespawn: true,
        remainingMs: 0,
        cite: 'winterspring.cpp:665-667 alive OOC → DemonDespawn(false)',
      };
    }
    return {
      demonDespawn: false,
      remainingMs: 0,
      cite: 'winterspring.cpp:665 timer expired but dead/in combat → no DemonDespawn',
    };
  }
  return {
    demonDespawn: false,
    remainingMs: despawnMs - diffMs,
    cite: 'winterspring.cpp:670 m_uiDespawn_Timer -= uiDiff',
  };
}

export interface ArtoriusDoomCastGateResult {
  attemptCast: boolean;
  rangeYd: number;
  cite: string;
}

/** Port of Demonic Doom range gate after timer re-arm. Cite: winterspring.cpp:687–694 */
export function artoriusDoomCastGate(victimDistYd: number): ArtoriusDoomCastGateResult {
  if (victimDistYd <= ARTORIUS_DOOM_RANGE_YD) {
    return {
      attemptCast: true,
      rangeYd: ARTORIUS_DOOM_RANGE_YD,
      cite: 'winterspring.cpp:692-693 victim ≤25yd → DoCastSpellIfCan Demonic Doom',
    };
  }
  return {
    attemptCast: false,
    rangeYd: ARTORIUS_DOOM_RANGE_YD,
    cite: 'winterspring.cpp:692 victim >25yd → skip cast (timer already re-armed 7500)',
  };
}

/** Amiable entry constant re-export for tests. */
export const ARTORIUS_AMIABLE_ENTRY = NPC_ARTORIUS_THE_AMIABLE;
/** Doombringer entry constant re-export for tests. */
export const ARTORIUS_DOOMBRINGER_ENTRY = NPC_ARTORIUS_THE_DOOMBRINGER;

/** Quest id for stave challenge (shared with Un'Goro Simone). */
export const ARTORIUS_QUEST_STAVE = QUEST_STAVE_OF_THE_ANCIENTS;
