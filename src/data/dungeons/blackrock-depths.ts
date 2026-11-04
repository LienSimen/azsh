// Blackrock Depths (map 230) — InstanceDef graph. Authority: docs/dungeons/survey/15-blackrock-depths.md,
// which also carries the residual GAPS list. Ring of Law rolls per run; Theldren is dispositioned.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
} from './pack-from-clusters.ts';

// ---- Census static counts (map 230; survey creature census static column) ----
// Friendly/service, bosses and summon-only entries leave the kill population; see the survey.

/** Pure static trash totals (non-boss, non-friendly, non-summon-only). Survey static column. */
export const STATIC = {
  anvilrageOverseer: 4, // 8889
  anvilrageWarden: 35, // 8890
  anvilrageGuardsman: 57, // 8891
  anvilrageFootman: 55, // 8892
  anvilrageSoldier: 38, // 8893
  anvilrageMedic: 31, // 8894
  anvilrageOfficer: 20, // 8895
  shadowforgePeasant: 42, // 8896
  doomforgeCraftsman: 24, // 8897
  anvilrageMarshal: 12, // 8898
  doomforgeDragoon: 16, // 8899
  doomforgeArcanasmith: 29, // 8900
  anvilrageReservist: 244, // 8901
  shadowforgeCitizen: 16, // 8902
  anvilrageCaptain: 2, // 8903
  shadowforgeSenator: 40, // 8904
  warbringerConstruct: 12, // 8905
  ragereaverGolem: 8, // 8906
  wrathHammerConstruct: 8, // 8907
  moltenWarGolem: 6, // 8908
  fireguard: 11, // 8909
  blazingFireguard: 19, // 8910
  fireguardDestroyer: 45, // 8911
  twilightTorturer: 24, // 8912
  twilightEmissary: 18, // 8913
  twilightBodyguard: 5, // 8914
  twilightAmbassador: 12, // 8915
  arenaSpectator: 24, // 8916
  weaponTechnician: 26, // 8920
  bloodhound: 96, // 8921
  bloodhoundMastiff: 6, // 8922
  ironhandGuardian: 6, // 8982
  shadowforgeFlameKeeper: 12, // 9956
  // Ograbisi 9677 / Crest Killer 9680 / Jaz 9681 / Slave 10116 / Tortured Slave 10117:
  // faction 35 friendly-to-all — not pure static kill trash (see nonCombatTrashEntries).
} as const;

/** Entry → count map for tests (pure static only). */
export const BLACKROCK_DEPTHS_STATIC: Readonly<Record<number, number>> = {
  8889: STATIC.anvilrageOverseer,
  8890: STATIC.anvilrageWarden,
  8891: STATIC.anvilrageGuardsman,
  8892: STATIC.anvilrageFootman,
  8893: STATIC.anvilrageSoldier,
  8894: STATIC.anvilrageMedic,
  8895: STATIC.anvilrageOfficer,
  8896: STATIC.shadowforgePeasant,
  8897: STATIC.doomforgeCraftsman,
  8898: STATIC.anvilrageMarshal,
  8899: STATIC.doomforgeDragoon,
  8900: STATIC.doomforgeArcanasmith,
  8901: STATIC.anvilrageReservist,
  8902: STATIC.shadowforgeCitizen,
  8903: STATIC.anvilrageCaptain,
  8904: STATIC.shadowforgeSenator,
  8905: STATIC.warbringerConstruct,
  8906: STATIC.ragereaverGolem,
  8907: STATIC.wrathHammerConstruct,
  8908: STATIC.moltenWarGolem,
  8909: STATIC.fireguard,
  8910: STATIC.blazingFireguard,
  8911: STATIC.fireguardDestroyer,
  8912: STATIC.twilightTorturer,
  8913: STATIC.twilightEmissary,
  8914: STATIC.twilightBodyguard,
  8915: STATIC.twilightAmbassador,
  8916: STATIC.arenaSpectator,
  8920: STATIC.weaponTechnician,
  8921: STATIC.bloodhound,
  8922: STATIC.bloodhoundMastiff,
  8982: STATIC.ironhandGuardian,
  9956: STATIC.shadowforgeFlameKeeper,
};

export const ENTRY = {
  anvilrageOverseer: 8889,
  anvilrageWarden: 8890,
  anvilrageGuardsman: 8891,
  anvilrageFootman: 8892,
  anvilrageSoldier: 8893,
  anvilrageMedic: 8894,
  anvilrageOfficer: 8895,
  shadowforgePeasant: 8896,
  doomforgeCraftsman: 8897,
  anvilrageMarshal: 8898,
  doomforgeDragoon: 8899,
  doomforgeArcanasmith: 8900,
  anvilrageReservist: 8901,
  shadowforgeCitizen: 8902,
  anvilrageCaptain: 8903,
  shadowforgeSenator: 8904,
  warbringerConstruct: 8905,
  ragereaverGolem: 8906,
  wrathHammerConstruct: 8907,
  moltenWarGolem: 8908,
  fireguard: 8909,
  blazingFireguard: 8910,
  fireguardDestroyer: 8911,
  twilightTorturer: 8912,
  twilightEmissary: 8913,
  twilightBodyguard: 8914,
  twilightAmbassador: 8915,
  arenaSpectator: 8916,
  weaponTechnician: 8920,
  bloodhound: 8921,
  bloodhoundMastiff: 8922,
  ironhandGuardian: 8982,
  shadowforgeFlameKeeper: 9956,
  /** Jail crooks / slaves — friendly faction 35; kept as id constants only (not kill trash). */
  ograbisi: 9677,
  crestKiller: 9680,
  jaz: 9681,
  slave: 10116,
  torturedSlave: 10117,
  verek: 9042,
  // Canonical bosses (survey order)
  lordRoccor: 9025,
  highInterrogatorGerstahn: 9018,
  houndmasterGrebmar: 9319,
  // Ring of Law pool (summon-only 1 of 6)
  anubshiah: 9031,
  eviscerator: 9029,
  gorosh: 9027,
  grizzle: 9028,
  hedrum: 9032,
  okthor: 9030,
  pyromancerLoregrain: 9024,
  lordIncendius: 9017,
  warderStilgiss: 9041,
  fineousDarkvire: 9056,
  baelgar: 9016,
  generalAngerforge: 9033,
  golemLordArgelmach: 8983,
  hurleyBlackbreath: 9537, // summon-only
  phalanx: 9502,
  ribbly: 9543,
  plugger: 9499,
  ambassadorFlamelash: 9156,
  panzor: 8923,
  doomrel: 9039,
  magmus: 9938,
  princessMoira: 8929,
  emperorDagran: 9019,
  // Tomb of the Seven (event-awakened; waves on Doom'rel)
  angerrel: 9035,
  seethrel: 9038,
  doperel: 9040,
  gloomrel: 9037,
  vilerel: 9036,
  haterel: 9034,
  // Event summon-only — Ring of Law trash pool (blackrock_depths.h :177–182)
  ringWorm: 8925, // NPC_WORM
  ringStinger: 8926, // NPC_STINGER
  ringScreecher: 8927, // NPC_SCREECHER
  ringThundersnout: 8928, // NPC_THUNDERSNOUT
  ringCreeper: 8933, // NPC_CREEPER
  ringBeetle: 8932, // NPC_BEETLE
  blackbreathCrony: 9541,
  /** Grim Guzzler patrons. Cite: blackrock_depths.h:68-70. */
  grimPatron: 9545,
  guzzlingPatron: 9547,
  hammeredPatron: 9554,
  burningSpirit: 9178,
  watchmanDoomgrip: 9476,
  /** Survey E3 jail wave finale — Twilight's Hammer Executioner (summon-only). */
  twilightExecutioner: 9398,
} as const;

