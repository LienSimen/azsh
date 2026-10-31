// Azshara ScriptDev IR ports. Source: scripts/kalimdor/azshara.cpp — mobs_spitelashes,
// npc_felhound_tracker, event_arcanite_buoy, go_lightning, boss_maws. Every value cites file:line.

import type { ScriptDevIR, ScriptDevTimer } from './types.ts';
import { CAST_FLAG } from '../creature/creatureAi.ts';

// Constants — azshara.cpp shared / mobs_spitelashes

// azshara.cpp:41–64
/** Cite: azshara.cpp:42 SPELL_POLYMORPH_BACKFIRE = 28406 */
export const SPELL_POLYMORPH_BACKFIRE = 28406;
/** Cite: azshara.cpp:43 QUEST_FRAGMENTED_MAGIC = 9364 */
export const QUEST_FRAGMENTED_MAGIC = 9364;

/** Cite: azshara.cpp:46 SPELL_DISARM = 6713 */
export const SPELL_DISARM = 6713;
/** Cite: azshara.cpp:47 SPELL_SCREECH = 3589 */
export const SPELL_SCREECH = 3589;
/** Cite: azshara.cpp:48 SPELL_FROST_SHOCK = 12548 */
export const SPELL_FROST_SHOCK = 12548;
/** Cite: azshara.cpp:49 SPELL_RENEW = 11640 */
export const SPELL_RENEW = 11640;
/** Cite: azshara.cpp:50 SPELL_SHOOT = 6660 */
export const SPELL_SHOOT = 6660;
/** Cite: azshara.cpp:51 SPELL_FROST_SHOT = 12551 */
export const SPELL_FROST_SHOT = 12551;
/** Cite: azshara.cpp:52 SPELL_FROST_NOVA = 11831 */
export const SPELL_FROST_NOVA = 11831;
/** Cite: azshara.cpp:53 SPELL_STRIKE = 11976 */
export const SPELL_STRIKE = 11976;

/** Cite: azshara.cpp:55 NPC_SPITELASH_WARRIOR = 6190 */
export const NPC_SPITELASH_WARRIOR = 6190;
/** Cite: azshara.cpp:56 NPC_SPITELASH_SCREAMER = 6193 */
export const NPC_SPITELASH_SCREAMER = 6193;
/** Cite: azshara.cpp:57 NPC_SPITELASH_GUARD = 6194 */
export const NPC_SPITELASH_GUARD = 6194;
/** Cite: azshara.cpp:58 NPC_SPITELASH_SIREN = 6195 */
export const NPC_SPITELASH_SIREN = 6195;
/** Cite: azshara.cpp:59 NPC_SPITELASH_MYRMIDON = 6196 */
export const NPC_SPITELASH_MYRMIDON = 6196;

// Polymorph ranks that arm the morph timer (SpellHit gate). Cite: azshara.cpp:119 pSpell->Id == 118 ||
// 12824 || 12825 || 12826
export const SPELL_POLYMORPH_RANKS = [118, 12824, 12825, 12826] as const;

// Morph timer after valid polymorph hit, then backfire + despawn. Cite: azshara.cpp:120 m_uiMorphTimer =
// 5000
export const SPITELASH_MORPH_TIMER_MS = 5000;

// Spitelash ability table — entry → spell / target / init / cooldown. Target types are 0 RANDOM,
// 1 VICTIM, 2 SELF, 3 FRIENDLY. Cite: azshara.cpp:74–84 m_aSpitelashAbility[8]; :61–64.
export const SPITELASH_ABILITIES = [
  {
    creatureEntry: NPC_SPITELASH_WARRIOR,
    spellId: SPELL_DISARM,
    target: 'victim' as const,
    initialMs: 4000,
    cooldownMs: 10_000,
    id: 'disarm',
    cite: 'azshara.cpp:76 Warrior Disarm 6713 victim init 4000 cd 10000',
  },
  {
    creatureEntry: NPC_SPITELASH_SCREAMER,
    spellId: SPELL_SCREECH,
    target: 'self' as const,
    initialMs: 7000,
    cooldownMs: 15_000,
    id: 'screech',
    cite: 'azshara.cpp:77 Screamer Screech 3589 self init 7000 cd 15000',
  },
  {
    creatureEntry: NPC_SPITELASH_GUARD,
    spellId: SPELL_FROST_SHOCK,
    target: 'victim' as const,
    initialMs: 7000,
    cooldownMs: 13_000,
    id: 'frost_shock',
    cite: 'azshara.cpp:78 Guard Frost Shock 12548 victim init 7000 cd 13000',
  },
  {
    creatureEntry: NPC_SPITELASH_SIREN,
    spellId: SPELL_RENEW,
    target: 'self' as const,
    // DoSelectLowestHpFriendly(10.0f): the Siren renews whichever Spitelash is worst off.
    friendlyLowestHpYd: 10,
    initialMs: 4000,
    cooldownMs: 7000,
    id: 'renew',
    cite: 'azshara.cpp:79,131-140 Siren Renew 11640 on DoSelectLowestHpFriendly(10.0f), init 4000 cd 7000',
  },
  {
    creatureEntry: NPC_SPITELASH_SIREN,
    spellId: SPELL_SHOOT,
    target: 'hostile_random' as const,
    initialMs: 3000,
    cooldownMs: 9000,
    id: 'shoot',
    cite: 'azshara.cpp:80 Siren Shoot 6660 random init 3000 cd 9000',
  },
  {
    creatureEntry: NPC_SPITELASH_SIREN,
    spellId: SPELL_FROST_SHOT,
    target: 'hostile_random' as const,
    initialMs: 7000,
    cooldownMs: 10_000,
    id: 'frost_shot',
    cite: 'azshara.cpp:81 Siren Frost Shot 12551 random init 7000 cd 10000',
  },
  {
    creatureEntry: NPC_SPITELASH_SIREN,
    spellId: SPELL_FROST_NOVA,
    target: 'self' as const,
    initialMs: 10_000,
    cooldownMs: 15_000,
    id: 'frost_nova',
    cite: 'azshara.cpp:82 Siren Frost Nova 11831 self init 10000 cd 15000',
  },
  {
    creatureEntry: NPC_SPITELASH_MYRMIDON,
    spellId: SPELL_STRIKE,
    target: 'victim' as const,
    initialMs: 3000,
    cooldownMs: 7000,
    id: 'strike',
    cite: 'azshara.cpp:83 Myrmidon Strike 11976 victim init 3000 cd 7000',
  },
] as const;

