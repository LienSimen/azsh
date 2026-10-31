// Sourced creature_linking_template rows (entry, map, masterEntry, flag, searchRange), 155 of them.
// AGGRO_ON_AGGRO 0x1 joins slaves to the master; TO_AGGRO_ON_AGGRO 0x2 the reverse. Do not invent.

import aggroGroupsJson from '../../data/tables/creatureAggroGroups.json' with { type: 'json' };

/** CMaNGOS CreatureLinking flags used for outdoor entry-hunt pack membership. */
export const LINK_FLAG = {
  AGGRO_ON_AGGRO: 0x1,
  TO_AGGRO_ON_AGGRO: 0x2,
  /** The slave vanishes when the master dies — no corpse, no loot. Cite: CreatureLinkingMgr.h:66. */
  DESPAWN_ON_DEATH: 0x10,
  /** The slave dies with the master, corpse and all. Cite: CreatureLinkingMgr.h:67. */
  SELFKILL_ON_DEATH: 0x20,
  /** The slave vanishes when the master evades home. Cite: CreatureLinkingMgr.h:65. */
  DESPAWN_ON_EVADE: 0x1000,
} as const;

/** One creature_linking_template row: [entry, map, masterEntry, flag, searchRange]. */
export type LinkingTemplateRow = readonly [number, number, number, number, number];

