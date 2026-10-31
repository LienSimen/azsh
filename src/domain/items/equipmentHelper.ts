// Equipment Helper: toggleable auto-equip and upgrade suggestions, defaulting to enabled + 'suggest'.
// Scoring is SPEC-AWARE — the playerbots GetStatWeight pipeline, not a flat class tilt. All pure.

import type { DataStore } from '../../data/dataStore.ts';
import type { Character } from '../character/character.ts';
import type { Inventory } from './inventory.ts';
import type { ItemDef, EquipSlot, RandomPropertyDef, Stat } from '../../data/schema.ts';
import { equippedEntry, equippedInstance, type ItemInstance } from './itemInstance.ts';
import { BAG_SLOTS, itemSlotTargets, type EquipOpts } from './equipment.ts';
import { canEquipItem } from './itemRestrictions.ts';
import {
  ammoHastePctFromItem,
  isQuiverOrPouch,
  quiverPouchMatchesRangedWeapon,
} from './ammo.ts';
import { gearEnchantGrant } from '../professions/gearEnchant.ts';
import { setPieceCounts } from '../character/characterStats.ts';
import {
  calculateSingleStatWeight,
  calculateStatWeight,
  characterPlayerbotSpecId,
  playerbotWeightScale,
  pricedStatAmount,
  shouldEquipItemForSpec,
  type StatWeightOpts,
} from '../bots/playerbotStatWeight.ts';
import { BODY_ARMOR_SLOTS, canEquipArmor } from '../bots/playerbotEquipCache.ts';
import { isFishingPole } from '../professions/professions.ts';
import { attackPower, effectiveStats } from '../character/characterStats.ts';
import { octRegenMpPerSpirit } from '../../engine/combat/formulas.ts';
import { spenderWeaponDps } from './weaponSpender.ts';

export interface EquipmentHelperConfig {
  enabled: boolean;
  mode: 'auto' | 'suggest';
}

export const DEFAULT_EQUIPMENT_HELPER_CONFIG: EquipmentHelperConfig = {
  enabled: true,
  mode: 'suggest',
};

// Spirit-only mana regen per 5s, memoised per Character: MOD_MANA_REGEN_INTERRUPT grants a percent
// of it and findUpgrades scores every bag stack. Cite: floorRest.ts:83 updateManaRegen.
const SPIRIT_REGEN_MEMO = new WeakMap<Character, number>();

function spiritRegenPer5(char: Character, ds: DataStore): number {
  const hit = SPIRIT_REGEN_MEMO.get(char);
  if (hit !== undefined) return hit;
  let v = 0;
  try {
    v = octRegenMpPerSpirit(char.cls, effectiveStats(char, ds).spi) * 5;
  } catch {
    v = 0;
  }
  SPIRIT_REGEN_MEMO.set(char, v);
  return v;
}

// Melee AP, memoised the same way: the spender's per-cast roll is weapon damage plus AP × speed/14,
// and findUpgrades prices every bag stack. Cite: characterStats.ts:818 attackPower.
const MELEE_AP_MEMO = new WeakMap<Character, number>();

function meleeAttackPower(char: Character, ds: DataStore): number {
  const hit = MELEE_AP_MEMO.get(char);
  if (hit !== undefined) return hit;
  let v = 0;
  try {
    v = attackPower(char, ds);
  } catch {
    v = 0;
  }
  MELEE_AP_MEMO.set(char, v);
  return v;
}

/** Coerce stored value into a valid config (safe defaults). */
export function normalizeEquipmentHelperConfig(raw: unknown): EquipmentHelperConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<EquipmentHelperConfig>;
  // Absent / partial configs fall through to DEFAULT, not a hardcoded other mode —
  // a missing mode used to flip the Settings radio off the saved choice.
  const mode: EquipmentHelperConfig['mode'] =
    r.mode === 'auto' || r.mode === 'suggest' ? r.mode : DEFAULT_EQUIPMENT_HELPER_CONFIG.mode;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULT_EQUIPMENT_HELPER_CONFIG.enabled,
    mode,
  };
}

