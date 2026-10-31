// Scarlet Monastery Cathedral wing (map 189) — InstanceDef, Fairbanks → Mograine + Whitemane.
// Authority: docs/dungeons/survey/09-scarlet-monastery.md, which carries the residual list.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';

// ---- Census static counts (Cathedral wing entries from survey + mission) ----
// Call-for-help set: 4299–4303 and 4540, plus 4294 Scarlet Sorcerer as cathedral static.

const STATIC = {
  chaplain: 13, // 4299 Scarlet Chaplain
  monk: 26, // 4540 Scarlet Monk
  sorcerer: 8, // 4294 Scarlet Sorcerer
  centurion: 22, // 4301 Scarlet Centurion
  wizard: 11, // 4300 Scarlet Wizard
  abbot: 5, // 4303 Scarlet Abbot
  champion: 9, // 4302 Scarlet Champion
} as const;

const ENTRY = {
  chaplain: 4299,
  monk: 4540,
  sorcerer: 4294,
  centurion: 4301,
  wizard: 4300,
  abbot: 4303,
  champion: 4302,
  fairbanks: 4542,
  mograine: 3976,
  whitemane: 3977,
} as const;

// Multi-wing kill quests 1048/1053 also need Herod + Loksey (other wings). Satisfiability whitelist may
// mark them partial - do not invent extra kills here.
export const SM_CATHEDRAL_QUESTS = [
  1053, // In the Name of the Light (A) - Whitemane, Mograine, Herod, Loksey
  1048, // Into The Scarlet Monastery (H) - same kills
] as const;

/** Flags for multi-phase Mograine/Whitemane (reserved; waves carry the fight). */
export const SM_CATHEDRAL_FLAGS = {
  /** Set when the mograine-whitemane encounter fully clears (both dead). */
  mograineWhitemaneDone: 'sm-mograine-whitemane-done',
} as const;

// Boss spells from baked creature.spells (game-data) - no invented ids. Fairbanks 4542, Mograine 3976,
// Whitemane 3977.
export const BOSS_SPELLS = {
  fairbanks: [15090, 8282, 12039, 11647, 12096, 8399, 8278, 8279],
  mograine: [8990, 5589, 1020, 14518],
  // Survey also cites Dominate Mind 14515 / Scarlet Resurrection 9232 after res;
  // bake lists combat rotation only (PW:Shield, Holy Smite, Deep Sleep, Heal).
  whitemane: [22187, 9481, 9256, 12039],
} as const;