/** All Spitelash entries bound to mobs_spitelashes. Cite: scriptdev2.sql:188 */
export const SPITELASH_ENTRIES = [
  NPC_SPITELASH_WARRIOR,
  NPC_SPITELASH_SCREAMER,
  NPC_SPITELASH_GUARD,
  NPC_SPITELASH_SIREN,
  NPC_SPITELASH_MYRMIDON,
] as const;

// Constants — npc_felhound_tracker

// azshara.cpp:198–208
/** Cite: azshara.cpp:200 QUEST_AZSHARITE = 3602 */
export const QUEST_AZSHARITE = 3602;
/** Cite: azshara.cpp:202 GO_AZSHARITE_1 = 152620 */
export const GO_AZSHARITE_1 = 152620;
/** Cite: azshara.cpp:203 GO_AZSHARITE_2 = 152621 */
export const GO_AZSHARITE_2 = 152621;
/** Cite: azshara.cpp:204 GO_AZSHARITE_3 = 152622 */
export const GO_AZSHARITE_3 = 152622;
/** Cite: azshara.cpp:205 GO_AZSHARITE_4 = 152631 */
export const GO_AZSHARITE_4 = 152631;
/** Cite: azshara.cpp:207 SOUND_GROWL = 1249 */
export const SOUND_GROWL = 1249;
/** Cite: azshara.cpp:210 aGOList */
export const AZSHARITE_GO_LIST = [
  GO_AZSHARITE_1,
  GO_AZSHARITE_2,
  GO_AZSHARITE_3,
  GO_AZSHARITE_4,
] as const;

// Felhound Tracker creature entry (DB ScriptName bind). Cite: scriptdev2.sql:189 entry=8668; absent from
// product bake.
export const NPC_FELHOUND_TRACKER = 8668;

/** Cite: SharedDefines.h:647 TEXTEMOTE_ROAR = 75; azshara.cpp:241 */
export const TEXTEMOTE_ROAR = 75;

/** Cite: SharedDefines.h:556 GO_FLAG_INTERACT_COND = 0x00000004; azshara.cpp:272 */
export const GO_FLAG_INTERACT_COND = 0x00000004;

/** Crystal search radius. Cite: azshara.cpp:255 40.0f */
export const AZSHARITE_SEARCH_RADIUS_YD = 40;

/** Contact point distance. Cite: azshara.cpp:285 3.0f */
export const AZSHARITE_CONTACT_DIST_YD = 3;

/** Wait after MovementInform before next pet AI tick. Cite: azshara.cpp:232 m_uiWaitTimer = 20000 */
export const FELHOUND_WAIT_TIMER_MS = 20_000;

// Constants — event_arcanite_buoy + go_lightning + boss_maws

// azshara.cpp:322–327
/** Cite: azshara.cpp:324 EVENT_ARCANITE_BUOY = 9542 */
export const EVENT_ID_ARCANITE_BUOY = 9542;
/** Cite: azshara.cpp:325 NPC_MAWS = 15571 */
export const NPC_MAWS = 15571;
/** Cite: azshara.cpp:326 GO_THEATRIC_LIGHTNING = 183356 */
export const GO_THEATRIC_LIGHTNING = 183356;

/** Maws summon location. Cite: azshara.cpp:334 aMawsSpawn */
export const MAWS_SPAWN = {
  x: 3561.73,
  y: -6647.2,
  z: -7.5,
  o: 1.6,
  cite: 'azshara.cpp:334,347 aMawsSpawn + SummonCreature o=1.6',
} as const;

// Skip summon if Maws already within this range of player. Cite: azshara.cpp:343
// GetClosestCreatureWithEntry(..., 200.0f)
export const MAWS_EXISTING_RANGE_YD = 200;

