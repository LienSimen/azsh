// QI4 — world/areatrigger_scripts residuals, extracted so the registry map stays under the
// 1500-line ratchet. Registered: 273, 4291, 6681, 7632, 8735. Cite: world/areatrigger_scripts.cpp.

import type { DbScriptIntent } from './types.ts';

/** Matches registry.ts QuestScriptHook — local to avoid circular import. */
type QuestScriptHook = 'accept' | 'reward' | 'complete' | 'frame';

/** Minimal registry entry shape (mirrors registry.ts QuestScriptEntry). */
export interface AreatriggerScriptsQuestScriptEntry {
  family?: string;
  questId?: number;
  questIds?: number[];
  hooks?: QuestScriptHook[];
  run?: (phase: QuestScriptHook, questId: number) => DbScriptIntent[];
  cite?: string;
}

// ── sourced constants ────────────────────────────────────────────────────────

/** Cite: areatrigger_scripts.cpp:77 QUEST_MANOR_RAVENHOLDT = 6681 AT kill-credit gate while INCOMPLETE. */
export const QUEST_MANOR_RAVENHOLDT = 6681;
/** Cite: areatrigger_scripts.cpp:94–95 QUEST_SCENT_OF_LARKORWI = 4291 AT summon mate while INCOMPLETE. */
export const QUEST_SCENT_OF_LARKORWI = 4291;
// Cite: areatrigger_scripts.cpp:157 QUEST_ANCIENT_LEAF = 7632 AT summon ancients when quest status COMPLETE
// (not incomplete).
export const QUEST_ANCIENT_LEAF = 7632;
// Cite: areatrigger_scripts.cpp:205 QUEST_RESUPPLYING_THE_EXCAVATION = 273 AT ambush + CompleteQuest while
// INCOMPLETE.
export const QUEST_RESUPPLYING_THE_EXCAVATION = 273;
// Cite: areatrigger_scripts.cpp:287 QUEST_NIGHTMARE_CORRUPTION = 8735 AT summon Twilight Corrupter while
// INCOMPLETE and missing item.
export const QUEST_NIGHTMARE_CORRUPTION = 8735;

// Cite: areatrigger_scripts.cpp:78 NPC_RAVENHOLDT = 13936 KilledMonsterCredit target; bake killTargets
// 13936×1.
const NPC_RAVENHOLDT = 13936;
/** Cite: bake enderCreatureEntries quest 6681 — Fahrad. */
const NPC_FAHRAD = 6707;
/** Cite: bake startedByItem / srcItem for 6681. Letter 17126 starts; Seal 17125 is deliver objective. */
const ITEM_SEAL_OF_RAVENHOLDT = 17125;
const ITEM_LETTER_RAVENHOLDT = 17126;

/** Cite: areatrigger_scripts.cpp:96 NPC_LARKORWI_MATE = 9683 Summoned at each scent AT when incomplete. */
const NPC_LARKORWI_MATE = 9683;
// Cite: areatrigger_scripts.cpp:29 ContentData AT ids for scent of Lar'korwi. 1726–1740 (15 egg ATs west of
// Torwa).
const AT_SCENT_LARKORWI_FIRST = 1726;
const AT_SCENT_LARKORWI_LAST = 1740;
// Cite: areatrigger_scripts.cpp:103 GetClosestCreatureWithEntry radius 25.0f Skip summon if a mate is
// already nearby (alive or dead scan).
const LARKORWI_MATE_EXISTING_SEARCH = 25.0;
/** Cite: areatrigger_scripts.cpp:104 SummonCreature o = 3.3f */
const LARKORWI_MATE_O = 3.3;
// Cite: Object.h:47 TEMPSPAWN_TIMED_OOC_DESPAWN = 5 areatrigger_scripts.cpp:104
// TEMPSPAWN_TIMED_OOC_DESPAWN.
const TEMPSPAWN_TIMED_OOC_DESPAWN = 5;
// Cite: areatrigger_scripts.cpp:104 2 * MINUTE * IN_MILLISECONDS MINUTE=60, IN_MILLISECONDS=1000 → 120000.
const LARKORWI_MATE_DESPAWN_MS = 2 * 60 * 1000;
/** Cite: bake starter/ender quest 4291 Torwa Pathfinder. */
const NPC_TORWA_PATHFINDER = 9619;
/** Cite: bake itemTargets quest 4291 — 2× Ravasaur Pheromone Gland. */
const ITEM_RAVASAUR_PHEROMONE_GLAND = 11509;

