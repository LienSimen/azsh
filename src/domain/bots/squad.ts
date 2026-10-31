// AI squad companions: FREE composition, persistent characters you gear from your own bags, built
// through the SAME paths as the player. Pure — no DOM, clock or rng; names come from seeds.

import type { DataStore } from '../../data/dataStore.ts';
import { CLASS, SHAPESHIFT_FORM } from '../../data/schema.ts';
import type { SkillLine } from '../../data/schema.ts';
import type { ActiveAura, Character, EquippedMap, PetState, TempEnchantMap } from '../character/character.ts';
import { maxHealth, maxPower, powerType, buildCombatant, combatItems } from '../character/character.ts';
import type { DurabilityMap } from '../items/durability.ts';
import type { SpellBook } from '../character/spellbook.ts';
import { resolveSpellId } from '../character/spellbook.ts';
import type { CombatantSpec } from '../../engine/combat.ts';
import type { Rotation, RotationProfileId } from '../rotation/rotation.ts';
import type { RotationProfile } from '../rotation/rotationProfiles.ts';
import type { Inventory } from '../items/inventory.ts';
import type { QuestLog } from '../quests/questlog.ts';
import { countItem, emptyInventory } from '../items/inventory.ts';
import { equippedEntry } from '../items/itemInstance.ts';
import { bestAmmoForWeapon, checkAmmoCompatibility } from '../items/ammo.ts';
import type { BankBags } from '../items/bank.ts';
import { factionOf } from '../character/races.ts';
import { talentsForSpec, talentsFromLink } from '../character/talentLink.ts';
import { talentGrantedSpellIds } from '../character/talents.ts';
import { buildPet } from '../pet/pet.ts';
import { syntheticClassTrainerEntry } from '../economy/syntheticClassTrainers.ts';
import {
  isSpellFitByClassAndRace,
  raceClassMaskMatches,
  grantMaxedCombatSkillsForRaceClass,
} from '../character/combatSkills.ts';
import { isRaidGearProfile, type GearProfile } from './botGear.ts';
import {
  applyTrainedCaps,
  companionProfessionSkills,
  companionSkillCap,
  companionTrainedRank,
  professionSkillCap,
} from './botProfessions.ts';
import type { CompanionMission, CompanionProfessionMap } from './companionMissions.ts';
import { deterministicAppearance } from '../character/appearance.ts';
import { stampStandYards } from '../rotation/stand.ts';
import { firstOffensiveRotationRangeYd } from '../../autopilot/config.ts';
import { seedPrePullStealth } from './prePullStealth.ts';
import { seedReagentBagCounts } from '../../engine/combat/spellReagents.ts';

export type SquadRole = 'tank' | 'healer' | 'dps';

/** All signed dungeon roles — recruitCompanion / setSquadRole / setCompanionRole reject anything else. */
export const SQUAD_ROLES: readonly SquadRole[] = ['tank', 'healer', 'dps'] as const;

export function isSquadRole(v: unknown): v is SquadRole {
  return v === 'tank' || v === 'healer' || v === 'dps';
}

// S4C companion AoE knob: 'auto' keeps the default multi gates, 'aoe' prefers aoe-flagged spells
// at two or more enemies, and 'single' suppresses them.
export type CompanionAoeMode = 'auto' | 'aoe' | 'single';

/** Numeric encoding of CompanionAoeMode for rotation metric `aoeMode` (S4C). */
export const AOE_MODE_CODE = { auto: 0, aoe: 1, single: 2 } as const;

/** Active party size in the world and any 5-man. The 4 that walk a dungeon with you. */
export const MAX_COMPANIONS = 4;

// Companions that walk THIS instance with you — the sourced size minus the player, from
// instance_template.maxPlayers alone: 40, 20, 10 or 5. Cite: docs/archive/raids/PLAN.md §1.
export function maxCompanionsFor(maxPlayers: number | undefined): number {
  const n = (maxPlayers ?? MAX_COMPANIONS + 1) | 0;
  return Math.max(1, n - 1);
}

// Roster size — every companion you own, active or benched. 80 is two full AV teams, the largest
// thing a BG can ask for. Hiring past MAX_COMPANIONS benches rather than failing.
export const MAX_ROSTER = 80;

// D3 strategy toggles, the rest axis of the three DR knobs: careful rests to 95% before every pull,
// aggressive chains at 60%, and sip barely recovers at ~40%. Never HP multipliers.
export type SquadStrategy = 'careful' | 'aggressive' | 'sip';

export const SQUAD_PACING: Record<SquadStrategy, { restTo: number; healerBudgetFactor: number }> = {
  careful: { restTo: 0.95, healerBudgetFactor: 0.95 },
  aggressive: { restTo: 0.6, healerBudgetFactor: 0.6 },
  /** §8b.5 Sip ≈0.40 — "keep pulling, barely recover". */
  sip: { restTo: 0.4, healerBudgetFactor: 0.4 },
};

