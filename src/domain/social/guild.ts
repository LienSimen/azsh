// Guilds — the pure rules shared by the client and the authoritative server: the rank ladder, what
// each rank may do, and whether a name and an action are legal. Charter signatures are not modelled.

/** Guild.h:36-40. Lower is higher authority; 0 is the guild master. */
export const GUILD_RANK = {
  GUILDMASTER: 0,
  OFFICER: 1,
  VETERAN: 2,
  MEMBER: 3,
  INITIATE: 4,
} as const;

/** Guild.h:47-62. Every right carries GR_RIGHT_EMPTY (0x40), which is why HasRankRight
 *  masks against it rather than against zero. */
export const GR_RIGHT = {
  EMPTY: 0x00000040,
  GCHATLISTEN: 0x00000041,
  GCHATSPEAK: 0x00000042,
  OFFCHATLISTEN: 0x00000044,
  OFFCHATSPEAK: 0x00000048,
  PROMOTE: 0x000000C0,
  DEMOTE: 0x00000140,
  INVITE: 0x00000050,
  REMOVE: 0x00000060,
  SETMOTD: 0x00001040,
  EPNOTE: 0x00002040,
  MODIFY_GUILD_INFO: 0x00010040,
  ALL: 0x000FF1FF,
} as const;

export interface GuildRankDef {
  id: number;
  name: string;
  rights: number;
}

// Guild.cpp:156-165 CreateDefaultGuildRanks. The two top ranks get GR_RIGHT_ALL; the three below them get
// guild chat only. Fixed here: custom ranks are not modelled (see the header).
export const GUILD_RANKS: readonly GuildRankDef[] = [
  { id: GUILD_RANK.GUILDMASTER, name: 'Guild Master', rights: GR_RIGHT.ALL },
  { id: GUILD_RANK.OFFICER, name: 'Officer', rights: GR_RIGHT.ALL },
  { id: GUILD_RANK.VETERAN, name: 'Veteran', rights: GR_RIGHT.GCHATLISTEN | GR_RIGHT.GCHATSPEAK },
  { id: GUILD_RANK.MEMBER, name: 'Member', rights: GR_RIGHT.GCHATLISTEN | GR_RIGHT.GCHATSPEAK },
  { id: GUILD_RANK.INITIATE, name: 'Initiate', rights: GR_RIGHT.GCHATLISTEN | GR_RIGHT.GCHATSPEAK },
];

/** The lowest rank id, i.e. the one a new member joins at. */
export const LOWEST_GUILD_RANK = GUILD_RANKS[GUILD_RANKS.length - 1].id;

/** ObjectMgr.h:387 / World.cpp:536. */
export const GUILD_NAME_MAX = 24;
export const GUILD_NAME_MIN = 2;
/** PetitionsHandler.cpp:41 GUILD_CHARTER_COST — 10 silver, in copper. */
export const GUILD_CHARTER_COST = 1000;
/** The client's own MOTD / guild-info edit boxes. 1.12 caps neither server-side. */
export const GUILD_MOTD_MAX = 128;
export const GUILD_INFO_MAX = 500;

export const rankDef = (rank: number): GuildRankDef | undefined =>
  GUILD_RANKS.find((r) => r.id === rank);

export const rankName = (rank: number): string => rankDef(rank)?.name ?? 'Member';

/** Guild.cpp:270 HasRankRight. */
export function hasRight(rank: number, right: number): boolean {
  const def = rankDef(rank);
  if (!def) return false;
  return (def.rights & right) !== GR_RIGHT.EMPTY;
}

