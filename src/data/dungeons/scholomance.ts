// Scholomance (map 289) — InstanceDef graph. Authority: docs/dungeons/survey/18-scholomance.md.
// Six engine/bake residuals are named there; none is a deferred C++ port.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  clusterMemberByGuid,
  loadPoolGuidCandidates,
  repackFromGuids,
} from './pack-from-clusters.ts';

// ---- Census static counts (map 289; survey creature census static column) ----
// Bosses, Dawn's Gambit students, seasonal rows and every summon-only entry are excluded.

const STATIC = {
  risenGuard: 12, // 10489 Risen Guard
  acolyte: 14, // 10471 Scholomance Acolyte
  necrolyte: 10, // 10476 Scholomance Necrolyte
  neophyte: 17, // 10470 Scholomance Neophyte
  diseasedGhoul: 29, // 10495 Diseased Ghoul (pool)
  necrofiend: 3, // 11551 Necrofiend
  bonewarder: 4, // 10491 Risen Bonewarder
  construct: 12, // 10488 Risen Construct
  protector: 4, // 10487 Risen Protector
  adept: 17, // 10469 Scholomance Adept
  darkSummoner: 6, // 11582 Scholomance Dark Summoner
  necromancer: 15, // 10477 Scholomance Necromancer
  occultist: 5, // 10472 Scholomance Occultist
  researcher: 7, // 10499 Spectral Researcher
  teacher: 3, // 10500 Spectral Teacher
  tutor: 7, // 10498 Spectral Tutor
  warrior: 2, // 10486 Risen Warrior
  handler: 5, // 11257 Scholomance Handler
  splinteredSkeleton: 5, // 10478 Splintered Skeleton
  bloodSteward: 1, // 14861 Blood Steward of Kirtonos
  hatchling: 22, // 10678 Plagued Hatchling
  aberration: 46, // 10485 Risen Aberration
  reanimatedCorpse: 24, // 10481 Reanimated Corpse (pool)
  unstableCorpse: 21, // 10480 Unstable Corpse
} as const;

const ENTRY = {
  risenGuard: 10489,
  acolyte: 10471,
  necrolyte: 10476,
  neophyte: 10470,
  diseasedGhoul: 10495,
  necrofiend: 11551,
  bonewarder: 10491,
  construct: 10488,
  protector: 10487,
  adept: 10469,
  darkSummoner: 11582,
  necromancer: 10477,
  occultist: 10472,
  researcher: 10499,
  teacher: 10500,
  tutor: 10498,
  warrior: 10486,
  handler: 11257,
  splinteredSkeleton: 10478,
  bloodSteward: 14861,
  hatchling: 10678,
  aberration: 10485,
  reanimatedCorpse: 10481,
  unstableCorpse: 10480,
  // Bosses (canonical survey order)
  kirtonos: 10506, // summon-only - Blood of Innocents on Brazier
  jandice: 10503,
  rattlegore: 11622,
  marduk: 10433, // viewing room (with Vectus)
  vectus: 10432,
  ras: 10508,
  malicia: 10505, // six mini-bosses (stable author order)
  krastinov: 11261,
  polkelt: 10901,
  ravenian: 10507,
  lordAlexei: 10504,
  ladyIllucia: 10502,
  gandling: 1853, // summon-only - after all 6 mini-bosses
  // Event summon-only
  risenGuardian: 11598, // Gandling Shadow Portal room adds
  /** Dawn's Gambit — friendly statics until item arm; combat pack after gate. */
  student: 10475, // Scholomance Student (survey static ×32)
} as const;

/** Flags from survey event choreography / instance_scholomance.cpp. */
export const SCHOLOMANCE_FLAGS = {
  /** Brazier of the Herald used with Blood of Innocents - unlocks Kirtonos. */
  kirtonosBrazier: 'scholo-kirtonos-brazier',
  /** Rattlegore death drops Viewing Room Key 13873 - opens Viewing Room Door 175167. */
  viewingRoomKey: 'scholo-viewing-room-key',
  // Dawn's Gambit used at Viewing Room Spell Focus. Cite: instance_scholomance.cpp:440-469
  // HandleDawnGambitEvent; scholomance.h:66 EVENT_ID=5140.
  dawnGambit: 'scholo-dawn-gambit',
  /** Jandice death → journal GO reveal path. Cite: 289_scholomance.sql dbscripts_on_creature_death 10503. */
  jandiceDone: 'scholo-jandice-done',
  /** Six mini-boss DONE flags - all required before Gandling. */
  maliciaDone: 'scholo-malicia-done',
  krastinovDone: 'scholo-krastinov-done',
  polkeltDone: 'scholo-polkelt-done',
  ravenianDone: 'scholo-ravenian-done',
  lordAlexeiDone: 'scholo-lord-alexei-done',
  ladyIlluciaDone: 'scholo-lady-illucia-done',
} as const;

// Kirtonos the Herald — Brazier plus porch gate lock-in: Gate 175570 auto-reopens after 600s and
// 10506 spawns at 309.65,93.47. Cite: 289_scholomance.sql dbscripts_on_go_use @OGUID+9.
export const SCHOLO_KIRTONOS = {
  encId: 'kirtonos-the-herald',
  goEntry: 175564, // Brazier of the Herald
  requiredItem: 13523, // Blood of Innocents (quest 5384)
  porchGateGo: 175570, // Gate of Kirtonos
  /** dbscripts_on_go_use cmd 12 datalong2 = 600 (seconds). */
  porchGateLockMs: 600_000,
  /** dbscripts_on_go_use delay 5000 → SUMMON_CREATURE 10506. */
  firstWaveAtMs: 5_000,
  /** dbscripts datalong2 on summon = 900000 (15 min). */
  despawnMs: 900_000,
  /** dbscripts_on_go_use cmd 10 x,y,z. */
  spawn: { x: 309.65, y: 93.47, z: 101.66 },
} as const;