/** Cite: areatrigger_scripts.cpp:159–161 ancients for 7632. */
const NPC_VARTRUS = 14524;
const NPC_STOMA = 14525;
const NPC_HASTAT = 14526;
/** Cite: areatrigger_scripts.cpp:163 MAX_ANCIENTS = 3 */
const MAX_ANCIENTS = 3;
// Cite: areatrigger_scripts.cpp:172–177 afSpawnLocations Fixed summon positions for Vartrus / Stoma /
// Hastat.
const ANCIENT_SPAWNS = [
  { entry: NPC_VARTRUS, x: 6204.051758, y: -1172.575684, z: 370.079224, o: 0.86052 },
  { entry: NPC_STOMA, x: 6246.953613, y: -1155.985718, z: 366.182953, o: 2.90269 },
  { entry: NPC_HASTAT, x: 6193.449219, y: -1137.834106, z: 366.260529, o: 5.77332 },
] as const;
// Cite: areatrigger_scripts.cpp:188 GetClosestCreatureWithEntry radius 50.0f Skip if any ancient already
// present.
const ANCIENT_EXISTING_SEARCH = 50.0;
/** Cite: Object.h:46 TEMPSPAWN_TIMED_DESPAWN = 4 areatrigger_scripts.cpp:192 TEMPSPAWN_TIMED_DESPAWN. */
const TEMPSPAWN_TIMED_DESPAWN = 4;
/** Cite: areatrigger_scripts.cpp:192 5 * MINUTE * IN_MILLISECONDS → 300000 */
const ANCIENT_DESPAWN_MS = 5 * 60 * 1000;
/** Cite: areatrigger_scripts.cpp:33 ContentData at_ancient_leaf 3587 */
const AT_ANCIENT_LEAF = 3587;
/** Cite: bake startedByItem / item objective quest 7632. */
const ITEM_ANCIENT_PETRIFIED_LEAF = 18703;

/** Cite: areatrigger_scripts.cpp:207–210 ambush cast for 273. */
const NPC_SAEAN = 1380;
const NPC_MIRAN = 1379;
const NPC_HULDAR = 2057;
const NPC_DARK_IRON_AMBUSHER = 1981;
/** Cite: areatrigger_scripts.cpp:212 FACTION_HOSTILE = 14 Saean SetFactionTemporary on ambush. */
const FACTION_HOSTILE = 14;
// Cite: Creature.h:577 TEMPFACTION_RESTORE_RESPAWN = 0x01 areatrigger_scripts.cpp:261–266
// TEMPFACTION_RESTORE_RESPAWN.
const TEMPFACTION_RESTORE_RESPAWN = 0x01;
/** Cite: areatrigger_scripts.cpp:214 SAY_MIRAN_AMBUSH = -1010029 */
const SAY_MIRAN_AMBUSH = -1010029;
/** Cite: areatrigger_scripts.cpp:222–227 m_miranAmbushSpawns [0] Saean, [1]/[2] Dark Iron Ambushers. */
const MIRAN_AMBUSH_SPAWNS = [
  { x: -5760.73, y: -3437.71, z: 305.54, o: 2.41 },
  { x: -5759.85, y: -3441.29, z: 305.57, o: 2.24 },
  { x: -5757.75, y: -3437.61, z: 304.32, o: 2.56 },
] as const;
// Cite: Object.h:45 TEMPSPAWN_CORPSE_TIMED_DESPAWN = 3 areatrigger_scripts.cpp:264–273
// TEMPSPAWN_CORPSE_TIMED_DESPAWN, 25000.
const TEMPSPAWN_CORPSE_TIMED_DESPAWN = 3;
const MIRAN_AMBUSH_DESPAWN_MS = 25000;
// Cite: areatrigger_scripts.cpp:241–242 GetClosestCreatureWithEntry radius 60.0f Miran/Huldar required;
// Saean/ambushers scan same radius.
const MIRAN_SEARCH_RADIUS = 60.0;
/** Cite: areatrigger_scripts.cpp:33 ContentData at_huldar_miran 171 */
const AT_HULDAR_MIRAN = 171;
/** Cite: bake starterCreatureEntries quest 273 — Jern Hornhelm. */
const NPC_JERN_HORNHELM = 1105;

