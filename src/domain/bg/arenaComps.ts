// Named team compositions: what an arena bracket puts across from you. A seat is a class plus a
// NAME PREFIX into that class's baked premade list, so it refers to a build the tree ships.

import { CLASS } from '../../data/schema/constants.ts';
import type { SkillLine } from '../../data/schema.ts';
import type { GearProfile } from '../bots/botGear.ts';
import { BG_TIERS, BG_TIER_ORDER, type BgTierId } from './bgTier.ts';

/** 1 is the duel / gauntlet ladder (plan P4.2, P4.4); 2, 3 and 5 are the arena brackets. */
export type ArenaBracket = 1 | 2 | 3 | 5;

export interface ArenaCompSeat {
  cls: number;
  // Case-insensitive PREFIX of a row in `ds.botSpecs(cls)`. Always a `pvp ` row here — the premades this
  // table exists to point at.
  spec: string;
  role: 'tank' | 'healer' | 'dps';
  // A pvp band VARIANT name (rotationSuggestions selectBand). Absent = the class's default pvp
  // band, which is what every build but the four promoted ones runs.
  rotation?: string;
  /**
   * G11's dirty axis: gear for THIS SEAT, overriding the comp's. Absent = `comp.gear`, which is
   * what every shipped comp uses and the only thing an honorable round allows - the cell owns
   * tier and gear there, so a win is about the list.
   *
   * A dirty round is where this earns its keep: one contender brings twink kit to a field cell,
   * declares it, and the round file stamps the asymmetry. `bgRoster.ts:198` is the single place a
   * seat's profile reaches the body, so this rides through there and nowhere else.
   */
  gear?: GearProfile;
  /** G11: entries this seat carries on top of the loadout rule. `applyNamedItemList`, one stack each. */
  items?: readonly number[];
  /** G11: a pool filter — `generateCompBots` seats a body of this class that rolled the skill, or none. */
  profession?: SkillLine;
}

export interface ArenaComp {
  id: string;
  /** What the player reads. Classes and builds, not a story. */
  name: string;
  bracket: ArenaBracket;
  /** Where it sits on the shipped skill axis (bgTier.ts:23-63). */
  tier: BgTierId;
  /** Gear the whole comp wears. One of GEAR_PROFILES (botGear.ts:55-63). */
  gear: GearProfile;
  seats: readonly ArenaCompSeat[];
  /**
   * G9: a DIFFICULTY is a list as well as a gear profile. A tier named here makes every seat of
   * that rung run the variant named, so the Freemade warrior and the Apes warrior can fight
   * differently and not only hit harder. A tier absent keeps the seat's own `rotation` - which is
   * the class default for the shipped nine - so the ladder is unchanged until a variant is
   * authored for a rung.
   *
   * Per CLASS and not per tier on purpose: a convention like `<class>-<tier>` cannot say "these
   * two tiers share a list", and a field on `BG_TIERS` would force all nine classes to move
   * together.
   */
  variantByTier?: Partial<Record<BgTierId, string>>;
}

const D = (cls: number, spec: string): ArenaCompSeat => ({ cls, spec, role: 'dps' });
const H = (cls: number, spec: string): ArenaCompSeat => ({ cls, spec, role: 'healer' });