export interface Companion {
  id: string;
  name: string;
  race: number;
  cls: number;
  /** 0 = male, 1 = female (ai_playerbot_names convention). Optional: pre-D3.5 saves lack it. */
  gender?: 0 | 1;
  role: SquadRole;
  /** Deterministic per-companion stream seed (mini-sims, flavor). */
  seed: number;
  /** Gear the bot wears — spawn gear from its playerbot template plus what you've given. */
  equipped: EquippedMap;
  // Per-slot durability on the companion's paperdoll, the same DurabilityMap as Character. Absent
  // or empty means full; combat wear applies after each group fight and Repair all restores it.
  durability?: DurabilityMap;
  // TEMP_ENCHANTMENT_SLOT on the companion's hands — poison, oil, stone or imbue. Same shape as
  // Character.tempEnchants, cleared on weapon swap like the player's.
  tempEnchants?: TempEnchantMap;
  // D4 world-pool fields; absent on a pre-pool save, where the companion level-syncs to the player
  // until its first dungeon run. `level` is the bot's OWN level, grown by party XP, capped at 60.
  level?: number;
  /** XP into the current level (real player curve via progression/leveling). */
  xp?: number;
  // This companion's own faction standings (Faction.dbc id → absolute standing), sparse and the
  // same shape as Character.reputations. Absent means base standing per race and class.
  reputations?: Record<number, number>;
  // Per-faction FactionState flags for this companion (VISIBLE / AT_WAR / …). Same shape as
  // Character.factionFlags. Optional — pre-companion-rep saves omit it.
  factionFlags?: Record<number, number>;
  /** Premade playerbot spec index into ds.botSpecs(cls) — talents derive from it. */
  specIdx?: number;
  // Classic talent string from a named wiki loadout. When set, companionTalents spends this instead of
  // specIdx. Cleared by a premade spec or role restamp.
  talentLink?: string;
  // The bot's own bags and bank — THEIR loot, not yours: nothing here reaches a vendor or sell
  // path, which read the player's inventory only. Conjured items are the one take-back exception.
  bags?: Inventory;
  bank?: Inventory;
  bankBags?: BankBags;
  // Active pet (hunter beast / warlock demon) from playerbot InitPet. Absent on non-pet classes and pre-kit
  // hires.
  pet?: PetState;
  // Character-wide pet ability ranks (warlock grimoires / hunter training repertoire). Fed into buildPet
  // via a Character shell — same field as Character.petSpells.
  petSpells?: number[];
  // This companion's editable combat rotation, the same Rotation shape the player edits, driving
  // it as a real `ally_N` combatant. Absent lazily seeds the role-adapted class default.
  rotation?: Rotation;
  // Second rotation for a tank or healer companion — exactly the player's `rotationDps`, same
  // shape and builder. A pure-DPS companion has no second profile because its primary is one.
  rotationDps?: Rotation;
  /** Which of the two slots drives this companion. Absent → 'primary'. */
  rotationProfile?: RotationProfileId;
  /** Named rotation lists for this companion — same list the player owns, same rules. */
  rotationProfiles?: RotationProfile[];
  /** Which named profile drives this companion. Absent → the first. */
  activeRotationProfileId?: string;
  // Configured action bars for party takeover, the same ActionBar shape as the player's. Absent
  // seeds lazily. Keybinds at fight time overlay the PLAYER's bar keys by slot index.
  actionBars?: import('../character/actionbar.ts').ActionBar[];
  // This companion's Outfitter sets (same shape as GameState.outfitter). Absent ⇒ seeded on first open from
  // their current gear.
  outfitter?: import('./outfitter.ts').OutfitterState;
  // Pre-pull party buff auras this companion carries into each pull, so buffed stats flow through
  // companionCharacter. Transient run state, set fresh each run and pruned by wall-clock expiry.
  prePullAuras?: ActiveAura[];
  // This companion's own cooldowns as world-clock readyAt, exactly the shape the player's take.
  // Without it a companion re-fired every long CD on each mob. Absent or expired means ready.
  spellCooldowns?: Record<number, number>;
  categoryCooldowns?: Record<number, number>;
  // S4C (COMBAT-INTERACTION-V2): AoE ↔ single-target preference. Optional — pre-S4C saves omit it → {@link
  // resolveAoeMode} treats as `'auto'`.
  aoeMode?: CompanionAoeMode;
  // S4C: allow emergency off-heals for hybrid DPS/tank (has a heal, role ≠ healer). Optional — pre-S4C
  // saves omit it → {@link resolveOffHeal} uses class-appropriate default.
  offHeal?: boolean;
  // ICH1 kit tier at hire: naked, shabby, field, twink or one of the raid tiers. Spawn gear is
  // frozen into `equipped` at hire, so this stamp is for the badge, the hire cost and the XP lock.
  gearProfile?: GearProfile;
  // ICH4 XP lock. Missing or false levels normally; true makes every companion XP grant a no-op.
  // Hire defaults it on for twink and the raid tiers, off otherwise.
  xpLocked?: boolean;
  // Player-assigned trade skills, skill line → current value. Absent falls back to the
  // seed-derived set, which is what every pre-existing save and every fresh hire has.
  professions?: CompanionProfessionMap;
  // Trainer ranks this body holds, skill line → rank number (1 Apprentice … 4 Artisan). The cap is
  // derived from skill + level either way; this stamp only decides which rank-ups get announced.
  professionRanks?: Partial<Record<SkillLine, number>>;
  // Recipe ids this companion knows (trainer/vendor auto-catalog + recipes learned from items). Absent ⇒
  // empty until first syncCompanionProfessionCatalog. Optional on pre-craft saves.
  knownRecipes?: number[];
  // Enchant formula ids this companion knows (same catalog rules as knownRecipes). Optional on pre-craft
  // saves.
  knownEnchants?: number[];
  // Spells a book or tome taught THIS companion. Everything else in the kit derives from race,
  // class, level and spec, so these are the only spells that have to be stored.
  taughtSpells?: number[];
  // THIS companion's own quest log, same QuestLog shape as the player's. Status is per body, so a
  // quest you already turned in is still offerable to a companion who has not. Absent ⇒ empty.
  questLog?: QuestLog;
  // Send-out zone mission in flight, resolved by wall clock exactly like Character.journey, so it
  // closes correctly across a reload. Energy is shared on GameState.companionEnergy.
  mission?: CompanionMission;
  /** @deprecated Pre-revamp per-body energy, ignored — the party pool is GameState.companionEnergy. */
  energy?: number;
  /** @deprecated See energy. */
  energyAt?: number;
}