// Score a class-11 quiver or pouch: ammo capacity plus its ranged ammo-haste. A wrong weapon
// family scores 0 so a mismatch is never recommended. Haste stacking is handled in findUpgrades.
function quiverPouchValue(it: ItemDef, char: Character, ds: DataStore): number {
  const rangedEntry = equippedEntry(char.equipped.ranged);
  const ranged = rangedEntry != null ? ds.item(rangedEntry) : undefined;
  if (!quiverPouchMatchesRangedWeapon(it, ranged)) return 0;
  const slots = it.bagSlots ?? 0;
  // Ammo-haste is the combat value of a quiver/pouch (SPELL_AURA_MOD_RANGED_AMMO_HASTE).
  // Weight so a real haste upgrade beats a couple of extra ammo slots.
  const hastePct = ammoHastePctFromItem(ds, it);
  return slots + hastePct * 2.0;
}

/** Resolve the playerbots weightscale id used for this wearer's upgrade scoring. */
export function resolveGearSpecId(char: Character, ds: DataStore, opts?: EquipOpts): number {
  if (opts?.specId != null && opts.specId > 0) return opts.specId;
  return characterPlayerbotSpecId(char, ds, { role: opts?.role });
}

// The score contribution of the enchant already on the worn piece, weighted with the SAME
// coefficients itemValue uses. Without it "equip best" silently discarded a fresh enchant.
export function wornEnchantValue(
  char: Character,
  slot: EquipSlot,
  ds: DataStore,
  opts?: EquipOpts,
): number {
  const inst = equippedInstance(char.equipped[slot]);
  return enchantIdValue(inst?.permEnchantId ?? char.enchants?.[slot], char, ds, opts);
}

// The same weighting for an enchant riding on a piece still in the bags. Pricing only the worn
// side made an enchanted candidate read as bare, so a worse unenchanted piece won.
export function candidateEnchantValue(
  inst: ItemInstance | null | undefined,
  char: Character,
  ds: DataStore,
  opts?: EquipOpts,
): number {
  return enchantIdValue(inst?.permEnchantId, char, ds, opts);
}

function enchantIdValue(
  id: number | null | undefined,
  char: Character,
  ds: DataStore,
  opts?: EquipOpts,
): number {
  if (id == null) return 0;
  const grant = gearEnchantGrant(id, ds);
  if (!grant) return 0;
  const specId = resolveGearSpecId(char, ds, opts);
  let score = calculateSingleStatWeight(specId, 'armor', grant.armor);
  for (const st of grant.stats) {
    // Same Stat → field map as calculateStatWeight (playerbotStatWeight STAT_TO_FIELD).
    const field =
      st.stat === 'str' ? 'str'
      : st.stat === 'agi' ? 'agi'
      : st.stat === 'sta' ? 'sta'
      : st.stat === 'int' ? 'int'
      : st.stat === 'spi' ? 'spi'
      : st.stat === 'crit' ? 'critstrkrtng'
      : st.stat === 'hit' ? 'hitrtng'
      : (st.stat as string) === 'attackPower' ? 'atkpwr'
      : (st.stat as string) === 'spellPower' ? 'splpwr'
      : (st.stat as string) === 'healingPower' ? 'splheal'
      : st.stat === 'mp5' ? 'manargn'
      : st.stat === 'dodge' ? 'dodgertng'
      : st.stat === 'parry' ? 'parryrtng'
      : st.stat === 'defense' ? 'defrtng'
      : st.stat === 'block' ? 'blockrtng'
      : '';
    if (field) score += calculateSingleStatWeight(specId, field, st.value);
  }
  // Flat weapon damage from enchants ≈ a slice of mledps (rough; classic kits use +dmg).
  if (grant.weaponDamageFlat) {
    score += calculateSingleStatWeight(specId, 'mledps', grant.weaponDamageFlat);
  }
  // Resistances: light count so a resist enchant is not free to discard.
  for (const amount of Object.values(grant.resists)) {
    score += (amount ?? 0) * 0.3;
  }
  return score;
}

// itemValue: the "power" of this item for this character's *active talent spec*. Uses playerbots
// GetStatWeight (spec-weighted) — same scale as companion spawn gear.
export function itemValue(
  it: ItemDef,
  char: Character,
  ds: DataStore,
  opts?: EquipOpts,
  scoreOpts?: StatWeightOpts,
): number {
  if (!it.slot) return 0;

  // Bags are special: better means strictly more bagSlots, scored by capacity so findUpgrades can
  // replace the smallest worn bag. A class-11 quiver is ammo family + haste, not bag capacity.
  if (it.slot === 'bag') {
    if (isQuiverOrPouch(it)) return quiverPouchValue(it, char, ds);
    return it.bagSlots ?? 0;
  }

  const specId = resolveGearSpecId(char, ds, opts);
  // CalculateStatWeight already zeros wrong armor/weapon for the scale and weights
  // primaries / armor / mledps / rgddps / spell power per the active weightscale.
  return Math.max(0, calculateStatWeight(char.cls, specId, it, {
    ...scoreOpts,
    spell: (id) => ds.spell(id),
    spiritRegenPer5: spiritRegenPer5(char, ds),
  }));
}

