import type {
  BuffMod,
  ConditionDef,
  ControlKind,
  Mechanic,
  PowerType,
  School,
  SealKind,
  ShapeshiftFormId,
  TotemSlot,
} from './primitives.ts';

// What Judgement unleashes per seal: damage seals roll min..max holy; utility and Crusader seals
// apply `debuffSpellId` instead. Cite: Paladin.cpp:78–116 spell_judgement; Spell.sql JoC ranks.
export interface JudgementBurst {
  school: School;
  min: number;
  max: number;
  halveIfNotStunned?: boolean;
  // The judgement damage carrier this burst resolved from (20187 JoR r1, 20467 JoC r1), kept so the
  // combat site can read its effectBonusCoefficient — the burst rolls from the tables here.
  spellId?: number;
  // Bonus-damage coefficient from the carrier's effectBonusCoefficient[slot], filled by
  // buildCombatant; the store-free interpreter path rolls from transcribed tables and has no slot.
  coeff?: number;
  /** JoL/JoW/JoC aura applied to the judged target (e.g. 20185 / 20186 / 20188). */
  debuffSpellId?: number;
  /** Debuff display name (Judgement of Light / Wisdom / Crusader). */
  debuffName?: string;
  /** Debuff duration ms. Classic JoL/JoW/JoC rows bake to 10_000. */
  debuffDurationMs?: number;
  // Heal the striker on a landed melee hit vs the judged target. Sourced: Spell.sql Judgement of Light heal
  // carriers (20267 bp24→25, …).
  onHitHeal?: number;
  // Restore mana to the striker on a landed melee hit vs the judged target. Sourced: Spell.sql Judgement of
  // Wisdom energize carriers (20268 bp32→33, …).
  onHitMana?: number;
  // Flat spell/holy damage taken on the judged target (Judgement of the Crusader), from Spell.sql
  // aura 14 basePoints+dice. Cite: SpellAuras.cpp SPELL_AURA_MOD_DAMAGE_TAKEN.
  spellTaken?: number;
}

// One aura-removal body: `cast` fires `spellId`, `remove_aura` strips it, `heal_full` restores the
// caster. `amount` overrides the payload roll. Cite: SpellAuras.cpp HandleAuraDummy(!apply).
export interface AuraRemoveBody {
  action: 'cast' | 'remove_aura' | 'heal_full';
  spellId?: number;
  mode: 'expire' | 'death' | 'dispel' | 'any';
  amount?: number;
  /** Who casts / is acted on. Defaults: caster → holder (`caster->CastSpell(target, …)`). */
  from?: 'caster' | 'holder';
  to?: 'caster' | 'holder';
}

