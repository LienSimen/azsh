// Dire Maul North wing / Gordok commons (map 429) — InstanceDef, tribute path only. Authority:
// docs/dungeons/survey/17-dire-maul.md, which carries the GAPS list. Tribute scale: CONDITION 18.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  applyEncounterCleared,
  isCleared,
  markDefeated,
  type InstanceRun,
} from '../../world/instances.ts';
import {
  entranceForInstance,
  buildClusterEncounters,
  wingFilterByNearestBoss,
} from './pack-from-clusters.ts';

// ---- Census static counts (map 429 North / Gordok slice) ----
// Fractional pool presence rounded. East/West rows, friendly service and bosses are excluded.

export const STATIC = {
  brute: 36, // 11441 pool 36.3 → Math.round
  mageLord: 25, // 11444 pool 24.8 → Math.round
  reaver: 15, // 11450
  captain: 6, // 11445 pool 5.5 → Math.round
  warlock: 15, // 11448
  spirit: 13, // 11446
  mastiff: 66, // 13036 pool 66.3 → Math.round
  ferra: 1, // 14308 - Kromcrush's bear (static elite; not a survey boss)
} as const;

/** Sum of pure static North trash census (excl. bosses, summon-only, friendlies). */
export const STATIC_TOTAL =
  STATIC.brute +
  STATIC.mageLord +
  STATIC.reaver +
  STATIC.captain +
  STATIC.warlock +
  STATIC.spirit +
  STATIC.mastiff +
  STATIC.ferra;

const ENTRY = {
  brute: 11441,
  mageLord: 11444,
  reaver: 11450,
  captain: 11445,
  warlock: 11448,
  spirit: 11446,
  mastiff: 13036,
  ferra: 14308,
  // North bosses (survey canonical order)
  moldar: 14326,
  kreeg: 14322,
  fengus: 14321,
  slipkik: 14323,
  kromcrush: 14325,
  chorush: 14324,
  kingGordok: 11501,
  // Summon-only event (never pure static trash)
  bushwacker: 14351, // Ogre Tannin Basket ambush
  mizzle: 14353, // King death → crown NPC (service; bake may miss)
  knot: 14338, // Free Knot! service
} as const;

// Flags from survey North tribute choreography (instance_dire_maul.cpp). Guard dead flags = TYPE_* DONE —
// only kill sets them; Slip'kik trap does not.
export const DM_NORTH_FLAGS = {
  /** King Gordok 11501 death - TYPE_KING_GORDOK DONE. */
  kingGordokDeath: 'dm-north-king-gordok-death',
  /** Ogre Tannin Basket 179499 looted → Bushwacker ambush + suit chain. */
  tanninLooted: 'dm-north-tannin-looted',
  /** Guard Mol'dar TYPE_MOLDAR DONE. */
  moldarDead: 'dm-north-moldar-dead',
  /** Stomper Kreeg TYPE_STOMPER_KREEG DONE. */
  kreegDead: 'dm-north-kreeg-dead',
  /** Guard Fengus TYPE_FENGUS DONE. */
  fengusDead: 'dm-north-fengus-dead',
  /** Guard Slip'kik TYPE_SLIPKIK DONE (kill only — trap does not set). */
  slipkikDead: 'dm-north-slipkik-dead',
  /** Captain Kromcrush TYPE_KROMCRUSH DONE. */
  kromcrushDead: 'dm-north-kromcrush-dead',
  /** Cho'Rush TYPE_CHORUSH DONE. */
  chorushDead: 'dm-north-chorush-dead',
  // Fixed Trap 179512 froze Slip'kik (immune, evade) without kill. Cite: instance_dire_maul.cpp:637-665
  // go_fixed_trap.
  slipkikFrozen: 'dm-north-slipkik-frozen',
  /** Mizzle gossip / King of the Gordok 22799 stand-in after king death. */
  mizzleCrown: 'dm-north-mizzle-crown',
  /** Free Knot! 5525 / Ball and Chain 179511 — cache 179501 revealed. */
  knotFreed: 'dm-north-knot-freed',
  /** Gordok Courtyard Door 177219 — Courtyard Key 18266 / lock 1563. */
  courtyardDoor: 'dm-north-courtyard-door',
  /** Gordok Inner Door 177217 — Inner Door Key 18268 / lock 1564. */
  innerDoor: 'dm-north-inner-door',
} as const;