/** Viewing Room Door: GO 175167, lock 1199 → LOCK_KEY_ITEM 13873 off Rattlegore (lootId 11622). */
export const SCHOLO_VIEWING_ROOM = {
  goEntry: 175167,
  requiredItem: 13873,
} as const;

/** Alias kept for older probe/import sites. */
export const SCHOLOMANCE_KIRTONOS_BRAZIER = {
  goEntry: SCHOLO_KIRTONOS.goEntry,
  requiredItem: SCHOLO_KIRTONOS.requiredItem,
} as const;

// Gandling Shadow Portal room table (baked dbScripts.event 5618–5623): eventId, classroom gate GO,
// guardian count, room tag. Polkelt takes ×4 guardians, the others ×3. Cite: scholomance.h:59-64.
export const SCHOLOMANCE_GANDLING_PORTALS = [
  { room: 'polkelt', eventId: 5618, gateGo: 177376, count: 4 },
  { room: 'theolen', eventId: 5619, gateGo: 177377, count: 3 },
  { room: 'malicia', eventId: 5620, gateGo: 177375, count: 3 },
  { room: 'illucia', eventId: 5621, gateGo: 177371, count: 3 },
  { room: 'barov', eventId: 5622, gateGo: 177373, count: 3 },
  { room: 'ravenian', eventId: 5623, gateGo: 177372, count: 3 },
] as const;

// Darkmaster Gandling encounter plus the Shadow Portal schedule. Cite: boss_darkmaster_gandling.cpp
// :57 Teleport=16000, :94 HP>3%, :106 urand(20000,35000); dbScripts.event 5618 delay 2000.
export const SCHOLO_GANDLING = {
  encId: 'darkmaster-gandling',
  spellShadowPortal: 17950,
  /** Reset m_uiTeleportTimer. Cite: boss_darkmaster_gandling.cpp:57 */
  firstPortalCastMs: 16_000,
  /** dbscripts_on_event 5618–5623 delay before SUMMON_CREATURE. */
  portalSummonDelayMs: 2_000,
  /** First guardian wave absolute from combat start (cast + DB delay). */
  firstPortalGuardiansAtMs: 18_000,
  /** CAST_OK re-arm min. Cite: boss_darkmaster_gandling.cpp:106 */
  portalRepeatMinMs: 20_000,
  /** CAST_OK re-arm max. Cite: boss_darkmaster_gandling.cpp:106 */
  portalRepeatMaxMs: 35_000,
  /** Portal only while GetHealthPercent() > 3. Cite: cpp:94 */
  portalHpMinPct: 3,
  /** dbscripts datalong2 despawn. */
  guardianDespawnMs: 300_000,
  /** aGandlingSpawnLocs[0]. Cite: scholomance.h:82-85 */
  spawn: { x: 180.771, y: -5.4286, z: 75.5702 },
  gateGo: 177374, // GO_GATE_GANDLING
} as const;

// Portal rooms then the Gandling finale, with `lastHas` carrying the floor credit guid. Residual:
// player teleport and per-room gate close/reopen have no floor-isolation kind.
export const SCHOLO_GANDLING_WAVES = [
  ...SCHOLOMANCE_GANDLING_PORTALS.map((p) => ({
    pack: [{ creatureEntry: ENTRY.risenGuardian, count: p.count }],
  })),
  { pack: [{ creatureEntry: ENTRY.gandling, count: 1 }] },
] as const;

// Jandice Barov — illusions from ScriptDev (17773 → 15× 11439), journal from
// dbscripts_on_creature_death 10503 spell 26096 → GO 180794, which the bake still lacks.
export const SCHOLO_JANDICE = {
  encId: 'jandice-barov',
  spellSummonIllusions: 17773,
  illusionEntry: 11439,
  illusionCount: 15, // 17773 EffectBasePoints1=14 + dieSides1=1
  hideDurationMs: 8_000, // Spread Jandice 17774 DurationIndex 31
  journalGo: 180794, // Cite: 289_scholomance.sql dbscripts_on_creature_death 10503 → 26096
  journalSpell: 26096,
} as const;

// Dawn's Gambit — Viewing Room student ambush, gated at Spell Focus 176111 with item 12368 and a
// 32× 10475 pack standing in for the transform. Cite: instance_scholomance.cpp:440-509.
export const SCHOLO_DAWN_GAMBIT = {
  encId: 'dawn-gambit',
  /** dungeonGameObjects map 289 — Scholomance Viewing Room Spell Focus (DND). */
  goEntry: 176111,
  requiredItem: 12368, // Dawn's Gambit (quest 4771); item-data useSpell 17045
  spellDawnGambit: 17045,
  trapGo: 176110, // summoned by 17045 (not static on map)
  eventId: 5140, // scholomance.h:66 EVENT_ID_DAWN_GAMBIT
  /** Cite: instance_scholomance.cpp:444 m_uiGambitTransformTimer = 12 * IN_MILLISECONDS */
  transformMs: 12_000,
  studentEntry: 10475,
  /** Survey static census ×32 Viewing Room students. */
  studentCount: 32,
  /** FACTION_SCOURGE after flip. Cite: scholomance.h:68 FACTION_SCOURGE=233 */
  scourgeFaction: 233,
  /** SPELL_STUDENT_TRANSFORM — missing from spell bake; product combat pack stand-in. */
  spellStudentTransform: 18115,
} as const;