/** Effective AoE mode (legacy / unset → auto). */
export function resolveAoeMode(comp: Pick<Companion, 'aoeMode'>): CompanionAoeMode {
  return comp.aoeMode === 'aoe' || comp.aoeMode === 'single' ? comp.aoeMode : 'auto';
}

// ICH4: effective XP lock (missing → unlocked / false). Cite: docs/archive/INN-COMPANION-HIRE-DESIGN.md
// §4.2.
export function isXpLocked(comp: Pick<Companion, 'xpLocked'>): boolean {
  return comp.xpLocked === true;
}

// ICH4 hire default for `xpLocked` by kit profile. twink + raid-* → true; naked / shabby / field / unknown
// → false. Cite: docs/archive/INN-COMPANION-HIRE-DESIGN.md §4.3.
export function defaultXpLocked(profile: GearProfile | undefined): boolean {
  if (!profile) return false;
  return profile === 'twink' || isRaidGearProfile(profile);
}

// Class-appropriate default for the off-heal knob: true for the Classic hybrid healers, who keep
// heals while playing DPS or tank, false for pure DPS. Used only when Companion.offHeal is absent.
export function defaultOffHealForClass(cls: number): boolean {
  return (
    cls === CLASS.PALADIN
    || cls === CLASS.PRIEST
    || cls === CLASS.SHAMAN
    || cls === CLASS.DRUID
  );
}

/** Effective off-heal toggle (legacy / unset → class default). */
export function resolveOffHeal(comp: Pick<Companion, 'offHeal' | 'cls'>): boolean {
  return comp.offHeal ?? defaultOffHealForClass(comp.cls);
}

/** Rotation metric encoding of an AoE mode (0=auto, 1=aoe, 2=single). */
export function encodeAoeMode(mode: CompanionAoeMode): number {
  return AOE_MODE_CODE[mode];
}

// The inverse, for a provider rebuilt off-thread: the knob arrives as the code on the snapshot rather
// than as a live companion the worker cannot hold. Cite: PERF-RUNSHEET S6b.
export function decodeAoeMode(code: number | undefined): CompanionAoeMode {
  return code === 1 ? 'aoe' : code === 2 ? 'single' : 'auto';
}

/** A companion's effective level: its own, else legacy player-sync. */
export function companionLevel(comp: Companion, playerLevel: number): number {
  return Math.max(1, Math.min(60, comp.level ?? playerLevel));
}

// Companion names come from the playerbot name pool, the same list random bots on a playerbot
// server draw from. Deterministic by seed; a duplicate in the roster steps to the next name.
export interface BotNamePool { male: readonly string[]; female: readonly string[] }

const FALLBACK_NAMES: BotNamePool = {
  male: ['Bramwell', 'Dorn', 'Halric', 'Torvald', 'Aldwin', 'Garruk', 'Osmund', 'Cedric'],
  female: ['Kessa', 'Yvette', 'Mira', 'Senna', 'Petra', 'Liette', 'Runa', 'Wren'],
};

export function companionGender(seed: number): 0 | 1 {
  return (Math.abs(seed) >>> 3) % 2 === 0 ? 0 : 1;
}

export function companionName(pool: BotNamePool, seed: number, gender: 0 | 1, taken: readonly string[]): string {
  let list = gender === 1 ? pool.female : pool.male;
  if (list.length === 0) list = gender === 1 ? FALLBACK_NAMES.female : FALLBACK_NAMES.male;
  const start = Math.abs(seed) % list.length;
  for (let i = 0; i < list.length; i++) {
    const name = list[(start + i) % list.length]!;
    if (!taken.includes(name)) return name;
  }
  return `${list[start]!} II`;
}