/** Flags from survey event choreography / instance_blackrock_depths.cpp. */
export const BLACKROCK_DEPTHS_FLAGS = {
  ringOfLaw: 'brd-ring-of-law',
  hurleyKegs: 'brd-hurley-kegs',
  vaultCoffers: 'brd-vault-coffers',
  tombOfSeven: 'brd-tomb-of-seven',
  lyceumBraziers: 'brd-lyceum-braziers',
  /** Survey E3 Gor'shak jail defense complete (quest 3982 combat half). */
  gorshakJail: 'brd-gorshak-jail',
  /** Detention Block Cell Doors 170562–170569. Prison Cell Key 11140 from Gerstahn. */
  cellDoors: 'brd-cell-doors',
  /** E5e bar patrol after Ribbly (TYPE_BAR). Cite: instance_blackrock_depths.cpp:546-555. */
  barPatrol: 'brd-bar-patrol',
} as const;

/** Alias matching brief export name. */
export const FLAGS = BLACKROCK_DEPTHS_FLAGS;

// Survey E1 Ring of Law — Arena Gate east, standing in for areatrigger 1526. One mob type
// (urand 0–5) for both trash waves, then one boss. Cite: blackrock_depths.cpp :197–202.
export const BRD_RING_OF_LAW = {
  /** ArenaGate01 - flash+opens when arena starts (survey E1). GO_ARENA_1. */
  goEntry: 161525,
  // aRingMob[0] entries + aRingMob[1] counts per wave (two waves). Order: WORM, STINGER, SCREECHER,
  // THUNDERSNOUT, CREEPER, BEETLE.
  mobPool: [
    { entry: ENTRY.ringWorm, count: 4 }, // 8925
    { entry: ENTRY.ringStinger, count: 2 }, // 8926
    { entry: ENTRY.ringScreecher, count: 5 }, // 8927
    { entry: ENTRY.ringThundersnout, count: 3 }, // 8928
    { entry: ENTRY.ringCreeper, count: 3 }, // 8933
    { entry: ENTRY.ringBeetle, count: 7 }, // 8932
  ] as const,
  /** aRingBoss[] — one rolled per run. */
  bossPool: [
    ENTRY.gorosh, // 9027
    ENTRY.grizzle, // 9028
    ENTRY.eviscerator, // 9029
    ENTRY.okthor, // 9030
    ENTRY.anubshiah, // 9031
    ENTRY.hedrum, // 9032
  ] as const,
  /** Placeholder primary for graph inspection (overwritten at fight materialize). */
  bossEntry: ENTRY.gorosh,
  /** Placeholder trash (overwritten at fight materialize). */
  trashEntry: ENTRY.ringWorm,
  trashPerWave: 4,
  waveCount: 2,
  /** POS_EAST — blackrock_depths.cpp:191 aSpawnPositions[0]. */
  mobSpawn: { x: 608.96, y: -235.322, z: -53.907 },
  /** POS_NORTH — blackrock_depths.cpp:192 aSpawnPositions[1] (enc.origin). */
  bossSpawn: { x: 644.3, y: -175.989, z: -53.739 },
  /** aArenaCrowdVolume / at_ring_of_law centre — blackrock_depths.h:162. */
  arenaCenter: { x: 595.78, y: -188.65, z: -38.63 },
  /** Wave1→wave2 m_uiEventTimer — blackrock_depths.cpp:459-460. */
  mobWaveGapMs: 16_000,
  /** Last-mob-wave→boss after SummonedCreatureJustDied — blackrock_depths.cpp:318-319. */
  bossAfterClearMs: 5_000,
} as const;