// Soulbound Keepsake — Ras Frostwhisper mortality (quest 5461/5466), item 13752 useSpell 17179.
// Residual: the mid-fight item-target state machine and spell 17186 are absent from the bake.
export const SCHOLO_RAS_KEEPSAKE = {
  encId: 'ras-frostwhisper',
  requiredItem: 13752, // Soulbound Keepsake
  spellBoonOfLife: 17179,
  spellVisualDummy: 17190, // EventAI 1050803 trigger
  spellBecomesBoy: 17186, // missing from spell bake
  /** Relay 1050801: +2s cast boy form. Cite: survey 18-scholomance.md Ras mortality row. */
  becomesBoyDelayMs: 2_000,
  /** Relay: +8s faction 233 + attackable again. */
  reHostileDelayMs: 8_000,
  humanHeadItem: 13626, // quest 5466 drop (no DB condition on human form)
  boyDisplayId: 5736,
} as const;

/** Summon-only creature entries that must never appear in pure static trash packs. */
export const SCHOLOMANCE_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.kirtonos, // 10506
  ENTRY.gandling, // 1853
  ENTRY.risenGuardian, // 11598
  11439, // Illusion of Jandice Barov (ScriptDev mid-fight inject)
  16118, // Kormok (survey; not modeled)
]);

/** Scourge Invasion / technical - excluded from static combat graph. */
export const SCHOLOMANCE_EXCLUDED_ENTRIES = new Set<number>([
  14695, // Lord Blackwood - Scourge Invasion (D-10)
  // 10475 students: event-only via SCHOLO_DAWN_GAMBIT (not pure static trash)
  16047, // Kormok Trigger - technical
]);

/** Split a static spawn count into pack sizes in [2, 5] (prefer 4). Remainder 1 folded into prior pack. */
export function splitPackSizes(total: number, prefer = 4): number[] {
  if (total <= 0) return [];
  if (total === 1) return [1];
  const packs: number[] = [];
  let left = total;
  while (left > 0) {
    if (left <= 5) {
      packs.push(left);
      break;
    }
    let n = prefer;
    const rem = left - n;
    if (rem === 1) n = prefer - 1; // leave 2+
    packs.push(n);
    left -= n;
  }
  return packs;
}

function trashPull(
  id: string,
  name: string,
  creatureEntry: number,
  count: number,
  events?: EncounterEvent[],
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'trash',
    creatureEntry,
  };
  if (count > 1) enc.pack = [{ creatureEntry, count: count - 1 }];
  if (events && events.length) enc.events = events;
  return enc;
}

/** Expand one census entry into ordered trash pulls (ids `${prefix}-0` …). */
function trashFromCensus(
  _prefix: string,
  _displayName: string,
  _creatureEntry: number,
  _total: number,
): EncounterDef[] {
  // DP1: cluster packs supply trash; hand spine keeps bosses/events only.
  return [];
}

// Boss spells: creature.spells from bake (game-data) - no invented ids.
const BOSS_SPELLS = {
  kirtonos: [18116, 20741, 18144, 6016, 12882, 8379, 16467, 17228, 12889, 14515],
  // SESSION 10 ScriptDev schedule owns Jandice / Gandling kits (cpp spell enums).
  jandice: [16098, 8994, 17773, 17774, 17772],
  rattlegore: [10101, 16727, 18116, 18368],
  marduk: [17228, 12040, 15284, 17695],
  vectus: [18399, 16046],
  ras: [18099, 8398, 12096, 18763, 18100, 11130],
  malicia: [11672, 12020, 18116, 17831, 18376, 8362, 13747, 17843, 15586],
  krastinov: [16509, 18103, 8269],
  polkelt: [16359, 3584, 18116, 18151, 18149, 8245],
  ravenian: [17963, 15550, 18670, 15584],
  lordAlexei: [11668, 11700, 18116, 17467, 17820],
  ladyIllucia: [18116, 19460, 6215, 15487, 12528, 17289, 18671, 12542, 14515],
  gandling: [15790, 12040, 18702, 17950],
} as const;

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'boss',
    creatureEntry,
  };
  if (bossSpells.length) enc.bossSpells = [...bossSpells];
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  return enc;
}