export function addCompanion(squad: readonly Companion[], comp: Companion): Companion[] {
  if (squad.length >= MAX_COMPANIONS) return [...squad];
  if (squad.some((c) => c.id === comp.id)) return [...squad];
  return [...squad, comp];
}

/** How many companions you own in total — active party plus bench. */
export function rosterSize(
  squad: readonly Companion[] | undefined,
  roster: Readonly<Record<string, Companion>> | undefined,
): number {
  return (squad?.length ?? 0) + Object.keys(roster ?? {}).length;
}

// Place a hire: the active party when there is room, otherwise the bench. A hire that "succeeds"
// and changes nothing was the bug. `full` is returned only at MAX_ROSTER, which is a real refusal.
export function placeHire(
  squad: readonly Companion[],
  roster: Readonly<Record<string, Companion>> | undefined,
  comp: Companion,
): {
    squad: Companion[];
    roster: Record<string, Companion>;
    where: 'party' | 'roster' | 'duplicate' | 'full';
  } {
  const bench = { ...(roster ?? {}) };
  if (squad.some((c) => c.id === comp.id) || bench[comp.id]) {
    return { squad: [...squad], roster: bench, where: 'duplicate' };
  }
  if (rosterSize(squad, bench) >= MAX_ROSTER) {
    return { squad: [...squad], roster: bench, where: 'full' };
  }
  if (squad.length < MAX_COMPANIONS) {
    return { squad: [...squad, comp], roster: bench, where: 'party' };
  }
  bench[comp.id] = comp;
  return { squad: [...squad], roster: bench, where: 'roster' };
}

export function removeCompanion(squad: readonly Companion[], id: string): Companion[] {
  return squad.filter((c) => c.id !== id);
}

// Pick a race for a new companion: the first race of the player's faction whose create-info allows
// this class, data-driven and never hardcoded. Undefined when no faction race can play it.
export function companionRaceFor(ds: DataStore, playerRace: number, cls: number): number | undefined {
  return companionRacesFor(ds, playerRace, cls)[0];
}

// All races of the player's faction that can play `cls` (create-info matrix). Order follows the baked race
// table — never a hardcoded race/class list.
export function companionRacesFor(ds: DataStore, playerRace: number, cls: number): number[] {
  const team = factionOf(ds, playerRace);
  return ds.races()
    .filter((r) => factionOf(ds, r.id) === team && ds.createInfo(r.id, cls))
    .map((r) => r.id);
}

// Class ids the player's faction can field as companions: every class that at least one same-faction race
// has create-info for (data-driven matrix).
export function factionPlayableClasses(ds: DataStore, playerRace: number): number[] {
  const team = factionOf(ds, playerRace);
  const out: number[] = [];
  const seen = new Set<number>();
  for (const r of ds.races()) {
    if (factionOf(ds, r.id) !== team) continue;
    for (const cls of r.classes) {
      if (seen.has(cls)) continue;
      if (ds.createInfo(r.id, cls)) {
        seen.add(cls);
        out.push(cls);
      }
    }
  }
  return out;
}

/** Stable 32-bit FNV-1a over a zone id (same zone → same candidates). */
export function stableIdHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// The seed-derived trade skills of a body that is not hired yet — an inn slate candidate. The same
// call the hired companion makes, so the hire preview cannot drift from what the player buys.
export function hireSkillMap(
  seed: number,
  level: number,
  gearProfile: GearProfile | undefined,
): Character['skills'] {
  return applyTrainedCaps(
    companionProfessionSkills(seed, level, {
      maxed: gearProfile === 'twink' || isRaidGearProfile(gearProfile ?? 'field'),
    }),
    level,
  );
}

// The companion's trade skills: what the player assigned (`{}` = all unlearned), else the seed-derived
// set. The cap is the trainer rank they reached, so a line just taken up sits at 75 until skill 50.
export function companionSkillMap(comp: Companion, level: number): Character['skills'] {
  const assigned = comp.professions;
  if (assigned == null) {
    return hireSkillMap(comp.seed, level, comp.gearProfile);
  }
  const levelCap = professionSkillCap(level);
  const out: Character['skills'] = {};
  for (const [line, value] of Object.entries(assigned) as Array<[keyof Character['skills'], number]>) {
    const cur = Math.max(1, Math.min(levelCap, value | 0));
    const cap = companionSkillCap(line, cur, level);
    if (cap <= 0) continue;
    out[line] = { current: Math.min(cap, cur), max: cap };
  }
  return out;
}

/** A rank a companion just trained, for the log line. */
export interface CompanionRankTrained {
  line: SkillLine;
  rank: number;
  name: string;
  cap: number;
}

// Stamp the trainer ranks this body holds and report the new ones. A save with no stamp yet records
// what it had without announcing it, so an old roster does not spam the feed.
export function trainCompanionProfessionRanks(
  comp: Companion,
  level: number,
): CompanionRankTrained[] {
  const had = comp.professionRanks;
  const next: Partial<Record<SkillLine, number>> = {};
  const learned: CompanionRankTrained[] = [];
  for (const [line, cur] of Object.entries(companionSkillMap(comp, level)) as Array<
    [SkillLine, { current: number; max: number }]
  >) {
    if (line === 'poisons') continue;
    const rank = companionTrainedRank(line, cur.current, level);
    if (!rank) continue;
    next[line] = rank.rank;
    if (had && (had[line] ?? 0) < rank.rank) {
      learned.push({ line, rank: rank.rank, name: rank.name, cap: rank.cap });
    }
  }
  comp.professionRanks = next;
  return learned;
}

