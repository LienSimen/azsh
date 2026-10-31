// Autopilot tuning config, split out so the engine/GameState can persist it without importing
// the planner (which imports GameState — this module has no such import, so no cycle). The
// visual settings UI edits these; the planner (plan.ts) and driver read them.

import type { QuestRewardChoiceMode } from '../domain/quests/questRewardChoice.ts';
import { normalizeRaidPlan, type RaidPlan } from '../domain/raid/raidPlan.ts';
import { setRaidRowYd } from '../domain/raid/raidPlanEdits.ts';
import { normalizeRaidCustomRows, type RaidCustomRow } from '../domain/raid/raidCustomRows.ts';

export type { QuestRewardChoiceMode };
export type { RaidPlan };
export type { RaidCustomRow };

/** Player auto-combat AoE policy (mirrors companion S4C aoeMode). */
export type AutopilotAoeMode = 'auto' | 'aoe' | 'single';

/**
 * Auto-combat movement policy — how the engine may reposition you mid-fight.
 * No policy backpedals: the AI only ever CLOSES, and taking distance is the player's
 * (held key, click order, hold stance). The removed 'kite' policy and the 'auto' tiny
 * walkback are why the party whirled on a retreat ring around a moving mob.
 * - auto — melee kits close in; ranged kits hold their band and stand
 * - hold — never auto-move; enemies come to you
 * - melee — always close to melee reach
 */
export type AutopilotMovement = 'auto' | 'hold' | 'melee';

/**
 * How the player wants to play auto-combat in a group.
 * - dps — never auto-taunt; optional threat dumps when you pull aggro (rule-driven)
 * - tank — hold threat; taunts when the target is not on you
 * - offtank — peel loose mobs (taunt/CC when target is on someone else / on you)
 */
export type AutopilotCombatRole = 'dps' | 'tank' | 'offtank';

/**
 * Auto Quest travel policy when nothing is advanceable in the current zone.
 * - `level-safe` — only route to a zone whose level floor is within reach (see questLevelAbove)
 * - `any` — route wherever the acquisition graph points
 * - `off` — never leave the zone; stop with the honest reason instead
 */
export type AutoQuestZoneSwap = 'level-safe' | 'any' | 'off';

/**
 * What Auto Quest does with a quest whose kill targets are elite (creature rank ≥ 1).
 * - `squad` — bring the hired companions into those pulls; skip the quest when the squad is empty
 * - `skip` — never take them (and ignore ones already in the log)
 * - `solo` — take them alone, as the run always did
 */
export type AutoQuestEliteMode = 'squad' | 'skip' | 'solo';

