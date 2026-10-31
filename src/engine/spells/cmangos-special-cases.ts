// Dimension-C special-case spell ids from the CMaNGOS Spells sources: pure rule helpers and
// dispositions, with the combat wiring in the owning layer. Cite: census-spell-opcodes.mjs.

// ── Stage spell ids (every id is intentional — closes Dimension C) ──────────

/** Curse of Idiocy — PERIODIC_TRIGGER self-stack stop at −90 int/spirit. */
export const CURSE_OF_IDIOCY_SPELL_ID = 1010;
/** Banish Exile spells. Cite: item_scripts.cpp:114-141. */
export const BANISH_EXILE_BURNING_SPELL_ID = 4130;
export const BANISH_EXILE_CRESTING_SPELL_ID = 4131;
export const BANISH_EXILE_THUNDERING_SPELL_ID = 4132;
export const BANISH_EXILE_BURNING_ENTRY = 2760;
export const BANISH_EXILE_CRESTING_ENTRY = 2761;
export const BANISH_EXILE_THUNDERING_ENTRY = 2762;
// The script id on Improved Mend Pet's override-class-scripts aura. Baked spell 4086 is a creature
// Evasion; the C++ case is the SCRIPT id. Cite: UnitAuraProcHandler.cpp:1615-1623.
export const IMPROVED_MEND_PET_SCRIPT_RANK1 = 4086;
export const IMPROVED_MEND_PET_SCRIPT_RANK2 = 4087;
/** Improved Mend Pet talent ranks (aura 112). */
export const IMPROVED_MEND_PET_RANK1_SPELL_ID = 19572;
export const IMPROVED_MEND_PET_RANK2_SPELL_ID = 19573;
/** Triggered dispel on crit mend. Cite: UnitAuraProcHandler.cpp:1621. */
export const IMPROVED_MEND_PET_TRIGGER_SPELL_ID = 24406;

/** Opening Booty Chest — CMSG_OPEN_ITEM path define only. */
export const OPEN_BOOTY_CHEST_SPELL_ID = 5107;
/** Echeyakee's Grace — MOD_STAT stacks with everything. */
export const ECHEYAKEE_GRACE_SPELL_ID = 5320;
/** Songflower Serenade — same stack exemption. Cite: SpellStacking.cpp:253. */
export const SONGFLOWER_SERENADE_SPELL_ID = 15366;
/** Curse of Mending — proc retargets to pVictim. */
export const CURSE_OF_MENDING_SPELL_ID = 7099;
/** Capture Spirit — CheckCast creature-entry allowlist. */
export const CAPTURE_SPIRIT_SPELL_ID = 7914;
/** Deviate Fish — EffectDummy random outcome. */
export const DEVIATE_FISH_SPELL_ID = 8063;
/** Cooked Deviate Fish (Savory Deviate Delight) — gender morph. */
export const COOKED_DEVIATE_FISH_SPELL_ID = 8213;
/** Gnomish Universal Remote. */
export const UNIVERSAL_REMOTE_SPELL_ID = 8344;
// Lightning Blast — no real Spells/*.cpp case (float false-positive −240.8598). Cite: SpellEffects.cpp:577
// coordinate comment.
export const LIGHTNING_BLAST_SPELL_ID = 8598;
/** Bending Shinbone — SCRIPT_EFFECT 1/5 → 8854 else 8855. */
export const BENDING_SHINBONE_SPELL_ID = 8856;
// Moonfire rank — no real Spells/*.cpp case (Ashbringer sound-id false positive). Cite:
// SpellEffects.cpp:1253 AshbringerSounds array.
export const MOONFIRE_8924_SPELL_ID = 8924;
/** Create Filled Containment Coffer — cast by Attract Rift Spawn 9012. */
export const CREATE_FILLED_CONTAINMENT_COFFER_SPELL_ID = 9010;
/** Create Containment Coffer — OnCheckTarget requires aura 9032. */
export const CREATE_CONTAINMENT_COFFER_SPELL_ID = 9082;
/** Rift spawn stun gate for coffer. Cite: Spell.cpp:7985–7988; SpellEffects.cpp:416. */
export const RIFT_SPAWN_STUN_AURA_SPELL_ID = 9032;
/** Attract Rift Spawn dummy → CastSpell(9010). Cite: SpellEffects.cpp:409–416. */
export const ATTRACT_RIFT_SPAWN_SPELL_ID = 9012;
// Mortal Strike (creature aura-23) — SelectAttackingTarget TOPAGGRO for trigger. Cite:
// SpellAuras.cpp:1161–1171.
export const MORTAL_STRIKE_CREATURE_AURA_SPELL_ID = 9347;
/** Thaumaturgy Channel — quest CREATE_ITEM (already dispositioned). */
export const THAUMATURGY_CHANNEL_SPELL_ID = 9712;
/** Eye for an Eye ranks. */
export const EYE_FOR_AN_EYE_RANK1_SPELL_ID = 9799;
export const EYE_FOR_AN_EYE_RANK2_SPELL_ID = 25988;
/** Eye for an Eye damage payload. Cite: UnitAuraProcHandler.cpp:807. */
export const EYE_FOR_AN_EYE_DAMAGE_SPELL_ID = 25997;
/** Polly Eats the E.C.A.C. */
export const POLLY_EATS_ECAC_SPELL_ID = 9976;
/** Polly Jr. summon. Cite: SpellEffects.cpp:423. */
export const POLLY_JR_SPELL_ID = 9998;
/** Curse of the Eye male transform (from dummy 3360). */
export const CURSE_OF_THE_EYE_MALE_SPELL_ID = 10651;
/** Curse of the Eye female. Cite: SpellEffects.cpp:358. */
export const CURSE_OF_THE_EYE_FEMALE_SPELL_ID = 10653;
/** Curse of the Eye parent dummy. Cite: SpellEffects.cpp:355–360. */
export const CURSE_OF_THE_EYE_DUMMY_SPELL_ID = 3360;
// Summon Brown Snake — no combat Spells/*.cpp case (ItemID comment false-positive on Gnomish Shrink Ray
// 13006 ItemID:10716). Cite: SpellEffects.cpp:447.
export const SUMMON_BROWN_SNAKE_SPELL_ID = 10716;
/** Ignite ranks (dummy aura → custom DoT 12654). */
export const IGNITE_RANK1_SPELL_ID = 11119;
export const IGNITE_RANK2_SPELL_ID = 11120;
export const IGNITE_RANK3_SPELL_ID = 12846;
export const IGNITE_RANK4_SPELL_ID = 12847;
export const IGNITE_RANK5_SPELL_ID = 12848;
/** Ignite DoT payload. Cite: UnitAuraProcHandler.cpp:985. */
export const IGNITE_DOT_SPELL_ID = 12654;

// ── Stage s14 — Dimension C batch (12699…14265) ─────────────────────────────

/** Summon Screecher Spirit — CheckCast one-shot per creature. Cite: Spell.cpp:7922–7932. */
export const SUMMON_SCREECHER_SPIRIT_SPELL_ID = 12699;
/** Deep Wounds talent ranks (aura 42 → custom DoT 12721). Cite: UnitAuraProcHandler.cpp:1316–1342. */
export const DEEP_WOUNDS_RANK1_SPELL_ID = 12834;
export const DEEP_WOUNDS_RANK2_SPELL_ID = 12849;
export const DEEP_WOUNDS_RANK3_SPELL_ID = 12867;
/** Deep Wound DoT payload. Cite: UnitAuraProcHandler.cpp:1341 trigger_spell_id = 12721. */
export const DEEP_WOUND_DOT_SPELL_ID = 12721;
// Deep Wound DoT timing from spell_template 12721: DurationIndex 29 → 12s, EffectAmplitude1 3000. Cite:
// spell_template 12721; duration.ts FALLBACK_DURATION_MS[29]=12000.
export const DEEP_WOUND_DOT_DURATION_MS = 12_000;
export const DEEP_WOUND_DOT_TICK_MS = 3000;

// The warrior Flurry haste ranks the talent parents trigger. The haste proc fires only on the main
// target and never during extra attacks, with three charges. Cite: UnitAuraProcHandler.cpp:749-762.
export const FLURRY_WARRIOR_RANK1_SPELL_ID = 12966;
export const FLURRY_WARRIOR_RANK2_SPELL_ID = 12967;
export const FLURRY_WARRIOR_RANK3_SPELL_ID = 12968;
export const FLURRY_WARRIOR_RANK4_SPELL_ID = 12969;
export const FLURRY_WARRIOR_RANK5_SPELL_ID = 12970;
/** spell_template.ProcCharges for Flurry haste buffs. */
export const FLURRY_PROC_CHARGES = 3;

/** Gnomish Shrink Ray dummy. Cite: SpellEffects.cpp:447–467. */
export const SHRINK_RAY_SPELL_ID = 13006;
export const SHRINK_RAY_TARGET_SHRINK_SPELL_ID = 13003;
export const SHRINK_RAY_GROW_SPELL_ID = 13004;
export const SHRINK_RAY_PARTY_SHRINK_SPELL_ID = 13010;

// Blast Wave r3 (13019) — digit false-positive: Capture Spirit allowlist uses creature entry 13019. Cite:
// Spell.cpp:7918 GetEntry() != 13019 (not a Blast Wave case).
export const BLAST_WAVE_RANK3_SPELL_ID = 13019;

/** Net-o-Matic dummy. Cite: SpellEffects.cpp:469–482. */
export const NET_O_MATIC_SPELL_ID = 13120;
export const NET_O_MATIC_SELF_ROOT_SPELL_ID = 16566;
export const NET_O_MATIC_CHARGE_ROOT_SPELL_ID = 13119;
export const NET_O_MATIC_NORMAL_ROOT_SPELL_ID = 13099;

/** Gnomish Mind Control Cap dummy. Cite: SpellEffects.cpp:484–495. */
export const GNOMISH_MIND_CONTROL_CAP_SPELL_ID = 13180;
export const GNOMISH_MIND_CONTROL_TRIGGER_SPELL_ID = 13181;

// Defensive State (DND) — CMaNGOS case is commented empty (creature-internal). Cite:
// UnitAuraProcHandler.cpp:1272 // case 13358: break;
export const DEFENSIVE_STATE_DND_13358_SPELL_ID = 13358;

// The Dummy Trigger intermediate for Persistent Shield: the proc handler rewrites it to the absorb
// spell, and the dummy effect runs only when triggered by it. Cite: UnitAuraProcHandler.cpp:1307-1313.
export const DUMMY_TRIGGER_SPELL_ID = 13567;
export const PERSISTENT_SHIELD_HOLDER_SPELL_ID = 26467;
export const PERSISTENT_SHIELD_ABSORB_SPELL_ID = 26470;

// Ruthlessness / Seal Fate *triggered* ADD_COMBO_POINTS spells — deferred until after finisher clears CP
// (AddTriggeredSpell). Cite: UnitAuraProcHandler.cpp:1510–1519.
export const RUTHLESSNESS_TRIGGER_SPELL_ID = 14157;
export const SEAL_FATE_TRIGGER_SPELL_ID = 14189;

// Raptor Strike ranks 3–7 — digit false-positives: Dispel Drakonids 23484 switches on NPC_BLUE_DRAKONID…
// entries 14261–14265, not Raptor Strike spell cases. Cite: SpellEffects.cpp:1062–1077 case 23484.
export const RAPTOR_STRIKE_RANK3_SPELL_ID = 14261;
export const RAPTOR_STRIKE_RANK4_SPELL_ID = 14262;
export const RAPTOR_STRIKE_RANK5_SPELL_ID = 14263;
export const RAPTOR_STRIKE_RANK6_SPELL_ID = 14264;
export const RAPTOR_STRIKE_RANK7_SPELL_ID = 14265;
/** Opening Chest / Safe — CMSG_OPEN_ITEM defines. */
export const OPEN_CHEST_SPELL_ID = 11437;
export const OPEN_SAFE_SPELL_ID = 11535;
/** Frostbolt (Six Demon Bag outcome). Cite: SpellEffects.cpp:530 case 14537. */
export const SIX_DEMON_BAG_FROSTBOLT_SPELL_ID = 11538;
export const SIX_DEMON_BAG_SPELL_ID = 14537;
export const SIX_DEMON_BAG_FIREBALL_SPELL_ID = 15662;
export const SIX_DEMON_BAG_CHAIN_LIGHTNING_SPELL_ID = 21179;
export const SIX_DEMON_BAG_ENVELOPING_WINDS_SPELL_ID = 25189;
export const SIX_DEMON_BAG_FELHOUND_SPELL_ID = 14642;
export const SIX_DEMON_BAG_POLYMORPH_SPELL_ID = 14621;

