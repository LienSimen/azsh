import type { BuffMod, ItemQuality, ItemSlot, School, Stat } from './primitives.ts';
import type { SpellDef } from './spell.ts';
import type {
  DisenchantRuleDef,
  EnchantDef,
  EnchantRodDef,
  GameObjectDef,
  GatherNodeDef,
  ProfessionDef,
  ProfTrainerDef,
  RecipeDef,
  SkinnableDef,
} from './profession.ts';

// ---- Items ----------------------------------------------------------------

export interface ItemDef {
  entry: number;
  name: string;
  description?: string;      // raw description text from item_template.description (DB flavor/use text; never fabricate)
  quality: ItemQuality;
  requiredLevel: number;
  sellPrice: number;         // copper
  buyPrice: number;          // copper
  stackable: number;         // max stack (1 if not stackable)
  slot?: ItemSlot;           // equip slot (absent => not equippable)
  // Class ids from item_template.AllowableClass. Absent = unrestricted (mask -1/0/all-playable).
  // Relics (libram/idol/totem) are not this field — AllowableClass is 32767; see domain/items/relic.ts.
  allowClass?: number[];
  // A pure "Quest" item (item_template.class === 12): useful only for quest objectives, so the
  // runtime never loots/gathers more than the held quests still need (stops quest-item bloat).
  questItem?: boolean;
  // HJ1: a classic-db GM/QA/test row with no baked acquisition path. Name-class sanity only, never
  // an id blocklist. Exclude from botGear pools, AH fill and player-facing browsers.
  notObtainable?: boolean;
  bagSlots?: number;         // container capacity when slot === 'bag' (extra backpack slots when equipped)
  icon?: string;             // WoW icon name; UI-only, absent => question-mark fallback
  weapon?: { dmgMin: number; dmgMax: number; delayMs: number; school: School };
  // item_template.class (ITEM_CLASS_*), populated on every item from the dump. Sibling fields stay:
  // weaponSubclass (class 2), armorSubclass (class 4), typeName.
  itemClass?: number;
  // item_template.subclass for the item's class. Weapons also set weaponSubclass and armor
  // armorSubclass — do not treat a bare itemSubclass as armor without itemClass === 4.
  itemSubclass?: number;
  // item_template.BagFamily (ARROWS=1, BULLETS=2, …). Used by ItemCanGoIntoBag for quiver/pouch filters.
  // Cite: Item.cpp ItemCanGoIntoBag; ItemPrototype.h.
  bagFamily?: number;
  // item_template.InventoryType, for ammo/thrown gates (24/25/27) and weapons (13 vs 21), so a
  // dual-wield consumer can tell 1H MH/OH from MH-only. Optional: class/subclass often suffices.
  inventoryType?: number;
  // True when InventoryType === 13 (INVTYPE_WEAPON) — equippable mainhand OR offhand. 21 stays
  // mainhand-only. Does not invent dual-wield class rules. Cite: ItemPrototype.h InventoryType.
  canOffhand?: boolean;
  // item_template.subclass when class=2 (weapon). Maps to combat skill via Item::GetSkill. Absent on
  // pre-skill bakes — runtime falls back to typeName.
  weaponSubclass?: number;
  // item_template.subclass when class=4 (armor). Maps to cloth/leather/mail/plate/shield skill. Cite:
  // Item.cpp item_armor_skills. Absent → typeName fallback.
  armorSubclass?: number;
  armor?: number;
  // item_template.block — the shield's own block value, added to the strength term. Cite: Player.cpp
  // GetShieldBlockValue; 330 shields carry it. Absent => 0 (not a shield).
  block?: number;
  stats?: { stat: Stat; value: number }[];
  // Tooltip metadata, extracted from item_template (absent => unknown/not applicable):
  itemLevel?: number;        // ItemLevel
  // item_template.FoodType (1 Meat … 8 Raw Fish): the canonical pet-food marker Feed Pet
  // checks (Pet.cpp HaveInDiet). Baked by enrich-pet-diet.mjs; absent => not pet food.
  foodType?: number;
  maxDurability?: number;    // real MaxDurability (0/absent => indestructible)
  binding?: number;          // bonding: 1 BoP, 2 BoE, 3 BoU, 4 quest item
  typeName?: string;         // weapon type ("Sword") or armor material ("Leather"/"Shield")
  // item_template.Material — the ItemMaterials enum for ItemGroupSounds pickup/putdown. Optional;
  // pre-Wave-G bakes omit it and the UI falls back to class/subclass heuristics.
  material?: number;
  consumable?: {
    effect: 'food' | 'drink';
    amountPerTick: number;
    tickMs: number;
    durationMs: number;
    reqLevel: number;
    // Percent-of-max restored per tick, set when the on-use spell ticks aura 20 / 21. It WINS over
    // `amountPerTick`, which stays only as the pre-pctOfMax flat fallback. Cite: SpellAuras.cpp:4706.
    pctOfMax?: number;
  };
  // Instant in-combat use, derived from the on-use spell's real effects: restore_health /
  // restore_power roll a flat restore, and cast_spell replays useSpell through the interpreter.
  useInCombat?: {
    effect: 'restore_health' | 'restore_power' | 'cast_spell';
    /** restore_* only — rolled amount. */
    min?: number;
    max?: number;
    // restore_power only — Powers index the on-use spell fills (0 mana, 1 rage, 2 focus, 3 energy).
    // Cite: SpellEffects.cpp EffectEnergize EffectMiscValue; consumables.ts restoredPowerType.
    powerType?: number;
    /** cast_spell only — spell id to replay (usually === useSpell). */
    spellId?: number;
    /** Personal item CD (spellcooldown_N), ms. */
    cooldownMs?: number;
    /** Shared category id (spellcategory_N). Bombs = 24, potions = 4. */
    category?: number;
    /** Shared category recovery (spellcategorycooldown_N), ms. Bombs = 60000. */
    categoryCooldownMs?: number;
    reqLevel: number;
  };
  // Buff-granting consumable (elixir, scroll, flask, stat food). Populated when a class-0 item's
  // on-use spell has a `buff` SpellEffect; applied with the sourced duration and respecting reqLevel.
  useBuff?: {
    mod: BuffMod;
    amount: number;
    durationMs: number;
    reqLevel: number;
    cooldownMs?: number; // e.g. shared potion CD or elixir sickness
  };
  // The ON_USE slot's cooldown columns, stamped UNCONDITIONALLY whenever the row has one — 626 of
  // 1,122 items with a real cooldown fall through the classifier and were free to spam without it.
  useCooldownMs?: number;
  useCategory?: number;
  useCategoryCooldownMs?: number;
  // General usable: the spell triggered on "Use", from bags or held, populated from spellid_* for
  // class 0 and other usables. Runtime prefers it to dispatch effects.
  useSpell?: number;
  // item_template.spellcharges_1, sign and all: 0 unlimited, < 0 = |n| uses then DESTROYED, > 0 = n
  // uses then kept but refused. Cite: ItemHandler.cpp:366 sign; Spell.cpp:4209 TakeCastItem.
  charges?: number;
  // A book that teaches a PET ability rank when used (the warlock Grimoires). Using it consumes the
  // book and adds this id to Character.petSpells. Absent => not a pet-training book.
  teachPetSpell?: number;
  // A recipe ITEM that teaches a crafting recipe when used — the acquisition path for a recipe
  // whose source is 'drop' or 'vendor'. Using it consumes the item and adds the id to knownRecipes.
  teachRecipe?: number;
  // A Formula: item that teaches an ENCHANT formula the same way (game.learnEnchantFromItem →
  // Character.knownEnchants). Absent => not a formula item.
  teachEnchant?: number;
  // item_template.startquest when > 0 — this item starts that quest entry, the reverse of
  // QuestDef.startedByItem. Cite: item_template.startquest; Player.cpp AcceptQuest.
  startQuest?: number;
  // Equip spells granted by this item (spelltrigger_* = 1), typically passive or while-equipped.
  // The raw spell-id list is retained for fidelity (ammo haste, set tooling).
  equipSpells?: number[];
  // Resolved paperdoll/aura mods from equipSpells, summing the same `mod` across spells and
  // skipping hostile debuffs. Does not replace equipSpells — non-buff auras still need a live cast.
  equipMods?: Array<{ mod: string; amount: number }>;
  // Proc effects (chance on hit / on equip). `chancePct` prefers spell_proc_event.CustomChance over
  // spell_template.ProcChance; `ppm` prefers PPMRate over item_template.spellppmrate_N.
  procs?: Array<{
    spell: number;
    trigger: number;
    chancePct?: number;
    ppm?: number;
    flags?: number;
    procEx?: number;
    cooldownMs?: number;
    schoolMask?: number;
    spellFamilyName?: number;
    spellFamilyMask?: number[];
  }>;
  // If this item belongs to an item set, the set id (from item_template.itemset or DBC).
  setId?: number;
  // ITEM_FLAG_CONJURED (0x2) from item_template.Flags — conjured bread/water/healthstone/… Wave D: replaces
  // isConjuredItem name-rules. Cite: ItemPrototype.h ITEM_FLAG_CONJURED.
  conjured?: boolean;
  // item_template.maxcount when > 0 — a hard ownership cap across bags, bank, keyring and equipped.
  // maxCount 1 is the classic "Unique" line; above 1 is a soft cap. Cite: Player.cpp ~8552.
  maxCount?: number;
  // True when maxCount === 1 (tooltip "Unique"). Baked from maxcount; also set when only the boolean is
  // present on fixtures. Cite: item_template.maxcount.
  unique?: boolean;
  // ITEM_FLAG_UNIQUE_EQUIPPABLE (0x80000) — only one may be equipped at a time; bags may hold more.
  // ClassicDB 1.12 has 0 rows with the bit today. Cite: Player.cpp CanEquipUniqueItem ~19511.
  uniqueEquipped?: boolean;
  // Minimum reputation to buy/equip/use (item_template.RequiredReputationFaction/Rank). Absent =>
  // no reputation requirement. Baked by dev/etl/enrich-reputation.mjs. Cite: Player::CanUseItem.
  requiredRep?: { faction: number; rank: number };
  // item_template.requiredhonorrank — the PvP rank you must have HELD, on the internal 5..18 scale
  // and measured against the HIGHEST rank ever reached. 461 of 21,644 rows. Cite: Player.cpp:17539.
  requiredHonorRank?: number;
  /** item_template.bonding (ItemBondingType). Baked by extract/enrich. */
  bonding?: number;
  // ---- Mounts (P0.7 enrich-mounts.mjs; docs/cmangos_mapping/misc/mounts-riding.md) ----
  // On-use spell carrying aura 78 SPELL_AURA_MOUNTED; its presence marks the item as a mount.
  mountSpell?: number;
  /** Mounted speed bonus from the spell's aura-32 slot: BasePoints+1 (59→60%, 99→100%). */
  mountSpeedPct?: number;
  /** item_template.RequiredSkillRank for skill 762 SKILL_RIDING (75 or 150). */
  requiredRidingRank?: number;
  // item_template.RequiredSkill — the skill line gating USE of this item (202 Engineering on the
  // sapper charge). 0 is ungated, which is correct for every potion. Gate on this, not the rank.
  requiredSkill?: number;
  /** item_template.RequiredSkillRank — value needed in `requiredSkill`. */
  requiredSkillRank?: number;
  /** item_template.AllowableRace mask (CanUseItem, Player.cpp:9774–9803). Absent = unrestricted. */
  allowableRace?: number;
  // Class-6 projectile DPS (item_template.dmg_min1/max1). Wave F / E3b enrich-item-economy. Cite:
  // Player.cpp _ApplyAmmoBonuses.
  ammoDps?: { dpsMin: number; dpsMax: number };
  /** item_template.RandomProperty → item_enchantment_template entry. */
  randomProperty?: number;
  // item_template.BuyCount — units delivered per purchase, and what BuyPrice buys. The price is per
  // BUNDLE, not per unit. Cite: Player.cpp:17516 totalCount and :17551 price.
  buyCount?: number;
  // item_template.lockid → Lock.dbc, set on containers that must be unlocked before their loot
  // opens. A lock needing a skill can never be plain right-clicked. Cite: SpellHandler.cpp:199–217.
  lockId?: number;
  // SpellItemEnchantment TYPE_DAMAGE flat for this enchant id (when known). Prefer resolving via
  // SpellItemEnchantment DBC; optional on item for tests.
  weaponDamageFlat?: number;
}

