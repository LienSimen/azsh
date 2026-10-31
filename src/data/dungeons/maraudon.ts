// Maraudon (map 349) — InstanceDef graph. Authority: docs/dungeons/survey/13-maraudon.md, which
// carries the GAPS list. Pack sizes from the static census; summon-only entries never sit in it.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
} from './pack-from-clusters.ts';

// ---- Census static counts (map 349; survey creature census static column) ---- Bosses and summon-only
// (13456/13533/13716/12238) are not trash. Elder Splitrock 15556 friendly/service - excluded (D-10).

const STATIC = {
  putridusShadowstalker: 7, // 11792
  deeprotStomper: 12, // 13141
  putridusSatyr: 16, // 11790
  barbedLasher: 17, // 12219
  deeprotTangler: 10, // 13142
  putridusTrickster: 22, // 11791
  cavernLurker: 7, // 12223
  celebrianDryad: 6, // 11793
  constrictorVine: 54, // 12220
  creepingSludge: 24, // 12222
  cavernShambler: 6, // 12224
  noxiousSlime: 27, // 12221
  sisterOfCelebrian: 12, // 11794
  spiritMaraudos: 1, // 12242
  diemetradon: 31, // 13323
  thessalaHydra: 11, // 12207
  spiritVeng: 1, // 12243
  theradrimGuardian: 7, // 11784
  primordialBehemoth: 16, // 12206
  corruptor: 27, // 12217
  poisonSprite: 34, // 12216
  corruptForce: 3, // 13743
  vileLarva: 56, // 12218
  deepBorer: 98, // 11789
  stolidSnapjaw: 26, // 13599
} as const;

const ENTRY = {
  putridusShadowstalker: 11792,
  deeprotStomper: 13141,
  putridusSatyr: 11790,
  barbedLasher: 12219,
  deeprotTangler: 13142,
  putridusTrickster: 11791,
  cavernLurker: 12223,
  celebrianDryad: 11793,
  constrictorVine: 12220,
  creepingSludge: 12222,
  cavernShambler: 12224,
  noxiousSlime: 12221,
  sisterOfCelebrian: 11794,
  spiritMaraudos: 12242,
  diemetradon: 13323,
  thessalaHydra: 12207,
  spiritVeng: 12243,
  theradrimGuardian: 11784,
  primordialBehemoth: 12206,
  corruptor: 12217,
  poisonSprite: 12216,
  corruptForce: 13743,
  vileLarva: 12218,
  deepBorer: 11789,
  stolidSnapjaw: 13599,
  // Bosses (canonical survey order)
  noxxion: 13282,
  razorlash: 12258,
  vyletongue: 12236,
  celebras: 12225,
  landslide: 12203,
  gizlock: 13601,
  meshlok: 12237, // rare-elite
  rotgrip: 13596,
  theradras: 12201,
  // Summon-only (events / E1 degrade)
  noxxionSpawn: 13456, // E2 Noxxion split
  spewedLarva: 13533, // E1 Larva Spewer
  celebrasRedeemed: 13716, // E3 death-summon
  zaetarSpirit: 12238, // E4 Theradras death
} as const;

// E1 degrade: finite Spewed Larva pack size (survey continuous 1/60s; band 3–5). Sourced as summon entry
// 13533; count chosen in authoring band (not a live timer).
export const MARAUDON_LARVA_SPEWER = {
  creatureEntry: ENTRY.spewedLarva,
  /** Finite degrade of continuous ambience - 4 is mid of preferred 3–5 band. */
  count: 4,
} as const;