// ── Stage s15 — Dimension C batch (14302…18765) ─────────────────────────────

// Immolation Trap r5 — digit false-positive: NPC_CHROMATIC_DRAKONID in Dispel Drakonids. Cite:
// SpellEffects.cpp:1062–1077 case 23484 case 14302 ForcedDespawn.
export const IMMOLATION_TRAP_RANK_14302_SPELL_ID = 14302;
// Summon Enraged Wyvern — digit false-positive: NPC_BLACK_SPAWNER in Spawn Drakonid. Cite:
// SpellEffects.cpp:843–856 case 22659 case 14307 → 22654.
export const SUMMON_ENRAGED_WYVERN_SPELL_ID = 14307;
/** Skull Crack — digit false-positive: NPC_YAUJ_BROOD in Despawn Brood. Cite: SpellEffects.cpp:1126–1131. */
export const SKULL_CRACK_SPELL_ID = 15621;
// Ancestral Fortitude r2 — digit false-positive: creature entry 16236 in Submerge Visual. Cite:
// SpellAuras.cpp:1520–1525 case 28819 GetEntry()==16236.
export const ANCESTRAL_FORTITUDE_RANK2_SPELL_ID = 16236;

/** Holy Nova damage ranks → AddTriggeredSpell heal companions. Cite: Spell.cpp:3130–3136. */
export const HOLY_NOVA_RANK1_SPELL_ID = 15237;
export const HOLY_NOVA_RANK2_SPELL_ID = 15430;
export const HOLY_NOVA_RANK3_SPELL_ID = 15431;
export const HOLY_NOVA_RANK4_SPELL_ID = 27799;
export const HOLY_NOVA_RANK5_SPELL_ID = 27800;
export const HOLY_NOVA_RANK6_SPELL_ID = 27801;
/** Holy Nova heal payloads. Cite: Spell.cpp:3130–3136 AddTriggeredSpell. */
export const HOLY_NOVA_HEAL_RANK1_SPELL_ID = 23455;
export const HOLY_NOVA_HEAL_RANK2_SPELL_ID = 23458;
export const HOLY_NOVA_HEAL_RANK3_SPELL_ID = 23459;
export const HOLY_NOVA_HEAL_RANK4_SPELL_ID = 27803;
export const HOLY_NOVA_HEAL_RANK5_SPELL_ID = 27804;
export const HOLY_NOVA_HEAL_RANK6_SPELL_ID = 27805;

// Capture Worg Pup — EffectDummy ForcedDespawn on creature (quest capture). Cite: SpellEffects.cpp:545–550.
export const CAPTURE_WORG_PUP_SPELL_ID = 15998;
// Defensive State (DND) 16092 — CMaNGOS case is commented empty. Cite: UnitAuraProcHandler.cpp:1273 // case
// 16092: break;
export const DEFENSIVE_STATE_DND_16092_SPELL_ID = 16092;
/** Mana Tide totem aura — CastCustomSpell with amount on periodic. Cite: SpellAuras.cpp:1207–1210. */
export const MANA_TIDE_SPELL_ID = 16191;

// The shaman Flurry haste ranks the talent parents trigger: main target only, never during extra
// attacks, three charges. Cite: UnitAuraProcHandler.cpp:749-762.
export const FLURRY_SHAMAN_RANK1_SPELL_ID = 16257;
export const FLURRY_SHAMAN_RANK2_SPELL_ID = 16277;
export const FLURRY_SHAMAN_RANK3_SPELL_ID = 16278;
export const FLURRY_SHAMAN_RANK4_SPELL_ID = 16279;
export const FLURRY_SHAMAN_RANK5_SPELL_ID = 16280;

// Temperature Reading — quest 974 thermometer texts by GO guid (world/RP). Cite: SpellEffects.cpp:558–604.
export const TEMPERATURE_READING_SPELL_ID = 16378;
/** Noggenfogger Elixir dummy → random 16595/16593/16591. Cite: SpellEffects.cpp:606–614. */
export const VOODOO_SPELL_ID = 17009;
export const VOODOO_OUTCOMES = [16707, 16708, 16709, 16711, 16712, 16713, 16716] as const;

export const NOGGENFOGGER_ELIXIR_SPELL_ID = 16589;
export const NOGGENFOGGER_OUTCOMES = [16595, 16593, 16591] as const;
// Leader of the Pack talent (dummy). On form apply, CastSpell(24932) if known. Cite:
// SpellAuras.cpp:4306–4311 HandleShapeshiftBoosts.
export const LEADER_OF_THE_PACK_SPELL_ID = 17007;
// Leader of the Pack party crit aura. bp2+1=3% crit; Stances 145 = cat|bear|dire. Cite: spell_template
// 24932; SpellAuras.cpp:4307–4311.
export const LEADER_OF_THE_PACK_AURA_SPELL_ID = 24932;
/** Sourced crit % from 24932 EffectBasePoints+1. Cite: spell_template 24932 bp2. */
export const LEADER_OF_THE_PACK_CRIT_PCT = 3;
/** Shapeshift form ids for Stances=145 (bit0 cat, bit4 bear, bit7 dire). */
export const LEADER_OF_THE_PACK_FORMS = Object.freeze([1, 5, 8] as const);

/** Test Fetid Skull — quest random create item 17269/17270. Cite: SpellEffects.cpp:642–648. */
export const TEST_FETID_SKULL_SPELL_ID = 17271;
export const CREATE_RESONATING_SKULL_SPELL_ID = 17269;
export const CREATE_BONE_DUST_SPELL_ID = 17270;
// Piccolo of the Flaming Fire — SCRIPT_EFFECT dance emote on player (RP). Cite: SpellEffects.cpp:3729–3736.
export const PICCOLO_OF_THE_FLAMING_FIRE_SPELL_ID = 17512;
// Wolfshead Helm Energy — dummy CastSpell(29940) energize 20 energy. Cite: SpellEffects.cpp:661–665;
// spell_template 29940 Effect 30 bp19 → 20 energy.
export const WOLFSHEAD_HELM_ENERGY_SPELL_ID = 17770;
export const WOLFSHEAD_HELM_ENERGY_TRIGGER_SPELL_ID = 29940;
/** Energize amount from 29940 (bp+1). Cite: spell_template 29940 EffectBasePoints1=19. */
export const WOLFSHEAD_HELM_ENERGY_AMOUNT = 20;

// Pyroclasm talent ranks — Hellfire/RoF tick → chance stun 18093. chance = base / tick (Hellfire 15 ticks,
// Rain of Fire 4). Cite: UnitAuraProcHandler.cpp:1347–1375.
export const PYROCLASM_RANK1_SPELL_ID = 18096;
export const PYROCLASM_RANK2_SPELL_ID = 18073;
/** Pyroclasm stun payload. DurationIndex 27 → 3000 ms. Cite: spell_template 18093. */
export const PYROCLASM_STUN_SPELL_ID = 18093;
export const PYROCLASM_STUN_DURATION_MS = 3000;
/** Base chance numerators. Cite: UnitAuraProcHandler.cpp:1368–1369. */
export const PYROCLASM_RANK1_BASE_CHANCE = 13;
export const PYROCLASM_RANK2_BASE_CHANCE = 26;
/** Hellfire SpellFamilyFlags bit. Cite: UnitAuraProcHandler.cpp:1356 0x40. */
export const PYROCLASM_HELLFIRE_FAMILY_FLAG = 0x40;
/** Rain of Fire SpellFamilyFlags bit. Cite: UnitAuraProcHandler.cpp:1359 0x20. */
export const PYROCLASM_RAIN_OF_FIRE_FAMILY_FLAG = 0x20;
export const PYROCLASM_HELLFIRE_TICKS = 15;
export const PYROCLASM_RAIN_OF_FIRE_TICKS = 4;

// Sweeping Strikes player talent + NPC rank (Zul'Gurub Zealot Zath). Cite: UnitAuraProcHandler.cpp:810–841
// cases 12292/18765; spell_template ProcCharges=5 DurIndex 18.
export const SWEEPING_STRIKES_PLAYER_SPELL_ID = 12292;
export const SWEEPING_STRIKES_NPC_SPELL_ID = 18765;
/** Trigger: school damage with basepoints = damage dealt. Cite: UnitAuraProcHandler.cpp:839–840. */
export const SWEEPING_STRIKES_COPY_DAMAGE_SPELL_ID = 12723;
/** Trigger: normalized weapon damage (WW / Execute above 20%). Cite: UnitAuraProcHandler.cpp:824–831. */
export const SWEEPING_STRIKES_NORMALIZED_SPELL_ID = 26654;
/** Whirlwind — SS always uses 26654. Cite: UnitAuraProcHandler.cpp:824–825. */
export const WHIRLWIND_SPELL_ID = 1680;
/** GetAPMultiplier normalized speeds. Cite: Unit.cpp:10513–10536. */
export const NORMALIZED_WEAPON_SPEED_DAGGER_SEC = 1.7;
export const NORMALIZED_WEAPON_SPEED_1H_SEC = 2.4;
export const NORMALIZED_WEAPON_SPEED_2H_SEC = 3.3;
/** ITEM_SUBCLASS_WEAPON_DAGGER. Cite: SharedDefines / ItemPrototype. */
export const ITEM_SUBCLASS_WEAPON_DAGGER = 15;
/** Execute ranks that carry TargetAuraState HEALTHLESS_20. Cite: spell_template 5308 chain. */
export const EXECUTE_SPELL_IDS: ReadonlySet<number> = new Set([
  5308, 20647, 20658, 20660, 20661, 20662,
]);

export function isSweepingStrikesAuraSpell(spellId: number): boolean {
  return spellId === SWEEPING_STRIKES_PLAYER_SPELL_ID || spellId === SWEEPING_STRIKES_NPC_SPELL_ID;
}

/** Normalized att_speed seconds for SS 26654 / GetAPMultiplier. Cite: Unit.cpp:10513–10536. */
export function normalizedMeleeSpeedSec(opts: {
  twoHand?: boolean;
  weaponSubclass?: number;
}): number {
  if (opts.twoHand) return NORMALIZED_WEAPON_SPEED_2H_SEC;
  if (opts.weaponSubclass === ITEM_SUBCLASS_WEAPON_DAGGER) return NORMALIZED_WEAPON_SPEED_DAGGER_SEC;
  return NORMALIZED_WEAPON_SPEED_1H_SEC;
}

// True → SS trigger 26654 (normalized weapon); false → 12723 (copy damage). WW always normalized. Execute:
// copy if *cleave target* is ≤20% HP, else normalized. Cite: UnitAuraProcHandler.cpp:822–837.
export function sweepingStrikesUsesNormalized(
  proccingSpellId: number | undefined,
  cleaveTargetHpFrac: number,
): boolean {
  if (proccingSpellId === WHIRLWIND_SPELL_ID) return true;
  if (proccingSpellId != null && EXECUTE_SPELL_IDS.has(proccingSpellId)) {
    return cleaveTargetHpFrac > 0.2;
  }
  return false;
}

// ── Stage s16 — Dimension C batch (18813…22564) ─────────────────────────────

/** Knock Away (scripted threat reduction family). Cite: SpellEffects.cpp:3695–3727. */
export const KNOCK_AWAY_18813_SPELL_ID = 18813;
export const KNOCK_AWAY_18945_SPELL_ID = 18945;
export const KNOCK_AWAY_10101_SPELL_ID = 10101;
export const KNOCK_AWAY_18103_SPELL_ID = 18103;
export const KNOCK_AWAY_18670_SPELL_ID = 18670;
export const KNOCK_AWAY_19633_SPELL_ID = 19633;
export const KNOCK_AWAY_20686_SPELL_ID = 20686;
export const KNOCK_AWAY_22920_SPELL_ID = 22920;
export const KNOCK_AWAY_23382_SPELL_ID = 23382;
export const KNOCK_AWAY_25778_SPELL_ID = 25778;
export const KNOCK_AWAY_30013_SPELL_ID = 30013;
export const KNOCK_AWAY_30121_SPELL_ID = 30121;
/** Default scripted threat reduction. Cite: SpellEffects.cpp:3711–3712 pct = -50. */
export const KNOCK_AWAY_DEFAULT_THREAT_PCT = -50;
/** Cite: SpellEffects.cpp:3716–3718 cases 19633/25778. */
export const KNOCK_AWAY_MILD_THREAT_PCT = -25;
/** Cite: SpellEffects.cpp:3720–3723 cases 18103/22920/10101. */
export const KNOCK_AWAY_FULL_THREAT_PCT = -100;