// P4.2, the 1v1 matrix: one duelist per class on a real `pvp *` premade, plus the four promoted
// variants. POOL_BUILDS and TRADE_BUILDS below join them into DUELIST_BUILDS.
const CORE_BUILDS: readonly ArenaComp[] = [
  { id: 'duel-warrior-arms', name: 'Warrior, arms', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.WARRIOR, 'pvp arms')] },
  // The seat names `ret-duel-v1` because the ret premade RESOLVES Holy below level 40
  // (`scripts/pvp/band-coverage.mjs`), and Holy is also the tree a paladin HEALER's role override
  // asks for (`companionRotation.ts:57`) - so the sub-60 duel list has to be a named variant or
  // every pvp healer paladin would be handed it. At 49, 59 and 60 the seat resolves Retribution,
  // no `ret-duel-v1` band covers that tree, and `selectBand` falls to the variant-less pvp pool,
  // which is `Retribution@60` - the same list this rung fought before.
  { id: 'duel-paladin-ret', name: 'Paladin, retribution', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.PALADIN, 'pvp dps ret'), rotation: 'ret-duel-v1' }] },
  { id: 'duel-hunter-mm', name: 'Hunter, marksmanship', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.HUNTER, 'pvp dps mm')] },
  { id: 'duel-rogue-combat', name: 'Rogue, combat swords', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.ROGUE, 'pvp dps combat (swords)')] },
  {
    id: 'duel-priest-shadow',
    name: 'Priest, shadow',
    bracket: 1, tier: 'normal', gear: 'field',
    seats: [D(CLASS.PRIEST, 'pvp dps shadow')],
    // G9's first use was `variantByTier: { skilled: 'pressure-v1', apes: 'pressure-v1' }`, on the
    // strength of r6's 29% vs 21%. That round was fought NAKED (duel plan §1b), and re-priced armed
    // in 2026-08-29-r14 the same pair reads 29% vs 31% - the variant is WORSE than this build. The
    // rungs go back to the shipped list; `variantByTier` itself is unchanged and unused.
  },
  { id: 'duel-shaman-enhance', name: 'Shaman, two-hand enhancement', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.SHAMAN, 'pvp dps enhan (2hand)')] },
  { id: 'duel-mage-frost', name: 'Mage, frost', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.MAGE, 'pvp dps frost')] },
  { id: 'duel-warlock-sl', name: 'Warlock, soul link', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.WARLOCK, 'pvp dps demo (sl)')] },
  { id: 'duel-druid-feral', name: 'Druid, feral', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.DRUID, 'pvp dps feral')] },
  // PROMOTED off round 2026-08-28-r6 by the §G5 rule (`scripts/pvp/duel-promote.mjs`). Each beat
  // its class's shipped build over 10 duels in BOTH directions AND leads it on the full cell, so
  // none of the three is the seat edge: arms 10-0 (100%/100% by seat) and 67% vs 47% full-cell,
  // soul link 8-2 (80%/80%) and 69% vs 62%, shadow 7-2-1 (80%/60%) and 35% vs 21%. Each carries
  // its own authored band on the seat, so all five of its rungs fight that list.
  { id: 'duel-warrior-arms-duel', name: 'Warrior, arms (duel list)', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'arms-duel-v1' }] },
  { id: 'duel-warlock-sl-demo', name: 'Warlock, demonology soul link', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.WARLOCK, 'pvp dps demo (sl)'), rotation: 'sl-v1' }] },
  { id: 'duel-priest-shadow-grok2', name: 'Priest, shadow (leech and blast)', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.PRIEST, 'pvp dps shadow'), rotation: 'g-shadow-v2' }] },
  // PROMOTED off round 2026-08-29-r11, the FIRST round fought by armed bodies - r1..r10 ran on a
  // bench that never attached the item catalog, so every seat was naked and every weapon ability was
  // refused. This variant read 50% h2h and LOST the cell in r10; armed it reads 9-0-1, 100%/80% by
  // seat - it clears both seats, so it is not the seat edge - and 72% vs 62% on the full cell.
  { id: 'duel-hunter-mm-deadzone', name: 'Hunter, marksmanship (dead zone)', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.HUNTER, 'pvp dps mm'), rotation: 'dead-zone-v1' }] },
];

// Seat kits, ALL unslotted: a slotted entry overwrites the Insignia once the paperdoll is full
// (bgConsumes.ts:134). Reflectors ride equipEngineerTrinket, which refuses to (bgConsumes.ts:158).
const SAPPER = [10646, 18641, 4390]; // Goblin Sapper Charge, Dense Dynamite, Iron Grenade
const FRAG = [15993, 10514, 4395]; // Thorium Grenade, Mithril Frag Bomb, Goblin Land Mine
const ORDNANCE = [10586, 4384, 4390]; // The Big One, Explosive Sheep, Iron Grenade
const ARCANE_ORDNANCE = [16040, 16005, 18641]; // Arcane Bomb, Dark Iron Bomb, Dense Dynamite
const HEAVY_ORDNANCE = [16005, 10646, 4390]; // Dark Iron Bomb, Goblin Sapper Charge, Iron Grenade
// No profession gate, so these ride at EVERY rung — the tier's own kit starts at twink (bgRoster.ts:84).
const RAGE_KIT = [13442, 3387, 13455, 5634]; // Mighty Rage, Limited Invuln, Stoneshield, Free Action
const SHADOW_KIT = [9172, 5634, 9030, 13452]; // Invisibility, Free Action, Restorative, Mongoose
const MANA_KIT = [13444, 9030, 3387, 20008]; // Major Mana, Restorative, Limited Invuln, Living Action
const RUNE_KIT = [12662, 9030, 5634]; // Demonic Rune, Restorative, Free Action
const JUJU_KIT = [12459, 5634, 13453]; // Juju Escape, Free Action, Elixir of Brute Force

