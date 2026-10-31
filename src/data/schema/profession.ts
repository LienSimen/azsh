import type { ItemQuality, ItemSlot, Stat } from './primitives.ts';

// ---- Professions ----------------------------------------------------------

export type SkillLine =
  | 'mining' | 'herbalism' | 'skinning'                         // gathering
  | 'blacksmithing' | 'leatherworking' | 'tailoring'
  | 'alchemy' | 'engineering' | 'enchanting'                    // crafting
  | 'cooking' | 'firstaid' | 'fishing' | 'poisons';             // secondary

export type ProfessionKind = 'gathering' | 'crafting' | 'secondary';

// CMaNGOS skill-line id → our SkillLine key: the DB speaks numeric ids while SkillMap keys on the
// name. Mirrors extract-professions.mjs SKILL_LINE — keep the two in step.
export const SKILL_LINE_BY_ID: Readonly<Record<number, SkillLine>> = Object.freeze({
  164: 'blacksmithing',
  165: 'leatherworking',
  197: 'tailoring',
  171: 'alchemy',
  202: 'engineering',
  333: 'enchanting',
  186: 'mining',
  185: 'cooking',
  129: 'firstaid',
  356: 'fishing',
  182: 'herbalism',
  393: 'skinning',
  40: 'poisons',
});

// A rung on a profession's mastery ladder. Learning a rank raises the skill cap and gates on level
// and skill; when `reqSkill` is absent the domain falls back to current-cap − 25.
export interface ProfessionRank {
  rank: number;              // 1 = Apprentice, 2 = Journeyman, …
  name: string;              // "Apprentice"
  cap: number;               // max skill this rank permits (75 / 150 / 225 / …)
  reqLevel: number;          // character level required to train it
  cost: number;              // copper
  /** Min profession skill to train this rank (0/absent = first rank or use classic margin). */
  reqSkill?: number;
}
export interface ProfessionDef {
  id: SkillLine;
  name: string;              // "Mining"
  kind: ProfessionKind;
  ranks: ProfessionRank[];
  icon?: string;             // WoW icon name (e.g. "trade_mining"); UI-only, absent => fallback
}

// WoW's orange/yellow/green/gray difficulty thresholds. Below `orange` you cannot perform it and
// at or above `gray` it grants no skill-ups; in between the skill-up chance falls off.
export interface SkillCurve {
  orange: number;
  yellow: number;
  green: number;
  gray: number;
}

/** A crafting recipe: reagents in, product out, gated by one profession's skill. */
export interface RecipeDef extends SkillCurve {
  id: number;
  skill: SkillLine;
  name: string;
  // `count` is the roll's minimum, `countMax` its top when the spell's dieSides exceed baseDice
  // (Large Copper Bomb 2-4). Cite: SpellEffects.cpp:1971; Object.cpp:2949.
  product: { item: number; count: number; countMax?: number };
  reagents: { item: number; count: number }[];
  // SpellEntry.Totem1/2 — tool items the crafter must be CARRYING, never consumed (Blacksmith
  // Hammer 5956 on 334 recipes). 380 of 1,135. Cite: Spell.cpp:6599-6615 SPELL_FAILED_TOTEMS.
  requiredTools?: number[];
  // SpellEntry.RequiresSpellFocus — a SpellFocusObject.dbc id the crafter must reach (anvil 1 on
  // 311 recipes). Checked against the zone's `craftingFocus`, since there is no in-zone position.
  requiresSpellFocus?: number;
  // SpellEntry.RecoveryTime / Category / CategoryRecoveryTime. Mooncloth is a 4-day personal CD;
  // the 12 transmutes and Refined Scale of Onyxia share category 310. Cite: Player.cpp:20117-20200
  // Player::AddCooldown. Absent = the craft has no cooldown (1,121 of the 1,135 baked recipes).
  cooldownMs?: number;
  cooldownCategory?: number;
  categoryCooldownMs?: number;
  source: 'trainer' | 'drop' | 'vendor'; // how the recipe is acquired
  trainer?: number;          // prof-trainer entry that teaches it (source === 'trainer' ONLY)
  recipeItem?: number;       // the item entry that teaches it when used (source === 'drop' | 'vendor')
  cost?: number;             // copper to learn (trainer); default 0
  // npc_trainer.reqlevel — character level the trainer demands before teaching it. 0/absent = none.
  // Real on the rogue poison ranks (Mind-numbing r1: reqlevel 24); 0 on crafting-trainer rows.
  reqLevel?: number;
}