// Value of a piece the wearer already has ON. The worn side must never be scored through the spec
// gates: a zeroed staff read as an empty slot and a gray axe was offered at +140.
export function wornItemValue(
  it: ItemDef,
  char: Character,
  ds: DataStore,
  opts?: EquipOpts,
  scoreOpts?: StatWeightOpts,
): number {
  return itemValue(it, char, ds, opts, { ...scoreOpts, asWorn: true });
}

// Melee DPS a MAIN-hand candidate reaches through the spender. The off hand never gets it: the
// spender swings the main hand (weapon.ts hand === 'mainhand') and off-hand white damage is halved.
function mainHandAbilityDps(it: ItemDef, char: Character, ds: DataStore, opts?: EquipOpts): number {
  if (!it.weapon || !opts?.weaponSpender) return 0;
  return spenderWeaponDps(it, meleeAttackPower(char, ds), opts.weaponSpender);
}

/** Fold a rolled suffix onto a def copy so GetStatWeight sees the same stats the paperdoll does. */
function withRandomProp(it: ItemDef, ds: DataStore, inst?: ItemInstance | null): ItemDef {
  const id = inst?.randomPropertyId;
  if (id == null || id <= 0) return it;
  const prop: RandomPropertyDef | undefined = ds.itemRandomProperty?.(id);
  if (!prop) return it;
  let stats = it.stats;
  if (prop.stats) {
    const by = new Map<string, number>((stats ?? []).map((s) => [s.stat, s.value]));
    for (const [k, v] of Object.entries(prop.stats)) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v === 0) continue;
      by.set(k, (by.get(k) ?? 0) + v);
    }
    stats = [...by.entries()].map(([stat, value]) => ({ stat: stat as Stat, value }));
  }
  const armor = prop.armor ? (it.armor ?? 0) + prop.armor : it.armor;
  let weapon = it.weapon;
  if (weapon && prop.weaponDamageFlat) {
    weapon = {
      ...weapon,
      dmgMin: weapon.dmgMin + prop.weaponDamageFlat,
      dmgMax: weapon.dmgMax + prop.weaponDamageFlat,
    };
  }
  if (stats === it.stats && armor === it.armor && weapon === it.weapon) return it;
  return { ...it, stats, armor, weapon };
}

// When the spec scale prices nothing, still rank quality, ilvl, armor and DPS so a green mail
// chest beats an empty slot. Only stats the active weightscale prices are added.
function fallbackGearScore(it: ItemDef, specId: number): number {
  let n = (it.quality ?? 0) * 20 + (it.itemLevel ?? 0);
  n += (it.armor ?? 0) * 0.1;
  if (it.slot === 'bag') n += (it.bagSlots ?? 0) * 2;
  if (it.weapon) {
    const dps = (it.weapon.dmgMin + it.weapon.dmgMax) / 2 / ((it.weapon.delayMs || 2000) / 1000);
    n += dps;
  }
  n += pricedStatAmount(specId, it);
  return n;
}

/** Jewelry / cloaks with no weighted stats are not "a green chest" — leave them in bags. */
function fallbackSlotOk(it: ItemDef): boolean {
  const slot = it.slot;
  if (!slot || slot === 'bag') return true;
  if (slot === 'neck' || slot === 'finger' || slot === 'trinket' || slot === 'back') return false;
  // A shirt's weight 1 is upstream's "equippable" floor, not a stat (RandomItemMgr.cpp:1364
  // `slot == EQUIPMENT_SLOT_BODY && statW <= 0 → 1`); quality×20+ilvl read it as +55.
  if (slot === 'shirt' || slot === 'tabard') return false;
  return true;
}

// Spec score when it has an opinion, else quality / ilvl / armor / DPS. A caller adding a
// cross-slot cost must use the same scale — the two differ by an order of magnitude.
export type CompareScale = 'spec' | 'fallback';