// Premades the tree bakes and the gauntlet never seated: 9 of the 34 `pvp *` rows were in use.
const POOL_BUILDS: readonly ArenaComp[] = [
  { id: 'duel-warrior-fury', name: 'Warrior, fury', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.WARRIOR, 'pvp fury')] },
  { id: 'duel-paladin-reck', name: 'Paladin, reckoning bomb', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.PALADIN, 'pvp dps ret (Loaded Reck Bomb)')] },
  { id: 'duel-hunter-surv', name: 'Hunter, survival', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.HUNTER, 'pvp dps surv')] },
  { id: 'duel-hunter-bm', name: 'Hunter, beast mastery', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.HUNTER, 'pvp dps bm')] },
  { id: 'duel-rogue-daggers', name: 'Rogue, combat daggers', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.ROGUE, 'pvp dps combat (daggers)')] },
  { id: 'duel-shaman-elem', name: 'Shaman, elemental', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.SHAMAN, "pvp dps elem (nature's swiftness)")] },
  { id: 'duel-mage-arcane', name: 'Mage, arcane', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.MAGE, 'pvp dps arcane (venruki)')] },
  { id: 'duel-warlock-affli', name: 'Warlock, affliction', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.WARLOCK, 'pvp dps affli (sm/ruin)')] },
  { id: 'duel-warlock-destro', name: 'Warlock, destruction', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.WARLOCK, 'pvp dps destro (conflagrate)')] },
  { id: 'duel-warlock-sl-nightfall', name: 'Warlock, soul link nightfall', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.WARLOCK, 'pvp dps demo (soul link/ nightfall)')] },
  { id: 'duel-druid-balance', name: 'Druid, balance', bracket: 1, tier: 'normal', gear: 'field', seats: [D(CLASS.DRUID, 'pvp dps balance (boomkin)')] },
];

// Bodies with a TRADE behind them: `profession` filters the pool, `items` stocks the bags. Rank rides
// the gear profile (squad.ts:348), so a Freemade tinker throws cheap and only raid rungs reach Thorium.
const TRADE_BUILDS: readonly ArenaComp[] = [
  { id: 'duel-warrior-sapper', name: 'Warrior, arms sapper', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.WARRIOR, 'pvp arms'), profession: 'engineering', items: SAPPER }] },
  { id: 'duel-rogue-bomber', name: 'Rogue, daggers bomber', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.ROGUE, 'pvp dps combat (daggers)'), profession: 'engineering', items: FRAG }] },
  { id: 'duel-hunter-tinker', name: 'Hunter, survival tinker', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.HUNTER, 'pvp dps surv'), profession: 'engineering', items: ORDNANCE }] },
  { id: 'duel-mage-bomber', name: 'Mage, frost bomber', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.MAGE, 'pvp dps frost'), profession: 'engineering', items: ARCANE_ORDNANCE }] },
  { id: 'duel-shaman-bomber', name: 'Shaman, enhancement bomber', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.SHAMAN, 'pvp dps enhan (2hand)'), profession: 'engineering', items: HEAVY_ORDNANCE }] },
  { id: 'duel-warrior-potions', name: 'Warrior, arms consumables', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.WARRIOR, 'pvp arms'), items: RAGE_KIT }] },
  { id: 'duel-rogue-potions', name: 'Rogue, swords consumables', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), items: SHADOW_KIT }] },
  { id: 'duel-priest-potions', name: 'Priest, shadow consumables', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.PRIEST, 'pvp dps shadow'), items: MANA_KIT }] },
  { id: 'duel-warlock-runes', name: 'Warlock, affliction runes', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.WARLOCK, 'pvp dps affli (sm/ruin)'), items: RUNE_KIT }] },
  { id: 'duel-druid-juju', name: 'Druid, feral juju', bracket: 1, tier: 'normal', gear: 'field', seats: [{ ...D(CLASS.DRUID, 'pvp dps feral'), items: JUJU_KIT }] },
];

const DUELIST_BUILDS: readonly ArenaComp[] = [...CORE_BUILDS, ...POOL_BUILDS, ...TRADE_BUILDS];


// Every build at every tier — P4.4's gauntlet ladder as data, Freemade at the bottom. DERIVED,
// because a tier is a gear profile plus a cadence and changes nothing about which premade runs.
function perTier(builds: readonly ArenaComp[]): readonly ArenaComp[] {
  return BG_TIER_ORDER.flatMap((tier) =>
    builds.map((b): ArenaComp => ({
      ...b,
      id: `${b.id}-${tier}`,
      name: `${BG_TIERS[tier].name} ${b.name.charAt(0).toLowerCase()}${b.name.slice(1)}`,
      tier,
      gear: BG_TIERS[tier].enemyGear,
      // G9: the rung derives its own LIST here, exactly where it already derives id, name and gear.
      // `variantByTier` names one per tier; a tier it does not name keeps the seat's own rotation,
      // which is the class default for the shipped builds.
      seats: b.variantByTier?.[tier]
        ? b.seats.map((s) => ({ ...s, rotation: b.variantByTier![tier]! }))
        : b.seats,
    })));
}

const DUELISTS: readonly ArenaComp[] = perTier(DUELIST_BUILDS);