// Linear encounter graph: entrance porch → Kirtonos → Jandice → Rattlegore → Viewing Room →
// Ras → six mini-boss rooms in a stable author order → Darkmaster Gandling.
function buildHandSpine(): EncounterDef[] {
  // Entrance / porch band
  const acolytes = trashFromCensus('acolyte', 'Scholomance Acolyte', ENTRY.acolyte, STATIC.acolyte);
  const necrolytes = trashFromCensus(
    'necrolyte',
    'Scholomance Necrolyte',
    ENTRY.necrolyte,
    STATIC.necrolyte,
  );
  const neophytes = trashFromCensus(
    'neophyte',
    'Scholomance Neophyte',
    ENTRY.neophyte,
    STATIC.neophyte,
  );
  const risenGuards = trashFromCensus(
    'risen-guard',
    'Risen Guard',
    ENTRY.risenGuard,
    STATIC.risenGuard,
  );
  const bloodStewards = trashFromCensus(
    'blood-steward',
    'Blood Steward of Kirtonos',
    ENTRY.bloodSteward,
    STATIC.bloodSteward,
  );

  // Reliquary / Jandice wing
  const adepts = trashFromCensus('adept', 'Scholomance Adept', ENTRY.adept, STATIC.adept);
  const necromancers = trashFromCensus(
    'necromancer',
    'Scholomance Necromancer',
    ENTRY.necromancer,
    STATIC.necromancer,
  );
  const occultists = trashFromCensus(
    'occultist',
    'Scholomance Occultist',
    ENTRY.occultist,
    STATIC.occultist,
  );
  const darkSummoners = trashFromCensus(
    'dark-summoner',
    'Scholomance Dark Summoner',
    ENTRY.darkSummoner,
    STATIC.darkSummoner,
  );

  // Bone / Rattlegore / undead dens
  const aberrations = trashFromCensus(
    'aberration',
    'Risen Aberration',
    ENTRY.aberration,
    STATIC.aberration,
  );
  const reanimated = trashFromCensus(
    'reanimated-corpse',
    'Reanimated Corpse',
    ENTRY.reanimatedCorpse,
    STATIC.reanimatedCorpse,
  );
  const unstable = trashFromCensus(
    'unstable-corpse',
    'Unstable Corpse',
    ENTRY.unstableCorpse,
    STATIC.unstableCorpse,
  );
  const diseasedGhouls = trashFromCensus(
    'diseased-ghoul',
    'Diseased Ghoul',
    ENTRY.diseasedGhoul,
    STATIC.diseasedGhoul,
  );
  const constructs = trashFromCensus(
    'construct',
    'Risen Construct',
    ENTRY.construct,
    STATIC.construct,
  );
  const bonewarders = trashFromCensus(
    'bonewarder',
    'Risen Bonewarder',
    ENTRY.bonewarder,
    STATIC.bonewarder,
  );
  const protectors = trashFromCensus(
    'protector',
    'Risen Protector',
    ENTRY.protector,
    STATIC.protector,
  );
  const warriors = trashFromCensus('risen-warrior', 'Risen Warrior', ENTRY.warrior, STATIC.warrior);
  const splintered = trashFromCensus(
    'splintered-skeleton',
    'Splintered Skeleton',
    ENTRY.splinteredSkeleton,
    STATIC.splinteredSkeleton,
  );
  const necrofiends = trashFromCensus(
    'necrofiend',
    'Necrofiend',
    ENTRY.necrofiend,
    STATIC.necrofiend,
  );

  // Spectral / viewing / hatchling band
  const researchers = trashFromCensus(
    'spectral-researcher',
    'Spectral Researcher',
    ENTRY.researcher,
    STATIC.researcher,
  );
  const teachers = trashFromCensus(
    'spectral-teacher',
    'Spectral Teacher',
    ENTRY.teacher,
    STATIC.teacher,
  );
  const tutors = trashFromCensus('spectral-tutor', 'Spectral Tutor', ENTRY.tutor, STATIC.tutor);
  const hatchlings = trashFromCensus(
    'plagued-hatchling',
    'Plagued Hatchling',
    ENTRY.hatchling,
    STATIC.hatchling,
  );
  const handlers = trashFromCensus(
    'handler',
    'Scholomance Handler',
    ENTRY.handler,
    STATIC.handler,
  );

  const out: EncounterDef[] = [];

  // --- Entrance porch → Kirtonos (summon via Brazier + Blood of Innocents) ---
  out.push(
    ...acolytes.slice(0, Math.ceil(acolytes.length / 2)),
    ...neophytes.slice(0, Math.ceil(neophytes.length / 3)),
    ...risenGuards.slice(0, Math.ceil(risenGuards.length / 2)),
    ...bloodStewards,
  );

  // Brazier + Blood → porch gate locks 600s → +5s Kirtonos. Cite: dbscripts_on_go_use @OGUID+9.
  out.push({
    ...boss(
      SCHOLO_KIRTONOS.encId,
      'Kirtonos the Herald',
      ENTRY.kirtonos,
      BOSS_SPELLS.kirtonos,
      [
        {
          kind: 'objectGate',
          goEntry: SCHOLO_KIRTONOS.goEntry,
          requiredItem: SCHOLO_KIRTONOS.requiredItem,
          setsFlag: SCHOLOMANCE_FLAGS.kirtonosBrazier,
          once: true,
        },
        { kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.kirtonosBrazier },
        {
          kind: 'waves',
          waves: [{ pack: [{ creatureEntry: ENTRY.kirtonos, count: 1 }] }],
        },
      ],
      'The Brazier of the Herald accepts the Blood of Innocents - the porch Gate seals for 10 minutes and Kirtonos descends after 5 seconds.',
    ),
    origin: {
      x: SCHOLO_KIRTONOS.spawn.x,
      y: SCHOLO_KIRTONOS.spawn.y,
      z: SCHOLO_KIRTONOS.spawn.z,
    },
  });

  // --- → Jandice Barov ---
  out.push(
    ...necrolytes.slice(0, Math.ceil(necrolytes.length / 2)),
    ...adepts.slice(0, Math.ceil(adepts.length / 3)),
    ...occultists.slice(0, Math.ceil(occultists.length / 2)),
    ...neophytes.slice(Math.ceil(neophytes.length / 3), Math.ceil((2 * neophytes.length) / 3)),
  );

  out.push(
    boss(
      SCHOLO_JANDICE.encId,
      'Jandice Barov',
      ENTRY.jandice,
      BOSS_SPELLS.jandice,
      [
        // Cite: boss_jandice_barov.cpp:85-95 Summon Illusions 17773 (ScriptDev mid-fight).
        // Journal: 289_scholomance.sql dbscripts_on_creature_death 10503 → spell 26096 → GO 180794.
        { kind: 'setsFlag', flag: SCHOLOMANCE_FLAGS.jandiceDone },
      ],
      'Jandice Barov scatters into illusions mid-fight (Summon Illusions 17773). Her journal falls on death.',
    ),
  );

  // --- → Rattlegore (bone dens) ---
  out.push(
    ...aberrations.slice(0, Math.ceil(aberrations.length / 3)),
    ...reanimated.slice(0, Math.ceil(reanimated.length / 3)),
    ...diseasedGhouls.slice(0, Math.ceil(diseasedGhouls.length / 3)),
    ...constructs.slice(0, Math.ceil(constructs.length / 2)),
    ...splintered.slice(0, Math.ceil(splintered.length / 2)),
    ...bonewarders,
  );

  out.push(
    boss(
      'rattlegore',
      'Rattlegore',
      ENTRY.rattlegore,
      BOSS_SPELLS.rattlegore,
      // No setsFlag: the key is a real drop (13873, 100% on lootId 11622) and the door it opens is
      // the objectGate on marduk-blackpool. A flag would open the Viewing Room without the key.
      [],
      'Rattlegore, bone construct of the school, drops the Viewing Room Key.',
    ),
  );

  // --- Viewing Room → Dawn's Gambit students → Marduk + Vectus ---
  out.push(
    ...unstable.slice(0, Math.ceil(unstable.length / 2)),
    ...researchers.slice(0, Math.ceil(researchers.length / 2)),
    ...tutors.slice(0, Math.ceil(tutors.length / 2)),
    ...necrofiends,
    ...protectors,
  );

  // Dawn's Gambit: item 12368 at Spell Focus 176111 → 32× student combat pack.
  // Cite: instance_scholomance.cpp:440-469; survey 18-scholomance.md Dawn's Gambit row.
  {
    const n = SCHOLO_DAWN_GAMBIT.studentCount;
    const dawn: EncounterDef = {
      id: SCHOLO_DAWN_GAMBIT.encId,
      name: "Dawn's Gambit",
      kind: 'trash',
      creatureEntry: ENTRY.student,
      origin: { x: 133.69, y: 91.67, z: 101.73 }, // Cite: 289_scholomance.sql @OGUID+70 GO 176111
      intro:
        "Dawn's Gambit at the Viewing Room Spell Focus transforms the students - 32 Scholomance Students turn hostile.",
      // Summon (quest 4771 item gate); isComplete ignores optional.
      optional: true,
      events: [
        {
          kind: 'objectGate',
          goEntry: SCHOLO_DAWN_GAMBIT.goEntry,
          requiredItem: SCHOLO_DAWN_GAMBIT.requiredItem,
          setsFlag: SCHOLOMANCE_FLAGS.dawnGambit,
          once: true,
        },
        { kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.viewingRoomKey },
        { kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.dawnGambit },
      ],
    };
    if (n > 1) dawn.pack = [{ creatureEntry: ENTRY.student, count: n - 1 }];
    out.push(dawn);
  }

  out.push(
    boss(
      'marduk-blackpool',
      'Marduk Blackpool',
      ENTRY.marduk,
      BOSS_SPELLS.marduk,
      [
        // The Viewing Room Door is a real lock: GO 175167, lock 1199, LOCK_KEY_ITEM 13873 off
        // Rattlegore. Hosting the gate here puts the key in a bag and spends it on the door.
        {
          kind: 'objectGate',
          goEntry: SCHOLO_VIEWING_ROOM.goEntry,
          requiredItem: SCHOLO_VIEWING_ROOM.requiredItem,
          setsFlag: SCHOLOMANCE_FLAGS.viewingRoomKey,
          once: true,
        },
        { kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.viewingRoomKey },
      ],
      'Marduk Blackpool waits in the Viewing Room beside Vectus.',
    ),
  );

  out.push(
    boss(
      'vectus',
      'Vectus',
      ENTRY.vectus,
      BOSS_SPELLS.vectus,
      [{ kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.viewingRoomKey }],
      // Cite: instance_scholomance.cpp:462-468 Vectus/Marduk flip + YELL_VECTUS_GAMBIT on gambit.
      'Vectus, plague dragon instructor - Dawn\'s Gambit (quest 4771) arms the student ambush first.',
    ),
  );

  // --- → Ras Frostwhisper ---
  out.push(
    ...hatchlings.slice(0, Math.ceil(hatchlings.length / 2)),
    ...handlers.slice(0, Math.ceil(handlers.length / 2)),
    ...teachers,
    ...constructs.slice(Math.ceil(constructs.length / 2)),
    ...warriors,
  );

  out.push(
    boss(
      SCHOLO_RAS_KEEPSAKE.encId,
      'Ras Frostwhisper',
      ENTRY.ras,
      BOSS_SPELLS.ras,
      undefined,
      // Cite: survey 18-scholomance.md; ACID 1050803; SCHOLO_RAS_KEEPSAKE residual mortality flip.
      'Ras Frostwhisper, the lich of Scholomance. Soulbound Keepsake (13752) forces his mortal form for the head quest.',
    ),
  );

  // --- Six mini-boss rooms (classic any-order; stable author order) --- Survey: Malicia, Theolen
  // Krastinov, Polkelt, Ravenian, Lord Alexei, Lady Illucia. Each setsFlag; Gandling requires all six.

  out.push(
    ...adepts.slice(Math.ceil(adepts.length / 3), Math.ceil((2 * adepts.length) / 3)),
    ...necromancers.slice(0, Math.ceil(necromancers.length / 3)),
    ...acolytes.slice(Math.ceil(acolytes.length / 2)),
  );

  out.push(
    boss(
      'instructor-malicia',
      'Instructor Malicia',
      ENTRY.malicia,
      BOSS_SPELLS.malicia,
      [{ kind: 'setsFlag', flag: SCHOLOMANCE_FLAGS.maliciaDone }],
      'Instructor Malicia teaches dark arts in her classroom.',
    ),
  );

  out.push(
    ...diseasedGhouls.slice(
      Math.ceil(diseasedGhouls.length / 3),
      Math.ceil((2 * diseasedGhouls.length) / 3),
    ),
    ...aberrations.slice(
      Math.ceil(aberrations.length / 3),
      Math.ceil((2 * aberrations.length) / 3),
    ),
    ...risenGuards.slice(Math.ceil(risenGuards.length / 2)),
  );

  out.push(
    boss(
      'doctor-theolen-krastinov',
      'Doctor Theolen Krastinov',
      ENTRY.krastinov,
      BOSS_SPELLS.krastinov,
      [{ kind: 'setsFlag', flag: SCHOLOMANCE_FLAGS.krastinovDone }],
      'Doctor Theolen Krastinov, the Butcher, haunts the surgery.',
    ),
  );

  out.push(
    ...neophytes.slice(Math.ceil((2 * neophytes.length) / 3)),
    ...darkSummoners.slice(0, Math.ceil(darkSummoners.length / 2)),
    ...occultists.slice(Math.ceil(occultists.length / 2)),
  );

  out.push(
    boss(
      'lorekeeper-polkelt',
      'Lorekeeper Polkelt',
      ENTRY.polkelt,
      BOSS_SPELLS.polkelt,
      [{ kind: 'setsFlag', flag: SCHOLOMANCE_FLAGS.polkeltDone }],
      'Lorekeeper Polkelt guards forbidden tomes in the library wing.',
    ),
  );

  out.push(
    ...reanimated.slice(
      Math.ceil(reanimated.length / 3),
      Math.ceil((2 * reanimated.length) / 3),
    ),
    ...unstable.slice(Math.ceil(unstable.length / 2)),
    ...splintered.slice(Math.ceil(splintered.length / 2)),
  );

  out.push(
    boss(
      'the-ravenian',
      'The Ravenian',
      ENTRY.ravenian,
      BOSS_SPELLS.ravenian,
      [{ kind: 'setsFlag', flag: SCHOLOMANCE_FLAGS.ravenianDone }],
      // Wave V: EventAI overlay boss-eventai.ts (1050701 AGGRO SET_PHASE→1, phase-masked casts).
      'The Ravenian, a massive undead brute, holds one of the six classrooms.',
    ),
  );

  out.push(
    ...necromancers.slice(
      Math.ceil(necromancers.length / 3),
      Math.ceil((2 * necromancers.length) / 3),
    ),
    ...handlers.slice(Math.ceil(handlers.length / 2)),
    ...necrolytes.slice(Math.ceil(necrolytes.length / 2)),
  );

  out.push(
    boss(
      'lord-alexei-barov',
      'Lord Alexei Barov',
      ENTRY.lordAlexei,
      BOSS_SPELLS.lordAlexei,
      [{ kind: 'setsFlag', flag: SCHOLOMANCE_FLAGS.lordAlexeiDone }],
      'Lord Alexei Barov, spectral patriarch, bars the family vault.',
    ),
  );

  out.push(
    ...researchers.slice(Math.ceil(researchers.length / 2)),
    ...tutors.slice(Math.ceil(tutors.length / 2)),
    ...hatchlings.slice(Math.ceil(hatchlings.length / 2)),
    ...darkSummoners.slice(Math.ceil(darkSummoners.length / 2)),
  );

  out.push(
    boss(
      'lady-illucia-barov',
      'Lady Illucia Barov',
      ENTRY.ladyIllucia,
      BOSS_SPELLS.ladyIllucia,
      [{ kind: 'setsFlag', flag: SCHOLOMANCE_FLAGS.ladyIlluciaDone }],
      'Lady Illucia Barov completes the six classroom guardians.',
    ),
  );

  // Residual trash before Gandling
  out.push(
    ...adepts.slice(Math.ceil((2 * adepts.length) / 3)),
    ...necromancers.slice(Math.ceil((2 * necromancers.length) / 3)),
    ...aberrations.slice(Math.ceil((2 * aberrations.length) / 3)),
    ...reanimated.slice(Math.ceil((2 * reanimated.length) / 3)),
    ...diseasedGhouls.slice(Math.ceil((2 * diseasedGhouls.length) / 3)),
  );

  // --- Darkmaster Gandling (summon-only after all 6 mini-bosses) ---
  // Timed portal rooms (first @18s, then 20s min) then the finale. Residual: teleport + gates.
  out.push({
    id: SCHOLO_GANDLING.encId,
    name: 'Darkmaster Gandling',
    kind: 'boss',
    creatureEntry: ENTRY.gandling,
    bossSpells: [...BOSS_SPELLS.gandling],
    intro:
      'With the six classroom masters slain, Shadow Portal rooms open on Gandling\'s 16s/20–35s schedule - then Darkmaster Gandling himself.',
    events: [
      { kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.maliciaDone },
      { kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.krastinovDone },
      { kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.polkeltDone },
      { kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.ravenianDone },
      { kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.lordAlexeiDone },
      { kind: 'requiresFlag', flag: SCHOLOMANCE_FLAGS.ladyIlluciaDone },
      {
        kind: 'waves',
        waves: SCHOLO_GANDLING_WAVES.map((w) => ({
          pack: w.pack.map((p) => ({ creatureEntry: p.creatureEntry, count: p.count })),
        })),
      },
    ],
  });

  return out;
}