// ObjectMgr.cpp:8152 IsValidCharterName, minus its locale-specific `isValidString` mask: a length window
// and one line of letters. Returns null when the name is fine.
export function guildNameProblem(raw: string): string | null {
  const name = raw.trim();
  if (name.length < GUILD_NAME_MIN) return `A guild name is at least ${GUILD_NAME_MIN} characters`;
  if (name.length > GUILD_NAME_MAX) return `A guild name is at most ${GUILD_NAME_MAX} characters`;
  if (!/^[\p{L}][\p{L} '-]*$/u.test(name)) return 'A guild name is letters, spaces, apostrophes and hyphens';
  if (/\s\s/.test(name)) return 'A guild name has no double spaces';
  return null;
}

/** One member as every rule below sees them. */
export interface GuildActor {
  name: string;
  rank: number;
}

export type GuildVerdict = { ok: true } | { ok: false; reason: string };

const OK: GuildVerdict = { ok: true };
const no = (reason: string): GuildVerdict => ({ ok: false, reason });
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** GuildHandler.cpp:116 — invite is a rank right, not a leader-only action. */
export function canInvite(actor: GuildActor): GuildVerdict {
  return hasRight(actor.rank, GR_RIGHT.INVITE) ? OK : no('Your rank cannot invite');
}

/** GuildHandler.cpp:153-177. The GM is never kickable, and neither is a peer or a superior. */
export function canRemove(actor: GuildActor, target: GuildActor): GuildVerdict {
  if (!hasRight(actor.rank, GR_RIGHT.REMOVE)) return no('Your rank cannot remove members');
  if (same(actor.name, target.name)) return no('Leave the guild instead');
  if (target.rank === GUILD_RANK.GUILDMASTER) return no('The guild master cannot be removed');
  if (actor.rank >= target.rank) return no(`${target.name} outranks you`);
  return OK;
}

/** GuildHandler.cpp:285-311. A promotion may not reach the promoter's own rank. */
export function canPromote(actor: GuildActor, target: GuildActor): GuildVerdict {
  if (!hasRight(actor.rank, GR_RIGHT.PROMOTE)) return no('Your rank cannot promote');
  if (same(actor.name, target.name)) return no('You cannot promote yourself');
  if (actor.rank >= target.rank) return no(`${target.name} outranks you`);
  if (target.rank - 1 <= actor.rank) return no(`Only the guild master can promote to ${rankName(actor.rank)}`);
  return OK;
}

/** GuildHandler.cpp:340-371. The bottom rank cannot be demoted further. */
export function canDemote(actor: GuildActor, target: GuildActor): GuildVerdict {
  if (!hasRight(actor.rank, GR_RIGHT.DEMOTE)) return no('Your rank cannot demote');
  if (same(actor.name, target.name)) return no('You cannot demote yourself');
  if (actor.rank >= target.rank) return no(`${target.name} outranks you`);
  if (target.rank >= LOWEST_GUILD_RANK) return no(`${target.name} is already the lowest rank`);
  return OK;
}

/** GuildHandler.cpp:505-512. */
export function canSetMotd(actor: GuildActor): GuildVerdict {
  return hasRight(actor.rank, GR_RIGHT.SETMOTD) ? OK : no('Your rank cannot set the message of the day');
}

// GuildHandler.cpp:394-405: the guild master may leave only a guild of one, and that leave IS the disband.
// Anyone else just leaves.
export function canLeave(actor: GuildActor, memberCount: number): GuildVerdict {
  if (actor.rank === GUILD_RANK.GUILDMASTER && memberCount > 1) {
    return no('Pass the guild on or disband it before you leave');
  }
  return OK;
}

/** Who HEARS a guild-chat line: officer chat needs the officer listen right. */
export function hearsChannel(rank: number, channel: 'guild' | 'officer'): boolean {
  return hasRight(rank, channel === 'officer' ? GR_RIGHT.OFFCHATLISTEN : GR_RIGHT.GCHATLISTEN);
}

/** Who may SPEAK on one. A rank that cannot listen cannot speak either. */
export function speaksChannel(rank: number, channel: 'guild' | 'officer'): boolean {
  return hasRight(rank, channel === 'officer' ? GR_RIGHT.OFFCHATSPEAK : GR_RIGHT.GCHATSPEAK);
}
