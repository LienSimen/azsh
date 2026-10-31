// Side intents from CMaNGOS specials that are not represented as bake SpellEffect kinds. Live combat (SI5+)
// can consume these; oracle ignores them (diff compares effects only).
export type InterpretIntent =
  | {
      kind: 'consume_aura';
      /** Prefer matching this spell id when set (Swiftmend picked aura). */
      spellId?: number;
      spellFamilyName: number;
      spellFamilyFlags: number;
      auraType: number;
      casterOnly?: boolean;
      /** 1 → RemoveAuraHolderFromStack; unset → RemoveAurasDueToSpell. */
      stacks?: number;
    }
  | { kind: 'zero_energy' }
  | { kind: 'threat_percent'; percent: number; target: 'unit' }
  | { kind: 'skip_effect'; reason: string }
  | {
      kind: 'max_stack_trigger';
      /** Spell id to cast for max-stack apply (Brittle Armor 24575, Mercurial 26464). */
      spellId: number;
    }
  | {
      // SPELL_AURA_MOD_DAMAGE_DONE_CREATURE (59): flat damage vs a creature-type mask.
      // Cite: Unit.cpp:7061 SpellDamageBonusDone; :7465 MeleeDamageBonusDone.
      kind: 'mod_damage_done_creature';
      amount: number;
      /** SharedDefines.h CREATURE_TYPE_MASK_*. */
      creatureTypeMask: number;
      durationMs: number;
    }
  | {
      // TRIGGER_SPELL custom targeting: formal caster = unitTarget (Lash 6608). Cite:
      // SpellEffects.cpp:1608–1612 EffectTriggerSpell.
      kind: 'trigger_spell_as_unit_target';
      spellId: number;
    }
  | {
      // A custom cast with forced base points. Multi-effect customs pass the parent spell id or extra
      // points in the later slots. Cite: SpellAuras.cpp:3468-3469; SpellEffects.cpp:4161.
      kind: 'cast_custom_spell';
      spellId: number;
      /** Effect 0 base points override (signed). */
      bp0: number;
      /** Effect 1 base points override when set (HL/FoL parent spell id, etc.). */
      bp1?: number;
      /** Effect 2 base points override when set. */
      bp2?: number;
    }
  | {
      // A plain cast from a dummy or class script, with no custom base points — the Holy Shock branch
      // and the judgement intermediates. Cite: SpellEffects.cpp:1449-1452.
      kind: 'cast_spell';
      spellId: number;
    }
  | {
      // CastSpell(id, TRIGGERED_*) without custom basepoints. Cite: SpellEffects.cpp Blood Fury 23230;
      // Cannibalize 20578.
      kind: 'cast_triggered_spell';
      spellId: number;
    }
  | {
      // Creature::setFaction from an instance-script dummy. The creature comes from instance storage, not
      // spell targeting. Cite: instance_dire_maul.cpp:670-681 GuardSlipkikTrigger.
      kind: 'set_creature_faction';
      creatureEntry: number;
      factionId: number;
    }
  // ── SI3 batch 1 intents (bake empty / non-effect surfaces) ──────────────
  | {
      /** SPELL_EFFECT_LEARN_SPELL (36). Cite: SpellEffects.cpp:2445–2465 / EffectLearnPetSpell :3386. */
      kind: 'learn_spell';
      spellId: number;
      /** Player unitTarget learns; non-player + player caster → pet path. */
      target: 'player' | 'pet';
    }
  | {
      /** SPELL_EFFECT_ENCHANT_ITEM (53). Bake honest-inert; misc = SpellItemEnchantment id. */
      kind: 'enchant_item_perm';
      enchantId: number;
    }
  | {
      /** SPELL_EFFECT_SUMMON_WILD (41). Cite: SpellEffects.cpp:2729+. */
      kind: 'summon_wild';
      creature: number;
      count: number;
      durationMs: number;
      /** Resolved level when ctx supplies casterLevel / creature level bounds. */
      level?: number;
      radiusIndex: number;
    }
  | {
      // Guardian summon extras: level, engineering skill and replace. The combat surface is the summon
      // effect with its creature, count and duration. Cite: SpellEffects.cpp:2820.
      kind: 'summon_guardian';
      creature: number;
      count: number;
      durationMs: number;
      // Player non-triggered recast unsummons existing guardians of this entry first; if found and spell
      // has no DurationIndex+Category, effect ends (no re-summon).
      replaceExisting: boolean;
      level?: number;
      /** Engineering trinket cast: level = skill/5 when set. */
      engineeringSkillLevel?: number;
    }
  | {
      /** SPELL_EFFECT_SUMMON_OBJECT_WILD (76). Cite: SpellEffects.cpp:3620+. */
      kind: 'summon_object_wild';
      goEntry: number;
      /** Respawn time seconds from spell duration (m_duration / IN_MILLISECONDS). */
      durationMs: number;
    }
  | {
      // SPELL_EFFECT_KNOCK_BACK (98). horizontal = EffectMiscValue/10, vertical = damage/10. Cite:
      // SpellEffects.cpp:5113–5121.
      kind: 'knock_back';
      horizontal: number;
      vertical: number;
    }
  | {
      // Open lock, shared between the spell and item forms: the amount is the LOCK SKILL, and the item
      // flag picks the path. Cite: SpellEffects.cpp:2204.
      kind: 'open_lock';
      skillBonus: number;
      fromItem: boolean;
      /** EffectMiscValue = LockType when non-zero. */
      lockType?: number;
    }
  | {
      /** SPELL_EFFECT_SEND_EVENT (61). StartEvents_Event(misc). Cite: SpellEffects.cpp:1794–1798. */
      kind: 'send_event';
      eventId: number;
    }
  // ── SI3 batch 2 intents ─────────────────────────────────────────────────
  | {
      // SPELL_EFFECT_SUMMON_CRITTER (97) — mini-pet / companion. Same-entry player recast despawns only
      // (count 0). Cite: SpellEffects.cpp:5031–5111.
      kind: 'summon_critter';
      creature: number;
      durationMs: number;
      /** True when same entry already summoned → RemoveMiniPet only. */
      despawnOnly: boolean;
    }
  | {
      // SPELL_EFFECT_ACTIVATE_OBJECT (86). action = EffectMiscValue as GameObjectActions. Cite:
      // SpellEffects.cpp:4377–4482; GameObject.h GameObjectActions.
      kind: 'activate_object';
      action: number;
      // Twilight Council MAKE_ACTIVE/MAKE_INERT summon table (spell id → NPC entry). Random rolls
      // (24734/24763/24784) need ctx.rng; fixed ids listed without roll.
      summonNpcEntry?: number;
      /** Onyxia Eruption 17731 OPEN/DISTURB → custom anim instead of Use. */
      customAnim?: boolean;
    }
  | {
      // SPELL_EFFECT_TRANS_DOOR (50) EffectTransmitted — summon GameObject by entry. Cite:
      // SpellEffects.cpp:5271–5420.
      kind: 'transmitted_object';
      goEntry: number;
      durationMs: number;
      // When ctx.gameObjectType is set, mirror type specials (fishing bobber duration offset, summoning
      // ritual at caster, …). Omit type → generic Create path.
      goType?: number;
      /** Fishing bobber: duration reduced by lastSec then + FISHING_BOBBER_READY_TIME*1000. */
      fishingBobberLastSec?: number;
    }
  | {
      // Devour Magic on successful dispel — CastSpell(heal). Cite: SpellEffects.cpp:2596–2612. Fires only
      // after at least one aura is removed (runtime EvaluateResultLists).
      kind: 'devour_magic_heal';
      healSpellId: number;
    }
  // ── SI3 batch 3 intents ─────────────────────────────────────────────────
  | {
      // SPELL_EFFECT_INSTAKILL (1). DealDamage(target health, INSTAKILL). Cite: SpellEffects.cpp:205–221.
      kind: 'instakill';
      /** Caster == unitTarget → finish() before damage (interrupt message suppress). */
      selfCast?: boolean;
    }
  | {
      // SPELL_EFFECT_SUMMON_PET (56) full body beyond bake `{ kind: 'summon_pet' }`. Cite:
      // SpellEffects.cpp:3227–3384.
      kind: 'summon_class_pet';
      creature: number;
      // hunter → LoadPetFromDB only; warlock → remove Demonic Sacrifice 2228 then load/create;
      // player_default → unsummon + load/create SUMMON_PET; npc → GUARDIAN_PET + level offset.
      path: 'hunter' | 'warlock' | 'player_default' | 'npc_guardian';
      /** Non-player: level = casterLevel + max(multipleValue, 1) when in range. */
      level?: number;
    }
  | {
      // SPELL_EFFECT_PROFICIENCY (60). Add weapon/armor proficiency mask for player. Cite:
      // SpellEffects.cpp:2314–2331; ItemPrototype.h ITEM_CLASS_WEAPON=2, ARMOR=4.
      kind: 'proficiency';
      itemClass: number;
      subClassMask: number;
    }
  | {
      // SPELL_EFFECT_DISPEL_MECHANIC (108). Remove auras with mechanic == misc. count from effect amount (0
      // → 1 via ProcessDispelList). Cite: SpellEffects.cpp:2499–2519 / ProcessDispelList :2521–2575.
      kind: 'dispel_mechanic';
      mechanic: number;
      count: number;
    }
  | {
      // SPELL_EFFECT_QUEST_COMPLETE (16). AreaExploredOrEventHappens(quest_id). Cite:
      // SpellEffects.cpp:4928–4935.
      kind: 'quest_complete';
      questId: number;
    }
  | {
      // SPELL_EFFECT_TELEPORT_GRAVEYARD (120). Nearest graveyard the target's team owns. Cite:
      // SpellEffects.cpp EffectTeleportGraveyard; BattleGround.h:85.
      kind: 'teleport_graveyard';
    }
  | {
      // SPELL_EFFECT_CHARGE (96). MoveCharge(target, speed); optional auto-attack. speed = SpellEntry.speed
      // != 0 ? speed : BASE_CHARGE_SPEED (27). Cite: SpellEffects.cpp:5009–5028; Unit.h BASE_CHARGE_SPEED.
      kind: 'charge';
      speed: number;
      /** Client-controlled caster + CanAttack → Attack(target). */
      initiateAutoAttack: boolean;
    }
  | {
      // SPELL_EFFECT_RESURRECT_NEW (113) via EffectResurrect. health = damage (flat), mana =
      // EffectMiscValue. Cite: SpellEffects.cpp:4797–4871.
      kind: 'resurrect_new';
      health: number;
      mana: number;
    }
  | {
      // SPELL_EFFECT_TELEPORT_UNITS (5). NearTeleport / TeleportTo dest. Requires TARGET_FLAG_DEST_LOCATION
      // at cast time. Cite: SpellEffects.cpp:1683–1728; SpellTargetDefines TARGET_LOCATION_DATABASE=17.
      kind: 'teleport_units';
      targetA: number;
      targetB: number;
      /** When set and differs from unit map → cross-map player TeleportTo. */
      mapId?: number;
      /** unitTarget taxi flying → early return. */
      skippedTaxiFlying?: boolean;
    }
  // ── SI3 batch 4 intents ─────────────────────────────────────────────────
  | {
      // SPELL_EFFECT_SPAWN (46). Clear UNIT_FLAG_SPAWNING for spell ids 15750 / 26262. Other spawn spells
      // are empty (client animation markers). Cite: SpellEffects.cpp:3037–3046.
      kind: 'spawn';
      /** True when this spell id removes UNIT_FLAG_SPAWNING on the caster. */
      clearSpawningFlag: boolean;
    }
  | {
      // SPELL_EFFECT_WEAPON (25) EffectEmpty — proficiency / usability marker only. Cite:
      // SpellEffects.cpp:190–193 EffectEmpty; dispatch table :83.
      kind: 'weapon_marker';
    }
  | {
      // SPELL_EFFECT_SUMMON_OBJECT_SLOT1–4 (104–107) EffectSummonObject. Replaces prior GO in
      // m_ObjectSlotGuid[slot]; SLOT1→0 SLOT2→1. Cite: SpellEffects.cpp:4734–4790; Unit.h:1979.
      kind: 'summon_object_slot';
      goEntry: number;
      /** 0..3 object slot index. */
      slot: number;
      durationMs: number;
    }
  | {
      // SPELL_EFFECT_ENCHANT_HELD_ITEM (92). Temp enchant on target player main-hand. duration cascade:
      // m_duration → base points → 10s; stored as seconds×1000. Cite: SpellEffects.cpp:4585–4635.
      kind: 'enchant_held_item';
      enchantId: number;
      durationMs: number;
      // Improved Weapon Totems (family mask 0x4000000): Windfury/Flametongue dummy modifier from owner
      // auras 29192/29193 when supplied on ctx.
      enchantmentModifier?: number;
    }
  | {
      // SPELL_EFFECT_INEBRIATE (100). drunk += damage×256, clamp 0xFFFF. Cite: SpellEffects.cpp:4666–4678.
      kind: 'inebriate';
      /** damage * 256 added to current drunk value. */
      drunkMod: number;
      /** Resulting drunk value when ctx.currentDrunk provided; else omit. */
      newDrunk?: number;
      /** Cast-item entry passed to SetDrunkValue when available. */
      castItemEntry?: number;
    }
  // ── SI3 batch 5 intents ─────────────────────────────────────────────────
  | {
      // SPELL_EFFECT_SUMMON (28) full body beyond bake `{ kind: 'summon_pet' }`. Creates GUARDIAN_PET;
      // early out if caster already has pet guid. Cite: SpellEffects.cpp:2343–2443.
      kind: 'summon_guardian_pet';
      creature: number;
      durationMs: number;
      /** Non-player: level = casterLevel + max(multipleValue, 1) when in range. */
      level?: number;
      /** True when GetPetGuid early-out (no summon). Cite: :2348–2349. */
      skippedExistingPet?: boolean;
    }
  | {
      // SPELL_EFFECT_LANGUAGE (39) EffectEmpty — misc stores language id. Cite: SpellEffects.cpp:97
      // dispatch → EffectEmpty :190–193.
      kind: 'language_marker';
      /** EffectMiscValue language id (chat). */
      languageId: number;
    }
  | {
      // SPELL_EFFECT_TELEPORT_UNITS_FACE_CASTER (43). NearTeleportTo(dest, -caster orientation). Requires
      // TARGET_FLAG_DEST_LOCATION. Cite: SpellEffects.cpp:2994–3006.
      kind: 'teleport_face_caster';
      targetA: number;
      targetB: number;
      /** unitTarget taxi flying → early return. Cite: :2996. */
      skippedTaxiFlying?: boolean;
      /** Missing dest location mask → no teleport. Cite: :3000–3003. */
      requiresDestLocation: true;
    }
  | {
      // SPELL_EFFECT_SKILL_STEP (44) EffectLearnSkill. SetSkillStep(skillId, step) where step = damage.
      // Cite: SpellEffects.cpp:3008–3024.
      kind: 'skill_step';
      skillId: number;
      /** uint16(damage) from effect amount. */
      step: number;
    }
  | {
      // SPELL_EFFECT_SUMMON_CHANGE_ITEM (34). Convert cast item → EffectItemType. Cite:
      // SpellEffects.cpp:2276–2312.
      kind: 'summon_change_item';
      newItemId: number;
    }
  | {
      // SPELL_EFFECT_RESURRECT (18) via EffectResurrect percent path. health = maxHealth * damage / 100;
      // mana = maxMana * damage / 100. Cite: SpellEffects.cpp:4797–4871 (computator :4819–4824).
      kind: 'resurrect';
      /** Effect amount used as percent (and as numerator with target max). */
      percent: number;
      /** Resolved when ctx.targetMaxHealth set. */
      health?: number;
      /** Resolved when ctx.targetMaxMana set. */
      mana?: number;
    }
  | {
      // SPELL_EFFECT_LEAP (29) EffectLeapForward. NearTeleportTo(dest, unit orientation). Cite:
      // SpellEffects.cpp:4895–4906.
      kind: 'leap';
      targetA: number;
      targetB: number;
    }
  | {
      // SPELL_EFFECT_TRADE_SKILL (47). Player unitTarget gate; body commented out. Cite:
      // SpellEffects.cpp:3048–3055.
      kind: 'trade_skill';
      /** EffectMiscValue skill id when non-zero (commented C++ referenced it). */
      skillId?: number;
    }
  | {
      // SPELL_EFFECT_SKILL (118). DEBUG_LOG only — marker for skill-line spells. Cite:
      // SpellEffects.cpp:5425–5428.
      kind: 'skill_marker';
    }
  // ── SI3 batch 6 intents ─────────────────────────────────────────────────
  | {
      // SPELL_EFFECT_ADD_FARSIGHT (72). Player caster creates DynamicObject FARSIGHT_FOCUS (radius 0) +
      // SetView. Cite: SpellEffects.cpp:2708–2727; DynamicObject.h DYNAMIC_OBJECT_FARSIGHT_FOCUS=0x2.
      kind: 'add_farsight';
      durationMs: number;
      /** Always 0 in C++ Create call — not a persistent aura radius. Cite: :2715–2717. */
      radius: 0;
      /** DynamicObjectType.DYNAMIC_OBJECT_FARSIGHT_FOCUS. */
      dynObjectType: 2;
    }
  | {
      // SPELL_EFFECT_SANCTUARY (79). InterruptSpellsCastedOnMe + CombatStop; Vanish family clears root +
      // detect timer. Cite: SpellEffects.cpp:4194–4211.
      kind: 'sanctuary';
      /** True when spell IsFitToFamily(SPELLFAMILY_ROGUE, 0x800) — Vanish path. Cite: :4203–4209. */
      vanishRogueSpecial: boolean;
      /** Vanish: SetCannotBeDetectedTimer(1000). Cite: :4208. */
      cannotBeDetectedMs?: number;
    }
  | {
      // Reputation: the simple value is the change and the misc value the faction, then the spell-source
      // gain and the modify. Cite: SpellEffects.cpp:4908-4926; Player.cpp:6293-6369.
      kind: 'reputation';
      factionId: number;
      /** m_currentBasePoints = EffectBasePoints + EffectBaseDice. */
      repChange: number;
      // After CalculateReputationGain when ctx supplies rate/aura mods; omit on bake-thin (world rate +
      // auras are runtime).
      finalRepChange?: number;
    }
  | {
      // SPELL_EFFECT_SUMMON_POSSESSED (73). TakePossessOf creature from EffectMiscValue at dest. Cite:
      // SpellEffects.cpp:4563–4583.
      kind: 'summon_possessed';
      creature: number;
      durationMs: number;
    }
  | {
      // SPELL_EFFECT_BIND_SIGHT (82) EffectNULL — DEBUG_LOG only, no server body. Cite:
      // SpellEffects.cpp:140 dispatch → EffectNULL :195–198.
      kind: 'bind_sight_null';
    }
  | {
      // SPELL_EFFECT_SUMMON_DEMON (112). Count = CalculateSimpleValue; creature = EffectMiscValue; level =
      // caster level; despawn 3_600_000 ms TIMED_OR_DEAD. Cite: SpellEffects.cpp:5430–5460.
      kind: 'summon_demon';
      creature: number;
      count: number;
      /** TEMPSPAWN_TIMED_OR_DEAD_DESPAWN 3600000. Cite: :5447. */
      durationMs: number;
      /** SetLevel(caster level) when ctx.casterLevel set. Cite: :5454. */
      level?: number;
    }
  | {
      // SPELL_EFFECT_PULL_TOWARDS (124). speedXY = max(1, EffectMiscValue) * 0.1; projectile motion toward
      // caster. Cite: SpellEffects.cpp:5132–5162; Movement::gravity util.cpp:24.
      kind: 'pull_towards';
      speedXY: number;
      // When ctx.pullDistance (+ optional pullHeightDelta) set: time = dist/speedXY; speedZ = (dz +
      // 0.5*t²*g)/t. Cite: :5156–5158.
      speedZ?: number;
      /** Distance used when computing speedZ. */
      distance?: number;
    }
  | {
      // SPELL_EFFECT_DODGE (20) EffectEmpty — client/marker only. Cite: SpellEffects.cpp:78 dispatch →
      // EffectEmpty :190–193.
      kind: 'dodge_marker';
    }
  | {
      /** SPELL_EFFECT_PARRY (22). SetCanParry(true) on caster. Cite: SpellEffects.cpp:4885–4888. */
      kind: 'can_parry';
    }
  | {
      /** SPELL_EFFECT_BLOCK (23). SetCanBlock(true) on caster. Cite: SpellEffects.cpp:4890–4893. */
      kind: 'can_block';
    }
  // ── SI3 batch 7 intents ─────────────────────────────────────────────────
  | {
      // SPELL_EFFECT_DEFENSE (26) EffectEmpty — skill-line marker only. Cite: SpellEffects.cpp:84 dispatch
      // → EffectEmpty :190–193.
      kind: 'defense_marker';
    }
  | {
      // SPELL_EFFECT_SPELL_DEFENSE (37) EffectEmpty — client/marker only. Cite: SpellEffects.cpp:95
      // dispatch → EffectEmpty :190–193.
      kind: 'spell_defense_marker';
    }
  | {
      // SPELL_EFFECT_DETECT (49) EffectUnused — no server body. Cite: SpellEffects.cpp:107 dispatch →
      // EffectUnused :200–203.
      kind: 'detect_unused';
    }
  | {
      // SPELL_EFFECT_PORTAL (12) EffectUnused — unused from pre-1.2.1. Cite: SpellEffects.cpp:70 dispatch →
      // EffectUnused :200–203.
      kind: 'portal_unused';
    }
  | {
      // SPELL_EFFECT_TAMECREATURE (55). Full pet build is OOC tame path. Cite: SpellEffects.cpp
      // EffectTameCreature :3149–3225.
      kind: 'tame_creature';
    }
  | {
      /** SPELL_EFFECT_SELF_RESURRECT (94). Cite: SpellEffects.cpp EffectSelfResurrect :4937–4968. */
      kind: 'self_resurrect';
      percent?: number;
      health?: number;
      mana?: number;
    }
  | {
      // SPELL_AURA_RETAIN_COMBO_POINTS (148). Cite: SpellAuras.cpp HandleAuraRetainComboPoints :4436–4452.
      kind: 'retain_combo_points';
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_PERIODIC_HEALTH_FUNNEL (62) transfer multiplier. Cite: SpellAuras.cpp PeriodicTick
      // :4606–4612, :4677.
      kind: 'periodic_health_funnel';
      multipleValue: number;
    }
  | {
      /** SPELL_AURA_MOD_ATTACKER_SPELL_CRIT_CHANCE (179). Cite: Unit.cpp GetCritTakenChance :3516–3536. */
      kind: 'mod_attacker_spell_crit_chance';
      amount: number;
      schoolMask: number;
      durationMs: number;
    }
  | {
      // Distract: clear the moving state, distract the creature for the amount in seconds, and face the
      // destination. Cite: SpellEffects.cpp:2640-2660.
      kind: 'distract';
      /** damage * 1000 — MoveDistract timer ms. */
      durationMs: number;
      /** unitTarget GetTypeId() == TYPEID_UNIT → MoveDistract path. */
      moveDistract: boolean;
    }
  | {
      // SPELL_EFFECT_PICKPOCKET (71). Create/refill LOOT_PICKPOCKETING and ShowContentTo player caster.
      // Cite: SpellEffects.cpp:2662–2706.
      kind: 'pickpocket';
      // When already pickpocketed and !CanRestockPickpocketLoot → LOOT_ERROR_ALREADY_PICKPOCKETED. Cite:
      // :2683–2696.
      alreadyPickpocketed?: boolean;
      /** Restock path when pickpocketed + CanRestockPickpocketLoot. Cite: :2685–2691. */
      restock?: boolean;
    }
  | {
      // SPELL_EFFECT_ATTACK (78) EffectUnused — no server body. Cite: SpellEffects.cpp:136 dispatch →
      // EffectUnused :200–203.
      kind: 'attack_unused';
    }
  | {
      // SPELL_EFFECT_DUEL (83). Create duel-flag GO at midpoint; SMSG_DUEL_REQUESTED; DuelInfo on both
      // players. Cite: SpellEffects.cpp:4227–4308.
      kind: 'duel';
      /** EffectMiscValue = duel flag GameObject entry. Cite: :4257. */
      flagGoEntry: number;
      /** Spell duration → GO respawn seconds when > 0. Cite: :4274. */
      durationMs: number;
      // Early-out reasons when cast-time ctx gates fail. Cite: :4229–4237 player/duel/ignore; :4240–4252
      // AREA_FLAG_DUEL.
      skipped?:
        | 'not_players'
        | 'already_dueling'
        | 'ignored'
        | 'area_no_duel';
    }
  | {
      // Stuck: a ghost repops at the graveyard, else the hearth when it is ready and carried, else a
      // dungeon entrance or a ten-yard nudge. Cite: SpellEffects.cpp:4310-4353.
      kind: 'stuck';
      path: 'graveyard' | 'hearthstone' | 'dungeon_entrance' | 'nudge';
      /** Hearthstone CastSpell id when path is hearthstone. Cite: :4336. */
      hearthSpellId?: number;
      /** Nudge distance DEFAULT_WORLD_OBJECT_SIZE path uses 10.0f. Cite: :4350. */
      nudgeDistance?: number;
    }
  // ── SI3 batch 8 intents ─────────────────────────────────────────────────
  | {
      // Durability damage in points or percent: the points path loses points and the percent path a
      // fraction. Cite: SpellEffects.cpp:5209-5260.
      kind: 'durability_damage';
      /** EffectMiscValue — equipment slot, or −1 all equipped / −2 equipped+inventory. */
      slot: number;
      /** `damage` points subtracted (effect 111). Cite: :5220 / :5232. */
      points?: number;
      /** `damage / 100` fraction (effect 115). Cite: :5247 / :5259. */
      percent?: number;
      /** slot < 0 → DurabilityPointsLossAll / DurabilityLossAll. Cite: :5218 / :5245. */
      allItems: boolean;
      /** slot < −1 → also damage bag contents. Cite: :5220 / :5247. */
      includeInventory: boolean;
    }
  | {
      // SPELL_EFFECT_ATTACK_ME (114) AI path when unit cannot have a threat list. Cite:
      // SpellEffects.cpp:3437–3440 AttackStart(m_caster).
      kind: 'attack_me_ai';
    }
  | {
      // Remove Insignia: an online owner is stripped of theirs, while a corpse alone is converted and
      // its insignia loot shown. Cite: SpellEffects.cpp:5499-5542.
      kind: 'skin_player_corpse';
      path: 'removed_insignia' | 'corpse_bones_loot';
    }
  // ── SI3 aura batch intents ────────────────────────────────────────────────
  | {
      // Flat healing done, by school mask. The C++ body is client-field only on Classic, and the bake
      // has no flat healing-done mod yet. Cite: SpellAuras.cpp:3528-3535.
      kind: 'mod_healing_done';
      amount: number;
      schoolMask: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOUNTED (78). Mount creature template → display model. miscValue = creature entry;
      // display resolved at runtime via ChooseDisplayId. Cite: SpellAuras.cpp:1629–1656 HandleAuraMounted.
      kind: 'mounted';
      creatureEntry: number;
    }
  | {
      // SPELL_AURA_DUMMY (4) spell-id / family specials. Bake maps aura 4 to empty; specials are pure
      // intents for SI5+. Cite: SpellAuras.cpp:1229–1620 HandleAuraDummy; PeriodicDummyTick :5025.
      kind: 'aura_dummy';
      /** Spell id that triggered this special (holder spell). */
      spellId: number;
      action:
        | 'periodic'
        | 'cast_spell'
        | 'remove_aura'
        | 'sleep_visual'
        | 'feign_death'
        | 'seal_crusader_dps'
        | 'quest_tame_final'
        | 'combustion_clear_stacks'
        | 'predatory_strikes_ap'
        | 'interrupt_channel_on_death';
      /** Triggered / final spell id when action casts or removes. */
      relatedSpellId?: number;
      /** Periodic timer ms when action is periodic. */
      periodMs?: number;
      /** Per-tick / per-apply roll in percent when the C++ body gates on roll_chance_i. */
      chancePct?: number;
      /** Seal of the Crusader BASE_ATTACK DPS percent (40). */
      dpsPct?: number;
      /** When the special fires (apply / remove / both / remove modes). */
      on?: 'apply' | 'remove' | 'both' | 'remove_expire' | 'remove_death' | 'remove_dispel';
    }
  | {
      // SPELL_AURA_MOD_STUN (12) frost freeze state / Wyvern Sting aftermath. Cite:
      // SpellAuras.cpp:2453–2575 HandleAuraModStun.
      kind: 'mod_stun_special';
      /** Frost school stun → AURA_STATE_FROZEN on apply. Cite: :2461–2462. */
      frostFreeze?: boolean;
      /** Wyvern Sting sleep spell cast on stun remove (family flag 0x10000 ranks). Cite: :2530–2554. */
      wyvernStingSleepSpellId?: number;
      // Boss Wyvern Sting 26180 → CastCustomSpell 26233 nature damage on remove. Cite: :2558–2565 (500
      // expire / 3000 dispel).
      wyvernBossNatureDamage?: { expire: number; dispel: number };
    }
  | {
      // SPELL_AURA_PERIODIC_TRIGGER_SPELL (23) remove-time specials. Cite: SpellAuras.cpp:3092–3111
      // HandlePeriodicTriggerSpell.
      kind: 'periodic_trigger_remove';
      /** Spells cast on aura remove (Burning Adrenaline 18173/23620 → 23478+23644). */
      castSpellIds: number[];
    }
  | {
      // The full proc metadata for the fire path. The bake surface is also emitted as a proc trigger or
      // damage shield. Cite: UnitAuraProcHandler.cpp:515-650, :1242; Unit.cpp:7717.
      kind: 'proc_trigger_spell';
      /** Holder aura spell id. */
      holderSpellId: number;
      // Spell cast on successful proc (after LShield / family id rewrites). Cite:
      // UnitAuraProcHandler.cpp:1255 EffectTriggerSpell path.
      triggerSpellId: number;
      // Effective EventProcFlag (spell_proc_event.procFlags || spell_template.procFlags). Cite:
      // UnitAuraProcHandler.cpp:523–526.
      procFlags: number;
      /** spell_proc_event.procEx when non-zero. */
      procEx?: number;
      // Flat chance as percent 0..100 (ProcChance / CustomChance). Cite: UnitAuraProcHandler.cpp:590–595.
      chancePct: number;
      // spell_proc_event.ppmRate — when set, replaces flat chance via GetPPMProcChance. Cite:
      // UnitAuraProcHandler.cpp:596–600; Unit.cpp:7717.
      ppmRate?: number;
      // Internal cooldown ms (spell_proc_event.Cooldown baked as cooldownMs). Cite:
      // UnitAuraProcHandler.cpp:431–435 SetProcCooldown.
      cooldownMs?: number;
      charges?: number;
      amount?: number;
      schoolMask?: number;
      spellFamilyName?: number;
      spellFamilyMask?: number[];
      // When ctx.procEvent + rng supplied: whether this interpret rolled a fire. Absent on bake-thin (no
      // event).
      fired?: boolean;
      /** After successful fire with cooldownMs: nowMs + cooldownMs. */
      cooldownReadyAt?: number | null;
    }
  | {
      // A successful proc: interpret the triggered spell through the dispatcher. Emitted only when the
      // context resolves the trigger and the roll fired. Cite: UnitAuraProcHandler.cpp:698-725.
      kind: 'proc_triggered_cast';
      triggerSpellId: number;
      /** Normalized effects from interpretSpell(trigger). */
      effects: import('../../../data/schema.ts').SpellEffect[];
    }
  // ── SI3 aura batch 2 intents ──────────────────────────────────────────────
  | {
      // SPELL_AURA_MOD_ROOT (26) frost freeze state on apply/remove. Cite: SpellAuras.cpp:2727–2775
      // HandleAuraModRoot.
      kind: 'mod_root_special';
      /** Frost school root → AURA_STATE_FROZEN. Cite: :2737–2739 / :2748–2765. */
      frostFreeze?: boolean;
    }
  | {
      // Modify a skill bonus, temporary for aura 30 and permanent for the talent form 98.
      // Cite: SpellAuras.cpp:2055-2067 HandleAuraModSkill.
      kind: 'mod_skill';
      skillId: number;
      amount: number;
      permanent: boolean;
      durationMs: number;
    }
  | {
      // A display model change from a creature entry. The bake also maps a hostile transform as a
      // breakable incapacitate. Cite: SpellAuras.cpp:1979-2052 HandleAuraTransform.
      kind: 'transform';
      /** EffectMiscValue creature template entry (0 → script/custom amount). Cite: :1988–2007. */
      creatureEntry: number;
      // Missing creature template fallback display id (pig pink). Cite: SpellAuras.cpp:2003
      // m_modifier.m_amount = 16358.
      missingCreatureDisplayId?: number;
    }
  | {
      // SPELL_AURA_MECHANIC_IMMUNITY (77) apply-time purge when SPELL_ATTR_EX_IMMUNITY_PURGES_EFFECT is
      // set. mechanicMask = 1 << (misc − 1). Cite: SpellAuras.cpp:2936–2948.
      kind: 'mechanic_immunity_purge';
      mechanic: number;
      mechanicMask: number;
    }
  // ── SI3 aura batch 3 intents ──────────────────────────────────────────────
  | {
      // SPELL_AURA_MOD_SCALE (61). ApplyPercentModFloatValue(OBJECT_FIELD_SCALE_X). Cosmetic / model scale
      // only — no bake SpellEffect. Cite: SpellAuras.cpp:2182–2185 HandleAuraModScale.
      kind: 'mod_scale';
      /** Signed percent from base points (e.g. +10 → 10% larger). Cite: :2184. */
      pct: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_SCHOOL_IMMUNITY (39) apply-time specials beyond the baked school_immunity effect. Cite:
      // SpellAuras.cpp:2992–3043 HandleAuraModSchoolImmunity.
      kind: 'school_immunity_special';
      schoolMask: number;
      // Positive immunity + SPELL_ATTR_EX_IMMUNITY_PURGES_EFFECT → remove negative auras matching school
      // mask. Cite: :3002–3023.
      purgeNegativeSchoolAuras?: boolean;
      // Spell mechanic MECHANIC_BANISH → UNIT_STAT_ISOLATED. Cite: :3025–3030; SharedDefines.h
      // MECHANIC_BANISH = 18.
      isolated?: boolean;
    }
  | {
      // Dispel immunity by type, with an optional purge; the bake leaves it empty.
      // Cite: SpellAuras.cpp:3053-3059; Unit.cpp:7697-7702 ApplySpellDispelImmunity.
      kind: 'dispel_immunity';
      /** EffectMiscValue = DispelType. Cite: :3059. */
      dispelType: number;
      durationMs: number;
      // On apply + SPELL_ATTR_EX_IMMUNITY_PURGES_EFFECT → RemoveAurasWithDispelType. Cite:
      // Unit.cpp:7701–7702. Gate: ctx.immunityPurgesEffect === true.
      purgeDispelType?: boolean;
    }
  | {
      // SPELL_AURA_ADD_FLAT_MODIFIER (107). Player AddSpellMod(SpellModifier(op, SPELLMOD_FLAT, amount,
      // …)). Bake leaves empty (talent path only). Cite: SpellAuras.cpp:899–939.
      kind: 'add_flat_modifier';
      /** EffectMiscValue = SpellModOp. Cite: :924–925; SpellDefines.h MAX_SPELLMOD=32. */
      spellModOp: number;
      /** Flat modifier amount (base points). Cite: :927. */
      amount: number;
      durationMs: number;
      /** EffectItemType family mask. Cite: SpellMgr.h GetSpellAffectMask. */
      familyFlags?: number;
      /** Aura charges override (Shadow Trance / Netherwind Focus → 1). Cite: :915–918 SetAuraCharges(1). */
      auraCharges?: number;
      /** Spell priority override (Clearcasting 16246 → 100). Cite: :919–921. */
      priority?: number;
    }
  | {
      // The health transfer of a periodic leech to the caster: the bake maps a plain dot only, and the
      // heal is the damage times the multiple value. Cite: SpellAuras.cpp:4592-4682.
      kind: 'periodic_leech_heal';
      /** EffectMultipleValue (≤0 → 1.0). Cite: :4645. */
      multipleValue: number;
    }
  | {
      // SPELL_AURA_MOD_DAMAGE_PERCENT_DONE (79) expire special. Cite: SpellAuras.cpp:4170–4172 (id 30423 →
      // cast 38639 on expire).
      kind: 'mod_damage_percent_done_expire';
      castSpellId: number;
    }
  // ── SI3 aura batch 4 intents ──────────────────────────────────────────────
  | {
      // Hit chance: a player recomputes all three weapon hit chances from every hit aura, an NPC adds
      // the amount to each. The bake has no hit mod. Cite: SpellAuras.cpp:3850-3866.
      kind: 'mod_hit_chance';
      /** Signed percent points from base points (e.g. −50 hit). Cite: :3862–3864. */
      amount: number;
      durationMs: number;
      // When true, target is non-player — flat ±amount on m_modWeaponHitChance[3]. Omit / false → player
      // recompute path. Gate: ctx.unitTargetIsPlayer === false. Cite: SpellAuras.cpp:3854–3865.
      nonPlayerFlat?: boolean;
    }
  | {
      // Melee attack power against a creature type mask, added in the damage-done path. Unmapped in the
      // bake. Cite: SpellAuras.cpp:163; Unit.cpp:7475-7476.
      kind: 'mod_melee_attack_power_versus';
      /** EffectMiscValue = creature type mask bitfield. Cite: Unit.cpp:7476. */
      creatureTypeMask: number;
      /** Flat melee AP bonus vs matching creature types. */
      amount: number;
      durationMs: number;
    }
  | {
      // The apply-time interrupt of casts with the silence prevention type. The bake surface is the
      // silence itself; this documents the interrupt loop. Cite: SpellAuras.cpp:2787-2794.
      kind: 'mod_silence_interrupt';
    }
  | {
      // SPELL_AURA_MOD_CHARM (6) side-switch / charm ownership. Bake surface is cc incapacitate+charm; this
      // intent carries TakeCharmOf path. Cite: SpellAuras.cpp:2282–2329 HandleModCharm.
      kind: 'mod_charm';
      /** Spell id of the charm holder (GetId()). Cite: :2307 TakeCharmOf(target, GetId()). */
      spellId: number;
      durationMs: number;
      // Player caster BreakCharmOutgoing(true) before TakeCharmOf (unique advertised charm). Gate:
      // ctx.casterIsPlayer !== false. Cite: :2304–2305.
      breakOutgoing?: boolean;
      // TakeCharmOf advertised flag. false = HandleAoECharm private set (co-exists). Cite:
      // SpellAuras.cpp:2346–2348 TakeCharmOf(target, GetId(), false); Unit.cpp:11350.
      advertised?: boolean;
    }
  // ── SI3 aura batch 5 intents ──────────────────────────────────────────────
  | {
      // Ranged attack power against a creature type mask, for ranged attacks only. Unmapped in the bake.
      // Cite: SpellAuras.cpp:192; Unit.cpp:7469-7471.
      kind: 'mod_ranged_attack_power_versus';
      /** EffectMiscValue = creature type mask bitfield. Cite: Unit.cpp:7471. */
      creatureTypeMask: number;
      /** Flat ranged AP bonus vs matching creature types. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_INVISIBILITY (18). AddInvisibilityValue(misc, ±amount); mask when value > 0;
      // visibility group. Bake unmapped. Cite: SpellAuras.cpp:2626–2675 HandleInvisibility.
      kind: 'mod_invisibility';
      /** EffectMiscValue = invisibility type / mask bit. Cite: :2630. */
      invisibilityType: number;
      /** Strength amount (base points). Cite: :2630. */
      amount: number;
      durationMs: number;
    }
  | {
      // Block percent: a player recomputes the block chance, an NPC adds the amount. The bake has no
      // block mod. Cite: SpellAuras.cpp:3789-3800.
      kind: 'mod_block_percent';
      /** Signed percent points from base points. */
      amount: number;
      durationMs: number;
      // When true, target is non-player — flat ±amount on m_modBlockChance. Gate: ctx.unitTargetIsPlayer
      // === false. Cite: :3793–3796.
      nonPlayerFlat?: boolean;
    }
  | {
      // Crit percent: with an equipped-item class of -1 it lands flat on all three, otherwise it takes
      // the weapon-dependent path. The bake is empty. Cite: SpellAuras.cpp:3815-3848.
      kind: 'mod_crit_percent';
      /** Signed percent points from base points (e.g. Recklessness +100). */
      amount: number;
      durationMs: number;
      // When true, target is non-player — flat ±amount on all m_modCritChance. Gate: ctx.unitTargetIsPlayer
      // === false. Cite: :3819–3823.
      nonPlayerFlat?: boolean;
      // Spell EquippedItemClass. −1 / omit → apply all three crit base mods. Non−1 → weapon-dependent equip
      // apply (SI5). Cite: :3838–3847.
      equippedItemClass?: number;
    }
  | {
      // The caster's power gain from a periodic mana leech, plus its expiry specials. The bake carries
      // the negative restore on the victim only. Cite: SpellAuras.cpp:4740-4807.
      kind: 'periodic_mana_leech';
      /** Powers(misc) — 0 mana default. Cite: :4747–4750. */
      powerType: number;
      /** EffectMultipleValue gain multiplier (0 → no caster gain). Cite: :4791. */
      multipleValue: number;
      // On expire cast Sleep 24004 (Tranquilizing Poison 24002/24003 only). Cite: SpellAuras.cpp:3274–3280.
      expireCastSpellId?: number;
    }
  | {
      // Resistance percent per school bit — a percent, not flat armor, and unmapped in the bake.
      // Cite: SpellAuras.cpp:3388-3408 HandleModResistancePercent.
      kind: 'mod_resistance_pct';
      /** EffectMiscValue = SpellSchoolMask. Cite: :3397. */
      schoolMask: number;
      /** Signed percent (TOTAL_PCT). Cite: :3400. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_SHAPESHIFT (36) apply-time extras beyond bake `{ kind:'shapeshift' }`. Cite:
      // SpellAuras.cpp:1709–1976 HandleAuraModShapeshift; :4223–4344 HandleShapeshiftBoosts.
      kind: 'mod_shapeshift';
      /** EffectMiscValue = ShapeshiftForm. Cite: :1714. */
      form: number;
      // Powers enum when form changes resource (1=rage, 3=energy). Omit = mana / no change. Cite:
      // :1723–1794.
      powerType?: number;
      // Display model id when form has a fixed model (race-independent). Race-split forms use
      // displayIdAlliance / displayIdHorde instead. Cite: :1727–1797.
      displayId?: number;
      displayIdAlliance?: number;
      displayIdHorde?: number;
      /** Triggered form-passive spell ids on apply (HandleShapeshiftBoosts). Cite: :4235–4273. */
      boostSpellIds?: number[];
      /** Heart of the Wild custom spell id when form supports it. Cite: :4237–4256 / :4315–4326. */
      hotWSpellId?: number;
      // Cat/Tree/Travel/Aqua/Bear/Direbear/Moonkin: strip root + slow auras (mechanic filter). Cite:
      // :1805–1841.
      removeRootAndSlow?: boolean;
      /** Ghostwolf + above: strip WATER_WALK. Cite: :1845–1850. */
      removeWaterWalk?: boolean;
      /** Spirit Shade Visual 24809 uses caster native display (not moonkin model). Cite: :1767–1774. */
      spiritShadeNativeDisplay?: boolean;
      /** FORM_CAT: Track Humanoids 5225 if known and no other tracking. Cite: :1940–1942. */
      trackHumanoidsSpellId?: number;
      /** FORM_CAT furor proc spell. Cite: :1959–1963. */
      furorEnergySpellId?: number;
      /** FORM_BEAR / DIREBEAR furor proc spell. Cite: :1967–1969. */
      furorRageSpellId?: number;
    }
  // ── SI3 aura batch 6 intents ──────────────────────────────────────────────
  | {
      // SPELL_AURA_MOD_INVISIBILITY_DETECTION (19). SetInvisibilityDetectMask/Value; on remove re-max among
      // remaining auras. Bake unmapped. Cite: SpellAuras.cpp:2677–2717 HandleInvisibilityDetect.
      kind: 'mod_invisibility_detection';
      /** EffectMiscValue = invisibility type / mask bit. Cite: :2687. */
      invisibilityType: number;
      /** Detection strength amount. Cite: :2681 / :2689. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_TRACK_CREATURES (44). Player-only: SetFlag/RemoveFlag PLAYER_TRACK_CREATURES bit
      // (misc−1). Bake empty. Cite: SpellAuras.cpp:2152–2161.
      kind: 'track_creatures';
      /** EffectMiscValue = creature type id (1-based bit index). Cite: :2158. */
      creatureType: number;
      /** Bit mask = 1 << (creatureType − 1). Cite: :2158. */
      trackFlag: number;
      durationMs: number;
    }
  | {
      // On a real remove by death only, store the named item for a player caster. The Soul Shard has its
      // own honor, tapped and single-shard guards. Cite: SpellAuras.cpp:2070-2123.
      kind: 'channel_death_item';
      /** EffectItemType — item entry granted on death. Cite: :2081 / :2089. */
      itemType: number;
      /** m_amount item count (≤0 → no grant). Cite: :2077–2078 / :2109. */
      count: number;
      /** itemType === 6265 Soul Shard specials (honor/XP + tapped + de-dupe). Cite: :2092–2104. */
      soulShard?: boolean;
    }
  | {
      // SPELL_AURA_MOD_HEALTH_REGEN_PERCENT (88). NoImmediateEffect: out-of-combat spirit HP regen ×
      // (100+amount)/100. Bake unmapped. Cite: SpellAuras.cpp:149; Player.cpp:2395–2398.
      kind: 'mod_health_regen_percent';
      /** Signed percent of out-of-combat HP regen (Rabies −50). Cite: Player.cpp:2397. */
      amount: number;
      durationMs: number;
    }
  | {
      // Target resistance: the attacker's penetration is the negated modifier by mask, used in the armor
      // and resist reductions. Cite: SpellAuras.cpp:184; Unit.cpp:3890-3895, :2329.
      kind: 'mod_target_resistance';
      /** EffectMiscValue = SpellSchoolMask. Cite: Unit.cpp:3894. */
      schoolMask: number;
      // Signed aura amount (typically negative, e.g. −700 armor pen). Penetration = −sum(amount) per school
      // bit. Cite: Unit.cpp:3894.
      amount: number;
      durationMs: number;
    }
  | {
      // Shield block value as a FLAT modifier; the percent form is aura 150. The bake is empty.
      // Cite: SpellAuras.cpp:4426-4433 HandleShieldBlockValue.
      kind: 'mod_shield_blockvalue';
      /** Flat shield block value points. Cite: :4433. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_SHIELD_BLOCKVALUE_PCT (150). Player HandleBaseModValue(SHIELD_BLOCK_VALUE, PCT_MOD,
      // amount). Cite: SpellAuras.cpp:4426–4433 HandleShieldBlockValue.
      kind: 'mod_shield_blockvalue_pct';
      amount: number;
      durationMs: number;
    }
  | {
      // The stamina health rescale on a percent-stat aura flagged as an ability: current health keeps
      // its fraction of the new maximum. Cite: SpellAuras.cpp:3561-3567.
      kind: 'mod_total_stat_pct_stamina_hp_scale';
    }
  // ── SI3 aura batch 7 intents ──────────────────────────────────────────────
  | {
      // A percent spell modifier, sharing its handler with the flat form. The bake leaves it empty.
      // Cite: SpellAuras.cpp:899-939 HandleAddModifier.
      kind: 'add_pct_modifier';
      /** EffectMiscValue = SpellModOp. Cite: :924–925; SpellDefines.h MAX_SPELLMOD=32. */
      spellModOp: number;
      /** Percent modifier amount (base points). Cite: :927. */
      amount: number;
      durationMs: number;
      /** EffectItemType family mask. Cite: SpellMgr.h GetSpellAffectMask. */
      familyFlags?: number;
      /** Aura charges override (Shadow Trance / Netherwind Focus → 1). Cite: :915–918 SetAuraCharges(1). */
      auraCharges?: number;
      /** Spell priority override (Clearcasting 16246 → 100). Cite: :919–921. */
      priority?: number;
    }
  | {
      // The apply-time current-health specials of a flat max-health aura. The bake surface is the flat
      // maximum; these flags document the C++ id branches. Cite: SpellAuras.cpp:3658-3716.
      kind: 'mod_increase_health_special';
      // Ids 4148 / 12976 / 16609: on apply ModifyHealth(+amount); on remove clamp current HP then drop max.
      // Cite: :3671–3695.
      currentHealthAdjust?: boolean;
      // Bear / Dire Bear form passives 1178 / 9635: preserve health % across max change. Cite: :3698–3707.
      preserveHealthPercent?: boolean;
    }
  | {
      // The main-hand attack-time reset on a disarm, skipped for a feral target with no weapon form.
      // Cite: SpellAuras.cpp:2438-2450; Unit.h:68 base attack time.
      kind: 'mod_disarm_attack_time';
      /** Apply path: SetAttackTime(BASE_ATTACK, BASE_ATTACK_TIME). Cite: :2444–2445. */
      baseAttackTimeMs: number;
    }
  | {
      // SPELL_AURA_MOD_MECHANIC_RESISTANCE (117). NoImmediateEffect: full-resist chance vs spell/effect
      // mechanic (misc). Bake unmapped. Cite: SpellAuras.cpp:178; Unit.cpp:4015–4031.
      kind: 'mod_mechanic_resistance';
      /** EffectMiscValue = mechanic id. Cite: Unit.cpp:4016. */
      mechanic: number;
      /** Signed resist chance percent points. Cite: Unit.cpp:4016 / :4026. */
      amount: number;
      durationMs: number;
    }
  // ── SI3 aura batch 8 intents ──────────────────────────────────────────────
  | {
      // SPELL_AURA_MOD_POSSESS (2) side-switch / possess ownership. Bake surface is cc incapacitate+charm;
      // this intent carries TakePossessOf. Cite: SpellAuras.cpp:2188–2256 HandleModPossess.
      kind: 'mod_possess';
      /** Spell id of the possess holder (GetId()). Cite: :2222 TakePossessOf. */
      spellId: number;
      durationMs: number;
      // Player caster BreakCharmOutgoing(true) before TakePossessOf. Gate: ctx.casterIsPlayer !== false.
      // Cite: :2200 / :2219–2220.
      breakOutgoing?: boolean;
      // Spell 24937 Using Control Console apply: creature UpdateSpell slot 5 from {25026, 25024, 27759,
      // 25027}. Needs ctx.rng for pick. Cite: :2209–2214.
      controlConsoleApplySpells?: readonly number[];
      // Spell 24937 remove: caster casts these on self. Cite: :2245–2246. 24938 Close Control Console,
      // 27880 Stun.
      controlConsoleRemoveCasterSpells?: readonly number[];
      // Spell 24937 remove on creature target: Quiet Suicide 3617 + ForcedDespawn(5000). Cite: :2249–2250.
      controlConsoleRemoveTargetSpell?: number;
      controlConsoleDespawnMs?: number;
    }
  | {
      // SPELL_AURA_MOD_INCREASE_HEALTH_PERCENT (133) Mutate Bug apply-time ModifyHealth(+maxDelta). Cite:
      // SpellAuras.cpp:3748–3753.
      kind: 'mod_increase_health_percent_special';
      /** Spell 802: on apply ModifyHealth(GetMaxHealth() − oldMaxHealth). */
      mutateBugHealthGain?: boolean;
    }
  | {
      // The percent of spirit regen allowed while casting, clamped at 100 and unmapped in the bake.
      // Cite: SpellAuras.cpp:3803-3812; StatSystem.cpp:558-562.
      kind: 'mod_mana_regen_interrupt';
      /** Percent of spirit-based mana regen retained while casting. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_STALKED (68). SetFlag/RemoveFlag UNIT_DYNFLAG_TRACK_UNIT (Hunter's Mark, Mind
      // Vision). Bake unmapped. Cite: SpellAuras.cpp:3079–3086; SharedDefines.h UNIT_DYNFLAG_TRACK_UNIT.
      kind: 'mod_stalked';
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_RANGED_DAMAGE_TAKEN (113). NoImmediateEffect: MeleeDamageBonusTaken TakenFlat for
      // RANGED_ATTACK. Bake unmapped. Cite: SpellAuras.cpp:174; Unit.cpp:7615–7617.
      kind: 'mod_ranged_damage_taken';
      /** Flat ranged damage taken modifier (signed base points). */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_OBS_MOD_MANA (21) remove special for Shade of Aran drink. Cite: SpellAuras.cpp:3603–3609
      // — id 30024 AURA_REMOVE_BY_DEFAULT → AI event.
      kind: 'obs_mod_mana_remove_special';
      /** Spell id that fires the AI event on default remove. */
      spellId: number;
    }
  // ── SI3 aura batch 9 intents ──────────────────────────────────────────────
  | {
      // SPELL_AURA_MOD_SPELL_CRIT_CHANCE (57). Real only. Player: UpdateAllSpellCritChances(); NPC: ±amount
      // all schools. Bake empty. Cite: SpellAuras.cpp:3873–3889; StatSystem.cpp:505–515 / :541–545.
      kind: 'mod_spell_crit_chance';
      /** Signed percent points from base points. */
      amount: number;
      durationMs: number;
      // When true, target is non-player — flat ±amount on m_modSpellCritChance[school]. Gate:
      // ctx.unitTargetIsPlayer === false. Cite: :3881–3886.
      nonPlayerFlat?: boolean;
    }
  | {
      // SPELL_AURA_MOD_SPELL_CRIT_CHANCE_SCHOOL (71). Real only. Per school bit in misc mask: NPC flat or
      // player UpdateSpellCritChance. Bake empty. Cite: SpellAuras.cpp:3891–3911; StatSystem.cpp:512–513.
      kind: 'mod_spell_crit_chance_school';
      /** EffectMiscValue = SpellSchoolMask. Cite: :3899. */
      schoolMask: number;
      /** Signed percent points from base points. */
      amount: number;
      durationMs: number;
      // When true, target is non-player — flat ±amount per matching school. Gate: ctx.unitTargetIsPlayer
      // === false. Cite: :3902–3906.
      nonPlayerFlat?: boolean;
    }
  | {
      // SPELL_AURA_MOD_LANGUAGE (75). NoImmediateEffect: chat lang overwrite from front aura misc. Bake
      // unmapped. Cite: SpellAuras.cpp:136; ChatHandler.cpp:151–155.
      kind: 'mod_language';
      /** EffectMiscValue = language id (LANG_*). Cite: ChatHandler.cpp:154–155. */
      languageId: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_WATER_BREATHING (82). Player: SetWaterBreathingIntervalMultiplier(0) while any such aura
      // present. Bake empty. Cite: SpellAuras.cpp:1688–1699.
      kind: 'water_breathing';
      // Interval multiplier while aura applies (0 = infinite breath). Cite: :1694–1695
      // SetWaterBreathingIntervalMultiplier(0).
      intervalMultiplier: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_DETECT_RANGE (91). NoImmediateEffect: attackDistance += GetTotalAuraModifier on the
      // *creature*. Bake unmapped. Cite: SpellAuras.cpp:152; Unit.cpp:11772.
      kind: 'mod_detect_range';
      /** Signed yards (Mind Soothe −10). Cite: Unit.cpp:11772. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_OVERRIDE_CLASS_SCRIPTS (112). RegisterOverrideScriptAura(this, miscValue, apply). Bake
      // empty. Cite: SpellAuras.cpp:5096–5099; Unit.cpp:11980–11985.
      kind: 'override_class_scripts';
      /** EffectMiscValue = script id key in m_classScripts. Cite: :5098. */
      scriptId: number;
      /** m_amount carried for script consumers (Tactical Mastery rage, etc.). */
      amount: number;
      durationMs: number;
    }
  | {
      // Force reaction: apply the forced rank for a faction, and stop attacking once the effective rank
      // is friendly. Unmapped in the bake. Cite: SpellAuras.cpp:2034-2052.
      kind: 'force_reaction';
      /** EffectMiscValue = faction template id. Cite: :2043. */
      factionId: number;
      /** m_amount cast to ReputationRank. Cite: :2044. */
      reputationRank: number;
      durationMs: number;
      /** apply && rank ≥ REP_FRIENDLY → StopAttackFaction. Cite: :2050–2051; SharedDefines.h:110. */
      stopAttackFaction?: boolean;
    }
  | {
      // The cast-time spell-power fold into a mana shield's pool for the mage family, omitted on a thin
      // bake. Cite: SpellAuras.cpp:5063-5093; Unit.cpp:2791-2794.
      kind: 'mana_shield_spd_bonus';
      /** Integer absorb points added to m_amount. Cite: :5091. */
      bonusAmount: number;
    }
  // ── SI3 aura batch 10 intents ─────────────────────────────────────────────
  | {
      // SPELL_AURA_EFFECT_IMMUNITY (37). ApplySpellImmune(IMMUNITY_EFFECT, misc); positive apply purges
      // invuln buffs. Bake empty. Cite: SpellAuras.cpp:2962–2970.
      kind: 'effect_immunity';
      /** EffectMiscValue = SpellEffects enum id. Cite: :2966. */
      effectId: number;
      durationMs: number;
      // apply + IsPositive → RemoveAurasWithInterruptFlags INVULNERABILITY. Cite: :2968–2969. Always true
      // at interpret (positive immunity buffs).
      purgeInvulnerabilityBuffs?: boolean;
    }
  | {
      // SPELL_AURA_STATE_IMMUNITY (38). ApplySpellImmune(IMMUNITY_STATE, misc); optional purge of that
      // AuraType. Bake empty. Cite: SpellAuras.cpp:2972–2989.
      kind: 'state_immunity';
      /** EffectMiscValue = AuraType id to be immune to. Cite: :2989. */
      auraType: number;
      durationMs: number;
      // apply + Real + SPELL_ATTR_EX_IMMUNITY_PURGES_EFFECT → remove auras of type. Gate:
      // ctx.immunityPurgesEffect === true. Cite: :2974–2987.
      purgeAuraType?: boolean;
    }
  | {
      // SPELL_AURA_TRACK_RESOURCES (45). Player-only: SetFlag/RemoveFlag PLAYER_TRACK_RESOURCES bit
      // (misc−1). Bake empty. Cite: SpellAuras.cpp:2163–2171.
      kind: 'track_resources';
      /** EffectMiscValue = resource type id (1-based bit index). Cite: :2169. */
      resourceType: number;
      /** Bit mask = 1 << (resourceType − 1). Cite: :2169. */
      trackFlag: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_PREVENTS_FLEEING (92). Real: if fear auras present, SetFleeing(false) on apply / restore
      // on remove. Bake empty. Cite: SpellAuras.cpp:5047–5060 HandlePreventFleeing.
      kind: 'prevents_fleeing';
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_FLAT_SPELL_DAMAGE_VERSUS (180). NoImmediateEffect: SpellDamageBonusDone DoneTotal +=
      // GetTotalAuraModifierByMiscMask. Bake empty. Cite: SpellAuras.cpp:241; Unit.cpp:7055.
      kind: 'mod_flat_spell_damage_versus';
      /** EffectMiscValue = creature type mask bitfield. Cite: Unit.cpp:7055. */
      creatureTypeMask: number;
      /** Flat spell damage bonus vs matching creature types. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_RANGED_AMMO_HASTE (141) highest-only stacking note. Only the highest positive amount
      // applies to ranged attack time. Cite: SpellAuras.cpp:3945–3980 HandleRangedAmmoHaste.
      kind: 'ranged_ammo_haste_highest';
      /** This aura's amount (candidate highest). Cite: :3967. */
      amount: number;
    }
  // ── SI3 aura batch 11 intents ─────────────────────────────────────────────
  | {
      // Spell hit chance across all schools. The bake is empty, since both hit auras return early.
      // Cite: SpellAuras.cpp:3868-3870; StatSystem.cpp:538.
      kind: 'mod_spell_hit_chance';
      /** Signed percent points (e.g. +10 hit). Cite: :3870. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_WATER_WALK (104). Real: SetWaterWalk(apply) movement flag / packet. Bake empty. Cite:
      // SpellAuras.cpp:1661–1667; Unit.cpp:12486.
      kind: 'water_walk';
      durationMs: number;
    }
  | {
      // On a caster's spell hit, chance-cast the named trigger. The bake is empty.
      // Cite: SpellAuras.cpp:170; Spell.cpp:7433-7468 ProcSpellAuraTriggers.
      kind: 'add_target_trigger';
      /** EffectTriggerSpell id cast on successful hit. Cite: Spell.cpp:7454. */
      triggerSpellId: number;
      // Proc chance % = CalculateSpellEffectValue (base points + dice). Cite: Spell.cpp:7457–7458
      // roll_chance_i(chance).
      chancePct: number;
      durationMs: number;
    }
  | {
      // Power regen percent at its use site: spirit mana regen is multiplied by it, and rage or energy
      // scale per matching power. Cite: SpellAuras.cpp:3644-3655; StatSystem.cpp:551-552.
      kind: 'mod_power_regen_percent';
      /** EffectMiscValue = Powers enum (0 mana, 1 rage, 3 energy). Cite: :3654. */
      powerType: number;
      /** Signed percent (e.g. 100 → ×2). Cite: Player.cpp:2343 (amount+100)/100. */
      amount: number;
      durationMs: number;
      /** Real + player + POWER_MANA → UpdateManaRegen on apply/remove. Cite: SpellAuras.cpp:3650–3655. */
      updateManaRegen?: boolean;
    }
  | {
      // SPELL_AURA_SAFE_FALL (144). Handler body empty; fall damage reduces z_diff by
      // GetTotalAuraModifier(144). Bake empty. Cite: SpellAuras.cpp:5649–5651; Player.cpp:19535–19537.
      kind: 'safe_fall';
      /** Height reduction yards (e.g. 10). Cite: Player.cpp:19535. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_BIND_SIGHT (1). Player caster: camera.SetView(target) / ResetView on remove. Bake empty.
      // Cite: SpellAuras.cpp:2126–2136.
      kind: 'bind_sight';
      durationMs: number;
    }
  | {
      // Power cost school: a flat cost modifier per school bit in the mask, and the bake is empty.
      // Cite: SpellAuras.cpp:4208-4216.
      kind: 'mod_power_cost_school';
      /** EffectMiscValue = school mask. Cite: :4214–4215. */
      schoolMask: number;
      /** Flat power cost modifier (negative = cheaper). Cite: :4216. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_FAR_SIGHT (76). Same body as BIND_SIGHT: player caster camera.SetView(target). Bake
      // empty. Cite: SpellAuras.cpp:2139–2149.
      kind: 'far_sight';
      durationMs: number;
    }
  // ── SI3 aura batch 12 intents ─────────────────────────────────────────────
  | {
      // Unattackable: a real apply stops combat, and the untargetable flag is always set. The bake is
      // empty. Cite: SpellAuras.cpp:4454-4459 HandleModUnattackable.
      kind: 'mod_unattackable';
      durationMs: number;
      // Real && Apply → CombatStop(). Cite: :4456–4457. Interpret apply snapshot always true when real path
      // is taken.
      combatStopOnApply: true;
    }
  | {
      // Interrupt regen: while held, out-of-combat rage regen is skipped, and two ids also set the
      // dummy combat state. Cite: SpellAuras.cpp:5109-5117; Player.cpp:2301.
      kind: 'interrupt_regen';
      durationMs: number;
      /** Spell id 5229 or 29131 → SetInDummyCombatState. Cite: :5114–5117. */
      setInDummyCombatState?: boolean;
    }
  | {
      // Resist pushback: the modifier is added to the resist chance in the cast and channel delays.
      // The bake is empty. Cite: SpellAuras.cpp:210; Spell.cpp:6817-6820, :6849-6852.
      kind: 'resist_pushback';
      // Signed aura amount (e.g. Concentration 35, Barkskin 100). Formula: resistChance = 100 + amount −
      // 100 = amount (before spellmod). Cite: Spell.cpp:6817–6819.
      amount: number;
      durationMs: number;
    }
  | {
      // Split damage flat: up to the amount goes to a living linked caster when the school matches.
      // Cite: SpellAuras.cpp:214; Unit.cpp:2501-2537.
      kind: 'split_damage_flat';
      /** Flat damage redirected per hit (cap). Cite: Unit.cpp:2516–2519. */
      amount: number;
      /** EffectMiscValue school mask. Cite: Unit.cpp:2507. */
      schoolMask: number;
      durationMs: number;
    }
  | {
      // Power burn: the tick burns power and deals the burned amount times the multiple value as school
      // damage. Cite: SpellAuras.cpp:3124-3126, :4892-4946.
      kind: 'power_burn_mana';
      /** Powers enum (misc). Cite: :4915. */
      powerType: number;
      /** Mana/power burned per tick (m_amount). Cite: :4902. */
      amountPerTick: number;
      /** EffectAmplitude ms. Cite: aura amplitude. */
      tickMs: number;
      // EffectMultipleValue — damage = burned × mult. Cite: :4922. Classic DB float (Ignite Mana / Soul Tap
      // = 1).
      multiplier: number;
      durationMs: number;
    }
  | {
      // Damage done versus a creature type mask, multiplied into both the spell and melee done paths.
      // The bake is empty. Cite: SpellAuras.cpp:229; Unit.cpp:7058, :7503.
      kind: 'mod_damage_done_versus';
      /** EffectMiscValue = creature type mask. Cite: Unit.cpp:7058. */
      creatureTypeMask: number;
      /** Percent points (e.g. Murder R2 +2). Cite: amount as aura modifier. */
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_INCREASE_ENERGY_PERCENT (132). HandleStatModifier(UNIT_MOD_POWER_START+power,
      // TOTAL_PCT, ±amount). Cite: SpellAuras.cpp:3734-3743.
      kind: 'mod_increase_energy_percent';
      powerType: number;
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_INCREASE_ENERGY (35). HandleStatModifier(UNIT_MOD_POWER_START+power, TOTAL_VALUE,
      // ±amount). Bake empty. Cite: SpellAuras.cpp:3719–3726.
      kind: 'mod_increase_energy';
      /** Powers enum (misc: 0 mana, 1 rage, 3 energy). Cite: :3722. */
      powerType: number;
      /** Flat max-power TOTAL_VALUE. Cite: :3726. */
      amount: number;
      durationMs: number;
    }
  // ── SI3 aura batch 13 intents ─────────────────────────────────────────────
  | {
      // SPELL_AURA_PERIODIC_MANA_FUNNEL (63). HandleUnused — empty body; obsolete (zzOLDMana Funnel only).
      // Cite: SpellAuras.h:279–282; SpellAuras.cpp:124.
      kind: 'periodic_mana_funnel_unused';
    }
  | {
      // Feign Death: a player-controlled target may fail a resist roll against the attackers' miss
      // chance, and a success interrupts the casts aimed at them. Cite: Unit.cpp:10083-10140.
      kind: 'feign_death';
      durationMs: number;
      // When true, apply path runs resist roll before success side-effects. Gate:
      // ctx.unitTargetPlayerControlled === true. Cite: :2390–2410.
      playerControlledResistRoll?: boolean;
    }
  | {
      // Power cost school percent: a cost multiplier per school bit in the mask.
      // Cite: SpellAuras.cpp:4190-4204; Spell.cpp:6368.
      kind: 'mod_power_cost_school_pct';
      /** EffectMiscValue = school mask. Cite: :4199–4200. */
      schoolMask: number;
      /** Percent points (e.g. −15 → −0.15 field delta). Cite: :4197 amount/100. */
      amount: number;
      durationMs: number;
      // Spell 30422 expire → CastSpell(38638). Cite: :4202–4204. Not present in Classic 1.12 DB; branch
      // ported for handler completeness.
      expireCastSpellId?: number;
    }
  | {
      // SPELL_AURA_GHOST (95). SetVisFlags(GHOST); player: PLAYER_FLAGS_GHOST + water-walk if no
      // WATER_WALK. Cite: SpellAuras.cpp:4396–4420.
      kind: 'ghost';
      durationMs: number;
      // Apply water-walk unless target already has SPELL_AURA_WATER_WALK. Gate: player target. Cite:
      // :4406–4408 / :4416–4418.
      setWaterWalkUnlessWaterWalkAura: true;
    }
  | {
      // Spell magnet: one harmful single-target magic spell is redirected to the magnet and its charge
      // consumed. Cite: SpellAuras.cpp:157; Unit.cpp:6894-6919 SelectMagnetTarget.
      kind: 'spell_magnet';
      durationMs: number;
    }
  | {
      // SPELL_AURA_AURAS_VISIBLE (100). ApplyModFlag(UNIT_FLAG_AURAS_VISIBLE). Cite:
      // SpellAuras.cpp:3383–3385.
      kind: 'auras_visible';
      durationMs: number;
    }
  | {
      // SPELL_AURA_HOVER (106). Real: SetHover(apply) movement flag / packet. Cite:
      // SpellAuras.cpp:1679–1686; Unit.cpp:12428.
      kind: 'hover';
      durationMs: number;
    }
  | {
      // Regen during combat: spirit health regen keeps running in combat, scaled by the modifier.
      // Cite: SpellAuras.cpp:177; Player.cpp:2297-2299, :2390-2400.
      kind: 'mod_regen_during_combat';
      // Percent of OOC spirit HP regen while in combat (e.g. troll racial 10). Cite: Player.cpp:2400
      // addvalue *= amount/100.
      amount: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_UNTRACKABLE (120). Set/Remove UNIT_VIS_FLAG_UNTRACKABLE. Cite: SpellAuras.cpp:4374–4379.
      kind: 'untrackable';
      durationMs: number;
    }
  // ── SI3 aura batch 14 intents ─────────────────────────────────────────────
  | {
      // Empathy, the Beast Lore info flag on a player or a beast. The bake is empty.
      // Cite: SpellAuras.cpp:4351-4371.
      kind: 'empathy';
      durationMs: number;
      // Target eligible for UNIT_DYNFLAG_SPECIALINFO (player or beast). Cite: :4355–4357. Gate:
      // unitTargetIsPlayer / unitTargetCreatureType.
      applySpecialInfo: boolean;
      // apply path sends BuildValuesUpdateBlockForPlayerWithFlags to player caster. Cite: :4359–4369. Gate:
      // casterIsPlayer !== false.
      sendSpecialInfoUpdate?: boolean;
    }
  | {
      // Possess pet, Eyes of the Beast: a player caster takes their own pet's vision. Own-pet only, so
      // there is no control surface. Cite: SpellAuras.cpp:2258-2279; Spell.cpp:5717-5735.
      kind: 'mod_possess_pet';
      /** Holder spell id (GetId()). Cite: TakePossessOf path :2273. */
      spellId: number;
      durationMs: number;
      /** BreakCharmOutgoing(true) before TakePossessOf on apply. Cite: :2270–2273. Player casters only. */
      breakOutgoing: true;
    }
  | {
      // Water breathing multiplier, a product per stack — distinct from aura 82, which forces zero.
      // Cite: SpellAuras.cpp:1701-1706; Unit.cpp:4492-4500 GetTotalAuraMultiplier.
      kind: 'mod_water_breathing';
      /** Signed percent points added inside (100+amount)/100. Cite: Unit.cpp:4498. */
      amount: number;
      // This aura's contribution = (100+amount)/100 (stack product is SI5 runtime). Cite: Unit.cpp:4498.
      intervalMultiplier: number;
      durationMs: number;
    }
  | {
      // SPELL_AURA_MOD_REPUTATION_GAIN (156). NoImmediateEffect: Player::CalculateReputationGain adds
      // GetTotalAuraModifier. Bake empty. Cite: SpellAuras.cpp:217; Player.cpp:6297–6302.
      kind: 'mod_reputation_gain';
      // Signed percent points (Diplomacy +10). Applied as percent += ±repMod. Cite: Player.cpp:6297, :6302.
      amount: number;
      durationMs: number;
    }
  | {
      // No PvP credit, the Honorless Target aura: the honor reward returns false while the victim holds
      // it, and only that one spell uses it. Cite: Player.cpp:6626-6627.
      kind: 'no_pvp_credit';
      durationMs: number;
    }
  | {
      // Track Hidden, a player tracking flag. The bake is empty.
      // Cite: SpellAuras.cpp:2174-2179 HandleAuraTrackStealthed.
      kind: 'track_stealthed';
      durationMs: number;
    }
  // ── SI4 registry intents (dummy / script proof cases) ─────────────────────
  | {
      // Life Tap converts health to mana: the health cost is the script value with its modifiers, and
      // the mana is that base scaled by Improved Life Tap. Cite: Warlock.cpp:52-103.
      kind: 'life_tap';
      healthCost: number;
      manaGain: number;
      /** Life Tap mana energize custom spell. Cite: Warlock.cpp:102 (31818). */
      manaSpellId: number;
      // OnCheckCast: script value > caster health → SPELL_FAILED_FIZZLE. Set when ctx.casterHealth is
      // provided and check fails. Cite: Warlock.cpp:69–70.
      fizzled?: boolean;
    }
  | {
      // Judgement 20271 SCRIPT_EFFECT: remove seal + cast judgement spell from seal. Cite: Paladin.cpp
      // spell_judgement OnEffectExecute ~78–116.
      kind: 'judgement_cast';
      /** Seal aura spell id removed. Cite: RemoveAurasDueToSpell(sealId). */
      sealSpellId: number;
      /** Judgement spell from seal CalculateSimpleValue(EFFECT_INDEX_2). */
      judgementSpellId: number;
    };
