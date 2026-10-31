// Razorfen Downs (map 129) — InstanceDef graph. Authority: docs/dungeons/survey/10-razorfen-downs.md.
// No strip list: cluster packing class-gates the five friendly-to-all entries to zero encounters.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
} from './pack-from-clusters.ts';
import { registerEscortDef, type EscortDef, type EscortWaypoint } from '../../world/escort.ts';

// ---- Census static counts (map 129; survey creature census static column) ----
// Bosses are not trash, and 7355/7356, gong waves 7349/7351 and Amnennar adds 8585 are summon-only.

const STATIC = {
  spearhide: 7, // 7332 Withered Spearhide
  warrior: 5, // 7327 Withered Warrior
  geomancer: 5, // 7335 Death's Head Geomancer
  quilguard: 18, // 7329 Withered Quilguard
  reaver: 11, // 7328 Withered Reaver
  necromancer: 10, // 7337 Death's Head Necromancer
  frozenSoul: 8, // 7352 Frozen Soul
  frostweaver: 6, // 7341 Skeletal Frostweaver
  thornEater: 11, // 7348 Thorn Eater Ghoul
  boneflayer: 17, // 7347 Boneflayer Ghoul
  freezingSpirit: 7, // 7353 Freezing Spirit
  summoner: 6, // 7342 Skeletal Summoner
  captain: 2, // 7345 Splinterbone Captain
  battleBoar: 8, // 7333 Withered Battle Boar
  skeleton: 28, // 7343 Splinterbone Skeleton
  battleBoarHorror: 2, // 7334 Battle Boar Horror
  splinterWarrior: 19, // 7344 Splinterbone Warrior
  centurion: 30, // 7346 Splinterbone Centurion
} as const;

const ENTRY = {
  spearhide: 7332,
  warrior: 7327,
  geomancer: 7335,
  quilguard: 7329,
  reaver: 7328,
  necromancer: 7337,
  frozenSoul: 7352,
  frostweaver: 7341,
  thornEater: 7348,
  boneflayer: 7347,
  freezingSpirit: 7353,
  summoner: 7342,
  captain: 7345,
  battleBoar: 7333,
  skeleton: 7343,
  battleBoarHorror: 7334,
  splinterWarrior: 7344,
  centurion: 7346,
  // Bosses (canonical survey order)
  tutenkash: 7355, // summon-only - gong wave 3
  ragglesnout: 7354, // pool 45901@30% roll (rareRoll.ts)
  mordresh: 7357,
  glutton: 8567,
  plaguemaw: 7356, // summon-only - Belnistrasz ritual finale
  amnennar: 7358,
  // Gong wave summon-only (0 static).
  // GAP: 7349/7351 not present in game-data creatures bake yet - survey ids still wired.
  tombFiend: 7349,
  tombReaver: 7351,
  // Amnennar HP-add summon-only. Wave V: template stub in boss-eventai.ts (creature_template 8585).
  frostSpectre: 8585,
} as const;

/** Flags from survey event choreography / instance_razorfen_downs.cpp. */
export const RFD_FLAGS = {
  /** Gong GO 148917 used - unlocks Tuten'kash wave encounter. */
  gong: 'rfd-gong-1',
  /** Plaguemaw / Belnistrasz ritual clear. Cite: razorfen_downs.cpp ritual phase 10. */
  belnistraszRitualDone: 'rfd-belnistrasz-ritual-done',
  /** Amnennar death. Cite: quest 3341/3636 Coldbringer kill credit. */
  amnennarDone: 'rfd-amnennar-done',
} as const;

// Amnennar the Coldbringer 7358 — HP spectres at 66% and 33%. Cite: EventAI 735808/735807 SPAWN×3
// of 8585; spell 12642 → 3× 8585; survey 10-razorfen-downs.md §3.

export const AMNENNAR = {
  encId: 'amnennar',
  entry: ENTRY.amnennar, // 7358
  frostSpectreEntry: ENTRY.frostSpectre, // 8585
  /** spell_template 12642 Summon Frost Spectres → 3×8585. */
  spellSummonSpectres: 12642,
  /** Spectres per cast. Cite: spell 12642 Effect1 + triggers 12670/12671. */
  spectresPerCast: 3,
  /** EventAI 735808 HP≤66%. */
  firstSpectreHpPct: 66,
  /** EventAI 735807 HP≤33%. */
  secondSpectreHpPct: 33,
  /** Bake combat kit (also 12642 summon — modeled via hpThreshold). */
  spellFrostNova: 15531,
  spellAmnennarsWrath: 13009,
  spellFrostbolt: 15530,
} as const;