function upgradeCompare(
  cand: ItemDef,
  cur: ItemDef | undefined,
  char: Character,
  ds: DataStore,
  opts?: EquipOpts,
): { candVal: number; curVal: number; scale: CompareScale } {
  const specId = resolveGearSpecId(char, ds, opts);
  const prefCand = itemValue(cand, char, ds, opts);
  const usableCand = wornItemValue(cand, char, ds, opts);
  const usableCur = cur ? wornItemValue(cur, char, ds, opts) : 0;
  const fbCand = fallbackGearScore(cand, specId);
  const fbCur = cur ? fallbackGearScore(cur, specId) : 0;

  if (cand.slot === 'bag') {
    if (prefCand > 0 || usableCur > 0) {
      return { candVal: prefCand, curVal: usableCur, scale: 'spec' };
    }
    return { candVal: fbCand, curVal: fbCur, scale: 'fallback' };
  }

  // Off-tier body armor never displaces an on-tier worn piece (rogue: cloth +10 agi over leather
  // +15 sta); empty or off-tier slots keep the class-legal path. Cite: ItemUsageValue.cpp CanEquipArmor.
  if (
    cur
    && cand.slot && BODY_ARMOR_SLOTS.has(cand.slot as EquipSlot)
    && !canEquipArmor(char.cls, specId, char.level, cand)
    && canEquipArmor(char.cls, specId, char.level, cur)
  ) {
    return { candVal: 0, curVal: Math.max(usableCur, 1), scale: 'spec' };
  }
  const specCand = prefCand > 0
    ? prefCand
    : (!cur && usableCand > 0 ? usableCand * 0.25 : usableCand);
  // Class-legal armor the scale zeros (druid cloth on feralsps) still falls back. A mage cannot
  // reach leather here: findUpgrades already ran canEquipItem. Cite: Player.cpp CanUseItem.
  const allowFallback = fallbackSlotOk(cand);
  const spec = { candVal: specCand, curVal: usableCur, scale: 'spec' as const };
  const fb = { candVal: fbCand, curVal: fbCur, scale: 'fallback' as const };

  // ONE scale per pair, read off BOTH sides as bestHandLoadout does: picking it from the candidate
  // alone recommended A over worn B and B over worn A, 175 of 764 warrior chest pairs measured.
  const specSpeaks = specCand > 1 || usableCur > 1; // 1 = playerbotStatWeight.ts:539's placeholder
  // A silent scale with no fallback is a tie, not a +1: the placeholder alone put a statless
  // shirt into an empty slot as a gain.
  if (!specSpeaks) return allowFallback ? fb : { candVal: 0, curVal: 0, scale: 'spec' as const };
  if (Math.abs(specCand - usableCur) > 0.6) return spec;
  // The scale ties: quality / ilvl / armor / DPS break it, on one scale for both directions.
  return allowFallback ? fb : spec;
}

// A candidate both lower quality and no higher item level than what is worn is never an upgrade,
// whatever the weightscale says: raw DPS × a big coefficient lets a gray weapon outbid an epic.
function isQualityRegression(cand: ItemDef, worn: ItemDef | undefined): boolean {
  if (!worn) return false;
  const cq = cand.quality ?? 0;
  const wq = worn.quality ?? 0;
  if (cq >= wq) return false;
  return (cand.itemLevel ?? 0) <= (worn.itemLevel ?? 0);
}

/** Suggestion shape for callers. */
export interface UpgradeSuggestion {
  entry: number;
  targetSlot: EquipSlot;
  currentEntry?: number;
  valueDelta: number;
  // Unit of valueDelta: weightscale points, or the quality/ilvl fallback when the scale is silent.
  scale?: CompareScale;
  // Rolled suffix on the bag stack that WON this compare (scoring already folds it in via
  // withRandomProp). Carried so a UI row can name and tooltip the same item it scored.
  randomPropertyId?: number;
  // Slots this equip empties as a side effect of two-hand exclusivity (equipping an off-hand stows a worn
  // 2H; equipping a 2H stows the off-hand). UI shows the cost.
  displaces?: EquipSlot[];
}

/** A hand candidate with both denominations precomputed once. */
interface HandPiece {
  entry: number;
  def: ItemDef;
  randomPropertyId?: number;
  /** Spec score in the main hand — includes the spender's per-cast damage. */
  specMh: number;
  /** Spec score in the off hand — listed DPS only. */
  specOh: number;
  fb: number;
}

