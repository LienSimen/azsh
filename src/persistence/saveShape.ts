// Versioned save shape + a defensive migrate(), so growing the schema never
// bricks an existing save (mirrors CarScene's Object.assign(fresh(), parsed)).

import type { GameState } from '../engine/game.ts';
import type { EquippedMap } from '../domain/character/character.ts';
import { removeItem } from '../domain/items/inventory.ts';
import { emptyAuctionHouse } from '../domain/economy/auction.ts';
import { migrateMailbox } from '../domain/economy/mail.ts';
import { normalizeBars } from '../domain/character/actionbar.ts';
import { normalizeGlobalBar } from '../domain/raid/globalActionBar.ts';
import { normalizeMacros } from '../domain/macro/normalize.ts';
import { normalizeProfiles } from '../domain/rotation/rotationProfiles.ts';
import { normalizePaladinAssignments } from '../domain/rotation/paladinBuffs.ts';
import { normalizeTalentBuilds } from '../domain/character/talentBuilds.ts';
import { normalizePrimaryPages, type PrimaryBarPages } from '../domain/character/stanceBar.ts';
import { normalizeAppearance, bodySlug, type Appearance } from '../domain/character/appearance.ts';
import { BATTLEGROUNDS } from '../domain/run/battlegroundRun.ts';
import packIdMigrationJson from '../../docs/dungeons/survey/pack-id-migration.json' with { type: 'json' };

// v32 full style unlock: 10 bodies had NO bald base, so hairStyle was LOCKED to index 0 (= their
// default hair/horn shape baked into the base). The new model puts None (bald/hornless) at index 0
// and the real styles at 1..K over a bald base — so a pre-v32 save's forced 0 must shift to the
// default style (index 1) to preserve the character's CURRENT look (nobody returns unexpectedly
// bald/hornless). Every other body's indices are already stable. Gated on incoming version so a
// v32+ player who deliberately picks None (0) keeps it. The set = bodies gen used to mark locked.
const V32_PREV_LOCKED = new Set([
  'nightelf-male', 'tauren-male',
  'human-female', 'orc-female', 'dwarf-female', 'nightelf-female',
  'undead-female', 'tauren-female', 'gnome-female', 'troll-female',
]);
function appearanceForLoad(
  raw: unknown, name: string, race: number, gender: 0 | 1, incomingVersion: number,
): Appearance {
  // v43 added a synthetic None at facialHair index 0 and shifted every stored index up one. v44
  // took it back out — the client list decides whether a body can be beardless, and dwarf/human/
  // troll-male/undead-male have no such choice — so a save written by v43 shifts back down. Saves
  // at <=42 were never shifted on disk. Read before normalize, or clampAppearance has already
  // pinned the index to the current range.
  const fh = (raw as { facialHair?: unknown } | null)?.facialHair;
  const shifted = incomingVersion === 43 && typeof fh === 'number' && fh > 0
    ? { ...(raw as object), facialHair: fh - 1 }
    : raw;
  const look = normalizeAppearance(shifted, name, race, gender);
  if (incomingVersion < 32 && look.hairStyle === 0) {
    const slug = bodySlug(race, gender);
    if (slug && V32_PREV_LOCKED.has(slug)) return { ...look, hairStyle: 1 };
  }
  return look;
}
import { CLASSIC_MAX_PLAYER_LEVEL } from '../progression/xpGain.ts';
import { normalizeAutoConsumables } from '../domain/bots/autoConsumables.ts';
import { newHonorState, rankForRp, type HonorState } from '../domain/run/honor.ts';
import { newHonorWeekLedger, type HonorWeekLedger } from '../domain/run/honorWeek.ts';

// Save versions v2–v44 are all ADDITIVE and OPTIONAL: a new field is absent in older saves and
// reads as the default documented on its own type, so load needs no field transform. That is why
// the whole persistence layer has exactly one version gate — `incoming === 43` below. The prior
// 118-line per-version log restated field optionality that the types already carry; git blame has it.
//
// The transforms that are NOT just "absent = default":
//   v26  mid-run instance state on retired Jasperlode / 95xxxx Deadmines ids is cleared (migrate).
//   v36  legacy `${map}-${index}` trash pack ids remapped via docs/dungeons/survey/pack-id-migration.json.
//   v40  keys move out of bags into state.keyring (migrateKeysToKeyring). Cite: Player.h KEYRING_SLOT_*.
//   v43/44 facialHair index 0: v43 made it a synthetic None and shifted real choices up one; v44
//        reverts that — the client list owns whether a body can be beardless (no beardless dwarf, no
//        tuskless troll) and index 0 is a real None only where the bake renders nothing.
//        Cite: gen-appearance-options.mjs; docs/done/PAPERDOLL-REBAKE.md.
//   v44+ `macros` (the MacroFrame's character tab) is additive and optional: absent reads as an
//        empty list. Account-wide macros are deliberately NOT in the save — they are shared by
//        every character, like the global junk filter (CreateGameOptions.accountMacros).
//   v30  a pre-v30 save back-fills the deterministic-by-name look (deterministicAppearance) rather
//        than a blank one, and stored indices clamp to the body's legal Choices.
// Cites with no other home: char.drunkValue Player.cpp SetDrunkValue / SPELL_EFFECT_INEBRIATE / KI-734;
// char.honor domain/run/honor.ts + Formulas.h.
/**
 * A restorable BG run: it names an OBJECTIVE battleground and carries the team fields the mount
 * reads. An arena bracket is not one - every bracket is a combat-surface session now.
 */