// Sticky per-attempt seed shared by floor gauntlet + beginEncounter. bodyGuid FNV matches
// summonedBodyGuid(encId); salt = clearedGuids.length.
export function ringOfLawAttemptSeed(encId: string, clearedCount: number): number {
  let h = 2166136261;
  for (let i = 0; i < encId.length; i++) {
    h ^= encId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bodyGuid = -(1 + ((h >>> 0) % 0x7fffffff));
  return (bodyGuid ^ Math.imul(clearedCount, 2654435761)) >>> 0;
}

// Roll Ring of Law waves + boss for one fight (seeded rng [0,1)). Sticky: both trash waves share one mob
// type; boss is independent 1-of-6. Cite: m_uiMobSpawnId :241; SummonRingMob waves :459/:464; boss :502.
export function materializeRingOfLawEncounter(
  enc: EncounterDef,
  rng: () => number,
): EncounterDef {
  if (enc.id !== 'ring-of-law') return enc;
  const mobN = BRD_RING_OF_LAW.mobPool.length;
  const bossN = BRD_RING_OF_LAW.bossPool.length;
  const mobIdx = Math.min(mobN - 1, Math.floor(rng() * mobN));
  const bossIdx = Math.min(bossN - 1, Math.floor(rng() * bossN));
  const mob = BRD_RING_OF_LAW.mobPool[mobIdx]!;
  const boss = BRD_RING_OF_LAW.bossPool[bossIdx]!;
  const waves = [
    { pack: [{ creatureEntry: mob.entry, count: mob.count }] },
    { pack: [{ creatureEntry: mob.entry, count: mob.count }] },
    { pack: [{ creatureEntry: boss, count: 1 }] },
  ];
  return {
    ...enc,
    creatureEntry: boss,
    events: (enc.events ?? []).map((ev) =>
      ev.kind === 'waves' ? { kind: 'waves' as const, waves } : ev,
    ),
  };
}

// Survey E5d Hurley — 3× Thunderbrew Lager Keg GO 164911. Cite: instance_blackrock_depths.cpp:319-351
// TYPE_HURLEY SPECIAL; m_uiBrokenKegs==3 :324.
export const BRD_HURLEY_KEGS = {
  goEntry: 164911,
  /** Cite: instance_blackrock_depths.cpp:324 m_uiBrokenKegs == 3. */
  needUses: 3,
  cronyEntry: ENTRY.blackbreathCrony,
  /** Cite: blackrock_depths.h:14 MAX_CRONIES = 3. */
  cronyCount: 3,
  /** Cite: blackrock_depths.h:206 aHurleyPositions. */
  spawn: { x: 856.0867, y: -149.7469, z: -49.6719, o: 0.05949629 },
} as const;

// Ribbly's fight starts from gossip 1970: dbscripts_on_gossip 197001 sets faction 21 then 736 on him
// and his three cronies (10043, by guid) and ATTACK_STARTs at +5 s; template 735 is friendly.
export const BRD_RIBBLY = {
  encId: 'ribbly-screwspigot',
  entry: ENTRY.ribbly,
  cronyEntry: 10043,
  cronyGuids: [2301109, 2301110, 2301111] as const,
  gossipMenu: 1970,
} as const;

// Survey E5e bar patrol — Ribbly death → 1×8911 + 2×8895 unless Plugger is already hostile.
// Cite: instance_blackrock_depths.cpp:546-555; HandleBarPatrol :707-720.
export const BRD_BAR_PATROL = {
  destroyerEntry: ENTRY.fireguardDestroyer,
  destroyerCount: 1,
  officerEntry: ENTRY.anvilrageOfficer,
  officerCount: 2,
  /** Behind bar door. Cite: blackrock_depths.h:209-212 aBarPatrolPositions[0]. */
  spawn: { x: 872.7059, y: -232.5491, z: -43.7525, o: 2.069044 },
} as const;

// Survey E5a Rocknot ale path (Phalanx residual — quest turn-in, not InstanceDef objectGate). Cite:
// blackrock_depths.cpp:1081-1107 QuestRewarded 4295; instance GetData TYPE_ROCKNOT :411 m_uiBarAleCount==3.
export const BRD_ROCKNOT = {
  questId: 4295,
  alesNeeded: 3,
} as const;

// Plugger's death turns the bar: every patron takes FACTION_DARK_IRON and Phalanx FACTION_IRONFORGE
// (hostile to Horde only, "do not ask why"). Cite: instance_blackrock_depths.cpp:665-671; blackrock_depths.cpp:628-633.
export const BRD_BAR_HOSTILE = {
  patronEntries: [ENTRY.grimPatron, ENTRY.guzzlingPatron, ENTRY.hammeredPatron] as const,
  /** Cite: blackrock_depths.h:122 FACTION_DARK_IRON = 54. */
  patronFaction: 54,
  phalanxEntry: ENTRY.phalanx,
  /** Cite: blackrock_depths.h:123 FACTION_IRONFORGE = 122. */
  phalanxFaction: 122,
  /** Rocknot and Nagmara leave when the bar turns. Cite: instance_blackrock_depths.cpp:674-683. */
  despawnEntries: [9503, 9500] as const,
} as const;

// Survey E5c Plugger theft residual (mug/boar GO use → 3 steals). Cite: blackrock_depths.cpp:1814-1836
// go_bar_ale_mug; instance:366-376 m_uiStolenAles==3.
export const BRD_PLUGGER_THEFT = {
  goEntries: [165738, 165739] as const,
  stealsNeeded: 3,
} as const;

// Survey E9 Angerforge <30% alarm. ScriptDev owns first pulse; 3-min re-arm schedule below. Cite:
// boss_general_angerforge.cpp:93-108; NPC_NORMAL_AMOUNT=8 :40; NPC_ELITE_AMOUNT=2 :39.
export const BRD_ANGERFORGE = {
  /** Cite: boss_general_angerforge.cpp:93 GetHealthPercent() < 30.0f. */
  pct: 30,
  reservistEntry: ENTRY.anvilrageReservist,
  /** Cite: boss_general_angerforge.cpp:40 NPC_NORMAL_AMOUNT = 8. */
  reservistCount: 8,
  medicEntry: ENTRY.anvilrageMedic,
  /** Cite: boss_general_angerforge.cpp:39 NPC_ELITE_AMOUNT = 2. */
  medicCount: 2,
  /** Cite: boss_general_angerforge.cpp:104 m_uiAlarmTimer = 3 * MINUTE * IN_MILLISECONDS. */
  alarmRepeatMs: 180_000,
  /** Cite: boss_general_angerforge.cpp:43 aAlarmPoint. */
  alarmPoint: { x: 717.343, y: 22.116, z: -45.4321, o: 3.1415 },
} as const;

// Alarm pulses after first <30% arm (ms spent in alarm phase). First at 0, then every 3 min. Cite:
// boss_general_angerforge.cpp:95-108.
export function angerforgeAlarmsByMs(msInAlarmPhase: number): number {
  if (msInAlarmPhase < 0) return 0;
  return 1 + Math.floor(msInAlarmPhase / BRD_ANGERFORGE.alarmRepeatMs);
}

// Survey E8 Flamelash — pull inject ScriptDev; continuous spirit schedule helpers below. Cite:
// boss_ambassador_flamelash.cpp:81-91 Aggro; :127-137 spirit timers; h:13 MAX_DWARF_RUNES.
export const BRD_FLAMELASH = {
  /** Cite: boss_ambassador_flamelash.cpp:88-91 SummonCreature NPC_FIREGUARD_DESTROYER ×4 (door; a return pull only). */
  destroyerEntry: ENTRY.fireguardDestroyer,
  destroyerCount: 4,
  spiritEntry: ENTRY.burningSpirit,
  /** Cite: blackrock_depths.h:13 MAX_DWARF_RUNES = 7. */
  runeCount: 7,
  /** Cite: boss_ambassador_flamelash.cpp:53-54 Reset m_uiSpiritTimer[i] = urand(0, 1000). */
  spiritFirstMaxMs: 1_000,
  /** Cite: boss_ambassador_flamelash.cpp:133 re-arm urand(15000, 30000). */
  spiritRepeatMinMs: 15_000,
  spiritRepeatMaxMs: 30_000,
} as const;

// Min-bound spirits per rune by combat ms (first@0, then every spiritRepeatMinMs). Cite:
// boss_ambassador_flamelash.cpp:53-54,133.
export function flamelashSpiritsPerRuneByMs(fightMs: number): number {
  if (fightMs < 0) return 0;
  return 1 + Math.floor(fightMs / BRD_FLAMELASH.spiritRepeatMinMs);
}

/** All 7 runes × per-rune min-bound stream. Cite: MAX_DWARF_RUNES. */
export function flamelashSpiritsExpectedByMs(fightMs: number): number {
  return flamelashSpiritsPerRuneByMs(fightMs) * BRD_FLAMELASH.runeCount;
}

// Survey E6 Tomb of the Seven — fixed dwarf order; 30s auto-call while previous still up. Cite:
// blackrock_depths.h:218 aTombDwarfes; instance DoCallNextDwarf :581-593.
export const BRD_TOMB_OF_SEVEN = {
  encId: 'doomrel',
  order: [
    ENTRY.angerrel, // 9035
    ENTRY.seethrel, // 9038
    ENTRY.doperel, // 9040
    ENTRY.gloomrel, // 9037
    ENTRY.vilerel, // 9036
    ENTRY.haterel, // 9034
    ENTRY.doomrel, // 9039
  ] as const,
  /** Cite: instance_blackrock_depths.cpp:591,768 m_uiDwarfFightTimer = 30000. */
  dwarfFightTimerMs: 30_000,
} as const;

/** Absolute call time for dwarf index 0..6 (first at event start). Cite: DoCallNextDwarf. */
export function tombDwarfCallAtMs(dwarfIndex: number): number {
  if (dwarfIndex <= 0) return 0;
  return dwarfIndex * BRD_TOMB_OF_SEVEN.dwarfFightTimerMs;
}

// Survey E7 Vault — 12 Relic Coffer Doors + 4 un-stoned Warbringers + Doomgrip.
// Cite: blackrock_depths.cpp go_relic_coffer_door; instance SetData TYPE_VAULT :204-227.
export const BRD_VAULT = {
  goEntry: 174554,
  goEntries: [
    174554, 174555, 174556, 174557, 174558, 174559,
    174560, 174561, 174562, 174563, 174564, 174566,
  ] as const,
  /** Cite: blackrock_depths.h:11 MAX_RELIC_DOORS = 12. */
  needUses: 12,
  doomgripEntry: ENTRY.watchmanDoomgrip,
  /** Cite: blackrock_depths.h:42 NPC_WARBRINGER_CONST; survey E7 four vault constructs. */
  constructEntry: ENTRY.warbringerConstruct,
  constructCount: 4,
  /** Cite: blackrock_depths.h:203 aVaultPositions. */
  doomgripSpawn: { x: 821.905, y: -338.382, z: -50.134, o: 3.78736 },
  /** Cite: blackrock_depths.h:118 SPELL_STONED = 10255 (removed on vault activate). */
  stonedSpellId: 10255,
} as const;

// Survey E10 Lyceum - both Shadowforge Braziers 174744 + 174745. Cite: survey 15-blackrock-depths.md E10;
// blackrock_depths.cpp go_shadowforge_brazier.
export const BRD_LYCEUM_BRAZIERS = {
  goEntry: 174744,
  goEntries: [174744, 174745] as const,
  needUses: 2,
} as const;

// Survey E3 Commander Gor'shak jail defense (quest 3982). Wave1 @ 3–4s: 3×8891; wave2 @ 45–46s:
// 1×9398 + 2×8891; credit @ 98s. Cite: classic-db dbscripts_on_quest_start id 3982.
export const BRD_GORSHAK_JAIL = {
  questId: 3982,
  npcEntry: 9020, // Commander Gor'shak
  /** First summon pos (wave1 entry 0) — dbscripts_on_quest_start 3982 delay 3000 cmd 10. */
  origin: { x: 379.509, y: -191.971, z: -69.718 },
  /** Wave1 first summon delay — dbscripts delay 3000. */
  wave1AtMs: 3_000,
  /** Wave2 first summon delay — dbscripts delay 45000. */
  wave2AtMs: 45_000,
  /** Wave1→wave2 gap after wave1 call (= 45000 − 3000). */
  waveGapMs: 42_000,
  /** SCRIPT_COMMAND_QUEST_EXPLORED credit — dbscripts delay 98000 cmd 7. */
  creditAtMs: 98_000,
  // Wave 1 = 3× Anvilrage Guardsman 8891; wave 2 = 1× Executioner 9398 + 2× 8891. Primary = 9398 (final
  // wave) so floorGauntletWaves accepts lastHas.
  waves: [
    { pack: [{ creatureEntry: ENTRY.anvilrageGuardsman, count: 3 }] },
    {
      pack: [
        { creatureEntry: ENTRY.twilightExecutioner, count: 1 },
        { creatureEntry: ENTRY.anvilrageGuardsman, count: 2 },
      ],
    },
  ] as const,
} as const;

// Detention Block Cell Doors. Lock 699 / item 11140 from Gerstahn 9018. Cite: dungeonGameObjects map 230;
// locks.json 699; survey E3 (gorshak-jail behind 170564).
export const BRD_CELL_DOORS = {
  goEntry: 170564,
  goEntries: [170562, 170563, 170564, 170565, 170566, 170567, 170568, 170569] as const,
  requiredItem: 11140,
} as const;

// Throne-room concurrent pair — Emperor CallForHelp pulls Moira, and JustDied flips her neutral.
// Cite: boss_emperor_dagran_thaurissan.cpp:68; ScriptDevAIMgr.h:33 VISIBLE_RANGE 166.0f.
export const BRD_THRONE = {
  emperorEncId: 'emperor-dagran-thaurissan',
  moiraEncId: 'princess-moira',
  emperorEntry: ENTRY.emperorDagran,
  moiraEntry: ENTRY.princessMoira,
  /** CallForHelp radius — ScriptDevAIMgr.h VISIBLE_RANGE. */
  callForHelpYd: 166,
  /** FACTION_NEUTRAL on release — boss_emperor_dagran_thaurissan.cpp:31,84. */
  moiraNeutralFaction: 734,
} as const;

// Summon-only creature entries that must never appear in pure static trash packs. Includes ring pool,
// Hurley, event adds, tomb ghosts (event-awakened), Doomgrip.
export const BLACKROCK_DEPTHS_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.anubshiah, // 9031
  ENTRY.eviscerator, // 9029
  ENTRY.gorosh, // 9027
  ENTRY.grizzle, // 9028
  ENTRY.hedrum, // 9032
  ENTRY.okthor, // 9030
  ENTRY.hurleyBlackbreath, // 9537
  ENTRY.ringWorm, // 8925
  ENTRY.ringStinger, // 8926
  ENTRY.ringScreecher, // 8927
  ENTRY.ringThundersnout, // 8928
  ENTRY.ringCreeper, // 8933
  ENTRY.ringBeetle, // 8932
  ENTRY.blackbreathCrony, // 9541
  ENTRY.burningSpirit, // 9178
  ENTRY.watchmanDoomgrip, // 9476
  ENTRY.twilightExecutioner, // 9398 - Gor'shak jail finale
]);

