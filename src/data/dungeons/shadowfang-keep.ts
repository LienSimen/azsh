// Shadowfang Keep (map 33) — InstanceDef graph. Authority: docs/dungeons/survey/04-shadowfang-keep.md.
// Pack sizes from the static census; event-only Voidwalkers and the seasonal Sever are excluded.

import type { EncounterDef, EncounterEvent, EncounterPackMember, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  clusterMemberByGuid,
  repackFromGuids,
} from './pack-from-clusters.ts';

// ---- Census static counts (map 33; event-only / excluded rows omitted) ----
// Voidwalkers are summon-only, Sever is seasonal, and Adamant, Ashcrombe and Vincent are service.

const STATIC = {
  bleakWorg: 8, // 3861
  whitescalp: 7, // 3851
  slaveringWorg: 9, // 3862
  moonwalker: 14, // 3853
  hauntedServitor: 19, // 3875
  darksoul: 12, // 3855
  wolfguard: 1, // 3854 Shadowfang Wolfguard (humanoid)
  glutton: 4, // 3857
  wailingGuardsman: 10, // 3877
  vileBat: 1, // 3866
  bloodSeeker: 1, // 3868
  ragetooth: 8, // 3859
  tormentedOfficer: 6, // 3873
  lupineHorror: 7, // 3863
  sonOfArugal: 8, // 2529 (static; world extras not packed)
  wolfguardWorg: 1, // 5058
  // CSE guids 3300093–95: Fel Steed | Shadow Charger at 1/2 each, so 1.5 expected. The live roll
  // is pack-from-clusters poolCandidates [3864,3865] per guid.
  felSteed: 2, // expected presence rounded (census 1.5)
  shadowCharger: 1, // expected presence rounded (census 1.5)
} as const;

const ENTRY = {
  bleakWorg: 3861,
  whitescalp: 3851,
  slaveringWorg: 3862,
  moonwalker: 3853,
  hauntedServitor: 3875,
  darksoul: 3855,
  wolfguard: 3854,
  glutton: 3857,
  wailingGuardsman: 3877,
  vileBat: 3866,
  bloodSeeker: 3868,
  ragetooth: 3859,
  tormentedOfficer: 3873,
  lupineHorror: 3863,
  sonOfArugal: 2529,
  wolfguardWorg: 5058,
  felSteed: 3864,
  shadowCharger: 3865,
  voidwalker: 4627, // summon-only; not in STATIC
  rethilgore: 3914,
  razorclaw: 3886,
  silverlaine: 3887,
  springvale: 4278,
  odo: 4279,
  deathswornCaptain: 3872,
  fenrus: 4274,
  nandos: 3927,
  arugal: 4275,
} as const;

// Top-floor static worgs that arm Nandos (Z > nandosMovement.fZ). Cite: shadowfang_keep.h:48-51,80;
// instance_shadowfang_keep.cpp:81-87.
export const SFK_TOP_FLOOR_WORG = {
  /** Cite: shadowfang_keep.h:80 nandosMovement.fZ */
  zThreshold: 151.91,
  entries: [
    ENTRY.bleakWorg,
    ENTRY.slaveringWorg,
    ENTRY.lupineHorror,
    ENTRY.wolfguardWorg,
  ] as const,
} as const;

// Courtyard Door after prisoner free (TYPE_FREE_NPC). Cite: shadowfang_keep.h:53 GO_COURTYARD_DOOR 18895;
// instance cpp:174-178.
export const SFK_COURTYARD = {
  doorGo: 18895,
  /** Prisoners that can open the door. Cite: shadowfang_keep.h:36-37 NPC_ASH/ADA. */
  prisonerEntries: [3849, 3850] as const,
} as const;