// The entrance room as the SOURCE defines it, box copied literally from scholomance.h:127
// `aEntranceRoom = { 174.13, 63.84, 104.0, 54, 44 }` — no lower x/y bound there, none here.
const SCHOLO_ENTRANCE_ROOM = {
  cornerX: 174.13,
  cornerY: 63.84,
  centerZ: 104.0,
  length: 54,
  width: 44,
  entries: [ENTRY.reanimatedCorpse, ENTRY.diseasedGhoul, ENTRY.aberration] as readonly number[],
  // The room's patrolling necrofiend: cpp:117 keeps it out of m_sEntranceRoomGuids and cpp:151-154
  // respawns one regardless, so it is in the room but not the stored set. Taken by guid.
  necrofiend: 2890390,
} as const;

/** probe-pack-zspread.mjs:22 grades a pull as straddling above this many yards of z. */
const PACK_STRADDLE_YD = 10;

// Split entrance-room members off the pulls that straddle a floor to reach them: the clusterer is
// planar and 31 of 49 packs straddle, worst 43.1 yd. Only real straddlers move; no body is lost.
function stampEntranceRoomExtract(encs: EncounterDef[]): EncounterDef[] {
  const members = clusterMemberByGuid(289);
  const pools = loadPoolGuidCandidates(289);
  const R = SCHOLO_ENTRANCE_ROOM;
  const roomEntries = new Set(R.entries);
  // A CSE slot carries entry 0 until it rolls. It belongs to the room only when EVERY entry it
  // can roll does — guids 2890215/216/221/222 roll 10481 or 10495, both room entries.
  const isRoomEntry = (guid: number, entry: number): boolean => {
    if (guid === R.necrofiend) return true;
    if (entry !== 0) return roomEntries.has(entry);
    const cands = pools.get(guid) ?? [];
    return cands.length > 0 && cands.every((e) => roomEntries.has(e));
  };
  const inRoom = (guid: number): boolean => {
    const m = members.get(guid);
    return !!m
      && isRoomEntry(guid, m.entry)
      && (m.z ?? -Infinity) > R.centerZ
      && m.x - R.cornerX < R.length
      && m.y - R.cornerY < R.width;
  };
  const zSpread = (guids: readonly number[]): number => {
    const zs = guids
      .map((g) => members.get(g)?.z)
      .filter((z): z is number => z != null && Number.isFinite(z));
    return zs.length ? Math.max(...zs) - Math.min(...zs) : 0;
  };

  const out: EncounterDef[] = [];
  let n = 0;
  for (const e of encs) {
    const guids = e.spawnGuids ?? [];
    if (e.kind !== 'trash' || guids.length < 2 || zSpread(guids) <= PACK_STRADDLE_YD) {
      out.push(e);
      continue;
    }
    const room = guids.filter(inRoom);
    const rest = guids.filter((g) => !inRoom(g));
    if (!room.length || !rest.length) {
      out.push(e);
      continue;
    }
    out.push(repackFromGuids(e, room, members, {
      id: `scholo-entrance-room-${n}`,
      name: 'Entrance room',
      pools,
    }));
    n += 1;
    // The remainder keeps the clusterer's pack identity, and its events with it.
    out.push(repackFromGuids(e, rest, members, {
      events: e.events ? [...e.events] : undefined,
      pools,
    }));
  }
  return out;
}