/** A single yield roll on a gather node (independent chance, like ungrouped loot). */
export interface GatherYield {
  item: number;
  chance: number;            // percent (0..100)
  minCount: number;
  maxCount: number;
}
// A harvestable resource. Mining/herbalism/fishing nodes live in a zone's `nodes` list; skinning nodes are
// referenced by `skinnable` creatures and become available on a fresh corpse.
export interface GatherNodeDef extends SkillCurve {
  id: number;
  skill: SkillLine;          // the gathering profession that works it
  name: string;              // "Copper Vein", "Peacebloom", "Skin"
  yield: GatherYield[];
  // DB provenance: 'gameobject' means the node id IS a gameobject_template entry, 'fishing' that
  // sourceId is the fishing area id, 'skinning' the SkinningLootId. Absent on pre-DB fixtures.
  source?: 'gameobject' | 'fishing' | 'skinning';
  sourceId?: number;         // the DB row id the yield came from (fishing area / skinning loot)
  // How many harvests a fresh node has and how long it takes to respawn, from the CMaNGOS
  // gameobject_template: herbs [1,1], ore veins [2,4], fishing schools [3,3].
  charges?: [number, number]; // [min, max] harvests on a fresh spawn
  cooldownMs?: number;        // respawn delay once depleted (absent => default)
}

/** A profession trainer NPC. Teaches one skill line's ranks and its trainer recipes. */
export interface ProfTrainerDef {
  entry: number;
  name: string;
  skill: SkillLine;
}

/** Which gather node a creature's corpse offers when skinned. */
export interface SkinnableDef {
  creature: number;          // creature entry
  node: number;              // GatherNodeDef id (a skinning node)
}

// GameObjects (chests, containers, quest interactables) from gameobject_template plus its loot.
// Every field decodes one dataN slot of the GameObjectInfo union; zero values are omitted at bake.
export interface GameObjectDef {
  entry: number;
  name: string;
  type: number;              // GAMEOBJECT_TYPE_* (SharedDefines.h:515–548)
  displayId?: number;
  /** Per-type lock id (GetLockId switch, GameObject.h:400–417 — door/button use data1, chest/trap
   *  data0, fishinghole data4, …). Resolves into DataBundle.locks (Lock.dbc). */
  lockId?: number;
  /** First LOCK_KEY_ITEM entry of that lock (same rule as extract.mjs) — the key item that opens it. */
  keyId?: number;
  /** gameobject_loot_template id — ONLY chest data1 / fishinghole data1 (GetLootId, GameObject.h:496–504). */
  lootId?: number;
  // ---- per-type payloads (at most one present, keyed by `type`) ----
  door?: { startOpen?: boolean; autoCloseSecs?: number };
  button?: { startOpen?: boolean; autoCloseSecs?: number; linkedTrapId?: number };
  questgiver?: { gossipId?: number };
  chest?: {
    restockTime?: number;    // data2 secs (restock loop GameObject.cpp:353–372)
    consumable?: boolean;    // data3 — despawn at action; overrides restock (GameObject.cpp:627)
    minSuccessOpens?: number; maxSuccessOpens?: number;
    eventId?: number; linkedTrapId?: number;
    questId?: number;        // data8 — quest required for GO activation
    level?: number;
  };
  trap?: {
    level?: number;          // disarm skill req = level*5 (Spell.cpp CanOpenLock)
    radius?: number;         // data2 diameter/2, EXCEPT lockId 12 (hunter traps): diameter IS radius (GameObject.cpp:442–447)
    spellId?: number; charges?: number; cooldown?: number; startDelay?: number;
    stealthed?: boolean; invisible?: boolean;
  };
  spellFocus?: { focusId?: number; dist?: number; linkedTrapId?: number; questId?: number };
  goober?: {
    questId?: number;        // data1 — quest must be INCOMPLETE to use (GameObject.cpp:1628–1633)
    eventId?: number; autoCloseSecs?: number; consumable?: boolean; cooldown?: number;
    pageId?: number;
    spellId?: number;        // data10 — cast on user at Use (GameObject.cpp:1645; fan-out :592–603)
    linkedTrapId?: number; gossipId?: number;
  };
  fishnode?: { lootId?: number }; // bobber loot is LOOT_FISHING by zone skill, NOT GetLootId
  summoningRitual?: {
    reqParticipants?: number; spellId?: number; animSpell?: number;
    ritualPersistent?: boolean; castersGrouped?: boolean;
  };
  spellcaster?: { spellId?: number; charges?: number; partyOnly?: boolean };
  meetingstone?: { minLevel?: number; maxLevel?: number; areaId?: number };
  fishinghole?: { radius?: number; lootId?: number; minSuccessOpens?: number; maxSuccessOpens?: number };
  /** Reverse quest links (gameobject_questrelation / _involvedrelation) — see QuestDef.goStarter/goEnder. */
  questsStarted?: number[];
  questsEnded?: number[];
}