/** Hands are one decision: WoW values max(2H, MH+OH), never each socket alone. */
interface HandConfig {
  mainhand?: HandPiece;
  offhand?: HandPiece;
  twoHandInMain: boolean;
}

function handConfigScore(c: HandConfig, scale: CompareScale): number {
  const pick = (p: HandPiece | undefined, mainHand: boolean) =>
    p ? (scale === 'spec' ? (mainHand ? p.specMh : p.specOh) : p.fb) : 0;
  return pick(c.mainhand, true) + pick(c.offhand, false);
}

// The per-loadout hand comparison the per-slot loop cannot express. Scoring each hand against its
// own occupant made a shield "upgrade" an empty off hand under a 2H, and the swap never settled.
function bestHandLoadout(
  char: Character,
  inventory: Inventory,
  ds: DataStore,
  opts?: EquipOpts,
): UpgradeSuggestion[] {
  const piece = (
    def: ItemDef,
    entry: number,
    wornSlot: EquipSlot | null,
    inst?: ItemInstance | null,
  ): HandPiece => {
    const folded = withRandomProp(def, ds, inst);
    // Enchant counts on BOTH sides: a bagged piece can carry permEnchantId (unequipped or
    // bought enchanted), and pricing only the worn side stranded enchants the player paid for.
    const ench = wornSlot
      ? wornEnchantValue(char, wornSlot, ds, opts)
      : candidateEnchantValue(inst, char, ds, opts);
    const abilityDps = mainHandAbilityDps(folded, char, ds, opts);
    return {
      entry,
      ...(inst?.randomPropertyId != null && inst.randomPropertyId > 0
        ? { randomPropertyId: inst.randomPropertyId }
        : {}),
      def: folded,
      specMh: wornItemValue(folded, char, ds, opts, { abilityDps }) + ench,
      specOh: wornItemValue(folded, char, ds, opts) + ench,
      fb: fallbackGearScore(folded, resolveGearSpecId(char, ds, opts)),
    };
  };
  const specName = playerbotWeightScale(resolveGearSpecId(char, ds, opts))?.name ?? '';
  // ONE gate for both sockets: a class-legal WEAPON is ranked, never rejected for sitting outside the
  // scale's subclass set (the off hand alone refused a combat rogue an epic dagger). Shields stay gated.
  const socketOk = (it: ItemDef, socket: EquipSlot, worn: ItemDef | undefined): boolean => {
    if (socket === 'offhand' && !it.weapon
      && !shouldEquipItemForSpec(char.cls, specName, it, socket)) {
      return false;
    }
    if (it.weapon && worn?.weapon && isQualityRegression(it, worn)) return false;
    return true;
  };

  const mhEntry = equippedEntry(char.equipped.mainhand);
  const mhDef = mhEntry != null ? ds.item(mhEntry) : undefined;
  const ohEntry = equippedEntry(char.equipped.offhand);
  const ohDef = ohEntry != null ? ds.item(ohEntry) : undefined;

  const wornMh = mhDef
    ? piece(mhDef, mhEntry!, 'mainhand', equippedInstance(char.equipped.mainhand))
    : undefined;
  const wornOh = ohDef
    ? piece(ohDef, ohEntry!, 'offhand', equippedInstance(char.equipped.offhand))
    : undefined;
  const wornIsTwoHand = mhDef?.slot === 'twohand';
  // A worn pole is a tool, not a combat 2H. Big Iron's 19 DPS would beat a real 1H if scored;
  // school throws re-wear it from bags. Cite: professions.ts:315 ensureFishingPoleEquipped.
  const poleWorn = !!(mhDef && isFishingPole(mhDef));
  const combatMh = poleWorn ? undefined : wornMh;
  const combatOh = poleWorn ? undefined : wornOh;
  const combatTwoHand = poleWorn ? false : wornIsTwoHand;

  const current: HandConfig = {
    mainhand: combatMh,
    offhand: combatOh,
    twoHandInMain: combatTwoHand,
  };

  // Candidate pool: bags plus whatever is already worn (a displaced 2H returns to bags, so
  // it must stay a candidate or the comparison is not stable across the swap).
  const twoHanders: HandPiece[] = [];
  const mainHands: HandPiece[] = [];
  const offHands: HandPiece[] = [];
  if (combatTwoHand && combatMh) twoHanders.push(combatMh);
  else if (combatMh) mainHands.push(combatMh);
  if (combatOh) offHands.push(combatOh);

  for (const stack of inventory.stacks) {
    let it: ItemDef | undefined;
    try {
      it = ds.item(stack.item);
    } catch {
      continue;
    }
    if (!it?.slot || !canEquipItem(char, it, ds)) continue;
    if ((it as { questItem?: boolean }).questItem) continue;
    if (isFishingPole(it)) continue;
    const targets = itemSlotTargets(it, opts);
    const canMain = targets.includes('mainhand') && socketOk(it, 'mainhand', poleWorn ? undefined : mhDef);
    const canOff = targets.includes('offhand') && socketOk(it, 'offhand', poleWorn ? undefined : ohDef);
    if (!canMain && !canOff) continue;
    let p: HandPiece;
    try {
      p = piece(it, it.entry, null, stack);
    } catch {
      continue;
    }
    if (it.slot === 'twohand') twoHanders.push(p);
    else {
      if (canMain) mainHands.push(p);
      if (canOff) offHands.push(p);
    }
  }

  if (!twoHanders.length && !mainHands.length && !offHands.length) return [];

  // Bound the pairing: only the strongest few per socket can win a configuration.
  const TOP = 4;
  const byFb = (a: HandPiece, b: HandPiece) => b.fb - a.fb;
  const top = (xs: HandPiece[]) => [...xs].sort(byFb).slice(0, TOP);

  const configs: HandConfig[] = [current];
  for (const th of top(twoHanders)) configs.push({ mainhand: th, twoHandInMain: true });
  for (const mh of top(mainHands)) {
    configs.push({ mainhand: mh, twoHandInMain: false });
    for (const oh of top(offHands)) {
      if (oh.entry === mh.entry) continue;
      configs.push({ mainhand: mh, offhand: oh, twoHandInMain: false });
    }
  }
  // Off-hand against the CURRENT main hand. With a 2H worn that main hand is dropped, so the
  // configuration is off-hand alone — enumerate it or a shield can never replace a bad staff.
  for (const oh of top(offHands)) {
    configs.push({
      mainhand: wornIsTwoHand ? undefined : wornMh,
      offhand: oh,
      twoHandInMain: false,
    });
  }

  // ONE scale across every configuration in this decision. Fallback only when the spec
  // weightscale has no opinion on any of them (common: 2/28 scales price armor).
  const scale: CompareScale = configs.some((c) => handConfigScore(c, 'spec') > 0)
    ? 'spec'
    : 'fallback';
  const curScore = handConfigScore(current, scale);

  let best = current;
  let bestScore = curScore;
  for (const c of configs) {
    const s = handConfigScore(c, scale);
    if (s > bestScore + 0.6) {
      bestScore = s;
      best = c;
    }
  }
  if (best === current) return [];

  // Emit the differing sockets. Each step moves toward the same argmax over an unchanged
  // candidate pool, so the pass converges instead of trading the same two items.
  const out: UpgradeSuggestion[] = [];
  const delta = bestScore - curScore;
  if (best.mainhand && best.mainhand.entry !== wornMh?.entry) {
    out.push({
      entry: best.mainhand.entry,
      targetSlot: 'mainhand',
      ...(best.mainhand.randomPropertyId != null
        ? { randomPropertyId: best.mainhand.randomPropertyId }
        : {}),
      currentEntry: mhEntry ?? undefined,
      valueDelta: delta,
      scale,
      displaces: best.twoHandInMain && ohEntry != null ? ['offhand'] : undefined,
    });
  }
  if (best.offhand && best.offhand.entry !== wornOh?.entry) {
    out.push({
      entry: best.offhand.entry,
      targetSlot: 'offhand',
      ...(best.offhand.randomPropertyId != null
        ? { randomPropertyId: best.offhand.randomPropertyId }
        : {}),
      currentEntry: ohEntry ?? undefined,
      valueDelta: delta,
      scale,
      displaces: wornIsTwoHand ? ['mainhand'] : undefined,
    });
  }
  return out;
}