/** Cite: areatrigger_scripts.cpp:285–288 twilight grove residual for 8735. */
const NPC_TWILIGHT_CORRUPTER = 15625;
const ITEM_FRAGMENT_NIGHTMARE = 21149;
const SAY_TWILIGHT_CORRUPTER_SPAWN = -1000411;
/** Cite: areatrigger_scripts.cpp:291 m_twilightCorrupterSpawn */
const TWILIGHT_CORRUPTER_SPAWN = {
  x: -10326.3,
  y: -487.423,
  z: 50.1127,
  o: 5.73692,
} as const;
// Cite: areatrigger_scripts.cpp:307 GetClosestCreatureWithEntry radius 500.0f Skip if Corrupter already
// spawned.
const TWILIGHT_CORRUPTER_EXISTING_SEARCH = 500.0;
// Cite: areatrigger_scripts.cpp:311 TEMPSPAWN_TIMED_OOC_DESPAWN, 30 * MINUTE → 1800000 ms.
// TEMPSPAWN_TIMED_OOC_DESPAWN = 5 (Object.h:47).
const TWILIGHT_CORRUPTER_DESPAWN_MS = 30 * 60 * 1000;
/** Cite: areatrigger_scripts.cpp:33 ContentData at_twilight_grove 4017 */
const AT_TWILIGHT_GROVE = 4017;
/** Cite: bake starter/ender quest 8735 — Keeper Remulos. */
const NPC_KEEPER_REMULOS = 11832;

// ── frame residuals ──────────────────────────────────────────────────────────

// AreaTrigger_at_ravenholdt — quest 6681 The Manor, Ravenholdt: kill credit for NPC_RAVENHOLDT
// while incomplete. The letter item 17126 starts it, so there is no accept hook. Cite: :81–87.
function runRavenholdtAt(): DbScriptIntent[] {
  const citeAt =
    `areatrigger_scripts.cpp:81–87 AreaTrigger_at_ravenholdt ` +
    `QUEST_MANOR_RAVENHOLDT=${QUEST_MANOR_RAVENHOLDT} INCOMPLETE gate`;
  const citeCredit =
    `areatrigger_scripts.cpp:84 KilledMonsterCredit(NPC_RAVENHOLDT=${NPC_RAVENHOLDT})`;
  const citeTurn =
    `bake killTargets NPC_RAVENHOLDT=${NPC_RAVENHOLDT}×1 + item ${ITEM_SEAL_OF_RAVENHOLDT}; ` +
    `ender NPC_FAHRAD=${NPC_FAHRAD}; startedByItem ${ITEM_LETTER_RAVENHOLDT}`;
  return [
    {
      kind: 'skip',
      reason:
        `AT Ravenholdt requires incomplete ${QUEST_MANOR_RAVENHOLDT} (Rogue letter ${ITEM_LETTER_RAVENHOLDT})`,
      cite: citeAt,
    },
    {
      kind: 'kill_credit',
      creatureEntry: NPC_RAVENHOLDT,
      cite: citeCredit,
    },
    {
      kind: 'skip',
      reason:
        `turn-in NPC_FAHRAD (${NPC_FAHRAD}) with Seal ${ITEM_SEAL_OF_RAVENHOLDT} after credit ${NPC_RAVENHOLDT}`,
      cite: citeTurn,
    },
  ];
}

