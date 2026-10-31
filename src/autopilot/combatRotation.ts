// Bridge between the live combat session and the pure rotation engine. Each tick the driver
// asks `pickCombatAbility` what to do; it assembles a RotationSnapshot from the session views +
// character/inventory and consults the rotation, returning a spell id, an item use, or null
// (auto-attack). PURE (given a session).

import { type CombatSession, type CombatAction, type AbilityStatus, DRAIN_SOUL_ID } from '../engine/combat.ts';
import { type AllySide } from '../engine/core/events.ts';
import type { CombatantId } from '../engine/combat/threat.ts';
import type { GameState } from '../engine/game.ts';
import type { Game } from '../engine/game/types.ts';
import type { DataStore } from '../data/dataStore.ts';
import { CLASS, type TotemSlot } from '../data/schema.ts';
import { maxHealth, maxPower, powerType, getTempEnchant, getActiveBuffIds, currentMana, equippedEntry } from '../domain/character/character.ts';
import type { EquippedValue } from '../domain/items/itemInstance.ts';
import { petMaxHealth, petMaxPower } from '../domain/pet/pet.ts';
import { openTempWeaponImbueHands } from '../domain/professions/weaponImbueHand.ts';
import { knows } from '../domain/character/spellbook.ts';
import { SOUL_SHARD_ITEM } from '../domain/core/ids.ts';
import { bestCarriedFamilyItem } from '../domain/items/consumableFamily.ts';
import { itemUseCooldownRemainingMs } from '../domain/items/itemUseCooldown.ts';
import { normalizeAutopilotConfig } from './config.ts';
import {
  chooseCombatAction, chooseOocAction,
  isGroundTargetedMulti,
  isMultiTargetCombatSpell,
  isNovaKiteSpell,
  isPiercingHowlSpell,
  piercingHowlRefused,
  multiTargetNeedsPackDensity,
  isPackSuppressedStFiller,
  isThreatOrTauntUtility,
  isInterruptSpell,
  isPureInterruptSpell,
  isDispelSpell,
  haltDpsCoversEntry,
  peekHaltDpsSchool,
  haltDpsRefusesSchool,
  FROST_NOVA_RANK_IDS,
  multiTargetGateYards,
  novaDiscOccupied,
  type ItemRuleTarget, type Rotation, type RotationSnapshot, type SubjectState,
  type RotationRule,
  type RuleAction,
  type Condition,
  isLowestHpSpellTarget,
} from '../domain/rotation/rotation.ts';
import { preferAoeRules, spellIsHeal } from '../domain/bots/companionRotation.ts';
import { encodeAoeMode, type CompanionAoeMode } from '../domain/bots/squad.ts';
import { oocPetCallReviveFailReason } from '../engine/game/oocCast.ts';
import { keepUpAlreadyPresent } from '../engine/spells/auraStacking.ts';
import { inferRole } from '../engine/combat.ts';
import { formIdFromSpell, isFormSpell, isMobilityFormSpellId, isMobilityTravelForm } from '../domain/character/forms.ts';
import { DISPEL_TYPE } from '../domain/spells/dispel.ts';
import { spellAllowedAtLocation } from '../engine/spells/spellAttributes.ts';

/** Paperdoll entries for `itemEquipped`. Cite: itemInstance.ts equippedEntry; buildCombatant.ts:175. */
function equippedEntrySet(char: { equipped?: Partial<Record<string, EquippedValue>> }): Set<number> {
  const out = new Set<number>();
  for (const v of Object.values(char.equipped ?? {})) {
    const e = equippedEntry(v);
    if (e) out.add(e);
  }
  return out;
}

/** Emergency ally heal threshold — same triage band as off-heal pack gates. */
const PLAYER_OFF_HEAL_PCT = 40;
/** Cite: invent.ts HEALER_DRY_POWER_PCT. */
const HEALER_DRY_POWER_PCT = 5;

function spellHealsFromDef(spell: { effects?: ReadonlyArray<{ kind: string }> }): boolean {
  return spellIsHeal(spell);
}

/** Effect kinds a `halt_dps` row is about — the damage a threat watch has to stop. */
const DAMAGE_EFFECT_KINDS: ReadonlySet<string> = new Set([
  'direct_damage', 'dot', 'weapon_percent_damage', 'weapon_damage', 'weapon_strike',
  'health_leech', 'holy_shock', 'judgement', 'power_burn',
]);

/** True when casting this spell would deal damage (so an armed halt should refuse it). */
function spellDealsDamage(spell: { effects?: ReadonlyArray<{ kind: string }> | null }): boolean {
  return (spell.effects ?? []).some((e) => DAMAGE_EFFECT_KINDS.has(e.kind));
}

const pct = (v: number, max: number): number => (max > 0 ? (v / max) * 100 : 0);


/**
 * Auto-combat's Soul-Shard cap. Drain Soul is a channeled shard-farmer that's wasted once you're
 * stocked, so the rotation stops offering it as "usable" when you already hold `keepShards`+ shards
 * (the `keepSoulShards` autopilot setting). Returns true = suppress the auto-cast. `keepShards <= 0`
 * means "never auto-farm shards". Only Drain Soul is affected; manual casts are never gated here.
 */
