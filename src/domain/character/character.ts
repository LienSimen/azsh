// The character is stored as minimal serializable state — only CURRENT health and power. Everything
// derived is recomputed by selectors from the DataStore, so nothing desyncs on level or gear.

import type { EquipSlot, SkillLine, School, ShapeshiftFormId } from '../../data/schema.ts';
import type { EquippedValue } from '../items/itemInstance.ts';
import { equippedEntry, equippedInstance, equippedEntries } from '../items/itemInstance.ts';
import type { DurabilityMap } from '../items/durability.ts';
import type { CombatSkillMap } from './combatSkills.ts';
import type { Journey, HearthBind } from '../nav/travelTypes.ts';
import type { Appearance } from './appearance.ts';

export interface Character {
  name: string;
  race: number;
  /** 0 = male, 1 = female (ai_playerbot_names convention, same as Companion.gender). Picks the
   * 2D face portrait (the client's TemporaryPortrait art ships both). Absent on pre-v23 saves → male. */
  gender?: 0 | 1;
  // Player-chosen appearance as 0-based indices into this body's legal Choices, driving the 2D
  // paperdoll composite. Absent on a pre-v30 save, where the compositor derives the look by name.
  appearance?: Appearance;
  cls: number;
  level: number;
  xp: number;
  gold: number;              // copper
  zoneId: string;
  health: number;            // current
  power: number;             // current active resource (mana, rage, or energy)
  // Parallel mana pool while shapeshifted onto rage/energy (Druid). When form is none / mana, mana is
  // stored in `power` and this field is unused. Absent on pre-form saves.
  mana?: number;
  // Active shapeshift form id (CMaNGOS ShapeshiftForm). 0 / absent = humanoid. See
  // domain/character/forms.ts and docs/done/druid.md.
  form?: ShapeshiftFormId;
  equipped: EquippedMap;     // paperdoll slot -> equipped item entry
  durability?: DurabilityMap; // per-slot current durability (absent slot => full)
  // Enchant applied per paperdoll slot. Live identity also rides ItemInstance.permEnchantId, which
  // equippedWithEnchant prefers; this map is the fallback for bare-entry and pre-Wave-C gear.
  enchants?: EnchantMap;
  // Temporary weapon enchants (TEMP_ENCHANTMENT_SLOT), exclusive per hand. THIS map is the combat
  // source of truth; ItemInstance.tempEnchant is identity transport so the imbue travels.
  tempEnchants?: TempEnchantMap;
  // Legacy list of spellIds for out-of-combat buffs, kept for save compatibility. Prefer
  // `activeAuras`, which carries durations; saveShape converts old entries to persistent auras.
  activeBuffs: number[];
  // Timed or persistent auras on the character, and the primary model for correct durations from
  // the DB. An absent expiresAt means persistent. Populated by consume and castOutOfCombat.
  activeAuras?: ActiveAura[];
  skills: SkillMap;          // profession skill lines the character has trained
  /** Player.cpp:5153 m_fishingSteps — casts toward the next fishing point. Absent = 0. */
  fishingSteps?: number;
  // Combat weapon, defense and class skills by CMaNGOS skill id (swords 43, defense 95). Absent on
  // a pre-v14 save is treated as fully trained L×5; new characters get the create-kit skills.
  combatSkills?: CombatSkillMap;
  knownRecipes: number[];    // recipe ids the character has learned
  knownEnchants?: number[];  // enchant-formula ids learned (optional: absent on a pre-v9 save / fixture => none)
  pet?: PetState;            // the active pet (hunter/warlock), if any
  // Dismissed hunter pet awaiting Call Pet 883. Vanilla dismiss unsummons to NOT_IN_SLOT and Call
  // restores the same beast. Warlock re-summons use a creature-specific summon and ignore it.
  storedPet?: PetState;
  // Purchased hunter stable slots (`m_stableSlots`, 0..MAX_PET_STABLES=2). Absent → 0. Cite: Player.h
  // m_stableSlots; NPCHandler.cpp HandleBuyStableSlot.
  stableSlots?: number;
  // Occupants of purchased stable slots, index 0 = PetSaveMode slot 1, with null for empty. A
  // stabled pet survives a new tame; `storedPet` does not. Cite: Pet.h PET_SAVE_FIRST_STABLE_SLOT.
  stablePets?: (PetState | null)[];
  // Pet ability ranks unlocked from books (warlock Grimoires). A pet knows rank 1 of its own
  // abilities free; these are character-wide, so a re-summoned demon keeps its upgrades.
  petSpells?: number[];
  // Talents spent: talentId (Talent.csv ID) -> rank spent (1..maxRank). Optional/{} on pre-talent
  // saves and fixtures. Total points available = pointsForLevel(level); prerequisites use tree-local spend.
  talents?: Record<number, number>;
  // Reputation standings by faction id, SPARSE: an absent faction uses its FactionDef base for
  // this race and class. Earned rep stores the absolute standing, clamped [-42000, 42999].
  reputations?: Record<number, number>;
  // Per-faction FactionState flags — VISIBLE once seen, AT_WAR from the rep pane toggle or a rank
  // drop, INACTIVE when parked. SPARSE: absent means that faction's default flags.
  factionFlags?: Record<number, number>;
  // Faction whose standing replaces the XP bar ("Show as Experience Bar"). 0/absent = show XP.
  // Cite: Player::SetWatchedFaction / PLAYER_FIELD_WATCHED_FACTION_INDEX.
  watchedFaction?: number;
  // Selected ammo item entry (PLAYER_AMMO_ID equivalent). ItemDef.ammoDps feeds ranged min/max. Cite:
  // Player.cpp _ApplyAmmoBonuses.
  ammoItem?: number;
  // Rested XP pool (Player m_rest_bonus, fractional), accrued via ComputeRest and capped at
  // 0.75 × nextLevelXp, spent kill-only. Cite: Player.cpp SetRestBonus / GetXPRestBonus.
  restedXp?: number;
  // Auto-use bag consumables out of combat (regenTick), like pet autoFeed. food/drink when vitals are low;
  // buffs when the matching aura is missing. Optional — absent on pre-auto-consumable saves.
  autoConsumables?: import('../bots/autoConsumables.ts').AutoConsumablePrefs;
  /** OOC well-fed gate — rest.ts tickPendingWellFed (aura 23 Amplitude). */
  pendingWellFed?: { triggerSpellId: number; needMs: number; elapsedMs: number; durationMs: number };
  // Zone ids already discovered, so exploration XP is granted once per zone. Our slice folds
  // sub-areas into parents, so this is per-zone rather than per-AreaTable row.
  exploredZones?: string[];
  // Riding skill value (SKILL_RIDING=762 maximized ranks: 0 | 75 | 150). Optional/0 on pre-v22 saves. Cite:
  // mounts-riding.md; SetSkillStep maximized.
  ridingSkill?: number;
  // Item entry of the currently active mount (one at a time; never-stack aura 78). Optional/absent =
  // unmounted. Pre-v22 saves have none.
  mountedItem?: number;
  // In-progress wall-clock journey: a departure timestamp plus planned legs. Position and progress
  // are always derived from `now`, never stored. Absent means not travelling.
  journey?: Journey;
  // TaxiNodes.dbc ids unlocked by first zone visit. A deliberate deviation: vanilla requires
  // talking to the flight master, and ours unlocks on exploration.
  discoveredTaxiNodes?: number[];
  // Bound inn (gd.tavernTriggers anchor). Zone-anchored hearthstone return target. Optional/absent =
  // unbound. Pre-v24 saves have none. Cite: FLEET-ROADMAP-3 K2; travelTypes.HearthBind.
  hearthBind?: HearthBind;
  // Epoch ms when hearthstone (spell 8690) is usable again. 60-min wall-clock cooldown. Optional/absent =
  // ready. Pre-v24 saves have none. Cite: FLEET-ROADMAP-3 D5/K2.
  hearthCooldownUntil?: number;
  // Player drunkenness 0..0xFFFF (CMaNGOS m_drunk). Raised by SPELL_EFFECT_INEBRIATE (drunkMod =
  // damage×256). Absent/0 = sober. Cite: Player.cpp SetDrunkValue / GetDrunkValue.
  drunkValue?: number;
  /** Unit m_movementInfo.moveFlags. Cite: Object.h:723–750; Unit.cpp:12428 SetHover. */
  movementFlags?: number;
  // Classic honor standing — this week's contribution plus rank points. Absent on a pre-v41 save
  // gives newHonorState(). The UI shows HK and Honor periods, never CP or RP labels.
  honor?: import('../run/honor.ts').HonorState;
  // Note: soul shards are real items (entry 6265) in inventory, not a synthesized counter.
}