// AreaTrigger_at_scent_larkorwi — quest 4291: summon Lar'korwi's Mate at the trigger when none is
// within 25 yd, on a 2-minute OOC despawn. AT positions are DBC-driven. Cite: :99–108.
function runScentLarkorwiAt(): DbScriptIntent[] {
  const citeGate =
    `areatrigger_scripts.cpp:101 AreaTrigger_at_scent_larkorwi ` +
    `QUEST_SCENT_OF_LARKORWI=${QUEST_SCENT_OF_LARKORWI} alive+!GM+INCOMPLETE`;
  const citeFind =
    `areatrigger_scripts.cpp:103 GetClosestCreatureWithEntry(NPC_LARKORWI_MATE=` +
    `${NPC_LARKORWI_MATE}, ${LARKORWI_MATE_EXISTING_SEARCH}) - skip if present`;
  const citeSpawn =
    `areatrigger_scripts.cpp:104 SummonCreature(NPC_LARKORWI_MATE=${NPC_LARKORWI_MATE}, ` +
    `pAt->x/y/z o=${LARKORWI_MATE_O}, TEMPSPAWN_TIMED_OOC_DESPAWN=` +
    `${TEMPSPAWN_TIMED_OOC_DESPAWN}, ${LARKORWI_MATE_DESPAWN_MS}) AT ` +
    `${AT_SCENT_LARKORWI_FIRST}–${AT_SCENT_LARKORWI_LAST} - host places at fired AT`;
  const citeLoot =
    `bake itemTargets ITEM_RAVASAUR_PHEROMONE_GLAND=${ITEM_RAVASAUR_PHEROMONE_GLAND}×2; ` +
    `turn-in NPC_TORWA=${NPC_TORWA_PATHFINDER}`;
  return [
    {
      kind: 'skip',
      reason:
        `AT scent Lar'korwi requires incomplete ${QUEST_SCENT_OF_LARKORWI} and alive player`,
      cite: citeGate,
    },
    {
      kind: 'skip',
      reason:
        `GetClosestCreatureWithEntry(NPC_LARKORWI_MATE=${NPC_LARKORWI_MATE}, ` +
        `${LARKORWI_MATE_EXISTING_SEARCH}) - zone model assumes absent`,
      cite: citeFind,
    },
    {
      kind: 'skip',
      reason:
        `SummonCreature NPC_LARKORWI_MATE (${NPC_LARKORWI_MATE}) o=${LARKORWI_MATE_O} ` +
        `TEMPSPAWN_TIMED_OOC_DESPAWN (${TEMPSPAWN_TIMED_OOC_DESPAWN}) ` +
        `${LARKORWI_MATE_DESPAWN_MS}ms at AT ${AT_SCENT_LARKORWI_FIRST}–` +
        `${AT_SCENT_LARKORWI_LAST} - host AT coords`,
      cite: citeSpawn,
    },
    {
      kind: 'skip',
      reason:
        `loot ${ITEM_RAVASAUR_PHEROMONE_GLAND}×2 → turn-in NPC_TORWA (${NPC_TORWA_PATHFINDER})`,
      cite: citeLoot,
    },
  ];
}