// Would unequipping `worn` drop a set below a bonus tier it currently satisfies? The recommender
// cannot price the bonus spell, so it used to strip a third set piece for +1 stamina.
function breaksActiveSetBonus(char: Character, ds: DataStore, worn: ItemDef | undefined): boolean {
  const sid = worn?.setId;
  if (sid == null) return false;
  const set = ds.itemSet ? ds.itemSet(sid) : undefined;
  if (!set?.bonuses?.length) return false;
  const cnt = setPieceCounts(char, ds).get(sid) ?? 0;
  return set.bonuses.some((b) => cnt >= b.pieces && cnt - 1 < b.pieces);
}

/** How much better a replacement must be before it is worth breaking a live set bonus. */
const SET_BREAK_MARGIN = 0.5;

/** Locate the bag slot that already holds a class-11 quiver/pouch, if any. */
function equippedQuiverPouchSlot(char: Character, ds: DataStore): EquipSlot | null {
  for (const s of BAG_SLOTS) {
    const entry = equippedEntry(char.equipped[s]);
    if (entry == null) continue;
    const bag = ds.item(entry);
    if (bag && isQuiverOrPouch(bag)) return s;
  }
  return null;
}

// Find strict upgrades in the bags, sorted by descending delta. Only one class-11 quiver or pouch
// may be worn and its haste does not stack, so replacements score as a swap, never additively.
export function findUpgrades(
  char: Character,
  inventory: Inventory,
  ds: DataStore,
  opts?: EquipOpts,
): UpgradeSuggestion[] {
  const bestByEntry = new Map<number, UpgradeSuggestion>();
  const scaleByEntry = new Map<number, CompareScale>();

  // Hands are decided as one loadout by bestHandLoadout (max(2H, MH+OH)); the per-slot loop
  // below cannot express that and used to trade a 2H for an off-hand and back forever.
  const class11Slot = equippedQuiverPouchSlot(char, ds);
  const rangedWeaponEntry = equippedEntry(char.equipped.ranged);
  const rangedWeapon = rangedWeaponEntry != null ? ds.item(rangedWeaponEntry) : undefined;

  for (const stack of inventory.stacks) {
    let it: ItemDef | undefined;
    try {
      it = ds.item(stack.item);
    } catch {
      continue;
    }
    // Level / class / proficiency / requiredRep / allowableRace (FI4).
    if (!it?.slot || !canEquipItem(char, it, ds)) continue;
    // Quest items stay in bags until the player moves them — auto-equip must not
    // swallow Surena's Choker (and friends) off the paperdoll for countItem gates.
    if ((it as { questItem?: boolean }).questItem) continue;

    // Quiver ↔ pouch must match the equipped projectile weapon; wrong family is never an upgrade.
    if (isQuiverOrPouch(it) && !quiverPouchMatchesRangedWeapon(it, rangedWeapon)) {
      continue;
    }

    // INVTYPE_WEAPON (canOffhand) → MH+OH only when Dual Wield is known.
    // Rings/trinkets → both slots; findUpgrades picks the weaker occupant (best delta).
    const targets = itemSlotTargets(it, opts);
    // Hand candidates belong to the loadout compare, not to this per-slot loop.
    if (targets.some((s) => s === 'mainhand' || s === 'offhand')) continue;
    let bestDelta = -Infinity;
    let bestSlot: EquipSlot | null = null;
    let bestCurrent: number | undefined;
    let bestScale: CompareScale = 'spec';
    const rolled = stack.randomPropertyId != null && stack.randomPropertyId > 0
      ? stack.randomPropertyId
      : undefined;

    for (const s of targets) {
      // Class-11: only one among bag slots. If one is already worn, only compare as a
      // replacement of that slot — never score against empty bag slots as if haste stacks.
      if (isQuiverOrPouch(it)) {
        if (class11Slot != null && s !== class11Slot) continue;
        // Prefer empty bag slots when none worn; skip occupied non-class-11 bags unless
        // we're only filling empties (capacity swap of normal bags is separate).
        if (class11Slot == null && char.equipped[s] != null) {
          const occupant = ds.item(equippedEntry(char.equipped[s])!);
          // Do not displace a normal bag with a quiver or pouch of equal or less capacity unless
          // the slot is empty. Upgrading a general bag's capacity stays a general-bag concern.
          if (occupant && !isQuiverOrPouch(occupant)) continue;
        }
      }
      const currentEntry = equippedEntry(char.equipped[s]);
      const currentIt = currentEntry != null ? ds.item(currentEntry) : undefined;
      if (isQualityRegression(it, currentIt)) continue;
      let candDef: ItemDef;
      let curDef: ItemDef | undefined;
      let sides: { candVal: number; curVal: number; scale: CompareScale };
      try {
        candDef = withRandomProp(it, ds, stack);
        curDef = currentIt
          ? withRandomProp(currentIt, ds, equippedInstance(char.equipped[s]))
          : undefined;
        sides = upgradeCompare(candDef, curDef, char, ds, opts);
      } catch {
        continue;
      }
      let { candVal, curVal } = sides;
      // Enchants on both sides, and only on the spec branch: wornEnchantValue is in spec points, so
      // adding it to a fallbackGearScore pair would compare two different units.
      if (sides.scale === 'spec') {
        curVal += wornEnchantValue(char, s, ds, opts);
        candVal += candidateEnchantValue(stack, char, ds, opts);
      }
      // Class-11 haste is max-not-sum: candVal/curVal each include that item's haste once.
      // Delta is a swap (cand − cur), never additive stacking of both auras.
      const delta = candVal - curVal;

      // Losing a live set bonus costs a spell this scorer cannot price; demand a clear win.
      if (breaksActiveSetBonus(char, ds, currentIt) && delta < curVal * SET_BREAK_MARGIN) {
        continue;
      }

      // Strict improvement + hysteresis (avoid micro-swaps on near equals).
      // Playerbot weights are integers; 0.6 still rejects pure ties / noise.
      if (delta > bestDelta && delta > 0.6) {
        bestDelta = delta;
        bestSlot = s;
        bestCurrent = currentEntry;
        bestScale = sides.scale;
      }
    }

    if (bestSlot && bestDelta > 0.6) {
      const prev = bestByEntry.get(it.entry);
      if (!prev || bestDelta > prev.valueDelta) {
        bestByEntry.set(it.entry, {
          entry: it.entry,
          targetSlot: bestSlot,
          ...(rolled != null ? { randomPropertyId: rolled } : {}),
          currentEntry: bestCurrent,
          valueDelta: bestDelta,
          scale: bestScale,
        });
        scaleByEntry.set(it.entry, bestScale);
      }
    }
  }

  // Fallback deltas (quality × 20 + ilvl) are a different unit from spec weights.
  // A spirit chest must not sort above a +str chest for the same slot.
  const specSlots = new Set<EquipSlot>();
  for (const u of bestByEntry.values()) {
    if (scaleByEntry.get(u.entry) === 'spec') specSlots.add(u.targetSlot);
  }
  for (const [entry, u] of [...bestByEntry.entries()]) {
    if (scaleByEntry.get(entry) === 'fallback' && specSlots.has(u.targetSlot)) {
      bestByEntry.delete(entry);
    }
  }

  for (const h of bestHandLoadout(char, inventory, ds, opts)) {
    const prev = bestByEntry.get(h.entry);
    if (!prev || h.valueDelta > prev.valueDelta) bestByEntry.set(h.entry, h);
  }

  return [...bestByEntry.values()].sort((a, b) => b.valueDelta - a.valueDelta);
}