// Lightning refresh search radius on buoy event. Cite: azshara.cpp:353 GetClosestGameObjectWithEntry(...,
// 20.0f)
export const LIGHTNING_EVENT_RANGE_YD = 20;

/** Lightning respawn time when refreshed by buoy event. Cite: azshara.cpp:357 SetRespawnTime(9000) */
export const LIGHTNING_RESPAWN_MS = 9000;

// Lightning custom-anim re-arm urand(2,5) seconds. Cite: azshara.cpp:374,387 urand(2, 5) * IN_MILLISECONDS
export const LIGHTNING_ANIM_MIN_MS = 2000;
export const LIGHTNING_ANIM_MAX_MS = 5000;

// azshara.cpp:403–412
/** Cite: azshara.cpp:405 SPELL_THRASH = 8876 */
export const SPELL_THRASH = 8876;
/** Cite: azshara.cpp:406 SPELL_FRENZY = 19812 */
export const SPELL_FRENZY = 19812;
/** Cite: azshara.cpp:407 SPELL_DARK_WATER = 25743 */
export const SPELL_DARK_WATER = 25743;
/** Cite: azshara.cpp:408 SPELL_RAMPAGE = 25744 */
export const SPELL_RAMPAGE = 25744;
/** Cite: azshara.cpp:410 EMOTE_GENERIC_FRENZY_KILL = -1000001 */
export const EMOTE_GENERIC_FRENZY_KILL = -1_000_001;
/** Cite: azshara.cpp:411 EMOTE_MAWS_KILL = -1010000 */
export const EMOTE_MAWS_KILL = -1_010_000;

// Maws HP threshold for Frenzy/Rampage re-arm + Dark Water enable. Cite: azshara.cpp:466,474,479
// GetHealthPercent() < 20.0f
export const MAWS_HP_ENRAGE_PCT = 20;

/** Cite: azshara.cpp:428 uiFrenzyTimer = 25 * IN_MILLISECONDS */
export const MAWS_FRENZY_INIT_MS = 25_000;
/** Cite: azshara.cpp:466 re-arm 25s when HP ≥ 20% */
export const MAWS_FRENZY_REPEAT_HIGH_MS = 25_000;
/** Cite: azshara.cpp:466 re-arm 15s when HP < 20% */
export const MAWS_FRENZY_REPEAT_LOW_MS = 15_000;

/** Cite: azshara.cpp:429 uiDarkWaterTimer = 15 * IN_MILLISECONDS */
export const MAWS_DARK_WATER_MS = 15_000;

/** Cite: azshara.cpp:430 uiRampageTimer = urand(20, 120) * IN_MILLISECONDS */
export const MAWS_RAMPAGE_INIT_MIN_MS = 20_000;
export const MAWS_RAMPAGE_INIT_MAX_MS = 120_000;
/** Cite: azshara.cpp:474 re-arm 12s when HP < 20% */
export const MAWS_RAMPAGE_REPEAT_LOW_MS = 12_000;

// Despawn timer 150 minutes (always ticks, combat or not). Cite: azshara.cpp:431 uiDespawnTimer = 150 *
// MINUTE * IN_MILLISECONDS
export const MAWS_DESPAWN_MS = 150 * 60 * 1000;

// Lightning deactivate search on Maws death/despawn. Cite: azshara.cpp:439,450
// GetClosestGameObjectWithEntry(..., 200.0f)
export const LIGHTNING_MAWS_RANGE_YD = 200;

// Pure helpers — mobs_spitelashes

// Timers for one Spitelash entry (cpp ctor filters ability table by entry). Cite: azshara.cpp:90-94,107-108
// Reset re-arms initial
export function spitelashTimersForEntry(entry: number): ScriptDevTimer[] {
  return SPITELASH_ABILITIES.filter((a) => a.creatureEntry === (entry | 0)).map(
    (a) => ({
      id: a.id,
      spellId: a.spellId,
      initialMinMs: a.initialMs,
      initialMaxMs: a.initialMs,
      repeatMinMs: a.cooldownMs,
      repeatMaxMs: a.cooldownMs,
      target: a.target,
      creatureEntry: a.creatureEntry,
      ...('friendlyLowestHpYd' in a ? { friendlyLowestHpYd: a.friendlyLowestHpYd, friendlyHpDeficit: 1 } : {}),
      cite: a.cite,
    }),
  );
}

export interface SpitelashSpellHitResult {
  handled: boolean;
  /** Arm m_uiMorphTimer when handled. */
  morphTimerMs: number | null;
  cite: string;
}