// Mograine & Whitemane scripted pair — constants and pure helpers. The wave chain is Mograine
// alone, Whitemane alone, then Mograine re-injected while she is still up.
export const SM_MOGRAINE_WHITEMANE = {
  encId: 'mograine-whitemane',
  mograineEntry: ENTRY.mograine,
  whitemaneEntry: ENTRY.whitemane,
  /** boss_mograine_and_whitemane.cpp:51 SPELL_DEEPSLEEP */
  spellDeepSleep: 9256,
  /** boss_mograine_and_whitemane.cpp:52 SPELL_SCARLETRESURRECTION */
  spellScarletResurrection: 9232,
  /** boss_mograine_and_whitemane.cpp:46 SPELL_LAYONHANDS */
  spellLayOnHands: 9257,
  /** boss_mograine_and_whitemane.cpp:47 SPELL_RETRIBUTIONAURA — re-applied on revive */
  spellRetributionAura: 8990,
  /** boss_mograine_and_whitemane.cpp:48 SPELL_DIVINESHIELD */
  spellDivineShield: 642,
  /** Deep Sleep fire. Cite: cpp:477 GetHealthPercent() <= 50.0f */
  whitemaneDeepSleepHpPct: 50,
  /** Divine Shield once. Cite: cpp:303 GetHealthPercent() <= 50.f */
  mograineDivineShieldHpPct: 50,
  // After Scarlet Resurrection hits Mograine: Lay on Hands arm. Cite: cpp:204
  // ResetTimer(MOGRAINE_ACTION_LAY_ON_HANDS, 3000u)
  layOnHandsAfterResMs: 3_000,
  // After MovePoint to body (point 2): cast Scarlet Resurrection. Cite: cpp:407
  // ResetTimer(WHITEMANE_ACTION_SCARLET_RESURRECTION, 3000u)
  resCastAfterArriveMs: 3_000,
  // FAIL/wipe despawn → respawn delay. Cite: instance_scarlet_monastery.cpp SetRespawnDelay(30, true) on
  // FAIL branches
  wipeRespawnDelayMs: 30_000,
  // MograineCallForHelp radius. Cite: boss_mograine_and_whitemane.cpp:247 GetCreatureListWithEntryInGrid …
  // 80.f
  callForHelpYd: 80,
  // Entries force-aggro'd on Mograine pull (order from C++ vector). Cite: cpp:243–247
  // NPC_SCARLET_ABBOT/CENTURION/CHAMPION/CHAPLAIN/MONK/WIZARD
  callForHelpEntries: [
    ENTRY.abbot, // 4303
    ENTRY.centurion, // 4301
    ENTRY.champion, // 4302
    ENTRY.chaplain, // 4299
    ENTRY.monk, // 4540
    ENTRY.wizard, // 4300
  ] as const,
  /** Whitemane run-in after Mograine fake death. Cite: cpp:168 MovePoint */
  whitemaneEnter: { x: 1163.11337, y: 1398.856812, z: 32.527786 },
  /** GO opened on TYPE IN_PROGRESS. Cite: scarlet_monastery.h:22; instance cpp:106-107 */
  whitemaneDoorGo: 104600,
  // Wave packs — final is Mograine-only so mid-fight inject does not double Whitemane. Concurrent both-up =
  // wave1 Whitemane still alive + wave2 Mograine.
  waves: [
    { pack: [{ creatureEntry: ENTRY.mograine, count: 1 }] },
    { pack: [{ creatureEntry: ENTRY.whitemane, count: 1 }] },
    { pack: [{ creatureEntry: ENTRY.mograine, count: 1 }] },
  ] as const,
} as const;

// Pure: Whitemane may Scarlet-Resurrect only once Mograine is fake-dead, she is at or below the
// Deep Sleep HP threshold, and res has not fired. A still-alive Mograine returns false.
export function canScarletResurrect(args: {
  mograineAlive: boolean;
  whitemaneHpPct: number;
  alreadyResurrected: boolean;
}): boolean {
  if (args.alreadyResurrected) return false;
  if (args.mograineAlive) return false;
  if (!(args.whitemaneHpPct <= SM_MOGRAINE_WHITEMANE.whitemaneDeepSleepHpPct)) return false;
  return true;
}

// Pure FAIL/wipe outcome for the pair. Cite: instance_scarlet_monastery.cpp:102–143 SetData FAIL branches.
// A wipe never leaves the pair permanently dead (respawn / re-arm).
export function wipeResetPair(args: {
  mograineAlive: boolean;
  whitemaneAlive: boolean;
}): {
  encounterState: 'NOT_STARTED' | 'FAIL';
  respawnWhitemane: boolean;
  respawnMograine: boolean;
  respawnDelayMs: number;
  permanentlyDead: false;
} {
  const delay = SM_MOGRAINE_WHITEMANE.wipeRespawnDelayMs;
  if (args.whitemaneAlive && args.mograineAlive) {
    // Both alive → full despawn+respawn, event NOT_STARTED.
    return {
      encounterState: 'NOT_STARTED',
      respawnWhitemane: true,
      respawnMograine: true,
      respawnDelayMs: delay,
      permanentlyDead: false,
    };
  }
  if (!args.mograineAlive && args.whitemaneAlive) {
    // Mograine fake-dead, Whitemane up → Whitemane respawn 30s, FAIL.
    return {
      encounterState: 'FAIL',
      respawnWhitemane: true,
      respawnMograine: false,
      respawnDelayMs: delay,
      permanentlyDead: false,
    };
  }
  if (args.mograineAlive && !args.whitemaneAlive) {
    // Whitemane dead, Mograine up → Mograine ForcedDespawn (no 30s on this branch).
    return {
      encounterState: 'FAIL',
      respawnWhitemane: false,
      respawnMograine: true,
      respawnDelayMs: 0,
      permanentlyDead: false,
    };
  }
  // Both dead is DONE, not a wipe path — still not "permanently dead" as a wipe artifact.
  return {
    encounterState: 'FAIL',
    respawnWhitemane: false,
    respawnMograine: false,
    respawnDelayMs: 0,
    permanentlyDead: false,
  };
}