export function shardFarmSuppressed(spellId: number, shardCount: number, keepShards: number): boolean {
  return spellId === DRAIN_SOUL_ID && shardCount >= keepShards;
}

/** Assemble the rotation snapshot from the live session + character/inventory context. */
export function combatSnapshot(
  session: CombatSession,
  state: GameState,
  ds: DataStore,
  kit?: readonly AbilityStatus[],
): RotationSnapshot {
  const pv = session.playerView();
  const usable = new Map<number, boolean>();
  const multiSpellIds = new Set<number>();
  const totemSummonIds = new Set<number>();
  const tauntSpellIds = new Set<number>();
  const controlSpellIds = new Set<number>();
  const interruptSpellIds = new Set<number>();
  const dispelSpellIds = new Set<number>();
  const abilityById = new Map<number, {
    name?: string;
    aoe?: boolean;
    aoeShape?: string;
    radiusYd?: number;
    rangeMax?: number;
    /** SpellEntry.Attributes — read for SPELL_ATTR_ONLY_OUTDOORS. */
    attributes?: number;
    effects?: ReadonlyArray<{ kind: string; dispelType?: number }>;
  }>();
  let hasCleave = false;
  let hasSwipe = false;
  for (const a of kit ?? session.abilities()) {
    usable.set(a.spell.id, a.usable);
    abilityById.set(a.spell.id, a.spell);
    if (isMultiTargetCombatSpell(a.spell)) multiSpellIds.add(a.spell.id);
    const nm = (a.spell.name ?? '').toLowerCase();
    if (nm === 'cleave') hasCleave = true;
    if (nm === 'swipe') hasSwipe = true;
    // Session stubs / thin ability rows may omit effects[] — only classify full shapes.
    const sp = a.spell as { id: number; role?: string; effects?: ReadonlyArray<{ kind: string }>; name?: string };
    if (sp.role === 'totem_summon'
      || (Array.isArray(sp.effects) && sp.effects.some((e) => e.kind === 'summon_totem'))) {
      totemSummonIds.add(sp.id);
    }
    if (Array.isArray(sp.effects)) {
      if (isThreatOrTauntUtility(sp as never)) tauntSpellIds.add(sp.id);
      const role = sp.role ?? inferRole(sp as never);
      if (role === 'control' || isInterruptSpell(sp as never)) controlSpellIds.add(sp.id);
      if (isInterruptSpell(sp as never)) interruptSpellIds.add(sp.id);
      if (isDispelSpell(sp as never)) dispelSpellIds.add(sp.id);
    } else if (sp.role === 'control') {
      controlSpellIds.add(sp.id);
    }
  }
  const usableItems = new Map<number, boolean>();
  // Best carried rung per rank ladder — a family rotation row ("Healing Potion") resolves here.
  const bestByFamily = new Map<string, { entry: number; rank: number }>();
  for (const s of session.items()) {
    usableItems.set(s.item.entry, s.usable);
    const fam = s.item.family;
    if (fam == null || s.count <= 0) continue;
    const rank = s.item.rank ?? 0;
    const cur = bestByFamily.get(fam);
    if (!cur || rank > cur.rank) bestByFamily.set(fam, { entry: s.item.entry, rank });
  }

  /**
   * World state comes from the ENGINE's snapshot — the same object a companion's provider is
   * handed — with the player's own focus pinned as the foe.
   *
   * This function used to rebuild all of it, and the two copies had drifted. Measured over 100
   * snapshot pairs in a real BRD fight (probe-snapdiff): 23 of 27 fields were already identical,
   * and every difference was the player being BLIND to something companions saw — self and target
   * `rooted`/`stunned`/`feared`/`snared` all undefined, `target.level` 0 instead of 52,
   * `target.comboPoints` and `formId` undefined, both dispellable sets missing (so a player
   * Cleanse/Purge rule could never gate on having something to strip), and every ally `distYd`
   * null (so PoH / Chain Heal range gates could not fire). Two builders for one evaluator is
   * also how the pull-spent scan came to exist twice and drift.
   *
   * Overlaid below: only what the engine cannot see — the real bag, the autopilot knobs, creature
   * type, the totem-twisting nudge, char-side weapon enchants, and the player's usability policy.
   */
  // The ONE-argument form is the memoized facade read (simFacade MEMO_READS_1); the pinned-foe form
  // falls through and, behind the Worker the live floor ticks in, comes back without live aura state
  // — every `target.*` gate then read an empty debuff list and re-fired forever (Hunter's Mark
  // measured 40 casts over 7 bodies). The engine resolves the same foe internally.
  const base = session.rotationSnapshot('player');
  if (!base) throw new Error('combatSnapshot: session has no player unit');

  const itemCounts = new Map<number, number>();
  for (const s of state.inventory.stacks) itemCounts.set(s.item, (itemCounts.get(s.item) ?? 0) + s.count);

  // Warlock: once we hold enough Soul Shards, drop Drain Soul from the usable set so the rotation
  // falls through to a real nuke instead of channelling a shard-farmer we don't need right now.
  const autopilotCfg = normalizeAutopilotConfig(state.autopilot);
  const keepShards = autopilotCfg.keepSoulShards;
  const twisting = autopilotCfg.totemTwisting;
  const shardCount = itemCounts.get(SOUL_SHARD_ITEM) ?? 0;

  // Fight-wide pack size for enemyCount gates. Endless floor streams ~48 yd of passives
  // into the session; counting them as "in the fight" made custom/legacy enemyCount>=2
  // rules (and aoeMode prefer) fire multi tools while only one pack was engaged.
  // Companions already use livingCombatEnemies via pickAction. Prefer engaged (threat);
  // fall back to all living when the view has no engaged flags (non-endless / 1v1).
  // Cite: createSession livingCombatEnemies; enemiesView engaged; injectEnemySpec passive.
  // The removed else counted livingEnemiesView(), which includes the passives the engaged branch
  // below deliberately excludes - a different number under the same name. E1.3.
  let living = 0;
  let livingSides: Array<{ side: string; hp: number; engaged: boolean }> = [];
  {
    session.enemiesView().forEach((v) => {
      const hp = v.hp;
      const engaged = v.engaged === true;
      livingSides.push({ side: v.side, hp, engaged });
    });
    const combatN = livingSides.filter((s) => s.hp > 0 && s.engaged).length;
    const allN = livingSides.filter((s) => s.hp > 0).length;
    living = combatN > 0 ? combatN : allN;
  }
  // Explicit click target counts even before threat (setPlayerTarget on a passive).
  if (typeof session.playerTargetId === 'function') {
    const focusId = session.playerTargetId();
    if (
      typeof focusId === 'string'
      && (focusId === 'enemy' || /^enemy_\d+$/.test(focusId))
      && livingSides.some((s) => s.side === focusId && s.hp > 0 && !s.engaged)
    ) {
      // Focus is a living passive — still one free-fire hostile for pack size.
      if (livingSides.filter((s) => s.hp > 0 && s.engaged).length === 0) {
        living = Math.max(living, 1);
      }
    }
  }

  // Blast geometry for the multi/AoE gates below — engine-built, proven identical to the
  // copy this replaced across 100 sampled ticks.
  const enemyDists = base.enemyDists;
  const enemyDistsFromTarget = base.enemyDistsFromTarget;
  const packNearMelee = (): number => {
    if (!enemyDists) return living;
    let n = 0;
    for (const d of enemyDists) if (d <= 8) n++;
    return n;
  };

  // Occupied element slots: engine-built, then nudged for twisting below.
  const totemSlots = new Set<TotemSlot>(base.totemSlots ?? []);
  // TOTEM TWISTING (opt-in). Windfury's kit hands the party a 10s weapon enchant keyed to its own
  // spell id, and UnSummon strips only GetSpell(), so the enchant survives the air slot being
  // taken over. Twisting is just re-casting the air slot on cooldown to keep BOTH running.
  //
  // Two nudges, no bespoke rule syntax:
  //   1. the air slot never reports as occupied, so `totemPresent` gates stop blocking it;
  //   2. the air totem currently standing is marked unusable, so the rotation is forced onto the
  //      OTHER air totem — that alternation is what makes it a twist rather than a refresh.
  // Cite: Entities/Totem.cpp UnSummon :131–158 / GetSpell() :169–174.
  const twistSuppressed = new Set<number>();
  if (twisting && typeof session.totemsView === 'function') {
    totemSlots.delete('air');
    for (const t of session.totemsView()) {
      if (t.slot === 'air' && t.summonSpellId) twistSuppressed.add(t.summonSpellId);
    }
  }

  // Weapon TEMP enchants: live session hands + char state (OOC writeback lag).
  const weaponImbueHands = new Set<'mainhand' | 'offhand'>();
  if (getTempEnchant(state.char, 'mainhand')) weaponImbueHands.add('mainhand');
  if (getTempEnchant(state.char, 'offhand')) weaponImbueHands.add('offhand');
  for (const h of pv.weaponImbueHands ?? []) weaponImbueHands.add(h);
  // Open eligible hands (weapon only — not shield) for ref-2 keep-up / dual-wield fill.
  const weaponImbueOpenHands = openTempWeaponImbueHands(state.char, ds);

  // Taunt policy below needs this; the engine already computed it.
  const targetAttackingMe = base.targetAttackingMe;

  return {
    // self/target/pet, both ally lists, triage buffs, threat flags, dispellable sets,
    // knownSpells, combatTimeMs and pull-spent all come from the engine unchanged.
    ...base,
    // activeBuffs are char-side (food/elixirs applied out of combat, which the fighter may not
    // carry) — without the union a `buffPresent` rule would re-cast something already up.
    // Strictly additive to the engine's subject.
    //
    // creatureType is NOT overlaid: subjectFromView already sets it from the Fighter
    // (pickAction.ts:1030), for self and target alike. The overlay that used to be here read a
    // SECOND resolution of "who is the target" - focusCombatView, which fell back to
    // ensurePlayerFocus while the engine's own `foeOf` may return the tank-peel or kill-order
    // pick instead. When those disagree the row described one unit and typed another, so an
    // undead-only rule read `humanoid` on the mob it was aimed at. Two resolvers for one
    // question is what section 0c rule 4 forbids; the duplicate is deleted.
    self: {
      ...base.self,
      buffs: new Set([...base.self.buffs, ...state.char.activeBuffs]),
    },
    target: base.target,
    pet: base.pet ? { ...base.pet, happiness: state.char.pet?.happiness } : base.pet,
    // Player pack-size policy: engaged-preferred with an explicit-click fallback, which the
    // engine's combatEnemyCount does not do (b6e85611).
    enemyCount: living,
    // Twisting nudge applied above; the engine reports the raw occupied slots.
    totemSlots,
    // Char-side temp enchants too: the session hands only what it can see, and OOC writeback
    // lags a tick, so this is a superset of the engine's.
    weaponImbueHands,
    weaponImbueOpenHands,
    itemCounts,
    equippedItemEntries: equippedEntrySet(state.char),
    // Player S4C knobs from AutopilotConfig (companions use companionActionProvider).
    aoeMode: encodeAoeMode(autopilotCfg.aoeMode as CompanionAoeMode),
    offHealAllowed: autopilotCfg.offHeal ? 1 : 0,
    usableSpell: (id) => {
      if (shardFarmSuppressed(id, shardCount, keepShards)) return false;
      if (twistSuppressed.has(id)) return false; // twisting: never re-cast the air totem already up
      // Indoors (a WMO roof over this pull): Entangling Roots / Nature's Grasp / Inferno fail
      // CheckCast, so the rule must not win the GCD. The engine gates its own kit the same way.
      if (!spellAllowedAtLocation(abilityById.get(id), base.outdoors !== false, false)) return false;
      // Hard suppress multi under 'single' even when rotation rules lack aoeMode gates.
      if (autopilotCfg.aoeMode === 'single' && multiSpellIds.has(id)) return false;
      // Pack swap: HS/Maul must not dump rage when Cleave/Swipe is known (see isPackSuppressedStFiller).
      // Nearby melee-band count — a spread pack still wants HS on the mob you have.
      if (
        isPackSuppressedStFiller(abilityById.get(id), {
          enemyCount: packNearMelee(),
          hasCleave,
          hasSwipe,
          singleTargetMode: autopilotCfg.aoeMode === 'single',
        })
      ) {
        return false;
      }
      // Multi/AoE damage dumps: 2+ hostiles in blast. Hostile-aura PBAoEs (Demo Roar)
      // stay usable on 1v1 — multiTargetNeedsPackDensity (KI-836).
      {
        const ab = abilityById.get(id);
        if (ab && multiTargetNeedsPackDensity(ab)) {
          const yards = multiTargetGateYards(ab);
          const dists = isGroundTargetedMulti(ab) ? enemyDistsFromTarget : enemyDists;
          let near = living;
          if (dists) {
            near = 0;
            for (const d of dists) if (d <= yards) near++;
          }
          if (near < 2) return false;
        }
        if (ab && isNovaKiteSpell(ab) && enemyDists && !novaDiscOccupied(enemyDists, ab)) {
          return false;
        }
        if (ab && isPiercingHowlSpell(ab) && piercingHowlRefused({
          inMelee: base.target?.inMelee === true,
          snared: base.target?.snared === true,
          snareImmune: base.target?.immuneSpellIds?.has(id) === true
            || base.target?.immuneAuraSpellIds?.has(id) === true,
          distanceYd: base.targetDistanceYd ?? null,
          radiusYd: ab.radiusYd,
        })) return false;
        // Bodies in the disc but none the root can hold (immune boss / full DR). The engine
        // already decided this per-hostile in allySnapshot — do not re-derive it here.
        if (base.unholdableAoeCcSpellIds?.has(id)) return false;
      }
      // Totems only once the pull is on (twin of pickAction usableSpell). `living` is no use
      // here — it counts unengaged floor passives — so read the engaged flags.
      if (totemSummonIds.has(id)
        && base.inCombat === false
        && !livingSides.some((s) => s.hp > 0 && s.engaged)) {
        return false;
      }
      // DPS never auto-taunts — tank/offtank keep threat tools.
      if (autopilotCfg.combatRole === 'dps' && tauntSpellIds.has(id)) return false;
      // Tank/offtank: only taunt when the focus is not already on you (peel / regain).
      if (
        (autopilotCfg.combatRole === 'tank' || autopilotCfg.combatRole === 'offtank')
        && tauntSpellIds.has(id)
        && targetAttackingMe === true
      ) {
        return false;
      }
      // Offtank peel: prefer control when something is on you (or target not on you — rule gates).
      // Soft: do not hard-block CC here; conditions + ccPreferCasters handle freedom.
      void controlSpellIds;
      // Party interrupt: skip when a companion already owns this cast, or when the
      // engine says this Kick cannot land (wrong target, OOR of the caster add).
      if (interruptSpellIds.has(id)) {
        const focusId =
          typeof session.playerTargetId === 'function' ? session.playerTargetId() : 'enemy';
        if (
          typeof session.interruptClaimedByOther === 'function'
          && session.interruptClaimedByOther(focusId, 'player')
        ) {
          return false;
        }
        if (!base.usableSpell(id)) return false;
      }
      // Party Tranq/Purge claim on the focus. Cure cats aim at friendlies and skip this overlay.
      // Cite: AUTOPILOT-PLAN §4 row 21.
      if (dispelSpellIds.has(id)) {
        const focusId =
          typeof session.playerTargetId === 'function' ? session.playerTargetId() : 'enemy';
        const sp = abilityById.get(id);
        if (typeof session.dispelClaimedByOther === 'function' && sp?.effects) {
          for (const e of sp.effects) {
            const cat = e.dispelType;
            if (e.kind !== 'dispel' || cat == null) continue;
            // Offensive cats on the focus. Cure cats aim at friendlies — do not grey from a boss claim.
            if (
              cat !== DISPEL_TYPE.MAGIC
              && cat !== DISPEL_TYPE.STEALTH
              && cat !== DISPEL_TYPE.INVISIBILITY
              && cat !== DISPEL_TYPE.SPE_NPC_ONLY
              && cat !== DISPEL_TYPE.ENRAGE
            ) continue;
            if (session.dispelClaimedByOther(focusId, 'player', cat)) return false;
          }
        }
      }
      return usable.get(id) ?? false;
    },
    usableItem: (entry) => usableItems.get(entry) ?? false,
    bestFamilyEntry: (family) => bestByFamily.get(family)?.entry ?? null,
  };
}