// AreaTrigger_at_ancient_leaf — quest 7632: with the quest COMPLETE and no ender within 50 yd,
// summon Vartrus, Stoma and Hastat for 5 minutes so the hunter can turn in. Cite: :179–196.
function runAncientLeafAt(): DbScriptIntent[] {
  const citeGate =
    `areatrigger_scripts.cpp:181–185 AreaTrigger_at_ancient_leaf AT=${AT_ANCIENT_LEAF} ` +
    `QUEST_ANCIENT_LEAF=${QUEST_ANCIENT_LEAF} COMPLETE + alive + !GM`;
  const citeFind =
    `areatrigger_scripts.cpp:188 GetClosestCreatureWithEntry Vartrus/Stoma/Hastat ` +
    `${ANCIENT_EXISTING_SEARCH}yd - skip if any present`;
  const citeLoot =
    `bake startedByItem/itemTargets ITEM_ANCIENT_PETRIFIED_LEAF=` +
    `${ITEM_ANCIENT_PETRIFIED_LEAF}; ender NPC_VARTRUS=${NPC_VARTRUS}`;
  const intents: DbScriptIntent[] = [
    {
      kind: 'skip',
      reason:
        `AT ${AT_ANCIENT_LEAF} requires COMPLETE ${QUEST_ANCIENT_LEAF} (leaf ${ITEM_ANCIENT_PETRIFIED_LEAF}) and alive player`,
      cite: citeGate,
    },
    {
      kind: 'skip',
      reason:
        `GetClosestCreatureWithEntry ancients ${ANCIENT_EXISTING_SEARCH}yd - zone model assumes absent`,
      cite: citeFind,
    },
  ];
  for (let i = 0; i < MAX_ANCIENTS; i++) {
    const s = ANCIENT_SPAWNS[i]!;
    const citeSpawn =
      `areatrigger_scripts.cpp:191–192 afSpawnLocations[${i}] SummonCreature(` +
      `${s.entry}, ${s.x},${s.y},${s.z},${s.o}, TEMPSPAWN_TIMED_DESPAWN=` +
      `${TEMPSPAWN_TIMED_DESPAWN}, ${ANCIENT_DESPAWN_MS})`;
    intents.push({
      kind: 'temp_spawn_creature',
      creatureEntry: s.entry,
      x: s.x,
      y: s.y,
      z: s.z,
      o: s.o,
      despawnDelay: ANCIENT_DESPAWN_MS,
      pathId: 0,
      setRun: false,
      summonActive: false,
      spawnDataEntry: 0,
      spawnType: TEMPSPAWN_TIMED_DESPAWN,
      cite: citeSpawn,
    });
  }
  intents.push({
    kind: 'skip',
    reason: `turn-in NPC_VARTRUS (${NPC_VARTRUS}) with leaf ${ITEM_ANCIENT_PETRIFIED_LEAF}`,
    cite: citeLoot,
  });
  return intents;
}