/** Flags from survey event choreography / instance_shadowfang_keep.cpp. */
export const SFK_FLAGS = {
  // TYPE_FREE_NPC DONE → Courtyard Door GO 18895. The GAP is the engine, not the data: the escort
  // rows exist, but `EscortDef.questId` is required and this escort starts by GOSSIP, with no quest.
  courtyardOpen: 'sfk-courtyard-open',
  /** Fenrus + voidwalker clear → Sorcerer's Gate (GO 18972). */
  fenrusDone: 'sfk-fenrus-done',
  // Prefix for per-pack top-floor worg clear flags (`:0`, `:1`, …). Nandos requires every pack that holds a
  // static worg with Z > 151.91. Cite: instance_shadowfang_keep.cpp:81-87,101-124; shadowfang_keep.h:80.
  topFloorWorgsDone: 'sfk-top-floor-worgs-done',
  /** Nandos death → Arugal's Lair door (GO 18971). */
  nandosDone: 'sfk-nandos-done',
  /** Archmage Arugal death. Cite: boss_arugal final; quest 1014 Head of Arugal. */
  arugalDone: 'sfk-arugal-done',
} as const;

// Fenrus the Devourer → 4× Voidwalker at the Sorcerer's Gate, then TYPE_VOIDWALKER DONE ×4 opens
// GO 18972. Wave authoring puts the primary on wave 0. Cite: shadowfang_keep.cpp:441-460.

export const SFK_FENRUS = {
  encId: 'fenrus',
  entry: ENTRY.fenrus, // 4274
  voidwalkerEntry: ENTRY.voidwalker, // 4627
  /** MAX_VOID_WALKERS. Cite: shadowfang_keep.cpp:199 */
  voidwalkerCount: 4,
  /** Dark Offering. Cite: shadowfang_keep.cpp:198 SPELL_DARK_OFFERING */
  spellDarkOffering: 7154,
  /** Temp Arugal despawn. Cite: instance_shadowfang_keep.cpp:189 TEMPSPAWN_TIMED_DESPAWN 30000 */
  arugalApparitionMs: 30_000,
  /** Apparition spawn. Cite: instance_shadowfang_keep.cpp:189 */
  arugalApparition: { x: -136.89, y: 2169.17, z: 136.58, o: 2.794 },
  /** GO_SORCERER_DOOR. Cite: shadowfang_keep.h:54 */
  sorcererDoorGo: 18972,
  /** GO_ARUGAL_FOCUS lightning visual. Cite: shadowfang_keep.h:56 */
  arugalFocusGo: 18973,
  // VWSpawns. Cite: shadowfang_keep.cpp:366-373. Sourced for kill-supply / layout; floorGauntlet wave packs
  // do not seed unitPositionsYd from these coords (combat position seed is pack-origin only).
  voidwalkerSpawns: [
    { x: -155.352, y: 2172.78, z: 128.448, o: 4.679 },
    { x: -147.059, y: 2163.193, z: 128.696, o: 0.128 },
    { x: -148.869, y: 2180.859, z: 128.448, o: 1.814 },
    { x: -140.203, y: 2175.263, z: 128.448, o: 0.373 },
  ] as const,
} as const;

/** Pure: voidwalker wave count after Fenrus dies (wave 1 pack). */
export function fenrusVoidwalkerCount(): number {
  return SFK_FENRUS.voidwalkerCount;
}

// Archmage Arugal 4275 — teleport rotation plus Void Bolt / Thundershock / Curse. The bake gives
// him charm spells only, so the ScriptDev IR timers below are the sole supplier of his kit.

export const SFK_ARUGAL = {
  encId: 'archmage-arugal',
  entry: ENTRY.arugal, // 4275
  /** Bake Void Bolt (creature 4275 spells). Cite: tables/creatures; cpp 7588 absent bake. */
  spellVoidBoltBake: 22709,
  /** cpp SPELL_VOID_BOLT — not in spell-data. Cite: shadowfang_keep.cpp:345 */
  spellVoidBoltCpp: 7588,
  /** Cite: shadowfang_keep.cpp:350 SPELL_THUNDERSHOCK */
  spellThundershock: 7803,
  /** Cite: shadowfang_keep.cpp:349 SPELL_ARUGALS_CURSE — not in spell-data */
  spellArugalsCurse: 7621,
  /** Cite: shadowfang_keep.cpp:347 SPELL_SHADOW_PORT_SPAWN_LEDGE — not in spell-data */
  spellPortSpawnLedge: 7586,
  /** Cite: shadowfang_keep.cpp:346 SPELL_SHADOW_PORT_UPPER_LEDGE — not in spell-data */
  spellPortUpperLedge: 7587,
  /** Cite: shadowfang_keep.cpp:348 SPELL_SHADOW_PORT_STAIRS — not in spell-data */
  spellPortStairs: 7136,
  /** AddCombatAction ARUGAL_TELEPORT. Cite: shadowfang_keep.cpp:392 */
  teleportInitialMinMs: 22_000,
  teleportInitialMaxMs: 26_000,
  /** AddCombatAction ARUGAL_CURSE. Cite: shadowfang_keep.cpp:393 */
  curseInitialMinMs: 20_000,
  curseInitialMaxMs: 30_000,
  /** POSITION_SPAWN_LEDGE / UPPER / STAIRS. Cite: shadowfang_keep.cpp:353-358 */
  perchCount: 3,
  /** HEIGHT_FENRUS_ROOM — event-mode Arugal below this Z. Cite: cpp:377 */
  fenrusRoomHeight: 140.0,
} as const;