/** Convenience: return the single best upgrade (or null). */
export function bestUpgrade(
  char: Character,
  inventory: Inventory,
  ds: DataStore,
  opts?: EquipOpts,
): UpgradeSuggestion | null {
  const ups = findUpgrades(char, inventory, ds, opts);
  return ups.length > 0 ? ups[0] : null;
}

// For the old autopilot empty-slot path. NOT monotonic: with a two-hander worn the off hand IS
// empty, so equipping it stows the 2H. bestHandLoadout is what stops that cycling.
export function fillEmptyEquipCandidate(
  state: { char: Character; inventory: Inventory },
  ds: DataStore,
  opts?: EquipOpts,
): number | null {
  const up = bestUpgrade(state.char, state.inventory, ds, opts);
  if (!up) return null;
  // Only return if the chosen target was empty (preserve old "fill empty only" contract for autopilot safety)
  const current = state.char.equipped[up.targetSlot];
  return current == null ? up.entry : null;
}

/** Legacy crude score kept for tests that import it directly; delegates for new behavior. */
export function itemScore(it: ItemDef): number {
  // Fallback numeric that matches old behaviour for existing bot tests.
  // Real recommendations always go through itemValue(..., char, ds).
  let score = it.armor ?? 0;
  for (const s of it.stats ?? []) score += s.value;
  if (it.weapon) score += (it.weapon.dmgMin + it.weapon.dmgMax) / 2;
  return score;
}

/** Re-export slot mapper so callers that did `import { equipTargets }` continue to work. */
export {
  slotTargets as equipTargets,
  itemSlotTargets,
  equipSlotPickTargets,
} from './equipment.ts';
