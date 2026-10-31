// Alterac's war economy: what a body drops, what a team banks, and what the turn-ins buy.
// Cite: BattleGroundAV.cpp:156-266 HandleQuestComplete (the nine counters and their thresholds);
// `reference_loot_template` 1 (battleground_template.PlayerSkinReflootId — AV is the only BG where
// an enemy player is lootable) and `creature_loot_template` for the field.

import type { BgTeam } from './types.ts';
import type { Rng } from '../../engine/core/rng.ts';
import { AV_DATA } from '../../data/alteracValley.ts';
import type { AvQuestRow } from '../../data/alteracValley.ts';

/** One stack the auto-loot banked. */
export interface AvDrop {
  item: number;
  count: number;
}

/** A loot row as the shipped bake holds it, narrowed to what a roll needs. */
export interface AvLootRow {
  item: number;
  /** ChanceOrQuestChance — negative rows are quest drops and their magnitude is the percent. */
  chance: number;
  min: number;
  max: number;
}

/**
 * The milestones a team's turn-ins reach. Thresholds are BattleGroundAV.cpp's own; what each one
 * SPAWNS is a product decision, because CMaNGOS logs a TODO at every one of them (:190, :196, :202,
 * :214, :222, :231, :240, :249). Only waves the DB names a creature for are spawned — the
 * mine-supply "ground assault" has none, so it pays reputation and announces, and spawns nothing.
 */
export type AvMilestone =
  | 'air-fleet-1' | 'air-fleet-2' | 'air-fleet-3'
  | 'boss-summon'
  | 'ground-assault'
  | 'cavalry';

export interface AvMilestoneEvent {
  milestone: AvMilestone;
  team: BgTeam;
  /** Creature entries the milestone puts on the field, empty when none is sourced. */
  spawns: readonly number[];
}

/** Cite: .cpp:188/:194/:200 — 120 soldier, 60 lieutenant, 30 commander turn-ins. */
export const AV_FLEET_THRESHOLDS = [120, 60, 30] as const;
/** Cite: .cpp:212 — the crystal/blood counter arms the summon at 200. */
export const AV_BOSS_SUMMON_AT = 200;
/** Cite: .cpp:220/:229 — 28 home-mine and 7 enemy-mine turn-ins. */
export const AV_GROUND_ASSAULT_AT = { home: 28, enemy: 7 } as const;
/** Cite: .cpp:238/:247 — 25 harnesses and 25 emptied stables. */
export const AV_CAVALRY_AT = 25;

/**
 * The beast each side leads home for Empty Stables. Cite: quest 7027 "Locate an Alterac Ram …
 * use the Stormpike Training Collar when you are near"; 7001 the same for a Frostwolf. The
 * collar 17689 / muzzle 17626 is the quest's OWN srcItem, so the verb is standing next to the
 * beast, never a drop — which is why the auto-turn-in pass cannot see this one.
 */
export const AV_TAME_BEAST: Readonly<Record<BgTeam, number>> = Object.freeze({
  alliance: 10990, // Alterac Ram
  horde: 10981,    // Frostwolf
});

/**
 * The wave each milestone puts on the field. Every entry is the creature the quest is named for:
 * the three wing commanders' own mounts, the two ram/wolf rider units, and the two summoned lords.
 * Cite: `creature_template` 14946/14947/14948 (Slidore/Ichman/Vipore), 14943/14944/14945
 * (Guse/Jeztor/Mulverick), 13576/13577 and 13440/13441, 13419 Ivus and 13256 Lokholar.
 */
export const AV_WAVES: Readonly<Record<AvMilestone, Readonly<Record<BgTeam, readonly number[]>>>> =
  Object.freeze({
    'air-fleet-1': { alliance: [14946], horde: [14943] },
    'air-fleet-2': { alliance: [14948], horde: [14944] },
    'air-fleet-3': { alliance: [14947], horde: [14945] },
    'boss-summon': { alliance: [13419], horde: [13256] },
    'ground-assault': { alliance: [], horde: [] },
    cavalry: { alliance: [13577, 13576, 13576, 13576], horde: [13441, 13440, 13440, 13440] },
  });

/** Counter slot → the wave it arms. Keyed, not built from the slot, so no cast is needed. */
const FLEET_MILESTONE: Readonly<Record<number, AvMilestone | undefined>> = Object.freeze({
  1: 'air-fleet-1', 2: 'air-fleet-2', 3: 'air-fleet-3',
});

export interface AvQuestLedgerOpts {
  rng: Rng;
  /** Loot rows for one creature entry. Empty when the creature has no table. */
  lootOf(entry: number): readonly AvLootRow[];
  /** reference_loot_template 1 — what an enemy player's corpse carries in AV. */
  playerLoot(): readonly AvLootRow[];
  /** A turn-in landed; the caller steps the match counter (av.ts completeQuest). */
  onTurnIn(questId: number, team: BgTeam): void;
  /** A milestone was reached — the caller puts its wave on the field. */
  onMilestone?(e: AvMilestoneEvent): void;
}