/**
 * Resolve an item-rule target selector to a live friendly CombatantId.
 * - `'self'` → always `'player'`
 * - `'pet'` → `'pet'` if a living pet exists, else `null` (do not fall back to self)
 * - `'lowest_ally'` → lowest HP% among living player/pet/allies; ties keep fixed order
 *   (player → pet → ally_0..). Returns `null` if no living friendly exists.
 *
 * Exported for unit tests.
 */
export function resolveItemRuleTarget(session: CombatSession, sel: ItemRuleTarget): CombatantId | null {
  if (sel === 'self') return 'player';

  if (sel === 'pet') {
    const petv = typeof session.petView === 'function' ? session.petView() : null;
    return petv && petv.hp > 0 ? 'pet' : null;
  }

  // lowest_ally — fixed scan order so ties are deterministic (first wins on equal HP%).
  type Cand = { id: CombatantId; hpPct: number };
  const cands: Cand[] = [];
  const pv = session.playerView();
  if (pv.hp > 0) cands.push({ id: 'player', hpPct: pct(pv.hp, pv.maxHp) });
  const petv = typeof session.petView === 'function' ? session.petView() : null;
  if (petv && petv.hp > 0) cands.push({ id: 'pet', hpPct: pct(petv.hp, petv.maxHp) });
  if (typeof session.alliesView === 'function') {
    const allies = session.alliesView();
    for (let i = 0; i < allies.length; i++) {
      const av = allies[i]!;
      if (av.hp > 0) {
        const id = `ally_${i}` as AllySide;
        cands.push({ id, hpPct: pct(av.hp, av.maxHp) });
      }
    }
  }
  if (!cands.length) return null;
  let best = cands[0]!;
  for (let i = 1; i < cands.length; i++) {
    if (cands[i]!.hpPct < best.hpPct) best = cands[i]!;
  }
  return best.id;
}