// AreaTrigger_at_huldar_miran — quest 273: with Miran and Huldar in 60 yd, say the ambush line and
// CompleteQuest, then the Dark Iron ambush. The combat itself stays degraded. Cite: :229–277.
function runHuldarMiranAt(): DbScriptIntent[] {
  const citeGate =
    `areatrigger_scripts.cpp:231–235 AreaTrigger_at_huldar_miran AT=${AT_HULDAR_MIRAN} ` +
    `QUEST_RESUPPLYING_THE_EXCAVATION=${QUEST_RESUPPLYING_THE_EXCAVATION} ` +
    'alive+!GM+not COMPLETE/NONE';
  const citeNpcs =
    `areatrigger_scripts.cpp:241–247 GetClosestCreatureWithEntry NPC_MIRAN=` +
    `${NPC_MIRAN} / NPC_HULDAR=${NPC_HULDAR} / NPC_SAEAN=${NPC_SAEAN} ` +
    `${MIRAN_SEARCH_RADIUS}yd - require Miran+Huldar`;
  const citeTalk =
    `areatrigger_scripts.cpp:249 DoScriptText(SAY_MIRAN_AMBUSH=${SAY_MIRAN_AMBUSH}, Miran)`;
  const citeComplete =
    `areatrigger_scripts.cpp:252–253 CompleteQuest(${QUEST_RESUPPLYING_THE_EXCAVATION}) ` +
    '+ SendQuestCompleteEvent - specialFlags:2 finishEscort / recordEventHappens host';
  const citeSaean =
    `areatrigger_scripts.cpp:260–267 SummonCreature(NPC_SAEAN=${NPC_SAEAN} @ ` +
    `${MIRAN_AMBUSH_SPAWNS[0].x},${MIRAN_AMBUSH_SPAWNS[0].y}) ` +
    `TEMPSPAWN_CORPSE_TIMED_DESPAWN=${TEMPSPAWN_CORPSE_TIMED_DESPAWN} ` +
    `${MIRAN_AMBUSH_DESPAWN_MS}ms + SetFactionTemporary(FACTION_HOSTILE=` +
    `${FACTION_HOSTILE}, TEMPFACTION_RESTORE_RESPAWN=${TEMPFACTION_RESTORE_RESPAWN})`;
  const citeAmbush =
    `areatrigger_scripts.cpp:270–273 SummonCreature NPC_DARK_IRON_AMBUSHER=` +
    `${NPC_DARK_IRON_AMBUSHER} ×2 TEMPSPAWN_CORPSE_TIMED_DESPAWN ` +
    `${MIRAN_AMBUSH_DESPAWN_MS}ms - FO6 combat`;
  const citeEnder =
    `bake enderCreatureEntries NPC_HULDAR=${NPC_HULDAR}; starter NPC_JERN=` +
    `${NPC_JERN_HORNHELM}; specialFlags:2`;
  return [
    {
      kind: 'skip',
      reason:
        `AT ${AT_HULDAR_MIRAN} requires incomplete ${QUEST_RESUPPLYING_THE_EXCAVATION} and alive player`,
      cite: citeGate,
    },
    {
      kind: 'skip',
      reason:
        `require NPC_MIRAN (${NPC_MIRAN}) + NPC_HULDAR (${NPC_HULDAR}) within ` +
        `${MIRAN_SEARCH_RADIUS}yd - zone model assumes present`,
      cite: citeNpcs,
    },
    {
      kind: 'talk',
      textId: SAY_MIRAN_AMBUSH,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `CompleteQuest(${QUEST_RESUPPLYING_THE_EXCAVATION}) + SendQuestCompleteEvent ` +
        '- specialFlags:2 finishEscort host',
      cite: citeComplete,
    },
    {
      kind: 'temp_spawn_creature',
      creatureEntry: NPC_SAEAN,
      x: MIRAN_AMBUSH_SPAWNS[0].x,
      y: MIRAN_AMBUSH_SPAWNS[0].y,
      z: MIRAN_AMBUSH_SPAWNS[0].z,
      o: MIRAN_AMBUSH_SPAWNS[0].o,
      despawnDelay: MIRAN_AMBUSH_DESPAWN_MS,
      pathId: 0,
      setRun: false,
      summonActive: false,
      spawnDataEntry: 0,
      spawnType: TEMPSPAWN_CORPSE_TIMED_DESPAWN,
      cite: citeSaean,
    },
    {
      kind: 'set_faction',
      factionId: FACTION_HOSTILE,
      flags: TEMPFACTION_RESTORE_RESPAWN,
      cleared: false,
      cite: citeSaean,
    },
    {
      kind: 'temp_spawn_creature',
      creatureEntry: NPC_DARK_IRON_AMBUSHER,
      x: MIRAN_AMBUSH_SPAWNS[1].x,
      y: MIRAN_AMBUSH_SPAWNS[1].y,
      z: MIRAN_AMBUSH_SPAWNS[1].z,
      o: MIRAN_AMBUSH_SPAWNS[1].o,
      despawnDelay: MIRAN_AMBUSH_DESPAWN_MS,
      pathId: 0,
      setRun: false,
      summonActive: false,
      spawnDataEntry: 0,
      spawnType: TEMPSPAWN_CORPSE_TIMED_DESPAWN,
      cite: citeAmbush,
    },
    {
      kind: 'temp_spawn_creature',
      creatureEntry: NPC_DARK_IRON_AMBUSHER,
      x: MIRAN_AMBUSH_SPAWNS[2].x,
      y: MIRAN_AMBUSH_SPAWNS[2].y,
      z: MIRAN_AMBUSH_SPAWNS[2].z,
      o: MIRAN_AMBUSH_SPAWNS[2].o,
      despawnDelay: MIRAN_AMBUSH_DESPAWN_MS,
      pathId: 0,
      setRun: false,
      summonActive: false,
      spawnDataEntry: 0,
      spawnType: TEMPSPAWN_CORPSE_TIMED_DESPAWN,
      cite: citeAmbush,
    },
    {
      kind: 'skip',
      reason: `ambush combat FO6 → turn-in NPC_HULDAR (${NPC_HULDAR}) after CompleteQuest`,
      cite: citeEnder,
    },
  ];
}