// Talent map this companion fights with: a saved wiki string when stamped, else the premade specIdx link,
// else nothing.
export function companionTalents(
  comp: Companion,
  level: number,
  ds: DataStore,
): Record<number, number> | undefined {
  const lvl = Math.max(1, level);
  if (comp.talentLink) {
    const fromLink = talentsFromLink(comp.talentLink, comp.cls, lvl, ds);
    if (Object.values(fromLink).some((n) => n > 0)) return fromLink;
  }
  const spec = comp.specIdx != null ? ds.botSpecs(comp.cls)[comp.specIdx] : undefined;
  return spec ? talentsForSpec(spec, comp.cls, lvl, ds) : undefined;
}

export function companionCharacter(comp: Companion, level: number, ds: DataStore): Character {
  // TEMP_ENCHANTMENT_SLOT plus oil equip auras (TYPE_EQUIP_SPELL) ride into the combat build,
  // mirroring the player path: the apply-spell chip and the equip aura share expiresAt.
  const tempEnchants = comp.tempEnchants
    ? {
        ...(comp.tempEnchants.mainhand ? { mainhand: { ...comp.tempEnchants.mainhand } } : {}),
        ...(comp.tempEnchants.offhand ? { offhand: { ...comp.tempEnchants.offhand } } : {}),
      }
    : undefined;
  const now = Date.now();
  const seedAuras: ActiveAura[] = comp.prePullAuras ? comp.prePullAuras.map((a) => ({ ...a })) : [];
  if (tempEnchants) {
    for (const hand of ['mainhand', 'offhand'] as const) {
      const te = tempEnchants[hand];
      if (!te) continue;
      if (te.expiresAt != null && te.expiresAt <= now) continue;
      seedAuras.push({ spellId: te.spellId, expiresAt: te.expiresAt });
      if (te.equipSpellId != null && te.equipSpellId > 0) {
        seedAuras.push({ spellId: te.equipSpellId, expiresAt: te.expiresAt });
      }
    }
  }
  const gender = comp.gender === 1 ? 1 : 0;
  const lvl = Math.max(1, level);
  const combatSkills = grantMaxedCombatSkillsForRaceClass(
    lvl,
    ds.combatSkillMeta?.(),
    comp.race,
    comp.cls,
  );
  const talents = companionTalents(comp, lvl, ds);
  const char: Character = {
    name: comp.name,
    race: comp.race,
    gender,
    // Same deterministic-by-name look as pool bots / paperdoll — never all-zero
    // DEFAULT_APPEARANCE (bald/hornless). Cite: domain/character/appearance.ts Wave R.
    appearance: deterministicAppearance(comp.name, comp.race, gender),
    cls: comp.cls,
    level: lvl,
    xp: comp.xp ?? 0,
    gold: 0,
    zoneId: '',
    health: 1,
    power: 0,
    equipped: { ...comp.equipped },
    ...(comp.durability ? { durability: { ...comp.durability } } : {}),
    activeBuffs: [],
    // Pre-pull party buffs ride along so buffed stats flow into maxHealth and buildCombatant.
    // Expiry is pruned by wall clock at read time, and temp-enchant equip auras seed here too.
    activeAuras: seedAuras,
    ...(tempEnchants && (tempEnchants.mainhand || tempEnchants.offhand) ? { tempEnchants } : {}),
    // W4: companions had `skills: {}`, so every item use-gate passed vacuously. Skills only — no
    // recipes or tools — because this runs on every rotation build. Twink and raid tiers max lines.
    skills: companionSkillMap(comp, lvl),
    knownRecipes: [],
    combatSkills,
    ...(talents ? { talents } : {}),
    ...(comp.reputations ? { reputations: { ...comp.reputations } } : {}),
    ...(comp.factionFlags ? { factionFlags: { ...comp.factionFlags } } : {}),
  };
  // A generated body never buys arrows, so nothing set `ammoItem` and buildCombatant's ammo gate
  // zeroed ranged damage for every companion hunter. Cite: Player.cpp:7591–7621.
  //
  // SHOOT WHAT THE BAGS HOLD. `generateSpawnInventory` stocks arrows with `getAmmo` (quality 1, the
  // highest requiredLevel that fits) and this line picked with `bestAmmoForWeapon` (best DPS) - two
  // selectors for one fact, and when they disagreed the quiver held one arrow and `ammoItem` named
  // another, so a real count read 0.
  {
    const rangedEntry = equippedEntry(char.equipped.ranged);
    const rangedItem = rangedEntry != null ? ds.item(rangedEntry) : undefined;
    const wanted = bestAmmoForWeapon(ds, rangedItem, lvl);
    const carried = (comp.bags?.stacks ?? [])
      .map((s) => s.item)
      .find((entry) => entry != null && ds.item(entry)?.ammoDps != null
        && checkAmmoCompatibility(rangedItem, ds.item(entry)));
    const ammo = carried ?? wanted;
    if (ammo != null) char.ammoItem = ammo;
  }
  char.health = maxHealth(char, ds);
  const pt = powerType(char);
  char.power = pt === 'rage' ? 0 : maxPower(char, ds);
  return char;
}

