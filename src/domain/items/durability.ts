// Item durability and repair: gear wears as you fight, breaks at 0 and a vendor mends it for gold.
// Repair copper comes from the baked DBC tables, never sellPrice. Cite: Player.cpp:4635–4677.

import type { EquipSlot, ItemSlot, ItemDef } from '../../data/schema.ts';
import type { Character } from '../character/character.ts';
import type { EquippedValue } from './itemInstance.ts';
import { equippedEntry } from './itemInstance.ts';
import type { Rng } from '../../engine/core/rng.ts';
import type { CombatEvent, Side } from '../../engine/core/events.ts';
import { isEnemySide } from '../../engine/core/events.ts';
import durabilityCostsTable from '../../data/tables/durabilityCosts.json' with { type: 'json' };
import durabilityQualityTable from '../../data/tables/durabilityQuality.json' with { type: 'json' };

/** Current durability points per paperdoll slot. Absent slot => full (freshly equipped). */
export type DurabilityMap = Partial<Record<EquipSlot, number>>;

/** Death costs 10% of every equipped item's max durability (Unit.cpp:1152). */
export const DEATH_LOSS_FRACTION = 0.1;
// Spirit healer res costs 25% durability, equipped and bags in CMaNGOS; we apply it to equipped
// durable slots only. Cite: NPCHandler.cpp SendSpiritResurrect DurabilityLossAll(0.25f, true).
export const SPIRIT_HEALER_LOSS_FRACTION = 0.25;

// CMaNGOS EQUIPMENT_SLOT_END. HandleDamageDealt rolls urand(0, END-1) then loses a point only if
// that slot has an item, so jewelry and empty rolls are no-ops. Cite: Player.h:580.
export const EQUIPMENT_SLOT_END = 19;

/** EquipmentSlots 0..18 → paperdoll. Index 18 is TABARD (no EquipSlot here). Cite: Player.h:560–580. */
export const EQUIPMENT_SLOTS_BY_INDEX: readonly (EquipSlot | null)[] = [
  'head', 'neck', 'shoulder', 'shirt', 'chest', 'waist', 'legs', 'feet',
  'wrist', 'hands', 'finger1', 'finger2', 'trinket1', 'trinket2', 'back',
  'mainhand', 'offhand', 'ranged',
  null,
];

/** @deprecated sellPrice heuristic, removed from itemRepairCost. Kept only so old comparison
 * scripts can reimplement the pre-DBC formula. Do not use for billing. */
export const REPAIR_COST_FACTOR = 0.5;

/** ItemPrototype.h ITEM_CLASS_WEAPON / ITEM_CLASS_ARMOR — durability multiplier columns. */
export const ITEM_CLASS_WEAPON = 2;
export const ITEM_CLASS_ARMOR = 4;

// Baked DurabilityCosts.dbc row count for the t0 full table, asserted at module load. TRAP: the
// DBFilesClient copy has only 100 rows and the extractor must refuse it.
export const DURABILITY_COSTS_ROW_COUNT = (durabilityCostsTable as { rowCount: number }).rowCount;
export const DURABILITY_QUALITY_ROW_COUNT = (durabilityQualityTable as { rowCount: number }).rowCount;

const COSTS_BY_ILVL = (durabilityCostsTable as {
  multipliersByItemLevel: Record<string, number[]>;
}).multipliersByItemLevel;

const QUALITY_MOD_BY_ID = (durabilityQualityTable as {
  qualityModById: Record<string, number>;
}).qualityModById;

if (DURABILITY_COSTS_ROW_COUNT !== 300) {
  throw new Error(
    `durabilityCosts.json rowCount=${DURABILITY_COSTS_ROW_COUNT} - expected 300 (t0 DBC). ` +
      `Truncated DBFilesClient (100 rows) zeroes repair above item level 100.`,
  );
}
if (DURABILITY_QUALITY_ROW_COUNT !== 14) {
  throw new Error(
    `durabilityQuality.json rowCount=${DURABILITY_QUALITY_ROW_COUNT} - expected 14`,
  );
}

// ItemSubClassToDurabilityMultiplierId (ItemPrototype.h:383). Weapon → subclass index; armor → subclass +
// 21; else 0.
export function itemSubClassToDurabilityMultiplierId(
  itemClass: number,
  itemSubClass: number,
): number {
  if (itemClass === ITEM_CLASS_WEAPON) return itemSubClass;
  if (itemClass === ITEM_CLASS_ARMOR) return itemSubClass + 21;
  return 0;
}