// The two Risen Guards `creature_linking` binds to Lord Alexei Barov with flag 7 — they aggro when
// he does and he when they do, so they are his encounter, not trash. Cite: 289_scholomance.sql:252.
const SCHOLO_BAROV_GUARDS = {
  bossId: 'lord-alexei-barov',
  guids: [2890289, 2890290] as readonly number[],
} as const;

// Move Barov's linked guards out of trash and onto his encounter: the clusterer put each in a pull
// whose origin sits a floor above them. Both pulls drop to a 9.8 yd spread; no body is lost.
function stampBarovGuards(encs: EncounterDef[]): EncounterDef[] {
  const members = clusterMemberByGuid(289);
  const pools = loadPoolGuidCandidates(289);
  const want = new Set(SCHOLO_BAROV_GUARDS.guids);
  const moved: number[] = [];
  const out: EncounterDef[] = [];
  for (const e of encs) {
    const guids = e.spawnGuids ?? [];
    if (e.kind !== 'trash' || !guids.some((g) => want.has(g))) {
      out.push(e);
      continue;
    }
    moved.push(...guids.filter((g) => want.has(g)));
    const keep = guids.filter((g) => !want.has(g));
    if (keep.length) {
      out.push(repackFromGuids(e, keep, members, {
        events: e.events ? [...e.events] : undefined,
        pools,
      }));
    }
  }
  if (!moved.length) return encs;
  return out.map((e) => {
    if (e.id !== SCHOLO_BAROV_GUARDS.bossId) return e;
    const pack = (e.pack ?? []).map((p) => ({ ...p }));
    for (const g of moved) {
      const entry = members.get(g)?.entry;
      if (!entry) continue;
      const row = pack.find((p) => p.creatureEntry === entry && !p.poolCandidates);
      if (row) row.count += 1;
      else pack.push({ creatureEntry: entry, count: 1 });
    }
    return { ...e, spawnGuids: [...(e.spawnGuids ?? []), ...moved], pack };
  });
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  const encs = buildClusterEncounters({
    mapId: 289,
    spine,
    entrance: entranceForInstance('scholomance'),
    extraStrip: [
      ...SCHOLOMANCE_EXCLUDED_ENTRIES,
      ...SCHOLOMANCE_SUMMON_ONLY_ENTRIES,
      ENTRY.student, // event-only via dawn-gambit pack
    ],
  });
  return stampBarovGuards(stampEntranceRoomExtract(encs));
}