type SpellEffectBody =
  // `pointsPerComboPoint` (from EffectPointsPerComboPointN) is added per combo point at cast time
  // when the caster has points on the target (CMaNGOS Object.cpp CalculateSpellEffectValue).
  // `hostile: false` = EffectImplicitTargetA is TARGET_UNIT_CASTER (1) and the damage lands on the
  // CASTER — every engineering backfire, Dark Rune, Shadow Bolt Misfire. Cite: SpellTargetDefines.h.
  | { kind: 'direct_damage'; school: School; min: number; max: number; pointsPerComboPoint?: number; hostile?: boolean }
  // Periodic damage. `leechMultiple` (aura 53) also heals the caster for dealt × multiplier;
  // `healthFunnel` (aura 62) reverses it. Cite: SpellAuras.cpp PeriodicTick :4592–4683.
  | {
      kind: 'dot';
      school: School;
      min: number;
      max: number;
      durationMs: number;
      tickMs: number;
      pointsPerComboPoint?: number;
      leechMultiple?: number;
      healthFunnel?: boolean;
      // EffectImplicitTargetA caster/self (TARGET_UNIT_CASTER=1): the aura sits on the caster.
      // false → applySpell routes to src; true/absent → foe. Cite: SpellTargetDefines.h.
      hostile?: boolean;
    }
  // SPELL_EFFECT_PERSISTENT_AREA_AURA (27) + PERIODIC_DAMAGE (aura 3): a session-owned ground pool,
  // not a unit DoT. `radius` absent ⇒ text combat hits the whole hostile side (GAP).
  | { kind: 'persistent_area'; school: School; min: number; max: number; durationMs: number; tickMs: number; radius?: number; pointsPerComboPoint?: number }
  // `applyTo` routes party/friend heals like buffs: 'party' → every living friendly, 'friendly' →
  // lowest-HP ally, 'pet' → pet, omit → single-target triage / self. Cite: healTargets.ts.
  | { kind: 'heal'; min: number; max: number; applyTo?: 'self' | 'pet' | 'friendly' | 'party' }
  // SPELL_EFFECT_INSTAKILL (1). `self` / `selfCast` when EffectImplicitTargetA is caster
  // (Voidwalker Sacrifice kills the pet). Cite: SpellEffects.cpp:205–221.
  | { kind: 'instakill'; self?: boolean; selfCast?: boolean }
  // SPELL_EFFECT_SUMMON_CRITTER (97) mini-pet. Cite: SpellEffects.cpp:5031–5111.
  | { kind: 'summon_critter'; creature: number; durationMs: number; despawnOnly?: boolean }
  // SPELL_AURA_MOD_SCALE (61) cosmetic size %. Cite: SpellAuras.cpp:2182–2185.
  | { kind: 'mod_scale'; pct: number; durationMs: number }
  // Optional mechanic (usually 'root') so mechanic immunity / DR can key the live aura without
  // inventing from kind alone. Cite: SharedDefines MECHANIC_ROOT=7; spell_template.Mechanic.
  | { kind: 'root'; durationMs: number; mechanic?: Mechanic }
  // Crowd control (stun / fear / incapacitate / silence / disarm / root). `mechanic` groups DR and
  // gates type immunity; `breakOnDamage` drops it on the next hit. `pulseMs` is dead — no reader.
  | { kind: 'cc'; control: ControlKind; mechanic: Mechanic; durationMs: number; school: School; breakOnDamage?: boolean; pulseMs?: number; onlyTypes?: number[] }
  // SPELL_EFFECT_INTERRUPT_CAST (68): cancel an interruptible cast and lock out the VICTIM's cast
  // school for `lockoutMs`. Not a global silence. Cite: SpellEffects.cpp EffectInterruptCast.
  | { kind: 'interrupt_cast'; lockoutMs: number }
  // SPELL_EFFECT_TRIGGER_SPELL (64): on a successful hit, cast the triggered spell's effects.
  // Distinct from aura 42 `proc_trigger_spell`. Cite: SpellEffects.cpp EffectTriggerSpell.
  | { kind: 'trigger_spell'; spellId: number }
  | { kind: 'mechanic_immunity_purge'; mechanic: number; mechanicMask: number }
  // SPELL_AURA_ADD_TARGET_TRIGGER (109): self-aura; a later isAffectedOnSpell hit chance-casts
  // EffectTriggerSpell. Cite: SpellAuras.cpp:170; Spell.cpp:7433–7468 ProcSpellAuraTriggers.
  | {
      kind: 'add_target_trigger';
      triggerSpellId: number;
      chancePct: number;
      durationMs: number;
      /** Holder SpellFamilyName. Cite: SpellAuras.cpp:708. */
      familyName?: number;
      /** EffectItemType / spell_affect mask. Cite: SpellMgr.h:1950–1958 GetSpellAffectMask. */
      familyFlags?: number;
    }
  // A permanent per-school magic resistance contribution, summed into `resistances`. hostile:true
  // (or amount < 0) → foe debuff; false/positive → self. Cite: isHostileBuffEffect; KI-765.
  // `pct` is the BASE_PCT form (aura 142 with a magic-school mask — Ossirian's Weaknesses −100).
  // It resolves to a flat amount against the target's own resistance at apply. Cite: SpellAuras.cpp:3425.
  | { kind: 'resist'; school: School; amount: number; hostile?: boolean; pct?: number }
  // A self-cast control-breaker (Will of the Forsaken, Escape Artist): removes the listed controls
  // and with `immuneMs` grants brief immunity. Usable WHILE controlled — that is the point.
  | { kind: 'cleanse'; controls: ControlKind[]; immuneMs?: number }
  // SPELL_EFFECT_DISPEL (38): remove up to `count` auras of `dispelType` (0 → 1 per
  // ProcessDispelList). Cite: SpellEffects.cpp EffectDispel; domain/spells/dispel.ts.
  | { kind: 'dispel'; dispelType: number; count: number }
  // SPELL_EFFECT_DISPEL_MECHANIC (108): remove up to `count` holders with HasMechanic(mechanic),
  // mechanic from EffectMiscValue. Cite: SpellEffects.cpp:2499–2519; SpellAuras.cpp:5786–5794.
  | { kind: 'dispel_mechanic'; mechanic: number; count: number }
  // SPELL_AURA_SPELL_MAGNET (96), Grounding Totem: redirect one MAGIC/NONE single-target spell to
  // the aura caster. durationMs 0 → totem lifetime. Cite: Unit.cpp:6896–6922 SelectMagnetTarget.
  | { kind: 'spell_magnet'; durationMs: number; charges?: number }
  // SPELL_AURA_REFLECT_SPELLS (28) / _SCHOOL (74): reflect incoming harmful magic with `pct`
  // chance; `school` omitted → all schools. Cite: Unit.cpp GetReflectChance ~3425.
  | { kind: 'reflect'; pct: number; school?: School; durationMs: number }
  // SPELL_AURA_FEATHER_FALL (105): Slow Fall self aura. Text game registers the aura so cast is
  // not a pure mana sink; no movement simulation. durationMs from DurationIndex.
  | { kind: 'feather_fall'; durationMs: number }
  // SPELL_EFFECT_REPUTATION (103): grant rep to EffectMiscValue's faction on cast. An effect row,
  // not an intent, because only effects[] reaches the OOC applier. Cite: SpellEffects.cpp:4908–4926.
  | { kind: 'reputation'; factionId: number; amount: number }
  // SPELL_AURA_WATER_BREATHING (82): unlimited breath while the aura is up (interval multiplier 0).
  // Cite: SpellAuras.cpp HandleWaterBreathing :1688; domain/world/hazards.ts.
  | { kind: 'water_breathing'; durationMs: number }
  // SPELL_AURA_WATER_WALK (104): walk on water. Text registers the aura; no surface sim.
  // Cite: SpellAuras.cpp HandleAuraWaterWalk :1661.
  | { kind: 'water_walk'; durationMs: number }
  // SPELL_AURA_HOVER (106): SetHover / MOVEFLAG_HOVER. Cite: SpellAuras.cpp:1681; Object.h:750.
  | { kind: 'hover'; durationMs: number }
  // SPELL_AURA_MOD_INVISIBILITY_DETECTION (19): Detect (Lesser/Greater) Invisibility strength.
  // Text aura chip; world invis visibility residual. Cite: SpellAuras.cpp :2677–2717.
  | { kind: 'mod_invisibility_detection'; amount: number; durationMs: number }
  // Also an interpreter intent, but needed as an effect or the spell reads as a pure mana sink.
  // SPELL_AURA_TRACK_RESOURCES (45): Find Treasure/Minerals/Herbs. Cite: SpellAuras.cpp:2163–2171.
  | { kind: 'track_resources'; resourceType: number; trackFlag: number; durationMs: number }
  // SPELL_AURA_SAFE_FALL (144): Slow Fall height reduction. Cite: Player.cpp:19535–19537.
  | { kind: 'safe_fall'; amount: number; durationMs: number }
  // SPELL_AURA_MOD_UNATTACKABLE (93): Phase Shift (Imp). Cite: SpellAuras.cpp:4454–4459.
  | { kind: 'mod_unattackable'; durationMs: number; combatStopOnApply: true }
  // SPELL_AURA_INTERRUPT_REGEN (94). Cite: SpellAuras.cpp:5111–5119; Player.cpp:2303–2304.
  | { kind: 'interrupt_regen'; durationMs: number; setInDummyCombatState?: boolean }
  // SPELL_AURA_MOD_WATER_BREATHING (155): Undead racial 5227 — multiplier, not the forced-0
  // `water_breathing` above. Cite: SpellAuras.cpp:1701–1706.
  | { kind: 'mod_water_breathing'; amount: number; intervalMultiplier: number; durationMs: number }
  // SPELL_EFFECT_TELEPORT_UNITS (5) with a spell_target_position dest; OOC routes through
  // castTeleport + reagents. Mage Portals (TRANS_DOOR 50) too. Cite: SpellEffects.cpp:1683.
  | { kind: 'teleport' }
  // SPELL_EFFECT_TELEPORT_UNITS with TARGET_LOCATION_CASTER_HOME_BIND (9): Astral Recall /
  // Hearthstone-class homebind. Cite: SpellTargetDefines.h TARGET_LOCATION_CASTER_HOME_BIND = 9.
  | { kind: 'teleport_hearth' }
  // SPELL_EFFECT_BIND (11): SetHomebindToLocation at current position (hearth/home).
  // Cite: SpellEffects.cpp:5544–5578. OOC writes char.hearthBind (same field bindHearth uses).
  | { kind: 'bind_hearth' }
  // SPELL_EFFECT_LEARN_SPELL (36) player path — learnGrantIds / ooc learn().
  // Cite: SpellEffects.cpp:2445–2465 EffectLearnSpell.
  | { kind: 'learn_spell'; spellId: number }
  // SPELL_EFFECT_DUAL_WIELD (40). SetCanDualWield(true). Cite: SpellEffects.cpp:2628–2632.
  | { kind: 'can_dual_wield' }
  // SPELL_EFFECT_SEND_TAXI (123). ActivateTaxiPathTo(misc). Cite: SpellEffects.cpp:5124–5130.
  | { kind: 'send_taxi'; pathId: number }
  // SPELL_EFFECT_SUMMON_PLAYER (85). SetSummonPoint + summon request. Cite: SpellEffects.cpp:4356.
  | { kind: 'summon_player' }
  // EffectEmpty / EffectUnused / HandleUnused — client-inform marker, OOC aura chip.
  // Cite: SpellEffects.cpp:190–203 EffectEmpty/EffectUnused.
  | { kind: 'client_inform' }
  // SPELL_EFFECT_LEARN_PET_SPELL (57): pet->learnSpell(EffectTriggerSpell).
  // Cite: SpellEffects.cpp:3386–3404. OOC writes char.petSpells (same field trainPet uses).
  | { kind: 'learn_pet_spell'; spellId: number }
  // SPELL_EFFECT_ADD_HONOR (45): AddHonorCP(damage, HONORABLE) — amount is effect value.
  // Cite: SpellEffects.cpp:3026–3035. OOC writes char.honor via addBonusHonor.
  | { kind: 'add_honor'; amount: number }
  // SPELL_EFFECT_DESTROY_ALL_TOTEMS (110): UnSummon every totem slot.
  // Cite: SpellEffects.cpp:5202–5207. Combat calls unsummonAllTotems.
  | { kind: 'destroy_all_totems' }
  // SPELL_AURA_NO_PVP_CREDIT (159) — Honorless Target. Victim grants no honor.
  // Cite: SpellAuras.cpp:220; Player.cpp:6626–6627 RewardHonor GetAura(2479).
  | { kind: 'no_pvp_credit'; durationMs: number }
  // SPELL_EFFECT_PULL_TOWARDS (124). KnockBackWithAngle toward caster.
  // Cite: SpellEffects.cpp:5132–5162; combat/knockBack.ts.
  | { kind: 'pull_towards'; speedXY: number; speedZ?: number; distance?: number }
  // SPELL_EFFECT_TELEPORT_GRAVEYARD (120): send the target to its team's nearest graveyard — the BG
  // resurrection payload (24237, spirit guides 13116/13117). Cite: BattleGround.h:85.
  | { kind: 'teleport_graveyard' }
  // SPELL_EFFECT_QUEST_COMPLETE (16): AreaExploredOrEventHappens(EffectMiscValue) — the BG
  // objective credits 23658 / 24061 / 24064 are these. Cite: SpellEffects.cpp:4928-4935.
  | { kind: 'quest_complete'; questId: number }
  // SPELL_EFFECT_PICKPOCKET (71). OOC/stealth humanoid loot path. Cite: SpellEffects.cpp:2662.
  | { kind: 'pickpocket' }
  // SPELL_EFFECT_SKINNING (95). Corpse → game.skin. Cite: SpellEffects.cpp:4970.
  | { kind: 'skinning' }
  // SPELL_EFFECT_DISENCHANT (99). Item-target DE → game.disenchant. Cite: SpellEffects.cpp:4640.
  | { kind: 'disenchant' }
  // SPELL_EFFECT_DISTRACT (69). World attention/threat stub; durationMs = damage * 1000.
  // Cite: SpellEffects.cpp:2640–2660; Common.h IN_MILLISECONDS.
  | { kind: 'distract'; durationMs: number }
  // SPELL_AURA_AURAS_VISIBLE (100) — Detect Magic. Text aura registers detection on target.
  // Cite: SpellAuras.cpp HandleAurasVisible :3383.
  | { kind: 'auras_visible'; durationMs: number }
  // SPELL_AURA_MOD_DETECT_RANGE (91) — Mind Soothe yards (signed). Cite: Unit.cpp GetAttackDistance.
  | { kind: 'mod_detect_range'; amount: number; durationMs: number }
  // SPELL_AURA_BIND_SIGHT (1) — Mind Vision camera channel. Text: aura chip (no multi-session cam).
  // Cite: SpellAuras.cpp HandleBindSight :2126.
  | { kind: 'bind_sight'; durationMs: number }
  // Periodic restore: food/drink OOC, Evocation per tick while channelling. `pctOfMax` (auras 20/21
  // OBS_MOD_HEALTH/MANA) restores floor(max × pct/100) and ignores amountPerTick.
  | {
      kind: 'restore_health';
      amountPerTick: number;
      tickMs: number;
      durationMs: number;
      pctOfMax?: number;
      // TARGET_PET=5 (Health Funnel / Mend Pet). Omit → lowest-HP friendly / self.
      applyTo?: 'self' | 'pet' | 'friendly' | 'party';
    }
  // Periodic power restore/drain. A negative amountPerTick is PERIODIC_MANA_LEECH on the cast
  // target unless `hostile: false` (self maintain cost). Cite: SpellAuras.cpp:1031–1042.
  | {
      kind: 'restore_power';
      amountPerTick: number;
      tickMs: number;
      durationMs: number;
      pctOfMax?: number;
      // Powers index this fills (EffectMiscValue): 0 mana, 1 rage, 2 focus, 3 energy. Absent on an
      // older bake, which the consumer reads as mana. Cite: SpellAuras.cpp:4836.
      powerType?: number;
      /** When false, negative ticks drain the caster (self cost), not the foe. Default: hostile leech. */
      hostile?: boolean;
      // SPELL_AURA_PERIODIC_MANA_LEECH EffectMultipleValue: caster gains drained × this each tick. Drain
      // Mana mv=1 transfers; Viper Sting mv=0 is pure drain. Cite: SpellAuras.cpp:4747–4806.
      leechMultiple?: number;
    }
  // SPELL_EFFECT_POWER_DRAIN (8): drain min..max power (capped at current); the caster gains
  // drained × multiplier as mana. Cite: SpellEffects.cpp EffectPowerDrain.
  | { kind: 'power_drain'; powerType: number; min: number; max: number; multiplier: number }
  // SPELL_EFFECT_POWER_BURN (62): burn min..max power, deal burned × multiplier as school damage.
  // Cite: SpellEffects.cpp EffectPowerBurn.
  | { kind: 'power_burn'; powerType: number; min: number; max: number; multiplier: number; school: School }
  // SPELL_EFFECT_HEALTH_LEECH (9): deal min..max school damage, heal caster damage × multiplier.
  // Cite: SpellEffects.cpp EffectHealthLeech.
  | { kind: 'health_leech'; school: School; min: number; max: number; multiplier: number }
  // SPELL_EFFECT_ENERGIZE (30) for non-rage powers (rage stays on rageGenerated).
  // Cite: SpellEffects.cpp EffectEnergize.
  | { kind: 'energize'; powerType: number; min: number; max: number }
  // Warlock Life Tap (DUMMY SPELLFAMILY_WARLOCK 0x40000): `healthCost` HP paid as power cost →
  // `manaGain` via CastCustomSpell(31818). Cite: Warlock.cpp LifeTap :52–103.
  | { kind: 'life_tap'; healthCost: number; manaGain: number }
  // SPELL_EFFECT_HEAL_MAX_HEALTH (67): heal equal to the CASTER's max health (Lay on Hands).
  // Cite: SpellEffects.cpp EffectHealMaxHealth.
  | { kind: 'heal_max_health' }
  // SPELL_EFFECT_WEAPON_PERCENT_DAMAGE (31): a weapon swing at pct% weapon damage, not flat damage.
  // Cite: Unit.cpp CalculateDamage WEAPON_PERCENT_DAMAGE path.
  | { kind: 'weapon_percent_damage'; pct: number }
  // SPELL_AURA_SCHOOL_IMMUNITY (39): immune to the schools in `schoolMask`. Divine Protection stacks
  // physical (1) + magic (126). Cite: SpellAuras.cpp HandleAuraModSchoolImmunity ~2992.
  | { kind: 'school_immunity'; schoolMask: number; durationMs: number; positive?: boolean }
  // SPELL_AURA_DAMAGE_IMMUNITY (40): immune to *damage* of schools in mask (not full aura block).
  // Cite: SpellAuras.cpp HandleAuraModDmgImmunity ~3042.
  | { kind: 'damage_immunity'; schoolMask: number; durationMs: number; positive?: boolean }
  // SPELL_AURA_MECHANIC_IMMUNITY (77): immune to one mechanic id (EffectMiscValue, 1-based).
  // Forbearance = MECHANIC_INVULNERABILITY (25). Cite: SpellAuras.cpp HandleModMechanicImmunity.
  | { kind: 'mechanic_immunity'; mechanic: number; durationMs: number; positive?: boolean; charges?: number }
  // SPELL_AURA_DISPEL_IMMUNITY (41): immune to one DispelType, and with IMMUNITY_PURGES_EFFECT it
  // strips what is already held (Stoneform 20594 POISON). Cite: SpellAuras.cpp ~3053.
  | { kind: 'dispel_immunity'; dispelType: number; durationMs: number; positive?: boolean }
  // SPELL_AURA_STATE_IMMUNITY (38): immune to one AuraType (EffectMiscValue), purging what is held
  // when IMMUNITY_PURGES_EFFECT. Cite: SpellAuras.cpp HandleAuraModStateImmunity ~2972.
  | { kind: 'state_immunity'; stateAuraType: number; durationMs: number; positive?: boolean }
  // SPELL_AURA_EFFECT_IMMUNITY (37): immune to one SpellEffect id. The WSG flag auras 23333/23335
  // carry misc 85 SUMMON_PLAYER — a flag carrier cannot be ported away. Cite: SpellAuras.cpp:2962.
  | { kind: 'effect_immunity'; effectId: number; durationMs: number; positive?: boolean }
  // SPELL_AURA_MOD_PACIFY (25): cannot melee/ranged attack (can still cast). NOT silence.
  // Cite: SpellAuras.cpp HandleAuraModPacify ~4382; UNIT_FLAG_PACIFIED.
  | { kind: 'pacify'; durationMs: number }
  // SPELL_AURA_SCHOOL_ABSORB (69): absorb pool vs `schoolMask`, rolled once at apply. `applyTo:
  // 'owner'` = TARGET_UNIT_CASTER_MASTER (27), a pet's pool lands on the master (Sacrifice 7812).
  | {
      kind: 'school_absorb';
      schoolMask: number;
      min: number;
      max: number;
      durationMs: number;
      applyTo?: 'self' | 'owner';
    }
  // SPELL_AURA_MANA_SHIELD (97): absorb pool paid from mana at `manaMultiplier` per point (classic
  // ranks = 2); depletes on amount, not OOM. Cite: Unit.cpp ~2457–2496.
  | { kind: 'mana_shield'; schoolMask: number; min: number; max: number; manaMultiplier: number; durationMs: number }
  // SPELL_EFFECT_ADD_EXTRA_ATTACKS (19): grant `count` extra auto-attacks, capped at 5 by the
  // engine (effects.ts resolveAddExtraAttacks). Cite: SpellEffects.cpp:4873–4882.
  | { kind: 'extra_attacks'; count: number }
  // SPELL_EFFECT_MODIFY_THREAT_PERCENT (125): change the target's threat toward the caster by signed
  // `pct` (Cower/Feint bake negative). Cite: SpellEffects.cpp:5262–5268.
  | { kind: 'modify_threat_pct'; pct: number }
  // SPELL_AURA_FEIGN_DEATH (66): CombatStop so IsNonCombatSpell (hunter traps) can fire.
  // Cite: Unit.cpp SetFeignDeath :10091–10103; Spell.cpp :4598 IsNonCombatSpell.
  | { kind: 'feign_death'; durationMs: number; playerControlledResistRoll?: boolean }
  // SPELL_AURA_MOD_TOTAL_THREAT (103): flat temporary threat reduction on every reverse-hate ref
  // (Fade r1 −55), reversed on remove. Cite: SpellAuras.cpp:2841–2858; HostileRefManager.cpp:82–99.
  | { kind: 'threat_temporary'; amount: number; durationMs: number }
  // Temporary buff/debuff: `mod` names what it raises, `hostile` puts it on the target, `applyTo`
  // routes self/pet/friendly/party, `school`/`schoolMask`/`creatureTypeMask` narrow it. All sourced.
  | {
      kind: 'buff';
      mod: BuffMod;
      amount: number;
      durationMs: number;
      pointsPerComboPoint?: number;
      hostile?: boolean;
      school?: School;
      applyTo?: 'self' | 'pet' | 'friendly' | 'party';
      creatureTypeMask?: number;
      schoolMask?: number;
      charges?: number;
    }
  // conjure an item into the inventory (Mage Conjure Food / Water, Create Healthstone)
  // `count` is the roll's minimum (bp+baseDice); `countMax` its top (bp+dieSides) when they differ.
  // Cite: SpellEffects.cpp:1971 num_to_add = damage; Object.cpp:2949 irand(baseDice, dieSides).
  | { kind: 'conjure'; item: number; count: number; countMax?: number }
  // summon a companion pet. `creature` is the CreatureDef to build the pet from; 0 means
  // "the character's own tamed pet" (Hunter Call Pet), >0 a fixed demon (Warlock Summon Imp).
  | { kind: 'summon_pet'; creature: number }
  // SPELL_EFFECT_SUMMON_WILD (41): an uncontrolled temporary creature. `creature` = EffectMiscValue,
  // `count` = damage>0 ? damage : 1, `durationMs` from DurationIndex. Cite: SpellEffects.cpp:2729.
  | {
      kind: 'summon_wild';
      creature: number;
      count: number;
      durationMs: number;
    }
  // SPELL_EFFECT_SUMMON_GUARDIAN (42): a temporary GUARDIAN_PET, not a commandable companion. Keeps
  // the count and duration bare `summon_pet` dropped. Cite: SpellEffects.cpp:2820–2992.
  | {
      kind: 'summon_guardian';
      creature: number;
      count: number;
      durationMs: number;
    }
  // SPELL_EFFECT_SUMMON_OBJECT_WILD (76): a temporary ownerless world GameObject. `goEntry` =
  // EffectMiscValue, `durationMs` from DurationIndex. Cite: SpellEffects.cpp:3620–3662.
  | {
      kind: 'summon_object_wild';
      goEntry: number;
      durationMs: number;
    }
  // SPELL_AURA_MOUNTED (78): mount creature template entry (EffectMiscValue), a travel state rather
  // than a combat payload. Cite: SpellAuras.cpp:1629–1656 HandleAuraMounted; Unit.cpp:7741–7756.
  | { kind: 'mounted'; creatureEntry: number }
  // SPELL_EFFECT_KNOCK_BACK (98): push the target away from the caster. `horizontal` =
  // EffectMiscValue/10, `vertical` = damage/10. Cite: SpellEffects.cpp:5113–5121 EffectKnockBack.
  | { kind: 'knock_back'; horizontal: number; vertical: number }
  // SPELL_EFFECT_SEND_EVENT (61): fire map event EffectMiscValue (dbscripts_on_event), never a
  // hit/heal payload. Cite: SpellEffects.cpp:1794–1798; ScriptMgr.cpp:3410–3447 StartEvents_Event.
  | { kind: 'send_event'; eventId: number }
  // SPELL_EFFECT_OPEN_LOCK (33) / OPEN_LOCK_ITEM (59): unlock a GO or item then SendLoot.
  // `skillBonus` is the effect amount, `fromItem` opcode 59. Cite: SpellEffects.cpp:2204–2274.
  | {
      kind: 'open_lock';
      /** Effect amount — CanOpenLock skillValue (not a paperdoll damage bonus). */
      skillBonus: number;
      /** Opcode 59 / item target path vs GO-targeted OPEN_LOCK (33). */
      fromItem: boolean;
      /** EffectMiscValue LockType when non-zero. */
      lockType?: number;
    }
  // SPELL_EFFECT_ACTIVATE_OBJECT (86): GameObjectActions(EffectMiscValue) on gameObjTarget; it
  // early-outs without one. Cite: SpellEffects.cpp:4377–4482; GameObject.h GameObjectActions.
  | {
      kind: 'activate_object';
      /** GameObjectActions enum (NONE=0 … CLOSE_AND_LOCK=18). */
      action: number;
      /** Twilight Council MAKE_ACTIVE/MAKE_INERT summon table NPC entry when applicable. */
      summonNpcEntry?: number;
      /** Onyxia Eruption 17731 OPEN/DISTURB → custom anim instead of Use. */
      customAnim?: boolean;
    }
  // Summon a shaman totem into one of the four element slots (effects 74 / 87–90). `creature` =
  // EffectMiscValue, `health` from base points, and the slot replaces any prior totem.
  | {
      kind: 'summon_totem';
      slot: TotemSlot | 'none';
      creature: number;
      health: number;
      durationMs: number;
      name?: string;
      abilities?: TotemAbilityDef[];
      // Resolved payloads for kit `proc_trigger_spell` ids (aura 23): the kit spell is only the
      // periodic holder, so without these the totem summons and does nothing. Not `abilities`.
      triggerAbilities?: TotemAbilityDef[];
    }
  // SPELL_EFFECT_THREAT (63): flat threat pulse (Stoneclaw Totem Effect). Amount = real base points.
  // Wired into ThreatManager (Unit AddThreat / EffectThreat) — not a soft-tank coin flip.
  | { kind: 'threat'; amount: number }
  // UnitAI::DoResetThreat — the CASTER's own list to zero, which `modify_threat_pct` cannot express.
  // Cite: UnitAI.cpp:773-781 modifyAllThreatPercent(-100); boss_arlokk.cpp:50 20538.
  | { kind: 'reset_own_threat' }
  // SPELL_EFFECT_ATTACK_ME (114): Taunt / Growl — equalize to highest threat + force victim.
  // Cite: SpellEffects.cpp EffectTaunt ~3413.
  | { kind: 'taunt' }
  // SPELL_AURA_MOD_TAUNT (11): hold taunt-state priority for `durationMs` (Taunt 3s, Mocking Blow
  // 6s). Distinct from EffectTaunt equalize; a Taunt row carries both. Cite: SpellAuras.cpp:2860.
  | { kind: 'mod_taunt'; durationMs: number }
  // SPELL_EFFECT_DISMISS_PET (102): unsummon the active pet (Dismiss Pet 2641).
  // Cite: SpellEffects.cpp EffectDismissPet; effect-handler-catalog.md §2.8.
  | { kind: 'dismiss_pet' }
  // SPELL_EFFECT_FEED_PET (101): consume diet food, start the Feed Pet Effect (1539) happiness
  // course. OOC only. Cite: SpellEffects.cpp:4681–4712; Spell.cpp:5332–5355 CheckCast FEED_PET.
  | { kind: 'feed_pet' }
  // SPELL_EFFECT_SUMMON_DEAD_PET (109): revive the slain pet at `healthPct` of max (Revive Pet 982
  // → 15%); no-op on a living pet. Cite: SpellEffects.cpp:5164 EffectSummonDeadPet.
  | { kind: 'revive_pet'; healthPct: number }
  // SPELL_EFFECT_RESURRECT_NEW (113): flat health (bp+dice) + mana (EffectMiscValue) on a dead
  // player — Resurrection / Redemption / Ancestral Spirit / Rebirth. Cite: SpellEffects.cpp:4815.
  | { kind: 'resurrect'; health: number; mana: number }
  // SPELL_EFFECT_RESURRECT (18) via EffectResurrect: percent of max health and mana.
  // Cite: SpellEffects.cpp:4819–4824 EffectResurrect else branch.
  | { kind: 'resurrect_pct'; percent: number }
  // Paladin seal: a 30s self-aura consumed by Judgement into `judge`. Which fields are set follows
  // `seal` — coeff, procPpm+onSwingWeaponPct, onSwingHeal, onSwingMana. Cite: Paladin.cpp:1094.
  | { kind: 'seal'; seal: SealKind; durationMs: number; coeff?: number; procPpm?: number; onSwingWeaponPct?: number; onSwingHeal?: number; onSwingMana?: number; judge?: JudgementBurst }
  // The generic Judgement (spell 20271): consumes the caster's active seal and applies its `judge`
  // burst on the target, then puts Judgement on its own cooldown. Inert if no seal is up.
  | { kind: 'judgement' }
  // SPELL_AURA_MOD_SHAPESHIFT (36): enter a form. `form` is EffectMiscValue (FORM_CAT=1, FORM_BEAR=5,
  // FORM_DIREBEAR=8). Recasting the same form cancels it. Cite: Aura::HandleAuraModShapeshift.
  | { kind: 'shapeshift'; form: ShapeshiftFormId }
  // SPELL_AURA_TRANSFORM (56): a pure model swap — CC, if any, comes from a sibling aura slot.
  // `creatureEntry` is EffectMiscValue; the display id is read off that creature at runtime.
  // Cite: SpellAuras.cpp:1979 HandleAuraTransform (SetDisplayId only).
  | { kind: 'transform'; creatureEntry: number; durationMs: number }
  // SPELL_AURA_MOD_STEALTH (16): `strength` = bp+dice, `durationMs` 0 = until cancelled, optional
  // `breakFlags` = AuraInterruptFlags. Cite: SpellAuras.cpp HandleModStealth.
  | { kind: 'stealth'; strength: number; durationMs: number; breakFlags?: number; charges?: number }
  // SPELL_AURA_MOD_STEALTH_LEVEL (154): passive/talent stealth *level* added to strength for detect math
  // (Master of Deception, Shadowmeld Passive, Feral Instinct). Does not itself enter stealth.
  | { kind: 'stealth_level'; amount: number }
  /** SPELL_AURA_MOD_STEALTH_DETECT (17): Perception / Track Hidden detect strength for the formula. */
  | { kind: 'stealth_detect'; amount: number; durationMs: number }
  // SPELL_AURA_FORCE_REACTION (139): force the player's reaction to faction `factionId`
  // (EffectMiscValue, a Faction not a FactionTemplate) up to `reputationRank`. Cite: SpellAuras.cpp:2034.
  | {
      kind: 'force_reaction';
      factionId: number;
      reputationRank: number;
      durationMs: number;
      stopAttackFaction?: boolean;
    }
  // SPELL_EFFECT_ENCHANT_ITEM (53): the permanent twin of `weapon_imbue` — kits, arcanums, scopes,
  // formulas. `enchantId` indexes DataBundle.itemEnchants; the slot rule is in enchantApplicators.
  | { kind: 'enchant_item_perm'; enchantId: number }
  // SPELL_EFFECT_ENCHANT_ITEM_TEMPORARY (54): weapon imbue / poison / oil / stone, exclusive per
  // hand. Cite: SpellEffects.cpp EffectEnchantItemTmp; enrich-weapon-imbues.mjs fills the kit.
  | {
      kind: 'weapon_imbue';
      enchantId: number;
      durationMs: number;
      /** rockbiter | windfury | flametongue | frostbrand | poison | other */
      family?: string;
      /** Rockbiter equip-spell MOD_ATTACK_POWER (aura 99). */
      attackPower?: number;
      equipSpellId?: number;
      /** TYPE_COMBAT_SPELL on-hit proc. */
      combatSpellId?: number;
      /** Flat % chance per hit when no PPM (enchant amount). */
      combatChancePct?: number;
      /** PPM from spell_proc_item_enchant when present. */
      combatPpm?: number;
      /** TYPE_DAMAGE flat weapon damage. */
      damageFlat?: number;
      /** Legacy TYPE_TOTEM Rockbiter DPS-like amount (Classic DBC usually uses equip spell). */
      rockbiterAmount?: number;
      /** Baked combat proc payload so the engine need not re-resolve the combat spell. */
      combat?: {
        spellId: number;
        name: string;
        direct?: { school: School; min: number; max: number };
        dot?: { school: School; min: number; max: number; durationMs: number; tickMs: number };
        extraAttacks?: number;
        apBonus?: number;
        /** Frostbrand / Crippling Poison snare (kind:speed). Cite: KI-581 / KI-717. */
        speed?: {
          aura: number;
          pct: number;
          durationMs: number;
          hostile?: boolean;
          mechanic?: string;
        };
        /** Mind-numbing / Wound Poison hostile buffs. Cite: KI-717. */
        buffs?: Array<{
          mod: string;
          amount: number;
          durationMs: number;
          hostile?: boolean;
        }>;
      };
    }
  // SPELL_AURA_DAMAGE_SHIELD (15) / PROC_TRIGGER_DAMAGE (43): on a taken hit, deal school damage to
  // the attacker, with optional charges + internal CD. Cite: UnitAuraProcHandler.cpp ~1449–1467.
  | {
      kind: 'damage_shield';
      school: School;
      min: number;
      max: number;
      durationMs: number;
      charges?: number;
      cooldownMs?: number;
    }
  // SPELL_AURA_PROC_TRIGGER_SPELL (42) generic — cast `triggerSpellId` when the aura procs, from
  // EffectTriggerSpell or a CMaNGOS special case where the DBC is wrong.
  | {
      kind: 'proc_trigger_spell';
      triggerSpellId: number;
      durationMs: number;
      amount?: number;
      charges?: number;
      cooldownMs?: number;
      /** PERIODIC_TRIGGER_SPELL (23) amplitude when periodic. */
      tickMs?: number;
      /** PERIODIC_TRIGGER_SPELL (23) per-tick roll 0..1 when the scripted body gates the cast. */
      tickChance?: number;
      // Proc roll in PERCENT when the scripted body rolls the aura's own amount rather than
      // spell_proc_event (Improved Mend Pet). Cite: UnitAuraProcHandler.cpp:1615-1620.
      procChancePct?: number;
      // The aura row belongs on the cast TARGET (EffectImplicitTargetA 6/21/25), not the caster.
      // Channel holders on targetA 1 CASTER leave this unset. Cite: SpellTargetDefines.h.
      auraOnTarget?: boolean;
      // HandleAuraDummy apply=false: the body runs when the aura GOES AWAY, so the row is a holder
      // only and never procs. `mode` mirrors AuraRemoveMode. Cite: SpellAuras.cpp:1386-1436.
      onRemove?: AuraRemoveBody[];
    }
  // Speed auras 31/32/33/58/129/130/171/172/191 — raw bake; `effectiveSpeeds` buckets by `aura` per
  // Unit::UpdateSpeed. `mechanic` ('snare'/'daze') is what Blessing of Freedom gates. Cite: Unit.cpp:8325.
  | { kind: 'speed'; aura: number; pct: number; durationMs: number; hostile?: boolean; mechanic?: Mechanic }
  // SPELL_AURA_SPLIT_DAMAGE_PCT (81), Soul Link: redirect `pct`% of the caster's incoming damage vs
  // `schoolMask` to the warlock's pet; no-op without a live pet. Cite: Unit.cpp split.
  | { kind: 'split_damage'; pct: number; schoolMask: number; durationMs: number }
  // SPELL_AURA_SPLIT_DAMAGE_FLAT (153), Blessing of Sacrifice: redirect up to `amount` damage per hit
  // to the aura caster. Cite: Unit.cpp:2501–2537 CalculateAbsorbAndResist; SpellAuras.cpp:214.
  | { kind: 'split_damage_flat'; amount: number; schoolMask: number; durationMs: number }
  // SPELL_AURA_RESIST_PUSHBACK (149): chance (%) to ignore cast pushback from damage. `applyTo:
  // 'party'` is APPLY_AREA_AURA_PARTY (Concentration Aura). Cite: Spell.cpp:6817–6820 Delayed.
  | { kind: 'resist_pushback'; amount: number; durationMs: number; applyTo?: 'self' | 'party' }
  // Peel a matching aura (Swiftmend HoT, Conflagrate Immolate, Hourglass Sand). `stacks === 1` →
  // RemoveAuraHolderFromStack, else RemoveAurasDueToSpell. Cite: SpellEffects.cpp:1842–1877.
  | {
      kind: 'consume_aura';
      spellId?: number;
      spellFamilyName?: number;
      spellFamilyFlags?: number;
      auraType?: number;
      casterOnly?: boolean;
      stacks?: number;
    }
  /** Ferocious Bite: dump energy after a landed school hit. Cite: SpellEffects.cpp:311–320. */
  | { kind: 'zero_energy' }
  // Blessing of Light — a scripted DUMMY dual slot: effect 0 is flat Holy Light healing taken,
  // effect 1 flat Flash of Light. Cite: Paladin.cpp:119–138; Unit.cpp:7261–7265.
  | {
      kind: 'blessing_of_light';
      holyLight: number;
      flashOfLight: number;
      durationMs: number;
      applyTo?: 'self' | 'friendly' | 'party';
    }
  // Holy Shock (20473 dummy): one button that heals a friendly or damages a hostile, branching on
  // reaction into the real sub-spells 25914 / 25912. Cite: Spell::EffectDummy icon 156.
  | { kind: 'holy_shock'; damage: { school: School; min: number; max: number }; heal: { min: number; max: number } }
  // Sweeping Strikes (12292): the next `charges` melee attacks each strike another nearby enemy —
  // 12723 copies post-mitigation damage, Whirlwind/Execute use 26654. Cite: UnitAuraProcHandler:810.
  | { kind: 'sweeping_strikes'; charges: number; durationMs: number }
  // Combustion (11129): every fire spell hit stacks `stackSpellId` for +`critPerStack` fire crit,
  // and only a fire CRIT spends a charge. Cite: UnitAuraProcHandler.cpp:991-1003 case 11129.
  | {
      kind: 'combustion';
      charges: number;
      stackSpellId: number;
      critPerStack: number;
      maxStacks: number;
      durationMs: number;
    }
  // Vampiric Embrace (15286): whenever the caster deals Shadow spell damage, heal caster and party
  // for `pct`% of it via 15290. Cite: UnitAuraProcHandler.cpp SPELLFAMILY_PRIEST 15286.
  | { kind: 'vampiric_embrace'; pct: number; durationMs: number }
  // Eye for an Eye (9799/25988 dummy): return `pct`% of MAGIC damage taken to the attacker via
  // 25997, capped at 50% of the caster's max health. Cite: UnitAuraProcHandler.cpp:795–808.
  | { kind: 'eye_for_an_eye'; pct: number; durationMs: number }
  // Ignite talent ranks (11119/11120/12846–12848 dummy): on fire spell damage the caster deals, arm DoT
  // 12654 with basepoints = rank% × damage (4/8/12/16/20). Cite: UnitAuraProcHandler.cpp:970–985.
  | { kind: 'ignite'; rankSpellId: number; durationMs: number }
  // Deep Wounds talent ranks (12834/12849/12867): on melee crit, arm physical DoT 12721 with per-tick
  // basepoints = weaponDamage × rank% / 6. Cite: UnitAuraProcHandler.cpp:1316–1342.
  | { kind: 'deep_wounds'; rankSpellId: number; durationMs: number }
  // Oracle Healing Bonus (26169 set dummy): when the caster heals, self-heal `pct`% of the heal amount via
  // spell 26170. Cite: UnitAuraProcHandler.cpp:1046–1052.
  | { kind: 'oracle_healing_bonus'; pct: number; durationMs: number }
  // Obsidian Armor (27539 dummy): when the bearer takes non-physical spell damage, cast the school-matched
  // resist buff (27533–27540). Cite: UnitAuraProcHandler.cpp:910–930.
  | { kind: 'obsidian_armor'; durationMs: number }
  // Adaptive Warding (28764 set dummy): when the bearer takes non-physical/non-holy spell damage WHILE Mage
  // Armor is up, cast school resist buff (28765–28770). Cite: UnitAuraProcHandler.cpp:870–907.
  | { kind: 'adaptive_warding'; durationMs: number }
  // Holy Power (28789) / Totemic Power (28823): on a heal cast, buff the heal target by class.
  // Cite: UnitAuraProcHandler.cpp:1153–1181 / 1191–1219.
  | { kind: 'class_power_set'; setKind: 'holy_power' | 'totemic_power'; durationMs: number }
  // Greater Heal Vestments 4pc (28809): when caster casts Greater Heal, trigger 28810. Cite:
  // UnitAuraProcHandler.cpp:1055–1058.
  | { kind: 'vestments_greater_heal'; durationMs: number }
  // Dreamwalker Healing Touch set (28719): HT cast → refund 30% of manaCost via 28742. Cite:
  // UnitAuraProcHandler.cpp:1068–1074.
  | { kind: 'dreamwalker_healing_touch'; durationMs: number }
  /** Idol of Longevity (28847): HT cast → trigger 28848. Cite: UnitAuraProcHandler.cpp:1077–1081. */
  | { kind: 'idol_healing_touch_refund'; durationMs: number }
  /** Totem of Flowing Water (28849): LHW cast → trigger 28850. Cite: UnitAuraProcHandler.cpp:1222–1226. */
  | { kind: 'totem_lesser_healing_wave'; durationMs: number }
  // Cheat Death set (28845): damage that crosses below 20% max HP → cast 28846. Cite:
  // UnitAuraProcHandler.cpp:1378–1383.
  | { kind: 'cheat_death'; durationMs: number }
  // Master of Elements talent ranks: spell crit → refund `pct`% of the spell's mana cost via 29077. Cite:
  // UnitAuraProcHandler.cpp:949–964.
  | { kind: 'master_of_elements'; pct: number; durationMs: number }
  // Magic Absorption talent ranks: full resist of a hostile spell → restore `pct`% of max mana via 29442.
  // Cite: UnitAuraProcHandler.cpp:938–947.
  | { kind: 'magic_absorption'; pct: number; durationMs: number }
  // Improved Sprint (13743/13875): on a successful Sprint cast, `chancePct`% to cast 30918, which
  // removes root and snare. Cite: Spell.cpp:7433–7468; SpellEffects.cpp:4140–4147.
  | { kind: 'improved_sprint'; chancePct: number; triggerSpellId: number; durationMs: number }
  // Healing Way (29206/29205/29202): ADD_TARGET_TRIGGER 109 → buff 29203 on a landed Healing Wave,
  // chance bp+1 (33/66/100). Cite: Spell.cpp:7433–7468; Shaman.cpp:77–89.
  | { kind: 'healing_way_talent'; chancePct: number; durationMs: number }
  // Healing Way buff 29203: +amountPct Healing Wave taken, stacks to maxStacks, 15s. Cite: Shaman.cpp
  // HealingWay OnDamageCalculate; spell_template 29203 StackAmount 3.
  | { kind: 'healing_way'; amountPct: number; durationMs: number; maxStacks: number }
  // Pyroclasm talent ranks (18096/18073): on Hellfire/Rain of Fire periodic damage the caster deals, chance
  // = base/tickCount to stun the victim with 18093 (3s). Cite: UnitAuraProcHandler.cpp:1347–1375.
  | { kind: 'pyroclasm'; rankSpellId: number; durationMs: number }
  // SPELL_EFFECT_ADD_COMBO_POINTS (80) as a standalone grant (Premeditation 14183 +2). Stealth-gated,
  // so the engine no-ops it unstealthed. Cite: SpellEffects.cpp EffectAddComboPoints.
  | { kind: 'combo_points'; amount: number; requiresStealth?: boolean }
  // SPELL_AURA_RETAIN_COMBO_POINTS (148), Premeditation: when this aura expires BY TIME, remove
  // `amount` CP from the combo target; an early remove does not. Cite: SpellAuras.cpp:4436–4452.
  | { kind: 'retain_combo_points'; amount: number; durationMs: number }
  // SPELL_EFFECT_TAMECREATURE (55): the hunter pet capture finisher (13481); role `pet_tame` drives
  // the OOC tame path. Cite: SpellEffects.cpp:3149–3225 EffectTameCreature.
  | { kind: 'tame_creature' }
  // SPELL_EFFECT_SELF_RESURRECT (94), Reincarnation: `percent` of max when effect damage ≥ 0, else
  // flat `health` (−damage) and `mana` (EffectMiscValue). Cite: SpellEffects.cpp:4937–4968.
  | { kind: 'self_resurrect'; percent?: number; health?: number; mana?: number }
  // Demonic Sacrifice (18788): kill the pet, apply the per-entry result aura under `resultSpellId` —
  // 416→18789, 1860→18790, 1863→18791, 417→18792. Cite: Warlock.cpp:225–228.
  | {
      kind: 'demonic_sacrifice';
      byPet: Record<
        number,
        {
          durationMs: number;
          /** Result aura id 18789–18792. */
          resultSpellId: number;
          mod?: BuffMod;
          amount?: number;
          school?: School;
          /** OBS_MOD_HEALTH/MANA: restore + pctOfMax + tickMs. */
          restore?: 'health' | 'power';
          pctOfMax?: number;
          tickMs?: number;
        }
      >;
    }
  // Priest Lightwell (724): `charges` charges for `durationMs`. Modelled reactively — every
  // `intervalMs` it renews the most-hurt friendly under half health for `healPerCharge`.
  | { kind: 'lightwell'; charges: number; healPerCharge: number; intervalMs: number; durationMs: number }
  // Scripted DUMMY that finishes cooldowns on a cluster of the caster's own spells: 'frost' = Cold
  // Snap 12472, 'rogue' = Preparation 14185, 'hunter' = Readiness 23989. Cite: Spell::EffectDummy.
  | { kind: 'reset_cooldowns'; scope: 'frost' | 'rogue' | 'hunter' }
  // A one-shot modifier the caster's next matching cast consumes (auras 107/108): critAdd 0..1,
  // instant, freeCost, costModPct (SPELLMOD_COST — not costPct), effectPct, castTimeFlat, appliesTo.
  | {
      kind: 'next_cast_mod';
      appliesTo: 'any' | 'nature' | 'heal' | 'summon' | 'curse';
      durationMs: number;
      critAdd?: number;
      instant?: boolean;
      freeCost?: boolean;
      /** SPELLMOD_COST signed % on the resolved cost (Fel Domination −50). Not ManaCostPercentage. */
      costModPct?: number;
      /** @deprecated Alias of costModPct for the startPendingSpellMod copy; not SpellDef.costPct. */
      costPct?: number;
      effectPct?: number;
      /** SPELLMOD_CASTING_TIME flat ms (Nature's Grace CalculateSimpleValue −500). */
      castTimeFlat?: number;
      // EffectItemType / spell_affect mask: non-zero → only spells whose SpellFamilyFlags share a
      // bit consume this (Improved Fireball vs Frostbolt). Cite: Player.cpp:350–357.
      familyFlags?: number;
      charges?: number;
    }
  // Lasting auras 107/108 that are NOT consume-on-next-cast — installed as owned SpellModifiers
  // (Arcane Power COST +30% for 15s, Barkskin). Charged auras stay `next_cast_mod`.
  | {
      kind: 'owned_spell_mods';
      durationMs: number;
      applyTo?: 'self';
      mods: Array<{
        op: number;
        type: 'flat' | 'pct';
        amount: number;
        familyFlags?: number;
      }>;
    }
  // SI5 materializations resolveCombatSpell pushes onto `effects[]` and applySpellLate consumes.
  // `auraOnTarget`: the holder belongs on the cast target, not the caster.
  | { kind: 'aura_dummy_holder'; spellId?: number; durationMs: number; auraOnTarget?: boolean; hostile?: boolean }
  | { kind: 'aura_dummy'; spellId?: number; durationMs?: number; auraOnTarget?: boolean; hostile?: boolean }
  | { kind: 'mod_invisibility'; amount: number; durationMs: number; invisibilityType?: number }
  | { kind: 'track_creatures'; durationMs: number; creatureType?: number; trackFlag?: number }
  | { kind: 'channel_death_item'; itemType: number; count: number; soulShard?: boolean }
  | { kind: 'leap'; targetA?: number; targetB?: number }
  | { kind: 'trade_skill'; skillId?: number }
  | { kind: 'inebriate'; drunkMod?: number; castItemEntry?: number }
  | { kind: 'transmitted_object'; goEntry?: number; durationMs?: number }
  | { kind: 'summon_object_slot'; goEntry: number; slot: number; durationMs: number }
  | { kind: 'enchant_held_item'; enchantId?: number; durationMs?: number }
  | { kind: 'sanctuary'; vanishRogueSpecial?: boolean; cannotBeDetectedMs?: number }
  | { kind: 'mod_health_regen_percent'; amount: number; durationMs: number }
  // SPELL_AURA_MOD_REGEN_DURING_COMBAT (116) — % of spirit HP regen allowed in combat.
  // Cite: Player.cpp:2297–2299, :2399–2400; Troll Regeneration 20555; KI-876.
  | { kind: 'mod_regen_during_combat'; amount: number; durationMs?: number }
  | { kind: 'skill_step'; skillId: number; step: number }
  | { kind: 'skill_marker' }
  | { kind: 'mod_skill'; skillId: number; amount: number; permanent?: boolean; durationMs?: number }
  // SPELL_EFFECT_PARRY (22). SetCanParry(true). Cite: SpellEffects.cpp:4885–4888; KI-818.
  | { kind: 'can_parry' }
  // SPELL_EFFECT_BLOCK (23). SetCanBlock(true). Cite: SpellEffects.cpp:4890–4893.
  | { kind: 'can_block' }
  // SPELL_AURA_MOD_REPUTATION_GAIN (156) — Diplomacy. Cite: Player.cpp:6297–6302.
  | { kind: 'mod_reputation_gain'; amount: number; durationMs?: number; factionId?: number }
  // SPELL_AURA_MOD_MECHANIC_RESISTANCE (117) — Hardiness. mechanic = EffectMiscValue.
  // Cite: Unit.cpp:4015–4031 MagicSpellHitResult.
  | { kind: 'mod_mechanic_resistance'; mechanic: number; amount: number; durationMs?: number }
  | { kind: 'mod_stalked'; durationMs: number }
  // SPELL_AURA_MOD_LANGUAGE (75). languageId = misc; hostile when targetA enemy (CoT, KI-765).
  | { kind: 'mod_language'; amount?: number; durationMs?: number; languageId?: number; hostile?: boolean }
  | { kind: 'force_reaction'; amount?: number; durationMs?: number; factionId?: number }
  // SPELL_AURA_PREVENTS_FLEEING (92). hostile when targetA enemy (Curse of Recklessness).
  // Cite: SpellAuras.cpp HandlePreventFleeing; SpellTargetDefines TARGET_UNIT_ENEMY=6; KI-765.
  | { kind: 'prevents_fleeing'; durationMs?: number; hostile?: boolean }
  | { kind: 'teleport_face_caster'; targetA?: number; targetB?: number; requiresDestLocation?: boolean }
  | { kind: 'add_farsight'; durationMs: number; radius?: number; dynObjectType?: number }
  | { kind: 'summon_change_item'; newItemId: number }
  // SPELL_EFFECT_SUMMON_DEMON (56). Cite: SpellEffects.cpp:5430 EffectSummonDemon.
  | { kind: 'summon_demon'; creature: number; count?: number; durationMs?: number; level?: number }
  // SPELL_EFFECT_SUMMON_POSSESSED (73) — Eye of Kilrogg. oocCastEffects summons it as a pet
  // alongside summon_demon. Cite: SpellEffects.cpp EffectSummonPossessed; KI-578.
  | { kind: 'summon_possessed'; creature: number; durationMs?: number }
  // SPELL_AURA_MOD_POSSESS_PET (128) — Eyes of the Beast. Own-pet vision, not enemy CC.
  // Cite: SpellAuras.cpp:2258–2279; Spell.cpp:5717–5735; KI-729.
  | { kind: 'mod_possess_pet'; durationMs: number; spellId?: number }
  | { kind: 'script_handled_noop'; spellId?: number }
  // SPELL_EFFECT_DURABILITY_DAMAGE_PCT (115). percent = damage/100. Cite: SpellEffects.cpp:5236–5260.
  | { kind: 'durability_damage'; slot: number; percent: number; allItems: boolean; includeInventory: boolean };