// Pure: how many spectre casts fire at this HP% given already-fired set. Cite: EventAI one-shot at 66 then
// 33 as HP drops.
export function amnennarSpectreCastsAtHp(args: {
  hpPct: number;
  fired66: boolean;
  fired33: boolean;
}): { fire66: boolean; fire33: boolean; spectreCount: number } {
  let fire66 = false;
  let fire33 = false;
  if (!args.fired66 && args.hpPct <= AMNENNAR.firstSpectreHpPct) fire66 = true;
  if (!args.fired33 && args.hpPct <= AMNENNAR.secondSpectreHpPct) fire33 = true;
  const casts = (fire66 ? 1 : 0) + (fire33 ? 1 : 0);
  return {
    fire66,
    fire33,
    spectreCount: casts * AMNENNAR.spectresPerCast,
  };
}

// Pure: encounter credit only when Amnennar himself is dead — not when spectres die. Negative: bossAlive +
// allSpectresDead → false.
export function amnennarCanCredit(args: {
  bossDead: boolean;
  /** Optional; spectres do not gate credit. */
  spectresAlive?: number;
}): boolean {
  return args.bossDead === true;
}

// Belnistrasz idol ritual — 5 trash waves plus Plaguemaw; do not rebuild the wave chain, since the
// InstanceDef already has six player-paced waves. Cite: razorfen_downs.cpp:122-254.

export const BELNISTRAZ_RITUAL = {
  encId: 'belnistrasz-ritual',
  questId: 3525,
  npcEntry: 8516,
  plaguemawEntry: ENTRY.plaguemaw, // 7356
  /** Idol Shutdown. Cite: razorfen_downs.cpp:65 SPELL_IDOL_SHUTDOWN */
  spellIdolShutdown: 12774,
  /** Idol Room Shake. Cite: razorfen_downs.cpp:66 SPELL_IDOL_ROOM_SHAKE */
  spellIdolRoomShake: 12816,
  /** Brazier turn-in GO. Cite: razorfen_downs.cpp:57 GO_BELNISTRASZ_BRAZIER */
  brazierGo: 152097,
  /** Escort WP that starts ritual. Cite: razorfen_downs.cpp:169 */
  ritualWaypoint: 24,
  /** Player-paced trash waves before Plaguemaw (survey: 5 = RFD_RITUAL_TRASH_WAVES). */
  trashWaveCount: 5,
  /** Mobs per trash wave: 2 boar + 1 quilguard + 1 geomancer. Cite: cpp:130-154 */
  trashPackSize: 4,
  // Ritual phase arm durations (ms) after each phase fires. Cite: razorfen_downs.cpp:184-254; ctor
  // m_uiRitualTimer=1000.
  phaseTimersMs: [
    1_000, // 0 → shutdown then 1s
    39_000, // 1 summon
    20_000, // 2 summon
    20_000, // 3 yell 3min
    40_000, // 4 summon
    40_000, // 5 summon + 2min
    20_000, // 6 summon
    40_000, // 7 yell 1min
    20_000, // 8 summon (Plaguemaw path when phase>7)
    3_000, // 9 finish yell
    0, // 10 credit
  ] as const,
} as const;

// Pure: cumulative ritual elapsed ms to the start of phase `phase` (0-based). The initial arm is
// 1000 ms before phase 0, so time to enter phase N is the sum of prior arms. Cite: :88, :180-257.
export function belnistraszRitualElapsedToPhase(phase: number): number {
  // ctor arms 1000 before first case fires
  let t = 1_000;
  for (let i = 0; i < phase && i < BELNISTRAZ_RITUAL.phaseTimersMs.length; i++) {
    t += BELNISTRAZ_RITUAL.phaseTimersMs[i]!;
  }
  return t;
}

// Pure: whether phase `phase` is a spawner summon step (trash while phase≤7, Plaguemaw when >7). Cite:
// razorfen_downs.cpp:122-128 SpawnerSummon; cases 1,2,4,5,6,8 summon.
export function belnistraszPhaseSummonsSpawner(phase: number): boolean {
  return phase === 1 || phase === 2 || phase === 4 || phase === 5 || phase === 6 || phase === 8;
}