// Tiers the CLIMB uses. `freemade` is a battleground filler - "a thrown-together pug in shabby kit"
// (bgTier.ts:25) - and with 34 builds it was 34 duels in grey before the ladder reached quest gear.
// Its rungs still exist for the bench and for `pickArenaComp`; they are just not part of the climb.
const GAUNTLET_TIERS: readonly BgTierId[] = BG_TIER_ORDER.filter((t) => t !== 'freemade');

/** The gauntlet: every duelist, weakest rung first. Cite: BG_TIER_ORDER (bgTier.ts:23). */
export function gauntletLadder(): ArenaComp[] {
  return GAUNTLET_TIERS.flatMap((tier) => DUELISTS.filter((c) => c.tier === tier));
}

// The comp a 1v1 arena seats: the rung after the highest one beaten. Null once the ladder is
// cleared, and the caller then falls back to the seeded `pickArenaComp`.
export function gauntletNextComp(rungsBeaten: number): ArenaComp | null {
  const ladder = gauntletLadder();
  const i = Math.max(0, Math.trunc(rungsBeaten || 0));
  return i < ladder.length ? ladder[i]! : null;
}

// The rung count after a 1v1 result: the HIGHEST rung beaten, so it is a trophy rather than a
// queue. Only a WIN moves it and it never decreases. It stopped being "the next rung" when rating
// took over seating (arenaRating.ts) - a rating picks any rung near you, so a strict +1 on the very
// next one would have frozen the count for good. A comp off the ladder (freemade, or a team
// bracket) is not a rung and moves nothing.
export function gauntletRungAfter(
  rungsBeaten: number,
  facedCompId: string | null,
  won: boolean,
): number {
  const cur = Math.max(0, Math.trunc(rungsBeaten || 0));
  if (!won || facedCompId == null) return cur;
  const i = gauntletLadder().findIndex((c) => c.id === facedCompId);
  return i < 0 ? cur : Math.max(cur, i + 1);
}

/** Total rungs, for the surface line. */
export function gauntletLength(): number {
  return gauntletLadder().length;
}

// P4.3, first 2v2 pairings. Three, not forty: the plan is explicit that the lab (P7) says which comps are
// worth cloning, and authoring a wall of them first is guessing.
const PAIR_BUILDS: readonly ArenaComp[] = [
  {
    id: 'arena2-warrior-priest',
    name: 'Warrior and priest',
    bracket: 2, tier: 'normal', gear: 'field',
    seats: [D(CLASS.WARRIOR, 'pvp arms'), H(CLASS.PRIEST, 'pvp heal holy')],
  },
  {
    id: 'arena2-rogue-priest',
    name: 'Rogue and priest',
    bracket: 2, tier: 'normal', gear: 'field',
    seats: [D(CLASS.ROGUE, 'pvp dps combat (daggers)'), H(CLASS.PRIEST, 'pvp heal holy')],
  },
  // Four more off the SAME premade rows the duelist pool seats, so no prefix is new here either.
  // One carries the sapper kit, which is the 2v2 case of the trade seats above.
  {
    id: 'arena2-hunter-priest',
    name: 'Hunter and priest',
    bracket: 2, tier: 'normal', gear: 'field',
    seats: [D(CLASS.HUNTER, 'pvp dps surv'), H(CLASS.PRIEST, 'pvp heal holy')],
  },
  {
    id: 'arena2-mage-shaman',
    name: 'Mage and shaman',
    bracket: 2, tier: 'normal', gear: 'field',
    seats: [D(CLASS.MAGE, 'pvp dps frost'), H(CLASS.SHAMAN, 'pvp heal resto')],
  },
  {
    id: 'arena2-warlock-paladin',
    name: 'Warlock and paladin',
    bracket: 2, tier: 'normal', gear: 'field',
    seats: [D(CLASS.WARLOCK, 'pvp dps destro (conflagrate)'), H(CLASS.PALADIN, 'pvp heal holy')],
  },
  {
    id: 'arena2-sapper-druid',
    name: 'Warrior sapper and druid',
    bracket: 2, tier: 'normal', gear: 'field',
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), profession: 'engineering', items: SAPPER },
      H(CLASS.DRUID, 'pvp dps resto'),
    ],
  },
  // PROMOTED off round 2026-09-10-w9, the first 2v2 promotion this program has produced: 76% both
  // seats (chal 88 / targ 65, seatGap +23) over the best incumbent's 71%, and it won the war 6-4
  // with 60% on BOTH seats. Same classes as `arena2-rogue-priest` above and it beats that row on
  // lists alone — Kick plus Gouge as a second interrupt, and Holy Nova so a kick cannot eat the
  // heal. Its rogue seat casts every one of its 17 built combat rows. Left CONTENDER_COMPS here.
  {
    id: 'arena2-rogue-priest-nova',
    name: 'Combat swords rogue and holy priest (Nova triage)',
    bracket: 2, tier: 'normal', gear: 'field',
    seats: [
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w9a-kick-gouge' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w9a-nova-triage' },
    ],
  },
  // PROMOTED off round 2026-09-10-w13. Both authors again picked the promoted comp's own classes
  // and both keyed a PEEL. b took the higher full-cell (69%, chal 84 / targ 53) but LOST the war
  // 3-7; a tied the best incumbent at 67% with an identical chal 78 / targ 56 / gap 22 split, which
  // "not below the best incumbent" (plan §5) admits. Both beat `arena2-warrior-priest` - the comp
  // that had beaten every rogue-priest before - 70% and 80%. Holy Nova cast 111 and 102 times here
  // against ZERO in every round before §W12 fixed it.
  {
    id: 'arena2-rogue-priest-peel',
    name: 'Combat swords rogue and holy priest (peel Blind, disc Nova)',
    bracket: 2, tier: 'normal', gear: 'field',
    seats: [
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w13a-kick-peel' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w13a-nova-disc' },
    ],
  },
  {
    id: 'arena2-rogue-priest-novastay',
    name: 'Combat swords rogue and holy priest (Nova stay)',
    bracket: 2, tier: 'normal', gear: 'field',
    seats: [
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w13b-kick-gouge' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w13b-nova-stay' },
    ],
  },
];