function isObjectiveBattlegroundRun(raw: unknown): raw is NonNullable<GameState['battleground']> {
  if (!raw || typeof raw !== 'object') return false;
  const { bgId, team, teamSize } = raw as { bgId?: unknown; team?: unknown; teamSize?: unknown };
  return Object.values(BATTLEGROUNDS).some((b) => b.id === bgId && b.mode === 'objective')
    && (team === 'alliance' || team === 'horde')
    && typeof teamSize === 'number' && Number.isFinite(teamSize);
}

export const SAVE_VERSION = 44 as const;

export interface Save {
  version: number;
  slot: string;
  createdAt: number;
  updatedAt: number;
  /** The updatedAt of the copy this snapshot was built from. Wire-only: the server
   *  refuses the write when the stored row has moved (mail take, trade, another window). */
  baseUpdatedAt?: number;
  state: GameState;
}

export interface SaveMeta {
  slot: string;
  name: string;
  level: number;
  cls: number;
  updatedAt: number;
}

/** Build a save envelope around a game state (timestamps injected by the caller). */
export function toSave(slot: string, state: GameState, now: number, createdAt?: number): Save {
  return { version: SAVE_VERSION, slot, createdAt: createdAt ?? now, updatedAt: now, state };
}

/** Non-negative int field, or base default. */
function honorUInt(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : fallback;
}

// Arena Elo, keyed by bracket size. Only the four rated brackets survive, and only as finite
// numbers - a rating has no floor (arenaRating.ts) so a negative one is legal and is kept.
function normalizeArenaRating(raw: unknown): { arenaRating: Partial<Record<number, number>> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Partial<Record<number, number>> = {};
  for (const b of [1, 2, 3, 5]) {
    const v = (raw as Record<string, unknown>)[String(b)];
    if (typeof v === 'number' && Number.isFinite(v)) out[b] = Math.round(v);
  }
  return Object.keys(out).length ? { arenaRating: out } : null;
}

// The weekly standing ledger. Rows are keyed by character name, so keys are arbitrary strings; only
// well-formed { cp, hk } pairs survive. Cite: domain/run/honorWeek.ts.
function normalizeHonorWeek(raw: unknown): HonorWeekLedger {
  if (!raw || typeof raw !== 'object') return newHonorWeekLedger();
  const r = raw as Record<string, unknown>;
  const weekStart = typeof r.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.weekStart)
    ? r.weekStart
    : '';
  const rows: HonorWeekLedger['rows'] = {};
  if (r.rows && typeof r.rows === 'object') {
    for (const [key, v] of Object.entries(r.rows as Record<string, unknown>)) {
      if (!key || !v || typeof v !== 'object') continue;
      const row = v as Record<string, unknown>;
      const cp = honorUInt(row.cp, 0);
      const hk = honorUInt(row.hk, 0);
      if (cp > 0 || hk > 0) rows[key] = { cp, hk };
    }
  }
  return { weekStart, rows };
}

/** v41 honor ledger. Missing / corrupt → empty standing (same as newHonorState).
 *  Period fields (today/yesterday/…) are additive; pre-period saves default to 0. */
function normalizeHonorState(raw: unknown): HonorState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const base = newHonorState();
  // Signed and FRACTIONAL: `m_rank_points` is a float (Player.h:2344), and the weekly pass is
  // the thing that produces a fraction — CalculateRpEarning interpolates. Truncating here cost a
  // little rank progress on every save/load. Cite: Player.h:1783 SetRankPoints(float).
  const rp = typeof r.rp === 'number' && Number.isFinite(r.rp) ? r.rp : base.rp;
  const fromRp = rankForRp(rp)?.rank ?? 0;
  const storedHighest = honorUInt(r.highestRank, base.highestRank);
  return {
    cp: honorUInt(r.cp, base.cp),
    // Additive (v44): a pre-currency save opens with an empty purse and no lifetime total, which
    // is exactly what "never earned an Honor Point" means. No SAVE_VERSION bump.
    honorPoints: honorUInt(r.honorPoints, base.honorPoints),
    lifetimeHonorPoints: honorUInt(r.lifetimeHonorPoints, base.lifetimeHonorPoints),
    rp,
    lifetimeKills: honorUInt(r.lifetimeKills, base.lifetimeKills),
    dishonorableKills: honorUInt(r.dishonorableKills, base.dishonorableKills),
    killsDate: typeof r.killsDate === 'string' ? r.killsDate : base.killsDate,
    killsToday: r.killsToday && typeof r.killsToday === 'object'
      ? Object.fromEntries(
        Object.entries(r.killsToday as Record<string, unknown>)
          .filter(([, n]) => typeof n === 'number' && n > 0)
          .map(([k, n]) => [k, Math.trunc(n as number)]),
      )
      : base.killsToday,
    todayHk: honorUInt(r.todayHk, base.todayHk),
    todayDk: honorUInt(r.todayDk, base.todayDk),
    todayHonor: honorUInt(r.todayHonor, base.todayHonor),
    yesterdayHk: honorUInt(r.yesterdayHk, base.yesterdayHk),
    yesterdayHonor: honorUInt(r.yesterdayHonor, base.yesterdayHonor),
    thisWeekHk: honorUInt(r.thisWeekHk, base.thisWeekHk),
    lastWeekHk: honorUInt(r.lastWeekHk, base.lastWeekHk),
    lastWeekHonor: honorUInt(r.lastWeekHonor, base.lastWeekHonor),
    lastWeekStanding: honorUInt(r.lastWeekStanding, base.lastWeekStanding),
    // Pre-period saves lack highestRank — seed from current standing when higher.
    highestRank: Math.max(storedHighest, fromRp),
  };
}

