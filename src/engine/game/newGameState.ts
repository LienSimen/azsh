// Character-create and world-bot GameState factories, peeled from game.ts. createGame stays the live
// facade; these only build the initial state blob.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../../domain/character/character.ts';
import {
  maxHealth,
  maxPower,
  powerType,
  knownUsableSpells,
} from '../../domain/character/character.ts';
import { clampAppearance, deterministicAppearance, type Appearance } from '../../domain/character/appearance.ts';
import {
  type Companion,
  companionCharacter,
  companionSpellbook,
} from '../../domain/bots/squad.ts';
import { worldBots, MAX_BOT_LEVEL, type WorldBot } from '../../domain/bots/botPool.ts';
import { generateSpawnGear, type GearProfile } from '../../domain/bots/botGear.ts';
import { generateSpawnInventory } from '../../domain/bots/botInventory.ts';
import { DEFAULT_EQUIPMENT_HELPER_CONFIG } from '../../domain/items/equipmentHelper.ts';
import { normalizeCharacterJunkFilterConfig } from '../../domain/items/junkFilter.ts';
import { normalizeGatherFilterConfig } from '../../domain/professions/gatherFilter.ts';
import { applyBotProfessions } from '../../domain/bots/botProfessions.ts';
import { initBotPet } from '../../domain/bots/botPet.ts';
import { applyPetPartyAuras } from '../../domain/pet/pet.ts';
import { defaultFormForClass } from '../../domain/character/forms.ts';
import { buildDefaultRotation } from '../../domain/rotation/rotation.ts';
import { equipItem } from '../../domain/items/equipment.ts';
import {
  defaultActionBars,
  autofill as autofillBars,
} from '../../domain/character/actionbar.ts';
import { emptyGlobalBar } from '../../domain/raid/globalActionBar.ts';
import {
  normalizePrimaryPages,
  seedFormPageFromDefaultIfEmpty,
} from '../../domain/character/stanceBar.ts';
import { emptyInventory, addItem } from '../../domain/items/inventory.ts';
import { emptyKeyring, isKeyItem, addToKeyring, migrateKeysToKeyring } from '../../domain/items/keyring.ts';
import { equippedEntry } from '../../domain/items/itemInstance.ts';
import type { SpellBook } from '../../domain/character/spellbook.ts';
import { knows, learn } from '../../domain/character/spellbook.ts';
import { emptyQuestLog } from '../../domain/quests/questlog.ts';
import { emptyAuctionHouse } from '../../domain/economy/auction.ts';
import {
  COMBAT_SKILL,
  grantCreateCombatSkills,
  syncCombatSkillsFromKnownSpells,
  skillIdForEquip,
  skillIdForItem,
  raceClassCanLearnSkill,
  raiseCombatSkillsToLevelCap,
  skillRewardedSpellIds,
  type CombatSkillMap,
} from '../../domain/character/combatSkills.ts';
import { maybeAutoSelectAmmo } from '../../domain/items/ammo.ts';
import type { GameState } from './types.ts';
import { fillOutdoorPvpInitialWorldStates } from './outdoorPvp.ts';

function initialWorldStates(): Record<number, number> {
  const vars: Record<number, number> = {};
  fillOutdoorPvpInitialWorldStates(vars);
  return vars;
}