// Apply SPELL_EFFECT_INEBRIATE: add drunkMod, clamp to 0..0xFFFF. Cite: SpellEffects.cpp EffectInebriate
// :4672–4678; Player.cpp SetDrunkValue.
export function applyInebriate(current: number | undefined, drunkMod: number): number {
  const cur = Math.max(0, Math.min(0xFFFF, (current ?? 0) | 0));
  const mod = Math.trunc(drunkMod);
  if (!(mod > 0)) return cur;
  return Math.min(0xFFFF, cur + mod);
}

/** Sparse map of paperdoll slot -> applied EnchantDef id (only enchanted slots present). */
export type EnchantMap = Partial<Record<EquipSlot, number>>;

/** Hands that can hold a temporary weapon enchant (imbue / poison). */
export type TempEnchantHand = 'mainhand' | 'offhand';

/** One TEMP_ENCHANTMENT_SLOT: apply spellId + combat/equipSpellId (TYPE_EQUIP_SPELL oils) from bake. */
export interface TempEnchantState {
  spellId: number;
  enchantId: number;
  expiresAt?: number;
  family?: string;
  attackPower?: number;
  equipSpellId?: number;
  combatSpellId?: number;
  combatChancePct?: number;
  combatPpm?: number;
  damageFlat?: number;
  rockbiterAmount?: number;
  combat?: {
    spellId: number;
    name: string;
    direct?: { school: School; min: number; max: number };
    dot?: { school: School; min: number; max: number; durationMs: number; tickMs: number };
    extraAttacks?: number;
    apBonus?: number;
    speed?: {
      aura: number;
      pct: number;
      durationMs: number;
      hostile?: boolean;
      mechanic?: string;
    };
    buffs?: Array<{
      mod: string;
      amount: number;
      durationMs: number;
      hostile?: boolean;
    }>;
  };
}

