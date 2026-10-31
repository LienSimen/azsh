// Hand-authored stand-in dataset so the engine and UI are playable before the ETL exists. Roughly
// classic-1.12-shaped but NOT authoritative; some reqLevels are lowered into the 1-6 MVP band.

import type { DataBundle } from './schema.ts';
import { RACE, CLASS } from './schema.ts';

const H = RACE.HUMAN;
const W = CLASS.WARRIOR;
const M = CLASS.MAGE;

export const FIXTURE_BUNDLE: DataBundle = {
  spells: [
    // Give new active fixture abilities an `icon`, mirroring the real bake. No longer load-bearing
    // for hidden-spell detection, but the UI still renders a question mark without one.
    {
      id: 133, name: 'Fireball', rank: 1, school: 'fire', powerType: 'mana', cost: 30,
      castTimeMs: 1500, cooldownMs: 0, gcdMs: 1500, rangeMax: 30, reqLevel: 1, role: 'nuke',
      effects: [{ kind: 'direct_damage', school: 'fire', min: 14, max: 22 }], icon: 'spell_fire_flamebolt',
    },
    {
      id: 168, name: 'Frost Armor', rank: 1, school: 'frost', powerType: 'mana', cost: 25,
      castTimeMs: 0, cooldownMs: 0, gcdMs: 1500, rangeMax: 0, reqLevel: 1, role: 'buff',
      outOfCombatOnly: true,
      effects: [{ kind: 'buff', mod: 'armor', amount: 30, durationMs: 1_800_000 }],
    },
    // Synthetic elixir buff spell for fixture tests of useBuff consumables (correct duration from DB model).
    {
      id: 9100001, name: "Elixir of Lion's Strength", rank: 1, school: 'physical', powerType: 'mana', cost: 0,
      castTimeMs: 0, cooldownMs: 0, gcdMs: 0, rangeMax: 0, reqLevel: 1, role: 'buff',
      outOfCombatOnly: true,
      effects: [{ kind: 'buff', mod: 'strength', amount: 4, durationMs: 3600_000 }],
      icon: 'inv_potion_56',
    },
    {
      id: 5504, name: 'Conjure Water', rank: 1, school: 'arcane', powerType: 'mana', cost: 30,
      castTimeMs: 3000, cooldownMs: 0, gcdMs: 1500, rangeMax: 0, reqLevel: 1, role: 'conjure',
      outOfCombatOnly: true, effects: [{ kind: 'conjure', item: 5350, count: 2 }],
    },
    {
      id: 587, name: 'Conjure Food', rank: 1, school: 'arcane', powerType: 'mana', cost: 30,
      castTimeMs: 3000, cooldownMs: 0, gcdMs: 1500, rangeMax: 0, reqLevel: 1, role: 'conjure',
      outOfCombatOnly: true, effects: [{ kind: 'conjure', item: 5349, count: 2 }],
    },
    {
      id: 116, name: 'Frostbolt', rank: 1, school: 'frost', powerType: 'mana', cost: 25,
      castTimeMs: 1500, cooldownMs: 0, gcdMs: 1500, rangeMax: 30, reqLevel: 4, role: 'nuke',
      effects: [{ kind: 'direct_damage', school: 'frost', min: 18, max: 20 }], icon: 'spell_frost_frostbolt02',
    },
    {
      id: 2136, name: 'Fire Blast', rank: 1, school: 'fire', powerType: 'mana', cost: 40,
      castTimeMs: 0, cooldownMs: 8000, gcdMs: 1500, rangeMax: 20, reqLevel: 6, role: 'instant_nuke',
      effects: [{ kind: 'direct_damage', school: 'fire', min: 27, max: 35 }], icon: 'spell_fire_fireball',
    },
    {
      // Real Frost Nova is learned at 10; lowered to 6 so the MVP band can enjoy it.
      id: 122, name: 'Frost Nova', rank: 1, school: 'frost', powerType: 'mana', cost: 55,
      castTimeMs: 0, cooldownMs: 25000, gcdMs: 1500, rangeMax: 0, reqLevel: 6, role: 'control',
      effects: [
        { kind: 'root', durationMs: 8000 },
        { kind: 'direct_damage', school: 'frost', min: 19, max: 21 },
      ], icon: 'spell_frost_freezingbreath',
    },
    // --- Warrior -----------------------------------------------------------
    {
      id: 78, name: 'Heroic Strike', rank: 1, school: 'physical', powerType: 'rage', cost: 15,
      castTimeMs: 0, cooldownMs: 0, gcdMs: 1500, rangeMax: 5, reqLevel: 1, role: 'strike',
      strikeBonus: 11, effects: [],
    },
    {
      id: 100, name: 'Charge', rank: 1, school: 'physical', powerType: 'rage', cost: 0,
      castTimeMs: 0, cooldownMs: 15000, gcdMs: 1500, rangeMax: 25, reqLevel: 1, role: 'charge',
      rageGenerated: 15, effects: [{ kind: 'direct_damage', school: 'physical', min: 3, max: 5 }], icon: 'ability_warrior_charge',
    },
    {
      id: 6673, name: 'Battle Shout', rank: 1, school: 'physical', powerType: 'rage', cost: 10,
      castTimeMs: 0, cooldownMs: 0, gcdMs: 1500, rangeMax: 0, reqLevel: 1, role: 'buff',
      effects: [{ kind: 'buff', mod: 'attack_power', amount: 30, durationMs: 120000, applyTo: 'party' }],
    },
    {
      id: 772, name: 'Rend', rank: 1, school: 'physical', powerType: 'rage', cost: 10,
      castTimeMs: 0, cooldownMs: 0, gcdMs: 1500, rangeMax: 5, reqLevel: 4, role: 'dot',
      effects: [{ kind: 'dot', school: 'physical', min: 4, max: 4, durationMs: 21000, tickMs: 3000 }],
    },
    // A passive (Block): never castable, must be hidden from the spellbook/action bars.
    {
      id: 107, name: 'Block', rank: 0, school: 'physical', powerType: 'rage', cost: 0,
      castTimeMs: 0, cooldownMs: 0, gcdMs: 0, rangeMax: 0, reqLevel: 1, passive: true, effects: [],
    },
    // Weapon proficiency (passive): trained at weapon masters; grants combat skill via combatSkillMeta.
    {
      id: 200, name: 'Polearms', rank: 0, school: 'physical', powerType: 'mana', cost: 0,
      castTimeMs: 0, cooldownMs: 0, gcdMs: 0, rangeMax: 0, reqLevel: 1, passive: true, effects: [],
    },
    {
      id: 201, name: 'One-Handed Swords', rank: 0, school: 'physical', powerType: 'mana', cost: 0,
      castTimeMs: 0, cooldownMs: 0, gcdMs: 0, rangeMax: 0, reqLevel: 1, passive: true, effects: [],
    },
    // --- Boss ability (Phase 5): cost 0 so the enemy AI always affords it -----
    {
      id: 950000, name: 'Testing Cleave', rank: 0, school: 'physical', powerType: 'mana', cost: 0,
      castTimeMs: 0, cooldownMs: 2000, gcdMs: 1500, rangeMax: 5, reqLevel: 0, role: 'instant_nuke',
      effects: [{ kind: 'direct_damage', school: 'physical', min: 3, max: 5 }], icon: 'ability_warrior_cleave',
    },
    // E1 test data: creature-cast spell, proc effect spell, set-bonus spell (fixtures only).
    {
      id: 999003, name: 'Creature Firebolt', rank: 0, school: 'fire', powerType: 'mana', cost: 15,
      castTimeMs: 1500, cooldownMs: 3000, gcdMs: 1500, rangeMax: 30, reqLevel: 0, role: 'nuke',
      effects: [{ kind: 'direct_damage', school: 'fire', min: 8, max: 12 }], icon: 'spell_fire_firebolt',
    },
    {
      id: 999001, name: 'Proc Nuke', rank: 0, school: 'fire', powerType: 'mana', cost: 0,
      castTimeMs: 0, cooldownMs: 0, gcdMs: 0, rangeMax: 30, reqLevel: 0,
      effects: [{ kind: 'direct_damage', school: 'fire', min: 6, max: 6 }], icon: 'spell_fire_firebolt02',
    },
    {
      id: 999002, name: 'Set Bonus Might', rank: 0, school: 'physical', powerType: 'mana', cost: 0,
      castTimeMs: 0, cooldownMs: 0, gcdMs: 0, rangeMax: 0, reqLevel: 0, role: 'buff',
      effects: [{ kind: 'buff', mod: 'attack_power', amount: 20, durationMs: 30000 }],
    },
  ],

  creatures: [
    {
      entry: 6981, name: 'Kobold Vermin', level: 1, hpMin: 42, hpMax: 48, dmgMin: 3, dmgMax: 4, attackTimeMs: 1900, armor: 30,
      lootId: 6981, minGold: 0, maxGold: 3, xp: 42, spells: [999003],
      // Wave 4B: same faction + CallForHelp for pack-assist fixtures (CanAssistTo).
      factionId: 25, callForHelpRadius: 5,
      // System 9 sample: detection + structured cast (fixture spell 999003)
      detectionRange: 18,
      creatureCasts: [{ spellId: 999003, eventType: 0, initialMinMs: 0, initialMaxMs: 0, repeatMinMs: 5000, repeatMaxMs: 5000 }],
    },
    {
      entry: 6982, name: 'Kobold Laborer', level: 2, hpMin: 55, hpMax: 64, dmgMin: 4, dmgMax: 6, attackTimeMs: 2000, armor: 40,
      lootId: 6982, minGold: 1, maxGold: 6, xp: 55,
      factionId: 25, callForHelpRadius: 5,
    },
    { entry: 299, name: 'Young Forest Wolf', level: 3, hpMin: 70, hpMax: 82, dmgMin: 6, dmgMax: 9, attackTimeMs: 2000, armor: 45, lootId: 299, minGold: 0, maxGold: 4, xp: 70, creatureType: 1, family: 1, tameable: true },
    { entry: 448, name: 'Defias Bandit', level: 4, hpMin: 90, hpMax: 105, dmgMin: 8, dmgMax: 12, attackTimeMs: 2000, armor: 60, lootId: 448, minGold: 4, maxGold: 12, xp: 95 },
  ],

  items: [
    // entry 25: itemLevel/itemClass/itemSubclass for DBC repair-cost (Player.cpp:4656) from
    // live bake. maxDurability left unset so fixture tests keep the slot heuristic max (80).
    { entry: 25, name: 'Worn Shortsword', quality: 1, requiredLevel: 1, sellPrice: 1, buyPrice: 7, stackable: 1, slot: 'mainhand', weapon: { dmgMin: 3, dmgMax: 5, delayMs: 1900, school: 'physical' }, weaponSubclass: 7, typeName: 'Sword', itemLevel: 2, itemClass: 2, itemSubclass: 7 },
    { entry: 35, name: 'Worn Dagger', quality: 1, requiredLevel: 1, sellPrice: 1, buyPrice: 5, stackable: 1, slot: 'mainhand', weapon: { dmgMin: 2, dmgMax: 4, delayMs: 1600, school: 'physical' }, weaponSubclass: 15, typeName: 'Dagger' },
    { entry: 2299, name: "Bandit's Dagger", quality: 2, requiredLevel: 4, sellPrice: 24, buyPrice: 120, stackable: 1, slot: 'mainhand', weapon: { dmgMin: 5, dmgMax: 9, delayMs: 1800, school: 'physical' }, stats: [{ stat: 'agi', value: 2 }] },
    // Equippable armor/off-hand/ranged/two-hand fixtures for the equipment tests.
    { entry: 942, name: 'Bronze Band', quality: 1, requiredLevel: 1, sellPrice: 5, buyPrice: 25, stackable: 1, slot: 'finger', stats: [{ stat: 'str', value: 1 }], setId: 42, procs: [{ spell: 999001, trigger: 2, chancePct: 15 }] },
    // Second piece for 2-piece set bonus test (E1)
    { entry: 999100, name: 'Bronze Signet', quality: 1, requiredLevel: 1, sellPrice: 5, buyPrice: 25, stackable: 1, slot: 'finger', stats: [{ stat: 'agi', value: 1 }], setId: 42 },
    // 1364/2362/15906: DBC repair fields from item-data (no maxDurability — keep heuristic max).
    { entry: 1364, name: 'Ragged Leather Vest', quality: 0, requiredLevel: 1, sellPrice: 8, buyPrice: 41, stackable: 1, slot: 'chest', armor: 31, typeName: 'Leather', armorSubclass: 2, itemLevel: 5, itemClass: 4, itemSubclass: 2 },
    { entry: 2362, name: 'Worn Wooden Shield', quality: 1, requiredLevel: 1, sellPrice: 3, buyPrice: 17, stackable: 1, slot: 'offhand', armor: 20, typeName: 'Shield', armorSubclass: 6, itemLevel: 1, itemClass: 4, itemSubclass: 6 },
    // Off-hand weapon (INVTYPE_WEAPONOFFHAND) for dual-wield path tests — not a shield.
    { entry: 15906, name: 'Left-Handed Brass Knuckles', quality: 1, requiredLevel: 1, sellPrice: 4, buyPrice: 20, stackable: 1, slot: 'offhand', weapon: { dmgMin: 6, dmgMax: 13, delayMs: 1400, school: 'physical' }, typeName: 'Fist Weapon', weaponSubclass: 13, itemLevel: 15, itemClass: 2, itemSubclass: 13 },
    { entry: 2178, name: 'Battleworn Greatsword', quality: 1, requiredLevel: 3, sellPrice: 30, buyPrice: 150, stackable: 1, slot: 'twohand', weapon: { dmgMin: 8, dmgMax: 14, delayMs: 3200, school: 'physical' }, typeName: 'Two-Handed Sword', weaponSubclass: 8 },
    // Polearm for weapon-master train → equip gate tests (no create skill for warriors here).
    { entry: 1406, name: 'Pearl-encrusted Spear', quality: 1, requiredLevel: 1, sellPrice: 10, buyPrice: 50, stackable: 1, slot: 'twohand', weapon: { dmgMin: 5, dmgMax: 8, delayMs: 2800, school: 'physical' }, typeName: 'Polearm', weaponSubclass: 6 },
    { entry: 4536, name: 'Freshly Baked Bread', quality: 1, requiredLevel: 1, sellPrice: 0, buyPrice: 1, stackable: 20, consumable: { effect: 'food', amountPerTick: 4, tickMs: 3000, durationMs: 21000, reqLevel: 1 } },
    { entry: 159, name: 'Refreshing Spring Water', quality: 1, requiredLevel: 1, sellPrice: 0, buyPrice: 1, stackable: 20, consumable: { effect: 'drink', amountPerTick: 8, tickMs: 3000, durationMs: 21000, reqLevel: 1 } },
    { entry: 5349, name: 'Conjured Muffin', quality: 1, requiredLevel: 1, sellPrice: 0, buyPrice: 0, stackable: 20, consumable: { effect: 'food', amountPerTick: 8, tickMs: 3000, durationMs: 21000, reqLevel: 1 } },
    { entry: 5350, name: 'Conjured Water', quality: 1, requiredLevel: 1, sellPrice: 0, buyPrice: 0, stackable: 20, consumable: { effect: 'drink', amountPerTick: 12, tickMs: 3000, durationMs: 21000, reqLevel: 1 } },
    // useBuff consumables (from items): correct duration + data from DB-mapped spell effect.
    // These demonstrate elixirs/scrolls that apply buffs (plan option 1a useBuff).
    { entry: 2454, name: "Elixir of Lion's Strength", quality: 1, requiredLevel: 1, sellPrice: 20, buyPrice: 100, stackable: 20, useBuff: { mod: 'strength', amount: 4, durationMs: 3600_000, reqLevel: 1 } },
    { entry: 118, name: 'Minor Healing Potion', quality: 1, requiredLevel: 1, sellPrice: 5, buyPrice: 20, stackable: 5, useInCombat: { effect: 'restore_health', min: 50, max: 70, reqLevel: 1 } },
    { entry: 2589, name: 'Linen Cloth', quality: 1, requiredLevel: 0, sellPrice: 1, buyPrice: 0, stackable: 10 },
    { entry: 2672, name: 'Stringy Wolf Meat', quality: 1, requiredLevel: 0, sellPrice: 1, buyPrice: 0, stackable: 5 },
    // Bags: equipping one into a bag slot adds `bagSlots` to the backpack (or bank) capacity.
    { entry: 805, name: 'Small Red Pouch', quality: 1, requiredLevel: 0, sellPrice: 250, buyPrice: 1000, stackable: 1, slot: 'bag', bagSlots: 6 },
    { entry: 4500, name: 'Traveler\'s Backpack', quality: 1, requiredLevel: 0, sellPrice: 1000, buyPrice: 5000, stackable: 1, slot: 'bag', bagSlots: 16 },
  ],

  loot: [
    { lootId: 6981, entries: [
      { item: 2589, chance: 25, groupId: 0, minCount: 1, maxCount: 1 },
      { item: 4536, chance: 12, groupId: 0, minCount: 1, maxCount: 1 },
    ] },
    { lootId: 6982, entries: [
      { item: 2589, chance: 30, groupId: 0, minCount: 1, maxCount: 2 },
      { item: 159, chance: 10, groupId: 0, minCount: 1, maxCount: 1 },
    ] },
    { lootId: 299, entries: [
      { item: 2672, chance: 45, groupId: 0, minCount: 1, maxCount: 2 },
      { item: 4536, chance: 10, groupId: 0, minCount: 1, maxCount: 1 },
    ] },
    { lootId: 448, entries: [
      { item: 2589, chance: 40, groupId: 0, minCount: 1, maxCount: 2 },
      { item: 2299, chance: 8, groupId: 0, minCount: 1, maxCount: 1 },
    ] },
  ],

  quests: [
    { entry: 7, title: 'Kobold Camp Cleanup', questLevel: 1, minLevel: 1,
      detailsText: 'Kobolds have overrun the mines around Northshire. Beat back ten of their vermin.',
      objectivesText: 'Slay 10 Kobold Vermin.',
      killTargets: [{ creatureEntry: 6981, count: 10 }], itemTargets: [], objectTargets: [], rewMoney: 38, rewXP: 45, rewItems: [],
      // prevQuest 700 is a talk-only intro the ETL prunes (no kill/item objective), and a pruned
      // prerequisite must be treated as satisfied so this chain still starts — see prereqMet.
      starterName: 'Marshal McBride', enderName: 'Marshal McBride', prevQuest: 700, nextQuest: 37 },
    { entry: 37, title: 'Echo Ridge', questLevel: 2, minLevel: 2,
      detailsText: 'The laborers dig ever deeper. Put a stop to them inside the mine.',
      objectivesText: 'Slay 8 Kobold Laborers.',
      killTargets: [{ creatureEntry: 6982, count: 8 }], itemTargets: [], objectTargets: [], rewMoney: 60, rewXP: 70, rewItems: [],
      starterName: 'Marshal McBride', enderName: 'Marshal McBride', nextQuest: 62 },
    { entry: 62, title: 'Wolves Across the Border', questLevel: 4, minLevel: 3,
      detailsText: 'The wolf packs south of Goldshire grow bold. Thin their numbers.',
      objectivesText: 'Slay 6 Young Forest Wolves.',
      killTargets: [{ creatureEntry: 299, count: 6 }], itemTargets: [], objectTargets: [], rewMoney: 90, rewXP: 110, rewItems: [],
      starterName: 'Marshal Dughan', enderName: 'Marshal Dughan', nextQuest: 87 },
    { entry: 87, title: 'The Defias Threat', questLevel: 5, minLevel: 4,
      detailsText: 'The Defias Brotherhood plagues the roads. Cut down their bandits.',
      objectivesText: 'Slay 5 Defias Bandits.',
      killTargets: [{ creatureEntry: 448, count: 5 }], itemTargets: [], objectTargets: [], rewMoney: 150, rewXP: 150,
      rewItems: [{ item: 2299, count: 1 }],
      // Chain follow-up to quest 62: only offerable once 62 has been turned in.
      starterName: 'Marshal Dughan', enderName: 'Marshal Dughan', prevQuest: 62 },
    // Dungeon quest for the Test Delve instance (Phase 5): kill its boss.
    { entry: 950, title: 'Into the Delve', questLevel: 4, minLevel: 1,
      detailsText: 'Clear the delve and slay the overseer leading the kobolds within.',
      objectivesText: 'Slay the Delve Warlord.',
      killTargets: [{ creatureEntry: 6982, count: 1 }], itemTargets: [], objectTargets: [], rewMoney: 100, rewXP: 120, rewItems: [],
      starterName: 'Marshal Dughan', enderName: 'Marshal Dughan' },

    // Lane H objective-kind fixtures (for source-item, spell-cast, rep, timed, objective-less, unbaked-target)
    // objective-less: talk/deliver style — still satisfiable on turn-in (vacuously complete)
    { entry: 9901, title: 'Just a Talk', questLevel: 1, minLevel: 1,
      detailsText: 'Go speak to someone.', objectivesText: 'Speak to the contact.',
      killTargets: [], itemTargets: [], objectTargets: [], sourceItemTargets: [], spellCastTargets: [],
      repObjective: undefined, limitTime: undefined,
      rewMoney: 10, rewXP: 10, rewItems: [], starterName: 'Talker', enderName: 'Talker' },
    // source-item behaves like gather: check inventory
    { entry: 9902, title: 'Source Linen', questLevel: 1, minLevel: 1,
      detailsText: 'Bring source linen.', objectivesText: 'Acquire 2 linen.',
      killTargets: [], itemTargets: [], objectTargets: [], sourceItemTargets: [{ item: 2589, count: 2 }], spellCastTargets: [],
      repObjective: undefined, limitTime: undefined,
      rewMoney: 5, rewXP: 5, rewItems: [], starterName: 'Sourcer', enderName: 'Sourcer' },
    // spell-cast: data-only, do not affect complete
    { entry: 9903, title: 'Cast Test', questLevel: 1, minLevel: 1,
      detailsText: 'Cast something.', objectivesText: 'Cast the spell.',
      killTargets: [], itemTargets: [], objectTargets: [], sourceItemTargets: [], spellCastTargets: [{ spell: 133, count: 1 }],
      repObjective: undefined, limitTime: undefined,
      rewMoney: 5, rewXP: 5, rewItems: [], starterName: 'Caster', enderName: 'Caster' },
    // reputation requirement: expose, do NOT auto-complete (pure rep case)
    { entry: 9904, title: 'Earn Rep', questLevel: 1, minLevel: 1,
      detailsText: 'Gain standing.', objectivesText: 'Raise rep with a faction.',
      killTargets: [], itemTargets: [], objectTargets: [], sourceItemTargets: [], spellCastTargets: [],
      repObjective: { faction: 72, value: 100 }, limitTime: undefined,
      rewMoney: 5, rewXP: 5, rewItems: [], starterName: 'Repper', enderName: 'Repper' },
    // timed: surface limit but never fail a run / block complete on it
    { entry: 9905, title: 'Timed Errand', questLevel: 1, minLevel: 1,
      detailsText: 'Do it quickly.', objectivesText: 'Finish within time.',
      killTargets: [], itemTargets: [], objectTargets: [], sourceItemTargets: [], spellCastTargets: [],
      repObjective: undefined, limitTime: 300,
      rewMoney: 5, rewXP: 5, rewItems: [], starterName: 'Timer', enderName: 'Timer' },
    // unbaked required target (non-existent item id): must NOT be falsely marked complete
    { entry: 9906, title: 'Unbaked Source', questLevel: 1, minLevel: 1,
      detailsText: 'Need phantom item.', objectivesText: 'Get the phantom.',
      killTargets: [], itemTargets: [], objectTargets: [], sourceItemTargets: [{ item: 99999999, count: 1 }], spellCastTargets: [],
      repObjective: undefined, limitTime: undefined,
      rewMoney: 0, rewXP: 0, rewItems: [], starterName: 'Ghost', enderName: 'Ghost' },
    // Multi-item collect: 2589 drops from local kobolds, 88888 from nothing huntable here. With
    // only 2589 collected this must NOT read as "huntable here", or the autopilot picks it blind.
    { entry: 9910, title: 'Blood Sausages', questLevel: 1, minLevel: 1,
      detailsText: 'Gather the makings for sausages.', objectivesText: 'Collect 2 linen and 1 phantom relish.',
      killTargets: [], itemTargets: [{ item: 2589, count: 2 }, { item: 88888, count: 1 }], objectTargets: [],
      sourceItemTargets: [], spellCastTargets: [], repObjective: undefined, limitTime: undefined,
      rewMoney: 5, rewXP: 10, rewItems: [], starterName: 'Sausage Cook', enderName: 'Sausage Cook' },
  ],

  trainers: [
    { entry: 200, name: 'Khelden Bremen', spells: [
      { spell: 168, cost: 10, reqLevel: 1, reqSkill: 0, reqSkillValue: 0 },
      { spell: 5504, cost: 10, reqLevel: 1, reqSkill: 0, reqSkillValue: 0 },
      { spell: 587, cost: 10, reqLevel: 1, reqSkill: 0, reqSkillValue: 0 },
      { spell: 116, cost: 100, reqLevel: 4, reqSkill: 0, reqSkillValue: 0 },
      { spell: 2136, cost: 250, reqLevel: 6, reqSkill: 0, reqSkillValue: 0 },
      { spell: 122, cost: 250, reqLevel: 6, reqSkill: 0, reqSkillValue: 0 },
    ] },
    { entry: 201, name: 'Llane Beshere', spells: [
      { spell: 100, cost: 10, reqLevel: 1, reqSkill: 0, reqSkillValue: 0 },
      { spell: 6673, cost: 10, reqLevel: 1, reqSkill: 0, reqSkillValue: 0 },
      { spell: 772, cost: 100, reqLevel: 4, reqSkill: 0, reqSkillValue: 0 },
    ] },
    // Weapon master (TrainerType=2): teaches Polearms proficiency → grants combat skill 229.
    { entry: 11867, name: 'Woo Ping', subname: 'Weapon Master', spells: [
      { spell: 200, cost: 1000, reqLevel: 1, reqSkill: 0, reqSkillValue: 0 },
    ] },
  ],

  vendors: [
    // A general-goods merchant per zone: provisions plus a few cheap basics.
    { entry: 300, name: 'Erma Squerkins', items: [4536, 159, 25, 2362, 1364] },
    { entry: 301, name: 'Corina Steele', items: [4536, 159, 35, 2299, 2178] },
  ],

  createInfo: [
    // skills mirror playercreateinfo_skills (skill id + step). Warrior: swords + armor materials + defense.
    { race: H, cls: W, startZone: 'northshire', spells: [78], items: [{ item: 25, amount: 1 }, { item: 4536, amount: 4 }],
      skills: [
        { skill: 43, step: 0 }, { skill: 55, step: 0 }, // swords + 2H swords (equip tests)
        { skill: 95, step: 0 }, { skill: 162, step: 0 },
        { skill: 26, step: 0 }, { skill: 256, step: 0 }, { skill: 257, step: 0 },
        { skill: 415, step: 0 }, { skill: 414, step: 0 }, { skill: 413, step: 0 }, { skill: 433, step: 0 },
        { skill: 473, step: 0 }, // fist weapons proficiency
      ] },
    // Mage starts with a weapon AND a ring, so the "auto-equip the whole starter kit" path is covered.
    { race: H, cls: M, startZone: 'northshire', spells: [133], items: [{ item: 35, amount: 1 }, { item: 942, amount: 1 }, { item: 4536, amount: 4 }, { item: 159, amount: 4 }],
      skills: [{ skill: 173, step: 0 }, { skill: 95, step: 0 }, { skill: 162, step: 0 }, { skill: 6, step: 0 }, { skill: 8, step: 0 }, { skill: 415, step: 0 }] },
  ],

  // Combat skill meta: SkillLineAbility learnOnGetSkill → spell grants weapon/armor skills.
  // Cite: Player.cpp UpdateSpellTrainedSkills; SkillLineAbility.learnOnGetSkill = 2.
  combatSkillMeta: {
    spellGrants: {
      201: 43,   // One-Handed Swords → SWORDS
      200: 229,  // Polearms → POLEARMS
      750: 293,  // Plate Mail → PLATE
      15590: 473, // Fist Weapons → FIST
    },
    // SkillLineAbility classMask (vanilla): sourced masks for train gating tests.
    // 200 Polearms classMask 7 = Warrior|Paladin|Hunter; 201 1H Swords 399 = War|Pal|Hunt|Rog|Mage|Lock.
    spellAbilities: {
      200: [{ skillId: 229, raceMask: 0, classMask: 7 }],
      201: [{ skillId: 43, raceMask: 0, classMask: 399 }],
      15590: [{ skillId: 473, raceMask: 0, classMask: 1101 }],
    },
  },

  // A minimal two-faction race table. `racials` reference real fixture spells so racialSpells()
  // resolves, and Undead has a narrower class list to exercise the race/class matrix.
  races: [
    { id: 1, name: 'Human', faction: 'alliance', startZone: 'northshire', city: 'Stormwind', classes: [W, M], racials: [78] },
    { id: 5, name: 'Undead', faction: 'horde', startZone: 'northshire', city: 'Undercity', classes: [M], racials: [133] },
  ],

  levelStats: [
    // Warrior (Human)
    { race: H, cls: W, level: 1, stats: { str: 23, agi: 20, sta: 22, int: 20, spi: 20 } },
    { race: H, cls: W, level: 2, stats: { str: 24, agi: 20, sta: 23, int: 20, spi: 20 } },
    { race: H, cls: W, level: 3, stats: { str: 25, agi: 21, sta: 24, int: 20, spi: 20 } },
    { race: H, cls: W, level: 4, stats: { str: 26, agi: 21, sta: 25, int: 20, spi: 21 } },
    { race: H, cls: W, level: 5, stats: { str: 27, agi: 22, sta: 27, int: 20, spi: 21 } },
    { race: H, cls: W, level: 6, stats: { str: 29, agi: 22, sta: 28, int: 20, spi: 21 } },
    // Mage (Human)
    { race: H, cls: M, level: 1, stats: { str: 20, agi: 20, sta: 20, int: 23, spi: 21 } },
    { race: H, cls: M, level: 2, stats: { str: 20, agi: 20, sta: 20, int: 24, spi: 21 } },
    { race: H, cls: M, level: 3, stats: { str: 20, agi: 21, sta: 21, int: 25, spi: 22 } },
    { race: H, cls: M, level: 4, stats: { str: 21, agi: 21, sta: 21, int: 27, spi: 22 } },
    { race: H, cls: M, level: 5, stats: { str: 21, agi: 21, sta: 22, int: 28, spi: 23 } },
    { race: H, cls: M, level: 6, stats: { str: 21, agi: 22, sta: 22, int: 30, spi: 23 } },
  ],

  classLevelStats: [
    { cls: W, level: 1, baseHp: 40, baseMana: 0 },
    { cls: W, level: 2, baseHp: 52, baseMana: 0 },
    { cls: W, level: 3, baseHp: 64, baseMana: 0 },
    { cls: W, level: 4, baseHp: 78, baseMana: 0 },
    { cls: W, level: 5, baseHp: 92, baseMana: 0 },
    { cls: W, level: 6, baseHp: 106, baseMana: 0 },
    { cls: M, level: 1, baseHp: 30, baseMana: 100 },
    { cls: M, level: 2, baseHp: 38, baseMana: 115 },
    { cls: M, level: 3, baseHp: 46, baseMana: 130 },
    { cls: M, level: 4, baseHp: 55, baseMana: 150 },
    { cls: M, level: 5, baseHp: 64, baseMana: 170 },
    { cls: M, level: 6, baseHp: 73, baseMana: 190 },
  ],

  xp: [
    { level: 1, toNext: 400 },
    { level: 2, toNext: 900 },
    { level: 3, toNext: 1400 },
    { level: 4, toNext: 2100 },
    { level: 5, toNext: 2800 },
    { level: 6, toNext: 3600 },
  ],

  zones: [
    // Northshire carries compact fixture spawns so spatial pull tests need no ETL. Coords are yards
    // in a toy map, and areaId 12 is the Elwynn stand-in for weather-by-zone tests.
    { id: 'northshire', name: 'Northshire Valley', levelRange: [1, 5],
      areaId: 12,
      description: '',
      quests: [7, 37], huntable: [6981, 6982],
      trainers: [{ cls: M, entry: 200 }, { cls: W, entry: 201 }], weaponTrainers: [11867], vendors: [300], neighbors: ['goldshire'],
      spawns: [
        { entry: 6981, map: 0, x: 0, y: 0 },
        { entry: 6982, map: 0, x: 8, y: 0 },
        { entry: 6982, map: 0, x: 80, y: 0 },
      ] },
    { id: 'goldshire', name: 'Goldshire', levelRange: [4, 10],
      description: '',
      quests: [62, 87], huntable: [299, 448],
      trainers: [{ cls: M, entry: 200 }, { cls: W, entry: 201 }], vendors: [301], neighbors: ['northshire'] },
  ],

  // P-after-E slim game_weather row keyed by AreaTable id (northshire.areaId = 12).
  zoneWeather: [
    {
      zone: 12,
      spring: { rain: 70, snow: 0, storm: 5 },
      summer: { rain: 40, snow: 0, storm: 10 },
      fall: { rain: 50, snow: 5, storm: 5 },
      winter: { rain: 20, snow: 40, storm: 5 },
    },
  ],

  // Phase 5: one small instance for the framework tests — trash pull then a boss
  // with a cost-0 ability, reachable from Northshire, offering a dungeon quest.
  instances: [
    { id: 'testdelve', name: 'Test Delve', portalZone: 'northshire', minLevel: 1,
      // Fake high id per the 95xxxx placeholder convention — this delve has no real Map.dbc row.
      mapId: 950001,
      levelRange: [2, 4], lockoutMs: 0,
      description: '',
      quests: [950],
      encounters: [
        { id: 'pull', name: 'Vermin Nest', kind: 'trash', creatureEntry: 6981 },
        { id: 'warlord', name: 'Delve Warlord', kind: 'boss', creatureEntry: 6982, bossSpells: [950000],
          intro: 'The kobold overseer draws a rusted blade.' },
      ] },
  ],

  // Talents (Phase A): fixture has none so pre-talent code paths + tests continue to work.
  talents: [],
  // R8b sounds absent in fixture (tests use procedural fallbacks)
  spellSounds: {},
  creatureSounds: {},
  // E1: item sets (for set-bonus spell application in character derivation + combat)
  itemSets: [
    { id: 42, name: 'Bronze Test Set', items: [942, 999100], bonuses: [{ pieces: 2, spell: 999002 }] },
  ],
  // D3.5: tiny slice of the ike3 ai_playerbot_names pool (seed-bot-names.mjs bakes the full one)
  botNames: {
    male: ['Aalart', 'Abantes', 'Bramm', 'Cedrik'],
    female: ['Abbie', 'Adela', 'Brenna', 'Caris'],
  },
  // Tiny slice of the premade playerbot specs (seed-bot-specs.mjs bakes the full set). Fixture has no
  // talents, so links resolve to empty talent maps — spec/role picking and persistence stay testable.
  botSpecs: {
    1: [
      { name: 'pve arms', prob: 100, role: 'dps', stages: [{ level: 60, link: '303050213520105001-0505300502' }] },
      { name: 'pve prot', prob: 100, role: 'tank', stages: [{ level: 60, link: '05005001-05-55250110530101051' }] },
    ],
  },
};