/** Per-DataStore memo: kit walks were O(zones+quests) per companionSpellbook call. */
type SpellbookMemo = {
  trainersByCls: Map<number, number[]>;
  talentOnlyByCls: Map<number, Set<number>>;
  classQuest: Map<string, number[]>;
  pending: Map<string, number[]>;
  book: Map<string, number[]>;
};
const spellbookMemo = new WeakMap<DataStore, SpellbookMemo>();

function memoFor(ds: DataStore): SpellbookMemo {
  let m = spellbookMemo.get(ds);
  if (!m) {
    m = {
      trainersByCls: new Map(),
      talentOnlyByCls: new Map(),
      classQuest: new Map(),
      pending: new Map(),
      book: new Map(),
    };
    spellbookMemo.set(ds, m);
  }
  return m;
}

function trainerEntriesForClass(ds: DataStore, cls: number): number[] {
  const m = memoFor(ds);
  const hit = m.trainersByCls.get(cls);
  if (hit) return hit;
  const entries = new Set<number>();
  for (const z of ds.zones()) {
    for (const t of z.trainers) if (t.cls === cls) entries.add(t.entry);
  }
  const synthetic = syntheticClassTrainerEntry(cls);
  if (ds.trainer(synthetic)?.spells?.length) entries.add(synthetic);
  const list = [...entries];
  m.trainersByCls.set(cls, list);
  return list;
}

function talentOnlyForClass(ds: DataStore, cls: number): Set<number> {
  const m = memoFor(ds);
  const hit = m.talentOnlyByCls.get(cls);
  if (hit) return hit;
  const talentOnly = new Set<number>();
  for (const tree of ds.talentTrees(cls) ?? []) {
    for (const tal of tree.talents ?? []) {
      for (const rank of tal.ranks ?? []) {
        if (rank.spellId) talentOnly.add(rank.spellId);
        for (const e of rank.effects ?? []) {
          if (e.kind === 'grant_spell' && typeof (e as { spellId?: number }).spellId === 'number') {
            talentOnly.add((e as { spellId: number }).spellId);
          }
        }
      }
    }
  }
  m.talentOnlyByCls.set(cls, talentOnly);
  return talentOnly;
}

function pendingTrainerSpells(
  ds: DataStore,
  race: number,
  cls: number,
  level: number,
): number[] {
  const key = `${race}|${cls}|${level}`;
  const m = memoFor(ds);
  const hit = m.pending.get(key);
  if (hit) return hit;
  const meta = ds.combatSkillMeta?.();
  const talentOnly = talentOnlyForClass(ds, cls);
  const pending: number[] = [];
  for (const entry of trainerEntriesForClass(ds, cls)) {
    for (const ts of ds.trainer(entry)?.spells ?? []) {
      if (ts.reqLevel > level) continue;
      const sid = resolveSpellId(ts.spell, ds);
      if (!ds.spell(sid)) continue;
      if (meta && !isSpellFitByClassAndRace(sid, race, cls, meta, level)) continue;
      if (talentOnly.has(sid)) continue;
      pending.push(sid);
    }
  }
  m.pending.set(key, pending);
  return pending;
}

function sweepTrainerRanks(
  known: Set<number>,
  pending: number[],
  ds: DataStore,
): void {
  for (;;) {
    let added = 0;
    for (let i = 0; i < pending.length; i++) {
      const sid = pending[i]!;
      if (sid < 0 || known.has(sid)) continue;
      const node = ds.spellChain?.(sid);
      if (node && ((node.prev && !known.has(node.prev)) || (node.req && !known.has(node.req)))) {
        continue;
      }
      known.add(sid);
      pending[i] = -1;
      added++;
    }
    if (!added) break;
  }
}

// Class-quest reward spells available at `level` for this race and class — vanilla teaches several
// kit spells only by quest. PLAYER characters must not use this free-grant; they earn on turn-in.
export function classQuestSpellsFor(
  race: number,
  cls: number,
  level: number,
  ds: DataStore,
): number[] {
  const lvl = Math.max(1, level);
  const ck = `${race}|${cls}|${lvl}`;
  const cached = memoFor(ds).classQuest.get(ck);
  if (cached) return cached;
  const out: number[] = [];
  const seen = new Set<number>();
  for (const q of ds.quests()) {
    const rew = q.rewSpells;
    if (!rew?.length) continue;
    if ((q.minLevel || 0) > lvl) continue;
    // Class gate: reqClass (single) or reqClassMask (multi-bit, KI-519).
    if (q.reqClass != null && q.reqClass !== cls) continue;
    if (q.reqClassMask != null && q.reqClassMask !== 0 && !raceClassMaskMatches(q.reqClassMask, cls)) {
      continue;
    }
    // Unclassed rewSpells quests are not auto-granted to bots (open-world rewards).
    if (q.reqClass == null && (q.reqClassMask == null || q.reqClassMask === 0)) continue;
    if (q.reqRaceMask != null && q.reqRaceMask !== 0 && !raceClassMaskMatches(q.reqRaceMask, race)) {
      continue;
    }
    for (const sid of rew) {
      if (seen.has(sid) || !ds.spell(sid)) continue;
      seen.add(sid);
      out.push(sid);
    }
  }
  memoFor(ds).classQuest.set(ck, out);
  return out;
}