export interface AutopilotConfig {
  autoEat: boolean;
  autoDrink: boolean;
  healthEnterPct: number; // 0..1 — start recovering below this health fraction
  manaEnterPct: number;   // 0..1 — mana users start recovering below this (ignored for rage)
  recoverToPct: number;   // 0..1 — recover until at least this fraction (hysteresis)
  sessionMs: number;      // hard time cap (default 1 hour)
  restMode: 'eat-then-wait' | 'eat-only';
  /**
   * Stop the whole autopilot after this many losses in a row (farm / non-quest deaths).
   * Auto Quest also uses this as the per-quest death cap: that many defeats while advancing
   * one quest skips that quest for the session and continues with the next.
   */
  maxConsecutiveDefeats: number;
  combatSpeed: 1 | 2 | 4; // engine ticks per animation frame while auto-fighting (watchable → fast)
  keepSoulShards: number; // warlock: auto-combat stops casting Drain Soul once you hold this many shards (0 = never farm)
  /** @deprecated Prefer global Settings junkFilter.autoSell; kept as mirror for older saves/UI. */
  autoSellGrays: boolean;
  stopAtLevel: number;    // end the session once the character reaches this level (0 = no cap)
  /**
   * Shaman: keep re-casting the AIR totem so a triggered weapon buff stacks with the next air
   * totem's aura ("totem twisting"). Windfury's kit hands the party a 10s weapon enchant that
   * `Totem::UnSummon` cannot remove (it strips only GetSpell()), so dropping Grace of Air on top
   * leaves both running. Off by default — it is a deliberate, mana-hungry play style.
   * Cite: Entities/Totem.cpp UnSummon :131–158; SpellEffects.cpp EffectEnchantHeldItem.
   */
  totemTwisting: boolean;
  /**
   * Player multi-target policy for auto-combat (companion knobs already had this).
   * `auto` — enemyCount gates only; `aoe` — prefer multi-target when ≥2 living; `single` —
   * suppress multi-target / cleave tools even when packs are up.
   */
  aoeMode: AutopilotAoeMode;
  /**
   * Hybrid DPS off-heals the most-hurt ally when the healer is dead or dry (`offHealAllowed`).
   * Default on; a saved false stays off. Solo: no healer seat, so healerPowerPct is false.
   */
  offHeal: boolean;
  /**
   * Threat watch: as a DPS, stop damaging the moment an enemy is actually on you, and resume
   * when the tank has it back. Implemented as a live-injected `halt_dps` rule gated on
   * `hasAggro == 1` — the same vocabulary a raid tactic row uses, and the same live-inject shape
   * as {@link AutopilotConfig.offHeal}, so it is one code path rather than a second brain. The
   * injected rule is per-tick, not saved: this knob is where the player turns it off.
   *
   * It stops ABILITIES, not auto-attack — a halt yields the tick to the next non-damaging rule,
   * and no action means white swings continue (same as the companion halt).
   *
   * Off by default: solo and 5-man DPS pull their own aggro constantly and there is nobody to
   * hand it to, so holding damage there would just stop the fight. Ignored for tank / offtank,
   * whose whole job is to hold threat.
   */
  threatWatch: boolean;
  /** Group combat stance for auto-taunt / peel policy. */
  combatRole: AutopilotCombatRole;
  /** Mid-fight auto-repositioning policy (see {@link AutopilotMovement}). */
  movement: AutopilotMovement;
  /**
   * Prefer crowd-control / interrupts on casting targets when a CC rule has no cast gate
   * of its own (live inject). Freedom to sheep/poly/kick casters without hand-authoring
   * every rule — turn off to CC anything anytime the rule says so.
   */
  ccPreferCasters: boolean;
  /**
   * Yards from the primary enemy at fight open (combat seed distance).
   * - `0` — auto: first **offensive attack** rangeMax in pull then combat, capped at
   *   PULL_OPEN_YARDS_MAX; else creature detection
   * - `-1` — max: same as auto (kept for saved configs / explicit "use spell range" label)
   *   (skips friendly prep — shields, self buffs, heals — not spell-name hardcodes)
   * - `5..40` — fixed yards
   */
  pullOpenYards: number;
  /** Ordinary mobs per outdoor pull on a run (Autofarm / Auto Quest). Default 1. */
  pullNormalCount: number;
  /** Generic elites per run pull. World bosses, rares, and unique named elites always pull alone. */
  pullEliteCount: number;
  /** The Attack button's own pair: a hand pull is the player's own decision, so it has its own dial. */
  pullAttackNormalCount: number;
  /** Elites the Attack button opens on. Same named-solo rule as the run pair. */
  pullAttackEliteCount: number;
  /**
   * Multi-choice quest rewards (RewChoiceItemId 1..6) during Auto Quest.
   * - `auto` (default) — best equipment-helper upgrade among choices; if none, highest vendor sell value
   * - `wait` — pause the session and show one button per choice (≤1 choice never pauses)
   */
  questRewardChoice: QuestRewardChoiceMode;