/** DurabilityCosts multiplier for (itemLevel, class, subclass), or undefined if missing. */
export function durabilityCostMultiplier(
  itemLevel: number,
  itemClass: number,
  itemSubClass: number,
): number | undefined {
  const row = COSTS_BY_ILVL[String(itemLevel | 0)];
  if (!row) return undefined;
  const idx = itemSubClassToDurabilityMultiplierId(itemClass, itemSubClass);
  const m = row[idx];
  return m === undefined ? undefined : m;
}

/** DurabilityQuality.quality_mod for item quality. Lookup id = (Quality + 1) * 2 — Player.cpp:4663. */
export function durabilityQualityMod(quality: number): number | undefined {
  const id = (quality + 1) * 2;
  const mod = QUALITY_MOD_BY_ID[String(id)];
  return mod === undefined ? undefined : mod;
}

// Default combat durability-loss chances (World.cpp:459-462 setConfigPos defaults). These are
// PERCENTAGE POINTS: roll_chance_f compares against rand_chance(), uniform 0..100 (Util.h:81,
// Util.cpp:110), so 0.5f is half of one percent per damage packet, not half the packets.
export const DURABILITY_LOSS_CHANCE_DAMAGE = 0.5;  // DurabilityLossChance.Damage
export const DURABILITY_LOSS_CHANCE_ABSORB = 0.5;  // DurabilityLossChance.Absorb
export const DURABILITY_LOSS_CHANCE_PARRY = 0.05;  // DurabilityLossChance.Parry
export const DURABILITY_LOSS_CHANCE_BLOCK = 0.05;  // DurabilityLossChance.Block

/** Named event keys for combat wear (caller supplies the matching rate). */
export type DurabilityWearEvent = 'damage' | 'absorb' | 'parry' | 'block';

/** World.cpp defaults keyed by event name, in percentage points. */
export const DEFAULT_DURABILITY_LOSS_CHANCES: Readonly<Record<DurabilityWearEvent, number>> = {
  damage: DURABILITY_LOSS_CHANCE_DAMAGE,
  absorb: DURABILITY_LOSS_CHANCE_ABSORB,
  parry: DURABILITY_LOSS_CHANCE_PARRY,
  block: DURABILITY_LOSS_CHANCE_BLOCK,
};

// Slot-based max durability, roughly tracking vanilla low-level gear. Jewelry
// (neck/finger/trinket) has no durability, so it never breaks or needs repair.
const BASE_BY_SLOT: Record<ItemSlot, number> = {
  head: 55, neck: 0, shoulder: 55, back: 35, chest: 105, shirt: 0, wrist: 35,
  hands: 45, waist: 40, legs: 105, feet: 55, finger: 0, trinket: 0,
  mainhand: 80, offhand: 80, twohand: 120, ranged: 65, bag: 0, // bags don't wear out
};

// Higher-quality gear is sturdier (mild factor, keeps epics worth repairing).
function qualityFactor(quality: number): number {
  if (quality >= 4) return 1.5; // epic+
  if (quality === 3) return 1.3; // rare
  if (quality === 2) return 1.15; // uncommon
  return 1; // poor/common
}

/** True if the item is the kind that wears down (weapon or armor piece). */
export function hasDurability(item: ItemDef): boolean {
  return !!item.weapon || (item.armor ?? 0) > 0;
}

// Max durability of an item; 0 is indestructible. Prefers the real item_template.MaxDurability,
// with the slot and quality heuristic only as a fallback for items baked before that field.
export function maxDurability(item: ItemDef): number {
  if (item.maxDurability != null) return item.maxDurability;
  if (!item.slot || !hasDurability(item)) return 0;
  const base = BASE_BY_SLOT[item.slot] ?? 0;
  if (base <= 0) return 0;
  return Math.round(base * qualityFactor(item.quality));
}

/** Current durability of the item in `slot` (defaults to full when untracked). */
export function currentDurability(char: Character, slot: EquipSlot, item: ItemDef): number {
  const max = maxDurability(item);
  if (max <= 0) return 0;
  const stored = char.durability?.[slot];
  if (stored == null) return max;
  return Math.max(0, Math.min(max, stored));
}