// AreaTrigger_at_twilight_grove — quest 8735: without fragment 21149 and no Corrupter within
// 500 yd, summon 15625 for 30 minutes and say its spawn line. Cite: :293–318.
function runTwilightGroveAt(): DbScriptIntent[] {
  const citeGate =
    `areatrigger_scripts.cpp:296–300 AreaTrigger_at_twilight_grove AT=${AT_TWILIGHT_GROVE} ` +
    `QUEST_NIGHTMARE_CORRUPTION=${QUEST_NIGHTMARE_CORRUPTION} alive+!GM+INCOMPLETE ` +
    `!HasItemCount(ITEM_FRAGMENT_NIGHTMARE=${ITEM_FRAGMENT_NIGHTMARE},1)`;
  const citeFind =
    `areatrigger_scripts.cpp:307 GetClosestCreatureWithEntry(NPC_TWILIGHT_CORRUPTER=` +
    `${NPC_TWILIGHT_CORRUPTER}, ${TWILIGHT_CORRUPTER_EXISTING_SEARCH}) - skip if present`;
  const citeSpawn =
    `areatrigger_scripts.cpp:311 SummonCreature(NPC_TWILIGHT_CORRUPTER=` +
    `${NPC_TWILIGHT_CORRUPTER}, (${TWILIGHT_CORRUPTER_SPAWN.x},${TWILIGHT_CORRUPTER_SPAWN.y},` +
    `${TWILIGHT_CORRUPTER_SPAWN.z},${TWILIGHT_CORRUPTER_SPAWN.o}), TEMPSPAWN_TIMED_OOC_DESPAWN=` +
    `${TEMPSPAWN_TIMED_OOC_DESPAWN}, ${TWILIGHT_CORRUPTER_DESPAWN_MS})`;
  const citeTalk =
    `areatrigger_scripts.cpp:313 DoScriptText(SAY_TWILIGHT_CORRUPTER_SPAWN=` +
    `${SAY_TWILIGHT_CORRUPTER_SPAWN}, Corrupter, player)`;
  const citeLoot =
    `bake itemTargets include ITEM_FRAGMENT_NIGHTMARE=${ITEM_FRAGMENT_NIGHTMARE}; ` +
    `turn-in NPC_KEEPER_REMULOS=${NPC_KEEPER_REMULOS}`;
  return [
    {
      kind: 'skip',
      reason:
        `AT ${AT_TWILIGHT_GROVE} requires incomplete ${QUEST_NIGHTMARE_CORRUPTION} ` +
        `without item ${ITEM_FRAGMENT_NIGHTMARE}`,
      cite: citeGate,
    },
    {
      kind: 'skip',
      reason:
        `GetClosestCreatureWithEntry(NPC_TWILIGHT_CORRUPTER=${NPC_TWILIGHT_CORRUPTER}, ` +
        `${TWILIGHT_CORRUPTER_EXISTING_SEARCH}) - zone model assumes absent`,
      cite: citeFind,
    },
    {
      kind: 'temp_spawn_creature',
      creatureEntry: NPC_TWILIGHT_CORRUPTER,
      x: TWILIGHT_CORRUPTER_SPAWN.x,
      y: TWILIGHT_CORRUPTER_SPAWN.y,
      z: TWILIGHT_CORRUPTER_SPAWN.z,
      o: TWILIGHT_CORRUPTER_SPAWN.o,
      despawnDelay: TWILIGHT_CORRUPTER_DESPAWN_MS,
      pathId: 0,
      setRun: false,
      summonActive: false,
      spawnDataEntry: 0,
      spawnType: TEMPSPAWN_TIMED_OOC_DESPAWN,
      cite: citeSpawn,
    },
    {
      kind: 'talk',
      textId: SAY_TWILIGHT_CORRUPTER_SPAWN,
      stringTemplateId: 0,
      cite: citeTalk,
    },
    {
      kind: 'skip',
      reason:
        `loot ${ITEM_FRAGMENT_NIGHTMARE} (+ other fragments host) → turn-in Remulos ` +
        `(${NPC_KEEPER_REMULOS})`,
      cite: citeLoot,
    },
  ];
}