  // ---- Auto Quest setup (the quest run's own policy; farm mode ignores these) ----
  /** Accept new quests offered where the run stands. Off = only work what is already in the log. */
  questAutoAccept: boolean;
  /** Travel policy once nothing is advanceable here (see {@link AutoQuestZoneSwap}). */
  questZoneSwap: AutoQuestZoneSwap;
  /** Elite kill-target policy (see {@link AutoQuestEliteMode}). */
  questEliteMode: AutoQuestEliteMode;
  /**
   * Companions join EVERY auto pull, not just elite ones. Outdoor `beginFight` is solo by
   * default — the squad only ever fought in dungeons — so this is off unless asked for.
   * Kill XP for companions is granted on any outdoor win either way (combatSession
   * applyCompanionKillXp), so this changes combat power only.
   */
  questSquadAlways: boolean;
  /** Same quests as you: accept, credit, turn in; pickQuestRewardIndex for RewChoiceItem. */
  questSquadShare: boolean;
  // How many levels BELOW the character a quest may be and still be auto-accepted. Default 2. 0 = no lower
  // limit. Gray is skipped unless a later quest in the chain still sits in this band.
  questLevelBelow: number;
  /**
   * How many levels ABOVE the character a quest may be and still be auto-accepted, and the
   * number `level-safe` zone swap uses for how far above you a zone's level floor may sit.
   * Default 2. 0 = no upper limit.
   */
  questLevelAbove: number;
  /** Abandon a quest when the run skips it (manual Skip / defeat cap) so the log does not fill. Default on. */
  questSkipAbandon: boolean;
  /**
   * Mine and herb ready nodes in the zone the run is standing in (party skill + tool, same
   * gate as fight-end auto-skin). Off = skip veins and herbs. Default on.
   */
  autoGather: boolean;
  // Editable raid assignments (E6) — MT / OT / camps / heal subgroups. Absent → callers build from the live
  // roster via `buildRaidPlan`. Shape from `src/domain/raid/raidPlan.ts` (BgRole / BgOrder copy).
  raidPlan?: RaidPlan | null;
  /**
   * The roster the player arranged by hand on the Raid tab: `Companion.id` (or `player`) →
   * 0-based subgroup. Keyed by identity, not by seat, because dismissing a companion
   * renumbers every `ally_N` after it. Absent → `raidSubgroupPlan` seats everyone.
   */
  raidSeating?: Readonly<Record<string, number>> | null;
  /** Baked raid tactic rows the player switched OFF, by rule id. */
  raidRowsOff?: readonly string[];
  /** Raid tactics the player wrote themselves (`src/domain/raid/raidCustomRows.ts`). */
  raidRows?: readonly RaidCustomRow[];
  // Distances the player retuned on a SHIPPED plan row, by rule id. The pack's number is the sourced
  // default; this is the player disagreeing with it, and it never edits the pack.
  raidRowYd?: Readonly<Record<string, number>>;
}

/**
 * Coerce a stored hand-arranged roster. Only the shape is checked here: how many groups a
 * roster of this size actually has is `raidComp.applyRaidSeatingOverrides`'s call, and that
 * module cannot be imported from here (it reaches this file back through domain/bots/squad.ts).
 */
function normalizeRaidSeating(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[key] = Math.max(Math.floor(value), 0);
  }
  return Object.keys(out).length ? out : null;
}

/** Upper bound for the Soul Shard cap (classic soul bag holds 32); the UI stepper stays well under this. */
export const MAX_SOUL_SHARD_CAP = 32;

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  autoEat: true,
  autoDrink: true,
  healthEnterPct: 0.75,
  manaEnterPct: 0.75,
  recoverToPct: 1,
  sessionMs: 60 * 60 * 1000,
  restMode: 'eat-then-wait',
  maxConsecutiveDefeats: 3,
  combatSpeed: 2,
  keepSoulShards: 2, // farm a small stock, then stop — Drain Soul is a channel wasted when you're topped off
  autoSellGrays: true, // greys are vendor trash; quest-needed items are protected by sellAllJunk
  stopAtLevel: 0,
  totemTwisting: false,
  aoeMode: 'auto',
  offHeal: true,
  threatWatch: false,        // DPS threat throttle — see AutopilotConfig.threatWatch
  combatRole: 'dps',
  movement: 'auto',
  ccPreferCasters: true,
  // auto = first offensive spell range (Frostbolt 30, Charge 25); creature detection if none
  pullOpenYards: 0,
  pullNormalCount: 1,
  pullEliteCount: 1,
  pullAttackNormalCount: 1,
  pullAttackEliteCount: 1,
  questRewardChoice: 'auto',
  questAutoAccept: true,
  questZoneSwap: 'level-safe',
  questEliteMode: 'squad',
  questSquadAlways: false,
  questSquadShare: true,
  questLevelBelow: 2, // ±2 is even-con (difficultyTier 'yellow') — the winnable band
  questLevelAbove: 2,
  questSkipAbandon: true,
  autoGather: true,
  raidPlan: null,
  raidSeating: null,
  raidRowsOff: [],
  raidRows: [],
  raidRowYd: {},
};