// Survey quests completable inside map 289. No Lord Blackwood / Scourge Invasion quests in the survey list.
export const SCHOLOMANCE_QUESTS = [
  5067, // Leggings of Arcana
  8414, // Dispelling Evil
  5402, // Minion's Scourgestones
  5403, // Invader's Scourgestones
  5404, // Corruptor's Scourgestones
  5406, // Corruptor's Scourgestones
  5407, // Invader's Scourgestones
  5408, // Minion's Scourgestones
  5508, // Corruptor's Scourgestones
  5509, // Invader's Scourgestones
  5510, // Minion's Scourgestones
  5529, // Plagued Hatchlings
  5582, // Healthy Dragon Scale
  4771, // Dawn's Gambit
  5068, // Breastplate of Bloodthirst
  5167, // Legplates of the Chromatic Defier
  5341, // Barov Family Fortune (H)
  5343, // Barov Family Fortune (A)
  5382, // Doctor Theolen Krastinov, the Butcher
  5466, // The Lich, Ras Frostwhisper
  5515, // Krastinov's Bag of Horrors
  7484, // Libram of Focus
  7644, // Blessed Arcanite Barding
  7647, // Judgment and Redemption
  8829, // The Ultimate Deception
  8932, // Just Compensation (A Magister's)
  8936, // Just Compensation (A Dreadmist)
  8939, // Just Compensation (H Magister's)
  8943, // Just Compensation (H Dreadmist)
  8950, // The Instigator's Enchantment
  8956, // Anthion's Parting Words (A Shadowcraft)
  8958, // Anthion's Parting Words (A Dreadmist)
  9020, // Anthion's Parting Words (H Shadowcraft)
  9021, // Anthion's Parting Words (H Dreadmist)
  9319, // A Light in Dark Places (A)
  9386, // A Light in Dark Places (H)
] as const;