// E2 Noxxion split — ScriptDev combat owns the mid-fight inject; these are pure helpers.
// Cite: boss_noxxion.cpp :44-49, :79-82, :95-109; spell_template 21707 misc 13456 count 5.
export const MARAUDON_NOXXION_SPLIT = {
  encId: 'noxxion',
  bossEntry: ENTRY.noxxion,
  spawnEntry: ENTRY.noxxionSpawn,
  /** spell 21707 basePoints 4 + dieSides 1 → fixed count basePoints+1. */
  spawnCount: 5,
  auraSpellId: 21708,
  summonSpellId: 21707,
  /** m_uiSummonTimer initial. Cite: boss_noxxion.cpp:48 */
  firstSplitMs: 19_000,
  /** CAST_OK re-arm. Cite: boss_noxxion.cpp:81 */
  repeatMs: 40_000,
  /** Aura 21708 DurationIndex 8. Cite: scriptdev/maraudon.ts NOXXION_SPAWNS_AURA_DURATION_MS */
  auraDurationMs: 15_000,
  toxicVolleySpellId: 21687,
  toxicVolleyInitialMs: 7_000,
  toxicVolleyRepeatMs: 9_000,
  uppercutSpellId: 22916,
  uppercutInitialMs: 16_000,
  uppercutRepeatMs: 12_000,
} as const;

/** How many split pulses have fired by combat elapsed ms. First at 19s, then every 40s. */
export function noxxionSplitsFiredByMs(elapsedMs: number): number {
  const first = MARAUDON_NOXXION_SPLIT.firstSplitMs;
  if (elapsedMs < first) return 0;
  return 1 + Math.floor((elapsedMs - first) / MARAUDON_NOXXION_SPLIT.repeatMs);
}

/** Total Noxxion's Spawn count that should exist by elapsed combat ms. */
export function noxxionSpawnsExpectedByMs(elapsedMs: number): number {
  return noxxionSplitsFiredByMs(elapsedMs) * MARAUDON_NOXXION_SPLIT.spawnCount;
}

// E3 Celebras the Redeemed — quest 7046 scepter ritual. Cite: dbscripts_on_quest_start 7046;
// creature_movement_template 13716; dbscripts_on_creature_movement 1371601–03; spell 21916/21950.
export const MARAUDON_FLAGS = {
  /** Quest 7046 accepted — dbscripts_on_quest_start running. */
  celebrasRitualActive: 'mara-celebras-ritual-active',
  /** Path complete — gossip+quest flags restored; turn-in ready. Cite: 1371603 cmd 29. */
  celebrasRitualDone: 'mara-celebras-ritual-done',
} as const;

export const MARAUDON_CELEBRAS_RITUAL = {
  questId: 7046,
  questTitle: 'The Scepter of Celebras',
  cursedEntry: ENTRY.celebras,
  cursedEncId: 'celebras-the-cursed',
  redeemedEntry: ENTRY.celebrasRedeemed,
  goIncantation: 178965,
  goGuid: 3490026,
  /** GO spawn despawn. Cite: 1371601 delay 4000 cmd 9 datalong2=3600 (seconds). */
  goDespawnSec: 3600,
  spellWaiting: 21916,
  spellRecite: 21950,
  // Quest-start dbscripts (delay ms). Cite: classic-db dbscripts_on_quest_start 7046. 0 say 8952; 1s drop
  // flags; 2s run; 3s MovePoint ritual start; 15s say 8953; 16s walk; 17s waypoint mode; 23s say 8954.
  questStart: {
    sayFollowMs: 0,
    removeFlagsMs: 1_000,
    setRunMs: 2_000,
    moveToPathMs: 3_000,
    sayFreedMs: 15_000,
    setWalkMs: 16_000,
    startWaypointMs: 17_000,
    sayInstructMs: 23_000,
  },
  /** creature_movement_template 13716 points (1-based). Scripts on WP3/4/10. */
  path: [
    { point: 1, x: 654.905, y: 87.382, z: -86.8597 },
    { point: 2, x: 657.207, y: 80.8004, z: -86.8318 },
    { point: 3, x: 656.58, y: 73.1467, z: -86.8285, waitMs: 6_000, scriptId: 1371601 },
    { point: 4, x: 653.284, y: 73.888, z: -85.8574, waitMs: 5_000, scriptId: 1371602 },
    { point: 5, x: 656.595, y: 73.5683, z: -86.8284 },
    { point: 6, x: 655.724, y: 67.3549, z: -86.828 },
    { point: 7, x: 650.08, y: 65.0115, z: -86.7745, waitMs: 4_000 },
    { point: 8, x: 655.445, y: 67.6601, z: -86.8283 },
    { point: 9, x: 657.399, y: 78.0873, z: -86.8283 },
    { point: 10, x: 654.905, y: 87.382, z: -86.8597, waitMs: 4_000, scriptId: 1371603 },
  ] as const,
  /** GO spawn pose. Cite: gameobject guid 3490026. */
  goSpawn: { x: 652.431, y: 74.7087, z: -85.3355 },
  says: {
    follow: { broadcastId: 8952, text: 'You wish to learn of the stone? Follow me.' },
    freed: {
      broadcastId: 8953,
      text: 'For so long I have drifted in my cursed form. You have freed me... Your hard work shall be repaid.',
    },
    instruct: { broadcastId: 8954, text: 'Please do as I instruct you, $N.' },
    readTome: {
      broadcastId: 8950,
      text: 'Read this tome I have placed before you, and speak the words aloud.',
    },
    channel: {
      broadcastId: 8951,
      text: '%s begins to channel his energy, focusing on the stone.',
    },
    together: {
      broadcastId: 8948,
      text: 'Together, the two parts shall become one, once again.',
    },
    whole: { broadcastId: 8955, text: 'My scepter will once again become whole!' },
  },
  // Wall-clock from quest accept to turn-in ready, so the live controller completes the RP without
  // a full escort path engine: 23s quest-start + travel + WP waits (6+5+4)s ≈ 50s.
  completeAfterMs: 50_000,
} as const;