/** Coerce the retuned distances. A row id with no usable number is dropped, not defaulted. */
function normalizeRaidRowYd(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  let out: Record<string, number> = {};
  // `null` default: a stored id is kept as written. The pack's own number is not reachable here
  // (that would pull the tactics table into the config module) and the Raid tab already drops
  // an override the moment the player presses the sourced chip.
  for (const [id, v] of Object.entries(raw)) {
    if (!id || typeof v !== 'number' || !Number.isFinite(v)) continue;
    out = setRaidRowYd(out, id, v, null);
  }
  return out;
}




/** Fixed pull-open yard presets in the rotation/autopilot editor (plus auto / max). */
export const PULL_OPEN_YARD_OPTIONS = [5, 8, 10, 15, 20, 25, 30, 35, 40] as const;
export const PULL_OPEN_AUTO = 0;
export const PULL_OPEN_MAX = -1;
export const PULL_OPEN_YARDS_MIN = 5;
export const PULL_OPEN_YARDS_MAX = 40;

/** Session time-cap presets (minutes) shown in the auto-setup editor. 0 = no cap. */
export const SESSION_MINUTES_OPTIONS = [0, 15, 30, 60, 120, 240] as const;

/** Max consecutive losses before autopilot stops (UI stepper). */
export const MAX_CONSECUTIVE_DEFEATS_CAP = 10;

/** Outdoor AoE pull size (ordinary / elite). Named bosses stay 1 regardless. */
export const PULL_COUNT_MIN = 1;
/** Preset buttons on the pull dial. Custom accepts any integer through PULL_COUNT_MAX. */
export const PULL_COUNT_PRESET_MAX = 8;
export const PULL_COUNT_MAX = 50;

/** Which pair a pull reads. The Attack button and a run each carry their own two counts. */
export type PullSurface = 'auto' | 'attack';

export function pullCountsFor(
  cfg: AutopilotConfig, surface: PullSurface,
): { pullNormalCount: number; pullEliteCount: number } {
  return surface === 'attack'
    ? { pullNormalCount: cfg.pullAttackNormalCount, pullEliteCount: cfg.pullAttackEliteCount }
    : { pullNormalCount: cfg.pullNormalCount, pullEliteCount: cfg.pullEliteCount };
}

/** Level cap for the stopAtLevel stepper (vanilla's max level). */
export const MAX_STOP_AT_LEVEL = 60;

/** Cap for the "levels from your level" stepper in Auto Quest setup. */
export const MAX_QUEST_LEVEL_BAND = 20;