export interface AvQuestLedger {
  /** Auto-loot a dead creature for the team that killed it. Returns what was banked. */
  creditKill(entry: number, killer: BgTeam): AvDrop[];
  /** Auto-loot a dead enemy PLAYER. Cite: battleground_template.PlayerSkinReflootId 1. */
  creditPlayerKill(killer: BgTeam): AvDrop[];
  /** Hand in everything this team can, in quest order. Returns the quest ids completed. */
  turnIn(team: BgTeam): number[];
  /** One beast led back to the stable master: steps Empty Stables, half of the cavalry gate.
   *  Returns the quest id, or null when this team has no stables row. */
  creditTame(team: BgTeam): number | null;
  held(team: BgTeam): ReadonlyMap<number, number>;
  /** Milestones already reached, so a caller can render the war state. */
  milestones(team: BgTeam): readonly AvMilestone[];
}

/** Quests whose turn-in the ledger can complete on its own — the ones with a required item. */
function autoTurnInQuests(team: BgTeam): AvQuestRow[] {
  // 7027 / 7001 "Empty Stables" carry no ReqItem: they are the return half of the ram quest and
  // are handed in by riding a mount home, which this ledger has no way to observe.
  return AV_DATA.quests.filter((q) => q.team === team && q.item && q.count);
}

export function createAvQuestLedger(o: AvQuestLedgerOpts): AvQuestLedger {
  const bank: Record<BgTeam, Map<number, number>> = { alliance: new Map(), horde: new Map() };
  const counters: Record<BgTeam, number[]> = {
    alliance: new Array<number>(9).fill(0),
    horde: new Array<number>(9).fill(0),
  };
  const reached: Record<BgTeam, Set<AvMilestone>> = { alliance: new Set(), horde: new Set() };
  const questsFor = { alliance: autoTurnInQuests('alliance'), horde: autoTurnInQuests('horde') };
  /** Item ids any AV quest asks for — nothing else is worth banking. */
  const wanted = new Set(AV_DATA.quests.map((q) => q.item).filter((i): i is number => !!i));

  function roll(rows: readonly AvLootRow[], team: BgTeam): AvDrop[] {
    const out: AvDrop[] = [];
    for (const r of rows) {
      if (!wanted.has(r.item)) continue;
      // A quest row is stored negative and drops for anyone who can use it; a plain row rolls.
      const pct = Math.abs(r.chance);
      if (pct < 100 && o.rng.next() * 100 >= pct) continue;
      const lo = Math.max(1, r.min | 0);
      const hi = Math.max(lo, r.max | 0);
      const count = lo === hi ? lo : lo + o.rng.int(0, hi - lo);
      out.push({ item: r.item, count });
      bank[team].set(r.item, (bank[team].get(r.item) ?? 0) + count);
    }
    return out;
  }

  function fire(team: BgTeam, m: AvMilestone): void {
    if (reached[team].has(m)) return;
    reached[team].add(m);
    o.onMilestone?.({ milestone: m, team, spawns: AV_WAVES[m][team] });
  }

  /** The counter thresholds, read after a turn-in stepped `slot`. */
  function checkMilestones(team: BgTeam, slot: number): void {
    const c = counters[team];
    const fleet = FLEET_MILESTONE[slot];
    if (fleet && c[slot]! >= AV_FLEET_THRESHOLDS[slot - 1]!) fire(team, fleet);
    if (slot === 4 && c[4]! >= AV_BOSS_SUMMON_AT) fire(team, 'boss-summon');
    if ((slot === 5 || slot === 6)
      && c[5]! >= AV_GROUND_ASSAULT_AT.home && c[6]! >= AV_GROUND_ASSAULT_AT.enemy) {
      fire(team, 'ground-assault');
    }
    if ((slot === 7 || slot === 8) && c[7]! >= AV_CAVALRY_AT && c[8]! >= AV_CAVALRY_AT) {
      fire(team, 'cavalry');
    }
  }

  return {
    creditKill(entry, killer) {
      return roll(o.lootOf(entry), killer);
    },

    creditPlayerKill(killer) {
      return roll(o.playerLoot(), killer);
    },

    turnIn(team) {
      const done: number[] = [];
      const held = bank[team];
      // A pass per quest, repeated while anything still fits: 60 scraps is three turn-ins.
      let moved = true;
      while (moved) {
        moved = false;
        for (const q of questsFor[team]) {
          const have = held.get(q.item!) ?? 0;
          if (have < q.count!) continue;
          held.set(q.item!, have - q.count!);
          counters[team][q.slot] = (counters[team][q.slot] ?? 0) + q.step;
          o.onTurnIn(q.id, team);
          checkMilestones(team, q.slot);
          done.push(q.id);
          moved = true;
        }
      }
      return done;
    },

    creditTame(team) {
      const q = AV_DATA.quests.find((r) => r.team === team && r.counter === 'empty-stables');
      if (!q) return null;
      counters[team][q.slot] = (counters[team][q.slot] ?? 0) + (q.step || 1);
      o.onTurnIn(q.id, team);
      checkMilestones(team, q.slot);
      return q.id;
    },

    held: (team) => bank[team],
    milestones: (team) => [...reached[team]],
  };
}