// Full template table (classic-db count 155). entry = slave, masterEntry = master; map matches
// creature.map.
export const CREATURE_LINKING_TEMPLATE: readonly LinkingTemplateRow[] = [
  [390, 0, 330, 515, 0],
  [15904, 531, 15727, 4128, 0],
  [15802, 531, 15727, 4128, 0],
  [1755, 0, 1754, 3, 100],
  [2331, 0, 2330, 656, 20],
  [2532, 0, 2533, 656, 0],
  [2721, 0, 2714, 515, 0],
  [2738, 0, 2612, 515, 0],
  [2764, 0, 2611, 515, 0],
  [2765, 0, 2611, 515, 0],
  [3504, 0, 2330, 656, 20],
  [4063, 0, 2611, 515, 0],
  [15728, 531, 15727, 4128, 0],
  [15726, 531, 15727, 4128, 0],
  [15725, 531, 15589, 4096, 0],
  [5668, 0, 5670, 518, 20],
  [5701, 0, 5706, 518, 20],
  [5707, 0, 5706, 518, 20],
  [15589, 531, 15727, 4, 0],
  [15544, 531, 15511, 1167, 0],
  [15543, 531, 15511, 1167, 0],
  [15334, 531, 15727, 4128, 0],
  [15317, 531, 15276, 1156, 0],
  [15316, 531, 15276, 1156, 0],
  [7386, 0, 8666, 9872, 0],
  [15277, 531, 15276, 1025, 0],
  [15276, 531, 15275, 143, 0],
  [8391, 0, 8400, 3, 50],
  [15264, 531, 15263, 1024, 0],
  [15262, 531, 15263, 1024, 0],
  [15249, 531, 15235, 1667, 8],
  [10204, 1, 10182, 643, 0],
  [15236, 531, 15235, 1667, 8],
  [15235, 531, 15509, 1024, 0],
  [15240, 531, 15509, 1024, 0],
  [15229, 531, 15510, 1024, 0],
  [15934, 509, 15369, 4096, 0],
  [15546, 509, 15369, 4112, 0],
  [15514, 509, 15370, 1030, 0],
  [15462, 509, 15340, 1024, 0],
  [15461, 509, 15340, 1024, 0],
  [15428, 509, 15339, 4112, 0],
  [15355, 509, 15339, 1024, 0],
  [15343, 509, 15348, 1024, 0],
  [15338, 509, 15340, 1024, 0],
  [15336, 509, 15369, 1024, 0],
  [15319, 509, 15369, 1024, 0],
  [12128, 0, 1840, 513, 20],
  [15318, 509, 15369, 1024, 0],
  [12468, 469, 12017, 1024, 0],
  [12458, 469, 12017, 1024, 0],
  [12467, 469, 12017, 1024, 0],
  [14022, 469, 12017, 1024, 0],
  [14892, 1, 14857, 512, 0],
  [14025, 469, 12017, 1024, 0],
  [14023, 469, 12017, 1024, 0],
  [14024, 469, 12017, 1024, 0],
  [14456, 469, 12557, 1167, 0],
  [12557, 469, 12435, 1159, 0],
  [14483, 429, 14501, 8192, 0],
  [14482, 429, 14501, 8192, 0],
  [14349, 429, 14327, 515, 0],
  [14324, 429, 11501, 3, 0],
  [11460, 429, 11460, 3, 0],
  [11459, 429, 11489, 1, 0],
  [12101, 409, 12057, 1024, 0],
  [12099, 409, 12057, 1543, 0],
  [11673, 409, 11982, 1024, 0],
  [11672, 409, 11988, 1031, 0],
  [11664, 409, 12018, 7, 0],
  [11663, 409, 12018, 7, 0],
  [11662, 409, 12098, 1031, 0],
  [11661, 409, 12259, 1031, 0],
  [11322, 389, 11518, 3, 15],
  [11319, 389, 11517, 3, 15],
  [11318, 389, 11517, 3, 15],
  [13743, 349, 12225, 23, 0],
  [15542, 1, 15541, 26243, 0],
  [11783, 349, 11784, 515, 15],
  [10387, 329, 10516, 3, 0],
  [15117, 309, 11382, 4096, 0],
  [14988, 309, 11382, 4096, 0],
  [11373, 309, 14507, 7, 0],
  [10475, 289, 10433, 1, 0],
  [10433, 289, 10432, 1, 0],
  [9541, 230, 9537, 3, 0],
  [9445, 230, 9438, 515, 20],
  [9178, 230, 9156, 4112, 0],
  [8920, 230, 8983, 1, 100],
  [8907, 230, 8983, 1, 0],
  [8906, 230, 8920, 1, 12],
  [8900, 230, 8983, 1, 100],
  [10814, 229, 10363, 7, 0],
  [10316, 229, 10316, 3, 0],
  [10683, 229, 10264, 3, 0],
  [10258, 229, 10264, 3, 0],
  [7608, 209, 7604, 3, 20],
  [7606, 209, 7604, 3, 20],
  [7605, 209, 7604, 3, 20],
  [8120, 209, 7267, 1, 0],
  [7268, 209, 7267, 1, 0],
  [12352, 0, 12339, 8705, 100],
  [5184, 1, 4966, 128, 40],
  [8319, 109, 5709, 1, 0],
  [5722, 109, 5709, 1, 0],
  [5721, 109, 5709, 1, 0],
  [5720, 109, 5709, 1, 0],
  [5283, 109, 5709, 1, 0],
  [5280, 109, 5709, 1, 0],
  [5277, 109, 5709, 1, 0],
  [11887, 0, 11886, 515, 100],
  [6908, 70, 6906, 3, 0],
  [6907, 70, 6906, 3, 0],
  [10120, 70, 2748, 20, 0],
  [7309, 70, 2748, 20, 0],
  [7077, 70, 2748, 20, 0],
  [7076, 70, 2748, 20, 0],
  [1725, 36, 1725, 3, 30],
  [13284, 30, 13236, 515, 50],
  [13443, 30, 13442, 515, 50],
  [4969, 0, 4961, 4097, 0],
  [14765, 30, 11948, 16385, 0],
  [1436, 0, 888, 3, 0],
  [1001, 0, 888, 3, 0],
  [499, 0, 888, 3, 0],
  [1000, 0, 888, 3, 0],
  [1263, 0, 1352, 514, 0],
  [3659, 1, 3658, 513, 0],
  [14764, 30, 11948, 16385, 0],
  [14763, 30, 11948, 16385, 0],
  [14762, 30, 11948, 16385, 0],
  [12122, 30, 11946, 16389, 0],
  [12474, 1, 12476, 515, 10],
  [12475, 1, 12476, 515, 10],
  [847, 0, 849, 512, 0],
  [12121, 30, 11946, 16389, 0],
  [14777, 30, 11946, 16385, 0],
  [14776, 30, 11946, 16385, 0],
  [14773, 30, 11946, 16385, 0],
  [14772, 30, 11946, 16385, 0],
  [11885, 0, 11878, 17539, 0],
  [15910, 531, 15727, 4128, 0],
  [15922, 531, 15299, 4112, 0],
  [16063, 533, 16062, 143, 0],
  [16064, 533, 16062, 143, 0],
  [16065, 533, 16062, 143, 0],
  [16360, 533, 15932, 4112, 0],
  [16505, 533, 15953, 7, 0],
  [16506, 533, 15953, 7, 0],
  [16573, 533, 15956, 1031, 0],
  [16775, 533, 16062, 256, 0],
  [16776, 533, 16065, 256, 0],
  [16777, 533, 16063, 256, 0],
  [16778, 533, 16064, 256, 0],
  [16803, 533, 16061, 16391, 0],
];