// Tomb of the Seven ghosts are STATIC spawns the event awakens, not summons — :587 flips a standing
// friendly hostile. `extraStrip` keeps them out of ordinary trash. Cite: instance_brd.cpp:583.
export const BLACKROCK_DEPTHS_TOMB_AWAKENED_ENTRIES = new Set<number>([
  ENTRY.angerrel, // 9035
  ENTRY.seethrel, // 9038
  ENTRY.doperel, // 9040
  ENTRY.gloomrel, // 9037
  ENTRY.vilerel, // 9036
  ENTRY.haterel, // 9034
]);

/** Alias matching brief export name. */
export const SUMMON_ONLY = BLACKROCK_DEPTHS_SUMMON_ONLY_ENTRIES;

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
// Empty arrays = bake has no spells (Angerforge, Hurley, Flamelash, Panzor, Magmus).
const BOSS_SPELLS = {
  lordRoccor: [13729, 13728, 6524],
  highInterrogatorGerstahn: [14033, 13704, 14032, 12040],
  houndmasterGrebmar: [21049, 13730, 15615],
  gorosh: [15708, 13736, 21049],
  pyromancerLoregrain: [15038, 15616, 15095, 15041],
  lordIncendius: [26977, 13900, 14099, 13899],
  warderStilgiss: [12674, 12675, 12556, 15044, 12544],
  fineousDarkvire: [13953, 8258, 15493, 11978, 15346],
  baelgar: [13895, 23378],
  generalAngerforge: [] as number[],
  golemLordArgelmach: [15507, 15305, 15605],
  hurleyBlackbreath: [] as number[],
  phalanx: [14099, 15588, 15285],
  // Bar patrons: no scripted spell kit — creature EventAI drives them at fight time.
  ribbly: [] as number[],
  plugger: [] as number[],
  ambassadorFlamelash: [] as number[],
  panzor: [] as number[],
  doomrel: [15245, 12742, 12493, 15092, 13787],
  magmus: [] as number[],
  princessMoira: [15586, 8362, 15587],
  emperorDagran: [15636, 17492],
} as const;

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
  pack?: { creatureEntry: number; count: number }[],
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
  if (pack && pack.length) enc.pack = pack;
  return enc;
}