/** P4.3, one 3v3 to start: the shape a bracket-3 arena seats. */
const TRIO_BUILDS: readonly ArenaComp[] = [
  {
    id: 'arena3-warrior-mage-priest',
    name: 'Warrior, mage and priest',
    bracket: 3, tier: 'normal', gear: 'field',
    seats: [
      D(CLASS.WARRIOR, 'pvp arms'),
      D(CLASS.MAGE, 'pvp dps frost'),
      H(CLASS.PRIEST, 'pvp heal holy'),
    ],
  },
  {
    id: 'arena3-rogue-warlock-druid',
    name: 'Rogue, warlock and druid',
    bracket: 3, tier: 'normal', gear: 'field',
    seats: [
      D(CLASS.ROGUE, 'pvp dps combat (daggers)'),
      D(CLASS.WARLOCK, 'pvp dps affli (sm/ruin)'),
      H(CLASS.DRUID, 'pvp dps resto'),
    ],
  },
  // HORDE, and it has to be one side: paladin is Alliance-only and shaman Horde-only, so the
  // paladin healer this trio shipped with made it unseatable by either (`arenaLab.ts:96`).
  {
    id: 'arena3-hunter-shaman-priest',
    name: 'Hunter, shaman and priest',
    bracket: 3, tier: 'normal', gear: 'field',
    seats: [
      D(CLASS.HUNTER, 'pvp dps bm'),
      D(CLASS.SHAMAN, "pvp dps elem (nature's swiftness)"),
      H(CLASS.PRIEST, 'pvp heal holy'),
    ],
  },
  // PROMOTED off round 2026-09-10-w12, the first war round at bracket 3 and the first round to
  // promote BOTH authors: b at 83% (chal 80 / targ 85) and a at 68% (65 / 70) against the best
  // incumbent's 35%, seat gap -5 each. Blind, both replaced the mage that collapses as the enemy
  // seat with a second melee, so two bodies dump Mortal Strike and Kidney on the healer.
  {
    id: 'arena3-warrior-rogue-priest-nova',
    name: 'Arms warrior, combat rogue and holy priest (nova stack)',
    bracket: 3, tier: 'normal', gear: 'field',
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w12b-ms-pummel' },
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w12b-kick-blind' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w12b-nova-stack' },
    ],
  },
  {
    id: 'arena3-warrior-rogue-priest-peel',
    name: 'Arms warrior, combat swords rogue and holy priest (peel)',
    bracket: 3, tier: 'normal', gear: 'field',
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w12a-ms-healer' },
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w12a-kick-blind' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w12a-party-nova' },
    ],
  },
];

/**
 * G6, the first 5v5. Bracket 5 had nothing at all, so `pickArenaComp(5, ...)` returned null and
 * the bracket could not seat.
 *
 * ONE, and every seat copied rather than invented (CLAUDE.md §5): the three dps are the TRIO's
 * own warrior and mage plus the `arena2-rogue-priest` rogue, and the two healers are the holy
 * priest both PAIRS use and the resto druid `arena2-warlock-druid` already seats as its healer.
 * So no premade prefix and no build appears here for the first time. Which comps are worth
 * cloning is the lab's answer, not this table's (P4.3's restraint, and duel plan §G6).
 */
