// What happens when a party member dies, in CMaNGOS order: a soulstone the corpse already carries,
// then Reincarnation, then a party rez, then the corpse run. Cite: Player.cpp:18675-18713.

import type { ItemDef, SpellDef } from '../../data/schema.ts';
import { SOUL_SHARD_ITEM } from '../core/ids.ts';

/** SPELL_EFFECT_SELF_RESURRECT. Cite: SpellEffectDefines.h; SpellEffects.cpp:4937. */
export const SPELL_EFFECT_SELF_RESURRECT = 94;

/** Shaman Reincarnation: the passive the shaman learns. Cite: Player.cpp:18710 HasSpell(20608). */
export const REINCARNATION_PASSIVE_SPELL = 20608;
/** The spell actually cast on self-res, and the id the 60 min cooldown sits on. Cite: :18711. */
export const REINCARNATION_TRIGGER_SPELL = 21169;
/** Ankh — the reagent Reincarnation consumes. Cite: Player.cpp:18711 HasItemCount(17030). */
export const ANKH_ITEM = 17030;

// Soulstone Resurrection dummy aura → the self-res spell it grants on death. Cite: Player.cpp:18684-18693
// (rank 6 / 27239 is TBC and omitted).
export const SOULSTONE_SELF_RES: ReadonlyMap<number, number> = new Map([
  [20707, 3026],  // rank 1
  [20762, 20758], // rank 2
  [20763, 20759], // rank 3
  [20764, 20760], // rank 4
  [20765, 20761], // rank 5
]);

/** True when this spell id is a Soulstone Resurrection aura (the thing a stone applies). */
export function isSoulstoneAura(spellId: number): boolean {
  return SOULSTONE_SELF_RES.has(spellId | 0);
}

/** Health + mana a self-res restores. */
export interface SelfResPayload {
  health: number;
  mana: number;
}

// EffectSelfResurrect: flat when the damage is negative (soulstone ranks), a percent of max when
// positive (Reincarnation). The amount is the bake's min for the slot, as resurrectSpell.ts uses.
export function selfResPayload(
  spell: SpellDef | undefined,
  maxHealth: number,
  maxMana: number,
): SelfResPayload | null {
  const raw = spell?.rawEffects?.find((r) => (r.effect | 0) === SPELL_EFFECT_SELF_RESURRECT);
  if (!raw) return null;
  const damage = (raw.basePoints | 0) + Math.max(raw.baseDice | 0, 0);
  const maxHp = Math.max(1, maxHealth | 0);
  const maxMp = Math.max(0, maxMana | 0);
  if (damage < 0) {
    return {
      health: Math.min(maxHp, -damage),
      mana: Math.min(maxMp, Math.max(0, raw.miscValue | 0)),
    };
  }
  return {
    health: Math.max(1, Math.min(maxHp, Math.trunc((damage / 100) * maxHp))),
    mana: Math.max(0, Math.min(maxMp, Math.trunc((damage / 100) * maxMp))),
  };
}

/** The corpse, as much of it as the self-res decision needs. */
export interface SelfResCandidate {
  /** Aura spell ids the unit is carrying (a soulstone survives its holder's death). */
  auraSpellIds: readonly number[];
  /** Spell ids the unit knows — 20608 is what makes a shaman a Reincarnation candidate. */
  knownSpellIds: readonly number[];
  /** How many Ankhs are in this unit's own bags. */
  ankhCount: number;
  /** False while Reincarnation's 60 min cooldown is still running. */
  reincarnationReady: boolean;
}

export type SelfResSource = 'soulstone' | 'twisting-nether' | 'reincarnation';

export interface SelfResOffer {
  source: SelfResSource;
  /** The spell that is cast (3026 / 20758-20761, or 21169). */
  spellId: number;
  /** The aura that granted it, for the soulstone case — the aura to burn on use. */
  fromAuraId?: number;
  /** Item consumed, if any. Reincarnation eats one Ankh; a soulstone eats only its aura. */
  consumesItem?: number;
}