// Linear encounter graph: entrance trash → bosses in survey canonical order with inter-boss trash
// in spatial bands (detention, ring, manufactory, bar, vault, depths).
function buildHandSpine(): EncounterDef[] {
  // Build all pure-static trash packs once, then slice into bands.
  const packs: EncounterDef[] = [
    ...trashFromCensus('bloodhound', 'Bloodhound', ENTRY.bloodhound, STATIC.bloodhound),
    ...trashFromCensus(
      'anvilrage-warden',
      'Anvilrage Warden',
      ENTRY.anvilrageWarden,
      STATIC.anvilrageWarden,
    ),
    ...trashFromCensus(
      'anvilrage-guardsman',
      'Anvilrage Guardsman',
      ENTRY.anvilrageGuardsman,
      STATIC.anvilrageGuardsman,
    ),
    ...trashFromCensus(
      'anvilrage-footman',
      'Anvilrage Footman',
      ENTRY.anvilrageFootman,
      STATIC.anvilrageFootman,
    ),
    ...trashFromCensus(
      'twilight-torturer',
      "Twilight's Hammer Torturer",
      ENTRY.twilightTorturer,
      STATIC.twilightTorturer,
    ),
    // Slave 10116 / Tortured Slave 10117: faction 35 non-combat — not kill trash.
    ...trashFromCensus(
      'anvilrage-overseer',
      'Anvilrage Overseer',
      ENTRY.anvilrageOverseer,
      STATIC.anvilrageOverseer,
    ),
    ...trashFromCensus(
      'arena-spectator',
      'Arena Spectator',
      ENTRY.arenaSpectator,
      STATIC.arenaSpectator,
    ),
    ...trashFromCensus(
      'anvilrage-soldier',
      'Anvilrage Soldier',
      ENTRY.anvilrageSoldier,
      STATIC.anvilrageSoldier,
    ),
    ...trashFromCensus(
      'anvilrage-medic',
      'Anvilrage Medic',
      ENTRY.anvilrageMedic,
      STATIC.anvilrageMedic,
    ),
    ...trashFromCensus(
      'anvilrage-officer',
      'Anvilrage Officer',
      ENTRY.anvilrageOfficer,
      STATIC.anvilrageOfficer,
    ),
    ...trashFromCensus(
      'shadowforge-peasant',
      'Shadowforge Peasant',
      ENTRY.shadowforgePeasant,
      STATIC.shadowforgePeasant,
    ),
    ...trashFromCensus(
      'shadowforge-citizen',
      'Shadowforge Citizen',
      ENTRY.shadowforgeCitizen,
      STATIC.shadowforgeCitizen,
    ),
    ...trashFromCensus('fireguard', 'Fireguard', ENTRY.fireguard, STATIC.fireguard),
    ...trashFromCensus(
      'blazing-fireguard',
      'Blazing Fireguard',
      ENTRY.blazingFireguard,
      STATIC.blazingFireguard,
    ),
    ...trashFromCensus(
      'fireguard-destroyer',
      'Fireguard Destroyer',
      ENTRY.fireguardDestroyer,
      STATIC.fireguardDestroyer,
    ),
    ...trashFromCensus(
      'doomforge-craftsman',
      'Doomforge Craftsman',
      ENTRY.doomforgeCraftsman,
      STATIC.doomforgeCraftsman,
    ),
    ...trashFromCensus(
      'doomforge-arcanasmith',
      'Doomforge Arcanasmith',
      ENTRY.doomforgeArcanasmith,
      STATIC.doomforgeArcanasmith,
    ),
    ...trashFromCensus(
      'doomforge-dragoon',
      'Doomforge Dragoon',
      ENTRY.doomforgeDragoon,
      STATIC.doomforgeDragoon,
    ),
    ...trashFromCensus(
      'warbringer-construct',
      'Warbringer Construct',
      ENTRY.warbringerConstruct,
      STATIC.warbringerConstruct,
    ),
    ...trashFromCensus(
      'ragereaver-golem',
      'Ragereaver Golem',
      ENTRY.ragereaverGolem,
      STATIC.ragereaverGolem,
    ),
    ...trashFromCensus(
      'wrath-hammer-construct',
      'Wrath Hammer Construct',
      ENTRY.wrathHammerConstruct,
      STATIC.wrathHammerConstruct,
    ),
    ...trashFromCensus(
      'molten-war-golem',
      'Molten War Golem',
      ENTRY.moltenWarGolem,
      STATIC.moltenWarGolem,
    ),
    ...trashFromCensus(
      'anvilrage-reservist',
      'Anvilrage Reservist',
      ENTRY.anvilrageReservist,
      STATIC.anvilrageReservist,
    ),
    ...trashFromCensus(
      'anvilrage-marshal',
      'Anvilrage Marshal',
      ENTRY.anvilrageMarshal,
      STATIC.anvilrageMarshal,
    ),
    ...trashFromCensus(
      'anvilrage-captain',
      'Anvilrage Captain',
      ENTRY.anvilrageCaptain,
      STATIC.anvilrageCaptain,
    ),
    ...trashFromCensus(
      'twilight-emissary',
      'Twilight Emissary',
      ENTRY.twilightEmissary,
      STATIC.twilightEmissary,
    ),
    ...trashFromCensus(
      'twilight-bodyguard',
      'Twilight Bodyguard',
      ENTRY.twilightBodyguard,
      STATIC.twilightBodyguard,
    ),
    ...trashFromCensus(
      'twilight-ambassador',
      "Twilight's Hammer Ambassador",
      ENTRY.twilightAmbassador,
      STATIC.twilightAmbassador,
    ),
    ...trashFromCensus(
      'weapon-technician',
      'Weapon Technician',
      ENTRY.weaponTechnician,
      STATIC.weaponTechnician,
    ),
    ...trashFromCensus(
      'shadowforge-senator',
      'Shadowforge Senator',
      ENTRY.shadowforgeSenator,
      STATIC.shadowforgeSenator,
    ),
    ...trashFromCensus(
      'shadowforge-flame-keeper',
      'Shadowforge Flame Keeper',
      ENTRY.shadowforgeFlameKeeper,
      STATIC.shadowforgeFlameKeeper,
    ),
    ...trashFromCensus(
      'ironhand-guardian',
      'Ironhand Guardian',
      ENTRY.ironhandGuardian,
      STATIC.ironhandGuardian,
    ),
    ...trashFromCensus(
      'bloodhound-mastiff',
      'Bloodhound Mastiff',
      ENTRY.bloodhoundMastiff,
      STATIC.bloodhoundMastiff,
    ),
    // Ograbisi / Jaz / Crest Killer: faction 35 cell crooks — not kill trash.
  ];

  // 18 bands interleaved with 18 boss/event beats.
  const bandCount = 18;
  const bandSize = Math.ceil(packs.length / bandCount);
  const band = (i: number) => packs.slice(i * bandSize, (i + 1) * bandSize);

  const out: EncounterDef[] = [];

  // --- Detention / entrance → Lord Roccor (rare-elite) ---
  out.push(...band(0));
  // Survey rare; isComplete ignores optional.
  out.push({
    ...boss(
      'lord-roccor',
      'Lord Roccor',
      ENTRY.lordRoccor,
      BOSS_SPELLS.lordRoccor,
      undefined,
      'Lord Roccor (rare) prowls the outer depths.',
    ),
    optional: true,
  });

  // --- → High Interrogator Gerstahn (jail; crooks Ograbisi/Jaz/Crest in trash packs) ---
  out.push(...band(1));
  out.push(
    boss(
      'high-interrogator-gerstahn',
      'High Interrogator Gerstahn',
      ENTRY.highInterrogatorGerstahn,
      BOSS_SPELLS.highInterrogatorGerstahn,
      undefined,
      "High Interrogator Gerstahn oversees the Detention Block cells.",
    ),
  );

  // --- E3 Gor'shak jail defense (quest 3982 accept → timed 2-wave gauntlet) ---
  // Primary 9398 summon-only; origin dbscripts 3982 delay 3000 pos. Arm only with quest.
  out.push({
    id: 'gorshak-jail',
    name: "Commander Gor'shak - Jail Defense",
    kind: 'boss',
    startQuestId: BRD_GORSHAK_JAIL.questId,
    creatureEntry: ENTRY.twilightExecutioner,
    origin: {
      x: BRD_GORSHAK_JAIL.origin.x,
      y: BRD_GORSHAK_JAIL.origin.y,
      z: BRD_GORSHAK_JAIL.origin.z,
    },
    intro:
      "Accept quest 3982 at Gor'shak - Anvilrage waves storm the cell (3s / 45s). Defend him.",
    events: [
      {
        kind: 'objectGate',
        goEntry: BRD_CELL_DOORS.goEntry,
        goEntries: [...BRD_CELL_DOORS.goEntries],
        requiredItem: BRD_CELL_DOORS.requiredItem,
        setsFlag: BLACKROCK_DEPTHS_FLAGS.cellDoors,
        once: true,
      },
      { kind: 'requiresFlag', flag: BLACKROCK_DEPTHS_FLAGS.cellDoors },
      {
        kind: 'waves',
        waves: BRD_GORSHAK_JAIL.waves.map((w) => ({
          pack: w.pack.map((p) => ({ creatureEntry: p.creatureEntry, count: p.count })),
        })),
      },
      { kind: 'setsFlag', flag: BLACKROCK_DEPTHS_FLAGS.gorshakJail },
    ],
  });

  // --- → Houndmaster Grebmar ---
  out.push(...band(2));
  out.push(
    boss(
      'houndmaster-grebmar',
      'Houndmaster Grebmar',
      ENTRY.houndmasterGrebmar,
      BOSS_SPELLS.houndmasterGrebmar,
      undefined,
      'Houndmaster Grebmar and his bloodhounds guard the kennels.',
    ),
  );

  // --- E1 Ring of Law (summon-only; per-run mob type + 1-of-6 boss) ---
  // The graph holds placeholders; combatSession materializes the real rolls at fight start.
  out.push(...band(3));
  out.push(
    boss(
      'ring-of-law',
      'Ring of Law',
      BRD_RING_OF_LAW.bossEntry,
      BOSS_SPELLS.gorosh,
      [
        {
          kind: 'objectGate',
          goEntry: BRD_RING_OF_LAW.goEntry,
          setsFlag: BLACKROCK_DEPTHS_FLAGS.ringOfLaw,
          once: true,
        },
        { kind: 'requiresFlag', flag: BLACKROCK_DEPTHS_FLAGS.ringOfLaw },
        {
          kind: 'waves',
          waves: [
            {
              pack: [
                {
                  creatureEntry: BRD_RING_OF_LAW.trashEntry,
                  count: BRD_RING_OF_LAW.trashPerWave,
                },
              ],
            },
            {
              pack: [
                {
                  creatureEntry: BRD_RING_OF_LAW.trashEntry,
                  count: BRD_RING_OF_LAW.trashPerWave,
                },
              ],
            },
            // Final wave placeholder; materializeRingOfLawEncounter rolls aRingBoss[].
            { pack: [{ creatureEntry: ENTRY.gorosh, count: 1 }] },
          ],
        },
      ],
      "The Ring of Law - High Justice Grimstone's arena. One of six champions after two waves of one rolled arena beast. (Theldren/quest 9015 not modeled.)",
    ),
  );

  // --- → Pyromancer Loregrain (rare) ---
  out.push(...band(4));
  // Survey rare; isComplete ignores optional.
  out.push({
    ...boss(
      'pyromancer-loregrain',
      'Pyromancer Loregrain',
      ENTRY.pyromancerLoregrain,
      BOSS_SPELLS.pyromancerLoregrain,
      undefined,
      'Pyromancer Loregrain (rare) chants near the Shadowforge bridge.',
    ),
    optional: true,
  });

  // --- → Lord Incendius ---
  out.push(...band(5));
  out.push(
    boss(
      'lord-incendius',
      'Lord Incendius',
      ENTRY.lordIncendius,
      BOSS_SPELLS.lordIncendius,
      undefined,
      'Lord Incendius, fire elemental of the Black Anvil, bars the molten halls.',
    ),
  );

  // --- → Warder Stilgiss + Verek pack ---
  out.push(...band(6));
  out.push(
    boss(
      'warder-stilgiss',
      'Warder Stilgiss',
      ENTRY.warderStilgiss,
      BOSS_SPELLS.warderStilgiss,
      undefined,
      'Warder Stilgiss guards the Dark Coffer with his demon hound Verek.',
      [{ creatureEntry: ENTRY.verek, count: 1 }],
    ),
  );

  // --- E7 Vault → Watchman Doomgrip + 4× Warbringer Construct (un-stone) ---
  // Cite: instance_blackrock_depths.cpp:210-227 RemoveAurasDueToSpell(SPELL_STONED) + Summon Doomgrip.
  out.push(
    {
      id: 'vault-watchman-doomgrip',
      name: 'Watchman Doomgrip',
      kind: 'trash',
      creatureEntry: BRD_VAULT.doomgripEntry,
      pack: [
        {
          creatureEntry: BRD_VAULT.constructEntry,
          count: BRD_VAULT.constructCount,
        },
      ],
      intro:
        'Opening all 12 Relic Coffer Doors un-stones 4 Warbringer Constructs and summons Watchman Doomgrip.',
      events: [
        {
          kind: 'objectGate',
          goEntry: BRD_VAULT.goEntry,
          goEntries: [...BRD_VAULT.goEntries],
          needUses: BRD_VAULT.needUses,
          setsFlag: BLACKROCK_DEPTHS_FLAGS.vaultCoffers,
          once: true,
        },
        { kind: 'requiresFlag', flag: BLACKROCK_DEPTHS_FLAGS.vaultCoffers },
      ],
    },
  );

  // --- → Fineous Darkvire ---
  out.push(...band(7));
  out.push(
    boss(
      'fineous-darkvire',
      'Fineous Darkvire',
      ENTRY.fineousDarkvire,
      BOSS_SPELLS.fineousDarkvire,
      undefined,
      "Fineous Darkvire, Chief Architect - holds Ironfel for Dark Iron Legacy.",
    ),
  );

  // --- → Bael'Gar ---
  out.push(...band(8));
  out.push(
    boss(
      "bael-gar",
      "Bael'Gar",
      ENTRY.baelgar,
      BOSS_SPELLS.baelgar,
      undefined,
      "Bael'Gar, a massive molten giant, stirs in the eastern depths.",
    ),
  );

  // --- → General Angerforge (E9 <30% Alarm — ScriptDev first pulse; BRD_ANGERFORGE schedule) ---
  // Cite: boss_general_angerforge.cpp:93-108; InstanceDef hpThreshold retired (no double-fire).
  out.push(...band(9));
  out.push(
    boss(
      'general-angerforge',
      'General Angerforge',
      ENTRY.generalAngerforge,
      BOSS_SPELLS.generalAngerforge,
      undefined,
      'General Angerforge: Flurry/Enrage/Sunder; <30% Alarm 8×8901+2×8894 (ScriptDev once; angerforgeAlarmsByMs for 3-min re-arm).',
    ),
  );

  // --- → Golem Lord Argelmach ---
  out.push(...band(10));
  out.push(
    boss(
      'golem-lord-argelmach',
      'Golem Lord Argelmach',
      ENTRY.golemLordArgelmach,
      BOSS_SPELLS.golemLordArgelmach,
      undefined,
      "Golem Lord Argelmach directs the Manufactory's constructs.",
    ),
  );

  // --- E5d Hurley Blackbreath (3 kegs → summon + 3 cronies) ---
  // Cite: instance_blackrock_depths.cpp:319-351; needUses=3 :324.
  out.push(...band(11));
  out.push(
    boss(
      'hurley-blackbreath',
      'Hurley Blackbreath',
      ENTRY.hurleyBlackbreath,
      BOSS_SPELLS.hurleyBlackbreath,
      [
        {
          kind: 'objectGate',
          goEntry: BRD_HURLEY_KEGS.goEntry,
          needUses: BRD_HURLEY_KEGS.needUses,
          setsFlag: BLACKROCK_DEPTHS_FLAGS.hurleyKegs,
          once: true,
        },
        { kind: 'requiresFlag', flag: BLACKROCK_DEPTHS_FLAGS.hurleyKegs },
      ],
      'Breaking three Thunderbrew Lager Kegs summons Hurley Blackbreath and his cronies.',
      [
        {
          creatureEntry: BRD_HURLEY_KEGS.cronyEntry,
          count: BRD_HURLEY_KEGS.cronyCount,
        },
      ],
    ),
  );
  // Summon-only: spawnUnlockedBodies places the floor body at `origin` once the keg flag is set, and
  // without one the third keg summoned nothing. Cite: blackrock_depths.h:206 aHurleyPositions.
  out[out.length - 1] = { ...out[out.length - 1]!, origin: { ...BRD_HURLEY_KEGS.spawn } };

  // --- → Phalanx (static boss; Rocknot/Plugger escort-activate residual) ---
  // Cite: blackrock_depths.cpp:1039-1042 Rocknot; :1688-1693 Plugger death → escort Start.
  out.push(...band(12));
  out.push(
    boss(
      'phalanx',
      'Phalanx',
      ENTRY.phalanx,
      BOSS_SPELLS.phalanx,
      undefined,
      'Phalanx, the Grim Guzzler golem - Rocknot 3 ales or Plugger death activate him (attack-to-start stand-in).',
    ),
  );

  // --- → Grim Guzzler named patrons. Quest 4136 wants Ribbly's head.
  // E5e: Ribbly death → bar patrol (1×8911+2×8895) unless Plugger is already hostile.
  out.push(
    boss(
      'ribbly-screwspigot',
      'Ribbly Screwspigot',
      ENTRY.ribbly,
      BOSS_SPELLS.ribbly,
      [
        {
          kind: 'hpThreshold',
          pct: 0,
          once: true,
          spawn: [
            {
              creatureEntry: BRD_BAR_PATROL.destroyerEntry,
              count: BRD_BAR_PATROL.destroyerCount,
            },
            {
              creatureEntry: BRD_BAR_PATROL.officerEntry,
              count: BRD_BAR_PATROL.officerCount,
            },
          ],
        },
        { kind: 'setsFlag', flag: BLACKROCK_DEPTHS_FLAGS.barPatrol },
      ],
      "Ribbly Screwspigot - death calls the bar patrol (1× Fireguard Destroyer + 2× Anvilrage Officers).",
    ),
  );
  // Plugger death → Phalanx calls the same patrol 10 s later unless Ribbly already did; the DSL has
  // no "unless flag", so two deaths spawn two. Cite: blackrock_depths.cpp:628-633; instance:361-364.
  out.push(
    boss(
      'plugger-spazzring',
      'Plugger Spazzring',
      ENTRY.plugger,
      BOSS_SPELLS.plugger,
      [
        {
          kind: 'hpThreshold',
          pct: 0,
          once: true,
          spawn: [
            { creatureEntry: BRD_BAR_PATROL.destroyerEntry, count: BRD_BAR_PATROL.destroyerCount },
            { creatureEntry: BRD_BAR_PATROL.officerEntry, count: BRD_BAR_PATROL.officerCount },
          ],
        },
        { kind: 'setsFlag', flag: BLACKROCK_DEPTHS_FLAGS.barPatrol },
      ],
      'Plugger Spazzring - the bartender. His death turns every patron hostile, wakes Phalanx and calls the bar patrol.',
    ),
  );

  // --- → Ambassador Flamelash (E8 — ScriptDev pull inject; BRD_FLAMELASH continuous schedule) ---
  // Cite: boss_ambassador_flamelash.cpp:81-91,127-137; InstanceDef hpThreshold retired.
  out.push(...band(13));
  out.push(
    boss(
      'ambassador-flamelash',
      'Ambassador Flamelash',
      ENTRY.ambassadorFlamelash,
      BOSS_SPELLS.ambassadorFlamelash,
      undefined,
      'Ambassador Flamelash: Fireblast + 7×9178 pull, +4×8911 on a return after a wipe or flee (ScriptDev); flamelashSpiritsExpectedByMs for 15–30s stream.',
    ),
  );

  // --- → Panzor the Invincible (rare) ---
  out.push(...band(14));
  // Survey rare; isComplete ignores optional.
  out.push({
    ...boss(
      'panzor-the-invincible',
      'Panzor the Invincible',
      ENTRY.panzor,
      BOSS_SPELLS.panzor,
      undefined,
      'Panzor the Invincible (rare) stands among the golem works.',
    ),
    optional: true,
  });

  // --- E6 Tomb of the Seven → Doom'rel (7 dwarves; 30s fromCall overlap on floor) ---
  // Cite: instance_blackrock_depths.cpp:591,768 m_uiDwarfFightTimer=30000; live gauntletTransition doomrel.
  out.push(...band(15));
  out.push(
    boss(
      'doomrel',
      "Doom'rel",
      ENTRY.doomrel,
      BOSS_SPELLS.doomrel,
      [
        {
          kind: 'setsFlag',
          flag: BLACKROCK_DEPTHS_FLAGS.tombOfSeven,
        },
        {
          kind: 'waves',
          waves: BRD_TOMB_OF_SEVEN.order.map((creatureEntry) => ({
            pack: [{ creatureEntry, count: 1 }],
          })),
        },
      ],
      "The Tomb of the Seven - seven ghost dwarves in sequence (30s auto-call overlap; BRD_TOMB_OF_SEVEN.dwarfFightTimerMs).",
    ),
  );

  // --- → Magmus (Lyceum braziers pair 174744/174745) ---
  out.push(...band(16));
  out.push(
    boss(
      'magmus',
      'Magmus',
      ENTRY.magmus,
      BOSS_SPELLS.magmus,
      [
        {
          kind: 'objectGate',
          goEntry: BRD_LYCEUM_BRAZIERS.goEntry,
          goEntries: [...BRD_LYCEUM_BRAZIERS.goEntries],
          needUses: BRD_LYCEUM_BRAZIERS.needUses,
          setsFlag: BLACKROCK_DEPTHS_FLAGS.lyceumBraziers,
          once: true,
        },
        { kind: 'requiresFlag', flag: BLACKROCK_DEPTHS_FLAGS.lyceumBraziers },
      ],
      'Magmus guards the Iron Hall beyond both Lyceum Shadowforge Braziers. Ironhand Guardians flare nearby.',
    ),
  );

  // --- → Princess Moira + Emperor (concurrent: Emperor CallForHelp pulls Moira) ---
  // Cite: boss_emperor_dagran_thaurissan.cpp:68 CallForHelp; JustDied → Moira neutral.
  out.push(...band(17));
  // Remainder of any leftover packs
  const used = bandCount * bandSize;
  if (used < packs.length) out.push(...packs.slice(used));

  out.push(
    boss(
      'princess-moira',
      'Princess Moira Bronzebeard',
      ENTRY.princessMoira,
      BOSS_SPELLS.princessMoira,
      undefined,
      'Princess Moira Bronzebeard stands with the Emperor - CallForHelp joins her when he aggroes. Kill him first to free her.',
    ),
  );

  out.push(
    boss(
      'emperor-dagran-thaurissan',
      'Emperor Dagran Thaurissan',
      ENTRY.emperorDagran,
      BOSS_SPELLS.emperorDagran,
      undefined,
      'Emperor Dagran Thaurissan calls the throne room to arms (CallForHelp pulls Moira).',
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty). Non-combat friendlies,
  // the summon-only ring pool and event adds are all stripped so none appear as static trash.
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 230,
    spine,
    entrance: entranceForInstance('blackrock-depths'),
    extraStrip: [
      ...BLACKROCK_DEPTHS_SUMMON_ONLY_ENTRIES,
      ...BLACKROCK_DEPTHS_TOMB_AWAKENED_ENTRIES,
    ],
  });
}