const FIVE_BUILDS: readonly ArenaComp[] = [
  {
    id: 'arena5-warrior-rogue-mage-priest-druid',
    name: 'Warrior, rogue, mage, priest and druid',
    bracket: 5, tier: 'normal', gear: 'field',
    seats: [
      D(CLASS.WARRIOR, 'pvp arms'),
      D(CLASS.ROGUE, 'pvp dps combat (daggers)'),
      D(CLASS.MAGE, 'pvp dps frost'),
      H(CLASS.PRIEST, 'pvp heal holy'),
      H(CLASS.DRUID, 'pvp dps resto'),
    ],
  },
  // PROMOTED off round 2026-09-10-w8, the first war round at this bracket: 75% both seats
  // (chal 90 / targ 60, seatGap +30) against this table's other comp at 40%, and it won the war
  // 8-2. Two healers where the row above runs one, and swords rather than daggers because a
  // dagger rogue cannot get behind (KI-1073). It left CONTENDER_COMPS as it joined here.
  {
    id: 'arena5-warrior-rogue-mage-priest-shaman',
    name: 'Warrior, rogue, mage, priest and shaman',
    bracket: 5, tier: 'normal', gear: 'field',
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w8b-ms-pummel' },
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w8b-kick-blind' },
      { ...D(CLASS.MAGE, 'pvp dps frost'), rotation: 'w8b-poly-offheal' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w8b-party-triage' },
      { ...H(CLASS.SHAMAN, 'pvp heal resto'), rotation: 'w8b-ground-chain' },
    ],
  },
  // PROMOTED off round 2026-09-10-w14 at 67% both seats against the best incumbent's 47%, winning
  // the war 6-4. Read the seat gap before trusting the headline: this one is **+40** (chal 87 /
  // targ 47) where the author b setup it beat sits at +13 - so the promoted comp is the MORE
  // seat-dependent of the two, the opposite of round w12 where both promoted at -5.
  {
    id: 'arena5-wrmps-peel',
    name: 'Arms warrior, swords rogue, frost mage, holy priest, resto shaman (peel)',
    bracket: 5, tier: 'normal', gear: 'field',
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w14a-ms-pummel' },
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w14a-kick-peel' },
      { ...D(CLASS.MAGE, 'pvp dps frost'), rotation: 'w14a-poly-sheep' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w14a-nova-triage' },
      { ...H(CLASS.SHAMAN, 'pvp heal resto'), rotation: 'w14a-ground-lhw' },
    ],
  },
];

// The team brackets ride the SAME derivation the duelists do. Before this they existed only at
// `normal`/`field`, and `generateCompBots` takes gear from `seat.gear ?? comp.gear`
// (`bgRoster.ts:213`) - so a named 2v2/3v3/5v5 wore quest kit at every tier and the difficulty
// picker moved nothing but the consumes flag. Rating is the caller that needs the range.
const PAIRS: readonly ArenaComp[] = perTier(PAIR_BUILDS);
const TRIOS: readonly ArenaComp[] = perTier(TRIO_BUILDS);
const FIVES: readonly ArenaComp[] = perTier(FIVE_BUILDS);

export const ARENA_COMPS: readonly ArenaComp[] = [...DUELISTS, ...PAIRS, ...TRIOS, ...FIVES];