/** `effectSlot`: the DBC EffectN slot this effect came from (index into effectBonusCoefficient*). */
export type SpellEffect = SpellEffectBody & { effectSlot?: number };

// Slim ability kit embedded on `summon_totem` effects so combat can cast/apply without DataStore. Numbers
// and effects are the same mapped values as the full SpellDef for that id.
export interface TotemAbilityDef {
  id: number;
  name: string;
  castTimeMs: number;
  cooldownMs: number;
  gcdMs: number;
  school: School;
  effects: SpellEffect[];
  // SpellRadius.dbc yards for the kit's area effect — the ABILITY spell's radius (effect 35), never
  // the summon's cast range. Absent = bake gap, fail open. Cite: SpellAuras.cpp:307–309.
  radiusYd?: number;
}

/** AI hint so the combat policy can pick sensible actions without guessing. */
export type SpellRole =
  | 'nuke'          // cast-time direct damage (Fireball, Frostbolt)
  | 'instant_nuke'  // instant direct damage on a cooldown (Fire Blast)
  | 'control'       // instant, roots the target (Frost Nova)
  | 'dot'           // applies a damage-over-time (Rend)
  | 'buff'          // self buff (Battle Shout, Frost Armor)
  | 'charge'        // opener that generates resource (Charge)
  | 'strike'        // weapon-based strike; the on-next-swing ones set onNextSwing (Heroic Strike)
  | 'shoot'         // ranged-weapon attack; damage comes from the equipped `ranged` item (Shoot/Auto Shot)
  | 'attack'        // melee auto-attack toggle (the counterpart to Shoot); flips the fighter to melee mode
  | 'conjure'       // creates an item
  | 'pet_summon'    // summon or call a pet (Summon Imp, Call Pet)
  | 'pet_heal'      // heal the active pet (Mend Pet)
  | 'pet_tame'      // tame a beast into a pet (Tame Beast)
  | 'totem_summon'  // shaman totem (Searing / Stoneskin / Mana Spring / …) — in-combat summon
  | 'seal'          // paladin seal: a self-aura kept up in combat, procs on melee swing (Seal of Righteousness)
  | 'judgement'     // paladin Judgement: unleash the active seal on a cooldown (Judgement)
  | 'form'          // shapeshift form spell (Bear/Cat/Travel/…) — enter/toggle form
  | 'stealth'       // enter stealth / Prowl / Shadowmeld (aura 16); OOC or Vanish mid-fight
  | 'utility';