// Survey quests completable inside map 230. Excludes 8619 Morndeep the Elder (D-10 Lunar Festival). No
// Scourge Invasion D-10 rows.
export const BLACKROCK_DEPTHS_QUESTS = [
  4295, // Rocknot's Ale
  3802, // Dark Iron Legacy
  3981, // Commander Gor'shak
  4081, // KILL ON SIGHT: Dark Iron Dwarves
  4136, // Ribbly Screwspigot
  3982, // What Is Going On?
  4001, // What Is Going On?
  4082, // KILL ON SIGHT: High Ranking Dark Iron Officials
  4201, // The Love Potion
  4241, // Marshal Windsor
  4242, // Abandoned Hope
  7201, // The Last Element
  4083, // The Spectral Chalice
  4123, // The Heart of the Mountain
  3907, // Disharmony of Fire
  4263, // Incendius!
  4286, // The Good Stuff
  4063, // The Rise of the Machines
  4132, // Operation: Death to Angerforge
  4264, // A Crumpled Up Note
  4282, // A Shred of Hope
  4322, // Jail Break!
  4003, // The Royal Rescue
  4341, // Kharan Mighthammer
  4342, // Kharan's Tale
  4361, // The Bearer of Bad News
  4362, // The Fate of the Kingdom
  4363, // The Princess's Surprise
  4004, // The Princess Saved?
  6642, // Favor Amongst the Brotherhood, Dark Iron Ore
  6643, // Favor Amongst the Brotherhood, Fiery Core
  6644, // Favor Amongst the Brotherhood, Lava Core
  6645, // Favor Amongst the Brotherhood, Core Leather
  6646, // Favor Amongst the Brotherhood, Blood of the Mountain
  7604, // A Binding Contract
  7848, // Attunement to the Core
  8961, // Three Kings of Flame
] as const;