/**
 * What the rotation would do this tick: a spell id, an item use, or null (auto-attack).
 * `targetEntry` selects a per-creature override list when the rotation defines one.
 * Item rules resolve optional `target` selectors to a CombatantId; unresolvable targets
 * (e.g. pet selector with no living pet) skip the rule rather than mis-targeting self.
 *
 * Player aoeMode `aoe` reorders multi-target combat rules first when ≥2 living enemies
 * (same prefer path as companionActionProvider).
 */
export function pickCombatAbility(
  session: CombatSession,
  rot: Rotation,
  state: GameState,
  ds: DataStore,
  targetEntry?: number,
): CombatAction {
  // Ghost Wolf is a 3s cast: recast is dropped while walking in (combatView skip).
  // Buff-cancel first so the snapshot sees humanoid and Lightning Bolt is usable.
  {
    const pv = session.playerView();
    const wolfed = isMobilityTravelForm((pv.form ?? 0) | 0)
      || (pv.buffs ?? []).some((b) => isMobilityFormSpellId(b.spellId));
    if (wolfed) {
      session.leaveForm?.('player');
      const cf = (state.char.form ?? 0) | 0;
      if (isMobilityTravelForm(cf) || (state.char.activeAuras ?? []).some((a) => isMobilityFormSpellId(a.spellId))) {
        const mana = currentMana(state.char);
        let next = { ...state.char, form: undefined as undefined, power: mana };
        delete next.mana;
        if (next.activeAuras) {
          next = {
            ...next,
            activeAuras: next.activeAuras.filter((a) => !isMobilityFormSpellId(a.spellId)),
          };
        }
        next.activeBuffs = getActiveBuffIds(next);
        state.char = next;
      }
    }
  }
  const kit = session.abilities();
  let snap = combatSnapshot(session, state, ds, kit);
  const cfg = normalizeAutopilotConfig(state.autopilot);
  let useRot = rot;
  // No hidden role transform: the editor rotation is what runs. Healer/tank defaults are
  // baked at reset via buildPlayerDefaultRotation (visible recovery/combat rules).
  if (cfg.offHeal && state.squadRole !== 'healer') {
    const hasGate = (['buffs', 'pull', 'combat', 'recovery'] as const).some((p) =>
      (useRot.phases[p] ?? []).some(
        (r) => r.action.kind === 'spell' && r.conditions.some(
          (c) => c.metric === 'offHealAllowed' || c.metric === 'healerPowerPct',
        ),
      ),
    );
    if (!hasGate) {
      const heal = kit.find((a) => spellHealsFromDef(a.spell));
      if (heal) {
        const rule: RotationRule = {
          id: 'g-player-offheal',
          action: { kind: 'spell', spellId: heal.spell.id },
          conditions: [
            { subject: 'self', metric: 'offHealAllowed', op: '==', value: 1 },
            { subject: 'self', metric: 'healerPowerPct', op: '<', value: HEALER_DRY_POWER_PCT },
            { subject: 'self', metric: 'allyLowestHpPct', op: '<', value: PLAYER_OFF_HEAL_PCT },
          ],
          enabled: true,
        };
        useRot = { ...useRot, phases: { ...useRot.phases, combat: [rule, ...useRot.phases.combat] } };
      }
    }
  }
  if (cfg.aoeMode === 'aoe' && snap.enemyCount >= 2) {
    const multiIds = new Set<number>();
    for (const a of kit) {
      if (isMultiTargetCombatSpell(a.spell)) multiIds.add(a.spell.id);
    }
    if (multiIds.size) useRot = preferAoeRules(useRot, (id) => multiIds.has(id));
  }
  // CC/interrupt freedom: when the global prefer-casters knob is on, soft-inject
  // "enemy is casting" on control rules that have no cast gate yet (sheep casters).
  if (cfg.ccPreferCasters) {
    useRot = injectCcCasterGates(useRot, session, kit);
  }
  // Threat watch: as a DPS, hold damage while an enemy is actually on you. One `halt_dps` rule
  // gated on hasAggro — the same vocabulary a raid tactic row uses, injected per tick like the
  // off-heal above. Tank/offtank are skipped: holding threat is their job. A hand-authored halt
  // on hasAggro wins, so editing the rotation still beats the knob.
  if (cfg.threatWatch && cfg.combatRole === 'dps') {
    const hasHalt = (['combat', 'recovery'] as const).some((p) =>
      (useRot.phases[p] ?? []).some(
        (r) => r.action.kind === 'halt_dps' && r.conditions.some((c) => c.metric === 'hasAggro'),
      ),
    );
    if (!hasHalt) {
      const rule: RotationRule = {
        id: 'g-player-threat-watch',
        action: { kind: 'halt_dps' },
        conditions: [{ subject: 'self', metric: 'hasAggro', op: '==', value: 1 }],
        enabled: true,
      };
      useRot = { ...useRot, phases: { ...useRot.phases, combat: [rule, ...useRot.phases.combat] } };
    }
  }
  // Arm the halt BEFORE evaluate, the same order pickAction uses for companions: a halt has to
  // make the damaging casts unusable so a lower non-damaging rule can still take the tick.
  // Only companions and raid units did this — the player's own rotation ignored every
  // `halt_dps` row it had, including the raid tactic ones, because nothing on this path read
  // it. `firstFiring` alone cannot do the job: it returns a halt only when nothing else fires.
  //
  // This stops ABILITIES, not white swings: a null action means auto-attack, which is what
  // pickAction's halt does too. Cite: pickAction.ts:1427 usableSpell halt gate.
  {
    const peeked = peekHaltDpsSchool(useRot, snap, targetEntry);
    // A scoped halt names the bodies it stops damage on; this filter is by spell id, so the body
    // is the target the rotation is being evaluated against. Not covered -> no halt at all here.
    const halt = peeked && haltDpsCoversEntry(peeked.entries, targetEntry) ? peeked.school : null;
    if (halt) {
      // The SESSION's ability, not ds.spell: the bake leaves plenty of nukes with an empty
      // effects[] and the interpreter fills them at resolve, so a ds read would let those slip
      // straight through the halt. Same object pickAction tests. Built only when a halt is armed.
      const resolved = new Map<number, { school?: string; effects?: ReadonlyArray<{ kind: string }> }>();
      for (const a of kit) resolved.set(a.spell.id, a.spell);
      const baseUsable = snap.usableSpell;
      snap = {
        ...snap,
        usableSpell: (id: number) => {
          if (!baseUsable(id)) return false;
          const sp = resolved.get(id) ?? ds.spell(id);
          if (!sp || !spellDealsDamage(sp)) return true;
          return !haltDpsRefusesSchool(halt, sp.school);
        },
      };
    }
  }
  const action = chooseCombatAction(useRot, snap, targetEntry);
  if (!action) return null;
  if (action.kind === 'spell') {
    if (action.after && typeof session.armRuleAfter === 'function') {
      session.armRuleAfter('player', action.spellId, action.after);
    }
    session.consumeFollowUp?.('player', action.spellId);
    const offTarget = action.target === 'other';
    // A FILTERED aim is resolved by the engine — the same resolver the gate's `subject: 'ally'`
    // read. An unfiltered one keeps the local scan every stored rotation has always used.
    const triageAlly = isLowestHpSpellTarget(action.target)
      ? (action.target.among
        ? (snap.allyAimSide?.(action.target.among) as CombatantId | undefined) ?? undefined
        : resolveItemRuleTarget(session, 'lowest_ally') ?? undefined)
      : undefined;
    if (isLowestHpSpellTarget(action.target) && action.target.among && !triageAlly) return null;
    if (action.after || offTarget || triageAlly) {
      return {
        spell: action.spellId,
        ...(action.after ? { after: action.after } : {}),
        ...(offTarget ? { offTarget: true } : {}),
        ...(triageAlly ? { ally: triageAlly } : {}),
      };
    }
    return action.spellId;
  }
  // A macro rule is compiled to spell/item rules before the evaluator runs (macro/rotation.ts) and
  // actionUsable refuses any that slipped through, so chooseCombatAction cannot return one.
  if (action.kind !== 'item') return null;
  const sel = action.target ?? 'self';
  const targetId = resolveItemRuleTarget(session, sel);
  if (!targetId) return null;
  // Omit target for self so solo combat logs stay shape-compatible (M3 convention).
  return targetId !== 'player'
    ? { item: action.itemEntry, target: targetId }
    : { item: action.itemEntry };
}