// Perch index → teleport spell. Cite: shadowfang_keep.cpp:505-522. Spells absent spell-data — schedule
// helpers only until bake owns them.
export function arugalTeleportSpell(perch: 0 | 1 | 2): number {
  if (perch === 0) return SFK_ARUGAL.spellPortSpawnLedge;
  if (perch === 1) return SFK_ARUGAL.spellPortUpperLedge;
  return SFK_ARUGAL.spellPortStairs;
}

// Wolf Master Nandos 3927 — EventAI Call Worg mid-fight summons, not an on-pull pack.
// Cite: EventAI 392702–392704; rawEffects effect 42 miscValue 3861/3862/3863 → injectEnemySummon.

export const SFK_NANDOS = {
  encId: 'wolf-master-nandos',
  entry: ENTRY.nandos, // 3927
  /** GO_ARUGAL_DOOR, opened by TYPE_NANDOS DONE. Cite: instance_shadowfang_keep.cpp:195-198. */
  arugalDoorGo: 18971,
  /** Call Bleak Worg → 3861. Cite: EventAI 392702; spell 7487 rawEffects miscValue */
  spellCallBleak: 7487,
  callBleakEntry: ENTRY.bleakWorg,
  /** event_param1–4: 30000–45000 init, 33700–48800 repeat. Cite: EventAI 392702 */
  callBleakInitialMinMs: 30_000,
  callBleakInitialMaxMs: 45_000,
  /** Call Slavering Worg → 3862. Cite: EventAI 392703; spell 7488 */
  spellCallSlavering: 7488,
  callSlaveringEntry: ENTRY.slaveringWorg,
  /** Cite: EventAI 392703 45000–50000 init */
  callSlaveringInitialMinMs: 45_000,
  callSlaveringInitialMaxMs: 50_000,
  /** Call Lupine Horror → 3863. Cite: EventAI 392704; spell 7489 */
  spellCallLupine: 7489,
  callLupineEntry: ENTRY.lupineHorror,
  /** Cite: EventAI 392704 60000–70000 init */
  callLupineInitialMinMs: 60_000,
  callLupineInitialMaxMs: 70_000,
} as const;

/** Pure: first Call Bleak cast by elapsed (min arm). Cite: EventAI 392702. */
export function nandosCallBleakByMs(elapsedMs: number): number {
  if (elapsedMs < SFK_NANDOS.callBleakInitialMinMs) return 0;
  return 1 + Math.floor(
    (elapsedMs - SFK_NANDOS.callBleakInitialMinMs) / SFK_NANDOS.callBleakInitialMinMs,
  );
}

// Pure: teleport casts by combat elapsed (min arm). First at 22s, then every 22s. Cite:
// shadowfang_keep.cpp:392 AddCombatAction(ARUGAL_TELEPORT, 22000, 26000).
export function arugalTeleportsByMs(elapsedMs: number): number {
  if (elapsedMs < SFK_ARUGAL.teleportInitialMinMs) return 0;
  return 1 + Math.floor(
    (elapsedMs - SFK_ARUGAL.teleportInitialMinMs) / SFK_ARUGAL.teleportInitialMinMs,
  );
}