// Verbatim spell_template effect slot for the client-side interpreter (SI1), baked alongside the
// synthesized `effects[]`. Field names: docs/archive/SPELL-INTERPRETER.md §2.1.
export interface RawSpellEffect {
  /** EffectN — SPELL_EFFECT_* dispatch key */
  effect: number;
  /** EffectApplyAuraNameN — SPELL_AURA_* when effect is apply-aura family */
  auraName: number;
  basePoints: number;
  dieSides: number;
  /** EffectBaseDiceN — used with basePoints for min formula */
  baseDice: number;
  /** EffectRealPointsPerLevelN */
  perLevel: number;
  /** EffectPointsPerComboPointN */
  perCombo: number;
  amplitude: number;
  radiusIndex: number;
  targetA: number;
  targetB: number;
  miscValue: number;
  miscValueB: number;
  triggerSpell: number;
  /** Per-effect mechanic when present, else spell-level Mechanic */
  mechanic: number;
  /** EffectChainTargetN */
  chainTargets: number;
  // EffectItemTypeN — item entry for SPELL_EFFECT_CREATE_ITEM (24) and kin. Optional: SI1 omitted
  // the column until SI3. Cite: spell_template.EffectItemType; SpellEffects.cpp DoCreateItem.
  itemType?: number;
  // EffectMultipleValueN — level offset / multiplier for summon wild/guardian paths. Cite: SpellEffects.cpp
  // EffectSummonWild / EffectSummonGuardian.
  multipleValue?: number;
  // DmgMultiplierN — per-jump chain falloff (Chain Heal 0.5, Chain Lightning 0.7, Swipe 1). Cite:
  // Spell.cpp:4459–4465 ExecuteEffects; spell_template.DmgMultiplier1.
  dmgMultiplier?: number;
}