/** Double Attack creature passives. Cite: SpellMgr.h:580–592 IsSpellRemovedOnEvade. */
export const DOUBLE_ATTACK_18943_SPELL_ID = 18943;
export const DOUBLE_ATTACK_19194_SPELL_ID = 19194;
export const DOUBLE_ATTACK_19817_SPELL_ID = 19817;
export const DOUBLE_ATTACK_19818_SPELL_ID = 19818;
/** Extra-attack payload. Cite: spell_template 18941 Effect 19. */
export const DOUBLE_ATTACK_EXTRA_ATTACKS_SPELL_ID = 18941;

// Entrapment talent ranks (Frost Trap pulse → root 19185). Cite: SpellEffects.cpp:685–698 case 18350 /
// 13810; ClassicDB ProcChance 5/10/15.
export const ENTRAPMENT_RANK1_SPELL_ID = 19184;
export const ENTRAPMENT_RANK2_SPELL_ID = 19387;
export const ENTRAPMENT_RANK3_SPELL_ID = 19388;
/** Root payload. Cite: SpellEffects.cpp:698 CastSpell(…, 19185); DurIndex 28 → 5s. */
export const ENTRAPMENT_ROOT_SPELL_ID = 19185;
/** Frost Trap Aura that pulses Dummy Trigger 18350. Cite: SpellEffects.cpp:683 case 13810. */
export const FROST_TRAP_AURA_FOR_ENTRAPMENT_SPELL_ID = 13810;
/** Rank scan order (max rank first). Cite: SpellEffects.cpp:689. */
export const ENTRAPMENT_RANK_SCAN_ORDER = Object.freeze([
  ENTRAPMENT_RANK3_SPELL_ID,
  ENTRAPMENT_RANK2_SPELL_ID,
  ENTRAPMENT_RANK1_SPELL_ID,
] as const);
/** Sourced ProcChance. Cite: ClassicDB spell_template 19184/19387/19388 ProcChance. */
export const ENTRAPMENT_PROC_CHANCE: Readonly<Record<number, number>> = Object.freeze({
  [ENTRAPMENT_RANK1_SPELL_ID]: 5,
  [ENTRAPMENT_RANK2_SPELL_ID]: 10,
  [ENTRAPMENT_RANK3_SPELL_ID]: 15,
});
/** Root duration. Cite: spell_template 19185 DurationIndex 28 → FALLBACK_DURATION_MS[28]=5000. */
export const ENTRAPMENT_ROOT_DURATION_MS = 5000;

/** Lava Bomb (Geddon). Cite: SpellEffects.cpp:737–742. */
export const LAVA_BOMB_SPELL_ID = 19411;
/** Summon Lava Bomb 1. Cite: SpellEffects.cpp:740 CastSpell(…, 20494). */
export const LAVA_BOMB_SUMMON_SPELL_ID = 20494;
export const LAVA_BOMB_20474_SPELL_ID = 20474;
export const LAVA_BOMB_SUMMON_2_SPELL_ID = 20495;

// Improved Lay on Hands — proc retargets to pVictim. Cite: UnitAuraProcHandler.cpp:1504–1507 case 20233.
export const IMPROVED_LAY_ON_HANDS_SPELL_ID = 20233;

/** Seal of Righteousness ranks → melee proc damage carriers. Cite: UnitAuraProcHandler.cpp:1103–1111. */
export const SEAL_OF_RIGHTEOUSNESS_RANK1_SPELL_ID = 20154;
export const SEAL_OF_RIGHTEOUSNESS_RANK1_5_SPELL_ID = 21084;
export const SEAL_OF_RIGHTEOUSNESS_RANK2_SPELL_ID = 20287;
export const SEAL_OF_RIGHTEOUSNESS_RANK3_SPELL_ID = 20288;
export const SEAL_OF_RIGHTEOUSNESS_RANK4_SPELL_ID = 20289;
export const SEAL_OF_RIGHTEOUSNESS_RANK5_SPELL_ID = 20290;
export const SEAL_OF_RIGHTEOUSNESS_RANK6_SPELL_ID = 20291;
export const SEAL_OF_RIGHTEOUSNESS_RANK7_SPELL_ID = 20292;
export const SEAL_OF_RIGHTEOUSNESS_RANK8_SPELL_ID = 20293;
export const SEAL_OF_RIGHTEOUSNESS_PROC_DAMAGE: Readonly<Record<number, number>> = Object.freeze({
  [SEAL_OF_RIGHTEOUSNESS_RANK1_SPELL_ID]: 25742,
  [SEAL_OF_RIGHTEOUSNESS_RANK1_5_SPELL_ID]: 25741,
  [SEAL_OF_RIGHTEOUSNESS_RANK2_SPELL_ID]: 25740,
  [SEAL_OF_RIGHTEOUSNESS_RANK3_SPELL_ID]: 25739,
  [SEAL_OF_RIGHTEOUSNESS_RANK4_SPELL_ID]: 25738,
  [SEAL_OF_RIGHTEOUSNESS_RANK5_SPELL_ID]: 25737,
  [SEAL_OF_RIGHTEOUSNESS_RANK6_SPELL_ID]: 25736,
  [SEAL_OF_RIGHTEOUSNESS_RANK7_SPELL_ID]: 25735,
  [SEAL_OF_RIGHTEOUSNESS_RANK8_SPELL_ID]: 25713,
});

// Tamed Pet Passive (DND) — comment-only example for unused SPELL_AURA_PET_DAMAGE_MULTI. Cite:
// SpellAuras.cpp:218.
export const TAMED_PET_PASSIVE_SPELL_ID = 20782;

/** Warrior's Wrath (Nefarian warrior class call). Cite: SpellEffects.cpp:1319–1324. */
export const WARRIORS_WRATH_SPELL_ID = 21977;
export const WARRIORS_WRATH_MOD_SPELL_ID = 21887;
/** Aura 107 bp-51 → −50. Cite: ClassicDB 21887 EffectBasePoints1. */
export const WARRIORS_WRATH_MOD_AMOUNT = -50;
/** DurationIndex 1 → 10s. Cite: FALLBACK_DURATION_MS[1]. */
export const WARRIORS_WRATH_MOD_DURATION_MS = 10_000;

/** Shadow Flame (Onyxia). Cite: SpellEffects.cpp:3738–3761. */
export const SHADOW_FLAME_SPELL_ID = 22539;
export const SHADOW_FLAME_DOT_SPELL_ID = 22682;
export const ONYXIA_SCALE_CLOAK_SPELL_ID = 22683;
/** DoT: bp1749 → 1750/tick, amp 1000, DurIndex 1 → 10s. Cite: ClassicDB 22682. */
export const SHADOW_FLAME_DOT_AMOUNT = 1750;
export const SHADOW_FLAME_DOT_TICK_MS = 1000;
export const SHADOW_FLAME_DOT_DURATION_MS = 10_000;

/** AV Recall trinkets. Cite: SpellMgr.cpp:2313–2319. */
export const RECALL_22563_SPELL_ID = 22563;
export const RECALL_22564_SPELL_ID = 22564;
export const RECALL_ALTERAC_VALLEY_MAP_ID = 30;
export const BATTLEGROUND_STATUS_WAIT_JOIN = 0;

// ── Stage s17 — Dimension C batch (22588…23887) ─────────────────────────────

// 10% speed bonus — Deadly Swiftness (31255) payload when victim < 20% health. Cite:
// UnitAuraProcHandler.cpp:1293–1301 case 31255 → trigger_spell_id = 22588.
export const DEADLY_SWIFTNESS_SPELL_ID = 31255;
export const SPEED_BONUS_10_PCT_SPELL_ID = 22588;
/** bp9+1 → 10%. Cite: ClassicDB 22588 EffectBasePoints1=9. */
export const SPEED_BONUS_10_PCT = 10;
/** Victim health fraction gate: > max/5 fails. Cite: UnitAuraProcHandler.cpp:1296. */
export const DEADLY_SWIFTNESS_HEALTH_FRAC = 0.2;

// Spawn Drakonid — BWL spawner creature entry → summon spell. Creature-only. Cite: SpellEffects.cpp:842–856
// case 22659.
export const SPAWN_DRAKONID_SPELL_ID = 22659;
export const SPAWN_DRAKONID_BY_ENTRY: Readonly<Record<number, number>> = Object.freeze({
  14312: 22658, // Blue
  14310: 22656, // Green
  14311: 22657, // Bronze
  14309: 22655, // Red
  14307: 22654, // Black
});

/** Crystal Prison Dummy DND — quest capture ForcedDespawn + 23022. Cite: SpellEffects.cpp:868–880. */
export const CRYSTAL_PRISON_DUMMY_SPELL_ID = 23019;
export const CRYSTAL_PRISON_CONJURE_SPELL_ID = 23022;

// Engineering dragonling / battle chicken item dummies → summon payloads. Cite: SpellEffects.cpp:882–908.
export const ARCANITE_DRAGONLING_SPELL_ID = 23074;
export const MITHRIL_MECHANICAL_DRAGONLING_SPELL_ID = 23075;
export const MECHANICAL_DRAGONLING_SPELL_ID = 23076;
export const GNOMISH_BATTLE_CHICKEN_SPELL_ID = 23133;
export const ARCANITE_DRAGONLING_SUMMON_SPELL_ID = 19804;
export const MITHRIL_MECHANICAL_DRAGONLING_SUMMON_SPELL_ID = 12749;
export const MECHANICAL_DRAGONLING_SUMMON_SPELL_ID = 4073;
export const BATTLE_CHICKEN_SUMMON_SPELL_ID = 13166;

/** Goblin Bomb item spell. Cite: item_scripts.cpp:209-224 case 23134. */
export const GOBLIN_BOMB_SPELL_ID = 23134;
export const MALFUNCTION_EXPLOSION_SPELL_ID = 13261;
export const SUMMON_GOBLIN_BOMB_SPELL_ID = 13258;

// Taming Lesson — CheckTargetCreatureType clears beast mask (same as Dismiss Pet 2641). Cite:
// Spell.cpp:6913–6915.
export const TAMING_LESSON_SPELL_ID = 23356;
export const DISMISS_PET_SPELL_ID = 2641;

// Gnomish Transporter (Ultrasafe Gadgetzan): urand(0,5) ? 23441 success : 23446 fail. 5/6 success, 1/6
// malfunction. Cite: SpellEffects.cpp:1041–1046.
export const GNOMISH_TRANSPORTER_SPELL_ID = 23453;
export const GADGETZAN_TRANSPORTER_SUCCESS_SPELL_ID = 23441;
export const GADGETZAN_TRANSPORTER_FAILURE_SPELL_ID = 23446;

// Everlook Transporter (Dimensional Ripper): urand(0,5) ? 23450 arrival : 23449 malfunction.
// Cite: de8f72993b9e1faa1bf92dd5505f3daec5cea3ce item_scripts.cpp:316-323 OnSuccessfulFinish 23442
export const EVERLOOK_TRANSPORTER_SPELL_ID = 23442;
export const EVERLOOK_TRANSPORTER_MALFUNCTION_SPELL_ID = 23449;

// Transporter Arrival (Gadgetzan + Everlook): urand(0,5). 0 -> 23444, 1-2 -> 23445. Cite: SpellEffects.cpp:1031-1040 case 23450.
export const TRANSPORTER_ARRIVAL_SPELL_ID = 23450;
export const TRANSPORTER_ARRIVAL_POLYMORPH_SPELL_ID = 23444;
export const TRANSPORTER_ARRIVAL_EVIL_TWIN_SPELL_ID = 23445;

// Mana Surge (Earthfury set) — HandleDummyAuraProc: manaCost * 35/100 → 23571. Cite:
// UnitAuraProcHandler.cpp:1482–1489 case 23572.
export const MANA_SURGE_SPELL_ID = 23572;
export const MANA_SURGE_ENERGIZE_SPELL_ID = 23571;
/** Percent of triggering spell mana cost restored. Cite: UnitAuraProcHandler.cpp:1487. */
export const MANA_SURGE_MANA_COST_PCT = 35;

/** Hourglass Sand — removes Brood Affliction: Bronze 23170. Cite: SpellEffects.cpp:1048–1052 case 23645. */
export const HOURGLASS_SAND_SPELL_ID = 23645;
export const BROOD_AFFLICTION_BRONZE_SPELL_ID = 23170;