/** A durable item at 0 points is broken and contributes none of its stats/damage/armor. */
export function isBroken(char: Character, slot: EquipSlot, item: ItemDef): boolean {
  return maxDurability(item) > 0 && currentDurability(char, slot, item) <= 0;
}

// Client GetInventoryAlertStatus band (0–4) from remaining durability: >75%→0, >50%→1, >25%→2,
// >0%→3, 0→4. Only 3 and 4 are tinted. Cite: FrameXML DurabilityFrame.lua.
export type InventoryAlertStatus = 0 | 1 | 2 | 3 | 4;

export function inventoryAlertStatus(current: number, max: number): InventoryAlertStatus {
  if (max <= 0) return 0;
  if (current <= 0) return 4;
  const r = current / max;
  if (r <= 0.25) return 3;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 1;
  return 0;
}

/** Vertex colours for DurabilityFrame — InterfaceFromPatch DurabilityFrame.lua:14–20. */
export const INVENTORY_ALERT_COLORS: Readonly<
  Record<InventoryAlertStatus, { r: number; g: number; b: number } | null>
> = {
  0: null,
  1: null,
  2: null,
  3: { r: 1, g: 0.82, b: 0.18 },
  4: { r: 0.93, g: 0.07, b: 0.07 },
};

/** Durability mannequin body slots (not weapon/shield/ranged). Cite: DurabilityFrame.lua:1–8. */
export type DurabilityAlertId =
  | 'Head' | 'Shoulders' | 'Chest' | 'Waist' | 'Legs' | 'Feet' | 'Wrists' | 'Hands'
  | 'Weapon' | 'Shield' | 'OffWeapon' | 'Ranged';

export interface DurabilityAlertPiece {
  id: DurabilityAlertId;
  /** Paperdoll slot used for durability lookup. */
  slot: EquipSlot;
  status: InventoryAlertStatus;
  current: number;
  max: number;
  /** showSeparate — weapon/offhand/ranged only appear when that piece is alerted. */
  showSeparate: boolean;
}

// Alert pieces for DurabilityFrame_SetAlerts: the body silhouette shows when any body piece has
// a colour, and separate slots only when themselves alerted. Cite: DurabilityFrame.lua.
export function durabilityAlertPieces(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
): DurabilityAlertPiece[] {
  // FrameXML index order 1..11 → equip slots. Shield vs OffWeapon chosen by offhand kind.
  const body: Array<{ id: DurabilityAlertId; slot: EquipSlot; showSeparate: false }> = [
    { id: 'Head', slot: 'head', showSeparate: false },
    { id: 'Shoulders', slot: 'shoulder', showSeparate: false },
    { id: 'Chest', slot: 'chest', showSeparate: false },
    { id: 'Waist', slot: 'waist', showSeparate: false },
    { id: 'Legs', slot: 'legs', showSeparate: false },
    { id: 'Feet', slot: 'feet', showSeparate: false },
    { id: 'Wrists', slot: 'wrist', showSeparate: false },
    { id: 'Hands', slot: 'hands', showSeparate: false },
  ];
  const out: DurabilityAlertPiece[] = [];
  for (const row of body) {
    const piece = alertForSlot(char, itemOf, row.slot, row.id, false);
    if (piece) out.push(piece);
  }
  const mh = alertForSlot(char, itemOf, 'mainhand', 'Weapon', true);
  if (mh) out.push(mh);
  const ohEntry = equippedEntry(char.equipped.offhand);
  const ohItem = ohEntry != null ? itemOf(ohEntry) : undefined;
  // OffhandHasWeapon → DurabilityOffWeapon, else DurabilityShield. Cite: SetAlerts Shield branch.
  const ohId: DurabilityAlertId = ohItem?.weapon ? 'OffWeapon' : 'Shield';
  const oh = alertForSlot(char, itemOf, 'offhand', ohId, true);
  if (oh) out.push(oh);
  const rg = alertForSlot(char, itemOf, 'ranged', 'Ranged', true);
  if (rg) out.push(rg);
  return out;
}

