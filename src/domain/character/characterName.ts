// Character name normalization for create-hero and uniqueness checks. Pure. Matches classic
// presentation — first letter capital, rest lower — so case variants collide as one name.

/** Max length of a hero name (create screen input + protocol LIMITS.name). */
export const CHARACTER_NAME_MAX = 20;

/** Default when the player leaves the name field blank. */
export const CHARACTER_NAME_FALLBACK = 'Adventurer';

// Canonicalize a free-typed character name: trim, cap length, first letter upper, rest lower. Empty /
// whitespace-only input becomes the fallback.
export function normalizeCharacterName(
  raw: string,
  fallback: string = CHARACTER_NAME_FALLBACK,
  maxLen: number = CHARACTER_NAME_MAX,
): string {
  const trimmed = raw.trim().slice(0, maxLen);
  if (!trimmed) return fallback;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/** Case-insensitive name equality (after trim). Used for "name taken" checks. */
export function characterNamesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Names the SERVER itself acts under, so no character may claim one. Not cosmetic: AH cancel
// authorizes on seller === me, and the mailbox routes by sender name. Mirrors IsReservedName.
export const SYSTEM_NAMES = {
  /** The AH bot's seller name (server/auctionHouse.ts AH_BOT_SELLER). */
  auctionBot: 'Auctioneer-Bot',
  /** Sender on every auction-house system mail (server/auctionHouse.ts AH_SENDER). */
  auctionHouse: 'Auction House',
  /** Sender the single-player mailbox uses for system mail. */
  mailbox: 'Mailbox',
} as const;

export const RESERVED_CHARACTER_NAMES: readonly string[] = Object.values(SYSTEM_NAMES);

/** True when a name belongs to the server itself. Case- and whitespace-insensitive. */
export function isReservedCharacterName(name: string): boolean {
  return RESERVED_CHARACTER_NAMES.some((r) => characterNamesEqual(r, name));
}