// Temperature Reading false positives: the digits match Pattern rows, but the C++ cases are thermometer
// gameobject guids, not pattern learn rules. Cite: SpellEffects.cpp:563-595.
export const PATTERN_DAWN_TREADERS_SPELL_ID = 23712;
export const PATTERN_TIMBERMAW_BRAWLERS_SPELL_ID = 23713;
export const PATTERN_GOLDEN_MANTLE_DAWN_SPELL_ID = 23714;
export const PATTERN_LAVA_BELT_SPELL_ID = 23715;
export const PATTERN_CHROMATIC_GAUNTLETS_SPELL_ID = 23716;

// Gift of Life (BWL warrior trinket): basepoints = maxHealth * 0.15 → 23782 + 23783. Cite:
// SpellEffects.cpp:1054–1060 case 23725.
export const GIFT_OF_LIFE_SPELL_ID = 23725;
export const GIFT_OF_LIFE_MAX_HEALTH_SPELL_ID = 23782;
export const GIFT_OF_LIFE_HEAL_SPELL_ID = 23783;
/** Fraction of max health for both heal and max-health buff. Cite: SpellEffects.cpp:1056. */
export const GIFT_OF_LIFE_MAX_HEALTH_FRAC = 0.15;
/** 23782 DurationIndex 18 → 20s. Cite: ClassicDB 23782; FALLBACK_DURATION_MS[18]=20000. */
export const GIFT_OF_LIFE_MAX_HEALTH_DURATION_MS = 20_000;

/** Jubling Cooldown SCRIPT_EFFECT → CastSpell(23852). Cite: SpellEffects.cpp:3763–3766. */
export const JUBLING_COOLDOWN_SPELL_ID = 23853;
export const JUBLING_COOLDOWN_TRIGGER_SPELL_ID = 23852;

// Bloodthirst self-heal auras applied after EffectSchoolDMG. Cite: Spell.cpp:1299–1314 cases 23881→23885,
// 23892→23886, 23893→23887.
export const BLOODTHIRST_RANK1_SPELL_ID = 23881;
export const BLOODTHIRST_RANK2_SPELL_ID = 23892;
export const BLOODTHIRST_RANK3_SPELL_ID = 23893;
export const BLOODTHIRST_RANK4_SPELL_ID = 23894;
export const BLOODTHIRST_AURA_RANK1_SPELL_ID = 23885;
export const BLOODTHIRST_AURA_RANK2_SPELL_ID = 23886;
export const BLOODTHIRST_AURA_RANK3_SPELL_ID = 23887;
export const BLOODTHIRST_AURA_RANK4_SPELL_ID = 23888;
/** Heal payloads from aura 42 triggers. Cite: ClassicDB 23880/23889/23890 bp+1. */
export const BLOODTHIRST_HEAL_RANK1_SPELL_ID = 23880;
export const BLOODTHIRST_HEAL_RANK2_SPELL_ID = 23889;
export const BLOODTHIRST_HEAL_RANK3_SPELL_ID = 23890;
export const BLOODTHIRST_HEAL_RANK4_SPELL_ID = 23891;
/** Aura duration/charges. Cite: ClassicDB 23885 DurationIndex 31→8s, ProcCharges 5. */
export const BLOODTHIRST_AURA_DURATION_MS = 8000;
export const BLOODTHIRST_AURA_CHARGES = 5;
/** Heal amounts (bp+1). Cite: ClassicDB 23880/23889/23890 EffectBasePoints1. */
export const BLOODTHIRST_HEAL_AMOUNTS: Readonly<Record<number, number>> = Object.freeze({
  [BLOODTHIRST_HEAL_RANK1_SPELL_ID]: 10,
  [BLOODTHIRST_HEAL_RANK2_SPELL_ID]: 13,
  [BLOODTHIRST_HEAL_RANK3_SPELL_ID]: 17,
  [BLOODTHIRST_HEAL_RANK4_SPELL_ID]: 20,
});

// Shadow Portal (Scholomance) outcomes. Cite: SpellEffects.cpp:667-676 spell_list[urand(0, 5)].
export const SHADOW_PORTAL_SPELL_ID = 17950;
export const SHADOW_PORTAL_OUTCOMES = [17863, 17939, 17943, 17944, 17946, 17948] as const;

export function pickShadowPortalOutcome(roll01: number): number {
  const i = Math.min(5, Math.floor(roll01 * 6));
  return SHADOW_PORTAL_OUTCOMES[i]!;
}

// Deviate Fish outcomes. Cite: SpellEffects.cpp:369–377.
export const DEVIATE_FISH_OUTCOMES = [8064, 8065, 8066, 8067, 8068] as const;
// Cooked Deviate: Flip Out ninja / Yaaarrrr pirate by gender.
// Cite: SpellEffects.cpp:380–386.
export const COOKED_DEVIATE_NINJA_MALE = 8219;
export const COOKED_DEVIATE_NINJA_FEMALE = 8220;
export const COOKED_DEVIATE_PIRATE_MALE = 8221;
export const COOKED_DEVIATE_PIRATE_FEMALE = 8222;
// Universal Remote outcomes. Cite: SpellEffects.cpp:389–397.
export const UNIVERSAL_REMOTE_OUTCOMES = [8345, 8346, 8347] as const;
// Bending Shinbone. Cite: SpellEffects.cpp:3680–3694.
export const BENDING_SHINBONE_RARE_SPELL_ID = 8854;
export const BENDING_SHINBONE_COMMON_SPELL_ID = 8855;

/** Capture Spirit allowed creature entries. Cite: Spell.cpp:7914–7920. */
export const CAPTURE_SPIRIT_ALLOWED_ENTRIES = Object.freeze([
  4663, 4664, 4665, 4666, 4667, 4668, 4705, 13019,
]);