// A companion's spellbook: create-info spells, everything the class trainers teach up to `level`,
// talent grants, class-quest rewSpells and `taughtSpells`, all under the race/class fit gate.
export function companionSpellbook(comp: Companion, level: number, ds: DataStore): SpellBook {
  const lvl = Math.max(1, level);
  const specIdx = comp.specIdx ?? -1;
  // Book-taught ranks are per-BODY, so they are part of the memo key — the rest of the key
  // (race/class/level/spec) is shared by every companion of that shape.
  const taught = comp.taughtSpells?.length ? [...new Set(comp.taughtSpells)].sort((a, b) => a - b) : [];
  const linkKey = comp.talentLink ?? '';
  const bookKey = `${comp.race}|${comp.cls}|${lvl}|${specIdx}|${linkKey}|${taught.join(',')}`;
  const memo = memoFor(ds);
  const hit = memo.book.get(bookKey);
  if (hit) return { known: hit.slice() };

  const known = new Set<number>(ds.createInfo(comp.race, comp.cls)?.spells ?? []);
  // Class-quest kit (stances, Taunt, pets, forms…) — before trainer sweep so
  // chain-gated trainer ranks that require a quest-taught root can open.
  for (const sid of classQuestSpellsFor(comp.race, comp.cls, lvl, ds)) known.add(sid);
  // Tomes / books / codices read on this body, seeded before the sweep for the same reason.
  for (const sid of taught) if (ds.spell(sid)) known.add(sid);

  // Slice: sweepTrainerRanks tombstones in place. Cite: Player.cpp:3974–3982 GetTrainerSpellState.
  const pending = pendingTrainerSpells(ds, comp.race, comp.cls, lvl).slice();
  sweepTrainerRanks(known, pending, ds);

  // Talent-granted actives (Inner Focus, etc.) — wiki string when stamped, else premade spec.
  // Cite: Player::LearnTalent → learnSpell.
  const talents = companionTalents(comp, lvl, ds);
  if (talents) {
    for (const sid of talentGrantedSpellIds({ talents } as Character, ds)) {
      if (ds.spell(sid)) known.add(sid);
    }
    sweepTrainerRanks(known, pending, ds);
  }

  const book = [...known].sort((a, b) => a - b);
  memo.book.set(bookKey, book);
  return { known: book.slice() };
}

/** Warrior stance spell ids (spell_template 1.12). */
const BATTLE_STANCE_SPELL = 2457;
const DEFENSIVE_STANCE_SPELL = 71;
const BERSERKER_STANCE_SPELL = 2458;

// Default stance for a warrior companion: tanks prefer Defensive when known; everyone else Battle; fall
// back to whichever stance they know. Classic warriors are never formless once a stance is known.
function companionWarriorForm(
  role: SquadRole,
  known: readonly number[],
): number | undefined {
  const has = (id: number) => known.includes(id);
  if (role === 'tank' && has(DEFENSIVE_STANCE_SPELL)) return SHAPESHIFT_FORM.DEFENSIVESTANCE;
  if (has(BATTLE_STANCE_SPELL)) return SHAPESHIFT_FORM.BATTLESTANCE;
  if (has(DEFENSIVE_STANCE_SPELL)) return SHAPESHIFT_FORM.DEFENSIVESTANCE;
  if (has(BERSERKER_STANCE_SPELL)) return SHAPESHIFT_FORM.BERSERKERSTANCE;
  return undefined;
}

