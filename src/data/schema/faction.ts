// ---- Reputation (E1 — Wave C keystone) ------------------------------------

// A player-tracked reputation faction (Faction.dbc, reputationListID >= 0). `base` is the per-race
// table: start standing is the first entry whose masks fit (0 = wildcard), else 0.
export interface FactionDef {
  id: number;                 // Faction.dbc ID (grant target + char.reputations key)
  repListId: number;          // reputationListID (player rep-list index)
  name: string;
  team: number;               // parent/team faction group id (used for team-award spillover)
  base: Array<{ raceMask: number; classMask: number; value: number; flags: number }>;
  /** Faction.dbc Description[enUS] — the blurb the client shows in ReputationDetailFrame
   *  ("One of the last bastions of human power…"). Absent for the ~20 rows that have none. */
  description?: string;
}

// A FactionTemplate.dbc row — the reaction masks deciding friendly/neutral/hostile between two
// units. Reaction is computed by domain/creature/faction.ts, ported from Relations.cpp.
export interface FactionTemplateDef {
  id: number;                 // FactionTemplate.dbc ID (= creature_template.Faction)
  faction: number;            // Faction.dbc id — the identity used by enemy/friend cross-refs
  ourMask: number;            // factionGroupMask — the groups this template belongs to
  friendMask: number;         // friendGroupMask — groups it is friendly toward
  enemyMask: number;          // enemyGroupMask — groups it is hostile toward
  enemyFactions: number[];    // Faction.dbc ids it is explicitly hostile to (enemyFaction[4], nonzero)
  friendFactions: number[];   // Faction.dbc ids it is explicitly friendly to (friendFaction[4], nonzero)
}

/** One of the 8 global reputation rank bands (ReputationMgr PointsInRank, cumulative from -42000). */
export interface ReputationRankDef {
  rank: number;               // 0 Hated … 7 Exalted
  name: string;
  min: number;                // lowest standing that reads as this rank
}

/** Per-faction rep-gain multipliers (reputation_reward_rate). A faction absent here => rate 1.0. */
export interface ReputationRateDef {
  faction: number;
  quest: number;
  creature: number;
  spell: number;
}

/** Reputation spillover: gaining rep with `faction` also grants a fraction to related factions,
 *  each gated by a minimum rank (reputation_spillover_template). Cite: Player.cpp RewardReputation. */
export interface ReputationSpilloverDef {
  faction: number;
  targets: Array<{ faction: number; rate: number; rank: number }>;
}