// Cited dispositions for Dimension-C ids that are pure world or quest utility, or false-positive digit
// hits in the Spells sources. Every entry requires a file:line citation — silence is a failure.
export const STAGE_CPP_DISPOSITIONS = Object.freeze({
  [BANISH_EXILE_BURNING_SPELL_ID]: {
    id: BANISH_EXILE_BURNING_SPELL_ID,
    name: 'Banish Exile',
    reason: 'CheckCast creature entry allowlist, script target cast 3617.',
    cite: 'item_scripts.cpp:114-141 case 4130 BanishExile',
  },
  [BANISH_EXILE_CRESTING_SPELL_ID]: {
    id: BANISH_EXILE_CRESTING_SPELL_ID,
    name: 'Banish Exile',
    reason: 'CheckCast creature entry allowlist, script target cast 3617.',
    cite: 'item_scripts.cpp:114-141 case 4131 BanishExile',
  },
  [BANISH_EXILE_THUNDERING_SPELL_ID]: {
    id: BANISH_EXILE_THUNDERING_SPELL_ID,
    name: 'Banish Exile',
    reason: 'CheckCast creature entry allowlist, script target cast 3617.',
    cite: 'item_scripts.cpp:114-141 case 4132 BanishExile',
  },
  [OPEN_BOOTY_CHEST_SPELL_ID]: {
    id: OPEN_BOOTY_CHEST_SPELL_ID,
    name: 'Opening Booty Chest',
    reason:
      'CMSG_OPEN_ITEM path define only - locked-item open bookkeeping, not a combat cast rule',
    cite: 'SpellHandler.cpp:156–160 #define OPEN_BOOTY_CHEST 5107 (with OPEN_CHEST/OPEN_SAFE)',
  },
  [OPEN_CHEST_SPELL_ID]: {
    id: OPEN_CHEST_SPELL_ID,
    name: 'Opening Chest',
    reason: 'CMSG_OPEN_ITEM path define only - inventory open spell id, not combat',
    cite: 'SpellHandler.cpp:156 #define OPEN_CHEST 11437',
  },
  [OPEN_SAFE_SPELL_ID]: {
    id: OPEN_SAFE_SPELL_ID,
    name: 'Opening Safe',
    reason: 'CMSG_OPEN_ITEM path define only - inventory open spell id, not combat',
    cite: 'SpellHandler.cpp:157 #define OPEN_SAFE 11535',
  },
  [LIGHTNING_BLAST_SPELL_ID]: {
    id: LIGHTNING_BLAST_SPELL_ID,
    name: 'Lightning Blast',
    reason:
      'No Spells/*.cpp special-case for spell 8598 - digit false-positive inside coordinate ' +
      'literal −240.8598; generic SCHOOL_DAMAGE materializes',
    cite: 'SpellEffects.cpp:577 (Z: -240.8598 comment/coordinate; not a spell-id case)',
  },
  [MOONFIRE_8924_SPELL_ID]: {
    id: MOONFIRE_8924_SPELL_ID,
    name: 'Moonfire',
    reason:
      'No Spells/*.cpp special-case for spell 8924 - digit false-positive in AshbringerSounds[] ' +
      'sound-id array; generic Moonfire DoT+direct materializes',
    cite: 'SpellEffects.cpp:1253 AshbringerSounds[12] includes 8924 (sound, not spell case)',
  },
  [SUMMON_BROWN_SNAKE_SPELL_ID]: {
    id: SUMMON_BROWN_SNAKE_SPELL_ID,
    name: 'Summon Brown Snake',
    reason:
      'No Spells/*.cpp special-case for spell 10716 - digit false-positive as ItemID:10716 on ' +
      'Gnomish Shrink Ray 13006; SUMMON_OBJECT_WILD/companion is generic',
    cite: 'SpellEffects.cpp:447 case 13006 // Gnomish Shrink Ray (ItemID: 10716)',
  },
  [THAUMATURGY_CHANNEL_SPELL_ID]: {
    id: THAUMATURGY_CHANNEL_SPELL_ID,
    name: 'Thaumaturgy Channel',
    reason:
      'Quest channel: zero-trigger CastSpell(21029 CREATE_ITEM 7867) - not combat effects[]',
    cite: 'SpellAuras.cpp:971–974; census SPELL_AURA_SLOT_DISPOSITIONS 9712:23',
  },
  [CREATE_FILLED_CONTAINMENT_COFFER_SPELL_ID]: {
    id: CREATE_FILLED_CONTAINMENT_COFFER_SPELL_ID,
    name: 'Create Filled Containment Coffer',
    reason:
      'Quest utility: Attract Rift Spawn 9012 casts 9010 when target has aura 9032 - world/quest, ' +
      'not a player combat payload',
    cite: 'SpellEffects.cpp:409–416 case 9012 CastSpell(…, 9010); Spell.cpp:7985–7988 case 9082',
  },
  [CREATE_CONTAINMENT_COFFER_SPELL_ID]: {
    id: CREATE_CONTAINMENT_COFFER_SPELL_ID,
    name: 'Create Containment Coffer',
    reason:
      'Quest utility: OnCheckTarget requires aura 9032 (rift spawn stun) - world/quest gate',
    cite: 'Spell.cpp:7985–7988 case 9082 HasAura(9032)',
  },
  [MORTAL_STRIKE_CREATURE_AURA_SPELL_ID]: {
    id: MORTAL_STRIKE_CREATURE_AURA_SPELL_ID,
    name: 'Mortal Strike',
    reason:
      'Creature-only aura-23 retarget: SelectAttackingTarget(TOPAGGRO) when unit is Creature; ' +
      'player cast has no body. Combat surface is trigger 24573 via generic aura-23.',
    cite: 'SpellAuras.cpp:1161–1171 case 9347 TYPEID_UNIT SelectAttackingTarget TOPAGGRO',
  },
  // ── Stage s14 dispositions (false-positive digits / empty C++ stubs) ──────
  [BLAST_WAVE_RANK3_SPELL_ID]: {
    id: BLAST_WAVE_RANK3_SPELL_ID,
    name: 'Blast Wave',
    reason:
      'No Spells/*.cpp special-case for spell 13019 - digit is Capture Spirit creature-entry ' +
      'allowlist (GetEntry() != 13019); Blast Wave is generic SCHOOL_DAMAGE + snare',
    cite: 'Spell.cpp:7914–7920 case 7914 Capture Spirit entry list includes 13019',
  },
  [DEFENSIVE_STATE_DND_13358_SPELL_ID]: {
    id: DEFENSIVE_STATE_DND_13358_SPELL_ID,
    name: 'Defensive State (DND)',
    reason:
      'Creature-internal PROC_TRIGGER_SPELL holder; CMaNGOS HandleProcTriggerSpell case is ' +
      'commented empty (no combat body). Same disposition family as 5301/16092/24949',
    cite: 'UnitAuraProcHandler.cpp:1272 // case 13358: break; // Defensive State (DND)',
  },
  [DUMMY_TRIGGER_SPELL_ID]: {
    id: DUMMY_TRIGGER_SPELL_ID,
    name: 'Dummy Trigger',
    reason:
      'Intermediate DUMMY for Persistent Shield: HandleDummyAuraProc rewrites 26467 → CastCustomSpell ' +
      '26470 at 15% of heal; EffectDummy 13567 only when triggeredByAuraSpell==26467. No standalone combat cast',
    cite:
      'UnitAuraProcHandler.cpp:1307–1313 case 26467 → 26470; SpellEffects.cpp:504–520 case 13567',
  },
  [RAPTOR_STRIKE_RANK3_SPELL_ID]: {
    id: RAPTOR_STRIKE_RANK3_SPELL_ID,
    name: 'Raptor Strike',
    reason:
      'No Spells/*.cpp special-case for Raptor Strike 14261 - digit is NPC_BLUE_DRAKONID in ' +
      'Dispel Drakonids 23484 ForcedDespawn switch; Raptor Strike is generic on-next-swing weapon damage',
    cite: 'SpellEffects.cpp:1062–1077 case 23484 case 14261–14265 ForcedDespawn',
  },
  [RAPTOR_STRIKE_RANK4_SPELL_ID]: {
    id: RAPTOR_STRIKE_RANK4_SPELL_ID,
    name: 'Raptor Strike',
    reason:
      'No Spells/*.cpp special-case for Raptor Strike 14262 - NPC_GREEN_DRAKONID in Dispel Drakonids',
    cite: 'SpellEffects.cpp:1062–1077 case 23484 case 14262',
  },
  [RAPTOR_STRIKE_RANK5_SPELL_ID]: {
    id: RAPTOR_STRIKE_RANK5_SPELL_ID,
    name: 'Raptor Strike',
    reason:
      'No Spells/*.cpp special-case for Raptor Strike 14263 - NPC_BRONZE_DRAKONID in Dispel Drakonids',
    cite: 'SpellEffects.cpp:1062–1077 case 23484 case 14263',
  },
  [RAPTOR_STRIKE_RANK6_SPELL_ID]: {
    id: RAPTOR_STRIKE_RANK6_SPELL_ID,
    name: 'Raptor Strike',
    reason:
      'No Spells/*.cpp special-case for Raptor Strike 14264 - NPC_RED_DRAKONID in Dispel Drakonids',
    cite: 'SpellEffects.cpp:1062–1077 case 23484 case 14264',
  },
  [RAPTOR_STRIKE_RANK7_SPELL_ID]: {
    id: RAPTOR_STRIKE_RANK7_SPELL_ID,
    name: 'Raptor Strike',
    reason:
      'No Spells/*.cpp special-case for Raptor Strike 14265 - NPC_BLACK_DRAKONID in Dispel Drakonids',
    cite: 'SpellEffects.cpp:1062–1077 case 23484 case 14265',
  },
  // ── Stage s15 dispositions (false-positive digits / world-quest / empty stubs) ──
  [IMMOLATION_TRAP_RANK_14302_SPELL_ID]: {
    id: IMMOLATION_TRAP_RANK_14302_SPELL_ID,
    name: 'Immolation Trap',
    reason:
      'No Spells/*.cpp special-case for Immolation Trap 14302 - digit is NPC_CHROMATIC_DRAKONID ' +
      'in Dispel Drakonids 23484 ForcedDespawn; trap DoT is generic GO arm path',
    cite: 'SpellEffects.cpp:1062–1077 case 23484 case 14302 ForcedDespawn',
  },
  [SUMMON_ENRAGED_WYVERN_SPELL_ID]: {
    id: SUMMON_ENRAGED_WYVERN_SPELL_ID,
    name: 'Summon Enraged Wyvern',
    reason:
      'No Spells/*.cpp special-case for spell 14307 - digit is NPC_BLACK_SPAWNER in Spawn Drakonid ' +
      '22659 (caster entry → summon spell); not a player combat rule',
    cite: 'SpellEffects.cpp:843–856 case 22659 case 14307 spellSummonDrakonid=22654',
  },
  [SKULL_CRACK_SPELL_ID]: {
    id: SKULL_CRACK_SPELL_ID,
    name: 'Skull Crack',
    reason:
      'No Spells/*.cpp special-case for Skull Crack 15621 - digit is NPC_YAUJ_BROOD in Despawn Brood ' +
      '25792 ForcedDespawn; stun is generic Effect 58',
    cite: 'SpellEffects.cpp:1126–1131 case 25792 GetEntry()==15621 ForcedDespawn',
  },
  [ANCESTRAL_FORTITUDE_RANK2_SPELL_ID]: {
    id: ANCESTRAL_FORTITUDE_RANK2_SPELL_ID,
    name: 'Ancestral Fortitude',
    reason:
      'No Spells/*.cpp special-case for Ancestral Fortitude 16236 - digit is creature entry in ' +
      'Submerge Visual 28819 ForcedDespawn; armor_pct materializes generically from aura 101',
    cite: 'SpellAuras.cpp:1520–1525 case 28819 GetEntry()==16236 ForcedDespawn(700)',
  },
  [DEFENSIVE_STATE_DND_16092_SPELL_ID]: {
    id: DEFENSIVE_STATE_DND_16092_SPELL_ID,
    name: 'Defensive State (DND)',
    reason:
      'Creature-internal PROC_TRIGGER_SPELL holder; CMaNGOS HandleProcTriggerSpell case is ' +
      'commented empty (no combat body). Same family as 5301/13358/24949',
    cite: 'UnitAuraProcHandler.cpp:1273 // case 16092: break; // Defensive State (DND)',
  },
  [CAPTURE_WORG_PUP_SPELL_ID]: {
    id: CAPTURE_WORG_PUP_SPELL_ID,
    name: 'Capture Worg Pup',
    reason:
      'Quest capture: EffectDummy ForcedDespawn on creature target + CREATE_ITEM companion - ' +
      'world/quest utility, not a combat payload',
    cite: 'SpellEffects.cpp:545–550 case 15998 ForcedDespawn; Effect 24 CREATE_ITEM co-slot',
  },
  [TEMPERATURE_READING_SPELL_ID]: {
    id: TEMPERATURE_READING_SPELL_ID,
    name: 'Temperature Reading',
    reason:
      'Quest 974 thermometer: DoScriptText by GO guid + optional RewardPlayerAndGroupAtEventCredit ' +
      '- pure world/quest RP, no combat',
    cite: 'SpellEffects.cpp:558–604 case 16378 textIds + RewardPlayerAndGroupAtEventCredit',
  },
  [TEST_FETID_SKULL_SPELL_ID]: {
    id: TEST_FETID_SKULL_SPELL_ID,
    name: 'Test Fetid Skull',
    reason:
      'Quest utility: urand → Create Resonating Skull 17269 or Create Bone Dust 17270 (CREATE_ITEM) ' +
      '- not a combat cast',
    cite: 'SpellEffects.cpp:642–648 case 17271 CastSpell(17269|17270)',
  },
  [PICCOLO_OF_THE_FLAMING_FIRE_SPELL_ID]: {
    id: PICCOLO_OF_THE_FLAMING_FIRE_SPELL_ID,
    name: 'Piccolo of the Flaming Fire',
    reason:
      'RP toy: SCRIPT_EFFECT HandleEmoteCommand(EMOTE_STATE_DANCE) on player target - no combat',
    cite: 'SpellEffects.cpp:3729–3736 case 17512 HandleEmoteCommand(EMOTE_STATE_DANCE)',
  },
  // ── Stage s16 dispositions (evade-persist stubs / unused aura / BG area gate) ──
  [DOUBLE_ATTACK_18943_SPELL_ID]: {
    id: DOUBLE_ATTACK_18943_SPELL_ID,
    name: 'Double Attack',
    reason:
      'Creature PROC_TRIGGER_SPELL passive (→ 18941 extra attacks). CMaNGOS lists it only in ' +
      'IsSpellRemovedOnEvade (return false - survives evade) and a commented-empty HandleProcTriggerSpell ' +
      'case; no custom combat rewrite. Generic aura-42 materializes.',
    cite:
      'SpellMgr.h:580 case 18943 IsSpellRemovedOnEvade return false; UnitAuraProcHandler.cpp:1274 // case 18943: break;',
  },
  [DOUBLE_ATTACK_19194_SPELL_ID]: {
    id: DOUBLE_ATTACK_19194_SPELL_ID,
    name: 'Double Attack',
    reason:
      'Same as 18943: evade-persist creature passive; empty commented proc case; generic pts → 18941',
    cite:
      'SpellMgr.h:584 case 19194; UnitAuraProcHandler.cpp:1275 // case 19194: break;',
  },
  [DOUBLE_ATTACK_19817_SPELL_ID]: {
    id: DOUBLE_ATTACK_19817_SPELL_ID,
    name: 'Double Attack',
    reason:
      'Same as 18943: evade-persist creature passive; empty commented proc case; generic pts → 18941',
    cite:
      'SpellMgr.h:591 case 19817; UnitAuraProcHandler.cpp:1276 // case 19817: break;',
  },
  [DOUBLE_ATTACK_19818_SPELL_ID]: {
    id: DOUBLE_ATTACK_19818_SPELL_ID,
    name: 'Double Attack',
    reason:
      'Same as 18943: evade-persist creature passive; empty commented proc case; generic pts → 18941',
    cite:
      'SpellMgr.h:592 case 19818; UnitAuraProcHandler.cpp:1277 // case 19818: break;',
  },
  [TAMED_PET_PASSIVE_SPELL_ID]: {
    id: TAMED_PET_PASSIVE_SPELL_ID,
    name: 'Tamed Pet Passive (DND)',
    reason:
      'No Spells/*.cpp special-case body - id appears only as a comment example for unused ' +
      'SPELL_AURA_PET_DAMAGE_MULTI (157) HandleUnused; not a player combat rule',
    cite: 'SpellAuras.cpp:218 // 157 SPELL_AURA_PET_DAMAGE_MULTI (single test like spell 20782…)',
  },
  [RECALL_22563_SPELL_ID]: {
    id: RECALL_22563_SPELL_ID,
    name: 'Recall',
    reason:
      'AV trinket CheckCast only: map_id==30 and BG status != STATUS_WAIT_JOIN; TELEPORT_UNITS ' +
      'payload is generic. Pure battleground area gate - not a combat damage/CC rule',
    cite: 'SpellMgr.cpp:2313–2319 case 22563/22564 map_id==30 bg->GetStatus()!=STATUS_WAIT_JOIN',
  },
  [RECALL_22564_SPELL_ID]: {
    id: RECALL_22564_SPELL_ID,
    name: 'Recall',
    reason:
      'AV trinket CheckCast only (same switch as 22563); world/BG utility, not combat payload',
    cite: 'SpellMgr.cpp:2313–2319 case 22564/22563',
  },
  // ── Stage s17 dispositions (creature/quest/false-positive / companion CD) ──
  [SPAWN_DRAKONID_SPELL_ID]: {
    id: SPAWN_DRAKONID_SPELL_ID,
    name: 'Spawn Drakonid',
    reason:
      'BWL Nefarian phase-1 spawner only: caster creature entry → color summon spell; ' +
      'not a player combat cast rule',
    cite: 'SpellEffects.cpp:842–856 case 22659 switch GetEntry() → spellSummonDrakonid',
  },
  [CRYSTAL_PRISON_DUMMY_SPELL_ID]: {
    id: CRYSTAL_PRISON_DUMMY_SPELL_ID,
    name: 'Crystal Prison Dummy DND',
    reason:
      'Quest/world capture: living non-pet creature CastSpell(23022) + ForcedDespawn - ' +
      'not a player combat payload',
    cite: 'SpellEffects.cpp:868–880 case 23019 CastSpell(23022) ForcedDespawn',
  },
  [PATTERN_DAWN_TREADERS_SPELL_ID]: {
    id: PATTERN_DAWN_TREADERS_SPELL_ID,
    name: 'Pattern: Dawn Treaders',
    reason:
      'No Spells/*.cpp special-case for Pattern 23712 - digit is Temperature Reading GO guid ' +
      'GetGUIDLow()==23712; pattern learn is generic LEARN_SPELL bookkeeping',
    cite: 'SpellEffects.cpp:563–569 case 16378 case 23712 // Z: -241.0724 DoScriptText',
  },
  [PATTERN_TIMBERMAW_BRAWLERS_SPELL_ID]: {
    id: PATTERN_TIMBERMAW_BRAWLERS_SPELL_ID,
    name: 'Pattern: Timbermaw Brawlers',
    reason:
      'No Spells/*.cpp special-case for Pattern 23713 - Temperature Reading GO guid false-positive',
    cite: 'SpellEffects.cpp:571–575 case 16378 case 23713 // Z: -265.2025',
  },
  [PATTERN_GOLDEN_MANTLE_DAWN_SPELL_ID]: {
    id: PATTERN_GOLDEN_MANTLE_DAWN_SPELL_ID,
    name: 'Pattern: Golden Mantle of the Dawn',
    reason:
      'No Spells/*.cpp special-case for Pattern 23714 - Temperature Reading GO guid false-positive',
    cite: 'SpellEffects.cpp:577–581 case 16378 case 23714 // Z: -240.8598',
  },
  [PATTERN_LAVA_BELT_SPELL_ID]: {
    id: PATTERN_LAVA_BELT_SPELL_ID,
    name: 'Pattern: Lava Belt',
    reason:
      'No Spells/*.cpp special-case for Pattern 23715 - Temperature Reading GO guid false-positive',
    cite: 'SpellEffects.cpp:583–587 case 16378 case 23715 // Z: -246.8467',
  },
  [PATTERN_CHROMATIC_GAUNTLETS_SPELL_ID]: {
    id: PATTERN_CHROMATIC_GAUNTLETS_SPELL_ID,
    name: 'Pattern: Chromatic Gauntlets',
    reason:
      'No Spells/*.cpp special-case for Pattern 23716 - Temperature Reading GO guid + quest credit',
    cite: 'SpellEffects.cpp:589–595 case 16378 case 23716 // Z: -186.0754 quest completion',
  },
  [JUBLING_COOLDOWN_SPELL_ID]: {
    id: JUBLING_COOLDOWN_SPELL_ID,
    name: 'Jubling Cooldown',
    reason:
      'Companion pet CD bookkeeping: SCRIPT_EFFECT CastSpell(23852) on unitTarget - no combat damage/CC',
    cite: 'SpellEffects.cpp:3763–3766 case 23853 CastSpell(…, 23852)',
  },
} as const);