/** GO 179499 Ogre Tannin Basket - survey North event (lootedEvent 8175). */
export const DM_NORTH_TANNIN = {
  goEntry: 179499,
  /** Ogre Tannin from go:16518. */
  itemEntry: 18240,
} as const;

// Gordok Tribute chest scaling. Cite: dire_maul.h:106 GO_GORDOK_TRIBUTE=179564;
// instance_dire_maul.cpp:499-521 alive count of 6 guards; conditions.json 733–744.
export const DM_NORTH_TRIBUTE = {
  goEntry: 179564,
  lootId: 16577,
  /** Always drop (no condition) — classic-db 16577. */
  baseItems: [
    { item: 8952, minCount: 15, maxCount: 20 }, // Roasted Quail
    { item: 8766, minCount: 15, maxCount: 20 }, // Morning Glory Dew
  ] as const,
  // One extra ref unlocked per guard left alive (progressive). minAlive = threshold; conditionId from
  // bake/SQL. 35038 uses condition 739 (exactly 6) — same as minAlive 6 when max is 6.
  extraRefs: [
    { ref: 35033, minAlive: 1, conditionId: 744 }, // potions
    { ref: 35034, minAlive: 2, conditionId: 743 }, // greens g1
    { ref: 35035, minAlive: 3, conditionId: 742 }, // greens g2
    { ref: 35036, minAlive: 4, conditionId: 741 }, // blues g1
    { ref: 35037, minAlive: 5, conditionId: 740 }, // blues g2
    { ref: 35038, minAlive: 6, conditionId: 739 }, // blues g3 + Treant's Bane
  ] as const,
} as const;

/** The six named ogres that count for tribute (King excluded). Cite: instance_dire_maul.cpp:511-512. */
export const DM_NORTH_TRIBUTE_GUARDS = [
  { encId: 'guard-moldar', entry: ENTRY.moldar, deadFlag: DM_NORTH_FLAGS.moldarDead },
  { encId: 'stomper-kreeg', entry: ENTRY.kreeg, deadFlag: DM_NORTH_FLAGS.kreegDead },
  { encId: 'guard-fengus', entry: ENTRY.fengus, deadFlag: DM_NORTH_FLAGS.fengusDead },
  { encId: 'guard-slipkik', entry: ENTRY.slipkik, deadFlag: DM_NORTH_FLAGS.slipkikDead },
  { encId: 'captain-kromcrush', entry: ENTRY.kromcrush, deadFlag: DM_NORTH_FLAGS.kromcrushDead },
  { encId: 'chorush-the-observer', entry: ENTRY.chorush, deadFlag: DM_NORTH_FLAGS.chorushDead },
] as const;

/** Fixed Trap — quest 1193 spawn; freezes Slip'kik. Cite: dire_maul.h GO not listed; survey 179512. */
export const DM_NORTH_SLIPKIK_TRAP = {
  goEntry: 179512,
  questId: 1193,
  /** Ice Lock — dire_maul.h:120 SPELL_ICE_LOCK (trap GO AI; product freezes via flag). */
  iceLockSpellId: 22856,
  /** Trap react radius yd. Cite: instance_dire_maul.cpp:649 GetClosest…0.5f. */
  reactRadiusYd: 0.5,
} as const;

// Gordok Ogre Suit walk-past: item 18258 useSpell 22736, gated on the suit in bags AND the tannin
// flag. A suit without tannin does not walk past.
export const DM_NORTH_OGRE_SUIT = {
  itemEntry: 18258,
  disguiseSpellId: 22736,
  craftQuestId: 5518,
  craftQuestRepeatable: 5519,
} as const;

