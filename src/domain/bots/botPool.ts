// The world's random-bot population — 5000 deterministic bots on a FIXED world seed, so every
// player meets the same ones. Race/class follow the baked census weights. Pure: no clock, no rng.

import type { DataStore } from '../../data/dataStore.ts';
import type { Faction } from '../../data/schema.ts';
import { hashSeed } from '../../engine/core/rng.ts';
import { factionOf } from '../character/races.ts';
import { companionGender, stableIdHash } from './squad.ts';
import { pickSpecIndex } from '../character/talentLink.ts';
import type { GearProfile } from './botGear.ts';
import { isRaidGearProfile } from './botGear.ts';
import { hireCostCopper, isCheapHireProfile } from './companionHireCost.ts';

export const WORLD_BOT_COUNT = 5000;
export const MAX_BOT_LEVEL = 60;
/** Inn hire window half-width: bots within ±2 levels of the player. */
export const HIRE_LEVEL_WINDOW = 2;
// How many candidates an innkeeper puts forward. 16, not 8: a raid roster is 40 bodies of specific
// classes, and eight faces per bracket meant zone-hopping to assemble one.
export const INN_SLATE_SIZE = 16;
// 15% of the pool sits at max level whatever the stripe rolled: RandomPlayerbotMgr.cpp:2861
// (AiPlayerbot.RandomBotMaxLevelChance = 0.15, aiplayerbot.conf.dist.in:132).
export const MAX_LEVEL_CHANCE_PCT = 15;

/** Fixed world seed — the population is the same in every save. */
const WORLD_SEED = stableIdHash('phonecraft-botworld-1');

export interface WorldBot {
  /** Stable id: 'b' + pool index. */
  id: string;
  index: number;
  name: string;
  gender: 0 | 1;
  race: number;
  cls: number;
  faction: Faction | undefined;
  /** Base level (static population; a hired bot levels through XP in your party). */
  level: number;
  /** Index into ds.botSpecs(cls) — the premade build this bot runs. */
  specIdx: number;
  /** Per-bot stream seed (spawn gear, flavor). */
  seed: number;
}

// ---- population build (once per DataStore) ----------------------------------

const POOL_CACHE = new WeakMap<DataStore, WorldBot[]>();

/** Valid race/class combos with their census weight (create-info validated). */
function weightedCombos(ds: DataStore): { race: number; cls: number; w: number }[] {
  const probs = ds.botPopulation();
  const out: { race: number; cls: number; w: number }[] = [];
  for (const r of ds.races()) {
    for (const cls of r.classes) {
      if (!ds.createInfo(r.id, cls)) continue;
      const w = probs[`${cls}.${r.id}`];
      out.push({ race: r.id, cls, w: Math.max(1, w ?? 20) }); // conf default when unlisted
    }
  }
  return out;
}

// The full world population: levels stripe 1..60 plus the 15% max-level bulge, race/class ride
// the census weights, names are unique per gender until the pool wraps. Deterministic, cached.
export function worldBots(ds: DataStore): WorldBot[] {
  const cached = POOL_CACHE.get(ds);
  if (cached) return cached;
  const combos = weightedCombos(ds);
  const totalW = combos.reduce((s, c) => s + c.w, 0);
  const names = ds.botNames();
  const counters: [number, number] = [0, 0]; // per-gender name cursor
  const bots: WorldBot[] = [];
  if (combos.length === 0) {
    POOL_CACHE.set(ds, bots);
    return bots;
  }
  for (let i = 0; i < WORLD_BOT_COUNT; i++) {
    const seed = hashSeed(WORLD_SEED, i);
    let roll = Math.abs(seed) % totalW;
    let combo = combos[combos.length - 1]!;
    for (const c of combos) {
      roll -= c.w;
      if (roll < 0) { combo = c; break; }
    }
    const gender = companionGender(seed);
    const list = gender === 1 ? names.female : names.male;
    const cursor = counters[gender]++;
    const name = list.length === 0
      ? `Bot ${i}`
      : `${list[cursor % list.length]!}${cursor >= list.length ? ` ${'II III IV V'.split(' ')[Math.floor(cursor / list.length) - 1] ?? 'VI'}` : ''}`;
    let level = 1 + (i % MAX_BOT_LEVEL);
    if (level < MAX_BOT_LEVEL
      && Math.abs(hashSeed(seed, 9)) % 100 < MAX_LEVEL_CHANCE_PCT) level = MAX_BOT_LEVEL;
    bots.push({
      id: `b${i}`,
      index: i,
      name,
      gender,
      race: combo.race,
      cls: combo.cls,
      faction: factionOf(ds, combo.race),
      level,
      specIdx: pickSpecIndex(ds.botSpecs(combo.cls), hashSeed(seed, 5)) ?? 0,
      seed,
    });
  }
  POOL_CACHE.set(ds, bots);
  return bots;
}