/** Pure: curse casts by combat elapsed (min arm). Cite: cpp:393 20000–30000. */
export function arugalCursesByMs(elapsedMs: number): number {
  if (elapsedMs < SFK_ARUGAL.curseInitialMinMs) return 0;
  return 1 + Math.floor(
    (elapsedMs - SFK_ARUGAL.curseInitialMinMs) / SFK_ARUGAL.curseInitialMinMs,
  );
}

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
    if (rem === 1) n = prefer - 1;
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
  rethilgore: [7295],
  razorclaw: [7485],
  silverlaine: [7068],
  springvale: [5588, 1026],
  odo: [7481, 7483, 7484],
  deathswornCaptain: [7165, 15584, 9080],
  fenrus: [7125],
  // Call Worg 7487/7488/7489 — EventAI timers; host effect-42 mid-fight inject.
  nandos: [7487, 7489, 7488],
  // Bake Void Bolt 22709 + Thundershock 7803. cpp Curse/ports not in spell-data.
  arugal: [22709, 7803],
} as const;

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
  pack?: readonly EncounterPackMember[],
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'boss',
    creatureEntry,
    bossSpells: [...bossSpells],
  };
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  if (pack && pack.length) enc.pack = pack.map((p) => ({ ...p }));
  return enc;
}