export const BLACKROCK_DEPTHS: InstanceDef = {
  id: 'blackrock-depths',
  mapId: 230,
  name: 'Blackrock Depths',
  portalZone: 'burningsteppes',
  // areatrigger_teleport 1466, Blackrock Depths - Entering (level 40). The AT's own fromZone is
  // 'searinggorge', so the portalZone match never found it and canEnter fell back to def.minLevel.
  entranceTriggerId: 1466,
  minLevel: 40, // entrance trigger 1466 requiredLevel
  // Typical BRD combat band ~48–56 (lvl-1 friendly slaves are non-combat presence, not trash).
  levelRange: [48, 56],
  lockoutMs: 0,
  description: '',
  quests: [...BLACKROCK_DEPTHS_QUESTS],
  encounters: buildEncounters(),
  lootObjects: [
    // Chest of The Seven — respawned for an HOUR when the tomb event completes.
    // Cite: instance_blackrock_depths.cpp:278 DoRespawnGameObject(GO_CHEST_SEVEN, HOUR).
    { goEntry: 169243, revealedByFlag: BLACKROCK_DEPTHS_FLAGS.tombOfSeven },
    // Core Fragment — quest 7848 Attunement to the Core (18412 guaranteed while on quest).
    { goEntry: 179553 },
    // Dark Coffer — opened with the Dark Keeper Key 11197 (portrait event drops it).
    { goEntry: 160845, requiredItem: 11197 },
    // Secret Safe — Fineous Darkvire's chain (Ironfel 10999 / Shadowforge Key 11000).
    { goEntry: 161495 },
    // Relic Coffers — the vault room, behind the coffer-door gate.
    { goEntry: 160836, revealedByFlag: BLACKROCK_DEPTHS_FLAGS.vaultCoffers },
  ],
};

// Counts only pure static trash packs (no bosses, no vault Doomgrip summon, no event summons). Used to
// assert census match and summon-only exclusion.
export function blackrockDepthsPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of BLACKROCK_DEPTHS.encounters) {
    if (enc.kind !== 'trash') continue;
    // Vault Doomgrip is summon-only event, not census static.
    if (enc.id.startsWith('vault-')) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}

/** Sum of authored kill counts per creature entry (trash + bosses + event spawns). */
export function blackrockDepthsKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of BLACKROCK_DEPTHS.encounters) {
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