// Full combat spec via the shared player derivation. `stealthForPull` is the party's engage moment
// and is off by default; `spellCooldowns` is the world clock, so a chain-pull arrives unstealthed.
export function companionSpec(
  comp: Companion,
  level: number,
  ds: DataStore,
  opts?: {
    stealthForPull?: boolean;
    spellCooldowns?: Record<number, number>;
    now?: number;
    /** formId read off this seat's own pull phase (`openerFormOf`, arenaLab.ts). */
    openerForm?: number;
  },
): CombatantSpec {
  const char = companionCharacter(comp, level, ds);
  const sb = companionSpellbook(comp, level, ds);
  // Warriors always need a stance in Classic; tanks start in Defensive when known.
  if (comp.cls === CLASS.WARRIOR && !((char.form ?? 0) | 0)) {
    const form = companionWarriorForm(comp.role, sb.known);
    if (form != null) char.form = form;
  }
  // Open IN the form the list opens with instead of spending the first GCD entering it. The form
  // package rides spec.form already (fighterFactory.ts:794); the caller derives the id, never a default.
  if (opts?.openerForm && !((char.form ?? 0) | 0)) char.form = opts.openerForm | 0;
  // Seeded as an aura, not as spec.stealth: buildCombatant's activeStealthAura already derives
  // strength / level bonus / break flags, and the same read puts the chip on the party frame.
  if (opts?.stealthForPull) {
    seedPrePullStealth(char, sb, ds, { spellCooldowns: opts.spellCooldowns, now: opts.now });
  }
  // WITH the bags, because ammo is counted out of them: without an inventory buildCombatant takes
  // its "no inv -> assume present for unit tests" fallback of ONE arrow, and every companion hunter
  // fired once and then read `no ammo` for the rest of the fight. `generateSpawnInventory` already
  // stocks 5 + level/10 stacks of 200 (InitAmmo, botInventory.ts:401-416); nothing was reading them.
  const spec = buildCombatant(char, sb, ds, comp.bags ?? emptyInventory());
  // S4C single-target knob also suppresses the motion PBAoE pack walk-in.
  spec.packClose = resolveAoeMode(comp) !== 'single';
  spec.groupRole = comp.role === 'dps' ? 'damage' : comp.role;
  {
    const rot = comp.rotation;
    const bot = comp.specIdx != null ? ds.botSpecs(comp.cls)[comp.specIdx] : undefined;
    stampStandYards(spec, {
      explicit: rot?.standYards,
      specName: rot?.autoSig?.spec ?? bot?.name,
      offenseYd: rot ? firstOffensiveRotationRangeYd(rot, (id) => ds.spell(id)) : null,
    });
  }
  // Consumables in the companion's own bags enter the fight, and equipped on-use gear does too so
  // takeover bar slots can fire it — its count is high because personal CD is the real gate.
  const bags = comp.bags ?? emptyInventory();
  const bagItems = combatItems(char, bags, ds);
  const byEntry = new Map(bagItems.map((it) => [it.entry, it]));
  for (const slot of Object.keys(char.equipped) as Array<keyof typeof char.equipped>) {
    const entry = equippedEntry(char.equipped[slot]);
    if (entry == null || byEntry.has(entry)) continue;
    const it = ds.item(entry);
    if (!it || !(it.useInCombat || it.useBuff || it.useSpell != null)) continue;
    // Reuse combatItems' classification via a one-stack bag shell.
    const synthetic = combatItems(char, { stacks: [{ item: entry, count: 1 }] }, ds);
    const row = synthetic.find((x) => x.entry === entry);
    if (row) byEntry.set(entry, { ...row, count: 99 });
  }
  const items = [...byEntry.values()];
  if (items.length > 0) spec.items = items;
  // CheckItems / TakeReagents snapshot, the same seed the player gets at combatSession.ts:779. Without
  // it a companion's reagent spells were free: `canPaySpellReagents` allows anyone with no bag counts.
  {
    const bag = seedReagentBagCounts(spec.spells, (item) => countItem(bags, item));
    if (bag) spec.bagItemCounts = bag;
  }
  return spec;
}

// CombatantSpec for a companion's active pet, or null. Uses the same buildPet path as the player,
// and is appended after the human allies so ally_0..n-1 stay index-aligned with state.squad.
export function companionPetSpec(comp: Companion, level: number, ds: DataStore): CombatantSpec | null {
  if (!comp.pet || comp.pet.health <= 0) return null;
  const char: Character = {
    ...companionCharacter(comp, level, ds),
    pet: comp.pet,
    petSpells: comp.petSpells ?? [],
  };
  const pet = buildPet(char, ds);
  if (!pet) return null;
  // Pets fight as damage allies (factory autocasts offensive pet spells).
  pet.groupRole = 'damage';
  return pet;
}

// Healer throughput from the spec's REAL heal spells: best direct heal by average, HPS over its
// cast time, and total healing the mana pool can pay for. A healer with no heals reports zeros.
export function healerThroughput(spec: CombatantSpec): {
  hps: number;
  healingBudget: number;
  healName?: string;
} {
  let best: { avg: number; castMs: number; cost: number; name: string } | undefined;
  for (const s of spec.spells) {
    for (const e of s.effects) {
      if (e.kind !== 'heal') continue;
      const heal = e as { min?: number; max?: number };
      const avg = ((heal.min ?? 0) + (heal.max ?? heal.min ?? 0)) / 2;
      if (avg <= 0) continue;
      if (!best || avg > best.avg) {
        best = { avg, castMs: Math.max(s.castTimeMs || 0, 1500), cost: Math.max(0, s.cost), name: s.name };
      }
    }
  }
  if (!best) return { hps: 0, healingBudget: 0 };
  const hps = best.avg / (best.castMs / 1000);
  const casts = best.cost > 0 ? Math.floor(spec.maxPower / best.cost) : Number.POSITIVE_INFINITY;
  const healingBudget = Number.isFinite(casts) ? casts * best.avg : Number.POSITIVE_INFINITY;
  return { hps, healingBudget, healName: best.name };
}