/** Celebras the Cursed must be dead (Redeemed present) before 7046 can start. */
export function maraCelebrasCanStartRitual(opts: {
  cursedDefeated: boolean;
  flags: readonly string[];
}): boolean {
  if (!opts.cursedDefeated) return false;
  if (opts.flags.includes(MARAUDON_FLAGS.celebrasRitualDone)) return false;
  if (opts.flags.includes(MARAUDON_FLAGS.celebrasRitualActive)) return false;
  return true;
}

/** Accept 7046 → active flag. Null when cannot start. */
export function maraCelebrasStartRitual(flags: readonly string[], cursedDefeated: boolean): string[] | null {
  if (!maraCelebrasCanStartRitual({ cursedDefeated, flags })) return null;
  const next = [...flags];
  if (!next.includes(MARAUDON_FLAGS.celebrasRitualActive)) {
    next.push(MARAUDON_FLAGS.celebrasRitualActive);
  }
  return next;
}

/** Path complete → done flag (turn-in ready). Null if not active. */
export function maraCelebrasCompleteRitual(flags: readonly string[]): string[] | null {
  if (!flags.includes(MARAUDON_FLAGS.celebrasRitualActive)) return null;
  const next = flags.filter((f) => f !== MARAUDON_FLAGS.celebrasRitualActive);
  if (!next.includes(MARAUDON_FLAGS.celebrasRitualDone)) next.push(MARAUDON_FLAGS.celebrasRitualDone);
  return next;
}

export function maraCelebrasRitualActive(flags: readonly string[]): boolean {
  return flags.includes(MARAUDON_FLAGS.celebrasRitualActive);
}

export function maraCelebrasRitualDone(flags: readonly string[]): boolean {
  return flags.includes(MARAUDON_FLAGS.celebrasRitualDone);
}

/** GO 178965 is up during active ritual (after WP3 script) and until done. */
export function maraCelebrasGoSpawned(flags: readonly string[]): boolean {
  return maraCelebrasRitualActive(flags) || maraCelebrasRitualDone(flags);
}

/** Summon-only creature entries that must never appear in pure static trash packs. */
export const MARAUDON_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.noxxionSpawn, // 13456
  ENTRY.spewedLarva, // 13533
  ENTRY.celebrasRedeemed, // 13716
  ENTRY.zaetarSpirit, // 12238
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

