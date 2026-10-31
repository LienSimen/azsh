// Faction reaction between the player and any creature, ported from CMaNGOS Relations.cpp. The
// player's template is derived from their race, so it needs no save migration. Pure domain.

import type { DataStore } from '../../data/dataStore.ts';
import type { FactionTemplateDef } from '../../data/schema.ts';
import { REP_RANK, type ReputationRank } from './reputation.ts';
import { isSyntheticClassTrainerEntry } from '../economy/syntheticClassTrainers.ts';
import { unitImmuneToPlayer } from './unitFlags.ts';

/** FactionGroupMask — the Alliance/Horde/Player/Monster bits on a template's group masks.
 *  Cite: DBCEnums.h FactionGroupMask. */
export const FACTION_GROUP_MASK = {
  PLAYER: 1,
  ALLIANCE: 2,
  HORDE: 4,
  MONSTER: 8,
} as const;

/** Cite: Unit.h:509-525 NPCFlags. Gossip/vendor/trainer never participate in CanAttack. */
export const UNIT_NPC_FLAG = {
  NONE: 0x00000000,
  GOSSIP: 0x00000001,
  QUESTGIVER: 0x00000002,
  VENDOR: 0x00000004,
  FLIGHTMASTER: 0x00000008,
  TRAINER: 0x00000010,
  SPIRITHEALER: 0x00000020,
  SPIRITGUIDE: 0x00000040,
  INNKEEPER: 0x00000080,
  BANKER: 0x00000100,
  PETITIONER: 0x00000200,
  TABARDDESIGNER: 0x00000400,
  BATTLEMASTER: 0x00000800,
  AUCTIONEER: 0x00001000,
  STABLEMASTER: 0x00002000,
  REPAIR: 0x00004000,
  OUTDOORPVP: 0x20000000,
} as const;

export function npcFlagBits(npcFlags: number): {
  gossip: boolean;
  vendor: boolean;
  trainer: boolean;
  questgiver: boolean;
} {
  const f = npcFlags | 0;
  return {
    gossip: (f & UNIT_NPC_FLAG.GOSSIP) !== 0,
    vendor: (f & UNIT_NPC_FLAG.VENDOR) !== 0,
    trainer: (f & UNIT_NPC_FLAG.TRAINER) !== 0,
    questgiver: (f & UNIT_NPC_FLAG.QUESTGIVER) !== 0,
  };
}

// Template-vs-template reaction, a direct port of GetFactionReaction: asymmetric, enemy before
// friend, with `a` the acting unit. Evaluation order is load-bearing.
export function getFactionReaction(a: FactionTemplateDef, b: FactionTemplateDef): ReputationRank {
  // 1. other is in a group we treat as an enemy
  if (b.ourMask & a.enemyMask) return REP_RANK.HOSTILE;
  // 2. other's identity is on our explicit enemy list
  if (b.faction && a.enemyFactions.includes(b.faction)) return REP_RANK.HOSTILE;
  // 3. other is in a group we treat as a friend
  if (b.ourMask & a.friendMask) return REP_RANK.FRIENDLY;
  // 4. other's identity is on our explicit friend list
  if (b.faction && a.friendFactions.includes(b.faction)) return REP_RANK.FRIENDLY;
  // 5. we are in a group the other treats as a friend
  if (a.ourMask & b.friendMask) return REP_RANK.FRIENDLY;
  // 6. our identity is on the other's explicit friend list
  if (a.faction && b.friendFactions.includes(a.faction)) return REP_RANK.FRIENDLY;
  return REP_RANK.NEUTRAL;
}

/** The player's FactionTemplate id, derived from their race (ChrRaces.FactionID). */
export function playerFactionTemplateId(ds: DataStore, race: number): number | undefined {
  return ds.race(race)?.factionTemplate;
}

/** The player's faction template row (undefined when the race/bundle predates the faction bake). */
function playerTemplate(ds: DataStore, race: number): FactionTemplateDef | undefined {
  const id = playerFactionTemplateId(ds, race);
  return id != null ? ds.factionTemplate(id) : undefined;
}

// SPELL_AURA_FORCE_REACTION (139) map: Faction.dbc id → forced rank. Not a faction swap and not
// keyed by template id, since GetForcedRankIfAny reads ->faction. Cite: ReputationMgr.cpp:123.
export type ForcedReactions = ReadonlyMap<number, ReputationRank>;