// ── Pure rule helpers (sourced numbers only) ────────────────────────────────

// Curse of Idiocy re-trigger gate. Stop when both intellect and spirit accumulated loss from spell 1010 are
// ≤ −90. Amounts are signed (debuffs negative). Cite: SpellAuras.cpp:1185–1203.
export function curseOfIdiocyShouldRetrigger(intellectLoss: number, spiritLoss: number): boolean {
  return !(intellectLoss <= -90 && spiritLoss <= -90);
}

// Sum int/spirit loss from live 1010 buff rows and decide whether aura-23 may re-fire. Cite:
// SpellAuras.cpp:1185–1203.
export function curseOfIdiocyMayRetriggerFromBuffs(
  buffs: ReadonlyArray<{ kind?: string; spellId?: number; target?: string; mod?: string; amount?: number }>,
  targetSide: string,
): boolean {
  let intLoss = 0;
  let spiLoss = 0;
  for (const ae of buffs) {
    if (ae.kind !== 'buff' || ae.spellId !== CURSE_OF_IDIOCY_SPELL_ID || ae.target !== targetSide) continue;
    if (ae.mod === 'intellect') intLoss += ae.amount ?? 0;
    if (ae.mod === 'spirit') spiLoss += ae.amount ?? 0;
  }
  return curseOfIdiocyShouldRetrigger(intLoss, spiLoss);
}

/** Banish Exile target entry check. Cite: item_scripts.cpp:121-125. */
export function banishExileAllowsTarget(spellId: number, targetEntry: number): boolean {
  switch (spellId | 0) {
    case BANISH_EXILE_BURNING_SPELL_ID:
      return (targetEntry | 0) === BANISH_EXILE_BURNING_ENTRY;
    case BANISH_EXILE_CRESTING_SPELL_ID:
      return (targetEntry | 0) === BANISH_EXILE_CRESTING_ENTRY;
    case BANISH_EXILE_THUNDERING_SPELL_ID:
      return (targetEntry | 0) === BANISH_EXILE_THUNDERING_ENTRY;
    default:
      return true;
  }
}

/** Capture Spirit CheckCast allowlist. Cite: Spell.cpp:7914–7920. */
export function captureSpiritAllowsEntry(entry: number): boolean {
  return CAPTURE_SPIRIT_ALLOWED_ENTRIES.includes(entry | 0);
}

/** MOD_STAT stack exemption (Echeyakee's Grace / Songflower). Cite: SpellStacking.cpp:251–254. */
export function modStatStacksWithEverything(spellId: number): boolean {
  const id = spellId | 0;
  return id === ECHEYAKEE_GRACE_SPELL_ID || id === SONGFLOWER_SERENADE_SPELL_ID;
}

// Improved Mend Pet: the script id rolls its own chance and casts 24406.
// Cite: UnitAuraProcHandler.cpp:1615-1623 roll_chance_i(triggerAmount).
function improvedMendPetProc(
  scriptId: number,
  amount: number,
  roll01: number,
): { fired: boolean; triggerSpellId: number } {
  if (scriptId !== IMPROVED_MEND_PET_SCRIPT_RANK1 && scriptId !== IMPROVED_MEND_PET_SCRIPT_RANK2) {
    return { fired: false, triggerSpellId: 0 };
  }
  // roll_chance_i(amount): integer percent. Cite: Util.h roll_chance_i.
  const fired = roll01 * 100 < (amount | 0);
  return { fired, triggerSpellId: fired ? IMPROVED_MEND_PET_TRIGGER_SPELL_ID : 0 };
}

// Eye for an Eye reflect amount. basepoints = triggerAmount * (damage+absorb) / 100, capped at maxHealth/2.
// Magic damage class only (caller gates). Cite: UnitAuraProcHandler.cpp:795–808.
export function eyeForAnEyeReflectAmount(
  triggerPct: number,
  damagePlusAbsorb: number,
  maxHealth: number,
): number {
  let bp = Math.trunc(((triggerPct | 0) * Math.trunc(damagePlusAbsorb)) / 100);
  const cap = Math.trunc(maxHealth / 2);
  if (bp > cap) bp = cap;
  return Math.max(0, bp);
}

// Sourced Eye for an Eye rank → reflect % (EffectBasePoints+1). Cite: spell_template 9799 bp14 → 15; 25988
// bp29 → 30; amount.ts effectAmountRange.
export const EYE_FOR_AN_EYE_PCT: Readonly<Record<number, number>> = Object.freeze({
  [EYE_FOR_AN_EYE_RANK1_SPELL_ID]: 15,
  [EYE_FOR_AN_EYE_RANK2_SPELL_ID]: 30,
});

// Ignite basepoints for DoT 12654 from rank id × damage. Cite: UnitAuraProcHandler.cpp:978–982
// (0.04/0.08/0.12/0.16/0.20 * damage).
export function igniteBasepoints(rankSpellId: number, damage: number): number {
  const dmg = Math.trunc(damage);
  switch (rankSpellId | 0) {
    case IGNITE_RANK1_SPELL_ID:
      return Math.trunc(0.04 * dmg);
    case IGNITE_RANK2_SPELL_ID:
      return Math.trunc(0.08 * dmg);
    case IGNITE_RANK3_SPELL_ID:
      return Math.trunc(0.12 * dmg);
    case IGNITE_RANK4_SPELL_ID:
      return Math.trunc(0.16 * dmg);
    case IGNITE_RANK5_SPELL_ID:
      return Math.trunc(0.2 * dmg);
    default:
      return 0;
  }
}

/** True when spell id is an Ignite talent rank. */
function isIgniteRank(spellId: number): boolean {
  const id = spellId | 0;
  return (
    id === IGNITE_RANK1_SPELL_ID
    || id === IGNITE_RANK2_SPELL_ID
    || id === IGNITE_RANK3_SPELL_ID
    || id === IGNITE_RANK4_SPELL_ID
    || id === IGNITE_RANK5_SPELL_ID
  );
}

// Deep Wounds: per-tick basepoints for DoT 12721. total = weaponDamage × rank% (0.2/0.4/0.6); tick = total
// / 6. Cite: UnitAuraProcHandler.cpp:1329–1341.
export function deepWoundsTickBasepoints(rankSpellId: number, weaponDamage: number): number {
  const wd = Math.trunc(weaponDamage);
  let total = 0;
  switch (rankSpellId | 0) {
    case DEEP_WOUNDS_RANK1_SPELL_ID:
      total = Math.trunc(wd * 0.2);
      break;
    case DEEP_WOUNDS_RANK2_SPELL_ID:
      total = Math.trunc(wd * 0.4);
      break;
    case DEEP_WOUNDS_RANK3_SPELL_ID:
      total = Math.trunc(wd * 0.6);
      break;
    default:
      return 0;
  }
  return Math.trunc(total / 6);
}

/** True when spell id is a Deep Wounds talent rank. */
function isDeepWoundsRank(spellId: number): boolean {
  const id = spellId | 0;
  return (
    id === DEEP_WOUNDS_RANK1_SPELL_ID
    || id === DEEP_WOUNDS_RANK2_SPELL_ID
    || id === DEEP_WOUNDS_RANK3_SPELL_ID
  );
}

// Average weapon damage used by Deep Wounds (C++ unit field min/max mean). Cite:
// UnitAuraProcHandler.cpp:1322–1325 (MINDAMAGE+MAXDAMAGE)/2.
export function deepWoundsAverageWeaponDamage(dmgMin: number, dmgMax: number): number {
  return (Number(dmgMin) + Number(dmgMax)) / 2;
}

// The Flurry haste charge gate: false when the swing is not on the unit's main target, or while extra
// attacks are executing. Cite: UnitAuraProcHandler.cpp:760-761.
export function flurryMayConsumeCharge(opts: {
  victimIsMainTarget: boolean;
  extraAttacksExecuting: boolean;
}): boolean {
  if (!opts.victimIsMainTarget) return false;
  if (opts.extraAttacksExecuting) return false;
  return true;
}

/** True when spell id is a Warrior Flurry *triggered* haste rank (12966–12970). */
export function isWarriorFlurryHasteRank(spellId: number): boolean {
  const id = spellId | 0;
  return (
    id === FLURRY_WARRIOR_RANK1_SPELL_ID
    || id === FLURRY_WARRIOR_RANK2_SPELL_ID
    || id === FLURRY_WARRIOR_RANK3_SPELL_ID
    || id === FLURRY_WARRIOR_RANK4_SPELL_ID
    || id === FLURRY_WARRIOR_RANK5_SPELL_ID
  );
}

// Warrior + Shaman Flurry *triggered* haste ranks. Same HandleHasteAuraProc gate (main target, no extra
// attacks). Cite: UnitAuraProcHandler.cpp:749–762 cases 12966–12970 and 16257/16277–16280.
export function isFlurryHasteRank(spellId: number): boolean {
  return isWarriorFlurryHasteRank(spellId) || isShamanFlurryHasteRank(spellId);
}

/** True when spell id is a Shaman Flurry *triggered* haste rank (16257/16277–16280). */
export function isShamanFlurryHasteRank(spellId: number): boolean {
  const id = spellId | 0;
  return (
    id === FLURRY_SHAMAN_RANK1_SPELL_ID
    || id === FLURRY_SHAMAN_RANK2_SPELL_ID
    || id === FLURRY_SHAMAN_RANK3_SPELL_ID
    || id === FLURRY_SHAMAN_RANK4_SPELL_ID
    || id === FLURRY_SHAMAN_RANK5_SPELL_ID
  );
}

// The Shrink Ray roll table over 0 to 99, naming the spell and whether it lands on self or the unit.
// Cite: SpellEffects.cpp:451-464.
export function pickShrinkRayOutcome(roll0to99: number): { spellId: number; target: 'self' | 'unit' } {
  const r = roll0to99 | 0;
  if (r < 3) return { spellId: SHRINK_RAY_GROW_SPELL_ID, target: 'self' }; // party grow
  if (r < 6) return { spellId: SHRINK_RAY_PARTY_SHRINK_SPELL_ID, target: 'self' };
  if (r < 9) return { spellId: SHRINK_RAY_GROW_SPELL_ID, target: 'unit' };
  if (r < 12) return { spellId: SHRINK_RAY_PARTY_SHRINK_SPELL_ID, target: 'unit' };
  if (r < 24) return { spellId: SHRINK_RAY_TARGET_SHRINK_SPELL_ID, target: 'self' };
  return { spellId: SHRINK_RAY_TARGET_SHRINK_SPELL_ID, target: 'unit' };
}