function alertForSlot(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
  slot: EquipSlot,
  id: DurabilityAlertId,
  showSeparate: boolean,
): DurabilityAlertPiece | null {
  const entry = equippedEntry(char.equipped[slot]);
  if (entry == null) return null;
  const item = itemOf(entry);
  if (!item) return null;
  const max = maxDurability(item);
  if (max <= 0) return null;
  const current = currentDurability(char, slot, item);
  return {
    id,
    slot,
    status: inventoryAlertStatus(current, max),
    current,
    max,
    showSeparate,
  };
}

/** True when DurabilityFrame should be visible (any piece has a non-nil alert colour). */
export function durabilityFrameVisible(pieces: readonly DurabilityAlertPiece[]): boolean {
  return pieces.some((p) => INVENTORY_ALERT_COLORS[p.status] != null);
}

// Copper to fully repair one item, the sourced Player::DurabilityRepair formula off DurabilityCosts
// and DurabilityQuality, floored at 1. A missing ItemLevel or DBC row charges 0. Cite: Player.cpp:4651.
export function itemRepairCost(
  item: ItemDef,
  current: number,
  discountMod: number = 1.0,
): number {
  const max = maxDurability(item);
  if (max <= 0 || current >= max) return 0;
  const lost = max - current;
  if (lost <= 0) return 0;

  const itemLevel = item.itemLevel;
  if (itemLevel == null || itemLevel <= 0) return 0;

  const itemClass = item.itemClass;
  if (itemClass == null) return 0;
  const itemSubClass = item.itemSubclass ?? 0;

  const dmultiplier = durabilityCostMultiplier(itemLevel, itemClass, itemSubClass);
  if (dmultiplier == null) return 0;

  const qualityMod = durabilityQualityMod(item.quality);
  if (qualityMod == null) return 0;

  // uint32(LostDurability * dmultiplier * double(quality_mod)) — truncate toward 0.
  let costs = Math.floor(lost * dmultiplier * qualityMod);
  // uint32(costs * discountMod)
  costs = Math.floor(costs * discountMod);
  if (costs === 0) costs = 1; // Player.cpp:4676 ITEM_QUALITY_ARTIFACT fix
  return costs;
}

// Walk every equipped durable item, calling `visit(slot, item, current, max)`.
function forEachDurable(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
  visit: (slot: EquipSlot, item: ItemDef, current: number, max: number) => void,
): void {
  for (const [slot, v] of Object.entries(char.equipped) as [EquipSlot, EquippedValue | undefined][]) {
    const entry = equippedEntry(v);
    if (entry == null) continue;
    const item = itemOf(entry);
    if (!item) continue;
    const max = maxDurability(item);
    if (max <= 0) continue;
    visit(slot, item, currentDurability(char, slot, item), max);
  }
}

// Total copper to repair all currently-worn gear (0 if everything is pristine). Optional `discountMod`
// matches DurabilityRepairAll(…, discountMod) — Player.cpp:4619.
export function repairCostAll(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
  discountMod: number = 1.0,
): number {
  let total = 0;
  forEachDurable(char, itemOf, (_s, item, current) => {
    total += itemRepairCost(item, current, discountMod);
  });
  return total;
}

/** Companions pay 25% of the DBC repair price (operator balance call, 2026-08-23). */
export const COMPANION_REPAIR_COST_FACTOR = 0.25;

// Party repair bill: the player at full price plus each active companion at
// COMPANION_REPAIR_COST_FACTOR, floored per companion. The benched roster is not included.
export function repairCostParty(
  player: Character,
  companions: readonly Character[],
  itemOf: (entry: number) => ItemDef | undefined,
  discountMod: number = 1.0,
): number {
  let total = repairCostAll(player, itemOf, discountMod);
  for (const c of companions) {
    total += Math.floor(repairCostAll(c, itemOf, discountMod) * COMPANION_REPAIR_COST_FACTOR);
  }
  return total;
}

/** True if any equipped item is below full durability. */
export function needsRepair(char: Character, itemOf: (entry: number) => ItemDef | undefined): boolean {
  let dmg = false;
  forEachDurable(char, itemOf, (_s, _i, current, max) => { if (current < max) dmg = true; });
  return dmg;
}

/** True if the player or any companion shell needs repair. */
export function needsPartyRepair(
  player: Character,
  companions: readonly Character[],
  itemOf: (entry: number) => ItemDef | undefined,
): boolean {
  if (needsRepair(player, itemOf)) return true;
  return companions.some((c) => needsRepair(c, itemOf));
}