/** Build a brand-new character's game state from the DB's create-info. */
export function newGameState(
  ds: DataStore,
  race: number,
  cls: number,
  name: string,
  seed: number,
  gender: 0 | 1 = 0,
  /** Optional create-screen look; omitted → deterministic-by-name (bots/tests/legacy call sites). */
  appearance?: Appearance,
): GameState {
  const ci = ds.createInfo(race, cls);
  const spellbook: SpellBook = { known: [...(ci?.spells ?? [])] };
  let inventory = emptyInventory();
  let keyring = emptyKeyring();
  for (const it of ci?.items ?? []) {
    const def = ds.item(it.item);
    if (!def) continue;
    if (isKeyItem(def)) {
      keyring = addToKeyring(keyring, it.item, it.amount, def);
    } else {
      inventory = addItem(inventory, it.item, it.amount, def.stackable ?? 1);
    }
  }
  // Combat skills from playercreateinfo_skills (baked on createInfo.skills).
  // Cite: Player.cpp LearnDefaultSkills; ObjectMgr playercreateinfo_skills
  let char: Character = {
    name, race, gender, cls, level: 1, xp: 0, gold: 0,
    // Wave R: create-screen pickers pass an explicit look (clamped); otherwise hash(name).
    appearance: appearance
      ? clampAppearance(appearance, race, gender)
      : deterministicAppearance(name, race, gender),
    zoneId: ci?.startZone ?? ds.zones()[0]?.id ?? 'start',
    health: 1, power: 0, equipped: {}, activeBuffs: [], activeAuras: [],
    skills: {}, knownRecipes: [], knownEnchants: [], // professions are trained from an NPC, not granted
    combatSkills: grantCreateCombatSkills(
      ci?.skills ?? [],
      1,
      ds.combatSkillMeta?.(),
      race,
      cls,
    ),
    petSpells: [], // pet ability ranks bought from books (Grimoires); rank 1 of each is innate
    talents: {},   // no points spent at creation
    reputations: {}, // earned rep (E1); empty => each faction reads its FactionDef base standing
  };
  // Auto-equip every equippable starter item, moving it from the bags onto the
  // paperdoll (weapon, shield, armor…); food and other slotless items stay in bags.
  for (const it of ci?.items ?? []) {
    if (!ds.item(it.item)?.slot) continue;
    const eq = equipItem(char, inventory, ds, it.item);
    if (eq.ok) { char = eq.char; inventory = eq.inventory; }
  }
  // Vanilla create selects ammo when the bags hold a compatible type and a ranged weapon is equipped.
  // Pool bots already did; a fresh create-info state did not. Cite: Player create second pass.
  char = maybeAutoSelectAmmo(char, inventory, ds);
  char.health = maxHealth(char, ds);
  // Mana and energy start full; rage starts empty (classic).
  {
    const pt = powerType(char);
    char.power = (pt === 'mana' || pt === 'energy') ? maxPower(char, ds) : 0;
  }
  // Seed the action bar so combat isn't empty: drop the starting usable abilities onto bar 1.
  const actionBars = autofillBars(defaultActionBars(), knownUsableSpells(char, spellbook, ds).map((s) => s.id));
  // KI-466: warriors (etc.) start in a stance — seed form so page resolution matches create/load.
  const startForm = defaultFormForClass(cls, char.form, spellbook.known);
  if (startForm) char = { ...char, form: startForm };
  // Autofill lands on bar 0 / page "0"; mirror onto the form page when that page is empty so
  // Battle Stance (page 1) still shows the starter kit.
  let primaryBarPages = normalizePrimaryPages(undefined, actionBars[0]);
  primaryBarPages = seedFormPageFromDefaultIfEmpty(primaryBarPages, (char.form ?? 0) | 0);
  // Wave 3A: seed the auto-combat rotation from authored class suggestions (suggestion-first +
  // role-bucket fallback). Fresh characters feel decent without opening the rotation editor.
  const rotation = buildDefaultRotation(char, spellbook, ds, inventory);
  return {
    char, inventory, keyring, bank: emptyInventory(), bankBags: [], spellbook, actionBars,
    globalActionBar: emptyGlobalBar(),
    primaryBarPages, questlog: emptyQuestLog(),
    rngSeed: seed >>> 0, fightCounter: 0, activity: [], corpse: null, nodeState: {},
    spellCooldowns: {}, categoryCooldowns: {},
    instance: null, lockouts: {}, auctionHouse: emptyAuctionHouse(), mailbox: [],
    equipmentHelper: { ...DEFAULT_EQUIPMENT_HELPER_CONFIG },
    // Auto-DE off until the player opts in (green ceiling when enabled).
    autoDisenchant: { enabled: false, maxQuality: 2, protectCompanionUpgrades: true },
    // Per-character junk lists empty; quality/auto use global until characterSpecific is on.
    junkFilter: normalizeCharacterJunkFilterConfig({}),
    gatherFilter: normalizeGatherFilterConfig({}),
    rotation,
    worldStates: initialWorldStates(),
  };
}