/** Knot Free — Ball and Chain + Shackle Key → cache. Survey dbscripts_on_quest_end 5525. */
export const DM_NORTH_KNOT = {
  ballAndChainGo: 179511,
  cacheGo: 179501,
  shackleKeyItem: 18250,
  questId: 5525,
  questRepeatable: 7429,
} as const;

// Gordok Courtyard Door. Lock 1563 is key-only (item 18266). Cite: dungeonGameObjects map 429 guid 4290034;
// locks.json 1563; loot 11441 / go:16523.
export const DM_NORTH_COURTYARD_DOOR = {
  goEntry: 177219,
  requiredItem: 18266,
  spawn: { x: 385.327, y: 374.232, z: -1.343 },
} as const;

// Gordok Inner Door. Lock 1564 is item 18268 (Mol'dar 14326 100%) or picklock 200. Cite: dungeonGameObjects
// map 429 guid 4290033; locks.json 1564; creature_loot 14326.
export const DM_NORTH_INNER_DOOR = {
  goEntry: 177217,
  requiredItem: 18268,
  spawn: { x: 491.204, y: 515.133, z: 29.468 },
} as const;

// North Library Door — lock 1562, Crescent Key 18249 or picklock 300 (an East drop).
// Cite: dire_maul.h:107 GO_NORTH_LIBRARY_DOOR; gameobject-data.json lockId 1562.
export const DM_NORTH_LIBRARY_DOOR = {
  lockId: 1562,
  goEntry: 179549,
  requiredItem: 18249,
  picklockSkill: 300,
  spawn: { x: 351.568, y: 88.674, z: -36.393 },
} as const;

/** Mizzle spawn after king. Cite: dire_maul.h:124 afMizzleSpawnLoc. */
export const DM_NORTH_MIZZLE = {
  entry: ENTRY.mizzle,
  spawn: { x: 683.296, y: 484.384, z: 29.544 },
  /** King of the Gordok. Cite: dire_maul.h:119 SPELL_KING_OF_GORDOK. */
  crownSpellId: 22799,
} as const;

// The two SPELL_AURA_FORCE_REACTION levers, and nothing else — there is no walk-past allowlist.
// 22736 forces faction 829 (Kromcrush); 22799 forces 38 (the King, guards and Gordok trash).
export const DM_NORTH_FORCE_REACTION = {
  /** From item 18258; 10 min. Its purpose is Kromcrush's gossip bypass (menu 5739 cond 928). */
  ogreSuitSpellId: 22736,
  /** The crown. Infinite, stripped on leaving the instance (instance_dire_maul.cpp:75-79). */
  crownSpellId: 22799,
} as const;

// Which force-reaction auras the player carries right now. The engine derives the covered creatures
// from `factionTemplate.faction`, so no entry list is authored here.
export function dmNorthForceReactionSpells(
  flags: readonly string[],
  hasSuitItem: boolean,
): number[] {
  const out: number[] = [];
  if (dmNorthOgreDisguiseActive(flags, hasSuitItem)) out.push(DM_NORTH_FORCE_REACTION.ogreSuitSpellId);
  if (flagHas(flags, DM_NORTH_FLAGS.mizzleCrown)) out.push(DM_NORTH_FORCE_REACTION.crownSpellId);
  return out;
}

/** Summon-only creature entries that must never appear in pure static trash packs. */
export const DM_NORTH_SUMMON_ONLY_ENTRIES = new Set<number>([
  ENTRY.bushwacker, // 14351
  ENTRY.mizzle, // 14353
]);

/** True when flag list has the given flag. */
function flagHas(flags: readonly string[], flag: string): boolean {
  return flags.includes(flag);
}

// Live tribute guards (0–6). A guard is alive unless its TYPE_* DONE flag is set. Trap-frozen Slip'kik has
// no dead flag → still counts. Cite: cpp:511-512.
export function dmNorthGuardsAlive(flags: readonly string[]): number {
  let n = 0;
  for (const g of DM_NORTH_TRIBUTE_GUARDS) {
    if (!flagHas(flags, g.deadFlag)) n += 1;
  }
  return n;
}

