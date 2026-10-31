// BG team building — every unit on both teams is a REAL companion record with a real premade spec,
// talents, generated gear, rotation and bars. Your side is live objects; the enemy is generated.

import type { DataStore } from '../../data/dataStore.ts';
import type { SkillLine } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import { worldBots, type WorldBot } from '../bots/botPool.ts';
import {
  generateSpawnGear, isRaidGearProfile, DEFAULT_HIRE_GEAR_PROFILE, type GearProfile,
} from '../bots/botGear.ts';
import { elixirKit, generateSpawnInventory } from '../bots/botInventory.ts';
import { applyNamedItemList, applyPvpKit } from './bgConsumes.ts';
import { companionProfessionSkills } from '../bots/botProfessions.ts';
import { addItem } from '../items/inventory.ts';
import { applyCompanionPetSync } from '../bots/botPet.ts';
import {
  companionCharacter, companionLevel, type Companion, type SquadRole,
} from '../bots/squad.ts';
import { hashSeed } from '../../engine/core/rng.ts';
import type { BgTeam } from './types.ts';
import type { BgTierDef } from './bgTier.ts';
import { resolveCompSpecIdx, type ArenaComp, type ArenaCompSeat } from './arenaComps.ts';

export interface BgTeamSeat {
  kind: 'player' | 'companion' | 'bot';
  /** The companion who fights — your own (by reference) or a generated shell. Player seat: absent. */
  comp?: Companion;
  /** The named-comp seat this body was seated for, when one was (arenaComps ArenaCompSeat). */
  compSeat?: ArenaCompSeat;
}

/** Real comps run three healers (runsheet §3); generated fills top up toward this. */
const HEALERS_PER_TEAM = 3;

// A consume-kitted team fields real engineers, since grenades gate on Engineering 175/260.
// Professions roll 1-in-7 per seed, so ~21% of teams would otherwise field zero grenades.
const ENGINEERS_PER_TEAM = 2;

/** Prefer the baked `pvp *` premades when generating a BG unit (runsheet W16). */
function pickBgSpecIdx(
  specs: readonly { name: string; role: string }[],
  wantHealer: boolean,
  seed: number,
): number {
  const match = (requirePvp: boolean): number[] => {
    const out: number[] = [];
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i]!;
      if (requirePvp && !s.name.startsWith('pvp')) continue;
      if (wantHealer ? s.role !== 'healer' : s.role === 'healer') continue;
      out.push(i);
    }
    return out;
  };
  const pool = [match(true), match(false), specs.map((_, i) => i)].find((p) => p.length > 0) ?? [];
  if (!pool.length) return 0;
  return pool[Math.abs(hashSeed(seed, 11)) % pool.length]!;
}

// `consumes` gates the CONSUMABLES only — food, potions, class grants, the elixir sweep. Bags, ammo,
// reagents and tools ride at every tier; gating those on it left 26 of 65 rungs with an empty bag.
function applySpawnKit(
  ds: DataStore,
  shell: Companion,
  level: number,
  seed: number,
  consumes: boolean,
): void {
  const geared = companionCharacter(shell, level, ds);
  const kit = generateSpawnInventory(geared, seed, ds, { consumables: consumes });
  shell.equipped = kit.equipped; // backpacks landed in the bag slots
  let bags = kit.inventory;
  if (consumes) {
    for (const entry of elixirKit(level, ds)) {
      bags = addItem(bags, entry, 2, ds.item(entry)?.stackable ?? 1);
    }
  }
  shell.bags = bags;
}

/** Full consumes at twink kit and up — W5's gate: Apes buffed to the gills, Freemade dry. */
function profileWantsConsumes(profile: GearProfile): boolean {
  return profile === 'twink' || isRaidGearProfile(profile);
}

