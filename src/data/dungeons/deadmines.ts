// The Deadmines (map 36) — golden InstanceDef graph. Authority: docs/dungeons/survey/03-deadmines.md.
// Trash from CFH/Detection cluster packs; hand overrides for boss-death patrols and the cannon gate.

import type { EncounterDef, EncounterEvent, InstanceDef } from '../schema.ts';
import {
  entranceForInstance,
  interleaveTrashAndBosses,
  killSupplyFromEncounter,
  physicalSlotCount,
  surveyBossPos,
  trashFromClusters,
} from './pack-from-clusters.ts';

const ENTRY = {
  miner: 598,
  watchman: 1725,
  stripMiner: 4416,
  craftsman: 1731,
  engineer: 622,
  woodcarver: 641,
  blackguard: 636,
  pirate: 657,
  squallshaper: 1732,
  shipbuilder: 3947,
  overseer: 634,
  evoker: 1729,
  taskmaster: 4417,
  wizard: 4418,
  rhahkzor: 644,
  johnson: 3586,
  shredder: 642,
  sneed: 643,
  gilnid: 1763,
  smite: 646,
  greenskin: 647,
  vancleef: 639,
  cookie: 645,
} as const;

/** Bosses + rares stripped from cluster trash. */
export const DEADMINES_STRIP = new Set<number>([
  ENTRY.rhahkzor,
  ENTRY.johnson,
  ENTRY.shredder,
  ENTRY.sneed, // summon-only; not in clusters
  ENTRY.gilnid,
  ENTRY.smite,
  ENTRY.greenskin,
  ENTRY.vancleef,
  ENTRY.cookie,
]);

/** Flags from survey event choreography / instance_deadmines.cpp. */
export const DEADMINES_FLAGS = {
  rhahkzorDeath: 'deadmines-rhahkzor-death',
  sneedDeath: 'deadmines-sneed-death',
  gilnidDeath: 'deadmines-gilnid-death',
  ironCladDoor: 'deadmines-iron-clad-door',
} as const;

/** GO 16398 + key item 5397 (Defias Gunpowder) - survey Defias Cannon choreography. */
export const DEADMINES_CANNON = {
  goEntry: 16398,
  requiredItem: 5397,
} as const;

// Survey boss avg pos (map 36) — no hand-typed coordinate tables. Keep `z`: VanCleef stands on the
// ship DECK (z 41) over the cove water column (z 0.2), and z is what tells the NavStack his layer.
function bossPos(entry: number): { x: number; y: number; z?: number } {
  const p = surveyBossPos(36, entry);
  if (!p) throw new Error(`deadmines: missing survey boss pos for entry ${entry}`);
  return p.z != null ? { x: p.x, y: p.y, z: p.z } : { x: p.x, y: p.y };
}

// Boss spells: creature.spells from bake — no invented ids.
const BOSS_SPELLS = {
  rhahkzor: [6304],
  johnson: [12097],
  shredder: [7399, 3603],
  sneed: [6713],
  gilnid: [5213],
  smite: [6432, 6264, 6435],
  greenskin: [5208, 5532],
  vancleef: [5200, 3391, 12787, 674],
  cookie: [5174, 6306],
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
    bossSpells: [...bossSpells],
  };
  if (intro) enc.intro = intro;
  if (events && events.length) enc.events = events;
  return enc;
}