// Port of mobs_spitelashesAI::SpellHit morph arm, gated on quest 9364 INCOMPLETE and a player
// caster with no morph timer already running. Cite: azshara.cpp:111–121.
export function spitelashSpellHit(
  morphTimerActive: boolean,
  isPlayerCaster: boolean,
  questIncomplete: boolean,
  spellId: number,
): SpitelashSpellHitResult {
  if (morphTimerActive) {
    return {
      handled: false,
      morphTimerMs: null,
      cite: 'azshara.cpp:114-115 m_uiMorphTimer already set → return',
    };
  }
  if (!isPlayerCaster || !questIncomplete) {
    return {
      handled: false,
      morphTimerMs: null,
      cite: 'azshara.cpp:118 player + incomplete 9364 gate failed',
    };
  }
  if (!(SPELL_POLYMORPH_RANKS as readonly number[]).includes(spellId | 0)) {
    return {
      handled: false,
      morphTimerMs: null,
      cite: 'azshara.cpp:119 spell not polymorph rank 118/12824/12825/12826',
    };
  }
  return {
    handled: true,
    morphTimerMs: SPITELASH_MORPH_TIMER_MS,
    cite: 'azshara.cpp:120 m_uiMorphTimer = 5000',
  };
}

export interface SpitelashMorphTimerResult {
  /** Timer remaining after this tick (0 when fired or idle). */
  nextTimerMs: number;
  /** True when backfire cast + ForcedDespawn should run. */
  fire: boolean;
  backfireSpellId: number | null;
  castFlags: number | null;
  forceDespawn: boolean;
  cite: string;
}

// Port of the UpdateAI morph-timer branch; `morphTimerMs` 0 is idle.
// Cite: azshara.cpp:157–169.
export function spitelashMorphTimerTick(
  morphTimerMs: number,
  diffMs: number,
): SpitelashMorphTimerResult {
  if (morphTimerMs <= 0) {
    return {
      nextTimerMs: 0,
      fire: false,
      backfireSpellId: null,
      castFlags: null,
      forceDespawn: false,
      cite: 'azshara.cpp:157 !m_uiMorphTimer → skip',
    };
  }
  if (morphTimerMs <= diffMs) {
    return {
      nextTimerMs: 0,
      fire: true,
      backfireSpellId: SPELL_POLYMORPH_BACKFIRE,
      castFlags: CAST_FLAG.TRIGGERED,
      forceDespawn: true,
      cite:
        'azshara.cpp:161-164 DoCastSpellIfCan(SPELL_POLYMORPH_BACKFIRE, CAST_TRIGGERED) + ForcedDespawn',
    };
  }
  return {
    nextTimerMs: morphTimerMs - diffMs,
    fire: false,
    backfireSpellId: null,
    castFlags: null,
    forceDespawn: false,
    cite: 'azshara.cpp:167-168 m_uiMorphTimer -= uiDiff',
  };
}

// Pure helpers — npc_felhound_tracker

export interface FelhoundReceiveEmoteResult {
  handled: boolean;
  /** Clear wait + movement and start crystal search. */
  findCrystal: boolean;
  cite: string;
}

/** Port of npc_felhound_trackerAI::ReceiveEmote. Cite: azshara.cpp:235–247 */
export function felhoundReceiveEmote(
  questIncomplete: boolean,
  textEmote: number,
): FelhoundReceiveEmoteResult {
  if (!questIncomplete) {
    return {
      handled: false,
      findCrystal: false,
      cite: 'azshara.cpp:238-239 quest 3602 not incomplete → return',
    };
  }
  if ((textEmote | 0) !== TEXTEMOTE_ROAR) {
    return {
      handled: false,
      findCrystal: false,
      cite: 'azshara.cpp:241 textEmote != TEXTEMOTE_ROAR → no-op',
    };
  }
  return {
    handled: true,
    findCrystal: true,
    cite: 'azshara.cpp:241-245 ROAR → clear wait + DoFindNewCrystal',
  };
}

export interface FelhoundCrystalCandidate {
  entry: number;
  /** Distance from pet (yards). */
  distYd: number;
  /** GAMEOBJECT_FLAGS bitfield. */
  flags: number;
}

export interface FelhoundFindCrystalResult {
  /** Nearest interactable crystal entry, or null → growl. */
  crystalEntry: number | null;
  playGrowl: boolean;
  soundId: number | null;
  /** MovePoint contact distance when crystal found. */
  contactDistYd: number | null;
  movementActive: boolean;
  cite: string;
}

// Port of DoFindNewCrystal: the first GO list with any in-range object wins, then the nearest
// with GO_FLAG_INTERACT_COND among it. Candidates are the caller's 40 yd query. Cite: :250–289.
export function felhoundFindCrystal(
  candidates: readonly FelhoundCrystalCandidate[],
): FelhoundFindCrystalResult {
  // Group by aGOList order — first entry family with any hit wins (cpp:255-258).
  for (const goEntry of AZSHARITE_GO_LIST) {
    const inFamily = candidates
      .filter((c) => c.entry === goEntry)
      .slice()
      .sort((a, b) => a.distYd - b.distYd);
    if (inFamily.length === 0) continue;
    // cpp iterates full merged list after first non-empty family break — once
    // a family had hits the loop broke, then sorted that family list only.
    const usable = inFamily.find(
      (c) => (c.flags & GO_FLAG_INTERACT_COND) !== 0,
    );
    if (!usable) {
      return {
        crystalEntry: null,
        playGrowl: true,
        soundId: SOUND_GROWL,
        contactDistYd: null,
        movementActive: false,
        cite: 'azshara.cpp:279-282 no GO with GO_FLAG_INTERACT_COND → growl',
      };
    }
    return {
      crystalEntry: usable.entry,
      playGrowl: false,
      soundId: null,
      contactDistYd: AZSHARITE_CONTACT_DIST_YD,
      movementActive: true,
      cite: 'azshara.cpp:284-288 GetContactPoint 3.0f + MovePoint(1) walk=false',
    };
  }
  return {
    crystalEntry: null,
    playGrowl: true,
    soundId: SOUND_GROWL,
    contactDistYd: null,
    movementActive: false,
    cite: 'azshara.cpp:261-264 empty grid → PlayDirectSound SOUND_GROWL',
  };
}