/**
 * A snapshot for OUT-of-combat decisions (buffs / conjure / summon), built from the character +
 * inventory (no session, no target). `usableSpell` gates on "known + affordable" so the buffs
 * phase only picks castable spells.
 */
export function oocSnapshot(state: GameState, ds: DataStore): RotationSnapshot {
  const char = state.char;
  const hpMax = maxHealth(char, ds);
  const pt = powerType(char);
  // Mana and energy are spendable OOC (buffs/utility); rage starts empty and is not spent OOC.
  const spendsPower = pt === 'mana' || pt === 'energy';
  const pMax = spendsPower ? maxPower(char, ds) : 0;
  const self: SubjectState = {
    alive: true,
    healthPct: hpMax > 0 ? (char.health / hpMax) * 100 : 100,
    powerPct: pMax > 0 ? (char.power / pMax) * 100 : 100,
    level: char.level,
    // Prefer timed auras (Lightning Shield, imbues mirrored as auras) over legacy list only.
    buffs: new Set(getActiveBuffIds(char)),
    debuffs: new Set(),
    formId: (char.form ?? 0) | 0,
    inMelee: false,
  };
  const pet: SubjectState | null = (() => {
    const p = char.pet;
    if (!p || p.dead || p.health <= 0) return null;
    const hpMax = petMaxHealth(char, ds);
    const cdef = ds.creature(p.creature);
    const pw = cdef ? petMaxPower(char, cdef, ds) : { maxPower: 0 };
    return {
      alive: true,
      healthPct: hpMax > 0 ? (p.health / hpMax) * 100 : 100,
      powerPct: pw.maxPower > 0 ? ((p.power ?? pw.maxPower) / pw.maxPower) * 100 : 0,
      level: char.level,
      buffs: new Set<number>(),
      debuffs: new Set<number>(),
      happiness: p.happiness,
    };
  })();
  const itemCounts = new Map<number, number>();
  for (const s of state.inventory.stacks) itemCounts.set(s.item, (itemCounts.get(s.item) ?? 0) + s.count);
  const equippedItemEntries = equippedEntrySet(char);

  const isShardSpender = (sp: any): boolean =>
    !!sp && (sp.effects?.some((e: any) => e.kind === 'summon_pet') || /create healthstone/i.test(sp.name || ''));

  const weaponImbueHands = new Set<'mainhand' | 'offhand'>();
  if (getTempEnchant(char, 'mainhand')) weaponImbueHands.add('mainhand');
  if (getTempEnchant(char, 'offhand')) weaponImbueHands.add('offhand');
  const weaponImbueOpenHands = openTempWeaponImbueHands(char, ds);

  return {
    self,
    target: null,
    pet,
    combatTimeMs: 999_999,
    enemyCount: 0,
    totemSlots: new Set(), // totems are fight-scoped only
    weaponImbueHands,
    weaponImbueOpenHands,
    itemCounts,
    equippedItemEntries,
    auraCovered: (ids, ref) => keepUpAlreadyPresent(ids, ref, {
      spell: (id) => ds.spell(id),
      chainOf: (id) => ds.spellChain(id),
    }),
    usableSpell: (id) => {
      if (!knows(state.spellbook, id)) return false;
      const sp = ds.spell(id);
      if (!sp) return false;
      if (spendsPower && char.power < sp.cost) return false;
      if (sp.powerType === 'health' && char.health <= (sp.cost ?? 0)) return false;
      // Respect baked cooldowns (per-spell + category) using the persisted world state.
      const now = Date.now();
      if ((state.spellCooldowns?.[id] ?? 0) > now) return false;
      if (sp.category != null && (state.categoryCooldowns?.[sp.category] ?? 0) > now) return false;
      // Basic shard gate for warlock spenders using real item count (rotation can require more via itemCount cond).
      if (char.cls === CLASS.WARLOCK && isShardSpender(sp)) {
        const have = itemCounts.get(SOUL_SHARD_ITEM) ?? 0;
        if (have < 1) return false;
      }
      if (oocPetCallReviveFailReason(sp.effects, char)) return false;
      return true;
    },
    usableItem: (entry) => {
      const worn = equippedItemEntries.has(entry);
      if ((itemCounts.get(entry) ?? 0) <= 0 && !worn) return false;
      const it = ds.item(entry);
      if (it?.slot != null && !worn) return false;
      return itemUseCooldownRemainingMs(
        it, state.spellCooldowns, state.categoryCooldowns, Date.now(),
      ) <= 0;
    },
    bestFamilyEntry: (family) =>
      bestCarriedFamilyItem(family, ds, char, state.inventory)?.entry ?? null,
  };
}