/** Net-o-Matic roll table (urand 0..99). Cite: SpellEffects.cpp:473–479. */
export function pickNetOMaticOutcome(roll0to99: number): number {
  const r = roll0to99 | 0;
  if (r < 2) return NET_O_MATIC_SELF_ROOT_SPELL_ID;
  if (r < 4) return NET_O_MATIC_CHARGE_ROOT_SPELL_ID;
  return NET_O_MATIC_NORMAL_ROOT_SPELL_ID;
}

// Gnomish Mind Control Cap (urand 0..9). roll==1 && targetIsPlayer → reverse (target casts 13181 on
// caster); roll!=0 → caster casts 13181 on target; roll==0 → no cast. Cite: SpellEffects.cpp:488–492.
export function pickMindControlCapOutcome(
  roll0to9: number,
  targetIsPlayer: boolean,
): { spellId: number; reverse: boolean } | null {
  const r = roll0to9 | 0;
  if (r === 1 && targetIsPlayer) {
    return { spellId: GNOMISH_MIND_CONTROL_TRIGGER_SPELL_ID, reverse: true };
  }
  if (r) return { spellId: GNOMISH_MIND_CONTROL_TRIGGER_SPELL_ID, reverse: false };
  return null;
}

// Goblin Bomb outcome (urand 0..99). roll < 10 → target casts malfunction (13261) on caster;
// else caster casts summon (13258) on self. Cite: item_scripts.cpp:211-216 urand(0, 99).
export function pickGoblinBombOutcome(
  roll0to99: number
): { spellId: number; reverse: boolean } {
  const r = roll0to99 | 0;
  if (r < 10) return { spellId: MALFUNCTION_EXPLOSION_SPELL_ID, reverse: true };
  return { spellId: SUMMON_GOBLIN_BOMB_SPELL_ID, reverse: false };
}

// Seal Fate / Ruthlessness trigger spells grant CP *after* the finisher clears points. Cite:
// UnitAuraProcHandler.cpp:1510–1519 AddTriggeredSpell.
export function isDeferredFinisherComboTrigger(spellId: number): boolean {
  const id = spellId | 0;
  return id === RUTHLESSNESS_TRIGGER_SPELL_ID || id === SEAL_FATE_TRIGGER_SPELL_ID;
}

// Summon Screecher Spirit CheckCast: creature target that has not already been hit by 12699. Cite:
// Spell.cpp:7924–7926.
export function summonScreecherSpiritAllowsTarget(opts: {
  isCreature: boolean;
  alreadyHitBySpell: boolean;
}): boolean {
  if (!opts.isCreature) return false;
  if (opts.alreadyHitBySpell) return false;
  return true;
}

// Deviate Fish: one of five outcomes at equal weight, from a uniform roll.
// Cite: SpellEffects.cpp:373-376 urand(0,4).
export function pickDeviateFishOutcome(roll01: number): number {
  const i = Math.min(4, Math.floor(roll01 * 5));
  return DEVIATE_FISH_OUTCOMES[i]!;
}

// Cooked Deviate Delight: half ninja, half pirate, morphed by gender.
// Cite: SpellEffects.cpp:383-386.
export function pickCookedDeviateOutcome(roll01: number, genderMale: boolean): number {
  const ninja = roll01 < 0.5;
  if (ninja) return genderMale ? COOKED_DEVIATE_NINJA_MALE : COOKED_DEVIATE_NINJA_FEMALE;
  return genderMale ? COOKED_DEVIATE_PIRATE_MALE : COOKED_DEVIATE_PIRATE_FEMALE;
}

/** Universal Remote: equal pick of 8345/8346/8347. Cite: SpellEffects.cpp:394–396 urand(0,2). */
export function pickUniversalRemoteOutcome(roll01: number): number {
  const i = Math.min(2, Math.floor(roll01 * 3));
  return UNIVERSAL_REMOTE_OUTCOMES[i]!;
}

// Bending Shinbone: a roll of 1 gives 8854 and the other four give 8855.
// Cite: SpellEffects.cpp:3685-3691.
export function pickBendingShinboneOutcome(roll15: number): number {
  return (roll15 | 0) === 1 ? BENDING_SHINBONE_RARE_SPELL_ID : BENDING_SHINBONE_COMMON_SPELL_ID;
}

// The Six Demon Bag roll table over 0 to 99, naming the spell and whether it lands on the unit or self.
// Cite: SpellEffects.cpp:522-541.
export function pickSixDemonBagOutcome(roll0to99: number): { spellId: number; target: 'unit' | 'self' } {
  const r = roll0to99 | 0;
  if (r < 25) return { spellId: SIX_DEMON_BAG_FIREBALL_SPELL_ID, target: 'unit' };
  if (r < 50) return { spellId: SIX_DEMON_BAG_FROSTBOLT_SPELL_ID, target: 'unit' };
  if (r < 70) return { spellId: SIX_DEMON_BAG_CHAIN_LIGHTNING_SPELL_ID, target: 'unit' };
  if (r < 85) return { spellId: SIX_DEMON_BAG_ENVELOPING_WINDS_SPELL_ID, target: 'unit' };
  if (r < 90) return { spellId: SIX_DEMON_BAG_FELHOUND_SPELL_ID, target: 'self' };
  if (r < 97) return { spellId: SIX_DEMON_BAG_POLYMORPH_SPELL_ID, target: 'unit' };
  return { spellId: SIX_DEMON_BAG_POLYMORPH_SPELL_ID, target: 'self' };
}

/** Curse of the Eye dummy 3360 → gender transform. Cite: SpellEffects.cpp:358. */
export function curseOfTheEyeTransformSpellId(genderMale: boolean): number {
  return genderMale ? CURSE_OF_THE_EYE_MALE_SPELL_ID : CURSE_OF_THE_EYE_FEMALE_SPELL_ID;
}

// Proc retarget: positive spell on enemy victim (Curse of Mending family). Cite:
// UnitAuraProcHandler.cpp:1502–1507 case 7099 target = pVictim.
function procRetargetsVictim(triggerSpellId: number): boolean {
  const id = triggerSpellId | 0;
  // Cite: UnitAuraProcHandler.cpp:1502–1507 cases 7099 / 29494 / 20233.
  return (
    id === CURSE_OF_MENDING_SPELL_ID
    || id === 29494
    || id === IMPROVED_LAY_ON_HANDS_SPELL_ID
  );
}

/** Forbearance: baked for precast access on MECHANIC_INVULNERABILITY. */
export const FORBEARANCE_SPELL_ID = 25771;

// Stage s17 Dimension-C spell ids (census floor + test gate). Prior-stage ids remain as named constants
// above (still referenced → Dimension C closed).
export const STAGE_SPELL_IDS: readonly number[] = Object.freeze([
  FORBEARANCE_SPELL_ID,
  SPEED_BONUS_10_PCT_SPELL_ID,
  SPAWN_DRAKONID_SPELL_ID,
  ONYXIA_SCALE_CLOAK_SPELL_ID,
  CRYSTAL_PRISON_DUMMY_SPELL_ID,
  ARCANITE_DRAGONLING_SPELL_ID,
  MITHRIL_MECHANICAL_DRAGONLING_SPELL_ID,
  MECHANICAL_DRAGONLING_SPELL_ID,
  GNOMISH_BATTLE_CHICKEN_SPELL_ID,
  GOBLIN_BOMB_SPELL_ID,
  TAMING_LESSON_SPELL_ID,
  GNOMISH_TRANSPORTER_SPELL_ID,
  TRANSPORTER_ARRIVAL_SPELL_ID,
  HOLY_NOVA_HEAL_RANK1_SPELL_ID,
  HOLY_NOVA_HEAL_RANK2_SPELL_ID,
  HOLY_NOVA_HEAL_RANK3_SPELL_ID,
  MANA_SURGE_SPELL_ID,
  HOURGLASS_SAND_SPELL_ID,
  PATTERN_DAWN_TREADERS_SPELL_ID,
  PATTERN_TIMBERMAW_BRAWLERS_SPELL_ID,
  PATTERN_GOLDEN_MANTLE_DAWN_SPELL_ID,
  PATTERN_LAVA_BELT_SPELL_ID,
  PATTERN_CHROMATIC_GAUNTLETS_SPELL_ID,
  GIFT_OF_LIFE_SPELL_ID,
  JUBLING_COOLDOWN_SPELL_ID,
  BLOODTHIRST_AURA_RANK1_SPELL_ID,
  BLOODTHIRST_AURA_RANK2_SPELL_ID,
  BLOODTHIRST_AURA_RANK3_SPELL_ID,
]);

// ── Stage s15 pure helpers ──────────────────────────────────────────────────

/** Holy Nova damage rank → triggered heal spell id. Cite: Spell.cpp:3130–3136 AddTriggeredSpell. */
export function holyNovaTriggeredHealSpellId(damageRankId: number): number {
  switch (damageRankId | 0) {
    case HOLY_NOVA_RANK1_SPELL_ID:
      return HOLY_NOVA_HEAL_RANK1_SPELL_ID;
    case HOLY_NOVA_RANK2_SPELL_ID:
      return HOLY_NOVA_HEAL_RANK2_SPELL_ID;
    case HOLY_NOVA_RANK3_SPELL_ID:
      return HOLY_NOVA_HEAL_RANK3_SPELL_ID;
    case HOLY_NOVA_RANK4_SPELL_ID:
      return HOLY_NOVA_HEAL_RANK4_SPELL_ID;
    case HOLY_NOVA_RANK5_SPELL_ID:
      return HOLY_NOVA_HEAL_RANK5_SPELL_ID;
    case HOLY_NOVA_RANK6_SPELL_ID:
      return HOLY_NOVA_HEAL_RANK6_SPELL_ID;
    default:
      return 0;
  }
}

// Sourced Holy Nova heal min/max from companion bake rows (bp+die). Cite: spell_template 23455 bp51 die9 →
// 52–60; 23458 bp85 die13 → 86–98.
export const HOLY_NOVA_HEAL_AMOUNTS: Readonly<Record<number, { min: number; max: number }>> =
  Object.freeze({
    [HOLY_NOVA_RANK1_SPELL_ID]: { min: 52, max: 60 },
    [HOLY_NOVA_RANK2_SPELL_ID]: { min: 86, max: 98 },
    [HOLY_NOVA_RANK3_SPELL_ID]: { min: 121, max: 139 },
    [HOLY_NOVA_RANK4_SPELL_ID]: { min: 161, max: 187 },
    [HOLY_NOVA_RANK5_SPELL_ID]: { min: 235, max: 271 },
    [HOLY_NOVA_RANK6_SPELL_ID]: { min: 302, max: 350 },
  });

/** Voodoo 17009: equal pick of 7 spells. Cite: SpellEffects.cpp EffectDummy case 17009. */
export function pickVoodooOutcome(roll01: number): number {
  const i = Math.min(6, Math.floor(roll01 * 7));
  return VOODOO_OUTCOMES[i]!;
}

/** Noggenfogger: equal pick of 16595/16593/16591. Cite: SpellEffects.cpp:610–611 spell_list[urand(0,2)]. */
export function pickNoggenfoggerOutcome(roll01: number): number {
  const i = Math.min(2, Math.floor(roll01 * 3));
  return NOGGENFOGGER_OUTCOMES[i]!;
}

/** Test Fetid Skull: 50/50 17269 vs 17270. Cite: SpellEffects.cpp:646 urand(0,1) ? 17269 : 17270. */
export function pickTestFetidSkullOutcome(roll01: number): number {
  return roll01 < 0.5 ? CREATE_RESONATING_SKULL_SPELL_ID : CREATE_BONE_DUST_SPELL_ID;
}

// Pyroclasm per-tick chance percent for a channel tick. chance = baseChance / tickCount (Hellfire 15, RoF
// 4). Cite: UnitAuraProcHandler.cpp:1364–1372.
export function pyroclasmChancePct(rankSpellId: number, tickCount: number): number {
  const ticks = tickCount | 0;
  if (ticks <= 0) return 0;
  let base = 0;
  switch (rankSpellId | 0) {
    case PYROCLASM_RANK1_SPELL_ID:
      base = PYROCLASM_RANK1_BASE_CHANCE;
      break;
    case PYROCLASM_RANK2_SPELL_ID:
      base = PYROCLASM_RANK2_BASE_CHANCE;
      break;
    default:
      return 0;
  }
  return base / ticks;
}