// Linear encounter graph: cluster trash + survey boss order + hand event patrols and gates. Ship
// packs south of the Gilnid/Smite midpoint gain requiresFlag iron-clad-door after the cannon gate.
function buildEncounters(): EncounterDef[] {
  const entrance = entranceForInstance('deadmines');
  if (!entrance) throw new Error('deadmines: missing areatrigger entrance');
  const pos = {
    rhahkzor: bossPos(ENTRY.rhahkzor),
    johnson: bossPos(ENTRY.johnson),
    shredder: bossPos(ENTRY.shredder),
    gilnid: bossPos(ENTRY.gilnid),
    smite: bossPos(ENTRY.smite),
    greenskin: bossPos(ENTRY.greenskin),
    vancleef: bossPos(ENTRY.vancleef),
    cookie: bossPos(ENTRY.cookie),
  };

  const allTrash = trashFromClusters({
    mapId: 36,
    stripEntries: DEADMINES_STRIP,
    entrance,
  });

  // Ship vs mine: y midpoint of Gilnid (foundry) and Smite (deck) from survey.
  const shipCutoffY = (pos.gilnid.y + pos.smite.y) / 2;
  const preShip = allTrash.filter((t) => (t.origin?.y ?? 0) > shipCutoffY);
  const shipTrash = allTrash.filter((t) => (t.origin?.y ?? 0) <= shipCutoffY);

  const patrolRhahk: EncounterDef = {
    id: 'patrol-rhahkzor',
    name: "Rhahk'Zor Door Patrol",
    kind: 'trash',
    creatureEntry: ENTRY.overseer,
    pack: [{ creatureEntry: ENTRY.evoker, count: 1 }],
    events: [{ kind: 'requiresFlag', flag: DEADMINES_FLAGS.rhahkzorDeath }],
  };

  const patrolSneed: EncounterDef = {
    id: 'patrol-sneed',
    name: 'Mast Room Patrol',
    kind: 'trash',
    creatureEntry: ENTRY.evoker,
    pack: [{ creatureEntry: ENTRY.overseer, count: 1 }],
    events: [{ kind: 'requiresFlag', flag: DEADMINES_FLAGS.sneedDeath }],
  };

  const patrolGilnid: EncounterDef = {
    id: 'patrol-gilnid',
    name: 'Foundry Door Patrol',
    kind: 'trash',
    creatureEntry: ENTRY.taskmaster,
    pack: [
      { creatureEntry: ENTRY.taskmaster, count: 1 },
      { creatureEntry: ENTRY.wizard, count: 1 },
    ],
    events: [{ kind: 'requiresFlag', flag: DEADMINES_FLAGS.gilnidDeath }],
  };

  const preBosses = interleaveTrashAndBosses(
    preShip,
    [
      {
        encounter: boss(
          'rhahkzor',
          "Rhahk'Zor",
          ENTRY.rhahkzor,
          BOSS_SPELLS.rhahkzor,
          [{ kind: 'setsFlag', flag: DEADMINES_FLAGS.rhahkzorDeath }],
          "Rhahk'Zor, VanCleef's ogre enforcer, blocks the tunnel.",
        ),
        pos: pos.rhahkzor,
      },
      {
        // Vanilla rare (entry 3586) — skippable; isComplete ignores optional.
        encounter: {
          ...boss(
            'miner-johnson',
            'Miner Johnson',
            ENTRY.johnson,
            BOSS_SPELLS.johnson,
            undefined,
            'A rare Defias overseer works a side shaft.',
          ),
          optional: true,
        },
        pos: pos.johnson,
      },
      {
        encounter: boss(
          'sneeds-shredder',
          "Sneed's Shredder",
          ENTRY.shredder,
          BOSS_SPELLS.shredder,
          [
            { kind: 'onDeathSummon', creatureEntry: ENTRY.sneed, bossSpells: [...BOSS_SPELLS.sneed] },
            { kind: 'setsFlag', flag: DEADMINES_FLAGS.sneedDeath },
          ],
          'A goblin shredder grinds to life, Sneed cackling at the controls.',
        ),
        pos: pos.shredder,
      },
      {
        encounter: boss(
          'gilnid',
          'Gilnid',
          ENTRY.gilnid,
          BOSS_SPELLS.gilnid,
          [{ kind: 'setsFlag', flag: DEADMINES_FLAGS.gilnidDeath }],
          'Gilnid the smelter hurls molten metal.',
        ),
        pos: pos.gilnid,
      },
    ],
    entrance,
    {
      rhahkzor: [patrolRhahk],
      'sneeds-shredder': [patrolSneed],
      gilnid: [patrolGilnid],
    },
  );

  // Cannon room: objectGate on a dedicated encounter (survey GO 16398 / item 5397).
  // Attach gate to first remaining ship trash pack when present; else gate-only shipbuilder.
  const out: EncounterDef[] = [...preBosses];

  const shipSorted = [...shipTrash].sort((a, b) => {
    const da = a.origin ? Math.hypot(a.origin.x - pos.smite.x, a.origin.y - pos.smite.y) : 0;
    const db = b.origin ? Math.hypot(b.origin.x - pos.smite.x, b.origin.y - pos.smite.y) : 0;
    return da - db;
  });

  const cannonEvents: EncounterEvent[] = [
    {
      kind: 'objectGate',
      goEntry: DEADMINES_CANNON.goEntry,
      requiredItem: DEADMINES_CANNON.requiredItem,
      setsFlag: DEADMINES_FLAGS.ironCladDoor,
      once: true,
    },
  ];

  if (shipSorted.length > 0) {
    const first = shipSorted[0]!;
    out.push({
      ...first,
      id: 'defias-cannon',
      name: 'Defias Cannon',
      events: [...(first.events ?? []), ...cannonEvents],
    });
  } else {
    out.push({
      id: 'defias-cannon',
      name: 'Defias Cannon',
      kind: 'trash',
      creatureEntry: ENTRY.shipbuilder,
      events: cannonEvents,
    });
  }

  // Optional ship-guard pack (survey: 3 pool guards 3600148–3600150 after cannon)
  out.push({
    id: 'ship-guards',
    name: 'Iron Clad Door Guards',
    kind: 'trash',
    creatureEntry: ENTRY.pirate,
    pack: [
      { creatureEntry: ENTRY.pirate, count: 1 },
      { creatureEntry: ENTRY.squallshaper, count: 1 },
    ],
    events: [{ kind: 'requiresFlag', flag: DEADMINES_FLAGS.ironCladDoor }],
  });

  const restShip = shipSorted.slice(shipSorted.length > 0 ? 1 : 0);
  // Ship trash + deck bosses: Smite → Greenskin → VanCleef → Cookie
  const shipEncounters = interleaveTrashAndBosses(
    restShip,
    [
      {
        // Former hpThreshold 66/33 phase-flag stand-in RETIRED — boss_mr_smite ScriptDev owns the
        // 66%/33% stomp and thrash/slam kit. Both live would double-fire the phase flags.
        encounter: boss(
          'mr-smite',
          'Mr. Smite',
          ENTRY.smite,
          BOSS_SPELLS.smite,
          [
            { kind: 'requiresFlag', flag: DEADMINES_FLAGS.ironCladDoor },
          ],
          'Mr. Smite steps onto the deck of the Juggernaut.',
        ),
        pos: pos.smite,
      },
      {
        encounter: boss(
          'captain-greenskin',
          'Captain Greenskin',
          ENTRY.greenskin,
          BOSS_SPELLS.greenskin,
          [{ kind: 'requiresFlag', flag: DEADMINES_FLAGS.ironCladDoor }],
          'Captain Greenskin levels a harpoon at you.',
        ),
        pos: pos.greenskin,
      },
      {
        encounter: boss(
          'edwin-vancleef',
          'Edwin VanCleef',
          ENTRY.vancleef,
          BOSS_SPELLS.vancleef,
          [{ kind: 'requiresFlag', flag: DEADMINES_FLAGS.ironCladDoor }],
          'Edwin VanCleef draws his blades atop the Juggernaut.',
        ),
        pos: pos.vancleef,
      },
      {
        encounter: boss(
          'cookie',
          'Cookie',
          ENTRY.cookie,
          BOSS_SPELLS.cookie,
          [{ kind: 'requiresFlag', flag: DEADMINES_FLAGS.ironCladDoor }],
          'Cookie brandishes a rolling pin and a ladle of something foul.',
        ),
        pos: pos.cookie,
      },
    ],
    pos.smite,
  );

  for (const e of shipEncounters) {
    if (e.kind === 'boss') {
      out.push(e);
      continue;
    }
    // Ship trash always behind iron-clad door
    out.push({
      ...e,
      events: [...(e.events ?? []), { kind: 'requiresFlag', flag: DEADMINES_FLAGS.ironCladDoor }],
    });
  }

  return out;
}