/** Drop travel form so OOC buffs can fire, then pick the next buffs-phase action. */
function dropTravelFormForOoc(state: GameState, ds: DataStore): void {
  const form = (state.char.form ?? 0) | 0;
  if (!isMobilityTravelForm(form)) return;
  const mana = currentMana(state.char);
  let next = { ...state.char, form: undefined as undefined, power: mana };
  delete next.mana;
  if (next.activeAuras) {
    next = {
      ...next,
      activeAuras: next.activeAuras.filter((a) => {
        const sp = ds.spell(a.spellId);
        return !sp || !isFormSpell(sp) || formIdFromSpell(sp) !== form;
      }),
    };
  }
  next.activeBuffs = getActiveBuffIds(next);
  state.char = next;
}

/** Next out-of-combat prep action (spell, item imbue, …), or null. */
export function pickOocAction(rot: Rotation, state: GameState, ds: DataStore): RuleAction | null {
  dropTravelFormForOoc(state, ds);
  return chooseOocAction(rot, oocSnapshot(state, ds));
}

// One buffs-phase ITEM step, the way every prep loop runs it: an imbue row names its own hand
// (poison offhand), so ask for that slot first and fall back to the router's own pick. Without the
// hand the router answers `needsTarget` with mainhand first every time, and the offhand row
// re-coats the mainhand instead. Cite: weaponImbueItem.ts resolveTempWeaponImbueHand.
export function useOocPrepItem(
  game: { consumeItem: Game['consumeItem'] },
  action: { itemEntry: number; hand?: 'mainhand' | 'offhand' },
): boolean {
  const used = game.consumeItem(action.itemEntry, action.hand ? { slot: action.hand } : undefined);
  if (used.ok) return true;
  const pick = used.needsTarget?.slots?.[0];
  return !!pick && game.consumeItem(action.itemEntry, { slot: pick }).ok;
}

