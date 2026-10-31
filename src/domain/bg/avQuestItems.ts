/**
 * Alterac Valley quest items that belong to ONE faction, so the other side never loots them.
 *
 * ClassicDB z2815 is asymmetric here and our bake is faithful to it:
 *
 *   item 17306 "Blood"          (Horde, A Gallon of Blood / Lokholar)  126 rows, ALL -100 -> quest drop
 *   item 17423 "Storm Crystal"  (Alliance, Crystal Cluster / Ivus)     129 rows, ALL  +80 -> PLAIN loot
 *   item 17422 "Armor Scraps" / "Enemy Booty" (BOTH sides)             183 rows,      +80
 *
 * A positive ChanceOrQuestChance is not a quest drop, so `allowsQuestDrop` never runs on the
 * Alliance rows and a Horde player loots Storm Crystals at 80% — which is what the operator saw.
 * The Horde equivalent is gated correctly, so this cannot be fixed by treating the whole table
 * one way: the lock has to come from WHOSE QUEST the item belongs to.
 *
 * That is exactly what `AV_DATA.quests` carries — every AV turn-in with its `team` and its `item`.
 * An item used by both sides (17422 scraps/booty, and the two mine supply runs, which each side
 * turns in at its own mine) stays open to everyone. An item used by ONE side is locked to it.
 *
 * Cite: BattleGroundAV.cpp:161-256 m_teamQuestStatus, baked to AV_DATA.quests.
 */

import { AV_QUESTS, type AvTeam } from '../../data/alteracValley.ts';

/** item id -> the only team that may loot it. Absent = both sides may. */
let lockedByItem: Map<number, AvTeam> | null = null;

function build(): Map<number, AvTeam> {
  const teamsOf = new Map<number, Set<AvTeam>>();
  for (const q of AV_QUESTS) {
    if (!q.item) continue;
    let set = teamsOf.get(q.item);
    if (!set) { set = new Set(); teamsOf.set(q.item, set); }
    set.add(q.team);
  }
  const out = new Map<number, AvTeam>();
  for (const [item, teams] of teamsOf) {
    if (teams.size === 1) out.set(item, [...teams][0]!);
  }
  return out;
}

/** The team an AV quest item is locked to, or null when both sides use it (or it is not one). */
export function avQuestItemTeam(itemId: number): AvTeam | null {
  lockedByItem ??= build();
  return lockedByItem.get(itemId) ?? null;
}

/**
 * May `team` loot this item? True for everything that is not a one-faction AV quest item, so a
 * caller can ask about every drop without knowing whether Alterac is involved.
 */
export function avAllowsLoot(itemId: number, team: AvTeam): boolean {
  const locked = avQuestItemTeam(itemId);
  return locked == null || locked === team;
}