/** Gong of the Earthrager GO 148917 - survey Tuten'kash gong waves. */
export const RFD_GONG = {
  goEntry: 148917,
  /** Survey aWaveSummonInformation / DoSpawnWaveIfCan. */
  waves: [
    { entry: 7349, count: 8, name: 'Tomb Fiend' },
    { entry: 7351, count: 4, name: 'Tomb Reaver' },
    { entry: 7355, count: 1, name: "Tuten'kash" },
  ] as const,
} as const;

// Belnistrasz idol ritual trash wave composition (survey phases 1/2/4/5/6). Real CMaNGOS timers are
// ~4 min; the Wave-1 DSL has no delay fields, so this is degraded to player-paced waves.
export const RFD_RITUAL_WAVE_PACK = [
  { creatureEntry: ENTRY.battleBoar, count: 2 }, // 7333
  { creatureEntry: ENTRY.quilguard, count: 1 }, // 7329
  { creatureEntry: ENTRY.geomancer, count: 1 }, // 7335
] as const;

/** Number of trash waves before Plaguemaw (survey: 5 waves, 20 mobs). */
export const RFD_RITUAL_TRASH_WAVES = 5;

// Pure: trash pack composition while ritualPhase ≤ 7; Plaguemaw when > 7. Cite: razorfen_downs.cpp:122-128.
export function belnistraszSpawnerPack(ritualPhase: number): readonly { creatureEntry: number; count: number }[] {
  if (ritualPhase > 7) {
    return [{ creatureEntry: ENTRY.plaguemaw, count: 1 }];
  }
  return RFD_RITUAL_WAVE_PACK;
}

// Belnistrasz (8516) script_waypoint path for quest 3525, points 1–25 with WaitTime all 0. Credit
// lands on WP24 arrival; the ritual timers stay in the belnistrasz-ritual waves encounter.
export const BELNISTRAZ_WAYPOINTS: readonly EscortWaypoint[] = [
  { point: 1, x: 2603.18, y: 725.259, z: 54.6927 },
  { point: 2, x: 2587.13, y: 734.392, z: 55.231 },
  { point: 3, x: 2570.69, y: 753.572, z: 54.5855 },
  { point: 4, x: 2558.51, y: 747.66, z: 54.4482 },
  { point: 5, x: 2544.23, y: 772.924, z: 47.9255 },
  { point: 6, x: 2530.08, y: 797.475, z: 45.97 },
  { point: 7, x: 2521.83, y: 799.127, z: 44.3061 },
  { point: 8, x: 2502.61, y: 789.222, z: 39.5074 },
  { point: 9, x: 2495.25, y: 789.406, z: 39.499 },
  { point: 10, x: 2488.07, y: 802.455, z: 42.9834 },
  { point: 11, x: 2486.64, y: 826.649, z: 43.6363 },
  { point: 12, x: 2492.64, y: 835.166, z: 45.1427 },
  { point: 13, x: 2505.02, y: 847.564, z: 47.6487 },
  { point: 14, x: 2538.96, y: 877.362, z: 47.6781 },
  { point: 15, x: 2546.07, y: 885.672, z: 47.6789 },
  { point: 16, x: 2548.02, y: 897.584, z: 47.7277 },
  { point: 17, x: 2544.29, y: 909.116, z: 46.2506 },
  { point: 18, x: 2523.6, y: 920.306, z: 45.8717 },
  { point: 19, x: 2522.69, y: 933.546, z: 47.5769 },
  { point: 20, x: 2531.63, y: 959.893, z: 49.4111 },
  { point: 21, x: 2540.23, y: 973.338, z: 50.1241 },
  { point: 22, x: 2547.21, y: 977.489, z: 49.9759 },
  { point: 23, x: 2558.75, y: 969.243, z: 50.7353 },
  { point: 24, x: 2575.6, y: 950.138, z: 52.846 },
  { point: 25, x: 2575.6, y: 950.138, z: 52.846 },
] as const;

/** Full escort def for quest 3525 — registered at module load. */
export const BELNISTRAZ_ESCORT: EscortDef = {
  id: 'belnistrasz-3525',
  questId: 3525,
  npcEntry: 8516,
  mapId: 129,
  instanceId: 'razorfen-downs',
  waypoints: BELNISTRAZ_WAYPOINTS,
  creditPoint: 24,
  maxPartyDistYd: 50,
};