/** A bot's role, read off the premade build it runs. */
export function worldBotRole(ds: DataStore, b: WorldBot): string {
  const spec = ds.botSpecs(b.cls)[b.specIdx];
  return spec?.role ?? 'dps';
}

export interface BotSearchFilters {
  /** Class ids. Empty / absent ⇒ any. */
  classes?: readonly number[];
  /** 'tank' | 'healer' | 'dps'. Empty / absent ⇒ any. */
  roles?: readonly string[];
  minLevel?: number;
  maxLevel?: number;
  /** Gear tiers (as rolled for this zone/bracket salt). Empty / absent ⇒ any. */
  tiers?: readonly GearProfile[];
  /** Copper ceiling on the hire price. 0 / absent ⇒ any. */
  maxCostCopper?: number;
  /** Case-insensitive substring of the bot's name. */
  name?: string;
  /** Hard result cap. Default 24. */
  limit?: number;
}

/** True when at least one filter would actually narrow the pool. */
export function hasBotSearchFilter(f: BotSearchFilters | undefined): boolean {
  if (!f) return false;
  return !!(f.classes?.length || f.roles?.length || f.tiers?.length
    || (f.minLevel != null && f.minLevel > 1)
    || (f.maxLevel != null && f.maxLevel < MAX_BOT_LEVEL)
    || (f.maxCostCopper != null && f.maxCostCopper > 0)
    || (f.name && f.name.trim().length > 0));
}

// Search the whole same-faction population instead of one innkeeper's slate. Returns [] when
// nothing is filtered — 2500 bots is not a shortlist. Level is not clamped to the hire window.
export function searchWorldBots(args: {
  ds: DataStore;
  playerRace: number;
  playerLevel: number;
  zoneId: string;
  excludeIds?: readonly string[];
  filters: BotSearchFilters;
}): WorldBot[] {
  const { ds, filters: f } = args;
  if (!hasBotSearchFilter(f)) return [];
  const team = factionOf(ds, args.playerRace);
  const excluded = new Set(args.excludeIds ?? []);
  const salt = innZoneSalt(args.zoneId, args.playerLevel);
  const clsSet = f.classes?.length ? new Set(f.classes) : null;
  const roleSet = f.roles?.length ? new Set(f.roles) : null;
  const tierSet = f.tiers?.length ? new Set<GearProfile>(f.tiers) : null;
  const q = f.name?.trim().toLowerCase() ?? '';
  const lo = Math.max(1, f.minLevel ?? 1);
  const hi = Math.min(MAX_BOT_LEVEL, f.maxLevel ?? MAX_BOT_LEVEL);
  const limit = Math.max(1, f.limit ?? 24);

  const out: WorldBot[] = [];
  for (const b of worldBots(ds)) {
    if (b.faction !== team || excluded.has(b.id)) continue;
    if (b.level < lo || b.level > hi) continue;
    if (clsSet && !clsSet.has(b.cls)) continue;
    if (q && !b.name.toLowerCase().includes(q)) continue;
    if (roleSet && !roleSet.has(worldBotRole(ds, b))) continue;
    if (tierSet || (f.maxCostCopper != null && f.maxCostCopper > 0)) {
      const profile = pickProfile(b.id, salt, args.playerLevel);
      if (tierSet && !tierSet.has(profile)) continue;
      if (f.maxCostCopper != null && f.maxCostCopper > 0
        && hireCostCopper(b.level, profile) > f.maxCostCopper) continue;
    }
    out.push(b);
    if (out.length >= limit) break;
  }
  return out.sort((x, y) => x.level - y.level || x.index - y.index);
}

/** Pool bot by id ('b<index>'), or undefined. */
export function worldBot(ds: DataStore, id: string): WorldBot | undefined {
  if (!id.startsWith('b')) return undefined;
  const idx = Number(id.slice(1));
  if (!Number.isInteger(idx) || idx < 0 || idx >= WORLD_BOT_COUNT) return undefined;
  return worldBots(ds)[idx];
}