// Item sets (baked for S3 set-bonus spells). Referenced by items via setId; the bonuses
// are granted spell ids (resolved via ds.spell when count of equipped pieces met).
export interface ItemSetDef {
  id: number;
  name?: string;
  items: number[]; // member item entries
  bonuses: Array<{ pieces: number; spell: number }>; // e.g. 2-piece -> spell id
}

// ItemRandomProperties.dbc row → hybrid resolve for random "of the X" suffixes. Never invent ids —
// a missing source omits the map entirely. Cite: DBCStructure.h ItemRandomPropertiesEntry.
export interface RandomPropertyDef {
  id: number;
  /** Localized name suffix, e.g. "of the Falcon". Absent when DBC string empty. */
  nameSuffix?: string;
  /** Up to 3 SpellItemEnchantment ids (PROP_ENCHANTMENT_SLOT_0..2). */
  enchantIds: number[];
  // Pre-resolved paperdoll bonuses from type-3 equip-spell auras + type 2/4/5 when present. Keys are Stat
  // strings (str/agi/…) or resist keys; only sourced amounts.
  stats?: Partial<Record<string, number>>;
  armor?: number;
  weaponDamageFlat?: number;
  /** Type-3 EQUIP_SPELL args (spell ids) kept for live equip fidelity. */
  equipSpellIds?: number[];
}