export interface FelhoundMovementInformResult {
  handled: boolean;
  waitTimerMs: number;
  movementActive: boolean;
  cite: string;
}

/** Port of MovementInform POINT_MOTION_TYPE point 1. Cite: azshara.cpp:225–233 */
export function felhoundMovementInform(
  moveTypeIsPoint: boolean,
  pointId: number,
): FelhoundMovementInformResult {
  if (!moveTypeIsPoint || !pointId) {
    return {
      handled: false,
      waitTimerMs: 0,
      movementActive: false,
      cite: 'azshara.cpp:227 !POINT || !pointId → return',
    };
  }
  return {
    handled: true,
    waitTimerMs: FELHOUND_WAIT_TIMER_MS,
    movementActive: false,
    cite: 'azshara.cpp:230-232 MoveIdle + wait 20000',
  };
}

// Pure helpers — event_arcanite_buoy / go_lightning / boss_maws

export interface ArcaniteBuoyEventResult {
  handled: boolean;
  /** Summon Maws when true. */
  summonMaws: boolean;
  spawn: typeof MAWS_SPAWN | null;
  /** Refresh lightning GO when found unspawned. */
  refreshLightning: boolean;
  lightningRespawnMs: number | null;
  cite: string;
}

// Port of ProcessEventId_arcanite_buoy — summons Maws only when none is already within 200 yd.
// Cite: azshara.cpp:336–366.
export function arcaniteBuoyProcessEvent(
  eventId: number,
  isPlayerSource: boolean,
  mawsAlreadyNear: boolean,
): ArcaniteBuoyEventResult {
  if ((eventId | 0) !== EVENT_ID_ARCANITE_BUOY) {
    return {
      handled: false,
      summonMaws: false,
      spawn: null,
      refreshLightning: false,
      lightningRespawnMs: null,
      cite: 'azshara.cpp:338 eventId != EVENT_ARCANITE_BUOY → false',
    };
  }
  if (!isPlayerSource) {
    return {
      handled: true,
      summonMaws: false,
      spawn: null,
      refreshLightning: false,
      lightningRespawnMs: null,
      cite: 'azshara.cpp:340-341 !player source → return true without summon',
    };
  }
  if (mawsAlreadyNear) {
    return {
      handled: false,
      summonMaws: false,
      spawn: null,
      refreshLightning: false,
      lightningRespawnMs: null,
      cite: 'azshara.cpp:343-344 Maws already within 200yd → return false (no second summon)',
    };
  }
  return {
    handled: true,
    summonMaws: true,
    spawn: MAWS_SPAWN,
    refreshLightning: true,
    lightningRespawnMs: LIGHTNING_RESPAWN_MS,
    cite:
      'azshara.cpp:347-360 SummonCreature Maws + MoveWaypoint + lightning SetRespawnTime(9000)+Refresh if !spawned',
  };
}

// go_ai_lightning custom-anim re-arm; `roll25` in [0,3] maps to urand(2,5) seconds.
// Cite: azshara.cpp:374, :384-388.
export function lightningAnimRearmMs(roll25: number): number {
  const sec = 2 + (((roll25 | 0) % 4) + 4) % 4; // 2..5
  return sec * 1000;
}

// Frenzy re-arm after CAST_OK. Cite: azshara.cpp:466 (m_creature->GetHealthPercent() < 20.0f ? 15 : 25) *
// IN_MILLISECONDS
export function mawsFrenzyRearmMs(hpPct: number): number {
  return hpPct < MAWS_HP_ENRAGE_PCT
    ? MAWS_FRENZY_REPEAT_LOW_MS
    : MAWS_FRENZY_REPEAT_HIGH_MS;
}

// Rampage re-arm after CAST_OK: 12 s below 20% HP, else the pre-rolled urand(20,120)s.
// Cite: azshara.cpp:474.
export function mawsRampageRearmMs(hpPct: number, rampageHighRollMs: number): number {
  return hpPct < MAWS_HP_ENRAGE_PCT
    ? MAWS_RAMPAGE_REPEAT_LOW_MS
    : rampageHighRollMs;
}

/** Whether Dark Water branch is active (timer only ticks below 20%). Cite: azshara.cpp:479-488 */
export function mawsDarkWaterActive(hpPct: number): boolean {
  return hpPct < MAWS_HP_ENRAGE_PCT;
}