// Family pack: world/areatrigger_scripts.cpp Residuals: ravenholdt (6681), scent larkorwi (4291), ancient
// leaf (7632), huldar/miran (273), twilight grove (8735). All frame/complete only.
export function runAreatriggerScripts(
  phase: QuestScriptHook,
  questId: number,
): DbScriptIntent[] {
  if (phase !== 'frame' && phase !== 'complete') return [];
  if (questId === QUEST_MANOR_RAVENHOLDT) return runRavenholdtAt();
  if (questId === QUEST_SCENT_OF_LARKORWI) return runScentLarkorwiAt();
  if (questId === QUEST_ANCIENT_LEAF) return runAncientLeafAt();
  if (questId === QUEST_RESUPPLYING_THE_EXCAVATION) return runHuldarMiranAt();
  if (questId === QUEST_NIGHTMARE_CORRUPTION) return runTwilightGroveAt();
  return [];
}

// Map entries spread into QUEST_SCRIPT_REGISTRY (keeps registry.ts under 1500). next-batch.mjs also matches
// `family: 'world/areatrigger_scripts'` in registry.ts.
export const AREATRIGGER_SCRIPTS_REGISTRY: Record<
  string | number,
  AreatriggerScriptsQuestScriptEntry
> = {
  'world/areatrigger_scripts': {
    family: 'world/areatrigger_scripts',
    questIds: [
      QUEST_RESUPPLYING_THE_EXCAVATION,
      QUEST_SCENT_OF_LARKORWI,
      QUEST_MANOR_RAVENHOLDT,
      QUEST_ANCIENT_LEAF,
      QUEST_NIGHTMARE_CORRUPTION,
    ],
    hooks: ['frame', 'complete'],
    cite:
      'world/areatrigger_scripts.cpp:81–87,99–108,179–196,229–277,293–318',
    run: runAreatriggerScripts,
  },
  [QUEST_RESUPPLYING_THE_EXCAVATION]: {
    family: 'world/areatrigger_scripts',
    questId: QUEST_RESUPPLYING_THE_EXCAVATION,
    questIds: [QUEST_RESUPPLYING_THE_EXCAVATION],
    hooks: ['frame', 'complete'],
    cite: 'areatrigger_scripts.cpp:229–277 AreaTrigger_at_huldar_miran',
    run: runAreatriggerScripts,
  },
  [QUEST_SCENT_OF_LARKORWI]: {
    family: 'world/areatrigger_scripts',
    questId: QUEST_SCENT_OF_LARKORWI,
    questIds: [QUEST_SCENT_OF_LARKORWI],
    hooks: ['frame', 'complete'],
    cite: 'areatrigger_scripts.cpp:99–108 AreaTrigger_at_scent_larkorwi',
    run: runAreatriggerScripts,
  },
  [QUEST_MANOR_RAVENHOLDT]: {
    family: 'world/areatrigger_scripts',
    questId: QUEST_MANOR_RAVENHOLDT,
    questIds: [QUEST_MANOR_RAVENHOLDT],
    hooks: ['frame', 'complete'],
    cite: 'areatrigger_scripts.cpp:81–87 AreaTrigger_at_ravenholdt',
    run: runAreatriggerScripts,
  },
  [QUEST_ANCIENT_LEAF]: {
    family: 'world/areatrigger_scripts',
    questId: QUEST_ANCIENT_LEAF,
    questIds: [QUEST_ANCIENT_LEAF],
    hooks: ['frame', 'complete'],
    cite: 'areatrigger_scripts.cpp:179–196 AreaTrigger_at_ancient_leaf',
    run: runAreatriggerScripts,
  },
  [QUEST_NIGHTMARE_CORRUPTION]: {
    family: 'world/areatrigger_scripts',
    questId: QUEST_NIGHTMARE_CORRUPTION,
    questIds: [QUEST_NIGHTMARE_CORRUPTION],
    hooks: ['frame', 'complete'],
    cite: 'areatrigger_scripts.cpp:293–318 AreaTrigger_at_twilight_grove',
    run: runAreatriggerScripts,
  },
};