/** slave entry → rows where this entry is the slave */
const bySlave = new Map<number, LinkingTemplateRow[]>();
/** master entry → rows where this entry is the master */
const byMaster = new Map<number, LinkingTemplateRow[]>();

for (const row of CREATURE_LINKING_TEMPLATE) {
  const slave = row[0] | 0;
  const master = row[2] | 0;
  if (!bySlave.has(slave)) bySlave.set(slave, []);
  bySlave.get(slave)!.push(row);
  if (!byMaster.has(master)) byMaster.set(master, []);
  byMaster.get(master)!.push(row);
}

// Entry ids that hard-link into combat with `entry` via creature_linking_template aggro flags,
// bi-directional when both bits are set. The optional map filter keeps only that map's rows.
export function linkedCombatPartnerEntries(
  entry: number,
  mapId?: number,
): Set<number> {
  const out = new Set<number>();
  const e = entry | 0;
  const mapOk = (row: LinkingTemplateRow): boolean =>
    mapId == null || (row[1] | 0) === (mapId | 0);

  // Engaged as master → slaves with AGGRO_ON_AGGRO
  for (const row of byMaster.get(e) ?? []) {
    if (!mapOk(row)) continue;
    if (((row[3] | 0) & LINK_FLAG.AGGRO_ON_AGGRO) === 0) continue;
    out.add(row[0] | 0);
  }
  // Engaged as slave → master with TO_AGGRO_ON_AGGRO + sibling slaves
  for (const row of bySlave.get(e) ?? []) {
    if (!mapOk(row)) continue;
    if (((row[3] | 0) & LINK_FLAG.TO_AGGRO_ON_AGGRO) === 0) continue;
    out.add(row[2] | 0);
    const master = row[2] | 0;
    for (const sib of byMaster.get(master) ?? []) {
      if (!mapOk(sib)) continue;
      if ((sib[0] | 0) === e) continue;
      if (((sib[3] | 0) & LINK_FLAG.AGGRO_ON_AGGRO) === 0) continue;
      out.add(sib[0] | 0);
    }
  }
  out.delete(e);
  return out;
}

/** Template partner with the row's searchRange (0 = whole map). */
export type LinkedEntryPartner = { entry: number; searchRange: number };

// Same membership as linkedCombatPartnerEntries, plus searchRange for the floor IsSlaveInRangeOfMaster
// check. Cite: CreatureLinkingMgr.cpp:647-659.
export function linkedCombatPartnerSpecs(
  entry: number,
  mapId?: number,
): LinkedEntryPartner[] {
  const e = entry | 0;
  const mapOk = (row: LinkingTemplateRow): boolean =>
    mapId == null || (row[1] | 0) === (mapId | 0);
  const byEntry = new Map<number, number>();
  const take = (partner: number, range: number): void => {
    const prev = byEntry.get(partner);
    if (prev == null) {
      byEntry.set(partner, range);
      return;
    }
    if (range > 0 && (prev === 0 || range < prev)) byEntry.set(partner, range);
  };
  for (const row of byMaster.get(e) ?? []) {
    if (!mapOk(row)) continue;
    if (((row[3] | 0) & LINK_FLAG.AGGRO_ON_AGGRO) === 0) continue;
    take(row[0] | 0, row[4] | 0);
  }
  for (const row of bySlave.get(e) ?? []) {
    if (!mapOk(row)) continue;
    if (((row[3] | 0) & LINK_FLAG.TO_AGGRO_ON_AGGRO) === 0) continue;
    take(row[2] | 0, row[4] | 0);
    const master = row[2] | 0;
    for (const sib of byMaster.get(master) ?? []) {
      if (!mapOk(sib)) continue;
      if ((sib[0] | 0) === e) continue;
      if (((sib[3] | 0) & LINK_FLAG.AGGRO_ON_AGGRO) === 0) continue;
      take(sib[0] | 0, sib[4] | 0);
    }
  }
  byEntry.delete(e);
  return [...byEntry].map(([partner, searchRange]) => ({ entry: partner, searchRange }));
}