/** Coerce arbitrary stored JSON into a valid config, filling any missing field from the default. */
export function normalizeAutopilotConfig(raw: unknown): AutopilotConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AutopilotConfig>;
  const num = (v: unknown, d: number): number => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const D = DEFAULT_AUTOPILOT_CONFIG;
  const aoeMode: AutopilotAoeMode =
    r.aoeMode === 'aoe' || r.aoeMode === 'single' ? r.aoeMode : 'auto';
  const combatRole: AutopilotCombatRole =
    r.combatRole === 'tank' || r.combatRole === 'offtank' ? r.combatRole : 'dps';
  // Saved 'kite' configs normalize to 'auto' — the policy it named no longer exists.
  const movement: AutopilotMovement =
    r.movement === 'hold' || r.movement === 'melee' ? r.movement : 'auto';
  // pullOpenYards: 0 = auto, -1 = max offensive spell, else clamp 5..40
  let pullOpenYards = Math.round(num(r.pullOpenYards, D.pullOpenYards));
  if (pullOpenYards !== PULL_OPEN_AUTO && pullOpenYards !== PULL_OPEN_MAX) {
    pullOpenYards = clamp(pullOpenYards, PULL_OPEN_YARDS_MIN, PULL_OPEN_YARDS_MAX);
  }
  const questZoneSwap: AutoQuestZoneSwap =
    r.questZoneSwap === 'any' || r.questZoneSwap === 'off' ? r.questZoneSwap : 'level-safe';
  const questEliteMode: AutoQuestEliteMode =
    r.questEliteMode === 'skip' || r.questEliteMode === 'solo' ? r.questEliteMode : 'squad';
  return {
    autoEat: typeof r.autoEat === 'boolean' ? r.autoEat : D.autoEat,
    autoDrink: typeof r.autoDrink === 'boolean' ? r.autoDrink : D.autoDrink,
    healthEnterPct: num(r.healthEnterPct, D.healthEnterPct),
    manaEnterPct: num(r.manaEnterPct, D.manaEnterPct),
    recoverToPct: num(r.recoverToPct, D.recoverToPct),
    sessionMs: Math.max(0, num(r.sessionMs, D.sessionMs)),
    restMode: r.restMode === 'eat-only' ? 'eat-only' : 'eat-then-wait',
    maxConsecutiveDefeats: Math.round(clamp(num(r.maxConsecutiveDefeats, D.maxConsecutiveDefeats), 1, MAX_CONSECUTIVE_DEFEATS_CAP)),
    combatSpeed: r.combatSpeed === 1 || r.combatSpeed === 4 ? r.combatSpeed : 2,
    keepSoulShards: Math.round(clamp(num(r.keepSoulShards, D.keepSoulShards), 0, MAX_SOUL_SHARD_CAP)),
    totemTwisting: typeof r.totemTwisting === 'boolean' ? r.totemTwisting : D.totemTwisting,
    autoSellGrays: typeof r.autoSellGrays === 'boolean' ? r.autoSellGrays : D.autoSellGrays,
    stopAtLevel: Math.round(clamp(num(r.stopAtLevel, D.stopAtLevel), 0, MAX_STOP_AT_LEVEL)),
    aoeMode,
    offHeal: typeof r.offHeal === 'boolean' ? r.offHeal : D.offHeal,
    threatWatch: typeof r.threatWatch === 'boolean' ? r.threatWatch : D.threatWatch,
    combatRole,
    movement,
    ccPreferCasters: typeof r.ccPreferCasters === 'boolean' ? r.ccPreferCasters : D.ccPreferCasters,
    pullOpenYards,
    pullNormalCount: Math.round(clamp(num(r.pullNormalCount, D.pullNormalCount), PULL_COUNT_MIN, PULL_COUNT_MAX)),
    pullEliteCount: Math.round(clamp(num(r.pullEliteCount, D.pullEliteCount), PULL_COUNT_MIN, PULL_COUNT_MAX)),
    pullAttackNormalCount: Math.round(clamp(num(r.pullAttackNormalCount, D.pullAttackNormalCount), PULL_COUNT_MIN, PULL_COUNT_MAX)),
    pullAttackEliteCount: Math.round(clamp(num(r.pullAttackEliteCount, D.pullAttackEliteCount), PULL_COUNT_MIN, PULL_COUNT_MAX)),
    // Default auto. `wait` only when the player explicitly chose pause-and-pick in settings.
    // (First ship defaulted to wait but ended the session with no reward buttons — that is fixed
    // in the autopilot controller; missing/unknown still coerces to auto.)
    questRewardChoice: r.questRewardChoice === 'wait' ? 'wait' : 'auto',
    questAutoAccept: typeof r.questAutoAccept === 'boolean' ? r.questAutoAccept : D.questAutoAccept,
    questZoneSwap,
    questEliteMode,
    questSquadAlways: typeof r.questSquadAlways === 'boolean' ? r.questSquadAlways : D.questSquadAlways,
    questSquadShare: typeof r.questSquadShare === 'boolean' ? r.questSquadShare : D.questSquadShare,
    questLevelBelow: Math.round(clamp(num(r.questLevelBelow, D.questLevelBelow), 0, MAX_QUEST_LEVEL_BAND)),
    questLevelAbove: Math.round(clamp(num(r.questLevelAbove, D.questLevelAbove), 0, MAX_QUEST_LEVEL_BAND)),
    questSkipAbandon: typeof r.questSkipAbandon === 'boolean' ? r.questSkipAbandon : D.questSkipAbandon,
    autoGather: typeof r.autoGather === 'boolean' ? r.autoGather : D.autoGather,
    raidPlan: normalizeRaidPlan(r.raidPlan) ?? null,
    raidSeating: normalizeRaidSeating(r.raidSeating),
    raidRowsOff: Array.isArray(r.raidRowsOff)
      ? r.raidRowsOff.filter((id) => typeof id === 'string' && id.length > 0)
      : [],
    raidRows: normalizeRaidCustomRows(r.raidRows),
    raidRowYd: normalizeRaidRowYd(r.raidRowYd),
  };
}