// The forced rank for a creature template when the player carries a matching force_reaction aura.
// Both directions short-circuit on this before any faction math. Cite: Relations.cpp:171, :237.
function forcedRankFor(
  ds: DataStore,
  creatureFactionTemplate: number | undefined,
  forced: ForcedReactions | undefined,
): ReputationRank | undefined {
  if (!forced?.size || creatureFactionTemplate == null) return undefined;
  const t = ds.factionTemplate(creatureFactionTemplate);
  return t ? forced.get(t.faction | 0) : undefined;
}

// How a creature (by its faction-template id) reacts to a player of the given race. Undefined when either
// template is missing — callers should fail open (treat unknown as interactable).
export function creatureReactionToPlayer(
  ds: DataStore,
  race: number,
  creatureFactionTemplate: number,
  forced?: ForcedReactions,
): ReputationRank | undefined {
  const forcedRank = forcedRankFor(ds, creatureFactionTemplate, forced);
  if (forcedRank != null) return forcedRank;
  const player = playerTemplate(ds, race);
  const creature = ds.factionTemplate(creatureFactionTemplate);
  if (!player || !creature) return undefined;
  return getFactionReaction(creature, player);
}

// The Faction.dbc identity behind a creature's faction template — the id the reputation pane tracks, so a
// war declared there can be matched against the NPC in front of you.
export function creatureRepFactionId(ds: DataStore, creatureEntry: number): number | undefined {
  const ft = ds.creature(creatureEntry)?.factionId;
  if (ft == null) return undefined;
  const faction = ds.factionTemplate(ft)?.faction;
  return faction || undefined;
}

/** True when the player has declared war on the faction this creature belongs to. */
export function isAtWarWithCreature(
  ds: DataStore,
  creatureEntry: number,
  atWar: ReadonlySet<number> | undefined,
): boolean {
  if (!atWar || atWar.size === 0) return false;
  const faction = creatureRepFactionId(ds, creatureEntry);
  return faction != null && atWar.has(faction);
}

// Whether a player of `race` may interact with an NPC of this faction template: the reaction must
// beat Unfriendly BOTH ways. Service NPCs fail CLOSED on missing data, others fail open (KI-433).
export function canInteractWithFactionTemplate(
  ds: DataStore,
  race: number,
  creatureFactionTemplate: number | undefined,
  requireFaction = false,
  forced?: ForcedReactions,
): boolean {
  if (creatureFactionTemplate == null) return !requireFaction;
  // A forced rank replaces BOTH directions — Relations.cpp returns it before the template math.
  const forcedRank = forcedRankFor(ds, creatureFactionTemplate, forced);
  if (forcedRank != null) return forcedRank > REP_RANK.UNFRIENDLY;
  const player = playerTemplate(ds, race);
  const creature = ds.factionTemplate(creatureFactionTemplate);
  if (!player || !creature) return !requireFaction;
  return (
    getFactionReaction(player, creature) > REP_RANK.UNFRIENDLY &&
    getFactionReaction(creature, player) > REP_RANK.UNFRIENDLY
  );
}

// Synthetic class trainers are not creature_template rows (entry = 1000*1000+cls; legacy 1000+cls).
// Interaction must not inherit a colliding mob's faction. Cite: syntheticClassTrainers.ts; KI-918.
function isSyntheticClassTrainer(ds: DataStore, entry: number): boolean {
  return isSyntheticClassTrainerEntry(entry) && ds.trainer(entry) != null;
}

/** Vendors / class trainers / profession trainers — service interaction needs a known faction. */
function isServiceNpc(ds: DataStore, entry: number): boolean {
  return ds.vendor(entry) != null || ds.trainer(entry) != null || ds.profTrainer(entry) != null;
}

// Gate by a concrete NPC entry, resolving its factionId. Synthetic class trainers always pass;
// service NPCs fail closed on a missing faction so enemy stock cannot be bought (KI-433).
export function canInteractWithCreature(
  ds: DataStore,
  race: number,
  creatureEntry: number,
  atWar?: ReadonlySet<number>,
  forced?: ForcedReactions,
): boolean {
  if (isSyntheticClassTrainer(ds, creatureEntry)) return true;
  // A war you declared in the reputation pane closes every door that faction owns.
  if (isAtWarWithCreature(ds, creatureEntry, atWar)) return false;
  const requireFaction = isServiceNpc(ds, creatureEntry);
  return canInteractWithFactionTemplate(
    ds,
    race,
    ds.creature(creatureEntry)?.factionId,
    requireFaction,
    forced,
  );
}