// Boss spells come from the bake's creature.spells; no invented ids. Noxxion's schedule is
// ScriptDev boss_noxxion, so this list is the UI kit surface, not the timed schedule owner.
const BOSS_SPELLS = {
  noxxion: [21687, 21547, 21707],
  razorlash: [12787, 15976, 8876, 15978, 11427, 15584],
  vyletongue: [21080, 8817, 674, 21655, 7964, 21390, 16100],
  celebras: [21968, 21793, 21807, 12747],
  landslide: [21808, 5568, 18670],
  gizlock: [9143, 16100, 21833, 29419],
  meshlok: [24375, 15580, 13446, 15593],
  rotgrip: [16495, 15978],
  theradras: [21869, 21832, 21909, 8876],
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

// Linear encounter graph: entrance trash → bosses in survey canonical order with inter-boss trash,
// in spatial bands. One full-Maraudon graph per survey, with no wing split.
function buildHandSpine(): EncounterDef[] {
  // Outer / wicked grove (pre-Noxxion)
  const poisonSprites = trashFromCensus(
    'poison-sprite',
    'Poison Sprite',
    ENTRY.poisonSprite,
    STATIC.poisonSprite,
  );
  const corruptors = trashFromCensus('corruptor', 'Corruptor', ENTRY.corruptor, STATIC.corruptor);
  const vileLarvae = trashFromCensus('vile-larva', 'Vile Larva', ENTRY.vileLarva, STATIC.vileLarva);
  const barbedLashers = trashFromCensus(
    'barbed-lasher',
    'Barbed Lasher',
    ENTRY.barbedLasher,
    STATIC.barbedLasher,
  );
  const constrictors = trashFromCensus(
    'constrictor-vine',
    'Constrictor Vine',
    ENTRY.constrictorVine,
    STATIC.constrictorVine,
  );
  const creepingSludges = trashFromCensus(
    'creeping-sludge',
    'Creeping Sludge',
    ENTRY.creepingSludge,
    STATIC.creepingSludge,
  );
  const noxiousSlimes = trashFromCensus(
    'noxious-slime',
    'Noxious Slime',
    ENTRY.noxiousSlime,
    STATIC.noxiousSlime,
  );
  const corruptForces = trashFromCensus(
    'corrupt-force',
    'Corrupt Force of Nature',
    ENTRY.corruptForce,
    STATIC.corruptForce,
  );

  // Putridus / foul (Vyletongue wing-ish)
  const putridusSatyrs = trashFromCensus(
    'putridus-satyr',
    'Putridus Satyr',
    ENTRY.putridusSatyr,
    STATIC.putridusSatyr,
  );
  const putridusTricksters = trashFromCensus(
    'putridus-trickster',
    'Putridus Trickster',
    ENTRY.putridusTrickster,
    STATIC.putridusTrickster,
  );
  const putridusShadowstalkers = trashFromCensus(
    'putridus-shadowstalker',
    'Putridus Shadowstalker',
    ENTRY.putridusShadowstalker,
    STATIC.putridusShadowstalker,
  );

  // Celebrian / dryad (Celebras approach)
  const dryads = trashFromCensus(
    'celebrian-dryad',
    'Celebrian Dryad',
    ENTRY.celebrianDryad,
    STATIC.celebrianDryad,
  );
  const sisters = trashFromCensus(
    'sister-of-celebrian',
    'Sister of Celebrian',
    ENTRY.sisterOfCelebrian,
    STATIC.sisterOfCelebrian,
  );
  const spiritMaraudos = trashFromCensus(
    'spirit-maraudos',
    'Spirit of Maraudos',
    ENTRY.spiritMaraudos,
    STATIC.spiritMaraudos,
  );
  const spiritVeng = trashFromCensus(
    'spirit-veng',
    'Spirit of Veng',
    ENTRY.spiritVeng,
    STATIC.spiritVeng,
  );

  // Earth / deep (Landslide / Gizlock / Rotgrip)
  const stompers = trashFromCensus(
    'deeprot-stomper',
    'Deeprot Stomper',
    ENTRY.deeprotStomper,
    STATIC.deeprotStomper,
  );
  const tanglers = trashFromCensus(
    'deeprot-tangler',
    'Deeprot Tangler',
    ENTRY.deeprotTangler,
    STATIC.deeprotTangler,
  );
  const cavernLurkers = trashFromCensus(
    'cavern-lurker',
    'Cavern Lurker',
    ENTRY.cavernLurker,
    STATIC.cavernLurker,
  );
  const cavernShamblers = trashFromCensus(
    'cavern-shambler',
    'Cavern Shambler',
    ENTRY.cavernShambler,
    STATIC.cavernShambler,
  );
  const theradrim = trashFromCensus(
    'theradrim-guardian',
    'Theradrim Guardian',
    ENTRY.theradrimGuardian,
    STATIC.theradrimGuardian,
  );
  const behemoths = trashFromCensus(
    'primordial-behemoth',
    'Primordial Behemoth',
    ENTRY.primordialBehemoth,
    STATIC.primordialBehemoth,
  );
  const diemetradons = trashFromCensus(
    'diemetradon',
    'Subterranean Diemetradon',
    ENTRY.diemetradon,
    STATIC.diemetradon,
  );
  const hydras = trashFromCensus(
    'thessala-hydra',
    'Thessala Hydra',
    ENTRY.thessalaHydra,
    STATIC.thessalaHydra,
  );
  const deepBorers = trashFromCensus('deep-borer', 'Deep Borer', ENTRY.deepBorer, STATIC.deepBorer);
  const snapjaws = trashFromCensus(
    'stolid-snapjaw',
    'Stolid Snapjaw',
    ENTRY.stolidSnapjaw,
    STATIC.stolidSnapjaw,
  );

  const out: EncounterDef[] = [];

  // --- Entrance → Noxxion (poison sprites, corruptors, larvae, spewer degrade) ---
  out.push(
    ...poisonSprites.slice(0, Math.ceil(poisonSprites.length / 2)),
    ...corruptors.slice(0, Math.ceil(corruptors.length / 2)),
    ...vileLarvae.slice(0, Math.ceil(vileLarvae.length / 2)),
    ...corruptForces,
  );

  // E1 Larva Spewer ambience - degraded continuous 1×13533/60s to finite pack (see GAPS).
  out.push(
    trashPull(
      'larva-spewer-0',
      "Spewed Larvas (Larva Spewer)",
      MARAUDON_LARVA_SPEWER.creatureEntry,
      MARAUDON_LARVA_SPEWER.count,
    ),
  );

  out.push(
    boss(
      'noxxion',
      'Noxxion',
      ENTRY.noxxion,
      BOSS_SPELLS.noxxion,
      // E2 mid-fight split owned by ScriptDev boss_noxxion (21708@19s/40s → 5×13456).
      // Former hpThreshold stand-in retired so the mechanic does not double-fire.
      undefined,
      'Noxxion, a putrid elemental, seeps from the corrupt falls.',
    ),
  );

  // --- Noxxion → Razorlash (vines / lashers / sludge) ---
  out.push(
    ...barbedLashers,
    ...constrictors.slice(0, Math.ceil(constrictors.length / 2)),
    ...creepingSludges.slice(0, Math.ceil(creepingSludges.length / 2)),
    ...noxiousSlimes.slice(0, Math.ceil(noxiousSlimes.length / 2)),
  );

  out.push(
    boss(
      'razorlash',
      'Razorlash',
      ENTRY.razorlash,
      BOSS_SPELLS.razorlash,
      undefined,
      'Razorlash lashes out among the tangled vines.',
    ),
  );

  // --- Razorlash → Lord Vyletongue (Putridus satyrs) ---
  out.push(
    ...putridusSatyrs,
    ...putridusTricksters.slice(0, Math.ceil(putridusTricksters.length / 2)),
    ...putridusShadowstalkers,
    ...poisonSprites.slice(Math.ceil(poisonSprites.length / 2)),
    ...corruptors.slice(Math.ceil(corruptors.length / 2)),
  );

  out.push(
    boss(
      'lord-vyletongue',
      'Lord Vyletongue',
      ENTRY.vyletongue,
      BOSS_SPELLS.vyletongue,
      undefined,
      'Lord Vyletongue, satyr overseer of the foul grotto, bars the way.',
    ),
  );

  // Meshlok (rare-elite, pool 46901 @30%) stands in the WICKED GROTTO, so he is listed here at an
  // insertion cost of 73 yd — after Gizlock it was 1014 (probe-route-order-gates).
  out.push({
    ...boss(
      'meshlok-the-harvester',
      'Meshlok the Harvester',
      ENTRY.meshlok,
      BOSS_SPELLS.meshlok,
      undefined,
      // GAP: rare-elite spawn chance not modeled - always present for golden-path testing.
      'Meshlok the Harvester (rare) stalks the fungal caverns.',
    ),
    optional: true,
  });

  // --- Vyletongue → Celebras (dryads / sisters / spirits) ---
  out.push(
    ...dryads,
    ...sisters,
    ...spiritMaraudos,
    ...spiritVeng,
    ...putridusTricksters.slice(Math.ceil(putridusTricksters.length / 2)),
    ...constrictors.slice(
      Math.ceil(constrictors.length / 2),
      Math.ceil((2 * constrictors.length) / 3),
    ),
  );

  out.push(
    boss(
      'celebras-the-cursed',
      'Celebras the Cursed',
      ENTRY.celebras,
      BOSS_SPELLS.celebras,
      [
        // E3: ON_DEATH → Celebras the Redeemed 13716 (EventAI 1222505).
        // Quest 7046 ritual: MARAUDON_CELEBRAS_RITUAL pure path + live accept handler.
        { kind: 'onDeathSummon', creatureEntry: ENTRY.celebrasRedeemed },
      ],
      'Celebras the Cursed is bound by corruption - his death frees the Redeemed.',
    ),
  );

  // --- Celebras → Landslide (earth elementals / cavern) ---
  out.push(
    ...stompers.slice(0, Math.ceil(stompers.length / 2)),
    ...tanglers.slice(0, Math.ceil(tanglers.length / 2)),
    ...cavernLurkers,
    ...cavernShamblers,
    ...theradrim.slice(0, Math.ceil(theradrim.length / 2)),
    ...behemoths.slice(0, Math.ceil(behemoths.length / 2)),
  );

  out.push(
    boss(
      'landslide',
      'Landslide',
      ENTRY.landslide,
      BOSS_SPELLS.landslide,
      undefined, // combat only - no summons (survey Explicitly none)
      'Landslide, a living rockslide, blocks the earthen passage.',
    ),
  );

  // --- Landslide → Tinkerer Gizlock ---
  out.push(
    ...deepBorers.slice(0, Math.ceil(deepBorers.length / 3)),
    ...vileLarvae.slice(
      Math.ceil(vileLarvae.length / 2),
      Math.ceil((3 * vileLarvae.length) / 4),
    ),
    ...creepingSludges.slice(Math.ceil(creepingSludges.length / 2)),
    ...stompers.slice(Math.ceil(stompers.length / 2)),
  );

  out.push(
    boss(
      'tinkerer-gizlock',
      'Tinkerer Gizlock',
      ENTRY.gizlock,
      BOSS_SPELLS.gizlock,
      undefined,
      'Tinkerer Gizlock has set up shop in the deep tunnels - unwisely.',
    ),
  );

  // --- Gizlock → Rotgrip (water / beasts) ---
  out.push(
    ...tanglers.slice(Math.ceil(tanglers.length / 2)),
    ...constrictors.slice(Math.ceil((2 * constrictors.length) / 3)),
    ...noxiousSlimes.slice(Math.ceil(noxiousSlimes.length / 2)),
    ...diemetradons.slice(0, Math.ceil(diemetradons.length / 2)),
    ...hydras,
    ...snapjaws.slice(0, Math.ceil(snapjaws.length / 2)),
    ...deepBorers.slice(
      Math.ceil(deepBorers.length / 3),
      Math.ceil((2 * deepBorers.length) / 3),
    ),
    ...behemoths.slice(Math.ceil(behemoths.length / 2)),
  );

  out.push(
    boss(
      'rotgrip',
      'Rotgrip',
      ENTRY.rotgrip,
      BOSS_SPELLS.rotgrip,
      undefined,
      'Rotgrip lurks in the murky pools before the falls.',
    ),
  );

  // --- Rotgrip → Princess Theradras ---
  out.push(
    ...diemetradons.slice(Math.ceil(diemetradons.length / 2)),
    ...snapjaws.slice(Math.ceil(snapjaws.length / 2)),
    ...deepBorers.slice(Math.ceil((2 * deepBorers.length) / 3)),
    ...theradrim.slice(Math.ceil(theradrim.length / 2)),
    ...vileLarvae.slice(Math.ceil((3 * vileLarvae.length) / 4)),
  );

  out.push(
    boss(
      'princess-theradras',
      'Princess Theradras',
      ENTRY.theradras,
      BOSS_SPELLS.theradras,
      [
        // E4: ON_DEATH → Zaetar's Spirit 12238 (epilogue NPC; combat spells only, no adds).
        { kind: 'onDeathSummon', creatureEntry: ENTRY.zaetarSpirit },
      ],
      "Princess Theradras, earth elemental of Maraudon, waits at the falls' heart.",
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 349,
    spine,
    entrance: entranceForInstance('maraudon'),
    
  });
}


// Survey quests completable inside map 349. Elder Splitrock 8635 excluded (D-10 Lunar Festival). World
// mining salves kept if survey-listed.
export const MARAUDON_QUESTS = [
  771, 7028, 7044, 7046, 7064, 7065, 4104, 4109, 5883, 5888,
] as const;

/** Export static census constants for tests (entry → count). */
export const MARAUDON_STATIC: Readonly<Record<number, number>> = {
  [ENTRY.putridusShadowstalker]: STATIC.putridusShadowstalker,
  [ENTRY.deeprotStomper]: STATIC.deeprotStomper,
  [ENTRY.putridusSatyr]: STATIC.putridusSatyr,
  [ENTRY.barbedLasher]: STATIC.barbedLasher,
  [ENTRY.deeprotTangler]: STATIC.deeprotTangler,
  [ENTRY.putridusTrickster]: STATIC.putridusTrickster,
  [ENTRY.cavernLurker]: STATIC.cavernLurker,
  [ENTRY.celebrianDryad]: STATIC.celebrianDryad,
  [ENTRY.constrictorVine]: STATIC.constrictorVine,
  [ENTRY.creepingSludge]: STATIC.creepingSludge,
  [ENTRY.cavernShambler]: STATIC.cavernShambler,
  [ENTRY.noxiousSlime]: STATIC.noxiousSlime,
  [ENTRY.sisterOfCelebrian]: STATIC.sisterOfCelebrian,
  [ENTRY.spiritMaraudos]: STATIC.spiritMaraudos,
  [ENTRY.diemetradon]: STATIC.diemetradon,
  [ENTRY.thessalaHydra]: STATIC.thessalaHydra,
  [ENTRY.spiritVeng]: STATIC.spiritVeng,
  [ENTRY.theradrimGuardian]: STATIC.theradrimGuardian,
  [ENTRY.primordialBehemoth]: STATIC.primordialBehemoth,
  [ENTRY.corruptor]: STATIC.corruptor,
  [ENTRY.poisonSprite]: STATIC.poisonSprite,
  [ENTRY.corruptForce]: STATIC.corruptForce,
  [ENTRY.vileLarva]: STATIC.vileLarva,
  [ENTRY.deepBorer]: STATIC.deepBorer,
  [ENTRY.stolidSnapjaw]: STATIC.stolidSnapjaw,
};

export const MARAUDON: InstanceDef = {
  id: 'maraudon',
  mapId: 349,
  name: 'Maraudon',
  portalZone: 'desolace',
  minLevel: 35, // entrance trigger 3133 / 3134 requiredLevel
  levelRange: [42, 49], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...MARAUDON_QUESTS],
  encounters: buildEncounters(),
};

// Counts only pure static trash packs (no bosses, no larva-spewer ambience packs). Used to assert census
// match and summon-only exclusion.
export function maraudonPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of MARAUDON.encounters) {
    if (enc.kind !== 'trash') continue;
    // E1 degrade pack is summon-only ambience, not census static.
    if (enc.id.startsWith('larva-spewer-')) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** Sum of authored kill counts per creature entry (trash + bosses + event spawns). */
export function maraudonKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of MARAUDON.encounters) {
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
  return map;
}