// Hellfire (0x40) or Rain of Fire (0x20) family flag → tick count for Pyroclasm. Returns 0 when the spell
// is not a Pyroclasm channel. Cite: UnitAuraProcHandler.cpp:1355–1362.
export function pyroclasmTickCountForFamilyFlags(spellFamilyFlags: number): number {
  const f = spellFamilyFlags | 0;
  if (f & PYROCLASM_HELLFIRE_FAMILY_FLAG) return PYROCLASM_HELLFIRE_TICKS;
  if (f & PYROCLASM_RAIN_OF_FIRE_FAMILY_FLAG) return PYROCLASM_RAIN_OF_FIRE_TICKS;
  return 0;
}

/** True when spell id is a Pyroclasm talent rank. */
function isPyroclasmRank(spellId: number): boolean {
  const id = spellId | 0;
  return id === PYROCLASM_RANK1_SPELL_ID || id === PYROCLASM_RANK2_SPELL_ID;
}

// Leader of the Pack form gate (Stances=145 → cat/bear/dire). Cite: spell_template 24932 Stances=145;
// SpellAuras.cpp:4307–4311 CanBeUsedInForm.
export function leaderOfThePackAppliesInForm(formId: number): boolean {
  const f = formId | 0;
  return (LEADER_OF_THE_PACK_FORMS as readonly number[]).includes(f);
}

/** Roll Pyroclasm stun: chance% vs roll01*100. Cite: UnitAuraProcHandler.cpp:1372 roll_chance_f(chance). */
export function pyroclasmStunFires(chancePct: number, roll01: number): boolean {
  if (chancePct <= 0) return false;
  return roll01 * 100 < chancePct;
}

// ── Stage s16 pure helpers ──────────────────────────────────────────────────

// Knock Away SCRIPT_EFFECT threat percent for a spell id. Default −50; subset −25 or −100. Cite:
// SpellEffects.cpp:3711–3724.
export function knockAwayScriptThreatPct(spellId: number): number | null {
  const id = spellId | 0;
  switch (id) {
    case KNOCK_AWAY_18813_SPELL_ID:
    case KNOCK_AWAY_18945_SPELL_ID:
    case KNOCK_AWAY_18670_SPELL_ID:
    case KNOCK_AWAY_20686_SPELL_ID:
    case KNOCK_AWAY_23382_SPELL_ID:
    case KNOCK_AWAY_30013_SPELL_ID:
    case KNOCK_AWAY_30121_SPELL_ID:
      return KNOCK_AWAY_DEFAULT_THREAT_PCT;
    case KNOCK_AWAY_19633_SPELL_ID:
    case KNOCK_AWAY_25778_SPELL_ID:
      return KNOCK_AWAY_MILD_THREAT_PCT;
    case KNOCK_AWAY_18103_SPELL_ID:
    case KNOCK_AWAY_22920_SPELL_ID:
    case KNOCK_AWAY_10101_SPELL_ID:
      return KNOCK_AWAY_FULL_THREAT_PCT;
    default:
      return null;
  }
}

/** True when spell is a Double Attack creature passive in the evade-persist list. */
function isDoubleAttackPassive(spellId: number): boolean {
  const id = spellId | 0;
  return (
    id === DOUBLE_ATTACK_18943_SPELL_ID
    || id === DOUBLE_ATTACK_19194_SPELL_ID
    || id === DOUBLE_ATTACK_19817_SPELL_ID
    || id === DOUBLE_ATTACK_19818_SPELL_ID
  );
}

// Entrapment ProcChance for a talent rank id (0 if not a rank). Cite: ClassicDB spell_template ProcChance;
// SpellEffects.cpp:693.
function entrapmentProcChance(talentSpellId: number): number {
  return ENTRAPMENT_PROC_CHANCE[talentSpellId | 0] ?? 0;
}

// Highest-rank Entrapment chance from a set of aura/spell ids on the caster. Scan order matches C++ (max
// rank first). Cite: SpellEffects.cpp:689–695.
export function entrapmentChanceFromAuraIds(auraSpellIds: ReadonlyArray<number>): number {
  const set = new Set(auraSpellIds.map((x) => x | 0));
  for (const id of ENTRAPMENT_RANK_SCAN_ORDER) {
    if (set.has(id)) return ENTRAPMENT_PROC_CHANCE[id]!;
  }
  return 0;
}

// Frost Trap's pulse rolls Entrapment's root: it fires when the uniform roll is below the chance.
// Cite: SpellEffects.cpp:697-698 roll_chance_f.
export function entrapmentRootFires(chancePct: number, roll01: number): boolean {
  if (chancePct <= 0) return false;
  return roll01 * 100 < chancePct;
}

// Seal of Righteousness rank → melee proc SCHOOL_DAMAGE spell id. Cite: UnitAuraProcHandler.cpp:1103–1111.
export function sealOfRighteousnessProcDamageSpellId(sealSpellId: number): number {
  return SEAL_OF_RIGHTEOUSNESS_PROC_DAMAGE[sealSpellId | 0] ?? 0;
}

// Shadow Flame SCRIPT_EFFECT: cast 22682 unless target has Onyxia Scale Cloak dummy. Cite:
// SpellEffects.cpp:3756–3760.
export function shadowFlameAppliesDot(hasOnyxiaScaleCloak: boolean): boolean {
  return !hasOnyxiaScaleCloak;
}

// AV Recall CheckCast. STATUS_WAIT_JOIN = 0 fails; any other live BG status on map 30 OK. Cite:
// SpellMgr.cpp:2313–2319.
function recallCastOk(opts: {
  mapId: number;
  inBattleground: boolean;
  /** BattleGround::GetStatus(); WAIT_JOIN blocks. */
  bgStatus: number;
}): boolean {
  if (!opts.inBattleground) return false;
  if ((opts.mapId | 0) !== RECALL_ALTERAC_VALLEY_MAP_ID) return false;
  if ((opts.bgStatus | 0) === BATTLEGROUND_STATUS_WAIT_JOIN) return false;
  return true;
}

// ── Stage s17 pure helpers ──────────────────────────────────────────────────

// Deadly Swiftness gate: victim must be at or below 20% health. Cite: UnitAuraProcHandler.cpp:1295–1297
// GetHealth() > GetMaxHealth()/5 → fail.
export function deadlySwiftnessVictimEligible(currentHp: number, maxHp: number): boolean {
  const max = maxHp | 0;
  if (max <= 0) return false;
  return (currentHp | 0) <= max * DEADLY_SWIFTNESS_HEALTH_FRAC;
}

// Spawn Drakonid summon spell from spawner creature entry (0 if unknown). Cite: SpellEffects.cpp:846–854.
function spawnDrakonidSummonSpellId(casterEntry: number): number {
  return SPAWN_DRAKONID_BY_ENTRY[casterEntry | 0] ?? 0;
}

// Engineering item dummy → companion summon spell id (0 if not a dragonling dummy). Cite:
// SpellEffects.cpp:882–908.
export function engineeringCompanionSummonSpellId(dummySpellId: number): number {
  switch (dummySpellId | 0) {
    case ARCANITE_DRAGONLING_SPELL_ID:
      return ARCANITE_DRAGONLING_SUMMON_SPELL_ID;
    case MITHRIL_MECHANICAL_DRAGONLING_SPELL_ID:
      return MITHRIL_MECHANICAL_DRAGONLING_SUMMON_SPELL_ID;
    case MECHANICAL_DRAGONLING_SPELL_ID:
      return MECHANICAL_DRAGONLING_SUMMON_SPELL_ID;
    case GNOMISH_BATTLE_CHICKEN_SPELL_ID:
      return BATTLE_CHICKEN_SUMMON_SPELL_ID;
    default:
      return 0;
  }
}

/** Dismiss Pet / Taming Lesson skip TargetCreatureType mask. Cite: Spell.cpp:6913–6915. */
function skipsCreatureTypeTargetCheck(spellId: number): boolean {
  const id = spellId | 0;
  return id === DISMISS_PET_SPELL_ID || id === TAMING_LESSON_SPELL_ID;
}

// Gnomish Transporter outcome: roll integer 0..5; 0 → failure 23446, else success 23441. Cite:
// SpellEffects.cpp:1043–1044 urand(0,5) ? 23441 : 23446.
export function gnomishTransporterOutcomeSpellId(roll0to5: number): number {
  return (roll0to5 | 0) === 0
    ? GADGETZAN_TRANSPORTER_FAILURE_SPELL_ID
    : GADGETZAN_TRANSPORTER_SUCCESS_SPELL_ID;
}

// Everlook Transporter outcome: roll integer 0..5; 0 -> 23449, else 23450. Cite:
// de8f72993b9e1faa1bf92dd5505f3daec5cea3ce item_scripts.cpp:316-323 OnSuccessfulFinish urand(0,5) ? 23450 : 23449.
export function everlookTransporterOutcomeSpellId(roll0to5: number): number {
  return (roll0to5 | 0) === 0
    ? EVERLOOK_TRANSPORTER_MALFUNCTION_SPELL_ID
    : TRANSPORTER_ARRIVAL_SPELL_ID;
}

// Transporter Arrival outcome: roll integer 0..5; 0 -> 23444, 1-2 -> 23445, 3-5 -> undefined. Cite:
// SpellEffects.cpp:1031-1040 case 23450.
export function transporterArrivalOutcomeSpellId(roll0to5: number): number | undefined {
  const r = roll0to5 | 0;
  if (r === 0) return TRANSPORTER_ARRIVAL_POLYMORPH_SPELL_ID;
  if (r <= 2) return TRANSPORTER_ARRIVAL_EVIL_TWIN_SPELL_ID;
  return undefined;
}

// Mana Surge restore amount: floor(manaCost * 35 / 100). Cite: UnitAuraProcHandler.cpp:1487 basepoints[0] =
// spellInfo->manaCost * 35 / 100.
function manaSurgeRestoreAmount(manaCost: number): number {
  return Math.trunc(((manaCost | 0) * MANA_SURGE_MANA_COST_PCT) / 100);
}

// Gift of Life basepoints from caster max health (15%). Cite: SpellEffects.cpp:1056 int32 basepoints =
// m_caster->GetMaxHealth() * 0.15.
export function giftOfLifeBasepoints(maxHealth: number): number {
  return Math.trunc((maxHealth | 0) * GIFT_OF_LIFE_MAX_HEALTH_FRAC);
}

/** Bloodthirst damage rank → self aura id applied after school damage. Cite: Spell.cpp:1303–1308. */
export function bloodthirstSelfAuraSpellId(damageRankId: number): number {
  switch (damageRankId | 0) {
    case BLOODTHIRST_RANK1_SPELL_ID:
      return BLOODTHIRST_AURA_RANK1_SPELL_ID;
    case BLOODTHIRST_RANK2_SPELL_ID:
      return BLOODTHIRST_AURA_RANK2_SPELL_ID;
    case BLOODTHIRST_RANK3_SPELL_ID:
      return BLOODTHIRST_AURA_RANK3_SPELL_ID;
    case BLOODTHIRST_RANK4_SPELL_ID:
      return BLOODTHIRST_AURA_RANK4_SPELL_ID;
    default:
      return 0;
  }
}

// Bloodthirst self-aura → heal payload spell id. Cite: ClassicDB 23885→23880, 23886→23889, 23887→23890,
// 23888→23891.
function bloodthirstHealSpellId(auraSpellId: number): number {
  switch (auraSpellId | 0) {
    case BLOODTHIRST_AURA_RANK1_SPELL_ID:
      return BLOODTHIRST_HEAL_RANK1_SPELL_ID;
    case BLOODTHIRST_AURA_RANK2_SPELL_ID:
      return BLOODTHIRST_HEAL_RANK2_SPELL_ID;
    case BLOODTHIRST_AURA_RANK3_SPELL_ID:
      return BLOODTHIRST_HEAL_RANK3_SPELL_ID;
    case BLOODTHIRST_AURA_RANK4_SPELL_ID:
      return BLOODTHIRST_HEAL_RANK4_SPELL_ID;
    default:
      return 0;
  }
}
export {
  FORGIVENESS_SPELL_ID,
  FORGIVENESS_PERMANENT_FEIGN_DEATH_SPELL_ID,
} from './cmangos-special-cases-s20.ts';

/** Spirit of Redemption talent passive. */
export const SPIRIT_OF_REDEMPTION_TALENT_SPELL_ID = 20711;
/** Spirit of Redemption form aura applied on lethal death. */
export const SPIRIT_OF_REDEMPTION_AURA_SPELL_ID = 27827;
/** Suicide spell cast when Spirit of Redemption expires. */
export const SUICIDE_SPELL_ID = 27965;