// GetResurrectionSpellId — the free-resurrection search in its own priority order, soulstone before
// Reincarnation.
export function selfResurrectOffer(unit: SelfResCandidate, rollChance: (percent: number) => boolean): SelfResOffer | null {
  for (const auraId of unit.auraSpellIds) {
    const spellId = SOULSTONE_SELF_RES.get(auraId | 0);
    if (spellId != null) return { source: 'soulstone', spellId, fromAuraId: auraId | 0 };
  }
  // Twisting Nether                                  // prio: 2 (max)
  // else if (dummyAura->GetId() == 23701 && roll_chance_i(10))
  if (unit.auraSpellIds.includes(23701) && rollChance(10)) {
    return { source: 'twisting-nether', spellId: 23700, fromAuraId: 23701 };
  }
  if (
    unit.knownSpellIds.includes(REINCARNATION_PASSIVE_SPELL)
    && unit.reincarnationReady
    && unit.ankhCount > 0
  ) {
    return {
      source: 'reincarnation',
      spellId: REINCARNATION_TRIGGER_SPELL,
      consumesItem: ANKH_ITEM,
    };
  }
  return null;
}

// ---- Soulstone supply: which warlock can stone whom -------------------------

// A soulstone the party already carries: the bag item, and the aura using it applies. Derived from the item
// row (`useSpell`), never from a name — every rank works for free.
export interface CarriedSoulstone {
  item: number;
  auraSpellId: number;
  /** Rank order, highest first: the aura's own spellLevel. */
  rank: number;
}

/** Soulstone items in one bag, best rank first. */
export function soulstonesIn(
  entries: readonly { item: number; count: number }[],
  itemOf: (entry: number) => ItemDef | undefined,
  spellOf: (id: number) => SpellDef | undefined,
): CarriedSoulstone[] {
  const out: CarriedSoulstone[] = [];
  for (const e of entries) {
    if (e.count <= 0) continue;
    const use = itemOf(e.item)?.useSpell;
    if (use == null || !isSoulstoneAura(use)) continue;
    out.push({ item: e.item, auraSpellId: use, rank: spellOf(use)?.spellLevel ?? 0 });
  }
  out.sort((a, b) => b.rank - a.rank);
  return out;
}

// Best `Create Soulstone` rank a warlock can cast at its level, with the stone it makes. Data-driven off
// the conjure effect, so a new rank needs no code.
export function bestCreateSoulstone(
  knownSpellIds: readonly number[],
  level: number,
  spellOf: (id: number) => SpellDef | undefined,
): { spellId: number; item: number; soulShards: number } | null {
  let best: { spellId: number; item: number; soulShards: number; lvl: number } | null = null;
  for (const id of knownSpellIds) {
    const s = spellOf(id);
    if (!s || !/^create soulstone/i.test(s.name ?? '')) continue;
    const conj = s.effects?.find((e) => e.kind === 'conjure');
    if (!conj || conj.kind !== 'conjure') continue;
    const lvl = s.spellLevel ?? 0;
    if (lvl > level) continue;
    const shards = s.reagents?.find((r) => r.item === SOUL_SHARD_ITEM)?.count ?? 0;
    if (!best || lvl > best.lvl) best = { spellId: id, item: conj.item, soulShards: shards, lvl };
  }
  return best ? { spellId: best.spellId, item: best.item, soulShards: best.soulShards } : null;
}

/** One warlock considered as the party's soulstone supplier. */
export interface SoulstoneSupplier {
  name: string;
  level: number;
  knownSpellIds: readonly number[];
  /** Bag contents, for the stone they may already carry and for the shard a new one costs. */
  bag: readonly { item: number; count: number }[];
}

export interface SoulstonePlan {
  warlockName: string;
  targetName: string;
  /** Rank to cast when no stone is already in the bags. */
  createSpellId?: number;
  /** Soul shards that conjure costs (0 when an existing stone is used). */
  soulShards: number;
  /** The stone item spent. */
  item: number;
  /** The Soulstone Resurrection aura it puts on the target. */
  auraSpellId: number;
}