// After King Gordok wins: Cho'Rush death in the pack sets TYPE_CHORUSH DONE; a living Cho'Rush or
// Kromcrush is route-cleared without dead flags. Cite: instance_dire_maul.cpp:319-353, 443-460.
export function applyDmNorthKingPackClear(
  run: InstanceRun,
  def: InstanceDef,
  killedEntries: ReadonlySet<number>,
): InstanceRun {
  if (def.id !== 'dire-maul-north') return run;
  let next = run;
  const chorush = def.encounters.find((e) => e.id === 'chorush-the-observer');
  if (chorush && !isCleared(next, chorush.id)) {
    next = killedEntries.has(ENTRY.chorush)
      ? applyEncounterCleared(next, chorush)
      : markDefeated(next, chorush.id);
  }
  const kromcrush = def.encounters.find((e) => e.id === 'captain-kromcrush');
  if (kromcrush && !isCleared(next, kromcrush.id)) {
    next = markDefeated(next, kromcrush.id);
  }
  return next;
}

// Extra reference_loot ids unlocked for the current alive count. Killing a guard permanently drops the
// highest remaining ref.
export function dmNorthTributeExtraRefs(flags: readonly string[]): number[] {
  const alive = dmNorthGuardsAlive(flags);
  const out: number[] = [];
  for (const row of DM_NORTH_TRIBUTE.extraRefs) {
    if (alive >= row.minAlive) out.push(row.ref);
  }
  return out;
}

/** Condition ids that pass for this alive count (type 18 + OR-chain ids used on loot rows). */
export function dmNorthTributeConditionIds(flags: readonly string[]): number[] {
  const alive = dmNorthGuardsAlive(flags);
  const out: number[] = [];
  // Exact match condition 733+alive
  out.push(733 + alive);
  for (const row of DM_NORTH_TRIBUTE.extraRefs) {
    if (alive >= row.minAlive) out.push(row.conditionId);
  }
  return [...new Set(out)];
}

// Ogre suit walk-past: need tannin basket looted AND suit in inventory. Suit craft (5518) consumes Ogre
// Tannin 18240 from the basket.
export function dmNorthOgreDisguiseActive(
  flags: readonly string[],
  hasSuitItem: boolean,
): boolean {
  return flagHas(flags, DM_NORTH_FLAGS.tanninLooted) && hasSuitItem;
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
  moldar: [15580, 15655, 20691, 15749, 11972, 10101, 8269],
  kreeg: [22833, 16740, 15577, 8269, 22835],
  fengus: [15580, 15655, 22572, 20691, 15749, 11972, 10101, 8269],
  slipkik: [15580, 17307, 20691, 15749, 11972, 10101, 8269],
  kromcrush: [22857, 22859, 5246, 19134, 22860, 8599],
  chorush: [10947, 10151, 16170, 15305, 8376, 15982, 15531, 13745, 17139, 22884, 15234, 17290, 17194],
  kingGordok: [22886, 15708, 15572, 16727],
} as const;

function boss(
  id: string,
  name: string,
  creatureEntry: number,
  bossSpells: readonly number[],
  events?: EncounterEvent[],
  intro?: string,
  opts?: { optional?: boolean; pack?: { creatureEntry: number; count: number }[] },
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
  if (opts?.optional) enc.optional = true;
  if (opts?.pack?.length) enc.pack = opts.pack;
  return enc;
}