// Subtract `fraction` of each equipped durable item's max (ceil, floor at 0). Cite:
// Player::DurabilityLossAll / DurabilityLoss (Player.cpp ~4507).
export function applyDurabilityLossFraction(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
  fraction: number,
): Character {
  if (fraction <= 0) return char;
  const durability: DurabilityMap = { ...char.durability };
  let changed = false;
  forEachDurable(char, itemOf, (slot, _item, current, max) => {
    const loss = Math.ceil(max * fraction);
    if (loss <= 0) return;
    const next = Math.max(0, current - loss);
    if (next !== current) {
      durability[slot] = next;
      changed = true;
    }
  });
  return changed ? { ...char, durability } : char;
}

// One HandleDamageDealt packet (Unit.cpp:1217–1240): a 0.5% roll, then −1 on `urand(0,
// EQUIPMENT_SLOT_END-1)`. Empty / no-dura slots no-op.
export function applyHandleDamageDealtWear(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
  rng: Rng,
): Character {
  if (!rollCombatWearChance(DURABILITY_LOSS_CHANCE_DAMAGE, rng)) return char;
  const slot = EQUIPMENT_SLOTS_BY_INDEX[rng.int(0, EQUIPMENT_SLOT_END - 1)];
  if (slot == null) return char;
  return applyPointLossOnSlot(char, slot, itemOf, 1);
}

function isDurabilityDamagePacket(
  e: CombatEvent,
): e is Extract<CombatEvent, { kind: 'melee' | 'spell_hit' | 'dot_tick' }> {
  if (e.kind === 'dot_tick') return true;
  if (e.kind !== 'melee' && e.kind !== 'spell_hit') return false;
  return e.result !== 'miss' && e.result !== 'dodge' && e.result !== 'parry' && e.result !== 'immune';
}

/** Implicit 1v1 victim — same pairing as `victimOf` (tacticalFct.ts). */
function packetVictim(e: CombatEvent, soloEnemy: boolean): Side | null {
  if (e.kind !== 'melee' && e.kind !== 'spell_hit' && e.kind !== 'dot_tick') return null;
  if (e.target != null) return e.target;
  if (!soloEnemy) return null;
  return isEnemySide(e.actor) ? 'player' : 'enemy';
}

// Wear applied when a fight resolves: each damage packet rolls HandleDamageDealt's 50% random-slot
// point loss, and death then subtracts 10% of max. A win with no packets is a no-op.
export function applyCombatWear(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
  opts: {
    died: boolean;
    events?: readonly CombatEvent[];
    /** Combat side this character fought as. Default `player`. */
    side?: string;
    /** Session had a single enemy — omitted `target` means that pairing. */
    soloEnemy?: boolean;
    rng?: Rng;
  },
): Character {
  let next = char;
  const rng = opts.rng;
  const events = opts.events;
  if (rng && events?.length) {
    const side = opts.side ?? 'player';
    const solo = opts.soloEnemy === true;
    for (const e of events) {
      if (!isDurabilityDamagePacket(e)) continue;
      if (e.actor === side) next = applyHandleDamageDealtWear(next, itemOf, rng);
      if (packetVictim(e, solo) === side) next = applyHandleDamageDealtWear(next, itemOf, rng);
    }
  }
  if (opts.died) return applyDurabilityLossFraction(next, itemOf, DEATH_LOSS_FRACTION);
  return next;
}

// Roll whether a combat event causes a 1-point durability loss. `chance` is percentage points, as
// the World.cpp config rates are. Cite: Util.h:81 roll_chance_f(chance) vs rand_chance() 0..100.
export function rollCombatWearChance(chancePercent: number, rng: Rng): boolean {
  if (chancePercent <= 0) return false;
  if (chancePercent >= 100) return true;
  return rng.chance(chancePercent / 100);
}

// Subtract `points` from one equipped slot (floors at 0). No-op if the slot has no durable item. Mirrors
// Player::DurabilityPointsLoss / DurabilityPointLossForEquipSlot.
export function applyPointLossOnSlot(
  char: Character,
  slot: EquipSlot,
  itemOf: (entry: number) => ItemDef | undefined,
  points: number = 1,
): Character {
  if (points <= 0) return char;
  const entry = equippedEntry(char.equipped[slot]);
  if (entry == null) return char;
  const item = itemOf(entry);
  if (!item) return char;
  const max = maxDurability(item);
  if (max <= 0) return char;
  const current = currentDurability(char, slot, item);
  const next = Math.max(0, current - points);
  if (next === current) return char;
  return { ...char, durability: { ...char.durability, [slot]: next } };
}