// ---- Loot -----------------------------------------------------------------

export interface LootEntryDef {
  item: number;
  // Drop weight or percent; magnitude is the roll weight (0 = equal chance within its group). A
  // NEGATIVE chance is a quest-required drop, so use Math.abs for weight and the sign for the gate.
  chance: number;
  groupId: number;
  minCount: number;
  maxCount: number;
  /** When true, drop only while the player has a quest needing this item. Prefer signed `chance` for compact tuples. */
  questRequired?: boolean;
  // creature/reference_loot_template.condition_id; omitted or 0 means always eligible. Non-zero ids
  // resolve against DataBundle.conditions, and compact tuples carry it as the optional 6th element.
  conditionId?: number;
}
// One loot table in the pre-split bundle. Creature and other bare-id tables use a numeric lootId,
// GameObject container tables the string form `go:<n>`, so GO and creature loot never collide.
export interface LootTableDef {
  lootId: number | string;
  entries: LootEntryDef[];
}

// Compact wire form of the loot tables, split into loot-data.json and lazy-loaded. Each entry is a
// positional tuple, and the count pair is omitted when it is the near-universal 1..1.
export type LootTuple =
  | [item: number, chance: number, groupId: number]
  | [item: number, chance: number, groupId: number, minCount: number, maxCount: number]
  /** QI1/FQ4: 6th element is conditionId when non-zero (loot-data compact encoding). */
  | [item: number, chance: number, groupId: number, minCount: number, maxCount: number, conditionId: number];