// Stable inn salt: zone id + 5-level player bracket (same as innSlate rotation). ICH3 pickProfile uses this
// so kit tiers stay fixed for a visit band.
export function innZoneSalt(zoneId: string, playerLevel: number): number {
  return hashSeed(stableIdHash(zoneId), Math.floor(Math.max(1, playerLevel) / 5));
}

// ICH3 kit profile for a slate face. Below player level 55 it biases naked/shabby/field/twink and
// never raid; at 55+ it uses the high-level mix. Slate-level guarantees come from the post-pass.
export function pickProfile(
  botId: string,
  zoneSalt: number,
  playerLevel: number,
): GearProfile {
  const idx = botId.startsWith('b')
    ? Number(botId.slice(1))
    : stableIdHash(botId);
  const seedIdx = Number.isFinite(idx) ? idx : stableIdHash(botId);
  const roll = Math.abs(hashSeed(zoneSalt, seedIdx * 17 + 3)) % 100;
  const lvl = Math.max(1, Math.min(60, Math.floor(playerLevel)));

  // Mid-level inns (design §5.2 rule 3): no raid-*.
  if (lvl < 55) {
    // Weights: naked 10%, shabby 30%, field 40%, twink 20%
    if (roll < 10) return 'naked';
    if (roll < 40) return 'shabby';
    if (roll < 80) return 'field';
    return 'twink';
  }

  // L55+ mix among ~8 faces (design §5.2 shares):
  // naked 1–2, shabby 2–3, field 2–3, twink 0–1, raid-mixed 0–1, t2/t3 rare.
  if (roll < 15) return 'naked';
  if (roll < 45) return 'shabby';
  if (roll < 75) return 'field';
  if (roll < 85) return 'twink';
  if (roll < 93) return 'raid-mixed';
  if (roll < 98) return 'raid-t2';
  return 'raid-t3';
}

// Slate stratification post-pass: at high level guarantee one cheap face and never an all-raid
// slate; at mid level strip any raid profile that slipped through.
export function ensureSlateProfileMix(
  profiles: readonly GearProfile[],
  zoneSalt: number,
  playerLevel: number,
): GearProfile[] {
  if (profiles.length === 0) return [];
  const out = profiles.slice();
  const lvl = Math.max(1, Math.min(60, Math.floor(playerLevel)));

  if (lvl < 55) {
    for (let i = 0; i < out.length; i++) {
      if (isRaidGearProfile(out[i]!)) out[i] = 'field';
    }
    return out;
  }

  if (!out.some(isCheapHireProfile)) {
    const i = Math.abs(hashSeed(zoneSalt, 777)) % out.length;
    out[i] = (Math.abs(hashSeed(zoneSalt, 778)) % 2 === 0) ? 'naked' : 'shabby';
  }

  if (out.every((p) => isRaidGearProfile(p))) {
    out[0] = 'shabby';
  }
  return out;
}

// The innkeeper's slate: same-faction bots within ±HIRE_LEVEL_WINDOW, widening a level at a time
// up to ±9 so edge brackets stay hirable. `excludeIds` drops anyone already in the roster.
export function innSlate(args: {
  ds: DataStore;
  playerRace: number;
  playerLevel: number;
  zoneId: string;
  excludeIds?: readonly string[];
}): WorldBot[] {
  const { ds } = args;
  const team = factionOf(ds, args.playerRace);
  const excluded = new Set(args.excludeIds ?? []);
  const all = worldBots(ds).filter((b) => b.faction === team && !excluded.has(b.id));
  let halfSpan = HIRE_LEVEL_WINDOW;
  let fits: WorldBot[] = [];
  for (; halfSpan <= 9; halfSpan++) {
    fits = all.filter((b) => Math.abs(b.level - args.playerLevel) <= halfSpan);
    if (fits.length >= INN_SLATE_SIZE) break;
  }
  // Stable per-zone/bracket rotation: same inn shows the same faces for a
  // 5-level bracket, other inns show different ones.
  const salt = innZoneSalt(args.zoneId, args.playerLevel);
  return fits
    .map((b) => ({ b, k: Math.abs(hashSeed(salt, b.index)) }))
    .sort((x, y) => x.k - y.k || x.b.index - y.b.index)
    .slice(0, INN_SLATE_SIZE)
    .map((x) => x.b)
    .sort((x, y) => x.level - y.level || x.index - y.index);
}