// Linear encounter graph: entrance → bosses in survey order with inter-boss trash, the Fenrus
// voidwalker phase, then the top-floor worg gauntlet → Nandos → Arugal.
function buildHandSpine(): EncounterDef[] {
  const whitescalps = trashFromCensus(
    'whitescalp',
    'Shadowfang Whitescalp',
    ENTRY.whitescalp,
    STATIC.whitescalp,
  );
  const moonwalkers = trashFromCensus(
    'moonwalker',
    'Shadowfang Moonwalker',
    ENTRY.moonwalker,
    STATIC.moonwalker,
  );
  const servitors = trashFromCensus(
    'haunted-servitor',
    'Haunted Servitor',
    ENTRY.hauntedServitor,
    STATIC.hauntedServitor,
  );
  const darksouls = trashFromCensus(
    'darksoul',
    'Shadowfang Darksoul',
    ENTRY.darksoul,
    STATIC.darksoul,
  );
  const gluttons = trashFromCensus(
    'glutton',
    'Shadowfang Glutton',
    ENTRY.glutton,
    STATIC.glutton,
  );
  const guardsmen = trashFromCensus(
    'wailing-guardsman',
    'Wailing Guardsman',
    ENTRY.wailingGuardsman,
    STATIC.wailingGuardsman,
  );
  const officers = trashFromCensus(
    'tormented-officer',
    'Tormented Officer',
    ENTRY.tormentedOfficer,
    STATIC.tormentedOfficer,
  );
  const ragetooths = trashFromCensus(
    'ragetooth',
    'Shadowfang Ragetooth',
    ENTRY.ragetooth,
    STATIC.ragetooth,
  );
  const sons = trashFromCensus(
    'son-of-arugal',
    'Son of Arugal',
    ENTRY.sonOfArugal,
    STATIC.sonOfArugal,
  );

  // Top-floor worg section (Nandos gate approximation - see SFK_FLAGS.topFloorWorgsDone).
  // All static packs of 3861/3862/3863/5058 are placed here; we cannot Z-filter in text RPG.
  const bleakWorgs = trashFromCensus(
    'top-bleak-worg',
    'Bleak Worg',
    ENTRY.bleakWorg,
    STATIC.bleakWorg,
  );
  const slaveringWorgs = trashFromCensus(
    'top-slavering-worg',
    'Slavering Worg',
    ENTRY.slaveringWorg,
    STATIC.slaveringWorg,
  );
  const lupineHorrors = trashFromCensus(
    'top-lupine-horror',
    'Lupine Horror',
    ENTRY.lupineHorror,
    STATIC.lupineHorror,
  );
  const wolfguardWorg = trashFromCensus(
    'top-wolfguard-worg',
    'Wolfguard Worg',
    ENTRY.wolfguardWorg,
    STATIC.wolfguardWorg,
  );

  const horses: EncounterDef[] = [
    ...trashFromCensus('fel-steed', 'Fel Steed', ENTRY.felSteed, STATIC.felSteed),
    ...trashFromCensus('shadow-charger', 'Shadow Charger', ENTRY.shadowCharger, STATIC.shadowCharger),
  ];

  const out: EncounterDef[] = [];

  // --- Entrance cells → Rethilgore → Courtyard Door (TYPE_FREE_NPC) ---
  out.push(...whitescalps.slice(0, 1), ...moonwalkers.slice(0, 1));
  out.push(
    boss(
      'rethilgore',
      'Rethilgore',
      ENTRY.rethilgore,
      BOSS_SPELLS.rethilgore,
      [
        // Cite: instance_shadowfang_keep.cpp:174-178 DoUseDoorOrButton(GO_COURTYARD_DOOR).
        {
          kind: 'objectGate',
          goEntry: SFK_COURTYARD.doorGo,
          setsFlag: SFK_FLAGS.courtyardOpen,
          once: true,
        },
      ],
      'Rethilgore blocks the prison wing. Free Adamant or Ashcrombe to open the courtyard door.',
    ),
  );

  // --- Courtyard → Razorclaw ---
  out.push(...whitescalps.slice(1), ...moonwalkers.slice(1), ...horses);
  out.push(
    boss(
      'razorclaw',
      'Razorclaw the Butcher',
      ENTRY.razorclaw,
      BOSS_SPELLS.razorclaw,
      [{ kind: 'requiresFlag', flag: SFK_FLAGS.courtyardOpen }],
      'Razorclaw the Butcher waits in the courtyard slaughterhouse.',
    ),
  );

  // --- Barony halls → Silverlaine → Springvale ---
  const servPre = Math.ceil(servitors.length / 2);
  out.push(...servitors.slice(0, servPre), ...darksouls.slice(0, 1));
  out.push(
    boss(
      'baron-silverlaine',
      'Baron Silverlaine',
      ENTRY.silverlaine,
      BOSS_SPELLS.silverlaine,
      undefined,
      "Baron Silverlaine's shade holds the keep's great hall.",
    ),
  );

  out.push(...servitors.slice(servPre), ...guardsmen.slice(0, 1));
  out.push(
    boss(
      'commander-springvale',
      'Commander Springvale',
      ENTRY.springvale,
      BOSS_SPELLS.springvale,
      undefined,
      "Commander Springvale's ghost stands watch over the courtyard balcony.",
    ),
  );

  // --- Chapel / bat loft → Odo ---
  out.push(
    ...gluttons,
    trashPull('shadowfang-wolfguard-0', 'Shadowfang Wolfguard', ENTRY.wolfguard, STATIC.wolfguard),
    ...officers.slice(0, 1),
    trashPull('vile-bat-0', 'Vile Bat', ENTRY.vileBat, STATIC.vileBat),
    trashPull('blood-seeker-0', 'Blood Seeker', ENTRY.bloodSeeker, STATIC.bloodSeeker),
  );
  out.push(
    boss(
      'odo',
      'Odo the Blindwatcher',
      ENTRY.odo,
      BOSS_SPELLS.odo,
      undefined,
      'Odo the Blindwatcher hangs among the bats in the chapel loft.',
    ),
  );

  // --- Rare: Deathsworn Captain (pool 45001@30% roll via rareRoll.ts) ---
  // Vanilla rare-elite entry 3872 — skippable; isComplete ignores optional.
  out.push(...officers.slice(1), ...guardsmen.slice(1));
  out.push({
    ...boss(
      'deathsworn-captain',
      'Deathsworn Captain',
      ENTRY.deathswornCaptain,
      BOSS_SPELLS.deathswornCaptain,
      undefined,
      'A rare Deathsworn Captain patrols the walls.',
    ),
    optional: true,
  });

  // --- Upper keep → Fenrus → voidwalker pack (Sorcerer's Gate) ---
  out.push(...ragetooths, ...darksouls.slice(1));
  out.push(
    boss(
      'fenrus',
      'Fenrus the Devourer',
      ENTRY.fenrus,
      BOSS_SPELLS.fenrus,
      [
        // Wave 0 primary + wave 1 4× 4627. GAP: the 30s Arugal immunity and GO Focus 18973 Use are
        // not expressible in the encounter DSL. Cite: shadowfang_keep.cpp:441-460.
        {
          kind: 'waves',
          waves: [
            { pack: [{ creatureEntry: ENTRY.fenrus, count: 1 }] },
            { pack: [{ creatureEntry: ENTRY.voidwalker, count: SFK_FENRUS.voidwalkerCount }] },
          ],
        },
        // Sorcerer's Gate 18972 is opened BY THE INSTANCE on the 4th voidwalker death, never by a
        // player — so it is a setsFlag on the wave clear, not an objectGate.
        { kind: 'setsFlag', flag: SFK_FLAGS.fenrusDone },
      ],
      "Who dares interfere with the Sons of Arugal? - Arugal's shade flees; four voidwalkers rise.",
    ),
  );

  // Top-floor worg requiresFlag stamps applied in buildEncounters (stampTopFloorWorgClear).
  out.push(
    boss(
      'wolf-master-nandos',
      'Wolf Master Nandos',
      ENTRY.nandos,
      BOSS_SPELLS.nandos,
      [
        // Nandos stands behind the Sorcerer's Gate; his death opens Arugal's Lair 18971
        // (instance-side, like the gate below him). Cite: instance_shadowfang_keep.cpp:195-198.
        { kind: 'requiresFlag', flag: SFK_FLAGS.fenrusDone },
        { kind: 'setsFlag', flag: SFK_FLAGS.nandosDone },
      ],
      // Call Worg 7487/7488/7489 mid-fight via EventAI + host effect-42 inject (not on-pull pack).
      'Wolf Master Nandos howls as the last top-floor worg falls - Call Worg summons mid-fight.',
    ),
  );

  // --- Arugal's perch ---
  for (const e of sons) {
    out.push({
      ...e,
      events: [
        ...(e.events ?? []),
        { kind: 'requiresFlag', flag: SFK_FLAGS.nandosDone },
      ],
    });
  }
  out.push(
    boss(
      'archmage-arugal',
      'Archmage Arugal',
      ENTRY.arugal,
      BOSS_SPELLS.arugal,
      [
        { kind: 'requiresFlag', flag: SFK_FLAGS.nandosDone },
        { kind: 'setsFlag', flag: SFK_FLAGS.arugalDone },
      ],
      // Teleport 22–26s + Curse 20–30s pure helpers (SFK_ARUGAL); cpp ports/curse not in spell-data.
      'Archmage Arugal teleports between three perches - Void Bolt and Thundershock.',
    ),
  );

  return out;
}