/** The next out-of-combat prep spell (buff/conjure/summon) the rotation wants cast, or null. */
export function pickOocSpell(rot: Rotation, state: GameState, ds: DataStore): number | null {
  const action = pickOocAction(rot, state, ds);
  return action && action.kind === 'spell' ? action.spellId : null;
}

// Soft-inject `target.castingPresent == 1` on control/interrupt rules that lack any cast gate. Idempotent
// for rules that already express castingPresent / castingSchool / castingIsHeal. Exported for unit tests.
export function injectCcCasterGates(
  rot: Rotation,
  session: CombatSession,
  kit?: readonly AbilityStatus[],
): Rotation {
  /**
   * INTERRUPTS ONLY. This used to take every `role: 'control'` spell, which is all hard CC —
   * Polymorph, Sap, Shackle, Hibernate, Banish, Fear, the AoE screams — and bolt
   * `target.castingPresent == 1` onto their rules, defaulted ON.
   *
   * build.ts authors that same condition INTO a pure-CC rule and says in as many words "user
   * can ✕ the condition for hard-CC any target". Re-adding it here whenever the rule no longer
   * carried it made that ✕ do nothing: the player deleted the condition, the rotation editor
   * showed it gone, and the rule still would not fire unless the target was mid-cast. Worse for
   * a `target: 'other'` rule, where `subject: 'target'` is the FOCUS — so sheeping a second mob
   * required the TANK'S mob to be casting, which against melee trash is never.
   *
   * A cast gate on an interrupt is not crowd control and is not a hidden decision (the engine
   * already refuses a Kick outside an interruptible cast), so the knob keeps that half.
   */
  const controlIds = new Set<number>();
  for (const a of kit ?? session.abilities()) {
    const sp = a.spell as { id: number; role?: string; effects?: ReadonlyArray<{ kind: string }> };
    if (isPureInterruptSpell(sp as never)) controlIds.add(sp.id);
  }
  if (!controlIds.size) return rot;
  const castGate: Condition = { subject: 'target', metric: 'castingPresent', op: '==', value: 1 };
  let changed = false;
  const adapt = (rules: RotationRule[]): RotationRule[] =>
    rules.map((r) => {
      if (r.action.kind !== 'spell' || !controlIds.has(r.action.spellId)) return r;
      if (FROST_NOVA_RANK_IDS.includes(r.action.spellId)) return r;
      if (r.conditions.some((c) =>
        c.metric === 'castingPresent' || c.metric === 'castingSchool' || c.metric === 'castingIsHeal',
      )) {
        return r;
      }
      changed = true;
      return { ...r, conditions: [...r.conditions, { ...castGate }] };
    });
  const phases = {
    prebuff: rot.phases.prebuff ?? [],
    buffs: adapt(rot.phases.buffs),
    pull: adapt(rot.phases.pull),
    combat: adapt(rot.phases.combat),
    recovery: adapt(rot.phases.recovery),
  };
  return changed ? { ...rot, phases } : rot;
}
