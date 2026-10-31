// Peeled from createSession (createSession.md P9) — pattern (D).
// view / imbuedHands / memoView / result (outward session snapshots).

import type { CombatContext } from './context.ts';
import type {
  ActiveEffect,
  CombatantView,
  CombatResult,
  Fighter,
} from './types.ts';
import type { ControlKind, SpellDef } from '../../data/schema.ts';
import { isEnemySide, type EnemySide, type Side } from '../core/events.ts';
import { channelBarEndsAt } from './channel.ts';
import { fighterEffectiveArmor } from './fighterFactory.ts';
import { RECENT_DODGE_MS, RECENT_DEFENSE_REACT_MS } from './types.ts';
import { ICE_BLOCK_IDS } from './predicates.ts';
import { totemSummonMarkerIds } from './totemAuras.ts';
import { isHunterTrapArmProc } from '../spells/interpreter/hunter-kit.ts';
import { totalStealthStrength } from '../../domain/spells/stealth.ts';
import { isPossessInvSpell } from '../../domain/scriptdev/index.ts';
import { classHasParallelMana, isMobilityFormSpellId, isMobilityTravelForm } from '../../domain/character/forms.ts';

// SPELL_ATTR_DO_NOT_DISPLAY: hidden in spellbook, aura icon and combat log. Off matches the client;
// on is the debug view under Settings. Cite: SpellDefines.h:37; spellbook half in characterSpells.ts.
let showHiddenAuras = false;
export function setShowHiddenAuras(on: boolean): void { showHiddenAuras = on; }

export type DebuffChip = { spellId: number; remainingMs?: number; stacks?: number; charges?: number };

export type SessionViewHandles = {
  view: (f: Fighter) => CombatantView;
  memoView: (f: Fighter) => CombatantView;
  invalidateViewMemo: () => void;
  result: () => CombatResult;
  enemiesView: () => CombatantView[];
  alliesView: () => CombatantView[];
  debuffChipsOf: (f: Fighter) => DebuffChip[];
};