// A template at war with nobody: no enemy group bit and no explicit enemy faction, so
// GetFactionReaction can never return hostile for it against anything. Faction template 35
// "Friendly" is the shape, and it is what every credit marker and herald on a battleground map
// carries. Cite: Relations.cpp:351-368 — hostility only ever comes from enemyMask/enemyFactions.
export function factionHasNoEnemies(ft: FactionTemplateDef): boolean {
  return (ft.enemyMask | 0) === 0 && ft.enemyFactions.length === 0;
}

// True when a creature is actively hostile to the player — the case that blocks interaction and
// marks the NPC as an enemy. Fails closed, so it never invents aggression the data lacks.
export function isHostileCreature(
  ds: DataStore,
  race: number,
  creatureEntry: number,
  forced?: ForcedReactions,
): boolean {
  const ft = ds.creature(creatureEntry)?.factionId;
  const reaction = ft != null ? creatureReactionToPlayer(ds, race, ft, forced) : undefined;
  return reaction != null && reaction < REP_RANK.UNFRIENDLY;
}

// True when the reaction is Friendly or better — floor bodies that must never be attacked. Fails
// closed so unknowns stay attackable via canAttack. Cite: Relations.cpp IsFriendlyTo.
export function isFriendlyCreature(
  ds: DataStore,
  race: number,
  creatureEntry: number,
  forced?: ForcedReactions,
): boolean {
  const ft = ds.creature(creatureEntry)?.factionId;
  if (ft == null) return false;
  const reaction = creatureReactionToPlayer(ds, race, ft, forced);
  return reaction != null && reaction >= REP_RANK.FRIENDLY;
}

// Whether the player may start combat with this creature. Friendly+ cannot be attacked; Neutral
// and worse can. Fails OPEN on missing faction data so legacy templates stay grindable.
export function canAttackCreature(
  ds: DataStore,
  race: number,
  creatureEntry: number,
  atWar?: ReadonlySet<number>,
  forced?: ForcedReactions,
): boolean {
  // At war = fair game, even for a faction that would otherwise be friendly (the Bloodsail /
  // Steamwheedle bargain). Cite: Unit::CanAttack — at-war state overrides the friendly reaction.
  if (isAtWarWithCreature(ds, creatureEntry, atWar)) return true;
  const ft = ds.creature(creatureEntry)?.factionId;
  if (ft == null) return true;
  const reaction = creatureReactionToPlayer(ds, race, ft, forced);
  if (reaction == null) return true;
  return reaction < REP_RANK.FRIENDLY;
}

// Peaceful gossip/vendor/trainer click. npcFlags ≠ 0 and CanInteract (reaction > UNFRIENDLY both ways).
// Independent of CanAttack. Cite: Relations.cpp:586-608 Unit::CanInteract.
export function canTalkToCreature(
  ds: DataStore,
  race: number,
  creatureEntry: number,
  npcFlags: number,
  atWar?: ReadonlySet<number>,
  forced?: ForcedReactions,
): boolean {
  if ((npcFlags | 0) === 0) return false;
  return canInteractWithCreature(ds, race, creatureEntry, atWar, forced);
}

export type NpcClickContract = {
  talk: boolean;
  attack: boolean;
  both: boolean;
  hostile: boolean;
};

// Click contract: gossip flags and attackability are independent. Talk = npcFlags + CanInteract. Attack =
// CanAttack (flags never exclude). Cite: Relations.cpp:414 CanAttack !IsFriend; :608 CanInteract.
export function npcClickContract(
  ds: DataStore,
  race: number,
  creatureEntry: number,
  npcFlags: number,
  atWar?: ReadonlySet<number>,
  forced?: ForcedReactions,
): NpcClickContract {
  const talk = canTalkToCreature(ds, race, creatureEntry, npcFlags, atWar, forced);
  // A neutral vendor with UNIT_FLAG_IMMUNE_TO_PLAYER (Lokhtos 12944) offers no Attack; a body an
  // event already turned hostile is engaged by the aggro path, never by this click. Cite: Relations.cpp:373-374.
  const attack = canAttackCreature(ds, race, creatureEntry, atWar, forced)
    && !unitImmuneToPlayer(ds.creature(creatureEntry));
  return {
    talk,
    attack,
    both: talk && attack,
    hostile: isHostileCreature(ds, race, creatureEntry, forced),
  };
}