// Fighters UNDER TEST the duel lab benches. Absent from ARENA_COMPS is the gate — a promoted
// contender leaves this list as it joins DUELIST_BUILDS, or it shadows its own promotion.
export const CONTENDER_COMPS: readonly ArenaComp[] = [
  // RELEGATED off round 26, five rounds after a9f147c84 promoted it: 1554 and ABOVE the bracket 2
  // median 1544, but seat-dependent at gap3 60 against a shipped field sitting at 31 to 47. The
  // player meets a comp as the TARGET side, where a gap that size means it underperforms its
  // rating. Its author keeps it here and the ladder keeps rating it.
  {
    id: 'arena2-warrior-priest-w10b',
    name: 'Arms warrior and holy priest (Execute MS, Nova dispel)',
    bracket: 2, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w10b-execute-ms' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w10b-nova-dispel' },
    ],
  },
  // RELEGATED off round 16: 1297 over 8 rounds, 247 under the bracket 2 median, and no class
  // leaves the field with it (`ladder.mjs pool --bracket 2`). It stays here so the ladder can still
  // rate it and an author can still re-author it; it is only out of the pool the player faces.
  {
    id: 'arena2-warlock-druid',
    name: 'Warlock and druid',
    bracket: 2, tier: 'normal', gear: 'field',
    seats: [D(CLASS.WARLOCK, 'pvp dps affli'), H(CLASS.DRUID, 'pvp dps resto')],
  },
  {
    id: 'duel-mage-frost-shatter-normal',
    name: 'Mage, frost (nova opener)',
    // Tier in the id and gear off the tier, exactly as DUELISTS derives a rung: a challenger
    // has to wear what the rung it is challenging wears, or the bench is measuring the gear.
    bracket: 1, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [{ ...D(CLASS.MAGE, 'pvp dps frost'), rotation: 'shatter-v1' }],
  },
  {
    id: 'duel-priest-shadow-pressure-normal',
    name: 'Priest, shadow (fear first)',
    bracket: 1, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [{ ...D(CLASS.PRIEST, 'pvp dps shadow'), rotation: 'pressure-v1' }],
  },
  {
    id: 'duel-priest-shadow-grok-normal',
    name: 'Priest, shadow (scream disc)',
    bracket: 1, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [{ ...D(CLASS.PRIEST, 'pvp dps shadow'), rotation: 'g-shadow-v1' }],
  },
  // `dead-zone-v1` was here until it was PROMOTED off r11 and became a DUELIST_BUILD above. A
  // promoted list leaves this table, the same way arms-duel-v1, sl-v1 and g-shadow-v2 did - it is an
  // incumbent now, and leaving it would bench one list twice under two ids in the same cell.
  {
    id: 'duel-druid-feral-bearcat-normal',
    name: 'Druid, feral (bear swap)',
    bracket: 1, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [{ ...D(CLASS.DRUID, 'pvp dps feral'), rotation: 'bearcat-v1' }],
  },
  // Round 2026-09-10-w2, the first WAR round: two blind authors, one bracket (arena-setup-wars.md
  // §2). Registered here by the orchestrator from each report's JSON block, never by the author.
  {
    id: 'arena2-warrior-priest-w2a',
    name: 'Warrior arms and holy priest',
    bracket: 2, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w2a-ms-healer' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w2a-ally-triage' },
    ],
  },
  {
    id: 'arena2-mage-priest-w2b',
    name: 'Mage frost and priest holy',
    bracket: 2, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.MAGE, 'pvp dps frost'), rotation: 'w2b-poly-shatter' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w2b-shield-peel' },
    ],
  },
  // Round 2026-09-10-w6, the second war round: both authors read their OWN w2 debrief and both
  // answered it with a warrior plus a healer, blind, differing only in the healer.
  {
    id: 'arena2-warrior-shaman-w6a',
    name: 'Warrior arms and resto shaman',
    bracket: 2, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w6a-ms-healer' },
      { ...H(CLASS.SHAMAN, 'pvp heal resto'), rotation: 'w6a-ground-purge' },
    ],
  },
  {
    id: 'arena2-warrior-paladin-w6b',
    name: 'Warrior arms and holy paladin',
    bracket: 2, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w6b-ms-pummel' },
      { ...H(CLASS.PALADIN, 'pvp heal holy'), rotation: 'w6b-bop-peel' },
    ],
  },
  // Round 2026-09-10-w7. Both authors answered their own w6 debrief: a's warrior stopped dancing
  // stances, b's dropped the paladin that died 56/80 for the priest the cell's top two already use.
  {
    id: 'arena2-warrior-priest-w7a',
    name: 'Warrior arms and holy priest (berserker)',
    bracket: 2, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w7a-zerk-stick' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w7a-self-bubble' },
    ],
  },
  {
    id: 'arena2-rogue-priest-w7b',
    name: 'Combat swords rogue and holy priest',
    bracket: 2, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w7b-kick-kidney' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w7b-self-shield' },
    ],
  },
  // Round 2026-09-10-w9. Both authors blind-picked the INCUMBENT's own classes (swords rogue and
  // holy priest, the 73% row) and tried to play it better, differing only in the lists.
  // `arena2-rogue-priest-w9a` was here until it was PROMOTED off w9 and became a PAIR_BUILD —
  // the same rule `dead-zone-v1` and the w8 five-man left this table under.
  {
    id: 'arena2-rogue-priest-w9b',
    name: 'Combat swords rogue and holy priest (self triage)',
    bracket: 2, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w9b-kick-blind' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w9b-self-triage' },
    ],
  },
  // Round 2026-09-10-w8, the FIRST war round at bracket 5. Both authors ran two healers against
  // the single incumbent's one, and both dropped its dagger rogue; blind, they differ in the
  // third dps (hunter against rogue). Horde on both: shaman is Horde-only.
  {
    id: 'arena5-warrior-hunter-mage-priest-shaman-w8a',
    name: 'Warrior, hunter, mage, priest and shaman',
    bracket: 5, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w8a-ms-healer' },
      { ...D(CLASS.HUNTER, 'pvp dps mm'), rotation: 'w8a-viper-healer' },
      { ...D(CLASS.MAGE, 'pvp dps frost'), rotation: 'w8a-poly-offheal' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w8a-party-triage' },
      { ...H(CLASS.SHAMAN, 'pvp heal resto'), rotation: 'w8a-chain-ground' },
    ],
  },
  // `arena5-warrior-rogue-mage-priest-shaman-w8b` was here until it was PROMOTED off w8 and became
  // a FIVE_BUILD above — the same rule `dead-zone-v1` left this table under. Leaving it would
  // bench one setup twice under two ids in the same cell.
  // Round 2026-09-10-w10. Blind, the authors SPLIT: a iterated the promoted rogue-priest (Nova
  // above the hurt-shield spam), b seated the arms warrior that beat it 8-2 and copied its priest.
  {
    id: 'arena2-rogue-priest-w10a',
    name: 'Combat swords rogue and holy priest (Nova melee)',
    bracket: 2, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w10a-kidney-half' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w10a-nova-melee' },
    ],
  },
  // Round 2026-09-10-w12, the FIRST war round at bracket 3 - openable only after §W11's gate stopped
  // measuring potion-carrying bodies. Blind, BOTH authors picked the same class trio and both
  // dropped the incumbent's mage, which the 3v3 debriefs had shown collapsing as the enemy seat.
  // Both w12 contenders were here until they PROMOTED off that round and became TRIO_BUILDS above -
  // the same rule dead-zone-v1 and the w8 five-man left this table under.
  // Round 2026-09-10-w13 at bracket 2. Blind, both authors again picked the promoted comp's own
  // classes and both keyed a PEEL - a's through a new `allyHasAggro` condition, b's in the engine's
  // target picker. b's engine hunks were REVERTED at review (they cost the mirror; see
  // repro-duel-peel-low-ally.mjs, red on purpose); both authors' BANDS stand.
  // Both w13 contenders were here until they PROMOTED off that round and became PAIR_BUILDS
  // above - the same rule dead-zone-v1 and the w8 five-man left this table under.
  // Round 2026-09-10-w14 at bracket 5. Blind, both authors picked the SAME five classes as the
  // promoted incumbent and differ only in the lists - the third round running where they converge.
  // `arena5-wrmps-w14a` was here until it PROMOTED off w14 and became a FIVE_BUILD above.
  // `arena5-wrmps-w14b` stays: it HELD at 53%, under the 60% floor, so it is still a contender.
  {
    id: 'arena5-wrmps-w14b',
    name: 'Arms warrior, swords rogue, frost mage, holy priest, resto shaman (shoot)',
    bracket: 5, tier: 'normal', gear: BG_TIERS.normal.enemyGear,
    seats: [
      { ...D(CLASS.WARRIOR, 'pvp arms'), rotation: 'w14b-ms-pummel' },
      { ...D(CLASS.ROGUE, 'pvp dps combat (swords)'), rotation: 'w14b-kick-peel' },
      { ...D(CLASS.MAGE, 'pvp dps frost'), rotation: 'w14b-poly-shoot' },
      { ...H(CLASS.PRIEST, 'pvp heal holy'), rotation: 'w14b-nova-stack' },
      { ...H(CLASS.SHAMAN, 'pvp heal resto'), rotation: 'w14b-ground-lhw' },
    ],
  },
];