// Legacy index-order packId → content-addressed packId (dmapfid W2 / D3 / O9). Source:
// docs/dungeons/survey/pack-id-migration.json (written by cluster-dungeon-packs.mjs).
const PACK_ID_MIGRATION: Map<string, string> = new Map(
  Object.entries((packIdMigrationJson as { map?: Record<string, string> }).map ?? {}),
);
function packIdMigrationMap(): Map<string, string> {
  return PACK_ID_MIGRATION;
}

// Remap one encounter id: exact packId hit, or `${prefix}-${legacyPackId}` when InstanceDefs used idPrefix.
// Unmapped / boss ids pass through.
export function remapPackEncounterId(id: string): string {
  const map = packIdMigrationMap();
  if (map.size === 0) return id;
  const direct = map.get(id);
  if (direct) return direct;
  // prefix-legacyId form (rare): "foo-36-0" → "foo-36-abcd..."
  for (const [legacy, next] of map) {
    const needle = `-${legacy}`;
    if (id.endsWith(needle)) {
      return id.slice(0, id.length - legacy.length) + next;
    }
  }
  return id;
}

/**
 * v26 — retire Jasperlode + 95xxxx Deadmines placeholder run state.
 * - `jasperlode` instance → clear (dungeon removed).
 * - `deadmines` with old trash encounter ids `miners` / `foundry` → clear run
 *   (boss ids were reused on the golden graph; those two trash ids are unique to
 *   the placeholder sequence).
 * v36 — remap legacy index-order pack ids in defeated / routeEncounterIds (D3).
 */
function migrateInstanceRun(
  raw: GameState['instance'] | null | undefined,
): GameState['instance'] {
  if (raw == null) return null;
  if (typeof raw !== 'object') return null;
  const dungeonId = (raw as { dungeonId?: unknown }).dungeonId;
  if (dungeonId === 'jasperlode') return null;
  const defeated = Array.isArray((raw as { defeated?: unknown }).defeated)
    ? ((raw as { defeated: string[] }).defeated)
    : [];
  if (dungeonId === 'deadmines') {
    const oldPlaceholder = defeated.some((id) => id === 'miners' || id === 'foundry');
    if (oldPlaceholder) return null;
  }
  const run = { ...(raw as GameState['instance']) } as NonNullable<GameState['instance']>;
  if (Array.isArray(run.defeated)) {
    run.defeated = run.defeated.map(remapPackEncounterId);
  }
  if (Array.isArray(run.routeEncounterIds)) {
    run.routeEncounterIds = run.routeEncounterIds.map(remapPackEncounterId);
  }
  return run;
}

/**
 * Walked-out-of instances (5-man 30 min, raid until lockout). Optional — absent on
 * any save written before the field existed, so no SAVE_VERSION bump. Each inner run goes
 * through the same migration as a live one; an entry whose run migrates away is dropped.
 */
function migrateInstanceSaves(raw: unknown): GameState['instanceSaves'] {
  if (raw == null || typeof raw !== 'object') return {};
  const out: NonNullable<GameState['instanceSaves']> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const expiresAtMs = (v as { expiresAtMs?: unknown }).expiresAtMs;
    if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) continue;
    const run = migrateInstanceRun((v as { run?: unknown }).run as GameState['instance']);
    if (!run || run.dungeonId !== id) continue;
    out[id] = { run, expiresAtMs };
  }
  return out;
}

/** Drop lockout entries for retired dungeons (Jasperlode). */
function migrateLockouts(lockouts: GameState['lockouts']): GameState['lockouts'] {
  if (!lockouts || typeof lockouts !== 'object') return {};
  if (!('jasperlode' in lockouts)) return lockouts;
  const next = { ...lockouts };
  delete next.jasperlode;
  return next;
}

