// Outdoor world bosses on the pack / hunt framework: which zone lists each, spawn coords for
// spatial pulls, and CreatureDef overlays for templates missing from the bake. Never invented.

import type { CreatureDef, CreatureSpawnPos } from '../../data/schema.ts';
import { CREATURE_ELITE } from '../../data/schema.ts';
import {
  NPC_AZUREGOS,
  NPC_DEMENTED_DRUID,
  NPC_DREAM_FOG,
  NPC_EMERISS,
  NPC_LETHON,
  NPC_LORD_KAZZAK,
  NPC_SHADE_OF_TAERAR,
  NPC_SPIRIT_SHADE,
  NPC_TAERAR,
  NPC_YSONDRE,
} from '../scriptdev/worldBosses.ts';

// Spawn coords (sourced)

/** Kazzak Blasted Lands — creature.guid 2723 map 0. */
export const SPAWN_KAZZAK = {
  map: 0,
  x: -12241.3,
  y: -2432.12,
  z: 2.93936,
  cite: 'classicmangos creature guid=2723 id=12397',
} as const;

/** Azuregos Azshara — creature.guid 5234 map 1. */
export const SPAWN_AZUREGOS = {
  map: 1,
  x: 2622.22,
  y: -5977.93,
  z: 100.76,
  cite: 'classicmangos creature guid=5234 id=6109',
} as const;

// Emerald dragon spawn slots (WorldState.cpp:580-586). Which boss holds which slot is live-server
// WorldState; the product exposes all four as always-available hunts at their classic slots.
export const EMERALD_DRAGON_SPAWNS = [
  {
    // map 0 — Duskwood Twilight Grove
    zoneId: 'duskwood',
    map: 0,
    x: -10428.8,
    y: -392.176,
    z: 43.7411,
    o: 0.932375,
    cite: 'WorldState.cpp:582 emeraldDragonSpawns[0] Duskwood',
  },
  {
    // map 0 — Hinterlands Seradane
    zoneId: 'hinterlands',
    map: 0,
    x: 753.619,
    y: -4012,
    z: 94.043,
    o: 3.193,
    cite: 'WorldState.cpp:583 emeraldDragonSpawns[1] Hinterlands',
  },
  {
    // map 1 — Ashenvale Bough Shadow
    zoneId: 'ashenvale',
    map: 1,
    x: -2872.66,
    y: 1884.25,
    z: 52.7336,
    o: 2.6529,
    cite: 'WorldState.cpp:584 emeraldDragonSpawns[2] Ashenvale',
  },
  {
    // map 1 — Feralas Dream Bough
    zoneId: 'feralas',
    map: 1,
    x: 3301.05,
    y: -3732.57,
    z: 173.544,
    o: 2.9147,
    cite: 'WorldState.cpp:585 emeraldDragonSpawns[3] Feralas',
  },
] as const;

/** Emerald dragon entries (Ysondre, Lethon, Emeriss, Taerar). */
export const EMERALD_DRAGON_ENTRIES = [
  NPC_YSONDRE,
  NPC_LETHON,
  NPC_EMERISS,
  NPC_TAERAR,
] as const;

/** All six Wave-T world boss entries. */
export const WORLD_BOSS_ENTRIES = [
  NPC_LORD_KAZZAK,
  NPC_AZUREGOS,
  ...EMERALD_DRAGON_ENTRIES,
] as const;

// Zone → world-boss entries available as outdoor hunts. Kazzak/Azuregos: static creature table. Emeralds:
// WorldState slots (all four listed in each of the four classic zones — rotation not modeled).
export const WORLD_BOSS_ZONE_ENTRIES: Readonly<Record<string, readonly number[]>> = {
  blastedlands: [NPC_LORD_KAZZAK],
  azshara: [NPC_AZUREGOS],
  duskwood: [...EMERALD_DRAGON_ENTRIES],
  hinterlands: [...EMERALD_DRAGON_ENTRIES],
  ashenvale: [...EMERALD_DRAGON_ENTRIES],
  feralas: [...EMERALD_DRAGON_ENTRIES],
};

// Template stubs (creature_template — missing from creatures bake) Cite: classicmangos SELECT … WHERE Entry
// IN (14887–14890, 15224, 15260, 15261, 15302)