// Before the first pull, the warlock puts a soulstone on the healer — not a core rule, but the only
// reason the soulstone branch ever fires in a five-man. Null when there is no warlock or no shard.
export function planSoulstone(args: {
  suppliers: readonly SoulstoneSupplier[];
  /** Who to stone, best first — the caller ranks healer, then tank. */
  targets: readonly { name: string; auraSpellIds: readonly number[] }[];
  itemOf: (entry: number) => ItemDef | undefined;
  spellOf: (id: number) => SpellDef | undefined;
}): SoulstonePlan | null {
  const target = args.targets.find((t) => !t.auraSpellIds.some(isSoulstoneAura));
  if (!target) return null;
  for (const w of args.suppliers) {
    const carried = soulstonesIn(w.bag, args.itemOf, args.spellOf);
    if (carried.length) {
      const best = carried[0]!;
      return {
        warlockName: w.name,
        targetName: target.name,
        soulShards: 0,
        item: best.item,
        auraSpellId: best.auraSpellId,
      };
    }
    const create = bestCreateSoulstone(w.knownSpellIds, w.level, args.spellOf);
    if (!create) continue;
    const shards = w.bag.find((b) => b.item === SOUL_SHARD_ITEM)?.count ?? 0;
    if (shards < create.soulShards) continue;
    const aura = args.itemOf(create.item)?.useSpell;
    if (aura == null || !isSoulstoneAura(aura)) continue;
    return {
      warlockName: w.name,
      targetName: target.name,
      createSpellId: create.spellId,
      soulShards: create.soulShards,
      item: create.item,
      auraSpellId: aura,
    };
  }
  return null;
}

// ---- The whole-corpse decision ---------------------------------------------

export type RecoveryKind = 'soulstone' | 'twisting-nether' | 'reincarnation' | 'party-res' | 'corpse-run';

/** What a party rez costs and restores — filled by `raidRecovery.pickResurrector`. */
export interface PartyResOffer {
  casterName: string;
  spellId: number;
  spellName: string;
  castTimeMs: number;
  /** Reagent the cast burns (Rebirth's seed), if any. */
  consumesItem?: number;
  /** Cooldown to stamp on the caster after the cast (Rebirth's 30 min). */
  cooldownMs?: number;
}

export interface RecoveryDecision {
  kind: RecoveryKind;
  /** Present for the two self-res kinds. */
  selfRes?: SelfResOffer;
  /** Present for `party-res`. */
  partyRes?: PartyResOffer;
  /** Seconds of downtime this recovery costs the run. */
  seconds: number;
  /** Player-facing line. */
  log: string;
}

// Pick how one corpse gets back up. The self-res search runs first regardless, since a soulstone is
// free and instant. corpseRunSeconds is a distance estimate, so the caller supplies it.
export function decideRecovery(args: {
  unitName: string;
  corpse: SelfResCandidate;
  selfResSpell: (id: number) => SpellDef | undefined;
  partyRes: PartyResOffer | null;
  corpseRunSeconds: number;
  rollChance: (percent: number) => boolean;
}): RecoveryDecision {
  const offer = selfResurrectOffer(args.corpse, args.rollChance);
  if (offer) {
    const spell = args.selfResSpell(offer.spellId);
    return {
      kind: offer.source,
      selfRes: offer,
      seconds: 0,
      log: offer.source === 'soulstone'
        ? `${args.unitName} uses their soulstone and returns to life.`
        : offer.source === 'twisting-nether'
        ? `${args.unitName} uses Twisting Nether and returns to life.`
        : `${args.unitName} burns an Ankh (${spell?.name ?? 'Reincarnation'}) and returns to life.`,
    };
  }
  if (args.partyRes) {
    return {
      kind: 'party-res',
      partyRes: args.partyRes,
      seconds: Math.ceil(args.partyRes.castTimeMs / 1000),
      log: `${args.partyRes.casterName} casts ${args.partyRes.spellName} on ${args.unitName}.`,
    };
  }
  return {
    kind: 'corpse-run',
    seconds: Math.max(0, Math.round(args.corpseRunSeconds)),
    log: `${args.unitName} releases and runs back from the entrance.`,
  };
}