// Local single-player convenience: pick one bot from the fixed 5000-bot world pool by seed, the same
// population innkeepers hire from. Multiplayer character-create must never take this path.
export function pickRandomWorldBot(
  ds: DataStore,
  seed: number,
  want?: { race?: number; cls?: number; gender?: 0 | 1; level?: number },
): WorldBot {
  const bots = worldBots(ds);
  if (bots.length === 0) {
    // Fail closed with a clear reason (empty pool only on a pathological bake).
    throw new Error('World bot pool is empty - cannot pick a random character');
  }
  const level = want?.level != null
    ? Math.max(1, Math.min(MAX_BOT_LEVEL, Math.round(want.level)))
    : undefined;
  // A combo the pool never rolled keeps the widest match, then gets stamped with what was asked.
  const narrow = (pool: WorldBot[], keep: (b: WorldBot) => boolean): WorldBot[] => {
    const hit = pool.filter(keep);
    return hit.length ? hit : pool;
  };
  let pool = bots;
  if (want?.cls != null) pool = narrow(pool, (b) => b.cls === want.cls);
  if (want?.race != null) pool = narrow(pool, (b) => b.race === want.race);
  if (want?.gender != null) pool = narrow(pool, (b) => b.gender === want.gender);
  if (level != null) pool = narrow(pool, (b) => b.level === level);
  const base = pool[Math.abs(seed >>> 0) % pool.length]!;
  const cls = want?.cls ?? base.cls;
  // A class override keeps specIdx inside that class's spec list (botGear reads it by index).
  const specIdx = cls === base.cls
    ? base.specIdx
    : Math.min(base.specIdx, Math.max(0, ds.botSpecs(cls).length - 1));
  return {
    ...base,
    race: want?.race ?? base.race,
    cls,
    gender: want?.gender ?? base.gender,
    level: level ?? base.level,
    specIdx,
  };
}