// ScriptDev IR — mobs_spitelashes

// mobs_spitelashesAI — 6190 Warrior, 6193 Screamer, 6194 Guard, 6195 Siren, 6196 Myrmidon, all in
// bake, filtered per entry by timer.creatureEntry. SpellHit polymorph → 5s die timer → 28406.
export const MOBS_SPITELASHES: ScriptDevIR = {
  name: 'mobs_spitelashes',
  boundCreatures: [...SPITELASH_ENTRIES],
  sourceFile: 'kalimdor/azshara.cpp',
  spellIds: [
    SPELL_POLYMORPH_BACKFIRE,
    SPELL_DISARM,
    SPELL_SCREECH,
    SPELL_FROST_SHOCK,
    SPELL_RENEW,
    SPELL_SHOOT,
    SPELL_FROST_SHOT,
    SPELL_FROST_NOVA,
    SPELL_STRIKE,
  ],
  timers: SPITELASH_ABILITIES.map((a) => ({
    id: a.id,
    spellId: a.spellId,
    initialMinMs: a.initialMs,
    initialMaxMs: a.initialMs,
    repeatMinMs: a.cooldownMs,
    repeatMaxMs: a.cooldownMs,
    target: a.target,
    creatureEntry: a.creatureEntry,
    ...('friendlyLowestHpYd' in a ? { friendlyLowestHpYd: a.friendlyLowestHpYd, friendlyHpDeficit: 1 } : {}),
    cite: a.cite,
  })),
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_uiMorphTimer=0; ability timers re-arm to m_uiInitialTimer per entry',
        cite: 'azshara.cpp:103-109 Reset',
      },
    ],
  },
  spellHits: SPELL_POLYMORPH_RANKS.map((spellId) => ({
    spellId,
    playerCaster: true,
    requireQuestIncomplete: QUEST_FRAGMENTED_MAGIC,
    once: true,
    dieTimerMs: SPITELASH_MORPH_TIMER_MS,
    onDieTimer: [
      {
        kind: 'cast_self' as const,
        spellId: SPELL_POLYMORPH_BACKFIRE,
        castFlags: CAST_FLAG.TRIGGERED,
        cite: 'azshara.cpp:161 DoCastSpellIfCan(SPELL_POLYMORPH_BACKFIRE, CAST_TRIGGERED)',
      },
      {
        kind: 'force_despawn' as const,
        delayMs: 0,
        cite: 'azshara.cpp:164 ForcedDespawn()',
      },
    ],
    cite: `azshara.cpp:111-121 SpellHit rank ${spellId} + :120 morph 5000 + :157-169 backfire`,
  })),
  cites: [
    'azshara.cpp:36-192 mobs_spitelashes',
    'azshara.cpp:74-84 m_aSpitelashAbility table',
    'azshara.cpp:90-94 ctor filters by entry',
    'azshara.cpp:103-109 Reset morph=0 + re-arm initials',
    'azshara.cpp:111-121 SpellHit polymorph + quest 9364',
    'azshara.cpp:157-169 morph timer → 28406 TRIGGERED + ForcedDespawn',
    'azshara.cpp:171-183 combat ability timers (one cast per tick)',
    'scriptdev2.sql:188 ScriptName mobs_spitelashes',
  ],
};

// ScriptDev IR — npc_felhound_tracker

// npc_felhound_trackerAI (ScriptedPetAI), creature 8668 — ABSENT from bake, so an unused binding.
// No combat cast timers; the ReceiveEmote ROAR and crystal search are pure helpers.
export const NPC_FELHOUND_TRACKER_SCRIPT: ScriptDevIR = {
  name: 'npc_felhound_tracker',
  boundCreatures: [NPC_FELHOUND_TRACKER],
  sourceFile: 'kalimdor/azshara.cpp',
  spellIds: [],
  timers: [],
  receiveEmotes: [
    {
      emote: TEXTEMOTE_ROAR,
      actions: [
        {
          kind: 'flavor',
          text: `quest ${QUEST_AZSHARITE} incomplete → clear wait + DoFindNewCrystal (GOs ${AZSHARITE_GO_LIST.join('/')}, r${AZSHARITE_SEARCH_RADIUS_YD}, flag 0x${GO_FLAG_INTERACT_COND.toString(16)}, contact ${AZSHARITE_CONTACT_DIST_YD}yd; growl ${SOUND_GROWL} if none)`,
          cite: 'azshara.cpp:235-289 ReceiveEmote ROAR + DoFindNewCrystal',
        },
      ],
      cite: 'azshara.cpp:235-247 ReceiveEmote TEXTEMOTE_ROAR=75 quest 3602',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: 'm_bIsMovementActive=false m_uiWaitTimer=0',
        cite: 'azshara.cpp:219-223 Reset',
      },
    ],
  },
  unusedBindings: [
    {
      entry: NPC_FELHOUND_TRACKER,
      kind: 'creature',
      reason:
        'Creature 8668 Felhound Tracker is DB-bound ScriptName npc_felhound_tracker but absent from product bake - IR + pure helpers ported; product cannot spawn pet until rebake. Quest 3602 Azsharite frame residual lives in QI4 registryAzshara.',
      cite: 'scriptdev2.sql:189; azshara.cpp:194-316; loadRealBundle missing 8668',
    },
  ],
  cites: [
    'azshara.cpp:194-316 npc_felhound_tracker',
    'azshara.cpp:200 QUEST_AZSHARITE=3602',
    'azshara.cpp:202-210 GO crystals + aGOList',
    'azshara.cpp:219-223 Reset',
    'azshara.cpp:225-233 MovementInform wait 20000',
    'azshara.cpp:235-247 ReceiveEmote ROAR',
    'azshara.cpp:250-289 DoFindNewCrystal',
    'azshara.cpp:291-310 UpdateAI movement/wait gates',
    'scriptdev2.sql:189 entry 8668',
  ],
};