// Linear encounter graph: North entrance trash → bosses in survey order with inter-boss Gordok
// trash. Tribute: spare the guards, or freeze Slip'kik, for a richer chest.
function buildHandSpine(): EncounterDef[] {
  const brutes = trashFromCensus('brute', 'Gordok Brute', ENTRY.brute, STATIC.brute);
  const mageLords = trashFromCensus(
    'mage-lord',
    'Gordok Mage-Lord',
    ENTRY.mageLord,
    STATIC.mageLord,
  );
  const reavers = trashFromCensus('reaver', 'Gordok Reaver', ENTRY.reaver, STATIC.reaver);
  const captains = trashFromCensus('captain', 'Gordok Captain', ENTRY.captain, STATIC.captain);
  const warlocks = trashFromCensus('warlock', 'Gordok Warlock', ENTRY.warlock, STATIC.warlock);
  const spirits = trashFromCensus('spirit', 'Gordok Spirit', ENTRY.spirit, STATIC.spirit);
  const mastiffs = trashFromCensus('mastiff', 'Gordok Mastiff', ENTRY.mastiff, STATIC.mastiff);
  const ferra = trashFromCensus('ferra', 'Ferra', ENTRY.ferra, STATIC.ferra);

  // Interleave ogre types for variety (pool spawns mix Brute/Mage-Lord/Mastiff).
  const ogrePool: EncounterDef[] = [];
  {
    const max = Math.max(
      brutes.length,
      mageLords.length,
      reavers.length,
      captains.length,
      warlocks.length,
      spirits.length,
    );
    for (let i = 0; i < max; i++) {
      if (brutes[i]) ogrePool.push(brutes[i]!);
      if (mageLords[i]) ogrePool.push(mageLords[i]!);
      if (reavers[i]) ogrePool.push(reavers[i]!);
      if (captains[i]) ogrePool.push(captains[i]!);
      if (warlocks[i]) ogrePool.push(warlocks[i]!);
      if (spirits[i]) ogrePool.push(spirits[i]!);
    }
  }
  const beastPool: EncounterDef[] = [...mastiffs, ...ferra];

  // 8 bands: entrance + between 7 bosses.
  const allTrash: EncounterDef[] = [...ogrePool, ...beastPool];
  const bandCount = 8;
  const bandSize = Math.ceil(allTrash.length / bandCount);
  const band = (i: number) => allTrash.slice(i * bandSize, (i + 1) * bandSize);

  const out: EncounterDef[] = [];

  // --- Entrance → Guard Mol'dar ---
  // Six tribute guards are optional (spare for richer chest). Cite: cpp:507-515.
  out.push(...band(0));
  out.push(
    boss(
      'guard-moldar',
      "Guard Mol'dar",
      ENTRY.moldar,
      BOSS_SPELLS.moldar,
      [{ kind: 'setsFlag', flag: DM_NORTH_FLAGS.moldarDead }],
      "Guard Mol'dar bars the Gordok commons. Spare him for a richer tribute - or walk past in an ogre suit.",
      { optional: true },
    ),
  );

  // --- Mol'dar → Stomper Kreeg ---
  out.push(...band(1));
  out.push(
    boss(
      'stomper-kreeg',
      'Stomper Kreeg',
      ENTRY.kreeg,
      BOSS_SPELLS.kreeg,
      [{ kind: 'setsFlag', flag: DM_NORTH_FLAGS.kreegDead }],
      'Stomper Kreeg the drunken ogre. Leaving him alive fattens the tribute chest.',
      { optional: true },
    ),
  );

  // --- Kreeg → Guard Fengus ---
  out.push(...band(2));
  out.push(
    boss(
      'guard-fengus',
      'Guard Fengus',
      ENTRY.fengus,
      BOSS_SPELLS.fengus,
      [{ kind: 'setsFlag', flag: DM_NORTH_FLAGS.fengusDead }],
      "Guard Fengus patrols the courtyard. Ogre-suited adventurers can stroll past.",
      { optional: true },
    ),
  );

  // --- Fengus → Guard Slip'kik ---
  out.push(...band(3));
  out.push(
    boss(
      'guard-slipkik',
      "Guard Slip'kik",
      ENTRY.slipkik,
      BOSS_SPELLS.slipkik,
      [
        // Fixed Trap freezes without TYPE_SLIPKIK DONE (live controller markDefeated only).
        {
          kind: 'objectGate',
          goEntry: DM_NORTH_SLIPKIK_TRAP.goEntry,
          setsFlag: DM_NORTH_FLAGS.slipkikFrozen,
          once: true,
        },
        // Free Knot! key on Ball and Chain near Slip'kik / Knot.
        {
          kind: 'objectGate',
          goEntry: DM_NORTH_KNOT.ballAndChainGo,
          requiredItem: DM_NORTH_KNOT.shackleKeyItem,
          setsFlag: DM_NORTH_FLAGS.knotFreed,
          once: true,
        },
        // Courtyard Door 177219 / lock 1563. Key 18266: go:16523 100%, Brute 11441 0.22%.
        {
          kind: 'objectGate',
          goEntry: DM_NORTH_COURTYARD_DOOR.goEntry,
          requiredItem: DM_NORTH_COURTYARD_DOOR.requiredItem,
          setsFlag: DM_NORTH_FLAGS.courtyardDoor,
          once: true,
        },
        // Kill path only — trap path must not set this.
        { kind: 'setsFlag', flag: DM_NORTH_FLAGS.slipkikDead },
      ],
      "Guard Slip'kik. Fix the broken trap (quest 1193) to freeze him for the tribute path without a kill.",
      { optional: true },
    ),
  );

  // Survey: loot Ogre Tannin Basket 179499 → Gordok Bushwacker 14351 ambush (near Slip'kik).
  // objectGate + requiresFlag on the ambush encounter (ZF gong pattern).
  out.push({
    id: 'gordok-bushwacker',
    name: 'Gordok Bushwacker',
    kind: 'trash',
    creatureEntry: ENTRY.bushwacker,
    intro: 'Looting the Ogre Tannin Basket draws a Gordok Bushwacker ambush - and yields Ogre Tannin for the suit.',
    events: [
      {
        kind: 'objectGate',
        goEntry: DM_NORTH_TANNIN.goEntry,
        setsFlag: DM_NORTH_FLAGS.tanninLooted,
        once: true,
      },
      { kind: 'requiresFlag', flag: DM_NORTH_FLAGS.tanninLooted },
    ],
  });

  // --- Slip'kik → Captain Kromcrush ---
  out.push(...band(4));
  out.push(
    boss(
      'captain-kromcrush',
      'Captain Kromcrush',
      ENTRY.kromcrush,
      BOSS_SPELLS.kromcrush,
      [
        {
          kind: 'objectGate',
          goEntry: DM_NORTH_INNER_DOOR.goEntry,
          requiredItem: DM_NORTH_INNER_DOOR.requiredItem,
          setsFlag: DM_NORTH_FLAGS.innerDoor,
          once: true,
        },
        { kind: 'requiresFlag', flag: DM_NORTH_FLAGS.innerDoor },
        { kind: 'setsFlag', flag: DM_NORTH_FLAGS.kromcrushDead },
      ],
      'Captain Kromcrush. If still alive when the King falls, he turns friendly (still counts for tribute).',
      { optional: true },
    ),
  );

  // --- Kromcrush → Cho'Rush (optional solo; also packs with King when uncleared) ---
  out.push(...band(5));
  out.push(
    boss(
      'chorush-the-observer',
      "Cho'Rush the Observer",
      ENTRY.chorush,
      BOSS_SPELLS.chorush,
      [
        { kind: 'requiresFlag', flag: DM_NORTH_FLAGS.innerDoor },
        { kind: 'setsFlag', flag: DM_NORTH_FLAGS.chorushDead },
      ],
      "Cho'Rush the Observer stands with King Gordok. Spared for tribute - turns friendly on king death.",
      { optional: true },
    ),
  );

  // --- Cho'Rush → King Gordok ---
  // creature_linking_template (14324, 429, 11501, 3) FLAG_AGGRO_ON_AGGRO|TO_AGGRO — one pull.
  out.push(...band(6));
  out.push(...band(7));
  out.push(
    boss(
      'king-gordok',
      'King Gordok',
      ENTRY.kingGordok,
      BOSS_SPELLS.kingGordok,
      [
        { kind: 'requiresFlag', flag: DM_NORTH_FLAGS.innerDoor },
        // TYPE_KING_GORDOK DONE → tribute chest; Mizzle crown is gossip (product stand-in flag).
        { kind: 'setsFlag', flag: DM_NORTH_FLAGS.kingGordokDeath },
        { kind: 'setsFlag', flag: DM_NORTH_FLAGS.mizzleCrown },
      ],
      "King Gordok. Slay him for the throne - the fewer guards you killed, the richer the Gordok Tribute.",
      { pack: [{ creatureEntry: ENTRY.chorush, count: 1 }] },
    ),
  );

  return out;
}