export type CompactLoot = Record<string, LootTuple[]>;

// The profession mechanics are split into profession-data.json and lazy-loaded: nothing touches
// them at boot, only post-mount. Every field is optional so a partial chunk still attaches.
export interface CompactProfessions {
  professions?: ProfessionDef[];
  recipes?: RecipeDef[];
  gatherNodes?: GatherNodeDef[];
  profTrainers?: ProfTrainerDef[];
  skinnable?: SkinnableDef[];
  enchants?: EnchantDef[];
  enchantRods?: EnchantRodDef[];
  disenchantRules?: DisenchantRuleDef[];
}

// The non-core spells are split into spell-data.json and attached by an idempotent merge.
// Player-reachable core spells stay in the boot tables so the spellbook works immediately.
export interface CompactSpells {
  spells?: SpellDef[];
}

// GameObject bulk (~10k templates) is split to gameobject-data.json for the same reason as loot.
// A minimal quest/current-zone set may stay in the core bundle; attachGameObjects merges the rest.
export interface CompactGameObjects {
  gameObjects?: GameObjectDef[];
}

// Item bulk (~17k templates) is split to item-data.json. Boot keeps createInfo starters and
// attachItems merges the rest idempotently. Full ItemDef[], not tuple-encoded.
export interface CompactItems {
  items?: ItemDef[];
}