export function buildSessionView(ctx: CombatContext): SessionViewHandles {
  const stealthStrengthOf = (f: Fighter): number =>
    totalStealthStrength(f.stealthAuraStrength, f.stealthLevelBonus);

  // Hidden-aura ids. There is no spell registry on the context, so the defs exist only on the roster's
  // kits: fold them in whenever `fightersOrder()` hands back a new array, one identity compare after.
  const hiddenIds = ctx.hiddenAuraSpellIds;
  let foldedOrder: readonly Fighter[] | null = null;
  const foldedSpecs = new WeakSet<object>();
  const foldHiddenKits = (): void => {
    const order = ctx.fightersOrder();
    if (order === foldedOrder) return;
    foldedOrder = order;
    for (const u of order) {
      if (foldedSpecs.has(u.spec)) continue;
      foldedSpecs.add(u.spec);
      for (const sp of u.spec.spells) if (sp.hiddenClientside) hiddenIds.add(sp.id);
    }
  };
  /** True when this spell must draw no chip (and the debug toggle is not overriding it). */
  const hiddenChip = (id: number): boolean =>
    !showHiddenAuras && hiddenIds.size > 0 && hiddenIds.has(id);

  /** `effects.some(...)` over a frozen bake row, called per view of a casting unit. */
  const castHealCache = new WeakMap<SpellDef, boolean>();
  const castIsHeal = (s: SpellDef): boolean => {
    let hit = castHealCache.get(s);
    if (hit === undefined) {
      hit = s.effects.some((e) => e.kind === 'heal' || e.kind === 'restore_health');
      castHealCache.set(s, hit);
    }
    return hit;
  };
  // Almost always empty; the filter form built two arrays per view call to say so. Frozen
  // because it is SHARED by every empty view — a future push would corrupt all of them.
  const NO_HANDS = Object.freeze([]) as unknown as Array<'mainhand' | 'offhand'>;
  const imbuedHands = (f: Fighter, now: number): Array<'mainhand' | 'offhand'> => {
    const mh = f.weaponImbues.mainhand != null && f.weaponImbues.mainhand.expiresAt > now;
    const oh = f.weaponImbues.offhand != null && f.weaponImbues.offhand.expiresAt > now;
    if (!mh && !oh) return NO_HANDS;
    if (mh && oh) return ['mainhand', 'offhand'];
    return mh ? ['mainhand'] : ['offhand'];
  };

  // Possess Inv 17250 is a self-stun named Possess: hide the chip once the victim is done. Hoisted so
  // the debuff rail can be built without a whole view around it. Cite: boss_baroness_anastari.cpp:196.
  const hidePossessInvFor = (f: Fighter): ((id: number) => boolean) => {
    let possessing: boolean | undefined;
    return (id: number): boolean => {
      if (!isPossessInvSpell(id)) return false;
      if (possessing === undefined) {
        possessing = ctx.fightersOrder().some(
          (u) => u !== f && u.hp > 0 && ctx.isCharmed(u) && u.charmedBy === f.side,
        );
      }
      return !possessing;
    };
  };
  // The debuff rail for one unit, exactly as `view` emits it, split out so a caller needing only chips
  // does not build a view: one row was 3,117 of 9,407 view calls in a 300-tick 40-man fight.
  const debuffChipsFrom = (
    mine: readonly ActiveEffect[],
    hidePossessInv: (id: number) => boolean,
  ): DebuffChip[] => {
    const debuffs: Array<{ spellId: number; remainingMs?: number; stacks?: number; charges?: number }> = [];
    for (const e of mine) {
      if (e.broken || e.expiresAt <= ctx.t) continue;
      // Ice Block self-stun is a beneficial lockout — buffs list only (KI-709 / KI-538).
      if (
        e.kind === 'cc'
        && e.spellId != null
        && ICE_BLOCK_IDS.has(e.spellId | 0)
        && e.source === e.target
      ) {
        continue;
      }
      // Possess Inv 17250 is a self-stun named Possess — drop the chip when the victim is done.
      // Cite: boss_baroness_anastari.cpp:196 RemoveAurasDueToSpell(SPELL_POSSESS_INV).
      if (e.spellId != null && hidePossessInv(e.spellId)) continue;
      // SPELL_ATTR_DO_NOT_DISPLAY — same rule on the debuff rail.
      if (e.spellId != null && hiddenChip(e.spellId)) continue;
      const isDebuff = e.kind === 'dot' || e.kind === 'root' || e.kind === 'cc'
        // KI-113 / aura 33: hostile snares; explicit hostile:false is never a debuff (Stealth).
        || (e.kind === 'speed' && (e.hostile === true || (e.hostile == null && (e.pct ?? 0) < 0)))
        || (e.kind === 'buff' && isEnemySide(e.source) !== isEnemySide(e.target))
        // Hostile MOD_RESISTANCE on the foe (Curse of the Elements) — KI-765.
        || (e.kind === 'resist' && isEnemySide(e.source) !== isEnemySide(e.target))
        // Weakened Soul is same-side but a real debuff (rotation debuffPresent gate).
        || (e.kind === 'buff' && e.spellId === 6788)
        // Judgement of Light / Wisdom: hostile proc_trigger_spell on the judged target.
        // Cite: Paladin.cpp spell_judgement CastSpell JoL/JoW; player-visible debuff bar.
        || (e.kind === 'proc_trigger_spell'
          && isEnemySide(e.source) !== isEnemySide(e.target)
          && (e.onHitHeal != null || e.onHitMana != null)
          && e.expiresAt > ctx.t);
      if (!isDebuff) continue;
      // One chip per spellId: multi-school resist + damage-taken rider (CoE) share one icon.
      const sid = e.spellId as number;
      const remMs = Math.max(0, Math.round(e.expiresAt - ctx.t));
      const st = (e.stacks ?? 1) > 1 ? e.stacks : undefined;
      const ch = (e.charges != null && e.charges > 0) ? e.charges : undefined;
      const prior = debuffs.find((d) => d.spellId === sid);
      if (prior) {
        if (prior.remainingMs == null || remMs > (prior.remainingMs ?? 0)) prior.remainingMs = remMs;
        if (st != null && (prior.stacks == null || st > prior.stacks)) prior.stacks = st;
        if (ch != null && (prior.charges == null || ch > prior.charges)) prior.charges = ch;
        continue;
      }
      debuffs.push({ spellId: sid, remainingMs: remMs, stacks: st, ...(ch != null ? { charges: ch } : {}) });
    }
    return debuffs;
  };
  /** Same rail from the unit. `foldHiddenKits` is what the `hiddenChip` test in it needs. */
  const debuffChipsOf = (f: Fighter): DebuffChip[] => {
    foldHiddenKits();
    return debuffChipsFrom(ctx.effectsOn(f.side), hidePossessInvFor(f));
  };
  const view = (f: Fighter): CombatantView => {
    foldHiddenKits();
    // Built once per view, not once per buff id: inside the buffs map this allocated ~1200 throwaway
    // Sets a tick at 40 units, with view the top tick cost at 8.8%.
    const totemMarkers = ctx.totems.size > 0 && f.buffActive.size > 0
      ? totemSummonMarkerIds(ctx.totems.values())
      : null;
    // One pass each, into one array each. The map-then-filter form allocated four intermediate arrays
    // per unit per call on the tick's hottest function; predicates and order are unchanged.
    const mine = ctx.effectsOn(f.side);
    // One pass over the unit's effects instead of a find plus a some per buff id, which was
    // O(buffs x effects) closures per unit per tick. First-in-array-order matches what find returned.
    let liveByBuffSpell: Map<number, ActiveEffect> | null = null;
    let trapArmSpells: Set<number> | null = null;
    let chargesBySpell: Map<number, number> | null = null;
    if (f.buffActive.size > 0) {
      liveByBuffSpell = new Map();
      chargesBySpell = new Map();
      for (const e of mine) {
        if (e.spellId == null) continue;
        if (e.charges != null && e.charges > 0) {
          const prev = chargesBySpell.get(e.spellId) ?? 0;
          if (e.charges > prev) chargesBySpell.set(e.spellId, e.charges);
        }
        if (isHunterTrapArmProc(e)) (trapArmSpells ??= new Set()).add(e.spellId);
        if (liveByBuffSpell.has(e.spellId)) continue;
        if (
          e.kind === 'buff'
          || e.kind === 'restore_health' || e.kind === 'restore_power'
          || e.kind === 'school_absorb' || e.kind === 'mana_shield'
          || e.kind === 'damage_shield' || e.kind === 'proc_trigger_spell'
          || e.kind === 'immunity' || e.kind === 'resist' || e.kind === 'spell_magnet'
          // KI-113 / aura 33: Sprint + Stealth self-slow (hostile:false beats -pct).
          || (e.kind === 'speed' && (e.hostile === false || (e.hostile == null && (e.pct ?? 0) >= 0)))
        ) liveByBuffSpell.set(e.spellId, e);
      }
    }
    const hidePossessInv = hidePossessInvFor(f);
    const buffs: Array<{ spellId: number; remainingMs?: number; stacks?: number; charges?: number }> = [];
    for (const id of f.buffActive) {
      if (hidePossessInv(id)) continue;
      // SPELL_ATTR_DO_NOT_DISPLAY: the client draws no aura icon for these (Drowning Death 16563 rode
      // another frame as a permanent chip). `buffActive` is untouched, so rotation gates still read it.
      if (hiddenChip(id)) continue;
      // Buffs are mod buffs plus restore HoTs; prefer a buff-kind row and fall back so HoTs report
      // their remaining time. Weakened Soul 6788 is a self-side anti-stack debuff and is excluded.
      if (id === 6788) continue;
      // A totem SUMMON id is rotation bookkeeping, never an aura the caster carries: rendering one drew
      // a buff icon with no timer beside the real kit aura. The totem is surfaced by `totemsView()`.
      if (totemMarkers !== null && totemMarkers.has(id)) continue;
      // A hunter trap arm is a ground object, not a unit aura: rendering it drew Frost Trap on the
      // hunter with no trap on the floor. Cite: SpellEffects.cpp EffectSummonObject.
      if (trapArmSpells !== null && trapArmSpells.has(id)) continue;
      // Ghost Wolf chip without the form is a leftover display aura — not a live shapeshift.
      if (isMobilityFormSpellId(id) && !isMobilityTravelForm((f.form ?? 0) | 0)) continue;
      // Form/stance (formSpellId in buffActive) is until-cancelled — no effect row.
      if (id === f.formSpellId && f.form) {
        buffs.push({ spellId: id, remainingMs: undefined });
        continue;
      }
      const live = liveByBuffSpell?.get(id);
      if (live && live.kind === 'buff' && isEnemySide(live.source) !== isEnemySide(live.target)) continue; // hostile → debuffs list
      // Hostile −resist (CoE) is a debuff on the foe, not a buff-bar chip (KI-765).
      if (live && live.kind === 'resist' && isEnemySide(live.source) !== isEnemySide(live.target)) continue;
      // Infinite until-cancelled auras → omit remainingMs (persistent chip, no timer).
      let rem: number | undefined;
      if (live) {
        if (!Number.isFinite(live.expiresAt) || live.expiresAt >= Number.POSITIVE_INFINITY / 2) {
          rem = undefined;
        } else {
          rem = Math.max(0, Math.round(live.expiresAt - ctx.t));
        }
      }
      buffs.push({
        spellId: id,
        remainingMs: rem,
        stacks: live && (live.stacks ?? 1) > 1 ? live.stacks : undefined,
        ...(chargesBySpell?.get(id) != null ? { charges: chargesBySpell.get(id) } : {}),
      });
    }
    // spellId stays exactly what the effect carries (undefined on a few sourceless rows) — the
    // map() form emitted that too; the cast keeps the value, not just the type.
    const debuffs = debuffChipsFrom(mine, hidePossessInv);
    const mountDisplayId = isEnemySide(f.side)
      ? (ctx.enemyCastBySide.get(f.side as EnemySide)?.eventAi.mountDisplayId ?? 0) | 0
      : 0;
    const parallelMana = classHasParallelMana(f.spec.classId ?? 0) && f.maxMana > 0;
    return {
      side: f.side,
      name: f.spec.name,
      level: f.spec.level | 0,
      // Carried so a per-unit renderer draws the right creature per pack member instead of repeating
      // the primary's icon. Omitted when absent to keep the view shape byte-identical.
      ...(f.spec.creatureEntry != null ? { creatureEntry: f.spec.creatureEntry } : {}),
      // An ally seat holding OUR summon, so the map chip reads as a minion rather than a
      // dps party member. Spread-omitted so every other view row stays byte-identical.
      ...(f.spec.summonOwnerSide != null ? { summoned: true as const } : {}),
      // Group-composition metrics (meleeAllyCount for Windfury-class gates) read these.
      // Spread-omitted for solo fixtures: player/pet carry no groupRole and melee mode.
      ...(f.spec.groupRole != null ? { groupRole: f.spec.groupRole } : {}),
      // Raid subgroup, so frames box the group a party heal ACTUALLY reaches rather than display order.
      // Omitted for group 0 to keep the view shape byte-identical there — read it as subgroup ?? 0.
      ...(f.spec.subgroup ? { subgroup: f.spec.subgroup } : {}),
      ...(f.mode === 'ranged' ? { attackMode: 'ranged' as const } : {}),
      // Spread-omitted unless true so passive floor mobs and non-enemy views stay byte-identical.
      ...(isEnemySide(f.side) && f.hp > 0 && ctx.enemyHasThreat?.(f) ? { engaged: true } : {}),
      // Untargetable mid-mechanic (Jandice Summon Illusions hide 8s): the floor leash must not
      // count this as "no damage" and evade a boss that is simply in a scripted immune phase.
      ...(ctx.isUnattackable(f) ? { unattackable: true as const } : {}),
      hp: Number.isFinite(f.hp) ? Math.max(0, Math.round(f.hp)) : 0,
      maxHp: Math.max(1, f.spec.maxHealth | 0),
      power: Math.round(f.power), maxPower: f.spec.maxPower, powerType: f.spec.powerType,
      // A channel is a cast bar with the fill running the other way, so it reports on the same field
      // and every surface that draws a bar draws this one. Rotation gates can then see Mind Flay.
      casting: f.castingSpell ? {
        spellId: f.castingSpell.id, name: f.castingSpell.name, startedAt: f.castStartedAt, endsAt: f.castFinishAt,
        school: f.castingSpell.school,
        isHeal: castIsHeal(f.castingSpell),
      } : f.channeling && ctx.t < f.channeling.endsAt ? {
        spellId: f.channeling.spellId, name: f.channeling.name,
        startedAt: f.channeling.startedAt, endsAt: channelBarEndsAt(f.channeling),
        school: f.channeling.spell.school,
        isHeal: castIsHeal(f.channeling.spell),
        channeled: true as const,
      } : null,
      rooted: f.rootedUntil > ctx.t,
      controlled: (ctx.activeControl as (f: Fighter) => { control: ControlKind; until: number } | null)(f),
      mode: f.mode,
      autoAttack: f.autoAttackEnabled || undefined,
      // Hostile buff-kind auras land on the foe's team, so classify by team parity: caster team not
      // equal to bearer team is a debuff, which is where frames and rotation gates expect them.
      buffs,
      debuffs,
      comboPoints: f.comboPoints > 0 ? f.comboPoints : undefined,
      form: f.form || undefined,
      formSpellId: f.formSpellId || undefined,
      mana: parallelMana ? Math.round(f.spec.powerType === 'mana' ? f.power : f.mana) : undefined,
      maxMana: parallelMana ? f.maxMana : undefined,
      stealthed: f.stealthed || undefined,
      stealthStrength: f.stealthed ? stealthStrengthOf(f) : undefined,
      attackPower: Math.round(f.attackPower),
      // armor_pct (Stoneform / Pierce Armor / Enrage) is armorPctMod, not flat f.armor.
      // Cite: fighterEffectiveArmor; SpellAuras HandleModResistancePercent; KI-789/779.
      armor: Math.round(fighterEffectiveArmor(f)),
      weaponImbueHands: imbuedHands(f, ctx.t),
      dodgedRecently: ctx.t - f.lastDodgedAt <= RECENT_DODGE_MS || undefined,
      creatureType: f.creatureType || undefined,
      defenseReactRecently: ctx.t - f.lastDefenseReactAt <= RECENT_DEFENSE_REACT_MS || undefined,
      hunterParryRecently: ctx.t - f.lastHunterParryAt <= RECENT_DEFENSE_REACT_MS || undefined,
      ...(mountDisplayId > 0 ? { mountDisplayId, mounted: true as const } : {}),
    };
  };

  // Per-tick memo for the OUTWARD views. The UI asked for `enemiesView()` 125 times a second against 10
  // sim ticks — 8.9% of JS self time. Internal `ctx.view` stays uncached: snapshots run inside a step.
  const viewMemo = new Map<Fighter, CombatantView>();
  let enemiesViewMemo: CombatantView[] | null = null;
  let alliesViewMemo: CombatantView[] | null = null;
  const invalidateViewMemo = (): void => {
    if (viewMemo.size > 0) viewMemo.clear();
    enemiesViewMemo = null;
    alliesViewMemo = null;
  };
  const memoView = (f: Fighter): CombatantView => {
    let v = viewMemo.get(f);
    if (v === undefined) {
      v = view(f);
      viewMemo.set(f, v);
    }
    return v;
  };

  /** Display name for a side id, for the death roll. Falls back to the id when unresolvable. */
  const nameOfSide = (side: string): string => {
    if (side === 'pet') return ctx.pet?.spec.name ?? 'Pet';
    // Scanning allies then enemies left a totem unresolvable, so the roll printed `totem_fire`.
    return ctx.sideFighter?.(side as Side)?.spec.name ?? side;
  };

  const result = (): CombatResult => ({
    events: ctx.events, winner: (ctx.winner ?? 'timeout'), durationMs: ctx.t,
    ...(ctx.mechanicTally && ctx.mechanicTally.size > 0
      ? { mechanics: Object.fromEntries(ctx.mechanicTally) }
      : {}),
    // Same trim-proof tallies, same "absent when empty" rule so a fight that produced none
    // keeps its old result shape.
    ...(ctx.damageTakenBySide && ctx.damageTakenBySide.size > 0
      ? { damageTakenBySide: Object.fromEntries(ctx.damageTakenBySide) }
      : {}),
    // Names resolved HERE, not by the caller: sides and fighters are both in hand only inside
    // the session, and `enemy_3` as a killing blow tells a reader nothing.
    ...(ctx.deathRoll && ctx.deathRoll.length > 0
      ? {
        deaths: ctx.deathRoll.map((d) => ({
          side: d.side,
          name: nameOfSide(d.side),
          t: d.t,
          ...(d.cause ? { cause: d.cause } : {}),
          ...(d.by ? { by: d.by, byName: nameOfSide(d.by) } : {}),
        })),
        deathsTotal: ctx.deathsTotalOf?.() ?? ctx.deathRoll.length,
      }
      : {}),
    ...(ctx.eventsDropped ? { eventsDropped: ctx.eventsDropped } : {}),
    player: {
      hp: Math.max(0, Math.round(ctx.player.hp)),
      power: Math.round(ctx.player.power),
      form: ctx.player.form || undefined,
      mana: ctx.player.maxMana > 0
        ? Math.round(ctx.player.spec.powerType === 'mana' ? ctx.player.power : ctx.player.mana)
        : undefined,
      powerType: ctx.player.spec.powerType,
      combatSkills: ctx.player.spec.combatSkills
        ? { ...ctx.player.spec.combatSkills }
        : undefined,
    },
    ...(ctx.enemy ? {
      enemy: {
        hp: Math.max(0, Math.round(ctx.enemy.hp)),
        power: Math.round(ctx.enemy.power),
        // Post-morph entry (scriptdev UpdateEntry) so resolveFight credits the final form.
        ...(ctx.enemy.spec.creatureEntry != null ? { finalCreatureEntry: ctx.enemy.spec.creatureEntry } : {}),
      },
    } : {}),
    itemsConsumed: [...ctx.itemsSpent].map(([entry, count]) => ({ entry, count })),
    // Charges left on the units that SURVIVED the fight, so a half-spent Recombobulator does not come
    // back full next pull. Cite: Spell.cpp:4209 TakeCastItem SetSpellCharges.
    ...(() => {
      const rows = ctx.playerItems
        .filter((it) => it.charges != null && it.count > 0)
        .map((it) => ({ entry: it.entry, charges: it.charges! }));
      return rows.length > 0 ? { itemChargesLeft: rows } : {};
    })(),
    ...(ctx.itemsGained.size > 0
      ? { itemsGained: [...ctx.itemsGained].map(([entry, count]) => ({ entry, count })) }
      : {}),
    // M7: ally spends only — empty/absent when no ally consumed (solo goldens unchanged).
    ...(() => {
      // The RESULT is still keyed by ally index - combatSession.ts:2093 reconciles a companion's
      // inventory off it - so the seat is derived here at emit time. The storage is by side.
      const allyItemsConsumed: { allyIndex: number; entry: number; count: number }[] = [];
      let i = 0;
      for (const al of ctx.allyBlock()) {
        const spent = ctx.unitItemsSpent.get(al.side);
        if (spent) for (const [entry, count] of spent) allyItemsConsumed.push({ allyIndex: i, entry, count });
        i++;
      }
      return allyItemsConsumed.length > 0 ? { allyItemsConsumed } : {};
    })(),
    // The same seat derivation for what a fight PUT in a companion's bag (Drain Soul shards).
    ...(() => {
      const allyItemsGained: { allyIndex: number; entry: number; count: number }[] = [];
      let i = 0;
      for (const al of ctx.allyBlock()) {
        const got = ctx.unitItemsGained.get(al.side);
        if (got) for (const [entry, count] of got) allyItemsGained.push({ allyIndex: i, entry, count });
        i++;
      }
      return allyItemsGained.length > 0 ? { allyItemsGained } : {};
    })(),
    pet: ctx.pet
      ? {
        hp: ctx.petUnsummonedHp ?? Math.max(0, Math.round(ctx.pet.hp)),
        power: Math.round(ctx.pet.power),
        ...(ctx.petUnsummonedHp != null ? { unsummoned: true } : {}),
      }
      : null,
    soulShardsGained: ctx.soulShardsGained > 0 ? ctx.soulShardsGained : undefined,
    // Key present only for group sessions — solo CombatResult shape is unchanged.
    ...(ctx.allyBlock().length > 0
      ? { allies: ctx.allyBlock().map((al) => ({ hp: Math.max(0, Math.round(al.hp)), power: Math.round(al.power) })) }
      : {}),
  });

  // Off the store (E1.1): the seat arrays are gone, and these were their last product readers.
  const enemiesView = (): CombatantView[] =>
    (enemiesViewMemo ??= ctx.enemyBlock().map((ef) => memoView(ef)));
  const alliesView = (): CombatantView[] =>
    (alliesViewMemo ??= ctx.allyBlock().map((al) => memoView(al)));

  ctx.view = view;
  ctx.debuffChipsOf = debuffChipsOf;
  ctx.invalidateViewMemo = invalidateViewMemo;

  return { view, memoView, invalidateViewMemo, result, enemiesView, alliesView, debuffChipsOf };
}