export type TempEnchantMap = Partial<Record<TempEnchantHand, TempEnchantState>>;

// The character's pet as minimal serializable state: health and power carry between fights, and
// the maxes come from InitStatsForLevel. Loyalty and training points are hunter-only.
export interface PetState {
  creature: number; // CreatureDef the pet is built from
  name: string;
  health: number;   // current HP (0 => dead until re-summoned/revived)
  // Explicit death state (CMaNGOS Unit death). Health 0 also means dead; Revive Pet clears this via
  // SetDeathState(ALIVE). Cite: SpellEffects.cpp:5194 EffectSummonDeadPet.
  dead?: boolean;
  happiness: number; // 0..100
  /** Current focus/mana. Optional for pre-3A saves — treat as full when absent. */
  power?: number;
  // UNIT_CREATED_BY_SPELL — the summon that put this pet in the world. Read to hand the reagent back
  // when the owner's death unsummons it. Cite: Pet.cpp:1020; SpellEffects.cpp EffectSummonPet.
  createdBySpell?: number;
  /** Loyalty level 1..6 (hunter pets). Absent on pre-v15 / demon pets. */
  loyalty?: number;
  /** Loyalty points toward next level (raw CMaNGOS scale). */
  loyaltyPoints?: number;
  /** Unspent training points for pet-trainer abilities. */
  trainingPoints?: number;
  /** Owner XP remaining before the next loyalty level-up is allowed (SetRequiredXpForNextLoyaltyLevel). */
  loyaltyXpRequired?: number;
  // Ability ids the player right-click-disabled on the pet bar, rank-agnostic by name chain.
  // Absent or empty means everything autocasts. Mirrors PetSpellMap ACT_ENABLED/ACT_DISABLED.
  autocastOff?: number[];
  // Hunter pets: abilities taught to THIS pet with its TP — the per-pet half of the vanilla split,
  // where gold buys the rank into the character-wide repertoire once. Absent falls back to it.
  taughtSpells?: number[];
  // Hunter pets: innate ability ids the OWNER can still learn from this pet, each cast rolling 10%
  // to enter the Beast Training repertoire. Mirrors Pet::m_teachspells.
  teachSpells?: number[];
  // Pet bar command: 'follow' (default) or 'stay'. 'attack' is a one-shot order and is never stored. Cite:
  // Unit.h:819-824 CommandStates; PetActionBarFrame.lua PET_FOLLOW/PET_WAIT.
  command?: 'follow' | 'stay';
  // Pet bar react state. Absent = 'defensive', the state a summoned pet starts in. Cite: UnitAI.h:81-86
  // ReactStates; PetAI.cpp:83 (aggressive sight aggro), :380 (assist), :480.
  react?: 'aggressive' | 'defensive' | 'passive';
  /** Happiness still to be absorbed from an in-progress feeding (Feed Pet Effect 1539, 20s). */
  feedRemaining?: number;
  /** Absorption rate for feedRemaining (gain/20 per second); cleared with it. */
  feedPerSec?: number;
  // The pet's own cooldowns as world-clock readyAt (epoch ms) — same store the player and each companion
  // keep. Dash / Dive / Sacrifice are minutes long and used to reset on every pull.
  spellCooldowns?: Record<number, number>;
  categoryCooldowns?: Record<number, number>;
  // Auto-feed food: the item entry the pet re-feeds on whenever happiness drops far enough for it
  // to land without waste. Undefined is off. Consumed by regenTick's out-of-combat feed.
  autoFeed?: number;
  // Party buffs the pet carries between pulls, the same store `Companion.prePullAuras` is. A pet is
  // taken by every party/raid fan with its owner. Cite: Spell.cpp:7345-7350 FillRaidOrPartyTargets.
  prePullAuras?: ActiveAura[];
}