registerEscortDef(BELNISTRAZ_ESCORT);

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
// Amnennar 12642 Summon Frost Spectres is modeled as hpThreshold spawns (omit from rotation).
const BOSS_SPELLS = {
  tutenkash: [12255, 12252, 12254],
  ragglesnout: [10892, 11659, 7645, 12039, 11639, 12471],
  mordresh: [12466, 12470],
  glutton: [16345, 8876, 12627, 12795, 12787],
  plaguemaw: [12947, 12946],
  // bake also has 12642 - HP-add summon modeled via thresholds below
  amnennar: [15531, 13009, 15530],
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

// Linear encounter graph: entrance trash → bosses in survey order with inter-boss trash, gong waves
// → Tuten'kash, Belnistrasz ritual → Plaguemaw, Amnennar HP spectres. Static entries → packs of 2–5.
function buildHandSpine(): EncounterDef[] {
  const spearhides = trashFromCensus('spearhide', 'Withered Spearhide', ENTRY.spearhide, STATIC.spearhide);
  const warriors = trashFromCensus('withered-warrior', 'Withered Warrior', ENTRY.warrior, STATIC.warrior);
  const geomancers = trashFromCensus(
    'geomancer',
    "Death's Head Geomancer",
    ENTRY.geomancer,
    STATIC.geomancer,
  );
  const quilguards = trashFromCensus('quilguard', 'Withered Quilguard', ENTRY.quilguard, STATIC.quilguard);
  const reavers = trashFromCensus('withered-reaver', 'Withered Reaver', ENTRY.reaver, STATIC.reaver);
  const necromancers = trashFromCensus(
    'necromancer',
    "Death's Head Necromancer",
    ENTRY.necromancer,
    STATIC.necromancer,
  );
  const frozenSouls = trashFromCensus('frozen-soul', 'Frozen Soul', ENTRY.frozenSoul, STATIC.frozenSoul);
  const frostweavers = trashFromCensus(
    'frostweaver',
    'Skeletal Frostweaver',
    ENTRY.frostweaver,
    STATIC.frostweaver,
  );
  const thornEaters = trashFromCensus(
    'thorn-eater',
    'Thorn Eater Ghoul',
    ENTRY.thornEater,
    STATIC.thornEater,
  );
  const boneflayers = trashFromCensus(
    'boneflayer',
    'Boneflayer Ghoul',
    ENTRY.boneflayer,
    STATIC.boneflayer,
  );
  const freezingSpirits = trashFromCensus(
    'freezing-spirit',
    'Freezing Spirit',
    ENTRY.freezingSpirit,
    STATIC.freezingSpirit,
  );
  const summoners = trashFromCensus('summoner', 'Skeletal Summoner', ENTRY.summoner, STATIC.summoner);
  const captains = trashFromCensus(
    'splinterbone-captain',
    'Splinterbone Captain',
    ENTRY.captain,
    STATIC.captain,
  );
  const battleBoars = trashFromCensus(
    'battle-boar',
    'Withered Battle Boar',
    ENTRY.battleBoar,
    STATIC.battleBoar,
  );
  const skeletons = trashFromCensus(
    'splinterbone-skeleton',
    'Splinterbone Skeleton',
    ENTRY.skeleton,
    STATIC.skeleton,
  );
  const boarHorrors = trashFromCensus(
    'battle-boar-horror',
    'Battle Boar Horror',
    ENTRY.battleBoarHorror,
    STATIC.battleBoarHorror,
  );
  const splinterWarriors = trashFromCensus(
    'splinterbone-warrior',
    'Splinterbone Warrior',
    ENTRY.splinterWarrior,
    STATIC.splinterWarrior,
  );
  const centurions = trashFromCensus(
    'centurion',
    'Splinterbone Centurion',
    ENTRY.centurion,
    STATIC.centurion,
  );

  const out: EncounterDef[] = [];

  // --- Entrance downs → Tuten'kash gong ---
  // Withered quilboar band + early undead near the gong corridor.
  out.push(
    ...spearhides,
    ...warriors,
    ...quilguards.slice(0, Math.ceil(quilguards.length / 2)),
    ...reavers.slice(0, Math.ceil(reavers.length / 2)),
    ...battleBoars.slice(0, Math.ceil(battleBoars.length / 2)),
    ...geomancers.slice(0, Math.ceil(geomancers.length / 2)),
  );

  // --- Tuten'kash gong (player-paced waves via GO 148917) ---
  // Survey: 3 gong uses, each gated on the prior wave dead — 8×7349, 4×7351, 1×7355. once:false.
  out.push(
    boss(
      'tutenkash-gong',
      "Tuten'kash",
      ENTRY.tutenkash,
      BOSS_SPELLS.tutenkash,
      [
        {
          kind: 'objectGate',
          goEntry: RFD_GONG.goEntry,
          once: false,
          setsFlag: RFD_FLAGS.gong,
        },
        { kind: 'requiresFlag', flag: RFD_FLAGS.gong },
        {
          kind: 'waves',
          waves: [
            { pack: [{ creatureEntry: ENTRY.tombFiend, count: 8 }] },
            { pack: [{ creatureEntry: ENTRY.tombReaver, count: 4 }] },
            { pack: [{ creatureEntry: ENTRY.tutenkash, count: 1 }] },
          ],
        },
      ],
      "The Gong of the Earthrager calls the dead - Tomb Fiends, Tomb Reavers, then Tuten'kash. (Summon-only boss.)",
    ),
  );

  // --- → Ragglesnout (pool 45901@30% roll via rareRoll.ts) ---
  out.push(
    ...necromancers.slice(0, Math.ceil(necromancers.length / 2)),
    ...skeletons.slice(0, Math.ceil(skeletons.length / 3)),
    ...splinterWarriors.slice(0, Math.ceil(splinterWarriors.length / 3)),
    ...thornEaters.slice(0, Math.ceil(thornEaters.length / 2)),
  );

  // --- → Mordresh Fire Eye ---
  out.push(
    ...boneflayers.slice(0, Math.ceil(boneflayers.length / 2)),
    ...centurions.slice(0, Math.ceil(centurions.length / 3)),
    ...summoners.slice(0, Math.ceil(summoners.length / 2)),
    ...frostweavers.slice(0, Math.ceil(frostweavers.length / 2)),
    ...quilguards.slice(Math.ceil(quilguards.length / 2)),
  );

  out.push(
    boss(
      'mordresh-fire-eye',
      'Mordresh Fire Eye',
      ENTRY.mordresh,
      BOSS_SPELLS.mordresh,
      undefined,
      'Mordresh Fire Eye, a skeletal fire mage, holds the charnel court.',
    ),
  );

  // --- → Glutton ---
  out.push(
    ...reavers.slice(Math.ceil(reavers.length / 2)),
    ...boneflayers.slice(Math.ceil(boneflayers.length / 2)),
    ...centurions.slice(
      Math.ceil(centurions.length / 3),
      Math.ceil((2 * centurions.length) / 3),
    ),
    ...captains,
    ...boarHorrors,
    ...frozenSouls.slice(0, Math.ceil(frozenSouls.length / 2)),
  );

  // --- Belnistrasz idol ritual → Plaguemaw (summon-only) ---
  // Accept 3525 → escort to the idol → 5 trash waves then Plaguemaw, degraded to player-paced.
  out.push(
    ...battleBoars.slice(Math.ceil(battleBoars.length / 2)),
    ...geomancers.slice(Math.ceil(geomancers.length / 2)),
    ...necromancers.slice(Math.ceil(necromancers.length / 2)),
    ...skeletons.slice(
      Math.ceil(skeletons.length / 3),
      Math.ceil((2 * skeletons.length) / 3),
    ),
    ...splinterWarriors.slice(
      Math.ceil(splinterWarriors.length / 3),
      Math.ceil((2 * splinterWarriors.length) / 3),
    ),
  );

  const ritualTrashWaves = Array.from({ length: RFD_RITUAL_TRASH_WAVES }, () => ({
    pack: RFD_RITUAL_WAVE_PACK.map((r) => ({ ...r })),
  }));

  out.push({
    id: 'belnistrasz-ritual',
    name: 'Plaguemaw the Rotting',
    kind: 'boss',
    creatureEntry: ENTRY.plaguemaw,
    bossSpells: [...BOSS_SPELLS.plaguemaw],
    intro:
      // Escort Belnistrasz 8516 → idol (WP24) is WIRED via BELNISTRAZ_ESCORT; ritual waves
      // remain player-paced (real timers ~4 min degraded — pure helpers track phase arms).
      "Belnistrasz channels Idol Shutdown - defend the ritual. Five trash waves, then Plaguemaw the Rotting.",
    events: [
      {
        kind: 'waves',
        waves: [
          ...ritualTrashWaves,
          { pack: [{ creatureEntry: ENTRY.plaguemaw, count: 1 }] },
        ],
      },
      { kind: 'setsFlag', flag: RFD_FLAGS.belnistraszRitualDone },
    ],
  });

  // Ragglesnout and Glutton are rares with no gate and no quest, standing in the same room as
  // Amnennar; walked with him the boss spine is 875 yd of plan instead of 1368.
  out.push({
    ...boss(
      'ragglesnout',
      'Ragglesnout',
      ENTRY.ragglesnout,
      BOSS_SPELLS.ragglesnout,
      undefined,
      // Survey: plain always-up static spawn (no rare pool). Retail "sometimes" is not modeled.
      'Ragglesnout the quilboar abomination blocks a burial passage.',
    ),
    optional: true,
  });

  out.push(
    boss(
      'glutton',
      'Glutton',
      ENTRY.glutton,
      BOSS_SPELLS.glutton,
      undefined,
      'Glutton the ravenous abomination shambles through the lower downs.',
    ),
  );

  // --- → Amnennar the Coldbringer (final) ---
  out.push(
    ...thornEaters.slice(Math.ceil(thornEaters.length / 2)),
    ...freezingSpirits,
    ...frozenSouls.slice(Math.ceil(frozenSouls.length / 2)),
    ...frostweavers.slice(Math.ceil(frostweavers.length / 2)),
    ...summoners.slice(Math.ceil(summoners.length / 2)),
    ...skeletons.slice(Math.ceil((2 * skeletons.length) / 3)),
    ...splinterWarriors.slice(Math.ceil((2 * splinterWarriors.length) / 3)),
    ...centurions.slice(Math.ceil((2 * centurions.length) / 3)),
  );

  out.push(
    boss(
      'amnennar',
      'Amnennar the Coldbringer',
      ENTRY.amnennar,
      BOSS_SPELLS.amnennar,
      [
        // 66%/33% → 3×8585 each. Cite: EventAI 735808/735807; spell 12642.
        // boss-eventai.ts owns mid-fight SPAWN inject; hpThreshold for kill-supply.
        {
          kind: 'hpThreshold',
          pct: AMNENNAR.firstSpectreHpPct,
          once: true,
          phase: 1,
          spawn: [{ creatureEntry: ENTRY.frostSpectre, count: AMNENNAR.spectresPerCast }],
        },
        {
          kind: 'hpThreshold',
          pct: AMNENNAR.secondSpectreHpPct,
          once: true,
          phase: 2,
          spawn: [{ creatureEntry: ENTRY.frostSpectre, count: AMNENNAR.spectresPerCast }],
        },
        { kind: 'setsFlag', flag: RFD_FLAGS.amnennarDone },
      ],
      'Amnennar the Coldbringer summons Frost Spectres at 66% and 33%.',
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 129,
    spine,
    entrance: entranceForInstance('razorfen-downs'),
    
  });
}


/** Survey quests completable inside map 129. */
export const RAZORFEN_DOWNS_QUESTS = [
  635, // Crystal in the Mountains (item-started; also listed on SM GY)
  3523, // Scourge of the Downs
  3525, // Extinguishing the Idol
  3341, // Bring the End
  3636, // Bring the Light
] as const;

export const RAZORFEN_DOWNS: InstanceDef = {
  id: 'razorfen-downs',
  mapId: 129,
  name: 'Razorfen Downs',
  portalZone: 'barrens',
  minLevel: 25, // entrance trigger 442 requiredLevel
  levelRange: [34, 40], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...RAZORFEN_DOWNS_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored kill supply per creature entry (trash + bosses + waves + HP spawns). */
export function rfdKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of RAZORFEN_DOWNS.encounters) {
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
  // waves re-count primary (final wave duplicates enc.creatureEntry) - subtract double
  for (const enc of RAZORFEN_DOWNS.encounters) {
    const waves = (enc.events ?? []).find((e) => e.kind === 'waves');
    if (!waves || waves.kind !== 'waves') continue;
    // Subtract only wave rows that duplicate the primary entry already counted from
    // enc.creatureEntry; trash-only wave adds are kept.
    for (const w of waves.waves) {
      for (const row of w.pack) {
        if (row.creatureEntry === enc.creatureEntry) add(row.creatureEntry, -row.count);
      }
    }
  }
  return map;
}

// Counts only pure static trash packs (no bosses, no gong/ritual event pulls). Used to assert census match
// and summon-only / excluded entry absence.
export function rfdPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of RAZORFEN_DOWNS.encounters) {
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