/** Export static census constants for tests (entry → count). */
export const SCHOLOMANCE_STATIC: Readonly<Record<number, number>> = {
  [ENTRY.risenGuard]: STATIC.risenGuard,
  [ENTRY.acolyte]: STATIC.acolyte,
  [ENTRY.necrolyte]: STATIC.necrolyte,
  [ENTRY.neophyte]: STATIC.neophyte,
  [ENTRY.diseasedGhoul]: STATIC.diseasedGhoul,
  [ENTRY.necrofiend]: STATIC.necrofiend,
  [ENTRY.bonewarder]: STATIC.bonewarder,
  [ENTRY.construct]: STATIC.construct,
  [ENTRY.protector]: STATIC.protector,
  [ENTRY.adept]: STATIC.adept,
  [ENTRY.darkSummoner]: STATIC.darkSummoner,
  [ENTRY.necromancer]: STATIC.necromancer,
  [ENTRY.occultist]: STATIC.occultist,
  [ENTRY.researcher]: STATIC.researcher,
  [ENTRY.teacher]: STATIC.teacher,
  [ENTRY.tutor]: STATIC.tutor,
  [ENTRY.warrior]: STATIC.warrior,
  [ENTRY.handler]: STATIC.handler,
  [ENTRY.splinteredSkeleton]: STATIC.splinteredSkeleton,
  [ENTRY.bloodSteward]: STATIC.bloodSteward,
  [ENTRY.hatchling]: STATIC.hatchling,
  [ENTRY.aberration]: STATIC.aberration,
  [ENTRY.reanimatedCorpse]: STATIC.reanimatedCorpse,
  [ENTRY.unstableCorpse]: STATIC.unstableCorpse,
};

export const SCHOLOMANCE: InstanceDef = {
  id: 'scholomance',
  mapId: 289,
  name: 'Scholomance',
  portalZone: 'westernplaguelands',
  minLevel: 45, // entrance trigger 2567 requiredLevel
  levelRange: [57, 61], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...SCHOLOMANCE_QUESTS],
  encounters: buildEncounters(),
  lootObjects: [
    // Journal of Jandice Barov — death-spawn via 26096. Residual: no map-289 dungeon GO row.
    // Cite: 289_scholomance.sql dbscripts_on_creature_death 10503; gameobject-data 180794.
    { goEntry: SCHOLO_JANDICE.journalGo, revealedByFlag: SCHOLOMANCE_FLAGS.jandiceDone },
  ],
};

// Counts only pure static trash packs (no bosses, no flag-gated viewing-room packs). Used to assert census
// match and summon-only / excluded entry absence.
export function scholomancePureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SCHOLOMANCE.encounters) {
    if (enc.kind !== 'trash') continue;
    const req = (enc.events ?? []).some(
      (e) => e.kind === 'requiresFlag' || e.kind === 'objectGate' || e.kind === 'waves',
    );
    if (req) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** Sum of authored kill counts per creature entry (trash + bosses + wave/threshold packs). */
export function scholomanceKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SCHOLOMANCE.encounters) {
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
    for (const ev of enc.events ?? []) {
      if (ev.kind === 'onDeathSummon') add(ev.creatureEntry, 1);
      if (ev.kind === 'waves') {
        for (const w of ev.waves) {
          for (const row of w.pack) add(row.creatureEntry, row.count);
        }
      }
      if (ev.kind === 'hpThreshold' && ev.spawn) {
        for (const row of ev.spawn) add(row.creatureEntry, row.count);
      }
    }
  }
  // Subtract wave rows that re-count the primary (Gandling final wave).
  for (const enc of SCHOLOMANCE.encounters) {
    const waves = (enc.events ?? []).find((e) => e.kind === 'waves');
    if (!waves || waves.kind !== 'waves') continue;
    for (const w of waves.waves) {
      for (const row of w.pack) {
        if (row.creatureEntry === enc.creatureEntry) add(row.creatureEntry, -row.count);
      }
    }
  }
  return map;
}