export interface SpellDef {
  id: number;
  name: string;
  rank: number;              // 0 if unranked
  school: School;
  powerType: PowerType;      // resource this spell spends
  cost: number;              // mana, rage, or energy (resolved; energy = raw ManaCost, rage = ManaCost/10)
  castTimeMs: number;        // resolved from CastingTimeIndex (0 = instant)
  cooldownMs: number;        // RecoveryTime
  gcdMs: number;             // 1500 on-GCD, 0 off-GCD
  rangeMax: number;          // yards (flavor for the text log)
  // SpellRange.dbc min column (yards) — the charge / gap-close floor. Omitted when the DBC min is 0
  // or the range index is absent; NEVER invent. Cite: SpellRange.dbc field 1.
  rangeMin?: number;
  // The raw SpellRange.dbc index, not the resolved yards. Only CanParryAbility reads it: parry needs
  // index 1 or 2, and yards cannot substitute (5 covers 2, 6, 12). Cite: Unit.cpp:3153-3155.
  rangeIndex?: number;
  reqLevel: number;
  // spell_template.SpellLevel — the intended cast level for the rank (downrank penalty input),
  // distinct from `reqLevel`. Omitted when SpellLevel is 0.
  spellLevel?: number;
  effects: SpellEffect[];
  // SI1: verbatim spell_template effect rows for the client interpreter, additive alongside
  // `effects[]`. Omitted when all Effect1..3 are 0. Cite: docs/archive/SPELL-INTERPRETER.md §2.1.
  rawEffects?: RawSpellEffect[];
  // spell_template.Reagent1..8 / ReagentCount1..8 — items consumed on cast (Soul Shard 6265×1 on
  // Summon Voidwalker). Omitted when the spell has none. Cite: Spell.cpp CheckItems / TakeReagents.
  reagents?: { item: number; count: number }[];
  category?: number;         // spell_template.Category for shared category cooldowns (potions etc); omitted if 0/unset
  outOfCombatOnly?: boolean; // conjure, food/water (NOT combat armor buffs — CB4)
  role?: SpellRole;          // AI hint
  // Area-of-effect: the spell has an enemy-area EffectImplicitTarget (15/16/22/24/28) and a fannable
  // effect, so castOnTargets hits every living unit on the target's side. Absent = single-target.
  aoe?: boolean;
  // Area shape from EffectImplicitTargetA: 22 → 'pbaoe', 15/16/28 → 'ground', 24 → 'cone'. Only on
  // aoe spells; flat `aoe` stays the fan-out flag. Baked by enrich-spell-geometry.mjs.
  aoeShape?: 'pbaoe' | 'ground' | 'cone';
  // `spell_cone.ConeDegrees` for rank 1 — the FULL angle. NEGATIVE is a REAR cone, not a narrow one
  // (Tail Sweep 15847 = -82). Absent means 60°. Read through `coneArcOf`. Cite: Spell.cpp:7585-7591.
  coneDeg?: number;
  // `spell_facing.facingcasterflag & 0x1`: a PLAYER cast refuses with "must be facing" outside the
  // caster's front half; creature casts are exempt. Cite: Spell.cpp:6247-6249; SpellDefines.h:391.
  requiresFacing?: true;
  // First non-zero EffectRadiusIndex → SpellRadius.dbc yards; omitted when all resolve to 0. Engine
  // fan-out still uses `aoe`, so this is data for a future distance/cap model.
  radiusYd?: number;
  // spell_template.MaxAffectedTargets when > 0 (CMaNGOS SpellEntry). Omitted when 0/absent — never invent a
  // default cap. Cite: docs/cmangos_mapping/spells/additional-logic.md.
  maxTargets?: number;
  mechanic?: Mechanic;       // DB Mechanic — drives CC diminishing-returns grouping + immunity (absent => none)
  rageGenerated?: number;    // Charge and similar
  strikeBonus?: number;      // Heroic Strike: flat bonus added onto a weapon hit
  onNextSwing?: boolean;     // Heroic Strike / Cleave / Maul / Raptor Strike: replaces your next auto-attack (off the GCD)
  passive?: boolean;         // SPELL_ATTR_PASSIVE: an aura you never cast (weapon skills, Block/Dodge, racials) — hidden from the spellbook/action bars
  // SPELL_ATTR_HIDDEN_CLIENTSIDE (0x80): never in the spellbook or on a bar, but several carry real
  // damage/CC (Grovel, Duel, Opening), so role inference must skip them. All have SpellIconID 1.
  hiddenClientside?: boolean;
  // Spell.dbc AuraInterruptFlags (field 18), stamped from the client DBC because the ClassicDB dump
  // zeroes it. Bit 0x02 = break-on-damage CC. Cite: SpellDefines.h:362–386.
  auraInterruptFlags?: number;
  // Channel duration ms from DurationIndex (channelled AttributesEx only); until-cancelled stamps
  // INT32_MAX + `channelUntilCancelled`. Cite: SpellMgr IsChanneledSpell; channel.ts arms it.
  channelMs?: number;
  // Spell.dbc ChannelInterruptFlags (field 19), the same bit enum as AuraInterruptFlags — combat
  // cancels or pushbacks the channel from these. Cite: Unit.cpp:1285–1302; Spell.cpp DelayedChannel.
  channelInterruptFlags?: number;
  // SpellDuration.dbc Duration = -1 (index 21). Channel ends only on interrupt / death, not a timer. Cite:
  // SpellDuration.dbc record 21; enrich-channel.mjs.
  channelUntilCancelled?: boolean;
  // SPELLMOD_NOT_LOSE_CASTING_TIME (op 9) PCT from talents matching this spell's class mask, added
  // to the Delayed / DelayedChannel resist roll. Cite: Spell.cpp:6817–6821 / 6848–6852.
  notLoseCastingTimePct?: number;
  // SpellEntry.Dispel — the dispel CATEGORY of the auras this spell applies (MAGIC=1, CURSE=2,
  // DISEASE=3, POISON=4). Absent/0 = not dispellable. Cite: SpellAuras.cpp IsDispellableByMask.
  dispel?: number;
  icon?: string;             // WoW icon name (e.g. "spell_fire_flamebolt"); UI-only, absent => question-mark fallback
  description?: string;      // from DB/CSV if available (e.g. "Use: Increases your Strength by 4 for 1 hour.")
  // Spell family class mask (SpellClassOptions.csv) that talent spell_mod rows match against.
  // Absent on older bakes, and a missing mask means no family match, so mods will not apply.
  spellClassMask?: number[];
  // LEARN_SPELL (36) / LEARN_PET_SPELL (57): this row is a stub that teaches `teaches`, and inherits
  // that ability's cooldown/gcd/category at bake. Cite: SpellEffects.cpp:2445; :3386.
  teaches?: number;
  // ---- Combo points / energy finishers (sourced from spell_template + SpellDuration.dbc) ----
  /** SPELL_EFFECT_ADD_COMBO_POINTS (80): CP granted on a successful hit (base+dice, typically 1). */
  comboPointsGenerated?: number;
  // Finisher: AttributesEx SPELL_ATTR_EX_FINISHING_MOVE_DAMAGE (bit 20) and/or
  // SPELL_ATTR_EX_FINISHING_MOVE_DURATION (bit 22). Needs combo points on the target to cast.
  requiresComboPoints?: boolean;
  finishingScalesDamage?: boolean;
  finishingScalesDuration?: boolean;
  // SpellDuration.dbc MaxDuration (Duration[2]) when it differs from base Duration[0]. CMaNGOS: duration +=
  // (max - min) * comboPoints / 5 (SpellMgr.cpp CalculateSpellDuration).
  durationMaxMs?: number;
  // spell_template.DurationIndex → SpellDuration.dbc row; interpretSpell uses it when ctx.durationMs
  // is absent. Not stamped on every bake. Cite: SpellMgr.cpp GetSpellDuration.
  durationIndex?: number;
  // SpellEntry.SpellIconID (numeric). Distinct from UI `icon` string name. Used by EffectSchoolDMG family
  // specials (Bloodthirst icon 38, Shield Slam 413). Optional additive — fixtures / future extract.
  spellIconId?: number;
  // Optional spell_threat row (multiplier / flat / ap_bonus); absent means GetSpellThreatMultiplier
  // defaults to 1.0. Populated by enrich-spell-threat.mjs — never invent rows.
  threatMultiplier?: number;
  threatFlat?: number;
  threatApBonus?: number;
  // Initial-aggro suppressors from AttributesEx/Ex2: `noThreat` never aggros, `threatOnlyOnMiss`
  // only on a miss, `noInitialThreat` lets damage build threat but the cast itself never pulls.
  noThreat?: boolean;
  threatOnlyOnMiss?: boolean;
  noInitialThreat?: boolean;
  // SPELLMOD_THREAT percent from talent ADD_PCT/FLAT (runtime clone via withTalentMods). Applied in
  // CalcThreat before ApplyTotalThreatModifier. Cite: ThreatManager.cpp:49.
  threatSpellModPct?: number;
  // Eviscerate AP term from CMaNGOS SpellEffects.cpp SPELLFAMILY_ROGUE hook: damage += AP * comboPoints *
  // coeff. Only set for that family/flag match (coeff = 0.03).
  comboApCoeff?: number;
  // ---- Shapeshift / stance gating (spell_template Stances / StancesNot / Attributes) ----
  // SpellEntry.Stances: allowed only in these forms (bit = 1 << (formId - 1)). Absent/0 = no form.
  stances?: number;
  /** SpellEntry.StancesNot bitmask: forbidden in these forms. */
  stancesNot?: number;
  // SPELL_ATTR_NOT_SHAPESHIFT (0x10000): cannot cast while in a real shapeshift form. Engine: product
  // leave-then-cast (docs/done/druid.md §5). CMaNGOS refuses.
  notShapeshift?: boolean;
  // SPELL_ATTR_EX2_ALLOW_WHILE_NOT_SHAPESHIFTED (0x80000): form-required spell that may also be used out of
  // form (rare). Sourced from AttributesEx2.
  allowWhileNotShapeshifted?: boolean;
  // ManaCostPercentage — a share of the caster's CREATE pool: powerCost = flat `cost` + floor(create
  // health-or-mana × costPct / 100). Never store the percentage in `cost`. Cite: Spell.cpp:6331.
  costPct?: number;
  // spell_template.ManaPerSecond — HP/mana taken every 1s while the aura/channel lives. POWER_HEALTH
  // (Health Funnel) cancels the aura when HP ≤ this. Cite: SpellAuras.cpp:5686–5707.
  manaPerSecond?: number;
  /** spell_template.ManaPerSecondPerLevel. All Classic Health Funnel ranks are 0. */
  manaPerSecondPerLevel?: number;
  // SPELL_ATTR_EX2_NO_TARGET_PER_SECOND_COSTS (0x800): only the caster's own holder pays. Health Funnel has
  // this so the pet HoT does not drain the pet. Cite: SpellDefines.h:113.
  noTargetPerSecondCosts?: boolean;
  /** SpellEntry.AttributesEx2 raw mask when a consumer needs other EX2 bits. */
  attributesEx2?: number;
  // SpellEntry.AttributesEx raw mask, non-zero on 3,561 of 22,374. Read for NO_REDIRECTION 0x8,
  // NO_THREAT 0x400, AURA_UNIQUE 0x800, REQUIRE_ALL_TARGETS 0x4000000. Cite: SpellDefines.h:64-95.
  attributesEx?: number;
  // SpellEntry.AttributesEx3 raw mask, non-zero on 799 rows. Read for NO_AVOIDANCE 0x40, NOT_A_PROC
  // 0x200, ALWAYS_HIT 0x40000, CAN_PROC_FROM_PROCS 0x4000000. Cite: SpellDefines.h:135-167.
  attributesEx3?: number;
  // SpellEntry.AttributesEx4 raw mask (field 10). Non-zero on 72 rows. Read for NO_HELPFUL_THREAT 0x8,
  // NO_HARMFUL_THREAT 0x10. Cite: SpellDefines.h:169-182.
  attributesEx4?: number;
  // `spell_template.AttributesServerside` — CMaNGOS's own fifth word, carried by no DBC. 72 of
  // 22,374: IGNORE_EVADE 0x4 on 56, FACING_BACK 0x8 on 16. Cite: SpellDefines.h:188-194.
  attributesServerside?: number;
  // SpellEntry.RequiresSpellFocus — a GO of this SpellFocusObject.dbc id must be nearby (anvil 1 on 315
  // spells, forge 4 on 86). 695 rows. Cite: Spell.cpp:5019-5022.
  requiresSpellFocus?: number;
  // SpellEntry.CasterAuraState — an AuraState bit the caster must hold (24 rows): 1 DEFENSE on 17,
  // 2 HEALTHLESS_20, 3 BERSERKING, 5 JUDGEMENT, 7 HUNTER_PARRY. Cite: Unit.h:2163 HasAuraState.
  casterAuraState?: number;
  // SpellEntry.TargetAuraState — 2 AURA_STATE_HEALTHLESS_20_PERCENT on all 16 rows (Execute x7,
  // Hammer of Wrath x3, Fatal Bite x3). Cite: Unit.cpp:534; engine/combat/reactiveGates.ts.
  targetAuraState?: number;
  // SpellEntry.BaseLevel — the floor the caster level is clamped to before spellLevel is subtracted for
  // per-level scaling. 6,128 rows. Cite: Object.cpp:2926-2934.
  baseLevel?: number;
  /** SpellEntry.MaxLevel — the ceiling of the same clamp. 1,306 rows. Cite: Object.cpp:2926. */
  maxLevel?: number;
  // SpellEntry.ManaCostPerlevel — added to the flat cost as perLevel × (rank/5 − baseLevel), where
  // rank is the caster level capped at maxLevel×5. 72 rows. Cite: Spell.cpp:6332; Unit.cpp:11855.
  costPerLevel?: number;
  // SpellEntry.MaxTargetLevel — refuse a victim above this level (Mind Soothe 40 and 55, Soothe Animal). 25
  // rows. Cite: Spell.cpp:4922 CheckTarget.
  maxTargetLevel?: number;
  // SpellEntry.Totem1/2 — crafting TOOL item entries the caster must carry despite the column name
  // (Blacksmith Hammer 5956 on 337 spells). 684 rows. Cite: Spell.cpp:6601 CheckItems.
  requiredTools?: number[];
  // ---- Stealth / positional gates (spell_template Attributes / Ex / Ex2 / Serverside) ----
  // SPELL_ATTR_ONLY_STEALTHED (0x20000): the cast fails without MOD_STEALTH. Cite: Spell.cpp ~4623.
  requiresStealth?: boolean;
  // Must be behind the target (38 rows: Backstab, Garrote, Shred, Ambush). Either the Ex2/Ex combat
  // pair or AttributesServerside FACING_BACK 0x8 sets it; Pounce is excluded. Cite: Spell.cpp:4822.
  requiresBehind?: boolean;
  // Must face the target's front (8 rows: Gouge, Sap). `Attributes` must EQUAL 0x150010 — an
  // equality test on the whole word, not a mask. Cite: Spell.cpp:4833-4834.
  requiresFront?: boolean;
  // SPELL_ATTR_CANCELS_AUTO_ATTACK_COMBAT (0x100000): AttackStop on successful cast. Stealth / Prowl /
  // Gouge / Sap / Shadowmeld. Cite: Spell.cpp ~3691.
  cancelsAutoAttack?: boolean;
  // SPELL_ATTR_NOT_IN_COMBAT_ONLY_PEACEFUL (0x10000000): cannot cast in combat. Aliases
  // outOfCombatOnly for world-cast gating; Sap's peaceful-target rule is a separate Ex flag.
  notInCombatOnly?: boolean;
  // Pounce carries the behind Ex-flags but lost the facing limit in 2.0.1, so the core excludes it
  // and `requiresBehind` stays unset on its 3 ranks. Cite: Spell.cpp:4825-4827.
  pounceBehindCoreExcluded?: boolean;
  // SpellMgr.h IsBinarySpell (pre-WotLK), computed at ETL from Effect* / EffectApplyAuraName* /
  // EffectImplicitTarget*. Absent → the engine falls back to an effect-kind proxy.
  binary?: boolean;
  // spell_template.DmgClass (SharedDefines SPELL_DAMAGE_CLASS_*): 0 none, 1 magic, 2 melee, 3 ranged.
  // IsResistableSpell = dmgClass !== 0. Used for full-resist land rolls on magic damage.
  dmgClass?: number;
  // SpellEntry.TargetCreatureType bits (1 << (type - 1)): the spell only lands on these types
  // (Shackle → undead, Banish → demon|elemental). Absent/0 = unrestricted. Cite: Spell.cpp ~6909.
  targetCreatureTypeMask?: number;
  // ---- Spell/aura engine (System 5) — optional; missing = prior behaviour ----
  // CategoryRecoveryTime ms: with `category` set the category CD uses this, personal uses `cooldownMs`.
  categoryRecoveryMs?: number;
  // InterruptFlags — COMBAT (0x08) for IsInterruptible + swing reset on cast. Cite: Spell.cpp
  // IsInterruptible / _handle_immediate_phase; SpellDefines.h SPELL_INTERRUPT_FLAG_*.
  interruptFlags?: number;
  // spell_template.PreventionType: 0 none, 1 silence, 2 pacify. Silence plus school lockout gates
  // casts; pacify is melee and out of scope. Cite: SharedDefines SpellPreventionType.
  preventionType?: number;
  // SpellEntry.StackAmount — max stacks for this aura on a target. 0/absent = single instance (refresh
  // duration, no multi-stack). Cite: SpellEntry.StackAmount; Player.cpp stack clamp.
  stackAmount?: number;
  // SPELL_ATTR_EX3_DOT_STACKING_RULE (0x80): a SEPARATE stack per caster (each warlock's own
  // Corruption). Absent = one shared holder, so two warriors build ONE 5-stack Sunder Armor.
  stacksPerCaster?: boolean;
  // SpellEntry.procCharges — charges on the aura; decremented on successful proc fire; aura removed at 0.
  // Cite: SpellEntry.procCharges; UnitAuraProcHandler charge consume.
  procCharges?: number;
  // SpellEntry.ProcChance as PERCENT 0..100. spell_proc_event.CustomChance overrides it, and PPM
  // replaces it on the attacker melee path. Cite: UnitAuraProcHandler.cpp:590–600.
  procChance?: number;
  // SpellEntry.procFlags bitmask (SpellMgr.h ProcFlags). Used when matching combat events to aura/talent
  // procs. Absent = match any hit context (legacy talent procs).
  procFlags?: number;
  // SpellEntry.SpellFamilyName (SharedDefines SpellFamily). Used with spell_proc_event family match. Cite:
  // SpellMgr.cpp IsSpellProcEventCanTriggeredBy ~912; enrich-spell-aura.mjs.
  spellFamilyName?: number;
  // SpellEntry.SpellFamilyFlags (bitmask). Matched against spell_proc_event.SpellFamilyMask*. Cite:
  // UnitAuraProcHandler.cpp ~634 IsFitToFamilyMask; enrich-spell-aura.mjs.
  spellFamilyFlags?: number;
  // Per-effect DBC effectBonusCoefficient[3]; with caster spell power or AP the SpellBonusWithCoeffs
  // path adds bonus damage. Absent = baked min/max only. Cite: Unit.cpp ~6974.
  effectBonusCoefficient?: number[];
  /** Per-effect DBC effectBonusCoefficientFromAP[3]. Cite: Unit.cpp SpellBonusWithCoeffs ~6985. */
  effectBonusCoefficientFromAP?: number[];
  // spell_proc_event row for this spell id, driving PPM / custom chance / school+family filters /
  // hidden cooldown at proc sites. Cite: SpellMgr.h SpellProcEventEntry ~1740. Never invent rows.
  spellProcEvent?: SpellProcEventDef;
  // Optional conditions-table entry id (or inline ConditionDef for tests/fixtures). When set, cast/use is
  // gated by the pure conditions evaluator. Cite: Conditions.h ConditionEntry; conditions.md.
  conditionId?: number;
  // Inline condition for fixtures / tests (production prefers conditionId + baked table). Never invent
  // Classic content rows here — test-only or ETL-sourced.
  condition?: ConditionDef;
  // ---- Wave D engine-bridge flags (Lane 2 bake half; Wave J deletes id/name lists) ----
  // SPELL_AURA_SPELL_MAGNET (96): Grounding Totem redirects one harmful single-target spell.
  spellMagnet?: boolean;
  // mangos.spell_group_spell group Id (e.g. 10 = Hunter Aspects UNIQUE_PER_CASTER). Cite:
  // sql/updates/mangos/z2828_01_mangos_spell_groups.sql; character.ts isHunterAspectSpell.
  spellGroupId?: number;
  // Mutual-exclusion group for UNIQUE_PER_CASTER / EXCLUSIVE spell_group rules (Aspects, Mage
  // Armors). Same id as spellGroupId when Rule is 1 or 2. Cite: SpellGroupStackRule.
  exclusionGroup?: number;
  // A killing blow with this DoT active grants Soul Shard 6265 — DB-driven, any EffectItemType slot
  // equal to 6265 (Drain Soul ranks, Shadowburn). Cite: spell_template.EffectItemType*.
  grantsSoulShardOnKill?: boolean;
  // SpellEntry.EquippedItemClass — weapon (2) / armor (4), a cast gate plus proficiency. Absent when
  // −1 (any). Cite: Item.cpp:834–862; Player.cpp:18572–18628; ItemPrototype.h ITEM_CLASS_*.
  equippedItemClass?: number;
  // SpellEntry.EquippedItemSubClassMask — subclass bit mask (0/absent = any subclass). Only baked when
  // EquippedItemClass >= 0 and mask ≠ 0. Cite: Item.cpp:846–850; Player.cpp:18572–18628.
  equippedItemSubClassMask?: number;
  // SpellEntry.EquippedItemInventoryTypeMask — InventoryType bits (0/absent = any), applied only
  // when Targets includes TARGET_FLAG_ITEM. Cite: Item.cpp:856–860.
  equippedItemInventoryTypeMask?: number;
  // SPELL_ATTR_EX3_REQUIRES_MAIN_HAND_WEAPON (0x400) on 128 rows — THIS is the disarm gate, not
  // `equippedItemClass`. Cite: Player.cpp:18577-18582; Unit.h:1191-1204 CanUseEquippedWeapon.
  requiresMainHandWeapon?: boolean;
  // SpellEntry.Attributes raw first word. IS_ABILITY (0x10) + USES_RANGED_SLOT (0x2) exclude 356
  // player rows from the GCD haste branch. Absent when 0. Cite: Player.cpp:20080-20087 AddGCD.
  attributes?: number;
  // SpellEntry.StartRecoveryCategory — the GCD bucket `gcdMs` is stored under; 133 is the global one
  // and the only category the haste branch touches. Absent when 0. Cite: Object.cpp:2596-2603.
  gcdCategory?: number;
  // SpellEntry.speed — missile / charge travel speed. 0 → BASE_CHARGE_SPEED (27). Cite:
  // SpellEffects.cpp:5021 EffectCharge; Unit.h BASE_CHARGE_SPEED.
  speed?: number;
}

// Baked `spell_proc_event` row (optional fields only when non-zero). Cite: SpellMgr.h SpellProcEventEntry;
// SpellMgr.cpp LoadSpellProcEvents.
export interface SpellProcEventDef {
  schoolMask?: number;
  spellFamilyName?: number;
  /** Per-effect family masks [0..2]; non-zero entries filter candidate spell family flags. */
  spellFamilyMask?: number[];
  procFlags?: number;
  procEx?: number;
  ppmRate?: number;
  /** Flat override chance (percent in DB CustomChance; engine may treat >1 as percent). */
  customChance?: number;
  /** Hidden CD on the triggered spell (ms). DB Cooldown column. */
  cooldownMs?: number;
}