// ScriptDev IR — event_arcanite_buoy

// ProcessEventId_arcanite_buoy, scriptdev2.sql event 9542 with no creature ScriptName. The host
// models it as a goUse-shaped event with no GO. Cite: azshara.cpp:336–366.
export const EVENT_ARCANITE_BUOY: ScriptDevIR = {
  name: 'event_arcanite_buoy',
  boundCreatures: [],
  sourceFile: 'kalimdor/azshara.cpp',
  spellIds: [],
  timers: [],
  goUse: {
    goEntries: [],
    actions: [
      {
        kind: 'summon',
        creatureEntry: NPC_MAWS,
        cite: 'azshara.cpp:347 SummonCreature(NPC_MAWS) TEMPSPAWN_MANUAL_DESPAWN at aMawsSpawn',
      },
      {
        kind: 'flavor',
        text: `MoveWaypoint walk=false; refresh GO_THEATRIC_LIGHTNING ${GO_THEATRIC_LIGHTNING} ≤${LIGHTNING_EVENT_RANGE_YD}yd SetRespawnTime(${LIGHTNING_RESPAWN_MS})+Refresh if !spawned; skip if Maws already ≤${MAWS_EXISTING_RANGE_YD}yd`,
        cite: 'azshara.cpp:343-360',
      },
    ],
    cite: 'azshara.cpp:336-366 ProcessEventId_arcanite_buoy; scriptdev2.sql:193 event 9542',
  },
  unusedBindings: [
    {
      entry: GO_THEATRIC_LIGHTNING,
      kind: 'go',
      reason:
        'event_arcanite_buoy is ProcessEventId (9542) with no creature ScriptName - corpus boundCreatures []. GO 183356 Theatric Lightning is visual-only lookup on summon (GetClosestGameObjectWithEntry ≤20yd); product tables/gameObjects lacks spawn row (present in gameobject-data.json only).',
      cite: 'azshara.cpp:353-359; scriptdev2.sql:193; tables/gameObjects missing 183356',
    },
  ],
  cites: [
    'azshara.cpp:318-366 event_arcanite_buoy',
    'azshara.cpp:324 EVENT_ARCANITE_BUOY=9542',
    'azshara.cpp:325 NPC_MAWS=15571',
    'azshara.cpp:326 GO_THEATRIC_LIGHTNING=183356',
    'azshara.cpp:334 aMawsSpawn',
    'azshara.cpp:514-516 RegisterSelf pProcessEventId',
    'scriptdev2.sql:193 event 9542',
  ],
};

// ScriptDev IR — go_lightning

// go_ai_lightning, gameobject_template 183356. Custom anim urand(2,5)s while spawned; the GO is
// not on the tables/gameObjects product path, so the binding is unused. Cite: azshara.cpp:372–397.
export const GO_LIGHTNING: ScriptDevIR = {
  name: 'go_lightning',
  boundCreatures: [],
  boundGos: [GO_THEATRIC_LIGHTNING],
  sourceFile: 'kalimdor/azshara.cpp',
  spellIds: [],
  timers: [],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `m_uilightningTimer = urand(2,5)*IN_MILLISECONDS [${LIGHTNING_ANIM_MIN_MS},${LIGHTNING_ANIM_MAX_MS}]`,
        cite: 'azshara.cpp:374 ctor urand(2,5)*IN_MILLISECONDS',
      },
    ],
  },
  unusedBindings: [
    {
      entry: GO_THEATRIC_LIGHTNING,
      kind: 'go',
      reason:
        'GO 183356 Theatric Lightning is DB-bound ScriptName go_lightning but absent from product tables/gameObjects.json (present in gameobject-data.json) - IR + pure helper ported; product GO AI tick not spawnable until tables row.',
      cite: 'scriptdev2.sql:191; azshara.cpp:372-397; tables/gameObjects missing 183356',
    },
  ],
  cites: [
    'azshara.cpp:368-397 go_lightning',
    'azshara.cpp:374,384-388 custom anim urand(2,5)s while spawned',
    'azshara.cpp:518-521 RegisterSelf GetGameObjectAI',
    'scriptdev2.sql:191 entry 183356',
  ],
};

// ScriptDev IR — boss_maws