/** Floor trash of call-for-help entries within radius of a Mograine body. */
export function mograineCallForHelpTargets<
  T extends { entry: number; x: number; y: number; state: string },
>(
  mograine: { x: number; y: number },
  entities: readonly T[],
  radiusYd: number = SM_MOGRAINE_WHITEMANE.callForHelpYd,
): T[] {
  const set = new Set<number>(SM_MOGRAINE_WHITEMANE.callForHelpEntries);
  return entities.filter((e) => {
    if (e.state === 'dead') return false;
    if (!set.has(e.entry)) return false;
    return Math.hypot(e.x - mograine.x, e.y - mograine.y) <= radiusYd;
  });
}

/** Split a static spawn count into pack sizes in [2, 5] (prefer 4). Remainder 1 folded into prior pack. */
export function splitPackSizes(total: number, prefer = 4): number[] {
  if (total <= 0) return [];
  if (total === 1) return [1]; // single elite
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

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells?: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
): EncounterDef {
  const enc: EncounterDef = {
    id,
    name,
    kind: 'boss',
    creatureEntry,
  };
  if (bossSpells && bossSpells.length) enc.bossSpells = [...bossSpells];
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  return enc;
}

// Linear encounter graph: cathedral trash → Fairbanks → altar trash → Mograine & Whitemane as
// three wave phases, since a true mid-fight resurrection inject is an engine gap.
function buildHandSpine(): EncounterDef[] {
  const chaplains = trashFromCensus('chaplain', 'Scarlet Chaplain', ENTRY.chaplain, STATIC.chaplain);
  const monks = trashFromCensus('monk', 'Scarlet Monk', ENTRY.monk, STATIC.monk);
  const sorcerers = trashFromCensus('sorcerer', 'Scarlet Sorcerer', ENTRY.sorcerer, STATIC.sorcerer);
  const centurions = trashFromCensus('centurion', 'Scarlet Centurion', ENTRY.centurion, STATIC.centurion);
  const wizards = trashFromCensus('wizard', 'Scarlet Wizard', ENTRY.wizard, STATIC.wizard);
  const abbots = trashFromCensus('abbot', 'Scarlet Abbot', ENTRY.abbot, STATIC.abbot);
  const champions = trashFromCensus('champion', 'Scarlet Champion', ENTRY.champion, STATIC.champion);

  const out: EncounterDef[] = [];

  // Split each trash list into pre-Fairbanks (nave) vs post-Fairbanks (chapel floor).
  const half = (n: number) => Math.ceil(n / 2);
  const naveMonks = monks.slice(0, half(monks.length));
  const chapelMonks = monks.slice(half(monks.length));
  const naveCent = centurions.slice(0, half(centurions.length));
  const chapelCent = centurions.slice(half(centurions.length));
  const naveWiz = wizards.slice(0, half(wizards.length));
  const chapelWiz = wizards.slice(half(wizards.length));

  // --- Nave / approach (before Fairbanks) ---
  // Chaplains + sorcerers + first half of monks/centurions/wizards.
  {
    const max = Math.max(
      chaplains.length,
      naveMonks.length,
      sorcerers.length,
      naveCent.length,
      naveWiz.length,
    );
    for (let i = 0; i < max; i++) {
      if (chaplains[i]) out.push(chaplains[i]!);
      if (naveMonks[i]) out.push(naveMonks[i]!);
      if (sorcerers[i]) out.push(sorcerers[i]!);
      if (naveCent[i]) out.push(naveCent[i]!);
      if (naveWiz[i]) out.push(naveWiz[i]!);
    }
  }

  // --- High Inquisitor Fairbanks (survey boss order before Mograine) ---
  // Survey side chamber; isComplete ignores optional.
  out.push({
    ...boss(
      'fairbanks',
      'High Inquisitor Fairbanks',
      ENTRY.fairbanks,
      BOSS_SPELLS.fairbanks,
      undefined,
      'High Inquisitor Fairbanks waits in the cathedral side chamber.',
    ),
    optional: true,
  });

  // --- Chapel floor (between Fairbanks and altar) ---
  // Remaining monks/centurions/wizards + abbots + champions (call-for-help floor).
  {
    const max = Math.max(
      chapelMonks.length,
      chapelCent.length,
      chapelWiz.length,
      abbots.length,
      champions.length,
    );
    for (let i = 0; i < max; i++) {
      if (chapelMonks[i]) out.push(chapelMonks[i]!);
      if (chapelCent[i]) out.push(chapelCent[i]!);
      if (chapelWiz[i]) out.push(chapelWiz[i]!);
      if (abbots[i]) out.push(abbots[i]!);
      if (champions[i]) out.push(champions[i]!);
    }
  }

  // --- Mograine & Whitemane (multi-phase waves + live script) ---
  // creatureEntry and bossSpells document phase-0 identity; wave 2 is the Mograine res inject.
  out.push({
    id: SM_MOGRAINE_WHITEMANE.encId,
    name: 'Scarlet Commander Mograine & High Inquisitor Whitemane',
    kind: 'boss',
    creatureEntry: ENTRY.mograine,
    bossSpells: [...BOSS_SPELLS.mograine],
    intro:
      'Scarlet Commander Mograine calls the cathedral floor to arms. When he falls, High Inquisitor Whitemane enters - then Deep Sleep and Scarlet Resurrection bring him back for a final stand together.',
    events: [
      {
        kind: 'waves',
        waves: SM_MOGRAINE_WHITEMANE.waves.map((w) => ({
          pack: w.pack.map((p) => ({ creatureEntry: p.creatureEntry, count: p.count })),
        })),
      },
      { kind: 'setsFlag', flag: SM_CATHEDRAL_FLAGS.mograineWhitemaneDone },
    ],
  });

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 189,
    spine,
    entrance: entranceForInstance('sm-cathedral'),
    includePack: wingFilterByNearestBoss(189, "cat"),
    // Wave body 3977 (not spine primary 3976) — strip static spawn from trash (KI-1057).
    // Cite: boss_mograine_and_whitemane.cpp MovePoint; SM_MOGRAINE_WHITEMANE.waves[1].
    extraStrip: [ENTRY.whitemane],
  });
}


export const SM_CATHEDRAL: InstanceDef = {
  id: 'sm-cathedral',
  mapId: 189,
  wing: 'cat',
  name: 'Scarlet Monastery - Cathedral',
  portalZone: 'tirisfal',
  minLevel: 20,
  levelRange: [37, 42], // Cathedral trash/boss band
  lockoutMs: 0,
  description: '',
  quests: [...SM_CATHEDRAL_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored kill supply per creature entry (primary + pack + wave rows + death-summons). */
export function smCathedralKillSupply(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SM_CATHEDRAL.encounters) {
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

// Counts only pure static trash packs (no bosses, no flag-gated encounters, no wave-table rows). Used to
// match survey census static totals.
export function smCathedralPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of SM_CATHEDRAL.encounters) {
    if (enc.kind !== 'trash') continue;
    const req = (enc.events ?? []).some((e) => e.kind === 'requiresFlag');
    if (req) continue;
    const hasWaves = (enc.events ?? []).some((e) => e.kind === 'waves');
    if (hasWaves) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