/** Materialize one pool bot into a fully-geared companion shell at `level`. */
function bgBotCompanion(
  ds: DataStore,
  bot: WorldBot,
  team: BgTeam,
  level: number,
  profile: GearProfile,
  wantHealer: boolean,
  consumes: boolean,
  /** A comp seat pins the premade; without it the seeded pvp-preferring pick runs. */
  forceSpecIdx?: number,
  /** G11: folded after the kit, so a named entry cannot be overwritten by it. */
  namedItems?: readonly number[],
): Companion {
  const specs = ds.botSpecs(bot.cls);
  const specIdx = (forceSpecIdx != null && forceSpecIdx >= 0 && forceSpecIdx < specs.length)
    ? forceSpecIdx
    : pickBgSpecIdx(specs, wantHealer, bot.seed);
  const specRole = specs[specIdx]?.role;
  const role: SquadRole = specRole === 'healer' ? 'healer' : specRole === 'tank' ? 'tank' : 'dps';
  const shell: Companion = {
    id: `bgbot:${bot.id}`,
    name: bot.name,
    race: bot.race,
    cls: bot.cls,
    gender: bot.gender,
    role,
    seed: bot.seed,
    equipped: {},
    specIdx,
    level,
    xpLocked: true,
    // Without this a raid-t3 bot still failed profession use-gates (companionCharacter
    // maxes skills off gearProfile) — the Apes engineer couldn't throw its own grenade.
    gearProfile: profile,
  };
  const char = companionCharacter(shell, level, ds);
  shell.equipped = generateSpawnGear(char, bot.seed, ds, profile, { role, specIdx });
  applyCompanionPetSync(shell, level, ds); // hunters/warlocks bring their pet into shard fights
  applySpawnKit(ds, shell, level, bot.seed, consumes);
  // PvP Insignia rides regardless of the consume gate — a dry Freemade still wears a trinket;
  // the FC staples (FAP/Swiftness/boots/Skull) and grenades stay behind `consumes`.
  applyPvpKit(ds, shell, team, level, consumes);
  if (namedItems?.length) applyNamedItemList(ds, shell, level, namedItems);
  return shell;
}

// Presence, not value: the value a body fights with comes from its gear profile (squad.ts:347).
function botRolled(bot: WorldBot, level: number, line: SkillLine): boolean {
  return (companionProfessionSkills(bot.seed, level, { maxed: true })[line]?.current ?? 0) > 0;
}

/** Deterministically pick `count` distinct pool bots of `team`, healers first. */
export function generateBgBots(
  ds: DataStore,
  team: BgTeam,
  count: number,
  level: number,
  profile: GearProfile,
  seed: number,
  healersNeeded: number,
  consumes: boolean,
): Companion[] {
  if (count <= 0) return [];
  const pool = worldBots(ds).filter((b) => b.faction === team);
  if (!pool.length) return [];
  const canHeal = (b: WorldBot): boolean => ds.botSpecs(b.cls).some((s) => s.role === 'healer');
  const isEngineer = (b: WorldBot): boolean => botRolled(b, level, 'engineering');
  const engineersNeeded = consumes ? ENGINEERS_PER_TEAM : 0;
  const taken = new Set<number>();
  const out: Companion[] = [];
  let healers = 0;
  let engineers = 0;
  for (let i = 0; out.length < count && i < count * 64; i++) {
    const idx = Math.abs(hashSeed(seed, i)) % pool.length;
    if (taken.has(idx)) continue;
    const bot = pool[idx]!;
    const wantHealer = healers < healersNeeded;
    if (wantHealer && !canHeal(bot)) continue;
    // After healers, steer the remaining picks toward engineer seeds until the quota holds.
    if (!wantHealer && engineers < engineersNeeded && !isEngineer(bot)) continue;
    taken.add(idx);
    if (wantHealer) healers++;
    if (isEngineer(bot)) engineers++;
    out.push(bgBotCompanion(ds, bot, team, level, profile, wantHealer, consumes));
  }
  // Healer scarcity in a small faction pool: fill the rest with whoever is left.
  for (let i = 0; out.length < count && i < count * 64; i++) {
    const idx = Math.abs(hashSeed(seed, 0x5eed + i)) % pool.length;
    if (taken.has(idx)) continue;
    taken.add(idx);
    out.push(bgBotCompanion(ds, pool[idx]!, team, level, profile, false, consumes));
  }
  return out;
}

// Seat a NAMED COMP: one bot per seat, of that seat's class, running that seat's baked premade. An
// unseatable class or unmatched prefix drops the WHOLE comp rather than half-seating its name.
function generateCompBots(
  ds: DataStore,
  team: BgTeam,
  comp: ArenaComp,
  level: number,
  seed: number,
  consumes: boolean,
): Companion[] | null {
  const pool = worldBots(ds).filter((b) => b.faction === team);
  if (!pool.length) return null;
  const taken = new Set<number>();
  const out: Companion[] = [];
  for (let s = 0; s < comp.seats.length; s++) {
    const seat = comp.seats[s]!;
    const specIdx = resolveCompSpecIdx(ds.botSpecs(seat.cls), seat);
    if (specIdx < 0) return null;
    let bot: WorldBot | null = null;
    for (let i = 0; i < pool.length * 4 && !bot; i++) {
      const idx = Math.abs(hashSeed(seed, s * 977 + i)) % pool.length;
      if (taken.has(idx) || pool[idx]!.cls !== seat.cls) continue;
      // Rejected candidates stay untaken, so a later seat may still use them.
      if (seat.profession && !botRolled(pool[idx]!, level, seat.profession)) continue;
      taken.add(idx);
      bot = pool[idx]!;
    }
    if (!bot) return null;
    // G11: a SEAT may name its own gear profile, and this is the one place a profile reaches the
    // body. Absent = the comp's, which is every shipped comp and every honorable round.
    out.push(bgBotCompanion(
      ds, bot, team, level, seat.gear ?? comp.gear, seat.role === 'healer', consumes, specIdx,
      seat.items,
    ));
  }
  return out;
}