/** Re-export auto-consumable prefs (lives on Character; see domain/bots/autoConsumables.ts). */
export type { AutoConsumablePrefs } from '../bots/autoConsumables.ts';

// A paperdoll slot's occupant: an `ItemInstance` when the item carries identity, or a bare entry
// number for plain gear and every pre-P1 save. Read it through equippedEntry / equippedInstance.
export type { EquippedValue };
export { equippedEntry, equippedInstance, equippedEntries };

/** Sparse map of paperdoll slot -> equipped value (only filled slots present). */
export type EquippedMap = Partial<Record<EquipSlot, EquippedValue>>;

// An active aura (buff or debuff source) on the character. `spellId` comes from the DB and an
// absent `expiresAt` means persistent. Durations always come from the mangos DB effect.
export interface ActiveAura {
  spellId: number;
  expiresAt?: number; // epoch ms
  /** Remaining proc charges (Lightning Shield). Absent = unlimited / not charge-based. */
  charges?: number;
  // Who cast it — 'player' or the companion id. Only a UNIQUE_PER_CASTER spell_group reads it, so
  // two paladins leave two Blessings. Cite: Unit.cpp:5021 RemoveAurasByCasterSpell.
  fromCaster?: string;
}

/** One profession's progress: `current` skill toward the rank-limited `max` cap. */
export interface CharacterSkill {
  current: number;
  max: number;
}
/** Sparse map of profession skill line -> progress (only trained lines present). */
export type SkillMap = Partial<Record<SkillLine, CharacterSkill>>;

// ---- Selector modules (barrel re-exports; public surface unchanged) --------
export {
  isWeaponImbueSpell,
  isHunterAspectSpell,
  spellExclusionGroup,
  applyTempEnchant,
  getTempEnchant,
  tempEnchantAttackPower,
} from '../professions/characterEnchants.ts';

export {
  equippedItems,
  setPieceCounts,
  activeSetBonusSpells,
  powerType,
  createMana, createHealth,
  currentMana,
  maxMana,
  baseStats,
  equippedStatBonuses,
  equippedStatBonus,
  effectiveStats,
  maxHealth,
  maxPower,
  clampResourcePools,
  getActiveBuffIds,
  pruneExpiredAuras,
  applyAura,
  effectiveArmor,
  attackPower,
  rangedAttackPower,
  blockValue,
  healingPower,
  resistances,
  combatantCreatureType,
  weaponProfile,
  offhandWeaponProfile,
  isDualWielding,
  rangedProfile,
} from './characterStats.ts';

export {
  activeTalentEffects,
  talentDamagePctBySchool,
  talentCritBonus,
  talentStatFlat,
  talentStatPct,
  talentResistMods,
  SCHOOL_MASK_BIT,
  talentManaRegenInterruptPct,
  talentResistancePenetration,
  talentThreatModifiers,
  withTalentMods,
} from './characterTalents.ts';

export {
  isHiddenInternalSpell,
  isTriggeredSecondarySpell,
  knownCombatSpells,
  knownUsableSpells,
  lowerRanksFor,
} from './characterSpells.ts';

export {
  hasShieldEquipped,
  canParry,
  critChance,
  defenseSkill,
  weaponSkill,
  weaponSkillIdForHand,
  weaponSkillForHand,
  collectSkillBonuses,
  skillBonusFor,
  critChanceDisplay,
  spellCritChanceFromStats,
  spellHitBonusFromGear,
  spellPower,
  spellDamageBySchool,
  hitChance,
  haste,
  dodgeChance,
  dodgeChanceDisplay,
  parryChance,
  parryChanceDisplay,
  blockChance,
  blockChanceDisplay,
} from './characterRatings.ts';

export {
  combatItems,
  stealthLevelBonusFromKnown,
  activeStealthAura,
  buildCombatant,
} from './buildCombatant.ts';