/** Display names for the four worg entries the Nandos pack gate counts. */
const TOP_FLOOR_WORG_NAME: Record<number, string> = {
  [ENTRY.bleakWorg]: 'Bleak Worg',
  [ENTRY.slaveringWorg]: 'Slavering Worg',
  [ENTRY.lupineHorror]: 'Lupine Horror',
  [ENTRY.wolfguardWorg]: 'Wolfguard Worg',
};

// Nandos's pack gate, on the wolves the source counts: static 3861/3862/3863/5058 above z 151.91
// and not temporary. Extracted onto their own top-floor pull because SFK's packs straddle floors.
export function stampTopFloorWorgClear(encs: EncounterDef[]): EncounterDef[] {
  const gate = encs.findIndex((e) => e.id === SFK_NANDOS.encId);
  if (gate < 0) return encs;
  const members = clusterMemberByGuid(33);
  const topEntries = SFK_TOP_FLOOR_WORG.entries as readonly number[];
  const isTopFloorWorg = (g: number): boolean => {
    const m = members.get(g);
    return (
      !!m
      && (m.z ?? -Infinity) > SFK_TOP_FLOOR_WORG.zThreshold
      && topEntries.includes(m.entry)
    );
  };
  const stripTopFlags = (e: EncounterDef): EncounterEvent[] =>
    (e.events ?? []).filter(
      (ev) => !(ev.kind === 'setsFlag' && String(ev.flag).startsWith(SFK_FLAGS.topFloorWorgsDone)),
    );

  const out: EncounterDef[] = [];
  const topPulls: EncounterDef[] = [];
  const packFlags: string[] = [];
  for (let i = 0; i < encs.length; i++) {
    const e = encs[i]!;
    const guids = e.spawnGuids ?? [];
    if (i >= gate || e.kind !== 'trash' || !guids.length) {
      out.push(e);
      continue;
    }
    const top = guids.filter(isTopFloorWorg);
    if (!top.length) {
      out.push(e);
      continue;
    }
    const flag = `${SFK_FLAGS.topFloorWorgsDone}:${packFlags.length}`;
    packFlags.push(flag);
    const entry = members.get(top[0]!)!.entry;
    topPulls.push(repackFromGuids(e, top, members, {
      id: `sfk-top-worgs-${topPulls.length}`,
      name: `${TOP_FLOOR_WORG_NAME[entry] ?? 'Worg'} pack`,
      events: [
        { kind: 'requiresFlag', flag: SFK_FLAGS.fenrusDone },
        { kind: 'setsFlag', flag },
      ],
    }));
    const rest = guids.filter((g) => !isTopFloorWorg(g));
    if (rest.length) out.push(repackFromGuids(e, rest, members, { events: stripTopFlags(e) }));
  }
  if (!packFlags.length) return out;

  // Top-floor pulls sit immediately before Nandos; the geometry orderer re-tours from there.
  const at = out.findIndex((e) => e.id === SFK_NANDOS.encId);
  out.splice(at, 0, ...topPulls);
  const gi = out.findIndex((e) => e.id === SFK_NANDOS.encId);
  const nandos = out[gi]!;
  const events = (nandos.events ?? []).filter(
    (ev) => !(ev.kind === 'requiresFlag' && String(ev.flag).startsWith(SFK_FLAGS.topFloorWorgsDone)),
  );
  for (const flag of packFlags) {
    events.push({ kind: 'requiresFlag', flag });
  }
  out[gi] = { ...nandos, events };
  return out;
}