export interface FriendlySeatsOpts {
  ds: DataStore;
  char: Character;
  playerRole?: SquadRole | null;
  squad: readonly Companion[];
  roster: Readonly<Record<string, Companion>>;
  /** Companion ids to bring. Resolved against squad + roster; unknown ids are dropped. */
  allies: readonly string[];
  team: BgTeam;
  teamSize: number;
  seed: number;
  /** Consume kits (spawn inventory + elixirs) for generated units. Default true. */
  consumes?: boolean;
}

/** Seat 0 is always you. Your companions ride as live references; mercs fill to size. */
export function buildFriendlySeats(o: FriendlySeatsOpts): BgTeamSeat[] {
  const byId = new Map<string, Companion>();
  for (const c of o.squad) byId.set(c.id, c);
  for (const c of Object.values(o.roster)) if (!byId.has(c.id)) byId.set(c.id, c);
  const picked: Companion[] = [];
  for (const id of o.allies) {
    const c = byId.get(id);
    if (c && !picked.includes(c)) picked.push(c);
    if (1 + picked.length >= o.teamSize) break;
  }
  const consumes = o.consumes !== false;
  // Your side brings the gear it owns; only the fill mercs are generated.
  const seats: BgTeamSeat[] = [{ kind: 'player' }];
  for (const comp of picked) seats.push({ kind: 'companion', comp });
  const healers = (o.playerRole === 'healer' ? 1 : 0) + picked.filter((c) => c.role === 'healer').length;
  const fill = generateBgBots(
    o.ds, o.team, o.teamSize - seats.length, o.char.level,
    DEFAULT_HIRE_GEAR_PROFILE, hashSeed(o.seed, 1),
    Math.max(0, HEALERS_PER_TEAM - healers), consumes,
  );
  for (const comp of fill) seats.push({ kind: 'bot', comp });
  return seats;
}

export interface EnemySeatsOpts {
  ds: DataStore;
  char: Character;
  team: BgTeam;
  teamSize: number;
  seed: number;
  tier: BgTierDef;
  /** A named composition to seat (arenaComps.ts). Absent, or unseatable, = random pvp bots. */
  comp?: ArenaComp | null;
  /**
   * Override the tier's own consume policy. Absent = `profileWantsConsumes(tier.enemyGear)`,
   * which is what every live caller wants: W5's gate says Apes is buffed to the gills and
   * Freemade is dry.
   *
   * The duel lab is the caller that needs it independent of tier (duel plan §G7): a cell fights
   * kitted or dry as a declared axis, so a Freemade cell can fight kitted and an Apes cell dry
   * and the round says which. Same field, same meaning and same default as `FriendlySeatsOpts`
   * already carries on the other side of the match.
   */
  consumes?: boolean;
}

export function buildEnemySeats(o: EnemySeatsOpts): BgTeamSeat[] {
  const consumes = o.consumes ?? profileWantsConsumes(o.tier.enemyGear);
  // A named comp when the caller asked for one and it seats whole; random pvp-spec bots
  // otherwise, which is what every bracket did before P4.
  if (o.comp) {
    const bots = generateCompBots(o.ds, o.team, o.comp, o.char.level, hashSeed(o.seed, 3), consumes);
    if (bots && bots.length === o.teamSize) {
      // generateCompBots returns one body per comp seat, in comp.seats order, or null - so the
      // index carries the seat's own rotation variant out to the caller.
      const seats = o.comp.seats;
      return bots.map((comp, i): BgTeamSeat => ({ kind: 'bot', comp, ...(seats[i] ? { compSeat: seats[i] } : {}) }));
    }
  }
  return generateBgBots(
    o.ds, o.team, o.teamSize, o.char.level, o.tier.enemyGear, hashSeed(o.seed, 2),
    HEALERS_PER_TEAM, consumes,
  ).map((comp): BgTeamSeat => ({ kind: 'bot', comp }));
}

/** Level a seat fights at: companions use their own level-sync; bots were built at yours. */
export function seatLevel(seat: BgTeamSeat, playerLevel: number): number {
  if (seat.kind === 'player' || !seat.comp) return playerLevel;
  return companionLevel(seat.comp, playerLevel);
}