type GuidLinkFile = { guidLinks: readonly (readonly [number, number, number])[] };

const guidLinks = (aggroGroupsJson as GuidLinkFile).guidLinks ?? [];
/** master guid → slave rows [slave, flag] */
const guidSlaves = new Map<number, [number, number][]>();
/** slave guid → master rows [master, flag] */
const guidMasters = new Map<number, [number, number][]>();
for (const row of guidLinks) {
  const slave = row[0] | 0;
  const master = row[1] | 0;
  const flag = row[2] | 0;
  if (!guidSlaves.has(master)) guidSlaves.set(master, []);
  guidSlaves.get(master)!.push([slave, flag]);
  if (!guidMasters.has(slave)) guidMasters.set(slave, []);
  guidMasters.get(slave)!.push([master, flag]);
}

// Guid-level creature_linking partners for one spawn. Cite: CreatureLinkingMgr.cpp creature_linking;
// FLAG_AGGRO_ON_AGGRO / TO_AGGRO.
export function linkedCombatGuidPartners(guid: number): number[] {
  const g = guid | 0;
  const out = new Set<number>();
  for (const [slave, flag] of guidSlaves.get(g) ?? []) {
    if ((flag & LINK_FLAG.AGGRO_ON_AGGRO) !== 0) out.add(slave);
  }
  for (const [master, flag] of guidMasters.get(g) ?? []) {
    if ((flag & LINK_FLAG.TO_AGGRO_ON_AGGRO) !== 0) out.add(master);
  }
  out.delete(g);
  return [...out];
}

/** What a master's death does to one slave entry. */
export type LinkedDeathFollower = { entry: number; selfkill: boolean };

// Slaves the master's death takes: 6 SELFKILL rows (C'Thun's tentacles) and 14 DESPAWN (boss adds).
// Cite: CreatureLinkingMgr.cpp ProcessTeamCommand LINKING_EVENT_DIE; .h:66-67.
export function linkedDeathFollowers(
  masterEntry: number,
  mapId?: number,
): LinkedDeathFollower[] {
  const out: LinkedDeathFollower[] = [];
  for (const row of byMaster.get(masterEntry | 0) ?? []) {
    if (mapId != null && (row[1] | 0) !== (mapId | 0)) continue;
    const flag = row[3] | 0;
    const selfkill = (flag & LINK_FLAG.SELFKILL_ON_DEATH) !== 0;
    if (!selfkill && (flag & LINK_FLAG.DESPAWN_ON_DEATH) === 0) continue;
    out.push({ entry: row[0] | 0, selfkill });
  }
  return out;
}

// Slaves the master's EVADE removes: C'Thun's six carry it beside SELFKILL, so a reset clears the
// field as a kill does. Cite: CreatureLinkingMgr.cpp ProcessTeamCommand LINKING_EVENT_EVADE; .h:65.
export function linkedEvadeDespawns(masterEntry: number, mapId?: number): number[] {
  const out: number[] = [];
  for (const row of byMaster.get(masterEntry | 0) ?? []) {
    if (mapId != null && (row[1] | 0) !== (mapId | 0)) continue;
    if (((row[3] | 0) & LINK_FLAG.DESPAWN_ON_EVADE) === 0) continue;
    out.push(row[0] | 0);
  }
  return out;
}