/** Survey quests completable inside / linked to map 36. */
export const DEADMINES_QUESTS = [214, 2040, 166, 373, 1654, 7938] as const;

export const DEADMINES: InstanceDef = {
  id: 'deadmines',
  mapId: 36,
  name: 'The Deadmines',
  portalZone: 'westfall',
  minLevel: 10, // entrance trigger 78 requiredLevel
  levelRange: [16, 20], // survey trash band
  lockoutMs: 0,
  description: '',
  quests: [...DEADMINES_QUESTS],
  encounters: buildEncounters(),
};

/** Sum of authored kill supply (CSE max-coverage + bosses + event patrols). */
export function deadminesStaticPackCounts(): Map<number, number> {
  const map = new Map<number, number>();
  for (const enc of DEADMINES.encounters) {
    for (const [entry, n] of killSupplyFromEncounter(enc)) {
      map.set(entry, (map.get(entry) ?? 0) + n);
    }
  }
  return map;
}

// Pure static trash only — no bosses, no requiresFlag hand patrols or ship guards. CSE slots count
// once per concrete entry, or once per candidate under max-coverage. Totals use physicalSlotCount.
export function deadminesPureStaticTrashCounts(): Map<number, number> {
  const map = new Map<number, number>();
  for (const enc of DEADMINES.encounters) {
    if (enc.kind !== 'trash') continue;
    if (enc.id === 'ship-guards') continue;
    if (enc.id === 'patrol-rhahkzor' || enc.id === 'patrol-sneed' || enc.id === 'patrol-gilnid') {
      continue;
    }
    const req = (enc.events ?? []).some((e) => e.kind === 'requiresFlag');
    // Ship trash behind door still counts as static census (cluster static), not event patrols.
    // Exclude only hand-authored gated patrols (above). Flag on ship is instance gate, not event spawn.
    if (req && (enc.id.startsWith('patrol-') || enc.id === 'ship-guards')) continue;
    for (const [entry, n] of killSupplyFromEncounter(enc)) {
      // For pure-static physical match, strip CSE expansion: count concrete only + CSE as candidates separately
      map.set(entry, (map.get(entry) ?? 0) + n);
    }
  }
  return map;
}

/** Physical spawn slots in pure static trash (CSE = 1 each, no double mono streams). */
export function deadminesPhysicalStaticSlots(): number {
  let n = 0;
  for (const enc of DEADMINES.encounters) {
    if (enc.kind !== 'trash') continue;
    if (enc.id === 'ship-guards') continue;
    if (enc.id.startsWith('patrol-')) continue;
    n += physicalSlotCount(enc);
  }
  return n;
}