// Locks (Lock.dbc), the same shape as domain/world/openLock.ts. Type 1 LOCK_KEY_ITEM indexes the
// key item entry; type 2 LOCK_KEY_SKILL indexes LockType.dbc with a required value.
export interface LockCaseDef { type: number; index: number; skill: number }
export interface LockDataDef { id: number; cases: LockCaseDef[] }

// Enchanting is the odd craft out: it applies a permanent bonus to equipped gear instead of making
// an item, its mats come from disenchanting, and a tiered ROD in the bags gates which tier applies.

// An enchanting rod (tool). `tier` orders the five rods (1 Runed Copper … 5 Runed Arcanite); an enchant
// needs a rod of at least its `minRodTier`, and any higher rod satisfies a lower one.
export interface EnchantRodDef {
  entry: number;             // the rod's item entry
  tier: number;              // 1..5
}

// An enchant formula, applying to any equipped item whose ItemSlot is listed in `slots`. The GRANT
// lives on ItemEnchantDef; prefer `gearEnchantGrant` over reading the cached stats/armor directly.
export interface EnchantDef extends SkillCurve {
  id: number;
  name: string;              // "Enchant Bracer - Minor Stamina"
  slots: ItemSlot[];         // gear ItemSlots this can target (e.g. ['wrist'])
  minRodTier: number;        // lowest rod tier that can apply it
  reagents: { item: number; count: number }[];
  // SpellItemEnchantment.ID this formula writes onto the item, resolved through ds.itemEnchant.
  // Required on every baked row; 0 of 63 carried it before W7, so grants were hand-authored.
  enchantId: number;
  /** @deprecated Prefer gearEnchantGrant — kept one release as a resolved cache of primary stats. */
  stats?: { stat: Stat; value: number }[];
  /** @deprecated Prefer gearEnchantGrant — kept one release as a resolved cache of armor. */
  armor?: number;
  source: 'trainer' | 'drop' | 'vendor'; // how the formula is acquired
  trainer?: number;          // enchanting-trainer entry that teaches it (source === 'trainer' ONLY)
  recipeItem?: number;       // the Formula: item that teaches it when used (source === 'drop' | 'vendor')
  cost?: number;             // copper to learn (trainer); default 0
  // npc_trainer.reqlevel — character level the trainer demands before teaching it. 0/absent = none.
  // Real on the rogue poison ranks (Mind-numbing r1: reqlevel 24); 0 on crafting-trainer rows.
  reqLevel?: number;
}

// A disenchant outcome band: destroying an equippable item of exactly `quality` within the item
// level range rolls each `yield` entry independently. `reqSkill` is the enchanting skill needed.
export interface DisenchantRuleDef {
  quality: ItemQuality;
  minItemLevel: number;
  maxItemLevel: number;
  reqSkill: number;
  yield: GatherYield[];
}