/** A comp by id, incumbent or contender. The bench names either; the game only seats the first. */
export function compById(id: string): ArenaComp | null {
  return ARENA_COMPS.find((c) => c.id === id) ?? CONTENDER_COMPS.find((c) => c.id === id) ?? null;
}

/** Every comp that fits `bracket`, in table order. */
export function compsForBracket(bracket: ArenaBracket): ArenaComp[] {
  return ARENA_COMPS.filter((c) => c.bracket === bracket);
}

// A comp for this bracket, chosen deterministically off the match seed, preferring this tier and
// falling back to any comp of the bracket. Null when none is authored, so the caller runs bots.
export function pickArenaComp(
  bracket: ArenaBracket,
  seed: number,
  tier?: BgTierId,
): ArenaComp | null {
  const all = compsForBracket(bracket);
  if (!all.length) return null;
  const atTier = tier ? all.filter((c) => c.tier === tier) : [];
  const pool = atTier.length ? atTier : all;
  return pool[Math.abs(seed | 0) % pool.length] ?? null;
}

// Resolve a seat's spec PREFIX against the class's baked premade list. Returns the index into
// `ds.botSpecs(cls)`, or -1 when nothing matches — never a guess.
export function resolveCompSpecIdx(
  specs: readonly { name: string; role: string }[],
  seat: ArenaCompSeat,
): number {
  const want = seat.spec.toLowerCase();
  for (let i = 0; i < specs.length; i++) {
    if ((specs[i]?.name ?? '').toLowerCase().startsWith(want)) return i;
  }
  return -1;
}