// Build a full playable GameState from a world-pool playerbot template — gear, bags, professions, pet,
// talents and spells, all off the bot factories.
export function newGameStateFromWorldBot(
  ds: DataStore,
  bot: WorldBot,
  seed: number,
  opts?: { gearProfile?: GearProfile; appearance?: Appearance },
): GameState {
  const ci = ds.createInfo(bot.race, bot.cls);
  const level = Math.max(1, Math.min(60, bot.level));
  const scratch: Companion = {
    id: bot.id,
    name: bot.name,
    race: bot.race,
    cls: bot.cls,
    gender: bot.gender,
    role: 'dps',
    seed: bot.seed,
    equipped: {},
    level,
    xp: 0,
    specIdx: bot.specIdx,
  };
  // Spawn gear needs a character shell (class/level/race) for equip rules + playerbots weights.
  const shell = companionCharacter(scratch, level, ds);
  const botSpec = ds.botSpecs(bot.cls)[bot.specIdx];
  const gear = generateSpawnGear(shell, bot.seed, ds, opts?.gearProfile, {
    specIdx: bot.specIdx,
    role: botSpec?.role,
  });
  const withGear: Companion = { ...scratch, equipped: gear };
  const talentShell = companionCharacter(withGear, level, ds);
  let spellbook = companionSpellbook(withGear, level, ds);

  const meta = ds.combatSkillMeta?.();
  let combatSkills: CombatSkillMap = grantCreateCombatSkills(
    ci?.skills ?? [],
    level,
    meta,
    bot.race,
    bot.cls,
  );
  combatSkills = syncCombatSkillsFromKnownSpells(
    combatSkills,
    spellbook.known,
    level,
    meta,
    bot.race,
    bot.cls,
  ) ?? combatSkills;
  // Pool bots are leveled templates, not fresh L1s — max Defense + equipped weapon lines
  // (KI-080). Same helper as grantXp level-up; companions use grantMaxedCombatSkillsForRaceClass.
  const skillIds: number[] = [COMBAT_SKILL.DEFENSE];
  for (const v of Object.values(gear)) {
    const entry = equippedEntry(v);
    if (entry == null) continue;
    const it = ds.item(entry);
    // Attack-table skill (fist → unarmed). Equip proficiency mono (FIST 473) is not L×5.
    const skillId = skillIdForItem(it) || skillIdForEquip(it);
    if (!skillId) continue;
    if (!raceClassCanLearnSkill(meta, skillId, bot.race, bot.cls, level)
      && !combatSkills[skillId]) {
      continue;
    }
    skillIds.push(skillId);
  }
  combatSkills = raiseCombatSkillsToLevelCap(combatSkills, level, skillIds, meta) ?? combatSkills;
  // Proficiency passives for factory-trained lines: raising a skill value does not teach the passive,
  // and the create kit only ships starting weapon spells. Cite: Player.cpp LearnSkillRewardedSpells.
  for (const skillId of skillIds) {
    const prog = combatSkills[skillId];
    if (!prog || prog.current <= 0) continue;
    for (const rewarded of skillRewardedSpellIds(skillId, prog.current, meta)) {
      if (!knows(spellbook, rewarded)) spellbook = learn(spellbook, rewarded);
    }
  }

  let char: Character = {
    name: bot.name,
    race: bot.race,
    gender: bot.gender,
    // Wave R: derive the bot's look from its name (same fn the world-pool uses at spawn); the
    // create screen passes its own picker draft instead when the player framed one.
    appearance: opts?.appearance
      ? clampAppearance(opts.appearance, bot.race, bot.gender)
      : deterministicAppearance(bot.name, bot.race, bot.gender),
    cls: bot.cls,
    level,
    xp: 0,
    gold: 0,
    zoneId: ci?.startZone ?? ds.zones()[0]?.id ?? 'start',
    health: 1,
    power: 0,
    equipped: { ...gear },
    activeBuffs: [],
    activeAuras: [],
    skills: {},
    knownRecipes: [],
    knownEnchants: [],
    combatSkills,
    petSpells: [],
    talents: { ...(talentShell.talents ?? {}) },
    reputations: {},
  };
  char.health = maxHealth(char, ds);
  {
    const pt = powerType(char);
    char.power = (pt === 'mana' || pt === 'energy') ? maxPower(char, ds) : 0;
  }

  // PlayerbotFactory inventory + money (InitBags…AddConsumables + SetMoney).
  const kit = generateSpawnInventory(char, bot.seed, ds);
  char = {
    ...char,
    equipped: kit.equipped,
    gold: kit.gold,
    ...(kit.ammoItem != null ? { ammoItem: kit.ammoItem } : {}),
  };
  let inventory = kit.inventory;
  let keyring = emptyKeyring();
  {
    const swept = migrateKeysToKeyring(inventory, keyring, (e) => ds.item(e));
    inventory = swept.bags;
    keyring = swept.keyring;
  }

  // PlayerbotFactory InitTradeSkills + SetRandomSkill + InitInventorySkill tools.
  // Uses bot.seed (same template seed as gear) so re-picking the world bot is stable.
  {
    const stamped = applyBotProfessions(char, inventory, bot.seed, ds);
    char = stamped.char;
    inventory = stamped.inventory;
  }

  // PlayerbotFactory InitPet + InitPetSpells (hunter ≥10 / warlock Imp + grimoire ranks).
  const petKit = initBotPet(char, bot.seed, ds);
  if (petKit) {
    char = { ...char, pet: petKit.pet, petSpells: petKit.petSpells };
    // Living factory pet: APPLY_AREA_AURA_PARTY already on the owner (Blood Pact).
    // Cite: SpellAuras.cpp AreaAura::Update :469–471 (add owner); KI-856.
    char = applyPetPartyAuras(char, ds);
  }

  const actionBars = autofillBars(defaultActionBars(), knownUsableSpells(char, spellbook, ds).map((s) => s.id));
  const startForm = defaultFormForClass(char.cls, char.form, spellbook.known);
  if (startForm) char = { ...char, form: startForm };
  let primaryBarPages = normalizePrimaryPages(undefined, actionBars[0]);
  primaryBarPages = seedFormPageFromDefaultIfEmpty(primaryBarPages, (char.form ?? 0) | 0);
  const rotation = buildDefaultRotation(char, spellbook, ds, inventory);
  return {
    char, inventory, keyring, bank: emptyInventory(), bankBags: [], spellbook, actionBars,
    globalActionBar: emptyGlobalBar(),
    primaryBarPages, questlog: emptyQuestLog(),
    rngSeed: seed >>> 0, fightCounter: 0, activity: [], corpse: null, nodeState: {},
    spellCooldowns: {}, categoryCooldowns: {},
    instance: null, lockouts: {}, auctionHouse: emptyAuctionHouse(), mailbox: [],
    equipmentHelper: { ...DEFAULT_EQUIPMENT_HELPER_CONFIG },
    autoDisenchant: { enabled: false, maxQuality: 2, protectCompanionUpgrades: true },
    junkFilter: normalizeCharacterJunkFilterConfig({}),
    gatherFilter: normalizeGatherFilterConfig({}),
    rotation,
    worldStates: initialWorldStates(),
  };
}