// boss_mawsAI, creature 15571 — an outdoor world elite with no InstanceDef. Thrash on reset, then
// Frenzy / Rampage / Dark Water in combat; the low-HP re-arms live in the pure helpers.
export const BOSS_MAWS: ScriptDevIR = {
  name: 'boss_maws',
  boundCreatures: [NPC_MAWS],
  sourceFile: 'kalimdor/azshara.cpp',
  spellIds: [SPELL_THRASH, SPELL_FRENZY, SPELL_DARK_WATER, SPELL_RAMPAGE],
  timers: [
    {
      id: 'thrash',
      spellId: SPELL_THRASH,
      initialMinMs: 0,
      initialMaxMs: 0,
      repeatMinMs: 0,
      repeatMaxMs: 0,
      target: 'self',
      onReset: true,
      castFlags: CAST_FLAG.TRIGGERED | CAST_FLAG.AURA_NOT_PRESENT,
      cite: 'azshara.cpp:433 DoCastSpellIfCan(nullptr, SPELL_THRASH, CAST_TRIGGERED|CAST_AURA_NOT_PRESENT)',
    },
    {
      id: 'frenzy',
      spellId: SPELL_FRENZY,
      initialMinMs: MAWS_FRENZY_INIT_MS,
      initialMaxMs: MAWS_FRENZY_INIT_MS,
      // Host high-HP re-arm; low-HP 15s via mawsFrenzyRearmMs pure helper.
      repeatMinMs: MAWS_FRENZY_REPEAT_HIGH_MS,
      repeatMaxMs: MAWS_FRENZY_REPEAT_HIGH_MS,
      target: 'self',
      cite: 'azshara.cpp:428,462-467 Frenzy init 25s re-arm 25s (15s if HP<20%) self + EMOTE_GENERIC_FRENZY_KILL',
    },
    {
      id: 'rampage',
      spellId: SPELL_RAMPAGE,
      initialMinMs: MAWS_RAMPAGE_INIT_MIN_MS,
      initialMaxMs: MAWS_RAMPAGE_INIT_MAX_MS,
      // Host high-HP re-arm urand(20,120)s; low-HP 12s via mawsRampageRearmMs.
      repeatMinMs: MAWS_RAMPAGE_INIT_MIN_MS,
      repeatMaxMs: MAWS_RAMPAGE_INIT_MAX_MS,
      target: 'victim',
      cite: 'azshara.cpp:430,471-475 Rampage init urand(20,120)s re-arm same (12s if HP<20%) victim',
    },
    {
      id: 'dark_water',
      spellId: SPELL_DARK_WATER,
      // cpp: timer only decrements while HP<20%; first cast ~15s after crossing band.
      initialMinMs: MAWS_DARK_WATER_MS,
      initialMaxMs: MAWS_DARK_WATER_MS,
      repeatMinMs: MAWS_DARK_WATER_MS,
      repeatMaxMs: MAWS_DARK_WATER_MS,
      target: 'self',
      hpPctMax: MAWS_HP_ENRAGE_PCT,
      hpPctMin: 0,
      cite: 'azshara.cpp:429,479-487 Dark Water only HP<20% init/re-arm 15s self',
    },
  ],
  lifecycle: {
    onReset: [
      {
        kind: 'flavor',
        text: `uiFrenzyTimer=25000 uiDarkWaterTimer=15000 uiRampageTimer=urand(20,120)s uiDespawnTimer=${MAWS_DESPAWN_MS} + Thrash 8876 TRIGGERED|AURA_NOT_PRESENT`,
        cite: 'azshara.cpp:426-434 Reset',
      },
    ],
    onDeath: [
      {
        kind: 'flavor',
        text: `deactivate GO_THEATRIC_LIGHTNING ≤${LIGHTNING_MAWS_RANGE_YD}yd GO_JUST_DEACTIVATED`,
        cite: 'azshara.cpp:438-440 JustDied lightning deactivate',
      },
      {
        kind: 'yell',
        textId: EMOTE_MAWS_KILL,
        cite: 'azshara.cpp:441 DoScriptText(EMOTE_MAWS_KILL)',
      },
    ],
    onEvade: [
      {
        kind: 'flavor',
        text: `despawn path (uiDespawnTimer ${MAWS_DESPAWN_MS}ms): lightning deactivate + EMOTE_MAWS_KILL + ForcedDespawn - ticks OOC in UpdateAI`,
        cite: 'azshara.cpp:447-454 despawn timer',
      },
    ],
  },
  cites: [
    'azshara.cpp:399-497 boss_maws',
    'azshara.cpp:405-408 SPELL_THRASH=8876 FRENZY=19812 DARK_WATER=25743 RAMPAGE=25744',
    'azshara.cpp:410-411 EMOTE_GENERIC_FRENZY_KILL=-1000001 EMOTE_MAWS_KILL=-1010000',
    'azshara.cpp:426-434 Reset timers + Thrash',
    'azshara.cpp:436-442 JustDied lightning + emote',
    'azshara.cpp:447-454 150min despawn',
    'azshara.cpp:462-488 Frenzy / Rampage / Dark Water <20%',
    'scriptdev2.sql:190 entry 15571',
  ],
};