/** Thin spell shape for pull-open range (no full SpellDef import cycle). */
export type PullRangeSpellLike = {
  rangeMax?: number | null;
  rangeMin?: number | null;
  cooldownMs?: number | null;
  role?: string | null;
  effects?: ReadonlyArray<{ kind: string; hostile?: boolean; amount?: number; pct?: number }> | null;
};

/**
 * True when this spell is an **offensive attack** — a hostile cast aimed at the enemy
 * (damage, DoT, drain, hostile CC/interrupt/taunt, charge, strike…).
 *
 * Friendly prep is NOT an offensive attack even when it has a large `rangeMax`
 * (e.g. empty-effect absorb shields, self buffs, heals). No spell-name hardcodes.
 * Empty effect rows with no offensive role → not an attack (bake gaps stay non-offensive).
 *
 * Note: do not early-reject role `buff` — Faerie Fire / Sunder are hostile armor debuffs
 * with role buff (or inferred buff) and must still set pull open range.
 */
export function isOffensiveAttackSpell(sp: PullRangeSpellLike | null | undefined): boolean {
  if (!sp) return false;
  const role = (sp.role ?? '').toLowerCase();
  // Roles that are never an attack on the enemy (friendly prep / self utility).
  if (
    role === 'heal' || role === 'hot' || role === 'absorb'
    || role === 'summon' || role === 'totem_summon' || role === 'pet_heal' || role === 'pet_summon'
    || role === 'conjure' || role === 'form' || role === 'stealth' || role === 'seal'
  ) {
    return false;
  }
  // Roles that are always offensive attacks when present.
  if (
    role === 'nuke' || role === 'instant_nuke' || role === 'strike' || role === 'charge'
    || role === 'dot' || role === 'judgement' || role === 'shoot'
  ) {
    return true;
  }

  const effects = sp.effects ?? [];
  // Charge / Intercept / Feral Charge: bake often leaves role empty; payload is trigger_spell only.
  // Same discriminator as inferRole (roles.ts): mid range + long CD + no direct hostile effect.
  if (
    effects.some((e) => e.kind === 'trigger_spell')
    && (sp.rangeMax ?? 0) >= 8
    && (sp.cooldownMs ?? 0) >= 10_000
    && !effects.some((e) =>
      e.kind === 'root' || e.kind === 'cc' || e.kind === 'interrupt_cast'
      || e.kind === 'dot' || e.kind === 'direct_damage' || e.kind === 'buff' || e.kind === 'heal',
    )
  ) {
    return true;
  }

  if (effects.length === 0) {
    // control/utility with no effects: only treat control as attack if role says so
    return role === 'control';
  }

  // Friendly / self-only effect kinds — never an offensive attack by themselves.
  const FRIENDLY_ONLY = new Set([
    'heal', 'heal_pct', 'heal_max_health', 'restore_health', 'restore_power',
    'conjure', 'summon_pet', 'revive_pet', 'summon_totem', 'shapeshift', 'stealth',
    'weapon_imbue', 'damage_shield', 'seal',
  ]);
  // Hostile combat effect kinds (attack the enemy).
  const OFFENSIVE_KIND = new Set([
    'direct_damage', 'dot', 'power_burn', 'power_drain', 'health_leech',
    'weapon_percent_damage', 'holy_shock', 'judgement',
    'cc', 'root', 'interrupt_cast', 'taunt', 'threat', 'modify_threat_pct',
    'dispel', // purge / offensive strip on enemy also range-gated
  ]);

  let anyOffensive = false;
  let onlyFriendly = true;
  for (const e of effects) {
    const k = e.kind;
    if (OFFENSIVE_KIND.has(k)) {
      // restore_power / speed can be friendly; those kinds aren't in OFFENSIVE_KIND unless
      // tagged — speed snare uses hostile/pct below.
      anyOffensive = true;
      onlyFriendly = false;
      continue;
    }
    if (k === 'speed' && (e.hostile === true || (typeof e.pct === 'number' && e.pct < 0))) {
      anyOffensive = true;
      onlyFriendly = false;
      continue;
    }
    if (k === 'buff') {
      // Hostile debuff on the enemy vs self/party buff.
      if (e.hostile === true || (typeof e.amount === 'number' && e.amount < 0 && e.hostile !== false)) {
        anyOffensive = true;
        onlyFriendly = false;
      }
      // friendly buff keeps onlyFriendly if no other offensive
      continue;
    }
    if (!FRIENDLY_ONLY.has(k) && k !== 'trigger_spell' && k !== 'proc_trigger_spell') {
      onlyFriendly = false;
    }
  }
  if (anyOffensive) return true;
  if (onlyFriendly) return false;
  // control role with residual effects (CC payloads)
  if (role === 'control') return true;
  return false;
}