function band(a: number, b: number): { lo: number; hi: number } {
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

function worldBossTemplate(opts: {
  entry: number;
  name: string;
  level: number;
  hp: number;
  dmgMin: number;
  dmgMax: number;
  armor: number;
  attackTimeMs: number;
  creatureType: number;
  factionId: number;
  lootId: number;
  minGold: number;
  maxGold: number;
  mana?: number;
  rank?: number;
  healthMultiplier?: number;
  damageMultiplier?: number;
  unitClass?: number;
}): CreatureDef {
  const gold = band(opts.minGold, opts.maxGold);
  const rank = opts.rank ?? CREATURE_ELITE.WORLDBOSS;
  const unitClass = opts.unitClass ?? 1;
  return {
    entry: opts.entry,
    name: opts.name,
    level: opts.level,
    hpMin: opts.hp,
    hpMax: opts.hp,
    dmgMin: opts.dmgMin,
    dmgMax: opts.dmgMax,
    attackTimeMs: opts.attackTimeMs,
    armor: opts.armor,
    lootId: opts.lootId,
    minGold: gold.lo,
    maxGold: gold.hi,
    xp: 0,
    experienceMultiplier: 1,
    creatureType: opts.creatureType,
    factionId: opts.factionId,
    ...(opts.mana != null && opts.mana > 0 ? { mana: opts.mana } : {}),
    scaling: {
      minLevel: opts.level,
      maxLevel: opts.level,
      unitClass,
      rank,
      healthMultiplier: opts.healthMultiplier ?? 1,
      powerMultiplier: 1,
      damageMultiplier: opts.damageMultiplier ?? 1,
      damageVariance: 1,
      armorMultiplier: 1,
      experienceMultiplier: 1,
      minLevelHealth: opts.hp,
      maxLevelHealth: opts.hp,
      minLevelMana: opts.mana ?? 0,
      maxLevelMana: opts.mana ?? 0,
      minMeleeDmg: opts.dmgMin,
      maxMeleeDmg: opts.dmgMax,
      minRangedDmg: 0,
      maxRangedDmg: 0,
      armor: opts.armor,
      meleeAttackPower: 268,
      rangedAttackPower: 32,
      meleeBaseAttackTime: opts.attackTimeMs,
      rangedBaseAttackTime: opts.attackTimeMs,
    },
  };
}

// World-boss and add templates absent from or incomplete in the creatures bake — the bake wins
// first via resolveCreatureDefForCombat. Shared dragon row: lvl 63, HP 832750, melee 110–146.
export const WORLD_BOSS_TEMPLATES: ReadonlyMap<number, CreatureDef> = new Map([
  [
    NPC_YSONDRE,
    worldBossTemplate({
      entry: NPC_YSONDRE,
      name: 'Ysondre',
      level: 63,
      hp: 832_750,
      dmgMin: 110,
      dmgMax: 146,
      armor: 4691,
      attackTimeMs: 2000,
      creatureType: 2,
      factionId: 50,
      lootId: 14887,
      minGold: 1_300_000,
      maxGold: 1_820_000,
      healthMultiplier: 250,
      damageMultiplier: 20,
    }),
  ],
  [
    NPC_LETHON,
    worldBossTemplate({
      entry: NPC_LETHON,
      name: 'Lethon',
      level: 63,
      hp: 832_750,
      dmgMin: 110,
      dmgMax: 146,
      armor: 4691,
      attackTimeMs: 2000,
      creatureType: 2,
      factionId: 50,
      lootId: 14888,
      minGold: 1_300_000,
      maxGold: 1_820_000,
      healthMultiplier: 250,
      damageMultiplier: 20,
    }),
  ],
  [
    NPC_EMERISS,
    worldBossTemplate({
      entry: NPC_EMERISS,
      name: 'Emeriss',
      level: 63,
      hp: 832_750,
      dmgMin: 110,
      dmgMax: 146,
      armor: 4691,
      attackTimeMs: 2000,
      creatureType: 2,
      factionId: 50,
      lootId: 14889,
      minGold: 1_300_000,
      maxGold: 1_820_000,
      healthMultiplier: 250,
      damageMultiplier: 20,
    }),
  ],
  [
    NPC_TAERAR,
    worldBossTemplate({
      entry: NPC_TAERAR,
      name: 'Taerar',
      level: 63,
      hp: 832_750,
      dmgMin: 110,
      dmgMax: 146,
      armor: 4691,
      attackTimeMs: 2000,
      creatureType: 2,
      factionId: 50,
      lootId: 14890,
      minGold: 1_300_000,
      maxGold: 1_820_000,
      healthMultiplier: 250,
      damageMultiplier: 20,
    }),
  ],
  [
    NPC_DREAM_FOG,
    worldBossTemplate({
      entry: NPC_DREAM_FOG,
      name: 'Dream Fog',
      level: 63,
      hp: 3052,
      dmgMin: 19,
      dmgMax: 28,
      armor: 3791,
      attackTimeMs: 1666,
      creatureType: 10,
      factionId: 50,
      lootId: 0,
      minGold: 0,
      maxGold: 2,
      rank: CREATURE_ELITE.WORLDBOSS,
    }),
  ],
  [
    NPC_DEMENTED_DRUID,
    worldBossTemplate({
      entry: NPC_DEMENTED_DRUID,
      name: 'Demented Druid Spirit',
      level: 60,
      hp: 2442,
      dmgMin: 97,
      dmgMax: 128,
      armor: 3075,
      attackTimeMs: 2000,
      creatureType: 10,
      factionId: 14,
      lootId: 0,
      minGold: 0,
      maxGold: 0,
      mana: 4868,
      rank: CREATURE_ELITE.NORMAL,
      unitClass: 2,
    }),
  ],
  [
    NPC_SPIRIT_SHADE,
    worldBossTemplate({
      entry: NPC_SPIRIT_SHADE,
      name: 'Spirit Shade',
      level: 60,
      hp: 610,
      dmgMin: 104,
      dmgMax: 138,
      armor: 3791,
      attackTimeMs: 2000,
      creatureType: 10,
      factionId: 14,
      lootId: 0,
      minGold: 64,
      maxGold: 318,
      rank: CREATURE_ELITE.NORMAL,
      healthMultiplier: 0.2,
    }),
  ],
  [
    NPC_SHADE_OF_TAERAR,
    worldBossTemplate({
      entry: NPC_SHADE_OF_TAERAR,
      name: 'Shade of Taerar',
      level: 63,
      hp: 66_620,
      dmgMin: 110,
      dmgMax: 146,
      armor: 4691,
      attackTimeMs: 2000,
      creatureType: 2,
      factionId: 14,
      lootId: 0,
      minGold: 0,
      maxGold: 0,
      healthMultiplier: 20,
      damageMultiplier: 20,
    }),
  ],
]);

/** Lookup world-boss overlay template (or undefined). */
export function worldBossTemplateFor(entry: number): CreatureDef | undefined {
  return WORLD_BOSS_TEMPLATES.get(entry | 0);
}

/** World-boss entries for a zone (empty when none). */
export function worldBossEntriesForZone(zoneId: string): readonly number[] {
  return WORLD_BOSS_ZONE_ENTRIES[zoneId] ?? [];
}

// Spatial spawn overlays for world bosses in a zone (for assist / origin pulls). Does not invent coords —
// only sourced creature table / WorldState positions.
export function worldBossSpawnsForZone(zoneId: string): CreatureSpawnPos[] {
  const out: CreatureSpawnPos[] = [];
  if (zoneId === 'blastedlands') {
    out.push({
      entry: NPC_LORD_KAZZAK,
      map: SPAWN_KAZZAK.map,
      x: SPAWN_KAZZAK.x,
      y: SPAWN_KAZZAK.y,
    });
  }
  if (zoneId === 'azshara') {
    out.push({
      entry: NPC_AZUREGOS,
      map: SPAWN_AZUREGOS.map,
      x: SPAWN_AZUREGOS.x,
      y: SPAWN_AZUREGOS.y,
    });
  }
  const slot = EMERALD_DRAGON_SPAWNS.find((s) => s.zoneId === zoneId);
  if (slot) {
    for (const entry of EMERALD_DRAGON_ENTRIES) {
      out.push({
        entry,
        map: slot.map,
        x: slot.x,
        y: slot.y,
      });
    }
  }
  return out;
}