/** Per-pack top-floor flags Nandos currently requires. */
export function topFloorWorgPackFlags(encs: readonly EncounterDef[]): string[] {
  const nandos = encs.find((e) => e.id === SFK_NANDOS.encId);
  if (!nandos) return [];
  return (nandos.events ?? [])
    .filter((ev): ev is Extract<EncounterEvent, { kind: 'requiresFlag' }> =>
      ev.kind === 'requiresFlag' && ev.flag.startsWith(SFK_FLAGS.topFloorWorgsDone))
    .map((ev) => ev.flag);
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  const encs = buildClusterEncounters({
    mapId: 33,
    spine,
    entrance: entranceForInstance('shadowfang-keep'),
    // Survey exclusions: Scourge Sever, Arugal intro actor, friendlies, voidwalker summons.
    extraStrip: [14682, 10000, 3849, 3850, 4444, 4627],
  });
  return stampTopFloorWorgClear(encs);
}


/** Survey quests completable inside map 33. */
export const SFK_QUESTS = [1654, 1098, 1740, 1013, 1014] as const;

export const SHADOWFANG_KEEP: InstanceDef = {
  id: 'shadowfang-keep',
  mapId: 33,
  name: 'Shadowfang Keep',
  portalZone: 'silverpine',
  minLevel: 10, // entrance trigger 145 requiredLevel
  levelRange: [18, 25], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...SFK_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored kill supply per creature entry (trash + bosses + summons/waves). */
export function sfkKillSupplyCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SHADOWFANG_KEEP.encounters) {
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
  // waves re-count primary (phase 0 pack duplicates enc.creatureEntry) - subtract double
  for (const enc of SHADOWFANG_KEEP.encounters) {
    const waves = (enc.events ?? []).find((e) => e.kind === 'waves');
    if (!waves || waves.kind !== 'waves') continue;
    const w0 = waves.waves[0];
    if (!w0) continue;
    for (const row of w0.pack) {
      // primary path already added enc.creatureEntry + pack; waves phase 0 adds again
      add(row.creatureEntry, -row.count);
    }
  }
  return map;
}

// Counts pure static trash packs only: no bosses, no requiresFlag event packs, no summon-only
// entries. Top-floor worgs still count — they are static census, placed after the Fenrus flag.
export function sfkPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SHADOWFANG_KEEP.encounters) {
    if (enc.kind !== 'trash') continue;
    // Voidwalkers must never appear as static trash primaries
    if (enc.creatureEntry === ENTRY.voidwalker) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) {
      if (p.creatureEntry === ENTRY.voidwalker) continue;
      add(p.creatureEntry, p.count);
    }
  }
  return map;
}