/**
 * First **offensive attack** in pull, then combat — its `rangeMax` yards.
 * Skips friendly prep (shields, self buffs, heals) so open distance matches the first
 * hostile cast, not a 40 yd friendly absorb that never needs the enemy in range.
 */
export function firstOffensiveRotationRangeYd(
  rot: {
    phases: {
      pull: ReadonlyArray<{ enabled: boolean; action: { kind: string; spellId?: number } }>;
      combat: ReadonlyArray<{ enabled: boolean; action: { kind: string; spellId?: number } }>;
    };
  } | null | undefined,
  spellOf: (id: number) => PullRangeSpellLike | null | undefined,
): number | null {
  if (!rot) return null;
  for (const phase of ['pull', 'combat'] as const) {
    for (const r of rot.phases[phase]) {
      if (!r.enabled || r.action.kind !== 'spell' || r.action.spellId == null) continue;
      const sp = spellOf(r.action.spellId);
      if (!isOffensiveAttackSpell(sp)) continue;
      const rm = sp!.rangeMax ?? 0;
      if (rm > 0) return rm;
      // Offensive but melee/rangeMax 0 — still an answer (melee open); caller may use fallback.
      if (rm === 0) return 0;
    }
  }
  return null;
}

/**
 * Resolve the yards used as `primaryOpenYd` for a product pull seed.
 * @param fallbackYd creature detection open (GetAttackDistance) — used when no offensive range
 */
export function resolvePullOpenYards(
  cfg: AutopilotConfig,
  rot: Parameters<typeof firstOffensiveRotationRangeYd>[0],
  spellOf: (id: number) => PullRangeSpellLike | null | undefined,
  fallbackYd: number,
): number {
  if (cfg.pullOpenYards >= PULL_OPEN_YARDS_MIN) return cfg.pullOpenYards;
  // auto (0) and max (−1): first offensive attack rangeMax; else creature detection.
  // Positive range = stand at that yard line. 0 = melee offensive with no yards —
  // keep a real open band via creature detection so we do not seed on top of the mob.
  if (cfg.pullOpenYards === PULL_OPEN_AUTO || cfg.pullOpenYards === PULL_OPEN_MAX) {
    const fromRot = firstOffensiveRotationRangeYd(rot, spellOf);
    // A spell's own rangeMax is not a pull distance: Hunter's Mark 1130 is 100 yd. The manual
    // setting is bound at PULL_OPEN_YARDS_MAX, so auto/max takes the same ceiling.
    if (fromRot != null && fromRot > 0) return Math.min(fromRot, PULL_OPEN_YARDS_MAX);
    return Math.min(fallbackYd, PULL_OPEN_YARDS_MAX);
  }
  return Math.min(fallbackYd, PULL_OPEN_YARDS_MAX); // junk
}