// Per-event combat wear with caller-supplied rates and slot list: on a successful roll, one point
// off a uniformly chosen candidate slot. Callers filter to durable equipped slots.
export function applyCombatWearRoll(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
  opts: {
    event: DurabilityWearEvent;
    /** Override World.cpp default for this event (0..1). */
    chance?: number;
    /** Slots eligible for the random 1-point loss (must be equipped + durable). */
    candidateSlots: readonly EquipSlot[];
    rng: Rng;
  },
): Character {
  const chance = opts.chance ?? DEFAULT_DURABILITY_LOSS_CHANCES[opts.event];
  if (!rollCombatWearChance(chance, opts.rng)) return char;
  if (!opts.candidateSlots.length) return char;
  const idx = opts.rng.int(0, opts.candidateSlots.length - 1);
  const slot = opts.candidateSlots[idx]!;
  return applyPointLossOnSlot(char, slot, itemOf, 1);
}

/** Collect equipped durable slots (helper for combat wear candidate lists). */
export function durableEquippedSlots(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
): EquipSlot[] {
  const out: EquipSlot[] = [];
  forEachDurable(char, itemOf, (slot) => { out.push(slot); });
  return out;
}

// Player::DurabilityLoss — uint32(max * percent), min 1, then DurabilityPointsLoss. Cite:
// Player.cpp:4540–4564.
export function applyDurabilityLoss(
  char: Character,
  slot: EquipSlot,
  itemOf: (entry: number) => ItemDef | undefined,
  percent: number,
): Character {
  if (percent <= 0) return char;
  const entry = equippedEntry(char.equipped[slot]);
  if (entry == null) return char;
  const item = itemOf(entry);
  if (!item) return char;
  const max = maxDurability(item);
  if (max <= 0) return char;
  let loss = Math.trunc(max * percent);
  if (loss < 1) loss = 1;
  return applyPointLossOnSlot(char, slot, itemOf, loss);
}

/** Player::DurabilityLossAll equipped path. Bag items are not modeled. Cite: Player.cpp:4514–4531. */
export function applyDurabilityLossAll(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
  percent: number,
): Character {
  if (percent <= 0) return char;
  let next = char;
  forEachDurable(char, itemOf, (slot) => {
    next = applyDurabilityLoss(next, slot, itemOf, percent);
  });
  return next;
}

// The 10% every PvE death costs you — equipped only, since bag items are spared. Refused in a
// battleground and when a player landed the killing blow. Cite: Unit.cpp:1145-1156.
export function applyDeathDurabilityLoss(
  char: Character,
  itemOf: (entry: number) => ItemDef | undefined,
  opts?: { inBattleground?: boolean; killedByPlayer?: boolean },
): Character {
  if (opts?.inBattleground || opts?.killedByPlayer) return char;
  return applyDurabilityLossAll(char, itemOf, DEATH_LOSS_FRACTION);
}

/** Restore all equipped gear to full durability (an untracked slot is already full). */
export function repairAll(char: Character): Character {
  return { ...char, durability: {} };
}

// Restore one equipped slot to full durability (Player::DurabilityRepair single-item path). No-op if the
// slot is already pristine or has no durability map entry.
export function repairSlot(char: Character, slot: EquipSlot): Character {
  if (char.durability?.[slot] == null) return char;
  const durability: DurabilityMap = { ...char.durability };
  delete durability[slot];
  return { ...char, durability };
}

/** Copper to repair one equipped slot (0 if pristine / no durable item). */
export function repairCostSlot(
  char: Character,
  slot: EquipSlot,
  itemOf: (entry: number) => ItemDef | undefined,
  discountMod: number = 1.0,
): number {
  const entry = equippedEntry(char.equipped[slot]);
  if (entry == null) return 0;
  const item = itemOf(entry);
  if (!item) return 0;
  return itemRepairCost(item, currentDurability(char, slot, item), discountMod);
}