function buildEncounters(): EncounterDef[] {
  // Hand spine = bosses + event-gated packs (mono trashFromCensus is empty).
  const spine = buildHandSpine();
  return buildClusterEncounters({
    mapId: 429,
    spine,
    entrance: entranceForInstance('dire-maul-north'),
    includePack: wingFilterByNearestBoss(429, "north"),
  });
}


// North / Gordok-relevant quests completable inside. East/West-only and seasonal rows excluded;
// multi-wing chains are left off because they start in another wing.
export const DIRE_MAUL_NORTH_QUESTS = [
  1193, // A Broken Trap (Slip'kik)
  1318, // Unfinished Gordok Business
  5518, // The Gordok Ogre Suit
  5519, // The Gordok Ogre Suit (repeatable)
  5525, // Free Knot!
  5528, // The Gordok Taste Test (Kreeg)
  7429, // Free Knot! (repeatable)
  7703, // Unfinished Gordok Business (Kromcrush)
] as const;

export const DIRE_MAUL_NORTH: InstanceDef = {
  id: 'dire-maul-north',
  mapId: 429,
  wing: 'north',
  name: 'Dire Maul (North)',
  portalZone: 'feralas',
  minLevel: 45, // entrance triggers 3183–3189 requiredLevel
  levelRange: [56, 60], // mission brief North band
  lockoutMs: 0,
  description: '',
  quests: [...DIRE_MAUL_NORTH_QUESTS],
  encounters: buildEncounters(),
  lootObjects: [
    // Gordok Tribute after king death. Scale via CONDITION 18 + dmNorthGuardsAlive.
    { goEntry: DM_NORTH_TRIBUTE.goEntry, revealedByFlag: DM_NORTH_FLAGS.kingGordokDeath },
    // Fengus's Chest — only 100% source of Courtyard Key 18266. Cite: loot 16523.
    { goEntry: 179516 },
    // Knot Thimblejack's Cache after Free Knot.
    { goEntry: DM_NORTH_KNOT.cacheGo, revealedByFlag: DM_NORTH_FLAGS.knotFreed },
  ],
};

/** Count of creatureEntry across primary + pack for one encounter. */
export function encounterCreatureCount(enc: EncounterDef, creatureEntry: number): number {
  let n = enc.creatureEntry === creatureEntry ? 1 : 0;
  for (const p of enc.pack ?? []) {
    if (p.creatureEntry === creatureEntry) n += p.count;
  }
  return n;
}

// Pure static trash pack totals (bosses + flag-gated Bushwacker excluded). Must match STATIC / survey North
// census.
export function dmNorthPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  const add = (entry: number, n: number) => map.set(entry, (map.get(entry) ?? 0) + n);
  for (const enc of DIRE_MAUL_NORTH.encounters) {
    if (enc.kind !== 'trash') continue;
    const req = (enc.events ?? []).some((e) => e.kind === 'requiresFlag');
    if (req) continue; // Bushwacker is event-only
    if (DM_NORTH_SUMMON_ONLY_ENTRIES.has(enc.creatureEntry)) continue;
    add(enc.creatureEntry, 1);
    for (const p of enc.pack ?? []) add(p.creatureEntry, p.count);
  }
  return map;
}