/** Back-fill a stored auction house: default each listing's `highBidder` to null (pre-v6). */
function normalizeAuctionHouse(ah: GameState['auctionHouse'] | undefined): GameState['auctionHouse'] {
  if (!ah || !Array.isArray(ah.auctions)) return emptyAuctionHouse();
  return {
    nextId: typeof ah.nextId === 'number' ? ah.nextId : 1,
    auctions: ah.auctions.map((a) => ({ ...a, highBidder: a.highBidder ?? null })),
    lastTickMs: typeof ah.lastTickMs === 'number' && Number.isFinite(ah.lastTickMs) ? ah.lastTickMs : 0,
  };
}

/** Adopt untrusted JSON as an id→number map: integer-string keys, finite number values only. */
function numericMap(raw: unknown): Record<number, number> {
  const out: Record<number, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (/^\d+$/.test(k) && typeof v === 'number' && Number.isFinite(v)) out[Number(k)] = v;
    }
  }
  return out;
}

/** Coerce arbitrary stored JSON into a valid Save, back-filling anything missing. Returns null if unusable. */
export function migrate(raw: unknown): Save | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const stateRaw = (r.state ?? r) as Record<string, unknown>;
  const charRaw = stateRaw?.char as Record<string, unknown> | undefined;
  if (!charRaw || typeof charRaw.name !== 'string') return null;

  // Equipment: v2 stores a slot map. An already-v2 save keeps its map; a v1 save is
  // converted from its single `equippedMainhand` (and that copy is removed from the
  // bags below, since v2 no longer keeps equipped items in the bags).
  const hasMap = !!charRaw.equipped && typeof charRaw.equipped === 'object';
  const legacyMain = typeof charRaw.equippedMainhand === 'number' ? charRaw.equippedMainhand : null;
  const equipped: EquippedMap = hasMap
    ? (charRaw.equipped as EquippedMap)
    : legacyMain != null ? { mainhand: legacyMain } : {};

  const char = {
    ...(charRaw as unknown as GameState['char']),
    activeBuffs: Array.isArray(charRaw.activeBuffs) ? (charRaw.activeBuffs as number[]) : [],
    // v-next: activeAuras for timed buffs with correct DB durations.
    // Old saves (only activeBuffs) are migrated to persistent auras (no expiry).
    activeAuras: Array.isArray(charRaw.activeAuras)
      ? (charRaw.activeAuras as GameState['char']['activeAuras'])
      : (Array.isArray(charRaw.activeBuffs)
          ? (charRaw.activeBuffs as number[]).map((id: number) => ({ spellId: id }))
          : []),
    equipped,
    // v5 durability: a pre-v5 save has none, so all gear starts pristine (absent => full).
    durability: charRaw.durability && typeof charRaw.durability === 'object' ? (charRaw.durability as GameState['char']['durability']) : {},
    // v3 professions: a pre-v3 save has neither, so back-fill empty.
    skills: charRaw.skills && typeof charRaw.skills === 'object' ? (charRaw.skills as GameState['char']['skills']) : {},
    knownRecipes: Array.isArray(charRaw.knownRecipes) ? (charRaw.knownRecipes as number[]) : [],
    // v9 enchanting: pre-v9 gear is un-enchanted and no formulas are known.
    enchants: charRaw.enchants && typeof charRaw.enchants === 'object' ? (charRaw.enchants as GameState['char']['enchants']) : {},
    knownEnchants: Array.isArray(charRaw.knownEnchants) ? (charRaw.knownEnchants as number[]) : [],
    // Weapon imbues / poisons (TEMP_ENCHANTMENT_SLOT). Pre-imbue saves have none.
    tempEnchants: charRaw.tempEnchants && typeof charRaw.tempEnchants === 'object'
      ? (charRaw.tempEnchants as GameState['char']['tempEnchants'])
      : {},
    // v10 pet training: pre-v10 saves have unlocked no pet-ability ranks (pets know only rank 1).
    petSpells: Array.isArray(charRaw.petSpells) ? (charRaw.petSpells as number[]) : [],
    // v27 dismissed hunter pet: pre-v27 / no dismiss → absent. Round-trips via spread above;
    // re-assert only when the raw shape actually carries a pet object.
    storedPet: charRaw.storedPet && typeof charRaw.storedPet === 'object'
      ? (charRaw.storedPet as GameState['char']['storedPet'])
      : undefined,
    // Hunter stable: absent → 0 slots / no occupants. Cite: Player.h m_stableSlots; Pet.h MAX_PET_STABLES=2.
    stableSlots: (() => {
      const n = charRaw.stableSlots;
      if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return undefined;
      return Math.min(2, n | 0);
    })(),
    stablePets: Array.isArray(charRaw.stablePets)
      ? (charRaw.stablePets as GameState['char']['stablePets'])
      : undefined,
    // v13 talents: pre-v13 saves (or fixtures) have no spent talent points.
    talents: numericMap(charRaw.talents),
    // v14 combat skills: pre-v14 saves omit the map → attack tables use L×5 defaults.
    combatSkills: charRaw.combatSkills && typeof charRaw.combatSkills === 'object'
      ? (charRaw.combatSkills as GameState['char']['combatSkills'])
      : undefined,
    // v16 reputation: pre-v16 saves have earned no rep → empty map (every faction at its base standing).
    reputations: numericMap(charRaw.reputations),
    // v35 reputation pane state: pre-v35 saves have toggled nothing → every faction reads its
    // FactionDef default flags, and the XP bar shows XP.
    factionFlags: numericMap(charRaw.factionFlags),
    watchedFaction: typeof charRaw.watchedFaction === 'number' && charRaw.watchedFaction > 0
      ? charRaw.watchedFaction
      : undefined,
    // v18 rested XP + exploration: pre-v18 saves start unrested / nothing discovered.
    restedXp: typeof charRaw.restedXp === 'number' && charRaw.restedXp > 0 ? charRaw.restedXp : 0,
    exploredZones: Array.isArray(charRaw.exploredZones) ? (charRaw.exploredZones as string[]) : [],
    // v23 gender: pre-v23 saves are male (the only portrait art the UI used before).
    gender: (charRaw.gender === 1 ? 1 : 0) as 0 | 1,
    // v30 appearance (Wave R): a valid stored look is clamped to this body's Choices; a pre-v30
    // save (no appearance) back-fills the deterministic-by-name look so it isn't a clone. v32 full
    // style unlock: previously-locked bodies keep their default horns/hair (hairStyle 0 → 1).
    appearance: appearanceForLoad(
      charRaw.appearance,
      charRaw.name,
      typeof charRaw.race === 'number' ? charRaw.race : 1,
      charRaw.gender === 1 ? 1 : 0,
      typeof r.version === 'number' ? r.version : 0,
    ),
    // v22 riding / mount: pre-v22 → untrained and unmounted.
    ridingSkill: typeof charRaw.ridingSkill === 'number' && charRaw.ridingSkill > 0
      ? charRaw.ridingSkill
      : 0,
    mountedItem: typeof charRaw.mountedItem === 'number' ? charRaw.mountedItem : undefined,
    // v24 travel (J3): pre-v24 → no journey / taxi nodes / hearth (fields stay absent).
    journey: charRaw.journey && typeof charRaw.journey === 'object'
      ? (charRaw.journey as GameState['char']['journey'])
      : undefined,
    discoveredTaxiNodes: Array.isArray(charRaw.discoveredTaxiNodes)
      ? (charRaw.discoveredTaxiNodes as number[])
      : undefined,
    hearthBind: charRaw.hearthBind && typeof charRaw.hearthBind === 'object'
      ? (charRaw.hearthBind as GameState['char']['hearthBind'])
      : undefined,
    hearthCooldownUntil: typeof charRaw.hearthCooldownUntil === 'number'
      ? charRaw.hearthCooldownUntil
      : undefined,
    // Auto consumables (food/drink/buffs) — optional prefs; absent on older saves.
    autoConsumables: normalizeAutoConsumables(charRaw.autoConsumables),
    // v39 drunk: pre-v39 / sober → absent. Clamp 0..0xFFFF. Cite: Player m_drunk; KI-734.
    drunkValue: typeof charRaw.drunkValue === 'number' && charRaw.drunkValue > 0
      ? Math.min(0xFFFF, Math.trunc(charRaw.drunkValue))
      : undefined,
    // Player.cpp:5153 m_fishingSteps. Pre-field / 0 → absent (gainFishingSkill treats as 0).
    fishingSteps: typeof charRaw.fishingSteps === 'number' && charRaw.fishingSteps > 0
      ? Math.trunc(charRaw.fishingSteps)
      : undefined,
    // v41 honor: pre-v41 / missing → empty ledger. Round-trips a stored shape when present.
    honor: normalizeHonorState(charRaw.honor),
    // soul shards are item 6265 (mapped from DB on Drain Soul kills); old numeric field ignored
  };
  delete (char as { equippedMainhand?: unknown }).equippedMainhand;
  if (char.autoConsumables == null) delete char.autoConsumables;

  // Classic hard cap is 60. Pre-cap-fix saves (grantXp could walk the
  // player_xp_for_level 60→61 row) stored level 61+; without classLevel stats past 60
  // those chars brick on load (maxHealth falls back to baseHp 1). Clamp + clear XP.
  if (typeof char.level !== 'number' || !Number.isFinite(char.level) || char.level < 1) {
    char.level = 1;
  } else if (char.level >= CLASSIC_MAX_PLAYER_LEVEL) {
    char.level = CLASSIC_MAX_PLAYER_LEVEL;
    char.xp = 0;
  }

  // v28 happiness rescale: the pet happiness bar went 0..100 → 0..1000 (vanilla raw ÷1000,
  // so the combat log reads +35/bite, 350/course). Multiply a pre-v28 pet's stored happiness
  // and any in-progress Feed Pet Effect (feedRemaining/feedPerSec are happiness/s) by 10 so
  // old pets keep their exact mood. Idempotent via the version gate.
  const rawVersion = typeof r.version === 'number' ? r.version : 0;
  if (rawVersion < 28) {
    const rescalePet = <T extends { happiness?: number; feedRemaining?: number; feedPerSec?: number }>(
      p: T | undefined,
    ): T | undefined => {
      if (!p || typeof p !== 'object') return p;
      const next = { ...p };
      if (typeof next.happiness === 'number') next.happiness *= 10;
      if (typeof next.feedRemaining === 'number') next.feedRemaining *= 10;
      if (typeof next.feedPerSec === 'number') next.feedPerSec *= 10;
      return next;
    };
    char.pet = rescalePet(char.pet);
    char.storedPet = rescalePet(char.storedPet);
    if (Array.isArray(char.stablePets)) {
      char.stablePets = char.stablePets.map((p) => (p ? rescalePet(p) ?? p : p));
    }
  }

  let inventory = (stateRaw.inventory as GameState['inventory']) ?? { stacks: [] };
  if (legacyMain != null && !hasMap) inventory = removeItem(inventory, legacyMain, 1)[0];

  // v40 keyring: back-fill empty when absent. createGame sweeps BagFamily KEYS from bags
  // once DataStore is available (migrate has no item defs).
  const keyringRaw = stateRaw.keyring as GameState['keyring'] | undefined;
  const keyring: GameState['keyring'] = keyringRaw && Array.isArray(keyringRaw.stacks)
    ? { stacks: keyringRaw.stacks.map((s) => ({ ...s })) }
    : { stacks: [] };

  const corpseRaw = stateRaw.corpse as GameState['corpse'] | undefined;
  const state: GameState = {
    char,
    inventory,
    keyring,
    bank: (stateRaw.bank as GameState['bank']) ?? { stacks: [] },
    // v11 bank bag slots: a pre-v11 save bought none, so the bank is the base grid.
    bankBags: Array.isArray(stateRaw.bankBags) ? (stateRaw.bankBags as GameState['bankBags']) : [],
    spellbook: (stateRaw.spellbook as GameState['spellbook']) ?? { known: [] },
    // v7 action bars: normalize a stored layout, or hand a default bar to a pre-v7 save
    // (game.ts autofills that empty bar from the character's abilities on load).
    actionBars: normalizeBars(stateRaw.actionBars as GameState['actionBars'] | undefined),
    globalActionBar: normalizeGlobalBar(stateRaw.globalActionBar),
    // v38 primary bar pages: form-paged main-bar layouts (BonusActionBar). Pre-v38 → page "0"
    // from actionBars[0]; other form pages empty until the player edits while shifted.
    primaryBarPages: (() => {
      const bars = normalizeBars(stateRaw.actionBars as GameState['actionBars'] | undefined);
      return normalizePrimaryPages(
        stateRaw.primaryBarPages as PrimaryBarPages | undefined,
        bars[0],
      );
    })(),
    // This character's macros. Untrusted like everything else here: normalizeMacros clamps the
    // count/name/body/icon and re-issues bad ids, so a hand-edited save loads as a legal list.
    macros: normalizeMacros(stateRaw.macros, 'character'),
    questlog: (stateRaw.questlog as GameState['questlog']) ?? { quests: [] },
    rngSeed: typeof stateRaw.rngSeed === 'number' ? stateRaw.rngSeed : 1,
    fightCounter: typeof stateRaw.fightCounter === 'number' ? stateRaw.fightCounter : 0,
    activity: Array.isArray(stateRaw.activity) ? (stateRaw.activity as string[]) : [],
    corpse: corpseRaw ?? null,
    // v8 gather-node depletion: a pre-v8 save has none, so back-fill empty (all pristine).
    nodeState: stateRaw.nodeState && typeof stateRaw.nodeState === 'object' ? (stateRaw.nodeState as GameState['nodeState']) : {},
    // Persisted spell/category cooldowns (wall-clock readyAt). Absent on pre-cooldown saves;
    // back-fill empty (game.ts prunes anything already expired on load).
    spellCooldowns: stateRaw.spellCooldowns && typeof stateRaw.spellCooldowns === 'object' ? (stateRaw.spellCooldowns as GameState['spellCooldowns']) : {},
    categoryCooldowns: stateRaw.categoryCooldowns && typeof stateRaw.categoryCooldowns === 'object' ? (stateRaw.categoryCooldowns as GameState['categoryCooldowns']) : {},
    // Phase 5 dungeon state: back-fill so a pre-instance save stays valid.
    // v26: drop Jasperlode runs; reset Deadmines runs that still list old placeholder
    // encounter ids (miners/foundry — unique to the 95xxxx graph).
    instance: migrateInstanceRun(stateRaw.instance as GameState['instance'] | null | undefined),
    instanceSaves: migrateInstanceSaves(stateRaw.instanceSaves),
    lockouts: migrateLockouts(
      stateRaw.lockouts && typeof stateRaw.lockouts === 'object'
        ? (stateRaw.lockouts as GameState['lockouts'])
        : {},
    ),
    // v4 auction house: a pre-v4 save has none, so back-fill an empty one. v6 added
    // `highBidder` to each auction — a pre-v6 listing had no bids, so default it to null.
    auctionHouse: normalizeAuctionHouse(stateRaw.auctionHouse as GameState['auctionHouse'] | undefined),
    // v6 mailbox: Delivery[] overflow. Now MailMessage[]; wrap leftover Delivery rows.
    mailbox: migrateMailbox(stateRaw.mailbox, typeof r.updatedAt === 'number' ? r.updatedAt : Date.now()),
    // v37 loot container: a haul still held by a corpse / chest / node / opened item. Pre-v37
    // saves have none. Rows carry their rolled ItemInstance, so a suffix survives the round-trip.
    ...(stateRaw.pendingLoot && typeof stateRaw.pendingLoot === 'object'
      ? { pendingLoot: stateRaw.pendingLoot as GameState['pendingLoot'] }
      : {}),
    // v18 limited vendor stock: pre-v18 saves have no trackers (all vendors fully stocked).
    ...(stateRaw.vendorStock && typeof stateRaw.vendorStock === 'object'
      ? { vendorStock: stateRaw.vendorStock as GameState['vendorStock'] }
      : {}),
    // The open honor week's standing rows. A missing / malformed ledger becomes an unstamped
    // one, which runHonorMaintenance adopts as the current week rather than back-dating decay —
    // so no SAVE_VERSION bump: an older save loses nothing and gets no phantom rank decay.
    honorWeek: normalizeHonorWeek(stateRaw.honorWeek),
    // The 1v1 gauntlet rung (P6.3). A missing or junk value reads as 0 rungs beaten, which is
    // exactly what a pre-existing save means, so no SAVE_VERSION bump.
    ...(typeof stateRaw.gauntletRung === 'number' && Number.isFinite(stateRaw.gauntletRung)
      && stateRaw.gauntletRung > 0
      ? { gauntletRung: Math.max(0, Math.trunc(stateRaw.gauntletRung)) }
      : {}),
    // Arena Elo per bracket. Absent reads as the 1500 start, which is what every pre-rating save
    // means, so no SAVE_VERSION bump. Junk entries are dropped rather than carried.
    ...(normalizeArenaRating(stateRaw.arenaRating) ?? {}),
    // v19 dungeon squad: pre-v19 saves have recruited no companions.
    ...(Array.isArray(stateRaw.squad) ? { squad: stateRaw.squad as GameState['squad'] } : {}),
    // v21 bot roster: dismissed bots wait here with their gear/level/XP.
    ...(stateRaw.botRoster && typeof stateRaw.botRoster === 'object'
      ? { botRoster: stateRaw.botRoster as GameState['botRoster'] }
      : {}),
    // v42 dev raid roster is dropped on load: no app surface builds one, so a save never keeps it.
    ...(typeof stateRaw.squadRole === 'string' ? { squadRole: stateRaw.squadRole as GameState['squadRole'] } : {}),
    ...(typeof stateRaw.squadStrategy === 'string' ? { squadStrategy: stateRaw.squadStrategy as GameState['squadStrategy'] } : {}),
    ...(stateRaw.companionEnergy && typeof stateRaw.companionEnergy === 'object'
      ? { companionEnergy: stateRaw.companionEnergy as GameState['companionEnergy'] }
      : {}),
    ...(stateRaw.raidParty && typeof stateRaw.raidParty === 'object'
      ? { raidParty: stateRaw.raidParty as GameState['raidParty'] }
      : {}),
    ...(stateRaw.instanceRoster && typeof stateRaw.instanceRoster === 'object'
      ? { instanceRoster: stateRaw.instanceRoster as GameState['instanceRoster'] }
      : {}),
    ...(stateRaw.raidLineup && typeof stateRaw.raidLineup === 'object'
      ? { raidLineup: stateRaw.raidLineup as GameState['raidLineup'] }
      : {}),
    ...(stateRaw.pickpocketRestock && typeof stateRaw.pickpocketRestock === 'object'
      ? { pickpocketRestock: stateRaw.pickpocketRestock as GameState['pickpocketRestock'] }
      : {}),
    ...(stateRaw.worldStates && typeof stateRaw.worldStates === 'object'
      ? { worldStates: stateRaw.worldStates as GameState['worldStates'] }
      : {}),
    // Optional GameState fields that must round-trip. Pre-feature saves omit them; normalize
    // on read (game.equipmentHelperConfig / autopilotConfig / rotation()) supplies defaults.
    // Dropping these on migrate was resetting Equipment Helper to "suggest" every load.
    ...(stateRaw.rotation !== undefined ? { rotation: stateRaw.rotation as GameState['rotation'] } : {}),
    ...(stateRaw.rotationSpec !== undefined ? { rotationSpec: stateRaw.rotationSpec as GameState['rotationSpec'] } : {}),
    // Second rotation profile (a tank's / healer's DPS list) and which slot is in force.
    // Both must be listed here or migrate drops them and every reload throws the edits away.
    ...(stateRaw.rotationDps !== undefined ? { rotationDps: stateRaw.rotationDps as GameState['rotationDps'] } : {}),
    ...(stateRaw.rotationProfile !== undefined
      ? { rotationProfile: stateRaw.rotationProfile as GameState['rotationProfile'] }
      : {}),
    // Named rotation lists + which one is in force. How many you have and which you use is
    // exactly what has to survive a reload, so both keys are passed through explicitly.
    ...(stateRaw.rotationProfiles !== undefined
      ? { rotationProfiles: normalizeProfiles(stateRaw.rotationProfiles) }
      : {}),
    ...(typeof stateRaw.activeRotationProfileId === 'string'
      ? { activeRotationProfileId: stateRaw.activeRotationProfileId }
      : {}),
    // Named talent loadouts from the wiki calculator. Optional; pre-feature saves omit.
    ...(stateRaw.talentBuilds !== undefined
      ? { talentBuilds: normalizeTalentBuilds(stateRaw.talentBuilds) }
      : {}),
    ...(stateRaw.autopilot !== undefined ? { autopilot: stateRaw.autopilot as GameState['autopilot'] } : {}),
    ...(stateRaw.equipmentHelper !== undefined
      ? { equipmentHelper: stateRaw.equipmentHelper as GameState['equipmentHelper'] }
      : {}),
    ...(stateRaw.outfitter !== undefined
      ? { outfitter: stateRaw.outfitter as GameState['outfitter'] }
      : {}),
    ...(stateRaw.autoDisenchant !== undefined
      ? { autoDisenchant: stateRaw.autoDisenchant as GameState['autoDisenchant'] }
      : {}),
    // PallyPower board. Listed here or migrate drops it and every reload throws the grid away.
    ...(stateRaw.paladinAssignments !== undefined
      ? { paladinAssignments: normalizePaladinAssignments(stateRaw.paladinAssignments) }
      : {}),
    ...(stateRaw.junkFilter !== undefined
      ? { junkFilter: stateRaw.junkFilter as GameState['junkFilter'] }
      : {}),
    ...(stateRaw.gatherFilter !== undefined
      ? { gatherFilter: stateRaw.gatherFilter as GameState['gatherFilter'] }
      : {}),
    ...(stateRaw.lastCorpse !== undefined
      ? { lastCorpse: stateRaw.lastCorpse as GameState['lastCorpse'] }
      : {}),
    // Talent respec ladder (CMaNGOS m_resetTalentsCost/Time). Must round-trip or the
    // escalating cost silently resets to the 1g first-reset price on every reload.
    ...(stateRaw.resetTalentsCost !== undefined
      ? { resetTalentsCost: stateRaw.resetTalentsCost as GameState['resetTalentsCost'] }
      : {}),
    ...(stateRaw.resetTalentsTime !== undefined
      ? { resetTalentsTime: stateRaw.resetTalentsTime as GameState['resetTalentsTime'] }
      : {}),
    // Wave DF: player death-flow (CORPSE/GHOST). Optional — pre-DF / repair-only saves omit.
    ...(stateRaw.deathFlow && typeof stateRaw.deathFlow === 'object'
      ? { deathFlow: stateRaw.deathFlow as GameState['deathFlow'] }
      : {}),
    // v24 J-wiring: GO restock/trap runtime + environmental hazard timers.
    ...(stateRaw.goRuntime && typeof stateRaw.goRuntime === 'object'
      ? { goRuntime: stateRaw.goRuntime as GameState['goRuntime'] }
      : {}),
    ...(stateRaw.hazards && typeof stateRaw.hazards === 'object'
      ? { hazards: stateRaw.hazards as GameState['hazards'] }
      : {}),
    // The battleground you were in. Identity only — the match is rebuilt on mount. An ARENA row is
    // dropped: 2026-09-01 moved every bracket to the combat surface, and a match there does not
    // survive a reload any more than a duel does.
    ...(isObjectiveBattlegroundRun(stateRaw.battleground)
      ? { battleground: stateRaw.battleground }
      : {}),
    // SPELL_EFFECT_SUMMON_OBJECT_WILD session places (optional; pre-feature saves omit).
    ...(Array.isArray(stateRaw.wildSummonedObjects)
      ? { wildSummonedObjects: stateRaw.wildSummonedObjects as GameState['wildSummonedObjects'] }
      : {}),
    ...(Array.isArray(stateRaw.objectSlots)
      ? { objectSlots: stateRaw.objectSlots as GameState['objectSlots'] }
      : {}),
    // enterInstance nowMs for runFullDungeon lockout (KI-1022). Mid-run reload must keep it
    // or applyLockout falls through to `?? 0` and the raid save expires immediately.
    ...(typeof stateRaw.instanceEnteredAtMs === 'number' && Number.isFinite(stateRaw.instanceEnteredAtMs)
      ? { instanceEnteredAtMs: Math.max(0, Math.trunc(stateRaw.instanceEnteredAtMs)) }
      : {}),
  };
  return {
    version: SAVE_VERSION,
    slot: typeof r.slot === 'string' ? r.slot : 'default',
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
    ...(typeof r.baseUpdatedAt === 'number' && Number.isFinite(r.baseUpdatedAt)
      ? { baseUpdatedAt: r.baseUpdatedAt }
      : {}),
    state,
  };
}

export function summarize(save: Save): SaveMeta {
  return {
    slot: save.slot,
    name: save.state.char.name,
    level: save.state.char.level,
    cls: save.state.char.cls,
    updatedAt: save.updatedAt,
  };
}
